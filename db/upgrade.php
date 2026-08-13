<?php
defined('MOODLE_INTERNAL') || die();

function xmldb_contentcreator_upgrade($oldversion) {
    if ($oldversion < 2026072800) {
        upgrade_mod_savepoint(true, 2026072800, 'contentcreator');
    }
    return true;
}
