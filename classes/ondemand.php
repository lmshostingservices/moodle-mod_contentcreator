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
 * Content Creator - Learner on-demand generation policy
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace mod_contentcreator;

defined('MOODLE_INTERNAL') || die();

/**
 * Single gate for every credit-spending call a LEARNER can originate.
 *
 * V15.5.0. Three endpoints spend site credits on a learner's behalf: on-demand
 * voiceover (web service and ajax.php) and the document example generator. Each
 * already required mod/contentcreator:generateondemand, but that capability is
 * granted to the student archetype by default, and a capability default only
 * applies to roles created after the plugin is installed. On an existing site the
 * student role already carried it, so an administrator who wanted to stop learners
 * drawing on the paid balance had to edit the student role definition - which is
 * neither obvious nor discoverable from the plugin's own settings page.
 *
 * This class adds a single site-level switch in front of the capability. It
 * defaults to on, so upgrading changes nothing; turning it off stops all three
 * endpoints for anyone who is not staff, without touching role definitions.
 *
 * Staff are exempt: a teacher previewing a course is the person who would
 * otherwise have pre-generated the same audio from the builder.
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class ondemand {
    /**
     * Whether learner-initiated, credit-spending generation is permitted site-wide.
     *
     * Unset and empty string both mean "not configured yet", which on upgrade is
     * every existing site, and both must read as enabled so behaviour is unchanged.
     *
     * @return bool True when learners may originate credit-spending calls.
     */
    public static function learner_generation_enabled(): bool {
        $raw = get_config('mod_contentcreator', 'learnerondemand');
        if ($raw === false || $raw === '') {
            return true;
        }
        return (bool)(int)$raw;
    }

    /**
     * Gate a credit-spending call that a learner may have originated.
     *
     * Call this at the point credits are about to be spent - after any cache
     * lookup, never at the top of an endpoint, so that replaying already-generated
     * audio stays free and stays available even when the switch is off.
     *
     * @param \context $context Module context of the activity being viewed.
     * @return void
     * @throws \required_capability_exception When the user may not generate.
     * @throws \moodle_exception When the site has switched learner generation off.
     */
    public static function require_can_generate(\context $context): void {
        require_capability('mod/contentcreator:generateondemand', $context);

        if (self::learner_generation_enabled()) {
            return;
        }

        // Staff would otherwise pre-generate the same content from the builder, so
        // the switch is aimed at the learner cohort only.
        if (has_capability('mod/contentcreator:manage', $context)
            || has_capability('mod/contentcreator:review', $context)) {
            return;
        }

        throw new \moodle_exception('errorlearnerondemandoff', 'mod_contentcreator');
    }
}
