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
use core_privacy\local\request\transform;

/**
 * Privacy Subsystem implementation for mod_contentcreator.
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class provider implements
    \core_privacy\local\metadata\provider,
    \core_privacy\local\request\core_userlist_provider,
    \core_privacy\local\request\plugin\provider {
    /**
     * Return metadata about the user data stored and transmitted by this plugin.
     *
     * @param collection $collection The initialised collection to add items to.
     * @return collection The updated collection.
     */
    public static function get_metadata(collection $collection): collection {
        $collection->add_database_table('contentcreator_attempts', [
            'userid' => 'privacy:metadata:contentcreator_attempts:userid',
            'score' => 'privacy:metadata:contentcreator_attempts:score',
            'maxscore' => 'privacy:metadata:contentcreator_attempts:maxscore',
            'completed' => 'privacy:metadata:contentcreator_attempts:completed',
            'responses' => 'privacy:metadata:contentcreator_attempts:responses',
            'attemptdata' => 'privacy:metadata:contentcreator_attempts:attemptdata',
            'timecreated' => 'privacy:metadata:contentcreator_attempts:timecreated',
            'timemodified' => 'privacy:metadata:contentcreator_attempts:timemodified',
        ], 'privacy:metadata:contentcreator_attempts');

        $collection->add_database_table('contentcreator_progress', [
            'userid' => 'privacy:metadata:contentcreator_progress:userid',
            'progress' => 'privacy:metadata:contentcreator_progress:progress',
            'timecreated' => 'privacy:metadata:contentcreator_progress:timecreated',
            'timemodified' => 'privacy:metadata:contentcreator_progress:timemodified',
        ], 'privacy:metadata:contentcreator_progress');

        $collection->add_database_table('contentcreator_checklist', [
            'userid' => 'privacy:metadata:contentcreator_checklist:userid',
            'cmid' => 'privacy:metadata:contentcreator_checklist:cmid',
            'topicid' => 'privacy:metadata:contentcreator_checklist:topicid',
            'complete' => 'privacy:metadata:contentcreator_checklist:complete',
            'timecreated' => 'privacy:metadata:contentcreator_checklist:timecreated',
            'timemodified' => 'privacy:metadata:contentcreator_checklist:timemodified',
        ], 'privacy:metadata:contentcreator_checklist');

        $collection->add_external_location_link('lmslabs', [
            'siteid' => 'privacy:metadata:lmslabs:siteid',
            'apikey' => 'privacy:metadata:lmslabs:apikey',
            'prompt' => 'privacy:metadata:lmslabs:prompt',
            'topictext' => 'privacy:metadata:lmslabs:topictext',
            'cardtext' => 'privacy:metadata:lmslabs:cardtext',
            'documentcontent' => 'privacy:metadata:lmslabs:documentcontent',
        ], 'privacy:metadata:lmslabs');

        return $collection;
    }

    /**
     * Get the list of contexts that contain user information for the specified user.
     *
     * @param int $userid The user to search.
     * @return contextlist The contextlist containing the list of contexts.
     */
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

        $sql = "SELECT ctx.id
                  FROM {context} ctx
                  JOIN {course_modules} cm ON cm.id = ctx.instanceid AND ctx.contextlevel = :contextlevel
                  JOIN {modules} m ON m.id = cm.module AND m.name = :modname
                  JOIN {contentcreator_checklist} ck ON ck.cmid = cm.id
                 WHERE ck.userid = :userid";

        $contextlist->add_from_sql($sql, [
            'contextlevel' => CONTEXT_MODULE,
            'modname' => 'contentcreator',
            'userid' => $userid,
        ]);

        return $contextlist;
    }

    /**
     * Get the list of users who have data within a context.
     *
     * @param userlist $userlist The userlist containing the list of users who have data in this context.
     * @return void
     */
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

        $sql = "SELECT ck.userid
                  FROM {contentcreator_checklist} ck
                 WHERE ck.cmid = :cmid";

        $userlist->add_from_sql('userid', $sql, [
            'cmid' => $context->instanceid,
        ]);
    }

    /**
     * Export all user data for the specified user in the specified contexts.
     *
     * @param approved_contextlist $contextlist The approved contexts to export information for.
     * @return void
     */
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
                        'completed' => transform::yesno($attempt->completed),
                        'responses' => $attempt->responses,
                        'attemptdata' => $attempt->attemptdata,
                        'timecreated' => transform::datetime($attempt->timecreated),
                        'timemodified' => transform::datetime($attempt->timemodified),
                    ];
                }
                writer::with_context($context)->export_data(
                    [get_string('privacy:metadata:contentcreator_attempts', 'mod_contentcreator')],
                    (object)['attempts' => $attemptdata]
                );
            }

            $progress = $DB->get_record('contentcreator_progress', [
                'cmid' => $cm->id,
                'userid' => $user->id,
            ]);

            if ($progress) {
                writer::with_context($context)->export_data(
                    [get_string('privacy:metadata:contentcreator_progress', 'mod_contentcreator')],
                    (object)[
                        'progress' => $progress->progress,
                        'timecreated' => transform::datetime($progress->timecreated),
                        'timemodified' => transform::datetime($progress->timemodified),
                    ]
                );
            }

            $checklist = $DB->get_records('contentcreator_checklist', [
                'cmid' => $cm->id,
                'userid' => $user->id,
            ]);

            if ($checklist) {
                $checklistdata = [];
                foreach ($checklist as $item) {
                    $checklistdata[] = [
                        'topicid' => $item->topicid,
                        'complete' => transform::yesno($item->complete),
                        'timecreated' => transform::datetime($item->timecreated),
                        'timemodified' => transform::datetime($item->timemodified),
                    ];
                }
                writer::with_context($context)->export_data(
                    [get_string('privacy:metadata:contentcreator_checklist', 'mod_contentcreator')],
                    (object)['checklist' => $checklistdata]
                );
            }
        }
    }

    /**
     * Delete all data for all users in the specified context.
     *
     * @param \context $context The specific context to delete data for.
     * @return void
     */
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
        $DB->delete_records('contentcreator_checklist', ['cmid' => $cm->id]);
    }

    /**
     * Delete all user data for the specified user in the specified contexts.
     *
     * @param approved_contextlist $contextlist The approved contexts and user information to delete.
     * @return void
     */
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
            $DB->delete_records('contentcreator_checklist', [
                'cmid' => $cm->id,
                'userid' => $userid,
            ]);
        }
    }

    /**
     * Delete multiple users' data within a single context.
     *
     * @param approved_userlist $userlist The approved context and user information to delete.
     * @return void
     */
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

        [$insql, $inparams] = $DB->get_in_or_equal($userids, SQL_PARAMS_NAMED);

        $params = array_merge(['contentcreatorid' => $cm->instance], $inparams);
        $DB->delete_records_select(
            'contentcreator_attempts',
            "contentcreatorid = :contentcreatorid AND userid $insql",
            $params
        );

        $params = array_merge(['cmid' => $cm->id], $inparams);
        $DB->delete_records_select(
            'contentcreator_progress',
            "cmid = :cmid AND userid $insql",
            $params
        );

        $params = array_merge(['cmid' => $cm->id], $inparams);
        $DB->delete_records_select(
            'contentcreator_checklist',
            "cmid = :cmid AND userid $insql",
            $params
        );
    }
}
