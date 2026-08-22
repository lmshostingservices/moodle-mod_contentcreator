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
 * Upgrade script for Content Creator.
 *
 * Only releases that actually change the database schema or migrate data need a
 * step here. The long run of savepoint-only blocks that used to cover every
 * JavaScript, CSS and prompt release has been removed: a site sitting at any of
 * those intermediate versions simply falls through to the next real step and is
 * carried to the final savepoint, which always matches $plugin->version.
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

/**
 * Upgrade the mod_contentcreator plugin.
 *
 * @param int $oldversion The old version of the plugin.
 * @return bool Always returns true.
 */
function xmldb_contentcreator_upgrade($oldversion) {
    global $DB;

    $dbman = $DB->get_manager();

    // Release 7.8.4: widen manifestjson from TEXT to LONGTEXT.
    if ($oldversion < 2026011600) {
        $table = new xmldb_table('contentcreator');
        $field = new xmldb_field('manifestjson', XMLDB_TYPE_TEXT, 'big', null, null, null, null, 'intro');
        if ($dbman->field_exists($table, $field)) {
            $dbman->change_field_precision($table, $field);
        }
        upgrade_mod_savepoint(true, 2026011600, 'contentcreator');
    }

    // Release 9.78: create the contentcreator_checklist table.
    if ($oldversion < 2026031700) {
        $table = new xmldb_table('contentcreator_checklist');
        if (!$dbman->table_exists($table)) {
            $table->add_field('id', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, XMLDB_SEQUENCE, null);
            $table->add_field('cmid', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, null);
            $table->add_field('userid', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, null);
            $table->add_field('topicid', XMLDB_TYPE_CHAR, '255', null, null, null, null);
            $table->add_field('complete', XMLDB_TYPE_INTEGER, '1', null, XMLDB_NOTNULL, null, '0');
            $table->add_field('timecreated', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, null);
            $table->add_field('timemodified', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, null);
            $table->add_key('primary', XMLDB_KEY_PRIMARY, ['id']);
            $table->add_key('userid', XMLDB_KEY_FOREIGN, ['userid'], 'user', ['id']);
            $table->add_index('cmid_userid_topicid', XMLDB_INDEX_UNIQUE, ['cmid', 'userid', 'topicid']);
            $dbman->create_table($table);
        }
        upgrade_mod_savepoint(true, 2026031700, 'contentcreator');
    }

    // Release 11.05: make contentcreator_attempts (contentcreatorid, userid) unique.
    // Deduplicate any existing rows first (keep the newest per user and activity),
    // then drop the old non-unique index and create a unique one.
    if ($oldversion < 2026032104) {
        $table = new xmldb_table('contentcreator_attempts');

        // Step 1: remove duplicate rows, keeping the one with the highest id per pair.
        $dupes = $DB->get_records_sql(
            "SELECT contentcreatorid, userid, MAX(id) AS keepid, COUNT(*) AS cnt
               FROM {contentcreator_attempts}
           GROUP BY contentcreatorid, userid
             HAVING COUNT(*) > 1"
        );
        foreach ($dupes as $dupe) {
            $DB->delete_records_select(
                'contentcreator_attempts',
                'contentcreatorid = :cid AND userid = :uid AND id <> :keepid',
                ['cid' => $dupe->contentcreatorid, 'uid' => $dupe->userid, 'keepid' => $dupe->keepid]
            );
        }

        // Step 2: drop the old non-unique index and create the unique one.
        $oldindex = new xmldb_index('user_activity', XMLDB_INDEX_NOTUNIQUE, ['contentcreatorid', 'userid']);
        if ($dbman->index_exists($table, $oldindex)) {
            $dbman->drop_index($table, $oldindex);
        }
        $newindex = new xmldb_index('user_activity', XMLDB_INDEX_UNIQUE, ['contentcreatorid', 'userid']);
        if (!$dbman->index_exists($table, $newindex)) {
            $dbman->add_index($table, $newindex);
        }

        upgrade_mod_savepoint(true, 2026032104, 'contentcreator');
    }

    // Release 11.10: add the completionallactivities column.
    if ($oldversion < 2026032109) {
        $table = new xmldb_table('contentcreator');
        $field = new xmldb_field(
            'completionallactivities',
            XMLDB_TYPE_INTEGER,
            '1',
            null,
            XMLDB_NOTNULL,
            null,
            '0',
            'completionviewallslides'
        );
        if (!$dbman->field_exists($table, $field)) {
            $dbman->add_field($table, $field);
        }
        upgrade_mod_savepoint(true, 2026032109, 'contentcreator');
    }

    // Release 13.66: drop the dead requirefullscore column. It was declared in
    // install.xml but never added by an upgrade step and never read by any code,
    // so fresh installs and upgraded sites had diverged. Dropping it on both
    // sides converges the schema.
    if ($oldversion < 2026081800) {
        $table = new xmldb_table('contentcreator');
        $field = new xmldb_field('requirefullscore');
        if ($dbman->field_exists($table, $field)) {
            $dbman->drop_field($table, $field);
        }
        upgrade_mod_savepoint(true, 2026081800, 'contentcreator');
    }

    // Release 13.66: add the cmid foreign keys declared in install.xml. Fresh
    // installs get them from the XMLDB definition, so without this step an
    // upgraded site is missing both indexes and reports a schema mismatch under
    // Site administration > Development > XMLDB check.
    if ($oldversion < 2026081801) {
        foreach (['contentcreator_checklist', 'contentcreator_progress'] as $tablename) {
            $table = new xmldb_table($tablename);
            $index = new xmldb_index('cmid', XMLDB_INDEX_NOTUNIQUE, ['cmid']);
            if (!$dbman->index_exists($table, $index)) {
                $key = new xmldb_key('cmid', XMLDB_KEY_FOREIGN, ['cmid'], 'course_modules', ['id']);
                $dbman->add_key($table, $key);
            }
        }
        upgrade_mod_savepoint(true, 2026081801, 'contentcreator');
    }

    // Release 13.71: purge cached text to speech audio stranded in the system context.
    //
    // ajax.php generate_voice wrote its cache to the system context with itemid 0, while
    // lib.php only ever deleted voice_cache from the module context. Nothing removed those
    // files, no pluginfile handler served them, and they accumulated for the life of the
    // site. The cache is now written to the module context alongside the web service's,
    // so the stranded files are dead weight and can go.
    if ($oldversion < 2026082100) {
        $fs = get_file_storage();
        $fs->delete_area_files(
            \context_system::instance()->id,
            'mod_contentcreator',
            'voice_cache'
        );
        upgrade_mod_savepoint(true, 2026082100, 'contentcreator');
    }

    return true;
}
