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
 * Content Creator v6.5.0 - Get manifest external function
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
 * Returns the stored manifest for a Content Creator activity.
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class get_manifest extends external_api {
    /**
     * Describes the parameters for execute().
     *
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters(
            [
                'cmid' => new external_value(PARAM_INT, 'Course module ID'),
            ]
        );
    }

    /**
     * Return the stored manifest for the given course module.
     *
     * @param int $cmid Course module id.
     * @return array Result structure as described by execute_returns().
     */
    public static function execute(int $cmid): array {
        global $DB;

        $params = self::validate_parameters(self::execute_parameters(), ['cmid' => $cmid]);

        $cm = get_coursemodule_from_id('contentcreator', $params['cmid'], 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        self::validate_context($context);

        require_capability('mod/contentcreator:view', $context);

        $contentcreator = $DB->get_record('contentcreator', ['id' => $cm->instance], '*', MUST_EXIST);

        // Version 11.48 FIX BUG-CC-DBWRITE: decompress manifest if stored compressed (gz: prefix).
        $rawmanifest = \mod_contentcreator\manifest_storage::decompress($contentcreator->manifestjson ?? '');

        // V15.6.1 REVERT-CC-ANSWER-IN-DOM. V15.5.0 stripped the answer key from this payload
        // for non-staff, which forced every challenge answer through a web service call to
        // be graded. That coupled two things which do not belong together, and the coupling
        // cost more than it bought: a learner whose network hiccupped was told their answer
        // could not be checked, on an activity that had worked offline-tolerantly for years.
        //
        // What the concealment bought was near nothing. This challenge carries no score into
        // the gradebook, and v15.4.6 had already accepted that the answer is on screen when
        // it removed Try Again from the quiz - a learner who wants the answer clicks and
        // reads it. What it cost was the reliability of the only thing that does matter.
        //
        // Completion integrity is unaffected and still lives on the server. The player
        // grades locally for the verdict it shows, then reports the answer in the background
        // to mod_contentcreator_check_answer, which re-reads the answer key from the stored
        // manifest and decides for itself. The evidence row stays unforgeable; only the
        // message on screen is now instant and local.
        return [
            'success' => true,
            'manifest' => $rawmanifest,
            'version' => $contentcreator->manifestversion ?? '',
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
                'manifest' => new external_value(
                    PARAM_RAW, // Pipeline-ignore: PARAM_RAW - JSON or free-form text, decoded and validated on use.
                    'JSON manifest',
                ),
                'version' => new external_value(PARAM_TEXT, 'Manifest version'),
            ]
        );
    }
}
