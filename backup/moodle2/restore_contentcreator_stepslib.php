<?php
/**
 * Restore steps for mod_contentcreator
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

class restore_contentcreator_activity_structure_step extends restore_activity_structure_step {

    protected function define_structure() {

        $paths = array();
        $userinfo = $this->get_setting_value('userinfo');

        $paths[] = new restore_path_element('contentcreator', '/activity/contentcreator');

        if ($userinfo) {
            $paths[] = new restore_path_element('contentcreator_attempt', '/activity/contentcreator/attempts/attempt');
            $paths[] = new restore_path_element('contentcreator_progress', '/activity/contentcreator/progresses/progress');
        }

        return $this->prepare_activity_structure($paths);
    }

    protected function process_contentcreator($data) {
        global $DB;

        $data = (object)$data;
        $oldid = $data->id;
        $data->course = $this->get_courseid();

        $newitemid = $DB->insert_record('contentcreator', $data);
        $this->apply_activity_instance($newitemid);
    }

    protected function process_contentcreator_attempt($data) {
        global $DB;

        $data = (object)$data;
        $oldid = $data->id;

        $data->contentcreatorid = $this->get_new_parentid('contentcreator');
        $data->userid = $this->get_mappingid('user', $data->userid);

        $DB->insert_record('contentcreator_attempts', $data);
    }

    protected function process_contentcreator_progress($data) {
        global $DB;

        $data = (object)$data;
        $oldid = $data->id;

        $data->cmid = $this->task->get_moduleid();
        $data->userid = $this->get_mappingid('user', $data->userid);

        $DB->insert_record('contentcreator_progress', $data);
    }

    protected function after_execute() {
        $this->add_related_files('mod_contentcreator', 'intro', null);
    }
}
