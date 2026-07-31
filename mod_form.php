<?php
/**
 * Content Creator - Activity form
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

require_once($CFG->dirroot . '/course/moodleform_mod.php');

class mod_contentcreator_mod_form extends moodleform_mod {

    public function definition() {
        $mform = $this->_form;

        $mform->addElement('header', 'general', get_string('general', 'form'));

        $mform->addElement('text', 'name', get_string('contentcreatorname', 'contentcreator'), ['size' => '64']);
        $mform->setType('name', PARAM_TEXT);
        $mform->addRule('name', null, 'required', null, 'client');
        $mform->addRule('name', get_string('maximumchars', '', 255), 'maxlength', 255, 'client');
        $mform->addHelpButton('name', 'contentcreatorname', 'contentcreator');

        $this->standard_intro_elements();

        $this->standard_coursemodule_elements();

        $this->add_action_buttons();
    }

    /**
     * Add custom completion rules for "view all slides"
     *
     * @return array Array of string IDs of added items, empty array if none
     */
    public function add_completion_rules() {
        $mform = $this->_form;

        $mform->addElement(
            'checkbox',
            'completionviewallslides',
            '',
            get_string('completionviewallslides', 'contentcreator')
        );
        $mform->setType('completionviewallslides', PARAM_INT);
        $mform->addHelpButton('completionviewallslides', 'completionviewallslides', 'contentcreator');

        $mform->addElement(
            'checkbox',
            'completionallactivities',
            '',
            get_string('completionallactivities', 'contentcreator')
        );
        $mform->setType('completionallactivities', PARAM_INT);
        $mform->addHelpButton('completionallactivities', 'completionallactivities', 'contentcreator');

        return ['completionviewallslides', 'completionallactivities'];
    }

    /**
     * Called during validation. Indicates whether a module-specific completion rule is selected.
     *
     * @param array $data Input data
     * @return bool True if one or more rules is enabled, false if none are
     */
    public function completion_rule_enabled($data) {
        return !empty($data['completionviewallslides']) || !empty($data['completionallactivities']);
    }

    public function data_preprocessing(&$defaultvalues) {
        parent::data_preprocessing($defaultvalues);
    }
}
