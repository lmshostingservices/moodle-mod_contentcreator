/**
 * Content Creator v6.6.65 - Route-Specific Topic Planner
 * [SPEC] Card-based policies/procedures structure
 * [SPEC] VET: TGA data  ->  Topics/Subtopics with PC/KE/PE/FS mappings (competency-based)
 * [SPEC] Workplace: Document-based  ->  Topics/Subtopics with policy/procedure focus (business impact)
 * [SPEC] University: Outcomes  ->  Topics/Subtopics with Bloom's alignment (academic rigor)
 * [SPEC] Credits: 100 credits per subtopic
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
define(['mod_contentcreator/cc-state'], function (CcState) {
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
                        criterionText: pcText || ''
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
                            pc: pcItem
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
                            activityType: activityType
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
     */
    const planWorkplaceTopics = (workplaceTopics, duration, context) => {
        const config = DURATION_CONFIG[duration] || DURATION_CONFIG[10];
        const topics = [];
        const usedActivityTypes = [];

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

        workplaceTopics.forEach((topic, t) => {
            const subtopics = [];
            const topicSubtopics = topic.subtopics || [];
            const subtopicCount = Math.min(config.subtopicsPerTopic, Math.max(2, topicSubtopics.length));

            for (let s = 0; s < subtopicCount; s++) {
                const subtopicData = topicSubtopics[s] || { title: `Section ${s + 1}` };
                const subtopicTitle = subtopicData.title || `Section ${s + 1}`;
                
                // Each subtopic gets its own activity (v6.4.4)
                const activityType = selectActivityType(subtopicTitle, usedActivityTypes);
                usedActivityTypes.push(activityType);

                // v6.6.4: Workplace route - generate keyPoints dynamically from subtopic
                // Parse the subtopic title to extract action and object
                const subtopicWords = subtopicTitle.split(/\s+/);
                const actionVerb = subtopicWords[0] || 'Complete';
                const actionObject = subtopicWords.slice(1).join(' ');
                
                const dynamicWorkplaceKeyPoints = subtopicData.keyPoints || [
                    `${actionVerb} ${actionObject} according to your organisation's policy`,
                    `Follow the ${subtopicTitle.toLowerCase()} procedure for your role`,
                    `Confirm ${subtopicTitle.toLowerCase()} is documented and compliant`
                ];
                
                subtopics.push({
                    id: `subtopic_${t}_${s}`,
                    billingKey: CcState.newBillingKey(), // FIX-CC-SUBTOPIC-BILLING-KEY (v13.95.2): carried by every vendor call for this subtopic.
                    number: `${t + 1}.${s + 1}`,
                    title: subtopicTitle,
                    keyPoints: dynamicWorkplaceKeyPoints,
                    activityType: activityType, // Each subtopic has its own activity
                    policyReference: subtopicData.policyReference || null
                });
            }

            topics.push({
                id: topic.id || `topic_${t}`,
                number: t + 1,
                title: topic.title || `Topic ${t + 1}`,
                description: topic.description || '',
                subtopics: subtopics,
                sourceDocument: topic.sourceDocument || null
            });
        });

        return {
            version: '6.5.0',
            mode: 'workplace',
            context: context,
            companyName: context.companyName || '',
            topics: topics,
            totalTopics: topics.length,
            totalSubtopics: topics.reduce((sum, t) => sum + t.subtopics.length, 0),
            estimatedMinutes: duration
        };
    };

    /**
     * Main entry point for topic planning
     * Called from builder.js after Step 2 validation
     * Uses ChatGPT's two-stage model: selectedMajorTopics  ->  Topics  ->  Subtopics
     */
    const planTopics = (inputs) => {
        
        const { mode, duration, context, tgaData, outcomes, selectedMajorTopics, workplaceTopics, topicHierarchy } = inputs;

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
        } else if ((mode === 'university' || mode === 'pd' || mode === 'topicstext')
                   && (outcomes || topicHierarchy)) {
            return planUniversityTopics(outcomes, duration, context, topicHierarchy);
        } else if (mode === 'workplace' && (selectedMajorTopics || workplaceTopics)) {
            return planWorkplaceTopics(selectedMajorTopics || workplaceTopics, duration, context);
        } else {
            throw new Error('Invalid planning inputs: missing required data for mode: ' + mode);
        }
    };

    const plan = (inputData) => {
        const { mode, context, criteria, duration } = inputData;
        const config = DURATION_CONFIG[duration] || DURATION_CONFIG[10];
        
        
        // FIX: Handle University mode where criteria is { outcomes: [...] }
        let criteriaArray = [];
        if (mode === 'university' && criteria?.outcomes) {
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
        ACTIVITY_TYPES: ACTIVITY_TYPES,
        selectActivityType: selectActivityType
    };
});
