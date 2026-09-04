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
 * Content Creator  -  Shared version constant, logger factory, and voiceover utilities.
 *
 * Eliminates the CC_VERSION / ccLog / ccWarn / ccError duplication that
 * previously existed independently in builder.js and player5.js.
 * v11.02: Also provides the canonical voiceover text construction so builder
 * and player produce byte-identical text  ->  no staleness on first play.
 *
 * Usage (inside any AMD module that lists 'mod_contentcreator/cc-state'):
 *
 *   var CC_VERSION = CcState.CC_VERSION;
 *   var _log = CcState.createLogger(false);   // false = production (silent log)
 *   var ccLog = _log.log, ccWarn = _log.warn, ccError = _log.error;
 *   var voText = CcState.buildVoiceoverText(section, manifest);
 *
 * @module     mod_contentcreator/cc-state
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
define([], function () {
    'use strict';

    /** Current plugin version  -  single source of truth for builder.js and player5.js. */
    // v13.94.3: this had been left at '13.65' while the plugin shipped 13.94.x, so every
    // diagnostic line in a support log claimed to come from a version 29 releases old.
    // Keep it in step with $plugin->release in version.php.
    // v15.0.0: same bug recurred - this was left at '13.94.8' through every release from
    // 13.95.0 up to 15.0.0 (roughly 20 releases), so every console log and every staleness
    // check in builder.js's compareVersions() (which compares this constant against the
    // version stamped on a saved manifest) silently thought the plugin was still on 13.94.8.
    // That breaks the "stale voiceover, re-apply?" prompt for every one of those releases,
    // since compareVersions(currentVersion, manifestVersion) never sees an increase.
    // v15.1.1: recurred a THIRD time. 15.1.0 bumped version.php to '15.1.0' and its own
    // CHANGELOG entry claimed this constant had been "bumped to match $plugin->release" -
    // but the constant was left on '15.0.0', so 15.1.0 shipped stale exactly like the two
    // releases before it. Manual sync discipline has now failed three times; tests/js/
    // test-version-mirror.js asserts this equals $plugin->release and runs with the suite,
    // so a fourth recurrence fails a test instead of reaching production.
    // CHECK THIS ON EVERY RELEASE: it must match $plugin->release in version.php exactly.
    var CC_VERSION = '15.1.1';

    // v11.02: Moved from player5.js  -  single source of truth for both builder and player.
    // Any stored voiceover whose voiceoverSchemaVersion !== VOICEOVER_SCHEMA_VERSION was
    // synthesised under an older text-construction algorithm and must be re-generated.
    // Bump this constant whenever buildVoiceoverText logic changes.
    // v11.37: Bumped from '11.02' to '11.37' to force teacher-side TTS regeneration on all
    // sections that still carry the old "1.1. Topic Name" audio. After a teacher opens the
    // activity with canEdit=true, all sections are regenerated without the numeric prefix and
    // the new voiceoverUrls are saved to the manifest so students immediately hear clean audio.
    // v12.29 FIX (BUG-VO-TRUNCATION): Bumped from '11.37' to '12.29' to force regeneration
    // of ALL existing stored voiceovers that were generated under the old 4000-char PHP limit
    // (ajax.php v11.93). Those audio files silently cut off mid-sentence inside card 4 because
    // the sentence-boundary trim landed halfway through the applied-scenario card text.
    // Teachers who open any activity in edit mode will have all voiceovers automatically
    // re-synthesised at the new 8000-char limit; students receive corrected audio immediately
    // after the teacher's first open (voiceoverUrl saved back to manifest via persistVoiceover).
    // v12.30 FIX (BUG-VO-COMPETENCY-HEADING): Bumped from '12.29' to '12.30' to force
    // re-generation of all voiceovers that have wrong sub-headings on competency-summary
    // cards. The old code path used AI-generated voiceoverText (which may say "Watch out
    // for" instead of "What to avoid") via early-return, bypassing the structured
    // goodItems/badItems path that voices the correct "What good looks like" / "What to
    // avoid" sub-headings. Teachers who open any activity will have all voiceovers
    // re-synthesised with correct headings; students receive corrected audio immediately.
    // v12.32 FIX (BUG-VO-VET-TRUNCATION): Bumped from '12.30' to '12.32' to force
    // regeneration of ALL existing Vocational, Workplace, and University voiceovers that were
    // generated at schema '12.30' under the old 8000-char or 12000-char PHP limit. Root cause:
    // v12.31 raised the PHP limit from 8000 -> 12000 (for PD) but did NOT bump this schema
    // version, so VET/Workplace/University audio stored as schema='12.30' was never detected
    // as stale and kept playing the truncated version. This bump ensures every section across
    // all four routes (Vocational, Workplace, University, PD) re-synthesises at the new
    // 20000-char limit on the teacher's next activity open.
    // v13.92: bumped from '12.32'. Topics-and-Text sections are now narrated PARAGRAPH
    // BY PARAGRAPH, verbatim, because the player syncs the card reveal and the in-focus
    // paragraph lift to the audio timeline. Any audio synthesised from the old
    // voiceoverText-summary script has the wrong content AND the wrong segment lengths,
    // so it must be regenerated.
    var VOICEOVER_SCHEMA_VERSION = '13.92';

    /**
     * Create a namespaced logger triple for a module.
     *
     * @param {boolean} verbose  When true, log() emits to console.log.
     *                           When false, log() is a silent no-op (zero cost in prod).
     * @returns {{ log: Function, warn: Function, error: Function }}
     */
    function createLogger(verbose) {
        var prefix = '[CC v' + CC_VERSION + ']';
        // This factory is the plugin's single sanctioned console boundary. Every
        // other module logs through the triple it returns, which is why the
        // no-console rule is disabled here and nowhere else.
        /* eslint-disable no-console */
        var log = verbose
            ? function () {
                console.log.apply(console, [prefix].concat(Array.prototype.slice.call(arguments)));
            }
            : function () {};
        var warn = function () {
            console.warn.apply(console, [prefix].concat(Array.prototype.slice.call(arguments)));
        };
        var error = function () {
            console.error.apply(console, [prefix].concat(Array.prototype.slice.call(arguments)));
        };
        /* eslint-enable no-console */
        return {log: log, warn: warn, error: error};
    }

    // v11.02: Moved from player5.js  -  DJB2a hash of voiceover text for staleness detection.
    function voiceoverTextHash(str) {
        var h = 5381;
        for (var i = 0; i < str.length; i++) {
            h = ((h << 5) + h) ^ str.charCodeAt(i);
            h = h & 0xffffffff;
        }
        return (h >>> 0).toString(36);
    }

    // Private fixGrammar used exclusively inside buildVoiceoverText.
    // Must match player5.js's fixGrammar exactly so hashes are identical.
    function _fg(str) {
        if (!str) return str;
        if (typeof str !== 'string') str = String(str);
        var s = str;
        // v13.94.6: this function stripped MARKDOWN and nothing else, so a field
        // holding HTML - a <br> between two sentences, a <strong> around a term, an
        // <em> the AI wrapped a definition in - reached Chirp 3 HD as literal tag
        // text and was read out as "less than b r greater than". The renderer escapes
        // those tags for display, which is why nobody saw them on screen; narration
        // has to delete them instead. <br> and closing block tags become a space so
        // the sentences either side do not fuse into one word; everything else is
        // removed outright. Done FIRST so the markdown passes below see clean text.
        // NOTE: player5.js fixGrammar needs the identical three lines - see report.
        s = s.replace(/<br\s*\/?>/gi, ' ');
        s = s.replace(/<\/(?:p|div|li|ul|ol|h[1-6]|tr|td|th|blockquote)>/gi, ' ');
        s = s.replace(/<[^>]+>/g, '');
        s = s.replace(/\*\*([^*]+)\*\*/g, '$1');
        s = s.replace(/__([^_]+)__/g, '$1');
        s = s.replace(/\*([^*]+)\*/g, '$1');
        s = s.replace(/_([^_]+)_/g, '$1');
        // v12.57 FIX-VO-SYMBOLS: Strip markdown horizontal rules and heading markers that
        // TTS reads as "dash dash dash dot" or "hash". Must match player5.js fixGrammar exactly.
        s = s.replace(/-{3,}/g, '');
        s = s.replace(/\*{3,}/g, '');
        s = s.replace(/#{1,6}\s*/g, '');
        s = s.replace(/\bso you don['\u2019]?t\s+(?=[a-z]+\b)(?!have|get|need|make|miss|lose|fall|cause|end|skip|forget|ignore|rush|start|put|leave|let|take|break|use|risk|create|become|repeat|face|allow|go|run|do|know|see|feel|think|try|keep|come|give|find|want|work|stop|set|move|turn|hold|bring|begin|carry|follow|overlook|expose|compromise|violate|exceed|delay|suffer|experience|injure|damage|endanger|contaminate|drop|wear|hit|cut|catch|pass|sit|stand|add|open|check|provide|handle|manage|ensure|maintain|avoid|prevent|reduce|increase|improve|receive|complete)/gi, 'so you avoid ');
        s = s.replace(/\bso you\s+your\b/gi, 'so you protect your');
        s = s.replace(/\bso you\s+safety\b/gi, 'so you maintain safety');
        s = s.replace(/\bso you\s+the\s+safety\b/gi, 'so you ensure the safety');
        s = s.replace(/\bso you\s+the\s+/gi, 'so you understand the ');
        s = s.replace(/\bso you\s+(?:optimal|proper|adequate|sufficient|full|complete|clear|immediate|minimal|consistent|accurate|appropriate|correct|comfortable|effective|efficient|maximum|minimum|good|better|best|safe|total|reliable|thorough|reasonable|necessary|successful|secure|healthy|stable|strong|smooth|timely|rapid|quick|clean|standard|suitable|regular|balanced|controlled|steady|uniform)\b/gi, function (match) {
            return 'so you ensure ' + match.replace(/^so you\s+/i, '');
        });
        s = s.replace(/\b(is|are|was|were)\s+because\s+because\b/gi, '$1 because');
        s = s.replace(/\b(\w{4,})\s+\1\b/g, '$1');
        s = s.replace(/\.\s*\.\s*/g, '. ');
        s = s.replace(/\s{2,}/g, ' ');
        return s.trim();
    }

    // Contrast-pair label lookup  -  simplified version of player5.js getContrastPair.
    // Used only for legacy sections without cards.
    var _CONTRAST_LABELS = {
        'dos-donts':                    { positive: "Do's",                  negative: "Don'ts" },
        'safe-unsafe':                  { positive: "Safe Practice",         negative: "Unsafe Practice" },
        'great-poor-service':           { positive: "Great Customer Service",negative: "Poor Customer Service" },
        'compliant-noncompliant':       { positive: "Compliant",             negative: "Non-Compliant" },
        'above-below-line':             { positive: "Above the Line",        negative: "Below the Line" },
        'professional-unprofessional':  { positive: "Professional",          negative: "Unprofessional" },
        'effective-ineffective':        { positive: "Effective",             negative: "Ineffective" },
        'best-avoid':                   { positive: "Best Practice",         negative: "Avoid" },
        'correct-incorrect':            { positive: "Correct",               negative: "Incorrect" },
        'acceptable-unacceptable':      { positive: "Acceptable",            negative: "Unacceptable" }
    };

    // v13.94.3: the table above was read straight into the narration stream, so a legacy
    // section in any of 52 languages had "Do's" / "Don'ts" spoken in English by the
    // target-language voice. Every key below already existed in translations.js and was
    // simply never consulted from here. The English table stays as the fallback - it is
    // reachable, because no resolver is registered until the player inits.
    // v13.94.3: the eleven keys cc-icons.js CONTRAST_PAIRS actually defines. Kept here
    // so sectionContrastType() can reject anything that is not one of them.
    var CONTRAST_PAIR_KEYS = [
        'dos-donts', 'safe-unsafe', 'great-poor-service', 'compliant-noncompliant',
        'above-below-line', 'professional-unprofessional', 'effective-ineffective',
        'best-avoid', 'correct-incorrect', 'tick-cross', 'acceptable-unacceptable'
    ];

    /**
     * v13.94.3: contrast type for a SECTION - the do/don't and drag-sort column pair.
     *
     * Six sites in player5.js plus buildVoiceoverText below read section.contrastType.
     * NOTHING WRITES IT. prompts.js normalizeCards() writes a field of the same name
     * onto each CARD, but that is a different thing entirely - its values are card
     * LAYOUT types ('translation', 'checklist', 'action-grid', 'error-list',
     * 'workplace-scenario'), not contrast pairs. Copying a card's value up to the
     * section would put 'checklist' into a lookup that expects 'safe-unsafe', so the
     * two must not be conflated however similar the field names look.
     *
     * The practical consequence is that every contrast pair resolves to 'dos-donts'
     * today, and the other ten entries in CONTRAST_PAIRS are unreachable. That is now a
     * documented state rather than a silent one: this function is the single place a
     * producer needs to feed, and it validates whatever it is given so a layout value
     * can never leak into the pair lookup again.
     *
     * @param {Object} section A section object.
     * @return {String} A valid CONTRAST_PAIRS key, never empty.
     */
    function sectionContrastType(section) {
        var candidate = section && (section.contrastType || section.contrastPairType);
        if (candidate && CONTRAST_PAIR_KEYS.indexOf(candidate) !== -1) { return candidate; }
        return 'dos-donts';
    }

    var _CONTRAST_LABEL_KEYS = {
        'dos-donts':                    { positive: 'dos_donts_pos',    negative: 'dos_donts_neg' },
        'safe-unsafe':                  { positive: 'safe_pos',         negative: 'safe_neg' },
        'great-poor-service':           { positive: 'service_pos',      negative: 'service_neg' },
        'compliant-noncompliant':       { positive: 'compliant_pos',    negative: 'compliant_neg' },
        'above-below-line':             { positive: 'aboveTheLine',     negative: 'belowTheLine' },
        'professional-unprofessional':  { positive: 'professional_pos', negative: 'professional_neg' },
        'effective-ineffective':        { positive: 'effective_pos',    negative: 'effective_neg' },
        'best-avoid':                   { positive: 'best_pos',         negative: 'best_neg' },
        'correct-incorrect':            { positive: 'correct_pos',      negative: 'correct_neg' },
        'acceptable-unacceptable':      { positive: 'acceptable_pos',   negative: 'acceptable_neg' }
    };

    /**
     * Build the canonical voiceover text for a section.
     * v11.02: Extracted from player5.js buildFullVoiceoverText so builder.js
     * can produce byte-identical text during pre-generation.
     *
     * @param {Object} section  The section object (with optional .cards[])
     * @param {Object} manifest The full manifest (used for slide-number prefix)
     * @returns {string} The complete voiceover text ready for TTS synthesis
     */
    // =======================================================================
    // v13.92: TOPICS-AND-TEXT prose narration.
    //
    // These cards are read VERBATIM, one paragraph at a time, and the player uses the
    // very same segment list to drive the sequential card reveal and the in-focus
    // paragraph lift. Both come from _proseCardSegments() so the audio and the animation
    // can never drift apart: change the narration here and the timing map follows.
    // =======================================================================
    var PROSE_CARD_TYPES = ['overview', 'key-concepts', 'examples-application', 'key-takeaways',
        // v13.91 slot names, still present in saved modules.
        'orientation', 'foundations', 'mechanism', 'in-practice', 'boundaries'];

    // The four headings are FIXED and universal - never topic-specific, and never
    // "Overview - Colonisation". The v13.91 slots map onto the nearest of the four.
    var PROSE_HEADINGS = {
        'overview':             'Overview',
        'key-concepts':         'Key Concepts',
        'examples-application': 'Examples & Application',
        'key-takeaways':        'Key Takeaways',
        'orientation':          'Overview',
        'foundations':          'Key Concepts',
        'mechanism':            'How It Works',
        'in-practice':          'Examples & Application',
        'boundaries':           'Key Takeaways'
    };

    /**
     * Paragraphs of a prose card as clean plain strings.
     *
     * Tolerates every shape a saved manifest might hold, and strips the literal "\n"
     * escape sequences that v13.91 output shipped on screen.
     *
     * @param {Object} card A prose card.
     * @return {Array} Plain-text paragraphs.
     */
    function proseParagraphs(card) {
        // Character-for-character identical to cc-card-slots.js proseParagraphsOf().
        // See the comment on the emptiness test below for why that matters.
        var raw = card && card.paragraphs;
        if (typeof raw === 'string') { raw = [raw]; }
        // The emptiness test and the fallback chain here MUST match
        // cc-card-slots.js proseParagraphsOf() exactly. The reveal animation and the
        // paragraph highlight are addressed by index into this list, so a list one
        // element longer or shorter than the rendered <p> list silently lifts the wrong
        // paragraph for the rest of the section.
        if (!Array.isArray(raw) || !raw.length) {
            var fb = (card && (card.bodyText || card.text || card.content || card.description)) || '';
            raw = fb ? [fb] : [];
        }
        var out = [];
        raw.forEach(function (item) {
            var t = typeof item === 'string' ? item : ((item && (item.text || item.paragraph || item.body)) || '');
            if (!t) { return; }
            t.replace(/\\r\\n|\\n|\\r/g, '\n').replace(/<br\s*\/?>/gi, '\n').split(/\n+/).forEach(function (part) {
                var c = part.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '')
                            .replace(/\*\*(.+?)\*\*/g, '$1')
                            .replace(/\s{2,}/g, ' ')
                            .trim();
                if (c) { out.push(c); }
            });
        });
        return out;
    }

    /**
     * True when this section is a Topics-and-Text prose pack.
     *
     * Detected from the cards themselves rather than a route flag, so a saved manifest
     * behaves correctly even when its route metadata is missing.
     *
     * @param {Object} section A manifest section.
     * @return {Boolean} Whether the section renders as prose cards.
     */
    function isProseSection(section) {
        var cards = section && section.cards;
        if (!Array.isArray(cards) || !cards.length) { return false; }
        var prose = 0;
        for (var i = 0; i < cards.length; i++) {
            var t = cards[i] && cards[i].cardType;
            if (PROSE_CARD_TYPES.indexOf(t) >= 0) { prose++; }
            else if (t !== 'decision-point') { return false; }
        }
        return prose > 0;
    }

    // v13.94.3: PROSE_HEADINGS is an English table, and the heading it produced was
    // pushed into the narration stream verbatim - so a module generated in, say, Arabic
    // had an English "Key Concepts" read aloud over translated prose. cc-state has no
    // access to the label bundle, so the player registers a resolver at init and this
    // table becomes the fallback rather than the answer.
    var PROSE_HEADING_LABEL_KEYS = {
        'overview':             'proseOverview',
        'key-concepts':         'proseKeyConcepts',
        'examples-application': 'proseExamplesApplication',
        'key-takeaways':        'proseKeyTakeaways',
        'orientation':          'proseOverview',
        'foundations':          'proseKeyConcepts',
        'mechanism':            'proseHowItWorks',
        'in-practice':          'proseExamplesApplication',
        'boundaries':           'proseKeyTakeaways'
    };

    var _proseLabelResolver = null;

    /**
     * Register the label lookup this module uses. Called once by the player.
     * @param {Function} fn getLabel-compatible resolver.
     */
    function setLabelResolver(fn) {
        _proseLabelResolver = (typeof fn === 'function') ? fn : null;
    }

    // v13.94.3: the resolver was introduced for prose headings only, but the SAME
    // English literals were being pushed into the narration stream from a dozen other
    // places in buildVoiceoverText() - card headings, sub-headings, the "Now, complete
    // the activity below." CTA, the Key Terms / Key Takeaway / Pro Tip prefixes. Those
    // strings are sent to Chirp 3 HD and baked into the audio file, so a Japanese module
    // had an English phrase read mid-sentence in a Japanese voice. One resolver now
    // serves all of them. The old name is kept as a working alias because player5.js
    // still calls it by that name at init.
    var setProseHeadingResolver = setLabelResolver;

    /**
     * Translated label with an English fallback.
     *
     * The fallback is REACHABLE here, unlike the equivalent in cc-card-slots.js: the
     * resolver is null until the player registers one, and buildVoiceoverText() is also
     * called from build-time paths that never init the player at all.
     *
     * @param {String} key      Label key.
     * @param {String} fallback English text to use when no resolver is registered.
     * @return {String} The label.
     */
    function _lbl(key, fallback) {
        if (key && _proseLabelResolver) {
            try {
                var v = _proseLabelResolver(key);
                // getLabel() returns the key itself when the key is undefined, which is
                // NOT a usable narration string - a TTS engine would read "keyTakeaway"
                // out loud. Treat a value identical to the key as a miss.
                if (v && typeof v === 'string' && v !== key) { return v; }
            } catch (e) {
                // FIX-CC-ESLINT-NO-CONSOLE (v13.95.4): this called console.warn directly, which
                // is a no-console error under the plugin's ESLint config and would fail
                // moodle-plugin-ci. createLogger() above is documented as the plugin's single
                // sanctioned console boundary - "disabled here and nowhere else" - so this is
                // routed through it rather than earning a second exemption.
                createLogger(false).warn('label resolver failed for ' + key + ': ' +
                    (e && e.message ? e.message : e));
            }
        }
        return fallback;
    }

    /**
     * Translated label with {placeholder} substitution.
     *
     * v13.94.3: 'X means Y' and 'You are X' are sentence splices, not concatenations of
     * a label and a value. Translating the fragment ' means ' on its own is meaningless
     * in a language that puts the copula last, so the whole sentence is one key and the
     * term/definition are substituted into it.
     *
     * @param {String} key      Label key holding {placeholders}.
     * @param {String} fallback English pattern.
     * @param {Object} params   Placeholder values.
     * @return {String} The formatted phrase.
     */
    function _lblf(key, fallback, params) {
        var s = _lbl(key, fallback);
        Object.keys(params || {}).forEach(function (p) {
            s = s.split('{' + p + '}').join(params[p]);
        });
        return s;
    }

    /**
     * v13.94.6: narrate the "What the law says" panel.
     *
     * generator.js builds card.legalLink from the card's heading, keyInfo and
     * summaryLine, and cc-card-slots.js renders legislationName, legalObligation and
     * scenarioConnection in a prominent panel under the concept insights. NONE of it
     * was narrated: the concept-explainer branch below read conceptInsights[] and
     * stopped. On VET and Workplace that panel IS the compliance payload of the route -
     * the learner saw the legislation and the obligation on screen and heard nothing
     * about it. Led by the panel's own label so the audio names what it is naming on
     * screen, and using the same labelKey the renderer uses, because PD carries
     * 'whatThePrincipleRequires' there rather than 'whatTheLawSays'.
     *
     * @param {Array}  arr  The parts array being assembled for this card.
     * @param {Object} card The card carrying legalLink.
     * @return {void}
     */
    function _pushLegalLinkFields(arr, card) {
        var ll = card && card.legalLink;
        if (!ll || !ll.legislationName) { return; }
        var key = ll.labelKey || 'whatTheLawSays';
        var fallback = (key === 'whatThePrincipleRequires')
            ? 'What the principle requires'
            : 'What the law says';
        arr.push(_lbl(key, fallback) + '. ' + _fg(ll.legislationName));
        if (ll.legalObligation) { arr.push(_fg(ll.legalObligation)); }
        if (ll.scenarioConnection) { arr.push(_fg(ll.scenarioConnection)); }
    }

    /**
     * v13.94.6: append the card-6 call to action exactly once.
     *
     * The prompts REQUIRE card 6's voiceoverText to end with "Now, complete the
     * activity below." (prompts.js lines 356/456/512/1356/1441/1484/1807), and both
     * call sites below then appended the label again - so the learner heard the
     * sentence twice, back to back, at the end of every competency-summary card whose
     * authored script was used. Strip a trailing occurrence from the last part before
     * appending. The comparison is against the RESOLVED label as well as the English
     * one: a translated module's script ends with the translated sentence, and an
     * English-only check would leave that doubled too.
     *
     * @param {Array} arr The parts array being assembled for this card.
     * @return {void}
     */
    function _pushActivityCta(arr) {
        var cta = _lbl('nowCompleteActivityBelow', 'Now, complete the activity below.');
        var variants = [cta];
        if (variants.indexOf('Now, complete the activity below.') < 0) {
            variants.push('Now, complete the activity below.');
        }
        if (arr.length) {
            var last = String(arr[arr.length - 1]);
            variants.forEach(function (v) {
                var core = v.replace(/[\s.!?。！？]+$/, '');
                if (!core) { return; }
                var esc = core.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                last = last.replace(
                    new RegExp('[\\s.!?。！？]*' + esc + '[\\s.!?。！？]*$', 'i'), '');
            });
            last = last.replace(/\s+$/, '');
            if (last) { arr[arr.length - 1] = last; } else { arr.pop(); }
        }
        arr.push(cta);
    }

    /**
     * Translated heading for a prose card type, falling back to English.
     * @param {String} cardType Prose card type.
     * @return {String} Heading text, or '' when the type has none.
     */
    function proseHeadingFor(cardType) {
        // v13.94.3: folded into the shared _lbl() helper - same behaviour, one code path.
        return _lbl(PROSE_HEADING_LABEL_KEYS[cardType], PROSE_HEADINGS[cardType] || '');
    }

    /**
     * Narration segments for one prose card: the fixed heading, then each paragraph.
     *
     * @param {Object} card      A prose card.
     * @param {Number} cardIndex Its index among the section's prose cards.
     * @return {Array} Segments of { cardIndex, cardType, kind, paraIndex, text }.
     */
    function proseCardSegments(card, cardIndex) {
        var segs = [];
        var paras = proseParagraphs(card);
        // v13.94.6: a prose card with no paragraphs was still narrated as a bare
        // heading - the voice announced "Key Concepts." and moved on - while the
        // renderer showed the noContentYet message in its place. Announcing a heading
        // over an empty card tells the learner nothing and hides the fault. The card
        // now contributes no segment at all, which is also correct for the timing map:
        // revealProseCard() reveals every card up to the one being narrated, so the
        // empty card still appears, and its own Next Card button still works.
        if (!paras.length) { return segs; }
        var heading = proseHeadingFor(card.cardType);
        if (heading) {
            segs.push({ cardIndex: cardIndex, cardType: card.cardType, kind: 'heading', paraIndex: -1, text: heading });
        }
        paras.forEach(function (p, i) {
            segs.push({ cardIndex: cardIndex, cardType: card.cardType, kind: 'para', paraIndex: i, text: p });
        });
        return segs;
    }

    /**
     * Card-level narration segments for ANY route.
     *
     * v13.92: the Topics-and-Text card reveal and paragraph highlight proved out on prose
     * cards; this is the same idea generalised so every route can show WHICH CARD is being
     * narrated. It is deliberately card-level only. The other routes narrate structural
     * sub-elements (scene parts, insights, steps, mistake rows), and highlighting those
     * would mean timing four-to-eight-word fragments off a proportional split - visibly
     * loose, and wrong outright on the cards where an authored voiceoverText is narrated
     * instead of the structural fields. A card is 60-110 words, which the split handles
     * well.
     *
     * The segments come from buildVoiceoverText()'s own traversal, so the audio script is
     * unchanged - no regeneration, no schema bump. That is asserted rather than assumed:
     * if the out-param ever altered the text, this returns nothing and the highlight
     * simply does not run, rather than running out of step with the audio.
     *
     * @param {Object} section  A manifest section.
     * @param {Object} manifest The manifest.
     * @return {Array} [{ cardIndex, text, words }] in spoken order; empty when unavailable.
     */
    function buildCardVoiceoverSegments(section, manifest) {
        if (!section) { return []; }
        var ranges = [];
        var withOut = buildVoiceoverText(section, manifest, ranges);
        if (!withOut || !ranges.length) { return []; }
        if (withOut !== buildVoiceoverText(section, manifest)) { return []; }

        var segs = [];
        ranges.forEach(function (r) {
            var text = r.text || '';
            var words = text.split(/\s+/).filter(Boolean).length;
            // A card that contributed no narration - decision-point always, and any card
            // whose fields were all empty - gets no segment. It is never highlighted, which
            // is correct: nothing is being said about it.
            if (!words) { return; }
            segs.push({ cardIndex: r.cardIndex, text: text, words: words });
        });
        return segs;
    }

    /**
     * The whole section's narration, segment by segment, in spoken order.
     *
     * The player divides the audio duration across these segments in proportion to
     * their word counts to know which card to reveal and which paragraph to lift.
     *
     * @param {Object} section A manifest section.
     * @return {Array} Ordered segments.
     */
    function buildProseVoiceoverSegments(section) {
        if (!isProseSection(section)) { return []; }
        var segs = [];
        var proseIdx = 0;
        (section.cards || []).forEach(function (card) {
            if (!card || PROSE_CARD_TYPES.indexOf(card.cardType) < 0) { return; }
            segs = segs.concat(proseCardSegments(card, proseIdx));
            proseIdx++;
        });
        return segs;
    }

    /**
     * v13.94.6: the SECTION-level display fields - Key Terms, the four accent cards and
     * the workplace scenario block.
     *
     * These were narrated ONLY from inside the `else` of "does this section have
     * cards?", i.e. only on legacy sections that have no cards[] at all. But
     * generator.js copies terminology, keyTakeaway, proTip, keyInfo and expertInsight
     * from the first card up onto EVERY card-based section it builds (see the return
     * of the section assembler), and player5.js renders the Key Terms list and
     * renderAccentCards() unconditionally on every learning slide. So on every VET,
     * Workplace, PD and University section the learner saw a green Key Takeaway card,
     * an amber Pro Tip, a blue Key Information card, a purple Expert Insight and the
     * Key Terms list, and heard none of them.
     *
     * @param {Array}  parts   The narration parts array.
     * @param {Object} section The section.
     * @return {void}
     */
    function _pushSectionLevelFields(parts, section) {
        var terms = section.terminology || [];
        if (terms.length) {
            var voTermParts = [];
            terms.forEach(function (term) {
                var name = (term.term || '').trim();
                var def = (term.definition || '').trim();
                // v13.94.3: ' means ' was spliced between two translated
                // strings, producing a half-English sentence in the audio. The
                // whole sentence is one key so a language that orders the
                // copula differently can express it correctly.
                if (name && def) {
                    voTermParts.push(_lblf('termMeansDefinition', '{term} means {definition}',
                        {term: name, definition: def}));
                }
            });
            // v13.94.3: spoken prefix, was English-only. keyTerms already exists.
            if (voTermParts.length) parts.push(_lbl('keyTerms', 'Key Terms') + '. ' + voTermParts.join('. '));
        }
        // v13.94.3: four spoken prefixes, all English literals in the audio
        // script. Every one of these keys already existed in translations.js and
        // was simply never read here.
        if (section.keyTakeaway) parts.push(_lbl('keyTakeaway', 'Key Takeaway') + '. ' + _fg(section.keyTakeaway));
        if (section.proTip) parts.push(_lbl('proTip', 'Pro Tip') + '. ' + _fg(section.proTip));
        if (section.keyInfo || section.didYouKnow) parts.push(_lbl('keyInfo', 'Key Information') + '. ' + _fg(section.keyInfo || section.didYouKnow));
        if (section.expertInsight) parts.push(_lbl('expertInsight', 'Expert Insight') + '. ' + _fg(section.expertInsight));
        if (section.scenario) {
            var scenario = section.scenario;
            var scenTitle = scenario.title || scenario.scenarioTitle;
            if (scenTitle) parts.push(_fg(scenTitle));
            // v13.94.3: English fallback title spoken aloud; workplaceScenario
            // already existed in translations.js and was unused here.
            else parts.push(_lbl('workplaceScenario', 'Workplace Scenario'));
            if (scenario.role) {
                var roleText = _fg(scenario.role);
                // v13.94.3: 'You are ' + role is a sentence splice, so it is a
                // whole parameterised phrase rather than a translated prefix
                // concatenated onto a translated noun. The startsWith() guard
                // stays English-only on purpose: it only exists to stop the
                // English prompt output "You are a supervisor..." being doubled,
                // and a translated role never matches it anyway.
                if (!roleText.toLowerCase().startsWith('you are')) {
                    roleText = _lblf('youAreRole', 'You are {role}', {role: roleText});
                }
                parts.push(roleText);
            }
            if (scenario.context) parts.push(_fg(scenario.context));
            if (scenario.complication) parts.push(_fg(scenario.complication));
        }
    }

    function buildVoiceoverText(section, manifest, cardRangesOut) {
        var parts = [];
        // v13.92: optional out-param. When an array is passed, this records
        // { cardIndex, text } for each card - the narration that card contributed.
        // It is written as a SIDE EFFECT of the one function that builds the audio
        // script, which is the whole point: the segment map and the narration cannot
        // drift apart, because there is only one traversal. Nothing about the returned
        // text changes when the out-param is present - buildCardVoiceoverSegments()
        // asserts exactly that.
        var _ranges = Array.isArray(cardRangesOut) ? cardRangesOut : null;

        // -- TITLE PREFIX --------------------------------------------------
        // v11.36 FIX-VO-NUMBERING: Removed automatic "X.Y: " slide-number prefix.
        // Tester bug: VoiceOver was prepending "1.1" to every topic name even
        // when the title contained no such number. Expected: title announced
        // exactly as written, with no auto-generated numbering.
        // v13.36 FIX-CC-TITLE-VO: Section title removed from TTS voiceover script.
        // The title is already displayed visually in the slide header; reading it
        // aloud was redundant and reported as undesirable ("male voice reads section
        // title before content"). Commented out rather than deleted for reference.
        // if (section.title) {
        //     var _voTitleClean = section.title.replace(/^\d+\.\d+[.\s:]+/, '');
        //     parts.push(_fg(_voTitleClean) + '.');
        // }

        // -- CARD-BASED SECTIONS -------------------------------------------
        if (section.cardType && !(section.cards && section.cards.length > 0)) {
            // Single-card legacy section (promoted cardType, no cards[])
            var _singleStart = parts.length;
            var hasVoiceoverScript = false;
            if (section.voiceoverText) {
                parts.push(_fg(section.voiceoverText));
                hasVoiceoverScript = true;
            }
            if (!hasVoiceoverScript) {
                // v13.36 FIX-CC-TITLE-VO: skipTitle=true suppresses section title
                // in voiceover output (title was removed from the push above).
                _pushLegacyCardFields(parts, section, true);
            }
            if (_ranges) { _ranges.push({ cardIndex: 0, text: parts.slice(_singleStart).join('. ') }); }
        } else {
            if (section.cards && section.cards.length > 0) {
                // Multi-card (route-card) section
                var _vo7CardTypes = ['hook-scenario','concept-explainer','mental-model',
                    'applied-scenario','mistakes','competency-summary','decision-point',
                    'concept-anchor','theoretical-framework','analytical-lens',
                    'ethics-considerations','case-study-1','case-study-2'];
                var _voFirstCard = section.cards[0];
                var _voIs7CardSection = _voFirstCard && _vo7CardTypes.indexOf(_voFirstCard.cardType) >= 0;
                var _voCards = section.cards;
                var _voIsProse = isProseSection(section);
                if (!_voIs7CardSection && !_voIsProse && section.voiceoverText && section.voiceoverText.trim()) {
                    var _promotedStart = parts.length;
                    parts.push(_fg(section.voiceoverText));
                    _voCards = section.cards.slice(1);
                    // The promoted section.voiceoverText stands IN PLACE OF card 0 - which
                    // is exactly why card 0 is sliced off the loop below. It is card 0's
                    // narration, so it gets card 0's segment; without this the first card
                    // is never highlighted while its own script is being read.
                    if (_ranges) {
                        _ranges.push({ cardIndex: 0, text: parts.slice(_promotedStart).join('. ') });
                    }
                }
                var _voEmitCard = function (card) {
                    if (!card) return;
                    // v13.92: Topics-and-Text - read the visible prose verbatim, heading
                    // first, so the audio timeline maps one-to-one onto what is on screen.
                    if (PROSE_CARD_TYPES.indexOf(card.cardType) >= 0) {
                        proseCardSegments(card, 0).forEach(function (seg) {
                            parts.push(_fg(seg.text));
                        });
                        return;
                    }
                    var _7CARD_TYPES = ['hook-scenario','concept-explainer','mental-model',
                        'applied-scenario','mistakes','competency-summary','decision-point'];
                    if (_7CARD_TYPES.indexOf(card.cardType) >= 0) {
                        // -- 7-CARD TYPE HANDLING --------------------------
                        // v13.94.3: these seven were hard-coded English literals pushed
                        // straight into the TTS script, so every 7-card slide in a
                        // non-English module opened with an English phrase spoken in the
                        // target-language voice. They are the same seven headings the
                        // flow badge renders in cc-card-slots.js and now share its keys.
                        var _7CARD_HEADINGS = {
                            'hook-scenario':     ['sceneSetting',            'Scene Setting'],
                            'concept-explainer': ['whatThisMeans',           'What This Means'],
                            'mental-model':      ['howToHandleIt',           'How to Handle It'],
                            'applied-scenario':  ['onTheJob',                'On the Job'],
                            'mistakes':          ['watchOutFor',             'Watch Out For'],
                            'competency-summary':['youAreReadyWhenYouCan',   'You Are Ready When You Can'],
                            'decision-point':    ['yourDecision',            'Your Decision']
                        };
                        var _7parts = [];
                        var _7head = _7CARD_HEADINGS[card.cardType];
                        var _7headLabel = _7head ? _lbl(_7head[0], _7head[1]) : '';
                        var _7headText = '';
                        if (_7headLabel) {
                            // v12.28 FIX-CC-VO-HEADINGS: Use card.heading when present
                            // (7-card VET content stores the teacher-authored per-card
                            // heading in card.heading, not card.title). Previously only
                            // card.title was checked so cards whose heading was stored in
                            // card.heading produced no voiced heading text.
                            var _cardHeading = card.heading || card.title || '';
                            // v13.94.3: the dupe check now compares against BOTH the
                            // resolved label and the English one. Stripping non-Latin
                            // characters reduces a translated label to '', which would
                            // have matched any heading that is also non-Latin - every
                            // heading in a Japanese module - and silently dropped it.
                            var _norm = function (s) { return (s || '').replace(/[^a-zA-Z]/g, '').toLowerCase(); };
                            var _titleNorm = _norm(_cardHeading);
                            var _titleIsDupe = (_titleNorm !== '' &&
                                    (_titleNorm === _norm(_7headLabel) || _titleNorm === _norm(_7head && _7head[1])))
                                || _cardHeading === _7headLabel
                                || _titleNorm === 'youhavethisskillwhenyoucan';
                            _7headText = (_cardHeading && !_titleIsDupe)
                                ? (_7headLabel + ': ' + _fg(_cardHeading))
                                : _7headLabel;
                            _7parts.push(_7headText + '.');
                        }
                        // v12.25: Explicit voiceover script takes priority over structural
                        // field extraction. When a teacher types a custom narration in the
                        // Edit Slide modal's "Voiceover Script" field, that script is used
                        // directly for TTS instead of being re-derived from sceneParts /
                        // conceptInsights / steps etc. This also ensures the hash check in
                        // saveSlideEdit detects the change and triggers auto-regen.
                        // v12.30 FIX (BUG-VO-COMPETENCY-HEADING): Skip early-return for
                        // competency-summary when goodItems or badItems are populated.
                        // AI-generated voiceoverText for this card type often uses ad-hoc
                        // phrases like "Watch out for" instead of the canonical sub-headings
                        // "What good looks like" and "What to avoid". The structured
                        // goodItems/badItems branch (below) always voices the correct
                        // sub-headings. When neither goodItems nor badItems exist the
                        // fallback inside competency-summary still uses voiceoverText.
                        // v13.94.6: _compGoodItems mirrors renderCompetencySummary()
                        // exactly - when goodItems AND badItems are both empty the
                        // renderer promotes items[] (or standardItems[]) into the
                        // visible checklist, and the narrator never read either, so a
                        // legacy card-6 showed five criteria on screen and narrated a
                        // summary that mentioned none of them. Computed before
                        // _skipForCompetency so the promoted list also suppresses the
                        // voiceoverText early-return, for the same reason v12.30 made
                        // goodItems/badItems suppress it: the structured branch voices
                        // the checklist the learner is actually looking at.
                        var _compGoodItems = [];
                        if (card.cardType === 'competency-summary') {
                            if (card.goodItems && card.goodItems.length) {
                                _compGoodItems = card.goodItems;
                            } else if (!(card.badItems && card.badItems.length)) {
                                _compGoodItems = card.items || card.standardItems || [];
                            }
                        }
                        var _skipForCompetency = (card.cardType === 'competency-summary' &&
                            (_compGoodItems.length ||
                             (card.badItems  && card.badItems.length)));
                        // v13.41 FIX-VO-VERBATIM: When structural content fields exist
                        // (sceneParts, conceptInsights, steps, items), skip the voiceoverText
                        // early-return so the verbatim structural content is always read aloud.
                        // voiceoverText is often an AI-generated summary; structural fields hold
                        // the exact displayed text. Only fall back to voiceoverText when no
                        // structural fields are populated.
                        var _hasStructuralContent =
                            ((card.cardType === 'hook-scenario' || card.cardType === 'applied-scenario') &&
                             card.sceneParts && card.sceneParts.length > 0) ||
                            (card.cardType === 'concept-explainer' &&
                             card.conceptInsights && card.conceptInsights.length > 0) ||
                            (card.cardType === 'mental-model' &&
                             card.steps && card.steps.length > 0) ||
                            (card.cardType === 'mistakes' &&
                             card.items && card.items.length > 0);
                        if (card.cardType !== 'decision-point' && card.voiceoverText && card.voiceoverText.trim() && !_skipForCompetency && !_hasStructuralContent) {
                            _7parts.push(_fg(card.voiceoverText.trim()));
                            // v13.94.6: the authored script for this card is REQUIRED by
                            // the prompt to end with the CTA, and this pushed it again -
                            // "Now, complete the activity below. Now, complete the
                            // activity below." Deduped in _pushActivityCta().
                            if (card.cardType === 'competency-summary') {
                                _pushActivityCta(_7parts);
                            }
                            // v13.94.6: the legal-link panel renders on concept-explainer
                            // regardless of which narration path is taken, so it has to be
                            // narrated on this path too - see _pushLegalLinkFields().
                            if (card.cardType === 'concept-explainer') {
                                _pushLegalLinkFields(_7parts, card);
                            }
                            if (_7parts.length) parts.push(_7parts.join('. '));
                            return;
                        }
                        if (card.cardType === 'decision-point') {
                            _7parts = [];
                        } else {
                            if (card.cardType === 'hook-scenario' || card.cardType === 'applied-scenario') {
                                if (card.sceneParts && card.sceneParts.length) {
                                    card.sceneParts.forEach(function (part) {
                                        if (part.title) _7parts.push(_fg(part.title));
                                        // v13.94.6: the renderer resolves a scene part's
                                        // body through six aliases and this read three, so
                                        // a part carrying detail/body/narrative rendered on
                                        // screen and was skipped by the narrator entirely -
                                        // a silent panel in the middle of the scene. Chain
                                        // copied verbatim from renderHookScenario() /
                                        // renderAppliedScenario() in cc-card-slots.js.
                                        var pText = part.text || part.content || part.description ||
                                            part.detail || part.body || part.narrative || '';
                                        if (pText) _7parts.push(_fg(pText));
                                    });
                                    if (card.highlightText) _7parts.push(_fg(card.highlightText));
                                } else {
                                    var _hookFallback = card.content || card.bodyText || card.description || '';
                                    if (_hookFallback.trim()) _7parts.push(_fg(_hookFallback));
                                    if (card.highlightText) _7parts.push(_fg(card.highlightText));
                                }
                            } else if (card.cardType === 'concept-explainer') {
                                if (card.conceptInsights && card.conceptInsights.length) {
                                    card.conceptInsights.forEach(function (insight) {
                                        if (insight.title) _7parts.push(_fg(insight.title));
                                        var iText = insight.text || insight.content || insight.description || '';
                                        if (iText) _7parts.push(_fg(iText));
                                    });
                                }
                                if (!(card.conceptInsights && card.conceptInsights.length)) {
                                    var _ciFallback = card.content || card.bodyText || card.description || '';
                                    if (_ciFallback.trim()) _7parts.push(_fg(_ciFallback));
                                }
                                // v13.94.6: narrated after the insights because that is
                                // where the panel sits on screen - see
                                // _pushLegalLinkFields() for what was silent and why.
                                _pushLegalLinkFields(_7parts, card);
                            } else if (card.cardType === 'mental-model') {
                                if (card.steps && card.steps.length) {
                                    card.steps.forEach(function (s) {
                                        var _mmStep = s.step || s.action || s.title || '';
                                        if (_mmStep)  _7parts.push(_fg(_mmStep));
                                        // v13.94.6: renderMentalModel() resolves the step
                                        // body as detail||description||explanation; this
                                        // read s.detail alone, so a step whose body arrived
                                        // as description or explanation was displayed and
                                        // never spoken. generator.js normalises the three
                                        // into detail, but only on cards it generated -
                                        // hand-edited and imported cards keep the alias.
                                        var _mmDetail = s.detail || s.description || s.explanation || '';
                                        if (_mmDetail) _7parts.push(_fg(_mmDetail));
                                    });
                                }
                            } else if (card.cardType === 'mistakes') {
                                if (card.items && card.items.length) {
                                    card.items.forEach(function (item) {
                                        if (typeof item === 'string') { _7parts.push(_fg(item)); }
                                        else {
                                            // v13.94.6: renderMistakesCard() takes
                                            // mistake||error||pitfall; this took mistake
                                            // alone, so a mistakes card built from an
                                            // errorItems-shaped or pitfallItems-shaped list
                                            // rendered its rows and narrated only the
                                            // consequences - the "Result" halves, with no
                                            // mistake in front of them.
                                            var _msText = item.mistake || item.error || item.pitfall || '';
                                            if (_msText)          _7parts.push(_fg(_msText));
                                            if (item.consequence) _7parts.push(_fg(item.consequence));
                                        }
                                    });
                                }
                            } else if (card.cardType === 'competency-summary') {
                                // v13.94.6: _compGoodItems, not card.goodItems - the
                                // renderer's items[]/standardItems[] promotion is now
                                // mirrored here. See where it is computed above.
                                if (_compGoodItems.length) {
                                    // v13.94.3: spoken sub-heading, was English-only. Same
                                    // key as the rendered column header in cc-card-slots.js.
                                    _7parts.push(_lbl('whatGoodLooksLike', 'What Good Looks Like') + '.');
                                    _compGoodItems.forEach(function (gi) {
                                        // v13.94.6: the renderer reads text||behaviour||
                                        // criterion; reading text alone narrated an empty
                                        // string for every promoted legacy item that used
                                        // one of the other two names.
                                        if (typeof gi === 'string') { _7parts.push(_fg(gi)); return; }
                                        // v13.95.8: goodItems now carry a benefit, the
                                        // mirror of the consequence on badItems below.
                                        // Narrating text alone would have made narration
                                        // LESS symmetric than the page, not more.
                                        var _giLine = _fg(gi.text || gi.behaviour || gi.criterion || '');
                                        if (gi.benefit) { _giLine += '. ' + _fg(gi.benefit); }
                                        _7parts.push(_giLine);
                                    });
                                }
                                if (card.badItems && card.badItems.length) {
                                    // v13.94.3: spoken sub-heading, was English-only.
                                    _7parts.push(_lbl('whatToAvoid', 'What to Avoid') + '.');
                                    card.badItems.forEach(function (bi) {
                                        if (typeof bi === 'string') { _7parts.push(_fg(bi)); return; }
                                        // v13.94.6: the prompt asks for a 10+ word
                                        // consequence on every bad item, the normaliser
                                        // keeps it and renderCompetencySummary() prints it
                                        // under the item - but narration pushed bi.text and
                                        // dropped it, so the half that explains why the
                                        // mistake matters was generated, billed, displayed
                                        // and never spoken. Same shape as
                                        // patchMissingCardVoiceoverTexts() in player5.js.
                                        var _biLine = _fg(bi.text || '');
                                        if (bi.consequence) { _biLine += '. ' + _fg(bi.consequence); }
                                        _7parts.push(_biLine);
                                    });
                                }
                                // v12.22 FIX BUG-VO-COMPETENCY-FALLBACK: When goodItems and badItems
                                // are both absent (common in PD courses where voiceoverText is the
                                // primary narration source), use card.voiceoverText before the CTA.
                                // Previously "Now, complete..." was pushed unconditionally BEFORE the
                                // outer _7parts.length <= 1 check, making length = 2 and bypassing
                                // the voiceoverText fallback  -  card 6 produced only the heading + CTA
                                // (~3s audio) instead of full competency-summary narration, causing
                                // the voiceover to appear to stop at card 4-5 for PD/non-VET content.
                                if (_7parts.length <= 1 && card.voiceoverText && card.voiceoverText.trim()) {
                                    _7parts.push(_fg(card.voiceoverText));
                                }
                                // v13.94.6: second doubling site - the voiceoverText
                                // fallback directly above ends with the CTA by prompt
                                // contract, and this appended it again.
                                _pushActivityCta(_7parts);
                            }
                            if (_7parts.length <= 1 && card.cardType !== 'decision-point') {
                                var _7ultimateFallback = (card.voiceoverText && card.voiceoverText.trim())
                                    ? card.voiceoverText
                                    : (card.description || card.bodyText || card.content || '');
                                if (_7ultimateFallback && _7ultimateFallback.trim()) {
                                    _7parts = (_7headText ? [_7headText + '.'] : []).concat([_fg(_7ultimateFallback)]);
                                }
                            }
                        }
                        if (_7parts.length) parts.push(_7parts.join('. '));
                        return;
                    }
                    // Legacy card field extraction (non-7-card types)
                    var cardParts = [];
                    _pushLegacyCardFields(cardParts, card);
                    if (cardParts.length === 0 && card.voiceoverText && card.voiceoverText.trim()) {
                        cardParts.push(_fg(card.voiceoverText));
                    }
                    if (cardParts.length) {
                        parts.push(cardParts.join('. '));
                    }
                };
                // The body above is untouched and keeps its early returns; this wrapper
                // brackets each call so the range is recorded on every path.
                //
                // NOTE the index: it is the index into section.cards, NOT into _voCards,
                // which may have had card 0 sliced off when section.voiceoverText was
                // promoted. The player maps these onto rendered cards by that index.
                var _voOffset = section.cards.length - _voCards.length;
                // v13.94.6: the section-level fields are narrated BEFORE the card loop,
                // not after it. The brief for this change asked for "after", but the
                // renderer settles it: player5.js renders the Introduction card, the
                // description, the requirements grid, the contrast columns, the Key
                // Terms list and renderAccentCards() and ONLY THEN iterates
                // section.cards. Speaking them after the cards would put the audio out
                // of step with the page in the other direction. See
                // _pushSectionLevelFields() for what was silent.
                //
                // They are emitted INSIDE the first card's bracket rather than before
                // the loop, so their words land in a _ranges entry. Every word of the
                // narration has to belong to some segment or buildCardVoiceoverSegments'
                // proportional split drifts - the highlight would run ahead of the audio
                // by exactly the length of the accent cards. The first card is the
                // nearest thing on screen to where these render.
                var _voSectionFieldsDone = false;
                _voCards.forEach(function (card, _vi) {
                    var _cardStart = parts.length;
                    if (!_voSectionFieldsDone) {
                        _pushSectionLevelFields(parts, section);
                        _voSectionFieldsDone = true;
                    }
                    _voEmitCard(card);
                    if (_ranges) {
                        _ranges.push({
                            cardIndex: _vi + _voOffset,
                            text: parts.slice(_cardStart).join('. ')
                        });
                    }
                });
                // A one-card section whose only card was consumed by the promoted
                // section.voiceoverText leaves the loop with nothing to hang these on.
                if (!_voSectionFieldsDone) { _pushSectionLevelFields(parts, section); }
            } else {
                // Legacy section (no cards array)  -  simplified handling
                if (section.voiceoverText) {
                    parts.push(_fg(section.voiceoverText));
                } else {
                    if (section.description) {
                        var stripped = section.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                        parts.push(_fg(stripped));
                    }
                    if (section.requirements && section.requirements.length) {
                        section.requirements.forEach(function (r) {
                            var t = typeof r === 'string' ? r : (r.text || r.requirement || '');
                            if (t) parts.push(_fg(t));
                        });
                    }
                    var positiveItems = section.positiveList || section.doList || [];
                    var negativeItems = section.negativeList || section.dontList || [];
                    if (positiveItems.length || negativeItems.length) {
                        var cType = sectionContrastType(section);
                        var cLabels = _CONTRAST_LABELS[cType] || _CONTRAST_LABELS['dos-donts'];
                        // v13.94.3: route the spoken contrast headings through the label
                        // bundle - see _CONTRAST_LABEL_KEYS.
                        var cKeys = _CONTRAST_LABEL_KEYS[cType] || _CONTRAST_LABEL_KEYS['dos-donts'];
                        if (positiveItems.length) {
                            parts.push(_lbl(cKeys.positive, cLabels.positive) + '. ' + positiveItems.map(function (item) { return _fg(item); }).join('. '));
                        }
                        if (negativeItems.length) {
                            parts.push(_lbl(cKeys.negative, cLabels.negative) + '. ' + negativeItems.map(function (item) { return _fg(item); }).join('. '));
                        }
                    }
                    // v13.94.6: body moved to _pushSectionLevelFields() so the card-based
                    // path can call it too. Behaviour on THIS path is unchanged, including
                    // the fact that it stays inside the no-voiceoverText else.
                    _pushSectionLevelFields(parts, section);
                }
            }
        }

        var text = parts.join('. ');
        text = text.replace(/\.\. /g, '. ').replace(/\.\.$/g, '.');
        // v12.57 FIX-VO-SYMBOLS: Final pass  -  strip any residual markdown horizontal rules
        // that survived field extraction (e.g. came through card.voiceoverText verbatim).
        text = text.replace(/-{3,}/g, '').replace(/\*{3,}/g, '').replace(/#{1,6}\s*/g, '');
        text = text.replace(/\s{2,}/g, ' ');
        return text.trim();
    }

    // Shared helper  -  pushes all legacy/generic card display fields into parts[].
    // Used for both single-card (promoted cardType) and legacy multi-card sections.
    // skipTitle: when true, omit the title push (for single-card sections where the
    //   section title was already announced as the "X.Y: Title." prefix).
    //
    // v13.94.6: THE ORDER OF THE PUSHES BELOW IS THE ORDER THE CARD RENDERS IN.
    // It was not. bodyText/description were pushed second, ahead of every structured
    // list, while every legacy renderer in cc-card-slots.js emits bodyText LAST (or,
    // on case-study, immediately after context). The result on case-study-1 was that
    // the learner was asked three analysis questions about a case they had not yet
    // been told, heard the key insight and the critical reflection, and only then
    // heard the case itself - the audio ran the card backwards. The same inversion hit
    // concept-anchor, theoretical-framework, analytical-lens, ethics-considerations,
    // business-impact, action-framework, risk-card, policy-alignment, skill-anchor,
    // core-framework, application-guide, common-pitfalls, common-errors,
    // action-breakdown and competence-standard - i.e. the whole University route and
    // every legacy VET/Workplace/PD card type.
    //
    // The order below was read off the renderers one at a time, not assumed. Three
    // fields genuinely render AFTER bodyText somewhere: keyPoints (plain-english),
    // summaryLine (performance-anchor) and the case-study trio analysisPrompts /
    // keyInsight / criticalReflection - so those come after it here. analysisPrompts
    // is the one field whose position differs between two card types (before bodyText
    // on analytical-lens, after it on case-study), so it is placed by cardType rather
    // than by a single guess. consequence and optimisationTips follow PD-scenario's
    // order, where they precede bodyText; route-scenario prints bodyText one line
    // earlier, which is a beat of difference and not a reversal.
    function _pushLegacyCardFields(parts, obj, skipTitle) {
        var _isCaseStudy = (obj.cardType === 'case-study-1' || obj.cardType === 'case-study-2');
        if (obj.heading) parts.push(_fg(obj.heading));
        if (!skipTitle && !obj.heading && obj.title) parts.push(_fg(obj.title));
        // -- skill-anchor ---------------------------------------------------
        if (obj.skillStatement) parts.push(_fg(obj.skillStatement));
        if (obj.relevance) parts.push(_fg(obj.relevance));
        if (obj.keyIndicators && obj.keyIndicators.length) {
            parts.push(obj.keyIndicators.map(function (ind) {
                return _fg(typeof ind === 'string' ? ind : (ind.text || ''));
            }).join('. '));
        }
        // -- business-impact ------------------------------------------------
        if (obj.impactStatement) parts.push(_fg(obj.impactStatement));
        if (obj.keyMetrics && obj.keyMetrics.length) {
            parts.push(obj.keyMetrics.map(function (m) { return _fg(m); }).join('. '));
        }
        // v13.94.6: renderBusinessImpact() prints consequences[] as its own list under
        // the key metrics, and nothing narrated it - a generated, billed, displayed
        // list that was silent on every University business-impact card.
        if (obj.consequences && obj.consequences.length) {
            parts.push(obj.consequences.map(function (c) {
                return _fg(typeof c === 'string' ? c : (c.text || c.description || ''));
            }).join('. '));
        }
        // -- concept-anchor -------------------------------------------------
        if (obj.conceptDefinition) parts.push(_fg(obj.conceptDefinition));
        if (obj.significance) parts.push(_fg(obj.significance));
        if (obj.keyTerms && obj.keyTerms.length) {
            obj.keyTerms.forEach(function (t) {
                // v13.94.3: second ' means ' splice, same defect and same key as the
                // terminology loop in buildVoiceoverText().
                if (t.term && t.definition) {
                    parts.push(_lblf('termMeansDefinition', '{term} means {definition}',
                        {term: _fg(t.term), definition: _fg(t.definition)}));
                }
                else if (typeof t === 'string') parts.push(_fg(t));
            });
        }
        // -- analytical-lens / ethics-considerations -------------------------
        // v13.94.6: renderAnalyticalLens() renders cognitiveConsiderations OR
        // considerations - `section.cognitiveConsiderations || section.considerations`,
        // one list, never both. The narrator pushed BOTH unconditionally, so a card
        // carrying both fields (the generator writes considerations and some vendor
        // payloads also send cognitiveConsiderations) had one visible list read out
        // twice in a row. Mirror the renderer's `||`.
        var _considerations = (obj.cognitiveConsiderations && obj.cognitiveConsiderations.length)
            ? obj.cognitiveConsiderations
            : (obj.considerations || []);
        if (_considerations.length) {
            _considerations.forEach(function (c) {
                if (typeof c === 'string') { parts.push(_fg(c)); }
                else if (c.dimension && c.description) { parts.push(_fg(c.dimension) + '. ' + _fg(c.description)); }
                else { parts.push(_fg(c.text || c.description || '')); }
            });
        }
        if (!_isCaseStudy && obj.analysisPrompts && obj.analysisPrompts.length) {
            parts.push(obj.analysisPrompts.map(function (p) { return _fg(p); }).join('. '));
        }
        // -- performance-anchor ---------------------------------------------
        if (obj.pcStatement) parts.push(_fg(obj.pcStatement));
        if (obj.elementText) parts.push(_fg(obj.elementText));
        // -- scenario / case-study set-up ------------------------------------
        if (obj.context) parts.push(_fg(obj.context));
        if (obj.turningPoint) parts.push(_fg(obj.turningPoint));
        if (obj.consequence) parts.push(_fg(obj.consequence));
        if (obj.optimisationTips && obj.optimisationTips.length) {
            parts.push(obj.optimisationTips.map(function (t) { return _fg(t); }).join('. '));
        }
        if (obj.reflection) {
            var _ref = obj.reflection;
            if (typeof _ref === 'string') { parts.push(_fg(_ref)); }
            else if (_ref.question) {
                parts.push(_fg(_ref.question));
                if (_ref.sampleAnswers && Array.isArray(_ref.sampleAnswers) && _ref.sampleAnswers.length) {
                    parts.push(_ref.sampleAnswers.map(function (a) { return _fg(a); }).join('. '));
                }
            }
        }
        // -- core-framework --------------------------------------------------
        if (obj.keyPrinciple) parts.push(_fg(obj.keyPrinciple));
        // -- structured lists, all of which render ABOVE bodyText -------------
        if (obj.standardItems && obj.standardItems.length) {
            parts.push(obj.standardItems.map(function (s) { return _fg(typeof s === 'string' ? s : (s.text || '')); }).join('. '));
        }
        if (obj.actions && obj.actions.length) {
            obj.actions.forEach(function (a) {
                if (a.heading) parts.push(_fg(a.heading));
                if (a.bullets && a.bullets.length) parts.push(a.bullets.map(function (b) { return _fg(b); }).join('. '));
            });
        }
        if (obj.steps && obj.steps.length) {
            obj.steps.forEach(function (s) {
                if (typeof s === 'string') { parts.push(_fg(s)); }
                else {
                    var _legStep = s.step || s.action || '';
                    if (_legStep) parts.push(_fg(_legStep));
                    if (s.detail) parts.push(_fg(s.detail));
                    if (s.timeframe) parts.push(_fg(s.timeframe));
                }
            });
        }
        if (obj.errorItems && obj.errorItems.length) {
            obj.errorItems.forEach(function (e) {
                if (e.error) parts.push(_fg(e.error));
                if (e.consequence) parts.push(_fg(e.consequence));
            });
        }
        if (obj.risks && obj.risks.length) {
            obj.risks.forEach(function (r) {
                if (r.risk || r.text) parts.push(_fg(r.risk || r.text));
                if (r.likelihood) parts.push(_fg(r.likelihood));
                if (r.impact) parts.push(_fg(r.impact));
                if (r.mitigation) parts.push(_fg(r.mitigation));
                if (r.consequence) parts.push(_fg(r.consequence));
            });
        }
        var _voPolItems = obj.policyItems || obj.policies || [];
        if (_voPolItems.length) {
            _voPolItems.forEach(function (p) {
                if (typeof p === 'string') { parts.push(_fg(p)); }
                else {
                    if (p.policy) parts.push(_fg(p.policy + (p.requirement ? ': ' + p.requirement : '')));
                    if (p.consequence) parts.push(_fg(p.consequence));
                }
            });
        }
        if (obj.frameworks && obj.frameworks.length) {
            obj.frameworks.forEach(function (fw) {
                if (fw.name) parts.push(_fg(fw.name));
                if (fw.originator) parts.push(_fg(fw.originator));
                if (fw.principle) parts.push(_fg(fw.principle));
                else if (fw.description) parts.push(_fg(fw.description));
                // v13.94.6: renderTheoreticalFramework() has printed fw.application
                // under an "In practice" label since v9.88, and narration never read
                // it. It is the sentence that connects the theory to the learner's
                // work - the single most useful line on the card - and it was silent
                // on every University theoretical-framework card.
                if (fw.application) {
                    parts.push(_lbl('application', 'Application') + '. ' + _fg(fw.application));
                }
                if (fw.limitation) parts.push(_fg(fw.limitation));
            });
        }
        if (obj.frameworkSteps && obj.frameworkSteps.length) {
            obj.frameworkSteps.forEach(function (s) {
                if (s.step) parts.push(_fg(s.step));
                if (s.explanation) parts.push(_fg(s.explanation));
                if (s.example) parts.push(_fg(s.example));
            });
        }
        if (obj.applications && obj.applications.length) {
            obj.applications.forEach(function (a) {
                if (a.situation) parts.push(_fg(a.situation));
                if (a.action) parts.push(_fg(a.action));
                if (a.rationale) parts.push(_fg(a.rationale));
            });
        }
        if (obj.pitfallItems && obj.pitfallItems.length) {
            obj.pitfallItems.forEach(function (p) {
                if (p.pitfall) parts.push(_fg(p.pitfall));
                if (p.consequence) parts.push(_fg(p.consequence));
                if (p.correction) parts.push(_fg(p.correction));
            });
        }
        // -- the body prose, which every legacy renderer prints here ----------
        if (obj.bodyText) parts.push(_fg(obj.bodyText));
        if (!obj.bodyText && obj.description) parts.push(_fg(obj.description));
        // -- the few fields that really do render after the body -------------
        if (obj.keyPoints && obj.keyPoints.length) {
            parts.push(obj.keyPoints.map(function (p) { return _fg(typeof p === 'string' ? p : (p.text || '')); }).join('. '));
        }
        if (_isCaseStudy && obj.analysisPrompts && obj.analysisPrompts.length) {
            parts.push(obj.analysisPrompts.map(function (p) { return _fg(p); }).join('. '));
        }
        if (obj.keyInsight) parts.push(_fg(obj.keyInsight));
        if (obj.criticalReflection) parts.push(_fg(obj.criticalReflection));
        if (obj.summaryLine) parts.push(_fg(obj.summaryLine));
    }

    /**
     * Build the URL of the plugin's AJAX endpoint.
     *
     * @return {String} Absolute URL of ajax.php.
     */
    function ajaxUrl() {
        return M.cfg.wwwroot + '/mod/contentcreator/ajax.php';
    }

    /**
     * v13.93.2 FIX-CC-VENDOR-NO-TIMEOUT: fetch with a deadline.
     *
     * vendorFetch, vendorUpload and vendorDownload are the shared transport for every
     * server call that is not generation or TTS - the TGA unit fetch, topic suggestion,
     * document extraction, the Excel mapping export, the community gallery. None of them
     * had an AbortController.
     *
     * A browser applies no default timeout to fetch. If the upstream never answers, the
     * promise never settles: no then, no catch, no finally. Every one of these callers
     * disables a button and shows a spinner before awaiting, so an unanswered request
     * leaves that UI disabled permanently, with no error and no way back but a page
     * reload. This is the mechanism behind the builder sitting on "Preparing... 0%" for
     * 23 minutes with two POSTs in flight that never returned.
     *
     * 210s is deliberately looser than the 180s ajax.php allows the vendor
     * (CURLOPT_TIMEOUT), so the browser never abandons work the server is still doing.
     *
     * @param {Object} init Fetch init, merged with the abort signal.
     * @param {String} label Named in the timeout error so the caller's message is useful.
     * @param {Number} [ms] Deadline in milliseconds, default 210000.
     * @return {Promise<Response>} The response, or a rejection naming the timeout.
     */
    function fetchWithDeadline(url, init, label, ms) {
        var limit = ms || 210000;
        label = label || 'The request';
        var ctrl = new AbortController();
        var timer = setTimeout(function () { ctrl.abort(); }, limit);
        init = init || {};
        // A caller that already manages its own AbortController keeps it - overwriting
        // the signal would silently disarm their abort (the player's voiceover path has
        // its own deadline, for one). Their timer is the deadline in that case.
        if (init.signal) {
            clearTimeout(timer);
            return fetch(url, init);
        }
        init.signal = ctrl.signal;
        return fetch(url, init)
            .then(function (response) {
                clearTimeout(timer);
                return response;
            })
            .catch(function (err) {
                clearTimeout(timer);
                if (err && err.name === 'AbortError') {
                    throw new Error(label + ' timed out after '
                        + Math.round(limit / 1000) + 's with no response from the server');
                }
                throw err;
            });
    }

    /**
     * Call the vendor API through the Moodle server-side proxy.
     *
     * The site's API credentials never reach the browser. The client names an
     * allowlisted endpoint key and the server injects the credentials and the
     * real URL. See the endpoint allowlist in ajax.php.
     *
     * @param {Number} cmid Course module id.
     * @param {String} endpoint Allowlisted endpoint key, e.g. 'suggesttopics'.
     * @param {Object} [options] Optional settings.
     * @param {Object} [options.payload] Request body, JSON encoded by this helper.
     * @param {String} [options.unitcode] Unit code substituted into {unit} paths.
     * @return {Promise} Resolves with the vendor's decoded JSON payload.
     */
    function vendorFetch(cmid, endpoint, options) {
        var opts = options || {};
        var body = new FormData();
        body.append('sesskey', M.cfg.sesskey);
        body.append('action', 'vendor_proxy');
        body.append('cmid', cmid);
        body.append('endpoint', endpoint);
        if (opts.unitcode) {
            body.append('unitcode', opts.unitcode);
        }
        if (opts.payload) {
            body.append('payload', JSON.stringify(opts.payload));
        }
        return fetchWithDeadline(ajaxUrl(),
            {method: 'POST', body: body, credentials: 'same-origin'}, 'The request to ' + endpoint)
            .then(function (response) {
                return response.json();
            })
            .then(function (data) {
                if (!data || data.success !== true) {
                    throw new Error((data && data.error) || 'Request failed');
                }
                return data.data;
            });
    }

    /**
     * Upload a file to the vendor through the server-side proxy.
     *
     * @param {Number} cmid Course module id.
     * @param {String} endpoint Allowlisted endpoint key.
     * @param {File} file The file to upload. PDF only, 20 MB maximum.
     * @param {Object} [options] Optional settings.
     * @param {String} [options.unitcode] Unit code substituted into {unit} paths.
     * @return {Promise} Resolves with the vendor's decoded JSON payload.
     */
    function vendorUpload(cmid, endpoint, file, options) {
        var opts = options || {};
        var body = new FormData();
        body.append('sesskey', M.cfg.sesskey);
        body.append('action', 'vendor_upload');
        body.append('cmid', cmid);
        body.append('endpoint', endpoint);
        if (opts.unitcode) {
            body.append('unitcode', opts.unitcode);
        }
        body.append('file', file);
        return fetchWithDeadline(ajaxUrl(),
            {method: 'POST', body: body, credentials: 'same-origin'}, 'The upload to ' + endpoint)
            .then(function (response) {
                return response.json();
            })
            .then(function (data) {
                if (!data || data.success !== true) {
                    throw new Error((data && data.error) || 'Upload failed');
                }
                return data.data;
            });
    }

    /**
     * Fetch a binary vendor response through the server-side proxy.
     *
     * @param {Number} cmid Course module id.
     * @param {String} endpoint Allowlisted endpoint key.
     * @param {Object} [options] Optional settings.
     * @param {Object} [options.payload] Request body, JSON encoded by this helper.
     * @return {Promise} Resolves with the response Blob.
     */
    function vendorDownload(cmid, endpoint, options) {
        var opts = options || {};
        var body = new FormData();
        body.append('sesskey', M.cfg.sesskey);
        body.append('action', 'vendor_download');
        body.append('cmid', cmid);
        body.append('endpoint', endpoint);
        if (opts.payload) {
            body.append('payload', JSON.stringify(opts.payload));
        }
        return fetchWithDeadline(ajaxUrl(),
            {method: 'POST', body: body, credentials: 'same-origin'}, 'The download from ' + endpoint)
            .then(function (response) {
                var type = response.headers.get('Content-Type') || '';
                if (type.indexOf('application/json') !== -1) {
                    return response.json().then(function (data) {
                        throw new Error((data && data.error) || 'Download failed');
                    });
                }
                return response.blob();
            });
    }

    /**
     * Mint a billing key for one subtopic.
     *
     * FIX-CC-SUBTOPIC-BILLING-KEY (v13.95.2): the vendor prices a SUBTOPIC at a flat rate that
     * covers its content, its first voiceover per section and its first image per slide, with
     * regeneration charged separately. The server cannot work any of that out from the HTTP
     * calls alone: one subtopic is one /prompt call PLUS a structural repair call when the
     * first response comes back malformed, PLUS an unpredictable number of /tts and image
     * calls. Every one of those carries this key, so the server can charge the subtopic once
     * and recognise every later asset as belonging to something already paid for.
     *
     * Deliberately NOT derived from the subtopic id: planner.js emits ids like
     * 'subtopic_0_0', which repeat across every module ever built. A collision here would
     * hand a customer a free subtopic, so the key must be unique per build.
     *
     * Kept to [a-z0-9_] so it survives PARAM_ALPHANUMEXT on the way through ajax.php.
     *
     * @return {string} A key unique to one subtopic in one build.
     */
    function newBillingKey() {
        var rand = '';
        // crypto.randomUUID is not available on every browser Moodle supports, and the
        // hyphens it produces would not survive PARAM_ALPHANUMEXT anyway.
        for (var i = 0; i < 4; i++) {
            rand += Math.random().toString(36).slice(2, 10);
        }
        return 'cck_' + Date.now().toString(36) + '_' + rand.slice(0, 24);
    }

    return {
        CC_VERSION: CC_VERSION,
        createLogger: createLogger,
        newBillingKey: newBillingKey,
        fetchWithDeadline: fetchWithDeadline,
        VOICEOVER_SCHEMA_VERSION: VOICEOVER_SCHEMA_VERSION,
        voiceoverTextHash: voiceoverTextHash,
        buildVoiceoverText: buildVoiceoverText,
        // v13.92: Topics-and-Text prose helpers, shared with player5.js so the reveal
        // animation and the narration are built from one source.
        PROSE_CARD_TYPES: PROSE_CARD_TYPES,
        PROSE_HEADINGS: PROSE_HEADINGS,
        sectionContrastType: sectionContrastType,
        CONTRAST_PAIR_KEYS: CONTRAST_PAIR_KEYS,
        proseHeadingFor: proseHeadingFor,
        // v13.94.3: setLabelResolver is the real name now that the resolver feeds every
        // narration label, not just prose headings. setProseHeadingResolver is kept as an
        // alias so player5.js's existing init call keeps working unchanged.
        setLabelResolver: setLabelResolver,
        setProseHeadingResolver: setProseHeadingResolver,
        proseParagraphs: proseParagraphs,
        isProseSection: isProseSection,
        buildProseVoiceoverSegments: buildProseVoiceoverSegments,
        buildCardVoiceoverSegments: buildCardVoiceoverSegments,
        ajaxUrl: ajaxUrl,
        vendorFetch: vendorFetch,
        vendorUpload: vendorUpload,
        vendorDownload: vendorDownload
    };
});
