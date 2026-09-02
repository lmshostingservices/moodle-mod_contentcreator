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
 * PHPUnit tests for mod_contentcreator backup and restore.
 *
 * @package    mod_contentcreator
 * @category   test
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace mod_contentcreator;

use advanced_testcase;
use backup;
use backup_controller;
use context_module;
use restore_controller;
use restore_dbops;
use stdClass;

defined('MOODLE_INTERNAL') || die();

global $CFG;
require_once($CFG->dirroot . '/backup/util/includes/backup_includes.php');
require_once($CFG->dirroot . '/backup/util/includes/restore_includes.php');

/**
 * Test that user data survives a backup and restore of the activity.
 *
 * @package    mod_contentcreator
 * @category   test
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class backup_restore_test extends advanced_testcase {
    /** @var stdClass The source course. */
    protected $course;

    /** @var stdClass The source contentcreator instance. */
    protected $contentcreator;

    /** @var stdClass The source course module. */
    protected $cm;

    /** @var stdClass A student with user data. */
    protected $student;

    /**
     * Build a course containing one activity with attempts, progress and checklist data.
     */
    public function setUp(): void {
        parent::setUp();

        $this->resetAfterTest();
        $this->setAdminUser();

        $generator = $this->getDataGenerator();
        $this->course = $generator->create_course();
        $this->student = $generator->create_user();
        $generator->enrol_user($this->student->id, $this->course->id);

        $this->contentcreator = $generator->create_module('contentcreator', ['course' => $this->course->id]);
        $this->cm = get_coursemodule_from_instance('contentcreator', $this->contentcreator->id);

        $plugingenerator = $generator->get_plugin_generator('mod_contentcreator');
        $plugingenerator->create_attempt($this->student, $this->contentcreator, ['score' => 8, 'maxscore' => 10]);
        $plugingenerator->create_progress($this->student, $this->cm, ['currentSlide' => 6]);
        $plugingenerator->create_checklist($this->student, $this->cm, 'topic1', 1);
    }

    /**
     * Store a voiceover file and reference it from the manifest, as the player does.
     *
     * @return string The pluginfile URL written into the manifest.
     */
    /**
     * Create a cached voiceover file for the activity under test.
     *
     * @param bool $large Store a manifest large enough to be gzip-compressed (v13.85).
     * @return string The cache key the file was stored under.
     */
    protected function create_voiceover(bool $large = false): string {
        global $DB;

        $context = context_module::instance($this->cm->id);

        $filerecord = [
            'contextid' => $context->id,
            'component' => 'mod_contentcreator',
            'filearea' => 'voiceovers',
            'itemid' => $this->cm->id,
            'filepath' => '/',
            'filename' => 'voiceover_section1.mp3',
        ];
        get_file_storage()->create_file_from_string($filerecord, str_repeat('a', 2048));

        $url = \moodle_url::make_pluginfile_url(
            $context->id,
            'mod_contentcreator',
            'voiceovers',
            $this->cm->id,
            '/',
            'voiceover_section1.mp3'
        )->out(false);

        $section = ['id' => 'section1', 'voiceoverUrl' => $url];
        if ($large) {
            // Push the manifest past manifest_storage::COMPRESS_THRESHOLD so it is stored
            // in the 'gz:' form that real 6-10 MB packs always use.
            $section['padding'] = str_repeat(
                'The quick brown fox jumps over the lazy dog. ',
                (int)ceil(\mod_contentcreator\manifest_storage::COMPRESS_THRESHOLD / 45) + 100
            );
        }
        $manifest = json_encode(['sections' => [$section]]);

        $stored = \mod_contentcreator\manifest_storage::compress($manifest);
        if ($large) {
            $this->assertSame('gz:', substr($stored, 0, 3), 'Test fixture must be stored compressed.');
            // The compress() call reports its saving through debugging(). That is intended
            // behaviour, so acknowledge it here - otherwise it surfaces at teardown as an
            // unexpected debugging call and fails a test that is actually passing.
            $this->assertDebuggingCalled();
        }
        $DB->set_field('contentcreator', 'manifestjson', $stored, ['id' => $this->contentcreator->id]);

        return $url;
    }

    /**
     * Back the source course up with user data and restore it into a brand new course.
     *
     * @return stdClass The course module record of the restored activity.
     */
    protected function backup_and_restore(): stdClass {
        global $CFG, $USER;

        $bc = new backup_controller(
            backup::TYPE_1COURSE,
            $this->course->id,
            backup::FORMAT_MOODLE,
            backup::INTERACTIVE_NO,
            backup::MODE_GENERAL,
            $USER->id
        );
        $bc->get_plan()->get_setting('users')->set_value(true);
        $backupid = $bc->get_backupid();
        $bc->execute_plan();
        $results = $bc->get_results();
        $bc->destroy();

        $file = $results['backup_destination'];
        $packer = get_file_packer('application/vnd.moodle.backup');
        $file->extract_to_pathname($packer, $CFG->tempdir . '/backup/' . $backupid . '/');

        $newcourseid = restore_dbops::create_new_course(
            $this->course->fullname,
            $this->course->shortname . '_restored',
            $this->course->category
        );

        $rc = new restore_controller(
            $backupid,
            $newcourseid,
            backup::INTERACTIVE_NO,
            backup::MODE_GENERAL,
            $USER->id,
            backup::TARGET_NEW_COURSE
        );
        $this->assertTrue($rc->execute_precheck());
        $rc->execute_plan();
        $rc->destroy();

        $modinfo = get_fast_modinfo($newcourseid);
        $instances = $modinfo->get_instances_of('contentcreator');
        $this->assertCount(1, $instances);
        $newcm = reset($instances);

        return get_coursemodule_from_id('contentcreator', $newcm->id, 0, false, MUST_EXIST);
    }

    /**
     * Attempts, progress and checklist rows must all survive a backup and restore.
     */
    public function test_user_data_survives_backup_and_restore(): void {
        global $DB;

        $newcm = $this->backup_and_restore();

        $this->assertNotEquals($this->cm->id, $newcm->id);

        $attempts = $DB->get_records('contentcreator_attempts', ['contentcreatorid' => $newcm->instance]);
        $this->assertCount(1, $attempts);
        $attempt = reset($attempts);
        $this->assertEquals($this->student->id, $attempt->userid);
        $this->assertEquals(8, (int)$attempt->score);

        $progress = $DB->get_records('contentcreator_progress', ['cmid' => $newcm->id]);
        $this->assertCount(1, $progress);
        $progressrecord = reset($progress);
        $this->assertEquals($this->student->id, $progressrecord->userid);
        $decoded = json_decode($progressrecord->progress, true);
        $this->assertEquals(6, $decoded['currentSlide']);

        $checklist = $DB->get_records('contentcreator_checklist', ['cmid' => $newcm->id]);
        $this->assertCount(1, $checklist);
        $checklistrecord = reset($checklist);
        $this->assertEquals($this->student->id, $checklistrecord->userid);
        $this->assertEquals('topic1', $checklistrecord->topicid);
        $this->assertEquals(1, (int)$checklistrecord->complete);
    }

    /**
     * Generated voiceover audio must survive and its manifest URL must be repointed.
     */
    public function test_voiceover_files_survive_backup_and_restore(): void {
        global $DB;

        $oldurl = $this->create_voiceover();

        $newcm = $this->backup_and_restore();
        $newcontext = context_module::instance($newcm->id);

        // The file must exist in the new context, filed under the new cmid.
        $file = get_file_storage()->get_file(
            $newcontext->id,
            'mod_contentcreator',
            'voiceovers',
            $newcm->id,
            '/',
            'voiceover_section1.mp3'
        );
        $this->assertNotFalse($file);

        // No orphan copy may remain under the old itemid.
        $allfiles = get_file_storage()->get_area_files(
            $newcontext->id,
            'mod_contentcreator',
            'voiceovers',
            false,
            'itemid',
            false
        );
        $this->assertCount(1, $allfiles);

        // The manifest URL must have been rewritten to the new context and cmid.
        $manifest = $DB->get_field('contentcreator', 'manifestjson', ['id' => $newcm->instance]);
        // The manifest is JSON, so its slashes are escaped as \/ - compare against the
        // unescaped form rather than against the raw column, or the needle can never match
        // and the assertion passes or fails for the wrong reason.
        $unescaped = str_replace('\\/', '/', $manifest);
        $this->assertStringNotContainsString($oldurl, $unescaped);
        $this->assertStringContainsString(
            '/pluginfile.php/' . $newcontext->id . '/mod_contentcreator/voiceovers/' . $newcm->id . '/',
            $unescaped
        );
    }

    /**
     * The same must hold for a COMPRESSED manifest.
     *
     * v13.85 regression test. The restore step used to apply its URL-rewriting regexes
     * straight to the 'gz:<base64>' blob, which matched nothing, so the restored manifest
     * kept the source site's contextid and every voiceover 404'd. Only the small,
     * uncompressed case above was covered, so the suite passed while every real restore
     * silently lost its audio.
     */
    public function test_voiceover_urls_are_repointed_in_a_compressed_manifest(): void {
        global $DB;

        $oldurl = $this->create_voiceover(true);

        $newcm = $this->backup_and_restore();
        // The restore step re-compresses the manifest after repointing its URLs, and
        // compress() reports the saving through debugging(). Intended behaviour, and
        // invisible outside developer mode - acknowledged so it does not surface at
        // teardown as an unexpected debugging call.
        $this->resetDebugging();
        $newcontext = context_module::instance($newcm->id);

        $stored = $DB->get_field('contentcreator', 'manifestjson', ['id' => $newcm->instance]);
        $this->assertSame('gz:', substr($stored, 0, 3), 'A large manifest must stay compressed.');

        $manifest = \mod_contentcreator\manifest_storage::decompress($stored);
        $this->assertNotSame($stored, $manifest, 'Restored manifest must still decompress.');
        $this->assertNotNull(json_decode($manifest), 'Restored manifest must still be valid JSON.');

        // The manifest is JSON, so its slashes are escaped as \/ - compare against the
        // unescaped form rather than against the raw column, or the needle can never match
        // and the assertion passes or fails for the wrong reason.
        $unescaped = str_replace('\\/', '/', $manifest);
        $this->assertStringNotContainsString($oldurl, $unescaped);
        $this->assertStringContainsString(
            '/pluginfile.php/' . $newcontext->id . '/mod_contentcreator/voiceovers/' . $newcm->id . '/',
            $unescaped
        );
    }
}
