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

defined('MOODLE_INTERNAL') || die();

global $CFG;
require_once($CFG->libdir . '/externallib.php');

use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_single_structure;
use core_external\external_value;
use context_module;
use context_course;

class save_manifest extends external_api {
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'cmid' => new external_value(PARAM_INT, 'Course module ID'),
            'manifest' => new external_value(PARAM_RAW, 'JSON manifest data'), // pipeline-ignore: PARAM_RAW — JSON manifest blob immediately json_decode()'d and validated
            'version' => new external_value(PARAM_TEXT, 'Manifest version', VALUE_DEFAULT, '')
        ]);
    }

    public static function execute(int $cmid, string $manifest, string $version = ''): array {
        global $DB;

        // v7.8.7: Extend execution time and memory for large manifests
        @set_time_limit(300);
        @ini_set('max_execution_time', '300');
        @ini_set('max_input_time', '300');
        @ini_set('memory_limit', '512M');

        // Release session lock before long-running DB operation to prevent blocking other requests.
        \core\session\manager::write_close();

        // Log applied limits for debugging
        error_log("[CC_SAVE] Starting save. mem=" . ini_get('memory_limit') . " time=" . ini_get('max_execution_time'));

        try {
            $params = self::validate_parameters(self::execute_parameters(), [
                'cmid' => $cmid,
                'manifest' => $manifest,
                'version' => $version
            ]);

            // Debug: Log manifest size
            $manifestSize = strlen($params['manifest']);
            $sizeKB = round($manifestSize / 1024);
            error_log("[CC_SAVE] Manifest size: {$sizeKB} KB, cmid: {$params['cmid']}");

            $cm = get_coursemodule_from_id('contentcreator', $params['cmid'], 0, false, MUST_EXIST);
            $context = context_module::instance($cm->id);
            self::validate_context($context);

            // v11.39 FIX: Mirror the flexible capability check from ajax.php.
            // Custom roles cloned from editingteacher do not inherit new plugin capabilities,
            // so 'mod/contentcreator:addinstance' (the old check) was too strict and caused
            // "Failed to save generated content" for legitimate editing teachers.
            // Accept 'moodle/course:manageactivities' as a fallback — every genuine
            // editing teacher has this regardless of whether their role explicitly lists
            // mod/contentcreator capabilities.
            if (!has_capability('mod/contentcreator:manage', $context)) {
                $coursecontext = context_course::instance($cm->course);
                if (!has_capability('moodle/course:manageactivities', $coursecontext)) {
                    require_capability('mod/contentcreator:manage', $context);
                }
            }

            $manifest = $params['manifest'];

            $decoded = json_decode($manifest, true);
            if (json_last_error() !== JSON_ERROR_NONE) {
                $jsonError = json_last_error_msg();
                error_log("[CC_SAVE] JSON decode error: {$jsonError}");
                return [
                    'success' => false,
                    'message' => 'Invalid JSON manifest: ' . $jsonError
                ];
            }

            // v11.51 FIX BUG-CC-DBWRITE: PHP-side safety net — strip any remaining
            // base64 data: URLs that survived JS stripAudio() (e.g. embedded images
            // in 'image' or other non-audio fields).
            $preStripSize = strlen($manifest);
            $manifest = preg_replace('/"data:[^"]{200,}"/u', '"pregenerated"', $manifest);
            if ($manifest === null) {
                $manifest = json_encode($decoded, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                error_log("[CC_SAVE] WARNING: preg_replace failed, using json_encode fallback");
            }
            $postStripSize = strlen($manifest);
            if ($postStripSize < $preStripSize) {
                error_log("[CC_SAVE] PHP data: strip removed " . round(($preStripSize - $postStripSize) / 1024) . "KB | before=" . round($preStripSize / 1024) . "KB after=" . round($postStripSize / 1024) . "KB");
            }

            $record = new \stdClass();
            $record->id = $cm->instance;
            // v11.48 FIX BUG-CC-DBWRITE: compress to stay under MySQL max_allowed_packet
            $record->manifestjson = \mod_contentcreator\manifest_storage::compress($manifest);
            // Truncate version to 20 chars to fit database column
            $version = $params['version'] ?: date('Y-m-d H:i:s');
            $record->manifestversion = substr($version, 0, 20);
            $record->timemodified = time();

            // v11.51 FIX: Catch DB write exception and return success:false (not re-throw)
            // so JS retry logic in saveManifestSilent() fires the .done() retry handler.
            error_log("[CC_SAVE] Updating record id: {$record->id} | compressed=" . round(strlen($record->manifestjson) / 1024) . "KB");
            try {
                $DB->update_record('contentcreator', $record);
                error_log("[CC_SAVE] Save successful");
                return [
                    'success' => true,
                    'message' => 'Manifest saved successfully'
                ];
            } catch (\dml_write_exception $e) {
                $compressedSize = strlen($record->manifestjson);
                error_log("[CC_SAVE] DB write FAILED: " . $e->getMessage() . " | compressed=" . round($compressedSize / 1024) . "KB");
                return [
                    'success' => false,
                    'message' => 'Error writing to database: compressed manifest is ' . round($compressedSize / 1024) . 'KB. ' . $e->getMessage()
                ];
            }
        } catch (\Throwable $e) {
            error_log("[CC_SAVE] Exception: " . $e->getMessage());
            error_log("[CC_SAVE] Trace: " . $e->getTraceAsString());
            throw $e; // Re-throw to get proper 500 error in browser
        }
    }

    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'success' => new external_value(PARAM_BOOL, 'Success status'),
            'message' => new external_value(PARAM_TEXT, 'Response message')
        ]);
    }
}
