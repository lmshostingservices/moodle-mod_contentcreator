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
define(['mod_contentcreator/prompts', 'mod_contentcreator/cc-state'], function(Prompts, CcState) {
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
        { pattern: /\bto ensure\b/gi, replace: "so you" },
        { pattern: /\bin order to\b/gi, replace: "so you can" },
        { pattern: /\bso that you can\b/gi, replace: "so you can" },
        { pattern: /\bto prevent\b/gi, replace: "so you don't" },
        { pattern: /\bto avoid\b/gi, replace: "so you don't" },
        { pattern: /\bto reduce\b/gi, replace: "so you cut down" },
        { pattern: /\bto minimise\b/gi, replace: "so you cut down" },
        { pattern: /\bto minimize\b/gi, replace: "so you cut down" },
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
        { pattern: /\bjourney\b/gi, replace: "process" },
        { pattern: /\blandscape\b/gi, replace: "environment" },
        { pattern: /\bleverage\b/gi, replace: "use" },
        { pattern: /\butilize\b/gi, replace: "use" },
        { pattern: /\butilise\b/gi, replace: "use" },
        { pattern: /\bfoster\b/gi, replace: "support" },
        { pattern: /\bholistic\b/gi, replace: "complete", academicSafe: true },
        { pattern: /\brobust\b/gi, replace: "strong" },
        { pattern: /\bsynergy\b/gi, replace: "cooperation" },
        { pattern: /\bparadigm\b/gi, replace: "approach", academicSafe: true },
        { pattern: /\bnavigate\b/gi, replace: "manage" },
        { pattern: /\brealm\b/gi, replace: "area" },
        { pattern: /\btapestry\b/gi, replace: "mix" },
        { pattern: /\bmultifaceted\b/gi, replace: "complex", academicSafe: true },
        { pattern: /\bnuanced\b/gi, replace: "detailed", academicSafe: true },
        { pattern: /\bpivotal\b/gi, replace: "important" },
        { pattern: /\bcutting-edge\b/gi, replace: "modern" },
        { pattern: /\bgame-changer\b/gi, replace: "improvement" },
        { pattern: /\bempower\b/gi, replace: "enable" },
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
        'ethics-considerations','case-study-1','case-study-2'
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
        const isAcademicMode = (mode === 'university');
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
        // VET-specific terms - AU uses single-l for base, double-l for suffixes
        'enroll': 'enrol', 'enrolls': 'enrols', 'enrollment': 'enrolment', 'enrollments': 'enrolments',
        'fulfill': 'fulfil', 'fulfills': 'fulfils', 'fulfillment': 'fulfilment', 'fulfillments': 'fulfilments',
        'skillful': 'skilful', 'skillfully': 'skilfully',
        'counseling': 'counselling', 'counselor': 'counsellor', 'counselors': 'counsellors', 'counseled': 'counselled',
        // Common -er  ->  -re
        'center': 'centre', 'centers': 'centres', 'centered': 'centred', 'centering': 'centring',
        'meter': 'metre', 'meters': 'metres',
        'theater': 'theatre', 'theaters': 'theatres',
        'fiber': 'fibre', 'fibers': 'fibres',
        'liter': 'litre', 'liters': 'litres',
        // Common -se/-ce
        'license': 'licence', 'licenses': 'licences',
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
                if (match[0] === match[0].toUpperCase()) {
                    return rule.au.charAt(0).toUpperCase() + rule.au.slice(1);
                }
                return rule.au;
            });
        }
        return result;
    };

    // v7.9.60: Recursively normalize all text in generated content
    // Only applies Australian spelling when language is 'en-AU'
    // v11.02: Also replaces em dashes ( - ) with spaced hyphens ( - ) globally.
    const normalizeContent = (obj, language = 'en-AU') => {
        if (!obj) return obj;
        if (typeof obj === 'string') {
            // v11.02 FIX-EM-DASH: ChatGPT loves em dashes  -  replace with spaced hyphens.
            let result = obj.replace(/\u2014/g, ' - ').replace(/ {2,}/g, ' ');
            if (language === 'en-AU') {
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

    const getExpectedCardOrder = (mode, activitiesEnabled) => {
        // v13.65: university has its own 6-card academic sequence and no decision-point.
        if (mode === 'university') {
            return UNIVERSITY_CARD_ORDER.slice();
        }
        // v10.27: unified 7-card flow for vet / workplace / pd
        var order = UNIFIED_CARD_ORDER.slice();
        // v11.11: When activities are disabled, exclude decision-point card
        if (activitiesEnabled === false) {
            order = order.filter(function(t) { return t !== 'decision-point'; });
        }
        return order;
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
            'skill-anchor','core-framework','application-guide','common-pitfalls'
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
                if (Array.isArray(card.sceneParts)) {
                    card.sceneParts = card.sceneParts.map(function(p) {
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
                            _sents97 = _sents97.map(function(s) { return s.trim(); }).filter(Boolean);
                            card.sceneParts = [];
                            for (var _pi97 = 0; _pi97 < 4; _pi97++) {
                                var _s97  = Math.floor(_pi97 * _sents97.length / 4);
                                var _e97  = Math.min(Math.floor((_pi97 + 1) * _sents97.length / 4), _sents97.length);
                                var _txt97 = _sents97.slice(_s97, Math.max(_s97 + 1, _e97)).join(' ').trim();
                                card.sceneParts.push({ title: _titles97[_pi97], icon: '', text: _txt97 || _sents97[Math.min(_pi97, _sents97.length - 1)] || '' });
                            }
                        }
                    }
                }
            }
            // v10.43: conceptInsights[] normalization for concept-explainer
            if (card.cardType === 'concept-explainer') {
                if (!card.conceptInsights && card.concept_insights) { card.conceptInsights = card.concept_insights; delete card.concept_insights; }
                if (!card.conceptInsights && card.insights && Array.isArray(card.insights)) { card.conceptInsights = card.insights; delete card.insights; }
                if (Array.isArray(card.conceptInsights)) {
                    card.conceptInsights = card.conceptInsights.map(function(i) {
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
                    card.steps = card.steps.map(function(s) {
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
                // normalise option fields: {text,feedback,correct/isCorrect}
                if (Array.isArray(card.options)) {
                    card.options = card.options.map(function(o) {
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
                        card.options.forEach(function(o, i) { o.correct = (i === correctIdx); });
                    }
                    delete card.correctOption;
                }
            }
            if (card.cardType === 'mistakes') {
                if (!card.items && card.mistakes) { card.items = card.mistakes.map(function(m) { return typeof m === 'string' ? { mistake: m } : m; }); delete card.mistakes; }
                if (!card.items && card.errorItems) { card.items = card.errorItems.map(function(e) { return { mistake: e.error || e.pitfall || '', consequence: e.consequence || '' }; }); }
                if (!card.items && card.pitfallItems) { card.items = card.pitfallItems.map(function(p) { return { mistake: p.pitfall || p.error || '', consequence: p.consequence || '' }; }); }
                // normalise item fields
                if (Array.isArray(card.items)) {
                    card.items = card.items.map(function(item) {
                        if (typeof item === 'string') return { mistake: item, consequence: '' };
                        return {
                            mistake: item.mistake || item.error || item.pitfall || '',
                            consequence: item.consequence || item.result || item.impact || ''
                        };
                    });
                }
            }
            if (card.cardType === 'competency-summary') {
                // v10.39: goodItems / badItems dual-column schema  -  normalise all AI field aliases
                const _toStrArray = function(arr) {
                    if (!Array.isArray(arr)) return [];
                    return arr.map(function(item) {
                        if (typeof item === 'string') return item.trim();
                        return (item.text || item.behaviour || item.criterion || item.item || '').trim();
                    }).filter(Boolean);
                };
                // goodItems aliases
                if (!card.goodItems) {
                    card.goodItems = card.good_items || card.dos || card.whatGoodLooksLike ||
                                     card.what_good_looks_like || card.positiveExamples || null;
                }
                if (card.goodItems) card.goodItems = _toStrArray(card.goodItems);
                // badItems aliases
                if (!card.badItems) {
                    card.badItems = card.bad_items || card.donts || card.whatToAvoid ||
                                    card.what_to_avoid || card.negativeExamples || null;
                }
                if (card.badItems) card.badItems = _toStrArray(card.badItems);
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
                const pollResp = await fetch(
                    ajaxUrl + '?action=poll_job&jobId=' + encodeURIComponent(jobId) +
                        '&sesskey=' + encodeURIComponent(sesskey) +
                        '&cmid=' + encodeURIComponent(cmid),
                    { method: 'GET' }
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
    const callAI = async (prompt, cmid, contentType, retryCount = 0, route = 'vet', language = 'en-AU') => {
        const MAX_RETRIES = 5;
        const BASE_DELAY_MS = 1000;
        const MAX_DELAY_MS = 32000;
        
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
                    return callAI(prompt, cmid, contentType, retryCount + 1, route, language);
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
                return callAI(prompt, cmid, contentType, retryCount + 1, route, language);
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
            const response = await fetch(imgUrl, {
                method: 'POST',
                body: formData
            });
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
    // The old scorer (scoreQualityGate + scoreAuditDefensibility + EQA)
    // was double-marking the prompt's output, triggering unnecessary retries
    // and hard failures on content that was perfectly usable.
    // This validator only blocks genuinely broken content:
    //   wrong card count, missing required fields, empty content/voiceover,
    //   broken decision-point structure, mental-model with <3 steps.
    // ===================================================================
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
        // v11.11 parity: with activities disabled the decision-point card is dropped.
        if (genMode !== 'university' && context && context.activitiesEnabled === false) {
            expectedCount = expectedCount - 1;
        }
        if (cards.length !== expectedCount) {
            issues.push('Expected ' + expectedCount + ' cards, got ' + cards.length);
        }
        // Per-card structure
        cards.forEach(function(card, i) {
            var prefix = 'Card ' + (i + 1) + ' (' + (card.cardType || 'unknown') + ')';
            if (!card.cardType) { issues.push(prefix + ': missing cardType'); }
            if (!card.title)    { issues.push(prefix + ': missing title'); }
            // decision-point specific
            if (card.cardType === 'decision-point') {
                if (!card.question) { issues.push(prefix + ': missing question'); }
                if (!card.options || card.options.length < 2) { issues.push(prefix + ': must have at least 2 options'); }
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
                    card.content || card.bodyText || card.context || card.conceptDefinition
                );
                if ((!vo || String(vo).length < 30) && !hasStructuralContent) {
                    issues.push(prefix + ': missing or too-short voiceover');
                }
            }
        });
        return { valid: issues.length === 0, issues: issues };
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
                        if (currentMode !== 'university') {
                            const countryCode = context?.country || context?.countryCode || 'AU';
                            const stateCode = context?.state || '';
                            const legislationBlock = Prompts.Legislation.buildPromptInjection(countryCode, stateCode, 'content');
                            if (legislationBlock) {
                                systemPrompt += '\n' + legislationBlock;
                            }
                            // v13.13: Skip spelling for non-English — "MANDATORY Australian English
                            // spelling, non-negotiable" directly conflicts with "write in German/Spanish/etc."
                            if (!isNonEnglish) {
                                const spellingBlock = Prompts.getSpellingInstructions(countryCode);
                                if (spellingBlock) {
                                    systemPrompt += '\n' + spellingBlock;
                                }
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
                    // getLangPrefixForUserPrompt: explicit belt-and-suspenders call so the
                    // mandatory language gate is present even if buildFiveCardUserPrompt
                    // is updated to drop its internal prefix in a future refactor.
                    const _langGate = (typeof Prompts.getLangPrefixForUserPrompt === 'function')
                        ? Prompts.getLangPrefixForUserPrompt(context)
                        : '';
                    prompt = {
                        system: systemPrompt,
                        user: _langGate + Prompts.buildFiveCardUserPrompt(context, topic)
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
                const rawResponse = await callAI(prompt, cmid, contentType, 0, context?.mode || 'vet', context?.language || 'en-AU'); // v11.42: pass route | v12.99 FIX-CC-LANG-EXPLICIT: pass language
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
                const fixedCards = Prompts.normalizeCards(localFixed, context);
                ccLog('%c[LOCAL FIX] OK Local fixes + normalizeCards applied (banned phrases, verb ladder, voiceover, markdown, slang, field objects)', 'color: #a855f7;');
                
                // ===============================================================
                // v11.73: VALIDITY GATE (replaces dual scoring system)
                // Only checks structure  -  prompt already guarantees quality.
                // ===============================================================
                ccLog('%c[VALIDITY GATE] ============================================', 'color: #10b981; font-weight: bold;');
                const validation = validateCards(fixedCards, context);
                ccLog('%c[VALIDITY GATE] ' + (validation.valid ? 'OK PASSED  -  structure valid' : 'x FAILED  -  ' + validation.issues.length + ' issue(s)'),
                    'background: ' + (validation.valid ? '#22c55e' : '#ef4444') + '; color: white; font-weight: bold; padding: 4px 12px; border-radius: 6px;');

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
                        qualityAction: 'VALIDITY_GATE_PASS'
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
                lastIssues.forEach(function(issue, i) { ccLog('%c  ' + (i + 1) + '. ' + issue, 'color: #ef4444;'); });
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
        ccError('[VALIDITY GATE] All attempts exhausted  -  structural issues remain. Returning failed sequence to force redo.');
        const failReason = 'Structural validation failed after ' + MAX_ATTEMPTS + ' attempt(s): ' + lastIssues.join('; ');
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
                const options = letters.map(function(L) {
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
            plannedManifest.topics.forEach(function(t, i) {
                var secs = t.sections || t.subtopics || [];
                ccDiag('  Topic ' + (i+1) + ': "' + (t.title || t.name || 'UNTITLED') + '" | sections=' + secs.length);
                secs.forEach(function(s, j) {
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

        const generateOneSection = async (section, topic, jobIdx) => {
            const existingSection = regenerateFailedOnly ? findExistingSection(section.id, topic.id) : null;

            const expectedCardCount = getExpectedCardOrder(plannedManifest.context?.mode || 'vet', activitiesEnabled).length;
            const needsCards = !(regenerateFailedOnly && existingSection?.cards && existingSection.cards.length >= expectedCardCount && !existingSection.cards.some(c => c.failed));
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
                } else {
                    ccDiag('generate() Launching card generation for section "' + (section?.title || 'UNTITLED') + '"');
                    try {
                        const cards = await generateFiveCardSequence(section, plannedManifest.context, cmid);
                        ccDiag('generate() Cards COMPLETED for "' + (section?.title || '') + '" | cards=' + (cards?.length || 0) + ' | failed=' + (cards?.some(c => c.failed) || false));
                        learningCards = cards;
                    } catch (err) {
                        ccError('generate() Cards FAILED for "' + (section?.title || '') + '": ' + err.message);
                        learningCards = getFailedCardSequence(section, plannedManifest.context?.mode || 'vet', err.message, activitiesEnabled);
                    }
                }
            } else {
                ccDiag('generate() SKIPPING cards for "' + (section?.title || '') + '" (already generated)');
            }

            if (needsImage) {
                // Build a richer image context from the actual generated (or existing) card content.
                // v10.27: Use hook-scenario card (card[0]) content as scenarioContext so the image
                // depicts the actual job story, not just a generic description.
                const imageFirstCard = learningCards?.[0] || existingSection?.cards?.[0] || {};
                // For unified 7-card format, hook-scenario content is in card.content
                // For legacy format, it's in card.description
                const scenarioContent = imageFirstCard.content || imageFirstCard.description || '';
                const scenarioTitle   = imageFirstCard.title || '';
                const scenarioContext = scenarioTitle ? (scenarioTitle + '. ' + scenarioContent).trim() : scenarioContent;
                const enrichedSection = {
                    ...section,
                    description:     imageFirstCard.description || imageFirstCard.content || section.description || '',
                    keyPoints:       (imageFirstCard.requirements || imageFirstCard.keyPoints || section.keyPoints || []).slice(0, 3),
                    route:           plannedManifest.context?.mode || section.route || 'vet',
                    scenarioContext: scenarioContext.substring(0, 600),
                };
                ccDiag('generate() Launching image generation for section "' + (section?.title || 'UNTITLED') + '" | enriched desc=' + (enrichedSection.description || '').substring(0, 80));
                try {
                    const img = await generateTopicImage(enrichedSection, plannedManifest.context, cmid);
                    ccDiag('generate() Image COMPLETED for "' + (section?.title || '') + '" | hasImage=' + !!img);
                    topicImage = img;
                } catch (err) {
                    ccError('generate() Image FAILED for "' + (section?.title || '') + '": ' + err.message);
                    topicImage = null;
                }
            } else if (imageGenEnabled) {
                ccDiag('generate() SKIPPING image for "' + (section?.title || '') + '" (already exists)');
            } else {
                ccDiag('generate() Images DISABLED for this generation');
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
    const translateTopicsForLanguage = async (primaryTopics, targetLang, cmid, onProgress) => {
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
        topics.forEach(function(topic) {
            (topic.sections || []).forEach(function(section) {
                if (section.slideType !== 'activity') {
                    allEntries.push({ section: section });
                }
            });
        });

        ccLog('[CC-ML TRANSLATE] Sections to translate: ' + allEntries.length);

        let completed = 0;
        const total = allEntries.length;

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
                    'vet',
                    targetLang
                );

                const cleaned = (rawResponse || '').replace(/```json/gi, '').replace(/```/g, '').trim();
                let translated = null;
                try {
                    translated = JSON.parse(cleaned);
                } catch (parseErr) {
                    ccLog('[CC-ML TRANSLATE] JSON parse failed sec=' + section.id + ' — keeping English: ' + parseErr.message);
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
                    ccLog('[CC-ML TRANSLATE] No valid JSON for sec=' + section.id + ' — English kept as fallback');
                }
            } catch (e) {
                ccLog('[CC-ML TRANSLATE] callAI error sec=' + section.id + ': ' + e.message + ' — English kept');
            }

            completed++;
            if (onProgress) onProgress({ current: completed, total: total, itemLabel: section.title || String(section.id) });
        };

        // Process with concurrency limit of 3 (mirrors primary generation pattern)
        const _mlTrInFlight = [];
        let _mlTrIdx = 0;
        while (_mlTrIdx < allEntries.length) {
            while (_mlTrInFlight.length < 3 && _mlTrIdx < allEntries.length) {
                (function(_entry) {
                    const _p = translateOne(_entry).then(function() {
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

        ccLog('[CC-ML TRANSLATE] Complete | lang=' + targetLang + ' | translated=' + completed + '/' + total);
        return topics;
    };

    return {
        generate: generate,
        DEPTH_MODES: DEPTH_MODES,
        // v7.8.7: 5-Card Model exports only (document generation removed)
        generateFiveCardSequence: generateFiveCardSequence,
        generateFullTopicPack: generateFullTopicPack,
        // FIX-CC-MULTILANG-TRANSLATE (v13.15)
        translateTopicsForLanguage: translateTopicsForLanguage
    };
});
