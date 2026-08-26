# Changelog

## 13.91.4 - 26 August 2026

### Fixed - non-editing teachers were treated as learners in the player

- **A non-editing teacher was held behind the "Preparing audio..." wait screen and shown
  "teacher must open this content first" on a disabled voiceover button.** `view.php` set the
  player's `isTeacher` flag from `mod/contentcreator:manage`, whose archetypes are
  `editingteacher` and `manager` only. A non-editing teacher (archetype `teacher`) fails that
  capability, so every one of player5's eight `isTeacher` guards judged them a student: the
  voiceover wait gate, the `voiceoversComplete` block, the "Reset & retry audio" button and
  priority pre-generation were all withheld.

  The intent was never authoring. The guards' own comments read "Teachers and editors must
  never be blocked by the voiceover wait screen" and "teachers must be able to preview
  voiceovers with Moodle edit mode OFF" — that is a question about being course staff, not
  about being able to edit.

  The server already agreed: `mod/contentcreator:generateondemand` is `CAP_ALLOW` for the
  `teacher` archetype, so `generate_voiceover` and `generate_document_example` would have
  served a non-editing teacher the whole time. Only the front end told them otherwise.

  `isTeacher` is now `mod/contentcreator:manage` OR `mod/contentcreator:review`. `:review`
  already declares exactly the right archetypes — `teacher`, `editingteacher`, `manager` — and
  had been defined for the reporting UI without ever being read.

  `mod/contentcreator:manage` is unchanged as the authoring gate: it still decides whether the
  builder loads and still backs `canEdit`. Only the staff-versus-learner question moved.

## 13.91.3 - 25 August 2026

### Fixed - Route 5 blocker

- **Topics and Text failed at "Failed to generate topic structure" before any AI call.**
  `planner.js` decides how to plan a build from the route mode, and its condition named
  only `university` and `pd`. Route 5 sends its subtopics down that same branch, so every
  Topics-and-Text build fell through to the "Invalid planning inputs" throw and the author
  saw the generic failure message. `planner.js` was byte-identical to 13.83 and was the one
  file Route 5 was never wired into. Naming the mode is the whole fix; `planUniversityTopics`
  reads only outcomes, duration and context, so nothing else changed.

- **Route 5 repairs used the VET repair prompt.** On a structural failure,
  `getContentRepairPromptForMode` and `buildContentRepairPromptForMode` fell through to the
  vocational prompt, which asks for seven cards with scenarios, mistakes and a decision
  point - a shape a five-card prose article cannot be repaired into. Both now have a
  `topicstext` branch that reuses the route's own system prompt and states the issues
  against it, preserving anything the issues do not name.

### Verified

- The exact reported failure reproduced against the 13.83 planner and confirmed fixed.
- University, PD and Topics-and-Text all plan correctly; an unknown mode is still rejected.
- Full regression re-run: all five routes assemble, VET pack 2,221 words and idempotent,
  Route 5 order correct and idempotent, all three Route 5 spec checks pass, zero US
  spellings, badItems consequences preserved.

## 13.91.2 - 25 August 2026

### Fixed

- **Route 5 images had no content to work from.** Topics-and-Text cards carry their prose
  in `paragraphs[]` and have neither `content` nor `description`, so the image request went
  out with an empty `scenarioContext` and an empty description - leaving the section title
  as the only signal the image generator received. It now sends the card heading plus its
  opening paragraphs.

- **Route 5 images would have been generated with hard hats.** The vendor's image prompt
  builder had a single branch: `university` got academic wording and every other value,
  including any unknown one, fell through to the VET/workplace branch that mandates safety
  helmets, gloves and high-visibility clothing. An article about Renaissance painting would
  have been illustrated in PPE. v13.91.1 worked around this by sending `university`; the
  vendor now has a dedicated `topicstext` branch that picks the scene from the subject
  matter alone, so the workaround has been removed and the true route value is sent.

### Note on the vendor side (lms-labs, not this plugin)

Three fixes were made to the image endpoint this release depends on:

- The primary image model had been retired since 19 August and was returning 404. Every
  image spent roughly 45 seconds failing three retries before silently falling back to a
  secondary provider. Now on a supported model.
- Landscape images were being generated portrait. The endpoint accepted a 16:9 request and
  hardcoded 9:16; the requested ratio is now honoured, fallback provider included.
- Professional Development content was being illustrated with PPE and high-vis. It now has
  its own branch: offices, meeting rooms, business clothing.

## 13.91 - 25 August 2026

### New: fifth route  -  "Topics and Text"

A plain explanatory-article route. Headings and prose, nothing else: no scenarios, no
quiz, no compliance framing, no jurisdiction legislation. Built to work on any subject
at all - forklift safety, Renaissance art, GST, grief counselling.

Five sections, the **Explanatory Spine**. Each is defined by a rhetorical operation
performed on the topic rather than by subject matter, which is what makes the same five
slots carry any subject without strain:

1. **Orientation** - what it is and why it matters, complete, before any detail
2. **Foundations** - the two to four load-bearing ideas the rest depends on
3. **Mechanism** - the subject actually working (causal, sequential or compositional)
4. **In Practice** - the same mechanism producing different outcomes in different cases
5. **Boundaries** - the common misunderstanding refuted, limits named, connections outward

Deliberately more than intro/body/conclusion: section 4 forces conditionality and
section 5 forces refutation, and both are evidence-backed rather than stylistic.
Grounded in Meyer's expository text structures, Reigeluth's elaboration theory and the
Diataxis Explanation quadrant. Merrill, Gagne and Kolb were considered and rejected -
each needs the learner to DO something and receive feedback, which prose cannot deliver.

Presentation: two cards across, in the Vocational route's card styling. **No left accent
rails, and a maximum div nesting depth of two** - the card is the container. Verified by
rendering the real output through the real renderer, not by inspection.

Voiceover, top image, and card edit / delete / reorder all work on this route unchanged,
because they are card-type-agnostic.

Card 3's structure can be pinned by the author via `context.mechanismType`
(causal | sequential | compositional); left empty, the model chooses. This is the
highest-variance decision in the route.

### Changed: route picker

Each of the five route cards now lists exactly which cards it generates and what goes in
each one, so an author knows what they are choosing before they choose it.

### Note

The route reuses the PD step-2 form and its DOM ids rather than introducing a new one, so
every existing validator, button handler and topic-suggestion path works unchanged. This
was chosen over a bespoke form specifically to keep the new surface area small.

## 13.90.2 - 25 August 2026

Four confirmed defects from the deep audit of the player, editor and label layer.

### Fixed

- **Blank / raw-key text in the interface.** Nine keys were read by `getLabel()` but
  defined nowhere - not in `translations.js` and not in `lang/en/contentcreator.php`.
  `getLabel()` ends `|| key`, and because the key string is truthy every
  `getLabel('x') || 'Fallback'` call site was dead code, so the raw camelCase key rendered
  as visible text. Card headings read "tipsForHandling" and "analysisQuestions"; worse,
  the dialogs a teacher sees when a save fails read "somethingWentWrong",
  "slideSaveFailed" and "documentSaveFailed". All nine now defined.

- **The card editor destroyed every "What to Avoid" consequence on save.** v13.85 fixed
  this collapse-to-string in the section-level branch, but the identical code in the
  v13.22 per-card branch was missed - and that is the branch that actually runs, because
  competency-summary is Card 6 of the unified 7-card flow and renders as a card block.
  A teacher who opened a slide editor, changed only the card title and clicked Save lost
  every consequence in that card, permanently: nothing regenerates them. Consequences are
  now carried across by index, as the section-level branch already did.

- **New "What to Avoid" rows inherited another item's consequence.** The add handler used
  the row COUNT as the new index, which collides after a delete: three rows (0,1,2),
  delete the middle, and the survivors keep 0 and 2 - then the new row also takes 2. Both
  mapped to the same prior entry. New rows now take max(existing index) + 1.

- **`needsReview` is now wired end to end.** The flag added in 13.90.1 was counted by the
  builder but ignored by the player's Regenerate button and by the generator's
  regeneration filter, so a salvaged section showed no retry control and the banner
  promised more slides than were actually redone. All three now agree.

## 13.90.1 - 25 August 2026

Follow-up audit of 13.90. Six confirmed defects, two of them ship blockers.

### Fixed - blockers

- **Turning off "Include Decision Challenge" produced a pack of placeholders.**
  `generator.js` required `expectedCount - 1` cards when `activitiesEnabled === false`,
  but nothing tells the model about that setting - `prompts.js` never references it, and
  all three unified prompts still demand "exactly 7 cards". The AI correctly returned 7,
  the validator demanded 6, every section failed both attempts and rendered
  "AI generation failed", after paying for two AI calls per section. The validator now
  accepts either count; the decision-point card is dropped at render time as before.

- **db/upgrade.php (2026082402): the 13.90 fix was half-applied.** The role query was
  context-scoped but the "already decided" lookup beneath it was not, so a single
  course-level Prevent on `:manage` anywhere on the site suppressed the system-level
  grant - and that role lost authoring rights in EVERY course, which is precisely the
  population the step exists to protect. Now scoped to the system context, and switched
  to `record_exists()` so a role with overrides in several courses no longer triggers
  "found more than one record" during upgrade.

### Fixed

- **db/upgrade.php (2026032104) could abort an upgrade mid-flight.** `get_records_sql()`
  keys by the first column, and `contentcreatorid` is not unique in that grouped result,
  so one activity with duplicate attempts for two users lost a row - then `add_index()`
  hit "Duplicate entry", threw a `dml_exception` and left the site in maintenance mode.
  `MAX(id) AS keepid` is now the first column.

- **Exhausted attempts no longer discard generated content.** The loop breaks out saying
  "checking for best available content" and then no such check existed: `lastScore.cards`
  was thrown away unconditionally. One soft structural miss on both attempts destroyed
  roughly 1,500 billed, renderable words per section. Cards carrying 200+ words are now
  kept and marked `STRUCTURAL_REVIEW`; the placeholder sequence is used only when there
  is genuinely nothing to keep.

- **"meter" and "license" removed from the spelling map.** Australian and British English
  spell the measuring instrument "meter" (flow meter, gas meter, multimeter) and only the
  unit of length "metre" - so "check the flow meter" was shipping to learners as "check
  the flow metre", in trades and WHS content, this plugin's core use case. Likewise
  "licence" is the AU noun and "license" the AU verb, both correct: "the regulator will
  license the operator" was being corrupted. A word-level map cannot resolve part of
  speech. All other rules are unaffected and verified.

- **generate_voiceover.php: cache lookup now precedes the billed gates.** The
  `:generateondemand` capability check and both rate limiters ran ahead of the cache read,
  so a free cache hit still consumed a slot in the shared site bucket - a cohort replaying
  narrated content could exhaust the site ceiling and stop voiceover generation for
  everyone, teachers included - and a site that prohibited the capability for students
  broke playback of audio already generated. Now ordered as `ajax.php` always had it.

### Verified, not changed

- Decision-point answers ARE shuffled. An audit pass reported the correct answer was
  always option A; `cc-card-slots.js:35` is a Fisher-Yates shuffle called at `:816` and
  `:1047` before render. The finding was wrong.

## 13.90 - 25 August 2026

### Security

- **db/upgrade.php (2026082402): privilege escalation fixed.** The role query that
  granted `mod/contentcreator:manage` had no context filter, so a role holding
  `moodle/course:manageactivities` as a course-level override in a single course was
  granted `:manage` at SYSTEM context - site-wide authoring rights from a one-course
  override. The query is now constrained to system-context definitions, which is the
  set the removed manageactivities fallback actually covered.

### Fixed

- **player5.js getLabel(): non-English packs rendered English chrome.** Moodle serves
  strings in the SITE language, not the pack language, and the Moodle table was
  consulted first for every label. A Japanese or Spanish pack on an English Moodle
  showed translated content inside an English interface. The pack's own label table
  now wins when the pack is not English; Moodle strings remain authoritative for
  English packs, where they exist to let a site customise wording.

### Documentation

- Corrected two stale code comments (prompts.js, generator.js) asserting the v13.85-87
  prompts "cut output from 182 words per card to ~110". That figure came from a probe
  fixture omitting topic.elementText, topic.criterionText, topic.knowledgeEvidence and
  topic.keyPoints - all interpolated by the VET prompt. The claim is retracted; no
  word-count regression is established. The comment at generator.js:1796 also still
  described the quality checks as driving the repair pass, untrue since 13.88. They
  are report-only.

## 13.89 (2026-08-25)

**The prompts are reverted to 13.83. The measured checks stay, but only to measure.**

A four-route probe run against the live 13.87 plugin - real production prompts, one section
per route, first-pass output with no repair pass involved - produced this:

| Route | Words/card | 13.83 baseline | FK grade | Longest sentence |
|---|---|---|---|---|
| VET | 118 | 182 | 10.1 | 23 |
| Workplace | 108 | 177 | 8.9 | 21 |
| University | 114 | 119 | 15.1 | 28 |
| PD | 108 | 184 | 10.3 | 20 |

The readability work did what it was asked to: longest sentences fell from 35-43 words to
20-28, and Workplace and PD came inside their reading-grade targets. It bought that with
roughly 40% of the content.

**13.83 and 13.64 have no depth floors at all and still produce 182 words per card.**
v13.87 added explicit floors AND sentence caps AND a plain-words rule, and landed at 110. The
constraints were overpowering the floors. Told to write 160-240 words in sentences under 18
words using only short words, the model chose to write less.

### Reverted

`amd/src/prompts.js` is restored from 13.83 wholesale - all four route system prompts, the
card field specs, and the repair prompts, back to the configuration that produced the content
you were happy with. Gone with it: the DEPTH block, the sentence-length rule, the PLAIN WORDS
block, the per-field word bands, the icon additions to the card specs, and the University
parity blocks.

The destructive field deletes added in v13.86 (`delete card.keyPoints` and friends) are also
reverted. Keeping both copies wastes a little space, but it is what 13.83 shipped, and
removing it was implicated in the v13.87 content loss.

One prompt-side change is KEPT: the doubled-word repair in `normalizeCards()`, which removes
"Smoothly Smoothly" style repeats. It has no bearing on how much the model writes.

### Kept, but demoted to measurement only

The depth, readability and duplicate-sentence checks stay in `validateCards()` and are still
recorded on every card as `qualityIssues` / `qualityAction`, alongside the `contentWords`
count added in 13.88. **They no longer trigger anything.** In 13.85-13.87 they drove a repair
pass; that fired on essentially every section and the repair returned cards with their content
arrays missing, taking a VET pack from 10,166 learner-facing words to 6,162.

Now they only report. Nothing they find changes what is generated, so they cannot make content
worse - they exist to tell you when it has drifted, which is the one thing this pipeline has
never had. A repair pass still runs for genuine structural failure, exactly as in 13.83.

The `mergePreservingContent()` guard from 13.88 is also kept: if any future repair does run and
comes back with less than it was given, the original content is restored.

### Everything else is unchanged

All the non-prompt fixes from 13.84-13.88 remain: backup/restore of compressed manifests, the
credit-spending capability and site-wide ceilings, the honest capability check, the two
unclosed `<details>`, the four statements swallowed into comments, `escapeHtml` quote
escaping, the Workplace and VET context fields, draft save, route-state reset, dark mode, the
University card shell, activity ARIA, and the voice-cache prune task.

## 13.88 (2026-08-24)

**Found and fixed by the v13.87 proof run: the repair pass was emptying cards.**

The four-route proof run against 13.87 was stopped after the first route. The VET pack came
back at 6,162 learner-facing words against the 24 August baseline's 10,166 - a 40% drop - with
41 of 48 cards under the depth floor and every card stamped `attemptCount: 2`.

The cards had lost their content arrays entirely: `keyPoints` null, and `sceneParts`,
`conceptInsights` and `items` absent. Only `voiceoverText` survived.

### The chain

Three changes combined into one failure, and none of them is wrong on its own:

1. **v13.87's depth gate fires on nearly every section.** Before v13.85 the repair pass ran
   only on a structural failure - in practice, almost never. It now runs on essentially 100%
   of sections.
2. **The repair pass returns cards without their content arrays.** That fault was always
   there; it was simply almost never reached.
3. **v13.86 removed the accident that was hiding it.** Making the field mapping destructive
   (`delete card.keyPoints` once mapped) was correct in isolation - it stopped repairs being
   silently discarded - but the duplicate copy it removed had been acting as a safety net. With
   one copy and a repair that answers in a different shape, there is nothing to fall back to.

Turning the gate up turned a rare latent fault into a total one.

### The fix

Not to guess which field name a repair will answer in - that is the guessing game this
codebase has lost five times already. Instead, **a repair is now treated as a set of proposed
edits rather than a replacement.** `mergePreservingContent()` takes the repaired value only
where it actually carries content, and otherwise keeps what was already there.

A repair can still improve any field. It can no longer empty one. If the card count changes,
the merge is skipped and the event logged, because a card-for-card merge is then meaningless.

This is a general guard, not a patch for this one shape: any future repair regression, in any
field, on any route, now degrades to "no improvement" instead of "content destroyed".

### Telemetry

Every card is now stamped with `contentWords`, its measured visible-word count. The v13.87 run
could not distinguish thin generation from a destructive repair, because nothing recorded the
size of what had been produced. That gap is closed.

### Still to confirm

Whether first-pass content on 13.87/13.88 is as rich as the 13.83 baseline is NOT yet known -
the v13.87 run destroyed the evidence before it could be measured. The sentence caps and
plain-words rules added in 13.85 could plausibly have reduced volume on their own. The
re-run of this route is what will answer it, and `contentWords` is what will show it.

## 13.87 (2026-08-24)

**Content depth: the floor that was never there.**

This release exists because of one question that the last two did not answer: is the content
long enough and rich enough? The honest answer was no, and worse than no.

### What was actually wrong

Every remaining "N+ words" floor in `prompts.js` was a **voiceoverText** floor. Since v13.41
the narration has been rebuilt verbatim from each card's visible text, so on the VET,
Workplace and PD routes that field is generated, billed and never read. Which means **no
learner-facing field had a word floor at all**, and `validateCards()` had no minimum-length
check of any kind. The card specs asked for "2 sentences" and "2-3 sentences" and nothing
else.

Meanwhile the readability work in 13.85 added a 320-word ceiling, an 18-word sentence cap
and a plain-words rule. All of that rewards brevity. Without a floor underneath them,
"readable" and "thin" point the same way - so the previous release improved how the content
reads while removing the last pressure on how much of it there is.

### Every content field now has a floor and a band

The specs were counts of sentences; they are now counts of words, expressed as ranges so the
model targets a band rather than a minimum to scrape past. Examples: scenario key points move
from "2 sentences" to "2-3 sentences, 40-55 words"; mental-model step detail the same;
mistake consequences from "15+ words" to "20-30 words"; competency standards from "10+ words"
to "12-20 words"; University concept definitions from "30+ words" to "45-70 words"; case study
context from "70+ words" to "90-130 words". The theoretical-framework card also regains an
`application` field, which the renderer has always drawn and the spec had stopped asking for.

Each route gained a DEPTH block, placed deliberately BEFORE the sentence-length rules so it
is read first:

> The single most common failure of this content is that it is TOO THIN, not too long. A card
> that is short is a card the learner finishes in four seconds and remembers nothing from.
> Every word count below is a FLOOR you must reach, not a target to approach from underneath.

It names the working band (160-240 words of visible text per card; 170-260 on University),
states that below the floor the card has failed whatever else is right about it, and makes
explicit that the 320-word cap is a ceiling for one screen and never permission to stop at
100. It also says how to reach a floor honestly: not adjectives, but a named piece of
equipment, a time of day, a real form or system, a consequence with a number or a timeframe.

### And a gate that measures it

Prompt instructions alone are what the plugin has always relied on, and the 24 August proof
run is what that produces. `validateCards()` now measures the visible words on every card
against a per-route floor, and the section average against the working band.

The section check matters as much as the card check: a pack can clear every individual floor
and still be thin, which is exactly what "it used to be better" looks like once measured.

`decision-point` is exempt - it is a question with four options, and holding it to a prose
floor would push the model to pad the one card where padding actively hurts.

Depth issues are reported FIRST among the soft issues, ahead of readability and duplication,
so they survive the repair prompt's five-issue budget. A section where several cards are thin
is collapsed into one instruction naming every offender, rather than six near-identical
messages that would crowd everything else out.

Like the readability gate, these are **soft** issues: they drive one repair pass and can never
be the reason a section falls back to placeholder cards. Real content that reads two grades
high is always better than a placeholder.

### The repair pass can now actually expand

All four repair prompts opened with "Fix ONLY the structural issues listed. Do NOT rewrite,
rephrase, or change any content that is not broken" - which would have blocked the expansion
the depth gate asks for. Depth is now named as the explicit exception: if an issue says a card
is thin, the model must expand it, by adding new short specific sentences rather than padding
or lengthening existing ones. Everything not named in an issue still stays exactly as it is.

### Known, and deliberately not changed

The 70-word `voiceoverText` requirement still stands on all four routes. On VET, Workplace and
PD that text is only read when a card's structural fields come back empty, so it is mostly
generated for nothing - real credit cost on every card. It is left in place because it is the
narration fallback, and removing it risks a silent card in exactly the situation where
something has already gone wrong. Worth revisiting once a proof run confirms how often the
fallback actually fires.

## 13.86 (2026-08-24)

**Post-13.84 audit remediation, part two.** Closes the remaining eleven findings from the
26-item board, including the last two ship blockers. Together with 13.85 this clears the
whole board.

### Security: the capability model is now honest

`contentcreator_require_manage()` and the three authoring web services accepted
`moodle/course:manageactivities` in the course context as an alternative to
`mod/contentcreator:manage`. That made the plugin's own capability advisory - a
CAP_PROHIBIT on it denied nothing - and the test suite asserted that behaviour as correct.
Moodle security review treats an OR-fallback on a capability check as a defect on sight.

The fallback existed for a real reason: a role cloned from the editingteacher archetype
BEFORE this plugin was installed never inherits the plugin's capabilities, and those
teachers would lose access the moment it went. That is now handled once, properly, by an
upgrade step which grants `:manage` to every role that already holds
`moodle/course:manageactivities` and has no explicit setting of its own. Roles deliberately
set to prevent or prohibit are left alone. The test now asserts the prohibit is honoured,
and a second test covers the `:generateondemand` capability added in 13.85.

`db/install.xml` also carried `VERSION="2026082300"` against a plugin version of
`2026082400`; the stamp is corrected.

### Language strings

Roughly 5,200 string literals live in JavaScript, and the player's ~347 interface labels
lived only in `translations.js` - a private 53-language table with its own `getLabel()`.
No AMD module called `get_string` for any of them, so nothing could be translated through
AMOS or reworded by an administrator. This is the largest single item on the board and it
is not finished in one release; what this one does is make it finishable, and migrate the
two sets that matter most.

- **All 347 player labels** are now declared in `lang/en/contentcreator.php` as
  `cclabel_<key>`. `getLabel()` prefetches them in one batched `core/str` request and
  prefers a Moodle string, falling back to the private table. English is therefore fully
  under Moodle's control today, the other 52 languages keep working unchanged, and adding
  a key to the lang file is all it takes to bring another label across.
- **Every user-facing wizard error** is resolved through `core/str`, with English
  fallbacks held in the module so a failed string fetch can never leave an author looking
  at a raw key.

### Workplace had the identical empty-context bug fixed on VET in 13.84

`context.jobTitle`, `jobRoles`, `jobTasks` and `equipmentList` were sourced exclusively
from `CC_WP_AI_CONTEXT`, which is assigned inside a function that returns early because
`#cc-wp-ai-suggestions-container` is not rendered by any template. All four were therefore
ALWAYS empty, and the Workplace prompt - which interpolates every one of them - fell back
to a generic "employee". Job Title, Typical Job Tasks and Equipment & Tools are now
collected on the Workplace route as they are on VET, all optional, and `taskEquipment` is
populated rather than posted as `{}`.

### Losing work

- **Nothing was reset when the author changed route.** Confirm six subtopics on University,
  go back, pick PD, and PD rendered them as "6 subtopics confirmed" and shipped them under
  a PD title. "Start over" cleared about half the state and missed `storedOutcomes`,
  `storedTopicHierarchy`, `storedContext`, `workplaceData` and every pasted-content
  variable. There is now one `resetRouteState()`, called from both places.
- **There was no draft save of any kind.** Closing the tab lost the mode, the unit code and
  fetched TGA data, the element selection, the whole workplace context, every pasted
  reference document, the confirmed subtopics and every credit-costed AI suggestion. The
  wizard now saves to browser storage on each step transition and after each expensive
  step, and restores on load. Drafts are per activity, expire after seven days rather than
  offering a stale unit fetch, and are cleared on route change, on Start over and once a
  manifest is generated. Storage access is wrapped, because private windows and
  locked-down browsers throw rather than returning null.

### Escaping

`escapeHtml()` set `textContent` and read back `innerHTML`, which escapes `&`, `<` and `>`
and never quotes - and it is used in attribute position throughout the player: alt text,
data attributes, and the slide editor's input values. A quote in vendor or teacher content
closed the attribute and everything after it parsed as markup. Both quote characters are
now escaped at that single choke point. Four `<img src>` and six vendor-supplied attribute
values that bypassed escaping entirely are now escaped.

The one deliberate innerHTML path - the generated workplace document, which is rendered as
markup because escaping it would show the learner raw tags - is sanitised on both sides:
`clean_text()` server-side, and a client-side pass that parses the markup inertly and
strips script, style, iframe, object, every `on*` handler and every `javascript:` URL
before it reaches the live DOM. Manifests saved before this release are covered by the
client pass.

### A failed translation no longer reports success

Both translation failure paths logged through a logger that is silent in production, set no
flag, surfaced nothing to the progress callback and returned no error. A customer building
a Spanish pack whose sections failed to translate received an English pack and a green
tick. Failures are now counted, marked on the section (`translationFailed`), reported
through `onProgress`, and surfaced to the author naming the sections that fell back.

### Dark mode was written but never switched on

`player5.css` carries 335 dark rules across six selector families - `.dark`, `.cc5-dark`,
`.cc5-container.cc5-dark`, `.cc5-player.dark-mode`, `body.dark` and
`body[data-bs-theme="dark"]` - and nothing in the plugin ever set any of them. Only the
Bootstrap attribute could fire, and only on sites whose theme puts it on `<body>` rather
than `<html>`, so on a dark Moodle the cards kept near-white backgrounds behind light text.
The player now resolves the theme once - an explicit choice by the site theme wins, then
the operating system preference - and stamps every class name the stylesheet looks for,
following changes to either without a reload. Its own stamp is excluded from detection, so
the player can still follow the OS switching back to light.

### University card shell

13.84 flattened the components inside University's cards, but the divergence was also in
the card SHELL: a saturated three-stop gradient header bar, a 2px coloured bottom border,
and a coloured hover lift that no other route has. All five card types now use the same
header and hover as every other card, with identity carried by the header icon colour. The
scale-and-rotate icon hover and the per-route glow halos are gone too - they were keyed to
card types, and University's five are the only ones still generated, so in practice they
were a University-only flourish.

### Activity accessibility

Quiz correctness was conveyed by a background colour and a CSS `::after` glyph on a
permanently empty span, on a div with no `aria-pressed`, no `aria-disabled` once locked,
and feedback in no live region. Options now carry `aria-pressed`, the whole set is marked
`aria-disabled` when answered, feedback is a polite live region, and the result is
announced in text as well as painted. Focus styling is added across the entire Challenge
Mode surface, which had none outside the decision options.

### Voiceover cache

Two caches held the same audio: `ajax.php` in the system context at itemid 0, and
`generate_voiceover.php` in the module context keyed by cmid. The same text was billed
twice, once per path, and neither could see the other's copy. Both now share the one
site-wide cache, which is the correct scope - the audio depends on text, voice and language
and nothing else.

Nothing had ever pruned it. `contentcreator_delete_instance()` only clears the module
context, so system-context files survived activity deletion, course deletion and site
reset, and there was no scheduled task in the plugin at all. There is now a weekly task
with a configurable retention period (default 180 days; 0 keeps everything). Both file
areas are also declared in the privacy provider, which had never mentioned them.

## 13.85 (2026-08-24)

**Post-13.84 audit remediation, part one.** Five parallel audits of 13.84 raised ~70 findings;
26 survived re-verification. This release closes the nine ship blockers and the structural
cause behind eight of the thirteen major findings. A companion note lists what remains.

### The headline: the quality gate was not connected to the plugin

`scoreQualityGate`, `scoreAuditDefensibility`, all 1,173 lines of `enterprise_qa.js` and all
651 of `quality_scoring.js` are exported, built and shipped - and called from nowhere since
v11.73 replaced them with `validateCards()`. That validator checks card count, that
`cardType` exists, that three card types have a title, that decision-point has two options,
and that mental-model has three steps. That was the entire live gate.

It is the complete explanation for the 24 August proof run passing 190 of 190 cards while
shipping doubled words, US spellings, unexpanded acronyms, 43-word sentences, 411-word
screens and sentences duplicated across cards. Nothing in the pipeline looked for any of them.

`validateCards()` now also measures, per card: Flesch-Kincaid reading grade against a
per-route target (VET and Workplace 9, PD 11, University 14, with 1.5 grades of tolerance),
longest sentence against a per-route ceiling, total words on one screen against 320, and
sentences repeated verbatim across cards in the same section.

These are **soft** issues by design. They drive the existing repair pass on the first attempt
and are recorded on the card as `qualityIssues` with `qualityAction: 'QUALITY_FLAGGED'` on the
last. A reading score must never be able to send a section to `getFailedCardSequence()` and
replace real content with placeholders - that is a far worse outcome than prose two grades
high. The measurements now also survive into the manifest, instead of existing only in a
console log that is silent in production.

### Prompts: the rules were aimed at a field nothing reads

Since v13.41 the narration has been rebuilt verbatim from each card's visible text - the
`voiceoverText` field is generated, billed and then unused for all seven unified card types.
The acronym rules added in 13.84 went into the VOICEOVER section of the prompt, so they
governed that dead field and would never have shown up in the next proof run.

Every writing rule now sits in a block that states plainly that the card's own text is what
gets read aloud. Three further faults in the same instructions:

- **The limits contradicted each other.** VOICE said "sentences under 20 words" while WRITING
  QUALITY said 25. Given two numbers a model takes the looser one. The VOICE lines no longer
  carry a limit; there is one rule, with a hard ceiling and a target average.
- **Nothing addressed word difficulty.** Flesch-Kincaid is half syllables per word, and every
  instruction constrained sentence length only - the sole lexical guidance in 105 KB of
  prompt was two examples on the VET route. There is now a PLAIN WORDS block on every route.
- **The word floors fought the sentence limits.** Every field spec is an `N+ words` floor with
  nothing saying how to meet it, so the model met a 30-word floor with one 30-word sentence.
  Each route now says: meet a floor with MORE SENTENCES, never with longer ones.

### University was running on a third of the instruction

Measured: VET 5,345 characters, Workplace 5,172, PD 5,231, University **1,783**. University
had no icon guidance, no icon consistency rules, no writing-quality block and no acronym
rules. It was also the only route generated with **no spelling instruction at all** - the
injection sat inside an `if (mode !== 'university')` block alongside the legislation
injection - which is why nine US spellings shipped in the University pack alone.

University now has all four blocks, with an icon vocabulary written for academic content
rather than site work, and a plain-words rule that keeps technical terms but requires each to
be defined in a separate sentence. Spelling is injected on every route; legislation stays off
University, which is correct. The teacher's free-text instructions now reach the University
prompt, which they never had.

### One vocabulary for card data, not two

Eight of the thirteen major findings were the same root cause. The prompts ask for
`keyPoints` / `errorItems` / `standardItems` / `heading`; the renderers read `sceneParts` /
`items` / `goodItems` / `question`; `normalizeCardSchema` translated between them with
`if (!card.X)` guards that were neither idempotent nor total. Consequences that were live:

- **Every manifest stored the same text twice.** `keyPoints` was aliased to `sceneParts` and
  never deleted, then `sceneParts` was reassigned to a new mapped array, so the two decoupled.
  A repair pass - prompted in the vendor's vocabulary but shown the derived fields - edited
  `keyPoints`, and the `if (!card.sceneParts)` guard then skipped, silently discarding the
  repair. The mapping is now destructive: the source field is deleted once mapped.
- **The icons restored in 13.84 were severed again one file downstream.** The prompt asked for
  an icon on every mistake and the renderer read it, but the normaliser rebuilt each item with
  exactly two keys. `icon` now survives every path.
- **Half of every competency-summary card was deleted after generation.** The prompt asks for
  five error items with a 10+ word consequence each; only the label was kept. About fifty
  words of generated, billed content per section. The consequence is now preserved, rendered
  beneath its item, narrated, and no longer wiped when a teacher edits the card.
- **The repair prompts named the wrong fields.** They are shown normalised cards, so they now
  describe the normalised shape, and say so explicitly.

The changelog records this class of bug in v11.79, v13.53, v13.65, v13.73 and v13.75. Making
the transform destructive is what stops it recurring.

### A short scenario card rendered the same sentence twice

When a scenario arrived as prose rather than four key points, the generator sliced it into
exactly four quadrants by index arithmetic with a non-empty floor. With three sentences the
learner saw sentence 1, sentence 1, sentence 2, sentence 3 - under headings the AI never
wrote - and `validateCards` passed it because the array was non-empty. It now builds only as
many panels as there is text for, with no overlap. This was a direct mechanism for the
duplicated sentences in the proof run.

### Two unclosed `<details>` hid most of every reflection activity

`cc-activities.js` opened `<details>` twice and closed it zero times; there was no
`</details>` anywhere in the file. Both were inside `forEach` loops, so each disclosure nested
inside the previous one. Questions 2 and 3, the score summary, the unlock instruction and the
takeaway all sat inside question 1's collapsed widget and were invisible until a learner
opened it - the same panel-in-panel-in-panel shape removed from the University route in 13.84.
Both fixed, along with the compensating surplus `</div>` each carried. Every renderer in the
file is now verified balanced by execution.

### Four working statements had been swallowed into comments

A line merge had appended four statements to the end of the comment above them:

- the WCAG keyboard guard on topic cards, so every keystroke opened the topic and
  `preventDefault()` ran unconditionally - **Tab could not move focus off a topic card**;
- the corrupted-manifest message, so a bad manifest produced a **silent blank page**;
- a `var html` declaration, so the "Content Coming Soon" screen printed the literal word
  **`undefined`** with no wrapper - the exact failure the comment above it describes;
- the voiceover regeneration flag, so an edited section with audio but no stored hash kept its
  stale narration.

All four restored. A sweep of `amd/src` found no others.

### Security

- **Credit-spending endpoints were gated on `:view`.** `generate_voiceover` (5 credits a call),
  `generate_document_example` and the `generate_voice` AJAX action were callable by any
  enrolled learner, with only a per-user hourly limit. A 200-learner cohort was up to 100,000
  billable calls an hour with no aggregate ceiling and no administrative control short of
  switching voice off site-wide. There is now a `mod/contentcreator:generateondemand`
  capability - granted to student by default, so nothing changes until a site chooses to
  prohibit it - and two new site-wide hourly ceilings (voiceovers 2000, other AI requests
  1000, 0 to disable) checked before the per-user limit. Playing already-generated audio
  still needs only `:view`.

### Course backup and restore no longer destroys every voiceover

Manifests at or above 512 KB are stored gzip+base64 behind a `gz:` prefix, and real packs
reach 6-10 MB. The restore step applied its URL-rewriting regexes straight to that blob,
matched nothing, and wrote it back unchanged - so the restored manifest kept the source
site's contextid and cmid, which `mod_contentcreator_pluginfile()` then refuses. **Every
restore, duplicate and course rollover silently lost all of its audio.** The manifest is now
decompressed, rewritten and recompressed, and an undecodable blob is left alone with a
developer-level message rather than corrupted. The existing test only covered the small
uncompressed case, so the suite passed throughout; there is now a regression test for the
compressed path.

### Authoring flow

- **The Workplace no-document path was still a dead end.** 13.84 relaxed the gate but not
  `validateStep2()` one function away, so Suggest Subtopics succeeded, Continue appeared, and
  clicking it errored with "Please upload a training document first." `generateTopicPlan()`
  and the criteria builder were gated on the document too, so fixing the validator alone
  would have dropped the build into the wrong branch with empty outcomes. All three moved
  together, and the topic panel now survives a Back.
- **Back from step 3 on the VET route hid the whole route.** `#cc-unit-dependent-sections` was
  rendered hard-coded hidden and only ever revealed by fetching a unit or uploading a PDF,
  and the step's forward button was only ever revealed by the handler that suggested the
  topics. Re-rendering the step - which is what Back does - hid both. The author saw the unit
  box and nothing else, and the only available action, Fetch Unit, reset job levels, topics
  and element selection. The section now opens whenever the unit data it depends on is
  present, and the forward gate is re-evaluated after every re-render.
- **"Try Again" fired one paid generation per wizard step visited.** The error banner is a
  sibling of `#cc-wizard-content`, but `bindWizardEvents()` re-runs on every wizard update and
  added another anonymous listener to the same surviving button each time - typically four by
  the time a generation failed. One click, four concurrent `generateContent()` runs, four
  credit charges and four racing `saveManifest()` calls. Bound once now, and re-entry is
  blocked while a run is in flight. The two delegated listeners on `container`, which is never
  replaced, had the same defect and are also bound once.

## 13.84 (2026-08-24)

**Route styling unified, University route unblocked, and the VET content regression traced
and fixed.** Seven defects, all found in the four-route proof run of 24 August.

### 1. The University route looked nothing like the others

Two separate causes, both fixed.

*Box-in-box-in-box.* `renderTheoreticalFramework()` in `cc-card-slots.js` opened a
`<div class="cc5-framework-item">` for every framework and never closed it, so the second
framework rendered INSIDE the first, the third inside the second, and so on. That is the
full-width panel inside an identical full-width panel inside the card. One missing closing
tag. A CSS safety net now also flattens any nested framework item, so a future renderer or
manifest change cannot bring the nesting back visually.

*Left-accent bars.* The University card family carried decorative 3px `border-left` accents on
five components (`cc5-framework-item`, `cc5-case-context`, `cc5-key-insight`,
`cc5-critical-reflection`, and the per-card-type `cc5-card-header` stripes) - 13 of them on a
single page, against 3 on the Vocational route, and those three are semantic markers
(a legislation link, a continuity banner, an activity banner), not decoration. All five now use
the same flat treatment as the Vocational route: subtle background, one hairline border, one
level of boxing. The hover effects that slid panels sideways and painted an inset accent bar
are gone too; they lift only, as on Vocational. The arrow glyph in front of a framework's
"in practice" line is replaced with a plain bold label.

The per-card-type header stripes were removed wholesale rather than per-route. They only ever
applied to the route-specific card families, and University's are the only ones still generated,
so this is the whole of the difference. Card identity is still carried by the header icon colour
and the tinted header gradient.

University keeps its own academic card types - concept-anchor, theoretical-framework,
analytical-lens, ethics-considerations, case-study - so the content stays academic. Only the
look was brought into line.

### 2. VET content stopped using the author's inputs

`prompts.js` interpolates `context.jobTitle`, `context.jobRoles`, `context.jobTasks` and
`context.equipmentList`. The VET builder stopped collecting them in v6.9.14 on the assumption
the AI would infer them from Industry + Sector + Job Level, and the context object has been
posting `jobTitle: ''`, `jobTasks: []` and `taskEquipment: {}` ever since. The prompt asked,
got nothing, and fell back to generic phrasing - the "it's not including my inputs" symptom.

Job Title, Typical Job Tasks and Equipment & Tools are back in the Workplace Context step, all
three optional. Leave them blank and the v6.9.14 auto-generate behaviour applies exactly as
before. Fill them in and they reach both `suggest-topics` and the generation prompt, so the
subtopics and every scenario speak to the actual role. The Job Title field offers the industry's
job titles as suggestions but accepts anything typed.

### 3. Contextual icons restored on four of seven card types

The 23 August field-name realignment (`3fa7f67`) renamed `sceneParts` and `conceptInsights` to
`keyPoints` and `items` to `errorItems`, and dropped the `icon` field while doing so. Every
`keyPoints` and `errorItems` entry has since come back with `icon: null` and rendered a default
icon - across a 56-card pack, a uniform flattening of the visual texture, which is a plausible
part of "it looks completely broken" with nothing actually erroring. The prompt was also left
internally inconsistent: it still carried its full icon-selection guide for fields it no longer
asked icons for.

`icon` is restored on `hook-scenario`, `concept-explainer`, `applied-scenario` and `mistakes`.
The renderer already reads it and the API already returns whatever the prompt asks for, so this
is a prompt-side change only.

The audit-repair prompt was still written against the OLD field names (`sceneParts`,
`conceptInsights`, `items`, `goodItems`/`badItems`, `question`/`options`), so any card it
repaired came back in a shape the current pipeline no longer expects. It is realigned.

The file header comment described four route-specific card sequences retired in March 2026
(`f41e19d`). It now describes what the file actually implements.

### 4. The University route could not be completed through the UI

Step 2 renders `#cc-next-step` hidden unless subtopics already existed when the step rendered.
On the University route the only way to create them is `applyBulkPaste()`, which runs after the
render and never removed the class - so once subtopics were confirmed the step showed nothing
but "Back". The Workplace route escaped this only because its optional reference-content
textarea happens to unhide the same button once 50 words are typed. Confirming subtopics now
reveals the forward button on every route, and a button already earned that way is never
re-hidden. The University reference textarea's `input` binding was a bare no-op; it now updates
its word count like every other route's.

### 5. The Workplace route no longer requires a document

"Suggest Subtopics" was disabled until a document was uploaded, and a document was required for
the step to validate, so a trainer with a topic but no policy file could not use the route at
all. A typed Training Topic is now a valid source on its own. A document still takes priority
when one is present, and nothing changes for authors who upload one.

Two things had to be fixed behind that gate for the no-document path to actually work.
`renderWorkplaceDetails()` dereferenced `data.content` on a null document and threw a TypeError
that the caller's `catch` swallowed as "Failed to suggest topics" - so the route would have
reported a vendor failure even when the vendor call succeeded. And `#cc-workplace-content` is
rendered hidden until a document upload unhides it, so the suggested subtopics would have landed
in a hidden div. Both handled.

### 6. Declared duration was wrong by two to three times

Every manifest declared `estimatedMinutes: 10` - the author's target from the planning step,
never revisited - while narration alone ran 18 to 23 minutes. It is now measured from the pack
that was actually generated: narration at 150 wpm, reading time at 200 wpm for cards with no
voiceover, plus a minute per interactive activity, rounded up.

### 7. Text-quality guards

Three defects appeared across all four routes in the proof run and nothing in the pipeline
caught any of them. `normalizeCards()` now repairs them on the assembled JSON before anything is
rendered or sent to TTS:

- Doubled words ("Smoothly Smoothly", "Feedback Feedback") are collapsed. Only an exact
  same-case repeat of a word of four or more letters, and never for the handful of English
  constructions where a genuine repeat is valid ("that that", "had had").
Spelling is fixed in `generator.js`, which already owned it. `australianSpelling` simply had no
entries for the forms that leaked - `emphasize`, `organization`, `unauthorized` and the whole
`-ation` noun family - so `organize` was corrected while `organization` sailed through. Those are
added. Two further faults in the same code: an ALL-CAPS match came back title-cased, so
"AUTHORIZED PERSONNEL ONLY" would have become "Authorised PERSONNEL ONLY"; and the gate was
`language === 'en-AU'` exactly, so en-GB and en-NZ packs got no normalisation at all. Both fixed.
- The prompts now require every acronym to be expanded the first time it is spoken, so a TTS
  voice does not read "SBI" letter by letter, plus explicit rules against repeating a word,
  reusing a sentence across cards, exceeding 320 words on one screen, and writing sentences over
  25 words (20 spoken).

## 13.83 (2026-08-23)

Release-pipeline blocker only; no functional change from 13.82. The pipeline scans for the
literal token `PARAM_RAW`, and the explanatory comment added in 13.82 mentioned it by name while
describing what the setting used to be. The comment is reworded; settings.php contains no
occurrence of that token and uses PARAM_TEXT.

## 13.82 (2026-08-23)

**Site ID could no longer be saved  -  regression, and it blocked the whole settings page.**

During the coding-standards pass the Site ID setting was tightened from the baseline default
(PARAM_RAW) to PARAM_ALPHANUMEXT. That type strips dots, and a Site ID is commonly the site's own
domain, so `moodle.example.com` was rejected as "This value is not valid".

Moodle validates every field on a settings page before saving any of them, so this one field
blocked saving ANY Content Creator setting  -  voice options, rate limits, everything. A site that
re-saved its settings page could also end up with the Site ID rejected, which would break
authentication to the AI service and make every vendor call fail.

Now PARAM_TEXT: dots and hyphens are accepted, tags are still stripped. The value is only
forwarded to the vendor and used in cache keys, and is never rendered as HTML. Audited the rest
of settings.php: Site ID was the only setting given a stricter type than the baseline.

## 13.81 (2026-08-23)

**Rate limits are now admin-configurable.** Site administration > Plugins > Activity modules >
Content Creator now exposes three ceilings: content generations per hour (default 60), other AI
requests per hour (default 200) and voiceovers per hour (default 100). Setting a value to 0
disables that limit.

Previously the ceilings were hard-coded, so an author who tripped one had no way to continue
except to wait out the sliding hour or have an administrator purge caches  -  and purging does not
reliably clear the counters on every cache backend. For a site doing bulk authoring, 60
generations an hour is genuinely restrictive. The defaults are unchanged, so nothing loosens
unless an administrator chooses it.

## 13.80 (2026-08-23)

**Rate limiting no longer locks authors out of their own work.** The four read-only GET endpoints
(credit balance, TGA unit lookup, TGA unit refresh, gallery browse) shared a single 200-per-hour
bucket with document uploads and AI calls. The credit balance is re-read by the UI on load and
after most actions, so ordinary authoring could drain the shared allowance and then fail a
document upload with "You have made too many AI requests in a short time" that the author had
done nothing to earn.

Read-only endpoints now use their own `vendorread` bucket at 600 per hour. They consume no
credits and cost the vendor nothing, so they can no longer starve the writes. The write bucket
is unchanged at 200 per hour, and the `generate` (60/hr) and `voice` (100/hr) buckets are
untouched.

Note for operators: these counters live in the `mod_contentcreator/ratelimit` application cache.
If a limit is ever tripped, Site administration > Development > Purge all caches clears it
immediately; otherwise the sliding window frees up over the following hour.

## 13.79 (2026-08-23)

**Card title size, fixed permanently in source.** `.cc5-player .cc5-unified-title` is the ONLY
rule in the plugin that sets the card title size  -  one declaration, no media-query override.

Root cause of the repeated regression: that rule read `font-size: 1.18rem` in the v13.65 baseline
and was never changed in version control  -  `git log --all -S"1.18rem" -- styles/player5.css`
returns the baseline commit and nothing else. Every time the heading was enlarged it was edited
outside the packaged source, so the next install shipped 1.18rem again and overwrote it. Nothing
was reverting the fix; the larger value had never existed in the source being packaged.

Now `clamp(1.3rem, 1.05rem + 0.7vw, 1.6rem)`  -  about 21px on a phone, 26px on a wide desktop  -
with a comment in the file recording why it must stay there. Any future ZIP carries it.

The small uppercase eyebrow labels ("Result", "Knowledge", "Pro Tip") were reviewed at the same
time and deliberately left alone; they are meant to be small.

**PHP coding standards.** 11 inline comments capitalised for `moodle.Commenting.InlineComment`.
0 errors remain. The 35 remaining warnings are all `// pipeline-ignore:` markers, which are
deliberately lowercase because the release pipeline matches that exact token to grant the
PARAM_RAW exemptions  -  capitalising them would score a clean run and break the pipeline.

## 13.78 (2026-08-23)

Version bump only; identical code to 13.77. Issued because a separate 13.77 build exists, and
two different packages sharing one release number is what the release pipeline refuses on upload.

## 13.77 (2026-08-23)

Two fixes, both found by inspecting live generation output from moodle.cbplugins.com.

**Ungrammatical card text.** BANNED_PHRASE_RULES in generator.js rewrote `to ensure` to `so you`
as a blanket swap. That only reads correctly when a subject and verb follow, so every noun phrase
after it broke:

    "Confirm the main points to ensure a mutual understanding."
      ->  "...so you a mutual understanding."
    "Reflect back what you heard to ensure accuracy."
      ->  "...so you accuracy."
    "Listen attentively to ensure they feel heard."
      ->  "...so you they feel heard."

`to prevent` -> `so you don't` and `to avoid` -> `so you don't` had the identical defect
("to prevent accidents" -> "so you don't accidents"). The `so you <adjective>` repair regexes in
builder.js and cc-state.js were band-aids over this rule rather than a fix, and are left in place
as they are now inert. Each replacement is grammatical in every position it can match:

    to ensure that X    ->  to make sure X
    to ensure <subject> ->  so <subject>
    to ensure <noun>    ->  to keep <noun>
    to prevent          ->  to stop
    to minimise         ->  to cut down

`to avoid` and `to reduce` are already plain English and are no longer rewritten. The raw API
response was confirmed clean, containing `ensure` 13 times with no corruption, so the mangling
was entirely plugin-side.

**"[object Object]" in every text-assembly path.** Card content arrays arrive as EITHER plain
strings or objects depending on what the vendor API returns for that field on that run. 17 sites
joined or concatenated those arrays straight into text and would emit `[object Object]` on the
object shape:

  enterprise_qa.js    12 sites  keyPoints, standardItems, cognitiveConsiderations,
                                analysisPrompts, consequences, optimisationTips, keyIndicators
  prompts.js           4 sites  topic.keyPoints joined into four prompt builders  -  corrupted
                                text here is fed back to the model as context
  scorm.exporter.js    1 site   keyPoints joined into exported SCORM narration

Fixed with two shared helpers, `ccEntryText()` and `ccTextList()`, which flatten string,
{title,text}, {error,consequence}, {step,detail} and {term,definition} entries to readable text
and pass plain strings through untouched. Safe whichever shape the API sends.

## 13.74 (2026-08-23)

Release-number bump only; identical code to 13.73. The numeric version stays 2026082300, which
clears the 2026082100 already promoted, and the release string now matches the ZIP filename so
the pipeline's filename/release consistency check passes.

## 13.73 (2026-08-19)

Fixes "AI generation failed" cards on every route. This was a 100% failure rate.

The card validity gate in generator.js required a top-level `title` on EVERY generated card.
The prompt builders in prompts.js only ask the model for one on a minority of card types:

  VET / Workplace / PD  ->  card 6 only (competency-summary)
  University            ->  cards 5 and 6 only (case-study-1, case-study-2)

On every other card type, `title` is specified to the model as a field of a NESTED object
(sceneParts[]{title,...}, conceptInsights[]{title,...}) and never on the card itself. The model
returned exactly what it was asked for, and the validator then flagged "missing title" on 6 of
7 cards. Six issues on the first attempt and six again on the repair pass meant the gate could
never pass, so generateFiveCardSequence() always fell through to getFailedCardSequence() and
every section rendered placeholder cards reading "AI generation failed for ..." — while
consuming full generation credits.

Verified against the real card payload returned by the live API for a generation job: the gate
rejected it with 6 issues before this change and accepts it after, while still correctly
rejecting a competency-summary that genuinely has no title.

Present since at least 13.65. Same class of drift as FIX-CC-ROUTE-CARDCOUNT (v13.65, expected
card count) and v11.79 (voiceover field name) — the validator asserting something the prompt
never asked for.

## 13.72 (2026-08-19)

Version bump. No functional change from 13.71.

## 13.71 (2026-08-19)

Fixes document and PDF upload in the Workplace route.

Uploading or dragging a document failed with a PDF.js error from the AI service:
"getDocument - no `url` parameter provided". The service was receiving the request but could
not find the file, so its PDF parser was handed nothing.

Cause: the proxy added siteId and apiKey to every request. Seven endpoints are unauthenticated
and were never sent credentials by the browser in 13.65 -- for the multipart uploads that meant
extra form fields alongside the file, changing the request the service's upload parser sees.

Every endpoint's credential placement has now been checked against the v13.65 browser code,
call site by call site, and corrected to match exactly:

- suggest-context-workplace, suggest-topics, suggest-workplace-topics, extract-document,
  tga parse-text and tga upload-pdf send no credentials at all, as before.
- export-mapping-excel sends the key in an X-API-Key header, not in the body.
- The rest were already correct: credits (siteId in the query, key in the header),
  the legacy suggest-topics alias and generate-slide-image (body), gallery browse (query),
  gallery use and contribute (body), and upload-slide-image (multipart fields).

Verified against a local receiver: the document upload request is now multipart carrying only
the file field, exactly as 13.65 sent it.

## 13.70 (2026-08-19)

Restores the styling that 13.66-13.69 broke. All four stylesheets are now byte-identical to
13.65 apart from three deliberate changes, listed below.

- Stylesheet load order is restored to tokens -> builder -> cards -> player5. 13.66 folded
  cards.css into an earlier file, which moved it BEFORE builder.css. Dozens of declarations
  are ties on specificity between those two sheets and cards.css is meant to win them, so the
  reorder silently inverted 63 declarations - icon sizes (24px became 56px), header alignment,
  title sizes and weights, and several paddings. cards.css is a separate sheet again and
  loads after builder.css, exactly as it did in 13.65.
- All 2,354 !important declarations are restored. 13.66 removed 2,195 of them and replaced
  them with repeated-class specificity hacks. That verification only compared the plugin's
  own rules against each other, not against Bootstrap and Boost, whose utility classes carry
  !important and therefore win against a non-important rule at any specificity.
- Stylesheets are no longer served through a top-level styles.css. Moodle folds that file into
  the theme's aggregated stylesheet, which is cached under $CFG->themerev and is not rebuilt
  when a plugin is upgraded, so a site that upgraded without purging caches lost every design
  token and rendered as unstyled text.
- builder.css is loaded unconditionally again rather than being gated on a capability.

The three intentional differences from 13.65:

- Google Fonts are not loaded (removed for privacy; it sent every learner's IP to Google and
  broke on firewalled sites). Six font-family declarations now use complete system stacks.
- 19 custom properties that were referenced without a var() fallback but never declared are
  now defined as aliases of the tokens they were meant to be. Affected focus rings, error and
  success states and gradient headers, all of which previously rendered unstyled.
- The rule hiding Moodle's "Skip to main content" link is removed (WCAG 2.4.1). The link is
  visually hidden until focused, so there is no change for mouse users.

## 13.69 (2026-08-19)

Fixes "Expected object, received array" errors from the AI service.

- The vendor proxy decoded request payloads with json_decode($raw, true), which turns every
  empty JSON object into an empty PHP array; json_encode() then wrote it back as [] instead
  of {}. The service validates payloads against a strict schema, so any field that is an
  empty object was rejected -- most visibly context.taskEquipment, which is {} whenever no
  job tasks are selected, producing:
      "path": ["context","taskEquipment"], "message": "Expected object, received array"
  The proxy now decodes to objects, so the body the service receives is exactly what the
  browser built. This also protects coversMappings, which builder.js explicitly requires to
  be an object rather than an array. Regression introduced in 13.66 when vendor calls moved
  server-side.
- pregenerate_documents had the same defect when forwarding its documents and context
  payloads. Present since at least 13.65; fixed the same way.

## 13.68 (2026-08-19)

Fixes an unstyled Content Creator page after upgrade, plus two long-standing CSS defects.

- The design tokens no longer depend on the theme's aggregated stylesheet. They were
  moved into the plugin's top-level styles.css in 13.66, which Moodle folds into the
  theme aggregate. That aggregate is cached under $CFG->themerev and is NOT rebuilt when
  a plugin is upgraded, so a site that upgraded without purging caches kept serving an
  aggregate containing no tokens, while builder.css and player5.css updated normally via
  their ?ver= cache-buster. Those two sheets reference var(--cc*) around 3,800 times
  between them, so every colour, space, radius and border collapsed and the activity
  rendered as unstyled text. The token layer is now styles/tokens.css, loaded through the
  same channel and the same cache-buster as the sheets that consume it. This also keeps
  57 KB off every other page of the site.
- Defined 18 custom properties that were referenced without a var() fallback but never
  declared, so the declarations using them were silently dropped by the browser and those
  elements rendered unstyled. Present since at least 13.65. Each is now an alias of the
  token it was meant to be, so dark mode follows automatically.
- Removed the rule that hid Moodle's "Skip to main content" link on Content Creator
  pages. It was a WCAG 2.4.1 (Bypass Blocks) failure.

## 13.67 (2026-08-19)

Version bump only. No functional change from 13.66, which is the build that
passed the release pipeline.

## 13.66 (2026-08-18)

Passed the LMS-Labs plugin release pipeline.

Security
- The site API key is no longer sent to the browser. All vendor traffic is proxied
  server-side through ajax.php against a 16-entry endpoint allowlist; the client
  names an allowlist key and can never choose a host, path or credential.
- require_login($cm->course, false, $cm) added to all 13 AJAX actions that resolve
  a course module.
- get_site_gallery no longer returns data from every activity on the site.
- Rate limiting added for credit-consuming and vendor-facing requests.
- Exception detail is no longer returned to the client.

Correctness
- Fixed a fatal in index.php: core\event\course_module_instance_list_viewed is
  abstract and needs a plugin subclass.
- Added the cmid foreign keys on upgrade, so upgraded sites match fresh installs.
- Restored the generate-slide-image vendor route and its original payload shape.
- Aligned the upload proxy with the vendor contract: correct multipart field names,
  per-route size caps, GIF support, and pass-through of the provider's own errors.

Privacy and data
- contentcreator_checklist is now covered by the Privacy API and deleted with the
  instance and on course reset.
- Backup and restore now carry checklist rows and voiceover files, with the file
  itemid remapped to the new course module.
- Course reset support added.

Compliance and tooling
- Moodle coding standard: 3,877 errors and 826 warnings to zero.
- Real AMD build pipeline (package.json, Gruntfile.js); amd/build regenerated with
  Babel and Terser.
- Google Fonts removed; Lucide declared in thirdpartylibs.xml; development
  artefacts removed from the package. extracted from version.php header (v13.65)


Content Creator v12.77

v12.77: FIX-CC-MULTILANG-SECONDARY-PASSES — Punjabi (pa-IN) and other non-English
  additional-language cards were generated correctly in Pass 1 but then silently
  reverted to English by the server-side secondary passes (Pass 2 expansion,
  Pass 3 banned-word rewrite, Micro-expansion) in server/routes.ts.
  Root cause: these passes used hard-coded English system prompts with no language
  instruction. ccCheckWordFloors() fired on Gurmukhi content (non-English text can
  have different word-count distributions than the English-calibrated floors), which
  triggered Pass 2. The expansion system prompt said "Write in plain, direct language"
  — OpenAI interpreted this as English and rewrote every flagged field into English.
  diag.php Section 6 then found ZERO Gurmukhi characters and reported a FAIL.
  Fix: server/routes.ts now extracts the target language name from the incoming
  systemPrompt ("Generate ALL content in <Language>. This is NON-NEGOTIABLE") and
  injects a ⚠️ MANDATORY LANGUAGE REQUIREMENT guard into all four secondary pass
  system prompts: expansionSystemPrompt (Pass 2), rewriteSystemPrompt (Pass 3
  field-level), fallbackSystemPrompt (Pass 3 full-object fallback), and
  microSystemPrompt (Micro-expansion). Additionally, the deterministic English
  word substitution step (ccDeterministicClean) is now skipped for non-English
  content — the English regex patterns cannot match Gurmukhi/Devanagari/CJK
  script but skipping explicitly prevents any edge-case interaction with
  English-borrowed words in bilingual content. Server-side fix only — no AMD,
  PHP, CSS, or DB schema changes. version.php → 2026050900277.

v12.74: FIX-CC-DIAG-SLIDES — "Slides per topic" in diag.php Section 3 was a
  FALSE FAIL for all v12+ card-based activities (VET, Workplace, University, PD).
  Root cause: the check read topic['slides'] only. The v12+ manifest format stores
  content as topic.sections[].cards[], not as topic.slides[]. Every card-based
  activity therefore scored 0 slides → FAIL even when fully generated.
  Fix: check renamed "Content per topic". Logic now inspects BOTH topic.slides[]
  (legacy format) AND topic.sections[].cards[] (v12+ card format). A topic is
  "populated" if either: (a) slides[] is non-empty, or (b) at least one section
  contains at least one card. PASS detail message now identifies which format was
  found and reports total sections + cards for card-based topics.
  PHP: diag.php Section 3 (lines ~156-215). No AMD, CSS, or DB changes.
  version.php → 2026050900274.

v12.73: FIX-CC-DIAG-VOICEOVER — Voiceover language verification hardened in diag.php
  Section 6. Replaced the generic PASS (URL exists + content passed) with a
  three-layer honest proof model with explicit confidence levels:
  Layer 1 — Content propagation (DEFINITIVE FAIL): TTS is fed the stored card text;
  if that text is English, the audio is English — no URL check can override this.
  Layer 2 — URL sectionid language extraction (DEFINITIVE PASS when present): parses
  voiceover_{sectionid}.ogg filename from each HTTPS voiceoverUrl; if the sectionid
  contains the expected language code (e.g. mlsec_hi-IN_2.ogg confirms Hindi), that
  is physical proof the file was stored for this language.
  Layer 3 — Synthesis fingerprint (STRONG SIGNAL): checks voiceoverSchemaVersion
  ('12.32' = current TTS pipeline) and voiceoverTextHash presence on each section;
  if both are present with a passing content script check → HIGH CONFIDENCE.
  Outputs: [CONFIRMED] = URL+script both pass; [HIGH CONFIDENCE — fingerprinted] =
  fingerprint+script; [MEDIUM CONFIDENCE] = fingerprint present but similarity-only
  content check; [WARN — low confidence] = old schema or missing hash. Old/missing
  schema or voiceoverTextHash → WARN with regeneration advice rather than false PASS.
  PHP: diag.php Section 6 (section gather loop + Check 3 block). No AMD, CSS, or DB.
  version.php → 2026050900274.

v12.72: FIX-CC-DIAG-LANG — Section 6 language checks hardened.
  (1) Unicode script detection (Method A) for 17 non-Latin scripts:
  Devanagari (hi), Gurmukhi (pa), Bengali (bn), Gujarati (gu), Tamil (ta),
  Telugu (te), Kannada (kn), Malayalam (ml), Arabic (ar/ur), Hebrew (he),
  Cyrillic (ru/uk), Thai (th), CJK (zh), Japanese (ja), Hangul (ko).
  Tests whether stored card text contains even one character from the expected
  script — a definitive FAIL if not. No HTTP requests. cc_script_map added.
  (2) Broad 800-char multi-card sampling via new cc_diag_collect_card_text()
  helper — collects text from ALL cards/sections (not just first card).
  (3) Critical voiceover fix: if content_is_english=true (script FAIL or
  similarity>85%), voiceover is now FAIL — "TTS synthesised English words,
  audio plays in English regardless of voice code". Previously emitted false
  PASS whenever URLs existed; a URL proves only audio was synthesised, not
  that it is in the correct language. Genuine PASS now requires URLs present
  AND content language check passed.
  PHP: diag.php Section 6. No AMD, CSS, or DB schema changes.
  version.php → 2026050900272.

v12.71: FIX-CC-REPAIR-LANG — Additional-language content generation fix.
  Root cause: all 4 repair system prompt builders (buildContentRepairSystemPrompt,
  buildUniversityContentRepairSystemPrompt, buildWorkplaceContentRepairSystemPrompt,
  buildPDContentRepairSystemPrompt in prompts.js) accepted a `context` parameter but
  never called getLanguageInstructions(). When attempt 1 produced valid-schema English
  content and the generator entered the attempt-2 repair path, the repair system prompt
  was entirely in English regardless of the target language. The AI repaired the English
  content into correctly-structured English, defeating the translation entirely. The
  repair user prompt correctly had the getLangPrefixForUserPrompt() prefix (added in
  v12.69), but the system prompt (which has higher authority with OpenAI) had no language
  requirement — so the AI ignored the user prompt language instruction.
  Additionally: generator.js cache key and getLanguageInstructions() call both used
  `context?.voiceLanguage || context?.language` — if voiceLanguage was ever set (the
  teacher's primary TTS setting, carried via Object.assign into the additional-language
  context), it would resolve to 'en-AU' and the English system prompt would be cached
  and reused for all subsequent topics in the Spanish/French/etc. batch. Fixed to
  `context?.language || context?.voiceLanguage` so the explicit content language always
  takes priority. Diag: Section 6 added — checks multiLanguage array structure, topic/
  section/card counts per language, translation quality (text similarity vs primary),
  and voiceover pre-generation status per language. FAIL raised when similarity > 85%
  (English content stored in a non-English language slot) so teachers can detect the
  exact failure and are told to regenerate.
  AMD: prompts.js (4 repair system prompts), generator.js (2 lines).
  PHP: diag.php (Section 6). No PHP functional, CSS, or DB schema changes.
  version.php → 2026050900271.

v12.70: ADD-CC-DIAG — Added diag.php diagnostic tool.
  Access at /mod/contentcreator/diag.php (config-only) or
  /mod/contentcreator/diag.php?cmid=<cmid> (activity-level checks).
  Checks: Site ID / API key config (via local_aiconfig or plugin settings),
  required DB tables, manifest JSON validity and structure (topics/slides),
  AMD build file presence and format (define() not ES6), and src-to-build
  file timestamp sync. Requires moodle/site:config capability. Read-only —
  no data is modified and no external requests are made.
  No PHP functional, AMD, CSS, or DB schema changes. version.php → 2026050800270.

v12.69: FIX-CC-MULTILANG-TEXT — AI was generating English card content for
  all additional-language topics because every user prompt sent to OpenAI
  was 100% English (topic titles, performance criteria, and up to 12,000
  chars of English reference material). The "write in Spanish" instruction
  only appeared as a footnote at the end of the system prompt; OpenAI
  models follow the user message language more strongly than a system-prompt
  footnote, so all additional-language cards came back in English. Downstream
  consequence: the Spanish/etc. TTS voice then synthesised English card text,
  producing Spanish-accented English audio — not Spanish.
  Fix: new getLangPrefixForUserPrompt(context) helper in prompts.js injects
  a hard-gated "!!MANDATORY LANGUAGE REQUIREMENT!!" block as the very first
  line of every user prompt when context.language is non-English, before any
  English context follows. The block names the target language explicitly,
  forbids any English output, and clarifies that English reference material
  is subject-matter context only. The prefix is wired into all 8 prompt
  builders: buildVetFiveCardUserPrompt, buildWorkplaceFiveCardUserPrompt,
  buildPDFiveCardUserPrompt, buildUniversityFiveCardUserPrompt, and the four
  matching repair prompts (attempt-2 retry path). English generations
  (en-AU, en-GB, etc.) return an empty prefix — zero change to existing
  behaviour. prompts.js version tag bumped to v12.69.
  AMD: prompts.js only. No PHP, CSS, or DB schema changes.
  version.php → 2026050400269.

v12.68: FIX-CC-MULTILANG-PERSIST + FIX-CC-MULTILANG-NAME-FALLBACK — Two
  additional-language fixes that together unblock Punjabi/Thai/etc. courses.
  (1) FIX-CC-MULTILANG-PERSIST (builder.js multi-language pregen loop): The
  loop stored each generated voiceover as a `data:audio/...;base64,...` URL on
  the section. saveManifestSilent's stripAudio() then deleted every data: URL
  on save (replaced with the 'pregenerated' sentinel) so the audio never
  reached the database. Primary-language audio recovers because a teacher
  reload triggers a re-persist via persistVoiceoverToFileStore on the player;
  additional languages had no such recovery, so students hit
  'INCOMPLETE VOICEOVERS - N section(s) not complete' on the player and
  could never play Punjabi/Thai audio. Fix: the multi-language pregen now
  POSTs each clip immediately to ajax.php?action=save_voiceover_file and
  stores the returned HTTPS URL on the section, marking voiceoverStatus
  'complete'. The HTTPS URL survives stripAudio cleanly and students get
  working audio.
  (2) FIX-CC-MULTILANG-NAME-FALLBACK (prompts.js getLanguageName): The
  LANGUAGE_NAMES map was missing pa-IN (Punjabi), cmn-TW (Mandarin
  Traditional), pt-PT (Portuguese Portugal) and is-IS (Icelandic) even though
  the builder UI offered them as checkboxes. The fallback returned
  'English (Australian)', so the LLM was literally instructed
  "Generate ALL content in English (Australian)" for those languages — that
  is why Punjabi-built courses came out in English. Fix: added the missing
  entries; getLanguageName now returns the raw code rather than silently
  falling back to English when the code is non-English-prefixed but unknown,
  and logs a console warning so future gaps surface immediately.
  No PHP, CSS, or DB schema changes. version.php → 2026050300268.

v12.67: FIX-CC-MULTILANG-PROGRESS + FIX-CC-MULTILANG-SENTINEL-RESTORE — Two
  additional-language voiceover correctness fixes.
  (1) FIX-CC-MULTILANG-PROGRESS (player5.js getVoiceoverProgress): The function
  did not count sections whose voiceoverUrl === 'pregenerated' (the sentinel) as
  "ready", creating an inconsistency with isVoiceoverGenerationPending() which
  already treated the sentinel as "audio available" (v12.62 fix). In the edge case
  where renderVoiceoverWaiting() was invoked with additional-language sections active,
  the progress bar showed "0 / N slides" and could not advance, appearing permanently
  stuck. Fix: add hasPregenerated = (s.voiceoverUrl === 'pregenerated') guard so
  getVoiceoverProgress() counts sentinel sections as ready, matching isVoiceoverGenerationPending().
  (2) FIX-CC-MULTILANG-SENTINEL-RESTORE (player5.js playVoiceover): The student
  on-demand fetch path (reached via _wasPregenerated bypass introduced in v12.63)
  called `delete section.voiceoverUrl` BEFORE the fetch, removing the sentinel from
  the in-memory manifest section object. If the fetch subsequently failed (server
  error, rate limit, network drop, 200s abort), section.voiceoverUrl remained
  undefined. On the next Play click _wasPregenerated evaluated to false (sentinel
  gone), the student billing guard fired, and the Listen button was permanently
  disabled for that section for the rest of the session — the student could not
  retry without a page reload. Fix: both the .then() error branch and the .catch()
  handler now restore the sentinel (`section.voiceoverUrl = 'pregenerated'`) when
  _wasPregenerated was true and the fetch failed without producing a cache entry.
  AMD: player5.js triple-match 80120e8b22fc1f375ccb725a172fb44f.
  No PHP, CSS, or DB schema changes. version.php → 2026043000267.

v12.66: FIX-CC-TTS-CACHE + FIX-CC-ML-LANG-CAPTURE (see $plugin->release comment).

v12.63: FIX-CC-MULTILANG-GATE + FIX-CC-MULTILANG-LANG + FIX-CC-MULTILANG-STUDENT-PLAY
  — Three additional-language player fixes shipped together.
  (1) FIX-CC-MULTILANG-GATE: allVoiceoversComplete() now treats 'pregenerated'
  sentinel as complete, so setActiveLang → preloadVoiceovers → checkComplete() no
  longer sets manifest.voiceoversComplete=false when switching to an additional
  language. The global gate in playVoiceover (line 12933) blocked ALL Listen clicks
  for the entire session once voiceoversComplete was flipped to false.
  (2) FIX-CC-MULTILANG-LANG: preloadVoiceovers() preloadOne() and playVoiceover()
  on-demand path both now send `language = activeLang || voiceLanguage` instead of
  always sending the primary voiceLanguage. Previously, additional-language sections
  (e.g. Vietnamese) had TTS synthesised in the primary language voice (e.g. en-AU),
  producing English audio for non-English text. PHP caches by sectionid so the wrong
  voice would replay forever until the section was regenerated.
  (3) FIX-CC-MULTILANG-STUDENT-PLAY: playVoiceover() now tracks _wasPregenerated
  (section.voiceoverUrl === 'pregenerated') and uses it to bypass the student billing
  guard. A pregenerated sentinel guarantees the teacher already produced audio in the
  PHP file store — calling generate_voice returns the cached URL at zero credit cost.
  Without this, students clicking Listen on an additional-language slide hit the
  billing guard, which permanently disabled the button. AMD: player5.js only.
  No PHP or DB changes. version.php → 2026043000263.

v12.62: FIX-CC-MULTILANG-WAIT-STUCK — isVoiceoverGenerationPending() now treats
  the 'pregenerated' sentinel as "audio available". For students, preloadVoiceovers()
  intentionally skips sentinel sections (on-demand fetch on Play click), so
  voiceoverCache is never populated for additional-language sections. Without this
  guard, switching to a non-primary language and then navigating back from a slide
  caused render() → isVoiceoverGenerationPending() to return true (no HTTPS URL,
  no cache) and render the "Preparing audio…" waiting screen indefinitely — preload
  never resolves it because it skips sentinel sections for students. Fix: added
  hasPregenerated = (s.voiceoverUrl === 'pregenerated') check; sentinel sections
  are treated as "not pending" so the topics grid is rendered instead.
  AMD: player5.js only. No PHP or DB changes. version.php → 2026043000262.

v12.55: MULTILANGUAGE STUDENT LANGUAGE SWITCHER — Teachers can now generate full
  slide content and pre-generated voiceovers for additional student languages (Arabic,
  Dutch, French, Vietnamese, etc.) during content creation. Builder UI: checkbox list
  in Voice Settings; each selected language generates a full translated manifest via
  ManifestBuilder.build() and pre-generates voiceovers via generate_voice. Manifest
  stored under generatedManifest.multiLanguage[]. Player: language switcher pill bar
  rendered in renderTopicsGrid() when multiLanguage entries exist; clicking a pill
  calls setActiveLang(code) which swaps manifest.topics to the selected language's
  topics, stashes primaryTopics for restore, sets this.activeLang, re-renders topics
  grid, and triggers preloadVoiceovers() for the new language's sections. Credit
  estimate in builder header updates as additional languages are selected.
  AMD: player5.js, builder.js. No PHP or DB schema changes. version.php → 2026043000255.

v12.49: BUG-CC-ZOMBIE-CHAIN — Clicking "Reset & retry audio" spun forever
  ("Regenerating 1 section…") and never completed. Root cause: a chain generation
  race. The auto-preload fires on page load → PHP returns 500 fast (CDN concurrent
  request rejection) → Promise microtask queues .catch(). User clicks Retry →
  button resets _preloadRetryCount → calls preloadVoiceovers() (new chain).
  Microseconds later the old chain's .catch() fires, sees _preRetry=0, and
  schedules a retry in 2s with _preloadScheduledRetry=true (v12.48 bypass flag).
  That 2s retry fires concurrently with the new chain's 10s POST-PRELOAD SWEEP →
  two concurrent PHP TTS curls for the same section → CDN HTTP 500 on both →
  infinite failure loop.
  Fix: Chain generation counter. Each preloadVoiceovers() call increments
  self._voiceoverChainGen and captures var _myChainGen. Every retry path
  (setTimeout callbacks, .catch() before scheduling a retry, preloadOne() at
  entry) checks _voiceoverChainGen !== _myChainGen — if stale, the zombie chain
  exits immediately, clears voiceoverLoading[section.id], and returns. The new
  chain's POST-PRELOAD SWEEP then picks up the section cleanly. Also adds a 30s
  follow-up sweep for the edge case where a slow in-flight PHP fetch (≤200s) was
  still blocking when the primary 10s sweep fired. AMD-only: player5.js.
  CC_VERSION 12.48 → 12.49. version.php → 2026041500249.

v12.48: BUG-CC-TTS-CONCURRENT — Voiceover failed to play after clicking "Regenerate
  voiceover" in behavioral settings. Two root causes:
  (1) RETRY DELAY WINDOW: preloadOne().catch() deleted voiceoverLoading[section.id]
      before the retry delay (2/4/6s). During that window voiceoverLoading was false,
      so generateSlideVoiceoverBulk() fired a second concurrent PHP curl for the same
      section while the first was still alive (CURLOPT_TIMEOUT=180s). CDN saw two
      concurrent long-running requests → HTTP 500 on both. Fix: voiceoverLoading stays
      true during retry delays; _preloadScheduledRetry flag lets the scheduled retry
      bypass the guard when it fires. generateSlideVoiceoverBulk() also checks/sets
      voiceoverLoading to block concurrent firing.
  (2) NO PHP MUTEX: Even across page reloads, a stale PHP process from a previous
      attempt could hold the CDN connection open. New PHP file lock per sectionid
      (LOCK_EX|LOCK_NB) returns {pending:true} instead of making a concurrent TTS
      call. JS preloadOne() treats pending as a temporary hold (not a failure) and
      retries in 10s without consuming retry budget. Lock released via shutdown function.
  JS changes: player5.js (preloadOne guard, .catch, .then pending handler,
  generateSlideVoiceoverBulk). PHP changes: ajax.php generate_voice mutex.
  CC_VERSION 12.47 → 12.48. version.php → 2026041500248.

v12.47: BUG-CC-RETRY-CONCURRENT — "Reset & retry audio" failed with "API error: 500"
  on every retry attempt. Root cause: aborting the browser fetch does NOT stop the
  PHP-FPM process — PHP remains blocked on curl_exec waiting for the TTS backend
  (CURLOPT_TIMEOUT=180s). Immediately restarting preloadVoiceovers() launched a new
  PHP process making a concurrent TTS curl to the same endpoint while the old one was
  still open. The deployment CDN rejected the second concurrent long-running request
  with HTTP 500, so all 3 retries failed instantly even though the backend itself
  returned 200. Fix: retry handler no longer aborts in-flight fetches — it only resets
  the retry counter (fresh 3-retry budget for the old chain). preloadVoiceovers() skips
  sections still in-flight (voiceoverLoading set), preventing concurrent TTS requests.
  CC_VERSION 12.47 → 12.48. AMD-only (player5.js + cc-state.js). version.php → 2026041500248.

v12.43: BUG-CC-TIMEOUT-RACE — Two root-cause bugs fixed for "Reset & retry audio" failure:
  (1) CLIENT TIMEOUT TOO SHORT: Server logs confirmed 4-chunk en-AU-Chirp3-HD-Aoede
      voiceovers take 143-153s (POST /api/moodle/content-creator/tts 200 in 150429ms).
      The client's AbortController fired at 120s, killing the connection before the
      server could deliver the response. Every attempt appeared as a timeout even though
      the server succeeded. Fix: preload + on-demand AbortController raised 120s → 200s.
      Wait-poll raised 150s → 230s (always 30s beyond the abort to avoid final-chunk race).
  (2) RACE-CONDITION: In the preloadOne().catch() handler, delete voiceoverLoading[id]
      ran unconditionally BEFORE the _preloadAbortedByUser check. The retry handler calls
      preloadVoiceovers() synchronously, which sets voiceoverLoading=true for the new chain.
      The old chain's .catch() microtask fires after, deleting that lock. The POST-PRELOAD
      SWEEP then sees loading=false and launches a duplicate concurrent fetch — two competing
      requests for the same section causing 429 rate-limit cascades. Fix: moved
      delete voiceoverLoading[id] to after the user-abort exit path so the new chain
      retains ownership of its loading lock. AMD-only: player5.js + cc-state.js.
      CC_VERSION 12.42 → 12.43. No CSS, PHP, or DB changes. version.php → 2026041500243.

v12.41: BUG-CC-SOFT-FAIL — Audio generation API sometimes responds with success=false
  or missing audioContent (e.g. rate limit, quota, transient server error). Previously
  this fell through silently: voiceoverPreloadStatus.loaded++ was called with no cache
  set and no status update — the section stayed 'pending', refreshTopicCardVoiceoverState
  was never called, and the waiting screen was stuck at N-1/N forever. The 'Reset & retry
  audio' button re-triggered the same soft failure and appeared to do nothing. Fix: add
  else-throw after if(data.success && data.audioContent) so .catch routes soft failures
  through the standard 3-retry mechanism. After exhausting retries, voiceoverStatus='failed'
  and refreshTopicCardVoiceoverState transitions the screen. Also added visual feedback:
  title changes to 'Retrying audio' and subtitle updates when retry button is clicked,
  with double-click guard. CC_VERSION bumped 12.38→12.41. No CSS, PHP, or DB changes.
  version.php → 2026041500241.

v12.40: VERSION-BUMP — Forced version increment to ensure Moodle detects upgrade over any cached v12.39 install. No code changes beyond v12.39. version.php → 2026041500240.

v12.39: BUILD-SYNC — AMD build files (player5.js, player5.min.js, cc-state.js,
  cc-state.min.js) were not updated when v12.36→v12.38 source fixes were applied.
  Moodle runs amd/build/ files, not amd/src/, so all fixes since v12.36 were
  silently ignored in the installed plugin. This release re-syncs all four build
  files with their sources and bumps CC_VERSION '12.36' → '12.38' in cc-state.js
  so console logs correctly identify the running version. No new functional changes
  beyond v12.38. No CSS, PHP, or DB changes. version.php → 2026041500239.

v12.38: BUG-CC-RETRY-NARROW — "Reset & retry audio" button did nothing when the
  failing section was mid-retry (attempt 1 or 2 of 3, not yet 'failed'). Three bugs:
  (1) Condition too narrow: handler only cleared s.voiceoverStatus==='failed'; sections
      still in the retry loop had voiceoverStatus=undefined and were skipped.
  (2) _preloadRetryCount not cleared: mid-retry sections kept their counter (e.g. 2),
      so the fresh preload only got 1 attempt before being marked failed again.
  (3) voiceoverLoading not cleared: if the 120s fetch was still in-flight, the new
      preloadVoiceovers() saw voiceoverLoading[id]=true and skipped the section entirely.
  Fix: retry handler now clears ALL sections lacking complete audio (failed, mid-retry,
  or stuck), deleting voiceoverStatus, voiceoverUrl, _preloadRetryCount, and
  voiceoverLoading[id] so the fresh preload starts with a full 3-retry budget and
  no locks. AMD-only (player5.js). No CSS, PHP, or DB changes.
  version.php → 2026041500238.

v12.37: UX-CC-BYPASS-HOVER — "Continue without audio" hover style fix.
  On hover the button now shows white text on the primary colour background
  (matching the retry button style) instead of darkening plain text over a
  transparent background, which was hard to read. CSS-only change (player5.css).
  No AMD, PHP, or DB changes. version.php → 2026041500237.

v12.36: VOICEOVER WAITING SCREEN BUG FIXES + BYPASS BUTTONS —
  (1) BUG-CC-WAIT-STUCK-FAILED-GATE: isVoiceoverGenerationPending() did not skip
      sections with voiceoverStatus='failed', so a permanently-failed slide locked
      the gate indefinitely and students saw "Preparing audio... 5/6 slides" forever.
      Fixed by adding voiceoverStatus==='failed' guard in isVoiceoverGenerationPending()
      and getVoiceoverProgress() (failed sections count as ready so bar reaches 100%).
  (2) BUG-CC-WAIT-STUCK-NO-REFRESH: After exhausting 3 preload retries the catch handler
      set voiceoverStatus='failed' but never called refreshTopicCardVoiceoverState(),
      so the waiting screen was never told to re-evaluate and stayed at N-1/N slides.
      Fixed by calling refreshTopicCardVoiceoverState(section.id) after exhausted retries.
  (3) UX-CC-WAIT-BYPASS-BUTTON: No escape hatch when audio generation stalled.
      Added "Continue without audio" link (always visible) that bypasses the wait and
      transitions to the topics page. Teachers/canEdit also get a "Reset & retry audio"
      button that clears failed status on all failed sections and re-queues them via
      preloadVoiceovers() without a page reload. CSS in player5.css.
  AMD: player5.js, cc-state.js (CC_VERSION 12.32→12.36). No DB changes.
  version.php → 2026041500236.

v12.34: IMAGE QUALITY UPGRADE (IMG-QUALITY-UPGRADE) —
  Three improvements to all AI-generated images in the Content Creator:
  (1) Quiz image Gemini prompt-writer: strengthened rule 7 to prohibit
  duplicate/cloned faces (at most 1–2 distinct people, never the same
  person twice); replaced the weak "no text overlays" rule with a hard
  CRITICAL NO-TEXT rule (zero letters, numbers, labels, or signs — omit
  diagram labels entirely). Added rule 10: no blurry or low-resolution
  elements. (2) Slide image prompt (both VET/Workplace and University
  routes): added a shared CRITICAL block after the existing TEXT-FREE
  block — every person must be visually distinct, no cloned faces, limit
  1–4 realistic people, no mirrored/repeated figures. (3) Image pipeline:
  OpenAI gpt-image-1 fallback quality raised 'medium'→'high'; shared
  optimizeImageBuffer pipeline raised max-width 1200→1536 and JPEG
  quality 85→92 for sharper output. Server-side only (routes.ts). No AMD,
  PHP, or DB schema changes. version.php → 2026040700234.

v12.33: DECISION-POINT ANSWER SHUFFLE (FIX-DP-SHUFFLE) —
  The correct answer in the multiple-choice decision-point activity (Activity 1)
  was always rendered as Option B because the AI consistently assigns correct:true
  to the second option in the JSON it generates. Fix: cc-card-slots.js now shuffles
  the options array with a Fisher-Yates shuffle before rendering — in both
  renderDecisionPoint (standalone scenario view) and renderDecisionChallenge
  (3-activity challenge panel). The shuffle operates on a shallow copy so the
  original manifest data is never mutated. The data-correct attribute on each
  rendered option is still derived from opt.correct, so the correct answer is
  always honoured regardless of which letter it lands on. AMD: cc-card-slots.js
  triple-matched (src/build/min). No PHP or DB schema changes.
  version.php → 2026040700233.

v12.32: VOICEOVER VET/WORKPLACE/UNIVERSITY TRUNCATION FIX (BUG-VO-VET-TRUNCATION) —
  Voiceover still stopped mid-narration on Vocational, Workplace, and University
  routes after the v12.31 PD fix. Root cause (two-part):
  (1) v12.31 raised the PHP char limit from 8000 → 12000 (for PD) but did NOT bump
  VOICEOVER_SCHEMA_VERSION. Any VET/Workplace/University voiceover stored at schema
  '12.30' under the old 8000-char limit passed the staleness check unchanged
  (preStoredSchema === VOICEOVER_SCHEMA_VERSION = '12.30'), so the truncated audio
  was never regenerated.
  (2) 12000 chars was still too low for older VET/Workplace/University content: old
  manifests produced before padVoiceoverSmart was introduced can have 200–300-word
  prose per card in voiceoverText PLUS long structural field extraction (sceneParts
  2-sentence texts, conceptInsights 2-3 sentences, mental-model detail 2-3 sentences,
  mistakes consequence 15+ words × 5, goodItems/badItems 10+ words × 10). Combined
  narration text regularly reaches 13000–16000 chars for these older sections.
  Fix 1 (ajax.php): char limit raised from 12000 → 20000. At 20000 chars = 4–5 TTS
  chunks (4800 bytes each) ≈ 60–75s synthesis, well inside the 120s AbortController.
  Fix 2 (cc-state.js): VOICEOVER_SCHEMA_VERSION bumped '12.30' → '12.32'. All stored
  voiceovers across ALL routes (Vocational, Workplace, University, PD) are detected as
  stale and automatically regenerated at the new 20000-char limit when a teacher opens
  any activity in edit mode. Students receive corrected full-length audio immediately
  after the teacher's first open saves back the new voiceoverUrl.
  AMD changes: cc-state.js only — triple-matched (src/build/min), MD5 7c7eff2aeea24ac17b7f73d0011d62a7.
  No DB or PHP schema changes. version.php → 2026040600232.

v12.31: VOICEOVER PD TRUNCATION FIX (BUG-VO-PD-TRUNCATION) —
  Voiceover stopped at card 4 or 5 in PD (Professional Development) courses only.
  Root cause: ajax.php capped voiceover text at 8000 chars. PD courses use long
  prose voiceoverText per card (200–300 words, ~1400 chars each). At 7 cards ×
  250 words × 5.5 chars/word ≈ 9625 chars — above the limit. The sentence-boundary
  trim landed mid-way through card 5 (mistakes) or occasionally card 4 (applied-
  scenario), truncating the audio. VET/Workplace routes weren't affected because
  they use shorter structural field extraction (sceneParts, conceptInsights, steps)
  producing ~5000–7000 chars total.
  Fix: ajax.php char limit raised from 8000 → 12000. At 12000 chars = 3 TTS chunks
  (4800-byte each) = 45–60s synthesis, well within the JS AbortController (120s).
  PHP change only (ajax.php). No AMD, DB, or PHP schema changes.
  version.php → 2026040400231.

v12.30: VOICEOVER COMPETENCY-SUMMARY HEADING FIX (BUG-VO-COMPETENCY-HEADING) —
  Two voiceover sub-heading bugs on the competency-summary card:
  (1) "What Good Looks Like" heading not voiced: early-return in cc-state.js consumed
  AI-generated voiceoverText (which omits sub-headings) instead of the structured
  goodItems/badItems path. Fix: early-return now skipped for competency-summary when
  goodItems or badItems are populated — structured branch always voices "What good
  looks like." / "What to avoid." sub-headings.
  (2) "Watch out for" voiced instead of "What to Avoid": same root cause. AI-generated
  voiceoverText used the phrase "Watch out for" as a transition; early-return fix
  ensures canonical heading text is always used.
  (3) player5.js patchMissingCardVoiceoverTexts: inserts correct sub-headings into
  card.voiceoverText so all downstream readers (hash checks, edit modal) are consistent.
  (4) VOICEOVER_SCHEMA_VERSION bumped '12.29'→'12.30': forces re-generation of all
  stored voiceovers with wrong headings when teacher opens any activity.
  (5) generator.js CC_VERSION corrected '12.28'→'12.30'.
  AMD files changed: cc-state.js, player5.js, generator.js (all triple-matched).
  No PHP or DB schema changes. version.php → 2026040200230.

v12.29: VOICEOVER TRUNCATION FIX (BUG-VO-TRUNCATION) — Voiceover stopped halfway
  through card 4 (applied-scenario) in all routes (vocational, workplace, PD).
  Root cause: ajax.php capped voiceover text at 4000 chars before sending to the
  TTS API. Real 7-card VET sections routinely produce 5000–7000 chars of narration
  text (100–200 words per card × 5 chars + structural field extraction for sceneParts,
  conceptInsights, steps, items). The sentence-boundary trim landed mid-way through
  card 4, generating truncated audio that played correctly up to card 4 then cut off.
  Fix 1 (ajax.php): Raised char limit from 4000 to 8000. The SaaS TTS endpoint already
  handles chunking (4800-byte chunks, WAV concat, OGG encode) and the JS AbortController
  is 120s — 8000 chars (~2 TTS chunks) completes in 30–45s, well inside the timeout.
  Fix 2 (cc-state.js): Bumped VOICEOVER_SCHEMA_VERSION from '11.37' to '12.29'. Any
  stored voiceover stamped with an older schema version is detected as stale and
  regenerated when a teacher opens the activity in edit mode. Students receive corrected
  full-length audio as soon as the teacher's first open saves back the new voiceoverUrl.
  Files: ajax.php, amd/src/cc-state.js, amd/build/cc-state.js, amd/build/cc-state.min.js.
  PHP change only (no DB schema change). version.php → 2026040200229.

v12.22: VOICEOVER COMPETENCY-SUMMARY FALLBACK FIX (BUG-VO-COMPETENCY-FALLBACK) +
  DECISION-POINT WORD-FLOOR EXCLUSION (BUG-VO-DP-WORDFLOOR) — Two critical voiceover
  bugs fixed:
  (1) BUG-VO-COMPETENCY-FALLBACK (cc-state.js): In buildVoiceoverText, the competency-
  summary branch unconditionally pushed "Now, complete the activity below." before the
  outer _7parts.length <= 1 fallback check. This made _7parts.length = 2, bypassing
  card.voiceoverText for sections where goodItems and badItems are both absent (common
  in PD/non-VET courses built from the ChatGPT template). Card 6 produced only the
  heading + CTA (~3s audio) instead of full narration, making voiceover appear to stop
  at card 4-5. Fix: check _7parts.length <= 1 && card.voiceoverText BEFORE the CTA
  push, inside the competency-summary branch.
  (2) BUG-VO-DP-WORDFLOOR (routes.ts/server): ccCheckWordFloors incorrectly applied
  the 60-word voiceoverText minimum to decision-point cards, which intentionally have
  empty voiceoverText (buildVoiceoverText explicitly clears _7parts for them). This
  triggered spurious repair passes visible as 0w→38w→0w→54w oscillation in logs.
  Fix: exclude card.cardType === 'decision-point' from the 60-word check.
  (3) player5.js patchMissingCardVoiceoverTexts: removed the mirrored CTA push for
  competency-summary (was included to mirror the old unconditional cc-state.js CTA).
  Now cc-state.js handles the CTA exclusively to prevent double "Now, complete..." when
  the new voiceoverText fallback path uses patched content.
  Files: amd/src/cc-state.js, amd/build/cc-state.js, amd/build/cc-state.min.js,
         amd/src/player5.js, amd/build/player5.js, amd/build/player5.min.js.
  cc-state.js AMD triple-match MD5: e472b3e3b74f3eeadc1e43417e3ca584.
  player5.js AMD triple-match MD5: 4595ef7323dd7e055576c7abb858e89c.
  No PHP or DB changes. version.php → 2026033102200.

v12.07: EDIT MODAL ICON PRE-POPULATION FIX — icon pickers in the Edit Slide modal
  previously showed an empty field for any scenario/mistake part that had no
  explicitly stored icon (i.e. item.icon === ''). The rendered card showed the
  pool-default icon (step 1 of resolveScenePartIcon) while the modal showed nothing,
  creating a visible mismatch that made teachers think their icon saves were being
  silently discarded. Fix: all four renderIconPickerInput call-sites in the modal now
  compute the resolved display icon first — calling resolveScenePartIcon('', title,
  text, idx, cardType, new Set()) as a fallback — and pass the result as currentVal.
  Four locations patched: (1) mistakes single-section path, (2) mistakes multi-card
  accordion path, (3) hook/applied-scenario single-section sceneParts path,
  (4) hook/applied-scenario multi-card accordion sceneParts path. Side-effect: when
  a teacher saves without changing an icon the resolved default is now written
  explicitly into item.icon / part.icon, so step 0 (honour stored icon) honours it
  on every subsequent render and the pool-default logic never fires again for that
  item. player5.js only. AMD triple-match MD5: b9f0897bf75e35fd6d03e5ecb8a01470.
  No PHP or DB changes. version.php → 2026033002007.

v12.06: SCENARIO CARD ICON — STRICT POSITIONAL DEFAULT — removed semantic content
  analysis from the fallback path for cards with a defined icon pool. Previously,
  resolveScenePartIcon() ran a regex-based semantic scan (step 1) before checking
  the card-type pool (step 2), so keyword matches on part titles/text ("setting",
  "job", "challenge", etc.) would override the pool, producing inconsistent icons
  on different modules even though the pool had been carefully chosen. New behaviour:
  after step 0 (honour stored icon), step 1 now does a strict positional lookup —
  part 0 always gets pool[0], part 1 always gets pool[1], etc. — with no content
  analysis. hook-scenario always shows: map-pin / users / message-circle / flame.
  applied-scenario always shows: briefcase / target / brain / check-circle.
  Semantic analysis is kept as step 2 for card types with no defined pool.
  cc-icons.js only. AMD triple-match MD5: 4e4779c29175a5f8715a0cf90a9f50ed.
  No PHP or DB changes. version.php → 2026033002006.

v12.05: SCENARIO CARD DEFAULT ICON FIX — the fallback icon pool for hook-scenario
  and applied-scenario parts was nonsensical. hook-scenario used zap (lightning) for
  "What Happened" and alert-triangle (danger warning) for "The Pressure"; applied-
  scenario used map-pin (location) for "Back on the Job", users (people) for "The New
  Challenge", wrench (tools) for "The Decision Moment", and alert-triangle for "The
  Right Move". Replaced with semantically appropriate defaults: hook-scenario parts
  now use map-pin / users / message-circle / flame (location → people → event trigger
  → urgency/pressure); applied-scenario parts now use briefcase / target / brain /
  check-circle (workplace → goal/challenge → thinking it through → correct action).
  These defaults only fire when a part has no stored icon (e.g. AI-generated content
  or newly created sections). Teacher-set icons (step 0 since v12.04) are always
  honoured first. cc-icons.js only. AMD triple-match MD5:
  42285302c80ad3be326a085b85d4ff22. No PHP or DB changes. version.php → 2026033002005.

v12.04: SCENE-PART ICON HONOUR FIX — teacher-set icons on hook-scenario (card 1)
  and applied-scenario (card 4) were visually ignored on every render even though
  v12.03 correctly saves them to the DB. Root cause: resolveScenePartIcon() in
  cc-icons.js evaluated the stored part.icon only at step 3, after (1) a strong
  semantic/contextual match on the part title + text and (2) a card-type icon pool
  scan. Step 1 almost always succeeds, so the teacher's chosen icon was thrown away
  every time. Fix: added step 0 — if aiIcon (the stored/teacher-selected icon name)
  is a valid Lucide icon, it is returned immediately before any semantic analysis or
  pool cycling. Steps 1-5 still run as fallbacks when no icon is stored (AI-generated
  content or legacy sections). cc-icons.js only. AMD triple-match MD5:
  1bd0a0690e26c44e7db6ceb9dd82c14d. No PHP or DB changes. version.php → 2026033002004.

v12.03: SCENARIO CARDS ICON SAVE FIX — hook-scenario (card 1) and applied-
  scenario (card 4) were not saving icon changes made in the Edit Slide modal.
  Root cause: the single-section edit modal render always showed the legacy
  flat beats editor (splitting section.content into sentences) regardless of
  whether the section had a structured sceneParts[] array with icons. Because
  the icon-picker rows were never rendered, the icons could not be changed.
  The save path only read flat cc5-edit-beat-item textareas and wrote to
  cardData.content, discarding any sceneParts[] with icons entirely.
  Fix: (1) render — if section.sceneParts && section.sceneParts.length, the
  modal now shows the structured scene-parts editor with title, text, and
  icon picker per part (same as the multi-card path); flat beats editor is
  kept as a legacy fallback for sections without sceneParts[]. (2) save —
  single-section save now checks for cc5-edit-scene-part-item rows first;
  if found, collects {icon, title, text} into cardData.sceneParts; otherwise
  falls back to the flat beats join into cardData.content. player5.js only.
  AMD triple-match MD5: bc9c72dbb99b0e05234ee711152ee5f4. No PHP or DB changes.
  version.php → 2026033002003.

v12.02: MISTAKES CARD ICON PICKER — The Edit Slide modal for the mistakes
  card (card 5 "Watch Out For") now includes a full icon picker on each
  mistake item row (text input + Browse button), matching the existing
  behaviour of hook-scenario, applied-scenario, and mental-model cards.
  Previously the icon was silently carried over from the original manifest
  data via _origIcon/_oIcon fallback and could never be changed by the
  teacher. Changes: player5.js — renderIconPickerInput added to (a) the
  single-section mistakes edit block, (b) the multi-card mistakes edit
  block, and (c) the dynamic "Add Mistake" row; saveSlideEdit now reads
  .cc5-edit-mistake-icon value directly instead of the _origIcon fallback
  in both the single-section and multi-card save paths. AMD triple-match
  MD5: e5e3e0685590acabf773aa8b1ce6aabc. No PHP or DB changes.
  version.php → 2026033002002.

v12.01: SAVEPOINT ORDER HOTFIX — v12.00 shipped with the new savepoint block
  (2026033002000) placed before the v11.99 block (2026033001990) in
  db/upgrade.php. Moodle processes savepoint blocks top-to-bottom and treats
  any block whose numeric is lower than the already-recorded DB version as a
  downgrade, throwing "cannotdowngrade". Fix: blocks reordered to strict
  ascending sequence: ...1980 → 1990 → 2000 → 2026033002001. No JS, CSS, or
  DB schema changes. version.php → 2026033002001.

v12.00: ARROW DOT-POINTS (CARD 2 ONLY) — Concept-explainer (card 2) uses a
  long paragraph text editor in Edit Slide so icons in its insight circles
  are not individually choosable. These are now changed from auto-assigned
  contextual icons to a consistent chevron-right arrow for clarity. Applies
  to concept-explainer conceptInsights and fallback insight chips only. All
  other card types (hook-scenario, applied-scenario, mistakes, requirement
  circles) retain their auto-assigned / teacher-selected icons as those
  cards have the icon picker available in the Edit Slide modal. CSS: chevron
  in concept-explainer insights gets springy translateX(4px) hover animation
  (cubic-bezier 0.34, 1.56, 0.64, 1 — overshoot bounce) and stroke-width
  2.5 for crispness. Changes: cc-card-slots.js (2 icon sites), player5.css
  (animation rules for .cc5-ci-icon svg and .cc5-insight-icon svg). AMD
  sync: cc-card-slots.js triple-match MD5 c9fbd22a703d6072d94759b0e4be9336.
  No PHP or DB schema changes. CC_VERSION unchanged. version.php → 2026033002000.

v11.99: AMD TRIPLE-MATCH SYNC — v11.98 shipped with amd/src/player5.js and
  amd/build/ out of sync. The v11.98 icon-save bug fixes (all three JS changes)
  were applied exclusively to amd/src/player5.js but amd/build/player5.js and
  amd/build/player5.min.js were never updated from the prior v11.97 build. Moodle's
  AMD loader serves the build/ files in production; the src/ fix was therefore dead
  code in any deployed instance. Fix: copied amd/src/player5.js verbatim to both
  amd/build/player5.js and amd/build/player5.min.js. All three files now share MD5
  b2d40b94c2e850cdaed2b6f3f60b8722. No PHP, CSS, or DB schema changes.
  CC_VERSION → 11.99. version.php → 2026033001990.

v11.98: ICON SAVE BUG FIX — Three bugs where icon changes made in the Edit Slide modal
  were silently discarded on save:
  (1) Single-section mental-model: the step editor did not render the icon picker at all
      for section.steps[] items — icons were invisible in the UI and stripped from the
      manifest on every save because saveSlideEdit never read a step icon. Fix: added
      renderIconPickerInput('cc5-edit-mm-step-icon') to the single-section mental-model
      step row (matching the multi-card path) and added stepIcon read in the save loop.
  (2) Multi-card mistakes card: _origMItems was set to (_cu.items || []) where _cu is a
      freshly-created object with no .items key — so _origMItems was always [] and every
      mistake icon was silently overwritten with ''. Fix: read from section.cards[_ci].items
      (the original in-memory card data) so existing icons are preserved.
  (3) Single-section mental-model local manifest: cardData.steps now includes the icon
      field in every step object so the in-memory manifest update (sec.steps = cardData.steps)
      correctly carries the new icon through to self.render() without requiring a page reload.
  player5.js only. No PHP or DB schema changes.
  CC_VERSION → 11.98. version.php → 2026033001980.

v11.91: ICON PICKER — Edit Slide modal now shows a visual icon grid instead of plain
  text inputs for all icon fields (conceptItems, sceneParts, conceptInsights, mental-model
  steps). Each icon field shows a live preview square, keeps the text input for manual
  entry, and adds a "Browse" button that opens a searchable modal grid of all ~115 icons
  from cc-icons.js ICONS. Icons are shown as SVG + name label. Search filters the grid
  in real time. Clicking an icon selects it, closes the picker, and updates the preview.
  Changes: player5.js (renderIconPickerInput, buildIconPickerOverlay, 8 input sites,
  5 event handlers), styles/player5.css (icon picker styles).
  CC_VERSION → 11.91. version.php → 2026033001191. No DB changes.

v11.73: QUALITY GATE REPLACEMENT (ChatGPT-approved).
  Removes the dual scoring system (scoreQualityGate + scoreAuditDefensibility +
  EnterpriseQA) that caused 150s poll timeouts and hard failures by retrying
  already-good content. Replaced with fast structural validateCards() check:
  verifies card count (VET=7, others=6), each card has cardType+title, decision-point
  has question+≥2 options, mental-model has ≥3 steps, voiceover ≥30 chars. Valid
  content returns immediately — no scoring overhead. Broken content gets one repair
  pass then getFailedCardSequence. Scoring constants removed: INSTRUCTIONAL_MAX,
  AUDIT_MAX, COMBINED_MAX, PUBLISH_THRESHOLD, AUDIT_MIN_THRESHOLD, bestCards,
  bestScore, bestInstructionalScore, bestAuditScore, lastAuditResult.
  CC_VERSION bumped to 11.73 in cc-state.js. AMD triple-match: generator.js (0f9080ee)
  + cc-state.js (1428044e). No DB schema changes.
  version.php → 2026033001173.

v11.72: VOICEOVER GUARD UPGRADE (ChatGPT-approved micro-tweak on v11.71).
  CC_VERSION bumped to 11.72 in cc-state.js. version.php → 2026033001172.

v11.69: BULLETPROOF FIXES (ChatGPT approved — 3 edge-case hardening fixes).
  (1) JSON salvage pass in parseJsonResponse: after all repair attempts fail, extract
      the first embedded array or object from prose text before giving up. Prevents
      discarding almost-valid AI responses that have explanatory text around the JSON.
  (2) lastIssues capped at 5 after EQA injection: previously injecting EQA errors +
      warnings could blow out the repair list beyond the 5-issue cap. Now re-sliced
      to 5 immediately after injection so repair stays focused.
  (3) System prompt cache keyed by mode+country+language (context._promptCache[key])
      instead of a flat context._cachedSystemPrompt. Prevents cross-topic prompt
      contamination in batch runs where context is reused across topics/modes/countries.
  generator.js updated. AMD build/min synced. No DB schema changes.
  version.php → 2026033001169.

v11.68: PERFORMANCE UPGRADE — "Fast-First + Smart QA" architecture (ChatGPT approved).
  (1) MAX_ATTEMPTS reduced 3→2: micro-fix pass removed; generate → targeted repair only.
  (2) PUBLISH_THRESHOLD lowered 140→125 and AUDIT_MIN_THRESHOLD lowered 40→30 — prompt
      quality is high enough that near-perfect scores are not required for publication.
  (3) Single repair path: attempt 2 always uses targeted content repair (no audit-repair
      vs hard-reset branching). Top 5 issues only sent to repair prompt for focus.
  (4) Story QA gated behind context.deepQualityMode===true (default false) — removes
      an extra AI call per topic on every generation, 2-4x speed improvement.
  (5) System prompt cached on context._cachedSystemPrompt after first build — legislation,
      spelling, and language injection blocks not rebuilt on parse-fail retries.
  generator.js updated. AMD build/min synced. No DB schema changes.
  version.php → 2026033001168.

v11.67: BUG FIX — Content Creator quality gate hard gate enforced.
  BEST_EFFORT content below 140/180 combined (or below 40/80 audit) now returns a
  failed sequence instead of silently publishing low-quality content. Scores like
  77/180 now correctly trigger the auto-redo ("Regenerate Failed") loop.
  generator.js updated. AMD build/min synced (MD5 149155b4). No DB schema changes.
  version.php → 2026033001167.

v11.66: VERSION BUMP — Routine release increment. No code or DB schema changes.
  version.php → 2026032701166.

v11.65: VERSION BUMP — Reverted video pipeline feature (generate_video / video_status
  ajax actions and video_generator AMD module removed). No DB schema changes.
  version.php → 2026032701165.

v11.63: VERSION BUMP — Clean release increment following master release process.
  upgrade.php savepoints backfilled for v11.53–v11.63. CC_VERSION updated to 11.63
  in cc-state.js. BUILD_INFO.json updated. No code or DB schema changes.
  version.php → 2026032701163.

v11.62: BUG FIX (x3): (1) Workplace Training — duplicate button ID resolved: inner "Suggest
  Subtopics" card button no longer shares id with the main #cc-wp-suggest-section button;
  updateGenerateTopicsButton() now called after successful topic suggestion, select/deselect
  all, and checkbox changes so the ChatGPT section and Next button correctly appear.
  (2) TGA foundation-skills over-counting — removed generic text-inference fallback that was
  adding boilerplate/introductory lines as phantom skills; only lines matching the standard
  "SkillName – description" format are now counted. (3) CC v11.62 content creator version
  string updated. version.php → 2026032701162.

Content Creator v11.61

v11.61: FIVE FIXES across image persistence, gallery, and modal positioning —

  (1) PERSISTENT IMAGE STORAGE (BUG-CC-IMG-EPHEMERAL) — generated and uploaded
  slide images were saved only to the server's local cc-images/ filesystem directory.
  In cloud-deployed environments the directory is wiped on each redeployment, making
  all stored image URLs immediately return 404. Teachers who paid credits for image
  generation lost those images on every server restart. Fix: all three image-writing
  routes (generate-slide-image, generate-image, upload-slide-image) now also write
  each image to the stored_images PostgreSQL table (base64 data column). The cc-images
  serve route now falls back to the DB when the disk file is absent, and re-caches it
  to disk for subsequent requests. Images now survive redeployments indefinitely.
  Server-side only — no PHP change required.

  (2) UPLOAD DATA-URL BUG (BUG-CC-UPLOAD-DATAURL) — the upload-slide-image route
  was returning a raw data:image/... URL to the player instead of an HTTPS URL.
  Moodle's PHP save_manifest safety net strips all data: URLs >200 chars and replaces
  them with the "pregenerated" sentinel, causing the uploaded image to be silently
  lost on first manifest save. Fix: upload-slide-image now saves to disk+DB and
  returns the same HTTPS cc-images URL as the generate routes, bypassing PHP stripping.
  Server-side only — no PHP change required.

  (3) GALLERY COUNT DOUBLE-COUNT (BUG-GAL-COUNT-DOUBLE) — the picker gallery-row
  button count was computed as imageGallery.length + collectAllManifestImages().length.
  collectAllManifestImages() already merges imageGallery[] into its output, so this
  double-counted every gallery-only image. Fix: use only collectAllManifestImages().length
  (the correct total), matching the fix already applied to the gallery option card count.
  CC_VERSION also synced from stale 11.60 to 11.61 (second occurrence of the cc-state.js
  version-lag bug catalogued in v11.56).

  (4) GALLERY BROKEN THUMBNAILS (BUG-GAL-BROKEN-IMG) — gallery <img> tags had no
  onerror handler; when a cc-images file returned 404 (e.g. after server restart before
  DB fallback was available) the gallery showed a grid of broken image icons with generic
  "Gallery image N" alt text. Fix: onerror on each gallery <img> hides the parent
  .cc5-gallery-item so broken slots disappear cleanly. Alt text improved to use the
  AI prompt or slide title instead of the generic placeholder.

  (5) GALLERY COUNT STALE "..." (BUG-GAL-COUNT-STALE) — when siteGalleryCache was null,
  the picker gallery-row button rendered "..." and never updated after the async
  fetchSiteGallery() completed; the count remained "..." for the lifetime of the picker.
  Fix: fetchSiteGallery success callback now updates any open .cc5-show-gallery-btn
  elements with the correct total count after the fetch completes.

  MODAL VIEWPORT FIX — All popup overlays (focus/tab-reset, edit slide,
  document viewer, PDF viewer, settings, zoom, link dialog, content popup, and
  document reference popup) were using `position: absolute` relative to the
  player container. On tall slides the vertical centre of the container sits
  far below the visible viewport, forcing the user to scroll down to interact
  with the modal. Fixed by changing every overlay from `position: absolute` to
  `position: fixed` so they always appear centred in the browser viewport
  regardless of scroll position. Affected overlays: cc5-focus-modal-overlay,
  cc5-edit-modal-overlay, cc5-doc-modal-overlay, cc5-zoom-modal-overlay,
  cc5-settings-modal-overlay, cc5-pdf-modal-overlay, cc5-doc-popup-overlay,
  cc5-link-dialog-overlay, cc5-content-popup-overlay. The image source,
  regenerate, picker, gallery, and community overlays already used
  `position: fixed` via cc5-image-modal-overlay and remain unchanged.
  player5.css only — no JS changes required.

v11.60: TWO BUG FIXES —
  (1) APPLY-SELECTED-IMAGE SILENT SAVE FAILURE (BUG-CC-APPLYSAVE) — when a teacher
  picked an image from the 3-image picker, applySelectedImage() used a direct
  Ajax.call({methodname:'mod_contentcreator_save_manifest'}) with empty .done()
  and .fail() callbacks. This bypassed three critical safeguards in saveManifestSilent:
  (a) stripAudio() — large audio data: URLs inflated the POST body past PHP's
  post_max_size, causing a silent save failure that left the selected image lost
  on next page reload; (b) chunked upload — manifests >2 MB need multi-chunk
  delivery; the single Ajax.call failed silently; (c) retry with back-off — Moodle
  4.4+ service-worker message-channel drops hit the old empty .fail() handler.
  Fix: replace the direct Ajax.call with self.saveManifestSilent() — audio is
  stripped, chunking is used when needed, retries fire automatically.
  (2) OVERFLOW-VISIBLE BROWSER WARNING ON IMG ELEMENTS — Chrome's View Transitions
  API logs "Specifying 'overflow: visible' on img, video and canvas tags" when any
  <img> element participates in a view transition with the default overflow value.
  Fix: add overflow: hidden explicitly to all six img CSS rules in player5.css
  (.cc5-slide-image, .cc5-image-picker-item img, .cc5-zoom-modal-content img,
  .cc5-gallery-item img, .cc5-community-item img, .cc5-file-upload-preview img).
  CC_VERSION → '11.60'. version.php → 2026032600160.

v11.59: THREE BUG FIXES —
  (1) IMAGE PICKER DATA: URL BUG — generate-slide-image route was returning raw
  data:image/jpeg;base64 URLs to the player for the 3-image picker. PHP
  save_manifest strips all data: URLs (>200 chars) and replaces them with the
  sentinel "pregenerated", causing the manifest to lose the image when the teacher
  picks one. Fix: save each of the 3 picker images to disk under cc-images/ and
  return HTTPS URLs (same approach as the single-image route fixed in v11.55).
  Server-side change only — no PHP change required.
  (2) GENERATE-MULTIPLE-IMAGES FALLBACK — generateMultipleImages() only fell back
  to OpenAI gpt-image-1 on HTTP 429 (rate limit). Imagen 4 Ultra also silently
  returns an empty generatedImages[] on content-policy blocks, throwing "No image
  data in Imagen 4 Ultra response" — not caught by the rate-limit-only condition.
  Fix: fall back for ALL Imagen 4 failures (parity with single-image fix in v11.58).
  Server-side change only — no PHP change required.
  (3) BROKEN IMAGE RECOVERY — when a cc-images/ file is unavailable (404, e.g.
  after a server restart wipes the directory), the <img> tag showed a broken icon
  and rendered the slide title as alt text. Fix: <img onerror> dispatches a custom
  bubbling event ('cc5img_error') so the container can degrade gracefully:
  teachers see the "Add Image" button to re-generate; students see nothing (container
  hidden). The native DOM 'error' event doesn't bubble, so a custom event is used
  for reliable jQuery delegation. CC_VERSION → '11.59'. version.php → 2026032600159.

v11.58: TWO BUG FIXES —
  (1) IMAGE-GENERATION FALLBACK: generateImage() in server/routes.ts only fell
  back to OpenAI gpt-image-1 when Imagen 4 Ultra returned HTTP 429 (rate limit).
  Imagen 4 Ultra also silently returns an empty generatedImages[] when its content
  policy filters a prompt, throwing "No image data in Imagen 4 Ultra response".
  This was not caught by the rate-limit-only condition, so the slide was left with
  no image. Fix: fall back to OpenAI for ALL Imagen 4 failures, not just 429.
  Server-side change only — no PHP change required.
  (2) OVERVIEW LIST MARKUP: player5.js rendered section.voiceoverText as
  <ul class="cc5-introduction-list"><li> items in the Overview block. User
  requested plain-text rendering with no list markup. Fix: replaced <ul>/<li>
  with <p class="cc5-introduction-para"> tags. Matching CSS added to player5.css.
  Old .cc5-introduction-list/.cc5-introduction-item CSS kept for manifests
  generated before v11.58. CC_VERSION → '11.58'. version.php → 2026032500158.

v11.57: ZIP-VALIDATION FIX — amd/build/legislation/ directory was empty in the
  v11.56 ZIP. The AMD sync script only handled .js files and skipped the
  legislation/ JSON data files (australia.json, canada.json, nz.json, uk.json,
  us.json) and the legislation/overlays/ subdirectory (8 state-level JSON files).
  Moodle's plugin validator rejected the ZIP with "Extracted file not found:
  contentcreator/amd/build/legislation/". Fix: all 13 JSON files copied from
  src/legislation/ to build/legislation/ (CRC verified). CC_VERSION bumped to
  '11.57'. version.php → 2026032500157.

v11.56: VERSION BUMP — Maintenance release. CC_VERSION was stale at '11.53' in
  both cc-state.js and generator.js (two versions behind version.php at 11.55).
  Corrected to '11.56'. All AMD trios hard-synced src = build = min (CRC verified).
  No functional changes. version.php → 2026032500156.

v11.55: IMAGE-DISPLAY FIX — Root cause of AI images not displaying:
  generateImage() returns data:image/jpeg;base64,... URLs. PHP save_manifest
  safety net strips ALL data: URLs >200 chars and replaces with "pregenerated".
  Player then rendered <img src="pregenerated"> → broken dark strip below header.
  Fix 1 (server/routes.ts): After Imagen/OpenAI generates the image, extract
  the base64 buffer, write it to a persistent cc-images/ directory, and return
  an HTTPS URL (/cc-images/uuid.jpg) instead of the data: URL. A new Express
  static route serves these files. Fix 2 (player5.js): All three hasImage
  checks now exclude "pregenerated" sentinel and raw data: URLs — legacy
  manifests show the Add-Image button instead of a broken img tag.
  version.php → 2026032500155.

v11.54: TWO FIXES — (1) IMAGE-REGEN BUG: triggerFailedRegeneration() in
  builder.js omitted imageSettings and activitySettings from the inputs
  object, so any failed-slide re-run always disabled images and activities
  regardless of the original user selection. Fixed by reading both from
  existingManifest (fallback: imageSettings={enabled:false},
  activitySettings={enabled:true}).
  (2) CONCEPT-EXPLAINER REDESIGN: "What This Means" card (Card 2) replaced
  plain numbered blue circles with colour-cycling icon cards. Both paths are
  updated: conceptInsights[] preferred path adds cc5-ci-{blue|green|orange|
  purple} variant classes; fallback chips path swaps cc5-insight-num for
  cc5-insight-icon with a rotating icon set (lightbulb → check-circle → zap
  → shield → star → target → award) and matching colour variants
  cc5-chip-{blue|green|orange|purple}. Full light/dark-mode CSS added to
  player5.css. version.php → 2026032500154.

v11.53: VERSION BUMP — Routine release packaging. CC_VERSION bumped to 11.53
  in cc-state.js and generator.js. All AMD build files hard-synced from src
  (CRC verified: src = build = min). version.php → 2026032500153.

v11.42: BUG-CC-TOKEN-GUARD + BUG-CC-ROUTE-MISSING

  BUG-CC-TOKEN-GUARD (server/routes.ts, no plugin update required for server fix):
  Even after v11.41 raised maxTokens to 16000, generation failures persisted on
  complex VET units. Root cause: gpt-4o's structured-output hard cap is 16,384
  tokens. The 54-field schema requires ALL fields per card even when null; gpt-4o
  over-fills 10-15 fields per card with verbose text instead of null. Estimated
  worst-case: ~150 tokens/field × 12 fields × 7 cards ≈ 12,600 content tokens +
  ~2,800 null-field overhead + JSON structure ≈ 16,200+ tokens → truncation at the
  16,000 limit → invalid JSON → "AI generation failed - invalid structure after
  retry". Fix: inject TOKEN_BUDGET_GUARD string into systemPrompt for PASS 1 and
  PASS 1 retry, explicitly instructing gpt-4o to target <14,000 tokens total and
  mandating null for all non-applicable fields. Server-side fix — immediate effect
  without plugin update.

  BUG-CC-ROUTE-MISSING (generator.js + ajax.php — requires v11.42 plugin):
  callAI() never forwarded the content route (vet/university/workplace/pd) to
  ajax.php, and ajax.php never forwarded it to the server. Server always defaulted
  to route='vet' (ccExpectedCardCount=7). For university/workplace routes using
  6-card prompts, the server incorrectly expected 7 cards and triggered unnecessary
  PASS 2 expansion, potentially adding a corrupt 7th card. Fix: added `route` as
  5th parameter to callAI() (default 'vet'); generator.js appends it as FormData;
  ajax.php reads via optional_param and forwards in the API payload.

v11.41: BUG-CC-GEN-TOKENS — raised maxTokens 12000→16000 in all 6 callOpenAI
  calls; added transient-retry patterns for "generation failed"/"invalid structure"/
  "empty response" in generator.js. version.php → 2026032401141.
  Fix 2 (generator.js): Added "generation failed", "invalid structure", and
  "empty response" to both isTransient patterns in callAI(). These errors now
  trigger the standard exponential-backoff retry loop (up to MAX_RETRIES=5)
  as a defence-in-depth layer for any future partial-failure scenarios.
  No DB schema changes.

v11.40: BUG-CC-SSLIDE-PERM + BUG-CC-SSLIDE-NOTRY + BUG-CC-SSLIDE-SESSION —
  Three bugs in save_slide_edit.php that were missed by the v11.39 partial fix.

  BUG-CC-SSLIDE-PERM: save_slide_edit external function used
  require_capability('mod/contentcreator:addinstance', $context) — the same
  wrong capability that caused "Failed to save generated content" in v11.38 and
  earlier. v11.39 fixed save_manifest.php and save_manifest_chunk.php but did
  NOT fix save_slide_edit.php. Every teacher edit-slide save (pencil icon →
  Save) continued to fail on Moodle sites with custom cloned roles.
  Fix: replaced with the two-step flexible check (mod/contentcreator:manage →
  moodle/course:manageactivities fallback) matching the pattern in ajax.php,
  save_manifest.php, and save_manifest_chunk.php.

  BUG-CC-SSLIDE-NOTRY: save_slide_edit.php had no try/catch block. Unlike
  save_manifest.php and save_manifest_chunk.php which both wrap their logic in
  catch (\Throwable $e), save_slide_edit had zero error handling. PHP 7+ Fatal
  Errors (type mismatches, memory errors, etc.) are Error objects — not caught
  by catch (Exception $e) — and propagate as opaque HTTP 500 responses with no
  meaningful context. Fix: wrapped entire function body in try/catch (\Throwable)
  with error_log output matching the pattern of the other save externals.

  BUG-CC-SSLIDE-SESSION: save_slide_edit.php never called
  \core\session\manager::write_close() before the DB read+write. Holding the
  session file lock during manifest JSON decode+encode (potentially hundreds of
  KB for large manifests) blocks concurrent requests from the same user session.
  Fix: added write_close() call immediately after the capability check and before
  the DB get_record call, matching save_manifest.php and save_manifest_chunk.php.

v11.39: FIX-SAVE-PERMISSION — Fixed "Failed to save generated content" error
  for editing teachers on Moodle sites using custom roles. Root cause: the
  save_manifest and save_manifest_chunk external functions used
  require_capability('mod/contentcreator:addinstance') which is too strict
  and not granted to custom roles cloned from editingteacher. Fix: both
  external functions now mirror the flexible two-step check already in ajax.php:
  check mod/contentcreator:manage first, fall back to
  moodle/course:manageactivities (held by all genuine editing teachers).
  Also hardened both catch clauses to \Throwable for PHP 7+ Error types.

v11.38: IMAGE-DOWNLOAD — Added download button to generated images (picker modal),
  gallery images, and community gallery images. Each image now has a circular
  download icon button (top-right). Uses fetch-as-blob for cross-origin CDN images
  with fallback to opening in a new tab. player5.js + player5.css updated.

v11.31: COMPLETION-FIX — Fixed three critical Moodle completion bugs:
  1. Added contentcreator_view() with set_module_viewed() call — "Require
     view" completion condition was never firing because view.php never
     triggered it.
  2. Added contentcreator_get_coursemodule_info() to populate Moodle's
     completion cache with custom rules — without this, course completion
     aggregation and completion reports may ignore custom rules.
  3. Added course_module_viewed event class — standard Moodle log store
     now records views.

Full changelog: see CHANGELOG.md

@package    mod_contentcreator
@copyright  2025 AI Grader
@license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
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
