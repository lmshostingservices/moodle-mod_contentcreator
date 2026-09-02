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
 * Content Creator v6.5.3 - Generate contextual workplace document example
 * Routes through EssayGraderAI API for AI-powered document generation.
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
 * External function that generates a contextual workplace document example.
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class generate_document_example extends external_api {
    /**
     * Describes the parameters for execute().
     *
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters(
            [
                'cmid' => new external_value(PARAM_INT, 'Course module ID'),
                'docId' => new external_value(PARAM_ALPHANUMEXT, 'Document type ID'),
                'docName' => new external_value(PARAM_TEXT, 'Document display name'),
                'country' => new external_value(PARAM_ALPHA, 'Country code', VALUE_DEFAULT, 'AU'),
                'state' => new external_value(PARAM_TEXT, 'State/region', VALUE_DEFAULT, ''),
                'industry' => new external_value(PARAM_TEXT, 'Industry name', VALUE_DEFAULT, 'general'),
                'subIndustry' => new external_value(PARAM_TEXT, 'Sub-industry', VALUE_DEFAULT, ''),
                'jobLevel' => new external_value(PARAM_ALPHANUMEXT, 'Job level', VALUE_DEFAULT, 'worker'),
                'jobTitle' => new external_value(PARAM_TEXT, 'Job title', VALUE_DEFAULT, 'Worker'),
                'route' => new external_value(PARAM_ALPHANUMEXT, 'Content route', VALUE_DEFAULT, 'workplace'),
                // Version 7.1.5: Unit of competency context for relevant documents.
                'unitCode' => new external_value(PARAM_TEXT, 'Unit code', VALUE_DEFAULT, ''),
                'unitTitle' => new external_value(PARAM_TEXT, 'Unit title', VALUE_DEFAULT, ''),
            ]
        );
    }

    /**
     * Generate a workplace document example through the vendor API.
     *
     * @param int $cmid Course module id.
     * @param string $docid Document type id.
     * @param string $docname Document display name.
     * @param string $country Country code.
     * @param string $state State or region.
     * @param string $industry Industry name.
     * @param string $subindustry Sub-industry name.
     * @param string $joblevel Job level.
     * @param string $jobtitle Job title.
     * @param string $route Content route.
     * @param string $unitcode Unit of competency code.
     * @param string $unittitle Unit of competency title.
     * @return array Result structure as described by execute_returns().
     */
    public static function execute(
        int $cmid,
        string $docid,
        string $docname,
        string $country = 'AU',
        string $state = '',
        string $industry = 'general',
        string $subindustry = '',
        string $joblevel = 'worker',
        string $jobtitle = 'Worker',
        string $route = 'workplace',
        string $unitcode = '',
        string $unittitle = ''
    ): array {
        global $CFG, $USER;

        $params = self::validate_parameters(
            self::execute_parameters(),
            [
                'cmid' => $cmid,
                'docId' => $docid,
                'docName' => $docname,
                'country' => $country,
                'state' => $state,
                'industry' => $industry,
                'subIndustry' => $subindustry,
                'jobLevel' => $joblevel,
                'jobTitle' => $jobtitle,
                'route' => $route,
                'unitCode' => $unitcode,
                'unitTitle' => $unittitle,
            ]
        );

        $cm = get_coursemodule_from_id('contentcreator', $params['cmid'], 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        self::validate_context($context);

        require_capability('mod/contentcreator:view', $context);

        // FIX-CC-DOCEXAMPLE-NEVER-CACHED (v13.95.1): this endpoint had no cache of any kind,
        // and the client never stored the result either, so EVERY learner opening the SAME
        // document example in the SAME activity triggered a fresh AI generation - a
        // 200-student cohort meant 200 generations of one identical document.
        //
        // Confirmed against the vendor on 2026-09-01: /generate-document-example carries no
        // credit logic at all, so this costs ZERO site credits. It is NOT a credit leak. What
        // it does cost is real upstream AI spend on the vendor's side, latency for the learner
        // on every open, and load on an endpoint with no rate limit of its own. Those are the
        // reasons for this cache; do not describe it as a credit fix.
        //
        // The generated document is a pure function of the payload below (it carries no user,
        // course or activity identity), so the cache is site-wide, exactly like voice_cache.
        // Looked up BEFORE the spend gates: a cache hit must cost nothing and must not be
        // blocked by a rate limiter. Mirrors the ordering in generate_voiceover.php.
        $cachekey = md5(implode('|', [
            $params['docId'],
            $params['docName'],
            $params['country'],
            $params['state'],
            $params['industry'],
            $params['subIndustry'],
            $params['jobLevel'],
            $params['jobTitle'],
            $params['route'],
            $params['unitCode'],
            $params['unitTitle'],
        ]));
        $cachectx = \context_system::instance();
        $fs = get_file_storage();
        $cachefile = $fs->get_file(
            $cachectx->id,
            'mod_contentcreator',
            'document_cache',
            0,
            '/',
            $cachekey . '.json'
        );
        if ($cachefile) {
            $cached = json_decode($cachefile->get_content(), true);
            if (is_array($cached) && isset($cached['content'])) {
                return [
                    'success' => true,
                    'content' => $cached['content'],
                    'docId' => $cached['docId'] ?? $params['docId'],
                    'docName' => $cached['docName'] ?? $params['docName'],
                    'domain' => $cached['domain'] ?? '',
                    'renderProfile' => $cached['renderProfile'] ?? '',
                    'error' => '',
                ];
            }
        }

        // Billed path begins here. Everything past this point spends site credits, which is
        // why the capability gate and the rate limiter sit below the cache lookup above.

        // v13.85: This call SPENDS SITE CREDITS. Gating it on :view alone meant every
        // enrolled learner in every course could draw on the same paid balance, with no
        // administrative control beyond disabling the feature site-wide. The new
        // capability is granted to student by default, so behaviour is unchanged until a
        // site chooses to prohibit it for a role, course or cohort.
        require_capability('mod/contentcreator:generateondemand', $context);

        // This endpoint spends site credits and is available to any user who can view the
        // activity, so abuse control is enforced by a per-user sliding-window rate limit
        // rather than by the capability gate. Do not remove it without a replacement.
        // v13.94.3: the per-user ceiling was hardcoded at 60 here, so the ratelimitgenerate
        // admin setting applied only to the AJAX path - an administrator who lowered it, or
        // set it to 0 to disable the bucket, changed nothing for this web service. enforce()
        // reads the setting and applies the site ceiling in one place, shared with ajax.php.
        \mod_contentcreator\ratelimiter::enforce($USER->id, 'generate', 60, HOURSECS);

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
                'success' => false,
                'content' => '',
                'docId' => $params['docId'],
                'docName' => $params['docName'],
                'domain' => '',
                'renderProfile' => '',
                'error' => get_string('errornotconfigured', 'mod_contentcreator'),
            ];
        }

        // Release session lock before long-running API call to prevent blocking other requests.
        \core\session\manager::write_close();

        // Call EssayGraderAI API for document generation.
        $curl = new \curl();
        $curl->setopt(
            [
                // FIX-CC-DOCEXAMPLE-TIMEOUT (v13.95.1): 60s was below the real generation
                // time for a full workplace document, so the vendor completed and charged
                // while this call reported failure and cached nothing - and the client's
                // silent fallback made it look free. Matched to the AJAX paths.
                'CURLOPT_TIMEOUT' => 180,
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
            'siteId' => $siteid,
            'apiKey' => $apikey,
            'docId' => $params['docId'],
            'docName' => $params['docName'],
            'country' => $params['country'],
            'state' => $params['state'],
            'industry' => $params['industry'],
            'subIndustry' => $params['subIndustry'],
            'jobLevel' => $params['jobLevel'],
            'jobTitle' => $params['jobTitle'],
            'route' => $params['route'],
            // Version 7.1.5: Unit context for SWMS/procedures specific to the qualification.
            'unitCode' => $params['unitCode'],
            'unitTitle' => $params['unitTitle'],
        ];

        $url = 'https://lms-labs.com/api/moodle/content-creator/generate-document-example';
        $response = $curl->post($url, json_encode($payload));
        $info = $curl->get_info();
        $httpcode = isset($info['http_code']) ? $info['http_code'] : 0;

        if ($httpcode < 200 || $httpcode >= 300) {
            debugging('Content Creator document API returned HTTP ' . $httpcode, DEBUG_DEVELOPER);
            return [
                'success' => false,
                'content' => '',
                'docId' => $params['docId'],
                'docName' => $params['docName'],
                'domain' => '',
                'renderProfile' => '',
                'error' => get_string('errordocgenfailed', 'mod_contentcreator'),
            ];
        }

        $data = json_decode($response, true);
        if (!$data || !isset($data['success']) || !$data['success']) {
            return [
                'success' => false,
                'content' => '',
                'docId' => $params['docId'],
                'docName' => $params['docName'],
                'domain' => '',
                'renderProfile' => '',
                'error' => get_string('errordocgenfailed', 'mod_contentcreator'),
            ];
        }

        // FIX-CC-DOCEXAMPLE-NEVER-CACHED (v13.95.1): store the generated result site-wide so
        // the next learner to open this document is served from cache instead of triggering a
        // second generation. Written before the return so a later reader gets the identical
        // cleaned HTML this caller receives.
        $cleaned = clean_text($data['content'] ?? '', FORMAT_HTML);
        if ($cleaned !== '') {
            try {
                // Delete before create: two concurrent requests for the same key would
                // otherwise both reach create_file_from_string() and the second would throw a
                // duplicate-file exception, losing a document the site has already paid for.
                // Same race, and the same fix, as FIX-CC-EXTVO-CACHE-RACE in the voiceover path.
                $oldcachefile = $fs->get_file(
                    $cachectx->id,
                    'mod_contentcreator',
                    'document_cache',
                    0,
                    '/',
                    $cachekey . '.json'
                );
                if ($oldcachefile) {
                    $oldcachefile->delete();
                }
                $fs->create_file_from_string(
                    [
                        'contextid' => $cachectx->id,
                        'component' => 'mod_contentcreator',
                        'filearea' => 'document_cache',
                        'itemid' => 0,
                        'filepath' => '/',
                        'filename' => $cachekey . '.json',
                    ],
                    json_encode([
                        'content' => $cleaned,
                        'docId' => $data['docId'] ?? $params['docId'],
                        'docName' => $data['docName'] ?? $params['docName'],
                        'domain' => $data['domain'] ?? '',
                        'renderProfile' => $data['renderProfile'] ?? '',
                    ])
                );
            } catch (\Exception $e) {
                // A cache write failure must never fail the request: the caller already has
                // the content it paid for. Worst case the next reader pays again.
                debugging(
                    'Content Creator could not cache document example: ' . $e->getMessage(),
                    DEBUG_DEVELOPER
                );
            }
        }

        return [
            'success' => true,
            // v13.86: This HTML is injected straight into the player's DOM (player5.js
            // renders it with innerHTML, deliberately, because it is a rendered
            // workplace document). Everything else in that file is escaped, which makes
            // this the exception rather than a design decision. clean_text() strips
            // script, event handlers and anything outside Moodle's allowed tag set
            // while leaving the document markup intact.
            'content' => $cleaned,
            'docId' => $data['docId'] ?? $params['docId'],
            'docName' => $data['docName'] ?? $params['docName'],
            'domain' => $data['domain'] ?? '',
            'renderProfile' => $data['renderProfile'] ?? '',
            'error' => '',
        ];
    }

    /**
     * Describes the return value for execute().
     *
     * @return external_single_structure
     */
    public static function execute_returns(): external_single_structure {
        return new external_single_structure(
            [
                'success' => new external_value(PARAM_BOOL, 'Success status'),
                'content' => new external_value(
                    PARAM_RAW, // pipeline-ignore: PARAM_RAW - JSON or free-form text, decoded and validated on use.
                    'Generated document HTML content',
                ),
                'docId' => new external_value(PARAM_TEXT, 'Document type ID'),
                'docName' => new external_value(PARAM_TEXT, 'Document display name'),
                'domain' => new external_value(PARAM_TEXT, 'Document domain category'),
                'renderProfile' => new external_value(PARAM_TEXT, 'Render profile used'),
                'error' => new external_value(PARAM_TEXT, 'Error message if any', VALUE_DEFAULT, ''),
            ]
        );
    }
}
