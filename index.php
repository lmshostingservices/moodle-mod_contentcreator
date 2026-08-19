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
 * Content Creator - Index page
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

require('../../config.php');

$id = required_param('id', PARAM_INT);

$course = $DB->get_record('course', ['id' => $id], '*', MUST_EXIST);

require_login($course);

$coursecontext = context_course::instance($course->id);

// No require_capability() call here is deliberate, and matches every core activity
// module's index.php. This page only lists the Content Creator activities that the
// current user can already see: require_login() enforces enrolment and course
// visibility, and get_all_instances_in_course() below applies each activity's own
// visibility and availability rules per user. Adding a module-level capability check
// at course context would additionally exclude legitimate guest and role-limited
// access without protecting anything that is not already protected.

$PAGE->set_url('/mod/contentcreator/index.php', ['id' => $id]);
$PAGE->set_context($coursecontext);
$PAGE->set_title(get_string('modulenameplural', 'mod_contentcreator'));
$PAGE->set_heading($course->fullname);
$PAGE->set_pagelayout('incourse');

$event = \mod_contentcreator\event\course_module_instance_list_viewed::create(['context' => $coursecontext]);
$event->add_record_snapshot('course', $course);
$event->trigger();

echo $OUTPUT->header();
echo $OUTPUT->heading(get_string('modulenameplural', 'mod_contentcreator'));

$contentcreators = get_all_instances_in_course('contentcreator', $course);

if (empty($contentcreators)) {
    notice(get_string('noinstances', 'mod_contentcreator'), new moodle_url('/course/view.php', ['id' => $course->id]));
}

$table = new html_table();
$table->attributes['class'] = 'generaltable mod_index';
$table->head = [get_string('name')];
$table->align = ['left'];

foreach ($contentcreators as $contentcreator) {
    $url = new moodle_url('/mod/contentcreator/view.php', ['id' => $contentcreator->coursemodule]);
    $table->data[] = [html_writer::link($url, format_string($contentcreator->name))];
}

echo html_writer::table($table);

echo $OUTPUT->footer();
