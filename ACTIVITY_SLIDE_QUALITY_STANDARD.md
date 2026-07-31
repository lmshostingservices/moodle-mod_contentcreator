# Activity Slide Quality Standard v7.1.8

## Overview
This document defines the quality standards for all 6 activity types in the AI Content Creator player. All activities must meet these standards for consistency, accessibility, and user experience.

---

## UNIVERSAL REQUIREMENTS (All Activity Types)

### 1. HEADER STRUCTURE
| Element | Requirement | Icon Size | Status |
|---------|-------------|-----------|--------|
| Activity Badge | Layer badge with icon + label | 24x24px | REQUIRED |
| Progress Indicator | "X / Y" format when multiple items | - | REQUIRED (if >1 item) |
| Activity Title | h3 with cc5-activity-title class | - | REQUIRED (if activity.title exists) |

**Badge Classes:**
- Decision activities: `cc5-badge-activity` (blue)
- Warning/analysis: `cc5-badge-warning` (amber)
- Reflection: `cc5-badge-reflection` (purple)

### 2. INSTRUCTION TEXT
| Element | Requirement | Icon Size | Status |
|---------|-------------|-----------|--------|
| Context/Introduction | Scene-setting text with icon | 24x24px | REQUIRED |
| Think-First Prompt | Cognitive pause before reveal | 24x24px | RECOMMENDED |
| Completion Instruction | "Complete X to unlock next slide" | 20x20px | REQUIRED |

**Instruction Pattern:**
```html
<div class="cc5-activity-instruction" data-total="X">
  <svg>info-circle icon</svg>
  <span>Complete all X to unlock the next slide</span>
</div>
```

### 3. FEEDBACK SYSTEM
| Element | Requirement | Status |
|---------|-------------|--------|
| Immediate Feedback | Show on each interaction | REQUIRED |
| Feedback Icon | Checkmark (correct) / X (incorrect) | REQUIRED |
| Explanation Text | Context-specific explanation | REQUIRED |
| Feedback Sound | success.mp3 / incorrect.mp3 | REQUIRED |

**Sound Files:**
- Correct answer: `playCorrectSound()` 
- Incorrect answer: `playIncorrectSound()`
- Perfect score: `playConfetti()` with confetti animation

### 4. SCORE SUMMARY
| Element | Requirement | Icon Size | Status |
|---------|-------------|-----------|--------|
| Score Container | Hidden until complete | - | REQUIRED |
| Score Icon | Trophy/checkmark | 24-28px | REQUIRED |
| Score Label | "Your Score" or equivalent | - | REQUIRED |
| Score Value | "X / Y correct" format | - | REQUIRED |
| Try Again Button | Reset activity | 20x20px icon | REQUIRED |

**Score Pattern:**
```html
<div class="cc5-*-score cc5-hidden" data-total="X">
  <div class="cc5-score-icon"><svg>trophy</svg></div>
  <div class="cc5-score-text">
    <span class="cc5-score-label">Your Score</span>
    <span class="cc5-score-value">X / Y correct</span>
  </div>
  <button class="cc5-try-again-btn">Try Again</button>
</div>
```

### 5. LEARNING TAKEAWAY
| Element | Requirement | Icon Size | Status |
|---------|-------------|-----------|--------|
| Takeaway Container | Shown after completion | - | REQUIRED |
| Star Icon | Filled star | 24x24px | REQUIRED |
| Takeaway Text | Key learning point | - | REQUIRED |

### 6. ICON STANDARDS
| Context | Size | Stroke Width | Fill |
|---------|------|--------------|------|
| Header Badge Icon | 24x24px | 2px | none (outline) |
| Context/Intro Icon | 24x24px | 2px | none (outline) |
| Instruction Icon | 20x20px | 2px | none (outline) |
| Button Icons | 20-24px | 2px | none (outline) |
| Score Icon | 24-28px | 2px | none (outline) |
| Takeaway Star | 24x24px | 1px | currentColor (filled) |

### 7. MOBILE REQUIREMENTS (WCAG 2.2 AA)
| Element | Minimum Size | Spacing |
|---------|--------------|---------|
| Touch Targets | 48x48px min | 8px gap |
| Button Height | 48px min | - |
| Font Size | 16px min | - |
| Tap Spacing | 8px min between targets | - |

### 8. ACCESSIBILITY
| Requirement | Implementation |
|-------------|----------------|
| Keyboard Navigation | tabindex="0" on interactive elements |
| ARIA Labels | aria-label on buttons without visible text |
| Focus Indicators | Visible focus ring (cc5-focus-ring class) |
| Screen Reader | Meaningful button/label text |

---

## ACTIVITY-SPECIFIC REQUIREMENTS

### 1. SCENARIO BRANCHING DECISION (FLAGSHIP)

**Purpose:** Multi-step decision-making with branching consequences

| Component | Requirement | Status |
|-----------|-------------|--------|
| Activity Badge | Pie chart icon + "Decision Activity" | REQUIRED |
| Progress Indicator | "1 / X" format | REQUIRED |
| Scenario Intro | File-text icon + immersive scenario text | REQUIRED |
| Decision Points | Sequential reveal (one at a time) | REQUIRED |
| Point Header | Step number badge + situation text | REQUIRED |
| Options | 3-4 options with consequences | REQUIRED |
| Option Feedback | Icon (check/x) + explanation | REQUIRED |
| Outcome Section | Result of chosen path | REQUIRED |
| Learning Takeaway | Star icon + key learning | REQUIRED |

**Completion Criteria:** All decision points answered

---

### 2. BEST RESPONSE ANALYSIS

**Purpose:** Classify responses as Best Practice / Acceptable / Inappropriate

| Component | Requirement | Status |
|-----------|-------------|--------|
| Activity Badge | Shield-check icon + "Response Analysis" | REQUIRED |
| Classification Legend | 3-item legend (best/acceptable/inappropriate) | REQUIRED |
| Response Items | 5 responses to classify | REQUIRED |
| Reveal Button | "Show Classification" button per response | REQUIRED |
| Classification Badge | Color-coded badge on reveal | REQUIRED |
| Explanation | Why this classification | REQUIRED |
| Score Summary | "All revealed" when complete | REQUIRED |
| Learning Takeaway | Star icon + key learning | REQUIRED |

**Classification Colors:**
- Best Practice: Green (`cc5-class-best`)
- Acceptable: Blue (`cc5-class-acceptable`)  
- Not Appropriate: Red (`cc5-class-inappropriate`)

**Completion Criteria:** All 5 responses revealed

---

### 3. WHAT WENT WRONG CASE ANALYSIS

**Purpose:** Analyze incident to identify errors, correct approach, prevention

| Component | Requirement | Status |
|-----------|-------------|--------|
| Activity Badge | Warning triangle icon + "Case Analysis" | REQUIRED |
| Progress Indicator | "0 / X answered" format | REQUIRED |
| Case Description | Incident report styling with warning icon | REQUIRED |
| Think First Prompt | Question-mark icon + "Think, then compare" | REQUIRED |
| Analysis Questions | 3 questions with reveal buttons | REQUIRED |
| Question Icons | Question/Warning/Lightbulb (by position) | REQUIRED |
| Answer Reveal | Click to show answer | REQUIRED |
| Score Summary | Trophy + correct count | REQUIRED |
| Learning Takeaway | Star icon + key learning | REQUIRED |

**Question Type Icons:**
1. What went wrong? - Question circle
2. What errors occurred? - Warning triangle  
3. How to prevent? - Lightbulb

**Completion Criteria:** All 3 questions answered

---

### 4. TASK/PROCESS SEQUENCING

**Purpose:** Arrange procedural steps in correct order

| Component | Requirement | Status |
|-----------|-------------|--------|
| Activity Badge | List icon + "Process Sequencing" | REQUIRED |
| Context | Task context description | REQUIRED |
| Instruction | "Arrange steps in correct order" | REQUIRED |
| Steps | Scrambled list of 6-8 steps | REQUIRED |
| Drag Handle | 6-dot grip icon (desktop) | REQUIRED |
| Up/Down Arrows | Chevron icons (mobile) | REQUIRED |
| Position Number | Current position indicator | REQUIRED |
| Check Order Button | Verify sequence | REQUIRED |
| Step Feedback | Green/red border on check | REQUIRED |
| Score Summary | Trophy + correct positions | REQUIRED |
| Key Principle | Boundary principle text | OPTIONAL |

**Step Type Classes:**
- `cc5-step-prepare` - Preparation steps
- `cc5-step-action` - Action steps
- `cc5-step-verify` - Verification steps
- `cc5-step-complete` - Completion steps

**Completion Criteria:** Check order clicked + perfect score (or Try Again available)

---

### 5. ESCALATION DECISION (HCED)

**Purpose:** Handle / Clarify / Escalate / Document decisions

| Component | Requirement | Status |
|-----------|-------------|--------|
| Activity Badge | Users icon + "Escalation Decisions" | REQUIRED |
| Progress Indicator | "0 / X" format | REQUIRED |
| Instruction | Context with info icon | REQUIRED |
| Decision Legend | 4 options with descriptions | REQUIRED |
| Situations | 4-5 workplace situations | REQUIRED |
| Situation Number | Badge with number | REQUIRED |
| Decision Buttons | 4 HCED buttons with icons | REQUIRED |
| Button Feedback | Correct (green) / Incorrect (red) | REQUIRED |
| Explanation | Why this decision | REQUIRED |
| Score Summary | Trophy + correct count | REQUIRED |
| Boundary Principle | Key icon + principle text | OPTIONAL |

**Decision Button Icons (24x24px):**
- Handle: Checkmark icon (green)
- Clarify: Question-circle icon (blue)
- Escalate: Arrow-up icon (red)
- Document: File-text icon (gray)

**Completion Criteria:** All situations answered

---

### 6. MICRO-REFLECTION

**Purpose:** Structured workplace application prompts

| Component | Requirement | Status |
|-----------|-------------|--------|
| Activity Badge | Message-square icon + "Reflection" | REQUIRED |
| Progress Indicator | "0 / X complete" format | REQUIRED |
| Reflection Intro | Sparkles icon + mindfulness prompt | REQUIRED |
| Prompts | 3 reflection questions | REQUIRED |
| Focus Area Icons | Icon per focus (personal/professional/team/safety) | REQUIRED |
| Text Input | Textarea with min 10 word requirement | REQUIRED |
| Word Count | "X / 10 words minimum" indicator | REQUIRED |
| Completion Badge | Checkmark when >= 10 words | REQUIRED |
| Score Summary | All prompts completed indicator | REQUIRED |

**Focus Area Icons (24x24px):**
- Personal: User icon
- Professional: Briefcase icon
- Application: Check-circle icon
- Team: Users icon
- Safety: Shield icon
- General: Info icon

**Completion Criteria:** All 3 prompts have >= 10 words each

---

## AUDIT CHECKLIST

For each activity type, verify:

### Structure
- [ ] Activity badge with correct icon and label
- [ ] Progress indicator (if multiple items)
- [ ] Title (if provided)
- [ ] Context/introduction with icon
- [ ] Think-first prompt (where applicable)
- [ ] Completion instruction with info icon

### Interactivity  
- [ ] All interactive elements have click handlers
- [ ] Immediate visual feedback on interaction
- [ ] Sound feedback (correct/incorrect)
- [ ] Disabled state when complete

### Completion
- [ ] Score summary hidden until complete
- [ ] Score icon (trophy/checkmark)
- [ ] Score value in "X / Y" format
- [ ] Try Again button with refresh icon
- [ ] Learning takeaway with star icon

### Icons
- [ ] All icons are 24x24px (except instruction at 20x20px)
- [ ] All icons use stroke="currentColor" (outline style)
- [ ] All icons have stroke-width="2"
- [ ] No filled icons except star (takeaway)

### Mobile
- [ ] All buttons >= 48px touch target
- [ ] Minimum 8px spacing between targets
- [ ] 16px minimum font size
- [ ] Responsive layout at 640px breakpoint

### Accessibility
- [ ] tabindex="0" on interactive elements
- [ ] aria-label on icon-only buttons
- [ ] Visible focus indicators
- [ ] Color not sole indicator of state

---

## VERSION HISTORY

| Version | Date | Changes |
|---------|------|---------|
| v7.1.8 | Jan 12, 2026 | Initial quality standard document |
