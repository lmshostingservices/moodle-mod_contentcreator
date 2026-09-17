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
 * Content Creator - Activity form
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

require_once($CFG->dirroot . '/course/moodleform_mod.php');

/**
 * Activity settings form for mod_contentcreator.
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class mod_contentcreator_mod_form extends moodleform_mod {
    /**
     * Define the activity settings form.
     *
     * @return void
     */
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
     * Add the custom completion rules for this activity.
     *
     * @return array Array of element names added to the form, empty if none.
     */
    public function add_completion_rules() {
        $mform = $this->_form;

        // FIX-CC-COMPLETION-RULES-INVISIBLE (v15.4.31).
        //
        // Since Moodle 4.3, moodleform_mod appends get_suffix() to completion element
        // names when the form is rendered inside the course-level "Default activity
        // completion" / bulk-edit screens. Without it the elements are named differently
        // from what that screen expects, so both custom rules are invisible and
        // unsettable there - and completion_rule_enabled() looks up keys that are not in
        // $data, so it reports no rule enabled even when one is.
        //
        // The site this was found on runs Moodle 5.2.2, so this is live, not theoretical.
        // get_suffix() returns '' on the ordinary module settings form, which is why the
        // defect is invisible in the place authors usually look.
        $suffix = method_exists($this, 'get_suffix') ? $this->get_suffix() : '';

        $viewall = 'completionviewallslides' . $suffix;
        $mform->addElement(
            'checkbox',
            $viewall,
            '',
            get_string('completionviewallslides', 'contentcreator')
        );
        $mform->setType($viewall, PARAM_INT);
        $mform->addHelpButton($viewall, 'completionviewallslides', 'contentcreator');

        $allact = 'completionallactivities' . $suffix;
        $mform->addElement(
            'checkbox',
            $allact,
            '',
            get_string('completionallactivities', 'contentcreator')
        );
        $mform->setType($allact, PARAM_INT);
        $mform->addHelpButton($allact, 'completionallactivities', 'contentcreator');

        return [$viewall, $allact];
    }

    /**
     * Called during validation. Indicates whether a module-specific completion rule is selected.
     *
     * @param array $data Input data.
     * @return bool True if one or more rules is enabled, false if none are.
     */
    public function completion_rule_enabled($data) {
        // V15.4.31: must read the same suffixed keys add_completion_rules() wrote.
        $suffix = method_exists($this, 'get_suffix') ? $this->get_suffix() : '';
        return !empty($data['completionviewallslides' . $suffix])
            || !empty($data['completionallactivities' . $suffix]);
    }
}
