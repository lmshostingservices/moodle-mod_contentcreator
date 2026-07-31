# AI Content Creator - Complete Content Creation Flow
## ChatGPT Sign-Off Document v6.9.7 - Maximum Detail
## January 11, 2026

---

# SECTION 1: EXECUTIVE SUMMARY

## Purpose
This document provides **maximum detail** about every aspect of the content creation flow for ChatGPT sign-off. It covers:
- How user inputs flow through the system
- How dynamic context (job titles, tasks, equipment) is incorporated into every card
- Each content card type with complete field specifications and content capacity
- Each activity type with complete field specifications
- The two-stage architecture and why it exists
- The 44 ADD-ON rules that govern content quality

## Core Architecture: Two-Stage Generation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        TWO-STAGE ARCHITECTURE                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  STAGE 1: TOPIC PLANNER (Neutral Compliance Spine)                          │
│  ─────────────────────────────────────────────────────────────────────────  │
│  • Generates topics/subtopics from Primary Authority                        │
│  • Maps each subtopic to specific PCs (1:1 ratio)                           │
│  • Topics are NEUTRAL - not yet contextualised                              │
│  • Purpose: Ensure 100% coverage of compliance requirements                 │
│                                                                              │
│                              ↓                                               │
│                                                                              │
│  STAGE 2: CONTENT LAYER GENERATION (Anti-Generic Enforcement)               │
│  ─────────────────────────────────────────────────────────────────────────  │
│  • Takes each subtopic from Stage 1                                         │
│  • BINDS dynamic context: Job Titles + Tasks + Equipment + Industry         │
│  • Generates 3 content layers + 2-3 activities per subtopic                 │
│  • Applies 44 ADD-ON rules for quality enforcement                          │
│  • Output: Learner-facing, job-realistic, audit-proof content               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

# SECTION 2: USER INPUT FLOW (COMPLETE DETAIL)

## 2.1 VET Route Inputs

### Step 1: User-Provided Inputs

| Input Field | Description | Example | How It's Used |
|-------------|-------------|---------|---------------|
| **Unit Code** | TGA unit identifier | `RIIWHS204E` | Fetches Unit of Competency from training.gov.au |
| **Industry** | Broad industry category | `Mining` | Scopes AI-generated job titles, tasks, equipment |
| **Industry Sector** | Specific sector within industry | `Underground Mining` | Narrows context for realism (e.g., "coal extraction" vs "gold processing") |
| **Job Level** | Worker / Supervisor / Manager | `Worker` | Determines perspective and authority level in scenarios |
| **State/Territory** | Australian state | `NSW` | Selects correct WHS regulator (SafeWork NSW) and legislation |
| **Reference Documents** | Optional uploaded PDFs | Site induction manual | Adds workplace-specific anchors to content |

### Step 2: TGA API Data (Auto-Retrieved)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      DATA RETRIEVED FROM training.gov.au                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  UNIT STRUCTURE:                                                             │
│  ├─ Unit Code: RIIWHS204E                                                   │
│  ├─ Unit Title: Work safely at heights                                      │
│  ├─ Unit Descriptor: Skills and knowledge for safe height work              │
│  │                                                                           │
│  ├─ ELEMENTS (Major competency areas):                                      │
│  │   ├─ Element 1: Prepare for work at heights                              │
│  │   ├─ Element 2: Access and work at heights                               │
│  │   └─ Element 3: Conclude work at heights                                 │
│  │                                                                           │
│  ├─ PERFORMANCE CRITERIA (What must be demonstrated):                       │
│  │   ├─ PC 1.1: Access, interpret and apply work at heights...              │
│  │   ├─ PC 1.2: Obtain and confirm work requirements from...                │
│  │   ├─ PC 1.3: Identify and assess hazards and risks...                    │
│  │   ├─ PC 2.1: Access work area using designated access...                 │
│  │   └─ ... (all PCs for the unit)                                          │
│  │                                                                           │
│  ├─ KNOWLEDGE EVIDENCE (KE - What must be known):                           │
│  │   ├─ Types of hazards and risks associated with heights                  │
│  │   ├─ Types of personal fall protection equipment                         │
│  │   ├─ Hierarchy of controls for height work                               │
│  │   └─ ... (8-15 KE items typically)                                       │
│  │                                                                           │
│  ├─ PERFORMANCE EVIDENCE (PE - What must be done):                          │
│  │   ├─ On at least two occasions, access and work at heights               │
│  │   ├─ Use personal fall protection equipment correctly                    │
│  │   ├─ Respond to emergency situations                                     │
│  │   └─ ... (5-10 PE items typically)                                       │
│  │                                                                           │
│  ├─ FOUNDATION SKILLS (FS - Embedded skills):                               │
│  │   ├─ Reading: Interpret procedures, SWMS, signage                        │
│  │   ├─ Writing: Complete permits, checklists, reports                      │
│  │   ├─ Oral Communication: Report hazards, confirm instructions            │
│  │   └─ ... (typically 5-8 foundation skills)                               │
│  │                                                                           │
│  └─ ASSESSMENT CONDITIONS:                                                   │
│      ├─ Assessors must satisfy NSVR requirements                            │
│      ├─ Performance must be observed on 2+ occasions                        │
│      ├─ Access to height work equipment and suitable location               │
│      └─ Assessment must meet workplace conditions                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Step 3: AI Context Analysis (Dynamic Context Generation)

The AI receives: **Unit data + Industry + Sector + Job Level**

The AI generates **6 options each** for:

#### Job Titles (User selects 1-3)
```json
{
  "jobTitles": [
    {
      "title": "Underground Drill Operator",
      "level": "Worker",
      "elementMapping": ["E1", "E2"],
      "mappingRationale": "Drill operators work at height when accessing equipment platforms",
      "typicalTasks": ["Equipment platform access", "Overhead inspection", "Cable routing at height"]
    },
    {
      "title": "Shift Supervisor - Extraction",
      "level": "Supervisor",
      "elementMapping": ["E1", "E2", "E3"],
      "mappingRationale": "Supervisors oversee height work and authorise access",
      "typicalTasks": ["Height work approval", "SWMS review", "Team coordination"]
    }
  ]
}
```

#### Task Categories (User selects 1-3)
```json
{
  "taskCategories": [
    {
      "category": "Equipment Platform Access",
      "elementMapping": ["E2"],
      "examples": [
        "Climbing fixed ladders to conveyor platforms",
        "Accessing crusher maintenance walkways",
        "Working on elevated control rooms"
      ],
      "hazards": ["Unguarded edges", "Slippery surfaces", "Moving machinery below"]
    },
    {
      "category": "Overhead Cable Installation",
      "elementMapping": ["E1", "E2"],
      "examples": [
        "Running power cables along tunnel roof",
        "Installing ventilation ducting",
        "Mounting sensors at height"
      ],
      "hazards": ["Cable weight", "Working near energised equipment", "Limited access/egress"]
    }
  ]
}
```

#### Equipment Categories (User selects 1-3)
```json
{
  "equipmentCategories": [
    {
      "category": "Personal Fall Protection",
      "elementMapping": ["E1", "E2"],
      "examples": [
        "Full body harness",
        "Shock-absorbing lanyard",
        "Retractable fall limiter",
        "Anchor straps and connectors"
      ],
      "inspectionPoints": ["Webbing damage", "Buckle function", "Lanyard length", "Anchor rating"]
    },
    {
      "category": "Access Equipment",
      "elementMapping": ["E2"],
      "examples": [
        "Fixed access ladders",
        "Mobile elevated work platforms (MEWPs)",
        "Scaffold systems",
        "Temporary platforms"
      ],
      "inspectionPoints": ["Certification tags", "Guard rails", "Load ratings", "Lock mechanisms"]
    }
  ]
}
```

### Step 4: User Selection

User picks from the AI-generated options:
- **1-3 Job Titles** → Determines who the learner is in scenarios
- **1-3 Task Categories** → Determines what tasks appear in scenarios
- **1-3 Equipment Categories** → Determines what tools/equipment are referenced

**These selections flow into EVERY content card and activity prompt.**

---

## 2.2 Workplace Route Inputs

### Primary Authority: Uploaded Documents

Instead of a Unit of Competency, Workplace route uses:
- Policies (e.g., WHS Policy, Code of Conduct)
- Procedures (e.g., Incident Reporting Procedure)
- Manuals (e.g., Equipment Operating Manual)
- SOPs (e.g., Standard Operating Procedure for Forklift)

### Same Context Generation Pattern

The AI analyses documents and generates the same 3 categories:
- Job Titles (extracted from document references)
- Task Categories (extracted from procedures)
- Equipment Categories (referenced tools/systems)

User selection works identically to VET route.

---

# SECTION 3: HOW DYNAMIC CONTEXT FLOWS INTO CONTENT

## 3.1 Context Binding in Stage 2 Prompts

Every Stage 2 prompt receives the **complete context object**:

```javascript
// Context object passed to EVERY content generation prompt
const context = {
  // User inputs
  unitCode: "RIIWHS204E",
  unitTitle: "Work safely at heights",
  industry: "Mining",
  industrySector: "Underground Mining",
  jobLevel: "Worker",
  state: "NSW",
  
  // User-selected dynamic context
  selectedJobTitles: [
    { title: "Underground Drill Operator", level: "Worker" }
  ],
  selectedTasks: [
    { category: "Equipment Platform Access", examples: [...] }
  ],
  selectedEquipment: [
    { category: "Personal Fall Protection", examples: [...] }
  ],
  
  // Formatted for prompt injection
  learnerRole: "an Underground Drill Operator working in an underground coal mine",
  industryContext: "underground mining operations in NSW",
  jobTasks: [
    {
      task: "Equipment platform access",
      equipment: ["Full body harness", "Shock-absorbing lanyard", "Fixed access ladder"],
      hazards: ["Unguarded edges", "Moving machinery below"]
    }
  ],
  
  // TGA data
  elements: [...],
  performanceCriteria: [...],
  knowledgeEvidence: [...],
  performanceEvidence: [...],
  foundationSkills: [...],
  
  // Legislation context
  legislation: {
    primaryAct: "Work Health and Safety Act 2011 (NSW)",
    regulator: "SafeWork NSW",
    codes: ["Code of Practice: Managing the risk of falls at workplaces"]
  }
};
```

## 3.2 Prompt Injection Points

The context is injected at multiple points in every prompt:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CONTEXT INJECTION IN PROMPTS                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. SYSTEM PROMPT (Sets overall framing):                                   │
│     "You are creating content for ${learnerRole} in ${industryContext}"     │
│                                                                              │
│  2. AUTHORITY CONTEXT (What must be taught):                                │
│     "Performance Criteria: ${PC number} - ${PC text}"                       │
│     "Knowledge Evidence to cover: ${KE items}"                              │
│                                                                              │
│  3. JOB TASK INTEGRATION (Anti-generic enforcement):                        │
│     "CRITICAL: All scenarios MUST be set during one of these tasks:         │
│      - ${task1} using ${equipment1}                                         │
│      - ${task2} using ${equipment2}"                                        │
│                                                                              │
│  4. SCENARIO ROLE (Who the learner is):                                     │
│     "You are ${selectedJobTitle}, working on ${selectedTask}"               │
│                                                                              │
│  5. EQUIPMENT REFERENCES (What tools are mentioned):                        │
│     "Equipment to reference: ${selectedEquipment.examples}"                 │
│                                                                              │
│  6. STATE-SPECIFIC CONTEXT (Legislation and regulator):                     │
│     "State: ${state}"                                                       │
│     "Regulator: ${regulator}"                                               │
│     "Incident references MUST use: ${regulator} investigation findings"     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

# SECTION 4: CONTENT CARDS (COMPLETE SPECIFICATIONS)

## 4.1 Layer 1: CONCEPT CARD (Knowledge - "What to Know")

### Purpose
Teaches the foundational knowledge for a subtopic. This is the "what" - facts, requirements, procedures, terminology that workers must know.

### When Generated
- One per subtopic (1:1 ratio with PC)
- First content layer generated

### Complete Schema with Content Capacity

```json
{
  "cardType": "knowledge",
  
  "contrastType": "safe-unsafe | great-poor-service | compliant-noncompliant | above-below-line | professional-unprofessional | effective-ineffective | best-avoid | correct-incorrect | acceptable-unacceptable | dos-donts",
  
  "keCoverage": [
    "KE item 1 text that this card explicitly teaches",
    "KE item 2 text that this card explicitly teaches"
  ],
  
  "pcVerbsCovered": ["obtain", "interpret", "identify", "confirm"],
  
  "trainerOverrideAllowed": true,
  
  "description": "A clear, practical explanation of what this covers and why workers need to know it (40-60 words). Written in plain workplace language.",
  
  "keyFacts": [
    {
      "icon": "info-circle | clipboard-check | lightbulb | alert-triangle | book-open | target | shield-check | users | file-text | eye",
      "text": "Key fact or requirement that workers must know",
      "importance": "critical | high | medium"
    }
  ],
  
  "requirements": [
    {
      "icon": "shield-check | clipboard-list | eye | users | file-text | check-circle",
      "text": "Short Title: Detailed explanation of mandatory requirement written as an action",
      "required": true
    }
  ],
  
  "positiveList": [
    "Specific action workers must take (starts with action verb)",
    "Specific behaviour that ensures compliance",
    "Practical step for safety/quality",
    "Best practice action to follow"
  ],
  
  "negativeList": [
    "Specific action that breaches policy (explain briefly why)",
    "Unsafe or non-compliant behaviour to avoid",
    "Common mistake that causes issues (with consequence)",
    "Prohibited practice to never do"
  ],
  
  "terminology": [
    {
      "term": "Key Term",
      "definition": "Plain English definition relevant to this context"
    }
  ]
}
```

### Content Capacity (Flexible Ranges)

| Field | Minimum | Maximum | Guidance |
|-------|---------|---------|----------|
| `keyFacts` | 3 | 8 | As needed to cover all important knowledge from PC |
| `requirements` | 4 | 10 | Must cover ALL PC verbs and mandatory requirements |
| `positiveList` | 4 | 8 | ALL critical correct practices - no truncation |
| `negativeList` | 4 | 8 | ALL critical warnings and risks - no truncation |
| `terminology` | 1 | 5 | Key technical terms only, not obvious words |

### How Dynamic Context Appears

```
EXAMPLE: CONCEPT CARD with context binding
─────────────────────────────────────────────────────────────────────────────

Context: Underground Drill Operator | Equipment Platform Access | Personal Fall Protection

Generated Content:
{
  "description": "Before accessing elevated platforms on drill equipment, operators must 
  verify their harness is correctly fitted and the anchor point is rated for the load. 
  This prevents falls during maintenance and inspection tasks on underground equipment.",
  
  "keyFacts": [
    {
      "icon": "alert-triangle",
      "text": "Underground equipment platforms typically have limited anchor points - 
               verify the anchor is rated for arrest loads before connecting",
      "importance": "critical"
    },
    {
      "icon": "clipboard-check",
      "text": "Full body harness must be inspected before each shift for webbing damage, 
               buckle function, and D-ring wear - tag out if defects found",
      "importance": "critical"
    }
  ],
  
  "positiveList": [
    "Inspect harness webbing, buckles and D-rings before each use",
    "Confirm anchor point is rated for fall arrest (minimum 15kN)",
    "Connect lanyard before stepping onto elevated platform",
    "Report any harness defects to supervisor immediately"
  ],
  
  "negativeList": [
    "Never connect to a point not rated for fall arrest - scaffold poles, handrails, 
     and pipes are NOT suitable anchor points",
    "Never adjust harness while connected at height - descend to ground level first",
    "Never share harnesses between workers without full re-inspection"
  ]
}

Note: Job title, task, and equipment appear naturally in the content, not as generic
placeholders like "[insert equipment]" or "[your workplace]".
─────────────────────────────────────────────────────────────────────────────
```

---

## 4.2 Layer 2: SCENARIO CARD (Application - "How to Apply")

### Purpose
Teaches through decision-making in realistic workplace situations. This is the "how" - applying knowledge when facing real workplace pressures and constraints.

### When Generated
- One per subtopic (after Concept Card)
- Second content layer generated

### Complete Schema with Content Capacity

```json
{
  "cardType": "application",
  
  "mentalModel": {
    "id": "MM-01 through MM-15",
    "name": "2-5 word transferable principle (e.g., 'Authority ≠ Accuracy')",
    "principle": "One-sentence explanation of the thinking pattern"
  },
  
  "keCoverage": ["KE item text tested by this scenario"],
  "peCoverage": ["PE item text demonstrated by this scenario"],
  "peEvidenceType": "decision | sequence | artifact | verbal-confirmation",
  "trainerOverrideAllowed": true,
  
  "role": "Who the learner is in this scenario (uses selected job title)",
  "context": "Setting description using selected task and equipment (50-70 words)",
  "decisionPoint": "The specific moment requiring a decision (30-50 words)",
  
  "predictionPrompt": "What could go wrong here? (optional pre-reveal question)",
  
  "correctResponse": {
    "action": "What the worker should do (specific, actionable)",
    "reasoning": "SHARP feedback - why this is correct, memorable not clinical",
    "communication": "Who they should inform and what to say"
  },
  
  "incorrectResponses": [
    {
      "action": "Common mistake workers might make",
      "reasoning": "Why workers might think this is OK",
      "risk": "SHARP consequence - emotionally weighted, realistic",
      "severity": "medium | high"
    }
  ],
  
  "incidentReference": "15-25 word factual statement about state regulator investigation findings",
  
  "keyTakeaway": "Maximum 15 words. Punchy, conversational. Should stick in memory.",
  
  "reflectionPrompt": "Optional: 'Where else have you seen this go wrong?'",
  
  "pcSummaryAssertion": "The learner has demonstrated the ability to [PC verbs] in accordance with site WHS procedures."
}
```

### Content Capacity (Flexible Ranges)

| Field | Minimum | Maximum | Guidance |
|-------|---------|---------|----------|
| `incorrectResponses` | 2 | 4 | As needed for scenario complexity |
| `role` | 15 words | 30 words | Specific job title with context |
| `context` | 50 words | 70 words | Detailed setting with pressures |
| `decisionPoint` | 30 words | 50 words | Clear dilemma with constraints |
| `keyTakeaway` | - | 15 words | MUST be punchy and memorable |
| `incidentReference` | 15 words | 25 words | Real regulator pattern, no case numbers |

### Mental Model Library (v6.9.6 - Versioned IDs)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    MENTAL MODEL LIBRARY (15 Proven Models)                   │
├──────┬────────────────────────────────────────────────────────────────────────┤
│ ID   │ Model Name + Principle                                                │
├──────┼────────────────────────────────────────────────────────────────────────┤
│MM-01 │ Stop-Work Authority                                                   │
│      │ "Any worker can stop work if safety is compromised"                   │
├──────┼────────────────────────────────────────────────────────────────────────┤
│MM-02 │ Verify Before Trust                                                   │
│      │ "Check yourself rather than assume others have done it right"         │
├──────┼────────────────────────────────────────────────────────────────────────┤
│MM-03 │ Authority ≠ Accuracy                                                  │
│      │ "Senior doesn't mean correct - verify regardless of who said it"      │
├──────┼────────────────────────────────────────────────────────────────────────┤
│MM-04 │ Document Before Act                                                   │
│      │ "If it's not documented, it didn't happen"                            │
├──────┼────────────────────────────────────────────────────────────────────────┤
│MM-05 │ Hierarchy of Controls                                                 │
│      │ "Eliminate before mitigate, engineer before administrate"             │
├──────┼────────────────────────────────────────────────────────────────────────┤
│MM-06 │ Assume Failure                                                        │
│      │ "What if this control fails? What's the backup?"                      │
├──────┼────────────────────────────────────────────────────────────────────────┤
│MM-07 │ Time Pressure ≠ Shortcut Permission                                   │
│      │ "Urgency doesn't reduce risk - it increases it"                       │
├──────┼────────────────────────────────────────────────────────────────────────┤
│MM-08 │ Escalate When Unsure                                                  │
│      │ "If you're wondering whether to escalate, that's your answer"         │
├──────┼────────────────────────────────────────────────────────────────────────┤
│MM-09 │ Changed Conditions = New Assessment                                   │
│      │ "Yesterday's risk assessment doesn't cover today's conditions"        │
├──────┼────────────────────────────────────────────────────────────────────────┤
│MM-10 │ PPE is Last Resort                                                    │
│      │ "PPE protects when everything else has failed"                        │
├──────┼────────────────────────────────────────────────────────────────────────┤
│MM-11 │ Near Miss = System Failure                                            │
│      │ "A near miss is a free lesson - ignoring it costs lives"              │
├──────┼────────────────────────────────────────────────────────────────────────┤
│MM-12 │ Two-Person Verification                                               │
│      │ "Critical controls need independent confirmation"                      │
├──────┼────────────────────────────────────────────────────────────────────────┤
│MM-13 │ Complete the Loop                                                     │
│      │ "Reporting without follow-up is just noise"                           │
├──────┼────────────────────────────────────────────────────────────────────────┤
│MM-14 │ Fatigue = Impairment                                                  │
│      │ "Tired workers make the same mistakes as impaired workers"            │
├──────┼────────────────────────────────────────────────────────────────────────┤
│MM-15 │ Competence Over Confidence                                            │
│      │ "Experience doesn't prevent errors - it just hides them longer"       │
└──────┴────────────────────────────────────────────────────────────────────────┘
```

### PE Evidence Types (v6.9.6)

| Type | Description | Example Activities |
|------|-------------|-------------------|
| `decision` | Learner makes a judgement call | Scenario cards, Escalation decisions |
| `sequence` | Learner orders steps correctly | Task sequencing, Process activities |
| `artifact` | Learner produces a document/output | Form completion, Report writing |
| `verbal-confirmation` | Learner confirms understanding | Discussion prompts, Role-plays |

### State-Specific Incident Reference Examples

```
NSW:  "SafeWork NSW investigations found workers began height work with 
       correct PPE but outdated SWMS that didn't cover changed conditions"

VIC:  "WorkSafe Victoria reported multiple incidents where isolation 
       procedures were signed off but not physically verified at the panel"

QLD:  "WHSQ investigations identified a pattern of workers trusting 
       verbal instructions over documented procedures for high-risk work"

WA:   "DMIRS found that fatigue-related incidents increased 40% during 
       final shifts of roster cycles in remote mining operations"

SA:   "SafeWork SA noted recurring incidents where harness inspection 
       was documented but physical checks were not performed"

TAS:  "WorkSafe Tasmania identified failures in pre-start checks where 
       checklists were signed before actual inspections completed"

NT:   "NT WorkSafe found multiple incidents where workers assumed 
       rescue plans existed but none had been developed or communicated"

ACT:  "WorkSafe ACT investigations revealed permit-to-work systems 
       that existed on paper but were routinely bypassed in practice"
```

### RULES FOR INCIDENT REFERENCES:
- ✅ Use regulator name and investigation pattern
- ✅ Describe systemic finding, not individual incident
- ✅ Make it emotionally weighted (real consequences)
- ❌ Do NOT invent case numbers or specific dates
- ❌ Do NOT cite specific company names
- ❌ Do NOT claim specific fatality numbers

---

## 4.3 Layer 3: OUTCOME CARD (Consequences - "Why It Matters")

### Purpose
Shows what happens when work is done correctly vs incorrectly. This is the "why" - consequences that make content memorable and drive behaviour change.

### When Generated
- One per subtopic (after Scenario Card)
- Third content layer generated

### Complete Schema

```json
{
  "cardType": "outcome",
  
  "goodOutcome": {
    "scenario": "What happens when this is done correctly (40-60 words)",
    "benefits": [
      "Immediate positive result for the worker",
      "Benefit for the team or workplace",
      "Longer-term positive consequence"
    ]
  },
  
  "poorOutcome": {
    "scenario": "What happens when this is done incorrectly (40-60 words)",
    "consequences": [
      "Immediate negative result (SHARP - emotionally weighted)",
      "Escalating consequence",
      "Serious or fatal potential outcome"
    ]
  },
  
  "realWorldContext": "How this plays out in the actual workplace (30-40 words)",
  
  "preventionTakeaway": "Maximum 15 words. Punchy principle for prevention.",
  "learningTakeaway": "Maximum 15 words. Punchy and conversational."
}
```

---

# SECTION 5: ACTIVITY TYPES (COMPLETE SPECIFICATIONS)

## 5.1 Activity Selection Rules

```
MANDATORY RULES:
- At least ONE activity must involve decision-making
- Maximum ONE reflection-based activity per topic
- 2-3 activities generated per topic

SELECTION GUIDANCE:
- Procedural topics → Task Sequencing + Scenario Branching
- Decision-heavy topics → Scenario Branching + Best Response
- Communication topics → Escalation Decision + Scenario Branching
- Knowledge-heavy topics → What Went Wrong + Best Response
- Low-risk topics → Best Response + Micro Reflection
```

---

## 5.2 Scenario Branching Decision (FLAGSHIP Activity)

### Purpose
Multi-step decision-making with branching consequences. The learner faces 2-3 decision points where each choice leads to different outcomes.

### Complete Schema

```json
{
  "activityType": "scenario-branching",
  "cardType": "assessment-support",
  "peEvidenceType": "decision",
  "peCoverage": ["PE item text that this activity demonstrates"],
  "keCoverage": ["KE item text that this activity tests"],
  "trainerOverrideAllowed": true,
  
  "title": "Descriptive activity title",
  "scenarioIntro": "Sets the scene - role, task, constraints (60-80 words)",
  
  "decisionPoints": [
    {
      "id": 1,
      "situation": "First decision moment (40-60 words)",
      "options": [
        {
          "id": "1a",
          "text": "First option (action description)",
          "nextDecision": 2,
          "outcome": "What happens if this is chosen",
          "isOptimal": true,
          "feedback": "SHARP feedback - why this was the right call"
        },
        {
          "id": "1b",
          "text": "Second option (action description)",
          "nextDecision": null,
          "outcome": "How this leads to a problem",
          "isOptimal": false,
          "feedback": "SHARP feedback - 'This is how workers end up...'"
        }
      ]
    },
    {
      "id": 2,
      "situation": "Second decision moment following from 1a",
      "options": [...]
    }
  ],
  
  "optimalPath": ["1a", "2a", "3a"],
  "finalOutcome": "Summary of optimal path consequences",
  "mentalModel": {
    "id": "MM-03",
    "name": "Authority ≠ Accuracy"
  },
  "learningTakeaway": "Maximum 15 words. Punchy and memorable."
}
```

### Content Capacity

| Field | Minimum | Maximum |
|-------|---------|---------|
| Decision Points | 2 | 3 |
| Options per Decision | 2 | 3 |
| Scenario Intro | 60 words | 80 words |

---

## 5.3 Best Response Analysis

### Purpose
Learner classifies 4-6 responses as best, acceptable, or inappropriate. Develops nuanced judgement rather than binary right/wrong thinking.

### Complete Schema

```json
{
  "activityType": "best-response",
  "cardType": "assessment-support",
  "peEvidenceType": "decision",
  "peCoverage": ["PE item text"],
  "keCoverage": ["KE item text"],
  "trainerOverrideAllowed": true,
  
  "title": "Activity title",
  "situation": "Realistic workplace situation requiring response (50-70 words)",
  
  "responses": [
    {
      "id": 1,
      "text": "First possible response (specific action)",
      "classification": "best | acceptable | inappropriate",
      "explanation": "SHARP explanation - memorable, emotionally weighted"
    }
  ],
  
  "learningTakeaway": "Maximum 15 words."
}
```

### Content Capacity

| Field | Minimum | Maximum |
|-------|---------|---------|
| Responses | 4 | 6 |
| Best responses | 1 | 2 |
| Acceptable responses | 1 | 2 |
| Inappropriate responses | 1 | 2 |

---

## 5.4 What Went Wrong (Case Analysis)

### Purpose
Learner analyses a failure scenario to identify errors, explain correct approach, and propose prevention. Develops analytical skills.

### Complete Schema

```json
{
  "activityType": "what-went-wrong",
  "cardType": "assessment-support",
  "peEvidenceType": "decision",
  "peCoverage": ["PE item text"],
  "keCoverage": ["KE item text"],
  "trainerOverrideAllowed": true,
  
  "title": "Activity title",
  "caseStudy": "Description of what went wrong (80-100 words). Realistic, detailed, emotionally weighted.",
  
  "errors": [
    {
      "error": "Specific error that occurred",
      "consequence": "What this error caused",
      "correctApproach": "What should have been done instead"
    }
  ],
  
  "preventionMeasures": [
    "First prevention measure",
    "Second prevention measure",
    "Third prevention measure"
  ],
  
  "incidentReference": "15-25 word regulator investigation finding",
  "preventionTakeaway": "Maximum 15 words. Punchy.",
  "learningTakeaway": "Maximum 15 words."
}
```

### Content Capacity

| Field | Minimum | Maximum |
|-------|---------|---------|
| Errors | 2 | 4 |
| Prevention Measures | 3 | 5 |

---

## 5.5 Task Sequencing

### Purpose
Learner arranges procedural steps in correct order. Tests understanding of WHY sequence matters, not just memorisation.

### Complete Schema

```json
{
  "activityType": "task-sequencing",
  "cardType": "assessment-support",
  "peEvidenceType": "sequence",
  "peCoverage": ["PE item text"],
  "trainerOverrideAllowed": true,
  
  "title": "Activity title",
  "instruction": "Arrange these steps in the correct order for [specific procedure]",
  "context": "Brief context for when this procedure is used (20-30 words)",
  
  "steps": [
    {
      "id": 1,
      "text": "Step description - specific action",
      "correctPosition": 1,
      "whyHere": "Why this must come first/here",
      "stepType": "preparation | action | check | communication | decision"
    }
  ],
  
  "commonMistake": "SHARP description of consequence when sequence is wrong",
  "learningTakeaway": "Maximum 15 words."
}
```

### Content Capacity

| Field | Minimum | Maximum |
|-------|---------|---------|
| Steps | 5 | 10 |

---

## 5.6 Escalation Decision

### Purpose
Learner decides whether to handle, clarify, escalate, or document for each situation. Teaches professional judgement and role boundaries.

### Complete Schema

```json
{
  "activityType": "escalation-decision",
  "cardType": "assessment-support",
  "peEvidenceType": "decision",
  "peCoverage": ["PE item text"],
  "trainerOverrideAllowed": true,
  
  "title": "Activity title",
  "instruction": "For each situation, decide the most appropriate action",
  
  "situations": [
    {
      "id": 1,
      "situation": "Workplace situation description (30-50 words)",
      "correctAction": "handle | clarify | escalate | document",
      "explanation": "SHARP explanation of why this is the correct response",
      "wrongChoiceConsequence": "What happens if the wrong action is taken"
    }
  ],
  
  "learningTakeaway": "Maximum 15 words."
}
```

### Content Capacity

| Field | Minimum | Maximum |
|-------|---------|---------|
| Situations | 4 | 6 |

---

## 5.7 Micro Reflection

### Purpose
Structured reflection on workplace application. NOT journaling - focused on observable outcomes and practical commitments.

### Complete Schema

```json
{
  "activityType": "micro-reflection",
  "cardType": "assessment-support",
  
  "title": "Activity title",
  "instruction": "Take a moment to think about how this topic applies to your workplace.",
  
  "reflectionPrompts": [
    {
      "id": 1,
      "prompt": "Specific, targeted reflection prompt focused on workplace application",
      "exampleResponse": "SHARP example - realistic, specific, not generic (2-4 sentences)",
      "focusArea": "common-mistakes | first-steps | verification | communication | improvement"
    }
  ],
  
  "learningTakeaway": "Maximum 15 words."
}
```

### Content Capacity

| Field | Minimum | Maximum |
|-------|---------|---------|
| Reflection Prompts | 3 | 3 |

---

# SECTION 6: THE 44 ADD-ON RULES (SUMMARY)

## Tier 0: Learning Design Intent (ADD-ONs 26-28)
- ADD-ON 26: Learning Intent Declaration (Awareness/Practice/Decision/Recognition/Reflection)
- ADD-ON 27: Cognitive Load Governor (Max 3 anchors per paragraph)
- ADD-ON 28: Approved Narrative Frames (Start of shift, mid-task interruption, etc.)

## Tier 1: Industry Safety (ADD-ONs 0-13)
- ADD-ON 0: Industry Context Enforcement (Stay within selected industry)
- ADD-ON 7: Workplace Hierarchy (Report to, seek approval from)
- ADD-ON 10: Communication With Purpose (Consultation + reason)
- ADD-ON 13: WHS Legislation Reference (State-specific regulators)

## Tier 2: Legislation Safety (ADD-ONs 13-18)
- ADD-ON 14: State-Specific Legislation (Primary Act, Codes of Practice)
- ADD-ON 15: Regulator Reference (SafeWork NSW, WorkSafe VIC, etc.)
- ADD-ON 16: Specificity Anchors (Policies, forms, systems, roles)

## Tier 3: Task Specificity (ADD-ONs 16-24)
- ADD-ON 19: Consequence Awareness (What could go wrong)
- ADD-ON 20: Equipment Pre-Use Checks (Inspect before use)
- ADD-ON 21: Consequence Awareness MANDATORY (Explicit injury/death language for high-risk)
- ADD-ON 22: Worker Authority Calibration (Don't inflate authority)

## Tier 4: Universal Competency (ADD-ONs 25+)
- ADD-ON 29: Performance Verb Enforcement (Ban fuzzy verbs)
- ADD-ON 30: Consultation With Purpose MANDATORY (Every block needs consultation)
- ADD-ON 31: Documentation As Performance (Not admin, part of job)
- ADD-ON 32: Logical Progression (Plan → Prepare → Perform → Monitor → Finalise)
- ADD-ON 33: Assessment Readiness (Observable and assessable)
- ADD-ON 34: Strict Alignment (No merging, skipping, summarising)

## Tier 5: Quality Control (ADD-ONs 40-43)
- ADD-ON 40: Integrity & Hallucination Control (Stay within scope)
- ADD-ON 41: Rule Priority & Conflict Resolution
- ADD-ON 42: Fail-Fast Rewrite Trigger (Self-correction)
- ADD-ON 43: Unit Type Calibration (Procedural/Design/Interpersonal)

---

# SECTION 7: COMPLETE FLOW DIAGRAM

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                         COMPLETE CONTENT CREATION FLOW                                   │
└─────────────────────────────────────────────────────────────────────────────────────────┘

STEP 1: USER INPUTS
────────────────────────────────────────────────────────────────────────────────────────
User provides:
├─ Unit Code (VET) OR Documents (Workplace)
├─ Industry + Sector
├─ Job Level (Worker/Supervisor/Manager)
├─ State/Territory
└─ Optional: Reference Documents

↓

STEP 2: PRIMARY AUTHORITY FETCH
────────────────────────────────────────────────────────────────────────────────────────
VET: TGA API retrieves Unit of Competency
     → Elements, PCs, KE, PE, FS, Assessment Conditions
     
Workplace: Document parser extracts
     → Sections, requirements, procedures, referenced tools

↓

STEP 3: DYNAMIC CONTEXT GENERATION
────────────────────────────────────────────────────────────────────────────────────────
AI analyses: Primary Authority + Industry + Sector + Job Level

AI generates 6 options each:
├─ Job Titles (with element/section mapping)
├─ Task Categories (with element/section mapping + examples)
└─ Equipment Categories (with element/section mapping + examples)

User selects 1-3 from each category

↓

STEP 4: STAGE 1 - TOPIC PLANNING
────────────────────────────────────────────────────────────────────────────────────────
Input: Primary Authority (Unit OR Documents)

Output: Neutral topic structure
├─ Topic 1
│   ├─ Subtopic 1.1 → PC 1.1 mapping
│   ├─ Subtopic 1.2 → PC 1.2 mapping
│   └─ Subtopic 1.3 → PC 1.3 mapping
├─ Topic 2
│   ├─ Subtopic 2.1 → PC 2.1 mapping
│   └─ ...
└─ ...

Each subtopic has:
├─ pcMapping: { pcNumber, officialPC, instructionalPC }
├─ keItems: [relevant KE items]
├─ peItems: [relevant PE items]
└─ complexity: low/medium/high

↓

STEP 5: STAGE 2 - CONTENT LAYER GENERATION (Per Subtopic)
────────────────────────────────────────────────────────────────────────────────────────
For each subtopic, generate 3 layers + 2-3 activities:

CONTEXT BINDING (All prompts receive):
├─ Subtopic + PC mapping
├─ Selected Job Titles → learnerRole
├─ Selected Tasks → jobTasks array
├─ Selected Equipment → equipment references
├─ Industry + Sector → industryContext
├─ State → legislation context
└─ 44 ADD-ON rules

LAYER 1: CONCEPT CARD
├─ cardType: "knowledge"
├─ keyFacts: 3-8 items (flexible)
├─ requirements: 4-10 items (flexible)
├─ positiveList: 4-8 items (flexible)
├─ negativeList: 4-8 items (flexible)
├─ keCoverage: [KE items taught]
├─ pcVerbsCovered: [verbs from PC]
└─ trainerOverrideAllowed: true

↓

LAYER 2: SCENARIO CARD
├─ cardType: "application"
├─ mentalModel: { id: "MM-XX", name, principle }
├─ role: Uses selected job title
├─ context: Uses selected task + equipment
├─ decisionPoint: Realistic workplace dilemma
├─ correctResponse: { action, reasoning, communication }
├─ incorrectResponses: 2-4 items (flexible)
├─ incidentReference: State-specific regulator finding
├─ keyTakeaway: Max 15 words, punchy
├─ pcSummaryAssertion: "The learner has demonstrated..."
└─ trainerOverrideAllowed: true

↓

LAYER 3: OUTCOME CARD
├─ cardType: "outcome"
├─ goodOutcome: { scenario, benefits[] }
├─ poorOutcome: { scenario, consequences[] }
├─ preventionTakeaway: Max 15 words
└─ learningTakeaway: Max 15 words

↓

ACTIVITIES: 2-3 per topic (selected based on topic type)
├─ Scenario Branching (FLAGSHIP) - 2-3 decision points
├─ Best Response Analysis - 4-6 responses to classify
├─ What Went Wrong Case - Error analysis + prevention
├─ Task Sequencing - 5-10 steps in order
├─ Escalation Decision - 4-6 handle/clarify/escalate situations
└─ Micro Reflection - 3 targeted prompts

All activities receive same context binding.

↓

STEP 6: OUTPUT
────────────────────────────────────────────────────────────────────────────────────────
Complete manifest with:
├─ 25-45 cards per unit (typical)
├─ 100% PC coverage (verified)
├─ 100% KE coverage (verified)
├─ 100% PE coverage (verified)
├─ Job-realistic scenarios using selected context
├─ State-specific legislation references
├─ Audit trail metadata (keCoverage, pcVerbsCovered, peEvidenceType)
└─ Trainer override flags for contextualisation

Ready for Moodle LMS delivery.
```

---

# SECTION 8: CHATGPT SIGN-OFF CHECKLIST

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| PC Coverage 100% | ✅ | 1:1 mapping with instructional rewrites |
| KE Coverage 100% | ✅ | `keCoverage` field on every card |
| PE Coverage 100% | ✅ | `peCoverage` + `peEvidenceType` on activities |
| Mental Models Versioned | ✅ | MM-01 through MM-15 with IDs |
| PE Evidence Types | ✅ | decision/sequence/artifact/verbal-confirmation |
| Trainer Override | ✅ | `trainerOverrideAllowed` on every card |
| PC Summary Assertions | ✅ | End of scenario cards |
| Stop-Work Detection | ✅ | `detectStopWorkCoverage()` function |
| State-Specific Incidents | ✅ | `incidentReference` with regulator patterns |
| Flexible Content Ranges | ✅ | 3-8, 4-10, 5-10 instead of fixed counts |
| Dynamic Context Binding | ✅ | Job titles/tasks/equipment in every prompt |
| 44 ADD-ON Rules | ✅ | Embedded in system prompts |
| Anti-Generic Enforcement | ✅ | Job task integration mandatory |

---

## Document Version
- **Version**: 6.9.7
- **Date**: January 11, 2026
- **Author**: AI Grader Engineering Team
- **Purpose**: ChatGPT Sign-Off for Audit-Proof VET Content Creation

---

## SIGN-OFF STATEMENT

This document confirms that the AI Content Creator architecture:
1. Provides 100% coverage of PC, KE, and PE requirements
2. Uses dynamic context binding to eliminate generic content
3. Implements flexible content ranges to prevent truncation
4. Includes audit trail metadata on every card
5. Follows the ChatGPT-approved two-stage architecture
6. Applies 44 quality enforcement rules
7. Generates job-realistic, audit-proof content for ASQA compliance

**The system is ready for production use in Australian VET training delivery.**
