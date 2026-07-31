# COURSEWARE BUILDER — MASTER BUILD PLAN (v7.5.x)

**Version:** 7.5.x  
**Status:** ChatGPT Approved  
**Last Updated:** January 14, 2026

---

## 1. PURPOSE

Courseware Builder converts:
- Any Unit of Competency
- Any workplace procedure/document upload (PDF/DOC/text)

Into:
- High-quality learning slides
- Scenario-based decision questions
- Instant feedback
- Quick-check checklists + reflection
- **Document-based activities (AFTER the 5 cards)**
- Audit-safe content (no hallucination)

---

## 2. CORE LEARNING ARCHITECTURE

### 2.1 The 5-Card Learning Model (per Topic)

Every generated topic MUST contain exactly **5 cards**, always in this order:

| # | Card Type | Purpose | Requirements |
|---|-----------|---------|--------------|
| 1 | **Knowledge** | Teach what it is + why it matters | 5 bullets (15-25 words each), "what + why" in every bullet, terminology explained, safe/unsafe contrast |
| 2 | **Scenario** | Make it realistic and relatable | 120-160 words, Australian workplace context, names + roles, one pressure/complication, forces learner to consult procedure |
| 3 | **Decision** | Test decision-making on the job | "What should [Name] do next?", 4 options A-D, ONE correct answer only, 3 believable distractors, similar option lengths |
| 4 | **Feedback** | Teach consequences and reinforce procedure | For each option: Correct/Incorrect label, 1 sentence explanation (15-25 words), scenario-specific reasoning |
| 5 | **Quick-Check** | Lock in safe habits before task starts | Q1 True/False + answer, Q2 short-answer + answer, checklist tone: "before you start..." |

### 2.2 Document Activity (AFTER the 5 Cards)

After the 5 learning cards, the system generates **1-2 document-based activities**.

**NO POPUPS during learning cards.** Documents are used in activities only.

---

## 3. WORKPLACE DOCUMENT SYSTEM

### 3.1 Seven Domains

| Domain | Example Documents |
|--------|-------------------|
| **A) Safety & Risk** | SWMS, JSA, JHA, Hazard Report, Incident Report, Risk Assessment, Permit to Work |
| **B) Equipment & Logistics** | Tool checklist, maintenance logs, inspection tags/registers |
| **C) Procedures & Operations** | SOPs, task instructions, operating procedures, shift handover |
| **D) Personnel & Training** | Induction guides, competency checklists, training sign-offs |
| **E) Quality & Compliance** | QA checks, audit checklists, compliance registers |
| **F) Environment & Sustainability** | Spill response plans, waste disposal, environmental incident logs |
| **G) Administration & Records** | Forms, templates, job records, customer service logs |

### 3.2 Render Profiles (5 Types)

| Profile | Use Case |
|---------|----------|
| `stepsTable` | Numbered steps in table format |
| `formFields` | Form-like fields (name/date/checks) |
| `checklist` | Tick-box style list |
| `policyExcerpt` | Short policy snippet with key rules |
| `procedure` | Clean procedure steps + notes |

---

## 4. DOCUMENT LEARNING ACTIVITIES (5 Types)

These appear **AFTER the 5 learning cards**, not as popups:

| Activity | Description |
|----------|-------------|
| **1. behaviour-sort** | Learner sorts examples into ✅ Correct / ❌ Incorrect |
| **2. requirement-match** | Match requirements to correct document sections |
| **3. scenario-decision** | Second scenario choice based on document excerpt |
| **4. sequence-order** | Order steps into correct sequence |
| **5. spot-issue** | Identify what is wrong in a document excerpt |

---

## 5. PERFECT MODE GENERATION PIPELINE (3 Stages)

### Stage 1 — Draft
**Goal:** Produce correct + structured cards

Rules enforced:
- Document grounded
- No hallucinated numbers/standards
- Single best answer
- Safe language if missing

### Stage 2 — Upgrade
**Goal:** Make it feel human and "trainer written"

Upgrades include:
- Stronger teaching value ("what + consequence")
- Better rhythm (less repetitive verbs)
- More believable workplace scenario
- Stronger distractors

### Stage 3 — Perfect Quality Gate (8/8)
**Goal:** Approve or rewrite from scratch

Outputs only:
- ✅ APPROVED
- ✅ FIXED + full rewritten version

---

## 6. PERFECT QUALITY GATES (8/8)

Every topic must pass ALL gates:

| Gate | Name | Requirement |
|------|------|-------------|
| 1 | PC Alignment Locked-in | Content based on PC text (or extracted actions) |
| 2 | Document Grounding (Audit Safe) | No invented steps/numeric rules/compliance claims |
| 3 | Scenario Believability | Not generic; includes real workplace pressure |
| 4 | MCQ Single Best Answer | Only one defensible correct option |
| 5 | 5-Card Structure Consistent | Correct format + length rules |
| 6 | Australian English + Level | Clear Aussie language, worker-friendly vocabulary |
| 7 | No Unexplained Acronyms | Any acronym explained on first use |
| 8 | Anti-Repetition Across Topics | Stops "SWMS/PPE/weather/rescue" repeating |

---

## 7. COMPLIANCE SAFETY RULES (Hallucination Prevention)

The system MUST NEVER invent:
- Inspection timeframes ("every 12 months")
- Legal obligations ("WHS Reg 2011 says…")
- Numeric load ratings ("must be 15kN…")
- Wind limits ("stop above 35 km/h…")

**Unless explicitly stated in the uploaded document.**

Safe language when missing:
- ✅ "as per site procedure"
- ✅ "confirm with supervisor"
- ✅ "follow manufacturer instructions"

---

## 8. TOPIC STRUCTURE (Per PC)

```
┌─────────────────────────────────────────────────┐
│                 TOPIC (1 per PC)                │
├─────────────────────────────────────────────────┤
│  Card 1: KNOWLEDGE                              │
│  Card 2: SCENARIO                               │
│  Card 3: DECISION (MCQ)                         │
│  Card 4: FEEDBACK                               │
│  Card 5: QUICK-CHECK                            │
├─────────────────────────────────────────────────┤
│  Document Activity (1-2 per topic)              │
│  - behaviour-sort / requirement-match /         │
│    scenario-decision / sequence-order /         │
│    spot-issue                                   │
└─────────────────────────────────────────────────┘
```

---

## 9. OUTPUT FORMAT (JSON)

```json
{
  "courseTitle": "...",
  "topicCount": 4,
  "topics": [
    {
      "topicNumber": 1,
      "topicTitle": "...",
      "pcCode": "1.1",
      "qaResult": "APPROVED",
      "gateStatus": "8/8",
      "cards": [
        { "cardType": "knowledge", ... },
        { "cardType": "scenario", ... },
        { "cardType": "decision", ... },
        { "cardType": "feedback", ... },
        { "cardType": "quick-check", ... }
      ],
      "documentActivity": {
        "activityType": "behaviour-sort",
        "documentType": "swms",
        ...
      }
    }
  ]
}
```

---

## 10. MISSION STATEMENT

> **Courseware Builder turns workplace procedures and unit requirements into perfect microlearning topics, using a 5-card model, document-grounded scenarios, MCQs, feedback, quick checks, and 8/8 quality gates with auto-rewrites until trainer-quality output is achieved. Document activities follow AFTER the learning cards — NO popups during learning.**

---

## ChatGPT Sign-Off

**Status:** ✅ APPROVED  
**Date:** January 14, 2026  
**Verdict:** This is the definitive v7.5.x architecture
