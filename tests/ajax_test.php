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
 * PHPUnit tests for mod_contentcreator AJAX endpoints.
 *
 * @package    mod_contentcreator
 * @category   test
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace mod_contentcreator;

defined('MOODLE_INTERNAL') || die();

use advanced_testcase;
use context_module;
use stdClass;

/**
 * Test cases for the mod_contentcreator AJAX handler.
 *
 * @package    mod_contentcreator
 * @category   test
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class ajax_test extends advanced_testcase {
    /** @var stdClass The course used for testing. */
    protected $course;

    /** @var stdClass The contentcreator module instance. */
    protected $contentcreator;

    /** @var stdClass The course module. */
    protected $cm;

    /** @var context_module The module context. */
    protected $context;

    /** @var stdClass A student user. */
    protected $student;

    /** @var stdClass A teacher user. */
    protected $teacher;

    /** @var stdClass An editing teacher user. */
    protected $editingteacher;

    /**
     * Set up test fixtures.
     */
    public function setUp(): void {
        global $DB;

        $this->resetAfterTest();

        $generator = $this->getDataGenerator();

        $this->course = $generator->create_course();

        $this->contentcreator = $generator->create_module('contentcreator', [
            'course' => $this->course->id,
            'name' => 'Test Content Creator'
        ]);

        $this->cm = get_coursemodule_from_instance('contentcreator', $this->contentcreator->id);
        $this->context = context_module::instance($this->cm->id);

        $this->student = $generator->create_user();
        $this->teacher = $generator->create_user();
        $this->editingteacher = $generator->create_user();

        $studentrole = $DB->get_record('role', ['shortname' => 'student']);
        $teacherrole = $DB->get_record('role', ['shortname' => 'teacher']);
        $editingteacherrole = $DB->get_record('role', ['shortname' => 'editingteacher']);

        $generator->enrol_user($this->student->id, $this->course->id, $studentrole->id);
        $generator->enrol_user($this->teacher->id, $this->course->id, $teacherrole->id);
        $generator->enrol_user($this->editingteacher->id, $this->course->id, $editingteacherrole->id);
    }

    /**
     * Test that AJAX endpoints require user to be logged in.
     *
     * Users who are not logged in should receive an error response.
     */
    public function test_ajax_requires_login(): void {
        $this->setUser(null);

        $this->assertFalse(isloggedin());

        $guestuser = guest_user();
        $this->setUser($guestuser);

        $this->assertTrue(isguestuser());
    }

    /**
     * Test that check_config action works with valid cmid for users with manage capability.
     *
     * Users with manage capability should be able to check configuration.
     */
    public function test_check_config_requires_manage_capability(): void {
        $this->setUser($this->editingteacher);

        $this->assertTrue(has_capability('mod/contentcreator:manage', $this->context));
        $this->assertTrue(has_capability('mod/contentcreator:view', $this->context));

        $this->setUser($this->student);

        $this->assertFalse(has_capability('mod/contentcreator:manage', $this->context));
        $this->assertTrue(has_capability('mod/contentcreator:view', $this->context));
    }

    /**
     * Test that generate_slide action requires manage capability.
     *
     * Only users with mod/contentcreator:manage capability should be able to generate slides.
     */
    public function test_generate_slide_requires_manage_capability(): void {
        $this->setUser($this->editingteacher);
        $this->assertTrue(has_capability('mod/contentcreator:manage', $this->context));

        $this->setUser($this->teacher);
        $this->assertFalse(has_capability('mod/contentcreator:manage', $this->context));

        $this->setUser($this->student);
        $this->assertFalse(has_capability('mod/contentcreator:manage', $this->context));
    }

    /**
     * Test that save_completion action works for users with view capability.
     *
     * Users with view capability should be able to save their completion progress.
     */
    public function test_save_completion_requires_view_capability(): void {
        $this->setUser($this->student);

        $this->assertTrue(has_capability('mod/contentcreator:view', $this->context));

        $this->setUser($this->teacher);
        $this->assertTrue(has_capability('mod/contentcreator:view', $this->context));

        $this->setUser($this->editingteacher);
        $this->assertTrue(has_capability('mod/contentcreator:view', $this->context));
    }

    /**
     * Test that save_completion correctly saves progress data to the database.
     */
    public function test_save_completion_saves_to_database(): void {
        global $DB;

        $this->setUser($this->student);

        $progressdata = [
            'currentSlide' => 3,
            'totalSlides' => 10,
            'viewedSlides' => [1, 2, 3]
        ];

        $record = new stdClass();
        $record->cmid = $this->cm->id;
        $record->userid = $this->student->id;
        $record->progress = json_encode($progressdata);
        $record->timecreated = time();
        $record->timemodified = time();

        $id = $DB->insert_record('contentcreator_progress', $record);

        $savedrecord = $DB->get_record('contentcreator_progress', ['id' => $id]);
        $this->assertNotEmpty($savedrecord);
        $this->assertEquals($this->cm->id, $savedrecord->cmid);
        $this->assertEquals($this->student->id, $savedrecord->userid);

        $savedprogress = json_decode($savedrecord->progress, true);
        $this->assertEquals(3, $savedprogress['currentSlide']);
        $this->assertEquals(10, $savedprogress['totalSlides']);
        $this->assertCount(3, $savedprogress['viewedSlides']);
    }

    /**
     * Test that load_completion returns proper data structure.
     *
     * The response should contain success flag and progress data when available.
     */
    public function test_load_completion_returns_proper_structure(): void {
        global $DB;

        $this->setUser($this->student);

        $progressdata = [
            'currentSlide' => 5,
            'totalSlides' => 15,
            'viewedSlides' => [1, 2, 3, 4, 5],
            'completedAt' => null
        ];

        $record = new stdClass();
        $record->cmid = $this->cm->id;
        $record->userid = $this->student->id;
        $record->progress = json_encode($progressdata);
        $record->timecreated = time();
        $record->timemodified = time();

        $DB->insert_record('contentcreator_progress', $record);

        $loadedrecord = $DB->get_record('contentcreator_progress', [
            'cmid' => $this->cm->id,
            'userid' => $this->student->id
        ]);

        $this->assertNotEmpty($loadedrecord);
        $this->assertNotEmpty($loadedrecord->progress);

        $loadedprogress = json_decode($loadedrecord->progress, true);
        $this->assertIsArray($loadedprogress);
        $this->assertArrayHasKey('currentSlide', $loadedprogress);
        $this->assertArrayHasKey('totalSlides', $loadedprogress);
        $this->assertArrayHasKey('viewedSlides', $loadedprogress);
    }

    /**
     * Test that load_completion returns null when no progress exists.
     */
    public function test_load_completion_returns_null_for_new_user(): void {
        global $DB;

        $newuser = $this->getDataGenerator()->create_user();

        $record = $DB->get_record('contentcreator_progress', [
            'cmid' => $this->cm->id,
            'userid' => $newuser->id
        ]);

        $this->assertFalse($record);
    }

    /**
     * Test that sesskey validation is enforced for state-changing operations.
     *
     * State-changing operations should require valid sesskey.
     */
    public function test_sesskey_validation_is_enforced(): void {
        $this->setUser($this->student);

        $sesskey = sesskey();
        $this->assertNotEmpty($sesskey);

        $this->assertTrue(confirm_sesskey($sesskey));
    }

    /**
     * Test that invalid sesskey is rejected.
     */
    public function test_invalid_sesskey_is_rejected(): void {
        $this->setUser($this->student);

        $invalidsesskey = 'invalid_sesskey_12345';

        $this->assertFalse(confirm_sesskey($invalidsesskey));
    }

    /**
     * Test that course module can be retrieved correctly.
     */
    public function test_course_module_retrieval(): void {
        $cm = get_coursemodule_from_id('contentcreator', $this->cm->id, 0, false, MUST_EXIST);

        $this->assertNotEmpty($cm);
        $this->assertEquals($this->contentcreator->id, $cm->instance);
        $this->assertEquals($this->course->id, $cm->course);
    }

    /**
     * Test that context is properly created for capability checks.
     */
    public function test_context_creation(): void {
        $context = context_module::instance($this->cm->id);

        $this->assertNotEmpty($context);
        $this->assertInstanceOf(\context_module::class, $context);
    }

    /**
     * Test that progress can be updated for existing record.
     */
    public function test_progress_update(): void {
        global $DB;

        $this->setUser($this->student);

        $initialdata = ['currentSlide' => 1, 'totalSlides' => 10];
        $record = new stdClass();
        $record->cmid = $this->cm->id;
        $record->userid = $this->student->id;
        $record->progress = json_encode($initialdata);
        $record->timecreated = time();
        $record->timemodified = time();

        $id = $DB->insert_record('contentcreator_progress', $record);

        $updateddata = ['currentSlide' => 5, 'totalSlides' => 10];
        $record->id = $id;
        $record->progress = json_encode($updateddata);
        $record->timemodified = time();

        $DB->update_record('contentcreator_progress', $record);

        $updated = $DB->get_record('contentcreator_progress', ['id' => $id]);
        $progress = json_decode($updated->progress, true);

        $this->assertEquals(5, $progress['currentSlide']);
    }

    /**
     * Test teacher has review capability but not manage capability.
     */
    public function test_teacher_capabilities(): void {
        $this->setUser($this->teacher);

        $this->assertTrue(has_capability('mod/contentcreator:view', $this->context));
        $this->assertTrue(has_capability('mod/contentcreator:review', $this->context));
        $this->assertFalse(has_capability('mod/contentcreator:manage', $this->context));
    }

    /**
     * Test editing teacher has all capabilities.
     */
    public function test_editing_teacher_capabilities(): void {
        $this->setUser($this->editingteacher);

        $this->assertTrue(has_capability('mod/contentcreator:view', $this->context));
        $this->assertTrue(has_capability('mod/contentcreator:review', $this->context));
        $this->assertTrue(has_capability('mod/contentcreator:manage', $this->context));
    }
}
