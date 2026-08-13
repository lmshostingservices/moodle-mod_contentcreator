<?php
/**
 * Backup steps for mod_contentcreator
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

class backup_contentcreator_activity_structure_step extends backup_activity_structure_step {

    protected function define_structure() {

        $userinfo = $this->get_setting_value('userinfo');

        $contentcreator = new backup_nested_element('contentcreator', array('id'), array(
            'name',
            'intro',
            'introformat',
            'manifestjson',
            'manifestversion',
            'completionviewallslides',
            'completionallactivities',
            'timecreated',
            'timemodified'
        ));

        $attempts = new backup_nested_element('attempts');
        $attempt = new backup_nested_element('attempt', array('id'), array(
            'contentcreatorid',
            'userid',
            'score',
            'maxscore',
            'completed',
            'responses',
            'attemptdata',
            'timecreated',
            'timemodified'
        ));

        $progresses = new backup_nested_element('progresses');
        $progress = new backup_nested_element('progress', array('id'), array(
            'cmid',
            'userid',
            'progress',
            'timecreated',
            'timemodified'
        ));

        $contentcreator->add_child($attempts);
        $attempts->add_child($attempt);
        $contentcreator->add_child($progresses);
        $progresses->add_child($progress);

        $contentcreator->set_source_table('contentcreator', array('id' => backup::VAR_ACTIVITYID));

        if ($userinfo) {
            $attempt->set_source_table('contentcreator_attempts', array('contentcreatorid' => backup::VAR_PARENTID));
            $progress->set_source_sql('
                SELECT cp.*
                FROM {contentcreator_progress} cp
                JOIN {course_modules} cm ON cm.id = cp.cmid
                WHERE cm.instance = ?',
                array(backup::VAR_PARENTID));
        }

        $attempt->annotate_ids('user', 'userid');
        $progress->annotate_ids('user', 'userid');

        $contentcreator->annotate_files('mod_contentcreator', 'intro', null);

        return $this->prepare_activity_structure($contentcreator);
    }
}
