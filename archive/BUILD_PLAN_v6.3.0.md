# AI Content Creator v6.3.0 - Complete Build Plan

## Overview
This plan details the complete end-to-end implementation of configurable settings for the AI Content Creator Moodle plugin, ensuring all user choices in the builder wizard flow through to the manifest and control player behavior.

---

## Phase 1: Builder UI (Step 3 - Settings Configuration)

### 1.1 Progression Mode Selector
Add a card-based radio selector with three mutually exclusive options:
- **Free Navigation**: Learners can click next/previous at any time with no restrictions
- **Timed Reading**: Learners must wait a configurable number of seconds per slide before the Next button enables
- **Must Listen to Voiceover**: Learners must play the voiceover audio before the Next button enables

When "Timed Reading" is selected, reveal a conditional dropdown allowing the course creator to choose the minimum reading time per slide (5, 10, 15, 20, or 30 seconds). Default to 10 seconds.

### 1.2 Voice Settings Section
Add a new form section titled "Voiceover Settings" with two controls:

**Voice Gender Selector**: Two card-style radio buttons allowing selection between Male and Female voice. Default to Female. Each card displays a person icon and label, with visual selection state (border color change, background tint).

**Voiceover Language Dropdown**: A standard select dropdown containing 52 languages supported by Google's Chirp 3 HD text-to-speech engine. Default to "English (Australia)" since this is an Australian RTO-focused product. Include all major world languages with proper locale codes (en-AU, en-GB, en-US, fr-FR, de-DE, ja-JP, cmn-CN, etc.).

### 1.3 Event Listeners
Wire up click handlers so that:
- Clicking a progression mode card updates the selected state and shows/hides the timed duration dropdown
- Clicking a voice gender card updates the selected state visually
- All form inputs are accessible via standard DOM queries for value extraction

---

## Phase 2: Data Collection (generateContent Function)

### 2.1 Gather All Settings
When the user clicks "Generate Content", the builder's generateContent function must:

1. Query the selected progression mode radio button and extract its value ('free', 'timed', or 'voiceover')
2. If timed mode, parse the slide duration dropdown as an integer
3. Query the selected voice gender radio button ('male' or 'female')
4. Query the voice language dropdown for the selected locale code

### 2.2 Structure the Inputs Object
Bundle these values into the inputs object that gets passed to the manifest builder:
```javascript
inputs = {
  mode: 'vet' | 'university' | 'workplace',
  context: { ... },
  topicPlan: { ... },
  settings: {
    progressionMode: 'free' | 'timed' | 'voiceover',
    slideDuration: 5-30 (integer)
  },
  voiceSettings: {
    gender: 'male' | 'female',
    language: 'en-AU' | 'en-GB' | ... (locale code)
  }
}
```

---

## Phase 3: Manifest Generation (manifest.builder.js)

### 3.1 Include Settings in Manifest
The manifest builder receives the inputs object and must copy both settings objects into the final manifest JSON:

```javascript
manifest = {
  version: '6.3.0',
  topics: [...],
  settings: inputs.settings || { progressionMode: 'free', slideDuration: 10 },
  voiceSettings: inputs.voiceSettings || { gender: 'female', language: 'en-AU' }
}
```

This manifest gets saved to Moodle and loaded by the player when learners view the content.

---

## Phase 4: Player Behavior (player5.js)

### 4.1 Read Settings on Initialization
When the player loads, it must read the manifest and extract:
- `manifest.settings.progressionMode` to determine navigation rules
- `manifest.settings.slideDuration` for timed mode countdown
- `manifest.voiceSettings.gender` for TTS API calls
- `manifest.voiceSettings.language` for TTS API calls

### 4.2 Apply Progression Mode Logic

**Free Navigation Mode:**
- Next/Previous buttons always enabled
- No timers or audio requirements

**Timed Reading Mode:**
- Start a countdown timer when each slide renders
- Display remaining seconds in the header
- Disable Next button until timer reaches zero
- Re-enable Next button when countdown completes

**Must Listen to Voiceover Mode:**
- Disable Next button when slide renders
- Display "Listen to continue" hint
- Track when voiceover audio completes (onended event)
- Enable Next button and hide hint after audio finishes
- Remember completion state so users can navigate back freely

### 4.3 Apply Voice Settings to TTS
When calling the text-to-speech API endpoint:
- Pass `manifest.voiceSettings.language` as the language parameter
- Pass `manifest.voiceSettings.gender` as the gender parameter
- These values flow through to Google Cloud TTS (Chirp 3 HD) for audio generation

---

## Phase 5: CSS Styling

### 5.1 Voice Settings Grid
Create a two-column responsive grid for the voice settings section. On mobile (under 768px), stack into a single column.

### 5.2 Gender Card Styling
Style the gender selector cards with:
- Consistent padding and border radius
- Hover state with subtle border/background change
- Selected state with primary color border and muted primary background
- Hidden radio inputs (opacity 0) with visual card as the click target
- Icon and label centered horizontally

### 5.3 Dark Mode Support
Add dark theme variants for all new components using the existing dark mode selector pattern (`.dark`, `.theme-dark`, `body.dark`, `[data-theme="dark"]`).

---

## Phase 6: Testing Checklist

1. **Builder UI**: Confirm all form elements render correctly in Step 3
2. **Selection States**: Verify clicking cards updates visual selection
3. **Conditional Display**: Confirm timed duration dropdown only shows when "Timed Reading" selected
4. **Data Extraction**: Log the inputs object before manifest generation to verify all values captured
5. **Manifest Output**: Inspect the saved manifest JSON to confirm settings and voiceSettings present
6. **Player Free Mode**: Navigate slides freely with no restrictions
7. **Player Timed Mode**: Verify countdown timer and button disable/enable
8. **Player Voiceover Mode**: Verify audio completion enables navigation
9. **Voice Gender**: Generate voiceover and confirm correct voice gender plays
10. **Voice Language**: Generate voiceover in different language and confirm audio language

---

## Phase 7: Minification & Deployment

After all changes complete:
1. Run terser on builder.js → builder.min.js
2. Run terser on manifest.builder.js → manifest.builder.min.js
3. Run terser on player5.js → player5.min.js
4. Update version.php to v6.3.0 (2025010300)
5. Update pluginConfig.ts changelog with all new features
6. Restart development server
7. Test full flow in browser
8. Publish when ready

---

## End-to-End Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           BUILDER (Step 3)                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  Progression Mode         │  Voice Settings                                  │
│  ┌───────┐ ┌───────┐ ┌───────┐  │  ┌──────────┐ ┌──────────┐               │
│  │ Free  │ │ Timed │ │Listen │  │  │  Female  │ │   Male   │               │
│  └───────┘ └───────┘ └───────┘  │  └──────────┘ └──────────┘               │
│       ↓                         │        ↓                                   │
│  [Duration: 10s]                │  [Language: en-AU ▼]                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        generateContent()                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  inputs = {                                                                  │
│    settings: { progressionMode: 'free', slideDuration: 10 },                │
│    voiceSettings: { gender: 'female', language: 'en-AU' }                   │
│  }                                                                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        manifest.builder.js                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  manifest = {                                                                │
│    version: '6.3.0',                                                         │
│    topics: [...],                                                            │
│    settings: { progressionMode: 'free', slideDuration: 10 },                │
│    voiceSettings: { gender: 'female', language: 'en-AU' }                   │
│  }                                                                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ (Saved to Moodle DB)
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PLAYER (player5.js)                                │
├─────────────────────────────────────────────────────────────────────────────┤
│  this.progressionMode = manifest.settings.progressionMode                   │
│  this.slideDuration = manifest.settings.slideDuration                       │
│                                                                              │
│  TTS API Call:                                                               │
│    language: manifest.voiceSettings.language                                 │
│    gender: manifest.voiceSettings.gender                                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Status

| Setting | Builder UI | Passed to Manifest | Read by Player | Status |
|---------|-----------|-------------------|----------------|--------|
| Progression Mode | ✅ Radio cards | ✅ inputs.settings | ✅ manifest.settings | COMPLETE |
| Slide Duration | ✅ Conditional dropdown | ✅ inputs.settings | ✅ manifest.settings | COMPLETE |
| Voice Gender | ✅ Radio cards | ✅ inputs.voiceSettings | ✅ manifest.voiceSettings | COMPLETE |
| Voice Language | ✅ 52-language dropdown | ✅ inputs.voiceSettings | ✅ manifest.voiceSettings | COMPLETE |
| Activity Types | ✅ Auto-selected | ✅ section.activity | ✅ renderActivity() | COMPLETE |

---

## Phase 8: Legislation-Aware Content Engine

### 8.1 Overview
All AI-generated content now automatically embeds country-specific legislation awareness without citing legal references. This ensures compliance while keeping content learner-focused.

### 8.2 Legislation Architecture

**Country Packs (5 countries):**
- AU (Australia): WHS, APPs, EO, RTO Standards
- UK (United Kingdom): H&S, GDPR, Equality Act
- NZ (New Zealand): HSWA, Privacy Act, HRA
- CA (Canada): OHS, PIPEDA, HRC
- US (United States): OSHA, Privacy, EEO

**Australian State Overlays (8 states/territories):**
- NSW: Worker consultation emphasis
- VIC: Employer duty of care focus
- QLD: Heat stress and tropical hazards
- WA: Mining and FIFO considerations
- SA: SafeWork SA reporting
- TAS: Standard WHS application
- NT: Remote work and tropical hazards
- ACT: Public sector context

### 8.3 Module: legislation.js

**Core Functions:**
- `getPack(countryCode)` - Returns country legislation pack
- `getOverlay(countryCode, stateCode)` - Returns state overlay
- `applyOverlay(basePack, overlay)` - Merges state rules (additive)
- `getMergedPack(countryCode, stateCode)` - Full merged pack
- `buildPromptInjection(countryCode, stateCode, contentType)` - AI prompt block
- `getComplianceTags(countryCode)` - Footer abbreviations
- `renderComplianceFooter(tags)` - "Compliance: WHS • APPs • EO"

### 8.4 Integration with prompts.js

All prompts now use `buildSystemPrompt()` which:
1. Takes the base system prompt
2. Extracts country/state from context
3. Injects legislation rules via `Legislation.buildPromptInjection()`
4. Returns enhanced prompt with compliance framework

### 8.5 Design Principles

1. **Principle-based, not citation-based**: Use "promote safe work practices" not "comply with WHS Act s.19"
2. **Educational tone**: Write for learners, not lawyers
3. **Additive overlays**: State rules add to country rules, never replace
4. **Audit traceability**: Footer tags show which frameworks applied

### 8.6 Implementation Status

| Component | Status |
|-----------|--------|
| AU legislation pack | ✅ COMPLETE |
| UK legislation pack | ✅ COMPLETE |
| NZ legislation pack | ✅ COMPLETE |
| CA legislation pack | ✅ COMPLETE |
| US legislation pack | ✅ COMPLETE |
| AU state overlays (8) | ✅ COMPLETE |
| CA state overlays (ON, BC) | ✅ COMPLETE |
| US state overlays (CA, TX) | ✅ COMPLETE |
| legislation.js module | ✅ COMPLETE |
| prompts.js integration | ✅ COMPLETE |
| Compliance footer tags | ✅ COMPLETE |
| Minification | ✅ COMPLETE |

---

## Phase 9: VET Context & State Handling Fixes

### 9.1 VET Context Fix (gatherContext)

**Issue:** VET mode was missing unitCode and unitTitle in the context object, causing prompts to not receive TGA unit information.

**Solution:** Updated `gatherContext()` in builder.js to extract unitCode and unitTitle from tgaData:

```javascript
// VET mode specific context
if (mode === 'vet' && tgaData) {
    context.unitCode = tgaData.unitCode || '';
    context.unitTitle = tgaData.unitTitle || '';
}
```

### 9.2 State Name-to-Code Mapping (legislation.js)

**Issue:** State dropdowns in the builder use full names (e.g., "New South Wales") but the legislation module expected codes (e.g., "NSW").

**Solution:** Added `normalizeStateCode()` function and `STATE_NAME_TO_CODE` mapping to handle both formats:

```javascript
const STATE_NAME_TO_CODE = {
    'AU': {
        'new south wales': 'NSW',
        'victoria': 'VIC',
        'queensland': 'QLD',
        // ... all 8 AU states/territories
    },
    'CA': {
        'ontario': 'ON',
        'british columbia': 'BC',
        // ... major CA provinces
    },
    'US': {
        'california': 'CA',
        'texas': 'TX',
        // ... major US states
    }
};

const normalizeStateCode = (countryCode, stateInput) => {
    // Returns code if already valid, otherwise looks up full name
};
```

The `getOverlay()` function now uses `normalizeStateCode()` internally.

### 9.3 VET Flow Summary

Complete VET data flow:
1. User selects VET mode and uploads TGA PDF
2. TGA data extracted (unitCode, unitTitle, elements, PCs, KE, PE, FS)
3. `gatherContext()` includes unitCode/unitTitle from tgaData
4. Country/state captured from dropdowns (full names)
5. `legislation.js` normalizes state names to codes
6. Prompts receive complete context with legislation injection
7. Player renders unitCode/unitTitle in header

---

This plan ensures **complete end-to-end traceability** from every UI input through to the final learner experience, which is critical for Australian RTO audit compliance.
