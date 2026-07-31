# AI Content Creator - Prompting Architecture v6.6.29

## Overview

This document defines the prompting system architecture for the AI Content Creator plugin. It serves as the single source of truth for how prompts are constructed, what context is passed, and the rules that govern content generation.

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           WIZARD INPUT COLLECTION                           │
│  (builder.js gatherContext() → 11 input fields)                            │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CONTEXT PASSTHROUGH (prompts.js)                    │
│  buildSystemPrompt() → leanContext object → PromptsLean.buildLeanSystemPrompt│
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      PROMPT ASSEMBLY (prompts_lean.js)                      │
│                                                                             │
│  ┌─────────────┐   ┌─────────────────────┐   ┌───────────────────────────┐ │
│  │ CORE_PROMPT │ + │ buildContextBinding │ + │ MODE_RULES + LAYER_RULES  │ │
│  │ (anti-gen.) │   │ Rules() [dynamic]   │   │ + COMPLIANCE OVERLAYS     │ │
│  └─────────────┘   └─────────────────────┘   └───────────────────────────┘ │
│                                                                             │
│  + getLanguageRules() + Legislation.buildPromptInjection()                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AI GENERATION                                  │
│  System prompt (3-5k chars) + User prompt → AI Model → JSON output          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Input Collection (builder.js)

### VET Mode - 11 Input Fields

| # | Field | Wizard Element ID | Default | Required |
|---|-------|-------------------|---------|----------|
| 1 | mode | (implicit) | 'vet' | Yes |
| 2 | country | `cc-country` | 'AU' | Yes |
| 3 | state | `cc-state` | '' | No |
| 4 | language | derived from country | 'en-AU' | Yes |
| 5 | industry | `cc-industry` | '' | No |
| 6 | industrySector | `cc-industry-sector` | '' | No |
| 7 | jobLevel | `cc-job-level` | 'worker' | Yes |
| 8 | jobTitle | `cc-job-title` | '' | No |
| 9 | unitCode | from TGA API | '' | No |
| 10 | unitTitle | from TGA API | '' | No |
| 11 | topic | from AI suggestions | '' | Yes |

### Collection Function: `gatherContext()`

```javascript
// Location: builder.js line 3269
const gatherContext = () => {
    if (selectedMode === 'vet') {
        return {
            mode: 'vet',
            country: countryCode,
            language: getCountryLang(countryCode),
            state: state,
            industry: industry,
            industrySector: industrySector,
            industryContext: industryContext,
            jobLevel: jobLevel,
            jobTitle: jobTitle,
            learnerRole: learnerRole,
            location: location,
            unitCode: tgaData?.unitCode || '',
            unitTitle: tgaData?.unitTitle || ''
        };
    }
    // ... workplace and university modes
};
```

---

## 2. Context Passthrough (prompts.js)

### leanContext Object Construction

```javascript
// Location: prompts.js line 1434
const leanContext = {
    // Core fields
    mode: mode,
    country: countryCode,
    state: stateCode,
    language: languageCode,
    // CRITICAL: Industry/job context for progressive binding (v6.6.29)
    industry: context?.industry || context?.industrySector || '',
    industrySector: context?.industrySector || '',
    jobTitle: context?.jobTitle || '',
    jobLevel: context?.jobLevel || '',
    // Unit context for anchoring
    topic: context?.topic || '',
    unitTitle: context?.unitTitle || '',
    unitCode: context?.unitCode || '',
    // Risk detection
    isHighRisk: context?.isHighRisk || false,
    hasDocumentation: context?.hasDocumentation || false
};
```

### Passthrough Checklist

| Input Field | Passed to leanContext | Used in Prompt | Status |
|-------------|----------------------|----------------|--------|
| mode | ✅ `mode` | MODE_RULES selection | ✅ |
| country | ✅ `country` | Spelling rules, legislation | ✅ |
| state | ✅ `state` | STATE/REGION BINDING | ✅ |
| language | ✅ `language` | getLanguageRules() | ✅ |
| industry | ✅ `industry` | INDUSTRY BINDING | ✅ |
| industrySector | ✅ `industrySector` | INDUSTRY BINDING | ✅ |
| jobLevel | ✅ `jobLevel` | WORKER LEVEL BINDING | ✅ |
| jobTitle | ✅ `jobTitle` | JOB TITLE BINDING | ✅ |
| unitCode | ✅ `unitCode` | UNIT ANCHORING | ✅ |
| unitTitle | ✅ `unitTitle` | UNIT ANCHORING | ✅ |
| topic | ✅ `topic` | detectHighRisk() | ✅ |

---

## 3. Prompt Assembly (prompts_lean.js)

### 3.1 CORE_PROMPT (Always Included)

The foundation prompt includes:

#### Output Format (Non-Negotiable)
- Output JSON ONLY
- No markdown, no commentary, no explanations
- Do NOT use emphasis symbols (* or **)

#### Anti-Generic Rule (Fail Condition)
```
If a sentence could apply unchanged to office work, retail, hospitality, 
or general induction content, it is INVALID and MUST be rewritten.
```

#### Specificity Enforcement
Each bullet point MUST include ALL of:
- an observable ACTION
- a physical OBJECT or system
- a LOCATION, CONDITION, or CONSEQUENCE

#### Banned Verbs (Absolute)
Do NOT use: `learn, understand, know, be aware of, practice, ensure, familiarise`

Use observable actions: `inspect, check, verify, install, secure, isolate, tag, document, report, stop work, escalate`

#### Consultation Rule
If consultation appears, specify:
- WHO is consulted
- WHY consultation is required
- WHAT decision, approval, or change results

#### Self-Check Before Output
```
Silently verify:
- Does each bullet clearly reflect the provided context?
- Is every action observable on a real worksite?
- Would this content fail an RTO audit for being too generic?

If ANY check fails, rewrite until compliant.
```

#### Fail-Fast Rule
```
If you cannot meet all rules with the provided inputs, 
rewrite content using higher physical specificity rather than generic wording.
```

---

### 3.2 Context Binding Rules (Progressive/Conditional)

**Key Principle: Only enforce rules for inputs that are PROVIDED.**

```javascript
// Location: prompts_lean.js line 85
const buildContextBindingRules = (context) => {
    const rules = [];
    
    // Always add the context application rule
    rules.push('CONTEXT APPLICATION RULE (CRITICAL):...');
    
    // Conditionally add bindings based on what's provided
    if (context.jobTitle) { /* JOB TITLE BINDING */ }
    if (context.jobLevel) { /* WORKER LEVEL BINDING */ }
    if (context.industry || context.industrySector) { /* INDUSTRY BINDING */ }
    if (context.state) { /* STATE/REGION BINDING */ }
    if (context.unitCode) { /* UNIT ANCHORING */ }
    if (context.country) { /* SPELLING RULES */ }
    
    return rules.join('\n');
};
```

#### Binding Rules Reference

| Input | Binding Rule | What It Enforces |
|-------|--------------|------------------|
| jobTitle | JOB TITLE BINDING | Use role-specific tasks, tools, equipment |
| jobLevel | WORKER LEVEL BINDING | Match decision authority (worker/supervisor/manager) |
| industry + industrySector | INDUSTRY BINDING | Use industry-specific environments, hazards, terminology |
| state | STATE/REGION BINDING | Reflect local conditions, avoid naming legislation |
| unitCode | UNIT ANCHORING | Stay within scope of unit, reference unit title |
| country | SPELLING | Australian/American/British English conventions |

---

### 3.3 Mode Rules (VET / Workplace / University)

```javascript
const MODE_RULES = {
    vet: `
VET MODE:
- Use realistic workplace scenarios for vocational learners
- Focus on competent job performance and compliance
- Show clear consequences of correct/incorrect actions
- All content must be assessable through direct observation`,

    workplace: `
WORKPLACE MODE:
- Frame content as corporate training/onboarding scenarios
- Focus on policy compliance and business impact
- Show consequences in terms of team, customer, and organisational effects
- Include supervision and escalation pathways`,

    university: `
UNIVERSITY MODE:
- Apply Bloom's Taxonomy for cognitive progression
- Focus on critical thinking and analysis
- Frame examples for academic understanding
- Encourage scholarly inquiry and reflection`
};
```

---

### 3.4 Layer Rules (Concept / Scenario / Activity / Outcome)

| Layer | Purpose | Key Requirements |
|-------|---------|------------------|
| concept | WHAT the worker must know | Define terms, concrete examples, about DOING |
| scenario | Decision-making situations | Clear role, context, choice points, consequences |
| activity | Assessable activities | Observable outcomes, performance verbs |
| outcome | WHY this matters | Real-world consequences, evidence-based reflection |

---

### 3.5 Compliance Overlays (Auto-Detected)

#### High-Risk Detection
```javascript
const detectHighRisk = (context) => {
    const riskKeywords = ['hazard', 'safety', 'risk', 'ppe', 'injury', 'dangerous', 
                         'whs', 'ohs', 'emergency', 'isolation', 'height', 'confined',
                         'scaffold', 'excavation', 'electrical', 'chemical', 'crane'];
    return riskKeywords.some(kw => text.includes(kw));
};
```

If detected, adds:
```
SAFETY COMPLIANCE (HIGH-RISK CONTENT):
- Treat safety as ongoing throughout task, not one-off
- Include tool/equipment inspection before use
- Show monitoring and reassessment when conditions change
- Include what to do when controls fail
- Never normalise shortcuts or unsafe behaviour
```

#### Documentation Detection
```javascript
const detectDocumentation = (context) => {
    const docKeywords = ['document', 'record', 'log', 'form', 'checklist', 'permit', 
                        'sign off', 'report', 'swms', 'inspection'];
    return docKeywords.some(kw => text.includes(kw));
};
```

If detected, adds:
```
DOCUMENTATION COMPLIANCE:
- Documentation is part of performance, not separate admin
- Name specific documents (SWMS, pre-start checklist, permit)
- Link documentation to work steps, not generic "complete paperwork"
- Include record-keeping as observable action
```

---

### 3.6 Language Rules (Non-English)

```javascript
const getLanguageRules = (languageCode) => {
    if (!languageCode || languageCode.startsWith('en-')) {
        return '';
    }
    return `CRITICAL: Generate ALL content in ${languageName}. This is NON-NEGOTIABLE.
All headings, body text, questions, options, feedback in ${languageName}.`;
};
```

Supported languages: Japanese, Chinese, Korean, Spanish, French, German, Italian, Portuguese, Arabic, Hindi, Vietnamese, Thai, Indonesian, Malay, Filipino (16 total + English variants)

---

### 3.7 Legislation Injection

Added via `Legislation.buildPromptInjection(country, state, contentType)` from `legislation.js`.

Provides country/state-specific:
- WHS/OHS terminology
- Regulatory context (without naming specific Acts)
- Compliance expectations

---

## 4. Prompt Assembly Order

```javascript
// Location: prompts_lean.js line 290
const buildLeanSystemPrompt = (layer, context = {}) => {
    let prompt = CORE_PROMPT;                          // 1. Core anti-generic rules
    prompt += buildContextBindingRules(context);       // 2. Progressive context binding
    prompt += MODE_RULES[mode];                        // 3. Mode-specific rules
    prompt += LAYER_RULES[layer];                      // 4. Layer-specific rules
    if (isHighRisk) prompt += SAFETY_COMPLIANCE;       // 5. Safety overlay (if detected)
    if (hasDocumentation) prompt += DOCUMENTATION_COMPLIANCE; // 6. Docs overlay (if detected)
    prompt += getLanguageRules(languageCode);          // 7. Language rules (non-English)
    prompt += Legislation.buildPromptInjection(...);   // 8. Legislation injection
    return prompt;
};
```

---

## 5. Audit Checklist

### A. Input Collection Audit

| Check | Pass/Fail |
|-------|-----------|
| All VET wizard fields collected in gatherContext() | ✅ PASS |
| suggestMajorTopics() passes state field | ✅ PASS (v6.6.29) |
| unitCode passed from TGA data | ✅ PASS |
| Language derived from country correctly | ✅ PASS |

### B. Context Passthrough Audit

| Check | Pass/Fail |
|-------|-----------|
| All 11 context fields passed to leanContext | ✅ PASS |
| No fields lost between gatherContext() and leanContext | ✅ PASS |
| Fallbacks provided for optional fields | ✅ PASS |

### C. Prompt Construction Audit

| Check | Pass/Fail |
|-------|-----------|
| CORE_PROMPT includes anti-generic rule | ✅ PASS |
| CORE_PROMPT includes specificity enforcement | ✅ PASS |
| CORE_PROMPT includes banned verbs | ✅ PASS |
| Context binding only applies for provided inputs | ✅ PASS |
| JOB TITLE BINDING references actual jobTitle | ✅ PASS |
| INDUSTRY BINDING combines industry + industrySector | ✅ PASS |
| UNIT ANCHORING uses both unitCode and unitTitle | ✅ PASS |
| Spelling rules vary by country | ✅ PASS |
| High-risk detection triggers SAFETY_COMPLIANCE | ✅ PASS |
| Documentation detection triggers DOCUMENTATION_COMPLIANCE | ✅ PASS |

### D. Progressive Binding Audit

| Check | Pass/Fail |
|-------|-----------|
| Missing inputs don't break prompt | ✅ PASS |
| No context is invented for missing inputs | ✅ PASS |
| Generic output blocked by fail conditions | ✅ PASS |

---

## 6. Common Failure Modes & Fixes

### Problem: Generic content despite context provided

**Root Cause**: Context not passed through to leanContext

**Fix**: Ensure all fields from gatherContext() appear in leanContext object (prompts.js line 1434-1452)

### Problem: Wrong spelling (American instead of Australian)

**Root Cause**: Country code not passed correctly

**Fix**: Verify country flows: wizard → gatherContext() → leanContext → buildContextBindingRules()

### Problem: Content doesn't match job role

**Root Cause**: jobTitle/jobLevel not reaching prompt

**Fix**: Check JOB TITLE BINDING and WORKER LEVEL BINDING are being added when fields present

### Problem: State-specific content missing

**Root Cause**: State field missing from context

**Fix**: Ensure STATE/REGION BINDING added when context.state is truthy

---

## 7. File Reference

| File | Purpose |
|------|---------|
| `amd/src/builder.js` | Wizard UI, input collection, gatherContext() |
| `amd/src/prompts.js` | Context passthrough, buildSystemPrompt(), leanContext |
| `amd/src/prompts_lean.js` | Prompt assembly, all binding rules, compliance overlays |
| `amd/src/legislation.js` | Country/state legislation injection |
| `amd/build/*.min.js` | Minified versions (MUST match src/) |

---

## 8. Version History

| Version | Date | Changes |
|---------|------|---------|
| v6.6.29 | 2025-01-08 | ChatGPT redesigned prompt, progressive binding, unitCode anchoring |
| v6.6.27 | 2025-01-07 | Lean prompt architecture (3-5k vs 31k chars) |
| v6.4.0 | 2024-12 | Mode separation (VET/Workplace/University) |

---

## 9. Maintenance Rules

1. **Single Source of Truth**: All prompt text lives in `prompts_lean.js`
2. **Context Passthrough**: Any new wizard field must be added to BOTH gatherContext() AND leanContext
3. **Build Sync**: After editing src/, copy to build/*.min.js and rebuild ZIP
4. **Workflow Restart**: ALWAYS restart workflow after ZIP rebuild or cached version is served
5. **Progressive Binding**: New context fields should only add rules when the field has a value
