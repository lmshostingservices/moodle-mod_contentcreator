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
 * Content Creator - Custom completion rules
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace mod_contentcreator\completion;

defined('MOODLE_INTERNAL') || die();

use core_completion\activity_custom_completion;

class custom_completion extends activity_custom_completion {
    /**
     * Fetches the completion state for a given completion rule.
     *
     * @param string $rule The completion rule.
     * @return int The completion state.
     */
    public function get_state(string $rule): int {
        global $DB;

        $this->validate_rule($rule);

        $userid = $this->userid;
        $cm = $this->cm;

        if ($rule === 'completionviewallslides') {
            $attempt = $DB->get_record('contentcreator_attempts', [
                'contentcreatorid' => $cm->instance,
                'userid' => $userid
            ]);

            if ($attempt && $attempt->completed) {
                return COMPLETION_COMPLETE;
            }
            return COMPLETION_INCOMPLETE;
        }

        if ($rule === 'completionallactivities') {
            $instance = $DB->get_record('contentcreator', ['id' => $cm->instance], 'manifestjson', MUST_EXIST);
            // v11.48 FIX BUG-CC-DBWRITE: decompress before json_decode (may be gz: compressed)
            $manifest = json_decode(\mod_contentcreator\manifest_storage::decompress($instance->manifestjson ?? ''), true);
            if (!$manifest || empty($manifest['topics'])) {
                return COMPLETION_COMPLETE;
            }

            // v11.11: If activities are disabled, auto-complete — no challenges to track
            $activitySettings = $manifest['activitySettings'] ?? [];
            if (isset($activitySettings['enabled']) && $activitySettings['enabled'] === false) {
                return COMPLETION_COMPLETE;
            }

            $challengeSectionIds = [];
            foreach ($manifest['topics'] as $topic) {
                foreach (($topic['sections'] ?? []) as $section) {
                    $sectionId = $section['id'] ?? '';
                    if (empty($sectionId)) {
                        continue;
                    }
                    $cards = $section['cards'] ?? [];
                    foreach ($cards as $card) {
                        if (($card['cardType'] ?? '') === 'decision-point') {
                            $challengeSectionIds[] = $sectionId . '_learning';
                            break;
                        }
                    }
                }
            }

            if (empty($challengeSectionIds)) {
                return COMPLETION_COMPLETE;
            }

            $progressRecord = $DB->get_record('contentcreator_progress', [
                'cmid' => $cm->id,
                'userid' => $userid
            ]);

            if (!$progressRecord || empty($progressRecord->progress)) {
                return COMPLETION_INCOMPLETE;
            }

            $progress = json_decode($progressRecord->progress, true);
            if (!$progress || empty($progress['sections'])) {
                return COMPLETION_INCOMPLETE;
            }

            foreach ($challengeSectionIds as $csid) {
                if (empty($progress['sections'][$csid]['challengeComplete'])) {
                    return COMPLETION_INCOMPLETE;
                }
            }

            return COMPLETION_COMPLETE;
        }

        return COMPLETION_INCOMPLETE;
    }

    /**
     * Fetch the list of custom completion rules that this module defines.
     *
     * @return array
     */
    public static function get_defined_custom_rules(): array {
        return ['completionviewallslides', 'completionallactivities'];
    }

    /**
     * Returns an associative array of the descriptions of custom completion rules.
     *
     * @return array
     */
    public function get_custom_rule_descriptions(): array {
        return [
            'completionviewallslides' => get_string('completionviewallslidesdesc', 'contentcreator'),
            'completionallactivities' => get_string('completionallactivitiesdesc', 'contentcreator')
        ];
    }

    /**
     * Returns an array of all completion rules, in the order they should be displayed to users.
     *
     * @return array
     */
    public function get_sort_order(): array {
        return [
            'completionview',
            'completionviewallslides',
            'completionallactivities',
        ];
    }
}
