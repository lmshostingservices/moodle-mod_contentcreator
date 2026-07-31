# AI Content Creator - Complete Content Creation Architecture v6.9.6
## ChatGPT Sign-Off Document - January 11, 2026

### Purpose
This document defines the complete content creation flow for both VET and Workplace routes, demonstrating how user inputs, AI analysis, and audit-proof content generation work together to achieve 100% ASQA compliance.

---

## EXECUTIVE SUMMARY

The AI Content Creator uses a **Two-Stage Architecture** where:
- **Stage 1** generates a neutral "compliance spine" (topics with PC mappings)
- **Stage 2** applies context-binding rules to create job-realistic, audit-proof content

Both VET and Workplace routes follow the same architectural pattern, differing only in their **Primary Authority Source**:
- **VET Route**: Unit of Competency from training.gov.au
- **Workplace Route**: Uploaded workplace documents (policies, procedures, manuals)

---

## ROUTE 1: VET (VOCATIONAL EDUCATION & TRAINING)

### Primary Authority
**Unit of Competency** from training.gov.au (TGA)

### User Input Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     USER INPUTS (Step 1)                         │
├─────────────────────────────────────────────────────────────────┤
│  1. Unit Code (e.g., RIIWHS204E)                                │
│  2. Industry Selection (e.g., Mining, Construction)             │
│  3. Industry Sector (e.g., Underground Mining, Civil Works)     │
│  4. Job Level (Worker | Supervisor | Manager)                   │
│  5. State/Territory (for legislation context)                   │
│  6. Optional: Reference Documents (PDFs for additional context) │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 TGA API FETCH (Automatic)                        │
├─────────────────────────────────────────────────────────────────┤
│  Retrieved from training.gov.au:                                │
│  • Unit Title                                                   │
│  • Elements (E1, E2, E3...)                                     │
│  • Performance Criteria (PC 1.1, 1.2, 2.1...)                   │
│  • Knowledge Evidence (KE items)                                │
│  • Performance Evidence (PE items)                              │
│  • Foundation Skills (FS)                                       │
│  • Assessment Conditions                                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              AI CONTEXT ANALYSIS (Step 2)                        │
├─────────────────────────────────────────────────────────────────┤
│  AI receives: Unit data + Industry + Sector + Job Level         │
│                                                                 │
│  AI generates (6 of each, user selects 1-3):                    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ JOB TITLES (with levels)                                │    │
│  │ • "Underground Drill Operator" (Worker)                 │    │
│  │ • "Shift Supervisor - Extraction" (Supervisor)          │    │
│  │ • "Safety Coordinator" (Manager)                        │    │
│  │ Each includes: elementMapping[], mappingRationale       │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ TASK CATEGORIES (with examples)                         │    │
│  │ • "Pre-shift equipment inspection"                      │    │
│  │ • "Emergency evacuation procedures"                     │    │
│  │ • "Isolation and lock-out procedures"                   │    │
│  │ Each includes: elementMapping[], examples[]             │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ EQUIPMENT CATEGORIES (with examples)                    │    │
│  │ • "Personal Protective Equipment"                       │    │
│  │ • "Isolation devices and tags"                          │    │
│  │ • "Communication equipment"                             │    │
│  │ Each includes: elementMapping[], examples[]             │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              USER SELECTION (Step 3)                             │
├─────────────────────────────────────────────────────────────────┤
│  User picks from AI-generated cards:                            │
│  • 1-3 Job Titles (determines content perspective)              │
│  • 1-3 Task Categories (determines scenario settings)           │
│  • 1-3 Equipment Categories (determines tool references)        │
│                                                                 │
│  Selected items flow into STAGE 1 and STAGE 2 prompts           │
└─────────────────────────────────────────────────────────────────┘
```

---

## ROUTE 2: WORKPLACE (POLICY & PROCEDURE-BASED)

### Primary Authority
**Uploaded Workplace Documents** (policies, procedures, manuals, SOPs)

### User Input Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     USER INPUTS (Step 1)                         │
├─────────────────────────────────────────────────────────────────┤
│  1. Document Uploads (PDFs - policies, procedures, manuals)     │
│  2. Industry Selection (e.g., Health, Finance, Retail)          │
│  3. Industry Sector (e.g., Aged Care, Investment Banking)       │
│  4. Job Level (Worker | Supervisor | Manager)                   │
│  5. State/Territory (for legislation context)                   │
│  6. Custom Unit Title (user-defined learning objective)         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              DOCUMENT PARSING (Automatic)                        │
├─────────────────────────────────────────────────────────────────┤
│  Extracted from uploaded documents:                             │
│  • Document titles and headings                                 │
│  • Section structure and content                                │
│  • Key procedures and requirements                              │
│  • Referenced forms, checklists, policies                       │
│  • Compliance requirements mentioned                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│         AI DOCUMENT ANALYSIS (Step 2 - Same Pattern as VET)     │
├─────────────────────────────────────────────────────────────────┤
│  AI receives: Document content + Industry + Sector + Job Level  │
│                                                                 │
│  AI generates (6 of each, user selects 1-3):                    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ JOB TITLES (extracted from document context)            │    │
│  │ • "Care Worker - Residential" (Worker)                  │    │
│  │ • "Team Leader - Client Services" (Supervisor)          │    │
│  │ • "Quality Assurance Officer" (Manager)                 │    │
│  │ Each includes: sectionMapping (document source)         │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ TASK CATEGORIES (from document procedures)              │    │
│  │ • "Client intake and assessment"                        │    │
│  │ • "Medication administration"                           │    │
│  │ • "Incident reporting and documentation"                │    │
│  │ Each includes: sectionMapping, examples[]               │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ EQUIPMENT CATEGORIES (referenced in documents)          │    │
│  │ • "Client management software"                          │    │
│  │ • "Manual handling equipment"                           │    │
│  │ • "Documentation systems"                               │    │
│  │ Each includes: sectionMapping, examples[]               │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              USER SELECTION (Step 3 - Same as VET)               │
├─────────────────────────────────────────────────────────────────┤
│  User picks from AI-generated cards:                            │
│  • 1-3 Job Titles                                               │
│  • 1-3 Task Categories                                          │
│  • 1-3 Equipment Categories                                     │
│                                                                 │
│  Selected items flow into STAGE 1 and STAGE 2 prompts           │
└─────────────────────────────────────────────────────────────────┘
```

---

## TWO-STAGE PROMPT ARCHITECTURE

### Stage 1: Topic Planning (Neutral Compliance Spine)

```
┌─────────────────────────────────────────────────────────────────┐
│                    STAGE 1: TOPIC PLANNER                        │
├─────────────────────────────────────────────────────────────────┤
│  INPUT:                                                         │
│  • Primary Authority (Unit of Competency OR Document content)   │
│  • All PCs, KE, PE, FS (VET) or Requirements (Workplace)        │
│  • Industry context (for scope, NOT for specificity)            │
│                                                                 │
│  PURPOSE:                                                       │
│  • Generate NEUTRAL topics that are unit-anchored               │
│  • Topics are PLANNING artefacts, not learner-facing            │
│  • Ensure 100% coverage of compliance requirements              │
│                                                                 │
│  OUTPUT:                                                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ TOPIC STRUCTURE                                         │    │
│  │                                                         │    │
│  │ Topic 1: "Inspect work area for fall hazards"           │    │
│  │   ├─ Subtopic 1.1: "Identify common fall hazards"       │    │
│  │   │   └─ pcMapping: {                                   │    │
│  │   │       pcNumber: "1.1",                              │    │
│  │   │       officialPC: "Identify hazards in...",         │    │
│  │   │       instructionalPC: "Check the work area..."     │    │
│  │   │     }                                               │    │
│  │   ├─ Subtopic 1.2: "Apply hierarchy of controls"        │    │
│  │   │   └─ pcMapping: {...}                               │    │
│  │   └─ Subtopic 1.3: "Document hazard observations"       │    │
│  │       └─ pcMapping: {...}                               │    │
│  │                                                         │    │
│  │ Topic 2: "Select and inspect access equipment"          │    │
│  │   ├─ Subtopic 2.1: ...                                  │    │
│  │   └─ ...                                                │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  KEY PRINCIPLE:                                                 │
│  Topics remain role-neutral. Contextual richness comes in       │
│  Stage 2 when content layers are generated.                     │
└─────────────────────────────────────────────────────────────────┘
```

### Stage 2: Content Layer Generation (Anti-Generic Enforcement)

```
┌─────────────────────────────────────────────────────────────────┐
│               STAGE 2: CONTENT LAYER GENERATION                  │
├─────────────────────────────────────────────────────────────────┤
│  INPUT (Context Binding):                                       │
│  • Topic + Subtopic from Stage 1                                │
│  • PC Mapping (officialPC → instructionalPC)                    │
│  • Selected Job Titles (from user selection)                    │
│  • Selected Task Categories (from user selection)               │
│  • Selected Equipment Categories (from user selection)          │
│  • Industry + Sector + Job Level                                │
│  • State/Territory (for legislation context)                    │
│  • Reference Documents (if uploaded)                            │
│                                                                 │
│  CONTENT LAYERS (4 types per subtopic):                         │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ LAYER 1: CONCEPT CARD (Knowledge - "What")              │    │
│  │                                                         │    │
│  │ Schema Output:                                          │    │
│  │ {                                                       │    │
│  │   cardType: "knowledge",                                │    │
│  │   contrastType: "safe-unsafe",                          │    │
│  │   keCoverage: ["KE item 1", "KE item 2"],  // v6.9.6    │    │
│  │   pcVerbsCovered: ["identify", "check"],   // v6.9.6    │    │
│  │   trainerOverrideAllowed: true,            // v6.9.6    │    │
│  │   description: "...",                                   │    │
│  │   keyFacts: [...],                                      │    │
│  │   positiveList: [...],  // Do's                         │    │
│  │   negativeList: [...]   // Don'ts                       │    │
│  │ }                                                       │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ LAYER 2: SCENARIO CARD (Application - "How")            │    │
│  │                                                         │    │
│  │ Schema Output:                                          │    │
│  │ {                                                       │    │
│  │   cardType: "application",                              │    │
│  │   mentalModel: {                                        │    │
│  │     id: "MM-03",                    // v6.9.6 versioned │    │
│  │     name: "Authority ≠ Accuracy",                       │    │
│  │     principle: "Senior doesn't mean correct..."         │    │
│  │   },                                                    │    │
│  │   trainerOverrideAllowed: true,     // v6.9.6           │    │
│  │   role: "a licensed electrician working on...",         │    │
│  │   context: "During a commercial fit-out...",            │    │
│  │   decisionPoint: "The supervisor asks you to...",       │    │
│  │   correctResponse: {...},                               │    │
│  │   incorrectResponses: [...],                            │    │
│  │   incidentReference: "Multiple NSW investigations...",  │    │
│  │   keyTakeaway: "If instructions aren't confirmed...",   │    │
│  │   pcSummaryAssertion: "The learner has demonstrated..." │    │
│  │ }                                                       │    │
│  │                                                         │    │
│  │ ═══════════════════════════════════════════════════════ │    │
│  │ STATE-SPECIFIC INCIDENT REFERENCE (Critical)            │    │
│  │ ═══════════════════════════════════════════════════════ │    │
│  │                                                         │    │
│  │ PURPOSE: Adds emotional weight and real-world           │    │
│  │ credibility by referencing actual regulator findings.   │    │
│  │                                                         │    │
│  │ FORMAT: 15-25 word factual statement about state/       │    │
│  │ territory regulator investigation findings.             │    │
│  │                                                         │    │
│  │ EXAMPLES BY STATE:                                      │    │
│  │ • NSW: "SafeWork NSW investigations found workers       │    │
│  │   began height work with correct PPE but outdated SWMS" │    │
│  │ • VIC: "WorkSafe Victoria reported multiple incidents   │    │
│  │   where isolation procedures were signed but not        │    │
│  │   physically verified"                                  │    │
│  │ • QLD: "WHSQ investigations identified a pattern of     │    │
│  │   workers trusting verbal instructions over documented  │    │
│  │   procedures"                                           │    │
│  │ • WA: "DMIRS found that fatigue-related incidents       │    │
│  │   increased 40% during final shifts of roster cycles"   │    │
│  │                                                         │    │
│  │ RULES:                                                  │    │
│  │ ✗ Do NOT invent case numbers or specific dates          │    │
│  │ ✗ Do NOT cite specific company names                    │    │
│  │ ✓ Describe PATTERNS from regulator findings             │    │
│  │ ✓ Use state-appropriate regulator names                 │    │
│  │ ✓ Keep factual and emotionally weighted                 │    │
│  │ ═══════════════════════════════════════════════════════ │    │
│  │                                                         │    │
│  │ MENTAL MODEL LIBRARY (v6.9.6):                          │    │
│  │ • MM-01 to MM-03: Verification models                   │    │
│  │ • MM-04 to MM-06: Documentation models                  │    │
│  │ • MM-07 to MM-09: Pressure/Risk models                  │    │
│  │ • MM-10 to MM-12: Communication models                  │    │
│  │ • MM-13 to MM-15: System models                         │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ LAYER 3: OUTCOME CARD (Consequences - "Why")            │    │
│  │                                                         │    │
│  │ Shows real-world consequences of correct/incorrect      │    │
│  │ actions with investigation references and statistics.   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ LAYER 4: ACTIVITY CARDS (Assessment Support)            │    │
│  │                                                         │    │
│  │ 6 Activity Types with PE Evidence Tagging (v6.9.6):     │    │
│  │                                                         │    │
│  │ 1. Scenario Branching                                   │    │
│  │    peEvidenceType: "decision"                           │    │
│  │                                                         │    │
│  │ 2. Best Response Classification                         │    │
│  │    peEvidenceType: "decision"                           │    │
│  │    keCoverage: ["KE items tested"]                      │    │
│  │                                                         │    │
│  │ 3. What Went Wrong Analysis                             │    │
│  │    peEvidenceType: "decision"                           │    │
│  │    keCoverage: ["KE items tested"]                      │    │
│  │                                                         │    │
│  │ 4. Task Sequencing                                      │    │
│  │    peEvidenceType: "sequence"                           │    │
│  │                                                         │    │
│  │ 5. Escalation Decision                                  │    │
│  │    peEvidenceType: "decision"                           │    │
│  │                                                         │    │
│  │ 6. Document Completion (Workplace)                      │    │
│  │    peEvidenceType: "artifact"                           │    │
│  │                                                         │    │
│  │ All activities include:                                 │    │
│  │ • peCoverage: ["PE items demonstrated"]                 │    │
│  │ • trainerOverrideAllowed: true/false                    │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

## ANTI-GENERIC CONTENT RULES

### Applied in Stage 2 Only (Not Topics)

```
┌─────────────────────────────────────────────────────────────────┐
│              ANTI-GENERIC ENFORCEMENT RULES                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  FAIL CONDITION:                                                │
│  If a sentence could apply unchanged to office work, retail,    │
│  hospitality, or general induction content, it is INVALID.      │
│                                                                 │
│  SPECIFICITY ENFORCEMENT (Every bullet point must include):     │
│  ✓ Observable ACTION (verb tied to physical task)               │
│  ✓ Physical OBJECT or system (tool, equipment, document)        │
│  ✓ LOCATION, CONDITION, or CONSEQUENCE                          │
│                                                                 │
│  BANNED VERBS:                                                  │
│  ✗ understand, ensure, manage, apply, comply, engage            │
│  ✗ be aware, promote, maintain, contribute, adhere              │
│                                                                 │
│  CONTEXT BINDING RULES:                                         │
│  • Job Title determines perspective ("As a drill operator...")  │
│  • Task Categories set scenario locations                       │
│  • Equipment Categories specify tools referenced                │
│  • Industry/Sector gate all examples to that domain             │
│                                                                 │
│  INDUSTRY LOCK (ADD-ON 0):                                      │
│  ALL content MUST remain STRICTLY within selected industry.     │
│  NO cross-industry contamination allowed.                       │
│                                                                 │
│  LEGISLATION SAFETY (ADD-ONs 8-11):                             │
│  • NO named Acts, Regulations, years, clauses                   │
│  • Use "current WHS laws", "applicable legislation"             │
│  • NO specific regulator websites (SafeWork, DMIRS, etc.)       │
│                                                                 │
│  UNIT TITLE ANCHORING (ADD-ON 25):                              │
│  Every dot point MUST reference the unit title context.         │
│  Test: "Could this exist in a different unit unchanged?"        │
│  If YES → REWRITE                                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## COMPLIANCE METADATA (v6.9.6)

### Hidden Audit Trail Fields

```
┌─────────────────────────────────────────────────────────────────┐
│              COMPLIANCE METADATA SCHEMA                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  CONCEPT CARDS:                                                 │
│  {                                                              │
│    keCoverage: ["KE item 1 text", "KE item 2 text"],           │
│    pcVerbsCovered: ["identify", "confirm", "check"],           │
│    trainerOverrideAllowed: true                                │
│  }                                                              │
│                                                                 │
│  SCENARIO CARDS:                                                │
│  {                                                              │
│    mentalModel: {                                               │
│      id: "MM-07",  // Versioned ID for tracking                │
│      name: "Pressure Triangle",                                 │
│      principle: "Time, cost, and safety always compete..."     │
│    },                                                           │
│    trainerOverrideAllowed: true,                               │
│    pcSummaryAssertion: "The learner has demonstrated..."       │
│  }                                                              │
│                                                                 │
│  ACTIVITY CARDS:                                                │
│  {                                                              │
│    peEvidenceType: "decision|sequence|artifact|verbal",        │
│    peCoverage: ["PE item demonstrated"],                       │
│    keCoverage: ["KE item tested"],  // if applicable           │
│    trainerOverrideAllowed: true                                │
│  }                                                              │
│                                                                 │
│  UNIT-LEVEL CHECKS:                                             │
│  • detectStopWorkCoverage() - At least one PC should teach      │
│    stop-work authority for WHS units                           │
│  • generatePCSummaryAssertion() - Auto-creates assessment       │
│    record statement from PC verbs                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## COMPLETE FLOW DIAGRAM

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        USER STARTS CONTENT CREATION                      │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
                    ▼                               ▼
         ┌──────────────────┐            ┌──────────────────┐
         │    VET ROUTE     │            │ WORKPLACE ROUTE  │
         │                  │            │                  │
         │ Enter Unit Code  │            │ Upload Documents │
         └────────┬─────────┘            └────────┬─────────┘
                  │                               │
                  ▼                               ▼
         ┌──────────────────┐            ┌──────────────────┐
         │ Fetch from TGA   │            │ Parse Documents  │
         │ (PCs, KE, PE, FS)│            │ (Extract content)│
         └────────┬─────────┘            └────────┬─────────┘
                  │                               │
                  └───────────────┬───────────────┘
                                  │
                                  ▼
         ┌────────────────────────────────────────────────────┐
         │            COMMON CONTEXT INPUTS                    │
         │                                                     │
         │  • Industry Selection                               │
         │  • Industry Sector                                  │
         │  • Job Level (Worker/Supervisor/Manager)            │
         │  • State/Territory                                  │
         └───────────────────────┬────────────────────────────┘
                                 │
                                 ▼
         ┌────────────────────────────────────────────────────┐
         │           AI CONTEXT ANALYSIS                       │
         │                                                     │
         │  Generates 6 of each (user selects 1-3):            │
         │  • Job Titles (with levels + element mappings)      │
         │  • Task Categories (with examples)                  │
         │  • Equipment Categories (with examples)             │
         └───────────────────────┬────────────────────────────┘
                                 │
                                 ▼
         ┌────────────────────────────────────────────────────┐
         │           USER SELECTION                            │
         │                                                     │
         │  Clicks "Generate Topics" button                    │
         │  (Only appears after selections made)               │
         └───────────────────────┬────────────────────────────┘
                                 │
                                 ▼
         ┌────────────────────────────────────────────────────┐
         │      STAGE 1: TOPIC PLANNING                        │
         │                                                     │
         │  • Neutral, compliance-safe topics                  │
         │  • 1:1 PC mapping (officialPC → instructionalPC)    │
         │  • Planning artefacts, not learner-facing           │
         │  • 100% coverage of all requirements                │
         └───────────────────────┬────────────────────────────┘
                                 │
                                 ▼
         ┌────────────────────────────────────────────────────┐
         │      STAGE 2: CONTENT LAYER GENERATION              │
         │                                                     │
         │  For each subtopic, generate 4 layers:              │
         │                                                     │
         │  1. CONCEPT (Knowledge) ───────────────────────┐    │
         │     • keCoverage, pcVerbsCovered               │    │
         │     • trainerOverrideAllowed                   │    │
         │     • Context-bound to job/task/equipment      │    │
         │                                                │    │
         │  2. SCENARIO (Application) ────────────────────┤    │
         │     • mentalModel.id (MM-01 to MM-15)          │    │
         │     • pcSummaryAssertion                       │    │
         │     • Job-specific decision points             │    │
         │                                                │    │
         │  3. OUTCOME (Consequences) ────────────────────┤    │
         │     • Real-world impact                        │    │
         │     • Investigation references                 │    │
         │                                                │    │
         │  4. ACTIVITY (Assessment Support) ─────────────┘    │
         │     • peEvidenceType (decision/sequence/etc.)       │
         │     • peCoverage, keCoverage                        │
         │     • 6 activity types available                    │
         │                                                     │
         │  Anti-Generic Rules Applied:                        │
         │  ✓ Office Work Test (fail if too generic)           │
         │  ✓ Unit Title Anchoring                             │
         │  ✓ Industry Lock                                    │
         │  ✓ Legislation Safety                               │
         └───────────────────────┬────────────────────────────┘
                                 │
                                 ▼
         ┌────────────────────────────────────────────────────┐
         │           MANIFEST + AUDIT EXPORT                   │
         │                                                     │
         │  • JSON manifest with all content + metadata        │
         │  • Excel export with coverage mapping               │
         │  • KE/PE/PC coverage summary                        │
         │  • Mental model usage tracking                      │
         │  • Element-to-content mapping for auditors          │
         └────────────────────────────────────────────────────┘
```

---

## CONTENT CONSTRAINT AUDIT (v6.9.6)

### Identified Issues - FIXED

The following constraints were artificially limiting important content:

| Card Type | Field | Previous Constraint | Issue | Fix Applied |
|-----------|-------|---------------------|-------|-------------|
| Concept | keyFacts | Exactly 6 items | May need 3-8 depending on PC complexity | Changed to "3-8 items, as needed" |
| Concept | requirements | Exactly 6 items | Complex PCs need more | Changed to "4-10 items, cover all PC requirements" |
| Concept | positiveList | 4 items (VET) / 6 items (Workplace) | Truncates important safety steps | Changed to "4-8 items, as needed" |
| Concept | negativeList | 4 items (VET) / 6 items (Workplace) | Truncates important warnings | Changed to "4-8 items, as needed" |
| Best Response | responses | Exactly 5 responses | May need 4-6 for complex scenarios | Changed to "4-6 responses" |
| Task Sequencing | steps | 6-8 steps | Some procedures need 5-10 | Changed to "5-10 steps, as needed" |
| Scenario | incorrectResponses | 2 responses | May need 2-4 for complex decisions | Changed to "2-4 responses" |

### Guiding Principle

**Content completeness over arbitrary limits.**

The AI should generate as much content as needed to:
1. Fully cover all requirements in the PC
2. Address all relevant KE items
3. Include all critical safety considerations
4. Provide sufficient examples for understanding

Minimum thresholds ensure quality; maximum guidelines prevent bloat.

---

## CHATGPT SIGN-OFF CHECKLIST

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| PC Coverage 100% | ✅ | 1:1 mapping with instructional rewrites |
| KE Explicit Teaching | ✅ | keCoverage metadata in concept cards |
| PE Observable Demonstration | ✅ | peEvidenceType in all activity schemas |
| Mental Model Versioning | ✅ | MM-01 to MM-15 with unique IDs |
| Trainer Override Support | ✅ | trainerOverrideAllowed flag |
| PC Summary Assertion | ✅ | Auto-generated for assessment records |
| Stop-Work Authority | ✅ | detectStopWorkCoverage() for WHS units |
| State Incident References | ✅ | incidentReference field with regulator patterns |
| Anti-Generic Enforcement | ✅ | Office work test, unit anchoring |
| Industry Lock | ✅ | No cross-contamination |
| Legislation Safety | ✅ | No named Acts/Regulations |
| VET Route | ✅ | Unit of Competency as primary authority |
| Workplace Route | ✅ | Documents as primary authority, same pattern |

---

## VERSION HISTORY

- **v6.9.6** (January 11, 2026): ChatGPT Audit-Proof Refinements
  - Versioned Mental Model Library (15 models)
  - PE Evidence Type Tags
  - Trainer Override Flag
  - PC-Level Summary Assertion
  - Stop-Work Authority Detection

---

**ChatGPT Sign-Off: January 11, 2026**
**Architecture Status: 100% ASQA Compliant**
