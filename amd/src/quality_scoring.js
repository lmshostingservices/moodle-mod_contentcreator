/**
 * Content Creator v6.6.31 - Deterministic Quality Scoring Module
 * 
 * CHATGPT SIGNED OFF: January 8, 2026
 * 
 * This module provides deterministic heuristics for evaluating content quality.
 * It converts subjective quality judgments into:
 * - Binary gate checks (pass/fail)
 * - Numeric scores (0-100)
 * - Automated rewrite triggers
 * 
 * @module     mod_contentcreator/quality_scoring
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
define([], function () {
    'use strict';

    // ===========================================================================
    // WORD LISTS - Deterministic Detection
    // ===========================================================================

    const BANNED_VERBS = [
        'learn', 'understand', 'know', 'be aware of', 'practice', 'ensure', 
        'familiarise', 'familiarize', 'appreciate', 'recognise', 'recognize'
    ];

    const OBSERVABLE_VERBS = [
        'inspect', 'check', 'verify', 'install', 'secure', 'isolate', 'tag',
        'document', 'report', 'stop', 'escalate', 'apply', 'remove', 'attach',
        'connect', 'disconnect', 'tighten', 'loosen', 'measure', 'mark',
        'position', 'lift', 'lower', 'move', 'transport', 'store', 'dispose',
        'wear', 'fit', 'adjust', 'test', 'calibrate', 'record', 'notify',
        'complete', 'sign', 'submit', 'obtain', 'confirm', 'review'
    ];

    const DECISION_VERBS = [
        'stop work', 'escalate', 'tag out', 'isolate', 'report', 'reassess',
        'notify supervisor', 'halt', 'suspend', 'quarantine', 'reject'
    ];

    const OFFICE_SAFE_PHRASES = [
        'in the workplace', 'appropriate measures', 'ensure safety',
        'be aware of risks', 'follow procedures', 'maintain standards',
        'professional conduct', 'effective communication', 'team collaboration',
        'via email', 'by email', 'send email', 'email', 'meeting room',
        'desk', 'computer', 'policy review', 'meeting'
    ];

    // Physical nouns that indicate real-world specificity
    const PHYSICAL_NOUN_PATTERNS = [
        'scaffold', 'harness', 'lanyard', 'guardrail', 'plank', 'coupler',
        'helmet', 'hard hat', 'gloves', 'boots', 'PPE', 'equipment',
        'machine', 'tool', 'vehicle', 'forklift', 'crane', 'ladder',
        'platform', 'deck', 'edge', 'barrier', 'fence', 'sign',
        'tag', 'permit', 'checklist', 'SWMS', 'JSA', 'form',
        'isolator', 'switch', 'valve', 'pipe', 'cable', 'wire'
    ];

    // Location/condition terms
    const LOCATION_CONDITION_TERMS = [
        'height', 'ground level', 'elevated', 'confined space', 'excavation',
        'site', 'work area', 'exclusion zone', 'access point', 'entry',
        'weather', 'wind', 'rain', 'heat', 'cold', 'wet', 'dry',
        'unstable', 'slippery', 'uneven', 'overhead', 'underground'
    ];

    // ===========================================================================
    // HELPER FUNCTIONS
    // ===========================================================================

    const countMatches = (text, patterns) => {
        const lowerText = text.toLowerCase();
        return patterns.filter(p => lowerText.includes(p.toLowerCase())).length;
    };

    const hasAnyMatch = (text, patterns) => {
        const lowerText = text.toLowerCase();
        return patterns.some(p => lowerText.includes(p.toLowerCase()));
    };

    const getBulletCount = (text) => {
        // Count bullet points (lines starting with - or * or numbered)
        const lines = text.split('\n').filter(l => l.trim());
        return Math.max(lines.length, 1);
    };

    // ===========================================================================
    // GATE CHECKS (Must Pass All)
    // ===========================================================================

    /**
     * Gate A: Structure Check
     * - Must have observable verbs
     * - Must NOT have banned verbs
     */
    const checkStructure = (content) => {
        const hasObservable = hasAnyMatch(content, OBSERVABLE_VERBS);
        const hasBanned = hasAnyMatch(content, BANNED_VERBS);
        
        return {
            passed: hasObservable && !hasBanned,
            hasObservableVerbs: hasObservable,
            hasBannedVerbs: hasBanned,
            reason: hasBanned ? 'Contains banned verbs' : 
                   !hasObservable ? 'No observable verbs found' : null
        };
    };

    /**
     * Gate B: Anti-Generic Check
     * - Must have physical nouns
     * - Must NOT be office-safe
     */
    const checkAntiGeneric = (content) => {
        const hasPhysical = hasAnyMatch(content, PHYSICAL_NOUN_PATTERNS);
        const isOfficeSafe = hasAnyMatch(content, OFFICE_SAFE_PHRASES);
        
        return {
            passed: hasPhysical && !isOfficeSafe,
            hasPhysicalNouns: hasPhysical,
            isOfficeSafe: isOfficeSafe,
            reason: isOfficeSafe ? 'Contains office-safe language' :
                   !hasPhysical ? 'No physical nouns found' : null
        };
    };

    /**
     * Gate C: Context Binding Check (Dynamic)
     * Only checks inputs that exist
     */
    const checkContextBinding = (content, context) => {
        const issues = [];
        
        // Job title binding
        if (context.jobTitle) {
            const jobTerms = context.jobTitle.toLowerCase().split(/\s+/);
            const hasJobSignal = jobTerms.some(term => 
                content.toLowerCase().includes(term) && term.length > 3
            );
            if (!hasJobSignal) {
                issues.push(`No job-specific terms for "${context.jobTitle}"`);
            }
        }
        
        // Industry binding
        if (context.industry) {
            const industryLower = context.industry.toLowerCase();
            const hasIndustrySignal = content.toLowerCase().includes(industryLower) ||
                hasAnyMatch(content, getIndustryTerms(context.industry));
            if (!hasIndustrySignal) {
                issues.push(`No industry terms for "${context.industry}"`);
            }
        }
        
        return {
            passed: issues.length === 0,
            issues: issues,
            reason: issues.length > 0 ? issues.join('; ') : null
        };
    };

    // Industry-specific term lists
    const getIndustryTerms = (industry) => {
        const terms = {
            'Construction': ['scaffold', 'site', 'crane', 'excavation', 'formwork', 'concrete'],
            'Mining': ['pit', 'shaft', 'ore', 'extraction', 'blast', 'haul'],
            'Manufacturing': ['machine', 'production', 'assembly', 'quality', 'line'],
            'Healthcare': ['patient', 'clinical', 'medication', 'treatment', 'ward'],
            'Transport': ['vehicle', 'load', 'route', 'driver', 'freight'],
            'Agriculture': ['farm', 'crop', 'livestock', 'harvest', 'irrigation']
        };
        return terms[industry] || [];
    };

    // ===========================================================================
    // SCORING FUNCTIONS (Deterministic)
    // ===========================================================================

    /**
     * Physical Specificity Score (25 points max)
     */
    const scorePhysicalSpecificity = (content) => {
        let score = 0;
        const bulletCount = getBulletCount(content);
        const physicalCount = countMatches(content, PHYSICAL_NOUN_PATTERNS);
        const observableCount = countMatches(content, OBSERVABLE_VERBS);
        const locationCount = countMatches(content, LOCATION_CONDITION_TERMS);
        
        if (physicalCount >= bulletCount) score += 10;
        else if (physicalCount > 0) score += 5;
        
        if (observableCount >= bulletCount) score += 10;
        else if (observableCount > 0) score += 5;
        
        if (locationCount >= 1) score += 5;
        
        return {
            score: Math.min(score, 25),
            physicalNouns: physicalCount,
            observableVerbs: observableCount,
            locationTerms: locationCount
        };
    };

    /**
     * Context Richness Score (25 points max)
     * Only scores inputs that exist
     */
    const scoreContextRichness = (content, context) => {
        let score = 0;
        const details = {};
        
        if (context.jobTitle) {
            const jobTerms = context.jobTitle.toLowerCase().split(/\s+/);
            const hasJobNoun = jobTerms.some(term => 
                content.toLowerCase().includes(term) && term.length > 3
            );
            if (hasJobNoun) score += 10;
            details.jobTitle = hasJobNoun;
        }
        
        if (context.industry) {
            const industryTerms = getIndustryTerms(context.industry);
            const hasIndustryTerms = hasAnyMatch(content, industryTerms);
            if (hasIndustryTerms) score += 10;
            details.industry = hasIndustryTerms;
        }
        
        if (context.state) {
            const stateTerms = getStateTerms(context.state);
            const hasStateSignal = hasAnyMatch(content, stateTerms);
            if (hasStateSignal) score += 5;
            details.state = hasStateSignal;
        }
        
        return { score: Math.min(score, 25), details };
    };

    // State-specific terms (Australian states)
    const getStateTerms = (state) => {
        const terms = {
            'WA': ['western australia', 'wa', 'perth', 'pilbara', 'heat', 'remote'],
            'NSW': ['new south wales', 'nsw', 'sydney'],
            'VIC': ['victoria', 'vic', 'melbourne'],
            'QLD': ['queensland', 'qld', 'brisbane', 'tropical'],
            'SA': ['south australia', 'sa', 'adelaide'],
            'TAS': ['tasmania', 'tas', 'hobart'],
            'NT': ['northern territory', 'nt', 'darwin', 'remote', 'heat'],
            'ACT': ['australian capital territory', 'act', 'canberra']
        };
        return terms[state] || [];
    };

    /**
     * Decision Realism Score (20 points max)
     */
    const scoreDecisionRealism = (content) => {
        const hasDecisionVerb = hasAnyMatch(content, DECISION_VERBS);
        const hasStopWork = content.toLowerCase().includes('stop work');
        const hasEscalate = content.toLowerCase().includes('escalate');
        
        let score = 0;
        if (hasDecisionVerb) score += 10;
        if (hasStopWork || hasEscalate) score += 10;
        
        return {
            score: Math.min(score, 20),
            hasDecisionVerb,
            hasStopWork,
            hasEscalate
        };
    };

    /**
     * Terminology Authenticity Score (15 points max)
     */
    const scoreTerminology = (content, context) => {
        if (!context.industry) return { score: 0, density: 0 };
        
        const industryTerms = getIndustryTerms(context.industry);
        const termCount = countMatches(content, industryTerms);
        const wordCount = content.split(/\s+/).length;
        const density = termCount / wordCount;
        
        let score = 0;
        if (density >= 0.15) score = 15;
        else if (density >= 0.08) score = 12;
        else if (density >= 0.05) score = 8;
        else if (termCount > 0) score = 4;
        
        return { score, density, termCount };
    };

    /**
     * Expandability Score (15 points max)
     * Can this content become a scenario?
     */
    const scoreExpandability = (content) => {
        const hasActor = /\b(worker|supervisor|manager|operator|technician|inspector)\b/i.test(content);
        const hasAction = hasAnyMatch(content, OBSERVABLE_VERBS);
        const hasCondition = hasAnyMatch(content, LOCATION_CONDITION_TERMS) || 
                           /\b(when|if|before|after|during|while)\b/i.test(content);
        
        let score = 0;
        if (hasActor && hasAction && hasCondition) score = 15;
        else if (hasAction && hasCondition) score = 10;
        else if (hasAction) score = 5;
        
        return { score, hasActor, hasAction, hasCondition };
    };

    // ===========================================================================
    // MAIN EVALUATION FUNCTION
    // ===========================================================================

    /**
     * Evaluate content quality
     * @param {string} content - The content to evaluate
     * @param {Object} context - Context object with jobTitle, industry, state, etc.
     * @returns {Object} Evaluation result with score, status, gates, and breakdown
     */
    const evaluateContent = (content, context = {}) => {
        // Run gate checks
        const gates = {
            structure: checkStructure(content),
            antiGeneric: checkAntiGeneric(content),
            contextBinding: checkContextBinding(content, context)
        };

        // If any gate fails, return 0
        const allGatesPassed = gates.structure.passed && 
                              gates.antiGeneric.passed && 
                              gates.contextBinding.passed;

        if (!allGatesPassed) {
            return {
                score: 0,
                status: 'FAIL',
                reason: 'Gate failure',
                gates,
                breakdown: null,
                rewriteStrategy: buildRewriteStrategy(gates, content, context)
            };
        }

        // Calculate scores
        const physicalScore = scorePhysicalSpecificity(content);
        const contextScore = scoreContextRichness(content, context);
        const decisionScore = scoreDecisionRealism(content);
        const terminologyScore = scoreTerminology(content, context);
        const expandabilityScore = scoreExpandability(content);

        const totalScore = physicalScore.score + 
                          contextScore.score + 
                          decisionScore.score + 
                          terminologyScore.score + 
                          expandabilityScore.score;

        const cappedScore = Math.min(totalScore, 100);

        return {
            score: cappedScore,
            status: classifyScore(cappedScore),
            gates,
            breakdown: {
                physicalSpecificity: { max: 25, ...physicalScore },
                contextRichness: { max: 25, ...contextScore },
                decisionRealism: { max: 20, ...decisionScore },
                terminologyAuthenticity: { max: 15, ...terminologyScore },
                expandability: { max: 15, ...expandabilityScore }
            },
            rewriteStrategy: cappedScore < 75 ? buildRewriteStrategy(gates, content, context) : null
        };
    };

    /**
     * Classify score into status
     */
    const classifyScore = (score) => {
        if (score >= 90) return 'PERFECT';
        if (score >= 75) return 'GOOD';
        if (score >= 60) return 'ACCEPTABLE';
        return 'REJECT';
    };

    /**
     * Build rewrite strategy based on failures
     */
    const buildRewriteStrategy = (gates, content, context) => {
        const strategies = [];
        
        if (!gates.structure.passed) {
            if (gates.structure.hasBannedVerbs) {
                strategies.push('Replace banned verbs (learn, understand, ensure) with observable actions');
            }
            if (!gates.structure.hasObservableVerbs) {
                strategies.push('Add observable verbs: inspect, verify, document, report');
            }
        }
        
        if (!gates.antiGeneric.passed) {
            if (!gates.antiGeneric.hasPhysicalNouns) {
                strategies.push('Add equipment, components, or document names');
            }
            if (gates.antiGeneric.isOfficeSafe) {
                strategies.push('Replace generic phrases with specific workplace actions');
            }
        }
        
        if (!gates.contextBinding.passed && gates.contextBinding.issues) {
            gates.contextBinding.issues.forEach(issue => {
                strategies.push(`Address: ${issue}`);
            });
        }
        
        // Check for missing decision points
        if (!hasAnyMatch(content, DECISION_VERBS)) {
            strategies.push('Add stop/escalate/report decision points');
        }
        
        return strategies;
    };

    // ===========================================================================
    // REGRESSION TESTS (Built-in)
    // ===========================================================================

    const REGRESSION_TESTS = [
        {
            name: 'Generic (Must Fail)',
            input: 'Identify potential hazards in the workplace. Ensure appropriate control measures are applied.',
            context: {},
            expected: { status: 'FAIL', scoreRange: [0, 0] }
        },
        {
            name: 'Acceptable Baseline',
            input: 'Inspect the work area for fall hazards such as unprotected edges. Install guardrails or fall arrest systems where required.',
            context: {},
            expected: { status: 'ACCEPTABLE', scoreRange: [60, 74] }
        },
        {
            name: 'Perfect (Gold Standard)',
            input: 'Inspect scaffold decks, open bays, guardrails, and access points to identify fall and dropped-object hazards. Identify environmental conditions common to WA worksites, including high winds, heat exposure, or unstable ground. Implement controls such as exclusion zones below the scaffold or stop work when conditions become unsafe.',
            context: { jobTitle: 'Scaffold Worker', industry: 'Construction', state: 'WA' },
            expected: { status: 'PERFECT', scoreRange: [90, 100] }
        },
        {
            name: 'Context Missing (Should Downscore, Not Fail)',
            input: 'Inspect scaffold components for damage before use. Tag out defective equipment and report to supervisor.',
            context: { jobTitle: null, industry: 'Construction' },
            expected: { status: 'GOOD', scoreRange: [75, 89] }
        }
    ];

    // ===========================================================================
    // ADVERSARIAL STRESS TESTS (Must catch edge cases)
    // ===========================================================================

    const ADVERSARIAL_TESTS = [
        {
            name: 'Buzzword Injection (Should FAIL)',
            input: 'Ensure scaffold safety is maintained by following procedures.',
            context: {},
            expected: { status: 'FAIL', reason: 'banned verb + no physical action' }
        },
        {
            name: 'Fake Specificity (Should FAIL)',
            input: 'Inspect the system and ensure compliance.',
            context: {},
            expected: { status: 'FAIL', reason: 'abstract system + banned verb + no object' }
        },
        {
            name: 'Office Camouflage (Should FAIL)',
            input: 'Inspect documentation and report findings via email.',
            context: {},
            expected: { status: 'FAIL', reason: 'office term email + no physical environment' }
        },
        {
            name: 'Partial Context (Should PASS but lower score)',
            input: 'Inspect scaffold planks for damage and tag out unsafe equipment.',
            context: {},
            expected: { status: 'GOOD', scoreRange: [75, 85], reason: 'missing state/industry' }
        },
        {
            name: 'Gold Standard Adversarial (Must PASS PERFECT)',
            input: 'Inspect scaffold decks and guardrails for missing components, tag out damaged planks, and stop work if high winds create unsafe conditions.',
            context: { jobTitle: 'Scaffold Worker', industry: 'Construction', state: 'WA' },
            expected: { status: 'PERFECT', scoreRange: [90, 100] }
        }
    ];

    /**
     * Run adversarial tests
     * @returns {Object} Test results
     */
    const runAdversarialTests = () => {
        const results = ADVERSARIAL_TESTS.map(test => {
            const result = evaluateContent(test.input, test.context);
            const statusMatch = result.status === test.expected.status;
            const scoreInRange = !test.expected.scoreRange || 
                (result.score >= test.expected.scoreRange[0] && 
                 result.score <= test.expected.scoreRange[1]);
            
            return {
                name: test.name,
                passed: statusMatch && scoreInRange,
                expected: test.expected,
                actual: { status: result.status, score: result.score },
                result
            };
        });
        
        const allPassed = results.every(r => r.passed);
        
        return {
            allPassed,
            results,
            summary: `${results.filter(r => r.passed).length}/${results.length} adversarial tests passed`
        };
    };

    // ===========================================================================
    // SCORE BADGE SYSTEM (Visual Indicators)
    // ===========================================================================

    /**
     * Get badge configuration for a score
     * @param {number} score - The quality score (0-100)
     * @returns {Object} Badge configuration with label, class, icon, color
     */
    const getScoreBadge = (score) => {
        if (score >= 90) {
            return {
                label: 'PERFECT',
                cssClass: 'cc-score-perfect',
                icon: 'OK',
                colorVar: '--cc-success',
                description: 'This content meets the highest standard for workplace realism and assessability.'
            };
        }
        if (score >= 75) {
            return {
                label: 'GOOD',
                cssClass: 'cc-score-good',
                icon: '*',
                colorVar: '--cc-primary',
                description: 'This content is role-specific and well-structured. Minor enhancements possible.'
            };
        }
        if (score >= 60) {
            return {
                label: 'ACCEPTABLE',
                cssClass: 'cc-score-acceptable',
                icon: '^',
                colorVar: '--cc-warning',
                description: 'This content passes basic checks but could benefit from more specificity.'
            };
        }
        return {
            label: 'REJECTED',
            cssClass: 'cc-score-rejected',
            icon: 'x',
            colorVar: '--cc-error',
            description: 'This content failed quality checks and was regenerated.'
        };
    };

    /**
     * Format score for display with badge HTML
     * @param {number} score - The quality score
     * @returns {string} HTML string for score badge
     */
    const renderScoreBadge = (score) => {
        const badge = getScoreBadge(score);
        return `<span class="cc-score-badge ${badge.cssClass}" title="${badge.description}">${score} ${badge.icon} ${badge.label}</span>`;
    };

    // ===========================================================================
    // SCORE LOGGING (For Trending)
    // ===========================================================================

    /**
     * Create a score log entry for trending
     * @param {Object} params - Log parameters
     * @returns {Object} Formatted log entry
     */
    const createScoreLogEntry = (params) => {
        return {
            timestamp: new Date().toISOString(),
            unit: params.unitCode || 'UNKNOWN',
            layer: params.layer || 'content',
            jobTitle: params.jobTitle || null,
            industry: params.industry || null,
            state: params.state || null,
            score: params.score,
            status: params.status,
            gates: params.gates || null
        };
    };

    /**
     * Run regression tests
     * @returns {Object} Test results
     */
    const runRegressionTests = () => {
        const results = REGRESSION_TESTS.map(test => {
            const result = evaluateContent(test.input, test.context);
            const statusMatch = result.status === test.expected.status;
            const scoreInRange = result.score >= test.expected.scoreRange[0] && 
                                result.score <= test.expected.scoreRange[1];
            
            return {
                name: test.name,
                passed: statusMatch && scoreInRange,
                expected: test.expected,
                actual: { status: result.status, score: result.score },
                result
            };
        });
        
        const allPassed = results.every(r => r.passed);
        
        return {
            allPassed,
            results,
            summary: `${results.filter(r => r.passed).length}/${results.length} tests passed`
        };
    };

    // ===========================================================================
    // PUBLIC API
    // ===========================================================================

    return {
        evaluateContent,
        checkStructure,
        checkAntiGeneric,
        checkContextBinding,
        classifyScore,
        runRegressionTests,
        runAdversarialTests,
        getScoreBadge,
        renderScoreBadge,
        createScoreLogEntry,
        BANNED_VERBS,
        OBSERVABLE_VERBS,
        DECISION_VERBS
    };
});
