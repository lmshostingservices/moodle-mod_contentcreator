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
 * Content Creator - Capabilities
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

$capabilities = [
    // Add a Content Creator activity to a course. Authoring capability: the
    // activity name and intro are stored and rendered as HTML, hence RISK_XSS.
    'mod/contentcreator:addinstance' => [
        'riskbitmask' => RISK_XSS,
        'captype' => 'write',
        'contextlevel' => CONTEXT_COURSE,
        'archetypes' => [
            'editingteacher' => CAP_ALLOW,
            'manager' => CAP_ALLOW,
        ],
    ],
    'mod/contentcreator:view' => [
        'captype' => 'read',
        'contextlevel' => CONTEXT_MODULE,
        'archetypes' => [
            'student' => CAP_ALLOW,
            'teacher' => CAP_ALLOW,
            'editingteacher' => CAP_ALLOW,
            'manager' => CAP_ALLOW,
        ],
    ],
    // Author and manage content: writes the manifest JSON, which is rendered
    // into the player as HTML, hence RISK_XSS. Also gates every credit-consuming
    // generation endpoint.
    'mod/contentcreator:manage' => [
        'riskbitmask' => RISK_XSS,
        'captype' => 'write',
        'contextlevel' => CONTEXT_MODULE,
        'archetypes' => [
            'editingteacher' => CAP_ALLOW,
            'manager' => CAP_ALLOW,
        ],
    ],
    // Generation performed on demand from inside the player - voiceover and document
    // examples. Both spend site credits.
    //
    // V13.85 introduced this capability and granted it to student, so that nothing changed
    // for existing sites; the point then was that it COULD be prohibited per role, course
    // or cohort. V15.5.0 added a site-level switch in front of it, still defaulting to on.
    //
    // V15.6.0 ends that. A learner may not spend site credits, full stop. The switch is
    // gone and student is no longer among the archetypes, because a setting that is always
    // meant to be off is not a setting - it is a decision, and leaving it configurable
    // meant every site started out exposed and had to be told to change it.
    //
    // The capability is KEPT rather than deleted: a site may still want to grant it to a
    // trainer or assessor role that is not an editing teacher. It no longer decides on its
    // own, though - \mod_contentcreator\ondemand also requires the caller to be staff, so
    // granting it to a learner role achieves nothing.
    'mod/contentcreator:generateondemand' => [
        'captype' => 'write',
        'contextlevel' => CONTEXT_MODULE,
        'archetypes' => [
            'teacher' => CAP_ALLOW,
            'editingteacher' => CAP_ALLOW,
            'manager' => CAP_ALLOW,
        ],
    ],
    // Review learner attempts and progress. Reserved for the reporting UI; it is
    // deliberately kept defined so that sites can already grant or prohibit it.
    'mod/contentcreator:review' => [
        'captype' => 'write',
        'contextlevel' => CONTEXT_MODULE,
        'archetypes' => [
            'teacher' => CAP_ALLOW,
            'editingteacher' => CAP_ALLOW,
            'manager' => CAP_ALLOW,
        ],
    ],
];
