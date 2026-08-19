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
 * Content Creator v6.5.0 - View page
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

require('../../config.php');

$id = required_param('id', PARAM_INT);

$cm = get_coursemodule_from_id('contentcreator', $id, 0, false, MUST_EXIST);
$course = $DB->get_record('course', ['id' => $cm->course], '*', MUST_EXIST);
$contentcreator = $DB->get_record('contentcreator', ['id' => $cm->instance], '*', MUST_EXIST);

require_login($course, true, $cm);

$context = context_module::instance($cm->id);
require_capability('mod/contentcreator:view', $context);

$PAGE->set_url('/mod/contentcreator/view.php', ['id' => $id]);
$PAGE->set_title($contentcreator->name);
$PAGE->set_heading($course->fullname);
$PAGE->set_context($context);

// FIX-CC-COMPLETION-SPLIT (v13.12): Event trigger happens BEFORE the header (correct Moodle
// pattern). Completion tracking (update_state) happens AFTER the header once write_close()
// has been called explicitly — avoiding both the "set_module_viewed before header" and the
// "$SESSION->editedpages mutated after closed" debug warnings. See lib.php for full context.

// No remote web font is loaded: sending every learner's IP address to a third party
// without consent is a privacy problem and the request fails outright on firewalled
// sites. The stylesheets in styles/ declare a system font stack fallback instead.

// CSS cache-busting: use plugin version as ?ver= so every release forces browsers
// and CDNs to re-fetch the files. Plain-string paths have NO cache-busting and
// browsers serve stale cached copies even after the plugin is upgraded.
$cssver = get_config('mod_contentcreator', 'version');
// The design tokens and the shared card layer now live in the plugin's top-level styles.css,
// which Moodle folds into the theme's aggregated, minified and cached stylesheet. Only the two
// large screen-specific sheets are still requested separately: adding 750 KB of player and
// builder CSS to the theme aggregate would load it on every page of the site to serve one
// page type, which is a worse trade than one extra cacheable request here.
if (has_capability('mod/contentcreator:manage', $context)) {
    // The builder wizard is only rendered for users who can manage the activity.
    $PAGE->requires->css(new moodle_url('/mod/contentcreator/styles/builder.css', ['ver' => $cssver]));
}
$PAGE->requires->css(new moodle_url('/mod/contentcreator/styles/player5.css', ['ver' => $cssver]));

$canmanage = has_capability('mod/contentcreator:manage', $context);

// Check whether the manifest exists and is locked (content has been generated).
// v7.1.3: Added backward compatibility for older manifests without a locked flag.
$islocked = false;
if (!empty($contentcreator->manifestjson)) {
    // FIX BUG-CC-DBWRITE (v11.48): decompress before json_decode (may be gz: compressed).
    $manifestdata = json_decode(\mod_contentcreator\manifest_storage::decompress($contentcreator->manifestjson), true);

    // Primary check: explicit locked flag.
    if (isset($manifestdata['locked']) && $manifestdata['locked'] === true) {
        $islocked = true;
    } else if (!empty($manifestdata['topics']) && is_array($manifestdata['topics'])) {
        // Backward compatibility fix (v7.1.3): older manifests may not carry a locked
        // property but still hold generated content. Checking for generated sections
        // prevents regeneration after an upgrade.
        foreach ($manifestdata['topics'] as $topic) {
            $sections = $topic['sections'] ?? $topic['subtopics'] ?? [];
            foreach ($sections as $section) {
                if (isset($section['generated']) && $section['generated'] === true) {
                    $islocked = true;
                    break 2;
                }
                if (!empty($section['content']) || !empty($section['slideHtml'])) {
                    $islocked = true;
                    break 2;
                }
            }
        }
    }
}

// Check for the edit mode parameter, which allows teachers to go back to the builder.
$editmode = optional_param('edit', 0, PARAM_INT);

// SECURITY: no vendor credentials are ever emitted to the browser. Every call to the
// vendor API is made server-side by ajax.php, which injects the site id and API key
// itself and only accepts an allowlisted endpoint key from the client.
if ($canmanage && (!$islocked || $editmode)) {
    // Show the builder for teachers when there is no content, or when in edit mode.
    $enablevoice = get_config('mod_contentcreator', 'enablevoice') ?: 1;
    $voicelanguage = get_config('mod_contentcreator', 'voicelanguage') ?: 'en-AU';

    $PAGE->requires->js_call_amd('mod_contentcreator/builder', 'init', [[
        'cmid' => $cm->id,
        'enableVoice' => (bool)$enablevoice,
        'voiceLanguage' => $voicelanguage,
    ]]);
} else {
    // Show the player for students, and for teachers when content is locked and edit mode is off.
    $requirefocus = get_config('mod_contentcreator', 'requirefocus') ?: 0;

    // Only show the Edit button when Moodle's edit mode is on, the top right toggle (v6.5.3).
    // v11.12 FIX: $PAGE->user_is_editing() returns false on mod/xxx/view.php pages because
    // the activity page never calls $PAGE->set_editing(). The Moodle editing toggle sets
    // $USER->editing globally, so check that instead.
    $caneditslides = $canmanage && !empty($USER->editing);

    $PAGE->requires->js_call_amd('mod_contentcreator/player5', 'init', [[
        'cmid' => $cm->id,
        'canEdit' => $caneditslides,
        'isTeacher' => (bool)$canmanage,
        'requireFocus' => (bool)$requirefocus,
        'courseUrl' => (new moodle_url('/course/view.php', ['id' => $cm->course]))->out(false),
    ]]);
}

// FIX-CC-COMPLETION-SPLIT (v13.12): Event trigger only — no write_close() inside,
// so $OUTPUT->header() can still write $SESSION->editedpages safely.
contentcreator_view($contentcreator, $course, $cm, $context);

echo $OUTPUT->header();

// FIX-CC-COMPLETION-SPLIT (v13.12): Completion tracking AFTER header.
// $OUTPUT->header() has already written all session data (editedpages, etc.).
// We now close the session ourselves and call update_state() directly.
// update_state() has NO is_header_printed() check, so no DEBUG_DEVELOPER warning fires.
// set_module_viewed() is intentionally NOT used here — it would trigger either the
// "before header" or "session mutation" warning. This approach produces neither.
\core\session\manager::write_close();
$completion = new completion_info($course);
$completion->update_state($cm, COMPLETION_VIEWED);

echo html_writer::div('', 'contentcreator-container', ['id' => 'contentcreator-app', 'data-cmid' => $cm->id]);

// Add Moodle's standard prev/next activity navigation links (v11.37) so students
// can move to the next activity in the course sequence without going back to the course page.
echo $OUTPUT->activity_navigation();

echo $OUTPUT->footer();
