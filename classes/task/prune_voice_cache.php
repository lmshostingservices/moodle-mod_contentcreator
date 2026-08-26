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
 * Scheduled task that prunes the site-wide text-to-speech audio cache.
 *
 * @package    mod_contentcreator
 * @copyright  2026 LMS-Labs
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace mod_contentcreator\task;

/**
 * Delete site-wide voice cache files that have not been used recently.
 *
 * Added in v13.85. Generated audio is cached in the system context so that
 * identical text, voice and language combinations are never billed twice. Until
 * now nothing ever removed those files: they survived activity deletion, course
 * deletion and site reset, because contentcreator_delete_instance() only clears
 * the module context. On a busy site that is unbounded moodledata growth.
 *
 * @package    mod_contentcreator
 * @copyright  2026 LMS-Labs
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class prune_voice_cache extends \core\task\scheduled_task {
    /** Default retention if the admin setting is unset, in days. */
    const DEFAULT_RETENTION_DAYS = 180;

    /**
     * Name shown in Site administration > Server > Scheduled tasks.
     *
     * @return string
     */
    public function get_name(): string {
        return get_string('taskprunevoicecache', 'mod_contentcreator');
    }

    /**
     * Delete cached audio older than the configured retention period.
     *
     * Deleting a cache entry costs nothing but the credits to regenerate that
     * exact text again, so the retention default is deliberately long.
     *
     * @return void
     */
    public function execute(): void {
        $days = get_config('mod_contentcreator', 'voicecacheretention');
        if ($days === false || $days === '' || !is_numeric($days)) {
            $days = self::DEFAULT_RETENTION_DAYS;
        }
        $days = (int)$days;
        if ($days <= 0) {
            mtrace('Content Creator: voice cache retention is disabled; nothing pruned.');
            return;
        }

        $cutoff = time() - ($days * DAYSECS);
        $fs = get_file_storage();
        $context = \context_system::instance();

        $files = $fs->get_area_files(
            $context->id,
            'mod_contentcreator',
            'voice_cache',
            0,
            'timemodified',
            false
        );

        $deleted = 0;
        $bytes = 0;
        foreach ($files as $file) {
            if ($file->get_timemodified() >= $cutoff) {
                continue;
            }
            $bytes += $file->get_filesize();
            $file->delete();
            $deleted++;
        }

        mtrace('Content Creator: pruned ' . $deleted . ' cached voiceover file(s), ' .
            round($bytes / 1048576, 1) . ' MB, older than ' . $days . ' days.');
    }
}
