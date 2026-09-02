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
 * Content Creator - Generate voiceover external function
 * Routes through EssayGraderAI API for centralized billing and credit management.
 * Supports male/female voice selection via Chirp 3 HD.
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace mod_contentcreator\external;

defined('MOODLE_INTERNAL') || die();

global $CFG;
require_once($CFG->libdir . '/filelib.php');

use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_single_structure;
use core_external\external_value;
use context_module;

/**
 * External function that synthesises slide voiceover audio via the vendor TTS service.
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class generate_voiceover extends external_api {
    /**
     * Maximum number of characters accepted for a single voiceover request.
     *
     * Must match MOD_CONTENTCREATOR_VOICE_MAXCHARS in ajax.php. This bounds one
     * request; abuse is prevented by the manage capability and the rate
     * limiter. Lowering it truncates audio mid-sentence.
     */
    const MAX_TEXT_LENGTH = 20000;

    /** Maximum size in bytes of a cached audio file. */
    const MAX_CACHE_BYTES = 10485760;

    /**
     * Describes the parameters for execute().
     *
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters(
            [
                'cmid'      => new external_value(PARAM_INT, 'Course module ID'),
                'text'      => new external_value(
                    PARAM_RAW, // Pipeline-ignore: PARAM_RAW - JSON or free-form text, decoded and validated on use.
                    'Text to convert to speech',
                ),
                'sectionId' => new external_value(PARAM_ALPHANUMEXT, 'Section identifier', VALUE_DEFAULT, ''),
                // FIX-CC-EXTVO-LANG (v12.78): language was appended to formData in player5.js
                // (line 2009: formData.append('language', self.activeLang || self.voiceLanguage))
                // but was never declared in execute_parameters() — Moodle's external API
                // silently stripped it, so execute() never received it.  The function then
                // always fell back to get_config('mod_contentcreator', 'voicelanguage')
                // (the site-level primary language, typically 'en-AU'), causing additional-
                // language voiceovers to be synthesised in English regardless of which
                // language tab the teacher or student had selected.
                'language'  => new external_value(PARAM_TEXT, 'Language code override (e.g. fr-FR, ja-JP)', VALUE_DEFAULT, ''),
                // Version 13.1: explicit voice name (Aoede/Kore/Leda/Zephyr/Puck/Charon/Fenrir/Orus).
                // Falls back to site-level default when not supplied.
                // FIX-CC-SUBTOPIC-BILLING-KEY (v13.95.2): the subtopic this narration belongs
                // to, so the vendor can tell a first voiceover - covered by the subtopic's
                // price - from a regeneration, which is charged. Optional: an older client
                // that omits it is priced exactly as before.
                'subtopicKey' => new external_value(
                    PARAM_ALPHANUMEXT,
                    'Billing key of the subtopic this audio belongs to',
                    VALUE_DEFAULT,
                    ''
                ),
                'voice'     => new external_value(PARAM_ALPHA, 'Chirp 3 HD voice name', VALUE_DEFAULT, ''),
            ]
        );
    }

    /**
     * Synthesise voiceover audio for the supplied text.
     *
     * @param int $cmid Course module id.
     * @param string $text Text to convert to speech.
     * @param string $sectionid Section identifier the audio belongs to.
     * @param string $language Language code override, for example 'fr-FR'.
     * @param string $voice Chirp 3 HD voice name.
     * @param string $subtopickey Billing key of the subtopic this audio belongs to.
     * @return array Result structure as described by execute_returns().
     */
    public static function execute(
        int $cmid,
        string $text,
        string $sectionid = '',
        string $language = '',
        string $voice = '',
        string $subtopickey = ''
    ): array {
        global $CFG, $USER;

        $params = self::validate_parameters(
            self::execute_parameters(),
            [
                'cmid'      => $cmid,
                'text'      => $text,
                'sectionId' => $sectionid,
                'language'  => $language,
                'voice'     => $voice,
                'subtopicKey' => $subtopickey,
            ]
        );

        $cm = get_coursemodule_from_id('contentcreator', $params['cmid'], 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        self::validate_context($context);

        require_capability('mod/contentcreator:view', $context);

        // V13.85: This call SPENDS SITE CREDITS. Gating it on :view alone meant every
        // enrolled learner in every course could draw on the same paid balance, with no
        // administrative control beyond disabling the feature site-wide. The new
        // capability is granted to student by default, so behaviour is unchanged until a
        // site chooses to prohibit it for a role, course or cohort.
        // V13.90.1 FIX-CACHE-ORDER: the :generateondemand capability check and BOTH rate
        // limiters used to run here, ahead of the cache lookup further down. ajax.php has
        // always had this the right way round (cache first, gates only on a miss), and
        // this endpoint - the mobile app and web-service path - had it inverted.
        //
        /*
         * Two consequences, both real:
         *   1. A cache HIT costs zero credits but still consumed a slot in the shared
         *      site:voice bucket. Sixty students replaying a narrated activity could
         *      exhaust the site ceiling in an hour and stop voiceover generation for
         *      everyone, teachers in the web builder included.
         *   2. A site that prohibits :generateondemand for students - which the
         *      capability's own description invites - broke playback of audio that was
         *      already generated and free to serve. Web players kept working; the app
         *      went silent.
         */
        //
        // The gates now sit immediately before the billed vendor call, after the cache
        // lookup. See "BILLED PATH BEGINS" below.

        // Version 6.5.51: Default to enabled when setting not configured.
        $enablevoice = get_config('mod_contentcreator', 'enablevoice') ?: 1;
        if (!$enablevoice) {
            return [
                'success'      => false,
                'audioContent' => '',
                'audioType'    => '',
                'error'        => get_string('errorvoicedisabled', 'mod_contentcreator'),
            ];
        }

        // Central Config integration with fallback.
        $aiconfiglib = $CFG->dirroot . '/local/aiconfig/lib.php';
        if (file_exists($aiconfiglib)) {
            require_once($aiconfiglib);
        }

        // Get credentials from Central Config or fallback to plugin settings.
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

        if (empty($siteid) || empty($apikey)) {
            return [
                'success'      => false,
                'audioContent' => '',
                'audioType'    => '',
                'error'        => get_string('errornotconfigured', 'mod_contentcreator'),
            ];
        }

        // FIX-CC-EXTVO-LANG (v12.78): Use the language sent by the JS caller when
        // present; fall back to the site-level plugin setting only when no override
        // is provided.  This is the missing link that caused additional-language
        // (French, Japanese, Spanish, etc.) voiceovers to be synthesised in English.
        $sitelanguage  = get_config('mod_contentcreator', 'voicelanguage') ?: 'en-AU';
        $voicelanguage = !empty(trim($params['language'])) ? trim($params['language']) : $sitelanguage;

        // Version 13.1: resolve voice name. Priority:
        // 1. Explicit voice param from JS caller (e.g. 'Kore', 'Fenrir')
        // 2. Site-level voicegender config (may be a voice name or legacy 'male'/'female')
        // 3. Ultimate fallback: Zephyr.
        $validvoices     = ['Aoede', 'Kore', 'Leda', 'Zephyr', 'Puck', 'Charon', 'Fenrir', 'Orus'];
        $sitevoiceconfig = get_config('mod_contentcreator', 'voicegender') ?: 'Zephyr';
        // Handle legacy binary gender values stored before v13.1.
        if ($sitevoiceconfig === 'male') {
            $sitedefaultvoice = 'Puck';
        } else if ($sitevoiceconfig === 'female') {
            $sitedefaultvoice = 'Zephyr';
        } else if (in_array($sitevoiceconfig, $validvoices)) {
            $sitedefaultvoice = $sitevoiceconfig;
        } else {
            $sitedefaultvoice = 'Zephyr';
        }
        $voiceparam = trim($params['voice'] ?? '');
        $voicename  = (in_array($voiceparam, $validvoices)) ? $voiceparam : $sitedefaultvoice;

        // Build the voice ID: {language}-Chirp3-HD-{VoiceName}.
        // V13.94.3: this used to call a private copy of the mapping that omitted the
        // fallbacks for the eight locales Chirp 3 HD has no voice for, so this path asked
        // for ids such as 'ms-MY-Chirp3-HD-Zephyr'. The service rejects them and the
        // learner gets silence, while the identical request through ajax.php worked. Both
        // paths now resolve through the one shared table.
        $resolvedvoice = \mod_contentcreator\voice::resolve($voicelanguage, $voicename);
        $voiceid = $resolvedvoice['voiceid'];
        $voicelanguage = $resolvedvoice['language'];

        // Clean text and enforce the same character cap that ajax.php applies.
        $text = strip_tags($params['text']);
        $text = preg_replace('/\s+/', ' ', $text);
        $text = trim($text);
        if (\core_text::strlen($text) > self::MAX_TEXT_LENGTH) {
            return [
                'success'      => false,
                'audioContent' => '',
                'audioType'    => '',
                'error'        => get_string('errortexttoolong', 'mod_contentcreator', self::MAX_TEXT_LENGTH),
            ];
        }

        // FIX-CC-EXTVO-CACHE (v12.84): This external API previously had no file cache -
        // every call hit the TTS API and charged credits even for identical text+language.
        // Cache key: MD5(text | voiceid | language) - same scheme as ajax.php.
        //
        // V13.86: this used to cache into the MODULE context under itemid = cm->id while
        // ajax.php cached identical audio into the SYSTEM context under itemid 0. The
        // same text was therefore billed twice, once per path, and neither path could see
        // the other's copy. Both now share the one site-wide cache, which is the correct
        // scope: the audio depends only on text, voice and language, never on the course
        // or the activity. Pruning is handled by the scheduled task added in v13.86.
        $cachekey  = md5($text . '|' . $voiceid . '|' . $voicelanguage);
        $cachectx  = \context_system::instance();
        $fs        = get_file_storage();
        $cachefile = $fs->get_file(
            $cachectx->id,
            'mod_contentcreator',
            'voice_cache',
            0,
            '/',
            $cachekey . '.ogg'
        );
        if ($cachefile) {
            return [
                'success'      => true,
                'audioContent' => base64_encode($cachefile->get_content()),
                'audioType'    => 'audio/ogg',
                'error'        => '',
            ];
        }

        // ---------------------------------------------------------------------
        // BILLED PATH BEGINS. Everything past this point spends site credits, so
        // the capability gate and the rate limiters live here rather than at the
        // top of the function - a cache hit above must cost nothing and must not
        // be blocked. Mirrors ajax.php's ordering. See FIX-CACHE-ORDER above.
        require_capability('mod/contentcreator:generateondemand', $context);

        // This endpoint spends site credits (5 per call) and is available to any user who
        // can view the activity, so abuse control is enforced here rather than by the
        // capability gate: a per-user sliding-window limit plus the MAX_TEXT_LENGTH cap
        // applied to the text above. Do not remove either without replacing them.
        // V13.94.3: the per-user ceiling was hardcoded at 100 here, so the ratelimitvoice
        // admin setting applied only to the AJAX path - an administrator who lowered it, or
        // set it to 0 to disable the bucket, changed nothing for this web service. enforce()
        // reads the setting and applies the site ceiling in one place, shared with ajax.php.
        \mod_contentcreator\ratelimiter::enforce($USER->id, 'voice', 100, HOURSECS);

        // Release session lock before long-running API call to prevent blocking other requests.
        \core\session\manager::write_close();

        // Call EssayGraderAI API for TTS.
        $curl = new \curl();
        $curl->setopt(
            [
                'CURLOPT_TIMEOUT'       => 300,
                'CURLOPT_RETURNTRANSFER' => true,
                'CURLOPT_SSL_VERIFYPEER' => true,
            ]
        );
        $curl->setHeader(
            [
                'Content-Type: application/json',
                'Accept: application/json',
            ]
        );

        $payload = [
            'siteId'       => $siteid,
            'apiKey'       => $apikey,
            'text'         => $text,
            'languageCode' => $voicelanguage,
            'voiceId'      => $voiceid,
            'voiceGender'  => $voicename, // Version 13.1: send actual voice name.
            'creditsToUse' => 5, // Voiceover pricing: 5 credits per slide.
            'subtopicKey'  => $params['subtopicKey'],
            'sectionId'    => $params['sectionId'],
        ];

        $url      = 'https://lms-labs.com/api/moodle/content-creator/tts';
        $response = $curl->post($url, json_encode($payload));
        $info     = $curl->get_info();
        $httpcode = isset($info['http_code']) ? $info['http_code'] : 0;

        if ($httpcode < 200 || $httpcode >= 300) {
            debugging('Content Creator TTS API returned HTTP ' . $httpcode, DEBUG_DEVELOPER);
            return [
                'success'      => false,
                'audioContent' => '',
                'audioType'    => '',
                'error'        => get_string('errorttsfailed', 'mod_contentcreator'),
            ];
        }

        $data = json_decode($response, true);
        if (!$data || !isset($data['success']) || !$data['success']) {
            return [
                'success'      => false,
                'audioContent' => '',
                'audioType'    => '',
                'error'        => get_string('errorttsfailed', 'mod_contentcreator'),
            ];
        }

        // FIX-CC-EXTVO-CACHE (v12.84): Save newly generated audio to the file store
        // so subsequent calls with the same text+voice+language are served from cache.
        // FIX-CC-EXTVO-CACHE-RACE (v12.86): Delete any pre-existing file under this key
        // before writing — concurrent requests for the same key would otherwise both call
        // create_file_from_string() and the second would throw a duplicate-file exception,
        // losing the audio. Mirrors the delete-before-create pattern in ajax.php.
        $audioraw = base64_decode($data['audioContent'] ?? '');
        if ($audioraw && strlen($audioraw) <= self::MAX_CACHE_BYTES) {
            try {
                // V13.86: Writes to the shared site-wide cache, matching the read above.
                $oldcachefile = $fs->get_file(
                    $cachectx->id,
                    'mod_contentcreator',
                    'voice_cache',
                    0,
                    '/',
                    $cachekey . '.ogg'
                );
                if ($oldcachefile) {
                    $oldcachefile->delete();
                }
                $fs->create_file_from_string(
                    [
                        'contextid' => $cachectx->id,
                        'component' => 'mod_contentcreator',
                        'filearea'  => 'voice_cache',
                        'itemid'    => 0,
                        'filepath'  => '/',
                        'filename'  => $cachekey . '.ogg',
                    ],
                    $audioraw
                );
            } catch (\Throwable $e) {
                // Cache write failure is non-fatal — audio is still returned to the caller.
                debugging('Voice cache write failed: ' . $e->getMessage(), DEBUG_DEVELOPER);
            }
        }

        return [
            'success'      => true,
            'audioContent' => $data['audioContent'],
            'audioType'    => $data['audioType'] ?? 'audio/ogg',
            'error'        => '',
        ];
    }

    // V13.94.3: The get_chirp_voice_id() helper was removed. It was a second, incomplete copy of the
    // language-to-voice mapping and was the reason this path and ajax.php disagreed. The
    // one implementation now lives in \mod_contentcreator\voice::resolve().

    /**
     * Describes the return value for execute().
     *
     * @return external_single_structure
     */
    public static function execute_returns(): external_single_structure {
        return new external_single_structure(
            [
                'success'      => new external_value(PARAM_BOOL, 'Success status'),
                'audioContent' => new external_value(
                    PARAM_RAW, // Pipeline-ignore: PARAM_RAW - JSON or free-form text, decoded and validated on use.
                    'Base64 encoded audio',
                ),
                'audioType'    => new external_value(PARAM_TEXT, 'Audio MIME type'),
                'error'        => new external_value(PARAM_TEXT, 'Error message if any', VALUE_DEFAULT, ''),
            ]
        );
    }
}
