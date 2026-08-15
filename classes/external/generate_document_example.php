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
require_once($CFG->libdir . '/externallib.php');
require_once($CFG->libdir . '/filelib.php');

use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_single_structure;
use core_external\external_value;
use context_module;

class generate_document_example extends external_api {
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
            // v7.1.5: Unit of competency context for relevant documents
            'unitCode' => new external_value(PARAM_TEXT, 'Unit code', VALUE_DEFAULT, ''),
            'unitTitle' => new external_value(PARAM_TEXT, 'Unit title', VALUE_DEFAULT, '')
        ]);
    }

    public static function execute(
        int $cmid,
        string $docId,
        string $docName,
        string $country = 'AU',
        string $state = '',
        string $industry = 'general',
        string $subIndustry = '',
        string $jobLevel = 'worker',
        string $jobTitle = 'Worker',
        string $route = 'workplace',
        string $unitCode = '',
        string $unitTitle = ''
    ): array {
        global $CFG;

        $params = self::validate_parameters(self::execute_parameters(), [
            'cmid' => $cmid,
            'docId' => $docId,
            'docName' => $docName,
            'country' => $country,
            'state' => $state,
            'industry' => $industry,
            'subIndustry' => $subIndustry,
            'jobLevel' => $jobLevel,
            'jobTitle' => $jobTitle,
            'route' => $route,
            'unitCode' => $unitCode,
            'unitTitle' => $unitTitle
        ]);

        $cm = get_coursemodule_from_id('contentcreator', $params['cmid'], 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        self::validate_context($context);

        require_capability('mod/contentcreator:view', $context);

        // Central Config integration with fallback
        $aiconfiglib = $CFG->dirroot . '/local/aiconfig/lib.php';
        if (file_exists($aiconfiglib)) {
            require_once($aiconfiglib);
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

        if (empty($siteid) || empty($apikey)) {
            return [
                'success' => false,
                'content' => '',
                'docId' => $params['docId'],
                'docName' => $params['docName'],
                'domain' => '',
                'renderProfile' => '',
                'error' => 'API not configured. Please install AI Grader Central Config or configure Site ID and API Key in plugin settings.'
            ];
        }

        // Release session lock before long-running API call to prevent blocking other requests.
        \core\session\manager::write_close();

        // Call EssayGraderAI API for document generation
        $curl = new \curl();
        $curl->setopt([
            'CURLOPT_TIMEOUT' => 60,
            'CURLOPT_RETURNTRANSFER' => true,
            'CURLOPT_SSL_VERIFYPEER' => true,
        ]);
        $curl->setHeader([
            'Content-Type: application/json',
            'Accept: application/json'
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
            // v7.1.5: Unit context for SWMS/procedures specific to the qualification
            'unitCode' => $params['unitCode'],
            'unitTitle' => $params['unitTitle']
        ];

        $url = 'https://lms-labs.com/api/moodle/content-creator/generate-document-example';
        $response = $curl->post($url, json_encode($payload));
        $info = $curl->get_info();
        $httpcode = isset($info['http_code']) ? $info['http_code'] : 0;

        if ($httpcode < 200 || $httpcode >= 300) {
            $data = json_decode($response, true);
            $error = $data['error'] ?? "API error: $httpcode";
            return [
                'success' => false,
                'content' => '',
                'docId' => $params['docId'],
                'docName' => $params['docName'],
                'domain' => '',
                'renderProfile' => '',
                'error' => $error
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
                'error' => $data['error'] ?? 'Document generation failed'
            ];
        }

        return [
            'success' => true,
            'content' => $data['content'] ?? '',
            'docId' => $data['docId'] ?? $params['docId'],
            'docName' => $data['docName'] ?? $params['docName'],
            'domain' => $data['domain'] ?? '',
            'renderProfile' => $data['renderProfile'] ?? '',
            'error' => ''
        ];
    }

    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'success' => new external_value(PARAM_BOOL, 'Success status'),
            'content' => new external_value(PARAM_RAW, 'Generated document HTML content'), // pipeline-ignore: PARAM_RAW — return value: generated HTML rendered through Moodle formatting on output
            'docId' => new external_value(PARAM_TEXT, 'Document type ID'),
            'docName' => new external_value(PARAM_TEXT, 'Document display name'),
            'domain' => new external_value(PARAM_TEXT, 'Document domain category'),
            'renderProfile' => new external_value(PARAM_TEXT, 'Render profile used'),
            'error' => new external_value(PARAM_TEXT, 'Error message if any', VALUE_DEFAULT, '')
        ]);
    }
}
