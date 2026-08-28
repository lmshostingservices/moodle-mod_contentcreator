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
 * Restore steps for mod_contentcreator.
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

/**
 * Structure step to restore one contentcreator activity.
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class restore_contentcreator_activity_structure_step extends restore_activity_structure_step {
    /**
     * Define the paths of the contentcreator.xml file that this step processes.
     *
     * @return array Prepared activity structure.
     */
    protected function define_structure() {

        $paths = [];
        $userinfo = $this->get_setting_value('userinfo');

        $paths[] = new restore_path_element('contentcreator', '/activity/contentcreator');

        if ($userinfo) {
            $paths[] = new restore_path_element('contentcreator_attempt', '/activity/contentcreator/attempts/attempt');
            $paths[] = new restore_path_element('contentcreator_progress', '/activity/contentcreator/progresses/progress');
            $paths[] = new restore_path_element('contentcreator_checklist', '/activity/contentcreator/checklists/checklist');
        }

        return $this->prepare_activity_structure($paths);
    }

    /**
     * Restore the main activity record.
     *
     * @param array $data Parsed element data.
     * @return void
     */
    protected function process_contentcreator($data) {
        global $DB;

        $data = (object)$data;
        $data->course = $this->get_courseid();

        $newitemid = $DB->insert_record('contentcreator', $data);
        $this->apply_activity_instance($newitemid);
    }

    /**
     * Restore one attempt record.
     *
     * @param array $data Parsed element data.
     * @return void
     */
    protected function process_contentcreator_attempt($data) {
        global $DB;

        $data = (object)$data;
        unset($data->id);

        $data->contentcreatorid = $this->get_new_parentid('contentcreator');
        $data->userid = $this->get_mappingid('user', $data->userid);

        $DB->insert_record('contentcreator_attempts', $data);
    }

    /**
     * Restore one progress record.
     *
     * @param array $data Parsed element data.
     * @return void
     */
    protected function process_contentcreator_progress($data) {
        global $DB;

        $data = (object)$data;
        unset($data->id);

        $data->cmid = $this->task->get_moduleid();
        $data->userid = $this->get_mappingid('user', $data->userid);

        $DB->insert_record('contentcreator_progress', $data);
    }

    /**
     * Restore one "Before you start" checklist record.
     *
     * @param array $data Parsed element data.
     * @return void
     */
    protected function process_contentcreator_checklist($data) {
        global $DB;

        $data = (object)$data;
        unset($data->id);

        $data->cmid = $this->task->get_moduleid();
        $data->userid = $this->get_mappingid('user', $data->userid);

        $DB->insert_record('contentcreator_checklist', $data);
    }

    /**
     * Restore the files belonging to the activity once every record exists.
     *
     * @return void
     */
    protected function after_execute() {
        $this->add_related_files('mod_contentcreator', 'intro', null);

        // Voiceover audio is stored with itemid = cmid. There is no annotated element
        // whose id equals the cmid, so the files are brought across with a null item
        // mapping (which preserves the original itemid) and then re-filed and re-linked
        // by hand below.
        $this->add_related_files('mod_contentcreator', 'voiceovers', null);
        $this->remap_voiceover_files();
    }

    /**
     * Move restored voiceover files onto the new cmid and repoint the manifest URLs.
     *
     * The files arrive in the new module context but still carry the source site's
     * cmid as their itemid, and the manifest JSON holds absolute pluginfile URLs
     * built from the source site's wwwroot, context id and cmid. Both are rewritten
     * here so that every stored URL resolves after a restore, a course duplication
     * or a cross-site restore.
     *
     * @return void
     */
    protected function remap_voiceover_files() {
        global $CFG, $DB;

        $cmid = (int)$this->task->get_moduleid();
        if (empty($cmid)) {
            return;
        }

        $context = context_module::instance($cmid);
        $fs = get_file_storage();

        // Step 1: re-file every voiceover onto the new cmid as its itemid.
        $files = $fs->get_area_files($context->id, 'mod_contentcreator', 'voiceovers', false, 'itemid', false);
        foreach ($files as $file) {
            if ((int)$file->get_itemid() === $cmid) {
                continue;
            }
            $existing = $fs->get_file(
                $context->id,
                'mod_contentcreator',
                'voiceovers',
                $cmid,
                $file->get_filepath(),
                $file->get_filename()
            );
            if (!$existing) {
                $fs->create_file_from_storedfile(['itemid' => $cmid], $file);
            }
            $file->delete();
        }

        // Step 2: repoint the pluginfile URLs held in the manifest JSON.
        $instanceid = $DB->get_field('course_modules', 'instance', ['id' => $cmid]);
        if (empty($instanceid)) {
            return;
        }

        $stored = $DB->get_field('contentcreator', 'manifestjson', ['id' => $instanceid]);
        if (empty($stored)) {
            return;
        }

        // v13.85 FIX BUG-RESTORE-COMPRESSED: Manifests at or above
        // manifest_storage::COMPRESS_THRESHOLD are held as gzip+base64 behind a 'gz:'
        // prefix, and real packs reach 6-10 MB. The URL rewrite below was applied
        // directly to that blob, matched nothing, and wrote it back unchanged - so the
        // restored manifest kept the SOURCE site's contextid and cmid, which
        // mod_contentcreator_pluginfile() then refuses. Every restore, duplicate and
        // course rollover silently lost all of its audio. The existing test only covers
        // the small uncompressed case, so the suite passed throughout.
        $wascompressed = (substr($stored, 0, 3) === 'gz:');
        $manifest = \mod_contentcreator\manifest_storage::decompress($stored);
        if ($wascompressed && $manifest === $stored) {
            // The decompress() helper returns the input unchanged when it cannot decode it. Rewriting
            // an undecodable blob would corrupt it, so stop and say why.
            debugging(
                'Content Creator restore: could not decompress manifest for instance ' . $instanceid .
                '; voiceover URLs were left unchanged.',
                DEBUG_DEVELOPER
            );
            return;
        }

        $target = $CFG->wwwroot . '/pluginfile.php/' . $context->id . '/mod_contentcreator/voiceovers/' . $cmid . '/';

        // Plain form, as produced by JSON.stringify() in the browser.
        $updated = preg_replace(
            '#https?://[^"\'\s]+?/pluginfile\.php/\d+/mod_contentcreator/voiceovers/\d+/#',
            $target,
            $manifest
        );

        // Escaped form, as produced by PHP json_encode() without JSON_UNESCAPED_SLASHES.
        $updated = preg_replace(
            '#https?:\\\\/\\\\/[^"\s]+?\\\\/pluginfile\.php\\\\/\d+\\\\/mod_contentcreator\\\\/voiceovers\\\\/\d+\\\\/#',
            str_replace('/', '\\/', $target),
            $updated
        );

        if ($updated !== null && $updated !== $manifest) {
            // Re-compress on the way back in so the row keeps the storage format the rest
            // of the plugin expects for a manifest of this size.
            $DB->set_field(
                'contentcreator',
                'manifestjson',
                \mod_contentcreator\manifest_storage::compress($updated),
                ['id' => $instanceid]
            );
        }
    }
}
