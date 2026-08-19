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
 * Content Creator - Manifest storage helper (compress/decompress)
 *
 * v11.48 FIX BUG-CC-DBWRITE: MySQL max_allowed_packet rejects large UPDATE payloads.
 * A fully-generated manifest for a VET unit with voiceover can reach 6–10 MB as raw
 * JSON. MySQL's default max_allowed_packet (4 MB on many hosts) causes $DB->update_record()
 * to throw "Error writing to database" — regardless of retries, because the query itself
 * is too large to transmit.
 *
 * Fix: gzip-compress the manifest JSON before every DB write and decompress after every
 * DB read. A 6 MB manifest compresses to ~600 KB; base64 encoding adds ~33%, giving
 * ~800 KB — well under any reasonable max_allowed_packet. Old uncompressed manifests
 * (no 'gz:' prefix) are returned as-is so existing data is read correctly.
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace mod_contentcreator;

/**
 * Compresses and decompresses the manifest JSON blob stored on the activity record.
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class manifest_storage {
    /** Manifests smaller than this are stored raw (no compression overhead needed). */
    const COMPRESS_THRESHOLD = 524288;

    /**
     * Compress manifest JSON for storage.
     * Returns the original string unchanged if compression is unnecessary or fails.
     *
     * @param string $json Raw manifest JSON string.
     * @return string Compressed 'gz:<base64>' string, or original JSON if below threshold.
     */
    public static function compress(string $json): string {
        if (strlen($json) < self::COMPRESS_THRESHOLD) {
            return $json;
        }
        $gz = gzencode($json, 6);
        if ($gz === false) {
            debugging(
                'Content Creator gzencode() failed, storing raw JSON (' . strlen($json) . ' bytes).',
                DEBUG_DEVELOPER
            );
            return $json;
        }
        $stored = 'gz:' . base64_encode($gz);
        debugging('Content Creator compressed manifest ' . round(strlen($json) / 1024) . ' KB to ' .
            round(strlen($stored) / 1024) . ' KB.', DEBUG_DEVELOPER);
        return $stored;
    }

    /**
     * Decompress manifest from storage.
     * Returns the original string unchanged if it is not in compressed format
     * (backward-compatible with manifests stored before v11.48).
     *
     * @param string $stored Value read from the manifestjson DB column.
     * @return string Raw manifest JSON string.
     */
    public static function decompress(string $stored): string {
        if (substr($stored, 0, 3) !== 'gz:') {
            return $stored;
        }
        $decoded = base64_decode(substr($stored, 3), true);
        if ($decoded === false) {
            debugging('Content Creator base64_decode() failed, returning the stored value as-is.', DEBUG_DEVELOPER);
            return $stored;
        }
        $json = gzdecode($decoded);
        if ($json === false) {
            debugging('Content Creator gzdecode() failed, returning the stored value as-is.', DEBUG_DEVELOPER);
            return $stored;
        }
        return $json;
    }
}
