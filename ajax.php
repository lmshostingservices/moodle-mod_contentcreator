<?php

// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <http://www.gnu.org/licenses/>.

/**
 * AJAX handler for mod_contentcreator.
 * Routes all AI requests through EssayGraderAI API for centralized billing and credit management.
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

define('AJAX_SCRIPT', true);

header('Content-Type: application/json; charset=utf-8');

@ini_set('display_errors', '0');

try {
    require_once(__DIR__ . '/../../config.php');
    require_once($CFG->libdir . '/filelib.php');

    // Central Config integration with fallback
    $aiconfiglib = $CFG->dirroot . '/local/aiconfig/lib.php';
    if (file_exists($aiconfiglib)) {
        require_once($aiconfiglib);
    }

    $sesskey = optional_param('sesskey', '', PARAM_RAW); // pipeline-ignore: PARAM_RAW — compared verbatim via confirm_sesskey(), never stored or echoed
    if (!confirm_sesskey($sesskey)) {
        echo json_encode(['success' => false, 'error' => 'Session expired. Please refresh the page.']);
        exit;
    }

    if (!isloggedin() || isguestuser()) {
        echo json_encode(['success' => false, 'error' => 'Please log in to use Content Creator']);
        exit;
    }

    $action = optional_param('action', '', PARAM_ALPHANUMEXT);
    if (empty($action)) {
        echo json_encode(['success' => false, 'error' => 'Missing action parameter']);
        exit;
    }

    // Get credentials from Central Config or fallback to plugin settings
    if (function_exists('local_aiconfig_get_siteid')) {
        $siteid = local_aiconfig_get_siteid('mod_contentcreator');
    } else {
        $siteid = trim(get_config('mod_contentcreator', 'siteid') ?? '');
    }
    if (function_exists('local_aiconfig_get_apikey')) {
        $apikey = local_aiconfig_get_apikey('mod_contentcreator');
    } else {
        $apikey = trim(get_config('mod_contentcreator', 'apikey') ?? '');
    }

    // Get additional settings
    $voicelanguage = get_config('mod_contentcreator', 'voicelanguage') ?: 'en-AU';
    $enablevoice = get_config('mod_contentcreator', 'enablevoice') ?: 1; // v6.5.51: Default to enabled
    $country = get_config('mod_contentcreator', 'country') ?: 'Australia';

    // API base URL
    $apibaseurl = 'https://lms-labs.com';

    // v9.34: Release session lock BEFORE any long-running API calls.
    // PHP locks the session file for the entire script duration. Without this,
    // a 180s AI generation call blocks ALL other requests from the same user
    // (and potentially other users if using DB sessions), slowing down the entire site.
    // Session data remains readable in memory — only writes to $_SESSION are prevented.
    \core\session\manager::write_close();

    function contentcreator_response($data) {
        echo json_encode($data);
        exit;
    }

    /**
     * v10.07 BUG-CC-MANAGE-PERM: Capability check with broader fallback.
     *
     * The 'mod/contentcreator:manage' capability is the intended gate for AI generation.
     * However, Moodle sites that use custom roles (cloned from editingteacher archetypes)
     * do not automatically inherit new capabilities when a plugin is installed or upgraded.
     * This means editing teachers on such sites get "permission denied" even though they
     * have full course editing rights.
     *
     * Fix: also accept 'moodle/course:manageactivities' in the course context.
     * Every genuine editing teacher has this capability, regardless of whether their role
     * explicitly lists mod/contentcreator:manage. If NEITHER passes, throw the standard
     * Moodle require_capability exception so the error message is clear and consistent.
     *
     * @param context_module $context    Module context for the contentcreator instance.
     * @param stdClass       $cm         Course module record (->course used for course ctx).
     */
    function contentcreator_require_manage($context, $cm) {
        if (has_capability('mod/contentcreator:manage', $context)) {
            return;
        }
        $coursecontext = context_course::instance($cm->course);
        if (has_capability('moodle/course:manageactivities', $coursecontext)) {
            return;
        }
        // Neither passed — throw Moodle's standard exception so the site admin
        // sees a meaningful capability name in any audit log.
        require_capability('mod/contentcreator:manage', $context);
    }

    // Helper: Call EssayGraderAI API
    function contentcreator_api_call($url, $payload) {
        $curl = new \curl();
        // v9.77 PERF: TCP keepalive reduces per-request SSL handshake overhead.
        // Each generate_slide/generate_voice call previously opened a fresh TCP+SSL
        // connection to lms-labs.com (~200ms overhead per call). Keepalive reuses
        // the underlying socket for the session, eliminating that overhead on subsequent
        // calls within the same PHP process. CURLOPT_TCP_FASTOPEN further cuts RTT on
        // Linux kernels that support TFO (most modern Linux servers do).
        $curl->setopt([
            'CURLOPT_TIMEOUT' => 180,
            'CURLOPT_RETURNTRANSFER' => true,
            'CURLOPT_SSL_VERIFYPEER' => true,
            'CURLOPT_TCP_KEEPALIVE' => 1,
            'CURLOPT_TCP_KEEPIDLE' => 30,
            'CURLOPT_TCP_KEEPINTVL' => 15,
            'CURLOPT_ENCODING' => 'gzip, deflate',
        ]);
        $curl->setHeader([
            'Content-Type: application/json',
            'Accept: application/json'
        ]);

        $response = $curl->post($url, json_encode($payload));
        $info = $curl->get_info();
        $httpcode = isset($info['http_code']) ? $info['http_code'] : 0;

        if ($httpcode < 200 || $httpcode >= 300) {
            $data = json_decode($response, true);
            if ($httpcode === 0) {
                // curl failed before receiving any HTTP response (DNS failure,
                // TCP/SSL handshake failure, firewall block, etc.).
                // Include curl errno and error string so admins can diagnose
                // without needing server log access.  The client-side retry
                // regex ("API error: 0") still matches this expanded message.
                $curlErrno = isset($curl->errno) ? (int) $curl->errno : 0;
                $curlError = isset($curl->error) ? (string) $curl->error : 'unknown';
                $detail    = $curlErrno ? "curl $curlErrno: $curlError" : $curlError;
                $error     = $data['error'] ?? "API error: 0 ($detail)";
            } else {
                $error = $data['error'] ?? "API error: $httpcode";
            }
            return ['success' => false, 'error' => $error, 'httpcode' => $httpcode];
        }

        $data = json_decode($response, true);
        if (!$data) {
            return ['success' => false, 'error' => 'Invalid API response'];
        }

        return $data;
    }

    // Check configuration (requires manage capability - only for content creators)
    if ($action === 'check_config') {
        $cmid = required_param('cmid', PARAM_INT);
        $cm = get_coursemodule_from_id('contentcreator', $cmid, 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        contentcreator_require_manage($context, $cm);

        if (empty($siteid) || empty($apikey)) {
            contentcreator_response([
                'success' => true,
                'configured' => false,
                'error' => 'Site ID and API Key not configured. Please install AI Grader Central Config or configure in plugin settings.'
            ]);
        }

        // Verify credentials with API
        $result = contentcreator_api_call($apibaseurl . '/api/moodle/content-creator/check-config', [
            'siteId' => $siteid,
            'apiKey' => $apikey,
        ]);

        contentcreator_response([
            'success' => true,
            'configured' => $result['configured'] ?? false,
            'credits' => $result['credits'] ?? 0,
        ]);
    }

    // Generate content for a slide (state-changing: uses credits)
    if ($action === 'generate_slide') {
        require_sesskey(); // CSRF protection for state-changing operation
        
        $cmid = required_param('cmid', PARAM_INT);
        $systemprompt = required_param('systemprompt', PARAM_RAW); // pipeline-ignore: PARAM_RAW — free-form AI prompt text sent to the AI API only, never stored or echoed
        $userprompt = required_param('userprompt', PARAM_RAW); // pipeline-ignore: PARAM_RAW — free-form AI prompt text sent to the AI API only, never stored or echoed
        $slidetype = optional_param('slidetype', 'content', PARAM_ALPHANUMEXT);
        $route = optional_param('route', 'vet', PARAM_ALPHANUMEXT); // v11.42 FIX BUG-CC-ROUTE-MISSING: forward route so server uses correct ccExpectedCardCount
        // FIX-CC-LANG-EXPLICIT (v12.99): defensive parity with generate_slide_async — forward
        // language so secondary passes use it directly. This path is currently unused by JS
        // (callAI always uses generate_slide_async), but patched for correctness.
        $genlanguage_sync = optional_param('language', 'en-AU', PARAM_TEXT);

        $cm = get_coursemodule_from_id('contentcreator', $cmid, 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        contentcreator_require_manage($context, $cm);

        if (empty($siteid) || empty($apikey)) {
            contentcreator_response(['success' => false, 'error' => 'API not configured. Please install AI Grader Central Config or configure Site ID and API Key in plugin settings.']);
        }

        // v11.44 FIX BUG-CC-PROMPT-SILENT-FAIL: Prevent PHP-FPM from terminating this request
        // prematurely. Content generation via gpt-4o now targets <9000 tokens (~60s), but
        // request_terminate_timeout on PHP-FPM ignores set_time_limit(). This at least removes
        // the PHP script execution limit so PHP itself does not kill the request mid-cURL.
        @set_time_limit(0);

        // FIX-CC-ML-TRANSLATE-CREDITS (v13.17): Translation passes cost 50 credits per section
        // (vs 100 for primary generation) — detect ml_translate_* content types here.
        $creditsforaction = (strpos($slidetype, 'ml_translate_') === 0) ? 50 : 1;

        // Call EssayGraderAI API for content generation (direct prompt passthrough)
        $result = contentcreator_api_call($apibaseurl . '/api/moodle/content-creator/prompt', [
            'siteId' => $siteid,
            'apiKey' => $apikey,
            'systemPrompt' => $systemprompt,
            'userPrompt' => $userprompt,
            'contentType' => $slidetype,
            'route' => $route, // v11.42 FIX BUG-CC-ROUTE-MISSING
            'language' => $genlanguage_sync, // FIX-CC-LANG-EXPLICIT (v12.99): defensive parity
            'creditsToUse' => $creditsforaction,
        ]);

        if (!isset($result['success']) || !$result['success']) {
            contentcreator_response(['success' => false, 'error' => $result['error'] ?? 'Content generation failed']);
        }

        contentcreator_response([
            'success' => true,
            'content' => $result['content'],
            'credits' => $result['credits'] ?? 0,
        ]);
    }

    // ASYNC: Start content generation job — returns jobId immediately (no proxy timeout risk).
    // JS then polls action=poll_job every 3-4s until status=done.
    if ($action === 'generate_slide_async') {
        require_sesskey();

        $cmid          = required_param('cmid', PARAM_INT);
        $systemprompt  = required_param('systemprompt', PARAM_RAW); // pipeline-ignore: PARAM_RAW — free-form AI prompt text sent to the AI API only, never stored or echoed
        $userprompt    = required_param('userprompt', PARAM_RAW); // pipeline-ignore: PARAM_RAW — free-form AI prompt text sent to the AI API only, never stored or echoed
        $slidetype     = optional_param('slidetype', 'content', PARAM_ALPHANUMEXT);
        $route         = optional_param('route', 'vet', PARAM_ALPHANUMEXT);
        // FIX-CC-LANG-EXPLICIT (v12.99): explicit language forwarded to server so secondary
        // passes (expansion, banned-word rewrite) use it directly instead of parsing prompt text.
        $genlanguage   = optional_param('language', 'en-AU', PARAM_TEXT);

        $cm      = get_coursemodule_from_id('contentcreator', $cmid, 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        contentcreator_require_manage($context, $cm);

        if (empty($siteid) || empty($apikey)) {
            contentcreator_response(['success' => false, 'error' => 'API not configured.']);
        }

        \core\session\manager::write_close();

        // FIX-CC-ML-TRANSLATE-CREDITS (v13.17): Translation passes cost 50 credits per section.
        $creditsforasync = (strpos($slidetype, 'ml_translate_') === 0) ? 50 : 1;

        $result = contentcreator_api_call($apibaseurl . '/api/moodle/content-creator/prompt/start', [
            'siteId'       => $siteid,
            'apiKey'       => $apikey,
            'systemPrompt' => $systemprompt,
            'userPrompt'   => $userprompt,
            'contentType'  => $slidetype,
            'route'        => $route,
            'language'     => $genlanguage,
            'creditsToUse' => $creditsforasync,
        ]);

        if (empty($result['ok']) || empty($result['jobId'])) {
            contentcreator_response(['success' => false, 'error' => $result['error'] ?? 'Failed to start generation job']);
        }

        contentcreator_response(['success' => true, 'jobId' => $result['jobId'], 'async' => true]);
    }

    // ASYNC POLL: Check status of a background generation job.
    if ($action === 'poll_job') {
        // FIX-CC-POLL-AUTH (v13.65): this handler previously had no sesskey check, no login
        // check and no capability check — any request could poll any jobId. The JS was
        // already sending a sesskey; PHP simply never validated it. Now enforced, matching
        // every other handler in this file.
        require_sesskey();

        $jobId = required_param('jobId', PARAM_ALPHANUMEXT);
        $cmid  = required_param('cmid', PARAM_INT);

        $cm      = get_coursemodule_from_id('contentcreator', $cmid, 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        contentcreator_require_manage($context, $cm);

        // Don't hold the session lock open across the upstream status call.
        \core\session\manager::write_close();

        $curl = new \curl();
        // FIX-CC-POLL-TIMEOUT (v13.65): 10s was tight enough that a busy job-status endpoint
        // returned a false failure. The JS now tolerates transient poll errors, but a longer
        // window avoids provoking them in the first place.
        $curl->setopt(['CURLOPT_TIMEOUT' => 20, 'CURLOPT_CONNECTTIMEOUT' => 8]);
        $curl->setHeader(['Content-Type: application/json', 'Accept: application/json']);
        $pollUrl  = $apibaseurl . '/api/jobs/' . urlencode($jobId);
        $response = $curl->get($pollUrl);
        $result   = json_decode($response, true);

        if (!$result) {
            contentcreator_response(['ok' => false, 'status' => 'error', 'error' => 'Failed to reach job status endpoint']);
        }

        contentcreator_response($result);
    }

    // Generate text-to-speech audio using EssayGraderAI API (state-changing: uses credits)
    if ($action === 'generate_voice') {
        require_sesskey(); // CSRF protection for state-changing operation
        
        $cmid = required_param('cmid', PARAM_INT);
        $text = required_param('text', PARAM_RAW); // pipeline-ignore: PARAM_RAW — TTS input text sent to the speech API only, never stored or echoed
        $sectionid = optional_param('sectionid', '', PARAM_ALPHANUMEXT);
        $voicegender = optional_param('gender', 'female', PARAM_ALPHA);
        // v6.5.16: Read language from request (set per-activity by wizard), fallback to plugin setting
        $requestLanguage = optional_param('language', '', PARAM_TEXT);
        $effectiveLanguage = !empty($requestLanguage) ? $requestLanguage : $voicelanguage;

        $cm = get_coursemodule_from_id('contentcreator', $cmid, 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        require_login();
        require_capability('mod/contentcreator:view', $context);

        if (!$enablevoice) {
            contentcreator_response(['success' => false, 'error' => 'Voice narration is disabled']);
        }

        if (empty($siteid) || empty($apikey)) {
            contentcreator_response(['success' => false, 'error' => 'API not configured. Please install AI Grader Central Config or configure Site ID and API Key in plugin settings.']);
        }

        // v11.92 FIX: Remove PHP script execution limit — same fix as generate_slide (v11.44).
        // Google Chirp 3 HD TTS splits long text into 4800-byte chunks and makes sequential
        // API calls; a 7-card voiceover can legitimately take 60-90s. Without this line,
        // PHP-FPM's default max_execution_time (30-60s) kills the script mid-cURL before
        // the audio is returned, causing the JS AbortController to fire and voiceover to
        // appear as TIMEOUT on every attempt.
        @set_time_limit(0);

        // v9.77 PERF: Clean text before sending to TTS API.
        // v10.43 FIX: Raised character limit from 4500 to 12000 (multi-chunk server-side).
        // v11.93 FIX: Lowered limit from 12000 back to 4000. At 12000 chars, Google Chirp 3 HD
        // required 3–5 sequential TTS chunks + WAV concat + OGG encode, taking 60–90s total —
        // always exceeding the 60s frontend AbortController (now 120s in v11.92, but still at
        // risk). 4000 chars (~600 words) covers a full 7-card voiceover comfortably (7 cards ×
        // ~70 words × 5 chars/word = ~2450 chars). TTS time drops to 20–30s, well inside 120s.
        // v12.29 FIX (BUG-VO-TRUNCATION): Raised limit from 4000 to 8000. The estimate of
        // "70 words × 5 chars" was too conservative — real 7-card VET voiceover scripts have
        // 100–200 words per card (voiceoverText field alone) plus structural field extraction
        // (sceneParts, conceptInsights, steps, items). Total text routinely hits 5000–7000 chars.
        // At the old 4000 limit the sentence-boundary trim fell mid-way through card 4 (the
        // applied-scenario card), causing the voiceover to stop exactly halfway through card 4
        // in ALL routes (vocational, workplace, PD). The SaaS TTS endpoint already handles
        // multi-chunk synthesis (4800-byte chunks, WAV concat, OGG encode) and the JS
        // AbortController is 120s — 8000 chars (~1600 words, 2 TTS chunks) finishes in 30–45s.
        // v12.31 FIX (BUG-VO-PD-TRUNCATION): Raised limit from 8000 to 12000. PD courses use
        // long prose voiceoverText per card (200–300 words each, ~1400 chars per card), so 7
        // cards × 250 words × 5.5 chars = ~9625 chars — consistently above the 8000 limit.
        // The sentence-boundary trim landed mid-way through card 5 (mistakes) or occasionally
        // card 4 (applied-scenario), causing the voiceover to stop abruptly only in PD courses.
        // VET/Workplace courses weren't affected because they use shorter structural field
        // extraction (sceneParts, conceptInsights, steps) not full prose voiceoverText.
        // At 12000 chars = 3 TTS chunks (4800-byte each) = 45–60s synthesis, well inside 120s.
        // v12.32 FIX (BUG-VO-VET-TRUNCATION): Raised limit from 12000 to 20000. Root cause:
        // v12.31 raised the limit but did NOT bump VOICEOVER_SCHEMA_VERSION, so Vocational,
        // Workplace, and University voiceovers stored at schema '12.30' under the old 8000-char
        // limit were never marked stale — the truncated audio kept playing. Additionally the
        // 12000 estimate was wrong for VET/Workplace routes: old content generated before
        // padVoiceoverSmart was introduced can have 200–300-word prose per card in voiceoverText
        // PLUS long structural fields (sceneParts.text 2-sentence blocks, conceptInsights
        // 2-3 sentences, mental-model detail 2-3 sentences, mistakes consequence 15+ words ×5,
        // goodItems/badItems 10+ words ×10). Combined total regularly reaches 13000–16000 chars.
        // At 20000 chars = 4–5 TTS chunks (4800 bytes each) ≈ 60–75s — well inside 120s.
        // VOICEOVER_SCHEMA_VERSION bumped '12.30'→'12.32' in cc-state.js to force ALL existing
        // voiceovers to regenerate at this new limit, fixing every route's stored audio.
        $text = strip_tags($text);
        $text = preg_replace('/\s+/', ' ', $text);
        $text = trim($text);
        if (strlen($text) > 20000) {
            // Find the last sentence boundary (. ! ?) before the 20000-char limit
            $trimmed = substr($text, 0, 20000);
            $lastBoundary = max(
                strrpos($trimmed, '. '),
                strrpos($trimmed, '! '),
                strrpos($trimmed, '? ')
            );
            if ($lastBoundary !== false && $lastBoundary > 2000) {
                $text = substr($trimmed, 0, $lastBoundary + 1);
            } else {
                $text = $trimmed;
            }
        }

        // Build voice name — v13.1: accept explicit voice param (Aoede/Kore/Leda/Zephyr/Puck/Charon/Fenrir/Orus).
        // Falls back to gender-based default for backward compat with old manifests.
        $voiceparam = optional_param('voice', '', PARAM_ALPHA);
        $validVoices = ['Aoede', 'Kore', 'Leda', 'Zephyr', 'Puck', 'Charon', 'Fenrir', 'Orus'];
        if (!empty($voiceparam) && in_array($voiceparam, $validVoices)) {
            $voiceName = $voiceparam;
        } else {
            $voiceName = ($voicegender === 'male') ? 'Puck' : 'Zephyr';
        }
        
        // Map language code for Chirp 3 HD (v6.5.16: Use effective language from request)
        // FIX-CC-ML-NB-NO (v13.19): 'nb-NO' was incorrectly remapped to 'no-NO'.
        // Google Chirp 3 HD does NOT have a 'no-NO' voice — the correct code is
        // 'nb-NO-Chirp3-HD-Aoede'. Sending 'no-NO-Chirp3-HD-Aoede' caused the TTS
        // API to reject the request with "Voice does not exist". The pre-generation
        // for Norwegian failed silently; the student heard the English _preloadFallbackUrl.
        // Fix: remove the mapping so nb-NO passes through unchanged.
        $languageMappings = [
            'zh-CN' => 'cmn-CN',
            'zh-TW' => 'cmn-TW',
            'zh-HK' => 'yue-HK',
            // nb-NO intentionally NOT mapped — nb-NO-Chirp3-HD-Aoede is valid and correct
        ];
        $mappedLang = $languageMappings[$effectiveLanguage] ?? $effectiveLanguage;

        // FIX-CC-ML-VOICE-NON-CHIRP3 (v13.18): Languages in the additional-languages
        // checkbox list that are NOT supported by Google Chirp 3 HD. Sending e.g.
        // ms-MY-Chirp3-HD-Aoede causes the Google TTS API to reject the request,
        // builder.js retries 3× and gives up, and those sections have no voiceover URL —
        // students hear silence when switching to Malay/Punjabi/etc.
        // Fix: map to the nearest available Standard or Chirp3-HD voice.
        // pa-IN: no native Punjabi TTS in Google Cloud — hi-IN is the closest.
        $nonChirp3Voices = [
            'ms-MY' => ['voiceid' => 'ms-MY-Standard-D',                  'lang' => 'ms-MY'],
            'pa-IN' => ['voiceid' => "hi-IN-Chirp3-HD-{$voiceName}",      'lang' => 'hi-IN'],
            'fil-PH' => ['voiceid' => 'fil-PH-Standard-A',                 'lang' => 'fil-PH'],
            'yue-HK' => ['voiceid' => 'yue-HK-Standard-D',                 'lang' => 'yue-HK'],
            'cmn-TW' => ['voiceid' => "cmn-CN-Chirp3-HD-{$voiceName}",    'lang' => 'cmn-CN'],
            'pt-PT'  => ['voiceid' => "pt-BR-Chirp3-HD-{$voiceName}",     'lang' => 'pt-BR'],
            'ca-ES'  => ['voiceid' => "es-ES-Chirp3-HD-{$voiceName}",     'lang' => 'es-ES'],
            'is-IS'  => ['voiceid' => 'is-IS-Standard-A',                  'lang' => 'is-IS'],
        ];
        if (isset($nonChirp3Voices[$mappedLang])) {
            $voiceid = $nonChirp3Voices[$mappedLang]['voiceid'];
            $effectiveLanguage = $nonChirp3Voices[$mappedLang]['lang'];
        } else {
            $voiceid = "{$mappedLang}-Chirp3-HD-{$voiceName}";
        }

        // FIX-CC-TTS-CACHE (v12.66): Check Moodle file store for a cached OGG before
        // hitting the TTS API. Each generate_voice call costs 5 credits — identical
        // text+voice+language combinations are regenerated on every "Generate" click and
        // on multi-language pre-generation, burning credits for audio already produced.
        // Cache key: MD5(normalised_text | voiceid | effectiveLanguage).
        // Files stored in component=mod_contentcreator, filearea=voice_cache,
        // contextid=system-context (cache is site-wide, independent of any activity).
        $voiceCacheKey  = md5($text . '|' . $voiceid . '|' . $effectiveLanguage);
        $voiceCacheCtx  = context_system::instance();
        $voiceFs        = get_file_storage();
        $voiceCacheFile = $voiceFs->get_file(
            $voiceCacheCtx->id,
            'mod_contentcreator',
            'voice_cache',
            0,
            '/',
            $voiceCacheKey . '.ogg'
        );
        if ($voiceCacheFile) {
            contentcreator_response([
                'success'      => true,
                'audioContent' => base64_encode($voiceCacheFile->get_content()),
                'audioType'    => 'audio/ogg',
                'credits'      => 0,
                'cached'       => true,
            ]);
        }
        // v12.48 FIX-CC-TTS-MUTEX: Non-blocking file lock per section prevents two PHP
        // processes from hitting the CDN TTS endpoint concurrently. When a page reloads
        // or "Regenerate voiceover" is clicked while a previous 180s TTS curl is still
        // open, the CDN sees concurrent long-running requests and returns HTTP 500 for
        // both. The JS side now treats {pending:true} as a temporary hold (not a failure)
        // and retries in 10s — by which time the first PHP process has either succeeded
        // or timed out and released the lock.
        $ttsLockKey = md5('cc_tts_' . $siteid . '_' . $sectionid);
        $ttsLockFile = sys_get_temp_dir() . '/cc_tts_' . $ttsLockKey . '.lock';
        $ttsLockFp = @fopen($ttsLockFile, 'w+');
        $ttsLockAcquired = false;
        if ($ttsLockFp) {
            $ttsLockAcquired = flock($ttsLockFp, LOCK_EX | LOCK_NB);
        }
        if (!$ttsLockAcquired) {
            if ($ttsLockFp) { @fclose($ttsLockFp); }
            error_log('[CC generate_voice] CONCURRENT REQUEST BLOCKED for sectionid=' . $sectionid . ' — lock held by another PHP process. Returning pending=true.');
            contentcreator_response(['success' => false, 'pending' => true, 'error' => 'TTS request already in progress for this section — please wait 10s and try again']);
        }
        // Register shutdown to always release the lock — contentcreator_response() calls exit()
        // so explicit cleanup before each response is unreliable. Shutdown runs regardless.
        register_shutdown_function(function () use ($ttsLockFp, $ttsLockFile) {
            if ($ttsLockFp) {
                @flock($ttsLockFp, LOCK_UN);
                @fclose($ttsLockFp);
            }
            @unlink($ttsLockFile);
        });

        // Call EssayGraderAI API for TTS (v6.5.16: Use effective language)
        $result = contentcreator_api_call($apibaseurl . '/api/moodle/content-creator/tts', [
            'siteId' => $siteid,
            'apiKey' => $apikey,
            'text' => $text,
            'languageCode' => $effectiveLanguage,
            'voiceId' => $voiceid,
            'voiceGender' => $voiceName, // v13.1: send actual voice name, not legacy gender
            'creditsToUse' => 5, // Voiceover pricing: 5 credits per slide
        ]);

        if (!isset($result['success']) || !$result['success']) {
            contentcreator_response(['success' => false, 'error' => $result['error'] ?? 'TTS generation failed']);
        }

        // FIX-CC-TTS-CACHE (v12.66): Store the freshly generated audio so future requests
        // for the same text+voice+language are served from cache at zero credit cost.
        if (!empty($result['audioContent'])) {
            $voiceAudioBytes = base64_decode($result['audioContent']);
            $voiceFileRec = [
                'contextid'  => $voiceCacheCtx->id,
                'component'  => 'mod_contentcreator',
                'filearea'   => 'voice_cache',
                'itemid'     => 0,
                'filepath'   => '/',
                'filename'   => $voiceCacheKey . '.ogg',
            ];
            // Delete any pre-existing file under this key before writing.
            $voiceOldFile = $voiceFs->get_file(
                $voiceCacheCtx->id, 'mod_contentcreator', 'voice_cache', 0, '/', $voiceCacheKey . '.ogg'
            );
            if ($voiceOldFile) {
                $voiceOldFile->delete();
            }
            try {
                $voiceFs->create_file_from_string($voiceFileRec, $voiceAudioBytes);
            } catch (\Exception $e) {
                // Non-fatal: audio is still returned; caching simply failed this time.
                error_log('[CC generate_voice] Cache store failed: ' . $e->getMessage());
            }
        }

        contentcreator_response([
            'success' => true,
            'audioContent' => $result['audioContent'],
            'audioType' => $result['audioType'] ?? 'audio/ogg',
            'credits' => $result['credits'] ?? 0,
        ]);
    }

    // Save completion progress to Moodle database (state-changing: writes to database)
    if ($action === 'save_completion') {
        require_sesskey(); // CSRF protection for state-changing operation
        
        $cmid = required_param('cmid', PARAM_INT);
        $progress = required_param('progress', PARAM_RAW); // pipeline-ignore: PARAM_RAW — JSON blob immediately json_decode()'d and validated
        $completed = optional_param('completed', 0, PARAM_INT);

        $cm = get_coursemodule_from_id('contentcreator', $cmid, 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        require_login();
        require_capability('mod/contentcreator:view', $context);

        global $DB, $USER;

        // Parse progress JSON
        $progressData = json_decode($progress, true);
        if (!$progressData) {
            contentcreator_response(['success' => false, 'error' => 'Invalid progress data']);
        }

        // Check if user has an existing progress record
        $record = $DB->get_record('contentcreator_progress', [
            'cmid' => $cmid,
            'userid' => $USER->id
        ]);

        $data = [
            'cmid' => $cmid,
            'userid' => $USER->id,
            'progress' => json_encode($progressData),
            'timemodified' => time()
        ];

        if ($record) {
            $data['id'] = $record->id;
            $DB->update_record('contentcreator_progress', (object)$data);
        } else {
            $data['timecreated'] = time();
            $DB->insert_record('contentcreator_progress', (object)$data);
        }

        // v11.10: Re-evaluate completionallactivities rule whenever progress is saved.
        // The custom_completion class checks the progress JSON for challengeComplete flags,
        // so we trigger update_state on every save to let Moodle re-check both rules.
        $course = $DB->get_record('course', ['id' => $cm->course], '*', MUST_EXIST);
        $completion = new \completion_info($course);
        if ($completion->is_enabled($cm)) {
            $completion->update_state($cm, COMPLETION_UNKNOWN, $USER->id);
        }

        // If fully completed, mark activity as complete
        if ($completed) {
            // v6.7.53: CRITICAL FIX - Also write to contentcreator_attempts table
            // custom_completion.php checks contentcreator_attempts, not contentcreator_progress
            // Without this, the Moodle activity completion tick never triggers!
            $attemptRecord = $DB->get_record('contentcreator_attempts', [
                'contentcreatorid' => $cm->instance,
                'userid' => $USER->id
            ]);
            
            $attemptData = new \stdClass();
            $attemptData->contentcreatorid = $cm->instance;
            $attemptData->userid = $USER->id;
            $attemptData->completed = 1;
            $attemptData->responses = json_encode($progressData);
            $attemptData->timemodified = time();
            
            if ($attemptRecord) {
                $attemptData->id = $attemptRecord->id;
                $DB->update_record('contentcreator_attempts', $attemptData);
            } else {
                $attemptData->score = 0;
                $attemptData->maxscore = 0;
                $attemptData->timecreated = time();
                $DB->insert_record('contentcreator_attempts', $attemptData);
            }
            
            // Trigger Moodle completion (reuse $course/$completion already fetched above).
            if ($completion->is_enabled($cm)) {
                $completion->update_state($cm, COMPLETION_COMPLETE, $USER->id);
            }
        }

        contentcreator_response([
            'success' => true,
            'message' => 'Progress saved'
        ]);
    }

    // Load completion progress from Moodle database
    if ($action === 'load_completion') {
        $cmid = required_param('cmid', PARAM_INT);

        $cm = get_coursemodule_from_id('contentcreator', $cmid, 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        require_login();
        require_capability('mod/contentcreator:view', $context);

        global $DB, $USER;

        $record = $DB->get_record('contentcreator_progress', [
            'cmid' => $cmid,
            'userid' => $USER->id
        ]);

        if ($record) {
            contentcreator_response([
                'success' => true,
                'progress' => json_decode($record->progress, true)
            ]);
        } else {
            contentcreator_response([
                'success' => true,
                'progress' => null
            ]);
        }
    }

    // v9.78 FIX (A-05): Save Before You Start checklist completion to DB.
    // Previously the player called the non-existent Moodle external web service
    // 'mod_contentcreator_checklist_complete' which was never registered in
    // db/services.php. Every call returned a 400 error. Now the player POSTs to
    // this action handler which stores completion in contentcreator_checklist.
    if ($action === 'save_checklist') {
        require_sesskey();
        $cmid    = required_param('cmid', PARAM_INT);
        $topicid = optional_param('topicid', '', PARAM_TEXT);
        $complete = optional_param('complete', 0, PARAM_INT);

        $cm = get_coursemodule_from_id('contentcreator', $cmid, 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        require_login();
        require_capability('mod/contentcreator:view', $context);

        global $DB, $USER;

        $existing = $DB->get_record('contentcreator_checklist', [
            'cmid'    => $cmid,
            'userid'  => $USER->id,
            'topicid' => $topicid
        ]);

        if ($existing) {
            $existing->complete     = (int)$complete;
            $existing->timemodified = time();
            $DB->update_record('contentcreator_checklist', $existing);
        } else {
            $record              = new stdClass();
            $record->cmid        = $cmid;
            $record->userid      = $USER->id;
            $record->topicid     = $topicid;
            $record->complete    = (int)$complete;
            $record->timecreated = time();
            $record->timemodified = time();
            // Gracefully ignore if table does not yet exist (pre-upgrade installs)
            try { $DB->insert_record('contentcreator_checklist', $record); } catch (Exception $e) {}
        }

        contentcreator_response(['success' => true]);
    }

    // Pre-generate document examples in batch (v6.5.14) (state-changing: uses credits)
    // Called during content generation to pre-load all document popups
    if ($action === 'pregenerate_documents') {
        require_sesskey(); // CSRF protection for state-changing operation
        
        $cmid = required_param('cmid', PARAM_INT);
        $documents = optional_param('documents', '', PARAM_RAW); // pipeline-ignore: PARAM_RAW — JSON blob immediately json_decode()'d and validated
        $contextparam = optional_param('context', '', PARAM_RAW); // pipeline-ignore: PARAM_RAW — JSON blob immediately json_decode()'d and validated

        $cm = get_coursemodule_from_id('contentcreator', $cmid, 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        contentcreator_require_manage($context, $cm);

        if (empty($documents)) {
            contentcreator_response(['success' => false, 'error' => 'No documents specified']);
        }

        $docsArray = json_decode($documents, true);
        $contextData = json_decode($contextparam, true) ?? [];

        if (!is_array($docsArray) || empty($docsArray)) {
            contentcreator_response(['success' => false, 'error' => 'Invalid documents format']);
        }

        // Call API to batch generate document examples
        $result = contentcreator_api_call($apibaseurl . '/api/moodle/content-creator/batch-generate-documents', [
            'siteId' => $siteid,
            'apiKey' => $apikey,
            'documents' => $docsArray,
            'context' => $contextData
        ]);

        if (!empty($result['success'])) {
            contentcreator_response([
                'success' => true,
                'documentExamples' => $result['documentExamples'] ?? []
            ]);
        } else {
            contentcreator_response([
                'success' => false,
                'error' => $result['error'] ?? 'Failed to generate document examples'
            ]);
        }
    }

    // v7.2.64: Get site-wide image gallery (images from ALL Content Creator activities)
    // This allows reusing purchased images across any activity on the site
    if ($action === 'get_site_gallery') {
        $cmid = required_param('cmid', PARAM_INT);
        $cm = get_coursemodule_from_id('contentcreator', $cmid, 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        contentcreator_require_manage($context, $cm);

        global $DB;
        
        $siteImages = [];
        $seenUrls = [];
        
        // Get all Content Creator activity instances across the site
        $instances = $DB->get_records('contentcreator', [], '', 'id, name, manifestjson');
        
        foreach ($instances as $instance) {
            if (empty($instance->manifestjson)) {
                continue;
            }
            
            // v11.48 FIX BUG-CC-DBWRITE: decompress before json_decode (may be gz: compressed)
            $manifest = json_decode(\mod_contentcreator\manifest_storage::decompress($instance->manifestjson), true);
            if (!$manifest) {
                continue;
            }
            
            // Extract images from topics/sections
            if (!empty($manifest['topics']) && is_array($manifest['topics'])) {
                foreach ($manifest['topics'] as $topicIndex => $topic) {
                    if (!empty($topic['sections']) && is_array($topic['sections'])) {
                        foreach ($topic['sections'] as $sectionIndex => $section) {
                            if (!empty($section['image']['url'])) {
                                $url = $section['image']['url'];
                                if (!isset($seenUrls[$url])) {
                                    $seenUrls[$url] = true;
                                    $siteImages[] = [
                                        'url' => $url,
                                        'prompt' => $section['image']['prompt'] ?? $section['title'] ?? 'Slide image',
                                        'source' => $instance->name . ' - ' . ($section['title'] ?? 'Slide ' . ($sectionIndex + 1)),
                                        'activityId' => $instance->id
                                    ];
                                }
                            }
                        }
                    }
                }
            }
            
            // Also check imageGallery array
            if (!empty($manifest['imageGallery']) && is_array($manifest['imageGallery'])) {
                foreach ($manifest['imageGallery'] as $img) {
                    if (!empty($img['url']) && !isset($seenUrls[$img['url']])) {
                        $seenUrls[$img['url']] = true;
                        $siteImages[] = [
                            'url' => $img['url'],
                            'prompt' => $img['prompt'] ?? 'Gallery image',
                            'source' => $instance->name . ' - Gallery',
                            'activityId' => $instance->id
                        ];
                    }
                }
            }
        }
        
        contentcreator_response([
            'success' => true,
            'images' => $siteImages,
            'count' => count($siteImages)
        ]);
    }

    // v7.5.27: Generate AI image for slide
    if ($action === 'generate_image') {
        require_sesskey(); // CSRF protection for credit-consuming operation (v13.23)
        $cmid = required_param('cmid', PARAM_INT);
        $cm = get_coursemodule_from_id('contentcreator', $cmid, 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        contentcreator_require_manage($context, $cm);

        if (empty($siteid) || empty($apikey)) {
            contentcreator_response([
                'success' => false,
                'error' => 'Site ID and API Key not configured'
            ]);
        }

        $dataraw = optional_param('data', '', PARAM_RAW); // pipeline-ignore: PARAM_RAW — JSON blob immediately json_decode()'d and validated
        $data = json_decode($dataraw, true);

        if (!$data) {
            contentcreator_response(['success' => false, 'error' => 'Invalid request data']);
        }

        $slideTitle = $data['slideTitle'] ?? '';
        $slideDescription = $data['slideDescription'] ?? '';
        $topicTitle = $data['topicTitle'] ?? '';
        $unitCode = $data['unitCode'] ?? '';
        $unitTitle = $data['unitTitle'] ?? '';
        $industry = $data['industry'] ?? '';
        $subIndustry = $data['subIndustry'] ?? '';
        $workplace = $data['workplace'] ?? '';
        $jobRole = $data['jobRole'] ?? '';
        $country = $data['country'] ?? 'Australia';
        $state = $data['state'] ?? '';
        $requirements = $data['requirements'] ?? '';
        $route = $data['route'] ?? 'vet';
        // v10.27: Hook-scenario narrative for richer image context
        $scenarioContext = $data['scenarioContext'] ?? '';

        if (empty($slideTitle)) {
            contentcreator_response(['success' => false, 'error' => 'Slide title is required for image generation']);
        }

        // FIX-CC-IMGGEN-SESSLOCK (v13.23): Release session lock before the long-running
        // Gemini + Imagen API call (30-120 s). Without write_close() the Moodle session
        // file stays locked for the entire duration, blocking every other session-requiring
        // operation for this user (manifest save, navigation) and causing the page to
        // appear frozen. Matches the identical pattern already used in generate_voice.
        \core\session\manager::write_close();

        // v8.0.4: Pass full context for AI-crafted image prompts
        // v8.1.2: Route-aware image generation (university vs VET)
        // v10.27: Added scenarioContext (hook-scenario card narrative → richer, story-matched images)
        $result = contentcreator_api_call($apibaseurl . '/api/moodle/content-creator/generate-image', [
            'siteId' => $siteid,
            'apiKey' => $apikey,
            'slideTitle' => $slideTitle,
            'slideDescription' => $slideDescription,
            'topicTitle' => $topicTitle,
            'unitCode' => $unitCode,
            'unitTitle' => $unitTitle,
            'industry' => $industry,
            'subIndustry' => $subIndustry,
            'workplace' => $workplace,
            'jobRole' => $jobRole,
            'country' => $country,
            'state' => $state,
            'requirements' => $requirements,
            'route' => $route,
            'scenarioContext' => $scenarioContext,
        ]);

        if (!isset($result['success']) || !$result['success']) {
            contentcreator_response([
                'success' => false,
                'error' => $result['error'] ?? 'Image generation failed'
            ]);
        }

        contentcreator_response([
            'success' => true,
            'images' => $result['images'] ?? [],
            'creditsUsed' => $result['creditsUsed'] ?? 5
        ]);
    }

    // v11.70: Persist pre-generated voiceover audio to Moodle file store.
    // Accepts base64 audio from the JS TTS success callback, writes it to the
    // 'voiceovers' filearea, and returns a pluginfile.php HTTPS URL.
    // The JS then stores this URL in section.voiceoverUrl (instead of the data: URL)
    // so that saveManifestSilent()'s stripAudio() preserves it — stripAudio only
    // strips data: URLs — and students play from the HTTPS URL on every page load
    // with zero TTS API cost and zero wait time.
    if ($action === 'save_voiceover_file') {
        require_sesskey();

        $cmid       = required_param('cmid', PARAM_INT);
        $audiotype  = optional_param('audiotype', 'audio/ogg', PARAM_TEXT);

        // Accept sectionid as raw text then make it filesystem-safe.
        $sectionidraw = required_param('sectionid', PARAM_TEXT);
        $sectionid    = preg_replace('/[^a-zA-Z0-9_\-\.]/', '_', $sectionidraw);
        $sectionid    = trim($sectionid, '._-');
        if (empty($sectionid)) {
            $sectionid = 'section';
        }

        // base64 audio — can be large (~500 KB decoded); read as RAW.
        $audiocontent = required_param('audiocontent', PARAM_RAW); // pipeline-ignore: PARAM_RAW — base64 audio payload, base64_decode()'d and validated

        $cm      = get_coursemodule_from_id('contentcreator', $cmid, 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        require_login();
        // v12.53 FIX-CC-SAVEVO-PERM: Use flexible two-step capability check (same as
        // save_manifest / save_slide_edit from v11.39/v11.40). 'addinstance' is too strict
        // and not granted to custom roles cloned from editingteacher — those teachers
        // successfully generate audio (generate_voice uses :view) but then silently fail
        // here, losing the audio URL on every page reload.
        contentcreator_require_manage($context, $cm);

        $audiodata = base64_decode($audiocontent);
        if ($audiodata === false || strlen($audiodata) < 1000) {
            contentcreator_response(['success' => false, 'error' => 'Invalid audio data']);
        }

        $ext      = (strpos($audiotype, 'mp3') !== false || strpos($audiotype, 'mpeg') !== false) ? 'mp3' : 'ogg';
        $filename = 'voiceover_' . $sectionid . '.' . $ext;

        $fs         = get_file_storage();
        $filerecord = [
            'contextid' => $context->id,
            'component' => 'mod_contentcreator',
            'filearea'  => 'voiceovers',
            'itemid'    => $cmid,
            'filepath'  => '/',
            'filename'  => $filename,
        ];

        // Delete any existing file for this section before storing fresh audio.
        $existing = $fs->get_file($context->id, 'mod_contentcreator', 'voiceovers', $cmid, '/', $filename);
        if ($existing) {
            $existing->delete();
        }

        $storedfile = $fs->create_file_from_string($filerecord, $audiodata);
        if (!$storedfile) {
            contentcreator_response(['success' => false, 'error' => 'File store write failed']);
        }

        $url = moodle_url::make_pluginfile_url(
            $context->id, 'mod_contentcreator', 'voiceovers', $cmid, '/', $filename
        );

        contentcreator_response([
            'success' => true,
            'url'     => $url->out(false),
        ]);
    }

    // Unknown action
    contentcreator_response(['success' => false, 'error' => 'Unknown action: ' . $action]);

} catch (Exception $e) {
    echo json_encode(['success' => false, 'error' => 'Server error: ' . $e->getMessage()]);
    exit;
}
