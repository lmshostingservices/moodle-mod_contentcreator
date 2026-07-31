<?php
/**
 * Backup task for mod_contentcreator
 *
 * @package    mod_contentcreator
 * @copyright  2024 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

require_once($CFG->dirroot . '/mod/contentcreator/backup/moodle2/backup_contentcreator_stepslib.php');

/**
 * Provides the steps to perform one complete backup of the Content Creator instance
 */
class backup_contentcreator_activity_task extends backup_activity_task {

    /**
     * No specific settings for this activity
     */
    protected function define_my_settings() {
    }

    /**
     * Defines a backup step to store the instance data in the contentcreator.xml file
     */
    protected function define_my_steps() {
        $this->add_step(new backup_contentcreator_activity_structure_step('contentcreator_structure', 'contentcreator.xml'));
    }

    /**
     * Encodes URLs to the index.php and view.php scripts
     *
     * @param string $content some HTML text that eventually contains URLs to the activity instance scripts
     * @return string the content with the URLs encoded
     */
    public static function encode_content_links($content) {
        global $CFG;

        $base = preg_quote($CFG->wwwroot, '/');

        // Link to the list of contentcreator instances
        $search = '/(' . $base . '\/mod\/contentcreator\/index.php\?id\=)([0-9]+)/';
        $content = preg_replace($search, '$@CONTENTCREATORINDEX*$2@$', $content);

        // Link to contentcreator view by moduleid
        $search = '/(' . $base . '\/mod\/contentcreator\/view.php\?id\=)([0-9]+)/';
        $content = preg_replace($search, '$@CONTENTCREATORVIEWBYID*$2@$', $content);

        return $content;
    }
}
