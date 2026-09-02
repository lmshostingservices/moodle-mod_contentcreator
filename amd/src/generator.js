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
 * Content Creator v9.16 - AI Content Generator with Route-Aware Card Model
 * 
 * v9.16: Route-specific card layouts (VET/University/Workplace)
 * - VET (7 cards): performance-anchor, plain-english, action-breakdown, competence-standard, scenario-1, scenario-2, common-errors
 * - University (6 cards): concept-anchor, theoretical-framework, analytical-lens, ethics-considerations, case-study-1, case-study-2
 * - Workplace (6 cards): business-impact, action-framework, risk-card, policy-alignment, scenario-1, scenario-2
 * - Smart voiceover padding (no fluff filler, meaningful extras only)
 * - Repetition detection memory bank across topics (stops samey garbage)
 * - Debug Log Capture: window.ccDownloadDebugLogs() to download failed AI outputs
 * - Verb Ladder Reducer: stops "Check... Confirm... Review..." patterns
 * - Banned Phrase Replacer: REWRITE logic (not just replace) to remove robot language
 * - ALL local fixes applied BEFORE scoring (score repaired version, not raw AI)
 * 
 * @module     mod_contentcreator/generator
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
define(['mod_contentcreator/prompts', 'mod_contentcreator/cc-state'], function (Prompts, CcState) {
    'use strict';

    // v8.3.7: Debug logging with version prefix
    // v12.86: Read from CcState so this file never goes stale again (was hardcoded).
    const CC_VERSION = CcState.CC_VERSION;
    // v9.77 PERF: Verbose logging disabled in production. Hundreds of console.log calls
    // per section per attempt (including JSON.stringify(context, null, 2)) block the JS
    // event loop during generation and inflate GC pressure. Set true only when debugging.
    const CC_VERBOSE_LOG = false;
    // All diagnostics route through the shared gated logger in cc-state.js  -  no raw console here.
    const ccLogger = CcState.createLogger(CC_VERBOSE_LOG);
    const ccLog = ccLogger.log;
    const ccWarn = ccLogger.warn;
    const ccError = ccLogger.error;
    // v9.77 PERF: ccDiag also gated on CC_VERBOSE_LOG  -  was always-on and fired 20+
    // times per section including expensive JSON.stringify(context, null, 2) calls.
    const ccDiag = (...args) => ccLog('[CC DIAG]', ...args);

    // ===========================================================================
    // v7.9.65: DEBUG LOG CAPTURE SYSTEM (ChatGPT Approved)
    // Saves raw AI responses + issues so dev can download them for analysis
    // Usage: window.ccDownloadDebugLogs() in DevTools
    // ===========================================================================
    const CC_DEBUG_CAPTURE_ENABLED = true;
    const CC_DEBUG_MAX_ENTRIES = 30;
    let ccDebugLogBuffer = [];

    const pushDebugLogEntry = (entry) => {
        if (!CC_DEBUG_CAPTURE_ENABLED) return;
        ccDebugLogBuffer.unshift({
            capturedAt: new Date().toISOString(),
            ...entry
        });
        if (ccDebugLogBuffer.length > CC_DEBUG_MAX_ENTRIES) {
            ccDebugLogBuffer = ccDebugLogBuffer.slice(0, CC_DEBUG_MAX_ENTRIES);
        }
    };

    const downloadDebugLogs = (filename = null) => {
        if (!CC_DEBUG_CAPTURE_ENABLED) return;
        const safeName = filename || `cc_debug_logs_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        const blob = new Blob([JSON.stringify(ccDebugLogBuffer, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = safeName;
        var dlRoot = document.getElementById('contentcreator-app') || document.body;
        dlRoot.appendChild(a);
        a.click();
        setTimeout(() => {
            if (a.parentNode) a.parentNode.removeChild(a);
            URL.revokeObjectURL(url);
        }, 250);
    };

    // Expose debug functions to window for DevTools access
    window.ccDownloadDebugLogs = downloadDebugLogs;
    window.ccGetDebugLogs = () => ccDebugLogBuffer;
    window.ccClearDebugLogs = () => { ccDebugLogBuffer = []; };

    // ===========================================================================
    // v7.9.65: BANNED PHRASE REPLACER (ChatGPT Approved)
    // REWRITE logic - triggers full sentence rewrite, not just word swap
    // Removes "it is important to", "to ensure", "highlights the importance of"
    // ===========================================================================
    const BANNED_PHRASE_RULES = [
        { pattern: /\bthis section covers\b/gi, replace: "This section shows you" },
        { pattern: /\bthis section explains\b/gi, replace: "This section shows you" },
        { pattern: /\bit is important to\b/gi, replace: "You need to" },
        { pattern: /\bhighlights the importance of\b/gi, replace: "shows why it matters to" },
        { pattern: /\bemphasizes the importance of\b/gi, replace: "shows why it matters to" },
        // v13.77 FIX-GRAMMAR-SO-YOU: these were blanket swaps that only read correctly
        // when a subject and verb followed. "to ensure accuracy" became "so you accuracy",
        // "to ensure they feel heard" became "so you they feel heard". The corruption ran
        // through every card, and the "so you <adjective>" repair rules further down in
        // builder.js and cc-state.js were band-aids over this rule rather than a fix.
        // Each replacement below is grammatical in every position it can match.
        { pattern: /\bto ensure that\b/gi, replace: "to make sure" },
        // Only rewrite to "so <subject>" when a subject actually follows.
        {
            pattern: /\bto ensure\s+(?=(?:you|they|we|it|he|she|everyone|no one|nobody|staff|workers|operators|customers|students|learners|the team)\b)/gi,
            replace: "so "
        },
        // Any remaining "to ensure" is followed by a noun phrase, where "so you" is
        // ungrammatical. "to keep" reads plainly and is always correct there.
        { pattern: /\bto ensure\b/gi, replace: "to keep" },
        { pattern: /\bin order to\b/gi, replace: "so you can" },
        { pattern: /\bso that you can\b/gi, replace: "so you can" },
        // "to prevent accidents" -> "to stop accidents"; "to prevent you falling" -> "to stop
        // you falling". Grammatical with both nouns and clauses, unlike "so you don't".
        { pattern: /\bto prevent\b/gi, replace: "to stop" },
        // "avoid" and "reduce" are already plain English; the old swaps broke noun phrases
        // ("to avoid delays" -> "so you don't delays"). Only the formal variants are changed.
        { pattern: /\bto minimise\b/gi, replace: "to cut down" },
        { pattern: /\bto minimize\b/gi, replace: "to cut down" },
        { pattern: /\bfor your safety and the safety of others\b/gi, replace: "so no one gets hurt" },
        { pattern: /\bensure compliance\b/gi, replace: "stay within site rules" },
        { pattern: /\bensure that\b/gi, replace: "make sure" },
        { pattern: /\bin accordance with\b/gi, replace: "following" },
        { pattern: /\bpursuant to\b/gi, replace: "under" },
        { pattern: /\bmaintain compliance\b/gi, replace: "stay compliant" },
        { pattern: /\bdelve\b/gi, replace: "look at" },
        { pattern: /\bdive into\b/gi, replace: "look at" },
        { pattern: /\bunpack\b/gi, replace: "explain" },
        { pattern: /\bexplore\b/gi, replace: "examine", academicSafe: true },
        { pattern: /\bjourney\b/gi, replace: "process" , academicSafe: true},
        { pattern: /\blandscape\b/gi, replace: "environment" , academicSafe: true},
        { pattern: /\bleverage\b/gi, replace: "use" },
        { pattern: /\butilize\b/gi, replace: "use" },
        { pattern: /\butilise\b/gi, replace: "use" },
        { pattern: /\bfoster\b/gi, replace: "support" , academicSafe: true},
        { pattern: /\bholistic\b/gi, replace: "complete", academicSafe: true },
        { pattern: /\brobust\b/gi, replace: "strong" , academicSafe: true},
        { pattern: /\bsynergy\b/gi, replace: "cooperation" },
        { pattern: /\bparadigm\b/gi, replace: "approach", academicSafe: true },
        { pattern: /\bnavigate\b/gi, replace: "manage" , academicSafe: true},
        { pattern: /\brealm\b/gi, replace: "area" , academicSafe: true},
        { pattern: /\btapestry\b/gi, replace: "mix" , academicSafe: true},
        { pattern: /\bmultifaceted\b/gi, replace: "complex", academicSafe: true },
        { pattern: /\bnuanced\b/gi, replace: "detailed", academicSafe: true },
        { pattern: /\bpivotal\b/gi, replace: "important" , academicSafe: true},
        { pattern: /\bcutting-edge\b/gi, replace: "modern" },
        { pattern: /\bgame-changer\b/gi, replace: "improvement" },
        { pattern: /\bempower\b/gi, replace: "enable" , academicSafe: true},
        { pattern: /\bstreamline\b/gi, replace: "simplify" },
        { pattern: /\bstakeholder engagement\b/gi, replace: "working with people involved" },
        { pattern: /\bbest practice\b/gi, replace: "proven method" },
        { pattern: /\bbest practices\b/gi, replace: "proven methods" },
        { pattern: /\bin today's workplace\b/gi, replace: "at work" },
        { pattern: /\bin today's\b/gi, replace: "in current" },
        { pattern: /\bin the modern workplace\b/gi, replace: "at work" },
        { pattern: /\bkey considerations\b/gi, replace: "main points" },
        { pattern: /\bensuring\b/gi, replace: "making sure" },
        { pattern: /\bcritical\b/gi, replace: "important", academicSafe: true },
        { pattern: /\bcomply with standards\b/gi, replace: "follow site rules" },
        { pattern: /\bfollow procedures appropriately\b/gi, replace: "follow the correct steps" },
        { pattern: /\bensure safety at all times\b/gi, replace: "keep the area safe" },
        { pattern: /\bfor safety purposes\b/gi, replace: "to stay safe" },
        { pattern: /\bensure everyone returns home safely\b/gi, replace: "so no one gets hurt" }
    ];

    const stripBannedPhrases = (text, isAcademicMode = false) => {
        if (!text || typeof text !== 'string') return text;
        let result = text;
        for (const rule of BANNED_PHRASE_RULES) {
            if (isAcademicMode && rule.academicSafe) continue;
            result = result.replace(rule.pattern, rule.replace);
        }
        return result;
    };

    const deepCleanBannedPhrases = (obj, isAcademicMode = false) => {
        if (!obj) return obj;
        if (typeof obj === 'string') return stripBannedPhrases(obj, isAcademicMode);
        if (Array.isArray(obj)) return obj.map(item => deepCleanBannedPhrases(item, isAcademicMode));
        if (typeof obj === 'object') {
            const cleaned = {};
            for (const [key, value] of Object.entries(obj)) {
                cleaned[key] = deepCleanBannedPhrases(value, isAcademicMode);
            }
            return cleaned;
        }
        return obj;
    };

    // ===========================================================================
    // v7.9.65: VERB LADDER REDUCER (ChatGPT Approved)
    // Stops repeated starting verbs like "Check... Confirm... Review..."
    // Forces variety: minimum 4 unique starting verbs in 5 requirements
    // ===========================================================================
    const TEMPLATE_VERBS = new Set([
        'read', 'ask', 'check', 'inspect', 'confirm', 'verify', 'review', 'ensure',
        'obtain', 'interpret', 'examine', 'monitor', 'clarify', 'follow', 'identify',
        'apply', 'access', 'use', 'complete', 'understand', 'learn', 'practice'
    ]);

    const VERB_ALTERNATIVES = {
        'check': ['cross-check', 'run through', 'verify', 'confirm', 'look over'],
        'confirm': ['lock in', 'nail down', 'finalise', 'verify', 'sign off on'],
        'review': ['go over', 'run through', 'scan', 'look back at', 'assess'],
        'verify': ['double-check', 'cross-check', 'confirm', 'validate', 'test'],
        'ensure': ['make sure', 'guarantee', 'lock in', 'confirm', 'secure'],
        'inspect': ['look over', 'scan', 'eyeball', 'examine', 'assess'],
        'read': ['scan', 'go through', 'look at', 'check out', 'review'],
        'ask': ['touch base with', 'check with', 'speak to', 'reach out to', 'talk to'],
        'follow': ['stick to', 'keep to', 'go by', 'adhere to', 'match'],
        'identify': ['spot', 'pick out', 'flag', 'recognise', 'locate'],
        'apply': ['use', 'put in place', 'action', 'carry out', 'implement'],
        'obtain': ['get', 'collect', 'grab', 'secure', 'pick up'],
        'access': ['open', 'get into', 'reach', 'pull up', 'locate'],
        'monitor': ['keep an eye on', 'watch', 'track', 'observe', 'check on'],
        'examine': ['look at', 'inspect', 'go over', 'scan', 'assess'],
        'interpret': ['understand', 'read', 'make sense of', 'decode', 'work out'],
        'clarify': ['clear up', 'sort out', 'confirm', 'check', 'double-check'],
        'use': ['apply', 'work with', 'operate', 'deploy', 'put to use'],
        'complete': ['finish', 'wrap up', 'finalise', 'get done', 'close out']
    };

    const normaliseFirstVerb = (text) => {
        if (!text || typeof text !== 'string') return { verb: null, rest: text };
        const words = text.trim().split(/\s+/);
        if (words.length === 0) return { verb: null, rest: text };
        const verb = words[0].toLowerCase().replace(/[.,;:!?]/g, '');
        return { verb, rest: words.slice(1).join(' ') };
    };

    const pickSwapVerb = (original, usedSet) => {
        const alts = VERB_ALTERNATIVES[original] || [];
        for (const alt of alts) {
            const altLower = alt.toLowerCase();
            if (!usedSet.has(altLower)) return alt;
        }
        return null;
    };

    const rewriteLeadingVerb = (text, newVerb) => {
        if (!text || typeof text !== 'string' || !newVerb) return text;
        const words = text.trim().split(/\s+/);
        if (words.length === 0) return text;
        const firstWord = words[0];
        const wasCapital = firstWord[0] === firstWord[0].toUpperCase();
        const newFirst = wasCapital ? newVerb.charAt(0).toUpperCase() + newVerb.slice(1) : newVerb;
        return [newFirst, ...words.slice(1)].join(' ');
    };

    const reduceVerbLadder = (items, minUnique = 4) => {
        if (!Array.isArray(items) || items.length < 3) return items;
        const newItems = [...items];
        const usedVerbs = new Set();
        for (let i = 0; i < newItems.length; i++) {
            const { verb } = normaliseFirstVerb(newItems[i]);
            if (!verb) continue;
            const verbLower = verb.toLowerCase();
            if (usedVerbs.has(verbLower) && TEMPLATE_VERBS.has(verbLower)) {
                const swap = pickSwapVerb(verbLower, usedVerbs);
                if (swap) {
                    newItems[i] = rewriteLeadingVerb(newItems[i], swap);
                    usedVerbs.add(swap.toLowerCase());
                } else {
                    usedVerbs.add(verbLower);
                }
            } else {
                usedVerbs.add(verbLower);
            }
        }
        return newItems;
    };

    // ===========================================================================
    // v7.9.65: VOICEOVER NORMALISER (ChatGPT Approved)
    // v8.3.9: padVoiceover DEPRECATED - normaliseAllVoiceovers now uses
    // padVoiceoverSmart + extractCardExtras to pad from card-specific content
    // instead of generic VOICEOVER_STARTERS filler phrases
    // ===========================================================================
    const VOICEOVER_LIMITS = {
        // v10.27 unified 7-card types
        'hook-scenario':       { min: 60, max: 110 },
        'concept-explainer':   { min: 60, max: 110 },
        'mental-model':        { min: 60, max: 110 },
        'applied-scenario':    { min: 60, max: 110 },
        'decision-point':      { min: 50, max: 100 },
        'mistakes':            { min: 50, max: 100 },
        'competency-summary':  { min: 40, max: 80 },
        // v13.92 topics-and-text prose cards. Each card is narrated on its own as the
        // learner reveals it, so these need real text - shorter than the 7-card routes
        // because the card itself is only 110-140 words.
        'overview':             { min: 55, max: 95 },
        'key-concepts':         { min: 55, max: 95 },
        'examples-application': { min: 55, max: 95 },
        'key-takeaways':        { min: 55, max: 95 },
        // v13.91 topics-and-text slots (legacy, still narratable in saved modules)
        'orientation':         { min: 55, max: 95 },
        'foundations':         { min: 55, max: 95 },
        'mechanism':           { min: 55, max: 95 },
        'in-practice':         { min: 55, max: 95 },
        'boundaries':          { min: 55, max: 95 },
        // legacy types (backward compat)
        'performance-anchor': { min: 40, max: 80 },
        'plain-english': { min: 60, max: 100 },
        'action-breakdown': { min: 80, max: 120 },
        'competence-standard': { min: 60, max: 100 },
        'scenario-1': { min: 60, max: 100 },
        'scenario-2': { min: 60, max: 100 },
        'common-errors': { min: 40, max: 80 },
        'concept-anchor': { min: 60, max: 100 },
        'theoretical-framework': { min: 80, max: 120 },
        'analytical-lens': { min: 60, max: 100 },
        'ethics-considerations': { min: 60, max: 100 },
        'case-study-1': { min: 60, max: 100 },
        'case-study-2': { min: 60, max: 100 },
        'business-impact': { min: 60, max: 100 },
        'action-framework': { min: 60, max: 100 },
        'risk-card': { min: 60, max: 100 },
        'policy-alignment': { min: 60, max: 100 },
        'skill-anchor': { min: 60, max: 100 },
        'core-framework': { min: 80, max: 120 },
        'application-guide': { min: 60, max: 100 },
        'common-pitfalls': { min: 60, max: 100 },
    };

    const VOICEOVER_STARTERS = {
        'performance-anchor': [
            "Here is the performance standard you need to meet.",
            "This is what competent performance looks like.",
            "Let's start with what you are expected to demonstrate."
        ],
        'plain-english': [
            "Here is the plain-English breakdown of this requirement.",
            "Let's make this requirement clear and practical.",
            "This is what the standard means in everyday terms."
        ],
        'action-breakdown': [
            "Here are the specific actions you need to take.",
            "Let's walk through each step in detail.",
            "This is the detailed breakdown of what to do."
        ],
        'competence-standard': [
            "This is the standard of competence expected.",
            "Here is how your performance will be measured.",
            "This defines what competent practice looks like."
        ],
        'scenario-1': [
            "Picture this situation in your workplace.",
            "Here is a real challenge you might face.",
            "This is how it plays out on the job."
        ],
        'scenario-2': [
            "Here is another situation to consider.",
            "Now consider this different scenario.",
            "This presents a variation on the challenge."
        ],
        'common-errors': [
            "These are the mistakes people commonly make.",
            "Watch out for these common pitfalls.",
            "Here is what to avoid in practice."
        ],
        'concept-anchor': [
            "Here is the foundational concept you need to understand.",
            "Let's ground this topic in its core idea.",
            "This is the key concept that underpins everything else."
        ],
        'theoretical-framework': [
            "Here is the theoretical framework for this topic.",
            "Let's examine the theory behind the practice.",
            "This is the academic foundation you need."
        ],
        'analytical-lens': [
            "Here is how to analyse this critically.",
            "Let's apply an analytical lens to this topic.",
            "This is the framework for deeper analysis."
        ],
        'ethics-considerations': [
            "Here are the ethical dimensions to consider.",
            "Let's examine the ethical implications.",
            "This raises important ethical questions."
        ],
        'case-study-1': [
            "Here is a case study to examine.",
            "Let's look at how this plays out in practice.",
            "This case illustrates the concept in action."
        ],
        'case-study-2': [
            "Here is another case to consider.",
            "Now examine this contrasting example.",
            "This case offers a different perspective."
        ],
        'business-impact': [
            "Here is the business impact of this topic.",
            "Let's look at why this matters to the organisation.",
            "This is how it affects business outcomes."
        ],
        'action-framework': [
            "Here is the action framework to follow.",
            "Let's walk through the practical steps.",
            "This is the structured approach to take."
        ],
        'risk-card': [
            "Here are the risks you need to manage.",
            "Let's examine the potential risks involved.",
            "This covers the key risk considerations."
        ],
        'policy-alignment': [
            "Here is how this aligns with policy.",
            "Let's connect this to organisational policy.",
            "This shows the policy requirements in context."
        ],
        'skill-anchor': [
            "Here is the skill you will be developing.",
            "This is the professional capability we are focusing on.",
            "Let's ground this in the skill you need to build."
        ],
        'core-framework': [
            "Here is the framework that guides this skill.",
            "Let's walk through the structured approach.",
            "This is the method that underpins effective practice."
        ],
        'application-guide': [
            "Here is how to apply this in your work.",
            "Let's look at practical application scenarios.",
            "This shows how to put the skill into practice."
        ],
        'common-pitfalls': [
            "Here are the common mistakes to watch for.",
            "Let's look at where professionals often go wrong.",
            "These are the pitfalls that can derail your progress."
        ],
        // v10.27 unified 7-card starters
        'hook-scenario': [
            "Here is a situation that happens in this kind of work.",
            "Picture this.",
            "This is the kind of moment where the right knowledge matters."
        ],
        'concept-explainer': [
            "What you just saw is a good example of why this matters.",
            "In that situation, there is something important to understand.",
            "Here is what that situation is really about."
        ],
        'mental-model': [
            "Here is how to handle situations like this.",
            "There is a clear way to think through this.",
            "Follow these steps and you will get it right."
        ],
        'applied-scenario': [
            "Later in the same job, the situation develops further.",
            "Back at the worksite, things move on.",
            "Continuing the story  -  here is what happens next."
        ],
        'decision-point': [
            "Now it is your turn.",
            "Based on what you have seen  -  what would you do?",
            "Here is the decision moment."
        ],
        'mistakes': [
            "Here is what goes wrong in situations like this.",
            "These are the mistakes people make in this kind of work.",
            "Watch out for these."
        ],
        'competency-summary': [
            "You are ready when you can do all of these.",
            "Here is what competent performance looks like.",
            "This is the standard."
        ]
    };

    const countWords = (str) => (str || '').trim().split(/\s+/).filter(w => w).length;

    // ===========================================================================
    // v7.9.66: SMART VOICEOVER PADDING (ChatGPT Approved - NO fluff filler)
    // Pads using meaningful extras only, no generic filler
    // ===========================================================================
    const padVoiceoverSmart = (text, minWords, maxWords, extras = [], cardType = '') => {
        let out = (text || '').trim();

        const safeAdd = (line) => {
            if (!line) return;
            if (out.toLowerCase().includes(line.toLowerCase())) return;
            out = `${out} ${line}`.replace(/\s+/g, ' ').trim();
        };

        extras.forEach(safeAdd);

        const typeStarters = (cardType && VOICEOVER_STARTERS[cardType]) ? VOICEOVER_STARTERS[cardType] : [];
        const genericFallback = [
            "Make sure you understand each point before moving on, because skipping details leads to gaps in your knowledge.",
            "If anything is unclear, take time to review it now rather than building on an incomplete understanding.",
            "Consider how this content connects to what you have already learned and what comes next."
        ];
        const fallback = typeStarters.length ? typeStarters : genericFallback;

        let i = 0;
        while (countWords(out) < minWords && i < fallback.length) {
            safeAdd(fallback[i++]);
        }

        const words = out.split(/\s+/);
        if (words.length > maxWords) {
            out = words.slice(0, maxWords).join(' ').trim();
        }
        return out;
    };

    // ===========================================================================
    // v7.9.66: REPETITION DETECTION MEMORY BANK (ChatGPT Approved)
    // Prevents samey scenarios across topics within a session
    // ===========================================================================
    // v8.4.53: extractCardExtras DEPRECATED - returns empty array.
    // buildFullVoiceoverText in player5.js reads ALL visible structured fields
    // (requirements, description, contrast pairs, terms, accent cards, scenario
    // fields) directly from the section data. Baking extras into voiceoverText
    // caused: (1) duplicate reading, (2) non-displayed content being narrated
    // (e.g. keyFacts), and (3) voiceover/display mismatches on overview cards.
    const extractCardExtras = () => {
        return [];
    };

    // v10.44 FIX-VO-7CARD: 7-card types must NOT have voiceoverText padded with fallback starters.
    // buildFullVoiceoverText() in player5.js reads structural fields (sceneParts, conceptInsights,
    // steps, items, goodItems/badItems) for these types  -  it never uses card.voiceoverText.
    // Padding it with generic filler causes the fallback text to be promoted to section.voiceoverText
    // and narrated as Card 1's voiceover instead of the actual displayed content.
    // v10.46: Extended to include University 6-card route types.
    // These must also NOT be padded with generic starters  -  player5.js reads their
    // structural fields directly (conceptDefinition, frameworks, cognitiveConsiderations,
    // considerations, context, keyInsight, criticalReflection, analysisPrompts).
    // Padding voiceoverText with filler caused it to be promoted to section.voiceoverText
    // and narrated as card-0's content instead of the actual displayed fields.
    const _7CARD_TYPES_SET = new Set([
        'hook-scenario','concept-explainer','mental-model',
        'applied-scenario','mistakes','competency-summary','decision-point',
        'concept-anchor','theoretical-framework','analytical-lens',
        'ethics-considerations','case-study-1','case-study-2',
        // v13.92: Topics-and-Text. cc-state.buildVoiceoverText() reads the paragraphs
        // verbatim for these, so voiceoverText must stay empty - padding it with
        // generic filler would be narrated on any path that falls back to it.
        'overview','key-concepts','examples-application','key-takeaways',
        'orientation','foundations','mechanism','in-practice','boundaries'
    ]);

    const normaliseAllVoiceovers = (cards) => {
        if (!Array.isArray(cards)) return cards;
        for (const card of cards) {
            if (!card || typeof card !== 'object') continue;
            // v10.44a FIX-VO-7CARD: For 7-card types, NEVER pad with fallback starters.
            // player5.js buildFullVoiceoverText reads structural display fields for narration.
            // If card.voiceoverText is already set (explicitly written VOICEOVER: field from
            // the text-label prompt format), preserve it verbatim  -  player5.js will use it as
            // the narration script when structural fields yield no content (e.g. hook-scenario
            // with CONTENT: label instead of PART N TITLE/TEXT labels).
            // If voiceoverText is empty (JSON format, no VOICEOVER: field), leave it empty  - 
            // player5.js will build narration from sceneParts/conceptInsights/steps/items/etc.
            if (_7CARD_TYPES_SET.has(card.cardType)) {
                // BUG-VO-DP-STILL-NARRATED FIX (v11.02): decision-point is an interactive
                // activity  -  it must NEVER be narrated. Force-clear voiceoverText even if
                // ChatGPT wrote one (the prompt used to request it; old manifests have it).
                if (card.cardType === 'decision-point') { card.voiceoverText = ''; continue; }
                if (!card.voiceoverText) card.voiceoverText = '';
                continue;
            }
            if (!card.voiceoverText) card.voiceoverText = "";
            const limits = VOICEOVER_LIMITS[card.cardType] || { min: 50, max: 100 };
            const extras = extractCardExtras(card);
            card.voiceoverText = padVoiceoverSmart(card.voiceoverText, limits.min, limits.max, extras, card.cardType || '');
        }
        return cards;
    };




    // ===========================================================================
    // v8.4.18: LOCAL FIX PIPELINE (Mode-Aware)
    // VET fixes for VET mode, academic fixes for university mode, workplace fixes for workplace mode
    // ===========================================================================
    const fixVerbFirstRequirements = (items) => {
        if (!Array.isArray(items)) return items;
        const banned = new Set(['if', 'when', 'the', 'a', 'an', 'for', 'in', 'at', 'on', 'to', 'by', 'with', 'it', 'this', 'that', 'all', 'any', 'do', 'be', 'is', 'are', 'was', 'were', 'has', 'have', 'had', 'should', 'would', 'could', 'may', 'must', 'shall', 'will', 'each', 'every', 'before', 'after', 'during', 'while', 'once', 'also', 'then', 'per', 'based', 'according', 'immediately', 'always', 'never', 'only', 'first', 'where', 'not']);
        return items.map(req => {
            if (!req || typeof req !== 'string') return req;
            const fw = req.trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, '');
            if (!banned.has(fw)) return req;
            const text = req.trim();
            const ifMatch = text.match(/^[Ii]f\s+(.+?),\s*(.+)/);
            if (ifMatch) {
                const condition = ifMatch[1].trim();
                const action = ifMatch[2].trim();
                const actionCapped = action.charAt(0).toUpperCase() + action.slice(1);
                const condLower = condition.charAt(0).toLowerCase() + condition.slice(1);
                return actionCapped.replace(/\.$/, '') + ' if ' + condLower + (actionCapped.endsWith('.') ? '' : '.');
            }
            const whenMatch = text.match(/^[Ww]hen\s+(.+?),\s*(.+)/);
            if (whenMatch) {
                const condition = whenMatch[1].trim();
                const action = whenMatch[2].trim();
                const actionCapped = action.charAt(0).toUpperCase() + action.slice(1);
                const condLower = condition.charAt(0).toLowerCase() + condition.slice(1);
                return actionCapped.replace(/\.$/, '') + ' when ' + condLower + (actionCapped.endsWith('.') ? '' : '.');
            }
            const adverbMatch = text.match(/^(Immediately|Always|Never|Only|First|Also|Then)\s+(.+)/i);
            if (adverbMatch) {
                const adverb = adverbMatch[1].toLowerCase();
                const rest = adverbMatch[2].trim();
                const verb = rest.split(/\s+/)[0];
                const afterVerb = rest.slice(verb.length);
                return verb.charAt(0).toUpperCase() + verb.slice(1) + afterVerb.replace(/\.$/, '') + ' ' + adverb + '.';
            }
            const beforeAfterMatch = text.match(/^(Before|After|During|While|Once)\s+(.+?),\s*(.+)/i);
            if (beforeAfterMatch) {
                const prep = beforeAfterMatch[1].toLowerCase();
                const clause = beforeAfterMatch[2].trim();
                const action = beforeAfterMatch[3].trim();
                const actionCapped = action.charAt(0).toUpperCase() + action.slice(1);
                return actionCapped.replace(/\.$/, '') + ' ' + prep + ' ' + clause + (actionCapped.endsWith('.') ? '' : '.');
            }
            const articleModalMatch = text.match(/^(The|A|An|This|That|Each|Every|All|Any|It)\s+(.+?)\s+(must|should|shall|will|would|could|may|needs?\s+to|has?\s+to|is\s+to|are\s+to)\s+(be\s+)?(.+)/i);
            if (articleModalMatch) {
                const article = articleModalMatch[1].toLowerCase();
                const subject = articleModalMatch[2].trim();
                const verbPhrase = articleModalMatch[5].trim();
                const verbWords = verbPhrase.split(/\s+/);
                let mainVerb = verbWords[0];
                if (mainVerb.toLowerCase() === 'reviewed') mainVerb = 'Review';
                else if (mainVerb.toLowerCase() === 'checked') mainVerb = 'Check';
                else if (mainVerb.toLowerCase() === 'confirmed') mainVerb = 'Confirm';
                else if (mainVerb.toLowerCase() === 'inspected') mainVerb = 'Inspect';
                else if (mainVerb.toLowerCase() === 'completed') mainVerb = 'Complete';
                else if (mainVerb.toLowerCase() === 'documented') mainVerb = 'Document';
                else if (mainVerb.toLowerCase() === 'reported') mainVerb = 'Report';
                else if (mainVerb.toLowerCase() === 'maintained') mainVerb = 'Maintain';
                else if (mainVerb.toLowerCase() === 'secured') mainVerb = 'Secure';
                else if (mainVerb.toLowerCase() === 'verified') mainVerb = 'Verify';
                else if (mainVerb.toLowerCase() === 'followed') mainVerb = 'Follow';
                else if (mainVerb.toLowerCase() === 'worn') mainVerb = 'Wear';
                else if (mainVerb.toLowerCase() === 'used') mainVerb = 'Use';
                else if (mainVerb.toLowerCase() === 'removed') mainVerb = 'Remove';
                else if (mainVerb.toLowerCase() === 'replaced') mainVerb = 'Replace';
                else if (mainVerb.toLowerCase() === 'recorded') mainVerb = 'Record';
                else if (mainVerb.toLowerCase() === 'tested') mainVerb = 'Test';
                else if (mainVerb.toLowerCase() === 'applied') mainVerb = 'Apply';
                else if (mainVerb.toLowerCase() === 'assessed') mainVerb = 'Assess';
                else if (mainVerb.toLowerCase() === 'identified') mainVerb = 'Identify';
                else if (mainVerb.toLowerCase() === 'monitored') mainVerb = 'Monitor';
                else if (mainVerb.toLowerCase() === 'stored') mainVerb = 'Store';
                else if (mainVerb.toLowerCase() === 'cleaned') mainVerb = 'Clean';
                else if (mainVerb.toLowerCase() === 'positioned') mainVerb = 'Position';
                else if (mainVerb.toLowerCase() === 'adjusted') mainVerb = 'Adjust';
                else if (mainVerb.toLowerCase() === 'labelled') mainVerb = 'Label';
                else if (mainVerb.toLowerCase() === 'tagged') mainVerb = 'Tag';
                else if (mainVerb.toLowerCase() === 'sealed') mainVerb = 'Seal';
                else if (mainVerb.toLowerCase() === 'locked') mainVerb = 'Lock';
                else if (mainVerb.toLowerCase() === 'covered') mainVerb = 'Cover';
                else if (mainVerb.toLowerCase() === 'placed') mainVerb = 'Place';
                else if (mainVerb.toLowerCase() === 'set') mainVerb = 'Set';
                else if (mainVerb.toLowerCase() === 'marked') mainVerb = 'Mark';
                else if (mainVerb.toLowerCase() === 'filled') mainVerb = 'Fill';
                else if (mainVerb.toLowerCase() === 'emptied') mainVerb = 'Empty';
                else if (mainVerb.toLowerCase() === 'loaded') mainVerb = 'Load';
                else if (mainVerb.toLowerCase() === 'prepared') mainVerb = 'Prepare';
                else if (mainVerb.toLowerCase() === 'measured') mainVerb = 'Measure';
                else if (mainVerb.toLowerCase() === 'selected') mainVerb = 'Select';
                else if (mainVerb.toLowerCase() === 'obtained') mainVerb = 'Obtain';
                else if (mainVerb.toLowerCase() === 'submitted') mainVerb = 'Submit';
                else if (mainVerb.toLowerCase() === 'managed') mainVerb = 'Manage';
                else if (mainVerb.toLowerCase() === 'communicated') mainVerb = 'Communicate';
                else if (mainVerb.toLowerCase() === 'analysed') mainVerb = 'Analyse';
                else if (mainVerb.toLowerCase() === 'organised') mainVerb = 'Organise';
                else if (mainVerb.toLowerCase() === 'recognised') mainVerb = 'Recognise';
                else if (mainVerb.toLowerCase() === 'minimised') mainVerb = 'Minimise';
                else if (mainVerb.toLowerCase() === 'prioritised') mainVerb = 'Prioritise';
                else if (mainVerb.toLowerCase() === 'supervised') mainVerb = 'Supervise';
                else if (mainVerb.toLowerCase() === 'operated') mainVerb = 'Operate';
                else if (mainVerb.toLowerCase() === 'allocated') mainVerb = 'Allocate';
                else if (mainVerb.toLowerCase() === 'calculated') mainVerb = 'Calculate';
                else if (mainVerb.toLowerCase() === 'delegated') mainVerb = 'Delegate';
                else if (mainVerb.toLowerCase() === 'evaluated') mainVerb = 'Evaluate';
                else if (mainVerb.toLowerCase() === 'investigated') mainVerb = 'Investigate';
                else if (mainVerb.toLowerCase() === 'coordinated') mainVerb = 'Coordinate';
                else if (mainVerb.toLowerCase() === 'implemented') mainVerb = 'Implement';
                else if (mainVerb.toLowerCase() === 'administered') mainVerb = 'Administer';
                else if (mainVerb.toLowerCase() === 'demonstrated') mainVerb = 'Demonstrate';
                else if (mainVerb.toLowerCase() === 'escalated') mainVerb = 'Escalate';
                else if (mainVerb.toLowerCase() === 'isolated') mainVerb = 'Isolate';
                else if (mainVerb.toLowerCase() === 'calibrated') mainVerb = 'Calibrate';
                else if (mainVerb.toLowerCase() === 'disposed') mainVerb = 'Dispose';
                else if (mainVerb.toLowerCase() === 'transferred') mainVerb = 'Transfer';
                else if (mainVerb.toLowerCase() === 'resolved') mainVerb = 'Resolve';
                else if (mainVerb.toLowerCase() === 'processed') mainVerb = 'Process';
                else if (mainVerb.toLowerCase() === 'notified') mainVerb = 'Notify';
                else if (mainVerb.toLowerCase() === 'validated') mainVerb = 'Validate';
                else if (mainVerb.endsWith('ated')) {
                    mainVerb = mainVerb.replace(/ated$/i, 'ate');
                    mainVerb = mainVerb.charAt(0).toUpperCase() + mainVerb.slice(1);
                } else if (mainVerb.endsWith('ised') || mainVerb.endsWith('ized')) {
                    mainVerb = mainVerb.replace(/i[sz]ed$/i, 'ise');
                    mainVerb = mainVerb.charAt(0).toUpperCase() + mainVerb.slice(1);
                } else if (mainVerb.endsWith('ed')) {
                    mainVerb = mainVerb.replace(/ed$/i, '');
                    mainVerb = mainVerb.charAt(0).toUpperCase() + mainVerb.slice(1);
                } else {
                    mainVerb = mainVerb.charAt(0).toUpperCase() + mainVerb.slice(1);
                }
                const restOfVerb = verbWords.slice(1).join(' ');
                const rebuilt = mainVerb + ' ' + article + ' ' + subject + (restOfVerb ? ' ' + restOfVerb : '');
                return rebuilt.replace(/\.\s*$/, '').replace(/\s+/g, ' ').trim() + '.';
            }
            const modalStartMatch = text.match(/^(Should|Must|Would|Could|May|Do|Has|Have|Is|Are|Was|Were)\s+(.+)/i);
            if (modalStartMatch) {
                const rest = modalStartMatch[2].trim();
                const modalSentence = rest.replace(/^(you|we|they|workers?|staff|the\s+\w+)\s+/i, '');
                const firstVerbWord = modalSentence.split(/\s+/)[0];
                const capped = firstVerbWord.charAt(0).toUpperCase() + firstVerbWord.slice(1);
                const afterFirst = modalSentence.slice(firstVerbWord.length);
                return (capped + afterFirst).replace(/\.\s*$/, '').trim() + '.';
            }
            const forInAtMatch = text.match(/^(For|In|At|On|To|By|With|Per|Based|According)\s+(.+?),\s*(.+)/i);
            if (forInAtMatch) {
                const prep = forInAtMatch[1].toLowerCase();
                const clause = forInAtMatch[2].trim();
                const action = forInAtMatch[3].trim();
                const actionCapped = action.charAt(0).toUpperCase() + action.slice(1);
                return actionCapped.replace(/\.$/, '') + ' ' + prep + ' ' + clause + (actionCapped.endsWith('.') ? '' : '.');
            }
            return req;
        });
    };

    const localFixFiveCards = (cards, context, topicTitle) => {
        if (!Array.isArray(cards)) return cards;
        const mode = context?.mode || 'vet';
        const useVerbFirst = (mode === 'vet' || mode === 'workplace');
        // v13.96 FIX-CC-PROSE-WORDSURGERY: Topics-and-Text writes articles on any subject,
        // so the blind phrase replacements turn "landscape painting" into "environment
        // painting" and "critical theory" into "important theory". University was already
        // exempted from the same rules for the same reason; this route needs it more, because
        // its whole selling point is that the subject is unconstrained.
        const isAcademicMode = (mode === 'university' || mode === 'topicstext');
        let fixed = [...cards];
        fixed = deepCleanBannedPhrases(fixed, isAcademicMode);
        for (const card of fixed) {
            if (Array.isArray(card.requirements)) {
                card.requirements = reduceVerbLadder(card.requirements, 4);
                card.requirements = card.requirements.map(r => stripBannedPhrases(r, isAcademicMode));
                if (useVerbFirst) {
                    card.requirements = fixVerbFirstRequirements(card.requirements);
                }
            }
            if (Array.isArray(card.positiveList)) {
                card.positiveList = reduceVerbLadder(card.positiveList, 4);
                card.positiveList = card.positiveList.map(r => stripBannedPhrases(r, isAcademicMode));
                if (useVerbFirst) {
                    card.positiveList = fixVerbFirstRequirements(card.positiveList);
                }
            }
            if (Array.isArray(card.negativeList)) {
                card.negativeList = reduceVerbLadder(card.negativeList, 4);
                card.negativeList = card.negativeList.map(r => stripBannedPhrases(r, isAcademicMode));
            }
        }
        fixed = normaliseAllVoiceovers(fixed);
        return fixed;
    };

    // v7.9.60: Australian spelling corrections (applied to all generated content)
    // Extended with VET-sector specific terms - AU uses double-l in many cases
    const australianSpelling = {
        // Common -or  ->  -our
        'behavior': 'behaviour', 'behaviors': 'behaviours',
        'color': 'colour', 'colors': 'colours',
        'favor': 'favour', 'favors': 'favours',
        'honor': 'honour', 'honors': 'honours',
        'labor': 'labour', 'labors': 'labours',
        'neighbor': 'neighbour', 'neighbors': 'neighbours',
        // Common -ize  ->  -ise
        'organize': 'organise', 'organizes': 'organises', 'organized': 'organised', 'organizing': 'organising',
        'recognize': 'recognise', 'recognizes': 'recognises', 'recognized': 'recognised', 'recognizing': 'recognising',
        'analyze': 'analyse', 'analyzes': 'analyses', 'analyzed': 'analysed', 'analyzing': 'analysing',
        'minimize': 'minimise', 'minimizes': 'minimises', 'minimized': 'minimised', 'minimizing': 'minimising',
        'maximize': 'maximise', 'maximizes': 'maximises', 'maximized': 'maximised', 'maximizing': 'maximising',
        'authorize': 'authorise', 'authorizes': 'authorises', 'authorized': 'authorised', 'authorizing': 'authorising',
        'prioritize': 'prioritise', 'prioritizes': 'prioritises', 'prioritized': 'prioritised', 'prioritizing': 'prioritising',
        'standardize': 'standardise', 'standardizes': 'standardises', 'standardized': 'standardised', 'standardizing': 'standardising',
        'specialize': 'specialise', 'specializes': 'specialises', 'specialized': 'specialised', 'specializing': 'specialising',
        'customize': 'customise', 'customizes': 'customises', 'customized': 'customised', 'customizing': 'customising',
        // v13.84: these turned up in the 24 Aug proof run inside an en-AU pack and
        // were simply absent from this map - the -ation/-ational noun forms above all
        // were, which is why "organize" was corrected but "organization" was not.
        'emphasize': 'emphasise', 'emphasizes': 'emphasises', 'emphasized': 'emphasised', 'emphasizing': 'emphasising',
        'organization': 'organisation', 'organizations': 'organisations', 'organizational': 'organisational',
        'authorization': 'authorisation', 'authorizations': 'authorisations',
        'unauthorized': 'unauthorised',
        'specialization': 'specialisation', 'specializations': 'specialisations',
        'standardization': 'standardisation', 'standardizations': 'standardisations',
        'customization': 'customisation', 'customizations': 'customisations',
        'summarize': 'summarise', 'summarizes': 'summarises', 'summarized': 'summarised', 'summarizing': 'summarising',
        'categorize': 'categorise', 'categorizes': 'categorises', 'categorized': 'categorised', 'categorizing': 'categorising',
        'finalize': 'finalise', 'finalizes': 'finalises', 'finalized': 'finalised', 'finalizing': 'finalising',
        'utilize': 'utilise', 'utilizes': 'utilises', 'utilized': 'utilised', 'utilizing': 'utilising',
        'realize': 'realise', 'realizes': 'realises', 'realized': 'realised', 'realizing': 'realising',
        'apologize': 'apologise', 'apologizes': 'apologises', 'apologized': 'apologised', 'apologizing': 'apologising',
        'criticize': 'criticise', 'criticizes': 'criticises', 'criticized': 'criticised', 'criticizing': 'criticising',
        'normalize': 'normalise', 'normalizes': 'normalises', 'normalized': 'normalised', 'normalizing': 'normalising',
        'optimize': 'optimise', 'optimizes': 'optimises', 'optimized': 'optimised', 'optimizing': 'optimising',
        'formalize': 'formalise', 'formalizes': 'formalises', 'formalized': 'formalised', 'formalizing': 'formalising',
        // VET-specific terms - AU uses single-l for base, double-l for suffixes
        'enroll': 'enrol', 'enrolls': 'enrols', 'enrollment': 'enrolment', 'enrollments': 'enrolments',
        'fulfill': 'fulfil', 'fulfills': 'fulfils', 'fulfillment': 'fulfilment', 'fulfillments': 'fulfilments',
        'skillful': 'skilful', 'skillfully': 'skilfully',
        'counseling': 'counselling', 'counselor': 'counsellor', 'counselors': 'counsellors', 'counseled': 'counselled',
        // Common -er  ->  -re
        'center': 'centre', 'centers': 'centres', 'centered': 'centred', 'centering': 'centring',
        // v13.90.1: 'meter' -> 'metre' REMOVED. Australian and British English spell the
        // MEASURING INSTRUMENT "meter" (flow meter, gas meter, water meter, multimeter)
        // and only the UNIT OF LENGTH "metre". This map has no way to tell them apart,
        // and this plugin's core use case is trades and WHS content, where the instrument
        // sense dominates: "check the flow meter before starting" was being rewritten to
        // "check the flow metre" in shipped learner content. The unit is far more often
        // written as "m" or already correct, so removing the rule is the safer default.
        'theater': 'theatre', 'theaters': 'theatres',
        'fiber': 'fibre', 'fibers': 'fibres',
        'liter': 'litre', 'liters': 'litres',
        // Common -se/-ce
        // v13.90.1: 'license' -> 'licence' REMOVED for the same reason. In Australian
        // English "licence" is the NOUN and "license" is the VERB, both correct - so
        // "the regulator will license the operator" was being corrupted to "will licence
        // the operator". A word-level map cannot resolve part of speech.
        'defense': 'defence', 'offense': 'offence',
        'practicing': 'practising', 'practiced': 'practised',
        // Common -og  ->  -ogue
        'catalog': 'catalogue', 'catalogs': 'catalogues',
        'dialog': 'dialogue', 'dialogs': 'dialogues',
        'analog': 'analogue',
        // Double consonants (AU doubles the consonant before -ing/-ed/-er)
        'traveling': 'travelling', 'traveled': 'travelled', 'traveler': 'traveller', 'travelers': 'travellers',
        'canceled': 'cancelled', 'canceling': 'cancelling',
        'labeled': 'labelled', 'labeling': 'labelling',
        'modeling': 'modelling', 'modeled': 'modelled',
        'leveling': 'levelling', 'leveled': 'levelled',
        'rivaling': 'rivalling', 'rivaled': 'rivalled',
        'signaling': 'signalling', 'signaled': 'signalled',
        'fueling': 'fuelling', 'fueled': 'fuelled',
        'dialing': 'dialling', 'dialed': 'dialled',
        'totaling': 'totalling', 'totaled': 'totalled'
        // Note: 'program' kept as-is (used in technical/software context)
    };

    // v9.77 PERF: Pre-compile all Australian spelling regexes once at module load.
    // Previously applyAustralianSpelling() called `new RegExp(...)` for every entry
    // on EVERY string, creating 60 new RegExp objects per call. Since normalizeContent()
    // recurses over every string in every card's entire object tree, a 7-card section
    // triggered 60  x  (strings per card) new regex compilations  -  many thousands per
    // generation. Pre-compiling cuts that to zero allocations at call time.
    const AUSTRALIAN_SPELLING_COMPILED = Object.entries(australianSpelling).map(([american, australian]) => ({
        regex: new RegExp('\\b' + american + '\\b', 'gi'),
        au: australian
    }));

    const applyAustralianSpelling = (text) => {
        if (!text || typeof text !== 'string') return text;
        let result = text;
        for (const rule of AUSTRALIAN_SPELLING_COMPILED) {
            result = result.replace(rule.regex, (match) => {
                // v13.84: an ALL-CAPS match used to come back title-cased, so
                // "AUTHORIZED PERSONNEL ONLY" became "Authorised PERSONNEL ONLY".
                if (match.length > 1 && match === match.toUpperCase()) {
                    return rule.au.toUpperCase();
                }
                if (match[0] === match[0].toUpperCase()) {
                    return rule.au.charAt(0).toUpperCase() + rule.au.slice(1);
                }
                return rule.au;
            });
        }
        return result;
    };

    // v13.84: every Commonwealth English variant wants the same convention.
    // The gate below used to be language === 'en-AU' exactly, so an en-GB or en-NZ
    // pack got no spelling normalisation at all.
    const COMMONWEALTH_ENGLISH = /^en-(AU|GB|UK|NZ|IE|ZA|IN|PK|SG|MY|HK)$/i;

    // v7.9.60: Recursively normalize all text in generated content
    // Only applies Commonwealth spelling for Commonwealth English locales
    // v11.02: Also replaces em dashes ( - ) with spaced hyphens ( - ) globally.
    const normalizeContent = (obj, language = 'en-AU') => {
        if (!obj) return obj;
        if (typeof obj === 'string') {
            // v11.02 FIX-EM-DASH: ChatGPT loves em dashes  -  replace with spaced hyphens.
            let result = obj.replace(/\u2014/g, ' - ').replace(/ {2,}/g, ' ');
            if (COMMONWEALTH_ENGLISH.test(language || '')) {
                return applyAustralianSpelling(result);
            }
            return result;
        }
        if (Array.isArray(obj)) {
            return obj.map(item => normalizeContent(item, language));
        }
        if (typeof obj === 'object') {
            const normalized = {};
            for (const [key, value] of Object.entries(obj)) {
                normalized[key] = normalizeContent(value, language);
            }
            return normalized;
        }
        return obj;
    };

    // VERSION CHECK - This proves Moodle is loading the correct JS file

    // Content depth modes (v7.9.7: all use pure 5-card model)
    const DEPTH_MODES = {
        QUICK: 'quick',           // Legacy - now uses 5-card
        RTO_COMPLIANT: 'rto',     // 5-Card per PC
        AUDIT_READY: 'audit',     // 5-Card per PC (more thorough)
        FIVE_CARD: 'fivecard'     // Explicit 5-Card model flag
    };

    // v10.27: All 4 routes use the same 7-card unified flow.
    // v10.43b: decision-point moved to LAST so voiceover completes before learner interacts.
    // Legacy per-route card types are kept renderable for backward compat.
    const UNIFIED_CARD_ORDER = [
        'hook-scenario',
        'concept-explainer',
        'mental-model',
        'applied-scenario',
        'mistakes',
        'competency-summary',
        'decision-point'
    ];

    // FIX-CC-UNIVERSITY-CARDTYPES (v13.65): University is NOT a unified 7-card route.
    // UNIVERSITY_SYSTEM_PROMPT in prompts.js requests exactly 6 academic cards with
    // their own cardTypes. getExpectedCardOrder() accepted a `mode` argument and then
    // ignored it, always returning UNIFIED_CARD_ORDER. Because the university types are
    // absent from that list, normalizeCardSchema() force-rewrote each one to the
    // positional unified type — concept-anchor became hook-scenario, analytical-lens
    // became mental-model — and validateCards() then failed with
    // "mental-model: requires at least 3 steps".
    const UNIVERSITY_CARD_ORDER = [
        'concept-anchor',
        'theoretical-framework',
        'analytical-lens',
        'ethics-considerations',
        'case-study-1',
        'case-study-2'
    ];

    // v13.92: Route 5 - "Topics and Text". Four short prose cards with FIXED universal
    // headings (Overview / Key Concepts / Examples & Application / Key Takeaways), then a
    // decision-point which is not a content card at all - it renders as the same
    // three-activity challenge block every other route ends on.
    //
    // Replaces the v13.91 five-slot Explanatory Spine (orientation / foundations /
    // mechanism / in-practice / boundaries), which generated its own topic-specific
    // headings and ran long. The legacy five are still rendered by cc-card-slots.js so
    // modules built on v13.91 keep working; nothing generates them any more.
    const TOPICSTEXT_CARD_ORDER = [
        'overview',
        'key-concepts',
        'examples-application',
        'key-takeaways',
        'decision-point'
    ];

    // v13.92: the v13.91 slots. Retained for rendering and normalising saved modules.
    // Unused (v13.95.5): superseded ordering, underscored to satisfy no-unused-vars.
    const _TOPICSTEXT_LEGACY_CARD_ORDER = [
        'orientation', 'foundations', 'mechanism', 'in-practice', 'boundaries'
    ];

    const getExpectedCardOrder = (mode, activitiesEnabled) => {
        // v13.92: topics-and-text now carries a decision-point like the unified routes,
        // so the activities toggle applies to it in exactly the same way.
        if (mode === 'topicstext') {
            var ttOrder = TOPICSTEXT_CARD_ORDER.slice();
            if (activitiesEnabled === false) {
                ttOrder = ttOrder.filter(function (t) { return t !== 'decision-point'; });
            }
            return ttOrder;
        }
        // v13.65: university has its own 6-card academic sequence and no decision-point.
        if (mode === 'university') {
            return UNIVERSITY_CARD_ORDER.slice();
        }
        // v10.27: unified 7-card flow for vet / workplace / pd
        var order = UNIFIED_CARD_ORDER.slice();
        // v11.11: When activities are disabled, exclude decision-point card
        if (activitiesEnabled === false) {
            order = order.filter(function (t) { return t !== 'decision-point'; });
        }
        return order;
    };

    // =======================================================================
    // v13.92: PROSE PARAGRAPH SANITISER  -  Topics-and-Text.
    //
    // The v13.91 build shipped cards reading "...contemporary society.\n\nThis piece
    // focuses on..." with the backslash and the n VISIBLE on screen. Cause: the model
    // returned the whole card as ONE string in paragraphs[0] with escaped newlines
    // inside it, so nothing ever split it and escapeHtml() faithfully printed the
    // literal characters.
    //
    // This normalises every shape into a clean array of plain-text paragraphs:
    //   - a single string, an array of strings, or an array of {text}/{paragraph}/{body}
    //   - splits on real newlines AND on the two-character sequences \n and \r
    //   - strips markdown emphasis, bullet glyphs, leading list markers and stray <br>
    //   - drops a paragraph that is only a heading repeat
    // Defensive on purpose: the prompt already forbids all of this. Prompts are advice;
    // this is the guarantee.
    // =======================================================================
    const CC_PROSE_TYPES = ['overview', 'key-concepts', 'examples-application', 'key-takeaways',
        'orientation', 'foundations', 'mechanism', 'in-practice', 'boundaries'];

    const normaliseProseParagraphs = function (raw) {
        var out = [];
        var push = function (v) {
            if (typeof v !== 'string') { return; }
            // Literal escape sequences first, then real newlines and <br>.
            var t = v.replace(/\\r\\n|\\n|\\r/g, '\n')
                     .replace(/<br\s*\/?>/gi, '\n')
                     .replace(/<\/?p[^>]*>/gi, '\n');
            t.split(/\n{1,}/).forEach(function (part) {
                var cleaned = part
                    .replace(/^\s*(?:[-*•–—]|\d+[.)])\s+/, '') // list markers
                    .replace(/\*\*(.+?)\*\*/g, '$1')                          // bold
                    .replace(/(^|\s)\*(?!\s)(.+?)\*(?=\s|$)/g, '$1$2')        // italic
                    .replace(/^#{1,6}\s*/, '')                                // md heading
                    .replace(/\s{2,}/g, ' ')
                    .trim();
                if (cleaned) { out.push(cleaned); }
            });
        };
        if (typeof raw === 'string') { push(raw); }
        else if (Array.isArray(raw)) {
            raw.forEach(function (item) {
                if (typeof item === 'string') { push(item); }
                else if (item && typeof item === 'object') {
                    push(item.text || item.paragraph || item.body || item.content || '');
                }
            });
        }
        return out;
    };

    const normalizeCardSchema = (cards, mode) => {
        if (!Array.isArray(cards)) return cards;
        const expectedOrder = getExpectedCardOrder(mode);
        const allNewTypes = new Set([
            // v10.43b unified 7-card types (decision-point last)
            'hook-scenario','concept-explainer','mental-model','applied-scenario','mistakes','competency-summary','decision-point',
            // legacy VET types
            'performance-anchor','plain-english','action-breakdown','competence-standard','scenario-1','scenario-2','common-errors',
            // legacy university types
            'concept-anchor','theoretical-framework','analytical-lens','ethics-considerations','case-study-1','case-study-2',
            // legacy workplace types
            'business-impact','action-framework','risk-card','policy-alignment',
            // legacy PD types
            'skill-anchor','core-framework','application-guide','common-pitfalls',
            // v13.92 topics-and-text prose types (+ the v13.91 slots they replaced)
            'overview','key-concepts','examples-application','key-takeaways',
            'orientation','foundations','mechanism','in-practice','boundaries'
        ]);
        const typeMap = {};
        expectedOrder.forEach(t => { typeMap[t] = t; });
        // v10.27 unified type aliases
        typeMap['hook_scenario']        = 'hook-scenario';
        typeMap['hookscenario']         = 'hook-scenario';
        typeMap['hook scenario']        = 'hook-scenario';
        typeMap['concept_explainer']    = 'concept-explainer';
        typeMap['conceptexplainer']     = 'concept-explainer';
        typeMap['concept explainer']    = 'concept-explainer';
        typeMap['mental_model']         = 'mental-model';
        typeMap['mentalmodel']          = 'mental-model';
        typeMap['mental model']         = 'mental-model';
        typeMap['applied_scenario']     = 'applied-scenario';
        typeMap['appliedscenario']      = 'applied-scenario';
        typeMap['applied scenario']     = 'applied-scenario';
        typeMap['decision_point']       = 'decision-point';
        typeMap['decisionpoint']        = 'decision-point';
        typeMap['decision point']       = 'decision-point';
        typeMap['competency_summary']   = 'competency-summary';
        typeMap['competencysummary']    = 'competency-summary';
        typeMap['competency summary']   = 'competency-summary';
        // legacy type aliases
        typeMap['performance_anchor'] = 'performance-anchor';
        typeMap['plain_english'] = 'plain-english';
        typeMap['action_breakdown'] = 'action-breakdown';
        typeMap['competence_standard'] = 'competence-standard';
        typeMap['scenario_1'] = 'scenario-1';
        typeMap['scenario_2'] = 'scenario-2';
        typeMap['common_errors'] = 'common-errors';
        typeMap['concept_anchor'] = 'concept-anchor';
        typeMap['theoretical_framework'] = 'theoretical-framework';
        typeMap['analytical_lens'] = 'analytical-lens';
        typeMap['ethics_considerations'] = 'ethics-considerations';
        typeMap['case_study_1'] = 'case-study-1';
        typeMap['case_study_2'] = 'case-study-2';
        typeMap['business_impact'] = 'business-impact';
        typeMap['action_framework'] = 'action-framework';
        typeMap['risk_card'] = 'risk-card';
        typeMap['policy_alignment'] = 'policy-alignment';
        typeMap['skill_anchor'] = 'skill-anchor';
        typeMap['core_framework'] = 'core-framework';
        typeMap['application_guide'] = 'application-guide';
        typeMap['common_pitfalls'] = 'common-pitfalls';
        typeMap['performanceanchor'] = 'performance-anchor';
        typeMap['plainenglish'] = 'plain-english';
        typeMap['actionbreakdown'] = 'action-breakdown';
        typeMap['competencestandard'] = 'competence-standard';
        typeMap['commonerrors'] = 'common-errors';
        typeMap['conceptanchor'] = 'concept-anchor';
        typeMap['theoreticalframework'] = 'theoretical-framework';
        typeMap['analyticallens'] = 'analytical-lens';
        typeMap['ethicsconsiderations'] = 'ethics-considerations';
        typeMap['casestudy1'] = 'case-study-1';
        typeMap['casestudy2'] = 'case-study-2';
        typeMap['businessimpact'] = 'business-impact';
        typeMap['actionframework'] = 'action-framework';
        typeMap['riskcard'] = 'risk-card';
        typeMap['policyalignment'] = 'policy-alignment';
        typeMap['skillanchor'] = 'skill-anchor';
        typeMap['coreframework'] = 'core-framework';
        typeMap['applicationguide'] = 'application-guide';
        typeMap['commonpitfalls'] = 'common-pitfalls';
        // v13.92 topics-and-text aliases. The model is asked for the exact hyphenated
        // names, but it reliably drifts to the human labels it sees in the heading spec.
        // v13.92 topics-and-text aliases. SCOPED TO THE ROUTE ON PURPOSE. The
        // unambiguous hyphen/underscore variants would be harmless anywhere, but the
        // bare words below are not: 'application', 'examples', 'summary' and
        // 'introduction' are plausible cardType values on the other four routes, and
        // mapping them globally would route a PD or VET card into renderProseSection(),
        // which drops every field it does not know and stamps a fixed Topics-and-Text
        // heading on it. typeMap is consulted for any card whose type is not already
        // known, on every route, so the gate has to be here.
        if (mode === 'topicstext') {
            typeMap['key_concepts']          = 'key-concepts';
            typeMap['keyconcepts']           = 'key-concepts';
            typeMap['key concepts']          = 'key-concepts';
            typeMap['examples_application']  = 'examples-application';
            typeMap['examplesapplication']   = 'examples-application';
            typeMap['examples application']  = 'examples-application';
            typeMap['examples & application'] = 'examples-application';
            typeMap['examples and application'] = 'examples-application';
            typeMap['application']           = 'examples-application';
            typeMap['examples']              = 'examples-application';
            typeMap['key_takeaways']         = 'key-takeaways';
            typeMap['keytakeaways']          = 'key-takeaways';
            typeMap['key takeaways']         = 'key-takeaways';
            typeMap['takeaways']             = 'key-takeaways';
            typeMap['summary']               = 'key-takeaways';
            typeMap['introduction']          = 'overview';
            typeMap['in_practice']           = 'in-practice';
            typeMap['inpractice']            = 'in-practice';
        }

        return cards.map((card, index) => {
            if (!card || typeof card !== 'object') return card;
            if (!card.cardType && card.type) {
                const mapped = typeMap[(card.type || '').toLowerCase()];
                card.cardType = mapped || card.type;
                delete card.type;
            }
            if (card.cardType && !allNewTypes.has(card.cardType)) {
                const mapped = typeMap[(card.cardType || '').toLowerCase()];
                if (mapped) {
                    card.cardType = mapped;
                }
            }
            if (!card.cardType && index < expectedOrder.length) {
                card.cardType = expectedOrder[index];
            }
            if (!card.description && card.body) { card.description = card.body; delete card.body; }
            if (!card.description && card.content && typeof card.content === 'string') { card.description = card.content; delete card.content; }
            if (!card.description && card.header) { card.description = card.header; delete card.header; }
            if (!card.keyFacts && card.facts) { card.keyFacts = card.facts; delete card.facts; }
            if (!card.keyFacts && card.key_facts) { card.keyFacts = card.key_facts; delete card.key_facts; }
            if (!card.keyFacts && card.listItems && Array.isArray(card.listItems)) {
                card.keyFacts = card.listItems;
                delete card.listItems;
            }
            if (!card.positiveList && card.positive_list) { card.positiveList = card.positive_list; delete card.positive_list; }
            if (!card.negativeList && card.negative_list) { card.negativeList = card.negative_list; delete card.negative_list; }
            if (!card.keyTakeaway && card.key_takeaway) { card.keyTakeaway = card.key_takeaway; delete card.key_takeaway; }
            if (!card.keyTakeaway && card.takeaway) { card.keyTakeaway = card.takeaway; delete card.takeaway; }
            if (!card.checklistItems && card.checklist_items) { card.checklistItems = card.checklist_items; delete card.checklist_items; }
            if (!card.checklistItems && card.checklist) { card.checklistItems = card.checklist; delete card.checklist; }
            if (!card.voiceoverText && card.voiceover_text) { card.voiceoverText = card.voiceover_text; delete card.voiceover_text; }
            if (!card.voiceoverText && card.voiceover) { card.voiceoverText = card.voiceover; delete card.voiceover; }
            if (!card.context && card.text) { card.context = card.text; delete card.text; }
            if (card.policies && !card.policyItems) { card.policyItems = card.policies; delete card.policies; }
            if (card.analysisPrompt && !card.analysisPrompts) {
                card.analysisPrompts = Array.isArray(card.analysisPrompt) ? card.analysisPrompt : [card.analysisPrompt];
                delete card.analysisPrompt;
            }
            if (card.impact_statement && !card.impactStatement) { card.impactStatement = card.impact_statement; delete card.impact_statement; }
            if (card.key_metrics && !card.keyMetrics) { card.keyMetrics = card.key_metrics; delete card.key_metrics; }
            if (card.optimisation_tips && !card.optimisationTips) { card.optimisationTips = card.optimisation_tips; delete card.optimisation_tips; }
            if (card.key_insight && !card.keyInsight) { card.keyInsight = card.key_insight; delete card.key_insight; }
            if (card.critical_reflection && !card.criticalReflection) { card.criticalReflection = card.critical_reflection; delete card.critical_reflection; }
            if (card.policy_items && !card.policyItems) { card.policyItems = card.policy_items; delete card.policy_items; }
            // v13.92: Topics-and-Text prose cards. Paragraphs are cleaned into plain
            // strings, and any heading the model returned against instructions is
            // DROPPED - the four headings are fixed, supplied by the renderer, and must
            // never carry the topic name ("Overview - Colonisation" was the defect).
            // MODE-GATED, and it must stay that way. This branch DELETES heading, title,
            // bodyText, text and string content/description and rewrites the card into
            // paragraphs[]. 'overview' and 'key-takeaways' are perfectly natural cardType
            // values for a model to emit on a PD or VET section; without the gate such a
            // card would have its authored text destroyed and then render through
            // renderProseSection() with a fixed Topics-and-Text heading inside a
            // vocational module.
            if (mode === 'topicstext' && CC_PROSE_TYPES.indexOf(card.cardType) !== -1) {
                var _rawParas = card.paragraphs;
                if (!_rawParas || (Array.isArray(_rawParas) && !_rawParas.length)) {
                    _rawParas = card.bodyText || card.content || card.description || card.text || '';
                }
                card.paragraphs = normaliseProseParagraphs(_rawParas);
                // v13.92: hard cap at two paragraphs. An overrun is merged into the
                // second rather than thrown away - silently deleting generated content is
                // worse than an over-long card, and an over-long one does not go
                // unnoticed: depthIssues()/readabilityIssues() measure the merged card
                // against the route's 110-150 band and drive a repair pass on it.
                if (card.paragraphs.length > 2) {
                    card.paragraphs = [
                        card.paragraphs[0],
                        card.paragraphs.slice(1).join(' ')
                    ];
                }
                delete card.heading;
                delete card.title;
                delete card.bodyText;
                delete card.text;
                if (typeof card.content === 'string') { delete card.content; }
                if (typeof card.description === 'string') { delete card.description; }
                // keyTerms feed the flip-card activity; goodItems/badItems feed the sort.
                if (!card.keyTerms && card.key_terms) { card.keyTerms = card.key_terms; delete card.key_terms; }
                if (!card.keyTerms && card.terms) { card.keyTerms = card.terms; delete card.terms; }
                if (Array.isArray(card.keyTerms)) {
                    card.keyTerms = card.keyTerms.map(function (t) {
                        if (typeof t === 'string') { return { term: t, definition: '' }; }
                        return {
                            term: (t && (t.term || t.title || t.name)) || '',
                            definition: (t && (t.definition || t.text || t.meaning || t.description)) || ''
                        };
                    }).filter(function (t) { return t.term && t.definition; });
                }
                if (!card.goodItems && card.good_items) { card.goodItems = card.good_items; delete card.good_items; }
                if (!card.badItems && card.bad_items) { card.badItems = card.bad_items; delete card.bad_items; }
                ['goodItems', 'badItems'].forEach(function (k) {
                    if (Array.isArray(card[k])) {
                        card[k] = card[k].map(function (it) {
                            return typeof it === 'string' ? { text: it } : { text: (it && (it.text || it.item || it.statement)) || '' };
                        }).filter(function (it) { return it.text; });
                    }
                });
            }

            // v10.27: Unified 7-card field normalizations
            if (card.cardType === 'hook-scenario' || card.cardType === 'concept-explainer' || card.cardType === 'applied-scenario') {
                if (!card.content && card.description) { card.content = card.description; delete card.description; }
                if (!card.content && card.bodyText) { card.content = card.bodyText; }
                if (card.highlight && !card.highlightText) { card.highlightText = card.highlight; delete card.highlight; }
                if (card.pull_quote && !card.highlightText) { card.highlightText = card.pull_quote; delete card.pull_quote; }
            }
            // v10.43: sceneParts[] normalization for hook-scenario + applied-scenario
            if (card.cardType === 'hook-scenario' || card.cardType === 'applied-scenario') {
                if (!card.sceneParts && card.scene_parts) { card.sceneParts = card.scene_parts; delete card.scene_parts; }
                if (!card.sceneParts && card.parts && Array.isArray(card.parts)) { card.sceneParts = card.parts; delete card.parts; }
                // v13.75 VENDOR-SCHEMA: the API stopped emitting sceneParts and now returns
                // the same content as keyPoints[]. Aliased so the renderers stay untouched.
                // Saved content that already has sceneParts keeps its own value  -  this only
                // ever fills a field that is missing.
                if (!card.sceneParts && Array.isArray(card.keyPoints) && card.keyPoints.length) {
                    card.sceneParts = card.keyPoints;
                }
                // v13.89: the delete added in v13.86 is REVERTED. Keeping both copies
                // wastes a little space, but it is what 13.83 shipped and it acts as a
                // fallback if a later pass answers in the vendor's field names rather than
                // the internal ones. Removing it was implicated in the v13.87 content loss.
                if (Array.isArray(card.sceneParts)) {
                    card.sceneParts = card.sceneParts.map(function (p) {
                        if (typeof p === 'string') return { title: '', icon: '', text: p };
                        // v10.99: widened alias  -  also reads detail/body/narrative in case
                        // the AI or a repair pass used a non-standard field name.
                        return { title: p.title || p.label || '', icon: p.icon || '', text: p.text || p.content || p.description || p.detail || p.body || p.narrative || '' };
                    });
                }
                // v10.97 FIX-SCENE-PARTS-SYNTHESIS: When the AI (or Story QA pass) wrote a flat
                // `content` string instead of a sceneParts array, synthesise 4 parts from the text
                // so the icon-panel renderer path always fires instead of the numbered-circle fallback.
                if (!card.sceneParts || !card.sceneParts.length) {
                    var _hookTitles97   = ['The Setting', 'The Details', 'What Happened', 'The Pressure'];
                    var _applyTitles97  = ['Back on the Job', 'The New Challenge', 'The Decision Moment', 'The Right Move'];
                    var _titles97 = (card.cardType === 'applied-scenario') ? _applyTitles97 : _hookTitles97;
                    // FIX-CC-FAILED-SCENE-PARTS: failed card descriptions contain the topic title
                    // which may have dots (e.g. "1.4. Load is packed..."), causing the sentence-split
                    // regex to fragment the error message across all 4 quadrant fields.
                    // Guard: build clean error sceneParts for failed cards instead of splitting.
                    if (card.failed) {
                        card.sceneParts = [
                            { title: _titles97[0], icon: '', text: 'AI generation failed for this topic.' },
                            { title: _titles97[1], icon: '', text: '' },
                            { title: _titles97[2], icon: '', text: '' },
                            { title: _titles97[3], icon: '', text: 'Please use \u201cRegenerate Failed\u201d to retry.' },
                        ];
                    } else {
                        var _flat97 = (card.content || card.description || '').trim();
                        if (_flat97) {
                            var _sents97 = _flat97.match(/[^.!?]+[.!?][\s]*/g) || [_flat97];
                            _sents97 = _sents97.map(function (s) { return s.trim(); }).filter(Boolean);
                            // v13.85 FIX BUG-SCENE-QUADRANT-DUPES: this always built FOUR
                            // quadrants, and the Math.max(start + 1, end) floor guaranteed a
                            // non-empty slice - so with fewer than four sentences the
                            // quadrants collided and the learner saw the same sentence twice
                            // or three times, under headings the AI never wrote:
                            //   1 sentence  -> S0, S0, S0, S0
                            //   2 sentences -> S0, S0, S1, S1
                            //   3 sentences -> S0, S0, S1, S2
                            // validateCards() then passed the card because the array was
                            // non-empty. Build only as many panels as there is text for, and
                            // distribute the sentences without overlap.
                            var _n97 = Math.min(4, _sents97.length);
                            card.sceneParts = [];
                            for (var _pi97 = 0; _pi97 < _n97; _pi97++) {
                                var _s97 = Math.floor(_pi97 * _sents97.length / _n97);
                                var _e97 = Math.floor((_pi97 + 1) * _sents97.length / _n97);
                                var _txt97 = _sents97.slice(_s97, _e97).join(' ').trim();
                                if (!_txt97) { continue; }
                                card.sceneParts.push({ title: _titles97[_pi97], icon: '', text: _txt97 });
                            }
                        }
                    }
                }
            }
            // v10.43: conceptInsights[] normalization for concept-explainer
            if (card.cardType === 'concept-explainer') {
                if (!card.conceptInsights && card.concept_insights) { card.conceptInsights = card.concept_insights; delete card.concept_insights; }
                if (!card.conceptInsights && card.insights && Array.isArray(card.insights)) { card.conceptInsights = card.insights; delete card.insights; }
                // v13.75 VENDOR-SCHEMA: conceptInsights is no longer emitted; the same
                // content arrives as keyPoints[], and the legalLink narrative as keyInfo.
                if (!card.conceptInsights && Array.isArray(card.keyPoints) && card.keyPoints.length) {
                    card.conceptInsights = card.keyPoints;
                }
                // v13.89: reverted for the same reason as sceneParts above.
                if (!card.legalLink && card.keyInfo) {
                    card.legalLink = {
                        legislationName: card.heading || '',
                        legalObligation: card.keyInfo,
                        scenarioConnection: card.summaryLine || '',
                        // v13.94.3: the panel this feeds is headed "What the law says".
                        // PD is explicitly the NON-regulatory route, so on PD that banner
                        // was appearing over an invented obligation - a module about
                        // giving feedback would grow a legal panel. The PD prompt now
                        // asks for a principle or professional standard instead, and this
                        // tells the renderer which banner to use.
                        // v13.96: Workplace card 2 now asks for the internal policy, SOP or
                        // service standard rather than legislation, so "What the law says" over
                        // an internal SOP name was simply wrong. Third key added.
                        labelKey: (mode === 'pd') ? 'whatThePrincipleRequires'
                            : ((mode === 'workplace') ? 'whatThePolicyRequires' : 'whatTheLawSays')
                    };
                }
                if (Array.isArray(card.conceptInsights)) {
                    card.conceptInsights = card.conceptInsights.map(function (i) {
                        if (typeof i === 'string') return { title: '', icon: '', text: i };
                        return { title: i.title || i.label || '', icon: i.icon || '', text: i.text || i.content || i.description || '' };
                    });
                }
            }
            if (card.cardType === 'mental-model') {
                if (!card.steps && card.actions) { card.steps = card.actions; delete card.actions; }
                if (!card.steps && card.process) { card.steps = card.process; delete card.process; }
                if (!card.steps && card.framework) { card.steps = Array.isArray(card.framework) ? card.framework : Object.values(card.framework || {}); delete card.framework; }
                if (!card.steps && card.frameworkSteps) { card.steps = card.frameworkSteps; }
                // v10.43: normalise step fields  -  preserve icon field
                if (Array.isArray(card.steps)) {
                    card.steps = card.steps.map(function (s) {
                        if (typeof s === 'string') return { step: s, detail: '', icon: '' };
                        var step = s.step || s.action || s.title || '';
                        var detail = s.detail || s.description || s.explanation || '';
                        var icon = s.icon || '';
                        return { step: step, detail: detail, icon: icon };
                    });
                }
            }
            if (card.cardType === 'decision-point') {
                if (!card.options && card.choices) { card.options = card.choices; delete card.choices; }
                if (!card.question && card.scenario) { card.question = card.scenario; delete card.scenario; }
                if (!card.question && card.prompt) { card.question = card.prompt; delete card.prompt; }
                // v13.75 VENDOR-SCHEMA: the API emits neither question nor options under any
                // name or content type, so the prompt now asks for the decision to be carried
                // in fields that do survive  -  the question as heading, the correct answer as
                // standardItems[0], and the distractors as errorItems[{error, consequence}].
                // Reassembled here into the {question, options[]} shape the player expects.
                if (!card.question && (card.heading || card.summaryLine)) {
                    card.question = card.heading || card.summaryLine;
                }
                if (!card.options && (Array.isArray(card.standardItems) || Array.isArray(card.errorItems))) {
                    var _readOpt = function (o) {
                        if (typeof o === 'string') { return { text: o, feedback: '' }; }
                        if (!o) { return { text: '', feedback: '' }; }
                        return {
                            text: o.text || o.error || o.mistake || o.pitfall || o.step || '',
                            feedback: o.consequence || o.feedback || o.detail || ''
                        };
                    };
                    // The correct answer is the FIRST usable standardItem. Any extras are
                    // ignored rather than added, because a decision point must have exactly
                    // one right answer  -  the expansion pass sometimes pads these arrays.
                    var _right = null;
                    (card.standardItems || []).some(function (s) {
                        var o = _readOpt(s);
                        if (o.text) { _right = o; return true; }
                        return false;
                    });
                    var _wrong = (card.errorItems || []).map(_readOpt).filter(function (o) { return o.text; });
                    if (_right && _wrong.length) {
                        card.options = [{ text: _right.text, feedback: _right.feedback, correct: true }]
                            .concat(_wrong.map(function (o) {
                                return { text: o.text, feedback: o.feedback, correct: false };
                            }));
                    }
                }
                // normalise option fields: {text,feedback,correct/isCorrect}
                if (Array.isArray(card.options)) {
                    card.options = card.options.map(function (o) {
                        if (typeof o === 'string') return { text: o, feedback: '', correct: false };
                        return {
                            text: o.text || o.option || o.label || '',
                            feedback: o.feedback || o.explanation || o.result || '',
                            correct: !!(o.correct || o.isCorrect || o.is_correct)
                        };
                    });
                }
                // accept correctOption letter  ->  mark correct
                if (card.correctOption && Array.isArray(card.options)) {
                    var letters = { A:0,B:1,C:2,D:3,a:0,b:1,c:2,d:3 };
                    var correctIdx = letters[card.correctOption];
                    if (correctIdx !== undefined) {
                        card.options.forEach(function (o, i) { o.correct = (i === correctIdx); });
                    }
                    delete card.correctOption;
                }
            }
            if (card.cardType === 'mistakes') {
                if (!card.items && card.mistakes) { card.items = card.mistakes.map(function (m) { return typeof m === 'string' ? { mistake: m } : m; }); delete card.mistakes; }
                // v13.85: `icon` was dropped on every one of these paths, so the icon the
                // prompt asks for and the renderer reads never survived the middle of the
                // pipe - resolveScenePartIcon() always fell back to keyword guessing.
                if (!card.items && card.errorItems) {
                    card.items = card.errorItems.map(function (e) {
                        return { mistake: e.error || e.pitfall || '', icon: e.icon || '', consequence: e.consequence || '' };
                    });
                }
                if (!card.items && card.pitfallItems) {
                    card.items = card.pitfallItems.map(function (p) {
                        return { mistake: p.pitfall || p.error || '', icon: p.icon || '', consequence: p.consequence || '' };
                    });
                }
                // normalise item fields
                if (Array.isArray(card.items)) {
                    card.items = card.items.map(function (item) {
                        if (typeof item === 'string') return { mistake: item, icon: '', consequence: '' };
                        return {
                            mistake: item.mistake || item.error || item.pitfall || '',
                            icon: item.icon || '',
                            consequence: item.consequence || item.result || item.impact || ''
                        };
                    });
                }
                // v13.89: deletes reverted. See the note on sceneParts above.
            }
            if (card.cardType === 'competency-summary') {
                // v10.39: goodItems / badItems dual-column schema  -  normalise all AI field aliases
                const _toStrArray = function (arr) {
                    if (!Array.isArray(arr)) return [];
                    return arr.map(function (item) {
                        if (typeof item === 'string') return item.trim();
                        return (item.text || item.behaviour || item.criterion || item.item || '').trim();
                    }).filter(Boolean);
                };
                // v13.85: like _toStrArray but keeps the consequence alongside the label.
                const _toPairArray = function (arr) {
                    if (!Array.isArray(arr)) return [];
                    return arr.map(function (item) {
                        if (typeof item === 'string') { return { text: item.trim(), consequence: '' }; }
                        return {
                            text: (item.text || item.error || item.behaviour || item.criterion || item.item || '').trim(),
                            consequence: (item.consequence || item.impact || item.result || '').trim()
                        };
                    }).filter(function (p) { return p.text; });
                };
                // goodItems aliases
                if (!card.goodItems) {
                    // v13.75 VENDOR-SCHEMA: standardItems is what the API now emits for the
                    // "what good looks like" column.
                    card.goodItems = card.good_items || card.dos || card.whatGoodLooksLike ||
                                     card.what_good_looks_like || card.positiveExamples ||
                                     card.standardItems || null;
                }
                // v13.95.8: goodItems now carry a benefit line, the mirror of the
                // consequence on badItems, so that both Card 6 columns read as a short
                // label plus one explanatory line. _toStrArray would flatten them back
                // to bare labels, so this uses its own pair mapper. An item with no
                // benefit still renders as a single line, which is what saved modules
                // from earlier builds contain.
                const _toGoodPairArray = function (arr) {
                    if (!Array.isArray(arr)) return [];
                    return arr.map(function (item) {
                        if (typeof item === 'string') { return { text: item.trim(), benefit: '' }; }
                        return {
                            text: (item.text || item.behaviour || item.criterion || item.item || '').trim(),
                            benefit: (item.benefit || item.why || item.outcome || item.result || '').trim()
                        };
                    }).filter(function (p) { return p.text; });
                };
                if (card.goodItems) card.goodItems = _toGoodPairArray(card.goodItems);
                // badItems aliases
                if (!card.badItems) {
                    // v13.75 VENDOR-SCHEMA: errorItems is what the API now emits for the
                    // "what to avoid" column. Entries are {error, consequence} objects, and
                    // _toStrArray below already reads .text/.behaviour/.criterion/.item, so
                    // the label is lifted out here first.
                    var _vendorBad = card.bad_items || card.donts || card.whatToAvoid ||
                                     card.what_to_avoid || card.negativeExamples || null;
                    if (!_vendorBad && Array.isArray(card.errorItems) && card.errorItems.length) {
                        // v13.85: this used to keep only the label and throw the
                        // consequence away - about fifty words of generated, billed
                        // content per section, deleted before anything could render it.
                        // The prompt asks for a 10+ word consequence on every item.
                        _vendorBad = card.errorItems.map(function (e) {
                            if (typeof e === 'string') return { text: e, consequence: '' };
                            return {
                                text: e.error || e.mistake || e.pitfall || e.text || '',
                                consequence: e.consequence || e.impact || e.result || ''
                            };
                        });
                    }
                    card.badItems = _vendorBad;
                }
                // v13.85: preserve {text, consequence} objects; _toStrArray would flatten
                // them back to bare labels and undo the fix above.
                if (card.badItems) { card.badItems = _toPairArray(card.badItems); }
                // backward-compat: old items[] checklist still supported for legacy saved content
                if (!card.items && card.standardItems) { card.items = card.standardItems; }
                if (!card.items && card.checklistItems) { card.items = card.checklistItems; }
                if (!card.items && card.criteria)       { card.items = card.criteria; }
                if (!card.items && card.behaviours)     { card.items = card.behaviours; }
                if (Array.isArray(card.items)) {
                    card.items = _toStrArray(card.items);
                }
            }
            if (card.cardType && index < expectedOrder.length && card.cardType !== expectedOrder[index]) {
                const expectedSet = new Set(expectedOrder);
                if (!expectedSet.has(card.cardType)) {
                    card.cardType = expectedOrder[index];
                }
            }
            return card;
        });
    };

    const unwrapCardsObject = (parsed) => {
        if (!parsed) return parsed;
        if (Array.isArray(parsed)) return parsed;
        if (typeof parsed === 'object' && Array.isArray(parsed.cards)) return parsed.cards;
        return parsed;
    };

    const parseJsonResponse = (text) => {
        const sanitizeJsonString = (jsonText) => {
            return jsonText.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, (match, content) => {
                const escaped = content
                    .replace(/\r\n/g, '\\n')
                    .replace(/\n/g, '\\n')
                    .replace(/\r/g, '\\r')
                    .replace(/\t/g, '\\t')
                    // Intentional control-character match: after the escapes above, any
                    // remaining C0 control character (U+0000-U+001F) or DEL (U+007F) is
                    // illegal inside a JSON string literal and would break JSON.parse,
                    // so the model's stray control bytes are dropped here.
                    // eslint-disable-next-line no-control-regex
                    .replace(/[\x00-\x1F\x7F]/g, '');
                return '"' + escaped + '"';
            });
        };
        
        try {
            let cleaned = text
                .replace(/```json/gi, '')
                .replace(/```/g, '')
                .trim();
            
            try {
                return unwrapCardsObject(JSON.parse(cleaned));
            } catch (directError) {
                const sanitized = sanitizeJsonString(cleaned);
                return unwrapCardsObject(JSON.parse(sanitized));
            }
        } catch (e) {
            
            try {
                let repaired = text
                    .replace(/```json/gi, '')
                    .replace(/```/g, '')
                    .trim();
                
                repaired = sanitizeJsonString(repaired);
                
                repaired = repaired.replace(/,\s*"[^"]*":\s*\[?\s*$/, '');
                repaired = repaired.replace(/,\s*"[^"]*":\s*"[^"]*$/, '');
                repaired = repaired.replace(/,\s*"[^"]*"\s*$/, '');
                repaired = repaired.replace(/,\s*$/, '');
                
                const openBrackets = (repaired.match(/\[/g) || []).length;
                const closeBrackets = (repaired.match(/\]/g) || []).length;
                const openBraces = (repaired.match(/\{/g) || []).length;
                const closeBraces = (repaired.match(/\}/g) || []).length;
                const missingBraces = openBraces - closeBraces;
                const missingBrackets = openBrackets - closeBrackets;
                
                if (missingBraces > 0 || missingBrackets > 0) {
                    repaired += '}'.repeat(Math.max(0, missingBraces));
                    repaired += ']'.repeat(Math.max(0, missingBrackets));
                }
                
                const parsed = JSON.parse(repaired);
                return unwrapCardsObject(parsed);
            } catch (repairError) {
                // v11.69 Fix 1 (ChatGPT): Salvage pass  -  extract embedded array/object from prose.
                // Handles AI responses that wrap JSON in explanatory text before or after the array.
                try {
                    const arrMatch = text.match(/(\[[\s\S]*\])/);
                    const objMatch = text.match(/(\{[\s\S]*\})/);
                    const fragment = (arrMatch && arrMatch[1]) || (objMatch && objMatch[1]);
                    if (fragment) {
                        return unwrapCardsObject(JSON.parse(sanitizeJsonString(fragment)));
                    }
                } catch (salvageError) { /* fall through */ }
                return null;
            }
        }
    };

    // -- Async job poller: used by callAI after it starts a generate_slide_async job --
    // Polls GET ajax.php?action=poll_job&jobId=xxx every 3s (first poll after 2s).
    // Returns the inner payload {success, content, credits} when status=done.
    // FIX-CC-POLL-CEILING (v13.65): MAX_POLLS was 50 (2s + 49x3s = 149s hard ceiling).
    // The server-side pipeline is PASS 1 (7 cards, 54-field schema, ~14k token target)
    // PLUS Pass 2 expansion, Pass 3 banned-word rewrite and micro-expansion — several
    // sequential OpenAI calls, where a single 14k-token completion alone routinely takes
    // 90-150s. ajax.php already allows the server 180s (CURLOPT_TIMEOUT => 180), so the
    // browser was the tighter constraint and was abandoning jobs the server was still
    // working on. 120 polls = ~6 minutes.
    //
    // FIX-CC-POLL-TOLERANCE (v13.65): a single non-2xx response, or the cURL timeout
    // inside ajax.php's poll_job handler, used to throw immediately and abandon a job that
    // was almost certainly still running fine — callAI() then started a BRAND NEW billable
    // job. Transient poll failures are now absorbed.
    //
    // FIX-CC-POLL-AUTH (v13.65): poll_job in ajax.php now requires cmid so it can enforce
    // a capability check, so cmid is passed through here. The AMD build and ajax.php must
    // be deployed together.
    const pollJob = async (ajaxUrl, jobId, sesskey, cmid) => {
        const MAX_POLLS = 120;               // 2s + 119x3s = ~6 minutes
        const MAX_CONSECUTIVE_POLL_ERRORS = 5;
        let consecutiveErrors = 0;
        for (let i = 0; i < MAX_POLLS; i++) {
            // Wait before polling: 2s on first attempt so the loopback has time to start
            await new Promise(resolve => setTimeout(resolve, i === 0 ? 2000 : 3000));

            let pollData;
            try {
                // v13.93.3: a poll with no deadline can hang forever, and because the
                // loop awaits it the whole polling sequence stops - no further polls, no
                // consecutive-error counting, no timeout. 25s is well beyond the 20s
                // ajax.php allows its own status call.
                const pollResp = await CcState.fetchWithDeadline(
                    ajaxUrl + '?action=poll_job&jobId=' + encodeURIComponent(jobId) +
                        '&sesskey=' + encodeURIComponent(sesskey) +
                        '&cmid=' + encodeURIComponent(cmid),
                    { method: 'GET' }, 'The job status check', 25000
                );
                if (!pollResp.ok) { throw new Error('Poll HTTP error: ' + pollResp.status); }
                pollData = JSON.parse(await pollResp.text());
                if (!pollData.ok) { throw new Error(pollData.error || 'Job status check failed'); }
            } catch (pollErr) {
                consecutiveErrors++;
                if (consecutiveErrors >= MAX_CONSECUTIVE_POLL_ERRORS) {
                    throw new Error('Job status check failed ' + consecutiveErrors +
                        ' times in a row: ' + (pollErr.message || pollErr));
                }
                ccWarn('callAI() poll #' + (i + 1) + ' transient failure (' +
                    consecutiveErrors + '/' + MAX_CONSECUTIVE_POLL_ERRORS + '): ' +
                    (pollErr.message || pollErr) + '  ->  job still running, retrying');
                continue;
            }

            consecutiveErrors = 0;
            if (pollData.status === 'done')  { return pollData.result; } // {success, content, credits}
            if (pollData.status === 'error') { throw new Error(pollData.error || 'Generation job failed'); }
            ccDiag('callAI() poll #' + (i + 1) + '  ->  pending, waiting 3s...');
        }
        throw new Error('OPENAI_TIMEOUT: Content generation timed out after ~6 minutes of polling');
    };

    // FIX-CC-LANG-EXPLICIT (v12.99): Add language parameter so the server receives
    // it directly instead of having to extract it from the system prompt text.
    // Server-side secondary passes (Pass 2 expansion, Pass 3 rewrite, micro-expansion)
    // use this field to inject the mandatory language guard — extraction from prompt
    // text was fragile and silently failed for German and other non-English languages,
    // causing secondary passes to rewrite content in English.
    const callAI = async (prompt, cmid, contentType, retryCount = 0, route = 'vet', language = 'en-AU', billingKey = '') => {
        const MAX_RETRIES = 5;
        const BASE_DELAY_MS = 1000;
        const MAX_DELAY_MS = 32000;

        // FIX-CC-RETRY-RESUBMITS-BILLED-JOB (v13.95.1): the server charges at SUBMIT, not at
        // completion - ajax.php sends creditsToUse to /prompt/start. So once we hold a jobId the
        // credits are already spent, and re-entering callAI() (which POSTs generate_slide_async
        // again) buys the same content a second time. That is how one flaky section could bill
        // 6 times; on an ml_translate_* pass, priced at 50 credits a submit, that is 300 credits
        // for a section quoted at 50. Retrying is only ever safe BEFORE a job exists.
        let billedJobId = null;
        
        ccDiag('callAI() START | type=' + contentType + ' | cmid=' + cmid + ' | retry=' + retryCount + '/' + MAX_RETRIES);
        ccDiag('callAI() systemPrompt length=' + (prompt.system?.length || 0) + ' | userPrompt length=' + (prompt.user?.length || 0));
        
        if (retryCount > 0) {
            ccDiag('callAI() RETRY #' + retryCount + ' for ' + contentType);
        }
        
        const formData = new FormData();
        formData.append('sesskey', M.cfg.sesskey);
        formData.append('action', 'generate_slide_async'); // v11.45: async start+poll to beat proxy timeout
        formData.append('cmid', cmid);
        formData.append('slidetype', contentType);
        formData.append('route', route); // v11.42 FIX BUG-CC-ROUTE-MISSING: pass route so server uses correct ccExpectedCardCount (was always defaulting to 'vet')
        formData.append('language', language); // FIX-CC-LANG-EXPLICIT (v12.99): explicit language for server secondary passes
        formData.append('systemprompt', prompt.system);
        formData.append('userprompt', prompt.user);
        // FIX-CC-SUBTOPIC-BILLING-KEY (v13.95.2): identifies the subtopic this call belongs to,
        // so the vendor charges the subtopic once and treats the structural repair pass - and
        // every voiceover and image for the same subtopic - as already paid for.
        formData.append('subtopickey', billingKey || '');

        const ajaxUrl = M.cfg.wwwroot + '/mod/contentcreator/ajax.php';
        ccDiag('callAI() POST  ->  ' + ajaxUrl);

        try {
            // v11.45 ASYNC: The /start endpoint just enqueues the job and returns a jobId in
            // ~500ms via loopback  -  no need for a long abort window. 12s is plenty.
            const fetchStart = Date.now();
            const abortController = new AbortController();
            const abortTimer = setTimeout(() => abortController.abort(), 12000);
            let response;
            try {
                response = await fetch(ajaxUrl, {
                    method: 'POST',
                    body: formData,
                    signal: abortController.signal
                });
            } finally {
                clearTimeout(abortTimer);
            }
            const fetchMs = Date.now() - fetchStart;

            ccDiag('callAI() HTTP response: status=' + response.status + ' | ok=' + response.ok + ' | time=' + fetchMs + 'ms');
            
            if (!response.ok) {
                ccError('callAI() HTTP ERROR: status=' + response.status + ' statusText=' + response.statusText);
                throw new Error('Server error: ' + response.status);
            }

            const rawText = await response.text();
            ccDiag('callAI() Raw response length=' + rawText.length + ' chars | preview=' + rawText.substring(0, 200));

            let data;
            try {
                data = JSON.parse(rawText);
            } catch (jsonErr) {
                ccError('callAI() FAILED TO PARSE SERVER RESPONSE AS JSON');
                ccError('callAI() Raw response (first 1000 chars):', rawText.substring(0, 1000));
                pushDebugLogEntry({
                    type: 'AJAX_JSON_PARSE_FAIL',
                    contentType,
                    retryCount,
                    rawResponseLength: rawText.length,
                    rawResponsePreview: rawText.substring(0, 2000),
                    parseError: jsonErr.message
                });
                throw new Error('Server returned invalid JSON: ' + jsonErr.message);
            }
            
            // v11.45 ASYNC: if the start endpoint returned a jobId, poll until done.
            // pollJob() returns the inner {success, content, credits} payload so the
            // rest of callAI continues unchanged.
            if (data.async && data.jobId) {
                ccDiag('callAI() ASYNC JOB queued | jobId=' + data.jobId + ' | polling every 3s (max ~6 min)');
                // From here the credits are spent. See FIX-CC-RETRY-RESUBMITS-BILLED-JOB above.
                billedJobId = data.jobId;
                data = await pollJob(ajaxUrl, data.jobId, M.cfg.sesskey, cmid);
                ccDiag('callAI() ASYNC JOB done | content items=' + (Array.isArray(data?.content) ? data.content.length : 'n/a'));
            }

            if (!data.success) {
                const errorStr = data.error || 'Unknown error';
                ccError('callAI() SERVER RETURNED ERROR: ' + errorStr);
                ccDiag('callAI() Full error response:', JSON.stringify(data).substring(0, 500));
                pushDebugLogEntry({
                    type: 'AJAX_SERVER_ERROR',
                    contentType,
                    retryCount,
                    serverError: errorStr,
                    fullResponse: JSON.stringify(data).substring(0, 2000)
                });
                const is429 = errorStr.includes('429') || errorStr.includes('RESOURCE_EXHAUSTED') || errorStr.includes('Resource exhausted');
                // v11.41 FIX: Added "generation failed" / "invalid structure" to transient patterns.
                // These errors fire when PASS 1 returns truncated JSON (token limit hit).
                // Retrying with backoff gives the server a chance to succeed on a subsequent attempt.
                const isTransient = /API error: (?:0|408|5\d\d)\b|timeout|timed out|connection|curl|ECONNRESET|ETIMEDOUT|503|502|500|generation failed|invalid structure|empty response/i.test(errorStr);
                // v10.23: curl/OpenAI timeouts are ~180s waits. After that we need a meaningful
                // pause (20s base, doubling) before hammering the server again  -  not 3s.
                const isTimeoutError = /curl 28|OPENAI_TIMEOUT|timed out after \d/i.test(errorStr);
                if (billedJobId) {
                    ccError('callAI() job ' + billedJobId + ' was already submitted and charged - refusing to re-submit (FIX-CC-RETRY-RESUBMITS-BILLED-JOB). Failing this section instead of paying twice.');
                    throw new Error(errorStr);
                }
                if ((is429 || isTransient) && retryCount < MAX_RETRIES) {
                    const delay = is429
                        ? Math.min(BASE_DELAY_MS * Math.pow(2, retryCount), MAX_DELAY_MS)
                        : isTimeoutError
                            ? Math.min(20000 * Math.pow(2, retryCount), MAX_DELAY_MS)
                            : Math.min(3000 * Math.pow(2, retryCount), MAX_DELAY_MS);
                    const jitter = Math.random() * 1000;
                    const totalDelay = delay + jitter;
                    ccDiag('callAI() ' + (is429 ? '429 rate limit' : isTimeoutError ? 'timeout error' : 'transient error') + ' - waiting ' + Math.round(totalDelay) + 'ms before retry ' + (retryCount + 1) + '/' + MAX_RETRIES);
                    await new Promise(resolve => setTimeout(resolve, totalDelay));
                    return callAI(prompt, cmid, contentType, retryCount + 1, route, language, billingKey);
                }
                throw new Error(errorStr);
            }

            ccDiag('callAI() SUCCESS | content length=' + (data.content?.length || 0) + ' chars');
            return data.content;
        } catch (error) {
            ccError('callAI() EXCEPTION: ' + error.message);
            const errorMsg = error.message || '';
            const is429 = errorMsg.includes('429') || errorMsg.includes('RESOURCE_EXHAUSTED') || errorMsg.includes('Resource exhausted');
            // v10.25: AbortError fires when our 175-second client deadline fires  -  treat it
            // as a timeout transient so it retries with the longer 20s base delay.
            // Belt-and-suspenders: also check error.name === 'TimeoutError' (AbortSignal.timeout()
            // in some browsers), and match 'aborted'/'abort' in the message itself as a fallback
            // in case error.name is not exactly 'AbortError' in non-standard environments.
            const isAbort = error.name === 'AbortError' || error.name === 'TimeoutError';
            // v11.41 FIX: Added "generation failed" / "invalid structure" / "empty response" to transient patterns (mirrors !data.success branch above).
            const isTransient = isAbort || /API error: (?:0|408|5\d\d)\b|timeout|timed out|aborted|abort|connection|curl|ECONNRESET|ETIMEDOUT|503|502|500|Failed to fetch|NetworkError|Load failed|generation failed|invalid structure|empty response/i.test(errorMsg);
            const isTimeoutError = isAbort || /curl 28|OPENAI_TIMEOUT|timed out after \d/i.test(errorMsg);
            // v10.25: Abort retries are capped at 3 (not MAX_RETRIES=5). Each abort waits
            // 175s for the server + 20-32s backoff; 5 retries = ~17 minutes of invisible
            // spinning. 3 retries = ~10 minutes max, still giving multiple recovery chances
            // without holding the user hostage indefinitely.
            const abortMaxRetries = 3;
            const effectiveMaxRetries = isAbort ? abortMaxRetries : MAX_RETRIES;
            if (billedJobId) {
                // Covers the OPENAI_TIMEOUT / poll-exhaustion throws out of pollJob(), which are
                // by definition post-submit: the job is running and paid for. Re-submitting here
                // was the single largest credit-burn path in the client.
                ccError('callAI() job ' + billedJobId + ' was already submitted and charged - refusing to re-submit (FIX-CC-RETRY-RESUBMITS-BILLED-JOB). Failing this section instead of paying twice.');
                throw error;
            }
            if ((is429 || isTransient) && retryCount < effectiveMaxRetries) {
                const delay = is429
                    ? Math.min(BASE_DELAY_MS * Math.pow(2, retryCount), MAX_DELAY_MS)
                    : isTimeoutError
                        ? Math.min(20000 * Math.pow(2, retryCount), MAX_DELAY_MS)
                        : Math.min(3000 * Math.pow(2, retryCount), MAX_DELAY_MS);
                const jitter = Math.random() * 1000;
                const totalDelay = delay + jitter;
                ccDiag('callAI() ' + (is429 ? '429 rate limit' : isTimeoutError ? 'timeout error' : 'transient error') + ' (catch) - waiting ' + Math.round(totalDelay) + 'ms before retry ' + (retryCount + 1) + '/' + effectiveMaxRetries);
                await new Promise(resolve => setTimeout(resolve, totalDelay));
                return callAI(prompt, cmid, contentType, retryCount + 1, route, language, billingKey);
            }
            ccError('callAI() FATAL - no more retries (' + retryCount + '/' + effectiveMaxRetries + '), throwing error: ' + error.message);
            pushDebugLogEntry({
                type: 'AJAX_EXCEPTION',
                contentType,
                retryCount,
                errorMessage: error.message,
                errorStack: error.stack
            });
            throw error;
        }
    };

    // ===================================================================
    // v7.4.7: AI Image Generation for Topics
    // Generates one image per PC/topic to display at top of slide
    // ===================================================================
    const generateTopicImage = async (section, context, cmid) => {
        ccDiag('generateTopicImage() START | section="' + (section?.title || 'NO TITLE') + '" | cmid=' + cmid);
        
        try {
            const requestData = {
                slideTitle: section.title,
                slideDescription: section.description || '',
                requirements: (section.keyPoints || section.requirements || []).slice(0, 3).join('. '),
                topicTitle: section.topicTitle || context?.unitTitle || section.title || '',
                route: section.route || context?.mode || 'vet',
                unitCode: context?.unitCode || '',
                unitTitle: context?.unitTitle || '',
                industry: context?.industry || '',
                subIndustry: context?.subIndustry || '',
                workplace: context?.workplace || '',
                jobRole: context?.jobRole || '',
                country: context?.country || 'Australia',
                state: context?.state || '',
                // v10.27: hook-scenario narrative context so the image depicts the actual job story
                scenarioContext: section.scenarioContext || '',
            };

            ccDiag('generateTopicImage() Request data:', JSON.stringify(requestData).substring(0, 300));

            const formData = new FormData();
            formData.append('action', 'generate_image');
            formData.append('cmid', cmid);
            formData.append('sesskey', M.cfg.sesskey);
            formData.append('data', JSON.stringify(requestData));

            const imgUrl = M.cfg.wwwroot + '/mod/contentcreator/ajax.php';
            const fetchStart = Date.now();
            // v13.93.3: image generation runs 100s+ against ajax.php's 180s ceiling and
            // had no client deadline at all, so a stalled image hung its section forever.
            const response = await CcState.fetchWithDeadline(imgUrl, {
                method: 'POST',
                body: formData
            }, 'Image generation', 210000);
            const fetchMs = Date.now() - fetchStart;

            ccDiag('generateTopicImage() HTTP response: status=' + response.status + ' | time=' + fetchMs + 'ms');

            if (!response.ok) {
                ccError('generateTopicImage() HTTP ERROR: status=' + response.status);
                pushDebugLogEntry({
                    type: 'IMAGE_HTTP_ERROR',
                    sectionTitle: section?.title,
                    httpStatus: response.status
                });
                return null;
            }

            const rawText = await response.text();
            ccDiag('generateTopicImage() Raw response length=' + rawText.length + ' | preview=' + rawText.substring(0, 200));

            let data;
            try {
                data = JSON.parse(rawText);
            } catch (jsonErr) {
                ccError('generateTopicImage() FAILED TO PARSE RESPONSE AS JSON:', jsonErr.message);
                ccError('generateTopicImage() Raw (first 500):', rawText.substring(0, 500));
                pushDebugLogEntry({
                    type: 'IMAGE_JSON_PARSE_FAIL',
                    sectionTitle: section?.title,
                    rawResponsePreview: rawText.substring(0, 1000),
                    parseError: jsonErr.message
                });
                return null;
            }

            if (data.success && data.images && data.images.length > 0) {
                ccDiag('generateTopicImage() SUCCESS | images=' + data.images.length + ' | url=' + (data.images[0].url || '').substring(0, 80));
                return {
                    url: data.images[0].url,
                    prompt: data.images[0].prompt || section.title,
                    generatedAt: new Date().toISOString()
                };
            } else {
                ccWarn('generateTopicImage() SERVER RETURNED success=' + data.success + ' | error=' + (data.error || 'none') + ' | images=' + (data.images?.length || 0));
                pushDebugLogEntry({
                    type: 'IMAGE_GEN_FAIL',
                    sectionTitle: section?.title,
                    serverSuccess: data.success,
                    serverError: data.error || null,
                    imagesCount: data.images?.length || 0,
                    fullResponse: JSON.stringify(data).substring(0, 1000)
                });
                return null;
            }
        } catch (error) {
            ccError('generateTopicImage() EXCEPTION:', error.message);
            pushDebugLogEntry({
                type: 'IMAGE_EXCEPTION',
                sectionTitle: section?.title,
                errorMessage: error.message,
                errorStack: error.stack
            });
            return null;
        }
    };

    // ===================================================================
    // v9.15: Get failed card sequence (placeholder cards when AI fails)
    // Route-aware: returns correct number of cards with correct cardTypes
    // MUST be defined before generateFiveCardSequence (no hoisting for const)
    // ===================================================================
    const getFailedCardSequence = (topic, mode, errorReason = 'AI generation failed', activitiesEnabledParam) => {
        ccError('getFailedCardSequence() RETURNING FAILURE CARDS | topic="' + (topic?.title || topic?.name || 'UNKNOWN') + '" | mode=' + mode + ' | reason=' + errorReason);
        pushDebugLogEntry({
            type: 'FAILED_CARD_SEQUENCE',
            topicTitle: topic?.title || topic?.name,
            mode,
            errorReason
        });
        const cardTypes = getExpectedCardOrder(mode, activitiesEnabledParam);
        const now = Date.now();

        return cardTypes.map((cardType, index) => ({
            cardType,
            id: `${topic.id || 'topic'}_card_${index + 1}`,
            topicId: topic.id,
            topicTitle: topic.title || topic.name,
            cardIndex: index,
            description: `AI generation failed for "${topic.title || topic.name}". Please use "Regenerate Failed" to retry.`,
            keyFacts: [],
            requirements: [],
            positiveList: [],
            negativeList: [],
            terminology: [],
            generated: false,
            failed: true,
            failedAt: now,
            failureReason: errorReason
        }));
    };

    // ===================================================================
    // v11.73: VALIDITY GATE  -  replaces the old dual scoring system.
    // ChatGPT analysis: the engineered prompt already guarantees quality.
    // The old scorer was double-marking the prompt's output, triggering unnecessary
    // retries and hard failures on content that was perfectly usable.
    // This validator only blocks genuinely broken content:
    //   wrong card count, missing required fields, empty content,
    //   broken decision-point structure, mental-model with <3 steps.
    // ===================================================================
    // ===================================================================
    // v13.85: MEASURED CONTENT QUALITY
    //
    // The only live gate is validateCards() below, which checks card count, cardType
    // presence, a title on three card types, decision-point options and mental-model
    // step count.
    //
    // v13.96 UPDATE: the dead scoring machinery this comment used to describe -
    // scoreQualityGate, scoreAuditDefensibility, enterprise_qa.js and
    // quality_scoring.js - has been DELETED. It had been exported, built and shipped
    // while called from nowhere since v11.73, and it had drifted: it described card
    // shapes that no longer existed (six legacy card types on routes that generate
    // seven unified ones) and scoring rules that failed good content (any card
    // mentioning "email" or "meeting" scored zero as "not office-safe"). Four of the
    // seven specifications for card 6 in this repo were unreachable, which is how the
    // three unified routes were able to drift apart without anyone noticing.
    //
    // That drift is why the 24 August proof run passed 190 of 190 cards while shipping
    // doubled words, US spellings, unexpanded acronyms, 43-word sentences,
    // 411-word screens and sentences duplicated across cards: nothing in the
    // shipping pipeline looked for any of them.
    //
    // v13.89 UPDATE: these checks are REPORT-ONLY. They no longer drive the repair
    // pass - that behaviour shipped in v13.85-13.87 and was withdrawn in v13.88/13.89.
    // They are measured, logged, and stamped on the card as `qualityIssues` /
    // `contentWords`. Nothing they find changes what is generated, so they cannot
    // make content worse. A readability score must never be able to send a section to
    // getFailedCardSequence() and replace real content with placeholders - that would
    // be a far worse outcome than prose that reads two grades high. A repair pass
    // still runs for genuine STRUCTURAL failure, exactly as it did in 13.83.
    // ===================================================================

    /** Fields that hold markup, identifiers or media rather than learner-facing prose. */
    // v13.96 FIX-CC-DEPTH-DOUBLECOUNT: the four names after attemptCount are the VENDOR
    // spellings that normalizeCardSchema() aliases and then deliberately RETAINS -
    // keyPoints -> sceneParts/conceptInsights, standardItems -> goodItems,
    // errorItems -> badItems, and items -> a copy of one of those. Both copies were
    // walked, so every card measured roughly twice its real length: a genuinely 75-word
    // card reported 150 and cleared a 140 floor. The telemetry added in v13.87 to detect
    // thin packs could not detect them, and contentWords stamped on every shipped card
    // has been inflated the same way. Excluding the vendor-name copies counts each
    // string exactly once. The floors below are recalibrated to match.
    const CC_NON_PROSE_KEYS = /^(voiceoverText|voiceover|audioUrl|imageUrl|imagePrompt|image|icon|id|cardType|type|contrastType|slideHtml|html|url|src|class|className|topicId|topicTitle|qualityAction|failureReason|correct|isCorrect|generatedAt|cardIndex|attemptCount)$/;

    /**
     * v13.96: the retained VENDOR-name copies, excluded so each string is counted once.
     *
     * normalizeCardSchema() aliases the vendor field names onto the internal ones and
     * then deliberately RETAINS both copies (the v13.86 deletes were reverted in v13.89
     * because dropping them was implicated in content loss). Walking both meant every
     * card measured roughly twice its real length.
     *
     * `items` is NOT in this list, because it is not always an alias: on the mistakes
     * card it is the canonical field that the renderer and the narrator both read, built
     * from errorItems. Excluding it flatly made the entire mistakes card measure zero.
     * It is handled per card type in ccDedupeKeysFor() below instead.
     */
    const CC_ALIAS_KEYS = /^(keyPoints|standardItems|errorItems)$/;

    /**
     * v13.96: the legalLink panel is assembled from heading + keyInfo + summaryLine that
     * are already counted on the card, so counting the panel too triple-counts card 2.
     */
    const CC_DERIVED_KEYS = /^(legalLink)$/;

    /**
     * v13.96: which duplicate keys to skip for a given card.
     *
     * @param {Object} card The card being measured.
     * @return {Function} Predicate: true when the key is a duplicate and must be skipped.
     */
    const ccDedupeKeysFor = function (card) {
        // competency-summary is the one card where `items` is a copy of standardItems
        // (see normalizeCardSchema). Everywhere else - mistakes above all - it is the
        // only copy of the content and must be counted.
        const itemsIsAlias = !!(card && card.cardType === 'competency-summary');
        return function (key) {
            if (CC_NON_PROSE_KEYS.test(key)) { return true; }
            if (CC_ALIAS_KEYS.test(key)) { return true; }
            if (CC_DERIVED_KEYS.test(key)) { return true; }
            if (itemsIsAlias && key === 'items') { return true; }
            return false;
        };
    };

    /**
     * Collect every learner-facing string on a card into one block of prose.
     *
     * @param {Object|Array|String} node Card, or any node within it.
     * @param {Number} depth Recursion guard.
     * @return {String} Space-joined prose.
     */
    const harvestCardText = function (node, depth, skipKey) {
        depth = depth || 0;
        if (depth > 6 || node === null || node === undefined) { return ''; }
        if (typeof node === 'string') { return node; }
        // v13.96: the skip predicate is decided once, from the CARD, and carried down.
        if (depth === 0) { skipKey = ccDedupeKeysFor(node); }
        if (!skipKey) { skipKey = function (k) { return CC_NON_PROSE_KEYS.test(k); }; }
        if (Array.isArray(node)) {
            return node.map(function (item) { return harvestCardText(item, depth + 1, skipKey); })
                .filter(Boolean).join(' ');
        }
        if (typeof node !== 'object') { return ''; }
        return Object.keys(node).map(function (key) {
            if (skipKey(key)) { return ''; }
            return harvestCardText(node[key], depth + 1, skipKey);
        }).filter(Boolean).join(' ');
    };

    /**
     * Approximate syllable count for an English word.
     *
     * Vowel-group heuristic with the usual silent-e and -le corrections. It is not
     * exact, and does not need to be: Flesch-Kincaid is only ever used here as a
     * relative signal with a wide tolerance band.
     *
     * @param {String} word A single word.
     * @return {Number} Syllable count, minimum 1.
     */
    const countSyllables = function (word) {
        var w = String(word).toLowerCase().replace(/[^a-z]/g, '');
        if (!w) { return 0; }
        if (w.length <= 3) { return 1; }
        w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
        w = w.replace(/^y/, '');
        var groups = w.match(/[aeiouy]{1,2}/g);
        return groups ? groups.length : 1;
    };

    /**
     * Split prose into sentences.
     *
     * @param {String} text Prose.
     * @return {Array} Trimmed, non-empty sentences.
     */
    const splitSentences = function (text) {
        return String(text || '')
            .split(/(?<=[.!?])\s+/)
            .map(function (sentence) { return sentence.trim(); })
            .filter(Boolean);
    };

    /** Reading-grade ceiling and sentence-length ceiling per route. */
    const CC_READABILITY_TARGET = {
        vet: { grade: 9, sentence: 18 },
        workplace: { grade: 9, sentence: 18 },
        pd: { grade: 11, sentence: 20 },
        university: { grade: 14, sentence: 22 },
        // v13.92: general-audience explanatory prose, sentences capped at 22 by prompt.
        topicstext: { grade: 10, sentence: 22 }
    };

    /**
     * Measure reading grade and sentence length on every card.
     *
     * @param {Array} cards Normalised cards.
     * @param {String} mode Route mode.
     * @return {Array} Human-readable issue strings for the repair prompt.
     */
    const readabilityIssues = function (cards, mode) {
        var target = CC_READABILITY_TARGET[mode] || CC_READABILITY_TARGET.pd;
        var issues = [];
        cards.forEach(function (card, i) {
            var text = harvestCardText(card, 0);
            var sentences = splitSentences(text);
            if (!sentences.length) { return; }
            var words = sentences.join(' ').split(/\s+/).filter(Boolean);
            var label = 'Card ' + (i + 1) + ' (' + (card.cardType || 'unknown') + ')';

            // The grade formula needs enough text to be meaningful; a single clause
            // would skew it. Sentence length below is checked at any card size,
            // because one 43-word sentence is a defect however short the card.
            if (words.length >= 25) {
                var syllables = words.reduce(function (sum, w) { return sum + countSyllables(w); }, 0);
                var grade = (0.39 * (words.length / sentences.length))
                    + (11.8 * (syllables / words.length)) - 15.59;
                // 1.5 grades of tolerance: repair the real outliers, not every card.
                if (grade > target.grade + 1.5) {
                    issues.push(label + ': reads at grade ' + grade.toFixed(1) + ', target is ' +
                        target.grade + '. Rewrite in shorter sentences and plainer words. Do not cut content.');
                }
            }

            var longest = '';
            var longestWords = 0;
            sentences.forEach(function (sentence) {
                var n = sentence.split(/\s+/).filter(Boolean).length;
                if (n > longestWords) { longestWords = n; longest = sentence; }
            });
            if (longestWords > target.sentence) {
                issues.push(label + ': longest sentence is ' + longestWords + ' words, limit is ' +
                    target.sentence + '. Split it into two. Sentence: "' + longest.slice(0, 90) + '"');
            }

            if (words.length > 320) {
                issues.push(label + ': ' + words.length + ' words on one screen, limit is 320. ' +
                    'Tighten the wording; do not delete a whole field.');
            }
        });
        return issues;
    };

    /** Minimum and target visible words per card, by route. */
    // v13.96: recalibrated against the de-duplicated count above. The old floors were set
    // when the measurement was running roughly 2x, so 140 was really asking for ~70 real
    // words - a third of what the prompt specifies. These are set just under the bottom of
    // each route's summed field ranges, so a card that hits its per-field minima passes and
    // only a genuinely short card trips.
    const CC_DEPTH_TARGET = {
        // v13.96: floors sit just below the THINNEST compliant card on each route, so a
        // pack written to the per-field minima passes and only genuinely short content
        // trips. The binding card is mental-model: 4 steps x (3-6 + 35-45 words) counts
        // about 152, which is why 165 was wrong. Re-derive these if the field ranges move.
        vet: { floor: 145, band: '180-300' },
        workplace: { floor: 145, band: '180-300' },
        pd: { floor: 145, band: '180-300' },
        university: { floor: 150, band: '170-260' },
        // v13.92: Topics-and-Text is deliberately the SHORT route. Two paragraphs of
        // 55-70 words is 110-140 visible words a card, so the floor sits below that
        // band rather than above it. Raising this without also raising the prompt's
        // word limits would make every card fail depth and drive a pointless repair.
        topicstext: { floor: 85, band: '110-150' }
    };

    /**
     * v13.87: measure how much learner-facing content each card actually carries.
     *
     * This is the check the pipeline has never had, and it is the one that matters
     * most to the people using this plugin: the recurring complaint is that packs
     * come out THIN, and until now nothing measured that. Every "N+ words" floor in
     * the prompt was a voiceoverText floor - a field the player does not read on the
     * VET, Workplace or PD routes - so no learner-facing field had a floor at all,
     * and validateCards() had no minimum-length check of any kind.
     *
     * Worse, the readability work added in v13.85 pushes the other way: a 320-word
     * ceiling, an 18-word sentence cap and a plain-words rule all reward brevity.
     * Without a floor underneath them, "readable" and "thin" are the same direction.
     * This is the counterweight.
     *
     * Reported as a soft issue, so a thin card drives one repair pass and is never
     * the reason a section falls back to placeholder cards.
     *
     * @param {Array} cards Normalised cards.
     * @param {String} mode Route mode.
     * @return {Array} Human-readable issue strings for the repair prompt.
     */
    const depthIssues = function (cards, mode) {
        const target = CC_DEPTH_TARGET[mode] || CC_DEPTH_TARGET.pd;
        const thin = [];
        let packWords = 0;
        let scored = 0;

        cards.forEach(function (card, i) {
            // decision-point is a question with four options - it is meant to be
            // short, and holding it to a prose floor would push the model to pad the
            // one card where padding actively hurts.
            if (card.cardType === 'decision-point') { return; }

            const words = harvestCardText(card, 0).split(/\s+/).filter(Boolean).length;
            packWords += words;
            scored++;
            if (words < target.floor) {
                thin.push({ n: i + 1, type: card.cardType || 'unknown', words: words });
            }
        });

        if (!scored) { return []; }

        const issues = [];
        // How to expand, said once. Repeating it per card would eat the repair
        // prompt's five-issue budget with the same sentence over and over.
        const how = ' EXPAND by adding NEW short sentences carrying specifics - a named piece ' +
            'of equipment, a time of day, a form or system, a consequence with a number or a ' +
            'timeframe. Never pad with adjectives, restate what is already there, or lengthen ' +
            'existing sentences.';

        // A pack can clear every card floor and still be thin overall, which is
        // exactly what "it used to be better" looks like once measured. Report the
        // section verdict FIRST so it survives the top-five slice.
        const mean = Math.round(packWords / scored);
        const bandFloor = parseInt(target.band.split('-')[0], 10);
        if (mean < bandFloor) {
            issues.push('THE WHOLE SECTION IS TOO THIN: it averages ' + mean + ' words of visible ' +
                'content per card, against a working band of ' + target.band + '. Deepen every card ' +
                'below the band, shortest first.' + how);
        }

        if (thin.length > 2) {
            // Collapse to one instruction naming every offender, so the repair pass
            // sees all of them rather than the first five.
            issues.push(thin.length + ' cards are below the ' + target.floor + '-word floor and MUST ' +
                'be expanded: ' + thin.map(function (t) {
                    return 'card ' + t.n + ' (' + t.type + ', ' + t.words + ' words)';
                }).join(', ') + '. Target ' + target.band + ' words each.' + how);
        } else {
            thin.forEach(function (t) {
                issues.push('Card ' + t.n + ' (' + t.type + '): only ' + t.words + ' words of visible ' +
                    'content, the floor is ' + target.floor + ' and the working band is ' +
                    target.band + '.' + how);
            });
        }

        return issues;
    };

    /**
     * Find sentences repeated verbatim across two cards in the same section.
     *
     * @param {Array} cards Normalised cards.
     * @return {Array} Human-readable issue strings.
     */
    const duplicateSentenceIssues = function (cards) {
        var seen = {};
        var issues = [];
        cards.forEach(function (card, i) {
            splitSentences(harvestCardText(card, 0)).forEach(function (sentence) {
                var norm = sentence.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
                // Short lines are headings and boilerplate, not duplicated prose.
                if (norm.split(' ').length < 8) { return; }
                if (Object.prototype.hasOwnProperty.call(seen, norm)) {
                    if (seen[norm] !== i) {
                        issues.push('Card ' + (i + 1) + ' (' + (card.cardType || 'unknown') +
                            '): repeats a sentence already used on card ' + (seen[norm] + 1) +
                            '. Rewrite it with new wording: "' + sentence.slice(0, 90) + '"');
                    }
                } else {
                    seen[norm] = i;
                }
            });
        });
        return issues;
    };

    /**
     * v13.88: a repair pass must never return LESS content than it was given.
     *
     * Found by the 24 Aug v13.87 proof run. The depth gate added in v13.87 fires on
     * almost every section, so the repair pass - which before v13.85 fired only on a
     * structural failure, i.e. almost never - now runs on 100% of sections. That
     * turned a rare, latent fault into a total one: the repaired cards came back with
     * their content arrays missing (keyPoints null, sceneParts/conceptInsights/items
     * absent), and the pack dropped from the 10,166 learner-facing words of the
     * baseline to 6,162, with 41 of 48 cards under the floor.
     *
     * Two earlier changes removed the accidental protection that had been masking it:
     * v13.86 made the field mapping destructive (delete card.keyPoints once mapped),
     * so there was no second copy to fall back on, and the repair prompts were
     * switched to the internal field names.
     *
     * The durable fix is not to guess which field name a repair will answer in. It is
     * to treat a repair as a set of PROPOSED EDITS rather than a replacement: take the
     * repaired value only where it actually carries content, and otherwise keep what
     * was already there. A repair can then improve a card, and can never empty one.
     *
     * @param {Array} previous Cards as they stood before the repair attempt.
     * @param {Array} repaired Cards returned by the repair pass.
     * @return {Array} Repaired cards with any lost content restored.
     */
    const mergePreservingContent = function (previous, repaired) {
        if (!Array.isArray(previous) || !Array.isArray(repaired)) { return repaired; }
        if (previous.length !== repaired.length) {
            // Card count changed: the repair is not a card-for-card edit, so there is
            // no safe way to merge. Keep whichever set actually carries content.
            ccWarn('[REPAIR GUARD] card count changed ' + previous.length + ' -> ' + repaired.length);
            return repaired;
        }

        const hasContent = function (v) {
            if (v === null || v === undefined) { return false; }
            if (typeof v === 'string') { return v.trim().length > 0; }
            if (Array.isArray(v)) { return v.length > 0; }
            if (typeof v === 'object') { return Object.keys(v).length > 0; }
            return true;
        };

        let restored = 0;
        const merged = repaired.map(function (next, i) {
            const prev = previous[i] || {};
            const out = {};
            // Start from every key either side knows about.
            const keys = {};
            Object.keys(prev).forEach(function (k) { keys[k] = true; });
            Object.keys(next || {}).forEach(function (k) { keys[k] = true; });

            Object.keys(keys).forEach(function (k) {
                const nv = next ? next[k] : undefined;
                const pv = prev[k];
                if (hasContent(nv)) { out[k] = nv; return; }
                if (hasContent(pv)) {
                    out[k] = pv;
                    restored++;
                    return;
                }
                // Neither side has content: keep whatever the repair said, so the
                // card's field skeleton is unchanged.
                out[k] = (nv !== undefined) ? nv : pv;
            });
            return out;
        });

        if (restored > 0) {
            ccWarn('[REPAIR GUARD] restored ' + restored + ' field(s) the repair pass had emptied');
        }
        return merged;
    };

    const validateCards = (cards, context) => {
        var issues = [];
        if (!Array.isArray(cards) || cards.length === 0) {
            return { valid: false, issues: ['No cards returned from AI'] };
        }
        // Card count
        // FIX-CC-ROUTE-CARDCOUNT (v13.65): the previous rule was
        //   (context.mode === 'vet') ? 7 : 6
        // but prompts.js instructs the model to return SEVEN cards for vet, workplace
        // AND pd — WORKPLACE_SYSTEM_PROMPT and PD_SYSTEM_PROMPT both end with
        // "exactly 7 cards. If fewer or more than 7 cards are returned, the output is
        // invalid." Only UNIVERSITY_SYSTEM_PROMPT asks for 6. So on the Workplace and PD
        // routes the model returned exactly what it was told to and the validator
        // rejected it with "Expected 6 cards, got 7" — on attempt 1 AND on the attempt-2
        // repair pass — so generateFiveCardSequence() always fell through to
        // getFailedCardSequence(). That is a 100% failure rate on those two routes:
        // every section rendered placeholder cards while burning full generation credits.
        //
        // prompts.js already exports getCardCountForMode() (university => 6, else => 7),
        // which is the single source of truth the prompt builders themselves use. Deferring
        // to it means the validator can never drift out of step with the prompt again.
        var genMode = (context && context.mode) || 'vet';
        var expectedCount = (Prompts && typeof Prompts.getCardCountForMode === 'function')
            ? Prompts.getCardCountForMode(genMode)
            : ((genMode === 'university') ? 6 : 7);
        // v13.90.1 FIX-ACTIVITIES-OFF: this used to hard-require expectedCount - 1 when
        // activities were disabled, which made the whole feature unusable.
        //
        // Nothing tells the MODEL about activitiesEnabled - prompts.js does not reference
        // it anywhere, and all three unified system prompts still say "exactly 7 cards.
        // If fewer or more than 7 cards are returned, the output is invalid". So the AI
        // correctly returned 7, the validator demanded 6, every section failed structural
        // validation on both attempts, and the author got a pack of "AI generation failed"
        // placeholders after paying for two AI calls per section.
        //
        // The decision-point card is dropped at render time from getExpectedCardOrder(),
        // so an extra card in the payload is harmless. Accept either count and let the
        // renderer do the dropping.
        // v13.92: topicstext DOES have a decision-point now (it drives the 3-activity
        // block), so the toggle applies to it as it does to vet/workplace/pd. Only
        // university is exempt.
        var activitiesOff = (genMode !== 'university'
            && context && context.activitiesEnabled === false);
        if (cards.length !== expectedCount && !(activitiesOff && cards.length === expectedCount - 1)) {
            issues.push('Expected ' + expectedCount + ' cards, got ' + cards.length);
        }
        // FIX-CC-TITLE-GATE (v13.73): the validator demanded a top-level `title` on EVERY
        // card, but the prompt builders in prompts.js only ask the model for one on a
        // minority of card types. Reading the four card specs:
        //
        //   VET / WORKPLACE / PD  ->  only card 6, competency-summary, is asked for title(...)
        //   UNIVERSITY            ->  only cards 5 and 6, case-study-1 and case-study-2
        //
        // On every other card type `title` is specified as a field of a NESTED object
        // (sceneParts[]{title,...}, conceptInsights[]{title,...}), never on the card itself,
        // so the model correctly returned no top-level title and the validator flagged
        // "missing title" on 6 of 7 cards. Six issues on attempt 1 and again on the repair
        // pass meant the validity gate could never pass, generateFiveCardSequence() always
        // fell through to getFailedCardSequence(), and every section rendered placeholder
        // cards reading "AI generation failed for ..." while consuming full generation
        // credits. That is a 100% failure rate on all four routes.
        //
        // This is the same class of drift as FIX-CC-ROUTE-CARDCOUNT (v13.65, expected card
        // count) and v11.79 (voiceover field name): the validator asserting something the
        // prompt never asked for. The requirement is now scoped to exactly the card types
        // the prompt requests a title for, and `heading` is accepted as an equivalent since
        // several card builders populate that instead.
        var TITLED_CARD_TYPES = ['competency-summary', 'case-study-1', 'case-study-2'];

        // Per-card structure
        cards.forEach(function (card, i) {
            var prefix = 'Card ' + (i + 1) + ' (' + (card.cardType || 'unknown') + ')';
            if (!card.cardType) { issues.push(prefix + ': missing cardType'); }
            if (TITLED_CARD_TYPES.indexOf(card.cardType) !== -1 && !card.title && !card.heading) {
                issues.push(prefix + ': missing title');
            }
            // decision-point specific
            if (card.cardType === 'decision-point') {
                if (!card.question) { issues.push(prefix + ': missing question'); }
                if (!card.options || card.options.length < 2) { issues.push(prefix + ': must have at least 2 options'); }
            }
            // v13.92: Topics-and-Text prose cards. Two paragraphs is the spec; one is
            // acceptable output, none is a broken card and worth a repair pass.
            if (CC_PROSE_TYPES.indexOf(card.cardType) !== -1) {
                if (!Array.isArray(card.paragraphs) || !card.paragraphs.length) {
                    issues.push(prefix + ': missing paragraphs');
                }
            }
            // mental-model specific
            if (card.cardType === 'mental-model') {
                if (!card.steps || card.steps.length < 3) { issues.push(prefix + ': requires at least 3 steps'); }
            }
            // voiceover present and not trivially short
            // v11.79 FIX: card.voiceoverText is the canonical field (normalizeCardSchema maps
            // card.voiceover  ->  card.voiceoverText and deletes card.voiceover at line ~1019).
            // Checking card.voiceover here always returned undefined, causing every generated
            // card to fail the voiceover check  -  forcing an unnecessary repair pass on every
            // single generation since v11.73 introduced this gate.
            // FIX-CC-DP-VOICEOVER-EXEMPT (v13.53): decision-point cards intentionally have NO
            // voiceoverText — the system prompt says "NO voiceoverText" and buildVoiceoverText()
            // clears it to '' anyway. Checking voiceover on decision-point always failed, which
            // triggered the repair prompt. The repair AI then tried to add a voiceover AND often
            // dropped question/options, causing attempt 2 to fail with all three issues.
            // FIX-CC-VO-STRUCTURAL (v13.65): normaliseAllVoiceovers() DELIBERATELY leaves
            // voiceoverText empty for every _7CARD_TYPES_SET card — player5.js
            // buildFullVoiceoverText() builds the narration script from the structural
            // display fields (sceneParts / conceptInsights / steps / items / goodItems).
            // Demanding a 30-char voiceoverText on those cards contradicted that design and
            // sent perfectly good cards into the repair pass, where the repair model
            // frequently dropped other required fields. A structural card is now valid if it
            // carries renderable content, whether or not voiceoverText is populated.
            if (card.cardType !== 'decision-point') {
                var vo = card.voiceoverText || card.voiceover || '';
                var hasStructuralContent = !!(
                    (card.sceneParts && card.sceneParts.length) ||
                    (card.conceptInsights && card.conceptInsights.length) ||
                    (card.steps && card.steps.length) ||
                    (card.items && card.items.length) ||
                    (card.goodItems && card.goodItems.length) ||
                    (card.badItems && card.badItems.length) ||
                    (card.frameworks && card.frameworks.length) ||
                    (card.considerations && card.considerations.length) ||
                    (card.analysisPrompts && card.analysisPrompts.length) ||
                    (card.cognitiveConsiderations && card.cognitiveConsiderations.length) ||
                    (card.keyTerms && card.keyTerms.length) ||
                    // v13.92: Topics-and-Text carries its content in paragraphs[].
                    (card.paragraphs && card.paragraphs.length) ||
                    card.content || card.bodyText || card.context || card.conceptDefinition
                );
                if ((!vo || String(vo).length < 30) && !hasStructuralContent) {
                    issues.push(prefix + ': missing or too-short voiceover');
                }
            }
        });
        // v13.85: soft issues do not invalidate the section. They are fed to the
        // repair pass on the first attempt and recorded on the card on the last.
        var softissues = [];
        try {
            var mode = (context && context.mode) || 'vet';
            softissues = depthIssues(cards, mode)
                .concat(readabilityIssues(cards, mode))
                .concat(duplicateSentenceIssues(cards));
        } catch (e) {
            // A measurement fault must never block a generation.
            ccWarn('[QUALITY] measurement failed: ' + e.message);
        }

        return { valid: issues.length === 0, issues: issues, softIssues: softissues };
    };

    // ===================================================================
    // v7.9.65: Generate 5-Card Sequence via AI
    // v11.73: Replaced dual scoring gate (scoreQualityGate + scoreAuditDefensibility
    //         + EnterpriseQA) with validateCards() structural validity check.
    //         ChatGPT analysis: prompt already enforces quality; gate was retrying
    //         good content and causing hard failures. Now: generate once, validate
    //         structure, repair only if broken. Near-zero validation overhead.
    // Card counts: VET = 7, workplace/university/pd = 6.
    // Function name kept to avoid breaking call sites.
    // ===================================================================
    const generateFiveCardSequence = async (topic, context, cmid) => {
        ccLog('%c[CC v' + CC_VERSION + '] =======================================================', 'color: #8b5cf6; font-weight: bold;');
        ccLog('%c[CC v' + CC_VERSION + '] generateFiveCardSequence STARTING (v12.24  -  VALIDITY GATE: Generate  ->  Structural Check  ->  Repair if broken)', 'color: #8b5cf6; font-weight: bold;');
        ccLog('%c[CC v' + CC_VERSION + '] Topic:', 'color: #8b5cf6;', topic?.title || 'NO TITLE');
        ccLog('%c[CC v' + CC_VERSION + '] Context:', 'color: #8b5cf6;', JSON.stringify(context || {}, null, 2).substring(0, 500));
        ccLog('%c[CC v' + CC_VERSION + '] CMID:', 'color: #8b5cf6;', cmid);
        
        // v11.73: Simplified  -  scoring constants removed. Only structural validity matters.
        const MAX_ATTEMPTS = 2; // Attempt 1: generate. Attempt 2: structural repair only if broken.
        let attemptCount = 0;
        let lastScore = null; // holds { cards } for repair prompt
        let lastIssues = []; // structural issues fed to repair prompt
        const topicTitle = topic?.title || topic?.name || '';
        
        // v11.68: Attempt labels for debugging (2-attempt system)
        const attemptLabel = (n) => {
            if (n === 1) return 'INITIAL GENERATION';
            if (n === 2) return 'TARGETED REPAIR';
            return `ATTEMPT ${n}`;
        };
        
        while (attemptCount < MAX_ATTEMPTS) {
            attemptCount++;
            ccLog('%c[QUALITY GATE] ============================================', 'color: #f59e0b; font-weight: bold;');
            ccLog('%c[QUALITY GATE] ' + attemptLabel(attemptCount) + ' (' + attemptCount + '/' + MAX_ATTEMPTS + ') for: ' + topicTitle, 
                'background: #8b5cf6; color: white; font-weight: bold; padding: 4px 12px; border-radius: 6px;');
            
            try {
                let prompt;
                let contentType;
                
                // v9.12 FIX: currentMode must be accessible on ALL attempts (not just attempt 1)
                // Previously scoped inside if(attemptCount===1) causing ReferenceError on attempts 2/3
                // when quality gate passed and Enterprise QA tried to access it
                const currentMode = context?.mode || 'vet';
                
                const hasScoreData = lastScore && lastScore.cards && lastScore.cards.length > 0;

                if (attemptCount === 1 || !hasScoreData) {
                    // v11.68: Cache system prompt to skip rebuilding legislation/spelling/language on retries.
                    // v11.69 Fix 3 (ChatGPT): Keyed by mode+country+language to prevent cross-topic
                    // contamination in batch runs where context is reused across topics.
                    // v12.71 FIX-CC-REPAIR-LANG: use context.language first (set by ManifestBuilder to the
                    // target content language) rather than context.voiceLanguage (teacher's primary TTS
                    // voice, carried over via Object.assign). If voiceLanguage resolved first the cache key
                    // would always be 'en-AU' for additional-language batches, causing the English system
                    // prompt to be reused for Spanish/French/etc. generation.
                    const cacheKey = (currentMode || 'vet') + '_' + (context?.country || context?.countryCode || 'AU') + '_' + (context?.language || context?.voiceLanguage || 'en-AU');
                    if (!context._promptCache) context._promptCache = {};
                    let systemPrompt;
                    if (context._promptCache[cacheKey]) {
                        systemPrompt = context._promptCache[cacheKey];
                        ccLog('%c[PROMPT] Reusing cached system prompt (key: ' + cacheKey + ', ' + systemPrompt.length + ' chars)', 'color: #3b82f6;');
                    } else {
                        ccLog('%c[PROMPT] Building FIVE_CARD_SYSTEM_PROMPT for mode: ' + currentMode, 'color: #3b82f6;');
                        // v13.13 FIX-CC-MULTILANG-CONFLICT: Determine language block first.
                        // Previously: base prompt → legislation → spelling (Australian English) → language.
                        // The spelling block "MANDATORY: Australian English — non-negotiable" directly
                        // contradicts "Generate ALL content in German" and the AI resolves the tie in
                        // favour of English every time.
                        // Fix: (1) prepend the lang block BEFORE the base VET prompt so it has highest
                        // precedence, (2) skip the spelling injection entirely for non-English content
                        // since it is both irrelevant and contradictory, (3) append lang block again at
                        // the very end for belt-and-suspenders coverage.
                        const langBlockLang = context?.language || context?.voiceLanguage || 'en-AU';
                        const langBlock = Prompts.getLanguageInstructions(langBlockLang);
                        const isNonEnglish = !!langBlock;
                        systemPrompt = (isNonEnglish ? langBlock + '\n' : '') + Prompts.getFiveCardSystemPromptForMode(currentMode);
                        // v10.97: Inject country-specific legislation rules and spelling instructions
                        const countryCode = context?.country || context?.countryCode || 'AU';
                        // Legislation stays off the University route: an academic pack is not
                        // written against a jurisdiction's WHS instruments.
                        // v13.91: and off Topics-and-Text, which is a general explanatory
                        // article about any subject on earth - a WHS legislation block would
                        // be actively wrong on an article about Renaissance painting.
                        if (currentMode !== 'university' && currentMode !== 'topicstext') {
                            const stateCode = context?.state || '';
                            const legislationBlock = Prompts.Legislation.buildPromptInjection(countryCode, stateCode, 'content');
                            if (legislationBlock) {
                                systemPrompt += '\n' + legislationBlock;
                            }
                        }
                        // v13.85: spelling now applies to EVERY route. It used to sit inside
                        // the block above, so University was the only route generated with no
                        // spelling instruction at all - which is why the 24 Aug run shipped
                        // nine US spellings in the University pack alone.
                        // v13.13: Skip spelling for non-English - "MANDATORY Australian English
                        // spelling, non-negotiable" directly conflicts with "write in German/Spanish/etc."
                        if (!isNonEnglish) {
                            const spellingBlock = Prompts.getSpellingInstructions(countryCode);
                            if (spellingBlock) {
                                systemPrompt += '\n' + spellingBlock;
                            }
                        }
                        // v13.13: Append lang block again at end for belt-and-suspenders
                        // (already prepended above; both positions reinforce the requirement).
                        if (isNonEnglish) {
                            systemPrompt += '\n' + langBlock;
                        }
                        // Cache under key  -  safe across topics/modes/countries in same batch
                        context._promptCache[cacheKey] = systemPrompt;
                    }
                    // v13.94.3: the "belt-and-suspenders" language gate that used to be
                    // prepended here was emitting the 5-line LANGUAGE OVERRIDE block
                    // TWICE, back to back, at the top of every non-English user prompt -
                    // all five route builders in prompts.js already start with
                    // getLangPrefixForUserPrompt(context) as their first token. Removed;
                    // if a future refactor drops the internal prefix, restore it there
                    // rather than duplicating it here.
                    prompt = {
                        system: systemPrompt,
                        user: Prompts.buildFiveCardUserPrompt(context, topic)
                    };
                    contentType = attemptCount === 1 ? 'five-card-sequence' : 'five-card-retry';
                } else {
                    // ATTEMPT 2: v11.68 - Single targeted repair path (ChatGPT: no branching between audit/hard-reset/micro-fix)
                    // Always use content repair with top 5 issues  -  focused repair beats noisy repair.
                    const repairMode = context?.mode || 'vet';
                    const topIssues = lastIssues.slice(0, 5);
                    ccLog('%c[REPAIR] TARGETED REPAIR with top ' + topIssues.length + '/' + lastIssues.length + ' issues (mode: ' + repairMode + '):', 'color: #ef4444; font-weight: bold;');
                    ccLog('%c[REPAIR] Top issues:', 'color: #ef4444;', topIssues);
                    prompt = {
                        system: Prompts.getContentRepairPromptForMode(repairMode, context),
                        user: Prompts.buildContentRepairPromptForMode(lastScore?.cards || [], topIssues, topicTitle, context)
                    };
                    contentType = 'five-card-targeted-repair';
                }
                
                ccLog('%c[PROMPT] System prompt length:', 'color: #3b82f6;', prompt.system?.length || 0, 'chars');
                ccLog('%c[PROMPT] User prompt length:', 'color: #3b82f6;', prompt.user?.length || 0, 'chars');
                
                ccLog('%c[API] Calling AI...', 'color: #10b981; font-weight: bold;');
                const startTime = Date.now();
                const rawResponse = await callAI(prompt, cmid, contentType, 0, context?.mode || 'vet', context?.language || 'en-AU', topic?.billingKey || ''); // v11.42: pass route | v12.99 FIX-CC-LANG-EXPLICIT: pass language
                const elapsed = Date.now() - startTime;
                ccLog('%c[API] Response received in ' + elapsed + 'ms', 'color: #10b981;');
                ccLog('%c[API] Raw response length:', 'color: #10b981;', rawResponse?.length || 0, 'chars');
                
                ccLog('%c[PARSE] Parsing JSON response...', 'color: #6366f1;');
                const parsed = parseJsonResponse(rawResponse);
                ccLog('%c[PARSE] Parsed result:', 'color: #6366f1;', Array.isArray(parsed) ? 'Array of ' + parsed.length + ' items' : typeof parsed);
                
                if (!parsed || !Array.isArray(parsed)) {
                    ccLog('%c[PARSE] x FAILED - Invalid JSON response', 'color: #ef4444; font-weight: bold;');
                    // v7.9.65: Capture failed parse for debugging
                    pushDebugLogEntry({
                        type: 'PARSE_FAIL',
                        attemptCount,
                        attemptLabel: attemptLabel(attemptCount),
                        topicTitle,
                        rawResponseLength: rawResponse?.length || 0,
                        rawResponsePreview: (rawResponse || '').substring(0, 2000),
                        issues: lastIssues
                    });
                    if (attemptCount >= MAX_ATTEMPTS) {
                        ccLog('%c[PARSE] All attempts exhausted - returning failed sequence', 'color: #ef4444;');
                        return getFailedCardSequence(topic, currentMode, 'Invalid JSON response after ' + MAX_ATTEMPTS + ' attempts');
                    }
                    continue;
                }
                
                // v8.4.32: Normalize card schema BEFORE any processing
                const normalized = normalizeCardSchema(parsed, currentMode);
                
                // Log each parsed card
                ccLog('%c[PARSE] OK Successfully parsed ' + normalized.length + ' cards:', 'color: #22c55e; font-weight: bold;');
                normalized.forEach((card, i) => {
                    ccLog('%c[CARD ' + (i+1) + '] Type: ' + card.cardType + ', Description: ' + (card.description || '').substring(0, 80) + '...', 'color: #6366f1;');
                });
                
                // ===============================================================
                // v7.9.65: APPLY ALL LOCAL FIXES BEFORE SCORING (ChatGPT Approved)
                // Score the FIXED version, not raw AI output!
                // ===============================================================
                ccLog('%c[LOCAL FIX] Applying local fixes BEFORE scoring...', 'color: #a855f7; font-weight: bold;');
                const localFixed = localFixFiveCards(normalized, context, topicTitle);
                let fixedCards = Prompts.normalizeCards(localFixed, context);

                // v13.88: on a REPAIR attempt, never accept a card that came back with
                // less content than it went in with. See mergePreservingContent().
                if (attemptCount > 1 && lastScore && Array.isArray(lastScore.cards)) {
                    fixedCards = mergePreservingContent(lastScore.cards, fixedCards);
                }
                ccLog('%c[LOCAL FIX] OK Local fixes + normalizeCards applied (banned phrases, verb ladder, voiceover, markdown, slang, field objects)', 'color: #a855f7;');
                
                // ===============================================================
                // v11.73: VALIDITY GATE (replaces dual scoring system)
                // Only checks structure  -  prompt already guarantees quality.
                // ===============================================================
                ccLog('%c[VALIDITY GATE] ============================================', 'color: #10b981; font-weight: bold;');
                const validation = validateCards(fixedCards, context);
                ccLog('%c[VALIDITY GATE] ' + (validation.valid ? 'OK PASSED  -  structure valid' : 'x FAILED  -  ' + validation.issues.length + ' issue(s)'),
                    'background: ' + (validation.valid ? '#22c55e' : '#ef4444') + '; color: white; font-weight: bold; padding: 4px 12px; border-radius: 6px;');

                const softIssues = validation.softIssues || [];
                if (softIssues.length) {
                    ccLog('%c[QUALITY] ' + softIssues.length + ' measured issue(s) on attempt ' + attemptCount + ':',
                        'color: #f59e0b; font-weight: bold;');
                    softIssues.forEach(function (issue, i) { ccLog('%c  ' + (i + 1) + '. ' + issue, 'color: #f59e0b;'); });
                }

                // v13.89: the measured quality checks are REPORT-ONLY.
                //
                // v13.85-13.87 used them to trigger a repair pass. The 24 Aug proof run
                // showed why that was wrong: the depth gate fired on essentially every
                // section, and the repair pass it triggered returned cards with their
                // content arrays missing, taking a VET pack from 10,166 learner-facing
                // words down to 6,162. That loss is measured and real.
                //
                // The reason the gate fired everywhere is NOT established. An earlier
                // version of this comment blamed thin first-pass generation ("108-118
                // words per card against 182"); that figure came from a probe whose
                // fixture omitted topic.elementText, topic.criterionText,
                // topic.knowledgeEvidence and topic.keyPoints - all interpolated by the
                // VET prompt - so it measured a starved prompt. The claim is RETRACTED.
                // The gate's CC_DEPTH_TARGET may simply be set too high; it is
                // report-only now, so it can be calibrated against real runs safely.
                //
                // The prompts are back to 13.83. These checks now only MEASURE, and are
                // recorded on the card. Nothing they find changes what is generated, so
                // they cannot make content worse - they exist to tell you when it has
                // drifted, which is the thing this pipeline never had.
                //
                // A repair pass still runs for genuine STRUCTURAL failure, exactly as it
                // did in 13.83 - see the validation.valid check below.

                if (validation.valid) {
                    // Structure valid  -  return immediately, no scoring pass needed.
                    // The prompt already enforces quality; we only block broken content.
                    const language = context?.language || 'en-AU';
                    const cards = fixedCards.map((card, index) => ({
                        ...normalizeContent(card, language),
                        id: `${topic.id || 'topic'}_card_${index + 1}`,
                        topicId: topic.id,
                        topicTitle: topicTitle,
                        cardIndex: index,
                        generated: true,
                        generatedAt: Date.now(),
                        attemptCount: attemptCount,
                        qualityAction: softIssues.length ? 'QUALITY_FLAGGED' : 'VALIDITY_GATE_PASS',
                        // v13.88: measured visible-word count, stamped on every card.
                        // The v13.87 proof run could not tell whether thin output came
                        // from generation or from the repair pass, because nothing
                        // recorded the size of what was produced. Now it does.
                        contentWords: (function () {
                            try {
                                return harvestCardText(card, 0).split(/\s+/).filter(Boolean).length;
                            } catch (e) { return null; }
                        })(),
                        // v13.85: carried on the card so a QA panel, an export or the next
                        // proof-run harvest can read what was measured, instead of the
                        // finding existing only in a console log nobody sees in production.
                        qualityIssues: softIssues.length ? softIssues.slice(0, 10) : undefined
                    }));
                    if (language === 'en-AU') {
                        ccLog('[AU SPELLING] Applied Australian spelling normalization to', cards.length, 'cards');
                    }
                    return cards;
                }

                // Structural issues  -  store for repair on attempt 2
                lastIssues = validation.issues.slice(0, 5);
                lastScore = { cards: fixedCards };
                ccLog('%c[VALIDITY GATE] Structural issues (top ' + lastIssues.length + '):', 'color: #ef4444;');
                lastIssues.forEach(function (issue, i) { ccLog('%c  ' + (i + 1) + '. ' + issue, 'color: #ef4444;'); });
                if (attemptCount >= MAX_ATTEMPTS) {
                    ccLog('%c[VALIDITY GATE] All attempts exhausted  -  returning failed sequence', 'color: #ef4444; font-weight: bold;');
                }
                // Falls through: if attemptCount < MAX_ATTEMPTS the while loop continues to repair.
                
            } catch (error) {
                ccError('generateFiveCardSequence() EXCEPTION on ' + attemptLabel(attemptCount) + ': ' + error.message);
                ccError('generateFiveCardSequence() Stack:', error.stack);
                ccLog('%c[ERROR] ============================================', 'color: #ef4444; font-weight: bold;');
                ccLog('%c[ERROR] Exception on ' + attemptLabel(attemptCount) + ':', 'color: #ef4444; font-weight: bold;');
                ccLog('%c[ERROR] Message:', 'color: #ef4444;', error.message);
                ccLog('%c[ERROR] Stack:', 'color: #ef4444;', error.stack);
                
                // v7.9.65: Capture error for debugging
                pushDebugLogEntry({
                    type: 'EXCEPTION',
                    attemptCount,
                    attemptLabel: attemptLabel(attemptCount),
                    topicTitle,
                    errorMessage: error.message,
                    errorStack: error.stack
                });
                
                // v9.12 FIX: Don't immediately return failed sequence - fall through to
                // bestCards check below. Previously this discarded valid content from earlier
                // attempts when a later attempt threw an exception (e.g. ReferenceError).
                if (attemptCount >= MAX_ATTEMPTS) {
                    ccLog('%c[ERROR] All attempts exhausted - checking for best available content', 'color: #ef4444;');
                    break;
                }
            }
        }
        
        // v11.73: All attempts exhausted  -  validity gate never passed.
        // The last generated cards (lastScore.cards) are structurally broken.
        // Return a failed sequence so the "Regenerate Failed" auto-redo loop retries.
        const failReason = 'Structural validation failed after ' + MAX_ATTEMPTS + ' attempt(s): ' + lastIssues.join('; ');

        // v13.90.1 FIX-DISCARD-ON-EXHAUST: the loop above breaks out saying "checking for
        // best available content", and then there was no such check - lastScore.cards was
        // thrown away unconditionally.
        //
        // A single soft miss (mental-model returning 2 steps instead of 3, say) on both
        // attempts destroyed roughly 1,500 words of generated, billed, RENDERABLE content
        // for that section and replaced it with placeholder cards. That trade is only
        // right when the content is genuinely unusable.
        //
        // Keep the cards when they carry real content, and mark the section so the author
        // can see it needs review and can still hit Regenerate Failed. Fall back to the
        // placeholder sequence only when there is nothing worth keeping.
        const _salvage = (lastScore && Array.isArray(lastScore.cards)) ? lastScore.cards : null;
        const _salvageWords = _salvage
            ? _salvage.reduce(function (sum, c) {
                try { return sum + harvestCardText(c, 0).split(/\s+/).filter(Boolean).length; } catch (e) { return sum; }
            }, 0)
            : 0;

        if (_salvage && _salvage.length && _salvageWords >= 200) {
            ccError('[VALIDITY GATE] All attempts exhausted  -  KEEPING ' + _salvageWords
                + ' words of generated content across ' + _salvage.length
                + ' card(s) rather than discarding it. Flagged for review: ' + failReason);
            return _salvage.map(function (card) {
                return Object.assign({}, card, {
                    // failed:false keeps the card RENDERABLE - player5.js:4795 and
                    // cc-card-slots hide a card flagged failed, which would defeat the
                    // whole point of salvaging it.
                    failed: false,
                    // ...but the author must still be told. needsReview is counted by
                    // triggerFailedRegeneration() in builder.js alongside failed cards,
                    // so the section still appears in "N sections need attention" and can
                    // still be retried with Regenerate Failed. Without this the content
                    // was kept but the validation failure became invisible, which is a
                    // quieter kind of bad than losing it.
                    needsReview: true,
                    qualityAction: 'STRUCTURAL_REVIEW',
                    failureReason: failReason
                });
            });
        }

        ccError('[VALIDITY GATE] All attempts exhausted and nothing salvageable ('
            + _salvageWords + ' words). Returning failed sequence to force redo.');
        return getFailedCardSequence(topic, context?.mode || 'vet', failReason);
    };

    // ===================================================================
    // v10.26: ChatGPT prompt-file fast-parse
    // When context.priorityContent matches the prompt-file output format,
    // convert it directly to card JSON  -  zero AI calls, zero latency.
    //
    // parseChatGPTBlocks()      ->  legacy text-label format (v10.26 - v10.42):
    //   ={10,} block separators + [CARD N  -  TYPE] markers
    // parseChatGPTJSONBlocks()  ->  current JSON format (v10.43+):
    //   === PC [N.X] === separators + {"cards":[...]} JSON blocks
    //   (also handles single-section paste with no separator)
    // parseBlockIntoCards()     ->  converts one legacy text block to card objects
    // ===================================================================

    // Split pasted ChatGPT output into raw per-section content blocks.
    // Returns string[] ordered by appearance in the text.
    // LEGACY format only  -  handles old text-label prompt output.
    const parseChatGPTBlocks = (text) => {
        if (!text || typeof text !== 'string') return [];
        if (!/={10,}/.test(text) || !/\[CARD\s+\d/i.test(text)) return [];
        const normalised = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        return normalised.split(/={10,}[=]*/).filter(p => /\[CARD\s+\d/i.test(p));
    };

    // v10.52: Parse pasted ChatGPT JSON output (current prompt-file format v10.43+).
    // Prompt files instruct ChatGPT to output one {"cards":[...]} JSON object per
    // section, separated by "=== PC [N.X] ===" lines.  Users may also paste a
    // single block with no separator.  Returns card[][] ordered by section.
    const parseChatGPTJSONBlocks = (text) => {
        if (!text || typeof text !== 'string') return [];
        const norm = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
        // Must look like JSON card content
        if (!/"cardType"/.test(norm) && !/"cards"\s*:/.test(norm)) return [];

        // Bracket-matching JSON extractor: finds the outermost {...} containing
        // a "cards" key and returns parsed cards[], or null on failure.
        const extractCards = (s) => {
            const start = s.indexOf('{');
            if (start === -1) return null;
            let depth = 0;
            let end = -1;
            for (let i = start; i < s.length; i++) {
                const ch = s[i];
                if (ch === '{') depth++;
                else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
            }
            if (end === -1) return null;
            const jsonStr = s.slice(start, end + 1);
            const tryParse = (str) => {
                try {
                    const p = JSON.parse(str);
                    if (p && Array.isArray(p.cards) && p.cards.length >= 1) return p.cards;
                } catch (e) {
                    // Expected: this is one of several speculative parse attempts on a
                    // possibly truncated AI response. The caller falls back to the next
                    // candidate string, so a parse failure here is not an error.
                }
                return null;
            };
            return tryParse(jsonStr) ||
                   tryParse(jsonStr.replace(/,\s*([}\]])/g, '$1')) ||
                   null;
        };

        // Split on any === ... === separator line (3+ equals signs on each side)
        const segments = norm.split(/^={3,}[^\n]*$/m)
            .map(s => s.trim())
            .filter(s => s.length > 0);

        const result = [];
        for (const seg of segments) {
            const cards = extractCards(seg);
            if (cards) result.push(cards);
        }

        // If no separators yielded results, treat whole text as single block
        if (result.length === 0) {
            const cards = extractCards(norm);
            if (cards) result.push(cards);
        }

        return result;
    };

    // Parse a single raw block (VET: 7 cards, WP/Uni/PD: 6 cards) into card objects.
    // Returns card[] or null if the block cannot be meaningfully parsed.
    const parseBlockIntoCards = (blockText, section, mode) => {
        // fld(): extract the value of a labeled field.
        // Value extends from after "LABEL:" to the start of the next uppercase label.
        const fld = (text, label) => {
            const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const re = new RegExp('(?:^|\\n)' + esc + '\\s*:\\s*', 'i');
            const m = re.exec(text);
            if (!m) return '';
            const pos = m.index + m[0].length;
            const rest = text.slice(pos);
            const nm = /\n[A-Z][A-Z0-9 ]*(?:\s+\d+)?\s*:/.exec(rest);
            return (nm ? rest.slice(0, nm.index) : rest).trim();
        };
        // blts(): parse "  - text" bullet lines into string[]
        const blts = (text) =>
            text.split('\n')
                .map(l => l.replace(/^\s*[-\u2013\u2022]\s*/, '').trim())
                .filter(l => l.length > 0 && !/^[A-Z][A-Z0-9 ]*(?:\s+\d+)?\s*:/.test(l));
        // sgs(): parse STEP GROUP N HEADING + "  - STEP:" bullets into [{heading, bullets[]}]
        const sgs = (bt) => {
            const groups = [];
            const gRe = /(?:^|\n)STEP GROUP (\d+) HEADING\s*:\s*([^\n]*)/gi;
            let gm;
            while ((gm = gRe.exec(bt)) !== null) {
                const heading = gm[2].trim();
                const rest = bt.slice(gm.index + gm[0].length);
                const nextG = /\nSTEP GROUP \d+ HEADING/i.exec(rest.slice(1));
                const gc = nextG ? rest.slice(0, nextG.index + 1) : rest;
                const stepList = [];
                const sRe = /^\s*-\s*STEP\s*:\s*(.+)$/gim;
                let sm;
                while ((sm = sRe.exec(gc)) !== null) { if (sm[1].trim()) stepList.push(sm[1].trim()); }
                if (stepList.length === 0) {
                    const pRe = /^\s*-\s*(?!STEP\s*:)(.+)$/gim;
                    while ((sm = pRe.exec(gc)) !== null) { if (sm[1].trim()) stepList.push(sm[1].trim()); }
                }
                groups.push({ heading, bullets: stepList });
            }
            return groups;
        };
        // stamp(): card identity fields
        const stamp = (cardType, idx) => ({
            cardType,
            id: (section.id || 'topic') + '_card_' + (idx + 1),
            topicId: section.id,
            topicTitle: section.title || section.name || '',
            cardIndex: idx,
            generated: true,
            generatedAt: Date.now(),
            fromChatGPTParse: true
        });

        // Split block into per-card segments using [CARD N  -  TYPE] markers
        const CARD_RE = /\[CARD\s+\d+\s*[ - \-\u2013]\s*([^\]]+)\]/gi;
        const allMatches = [...blockText.matchAll(CARD_RE)];
        if (allMatches.length === 0) return null;

        const cards = allMatches.map((m, idx) => {
            const start = m.index;
            const end = idx + 1 < allMatches.length ? allMatches[idx + 1].index : blockText.length;
            const t = blockText.slice(start, end);
            const lbl = m[1].trim().toUpperCase();

            if (lbl.includes('PERFORMANCE ANCHOR'))
                return { ...stamp('performance-anchor', idx), pcStatement: fld(t, 'PC STATEMENT'), elementText: fld(t, 'ELEMENT CONTEXT'), summaryLine: fld(t, 'SUMMARY LINE'), voiceoverText: fld(t, 'VOICEOVER') };
            if (lbl.includes('PLAIN ENGLISH'))
                return { ...stamp('plain-english', idx), heading: fld(t, 'HEADING'), bodyText: fld(t, 'BODY'), voiceoverText: fld(t, 'VOICEOVER') };
            if (lbl.includes('ACTION BREAKDOWN'))
                return { ...stamp('action-breakdown', idx), heading: fld(t, 'HEADING'), actions: sgs(t), voiceoverText: fld(t, 'VOICEOVER') };
            if (lbl.includes('COMPETENCE STANDARD')) {
                const raw = fld(t, 'STANDARD ITEMS');
                return { ...stamp('competence-standard', idx), heading: fld(t, 'HEADING'), standardItems: blts(raw).length > 0 ? blts(raw) : raw.split('\n').map(l => l.trim()).filter(Boolean), voiceoverText: fld(t, 'VOICEOVER') };
            }
            if (lbl.includes('SCENARIO 1') || (lbl.includes('SCENARIO') && !lbl.includes('2') && idx >= 4))
                return { ...stamp('scenario-1', idx), title: fld(t, 'TITLE'), context: fld(t, 'CONTEXT'), consequence: fld(t, 'CONSEQUENCE'), keyPoints: blts(fld(t, 'KEY POINTS')), voiceoverText: fld(t, 'VOICEOVER') };
            if (lbl.includes('SCENARIO 2') || (lbl.includes('SCENARIO') && (lbl.includes('2') || idx >= 5)))
                return { ...stamp('scenario-2', idx), title: fld(t, 'TITLE'), context: fld(t, 'CONTEXT'), turningPoint: fld(t, 'TURNING POINT'), consequence: fld(t, 'CONSEQUENCE'), voiceoverText: fld(t, 'VOICEOVER') };
            if (lbl.includes('COMMON ERROR'))
                return { ...stamp('common-errors', idx), heading: fld(t, 'HEADING'), errorItems: [{ error: fld(t, 'ERROR 1'), consequence: fld(t, 'CONSEQUENCE 1') }, { error: fld(t, 'ERROR 2'), consequence: fld(t, 'CONSEQUENCE 2') }, { error: fld(t, 'ERROR 3'), consequence: fld(t, 'CONSEQUENCE 3') }].filter(e => e.error), voiceoverText: fld(t, 'VOICEOVER') };
            if (lbl.includes('COMMON PITFALL'))
                return { ...stamp('common-pitfalls', idx), heading: fld(t, 'HEADING'), pitfallItems: [{ pitfall: fld(t, 'PITFALL 1'), consequence: fld(t, 'CONSEQUENCE 1') }, { pitfall: fld(t, 'PITFALL 2'), consequence: fld(t, 'CONSEQUENCE 2') }, { pitfall: fld(t, 'PITFALL 3'), consequence: fld(t, 'CONSEQUENCE 3') }].filter(e => e.pitfall), voiceoverText: fld(t, 'VOICEOVER') };
            if (lbl.includes('BUSINESS IMPACT'))
                return { ...stamp('business-impact', idx), heading: fld(t, 'HEADING'), impactStatement: fld(t, 'IMPACT STATEMENT'), bodyText: fld(t, 'BODY'), voiceoverText: fld(t, 'VOICEOVER') };
            if (lbl.includes('ACTION FRAMEWORK')) {
                const groups = sgs(t);
                return { ...stamp('action-framework', idx), heading: fld(t, 'HEADING'), steps: groups.flatMap(g => [{ action: g.heading }, ...g.bullets.map(b => ({ action: b }))]), voiceoverText: fld(t, 'VOICEOVER') };
            }
            if (lbl.includes('RISK') && !lbl.includes('SCENARIO'))
                return { ...stamp('risk-card', idx), heading: fld(t, 'HEADING'), risks: [{ risk: fld(t, 'RISK 1'), likelihood: fld(t, 'LIKELIHOOD 1'), impact: fld(t, 'IMPACT 1'), mitigation: fld(t, 'MITIGATION 1') }, { risk: fld(t, 'RISK 2'), likelihood: fld(t, 'LIKELIHOOD 2'), impact: fld(t, 'IMPACT 2'), mitigation: fld(t, 'MITIGATION 2') }, { risk: fld(t, 'RISK 3'), likelihood: fld(t, 'LIKELIHOOD 3'), impact: fld(t, 'IMPACT 3'), mitigation: fld(t, 'MITIGATION 3') }].filter(r => r.risk), voiceoverText: fld(t, 'VOICEOVER') };
            if (lbl.includes('POLICY'))
                return { ...stamp('policy-alignment', idx), heading: fld(t, 'HEADING'), policyItems: [{ policy: fld(t, 'POLICY 1'), requirement: fld(t, 'REQUIREMENT 1'), consequence: fld(t, 'CONSEQUENCE 1') }, { policy: fld(t, 'POLICY 2'), requirement: fld(t, 'REQUIREMENT 2'), consequence: fld(t, 'CONSEQUENCE 2') }, { policy: fld(t, 'POLICY 3'), requirement: fld(t, 'REQUIREMENT 3'), consequence: fld(t, 'CONSEQUENCE 3') }].filter(p => p.policy), voiceoverText: fld(t, 'VOICEOVER') };
            if (lbl.includes('CONCEPT ANCHOR'))
                return { ...stamp('concept-anchor', idx), heading: fld(t, 'HEADING'), conceptDefinition: fld(t, 'CONCEPT DEFINITION'), significance: fld(t, 'SIGNIFICANCE'), bodyText: fld(t, 'BODY'), voiceoverText: fld(t, 'VOICEOVER') };
            if (lbl.includes('THEORETICAL FRAMEWORK'))
                return { ...stamp('theoretical-framework', idx), heading: fld(t, 'HEADING'), frameworks: [{ name: fld(t, 'FRAMEWORK 1'), originator: fld(t, 'ORIGINATOR 1'), principle: fld(t, 'PRINCIPLE 1'), limitation: fld(t, 'LIMITATION 1') }, { name: fld(t, 'FRAMEWORK 2'), originator: fld(t, 'ORIGINATOR 2'), principle: fld(t, 'PRINCIPLE 2'), limitation: fld(t, 'LIMITATION 2') }, { name: fld(t, 'FRAMEWORK 3'), originator: fld(t, 'ORIGINATOR 3'), principle: fld(t, 'PRINCIPLE 3'), limitation: fld(t, 'LIMITATION 3') }].filter(f => f.name), voiceoverText: fld(t, 'VOICEOVER') };
            if (lbl.includes('ANALYTICAL LENS'))
                return { ...stamp('analytical-lens', idx), heading: fld(t, 'HEADING'), bodyText: [fld(t, 'KEY INSIGHT'), fld(t, 'BODY')].filter(Boolean).join('\n\n'), analysisPrompts: blts(fld(t, 'ANALYSIS PROMPTS')), voiceoverText: fld(t, 'VOICEOVER') };
            if (lbl.includes('ETHICS'))
                return { ...stamp('ethics-considerations', idx), heading: fld(t, 'HEADING'), considerations: [{ dimension: fld(t, 'CONSIDERATION 1'), description: fld(t, 'DIMENSION 1') }, { dimension: fld(t, 'CONSIDERATION 2'), description: fld(t, 'DIMENSION 2') }, { dimension: fld(t, 'CONSIDERATION 3'), description: fld(t, 'DIMENSION 3') }].filter(c => c.dimension), voiceoverText: fld(t, 'VOICEOVER') };
            if (lbl.includes('CASE STUDY 1') || (lbl.includes('CASE STUDY') && !lbl.includes('2') && idx >= 4))
                return { ...stamp('case-study-1', idx), title: fld(t, 'TITLE'), context: fld(t, 'CONTEXT'), bodyText: fld(t, 'CONSEQUENCE'), keyPoints: blts(fld(t, 'KEY POINTS')), voiceoverText: fld(t, 'VOICEOVER') };
            if (lbl.includes('CASE STUDY 2') || (lbl.includes('CASE STUDY') && (lbl.includes('2') || idx >= 5)))
                return { ...stamp('case-study-2', idx), title: fld(t, 'TITLE'), context: fld(t, 'CONTEXT'), turningPoint: fld(t, 'TURNING POINT'), bodyText: fld(t, 'CONSEQUENCE'), voiceoverText: fld(t, 'VOICEOVER') };
            if (lbl.includes('SKILL ANCHOR'))
                return { ...stamp('skill-anchor', idx), heading: fld(t, 'HEADING'), skillStatement: fld(t, 'SKILL STATEMENT'), relevance: fld(t, 'RELEVANCE'), bodyText: fld(t, 'BODY'), voiceoverText: fld(t, 'VOICEOVER') };
            if (lbl.includes('CORE FRAMEWORK')) {
                const fs = [];
                for (let n = 1; n <= 4; n++) { const s = fld(t, 'FRAMEWORK STEP ' + n); if (s) fs.push({ step: s, explanation: fld(t, 'EXPLANATION ' + n), example: fld(t, 'EXAMPLE ' + n) }); }
                return { ...stamp('core-framework', idx), heading: fld(t, 'HEADING'), frameworkSteps: fs, voiceoverText: fld(t, 'VOICEOVER') };
            }
            if (lbl.includes('APPLICATION GUIDE')) {
                const groups = sgs(t);
                return { ...stamp('application-guide', idx), heading: fld(t, 'HEADING'), applications: groups.map(g => ({ situation: g.heading, action: g.bullets.join(' '), rationale: '' })), voiceoverText: fld(t, 'VOICEOVER') };
            }
            // -- v10.27 unified 7-card format parsers -------------------------
            if (lbl.includes('HOOK SCENARIO')) {
                // v10.43: parse PART N TITLE/ICON/TEXT if present; fall back to CONTENT
                const sceneParts = [];
                for (let n = 1; n <= 6; n++) {
                    const pTitle = fld(t, 'PART ' + n + ' TITLE');
                    const pIcon  = fld(t, 'PART ' + n + ' ICON');
                    const pText  = fld(t, 'PART ' + n + ' TEXT');
                    if (pTitle || pText) sceneParts.push({ title: pTitle, icon: pIcon, text: pText });
                }
                return { ...stamp('hook-scenario', idx),
                    title: fld(t, 'TITLE'),
                    sceneParts: sceneParts.length ? sceneParts : undefined,
                    content: sceneParts.length ? '' : fld(t, 'CONTENT'),
                    highlightText: fld(t, 'HIGHLIGHT') || undefined,
                    voiceoverText: fld(t, 'VOICEOVER')
                };
            }
            if (lbl.includes('CONCEPT EXPLAINER')) {
                // v10.43: parse INSIGHT N TITLE/ICON/TEXT if present; fall back to CONTENT
                const conceptInsights = [];
                for (let n = 1; n <= 5; n++) {
                    const iTitle = fld(t, 'INSIGHT ' + n + ' TITLE');
                    const iIcon  = fld(t, 'INSIGHT ' + n + ' ICON');
                    const iText  = fld(t, 'INSIGHT ' + n + ' TEXT');
                    if (iTitle || iText) conceptInsights.push({ title: iTitle, icon: iIcon, text: iText });
                }
                return { ...stamp('concept-explainer', idx),
                    title: fld(t, 'TITLE'),
                    conceptInsights: conceptInsights.length ? conceptInsights : undefined,
                    content: conceptInsights.length ? '' : fld(t, 'CONTENT'),
                    voiceoverText: fld(t, 'VOICEOVER')
                };
            }
            if (lbl.includes('MENTAL MODEL')) {
                const steps = [];
                for (let n = 1; n <= 6; n++) {
                    const stepTitle = fld(t, 'STEP ' + n + ' TITLE');
                    const stepDetail = fld(t, 'STEP ' + n + ' DETAIL');
                    const stepIcon  = fld(t, 'STEP ' + n + ' ICON');
                    if (stepTitle) steps.push({ step: stepTitle, detail: stepDetail, icon: stepIcon || '' });
                }
                return { ...stamp('mental-model', idx),
                    title: fld(t, 'TITLE'),
                    steps: steps,
                    voiceoverText: fld(t, 'VOICEOVER')
                };
            }
            if (lbl.includes('APPLIED SCENARIO')) {
                // v10.43: parse PART N TITLE/ICON/TEXT if present; fall back to CONTENT
                const sceneParts = [];
                for (let n = 1; n <= 6; n++) {
                    const pTitle = fld(t, 'PART ' + n + ' TITLE');
                    const pIcon  = fld(t, 'PART ' + n + ' ICON');
                    const pText  = fld(t, 'PART ' + n + ' TEXT');
                    if (pTitle || pText) sceneParts.push({ title: pTitle, icon: pIcon, text: pText });
                }
                return { ...stamp('applied-scenario', idx),
                    title: fld(t, 'TITLE'),
                    sceneParts: sceneParts.length ? sceneParts : undefined,
                    content: sceneParts.length ? '' : fld(t, 'CONTENT'),
                    highlightText: fld(t, 'HIGHLIGHT') || undefined,
                    voiceoverText: fld(t, 'VOICEOVER')
                };
            }
            if (lbl.includes('DECISION POINT')) {
                const letters = ['A', 'B', 'C', 'D'];
                const correctLetter = (fld(t, 'CORRECT') || '').trim().toUpperCase().replace(/[^A-D]/, '');
                const options = letters.map(function (L) {
                    const text = fld(t, 'OPTION ' + L);
                    if (!text) return null;
                    return {
                        text: text,
                        feedback: fld(t, 'FEEDBACK ' + L),
                        correct: (L === correctLetter)
                    };
                }).filter(Boolean);
                return { ...stamp('decision-point', idx),
                    title: fld(t, 'TITLE'),
                    question: fld(t, 'QUESTION'),
                    options: options,
                    voiceoverText: fld(t, 'VOICEOVER')
                };
            }
            if (lbl.includes('COMMON MISTAKE') || (lbl.includes('MISTAKE') && !lbl.includes('SCENARIO'))) {
                const items = [];
                for (let n = 1; n <= 5; n++) {
                    const mistake = fld(t, 'MISTAKE ' + n);
                    if (!mistake) break;
                    items.push({ mistake: mistake, consequence: fld(t, 'CONSEQUENCE ' + n) });
                }
                return { ...stamp('mistakes', idx),
                    title: fld(t, 'TITLE'),
                    items: items,
                    voiceoverText: fld(t, 'VOICEOVER')
                };
            }
            if (lbl.includes('COMPETENCY SUMMARY')) {
                // v10.39: parse GOOD 1..GOOD 8 and BAD 1..BAD 8 labels
                const goodItems = [];
                for (let n = 1; n <= 8; n++) {
                    const g = fld(t, 'GOOD ' + n);
                    if (!g) break;
                    goodItems.push(g);
                }
                const badItems = [];
                for (let n = 1; n <= 8; n++) {
                    const b = fld(t, 'BAD ' + n);
                    if (!b) break;
                    badItems.push(b);
                }
                // backward compat: fall back to ITEM 1..8 if no GOOD/BAD present
                const legacyItems = [];
                if (!goodItems.length && !badItems.length) {
                    for (let n = 1; n <= 8; n++) {
                        const item = fld(t, 'ITEM ' + n);
                        if (!item) break;
                        legacyItems.push(item);
                    }
                }
                return { ...stamp('competency-summary', idx),
                    title: fld(t, 'TITLE'),
                    goodItems: goodItems.length ? goodItems : undefined,
                    badItems:  badItems.length  ? badItems  : undefined,
                    items:     legacyItems.length ? legacyItems : undefined,
                    voiceoverText: fld(t, 'VOICEOVER')
                };
            }
            // -- end v10.27 parsers --------------------------------------------
            ccWarn('[FAST-PARSE] Unrecognised card label at index ' + idx + ': ' + lbl);
            return null;
        }).filter(Boolean);

        return cards.length > 0 ? cards : null;
    };

    // ===================================================================
    // MAIN GENERATION FUNCTION - v7.8.7: 5-Card Model (ChatGPT Best Practice)
    // Generates: 5 learning cards per PC (pure 5-card model)
    // Options:
    //   - regenerateFailedOnly: if true, skip slides with generated:true
    //   - existingManifest: the saved manifest with generated content to preserve
    // ===================================================================
    const generate = async (plannedManifest, cmid, progressCallback, options = {}) => {
        ccDiag('===========================================================');
        ccDiag('GENERATE() ENTRY POINT | v' + CC_VERSION);
        ccDiag('Mode: ' + (plannedManifest?.mode || plannedManifest?.context?.mode || 'UNKNOWN'));
        ccDiag('Topics: ' + (plannedManifest?.topics?.length || 0));
        ccDiag('CMID: ' + cmid);
        ccDiag('Voice: ' + (plannedManifest?.voiceSettings?.language || 'en-AU') + ' | enabled=' + (plannedManifest?.voiceSettings?.enabled ?? true));
        ccDiag('Images: enabled=' + (plannedManifest?.imageSettings?.enabled || false));
        ccDiag('Activities: enabled=' + (plannedManifest?.activitySettings?.enabled ?? true));
        ccDiag('Options: ' + JSON.stringify(options));
        if (plannedManifest?.topics) {
            plannedManifest.topics.forEach(function (t, i) {
                var secs = t.sections || t.subtopics || [];
                ccDiag('  Topic ' + (i+1) + ': "' + (t.title || t.name || 'UNTITLED') + '" | sections=' + secs.length);
                secs.forEach(function (s, j) {
                    ccDiag('    Section ' + (j+1) + ': "' + (s.title || s.name || 'UNTITLED') + '" | id=' + (s.id || 'NO ID'));
                });
            });
        }
        ccDiag('===========================================================');
        ccLog('%c[CC v' + CC_VERSION + '] ===================================================================', 'color: #8b5cf6; font-weight: bold; font-size: 16px;');
        ccLog('%c[CC v' + CC_VERSION + '] MAIN GENERATE FUNCTION CALLED (3-ATTEMPT QUALITY SYSTEM)', 'color: #8b5cf6; font-weight: bold; font-size: 16px;');
        ccLog('%c[CC v' + CC_VERSION + '] Topics count:', 'color: #8b5cf6;', plannedManifest?.topics?.length || 0);
        ccLog('%c[CC v' + CC_VERSION + '] CMID:', 'color: #8b5cf6;', cmid);
        ccLog('%c[CC v' + CC_VERSION + '] Options:', 'color: #8b5cf6;', JSON.stringify(options));
        ccLog('%c[CC v' + CC_VERSION + '] Voice Language:', 'color: #8b5cf6;', plannedManifest?.voiceSettings?.language || 'en-AU (default)');
        ccLog('%c[CC v' + CC_VERSION + '] ===================================================================', 'color: #8b5cf6; font-weight: bold;');
        const { regenerateFailedOnly = false, existingManifest = null } = options;
        const getSections = (t) => t.sections || t.subtopics || [];
        const depthMode = plannedManifest.context?.depthMode || DEPTH_MODES.RTO_COMPLIANT;
        
        // v6.5.8: Merge language from voiceSettings into context for multi-language support
        const voiceLanguage = plannedManifest.voiceSettings?.language || 'en-AU';
        if (plannedManifest.context) {
            plannedManifest.context.language = voiceLanguage;
        } else {
            plannedManifest.context = { language: voiceLanguage };
        }
        
        // v7.4.7: Check if image generation is enabled (v6.6.68 setting)
        // v7.5.13: Enhanced debugging for image generation setting
        
        const imageGenEnabled = plannedManifest.imageSettings?.enabled === true || 
                                plannedManifest.settings?.generateImages === true ||
                                plannedManifest.context?.generateImages === true;
        
        // v11.11: Activities setting  -  when false, decision-point cards are excluded
        const activitiesEnabled = plannedManifest.activitySettings?.enabled !== false;
        // FIX-CC-ACTIVITIES-CONTEXT (v13.65): validateCards() only ever receives `context`,
        // never the manifest, so it had no way to know activities were disabled and always
        // demanded the full card count. Surface the flag on context so the card-count check
        // and the prompt path agree.
        if (plannedManifest.context) {
            plannedManifest.context.activitiesEnabled = activitiesEnabled;
        }
        
        // v7.8.7: Validate topics array exists
        const topics = plannedManifest.topics || [];
        if (topics.length === 0) {
            return { ...plannedManifest, topics: [], totalCards: 0, error: 'No topics provided' };
        }

        // v7.5.2: Progress now shows PC count (not AI call count)
        // User sees "Generating PC 1/8" instead of confusing "1/24"
        const sectionCount = topics.reduce((sum, t) => sum + getSections(t).length, 0);
        let currentPC = 0;



        // v10.26: Pre-split any pasted ChatGPT prompt-file output into per-section
        // raw blocks. Index matches allJobs order (section 0  ->  block 0, etc.).
        // v10.52: JSON path added  -  current prompt-file format (v10.43+) outputs JSON.
        const _priorityContent = plannedManifest.context?.priorityContent || '';
        const chatGPTRawBlocks = parseChatGPTBlocks(_priorityContent);
        const genMode = plannedManifest.context?.mode || 'vet';
        // v10.52: Try JSON fast-parse only when legacy text-label format not detected
        const chatGPTJSONBlocks = chatGPTRawBlocks.length === 0 ? parseChatGPTJSONBlocks(_priorityContent) : [];
        if (chatGPTRawBlocks.length > 0) {
            ccLog('%c[CC v' + CC_VERSION + '] [FAST-PARSE] ' + chatGPTRawBlocks.length + ' ChatGPT block(s) detected in priorityContent  -  will bypass AI for matched sections.', 'color: #10b981; font-weight: bold;');
        } else if (chatGPTJSONBlocks.length > 0) {
            ccLog('%c[CC v' + CC_VERSION + '] [FAST-PARSE-JSON] ' + chatGPTJSONBlocks.length + ' ChatGPT JSON block(s) detected in priorityContent  -  will bypass AI for matched sections.', 'color: #10b981; font-weight: bold;');
        }

        // Helper to find existing section by ID
        const findExistingSection = (sectionId, topicId) => {
            if (!existingManifest || !existingManifest.topics) return null;
            const topic = existingManifest.topics.find(t => t.id === topicId);
            if (!topic) return null;
            const sections = topic.sections || topic.subtopics || [];
            return sections.find(s => s.id === sectionId);
        };

        const generatedTopics = [];

        // v10.23: Reduced from 5 -> 2 concurrent sections.
        // Production timeouts (curl 28, OPENAI_TIMEOUT) showed that 5 simultaneous 180-second
        // OpenAI requests saturate the server connection pool. 2 workers keep throughput
        // acceptable while dramatically reducing server-side timeout pressure. If OpenAI
        // latency improves this can be raised again.
        const CONCURRENCY_LIMIT = 2;

        /**
         * v13.97: report a single stage of one section so the builder can render a row
         * per subtopic rather than one bar for the whole run.
         *
         * The existing progressCallback fires once per section, AFTER everything for that
         * section is done, which is enough for a percentage and nothing else. These events
         * carry the section identity and which stage just finished, so the progress table
         * can tick Content, Image and Voiceover independently and show what is in flight.
         *
         * Emitted alongside the original event, never instead of it - the percentage
         * behaviour is unchanged for any caller that ignores `stage`.
         *
         * @param {Object} section The section being generated.
         * @param {Number} jobIdx Its index in the flattened job list.
         * @param {String} stage 'start' | 'content' | 'image' | 'section'.
         * @param {String} state 'running' | 'ok' | 'skipped' | 'failed'.
         */
        const reportStage = (section, jobIdx, stage, state) => {
            if (!progressCallback) { return; }
            try {
                progressCallback({
                    current: currentPC,
                    total: sectionCount,
                    phase: 'Generating',
                    itemType: 'stage',
                    itemTitle: section?.title || '',
                    sectionId: section?.id || ('section_' + jobIdx),
                    sectionIndex: jobIdx,
                    stage: stage,
                    state: state
                });
            } catch (e) {
                // A progress listener must never be able to stop generation.
                ccWarn('[PROGRESS] stage listener threw: ' + e.message);
            }
        };

        const generateOneSection = async (section, topic, jobIdx) => {
            const existingSection = regenerateFailedOnly ? findExistingSection(section.id, topic.id) : null;
            reportStage(section, jobIdx, 'start', 'running');

            const expectedCardCount = getExpectedCardOrder(plannedManifest.context?.mode || 'vet', activitiesEnabled).length;
            // v13.90.1: needsReview counts alongside failed, so a section whose content was
            // salvaged after exhausting its attempts is actually re-generated when the
            // author clicks Regenerate Failed. Without this the builder counted it and the
            // generator skipped it, so the banner promised more slides than it redid.
            const needsCards = !(regenerateFailedOnly && existingSection?.cards && existingSection.cards.length >= expectedCardCount && !existingSection.cards.some(c => c.failed || c.needsReview));
            const needsImage = imageGenEnabled && !(regenerateFailedOnly && existingSection?.image?.url);

            // -----------------------------------------------------------------
            // BUG-IMAGE-CONTEXT (v9.97): When cards and image are generated
            // together, the image used to fire in parallel with card generation
            // using the bare planned section  -  often just a topic title with no
            // description or key points  -  producing images unrelated to the
            // actual generated content.
            //
            // Fix: when new cards are needed, generate cards first, then enrich
            // the image request with firstCard.description + firstCard.requirements
            // so the image matches the actual AI-generated slide content.
            //
            // When only the image is needed (cards already exist), use the
            // existing first card's content as context instead of the bare plan.
            //
            // BUG-VO-STALE-AUDIO (v9.97): When content is regenerated (new
            // topic/text pasted), the old voiceoverUrl was preserved in the
            // returned section via the ...section spread. If the old and new
            // word counts happened to be within the 3-word staleness threshold,
            // the old audio was served over the new slide content  -  the exact
            // "reads words not in slides" bug reported.
            //
            // Fix: when needsCards=true (new content generated), explicitly
            // clear voiceoverUrl / voiceoverWordCount / voiceoverSchemaVersion
            // from the returned section so the preloader regenerates fresh audio.
            // -----------------------------------------------------------------

            let learningCards = needsCards ? null : (existingSection?.cards || null);
            let topicImage    = (imageGenEnabled && !needsImage) ? (existingSection?.image || null) : null;

            if (needsCards) {
                // v10.26: ChatGPT fast-parse bypass  -  try before any AI call
                let fastParsed = null;
                if (chatGPTRawBlocks.length > 0 && jobIdx !== undefined && chatGPTRawBlocks[jobIdx]) {
                    try {
                        const raw = parseBlockIntoCards(chatGPTRawBlocks[jobIdx], section, genMode);
                        if (raw && raw.length >= 1) {
                            fastParsed = normalizeCardSchema(localFixFiveCards(raw, plannedManifest.context, section.title || ''), genMode);
                            ccLog('%c[CC v' + CC_VERSION + '] [FAST-PARSE] "' + (section.title || 'UNTITLED') + '"  ->  ' + fastParsed.length + ' cards from ChatGPT output (no AI call)', 'color: #10b981; font-weight: bold;');
                        }
                    } catch (fpErr) {
                        ccWarn('[FAST-PARSE] Block ' + jobIdx + ' parse failed, falling back to AI: ' + fpErr.message);
                    }
                }
                // v10.52: JSON fast-parse bypass  -  current ChatGPT prompt-file format
                // Cards are pre-parsed by parseChatGPTJSONBlocks() at the start of
                // generate(). Stamp identity fields and normalise through the same
                // pipeline as AI-generated cards.
                if (!fastParsed && chatGPTJSONBlocks.length > 0 && jobIdx !== undefined && chatGPTJSONBlocks[jobIdx]) {
                    try {
                        const rawCards = chatGPTJSONBlocks[jobIdx].map((c, ci) => ({
                            ...c,
                            id: (section.id || 'topic') + '_card_' + (ci + 1),
                            topicId: section.id,
                            topicTitle: section.title || section.name || '',
                            cardIndex: ci,
                            generated: true,
                            generatedAt: Date.now(),
                            fromChatGPTParse: true
                        }));
                        if (rawCards.length >= 1) {
                            fastParsed = normalizeCardSchema(localFixFiveCards(rawCards, plannedManifest.context, section.title || ''), genMode);
                            ccLog('%c[CC v' + CC_VERSION + '] [FAST-PARSE-JSON] "' + (section.title || 'UNTITLED') + '"  ->  ' + fastParsed.length + ' cards from JSON output (no AI call)', 'color: #10b981; font-weight: bold;');
                        }
                    } catch (fpErr) {
                        ccWarn('[FAST-PARSE-JSON] Block ' + jobIdx + ' failed, falling back to AI: ' + fpErr.message);
                    }
                }
                if (fastParsed) {
                    learningCards = fastParsed;
                    reportStage(section, jobIdx, 'content', 'ok');
                } else {
                    ccDiag('generate() Launching card generation for section "' + (section?.title || 'UNTITLED') + '"');
                    try {
                        const cards = await generateFiveCardSequence(section, plannedManifest.context, cmid);
                        ccDiag('generate() Cards COMPLETED for "' + (section?.title || '') + '" | cards=' + (cards?.length || 0) + ' | failed=' + (cards?.some(c => c.failed) || false));
                        learningCards = cards;
                        reportStage(section, jobIdx, 'content',
                            (cards && cards.some(function (c) { return c.failed; })) ? 'failed' : 'ok');
                    } catch (err) {
                        ccError('generate() Cards FAILED for "' + (section?.title || '') + '": ' + err.message);
                        learningCards = getFailedCardSequence(section, plannedManifest.context?.mode || 'vet', err.message, activitiesEnabled);
                        reportStage(section, jobIdx, 'content', 'failed');
                    }
                }
            } else {
                ccDiag('generate() SKIPPING cards for "' + (section?.title || '') + '" (already generated)');
            }

            if (needsImage) {
                reportStage(section, jobIdx, 'image', 'running');
                // Build a richer image context from the actual generated (or existing) card content.
                // v10.27: Use hook-scenario card (card[0]) content as scenarioContext so the image
                // depicts the actual job story, not just a generic description.
                const imageFirstCard = learningCards?.[0] || existingSection?.cards?.[0] || {};
                // For unified 7-card format, hook-scenario content is in card.content
                // For legacy format, it's in card.description
                // v13.91: Topics-and-Text cards carry neither `content` nor `description` -
                // their prose lives in paragraphs[]. Without this the image request went out
                // with an empty scenarioContext and an empty description, and the only signal
                // left was the section title. Feed it the card heading plus its opening
                // paragraph, which is exactly the equivalent material.
                const _ttParas = Array.isArray(imageFirstCard.paragraphs) ? imageFirstCard.paragraphs : null;
                const _ttProse = _ttParas
                    ? _ttParas.map(function (p) { return typeof p === 'string' ? p : (p && (p.text || p.paragraph)) || ''; })
                        .filter(Boolean).slice(0, 2).join(' ')
                    : '';
                const scenarioContent = imageFirstCard.content || imageFirstCard.description || _ttProse || '';
                // v13.94.4: Topics-and-Text prose cards carry NO title or heading - the four
                // headings are supplied by the platform and deliberately stripped from the
                // card (see CcState.PROSE_HEADINGS). So scenarioTitle was always empty here
                // and scenarioContext came out byte-identical to description, sending the
                // vendor the same paragraph twice under two names. The section title is the
                // real subject line on this route, so use it.
                const scenarioTitle   = imageFirstCard.title || imageFirstCard.heading
                    || (_ttParas ? (section.title || '') : '');
                const scenarioContext = scenarioTitle ? (scenarioTitle + '. ' + scenarioContent).trim() : scenarioContent;

                // v13.91.2: send the route's TRUE value.
                //
                // v13.91.1 mapped topicstext -> university here, because the vendor's prompt
                // builder had a single branch - university got academic wording and every
                // other value, including any unknown one, fell through to the VET/workplace
                // branch that mandates "safety helmets, gloves, eye and hearing protection,
                // high-visibility clothing". A Topics-and-Text article about Renaissance
                // painting would have been illustrated with hard hats.
                //
                // The vendor now has dedicated 'pd' and 'topicstext' branches, verified live:
                // topicstext produces an editorial lead image chosen "solely from the subject
                // matter", does not assume a person is present, and explicitly excludes PPE
                // and industrial equipment unless the subject calls for it. The workaround is
                // therefore removed so the correct branch is actually reached.
                const _imageRoute = plannedManifest.context?.mode || section.route || 'vet';

                // v13.94.4: pass the PARENT TOPIC as topicTitle.
                //
                // generateTopicImage() resolves topicTitle as
                // `section.topicTitle || context.unitTitle || section.title`. Nothing sets
                // section.topicTitle, and Topics and Text has no unitTitle - so it fell all
                // the way through to section.title and the vendor received the same string
                // twice, as both slideTitle and topicTitle, with the parent topic never
                // sent at all. On a route whose images are editorial rather than workplace
                // that parent topic is the single most useful piece of framing there is:
                // a subtopic called "Sleep stages and what each one does" is a very
                // different picture under "Foundations of Sleep Science" than it would be
                // under "Shift Rostering". Verified missing by capturing the outgoing
                // request payload, not by reading.
                const _parentTopicTitle = topic?.title || topic?.name || '';

                const enrichedSection = {
                    ...section,
                    description:     imageFirstCard.description || imageFirstCard.content || _ttProse || section.description || '',
                    keyPoints:       (imageFirstCard.requirements || imageFirstCard.keyPoints || section.keyPoints || []).slice(0, 3),
                    route:           _imageRoute,
                    // Only override when it adds something: an identical parent and section
                    // title is no more use than the fallback it replaces.
                    topicTitle:      (_parentTopicTitle && _parentTopicTitle !== section.title)
                        ? _parentTopicTitle
                        : (section.topicTitle || ''),
                    scenarioContext: scenarioContext.substring(0, 600),
                };
                ccDiag('generate() Launching image generation for section "' + (section?.title || 'UNTITLED') + '" | enriched desc=' + (enrichedSection.description || '').substring(0, 80));
                try {
                    const img = await generateTopicImage(enrichedSection, plannedManifest.context, cmid);
                    ccDiag('generate() Image COMPLETED for "' + (section?.title || '') + '" | hasImage=' + !!img);
                    topicImage = img;
                    reportStage(section, jobIdx, 'image', img ? 'ok' : 'failed');
                } catch (err) {
                    ccError('generate() Image FAILED for "' + (section?.title || '') + '": ' + err.message);
                    topicImage = null;
                    reportStage(section, jobIdx, 'image', 'failed');
                }
            } else if (imageGenEnabled) {
                ccDiag('generate() SKIPPING image for "' + (section?.title || '') + '" (already exists)');
                reportStage(section, jobIdx, 'image', 'ok');
            } else {
                ccDiag('generate() Images DISABLED for this generation');
                reportStage(section, jobIdx, 'image', 'skipped');
            }

            const firstCard = learningCards?.[0] || {};

            // BUG-VO-STALE-AUDIO fix: strip stale voiceover fingerprint when
            // new cards were generated, so the preloader always re-synthesises
            // fresh audio that matches the new slide content.
            const { voiceoverUrl: _dropUrl, voiceoverWordCount: _dropWc, voiceoverSchemaVersion: _dropSv, ...sectionWithoutVoiceover } = section;
            const baseSection = needsCards ? sectionWithoutVoiceover : section;

            // v10.17 FIX-VO-OVERVIEW-DUPLICATE: Only promote firstCard.voiceoverText to
            // section.voiceoverText (which renders as the Overview box) when the first card has
            // NO structural display fields. When structural fields exist (heading, skillStatement,
            // bodyText, etc.), ChatGPT often adds a voiceoverText that is a verbatim repeat of
            // those fields. Promoting it creates a visible duplicate of Card 1 content in the
            // Overview box. Leave section.voiceoverText empty in that case  -  the voiceover will
            // narrate the structured fields directly from the multi-card path.
            const _fcHasStructure = !!(
                // v10.44 FIX-VO-7CARD: if first card is ANY 7-card type, always treat it as
                // having structure  -  section.voiceoverText must stay empty so buildFullVoiceoverText
                // narrates ALL cards via structural fields (sceneParts, conceptInsights, steps, etc.)
                _7CARD_TYPES_SET.has(firstCard.cardType) ||
                // v10.27 unified 7-card fields (kept for completeness)
                firstCard.sceneParts?.length || firstCard.conceptInsights?.length ||
                firstCard.content || firstCard.steps?.length || firstCard.options?.length ||
                firstCard.items?.length || firstCard.question ||
                // v13.92: Topics-and-Text card 1 carries its content in paragraphs[].
                // Without this the card's voiceoverText was promoted to
                // section.voiceoverText, which renders as the Overview box ABOVE the
                // cards - a verbatim duplicate of card 1 on every prose section.
                firstCard.paragraphs?.length ||
                // legacy card fields
                firstCard.heading || firstCard.skillStatement || firstCard.bodyText ||
                firstCard.impactStatement || firstCard.conceptDefinition ||
                firstCard.pcStatement || firstCard.frameworkSteps?.length ||
                firstCard.applications?.length || firstCard.pitfallItems?.length
            );
            return {
                ...baseSection,
                description: firstCard.description || section.description || '',
                voiceoverText: _fcHasStructure ? '' : (firstCard.voiceoverText || ''),
                keyFacts: firstCard.keyFacts || [],
                requirements: firstCard.requirements || [],
                positiveList: firstCard.positiveList || firstCard.doList || [],
                negativeList: firstCard.negativeList || firstCard.dontList || [],
                doList: firstCard.positiveList || firstCard.doList || [],
                dontList: firstCard.negativeList || firstCard.dontList || [],
                terminology: firstCard.terminology || [],
                keyTakeaway: firstCard.keyTakeaway || '',
                proTip: firstCard.proTip || '',
                keyInfo: firstCard.keyInfo || '',
                expertInsight: firstCard.expertInsight || '',
                cards: learningCards,
                image: topicImage,
                generated: !(needsCards && learningCards && learningCards.length > 0 && learningCards.every(c => c.failed)),
                generatedAt: Date.now()
            };
        };

        const allJobs = [];
        for (const topic of topics) {
            const sections = getSections(topic);
            for (const section of sections) {
                allJobs.push({ section, topic });
            }
        }

        ccLog('%c[CC v' + CC_VERSION + '] Parallel generation: ' + allJobs.length + ' sections with concurrency=' + CONCURRENCY_LIMIT, 'color: #8b5cf6; font-weight: bold;');

        const sectionResults = new Array(allJobs.length);
        let nextJob = 0;

        const runWorker = async () => {
            while (nextJob < allJobs.length) {
                const jobIndex = nextJob++;
                const job = allJobs[jobIndex];
                ccLog("generate: Generating section", currentPC + 1, "/", sectionCount, "-", job.section?.title);
                sectionResults[jobIndex] = await generateOneSection(job.section, job.topic, jobIndex);
                currentPC++;
                if (progressCallback) {
                    progressCallback({
                        current: currentPC,
                        total: sectionCount,
                        phase: 'Generating',
                        itemType: 'pc',
                        itemTitle: job.section.title
                    });
                }
            }
        };

        const workers = [];
        for (let w = 0; w < Math.min(CONCURRENCY_LIMIT, allJobs.length); w++) {
            workers.push(runWorker());
        }
        await Promise.all(workers);

        let jobIdx = 0;
        for (const topic of topics) {
            const sections = getSections(topic);
            const generatedSections = [];
            for (let s = 0; s < sections.length; s++) {
                generatedSections.push(sectionResults[jobIdx++]);
            }
            generatedTopics.push({
                ...topic,
                sections: generatedSections
            });
        }

        // Calculate total cards (with null-safe access)
        let totalCards = 0;
        generatedTopics.forEach(topic => {
            (topic.sections || []).forEach(section => {
                totalCards += (section.cards?.length || 0);
            });
        });


        return {
            ...plannedManifest,
            topics: generatedTopics,
            totalCards: totalCards,
            depthMode: depthMode,
            generationModel: 'route-cards-v9.15',
            locked: true,
            generatedAt: new Date().toISOString()
        };
    };


    /**
     * v7.8.7: Generate Full Topic Pack (5-Card Model Only)
     * Creates complete learning sequence: 5 cards only (no document generation)
     * All on ONE slide per topic
     * @param {Object} topic - Topic object
     * @param {Object} context - Scenario profile context
     * @param {number} cmid - Course module ID
     * @returns {Promise<Object>} { learningCards, fullSequence }
     */
    const generateFullTopicPack = async (topic, context, cmid) => {

        const learningCards = await generateFiveCardSequence(topic, context, cmid);


        return {
            learningCards,
            fullSequence: learningCards
        };
    };

    /**
     * FIX-CC-MULTILANG-TRANSLATE (v13.15): Translate already-generated primary-language
     * topics into a target language instead of re-generating from English source material.
     *
     * The previous approach called ManifestBuilder.build() with context.language='de-DE'
     * but supplied the same English topicPlan + English criteria, so the AI generated
     * English content regardless of the language instruction — the English input context
     * (12,000+ chars of TGA data, workplace docs, scenario seeds) overwhelmed the language
     * gate and the model defaulted to English output.
     *
     * This function deep-clones the primary topics and sends each section to the AI as a
     * focused translation task. Translation is far more reliable because the AI's entire
     * input is already English text — there is no competing English reference material to
     * pull output back to English.
     *
     * @param {Array}    primaryTopics - Already-generated primary language topics array
     * @param {string}   targetLang    - BCP-47 language code e.g. 'de-DE', 'fr-FR'
     * @param {string}   cmid          - Course module ID
     * @param {Function} onProgress    - Optional callback({current, total, itemLabel})
     * @returns {Promise<Array>} Translated topics (same structure, text values in target lang)
     */
    // v13.94.3: routeMode added. The callAI route argument below was hard-coded 'vet',
    // so every route's translation pass was attributed to VET server-side.
    const translateTopicsForLanguage = async (primaryTopics, targetLang, cmid, onProgress, routeMode) => {
        const langName = (typeof Prompts.getLanguageName === 'function')
            ? Prompts.getLanguageName(targetLang)
            : targetLang;

        ccLog('[CC-ML TRANSLATE] Starting translation | lang=' + targetLang + ' | langName=' + langName + ' | topics=' + (primaryTopics || []).length);

        const TRANSLATE_SYSTEM =
            'You are a professional translator specialising in workplace and vocational training content.\n' +
            'Translate all readable text string values from English to ' + langName + '.\n\n' +
            'STRICT RULES:\n' +
            '- Preserve ALL JSON field names (keys) exactly — do NOT translate them\n' +
            '- Preserve ALL numeric values, boolean values, and null values exactly\n' +
            '- Preserve ALL IDs (e.g. "1.1", "2.3", "topic_card_1") exactly — do NOT translate\n' +
            '- Preserve ALL cardType values (e.g. "hook-scenario", "mental-model", "applied-scenario", "performance-anchor") exactly\n' +
            '- Preserve ALL slideType values exactly\n' +
            '- Preserve ALL icon names (e.g. "alert-triangle", "check-circle", "users", "zap") exactly\n' +
            '- Preserve ALL color hex codes exactly\n' +
            '- Preserve ALL URL values exactly\n' +
            '- ONLY translate readable text a learner would see or hear (titles, descriptions, voiceoverText, context, steps, etc.)\n' +
            '- Adapt scenario names (Jake, Sarah, etc.) to culturally appropriate ' + langName + ' equivalents\n' +
            '- Keep WHS/workplace safety subject matter accurate — translate text, do not change facts\n' +
            '- Return ONLY valid JSON with exactly the same structure — no markdown fences, no explanation';

        // Deep-clone so we never mutate the primary topics
        const topics = JSON.parse(JSON.stringify(primaryTopics || []));

        // Collect all sections with translatable content (skip activity slides)
        const allEntries = [];
        topics.forEach(function (topic) {
            (topic.sections || []).forEach(function (section) {
                if (section.slideType !== 'activity') {
                    allEntries.push({ section: section });
                }
            });
        });

        ccLog('[CC-ML TRANSLATE] Sections to translate: ' + allEntries.length);

        let completed = 0;
        const total = allEntries.length;
        // v13.86: every failure path below used to log through a logger that is
        // SILENT in production, set no flag, surface nothing to onProgress and
        // return no error. A customer building a Spanish pack whose sections failed
        // to translate received an English pack and a success message. Failures are
        // now counted, marked on the section, and reported to the caller.
        const failures = [];

        const translateOne = async (entry) => {
            const section = entry.section;

            // Build lean copy — strip runtime voiceover fields so AI does not try to "translate" URLs
            const slim = JSON.parse(JSON.stringify(section));
            delete slim.voiceoverUrl;
            delete slim.voiceoverStatus;
            delete slim.voiceoverTextHash;
            delete slim.voiceoverWordCount;
            delete slim.voiceoverSchemaVersion;
            delete slim._preloadFallbackUrl;
            delete slim.generatedAt;

            const userPrompt =
                'Translate all readable text values in this training section from English to ' + langName + '.\n' +
                'Return ONLY the translated JSON object — no markdown fences, no explanation.\n\n' +
                JSON.stringify(slim);

            try {
                const rawResponse = await callAI(
                    { system: TRANSLATE_SYSTEM, user: userPrompt },
                    cmid,
                    'ml_translate_' + String(section.id || 'sec'),
                    0,
                    routeMode || 'vet',
                    targetLang,
                    // FIX-CC-SUBTOPIC-BILLING-KEY (v13.95.2): a translation pass is priced per
                    // subtopic per language, so it carries the subtopic's key and the vendor
                    // scopes the grant by language. Without it a retried translation would be
                    // charged again at the full per-subtopic rate.
                    section?.billingKey || ''
                );

                const cleaned = (rawResponse || '').replace(/```json/gi, '').replace(/```/g, '').trim();
                let translated = null;
                try {
                    translated = JSON.parse(cleaned);
                } catch (parseErr) {
                    ccWarn('[CC-ML TRANSLATE] JSON parse failed sec=' + section.id + ' - keeping English: ' + parseErr.message);
                }

                if (translated && typeof translated === 'object' && !Array.isArray(translated)) {
                    // Re-anchor structural identity and voiceover fields from original
                    translated.id = section.id;
                    translated.slideType = section.slideType;
                    translated.voiceoverUrl = section.voiceoverUrl;
                    translated.voiceoverStatus = section.voiceoverStatus;
                    translated.voiceoverTextHash = section.voiceoverTextHash;
                    translated.voiceoverWordCount = section.voiceoverWordCount;
                    translated.voiceoverSchemaVersion = section.voiceoverSchemaVersion;
                    // Write translated content into the cloned section
                    Object.assign(entry.section, translated);
                    ccLog('[CC-ML TRANSLATE] OK sec=' + section.id + ' → ' + langName);
                } else {
                    ccWarn('[CC-ML TRANSLATE] No valid JSON for sec=' + section.id + ' - English kept as fallback');
                    entry.section.translationFailed = true;
                    entry.section.translationFailedLang = targetLang;
                    failures.push(section.title || String(section.id));
                }
            } catch (e) {
                ccWarn('[CC-ML TRANSLATE] callAI error sec=' + section.id + ': ' + e.message + ' - English kept');
                entry.section.translationFailed = true;
                entry.section.translationFailedLang = targetLang;
                entry.section.translationFailedReason = e.message;
                failures.push(section.title || String(section.id));
            }

            completed++;
            if (onProgress) {
                onProgress({
                    current: completed,
                    total: total,
                    itemLabel: section.title || String(section.id),
                    // v13.86: the caller can now see a partial translation as it happens.
                    translationFailures: failures.length
                });
            }
        };

        // Process with concurrency limit of 3 (mirrors primary generation pattern)
        const _mlTrInFlight = [];
        let _mlTrIdx = 0;
        while (_mlTrIdx < allEntries.length) {
            while (_mlTrInFlight.length < 3 && _mlTrIdx < allEntries.length) {
                (function (_entry) {
                    const _p = translateOne(_entry).then(function () {
                        const _i = _mlTrInFlight.indexOf(_p);
                        if (_i >= 0) _mlTrInFlight.splice(_i, 1);
                    });
                    _mlTrInFlight.push(_p);
                })(allEntries[_mlTrIdx++]);
            }
            if (_mlTrInFlight.length >= 3) {
                await Promise.race(_mlTrInFlight.slice());
            }
        }
        await Promise.all(_mlTrInFlight);

        const translatedOk = total - failures.length;
        ccLog('[CC-ML TRANSLATE] Complete | lang=' + targetLang + ' | translated=' + translatedOk + '/' + total);

        // v13.86: a partial translation must not be reported as a success. The sections
        // are flagged above so the player and any export can see which ones fell back,
        // and the caller is told plainly so it can warn the author.
        if (failures.length) {
            ccError('[CC-ML TRANSLATE] ' + failures.length + ' of ' + total +
                ' section(s) could not be translated to ' + langName + ' and were left in English: ' +
                failures.slice(0, 5).join(', ') + (failures.length > 5 ? ', ...' : ''));
            if (onProgress) {
                onProgress({
                    current: total,
                    total: total,
                    itemLabel: '',
                    translationFailures: failures.length,
                    translationFailureTitles: failures.slice(0, 20),
                    translationLanguage: langName
                });
            }
        }
        return topics;
    };

    return {
        generate: generate,
        DEPTH_MODES: DEPTH_MODES,
        // v7.8.7: 5-Card Model exports only (document generation removed)
        generateFiveCardSequence: generateFiveCardSequence,
        generateFullTopicPack: generateFullTopicPack,
        // FIX-CC-MULTILANG-TRANSLATE (v13.15)
        translateTopicsForLanguage: translateTopicsForLanguage,
        // v13.75: exposed so the vendor-schema aliasing can be verified directly
        // against real API payloads. Not used by the plugin at runtime.
        normalizeCardSchema: normalizeCardSchema
    };
});
