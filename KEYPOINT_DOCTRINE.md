# What a KeyPoint Is (and Is Not)
## AI Content Creator - Internal Doctrine Document
## v7.0 4-Layer Architecture

---

# PURPOSE

This document exists to prevent future developers from "optimising" the wrong thing.

A keyPoint is the fundamental unit of the v7.0 Competency Spine architecture. Misunderstanding what a keyPoint represents will break the entire system.

---

# THE DEFINITION

## A keyPoint IS:

### ✅ A Decision Boundary

A keyPoint marks a point where a competent worker must make a judgement call. Two equally competent workers might reasonably take different approaches.

**Example**: "Determine if wind speed exceeds safe threshold for height work"
- Worker A might pause work at 25 km/h gusts
- Worker B might continue until 30 km/h sustained
- Both could be correct depending on context

### ✅ A Point of Professional Disagreement

If all workers would agree on the action, it's not a keyPoint — it's a platitude.

**The Test**: "Could two competent workers reasonably disagree about what to do here?"
- If NO → Prune it
- If YES → Keep it

### ✅ A Source for Scenario Generation

Every keyPoint must be capable of generating a workplace scenario where the learner makes a decision.

**Example**: "Assess whether anchor point is rated for dynamic load" 
→ Can generate: "You find a 15kN rated anchor. Your lanyard is 2m with shock absorber. Is this anchor adequate?"

### ✅ Abstract and Context-Free

A keyPoint exists at Layer 1 — before worker context is applied. It contains no:
- Job titles
- Equipment names
- Industry-specific language
- Workplace examples

---

## A keyPoint is NOT:

### ❌ A Task

**Wrong**: "Install the fall arrest system"
**Right**: "Determine correct fall arrest configuration for the work environment"

Tasks are actions. KeyPoints are decisions about actions.

### ❌ A Procedure

**Wrong**: "Complete the permit-to-work form"
**Right**: "Determine when permit isolation requires additional signatories"

Procedures are steps to follow. KeyPoints are judgement calls within procedures.

### ❌ A Compliance Checkbox

**Wrong**: "Verify harness meets requirements"
**Right**: "Assess harness wear patterns against manufacturer replacement criteria"

Compliance checkboxes are binary. KeyPoints require professional judgement.

### ❌ A Generic Best Practice

**Wrong**: "Follow workplace procedures"
**Right**: "Determine when site-specific procedures override general safe work methods"

Generic statements add no learning value because everyone already knows them.

---

# THE BOILERPLATE TEST

These patterns are ALWAYS wrong in keyPoints:

| Pattern | Why It Fails |
|---------|-------------|
| "Verify [X] meets requirements" | Binary check, no judgement |
| "Document [X] as per procedures" | Procedural, no decision |
| "Report issues to supervisor" | Everyone knows this |
| "Apply knowledge of [X]" | Meaningless abstraction |
| "Demonstrate understanding of [X]" | Not observable |
| "Follow workplace procedures" | Generic best practice |
| "Comply with legislation" | Everyone must do this |
| "Ensure compliance with [X]" | Not a decision |

---

# THE PRACTICAL TEST

When reviewing a keyPoint, ask:

1. **Can I write a scenario for this?**
   - If NO → Too abstract or too procedural → Rewrite

2. **Would a worker need to think about this?**
   - If NO → Too obvious → Prune

3. **Could a trainer assess this with a follow-up question?**
   - If NO → Not observable → Rewrite

4. **Does this require professional judgement?**
   - If NO → Just a task → Prune

---

# WHY THIS MATTERS

## For Learners

Learners don't benefit from being told things they already know. KeyPoints that are decision boundaries create actual learning:

- They challenge assumptions
- They require application of knowledge
- They prepare workers for real workplace uncertainty

## For Trainers

Decision-capable keyPoints give trainers something to assess. "Did the learner make a defensible decision?" is assessable. "Did the learner follow procedures?" is not (beyond yes/no).

## For Auditors

ASQA auditors look for evidence that training addresses the gaps between theoretical knowledge and workplace competence. Decision boundaries are exactly where those gaps exist.

## For the AI System

Layer 2 (Contextual Expansion) cannot create meaningful scenarios from generic keyPoints. If Layer 1 produces "verify meets requirements", Layer 2 can only produce "check if the harness is okay" — which teaches nothing.

---

# THE GOLDEN RULE

> **If everyone agrees, there's nothing to teach.**

A keyPoint must mark a point where reasonable professionals might differ. That's where learning happens.

---

# GOLD STANDARD EXAMPLE (v7.0)

The following is a perfect Element 1 showing what "done" looks like. If every element matched this quality, the architecture is complete.

## Element 1: Identify work requirements (RIIWHS204E)

### PC 1.1 — Obtain, interpret and confirm work requirements

- Obtain authorised work instructions and technical information relevant to working at heights.
- Interpret work requirements to understand task scope, sequencing, and constraints.
- Confirm work requirements with relevant personnel before commencing work.
- **Escalate and do not proceed if work requirements are unclear, incomplete, or inconsistent.**

### PC 1.2 — Access, interpret and apply documentation required to work safely at heights

- Access safety documentation applicable to the task and worksite.
- Interpret documentation to identify required control measures and limitations.
- Apply documented controls during planning and work activities.
- **Escalate and do not proceed if documentation does not reflect actual site conditions.**

### PC 1.3 — Identify and address potential risks, hazards and environmental issues

- Identify hazards and environmental issues associated with working at heights.
- Assess the level of risk posed by identified hazards.
- Select and implement control measures in accordance with workplace procedures.
- **Escalate hazards that cannot be adequately controlled.**

### PC 1.4 — Inspect worksite to determine layout, physical condition, and equipment requirements

- Inspect the worksite to identify layout, access conditions, and physical constraints.
- Assess the condition and stability of structures and surfaces used for work at heights.
- Determine equipment and access requirements based on inspection findings.
- **Escalate unsafe site conditions before commencing work.**

### PC 1.5 — Adhere to legislative requirements

- Interpret legislative and regulatory requirements that apply to working at heights.
- Apply legislative requirements when planning and performing work activities.
- Recognise situations where legislative requirements are not being met.
- **Escalate non-compliance and cease work where required.**

### PC 1.6 — Select appropriate plant, tools and equipment and inspect for serviceability

- Select plant, tools, and equipment appropriate to the task and working-at-heights conditions.
- Determine whether selected equipment is suitable and serviceable for use.
- Remove unserviceable equipment from use.
- **Escalate equipment issues before commencing work.**

### PC 1.7 — Select and wear personal protective equipment appropriate for work activities

- Determine PPE requirements based on task and identified hazards.
- Select PPE that is appropriate, compatible, and correctly fitted.
- Determine whether PPE is suitable and serviceable for use.
- **Do not commence work if required PPE is unavailable or unserviceable.**

### PC 1.8 — Obtain and interpret emergency procedures and be prepared for emergency situations

- Obtain emergency procedures relevant to the worksite and task.
- Interpret emergency procedures to understand response actions and communication methods.
- Identify emergency equipment and access points relevant to the task.
- Recognise emergency situations and initiate required response actions.

## Why This Is Gold Standard

| Property | Status |
|----------|--------|
| Every line is a decision boundary | ✅ |
| Every PC has exactly one escalation/non-proceed | ✅ |
| Zero procedural leakage | ✅ |
| Zero boilerplate | ✅ |
| Maximum scenario and assessment power | ✅ |
| Exactly 3-4 keyPoints per PC | ✅ |
| Works for WHS and non-WHS units | ✅ |

---

*Document created: January 11, 2026*
*Architecture version: v7.0 (v6.9.41 validators)*
*ChatGPT Recommendation: #5 - Human-Readable Doctrine Page*
