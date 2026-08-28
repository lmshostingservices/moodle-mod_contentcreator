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
 * Content Creator - Save manifest external function
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace mod_contentcreator\external;

use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_single_structure;
use core_external\external_value;
use context_module;
use context_course;

/**
 * External function that stores a complete manifest for a Content Creator activity.
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class save_manifest extends external_api {
    /**
     * Describes the parameters for execute().
     *
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters(
            [
                'cmid' => new external_value(PARAM_INT, 'Course module ID'),
                'manifest' => new external_value(
                    PARAM_RAW, // pipeline-ignore: PARAM_RAW - JSON or free-form text, decoded and validated on use.
                    'JSON manifest data',
                ),
                'version' => new external_value(PARAM_TEXT, 'Manifest version', VALUE_DEFAULT, ''),
            ]
        );
    }

    /**
     * Save the supplied manifest against the activity instance.
     *
     * @param int $cmid Course module id.
     * @param string $manifest JSON manifest data.
     * @param string $version Manifest version label.
     * @return array Result structure as described by execute_returns().
     */
    public static function execute(int $cmid, string $manifest, string $version = ''): array {
        global $DB;

        // Version 7.8.7: Extend execution time and memory for large manifests.
        \core_php_time_limit::raise(300);
        raise_memory_limit(MEMORY_EXTRA);

        // Release session lock before long-running DB operation to prevent blocking other requests.
        \core\session\manager::write_close();

        // v13.94.3: Parameter validation, context validation and the capability check used to
        // sit INSIDE the try below, so a rejected parameter, a bad context or a genuine
        // permission failure all came back as HTTP 200 with the same "could not be saved"
        // string. That hides an access-control failure from the caller, from the browser
        // console and from the site's logs, and it means Moodle's own web-service error
        // layer - which knows how to report these three properly - never sees them. They now
        // run outside the try and are allowed to throw.
        $params = self::validate_parameters(
            self::execute_parameters(),
            [
                'cmid' => $cmid,
                'manifest' => $manifest,
                'version' => $version,
            ]
        );

        $cm = get_coursemodule_from_id('contentcreator', $params['cmid'], 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        self::validate_context($context);

        // Version 11.39 FIX: Mirror the flexible capability check from ajax.php.
        // Custom roles cloned from editingteacher do not inherit new plugin capabilities,
        // so 'mod/contentcreator:addinstance' (the old check) was too strict and caused
        // "Failed to save generated content" for legitimate editing teachers.
        // Accept 'moodle/course:manageactivities' as a fallback — every genuine
        // editing teacher has this regardless of whether their role explicitly lists
        // mod/contentcreator capabilities.
        // v13.86: the moodle/course:manageactivities fallback was removed. It made
        // mod/contentcreator:manage advisory - a CAP_PROHIBIT on it denied nothing.
        // Roles that already hold manageactivities are granted :manage by the
        // upgrade step in db/upgrade.php, so no legitimate editing teacher loses
        // access.
        require_capability('mod/contentcreator:manage', $context);

        try {
            debugging(
                'Content Creator manifest size: ' . round(strlen($params['manifest']) / 1024) .
                    ' KB, cmid: ' . $params['cmid'],
                DEBUG_DEVELOPER
            );

            $manifest = $params['manifest'];

            $decoded = json_decode($manifest, true);
            if (json_last_error() !== JSON_ERROR_NONE) {
                debugging('Content Creator manifest JSON decode error: ' . json_last_error_msg(), DEBUG_DEVELOPER);
                return [
                    'success' => false,
                    'message' => get_string('errorinvalidjson', 'mod_contentcreator'),
                ];
            }

            // Version 11.51 FIX BUG-CC-DBWRITE: PHP-side safety net — strip any remaining
            // base64 data: URLs that survived JS stripAudio() (e.g. embedded images
            // in 'image' or other non-audio fields).
            $prestripsize = strlen($manifest);
            $manifest = preg_replace('/"data:[^"]{200,}"/u', '"pregenerated"', $manifest);
            if ($manifest === null) {
                $manifest = json_encode($decoded, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                debugging('Content Creator manifest strip failed, using json_encode fallback.', DEBUG_DEVELOPER);
            }
            $poststripsize = strlen($manifest);
            if ($poststripsize < $prestripsize) {
                debugging(
                    'Content Creator manifest data: URL strip removed ' .
                        round(($prestripsize - $poststripsize) / 1024) . ' KB.',
                    DEBUG_DEVELOPER
                );
            }

            $record = new \stdClass();
            $record->id = $cm->instance;
            // Version 11.48 FIX BUG-CC-DBWRITE: compress to stay under MySQL max_allowed_packet.
            $record->manifestjson = \mod_contentcreator\manifest_storage::compress($manifest);
            // Truncate version to 20 chars to fit database column.
            $version = $params['version'] ?: date('Y-m-d H:i:s');
            $record->manifestversion = substr($version, 0, 20);
            $record->timemodified = time();

            // Version 11.51 FIX: Catch DB write exception and return success:false (not re-throw)
            // so JS retry logic in saveManifestSilent() fires the .done() retry handler.
            try {
                $DB->update_record('contentcreator', $record);
                return [
                    'success' => true,
                    'message' => get_string('manifestsaved', 'mod_contentcreator'),
                ];
            } catch (\dml_write_exception $e) {
                debugging(
                    'Content Creator manifest DB write failed (' .
                        round(strlen($record->manifestjson) / 1024) . ' KB compressed): ' .
                        $e->getMessage(),
                    DEBUG_DEVELOPER
                );
                return [
                    'success' => false,
                    'message' => get_string('errorsavefailed', 'mod_contentcreator'),
                ];
            }
        } catch (\Throwable $e) {
            // v13.94.3: This was logged at DEBUG_DEVELOPER only, which no production site
            // runs, so the one thing that could explain a save failure was thrown away on
            // exactly the sites where it matters. Report it at DEBUG_NORMAL and hand the
            // caller a stable errorcode, so a support request can be traced without asking
            // a client to turn developer debugging on. The visible message is unchanged.
            debugging('Content Creator save_manifest exception: ' . $e->getMessage(), DEBUG_NORMAL);
            return [
                'success' => false,
                'message' => get_string('errorsavefailed', 'mod_contentcreator'),
                'errorcode' => 'savemanifestfailed',
            ];
        }
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
                'message' => new external_value(PARAM_TEXT, 'Response message'),
                // v13.94.3: Stable machine-readable cause, present only on the unexpected-failure
                // path. Optional so the success and validation replies are unchanged.
                'errorcode' => new external_value(
                    PARAM_ALPHANUMEXT,
                    'Stable error identifier when the save failed unexpectedly',
                    VALUE_OPTIONAL
                ),
            ]
        );
    }
}
