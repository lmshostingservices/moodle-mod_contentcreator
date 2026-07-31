<?php
/**
 * Content Creator - Library functions
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

function contentcreator_supports($feature) {
    switch ($feature) {
        case FEATURE_MOD_INTRO:
            return true;
        case FEATURE_SHOW_DESCRIPTION:
            return true;
        case FEATURE_GRADE_HAS_GRADE:
            return false; // No grading - simple completion only
        case FEATURE_BACKUP_MOODLE2:
            return true;
        case FEATURE_COMPLETION_TRACKS_VIEWS:
            return true;
        case FEATURE_COMPLETION_HAS_RULES:
            return true;
        default:
            return null;
    }
}

function contentcreator_add_instance($contentcreator, ?object $mform = null) {
    global $DB;

    $contentcreator->timecreated = time();
    $contentcreator->timemodified = time();
    $contentcreator->manifestjson = null;
    $contentcreator->manifestversion = null;

    $id = $DB->insert_record('contentcreator', $contentcreator);
    $contentcreator->id = $id;

    return $id;
}

function contentcreator_update_instance($contentcreator, ?object $mform = null) {
    global $DB;

    $contentcreator->timemodified = time();
    $contentcreator->id = $contentcreator->instance;

    $result = $DB->update_record('contentcreator', $contentcreator);

    return $result;
}

function contentcreator_delete_instance($id) {
    global $DB;

    if (!$contentcreator = $DB->get_record('contentcreator', ['id' => $id])) {
        return false;
    }

    $DB->delete_records('contentcreator_attempts', ['contentcreatorid' => $id]);

    $cms = $DB->get_records('course_modules', ['instance' => $id, 'module' => $DB->get_field('modules', 'id', ['name' => 'contentcreator'])]);
    foreach ($cms as $cm) {
        $DB->delete_records('contentcreator_progress', ['cmid' => $cm->id]);
    }

    $DB->delete_records('contentcreator', ['id' => $id]);

    return true;
}

/**
 * Mark the content creator as viewed and trigger the completion "view" condition.
 *
 * @param object $contentcreator The contentcreator instance record.
 * @param object $course The course record.
 * @param object $cm The course module record.
 * @param object $context The module context.
 */
function contentcreator_view($contentcreator, $course, $cm, $context) {
    // FIX-CC-COMPLETION-SPLIT (v13.12): Completion tracking has been intentionally
    // separated from this function. set_module_viewed() calls write_close() internally
    // which closes the PHP session. When called BEFORE $OUTPUT->header(), the session
    // is closed before header() writes $SESSION->editedpages, causing:
    //   "Script mutated the session after it was closed: $SESSION->editedpages"
    // When called AFTER $OUTPUT->header(), completionlib.php throws:
    //   "set_module_viewed must be called before header is printed" (DEBUG_DEVELOPER)
    // Both warnings are avoided by: (a) firing only the event here (before header,
    // correct Moodle pattern, no session writes), and (b) calling update_state()
    // directly in view.php AFTER the header once write_close() has been called
    // explicitly. update_state() has no header-printed check so no warning fires.
    $event = \mod_contentcreator\event\course_module_viewed::create([
        'objectid' => $contentcreator->id,
        'context' => $context,
    ]);
    $event->add_record_snapshot('course', $course);
    $event->add_record_snapshot('contentcreator', $contentcreator);
    $event->trigger();
    // NOTE: completion->update_state(COMPLETION_VIEWED) is called in view.php after
    // $OUTPUT->header() to avoid both the session-mutation and before-header warnings.
}

/**
 * Populate cached course-module info with custom completion rules.
 *
 * Without this function Moodle's completion cache does not know which custom
 * rules are active, so course completion aggregation and completion reports
 * may ignore the custom rules even though update_state() fires correctly.
 *
 * @param stdClass|cm_info $coursemodule Raw DB record or cm_info object.
 * @return cached_cm_info|null
 */
function contentcreator_get_coursemodule_info($coursemodule) {
    global $DB;

    if (!$instance = $DB->get_record('contentcreator', ['id' => $coursemodule->instance],
            'id, name, intro, introformat, completionviewallslides, completionallactivities')) {
        return null;
    }

    $info = new cached_cm_info();
    $info->name = $instance->name;

    if ($coursemodule->showdescription) {
        $info->content = format_module_intro('contentcreator', $instance, $coursemodule->id, false);
    }

    if ($instance->completionviewallslides) {
        $info->customdata['customcompletionrules']['completionviewallslides'] = $instance->completionviewallslides;
    }
    if ($instance->completionallactivities) {
        $info->customdata['customcompletionrules']['completionallactivities'] = $instance->completionallactivities;
    }

    return $info;
}

/**
 * Return human-readable descriptions of active custom completion rules.
 *
 * @param cm_info|stdClass $cm The course module.
 * @return array Array of description strings.
 */
function mod_contentcreator_get_completion_active_rule_descriptions($cm) {
    global $DB;

    $descriptions = [];
    $instance = $DB->get_record('contentcreator', ['id' => $cm->instance]);

    if ($instance && !empty($instance->completionviewallslides)) {
        $descriptions[] = get_string('completionviewallslidesdesc', 'contentcreator');
    }
    if ($instance && !empty($instance->completionallactivities)) {
        $descriptions[] = get_string('completionallactivitiesdesc', 'contentcreator');
    }

    return $descriptions;
}

/**
 * Serves voiceover audio files from the mod_contentcreator file store.
 *
 * v11.70: Pre-generated voiceover audio is persisted as files in Moodle's file API
 * (filearea = 'voiceovers') so that the manifest JSON can hold a plain HTTPS URL
 * instead of a raw base64 data: URL. This allows stripAudio() to preserve the URL
 * across saves (it only strips data: URLs), so students play from the stored file
 * instantly on every session — no TTS API call, no wait, no per-student credit cost.
 *
 * URL format: /pluginfile.php/{contextid}/mod_contentcreator/voiceovers/{cmid}/{filename}
 *
 * @param stdClass $course   Course record.
 * @param cm_info  $cm       Course-module record.
 * @param context  $context  Module context.
 * @param string   $filearea Must be 'voiceovers'.
 * @param array    $args     Remaining URL path segments: [itemid (cmid), filename].
 * @param bool     $forcedownload Whether to force a download response.
 * @param array    $options  Additional options.
 * @return bool False if file not found.
 */
function mod_contentcreator_pluginfile($course, $cm, $context, $filearea, $args, $forcedownload, array $options = []) {
    if ($context->contextlevel != CONTEXT_MODULE) {
        return false;
    }
    if ($filearea !== 'voiceovers') {
        return false;
    }

    require_login($course, true, $cm);
    require_capability('mod/contentcreator:view', $context);

    $itemid   = (int)array_shift($args);
    $filename = array_pop($args);
    $filepath = $args ? ('/' . implode('/', $args) . '/') : '/';

    $fs   = get_file_storage();
    $file = $fs->get_file($context->id, 'mod_contentcreator', $filearea, $itemid, $filepath, $filename);

    if (!$file || $file->is_directory()) {
        return false;
    }

    // Cache for 24 hours — voiceover content rarely changes and is re-generated
    // by teachers when slide content is edited (staleness is detected by hash/wordcount).
    send_stored_file($file, 86400, 0, $forcedownload, $options);
}
