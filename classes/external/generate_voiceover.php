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
     * Must match CONTENTCREATOR_VOICE_MAXCHARS in ajax.php. This bounds one
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
        return new external_function_parameters([
            'cmid'      => new external_value(PARAM_INT, 'Course module ID'),
            'text'      => new external_value(
                PARAM_RAW, // pipeline-ignore: PARAM_RAW - JSON or free-form text, decoded and validated on use.
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
            'voice'     => new external_value(PARAM_ALPHA, 'Chirp 3 HD voice name', VALUE_DEFAULT, ''),
        ]);
    }

    /**
     * Synthesise voiceover audio for the supplied text.
     *
     * @param int $cmid Course module id.
     * @param string $text Text to convert to speech.
     * @param string $sectionid Section identifier the audio belongs to.
     * @param string $language Language code override, for example 'fr-FR'.
     * @param string $voice Chirp 3 HD voice name.
     * @return array Result structure as described by execute_returns().
     */
    public static function execute(
        int $cmid,
        string $text,
        string $sectionid = '',
        string $language = '',
        string $voice = ''
    ): array {
        global $CFG, $USER;

        $params = self::validate_parameters(self::execute_parameters(), [
            'cmid'      => $cmid,
            'text'      => $text,
            'sectionId' => $sectionid,
            'language'  => $language,
            'voice'     => $voice,
        ]);

        $cm = get_coursemodule_from_id('contentcreator', $params['cmid'], 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        self::validate_context($context);

        require_capability('mod/contentcreator:view', $context);

        // This endpoint spends site credits (5 per call) and is available to any user who
        // can view the activity, so abuse control is enforced here rather than by the
        // capability gate: a per-user sliding-window limit plus the MAX_TEXT_LENGTH cap
        // applied to the text below. Do not remove either without replacing them.
        \mod_contentcreator\ratelimiter::check($USER->id, 'voice', 100, HOURSECS);

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
        $voiceid = self::get_chirp_voice_id($voicelanguage, $voicename);

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

        // FIX-CC-EXTVO-CACHE (v12.84): This external API previously had no file cache —
        // every call hit the TTS API and charged credits even for identical text+language.
        // Mirror the MD5 cache from ajax.php generate_voice so repeated calls (e.g. mobile
        // or third-party integrations) return stored audio at zero credit cost.
        // Cache key: MD5(text | voiceid | language) — same scheme as ajax.php line ~407.
        $cachekey  = md5($text . '|' . $voiceid . '|' . $voicelanguage);
        $fs        = get_file_storage();
        $cachefile = $fs->get_file(
            $context->id,
            'mod_contentcreator',
            'voice_cache',
            $cm->id,
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

        // Release session lock before long-running API call to prevent blocking other requests.
        \core\session\manager::write_close();

        // Call EssayGraderAI API for TTS.
        $curl = new \curl();
        $curl->setopt([
            'CURLOPT_TIMEOUT'       => 300,
            'CURLOPT_RETURNTRANSFER' => true,
            'CURLOPT_SSL_VERIFYPEER' => true,
        ]);
        $curl->setHeader([
            'Content-Type: application/json',
            'Accept: application/json',
        ]);

        $payload = [
            'siteId'       => $siteid,
            'apiKey'       => $apikey,
            'text'         => $text,
            'languageCode' => $voicelanguage,
            'voiceId'      => $voiceid,
            'voiceGender'  => $voicename, // Version 13.1: send actual voice name.
            'creditsToUse' => 5, // Voiceover pricing: 5 credits per slide.
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
                $oldcachefile = $fs->get_file(
                    $context->id,
                    'mod_contentcreator',
                    'voice_cache',
                    $cm->id,
                    '/',
                    $cachekey . '.ogg'
                );
                if ($oldcachefile) {
                    $oldcachefile->delete();
                }
                $fs->create_file_from_string([
                    'contextid' => $context->id,
                    'component' => 'mod_contentcreator',
                    'filearea'  => 'voice_cache',
                    'itemid'    => $cm->id,
                    'filepath'  => '/',
                    'filename'  => $cachekey . '.ogg',
                ], $audioraw);
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

    /**
     * Build the Chirp 3 HD voice ID from a language code and a voice name.
     *
     * @param string $languagecode Language code, for example 'en-AU' or 'zh-CN'.
     * @param string $voicename Voice name, for example 'Aoede' or 'Puck'.
     * @return string Full voice ID.
     */
    private static function get_chirp_voice_id(string $languagecode, string $voicename): string {
        // Special mappings for certain language codes
        // FIX-CC-ML-NB-NO (v13.19): 'nb-NO' was incorrectly remapped to 'no-NO'.
        // Google Chirp 3 HD has no 'no-NO' voice; 'nb-NO-Chirp3-HD-Aoede' is the
        // correct identifier. Remove the wrong mapping so nb-NO passes through.
        $languagemappings = [
            'zh-CN'  => 'cmn-CN', // Mandarin Chinese.
            'zh-TW'  => 'cmn-TW', // Traditional Chinese.
            'zh-HK'  => 'yue-HK', // Cantonese
            // nb-NO intentionally NOT mapped — nb-NO-Chirp3-HD-Aoede is valid.
            'fil-PH' => 'fil-PH', // Filipino (kept for legacy zh-style callers).
        ];

        $mappedcode = $languagemappings[$languagecode] ?? $languagecode;

        return "{$mappedcode}-Chirp3-HD-{$voicename}";
    }

    /**
     * Describes the return value for execute().
     *
     * @return external_single_structure
     */
    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'success'      => new external_value(PARAM_BOOL, 'Success status'),
            'audioContent' => new external_value(
                PARAM_RAW, // pipeline-ignore: PARAM_RAW - JSON or free-form text, decoded and validated on use.
                'Base64 encoded audio',
            ),
            'audioType'    => new external_value(PARAM_TEXT, 'Audio MIME type'),
            'error'        => new external_value(PARAM_TEXT, 'Error message if any', VALUE_DEFAULT, ''),
        ]);
    }
}
