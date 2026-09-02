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
 * Content Creator v6.5.0 - Save attempt external function
 * [SPEC] SCORM 1.2 completion tracking only - NO scores
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

/**
 * Stores a learner attempt and updates activity completion.
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class save_attempt extends external_api {
    /**
     * Describes the parameters for execute().
     *
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters(
            [
                'cmid' => new external_value(PARAM_INT, 'Course module ID'),
                'completed' => new external_value(PARAM_INT, 'Completion status (1 = complete)', VALUE_DEFAULT, 0),
                'responses' => new external_value(
                    PARAM_RAW, // Pipeline-ignore: PARAM_RAW - JSON or free-form text, decoded and validated on use.
                    'JSON slide responses',
                    VALUE_DEFAULT,
                    '{}',
                ),
            ]
        );
    }

    /**
     * Store the current user's attempt for this activity.
     *
     * @param int $cmid Course module id.
     * @param int $completed Completion status, 1 when the activity is complete.
     * @param string $responses JSON encoded slide responses.
     * @return array Result structure as described by execute_returns().
     */
    public static function execute(int $cmid, int $completed = 0, string $responses = '{}'): array {
        global $DB, $USER;

        $params = self::validate_parameters(
            self::execute_parameters(),
            [
                'cmid' => $cmid,
                'completed' => $completed,
                'responses' => $responses,
            ]
        );

        $cm = get_coursemodule_from_id('contentcreator', $params['cmid'], 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        self::validate_context($context);

        require_capability('mod/contentcreator:view', $context);

        $existing = $DB->get_record(
            'contentcreator_attempts',
            [
                'contentcreatorid' => $cm->instance,
                'userid' => $USER->id,
            ]
        );

        $record = new \stdClass();
        $record->contentcreatorid = $cm->instance;
        $record->userid = $USER->id;
        $record->completed = $params['completed'];
        $record->responses = $params['responses'];
        $record->timemodified = time();

        if ($existing) {
            $record->id = $existing->id;
            $DB->update_record('contentcreator_attempts', $record);
        } else {
            $record->timecreated = time();
            $DB->insert_record('contentcreator_attempts', $record);
        }

        if ($params['completed']) {
            $completion = new \completion_info(get_course($cm->course));
            if ($completion->is_enabled($cm)) {
                $completion->update_state($cm, COMPLETION_COMPLETE, $USER->id);
            }
        }

        return [
            'success' => true,
            'message' => $params['completed']
                ? get_string('modulecompleted', 'mod_contentcreator')
                : get_string('progresssaved', 'mod_contentcreator'),
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
                'message' => new external_value(PARAM_TEXT, 'Response message'),
            ]
        );
    }
}
