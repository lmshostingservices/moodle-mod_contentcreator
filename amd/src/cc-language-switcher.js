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
 * Content Creator — Language-switcher pill bar renderer.
 *
 * Extracted from player5.js as part of the player5 module split (v12.79).
 * Provides a single renderLangSwitcherHtml() function that produces the HTML
 * for the .cc5-lang-switcher tab bar shown above the topics grid when an
 * activity has additional languages configured.
 *
 * @module     mod_contentcreator/cc-language-switcher
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

define(['mod_contentcreator/cc-voiceover'], function(CcVoiceover) {
    'use strict';

    var LANGUAGE_LABELS = CcVoiceover.LANGUAGE_LABELS;

    /**
     * Minimal HTML escaper — matches the escapeHtml() utility in player5.js.
     * @param {string} str
     * @returns {string}
     */
    var _esc = function(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    };

    /**
     * Render the language-switcher pill bar HTML for the Content Creator player.
     *
     * Returns an empty string when the activity has no additional languages
     * configured, so the caller can unconditionally append the return value to
     * the topics-grid HTML without an extra guard.
     *
     * Previously inlined inside player5.js::renderTopicsGrid() as ~25 lines of
     * ad-hoc HTML building with a local `_langLabels` object.  Extracting to this
     * module:
     *   • removes the duplicate language label map from renderTopicsGrid;
     *   • makes the switcher independently testable;
     *   • gives a clear home for future additions (e.g. language flag icons).
     *
     * @param {Object}      manifest   The activity manifest object.
     * @param {string|null} activeLang The currently-active additional language code
     *                                 (e.g. 'vi-VN'), or null/empty when the primary
     *                                 language tab is selected.
     * @returns {string} HTML string for the .cc5-lang-switcher bar, or ''.
     */
    var renderLangSwitcherHtml = function(manifest, activeLang, getLabel) {
        var ml = manifest.multiLanguage;
        if (!ml || !ml.length) {
            return '';
        }
        // Only render when at least one additional language has generated topics.
        var hasPopulated = ml.some(function(e) { return e.topics && e.topics.length > 0; });
        if (!hasPopulated) {
            return '';
        }

        var activeLangCode   = activeLang || '';
        var primaryVoiceLang = (manifest.voiceSettings && manifest.voiceSettings.language) || 'en-AU';
        var primaryLabel     = LANGUAGE_LABELS[primaryVoiceLang] || primaryVoiceLang;

        // v13.94.3: two fixes here. The aria-label was a hardcoded English string - the
        // one piece of text a screen-reader user hears from this control, in a widget
        // whose entire purpose is switching language. It now comes from the label
        // bundle. And the role was "tablist"/"tab" with aria-selected, which is an
        // invalid pattern: there is no tabpanel anywhere and no aria-controls, so
        // assistive tech announced tabs that point at nothing and promised arrow-key
        // navigation that does not exist. These are toggle buttons, so they are now a
        // labelled group of buttons with aria-pressed, which is what they actually are.
        var _lbl = (typeof getLabel === 'function')
            ? getLabel
            : function(k) { return k === 'selectContentLanguage' ? 'Select content language' : k; };

        var html = '<div class="cc5-lang-switcher" role="group" aria-label="' +
            _esc(_lbl('selectContentLanguage')) + '">';
        html += '<button type="button" class="cc5-lang-pill' +
            (activeLangCode === '' ? ' cc5-lang-pill-active' : '') +
            '" data-lang="" aria-pressed="' +
            (activeLangCode === '' ? 'true' : 'false') +
            '" data-testid="btn-lang-primary">' + _esc(primaryLabel) + '</button>';

        ml.forEach(function(entry) {
            if (!entry.topics || !entry.topics.length) {
                return;
            }
            var label    = entry.label || LANGUAGE_LABELS[entry.code] || entry.code;
            var isActive = (activeLangCode === entry.code);
            html += '<button type="button" class="cc5-lang-pill' +
                (isActive ? ' cc5-lang-pill-active' : '') +
                '" data-lang="' + _esc(entry.code) +
                '" aria-pressed="' + (isActive ? 'true' : 'false') +
                '" data-testid="btn-lang-' + _esc(entry.code) + '">' +
                _esc(label) + '</button>';
        });

        html += '</div>';
        return html;
    };

    return {
        LANGUAGE_LABELS:       LANGUAGE_LABELS,
        renderLangSwitcherHtml: renderLangSwitcherHtml
    };
});
