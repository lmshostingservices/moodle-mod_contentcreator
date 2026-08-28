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
 * Content Creator - Library functions
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

/**
 * Return whether the module supports a given feature.
 *
 * @param string $feature Constant representing the feature.
 * @return mixed True if module supports the feature, null if unknown.
 */
function contentcreator_supports($feature) {
    switch ($feature) {
        case FEATURE_MOD_INTRO:
            return true;
        case FEATURE_SHOW_DESCRIPTION:
            return true;
        case FEATURE_GRADE_HAS_GRADE:
            // No grading: simple completion only.
            return false;
        case FEATURE_BACKUP_MOODLE2:
            return true;
        case FEATURE_COMPLETION_TRACKS_VIEWS:
            return true;
        case FEATURE_COMPLETION_HAS_RULES:
            return true;
        case FEATURE_GROUPS:
            return false;
        case FEATURE_GROUPINGS:
            return false;
        case FEATURE_MOD_PURPOSE:
            return MOD_PURPOSE_CONTENT;
        default:
            return null;
    }
}

/**
 * Add a new contentcreator instance.
 *
 * @param stdClass $contentcreator Data from the activity form.
 * @param mod_contentcreator_mod_form|null $mform The form instance.
 * @return int The id of the newly created instance.
 */
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

/**
 * Update an existing contentcreator instance.
 *
 * @param stdClass $contentcreator Data from the activity form.
 * @param mod_contentcreator_mod_form|null $mform The form instance.
 * @return bool True on success.
 */
function contentcreator_update_instance($contentcreator, ?object $mform = null) {
    global $DB;

    $contentcreator->timemodified = time();
    $contentcreator->id = $contentcreator->instance;

    $result = $DB->update_record('contentcreator', $contentcreator);

    return $result;
}

/**
 * Delete a contentcreator instance and every trace of its user data and files.
 *
 * @param int $id The instance id.
 * @return bool True on success, false if the instance does not exist.
 */
function contentcreator_delete_instance($id) {
    global $DB;

    if (!$contentcreator = $DB->get_record('contentcreator', ['id' => $id])) {
        return false;
    }

    $DB->delete_records('contentcreator_attempts', ['contentcreatorid' => $id]);

    $moduleid = $DB->get_field('modules', 'id', ['name' => 'contentcreator']);
    $cms = $DB->get_records('course_modules', ['instance' => $id, 'module' => $moduleid]);
    $fs = get_file_storage();
    foreach ($cms as $cm) {
        $DB->delete_records('contentcreator_progress', ['cmid' => $cm->id]);
        // The checklist table is also keyed by cmid; it was previously orphaned on delete.
        $DB->delete_records('contentcreator_checklist', ['cmid' => $cm->id]);

        // Remove the module's stored files: the pre-generated voiceovers, which are the only
        // audio this activity actually owns.
        //
        // v13.94.3: the comment here used to claim this also removed "any cached TTS audio",
        // which has not been true since v13.86. Both writers - ajax.php and
        // external\generate_voiceover - now put voice_cache files in the SYSTEM context under
        // itemid 0, keyed by md5(text|voice|language), because identical narration must be
        // billed once for the whole site rather than once per activity. That key deliberately
        // carries no course or activity, so there is nothing here to delete and no way to
        // attribute a cache entry to this instance without giving up the site-wide sharing
        // that makes the cache worth having. Reclaiming those files is the job of the
        // \mod_contentcreator\task\prune_voice_cache scheduled task, which ages them out.
        //
        // The voice_cache call below is kept only for sites upgraded from before v13.86,
        // where generate_voiceover did cache into the module context under itemid = cmid. On
        // a site installed since, it is a no-op.
        $modulecontext = context_module::instance($cm->id, IGNORE_MISSING);
        if ($modulecontext) {
            $fs->delete_area_files($modulecontext->id, 'mod_contentcreator', 'voiceovers');
            $fs->delete_area_files($modulecontext->id, 'mod_contentcreator', 'voice_cache');
        }
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
    // "Script mutated the session after it was closed: $SESSION->editedpages"
    // When called AFTER $OUTPUT->header(), completionlib.php throws:
    // "set_module_viewed must be called before header is printed" (DEBUG_DEVELOPER)
    // Both warnings are avoided by: (a) firing only the event here (before header,
    // correct Moodle pattern, no session writes), and (b) calling update_state()
    // directly in view.php AFTER the header once write_close() has been called
    // explicitly. update_state() has no header-printed check so no warning fires.
    $event = \mod_contentcreator\event\course_module_viewed::create(
        [
            'objectid' => $contentcreator->id,
            'context' => $context,
        ]
    );
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

    if (
        !$instance = $DB->get_record(
            'contentcreator',
            ['id' => $coursemodule->instance],
            'id, name, intro, introformat, completionviewallslides, completionallactivities'
        )
    ) {
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
 * The 'voice_cache' filearea is deliberately NOT served here: cached TTS audio is
 * returned inline (base64) by ajax.php and is never addressed by URL.
 *
 * v13.94.3: 'intro' is deliberately not handled here either. Core's file_pluginfile()
 * serves the activity-description filearea itself, before this callback is reached, for
 * every module that declares FEATURE_MOD_INTRO - which this one does. Adding a branch for
 * it would be unreachable code. This note exists because the omission reads like a bug.
 *
 * @param stdClass $course Course record.
 * @param cm_info $cm Course-module record.
 * @param context $context Module context.
 * @param string $filearea Must be 'voiceovers'.
 * @param array $args Remaining URL path segments: [itemid (cmid), filename].
 * @param bool $forcedownload Whether to force a download response.
 * @param array $options Additional options.
 * @return bool False if the file was not found or may not be served.
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

    $itemid = (int)array_shift($args);

    // The itemid is the cmid the audio was generated for. Reject any request whose
    // itemid does not match the course module resolved from the context, so a file
    // cannot be pulled out of one activity through another activity's context.
    if ($itemid !== (int)$cm->id) {
        return false;
    }

    $filename = array_pop($args);
    $filepath = $args ? ('/' . implode('/', $args) . '/') : '/';

    $fs = get_file_storage();
    $file = $fs->get_file($context->id, 'mod_contentcreator', $filearea, $itemid, $filepath, $filename);

    if (!$file || $file->is_directory()) {
        return false;
    }

    // Cache for 24 hours: voiceover content rarely changes and is regenerated by
    // teachers when slide content is edited (staleness is detected by hash/wordcount).
    send_stored_file($file, 86400, 0, $forcedownload, $options);
}

/**
 * Add the course reset options for this module to the course reset form.
 *
 * @param MoodleQuickForm $mform The course reset form.
 * @return void
 */
function contentcreator_reset_course_form_definition($mform) {
    $mform->addElement('header', 'contentcreatorheader', get_string('modulenameplural', 'mod_contentcreator'));
    $mform->addElement(
        'advcheckbox',
        'reset_contentcreator_all',
        get_string('resetuserdata', 'mod_contentcreator')
    );
}

/**
 * Return the default values for the course reset form.
 *
 * @param stdClass $course The course being reset.
 * @return array Default values keyed by form element name.
 */
function contentcreator_reset_course_form_defaults($course) {
    return ['reset_contentcreator_all' => 1];
}

/**
 * Remove all user data produced by contentcreator activities in the given course.
 *
 * Clears attempts, slide progress and the "before you start" checklist for every
 * instance in the course.
 *
 * @param stdClass $data The data submitted from the course reset form.
 * @return array Array of status records for the reset report.
 */
function contentcreator_reset_userdata($data) {
    global $DB;

    $status = [];
    $componentstr = get_string('modulenameplural', 'mod_contentcreator');

    if (empty($data->reset_contentcreator_all)) {
        return $status;
    }

    $instanceids = $DB->get_fieldset_select('contentcreator', 'id', 'course = ?', [$data->courseid]);
    if (!empty($instanceids)) {
        [$insql, $inparams] = $DB->get_in_or_equal($instanceids);
        $DB->delete_records_select('contentcreator_attempts', "contentcreatorid $insql", $inparams);
    }

    $moduleid = $DB->get_field('modules', 'id', ['name' => 'contentcreator']);
    if ($moduleid) {
        $cmids = $DB->get_fieldset_select(
            'course_modules',
            'id',
            'course = ? AND module = ?',
            [$data->courseid, $moduleid]
        );
        if (!empty($cmids)) {
            [$cmsql, $cmparams] = $DB->get_in_or_equal($cmids);
            $DB->delete_records_select('contentcreator_progress', "cmid $cmsql", $cmparams);
            $DB->delete_records_select('contentcreator_checklist', "cmid $cmsql", $cmparams);
        }
    }

    // Activity completion data is purged centrally by reset_course_userdata() when the
    // "Delete completion data" option is ticked, so it is not handled again here.

    $status[] = [
        'component' => $componentstr,
        'item' => get_string('resetuserdata', 'mod_contentcreator'),
        'error' => false,
    ];

    return $status;
}
