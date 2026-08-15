# Changelog - AI Content Creator Activity Module

All notable changes to this plugin will be documented in this file.

## [13.64] - 2026-08-15

### Fixed
- **FIX-CC-13DIGIT-SAVEPOINT-REBASE (db/upgrade.php)**: Rebased all 193 legacy 13-digit
  upgrade gates/savepoints to 10-digit values (max 2026072801, below the declared
  plugin version). The previous upgrade.php wrote a 13-digit version (max
  2026072800232) back into `config_plugins` when a rebased 10-digit site upgraded,
  silently re-stranding the site: Moodle core skips its final version write because
  the recorded version now exceeds `$plugin->version`, and every later upgrade run
  aborts with `downgrade_exception`. No schema, PHP logic, JS or lang changes.
- Marketplace compliance: `// pipeline-ignore: PARAM_RAW` annotations added to
  pre-existing PARAM_RAW parameters (JSON/base64/prompt blobs) — comments only.

## [12.30] - 2026-04-02

### Fixed
- **BUG-VO-COMPETENCY-HEADING (cc-state.js)**: Two voiceover sub-heading bugs on the
  `competency-summary` card (card 7 in University mode; card 6 in VET/workplace/PD routes).
  - **"What Good Looks Like" not voiced**: `buildVoiceoverText` took the early-return
    path when `card.voiceoverText` was set (by AI generation or `patchMissingCardVoiceoverTexts`).
    AI-generated `voiceoverText` for this card type omits the sub-headings entirely, so
    the TTS audio jumped straight from the heading "You Are Ready When You Can…" to the
    bullet items without announcing "What good looks like."
    **Fix**: `cc-state.js` now skips the early-return for `competency-summary` cards when
    `goodItems` or `badItems` are populated — the structured `goodItems`/`badItems` branch
    always runs, voicing "What good looks like." before the positive items.
  - **"Watch out for" voiced instead of "What to Avoid"**: AI-generated `voiceoverText`
    for `competency-summary` uses casual phrasing like "Watch out for" as a transition
    between the two item lists. Because the early-return consumed that text verbatim, the
    wrong phrase was sent to TTS.
    **Fix**: same early-return skip — the structured branch enforces "What to avoid." as
    the canonical sub-heading for `badItems`.
- **BUG-VO-COMPETENCY-HEADING (player5.js `patchMissingCardVoiceoverTexts`)**: The bulk
  TTS pre-generation path built `card.voiceoverText` for `competency-summary` cards without
  any sub-headings, making `card.voiceoverText` inconsistent with what `buildVoiceoverText`
  now voices. Fixed by inserting "What good looks like" and "What to avoid" labels before
  their respective item lists inside `patchMissingCardVoiceoverTexts`.
- **VOICEOVER_SCHEMA_VERSION bumped `12.29`→`12.30`** (`cc-state.js`): Forces automatic
  re-generation of all stored voiceovers with wrong headings. Teachers who open any
  activity will regenerate all sections; students receive corrected audio immediately after.
- **generator.js CC_VERSION stale at `12.28`**: Corrected to `12.30` so generator-module
  console log version prefixes are accurate.

### Changed
- All three AMD trios (`cc-state.js`, `player5.js`, `generator.js`) rebuilt and
  triple-matched: `src/` = `build/` = `build/*.min.js` (MD5 verified).
- No PHP or DB schema changes. `version.php` → `2026040200230`.
- Missing `upgrade.php` savepoint for `v12.29` (2026040200229) added retroactively.

## [11.66] - 2026-03-27

### Changed
- Routine version bump. No code or DB schema changes.

## [11.65] - 2026-03-27

### Changed
- Reverted video pipeline feature — `generate_video` / `video_status` ajax.php actions
  and `video_generator` AMD module removed. No DB schema changes.

## [11.41] - 2026-03-24

### Fixed
- **BUG-CC-GEN-TOKENS**: Persistent AI content generation failures on VET courses. Root cause: v11.40 reduced `maxTokens` from 48000 to 12000 in all six `callOpenAI` calls inside the `/api/moodle/content-creator/prompt` endpoint. VET 7-card content (~1500–2000 tokens/card × 7 ≈ 11,900 tokens) regularly hit the 12,000 token cap, truncating the JSON response. `ccUnwrapCards()` failed to parse the truncated output; the server retried once at the same cap and failed again, returning `{"success":false,"error":"AI generation failed - invalid structure after retry"}`. That error string did not match the `generator.js` transient-retry regex, so the client-side exponential-backoff loop also did not retry — every VET generation attempt failed silently with zero `/prompt` hits visible in production logs.
  - **Fix 1** (`server/routes.ts`): All six `callOpenAI` `maxTokens` values raised from `12000` to `16000` — within gpt-4o's 16,384 structured-output hard cap. Covers PASS 1, PASS 1 retry, PASS 2 expansion, PASS 3 field-level rewrite, PASS 3 full-object fallback, and MICRO-EXPANSION.
  - **Fix 2** (`generator.js` CC_VERSION `11.41`): Added `"generation failed"`, `"invalid structure"`, and `"empty response"` to both `isTransient` regex patterns in `callAI()`. These errors now trigger the standard exponential-backoff retry loop (up to `MAX_RETRIES=5`) as a defence-in-depth layer for future partial-failure scenarios.
  - No DB schema changes. `version.php` → `2026032401141`.

## [11.39] - 2026-03-24

### Fixed
- **FIX-SAVE-PERMISSION**: Fixed "Failed to save generated content" error for editing teachers on Moodle sites using custom roles. Root cause: `save_manifest` and `save_manifest_chunk` external functions used `require_capability('mod/contentcreator:addinstance')` which is too strict and not granted to custom roles cloned from editingteacher. Fix: both external functions now mirror ajax.php's flexible two-step check — `mod/contentcreator:manage` first, fallback to `moodle/course:manageactivities` (held by all genuine editing teachers regardless of custom role). Also hardened both `catch` clauses to `\Throwable` to catch PHP 7+ Error types. `CC_VERSION` bumped to `'11.39'` in `cc-state.js` and `generator.js`; build files synced. No DB schema changes.

## [11.38] - 2026-03-24

### Added
- **IMAGE-DOWNLOAD**: Added a circular download button to every image in the generated image picker, the gallery modal, and the community gallery. Click the download icon (top-right of each image) to save it locally. Uses fetch-as-blob to handle cross-origin CDN images; falls back to opening in a new tab.

## [11.26] - 2026-03-22

### Fixed
- **TIMED-READING-FIX**: Fixed critical bug where the timed reading countdown timer reset on every re-render. `startSlideTimer()` unconditionally reset `slideTimeRemaining` to the full `slideDuration` each time it was called — since `render()` is invoked from 22+ places in the codebase, any re-render during a countdown would restart the timer from scratch. Added guard: if a timer interval is already running, `startSlideTimer()` now returns immediately without resetting.
- **PLAYER-SETTINGS-DURATION-CAP**: Player settings modal capped `slideDuration` at max 60 seconds (HTML input `max="60"` + save logic `if (slideDuration > 60) slideDuration = 60`), silently clamping values set via the builder wizard which supports up to 600 seconds (10 minutes). Increased both limits to 600.
- **FOCUS-DETECTION-TYPO**: `setupFocusDetection()` checked `self.currentView === 'slide'` (singular) but the actual view state is `'slides'` (plural), meaning the `visibilitychange` handler never fired even when `requireFocus` was enabled. Corrected to `'slides'`.
- **EXPORT-DP-ORDER**: PDF and TXT download exports rendered the decision-point card in its raw array position (typically Card 5) instead of last. The player already sorted cards to push decision-point to the end (v10.96 FIX-DP-ORDER), but the PDF `exportAsPdf()` and TXT `extractAllTextContent()` functions iterated `section.cards` without applying the same sort. Both now use `.slice().sort()` to place decision-point last, matching the player display order.

## [11.25] - 2026-03-22

### Fixed
- **ICON-RELEVANCE**: Icons on mistake/scene cards and Flip & Learn cards now match their content instead of showing generic sparkle/star/refresh icons. Generic AI-suggested icons (sparkles, star, shield, check-circle, info, lightbulb, zap, eye, etc.) are now ignored in favour of the 60+ keyword-matched CONTEXTUAL_ICON_MAP. Flip & Learn card fronts now show a content-matched icon above the "Tap to reveal" label. Body text (consequence/description) is now also scanned as a fallback when the title alone doesn't match. Finance/document keywords expanded (spend, expenditure, funds, allocation, invoice, pricing, revenue, profit, loss, outdated, expired, obsolete).

## [11.24] - 2026-03-22

### Fixed
- **COMMUNITY-GALLERY-FIX**: Community Gallery browse/contribute/use AJAX calls from Moodle were blocked by missing CORS headers — users saw "communityLoadFailed" error. Added `Access-Control-Allow-Origin: *` and OPTIONS preflight handler to all 4 community gallery API endpoints.

### Added
- **COMMUNITY-GALLERY-AUTO-CONTRIBUTE**: Every image generated via the player "Generate Image" button is now automatically contributed to the community gallery (selected image + unused alternatives). Previously `contributeToGallery()` was defined but never called — the gallery stayed empty.
- **COMMUNITY-GALLERY-TOPIC-SEARCH**: Added `topic` and `unit_code` columns to `community_image_gallery` table. Search now matches across 6 fields: prompt, topic, unitCode, industry, jobTitle, slideContext. Community gallery result cards now display topic and unit code tags. Search placeholder updated to "Search by topic, unit code, industry, job title...".

## [11.23] - 2026-03-22

### Changed
- **READING-TIME-EXTEND**: Timed Reading "Reading time per slide" dropdown in the builder wizard (Step 3) extended from max 30 seconds to max 10 minutes. New options: 45 seconds, 1 minute, 1.5 minutes, 2 minutes, 3 minutes, 4 minutes, 5 minutes, 7 minutes, 10 minutes. Existing manifests with slideDuration values work unchanged — the value is stored in seconds and the player timer accepts any integer.

## [11.22] - 2026-03-22

### Fixed
- **PROMPT-CARD-ORDER**: ChatGPT download prompt templates (VET, Workplace, PD, University) in `builder.js` had Decision Point as Card 5, Common Mistakes as Card 6, and Competency Summary as Card 7 — wrong order. Reordered all 4 route prompts to match the actual player display order: Card 5 = Common Mistakes, Card 6 = Competency Summary, Card 7 = Decision Point. Story continuity and coherence references throughout all 4 prompts updated to reference the correct card numbers.

## [11.21] - 2026-03-22

### Fixed
- **BOOST-HOVER-FIX**: Category Sort "Good Practice" and "Avoid" buttons had text colour overridden to white on hover by Moodle Boost theme's generic `button:hover { color: white }` rule. Explicit `color` now set on `.cc5-sort-tap-good:hover` (dark green) and `.cc5-sort-tap-bad:hover` (dark red) in player5.css, preventing the Boost override.

## [11.10] - 2026-03-21

### Added
- **COMPLETION-ALL-ACTIVITIES**: New Moodle™ completion rule — "Student must complete all activities at 100%." Teachers can enable this checkbox alongside or instead of the existing "view all slides" rule. When enabled, students must achieve a perfect score (3/3 activities passed) on every Decision Challenge embedded in the content before Moodle marks the activity as complete. Implementation: new `completionallactivities` DB column, mod_form checkbox with help text, `custom_completion.php` rule that reads the manifest to find decision-point cards and checks the progress JSON for `challengeComplete` flags, `_showChallengeComplete` JS handler writes `challengeComplete: true` into the section progress when pct === 100, `save_completion` AJAX handler triggers `COMPLETION_UNKNOWN` on every progress save so Moodle re-evaluates custom rules, upgrade.php v11.10 savepoint, backup/restore support.

## [11.06] - 2026-03-21

### Fixed
- **IMAGE2-RETRY-FIX**: 2-second delay before image2 generation call avoids back-to-back API rate limiting that silently killed second-image requests. Retry loop — image2 now attempts up to 2 calls with 3-second backoff between attempts; previously a single failure meant no scenario image. Comprehensive diagnostic logging — `ccWarn` + `pushDebugLogEntry` when `appliedCard` not found in `learningCards`, when `generateTopicImage` returns null, and when all retries exhausted (`IMAGE2_NULL_RESULT`, `IMAGE2_EXCEPTION`, `IMAGE2_NO_APPLIED_CARD`, `IMAGE2_PERMANENT_FAILURE` event types in debug log). `image2` manifest field preserved as `null` (not stripped via `|| undefined`) when images were enabled but generation failed, enabling manifest-level failure diagnosis.

## [11.05] - 2026-03-21

### Fixed
- **UNIQUE-INDEX-ATTEMPTS**: `contentcreator_attempts` table index on `(contentcreatorid, userid)` changed from non-unique to unique. Upgrade step deduplicates any existing rows (keeps newest per pair) before applying the constraint. Prevents race-condition duplicate rows from concurrent `save_completion` requests.
- **FOCUS-LOSS-CARD-TIMER**: `handleFocusLost()` now clears the 15-second card-type auto-completion timer (`slideCompletionTimer`). Previously, switching tabs during the countdown did not cancel the timer, allowing card-type slides to be marked complete without the student actually viewing them.
- **CROSS-DEVICE-COMPLETION-TRIGGER**: `loadMoodleProgress()` DB merge callback now checks `calculateOverallProgress() === 100` after merging and fires `saveMoodleProgress()` if true. Handles the edge case where progress from Device A + Device B together reach 100% but neither device alone would have triggered the Moodle completion flag.

## [11.04] - 2026-03-21

### Fixed
- **IMAGE2-GRAMMAR-FIX**: `fixManifestGrammar` in builder.js now whitelists the `image2` key alongside `image`, preventing the grammar fixer from recursing into the image2 object and corrupting its URL, prompt, and generatedAt strings.
- **EDIT-MODAL-ADD-REMOVE**: Wired 20 missing Add/Remove button click handlers for all top-level card-type editors (competence-standard, common-errors, action-breakdown, plain-english, concept-anchor, theoretical-framework, analytical-lens, ethics-considerations, case-study-1/2, business-impact, action-framework, risk-card, policy-alignment, scenario-1/2, skill-anchor, core-framework, application-guide, common-pitfalls). Buttons were rendered but non-functional since v9.87.
- **OPTION-A-ICON-FIX**: Added `hasIcon(name)` guard to cc-icons.js; cc-card-slots.js now checks icon validity before rendering in hook-scenario and applied-scenario cards, preventing broken SVG references.

## [11.03] - 2026-03-21

### Changed
- **AI-IMAGES-DEFAULT-ON**: AI images toggle now defaults to enabled when generating content, so teachers get AI-generated slide images automatically. Toggle can still be turned off manually.

## [11.02] - 2026-03-21

### Fixed
- **VOICEOVER-WIRING**: Shared voiceover module in cc-state.js — `buildVoiceoverText()`, `voiceoverTextHash()`, `VOICEOVER_SCHEMA_VERSION` now single source of truth for both builder.js and player5.js. builder.js `pregenOne` delegates to cc-state.js so pre-generated and on-demand voiceover text are byte-identical.
- **FIELD-ORDER-FIX**: `_pushLegacyCardFields` field ordering corrected — `context/turningPoint/consequence/reflection` now read before `summaryLine/standardItems/actions`, matching original player5.js order.
- **SKIP-TITLE-FIX**: Single-card title duplication fixed — `skipTitle=true` prevents section.title being announced twice in voiceover narration.
- **EM-DASH-FIX**: `normalizeContent()` in generator.js replaces U+2014 em dashes with double-hyphens to prevent encoding issues in Moodle text fields.
- **DP-VOICEOVER-SUPPRESS**: Decision-point `voiceoverText` field removed from prompts.js to prevent AI-authored narration leaking challenge answers.
- **COMPETENCY-SUMMARY-TITLE-DEDUP**: cc-card-slots.js suppresses duplicate title when card.title matches heading label. player5.js voiceover heading guard prevents double-read.

## [11.01] - 2026-03-21

### Fixed
- **CSS-SCENARIO-LEFT-ALIGN**: Scenario cards (hook-scenario + applied-scenario) text changed from text-align:center to text-align:left. Centre-aligned paragraph text looked messy with varying line lengths. Icon remains centred at top of each card.

## [11.00] - 2026-03-21

### Changed
- **DEAD-CODE-STRIP**: Removed PDF reference document upload feature (VET/Workplace/PD/University modes) — upload zone HTML, pdfDocuments/universityDocuments variables, event listener bindings, handler functions (handleReferenceDocUpload, renderReferenceDocsList, handleUniversityDocUpload, renderUniversityDocsList, extractKnowledgePack, detectDocumentType), global variables (CC_REFERENCE_DOCS_CONTENT, CC_KNOWLEDGE_PACKS), and knowledgePacks parameter from prompts.js/generator.js. ChatGPT paste-to-text path (priorityContent) remains as sole content injection.

### Added
- **LEGAL-REFERENCES**: legislation.js country packs with buildPromptInjection() wired into generator.js; legalLink field spec added to VET/Workplace/PD system prompts; legalLink renderer in cc-card-slots.js; .cc5-legal-link CSS in player5.css (light/dark/mobile).

### Fixed
- **VERSION-SYNC**: generator.js CC_VERSION corrected from stale '10.96' to '11.00'. cc-state.js build file MD5 mismatch fixed. Old ZIPs (v10.96–v10.98) cleaned from public/downloads/.

## [10.99] - 2026-03-20

### Fixed
- **FIX-LOAD-NORMALIZE**: Three-layer fix for hook-scenario/applied-scenario icon panels showing numbered circles on pre-v10.97 content.

## [10.98] - 2026-03-20

### Fixed
- **BUG3-IMAGE2-SLOT**: Gallery modal dismiss from image2 slot was reopening image1 modal instead.

## [10.97] - 2026-03-20

### Fixed
- **FIX-SCENE-PARTS-SYNTHESIS**: hook-scenario/applied-scenario cards with flat content strings now get sceneParts synthesised automatically.
- **FIX-SQA-SCHEMA-PRESERVATION**: STORY_QA_SYSTEM_PROMPT now explicitly protects sceneParts/conceptInsights arrays from being collapsed.

## [10.96] - 2026-03-20

### Fixed
- **FIX-DP-ORDER** — `renderSlideContent()` iterated `section.cards[]` with a raw `forEach` — no ordering enforcement existed. If the AI returned `decision-point` at a non-last position in the JSON array, it rendered there. Fix: `section.cards.slice().sort()` at render time so `decision-point` is always the last visual card, regardless of stored array order. Does not mutate stored data.
- **FIX-VO-DP-HEADING** — `buildFullVoiceoverText()` pushed `"Your Decision: [title]."` into `_7parts` at line 2004 **before** the `decision-point` branch check at line 2011. The comment `"_7parts stays [] → no narration"` was factually wrong — `_7parts.length === 1` caused the heading to be narrated even with no `voiceoverText`. Fix: explicitly reset `_7parts = []` in the no-`voiceoverText` branch so the heading is discarded and complete silence results. Changes confined to `player5.js`. No DB schema change.

## [10.95] - 2026-03-20

### Fixed
- **FIX-AUDIT-REPAIR-SENTENCE-COUNT** — `AUDIT_REPAIR_PROMPT` in `prompts.js` had two stale instructions for `sceneParts` sentence count: (1) `hook-scenario` said `"2-3 sentences"` — should match the v10.92 main prompts `"exactly 2 sentences"`; (2) `applied-scenario` had no sentence count at all. Both corrected to `"exactly 2 sentences"`. When the audit-repair function ran it would write 2-3 sentences for hook/applied `sceneParts` instead of exactly 2. `prompts.js` trio rebuilt MD5-identical. No DB schema change.

## [10.94] - 2026-03-20

### Fixed
- **CSS-FIX-DP-QUESTION-GAP** — Decision point question box had no visible gap above the first answer option (A). Root cause: Moodle theme CSS resets `<p>` `margin-bottom` to `0`, overriding the `.cc5-dp-question { margin: 0 0 18px 0 }` rule. Fix: removed the `margin-bottom` from `.cc5-dp-question` and added `margin-top: 18px` to `.cc5-dp-options` — this placement is not a `<p>` and is immune to Moodle's paragraph margin resets. Change confined to `player5.css`. No DB schema change.

## [10.93] - 2026-03-20

### Fixed
- **STALE-VERSION-FIX** — `generator.js` CC_VERSION was stale at `'10.91'` (two versions behind `cc-state.js` `'10.92'`). Both `cc-state.js` and `generator.js` CC_VERSION bumped to `'10.93'`. AMD trios for both files rebuilt MD5-identical across src/build/min. No code logic change. No DB schema change.

## [10.92] - 2026-03-20

### Added / Changed
- **2-SENTENCES-PER-SCENARIO-CARD** — `prompts.js` sceneParts text instruction changed from `"2-3 sentences"` to `"exactly 2 sentences"` in all three prompt variants (VET/Workplace/PD). AI now reliably writes two sentences per hook-scenario and applied-scenario panel. Edit modal `cc5-edit-sp-text` textarea rows increased 3→4 for comfortable two-sentence editing.
- **SCROLL-REVEAL-ANIMATION** — `player5.js` `initScrollReveal()` method added. Uses IntersectionObserver (Moodle-safe) to animate `.cc5-scene-part`, `.cc5-concept-insight`, `.cc5-mistake-item`, and `.cc5-summary-item` elements with a staggered 20px rise-in on each slide render. Animation class stripped on `animationend` so hover styles are unaffected. Respects `prefers-reduced-motion`. CSS `@keyframes cc5-rise-in` added in `player5.css`.

## [10.91] - 2026-03-20

### Changed
- **VERSION-BUMP** — Routine release. No code change. No DB schema change. CC_VERSION → 10.91. version.php → 2026032001091.

## [10.90] - 2026-03-20

### Changed
- **VERSION-BUMP** — Routine release. All 23 AMD JS trios verified MD5-identical across src/build/min. Zero mismatches. No code change. No DB schema change. CC_VERSION → 10.90. version.php → 2026032001090.

## [10.89] - 2026-03-20

### Fixed
- **FIX-VO-TITLE-DOUBLE-NUM** (`player5.js`) — `buildFullVoiceoverText()` was prepending a computed `"N.N: "` slide-number prefix to every slide title, but many titles already contain the number (e.g. `"1.1 Transport activities and parties"`), causing TTS to speak the number twice: *"1.1: 1.1 Transport activities and parties"*. Fix: strip any existing `^\d+\.\d+[\s:]+` prefix from `section.title` before prepending the computed one, so TTS always hears exactly one number.

## [10.88] - 2026-03-20

### Changed
- **SCENARIO-CONTEXTUAL-ICONS** (`cc-icons.js`, `cc-card-slots.js`, `player5.js`) — Scenario cards (hook-scenario and applied-scenario) now derive their per-panel icon from `getContextualSlideIcon(part.title, part.text)` based on actual content rather than the AI-supplied `part.icon`. The existing 60+ keyword/icon map (CONTEXTUAL_ICON_MAP) automatically selects e.g. a truck for weighbridge content, a warning triangle for hazard content, a clipboard for documentation content, etc. `getContextualSlideIcon` is now passed through `CcCardSlots.init()` so both scenario render functions can access it.
- **WEIGHBRIDGE-ICON** (`cc-icons.js`) — Added two new keyword rows to CONTEXTUAL_ICON_MAP in TIER 3 (Equipment): one for weighbridge/GVM/axle-load/overloaded/payload keywords and one for weight-limit/tonne/metric-ton keywords, both mapping to the `truck` icon.
- **ICON-CENTRED** (`player5.css`) — Hook-scenario and applied-scenario `.cc5-scene-part` cards gain `align-items: center` and `text-align: center` so the icon circle is horizontally centred at the top of each 2×2 grid card with text centred below it. `.cc5-scene-part-body` gets `width: 100%` so text fills the card width.

## [10.87] - 2026-03-20

### Fixed
- **DP-OPTION-PADDING** (`player5.css`) — Decision-point A/B/C/D answer option rows given more internal breathing room. Padding increased from `14px 16px` to `18px 20px` and the gap between the letter circle and option text widened from `12px` to `14px`. CSS-only change; no JS or DB changes.

## [10.86] - 2026-03-20

### Fixed
- **MENTAL-MODEL-CARD-LAYOUT-FIX** (`player5.css`) — `.cc5-player .cc5-mental-model-card` now explicitly declares `display: block`, overriding the legacy `.cc5-mental-model-card { display: flex }` rule. Previously the older rule caused the flow-badge, card title, and scene-parts steps to lay out as a flex row — squashing the "HOW TO HANDLE IT" label into a narrow left column where the text wrapped. The card is now a block container so the badge sits above the title and steps as designed.
- **FLOW-PILL-NOWRAP** (`player5.css`) — `.cc5-player .cc5-flow-pill` gets `white-space: nowrap`, ensuring "How to Handle It" (and all other card-type labels) always render on a single line regardless of card or viewport width. CSS-only changes. No JS or DB changes.

## [10.85] - 2026-03-20

### Fixed / Changed
- **IMAGE2-AUTO-GENERATE** (`generator.js`) — When image generation is enabled, the generator now automatically produces a second AI image (`section.image2`) for the applied-scenario card. Context is built from the card's `sceneParts[]` content (all 4 panels joined) for maximum relevance. On regenerate-failed-only runs where `image2` already exists, it is preserved unchanged.
- **IMAGE2-ABOVE-CARD** (`player5.js`) — `_renderImage2Container` now renders **above** the applied-scenario card in both the multi-card `section.cards[]` path and the single-card `section.cardType` path. Previously rendered below.

## [10.84] - 2026-03-20

### Changed
- **SCENARIO-GRID-LAYOUT** — `hook-scenario` and `applied-scenario` scene-parts container switched from a vertical flex column of full-width rows to a 2×2 CSS grid. Each card now uses column flex direction (icon on top, title + text below), giving 4 equal square/rectangle cards. Mobile breakpoint (max-width: 520px) collapses to single column. `mental-model` (How to Handle It) keeps its existing column layout. All `.cc5-scene-part` cards now get the standard hover shadow (`--cc5-card-shadow-hover`) + `translateY(-2px)` lift matching all other hoverable cards in the plugin. CSS-only change; no JS or AMD files touched.

## [10.82] - 2026-03-20

### Changed
- **VERSION-BUMP** — Routine release following new 13-step release checklist. All AMD trios CP'd from src and MD5-verified identical (cc-state, generator). No code changes. CC_VERSION → 10.82. version.php → 2026032001082.

## [10.81] - 2026-03-20

### Changed
- **VERSION-OVERRIDE** — Repository source diverged from deployed Moodle plugin; deployed build was at v10.80 while source was at v10.70. Bumped to v10.81 to allow Moodle to accept the upgrade (Moodle refuses to install a lower version over a higher one). All fixes from v10.62–v10.70 (gallery bugs, image2 full-context prompt, voiceover suppression for decision-point cards, sceneParts icon fallback) are included. CC_VERSION → 10.81. version.php → 2026032001081.

## [10.70] - 2026-03-20

### Fixed
- **BUG-SCENEPT-EMPTY-ICON** — `renderHookScenario` and `renderAppliedScenario` in `cc-card-slots.js` guarded the scene-part icon with `if (part.icon) html += getIcon(part.icon)`. When the AI returned an empty string for the icon field, the guard bypassed `getIcon()` entirely — the icon slot rendered as an empty div instead of using the built-in `ICONS.shield` fallback. Fixed: unconditionally call `getIcon(part.icon || 'map-pin')`, which falls back to `map-pin` for absent/empty fields and to `shield` for invalid names. Applied to both `hook-scenario` (Card 1) and `applied-scenario` (Card 4). Audit confirmed: all 21 prompt vocabulary icons (`map-pin`, `users`, `alert-circle`, `clock`, `alert-triangle`, `eye`, `lightbulb`, `shield-check`, `layers`, `book-open`, `check-circle`, `star`, `help-circle`, `award`, `anchor`, `zap`, `hard-hat`, `file-text`, `calendar`, `dollar-sign`, `tag`) are present in `cc-icons.js` — zero mismatches.

## [10.69] - 2026-03-20

### Fixed
- **BUG-IMG2-PROMPT-TRUNCATED** — `generateSlideImage2` built the AI image prompt by reading only `card.sceneParts[0]` — the first of 4 scene panels in the applied-scenario ("On the Job") card. The other 3 panels (titles + texts) were silently ignored. The AI received at most 25% of the scenario context, so the generated image was only loosely related to the actual scenario content. Fixed: all `card.sceneParts[]` panels are now read in full (title + text for each panel), joined and sent as the prompt description. Legacy text-label format fields (`card.bodyText`, `card.heading`, `card.description`) and `card.highlightText` are also included as fallbacks.

## [10.68] - 2026-03-20

### Fixed — image2 (applied-scenario card) audit (5 bugs)
- **BUG-IMG2-NO-SOURCE-MODAL** — "Add Scenario Image" was calling `generateSlideImage2` immediately, burning 1+ AI credit with no warning, no source choice, and no prompt customisation. Fixed: `showImageModal2()` method added — a 3-option picker (AI Generate / Upload from Device / Activity Gallery) mirroring the image1 workflow exactly. Teacher sees the same familiar modal as the main slide image.
- **BUG-IMG2-NO-REGEN-MODAL** — "Regenerate" button was calling `generateSlideImage2(sectionId, '', true)` immediately — no prompt input, no cost notice, no confirmation. Fixed: `showRegenerateModal2()` method added — prompt textarea, credit cost notice, and Confirm/Cancel buttons, mirroring `showRegenerateModal` (image1).
- **BUG-IMG2-EMPTY-DIV-FOR-STUDENTS** — When `section.image2` is absent and `canEdit` is `false`, `_renderImage2Container` returned a `<div class="cc5-image2-container">` with no content, inserting an invisible block that creates layout/spacing gaps for students. Fixed: early `return ''` when no image and the user is not an editor.
- **BUG-IMG2-NO-ZOOM** — image2 had no zoom/lightbox button. Teachers and students could only see a small inline image with no way to view full-size. Fixed: image is now wrapped in `<button class="cc5-image-zoom-btn" data-image-url="...">` matching the image1 zoom pattern — the existing lightbox click handler picks it up automatically.
- **BUG-IMG2-GALLERY-SLOT** — Gallery selection for image2 was unimplemented (`showGalleryModal(sectionId, 'image2')` was called but the slot param was silently ignored). Fixed: `showGalleryModal` and `_renderGalleryModal` now accept `imageSlot`; gallery overlay carries `data-image-slot` attribute; the gallery item click handler reads the slot and routes to `applyImage2()` (new method, writes to `section.image2`) instead of `applyGalleryImage()` (which writes to `section.image`). Upload-from-device path for image2 also wired.

## [10.67] - 2026-03-20

### Fixed
- **BUG-VO-DP-SUPPRESS** — The decision-point card ("Your Choice" activity) was reading its question and all answer options aloud (A: … B: … C: … D: …) through TTS. The competency-summary card that precedes it already ends with "Now, complete the activity below." — reading the question and choices aloud is redundant and undermines the interactive challenge (students should read and decide for themselves). Fix: decision-point voiceover is now intentionally silent in both `buildFullVoiceoverText` and `patchMissingCardVoiceoverTexts`. Exception: if a teacher has explicitly written a custom `voiceoverText` script for the card, that script is honoured.

## [10.66] - 2026-03-20

### Fixed — 7 Gallery Bugs (player5.js)
- **BUG-GAL-ZOOM-CLASS** — Gallery item zoom button rendered as `<div class="cc5-zoom-icon" data-zoom-url="...">` but the click handler listened for `.cc5-image-zoom-btn` and read `data-image-url` — zoom never fired for gallery items. Fixed: changed to `<button class="cc5-image-zoom-btn" data-image-url="...">` matching the handler exactly.
- **BUG-GAL-EMPTY-SECTIONID** — When gallery is empty no `[data-section-id]` child elements exist inside the overlay, so `$overlay.find('[data-section-id]').first().data('section-id')` returned `undefined` — close button could not navigate back to image source modal. Fixed: gallery overlay now carries its own `data-section-id` attribute; close and overlay-click handlers read it via `$overlay.attr('data-section-id')` first.
- **BUG-GAL-FOCUS-SELECTOR** — Six image and doc modals (image source picker, regenerate, picker, gallery, community, doc viewer) all called `$('.cc5-settings-modal-close').first().focus()` on open — targeting the Settings modal close button which is a completely different element not present in any of these modals. WCAG 2.1 AA focus management was silently broken. Fixed: all six corrected to `.cc5-image-modal-close` (or removed where immediately overridden by the correct `.cc5-doc-modal-close` focus two lines below).
- **BUG-GAL-COUNT-DOUBLE** — Gallery option badge in image source picker computed `imageGallery.length + collectAllManifestImages().length` — but `collectAllManifestImages()` already merges `imageGallery[]` into its output (step 2 of that function), double-counting every unsaved gallery image. Fixed: use `collectAllManifestImages().length` only.
- **BUG-GAL-BADGE-LABEL** — Gallery count badge rendered `"N Free"` by appending `getLabel('freeUpload')` ("Free") after the count — a misleading label for a gallery count. Fixed: badge now shows `"(N)"` (count in parentheses, no label).
- **BUG-GAL-INUSE-STALE** — Site-wide images fetched from other Moodle activities were added to the gallery combined list with `inUse: false`. The `applyGalleryImage` removal guard `if (!selectedImage.inUse)` then triggered a `findIndex` + `splice` against this activity's `imageGallery` array where the site image does not exist — a silent no-op that obscured intent and could cause subtle ordering bugs. Fixed: site images now carry `inUse: true` in both `_renderGalleryModal` and `applyGalleryImage`.
- **BUG-GAL-AI-PROMPT-EMPTY** — `generateSlideImage` and `generateSlideImageBulk` both sent `slideDescription: section.description || ''` — but `section.description` is always empty for 7-card unified sections (content lives in `section.cards[].bodyText` etc). AI received an empty description for every 7-card slide. Fixed: both functions now build a rich fallback from the first two available card fields (`bodyText`, `heading`, `highlightText`, `sceneParts[0].text`) when `section.description` is absent.

### Added
- **IMAGE2 — Applied-scenario card independent image** — The "On the Job" card (applied-scenario, Card 4 in 7-card sections) now supports its own independently AI-generated image stored in `section.image2` (separate from the slide-level `section.image`). Teachers see Add / Regenerate / Remove controls beneath the card. AI generation sends the applied-scenario card content as the prompt context. Image is saved to the activity gallery with `inUse: true`. No DB schema change required.

## [10.65] - 2026-03-20

### Changed
- **VERSION-BUMP** — Pure version maintenance release. No new features or bug fixes.
- `CC_VERSION` bumped `'10.64'` → `'10.65'` in `amd/src/cc-state.js` and `amd/src/generator.js`.
- AMD trios (`cc-state`, `generator`) synced `src → build → min` with MD5-identical copies.
- `version.php` stale file-header comment (still read `Content Creator v10.60`) corrected to `v10.65`.
- `version.php` → `2026032001065`, `release` → `'10.65'`.
- `BUILD_INFO.json` → `'10.65'` / `'2026032001065'`.
- `db/upgrade.php` savepoint added for `2026032001065` (no schema changes).

## [10.64] - 2026-03-20

### Fixed
- **BUG-CC-EDIT-MODAL-TOP-SECTION (player5.js `showEditModal`)** — The edit slide modal rendered a large top section of legacy fields (description, introduction / voiceover text, requirements, do's, don'ts, terminology / key terms, four accent card textareas, and a full workplace scenario block with title, role, context, complication, mental model, and three prediction-prompt options) for *every* slide regardless of its card type. These fields belong to the old flat-content / 5-card model. For 7-card unified lesson sections, where the per-card `Individual Card Content` accordion is the only relevant editor, this top section was entirely redundant noise that forced teachers to scroll past ~15 irrelevant fields to reach the one thing they needed to edit. All legacy top-section fields have been removed from `showEditModal`. The slide title and the per-cardType / per-card editors are now the only content in the modal.
- **BUG-CC-KEYFACTS-SILENTLY-WIPED (player5.js `saveSlideEdit`)** — `$('.cc5-edit-keyfacts-list .cc5-edit-list-item')` collected an empty array on every save because the keyFacts UI was removed at v8.4.6. The empty array was unconditionally written back as `sec.keyFacts = []`, permanently erasing any existing keyFacts data on every save regardless of which field the teacher edited. Fixed by preserving existing `section.keyFacts` when the UI container is absent.
- **BUG-CC-EDIT-MODAL-DATA-LOSS (player5.js `saveSlideEdit`)** — Removing the top-section UI would have caused `description`, `voiceoverText`, `requirements`, `doList`, `dontList`, `terminology`, `keyTakeaway`, `proTip`, `keyInfo`, `expertInsight`, `scenario.title/role/context/complication`, `scenario.mentalModel`, and `scenario.predictionPrompt` to be sent to the server as empty/null values, silently wiping existing data for all those fields. All removed-field variables now fall back to the existing `self._editingSection` value when their UI element is absent, so the AJAX payload sends the unchanged existing values and the local manifest update is a no-op for those fields.

### Changed
- `CC_VERSION` bumped `'10.63'` → `'10.64'` in `amd/src/cc-state.js` and `amd/src/generator.js`.
- All three changed AMD trios (`player5`, `cc-state`, `generator`) synced `src → build → min` with MD5-identical copies.
- `version.php` → `2026032001064`, `release` → `'10.64'`.
- `BUILD_INFO.json` → `'10.64'` / `'2026032001064'`.
- `db/upgrade.php` savepoint added for `2026032001064` (no schema changes).

## [10.63] - 2026-03-20

### Fixed
- **BUG-CC-SCENARIO-PANELS (cc-card-slots.js `renderHookScenario` / `renderAppliedScenario`)** — hook-scenario and applied-scenario cards with flat-text content (stored in `section.content` / `section.bodyText` / `section.description` instead of `sceneParts[]`) were rendered as a numbered-circle timeline list (`.cc5-story-beats` / `.cc5-beat-num` / `.cc5-beat-line`). This is a completely different HTML structure from the sceneParts[] panel layout, so CSS-only changes could never fix the visual result. Fix: the fallback path now generates the same `cc5-scene-parts` / `cc5-scene-part` HTML as the preferred path. Numbers are placed inside the coloured icon circle so sequential order is preserved. Hook-scenario uses the amber palette, applied-scenario uses the teal palette. Both scenarios on every slide now always render as bordered panel cards regardless of how the underlying content was stored.

### Added
- **DECISION-POINT-SOUNDS (player5.js)** — Web Audio API feedback sounds added to the Your Decision activity. Correct answer plays a two-note ascending ding (G5 → C6, sine, 0.18 gain). Wrong answer plays a two-note descending tone (E4 → C4, sine, 0.12 gain). Both functions (`playDecisionCorrectSound` / `playDecisionIncorrectSound`) use the existing `getAudioContext()` infrastructure and resume a suspended context automatically. Sounds fire on option click; Try Again resets the card silently with no sound.

### Changed
- `CC_VERSION` bumped `'10.62'` → `'10.63'` in `amd/src/cc-state.js` and `amd/src/generator.js`.
- All four AMD trios (`player5`, `cc-card-slots`, `cc-state`, `generator`) synced `src → build → min` with MD5-identical copies.
- `version.php` → `2026032001063`, `release` → `'10.63'`.
- `BUILD_INFO.json` → `'10.63'` / `'2026032001063'`.
- `db/upgrade.php` savepoint added for `2026032001063` (no schema changes).

## [10.62] - 2026-03-20

### Fixed
- **BUG-CC-MODALPOSITION (player5.css `.cc5-image-modal-overlay`)** — Modal used `position:absolute`, placing it at the top of the `#contentcreator-app` container. When the user scrolled down the page before clicking "Add Image", the overlay rendered entirely outside the visible viewport. Fixed to `position:fixed` with `overflow-y:auto` and `padding-top:60px` so the dialog always appears centred in the current viewport, regardless of scroll position.
- **BUG-CC-IMGGEN (player5.js `generateSlideImage` success handler)** — Three compounding bugs in the same callback: (1) When the API returned >1 image, both `showImagePickerModal` and `applySelectedImage(images[0])` were called simultaneously — the first image was applied immediately, making the picker completely pointless. (2) When the API returned exactly 1 image, there was no `else`-branch, so the image was silently discarded and the slide remained stuck showing the loading spinner. (3) `throw new Error(response.error || 'Failed to generate image')` executed unconditionally on every *successful* response, crashing the handler before the success notification was shown. Fix: proper `if (> 1) { picker } else { applySelectedImage }` structure; `return` on success path; explicit failure path calling `self.render()` and showing the error notification.
- **BUG-CC-GALLERYSAVE (player5.js `applySelectedImage`)** — When an AI-generated image was applied to a slide, only the *unused* (unchosen) images were pushed to `manifest.imageGallery`. The applied image itself was never saved, so it was permanently invisible in "Choose Image Source → Gallery". Users could not reuse a previously applied image without paying for another generation. Fix: the selected/applied image is now pushed to `imageGallery` with `inUse:true` (with a duplicate-URL guard) before any unused images are processed.

### Changed
- `CC_VERSION` bumped `'10.61'` → `'10.62'` in `amd/src/cc-state.js` (shared constant; player5.js and builder.js read from here) and `amd/src/generator.js` (independent constant).
- All three AMD trios (`player5`, `cc-state`, `generator`) synced `src → build → min` with MD5-identical copies.
- `version.php` → `2026032001062`, `release` → `'10.62'`.
- `BUILD_INFO.json` → `'10.62'` / `'2026032001062'`.
- `db/upgrade.php` savepoint added for `2026032001062` (no schema changes; savepoint required for upgrade path integrity).

## [9.92] - 2026-03-18

### Fixed
- **VO-PRELOAD-CANEDIT-1: preCanRegen missing preIsWordStale** — `preloadOne()` computed `preCanRegen` as `editMode || (canEdit && (schemaStale || noFingerprint))`. When content was generated after the v9.81 schema-version fix (so schema matched) and after v9.75 word-count stamping (so no fingerprint was present), `preCanRegen` was always `false` for canEdit teachers — even when `preIsWordStale` was `true` (old buggy audio covered only card[0]). Fix: `|| preIsWordStale` added to the canEdit arm so word-count-stale sections also trigger background regeneration.
- **VO-PRELOAD-CANEDIT-2: preload API gate blocked canEdit teachers** — After the stale gate cleared, `if (!self.editMode) { return; }` silently aborted the preload for any non-editor user, including canEdit teachers in view/preview mode. They never reached the TTS API call regardless of whether preCanRegen was true. Fix: gate changed to `if (!self.editMode && !self.canEdit)` — students remain blocked (by design; TTS credits cost money), canEdit teachers are now allowed through.
- **VO-PRELOAD-SAVEBACK: Preload save-back editMode-only** — After a successful preload TTS call, `section.voiceoverUrl`, `voiceoverWordCount`, `voiceoverSchemaVersion`, and `saveManifestSilent()` were all inside `if (self.editMode)`. A canEdit teacher's freshly regenerated audio was cached in memory for their session only and never written back to the manifest — so students always loaded the old stale URL on every subsequent visit. Fix: guard changed to `if (self.editMode || self.canEdit)`.
- **VO-PRIORITY-SAVEBACK: priorityPreloadCurrentSlide save-back editMode-only** — Same pattern as above: the manifest update block inside `priorityPreloadCurrentSlide()` only ran for `editMode`. Fix: extended to `editMode || canEdit` with explanatory v9.92 comment.

### Changed
- `CC_VERSION` bumped `'9.91'` → `'9.92'` in `amd/src/player5.js`.
- `player5.min.js` re-minified with terser; `amd/build/player5.js` synced from src.
- `version.php` → `2026031800992`, `release` → `'9.92'`.

**Combined effect:** The first canEdit teacher to open any course after this update will silently regenerate full-section audio for all word-stale slides during page load (no click required). The fresh URLs are saved back to the manifest, so students hear correct multi-card audio on their very next visit.

## [9.91] - 2026-03-18

### Changed
- **Version bump:** All 3 AMD src files (`builder.js`, `generator.js`, `player5.js`) bumped to `CC_VERSION = '9.91'`; all 6 build counterparts synced and MD5-verified; `player5.min.js` re-minified with terser; `version.php` → `2026031800991`. The two voiceover fixes (VO-STALE-REGEN + VO-CANEDIT-SAVEBACK) introduced in v9.90 are carried forward in this release.

## [9.90] - 2026-03-18

### Fixed
- **VO-STALE-REGEN: Voiceover "overview then random stuff" bug** — `canEdit` teachers (instructors viewing the course in Select/Preview mode, not inside the editor) were excluded from the word-count-based stale regeneration gate. Content generated between v9.78 and v9.81 carried schema `'9.81'` (same as current `VOICEOVER_SCHEMA_VERSION`) and a stored word-count fingerprint, so neither `isSchemaStale` nor `hasNoFingerprint` fired. The old `buildFullVoiceoverText` only narrated card[0] (the overview card) plus a raw section-field dump instead of all cards, producing audio that sounded like "first overview then random stuff" (requirements / do-don't lists / terminology / key takeaway read verbatim). Because `isWordCountStale` was not included in the `preCanRegen` / regeneration condition, those teachers (and their students) heard the wrong audio every session indefinitely. Fix: `isWordCountStale` is now included in the non-editMode `canEdit` teacher regeneration gate in `playVoiceover`.
- **VO-CANEDIT-SAVEBACK: Repeated on-demand TTS calls for canEdit teachers** — When a `canEdit` teacher in preview mode clicked Play on a section with stale audio, `playVoiceover` generated fresh audio on-demand but only persisted it to the manifest when `editMode = true`. A `canEdit` (non-editMode) teacher burned a TTS API call on every session visit without saving the result, so students never heard the correct audio on subsequent visits. Fix: the post-generation save-back is now guarded by `editMode || canEdit`, ensuring the fresh audio URL, word count, and schema are written back to the manifest and saved for all teacher-tier users.

## [9.64] - 2026-03-12

### Fixed
- Fixed voiceover reading content twice on cards that have both a dedicated voiceover script and body text. The TTS text builder now skips bodyText when voiceoverText is already present on the same card.

## [9.10] - 2026-02-23

### Fixed
- **CRITICAL: TRAINING_PACKAGES.JS MISSING AMD WRAPPER** — `training_packages.js` was wrapped in a plain IIFE `(function(){...})()` instead of Moodle's required `define()` wrapper — when RequireJS processed this file from `amd/build/`, it crashed the entire AMD loader chain, killing ALL JavaScript on every page site-wide (including primary/secondary navigation menus)
- Converted to proper AMD module: `define([], function() { ... return {...}; });` with backward-compatible `window.TRAINING_PACKAGE_DATA` assignment
- **LOADING SPINNERS SHOWING PREMATURELY** — 18 HTML elements in builder.js used bare `hidden` CSS class which was renamed to `cc-hidden` in v9.0.4 — caused "Fetching unit data from training.gov.au..." and "Extracting competency data from PDF..." spinners to display immediately on Step 2 before any user action
- All 18 instances of bare `hidden` class replaced with `cc-hidden` across VET, Workplace, and University step templates

## [9.0.9] - 2026-02-23

### Fixed
- **CRITICAL: AMD LETTERS REDECLARATION — SINGLE CONSTANT FIX** — Replaced ALL local `var letters`, `var letters2`, `var fallbackLetters`, and `const letters` declarations across `forceVETDecision()`, `forceUniversityDecision()`, and `forceWorkplaceDecision()` with a single module-level constant `CC_OPTION_LETTERS = ["A","B","C","D"]`
- Previous approach of renaming individual declarations was insufficient — Moodle's JS bundler concatenates AMD modules into `first.js`, and any `var` hoisting + `const` redeclaration in the same scope crashes RequireJS with `SyntaxError: Identifier 'letters' has already been declared`, killing ALL page JavaScript
- Zero local `letters`/`letters2`/`fallbackLetters` declarations remain — all 13 usages now reference `CC_OPTION_LETTERS`
- Passes strict mode syntax validation

## [9.0.8] - 2026-02-23

### Fixed
- **BODY INJECTION ELIMINATION**: All `document.body.appendChild()` calls across `builder.js`, `generator.js`, `player5.js` replaced with `#contentcreator-app` container
- Computed style extraction (temp button for theme color detection) moved from `document.body` to `#contentcreator-app`
- Zero `$('body').append`, zero `appendTo('body')`, zero `position:fixed` in entire AMD codebase

## [9.0.6] - 2026-02-23

### Fixed
- **CONFETTI CANVAS ISOLATION FIX**: `showActivityConfetti()` canvas changed from `document.body` with `position:fixed` `z-index:9999` to `#contentcreator-app` with `position:absolute` — was a full-viewport overlay on `<body>` that could hide Moodle admin menus
- `showCompletionCelebration()` canvas — same fix applied (was also `document.body.appendChild` with `position:fixed` `z-index:9999`)
- Fixed confetti cleanup logic bug — canvas was being removed inside the "keep animating" branch instead of after animation completes, causing inconsistent behavior across browsers
- Canvas now sized to plugin container bounds (`getBoundingClientRect()`) instead of `window.innerWidth/innerHeight`
- Zero remaining `document.body` visual overlays in entire plugin codebase (only safe download-trigger `<a>` elements remain)

## [9.0.5] - 2026-02-23

### Fixed
- **OVERLAY ISOLATION FIX (CRITICAL - MOODLE 5 NAV)**: All modal overlays now append to `#contentcreator-app` instead of `<body>` — was covering entire page including Moodle admin navigation
- All overlay CSS changed from `position: fixed` to `position: absolute` — overlays are now trapped inside the plugin container
- Added `isolation: isolate` and `position: relative` to `.contentcreator-container` — creates a hard stacking context boundary so plugin z-index never leaks into Moodle
- Replaced `all: unset` on `.cc-btn` with explicit property resets (`background: none`, `border: none`, `margin: 0`, `padding: 0`, `cursor: pointer`) — `all: unset` was too aggressive and could break inherited Moodle button styles
- Plugin can never again visually cover Moodle primary/secondary navigation menus

## [9.0.4] - 2026-02-23

### Fixed
- **MOODLE 5 CSS LEAKAGE FIX (CRITICAL)**: Renamed global `.hidden { display:none!important }` to `.cc-hidden` — was overriding Moodle/Bootstrap `.hidden` utility class, force-hiding navigation elements
- Updated all JS references from `classList.add/remove/toggle('hidden')` to `('cc-hidden')`
- Scoped `prefers-reduced-motion *` selector to `.contentcreator-container *` — was killing ALL page animations/transitions globally
- Renamed `.sr-only` to `.cc5-sr-only` — conflicted with Bootstrap/Moodle `.sr-only` class
- Scoped bare `button`/`summary` WCAG touch target rules to `.cc5-player button`/`.cc5-player summary`
- Prevents site admin primary and secondary navigation menus from being hidden

## [9.0.3] - 2026-02-22

### Fixed
- **MOODLE 5 CSS MINIFIER FIX**: Removed `@import url()` from tokens.css — breaks Moodle PHP CSS minifier when concatenated with other plugin CSS
- Google Fonts now loaded via `$PAGE->requires->css()` in view.php (proper Moodle pattern)
- Replaced `inset: 0` CSS shorthand with explicit `top: 0; right: 0; bottom: 0; left: 0` — Moodle minifier doesn't support modern shorthands
- Replaced `accent-color` property with explicit checkbox/radio styling
- Prefixed all `@keyframes` names (e.g., `spin` → `cc-spin`, `pulse` → `cc-pulse`) — prevents collision with Moodle core animations

## [9.0.2] - 2026-02-22

### Changed
- **PROMPT QUALITY OVERHAUL**: ChatGPT audit implementation
- Word counts changed from rigid minimums to flexible ranges across all 3 modes (VET, Workplace, University)
- 16 new banned filler words with stratified enforcement (8 hard bans auto-replaced, 11 soft penalties in scoring)
- Quality Gate rebalanced (Coherence weight raised from 25 to 35)
- Near-duplicate option detection and option homogeneity checking
- PC/KE hallucination prevention with TopicPC-1 placeholder format
- All 4 repair prompts upgraded with expanded rules

## [9.0.1] - 2026-02-21

### Changed
- **ACTIVITY QUALITY OVERHAUL**: Upgraded slideshow activity generation from basic recall to scenario-based assessment
- MCQs now present realistic workplace situations with plausible distractors
- True/False uses common workplace misconceptions instead of obviously wrong statements
- Matching pairs actions to consequences instead of terms to definitions
- Ordering activities now have 4-6 consequential steps
- Explanations are 2+ sentences with statistics, consequences, and principles
- Assessment type now varies (ordering, MCQ, matching) instead of always defaulting to term-definition matching

## [9.0.0] - 2026-02-20

### Added
- **AUDIT DEFENSIBILITY ENGINE**: New 80-point RTO compliance scorer with 7 audit categories
- Dual scoring system (instructional 100pts + audit 80pts = 180pts combined)
- Publish threshold 140/180 with hard 40/80 audit gate — high instructional scores cannot bypass audit requirements
- Observable behaviour tracking and workplace artefact requirements on knowledge cards
- PC/KE mapping and evidence trail fields on feedback cards
- Legal consequence specificity for VET/Workplace modes
- Targeted audit repair prompts auto-fix non-compliant content
- University mode gets automatic audit pass

## [6.5.66] - 2026-01-06

### Added
- **ADD-ON 25: Unit Title Anchoring Rule (THE NORTH STAR)**: Every learning dot point must be written in the direct context of the unit of competency title
- Unit title encodes the CORE TASK (e.g., "Work safely at heights", "Operate a forklift", "Provide first aid")
- Enforcement test: "Could this dot point exist in a different unit title unchanged?" → if YES, rewrite it
- This rule is the FINAL GLUE binding all other ADD-ON rules together

### Changed
- Updated "Two Most Powerful Rules" summary:
  1. If a dot point could apply to doing office work, it is NOT specific enough
  2. If a dot point could exist in a different unit title unchanged, it is NOT anchored enough

## [6.5.65] - 2026-01-06

### Added
- **ADD-ON 15-24: Task-Specific Content Rules** - 10 new rules to prevent vague/generic AI output:
  - ADD-ON 15: TASK-AWARENESS ENFORCEMENT - Observable actions, tools, conditions for physical tasks
  - ADD-ON 16: MINIMUM SPECIFICITY REQUIREMENT - Every dot point must include concrete task-specific detail
  - ADD-ON 17: GROUND-LEVEL TEST - "Could this apply to office work?" → rewrite if YES
  - ADD-ON 18: ABSTRACT→CONCRETE TRANSLATION - Expand identify/follow/use/ensure/comply/manage/apply verbs
  - ADD-ON 19: ENVIRONMENT ANCHOR RULE - Content must reference realistic work environment
  - ADD-ON 20: TOOL/SYSTEM VISIBILITY RULE - Reference tools, equipment, forms when used in task
  - ADD-ON 21: CONSEQUENCE AWARENESS RULE - Show injury/damage/failure/rework/disruption risks
  - ADD-ON 22: ROLE-APPROPRIATE ACTION RULE - Match actions to worker/supervisor/manager level
  - ADD-ON 23: GENERIC FALLBACK RULE - Use neutral but still physical/observable language when unsure
  - ADD-ON 24: FINAL CONTENT VALIDATION - Confirm each dot point has concrete task detail

## [6.5.64] - 2026-01-05

### Fixed
- **Document Popup Formatting Audit**: Comprehensive UI improvements for workplace document popups
- Close button now 48x48px with solid red background and white X icon
- Check column now properly centered in tables (middle columns, not just last)
- Removed unwanted Unicode checkbox characters (☐ ☑ □ etc.) from item text via sanitizeDocumentContent()

### Added
- `applyDocumentTableFixes()` post-processes DOM after modal insertion
- Zebra striping for table rows with hover highlight
- Improved table header styling with 2px bottom border
- Check cells styled green with larger font size (1.3rem)
- Comments column left-aligned with secondary text color

## [6.5.63] - 2026-01-05

### Added
- **Preloading Screen Before Topics Display**: Shows "Preparing Your Learning Content" screen while preloading
- Waits for ALL voiceovers and workplace documents to load before showing topic cards
- Progress bar shows combined preloading progress (voiceovers + documents)
- Topics only appear when everything is ready for instant playback

### Fixed
- Voiceover sectionId type mismatch - converted to string before .includes() call

## [6.5.62] - 2026-01-04

### Added
- **ADD-ON 0: INDUSTRY LOCK (NON-NEGOTIABLE)** - ALL content MUST remain STRICTLY within selected industry
- NO cross-industry contamination (e.g., finance examples in mining = FORBIDDEN)
- **ADD-ON 0B: FALLBACK RULE** - When uncertain, default to generic process-focused language
- **ADD-ON 14: GENERIC VALIDATION CHECK** - Final pass verifying industry consistency, legislation safety, worker level, unit alignment

### Changed
- Simplified mapping document from 4 sheets to 3 sheets (removed redundant Legacy Topic Mapping)
- Sheet 1: Learning Content (one row per subtopic - no duplication)
- Sheet 2: Coverage Mapping (requirements map TO subtopics - auditor-friendly)
- Sheet 3: Unit Summary (unit overview and coverage stats)

## [6.5.61] - 2026-01-04

### Added
- **ADD-ON 12: Max-Detail Rule** - "Toolbox talk heuristic" - if a worker couldn't recall it from memory, it's too specific
- **ADD-ON 13: Legislation-Safe Scenario Pattern** - 5-part structure (Context, Trigger, Expected Response, Reasoning, Communication)
- Approved scenario verbs: pause, review, update, consult, communicate, seek advice, coordinate
- Forbidden scenario verbs: approve, authorise, certify, enforce law, mandate

## [6.5.60] - 2026-01-03

### Added
- **ChatGPT Industry Presets**: 11 industry profiles (Mining, Construction, Health, Utilities, Transport, Retail, Hospitality, Manufacturing, Agriculture, Education, Government)
- **Worker-Level Calibration**: Worker/Operator, Supervisor/Team Leader, Manager/Specialist verb mapping
- **ADD-ON 1-11: Industry/Worker-Level Rules**:
  - Industry cues, worker verbs, high-risk enhancement, consultation, dynamic risk, evidence boundary, auditor check
  - ADD-ON 8: HARD BAN ON NAMED LEGISLATION
  - ADD-ON 9: "CURRENT LAW ONLY" WITHOUT NAMING IT
  - ADD-ON 10: REGULATOR REFERENCES MUST BE NON-DIRECTIVE
  - ADD-ON 11: LEGISLATION SANITY CHECK

### Fixed
- Prevents outdated legislation references (e.g., "Mines Safety Regulations 1994" when superseded by 2022 laws)
- Content now uses generic law references: "current WHS laws", "applicable regulatory requirements"
- Regulator references now generic: "relevant regulators", "state/territory safety regulator"

## [6.5.59] - 2026-01-03

### Fixed
- **Section Lookup Fix**: "Section not found" error when clicking Edit/Listen buttons on old content
- New `findSectionWithFallback()` helper function with 3 lookup strategies:
  - Strategy 1: Exact match on section.id
  - Strategy 2: Match by pcNumber field
  - Strategy 3: Index-based lookup (e.g., "1.4" -> topic 0, section 3)
- Applied to showEditModal(), playVoiceover(), and saveSlideEdit()
- Backward compatible with old content that used different ID formats

## [6.5.0] - 2026-01-01

### Added
- **Slide Editing**: Teachers can now edit individual slides directly in the player (title, description, requirements, do's/don'ts)
- **Voiceover Regeneration**: Optional checkbox to regenerate voiceover when saving slide edits (10 credits per slide)
- **Race Condition Prevention**: New voiceoverLoading tracking prevents double-charging when preload and manual play overlap
- **Loader Icon**: Added spinning loader icon for edit modal save operation
- **Security Capability Checks**: Added require_capability() to generate_voice action in ajax.php

### Changed
- **Voice Gender Support**: Full implementation of gender parameter in ajax.php with Chirp 3 HD voice mapping (Aoede=female, Puck=male)
- **Voiceover Cache Invalidation**: Always clears cached voiceover on slide edit to ensure updated content is used
- **JSON Error Handling**: Added try/catch around JSON.parse in player init to gracefully handle corrupted manifest data

### Fixed
- Empty manifest crash prevention in save_slide_edit.php
- XSS protection verified with escapeHtml() using safe DOM method
- Removed 22+ debug error_log statements from PHP files
- Cleaned up all TODO/FIXME/HACK comments

### Technical
- All version comments updated to v6.5.0 across player5.js, player5.css, and PHP files
- External services registered in services.php for save_slide_edit and generate_voiceover

## [6.4.4] - 2026-01-01

### Changed
- **MAJOR Mobile-First Design Overhaul**: Complete redesign of player CSS for mobile learners
- Touch targets increased to 48-52px minimum for all interactive elements
- Icon sizes increased to 24-28px minimum throughout player
- Base text size increased to 16px (1rem) for mobile readability
- Requirements grid now stacks vertically on mobile, switches to grid on tablet+
- Do's/Don'ts columns stack on mobile, side-by-side on tablet+
- Outcomes grid stacks on mobile, multi-column on tablet+
- Slide headers optimized for mobile with centered layout, horizontal on desktop
- Voiceover button full-width on mobile for easy tapping
- All interactive elements (buttons, cards, navigation) have proper touch spacing

### Technical
- Added 300+ lines of mobile-first CSS overrides at end of player5.css
- Uses min-width media queries to scale UP from mobile base
- Breakpoints: 640px (tablet), 768px (large tablet), 1024px (desktop)
- Preserves existing desktop styling while fixing mobile experience

## [6.4.3] - 2026-01-01

### Fixed
- **Dollar Sign Icon Bug**: Replaced incorrect dollar sign ($) icons with lightbulb icons for Key Takeaway and Learning Takeaway sections
- **Voiceover Don'ts**: Each "don't" item now prefixed with "Don't" in voiceover audio for clarity (e.g., "Don't assume you know the job based on previous experience")
- Increased takeaway icon sizes from 16px to 20px for better mobile visibility
- Fixed Reflection activity badge to use info icon instead of dollar sign

## [6.4.2] - 2026-01-01

### Added
- **Instant Voiceover Playback**: All voiceovers are now pre-generated in the background when the player loads
- Audio plays instantly when students click "Listen" - no more waiting for generation
- Shows "Preparing audio..." progress indicator in header while pre-loading
- Voiceovers cached in memory for instant replay
- Graceful fallback to on-demand generation if pre-loading fails

## [6.4.1] - 2026-01-01

### Added
- **Industry Sub-Categories**: New "Industry Sector" dropdown with specific sub-industries for more realistic workplace scenarios
- 28 major industries now have detailed sector breakdowns (e.g., "Building & Construction" has: Residential, Commercial, Civil, Mining, Industrial, High-Rise, Renovation, Demolition, Scaffolding, Formwork, Concreting, Steel Fixing, Carpentry, Bricklaying, Tiling, Painting, Plastering, Roofing, Glazing, Waterproofing)
- Full sub-industry list for: Aged Care, Agriculture, Automotive, Aviation, Building & Construction, Business Services, Childcare, Community Services, Education, Electrical, Engineering, Finance, Food Processing, Government, Healthcare, Hospitality, IT, Logistics, Manufacturing, Mining, Plumbing, Retail, Security, Sport & Recreation, Tourism, Transport, Utilities, Warehousing
- AI topic suggestion and content generation now uses specific industry sector for more targeted, realistic workplace scenarios
- Industry sector context flows through to all AI prompts for authentic workplace language and examples

### Changed
- VET mode form now shows Industry and Industry Sector as separate dropdowns
- Job Title and Job Level moved to their own row for cleaner layout
- prompts.js buildContext() now uses industryContext combining industry + sector

## [6.0.5] - 2025-12-25

### Added
- All 51 Chirp 3 HD countries to workplace context dropdown - now matches voiceover language support exactly
- Countries include: Australia, UK, US, India, Spain, Mexico, France, Canada, Germany, Brazil, Belgium, Netherlands, Denmark, Finland, Norway, Sweden, Bulgaria, Czech Republic, Croatia, Hungary, Poland, Romania, Russia, Slovakia, Slovenia, Serbia, Ukraine, Estonia, Lithuania, Latvia, Greece, Italy, China, Japan, South Korea, Indonesia, Thailand, Vietnam, Bangladesh, Pakistan, Israel, Turkey, Saudi Arabia, UAE, Egypt, Kenya, New Zealand, Ireland, Singapore, Malaysia, Philippines

## [6.0.4] - 2025-12-25

### Fixed
- Comprehensive dark mode support for player5.css - added full CSS variable overrides for backgrounds, borders, text, and themed colors
- Comprehensive dark mode support for cards.css - added themed color overrides for all topic colors
- Supports all Moodle dark mode class patterns: `.dark`, `.theme-dark`, `body.dark`, `[data-theme="dark"]`

## [6.0.3] - 2025-12-25

### Fixed
- TGA API URL corrected from `/api/moodle/tga/unit/` to `/api/tga/unit/` - unit fetch now works
- Removed hardcoded `white` CSS values in player5.css and cards.css for dark mode compatibility
- `.cc5-spot-badge` and `.cc-footer-btn` now use CSS variables instead of hardcoded white

## [6.0.2] - 2025-12-25

### Fixed
- Dark mode CSS for VET/University mode cards - added missing dark mode overrides for primary-muted colors
- Mode cards now properly show light text on dark backgrounds when Moodle theme uses dark mode
- Added support for multiple Moodle dark mode class patterns (.dark, .theme-dark, body.dark, [data-theme="dark"])
- Added dark mode adjustments for shadows, success/warning/error muted colors

## [6.0.1] - 2025-12-25

### Fixed
- CRITICAL: Rebuilt AMD modules - v6.0 wizard was not visible because builder.min.js still had v3.0 code
- All AMD JavaScript modules now properly minified with v6.0 Smart Wizard code
- Users will now see the new 3-step wizard (Mode → Context → Topics)

## [6.0.0] - 2025-12-24

### Added - COMPLETE v6.0.0 SMART WIZARD REBUILD
- NEW: 3-step wizard interface (Mode → Context → Topics → Generate)
- NEW: VET mode with automatic TGA integration - fetches unit data from training.gov.au
- NEW: University mode with Bloom's Taxonomy alignment and learning outcomes
- NEW: Workplace context injection (country, state, industry, job level, job title)
- NEW: Duration-based topic generation (5min=2, 10min=3, 15min=4, 20min=5 topics)
- NEW: Coverage badges (PC/KE/PE/FS) with 100% validation for VET mode
- NEW: Intelligent topic planning with Bloom's verb auto-detection
- NEW: Premium wizard UI with step indicators, mode cards, form sections
- NEW: planner.js for intelligent topic structure generation

## [5.0.1] - 2025-12-23

### Fixed
- Added missing `contentcreator_progress` database table for Moodle DB sync
- Added player5.css loading in view.php for proper styling

## [5.0.0] - 2025-12-23

### Added - COMPLETE v5.0.0 REBUILD
- NEW: 5 world-class e-learning activities for content reinforcement:
  - `scenario-decision` (159 lines) - Workplace scenarios requiring judgment calls
  - `behaviour-sort` (208 lines) - Sort behaviours into correct/incorrect categories
  - `sequence-order` (235 lines) - Arrange procedural steps in correct order
  - `spot-issue` (214 lines) - Identify problems in workplace scenarios
  - `requirement-match` (265 lines) - Match requirements to situations
- NEW: Chirp 3 HD voiceover integration with Google Cloud TTS API (11 languages)
- NEW: Moodle DB sync for completion tracking - saves progress to gradebook
- NEW: Confetti celebrations (100 particles, 60fps physics) on full completion
- NEW: player5.js (868 lines) - Complete Topics Grid → Topic Detail navigation system
- NEW: MANIFEST_SCHEMA_V5.md documenting the v5.0.0 manifest format
- NEW: Activity auto-assignment rules based on content type

### Changed
- Replaced slide player approach entirely with card-based scrollable UI
- Premium SaaS CSS player5.css (1589 lines) with 10 color themes
- All activities use instructional feedback (never says "correct/incorrect")
- Lucide icons inline SVG for consistent styling

## [4.0.4] - 2025-12-22

### Added
- NEW: "View all slides" custom completion condition for activity completion tracking
- Added custom_completion class for Moodle completion API integration
- Added completionviewallslides field to contentcreator table
- Added completed and responses fields to contentcreator_attempts table

### Fixed
- Fixed undefined $id error in lib.php - now sets $contentcreator->id after insert_record
- Added missing language strings: pluginadministration, completionviewallslides, completionviewallslidesdesc, contentcreatorname

## [4.0.3] - 2025-12-22

### Fixed
- Fixed PHP 8.4 implicit nullable parameter deprecation warnings in add_instance and update_instance functions

## [4.0.2] - 2025-12-22

### Security
- Added Privacy API provider for GDPR compliance

## [4.0.1] - 2025-12-22

### Changed
- Added official Moodle 5.x compatibility declaration (`$plugin->supported = [400, 500]`)



## [4.0.0] - 2025-12-21

### Changed - COMPLETE REDESIGN
- Replaced slide player with beautiful card-based policies/procedures layout
- Topics grid with clickable topic cards showing preview of sections
- Topic detail view with scrollable section cards
- Section cards feature colored headers, requirements grid, do's/don'ts columns
- On-demand Chirp voiceover button per section (generates audio only when clicked, saving credits)
- Scroll-based completion tracking (scroll to bottom of section = complete)
- Green tick indicators on completed cards and sections
- Sticky quick navigation pills for jumping between sections within a topic
- Progress bar showing overall module completion percentage
- Premium SaaS CSS styling with 10 color themes
- Modern icons using Lucide icon set (SVG inline)

### Removed
- Slide player (replaced with scrollable cards)
- Imagen 4 Ultra images (not needed with card formatting)
- Pre-generated voiceover (replaced with on-demand generation per section)

## [3.0.0] - 2025-12-20

### Changed
- Migrated to centralized download architecture
- Updated versioned ZIP filename
- Deterministic auto-generation engine
- 7 slide types, 9 activity types
- Rule-based activity selection using Bloom's verb categories

## [2.0.0] - 2025-12-01

### Added
- Rebuilt as criteria-driven assessment engine
- 10 question types
- VET and University modes
- Module → Criteria → Questions hierarchy
- Visual builder interface
- Slide-based player
- Mobile optimization
- Moodle gradebook integration

## [1.0.0] - 2025-06-01

### Added
- Initial release
- AI-powered content creation
- Moodle 4.0+ compatibility
