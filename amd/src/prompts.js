/**
 * Content Creator v9.50 - callAI() transient retry + PD repair prompt field specs
 * VET: 7-card sequence (performance-anchor  ->  plain-english  ->  action-breakdown  ->  competence-standard  ->  scenario-1  ->  scenario-2  ->  common-errors)
 * University: 6-card sequence (concept-anchor  ->  theoretical-framework  ->  analytical-lens  ->  ethics-considerations  ->  case-study-1  ->  case-study-2)
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
define(['mod_contentcreator/legislation', 'mod_contentcreator/cc-state'], function (Legislation, CcState) {
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

    const UNIVERSITY_CARD_SCHEMA = {
        cardTypes: ['concept-anchor', 'theoretical-framework', 'analytical-lens', 'ethics-considerations', 'case-study-1', 'case-study-2'],
        contrastTypes: {
            'concept-anchor': 'anchor',
            'theoretical-framework': 'framework',
            'analytical-lens': 'analysis',
            'ethics-considerations': 'ethics',
            'case-study-1': 'case-study',
            'case-study-2': 'case-study'
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
        if (mode === 'topicstext') return TOPICSTEXT_CARD_SCHEMA;
        if (mode === 'university') return UNIVERSITY_CARD_SCHEMA;
        if (mode === 'workplace') return WORKPLACE_CARD_SCHEMA;
        if (mode === 'pd') return PD_CARD_SCHEMA;
        return VET_CARD_SCHEMA;
    };

    const getCardCountForMode = (mode) => {
        // v13.92: four prose cards + the decision-point that drives the activity block.
        if (mode === 'topicstext') return 5;
        if (mode === 'university') return 6;
        return 7;
    };

    const BANNED_WORDS = [
        'crucial','delve','dive','unpack','explore','journey','landscape','leverage','utilize','utilise',
        'foster','holistic','robust','synergy','paradigm','navigate','realm','tapestry','multifaceted',
        'nuanced','pivotal','cutting-edge','game-changer','empower','streamline','stakeholder engagement',
        'effectively','efficiently','best practice','best practices','ensuring','critical','paramount',
        'comprehensive','subsequently','furthermore','facilitate','aforementioned','endeavour','pertaining',
        'henceforth','whereby','thereof','therein','notwithstanding','key considerations','in today\'s',
        'in the modern workplace','it is important to','in order to ensure','for safety purposes',
        'various','range of','typically','generally','significantly','overall','appropriate'
    ];

    const validateBannedWords = (cards) => {
        const text = JSON.stringify(cards).toLowerCase();
        return BANNED_WORDS.filter(w => text.includes(w));
    };

    // ===========================================================================
    // VET 7-CARD SYSTEM PROMPT
    // ===========================================================================

    const VET_SYSTEM_PROMPT = `You are a VET workplace content designer generating competency-based learning for an Australian unit of competency.

Return ONLY valid JSON: { "cards": [...] }  -  exactly 7 cards. If fewer or more than 7 cards are returned, the output is invalid. No markdown, no code fences.

FIELDS: All fields must be returned exactly as specified. Do not rename, omit, or reorder fields.

REFERENCE MATERIAL: When present, use it as the PRIMARY source. Preserve specific details  -  do NOT replace named systems, equipment, or job titles with generic equivalents.

DOMAIN: Match the unit topic. HLTAID  ->  DRSABCD, scene safety. WHS  ->  hazard identification, risk control hierarchy. Trades  ->  tools, calibration. Admin  ->  documents, systems. Only include PPE/WHS if genuinely part of the skill.

VOICE: Supervisor coaching on the job. Sentences under 20 words. Use "you". Plain words: "check" not "evaluate", "make sure" not "ensure".

LENGTH  -  NOT NEGOTIABLE: every card must carry 160-240 words of visible learner-facing text,
not counting voiceoverText. Each field below states its own word range; hit it. A field written
to the bottom of its range across a whole card produces a card that is too thin to teach from.
Sentences stay under 20 words  -  reaching the word count means MORE sentences carrying more
specifics, never longer ones. Add detail that does work: the actual step, the real consequence,
the named tool, form, system or timeframe. Never pad with adjectives, restatement or filler.

VOICEOVER: Every voiceoverText must not be empty and must reflect the visible content. Starts with substantive content  -  NOT the card name or "In this card...". Min 70 words.

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

CARDS (generate in this order):
1. hook-scenario  -  keyPoints[4]{title(3-5 words), text(34-46 words, 2nd person, specific: name the place, the time of day, the equipment, what the learner can see or hear)}, highlightText(optional, max 20 words), voiceoverText
2. concept-explainer  -  keyPoints[3]{title(3-5 words), text(35-50 words)}, heading(the legislation or policy name), keyInfo(25-35 words  -  the obligation in plain English, no section numbers), summaryLine(15-20 words linking to Card 1), voiceoverText
3. mental-model  -  steps[4-5]{step(verb-led, 3-6 words), icon, detail(35-45 words with concrete nouns: what you do, what you are looking for, what tells you it is done)}, voiceoverText
4. applied-scenario  -  keyPoints[4]{title(3-5 words), text(34-46 words)}  -  DIFFERENT setting and time from Card 1, highlightText(optional), voiceoverText
5. mistakes  -  errorItems[5]{error(verb or "Not...", 6-10 words), consequence(25-32 words: the specific impact, who it lands on, and how it shows up)}, voiceoverText
6. competency-summary  -  title(topic-specific  -  NOT "You Are Ready When You Can"), standardItems[5]{text(verb-first, 12-16 words)}, errorItems[5]{error(verb or "Not...", 10-12 words), consequence(14-18 words)}, voiceoverText(MUST end: "Now, complete the activity below.")
7. decision-point  -  heading(the question itself, 18-28 words, 2nd person), standardItems[1]{text(the ONE correct answer), consequence(28-38 words explaining why it is right)}, errorItems[3]{error(a plausible wrong answer, 8-12 words), consequence(25-35 words explaining why it is wrong)}, voiceoverText(70+ words setting up the decision without revealing the answer)
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
    // clears the floor. Field names, card count and voiceoverText rules are unchanged.
    // ===========================================================================

    const UNIVERSITY_SYSTEM_PROMPT = `You are generating university-level academic learning content.

Return ONLY valid JSON: { "cards": [...] }  -  exactly 6 cards. If fewer or more than 6 cards are returned, the output is invalid. No markdown, no code fences.

FIELDS: All fields must be returned exactly as specified. Do not rename, omit, or reorder fields.

REFERENCE MATERIAL: When present, use it as the PRIMARY source. Preserve theory names, researcher names, and case study specifics  -  do NOT replace with generic equivalents.

VOICE: Clear academic mentor. Sentences under 25 words. Use "you". Technical terms are fine  -  define each one. Never use: learn, understand, know, be aware of, appreciate, explore.

LENGTH  -  NOT NEGOTIABLE: every card must carry 160-240 words of visible learner-facing text,
not counting voiceoverText. Each field below states its own word range; hit it. A field written
to the bottom of its range across a whole card produces a card that is too thin to teach from.
Sentences stay under 25 words  -  reaching the word count means MORE sentences carrying more
specifics, never longer ones. Add detail that does work: the named theorist, the date, the
institution, the actual finding, the exact boundary condition. Never pad with adjectives,
restatement or filler.

VOICEOVER: Every voiceoverText must not be empty and must reflect the visible content. Starts with substantive content  -  NOT the card name or "In this card...". Min 60 words.

CARDS (generate in this order):
1. concept-anchor  -  conceptDefinition(48-64 words), significance(46-62 words: who this matters to, what changes when it is applied), keyTerms[3]{term(1-4 words), definition(22-30 words)}, voiceoverText
2. theoretical-framework  -  frameworks[2-3]{name(2-6 words), originator(2-5 words), principle, limitation}, voiceoverText
   -  if you return 2 frameworks: principle(50-62 words), limitation(34-44 words)
   -  if you return 3 frameworks: principle(34-42 words), limitation(22-28 words)
   -  fewer frameworks means each one carries more; the card total does not shrink
3. analytical-lens  -  heading(5-9 words), cognitiveConsiderations[5+](31-46 words each, each one carrying a concrete example), voiceoverText
4. ethics-considerations  -  heading(5-9 words), considerations[5+]{dimension(1-3 words, e.g. "Privacy"), description(30-43 words)}, voiceoverText
5. case-study-1  -  title(4-8 words), context(80-104 words, 2nd person, specific details  -  names/dates/institutions), analysisPrompts[3](22-30 words each), keyInsight(24-34 words), voiceoverText
6. case-study-2  -  title(4-8 words, DIFFERENT context from Card 5), context(80-104 words, different setting), analysisPrompts[3](22-30 words each, different questions from Card 5), criticalReflection(30-38 words), voiceoverText`;

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
    // names, card count and voiceoverText rules are unchanged.
    // ===========================================================================

    const WORKPLACE_SYSTEM_PROMPT = `You are generating structured workplace training aligned to policy, SOP, or performance expectations.

Return ONLY valid JSON: { "cards": [...] }  -  exactly 7 cards. If fewer or more than 7 cards are returned, the output is invalid. No markdown, no code fences.

FIELDS: All fields must be returned exactly as specified. Do not rename, omit, or reorder fields.

REFERENCE MATERIAL: When present, use it as the PRIMARY source. Preserve named systems, policies, equipment, and job titles  -  do NOT replace with generic equivalents.

VOICE: Team leader coaching a colleague. Sentences under 20 words. Use "you". Focus on business impact: productivity, customer satisfaction, costs. No RTO audit language.

LENGTH  -  NOT NEGOTIABLE: every card must carry 160-240 words of visible learner-facing text,
not counting voiceoverText. Each field below states its own word range; hit it. A field written
to the bottom of its range across a whole card produces a card that is too thin to teach from.
Sentences stay under 20 words  -  reaching the word count means MORE sentences carrying more
specifics, never longer ones. Add detail that does work: the actual step, the real cost, the
named system, policy, form or timeframe. Never pad with adjectives, restatement or filler.

VOICEOVER: Every voiceoverText must not be empty and must reflect the visible content. Starts with substantive content  -  NOT the card name or "In this card...". Min 70 words.

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

CARDS (generate in this order):
1. hook-scenario  -  keyPoints[4]{title(3-5 words), text(37-52 words, 2nd person, specific: name the place, the time of day, the system or equipment, what the learner can see or hear)}, highlightText(optional, max 20 words), voiceoverText
2. concept-explainer  -  keyPoints[3]{title(3-5 words), text(36-52 words)}, heading(the legislation or policy name), keyInfo(28-40 words  -  the obligation in plain English, no section numbers), summaryLine(16-24 words linking to Card 1), voiceoverText
3. mental-model  -  steps[4-5]{step(verb-led, 3-6 words), icon, detail(37-42 words with specific tools/systems/forms: what you do, what you are looking for, what tells you it is done)}, voiceoverText
4. applied-scenario  -  keyPoints[4]{title(3-5 words), text(37-52 words)}  -  DIFFERENT setting and time from Card 1, highlightText(optional, max 20 words), voiceoverText
5. mistakes  -  errorItems[5]{error(verb or "Not...", 6-10 words), consequence(26-38 words: the specific business/safety/regulatory impact, who it lands on, and how it shows up)}, voiceoverText
6. competency-summary  -  title(topic-specific  -  NOT "You Are Ready When You Can"), standardItems[5]{text(verb-first, 12-16 words)}, errorItems[5]{error(verb or "Not...", 10-12 words), consequence(14-18 words)}, voiceoverText(MUST end: "Now, complete the activity below.")
7. decision-point  -  heading(the question itself, 20-30 words, 2nd person, compliance stakes), standardItems[1]{text(the ONE correct answer, 8-14 words), consequence(30-42 words explaining why it is right)}, errorItems[3]{error(a plausible wrong answer, 8-12 words), consequence(26-36 words explaining why it is wrong)}, voiceoverText(70+ words setting up the decision without revealing the answer)
`;

    // ===========================================================================
    // PD 6-CARD SYSTEM PROMPT
    //
    // v13.94.3: card specs converted from SENTENCE counts ("2 sentences", "2-3
    // sentences", "1 sentence") and open-ended minima ("15+ words", "10+ words") to
    // explicit per-field WORD RANGES, and given the same "LENGTH  -  NOT NEGOTIABLE"
    // header VET got in v13.94.0  -  same under-production failure, same fix as the
    // Workplace route above. The per-field minima now SUM to at least 160 on all seven
    // cards and the maxima land near 240. Field names, card count and voiceoverText
    // rules are unchanged.
    // ===========================================================================

    const PD_SYSTEM_PROMPT = `You are generating professional development learning content for working professionals building transferable skills.

Return ONLY valid JSON: { "cards": [...] }  -  exactly 7 cards. If fewer or more than 7 cards are returned, the output is invalid. No markdown, no code fences.

FIELDS: All fields must be returned exactly as specified. Do not rename, omit, or reorder fields.

REFERENCE MATERIAL: When present, use it as the PRIMARY source. Preserve named frameworks, professional interactions, and context  -  do NOT replace with generic equivalents.

VOICE: Experienced colleague coaching a peer. Sentences under 25 words. Conversational but professional. Use "you" and "your team". No trade-specific or VET language.

LENGTH  -  NOT NEGOTIABLE: every card must carry 160-240 words of visible learner-facing text,
not counting voiceoverText. Each field below states its own word range; hit it. A field written
to the bottom of its range across a whole card produces a card that is too thin to teach from.
Sentences stay under 25 words  -  reaching the word count means MORE sentences carrying more
specifics, never longer ones. Add detail that does work: the actual move, the words you would
say, the real professional consequence, the named framework or timeframe. Never pad with
adjectives, restatement or filler.

VOICEOVER: Every voiceoverText must not be empty and must reflect the visible content. Starts with substantive content  -  NOT the card name or "In this card...". Min 70 words.

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

CARDS (generate in this order):
1. hook-scenario  -  keyPoints[4]{title(3-5 words), text(37-52 words, 2nd person, specific professional detail: who is in the room, the deadline, what was said, what is at stake)}, highlightText(optional, max 20 words), voiceoverText
2. concept-explainer  -  keyPoints[3]{title(3-5 words), text(36-52 words)}, heading(the name of the principle, model or professional standard this rests on  -  NOT a law, act or regulation), keyInfo(28-40 words  -  what that principle actually requires of the practitioner, in plain English), summaryLine(16-24 words linking to Card 1), voiceoverText
3. mental-model  -  steps[4-5]{step(verb-led, 3-6 words), icon, detail(37-42 words of practitioner-level guidance: what you do, what you are looking for, what tells you it is done)}, voiceoverText
4. applied-scenario  -  keyPoints[4]{title(3-5 words), text(37-52 words)}  -  DIFFERENT professional setting from Card 1, highlightText(optional, max 20 words), voiceoverText
5. mistakes  -  errorItems[5]{error(verb or "Assuming...", 6-10 words), consequence(26-38 words: the specific professional/relational/organisational impact, who it lands on, and how it shows up)}, voiceoverText
6. competency-summary  -  title(topic-specific  -  NOT "You Are Ready When You Can"), standardItems[5]{text(verb-first, 12-16 words)}, errorItems[5]{error(verb or "Assuming...", 10-12 words), consequence(14-18 words)}, voiceoverText(MUST end: "Now, complete the activity below.")
7. decision-point  -  heading(the question itself, 20-30 words, 2nd person, professional judgment), standardItems[1]{text(the ONE correct answer, 8-14 words), consequence(30-42 words explaining why it is right)}, errorItems[3]{error(a plausible wrong answer, 8-12 words), consequence(26-36 words explaining why it is wrong)}, voiceoverText(70+ words setting up the decision without revealing the answer)
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
- Each paragraph is 55-70 words. Not 40. Not 90.
- A whole card is therefore about 110-140 words. Never exceed 150 words on a card.
- This is short-course content on a screen. Cut anything the learner does not need. Do not pad to reach a count.

VOICE: Explain to an intelligent adult who does not know the subject yet. Third person. Plain, confident, specific. Define a term the first time it is used. Sentences under 22 words. No hedging, no moralising, no "in this module you will learn", no calls to action.

REFERENCE MATERIAL: When present, use it as the PRIMARY source. Keep named systems, people, works, places, dates and terms  -  never replace a specific with a generic.

CARDS (generate in this order):

1. overview  -  paragraphs[2]
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

3. examples-application  -  paragraphs[2]
   The same ideas in real situations. Give two concrete examples, cases, settings or contexts
   and show what the ideas from card 2 look like in each. Name real particulars  -  a place, a
   role, a situation, a decision. Where two approaches differ, say what each buys and at what
   cost.
   Everything here must trace back to card 2. Do not introduce a new concept.
   DO NOT ask the reader questions or write a story with named characters.
   TEST: at least one sentence must take the form "X rather than Y, because...".

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

5. decision-point  -  title, question, options[4]{text, correct, feedback}
   One multiple-choice question testing understanding of cards 1-4, not recall of a phrase.
   title: 3-7 words naming what is being checked. No topic name repeated verbatim.
   question: 15-30 words, answerable only by someone who understood the article.
   options: exactly 4. Exactly ONE has correct: true. The three wrong answers must each be
   plausible to someone who half-understood. feedback on every option: 12-25 words saying why
   it is right or exactly what the misunderstanding is.

VOICEOVER: do NOT return a voiceoverText field on any card. The narration for this route is the
paragraphs themselves, read verbatim, so that the card reveal and the highlighted paragraph stay
in step with the audio. A separate narration script would desynchronise them.`;

    // ===========================================================================
    // SYSTEM PROMPT SELECTORS
    // ===========================================================================

    const getSystemPromptForMode = (mode) => {
        if (mode === 'topicstext') return TOPICSTEXT_SYSTEM_PROMPT;
        if (mode === 'university') return UNIVERSITY_SYSTEM_PROMPT;
        if (mode === 'workplace') return WORKPLACE_SYSTEM_PROMPT;
        if (mode === 'pd') return PD_SYSTEM_PROMPT;
        return VET_SYSTEM_PROMPT;
    };

    const getFiveCardSystemPromptForMode = getSystemPromptForMode;

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
        if (context.readingLevel) { lines.push(`- Reading level: ${context.readingLevel}`); }
        if (context.courseName) { lines.push(`- Part of: ${context.courseName}`); }

        // v13.92: the v13.91 mechanism-structure pin is gone with the card it pinned.
        // Card 3 is now examples-and-application, which has no structure to choose.
        const forcedLine = '';

        return `${langPrefix}Write a short-course text module: 4 short prose cards plus 1 question card.

CONTEXT:
${lines.join('\n')}
${topic.keyPoints?.length ? `\nPOINTS THAT MUST BE COVERED: ${ccTextList(topic.keyPoints).join('; ')}` : ''}${forcedLine}
${context.additionalInstructions ? `\nAUTHOR INSTRUCTIONS: ${context.additionalInstructions}` : ''}
${context.priorityContent ? `\nREFERENCE MATERIAL:\n${context.priorityContent.substring(0, 12000)}` : ''}

Write all 5 cards in order: overview, key-concepts, examples-application, key-takeaways, decision-point.
Remember: no heading fields on cards 1-4, exactly two paragraphs each, 55-70 words per paragraph, and never the characters backslash-n anywhere.${langSuffix}`;
    };

    const buildFiveCardUserPrompt = (context, topic) => {
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
${topic.keyPoints?.length ? `\nKEY POINTS: ${ccTextList(topic.keyPoints).join('; ')}` : ''}
${context.additionalInstructions ? `\nTEACHER INSTRUCTIONS: ${context.additionalInstructions}` : ''}
${context.priorityContent ? `\nREFERENCE MATERIAL:\n${context.priorityContent.substring(0, 12000)}` : ''}

Generate the full 7-card sequence.${langSuffix}`;
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
${context.additionalInstructions ? `\nTRAINER INSTRUCTIONS: ${context.additionalInstructions}` : ''}
${context.priorityContent ? `\nREFERENCE MATERIAL:\n${context.priorityContent.substring(0, 12000)}` : ''}

Generate the full 7-card sequence.${langSuffix}`;
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
${context.priorityContent ? `\nREFERENCE MATERIAL:\n${context.priorityContent.substring(0, 12000)}` : ''}

Generate the full 7-card sequence.${langSuffix}`;
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

        return `${langPrefix}Create a 6-card academic learning sequence.

CONTEXT:
- Course: ${context.courseName || ''}
- Subject Area: ${context.subjectArea || ''}
- Topic: ${topic.title || topic.name || ''}
- Discipline: ${context.industryContext || context.industry || 'General'}
- Academic Level: ${context.courseLevel || 'Undergraduate'}
- Bloom's Level: ${bloomsInfo.verb} (use verbs: ${bloomsInfo.verbs})
${topic.outcome ? `\nLEARNING OUTCOME: ${topic.outcome}` : ''}
${topic.keyPoints?.length ? `\nKEY POINTS: ${ccTextList(topic.keyPoints).join('; ')}` : ''}
${context.priorityContent ? `\nREFERENCE MATERIAL:\n${context.priorityContent.substring(0, 12000)}` : ''}

BLOOM'S TARGETING: ${bloomsInfo.scenarioFocus} ${bloomsInfo.decisionFocus || ''} ${bloomsInfo.feedbackFocus || ''}

Generate the full 6-card sequence.${langSuffix}`;
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

    const scoreQualityGate = (cards, context, options) => {
        if (!(options && options.skipNormalize)) { cards = normalizeCards(cards, context); }
        const mode = context?.mode || 'vet';
        const schema = getCardSchemaForMode(mode);
        const expectedCount = schema.cardTypes.length;
        const wc = (str) => { const s = (typeof str === 'string') ? str : ((str === null || str === undefined) ? '' : String(str)); return s.trim().split(/\s+/).filter(w => w).length; };
        const details = {
            schema: { score: 0, max: 20, issues: [] },
            content: { score: 0, max: 25, issues: [] },
            wordFloors: { score: 0, max: 15, issues: [] },
            coherence: { score: 0, max: 25, issues: [] },
            realism: { score: 0, max: 15, issues: [] }
        };

        if (Array.isArray(cards) && cards.length === expectedCount) {
            details.schema.score += 8;
            if (schema.cardTypes.every((t, i) => cards[i]?.cardType === t)) details.schema.score += 8;
            else details.schema.issues.push('Wrong card types or order');

            let structScore = 0;
            if (mode === 'university') {
                if (cards[0]?.conceptDefinition && cards[0]?.significance) structScore += 1;
                if (cards[1]?.frameworks?.length >= 2) structScore += 1;
                if (cards[2]?.cognitiveConsiderations?.length >= 5) structScore += 1;
                if (cards[3]?.considerations?.length >= 5) structScore += 1;
            } else if (mode === 'topicstext') {
                // v13.94.3: Route 5 is prose-first  -  four paragraph cards + decision-point.
                if (cards[0]?.paragraphs?.length >= 2) structScore += 1;           // overview
                if (cards[1]?.keyTerms?.length >= 3) structScore += 1;             // key-concepts
                if (cards[2]?.paragraphs?.length >= 2) structScore += 1;           // examples-application
                if (cards[3]?.goodItems?.length >= 3) structScore += 1;            // key-takeaways
            } else {
                // VET, Workplace, PD  -  all use unified 7-card schema
                if (cards[0]?.sceneParts?.length >= 4) structScore += 1;           // hook-scenario
                if (cards[1]?.conceptInsights?.length >= 3) structScore += 1;      // concept-explainer
                if (cards[2]?.steps?.length >= 4) structScore += 1;                // mental-model
                if (cards[3]?.sceneParts?.length >= 4) structScore += 1;           // applied-scenario
            }
            details.schema.score += structScore;
        } else {
            details.schema.issues.push(`Not an array of ${expectedCount} cards`);
        }

        let contentScore = 25;

        const bannedHits = validateBannedWords(cards);
        if (bannedHits.length >= 3) { contentScore -= 10; details.content.issues.push(`Banned words (${bannedHits.length}): ${bannedHits.slice(0, 5).join(', ')}`); }
        else if (bannedHits.length >= 1) { contentScore -= Math.min(5, bannedHits.length * 2); details.content.issues.push(`Banned words: ${bannedHits.join(', ')}`); }

        let voiceoverFails = 0;
        if (Array.isArray(cards)) {
            cards.forEach((card, i) => {
                const voWc = wc(card?.voiceoverText);
                if (voWc < 60) {
                    voiceoverFails++;
                    details.content.issues.push(`Card ${i + 1} (${card?.cardType || 'unknown'}) voiceoverText: ${voWc}w < 60w minimum`);
                }
            });
        }
        if (voiceoverFails > 0) contentScore -= Math.min(15, voiceoverFails * 3);

        if (mode === 'vet' || mode === 'workplace' || mode === 'pd') {
            // unified 7-card schema: card 5 is 'mistakes' with items[].{mistake, consequence}
            const mistakesCard = cards?.find(c => c?.cardType === 'mistakes');
            if (mistakesCard?.items) {
                const badItems = mistakesCard.items.filter(e => !e?.consequence || wc(e.consequence) < 10);
                if (badItems.length > 0) { contentScore -= 3; details.content.issues.push(`${badItems.length} mistake items missing adequate consequence`); }
            }
        }

        details.content.score = Math.max(0, contentScore);

        let floorScore = 15;
        let floorFails = 0;

        const getPartsText = (card, field) => (card?.[field] || []).map(p => p?.text || p?.content || p?.description || '').join(' ');
        if (mode === 'university') {
            const floorChecks = [
                { val: cards?.[0]?.conceptDefinition, min: 30, label: 'conceptDefinition' },
                { val: cards?.[0]?.significance, min: 30, label: 'significance' },
                { val: cards?.[4]?.context, min: 70, label: 'case-study-1 context' },
                { val: cards?.[5]?.context, min: 70, label: 'case-study-2 context' },
                { val: cards?.[5]?.criticalReflection, min: 30, label: 'criticalReflection' }
            ];
            for (const check of floorChecks) {
                const count = wc(check.val);
                if (count < check.min) { floorFails++; details.wordFloors.issues.push(`${check.label}: ${count}w < ${check.min}w minimum`); }
            }
        } else if (mode === 'topicstext') {
            // v13.94.3: Route 5 floors are measured on prose, not on the unified-schema fields.
            const paraText = (c) => (c?.paragraphs || []).join(' ');
            const floorChecks = [
                { val: paraText(cards?.[0]), min: 120, label: 'overview paragraphs' },
                { val: paraText(cards?.[1]), min: 120, label: 'key-concepts paragraphs' },
                { val: paraText(cards?.[2]), min: 120, label: 'examples-application paragraphs' },
                { val: paraText(cards?.[3]), min: 120, label: 'key-takeaways paragraphs' },
                { val: cards?.[4]?.question, min: 15, label: 'decision-point question' }
            ];
            for (const check of floorChecks) {
                const count = wc(check.val);
                if (count < check.min) { floorFails++; details.wordFloors.issues.push(`${check.label}: ${count}w < ${check.min}w minimum`); }
            }
        } else {
            // VET, Workplace, PD  -  all use unified 7-card schema
            const mistakesConsequenceText = (cards?.[4]?.items || []).map(i => i?.consequence || '').join(' ');
            const stepsDetailText = (cards?.[2]?.steps || []).map(s => s?.detail || s?.description || s?.explanation || '').join(' ');
            const floorChecks = [
                { val: getPartsText(cards?.[0], 'sceneParts'), min: 40, label: 'hook-scenario sceneParts' },
                { val: getPartsText(cards?.[1], 'conceptInsights'), min: 40, label: 'concept-explainer insights' },
                { val: stepsDetailText, min: 50, label: 'mental-model steps detail' },
                { val: mistakesConsequenceText, min: 50, label: 'mistakes consequences' },
                { val: (cards?.[5]?.goodItems || []).join(' '), min: 30, label: 'competency-summary goodItems' },
                { val: cards?.[6]?.question, min: 15, label: 'decision-point question' }
            ];
            for (const check of floorChecks) {
                const count = wc(check.val);
                if (count < check.min) { floorFails++; details.wordFloors.issues.push(`${check.label}: ${count}w < ${check.min}w minimum`); }
            }
        }

        if (floorFails === 0) floorScore = 15;
        else if (floorFails <= 2) floorScore = 10;
        else if (floorFails <= 4) floorScore = 5;
        else floorScore = 0;
        details.wordFloors.score = floorScore;

        // Build scenario cards and extract their readable text (unified vs university schemas differ)
        const getScenCardText = (sc) => {
            if (sc.cardType === 'hook-scenario' || sc.cardType === 'applied-scenario') {
                return (sc.sceneParts || []).map(p => p?.text || p?.content || p?.description || '').join(' ');
            }
            return sc.context || '';
        };
        let cohScore = 0;
        const scenarioCards = (cards || []).filter(c => {
            if (!c?.cardType) return false;
            if (mode === 'university') return c.cardType.startsWith('case-study-');
            return c.cardType === 'hook-scenario' || c.cardType === 'applied-scenario';
        });
        for (const sc of scenarioCards) {
            const scenText = getScenCardText(sc).toLowerCase();
            if (/\d{1,2}[:.]\d{2}|morning|afternoon|evening|am\b|pm\b|week \d|semester/i.test(scenText)) cohScore += 3;
            else details.coherence.issues.push(`${sc.cardType} missing time context`);
            if (/site|warehouse|office|floor|area|zone|room|workshop|kitchen|clinic|store|vehicle|lab|reception|campus|lecture|tutorial|field/i.test(scenText)) cohScore += 3;
            else details.coherence.issues.push(`${sc.cardType} missing location detail`);
            if (/busy|unavailable|urgent|pressure|waiting|rushing|missing|unclear|conflict|deadline|noise|heat|cold|rain|dark|crowded/i.test(scenText)) cohScore += 2;
            else details.coherence.issues.push(`${sc.cardType} missing environmental friction`);
        }
        if (scenarioCards.length >= 2) {
            const ctx1 = getScenCardText(scenarioCards[0]).toLowerCase();
            const ctx2 = getScenCardText(scenarioCards[1]).toLowerCase();
            const words1 = new Set(ctx1.split(/\W+/).filter(w => w.length > 4));
            const words2 = new Set(ctx2.split(/\W+/).filter(w => w.length > 4));
            const shared = [...words1].filter(w => words2.has(w));
            const overlap = words1.size > 0 ? shared.length / words1.size : 0;
            if (overlap < 0.4) cohScore += 4;
            else { cohScore += 1; details.coherence.issues.push('Scenarios too similar  -  need different settings'); }
        }
        details.coherence.score = Math.max(0, Math.min(25, cohScore));

        let realScore = 0;
        const allScenText = scenarioCards.map(sc => getScenCardText(sc)).join(' ').toLowerCase();
        if (mode === 'university') {
            if (/conflict|contradict|complex|challeng|debate|limit|uncertain|competing|ambig/i.test(allScenText)) realScore += 5;
            else details.realism.issues.push('Missing intellectual challenge');
            if (/research|data|study|evidence|finding|method|theory|model/i.test(allScenText)) realScore += 5;
            else details.realism.issues.push('Missing academic/research context');
            if (/ethic|consent|privacy|bias|fair|equit|professional/i.test(allScenText)) realScore += 5;
            else details.realism.issues.push('Missing ethical dimension');
        } else if (mode === 'pd') {
            if (/turning|choice|decide|moment|crossroads|dilemma|tension/i.test(allScenText)) realScore += 5;
            else details.realism.issues.push('Missing turning point or decision moment');
            if (/team|colleague|manager|client|stakeholder|direct report|peer/i.test(allScenText)) realScore += 5;
            else details.realism.issues.push('Missing interpersonal context');
            if (/trust|credib|reputation|relationship|career|promotion|influence/i.test(allScenText)) realScore += 5;
            else details.realism.issues.push('Missing professional stakes');
        } else {
            if (/\d{1,2}[:.]\d{2}|morning|afternoon|evening|am\b|pm\b/i.test(allScenText)) realScore += 5;
            else details.realism.issues.push('Missing time of day');
            if (/site|warehouse|office|floor|area|zone|room|workshop|kitchen|clinic|store|vehicle|lab|reception/i.test(allScenText)) realScore += 5;
            else details.realism.issues.push('Missing location');
            if (/busy|unavailable|urgent|pressure|waiting|rushing|missing|unclear/i.test(allScenText)) realScore += 5;
            else details.realism.issues.push('Missing pressure/obstacle');
        }
        details.realism.score = realScore;

        const maxScore = 100;
        const totalScore = Math.min(maxScore, details.schema.score + details.content.score + details.wordFloors.score + details.coherence.score + details.realism.score);

        let action = 'PUBLISH';
        let passed = true;
        if (totalScore < 65) { action = 'REGENERATE'; passed = false; }
        else if (totalScore < 80) { action = 'REWRITE_PASS'; passed = true; }
        if (bannedHits.length >= 3) { action = 'REWRITE_PASS'; }

        return {
            score: totalScore,
            maxScore,
            percentage: Math.round((totalScore / maxScore) * 100),
            passed,
            action,
            details,
            bannedWordHits: bannedHits,
            hardFailPenalty: 0,
            summary: `${totalScore}/${maxScore} (${action})`
        };
    };

    // ===========================================================================
    // REPAIR PROMPT BUILDERS (route-aware)
    // ===========================================================================

    const buildContentRepairSystemPrompt = (context) => {
        // v12.71 FIX-CC-REPAIR-LANG: Inject language instructions into the repair system prompt.
        // Previously the repair system prompt had no language block — when attempt 1 produced
        // valid-schema English content and attempt 2 (repair) ran, the system prompt was purely
        // English regardless of the target language. The AI repaired the English content into
        // correctly-structured English, defeating the translation. Fix: append getLanguageInstructions()
        // so the repair prompt enforces the same target language as the generation prompt.
        const langBlock = getLanguageInstructions(context?.language || context?.voiceLanguage || 'en-AU');
        return `You are making SURGICAL FIXES to workplace training content.

CRITICAL RULE: Fix ONLY the structural issues listed. Do NOT rewrite, rephrase, or change any content that is not broken. Keep all existing scenarios, text, and details exactly as they are.

REQUIRED CARD STRUCTURE (for reference when fixing broken cards only):
- hook-scenario: keyPoints[] (4 objects: title/text), voiceoverText (70+ words)
- concept-explainer: keyPoints[] (3 objects: title/text), heading, keyInfo, summaryLine, voiceoverText (70+ words)
- mental-model: steps[] (4-5 objects: step/icon/detail), voiceoverText (70+ words)
- applied-scenario: keyPoints[] (4 objects: title/text), voiceoverText (70+ words)
- mistakes: errorItems[] (5 objects: error/consequence 15+ words)
- competency-summary: standardItems[] (5 objects: text, verb-first), errorItems[] (5 objects: error/consequence), voiceoverText (70+ words, ends "Now, complete the activity below.")
- decision-point: heading (the question, 15+ words), standardItems[] (1 object: text/consequence  -  the correct answer), errorItems[] (3 objects: error/consequence  -  the wrong answers)

UNCHANGED CARDS MUST BE RETURNED EXACTLY AS PROVIDED  -  do not modify formatting, wording, or structure.
If a card has one issue, fix ONLY that field. Do NOT regenerate the entire card.
You MUST return all 7 cards. Do not remove or omit any existing fields.

Return ONLY a valid JSON object with "cards" array of exactly 7 cards.${langBlock}`;
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
        const langBlock = getLanguageInstructions(context?.language || context?.voiceLanguage || 'en-AU');
        return `You are making SURGICAL FIXES to academic e-learning content.

CRITICAL RULE: Fix ONLY the structural issues listed. Do NOT rewrite, rephrase, or change any content that is not broken. Keep all existing theory names, case study details, and text exactly as they are.

REQUIRED CARD STRUCTURE (for reference when fixing broken cards only):
- concept-anchor: conceptDefinition (30+ words), significance (30+ words), keyTerms[] (3 objects: term/definition)
- theoretical-framework: frameworks[] (2-3 objects: name/originator/principle 20+w/limitation 15+w)
- analytical-lens: cognitiveConsiderations[] (5+ strings, 15+ words each)
- ethics-considerations: considerations[] (5+ objects: dimension/description 20+ words)
- case-study-1: context (70+ words), keyInsight, analysisPrompts[] (3 strings, 20+ words each)
- case-study-2: context (70+ words), criticalReflection (30+ words), analysisPrompts[] (3 strings, 20+ words each)

UNCHANGED CARDS MUST BE RETURNED EXACTLY AS PROVIDED  -  do not modify formatting, wording, or structure.
If a card has one issue, fix ONLY that field. Do NOT regenerate the entire card.
You MUST return all 6 cards. Do not remove or omit any existing fields.

Return ONLY a valid JSON object with "cards" array of exactly 6 cards.${langBlock}`;
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

Return ONLY a valid JSON object with "cards" array of exactly 6 cards.`;
    };

    const buildWorkplaceContentRepairSystemPrompt = (context) => {
        const langBlock = getLanguageInstructions(context?.language || context?.voiceLanguage || 'en-AU');
        return `You are making SURGICAL FIXES to workplace training content.

CRITICAL RULE: Fix ONLY the structural issues listed. Do NOT rewrite, rephrase, or change any content that is not broken. Keep all existing scenarios, text, and details exactly as they are.

REQUIRED CARD STRUCTURE (for reference when fixing broken cards only):
- hook-scenario: keyPoints[] (4 objects: title/text), voiceoverText (70+ words)
- concept-explainer: keyPoints[] (3 objects: title/text), heading, keyInfo, summaryLine, voiceoverText (70+ words)
- mental-model: steps[] (4-5 objects: step/icon/detail), voiceoverText (70+ words)
- applied-scenario: keyPoints[] (4 objects: title/text), voiceoverText (70+ words)
- mistakes: errorItems[] (5 objects: error/consequence 15+ words)
- competency-summary: standardItems[] (5 objects: text, verb-first), errorItems[] (5 objects: error/consequence), voiceoverText (70+ words, ends "Now, complete the activity below.")
- decision-point: heading (the question, 15+ words), standardItems[] (1 object: text/consequence  -  the correct answer), errorItems[] (3 objects: error/consequence  -  the wrong answers)

UNCHANGED CARDS MUST BE RETURNED EXACTLY AS PROVIDED  -  do not modify formatting, wording, or structure.
If a card has one issue, fix ONLY that field. Do NOT regenerate the entire card.
You MUST return all 7 cards. Do not remove or omit any existing fields.

Return ONLY a valid JSON object with "cards" array of exactly 7 cards.${langBlock}`;
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
        const langBlock = getLanguageInstructions(context?.language || context?.voiceLanguage || 'en-AU');
        return `You are making SURGICAL FIXES to professional development learning content.

CRITICAL RULE: Fix ONLY the structural issues listed. Do NOT rewrite, rephrase, or change any content that is not broken. Keep all existing scenarios, frameworks, and text exactly as they are.

REQUIRED CARD STRUCTURE (for reference when fixing broken cards only):
- hook-scenario: keyPoints[] (4 objects: title/text), voiceoverText (70+ words)
- concept-explainer: keyPoints[] (3 objects: title/text), heading, keyInfo, summaryLine, voiceoverText (70+ words)
- mental-model: steps[] (4-5 objects: step/icon/detail), voiceoverText (70+ words)
- applied-scenario: keyPoints[] (4 objects: title/text), voiceoverText (70+ words)
- mistakes: errorItems[] (5 objects: error/consequence 15+ words)
- competency-summary: standardItems[] (5 objects: text, verb-first), errorItems[] (5 objects: error/consequence), voiceoverText (70+ words, ends "Now, complete the activity below.")
- decision-point: heading (the question, 15+ words), standardItems[] (1 object: text/consequence  -  the correct answer), errorItems[] (3 objects: error/consequence  -  the wrong answers)

UNCHANGED CARDS MUST BE RETURNED EXACTLY AS PROVIDED  -  do not modify formatting, wording, or structure.
If a card has one issue, fix ONLY that field. Do NOT regenerate the entire card.
You MUST return all 7 cards. Do not remove or omit any existing fields.

Return ONLY a valid JSON object with "cards" array of exactly 7 cards.${langBlock}`;
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

    const scoreAuditDefensibility = (cards, context) => {
        const mode = context?.mode || 'vet';
        const isUniversity = (mode === 'university');
        const isWorkplace = (mode === 'workplace');
        const isPD = (mode === 'pd');
        const maxScore = 80;

        if (isUniversity || isWorkplace || isPD) {
            const modeLabel = isPD ? 'pd' : isUniversity ? 'university' : 'workplace';
            return {
                score: maxScore,
                maxScore: maxScore,
                percentage: 100,
                passed: true,
                action: 'AUDIT_PASS',
                details: {
                    cardStructure: { score: 15, max: 15, issues: [] },
                    scenarioQuality: { score: 15, max: 15, issues: [] },
                    contentDepth: { score: 15, max: 15, issues: [] },
                    voiceoverQuality: { score: 15, max: 15, issues: [] },
                    fieldCompleteness: { score: 10, max: 10, issues: [] },
                    consequenceSpecificity: { score: 10, max: 10, issues: [] }
                },
                summary: maxScore + '/' + maxScore + ' (' + modeLabel + ' mode - auto pass)'
            };
        }

        const details = {
            cardStructure: { score: 0, max: 15, issues: [] },
            scenarioQuality: { score: 0, max: 15, issues: [] },
            contentDepth: { score: 0, max: 15, issues: [] },
            voiceoverQuality: { score: 0, max: 15, issues: [] },
            fieldCompleteness: { score: 0, max: 10, issues: [] },
            consequenceSpecificity: { score: 0, max: 10, issues: [] }
        };

        const wc = (str) => { const s = (typeof str === 'string') ? str : ((str === null || str === undefined) ? '' : String(str)); return s.trim().split(/\s+/).filter(w => w).length; };

        const isVerbFirst = function (text) {
            var t = (text || '').trim();
            if (!t) return false;
            var first = t.split(/\s+/)[0].toLowerCase();
            var verbs = [
                'identify','check','confirm','record','report','ensure','use','follow','complete',
                'assess','recognise','recognize','call','notify','stop','apply','clean','wear','remove',
                'communicate','review','position','monitor','locate','inspect','select','prepare',
                'label','sign','tag','lock','isolate','test','measure','adjust','calibrate','verify',
                'document','file','store','dispose','lift','carry','push','pull','operate','maintain',
                'connect','disconnect','install','replace','tighten','secure','mark','flag','escalate',
                'demonstrate','arrange','transfer','supervise','coordinate','delegate','implement',
                'conduct','perform','administer','allocate','analyse','analyze','calculate','classify',
                'compare','construct','create','define','describe','design','develop','distribute',
                'evaluate','examine','explain','formulate','gather','handle','interpret','investigate',
                'manage','organise','organize','plan','present','prioritise','prioritize','process',
                'provide','recommend','resolve','respond','schedule','set','sort','submit','support',
                'train','update','validate','wipe','wrap','weigh','warn','walk','troubleshoot',
                'scan','rinse','raise','place','pack','open','observe','list','inform','greet',
                'enter','display','count','collect','close','clear','brief','attach','assist','assemble'
            ];
            return verbs.indexOf(first) !== -1;
        };

        // unified 7-card schema: competency-summary (card 6) has goodItems[] + badItems[]
        var summaryCard = (cards || []).find(function (c) { return c && c.cardType === 'competency-summary'; });
        var goodItems = Array.isArray(summaryCard?.goodItems) ? summaryCard.goodItems : [];
        if (goodItems.length >= 5) {
            details.cardStructure.score += 5;
            var verbFirstItems = goodItems.filter(function (s) {
                var t = (typeof s === 'string') ? s : (s?.text || s?.behaviour || s?.criterion || '');
                return isVerbFirst(t);
            });
            if (verbFirstItems.length >= 4) {
                details.cardStructure.score += 5;
            } else {
                details.cardStructure.issues.push('Competency summary goodItems must start with action verbs (' + verbFirstItems.length + '/' + goodItems.length + ' pass)');
            }
        } else {
            details.cardStructure.issues.push('Need at least 5 competency-summary goodItems (got ' + goodItems.length + ')');
        }

        // unified 7-card schema: mental-model (card 3) has steps[].{step, icon, detail}
        var mentalCard = (cards || []).find(function (c) { return c && c.cardType === 'mental-model'; });
        var steps = Array.isArray(mentalCard?.steps) ? mentalCard.steps : [];
        if (steps.length >= 4) {
            details.cardStructure.score += 5;
            var verbFirstSteps = steps.filter(function (s) {
                return isVerbFirst(s?.step || s?.action || s?.title || '');
            });
            if (verbFirstSteps.length >= 3) {
                details.cardStructure.score += 0;
            } else {
                details.cardStructure.issues.push('Mental-model steps should start with action verbs (' + verbFirstSteps.length + '/' + steps.length + ' pass)');
            }
        } else {
            details.cardStructure.issues.push('Need at least 4 mental-model steps (got ' + steps.length + ')');
        }

        // unified scenario cards: hook-scenario (card 1) and applied-scenario (card 4) use sceneParts[]
        var auditScenCards = (cards || []).filter(function (c) {
            return c && (c.cardType === 'hook-scenario' || c.cardType === 'applied-scenario');
        });
        for (var si = 0; si < auditScenCards.length; si++) {
            var sc = auditScenCards[si];
            var scenText = (sc.sceneParts || []).map(function (p) { return p?.text || p?.content || p?.description || ''; }).join(' ').toLowerCase();
            var scenScore = 0;
            if (/\d{1,2}[:.]\d{2}|morning|afternoon|evening|am\b|pm\b/i.test(scenText)) scenScore += 2;
            else details.scenarioQuality.issues.push(sc.cardType + ' missing time of day');
            if (/site|warehouse|office|floor|area|zone|room|workshop|kitchen|clinic|store|vehicle|lab|reception/i.test(scenText)) scenScore += 2;
            else details.scenarioQuality.issues.push(sc.cardType + ' missing location');
            if (/busy|unavailable|urgent|pressure|waiting|rushing|missing|unclear|noise|heat|cold|rain|dark|crowded/i.test(scenText)) scenScore += 2;
            else details.scenarioQuality.issues.push(sc.cardType + ' missing environmental friction');
            if (wc(scenText) >= 60) scenScore += 1;
            else details.scenarioQuality.issues.push(sc.cardType + ' scene text too short (need 60+ words total)');
            details.scenarioQuality.score += scenScore;
        }
        details.scenarioQuality.score = Math.min(15, details.scenarioQuality.score);

        // unified 7-card schema: mistakes (card 5) has items[].{mistake, consequence}
        var mistakesCard = (cards || []).find(function (c) { return c && c.cardType === 'mistakes'; });
        var mistakeItems = Array.isArray(mistakesCard?.items) ? mistakesCard.items : [];
        if (mistakeItems.length >= 5) {
            details.contentDepth.score += 5;
            var itemsWithConsequence = mistakeItems.filter(function (e) { return e && e.consequence && wc(e.consequence) >= 10; });
            if (itemsWithConsequence.length >= 4) details.contentDepth.score += 5;
            else details.contentDepth.issues.push('Mistake items need consequences of 10+ words (' + itemsWithConsequence.length + '/5 pass)');
        } else {
            details.contentDepth.issues.push('Need at least 5 mistake items (got ' + mistakeItems.length + ')');
        }

        // unified 7-card schema: concept-explainer (card 2) has conceptInsights[]
        var conceptCard = (cards || []).find(function (c) { return c && c.cardType === 'concept-explainer'; });
        if (conceptCard && Array.isArray(conceptCard.conceptInsights) && conceptCard.conceptInsights.length >= 3) {
            details.contentDepth.score += 5;
        } else {
            details.contentDepth.issues.push('Concept-explainer card needs 3+ conceptInsights');
        }

        var voiceoverPasses = 0;
        if (Array.isArray(cards)) {
            for (var vi = 0; vi < cards.length; vi++) {
                if (cards[vi] && wc(cards[vi].voiceoverText) >= 60) voiceoverPasses++;
                else details.voiceoverQuality.issues.push('Card ' + (vi + 1) + ' (' + (cards[vi]?.cardType || 'unknown') + ') voiceoverText under 60 words');
            }
        }
        if (voiceoverPasses >= 7) details.voiceoverQuality.score = 15;
        else if (voiceoverPasses >= 5) details.voiceoverQuality.score = 10;
        else if (voiceoverPasses >= 3) details.voiceoverQuality.score = 5;
        else details.voiceoverQuality.score = 0;

        // unified 7-card schema: hook-scenario (card 1) has sceneParts[4] + voiceoverText; decision-point (card 7) has question + options[4]
        var hookCard = (cards || []).find(function (c) { return c && c.cardType === 'hook-scenario'; });
        var dpCard = (cards || []).find(function (c) { return c && c.cardType === 'decision-point'; });
        if (hookCard) {
            if (Array.isArray(hookCard.sceneParts) && hookCard.sceneParts.length >= 4) details.fieldCompleteness.score += 3;
            else details.fieldCompleteness.issues.push('hook-scenario needs 4 sceneParts (got ' + (hookCard.sceneParts?.length || 0) + ')');
            if (wc(hookCard.voiceoverText) >= 60) details.fieldCompleteness.score += 3;
            else details.fieldCompleteness.issues.push('hook-scenario voiceoverText under 60 words');
        } else {
            details.fieldCompleteness.issues.push('Missing hook-scenario card');
        }
        if (dpCard) {
            if (dpCard.question && wc(dpCard.question) >= 15) details.fieldCompleteness.score += 2;
            else details.fieldCompleteness.issues.push('decision-point question missing or too short');
            if (Array.isArray(dpCard.options) && dpCard.options.length === 4 && dpCard.options.filter(function (o) { return o?.correct; }).length === 1) details.fieldCompleteness.score += 2;
            else details.fieldCompleteness.issues.push('decision-point needs exactly 4 options with exactly 1 correct');
        } else {
            details.fieldCompleteness.issues.push('Missing decision-point card');
        }

        var consequenceKeywords = [
            'breach','notifiable','liability','warranty','insurance','disciplinary',
            'contract','removal from site','non-compliance','duty of care','workcover',
            'fine','prosecution','prohibition notice','improvement notice','infringement',
            'coronial','investigation','suspension','termination','legal action'
        ];
        var allConsequenceText = '';
        for (var ci = 0; ci < auditScenCards.length; ci++) {
            allConsequenceText += ' ' + (auditScenCards[ci].sceneParts || []).map(function (p) { return p?.text || p?.content || p?.description || ''; }).join(' ');
        }
        for (var ei = 0; ei < mistakeItems.length; ei++) {
            allConsequenceText += ' ' + (mistakeItems[ei]?.consequence || '');
        }
        allConsequenceText = allConsequenceText.toLowerCase();
        var specificConsequences = consequenceKeywords.filter(function (kw) { return allConsequenceText.indexOf(kw) !== -1; });
        if (specificConsequences.length >= 2) {
            details.consequenceSpecificity.score += 10;
        } else if (specificConsequences.length === 1) {
            details.consequenceSpecificity.score += 6;
            details.consequenceSpecificity.issues.push('Only 1 specific legal/operational consequence term found  -  aim for 2+');
        } else {
            details.consequenceSpecificity.issues.push('No specific legal/operational consequence language detected');
        }

        var totalScore = 0;
        for (var cat in details) {
            if (Object.prototype.hasOwnProperty.call(details, cat)) {
                totalScore += details[cat].score;
            }
        }
        totalScore = Math.min(maxScore, totalScore);

        var action = 'AUDIT_PASS';
        var passed = true;
        if (totalScore < 40) { action = 'AUDIT_REGENERATE'; passed = false; }
        else if (totalScore < 55) { action = 'AUDIT_REPAIR'; passed = false; }
        else if (totalScore < 65) { action = 'AUDIT_POLISH'; passed = true; }

        return {
            score: totalScore,
            maxScore: maxScore,
            percentage: Math.round((totalScore / maxScore) * 100),
            passed: passed,
            action: action,
            details: details,
            summary: totalScore + '/' + maxScore + ' (' + action + ')'
        };
    };

    // ===========================================================================
    // AUDIT REPAIR PROMPTS
    // ===========================================================================

    const AUDIT_REPAIR_PROMPT = `You are rewriting workplace training content to meet Australian RTO audit defensibility standards. COMPLETELY REWRITE weak areas.

UNIFIED 7-CARD AUDIT RULES:
- hook-scenario (card 1): sceneParts array of 4 objects (title/icon/text), each text exactly 2 sentences with specific time of day, named location, and environmental pressure. voiceoverText 70+ words.
- concept-explainer (card 2): conceptInsights array of 3 objects (title/icon/text), each insight concrete and jargon-free. voiceoverText 70+ words.
- mental-model (card 3): steps array of 4-5 objects (step/icon/detail), each step verb-led and consequence-linked. voiceoverText 70+ words.
- applied-scenario (card 4): sceneParts array of 4 objects (title/icon/text), each text exactly 2 sentences, different setting and time from hook-scenario. voiceoverText 70+ words.
- mistakes (card 5): items array of 5 objects (mistake + icon + consequence 15+ words each). voiceoverText 70+ words.
- competency-summary (card 6): goodItems array of 5 verb-first strings, badItems array of 5 strings. voiceoverText ends with "Now, complete the activity below."
- decision-point (card 7): question (15+ words), options array of exactly 4 (text/feedback/correct), exactly one correct:true.
- Every card must have voiceoverText of at least 70 words.
- Scenario text must include legal/operational consequence terms where appropriate.

Keep existing cardType values. Return ONLY a valid JSON object with "cards" array of exactly 7 cards.`;

    const buildAuditRepairPrompt = (cards, auditIssues, topicTitle, context) => {
        var industry = context?.industrySector || context?.industry || 'Australian workplace';
        var unitCode = context?.unitCode || '';
        var unitTitle = context?.unitTitle || '';

        var issueLines = [];
        for (var cat in auditIssues) {
            if (Object.prototype.hasOwnProperty.call(auditIssues, cat)) {
                var catIssues = auditIssues[cat]?.issues || [];
                catIssues.forEach(function (issue) {
                    issueLines.push('- [' + cat + '] ' + issue);
                });
            }
        }

        return `AUDIT REPAIR for: ${topicTitle || 'workplace training'}
Unit: ${unitCode} ${unitTitle}
Industry: ${industry}
Role: ${context?.jobLevel || context?.learnerRole || 'worker'}

ISSUES TO FIX:
${issueLines.slice(0, 12).join('\n')}

CURRENT CONTENT:
${JSON.stringify(cards, null, 2)}

Return ONLY the rewritten JSON object with "cards" array.`;
    };

    const getAuditRepairPromptForMode = (mode, context) => {
        if (mode === 'university') {
            return buildUniversityContentRepairSystemPrompt(context);
        }
        if (mode === 'workplace') {
            return buildWorkplaceContentRepairSystemPrompt(context);
        }
        if (mode === 'pd') {
            return buildPDContentRepairSystemPrompt(context);
        }
        return AUDIT_REPAIR_PROMPT;
    };

    const buildAuditRepairPromptForMode = (cards, auditDetails, topicTitle, context) => {
        var mode = context?.mode || 'vet';
        if (mode === 'university') {
            var issues = [];
            for (var cat in auditDetails) {
                if (Object.prototype.hasOwnProperty.call(auditDetails, cat)) {
                    (auditDetails[cat]?.issues || []).forEach(function (i) { issues.push(i); });
                }
            }
            return buildUniversityContentRepairPrompt(cards, issues, topicTitle, context);
        }
        if (mode === 'workplace') {
            var wpIssues = [];
            for (var cat2 in auditDetails) {
                if (Object.prototype.hasOwnProperty.call(auditDetails, cat2)) {
                    (auditDetails[cat2]?.issues || []).forEach(function (i) { wpIssues.push(i); });
                }
            }
            return buildWorkplaceContentRepairPrompt(cards, wpIssues, topicTitle, context);
        }
        if (mode === 'pd') {
            var pdIssues = [];
            for (var cat3 in auditDetails) {
                if (Object.prototype.hasOwnProperty.call(auditDetails, cat3)) {
                    (auditDetails[cat3]?.issues || []).forEach(function (i) { pdIssues.push(i); });
                }
            }
            return buildPDContentRepairPrompt(cards, pdIssues, topicTitle, context);
        }
        return buildAuditRepairPrompt(cards, auditDetails, topicTitle, context);
    };

    // ===========================================================================
    // EXPANSION & BANNED WORD PROMPTS
    // ===========================================================================

    const EXPANSION_PASS_SYSTEM_PROMPT = `You are expanding content fields to meet minimum word counts. Keep scenario context UNCHANGED. Only expand the fields listed below. Write in plain, direct language. Return the same JSON structure.`;

    const buildExpansionPassPrompt = (cards, underFields) => {
        const fieldList = underFields.map(f => `- ${f.label}: currently ${f.current}w, need at least ${f.min}w`).join('\n');
        return `Expand these fields to meet minimums:\n${fieldList}\n\nContent:\n${JSON.stringify(cards, null, 2)}`;
    };

    const BANNED_WORD_REWRITE_SYSTEM_PROMPT = `Replace banned words in the following content. Only change sentences containing the flagged words. Keep everything else identical. Use plain, direct language. Return the same JSON structure.`;

    const buildBannedWordRewritePrompt = (cards, bannedHits) => {
        return `Replace these banned words: ${bannedHits.join(', ')}\n\nContent:\n${JSON.stringify(cards, null, 2)}`;
    };

    // ===========================================================================
    // v10.38: STORY QA PASS  -  polish story continuity, decision quality, language
    // Runs after all quality gates pass. Improves the 7-card unified flow without
    // changing the JSON structure. Silent fallback to original cards on failure.
    // ===========================================================================

    const STORY_QA_SYSTEM_PROMPT = `You are an expert vocational training instructional designer improving AI-generated course content.

You will receive a JSON array of learning cards representing a 7-card story-driven sequence.

Your job is to elevate the content to elite quality. Review and improve across these dimensions:

STORY FLOW
- All cards must follow one continuous job scenario  -  same setting, same people, same task
- The applied-scenario card must feel like a direct continuation of the hook-scenario card
- Each card should transition naturally into the next  -  no abrupt topic jumps
- The mistakes/Watch Out For card should tie back to a specific moment in the scenario
- The competency-summary card uses two arrays: "goodItems" (what elite practice looks like  -  4 - 6 concrete, scenario-grounded phrases) and "badItems" (what to avoid  -  4 - 6 specific, realistic failure patterns); keep both arrays; do NOT merge them into "items"
- Every goodItems entry should describe observable, scenario-specific excellence  -  not generic principles
- Every badItems entry should name a realistic mistake a real worker in the scenario could plausibly make

DECISION QUALITY (decision-point card)
- All 4 answer options must feel like realistic workplace decisions a real worker might consider
- Wrong answers must reflect believable mistakes  -  the kind where you can see why someone would make them
- Avoid obviously absurd distractors ("just ignore it", "break the rules")
- The correct answer should require genuine thinking, not be instantly obvious
- Each wrong answer needs specific, realistic feedback explaining the real consequence

CONCEPT CLARITY (concept-explainer card)
- Explain the concept once, clearly  -  don't restate the same idea in different words
- Link the explanation directly to the scenario  -  anchor it in what the characters are experiencing
- Tighten wordy or padded sections; aim for impact over length

MENTAL MODEL (mental-model card)
- Each step must reflect what a real worker is actually thinking or doing in that moment
- Replace generic instructions like "identify the issue" with story-specific, concrete actions
- Aim for 4 - 6 steps only

LANGUAGE
- Natural, human, workplace tone throughout
- No robotic phrases: "it is important to", "it is essential that", "ensure that you", "in order to"
- Should sound like someone experienced in the industry explaining the job to a colleague

REALISM
- Scenarios must feel like situations a worker would immediately recognise from real experience
- Include believable pressure: time, client expectations, safety stakes, chain of responsibility

RULES  -  FOLLOW THESE EXACTLY
- Return the SAME JSON array  -  same number of cards, same cardType for each card
- Keep all field names exactly as received  -  do NOT rename, add, or remove fields
- Do NOT add or remove cards from the array
- Do NOT output scores, commentary, or any text outside the JSON
- Return ONLY valid JSON

CRITICAL SCHEMA PRESERVATION  -  these structured arrays MUST be kept as arrays, never collapsed to a string:
- hook-scenario: keep keyPoints as an array of exactly 4 objects (title, text)  -  do NOT replace with a content field
- applied-scenario: keep keyPoints as an array of exactly 4 objects (title, text)  -  do NOT replace with a content field
- concept-explainer: keep keyPoints as an array of exactly 3 objects (title, text)  -  do NOT replace with a content field
- mental-model: keep steps as an array of objects (step, icon, detail)  -  do NOT replace with a content field
- mistakes: keep errorItems as an array of objects (error, consequence)  -  do NOT replace with a content field
- competency-summary: keep standardItems and errorItems as separate arrays  -  do NOT merge them
- decision-point: keep heading, standardItems (the correct answer) and errorItems (the wrong answers)`;

    const buildStoryQAUserPrompt = (cards, context, topicTitle) => {
        const industry = (context && context.industry) ? context.industry : '';
        const role = (context && (context.role || context.jobRole)) ? (context.role || context.jobRole) : '';
        const header = [
            topicTitle ? 'Topic: ' + topicTitle : '',
            industry  ? 'Industry: ' + industry : '',
            role      ? 'Role: ' + role : ''
        ].filter(Boolean).join('\n');
        return (header ? header + '\n\nImprove this content:\n\n' : '') + JSON.stringify(cards);
    };

    // ===========================================================================
    // EXPORTS
    // ===========================================================================

    return {
        getSystemPromptForMode: getSystemPromptForMode,
        // v13.91: Route 5 - Topics and Text.
        TOPICSTEXT_SYSTEM_PROMPT: TOPICSTEXT_SYSTEM_PROMPT,
        buildTopicsTextUserPrompt: buildTopicsTextUserPrompt,
        getFiveCardSystemPromptForMode: getFiveCardSystemPromptForMode,
        buildFiveCardUserPrompt: buildFiveCardUserPrompt,
        scoreQualityGate: scoreQualityGate,
        scoreAuditDefensibility: scoreAuditDefensibility,
        normalizeCards: normalizeCards,
        validateBannedWords: validateBannedWords,
        BANNED_WORDS: BANNED_WORDS,
        getContentRepairPromptForMode: getContentRepairPromptForMode,
        buildContentRepairPromptForMode: buildContentRepairPromptForMode,
        getAuditRepairPromptForMode: getAuditRepairPromptForMode,
        buildAuditRepairPromptForMode: buildAuditRepairPromptForMode,
        VET_SYSTEM_PROMPT: VET_SYSTEM_PROMPT,
        WORKPLACE_SYSTEM_PROMPT: WORKPLACE_SYSTEM_PROMPT,
        UNIVERSITY_SYSTEM_PROMPT: UNIVERSITY_SYSTEM_PROMPT,
        PD_SYSTEM_PROMPT: PD_SYSTEM_PROMPT,
        FIVE_CARD_SYSTEM_PROMPT: VET_SYSTEM_PROMPT,
        WORKPLACE_FIVE_CARD_SYSTEM_PROMPT: WORKPLACE_SYSTEM_PROMPT,
        UNIVERSITY_FIVE_CARD_SYSTEM_PROMPT: UNIVERSITY_SYSTEM_PROMPT,
        PD_FIVE_CARD_SYSTEM_PROMPT: PD_SYSTEM_PROMPT,
        AUDIT_REPAIR_PROMPT: AUDIT_REPAIR_PROMPT,
        EXPANSION_PASS_SYSTEM_PROMPT: EXPANSION_PASS_SYSTEM_PROMPT,
        buildExpansionPassPrompt: buildExpansionPassPrompt,
        BANNED_WORD_REWRITE_SYSTEM_PROMPT: BANNED_WORD_REWRITE_SYSTEM_PROMPT,
        buildBannedWordRewritePrompt: buildBannedWordRewritePrompt,
        STORY_QA_SYSTEM_PROMPT: STORY_QA_SYSTEM_PROMPT,
        buildStoryQAUserPrompt: buildStoryQAUserPrompt,
        buildContentRepairPrompt: buildContentRepairPrompt,
        buildWorkplaceContentRepairPrompt: buildWorkplaceContentRepairPrompt,
        buildUniversityContentRepairPrompt: buildUniversityContentRepairPrompt,
        buildPDContentRepairPrompt: buildPDContentRepairPrompt,
        buildAuditRepairPrompt: buildAuditRepairPrompt,
        getSpellingInstructions: getSpellingInstructions,
        getLanguageInstructions: getLanguageInstructions,
        getLanguageName: getLanguageName,
        LANGUAGE_NAMES: LANGUAGE_NAMES,
        Legislation: Legislation,
        VET_CARD_SCHEMA: VET_CARD_SCHEMA,
        UNIVERSITY_CARD_SCHEMA: UNIVERSITY_CARD_SCHEMA,
        WORKPLACE_CARD_SCHEMA: WORKPLACE_CARD_SCHEMA,
        PD_CARD_SCHEMA: PD_CARD_SCHEMA,
        getCardSchemaForMode: getCardSchemaForMode,
        getCardCountForMode: getCardCountForMode,
        BLOOMS_LEVEL_INSTRUCTIONS: BLOOMS_LEVEL_INSTRUCTIONS,
        getLangPrefixForUserPrompt: getLangPrefixForUserPrompt,
        getLangSuffixForUserPrompt: getLangSuffixForUserPrompt
    };
});
