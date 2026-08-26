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
        return new external_function_parameters([
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
        ]);
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

        $params = self::validate_parameters(self::execute_parameters(), [
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
        ]);

        $cm = get_coursemodule_from_id('contentcreator', $params['cmid'], 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        self::validate_context($context);

        require_capability('mod/contentcreator:view', $context);

        // v13.85: this call SPENDS SITE CREDITS. Gating it on :view alone meant every
        // enrolled learner in every course could draw on the same paid balance, with no
        // administrative control beyond disabling the feature site-wide. The new
        // capability is granted to student by default, so behaviour is unchanged until a
        // site chooses to prohibit it for a role, course or cohort.
        require_capability('mod/contentcreator:generateondemand', $context);

        // This endpoint spends site credits and is available to any user who can view the
        // activity, so abuse control is enforced by a per-user sliding-window rate limit
        // rather than by the capability gate. Do not remove it without a replacement.
        \mod_contentcreator\ratelimiter::check($USER->id, 'generate', 60, HOURSECS);
        // v13.85: aggregate ceiling. The per-user limit above cannot bound total spend on
        // an endpoint every enrolled learner may call; with a large cohort it has no
        // effective ceiling at all. Configurable, generous by default, 0 disables.
        $sitemax = get_config('mod_contentcreator', 'sitelimitgenerate');
        $sitemax = ($sitemax !== false && $sitemax !== '' && is_numeric($sitemax)) ? (int)$sitemax : 1000;
        \mod_contentcreator\ratelimiter::check_site('generate', $sitemax, HOURSECS);


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
        $curl->setopt([
            'CURLOPT_TIMEOUT' => 60,
            'CURLOPT_RETURNTRANSFER' => true,
            'CURLOPT_SSL_VERIFYPEER' => true,
        ]);
        $curl->setHeader([
            'Content-Type: application/json',
            'Accept: application/json',
        ]);

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

        return [
            'success' => true,
            // v13.86: this HTML is injected straight into the player's DOM (player5.js
            // renders it with innerHTML, deliberately, because it is a rendered
            // workplace document). Everything else in that file is escaped, which makes
            // this the exception rather than a design decision. clean_text() strips
            // script, event handlers and anything outside Moodle's allowed tag set
            // while leaving the document markup intact.
            'content' => clean_text($data['content'] ?? '', FORMAT_HTML),
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
        return new external_single_structure([
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
        ]);
    }
}
