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
 * Content Creator v6.5.0 - Record section view external function
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
 * Records that a learner has viewed a section.
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class record_section_view extends external_api {
    /**
     * Describes the parameters for execute().
     *
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters(
            [
                'cmid' => new external_value(PARAM_INT, 'Course module ID'),
                'topicIndex' => new external_value(PARAM_INT, 'Topic index'),
                'sectionIndex' => new external_value(PARAM_INT, 'Section index'),
            ]
        );
    }

    /**
     * Record that the current user viewed a section.
     *
     * @param int $cmid Course module id.
     * @param int $topicindex Topic index within the manifest.
     * @param int $sectionindex Section index within the topic.
     * @return array Result structure as described by execute_returns().
     */
    public static function execute(int $cmid, int $topicindex, int $sectionindex): array {
        global $USER;

        $params = self::validate_parameters(
            self::execute_parameters(),
            [
                'cmid' => $cmid,
                'topicIndex' => $topicindex,
                'sectionIndex' => $sectionindex,
            ]
        );

        $cm = get_coursemodule_from_id('contentcreator', $params['cmid'], 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        self::validate_context($context);

        require_capability('mod/contentcreator:view', $context);

        // V15.5.0 FIX-CC-COMPLETION-FORGEABLE: this method validated its parameters,
        // returned success and wrote nothing. It was named as though it were the
        // evidence trail behind completion, and completion was in fact decided by a
        // `completed` flag the browser POSTed to ajax.php. It now records the view -
        // against the section id the server resolves from its own manifest, not from
        // anything the caller supplies beyond a pair of indices that have to be in range.
        $manifest = \mod_contentcreator\evidence::manifest($cm);
        $section = $manifest['topics'][$params['topicIndex']]['sections'][$params['sectionIndex']] ?? null;
        $sectionid = is_array($section) ? (string)($section['id'] ?? '') : '';

        if ($sectionid === '') {
            // Out of range, or a section with no id. Nothing to attach evidence to, and
            // failing the call would break a player that is merely ahead of a manifest
            // edit, so report the no-op honestly instead.
            return [
                'success' => false,
                'message' => get_string('errorsectionnotinactivity', 'mod_contentcreator'),
            ];
        }

        \mod_contentcreator\evidence::record_view((int)$cm->id, (int)$USER->id, $sectionid);

        return [
            'success' => true,
            'message' => get_string('sectionviewrecorded', 'mod_contentcreator'),
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
