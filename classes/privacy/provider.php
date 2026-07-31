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
 * Privacy Subsystem implementation for Content Creator.
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace mod_contentcreator\privacy;

use core_privacy\local\metadata\collection;
use core_privacy\local\request\approved_contextlist;
use core_privacy\local\request\approved_userlist;
use core_privacy\local\request\contextlist;
use core_privacy\local\request\userlist;
use core_privacy\local\request\writer;
use core_privacy\local\request\helper;
use core_privacy\local\request\transform;

defined('MOODLE_INTERNAL') || die();

class provider implements
    \core_privacy\local\metadata\provider,
    \core_privacy\local\request\plugin\provider,
    \core_privacy\local\request\core_userlist_provider {

    public static function get_metadata(collection $collection): collection {
        $collection->add_database_table('contentcreator_attempts', [
            'userid' => 'privacy:metadata:contentcreator_attempts:userid',
            'score' => 'privacy:metadata:contentcreator_attempts:score',
            'completed' => 'privacy:metadata:contentcreator_attempts:completed',
            'responses' => 'privacy:metadata:contentcreator_attempts:responses',
            'timecreated' => 'privacy:metadata:contentcreator_attempts:timecreated',
            'timemodified' => 'privacy:metadata:contentcreator_attempts:timemodified',
        ], 'privacy:metadata:contentcreator_attempts');

        $collection->add_database_table('contentcreator_progress', [
            'userid' => 'privacy:metadata:contentcreator_progress:userid',
            'progress' => 'privacy:metadata:contentcreator_progress:progress',
            'timecreated' => 'privacy:metadata:contentcreator_progress:timecreated',
            'timemodified' => 'privacy:metadata:contentcreator_progress:timemodified',
        ], 'privacy:metadata:contentcreator_progress');

        $collection->add_external_location_link('essaygraderai', [
            'siteid' => 'privacy:metadata:essaygraderai:siteid',
            'prompt' => 'privacy:metadata:essaygraderai:prompt',
            'context' => 'privacy:metadata:essaygraderai:context',
        ], 'privacy:metadata:essaygraderai');

        return $collection;
    }

    public static function get_contexts_for_userid(int $userid): contextlist {
        $contextlist = new contextlist();

        $sql = "SELECT ctx.id
                  FROM {context} ctx
                  JOIN {course_modules} cm ON cm.id = ctx.instanceid AND ctx.contextlevel = :contextlevel
                  JOIN {modules} m ON m.id = cm.module AND m.name = :modname
                  JOIN {contentcreator} cc ON cc.id = cm.instance
                  JOIN {contentcreator_attempts} ca ON ca.contentcreatorid = cc.id
                 WHERE ca.userid = :userid";

        $contextlist->add_from_sql($sql, [
            'contextlevel' => CONTEXT_MODULE,
            'modname' => 'contentcreator',
            'userid' => $userid,
        ]);

        $sql = "SELECT ctx.id
                  FROM {context} ctx
                  JOIN {course_modules} cm ON cm.id = ctx.instanceid AND ctx.contextlevel = :contextlevel
                  JOIN {modules} m ON m.id = cm.module AND m.name = :modname
                  JOIN {contentcreator_progress} cp ON cp.cmid = cm.id
                 WHERE cp.userid = :userid";

        $contextlist->add_from_sql($sql, [
            'contextlevel' => CONTEXT_MODULE,
            'modname' => 'contentcreator',
            'userid' => $userid,
        ]);

        return $contextlist;
    }

    public static function get_users_in_context(userlist $userlist) {
        $context = $userlist->get_context();

        if (!$context instanceof \context_module) {
            return;
        }

        $sql = "SELECT ca.userid
                  FROM {contentcreator_attempts} ca
                  JOIN {contentcreator} cc ON cc.id = ca.contentcreatorid
                  JOIN {course_modules} cm ON cm.instance = cc.id
                  JOIN {modules} m ON m.id = cm.module AND m.name = :modname
                 WHERE cm.id = :cmid";

        $userlist->add_from_sql('userid', $sql, [
            'modname' => 'contentcreator',
            'cmid' => $context->instanceid,
        ]);

        $sql = "SELECT cp.userid
                  FROM {contentcreator_progress} cp
                 WHERE cp.cmid = :cmid";

        $userlist->add_from_sql('userid', $sql, [
            'cmid' => $context->instanceid,
        ]);
    }

    public static function export_user_data(approved_contextlist $contextlist) {
        global $DB;

        if (empty($contextlist->count())) {
            return;
        }

        $user = $contextlist->get_user();

        foreach ($contextlist->get_contexts() as $context) {
            if ($context->contextlevel != CONTEXT_MODULE) {
                continue;
            }

            $cm = get_coursemodule_from_id('contentcreator', $context->instanceid);
            if (!$cm) {
                continue;
            }

            $attempts = $DB->get_records('contentcreator_attempts', [
                'contentcreatorid' => $cm->instance,
                'userid' => $user->id,
            ]);

            if ($attempts) {
                $attemptdata = [];
                foreach ($attempts as $attempt) {
                    $attemptdata[] = [
                        'score' => $attempt->score,
                        'maxscore' => $attempt->maxscore,
                        'completed' => $attempt->completed ? 'Yes' : 'No',
                        'timecreated' => transform::datetime($attempt->timecreated),
                        'timemodified' => transform::datetime($attempt->timemodified),
                    ];
                }
                writer::with_context($context)->export_data(
                    [get_string('privacy:metadata:contentcreator_attempts', 'contentcreator')],
                    (object)['attempts' => $attemptdata]
                );
            }

            $progress = $DB->get_record('contentcreator_progress', [
                'cmid' => $cm->id,
                'userid' => $user->id,
            ]);

            if ($progress) {
                writer::with_context($context)->export_data(
                    [get_string('privacy:metadata:contentcreator_progress', 'contentcreator')],
                    (object)[
                        'progress' => $progress->progress,
                        'timecreated' => transform::datetime($progress->timecreated),
                        'timemodified' => transform::datetime($progress->timemodified),
                    ]
                );
            }
        }
    }

    public static function delete_data_for_all_users_in_context(\context $context) {
        global $DB;

        if ($context->contextlevel != CONTEXT_MODULE) {
            return;
        }

        $cm = get_coursemodule_from_id('contentcreator', $context->instanceid);
        if (!$cm) {
            return;
        }

        $DB->delete_records('contentcreator_attempts', ['contentcreatorid' => $cm->instance]);
        $DB->delete_records('contentcreator_progress', ['cmid' => $cm->id]);
    }

    public static function delete_data_for_user(approved_contextlist $contextlist) {
        global $DB;

        if (empty($contextlist->count())) {
            return;
        }

        $userid = $contextlist->get_user()->id;

        foreach ($contextlist->get_contexts() as $context) {
            if ($context->contextlevel != CONTEXT_MODULE) {
                continue;
            }

            $cm = get_coursemodule_from_id('contentcreator', $context->instanceid);
            if (!$cm) {
                continue;
            }

            $DB->delete_records('contentcreator_attempts', [
                'contentcreatorid' => $cm->instance,
                'userid' => $userid,
            ]);
            $DB->delete_records('contentcreator_progress', [
                'cmid' => $cm->id,
                'userid' => $userid,
            ]);
        }
    }

    public static function delete_data_for_users(approved_userlist $userlist) {
        global $DB;

        $context = $userlist->get_context();

        if ($context->contextlevel != CONTEXT_MODULE) {
            return;
        }

        $cm = get_coursemodule_from_id('contentcreator', $context->instanceid);
        if (!$cm) {
            return;
        }

        $userids = $userlist->get_userids();
        if (empty($userids)) {
            return;
        }

        list($insql, $inparams) = $DB->get_in_or_equal($userids, SQL_PARAMS_NAMED);

        $params = array_merge(['contentcreatorid' => $cm->instance], $inparams);
        $DB->delete_records_select('contentcreator_attempts',
            "contentcreatorid = :contentcreatorid AND userid $insql", $params);

        $params = array_merge(['cmid' => $cm->id], $inparams);
        $DB->delete_records_select('contentcreator_progress',
            "cmid = :cmid AND userid $insql", $params);
    }
}
