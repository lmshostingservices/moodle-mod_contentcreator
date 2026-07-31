# Topic & Content Quality Evaluation Checklist
## For AI Content Creator - v6.6.31

This checklist is designed for Replit/developers to evaluate AI-generated topic and content quality. It is:
- Deterministic (binary YES/NO)
- Explainable
- Auditable
- Compatible with optional inputs

---

## Gate A: Unit & Structure Compliance (MUST PASS ALL)

| Check | Rule | Pass Condition |
|-------|------|----------------|
| A1 | Matches correct unit element & PC | Topic title and scope clearly align to PC |
| A2 | Correct topic granularity | Topic = planning-level, not procedure |
| A3 | Observable intent | Each dot point describes an observable worker action |
| A4 | No banned verbs | No learn / understand / ensure / be aware of / familiarise |

**Fail any A-check = REJECT output**

---

## Gate B: Anti-Generic Enforcement (MUST PASS ALL)

| Check | Rule | Pass Condition |
|-------|------|----------------|
| B1 | Office Work Test | Cannot apply unchanged to office/retail/hospitality |
| B2 | Physical World Anchor | Mentions physical object/system |
| B3 | Action Specificity | Uses concrete action verb |
| B4 | Context Proof | At least one role/industry/location signal |

**Fail any B-check = REJECT output**

---

## Gate C: Contextual Binding (Dynamic - only test what exists)

| Input Provided | Required Signal in Output |
|---------------|---------------------------|
| jobTitle | Job-specific nouns (e.g. scaffold, planks, tie-ins) |
| industry / sector | Industry hazards, workflows, equipment |
| state / region | Local conditions (e.g. heat, wind, site rules) |
| jobLevel | Appropriate authority (worker ≠ supervisor) |

**If input exists and signal is missing = FAIL**

---

## Quality Scores (D - Scored, not gated)

| Check | Rule |
|-------|------|
| D1 | Uses industry-real terminology |
| D2 | Includes decision or judgement point |
| D3 | Avoids abstract compliance language |
| D4 | Reads naturally to a real worker |
| D5 | Could be expanded into a scenario |

---

## Scoring Model (100 points total)

### Gate Scores (must pass)
- Unit & Structure (A): Pass/Fail
- Anti-Generic (B): Pass/Fail
- Context Binding (C): Pass/Fail if applicable

**Fail any gate = Score = 0, auto-rewrite**

### Quality Scores (only if gates pass)

| Category | Weight |
|----------|--------|
| Physical specificity (objects + actions) | 25 |
| Context richness (role/industry/location) | 25 |
| Decision realism (judgement, stop/escalate) | 20 |
| Terminology authenticity | 15 |
| Expandability (scenario-ready) | 15 |
| **Total** | **100** |

### Thresholds

| Score | Action |
|-------|--------|
| 90-100 | Accept as "Perfect" |
| 75-89 | Accept, flag for optional enhancement |
| 60-74 | Acceptable baseline, recommend rewrite |
| < 60 | Reject and regenerate |

---

## Rewrite Trigger Logic

```
IF gate_fail == true:
    rewrite_with_higher_specificity()

ELSE IF score < 75:
    rewrite_targeting:
        - add role nouns
        - add environment condition
        - add decision threshold

ELSE:
    accept_output()
```

---

## BAD → ACCEPTABLE → PERFECT Examples

### Example Topic: 1.3 Identify risks and implement controls

#### BAD (Reject - Score: 0/100)

```
- Identify potential fall hazards in the workplace.
- Implement appropriate control measures to ensure safety.
```

**Why it fails:**
- Office-safe (B1 fail)
- No physical objects (B2 fail)
- No role signal (B4 fail)
- No environment anchor
- No decision threshold

**Checklist:** A3 fail, B1 fail, B2 fail, B4 fail

---

#### ACCEPTABLE (Minimum Pass - Score: ~65/100)

```
- Inspect the work area for fall hazards such as unprotected edges.
- Implement control measures such as guardrails or fall arrest systems.
```

**Why it passes:**
- Observable actions
- Physical objects present
- Height-related content

**Why it's not great:**
- Still applies to roofers, EWPs, telecoms
- No WA / scaffold signal
- No decision threshold

**Checklist:** Gates A & B pass, Context binding weak

---

#### PERFECT (Gold Standard - Score: 95-100/100)

```
- Inspect scaffold decks, open bays, guardrails, and access points to identify fall and dropped-object hazards.
- Identify environmental conditions common to WA worksites, including high winds, heat exposure, or unstable ground.
- Implement controls such as exclusion zones below the scaffold, temporary edge protection, or stopping work when conditions become unsafe.
```

**Why it's perfect:**
- Impossible to apply to office work
- Scaffold-only nouns
- WA-specific environment
- Includes a stop-work decision
- Still topic-level (not procedural)

**Checklist:** All A, B, C, D checks pass

---

## Gold Standard Examples - Element 1 (RIIWHS204E)

**Context:** Scaffold Worker | Construction & Mining Construction | Western Australia

### 1.1 Obtain, interpret and confirm work requirements

```
- Obtain the site work permit and scaffold-specific work instructions for erection, alteration, or dismantling tasks at height.
- Review the work order to identify scaffold height, load rating, work sequence, and exclusion zone requirements.
- Confirm task scope, access points, and handover requirements with the scaffolding supervisor or leading hand before starting work.
```

**Why perfect:** Role-bound (scaffold erection/dismantling), observable (permits, work orders), mining/construction-safe (leading hand, exclusion zone), still topic-level

---

### 1.2 Access, interpret and apply documentation

```
- Access the scaffold SWMS, JSA, and permit conditions relevant to the specific height, structure, and work area.
- Interpret documentation to identify fall risks, dropped-object hazards, load limits, and required control measures.
- Apply documented controls, including edge protection, tie-ins, and sequencing requirements, throughout scaffold work.
```

**Why perfect:** Documents named (not abstract), hazards scaffold-real (dropped objects, load limits), controls scaffold-specific (tie-ins, sequencing)

---

### 1.3 Identify and address potential risks

```
- Inspect scaffold decks, open bays, guardrails, and access points to identify fall and dropped-object hazards.
- Identify environmental conditions common to WA worksites, including high winds, heat exposure, or unstable ground.
- Implement controls such as exclusion zones below the scaffold, temporary edge protection, or stopping work when conditions become unsafe.
```

**Why perfect:** Impossible for office work, environmentally realistic for WA, includes decision threshold (stop work), still high-level topic

---

### 1.4 Inspect worksite for layout and conditions

```
- Inspect ground conditions and foundations to confirm suitability for scaffold base plates, sole boards, or castors.
- Assess the structure being scaffolded to identify tie-in points, access limitations, and interference from plant or services.
- Determine scaffold components, access systems, and fall-arrest equipment required for the planned configuration.
```

**Why perfect:** Component-level specificity without procedural overload, reflects real scaffold planning logic

---

### 1.5 Adhere to legislative requirements

```
- Follow current workplace health and safety requirements and site rules relating to scaffold work at heights.
- Apply site-specific procedures and permit conditions when erecting, modifying, or dismantling scaffolding.
- Report unsafe scaffold conditions or non-compliant work practices to the supervisor immediately.
```

**Why perfect:** Avoids naming Acts (legislation-safe), replaces "review legislation" with real worker behaviour, keeps compliance practical

---

### 1.6 Select plant, tools and equipment

```
- Select scaffold components, access equipment, and tools suitable for the required height, load class, and site conditions.
- Inspect scaffold frames, planks, couplers, pins, and fall-arrest equipment for damage or defects before use.
- Tag out and report damaged or non-compliant scaffold components to the supervisor.
```

**Why perfect:** Component-level language proves role usage, clear inspection → action → reporting chain, works across construction and mining sites

---

### 1.7 Select and wear PPE

```
- Wear mandatory PPE including hard hat with chin strap, high-visibility clothing, gloves, and steel-capped footwear.
- Fit and use a compliant full-body harness and lanyard when required during scaffold erection or dismantling.
- Check PPE for serviceability and correct fit before accessing the scaffold.
```

**Why perfect:** Mentions chin strap (very WA/mining-specific signal), ties PPE use directly to scaffold tasks, remains short and assessable

---

### 1.8 Emergency procedures

```
- Review site emergency procedures and rescue plans relevant to scaffold work at height.
- Identify emergency access routes, rescue equipment, and first aid locations near the scaffold.
- Be prepared to respond to incidents such as a suspended worker, fall, or heat-related illness.
```

**Why perfect:** Introduces suspended worker rescue (critical scaffold reality), reflects WA heat risk, focuses on preparedness

---

## Core Principle

> **Generic is not a style problem. It is a missing-signal problem.**

Perfect outputs:
- **Prove context through nouns** (scaffold, planks, couplers, tie-ins)
- **Prove realism through decisions** (stop work, tag out, escalate)
- **Prove compliance through observable actions** (inspect, report, document)

> A "perfect topic" proves context through nouns and decisions, not explanations.
