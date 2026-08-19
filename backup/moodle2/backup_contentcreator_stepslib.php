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
 * Backup steps for mod_contentcreator.
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

/**
 * Defines the complete contentcreator structure for backup, with file and id annotations.
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class backup_contentcreator_activity_structure_step extends backup_activity_structure_step {
    /**
     * Define the structure of the contentcreator.xml file.
     *
     * @return backup_nested_element The prepared activity structure.
     */
    protected function define_structure() {

        $userinfo = $this->get_setting_value('userinfo');

        $contentcreator = new backup_nested_element('contentcreator', ['id'], [
            'name',
            'intro',
            'introformat',
            'manifestjson',
            'manifestversion',
            'completionviewallslides',
            'completionallactivities',
            'timecreated',
            'timemodified',
        ]);

        $attempts = new backup_nested_element('attempts');
        $attempt = new backup_nested_element('attempt', ['id'], [
            'contentcreatorid',
            'userid',
            'score',
            'maxscore',
            'completed',
            'responses',
            'attemptdata',
            'timecreated',
            'timemodified',
        ]);

        $progresses = new backup_nested_element('progresses');
        $progress = new backup_nested_element('progress', ['id'], [
            'cmid',
            'userid',
            'progress',
            'timecreated',
            'timemodified',
        ]);

        $checklists = new backup_nested_element('checklists');
        $checklist = new backup_nested_element('checklist', ['id'], [
            'cmid',
            'userid',
            'topicid',
            'complete',
            'timecreated',
            'timemodified',
        ]);

        $contentcreator->add_child($attempts);
        $attempts->add_child($attempt);
        $contentcreator->add_child($progresses);
        $progresses->add_child($progress);
        $contentcreator->add_child($checklists);
        $checklists->add_child($checklist);

        $contentcreator->set_source_table('contentcreator', ['id' => backup::VAR_ACTIVITYID]);

        if ($userinfo) {
            $attempt->set_source_table('contentcreator_attempts', ['contentcreatorid' => backup::VAR_PARENTID]);

            // Progress and checklist rows are keyed by cmid rather than by instance id,
            // so they are reached through course_modules.instance.
            $progress->set_source_sql(
                '
                SELECT cp.*
                  FROM {contentcreator_progress} cp
                  JOIN {course_modules} cm ON cm.id = cp.cmid
                 WHERE cm.instance = ?',
                [backup::VAR_PARENTID]
            );

            $checklist->set_source_sql(
                '
                SELECT cc.*
                  FROM {contentcreator_checklist} cc
                  JOIN {course_modules} cm ON cm.id = cc.cmid
                 WHERE cm.instance = ?',
                [backup::VAR_PARENTID]
            );
        }

        $attempt->annotate_ids('user', 'userid');
        $progress->annotate_ids('user', 'userid');
        $checklist->annotate_ids('user', 'userid');

        $contentcreator->annotate_files('mod_contentcreator', 'intro', null);

        // Generated voiceover audio. The itemid of these files is the cmid, not the id
        // of any annotated element, so they are annotated with a null itemid here and
        // the itemid is remapped explicitly by the restore step.
        $contentcreator->annotate_files('mod_contentcreator', 'voiceovers', null);

        return $this->prepare_activity_structure($contentcreator);
    }
}
