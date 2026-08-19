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
        'capabilities' => 'mod/contentcreator:view',
        'ajax' => true,
        'services' => [MOODLE_OFFICIAL_MOBILE_SERVICE],
    ],
    'mod_contentcreator_save_manifest' => [
        'classname' => 'mod_contentcreator\\external\\save_manifest',
        'methodname' => 'execute',
        'description' => 'Save the content manifest for an activity',
        'type' => 'write',
        'capabilities' => 'mod/contentcreator:manage',
        'ajax' => true,
    ],
    'mod_contentcreator_save_attempt' => [
        'classname' => 'mod_contentcreator\\external\\save_attempt',
        'methodname' => 'execute',
        'description' => 'Save student attempt data',
        'type' => 'write',
        'capabilities' => 'mod/contentcreator:view',
        'ajax' => true,
        'services' => [MOODLE_OFFICIAL_MOBILE_SERVICE],
    ],
    'mod_contentcreator_record_section_view' => [
        'classname' => 'mod_contentcreator\\external\\record_section_view',
        'methodname' => 'execute',
        'description' => 'Record when a section is viewed',
        'type' => 'write',
        'capabilities' => 'mod/contentcreator:view',
        'ajax' => true,
        'services' => [MOODLE_OFFICIAL_MOBILE_SERVICE],
    ],
    'mod_contentcreator_generate_voiceover' => [
        'classname' => 'mod_contentcreator\\external\\generate_voiceover',
        'methodname' => 'execute',
        'description' => 'Generate text-to-speech voiceover',
        'type' => 'write',
        // Type is 'write' because this stores an audio file and spends vendor credits,
        // but the capability matches the runtime check in the external class, which is
        // deliberately ':view' so that non-editing roles can play generated audio.
        'capabilities' => 'mod/contentcreator:view',
        'ajax' => true,
    ],
    'mod_contentcreator_save_slide_edit' => [
        'classname' => 'mod_contentcreator\\external\\save_slide_edit',
        'methodname' => 'execute',
        'description' => 'Save slide edit with optional voiceover regeneration',
        'type' => 'write',
        'capabilities' => 'mod/contentcreator:manage',
        'ajax' => true,
    ],
    'mod_contentcreator_generate_document_example' => [
        'classname' => 'mod_contentcreator\\external\\generate_document_example',
        'methodname' => 'execute',
        'description' => 'Generate contextual workplace document example',
        'type' => 'write',
        // As above: 'write' because it calls the vendor and spends credits, but the
        // runtime check in the external class is ':view'.
        'capabilities' => 'mod/contentcreator:view',
        'ajax' => true,
    ],
    'mod_contentcreator_save_manifest_chunk' => [
        'classname' => 'mod_contentcreator\\external\\save_manifest_chunk',
        'methodname' => 'execute',
        'description' => 'Save manifest chunk for large manifests',
        'type' => 'write',
        'capabilities' => 'mod/contentcreator:manage',
        'ajax' => true,
    ],
];
