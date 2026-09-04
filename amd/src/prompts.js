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
 * Content Creator v9.50 - callAI() transient retry + PD repair prompt field specs
 * VET: 7-card sequence (performance-anchor  ->  plain-english  ->  action-breakdown  ->  competence-standard  ->  scenario-1  ->  scenario-2  ->  common-errors)
 * University: 7-card sequence (concept-anchor  ->  theoretical-framework  ->  analytical-lens  ->  ethics-considerations  ->  case-study-1  ->  case-study-2  ->  decision-point)
 * Workplace: 6-card sequence (business-impact  ->  action-framework  ->  risk-card  ->  policy-alignment  ->  scenario-1  ->  scenario-2)
 * PD: 6-card sequence (skill-anchor  ->  core-framework  ->  application-guide  ->  common-pitfalls  ->  scenario-1  ->  scenario-2)
 * v9.23: PD route normalizer fix, instructions updated to reference all 4 modes
 * v9.22: PD / Short Courses route added
 * v9.21: VET/Workplace ChatGPT section reveal logic, paste validation, extra docs gating  -  all 4 modes now follow identical flow
 *
 * @module     mod_contentcreator/prompts
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
define(['mod_contentcreator/legislation', 'mod_contentcreator/cc-state', 'mod_contentcreator/card-quality'], function (Legislation, CcState, CardQuality) {
    /**
     * v13.77 FIX-OBJECT-TEXT: entries in the card content arrays arrive as EITHER
     * plain strings or objects, depending on what the vendor API returns for that
     * field on that run. Joining or concatenating them straight into text emitted
     * "[object Object]" whenever an object turned up. These two helpers flatten
     * either shape to readable text so every text-assembly path is shape-safe.
     *
     * @param {*} entry A string, or an object such as {title, text} / {error, consequence}.
     * @return {String} Readable text for the entry, or an empty string.
     */
    var ccEntryText = function (entry) {
        if (entry === null || entry === undefined) { return ''; }
        if (typeof entry === 'string') { return entry; }
        if (typeof entry !== 'object') { return String(entry); }
        var head = entry.title || entry.step || entry.term || entry.name ||
                   entry.dimension || entry.heading || entry.mistake ||
                   entry.error || entry.pitfall || '';
        var body = entry.text || entry.detail || entry.definition || entry.description ||
                   entry.consequence || entry.principle || entry.content ||
                   entry.prompt || entry.item || entry.behaviour || '';
        if (head && body && head !== body) { return head + ': ' + body; }
        return head || body || '';
    };

    /**
     * Flatten an array of string-or-object entries to an array of non-empty strings.
     *
     * @param {Array} arr The array to flatten; anything non-array yields [].
     * @return {Array} Array of readable strings.
     */
    var ccTextList = function (arr) {
        if (!Array.isArray(arr)) { return []; }
        return arr.map(ccEntryText).filter(function (s) { return s; });
    };

    'use strict';

    // Gated diagnostics  -  silent in production, enabled from cc-state.js.
    var _log = CcState.createLogger(false);
    var ccWarn = _log.warn;

    // ===========================================================================
    // REGIONAL SPELLING SYSTEM (v6.4.0)
    // Maps country codes to spelling conventions for AI-generated content
    // ===========================================================================

    const BRITISH_SPELLING_COUNTRIES = [
        'AU', 'NZ', 'GB', 'UK', 'IE', 'ZA', 'IN', 'PK', 'SG', 'MY', 'HK',
        'AE', 'EG', 'KE', 'NG', 'GH', 'JM', 'TT', 'BB', 'MT', 'CY'
    ];

    const AMERICAN_SPELLING_COUNTRIES = [
        'US', 'CA', 'PH', 'PR', 'VI', 'GU', 'AS', 'MX', 'JP', 'KR', 'TW'
    ];

    /**
     * Get spelling instruction block based on country code (v6.4.0)
     * @param {string} countryCode - ISO 3166-1 alpha-2 country code
     * @returns {string} Spelling instruction block for AI prompt
     */
    const getSpellingInstructions = (countryCode) => {
        const code = (countryCode || 'AU').toUpperCase();
        
        if (BRITISH_SPELLING_COUNTRIES.includes(code)) {
            return `
MANDATORY SPELLING (${code === 'AU' ? 'Australian' : code === 'GB' || code === 'UK' ? 'British' : 'Commonwealth'} English):
- Use "-ise" not "-ize": organise, recognise, authorise, prioritise, finalise, minimise, standardise
- Use "-our" not "-or": colour, behaviour, favour, honour, labour, neighbour
- Use "-re" not "-er": centre, metre, fibre, litre, theatre
- Use "-ce" not "-se": licence (noun), defence, offence, practise (verb)
- Use "-ogue" not "-og": catalogue, dialogue, analogue
- Use "-ment" after "e": judgement, acknowledgement, abridgement
- Double consonants: travelling, cancelling, labelling, modelling
- Other: programme (not program), tyre (not tire), kerb (not curb), grey (not gray)
- CRITICAL: Never use American spellings. This is non-negotiable.`;
        } else if (AMERICAN_SPELLING_COUNTRIES.includes(code)) {
            return `
MANDATORY SPELLING (American English):
- Use "-ize" not "-ise": organize, recognize, authorize, prioritize, finalize, minimize, standardize
- Use "-or" not "-our": color, behavior, favor, honor, labor, neighbor
- Use "-er" not "-re": center, meter, fiber, liter, theater
- Use "-se" not "-ce": license (noun), defense, offense, practice (verb)
- Use "-og" not "-ogue": catalog, dialog, analog
- Single consonants: traveling, canceling, labeling, modeling
- Other: program (not programme), tire (not tyre), curb (not kerb), gray (not grey)
- CRITICAL: Never use British/Australian spellings. This is non-negotiable.`;
        } else {
            return `
MANDATORY SPELLING (International English):
- Use standard British/International English spelling conventions
- Use "-ise" endings: organise, recognise, authorise
- Use "-our" endings: colour, behaviour, favour
- Use "-re" endings: centre, metre
- Double consonants: travelling, cancelling`;
        }
    };

    // ===========================================================================
    // MULTI-LANGUAGE CONTENT SYSTEM (v6.5.8)
    // Generates language instructions for non-English content generation
    // ===========================================================================

    const LANGUAGE_NAMES = {
        'en-AU': 'English (Australian)',
        'en-GB': 'English (British)',
        'en-IN': 'English (Indian)',
        'en-US': 'English (American)',
        'es-ES': 'Spanish (Spain)',
        'es-US': 'Spanish (US)',
        'fr-CA': 'French (Canadian)',
        'fr-FR': 'French (France)',
        'de-DE': 'German',
        'pt-BR': 'Portuguese (Brazilian)',
        'nl-BE': 'Dutch (Belgian)',
        'nl-NL': 'Dutch (Netherlands)',
        'da-DK': 'Danish',
        'fi-FI': 'Finnish',
        'nb-NO': 'Norwegian',
        'sv-SE': 'Swedish',
        'bg-BG': 'Bulgarian',
        'cs-CZ': 'Czech',
        'hr-HR': 'Croatian',
        'hu-HU': 'Hungarian',
        'pl-PL': 'Polish',
        'ro-RO': 'Romanian',
        'ru-RU': 'Russian',
        'sk-SK': 'Slovak',
        'sl-SI': 'Slovenian',
        'sr-RS': 'Serbian',
        'uk-UA': 'Ukrainian',
        'et-EE': 'Estonian',
        'lt-LT': 'Lithuanian',
        'lv-LV': 'Latvian',
        'el-GR': 'Greek',
        'it-IT': 'Italian',
        'cmn-CN': 'Chinese (Mandarin)',
        'zh-CN': 'Chinese (Mandarin)',
        'ja-JP': 'Japanese',
        'ko-KR': 'Korean',
        'id-ID': 'Indonesian',
        'th-TH': 'Thai',
        'vi-VN': 'Vietnamese',
        'bn-IN': 'Bengali',
        'gu-IN': 'Gujarati',
        'hi-IN': 'Hindi',
        'kn-IN': 'Kannada',
        'ml-IN': 'Malayalam',
        'mr-IN': 'Marathi',
        'pa-IN': 'Punjabi',
        'ta-IN': 'Tamil',
        'te-IN': 'Telugu',
        'ur-IN': 'Urdu',
        'ar-XA': 'Arabic',
        'he-IL': 'Hebrew',
        'tr-TR': 'Turkish',
        'sw-KE': 'Swahili',
        'fil-PH': 'Filipino',
        'ms-MY': 'Malay',
        'cmn-TW': 'Chinese (Traditional / Mandarin)',
        'pt-PT': 'Portuguese (Portugal)',
        'is-IS': 'Icelandic',
        'yue-HK': 'Cantonese (Traditional Chinese characters, Hong Kong)'
    };

    // FIX-CC-MULTILANG-NAME-FALLBACK (v12.68): Previously a non-English code that
    // wasn't in LANGUAGE_NAMES (e.g. pa-IN before this fix) silently fell back to
    // 'English (Australian)' and the LLM was told "Generate ALL content in English"
    // — exactly why Punjabi-built courses came out in English. Now we keep the raw
    // code in the prompt so the LLM still gets a real non-English target, and we
    // log a console warning so we discover the gap rather than ship English content.
    const getLanguageName = (languageCode) => {
        if (LANGUAGE_NAMES[languageCode]) return LANGUAGE_NAMES[languageCode];
        if (!languageCode || (languageCode + '').startsWith('en-')) return 'English (Australian)';
        ccWarn('[Prompts] Unknown language code "' + languageCode + '" — falling through to raw code; please add it to LANGUAGE_NAMES.');
        return languageCode;
    };

    const getLanguageInstructions = (languageCode) => {
        const code = languageCode || 'en-AU';
        const isEnglish = code.startsWith('en-');
        
        if (isEnglish) {
            return '';
        }
        
        const languageName = getLanguageName(code);
        
        return `
===========================================================================
LANGUAGE OVERRIDE — v13.13
===========================================================================
OUTPUT LANGUAGE: ${languageName}

You MUST write every word of every card field in ${languageName}.
This overrides all other instructions about English, Australian English,
spelling, or writing conventions. The output language is ${languageName}.

This training is based on Australian workplace content. The reference
material, unit codes, and topic titles may be in English — that is fine.
Use them as subject-matter context only. Your actual output (scenarios,
explanations, questions, feedback, summaries) MUST be written in ${languageName}.

DO NOT write anything in English except:
- JSON field names (title, icon, text, heading, bodyText, etc.)
- Australian unit/qualification codes (e.g. HLTWHS001, BSBWHS211)
- Image prompt text (imagePrompt field only)

EVERY OTHER VALUE must be in ${languageName}. This is an absolute requirement.
===========================================================================
`; };


    // ===========================================================================
    // v10.0: ROUTE-SPECIFIC CARD ARCHITECTURES
    // VET: 7 cards | University: 6 cards | Workplace: 6 cards
    // ===========================================================================

    // v10.43: Unified 7-card schema for VET, Workplace, and PD routes
    // v10.43b: decision-point moved to LAST position so the full narration plays before the interactive question
    const UNIFIED_CARD_SCHEMA = {
        cardTypes: ['hook-scenario', 'concept-explainer', 'mental-model', 'applied-scenario', 'mistakes', 'competency-summary', 'decision-point'],
        contrastTypes: {
            'hook-scenario':       'workplace-scenario',
            'concept-explainer':   'translation',
            'mental-model':        'action-grid',
            'applied-scenario':    'workplace-scenario',
            'mistakes':            'error-list',
            'competency-summary':  'checklist',
            'decision-point':      'checklist'
        }
    };

    const VET_CARD_SCHEMA       = UNIFIED_CARD_SCHEMA;
    const WORKPLACE_CARD_SCHEMA = UNIFIED_CARD_SCHEMA;
    const PD_CARD_SCHEMA        = UNIFIED_CARD_SCHEMA;
    // v16: General moved from the unified 7-card flow to 6 adaptive cards with fixed
    // INSTRUCTIONAL jobs (Orient/Understand/Explore/Apply/Challenge/Consolidate) but
    // AI-generated, topic-specific headings. The underlying cardTypes are still six of
    // the seven unified renderer types - applied-scenario is dropped - so no renderer,
    // CSS or SCORM-export change was needed; only the prompt, the planner and the
    // quality standard changed what each of those six card shapes is asked to DO.
    // Legacy pd/topicstext remain readable for backwards compatibility and keep the old
    // 7-card unified schema, since existing saved courses on those modes are untouched.
    const GENERAL_CARD_SCHEMA = {
        cardTypes: ['hook-scenario', 'concept-explainer', 'mistakes', 'mental-model', 'decision-point', 'competency-summary'],
        contrastTypes: {
            'hook-scenario':      'workplace-scenario',
            'concept-explainer':  'translation',
            'mistakes':           'error-list',
            'mental-model':       'action-grid',
            'decision-point':     'checklist',
            'competency-summary': 'checklist'
        }
    };

    // v13.98.1: decision-point added. University was the only route with no card that
    // asks the learner to commit to an answer and be told whether they were right - six
    // cards of reading, with the two case studies posing open analysis prompts that have
    // no answer and no feedback. Retrieval practice with feedback is the best-evidenced
    // intervention there is, and it was the one thing this route did not do.
    //
    // It also unlocks the end-of-topic activity block, which keys off decision-point and
    // which University was silently exempt from.
    const UNIVERSITY_CARD_SCHEMA = {
        cardTypes: ['concept-anchor', 'theoretical-framework', 'analytical-lens', 'ethics-considerations', 'case-study-1', 'case-study-2', 'decision-point'],
        contrastTypes: {
            'concept-anchor': 'anchor',
            'theoretical-framework': 'framework',
            'analytical-lens': 'analysis',
            'ethics-considerations': 'ethics',
            'case-study-1': 'case-study',
            'case-study-2': 'case-study',
            'decision-point': 'checklist'
        }
    };

    // v13.94.3: Route 5 (Topics and Text) had no schema entry, so getCardSchemaForMode
    // fell through to the 7-card VET schema. normalizeCards then saw 5 cards against an
    // expected 7 and bailed out, which meant Route 5 never received the markdown
    // stripping, slang substitution or doubled-word repair every other route gets.
    const TOPICSTEXT_CARD_SCHEMA = {
        cardTypes: ['overview', 'key-concepts', 'examples-application', 'key-takeaways', 'decision-point'],
        contrastTypes: {
            'overview':             'translation',
            'key-concepts':         'translation',
            'examples-application': 'workplace-scenario',
            'key-takeaways':        'checklist',
            'decision-point':       'checklist'
        }
    };

    const getCardSchemaForMode = (mode) => {
        if (mode === 'general') return GENERAL_CARD_SCHEMA;
        if (mode === 'topicstext') return TOPICSTEXT_CARD_SCHEMA;
        if (mode === 'university') return UNIVERSITY_CARD_SCHEMA;
        if (mode === 'workplace') return WORKPLACE_CARD_SCHEMA;
        if (mode === 'pd') return PD_CARD_SCHEMA;
        return VET_CARD_SCHEMA;
    };

    const getCardCountForMode = (mode) => {
        // v16: General is now 6 adaptive cards (Orient/Understand/Explore/Apply/
        // Challenge/Consolidate), not the unified 7. See GENERAL_CARD_SCHEMA above.
        if (mode === 'general') return 6;
        if (mode === 'topicstext') return 5;
        // v13.98.1: seven since decision-point was added to the academic sequence.
        if (mode === 'university') return 7;
        return 7;
    };

    // ===========================================================================
    // v13.98: BANNED WORDS - rewritten.
    //
    // The old list banned ordinary English (overall, appropriate, generally, various,
    // significantly, critical, effectively, ensuring). The model does not rewrite the
    // sentence when a word is banned - it substitutes a synonym and leaves the syntax
    // intact - so a single Sports Nutrition pack came back carrying 19 instances of
    // "in total" (for overall) and 22 of "makes sure" (for ensures), producing
    // "for in total health", "enhances in total performance" and "the most right
    // nutritional support". That is worse than the words it replaced.
    //
    // What stays is the genuine LLM register: words that almost never appear in
    // writing by a person who knows the subject. What goes is every word whose only
    // fault was being common.
    // ===========================================================================
    const BANNED_WORDS = [
        'delve','unpack','journey','landscape','leverage','foster','holistic','robust',
        'synergy','paradigm','navigate','realm','tapestry','multifaceted','nuanced',
        'pivotal','cutting-edge','game-changer','empower','streamline','stakeholder engagement',
        'best practice','best practices','paramount','aforementioned','endeavour','pertaining',
        'henceforth','whereby','thereof','therein','notwithstanding','key considerations',
        'in today\'s','in the modern workplace','it is important to','for safety purposes'
    ];

    /**
     * v13.98: the damage the OLD banned list caused, so it can never come back silently.
     *
     * These are the substitution artefacts a model produces when it is told not to use
     * a word but is not told to rewrite the sentence. Each is either ungrammatical or
     * means something different from what was intended.
     */
    const SUBSTITUTION_ARTEFACTS = [
        'in total health','in total performance','in total experience','in total results',
        'in total success','in total team','in total business','in total fitness',
        'in total,','and in total','their in total','better in total','the most right',
        'makes sure that advice','makes sure diverse','makes sure continued','makes sure a balanced'
    ];

    const validateBannedWords = (cards) => {
        const text = JSON.stringify(cards).toLowerCase();
        return BANNED_WORDS.filter(w => text.includes(w));
    };

    /**
     * v13.98: detect banned-word substitution artefacts in generated cards.
     *
     * @param {Array} cards Normalised cards.
     * @return {Array} The artefact phrases actually present.
     */
    const validateSubstitutionArtefacts = (cards) => {
        const text = JSON.stringify(cards).toLowerCase();
        return SUBSTITUTION_ARTEFACTS.filter(function (p) { return text.indexOf(p) !== -1; });
    };

    // ===========================================================================
    // v13.98: FIELD SPECS - the single source of truth for per-field word ranges.
    //
    // WHY THIS EXISTS
    //
    // Every route's card spec below states word ranges in prose, inside the system
    // prompt. Nothing in the pipeline could read them, so nothing could check them.
    // depthIssues() in generator.js measured whole CARDS against a floor deliberately
    // set below the bottom of the band, which cannot detect uniform per-field
    // shortfall: four scene texts at 32 words plus four titles sums to ~143 and clears
    // a 145-ish floor while every field in the card is a quarter short.
    //
    // Measured on the v13.97.1 Sports Nutrition pack: 16 of 172 learner-facing fields
    // (9%) met the ranges the prompt states. The mistakes card was 0 of 50.
    //
    // These tables carry the SAME numbers written in the prompt prose. Change one and
    // change the other - ccFieldSpecPromptLine() below renders the prose FROM this
    // table for the card specs that use it, so the two cannot drift apart.
    //
    // `path`  - canonical field path after normalizeCardSchema() in generator.js.
    // `alias` - vendor field names retained alongside the canonical one, tried in order.
    // `label` - what the learner-facing field is called in a repair instruction.
    // `hint`  - what to ADD when the field is short. Never "make it longer".
    // ===========================================================================

    /** Shared by the three unified 7-card routes; per-route overrides applied below. */
    const CC_SPEC_UNIFIED_BASE = {
        'hook-scenario': [
            { path: 'sceneParts[].title', alias: ['keyPoints[].title'], label: 'scene panel title', min: 3, max: 5 },
            { path: 'sceneParts[].text', alias: ['keyPoints[].text'], label: 'scene panel text', min: 42, max: 56,
              hint: 'add the second sentence: what is happening now, or what it costs you. Name the place, the time of day and the thing you can see.' }
        ],
        'concept-explainer': [
            { path: 'conceptInsights[].title', alias: ['keyPoints[].title'], label: 'concept title', min: 3, max: 5 },
            { path: 'conceptInsights[].text', alias: ['keyPoints[].text'], label: 'concept text', min: 35, max: 50,
              hint: 'add the specific figure, threshold, duration or named example from the reference material that makes this concept usable.' },
            { path: 'keyInfo', alias: ['legalLink.legalObligation'], label: 'obligation line', min: 25, max: 35 },
            { path: 'summaryLine', label: 'summary line', min: 15, max: 20 }
        ],
        'mental-model': [
            { path: 'steps[].step', label: 'step label', min: 3, max: 6 },
            { path: 'steps[].detail', label: 'step detail', min: 35, max: 45,
              hint: 'add the decision rule: the threshold, quantity or reading that tells you which way to go, and what tells you the step is done.' }
        ],
        'applied-scenario': [
            { path: 'sceneParts[].title', alias: ['keyPoints[].title'], label: 'scene panel title', min: 3, max: 5 },
            { path: 'sceneParts[].text', alias: ['keyPoints[].text'], label: 'scene panel text', min: 42, max: 56,
              hint: 'add the second sentence: what you do about it, or what it costs you.' }
        ],
        'mistakes': [
            { path: 'items[].mistake', alias: ['errorItems[].error'], label: 'mistake label', min: 6, max: 10 },
            { path: 'items[].consequence', alias: ['errorItems[].consequence'], label: 'consequence', min: 34, max: 46,
              hint: 'add the SECOND sentence, the one that lands it on a named person: who is standing there when this goes wrong and what it costs them.' }
        ],
        'competency-summary': [
            { path: 'goodItems[].text', alias: ['standardItems[].text'], label: 'standard label', min: 6, max: 10 },
            { path: 'goodItems[].benefit', alias: ['standardItems[].benefit'], label: 'standard benefit', min: 14, max: 22,
              hint: 'say what it looks like on the job when this is done properly, in a supervisor\'s words. Not an abstract virtue.' },
            { path: 'badItems[].text', alias: ['errorItems[].error'], label: 'avoid label', min: 10, max: 12 },
            { path: 'badItems[].consequence', alias: ['errorItems[].consequence'], label: 'avoid consequence', min: 14, max: 18 }
        ],
        'decision-point': [
            { path: 'question', alias: ['heading'], label: 'question', min: 18, max: 28 },
            { path: 'options[].text', label: 'option', min: 10, max: 16,
              hint: 'every option names a specific action at the same level of detail. No stubs, no justification clause on the correct one.' },
            { path: 'options[].feedback', label: 'option feedback', min: 25, max: 38 }
        ]
    };

    /**
     * Deep-clone the unified base and apply a route's per-field overrides.
     *
     * @param {Object} overrides {cardType: {fieldPath: {min, max}}}
     * @return {Object} A route field-spec table.
     */
    const ccSpecFrom = function (overrides) {
        const out = {};
        Object.keys(CC_SPEC_UNIFIED_BASE).forEach(function (ct) {
            out[ct] = CC_SPEC_UNIFIED_BASE[ct].map(function (f) {
                const copy = {};
                Object.keys(f).forEach(function (k) { copy[k] = f[k]; });
                const o = overrides && overrides[ct] && overrides[ct][f.path];
                if (o) {
                    if (typeof o.min === 'number') { copy.min = o.min; }
                    if (typeof o.max === 'number') { copy.max = o.max; }
                }
                return copy;
            });
        });
        return out;
    };

    const CC_FIELD_SPECS = {
        // v13.98.1: VET cards 2, 3 and 7 raised for the same reason as Workplace below -
        // a card written perfectly could not reach the band the route states. On VET
        // these are also the assessable core of the route: card 2 is the obligation the
        // learner is held to and card 3 is the procedure an assessor watches. They were
        // the two thinnest cards on the route (154-220 and 152-204). Now 183-251 and
        // 180-224, with card 7 at 182-286.
        vet: ccSpecFrom({
            'concept-explainer': {
                'conceptInsights[].text': { min: 42, max: 56 },
                'keyInfo': { min: 30, max: 42 },
                'summaryLine': { min: 18, max: 26 }
            },
            'mental-model': { 'steps[].detail': { min: 80, max: 140 } },
            'decision-point': { 'question': { min: 22, max: 32 }, 'options[].feedback': { min: 30, max: 44 } }
        }),
        // v13.98.1: Workplace ranges raised on cards 2, 3 and 7 so that a card written
        // to spec actually reaches the band the route states. Before this, a perfect
        // concept-explainer topped out at 235 and a perfect mental-model at 192 against
        // a stated floor of 180 - the two thinnest cards on the route were the two
        // carrying the subject matter, which is exactly where a Workplace pack drifts
        // into generic advice. Card totals are now 183-251 (card 2), 180-224 (card 3)
        // and 182-286 (card 7).
        workplace: ccSpecFrom({
            'concept-explainer': {
                'conceptInsights[].text': { min: 42, max: 56 },
                'keyInfo': { min: 30, max: 42 },
                'summaryLine': { min: 18, max: 26 }
            },
            'mental-model': { 'steps[].detail': { min: 80, max: 140 } },
            'decision-point': { 'question': { min: 22, max: 32 }, 'options[].feedback': { min: 30, max: 44 } }
        }),
        // v13.98.1: PD raised to match, for the same reason.
        pd: ccSpecFrom({
            'concept-explainer': {
                'conceptInsights[].text': { min: 42, max: 56 },
                'keyInfo': { min: 30, max: 42 },
                'summaryLine': { min: 18, max: 26 }
            },
            // v14.2: raised for the storytelling-standard rewrite below. min is a floor
            // against thin, undertaught steps - NOT a target to pad toward. max is a
            // ceiling against rambling. Write as much as the teaching genuinely needs
            // between them; do not converge on the midpoint by habit.
            'mental-model': { 'steps[].detail': { min: 90, max: 160 } },
            'mistakes': { 'items[].consequence': { min: 55, max: 110 } },
            'competency-summary': {
                'goodItems[].benefit': { min: 30, max: 65 },
                'badItems[].consequence': { min: 22, max: 50 }
            },
            'decision-point': { 'question': { min: 22, max: 32 }, 'options[].feedback': { min: 30, max: 44 } }
        }),
        // v16: General route - 6 adaptive cards (Orient/Understand/Explore/Apply/
        // Challenge/Consolidate). Written directly rather than via ccSpecFrom() because
        // every card here also needs a `title` entry - the AI-generated, topic-specific
        // learner-facing heading - which no other route's cards carry at the top level.
        // These are safety rails, not targets. General learning needs enough room for
        // context + explanation + contrast + application, while still keeping each card
        // purposeful. applied-scenario has no entry: General no longer generates it.
        general: (function () {
            const out = {};
            ['hook-scenario', 'concept-explainer', 'mistakes', 'mental-model', 'decision-point', 'competency-summary'].forEach(function (ct) {
                out[ct] = CC_SPEC_UNIFIED_BASE[ct].map(function (f) {
                    const copy = {};
                    Object.keys(f).forEach(function (k) { copy[k] = f[k]; });
                    return copy;
                });
                // v16: every General card carries its own AI-written heading.
                out[ct].push({ path: 'title', label: 'card heading', min: 4, max: 10,
                    hint: 'write a specific, topic-grounded heading for this card - never a generic label like "Orient", "Explore" or the topic name repeated verbatim.' });
            });
            out['hook-scenario'][0].min = 3; out['hook-scenario'][0].max = 5;
            out['hook-scenario'][1].min = 55; out['hook-scenario'][1].max = 80;
            out['concept-explainer'][1].min = 60; out['concept-explainer'][1].max = 90;
            out['concept-explainer'][2].min = 35; out['concept-explainer'][2].max = 55;
            out['concept-explainer'][3].min = 22; out['concept-explainer'][3].max = 34;
            out['mental-model'][1].min = 100; out['mental-model'][1].max = 180;
            out['mistakes'][1].min = 55; out['mistakes'][1].max = 90;
            out['competency-summary'][1].min = 28; out['competency-summary'][1].max = 48;
            out['competency-summary'][3].min = 24; out['competency-summary'][3].max = 42;
            out['decision-point'][0].min = 24; out['decision-point'][0].max = 38;
            out['decision-point'][2].min = 35; out['decision-point'][2].max = 55;
            return out;
        }()),
        // v13.98.1: raised so each card type reaches the route's stated floor, which four
        // of the six could not previously do even written to the top of every range.
        university: {
            'concept-anchor': [
                { path: 'conceptDefinition', label: 'concept definition', min: 52, max: 68 },
                { path: 'significance', label: 'significance', min: 50, max: 66 },
                { path: 'keyTerms[].definition', label: 'key term definition', min: 24, max: 32 }
            ],
            // principle/limitation ranges depend on how many frameworks were returned
            // (2 => longer, 3 => shorter); fieldIssues() picks by frameworks.length.
            'theoretical-framework': [
                { path: 'frameworks[].principle', label: 'framework principle', min: 38, max: 66, byCount: { 2: [54, 66], 3: [38, 46] } },
                { path: 'frameworks[].limitation', label: 'framework limitation', min: 24, max: 46, byCount: { 2: [36, 46], 3: [24, 30] } }
            ],
            'analytical-lens': [
                { path: 'cognitiveConsiderations[]', label: 'consideration', min: 36, max: 48 }
            ],
            'ethics-considerations': [
                { path: 'considerations[].description', label: 'ethics consideration', min: 34, max: 46 }
            ],
            'case-study-1': [
                { path: 'context', label: 'case context', min: 80, max: 104 },
                { path: 'analysisPrompts[]', label: 'analysis prompt', min: 22, max: 30 },
                { path: 'keyInsight', label: 'key insight', min: 24, max: 34 }
            ],
            'case-study-2': [
                { path: 'context', label: 'case context', min: 80, max: 104 },
                { path: 'analysisPrompts[]', label: 'analysis prompt', min: 22, max: 30 },
                { path: 'criticalReflection', label: 'critical reflection', min: 30, max: 38 }
            ],
            // v13.98.1: University's new card 7.
            'decision-point': [
                { path: 'question', alias: ['heading'], label: 'question', min: 22, max: 32 },
                { path: 'options[].text', label: 'option', min: 10, max: 16,
                  hint: 'every option names a specific position at the same level of detail. No stubs, no justification clause on the correct one.' },
                { path: 'options[].feedback', label: 'option feedback', min: 30, max: 44 }
            ]
        },
        topicstext: {
            'overview': [{ path: 'paragraphs[]', label: 'paragraph', min: 55, max: 70 }],
            'key-concepts': [
                { path: 'paragraphs[]', label: 'paragraph', min: 55, max: 70 },
                { path: 'keyTerms[].definition', label: 'key term definition', min: 12, max: 25 }
            ],
            'examples-application': [{ path: 'paragraphs[]', label: 'paragraph', min: 55, max: 70 }],
            'key-takeaways': [
                { path: 'paragraphs[]', label: 'paragraph', min: 55, max: 70 },
                { path: 'goodItems[].text', label: 'sound-practice item', min: 8, max: 16 },
                { path: 'badItems[].text', label: 'misconception item', min: 8, max: 16 }
            ],
            'decision-point': [
                { path: 'question', label: 'question', min: 15, max: 30 },
                { path: 'options[].text', label: 'option', min: 10, max: 16,
                  hint: 'every option names a specific action at the same level of detail. No stubs, no justification clause on the correct one.' },
                { path: 'options[].feedback', label: 'option feedback', min: 12, max: 25 }
            ]
        }
    };

    /**
     * v13.98: the word range every route states for a decision-point option, and the
     * maximum length ratio between the longest and shortest option on one card.
     *
     * A correct answer of 27 words against distractors of 5, 4 and 7 - which is what
     * v13.97.1 produced - is answerable by shape alone, without reading a word of it.
     */
    const CC_OPTION_SPEC = { min: 10, max: 16, maxRatio: 1.4 };

    /**
     * v13.98: how a keyTakeaway must be written. Previously specified NOWHERE - the
     * field was read opportunistically off card 1 in generator.js and simply absent
     * on any slide where the model had not volunteered one.
     */
    // v13.98.3: 38, not 40. Two sentences under a 19-word cap is 38 words.
    const CC_KEY_TAKEAWAY_SPEC = { min: 28, max: 38 };

    /**
     * v13.98: openings a key takeaway may not use. Three of the four takeaways in the
     * v13.97.1 pack opened on the same abstraction ("A deep understanding of energy
     * systems is essential for...") and carried no fact at all.
     */
    const CC_TAKEAWAY_BANNED_OPENINGS = [
        'a deep understanding', 'understanding ', 'it is important', 'it is essential',
        'a good understanding', 'having a clear', 'knowing '
    ];

    /**
     * v13.98: how many of each repeated field a card is asked for.
     *
     * Needed to turn the per-field ranges into a whole-card range. Deriving the card
     * floor this way found a real incoherence that had been in the prompts since
     * v13.94.3: every unified route tells the model a card must land between 180 and
     * 300 words, but concept-explainer (154-220 on VET), mental-model (152-204) and
     * decision-point (158-244) CANNOT reach 180 even when every single field is written
     * to the top of its range. University is worse - four of its six card types top out
     * under its stated 170 floor. The model was being given a target its own field
     * specs made impossible, and any whole-card floor set from the stated band would
     * fail compliant cards forever.
     *
     * Deriving the floor from the specs means the two can never contradict each other
     * again, whichever one someone edits.
     */
    const CC_EXPECTED_ITEMS = {
        'hook-scenario': { 'sceneParts[].title': 4, 'sceneParts[].text': 4 },
        'concept-explainer': { 'conceptInsights[].title': 3, 'conceptInsights[].text': 3 },
        // v13.98.3: the prompt asks for 4-5 steps. Costing it at 4 told the repair pass
        // that a compliant 5-step card should be cut by ~56 words. depthIssues() now
        // measures the card's ACTUAL step count; this stays as the floor for the range.
        'mental-model': { 'steps[].step': 4, 'steps[].detail': 4 },
        'applied-scenario': { 'sceneParts[].title': 4, 'sceneParts[].text': 4 },
        'mistakes': { 'items[].mistake': 5, 'items[].consequence': 5 },
        'competency-summary': {
            'goodItems[].text': 5, 'goodItems[].benefit': 5,
            'badItems[].text': 5, 'badItems[].consequence': 5
        },
        'decision-point': { 'options[].text': 4, 'options[].feedback': 4 },
        'concept-anchor': { 'keyTerms[].definition': 3 },
        'theoretical-framework': { 'frameworks[].principle': 3, 'frameworks[].limitation': 3 },
        'analytical-lens': { 'cognitiveConsiderations[]': 5 },
        'ethics-considerations': { 'considerations[].description': 5 },
        'case-study-1': { 'analysisPrompts[]': 3 },
        'case-study-2': { 'analysisPrompts[]': 3 },
        // decision-point counts are shared with the unified routes above.
        'overview': { 'paragraphs[]': 2 },
        'key-concepts': { 'paragraphs[]': 2, 'keyTerms[].definition': 3 },
        'examples-application': { 'paragraphs[]': 2 },
        'key-takeaways': { 'paragraphs[]': 2, 'goodItems[].text': 3, 'badItems[].text': 3 }
    };

    /**
     * The word range a card of this type occupies when every field is written to spec.
     *
     * @param {String} mode Route id.
     * @param {String} cardType Card type.
     * @return {Object|null} {min, max} or null when the type has no field specs.
     */
    const getCardWordRange = (mode, cardType, card) => {
        const specs = (CC_FIELD_SPECS[mode] || CC_FIELD_SPECS.vet)[cardType];
        if (!specs || !specs.length) { return null; }
        const counts = CC_EXPECTED_ITEMS[cardType] || {};
        let min = 0;
        let max = 0;
        specs.forEach(function (f) {
            // v13.98.3: where a card was actually returned, cost it on the number of items
            // it really has. Several specs allow a range (mental-model 4-5 steps,
            // frameworks 2-3, keyTerms 3-4) and costing them at the minimum told the repair
            // pass that a compliant longer card was over its band.
            let n = counts[f.path] || 1;
            if (card) {
                const arrKey = (f.path.indexOf('[]') !== -1) ? f.path.split('[]')[0] : null;
                if (arrKey && Array.isArray(card[arrKey]) && card[arrKey].length) {
                    n = card[arrKey].length;
                }
            }
            // Where a range varies by item count (University frameworks), the
            // three-framework variant is the one that matches CC_EXPECTED_ITEMS.
            const lo = (f.byCount && f.byCount[n]) ? f.byCount[n][0] : f.min;
            const hi = (f.byCount && f.byCount[n]) ? f.byCount[n][1] : f.max;
            min += lo * n;
            max += hi * n;
        });
        return { min: min, max: max };
    };

    const getFieldSpecs = (mode) => CC_FIELD_SPECS[mode] || CC_FIELD_SPECS.vet;

    // ===========================================================================
    // VET 7-CARD SYSTEM PROMPT
    // ===========================================================================

    // ===========================================================================
    // v13.98: SHARED QUALITY RULES - injected into every route system prompt (v15: now
    // 4 teacher-facing routes - VET, Workplace, University, General - plus the legacy
    // PD/Topics&Text prompts kept for saved-course compatibility; 6 in total).
    //
    // These four blocks address the four failures found in the v13.97.1 Sports
    // Nutrition review. They are written once and shared so a fix to one cannot
    // silently apply to only three routes, which is how the spelling block ended up
    // off the University route until v13.85.
    // ===========================================================================

    /**
     * P1 - source fidelity. The single largest defect found: a 5,000-word source
     * lecture containing roughly forty teachable specifics (10-12 g/kg/day carb
     * loading, 30 g/hour during exercise, a 2-3% performance gain, a named study,
     * beta-alanine and carnosine, the carbohydrate mouth rinse, lactate threshold)
     * produced a five-slide pack containing NONE of them, and all five slides
     * re-taught the same three-paragraph summary instead.
     */
    const CC_SOURCE_FIDELITY_BLOCK = `USE THE SOURCE  -  THIS IS THE FIRST TEST OF THE PACK:
When REFERENCE MATERIAL is supplied it is the subject matter, not background reading. Teach from
what it actually says. Carry across its numbers, thresholds, durations, doses, percentages, named
studies, named people, named methods and worked examples, in its own words where they are precise.
Preserve the source's MATERIAL specifics: numbers, thresholds, examples, methods and exceptions that
change understanding or action. Do not mechanically repeat every number in a long source; select the
ones that carry the learning. Every substantive teaching card must contain at least one source-grounded
specific a reader could not have guessed from the card title: a figure where relevant, a named example,
a named method, a mechanism, a boundary or a concrete consequence.
Do NOT replace a specific with its category. "Around 30 grams of carbohydrate an hour" is the
content; "adequate carbohydrate intake" is the content deleted. A learner remembers the first and
cannot use the second.
If the source contains a decision rule, a duration ladder, a dosing protocol or a threshold, that
rule IS the teaching  -  put it on the card rather than describing that such rules exist.
Where the source corrects a common belief, name the belief and the correction.

STAY IN YOUR OWN SLIDE  -  this slide sits in a pack alongside the others named in the user message.
Teach only the material that belongs to YOUR title. Do not restate the pack's general framing on
every slide: if an earlier slide introduces a model, a system or a set of categories, later slides
build on it and never re-explain it from the beginning. A reader who has finished your slide must
know something they did not know at the end of the previous one.`;

    /**
     * P5 - keyTakeaway. Until v13.98 this field was specified in no prompt at all;
     * generator.js simply read whatever the model happened to emit off card 1, which
     * is why the 13.97.1 pack carried four vague takeaways and a fifth slide with none.
     */
    const CC_KEY_TAKEAWAY_BLOCK = `KEY TAKEAWAY  -  REQUIRED ON CARD 1, on every slide, no exceptions:
Return a "keyTakeaway" string field on card 1. Two sentences, 28-38 words in total, both
sentences inside this route's sentence-length cap.
Sentence one states the single load-bearing FACT of this slide, including its number, threshold,
dose or name if it has one. Sentence two says what that fact changes about what the learner does.
This is the line the learner re-reads and the one they should still be able to say in a month, so
it must contain something specific enough to be wrong.
NEVER open it with "Understanding...", "A deep understanding of...", "Knowing...", "It is important
to..." or "It is essential to...". A takeaway that only asserts that the topic matters is a failure:
say the thing that matters instead.`;

    /**
     * P3/P4 - decision-point quality. The parity rule already existed in prose on
     * every route and was enforced nowhere; v13.97.1 shipped a correct answer of 27
     * words against distractors of 5, 4 and 7, and three further questions where every
     * option was a 3-9 word stub.
     */
    const CC_DISTRACTOR_BLOCK = `DECISION QUESTION  -  the options are checked mechanically before the pack is accepted:
Every option, correct and incorrect, is 10-16 words and names a specific action. The longest option
may not be more than 1.4 times the length of the shortest. An option under 10 words is a stub and
fails; an option carrying a "which helps..." or "improving..." clause the others do not have fails.
The reasoning belongs in the option's feedback, never in the option text.
A wrong option must be something a COMPETENT person might actually choose  -  a real misconception,
a rule applied at the wrong threshold, or advice that is correct for a different case. Draw them
from the beliefs the reference material corrects.
Never write a wrong option that announces its own wrongness. These all fail:
"Use only technical terms", "Ignore client feedback", "Assume everyone needs the same advice",
"Update your knowledge sporadically", "Focus solely on one approach", "Do everything at once".
The test: a knowledgeable person should have to think, and should be able to say why the wrong
option is tempting. If every distractor is obviously silly, the question measures nothing.`;

    /**
     * P7 - what to do INSTEAD of a banned word. The old list produced substitution
     * artefacts ("in total health", "makes sure diverse insights") because the model
     * swapped a synonym in rather than rewriting the sentence.
     */
    const CC_VAGUE_LANGUAGE_BLOCK = `VAGUE LANGUAGE  -  rewrite the sentence, never swap the word:
Words like "overall", "effective", "appropriate", "ensure", "significant" and "comprehensive" are
usually a sign the sentence has no content in it. When you notice one, do NOT reach for a synonym.
Replace the whole sentence with the specific it was standing in for.
"Ensure appropriate nutrition" becomes "Give him 60 grams of carbohydrate in the hour before he
starts." Never write "in total" where you mean "overall", and never write "the most right".
If the specific is not available to you, cut the sentence rather than dressing it up.`;

    /**
     * v14.2: GLOBAL STORYTELLING STANDARD - sits above every card's model/framework.
     * The framework (STAR, GROW, PDCA, SWOT, Golden Circle, 5 Whys, Start-Stop-
     * Continue, etc, named per card below) controls the INSTRUCTIONAL STRUCTURE.
     * It must never be read as permission to write four short labelled sentences.
     * The model is the skeleton; the content still needs muscle.
     */
    const CC_STORYTELLING_BLOCK = `GLOBAL WRITING STANDARD  -  applies above whichever model each card names below:
Never let a framework's shape (STAR, GROW, PDCA, SWOT, Golden Circle, 5 Whys, Start-Stop-Continue,
or any other model this route names) decide how MUCH is written. The framework organises the
teaching; it is not a target of "one short sentence per label". A card that renames its own
framework in four clipped fragments has failed even if every field is technically present.
Word ranges stated per field below are a SAFETY RAIL: the maximum stops rambling, the minimum
stops a step too thin to teach anything. They are not a target - do not converge every field on
the same length out of habit. Write however much the teaching in THAT field actually needs.
TEACH THROUGH EXPERIENCE, where the card type allows it: situation, tension or problem, decision,
action, consequence, then the explanation of the principle the situation just revealed. Prefer
"Josh looks at the isolation tag already hanging from the switch. The building opens in forty
minutes and he is already behind." over "Workers should always verify isolation before starting
work." Both state a fact; only the first gives the learner something to picture.
USE CONCRETE DETAILS, NEVER PLACEHOLDER LANGUAGE. Banned as filler: "an employee", "a workplace",
"a problem occurs", "communication is important", "the worker should follow procedure", "there may
be consequences", "consider the situation". Every card names a specific person, place, number,
deadline or artefact instead.
SHOW CAUSE AND EFFECT EXPLICITLY. Use "because", "which means", "so", "as a result", "the problem
is", "this matters because" to connect an action to its outcome - do not leave the learner to
infer the lesson when one explanatory clause would state it.
SHOW CONSEQUENCES, NEVER ASSERT THEM. Not "this could have negative consequences" - show exactly
what happens, to whom, and what it costs. A consequence with no one standing in it teaches nothing.
BUILD LIGHT TENSION where a scenario is used: a deadline, an impatient customer, conflicting
priorities, a tempting shortcut. Show why the wrong choice is tempting before showing why it is
wrong - a mistake presented as pure carelessness teaches nothing about how a capable person
actually falls into it.
CONTRAST IS THE STRONGEST TEACHING TOOL AVAILABLE: untrained vs trained, weak vs strong, assumption
vs evidence, before vs after. Use it wherever the card type calls for it below.
AVOID TEXTBOOK VOICE. Never open with "It is important to note that...", "Learners should
understand that...", "This concept refers to...". Write the way a genuinely good instructor talks,
not the way a policy document reads. Formal terms are still used accurately where the subject
requires them - explain a term simply once, demonstrate it, then use it naturally afterward.
DO NOT FABRICATE TECHNICAL FACTS to make a story richer. Character names, ordinary settings,
realistic dialogue, timing and routine workplace pressure may be invented freely. A number, a
threshold, a legal requirement or a named finding may never be invented - if the source material
does not support one, do not add one.
Every piece of narrative must do at least one job: establish context, expose a misconception,
show a decision, make a consequence visible, create contrast, or explain a mechanism. Cut anything
that does none of these - this is instructional storytelling, not decorative fiction.`;

    /**
     * v15: learning design pass. This is intentionally concise: the model plans before
     * writing without emitting hidden chain-of-thought or changing the JSON contract.
     */
    const CC_LEARNING_BLUEPRINT_BLOCK = `PLAN THE LEARNING BEFORE YOU WRITE THE CARDS:
Before drafting, privately build a concise Learning Blueprint from the topic, learner, desired
outcome and source. Do not output the blueprint. Use it to control the whole seven-card sequence.
Determine: (1) the learning destination; (2) what the learner can already be assumed to know;
(3) prerequisite concepts; (4) the two-to-five load-bearing ideas; (5) their dependency order;
(6) what the learner must ultimately recognise, decide, explain or do; (7) likely misconceptions;
(8) realistic mistakes and WHY a capable person might make them; (9) consequences; (10) critical
decision points; (11) the best example or scenario; (12) the instructional treatment that fits.
Do not force an entire topic into one framework. Frameworks are tools. The learning job chooses the
framework, never the other way around.
Build a progression across cards: experience/curiosity -> explanation -> usable model -> applied
contrast -> mistakes -> capability summary -> independent decision. Each card must move the learner
forward rather than restating the previous card.`;


    /**
     * v15.1: Instructional Model Router. Named frameworks are selected from the
     * actual learning job, not from the route or keywords alone. This block is
     * shared by VET, Workplace, University and General; route prompts add their
     * own source-authority and performance emphasis.
     */
    const CC_INSTRUCTIONAL_MODEL_ROUTER_BLOCK = `INSTRUCTIONAL MODEL ROUTER - CHOOSE THE MODEL FROM THE LEARNING JOB:
Before drafting the mental-model or any framework-shaped card, classify what the learner actually
needs to DO WITH the content. Do not select a model because a keyword appears in the topic. Select it
because its reasoning structure matches the learner's task. A topic may contain more than one learning
job; choose the model that carries the load-bearing decision for THIS card. If no named model improves
understanding, use a plain, topic-specific sequence instead. Never force an acronym into content.

MODEL SELECTION RULES:

1. GROW - COACHING, FEEDBACK AND DEVELOPMENTAL CONVERSATIONS
Use GROW only when the learner must guide another person through a conversation where the other
person's response changes what should happen next: coaching, difficult feedback, performance
discussion, development planning, collaborative problem-solving.
GROW = Goal -> Reality -> Options -> Way Forward.
Each stage must operate on one continuous real conversation. Show the words said, the response heard,
and how that response changes the next move. Do NOT use GROW for technical procedures, factual
knowledge, system instructions, safety controls or any topic where the second person's response is not
part of the mechanism.

2. PDCA - ITERATIVE PROCESS OR CONTINUOUS IMPROVEMENT
Use PDCA when the learner must plan a change, try it, inspect the result and improve the next cycle.
PDCA = Plan -> Do -> Check -> Act.
Best for quality improvement, workflow changes, testing a new process, operational improvement and
review cycles. Do not use it for a one-pass procedure that simply needs to be completed correctly.

3. 5 WHYS - ROOT-CAUSE DIAGNOSIS
Use 5 Whys when a recurring problem, incident, defect or failure has a visible symptom but the real
cause is unclear. Move from symptom -> cause -> deeper cause -> root cause -> corrective implication.
Every Why must deepen causality; never restate the previous answer in different words.

4. COST-BENEFIT / TRADE-OFF - COMPETING CHOICES
Use when the learner must choose between alternatives with genuine advantages, costs, risks or
opportunity costs and no option is automatically perfect. Structure as Option -> Benefit -> Cost/Risk ->
Opportunity Cost -> Decision. Make the decision criteria explicit rather than merely listing pros/cons.

5. RISK-CONTROL - SAFETY OR HIGH-CONSEQUENCE DECISIONS
Use when the learner must recognise a hazard or exposure and choose controls before proceeding.
Structure as Hazard -> Risk -> Control -> Verify, adding likelihood/consequence only when the source or
course genuinely uses that assessment method. Name the thing being controlled and the evidence that
tells the learner the control is working. Never invent a risk matrix, rating or statutory threshold.

6. PREPARE-PERFORM-CHECK-VERIFY - PROCEDURAL PERFORMANCE
Use for repeatable tasks where sequence and completion standard matter: equipment operation, forms,
software processes, setup/shutdown and technical procedures. Each step must name the artefact, tool,
screen, reading, output or observable condition involved. The final Verify is evidence that the task
worked, not merely 'finish' or 'review'.

7. DIAGNOSE-TEST-CORRECT-VERIFY - TROUBLESHOOTING
Use when a learner must respond to a fault, discrepancy or symptom without jumping to a solution.
Diagnose the evidence -> test the leading explanation -> correct the supported cause -> verify the fault
is actually resolved. Show what result would disconfirm the first diagnosis and send the learner down a
different path.

8. RECOGNISE-ASSESS-ACT/ESCALATE-RECORD - ESCALATION AND AUTHORITY BOUNDARIES
Use when the learner must recognise that a situation has crossed a policy, authority, risk or competence
boundary. Teach the cue -> the assessment -> what the learner may do themselves versus escalate -> what
must be recorded or handed over. Best for complaints, privacy incidents, safeguarding, refund limits,
legal threats and unusual/high-risk exceptions.

9. TRIGGER-BEHAVIOUR-CONSEQUENCE-REPLACEMENT - BEHAVIOUR CHANGE
Use when the learning goal is to replace a recurring habit or behavioural pattern. Show the trigger, the
current behaviour, the immediate and downstream consequence, then the replacement behaviour that fits
the same real trigger. Do not moralise; explain why the old behaviour is attractive or automatic.

10. STAKEHOLDER-PRINCIPLE-TRADE-OFF-JUSTIFIED RESPONSE - ETHICAL DILEMMAS
Use where two or more legitimate values conflict. Identify who is affected, the competing principles,
the benefits/harms of plausible choices, the unavoidable trade-off and the reasoning for a justified
response. Never manufacture a clean answer when the educational value is in the tension itself.

11. COMPARE-CONTRAST / GAP ANALYSIS - COMPETING THEORIES, METHODS OR CASES
Use when the learner must compare alternatives or understand what a second case adds to the first.
Structure around what both explain/do -> where they differ -> strength -> limitation/gap -> when the
difference matters. Especially useful in University, but also valid for workplace methods and general
learning when genuine alternatives exist.

12. WHAT-WHY-HOW-APPLY - CONCEPTUAL ANCHOR
Use when learners first need a durable mental model of a new concept. What = define it accurately; Why =
why anyone should care or what problem it solves; How = the mechanism, parts or causal process; Apply =
where the learner uses it. The Apply stage is mandatory: a definition that never reaches use is not a
learning model.

13. CAUSE-MECHANISM-EFFECT-CONSEQUENCE-APPLICATION - CAUSAL CONCEPTS
Use for science, economics, psychology, finance, safety and technical concepts where the learner must
understand what causes what. Do not skip the mechanism. 'X causes Y' is thinner than explaining what X
changes that produces Y. Finish by showing how that causal understanding changes a decision or action.

14. VITAL-FEW / LOAD-BEARING CONCEPTS - PRIORITISING COMPLEX CONTENT
Use when a broad topic contains many facts but only a few concepts unlock the rest. Identify the two to
five ideas with the highest dependency value, teach their relationships, and deliberately omit decorative
background that does not help the stated outcome. Short duration should reduce scope here before it
reduces explanation quality.

15. START-STOP-CONTINUE - CONSOLIDATING BEHAVIOUR OR PRACTICE
Use at the end of learning when the useful outcome is a change in behaviour or judgement. Stop = a real
misconception or ineffective habit; Start = the replacement action/model; Continue = a useful existing
behaviour or belief that remains valid. Do not use this automatically for factual summaries.

ROUTE BIAS - USE AS A TIE-BREAKER, NEVER AS A LOCK:
VET: prefer observable-performance models such as Prepare-Perform-Check-Verify, Risk-Control,
Diagnose-Test-Correct-Verify, Recognise-Assess-Act/Escalate-Record or PDCA when the unit genuinely
requires iterative improvement. Competency evidence and official requirements outrank elegance.
WORKPLACE: prefer the model that reproduces the organisation's real decision path. Policy/SOP steps and
authority boundaries outrank generic frameworks. GROW is excellent for real coaching/feedback; escalation
models for policy boundaries; procedure and troubleshooting models for systems/processes.
UNIVERSITY: prefer models that expose reasoning: What-Why-How-Apply, Cause-Mechanism-Effect, 5 Whys,
Compare-Contrast/Gap Analysis, Stakeholder-Principle-Trade-off, and Cost-Benefit where analytically
appropriate. Never turn academic analysis into a simplistic workplace checklist.
GENERAL: choose freely from the whole library based on the learning job. 'Professional development' and
'short course' are not model-selection rules. A short course narrows scope; it does not dictate pedagogy.

MODEL QUALITY TEST:
Before keeping the selected model, ask: Would these same steps still make sense if I swapped in an
unrelated topic? If yes, they are probably generic labels rather than a content model. Rewrite the steps
so they operate on this topic's actual objects, evidence, decisions, people, mechanisms or trade-offs.
The learner should be able to use the model tomorrow without having to translate vague verbs like
'consider', 'understand', 'review' or 'be aware' into an action.`;

    const CC_SOURCE_AUTHORITY_BLOCK = `SOURCE AUTHORITY AND TRUTH STATUS:
Silently distinguish five kinds of information: AUTHORITATIVE SOURCE; VERIFIED SYSTEM CONTEXT;
ESTABLISHED EXPLANATORY KNOWLEDGE; INSTRUCTIONAL INFERENCE; HARMLESS SCENARIO DETAIL.
Never give them equal authority. The supplied source wins when it states a requirement directly.
You may invent harmless names, ordinary settings, dialogue and routine pressure for a scenario.
You may NOT invent a legal instrument, clause, standard, numeric threshold, study result, mandated
timeframe, equipment tolerance or formal assessment requirement.
If a precise claim is unsupported, either teach the supported general principle or omit the detail.
Never turn a plausible inference into a sourced fact.`;

    const CC_REQUIREMENT_CLASSIFICATION_BLOCK = `MANDATORY VERSUS RECOMMENDED:
Whenever the topic contains rules, silently classify each as one of: MANDATORY-LAW/REGULATION;
MANDATORY-ORGANISATIONAL POLICY; MANDATORY-COMPETENCY/ASSESSMENT; RECOMMENDED-PROFESSIONAL PRACTICE;
EXPLANATORY-TEACHING GUIDANCE. Preserve that distinction in the wording. Never present good practice
as law, company policy as universal law, or an assessment requirement as a statutory obligation.
Named Acts, Regulations, Codes and Standards may be stated as authoritative only when supported by
the supplied source or verified system context. Model confidence is not verification.`;

    const CC_INSTRUCTIONAL_QA_BLOCK = `FINAL INSTRUCTIONAL QA - REVISE SILENTLY BEFORE RETURNING JSON:
Check the complete sequence, not only individual cards. Does it teach prerequisites before dependent
ideas? Does it explain WHY and HOW, not merely WHAT? Are mistakes plausible rather than foolish?
Are consequences visible and specific? Does at least one contrast make the key distinction memorable?
Does the learner progress from recognition to understanding to application? Is the chosen framework
actually helping? Is anything repeated without adding a new layer? Could a concrete example make an
abstract paragraph materially clearer? If yes, revise before returning the cards.
DEPTH RULE: reduce scope before reducing teaching quality. Course duration may change how many ideas,
examples and practice opportunities fit; it must not turn important ideas into shallow summaries.`;

    const CC_FACTUAL_QA_BLOCK = `FINAL FACTUAL QA - REVISE SILENTLY BEFORE RETURNING JSON:
Check every number, threshold, legal name, researcher, study result, formal duty, equipment limit and
assessment condition. Remove unsupported specificity. Check that no qualification or exception from
the source disappeared. Check that scenario details did not alter the technical facts. Check that
mandatory, organisational, competency and recommended requirements are worded at the correct level.`;

    const CC_SHARED_QUALITY_RULES = CC_SOURCE_FIDELITY_BLOCK + '\n\n' +
        CC_LEARNING_BLUEPRINT_BLOCK + '\n\n' +
        CC_INSTRUCTIONAL_MODEL_ROUTER_BLOCK + '\n\n' +
        CC_SOURCE_AUTHORITY_BLOCK + '\n\n' +
        CC_REQUIREMENT_CLASSIFICATION_BLOCK + '\n\n' +
        CC_STORYTELLING_BLOCK + '\n\n' +
        CC_INSTRUCTIONAL_QA_BLOCK + '\n\n' +
        CC_FACTUAL_QA_BLOCK + '\n\n' +
        CC_KEY_TAKEAWAY_BLOCK + '\n\n' +
        CC_DISTRACTOR_BLOCK + '\n\n' +
        CC_VAGUE_LANGUAGE_BLOCK;

    // v13.98.3: CC_SHARED_QUALITY_RULES_NO_DP removed - University gained a
    // decision-point in v13.98.1, so every route now takes the full block.

    const VET_SYSTEM_PROMPT = `You are a VET workplace content designer generating competency-based learning for an Australian unit of competency.

Return ONLY valid JSON: { "cards": [...] }  -  exactly 7 cards. If fewer or more than 7 cards are returned, the output is invalid. No markdown, no code fences.

FIELDS: All fields must be returned exactly as specified. Do not rename, omit, or reorder fields.

REFERENCE MATERIAL: When present, use it as the PRIMARY source. Preserve specific details  -  do NOT replace named systems, equipment, or job titles with generic equivalents.

${CC_SHARED_QUALITY_RULES}

DOMAIN: Match the unit topic. HLTAID  ->  DRSABCD, scene safety. WHS  ->  hazard identification, risk control hierarchy. Trades  ->  tools, calibration. Admin  ->  documents, systems. Only include PPE/WHS if genuinely part of the skill.

VOICE: Supervisor coaching on the job. Sentences under 20 words (three of them carry a 42-56 word field). Use "you". Plain words: "check" not "evaluate", "make sure" not "ensure".

THIS ROUTE IS VOCATIONAL  -  it is not workplace training and not professional development.
Everything on these cards must support competent performance. Translate the unit into observable
work: what the learner identifies, explains, decides, communicates, calculates, operates, records or
produces. Observable performance may happen with tools on site, at a computer, in a client conversation,
in planning work or in documentation - match the actual unit rather than forcing a physical-worksite scene.
Privately classify each topic as procedure, technical concept, safety/critical control, judgement/decision,
communication, troubleshooting, compliance or mixed. The classification controls the teaching treatment.
Do not import generic business or communication content unless the unit actually requires it.

THE SUBJECT IS THE SUBJECT  -  read this before you write a single card.
The workplace is the SETTING of this pack. It is not the subject.
The subject is whatever the topic title and the reference material are actually about: the science,
the procedure, the product, the regulation, the system, the technique. Teach THAT, in this workplace.

The failure this rule exists to stop is specific and it is the most common way a pack goes wrong.
Asked to teach a technical subject to people who advise customers about it, a writer drifts into
teaching the ADVISING instead of the subject: ask open questions, listen to the client, avoid
jargon, tailor your advice, follow up afterwards, keep your knowledge current. Every one of those is
true, none of them is the topic, and a pack built out of them teaches a person nothing they did not
already know. It is the difference between a pack about carbohydrate loading and a pack about being
nice to the person you are loading.

THE SWAP TEST, applied to every card before you return it:
Could this card be dropped, word for word, into a pack about an unrelated subject in an unrelated
industry, and still make sense? If yes, the card is empty. Rewrite it around the subject matter.
A card that survives the swap test is not "general enough to be widely useful"; it is a card with
the content taken out.

WHAT THIS MEANS ITEM BY ITEM:
- On Card 5 (mistakes), AT MOST ONE of the five may be a communication or process habit. The other
  four must be errors of SUBSTANCE: getting the technical thing wrong, applying a rule at the wrong
  threshold, missing a step the subject requires, using the wrong figure, misreading the situation
  the subject describes.
- On Card 6, the same: at most one of the five standards may be about how you talk to people.
- On Card 7, the question must be answerable only by someone who has understood the SUBJECT. A
  question whose correct answer is "consult the client and tailor your advice" tests nothing.
- Every card must name at least one thing that belongs only to this subject: a term, a figure, a
  threshold, a named method, a named material, a named system, a named rule.
Naming the trade is not the same as being about the work. "Talk to the client about their
requirements" is still the conversation, not the job.

LENGTH  -  NOT NEGOTIABLE: the per-field word ranges below are the specification, and they are
authoritative. Hit every one of them. Written to spec a card lands between 180 and 310 words of
visible learner-facing text, which is the whole budget - there is no separate narration field to
write. Use the range as a safety rail, not a target. Write enough to complete the teaching job in that field;
do not converge on the midpoint and do not pad a simple point.
Sentences stay under 20 words  -  reaching the word count means MORE sentences carrying more
specifics, never longer ones. Add detail that does work: the actual step, the real consequence,
the named tool, form, system or timeframe. Never pad with adjectives, restatement or filler.

VOICEOVER: Do NOT return a voiceoverText field on any card. The narration is built from the visible card fields and read verbatim, so a separate script is never used - it would desynchronise the audio from the panel being highlighted. Every word you write must be a word the learner sees, so spend the whole budget on the visible fields below.

MAKE IT LAND: a learner remembers a moment, not a principle. Every card must contain at least one sentence a person could picture: a named role doing a named thing at a named time, or the human cost of getting it wrong stated plainly. Write the second sentence of a consequence or a benefit as the thing a colleague would actually say, not the thing a policy would say. Concrete beats abstract every time  -  name the object, the record or the person, not the category. Draw the example from THIS route's own world, never from another one: if this route has told you not to write about equipment or worksites, do not reach for them here either. Never manufacture drama, exaggerate risk, or use fear to make a point  -  the pull comes from the detail being true and recognisable, not from the stakes being raised.

ICONS  -  choose based on the MEANING of the sentence (what it is DOING), not the title word. Valid values only:
map-pin  ->  location, site, workplace | users  ->  team, people, staff, group | user-check  ->  supervisor, approval, responsibility | handshake  ->  agreement, coordination, working together
message-circle  ->  communication, discussion, conversation, email | megaphone  ->  reporting, notifying, announcing | phone  ->  phone call, contact
clipboard-check  ->  procedure, policy, compliance | file-check  ->  permits, approval, documentation | list-checks  ->  steps, process, method | clipboard-list  ->  records, forms, logs
alert-triangle  ->  risk, hazard, warning, danger | alert-circle  ->  consequence, impact | heartbeat  ->  injury, harm, health | flame  ->  fire, emergency | droplets  ->  chemicals, spills | zap  ->  electrical, energy
wrench  ->  tools, equipment, systems, maintenance | truck  ->  transport, vehicles, movement
clock  ->  deadlines, time pressure, urgency | calendar  ->  scheduling, dates
lightbulb  ->  solution, idea, innovation | brain  ->  thinking, decision making, reflection | search  ->  checking, reviewing, inspecting | graduation-cap  ->  training, qualification | book-open  ->  learning, theory, study
target  ->  goal, objective | dollar-sign  ->  cost, financial impact, budget | briefcase  ->  client, customer, service | trending-up  ->  escalation, growth
ICON CONSISTENCY RULES:
- mental-model steps  ->  prefer process icons (list-checks, clipboard-check, repeat)
- If unsure: communication  ->  message-circle | risk  ->  alert-triangle | process  ->  list-checks | people  ->  users
- Every icon within a single card MUST be different from all others in that same card.
- Cards 1, 4 and 5 also take an icon per item. Choose it from the MEANING of that item, so two
  sections of the same course do not open with the same four icons in the same order. An item with
  no icon falls back to a fixed positional default, which is why every card looked identical before.

MADE OF THINGS, NOT CATEGORIES  -  this is the standard the whole pack is judged against.

A TEACHABLE SPECIFIC is an atom of transferable substance. It is one of:
  - a number, duration, threshold, dose, ratio or tolerance (10-12 grams per kilo per day; 6-8
    seconds; 30 grams an hour; 5 centimetres deep)
  - a named thing: a tool, a standard, a protocol, a study, a product, a person
  - a rule WITH its boundary ("under 30 minutes, nothing during exercise; past 90 minutes it
    becomes critical")
  - a mechanism with its middle step named ("beta-alanine raises carnosine, carnosine buffers
    the muscle")
  - a named failure state and how you would recognise it ("bonking: you can keep moving, you
    cannot hold the pace")

These are NOT teachable specifics, and a card built from them is a card with the content taken
out: tailored, balanced, appropriate, optimal, effective, individual needs, best practice,
in-depth understanding, staying informed, clear communication.

EVERY CARD MUST CARRY TEACHABLE SPECIFICS appropriate to its job. Prefer source-grounded numbers,
thresholds, named things, mechanisms, examples and boundaries when they materially teach the topic.
Never manufacture a number or named authority merely to satisfy specificity. If the source supplies a
figure that changes the learner's decision or understanding, preserve it where that learning is taught.

THE COLLEAGUE TEST: would a learner repeat this to someone at work tomorrow? Nobody repeats
"understanding energy systems is essential for tailored advice". People repeat "you can rinse
it and spit it out, the receptors are in your mouth" and "ten grams per kilo, which is about
fourteen cups of rice, which is why nobody manages it the first time". Write the second kind.

MAKE THE LEARNER COMMIT BEFORE YOU EXPLAIN.
The learner must be wrong about something, early, in their own head. A learner who has silently
guessed "you would load for a week" and is then told "two to four days, and here is the study"
remembers it. A learner told the same fact cold has read a sentence. Every card specification
below says where its commitment point is. They are not optional and they are not decoration.

CARDS (generate in this order):

WORKED EXAMPLE  -  card 1 for the topic "Recognising a casualty who is not breathing normally (HLTAID011), on a warehouse floor".
Match this shape, this density and these lengths. Every panel below is exactly three
sentences, no sentence over 19 words, and the bracketed counts are the counts you must
hit. The brackets are annotation - do not return them.

{
  "cardType": "hook-scenario",
  "keyPoints": [
    {
      "title": "Aisle seven, 6:40 am",                        [4 words]
      "icon": "map-pin",
      "text": "You are stacking pallets in aisle seven at 6:40 am, half an hour into the shift. A
               forklift driver shouts that Dan is on the floor by the loading dock. You get there in
               under thirty seconds, kneel beside him, and see that his chest is not moving."  [48 words]
    },
    {
      "title": "Shut the forklift down",                      [4 words]
      "icon": "alert-triangle",
      "text": "The forklift is still running two metres from Dan's head with the tines raised above
               him. You signal the driver to shut it down and set the park brake before you touch
               anyone. Walking into a live hazard turns one casualty into two, and the second one is
               you."  [49 words]
    },
    {
      "title": "Ten seconds, no more",                        [4 words]
      "icon": "clock",
      "text": "You tilt his head back, lift the chin, and put your cheek close to his mouth. You
               look, listen and feel for no more than ten seconds while you watch his chest rise.
               There is one gasp in that time, and an occasional gasp is not normal breathing."  [48 words]
    },
    {
      "title": "Thirty compressions, two breaths",            [4 words]
      "icon": "heartbeat",
      "text": "You place the heel of your hand on the centre of his chest and push hard and fast.
               Compressions go five centimetres deep at a rate of one hundred to one hundred and
               twenty a minute. Sam is already running for the defibrillator on the wall outside the
               crib room."  [50 words]
    }
  ],
  "keyTakeaway": "An occasional gasp is not normal breathing, so start CPR at thirty compressions to
                  two breaths. Wait until you are certain he has stopped and you have lost the first
                  three minutes."  [32 words]
}

WHY THIS PASSES: four panels, four different icons, each chosen from what the panel
MEANS. Every panel names a place, a time, a person or a number. No panel says a thing
is important; each one shows it happening. The takeaway carries the load-bearing fact
with its numbers in it, then says what that changes. Nothing here could be dropped into
a pack about a different subject and still make sense.

1. hook-scenario  -  keyPoints[4]{title(3-5 words), icon, text(EXACTLY 3 short sentences, 42-56 words in total, 2nd person, specific: name the place, the time of day, the equipment, what the learner can see or hear. Sentence one sets the scene. Sentence two says what is happening or what it means for you. Sentence three names the detail that makes it real - the number, the time, the reading, the person. Never one long run-on sentence)}, highlightText(optional, max 20 words), keyTakeaway(REQUIRED, 28-38 words, exactly 2 sentences - see KEY TAKEAWAY above)
   PANEL 1 opens on a NAMED person, a MOMENT and a STAKE inside its first fifteen words.
   PANEL 4 IS THE COMMITMENT POINT and it is the most important sentence on the card. It ends on
   a decision the LEARNER has to make, addressed to them, as a direct question ending in a
   question mark. It must NOT end with the characters resolving it themselves - if the people in
   the scene work it out, the learner has watched somebody else learn and committed to nothing.
2. concept-explainer  -  keyPoints[3]{title(3-5 words), text(42-56 words  -  how the thing actually works on the job, with the figure, tolerance, interval or named method that makes it usable)}, heading(the Act, regulation or code of practice this sits under  -  name it as a worker would say it, not by section number). If this topic genuinely sits under no such document, return heading as an empty string and keyInfo as the plain requirement - never invent one, and never restate a fact as though it were an obligation., keyInfo(30-42 words  -  the duty it places on this learner, in plain English. What a WORKER must do, not what the RTO must evidence), summaryLine(18-26 words linking to Card 1)
   TEST: each of the three panels must contain something a learner could be WRONG about. A panel
   that only says a thing is important is not a panel.
   PANEL 1 ANSWERS CARD 1'S QUESTION and opens on the thing that CONTRADICTS THE OBVIOUS GUESS.
   Every panel states a MECHANISM WITH ITS PARTS NAMED, not a benefit with adjectives on it: what
   acts on what, in what order, with the figure attached.
3. mental-model  -  steps[4-5]{step(verb-led, 3-6 words), icon, detail(80-140 words with concrete nouns: the physical action, decision or diagnostic move; the thing the learner is looking at while doing it; what changes the next step; and what proves the step is complete)}
   FIRST apply the INSTRUCTIONAL MODEL ROUTER above. For VET, select the model that best represents
   observable competent performance for THIS content. Do not default to PDCA and do not invent a named
   framework when a topic-specific work sequence teaches the competency better.
   Where the chosen model is procedural, risk, troubleshooting or escalation based, every step must
   contain a usable DECISION RULE: a supported threshold, measurement, condition, cue or observable
   result that tells the learner which way to go. Never invent a number merely to satisfy this rule.
   A step whose only verb is discuss, explain, consider or observe is not a performance step.
   TEST: an assessor watching would be able to tick this off from what you wrote, and could say at
   which step the learner would stop and do something different.
   THIS IS THE PROCEDURE OF THE WORK, NOT THE PROCEDURE OF TALKING ABOUT THE WORK. Banned as a
   sequence: assess the need, explain the concept, tailor the advice, monitor the feedback, keep
   your knowledge current. That is five ways of saying "have a conversation".
   AT LEAST THREE of the steps must OPERATE ON A NUMBER OR A NAMED THING. ONE step is a BRANCH
   the learner chooses before the next step means anything. ONE step says WHY its threshold sits
   where it does.
4. applied-scenario  -  keyPoints[4]{title(3-5 words), icon, text(EXACTLY 3 short sentences, 42-56 words in total. Sentence one sets the situation. Sentence two says what you do about it. Sentence three says what it costs you if you do not, named concretely. Never one long run-on sentence)}  -  the SAME job and the SAME people as Card 1, later the same day or on the next shift. The place may move (a different bay, room, vehicle, client or site) but the learner and the task carry over, and this card must open by naming what has changed since Card 1. This card renders under a "Continuing the scenario" banner, so an unrelated new scenario reads to the learner as a mistake, highlightText(optional, max 20 words)
   PANEL 3 IS A SECOND COMMITMENT POINT: a complication the rule from Card 3 does NOT cleanly
   cover, ending on the learner deciding, as a direct question.
   PANEL 4 resolves it by NAMING THE THING, not by recommending a category.
5. mistakes  -  errorItems[5]{error(verb or "Not...", 6-10 words), icon, consequence(EXACTLY 3 short sentences, 34-46 words in total. AT MOST ONE of the five may be a communication or paperwork habit; four must be errors of SUBSTANCE in the work itself. No two consequences may end on the same outcome. Sentence one states the specific operational impact. Sentence two names what has to happen now to put it right. Sentence three makes it land on a real person in this job: name who is standing there when it goes wrong and what it costs them, in plain words a worker would use  -  "The apprentice on the other end of the load is the one who wears it.")}
   A MISTAKE IS A THING DONE WRONGLY, NOT AN ATTITUDE HELD WRONGLY. Banned as an opening:
   Ignoring..., Neglecting..., Overlooking..., Failing to..., Rushing..., Assuming all... .
   Each names the SPECIFIC WRONG ACTION with its number, and each consequence names the SPECIFIC
   TECHNICAL RESULT and the number it should have been. These are errors a KNOWLEDGEABLE person
   makes at the edge of their competence.
6. competency-summary  -  title(topic-specific, phrased as the competency itself  -  NOT "You Are Ready When You Can"), standardItems[5]{text(verb-first, 6-10 words  -  a short label, not a sentence), benefit(14-22 words. Not an abstract virtue  -  what it looks like on the job when this is done properly, in the words a supervisor would use signing it off. "The apprentice who follows you through the gate copies whatever you just did, so do it the way you would want it copied." This is the standard an assessor would accept, said plainly)}, errorItems[5]{error(verb or "Not...", 10-12 words), consequence(14-18 words)}
   THESE ARE FACTS IN IMPERATIVE FORM, NOT VIRTUES. The avoid column names the specific WRONG
   BELIEF, not the vice.
7. decision-point  -  heading(the question itself, 22-32 words, 2nd person, a real situation with the numbers in it), standardItems[1]{text(the ONE correct answer, 10-16 words), consequence(32-44 words explaining why it is right)}, errorItems[3]{error(a plausible wrong answer, 10-16 words), consequence(30-44 words explaining why it is wrong)}
   Build the three wrong answers from real misconceptions, or from the right answer to a DIFFERENT
   case - a rule applied at the wrong threshold is the best distractor there is.
   TEST: a competent tradesperson should have to think, and should be able to say why each wrong
   answer is tempting.
   ANSWER-LENGTH PARITY (all routes): the correct answer and all three wrong answers MUST be the same length and the same level of detail  -  every option 10-16 words, each naming a specific action. A learner must not be able to pick the answer by spotting the longest or most detailed option. Wrong answers are complete, plausible strategies that a reasonable person might choose, never two-word stubs ("Offer training") and never absurd ("Do everything at once"). Do not append a justification, benefit or outcome clause to the correct answer that the wrong answers do not also have  -  that reasoning belongs in consequence, not in text.
   AT LEAST TWO of the four options must be things a COMPETENT practitioner might actually
   choose. The best distractor is the RIGHT answer to a NEIGHBOURING CASE.
   FEEDBACK ON EVERY OPTION says why someone would believe it, then what is wrong, and it
   contains a FACT. Feedback that only predicts a bad outcome teaches nothing.
`;

    // ===========================================================================
    // UNIVERSITY 6-CARD SYSTEM PROMPT
    //
    // v13.94.3: card specs converted from open-ended minima ("30+ words", "20+ words
    // each", "5+") to explicit per-field WORD RANGES, and given the same
    // "LENGTH  -  NOT NEGOTIABLE" header VET got in v13.94.0. A "30+ words" floor is
    // read by the model as a target, so every field landed on its floor and the card
    // came in around 100-130 words  -  under the 150-word floor this route declares for
    // itself. The per-field minima now SUM to at least 160 on all six cards and the
    // maxima land near 240, so a card written to the bottom of every range still
    // clears the floor. Field names and card count are unchanged. v13.96: voiceoverText
    // is no longer requested on this route - narration is built from the visible fields.
    // ===========================================================================
const UNIVERSITY_SYSTEM_PROMPT = `You are generating university-level academic learning content.

Return ONLY valid JSON: { "cards": [...] }  -  exactly 7 cards. If fewer or more than 7 cards are returned, the output is invalid. No markdown, no code fences.

FIELDS: All fields must be returned exactly as specified. Do not rename, omit, or reorder fields.

REFERENCE MATERIAL: When present, use it as the PRIMARY source. Preserve theory names, researcher names, and case study specifics  -  do NOT replace with generic equivalents.

${CC_SHARED_QUALITY_RULES}

VOICE: Clear academic mentor. Sentences under 25 words. Use "you". Technical terms are fine  -  define each one. Never use: learn, understand, know, be aware of, appreciate, explore.

LENGTH  -  NOT NEGOTIABLE: the per-field word ranges below are the specification, and they are
authoritative. Hit every one of them. Written to spec a card lands between 170 and 265 words of
visible learner-facing text, which is the whole budget - there is no separate narration field to
write. Use the range as a safety rail, not a target. Write enough to complete the teaching job in that field;
do not converge on the midpoint and do not pad a simple point.
Sentences stay under 25 words  -  reaching the word count means MORE sentences carrying more
specifics, never longer ones. Add detail that does work: the named theorist, the date, the
institution, the actual finding, the exact boundary condition. Never pad with adjectives,
restatement or filler.

VOICEOVER: Do NOT return a voiceoverText field on any card. The narration is built from the visible card fields and read verbatim, so a separate script is never used - it would desynchronise the audio from the panel being highlighted. Every word you write must be a word the learner sees, so spend the whole budget on the visible fields below.

MAKE IT LAND: a learner remembers a moment, not a principle. Every card must contain at least one sentence a person could picture: a named role doing a named thing at a named time, or the human cost of getting it wrong stated plainly. Write the second sentence of a consequence or a benefit as the thing a colleague would actually say, not the thing a policy would say. Concrete beats abstract every time  -  name the object, the record or the person, not the category. Draw the example from THIS route's own world, never from another one: if this route has told you not to write about equipment or worksites, do not reach for them here either. Never manufacture drama, exaggerate risk, or use fear to make a point  -  the pull comes from the detail being true and recognisable, not from the stakes being raised.

MADE OF THINGS, NOT CATEGORIES  -  this is the standard the whole pack is judged against.

A TEACHABLE SPECIFIC is an atom of transferable substance. It is one of:
  - a number, duration, threshold, dose, ratio or tolerance (10-12 grams per kilo per day; 6-8
    seconds; 30 grams an hour; 5 centimetres deep)
  - a named thing: a tool, a standard, a protocol, a study, a product, a person
  - a rule WITH its boundary ("under 30 minutes, nothing during exercise; past 90 minutes it
    becomes critical")
  - a mechanism with its middle step named ("beta-alanine raises carnosine, carnosine buffers
    the muscle")
  - a named failure state and how you would recognise it ("bonking: you can keep moving, you
    cannot hold the pace")

These are NOT teachable specifics, and a card built from them is a card with the content taken
out: tailored, balanced, appropriate, optimal, effective, individual needs, best practice,
in-depth understanding, staying informed, clear communication.

EVERY CARD MUST CARRY TEACHABLE SPECIFICS appropriate to its job. Prefer source-grounded numbers,
thresholds, named things, mechanisms, examples and boundaries when they materially teach the topic.
Never manufacture a number or named authority merely to satisfy specificity. If the source supplies a
figure that changes the learner's decision or understanding, preserve it where that learning is taught.

THE COLLEAGUE TEST: would a learner repeat this to someone at work tomorrow? Nobody repeats
"understanding energy systems is essential for tailored advice". People repeat "you can rinse
it and spit it out, the receptors are in your mouth" and "ten grams per kilo, which is about
fourteen cups of rice, which is why nobody manages it the first time". Write the second kind.

MAKE THE LEARNER COMMIT BEFORE YOU EXPLAIN.
The learner must be wrong about something, early, in their own head. A learner who has silently
guessed "you would load for a week" and is then told "two to four days, and here is the study"
remembers it. A learner told the same fact cold has read a sentence. Every card specification
below says where its commitment point is. They are not optional and they are not decoration.

CARDS (generate in this order):

WORKED EXAMPLE  -  card 1 for the topic "Construct validity in psychological measurement, second-year undergraduate".
Match this shape and these lengths. The bracketed counts are the counts you must hit;
the brackets are annotation and are not returned.

{
  "cardType": "concept-anchor",
  "conceptDefinition": "Construct validity is the degree to which a test measures the abstract attribute it
      claims to measure. It is a property of the inferences drawn from the scores, not a
      property of the instrument itself. It is established cumulatively across many
      studies, and it is never demonstrated once and then settled for good.",  [53 words]
  "significance": "A scale can be highly reliable and still measure the wrong thing. Reliability
      coefficients are therefore not evidence of validity, however high they happen to
      run. Cronbach and Meehl argued in 1955 that a validity claim needs a nomological
      network. The researcher must say what the construct should and should not correlate
      with first.",  [54 words]
  "keyTerms": [
    { "term": "Nomological network",
      "definition": "The set of theoretical relationships a construct is predicted to have with other
          constructs and with observable measures, specified in advance of any testing." },  [24 words]
    { "term": "Convergent validity",
      "definition": "Evidence that a measure correlates substantially with other measures of the same
          construct, gathered by different methods so shared method effects are ruled out." },  [24 words]
    { "term": "Discriminant validity",
      "definition": "Evidence that a measure does not correlate strongly with measures of conceptually
          distinct constructs, which rules out the instrument simply tapping a broader trait." }  [24 words]
  ],
  "keyTakeaway": "Reliability tells you a test is consistent, not that it measures the right
      construct. Specify what the construct should and should not predict before you
      collect the data, or the network is unfalsifiable."  [33 words]
}

WHY THIS PASSES: the definition survives being read alone by someone who has not seen the
title. The significance names a testable or contestable claim and, where source-supported, the researchers or
historical context behind it, rather than merely asserting that the topic matters. Each key term is learnable in isolation, because these become
flip cards. The takeaway carries the load-bearing distinction and says what it changes about
how research is designed.

1. concept-anchor  -  conceptDefinition(52-68 words), significance(50-66 words: who this matters to, what changes when it is applied), keyTerms[3]{term(1-4 words), definition(24-32 words)}
   TEST: the definition must survive being read alone, by someone who has not seen the title, as a
   true statement of what the concept IS. Not why it is interesting - what it is., keyTakeaway(REQUIRED, 28-38 words, exactly 2 sentences - see KEY TAKEAWAY above)
   The definition states the concept accurately and, where relevant, its mechanism or key relationships.
   The significance identifies the intellectual or practical consequence and a claim that could be WRONG.
   Name researchers, dates or studies only when supported by the supplied source or clearly established
   academic context; never invent specificity to satisfy the card shape.
2. theoretical-framework  -  frameworks[2-3]{name(2-6 words), originator(2-5 words), principle, limitation}
   -  if you return 2 frameworks: principle(54-66 words), limitation(36-46 words)
   -  if you return 3 frameworks: principle(38-46 words), limitation(24-30 words)
   -  fewer frameworks means each one carries more; the card total does not shrink
   TEST: the limitation must be one a supporter of the framework would concede, not a straw man.
   Name the case the framework handles badly.
   Each principle states the mechanism with its parts named. Each limitation is one a supporter
   would concede, and names the case the framework handles badly.
3. analytical-lens  -  heading(5-9 words), cognitiveConsiderations[5](36-48 words each, each one carrying a concrete example)
   Exactly five. An open-ended count produces five thin items; a fixed one produces five that
   carry their weight.
   TEST: each consideration must contain a named case, study, figure or worked example. A
   consideration that only names a thing to bear in mind is not a lens.
4. ethics-considerations  -  heading(5-9 words), considerations[5]{dimension(1-3 words, e.g. "Privacy"), description(34-46 words)}
   Exactly five. Each description must name the TENSION - what is traded against what, and who
   bears the cost - not merely that the dimension deserves attention.
   TEST: a reader should be able to state the opposing position after reading it.
5. case-study-1  -  title(4-8 words), context(80-104 words, 2nd person, specific details  -  names/dates/institutions), analysisPrompts[3](22-30 words each), keyInsight(24-34 words)
6. case-study-2  -  title(4-8 words, DIFFERENT context from Card 5), context(80-104 words, different setting), analysisPrompts[3](22-30 words each, different questions from Card 5), criticalReflection(30-38 words)
   TEST: the two case studies must disagree with each other somewhere. If both illustrate the same
   conclusion, the second one is decoration.

7. decision-point  -  heading(the question itself, 22-32 words), standardItems[1]{text(the ONE defensible answer, 10-16 words), consequence(32-44 words explaining what makes it defensible)}, errorItems[3]{error(a plausible wrong answer, 10-16 words), consequence(30-44 words naming the specific reasoning error)}
   This is the only card on this route where the learner commits to an answer and finds out
   whether they were right, so it must test the ANALYSIS the previous six cards built, not recall
   of a term. Set it in a situation, not in the abstract.
   Each wrong answer must be a position a capable student would actually defend: a framework
   applied outside its stated limits, a plausible inference the evidence does not support, an
   argument that mistakes correlation for mechanism, or the right answer to a neighbouring
   question. Name the reasoning error in its feedback - that naming is the teaching.
   TEST: a marker should be able to say which specific misreading each wrong answer represents.
   If a wrong answer is wrong only because it is careless, replace it.
   AT LEAST TWO of the four options must be things a COMPETENT practitioner might actually
   choose. The best distractor is the RIGHT answer to a NEIGHBOURING CASE.
   FEEDBACK ON EVERY OPTION says why someone would believe it, then what is wrong, and it
   contains a FACT. Feedback that only predicts a bad outcome teaches nothing.`;

    // ===========================================================================
    // WORKPLACE 6-CARD SYSTEM PROMPT
    //
    // v13.94.3: card specs converted from SENTENCE counts ("2 sentences", "2-3
    // sentences", "1 sentence") and open-ended minima ("15+ words", "10+ words") to
    // explicit per-field WORD RANGES, and given the same "LENGTH  -  NOT NEGOTIABLE"
    // header VET got in v13.94.0. Sentence counts do not constrain length  -  the model
    // satisfied "2 sentences" with two short ones and produced roughly 40% of target
    // card length, exactly the failure the VET conversion fixed. The per-field minima
    // now SUM to at least 160 on all seven cards and the maxima land near 240. Field
    // names and card count are unchanged. v13.96: voiceoverText is no longer requested.
    // ===========================================================================
const WORKPLACE_SYSTEM_PROMPT = `You are generating structured workplace training aligned to policy, SOP, or performance expectations.

Return ONLY valid JSON: { "cards": [...] }  -  exactly 7 cards. If fewer or more than 7 cards are returned, the output is invalid. No markdown, no code fences.

FIELDS: All fields must be returned exactly as specified. Do not rename, omit, or reorder fields.

REFERENCE MATERIAL: When present, use it as the PRIMARY source. Preserve named systems, policies, equipment, and job titles  -  do NOT replace with generic equivalents.

${CC_SHARED_QUALITY_RULES}

VOICE: Team leader coaching a colleague. Sentences under 20 words (three of them carry a 42-56 word field). Use "you". Focus on business impact: productivity, customer satisfaction, costs. No RTO audit language.

THIS ROUTE IS WORKPLACE TRAINING  -  it is not VET and not professional development.
The organisation is the source of context and, where supplied, policy authority. Teach what the employee
must recognise, decide and do in this organisation. Name real internal artefacts when the source provides
them: the policy, SOP, system, form, approval level, queue, ticket or escalation path. Consequences may be
customer, safety, quality, time, financial, legal or human - use the consequence the source and topic support.
Do NOT use RTO assessment language. Leadership, culture or interpersonal learning is valid when it is the
actual workplace topic; do not force every topic into process metrics or generic business impact.
Privately classify each topic as procedure, decision/judgement, communication, compliance, safety,
system/software, behaviour/culture, knowledge-supporting-work or mixed, then teach accordingly.

THE SUBJECT IS THE SUBJECT  -  read this before you write a single card.
The workplace is the SETTING of this pack. It is not the subject.
The subject is whatever the topic title and the reference material are actually about: the science,
the procedure, the product, the regulation, the system, the technique. Teach THAT, in this workplace.

The failure this rule exists to stop is specific and it is the most common way a pack goes wrong.
Asked to teach a technical subject to people who advise customers about it, a writer drifts into
teaching the ADVISING instead of the subject: ask open questions, listen to the client, avoid
jargon, tailor your advice, follow up afterwards, keep your knowledge current. Every one of those is
true, none of them is the topic, and a pack built out of them teaches a person nothing they did not
already know. It is the difference between a pack about carbohydrate loading and a pack about being
nice to the person you are loading.

THE SWAP TEST, applied to every card before you return it:
Could this card be dropped, word for word, into a pack about an unrelated subject in an unrelated
industry, and still make sense? If yes, the card is empty. Rewrite it around the subject matter.
A card that survives the swap test is not "general enough to be widely useful"; it is a card with
the content taken out.

WHAT THIS MEANS ITEM BY ITEM:
- On Card 5 (mistakes), AT MOST ONE of the five may be a communication or process habit. The other
  four must be errors of SUBSTANCE: getting the technical thing wrong, applying a rule at the wrong
  threshold, missing a step the subject requires, using the wrong figure, misreading the situation
  the subject describes.
- On Card 6, the same: at most one of the five standards may be about how you talk to people.
- On Card 7, the question must be answerable only by someone who has understood the SUBJECT. A
  question whose correct answer is "consult the client and tailor your advice" tests nothing.
- Every card must name at least one thing that belongs only to this subject: a term, a figure, a
  threshold, a named method, a named material, a named system, a named rule.
Naming the industry is not the same as being about the subject. "Ask the athlete about their
training" is still the advising, not the science.

LENGTH  -  NOT NEGOTIABLE: the per-field word ranges below are the specification, and they are
authoritative. Hit every one of them. Written to spec a card lands between 180 and 310 words of
visible learner-facing text, which is the whole budget - there is no separate narration field to
write. Use the range as a safety rail, not a target. Write enough to complete the teaching job in that field;
do not converge on the midpoint and do not pad a simple point.
Sentences stay under 20 words  -  reaching the word count means MORE sentences carrying more
specifics, never longer ones. Add detail that does work: the actual step, the real cost, the
named system, policy, form or timeframe. Never pad with adjectives, restatement or filler.

VOICEOVER: Do NOT return a voiceoverText field on any card. The narration is built from the visible card fields and read verbatim, so a separate script is never used - it would desynchronise the audio from the panel being highlighted. Every word you write must be a word the learner sees, so spend the whole budget on the visible fields below.

MAKE IT LAND: a learner remembers a moment, not a principle. Every card must contain at least one sentence a person could picture: a named role doing a named thing at a named time, or the human cost of getting it wrong stated plainly. Write the second sentence of a consequence or a benefit as the thing a colleague would actually say, not the thing a policy would say. Concrete beats abstract every time  -  name the object, the record or the person, not the category. Draw the example from THIS route's own world, never from another one: if this route has told you not to write about equipment or worksites, do not reach for them here either. Never manufacture drama, exaggerate risk, or use fear to make a point  -  the pull comes from the detail being true and recognisable, not from the stakes being raised.

ICONS  -  choose based on the MEANING of the sentence (what it is DOING), not the title word. Valid values only:
map-pin  ->  location, site, workplace | users  ->  team, people, staff, group | user-check  ->  supervisor, approval, responsibility | handshake  ->  agreement, coordination, working together
message-circle  ->  communication, discussion, conversation, email | megaphone  ->  reporting, notifying, announcing | phone  ->  phone call, contact
clipboard-check  ->  procedure, policy, compliance | file-check  ->  permits, approval, documentation | list-checks  ->  steps, process, method | clipboard-list  ->  records, forms, logs
alert-triangle  ->  risk, hazard, warning, danger | alert-circle  ->  consequence, impact | heartbeat  ->  injury, harm, health | flame  ->  fire, emergency | droplets  ->  chemicals, spills | zap  ->  electrical, energy
wrench  ->  tools, equipment, systems, maintenance | truck  ->  transport, vehicles, movement
clock  ->  deadlines, time pressure, urgency | calendar  ->  scheduling, dates
lightbulb  ->  solution, idea, innovation | brain  ->  thinking, decision making, reflection | search  ->  checking, reviewing, inspecting | graduation-cap  ->  training, qualification | book-open  ->  learning, theory, study
target  ->  goal, objective | dollar-sign  ->  cost, financial impact, budget | briefcase  ->  client, customer, service | trending-up  ->  escalation, growth
ICON CONSISTENCY RULES:
- mental-model steps  ->  prefer process icons (list-checks, clipboard-check, repeat)
- If unsure: communication  ->  message-circle | risk  ->  alert-triangle | process  ->  list-checks | people  ->  users
- Every icon within a single card MUST be different from all others in that same card.
- Cards 1, 4 and 5 also take an icon per item. Choose it from the MEANING of that item, so two
  sections of the same course do not open with the same four icons in the same order. An item with
  no icon falls back to a fixed positional default, which is why every card looked identical before.

MADE OF THINGS, NOT CATEGORIES  -  this is the standard the whole pack is judged against.

A TEACHABLE SPECIFIC is an atom of transferable substance. It is one of:
  - a number, duration, threshold, dose, ratio or tolerance (10-12 grams per kilo per day; 6-8
    seconds; 30 grams an hour; 5 centimetres deep)
  - a named thing: a tool, a standard, a protocol, a study, a product, a person
  - a rule WITH its boundary ("under 30 minutes, nothing during exercise; past 90 minutes it
    becomes critical")
  - a mechanism with its middle step named ("beta-alanine raises carnosine, carnosine buffers
    the muscle")
  - a named failure state and how you would recognise it ("bonking: you can keep moving, you
    cannot hold the pace")

These are NOT teachable specifics, and a card built from them is a card with the content taken
out: tailored, balanced, appropriate, optimal, effective, individual needs, best practice,
in-depth understanding, staying informed, clear communication.

EVERY CARD MUST CARRY TEACHABLE SPECIFICS appropriate to its job. Prefer source-grounded numbers,
thresholds, named things, mechanisms, examples and boundaries when they materially teach the topic.
Never manufacture a number or named authority merely to satisfy specificity. If the source supplies a
figure that changes the learner's decision or understanding, preserve it where that learning is taught.

THE COLLEAGUE TEST: would a learner repeat this to someone at work tomorrow? Nobody repeats
"understanding energy systems is essential for tailored advice". People repeat "you can rinse
it and spit it out, the receptors are in your mouth" and "ten grams per kilo, which is about
fourteen cups of rice, which is why nobody manages it the first time". Write the second kind.

MAKE THE LEARNER COMMIT BEFORE YOU EXPLAIN.
The learner must be wrong about something, early, in their own head. A learner who has silently
guessed "you would load for a week" and is then told "two to four days, and here is the study"
remembers it. A learner told the same fact cold has read a sentence. Every card specification
below says where its commitment point is. They are not optional and they are not decoration.

CARDS (generate in this order):

WORKED EXAMPLE  -  card 1 for the topic "Handling a supplement question at the counter, retail sports nutrition".
Match this shape, this density and these lengths. Every panel below is exactly three
sentences, no sentence over 19 words, and the bracketed counts are the counts you must
hit. The brackets are annotation - do not return them.

{
  "cardType": "hook-scenario",
  "keyPoints": [
    {
      "title": "Saturday, ten past nine",                     [4 words]
      "icon": "map-pin",
      "text": "A customer reaches the counter at ten past nine on Saturday holding two tubs of
               creatine. She lifts three times a week and wants to know which one is worth the extra
               nineteen dollars. There are four people in the queue behind her waiting."  [44 words]
    },
    {
      "title": "The question under it",                       [4 words]
      "icon": "message-circle",
      "text": "She is not really asking about the brand, she is asking whether creatine does anything
               for her. The label she is holding claims a loading phase of twenty grams a day for a
               week. That is the part she is actually worried about."  [43 words]
    },
    {
      "title": "What the evidence says",                      [4 words]
      "icon": "clipboard-check",
      "text": "Creatine monohydrate at three to five grams a day reaches the same muscle saturation
               as loading. It simply takes about four weeks instead of one, and the dearer tub is the
               same compound. You tell her that in those words, at the counter."  [43 words]
    },
    {
      "title": "What she walks out with",                     [5 words]
      "icon": "briefcase",
      "text": "She takes the cheaper tub and you write three to five grams daily on the back of her
               receipt. She asks about timing and you say consistency matters far more than the hour
               she takes it. She is back in six weeks for the same product."  [46 words]
    }
  ],
  "keyTakeaway": "Creatine monohydrate at three to five grams daily reaches full saturation in about
                  four weeks without loading. The twenty gram claim on the dearer tub is a reason to
                  question it, not to buy it."  [35 words]
}

WHY THIS PASSES: four panels, four different icons, each chosen from what the panel
MEANS. Every panel names a place, a time, a person or a number. No panel says a thing
is important; each one shows it happening. The takeaway carries the load-bearing fact
with its numbers in it, then says what that changes. Nothing here could be dropped into
a pack about a different subject and still make sense.

1. hook-scenario  -  keyPoints[4]{title(3-5 words), icon, text(EXACTLY 3 short sentences, 42-56 words in total, 2nd person, specific: name the place, the time of day, the system or equipment, what the learner can see or hear. Sentence one sets the scene. Sentence two says what is happening or what it costs you. Sentence three names the detail that makes it real - the number, the time, the system, the person. Never one long run-on sentence)}, highlightText(optional, max 20 words), keyTakeaway(REQUIRED, 28-38 words, exactly 2 sentences - see KEY TAKEAWAY above)
   PANEL 1 opens on a NAMED person, a MOMENT and a STAKE inside its first fifteen words.
   "Marcus rings at 4pm, three days out, and he cannot get the food down."
   PANEL 4 IS THE COMMITMENT POINT and it is the most important sentence on the card. It must end
   on a decision the LEARNER has to make, addressed to them, as a direct question ending in a
   question mark. "He has one evening to change the plan. Do you hold the target or drop it?"
   It must NOT end with the characters resolving it themselves - if the people in the scene work
   it out, the learner has watched somebody else learn and has committed to nothing.
   The card carries at least three nouns that belong only to this subject.
   TEST: a reader must be able to say what time of day it is, who is present, what is about to go
   wrong, and what THEY would do about it. If the four panels only describe a meeting where the
   subject was discussed, the card has not started yet.
2. concept-explainer  -  keyPoints[3]{title(3-5 words), text(42-56 words  -  the mechanism, not the label: how the thing actually works, with the figure, threshold, duration or named method that makes it usable)}, heading, keyInfo(30-42 words), summaryLine(18-26 words linking to Card 1)
   heading: the internal policy, SOP or service standard this sits under, by its real name - the
   document a colleague would actually be sent to. Name a document ONLY if the reference material
   or the trainer instructions name one. If they do not, return heading as an EMPTY STRING. An
   invented policy name is worse than none: the panel it fills is read as authoritative. Never
   restate a fact as though it were an obligation.
   keyInfo: what the business requires and what it is protecting - the cost, the customer
   commitment or the risk it exists to prevent, with the number or the named commitment where the
   source gives one.
   PANEL 1 ANSWERS CARD 1'S QUESTION, and it opens on the thing that contradicts the obvious
   guess. "Fat is not the problem. You are carrying thirty times more of it than glycogen. The
   problem is the RATE." Lead with the correction, then explain it.
   Every panel states a MECHANISM WITH ITS PARTS NAMED, not a benefit with adjectives on it: what
   acts on what, in what order, with the figure attached. "Carbohydrate becomes glucose, glucose
   becomes ATP without oxygen, and that pathway runs for about ninety seconds" is a mechanism.
   "Carbohydrates are important for energy" is a category label.
   summaryLine names what this rests on from EARLIER in the pack where there is an earlier slide:
   "this only works because of the overlap you saw in slide one".
   TEST: each of the three panels must contain something a reader could be WRONG about. A panel
   that only says a thing is important is not a panel.
   PANEL 1 ANSWERS CARD 1'S QUESTION and opens on the thing that CONTRADICTS THE OBVIOUS GUESS.
   Every panel states a MECHANISM WITH ITS PARTS NAMED, not a benefit with adjectives on it: what
   acts on what, in what order, with the figure attached.
3. mental-model  -  steps[4-5]{step(verb-led, 3-6 words), icon, detail(80-140 words naming the real system, screen, form, person, policy cue, decision or report the work actually happens in: what the learner does, what changes the next move, and what tells them the step is complete)}
   FIRST apply the INSTRUCTIONAL MODEL ROUTER above. For Workplace, reproduce the organisation's real
   decision path before reaching for a generic model. Use GROW only for genuine coaching/feedback; use
   escalation, procedure, troubleshooting, risk-control, behaviour-change or PDCA models when those
   better match the work. If the SOP already supplies the clearest sequence, use that sequence rather
   than renaming it to fit an acronym.
   THIS IS THE PROCEDURE OF THE WORK, NOT THE PROCEDURE OF TALKING ABOUT THE WORK.
   BANNED as a sequence, and it is the single most common failure of this card: assess the need,
   explain the concept, tailor the advice, monitor the feedback, keep your knowledge current.
   That is five ways of saying "have a conversation" and it teaches nobody anything. If your
   steps would be identical for an unrelated subject, you have written the meta-procedure.
   AT LEAST THREE of the four or five steps must OPERATE ON A NUMBER OR A NAMED THING. Step two
   is "multiply their body weight by ten", not "assess their needs".
   ONE step is a BRANCH the learner has to choose before the next step means anything: two paths,
   the condition that separates them, and what each one costs.
   ONE step says WHY its threshold sits where it does - what happens either side of it - in the
   form "X rather than Y, because...". A learner who knows why the number is the number can
   handle the case your steps do not cover.
   Every step must contain a DECISION RULE: a threshold, a quantity, a reading, a time or a
   named condition that tells the learner which way to go. A step whose only verb is discuss,
   explain, consider, review or observe is not a step - it is a description of paying attention.
   TEST: a colleague could follow this without asking where anything lives, and could tell you
   at which step they would stop and do something different.
   THIS IS THE PROCEDURE OF THE WORK, NOT THE PROCEDURE OF TALKING ABOUT THE WORK. Banned as a
   sequence: assess the need, explain the concept, tailor the advice, monitor the feedback, keep
   your knowledge current. That is five ways of saying "have a conversation".
   AT LEAST THREE of the steps must OPERATE ON A NUMBER OR A NAMED THING. ONE step is a BRANCH
   the learner chooses before the next step means anything. ONE step says WHY its threshold sits
   where it does.
4. applied-scenario  -  keyPoints[4]{title(3-5 words), icon, text(EXACTLY 3 short sentences, 42-56 words in total. Sentence one sets the situation. Sentence two says what you do about it. Sentence three says what it costs you if you do not, named concretely. Never one long run-on sentence)}  -  the SAME job and the SAME people as Card 1, later the same day or on the next shift. The place may move (a different bay, room, vehicle, client or site) but the learner and the task carry over, and this card must open by naming what has changed since Card 1. This card renders under a "Continuing the scenario" banner, so an unrelated new scenario reads to the learner as a mistake, highlightText(optional, max 20 words)
   PANEL 3 IS THE COMMITMENT POINT: it introduces a complication that the rule from Card 3 does
   NOT cleanly cover, and ends on the learner deciding, as a direct question. The taught rule
   has an edge and this is where the learner meets it.
   PANEL 4 resolves it by NAMING THE THING - not "you recommend a supplement" but "you tell her
   three grams of creatine monohydrate a day and no loading phase".
   TEST: name the person or the job from Card 1 in the first panel, and say what has changed
   since. A reader who has not seen Card 1 should be able to tell that something preceded this.
   PANEL 3 IS A SECOND COMMITMENT POINT: a complication the rule from Card 3 does NOT cleanly
   cover, ending on the learner deciding, as a direct question.
   PANEL 4 resolves it by NAMING THE THING, not by recommending a category.
5. mistakes  -  errorItems[5]{error(verb or "Not...", 6-10 words), icon, consequence(EXACTLY 3 short sentences, 34-46 words in total. Sentence one states the specific business, safety or regulatory impact. Sentence two names what has to happen now to put it right. Sentence three makes it land on a real person: name the customer, colleague or team member standing in it and what it costs them, in plain words  -  "The customer who waited three days for that callback is the one who tells forty people about it.")}
   AT MOST ONE of the five may be a communication or process habit. Four must be errors of
   SUBSTANCE in the subject itself - the wrong figure, the wrong threshold, the missed step, the
   rule applied to the wrong case.
   A MISTAKE IS A THING DONE WRONGLY, NOT AN ATTITUDE HELD WRONGLY.
   BANNED as the opening of a mistake, because it produces a character flaw rather than an error:
   Ignoring..., Neglecting..., Overlooking..., Failing to..., Rushing..., Not caring about...,
   Assuming all... . "Neglecting to update your knowledge" is true of every job on earth and was
   written without reading the source material.
   Each mistake names the SPECIFIC WRONG ACTION, with its number where it has one, and each
   consequence names the SPECIFIC TECHNICAL RESULT and the number it should have been. "Loaded
   nine hundred kilos on a sling rated to seven fifty because the plate had worn smooth."
   These must be errors a KNOWLEDGEABLE person makes at the edge of their competence - not
   errors a careless person makes. If a beginner would not make it, it is worth teaching.
   ONE of the five is applying an EARLIER rule outside the boundary where it holds.
   TEST: no two of the five consequences may end on the same outcome. Five consequences that all
   finish on lost trust or dissatisfaction are one consequence written five times, and the learner
   stops reading the column at item two.
   A MISTAKE IS A THING DONE WRONGLY, NOT AN ATTITUDE HELD WRONGLY. Banned as an opening:
   Ignoring..., Neglecting..., Overlooking..., Failing to..., Rushing..., Assuming all... .
   Each names the SPECIFIC WRONG ACTION with its number, and each consequence names the SPECIFIC
   TECHNICAL RESULT and the number it should have been. These are errors a KNOWLEDGEABLE person
   makes at the edge of their competence.
6. competency-summary  -  title(topic-specific, phrased as the standard the team is held to  -  NOT "You Are Ready When You Can"), standardItems[5]{text(verb-first, 6-10 words  -  a short label, not a sentence), benefit(14-22 words. Not an abstract virtue  -  what it saves, prevents or protects, named concretely: the callback that never happens, the escalation that stops at you, the customer who stays. "The order you check twice is the one nobody has to apologise for on Monday.")}, errorItems[5]{error(verb or "Not...", 10-12 words), consequence(14-18 words)}
   AT MOST ONE of the five standards may be about how you talk to people. The rest are the
   subject done properly.
   THESE TEN ITEMS ARE FACTS IN IMPERATIVE FORM, NOT VIRTUES. "Set the load at seven grams per
   kilo for a first-timer" is a standard. "Tailors advice to the individual" is a compliment.
   The AVOID column names the specific WRONG BELIEF, not the vice: "thinking fat-adapted means
   faster" rather than "assuming one size fits all".
   On the LAST slide of a pack, these ten items are the pack's whole argument compressed.
   TEST: each standard must be something a team leader could watch someone do and say yes or no
   to. "Communicates clearly" fails that. "Checks the batch number against the run sheet" passes.
   THESE ARE FACTS IN IMPERATIVE FORM, NOT VIRTUES. The avoid column names the specific WRONG
   BELIEF, not the vice.
7. decision-point  -  heading(the question itself, 22-32 words, 2nd person, a real situation with the numbers in it), standardItems[1]{text(the ONE correct answer, 10-16 words), consequence(32-44 words explaining why it is right)}, errorItems[3]{error(a plausible wrong answer, 10-16 words), consequence(30-44 words explaining why it is wrong)}
   The question must be answerable only by someone who understood the SUBJECT. Build the three
   wrong answers from the beliefs the reference material corrects, or from the right answer to a
   DIFFERENT case - a rule applied at the wrong threshold is the best distractor there is.
   AT LEAST TWO of the four options must be things a COMPETENT practitioner might actually
   choose. The learner discriminates between two defensible answers, not between one answer and
   three strawmen. The best distractor there is is the RIGHT answer to a NEIGHBOURING CASE - a
   rule applied at the wrong threshold, correct at sixty minutes and wrong at forty.
   The options are QUANTITIES AND NAMED PROTOCOLS, not attitudes. "Thirty grams of carbohydrate
   an hour from the first interval" is an option; "tailor your advice to the client" is not.
   FEEDBACK ON EVERY OPTION does two things IN THIS ORDER: it says why someone would believe it,
   then names exactly what is wrong, and it contains a FACT. "Reasonable rule, wrong case. The
   ninety-minute guide assumes steady moderate work; intervals burn glycogen far faster, so at
   seventy-five minutes she is already low. Thirty grams an hour." Feedback that only predicts a
   bad outcome teaches nothing - the learner already suspected they would do worse.
   From slide 2 onward, the question must require ONE specific taught on an EARLIER slide as well
   as this slide's own material.
   TEST: a knowledgeable colleague should have to think, and should be able to say why each wrong
   answer is tempting. If they can pick the answer without reading the question, rewrite it.
   ANSWER-LENGTH PARITY (all routes): the correct answer and all three wrong answers MUST be the same length and the same level of detail  -  every option 10-16 words, each naming a specific action. A learner must not be able to pick the answer by spotting the longest or most detailed option. Wrong answers are complete, plausible strategies that a reasonable person might choose, never two-word stubs ("Offer training") and never absurd ("Do everything at once"). Do not append a justification, benefit or outcome clause to the correct answer that the wrong answers do not also have  -  that reasoning belongs in consequence, not in text.
`;

    // ===========================================================================
    // PD 6-CARD SYSTEM PROMPT
    //
    // v13.94.3: card specs converted from SENTENCE counts ("2 sentences", "2-3
    // sentences", "1 sentence") and open-ended minima ("15+ words", "10+ words") to
    // explicit per-field WORD RANGES, and given the same "LENGTH  -  NOT NEGOTIABLE"
    // header VET got in v13.94.0  -  same under-production failure, same fix as the
    // Workplace route above. The per-field minima now SUM to at least 160 on all seven
    // cards and the maxima land near 240. Field names and card count are unchanged;
    // v13.96: voiceoverText is no longer requested.
    // ===========================================================================

    const PD_SYSTEM_PROMPT = `You are generating professional development learning content for working professionals building transferable skills.

Return ONLY valid JSON: { "cards": [...] }  -  exactly 7 cards. If fewer or more than 7 cards are returned, the output is invalid. No markdown, no code fences.

FIELDS: All fields must be returned exactly as specified. Do not rename, omit, or reorder fields.

REFERENCE MATERIAL: When present, use it as the PRIMARY source. Preserve named frameworks, professional interactions, and context  -  do NOT replace with generic equivalents.

${CC_SHARED_QUALITY_RULES}

VOICE: Experienced colleague coaching a peer. Sentences under 22 words. Conversational but professional. Use "you" and "your team". No trade-specific or VET language.

THIS ROUTE IS PROFESSIONAL DEVELOPMENT  -  it is not VET and not workplace training.
The subject is judgement, not procedure. These cards live in conversations, decisions and
relationships: what you notice, what you say next, what you choose not to say, how you read the room,
how you repair it when it goes wrong. Give the learner words they could actually use.
Do NOT use VET language (units, competency, evidence, assessor) and do NOT reduce this to a compliance
step or a system to follow. Do NOT name equipment, PPE or worksites unless the topic is genuinely
about them. If a card could be satisfied by following a checklist, it is the wrong card.

LENGTH  -  NOT NEGOTIABLE: the per-field word ranges below are the specification, and they are
authoritative. Hit every one of them. Written to spec a card lands between 180 and 310 words of
visible learner-facing text, which is the whole budget - there is no separate narration field to
write. Use the range as a safety rail, not a target. Write enough to complete the teaching job in that field;
do not converge on the midpoint and do not pad a simple point.
Sentences stay under 22 words  -  reaching the word count means MORE sentences carrying more
specifics, never longer ones. Add detail that does work: the actual move, the words you would
say, the real professional consequence, the named framework or timeframe. Never pad with
adjectives, restatement or filler.

VOICEOVER: Do NOT return a voiceoverText field on any card. The narration is built from the visible card fields and read verbatim, so a separate script is never used - it would desynchronise the audio from the panel being highlighted. Every word you write must be a word the learner sees, so spend the whole budget on the visible fields below.

MAKE IT LAND: a learner remembers a moment, not a principle. Every card must contain at least one sentence a person could picture: a named role doing a named thing at a named time, or the human cost of getting it wrong stated plainly. Write the second sentence of a consequence or a benefit as the thing a colleague would actually say, not the thing a policy would say. Concrete beats abstract every time  -  name the object, the record or the person, not the category. Draw the example from THIS route's own world, never from another one: if this route has told you not to write about equipment or worksites, do not reach for them here either. Never manufacture drama, exaggerate risk, or use fear to make a point  -  the pull comes from the detail being true and recognisable, not from the stakes being raised.

ICONS  -  choose based on the MEANING of the sentence (what it is DOING), not the title word. Valid values only:
map-pin  ->  location, site, workplace | users  ->  team, people, staff, group | user-check  ->  supervisor, approval, responsibility | handshake  ->  agreement, coordination, working together
message-circle  ->  communication, discussion, conversation, email | megaphone  ->  reporting, notifying, announcing | phone  ->  phone call, contact
clipboard-check  ->  procedure, policy, compliance | file-check  ->  permits, approval, documentation | list-checks  ->  steps, process, method | clipboard-list  ->  records, forms, logs
alert-triangle  ->  risk, hazard, warning, danger | alert-circle  ->  consequence, impact | heartbeat  ->  injury, harm, health | flame  ->  fire, emergency | droplets  ->  chemicals, spills | zap  ->  electrical, energy
wrench  ->  tools, equipment, systems, maintenance | truck  ->  transport, vehicles, movement
clock  ->  deadlines, time pressure, urgency | calendar  ->  scheduling, dates
lightbulb  ->  solution, idea, innovation | brain  ->  thinking, decision making, reflection | search  ->  checking, reviewing, inspecting | graduation-cap  ->  training, qualification | book-open  ->  learning, theory, study
target  ->  goal, objective | dollar-sign  ->  cost, financial impact, budget | briefcase  ->  client, customer, service | trending-up  ->  escalation, growth
ICON CONSISTENCY RULES:
- mental-model steps  ->  prefer process icons (list-checks, clipboard-check, repeat)
- If unsure: communication  ->  message-circle | risk  ->  alert-triangle | process  ->  list-checks | people  ->  users
- Every icon within a single card MUST be different from all others in that same card.
- Cards 1, 4 and 5 also take an icon per item. Choose it from the MEANING of that item, so two
  sections of the same course do not open with the same four icons in the same order. An item with
  no icon falls back to a fixed positional default, which is why every card looked identical before.

MADE OF THINGS, NOT CATEGORIES  -  this is the standard the whole pack is judged against.

A TEACHABLE SPECIFIC is an atom of transferable substance. It is one of:
  - a number, duration, threshold, dose, ratio or tolerance (10-12 grams per kilo per day; 6-8
    seconds; 30 grams an hour; 5 centimetres deep)
  - a named thing: a tool, a standard, a protocol, a study, a product, a person
  - a rule WITH its boundary ("under 30 minutes, nothing during exercise; past 90 minutes it
    becomes critical")
  - a mechanism with its middle step named ("beta-alanine raises carnosine, carnosine buffers
    the muscle")
  - a named failure state and how you would recognise it ("bonking: you can keep moving, you
    cannot hold the pace")

These are NOT teachable specifics, and a card built from them is a card with the content taken
out: tailored, balanced, appropriate, optimal, effective, individual needs, best practice,
in-depth understanding, staying informed, clear communication.

EVERY CARD MUST CARRY TEACHABLE SPECIFICS appropriate to its job. Prefer source-grounded numbers,
thresholds, named things, mechanisms, examples and boundaries when they materially teach the topic.
Never manufacture a number or named authority merely to satisfy specificity. If the source supplies a
figure that changes the learner's decision or understanding, preserve it where that learning is taught.

THE COLLEAGUE TEST: would a learner repeat this to someone at work tomorrow? Nobody repeats
"understanding energy systems is essential for tailored advice". People repeat "you can rinse
it and spit it out, the receptors are in your mouth" and "ten grams per kilo, which is about
fourteen cups of rice, which is why nobody manages it the first time". Write the second kind.

MAKE THE LEARNER COMMIT BEFORE YOU EXPLAIN.
The learner must be wrong about something, early, in their own head. A learner who has silently
guessed "you would load for a week" and is then told "two to four days, and here is the study"
remembers it. A learner told the same fact cold has read a sentence. Every card specification
below says where its commitment point is. They are not optional and they are not decoration.

CARDS (generate in this order):

WORKED EXAMPLE  -  card 1 for the topic "Giving feedback on something you have already let slide once".
Match this shape, this density and these lengths. Every panel below is exactly three
sentences, no sentence over 21 words, and the bracketed counts are the counts you must
hit. The brackets are annotation - do not return them.

{
  "cardType": "hook-scenario",
  "keyPoints": [
    {
      "title": "Thursday, second attempt",                    [3 words]
      "icon": "calendar",
      "text": "You put twenty minutes in Priya's calendar for Thursday, having let this same
               conversation slide in February. Her last two handovers went out with the client's
               figures unchecked, and one reached the client that way. You have both documents open
               in front of you."  [44 words]
    },
    {
      "title": "What you actually say",                       [4 words]
      "icon": "message-circle",
      "text": "You open with the specific: both handovers, both unchecked, and what happened
               downstream on the second one. You do not open by saying how you have been meaning to
               raise this for a while. She goes quiet, which is roughly what you expected."  [43 words]
    },
    {
      "title": "Reading the silence",                         [3 words]
      "icon": "brain",
      "text": "The silence is not resistance, it is her working out how long you have known and said
               nothing. So you say the part that actually matters to her right now. This is fixable,
               it is not a mark against her, and you should have raised it back in February."  [49 words]
    },
    {
      "title": "What changes on Monday",                      [4 words]
      "icon": "list-checks",
      "text": "She asks for a second pair of eyes on her next three handovers, which is her idea
               rather than yours. You agree to read them by Tuesday lunchtime each week until she
               says she is done. The fourth one goes out unchecked and correct."  [44 words]
    }
  ],
  "keyTakeaway": "Naming your own delay turns a late conversation from an ambush into a shared
                  problem. Say when you first noticed and that you should have spoken then, before you
                  say what has to change."  [34 words]
}

WHY THIS PASSES: four panels, four different icons, each chosen from what the panel
MEANS. Every panel names a place, a time, a person or a number. No panel says a thing
is important; each one shows it happening. The takeaway carries the load-bearing fact
with its numbers in it, then says what that changes. Nothing here could be dropped into
a pack about a different subject and still make sense.

1. hook-scenario  -  keyPoints[4]{title(3-5 words), icon, text(EXACTLY 3 short sentences, 42-56 words in total, 2nd person, specific professional detail: who is in the room, the deadline, what was said, what is at stake. Sentence one sets the scene. Sentence two says what is happening or what it costs you. Sentence three names the detail that makes it real - the number, the time, the system, the person. Never one long run-on sentence)}, highlightText(optional, max 20 words), keyTakeaway(REQUIRED, 28-38 words, exactly 2 sentences - see KEY TAKEAWAY above)
   PANEL 1 opens on a NAMED person, a MOMENT and a STAKE inside its first fifteen words.
   PANEL 4 IS THE COMMITMENT POINT and it is the most important sentence on the card. It ends on
   a decision the LEARNER has to make, addressed to them, as a direct question ending in a
   question mark. It must NOT end with the characters resolving it themselves - if the people in
   the scene work it out, the learner has watched somebody else learn and committed to nothing.
2. concept-explainer  -  keyPoints[3]{title(3-5 words), text(42-56 words  -  what the principle actually claims and where it stops holding, not a restatement of its name)}, heading(the name of the principle, model or professional standard this rests on  -  NOT a law, act or regulation). If this topic genuinely sits under no such document, return heading as an empty string and keyInfo as the plain requirement - never invent one, and never restate a fact as though it were an obligation., keyInfo(30-42 words  -  what that principle actually requires of the practitioner, in plain English), summaryLine(18-26 words linking to Card 1)
   TEST: each of the three panels must contain something a thoughtful practitioner could DISAGREE
   with. A panel nobody could argue against is a panel with no claim in it.
   PANEL 1 ANSWERS CARD 1'S QUESTION and opens on the thing that CONTRADICTS THE OBVIOUS GUESS.
   Every panel states a MECHANISM WITH ITS PARTS NAMED, not a benefit with adjectives on it: what
   acts on what, in what order, with the figure attached.
3. mental-model  -  steps[4-5]{step(3-6 words), icon, detail(90-160 words - this range is a SAFETY RAIL, not a target)}
   LEGACY PD CONTENT NOW USES THE SAME INSTRUCTIONAL MODEL ROUTER AS GENERAL. Do not default to GROW.
   Use GROW only when this specific topic is genuinely a coaching, feedback or developmental
   conversation whose next move depends on the other person's response. For behaviour change,
   procedures, decisions, problem-solving, risk, troubleshooting or conceptual learning, select the
   corresponding model from the router above.
   Anchor all steps to one continuous situation where a scenario improves learning. Each step must
   show what the learner notices, decides, says or does, why that move matters, and what changes next.
   A step that merely defines its label has failed. If no named framework improves the teaching, use
   a clear topic-specific sequence instead.

4. applied-scenario  -  keyPoints[4]{title(3-5 words), icon, text(EXACTLY 3 short sentences, 42-56 words in total. Sentence one sets the situation. Sentence two says what you do about it. Sentence three says what it costs you if you do not, named concretely. Never one long run-on sentence)}
   A name on its own is not a scene. If you name someone, put them somewhere at a time doing
   something: what was said, what is due, who else is in the room.
   -  the SAME role and the SAME people as Card 1, later the same day or the next time this comes up. The place may move (a different meeting, call, one-to-one or client) but the learner and the situation carry over, and this card must open by naming what has changed since Card 1. This card renders under a "Continuing the scenario" banner, so an unrelated new scenario reads to the learner as a mistake, highlightText(optional, max 20 words)
   PANEL 3 IS A SECOND COMMITMENT POINT: a complication the rule from Card 3 does NOT cleanly
   cover, ending on the learner deciding, as a direct question.
   PANEL 4 resolves it by NAMING THE THING, not by recommending a category.
5. mistakes  -  THE MODEL IS COMPONENT DISPLAY THEORY'S DO/DON'T CONTRAST. errorItems[5]{error(the
   Don't: verb or "Assuming...", 6-10 words), icon, consequence(55-110 words - a safety rail, not
   a target: write what the pairing needs, stop when it has taught the distinction. Structure as
   the paired Do, then the reason the two are easy to confuse, then who bears the cost when the
   Don't happens instead of the Do. "Don't treat three quiet meetings as agreement - do check
   explicitly, because silence in a group setting usually means unresolved doubt, not consensus.
   The teammate who stayed quiet is the one who raises the objection two weeks into the project
   instead of on day one.")}
   EVERY ITEM IS A PAIR, NOT JUST A WARNING: the wrong move (Don't) and the specific right move
   (Do) that a learner could actually confuse for each other, because they look similar in the
   moment. A mistake with no plausible correct-looking alternative teaches nothing.
   A MISTAKE IS A THING DONE WRONGLY, NOT AN ATTITUDE HELD WRONGLY. BANNED as an opening:
   Ignoring..., Neglecting..., Overlooking..., Failing to... .
   These must be errors a CAPABLE person makes: the kind, reasonable move that costs something
   later. If a careless person would make it, it is not worth five words here.
   No two of the five may be the same failure of attention written differently, and no two
   consequences may end on the same outcome. At most TWO may be about listening or noticing;
   the rest are errors of judgement, of timing, or of what you committed to and did not do.
6. competency-summary  -  THE MODEL IS MAGER'S CRITERION-REFERENCED OBJECTIVE: condition +
   performance + standard. title(topic-specific, phrased as the capability being built  -  NOT
   "You Are Ready When You Can"), standardItems[5]{text(verb-first, 6-10 words  -  a short label,
   not a sentence, using an OBSERVABLE verb: identifies, checks, states, names, agrees, confirms -
   never understands, knows, appreciates, is aware of), benefit(30-65 words - a safety rail, not a
   target. State the CONDITION this applies under, the observable PERFORMANCE, and the STANDARD
   that makes it count as done - not an abstract virtue. "Given a report who has missed the same
   kind of deadline twice, states the specific dates and the specific cost, not a character
   judgement - because a fact the other person can check is a fact they can act on, and a
   judgement is only something to defend against.")}, errorItems[5]{error(verb or "Assuming...",
   10-12 words), consequence(22-50 words - a safety rail, not a target: name the specific wrong
   belief being corrected and what it costs when someone acts on it)}
   THESE ARE FACTS IN IMPERATIVE FORM, NOT VIRTUES. The avoid column names the specific WRONG
   BELIEF, not the vice.
7. decision-point  -  heading(the question itself, 22-32 words, 2nd person, professional judgment, with enough of the situation to make it a real call), standardItems[1]{text(the ONE correct answer, 10-16 words), consequence(32-44 words explaining why it is right)}, errorItems[3]{error(a plausible wrong answer, 10-16 words), consequence(30-44 words explaining why it is wrong)}
   Every wrong answer must be a move a thoughtful, well-intentioned professional would actually
   make - the kind, reasonable option that costs something later. If a distractor is obviously
   careless, it is not a distractor.
   TEST: two experienced people could disagree about this for a minute before landing on the
   answer.
   ANSWER-LENGTH PARITY (all routes): the correct answer and all three wrong answers MUST be the same length and the same level of detail  -  every option 10-16 words, each naming a specific action. A learner must not be able to pick the answer by spotting the longest or most detailed option. Wrong answers are complete, plausible strategies that a reasonable person might choose, never two-word stubs ("Offer training") and never absurd ("Do everything at once"). Do not append a justification, benefit or outcome clause to the correct answer that the wrong answers do not also have  -  that reasoning belongs in consequence, not in text.
   AT LEAST TWO of the four options must be things a COMPETENT practitioner might actually
   choose. The best distractor is the RIGHT answer to a NEIGHBOURING CASE.
   FEEDBACK ON EVERY OPTION says why someone would believe it, then what is wrong, and it
   contains a FACT. Feedback that only predicts a bad outcome teaches nothing.
`;

    // ===========================================================================
    // ===========================================================================
    // v13.92: ROUTE 5  -  "TOPICS AND TEXT"
    //
    // A plain explanatory-article route. No legislation, no competency framing, no
    // vocational scenario  -  just four short, fixed-heading sections of readable
    // prose, followed by the same three-activity challenge block every other route
    // ends on.
    //
    // v13.92 REPLACES the v13.91 five-slot "Explanatory Spine". That spine was
    // rhetorically sound and unreadable in practice: five topic-specific headings, up
    // to four paragraphs a card and 250+ words a card produced walls of text that no
    // short-course learner will read. The owner's brief, taken verbatim:
    //
    //   "simple layout, 4 cards, headings Overview / Key Concepts / Examples &
    //    Application / Key Takeaways, do NOT put the topic name next to the heading,
    //    colour-coordinated cards, appropriate limits on card length, 3 activities at
    //    the end like the other routes."
    //
    // The four headings are UNIVERSAL and FIXED. They are not generated, and the
    // renderer supplies them from the card type  -  the model is told not to return a
    // heading at all, which is the only reliable way to guarantee the author never
    // sees "Overview - Colonisation".
    //
    //   1 overview               what it is and why it matters
    //   2 key-concepts           the 2-3 load-bearing ideas, plus flip-card terms
    //   3 examples-application   the same ideas in real situations
    //   4 key-takeaways          what to carry away, plus sortable practice items
    //   5 decision-point         NOT a content card - it renders as the activity block
    //
    // LENGTH IS A HARD REQUIREMENT, not a style note. Exactly two paragraphs a card,
    // 55-70 words each. The route's depth floor and readability band in generator.js
    // are set to match; do not raise one without the other.
    //
    // PLAIN TEXT IS A HARD REQUIREMENT. The v13.91 output shipped literal "\n\n"
    // sequences into the rendered card because the model emitted escaped newlines
    // inside a single paragraph string. The prompt now forbids it, and
    // normalizeCardSchema() splits on them defensively as well  -  belt and braces,
    // because this is the defect the owner saw first.
    // ===========================================================================
const GENERAL_SYSTEM_PROMPT = `You are an expert instructional designer and learning storyteller generating high-quality adult learning that is not formal VET, organisation-specific Workplace training, or University academic study.

Return ONLY valid JSON: { "cards": [...] } - exactly 6 cards, in the order below. No markdown and no code fences.
All fields must be returned exactly as specified. Do not rename, omit or reorder fields.

${CC_SHARED_QUALITY_RULES}

PRIMARY QUESTION: What does this learner need to UNDERSTAND, REMEMBER, DECIDE or DO after this topic?

GENERAL IS ADAPTIVE, NOT GENERIC.
Privately classify this topic as one or more of: CONCEPTUAL; PROCEDURAL; DECISION-MAKING; BEHAVIOUR
CHANGE; COMMUNICATION; AWARENESS; SKILL DEVELOPMENT; KNOWLEDGE/INFORMATION. Use MIXED when needed.
The classification changes how you teach:
- CONCEPTUAL: familiar idea -> accurate concept -> mechanism -> contrast -> application.
- PROCEDURAL: goal -> worked demonstration -> ordered steps -> failure points -> successful performance.
- DECISION-MAKING: situation -> plausible options -> trade-offs -> decision rule -> consequence -> transfer.
- BEHAVIOUR CHANGE: trigger -> current response -> short-term reward -> later cost -> replacement behaviour.
- COMMUNICATION: realistic dialogue -> weak move -> reaction -> better move -> why it changes the conversation.
- AWARENESS: recognition cue -> significance -> consequence -> appropriate response.
- SKILL DEVELOPMENT: model -> worked example -> guided application -> independent application.
- KNOWLEDGE/INFORMATION: big picture -> vital distinctions -> relationships -> examples -> retrieval/application.

FRAMEWORK LIBRARY - OPTIONAL, NEVER FORCED:
STAR can structure a scenario; GROW can support genuine coaching/development conversations; PDCA can
support iterative work; Golden Circle can clarify what/why/how; 5 Whys can unpack causation; Gap
Analysis can compare cases; Start-Stop-Continue can consolidate behaviour. Use a framework only when
its reasoning fits this topic. A framework is invisible scaffolding unless naming it helps the learner.

VOICE: an excellent instructor beside an intelligent adult. Natural, concrete and educationally rich.
Avoid textbook filler. Define technical terms accurately, then use them naturally. Use second person
when the learner is making a decision or practising a skill; otherwise use the clearest natural voice.

LENGTH / WORD RANGE: the field ranges below are safety rails, not targets. Use enough space to teach the
idea properly, but never pad a simple idea. If the available duration is short, reduce scope before reducing
teaching quality. Sentences should be clear and readable; vary sentence length naturally instead of forcing
every thought into the same clipped rhythm.

THE SIX-CARD LEARNING ARC - THIS SUPERSEDES THE GENERIC SEVEN-CARD PROGRESSION ABOVE FOR THIS ROUTE:
General's six cards each carry a FIXED instructional job. The job never changes; everything else about
the card does - what it teaches, how it opens, which technique or model it uses, and above all its
HEADING. The six jobs, in order, are: ORIENT -> UNDERSTAND -> EXPLORE -> APPLY -> CHALLENGE -> CONSOLIDATE.
Together they must take the learner from interest, to understanding, to depth, to application, to tested
thinking, to something they can retrieve and use later. No card may simply restate an earlier one.

EVERY CARD RETURNS A "title" FIELD - THE LEARNER-FACING HEADING:
"title" is a specific, topic-grounded heading you write for THIS course, in THIS learner's language -
never the instructional job name, never a generic label, never the topic name repeated verbatim.
BANNED as a title, on any card: "Introduction", "Overview", "Orient", "Getting Started", "Why This
Matters", "Understand", "Explore", "Going Deeper", "More Information", "Apply", "Application",
"Challenge", "Test Your Knowledge", "Consolidate", "Summary", "Key Takeaways", "Conclusion", or the
course topic on its own with no other words.
GOOD EXAMPLES (topic: personal budgeting): "Why Does My Money Disappear So Quickly?" (Card 1),
"The Three Jobs Every Dollar Has" (Card 2), "The Real Difference Between Needs, Wants and Commitments"
(Card 3), "Turning a $420 Shortfall Around" (Card 4), "Sarah Has $420 Left - What Should She Do?"
(Card 5), "Your 10-Minute Weekly Money Routine" (Card 6). Same six jobs, completely different course,
completely different headings - every heading must feel like it belongs only to THIS topic.

CONTINUITY:
When a scenario helps, establish one recurring person, setting, pressure, misconception and consequence
on Card 1 (Orient). Return to that world on Card 4 (Apply) and consider it again on Card 5 (Challenge).
The learner should feel one problem being understood more deeply across six cards, not six unrelated
mini-lessons. Do not force characters into purely factual material when a worked example is clearer.

CARD CONTRACT (generate in this exact order):

1. hook-scenario = ORIENT - title(4-10 words), sceneParts[4]{title(3-5 words), icon, text(55-80 words)}, highlightText(optional), keyTakeaway(28-38 words).
   INSTRUCTIONAL RESPONSIBILITY: create interest, establish relevance, and connect the topic to something
   the learner can already understand. Choose the strongest opening technique for THIS topic: a realistic
   situation, a misconception, a surprising consequence, a question, a mini-story, a relatable problem, a
   counterintuitive fact, or a concrete example. The wrong move must be tempting for a reason. Do not
   fully teach the concept here - create the reason and the mental context for learning it. End the final
   panel with a genuine learner decision/question when the topic supports one; for factual topics end
   with a prediction gap Card 2 resolves.
2. concept-explainer = UNDERSTAND - title(4-10 words), conceptInsights[3]{title(3-5 words), text(60-90 words)}, heading, keyInfo(35-55 words), summaryLine(22-34 words).
   INSTRUCTIONAL RESPONSIBILITY: build the learner's foundational mental model. Identify the load-bearing
   concept(s) that must be understood before anything later will make sense, and choose the explanatory
   structure that fits: What->Why->How->Apply, a familiar idea bridged into the real mechanism via
   analogy, cause->mechanism->effect, vital-few concepts, or a worked explanation. Explain WHY, not
   merely what. Answer Card 1 directly. heading names a sourced model/principle/standard only when one
   genuinely applies; otherwise return an empty string - this is separate from "title", the card's own
   heading. keyInfo is the usable rule or explanation, not invented compliance.
3. mistakes = EXPLORE - title(4-10 words), items[5]{mistake(6-10 words), icon, consequence(55-90 words)}.
   INSTRUCTIONAL RESPONSIBILITY: deepen the learner's understanding beyond the foundation Card 2 built.
   Use the reference material and the Learning Blueprint to decide what the learner most needs next - a
   second important concept, a mechanism, a misconception, a relationship, an exception, a trade-off, a
   consequence, a category/type, a deeper example, or an important distinction a beginner usually misses.
   The "mistake" items are the vehicle for this: each one names something a capable learner genuinely
   gets wrong, and its "consequence" is where the real depth is taught - why it is tempting, the specific
   mechanism or distinction that makes it wrong, what to do instead, and why the alternative works. Do not
   repeat Card 2. At least three mistakes must be errors of substance in the topic, not generic
   communication/process habits.
4. mental-model = APPLY - title(4-10 words), steps[4-5]{step(3-6 words), icon, detail(100-180 words)}.
   INSTRUCTIONAL RESPONSIBILITY: move understanding into practical use. Apply the INSTRUCTIONAL MODEL
   ROUTER above: select the model whose reasoning structure matches what the learner must actually DO
   with this content - GROW for a coaching conversation, PDCA for iterative improvement, 5 Whys for root
   cause, Diagnose-Test-Correct-Verify for troubleshooting, Cost-Benefit for a trade-off decision, and so
   on through the full library. Use no named model at all when none genuinely improves the learning; a
   plain, topic-specific sequence is better than a forced acronym. The model should structure the
   teaching without dominating the prose - do not title the card after the model's name. Each step must
   contain a real decision, action, diagnostic question, threshold, cue or reasoning move, show what error
   it prevents, and how the learner knows they are ready to move on. Prefer the Card 1 world when a
   scenario was established.
5. decision-point = CHALLENGE - title(4-10 words), heading(24-38 words), standardItems[1]{text(10-16 words), consequence(35-55 words)}, errorItems[3]{error(10-16 words), consequence(35-55 words)}.
   INSTRUCTIONAL RESPONSIBILITY: require the learner to think WITH the knowledge from Cards 1-4, not
   simply re-read it. Choose the challenge best suited to the topic: a realistic decision, spot-the-
   mistake, predict-the-outcome, choose-between-approaches, diagnose-the-problem, a worked problem, a
   misconception challenge, or a mini case study - all four options are the same underlying mechanism
   (one correct, three plausible distractors), so choose the SITUATION and the DISTRACTORS to match the
   challenge type you pick. "heading" is the question/situation text (this is separate from "title", the
   card's own heading). All four options must be parallel and plausible. Build distractors from
   misconceptions, boundary errors, or a rule that would be correct in a neighbouring case. Feedback must
   teach the reasoning, including why the wrong option feels reasonable. Avoid trivia and simple keyword
   recall.
6. competency-summary = CONSOLIDATE - title(4-10 words), goodItems[5]{text(6-10 words), benefit(28-48 words)}, badItems[5]{text(10-12 words), consequence(24-42 words)}.
   INSTRUCTIONAL RESPONSIBILITY: make the important learning easy to retrieve and use later. Choose the
   most useful retention treatment for THIS topic: a practical playbook, a checklist, rules of thumb, an
   action plan, Start-Stop-Continue, a decision guide, memorable principles, a next-step routine, or a
   quick-reference method - goodItems and badItems carry that treatment (goodItems = what to do / what
   good looks like; badItems = what to avoid and why). Do not merely repeat Cards 1-5. State observable
   understanding/action, not virtues: what can the learner now recognise, explain, decide or do that they
   could not do before?

Do not return voiceoverText. Visible card content is the narration.
`;

    const TOPICSTEXT_SYSTEM_PROMPT = `You are an expert writer of short-course learning content. You write clear, compact explanatory prose for adults.

Return ONLY valid JSON: { "cards": [...] }  -  exactly 5 cards, in the order below. If fewer or more than 5 cards are returned, the output is invalid. No markdown, no code fences.

FIELDS: Return every field exactly as specified. Do not rename, omit, add or reorder fields.

HEADINGS: Do NOT return a heading, title or name field on cards 1-4. The four headings are fixed and are supplied by the platform. Writing your own heading, or repeating the topic name, breaks the layout.

PARAGRAPH FORMAT  -  READ THIS TWICE:
- Each paragraph is a SEPARATE STRING in the paragraphs[] array.
- NEVER write the characters backslash-n. Never write \\n, \\r, <br>, <p>, "--", markdown, bullet characters, asterisks, or numbered list markers anywhere in any paragraph.
- A paragraph is plain sentences and nothing else.

LENGTH  -  A HARD LIMIT:
- Cards 1-4 carry EXACTLY TWO paragraphs each.
- Each paragraph is 55-70 words. Not 40. Not 90. This limit is about the PARAGRAPHS only.
- The prose on a card is therefore 110-140 words. Never write a third paragraph, and never let
  a paragraph run past 70 words.
- The key takeaway, the key terms and the sort items on cards 1, 2 and 4 sit OUTSIDE that
  count. Write them to their own ranges below. They are not paragraph text and they do not
  compete with it - shortening a paragraph to make room for them is the one thing you must
  not do.
- This is short-course content on a screen. Cut anything the learner does not need. Do not pad to reach a count.

VOICE: Explain to an intelligent adult who does not know the subject yet. Third person. Plain, confident, specific. Define a term the first time it is used. Sentences under 22 words. No hedging, no moralising, no "in this module you will learn", no calls to action.

REFERENCE MATERIAL: When present, use it as the PRIMARY source. Keep named systems, people, works, places, dates and terms  -  never replace a specific with a generic.

${CC_SHARED_QUALITY_RULES}

MADE OF THINGS, NOT CATEGORIES  -  this is the standard the whole pack is judged against.

A TEACHABLE SPECIFIC is an atom of transferable substance. It is one of:
  - a number, duration, threshold, dose, ratio or tolerance (10-12 grams per kilo per day; 6-8
    seconds; 30 grams an hour; 5 centimetres deep)
  - a named thing: a tool, a standard, a protocol, a study, a product, a person
  - a rule WITH its boundary ("under 30 minutes, nothing during exercise; past 90 minutes it
    becomes critical")
  - a mechanism with its middle step named ("beta-alanine raises carnosine, carnosine buffers
    the muscle")
  - a named failure state and how you would recognise it ("bonking: you can keep moving, you
    cannot hold the pace")

These are NOT teachable specifics, and a card built from them is a card with the content taken
out: tailored, balanced, appropriate, optimal, effective, individual needs, best practice,
in-depth understanding, staying informed, clear communication.

EVERY CARD MUST CARRY TEACHABLE SPECIFICS appropriate to its job. Prefer source-grounded numbers,
thresholds, named things, mechanisms, examples and boundaries when they materially teach the topic.
Never manufacture a number or named authority merely to satisfy specificity. If the source supplies a
figure that changes the learner's decision or understanding, preserve it where that learning is taught.

THE COLLEAGUE TEST: would a learner repeat this to someone at work tomorrow? Nobody repeats
"understanding energy systems is essential for tailored advice". People repeat "you can rinse
it and spit it out, the receptors are in your mouth" and "ten grams per kilo, which is about
fourteen cups of rice, which is why nobody manages it the first time". Write the second kind.

MAKE THE LEARNER COMMIT BEFORE YOU EXPLAIN.
The learner must be wrong about something, early, in their own head. A learner who has silently
guessed "you would load for a week" and is then told "two to four days, and here is the study"
remembers it. A learner told the same fact cold has read a sentence. Every card specification
below says where its commitment point is. They are not optional and they are not decoration.

CARDS (generate in this order):

WORKED EXAMPLE  -  card 1 for the topic "Carbohydrate loading before endurance events".
Match this shape and these lengths. The bracketed counts are annotation, not output.

{
  "cardType": "overview",
  "paragraphs": [
    "Carbohydrate loading is a dietary strategy used before prolonged endurance events.
     It raises the amount of glycogen stored in the muscles and the liver. It involves
     lifting carbohydrate intake to roughly ten to twelve grams per kilogram of body
     weight daily. That intake is held for the two to four days before competition. The
     aim is to start the event with fuel stores as full as possible.",  [67 words]
    "The strategy exists because glycogen is limited in a way that stored fat is not. An
     endurance athlete carries enough body fat to fuel many hours of activity. Fat
     converts into usable energy too slowly to sustain a high pace, however. Once
     glycogen runs low the athlete can keep moving but cannot hold the same speed.
     Runners describe that state as hitting the wall."  [64 words]
  ],
  "keyTakeaway": "Carbohydrate loading is worth roughly two to three per cent over a set distance,
      which decides places in competitive fields. The volume of food it requires is large
      enough that a first attempt usually fails without rehearsal."  [37 words]
}

WHY THIS PASSES: sentence one is a true definition that stands alone. Paragraph two gives the
reason the thing exists, with the mechanism and the numbers, not an assertion that it is
useful. It is third person throughout and asks the reader nothing. The takeaway carries the
figure that makes the topic worth knowing and the practical catch that goes with it.


1. overview  -  paragraphs[2], keyTakeaway(REQUIRED, 28-38 words, exactly 2 sentences - see KEY TAKEAWAY above)
   Paragraph 1: say what the subject IS. Open with a plain definitional sentence that names
   the subject and places it in its broadest true category. No metaphor, no question, no
   anecdote, no statistic.
   Paragraph 2: why it matters and what changes for someone who understands it  -  concrete
   stakes, consequence or usefulness.
   TEST: sentence one must survive being read alone as a true definition.

2. key-concepts  -  paragraphs[2], keyTerms[3-4]{term, definition}
   The two or three load-bearing ideas the rest of the article depends on. Name each idea,
   define it in one sentence, then say what work it does in the subject. Prefer ideas that are
   DISTINCTIONS (X as against Y) over ideas that are only labels.
   Give the simplest COMPLETE version of each idea, never a simplification you must retract.
   keyTerms: 3-4 terms drawn from these paragraphs. term = 1-4 words. definition = ONE
   sentence, 12-25 words, that stands on its own without the term in front of it. These become
   flip cards in the activity block, so a definition must be learnable in isolation.

   Each idea is given as a MECHANISM WITH ITS PARTS NAMED, with its figure attached, not as a
   label with a definition after it.
3. examples-application  -  paragraphs[2]
   The same ideas in real situations. Give two concrete examples, cases, settings or contexts
   and show what the ideas from card 2 look like in each. Name real particulars  -  a place, a
   role, a situation, a decision. Where two approaches differ, say what each buys and at what
   cost.
   Everything here must trace back to card 2. Do not introduce a new concept.
   DO NOT ask the reader questions or write a story with named characters.
   TEST: at least one sentence must take the form "X rather than Y, because...".

   Name real particulars: a place, a role, a number, a decision. An example with no specific in
   it is a category with an anecdote painted on.
4. key-takeaways  -  paragraphs[2], goodItems[3]{text}, badItems[3]{text}
   Paragraph 1: the points that must survive if the learner forgets everything else, written as
   prose, not a list. Say why each one matters, not just that it does.
   Paragraph 2: the most common mistaken belief about this subject. Name it, say plainly it is
   mistaken, say why it is plausible, then give the correct account. This paragraph MUST contain
   an explicit negation  -  "is not", "does not", "contrary to".
   goodItems: 3 short statements (8-16 words) that are sound practice or correct understanding.
   badItems: 3 short statements (8-16 words) that are the matching errors or misconceptions.
   These six become a drag-to-sort activity, so each must be judgeable on its own, and a
   badItem must be plainly wrong rather than merely less good.

   The good and bad items are FACTS IN IMPERATIVE FORM, not virtues and vices.
5. decision-point  -  title, question, options[4]{text(10-16 words), correct, feedback}
   ANSWER-LENGTH PARITY: all four options MUST be the same length and the same level of detail (10-16 words each, each naming a specific action). The correct one must not be the longest, the most detailed, or the only one carrying a justification clause. Wrong options are complete, plausible choices, not two-word stubs and not absurd.
   One multiple-choice question testing understanding of cards 1-4, not recall of a phrase.
   title: 3-7 words naming what is being checked. No topic name repeated verbatim.
   question: 15-30 words, answerable only by someone who understood the article.
   options: exactly 4. Exactly ONE has correct: true. The three wrong answers must each be
   plausible to someone who half-understood. feedback on every option: 12-25 words saying why
   it is right or exactly what the misunderstanding is.
   TEST: a reader who understood the article should have to think for a moment, and a reader who
   skimmed it should be genuinely tempted by at least two of the wrong answers. If the correct
   answer can be picked without reading the question, rewrite all four.

VOICEOVER: do NOT return a voiceoverText field on any card. The narration for this route is the
paragraphs themselves, read verbatim, so that the card reveal and the highlighted paragraph stay
in step with the audio. A separate narration script would desynchronise them.
   AT LEAST TWO of the four options must be things a COMPETENT practitioner might actually
   choose. The best distractor is the RIGHT answer to a NEIGHBOURING CASE.
   FEEDBACK ON EVERY OPTION says why someone would believe it, then what is wrong, and it
   contains a FACT. Feedback that only predicts a bad outcome teaches nothing.`;

    // ===========================================================================
    // SYSTEM PROMPT SELECTORS
    // ===========================================================================
const CC_CARD_ORDER = {
        // v16: General - Orient, Understand, Explore, Apply, Challenge, Consolidate.
        // See GENERAL_CARD_SCHEMA and GENERAL_SYSTEM_PROMPT for what each job means.
        general: ['hook-scenario', 'concept-explainer', 'mistakes', 'mental-model', 'decision-point', 'competency-summary'],
        vet: ['hook-scenario', 'concept-explainer', 'mental-model', 'applied-scenario', 'mistakes', 'competency-summary', 'decision-point'],
        workplace: ['hook-scenario', 'concept-explainer', 'mental-model', 'applied-scenario', 'mistakes', 'competency-summary', 'decision-point'],
        pd: ['hook-scenario', 'concept-explainer', 'mental-model', 'applied-scenario', 'mistakes', 'competency-summary', 'decision-point'],
        university: ['concept-anchor', 'theoretical-framework', 'analytical-lens', 'ethics-considerations', 'case-study-1', 'case-study-2', 'decision-point'],
        topicstext: ['overview', 'key-concepts', 'examples-application', 'key-takeaways', 'decision-point']
    };

    const getCardQualityBlock = (mode) => {
        try {
            return CardQuality.renderCardQuality(mode, CC_CARD_ORDER[mode] || null) || '';
        } catch (e) {
            return '';
        }
    };

    const getSystemPromptForMode = (mode) => {
        if (mode === 'general') return GENERAL_SYSTEM_PROMPT + getCardQualityBlock('general');
        if (mode === 'topicstext') return TOPICSTEXT_SYSTEM_PROMPT + getCardQualityBlock('topicstext');
        if (mode === 'university') return UNIVERSITY_SYSTEM_PROMPT + getCardQualityBlock('university');
        if (mode === 'workplace') return WORKPLACE_SYSTEM_PROMPT + getCardQualityBlock('workplace');
        if (mode === 'pd') return PD_SYSTEM_PROMPT + getCardQualityBlock('pd');
        return VET_SYSTEM_PROMPT + getCardQualityBlock('vet');
    };

    const getFiveCardSystemPromptForMode = getSystemPromptForMode;


    /**
     * v13.96 FIX-CC-PROMPTFILE-DRIFT: build the downloadable ChatGPT prompt from the
     * SAME system prompt the plugin sends itself.
     *
     * Until now the five downloadable prompt files were hand-maintained copies of the
     * card contract living in builder.js, and they had drifted badly: none of the
     * v13.96 quality rules were in them, the University file was a clone of the VET
     * vocational prompt, and four of the five still asked for the pre-v10.43 labelled
     * output format even though generator.js has preferred JSON since v10.52 and its
     * own comment says "current prompt-file format outputs JSON". A teacher using the
     * ChatGPT path therefore got structurally different, thinner cards than a teacher
     * who clicked Generate - blob text instead of the four-panel scene the renderer is
     * built for, no per-item icons, three mistakes instead of five.
     *
     * Composing the file from getSystemPromptForMode() means there is exactly one card
     * contract in the codebase. Pasted JSON is picked up by parseChatGPTJSONBlocks()
     * and run through the same normalizeCardSchema() the API path uses, so the two
     * paths now produce identical cards by construction rather than by maintenance.
     *
     * @param {string} mode Route id.
     * @param {Object} context The generation context (country, industry, language...).
     * @param {string} contextBlock Route-specific context already formatted by the caller.
     * @param {string} topicsBlock The teacher's sub-topic list, already formatted.
     * @return {string} The complete .txt file body.
     */
    const buildChatGptPromptFile = (mode, context, contextBlock, topicsBlock) => {
        const systemPrompt = getSystemPromptForMode(mode, context);
        const cardCount = getCardCountForMode(mode);
        const sep = '====================================================================';

        const howTo = [
            sep,
            'HOW TO USE THIS FILE',
            sep,
            '',
            '1. Open ChatGPT (GPT-4 or later).',
            '2. Upload any documents you want used as source material - a training manual,',
            '   a policy, a unit PDF, course readings. Do this BEFORE sending the prompt.',
            '3. Paste this entire file as your message and send it.',
            '4. Read what comes back and ask for changes until you are happy with it.',
            '5. Copy the whole reply and paste it into the box in Content Creator, then',
            '   continue. Your slides are built from it directly - no second AI call.',
            '',
            'Keep the JSON exactly as ChatGPT returns it, including the === NEXT === lines.',
            'If you edit the text by hand, do not remove or rename any field.',
            ''
        ].join('\n');

        const multi = [
            sep,
            'OUTPUT FORMAT FOR THIS FILE',
            sep,
            '',
            'The rules below describe ONE sub topic. This file asks for several.',
            '',
            'Produce one complete JSON object for EACH sub topic listed at the end, in the',
            'order they are listed. Separate consecutive sub topics with a line containing',
            'only:',
            '',
            '=== NEXT ===',
            '',
            'Each object must be { "cards": [ ... ] } with exactly ' + cardCount + ' cards.',
            'Do not combine sub topics. Do not skip any. Do not write commentary between',
            'them. Do not wrap the JSON in markdown code fences.',
            ''
        ].join('\n');

        return [
            howTo,
            (contextBlock || '').trim(),
            '',
            systemPrompt.trim(),
            '',
            multi,
            (topicsBlock || '').trim(),
            ''
        ].filter(function (part, i) { return i === 0 || part !== ''; }).join('\n\n');
    };

    // ===========================================================================
    // USER PROMPT BUILDERS
    // ===========================================================================

    // FIX-CC-MULTILANG-TEXT (v12.69): Returns a hard language gate injected at the
    // TOP of every user prompt when the generation language is non-English.
    // The system prompt already appends getLanguageInstructions() but OpenAI models
    // weight the user message language heavily — 12,000 chars of English reference
    // material in the user prompt was overriding the system-prompt Spanish/etc.
    // instruction, causing the AI to produce English card content even for Spanish
    // additional-language generations.  Placing the requirement as the FIRST line
    // of the user prompt forces the model to see it before any English context.
    const getLangPrefixForUserPrompt = (context) => {
        const lang = context?.language || 'en-AU';
        if (lang.startsWith('en-')) return '';
        const langName = getLanguageName(lang);
        return `!!LANGUAGE OVERRIDE — OUTPUT IN ${langName.toUpperCase()} ONLY!!
Do NOT write a single word in English (except JSON field names and unit codes).
This training is based on Australian workplace content — the reference material and unit codes will be in English. That is fine.
Use the English content as subject-matter context only. Write ALL card output as if this training was originally created for ${langName}-speaking workers.

`;
    };

    // FIX-CC-MULTILANG-SUFFIX (v13.10): Returns a language reminder injected at the
    // END of every user prompt when the generation language is non-English.
    // OpenAI attends most heavily to the LAST instruction it reads before generating.
    // When the user prompt ends with "Generate the full 7-card sequence." (in English),
    // that final English phrase overrides the language guard placed at the top — causing
    // German/Spanish/etc. generation to silently produce English content even though the
    // mandatory prefix and system-prompt language block are both present.
    // Fix: append a compact language reminder as the absolute last line so the model's
    // final instruction is unambiguously in the target language.
    const getLangSuffixForUserPrompt = (context) => {
        const lang = context?.language || 'en-AU';
        if (lang.startsWith('en-')) return '';
        const langName = getLanguageName(lang);
        return `

FINAL REMINDER — OUTPUT LANGUAGE IS ${langName.toUpperCase()}:
Write your ENTIRE JSON response in ${langName}. Every value in every field must be in ${langName}.
Do NOT use English for any card content. Ignore any English writing style or spelling rules above — they do not apply here.`;
    };

    // v13.91: Route 5. Deliberately the leanest user prompt of the five - this route takes
    // a topic and an audience and nothing else, because the whole point is that it works on
    // any subject without a jurisdiction, an industry, a unit code or a job role.
    const buildTopicsTextUserPrompt = (context, topic) => {
        const langPrefix = getLangPrefixForUserPrompt(context);
        const langSuffix = getLangSuffixForUserPrompt(context);
        const lines = [];
        lines.push(`- Topic: ${topic.title || topic.name || ''}`);
        if (topic.outcome) { lines.push(`- What the reader should understand: ${topic.outcome}`); }
        if (context.subjectArea) { lines.push(`- Subject area: ${context.subjectArea}`); }
        if (context.targetAudience) { lines.push(`- Written for: ${context.targetAudience}`); }
        if (context.courseName) { lines.push(`- Part of: ${context.courseName}`); }

        // v13.92: the v13.91 mechanism-structure pin is gone with the card it pinned.
        // Card 3 is now examples-and-application, which has no structure to choose.

        return `${langPrefix}Write a short-course text module: 4 short prose cards plus 1 question card.

CONTEXT:
${lines.join('\n')}
${topic.keyPoints?.length ? `\nPOINTS THAT MUST BE COVERED: ${ccTextList(topic.keyPoints).join('; ')}` : ''}
${context.additionalInstructions ? `\nAUTHOR INSTRUCTIONS: ${context.additionalInstructions}` : ''}
${context.priorityContent ? `\nREFERENCE MATERIAL:\n${ccRelevantSource(context.priorityContent, topic, CC_SOURCE_BUDGET)}` : ''}

Write all 5 cards in order: overview, key-concepts, examples-application, key-takeaways, decision-point.
Remember: no heading fields on cards 1-4, exactly two paragraphs each, 55-70 words per paragraph, and never the characters backslash-n anywhere.${ccSiblingBlock(topic)}${langSuffix}`;
    };

    /**
     * v13.96 FIX-CC-SAMENESS: pick a scenario opening for this section.
     *
     * Nothing in the pipeline recorded what a previous subtopic used, and the system
     * prompt is cached and reused byte-identically across every section in a batch, so
     * the only thing that varied was the topic title. Twelve subtopics therefore came
     * back as twelve cards of the same shape, opening the same way - which is the single
     * most common complaint about AI-generated course content.
     *
     * The pin is derived from the topic title rather than a section index so that it
     * needs no change to any call signature, and so that regenerating one subtopic gives
     * it the SAME opening rather than silently reshuffling a course the author has
     * already reviewed.
     *
     * @param {string} title The subtopic title.
     * @param {Array} pool The openings to choose from.
     * @returns {string} One opening from the pool.
     */
    const ccVarietyPick = (title, pool) => {
        const t = String(title || '');
        let h = 0;
        for (let i = 0; i < t.length; i++) {
            h = ((h << 5) - h + t.charCodeAt(i)) | 0;
        }
        return pool[Math.abs(h) % pool.length];
    };

    /**
     * v13.96: scenario openings.
     *
     * Split by route: the shop-floor entries (equipment, shift, handover) contradict the
     * PD identity block, which forbids naming equipment or worksites and says a card that
     * could be satisfied by a checklist is the wrong card. One shared pool would have
     * ordered roughly three PD sections in eight to open on something its own system
     * prompt bans.
     */
    const CC_SCENARIO_OPENINGS = [
        'a handover, where something has not been passed on',
        'an interruption partway through a task',
        'a piece of equipment or a system behaving in a way it should not',
        'a document, reading or record that does not match what is actually there',
        'a request from someone outside the immediate team',
        'a routine step that is about to be skipped because everyone is busy',
        'the end of a shift or day, with something still outstanding',
        'a new person watching, and copying, how it gets done'
    ];

    /** v13.96: the same idea in a register Professional Development can actually use. */
    const CC_SCENARIO_OPENINGS_PD = [
        'a handover of work, where something has not been passed on',
        'an interruption partway through a conversation that mattered',
        'a message or email that reads worse than it was meant to',
        'a decision someone has already made that you disagree with',
        'a request from outside your team that cuts across your priorities',
        'a difficult point everyone is avoiding raising',
        'the end of a week, with something still unsaid',
        'a newer colleague watching how you handle it'
    ];

    /**
     * v13.96: the per-section variety block appended to the three unified user prompts.
     *
     * @param {string} title The subtopic title.
     * @param {string} mode The route id, so PD gets a register it is allowed to use.
     * @returns {string} The variety instruction.
     */
    /**
     * v13.98.2: WHO the learner is dealing with, and WHERE.
     *
     * The old pool listed EVENTS - a handover, an interruption, a routine step about to
     * be skipped. Those vary the plot and leave the setting untouched, so every section
     * still opened in the same place: five slides of the reviewed pack all began "During
     * a team meeting, the nutritionist explains...". An internal meeting where colleagues
     * discuss the topic is the most boring opening available and it is the model's
     * default, because it is the safest reading of "workplace training".
     *
     * A learner remembers a situation with a person in it and something at stake. These
     * pools vary the PERSON and the SETTING; the event pool below still varies the plot.
     */
    const CC_SCENARIO_SITUATIONS = [
        'a customer or client in front of you, asking for something specific',
        'a job away from your usual place of work, for someone who is not your colleague',
        'a person who has already been given the wrong answer by someone else',
        'someone at the very start - new, uncertain, and about to make a common mistake',
        'a regular you know well, whose situation has just changed',
        'a request that arrives at the worst possible time, from someone who cannot wait',
        'an experienced person who is confident and wrong',
        'someone who has come back because the first attempt did not work'
    ];

    /** The same idea for Professional Development, where the other party is a colleague. */
    const CC_SCENARIO_SITUATIONS_PD = [
        'a colleague who has asked you directly for help and is waiting on your answer',
        'someone more senior than you who has already decided',
        'a person who is new and is copying how you do it',
        'someone who has been quietly avoiding this conversation for weeks',
        'a peer in another team whose priorities cut across yours',
        'a person who is upset, and right',
        'someone who is confident and wrong, in front of other people',
        'a person you got this wrong with once before'
    ];

    /**
     * v13.96: the per-section variety block appended to the three unified user prompts.
     * v13.98.2: rewritten. It now varies the SITUATION as well as the event, pins the
     * choice to the section INDEX rather than a title hash so two sections in one pack
     * can never collide, bans the internal-meeting default outright, and tells the model
     * what to do with a thin context instead of retreating to a meeting room.
     *
     * @param {string} title The subtopic title.
     * @param {string} mode The route id, so PD gets a register it is allowed to use.
     * @param {Object} topic The section, for its index within the pack.
     * @param {Object} context The generation context, to judge how specific it is.
     * @returns {string} The variety instruction.
     */
    const ccVarietyBlock = (title, mode, topic, context) => {
        const pool = (mode === 'pd') ? CC_SCENARIO_OPENINGS_PD : CC_SCENARIO_OPENINGS;
        const sits = (mode === 'pd') ? CC_SCENARIO_SITUATIONS_PD : CC_SCENARIO_SITUATIONS;

        // Pin by section index where we have one: two sections in the same pack then
        // cannot draw the same situation, which a title hash could not guarantee.
        const idx = (topic && typeof topic._sectionIndex === 'number') ? topic._sectionIndex : null;
        const sit1 = (idx === null) ? ccVarietyPick(title, sits) : sits[idx % sits.length];
        const sit2 = (idx === null)
            ? ccVarietyPick(title + '~s', sits)
            : sits[(idx + 3) % sits.length];
        const open1 = (idx === null) ? ccVarietyPick(title, pool) : pool[idx % pool.length];
        let open2 = (idx === null) ? ccVarietyPick(title + '~4', pool) : pool[(idx + 3) % pool.length];
        if (open2 === open1) { open2 = pool[(pool.indexOf(open1) + 3) % pool.length]; }

        // How much did the author actually tell us? A specific commercial setting must be
        // used; a thin one must be INVENTED specifically, not retreated from.
        const specifics = [context && (context.workplace || context.companyName),
            context && (context.industryContext || context.industry),
            context && (context.jobRole || context.jobTitle || context.learnerRole),
            context && context.targetAudience]
            .filter(function (v) { return v && String(v).trim() && String(v).trim().toLowerCase() !== 'general'; });
        const thin = specifics.length < 2;

        const contextRule = thin
            ? `THE CONTEXT YOU HAVE BEEN GIVEN IS THIN, so you must INVENT a specific one and commit to it.
Do not retreat to something generic because the brief is general - a general brief is permission to
choose, not a reason to write about nobody. Pick a real, plausible, particular situation in which a
person would need exactly this subject, name it, and write the whole card inside it. "You are doing
some consulting work for a local women's hockey side and they want to know how energy systems apply
to a Saturday double-header" teaches; "in a meeting the team discusses energy systems" does not.
Each slide in this pack must choose a DIFFERENT situation, a different kind of person and a
different setting, so that the pack reads as a working life rather than one long meeting.`
            : `THE CONTEXT YOU HAVE BEEN GIVEN IS SPECIFIC (${specifics.slice(0, 3).join('; ')}).
Set the scenario inside that commercial reality, in the place where this work is actually done and
with the people who are actually there. If the brief is retail supplement sales, the scene is a
customer at the counter asking a question a staff member has to answer on the spot - not a team
meeting about customers. Each slide in this pack takes a DIFFERENT customer, a different reason for
asking and a different pressure, so the pack covers the range of the job.`;

        return `

VARIETY  -  this section sits alongside others in the same course and must not read like them.
${contextRule}

BANNED OPENING, no exceptions: an internal meeting, briefing, huddle, training session, workshop or
catch-up in which colleagues discuss the topic. "During a team meeting, X explains Y" is the single
most common and least memorable way to open a card, it puts the learner in the audience rather than
in the job, and it is where content goes when the writer has not chosen a situation. If the only
scene you can picture is people talking about the subject, you have not picked a scenario yet.
The learner is DOING the work, or is the person being asked, not watching someone else explain it.

Card 1 of this section is built around ${sit1}, and turns on ${open1}.
Card 4 is built around ${sit2}, and turns on ${open2}.
Do not open either card with "It is", "You are", "As a", "During" or "Imagine". Name people by role
or by name, never "the worker" or "the employee". Card 4 keeps Card 1's people and task by design,
so vary the TIME and the PLACE between them, not who is there. Pick the per-item icons from what
each item actually means, so two sections do not carry the same four icons in the same order.`;
    };

    /**
     * v13.98: tell each slide what the OTHER slides in the pack are teaching.
     *
     * Sections generate in parallel, so there is no reliable "what has already been
     * written" to pass. What IS known before any call is made is every slide's title
     * and its position, and that is enough to stop the failure actually observed: five
     * slides in one pack each opening with the same general explanation of the same
     * three systems, because none of them knew the others existed. A model asked to
     * "explain X for slide 4" with no other information writes the general summary,
     * which is exactly what it did five times.
     *
     * generator.js stamps _siblingTitles / _sectionIndex on each section before the
     * workers start. Absent (older manifests, single-section packs) this returns ''.
     *
     * @param {Object} topic The section being generated.
     * @return {String} The block, or '' when there are no siblings.
     */
    /**
     * v13.98.3: academic-register variety, for the one route that had none.
     *
     * ccVarietyBlock is appended by the VET, Workplace and PD user prompts. University's
     * was never wired up - and University is the route that asks for TWO case studies
     * which must differ in setting, differ in questions and disagree with each other,
     * with no source of variation supplied and a system prompt that is cached
     * byte-identically across every section of a course. Twelve academic sections drew
     * from the same default with only the title changing, which is precisely the
     * sameness failure ccVarietyBlock was written for in v13.96.
     */
    const CC_CASE_SETTINGS_UNI = [
        'a regulator reviewing a decision after the fact',
        'a practitioner applying the framework under time pressure with incomplete data',
        'a research team whose result did not replicate',
        'a policy that worked in one jurisdiction and failed in another',
        'a contested case where two experts read the same evidence differently',
        'an early application of the idea, before its limits were known',
        'a case at the boundary of the framework, where it starts to break down',
        'a practitioner from an adjacent discipline reaching a different conclusion'
    ];

    /**
     * The University equivalent of ccVarietyBlock.
     *
     * @param {string} title The section title.
     * @param {Object} topic The section, for its index within the pack.
     * @returns {string} The variety instruction.
     */
    const ccUniVarietyBlock = (title, topic) => {
        const idx = (topic && typeof topic._sectionIndex === 'number') ? topic._sectionIndex : null;
        const s1 = (idx === null) ? ccVarietyPick(title, CC_CASE_SETTINGS_UNI)
            : CC_CASE_SETTINGS_UNI[idx % CC_CASE_SETTINGS_UNI.length];
        let s2 = (idx === null) ? ccVarietyPick(title + '~2', CC_CASE_SETTINGS_UNI)
            : CC_CASE_SETTINGS_UNI[(idx + 3) % CC_CASE_SETTINGS_UNI.length];
        if (s2 === s1) { s2 = CC_CASE_SETTINGS_UNI[(CC_CASE_SETTINGS_UNI.indexOf(s1) + 3) % CC_CASE_SETTINGS_UNI.length]; }
        return `

VARIETY  -  this section sits alongside others in the same course and must not read like them.
Case study 1 is set in ${s1}.
Case study 2 is set in ${s2}, and must reach a conclusion that case study 1 does not support.
Neither may be a lecture, a seminar, a tutorial, a reading group or a student assignment: put
the framework in the hands of someone who has to ACT on it and carries the consequence. Name
the discipline's real particulars - the institution, the year, the dataset, the jurisdiction,
the researcher - so the two cases could not be swapped for each other or for another section's.`;
    };

    const ccSiblingBlock = (topic) => {
        const siblings = (topic && Array.isArray(topic._siblingTitles)) ? topic._siblingTitles : null;
        if (!siblings || siblings.length < 2) { return ''; }
        const idx = (topic._sectionIndex || 0);
        const others = siblings
            .map(function (t, i) { return (i === idx) ? null : (i + 1) + '. ' + t; })
            .filter(Boolean);
        if (!others.length) { return ''; }
        return `

THIS PACK'S OTHER SLIDES  -  you are writing slide ${idx + 1} of ${siblings.length}, "${siblings[idx] || ''}".
The other slides in this pack cover:
${others.join('\n')}
Their material is THEIRS. Do not teach it, summarise it or re-introduce it from scratch on your
slide - assume the learner has it. Your slide must add something none of the others contains.
If your title names a narrower subject than the pack as a whole, write about that narrower subject
and not about the pack's general theme. A reader comparing your slide with the list above must be
able to say what is on yours and not on any of theirs.`;
    };

    /**
     * v13.99: GIVE EACH SLIDE THE PART OF THE SOURCE THAT IS ABOUT IT.
     *
     * Every route builder interpolated `ccRelevantSource(context.priorityContent, topic, CC_SOURCE_BUDGET)` -
     * the FIRST twelve thousand characters, identically, for every section in the pack.
     *
     * The Sports Nutrition source that produced the reviewed pack is 36,802 characters.
     * Topics 3, 4 and 5 begin at 14,609, 21,290 and 28,302. So the slides titled
     * "Matching Nutrition and Supplements to Exercise", "Endurance Nutrition and Advanced
     * Fuelling Strategies" and "Nutrition During Exercise and Recovery" were generated
     * having been shown NONE of their own material. The model could not cite 10-12 g/kg,
     * the 2-3% gain, the Louise Burke study, beta-alanine, the carbohydrate mouth rinse
     * or 30 g/hour, because it was never given them. It was handed the first two topics
     * and asked to write about the last three.
     *
     * That is not a prompt failure or a model failure. It is the single largest cause of
     * generic content in this product, and every audit up to this point missed it,
     * because from inside the prompt the material looks present.
     *
     * This picks the blocks of the source that are actually about THIS section, keeps the
     * opening for framing, and returns them in their original order. When the whole
     * source fits in the budget, it is returned unchanged and nothing changes.
     *
     * @param {string} content The full reference material.
     * @param {Object} topic The section being generated.
     * @param {number} limit Character budget.
     * @return {string} The most relevant slice, in document order.
     */
    /**
     * v13.99: how much of the author's reference material each slide is shown.
     *
     * This was 12,000 characters, hard-coded at six call sites, and it was chosen at a
     * time when context windows were small. It is the single largest cause of generic
     * content in this product: a 36,802-character source meant slides 3, 4 and 5 were
     * generated having been shown none of their own material, because the window always
     * started at character zero.
     *
     * 60,000 characters is roughly 15,000 tokens. The models behind every route take
     * 128,000. There is no reason to withhold an author's own material from the thing
     * writing about it, and the cost of doing so is that the pack cannot contain a single
     * figure the author supplied.
     *
     * ccRelevantSource() below still selects when a source exceeds even this, so a very
     * large manual degrades to the most relevant sections rather than the first ones.
     */
    const CC_SOURCE_BUDGET = 60000;

    const ccRelevantSource = (content, topic, limit) => {
        const src = String(content || '');
        limit = limit || 12000;
        if (src.length <= limit) { return src; }

        const title = String((topic && (topic.title || topic.name)) || '');
        const stop = /^(the|and|for|with|from|that|this|are|was|how|why|what|when|its|their|your|you|a|an|of|in|on|to|is|it|be|as|at|by|or|not)$/i;
        const terms = title.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
            .filter(function (w) { return w.length > 2 && !stop.test(w); });

        // Group into SECTIONS, not paragraphs.
        //
        // Splitting on blank lines alone gave 328 fragments for a 37k source, most of them
        // one-line headings. The headings then scored (they repeat the section title) while
        // the paragraphs beneath them - which hold the figures and the named things - did
        // not, so the budget filled with titles and the content they introduce was left
        // behind. A heading has to travel with the text it heads.
        const raw = src.split(/\n\s*\n/);
        const isHeading = function (b) {
            const line = b.trim();
            if (line.length > 90 || line.indexOf('\n') !== -1) { return false; }
            const letters = line.replace(/[^A-Za-z]/g, '');
            if (letters.length < 3) { return false; }
            return (line.replace(/[^A-Z]/g, '').length / letters.length) > 0.7;
        };
        const blocks = [];
        let cur = '';
        raw.forEach(function (b) {
            // A heading starts a new section, provided the current one has some body.
            if (isHeading(b) && cur.length > 400) { blocks.push(cur); cur = b; return; }
            cur = cur ? (cur + '\n\n' + b) : b;
            if (cur.length > 2200) { blocks.push(cur); cur = ''; }
        });
        if (cur.trim()) { blocks.push(cur); }
        const lows = blocks.map(function (b) { return b.toLowerCase(); });

        // Weight a title word by how RARE it is in this document. "Nutrition" and
        // "exercise" appear in every block of a sports-nutrition source and separate
        // nothing; "supplements" and "endurance" appear in one section and separate it
        // completely. Without this the common words drown out the discriminating ones and
        // a section gets the opening of the document again.
        const idf = {};
        terms.forEach(function (t) {
            let df = 0;
            lows.forEach(function (l) { if (l.indexOf(t) !== -1) { df++; } });
            idf[t] = Math.log((blocks.length + 1) / (df + 1)) + 0.25;
        });

        const scored = blocks.map(function (b, i) {
            const low = lows[i];
            let score = 0;
            terms.forEach(function (t) {
                let from = 0, n = 0, at;
                while ((at = low.indexOf(t, from)) !== -1) { n++; from = at + t.length; }
                // Diminishing returns, so one long block cannot dominate on repetition.
                score += Math.min(n, 4) * 10 * idf[t];
            });
            // A block carrying figures is worth more than one that does not: those are
            // the specifics the whole standard is built around.
            const figures = (b.match(/\b\d+(?:[.,\u2013-]\d+)?\s*(?:%|per cent|g\/kg|grams?|kg|mg|ml|minutes?|seconds?|hours?|days?|weeks?|metres?|degrees?)/gi) || []).length;
            score += Math.min(figures, 6) * 4;
            return { i: i, block: b, score: score };
        });

        // The opening always travels: it frames the subject for every section.
        const out = [];
        let used = 0;
        const take = function (entry) {
            if (used + entry.block.length + 2 > limit) { return false; }
            out.push(entry); used += entry.block.length + 2; return true;
        };
        // A small amount of the opening always travels, for framing. Kept deliberately
        // small - it is context, not content, and the section's own material matters more.
        for (let i = 0; i < scored.length && used < limit * 0.08; i++) { take(scored[i]); }
        const taken = {};
        out.forEach(function (e) { taken[e.i] = true; });
        scored.slice().sort(function (a, b) { return b.score - a.score; }).forEach(function (e) {
            if (!taken[e.i] && e.score > 0) { if (take(e)) { taken[e.i] = true; } }
        });
        // Fill what is left with the blocks NEAREST the ones already chosen, so a selected
        // passage arrives with the context around it. Filling in document order instead -
        // which the first version did - spent the remaining budget on the opening of the
        // document all over again, and a section whose material sits at the end still
        // never saw it.
        const chosen = Object.keys(taken).map(Number);
        if (chosen.length) {
            scored.filter(function (e) { return !taken[e.i]; })
                .map(function (e) {
                    let d = Infinity;
                    chosen.forEach(function (c) { d = Math.min(d, Math.abs(c - e.i)); });
                    return { e: e, d: d };
                })
                .sort(function (a, b) { return a.d - b.d || a.e.i - b.e.i; })
                .forEach(function (x) { if (!taken[x.e.i] && take(x.e)) { taken[x.e.i] = true; } });
        }

        out.sort(function (a, b) { return a.i - b.i; });
        return out.map(function (e) { return e.block; }).join('\n\n');
    };

    const buildFiveCardUserPrompt = (context, topic) => {
        if (context?.mode === 'general') {
            return buildGeneralFiveCardUserPrompt(context, topic);
        }
        if (context?.mode === 'topicstext') {
            return buildTopicsTextUserPrompt(context, topic);
        }
        if (context?.mode === 'university') {
            return buildUniversityFiveCardUserPrompt(context, topic);
        }
        if (context?.mode === 'workplace') {
            return buildWorkplaceFiveCardUserPrompt(context, topic);
        }
        if (context?.mode === 'pd') {
            return buildPDFiveCardUserPrompt(context, topic);
        }
        return buildVetFiveCardUserPrompt(context, topic);
    };

    const buildGeneralFiveCardUserPrompt = (context, topic) => {
        const langPrefix = getLangPrefixForUserPrompt(context);
        const langSuffix = getLangSuffixForUserPrompt(context);
        const learner = context.targetAudience || context.learnerRole || context.jobTitle || 'Adult learner';
        const level = context.experienceLevel || context.jobLevel || 'Beginner to intermediate';
        const desiredOutcome = topic.outcome || context.desiredOutcome || context.learningOutcome || '';
        const struggles = context.learnerChallenges || context.commonStruggles || context.whatUsuallyGoesWrong || '';
        const realExample = context.realExample || context.exampleToInclude || '';
        const duration = context.courseDuration || context.duration || context.estimatedDuration || '';
        return `${langPrefix}Create a 6-card General learning sequence: Orient, Understand, Explore, Apply, Challenge, Consolidate.

CONTEXT:
- Course/Topic: ${context.courseName || context.courseTitle || topic.title || topic.name || ''}
- Section Topic: ${topic.title || topic.name || ''}
- Target Learner: ${learner}
- Experience Level: ${level}
${duration ? `- Approximate Course Duration: ${duration}` : ''}
${desiredOutcome ? `\nDESIRED LEARNING OUTCOME: ${desiredOutcome}` : ''}
${topic.keyPoints?.length ? `\nKEY POINTS: ${ccTextList(topic.keyPoints).join('; ')}` : ''}
${struggles ? `\nWHAT LEARNERS USUALLY STRUGGLE WITH: ${struggles}` : ''}
${realExample ? `\nREAL EXAMPLE TO INCORPORATE WHERE USEFUL: ${realExample}` : ''}
${context.additionalInstructions ? `\nTEACHER INSTRUCTIONS: ${context.additionalInstructions}` : ''}
${context.priorityContent ? `\nREFERENCE MATERIAL:\n${ccRelevantSource(context.priorityContent, topic, CC_SOURCE_BUDGET)}` : ''}

Privately classify the learning type and build the six-card General Learning Blueprint before drafting -
Orient, Understand, Explore, Apply, Challenge, Consolidate - then write the full 6-card sequence. Reduce
scope rather than depth if the duration is short.${ccSiblingBlock(topic)}${ccVarietyBlock(topic.title || topic.name || '', 'general', topic, context)}${langSuffix}`;
    };

    const buildVetFiveCardUserPrompt = (context, topic) => {
        const langPrefix = getLangPrefixForUserPrompt(context);
        const langSuffix = getLangSuffixForUserPrompt(context);
        const contextLines = [];
        if (context.unitCode) contextLines.push(`- Unit Code: ${context.unitCode}`);
        if (context.unitTitle) contextLines.push(`- Unit Title: ${context.unitTitle}`);
        contextLines.push(`- Topic: ${topic.title || topic.name || ''}`);
        contextLines.push(`- Learner Role: ${context.learnerRole || context.jobTitle || 'Worker'}`);
        contextLines.push(`- Industry: ${context.industryContext || context.industry || 'General'}`);
        contextLines.push(`- Location: ${context.location || context.country || 'Australia'}${context.state ? `, ${context.state}` : ''}`);
        contextLines.push(`- Job Level: ${context.jobLevel || 'Worker'}`);
        if (context.equipmentList?.length) contextLines.push(`- Equipment: ${context.equipmentList.join('; ')}`);
        
        return `${langPrefix}Create a 7-card vocational learning sequence.

CONTEXT:
${contextLines.join('\n')}
${context.jobTasks?.length ? `\nJOB TASKS: ${context.jobTasks.join('; ')}` : ''}
${topic.elementText ? `\nELEMENT: ${topic.elementText}` : ''}
${topic.criterionText ? `\nPERFORMANCE CRITERIA: ${topic.criterionText}` : ''}
${topic.knowledgeEvidence ? `\nKNOWLEDGE EVIDENCE: ${topic.knowledgeEvidence}` : ''}
${topic.performanceEvidence ? `\nPERFORMANCE EVIDENCE: ${topic.performanceEvidence}` : ''}
${topic.foundationSkills ? `\nFOUNDATION SKILLS: ${typeof topic.foundationSkills === 'string' ? topic.foundationSkills : ccTextList(topic.foundationSkills).join('; ')}` : ''}
${topic.assessmentConditions ? `\nASSESSMENT CONDITIONS: ${typeof topic.assessmentConditions === 'string' ? topic.assessmentConditions : ccTextList(topic.assessmentConditions).join('; ')}` : ''}
${context.courseDuration || context.duration ? `\nCOURSE DURATION: ${context.courseDuration || context.duration}` : ''}
${context.learnerChallenges || context.commonStruggles ? `\nWHAT LEARNERS USUALLY STRUGGLE WITH: ${context.learnerChallenges || context.commonStruggles}` : ''}
${context.realExample || context.exampleToInclude ? `\nREAL WORKPLACE EXAMPLE TO INCORPORATE: ${context.realExample || context.exampleToInclude}` : ''}
${topic.keyPoints?.length ? `\nKEY POINTS: ${ccTextList(topic.keyPoints).join('; ')}` : ''}
${context.additionalInstructions ? `\nTEACHER INSTRUCTIONS: ${context.additionalInstructions}` : ''}
${context.priorityContent ? `\nREFERENCE MATERIAL:\n${ccRelevantSource(context.priorityContent, topic, CC_SOURCE_BUDGET)}` : ''}

Generate the full 7-card sequence.${ccSiblingBlock(topic)}${ccVarietyBlock(topic.title || topic.name || '', context.mode, topic, context)}${langSuffix}`;
    };

    const buildWorkplaceFiveCardUserPrompt = (context, topic) => {
        const langPrefix = getLangPrefixForUserPrompt(context);
        const langSuffix = getLangSuffixForUserPrompt(context);
        const contextLines = [];
        if (context.trainingType) contextLines.push(`- Training Type: ${context.trainingType}`);
        if (context.companyName) contextLines.push(`- Company: ${context.companyName}`);
        if (context.department) contextLines.push(`- Department: ${context.department}`);
        if (context.targetAudience) contextLines.push(`- Target Audience: ${context.targetAudience}`);
        contextLines.push(`- Topic: ${topic.title || topic.name || ''}`);
        contextLines.push(`- Learner Role: ${context.learnerRole || context.jobTitle || 'Worker'}`);
        contextLines.push(`- Industry: ${context.industryContext || context.industry || 'General'}`);
        contextLines.push(`- Location: ${context.location || context.country || 'Australia'}${context.state ? `, ${context.state}` : ''}`);
        contextLines.push(`- Job Level: ${context.jobLevel || 'Worker'}`);
        if (context.equipmentList?.length) contextLines.push(`- Equipment: ${context.equipmentList.join('; ')}`);
        
        return `${langPrefix}Create a 7-card workplace training sequence.

CONTEXT:
${contextLines.join('\n')}
${context.jobTasks?.length ? `\nJOB TASKS: ${context.jobTasks.join('; ')}` : ''}
${topic.keyPoints?.length ? `\nKEY POINTS: ${ccTextList(topic.keyPoints).join('; ')}` : ''}
${context.desiredOutcome || context.learningOutcome ? `\nDESIRED BEHAVIOUR/OUTCOME: ${context.desiredOutcome || context.learningOutcome}` : ''}
${context.courseDuration || context.duration ? `\nCOURSE DURATION: ${context.courseDuration || context.duration}` : ''}
${context.learnerChallenges || context.whatUsuallyGoesWrong ? `\nWHAT USUALLY GOES WRONG: ${context.learnerChallenges || context.whatUsuallyGoesWrong}` : ''}
${context.realExample || context.exampleToInclude ? `\nREAL WORKPLACE EXAMPLE: ${context.realExample || context.exampleToInclude}` : ''}
${context.additionalInstructions ? `\nTRAINER INSTRUCTIONS: ${context.additionalInstructions}` : ''}
${context.priorityContent ? `\nREFERENCE MATERIAL:\n${ccRelevantSource(context.priorityContent, topic, CC_SOURCE_BUDGET)}` : ''}

Generate the full 7-card sequence.${ccSiblingBlock(topic)}${ccVarietyBlock(topic.title || topic.name || '', context.mode, topic, context)}${langSuffix}`;
    };

    const buildPDFiveCardUserPrompt = (context, topic) => {
        const langPrefix = getLangPrefixForUserPrompt(context);
        const langSuffix = getLangSuffixForUserPrompt(context);
        const contextLines = [];
        if (context.trainingType) contextLines.push(`- Training Type: ${context.trainingType}`);
        if (context.companyName) contextLines.push(`- Organisation: ${context.companyName}`);
        if (context.department) contextLines.push(`- Department: ${context.department}`);
        if (context.targetAudience) contextLines.push(`- Target Audience: ${context.targetAudience}`);
        contextLines.push(`- Topic: ${topic.title || topic.name || ''}`);
        contextLines.push(`- Learner Role: ${context.learnerRole || context.jobTitle || 'Professional'}`);
        contextLines.push(`- Industry: ${context.industryContext || context.industry || 'General'}`);
        contextLines.push(`- Location: ${context.location || context.country || 'Australia'}${context.state ? `, ${context.state}` : ''}`);
        contextLines.push(`- Experience Level: ${context.jobLevel || 'Mid-career professional'}`);
        
        return `${langPrefix}Create a 7-card professional development learning sequence.

CONTEXT:
${contextLines.join('\n')}
${topic.keyPoints?.length ? `\nKEY POINTS: ${ccTextList(topic.keyPoints).join('; ')}` : ''}
${context.additionalInstructions ? `\nFACILITATOR INSTRUCTIONS: ${context.additionalInstructions}` : ''}
${context.priorityContent ? `\nREFERENCE MATERIAL:\n${ccRelevantSource(context.priorityContent, topic, CC_SOURCE_BUDGET)}` : ''}

Generate the full 7-card sequence.${ccSiblingBlock(topic)}${ccVarietyBlock(topic.title || topic.name || '', context.mode, topic, context)}${langSuffix}`;
    };

    const BLOOMS_LEVEL_INSTRUCTIONS = {
        remember: {
            verb: 'Remember',
            verbs: 'list, define, identify, name, recall, recognise',
            scenarioFocus: 'The scenario should test whether the learner can accurately recall key facts, definitions, or sequences relevant to the topic.',
            decisionFocus: 'Decision options should distinguish between correct and incorrect recall of foundational knowledge. Wrong options should reflect common memory errors or confusions between similar terms.',
            feedbackFocus: 'Feedback should clarify the correct definition or fact and explain why the common confusions arise.'
        },
        understand: {
            verb: 'Understand',
            verbs: 'explain, describe, summarise, interpret, classify',
            scenarioFocus: 'The scenario should test whether the learner can explain a concept in their own words or interpret information correctly.',
            decisionFocus: 'Decision options should distinguish between correct interpretation and common misunderstandings. Wrong options should reflect superficial or literal misreadings.',
            feedbackFocus: 'Feedback should clarify the correct interpretation and explain what the common misunderstandings miss.'
        },
        apply: {
            verb: 'Apply',
            verbs: 'demonstrate, implement, calculate, solve, use, apply',
            scenarioFocus: 'The scenario should present a situation where the learner must apply a concept, method, or framework to solve a specific problem.',
            decisionFocus: 'Decision options should distinguish between correct application and common misapplication. Wrong options should reflect procedural errors or inappropriate transfer.',
            feedbackFocus: 'Feedback should explain why the correct application works and what goes wrong with the incorrect approaches.'
        },
        analyse: {
            verb: 'Analyse',
            verbs: 'compare, contrast, examine, differentiate, distinguish, critique',
            scenarioFocus: 'The scenario should require the learner to break down a complex situation, compare competing explanations, or examine evidence critically.',
            decisionFocus: 'Decision options should distinguish between rigorous analysis and surface-level or biased reasoning. Wrong options should reflect common analytical errors like confirmation bias or false equivalence.',
            feedbackFocus: 'Feedback should explain the analytical reasoning behind the correct answer and identify the specific reasoning flaws in wrong options.'
        },
        analyze: {
            verb: 'Analyse',
            verbs: 'compare, contrast, examine, differentiate, distinguish, critique',
            scenarioFocus: 'The scenario should require the learner to break down a complex situation, compare competing explanations, or examine evidence critically.',
            decisionFocus: 'Decision options should distinguish between rigorous analysis and surface-level or biased reasoning. Wrong options should reflect common analytical errors like confirmation bias or false equivalence.',
            feedbackFocus: 'Feedback should explain the analytical reasoning behind the correct answer and identify the specific reasoning flaws in wrong options.'
        },
        evaluate: {
            verb: 'Evaluate',
            verbs: 'assess, justify, argue, defend, judge, recommend',
            scenarioFocus: 'The scenario should require the learner to make a judgement about the quality, validity, or appropriateness of an argument, method, or source.',
            decisionFocus: 'Decision options should distinguish between well-supported judgements and poorly reasoned evaluations. Wrong options should reflect common evaluation errors like appeal to authority or ignoring limitations.',
            feedbackFocus: 'Feedback should explain the criteria for sound evaluation and why the incorrect judgements fail those criteria.'
        },
        create: {
            verb: 'Create',
            verbs: 'design, develop, construct, propose, formulate, synthesise',
            scenarioFocus: 'The scenario should require the learner to synthesise information from multiple sources or design an original approach to a problem.',
            decisionFocus: 'Decision options should distinguish between creative synthesis and mere aggregation or copying. Wrong options should reflect approaches that lack originality or miss key integration points.',
            feedbackFocus: 'Feedback should explain what makes the correct synthesis effective and what the weaker approaches fail to integrate.'
        }
    };

    const buildUniversityFiveCardUserPrompt = (context, topic) => {
        const langPrefix = getLangPrefixForUserPrompt(context);
        const langSuffix = getLangSuffixForUserPrompt(context);
        const bloomsKey = (context.bloomsLevel || 'apply').toLowerCase();
        const bloomsInfo = BLOOMS_LEVEL_INSTRUCTIONS[bloomsKey] || BLOOMS_LEVEL_INSTRUCTIONS.apply;

        return `${langPrefix}Create a 7-card academic learning sequence.

CONTEXT:
- Course: ${context.courseName || ''}
- Subject Area: ${context.subjectArea || ''}
- Topic: ${topic.title || topic.name || ''}
- Discipline: ${context.industryContext || context.industry || 'General'}
- Academic Level: ${context.courseLevel || 'Undergraduate'}
- Bloom's Level: ${bloomsInfo.verb} (use verbs: ${bloomsInfo.verbs})
${context.location || context.country ? `- Jurisdiction for any legal, regulatory or professional-body reference: ${context.location || context.country}${context.state ? `, ${context.state}` : ''}` : ''}
${topic.outcome ? `\nLEARNING OUTCOME: ${topic.outcome}` : ''}
${context.courseDuration || context.duration ? `\nCOURSE DURATION: ${context.courseDuration || context.duration}` : ''}
${context.keyTheoryResearcher ? `\nTHEORY/RESEARCHER TO EMPHASISE: ${context.keyTheoryResearcher}` : ''}
${context.learnerChallenges || context.commonMisconception ? `\nCOMMON STUDENT MISUNDERSTANDING: ${context.learnerChallenges || context.commonMisconception}` : ''}
${context.realExample || context.exampleToInclude ? `\nCASE/EXAMPLE TO INCORPORATE: ${context.realExample || context.exampleToInclude}` : ''}
${topic.keyPoints?.length ? `\nKEY POINTS: ${ccTextList(topic.keyPoints).join('; ')}` : ''}
${context.additionalInstructions ? `\nAUTHOR INSTRUCTIONS: ${context.additionalInstructions}` : ''}
${context.priorityContent ? `\nREFERENCE MATERIAL:\n${ccRelevantSource(context.priorityContent, topic, CC_SOURCE_BUDGET)}` : ''}

BLOOM'S TARGETING: ${bloomsInfo.scenarioFocus} ${bloomsInfo.decisionFocus || ''} ${bloomsInfo.feedbackFocus || ''}

Generate the full 7-card sequence.${ccUniVarietyBlock(topic.title || topic.name || '', topic)}${ccSiblingBlock(topic)}${langSuffix}`;
    };

    // ===========================================================================
    // NORMALIZE CARDS (route-aware)
    // ===========================================================================

    const normalizeCards = (cards, context) => {
        const mode = context?.mode || 'vet';
        const schema = getCardSchemaForMode(mode);
        const expectedCount = schema.cardTypes.length;

        if (!Array.isArray(cards)) return cards;

        // v13.94.3: positional backfill is only safe when the card count matches the
        // schema exactly (e.g. activitiesEnabled === false drops the decision-point).
        // Everything below - the per-route field repairs and the text cleanup at the
        // bottom - keys off cardType, not position, and must run either way. Previously
        // a count mismatch returned early and skipped all of it.
        if (cards.length === expectedCount) {
            cards.forEach((card, i) => {
                if (!card.cardType && card.type) { card.cardType = card.type; delete card.type; }
                if (!card.cardType) card.cardType = schema.cardTypes[i];
                if (!card.contrastType) card.contrastType = schema.contrastTypes[schema.cardTypes[i]];
            });
        } else {
            cards.forEach((card) => {
                if (!card.cardType && card.type) { card.cardType = card.type; delete card.type; }
                if (card.cardType && !card.contrastType && schema.contrastTypes[card.cardType]) {
                    card.contrastType = schema.contrastTypes[card.cardType];
                }
            });
        }

        if (mode === 'vet') {
            const actionCard = cards.find(c => c.cardType === 'action-breakdown');
            if (actionCard && actionCard.actions && Array.isArray(actionCard.actions)) {
                actionCard.actions = actionCard.actions.map(a => {
                    if (typeof a === 'string') return { heading: a, bullets: [] };
                    if (a && !a.heading && a.title) { a.heading = a.title; delete a.title; }
                    if (a && !a.heading && a.name) { a.heading = a.name; delete a.name; }
                    if (a && a.bullets && !Array.isArray(a.bullets)) a.bullets = [a.bullets];
                    if (a && !a.bullets) a.bullets = [];
                    return a;
                });
            }

            const compCard = cards.find(c => c.cardType === 'competence-standard');
            if (compCard && compCard.standardItems && !Array.isArray(compCard.standardItems)) {
                compCard.standardItems = [compCard.standardItems];
            }

            const errCard = cards.find(c => c.cardType === 'common-errors');
            if (errCard && errCard.errorItems && Array.isArray(errCard.errorItems)) {
                errCard.errorItems = errCard.errorItems.map(e => {
                    if (typeof e === 'string') return { error: e, consequence: '' };
                    if (e && !e.error && e.mistake) { e.error = e.mistake; delete e.mistake; }
                    if (e && !e.consequence && e.impact) { e.consequence = e.impact; delete e.impact; }
                    if (e && !e.consequence && e.result) { e.consequence = e.result; delete e.result; }
                    return e;
                });
            }
        }

        if (mode === 'university') {
            const fwCard = cards.find(c => c.cardType === 'theoretical-framework');
            if (fwCard && fwCard.frameworks && Array.isArray(fwCard.frameworks)) {
                fwCard.frameworks = fwCard.frameworks.map(f => {
                    if (typeof f === 'string') return { name: f, originator: '', principle: '', limitation: '' };
                    if (f && !f.name && f.title) { f.name = f.title; delete f.title; }
                    if (f && !f.originator && f.author) { f.originator = f.author; delete f.author; }
                    return f;
                });
            }

            const ethicsCard = cards.find(c => c.cardType === 'ethics-considerations');
            if (ethicsCard && ethicsCard.considerations && Array.isArray(ethicsCard.considerations)) {
                ethicsCard.considerations = ethicsCard.considerations.map(c => {
                    if (typeof c === 'string') return { dimension: '', description: c };
                    if (c && !c.dimension && c.area) { c.dimension = c.area; delete c.area; }
                    if (c && !c.dimension && c.topic) { c.dimension = c.topic; delete c.topic; }
                    return c;
                });
            }

            const anchorCard = cards.find(c => c.cardType === 'concept-anchor');
            if (anchorCard && anchorCard.keyTerms && Array.isArray(anchorCard.keyTerms)) {
                anchorCard.keyTerms = anchorCard.keyTerms.map(t => {
                    if (typeof t === 'string') {
                        const parts = t.split(/\s*[-:]\s*/);
                        return { term: parts[0] || t, definition: parts.slice(1).join(' - ') || '' };
                    }
                    if (typeof t === 'object' && !t.term && t.name) { t.term = t.name; delete t.name; }
                    return t;
                });
            }
        }

        if (mode === 'workplace') {
            const actionFwCard = cards.find(c => c.cardType === 'action-framework');
            if (actionFwCard && actionFwCard.steps && Array.isArray(actionFwCard.steps)) {
                actionFwCard.steps = actionFwCard.steps.map(s => {
                    if (typeof s === 'string') return { action: s, detail: '', timeframe: '' };
                    if (s && !s.action && s.step) { s.action = s.step; delete s.step; }
                    if (s && !s.action && s.title) { s.action = s.title; delete s.title; }
                    return s;
                });
            }

            const riskCard = cards.find(c => c.cardType === 'risk-card');
            if (riskCard && riskCard.risks && Array.isArray(riskCard.risks)) {
                riskCard.risks = riskCard.risks.map(r => {
                    if (typeof r === 'string') return { risk: r, likelihood: 'Medium', impact: '', mitigation: '' };
                    if (r && !r.risk && r.name) { r.risk = r.name; delete r.name; }
                    if (r && !r.risk && r.title) { r.risk = r.title; delete r.title; }
                    return r;
                });
            }

            const polCard = cards.find(c => c.cardType === 'policy-alignment');
            if (polCard && polCard.policyItems && Array.isArray(polCard.policyItems)) {
                polCard.policyItems = polCard.policyItems.map(p => {
                    if (typeof p === 'string') return { policy: p, requirement: '', consequence: '' };
                    if (p && !p.policy && p.name) { p.policy = p.name; delete p.name; }
                    return p;
                });
            }

            const scen2 = cards.find(c => c.cardType === 'scenario-2');
            if (scen2 && scen2.optimisationTips && !Array.isArray(scen2.optimisationTips)) {
                scen2.optimisationTips = [scen2.optimisationTips];
            }
        }

        if (mode === 'pd') {
            const fwCard = cards.find(c => c.cardType === 'core-framework');
            if (fwCard && fwCard.frameworkSteps && Array.isArray(fwCard.frameworkSteps)) {
                fwCard.frameworkSteps = fwCard.frameworkSteps.map(s => {
                    if (typeof s === 'string') return { step: s, explanation: '', example: '' };
                    if (s && !s.step && s.action) { s.step = s.action; delete s.action; }
                    if (s && !s.step && s.title) { s.step = s.title; delete s.title; }
                    if (s && !s.step && s.name) { s.step = s.name; delete s.name; }
                    return s;
                });
            }

            const appCard = cards.find(c => c.cardType === 'application-guide');
            if (appCard && appCard.applications && Array.isArray(appCard.applications)) {
                appCard.applications = appCard.applications.map(a => {
                    if (typeof a === 'string') return { situation: a, action: '', rationale: '' };
                    if (a && !a.situation && a.context) { a.situation = a.context; delete a.context; }
                    if (a && !a.situation && a.scenario) { a.situation = a.scenario; delete a.scenario; }
                    return a;
                });
            }

            const pitCard = cards.find(c => c.cardType === 'common-pitfalls');
            if (pitCard && pitCard.pitfallItems && Array.isArray(pitCard.pitfallItems)) {
                pitCard.pitfallItems = pitCard.pitfallItems.map(p => {
                    if (typeof p === 'string') return { pitfall: p, consequence: '', correction: '' };
                    if (p && !p.pitfall && p.mistake) { p.pitfall = p.mistake; delete p.mistake; }
                    if (p && !p.pitfall && p.error) { p.pitfall = p.error; delete p.error; }
                    if (p && !p.consequence && p.impact) { p.consequence = p.impact; delete p.impact; }
                    if (p && !p.correction && p.fix) { p.correction = p.fix; delete p.fix; }
                    if (p && !p.correction && p.solution) { p.correction = p.solution; delete p.solution; }
                    return p;
                });
            }

            const anchorCard = cards.find(c => c.cardType === 'skill-anchor');
            if (anchorCard && anchorCard.keyIndicators && !Array.isArray(anchorCard.keyIndicators)) {
                anchorCard.keyIndicators = [anchorCard.keyIndicators];
            }
        }

        let allText = JSON.stringify(cards);
        let needsReparse = false;
        if (/\*\*[^*]+\*\*|\*[^*]+\*/.test(allText)) {
            allText = allText.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1');
            needsReparse = true;
        }
        const slangReplacements = [
            ['\\bteam mates\\b', 'team members'],
            ['\\bteam mate\\b', 'team member'],
            ['\\bteammates\\b', 'team members'],
            ['\\bteammate\\b', 'team member'],
            ['\\bmates\\b', 'colleagues'],
            ['\\bmate\\b', 'colleague'],
            ['\\bblokes\\b', 'workers'],
            ['\\bbloke\\b', 'worker'],
            ['\\breckon\\b', 'believe'],
            ['\\bdodgy\\b', 'unsafe'],
            ['\\barvo\\b', 'afternoon'],
            ['\\bsmoko\\b', 'break']
        ];
        for (const [pat, replacement] of slangReplacements) {
            const before = allText;
            allText = allText.replace(new RegExp(pat, 'gi'), replacement);
            if (allText !== before) needsReparse = true;
        }
        // v13.89: doubled-word repair. The ONLY prompt-side change kept from the
        // v13.85-13.87 series: it removes "Smoothly Smoothly" style repeats and has no
        // effect on how much content the model produces.
        //
        // Everything else in those releases that touched the prompts was reverted, on
        // the owner's instruction that 13.83 generated correctly and should simply be
        // used. The four system prompts in this file are now byte-identical to 13.83.
        //
        // NOTE: an earlier version of this comment cited a probe showing the v13.85-87
        // prompts cut output "from 182 words per card to ~110". That claim is RETRACTED.
        // The probe fixture supplied a topic with only {id, title, outcome} and omitted
        // topic.elementText, topic.criterionText, topic.knowledgeEvidence and
        // topic.keyPoints, all of which the VET prompt interpolates - so it measured a
        // starved prompt, not these prompts. No word-count regression is established.
        const DOUBLE_WORD_ALLOWLIST = ['that', 'have', 'said', 'well', 'had', 'long'];
        const beforeDoubles = allText;
        allText = allText.replace(/\b([A-Za-z]{4,})(\s+)\1\b/g, function (match, word, gap) {
            if (DOUBLE_WORD_ALLOWLIST.indexOf(word.toLowerCase()) !== -1) { return match; }
            return word;
        });
        if (allText !== beforeDoubles) { needsReparse = true; }

        if (needsReparse) {
            try {
                return JSON.parse(allText);
            } catch (e) {
                // The slang substitution can break the JSON if it landed inside an escape
                // sequence. Fall through and return the already-parsed cards unchanged.
            }
        }
        
        return cards;
    };

    // ===========================================================================
    // QUALITY GATE (route-aware)
    // ===========================================================================

    // ===========================================================================
    // REPAIR PROMPT BUILDERS (route-aware)
    // ===========================================================================

    const buildContentRepairSystemPrompt = (context) => {

        // v13.98.3: DERIVED FROM THE ROUTE'S OWN SYSTEM PROMPT.
        //
        // This used to be a hand-maintained copy of the card contract, and it had drifted
        // badly. Three independent audits led with the same finding: the generation
        // prompts were fixed in v13.98.2 to ask for THREE short sentences (because two
        // sentences under a 20-word cap cannot carry a 42-58 word field) and these repair
        // prompts still said "EXACTLY 2 sentences, 42-58 words" - re-introducing, on the
        // repair pass, the exact impossibility the release had just removed. Worse, v13.98
        // re-enabled the quality repair, so far MORE sections now see this prompt.
        //
        // The University copy was staler still: eight of eight field ranges predated
        // v13.98.1, and it described six card types while demanding seven.
        //
        // A copy of a contract is a contract that will drift. Topics-and-Text has always
        // built its repair prompt from its own system prompt and has never drifted once,
        // so every route now does the same. The card contract exists in exactly one place
        // per route, and a repair can no longer be told something the generator was not.
        const langBlock = getLanguageInstructions(context?.language || context?.voiceLanguage || 'en-AU');
        return VET_SYSTEM_PROMPT
            + '\n\nYou are REPAIRING an existing pack, not writing a new one.'
            + '\nThe card contract above is authoritative - it is the same contract the'
            + '\npack was generated against.'
            + '\n\nFix ONLY the fields the listed issues name. A field the issues do not'
            + '\nname must come back byte-for-byte unchanged.'
            + '\n\nLength issues run BOTH ways and the issue text says which. An issue'
            + '\nsaying a field is N words and needs X-Y, where N is BELOW X, means ADD a'
            + '\nsentence carrying a specific - a figure, a threshold, a named example, a'
            + '\nnamed person, a named consequence - and keep every sentence already there.'
            + '\nAn issue saying a field is ABOVE its range, or that one option is longer'
            + '\nthan the others, means CUT: remove the weakest clause and move any'
            + '\nreasoning into the feedback field.'
            + '\n\nNever pad with adjectives, restatement or filler. A repair that returns'
            + '\nless content than it was given is discarded and the earlier version ships.'
            + langBlock;
    };

    const buildContentRepairPrompt = (cards, issues, topicTitle = '', context = {}) => {
        const langPrefix = getLangPrefixForUserPrompt(context);
        const industry = context?.industrySector || context?.industry || 'Australian workplace';
        const unitCode = context?.unitCode || '';
        const unitTitle = context?.unitTitle || '';

        return `${langPrefix}SURGICAL FIX for: ${topicTitle || 'workplace training'}
Unit: ${unitCode} ${unitTitle}
Industry: ${industry}
Role: ${context?.jobLevel || context?.learnerRole || 'worker'}

Fix ONLY these structural issues  -  do NOT rewrite or rephrase any other content:
${issues.slice(0, 5).map(i => `- ${i}`).join('\n')}

Keep ALL existing content, scenarios, text, and details exactly as they are.
Only modify the specific broken fields listed above.

CURRENT CARDS:
${JSON.stringify(cards, null, 2)}

Return ONLY a valid JSON object with "cards" array of exactly 7 cards.`;
    };

    const buildUniversityContentRepairSystemPrompt = (context) => {

        // v13.98.3: DERIVED FROM THE ROUTE'S OWN SYSTEM PROMPT.
        //
        // This used to be a hand-maintained copy of the card contract, and it had drifted
        // badly. Three independent audits led with the same finding: the generation
        // prompts were fixed in v13.98.2 to ask for THREE short sentences (because two
        // sentences under a 20-word cap cannot carry a 42-58 word field) and these repair
        // prompts still said "EXACTLY 2 sentences, 42-58 words" - re-introducing, on the
        // repair pass, the exact impossibility the release had just removed. Worse, v13.98
        // re-enabled the quality repair, so far MORE sections now see this prompt.
        //
        // The University copy was staler still: eight of eight field ranges predated
        // v13.98.1, and it described six card types while demanding seven.
        //
        // A copy of a contract is a contract that will drift. Topics-and-Text has always
        // built its repair prompt from its own system prompt and has never drifted once,
        // so every route now does the same. The card contract exists in exactly one place
        // per route, and a repair can no longer be told something the generator was not.
        const langBlock = getLanguageInstructions(context?.language || context?.voiceLanguage || 'en-AU');
        return UNIVERSITY_SYSTEM_PROMPT
            + '\n\nYou are REPAIRING an existing pack, not writing a new one.'
            + '\nThe card contract above is authoritative - it is the same contract the'
            + '\npack was generated against.'
            + '\n\nFix ONLY the fields the listed issues name. A field the issues do not'
            + '\nname must come back byte-for-byte unchanged.'
            + '\n\nLength issues run BOTH ways and the issue text says which. An issue'
            + '\nsaying a field is N words and needs X-Y, where N is BELOW X, means ADD a'
            + '\nsentence carrying a specific - a figure, a threshold, a named example, a'
            + '\nnamed person, a named consequence - and keep every sentence already there.'
            + '\nAn issue saying a field is ABOVE its range, or that one option is longer'
            + '\nthan the others, means CUT: remove the weakest clause and move any'
            + '\nreasoning into the feedback field.'
            + '\n\nNever pad with adjectives, restatement or filler. A repair that returns'
            + '\nless content than it was given is discarded and the earlier version ships.'
            + langBlock;
    };

    const buildUniversityContentRepairPrompt = (cards, issues, topicTitle = '', context = {}) => {
        const langPrefix = getLangPrefixForUserPrompt(context);
        return `${langPrefix}SURGICAL FIX for: ${topicTitle || 'university learning'}
Course: ${context?.courseName || ''}
Discipline: ${context?.subjectArea || context?.industryContext || 'General'}
Level: ${context?.courseLevel || 'Undergraduate'}

Fix ONLY these structural issues  -  do NOT rewrite or rephrase any other content:
${issues.slice(0, 5).map(i => `- ${i}`).join('\n')}

Keep ALL existing content, theory names, case study details, and text exactly as they are.
Only modify the specific broken fields listed above.

CURRENT CARDS:
${JSON.stringify(cards, null, 2)}

Return ONLY a valid JSON object with "cards" array of exactly 7 cards.`;
    };

    const buildWorkplaceContentRepairSystemPrompt = (context) => {

        // v13.98.3: DERIVED FROM THE ROUTE'S OWN SYSTEM PROMPT.
        //
        // This used to be a hand-maintained copy of the card contract, and it had drifted
        // badly. Three independent audits led with the same finding: the generation
        // prompts were fixed in v13.98.2 to ask for THREE short sentences (because two
        // sentences under a 20-word cap cannot carry a 42-58 word field) and these repair
        // prompts still said "EXACTLY 2 sentences, 42-58 words" - re-introducing, on the
        // repair pass, the exact impossibility the release had just removed. Worse, v13.98
        // re-enabled the quality repair, so far MORE sections now see this prompt.
        //
        // The University copy was staler still: eight of eight field ranges predated
        // v13.98.1, and it described six card types while demanding seven.
        //
        // A copy of a contract is a contract that will drift. Topics-and-Text has always
        // built its repair prompt from its own system prompt and has never drifted once,
        // so every route now does the same. The card contract exists in exactly one place
        // per route, and a repair can no longer be told something the generator was not.
        const langBlock = getLanguageInstructions(context?.language || context?.voiceLanguage || 'en-AU');
        return WORKPLACE_SYSTEM_PROMPT
            + '\n\nYou are REPAIRING an existing pack, not writing a new one.'
            + '\nThe card contract above is authoritative - it is the same contract the'
            + '\npack was generated against.'
            + '\n\nFix ONLY the fields the listed issues name. A field the issues do not'
            + '\nname must come back byte-for-byte unchanged.'
            + '\n\nLength issues run BOTH ways and the issue text says which. An issue'
            + '\nsaying a field is N words and needs X-Y, where N is BELOW X, means ADD a'
            + '\nsentence carrying a specific - a figure, a threshold, a named example, a'
            + '\nnamed person, a named consequence - and keep every sentence already there.'
            + '\nAn issue saying a field is ABOVE its range, or that one option is longer'
            + '\nthan the others, means CUT: remove the weakest clause and move any'
            + '\nreasoning into the feedback field.'
            + '\n\nNever pad with adjectives, restatement or filler. A repair that returns'
            + '\nless content than it was given is discarded and the earlier version ships.'
            + langBlock;
    };

    const buildWorkplaceContentRepairPrompt = (cards, issues, topicTitle = '', context = {}) => {
        const langPrefix = getLangPrefixForUserPrompt(context);
        const industry = context?.industrySector || context?.industry || 'the workplace';

        return `${langPrefix}SURGICAL FIX for: ${topicTitle || 'workplace training'}
Company: ${context?.companyName || ''}
Industry: ${industry}
Role: ${context?.jobLevel || context?.learnerRole || 'worker'}

Fix ONLY these structural issues  -  do NOT rewrite or rephrase any other content:
${issues.slice(0, 5).map(i => `- ${i}`).join('\n')}

Keep ALL existing content, scenarios, text, and details exactly as they are.
Only modify the specific broken fields listed above.

CURRENT CARDS:
${JSON.stringify(cards, null, 2)}

Return ONLY a valid JSON object with "cards" array of exactly 7 cards.`;
    };

    const buildPDContentRepairSystemPrompt = (context) => {

        // v13.98.3: DERIVED FROM THE ROUTE'S OWN SYSTEM PROMPT.
        //
        // This used to be a hand-maintained copy of the card contract, and it had drifted
        // badly. Three independent audits led with the same finding: the generation
        // prompts were fixed in v13.98.2 to ask for THREE short sentences (because two
        // sentences under a 20-word cap cannot carry a 42-58 word field) and these repair
        // prompts still said "EXACTLY 2 sentences, 42-58 words" - re-introducing, on the
        // repair pass, the exact impossibility the release had just removed. Worse, v13.98
        // re-enabled the quality repair, so far MORE sections now see this prompt.
        //
        // The University copy was staler still: eight of eight field ranges predated
        // v13.98.1, and it described six card types while demanding seven.
        //
        // A copy of a contract is a contract that will drift. Topics-and-Text has always
        // built its repair prompt from its own system prompt and has never drifted once,
        // so every route now does the same. The card contract exists in exactly one place
        // per route, and a repair can no longer be told something the generator was not.
        const langBlock = getLanguageInstructions(context?.language || context?.voiceLanguage || 'en-AU');
        return PD_SYSTEM_PROMPT
            + '\n\nYou are REPAIRING an existing pack, not writing a new one.'
            + '\nThe card contract above is authoritative - it is the same contract the'
            + '\npack was generated against.'
            + '\n\nFix ONLY the fields the listed issues name. A field the issues do not'
            + '\nname must come back byte-for-byte unchanged.'
            + '\n\nLength issues run BOTH ways and the issue text says which. An issue'
            + '\nsaying a field is N words and needs X-Y, where N is BELOW X, means ADD a'
            + '\nsentence carrying a specific - a figure, a threshold, a named example, a'
            + '\nnamed person, a named consequence - and keep every sentence already there.'
            + '\nAn issue saying a field is ABOVE its range, or that one option is longer'
            + '\nthan the others, means CUT: remove the weakest clause and move any'
            + '\nreasoning into the feedback field.'
            + '\n\nNever pad with adjectives, restatement or filler. A repair that returns'
            + '\nless content than it was given is discarded and the earlier version ships.'
            + langBlock;
    };

    const buildPDContentRepairPrompt = (cards, issues, topicTitle = '', context = {}) => {
        const langPrefix = getLangPrefixForUserPrompt(context);
        const industry = context?.industrySector || context?.industry || 'professional setting';

        return `${langPrefix}SURGICAL FIX for: ${topicTitle || 'professional development'}
Organisation: ${context?.companyName || ''}
Industry: ${industry}
Role: ${context?.jobLevel || context?.learnerRole || 'professional'}

Fix ONLY these structural issues  -  do NOT rewrite or rephrase any other content:
${issues.slice(0, 5).map(i => `- ${i}`).join('\n')}

Keep ALL existing content, scenarios, frameworks, and text exactly as they are.
Only modify the specific broken fields listed above.

CURRENT CARDS:
${JSON.stringify(cards, null, 2)}

Return ONLY a valid JSON object with "cards" array of exactly 7 cards.`;
    };

    // v13.91.3: Route 5 repair. Without these two branches a structural failure on a
    // Topics-and-Text section was repaired with the VET prompt - which asks for seven
    // vocational cards with scenarios, mistakes and a decision point. That cannot fix a
    // prose article; it would ask the model to produce something of the wrong shape
    // entirely. Reuse the route's own system prompt, which already carries the full
    // card spec, and state the issues against it.
    const buildTopicsTextContentRepairSystemPrompt = (context) => {
        return TOPICSTEXT_SYSTEM_PROMPT
            + '\n\nYou are REPAIRING an existing module, not writing a new one.'
            + '\nKeep every paragraph that is already good. Change ONLY what the listed'
            + '\nissues name. Return all 5 cards in the same order: overview, key-concepts,'
            + '\nexamples-application, key-takeaways, decision-point. Do not add heading'
            + '\nfields to cards 1-4 and do not exceed two paragraphs per card.';
    };

    const buildTopicsTextContentRepairPrompt = (cards, issues, topicTitle, context) => {
        const issueList = (Array.isArray(issues) ? issues : [issues])
            .filter(Boolean).map((i, n) => (n + 1) + '. ' + i).join('\n');
        return 'Topic: ' + (topicTitle || '')
            + '\n\nISSUES TO FIX:\n' + issueList
            + '\n\nCURRENT CARDS:\n' + JSON.stringify(cards)
            + '\n\nReturn the corrected { "cards": [...] } with exactly 5 cards, same order,'
            + ' preserving everything the issues do not mention.';
    };

    const getContentRepairPromptForMode = (mode, context) => {
        if (mode === 'topicstext') {
            return buildTopicsTextContentRepairSystemPrompt(context);
        }
        if (mode === 'university') {
            return buildUniversityContentRepairSystemPrompt(context);
        }
        if (mode === 'workplace') {
            return buildWorkplaceContentRepairSystemPrompt(context);
        }
        if (mode === 'pd') {
            return buildPDContentRepairSystemPrompt(context);
        }
        return buildContentRepairSystemPrompt(context);
    };

    const buildContentRepairPromptForMode = (cards, issues, topicTitle, context) => {
        const mode = context?.mode || 'vet';
        if (mode === 'topicstext') {
            return buildTopicsTextContentRepairPrompt(cards, issues, topicTitle, context);
        }
        if (mode === 'university') {
            return buildUniversityContentRepairPrompt(cards, issues, topicTitle, context);
        }
        if (mode === 'workplace') {
            return buildWorkplaceContentRepairPrompt(cards, issues, topicTitle, context);
        }
        if (mode === 'pd') {
            return buildPDContentRepairPrompt(cards, issues, topicTitle, context);
        }
        return buildContentRepairPrompt(cards, issues, topicTitle, context);
    };

    // ===========================================================================
    // AUDIT DEFENSIBILITY (route-aware)
    // ===========================================================================

    // ===========================================================================
    // AUDIT REPAIR PROMPTS
    // ===========================================================================

    // ===========================================================================
    // EXPANSION & BANNED WORD PROMPTS
    // ===========================================================================

    // ===========================================================================
    // v10.38: STORY QA PASS  -  polish story continuity, decision quality, language
    // Runs after all quality gates pass. Improves the 7-card unified flow without
    // changing the JSON structure. Silent fallback to original cards on failure.
    // ===========================================================================

    // ===========================================================================
    // EXPORTS
    // ===========================================================================

    return {
        getSystemPromptForMode: getSystemPromptForMode,
        getCardQualityBlock: getCardQualityBlock,
        CC_CARD_ORDER: CC_CARD_ORDER,
        // v13.91: Route 5 - Topics and Text.
        GENERAL_SYSTEM_PROMPT: GENERAL_SYSTEM_PROMPT,
        buildGeneralFiveCardUserPrompt: buildGeneralFiveCardUserPrompt,
        TOPICSTEXT_SYSTEM_PROMPT: TOPICSTEXT_SYSTEM_PROMPT,
        buildTopicsTextUserPrompt: buildTopicsTextUserPrompt,
        getFiveCardSystemPromptForMode: getFiveCardSystemPromptForMode,
        buildChatGptPromptFile: buildChatGptPromptFile,
        buildFiveCardUserPrompt: buildFiveCardUserPrompt,
        normalizeCards: normalizeCards,
        validateBannedWords: validateBannedWords,
        BANNED_WORDS: BANNED_WORDS,
        // v13.98: machine-readable field specs + the checks built on them.
        validateSubstitutionArtefacts: validateSubstitutionArtefacts,
        SUBSTITUTION_ARTEFACTS: SUBSTITUTION_ARTEFACTS,
        getFieldSpecs: getFieldSpecs,
        getCardWordRange: getCardWordRange,
        CC_EXPECTED_ITEMS: CC_EXPECTED_ITEMS,
        CC_FIELD_SPECS: CC_FIELD_SPECS,
        CC_OPTION_SPEC: CC_OPTION_SPEC,
        CC_KEY_TAKEAWAY_SPEC: CC_KEY_TAKEAWAY_SPEC,
        CC_TAKEAWAY_BANNED_OPENINGS: CC_TAKEAWAY_BANNED_OPENINGS,
        getContentRepairPromptForMode: getContentRepairPromptForMode,
        buildContentRepairPromptForMode: buildContentRepairPromptForMode,
        VET_SYSTEM_PROMPT: VET_SYSTEM_PROMPT,
        WORKPLACE_SYSTEM_PROMPT: WORKPLACE_SYSTEM_PROMPT,
        UNIVERSITY_SYSTEM_PROMPT: UNIVERSITY_SYSTEM_PROMPT,
        PD_SYSTEM_PROMPT: PD_SYSTEM_PROMPT,
        FIVE_CARD_SYSTEM_PROMPT: VET_SYSTEM_PROMPT,
        WORKPLACE_FIVE_CARD_SYSTEM_PROMPT: WORKPLACE_SYSTEM_PROMPT,
        UNIVERSITY_FIVE_CARD_SYSTEM_PROMPT: UNIVERSITY_SYSTEM_PROMPT,
        PD_FIVE_CARD_SYSTEM_PROMPT: PD_SYSTEM_PROMPT,
        buildContentRepairPrompt: buildContentRepairPrompt,
        buildWorkplaceContentRepairPrompt: buildWorkplaceContentRepairPrompt,
        buildUniversityContentRepairPrompt: buildUniversityContentRepairPrompt,
        buildPDContentRepairPrompt: buildPDContentRepairPrompt,
        getSpellingInstructions: getSpellingInstructions,
        getLanguageInstructions: getLanguageInstructions,
        getLanguageName: getLanguageName,
        LANGUAGE_NAMES: LANGUAGE_NAMES,
        Legislation: Legislation,
        VET_CARD_SCHEMA: VET_CARD_SCHEMA,
        UNIVERSITY_CARD_SCHEMA: UNIVERSITY_CARD_SCHEMA,
        WORKPLACE_CARD_SCHEMA: WORKPLACE_CARD_SCHEMA,
        PD_CARD_SCHEMA: PD_CARD_SCHEMA,
        GENERAL_CARD_SCHEMA: GENERAL_CARD_SCHEMA,
        getCardSchemaForMode: getCardSchemaForMode,
        getCardCountForMode: getCardCountForMode,
        BLOOMS_LEVEL_INSTRUCTIONS: BLOOMS_LEVEL_INSTRUCTIONS,
        getLangPrefixForUserPrompt: getLangPrefixForUserPrompt,
        getLangSuffixForUserPrompt: getLangSuffixForUserPrompt
    };
});
