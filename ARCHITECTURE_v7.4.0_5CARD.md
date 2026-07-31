# AI Content Creator v7.4.0 Architecture Plan
## Best-Practice 5-Card Microlearning System

**Version:** 7.4.0
**Date:** January 2026
**Status:** COMPLETE

---

## Executive Summary

v7.4.0 implements a research-backed 5-card microlearning architecture where each topic generates exactly 5 cards in a fixed pedagogical sequence. This replaces the variable-length slide generation with a consistent, predictable learning experience.

---

## 1. Card Sequence Architecture

### Fixed 5-Card Order (per topic)

| # | Card Type | Purpose | Contrast Type | Voiceover Length |
|---|-----------|---------|---------------|------------------|
| 1 | **knowledge** | What it is + why it matters | safe-unsafe | 60-80 words |
| 2 | **scenario** | Realistic workplace context | decision-point | 80-100 words |
| 3 | **decision** | MCQ-single with 4 options | mcq-single | 40-60 words |
| 4 | **feedback** | Consequences of choices | safe-unsafe | 60-80 words |
| 5 | **quick-check** | Pre-task checklist + reflection | checklist | 50-70 words |

### Pedagogical Foundation

This sequence implements evidence-based microlearning principles:

1. **knowledge** - Cognitive load theory: introduce concepts before application
2. **scenario** - Situated learning: ground in realistic workplace context
3. **decision** - Active learning: force choice to consolidate understanding
4. **feedback** - Error-based learning: show consequences of wrong choices
5. **quick-check** - Transfer support: ready-to-use workplace checklist

---

## 2. File Architecture

### Core Files

| File | Purpose | Key Functions |
|------|---------|---------------|
| `prompts.js` | Schema + prompts | `FIVE_CARD_SCHEMA`, `FIVE_CARD_SYSTEM_PROMPT`, `buildFiveCardUserPrompt()`, `validateFiveCardSequence()`, `buildRepairUserPrompt()` |
| `generator.js` | AI orchestration | `generateFiveCardSequence()`, `getFailedFiveCardSequence()`, `callAI()`, `parseJsonResponse()` |
| `builder.js` | UI wizard | `renderStep2VET()`, `updateGenerateTopicsButton()`, Reference Docs upload |
| `player5.js` | Card player | `renderCard()`, `buildFullVoiceoverText()`, Edit Slide modal, 52-language support |

### Data Flow

```
User Input (wizard)
       ↓
builder.js (collects context)
       ↓
generator.js → callAI() → ajax.php → Gemini API
       ↓
prompts.js (FIVE_CARD_SYSTEM_PROMPT + buildFiveCardUserPrompt)
       ↓
validateFiveCardSequence() → auto-repair if needed
       ↓
player5.js (renders 5 cards inline on one slide)
```

---

## 3. JSON Schema

### Card Schema (per card)

```json
{
  "cardType": "knowledge|scenario|decision|feedback|quick-check",
  "contrastType": "safe-unsafe|decision-point|mcq-single|checklist",
  "description": "40-80 word explanation",
  "voiceoverText": "40-100 word spoken narration",
  "keyFacts": ["Fact 1", "Fact 2", "Fact 3", "Fact 4", "Fact 5"],
  "requirements": ["Req 1", "Req 2", "Req 3", "Req 4", "Req 5"],
  "positiveList": ["Do 1", "Do 2", "Do 3", "Do 4", "Do 5"],
  "negativeList": ["Don't 1", "Don't 2", "Don't 3", "Don't 4", "Don't 5"],
  "terminology": [
    { "term": "Term 1", "definition": "Definition" }
  ]
}
```

### Decision Card (special fields)

```json
{
  "cardType": "decision",
  "contrastType": "mcq-single",
  "question": "What should you do next?",
  "options": [
    { "option": "A", "text": "Believable wrong answer", "isCorrect": false },
    { "option": "B", "text": "Correct answer", "isCorrect": true },
    { "option": "C", "text": "Another wrong answer", "isCorrect": false },
    { "option": "D", "text": "Third wrong answer", "isCorrect": false }
  ]
}
```

### Quick-Check Card (special fields)

```json
{
  "cardType": "quick-check",
  "contrastType": "checklist",
  "reflection": {
    "question": "What is one thing you would stop work for?",
    "sampleAnswers": ["Answer 1", "Answer 2", "Answer 3", "Answer 4"]
  }
}
```

---

## 4. Validation Rules

### Strict Schema Validation (`validateFiveCardSequence`)

| Rule | Check |
|------|-------|
| Array check | Output must be an array |
| Length | Exactly 5 cards |
| Order | Cards in sequence: knowledge → scenario → decision → feedback → quick-check |
| Card types | Each card has valid `cardType` and `contrastType` |
| Decision MCQ | Exactly 4 options (A-D), exactly 1 correct |
| Non-empty | All required string fields are non-empty |

### Auto-Repair System

When validation fails:
1. Log validation errors
2. Call AI with `REPAIR_JSON_PROMPT` + `buildRepairUserPrompt()`
3. Re-validate repaired output
4. If still fails → return placeholder cards with error message

---

## 5. Voiceover System

### Per-Card Voiceover Text

Each card includes `voiceoverText` for Chirp 3 HD narration:

| Card | Voiceover Start | Length |
|------|-----------------|--------|
| knowledge | "In this section, you will learn about..." | 60-80 words |
| scenario | Second person (you) situation description | 80-100 words |
| decision | "Now it is time to test your understanding..." | 40-60 words |
| feedback | "The correct answer is..." + consequences | 60-80 words |
| quick-check | "Before you start this task in your workplace..." | 50-70 words |

### 52-Language Support

Voiceover generation supports all Chirp 3 HD languages including:
English, Japanese, Chinese, Korean, Vietnamese, Thai, Indonesian, German, French, Spanish, Portuguese, Arabic, Dutch, Danish, Finnish, Norwegian, Swedish, Italian, Greek, Punjabi, Polish, Russian, Turkish, Hebrew, Czech, Hungarian, Icelandic, Romanian, Bulgarian

---

## 6. Route System

### Two Routes Only (v7.4.0)

| Route | Target | Features |
|-------|--------|----------|
| **Vocational/Workplace** | Australian VET RTOs | TGA API, unit codes, Reference Docs, industry sectors |
| **University/Higher Ed** | Universities | Learning outcomes, course structure, academic focus |

### Legacy Mode Handling

```javascript
// 'workplace' mode now redirects to VET
if (selectedMode === 'vet' || selectedMode === 'workplace') {
  renderStep2VET();
}
```

---

## 7. Knowledge Pack Integration

### PDF → Structured JSON

Reference Documents are extracted into Knowledge Packs:

```javascript
knowledgePacks = [
  {
    source: "WHS Code of Practice 2024.pdf",
    topics: ["hazard identification", "risk control"],
    facts: [
      "Employers must consult workers on WHS matters",
      "Controls follow hierarchy: elimination → substitution → engineering"
    ]
  }
]
```

### Injection into AI Prompt

```
KNOWLEDGE PACKS (source of truth - use for accuracy):
<<<
[Knowledge Pack JSON]
>>>
```

---

## 8. Error Handling

### Failed Generation

When AI call fails:
1. `getFailedFiveCardSequence()` returns 5 placeholder cards
2. Each placeholder has `failed: true` and `failureReason`
3. UI shows "Regenerate Failed" button

### JSON Parse Errors

1. Attempt cleanup (remove markdown fences)
2. If still fails → trigger repair prompt
3. If repair fails → return error cards

---

## 9. Quality Rules (enforced in prompt)

### Content Quality

- Scenarios must feel realistic for learner role/industry
- Include time pressure or workplace complication
- Wrong MCQ options must be believable mistakes (not obviously wrong)
- Feedback must explain what goes wrong if wrong choice made
- Quick-check must be usable as rapid pre-task verification

### Text Quality

- Each bullet under 14 words
- Australian English spelling
- No asterisks for emphasis
- No PDF/document name mentions
- Practical workplace language (not academic)

---

## 10. Testing Checklist

### Unit Tests

- [ ] `validateFiveCardSequence()` correctly rejects invalid arrays
- [ ] `validateFiveCardSequence()` accepts valid 5-card array
- [ ] Decision card validation checks exactly 4 options
- [ ] Decision card validation checks exactly 1 correct
- [ ] Repair prompt handles malformed JSON

### Integration Tests

- [ ] VET route renders Reference Docs upload
- [ ] Edit Slide modal opens and saves changes
- [ ] Voiceover regeneration costs 10 credits
- [ ] Legacy 'workplace' mode routes to VET
- [ ] 5-card sequence renders on one slide

---

## 11. Version History

| Version | Date | Changes |
|---------|------|---------|
| 7.4.0 | Jan 2026 | 5-card architecture, voiceover per card, route merge |
| 7.3.x | Jan 2026 | Knowledge Pack integration, PDF extraction |
| 7.2.x | Dec 2025 | 4-layer model, document pre-generation |
| 7.1.x | Dec 2025 | Keypoint doctrine, quality audit |
| 7.0.x | Dec 2025 | 4-layer architecture rebuild |

---

## Audit Status: COMPLETE

All core components implemented and validated:

- [x] FIVE_CARD_SCHEMA defined
- [x] FIVE_CARD_SYSTEM_PROMPT with voiceover guidance
- [x] buildFiveCardUserPrompt() with Knowledge Pack injection
- [x] validateFiveCardSequence() with strict schema validation
- [x] buildRepairUserPrompt() for auto-repair
- [x] generateFiveCardSequence() orchestration
- [x] getFailedFiveCardSequence() error handling
- [x] Legacy 'workplace' mode → VET redirect
- [x] Reference Documents upload in VET route
- [x] Edit Slide modal in player5.js
- [x] 52-language voiceover support

**No blocking errors detected.**
