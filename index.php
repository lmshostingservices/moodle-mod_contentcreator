<?php
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

$PAGE->set_url('/mod/contentcreator/index.php', ['id' => $id]);
$PAGE->set_title(get_string('modulenameplural', 'mod_contentcreator'));
$PAGE->set_heading($course->fullname);
$PAGE->set_pagelayout('incourse');

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
