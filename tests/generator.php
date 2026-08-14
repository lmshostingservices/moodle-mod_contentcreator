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
 * Data generator for mod_contentcreator.
 *
 * @package    mod_contentcreator
 * @category   test
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

/**
 * Data generator class for mod_contentcreator.
 *
 * @package    mod_contentcreator
 * @category   test
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class mod_contentcreator_generator extends testing_module_generator {
    /**
     * Create a new contentcreator instance.
     *
     * @param array|stdClass $record Data for module being generated.
     * @param array $options General options for course module.
     * @return stdClass The created contentcreator instance.
     */
    public function create_instance($record = null, array $options = null) {
        $record = (object)(array)$record;

        $defaultsettings = [
            'name' => 'Test Content Creator',
            'intro' => 'Test intro',
            'introformat' => FORMAT_HTML,
            'content' => '',
            'contentformat' => FORMAT_HTML,
            'timecreated' => time(),
            'timemodified' => time(),
        ];

        foreach ($defaultsettings as $name => $value) {
            if (!isset($record->{$name})) {
                $record->{$name} = $value;
            }
        }

        return parent::create_instance($record, (array)$options);
    }

    /**
     * Create a progress record for a user.
     *
     * @param stdClass $user The user.
     * @param stdClass $cm The course module.
     * @param array $progressdata The progress data.
     * @return int The record ID.
     */
    public function create_progress($user, $cm, array $progressdata = []) {
        global $DB;

        $defaultprogress = [
            'currentSlide' => 0,
            'totalSlides' => 10,
            'viewedSlides' => [],
        ];

        $progressdata = array_merge($defaultprogress, $progressdata);

        $record = new stdClass();
        $record->cmid = $cm->id;
        $record->userid = $user->id;
        $record->progress = json_encode($progressdata);
        $record->timecreated = time();
        $record->timemodified = time();

        return $DB->insert_record('contentcreator_progress', $record);
    }

    /**
     * Create an attempt record for a user.
     *
     * @param stdClass $user The user.
     * @param stdClass $contentcreator The contentcreator instance.
     * @param array $data Additional data.
     * @return int The record ID.
     */
    public function create_attempt($user, $contentcreator, array $data = []) {
        global $DB;

        $record = new stdClass();
        $record->contentcreatorid = $contentcreator->id;
        $record->userid = $user->id;
        $record->completed = $data['completed'] ?? 0;
        $record->score = $data['score'] ?? 0;
        $record->maxscore = $data['maxscore'] ?? 0;
        $record->responses = $data['responses'] ?? '';
        $record->timecreated = time();
        $record->timemodified = time();

        return $DB->insert_record('contentcreator_attempts', $record);
    }
}
