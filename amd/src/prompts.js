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

THIS ROUTE IS VOCATIONAL  -  it is not workplace training and not professional development.
Everything on these cards has to be assessable. Write what the learner DOES with their hands, tools,
vehicles, systems or paperwork, in a place you have named. Every card should contain something an
assessor could observe or a supervisor could sign. Prefer the physical and the procedural: the check
before you start, the reading you take, the form you complete, the person you tell.
Do NOT write about strategy, culture, engagement, stakeholder management, career development or
"the business". Do NOT write a card that could only be read at a desk.

LENGTH  -  NOT NEGOTIABLE: the per-field word ranges below are the specification, and they are
authoritative. Hit every one of them. Summed across a card that lands between 180 and 300 words of
visible learner-facing text, which is the whole budget - there is no separate narration field to
write. A field written to the bottom of its range across a whole card produces a card that is too
thin to teach from, so write to the middle of each range or above.
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

CARDS (generate in this order):
1. hook-scenario  -  keyPoints[4]{title(3-5 words), icon, text(EXACTLY 2 sentences, 42-58 words in total, 2nd person, specific: name the place, the time of day, the equipment, what the learner can see or hear. The first sentence sets the scene, the second says what is happening or what it means for you  -  never one long run-on sentence)}, highlightText(optional, max 20 words)
2. concept-explainer  -  keyPoints[3]{title(3-5 words), text(35-50 words)}, heading(the Act, regulation or code of practice this sits under  -  name it as a worker would say it, not by section number), keyInfo(25-35 words  -  the duty it places on this learner, in plain English. What a WORKER must do, not what the RTO must evidence), summaryLine(15-20 words linking to Card 1)
3. mental-model  -  steps[4-5]{step(verb-led, 3-6 words), icon, detail(35-45 words with concrete nouns: the physical action, the thing you are looking at while you do it, and what tells you it is done to standard. Name the tool, the form, the reading or the sign-off  -  an assessor watching would have to be able to tick this off from what you wrote)}
4. applied-scenario  -  keyPoints[4]{title(3-5 words), icon, text(EXACTLY 2 sentences, 42-58 words in total. The first sentence sets the situation, the second says what you do about it or what it costs you  -  never one long run-on sentence)}  -  the SAME job and the SAME people as Card 1, later the same day or on the next shift. The place may move (a different bay, room, vehicle, client or site) but the learner and the task carry over, and this card must open by naming what has changed since Card 1. This card renders under a "Continuing the scenario" banner, so an unrelated new scenario reads to the learner as a mistake, highlightText(optional, max 20 words)
5. mistakes  -  errorItems[5]{error(verb or "Not...", 6-10 words), icon, consequence(EXACTLY 2 sentences, 34-46 words in total. Sentence one states the specific operational impact. Sentence two makes it land on a real person in this job: name who is standing there when it goes wrong and what it costs them, in plain words a worker would use  -  "The apprentice on the other end of the load is the one who wears it.")}
6. competency-summary  -  title(topic-specific, phrased as the competency itself  -  NOT "You Are Ready When You Can"), standardItems[5]{text(verb-first, 6-10 words  -  a short label, not a sentence), benefit(14-22 words. Not an abstract virtue  -  what it looks like on the job when this is done properly, in the words a supervisor would use signing it off. "The apprentice who follows you through the gate copies whatever you just did, so do it the way you would want it copied." This is the standard an assessor would accept, said plainly)}, errorItems[5]{error(verb or "Not...", 10-12 words), consequence(14-18 words)}
7. decision-point  -  heading(the question itself, 18-28 words, 2nd person), standardItems[1]{text(the ONE correct answer, 10-16 words), consequence(28-38 words explaining why it is right)}, errorItems[3]{error(a plausible wrong answer, 10-16 words), consequence(25-35 words explaining why it is wrong)}
   ANSWER-LENGTH PARITY (all routes): the correct answer and all three wrong answers MUST be the same length and the same level of detail  -  every option 10-16 words, each naming a specific action. A learner must not be able to pick the answer by spotting the longest or most detailed option. Wrong answers are complete, plausible strategies that a reasonable person might choose, never two-word stubs ("Offer training") and never absurd ("Do everything at once"). Do not append a justification, benefit or outcome clause to the correct answer that the wrong answers do not also have  -  that reasoning belongs in consequence, not in text.
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

Return ONLY valid JSON: { "cards": [...] }  -  exactly 6 cards. If fewer or more than 6 cards are returned, the output is invalid. No markdown, no code fences.

FIELDS: All fields must be returned exactly as specified. Do not rename, omit, or reorder fields.

REFERENCE MATERIAL: When present, use it as the PRIMARY source. Preserve theory names, researcher names, and case study specifics  -  do NOT replace with generic equivalents.

VOICE: Clear academic mentor. Sentences under 25 words. Use "you". Technical terms are fine  -  define each one. Never use: learn, understand, know, be aware of, appreciate, explore.

LENGTH  -  NOT NEGOTIABLE: the per-field word ranges below are the specification, and they are
authoritative. Hit every one of them. Summed across a card that lands between 180 and 300 words of
visible learner-facing text, which is the whole budget - there is no separate narration field to
write. A field written to the bottom of its range across a whole card produces a card that is too
thin to teach from, so write to the middle of each range or above.
Sentences stay under 25 words  -  reaching the word count means MORE sentences carrying more
specifics, never longer ones. Add detail that does work: the named theorist, the date, the
institution, the actual finding, the exact boundary condition. Never pad with adjectives,
restatement or filler.

VOICEOVER: Do NOT return a voiceoverText field on any card. The narration is built from the visible card fields and read verbatim, so a separate script is never used - it would desynchronise the audio from the panel being highlighted. Every word you write must be a word the learner sees, so spend the whole budget on the visible fields below.

MAKE IT LAND: a learner remembers a moment, not a principle. Every card must contain at least one sentence a person could picture: a named role doing a named thing at a named time, or the human cost of getting it wrong stated plainly. Write the second sentence of a consequence or a benefit as the thing a colleague would actually say, not the thing a policy would say. Concrete beats abstract every time  -  name the object, the record or the person, not the category. Draw the example from THIS route's own world, never from another one: if this route has told you not to write about equipment or worksites, do not reach for them here either. Never manufacture drama, exaggerate risk, or use fear to make a point  -  the pull comes from the detail being true and recognisable, not from the stakes being raised.

CARDS (generate in this order):
1. concept-anchor  -  conceptDefinition(48-64 words), significance(46-62 words: who this matters to, what changes when it is applied), keyTerms[3]{term(1-4 words), definition(22-30 words)}
2. theoretical-framework  -  frameworks[2-3]{name(2-6 words), originator(2-5 words), principle, limitation}
   -  if you return 2 frameworks: principle(50-62 words), limitation(34-44 words)
   -  if you return 3 frameworks: principle(34-42 words), limitation(22-28 words)
   -  fewer frameworks means each one carries more; the card total does not shrink
3. analytical-lens  -  heading(5-9 words), cognitiveConsiderations[5+](31-46 words each, each one carrying a concrete example)
4. ethics-considerations  -  heading(5-9 words), considerations[5+]{dimension(1-3 words, e.g. "Privacy"), description(30-43 words)}
5. case-study-1  -  title(4-8 words), context(80-104 words, 2nd person, specific details  -  names/dates/institutions), analysisPrompts[3](22-30 words each), keyInsight(24-34 words)
6. case-study-2  -  title(4-8 words, DIFFERENT context from Card 5), context(80-104 words, different setting), analysisPrompts[3](22-30 words each, different questions from Card 5), criticalReflection(30-38 words)`;

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

VOICE: Team leader coaching a colleague. Sentences under 20 words. Use "you". Focus on business impact: productivity, customer satisfaction, costs. No RTO audit language.

THIS ROUTE IS WORKPLACE TRAINING  -  it is not VET and not professional development.
The organisation is the reason this training exists, so every card should connect to something the
business measures or promises: the customer, the cost, the turnaround, the standard, the system of
record. Name real internal artefacts  -  the policy, the SOP, the queue, the ticket, the report.
Do NOT use RTO or assessment language: no units of competency, no performance criteria, no evidence,
no assessor, no "competent". Do NOT drift into personal growth or leadership philosophy either  -
this is how the work gets done here, to this standard, for this reason.

LENGTH  -  NOT NEGOTIABLE: the per-field word ranges below are the specification, and they are
authoritative. Hit every one of them. Summed across a card that lands between 180 and 300 words of
visible learner-facing text, which is the whole budget - there is no separate narration field to
write. A field written to the bottom of its range across a whole card produces a card that is too
thin to teach from, so write to the middle of each range or above.
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

CARDS (generate in this order):
1. hook-scenario  -  keyPoints[4]{title(3-5 words), icon, text(EXACTLY 2 sentences, 42-58 words in total, 2nd person, specific: name the place, the time of day, the system or equipment, what the learner can see or hear. The first sentence sets the scene, the second says what is happening or what it costs you  -  never one long run-on sentence)}, highlightText(optional, max 20 words)
2. concept-explainer  -  keyPoints[3]{title(3-5 words), text(36-52 words)}, heading(the internal policy, SOP or service standard this sits under  -  the document a colleague would actually be sent to, by its real name), keyInfo(28-40 words  -  what the business requires and what it is protecting: the cost, the customer commitment or the risk it exists to prevent), summaryLine(16-24 words linking to Card 1)
3. mental-model  -  steps[4-5]{step(verb-led, 3-6 words), icon, detail(37-42 words naming the system, screen, form or report the work actually happens in: what you do in it, what you check before moving on, and what tells you it is done. The test is whether a colleague could follow it without asking where anything lives)}
4. applied-scenario  -  keyPoints[4]{title(3-5 words), icon, text(EXACTLY 2 sentences, 42-58 words in total. The first sentence sets the situation, the second says what you do about it or what it costs you  -  never one long run-on sentence)}  -  the SAME job and the SAME people as Card 1, later the same day or on the next shift. The place may move (a different bay, room, vehicle, client or site) but the learner and the task carry over, and this card must open by naming what has changed since Card 1. This card renders under a "Continuing the scenario" banner, so an unrelated new scenario reads to the learner as a mistake, highlightText(optional, max 20 words)
5. mistakes  -  errorItems[5]{error(verb or "Not...", 6-10 words), icon, consequence(EXACTLY 2 sentences, 34-46 words in total. Sentence one states the specific business, safety or regulatory impact. Sentence two makes it land on a real person: name the customer, colleague or team member standing in it and what it costs them, in plain words  -  "The customer who waited three days for that callback is the one who tells forty people about it.")}
6. competency-summary  -  title(topic-specific, phrased as the standard the team is held to  -  NOT "You Are Ready When You Can"), standardItems[5]{text(verb-first, 6-10 words  -  a short label, not a sentence), benefit(14-22 words. Not an abstract virtue  -  what it saves, prevents or protects, named concretely: the callback that never happens, the escalation that stops at you, the customer who stays. "The order you check twice is the one nobody has to apologise for on Monday.")}, errorItems[5]{error(verb or "Not...", 10-12 words), consequence(14-18 words)}
7. decision-point  -  heading(the question itself, 20-30 words, 2nd person, compliance stakes), standardItems[1]{text(the ONE correct answer, 10-16 words), consequence(30-42 words explaining why it is right)}, errorItems[3]{error(a plausible wrong answer, 10-16 words), consequence(26-36 words explaining why it is wrong)}
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

VOICE: Experienced colleague coaching a peer. Sentences under 25 words. Conversational but professional. Use "you" and "your team". No trade-specific or VET language.

THIS ROUTE IS PROFESSIONAL DEVELOPMENT  -  it is not VET and not workplace training.
The subject is judgement, not procedure. These cards live in conversations, decisions and
relationships: what you notice, what you say next, what you choose not to say, how you read the room,
how you repair it when it goes wrong. Give the learner words they could actually use.
Do NOT use VET language (units, competency, evidence, assessor) and do NOT reduce this to a compliance
step or a system to follow. Do NOT name equipment, PPE or worksites unless the topic is genuinely
about them. If a card could be satisfied by following a checklist, it is the wrong card.

LENGTH  -  NOT NEGOTIABLE: the per-field word ranges below are the specification, and they are
authoritative. Hit every one of them. Summed across a card that lands between 180 and 300 words of
visible learner-facing text, which is the whole budget - there is no separate narration field to
write. A field written to the bottom of its range across a whole card produces a card that is too
thin to teach from, so write to the middle of each range or above.
Sentences stay under 25 words  -  reaching the word count means MORE sentences carrying more
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

CARDS (generate in this order):
1. hook-scenario  -  keyPoints[4]{title(3-5 words), icon, text(EXACTLY 2 sentences, 42-58 words in total, 2nd person, specific professional detail: who is in the room, the deadline, what was said, what is at stake. The first sentence sets the scene, the second says what is happening or what it costs you  -  never one long run-on sentence)}, highlightText(optional, max 20 words)
2. concept-explainer  -  keyPoints[3]{title(3-5 words), text(36-52 words)}, heading(the name of the principle, model or professional standard this rests on  -  NOT a law, act or regulation), keyInfo(28-40 words  -  what that principle actually requires of the practitioner, in plain English), summaryLine(16-24 words linking to Card 1)
3. mental-model  -  steps[4-5]{step(verb-led, 3-6 words), icon, detail(37-42 words of what this looks like in a real interaction: the move you make, roughly the words you would use, and how you know it landed. Judgement calls, not procedure  -  say what you are reading in the other person)}
4. applied-scenario  -  keyPoints[4]{title(3-5 words), icon, text(EXACTLY 2 sentences, 42-58 words in total. The first sentence sets the situation, the second says what you do about it or what it costs you  -  never one long run-on sentence)}  -  the SAME role and the SAME people as Card 1, later the same day or the next time this comes up. The place may move (a different meeting, call, one-to-one or client) but the learner and the situation carry over, and this card must open by naming what has changed since Card 1. This card renders under a "Continuing the scenario" banner, so an unrelated new scenario reads to the learner as a mistake, highlightText(optional, max 20 words)
5. mistakes  -  errorItems[5]{error(verb or "Assuming...", 6-10 words), icon, consequence(EXACTLY 2 sentences, 34-46 words in total. Sentence one states the specific professional or relational impact. Sentence two makes it land on a real person: name the colleague, report or client who carries it and what it costs them, in plain words  -  "The team member who stopped raising problems six months ago did not go quiet by accident.")}
6. competency-summary  -  title(topic-specific, phrased as the capability being built  -  NOT "You Are Ready When You Can"), standardItems[5]{text(verb-first, 6-10 words  -  a short label, not a sentence), benefit(14-22 words. Not an abstract virtue  -  what it changes in the relationship or the room, the way a trusted colleague would put it. "As the nurse on an emergency ward, asking for feedback early is how a small mistake stays small." Make it the moment the learner recognises, not a principle they already agree with)}, errorItems[5]{error(verb or "Assuming...", 10-12 words), consequence(14-18 words)}
7. decision-point  -  heading(the question itself, 20-30 words, 2nd person, professional judgment), standardItems[1]{text(the ONE correct answer, 10-16 words), consequence(30-42 words explaining why it is right)}, errorItems[3]{error(a plausible wrong answer, 10-16 words), consequence(26-36 words explaining why it is wrong)}
   ANSWER-LENGTH PARITY (all routes): the correct answer and all three wrong answers MUST be the same length and the same level of detail  -  every option 10-16 words, each naming a specific action. A learner must not be able to pick the answer by spotting the longest or most detailed option. Wrong answers are complete, plausible strategies that a reasonable person might choose, never two-word stubs ("Offer training") and never absurd ("Do everything at once"). Do not append a justification, benefit or outcome clause to the correct answer that the wrong answers do not also have  -  that reasoning belongs in consequence, not in text.
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

5. decision-point  -  title, question, options[4]{text(10-16 words), correct, feedback}
   ANSWER-LENGTH PARITY: all four options MUST be the same length and the same level of detail (10-16 words each, each naming a specific action). The correct one must not be the longest, the most detailed, or the only one carrying a justification clause. Wrong options are complete, plausible choices, not two-word stubs and not absurd.
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
        if (context.courseName) { lines.push(`- Part of: ${context.courseName}`); }

        // v13.92: the v13.91 mechanism-structure pin is gone with the card it pinned.
        // Card 3 is now examples-and-application, which has no structure to choose.

        return `${langPrefix}Write a short-course text module: 4 short prose cards plus 1 question card.

CONTEXT:
${lines.join('\n')}
${topic.keyPoints?.length ? `\nPOINTS THAT MUST BE COVERED: ${ccTextList(topic.keyPoints).join('; ')}` : ''}
${context.additionalInstructions ? `\nAUTHOR INSTRUCTIONS: ${context.additionalInstructions}` : ''}
${context.priorityContent ? `\nREFERENCE MATERIAL:\n${context.priorityContent.substring(0, 12000)}` : ''}

Write all 5 cards in order: overview, key-concepts, examples-application, key-takeaways, decision-point.
Remember: no heading fields on cards 1-4, exactly two paragraphs each, 55-70 words per paragraph, and never the characters backslash-n anywhere.${langSuffix}`;
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
    const ccVarietyBlock = (title, mode) => {
        const pool = (mode === 'pd') ? CC_SCENARIO_OPENINGS_PD : CC_SCENARIO_OPENINGS;
        const open1 = ccVarietyPick(title, pool);
        let open2 = ccVarietyPick(title + '~4', pool);
        if (open2 === open1) {
            open2 = pool[(pool.indexOf(open1) + 3) % pool.length];
        }
        return `

VARIETY  -  this section sits alongside others in the same course and must not read like them.
Open Card 1 on ${open1}. Open Card 4 on ${open2}.
Do not open either card with "It is", "You are", "As a" or "Imagine". Name people by their job role
rather than "the worker" or "the employee". Card 4 keeps Card 1's people and task by design, so vary
the TIME and the PLACE between them, not who is there. Pick the per-item icons from what each item
actually means, so two sections do not carry the same four icons in the same order.`;
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

Generate the full 7-card sequence.${ccVarietyBlock(topic.title || topic.name || '', context.mode)}${langSuffix}`;
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

Generate the full 7-card sequence.${ccVarietyBlock(topic.title || topic.name || '', context.mode)}${langSuffix}`;
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

Generate the full 7-card sequence.${ccVarietyBlock(topic.title || topic.name || '', context.mode)}${langSuffix}`;
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
${context.location || context.country ? `- Jurisdiction for any legal, regulatory or professional-body reference: ${context.location || context.country}${context.state ? `, ${context.state}` : ''}` : ''}
${topic.outcome ? `\nLEARNING OUTCOME: ${topic.outcome}` : ''}
${topic.keyPoints?.length ? `\nKEY POINTS: ${ccTextList(topic.keyPoints).join('; ')}` : ''}
${context.additionalInstructions ? `\nAUTHOR INSTRUCTIONS: ${context.additionalInstructions}` : ''}
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
- hook-scenario: keyPoints[] (4 objects: title (3-5 words) / icon / text (EXACTLY 2 sentences, 42-58 words: the first sets the scene, the second says what is happening or what it costs you  -  never one run-on sentence)) (70+ words)
- concept-explainer: keyPoints[] (3 objects: title/text), heading, keyInfo, summaryLine (70+ words)
- mental-model: steps[] (4-5 objects: step/icon/detail) (70+ words)
- applied-scenario: keyPoints[] (4 objects: title (3-5 words) / icon / text (EXACTLY 2 sentences, 42-58 words: the first sets the situation, the second says what you do about it or what it costs you)). Same job and same people as hook-scenario, later the same day  -  it renders under a "Continuing the scenario" banner (70+ words)
- mistakes: errorItems[] (5 objects: error (6-10 words) / icon / consequence (EXACTLY 2 sentences, 34-46 words: sentence one is the specific impact, sentence two makes it land on a real person  -  name who carries it and what it costs them))
- competency-summary: standardItems[] (5 objects: text (verb-first label, 6-10 words) + benefit (14-22 words: what it changes for a real person in this role, the way a colleague would say it)), errorItems[] (5 objects: error/consequence) (70+ words, ends "Now, complete the activity below.")
- decision-point: heading (the question, 18-30 words), standardItems[] (1 object: text/consequence  -  the correct answer), errorItems[] (3 objects: error/consequence  -  the wrong answers). All four option texts must be 10-16 words and equally detailed  -  the correct answer must not stand out by length

MAKE IT LAND: any field you rewrite must keep at least one sentence a person could picture  -  a named role
doing a named thing, or the human cost of getting it wrong stated plainly. Concrete beats abstract. Never
manufacture drama or raise the stakes to make a point.

UNCHANGED CARDS MUST BE RETURNED EXACTLY AS PROVIDED  -  do not modify formatting, wording, or structure.
If a card has one issue, fix ONLY that field. Do NOT regenerate the entire card.
A repaired field must never come back shorter than the range above. If a field is already in range, return it byte-for-byte unchanged.

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
- concept-anchor: conceptDefinition (48-64 words), significance (46-62 words), keyTerms[3] (term 1-4 words / definition 22-30 words)
- theoretical-framework: frameworks[2-3] (name/originator/principle/limitation). With 2 frameworks: principle 50-62 words, limitation 34-44. With 3: principle 34-42, limitation 22-28
- analytical-lens: heading (5-9 words), cognitiveConsiderations[5+] (31-46 words each, each carrying a concrete example)
- ethics-considerations: heading (5-9 words), considerations[5+] (dimension 1-3 words / description 30-43 words)
- case-study-1: title (4-8 words), context (80-104 words), analysisPrompts[3] (22-30 words each), keyInsight (24-34 words)
- case-study-2: title (4-8 words), context (80-104 words, a different setting from case-study-1), analysisPrompts[3] (22-30 words each), criticalReflection (30-38 words)

MAKE IT LAND: any field you rewrite must keep at least one sentence a person could picture  -  a named role
doing a named thing, or the human cost of getting it wrong stated plainly. Concrete beats abstract. Never
manufacture drama or raise the stakes to make a point.

UNCHANGED CARDS MUST BE RETURNED EXACTLY AS PROVIDED  -  do not modify formatting, wording, or structure.
If a card has one issue, fix ONLY that field. Do NOT regenerate the entire card.
A repaired field must never come back shorter than the range above. If a field is already in range, return it byte-for-byte unchanged.

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
- hook-scenario: keyPoints[] (4 objects: title (3-5 words) / icon / text (EXACTLY 2 sentences, 42-58 words: the first sets the scene, the second says what is happening or what it costs you  -  never one run-on sentence)) (70+ words)
- concept-explainer: keyPoints[] (3 objects: title/text), heading, keyInfo, summaryLine (70+ words)
- mental-model: steps[] (4-5 objects: step/icon/detail) (70+ words)
- applied-scenario: keyPoints[] (4 objects: title (3-5 words) / icon / text (EXACTLY 2 sentences, 42-58 words: the first sets the situation, the second says what you do about it or what it costs you)). Same job and same people as hook-scenario, later the same day  -  it renders under a "Continuing the scenario" banner (70+ words)
- mistakes: errorItems[] (5 objects: error (6-10 words) / icon / consequence (EXACTLY 2 sentences, 34-46 words: sentence one is the specific impact, sentence two makes it land on a real person  -  name who carries it and what it costs them))
- competency-summary: standardItems[] (5 objects: text (verb-first label, 6-10 words) + benefit (14-22 words: what it changes for a real person in this role, the way a colleague would say it)), errorItems[] (5 objects: error/consequence) (70+ words, ends "Now, complete the activity below.")
- decision-point: heading (the question, 18-30 words), standardItems[] (1 object: text/consequence  -  the correct answer), errorItems[] (3 objects: error/consequence  -  the wrong answers). All four option texts must be 10-16 words and equally detailed  -  the correct answer must not stand out by length

MAKE IT LAND: any field you rewrite must keep at least one sentence a person could picture  -  a named role
doing a named thing, or the human cost of getting it wrong stated plainly. Concrete beats abstract. Never
manufacture drama or raise the stakes to make a point.

UNCHANGED CARDS MUST BE RETURNED EXACTLY AS PROVIDED  -  do not modify formatting, wording, or structure.
If a card has one issue, fix ONLY that field. Do NOT regenerate the entire card.
A repaired field must never come back shorter than the range above. If a field is already in range, return it byte-for-byte unchanged.

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
- hook-scenario: keyPoints[] (4 objects: title (3-5 words) / icon / text (EXACTLY 2 sentences, 42-58 words: the first sets the scene, the second says what is happening or what it costs you  -  never one run-on sentence)) (70+ words)
- concept-explainer: keyPoints[] (3 objects: title/text), heading, keyInfo, summaryLine (70+ words)
- mental-model: steps[] (4-5 objects: step/icon/detail) (70+ words)
- applied-scenario: keyPoints[] (4 objects: title (3-5 words) / icon / text (EXACTLY 2 sentences, 42-58 words: the first sets the situation, the second says what you do about it or what it costs you)). Same job and same people as hook-scenario, later the same day  -  it renders under a "Continuing the scenario" banner (70+ words)
- mistakes: errorItems[] (5 objects: error (6-10 words) / icon / consequence (EXACTLY 2 sentences, 34-46 words: sentence one is the specific impact, sentence two makes it land on a real person  -  name who carries it and what it costs them))
- competency-summary: standardItems[] (5 objects: text (verb-first label, 6-10 words) + benefit (14-22 words: what it changes for a real person in this role, the way a colleague would say it)), errorItems[] (5 objects: error/consequence) (70+ words, ends "Now, complete the activity below.")
- decision-point: heading (the question, 18-30 words), standardItems[] (1 object: text/consequence  -  the correct answer), errorItems[] (3 objects: error/consequence  -  the wrong answers). All four option texts must be 10-16 words and equally detailed  -  the correct answer must not stand out by length

MAKE IT LAND: any field you rewrite must keep at least one sentence a person could picture  -  a named role
doing a named thing, or the human cost of getting it wrong stated plainly. Concrete beats abstract. Never
manufacture drama or raise the stakes to make a point.

UNCHANGED CARDS MUST BE RETURNED EXACTLY AS PROVIDED  -  do not modify formatting, wording, or structure.
If a card has one issue, fix ONLY that field. Do NOT regenerate the entire card.
A repaired field must never come back shorter than the range above. If a field is already in range, return it byte-for-byte unchanged.

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
        // v13.91: Route 5 - Topics and Text.
        TOPICSTEXT_SYSTEM_PROMPT: TOPICSTEXT_SYSTEM_PROMPT,
        buildTopicsTextUserPrompt: buildTopicsTextUserPrompt,
        getFiveCardSystemPromptForMode: getFiveCardSystemPromptForMode,
        buildFiveCardUserPrompt: buildFiveCardUserPrompt,
        normalizeCards: normalizeCards,
        validateBannedWords: validateBannedWords,
        BANNED_WORDS: BANNED_WORDS,
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
        getCardSchemaForMode: getCardSchemaForMode,
        getCardCountForMode: getCardCountForMode,
        BLOOMS_LEVEL_INSTRUCTIONS: BLOOMS_LEVEL_INSTRUCTIONS,
        getLangPrefixForUserPrompt: getLangPrefixForUserPrompt,
        getLangSuffixForUserPrompt: getLangSuffixForUserPrompt
    };
});
