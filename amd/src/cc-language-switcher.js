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

define('mod_contentcreator/cc-language-switcher', ['mod_contentcreator/cc-voiceover'], function(CcVoiceover) {
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
    var renderLangSwitcherHtml = function(manifest, activeLang) {
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

        var html = '<div class="cc5-lang-switcher" role="tablist" aria-label="Select content language">';
        html += '<button type="button" class="cc5-lang-pill' +
            (activeLangCode === '' ? ' cc5-lang-pill-active' : '') +
            '" data-lang="" role="tab" aria-selected="' +
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
                '" role="tab" aria-selected="' + (isActive ? 'true' : 'false') +
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
