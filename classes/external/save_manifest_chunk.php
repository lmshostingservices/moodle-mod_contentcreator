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
 * Content Creator - Save manifest chunk external function
 * v7.8.8: Chunked upload support for large manifests (>2MB)
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

class save_manifest_chunk extends external_api {
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'cmid' => new external_value(PARAM_INT, 'Course module ID'),
            'uploadid' => new external_value(PARAM_ALPHANUMEXT, 'Unique upload session ID'),
            'chunk' => new external_value(PARAM_RAW, 'Chunk of manifest JSON data'), // pipeline-ignore: PARAM_RAW — JSON manifest chunk, reassembled then json_decode()'d and validated
            'chunkindex' => new external_value(PARAM_INT, 'Index of this chunk (0-based)'),
            'totalchunks' => new external_value(PARAM_INT, 'Total number of chunks'),
            'islast' => new external_value(PARAM_INT, 'Is this the last chunk (1=yes, 0=no)'),
            'version' => new external_value(PARAM_TEXT, 'Manifest version (only on last chunk)', VALUE_DEFAULT, '')
        ]);
    }

    public static function execute(int $cmid, string $uploadid, string $chunk, int $chunkindex, 
                                   int $totalchunks, int $islast, string $version = ''): array {
        global $DB, $CFG;

        @set_time_limit(120);
        @ini_set('memory_limit', '512M');

        // Release session lock before long-running chunk processing to prevent blocking other requests.
        \core\session\manager::write_close();

        try {
            $params = self::validate_parameters(self::execute_parameters(), [
                'cmid' => $cmid,
                'uploadid' => $uploadid,
                'chunk' => $chunk,
                'chunkindex' => $chunkindex,
                'totalchunks' => $totalchunks,
                'islast' => $islast,
                'version' => $version
            ]);

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

            // Chunk storage directory
            $tempdir = $CFG->tempdir . '/contentcreator_chunks';
            if (!is_dir($tempdir)) {
                mkdir($tempdir, 0777, true);
            }

            $chunkfile = $tempdir . '/' . $params['uploadid'] . '_' . $params['chunkindex'] . '.chunk';
            $chunkSize = strlen($params['chunk']);
            
            error_log("[CC_CHUNK] Received chunk {$params['chunkindex']}/{$params['totalchunks']} " .
                      "size=" . round($chunkSize / 1024) . "KB uploadid={$params['uploadid']}");

            // Save this chunk
            file_put_contents($chunkfile, $params['chunk']);

            // If this is the last chunk, reassemble and save
            if ($params['islast']) {
                error_log("[CC_CHUNK] Last chunk received, reassembling manifest...");
                
                $manifest = '';
                for ($i = 0; $i < $params['totalchunks']; $i++) {
                    $file = $tempdir . '/' . $params['uploadid'] . '_' . $i . '.chunk';
                    if (!file_exists($file)) {
                        error_log("[CC_CHUNK] ERROR: Missing chunk $i");
                        return [
                            'success' => false,
                            'message' => "Missing chunk $i"
                        ];
                    }
                    $manifest .= file_get_contents($file);
                    unlink($file); // Clean up chunk file
                }

                $totalSize = strlen($manifest);
                error_log("[CC_CHUNK] Reassembled manifest size: " . round($totalSize / 1024) . " KB");

                // Validate JSON
                $decoded = json_decode($manifest, true);
                if (json_last_error() !== JSON_ERROR_NONE) {
                    $jsonError = json_last_error_msg();
                    error_log("[CC_CHUNK] JSON decode error: {$jsonError}");
                    return [
                        'success' => false,
                        'message' => 'Invalid JSON after reassembly: ' . $jsonError
                    ];
                }

                // v11.51 FIX BUG-CC-DBWRITE: PHP-side safety net — strip any remaining
                // base64 data: URLs that survived JS stripAudio() (e.g. embedded images
                // in 'image' or other non-audio fields). JS only strips voiceoverUrl and
                // audioUrl; this regex catches ALL data: strings > 200 chars regardless
                // of field name, ensuring gzip input is as small as possible.
                $preStripSize = strlen($manifest);
                $manifest = preg_replace('/"data:[^"]{200,}"/u', '"pregenerated"', $manifest);
                if ($manifest === null) {
                    // preg_replace returned null on regex error — continue with original
                    $manifest = $decoded ? json_encode($decoded, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : '';
                    error_log("[CC_CHUNK] WARNING: preg_replace failed, using json_encode fallback");
                }
                $postStripSize = strlen($manifest);
                if ($postStripSize < $preStripSize) {
                    error_log("[CC_CHUNK] PHP data: strip removed " . round(($preStripSize - $postStripSize) / 1024) . "KB | before=" . round($preStripSize / 1024) . "KB after=" . round($postStripSize / 1024) . "KB");
                }

                // Save to database
                // v11.48 FIX BUG-CC-DBWRITE: compress to stay under MySQL max_allowed_packet
                $record = new \stdClass();
                $record->id = $cm->instance;
                $record->manifestjson = \mod_contentcreator\manifest_storage::compress($manifest);
                $versionStr = $params['version'] ?: date('Y-m-d H:i:s');
                $record->manifestversion = substr($versionStr, 0, 20);
                $record->timemodified = time();

                // v11.51 FIX: Catch DB write exception and return success:false (not throw)
                // so the JS retry logic in saveManifestSilent() can handle it properly.
                // Re-throwing triggers Moodle's fault path, which bypasses the JS .done()
                // retry handler and all 3 retry attempts fail without ever being retried.
                try {
                    $DB->update_record('contentcreator', $record);
                    $compressedSize = strlen($record->manifestjson);
                    error_log("[CC_CHUNK] Manifest saved successfully | raw=" . round($postStripSize / 1024) . "KB compressed=" . round($compressedSize / 1024) . "KB");
                    return [
                        'success' => true,
                        'message' => 'Manifest saved successfully (' . round($postStripSize / 1024) . ' KB)'
                    ];
                } catch (\dml_write_exception $e) {
                    $compressedSize = strlen($record->manifestjson);
                    error_log("[CC_CHUNK] DB write FAILED: " . $e->getMessage() . " | compressed=" . round($compressedSize / 1024) . "KB raw=" . round($postStripSize / 1024) . "KB");
                    return [
                        'success' => false,
                        'message' => 'Error writing to database: compressed manifest is ' . round($compressedSize / 1024) . 'KB — may exceed MySQL max_allowed_packet. ' . $e->getMessage()
                    ];
                }
            }

            // Not the last chunk - just acknowledge receipt
            return [
                'success' => true,
                'message' => "Chunk {$params['chunkindex']} received"
            ];

        } catch (\Throwable $e) {
            error_log("[CC_CHUNK] Exception: " . $e->getMessage());
            throw $e;
        }
    }

    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'success' => new external_value(PARAM_BOOL, 'Success status'),
            'message' => new external_value(PARAM_TEXT, 'Response message')
        ]);
    }
}
