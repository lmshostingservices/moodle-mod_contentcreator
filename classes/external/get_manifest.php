<?php
/**
 * Content Creator v6.5.0 - Get manifest external function
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace mod_contentcreator\external;

defined('MOODLE_INTERNAL') || die();

global $CFG;
require_once($CFG->libdir . '/externallib.php');

use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_single_structure;
use core_external\external_value;
use context_module;

class get_manifest extends external_api {

    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'cmid' => new external_value(PARAM_INT, 'Course module ID')
        ]);
    }

    public static function execute(int $cmid): array {
        global $DB;

        $params = self::validate_parameters(self::execute_parameters(), ['cmid' => $cmid]);

        $cm = get_coursemodule_from_id('contentcreator', $params['cmid'], 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        self::validate_context($context);

        require_capability('mod/contentcreator:view', $context);

        $contentcreator = $DB->get_record('contentcreator', ['id' => $cm->instance], '*', MUST_EXIST);

        // v11.48 FIX BUG-CC-DBWRITE: decompress manifest if stored compressed (gz: prefix)
        $rawManifest = \mod_contentcreator\manifest_storage::decompress($contentcreator->manifestjson ?? '');

        return [
            'success' => true,
            'manifest' => $rawManifest,
            'version' => $contentcreator->manifestversion ?? ''
        ];
    }

    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'success' => new external_value(PARAM_BOOL, 'Success status'),
            'manifest' => new external_value(PARAM_RAW, 'JSON manifest'),
            'version' => new external_value(PARAM_TEXT, 'Manifest version')
        ]);
    }
}
