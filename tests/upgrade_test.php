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
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle. If not, see <http://www.gnu.org/licenses/>.

/**
 * Capability registration-order upgrade regressions.
 *
 * @package    mod_contentcreator
 * @copyright  2026 LMS Hosting Services
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace mod_contentcreator;

defined('MOODLE_INTERNAL') || die();

global $CFG;
require_once($CFG->libdir . '/upgradelib.php');
require_once($CFG->dirroot . '/mod/contentcreator/db/upgrade.php');

/**
 * Student cleanup must work before Moodle installs new capability definitions.
 *
 * @covers ::xmldb_contentcreator_upgrade
 */
final class upgrade_test extends \advanced_testcase {
    /**
     * Capability definitions and grants may independently be missing.
     *
     * @return array
     */
    public static function capability_states_provider(): array {
        return [
            'capability not registered yet' => [false, false],
            'orphaned grants without a definition' => [false, true],
            'registered capability with grants' => [true, true],
            'registered capability without grants' => [true, false],
        ];
    }

    /**
     * Preserve legacy authoring access when the new capability is not registered.
     */
    public function test_authoring_migration_before_registration(): void {
        global $DB;

        $this->resetAfterTest();
        $this->setAdminUser();
        $capability = 'mod/contentcreator:manage';
        $custom = create_role('Legacy author', 'cclegacyauthor', '');
        $prohibited = create_role('Prohibited author', 'ccprohibitedauthor', '');
        $courseonly = create_role('Course author', 'cccourseauthor', '');
        $systemid = \context_system::instance()->id;
        $courseid = \context_course::instance($this->getDataGenerator()->create_course()->id)->id;
        foreach ([$custom, $prohibited] as $roleid) {
            assign_capability('moodle/course:manageactivities', CAP_ALLOW, $roleid, $systemid);
        }
        assign_capability('moodle/course:manageactivities', CAP_ALLOW, $courseonly, $courseid);
        assign_capability($capability, CAP_PROHIBIT, $prohibited, $systemid);
        $DB->delete_records('capabilities', ['name' => $capability]);
        accesslib_clear_all_caches(true);
        set_config('version', 2026081801, 'mod_contentcreator');
        $this->assertTrue(xmldb_contentcreator_upgrade(2026081801));
        $this->assertTrue($DB->record_exists('capabilities', ['name' => $capability]));
        $this->assertTrue($DB->record_exists('role_capabilities', [
            'roleid' => $custom, 'contextid' => $systemid, 'capability' => $capability, 'permission' => CAP_ALLOW,
        ]));
        $this->assertTrue($DB->record_exists('role_capabilities', [
            'roleid' => $prohibited, 'contextid' => $systemid, 'capability' => $capability, 'permission' => CAP_PROHIBIT,
        ]));
        $this->assertFalse($DB->record_exists('role_capabilities', [
            'roleid' => $courseonly, 'contextid' => $systemid, 'capability' => $capability,
        ]));
    }

    /**
     * Revoke student grants in all contexts without changing non-student roles.
     *
     * @dataProvider capability_states_provider
     * @param bool $registered Whether Moodle has installed the capability.
     * @param bool $granted Whether a student grant must be removed.
     */
    public function test_capability_cleanup_before_registration(bool $registered, bool $granted): void {
        global $DB;

        $this->resetAfterTest();
        $this->setAdminUser();
        $capability = 'mod/contentcreator:generateondemand';
        $student = create_role('Upgrade student', 'ccupgradestudent', '', 'student');
        $custom = create_role('Upgrade custom', 'ccupgradecustom', '');
        $teacher = create_role('Upgrade teacher', 'ccupgradeteacher', '', 'editingteacher');
        $contexts = [
            \context_system::instance()->id,
            \context_course::instance($this->getDataGenerator()->create_course()->id)->id,
        ];
        if (!$registered) {
            $DB->delete_records('capabilities', ['name' => $capability]);
        } else {
            update_capabilities('mod_contentcreator');
        }
        accesslib_clear_all_caches(true);
        foreach ([$student, $custom, $teacher] as $roleid) {
            $DB->delete_records('role_capabilities', ['roleid' => $roleid, 'capability' => $capability]);
            if ($roleid !== $student || $granted) {
                foreach ($contexts as $contextid) {
                    $DB->insert_record('role_capabilities', (object)[
                        'roleid' => $roleid,
                        'contextid' => $contextid,
                        'capability' => $capability,
                        'permission' => CAP_ALLOW,
                        'timemodified' => time(),
                        'modifierid' => get_admin()->id,
                    ]);
                }
            }
        }
        set_config('version', 2026091800, 'mod_contentcreator');
        set_config('learnerondemand', '1', 'mod_contentcreator');
        $this->assertTrue(xmldb_contentcreator_upgrade(2026091800));
        $this->assertFalse($DB->record_exists('role_capabilities', ['roleid' => $student, 'capability' => $capability]));
        foreach ([$custom, $teacher] as $roleid) {
            $this->assertEquals(2, $DB->count_records('role_capabilities', [
                'roleid' => $roleid, 'capability' => $capability, 'permission' => CAP_ALLOW,
            ]));
        }
        $this->assertEquals($registered, $DB->record_exists('capabilities', ['name' => $capability]));
        $this->assertFalse(get_config('mod_contentcreator', 'learnerondemand'));
        $version = (int)get_config('mod_contentcreator', 'version');
        $this->assertGreaterThanOrEqual(2026102200, $version);
        $beforeagain = $DB->get_records('role_capabilities', ['capability' => $capability]);
        $this->assertTrue(xmldb_contentcreator_upgrade($version));
        $this->assertEquals($beforeagain, $DB->get_records('role_capabilities', ['capability' => $capability]));
    }
}
