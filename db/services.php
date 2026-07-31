<?php
/**
 * Content Creator - Web services
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

$functions = [
    'mod_contentcreator_get_manifest' => [
        'classname' => 'mod_contentcreator\\external\\get_manifest',
        'methodname' => 'execute',
        'description' => 'Get the content manifest for an activity',
        'type' => 'read',
        'ajax' => true,
        'services' => [MOODLE_OFFICIAL_MOBILE_SERVICE]
    ],
    'mod_contentcreator_save_manifest' => [
        'classname' => 'mod_contentcreator\\external\\save_manifest',
        'methodname' => 'execute',
        'description' => 'Save the content manifest for an activity',
        'type' => 'write',
        'ajax' => true
    ],
    'mod_contentcreator_save_attempt' => [
        'classname' => 'mod_contentcreator\\external\\save_attempt',
        'methodname' => 'execute',
        'description' => 'Save student attempt data',
        'type' => 'write',
        'ajax' => true,
        'services' => [MOODLE_OFFICIAL_MOBILE_SERVICE]
    ],
    'mod_contentcreator_record_section_view' => [
        'classname' => 'mod_contentcreator\\external\\record_section_view',
        'methodname' => 'execute',
        'description' => 'Record when a section is viewed',
        'type' => 'write',
        'ajax' => true
    ],
    'mod_contentcreator_generate_voiceover' => [
        'classname' => 'mod_contentcreator\\external\\generate_voiceover',
        'methodname' => 'execute',
        'description' => 'Generate text-to-speech voiceover',
        'type' => 'read',
        'ajax' => true
    ],
    'mod_contentcreator_save_slide_edit' => [
        'classname' => 'mod_contentcreator\\external\\save_slide_edit',
        'methodname' => 'execute',
        'description' => 'Save slide edit with optional voiceover regeneration',
        'type' => 'write',
        'ajax' => true
    ],
    'mod_contentcreator_generate_document_example' => [
        'classname' => 'mod_contentcreator\\external\\generate_document_example',
        'methodname' => 'execute',
        'description' => 'Generate contextual workplace document example (v6.5.3)',
        'type' => 'read',
        'ajax' => true
    ],
    'mod_contentcreator_save_manifest_chunk' => [
        'classname' => 'mod_contentcreator\\external\\save_manifest_chunk',
        'methodname' => 'execute',
        'description' => 'Save manifest chunk for large manifests (v7.8.8)',
        'type' => 'write',
        'ajax' => true
    ]
];
