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
 * Content Creator v6.6.65 - Route-Specific Topic Planner
 * [SPEC] Card-based policies/procedures structure
 * [SPEC] VET: TGA data  ->  Topics/Subtopics with PC/KE/PE/FS mappings (competency-based)
 * [SPEC] Workplace: Document-based  ->  Topics/Subtopics with policy/procedure focus (business impact)
 * [SPEC] University: Outcomes  ->  Topics/Subtopics with Bloom's alignment (academic rigor)
 * [SPEC] Credits: the per-subtopic price is CC_CREDITS_PER_SUBTOPIC in builder.js
 * 
 * v6.6.65: PC REWRITING FOR INSTRUCTIONAL CLARITY
 * [SPEC] Official TGA PCs are COVERED but rewritten for learner engagement
 * [SPEC] Each subtopic stores pcMapping: { pcNumber, officialPC, instructionalPC, coverageNote }
 * [SPEC] Enables audit-traceable compliance mapping for RTOs
 *
 * @module     mod_contentcreator/planner
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
define(['mod_contentcreator/cc-state'], function(CcState) {
    'use strict';

    // World-Class Topic-End Activities (v6.4.4)
    // These replace the legacy activity types with ChatGPT-designed pedagogical activities
    const ACTIVITY_TYPES = {
        SCENARIO_BRANCHING: 'scenario-branching',      // FLAGSHIP - multi-step decisions with consequences
        BEST_RESPONSE: 'best-response',                 // Response classification matrix (good/acceptable/poor)
        WHAT_WENT_WRONG: 'what-went-wrong',            // Case analysis - identify errors, correct approach
        TASK_SEQUENCING: 'task-sequencing',            // Process ordering - order 6-8 steps correctly
        ESCALATION_DECISION: 'escalation-decision',    // Responsibility judgement - handle/clarify/escalate
        MICRO_REFLECTION: 'micro-reflection'           // Structured reflection - 3 targeted prompts
    };

    // Bloom's Taxonomy verb mapping to world-class activity types
    const BLOOM_VERB_MAPPING = {
        // Decision-making verbs  ->  Scenario Branching (FLAGSHIP)
        decide: [ACTIVITY_TYPES.SCENARIO_BRANCHING],
        choose: [ACTIVITY_TYPES.SCENARIO_BRANCHING],
        judge: [ACTIVITY_TYPES.SCENARIO_BRANCHING, ACTIVITY_TYPES.ESCALATION_DECISION],
        determine: [ACTIVITY_TYPES.SCENARIO_BRANCHING],
        
        // Evaluation verbs  ->  Best Response / What Went Wrong
        evaluate: [ACTIVITY_TYPES.BEST_RESPONSE, ACTIVITY_TYPES.WHAT_WENT_WRONG],
        assess: [ACTIVITY_TYPES.BEST_RESPONSE, ACTIVITY_TYPES.ESCALATION_DECISION],
        analyse: [ACTIVITY_TYPES.WHAT_WENT_WRONG, ACTIVITY_TYPES.BEST_RESPONSE],
        analyze: [ACTIVITY_TYPES.WHAT_WENT_WRONG, ACTIVITY_TYPES.BEST_RESPONSE],
        compare: [ACTIVITY_TYPES.BEST_RESPONSE],
        
        // Identification verbs  ->  What Went Wrong / Best Response
        identify: [ACTIVITY_TYPES.WHAT_WENT_WRONG, ACTIVITY_TYPES.BEST_RESPONSE],
        recognise: [ACTIVITY_TYPES.WHAT_WENT_WRONG],
        recognize: [ACTIVITY_TYPES.WHAT_WENT_WRONG],
        detect: [ACTIVITY_TYPES.WHAT_WENT_WRONG],
        
        // Procedural verbs  ->  Task Sequencing
        sequence: [ACTIVITY_TYPES.TASK_SEQUENCING],
        order: [ACTIVITY_TYPES.TASK_SEQUENCING],
        arrange: [ACTIVITY_TYPES.TASK_SEQUENCING],
        implement: [ACTIVITY_TYPES.TASK_SEQUENCING, ACTIVITY_TYPES.SCENARIO_BRANCHING],
        follow: [ACTIVITY_TYPES.TASK_SEQUENCING],
        complete: [ACTIVITY_TYPES.TASK_SEQUENCING],
        perform: [ACTIVITY_TYPES.TASK_SEQUENCING],
        
        // Application verbs  ->  Scenario Branching / Task Sequencing
        apply: [ACTIVITY_TYPES.SCENARIO_BRANCHING, ACTIVITY_TYPES.TASK_SEQUENCING],
        use: [ACTIVITY_TYPES.SCENARIO_BRANCHING, ACTIVITY_TYPES.TASK_SEQUENCING],
        demonstrate: [ACTIVITY_TYPES.TASK_SEQUENCING, ACTIVITY_TYPES.SCENARIO_BRANCHING],
        
        // Communication/escalation verbs  ->  Escalation Decision
        report: [ACTIVITY_TYPES.ESCALATION_DECISION],
        escalate: [ACTIVITY_TYPES.ESCALATION_DECISION],
        communicate: [ACTIVITY_TYPES.ESCALATION_DECISION, ACTIVITY_TYPES.SCENARIO_BRANCHING],
        consult: [ACTIVITY_TYPES.ESCALATION_DECISION],
        
        // Reflection verbs  ->  Micro Reflection
        reflect: [ACTIVITY_TYPES.MICRO_REFLECTION],
        consider: [ACTIVITY_TYPES.MICRO_REFLECTION, ACTIVITY_TYPES.SCENARIO_BRANCHING],
        review: [ACTIVITY_TYPES.MICRO_REFLECTION, ACTIVITY_TYPES.WHAT_WENT_WRONG],
        explain: [ACTIVITY_TYPES.MICRO_REFLECTION],
        
        // Default/general verbs
        select: [ACTIVITY_TYPES.BEST_RESPONSE, ACTIVITY_TYPES.SCENARIO_BRANCHING],
        respond: [ACTIVITY_TYPES.BEST_RESPONSE, ACTIVITY_TYPES.ESCALATION_DECISION]
    };

    // v15 WORLD-CLASS: Four teacher-facing routes. Legacy pd/topicstext remain readable,
    // but new generation should normalise them to General. Pedagogy is selected from the
    // learning job, not from the old route name.
    const WORLD_CLASS_ROUTES = Object.freeze(['vet', 'workplace', 'university', 'general', 'policy']);
    const normaliseRoute = (mode) => {
        if (mode === 'pd' || mode === 'topicstext') return 'general';
        return WORLD_CLASS_ROUTES.includes(mode) ? mode : 'general';
    };

    const LEARNING_JOB_HINTS = Object.freeze({
        procedure: ['perform', 'complete', 'follow', 'operate', 'use', 'sequence', 'implement'],
        decision: ['decide', 'choose', 'judge', 'determine', 'select', 'prioritise', 'prioritize'],
        troubleshooting: ['diagnose', 'troubleshoot', 'fault', 'investigate', 'test', 'correct'],
        risk: ['hazard', 'risk', 'control', 'safety', 'incident', 'verify'],
        communication: ['communicate', 'feedback', 'coach', 'complaint', 'consult', 'conversation'],
        analysis: ['analyse', 'analyze', 'evaluate', 'compare', 'critique', 'synthesise', 'synthesize'],
        behaviour: ['habit', 'behaviour', 'behavior', 'conduct', 'culture', 'practice'],
        concept: ['understand', 'explain', 'describe', 'recognise', 'recognize']
    });

    const classifyLearningJob = (text) => {
        const haystack = String(text || '').toLowerCase();
        let best = 'concept';
        let bestScore = 0;
        Object.keys(LEARNING_JOB_HINTS).forEach((job) => {
            const score = LEARNING_JOB_HINTS[job].reduce((n, term) => n + (haystack.includes(term) ? 1 : 0), 0);
            if (score > bestScore) { best = job; bestScore = score; }
        });
        return best;
    };

    // =======================================================================
    // v15.3.0: POLICY - the syllabus is the document's own table of contents
    // =======================================================================
    //
    // Every other route derives its topic and subtopic counts from a requested course
    // DURATION (see DURATION_CONFIG below): a 10-minute course gets 3 topics of 2. That
    // is right when the author is commissioning training and the shape is theirs to
    // choose. It is backwards for a policy, where the syllabus already exists - the
    // document has sections, and those sections ARE the topics. Asking "how long should
    // this be?" about a Code of Conduct produces a course that stops in the middle of
    // clause 7 because the clock ran out.
    //
    // So a policy course has exactly as many subtopics as the policy has sections.

    /** Section headings a policy document actually uses. */
    const POLICY_HEADING_PATTERNS = [
        // "3." / "3.2" / "3.2.1" followed by a title on the same line.
        /^\s*(\d+(?:\.\d+)*)[.)]?\s+([A-Z][^\n]{2,80})$/,
        // "SECTION 4 - REPORTING" or "Section 4: Reporting".
        /^\s*(?:SECTION|CLAUSE|PART|ARTICLE)\s+(\d+(?:\.\d+)*)\s*[-–:.]?\s*([^\n]{2,80})$/i,
        // A short ALL-CAPS line on its own, which is how most policies title a section.
        /^\s*([A-Z][A-Z\s&'(),/-]{3,60})\s*$/
    ];

    /**
     * A heading is only a heading if what follows it is prose. Two consecutive
     * ALL-CAPS lines are a letterhead, not a syllabus.
     */
    const POLICY_MIN_SECTION_WORDS = 25;

    /**
     * Split a policy document into its own sections.
     *
     * @param {String} text The extracted document text.
     * @return {Array} [{title, body, wordCount}] in document order.
     */
    const splitPolicySections = (text) => {
        const lines = String(text || '').split(/\r?\n/);
        const found = [];
        lines.forEach((line, i) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.length > 90) { return; }
            for (let p = 0; p < POLICY_HEADING_PATTERNS.length; p++) {
                const m = trimmed.match(POLICY_HEADING_PATTERNS[p]);
                if (!m) { continue; }
                // The last pattern captures the whole line as the title; the numbered
                // ones capture the number and the title separately.
                const title = (m[2] || m[1] || '').trim();
                if (!title || title.length < 3) { break; }
                found.push({ line: i, title: title.replace(/\s+/g, ' ') });
                break;
            }
        });
        if (!found.length) { return []; }

        // v15.3.6: keep the PREAMBLE.
        //
        // Bodies started at the first heading, so everything above it was discarded - and
        // in a policy that is routinely the part that matters: the purpose statement, the
        // definitions, and often the headline penalty. A course generated from the
        // document would simply never mention them.
        const preambleLines = lines.slice(0, found[0].line);
        const preambleBody = preambleLines.join('\n').trim();
        const preambleWords = preambleBody ? preambleBody.split(/\s+/).filter(Boolean).length : 0;

        const sections = found.map((h, idx) => {
            const from = h.line + 1;
            const to = idx + 1 < found.length ? found[idx + 1].line : lines.length;
            const body = lines.slice(from, to).join('\n').trim();
            return { title: h.title, body: body, wordCount: body ? body.split(/\s+/).filter(Boolean).length : 0 };
        });

        // Fold a section too short to teach into the one that follows it. A one-line
        // "Purpose" heading above a substantial "Scope" section is a label, not a
        // syllabus entry, and turning it into its own six-card pack would spend a
        // learner's attention - and a generation credit - on nothing.
        const merged = [];
        // The preamble has no heading of its own, so it is carried into the first section
        // exactly as a too-short section would be. Below the fold-threshold it is a title
        // block and belongs with what follows; above it, it is content in its own right
        // and the fold loop will keep it as its own section.
        let carry = preambleWords
            ? { title: 'Purpose and scope', body: preambleBody, wordCount: preambleWords }
            : null;
        sections.forEach((sec) => {
            if (carry) {
                sec = {
                    title: carry.title + ' & ' + sec.title,
                    body: (carry.body + '\n' + sec.body).trim(),
                    wordCount: carry.wordCount + sec.wordCount
                };
                carry = null;
            }
            if (sec.wordCount < POLICY_MIN_SECTION_WORDS) { carry = sec; return; }
            merged.push(sec);
        });
        // A trailing short section has nothing after it to fold into, so it joins the
        // one before - or stands alone if it is the only thing there is.
        if (carry) {
            if (merged.length) {
                const last = merged[merged.length - 1];
                last.title = last.title + ' & ' + carry.title;
                last.body = (last.body + '\n' + carry.body).trim();
                last.wordCount += carry.wordCount;
            } else {
                merged.push(carry);
            }
        }
        return merged;
    };

    /**
     * Plan a Policy & Compliance course from the document's own structure.
     *
     * Returns null when the document has no usable heading structure, so the caller
     * falls back to the ordinary duration-shaped plan rather than producing a
     * one-section course from a document the splitter could not read.
     *
     * @param {String} documentText The extracted policy text.
     * @param {Object} context      Generation context (policy metadata, etc).
     * @return {Object|null} A topic plan, or null.
     */
    /**
     * Most subtopics a policy course may plan.
     *
     * v15.3.6: every other route is capped by DURATION_CONFIG at 5 topics x 3 subtopics.
     * This path had no bound at all, so a 150-clause policy planned 150 subtopics - 150
     * generations, each billed. Given this product's history with per-subtopic billing
     * that is a real hazard, not a theoretical one. Sections past the cap are folded into
     * the last one rather than dropped, so no clause is silently lost from the course.
     */
    const POLICY_MAX_SUBTOPICS = 15;

    const planPolicyTopics = (documentText, context) => {
        let sections = splitPolicySections(documentText);
        // One section is not a structure - it means the splitter found a heading and no
        // others, which is indistinguishable from finding nothing useful.
        if (sections.length < 2) { return null; }
        if (sections.length > POLICY_MAX_SUBTOPICS) {
            const kept = sections.slice(0, POLICY_MAX_SUBTOPICS - 1);
            const rest = sections.slice(POLICY_MAX_SUBTOPICS - 1);
            kept.push({
                title: rest[0].title + ' and ' + (rest.length - 1) + ' further section'
                    + (rest.length > 2 ? 's' : ''),
                body: rest.map(function(r) { return r.title + '\n' + r.body; }).join('\n\n'),
                wordCount: rest.reduce(function(n, r) { return n + r.wordCount; }, 0)
            });
            sections = kept;
        }

        const meta = (context && context.policyMeta) || {};
        const policyName = String(meta.title || (context && context.topic) || 'Policy').trim();
        // selectActivityType takes the types already spent, so a course does not open with
        // the same activity five times. Every other planner path threads this; passing one
        // argument throws inside its .filter().
        const usedActivityTypes = [];

        return {
            source: 'document-structure',
            policyName: policyName,
            topics: [{
                id: 'policy-1',
                title: policyName,
                subtopics: sections.map((sec, i) => ({
                    id: 'policy-1-' + (i + 1),
                    // v15.3.6c: billingKey, number and activityType - present on every
                    // other planner path and missing here.
                    //
                    // The vendor uses billingKey to recognise a voiceover or image call as
                    // already paid for inside the subtopic price. Blank, every TTS and
                    // image call on a Policy pack is billed separately and a structural
                    // repair is billed as a second subtopic. This plugin already has a
                    // doc titled "URGENT revenue leak: subtopics billed 1 credit"; this is
                    // the same class of defect, and it went live the moment the mode ===
                    // 'policy' planner branch made this function reachable at all.
                    billingKey: (CcState && CcState.newBillingKey) ? CcState.newBillingKey() : '',
                    number: i + 1,
                    activityType: (function() {
                        const t = selectActivityType(sec.title + ' ' + sec.body.slice(0, 200),
                            usedActivityTypes);
                        usedActivityTypes.push(t);
                        return t;
                    }()),
                    title: sec.title,
                    // The section's own text, threaded into the generation context by
                    // generator.js so policyFidelityIssues() compares a card against THIS
                    // clause rather than the whole document - a figure lifted from an
                    // unrelated section is then caught instead of passing because it
                    // appeared somewhere in the file. Wired up in v15.3.6; before that this
                    // field was written and never read, and the claim above was false.
                    sourceExtract: sec.body,
                    wordCount: sec.wordCount,
                    learningJob: classifyLearningJob(sec.title + ' ' + sec.body.slice(0, 400))
                }))
            }]
        };
    };

    /**
     * Attach each planned subtopic to the clause of the document it is about.
     *
     * FIX-CC-POLICY-PLAN-OVERRIDE (v15.4.5). The Policy route used to plan from the
     * document's table of contents INSTEAD of from what the author ticked, so a
     * three-subtopic selection built a fifteen-subtopic course - the cap, not a
     * coincidence - and the author was billed for all fifteen. The wizard requires a
     * selection ("Please select at least one Major Learning Topic") and then discarded
     * it, which is worse than not asking.
     *
     * The author's selection now decides the shape. The document still decides the
     * SOURCE: this matches each chosen subtopic to the clause it names, so
     * policyFidelityIssues() still checks a card against its own clause rather than
     * against the whole file. A subtopic that matches nothing keeps an empty extract
     * and falls back to the whole document, which is what the check did before
     * per-clause extracts existed.
     *
     * @param {Object} plan         A plan from planWorkplaceTopics/planUniversityTopics.
     * @param {String} documentText The extracted policy text.
     * @return {Object} The same plan, with sourceExtract filled in where it could be.
     */
    const groundPolicySubtopics = (plan, documentText) => {
        const sections = splitPolicySections(String(documentText || ''));
        if (!plan || !plan.topics || sections.length < 1) { return plan; }

        const words = (s) => String(s || '').toLowerCase().match(/[a-z0-9]+/g) || [];
        // Words too common in policy headings to carry any signal about WHICH clause.
        const STOP = ['and', 'or', 'the', 'of', 'to', 'a', 'an', 'for', 'in', 'on', 'at',
            'this', 'that', 'policy', 'procedure', 'section', 'clause', 'part'];
        // Numbers are kept whatever their length: in a policy heading a bare number is
        // the clause number, which is the most distinguishing token there is.
        const keyWords = (s) => words(s)
            .filter(w => (w.length > 2 || /^\d+$/.test(w)) && STOP.indexOf(w) === -1);

        const used = [];
        plan.topics.forEach(function(topic) {
            (topic.subtopics || []).forEach(function(sub) {
                if (sub.sourceExtract) { return; }
                const want = keyWords(sub.title);
                if (!want.length) { return; }
                let best = null;
                let bestScore = 0;
                sections.forEach(function(sec, i) {
                    const have = keyWords(sec.title);
                    if (!have.length) { return; }
                    const hits = want.filter(w => have.indexOf(w) !== -1).length;
                    if (!hits) { return; }
                    // Normalise by the shorter side so "Scope" matching the "Scope"
                    // clause beats "Scope" matching "Purpose, scope and application".
                    let score = hits / Math.min(want.length, have.length);
                    // A clause already claimed by an earlier subtopic is still allowed -
                    // two chosen subtopics may legitimately teach one long clause - but
                    // an unclaimed clause of equal strength wins.
                    if (used.indexOf(i) !== -1) { score -= 0.01; }
                    if (score > bestScore) { bestScore = score; best = i; }
                });
                // Half the shorter title's key words must line up. Below that the match
                // is a coincidence, and a wrong extract is worse than none: the fidelity
                // check would then flag every correct figure in the card as invented.
                if (best !== null && bestScore >= 0.5) {
                    sub.sourceExtract = sections[best].body;
                    sub.sourceHeading = sections[best].title;
                    used.push(best);
                }
            });
        });
        return plan;
    };

    const DURATION_CONFIG = {
        5: { topics: 2, subtopicsPerTopic: 2 },
        10: { topics: 3, subtopicsPerTopic: 2 },
        15: { topics: 4, subtopicsPerTopic: 3 },
        20: { topics: 5, subtopicsPerTopic: 3 }
    };

    const extractVerb = (text) => {
        if (!text) return null;
        const normalised = text.toLowerCase().trim();
        for (const verb of Object.keys(BLOOM_VERB_MAPPING)) {
            if (normalised.includes(verb)) {
                return verb;
            }
        }
        return null;
    };

    const selectActivityType = (text, usedTypes) => {
        const verb = extractVerb(text);
        let candidates = [];
        
        if (verb && BLOOM_VERB_MAPPING[verb]) {
            candidates = BLOOM_VERB_MAPPING[verb].filter(t => !usedTypes.includes(t));
        }
        
        if (candidates.length === 0) {
            const allTypes = Object.values(ACTIVITY_TYPES);
            candidates = allTypes.filter(t => !usedTypes.includes(t));
        }
        
        if (candidates.length === 0) {
            candidates = Object.values(ACTIVITY_TYPES);
        }
        
        // v9.79 FIX (B-03): Math.random() caused a different activity type to be selected
        // each time a section was regenerated, breaking teacher consistency. Using candidates[0]
        // (the highest-priority type for the Bloom verb) gives a stable, deterministic result.
        return candidates[0];
    };

    /**
     * Plan topics from VET TGA data using Major Topics (ChatGPT's two-stage model)
     * Each selected Major Topic  ->  1-3 UI Topics  ->  2-5 Subtopics each
     * Elements/PCs are hidden compliance metadata only
     */
    const planVETTopics = (tgaData, duration, context, selectedMajorTopics) => {
        
        const config = DURATION_CONFIG[duration] || DURATION_CONFIG[10];
        const ke = tgaData.knowledgeEvidence || [];
        const pe = tgaData.performanceEvidence || [];
        const fs = tgaData.foundationSkills || [];
        const ac = tgaData.assessmentConditions || [];

        // v15: Source-grounded VET evidence must reach the card-generation prompt, not
        // stop at the planner. AI mapping objects usually carry evidence codes; resolve
        // those codes back to the official TGA text so each subtopic can teach and assess
        // the requirement without inventing detail.
        const evidenceText = function(item) {
            if (item === null || item === undefined) return '';
            if (typeof item === 'string') return item.trim();
            return String(item.text || item.description || item.requirement || item.title || item.name || '').trim();
        };
        const evidenceCode = function(item) {
            if (!item || typeof item === 'string') return '';
            return String(item.code || item.id || item.number || '').trim();
        };
        const resolveEvidence = function(items, refs) {
            const wanted = (Array.isArray(refs) ? refs : []).map(function(v) {
                if (typeof v === 'string') return v.trim();
                return String(v?.code || v?.id || v?.text || '').trim();
            }).filter(Boolean);
            if (!wanted.length) return [];
            const out = [];
            items.forEach(function(item) {
                const code = evidenceCode(item);
                const text = evidenceText(item);
                const hit = wanted.some(function(ref) {
                    return (code && ref === code) || (text && (ref === text || text.indexOf(ref) !== -1 || ref.indexOf(text) !== -1));
                });
                if (hit && text && out.indexOf(text) === -1) out.push(text);
            });
            // If the mapping itself already contains full text rather than a code, keep it.
            wanted.forEach(function(ref) {
                const looksLikeText = /\s/.test(ref) && ref.length > 12;
                if (looksLikeText && out.indexOf(ref) === -1) out.push(ref);
            });
            return out;
        };

        const topics = [];
        const usedActivityTypes = [];
        
        // Use selected Major Topics if provided (ChatGPT's model)
        if (selectedMajorTopics && selectedMajorTopics.length > 0) {
            selectedMajorTopics.forEach((majorTopic, mtIdx) => {
                // v10.53: Preserve actual element number (e.g. Element 2 stays 2, not 1)
                // majorTopic.elementNumber is set in builder.js suggestedMajorTopics map.
                // mtIdx is 0-based position in the filtered/selected array, which is WRONG
                // when the user selects only Element 2 (mtIdx=0  ->  1, not 2).
                const actualElNum = majorTopic.elementNumber || (mtIdx + 1);
                // v9.80 FIX (B-04): Removed dead empty nested forEach(subtopics) + if/else block.
                // The inner subtopics.forEach had an empty body  -  no processing occurred inside it.
                // The if/else guard was equally empty. Both iterated the subtopics array for nothing.
                const subtopics = [];
                
                // AI-generated subtopics are required - error if not provided
                const aiSubtopics = majorTopic.subtopics || [];
                if (aiSubtopics.length === 0) {
                    throw new Error(`AI failed to generate subtopics for major topic: ${majorTopic.title}`);
                }
                
                // Get PCs from coverage summary
                const coveredPCs = majorTopic.coverageSummary?.performanceCriteria || [];
                const coveredPCTexts = majorTopic.coverageSummary?.performanceCriteriaTexts || [];
                
                // FIX: Define subtopicCount for this scope
                const subtopicCount = aiSubtopics.length;
                
                for (let s = 0; s < aiSubtopics.length; s++) {
                    const pcCode = coveredPCs[s] || '';
                    const pcText = coveredPCTexts[s] || '';
                    const aiSubtopic = aiSubtopics[s];
                    
                    if (!aiSubtopic?.title) {
                        throw new Error(`AI failed to generate title for subtopic ${s + 1} in topic: ${majorTopic.title}`);
                    }
                    
                    let subtopicTitle = aiSubtopic.title;
                    if (pcCode) {
                        if (pcText) {
                            const capped = pcText.charAt(0).toUpperCase() + pcText.slice(1);
                            subtopicTitle = pcCode + '. ' + (capped.endsWith('.') ? capped : capped + '.');
                        } else if (!subtopicTitle.match(/^\d+\.\d+[.\s]/)) {
                            const cleaned = subtopicTitle.replace(/^[\d.]+\s*/, '').trim();
                            const capped = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
                            subtopicTitle = pcCode + '. ' + (capped.endsWith('.') ? capped : capped + '.');
                        }
                    }
                    const subtopicDescription = aiSubtopic.description || '';
                    
                    const mappings = [];
                    if (pcCode) mappings.push(pcCode);
                    
                    // Distribute KE across subtopics
                    const kePerSubtopic = Math.ceil(ke.length / (selectedMajorTopics.length * subtopicCount));
                    const keStart = (mtIdx * subtopicCount + s) * kePerSubtopic;
                    ke.slice(keStart, keStart + kePerSubtopic).forEach(k => {
                        if (k.code) mappings.push(k.code);
                    });
                    
                    // Each subtopic gets its own activity (v6.4.4)
                    // Activities are completed in sequence at the end of each topic
                    const activityType = selectActivityType(subtopicTitle, usedActivityTypes);
                    usedActivityTypes.push(activityType);
                    
                    // v6.9.36: Use AI-generated keyPoints directly - v7.0 says 3-5 decision-capable points is ideal
                    let keyPoints = aiSubtopic.keyPoints || aiSubtopic.topics || [];
                    if (!Array.isArray(keyPoints) || keyPoints.length === 0) {
                        // v6.9.36: FALLBACK ONLY - should rarely trigger if AI is working
                        // Generate minimal decision-capable keyPoints from PC title
                        const titleClean = subtopicTitle.replace(/^[\d.]+\s*/, '').trim();
                        const words = titleClean.split(/\s+/);
                        const firstVerb = words[0]?.replace(/[,;]/g, '') || 'Determine';
                        const restOfTitle = words.slice(1).join(' ').replace(/^,?\s*(and\s+)?/i, '');
                        
                        // v6.9.36: Generate 3 decision-capable keyPoints (NOT boilerplate)
                        // Each must pass "Could two workers disagree?" test
                        keyPoints = [
                            `Determine when to ${firstVerb.toLowerCase()} ${restOfTitle}`,
                            `Assess whether the approach to ${restOfTitle} is appropriate for the situation`,
                            `Identify when ${restOfTitle} requires escalation or additional authorisation`
                        ];
                    }
                    // v6.9.36: REMOVED BOILERPLATE PADDING - v7.0 architecture says 3-5 keyPoints is ideal
                    // DO NOT pad with "Verify X meets requirements" / "Document X as per procedures" / "Report issues to supervisor"
                    // These are EXACTLY the boilerplate patterns v7.0 was designed to eliminate
                    // If AI returns 3 good decision-capable keyPoints, that's better than 6 with boilerplate
                    // No cap - allow 7+ keyPoints for full coverage
                    
                    // v6.5.32: Preserve AI-generated coversMappings for Excel export
                    // AI returns { pc: [...], ke: [...], pe: [...], fs: [...] }
                    const aiCoversMappings = aiSubtopic.coversMappings || {};
                    const coversMappings = {
                        pc: Array.isArray(aiCoversMappings.pc) ? aiCoversMappings.pc : [],
                        ke: Array.isArray(aiCoversMappings.ke) ? aiCoversMappings.ke : [],
                        pe: Array.isArray(aiCoversMappings.pe) ? aiCoversMappings.pe : [],
                        fs: Array.isArray(aiCoversMappings.fs) ? aiCoversMappings.fs : []
                    };
                    const coverageSummary = majorTopic.coverageSummary || {};
                    const keRefs = coversMappings.ke.length ? coversMappings.ke : (coverageSummary.knowledgeEvidence || []);
                    const peRefs = coversMappings.pe.length ? coversMappings.pe : (coverageSummary.performanceEvidence || []);
                    const fsRefs = coversMappings.fs.length ? coversMappings.fs : (coverageSummary.foundationSkills || []);
                    const subtopicKnowledgeEvidence = resolveEvidence(ke, keRefs);
                    const subtopicPerformanceEvidence = resolveEvidence(pe, peRefs);
                    const subtopicFoundationSkills = resolveEvidence(fs, fsRefs);
                    const subtopicAssessmentConditions = (Array.isArray(ac) ? ac : [ac]).map(evidenceText).filter(Boolean);
                    
                    // v6.6.65: PC Mapping for Instructional Clarity
                    // Stores both official TGA PC and AI-rewritten instructional PC
                    // Enables: learner engagement + auditor compliance verification
                    const pcMapping = aiSubtopic.pcMapping || {
                        pcNumber: pcCode || '',
                        officialPC: aiSubtopic.officialPC || '',
                        instructionalPC: aiSubtopic.instructionalPC || subtopicTitle,
                        coverageNote: aiSubtopic.coverageNote || 'Subtopic directly addresses this PC'
                    };
                    
                    subtopics.push({
                        id: aiSubtopic?.id || `subtopic_${mtIdx}_${s}`,
                        billingKey: CcState.newBillingKey(), // FIX-CC-SUBTOPIC-BILLING-KEY (v13.95.2): carried by every vendor call for this subtopic.
                        // v10.53: Use actualElNum so Element 2  ->  2.1, 2.2 (not 1.1, 1.2)
                        number: `${actualElNum}.${s + 1}`,
                        pcNumber: aiSubtopic.pcNumber || pcCode || `${actualElNum}.${s + 1}`,
                        title: subtopicTitle,
                        description: subtopicDescription,
                        mappings: mappings.slice(0, 4),
                        coversMappings: coversMappings, // v6.5.32: Structured mappings for Excel
                        pcMapping: pcMapping, // v6.6.65: Audit mapping (officialPC  ->  instructionalPC)
                        keyPoints: keyPoints, // Minimum 3, no maximum
                        activityType: activityType, // Each subtopic has its own activity
                        majorTopicId: majorTopic.id,
                        // v9.83 FIX (ELEMENT-1): Inject element + PC context so buildVetFiveCardUserPrompt
                        // can emit "ELEMENT:" and "PERFORMANCE CRITERIA:" lines in the AI prompt.
                        // Without these fields the prompt had no element/PC context and the AI generated
                        // generic content unrelated to the selected element.
                        elementText: (context && context.selectedElement && context.selectedElement.title)
                            ? context.selectedElement.title
                            : (majorTopic.elementTitle || ''),
                        criterionText: pcText || '',
                        knowledgeEvidence: subtopicKnowledgeEvidence,
                        performanceEvidence: subtopicPerformanceEvidence,
                        foundationSkills: subtopicFoundationSkills,
                        assessmentConditions: subtopicAssessmentConditions
                    });
                }
                
                topics.push({
                    // v10.53: Use actualElNum so topic id matches /Element\s*(\d+)/i regex in renderer
                    id: `Element ${actualElNum}`,
                    number: actualElNum,
                    title: majorTopic.title,
                    description: majorTopic.description,
                    majorTopicId: majorTopic.id,
                    complianceMap: majorTopic.coverageSummary,
                    subtopics: subtopics,
                    // v9.83 FIX (ELEMENT-1): Carry element title at topic level for generators/renderers
                    elementText: (context && context.selectedElement && context.selectedElement.title)
                        ? context.selectedElement.title
                        : (majorTopic.elementTitle || '')
                });
            });
        } else {
            // Fallback: use elements directly (legacy mode)
            const elements = tgaData.elements || [];
            const flattenedPC = [];
            elements.forEach((el, elIndex) => {
                const elementPCs = el.performanceCriteria || [];
                elementPCs.forEach((pc, pcIndex) => {
                    flattenedPC.push({
                        text: typeof pc === 'string' ? pc : (pc.text || pc.description || `PC ${elIndex + 1}.${pcIndex + 1}`),
                        code: typeof pc === 'string' ? `${elIndex + 1}.${pcIndex + 1}` : (pc.code || `${elIndex + 1}.${pcIndex + 1}`),
                        elementIndex: elIndex
                    });
                });
            });
            
            const pc = flattenedPC.length > 0 ? flattenedPC : (tgaData.performanceCriteria || []);
            const topicCount = Math.min(config.topics, Math.max(2, elements.length || 3));

            if (elements.length > 0) {
                const elementsPerTopic = Math.ceil(elements.length / topicCount);

                for (let t = 0; t < topicCount; t++) {
                    const topicElements = elements.slice(t * elementsPerTopic, (t + 1) * elementsPerTopic);
                    if (topicElements.length === 0) continue;

                    const primaryElement = topicElements[0];
                    // FIX v10.43: Apply inline element name truncation (cleanElementName is in builder.js scope,
                    // not available here). If the element name exceeds 150 chars it contains leaked PC body text.
                    const _rawTitle = primaryElement.name || primaryElement.title || primaryElement.text || primaryElement.description || `Topic ${t + 1}`;
                    const topicTitle = _rawTitle.length > 150
                        ? (() => { const t2 = _rawTitle.substring(0, 130); const sp = t2.lastIndexOf(' '); return (sp > 30 ? t2.substring(0, sp) : t2).trim(); })()
                        : _rawTitle;

                    const relatedPC = pc.filter(p => {
                        if (p.elementIndex !== undefined) {
                            return p.elementIndex === t;
                        }
                        const code = p.code || p.id || '';
                        const elementNum = (t + 1).toString();
                        return code.startsWith(elementNum + '.') || code.startsWith('PC' + elementNum + '.');
                    });

                    const subtopics = [];
                    const subtopicCount = Math.min(config.subtopicsPerTopic, Math.max(1, relatedPC.length || 1));

                    for (let s = 0; s < subtopicCount; s++) {
                        const pcItem = relatedPC[s] || { text: `Section ${s + 1}`, code: '' };
                        let subtopicTitle = pcItem.text || `Section ${s + 1}`;
                        if (pcItem.code) {
                            const cleaned = subtopicTitle.replace(/^[\d.]+\s*/, '').trim();
                            const capped = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
                            subtopicTitle = pcItem.code + '. ' + (capped.endsWith('.') ? capped : capped + '.');
                        }

                        const mappings = [];
                        if (pcItem.code) mappings.push(pcItem.code);

                        const relatedKE = ke.slice(Math.floor(s * ke.length / subtopicCount), 
                                                   Math.floor((s + 1) * ke.length / subtopicCount));
                        relatedKE.forEach(k => {
                            if (k.code) mappings.push(k.code);
                        });

                        if (s < pe.length) {
                            mappings.push(pe[s].code || `PE${s + 1}`);
                        }

                        if (s < fs.length) {
                            mappings.push(`FS${s + 1}`);
                        }

                        const activityType = selectActivityType(pcItem.text, usedActivityTypes);
                        usedActivityTypes.push(activityType);

                        // v6.5.32: Build coversMappings from collected codes
                        const keCodes = relatedKE.map(k => k.code).filter(Boolean);
                        const peCodes = s < pe.length ? [pe[s].code || `PE${s + 1}`] : [];
                        const fsCodes = s < fs.length ? [`FS${s + 1}`] : [];

                        subtopics.push({
                            id: `subtopic_${t}_${s}`,
                            billingKey: CcState.newBillingKey(), // FIX-CC-SUBTOPIC-BILLING-KEY (v13.95.2): carried by every vendor call for this subtopic.
                            number: `${t + 1}.${s + 1}`,
                            title: subtopicTitle,
                            mappings: mappings.slice(0, 4),
                            coversMappings: {
                                pc: pcItem.code ? [pcItem.code] : [],
                                ke: keCodes,
                                pe: peCodes,
                                fs: fsCodes
                            },
                            activityType: activityType,
                            pc: pcItem,
                            elementText: primaryElement?.title || primaryElement?.name || '',
                            criterionText: pcItem.text || '',
                            knowledgeEvidence: relatedKE.map(evidenceText).filter(Boolean),
                            performanceEvidence: s < pe.length ? [evidenceText(pe[s])].filter(Boolean) : [],
                            foundationSkills: s < fs.length ? [evidenceText(fs[s])].filter(Boolean) : [],
                            assessmentConditions: (Array.isArray(ac) ? ac : [ac]).map(evidenceText).filter(Boolean)
                        });
                    }

                    topics.push({
                        id: `topic_${t}`,
                        number: t + 1,
                        title: topicTitle,
                        element: primaryElement,
                        subtopics: subtopics
                    });
                }
            } else {
                for (let t = 0; t < topicCount; t++) {
                    const subtopics = [];
                    for (let s = 0; s < config.subtopicsPerTopic; s++) {
                        const pcIndex = t * config.subtopicsPerTopic + s;
                        const pcItem = pc[pcIndex] || { text: `Learning Point ${s + 1}`, code: `PC${t + 1}.${s + 1}` };
                        
                        const activityType = selectActivityType(pcItem.text, usedActivityTypes);
                        usedActivityTypes.push(activityType);

                        // v6.7.24: Use FULL PC text for subtopic title - no truncation
                        subtopics.push({
                            id: `subtopic_${t}_${s}`,
                            billingKey: CcState.newBillingKey(), // FIX-CC-SUBTOPIC-BILLING-KEY (v13.95.2): carried by every vendor call for this subtopic.
                            number: `${t + 1}.${s + 1}`,
                            title: pcItem.text || `Section ${s + 1}`,
                            mappings: [pcItem.code || `PC${t + 1}.${s + 1}`],
                            activityType: activityType,
                            criterionText: pcItem.text || '',
                            knowledgeEvidence: ke.slice(Math.floor(pcIndex * ke.length / Math.max(1, pc.length)), Math.floor((pcIndex + 1) * ke.length / Math.max(1, pc.length))).map(evidenceText).filter(Boolean),
                            performanceEvidence: pe.length ? [evidenceText(pe[pcIndex % pe.length])].filter(Boolean) : [],
                            foundationSkills: fs.length ? [evidenceText(fs[pcIndex % fs.length])].filter(Boolean) : [],
                            assessmentConditions: (Array.isArray(ac) ? ac : [ac]).map(evidenceText).filter(Boolean)
                        });
                    }

                    topics.push({
                        id: `topic_${t}`,
                        number: t + 1,
                        title: `Topic ${t + 1}: Key Concepts`,
                        subtopics: subtopics
                    });
                }
            }
        }

        // Calculate coverage from all topics using ACTUAL mappings from AI response
        // v6.5.9 FIX: Extract coverage from coversMappings in subtopics AND coverageSummary in topics
        const allPCs = [];
        const allKEs = [];
        const allPEs = [];
        const allFSs = [];
        
        // Find the original major topics to get coversMappings from subtopics
        const originalTopics = selectedMajorTopics || [];
        
        topics.forEach((t, tIdx) => {
            // Get PCs from topic-level coverageSummary (complianceMap)
            if (t.complianceMap?.performanceCriteria) {
                allPCs.push(...t.complianceMap.performanceCriteria);
            }
            if (t.complianceMap?.knowledgeEvidence) {
                allKEs.push(...t.complianceMap.knowledgeEvidence);
            }
            if (t.complianceMap?.performanceEvidence) {
                allPEs.push(...t.complianceMap.performanceEvidence);
            }
            if (t.complianceMap?.foundationSkills) {
                allFSs.push(...t.complianceMap.foundationSkills);
            }
            
            // Also check original major topic's coverageSummary
            const originalTopic = originalTopics[tIdx];
            if (originalTopic?.coverageSummary) {
                if (originalTopic.coverageSummary.performanceCriteria) {
                    allPCs.push(...originalTopic.coverageSummary.performanceCriteria);
                }
                if (originalTopic.coverageSummary.knowledgeEvidence) {
                    allKEs.push(...originalTopic.coverageSummary.knowledgeEvidence);
                }
                if (originalTopic.coverageSummary.performanceEvidence) {
                    allPEs.push(...originalTopic.coverageSummary.performanceEvidence);
                }
                if (originalTopic.coverageSummary.foundationSkills) {
                    allFSs.push(...originalTopic.coverageSummary.foundationSkills);
                }
            }
            
            // Get from subtopics' coversMappings (most accurate source)
            const originalSubtopics = originalTopic?.subtopics || [];
            t.subtopics?.forEach((st, sIdx) => {
                // From legacy mappings array (PCs only)
                if (st.mappings) {
                    allPCs.push(...st.mappings.filter(m => m.match(/^\d+\.\d+/)));
                }
                
                // From original subtopic's coversMappings (AI response)
                const origSub = originalSubtopics[sIdx];
                if (origSub?.coversMappings) {
                    const cm = origSub.coversMappings;
                    if (cm.pc && Array.isArray(cm.pc)) allPCs.push(...cm.pc);
                    if (cm.ke && Array.isArray(cm.ke)) allKEs.push(...cm.ke);
                    if (cm.pe && Array.isArray(cm.pe)) allPEs.push(...cm.pe);
                    if (cm.fs && Array.isArray(cm.fs)) allFSs.push(...cm.fs);
                }
            });
        });
        
        const uniquePCs = [...new Set(allPCs)];
        const uniqueKEs = [...new Set(allKEs)];
        const uniquePEs = [...new Set(allPEs)];
        const uniqueFSs = [...new Set(allFSs)];
        

        const coverage = {
            pc: { covered: uniquePCs.length, total: tgaData.elements?.reduce((sum, el) => sum + (el.performanceCriteria?.length || 0), 0) || 1 },
            ke: { covered: uniqueKEs.length, total: ke.length || 0 },
            pe: { covered: uniquePEs.length, total: pe.length || 0 },
            fs: { covered: uniqueFSs.length, total: fs.length || 0 }
        };

        return {
            version: '6.5.0',
            mode: 'vet',
            unitCode: tgaData.unitCode,
            unitTitle: tgaData.unitTitle,
            context: context,
            topics: topics,
            coverage: coverage,
            totalTopics: topics.length,
            totalSubtopics: topics.reduce((sum, t) => sum + t.subtopics.length, 0),
            estimatedMinutes: duration
        };
    };

    /**
     * Plan topics from University learning outcomes
     * Groups outcomes  ->  Topics with Bloom's-aligned activities
     */
    const planUniversityTopics = (outcomes, duration, context, topicHierarchy) => {
        const topics = [];
        const usedActivityTypes = [];

        if (topicHierarchy && topicHierarchy.length > 0) {
            topicHierarchy.forEach((module, t) => {
                const subtopics = [];
                const subs = module.subtopics || [];

                for (let s = 0; s < subs.length; s++) {
                    const activityType = selectActivityType(subs[s], usedActivityTypes);
                    usedActivityTypes.push(activityType);
                    subtopics.push({
                        id: `subtopic_${t}_${s}`,
                        billingKey: CcState.newBillingKey(), // FIX-CC-SUBTOPIC-BILLING-KEY (v13.95.2): carried by every vendor call for this subtopic.
                        number: `${t + 1}.${s + 1}`,
                        title: subs[s],
                        mappings: [`LO${t + 1}`],
                        keyPoints: [],
                        activityType: activityType
                    });
                }

                if (subtopics.length === 0) {
                    const activityType = selectActivityType(module.title, usedActivityTypes);
                    usedActivityTypes.push(activityType);
                    subtopics.push({
                        id: `subtopic_${t}_0`,
                        billingKey: CcState.newBillingKey(), // FIX-CC-SUBTOPIC-BILLING-KEY (v13.95.2): carried by every vendor call for this subtopic.
                        number: `${t + 1}.1`,
                        title: module.title,
                        mappings: [`LO${t + 1}`],
                        keyPoints: [],
                        activityType: activityType
                    });
                }

                topics.push({
                    id: `topic_${t}`,
                    number: t + 1,
                    title: module.title.replace(/\.\s*$/, '').trim(),
                    subtopics: subtopics
                });
            });
        } else if (outcomes && outcomes.length > 0) {
            const majorTitle = (context?.courseTitle || context?.courseName || 'Major Topic').replace(/\.\s*$/, '').trim();
            const subtopics = [];
            for (let s = 0; s < outcomes.length; s++) {
                const activityType = selectActivityType(outcomes[s], usedActivityTypes);
                usedActivityTypes.push(activityType);
                subtopics.push({
                    id: `subtopic_0_${s}`,
                    billingKey: CcState.newBillingKey(), // FIX-CC-SUBTOPIC-BILLING-KEY (v13.95.2): carried by every vendor call for this subtopic.
                    number: `1.${s + 1}`,
                    title: outcomes[s].replace(/\.\s*$/, '').trim(),
                    mappings: [`LO${s + 1}`],
                    keyPoints: [],
                    activityType: activityType,
                    outcome: outcomes[s]
                });
            }
            topics.push({
                id: 'topic_0',
                number: 1,
                title: majorTitle,
                subtopics: subtopics
            });
        }

        return {
            version: '6.5.0',
            mode: 'university',
            context: context,
            topics: topics,
            totalTopics: topics.length,
            totalSubtopics: topics.reduce((sum, t) => sum + t.subtopics.length, 0),
            estimatedMinutes: duration
        };
    };

    /**
     * Plan topics from Workplace document-extracted topics (v6.4.0)
     * Uses AI-suggested topics from uploaded documents
     * Focus: Policy/procedure clarity, business impact framing, role-based content
     *
     * ------------------------------------------------------------------------
     * FIX-CC-WP-SUBTOPIC-DOUBLING (v15.4.5). ONE CARD ON SCREEN = ONE SUBTOPIC.
     *
     * The Workplace and Policy screen asks for ONE major topic ("This is your
     * major topic. AI will suggest sub topics (A, B, C) under it") and then
     * renders one tick-box card per suggestion. The author ticks the ones they
     * want and is told "N subtopics confirmed".
     *
     * This function used to read each of those cards as a TOPIC and then build
     * `Math.min(config.subtopicsPerTopic, Math.max(2, card.subtopics.length))`
     * sections beneath it - a hard floor of two. So three ticked cards became
     * six generated sections, seven became fourteen: every Workplace pack ever
     * built generated, and billed, at least double what its author selected.
     * Where a card carried no sub-list of its own the floor invented the
     * sections outright, and they shipped with the placeholder titles the
     * loop had made up:
     *
     *     Reporting            (the card the author ticked)
     *       1. Section 1       <- invented, billed, and shown to learners
     *       2. Section 2       <- invented, billed, and shown to learners
     *
     * It also produced N topics, so subtopic numbering restarted at each card
     * (1.1, 1.2, 2.1, 2.2...) on routes that are supposed to be one topic with
     * a flat series of subtopics - the shape general, pd, topicstext and
     * university already use, and the shape the numbering fix in v15.4.2
     * assumes.
     *
     * The card the author ticked is now the section that gets built: one topic,
     * one subtopic per ticked card, nothing invented and nothing multiplied.
     * A card's own sub-list is no longer a source of extra sections - it is the
     * key points of that one section, which is what it always described.
     *
     * @param {Array} workplaceTopics The cards the author ticked, in screen order.
     * @param {Number} duration       Requested course length, in minutes.
     * @param {Object} context        Generation context.
     * @return {Object} A topic plan of exactly workplaceTopics.length subtopics.
     */
    const planWorkplaceTopics = (workplaceTopics, duration, context) => {
        const usedActivityTypes = [];
        const ctx = context || {};

        if (!workplaceTopics || workplaceTopics.length === 0) {
            return {
                version: '6.5.0',
                mode: 'workplace',
                context: context,
                topics: [],
                totalTopics: 0,
                totalSubtopics: 0,
                estimatedMinutes: duration
            };
        }

        // The same bound the Policy planner uses. The vendor sizes its suggestion
        // list from the requested duration so this is not normally reached, but an
        // unbounded count here is a per-subtopic billing hazard and this product
        // has already shipped one of those.
        const cards = workplaceTopics.slice(0, POLICY_MAX_SUBTOPICS);

        const majorTitle = String(
            ctx.courseTitle || ctx.courseName || ctx.majorTopic || ctx.topic || 'Training'
        ).replace(/\.\s*$/, '').trim();

        const subtopics = cards.map(function(card, s) {
            const subtopicTitle = String((card && card.title) || ('Section ' + (s + 1))).trim();

            // Each subtopic gets its own activity (v6.4.4)
            const activityType = selectActivityType(subtopicTitle, usedActivityTypes);
            usedActivityTypes.push(activityType);

            // The card's own sub-list is what this section should COVER. Taking it as
            // the key points is what it was written to be; taking it as a list of
            // further sections is what caused the doubling above.
            const cardPoints = (Array.isArray(card && card.subtopics) ? card.subtopics : [])
                .map(function(sub) {
                    if (typeof sub === 'string') { return sub.trim(); }
                    return String((sub && (sub.title || sub.text || sub.description)) || '').trim();
                })
                .filter(Boolean);

            // v6.6.4: Workplace route - generate keyPoints dynamically from subtopic
            // Parse the subtopic title to extract action and object
            const subtopicWords = subtopicTitle.split(/\s+/);
            const actionVerb = subtopicWords[0] || 'Complete';
            const actionObject = subtopicWords.slice(1).join(' ');

            const dynamicWorkplaceKeyPoints = (card && card.keyPoints) || (cardPoints.length
                ? cardPoints
                : [
                    `${actionVerb} ${actionObject} according to your organisation's policy`,
                    `Follow the ${subtopicTitle.toLowerCase()} procedure for your role`,
                    `Confirm ${subtopicTitle.toLowerCase()} is documented and compliant`
                ]);

            return {
                id: `subtopic_0_${s}`,
                billingKey: CcState.newBillingKey(), // FIX-CC-SUBTOPIC-BILLING-KEY (v13.95.2): carried by every vendor call for this subtopic.
                // '1.N', matching planUniversityTopics - these routes are all one topic
                // with a flat series of subtopics, so the shape should not differ between
                // them. Only the VET display path reads this; every other route numbers
                // from the render order (builder.js renderTopicItem, v15.4.2).
                number: `1.${s + 1}`,
                title: subtopicTitle,
                description: String((card && card.description) || '').trim(),
                keyPoints: dynamicWorkplaceKeyPoints,
                activityType: activityType, // Each subtopic has its own activity
                policyReference: (card && card.policyReference) || null,
                sourceDocument: (card && card.sourceDocument) || null
            };
        });

        return {
            version: '6.5.0',
            mode: 'workplace',
            context: context,
            companyName: ctx.companyName || '',
            topics: [{
                id: 'topic_0',
                number: 1,
                title: majorTitle,
                description: '',
                subtopics: subtopics,
                sourceDocument: (cards[0] && cards[0].sourceDocument) || null
            }],
            totalTopics: 1,
            totalSubtopics: subtopics.length,
            estimatedMinutes: duration
        };
    };

    /**
     * Main entry point for topic planning
     * Called from builder.js after Step 2 validation
     * Uses ChatGPT's two-stage model: selectedMajorTopics  ->  Topics  ->  Subtopics
     */
    const planTopics = (inputs) => {
        
        const mode = normaliseRoute(inputs.mode);
        const { duration, context, tgaData, outcomes, selectedMajorTopics, workplaceTopics, topicHierarchy } = inputs;

        if (mode === 'vet' && tgaData) {
            const result = planVETTopics(tgaData, duration, context, selectedMajorTopics);
            return result;
        // v13.91.3: 'topicstext' plans exactly like 'pd' - a flat list of subtopics under one
        // major topic, taken from the author's outcomes. This was the ONE place Route 5 was
        // never wired in. builder.js sends it down the same branch as PD and hands planTopics
        // an `outcomes` array, but the mode test here did not name it, so every
        // Topics-and-Text build fell through to the throw below and the author saw
        // "Failed to generate topic structure. Please try again." before a single AI call was
        // made. planUniversityTopics is mode-agnostic - it reads only outcomes, duration and
        // context - so naming the mode here is the whole fix.
        } else if ((mode === 'university' || mode === 'general')
                   && (outcomes || topicHierarchy)) {
            return planUniversityTopics(outcomes, duration, context, topicHierarchy);
        } else if (mode === 'workplace' && (selectedMajorTopics || workplaceTopics)) {
            return planWorkplaceTopics(selectedMajorTopics || workplaceTopics, duration, context);
        // v15.3.6: POLICY. This branch did not exist, so every Policy & Compliance build
        // fell through to the throw below and the author saw "Failed to generate topic
        // structure" before a single AI call was made - the route could not be used at
        // all. Exactly the defect the comment above records for Topics-and-Text, repeated,
        // and planPolicyTopics() was unreachable dead code as a result.
        //
        // The document's own structure is preferred: a policy's syllabus is its table of
        // contents, not a duration. When the document has no usable headings
        // planPolicyTopics returns null and this falls back to the same author-outcomes
        // path Workplace uses, so a policy supplied as flat prose still builds.
        } else if (mode === 'policy') {
            const policyText = (context && (context.priorityContent || context.referenceMaterial
                || context.documentText)) || '';
            // FIX-CC-POLICY-PLAN-OVERRIDE (v15.4.5). THE AUTHOR'S SELECTION DECIDES THE
            // SHAPE; the document decides the source.
            //
            // This branch used to try planPolicyTopics FIRST and use the author's ticked
            // subtopics only when the document had no headings. Since validateStep2()
            // refuses to continue until the author has ticked at least one, and the
            // route refuses to run without a document at all, that meant the normal path
            // - a real policy with a table of contents - always threw the selection away.
            // Three ticked subtopics built a fifteen-subtopic course, because fifteen is
            // POLICY_MAX_SUBTOPICS and the document had more clauses than that. Fifteen
            // generations, fifteen images, fifteen voiceovers, all billed, none asked for.
            //
            // groundPolicySubtopics() keeps what the document plan was actually for:
            // each subtopic still carries the clause it teaches, so the fidelity check
            // still compares a card against its own clause.
            const chosen = selectedMajorTopics || workplaceTopics;
            if (chosen && chosen.length) {
                return groundPolicySubtopics(
                    planWorkplaceTopics(chosen, duration, context), policyText);
            }
            if (outcomes && outcomes.length) {
                return groundPolicySubtopics(
                    planUniversityTopics(outcomes, duration, context, topicHierarchy), policyText);
            }
            // No selection at all. The document's own table of contents is a better
            // course than nothing, and this is the path the Policy planner was written
            // for; it is now the fallback rather than the override.
            const structured = planPolicyTopics(policyText, context);
            if (structured) { return structured; }
            if (topicHierarchy) {
                return planUniversityTopics(outcomes, duration, context, topicHierarchy);
            }
            throw new Error('Invalid planning inputs: Policy & Compliance needs either a '
                + 'document with section headings, or selected topics to build from.');
        } else {
            throw new Error('Invalid planning inputs: missing required data for mode: ' + mode);
        }
    };

    const plan = (inputData) => {
        const mode = normaliseRoute(inputData.mode);
        const { context, criteria, duration } = inputData;
        const config = DURATION_CONFIG[duration] || DURATION_CONFIG[10];
        
        
        // FIX: Handle University mode where criteria is { outcomes: [...] }
        let criteriaArray = [];
        if ((mode === 'university' || mode === 'general') && criteria?.outcomes) {
            criteriaArray = criteria.outcomes.map((outcome, idx) => ({
                code: `LO${idx + 1}`,
                text: outcome
            }));
        } else if (mode === 'vet' && criteria?.elements) {
            // VET mode - flatten elements and PCs
            criteriaArray = [];
            criteria.elements.forEach((el, elIdx) => {
                const pcs = el.performanceCriteria || [];
                pcs.forEach((pc, pcIdx) => {
                    criteriaArray.push({
                        code: `${elIdx + 1}.${pcIdx + 1}`,
                        text: typeof pc === 'string' ? pc : (pc.text || pc.description || '')
                    });
                });
            });
        } else if (Array.isArray(criteria)) {
            criteriaArray = criteria;
        }
        // Any other shape (null, string, object without units) leaves criteriaArray empty,
        // which is handled below: the topic count falls back to the minimum of 2.
        
        const topicCount = Math.min(config.topics, Math.max(2, criteriaArray.length));
        const sectionsPerTopic = config.subtopicsPerTopic;
        
        
        const topics = [];
        const usedActivityTypes = [];
        let topicIndex = 0;
        let sectionIndex = 0;

        const criteriaPerTopic = Math.ceil(criteriaArray.length / topicCount);

        for (let t = 0; t < topicCount; t++) {
            const topicCriteria = criteriaArray.slice(t * criteriaPerTopic, (t + 1) * criteriaPerTopic);
            if (topicCriteria.length === 0) continue;

            const primaryCriterion = topicCriteria[0];
            const topicTitle = primaryCriterion.text ? 
                primaryCriterion.text.replace(/\.\s*$/, '').trim() :
                `Topic ${t + 1}`;

            const sections = [];

            const sectionCount = Math.min(sectionsPerTopic, topicCriteria.length);
            for (let s = 0; s < sectionCount; s++) {
                const criterion = topicCriteria[s] || topicCriteria[0];
                
                // Each section gets its own activity (v6.4.4)
                const activityType = selectActivityType(criterion.text, usedActivityTypes);
                usedActivityTypes.push(activityType);

                const sectionTitle = criterion.text ? 
                    criterion.text.replace(/\.\s*$/, '').trim() :
                    `Section ${s + 1}`;

                const criterionWords = (criterion.text || '').split(' ').filter(w => w.length > 3);
                const keyVerb = criterionWords[0] || 'Apply';
                const keyContext = criterionWords.slice(1).join(' ') || 'workplace requirements';
                sections.push({
                    id: `section_${sectionIndex++}`,
                    billingKey: CcState.newBillingKey(), // FIX-CC-SUBTOPIC-BILLING-KEY (v13.95.2): carried by every vendor call for this subtopic.
                    title: sectionTitle,
                    criterionCode: criterion.code || '',
                    criterionText: criterion.text || '',
                    keyPoints: [
                        `${keyVerb} ${keyContext}`,
                        `Complete ${keyVerb.toLowerCase()} tasks in workplace context`,
                        `Document and verify ${keyContext}`
                    ],
                    activityType: activityType
                });
            }

            topics.push({
                id: `topic_${topicIndex++}`,
                title: topicTitle,
                sections: sections
            });
        }

        return {
            version: '6.5.0',
            locked: false,
            createdAt: new Date().toISOString(),
            mode: mode,
            learningJob: classifyLearningJob((context?.desiredOutcome || '') + ' ' + (context?.courseTitle || context?.unitTitle || '') + ' ' + (context?.instructions || '')),
            context: context,
            topics: topics,
            totalSections: topics.reduce((sum, t) => sum + t.sections.length, 0),
            estimatedMinutes: duration
        };
    };

    return {
        plan: plan,
        planTopics: planTopics,
        planVETTopics: planVETTopics,
        planUniversityTopics: planUniversityTopics,
        planWorkplaceTopics: planWorkplaceTopics,
        // v15.3.0: Policy & Compliance plans from the document, not from a duration.
        planPolicyTopics: planPolicyTopics,
        groundPolicySubtopics: groundPolicySubtopics,
        splitPolicySections: splitPolicySections,
        ACTIVITY_TYPES: ACTIVITY_TYPES,
        selectActivityType: selectActivityType,
        normaliseRoute: normaliseRoute,
        classifyLearningJob: classifyLearningJob,
        WORLD_CLASS_ROUTES: WORLD_CLASS_ROUTES
    };
});
