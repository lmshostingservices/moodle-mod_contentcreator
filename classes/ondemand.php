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
 * Content Creator - On-demand generation policy
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace mod_contentcreator;

defined('MOODLE_INTERNAL') || die();

/**
 * The single gate in front of every credit-spending call the player can originate.
 *
 * V15.6.0. Three endpoints spend site credits from inside the player: on-demand voiceover
 * (the web service and ajax.php) and the document example generator. **A learner may not
 * reach any of them.**
 *
 * The history is worth keeping, because this has been narrowed twice and both earlier
 * positions were wrong in the same direction:
 *
 * - Before v13.85 the three endpoints were gated on :view alone. Every enrolled learner on
 *   the site could draw on the same paid balance, with no control short of switching voice
 *   off entirely.
 * - v13.85 added mod/contentcreator:generateondemand and granted it to the student
 *   archetype, so that nothing changed for existing sites. But an archetype default is
 *   applied when the plugin is INSTALLED, so on an existing site the student role already
 *   carried it and an administrator had to edit the role definition to take it away.
 * - v15.5.0 put a site-level switch in front of the capability, still defaulting to on,
 *   so that the control was at least discoverable from the settings page.
 *
 * Each step made it easier to turn off something that should never have been on. A setting
 * that is always meant to be off is not a setting, it is a decision - and leaving it
 * configurable meant every site started out exposed and had to be told to change it. One
 * live site had 36 learners who could each spend from the paid balance.
 *
 * So the switch is gone, student is no longer among the capability's archetypes, and this
 * gate requires the caller to be STAFF regardless of what any role definition says. A site
 * that grants the capability to a learner role achieves nothing by it.
 *
 * What a learner loses: nothing that has already been generated. Cached audio still plays,
 * every pre-generated clip and document example still works, and none of that reaches this
 * class - the three call sites check their cache first and only come here when a request
 * would actually spend credits. What changes is that a card whose narration was never
 * generated stays silent for a learner instead of quietly billing the site, and the teacher
 * pre-generates it from the builder, which is where that decision belongs.
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class ondemand {
    /**
     * May this user originate a call that spends site credits?
     *
     * Staff only: :manage covers editing teachers and managers, :review covers
     * non-editing teachers as well. The capability is required on top, so a site can still
     * prohibit generation for a particular staff role - it just cannot grant it to a
     * learner.
     *
     * @param \context $context Module context of the activity being viewed.
     * @return bool True when this user may spend credits here.
     */
    public static function can_generate(\context $context): bool {
        if (!has_capability('mod/contentcreator:generateondemand', $context)) {
            return false;
        }
        return has_capability('mod/contentcreator:manage', $context)
            || has_capability('mod/contentcreator:review', $context);
    }

    /**
     * Gate a call that is about to spend site credits.
     *
     * Call this at the point credits would actually be spent - AFTER any cache lookup,
     * never at the top of an endpoint. Replaying audio that already exists must stay free
     * and must stay available to learners, and it does not come through here.
     *
     * @param \context $context Module context of the activity being viewed.
     * @return void
     * @throws \moodle_exception When this user may not spend credits.
     */
    public static function require_can_generate(\context $context): void {
        if (self::can_generate($context)) {
            return;
        }
        throw new \moodle_exception('errorgenerationstaffonly', 'mod_contentcreator');
    }
}
