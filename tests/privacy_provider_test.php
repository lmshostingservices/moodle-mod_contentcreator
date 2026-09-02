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
 * PHPUnit tests for the mod_contentcreator privacy provider.
 *
 * @package    mod_contentcreator
 * @category   test
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace mod_contentcreator;

use context_module;
use core_privacy\local\request\approved_contextlist;
use core_privacy\local\request\approved_userlist;
use core_privacy\local\request\writer;
use core_privacy\tests\provider_testcase;
use mod_contentcreator\privacy\provider;
use stdClass;

/**
 * Test cases for the mod_contentcreator privacy provider.
 *
 * @package    mod_contentcreator
 * @category   test
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class privacy_provider_test extends provider_testcase {
    /** @var stdClass The course used for testing. */
    protected $course;

    /** @var stdClass The contentcreator instance. */
    protected $contentcreator;

    /** @var stdClass The course module record. */
    protected $cm;

    /** @var context_module The module context. */
    protected $context;

    /** @var stdClass The first student. */
    protected $usera;

    /** @var stdClass The second student. */
    protected $userb;

    /**
     * Create an activity with user data for two students.
     */
    public function setUp(): void {
        parent::setUp();

        $this->resetAfterTest();

        $generator = $this->getDataGenerator();
        $this->course = $generator->create_course();
        $this->contentcreator = $generator->create_module('contentcreator', ['course' => $this->course->id]);
        $this->cm = get_coursemodule_from_instance('contentcreator', $this->contentcreator->id);
        $this->context = context_module::instance($this->cm->id);

        $this->usera = $generator->create_user();
        $this->userb = $generator->create_user();

        $plugingenerator = $generator->get_plugin_generator('mod_contentcreator');
        $this->assertInstanceOf(\mod_contentcreator_generator::class, $plugingenerator);

        foreach ([$this->usera, $this->userb] as $user) {
            $generator->enrol_user($user->id, $this->course->id);
            $plugingenerator->create_attempt($user, $this->contentcreator, ['score' => 7, 'maxscore' => 10]);
            $plugingenerator->create_progress($user, $this->cm, ['currentSlide' => 4]);
            $plugingenerator->create_checklist($user, $this->cm, 'topic1', 1);
        }
    }

    /**
     * The metadata must describe every table that stores personal data.
     */
    public function test_get_metadata(): void {
        $collection = provider::get_metadata(new \core_privacy\local\metadata\collection('mod_contentcreator'));
        $itemnames = [];
        foreach ($collection->get_collection() as $item) {
            $itemnames[] = $item->get_name();
        }

        $this->assertContains('contentcreator_attempts', $itemnames);
        $this->assertContains('contentcreator_progress', $itemnames);
        $this->assertContains('contentcreator_checklist', $itemnames);
    }

    /**
     * A user with data in the activity must resolve to the module context.
     */
    public function test_get_contexts_for_userid(): void {
        $contextlist = provider::get_contexts_for_userid((int)$this->usera->id);
        $contextids = $contextlist->get_contextids();

        // get_contextids() returns strings from the database; assertContains is strict, so
        // compare like with like rather than int against string.
        $this->assertContains((int)$this->context->id, array_map('intval', $contextids));
    }

    /**
     * Every user holding data in the activity must be reported for the context.
     */
    public function test_get_users_in_context(): void {
        $userlist = new \core_privacy\local\request\userlist($this->context, 'mod_contentcreator');
        provider::get_users_in_context($userlist);

        $userids = $userlist->get_userids();
        $this->assertContains((int)$this->usera->id, $userids);
        $this->assertContains((int)$this->userb->id, $userids);
    }

    /**
     * Exported data must be written for the requesting user's context.
     */
    public function test_export_user_data(): void {
        $this->export_context_data_for_user((int)$this->usera->id, $this->context, 'mod_contentcreator');

        $writer = writer::with_context($this->context);
        $this->assertTrue($writer->has_any_data());
    }

    /**
     * Nothing must be exported for a user who never touched the activity.
     */
    public function test_export_user_data_for_user_without_data(): void {
        $stranger = $this->getDataGenerator()->create_user();

        $this->export_context_data_for_user((int)$stranger->id, $this->context, 'mod_contentcreator');

        $this->assertFalse(writer::with_context($this->context)->has_any_data());
    }

    /**
     * Deleting the context must remove every user's attempts, progress and checklist.
     */
    public function test_delete_data_for_all_users_in_context(): void {
        global $DB;

        provider::delete_data_for_all_users_in_context($this->context);

        $this->assertEquals(
            0,
            $DB->count_records(
                'contentcreator_attempts',
                [
                    'contentcreatorid' => $this->contentcreator->id,
                ]
            )
        );
        $this->assertEquals(0, $DB->count_records('contentcreator_progress', ['cmid' => $this->cm->id]));
        $this->assertEquals(0, $DB->count_records('contentcreator_checklist', ['cmid' => $this->cm->id]));
    }

    /**
     * Deleting one user must leave the other user's data intact in all three tables.
     */
    public function test_delete_data_for_user(): void {
        global $DB;

        $contextlist = new approved_contextlist($this->usera, 'mod_contentcreator', [$this->context->id]);
        provider::delete_data_for_user($contextlist);

        $this->assertEquals(
            0,
            $DB->count_records(
                'contentcreator_attempts',
                [
                    'contentcreatorid' => $this->contentcreator->id,
                    'userid' => $this->usera->id,
                ]
            )
        );
        $this->assertEquals(
            0,
            $DB->count_records(
                'contentcreator_progress',
                [
                    'cmid' => $this->cm->id,
                    'userid' => $this->usera->id,
                ]
            )
        );
        $this->assertEquals(
            0,
            $DB->count_records(
                'contentcreator_checklist',
                [
                    'cmid' => $this->cm->id,
                    'userid' => $this->usera->id,
                ]
            )
        );

        $this->assertEquals(
            1,
            $DB->count_records(
                'contentcreator_attempts',
                [
                    'contentcreatorid' => $this->contentcreator->id,
                    'userid' => $this->userb->id,
                ]
            )
        );
        $this->assertEquals(
            1,
            $DB->count_records(
                'contentcreator_progress',
                [
                    'cmid' => $this->cm->id,
                    'userid' => $this->userb->id,
                ]
            )
        );
        $this->assertEquals(
            1,
            $DB->count_records(
                'contentcreator_checklist',
                [
                    'cmid' => $this->cm->id,
                    'userid' => $this->userb->id,
                ]
            )
        );
    }

    /**
     * Deleting an approved user list must remove exactly the listed users.
     */
    public function test_delete_data_for_users(): void {
        global $DB;

        $userlist = new approved_userlist($this->context, 'mod_contentcreator', [$this->userb->id]);
        provider::delete_data_for_users($userlist);

        $this->assertEquals(
            0,
            $DB->count_records(
                'contentcreator_attempts',
                [
                    'contentcreatorid' => $this->contentcreator->id,
                    'userid' => $this->userb->id,
                ]
            )
        );
        $this->assertEquals(
            0,
            $DB->count_records(
                'contentcreator_progress',
                [
                    'cmid' => $this->cm->id,
                    'userid' => $this->userb->id,
                ]
            )
        );
        $this->assertEquals(
            0,
            $DB->count_records(
                'contentcreator_checklist',
                [
                    'cmid' => $this->cm->id,
                    'userid' => $this->userb->id,
                ]
            )
        );

        $this->assertEquals(
            1,
            $DB->count_records(
                'contentcreator_attempts',
                [
                    'contentcreatorid' => $this->contentcreator->id,
                    'userid' => $this->usera->id,
                ]
            )
        );
        $this->assertEquals(
            1,
            $DB->count_records(
                'contentcreator_checklist',
                [
                    'cmid' => $this->cm->id,
                    'userid' => $this->usera->id,
                ]
            )
        );
    }
}
