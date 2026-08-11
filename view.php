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

// Load Google Fonts via PHP (NOT via @import in tokens.css which breaks Moodle CSS minifier).
$PAGE->requires->css(new moodle_url('https://fonts.googleapis.com/css2', [
    'family' => 'Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600',
    'display' => 'swap'
]));
// CSS cache-busting: use plugin version as ?ver= so every release forces browsers
// and CDNs to re-fetch the files. Plain-string paths have NO cache-busting and
// browsers serve stale cached copies even after the plugin is upgraded.
$cc_css_ver = get_config('mod_contentcreator', 'version');
$PAGE->requires->css(new moodle_url('/mod/contentcreator/styles/tokens.css',  ['ver' => $cc_css_ver]));
$PAGE->requires->css(new moodle_url('/mod/contentcreator/styles/builder.css', ['ver' => $cc_css_ver]));
$PAGE->requires->css(new moodle_url('/mod/contentcreator/styles/cards.css',   ['ver' => $cc_css_ver]));
$PAGE->requires->css(new moodle_url('/mod/contentcreator/styles/player5.css', ['ver' => $cc_css_ver]));

$hasCapability = has_capability('mod/contentcreator:addinstance', $context);

// Check if manifest exists and is locked (content generated)
// v7.1.3: Added backward compatibility for older manifests without locked flag
$isLocked = false;
if (!empty($contentcreator->manifestjson)) {
    // v11.48 FIX BUG-CC-DBWRITE: decompress before json_decode (may be gz: compressed)
    $manifestData = json_decode(\mod_contentcreator\manifest_storage::decompress($contentcreator->manifestjson), true);
    
    // Primary check: explicit locked flag
    if (isset($manifestData['locked']) && $manifestData['locked'] === true) {
        $isLocked = true;
    } 
    // v7.1.3 BACKWARD COMPATIBILITY FIX:
    // Older manifests may not have locked property but still have generated content.
    // Check if manifest has topics with generated sections - prevents regeneration after upgrade.
    elseif (!empty($manifestData['topics']) && is_array($manifestData['topics'])) {
        foreach ($manifestData['topics'] as $topic) {
            $sections = $topic['sections'] ?? $topic['subtopics'] ?? [];
            foreach ($sections as $section) {
                if (isset($section['generated']) && $section['generated'] === true) {
                    $isLocked = true;
                    break 2;
                }
                if (!empty($section['content']) || !empty($section['slideHtml'])) {
                    $isLocked = true;
                    break 2;
                }
            }
        }
    }
}

// Check for edit mode parameter - allows teachers to go back to builder
$editMode = optional_param('edit', 0, PARAM_INT);

if ($hasCapability && (!$isLocked || $editMode)) {
    // Show builder for teachers when no content OR in edit mode
    $enablevoice = get_config('mod_contentcreator', 'enablevoice') ?: 1;
    $voicelanguage = get_config('mod_contentcreator', 'voicelanguage') ?: 'en-AU';
    
    // Get Site ID and API Key using priority-based fallback pattern:
    // 1. Try local_aiconfig (central config - preferred)
    // 2. Fall back to mod_contentcreator settings
    $siteId = get_config('local_aiconfig', 'siteid');
    if (empty($siteId)) {
        $siteId = get_config('mod_contentcreator', 'siteid');
    }
    $apiKey = get_config('local_aiconfig', 'apikey');
    if (empty($apiKey)) {
        $apiKey = get_config('mod_contentcreator', 'apikey');
    }
    
    // Pass config to JavaScript via inline script (CC_CONFIG global)
    $jsConfig = json_encode([
        'siteId' => $siteId ?: '',
        'apiKey' => $apiKey ?: ''
    ]);
    $PAGE->requires->js_init_code("window.CC_CONFIG = {$jsConfig};", true);

    $PAGE->requires->js_call_amd('mod_contentcreator/builder', 'init', [[
        'cmid' => $cm->id,
        'enableVoice' => (bool)$enablevoice,
        'voiceLanguage' => $voicelanguage
    ]]);
} else {
    // Show player for students, OR for teachers when content is locked (not in edit mode)
    $requirefocus = get_config('mod_contentcreator', 'requirefocus') ?: 0;
    
    // v6.5.3: Only show Edit button when Moodle's Edit mode is ON (top right toggle)
    // v11.12 FIX: $PAGE->user_is_editing() returns false on mod/xxx/view.php pages
    // because the activity page never calls $PAGE->set_editing(). The Moodle editing
    // toggle sets $USER->editing globally, so check that instead.
    global $USER;
    $canEditSlides = $hasCapability && !empty($USER->editing);
    
    // v6.7.6: Get credentials for image generation (only passed for editors)
    // v12.19 FIX: Expanded from canEditSlides to hasCapability so that teachers
    // with Moodle edit mode OFF (isTeacher=true, canEdit=false) also receive
    // credentials. The isTeacher code paths added in v12.16 call TTS API for
    // voiceover generation — without siteId/apiKey those calls fail with 401.
    $siteId = '';
    $apiKey = '';
    if ($hasCapability) {
        $siteId = get_config('local_aiconfig', 'siteid');
        if (empty($siteId)) {
            $siteId = get_config('mod_contentcreator', 'siteid');
        }
        $apiKey = get_config('local_aiconfig', 'apikey');
        if (empty($apiKey)) {
            $apiKey = get_config('mod_contentcreator', 'apikey');
        }
    }
    
    $PAGE->requires->js_call_amd('mod_contentcreator/player5', 'init', [[
        'cmid' => $cm->id,
        'canEdit' => $canEditSlides,
        'isTeacher' => (bool)$hasCapability,
        'requireFocus' => (bool)$requirefocus,
        'siteId' => $siteId ?: '',
        'apiKey' => $apiKey ?: '',
        'courseUrl' => (new moodle_url('/course/view.php', ['id' => $cm->course]))->out(false)
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

// v11.37: Add Moodle's standard prev/next activity navigation links so students
// can move to the next activity in the course sequence without going back to the course page.
echo $OUTPUT->activity_navigation();

echo $OUTPUT->footer();
