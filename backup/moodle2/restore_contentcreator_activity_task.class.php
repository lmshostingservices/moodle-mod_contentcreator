<?php
/**
 * Restore task for mod_contentcreator
 *
 * @package    mod_contentcreator
 * @copyright  2024 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

require_once($CFG->dirroot . '/mod/contentcreator/backup/moodle2/restore_contentcreator_stepslib.php');

/**
 * Contentcreator restore task that provides all the settings and steps to perform one complete restore of the activity
 */
class restore_contentcreator_activity_task extends restore_activity_task {

    /**
     * Define (add) particular settings this activity can have
     */
    protected function define_my_settings() {
        // No particular settings for this activity.
    }

    /**
     * Define (add) particular steps this activity can have
     */
    protected function define_my_steps() {
        // Contentcreator only has one structure step.
        $this->add_step(new restore_contentcreator_activity_structure_step('contentcreator_structure', 'contentcreator.xml'));
    }

    /**
     * Define the contents in the activity that must be processed by the link decoder
     *
     * @return array
     */
    public static function define_decode_contents() {
        $contents = array();

        $contents[] = new restore_decode_content('contentcreator', array('intro'), 'contentcreator');

        return $contents;
    }

    /**
     * Define the decoding rules for links belonging to the activity to be executed by the link decoder
     *
     * @return array of restore_decode_rule
     */
    public static function define_decode_rules() {
        $rules = array();

        $rules[] = new restore_decode_rule('CONTENTCREATORVIEWBYID', '/mod/contentcreator/view.php?id=$1', 'course_module');
        $rules[] = new restore_decode_rule('CONTENTCREATORINDEX', '/mod/contentcreator/index.php?id=$1', 'course');

        return $rules;
    }

    /**
     * Define the restore log rules that will be applied by the restore_logs_processor when restoring
     * contentcreator logs.
     *
     * @return array of restore_log_rule
     */
    public static function define_restore_log_rules() {
        $rules = array();

        $rules[] = new restore_log_rule('contentcreator', 'add', 'view.php?id={course_module}', '{contentcreator}');
        $rules[] = new restore_log_rule('contentcreator', 'update', 'view.php?id={course_module}', '{contentcreator}');
        $rules[] = new restore_log_rule('contentcreator', 'view', 'view.php?id={course_module}', '{contentcreator}');

        return $rules;
    }

    /**
     * Define the restore log rules that will be applied by the restore_logs_processor when restoring
     * course logs.
     *
     * @return array of restore_log_rule
     */
    public static function define_restore_log_rules_for_course() {
        $rules = array();

        $rules[] = new restore_log_rule('contentcreator', 'view all', 'index.php?id={course}', null);

        return $rules;
    }
}
