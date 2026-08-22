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
define([], function() {
    'use strict';

    /** Current plugin version  -  single source of truth for builder.js and player5.js. */
    var CC_VERSION = '13.71';

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
    var VOICEOVER_SCHEMA_VERSION = '12.32';

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
            ? function() {
                console.log.apply(console, [prefix].concat(Array.prototype.slice.call(arguments)));
            }
            : function() {};
        var warn = function() {
            console.warn.apply(console, [prefix].concat(Array.prototype.slice.call(arguments)));
        };
        var error = function() {
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
        s = s.replace(/\bso you\s+(?:optimal|proper|adequate|sufficient|full|complete|clear|immediate|minimal|consistent|accurate|appropriate|correct|comfortable|effective|efficient|maximum|minimum|good|better|best|safe|total|reliable|thorough|reasonable|necessary|successful|secure|healthy|stable|strong|smooth|timely|rapid|quick|clean|standard|suitable|regular|balanced|controlled|steady|uniform)\b/gi, function(match) {
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

    /**
     * Build the canonical voiceover text for a section.
     * v11.02: Extracted from player5.js buildFullVoiceoverText so builder.js
     * can produce byte-identical text during pre-generation.
     *
     * @param {Object} section  The section object (with optional .cards[])
     * @param {Object} manifest The full manifest (used for slide-number prefix)
     * @returns {string} The complete voiceover text ready for TTS synthesis
     */
    function buildVoiceoverText(section, manifest) {
        var parts = [];

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
                if (!_voIs7CardSection && section.voiceoverText && section.voiceoverText.trim()) {
                    parts.push(_fg(section.voiceoverText));
                    _voCards = section.cards.slice(1);
                }
                _voCards.forEach(function(card) {
                    if (!card) return;
                    var _7CARD_TYPES = ['hook-scenario','concept-explainer','mental-model',
                        'applied-scenario','mistakes','competency-summary','decision-point'];
                    if (_7CARD_TYPES.indexOf(card.cardType) >= 0) {
                        // -- 7-CARD TYPE HANDLING --------------------------
                        var _7CARD_HEADINGS = {
                            'hook-scenario':     'Scene Setting',
                            'concept-explainer': 'What This Means',
                            'mental-model':      'How to Handle It',
                            'applied-scenario':  'On the Job',
                            'mistakes':          'Watch Out For',
                            'competency-summary':'You Are Ready When You Can',
                            'decision-point':    'Your Decision'
                        };
                        var _7parts = [];
                        var _7headLabel = _7CARD_HEADINGS[card.cardType] || '';
                        var _7headText = '';
                        if (_7headLabel) {
                            // v12.28 FIX-CC-VO-HEADINGS: Use card.heading when present
                            // (7-card VET content stores the teacher-authored per-card
                            // heading in card.heading, not card.title). Previously only
                            // card.title was checked so cards whose heading was stored in
                            // card.heading produced no voiced heading text.
                            var _cardHeading = card.heading || card.title || '';
                            var _titleNorm = _cardHeading.replace(/[^a-zA-Z]/g, '').toLowerCase();
                            var _headNorm  = _7headLabel.replace(/[^a-zA-Z]/g, '').toLowerCase();
                            var _titleIsDupe = _titleNorm === _headNorm
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
                        var _skipForCompetency = (card.cardType === 'competency-summary' &&
                            ((card.goodItems && card.goodItems.length) ||
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
                            if (card.cardType === 'competency-summary') {
                                _7parts.push('Now, complete the activity below.');
                            }
                            if (_7parts.length) parts.push(_7parts.join('. '));
                            return;
                        }
                        if (card.cardType === 'decision-point') {
                            _7parts = [];
                        } else {
                            if (card.cardType === 'hook-scenario' || card.cardType === 'applied-scenario') {
                                if (card.sceneParts && card.sceneParts.length) {
                                    card.sceneParts.forEach(function(part) {
                                        if (part.title) _7parts.push(_fg(part.title));
                                        var pText = part.text || part.content || part.description || '';
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
                                    card.conceptInsights.forEach(function(insight) {
                                        if (insight.title) _7parts.push(_fg(insight.title));
                                        var iText = insight.text || insight.content || insight.description || '';
                                        if (iText) _7parts.push(_fg(iText));
                                    });
                                }
                                if (!(card.conceptInsights && card.conceptInsights.length)) {
                                    var _ciFallback = card.content || card.bodyText || card.description || '';
                                    if (_ciFallback.trim()) _7parts.push(_fg(_ciFallback));
                                }
                            } else if (card.cardType === 'mental-model') {
                                if (card.steps && card.steps.length) {
                                    card.steps.forEach(function(s) {
                                        var _mmStep = s.step || s.action || s.title || '';
                                        if (_mmStep)  _7parts.push(_fg(_mmStep));
                                        if (s.detail) _7parts.push(_fg(s.detail));
                                    });
                                }
                            } else if (card.cardType === 'mistakes') {
                                if (card.items && card.items.length) {
                                    card.items.forEach(function(item) {
                                        if (typeof item === 'string') { _7parts.push(_fg(item)); }
                                        else {
                                            if (item.mistake)     _7parts.push(_fg(item.mistake));
                                            if (item.consequence) _7parts.push(_fg(item.consequence));
                                        }
                                    });
                                }
                            } else if (card.cardType === 'competency-summary') {
                                if (card.goodItems && card.goodItems.length) {
                                    _7parts.push('What good looks like.');
                                    card.goodItems.forEach(function(gi) {
                                        _7parts.push(_fg(typeof gi === 'string' ? gi : (gi.text || '')));
                                    });
                                }
                                if (card.badItems && card.badItems.length) {
                                    _7parts.push('What to avoid.');
                                    card.badItems.forEach(function(bi) {
                                        _7parts.push(_fg(typeof bi === 'string' ? bi : (bi.text || '')));
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
                                _7parts.push('Now, complete the activity below.');
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
                });
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
                        section.requirements.forEach(function(r) {
                            var t = typeof r === 'string' ? r : (r.text || r.requirement || '');
                            if (t) parts.push(_fg(t));
                        });
                    }
                    var positiveItems = section.positiveList || section.doList || [];
                    var negativeItems = section.negativeList || section.dontList || [];
                    if (positiveItems.length || negativeItems.length) {
                        var cType = section.contrastType || 'dos-donts';
                        var cLabels = _CONTRAST_LABELS[cType] || _CONTRAST_LABELS['dos-donts'];
                        if (positiveItems.length) {
                            parts.push(cLabels.positive + '. ' + positiveItems.map(function(item) { return _fg(item); }).join('. '));
                        }
                        if (negativeItems.length) {
                            parts.push(cLabels.negative + '. ' + negativeItems.map(function(item) { return _fg(item); }).join('. '));
                        }
                    }
                    var terms = section.terminology || [];
                    if (terms.length) {
                        var voTermParts = [];
                        terms.forEach(function(term) {
                            var name = (term.term || '').trim();
                            var def = (term.definition || '').trim();
                            if (name && def) voTermParts.push(name + ' means ' + def);
                        });
                        if (voTermParts.length) parts.push('Key Terms. ' + voTermParts.join('. '));
                    }
                    if (section.keyTakeaway) parts.push('Key Takeaway. ' + _fg(section.keyTakeaway));
                    if (section.proTip) parts.push('Pro Tip. ' + _fg(section.proTip));
                    if (section.keyInfo || section.didYouKnow) parts.push('Key Info. ' + _fg(section.keyInfo || section.didYouKnow));
                    if (section.expertInsight) parts.push('Expert Insight. ' + _fg(section.expertInsight));
                    if (section.scenario) {
                        var scenario = section.scenario;
                        var scenTitle = scenario.title || scenario.scenarioTitle;
                        if (scenTitle) parts.push(_fg(scenTitle));
                        else parts.push('Workplace Scenario');
                        if (scenario.role) {
                            var roleText = _fg(scenario.role);
                            if (!roleText.toLowerCase().startsWith('you are')) roleText = 'You are ' + roleText;
                            parts.push(roleText);
                        }
                        if (scenario.context) parts.push(_fg(scenario.context));
                        if (scenario.complication) parts.push(_fg(scenario.complication));
                    }
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
    function _pushLegacyCardFields(parts, obj, skipTitle) {
        if (obj.heading) parts.push(_fg(obj.heading));
        if (!skipTitle && !obj.heading && obj.title) parts.push(_fg(obj.title));
        if (obj.skillStatement) parts.push(_fg(obj.skillStatement));
        if (obj.relevance) parts.push(_fg(obj.relevance));
        if (obj.keyIndicators && obj.keyIndicators.length) {
            parts.push(obj.keyIndicators.map(function(ind) {
                return _fg(typeof ind === 'string' ? ind : (ind.text || ''));
            }).join('. '));
        }
        if (obj.impactStatement) parts.push(_fg(obj.impactStatement));
        if (obj.keyMetrics && obj.keyMetrics.length) {
            parts.push(obj.keyMetrics.map(function(m) { return _fg(m); }).join('. '));
        }
        if (obj.conceptDefinition) parts.push(_fg(obj.conceptDefinition));
        if (obj.significance) parts.push(_fg(obj.significance));
        if (obj.keyTerms && obj.keyTerms.length) {
            obj.keyTerms.forEach(function(t) {
                if (t.term && t.definition) parts.push(_fg(t.term) + ' means ' + _fg(t.definition));
                else if (typeof t === 'string') parts.push(_fg(t));
            });
        }
        if (obj.cognitiveConsiderations && obj.cognitiveConsiderations.length) {
            parts.push(obj.cognitiveConsiderations.map(function(c) {
                return _fg(typeof c === 'string' ? c : (c.text || c.description || ''));
            }).join('. '));
        }
        if (obj.analysisPrompts && obj.analysisPrompts.length) {
            parts.push(obj.analysisPrompts.map(function(p) { return _fg(p); }).join('. '));
        }
        if (obj.considerations && obj.considerations.length) {
            obj.considerations.forEach(function(c) {
                if (typeof c === 'string') { parts.push(_fg(c)); }
                else if (c.dimension && c.description) { parts.push(_fg(c.dimension) + '. ' + _fg(c.description)); }
                else { parts.push(_fg(c.text || c.description || '')); }
            });
        }
        if (obj.keyInsight) parts.push(_fg(obj.keyInsight));
        if (obj.criticalReflection) parts.push(_fg(obj.criticalReflection));
        if (obj.bodyText) parts.push(_fg(obj.bodyText));
        if (!obj.bodyText && obj.description) parts.push(_fg(obj.description));
        if (obj.keyPoints && obj.keyPoints.length) {
            parts.push(obj.keyPoints.map(function(p) { return _fg(typeof p === 'string' ? p : (p.text || '')); }).join('. '));
        }
        if (obj.pcStatement) parts.push(_fg(obj.pcStatement));
        if (obj.elementText) parts.push(_fg(obj.elementText));
        if (obj.context) parts.push(_fg(obj.context));
        if (obj.turningPoint) parts.push(_fg(obj.turningPoint));
        if (obj.consequence) parts.push(_fg(obj.consequence));
        if (obj.optimisationTips && obj.optimisationTips.length) {
            parts.push(obj.optimisationTips.map(function(t) { return _fg(t); }).join('. '));
        }
        if (obj.reflection) {
            var _ref = obj.reflection;
            if (typeof _ref === 'string') { parts.push(_fg(_ref)); }
            else if (_ref.question) {
                parts.push(_fg(_ref.question));
                if (_ref.sampleAnswers && Array.isArray(_ref.sampleAnswers) && _ref.sampleAnswers.length) {
                    parts.push(_ref.sampleAnswers.map(function(a) { return _fg(a); }).join('. '));
                }
            }
        }
        if (obj.keyPrinciple) parts.push(_fg(obj.keyPrinciple));
        if (obj.summaryLine) parts.push(_fg(obj.summaryLine));
        if (obj.standardItems && obj.standardItems.length) {
            parts.push(obj.standardItems.map(function(s) { return _fg(typeof s === 'string' ? s : (s.text || '')); }).join('. '));
        }
        if (obj.actions && obj.actions.length) {
            obj.actions.forEach(function(a) {
                if (a.heading) parts.push(_fg(a.heading));
                if (a.bullets && a.bullets.length) parts.push(a.bullets.map(function(b) { return _fg(b); }).join('. '));
            });
        }
        if (obj.steps && obj.steps.length) {
            obj.steps.forEach(function(s) {
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
            obj.errorItems.forEach(function(e) {
                if (e.error) parts.push(_fg(e.error));
                if (e.consequence) parts.push(_fg(e.consequence));
            });
        }
        if (obj.risks && obj.risks.length) {
            obj.risks.forEach(function(r) {
                if (r.risk || r.text) parts.push(_fg(r.risk || r.text));
                if (r.likelihood) parts.push(_fg(r.likelihood));
                if (r.impact) parts.push(_fg(r.impact));
                if (r.mitigation) parts.push(_fg(r.mitigation));
                if (r.consequence) parts.push(_fg(r.consequence));
            });
        }
        var _voPolItems = obj.policyItems || obj.policies || [];
        if (_voPolItems.length) {
            _voPolItems.forEach(function(p) {
                if (typeof p === 'string') { parts.push(_fg(p)); }
                else {
                    if (p.policy) parts.push(_fg(p.policy + (p.requirement ? ': ' + p.requirement : '')));
                    if (p.consequence) parts.push(_fg(p.consequence));
                }
            });
        }
        if (obj.frameworks && obj.frameworks.length) {
            obj.frameworks.forEach(function(fw) {
                if (fw.name) parts.push(_fg(fw.name));
                if (fw.originator) parts.push(_fg(fw.originator));
                if (fw.principle) parts.push(_fg(fw.principle));
                else if (fw.description) parts.push(_fg(fw.description));
                if (fw.limitation) parts.push(_fg(fw.limitation));
            });
        }
        if (obj.frameworkSteps && obj.frameworkSteps.length) {
            obj.frameworkSteps.forEach(function(s) {
                if (s.step) parts.push(_fg(s.step));
                if (s.explanation) parts.push(_fg(s.explanation));
                if (s.example) parts.push(_fg(s.example));
            });
        }
        if (obj.applications && obj.applications.length) {
            obj.applications.forEach(function(a) {
                if (a.situation) parts.push(_fg(a.situation));
                if (a.action) parts.push(_fg(a.action));
                if (a.rationale) parts.push(_fg(a.rationale));
            });
        }
        if (obj.pitfallItems && obj.pitfallItems.length) {
            obj.pitfallItems.forEach(function(p) {
                if (p.pitfall) parts.push(_fg(p.pitfall));
                if (p.consequence) parts.push(_fg(p.consequence));
                if (p.correction) parts.push(_fg(p.correction));
            });
        }
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
        return fetch(ajaxUrl(), {method: 'POST', body: body, credentials: 'same-origin'})
            .then(function(response) {
                return response.json();
            })
            .then(function(data) {
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
        return fetch(ajaxUrl(), {method: 'POST', body: body, credentials: 'same-origin'})
            .then(function(response) {
                return response.json();
            })
            .then(function(data) {
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
        return fetch(ajaxUrl(), {method: 'POST', body: body, credentials: 'same-origin'})
            .then(function(response) {
                var type = response.headers.get('Content-Type') || '';
                if (type.indexOf('application/json') !== -1) {
                    return response.json().then(function(data) {
                        throw new Error((data && data.error) || 'Download failed');
                    });
                }
                return response.blob();
            });
    }

    return {
        CC_VERSION: CC_VERSION,
        createLogger: createLogger,
        VOICEOVER_SCHEMA_VERSION: VOICEOVER_SCHEMA_VERSION,
        voiceoverTextHash: voiceoverTextHash,
        buildVoiceoverText: buildVoiceoverText,
        ajaxUrl: ajaxUrl,
        vendorFetch: vendorFetch,
        vendorUpload: vendorUpload,
        vendorDownload: vendorDownload
    };
});
