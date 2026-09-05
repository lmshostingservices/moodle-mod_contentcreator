# Changelog

## 15.4.10 - 2026-09-05

**Topics and Text narrated a glossary that was not on the screen, and never read the body
text that was.**

Reported as "it reads the heading, then reads text that is not even on the card". Measured
on a rendered slide, that is exactly what happened.

Screen showed:

> **What sleep pressure is**
> Adenosine builds up in the brain across the waking day and is cleared during sleep.
> The longer you are awake the stronger that pressure becomes, which is why a late nap
> blunts it.

Narration said:

> "What sleep pressure is. Adenosine means a molecule that accumulates while you are awake."

The heading, then the `keyTerms` glossary - which this card type does not render - and
**neither visible paragraph read at all**.

### Root cause

`PROSE_CARD_TYPES` in `cc-state.js` is the list that decides whether a card is narrated from
its prose body. Topics and Text builds `subtopic` cards. `subtopic` was never added to that
list, so `isProseSection()` returned false, `_voEmitCard()` fell through to the generic tail
that emits title plus terminology, and `proseParagraphs()` - the function that reads what is
actually on the card - was never called on this route.

This is the ninth recorded instance in this codebase of the same defect shape: two halves of
one contract, and one half moved. `renderRouteCard()` gained a card type; the hand-maintained
list of prose card types did not.

### Fix

`subtopic` added to `PROSE_CARD_TYPES`, along with the five v13.91 slot names
(`orientation`, `foundations`, `mechanism`, `in-practice`, `boundaries`) that are still
present in saved modules and had the same gap.

`proseCardSegments()` also had to change how it names the section. Every other prose card
type has a FIXED heading looked up from its type; a `subtopic` card's heading is
content-driven and lives on the card itself. It now reads `card.title` for `subtopic` and
falls back to the fixed lookup for everything else - so the narration says the heading the
learner can see, not a generic label.

### Guard

`tests/js/test-narration-matches-screen.js` (19 checks) renders each route's slide, walks
the DOM for the words SEEN and the narration queue for the words HEARD, and compares them.
It also carries the structural assertion that would have caught this on the day it was
introduced: **every card type `renderRouteCard()` dispatches to `renderProseSection` must
appear in `PROSE_CARD_TYPES`**. That check asserts the two halves AGREE, rather than
asserting either one in isolation - which is the only remedy that has worked for this defect
shape.

Words heard that are on screen, after the fix: vet 87%, workplace 87%, general 87%, policy
87%, university 96%, topics-and-text 100%. The sub-100% figures are short filler tokens in
the fixtures, not off-card narration.

One false positive was found and fixed while writing the test: jQuery's `.text()`
concatenates adjacent nodes with no separator, which fused the last word of one element to
the first word of the next and made three routes look like they were narrating off-card
words (43% match). Replaced with a tree walk that joins on spaces.

## 15.4.9 - 2026-09-05

**The last two pipeline findings, and the local checks tightened to match what the pipeline
actually enforces.**

v15.4.8 cleared four of six. The pipeline returned 47 passed, 1 blocker, 1 warning.

### Blocker - the PARAM_RAW waiver is not honoured

v15.4.8 added the documented inline waiver, in the documented lowercase spelling, with a
real U+2014 em dash. **The pipeline rejected it anyway.** Rather than keep guessing at a
matcher that cannot be tested from here, the setting now takes the stricter type the rule
asks for first.

`PARAM_TEXT` is genuinely correct for it. The value is pronunciation respellings, one
`word=respelling` pair per line; PARAM_TEXT runs `fix_utf8()` and strips HTML tags, and
letters, digits, `=`, hyphens and newlines all survive untouched. The original reasoning for
PARAM_RAW - that a respelling is deliberately not a real word and cleaning would destroy it -
is true of cleaners that normalise text, and PARAM_TEXT is not one. Nothing about the
setting behaves differently.

### Warning - one comment sentence, and what it revealed about the rule

The remaining flag was a single line in `lang/en/contentcreator.php`. v15.4.8 had checked
the first line of each comment RUN; this line was the second. Comparing what the pipeline
flagged against what it left alone: the line above it ends with a full stop, and this one
opened lowercase. The rule is per-SENTENCE, not per-block.

Applying that properly surfaced four more - and showed why the rule needs an exception.
Capitalising a sentence that opens with an identifier produces "Update_state() has no..."
and "Record_exists() also avoids...", comments that now name functions which do not exist.
That is worse than the warning it silences. Those four are rephrased to lead with an
ordinary word instead ("The update_state() call has..."), and the local check skips a
lowercase opener followed by `()` or `_`.

### The local suite now matches the pipeline

`tests/js/test-pipeline-style.js` asserts the absence of PARAM_RAW rather than the presence
of a waiver, and checks comment sentences rather than comment blocks. Three further
mutations were injected and caught.

## 15.4.8 - 2026-09-05

**Every check the release pipeline failed, fixed - and moved into the local test suite so
they are caught before a build is packaged rather than after it is uploaded.**

The pipeline rejected v15.4.7 with 1 blocker, 1 error and 4 warnings. All six were
mechanical and all six were findable locally. `tests/js/test-pipeline-style.js` is this
plugin's copy of those checks; it fails on all seven mutations of them.

### Blocker - PARAM_RAW in settings.php

The waiver was already there. It was written `// Pipeline-ignore: PARAM_RAW - ...`; the
pipeline documents `// pipeline-ignore: PARAM_RAW — <reason>` and matches it case-sensitively,
with an em dash. A capital P and a hyphen were the whole difference between a passing build
and a blocked one.

The setting itself is unchanged and still PARAM_RAW, deliberately: it holds pronunciation
respellings, which are not real words ("Moo-dul", "ay-eye") and would be destroyed by
cleaning. The value is never rendered as HTML - it is split on "=" in JavaScript and
substituted into the narration script before synthesis.

### Error - blank line after a class brace

`classes/ratelimit_exception.php`. Removed.

### Warnings

**Multi-line calls** in `classes/ratelimiter.php` - two `throw new ratelimit_exception(...)`
calls carried their first argument on the opening line. Both now break after the
parenthesis; the larger one hoists its `(object)[...]` payload into a named variable first,
which reads better than a six-line argument list anyway.

**Comment blocks starting lowercase** - thirteen of them across `ajax.php`,
`classes/ratelimiter.php`, `db/upgrade.php` and `lang/en/contentcreator.php`. Every one
opened with a lowercase version tag ("v15.4.3: the window is a sliding one..."). The tag now
trails the sentence, so the provenance is kept and the comment starts with a capital.

**`function (` in AMD sources** - 1658 occurrences. This one is worth knowing about: it is
not a house rule the pipeline invented. **Moodle core's own `.eslintrc` sets
`'space-before-function-paren': ['warn', 'never']`**, so the pipeline is enforcing core's
style and this plugin was not. Fixed with `eslint --fix`, which is the right tool because it
understands string literals and left the seven inside `scorm.exporter.js`'s template
literals alone - those are the exported SCORM package's own player script, so they were
corrected by hand.

The rule is now in `.eslintrc.json`, so `grunt eslint` catches it. Without that, the sweep
would have been a one-off tidy-up that drifts back with the next callback anyone writes.
Three test suites asserted source text with the old spacing and were made
whitespace-tolerant - a source-text assertion should not be brittle to formatting.

**ALL-CAPS language values** - reported for the image-format hint and "TGA API unavailable".
Both are legitimate: they are a list of file formats and the name of training.gov.au's
interface. The copy now leads with an ordinary word ("Accepted formats: JPEG, PNG..." and
"The TGA API is unavailable"), which reads better, but a list of image formats will always
contain adjacent acronyms. Two further format lists (`errfiletype`, `msgsupportedformats`)
are the same shape and were not flagged by the pipeline at all, so its heuristic is
inconsistent here; all four are recorded as accepted in the new suite rather than half-fixed,
and the check still catches genuine shouting.

### Packaging

The ZIP filename must be `mod_contentcreator_v<VERSION>.zip` - **underscore** before the
`v`, not a hyphen. The console refuses the upload on the filename before it reads a single
byte, which makes it look like a build failure when it is not. Recorded as Step 0a in the
release runbook.

## 15.4.7 - 2026-09-05

**Topics and Text was being generated as General. Plus the two colour jobs left over from
v15.4.5.**

### Topics and Text produced a seven-card General pack

Reported: "topics and text created the normal 7 cards - same as other routes? It's supposed
to be just sub headings and text, up to 10 cards."

Correct on every point, and the cause is one line. `ccNormaliseGenerationRoute()` in
generator.js folded `topicstext` onto `general`. That fold was right when the route was
withdrawn from the mode picker. **v15.3.11 restored it as a teacher-selectable route and
un-folded the TEACHER-side normaliser, with a comment that describes this exact bug:**

> "leaving the fold in place while restoring the card would let an author pick Topics and
> Text and silently generate a seven-card General pack - the same class of defect as the
> Policy route running as University."

The generation-side normaliser was never touched, so the prediction came true for four
releases. `context.mode` was overwritten with `'general'` before the system prompt was
built, so every Topics-and-Text pack got GENERAL_SYSTEM_PROMPT and General's seven fixed
cards; `validateCards` expected seven instead of this route's 3-10 content-driven range;
and not one subtopic card was produced. Everything else was already correct -
`CC_CARD_ORDER.topicstext` is `['subtopic', 'decision-point']`, `CC_CARD_COUNT_RANGE` is
`{min: 3, max: 10}` - and none of it was reachable.

The image route unfolds with it, which its own call site had already asked for: the note
there records that the vendor has a dedicated `topicstext` branch, verified live, and that
"the workaround is therefore removed so the correct branch is actually reached" - but the
workaround lived in the normaliser, so the call site went on sending `general` and
Topics-and-Text kept getting workplace imagery.

`pd` still folds, and correctly - it is genuinely off the mode picker and the teacher-side
normaliser folds it too. `test-route-dispatch.js` now runs BOTH normalisers over all seven
routes and requires the same answer, so a fold added to one and not the other fails
whatever it is called.

### The gap under the hero image

Paid for twice: the image container carries `margin-bottom: 1rem` and `.cc5-slide-body`
immediately after it carries `padding: 1rem`, so there were 32px of nothing between the
image and the KNOWLEDGE pill on every slide with an image. Neither value is wrong alone,
which is why it survived - only their adjacency is. An adjacent-sibling rule zeroes the
body's top padding in that one case; a slide with no image is untouched.

### The hex colour sweep, and why the obvious way to do it is wrong

v15.4.4 unified the `hsl()` declarations. 57 raw `#rrggbb` literals were still off-family -
greens at 145/149/158/160/162/165, blues at 213-225. They are now on 142 and 210, with the
blue-grey text ramp, the indigo/violet family and the cyans deliberately left alone.

The first attempt kept saturation and lightness and rotated only the hue, which is what
"normalise the hue" naturally means. **It is wrong for contrast.** Luminance is
`0.2126R + 0.7152G + 0.0722B`, so blue contributes a fourteenth of what green does, and
rotating 221deg to 210deg at identical S and L makes a colour measurably lighter. Measured:
five colours dropped an AA band, one of them `#2563eb`, which carries the comment
"v13.29: was #3b82f6 = 3.68:1 -> #2563eb = 5.17:1". A hue sweep would have silently undone
a contrast fix made for exactly that reason.

Each literal now keeps its hue family and its saturation, and its lightness is solved so
the relative luminance is unchanged. Largest contrast drift across all 57: **0.09**. No
colour changed AA band in either direction.

The corollary, learned the same day from the two blue buttons: hue equality is not colour
equality. A sweep makes a family consistent; it does not make two controls the same colour.
Anything that must MATCH takes a token.

## 15.4.6 - 2026-09-05

**A full audit of the Policy & Compliance route, one button family instead of five, and
the quiz stops pretending to be a lock.**

### Policy & Compliance: the full pass

Asked which route I was least confident about, I said Policy - newest, borrows Workplace's
screen and context builder, least live use - and then went through it end to end by
rendering it rather than reading it. Eleven defects, every one of them the same shape: a
list or an if/else that names the other routes and not this one.

**The Suggest Subtopics button did nothing.** Policy renders Workplace's step-2 screen, and
the event-binding block was still `if (selectedMode === 'workplace')`. Its two siblings -
the Continue gate and the step validator - were both patched for Policy in v15.3.0 with
comments saying that keeping them in step is the point of touching them together. This one
was missed. The primary CTA had no click handler, the subtopic checkboxes went inert after
a Back, and the industry dropdown no longer re-evaluated the Continue gate. It looked like
it worked only because uploading a document binds the selector by another path - and on
Policy a document is mandatory, which is exactly why nobody hit it.

**The policy title had nothing listening to it.** It gates Continue and it is required, but
no handler re-ran the gate when it was typed, so an author who ticked their subtopics
before typing the title watched the button stay hidden with nothing explaining why.

**The route was told to invent a character.** v15.4.4 made the naming block universal so an
eighth route could not be written without it. That was right for six routes and wrong for
this one: it told Policy to "give the recurring person a name" and carry it "through
hook-scenario, decision-point, because that is one story", twenty lines after its own
prompt says "No manufactured conflict", "No dramatised breach" and "never a manufactured
incident". The model was handed both and had to choose. Policy now gets the opposite rule -
name no one, refer to people by role, the way the document does - and the repair prompt's
"KEEP THE PERSON" trailer is inverted for it too, which matters because repair fires on
most sections of a live build and would otherwise have had the last word.

**The learner saw the wrong six card names.** The route advertises Scope & Purpose, What
the Policy Says, What You Must Do, Common Misreadings, Compliance at a Glance and Check
Your Understanding on its mode card. The player showed Scene Setting, What This Means, How
to Handle It, Watch Out For and You Are Ready When You Can - the narrative routes' labels,
hard-coded in the shared renderers. "Scene Setting" over a clause of a code of conduct is
the register this route exists to remove, reintroduced by the chrome. The card renderers
can now ask which route they are drawing; every other route is untouched. The NARRATION
table moved with it - its comment says the keys are deliberately shared with the flow
badge, which is exactly why leaving it would have had the badge read "Scope & Purpose"
while the voice said "Scene Setting" over the same card.

**A finished Policy module reported itself as "General Learning".** v15.1.1 fixed this
ternary by correcting its input and left the chain alone, so the two routes added after it
both fell into the final else. It is now a lookup that names all seven, and takes its
labels from the same strings the mode picker uses instead of hard-coded English.

**The context screen said "Workplace Training".** An author who deliberately picked Policy
& Compliance was told they were on "Learning Context - Workplace Training" and asked to
upload their company documents, on the screen carrying the route's mandatory policy-title
field. The review screen said "Based on your inputs" instead of naming the document. Both
now have their own wording.

**The identity strip was dropped from every export.** Which document, who owns it, when it
was last reviewed, who to ask - shown on every slide in the player, and absent from the
text export, the print/PDF export and the SCORM package. A printed compliance course
stating rules staff are held to, with no record of the source document or its review date,
is a leaflet rather than an attestation. One helper now feeds the strip and all three
exports, so they cannot drift.

**The Policy chrome was English in 53 languages.** `policyStripLabel`, `policyFullDocument`
and their four siblings existed only in the `en` block, so a Japanese or Spanish policy pack
rendered its content translated and its compliance strip in English. Twelve keys are now
translated across all 53 language packs in both tables - 600+ strings - and the review date
goes through `Intl` instead of a hard-coded English month list, so ja renders 2026年3月1日
and de renders 1. März 2026.

**Five duplicate keys in lang/en.** PHP keeps the last assignment, so the earlier
declaration is dead and the live value is not the one at the key's documented position. Two
were actively wrong: Topics and Text was labelled "(legacy)" when it was withdrawn from the
mode picker, then restored as a selectable route in v15.3.11 - and the label was never taken
back, so a live route's mode card read "Topics and Text (legacy)". `test-builder-strings.js`
now fails on a duplicate key.

Also: `manifest.builder.js` had no Policy branch in `validateInputs` and its error message
named three routes when there are seven; `getMajorTopicTitle()` had no Policy branch; and a
`!card` guard was missing from the one loop in the scene-part normaliser that lacked it - a
null entry in `cards[]` threw during init, jQuery swallowed it, and the learner got a
permanently blank player with nothing in the log connecting it to one bad card.

Verified NOT defects, having been checked: the PHP layer is route-agnostic throughout;
`policyMeta` and `mode: 'policy'` survive save and restore intact; card-quality and the
readability table both cover all seven; and University having two activities rather than
three is a recorded decision - Category Sort needs a good/bad contrast its cards do not
have.

### The quiz stops pretending to be a lock

"You have a mix of activity completion styles. The MCQ has a Try Again and requires Try
Again to get it right to proceed, then flip cards, then category sort where if you get 5/6
you can still proceed and then get a score - it's mixing different styles."

Right on both counts. Category Sort lets a learner finish with 5 of 6 and scores them 5 of
6; Flip & Learn is exploration and passes once every card is turned. Only the quiz refused
to advance until the learner had guessed their way to the right answer - which is not an
assessment, because the answer is on the screen, and it made the score ring meaningless:
everybody who reached the completion screen had necessarily scored 100%.

Every question is now answered once. The learner always proceeds, and the score records
whether they were right. Try Again is gone from the challenge quiz. The standalone
decision-point card keeps it, and that is a decision rather than an oversight: it renders
when activities are switched off, where nothing is being scored and Try Again is practice.

### Try Again sent you into the middle of the learning cards

"When I clicked Try Again on the end screen of the learning activities, it didn't take me
back to the start of the activities - I was taken to half way through the learning cards."

It captured `window.scrollTop` at the moment of the click and restored that same number
after re-rendering. But the click happens on the completion screen - the tallest state the
activity block ever has - and the re-render replaces it with the Start Now panel, a
fraction of the height. The document gets shorter and the offset that used to sit at the
top of the results lands up in the cards. It now scrolls to the activity block itself.

### One forward button, three places

"The next card styling is very weird - just do a standard white button with blue text and
blue icon, and on hover blue with white text, and remove the on-hover movement, it's off
putting." Then the Start button, then Next Question, then "why 2 different blues on 2 diff
buttons".

Five treatments across five controls, including a blue that changed depending on which
CARD the button sat on (`--cc5-prose-accent` is per card tone), a gradient with a glow that
grew on hover, and three different nudges. The v15.4.4 hue sweep is why this survived a
colour audit: it put them all on 210deg and left saturation and lightness alone, so they
were the same family and still visibly different colours.

One blue now, `--cc5-blue-cta`, in two tiers: primary forward buttons rest white and fill
solid on hover; Try Again and Review Answers rest white and take the light tint, because
Continue is the primary action on that screen. No transforms and no glow anywhere.
`#0381FF` itself is 3.76:1 on white and cannot serve as both a label on white and a fill
under white text, so the token is the lightest point on the brand hue that clears 4.5:1 in
both directions. `tests/js/test-button-family.js` pins all of it.

**The Next Card padding fix from v15.4.4 never reached the screen.** Two rules with the
same selector, 360 lines apart; the later one won and the button never moved, which is why
the report came back unchanged. The duplicate is deleted and the spacing lives in one
place. While there: `--cc5-space-7` is not defined anywhere in this stylesheet, so every
`var(--cc5-space-7, 1.75rem)` in it has silently been the fallback.

## 15.4.5 - 2026-09-05

**Three subtopics must build three subtopics. And the Policy screen was showing its own
string keys.**

### Workplace was building double what you selected, and inventing the difference

You tick your subtopics, the wizard says "3 subtopics confirmed", and then it built six.
`planWorkplaceTopics()` read each ticked card as a TOPIC and made
`Math.min(subtopicsPerTopic, Math.max(2, card.subtopics.length))` sections underneath it -
a hard floor of TWO. Three ticked became six, seven became fourteen. Every Workplace pack
ever built generated, and billed, at least double what its author asked for.

Where a ticked card carried no sub-list of its own the floor invented the sections outright
and shipped them under the titles the loop made up:

    Reporting          <- the card you ticked
      1. Section 1     <- invented, generated, billed, shown to learners
      2. Section 2     <- invented, generated, billed, shown to learners

It also produced one topic per card, so subtopic numbering restarted at every card
(1.1, 1.2, 2.1, 2.2) on routes that are meant to be one topic with a flat series - which
is what the v15.4.2 numbering change assumes.

One ticked card is now one section. Nothing multiplied, nothing invented. A card's own
sub-points become that section's key points, which is what they always described.

### Policy: you picked three, it built fifteen

Worse than Workplace, and for a different reason. `planTopics()` planned Policy from the
DOCUMENT's table of contents and used your selection only when the document had no
headings - which, since the route refuses to run without a document, was almost never. A
three-subtopic selection against a twenty-clause policy built fifteen, because fifteen is
the cap. Fifteen generations, fifteen images, fifteen voiceovers, none of them asked for.
The wizard refuses to continue until you select ("Please select at least one Major Learning
Topic") and then threw the selection away, which is worse than not asking.

Your selection now decides the shape; the document still decides the SOURCE. Each chosen
subtopic is matched to the clause it names, so the fidelity check still compares a card
against its own clause rather than the whole file. A subtopic the document does not cover
gets no extract rather than a wrong one - a wrong extract would make the check report every
correct figure in the card as invented. Planning from the table of contents survives as the
fallback for a document with nothing ticked.

`tests/js/test-subtopic-count.js` asserts N-in / N-out for all seven routes at 1, 3, 5 and 7
subtopics and at every duration, and that every subtopic on every route carries a billing
key. general, pd, topicstext and university were always correct - which is exactly why this
went unnoticed for so long.

### The Policy & Compliance screen was showing raw string keys

The Policy details block rendered as:

    msgpolicydetails
    msgpolicytitle      [msgphpolicytitle]
    msgpolicyowner      msgpolicyreviewed

Eleven identifiers on a customer's screen. The strings were declared in
`lang/en/contentcreator.php` but the block was never added to `CC_MESSAGE_KEYS` (the batched
prefetch) and had no English fallback either, so `s()` fell through to `return key`. Nothing
threw and every test passed, because no test had ever compared the lookups against the
lists.

`tests/js/test-builder-strings.js` now does, in both directions and for the player's label
table as well: every `s()` key must be prefetched, must have a fallback, and must exist in
`lang/en`; every `getLabel()` key must exist in `UI_LABELS.en`.

### The Workplace and Policy course had no name

Every planner titles its single topic from `context.courseTitle || context.courseName`, and
falls back to the literal string `Major Topic`. The one field these two screens require you
to fill in - "This is your major topic" - was the one field the context never carried, so
that literal is what the packs were named, and the player's H1 fell back to "Learning
Topics". Both now carry it; on Policy the document's own title names the course, since that
is what the route is about. `getMajorTopicTitle()` was missing a Policy branch too.

### The second decision-point editor

v15.4.4 fixed the multi-card editor, which was bound to the v1 `card.question` /
`card.options` shape while every route has produced `questions[3]` since v15.3.13 - blank
box, and a save that stamped the blank over question one. `showEditModal` has a SECOND
branch for a section whose quiz is its only card, and it had the identical defect. Found by
rendering it and reading the box back, not by reading the code.

Both editors now render and collect every question with its four options, their feedback and
the correct flag, and each writes the full `questions` array itself.
`ccSyncEditedDecisionPoint()` - the helper that reconciled the two shapes, and the thing that
actually performed the data loss - is deleted. `test-edit-modal-fields.js` now opens both
branches and reads every control back; `test-quiz-three-questions.js` no longer asserts that
the reconciling helper is CALLED, which is what let it pass while the modal was destroying
quizzes.

## 15.4.4 - 2026-09-05

**Colour consistency, spacing, the speaker icon's states - and the real reason Sarah kept
coming back.**

### Sarah was being put back by the REPAIR pass

"Still generating Sarah everywhere - must be hardcoded in the prompt somewhere!" Not
hardcoded: missing. v15.4.1 added the naming rule to the seven GENERATION prompts and
stopped there. Repair is a separate prompt built by a separate function, it fires whenever
a field lands under a vendor floor (on a live build, most sections), and what it rewrites
is `keyPoints[].text` - the scene-panel prose where the person is named. So generation was
told never to use Sarah, produced someone else, failed a word floor, and the repair - told
nothing about names - rewrote the panel and put her back.

Verified by building all seven repair prompts and searching them: not one carried the rule.
It is now appended in one place, so an eighth route cannot be written without it, along
with an instruction not to rename a person the text already names. The translation prompt's
own literal - "Adapt scenario names (Jake, Sarah, etc.)" - is gone too.

### One green and one blue

"#21C45D is the best green... the blue should be the one I gave you... we need real
consistency, you're using different greens, different blues all over the place." Measured
rather than argued: the stylesheets carried **five** green hues (142, 150, 155, 158, 160,
165) and **six** saturated blue hues (200, 210, 212, 217, 220, 230). Every one now sits on
142deg or 210deg - the hues of #21C45D and #0381FF - keeping its own saturation and
lightness, so shading and contrast pairs are unchanged while the family is finally one.
`--cc5-green-solid` is now exactly #21C45D rather than a near-miss of it.

Deliberately spared: anything under 45% saturation in the blue range. The grey text ramp is
a blue-grey at 217deg, and sweeping by hue alone would have repainted the body copy.

**The activity block is blue.** About a hundred hard-coded oranges across fifty-eight
selectors now read their hue from a single `--cc5-activity-h` token. Change that one value
to re-theme the whole block.

**One white-label green.** "We need white text for the green version", then "two different
green buttons - you might be applying a darker shade which I hate". Both fair, and they
pull against each other: white on #21C45D is 2.6:1, unreadable, which is why that chip
carried grey. So the green for white-label buttons is chosen by arithmetic - 32% lightness
is the lightest this hue goes while clearing 4.5:1 (it lands at 4.73:1) - and the stepper
chip, the Continue button and the modal OK button all use that same one. Continue's
darken-on-hover is gone; the shadow and the lift are the hover.

### The speaker icon went white on hover

Every state is now pinned - resting, hover, active, keyboard focus, muted, muted-hover, and
the dark-theme copies of each. The hover rule set only a background, so the Moodle theme's
`button:hover { color: #fff }` supplied the foreground: white on a pale ground.

### Spacing

- Card top padding 34 -> 44, reported on applied-scenario, mistakes and competency-summary.
- The gap between a sticky bar and a scrolled card 16 -> 28. Every one of those screenshots
  showed the card flush against the blue bar; 16px is a hairline, not a gap.
- **Flip cards fit above the fold at last.** v15.4.1 lowered the grid's row floor 220 -> 150
  and the card went on rendering at 220, because `.cc5-flip-inner` carried its own
  `min-height: 220px` - with a comment saying it "matches the grid minmax floor", which it
  did until that floor moved. The taller of the two wins. One floor now.
- Activity block top padding 16 -> 30, and the head row's own margin 18 -> 10, which closes
  the dead band under the pill row ("waste of space here").
- Next Card: doubled above and below. The rule that governs on a stepped card sets the whole
  margin shorthand, so raising the base rule's margin-top in v15.4.1 changed nothing here -
  two copies, one moved. There was no bottom margin at all.

### Smaller things

- **Start Now** is an outline button that fills on hover, like Try Again and Review Answers.
- The 100% line was "You need 100% - every activity passed - for this section to count as
  complete." It is now "Pass every activity to complete this section." The chip beside it
  already says 100%.
- Subtopic numbering: VET keeps 1.1 (real performance-criterion codes); every other route
  counts 1, 2, 3.
- The authoring wizard is 1400px, not 900px, and the route grid fits three cards across.

### Still open

A complete unification at the HEX level. The HSL families are one green and one blue, but
there remain hex literals (#10b981, #16a34a, #34d399, #047857, #2563eb, #3b82f6, #1d4ed8
and others) that are separate greens and blues, alongside teals and indigos that may be
deliberate. Sweeping those blind would recolour things that are meant to differ, so they
need a pass with eyes on the result.

## 15.4.3 - 2026-09-05

**Three live failures on one build: the request ceilings, the fallback that undid this
week's work, and an image that had lost its scenario.**

### The rate limit was below the cost of a single build

An eight-subtopic build produced sixty "You have made too many requests" errors. The limit
is the plugin's own, not the vendor's: the `voice` bucket in `ajax.php`, 100 requests per
user per hour. It was sized when a section cost ONE clip. Per-card narration (v15.4.0) and
three-question decision points changed the arithmetic underneath it and nothing re-sized
it — a section now costs about six card clips plus twelve quiz-feedback clips, eighteen
calls, so an eight-subtopic pack needs around 144. It was never going to finish.

Every per-user and site ceiling has been re-baselined against what the work actually costs:
voice 100 → 2500, generate 60 → 600, vendor 200 → 1500, vendor reads 600 → 3000, and the
site aggregates 2000 → 40000 and 1000 → 10000. An upgrade step raises any site still
sitting on an old default; a site that chose its own number keeps it. These are speed
bumps against a runaway loop, not spend caps — credits are the spend cap — so they are
sized to let real authoring through.

### A refusal was being retried, which is the one response that cannot work

Worse than the ceiling. The only marker of a rate-limit refusal was the translated
sentence, in a plugin that ships 53 languages, so nothing on the client could tell one from
a network fault — and every path treated it as transient. Three attempts per card, then
three more for the section fallback, each one certain to be refused and each one taking
another slot from the sliding window. The build dug its own hole deeper the harder it tried.

`ajax.php` now answers a breach with `errorcode: 'ratelimited'`, the bucket, the ceiling
that was applied, and an exact `retryafter` computed from the window rather than guessed.
Every retry loop in the builder and the player recognises it and stops. The run halts once,
the sections that got audio keep it, and the author is told what happened and when they can
finish — one sentence instead of sixty console lines.

### The whole-section fallback is gone

When a card clip failed, the builder rebuilt the whole slide as one file. That is the
architecture this release exists to remove: one clip covering seven cards with the player
estimating each boundary by word count, which is what ran the voice twenty seconds past the
hook card. So the fallback reinstated the reported defect on exactly the sections already
having trouble, **deleted the per-card clips that had succeeded** so work already paid for
was bought again, and left the section looking complete to every readiness check.

A hole is recoverable; a wrong architecture is not. A card-narrated section now keeps the
clips it has, is stamped per-card and pending, and the player fills the gaps — on the
teacher's next visit, or on demand. Both paths were built in v15.4.2 and both are tested.
The same fallback is removed from the multi-language pass. The legacy whole-section path
stays for sections with no cards at all; those exist in saved courses.

### The image had lost the scenario

A hook scenario set in a café was illustrated with a small-engine workshop. The scenario
never reached the image request. The harvester asked the first card for `content` or
`description`, and a hook-scenario card has carried neither since its narrative moved into
the four scene panels — verified by normalising a real card and printing its keys:
cardType, title, keyPoints, keyTakeaway, nothing else. So `scenarioContext` collapsed to
the card title alone, "When Details Are Missing" said nothing about a café, and the vendor
composed from the only signals left: route and industry.

This is the third time this harvester has been left behind by a card shape that moved
(v13.91, v13.94.4, now the scene panels). Both image request paths — the builder's and the
player's — now read the panels under either name the card may carry them by.

### Subtopic numbering

VET keeps 1.1, 1.2: those are real performance-criterion codes from training.gov.au and an
assessor looks them up under exactly that number. Every other route builds one topic and a
list of subtopics, where the dotted form was a positional index dressed up as a code — the
"1." never varied. Those routes now count 1, 2, 3.

### The authoring wizard was 900px wide on every screen

Reported looking at the route chooser on a 1900px display: six dense comparison cards in a
770px column with about 560px of empty page either side, two across and three rows deep.
900px is a reading measure for prose and form fields, and it was being applied to the whole
wizard including the parts that are neither — the route grid, the topic tree, the
generation table.

The shell is now 1400px and the route grid fits as many columns as the row allows
(`auto-fit`, 400px floor), so it is three across on a wide screen, two on a laptop and one
on a phone instead of always two. Form sections keep the 900px measure of their own and stay
centred, because stretching a text input to 1400px would be worse than the problem being
fixed. The 400px floor comes from the arithmetic rather than from eye: 1400px less 2rem of
padding each side leaves 1336px, and three columns need 3 × 400 + 2 × 24 of gap = 1248.

### Tests

`tests/js/test-limits-and-image-context.js` is new: 51 checks, every mutation caught. It
derives what a build costs from the route contract rather than hard-coding it, and holds
the **three** copies of every ceiling — the call site's default, the admin setting's
default, and the upgrade step's target — in agreement, because two of three agreeing is
how a limit gets "raised" and still bites.

`test-route-coverage.js` gains the wizard-width checks, which re-derive the column
arithmetic from the CSS rather than asserting the numbers twice.

## 15.4.2 - 2026-09-05

**Everything the audit found. Nothing new asked for; a lot that was asked for and had
reached only some of the routes.**

### The audit's headline: University had no activities at all

Rendering all seven routes and looking at what came out - rather than reading the code and
reasoning about it - showed University producing no activity block whatsoever. No quiz
panel, no Flip & Learn, no Category Sort, so none of this week's activity work reached that
route: not the one-pill header, not the start screen, not the three-questions-one-at-a-time
quiz. The cause was one card type missing from a list. The flip harvester collects
`keyTerms` from `key-concepts`, `foundations` and `subtopic` cards; University keeps its
key terms on `concept-anchor`, which was not in that list, so the route yielded zero flip
items, and with fewer than two flip items and fewer than four sort items the renderer falls
back to a bare stacked decision-point. Exactly the v15.3.14 defect on a different route.

`concept-anchor` is now in the list. University gets the full activity block. Category Sort
still does not appear there, and that is deliberate: nothing in the University contract is
a good/bad contrast, and manufacturing one would put an activity on a card that does not
mean it. The absence is now asserted so it stays a decision rather than becoming an
oversight someone finds later.

**`tests/js/test-route-coverage.js`** is new and is the real fix. It renders a
contract-shaped pack for every one of the seven routes and asserts what the learner ends up
with - 179 checks. The recurring defect in this codebase is not a broken feature; it is a
feature that works on the route it was tested on and is quietly missing on one of the other
six, with no error anywhere. This suite is what notices.

### Twelve narration defects

An adversarial review of the v15.4.0 per-card narration engine found twelve places where
the rest of the player had not been told that a section's audio now lives on its cards. All
twelve are fixed, and `tests/js/test-narration-hardening.js` pins them - 61 checks, every
one of them mutation-tested.

- **With "one card at a time" off, only the last card was narrated.** `currentCardIndex()`
  defaulted a missing step index to 0 and compared with `>=`, so every card tied and the
  last one in the DOM won: press Play on a seven-card slide, hear the competency summary.
  And with no Next Card button on such a pack, nothing advanced. Cards with no step index
  are now skipped, playback starts at the first card, and the clips chain.
- **Additional languages were silent and still billed.** Translated sections inherited
  `voiceoverPerCard` and the ENGLISH card clips, so the player took the per-card branch and
  played English, while the language pass paid for a whole-section file nothing could
  reach. The English clips are now stripped both before the model sees them and after it
  replies, and the multi-language pass generates one clip per card, keyed the way the
  player looks them up.
- **A learner met silence where the section path would have played.** The section-level
  path has played slightly-stale audio to students since v9.75, because a student cannot
  regenerate and silence - under must-listen, an unleavable slide - is worse. The per-card
  path returned false instead. It now plays, and still orders no synthesis.
- **"Fresh" and "playable" were the same test, and they are not.** The freshness check
  accepts the `pregenerated` sentinel because it means the audio exists; it cannot be
  handed to an Audio element. The old test regenerated a freshly made `data:` URL - paid
  twice - and left a card silenced forever once `stripAudio` rewrote its URL to the
  sentinel. The two questions are now asked separately, and the sentinel goes through the
  cached-file path a learner is allowed to use.
- **Editing one card still re-synthesised the whole slide.** The saving per-card narration
  was built for was only half implemented: the builder did it, `saveSlideEdit` did not. It
  now regenerates the cards whose script moved, and the bulk button and the count beside it
  read the cards through the same one definition of "needs work".
- **A clip that arrived late talked over the card the learner had moved to.** The staleness
  test compared sections, which is all the section-level path ever needed. Narration now
  carries a token; a late clip is stored, stamped and not played.
- **Pause did not survive Next Card.** `_wasNarrating` included `!!currentAudio`, and a
  paused element is still an element. Both pause controls now leave the same state.
- **A card with nothing to say locked a must-listen learner on the slide** - the gate was
  waiting on a clip that would never play. Three paths now release it.
- **"Skip voiceover generation" left a half-built section** that read as per-card and which
  the preload then walked past. It is stamped so the preload finishes it, and the clips
  already paid for are kept.
- **A promoted single-card section left words in no clip.** Its key takeaway, pro tip and
  key terms were pushed into the script and into no card's range - harmless under one file
  per section, never spoken at all per card.
- **Readiness and pacing both ignored the cards.** `isSectionVoiceoverComplete` failed every
  per-card section, so `voiceoversComplete` never went true and the student Play button
  rendered disabled; `_sectionHasNarration` answered "no narration" and armed the dwell hold
  on top of the narration gate - the two-mechanism deadlock v15.3.7 removed, back again.
- **The narration flags outlived the audio.** A re-render left `_narrationActive` true, so
  the next Next Card started the voice unasked; navigation left the card index set, which
  corrupted the focus-return comparison.

### The quiz lost its heading in 15.4.1

Merging the activity number and the activity name into one pill made that pill the panel's
`<h3>`. On flip and sort that is right - the pill is their only heading. On the quiz it
deleted `dpCard.title`, the one heading the model writes for that panel. The title is back
and leads the panel; the pill drops to a plain span beneath it, and stays the heading on
routes that send no title, so no empty heading is emitted.

### Names, again

The naming rule was gated on `hook-scenario`, on the reasoning that University and Topics
and Text "carry no recurring person". University ends with two case studies, which are
nothing but people in situations. Every route now gets the rule, and it names that route's
own cards rather than a sequence it does not have. The prompt's own illustration was still
"Sarah, an employee" - an example name is the strongest instruction in a prompt - and is
now nameless. Jamie joins the banned list.

### Two progress bars

The sort bar called itself "one colour with the lightest possible sheen" and was a two-stop
gradient between two greens, neither of them the page's green tokens. The flip bar, one
panel away, was blue-to-green. Both are now flat `--cc5-green-solid`, the lighter of the two
greens. The score number stays the deeper green because it is text on a light chip and the
lighter one gives 1.95:1 there.

## 15.4.1 - 2026-09-05

**A pass over everything the first per-card build showed, plus two real defects.**

### Two defects

- **The voice came back with you.** Press Next Card, switch tabs, come back, and the
  previous card started talking again. `resumeAfterFocusReturn` resumed whatever
  `currentAudio` pointed at, from where it was when focus was lost, with no test for
  whether it had been playing or whether the learner was still on that card. It now
  resumes only narration that was actually running, on the card it belongs to, and only
  when the run had not been deliberately paused. Anything else is let go of rather than
  left referenced and resumable.
- **Try Again talked over the retry.** The feedback clip for the answer being cleared runs
  8-15 seconds and was tied to nothing but its own end, so the learner re-read the question
  with the explanation of their wrong answer still playing. Both Try Again handlers now
  stop it, as Next Question already did.

### The English sort instruction was never changed

v15.3.19 rewrote it in 53 languages. The one the author reads comes from
`lang/en/contentcreator.php`, which the player resolves BEFORE translations.js - so the
rewrite landed in 52 languages and not in English. The same two-copies-one-moves shape as
the card-order defects. English now reads "Drag each item into X or Y, or tap a button
below it", the same sentence as everywhere else.

### Sarah

Four packs in a row starred the same person. Two causes, one of them ours: the General
prompt's worked example of card headings named Sarah twice, and an example name is the
strongest instruction in a prompt whether it was meant as one or not. That example is now
nameless, and every route with a scenario card carries an explicit naming rule - pick a
name that belongs to this course, keep it across the pack's own cards, and never use the
handful the model reaches for by default.

### What the learner sees

- **The Next Card arrow points down**, because that is where the next card is.
- **No green outline on the card being narrated.** Depth alone - the same raised shadow a
  card gets on hover. The ring was a second signal for a state that already had one, and on
  a green-palette card it read as an outline drawn around the content.
- **More top padding on every card**, so the flow badge and the speaker are not crammed
  against the coloured top rule, and more space between a card and its Next Card button.
- **The activity heading and its number are one pill.** They named the same thing and sat
  side by side as a pill and a piece of text.
- **The Challenge Mode start screen fills its height** instead of huddling at the top of
  it, capped so the Start button stays above the fold on a laptop.
- **Flip & Learn fits.** Nine cards at 220px was three rows and the third was below the
  fold - on the activity whose instruction is "explore all 9 cards to unlock the next step".
- **Category Sort is unsquashed**: more room between the columns, in the drop zones, and
  around the instruction. The new item slides in from the right, and its text travels
  further than the panel, so the eye goes to the sentence rather than to the columns where
  the last answer landed.
- **The sort progress bar is one colour.** An orange-to-green gradient said "you are doing
  better as you go right"; it measures progress. The score is a chip rather than bare text,
  and its number is the card's green rather than the orange that everywhere else on this
  screen means "press me".

### Colour, final position

White on the solid orange buttons, on a fill deep enough to carry it (4.85:1 and 6.05:1
across the gradient). The bright brand orange stays on the chips and rails that carry no
text, and the dark grey is kept for the one genuinely light fill that does - the green
"done" chip on the activity stepper. That is the author's own rule - white until the fill
is too light, then a grey - applied honestly: white and the brand orange at 55% cannot both
be had, because that pairing is 2.90:1.

## 15.4.0 - 2026-09-05

**One audio clip per card, and the five-key-point contract the vendor published today.**

### Narration: the estimate is gone

A section was one audio file covering all seven cards, and the player worked out where
each card's narration sat inside it by dividing the file's duration in proportion to word
counts. That is an estimate of something that was never in the file. In production the
voice ran about twenty seconds past the hook card into the next card's script, and cards 2
and 3 then resumed in the wrong place. Five releases - v15.3.4, .6, .6b, .6c and .7 - tried
to make the estimate behave like a fact by parking the playhead at each boundary. None of
them could.

Each card now has its own clip. It starts at zero, and `ended` is the end of that card's
narration rather than a computed boundary. Everything the estimator used to drive now comes
from the audio itself: which card is being read, when the Next Card button lights up, how
far the reveal gate opens, and when the slide counts as read.

Two things fall out of it. A teacher who edits one card re-synthesises **one card** - each
clip carries the hash of the script it was made from, so the others are left alone; before
this, one edit invalidated the whole section. And the on-demand path can generate just the
card the learner is looking at, rather than several minutes of audio before the first word.

Details worth knowing:

- **The builder generates per card**, skipping any card whose stored clip still matches its
  script. If a card fails all three attempts it falls back to one clip for the section -
  one file that says everything is better than six that say most of it.
- **The section-level preload and the teacher's priority pre-generation now skip a per-card
  section.** Both read the `pregenerated` sentinel as "nothing here yet", and a per-card
  section carries that sentinel when it is *complete* - so without the guard a teacher
  opening a fully narrated slide would have re-synthesised the whole slide, per slide, and
  been billed for audio nobody hears.
- **The legacy whole-section path is untouched** and still runs for sections with no
  `cards[]`. Existing courses play exactly as they did; only newly built or regenerated
  packs are per-card.
- **Every per-card script gets the same finishing pass as the whole-section script.** The
  ranges used to be word-counted and nothing more, so they skipped the `..` collapse and
  the horizontal-rule strip. Now that each one is its own TTS request, skipping it would
  have meant hearing the "dot" defect once per card.
- Pressing pause ends the run, so the voice does not restart at the next card boundary.
  Leaving the slide, or opening the activities, does the same.

### Five key points

Replit published cards contract `2026-09-05.3` and floors `2026-09-05.1` today. Both were
read from the live production endpoints before a line of this was applied - the client
follows the vendor here, and the 4 September outage was what happened when it did not.

- `concept-explainer` asks for **five** key points of 42-56 words, 210-280 for the points.
  The number is changed in all four places that encode it: the prompt, `CC_EXPECTED_ITEMS`
  (which is what the card's whole-card word floor is costed from), the quality criteria a
  repair pass is given, and the vendor-floor snapshot the tests measure against. A new
  section in `test-field-ranges.js` fails the build if any one of them moves alone.
- The base `conceptInsights[].text` range moves from 35-50 to 42-56. The vendor's floor for
  that field is now 42, so the base sat *below* it - inert while every route overrides it,
  and a trap the moment one stops.
- Both contract windows are closed to the single version production now serves. A window
  left open after a rollout stops noticing the next move, which is the failure it exists to
  prevent.

### Tests

`test-per-card-narration.js`, 40 checks: the scripts, the freshness rule, playback through
the real handlers with a recording audio stub, the Next Card hand-off, the last-card
completion, and the two paths that could quietly re-synthesise a whole slide.
Mutation-tested - restoring the estimator, playing the wrong card, or trusting a moved
script each fails it.

## 15.3.19 - 2026-09-05

**Category Sort can be dragged, and the vendor's next contract will not set off the alarm.**

### Drag and drop, on every device

The author asked for "drag and drop and tap for both mobile and pc". The obvious way to
build that is two implementations - mouse events for desktop, touch events for a phone -
and then only one of them gets fixed each time something changes. This is pointer events:
one code path for mouse, touch and pen, and `test-sort-drag.js` fails if it ever splits
in two.

- The current item is a drag handle. It follows the pointer, the column under it lights
  up, and dropping on one files it. `touch-action: none` on the handle is load-bearing -
  without it the browser claims a touch drag as a page scroll and the feature silently
  does not exist on the device that most wanted it.
- A press that does not move is not a drop. The item text sits directly above the two
  buttons; a stationary pointerup filing the item would mean every learner who tapped the
  text to read it had answered by accident. Six pixels of movement is the threshold.
- A drop resolves through the same `_handleSortAnswer` the buttons call, so the drag is a
  second way to press the same control rather than a second scoring path.
- **The tap buttons stay.** They are the keyboard and screen-reader path and they are
  faster than a drag on a phone. The item itself is also a keyboard control now: left
  arrow files it under the positive column, right arrow under the negative, and the
  aria-label names both.
- The instruction says what to do: *"Drag each item into X or Y, or use the buttons below
  it."* Rewritten in all 53 languages at once rather than English first, along with a new
  `sortItemAria` key. The previous sentence described the decision and not the action.

### The vendor's 2026-09-05.3 contract

Replit built it on 5 September and has not published it. It binds `questions` and
`schemaVersion` to `decision-point`, requires the v2 three-question shape on the fixed
routes, requires each card type's primary content array, and raises concept-explainer to
five key points.

- **Both contract versions are now accepted**, cards and floors alike, so the "CONTRACT
  MOVED" alarm stays quiet across the publish. A guard that cries wolf through a planned
  rollout is a guard people learn to ignore - which is exactly how the floor contract
  moved unnoticed on 4 September. Accepting the version silences the alarm; it does not
  claim the client matches every field-level rule in it.
- **The decision-point prompt no longer offers the legacy fallback on the fixed routes.**
  It was written when v2 was built but unpublished, so a server that could not emit
  `questions` needed somewhere to go. Under 2026-09-05.3 the legacy fields are rejected
  outright, so that escape hatch now leads into a failed section. Topics and Text is not a
  fixed route and keeps it.
- **The prompt states that `questions` and `schemaVersion` belong to the decision-point
  and no other card**, naming the 5 September pack where all three landed on the
  competency-summary.

**The five-key-point change is deliberately NOT in this release.** Production served
`2026-09-05.2` when this was built - read from the live endpoint, not taken from the
conversation - and their schema constrains the model to three. Asking for five against it
produces a card that is three points short by our own new count check, which puts every
section into the repair queue. It goes in the moment the production endpoint reports
`2026-09-05.3`.

### Tests

`test-sort-drag.js`, 26 checks, driven through the real handlers in a real DOM with the
columns given explicit rectangles (jsdom has no layout, so every point would otherwise hit
the first column). Mutation-tested: making a stationary press file an answer, or making
the hit test always return the first column, each fails it.

## 15.3.18 - 2026-09-05

**A blank card reached a learner. Everything else here is what the same pack showed.**

### The root cause

A live General section rendered two of its seven cards as a flow badge and a title with
nothing underneath - "What this means: Overcoming Listening Barriers", and an empty body.
A third rendered three panels in a four-panel grid.

Validation was not asleep. `validateCards` failed that section on every attempt. The fault
was in the last line of defence: `generateFiveCardSequence`'s salvage rule, which exists so
that one soft miss cannot destroy 1,500 words of good content, measured the SECTION total -
`_salvageWords >= 200`. Five good cards out of seven clear 200 words easily, so the section
was kept whole; and salvaged cards are deliberately stamped `failed: false` so that they
render. Right for the five, catastrophic for the two. The only trace was `needsReview` - a
line in "N sections need attention" that a learner never sees.

A whole-section measure cannot answer a per-card question. Three changes close it:

- **An empty card is now its own structural failure**, named as one. Previously the nearest
  check was the voiceover rule, which fires on "no narration AND no content" - so it caught
  this, but reported it as a narration problem, and could not tell the salvage path WHICH
  cards were empty. Narration explicitly does not count as content: `voiceoverText` is
  never rendered, and treating it as "the card has something on it" was the loophole.
- **The salvage rule reads per card.** One empty card means the section is not salvageable
  and is sent for regeneration. These seven cards are a sequence; a learner who hits a
  blank "What this means" has lost the explanation the next four cards build on.
- **A short content array is reported**, with the expected count derived from
  `CC_EXPECTED_ITEMS` - the same table the card's word floor is costed against, so the two
  can never state different numbers. Reported rather than failed: three panels of real
  teaching is content worth keeping. The four arrays that render as a fixed grid
  (`sceneParts`, `conceptInsights`, `steps`, `items`) enter the repair queue; the rest
  surface to the author for review, so a paid repair cannot start firing on every section.

### Three questions on the wrong card

The vendor's schema exposes `questions` on every card object, so a live pack attached all
three to the competency-summary and returned the decision-point in the legacy
one-question shape. The learner saw one question, and the three orphans were harvested as
competency-summary prose - inflating that card's word count and every measurement taken
from it. The client now rehomes them to the decision-point and strips them from any card
that cannot render them. The real fix is on the vendor's side and has been asked for.

### What the learner sees

- **Flip & Learn backs are a prompt, not the paragraph.** Every back was the card body
  verbatim - 42-56 words on a concept insight, up to 160 on a mental-model step - and nine
  of those tile into a wall of prose the learner has already read. The back now carries the
  opening sentence, adding a second only while the total stays under 24 words. Whole
  sentences only; a truncated flip back is worse than a long one.
- **Flip cards flip both ways.** The first click was one-way, so a learner who wanted to
  re-read the term the insight was answering had no way back to it. Progress is tracked on
  a separate `data-explored` attribute, so flipping a card back cannot un-complete the
  activity or replay the celebration.
- **Mental-model steps are numbered, all of them.** v15.3.10's "numbered unless a teacher
  picked an icon" read the teacher's choice out of `s.icon` - the same field the model
  writes its own guess into - so a live card showed icons on steps 1-2 and numbers on 3-4.
  The model's icon is now stripped at normalisation, the renderer numbers unconditionally
  (which repairs packs already saved), and the step icon picker is gone from both editors.
- **The "-> Result" label is gone from the mistakes card.** A hard-coded English label on
  every consequence, in every language, saying what the layout already said.
- **The narration no longer speaks punctuation.** A full stop that follows a quoted
  sentence which already ended in one - `...saying is.'.` - is read aloud by Chirp as
  "dot". The existing `..` collapse cannot see it, because the two stops are separated by
  the quote mark. Fixed in both `fixGrammar` and cc-state's `_fg`, which must stay
  identical or the narration hash diverges from the builder's.
- **Card animations are slower.** Every card-entrance, flip-in, badge-pop and
  feedback-reveal duration and delay is 1.6x what it was.

### Colour and contrast

- **One rule for labels on solid accents**, instead of a per-colour argument: white while
  the fill is dark enough to carry it at 4.5:1, and `--cc5-on-accent` - a dark grey, not
  black - on everything lighter. The brand fills are unchanged. This is the third position
  on the orange in three releases; the fill was never the variable.
- **One green.** The activity stepper's "done" chip carried its own lighter green, so a
  page could show two greens side by side. It is now the shared pair, and it is the lighter
  of the two. `--cc5-green-deep` keeps the darker tone for the one place that wants white
  on green.
- **`--cc5-text-tertiary` was 3:1 on white** - under the AA floor for body text, and used
  for three real sentences, including Card 6's benefit lines. Now about 5:1.

### Space

- **The activity block's badge and progress stepper share one row**, and the stepper is
  hidden entirely while the start screen is up, because that screen already names the same
  three activities in the same order.
- **The activity panel's chip and heading share a line**, so an activity opens with two
  rows of header instead of five.
- **The Category Sort columns no longer reserve 280px of empty space** above the item the
  learner is reading.
- **Opening the activities scrolls the block to the top** of the viewport, clear of the
  sticky header. It used `block: 'nearest'`, which for a tall block already partly in view
  moves nothing at all.

### Activity flow

- **"Next Activity" does not appear until the quiz is finished.** It was rendered disabled
  but visible from question one, alongside "Next Question" - the exit offered before the
  work was done.
- **Pressing Next Question stops whatever is talking.** The feedback clip for the answer
  just given runs 8-15 seconds and only slide navigation ever stopped it, so a learner who
  reads faster than the voice took the next question with the last answer's feedback over
  it. The same applies when leaving an activity.
- **The voiceover message on the build screen told half the truth.** Card narration really
  is generated when a learner first opens the activity; quiz feedback narration is only
  made at build time, and skipping it leaves the quiz silent until the pack is regenerated.
  The message now says so.

### Tests

Two new suites, 47 checks. `test-empty-card-gate.js` pins the empty-card predicate, the
per-card salvage decision and the short-array report, and was mutation-tested - disabling
either gate fails seven of its checks. `test-card-presentation.js` drives a real DOM and
checks what the rendered card actually shows. `test-icons.js` was updated for numbered
steps, with its assertions taken off comment text that quotes the code it removed.

## 15.3.17 - 2026-09-05

**General is seven cards. The second scenario is back.**

General was the only narrative route without an `applied-scenario` - the learner met a
person and a problem on card 1 and never found out what happened to them. The story simply
stopped.

v15.3.10 tried to fix that by raising the client to seven on its own, and it took the route
down: the vendor's count was six, every section came back short, each one burned a billed
repair pass, and the card their pipeline dropped was `hook-scenario`, so packs shipped with
no opening scenario at all. It was reverted in v15.3.12.

This time the vendor moved first. Asked whether General could go to seven, they answered:
*"There is no schema or product reason for General to remain six. Your proposed seven-card
sequence is consistent with the existing narrative pattern, restores the scenario
resolution, and reuses an already-supported card shape."* They raised it everywhere and
published contract `2026-09-05.2`. **The live production endpoint was read directly before
a line of this was applied**, and it reports:

    hook-scenario, concept-explainer, mental-model, applied-scenario,
    mistakes, competency-summary, decision-point

Byte-identical to the array they already publish for VET, Workplace and PD - so General
joins the seven-card narrative family rather than introducing a new shape. The
instructional arc becomes ORIENT -> UNDERSTAND -> APPLY -> **RESOLVE** -> EXPLORE ->
CONSOLIDATE -> CHALLENGE.

### The change was rehearsed before it was made

The whole thing was built, run green against all 21 suites and then reverted while waiting
for the publish, so what shipped was a verified patch rather than fresh work against a
deadline. That rehearsal earned its keep - three suites failed on the first attempt and one
edit was actively dangerous:

- **`POLICY_CARD_SCHEMA` carries a byte-identical `cardTypes` line to General's.** An
  unscoped replace would have silently given Policy a seventh card the vendor does not
  build - the 4 September defect, reintroduced by the fix for it.
- **`test-server-verdict.js`'s fixture is a General pack.** At six cards it now fails the
  count, the section never reaches the assertions, and the suite reports success while
  testing nothing.
- **`test-route-dispatch.js` kept its own hardcoded `{general: 6}`** - a second
  hand-maintained copy of the count, stale the instant General moved, reporting the route
  broken when the route was right. Now derived; the independent number belongs in the
  contract test, which checks it against the vendor.
- **`test-card-quality.js`'s drift guard** required the change to be declared: 33 -> 34
  cards, 205 -> 211 criteria.

### Gaps the old revert had left behind

Checked deliberately rather than assumed. `applied-scenario` had **no** `CC_FIELD_SPECS`
entry for General and **no** `contrastTypes` entry - so restoring the card naively would
have shipped one card per section that renders perfectly and is never measured. Both are
filled, and v15.3.16's guard now asserts every card type in every route's order has a field
spec, so it cannot recur on any route.

`card-quality.js` gains a General `applied-scenario` block: same person and situation as
card 1, opening on what has CHANGED, one panel naming the cost concretely, panel 3 ending
on a direct question about a case the card-3 model does not cleanly cover, and panel 4
resolving by naming the thing rather than recommending a category.

### Everywhere the count lives, moved together

`CC_CARD_ORDER`, `getCardCountForMode`, `GENERAL_CARD_SCHEMA.cardTypes` (the POSITIONAL
backfill - stale, it stamps the wrong type on four cards silently), `contrastTypes`,
`CC_FIELD_SPECS`, the numbered card list in the system prompt, every "Card N" and
"Cards 1-N" cross-reference inside it, the card-quality criteria, and the numbered list on
the route-chooser screen that an author reads to pick a route. `test-card-order-contract.js`
checks all of them against the published contract on every route - 36 checks.

`CC_CARD_CONTRACT_VERSIONS` is now `['2026-09-05.2']`; the rollout-window entries are gone.

## 15.3.16 - 2026-09-05

A guard, and a version number that matches the source.

### Every card type in a route's order must be measurable

`test-card-order-contract.js` now asserts that every card type in every route's
`CC_CARD_ORDER` has a `CC_FIELD_SPECS` entry. A card type without one renders perfectly
and is never MEASURED - no word ranges, no contribution to the "written short" verdict,
nothing - so it is the one card in the pack whose quality is unchecked, and nothing says
so.

Written while preparing General's move to seven cards, because checking what the v15.3.10
revert had left behind turned up exactly that gap: `applied-scenario` had no General field
spec and no `contrastTypes` entry. Restoring the card without noticing would have shipped
one unmeasured card per General section. Every route passes today; the guard is so that
the next card added to any route cannot arrive unmeasured.

### Why this is its own release

No runtime code changed - this is a test file. It is being released rather than held back
because the previous package and the working tree had drifted apart by exactly this file,
and two builds that differ while sharing a version number is the trap that caused trouble
earlier today: Moodle upgrades on `$plugin->version`, so a second build under the same
number is refused or silently skipped and the site keeps running code the author believes
they replaced.

General's move to seven cards is written, tested green and reverted, waiting on LMS Labs
publishing contract `2026-09-05.2` to production. It ships as the next release.

## 15.3.15 - 2026-09-05

LMS Labs answered the last open question — which decision-point shape each route's strict
schema actually enforces — and the answer changed how we ask for three questions. It also
exposed a client bug that had been quietly costing Topics and Text an entire activity block
since v15.3.11.

### Three questions now ask for the shape that can carry them

The vendor's answer, per route:

- **VET, Workplace, PD, University, General, Policy** share one strict schema. It accepts
  the legacy `heading` / `standardItems` / `errorItems`, and additively accepts
  `schemaVersion: 2` + `questions[3]`. It does **not** accept top-level `question` or
  `options`. Their words: three distinct questions "only survive when emitted through
  `schemaVersion: 2` + `questions[3]`".
- **Topics and Text** has its own decision-point union — `title`, `question`,
  `options[4]{text, correct, feedback}`, plus `goodItems`/`badItems` — and no
  `heading`/`standardItems`/`errorItems` at all.

So the prompt block no longer offers v2 as the conditional option. It asks for v2 directly,
because that is the only shape that can represent three questions, and keeps each route's
own contract as the fallback if the schema ever rejects it. It also now says explicitly
that `questions` replaces the question and its options **and nothing else** — on Topics and
Text a card that drops `goodItems`/`badItems` while adopting v2 would silently cost the
learner the Category Sort while still looking complete.

Per-option feedback is now the primary ask too, since the vendor implemented it: each
option carries its own `feedback`, and the question-level line explains the correct answer.

### Topics and Text gets its activities back

v15.3.11 rebuilt that route around content-driven `subtopic` cards and retired the fixed
`key-concepts` / `key-takeaways` slots. The activity harvester was never told, so it went
on looking for card types the route no longer emits.

The failure was silent and total. `renderDecisionChallenge` only builds the three-activity
block above 2 flip items and 4 sort items; below that it falls back to a bare
decision-point. **Topics and Text has had no Flip & Learn and no Category Sort for three
releases**, and nothing logged it, nothing failed, and the pack still looked plausible.

The vendor confirmed `keyTerms` was always permitted on subtopic cards and has now made
`goodItems`/`badItems` explicit on that route's decision-point, so the fields do arrive —
it was only ever two card-type patterns in our own harvester dropping them.
`test-topicstext-activities.js` (14 checks) renders a real pack and counts the rendered
activities rather than reading the harvester.

### The contract guard accepts a rollout window

`2026-09-05.1` adds a per-route `decisionPointByRoute` map and makes the Topics/Text
activity fields explicit. Both changes are additive — counts and orders are identical — so
this client is correct against either, and the guard now accepts both rather than shouting
"CONTRACT MOVED" on every generation for the duration of a planned rollout. A guard that
cries wolf is a guard people learn to ignore, which is exactly how the floor contract moved
unnoticed on 4 September. `test-card-order-contract.js` asserts the runtime guard and the
test snapshot name the same set, so they cannot drift.

### Also

Production provider-failure counters have recorded **zero rows** since publication — no
`timeout`, `rate_limit`, `token_limit`, `model_refusal` or `provider_error`. That is
evidence of normal operation at concurrency 2, though not yet evidence that every
classification path has fired, so concurrency stays at 2.

## 15.3.14 - 2026-09-05

LMS Labs published to production and answered the last four questions, two of which they
answered by shipping code. This is the client meeting that.

### An aborted submit can recover the section again

Since v15.3.7 the client has FAILED a section rather than re-POST an aborted submit,
because the vendor charges at submit and PHP is not bound by the browser's abort - the old
behaviour bought the same section up to four times. The cure cost the author a whole
section on any transient blip.

The vendor now returns an explicit acknowledgement: `/prompt/start` answers
`"idempotency": true` on every keyed path and `false` on the legacy unkeyed one. So the
retry is back, and it is **earned rather than assumed** - the flag flips only when a real
response on this page said so, never from a version number, because being wrong costs the
author money. `ajax.php` forwards the acknowledgement to the browser; the replay reuses the
same key AND the same payload, since a different payload under the same key is a 409.

Two details worth recording:

- The key had dots in it from `CC_VERSION`, and `PARAM_ALPHANUMEXT` strips them - so the
  key in our logs was not the key in theirs. Deterministic either way, but exactly the sort
  of discrepancy that costs an hour when a charge is disputed. Stripped at source instead.
- Because two sections run concurrently, an abort on the very first submits can still
  happen before any acknowledgement has landed. That is correct and deliberate: the flag is
  false, so those fail rather than risk a double charge.

### Confirmed against the live contract

`GET /contracts/cards/v1` is now readable in production and was fetched directly rather
than transcribed. Everything matches, including General's corrected order. The vendor also
confirmed Topics and Text takes `heading` (not `title`) with exactly two paragraphs, which
this client already sends, and implemented per-option feedback on decision-point v2 -
options may now be a plain string or `{text, feedback}`, both of which the normaliser
already reads.

### Tests

`test-idempotency.js` (21 checks) drives real aborts against a scripted server and counts
actual POSTs rather than reading a flag. It covers the money-losing direction (retrying
against a server that does not deduplicate) and the section-losing one, and asserts the
PHP layer forwards both the header and the acknowledgement - without which every JS check
passes while the feature does nothing.

Two things it found and did NOT fix, recorded rather than hidden:

- `generateFiveCardSequence`'s section-level loop still makes its next attempt after an
  abort with a fresh key, so against a non-deduplicating server an abort can cost two
  charges rather than four. Unreachable against this vendor now, but "unreachable" is not
  "fixed", and the two attempts send different prompts so they cannot share a key.
- A section whose every attempt fails comes back with six BLANK cards - correct card types,
  empty titles - and no `generationFailed` marker. Verified identical in v15.3.12, so it
  predates this work, but it means a totally failed section can look generated.

## 15.3.13 - 2026-09-05

Two days of guessing at the vendor's internals ended this release. LMS Labs were sent nine
questions, answered all of them, and three answers changed what was built. Their side then
shipped the coordinated server change; everything below is this client meeting it.

### The 4 September outage was ours, and the card count is now a contract

The vendor's answer to "what does your pipeline do when the returned card count does not
match your expectation?" was: nothing deliberate. It treats the array as unusable, retries
OpenAI, falls back to Gemini, and if no provider returns the expected count the job fails.
**That is what "AI generation failed - all providers exhausted" looks like from here**, and
it is the mechanism behind the 4 September General failures - v15.3.10 asked for seven
cards against a server expecting six. v15.3.12 had already reverted the count; this
records the cause, because it was logged as a vendor capacity problem and it was not one.

The same exchange found two more routes one release away from the same fault. Asked for
the authoritative table, the vendor first answered **pd 6, university 6** - against a
client that has always said 7 - and noted that the checked-in client "currently disagrees
with the server for pd". Rather than delete a card from each route, they were asked which
side should move, and they chose to raise the server so the designed seven-card sequences
stay intact. Topics and Text was hard-coded to exactly five server-side and is now the
3-10 range this client has always declared.

None of that would have been findable, so the number is now readable. The vendor publishes
`GET /api/moodle/content-creator/contracts/cards/v1`, carrying the count **and the ordered
card types** per route - ordering matters, because a count alone would not have noticed
that the card being dropped was `hook-scenario`. `generator.js` watches
`meta.cardsContractVersion` on every generation and shouts when it moves, exactly as it
already does for the floor contract, and `VENDOR_CARD_COUNTS` in `test-field-ranges.js` is
now a transcript of a published contract rather than a number copied out of a chat.

### Challenge Mode opens on a start screen

Reported from a real module: the first quiz question sat below the fold, under a flow
badge, a "Complete N activities" banner and a progress stepper. The banner has moved onto
a new panel 0 that carries the whole brief, and the block now opens on one button.

The half that matters more is what the brief says. Nothing in the product ever told a
learner what passing meant, and on this plugin it is unusually strict: the completion rule
reads "Student must complete all activities at 100%", and the completion record is only
written at that mark. Someone who gets two of three right has not almost finished the
section - they have not finished it. The start screen says so, in the learner's own
language, before they begin. The figure comes from `CC_CHALLENGE_PASS_PCT`, which the
completion check now also reads; a test pins it against the teacher-facing lang string, so
the three copies cannot drift.

### Three questions instead of one, on every route

The decision-point card now carries three multiple-choice questions. There were two ways
to build it and the vendor chose: three questions on one card, not three cards. Their
reasoning is the reasoning of the section above - the card count is theirs, pinned by a
strict output schema, and three cards would have moved the count and the ordered sequence
on all seven routes.

- New schema v2: `{schemaVersion: 2, questions: [{question, options[4], correctIndex,
  feedback}]}`, exactly three questions and four options each.
- **v1 still works everywhere.** Every manifest already saved is v1, and production still
  returns v1 until the vendor publishes. `normalizeCardSchema` folds both into one
  internal shape so the renderer never branches, and the prompt names a legal fallback for
  a v1 server rather than demanding a field the schema forbids - an unsatisfiable
  instruction is how the General outage started.
- The three questions are asked to test three different things: the rule, a case where the
  obvious answer is wrong, and what the learner would actually do. Option parity is
  required on each, because a correct answer that is visibly the longest can be picked
  without reading it.
- Shown one at a time inside the quiz activity, with a counter, for the same fold reason
  as the start screen. The activity unlocks only when all three are right.

Three handlers that had only ever seen one question were fixed in the process, and two of
them were live defects rather than tidying:

- The quiz's unlock searched `.cc5-challenge-next-btn` with `.first()` across the whole
  challenge. The start button carries that class and renders first, so answering correctly
  would have lit up a button the learner had already pressed while the quiz's own Next
  stayed disabled - **the challenge would have been impossible to finish, on every route.**
- Try Again reset every question in the panel, wiping answers the learner had already got
  right.
- Review returned to the first panel, which is now the brief rather than the first
  activity.

### Prompt caching: the language block moved to the end

The vendor confirmed **no prompt caching was configured**, said they intend to turn it on,
and asked for a specific ordering - route prompt, legislation, spelling, language,
variable context. This client was doing the opposite on the non-English path: v13.13
prepended the language block to out-rank a spelling block that the same change had already
stopped sending, and the prepend was never removed. The cost is total for a cache, because
a German course and a French course then share a zero-character prefix despite the next
55k characters being identical. It is now appended, where the model attends hardest anyway.

They also asked, unprompted, that one exact sentence be preserved - `Generate ALL content
in <Language>. This is NON-NEGOTIABLE` - because their server pattern-matches it to
reapply the language requirement during secondary repair passes. **We were not sending it
at all**, which means every repair pass on a non-English pack ran with no language
instruction attached. It is now in the language block and pinned by a test.

### Also

- `Idempotency-Key` is sent on every submit, so a duplicate submit returns the original job
  instead of buying the content twice. Scoped to one logical attempt, not to the section:
  keying on the section would have made the repair pass return the output it was sent to
  repair. The submit-abort guard still fails the section rather than retrying, and must
  keep doing so until the server can be observed honouring a key.
- Each activity, and each new question, now scrolls to the top of the screen under the
  sticky bars, using the same helper as the Next Card reveal.
- Two new label keys across all 53 languages, and one language's string that had been
  pasted into three other languages' blocks by the script that added it.
- Four new suites: `test-challenge-start.js`, `test-quiz-three-questions.js`,
  `test-prompt-prefix.js`, `test-card-order-contract.js`. All mutation-tested - every fix
  in this release was reverted in turn and the suite made to fail for the stated reason.

### What two adversarial reviews of this release found

The work above was reviewed twice before shipping, against the previous release's diff.
Both rounds found real defects and the second round found defects introduced by the first
round's fixes, which is the argument for having done it twice.

**The card order was wrong on General, and fixing it broke four more copies of itself.**
Reading the newly published contract showed General's declared order disagreed with the
server in two ways: `mistakes` and `mental-model` were swapped, and `decision-point` sat
fifth with `competency-summary` after it, where every other narrative route ends on the
decision. Correcting `CC_CARD_ORDER` then left five other encodings stale, and only one of
them was documentation:

- `GENERAL_CARD_SCHEMA.cardTypes` is what `normalizeCards()` uses to backfill a missing
  `cardType` **positionally**. Left stale it stamped four of six cards with the wrong type,
  so they rendered through the wrong renderer and were measured against the wrong field
  spec, and nothing reported it.
- The arc sentence in the General prompt still read ORIENT → UNDERSTAND → EXPLORE → APPLY →
  CHALLENGE → CONSOLIDATE, contradicting the card contract 25 lines below it - and that
  sentence is the one framed as superseding everything above it.
- Seven card-quality criteria carried pre-reorder numbers, including one telling the
  summary card not to repeat a card that now comes after it.
- The route-chooser screen's numbered list - how an author picks a route in the first
  place - promised the cards in the old order.

`test-card-order-contract.js` now checks all five encodings against a transcript of the
live contract, on every route.

**A three-question card was invisible to every quality check.** The de-duplication rule
skipped the keys `question` and `options`, and the walker applies its predicate at every
depth - but those are also the key names *inside* each entry of `questions`. Harvested
text for such a card was the empty string, so word count, readability, duplicate
sentences, padding, density and the Policy invented-figure guard all saw a blank card and
passed it. It could also destroy good content: the repair-regression guard discards a
repair whose word count fell, so a repair that upgraded one question to three scored zero
and would have been thrown away in favour of the worse version.

**The three-question prompt block was asking six routes for a forbidden shape.** Its first
draft opened "THIS SECTION REPLACES the decision-point specification given earlier" and
then named `questions` - but VET, Workplace, PD, University, General and Policy carry the
decision in `heading`/`standardItems`/`errorItems` precisely *because* the vendor's schema
has never emitted `question`/`options`, and the fallback clause named that second
forbidden shape. An unsatisfiable instruction is how the 4 September outage began. The
block is now additive: the route's own contract stays authoritative and only the number of
questions changes.

**Also fixed, each found by review rather than by use:**

- Try Again on the standalone decision-point wiped a question already answered correctly -
  the same defect fixed inside the challenge earlier in this release, sitting one function
  away, and the renderer had no per-question element to scope to.
- The start screen printed "100%" twice, and the figure in the sentence was a literal in
  all 53 translations, so changing `CC_CHALLENGE_PASS_PCT` produced "80% You need 100%".
- A `correctIndex` the server sent as missing, out of range or as a string marked no option
  correct - the player only unlocks on a correct answer, so the learner could not finish
  the section. Such a question is now dropped, and `validateCards` checks every question
  has exactly one correct option, which nothing had ever verified.
- Option parity was judged on question one only, on a card whose own prompt says the rule
  applies to all three. Both of its failure modes are repairable, so the repair could never
  fire on questions two and three either.
- A card written exactly to the published v2 schema scored three permanent "option
  feedback: 0 words" issues, on every route - noise occupying the card's ten-issue slice.
  Exempted, narrowly enough that a two-word explanation on the correct answer is still
  reported.
- Topics and Text: the vendor's schema names the subtopic heading `heading`, ours measured
  `title`, and a missing scalar measures 0 words rather than "absent" - so a perfect pack
  reported every heading as "0 words, needs 2-6" and tripped the "PACK IS WRITTEN SHORT"
  verdict. Canonicalised in one place, and the old field is deleted rather than copied,
  which would have counted every subtopic heading twice.
- The card-count contract watch ran only on the success path, and a contract that has moved
  manifests as a failure - so the detector could not fire on the symptom it was written for.
- Accessibility: the question counter announced a bare number instead of "Question 2 of 3";
  focus was dropped on `<body>` after the Start button; a `focus()` call was cancelling its
  own smooth scroll.
- Dark mode: three new surfaces hard-coded light fills under theme-following text, and the
  unlocked "Next Question" button rendered as disabled because a dark rule of equal
  specificity sat later in the file. One new colour pair failed AA at 3.10:1. The
  reduced-motion override could not fire, being one specificity point short of the rule it
  was meant to cancel.
- The teacher-facing "Question 1 of 3" note was styled with a `.cc5-player` prefix, and the
  edit modal is appended to `document.body` - so the rule could never match.

## 15.3.12 - 2026-09-05

### URGENT: General reverted to six cards

**v15.3.10 raised General to seven cards and broke the route.** The card count for a route
is not the client's to set: `generator.js` sends `route` with every generation precisely so
the server uses its own `ccExpectedCardCount` - the comment on that line has said so since
v11.42 - and the vendor's is 6 for General.

So every General section came back with 6, failed "Expected 7 cards, got 6", and burned a
billed repair pass. Worse, the card the pipeline dropped was **hook-scenario**: packs were
shipping with no opening scenario at all, which is a bigger hole than never having the
second one.

Reverted: card order, card count, field specs, the system prompt's card list and
numbering, the mode-screen chips, and the applied-scenario quality criteria.
applied-scenario can return to General the moment the vendor adds it server-side; the
client side is five places, all now cross-referenced from `CC_CARD_ORDER.general`.

**A guard so this cannot recur.** `test-field-ranges.js` now carries
`VENDOR_CARD_COUNTS` - a hand-copied snapshot of the vendor's `ccExpectedCardCount` per
route, exactly as `VENDOR_FLOORS` snapshots its word floors - and fails the build when the
client asks for a count the vendor does not build. Mutation-tested: raising General back
to 7 fails it with the reason spelled out.

Note on the same production log: **"AI generation failed - all providers exhausted"** is
vendor-side and unrelated to this. The billing guard behaved correctly throughout it,
refusing to re-submit six already-charged jobs.

## 15.3.11 - 2026-09-05

### Topics and Text is back, rebuilt around subtopics

The route had no card on the mode screen and `ccNormaliseTeacherRoute` folded it onto
General, so it could not be chosen. Reinstated - and amended, because the old build was
not really a topics-and-text layout: it had FOUR FIXED SLOTS (Overview / Key Concepts /
Examples & Application / Key Takeaways) whose headings the platform supplied and whose
shape every subject had to fit. Its prompt even said "Do NOT return a heading... The four
headings are fixed".

Now the topic sets the shape: as many `subtopic` cards as the topic actually has, three to
ten, each carrying **its own heading**, **numbered** 1..n, and coloured from a ten-tone
cycle so a full topic never repeats. Two-column grid, one-at-a-time reveal, the voiceover
dot, the speaking outline and the activities block all carry over unchanged.

This needed one architectural change: every route until now declared a FIXED card count
and `validateCards` hard-failed on "Expected 5, got 8". A content-driven route declares a
RANGE instead (`CC_CARD_COUNT_RANGE`), and the validator, the repair prompt, the expected
card order and the regenerate completeness check all understand it. Getting that last one
wrong would have re-billed every pack that was not exactly the nominal length.

### Activities sized to the screen

Flip cards and sort items were harvested from whatever the pack happened to contain, so a
seven-card pack produced 14+ flip cards and 10 sort items - the grid ran below the fold and
the sort became a slog. Capped at **9 flip cards** and **6 sort items**, in the one place
they are derived, so every route gets it. The sort cap keeps the two categories balanced:
the harvest pushes every good item before every bad one, so a plain slice could have handed
the learner six items that all belonged in the same column.

### The mode screen was advertising a card list the route does not build

General promised "6 cards per section" and six chips while building seven. Worse, the chip
LABELS named pedagogy stages rather than cards, and two misled: **"Explore" was the
mistakes card** - nothing told an author that card 3 is "what commonly goes wrong" - and
once applied-scenario returned, "Apply" (the step-by-step model) sat beside "Apply in
Context" (the second scenario) reading as two versions of one thing. Every other route
names the card it will build; General now does too. A test compares each route's advertised
chips against `getCardCountForMode`, so the screen cannot drift from the contract again.

### The country selector did not reach the topic titles

It was wired to two of the three places it matters - the generation prompt
(`getSpellingInstructions`) and the card normaliser - and to nothing in builder.js, which
is where the vendor's suggested topic and subtopic titles arrive. So an Australian course
could list "Behavior Programs" in its contents above cards whose prose said "behaviour".
The titles now go through the same regional-spelling pass, on all three suggestion paths
(VET elements, Workplace/Policy topics, PD/General/Topics-and-Text bulk), reading whichever
country selector the route renders.

## 15.3.10 - 2026-09-05

All from live testing.

### Icons now mean something, on every route

Three faults stacked on top of each other, which is why this looked unfixable before.

**`getIcon()` turned every unknown name into a SHIELD.** The model is asked to choose an
icon name, and General and Policy were never told which names exist - so it invented
plausible ones and every panel became a shield. A security glyph on four steps of a
process card, and beside the word "Result" on every mistakes item.

**Nine names hardcoded in the renderers did not exist either** - `arrow-right`, `compass`,
`globe`, `upload`, plus `chevronLeft`/`chevronRight`/`alertTriangle` casing typos. All
shields. `arrow-right` beside "Result" was the most-seen wrong glyph in the product. The
four missing icons are now defined and the typos corrected; a test now fails the build if
any `getIcon('...')` names an icon that does not exist.

**The mistakes CSS hid the SVG outright and forced the character `★`.** So "What to watch
out for" items carried a gold star - a highlight or a rating - whatever the code resolved.
They now carry the caution glyph, in warning amber.

The fix, following the author's instruction ("no auto generation based on content, let's
just have set icons for each card", "same icons always - like 1,2,3,4 - because set icons
like that at least mean something"): **each card type has its own fixed pool, ordered by
the ROLE each panel plays**, which the prompts fix and the model cannot vary. Panel 1 of a
hook is always the setting, panel 4 always the question. Content matching is gone - it was
what made "Design Thinking" render a hazard triangle ("de-**sign**"). A mental-model card
is a process whose framework the model chooses, so no icon set fits them all: its steps are
**numbered**. Generated icon names are dropped at normalisation, so a teacher's own pick in
the Edit Slide picker is now the only thing that can override a set icon.

### The General route was missing its second scenario

`applied-scenario` was absent from General, while the General system prompt told the model
to "control the whole seven-card sequence" and described a progression ending
"...applied contrast -> mistakes -> capability summary -> independent decision". The model
planned a second scenario every time and was then required to return six cards without one.
Restored, with its own quality criteria, and the prompt's own numbering made consistent.

### "Start Activities" left the voiceover running

The card-boundary park only fires when the narration crosses INTO an unrevealed card, and
on the LAST card there is no next card - so nothing parks and the voice keeps reading. The
activities branch cleared the dwell timer, revealed the block, and never touched the audio,
so the previous card was read aloud over the question. Now stopped inside
`revealProseActivities`, so every route into the activities is covered rather than just
the button.

### "Next Card" did not scroll the card to the top

Two causes. The handler called `focus()` on the card's heading with no `preventScroll`, so
the browser's own scroll-into-view on that descendant pre-empted the measured smooth
scroll that had just started. And the offset only measured OUR topbar - on a real Moodle
the theme pins its own site header above us, so the card's top went to viewport zero,
underneath it. The offset is now whatever is genuinely fixed or sticky across the top, and
an element that scrolls away with the page correctly contributes nothing.

## 15.3.9 - 2026-09-04

From your production log.

**The server told us the content needed teacher review, and no teacher was ever told.**
The server now returns `success: true` with `qualityStatus: "warning"` and names the exact
fields its own repair passes could not lift - in your run,
`cards[5].standardItems[0,1,4].benefit`. `ccQuality()` logged that to the console and
returned void. Nothing in the plugin read `underFloorFields` or `qualityStatus`: one call
site, zero consumers. So the section was saved as good, did not appear in "N sections need
attention", and would have gone to learners with three short benefits on the consolidate
card.

The comment at the call site claimed `fieldIssues()` covers this anyway, because it
measures the same fields independently. Tested rather than trusted: it does not. A short
benefit produces "standard benefit 1: 4 words, needs 14-22", which matches no
`CC_REPAIRABLE` and no `CC_REVIEW_ONLY` pattern - deliberately, because pure length
shortfall is capped server-side and flagging it would flag every section forever. So
`needsReview` stayed undefined.

The server's verdict is a different signal from our own length measurement: it is the
vendor saying it ran its repairs and could not fix it. That now raises `needsReview`, and
the server's own words lead `qualityIssues` so the reviewing teacher sees which fields.
The verdict travels on the response and is stored per-attempt on the candidate, because
sections generate concurrently and `bestCandidate` can keep an earlier attempt's cards
than the last verdict describes.

This is the third instance of one shape: a check runs, finds something real, and the
finding dies in a log nobody reads. The other two were `qualityIssues` having no reader
and `policyFidelityIssues()` never reaching the repair queue, both fixed in 15.3.7.

**Floor contract tracking moved to `2026-09-04.3`**, which the server reports it is
enforcing - this silences the "FLOOR CONTRACT MOVED" warning that was firing on every
generation. The `VENDOR_FLOORS` snapshot in `test-field-ranges.js` was written from what
the vendor said it built, not from what it published; it still needs verifying against a
live `GET /contracts/floors/v1`, and the constant now says so.

Word ranges deliberately unchanged. The under-floor fields are produced inside the
vendor's own pipeline, and chasing them from this side is the loop that wasted a day.

## 15.3.8 - 2026-09-04

The five findings 15.3.7 deferred. Nothing from any audit pass is now outstanding.

**The decision-point scenario line was counted twice on every route.**
`normalizeCardSchema` derives `question` from `heading` (the vendor emits no `question`
field, so the prompt asks for the decision to be carried in fields that survive) and
retains both copies. `harvestCardText` skipped the other retained aliases and not this
one - so the scenario line was harvested twice, on every decision-point, on every route.
That feeds `contentWords`, `readabilityIssues`, `duplicateSentenceIssues`,
`concretenessIssues` and `specificDensityIssues`: the card measured about 40% longer than
it is, and the duplicate-sentence check was being handed a repetition the model never
wrote. Filed as LOW; it is not. Skips whichever copy is redundant, only when the two are
actually identical.

**Five of six policy card titles were unvalidated.** POLICY_SYSTEM_PROMPT asks for
`title(4-10 words)` on all six cards, but `CC_FIELD_SPECS.policy` had no `title` entry and
`validateCards`'s `TITLED_CARD_TYPES` gave the route the three-type short list. An
untitled card rendered headingless rather than being repaired. Both now cover the route,
at the 4-10 the prompt states.

**`getExpectedCardOrder` is now table-driven.** The reported defect - a wrong 7-card order
for `pd` - was a false positive: every route already agreed, verified route by route. But
the agreement was held by hand across seven branches, and this file's own comments record
three shipped bugs from exactly that (v13.65 University, v13.94.3 Route 5, v15.3.6c
Policy), each one a route added to the prompts and not to the order table. It now reads
`Prompts.CC_CARD_ORDER` directly, and the suite asserts the correspondence for every
route.

**The Location line named the state twice.** `gatherContext` already sets `location` to
`"VIC, AU"`, and four route builders each appended `, ${context.state}` on top - so the
VET, Workplace, PD and Policy prompts read "- Location: VIC, AU, VIC". One helper now
builds that line, appending the state only when it is not already there, with a
word-boundary match so "WA" is not found inside "WATERLOO".

**Select slugs were being shown to the model.** `gatherContext` read `.value` from the
audience and job-level selects, so the prompt said "- Target Audience: new-starters" and
"- Job Level: senior-tech". Three different treatments of this existed in one file: the
ChatGPT prompt-file path read the option label correctly, the PD and General branches
patched it locally with `.replace(/-/g, ' ')`, and Workplace, Policy and VET sent the raw
slug. Fixed in two places deliberately: `ccSelectLabel()` resolves the real label at the
builder, and `ccHumanValue()` guards every interpolation in the prompts - because a
manifest saved before this release carries the raw slug on its context, and "Regenerate
Failed" hands that context straight back, so a builder-side fix alone would never have
reached existing packs.

## 15.3.7 - 2026-09-04

Audit passes four and five.

### Pass five - blocking

**The Policy route could not get past Step 2.** `updateGenerateTopicsButton()` returns
early unless the mode is vet or workplace. v15.3.0 added a complete policy branch to the
body of that function - document required, policy title required - which was therefore
dead code, and this function is the only thing on the Workplace/Policy screen that
un-hides the forward button. The author picked Policy & Compliance, uploaded the document,
filled in the metadata, got subtopics suggested and selected, and Step 2 showed only a
Back button. Every other Policy fix in 15.3.6 and 15.3.7 sat behind this one missing
string. The second gate, at the re-render hook, had the same omission and is fixed too.

### Pass five - billing

**Every image generated during a build was billed as an uncovered image.**
`generateTopicImage()` - the bulk path, and by its own comment "almost every image in a
pack comes through THIS path" - sent neither `subtopicKey` nor `sectionId`. ajax.php reads
exactly those two keys and forwards them to the vendor, which covers the first image per
section inside the subtopic's price and charges regeneration separately. Both arrived
empty, so nothing could be matched to a paid subtopic: a 15-section pack with images paid
15 separate image generations on top of the subtopic price that already covered them. The
other two image paths have sent these since v13.95.2, and unlike TTS there is no
server-side cache to absorb it.

**An aborted submit bought the same section up to four times.** The client aborts the
`generate_slide_async` POST after 12 seconds, but ajax.php's own cURL timeout on
`/prompt/start` is 180 seconds and the server charges at SUBMIT. The "refuse to re-submit
a billed job" guard can only fire once a jobId is in hand, and on the abort path no
response is ever parsed - so the abort was classified transient and re-POSTed, up to three
more times, each one creating and charging another job nobody would ever poll. The window
is now 30s, and an abort with no jobId fails the section rather than guessing: it lands in
"N sections need attention" and the author retries deliberately.

**Regenerating an upgraded pack used the old release's prompts.** `_promptCache` is a
within-run memo of the assembled system prompt, written onto `context` - which
`generate()` returns, `serialize()` did not strip, and "Regenerate Failed" hands straight
back. Its key was `mode_country_language`, identical across releases, so it hit: a pack
built on 15.2.0 and regenerated after upgrading to 15.3.7 was regenerated against the
15.2.0 prompt stored in its own manifest, silently reverting every contract fix since. One
policy cache entry measured 33,616 characters, written into every saved manifest.
`serialize()` now strips it, and the key carries the release so manifests already in the
database cannot serve a stale prompt either.

### Pass five - the Policy route was not being checked for truthfulness

**`policyFidelityIssues()` was computed and then discarded three times over.** It is the
only check in the product that catches a fabricated obligation - an invented deadline, an
invented penalty, a figure that appears nowhere in the uploaded document. Its output went
into `softIssues` with a comment calling it "the only issue in this list that misinforms a
learner". But the repair queue is the `CC_REPAIRABLE`-filtered subset of softIssues, and
none of the three fidelity strings matched any pattern in it; the same filter feeds
`needsReview`, so the section was not counted in "N sections need attention" either; and
`qualityIssues` on the card has no reader anywhere in builder.js or player5.js. So a pack
telling staff they face a consequence their policy does not contain shipped silently.

Invented figures and an unquoted rule are now repairable. A missing source document raises
review but is deliberately NOT repairable - a rewrite cannot fix a missing source, and
sending it to repair would spend a second billed call per section - so `CC_REVIEW_ONLY`
now exists for faults that must reach a human without spending a call.

**And the one policy check that DID reach repair was deleting real policy figures.**
`POL-SCOPE-4` forbids a dollar figure on card 1, because on this route a business-impact
cost is normally invented. It was a bare regex with no reference to the source, and its
issue string begins `QUALITY STANDARD [`, which IS repairable - so on a Gifts and
Benefits, Expenses or Procurement policy that states a dollar threshold in its own
operative clause, it reliably spent a paid call instructing the model to delete the figure
the document actually contains. The exact inversion of what the route is for. Criteria can
now declare `sourceAware`, and a forbid rule only fires on content the source does not
contain.

**The policy repair prompt carried no source.** Its system prompt says "a repair may NEVER
add an obligation, timeframe, threshold, figure or consequence that is not in the source
document" - and the user prompt sent the issues and the cards and nothing to check against.
Impossible in combination with the fidelity issues now reaching repair at all. The data was
already at the call site.

### Pass five - the Policy route's ChatGPT path

**The downloadable prompt file was the Workplace 7-card contract.** `#cc-download-wp-prompt`
is rendered by the step Policy shares, and the handler hard-coded `'workplace'` - so a
policy author was handed WORKPLACE_SYSTEM_PROMPT, "exactly 7 cards", and the
business-impact framing this route exists to exclude. Resolved at click time now, the same
fix and the same reason as the PD/Topics-and-Text button beside it.

**And anything pasted back was discarded.** The file's own step 5 says "Copy the whole
reply and paste it into the box ... Your slides are built from it directly - no second AI
call". On Policy that was false: `gatherContext` overrides `priorityContent` to the
uploaded document (correct - it is the fidelity source) and leaves the paste in
`pastedContent`, which the fast-parse never read. The author paid for a full generation
the file had told them they would not make. Both are now searched, document first; the
block parsers are marker-guarded so a policy document cannot false-positive.

### Pass four Four defects, two of them billing the customer for work they did not ask
for and one of them silently teaching the wrong route's content. Each fix ships with a
test that fails against the old code - verified by reverting the fix and watching the
test go red, not by assuming.

### Billing - the activities toggle has never worked

**`activitySettings` was dropped by the manifest whitelist.** builder.js has collected the
"include decision challenge activities" toggle since v11.11 and generator.js reads it off
the manifest, but manifest.builder.js copies an explicit list of fields and this one was
never on it. The property arrived as `undefined`, and the test is
`activitySettings?.enabled !== false` - for which `undefined` means ENABLED. So for the
entire life of the feature, an author who switched activities OFF was still charged for a
decision-point card on every section of every pack, and player5.js - reading the same
missing field - then refused to render them. They paid for content they were never shown.

This is the second field lost to that whitelist in two releases (`policyMeta` was the
first, fixed in 15.3.6). The whitelist is now **one table**, `MANIFEST_SETTINGS`, applied
to both planning paths, and the assembly is extracted into `buildPlannedManifest()` so it
can be tested without running a generation. `test-route-dispatch.js` asserts that every
key in the table reaches the manifest.

### Billing - the Policy route was generating VET content and paying for a repair

**`buildFiveCardUserPrompt()` had no `policy` branch**, so every Policy section fell
through to `buildVetFiveCardUserPrompt()`. `POLICY_SYSTEM_PROMPT` asks for exactly 6
cards; the VET user prompt asks, twice, for "a 7-card vocational learning sequence". The
model follows the more concrete instruction and returns 7, `validateCards()` fails with
"Expected 6 cards, got 7", and a repair pass fires - **a second billed AI call on 100% of
Policy sections**. The seventh card was then absorbed by relabelling `applied-scenario`
as a second `mistakes`, so the pack shipped two Common Misreadings cards and no Check
Your Understanding.

The new `buildPolicyFiveCardUserPrompt()` is deliberately not a copy of the Workplace one.
`ccVarietyBlock()` is omitted: it instructs the model to *invent* a specific situation and
commit to it, which is the exact opposite of this route's "scene-setting detail may NOT be
invented". Equipment, job tasks and "real workplace example" are omitted for the same
reason. The section's own clause text is presented first and as the authority, with the
rest of the document following as context only, so a figure from an unrelated section is
not available to be lifted.

`test-route-dispatch.js` now asserts the general property rather than this one case: every
mode produces a distinct prompt, and no user prompt asks for a different card count than
its own system prompt demands.

### The narration could skip a card's audio entirely

**The boundary park computed its rewind point from the segment the tick landed on.**
`timeupdate` fires about four times a second, but it does not fire in a backgrounded tab,
and a seek moves the playhead in one jump - so a tick can arrive several segments past the
card the learner is on. Rewinding to *that* segment's start skips the narration in
between: the learner clicks Next, card 2 appears, and the voice reads card 3's words over
it. Card 2's narration is never heard by anyone and nothing indicates it was skipped. The
park now scans forward for the first segment past the revealed frontier.

### Dwell and narration deadlocked in the default configuration

**`armDwellLock()` exempted only "must listen" mode.** The rule - and the author-facing
string - is that the dwell hold applies where there is no narration pacing the card. The
default configuration is voiceover ON with progression FREE, and that fell straight
through, so both mechanisms ran at once: the narration parks at the boundary and tries to
mark Next "ready", and the ready class is explicitly withheld from a button carrying the
dwell class. The learner got silence, a grey button reading "read to continue", and no
indication that anything was waiting on them, for up to 120 seconds.

The guard now asks whether the section can actually produce audio (`_sectionHasNarration`)
rather than which progression mode is set. A pack with voiceover switched on whose audio
never generated has none, and there the dwell hold is correct and still applies - which
the suite asserts in both directions.

## 15.3.6 - 2026-09-04

Two adversarial audit passes over everything added in 15.3.0-15.3.5. The first found 16
defects, the second found 8 more - **three of them introduced by the first round of
fixes**. Everything below was proven by running it, not by reading it.

### Blocking - the Policy route did not work at all

**`planTopics()` had no `policy` branch**, so every Policy & Compliance build hit the
`throw` and the author saw "Failed to generate topic structure" before a single AI call.
`planPolicyTopics()` - the whole document-structure planner shipped in 15.3.0 - was
unreachable dead code. This is precisely the defect the comment above that dispatch
records for Topics-and-Text, repeated one route later.

**`gatherContext()` had no `policy` branch either**, and its final `else` returns the
UNIVERSITY context. So a Policy pack was generated as `mode: 'university'` - the academic
prompt, the academic card schema, and `uniPastedContent` (a textarea this route never
renders) as its source. Every policy-specific feature switched itself off silently:
`POLICY_SYSTEM_PROMPT` was never used, `policyFidelityIssues()` bailed on its own mode
check, `planPolicyTopics()` received an empty document, and `renderPolicyStrip()`
suppressed itself because the manifest said university. Four of this release's other fixes
were inert behind it.

**`manifest.policyMeta` was never written.** builder.js has passed it since 15.3.0, but
manifest.builder.js copies an explicit whitelist and `policyMeta` was not on it - so the
identity strip was dead code on every pack ever built.

### A regression in Topics-and-Text, introduced in 15.3.0

**The narration seek was translating an index it should not have.** Three numberings are
in play: render order, index into `section.cards`, and the segment's own card index. The
card sync's segments key on `section.cards`; the prose sync's count prose cards only. The
v15.3.0 translation was applied to both, so on any prose section whose decision-point is
not last, "Next Card" seeked the voice to the *wrong card* - and on the last card, to
nothing at all. Each sync now declares which numbering it uses.

### Defects the fixes introduced, caught by the second pass

- **A dwell-locked button pulsed "press me" while inert.** Fix 2 stopped `applyProseGate`
  destroying dwell locks; four separate `ready`-nudge sites then had no matching guard, so
  the button advertised itself for the full dwell. Exactly the failure the previous fix's
  own comment describes, arriving from the other side.
- **`state.parked` was never cleared on play.** A learner who resumed with the player's own
  control instead of Next left it true forever, so their next pause kept the Next button
  pulsing while nothing was being read.
- **Every card advance cancelled its own screen-reader announcement.** The announcement
  timer had been folded into `clearDwellTimer()`, and the Next handler announces and *then*
  arms the dwell lock - whose first act is `clearDwellTimer()`. Broken in every
  configuration, including dwell-disabled. The suite was green throughout because nothing
  asserted on the live region. It does now.

### Other real defects

- **`policyFidelityIssues` reported correctly-quoted figures as invented.** The card side
  kept `:` and the source side did not, so every clock time, ratio and colon-form clause
  reference lifted verbatim from the policy became a release-blocking issue.
- **A valid short clause produced "NO SOURCE DOCUMENT ... Do not publish it."** The
  400-character backstop was written for the whole document and then fed a per-clause
  extract; the planner's own fold threshold is 25 *words*. The length test now measures the
  document and the comparison uses the clause.
- **PD asked 30-65 words for a field the vendor's repair will not expand past 22** - a
  range entirely above its ceiling, so every benefit line on that route would have been
  reported short forever. Caught by the `declaredMax` guard the day the ceilings were
  published; nothing before that could see it.
- **`splitPolicySections` discarded everything above the first heading** - in a policy,
  routinely the purpose, the definitions and the headline penalty.
- **`planPolicyTopics` had no cap.** A 150-clause document planned 150 subtopics, each
  billed. Now folded into 15, with no clause's text lost.
- **`sourceExtract` was written and never read**, so the fidelity check compared against
  the whole document and a figure from an unrelated clause passed. Now threaded into
  generation - with the system-prompt cache proxied back to the shared context, because a
  per-section copy silently disabled it.
- **The mute preference was one site-wide key.** Muting narration in one activity muted it
  in every Content Creator activity for that learner.
- **`_formatReviewDate` validated the month and not the day**, so `2026-02-31` rendered as
  "31 February 2026" on a compliance course's chrome.

### Also

`grunt eslint` passes with zero errors for the first time this session - five
`no-useless-escape` errors, all in regexes added during 15.3.x, were masked because the
suites are run separately from the linter.

## 15.3.5 - 2026-09-04

**The bottom navigation is no longer stuck to the viewport.** It was pinned with
`position: sticky; bottom: 0`, which cost a band of screen on every slide and, worse, sat
on top of the card - the last lines of a scene panel were routinely hidden behind it. With
one card at a time the whole point is that the card in front of the learner is fully
visible, and a floating bar taking the bottom eighth of the viewport works directly against
that. It now sits at the end of the slide and is reached by scrolling past the content it
navigates away from.

The slide topbar stays sticky: it is thin, it carries the progress counter, and nothing is
read beneath it.

**A revealed card now lands at the top of the viewport, clear of that topbar.** The reveal
used `scrollIntoView({block: 'nearest'})`, which moves the minimum distance needed to touch
the element - so a card just off-screen ended up flush with the bottom edge, technically
visible and practically a sliver. `block: 'start'` alone would tuck the card's badge and
title under the sticky topbar.

The topbar's height is not fixed - it wraps on narrow screens and carries a variable
progress counter - so it is measured at reveal time and applied through `scroll-margin-top`,
which `scrollIntoView` honours natively. No manual scroll arithmetic, and it works whether
the scrolling container is the window or a parent element. A CSS fallback covers the case
where the browser scrolls before the measurement lands.

**Stepped cards no longer carry stack spacing.** A card in a scrolling stack wants 2.5rem
beneath it; a card that is the only thing on screen does not, and that margin plus the gap
under the Next button was enough to push a card that would otherwise have fitted the
viewport past the fold. Tightened for the stepped case only - a non-stepping slide still
scrolls as a stack and keeps its separation.

## 15.3.4 - 2026-09-04

Six fixes from watching the first packs that generated successfully after the outage.

**The voiceover now stops at the end of each card and waits.** As built, the reveal
FOLLOWED the audio: crossing into card 2's narration revealed card 2. That is right for
Topics-and-Text, where a section is one piece of prose, and wrong for the thing this
feature is for - the voice ran straight through every card while the learner was still
reading the first, and the Next Card button was decoration because the pack advanced
itself. "That way we focus the student's attention one card at a time" only works if the
card in front of them is the only thing happening.

The playhead is now parked at the boundary: paused, and rewound to the start of the next
card's narration so nothing is missed when it resumes. Clicking Next reveals the card and
presses play. Ten new checks cover it, driving a real HTMLAudioElement.

**Fixed: the narrated card stopped being highlighted at all.** A regression from v15.3.0.
`.cc5-card.cc5-vo-speaking` has highlighted the narrated card since v13.92 by matching the
element carrying `data-vo-card` - and wrapping every card in `.cc5-step-card` moved that
attribute onto the wrapper, which has no background or border by design. The class landed
on an element that could not show it. The whole card now lights up at hover strength while
it is being read, which is what was asked for.

**Fixed: the voiceover icon sat outside the card.** It was given a strip of its own above
the card and pulled back with a negative margin, which put it half over the top border,
reading as a stray icon floating on the page. It is now positioned inside the card's own
top-right corner, level with the flow badge.

**New: a detector for padding.** Found by reading the first pack that generated cleanly.
Every check in this file passed it; it was still bad content, in a way nothing looked for.
It met every word floor, stayed on subject, named a person, a place and a time - and every
panel had the same shape: one concrete sentence, then an abstract one whose only job was to
reach the count.

> "…could negatively impact the outcome, the team's performance, and even the customer's
> perception of the service." (25 words, no information)

That is not a coincidence of wording. It is the cheapest way to add twenty-five words to a
sentence about anything: name three abstractions and conjoin them. The floors make adding
words compulsory and nothing made the added words carry information.

The other tell is worse because it is so literal: *"Alex recalls **a specific instance**
last month…"* — the contract demanded a specific, and the model wrote the word "specific"
and never gave one. Both are now detected and both were negative-tested against the real
production text.

**Option parity moved to the top of the repair queue.** A decision-point whose correct
answer is the longest option is not a weak question, it is a broken one - full marks for
picking the longest line without reading it. Production showed distractors of 5, 6 and 5
words against a correct answer of 13. The check already caught it, but it sat eighth in a
list whose top slice is what the repair prompt receives, so in a pack with several issues
it was routinely never sent for repair.

**New: `test-banned-words.js`, protecting the v13.98 decision.** That decision has now been
re-litigated twice. The original list banned ordinary English; a model told not to use a
word substitutes a synonym and leaves the syntax intact, and one pack came back with 19
instances of "in total" (for *overall*) and 22 of "makes sure" (for *ensures*), producing
"for in total health" and "the most right nutritional support". v13.98 dropped every word
whose only fault was being common. On 4 Sep the vendor independently shipped a filter
containing almost exactly those words, and their own note flagged the risk of a future
build silently restoring the substitutions. Eleven checks now prevent it, including one
asserting the plugin never mechanically replaces a banned word - the list is a prompt
instruction and nothing else.

## 15.3.3 - 2026-09-04

**The outage is over.** With LMS Labs floor contract 2026-09-04.2 live and v15.3.2
installed, General generated content on every attempt. Four production samples show the
repair loop converging: 7 fields under floor, then 2, then 1, then 0.

**`summaryLine` was the one field that kept failing.** Floor 15, our ask 18-26, and it came
back short on all four samples. Its instruction was `summaryLine(18-26 words linking to
Card 1)` — a word range and an abstract job, with nothing telling the model what 18-26
words of this field actually looks like. Every other field that holds its length in
production has a worked example beside it; this one never did.

It now carries one, at 21 words, labelled as a shape rather than as content, and says
explicitly that the field is a sentence and not a caption.

**Not done: adding the vendor's banned words to our own banned list.** Their filter is
still reporting *crucial, foster, effectively, efficiently, significantly, appropriate,
ensuring, overall* in every sample, and the obvious response is to forbid them in our
prompt too. That is precisely the mistake v13.98 fixed, and the evidence is in this
codebase: a model told not to use a word substitutes a synonym and leaves the syntax
intact, and one Sports Nutrition pack came back with 19 instances of "in total" (for
*overall*) and 22 of "makes sure" (for *ensures*), producing "for in total health" and
"the most right nutritional support".

`BANNED_WORDS` in prompts.js was deliberately rewritten then to drop every word whose only
fault was being common — *overall, appropriate, generally, various, significantly,
critical, effectively, ensuring* — and `SUBSTITUTION_ARTEFACTS` exists so that decision
cannot be silently reversed. The vendor's list contains almost exactly the words ours
removed. Raised with them rather than repeated here.

## 15.3.2 - 2026-09-04

Aligns the plugin with LMS Labs floor contract **2026-09-04.2**, which fixes the workplace
outage server-side. Their changes and these have to land together.

**A successful generation can now carry unresolved quality problems, and we were ignoring
them.** Until 2026-09-04.2 the server returned 502 when content was left under floor and
the whole pack was discarded. It now returns the cards it produced with `success: true`,
a `warning`, and `meta.qualityStatus: "warning"` — the right call, because a teacher can
review a thin card and can do nothing at all with an error.

But `callAI()` read exactly one field off a successful response (`data.content`) and threw
the rest away, so a warned pack would have arrived looking indistinguishable from a clean
one. It now logs the warning unconditionally on the warn channel with the fields the server
could not fix and any banned wording it could not remove, and records it in the debug log.
The plugin's own `fieldIssues()` measures those same fields independently and records them
on the card, so the teacher is told either way — but when the server has already named the
exact fields, that belongs in the log beside them.

**The floor contract version is now checked at runtime.** `test-field-ranges.js` holds a
hand-copied snapshot of the vendor's table, and nothing would have said when it went stale —
the plugin would quietly guard against last month's numbers while production enforced this
month's. That is not hypothetical: floors moved under us on 4 Sep and the first anyone knew
was a route failing in production. Every generation now compares
`meta.floorContractVersion` against the version the guards were written against and shouts
when they differ.

**The full 41-rule contract is encoded, including the number that was missing.** The table
here held four fields; the published contract has 41. More importantly it publishes a
`declaredMax` per field — the ceiling their repair will not expand past — and that is the
half that made v15.2.2 wrong.

**The guard now tests the condition that actually predicts an outage.** Not "does our
minimum clear the floor" but *where the vendor's repair lands*: `min(floor + 4, declaredMax)`.
A short field is not fatal if repair lifts it clear; it is fatal when repair lifts it to a
value that still fails. That was `decision-point.standardItems[].text` — floor 10, ceiling
10, repair target 10 — under floor in 3 of 3 production jobs. A margin rule on our own
minimum called that field fine both before and after. The new rule reports it as BLOCKED
with the arithmetic, and negative-testing confirms it: restore the old ceiling and it fires.

2026-09-04.2 raises that ceiling to 16, so repair now targets 14 and the deadlock is gone.

**Fixed: `topicstext.paragraphs[]` sat exactly on a floor nobody knew about.** With only
four fields in the table, Topics-and-Text reported as having no floored fields at all — and
was recommended as a workaround route on that basis. The full contract shows a floor of 55
on `paragraphs[]` against our ask of 55-70, on four cards. Raised to 58-70, which clears it
by three at no cost to the writing.

**Reverted `competency-summary.standardItems[].text` to 7-10** (from the v15.2.2 workaround
of 12-16) and `decision-point.options[].text` to 10-16, both now confirmed against the
published contract. A range whose minimum exceeds the vendor's declared maximum is a build
failure from this release.

## 15.3.1 - 2026-09-04

**Reverted two word ranges that the vendor's own repair pass can never satisfy.** This is
housekeeping, not a fix for the current outage — see the note at the end.

v15.2.2 raised `competency-summary.standardItems[].text` to 12-16 and
`decision-point.standardItems[].text` to 12-18, as a workaround for a vendor floor of 10
that rejected the whole of a 6-10 contract. The vendor has since published how repair
works: their expansion passes target `min(floor + 4, declared maximum)`, and **both numbers
come from their table**, where this field's declared maximum is **10**.

That makes the workaround worse than the problem it solved. A minimum of 12 sits entirely
above a ceiling of 10, so their repair aims at 9-10 words while our prompt asks for 12-16,
the two pull against each other, and every one of those labels would be reported short on
every generation forever. Reverted to 7-10 and 10-16 — the values with production history
behind them, and the ones the vendor explicitly recommended.

**New guard: a range above the vendor's DECLARED MAXIMUM is now a build failure.** The
floor was only ever half the contract. `VENDOR_DECLARED_MAX` encodes the other half, and
`test-field-ranges.js` fails on any range whose minimum exceeds it — which is exactly the
mistake v15.2.2 made and nothing could have caught.

**New: BLOCKED ON VENDOR is now a distinct result, neither pass nor fail.** Some ranges
cannot be fixed from here at all. `decision-point.standardItems[].text` has a floor of 10
and a declared maximum of 10, so their repair targets exactly the floor and any drift below
fails the whole generation. No value we could write passes: at or below 10 fails the floor,
above 10 is clamped back by their repair.

Marking that green would say "this route is fine" about the reason a route is down; failing
the build on it would block every release on someone else's bug. It now prints as `BLKD`
with the reason, the date it was raised and the contract version, and the build fails if a
blocked entry ever loses its justification.

**Floor table updated to the vendor's published contract `2026-09-04.1`**, confirmed live in
a production response. The only floor they moved is `competency-summary.standardItems[].text`,
10 → 5.

> **This release does not fix the workplace outage of 4 Sep.** Three failed jobs
> (`e30e91bc`, `1172afbd`, `833b0b47`) were analysed field by field. Our contract asks for
> MORE words than every floor in every case; the failures are the model returning FEWER, and
> the vendor's own four passes failing to expand them. `standardItems[].text` is under floor
> in 3 of 3 jobs. That is theirs to fix.

## 15.3.0 - 2026-09-04

**New: one card at a time, on every route.** Topics-and-Text has revealed its cards one by
one since v13.92 - card, Next Card button, next card - and that is now how VET, Workplace,
University, General, PD and Policy behave too. One card holds the learner's attention
instead of a whole slide competing for it.

Almost none of this is new machinery. The reveal, the "listen to unlock" gate, the
narration seek and about forty CSS rules already existed and were already addressed
through `data-prose-index`; what did not exist was any way for the other nine card
renderers to emit that chrome. Rather than edit nine renderers, `wrapSteppedCard()` puts a
behaviour-only envelope around whatever a renderer returns. It has no background, border or
padding of its own, so every route keeps its own look.

| Behaviour | Where it came from |
|---|---|
| Reveal one card, retire the spent button | existed (v13.92, v13.94.6) |
| Gate the button until narration passes the card | existed (v13.94.4) |
| Narration follows the learner on Next | existed (v13.94.7), now index-translated |
| Voiceover dot showing which card is being read | existed (v13.92), now also the mute control |
| Mute narration without pausing it | **new** |
| Seconds per card when there is no narration | **new** |
| Focus moves into the revealed card, reveal announced | **new** |

**The mute is a mute, not a pause.** The requirement was explicit - it keeps playing, the
learner just does not want to hear it - and there is a correctness reason too: in "must
listen" mode the Next button unlocks from audio PROGRESS, so pausing would silently strand
a muted learner on card 1 with a locked button. It sets `audio.muted`, and the test counts
`pause()` calls to prove it never pauses.

The choice is per learner, per browser, in `localStorage` - one learner muting narration
must not mute it for the class - and it is re-applied to each new audio element, because a
fresh `HTMLAudioElement` is always unmuted and the choice would otherwise be forgotten at
every section boundary.

**Seconds per card.** New `cardDwellSeconds` setting, default 0 (off, which is exactly the
behaviour every existing pack has). It holds the Next button for N seconds when there is no
narration setting the pace, and is deliberately ignored when narration is on and "must
listen" is selected - two independent locks would leave the button grey after the voice had
plainly finished reading the card. Values are clamped 0-120 on the way in, so a corrupt
manifest cannot lock a learner out of a card forever.

**Fixed: the step index is not the narration index.** `renderSlideContent` sorts
decision-point to the end, so a pack whose manifest holds it third renders it last and
every later card shifts by one. The Next button carries a RENDER position; narration
segments are keyed on MANIFEST position. Passing one where the other was expected would
have jumped the playhead to the wrong card - silently, and only on some packs. Both numbers
are now on the element, and the element is the translation table.

**Fixed: the card-level narration sync had no failure handler.** A comment said it must not
have one because "the reveal gate is a Route 5 concept and these routes have no prose
buttons to unlock". True until this release, false now. Without `onerror`/`onended` a
learner in "must listen" mode whose audio 404s was locked on card 1 for the rest of the
slide - the exact defect v13.94.8 fixed on the prose route. Registered only when stepping,
so a non-stepping slide keeps the previous behaviour.

**Accessibility.** Hidden cards are `aria-hidden`; a spent button is disabled by property,
not merely by `pointer-events`; focus moves into the newly revealed card, because leaving
it on a button that has just been disabled drops it to `<body>` and loses the learner's
place; and the reveal is announced through a polite live region.

**New: a real DOM test harness.** The build spec for this feature listed "neither audio
behaviour nor CSS rendering can be verified from this environment" as the reason it had a
spec and no implementation. Half of that was true and half was a missing harness.
`tests/js/dom-loader.js` runs the real player under jsdom with a real jQuery, real event
dispatch, a real `HTMLAudioElement` and a real `localStorage`.

`tests/js/test-one-card.js` renders an actual manifest and clicks actual buttons: **65
checks**, all of which failed at least once against a deliberately broken build before
being trusted. One of them was worthless when first written - it asserted `audio.paused`,
which jsdom reports as `true` whether or not anything called `pause()`, so it passed under
an implementation that paused. It counts `pause()` calls now.

What this harness still cannot see is appearance. A browser pass on one pack per route,
narration on and off, remains part of the definition of done.

**Policy & Compliance: the route is now actually usable, and its central promise is enforced.**

*Fixed: picking "Policy & Compliance" gave you the University input screen.* The step-2
dispatch named four modes and policy was none of them, so it fell through to the academic
form - learning outcomes and academic level, with no way to upload the policy the entire
route exists to quote from. The route could not be used as designed. It now shares
Workplace's screen, which already has document upload, extraction and topic suggestion.

*The document is mandatory here, and only here.* v13.84 relaxed Workplace so a typed
training topic was enough without a file. That relaxation must not extend to policy: every
fidelity rule in its prompt is "quote the source", "never invent a threshold", "state only
the consequence the source states", and with no source there is nothing to be faithful to.
Both gates - the one that shows Continue and the one that validates it - were changed
together, because the v13.84/v13.85 pair is this codebase's own worked example of what
happens when only one of the two is updated.

*New: the fidelity gate.* The route spec named this the most important limitation to state
plainly - nearly every fidelity criterion in `CARD_QUALITY.policy` is `check: 'judgement'`,
rendered into the prompt and never verified, so the route was a strong prompt with no
enforcement behind it. `policyFidelityIssues()` is the enforcement, and it asks two
questions nothing else in this codebase asks:

- **Figures the course states and the policy does not.** `sourceAnchorIssues()` already
  catches a slide that threw the source's specifics *away*; the policy liability runs the
  other way. A learner told "report within 5 business days" by a course whose policy says
  no such thing has been misinformed about a rule that binds them.
- **Whether the rule is actually quoted.** "At least one key point is a direct quotation or
  close paraphrase of the operative clause" was the route's headline promise and, until
  now, a sentence in a prompt. A six-word shingle shared with the source is the machine
  proxy, and it cannot be satisfied by writing about policies in general.

Policy only - every other route legitimately invents illustrative detail, because that is
what a training scenario *is*, and running this against them would report their design as
a defect. 22 checks, each negative-tested against a deliberately broken build.

*New: the planner reads the document's table of contents.* Every other route sizes a course
from a requested duration. That is backwards for a policy - the syllabus already exists,
and asking "how long should this be?" about a Code of Conduct produces a course that stops
in the middle of clause 7 because the clock ran out. `planPolicyTopics()` segments the
document on its own headings (numbered clauses, `Section N`, ALL-CAPS titles), folds
sections too short to teach into their neighbour rather than spending a credit on a
one-line "Purpose", and returns null on a document with no structure so the caller falls
back rather than producing a one-section course.

Each subtopic carries its *own* section text rather than the whole document, which is what
lets the fidelity check say something useful: a figure quoted from an unrelated clause is
caught instead of passing because it appeared somewhere in the file.

*New: the identity strip.* Which document this course teaches, who owns it, when it was
last reviewed, who to ask - in the player chrome on every slide, not on a card. It is true
of the whole module, and a learner needs it at the moment they doubt a rule, which is on
whichever slide they are reading. The review date is the one that earns its place: a course
generated from a superseded policy is worse than no course, and this is the only thing in
the product that lets a learner notice. ISO dates are spelled out (4 September 2026) because
04/09/2026 is genuinely ambiguous across regions.

*Attestation: confirmed, not built.* The spec asked whether the existing completion class
could require "completed the interactive activity" rather than only "viewed". It can -
`completionallactivities` requires 100% on every Decision Challenge, which records that the
learner could distinguish the policy's rule from a plausible misreading. No new code was
needed; what was missing was anyone telling a teacher which condition to pick for a
compliance course, so the help text now says so, and says plainly that a completion
timestamp is not proof the learner read the document.

**Also fixed: `package.json` was 27 releases stale** at 13.66.0. It ships to nobody and
breaks nothing, which is why it drifted - no failure ever pointed at it. `test-version-mirror.js`
now checks it, and `npm test` runs every suite in one command.

## 15.2.2 - 2026-09-04

**Fixed: seven field ranges asked for content the vendor's server would reject, or accept only
by luck.** LMS Labs supplied their `ccCheckWordFloors()` table on 4 Sep, after tracing job
`0c488f10`. Those floors are enforced server-side and are not derived from the system prompt we
send, so for nine releases nothing in this repository could see them and nothing here could catch
a contract that sat under one. Job `0c488f10` failed because three `mistakes` consequences came
back at 33 words against a blocking floor of 34, after four model passes and 62 seconds - and our
contract asked for 34-46, a minimum sitting exactly ON their floor. A model one word short failed
the whole section and billed the credit.

Measured against the supplied table, seven ranges were in that position or worse:

| Card | Vendor field | Was | Server floor | Now |
|---|---|---|---|---|
| mistakes | `errorItems[].consequence` | 34-46 | 34 (blocking) | 38-50 |
| hook-scenario | `keyPoints[].text` | 42-56 | 42 | 46-56 |
| applied-scenario | `keyPoints[].text` | 42-56 | 42 | 46-56 |
| competency-summary | `standardItems[].text` | 6-10 | 10 | 12-16 |
| decision-point | `standardItems[].text` | 10-16 | 10 | 12-18 |
| concept-explainer (base) | `summaryLine` | 15-20 | 15 | 18-26 |

`competency-summary` is the severe one: a floor of 10 against a declared range of 6-10 means every
value in the range except its single top value was refused. A 6, 7, 8 or 9-word label - precisely
what "a short label, not a sentence" produces - failed the generation. LMS Labs have acknowledged
that floor is miscalibrated against the contract they publish, and that their micro-expansion pass
targets floor+4 = 14 words for a field they document as 6-10. That is theirs to fix; until it is
fixed the only range that cannot fail is one that clears the floor, so the contract now asks for
12-16 and the code carries a REVERT marker for the day the floor moves.

`decision-point` could not be seen by the guard at all: its four options ship as
`standardItems[1]` plus `errorItems[3]`, so the vendor name is not an alias for the options array
but one quarter of it. A new `floorAs` spec property names the wire field for the floor check
only, without misleading the item-count check into reading `[1]` where four options are meant.

**New: `test-field-ranges.js` check 6 encodes the vendor floor table.** Every route's declared
minimum must clear its server floor by at least 2 words. A range whose minimum sits ON a floor now
fails the build with the arithmetic spelled out. Routes whose contracts use none of the floored
vendor names (Topics-and-Text) are reported as such rather than as a silent pass.

**Fixed: the "written to spec" test fixture was not written to spec.** `test-checks.js` compares a
known-bad pack against a compliant one. The compliant fixture had drifted 13 fields under the
ranges raised in v13.98.1, and rather than move the fixture the assertion had been loosened to a
ratio - so the reference specimen of compliant content had quietly become a specimen of
nearly-compliant content, and the only property still under test was separation. The fixture is
rewritten to the current ranges and now flags zero issues; the assertion requires exactly that.

## 15.2.1 - 2026-09-04

**Fixed: the server's full error response was being logged to nowhere.** When a generation job
fails, `callAI()` has always had the vendor's complete error payload in hand - the object that says
which field failed and against what range - and printed it with `ccDiag()`, which is gated on
`CC_VERBOSE_LOG`. That constant was a hardcoded `false` that no site could change without editing
the source, rebuilding the AMD bundles and cutting a release.

The cost of that was nine releases. The General outage of 4 Sep was diagnosed three times from
static reading - word ranges (15.1.2), field names (15.1.3), the repair prompt (15.1.7). Each
diagnosis survived code review, each shipped, and each was disproven by the next production run
returning the identical error. Every one of those rounds would have been settled by the payload
this line already had.

It is now unconditional, on the error channel, and carries the route string that the server keys
its per-route expectations off:

```
callAI() FULL SERVER RESPONSE (route=general, type=content): {...}
```

Failure path only, so no hot-path cost, and it prints the vendor's own response rather than
learner content.

**New: diagnostics can be switched on without a release.** `CC_VERBOSE_LOG` now reads
`localStorage.cc_debug`, so a support engineer can run `localStorage.setItem('cc_debug','1')` in
the console on the affected site, reload, and get the full per-step trace. Off by default, per
viewer, never shared, and wrapped in try/catch because a browser set to block site data throws on
access. The important diagnostics - the full server error and the `[CARD SHAPE]` dump - no longer
depend on the flag at all.

**Nothing else changed.** No prompt, range, schema or billing behaviour is touched. This release
exists so the next failure reports itself instead of being guessed at.

## 15.2.0 - 2026-09-04

**New route: Policy & Compliance.** A fifth teacher-selectable route (`policy`) that turns an
organisation's own policy, code of conduct or procedure document into training staff will be held
to. Built on the recommendation of an independent compliance-training review, which found that
running a Code of Conduct through the Workplace route could not work: Workplace hard-requires a
named customer, a clock time, a business-countable cost, a second competing pressure and a person
behaving unreasonably on its opening card. A policy document contains none of those, so the model
could only satisfy the route by inventing them - and a learner who repeats a fabricated response
time or disciplinary outcome as if it were their employer's policy is a liability, not a trained
member of staff.

**The route inverts the usual design.** Every other route makes abstract material concrete by
inventing a scene around it. Here the document IS the subject and invention is the failure mode,
so the prompt states the fidelity rule before any card contract:

- Teach only what the document says; where it is precise, use its words.
- Never invent an obligation, timeframe, threshold, figure, notice period or disciplinary
  outcome. Where the document states no consequence, state the rule instead of supplying one.
- Never invent a policy name, clause number, Act or standard - return an empty string rather than
  a plausible-looking reference. An invented authority is worse than none.
- Where the document is silent or ambiguous, name the role to ask rather than resolving it.
- Unlike every other route, invented scene-setting detail is banned outright: a reader cannot tell
  invented texture from stated policy.

**Six cards**, reusing existing renderers with no rendering, CSS or SCORM change - Scope & Purpose,
What the Policy Says, What You Must Do, Common Misreadings, Compliance at a Glance, Check Your
Understanding. `applied-scenario` is dropped for the same reason General drops it: its renderer
hard-codes a "Continuing the scenario..." banner and its job is a second dramatised scene, which
is the machinery this route exists to remove.

**Word ranges are VET's, verbatim** - the only ranges with proof they survive the vendor's rewrite
pass. Inventing new ones is exactly what put General 2-6x above what the pipeline returns and took
it down on 4 Sep.

**38 quality criteria** (`POL-`), deliberately excluding Workplace's `WP-HOOK-2` (business cost),
`WP-HOOK-7` (second competing pressure) and `WP-HOOK-8` (unreasonable person), and replacing them
with fidelity rules plus two machine-enforced bans: no manufactured conflict vocabulary and no
dollar/business-cost metric anywhere on the opening card.

Also wired: its own repair prompt pair (never another route's - the defect fixed in 15.1.7), its
own `CC_READABILITY_TARGET` and `CC_DEPTH_TARGET` entries (never the silent PD fallback fixed in
15.1.2 and 15.1.8), `whatThePolicyRequires` as the `legalLink` panel header (already translated in
all 52 locales, zero new copy - and deliberately not `whatTheLawSays`, since an internal policy is
not law), a route-picker card, and 14 lang strings.

Verified: all eight suites pass with `policy` added to every guard. The drift guard moves from
27 cards/167 criteria to 33/205 - all 205 confirmed reaching the rendered prompt, 51 regex checks
reachable, 15 continuity checks correct. A full generation simulation produces 6/6 cards with no
structural issues.

**Not yet built, and needed before this route is sold as audit-grade** - the review was explicit
and so is this note. `cardQualityIssues()` executes only `regex` and `continuity` checks; every
`judgement` criterion is rendered into the prompt but never verified against what the model
returns, **on every route, today**. Most of this route's fidelity rules are necessarily
`judgement` ("is this a real quotation"). So the route is currently a strong prompt for fidelity
with no enforcement gate behind it, and **every pack requires human review against the source
document before publication**. Also outstanding: mandatory document upload, a
document-structure-first planner that follows the policy's own sections, the policy/owner/
effective-date strip in the player chrome, and completion-based attestation.

## 15.1.9 - 2026-09-04

**Changed: Workplace no longer demands manufactured conflict on every opening card.** `WP-HOOK-7`
("a second, competing pressure is stacking up") and `WP-HOOK-8` ("the other person behaves
unreasonably - raised voice, refusal, interruption") were `check: 'regex', polarity: 'require'` -
hard gates on the first card of every Workplace pack, whatever the subject. Two consequences:

- A compliant card on a topic with no interpersonal conflict - stock reconciliation, a system
  rollout, a leave policy - failed the gate and burned a paid repair call it could never satisfy,
  because the only way to pass was to invent an antagonist the source document never mentioned.
- The rules contradicted this route's own instruction, three lines earlier in the same prompt:
  "Never manufacture drama, exaggerate risk, or use fear to make a point - the pull comes from the
  detail being true and recognisable, not from the stakes being raised."

An independent instructional-design review put it plainly: a learner who meets the same raised
voice and ringing phone in the opening ten seconds of thirty modules stops reading the card that
is supposed to hook them, and that scepticism carries over to the safety and compliance content
riding alongside it.

Both are now `check: 'judgement'` and reworded to be conditional - the model still reads them as
guidance where competing pressure or a difficult person is genuinely part of the work, and a topic
that has neither is no longer failed for not inventing one. Compare `VET-HOOK-8`, left unchanged:
it asks for a real pressure toward the shortcut (a supervisor, a deadline, a mate who has already
moved on), which is grounded in how workplace error actually happens rather than in stage
directions.

Executable criteria across all routes go from 84 to 82; nothing else changes.

## 15.1.8 - 2026-09-04

Closes the remaining findings from the review round.

**Fixed: the pronunciation list was applied to every narration language.** An admin writes English
respellings ("Moo-dul"); those were being substituted into Japanese, French and every other
additional-language pack, where an English-phonetic respelling read by a non-English voice is
worse than the original word. The list now applies only to narration in the site's configured
voice language, compared on the primary subtag so en-AU and en-GB are the same language.
`CcState.setNarrationLanguage()` is called from the existing `useNarrationLanguage()` hook in both
`builder.js` and `player5.js`, which the multi-language pre-generation loop already calls per pack.
With no base language declared the old behaviour is unchanged, so nothing breaks.

**Fixed: `general` was missing from `CC_DEPTH_TARGET`.** The same silent-fallback bug as
`CC_READABILITY_TARGET` in 15.1.2 - `CC_DEPTH_TARGET[mode] || CC_DEPTH_TARGET.pd` meant General's
per-card depth floor was PD's. It now has its own entry (VET's numbers, matching its per-field
ranges), so a future change to PD's floor cannot move General's unnoticed.

**Fixed: `msgnoquizcard` retired properly.** It was left defined with a comment; Moodle's actual
mechanism is `lang/en/deprecated.txt`, which `string_manager_standard::load_deprecated_strings()`
reads. Moved there and removed from the main lang file.

**Fixed: `__proto__` as a pronunciation term produced "[object Object]".** Assigning to
`__proto__` on a plain object silently does nothing while the lookup still resolves to
`Object.prototype`, defeating the `undefined` guard. The map is now `Object.create(null)`.

**Known and documented, not changed - a decision for the owner.** An affected slide is
re-synthesised automatically, with no confirmation, the first time a teacher or editor opens the
activity; `detectStaleBuild()` checks only `builtWithVersion` and `voiceoverSchemaVersion`, so the
"apply updates" panel never appears for a pronunciation edit. Students are never charged and keep
the existing audio. The setting description now states this and warns about the cost, and the
common-word guard removes the worst case. Making it opt-in requires distinguishing a
pronunciation-only change from a content edit - a second `voiceoverSourceHash` stamped alongside
the existing one - which touches the most credit-sensitive path in the product and should not be
rushed in the same release that introduced the feature.

## 15.1.7 - 2026-09-04

Three further reviews of the 15.1.1-15.1.6 changes. One found a defect as serious as the one
those releases were fixing.

**Fixed: General's repair prompt was VET's.** `getContentRepairPromptForMode()` and
`buildContentRepairPromptForMode()` had explicit branches for topicstext, university, workplace
and pd - and none for general - so both fell through to the VET default. VET's repair prompt ends
"exactly 7 cards" and describes an `applied-scenario` card General does not have, in vocational
"Unit / Industry / Role" framing. Every General section that needed a targeted repair was handed
that contract on its LAST attempt, came back at 7 cards, failed with "Expected 6 cards, got 7",
and fell to the failure placeholders with no attempts left - after paying for the repair call.

This is the same defect as v15.1.3's on the other half of the pipeline: the generation prompt was
corrected there and the repair prompt was never looked at. It is the `EXCEPTION on TARGETED
REPAIR` in the 4 Sep production logs, sitting behind the initial-generation failure that was
fixed first. Both halves now fail for real reasons or not at all.

Built the way v13.98.3 built every other route's - derived from `GENERAL_SYSTEM_PROMPT`, never a
hand-copied contract. That release's comment ("a copy of a contract is a contract that will
drift... every route now does the same") predates General, which is exactly how General became the
one route it was not true of.

**New guard: `test-card-contract.js` check 3.** For every route, the repair prompt must ask for
that route's own card count and must contain that route's own card-contract lines. Negative-tested:
removing the new branches reports `general: repair asks for exactly 7 cards but the route
generates 6; repair system prompt contains none of this route's 6 card-contract lines`. A first
version of this check failed all six routes by comparing non-contiguous contract lines as one
joined block - it was the check that was wrong, not the code, and it was corrected before shipping.

**Fixed: a pronunciation term of `__proto__` produced "[object Object]" in narration.** Assigning
to `__proto__` on a plain object silently does nothing, while the lookup still resolves to
`Object.prototype`, so the `say === undefined` guard missed it. The map is now
`Object.create(null)`.

**Corrected: the pronunciation setting's description made a claim that was not true.** It said
teachers "see the usual 'apply updates' prompt and choose when to regenerate". They do not.
`detectStaleBuild()` checks only `builtWithVersion` and `voiceoverSchemaVersion`, never
`voiceoverTextHash`, so a pronunciation edit never raises that panel - and `player5.js`'s
`preloadVoiceovers` re-synthesises an affected slide **automatically, with no confirmation**, the
first time a teacher or editor opens the activity. Students are unaffected and keep the existing
audio. The description now states the real behaviour and warns about the cost, and notes that the
list applies to translated narration too. See the release notes for the two open decisions this
leaves.

## 15.1.6 - 2026-09-04

Three findings from an independent review of the 15.1.1-15.1.5 changes.

**Fixed: the new PARAM_RAW in `settings.php` had no pipeline marker.** `phpcs.xml.dist` requires a
machine-readable justification on every deliberate PARAM_RAW, and all 28 other uses in the plugin
carry one inline. The new pronunciation setting did not, and would have failed the release
pipeline's undocumented-PARAM_RAW check.

**Fixed: one careless pronunciation entry could rewrite narration site-wide.** The list is
site-wide and the substitution is whole-word but otherwise unconstrained, so `a=uh` would rewrite
essentially every module on the site - and because staleness is the hash of the substituted
script, flag every affected section for paid regeneration at once. Single characters and the
commonest function words (a, is, the, to, of, and ~50 more) are now refused, and the setting says
so. Verified: `a=uh` / `is=izz` / `the=thuh` are ignored while valid entries in the same list still
apply.

**Fixed: a term listed twice in different cases silently resolved to whichever sorted last.**
`AI=First` and `ai=Second` matched the same words with no error and an order-dependent winner.
First appearance now wins, deterministically.

**Confirmed correct by the same review, no change needed:** PARAM_RAW cannot break out of the
`js_call_amd` script context (PHP's default `json_encode` escapes `/`, so `</script>` cannot be
emitted, and U+2028/29 are escaped); the HTML in the setting description renders correctly through
`format_admin_setting()` -> `markdown_to_html()`; `$pronunciations` is defined on every path in
`view.php`; the substituted narration never reaches the DOM (traced every consumer of
`buildVoiceoverText()` and `_ranges`); `_pronRe` shows no backtracking or cost problem at 10,000
entries; and the Gruntfile `stylelint` shim reproduces Moodle's real verdict rather than masking a
check, because Moodle's own stylelint scope for a non-theme plugin is a single root `styles.css`
this plugin does not have.

**Recorded, not fixed - pre-existing, and confirmed identical in the untouched v15.1.0 baseline:**
regenerating a legacy PD or Topics-and-Text course fails structural validation with
"Expected 6 cards, got 7" / "got 5". `validateCards()` takes its card count from the
pd/topicstext-normalised mode, which is `general` (6), while a saved PD pack has 7 cards and a
Topics-and-Text pack has 5. Playback is unaffected; this only fires on regeneration. Both candidate
fixes touch the code path that caused the FIX-CC-TITLE-GATE 100%-generation-failure regression at
v13.73, and the routes that work today are not worth risking on a same-day guess for two routes
that can no longer be selected. Needs a deliberate decision about what a regenerated legacy pack
should contain, since regeneration now produces 6 General-schema cards regardless.

## 15.1.5 - 2026-09-04

**New: voiceover pronunciation list.** A site admin can list words the voice reads wrongly and
how they should sound - company names, product names, acronyms, place names. Site administration
-> Plugins -> Content Creator -> *Voiceover pronunciation list*, one entry per line:

```
Moodle=Moo-dul
LMS Labs=L M S Labs
SWMS=swims
```

Matching is whole-word and case-insensitive, and a longer entry wins over a shorter one inside it,
so "New South Wales" is safe to list alongside "Wales". Lines starting with `#` are ignored, and a
line without an `=` is skipped rather than guessed at.

**It changes the narration only.** The substitution runs at the end of `buildVoiceoverText()` in
`cc-state.js` - the single function that builds the audio script, shared by the builder's
pre-generation and the player's on-demand synthesis. Nothing on screen changes, because that
function is never used to render a card.

**Staleness comes free, and that is why it is applied there.** `voiceoverTextHash()` is computed
over the string that function returns, and the player already compares it against the hash stored
on each section. Change the list and the hash changes, so only sections containing a listed word
are flagged - teachers get the existing "apply updates" prompt and choose when to spend credits.
No new staleness machinery, no surprise re-synthesis, and slides with no listed word keep their
hash and are never regenerated.

The substitution is also applied to each `_ranges[]` entry with the same function. Those entries
drive card highlighting during playback via word counts, so substituting the script without them
would leave the highlight counting words that are no longer spoken - a respelling can change the
word count ("Moodle" -> "Moo dul"). Because the substitution is deterministic,
`buildCardVoiceoverSegments()`'s own `withOut !== buildVoiceoverText(...)` assertion still holds.

**New: `tests/js/test-pronunciations.js`**, 22 cases. Writing it found five real defects in the
first implementation, all fixed before release:

- an all-caps acronym came back Title Cased (`SWMS` -> `Swims`), because the code preserved the
  matched word's capitalisation. Removed entirely - the respelling is now used exactly as typed.
  Case cannot affect pronunciation anyway: this string is read aloud and never displayed.
- `C++` never matched. `` requires a word character on the inside edge and `+` is not one, so
  the boundary is now `(^|[^\w])` ... `(?!\w)`, written without lookbehind for older Safari.
- `New South Wales` became `New South Wayls`. Sorting longest-first does not help when each term
  gets its own pass - the second pass re-reads what the first produced. It is now a single pass
  over one combined alternation, longest branch first.

Over half the test file is cases where a substitution must NOT fire - `AI` inside `AIDS`,
`Moodle-based`, `Moodle's`, unlisted text. `BANNED_PHRASE_RULES` in `generator.js` is the reason:
blanket substitutions once turned "to ensure accuracy" into "so you accuracy" and landscape
painting into environment painting, and it reached every card of every pack because nothing tested
the cases where a rule should stay silent.

## 15.1.4 - 2026-09-04

**New: `tests/js/test-card-contract.js`** - the guard for the defect fixed in 15.1.3, which took
three releases to find because nothing compared the two halves of the contract.

`CC_FIELD_SPECS` already records the mapping: `path` is the plugin's internal field name, `alias`
is what the vendor emits. Check 1 asserts every card's contract line names the ALIAS. General had
been asking for `sceneParts`, `conceptInsights`, `items`, `goodItems` and `badItems` - the names
`normalizeCardSchema()` produces *after* a response arrives, which the vendor's strict
(`additionalProperties: false`) schema cannot return.

Negative-tested in both directions: green on the fixed code, and reintroducing all three defects
fails it, naming each one, on General alone with no false positives on the other five routes.

Check 2 builds a card exactly as each contract describes and pushes it through the real
`normalizeCardSchema()` + `validateCards()`. **It cannot catch the aliasing defect** - the plugin
accepts both vocabularies, which is what the aliases are for, so it stays green with the bug
present. That was confirmed by trying it rather than assumed, and it is written down in the file
so nobody mistakes it for the guard. It is kept because it catches a different real failure: a
contract asking for a field the plugin ignores altogether. 38 of 39 contracts are covered; PD's
competency-summary spans six lines of prose and is reported as skipped, never as passed.

## 15.1.3 - 2026-09-04

**Fixed: the General route asked the model for field names the vendor's schema does not
declare.** Every other route asks for the vendor's own names. General asked for the plugin's
internal ones:

| card | VET / Workplace ask for | General asked for |
|---|---|---|
| hook-scenario | `keyPoints[4]` | `sceneParts[4]` |
| concept-explainer | `keyPoints[3]` | `conceptInsights[3]` |
| mistakes | `errorItems[5]{error,...}` | `items[5]{mistake,...}` |
| competency-summary | `standardItems[5]` + `errorItems[5]` | `goodItems[5]` + `badItems[5]` |

The internal names are what `normalizeCardSchema()` produces *after* a response arrives - the
`alias` entries in `CC_FIELD_SPECS` record the mapping, and the v13.75 VENDOR-SCHEMA comments
in `generator.js` document it ("the API stopped emitting sceneParts and now returns the same
content as keyPoints"). The vendor's card JSON schema is `strict: true` /
`additionalProperties: false` - a standing warning in this project, and the cause of the
original Route 5 generation failure - so the model could not emit the names General asked for.
`competency-summary` came back with nothing the normaliser recognised, tripping
`Card 6 (competency-summary): missing or too-short voiceover`, and the empty fields also failed
the vendor's own word-range check.

General's card contract now uses the vendor's field names throughout, matching VET exactly.
Verified by simulation: feeding vendor-shaped cards through `normalizeCardSchema()` produces
the internal names and `validateCards()` reports no issues.

This is the third attempt at this outage. The first (15.1.2) assumed the vendor's rewrite
passes; the second assumed General's word ranges. Both were wrong. The ranges change in 15.1.2
is still correct on its own merits and stays.

**New: `[CARD SHAPE]` diagnostic.** When a card fails structural validation, the log now prints
what actually came back - card type, the top-level keys present, and the size of each. Shape
only: no learner text, no source material, nothing billable, so it is safe to leave on
permanently, and it goes through `ccWarn` so it appears without a verbose build. `CC_VERBOSE_LOG`
is a hardcoded `false`, so before this no site could see what the vendor returned without
cutting a new release - which is why this outage took three attempts instead of one. A card
returning `standardItems` where the prompt asked for `goodItems` is now obvious on first read.
## 15.1.2 - 2026-09-04

**Fixed: the General route could not generate at all.** 15.1.1 went live on
moodle.cbplugins.com and every General subtopic failed:

```
SERVER RETURNED ERROR: Content generation did not meet the required word ranges after repair.
job da2f8c00-... was already submitted and charged - refusing to re-submit
[VALIDITY GATE] All attempts exhausted and nothing salvageable (0 words)
getFailedCardSequence() RETURNING FAILURE CARDS | mode=general
```

Initial generation and the targeted repair failed identically on every subtopic, each one
billed, each returning failure cards.

**Cause: General's word ranges were unsatisfiable by construction.** They were set 17-100%
above every other route when General was introduced in v15.0.0 - 55-90 words a field where
VET asks 42-56, 100-180 where VET asks 80-140. `generator.js` already recorded, from the
v13.98.2 measurement, that "every field asking for more than about 30 words comes back at
28-31 whatever range is requested, because the vendor runs its own expansion and rewrite
passes over the output after ours". General asked for two to six times what the pipeline
returns, so no model, repair pass or retry could ever satisfy it. Applying that measured
~30-word behaviour to General's contract predicts 1,171 words a section; the one run that
salvaged anything kept 933, against a 1,791-word minimum.

Nobody had hit it before because **v15.x was never promoted to production until 4 Sep 2026**.
The live catalogue sat on 13.97.1 for two months, so no General pack had ever been generated
against these numbers.

General's ranges are now VET's, VET being the only route with evidence of generating
successfully. General differs from VET only in carrying a `title` on every card. This does
not make the content match the spec - VET is flattened to ~30 words a field too, which is the
v13.97.1 "9% of fields met their stated range" finding, still open and still vendor-side. It
makes General fail the way the other routes fail (thin, and reported) rather than erroring
outright.

**Fixed: a flat 320-word card ceiling that five of the six routes could not satisfy.**
`readabilityIssues()` capped every card on every route at 320 words, while the summed field
MINIMUMS of `mental-model` are 332 on VET and Workplace, 372 on PD and 416 on General, and
General's `competency-summary` is 344. A card written exactly to specification was reported
as over the limit on every generation, and no wording change could satisfy both rules. The
ceiling now derives from the card's own specification via the existing
`Prompts.getCardWordRange()`, plus 15% for the connective words between fields, so the rule
means "longer than its own spec allows" and a compliant card can always pass. The flat 320
remains only as the fallback for a card type with no field spec.

**Fixed: General was missing from `CC_READABILITY_TARGET` from the day it became a route.**
`CC_READABILITY_TARGET[mode] || CC_READABILITY_TARGET.pd` meant every General card was
silently measured against PD's grade and sentence limits. Nothing failed and nothing warned -
a missing route looks exactly like a working one. General now declares its own targets
(grade 10, sentence 22, matching Topics-and-Text's general-audience register), and its
generation prompt states that 22-word cap, which it previously did not state at all.

**New: `tests/js/test-field-ranges.js`** - five guards over the whole class of defect, all
five negative-tested by reintroducing the real bug and confirming each one fails:

1. every range in `CC_FIELD_SPECS` is stated verbatim in that route's prompt. The ranges
   exist twice - as prose the model reads and as numbers the result is graded against - and
   `prompts.js` claims a `ccFieldSpecPromptLine()` renders one from the other "so the two
   cannot drift apart". **That function was never written.** They are two hand-maintained
   copies, and this is what now holds them together.
2. a card built at its own spec minimum and maximum is not reported as over-length.
3. every route in `CC_FIELD_SPECS` has its own `CC_READABILITY_TARGET` entry, so no future
   route can inherit another's limits through the fallback.
4. `CC_EXPECTED_ITEMS` agrees with the item count on each card's own contract line -
   alias-aware, since VET writes `keyPoints[4]` where the spec path is `sceneParts[]`.
5. the sentence cap the prompt states equals the one the validator enforces. This exact
   mismatch caused v13.98.2 (validator stricter than the prompt, making ranges impossible)
   and then v13.98.3 (University, the same bug reversed).

Verified: all six `tests/js/*.js` suites pass, `node --check` and `php -l` clean, `grunt amd`
rebuilt 23 modules, and the packaged ZIP was extracted and re-tested from its own contents.

## 15.1.1 - 2026-09-04

**Fixed: `CC_VERSION` shipped stale in 15.1.0 - the release that claimed to fix it.** 15.1.0's
entry below states this constant "has now been bumped to match `$plugin->release`... so it isn't
missed a third time." It was missed a third time, in that same release: `version.php` went to
`15.1.0` and `amd/src/cc-state.js` stayed on `'15.0.0'`, in source and in the built bundle. The
constant stamps `manifest.builtWithVersion` and drives `builder.js`'s `compareVersions()`, so
while it is stale the "plugin updates available - apply them" panel silently stops offering
itself to teachers whose modules predate the current release, and every console and support log
misreports the running version.

**Structural fix so there is no fourth time: `tests/js/test-version-mirror.js`.** Three
recurrences is enough evidence that a checklist item and a stern source comment do not work.
The new test takes `$plugin->release` as the single source of truth and fails the build if any
mirror disagrees: `CC_VERSION` in the source, the release string inside the **built**
`amd/build/cc-state.min.js` (a correct source fix that was never `grunt amd`-ed still ships the
old value, since the ZIP carries `amd/build`, not `amd/src`), the first `##` heading in this
file, the 10-digit numeric version format, and any newly introduced hardcoded release-shaped
literal elsewhere in `amd/src`. Only one of those five is visible to the Moodle plugin readiness
gate, which is precisely why the drift kept reaching production with every pipeline signal green.

**Fixed: the University route-picker described a card structure the route stopped generating at
v13.98.1.** The route-selection screen - the one screen a teacher reads *before* committing to a
route - advertised "6 cards per section", listed six cards ending at Case Study 2, and carried
the note "No quiz card and no jurisdiction legislation on this route." University has generated
**seven** cards including a Decision Point since v13.98.1, added specifically because it was the
only route with no card asking the learner to commit to an answer. The picker now states 7 cards,
lists Decision Point, and the note is narrowed to the part that is still true (no jurisdiction
legislation). `msgnoquizcard` is retained in `lang/en` as deprecated rather than deleted, so a
site overriding it does not hit a missing string; `msgnojurisdictionlegislation` replaces it in use.

**Fixed: every completed non-General module reported "Mode: General Learning" on its completion
screen.** `renderLocked()` read the module-scoped `selectedMode`, which is assigned only by the
mode-picker click handler and by draft restore. Opening an already-completed activity runs
`init()` -> `loadManifest()` -> `renderLocked()` and never touches it, so on the common path it
was still `null` and fell through the ternary's final branch - mislabelling every finished VET,
Workplace and University module. It now derives the label from `manifest.mode`, which records the
route the pack was actually built with.

**Fixed: the competency-summary flow badge was hard-coded English in all 52 languages.**
`cc-card-slots.js`'s `renderCompetencySummary()` emitted the literal "You Are Ready When You Can…"
while all six sibling card renderers were migrated to `getLabel()` at v13.94.3 - this one was
missed. The `youAreReadyWhenYouCan` key already existed and was fully translated across all 52
languages; it simply was not being called. Affects VET/Workplace/PD card 6 and the General route's
Consolidate card. The adjacent `FIX-COMP-TITLE-DOUBLE` guard still compares against the English
forms deliberately, since the duplication it suppresses originates in the (always English) prompt.

**Fixed: every job of the v15.1.0 Moodle Plugin CI run failed on the Grunt step.** `moodle-plugin-ci
grunt` asks grunt for the task list this plugin needs - `amd`, then `stylelint`. Because the plugin
ships its own `Gruntfile.js`, grunt resolves that in preference to Moodle's, and a task grunt cannot
find is fatal: `Warning: Task "stylelint" not found. Use --force to continue. / Aborted due to
warnings.` The `amd` task had already completed successfully; nothing was wrong with the build.
Every other CI step - PHP Lint, Mess Detector, Moodle Code Checker, PHPDoc Checker, Validating,
upgrade savepoints, Mustache Lint, PHPUnit and Behat - passed on all 20 matrix jobs.

This had been failing on every release, not just this one: the workflow carried
`continue-on-error: true` on the Grunt step (and on phpmd, phpcs and phpdoc) until the `ci.yml`
rewrite between v13.97.1 and v15.1.0 removed those flags and grew the matrix from 6 jobs to 20.
The other three had genuinely been fixed in the meantime and now pass on merit. Grunt had not.
The "first green CI run" recorded at 13.95.6 was green with this check excused.

A `stylelint` task is now registered in `Gruntfile.js`, scoped to match what Moodle's own stylelint
does for this plugin. Moodle's stylelint target globs a component's root `styles.css`; this plugin
has none (its CSS lives in `styles/*.css`), so Moodle reports "Linted 0 files without errors"
against it - verified by staging this plugin inside a real Moodle 4.5 checkout and running Moodle's
grunt directly. The new task reaches the same verdict, and fails loudly rather than passing
silently if a root `styles.css` is ever added.

**Recorded, not fixed:** pointing stylelint at `styles/*.css` reports 4,610 problems under Moodle's
own `.stylelintrc`, and running Moodle's `grunt amd` (which lints first) reports 6,102 eslint errors
across `amd/src` - 3,287 `max-len`, 1,471 `no-trailing-spaces`, 1,073 `curly`, 235 jsdoc, mostly in
`player5.js`, `builder.js` and `translations.js`. The plugin's JavaScript and CSS have never
satisfied Moodle's own lint rules; the shipped Gruntfile is what has stood in for them. That is a
real gap and it belongs with the wider Moodle-compliance work (the `ajax.php` router, Mustache
adoption, inline styles), not with a patch release.

No content-generation, billing, card-schema or manifest-format behaviour changes in this release.
Verified with the full `tests/js/*.js` suite - `test-routes.js`, `test-card-quality.js`,
`test-checks.js`, `test-standard.js` and the new `test-version-mirror.js` - plus `node --check`
and `php -l` on every edited file, and a full `grunt amd` rebuild.

## 15.1.0 - 2026-09-04

**General route: six adaptive cards replacing the unified seven.** General no longer generates
Hook Scenario -> Concept Explainer -> Mental Model -> Applied Scenario -> Mistakes ->
Competency Summary -> Decision Point. It now generates six cards built around a fixed
instructional job per card, with the AI choosing the technique, heading and content for that
job on every generation: Orient (create interest, connect to something familiar), Understand
(build the core idea via whichever explanatory structure fits), Explore (go deeper - a second
concept, a misconception, a trade-off, a relationship the first two cards didn't cover - so
packs stop reading as intro+bullets+example+summary), Apply (put the Instructional Model Router
to work - GROW, PDCA, 5 Whys, Diagnose-Test-Correct-Verify and the other 11 models, chosen by
the actual learning job), Challenge (cognitive friction that depends on Cards 1-4, not trivia
recall), and Consolidate (a practical playbook, checklist or action plan - not a plain "Key
Takeaways" recap). VET, Workplace and University are unchanged.

Implementation reuses six of the seven existing unified card-shape renderers (`hook-scenario`,
`concept-explainer`, `mistakes`, `mental-model`, `decision-point`, `competency-summary`),
reassigned to the new jobs, and drops `applied-scenario` - so no renderer, CSS or SCORM-export
changes were needed. Every General card now also returns a top-level `title` field (the
AI-generated, topic-specific learner-facing heading - explicitly barred from generic labels like
"Orient" or "Key Takeaways"), which the renderers in `cc-card-slots.js` already supported but no
prompt had asked for on these card types before. `generator.js`'s card-title validation
(`TITLED_CARD_TYPES`) is scoped to the raw route string, not the pd/topicstext-normalised one, so
PD - which keeps its own unchanged `PD_SYSTEM_PROMPT` and never asks for `title` on 5 of these 6
card types - cannot be caught by the new requirement. `getExpectedCardOrder()` gained an explicit
`general` branch for the same reason: falling through to the old 7-card `UNIFIED_CARD_ORDER`
would have silently mis-ordered every General generation.

**Fixed: `CC_VERSION` frozen at '13.94.8' since that release, through roughly 20 subsequent
releases up to 15.0.0.** This single JS constant (`cc-state.js`) stamps every console log line
and every saved manifest's `builtWithVersion`, and `builder.js`'s `compareVersions()` uses it to
decide whether a manifest was built by an older release and needs a non-destructive re-apply.
Frozen, that staleness-detection feature silently stopped firing for every release since
13.94.8, and every diagnostic log looked 20-odd releases out of date. This is the same bug
fixed once before at v13.94.3 (then frozen at a different old value); it has now been bumped to
match `$plugin->release` and the release runbook has a new checklist step so it isn't missed a
third time.

Also fixed in passing: the General entry on the route-picker screen (`builder.js`) had an
unterminated `class` attribute swallowing its own `data-mode="general"` into the class string,
and its card-list preview still named the old 7 cards including the removed Applied Scenario -
both fixed alongside the route-picker's new 6-card list (Orient/Understand/Explore/Apply/
Challenge/Consolidate).

Verified via the full `tests/js/*.js` suite (`test-routes.js`, `test-card-quality.js`,
`test-checks.js`, `test-standard.js`) - all four pass; `test-card-quality.js`'s active-route
drift guard was deliberately moved from 28 cards/164 criteria to 27 cards/167 criteria to match
the intentional shape change (minus Applied Scenario, plus a title criterion on all 6 remaining
General cards). AMD rebuilt (`grunt amd`, 23 modules).

## 15.0.0 - 2026-09-03

Route architecture rewrite: the five teacher-facing routes (VET, Workplace, University, PD,
Topics-and-Text) are now four (VET, Workplace, University, General). PD and Topics-and-Text are
folded into General as use cases rather than separate routes - General now carries an internal
instructional-model router (`CC_INSTRUCTIONAL_MODEL_ROUTER_BLOCK`) that selects from 15 named
models (GROW, PDCA, 5 Whys, Diagnose-Test-Correct-Verify, and 11 others) by what the learning
content actually needs, rather than PD's old hard-locked "the model is GROW" and Topics-and-Text's
separate short-form template. `pd`/`topicstext` mode strings are kept internally, normalised to
`general` at generation time via `ccNormaliseGenerationRoute()`, so existing saved courses on those
two modes keep working unchanged - the UI simply no longer offers them as a choice for a new
course. `legislation.js` was rewritten from unconditionally injecting a "MANDATORY COMPLIANCE
FRAMEWORK" to offering verified country/state packs as "VERIFIED COMPLIANCE CANDIDATE CONTEXT"
only, with explicit truth rules against inventing specific Acts, Regulations or thresholds.

**Golden-pack evaluation** (new, manual QA exercise, not automated): hand-authored full 7-card
packs for one topic per route - VET (isolating a switchboard to AS/NZS 3000), Workplace (a
Northline returns-policy refund), University (Festinger & Carlsmith's cognitive dissonance study)
and General (diagnosing a dropping Wi-Fi connection) - written the way a real generation would be,
then run through the actual `generator.js` check functions (not a structural stand-in). This
surfaced one real, previously-unknown tooling defect, fixed below, and confirmed the check
machinery is not a rubber stamp: each pack needed one to two rounds of revision to converge, the
same shape a production generate-then-repair loop goes through.

**Fixed: false "longest sentence" readability flags from a title/field concatenation artifact.**
`harvestCardText()` joins every learner-facing field on a card with a plain space and no
punctuation, which is correct for checks that only look for keywords or substrings
(`sourceAnchorIssues`, `subjectDriftIssues`, and similar) but meant a short `title` field glued
straight onto the next field's first word read, to `readabilityIssues()`'s sentence splitter, as
one run-on sentence - producing spurious "sentence exceeds limit" flags on well-formed content, on
every title-bearing card type (`hook-scenario`, `applied-scenario`, `concept-explainer`,
`mental-model`), independent of route. This most likely affected real production generations too,
not just hand-written test content. Fixed with a new `harvestCardTextForSentences()` used only by
`readabilityIssues()` and `duplicateSentenceIssues()` - the two checks that actually split text
into sentences - which inserts a sentence-terminating period between two joined fields when the
first does not already end in `[.!?]`. `harvestCardText()` itself, and the many other checks built
on its plain space-joined output, are untouched. Verified via the full `tests/js/*.js` suite
(`test-checks.js`, `test-routes.js`, `test-card-quality.js`, `test-standard.js`) before and after:
identical results in every case, confirming no behaviour change to any existing check.

**Known, pre-existing, not fixed:** the golden-pack exercise confirmed a tension the code's own
`CC_DEPTH_TARGET`/`readabilityIssues()` comments already flag - a fully spec-compliant
`mental-model` card (and, on General, the `mistakes` card too) can legitimately need more than the
320-word "one screen" ceiling `readabilityIssues()` enforces for every card on every route, because
each step/field's own minimum word count sums past 320 before the ceiling is even reached. This is
a pre-existing design tension between two validators, not something introduced by the route
rewrite, and is left as a follow-up rather than papered over by weakening either check.

## 14.1.0 - 2026-09-03

Five independent route-specialist reviews (one each for VET, Workplace, PD, University and
Topics-and-Text, each briefed specifically on narrative engagement, memorability and emotional
pull rather than general pedagogy) converged on the same category of gap across all five routes:
cards had a real person and a real stake in the hook-scenario/overview card, then lost them by
card 2 - later cards reverted to a generic, unnamed "a worker"/"a technician"/"the reader," so the
pack read as disconnected quiz questions rather than one continuous story. This release adds 34
new criteria to `card-quality.js` (192 -> 226) to close that gap, biased heavily toward
mechanically-enforceable `regex`/`continuity` checks rather than judgement-only rules, per an
explicit instruction partway through this round of work.

**18 "round 1" criteria** (192 -> 210): a new `check: 'continuity'` type verifies a named
person/entity introduced in a route's anchor card (`hook-scenario` for VET/Workplace/PD/University,
`overview` for Topics-and-Text) recurs by name in a later card - `VET-APPLIED-7`, `VET-MISTAKES-7`,
`VET-SUMMARY-7`, `VET-DECISION-7` and their Workplace (`WP-*-7`) and PD (`PD-*-7` on
applied/mistakes/summary/decision) equivalents. Hook cards themselves got sharper require-regex
criteria for a concrete physical stake (`VET-HOOK-7`/`WP-HOOK-7`: a named body part or piece of
equipment at risk) and a real social pressure toward the shortcut (`VET-HOOK-8`/`WP-HOOK-8`: a
supervisor, deadline or "already signed off" pressure). University's `UNI-FRAMEWORK-1` and
`UNI-ANCHOR-2` regexes were tightened from matching any capitalised word on the card to requiring
an actual surname-shaped token near a real year. Topics-and-Text got `TT-OVERVIEW-7` (a
contrast/surprise marker next to a figure) and `TT-CONCEPTS-7` (a human-stakes consequence marker).

**16 "round 2" criteria** (210 -> 226): consequence-contrast and causal-mechanism markers on the
`concept-explainer`/`mental-model` pair across VET/Workplace/PD (`*-CONCEPT-7`, `*-MODEL-7`), a
named-person continuity check for PD's decision-point (`PD-DECISION-7`), University criteria
requiring a lens's own limitation, a genuine ethical trade-off, and an unexpected outcome to be
named explicitly (`UNI-LENS-6`, `UNI-ETHICS-6`, `UNI-CASE1-6`, `UNI-ANCHOR-7`), a
`continuity`-anchored check on University's second case study naming the first case's named
subject again (`UNI-CASE2-6`, anchored to `case-study-1` rather than the route default via a new
optional `anchor` field on any `continuity` criterion), and Topics-and-Text criteria requiring a
named consequence in an example and a genuine corrected-misconception takeaway
(`TT-EXAMPLES-6`, `TT-TAKEAWAYS-7`, `TT-DECISION-7`).

The ChatGPT downloadable-prompt-file feature (`buildChatGptPromptFile`) needed no separate change -
it calls the same `getSystemPromptForMode()` that renders the card-quality block, so it inherited
all 34 new criteria automatically; confirmed directly by generating the `.txt` file for all five
routes and finding the new rule text present in each.

**Two self-inflicted bugs found and fixed before shipping, both while implementing the above:**
- The new `continuity` name-matching heuristic initially missed names that open a sentence (e.g.
  "Josh checks the gauge...") because its regex required a preceding lowercase letter; fixed by
  adding sentence-start and `.`/`!`/`?`-boundary as valid preceding contexts.
- That fix then let common capitalised sentence-openers ("What", "Is", "The"...) get extracted as
  false "names," which could make a continuity check pass by accident when the real name was
  missing but a generic word happened to recur in both cards. Fixed with a much larger stopword
  list (interrogatives, modals, pronouns, narrative connectors, spelled-out numbers, days/months)
  and by dropping the apostrophe from the name-matching character class so "Josh's" reduces to
  "Josh" and "It's" no longer qualifies as a name at all.
- Separately: two of the new criteria's chosen IDs (`UNI-ANCHOR-6`, `TT-TAKEAWAYS-6`) collided with
  genuine pre-existing criteria and were silently overwritten by the codegen script's
  idempotent-by-ID `push()`. Caught by the total criterion count coming out 2 short of expected,
  confirmed against a pre-change JSON snapshot, and fixed by restoring both original criteria and
  renumbering the new ones (`UNI-ANCHOR-7`, `TT-TAKEAWAYS-7`). All 36 new-criterion IDs were then
  cross-checked against the full pre-existing 192-ID set to rule out any other collisions.

Verified clean end to end: `test-card-quality.js` reports 226/226 rule strings exposed in the
rendered prompt, 84/84 regex criteria individually confirmed reachable and correctly IDed, and
10/10 `continuity` criteria (including the two with a custom `anchor`) confirmed correct with a
real anchor+target card pair - the test's continuity section was extended this release to honour a
criterion's `anchor` override instead of always assuming the route default. `test-routes.js` and
`test-checks.js` unaffected. AMD bundles rebuilt and the minified build spot-checked against source
via a from-scratch VM loader - identical 226/226 and 84/84 results. The Card Quality Checklist
artifact and `card-quality-data.json` were regenerated from the corrected file and republished.

## 14.0.1 - 2026-09-03

Triple independent expert review of the 192-criterion card-quality.js standard (a pedagogy
audit, a QA/regex audit, and an editorial/consistency audit, each with no prior exposure to the
product) converged - unprompted, working from separate copies of the same file - on the same
finding: **25 of the 60 machine-checked criteria had `polarity` set backwards.**

Each of these criteria's `rule` text correctly described content to avoid (e.g. "never trust,
credibility, satisfaction or morale," "not a character flaw," "never 'How do you ensure...'"),
and the regex correctly matched that banned language - but `polarity: 'require'` meant the check
only passed when the banned language WAS present, and failed genuinely compliant content. Because
`CC_REPAIRABLE` treats every `QUALITY STANDARD [...]` failure as worth a paid AI repair call, this
meant correct content on 25 criteria (concentrated in PD, University and Topics-and-Text, with a
few on VET/Workplace) would burn a repair call on every single generation, permanently, since the
repair model - correctly following `c.rule` - would keep producing content that failed the
inverted check.

Fixed: all 25 flipped from `require` to `forbid` (same regex, same rule text - only the polarity
field changed). Verified with concrete before/after cases pulled directly from the audit (e.g.
`VET-SUMMARY-4` now correctly passes the rule's own worked example, "Thinking the tag is the
isolation," and correctly fails the banned "Ignoring the isolation procedure" opener; `PD-HOOK-6`
now correctly passes a clean PD scene and fails one stuffed with compliance vocabulary). Full
192-criterion structural test (`test-card-quality.js`) still passes at 192/192 prompt-exposure and
60/60 reachability; `test-routes.js` and `test-checks.js` unaffected.

**Known limitation, not yet fixed:** the same three audits also identified two deeper classes of
bug in the regex layer that a polarity flip cannot fix, because they're architectural -
`harvestCardText()` flattens every field of a card into one string before any regex runs, so (a)
a `^`-anchored "check every item" criterion (e.g. "no mistake opens with a character-flaw verb,"
meant to cover all 5 mistakes) actually only ever tests whichever field happens to serialize
first, silently never checking items 2-5, and (b) a criterion that names a specific field
("`sceneParts[3]` ends on a question") can match or miss based on unrelated text elsewhere on the
card once field boundaries are gone. Fixing this properly means teaching `cardQualityIssues()` to
check named fields and individual array items directly, instead of one flattened blob - a real
design change, not a patch, and it has not been rushed into this release. Full detail in the
project's card-quality audit docs.

## 14.0.0 - 2026-09-03

Per-card, per-route quality standard. The 7-card journey and its fields are unchanged - this
release changes what the model is told about the content of each card, and adds a machine check
that the same thing was actually produced.

### The architecture: one table, two consumers, structurally provable

`amd/src/card-quality.js` is a new module holding 33 card x route quality standards (7 cards on
VET/Workplace/PD/University, 5 on Topics-and-Text) - 192 criteria in total, each with an id, a
rule stated in the card's own terms (a VET hook-scenario is judged differently from a Workplace
hook-scenario), and, where the rule can be tested mechanically, a regex with a polarity
(`require`/`forbid`). 60 of the 192 are executable; the rest are marked `check: 'judgement'`
because the standard's own honest position is that memorability and teaching quality are not
regexable, and pretending otherwise would just move the drift somewhere less visible.

Both consumers read this ONE table and nothing else:

- **prompts.js** (`getCardQualityBlock`) renders every card's intent, instruction text, and the
  full list of its criteria - verbatim - into that route's system prompt, appended by
  `getSystemPromptForMode`. This is what the model is told.
- **generator.js** (`cardQualityIssues`) re-reads the same 192 criteria and, for every `regex`
  one, tests it against the generated card's harvested text, respecting polarity. This is what
  is checked, and it feeds the existing repair pipeline exactly like the other quality
  validators - `CC_REPAIRABLE` now recognises `QUALITY STANDARD [...]` issues as worth a paid
  repair call.

Because both sides are one read of `card-quality.js`, a rule that lives only in the prompt or
only in the check is now structurally impossible, not just avoided by discipline. This is proven,
not asserted: `tests/js/test-card-quality.js` confirms all 192 rule strings appear verbatim in
their route's rendered prompt, and independently exercises all 60 regex criteria against a
synthetic blank card to confirm each one is reachable and reports under its own ID (not a
neighbour's). Both checks currently pass at 100%.

## 13.99.0 - 2026-09-03

A content quality STANDARD was commissioned from a learning scientist, written from the evidence
base rather than from what this system happens to do, and scored against the real failing pack.
It scored the pack at **7% of achievable quality**. This release rebuilds the card
specifications from that standard and adds the validators it calls for.

The seven-card journey is unchanged. Every change below is to the content INSIDE the existing
cards and their existing fields.

### THE BIGGEST DEFECT IN THE PRODUCT - each slide was shown the wrong part of the source

Every route interpolated `context.priorityContent.substring(0, 12000)` - the FIRST twelve
thousand characters of the author's reference material, identically, for every section in the
pack.

The Sports Nutrition source that produced the reviewed pack is 36,802 characters. Topics 3, 4
and 5 begin at characters 14,609, 21,290 and 28,302. **The slides titled "Matching Nutrition and
Supplements to Exercise", "Endurance Nutrition and Advanced Fuelling Strategies" and "Nutrition
During Exercise and Recovery" were generated having been shown none of their own material.**

The model could not cite 10-12 g/kg/day, the 2-3% performance gain, the Louise Burke study,
beta-alanine, carnosine, the carbohydrate mouth rinse, train-low/compete-high or 30 g/hour,
because it was never given them. It was handed the first two topics and asked to write about the
last three.

This is not a prompt failure or a model failure, and it is not the vendor. It is the single
largest cause of generic content in this product, and three separate audits missed it because
from inside the prompt the material looks present.

Two changes: the budget is now 60,000 characters (roughly 15,000 tokens, against a 128,000-token
context - the old figure was chosen when windows were small), and where a source exceeds even
that, `ccRelevantSource()` selects the sections that are actually about THIS slide, scored with
inverse-document-frequency weighting so that a rare title word like "supplements" outweighs a
common one like "nutrition", with headings grouped to the text they head.

Measured on the real source: key specifics reaching their own slide went from **8 of 20 to 19 of
20**, and from **0 of the 12 that live past character 12,000** to all of them. `tests/js/test-routes.js`
now builds a 40-section manual and asserts that section 40's material reaches section 40.

### Rebuilt from the standard - what goes INSIDE each of the seven cards

Every route now carries the standard's definition of a TEACHABLE SPECIFIC - a number, threshold
or dose; a named thing; a rule with its boundary; a mechanism with its middle step named; a named
failure state and how you would recognise it - together with the list of category labels that are
not one (tailored, balanced, appropriate, optimal, individual needs). Every card must carry two,
one of which is a number or a named thing.

Per card, all within fields that already exist:

- **Card 1** - panel 1 opens on a named person, a moment and a stake inside fifteen words. Panel
  4 is the COMMITMENT POINT: it ends on a question addressed to the learner about what THEY would
  do, before card 2 answers it. If the people in the scene resolve it themselves, the learner has
  watched somebody else learn.
- **Card 2** - panel 1 answers card 1's question and opens on the thing that contradicts the
  obvious guess. Every panel states a mechanism with its parts named, not a benefit with
  adjectives on it.
- **Card 3** - the procedure of the WORK, not of talking about the work. The meta-procedure
  (assess, explain, tailor, monitor, keep learning) is banned by name. At least three of the four
  or five steps operate on a number or a named thing; one is a branch the learner must choose;
  one says why its threshold sits where it does.
- **Card 4** - panel 3 is a second commitment point: a complication the taught rule does not
  cleanly cover. Panel 4 resolves it by naming the thing, not by "recommending a supplement".
- **Card 5** - a mistake is a thing done wrongly, not an attitude held wrongly. Ignoring /
  Neglecting / Overlooking / Failing to / Assuming all are banned as openings; 24 of the 25
  mistakes in the reviewed pack used that construction. Errors must be ones a knowledgeable
  person makes at the edge of competence.
- **Card 6** - ten facts in imperative form, not ten virtues. The avoid column names the specific
  wrong belief, not the vice.
- **Card 7** - at least two options a competent practitioner might actually choose; the best
  distractor is the right answer to a neighbouring case. Feedback says why someone would believe
  it, then what is wrong, and contains a fact.

### Added - five validators named after the standard's own criteria

- `sourceAnchorIssues` (T0-1) - extracts figures-with-units, named things, technical compounds
  and acronyms from the author's material and reports a slide that carries fewer than six of
  them. The standard calls this the most important validator to build.
- `specificDensityIssues` (T1-4) - a card with no number, threshold or named thing anywhere on it.
- `metaProcedureIssues` (T2-7) - a mental model that is five ways of saying "have a conversation".
- `moralMistakeIssues` (T2-6) - mistakes that are character flaws rather than errors.
- `commitmentPointIssues` (T2-1) - a hook card that resolves itself instead of handing the
  learner a decision.

All five are repairable, so they earn a repair pass. All five were verified against the real
failing pack: the moral-mistake check flags all five of its mistakes cards, the meta-procedure
check flags its mental models, the commitment-point check flags its hooks - and all five stay
silent on a compliant rewrite.

## 13.98.3 - 2026-09-03

Three independent audits of the v13.98.2 work - an adversarial code review, an expert
prompt-engineering review, and a five-route parity review. All three led with the same finding,
and it was mine.

### Fixed - the impossible word range was only fixed in half the prompts

v13.98.2 changed the five GENERATION prompts to ask for three short sentences, because two
sentences under a 20-word cap cannot carry a 42-58 word field. The four REPAIR system prompts
still said "EXACTLY 2 sentences, 42-58 words" - so the repair pass, which v13.98 had just made
fire far more often, handed the model the exact impossibility the release claimed to have
removed. The University repair prompt was staler still: eight of eight field ranges predated
v13.98.1, and it described six card types while demanding seven.

The guard could not see it because it only parsed the five generation prompts.

All four repair system prompts are now DERIVED from their route's own generation prompt, the way
Topics-and-Text has always done it and the only one that had never drifted. The card contract now
exists in exactly one place per route and a repair cannot be told something the generator was
not. `tests/js/test-routes.js` parses generation AND repair prompts, and reads "under 20 words"
as 19 rather than 20 - which caught two further ranges that were unreachable by exactly one word
(scene text 42-58 against 3x19=57, key takeaway 28-40 against 2x19=38). Those are now 42-56 and
28-38.

### Fixed - four defects in the v13.98 checks themselves

- **A parse failure on the repair discarded a good section.** The early return for unparseable
  JSON sat above the salvage block. Before v13.98 that was safe, because attempt 2 only ran when
  attempt 1 was broken; now it also runs after a PASS, so a section that generated correctly
  could be replaced with placeholders because the repair reply came back malformed. It now falls
  through to the salvage path and ships the good version.
- **The repair filter fired on pure length after all.** It tested for the substring `option `,
  which also matches "option feedback 3: 28 words, needs 30-44". Because fields over ~30 words
  are capped server-side, that made four repairable issues on essentially every section of four
  routes - the exact behaviour v13.98.2 said it had stopped. It now matches on issue type.
- **Subject drift named the wrong items.** Labels were read compacted and explanations
  positionally, so any blank explanation shifted the pairing and the repair instruction told the
  model to rewrite the items that were fine and leave the empty ones alone.
- **A missing or empty field was invisible.** The field reader dropped empties before measuring,
  so a mistakes card with five blank consequences measured as perfect while a two-word shortfall
  was reported. A raw reader now measures absent and empty fields as zero.

### Added - a worked example on every route

There was no complete example of a correct card anywhere in the file. The prompts specified
structure entirely by prose enumeration, which asks the model to hold roughly fourteen numeric
constraints per card with nothing to pattern-match against; measured first-pass compliance was
9%. Every route now opens its CARDS section with one complete, annotated, valid card - card 1
for each route, in that route's register and subject matter.

Each exemplar was verified against its own route's specification before insertion: title and
field word counts inside their ranges, exact sentence counts, no sentence over the route's cap,
four distinct icons, a compliant key takeaway. Two drafts were rejected by that check and
rewritten, which is the point of having it.

### Fixed - route parity gaps

- **VET was measured for subject drift but never told the rule.** THE SUBJECT IS THE SUBJECT and
  THE SWAP TEST existed only on Workplace, while `subjectDriftIssues()` runs on VET too. Shared,
  in VET's register.
- **University had no variety machinery at all.** `ccVarietyBlock` is appended by VET, Workplace
  and PD; University was never wired up - on the route whose two case studies must differ in
  setting, differ in question and disagree with each other, with no source of variation and a
  byte-identical cached prompt across every section of a course. It now gets an academic-register
  pool pinned to the section index.
- **PD was measured for repeated outcomes but never told the rule.** Added, with a PD-appropriate
  ceiling of two attention-failures out of five.
- **Topics-and-Text told the model to "never exceed 150 words on a card"** while three of its
  five cards cannot satisfy their own field ranges under 150 - key-concepts tops out at 256. The
  cap now explicitly governs the paragraphs only, with terms, takeaway and sort items outside it.
- **University's validator was stricter than its own prompt** (sentence cap 24 against "under
  25") - the only route where that was true. Now 25.
- **mental-model is specified 4-5 steps and was costed at 4**, so a compliant 5-step card was
  told it was 56 words over. The derived range now uses the card's actual item count.

### Fixed - render and export defects

- Competency-summary printed its five standards TWICE in both exports, because
  `normalizeCardSchema` copies `standardItems` into `items` as well as `goodItems` and the
  v13.98 alias guard tested for the very array that was the duplicate. In the PDF they were
  rendered in the mistakes styling - the standards appeared as red error boxes above the green
  list.
- The PDF export still hard-coded "What the Law Says". The text export was made route-aware in
  v13.98 and this one was missed, so every Workplace and PD pack printed a legislation heading
  over an internal SOP or a coaching principle.
- The two responsive `margin-bottom` rules added in v13.98 were dead - the base rule sits 8,000
  lines later at equal specificity and won the cascade, so mobile silently got the desktop gap.
- `distractorQualityIssues` flagged legitimate options containing "only", "never" or "always"
  ("Always recheck the drip rate at 30 minutes"), costing a paid repair. It now matches the
  self-announcing pattern rather than the bare words.
- The structural-repair path had no content-loss guard: the word-count comparison only armed once
  a valid candidate existed, which is never true when attempt 1 failed structurally. Loss is now
  detected and recorded on the section.
- `msgdifferuniversity` still told teachers University was "six academic cards"; a dead constant
  and a comment describing a function that does not exist were removed.

### Added - a repairable fault that survives its repair now surfaces to the author

One repair is automatic. A fault that survives it stamps `needsReview` on the section, which
`builder.js` already counts in "sections need attention", so the author can retry it deliberately
rather than the plugin spending more credits on its own. Pure length shortfall does not raise it,
because that is capped server-side today and would flag every section forever.

## 13.98.2 - 2026-09-03

Diagnostic release. A second pack was generated on 13.98.x and measured against the first: the
plugin-side fixes all landed, and the content quality did not move. This release fixes the two
plugin-side causes found while establishing why, and documents the one that is not ours.

### Measured: what moved and what did not

Same source, same route, regenerated on the new build.

| Signal | 13.97.1 | 13.98.x |
|---|---|---|
| "Legislation:" headings on a topic with no legislation | 5 | 0 |
| Export file size (duplicate item blocks) | 58 KB | 45 KB |
| Key takeaway length | 16-19 words | 23-35 words |
| Fields inside their specified word range | 9% | 13% |
| Mean scene-text length (spec 42-58) | 31.8 | 28.1 |
| Mean mistakes consequence (spec 34-46) | 21.1 | 20.8 |
| Instances of "in total" | 19 | 19 |

Everything the plugin controls outright moved. Everything that depends on the model writing a
longer field did not, and the shape of the failure is diagnostic: EVERY field asking for more
than about 30 words comes back at 28-31 regardless of what was asked, and the only fields that
land in range are the ones whose spec was already short. That is a ceiling, not non-compliance.

The key takeaway is the exception that proves it. It is a NEW field name, and it moved from
16-19 words to 23-35 - so the system prompt does reach the model. Fields the server's own
secondary passes already know about do not move.

### Fixed - the word ranges were arithmetically impossible

Found while auditing the prompts as prompt engineering rather than as content. Every scenario
field on all three unified routes said:

    text(EXACTLY 2 sentences, 42-58 words in total ...)

while the same prompt said "Sentences stay under 20 words" and `readabilityIssues()` enforced 18.
Two sentences of at most 18 words is 36. **The 42-58 word range could not be satisfied**, and had
not been satisfiable since the ranges were introduced in v13.94.3. The same arithmetic applied to
the mistakes consequence: 2 sentences, 34-46 words, cap 18, maximum 36.

The measured output is the proof. Across two packs the scenario cards came back at 28.1 and 27.1
words and the mistakes consequence at 20.8 - which is exactly two short sentences, every time. The
model was not ignoring the word range. It was obeying the constraint that made the range
unreachable, because that was the one it could actually satisfy.

Fixed on both sides so they can never disagree again:

- the scenario and mistakes fields now ask for THREE short sentences, and the third has a job:
  on a scenario it names the detail that makes the moment real (the number, the time, the reading,
  the person); on a mistake it names what has to happen now to put it right.
- `CC_READABILITY_TARGET` sentence caps now match the caps the prompts state (vet/workplace 18 to
  20, pd 20 to 22, university 22 to 24). Three sentences at 20 words is 60 against a 42-58 ask.
- `tests/js/test-routes.js` now parses every sentence-counted field out of every route prompt and
  fails if `sentences x cap` cannot reach the top of the stated range.

This is the single largest cause of thin content in the pipeline, it was ours, and no amount of
prompt emphasis could ever have fixed it.

### Fixed - every scenario opened in a meeting

All five hook cards of the reviewed pack opened the same way: "During a team meeting, the
nutritionist explains how the body produces energy for exercise." Four of the five put the learner
in the audience watching a colleague explain the subject rather than in the job doing it. That is
the least memorable opening available, and it is where a scenario card goes when the writer has
not chosen a situation.

The old variety pool only varied the EVENT - a handover, an interruption, a step about to be
skipped. Varying the plot while leaving the setting alone still produces five meetings.

Three changes:

- A new pool varies the SITUATION: who the learner is dealing with and where. A customer in front
  of you. A job away from base, for someone who is not your colleague. A person who has already
  been given the wrong answer. Someone confident and wrong. PD gets its own register, where the
  other party is a colleague rather than a customer.
- The choice is pinned to the section INDEX rather than a title hash, so two slides in one pack
  can no longer draw the same situation - five slides now get five different ones by construction.
- The prompts adapt to how specific the brief is. When the author has given a real setting
  (retail supplement sales, store staff, sales assistant), the scenario must be set inside that
  commercial reality - a customer at the counter asking a question someone has to answer on the
  spot, and a different customer with a different pressure on every slide. When the brief is thin,
  the model is told that a general brief is permission to CHOOSE, not a reason to write about
  nobody: invent one specific plausible situation and commit to it. "You are doing some consulting
  work for a local women's hockey side and they want to know how energy systems apply to a
  Saturday double-header" teaches; "in a meeting the team discusses energy systems" does not.

The meeting opening is now banned outright in all three unified prompts, and
`scenarioOpeningIssues()` flags a scenario card whose FIRST panel opens inside a meeting,
briefing, huddle, workshop or catch-up. A meeting later in a scene is ordinary working life and
passes; a meeting as the frame of the whole card does not. It is a repairable issue, so it earns
a repair pass. Verified against seven openings, real and rewritten: 7 of 7 classified correctly,
including the actual v13.97.1 opening.

### Fixed - the quality repair fired on every section and bought nothing

v13.98.0 ran a repair whenever any measured issue was present. Because of the defect above, length
issues were present on essentially every section, so the repair ran on essentially every section:
a second full generation call, its own credits, and roughly a third added to the wall-clock of a
run, to fix something the prompt made impossible.

A repair is now only worth a call when the fault is one the model owns and can fix in one pass -
a missing or vague key takeaway, options answerable by shape, distractors that announce their own
wrongness, subject drift, five consequences landing on the same abstraction, substitution
artefacts. Pure length shortfall is recorded on the card and reported, and spends nothing.

### Fixed - fifteen rules removed from the plugin's own find-and-replace table

`BANNED_PHRASE_RULES` in `generator.js` is a blind find-and-replace run over every generated
string, and it was the plugin's own contribution to the artefact class 13.98 set out to stop.
`ensuring` to `making sure` produced the "makes sure" family. `critical` to `important` deleted a
word that means something. `holistic` to `complete` gave "this complete approach". `landscape` to
`environment` turned landscape painting into environment painting on the Topics-and-Text route -
recorded in the v13.95.8 audit and never fixed here.

13.98 rewrote `BANNED_WORDS` in `prompts.js`, which is the list the MODEL is shown, and left this
table, which is what actually rewrites the text. Fixing one without the other fixes nothing.
Fifteen rules that swap ordinary English for a synonym are gone; the genuine LLM tells that are
grammatical in every position they can match remain.

"in total" does NOT come from here and never did - it appears nowhere in this plugin.

### Fixed - the bulk image route never sent an aspect ratio

`player5.js` has always sent `aspectRatio: '16:9'` on the single-slide route. The BULK route in
`generator.js`, which produces almost every image in a pack, sent no aspect ratio at all - so
almost every image was composed at the model's default (square) and then displayed by
`.cc5-slide-image` in a 16:9-ish box (`width:100%`, `max-height:480px`, `object-fit:cover`).
A square source in that box is cropped to roughly 40% of its own height and scaled UP to the
container width. On a 1200px player that is a 1.16x upscale before the display's pixel ratio is
counted, and about 2.3x on a Retina screen - which is a large part of what "the images look low
res" actually is. The bulk route now sends the same 16:9 the player does, and `ajax.php`
forwards it against a short allowlist.

The pixel dimensions themselves are chosen by the vendor. The plugin still sends no size or
quality parameter and does no re-encoding, so resolution remains a server-side question.

### Not ours - the server's secondary passes

`generator.js` records that the vendor runs "Pass 2 expansion, Pass 3 rewrite and
micro-expansion" server-side after the first generation. Those passes are invisible from this
repository, they rewrite the fields the plugin's prompt specified, and they are the only
remaining explanation that fits all the evidence: the ~30-word ceiling across unrelated field
types, the identical count of "in total" across two different generations, and a new field name
being the only thing that moved. Raised with the vendor.

## 13.98.1 - 2026-09-03

Follow-on from the 13.98.0 review: the Workplace route rebuilt around the defect that made
the Sports Nutrition pack disappointing, and the same treatment applied to the other four.

### Fixed - Workplace taught the advising instead of the subject

The single biggest quality failure in the reviewed pack, and the one no length check could
catch. Asked to teach sports nutrition to people who advise customers about it, the route
produced a pack about ADVISING: ask open questions, listen to client feedback, avoid jargon,
tailor your advice, follow up. Roughly 70% of the mistakes and competency items would have been
identical in a pack for mortgage brokers. Every statement was true, none was the topic.

Workplace's identity block now carries THE SUBJECT IS THE SUBJECT and THE SWAP TEST: could this
card be dropped word for word into a pack about an unrelated subject in an unrelated industry
and still make sense? If yes, the content has been taken out. At most ONE of the five mistakes
and one of the five standards may be a communication habit; the rest must be errors of substance
- the wrong figure, the wrong threshold, the missed step, the rule applied to the wrong case.

Two new checks enforce it. `subjectDriftIssues()` flags a mistakes or competency card where
three or more items carry nothing specific to the subject, scoped to VET and Workplace because
on PD these ARE the subject. `repeatedOutcomeIssues()` flags a card whose consequences all
dissolve into the same handful of abstractions - the reviewed pack's fifty consequences shared
about six endings between them, all variations on lost trust and dissatisfaction. Together they
catch four of the five real mistakes cards from the shipped pack, and stay silent on both a
compliant rewrite and a legitimate workplace card that mentions trust once.

### Fixed - the policy panel invited invention

Card 2 asked for "the document a colleague would actually be sent to, by its real name", and
when there was no such document the model invented one. It now names a document ONLY if the
reference material or trainer instructions name one, and returns an empty heading otherwise -
an invented policy name is worse than none, because the panel it fills reads as authoritative.

### Changed - every route now states a card size its own fields can reach

13.98.0 found that the stated 180-300 band was unreachable on several card types. Rather than
only teaching the validator to derive the truth, the specs themselves are now raised so the
stated band is honest. On all three unified routes cards 2, 3 and 7 gained words - on VET and
Workplace these were the two thinnest cards on the route and also the ones carrying the subject
matter, which is precisely where a pack drifts into generic advice. Card 2 is now 183-251, card
3 180-224, card 7 182-286. University's four thin card types were raised the same way and its
open-ended "5+" item counts fixed at exactly five, because an open count produces five thin
items where a fixed one produces five that carry their weight.

### Added - a falsifiable TEST line on every card, on every route

Ported from Topics-and-Text, which was the only route that had them and, not coincidentally,
the best-written specification of the five. "Each of the three panels must contain something a
learner could be WRONG about." "No two of the five consequences may end on the same outcome."
"A colleague could follow this without asking where anything lives, and could tell you at which
step they would stop and do something different." Each is checkable by a human in two seconds,
which is what makes them work.

### Added - University has a decision-point

It was the only route with no card asking the learner to commit to an answer and find out
whether they were right: six cards of reading, with case-study analysis prompts that have no
answer and no feedback. Retrieval practice with feedback is the best-evidenced intervention
there is and it was the one thing this route did not do. Card 7 tests the analysis the previous
six cards built, with distractors drawn from framework misapplication, unsupported inference and
correlation mistaken for mechanism - and its feedback names the reasoning error, which is where
the teaching happens.

University is therefore a 7-card route now, and no longer exempt from the activities toggle.
Academic packs saved before this build carry six cards, so "Regenerate Failed" will offer to
rebuild them; that is intended.

### Changed - mental-model steps must carry a decision rule

On all three unified routes. A step whose only verb is discuss, explain, consider, review or
observe is not a step - it is a description of paying attention, and it was most of card 3 in
the reviewed pack. Every step now needs a threshold, quantity, reading, time or named condition
that tells the learner which way to go. On PD, where procedure is the wrong register, the
equivalent is the sentence you would actually say and the signal you are watching for in the
reply.

## 13.98.0 - 2026-09-03

Everything in this release comes from one review: the v13.97.1 Sports Nutrition pack measured
field by field against the ranges the prompts themselves state, and against the source lecture
it was generated from.

### Fixed - the word ranges in the prompt are now enforced by something

16 of 172 learner-facing fields in that pack (9%) met the range `prompts.js` states for them.
The mistakes card was 0 of 50, averaging 21 words against a 34-46 spec. Nothing caught it,
because the only length check measured whole CARDS against a floor set deliberately below the
bottom of the band - four scene texts at 32 words plus four titles sums to ~143 and cleared a
145 floor while every field in the card was a quarter short.

The ranges now live in one machine-readable place, `Prompts.getFieldSpecs(mode)`, covering all
five routes. `fieldIssues()` measures every field against it and reports each miss by name,
count and target ("Card 5, mistakes consequence 3: 19 words, needs 34-46, add the second
sentence naming who carries it"), instead of one aggregate number per card. Prompt prose and
validator now read from the same table and cannot drift.

### Fixed - the stated card band and the field ranges had never agreed

Deriving a whole-card floor from the field specs found an incoherence present since v13.94.3.
Every unified route tells the model a card must land between 180 and 300 words, and three of
its seven card types cannot reach 180 even with every field written to the TOP of its range:
concept-explainer is 154-220 on VET, mental-model 152-204, decision-point 158-244. University
is worse - four of its six card types top out under its stated 170 floor. The model was being
given a per-card target its own field specs made impossible.

The whole-card floor is now derived per card type from that type's field ranges
(`Prompts.getCardWordRange()`), so a card written to spec always passes and a thin one never
does, and prompt and validator cannot contradict each other again whichever one is edited. The
route-wide numbers in `CC_DEPTH_TARGET` remain only as a fallback for legacy card types. The
section-level verdict is measured the same way, against what this section's own card types sum
to rather than a route-wide band.

### Fixed - the quality checks now actually repair something

v13.89 made the measured checks report-only after the v13.87 repair pass returned emptied cards
and cost a VET pack 4,000 words. That was right at the time, and it left the ranges enforced by
nothing at all: the 13.97.1 pack ran zero repair passes.

A quality repair runs again, behind two guards that did not exist in v13.87.
`mergePreservingContent()` (v13.88) takes a repair as proposed edits so it can never empty a
card, and a repair that comes back shorter than what it was given is now DISCARDED and the
earlier version shipped. A quality repair that fails structural validation also falls back to
the known-good attempt rather than to placeholders.

### Fixed - decision-point answers gave themselves away

The ANSWER-LENGTH PARITY rule is stated on every route and was enforced nowhere. v13.97.1
shipped a correct answer of 27 words against distractors of 5, 4 and 7, carrying the only
justification clause - answerable by shape without reading the subject. Three further questions
failed the other way, every option a 3-9 word stub. Only 2 of 20 options were in range.

`optionParityIssues()` now checks every option against 10-16 words and fails a card whose
longest option is more than 1.4x its shortest, naming the correct answer when it is the long
one. `distractorQualityIssues()` flags wrong answers built from negations and absolutes ("Use
only technical terms", "Ignore client feedback", "Update knowledge sporadically") - a question
whose distractors are all obviously silly measures nothing.

### Added - keyTakeaway is a specified field

It was specified in no prompt at all. `generator.js` read whatever the model happened to emit
off card 1, which is why four slides carried a vague 16-19 word abstraction and the fifth had
none. Now 28-40 words on every route, two sentences, the fact first; openings that only assert
the topic matters ("A deep understanding of...") are rejected.

### Added - source fidelity and cross-slide dedupe

The largest defect in the pack. A 5,000-word source lecture containing ~40 teachable specifics
produced content with zero of them: no glycogen, no lactate threshold, no beta-alanine, no
carbohydrate mouth rinse, no named study, and not one number. All five slides re-taught the same
three energy systems while their titles - taken correctly from the source - promised five
different subjects.

Every route now carries a USE THE SOURCE block requiring the source's numbers, thresholds,
doses, named studies and worked examples, and requiring one unguessable specific per card.
Sections generate in parallel, so each is now stamped with its sibling titles and position
before the workers start and told, in the prompt, what the other slides cover and not to
re-teach it.

### Added - a concreteness gate

The scenario cards ask for "the place, the time of day, what the learner can see". They returned
"During a team meeting, the nutritionist explains how the body produces energy" - the
description of a scenario rather than a scenario. A scenario panel with no proper noun, no
number and no time marker now fails when half a card's panels are like that.

### Fixed - the banned-word list was damaging the prose

It banned ordinary English (overall, appropriate, ensure, generally, various, significant,
critical, effectively). The model substituted synonyms rather than rewriting, producing 19
instances of "in total" and 22 of "makes sure" in one pack: "for in total health", "enhances in
total performance", "the most right nutritional support", "makes sure diverse insights".

Those words are off the list; the genuine LLM tells (delve, tapestry, leverage, holistic,
paradigm) stay. The instruction now says a vague word means the SENTENCE has no content and must
be replaced with the specific it stood in for. `validateSubstitutionArtefacts()` catches the
artefact pattern so this cannot come back unnoticed.

### Fixed - "Legislation" panel on topics with no legislation

Every concept-explainer rendered a compliance panel headed with an obligation that was not one:
"Obligation: Each energy system contributes to ATP production based on exercise intensity and
duration." The panel is now suppressed entirely when the model names no real governing document
(empty heading, or the topic title echoed back), and the prompts say to leave it empty rather
than invent one. The text export also stopped hard-coding "Legislation:" - it uses the same
route-aware label the learner saw (What the law says / What the policy requires / What the
principle requires), which the on-screen panel has used since v13.96.

### Fixed - exports printed every item two or three times

`standardItems` / `errorItems` are vendor aliases that `normalizeCardSchema()` deliberately
retains alongside the canonical `goodItems` / `badItems` / `items` / `options`. Both the text
and PDF exports walked both, so every competency-summary printed its five standards three times
and every mistakes card printed its five items twice. Guarded the way `keyPoints` already was.
The player itself was correct and is unchanged.

### Fixed - no padding under the Key Takeaway panel

`.cc5-accent-card` had a top margin and no bottom margin, so the green Key Takeaway panel sat
flush against the first card block below it. Added at all three breakpoints, with stacked accent
cards kept to a single gap between them.

### Added - node harnesses under tests/js

`test-routes.js` builds a minimally-compliant card of every type on every route straight from
the spec table and asserts nothing flags - the guard against specs and floors drifting apart
again. `test-checks.js` keeps slide 1.1 of the v13.97.1 pack as a regression fixture beside a
compliant rewrite: the first must keep flagging (33 issues), the second must keep passing.

### Added - the measurement functions are exported

`validateCards`, `fieldIssues`, `optionParityIssues`, `distractorQualityIssues`,
`concretenessIssues`, `keyTakeawayIssues`, `artefactIssues`, `depthIssues` and
`readabilityIssues` are on the generator's public surface so a saved manifest or an exported
pack can be measured without a generation run. The 13.97.1 review had to re-implement all of it
by hand against a text export.

## 13.97.1 - 2026-09-02

### Changed - the quote is now 50 credits per subtopic

On the owner's instruction. A previous revision held it at 100 on the reasoning that the
server still charged 100 and a lower quote would under-state the real cost. That reasoning was
wrong, and the code says so: `ajax.php` sends `creditsToUse = 1` for primary generation and the
vendor honours the caller's number, so a subtopic is debited ONE credit today whatever the
quote says. Lowering the quote cannot overcharge anyone.

### Fixed - the balance card showed dashes instead of figures

"This generation" and "Balance after" were rendered as literal em dashes and only filled in by
`updateCreditEstimation()`, which runs when an additional-language checkbox changes. On first
paint nothing called it, so the card sat on dashes beside an estimate line that correctly read
800 credits.

Both figures are now computed by the markup itself, from one `ccRunTotalCredits()` helper the
estimate line and the card share, so the first paint is correct regardless of what runs after.
The negative-balance flag is applied at first paint too.

### Fixed - two elements shared one id

The legacy credit panel carried `id="cc-credit-estimation"`, the same id as the live estimate
span above it. Duplicate ids are invalid HTML and `getElementById` returns whichever comes
first in the document, so a single reordering would have made `updateCreditEstimation()`
overwrite the whole panel instead of the estimate line. The panel is `display:none` and
referenced by nothing, so the id is removed.


## 13.97.0 - 2026-09-02

### Added - a row per subtopic while the course is being built

Generation showed one bar and a line of text, so an author watching a twelve-subtopic run
could not tell which subtopic was being written, whether its image had come back, or which one
had failed. There is now a row per subtopic with Content, Image, Voiceover and Status, matching
the mockup approved on 2 September.

`generator.js` emits a stage event per section (`reportStage`) alongside the existing
per-section event, so the percentage behaviour is unchanged for anything that ignores it. The
rows are keyed by section id and seeded from the plan, so the whole run is visible as Queued
before the first subtopic starts, and events arriving out of order - generation runs two
sections concurrently - land on the right row.

A note on scope: images were ALREADY generated during the build, one per subtopic, inside
`generateOneSection`. Earlier notes in this project said otherwise; that was wrong. The
`generateSlideImage` call in `player5.js` is the regenerate path, not the build path. No image
work moved; the Image column reports what was already happening.

The credit card now shows previous balance, this generation and balance after, rather than only
the current balance, so the author no longer has to do the subtraction to know whether they can
afford the run. A negative balance after is flagged in red - in both themes.

### Removed - the "Validating content structure" panel

It narrated an internal step to someone who could not act on it, and it occupied the space the
progress table needed. The Structure Validation Results on the FINAL screen is untouched.

### Fixed - the orange buttons were darkened until they stopped looking like the brand

v13.95 darkened every orange CTA to clear AA on a white label. That cleared AA and lost the
brand colour. Saturated orange sits at a luminance that is wrong for white and fine for
near-black, which is why Bootstrap 5, Material 3 and Tailwind all put a DARK label on amber and
orange buttons rather than darkening the fill. Same fix here: the brand orange comes back and
the label flips. 5.68:1 on the light end of the gradient, 4.70:1 on the dark, 6.39:1 on hover.

Three later `!important` blocks in the same stylesheet still carried the old white-on-dark pair
and would have made half of this a no-op - the button would have flipped appearance on hover,
focus AND click, leaving a mouse-clicked button in the old style until focus moved away. All
three updated.

Review Answers is demoted from a third solid orange button to a bordered secondary, so one
primary action leads each screen instead of three competing. Its border uses the darker orange
at 3.61:1, clearing the 3:1 floor WCAG 1.4.11 sets for a UI component boundary; the lighter
brand orange would have failed it at 2.91:1. The label gets a dark-theme value, because
6.46:1 on white is 2.90:1 on the player's dark ground.

Two more white-on-orange failures on the same screen: the active step pill (2.91:1) takes the
same label flip, and the hook-scenario part icon (2.81:1, under the 3:1 floor for a graphic
that carries meaning) is darkened to 4.58:1 with its hue unchanged.

### Changed - the per-subtopic price now lives in one place

It was hardcoded in two functions and two language strings, so a price change meant four edits
and any missed copy quoted a number the server would not charge. It is now
`CC_CREDITS_PER_SUBTOPIC`, declared once.

**The price itself is unchanged at 100.** The owner has approved 50, but the amount actually
debited is the LMS Labs tariff and that has not changed yet - quoting 50 while the server
charges 100 shows the author one number and takes another. Flipping the constant is a one-line
change to make in the same release that the server tariff moves, and not before.


## 13.96.0 - 2026-09-02

The content-quality release. Every change here exists to make generated cards land with a
learner rather than merely meet a word count.

### Changed - a third of every generation was being written, billed and thrown away

Each card on the four card-based routes was asked for 70+ words of `voiceoverText`, roughly
490 words per subtopic. None of it was ever used. `cc-state.js` builds narration from the
visible card fields and skips `voiceoverText` whenever structural content exists - which is
always - and `generator.js` already blanked the field for all thirteen card types before the
manifest was written. The model was competing against itself for budget: 490 words of dead
narration against 1,700 words of visible content in the same completion.

The four system prompts now tell the model not to return the field at all, and every
`voiceoverText` token is gone from the card specs and the repair prompts. Route 5 already did
this correctly and was the model for the change. Narration is unaffected - it never came from
this field. Verified across all thirteen card types, the University legacy path, the
section-level promotion, SCORM export, print and the multi-language pre-generation loop.

The LENGTH block is rewritten to match: the per-field ranges are now stated as authoritative
and the card band (180-300) is derived from them, rather than a 160-240 band sitting above
field arithmetic that summed past it.

### Changed - VET, Workplace and Professional Development are now three products

They were one. `prompts.js` assigned all three the same schema object, and their system
prompts measured 86-91% identical - the whole difference was a persona line, a voice line and
one clause about what kind of detail to name. Card 6 was word-for-word identical across all
three. A learner shown a VET module and a Workplace module on the same topic could not have
told you which was which.

Each route now carries an explicit identity block stating what it is and, more usefully, what
it must NOT contain: VET may not write about strategy, culture or "the business"; Workplace may
not use RTO or assessment language; PD may not reduce a judgement call to a checklist or name
equipment and worksites. Cards 2, 3 and 6 were rewritten per route - the authority a card 2
cites (an Act, an internal SOP, a professional standard), the evidence a card 3 step ends on
(a sign-off, a system record, a read of the other person), and what "ready" means on card 6.
Pairwise prompt overlap is now 0.735-0.754, and what remains shared is the boilerplate that
should be.

Workplace card 2 asks for an internal policy or SOP rather than legislation, so its panel no
longer renders "What the law says" over an SOP name - a third label, "What the policy
requires", is added alongside the existing legal and principle variants.

### Changed - consequences and benefits now land on a person

Card 5's `consequence` requires exactly two sentences: the operational impact, then who
actually carries it, in the words a colleague would use. Each route carries its own worked
example, because the person is different - the apprentice on the other end of the load, the
customer who waited three days for a callback, the team member who stopped raising problems six
months ago.

Card 6's `benefit` gets the same treatment, with the owner's own sentence written in as the
target: "As the nurse on an emergency ward, asking for feedback early is how a small mistake
stays small."

A shared MAKE IT LAND block now sits in all four card-based system prompts and all four repair
prompts: every card must contain at least one sentence a person could picture, drawn from that
route's own world. It also bans the obvious failure mode - no manufactured drama, no
exaggerated risk, no fear used to make a point.

### Fixed - every subtopic in a course read the same

Nothing recorded what a previous subtopic had done, and the system prompt is cached and reused
byte-identically across a batch, so the only thing that varied between twelve subtopics was the
title. They came back as twelve cards of the same shape opening the same way.

Each section now receives a variety block pinning Cards 1 and 4 to different opening situations,
drawn from a per-route pool (PD's is written in a register its own identity block permits). The
pin is derived from the topic title rather than a section index, so regenerating one subtopic
gives it the same opening back rather than silently reshuffling a course the author has already
reviewed.

### Fixed - every card in every course carried the same four icons in the same order

No prompt asked for an icon on scene parts or mistake items, so the resolver always fell to its
fixed positional pool: map-pin, users, message-circle, flame, in that order, on every
hook-scenario ever generated. Meanwhile thirty lines of icon taxonomy sat in three prompts
serving one field. Cards 1, 4 and 5 now request an icon per item.

### Fixed - Card 4 promised continuity and delivered a different scenario

The applied-scenario card renders under a "Continuing the scenario" banner over content the
prompt explicitly required to be a different setting with different people. Card 4 now keeps
Card 1's job and people and moves the time and place, which is what the banner has always
claimed. The author-facing card descriptions in the wizard, which still described the old rule,
are corrected too.

### Fixed - the depth measurement was inflated 2-3x

`harvestCardText` walked every field, and `normalizeCardSchema` deliberately retains both copies
of every aliased array. A genuinely 75-word card measured 150 and cleared a 140 floor, so the
telemetry added in v13.87 specifically to detect thin packs could not detect them, and
`contentWords` stamped on every shipped card was wrong.

Duplicate keys are now skipped, but per card type rather than by a flat list: `items` is an alias
on competency-summary and the CANONICAL field on the mistakes card, so excluding it outright
made the whole mistakes card measure zero. The derived `legalLink` panel, which re-states
heading, keyInfo and summaryLine, is excluded too. Floors are recalibrated against the corrected
count and the thinnest compliant card on each route, which is the four-step mental-model card at
about 152 words. These checks remain report-only.

### Fixed - author instructions were dead on four routes out of five

VET, PD, Topics-and-Text and University all interpolated `additionalInstructions` into their
prompts, but only Workplace ever collected it. Three routes had a promise in the prompt and no
field on screen. All five now have the field, and all five populate the context.

Topics-and-Text borrowed PD's form wholesale, so someone writing an article on Renaissance
painting was asked for their "Industry" and a target audience of "New starters / Team leaders /
Contractors". Both fields are genuinely used by that route - they become the subject area and
the reader - so they are relabelled for it rather than hidden. University's jurisdiction is now
passed through for legal and professional-body references instead of being collected and
discarded.

`mechanismType` and `readingLevel` were read from elements that do not exist and interpolated
from values never set; both removed.

### Fixed - word surgery corrupted Topics-and-Text

Blind phrase replacement turned "landscape painting" into "environment painting" and "critical
theory" into "important theory" on the one route whose premise is an unconstrained subject.
University was already exempt; Topics-and-Text now is too, and nine further rules covering
ordinary English words (journey, landscape, foster, robust, navigate, realm, tapestry, pivotal,
empower) are marked safe on both.

### Changed - the downloadable ChatGPT prompts are now generated from the real prompt

The five ChatGPT prompt files a teacher downloads, pastes into ChatGPT and pastes the output back
from were hand-maintained copies of the card contract living in `builder.js`. They had drifted
badly, and the drift was not cosmetic:

- None of the quality rules above were in them, so a teacher using the ChatGPT path - the path
  people choose when they care most about the result - got the old contract.
- `ChatGPT-Prompt-University.txt` was a clone of the VET vocational prompt. A lecturer
  downloading their route's prompt received seven workplace scenario cards with
  refrigerated-delivery examples, when the plugin's own University route generates six academic
  cards with no scenario at all.
- Four of the five still asked for the pre-v10.43 labelled output format, even though the
  generator has preferred JSON since v10.52 and its own comment says the current prompt-file
  format outputs JSON. Because the parser prefers `PART N` labels and falls back to a `CONTENT:`
  blob, those four produced cards **structurally different from the API path** - one text blob
  instead of the four-panel scene the renderer is built for, no per-item icons, three mistakes
  where the API asks for five, and a generic card 2 that could not drive the legal/policy/
  principle banner. Topics-and-Text had been converted and was the only route behaving.

The file is now composed by `buildChatGptPromptFile()` in `prompts.js` from
`getSystemPromptForMode()` - the same system prompt the plugin sends itself - wrapped with the
teacher-facing instructions, the route's context block, the sub-topic list and the multi-section
`=== NEXT ===` rule. Pasted JSON is picked up by `parseChatGPTJSONBlocks()` and run through the
same `normalizeCardSchema()` the API path uses.

The two paths now produce identical cards **by construction rather than by maintenance**. Every
future prompt change lands on both automatically, and this class of drift cannot recur. The 833
lines of hand-maintained templates are deleted.

Verified end to end: a prompt file was generated for each of the five routes and a synthetic
ChatGPT reply written to the VET file was run through the real `parseChatGPTJSONBlocks` - two
sections split correctly on `=== NEXT ===`, seven cards each with the right cardTypes, the
four-part scene with its per-item icons preserved, five mistake items, and the new Card 6 benefit
carried through.

### Changed - the route picker said too much and explained too little

Choosing a route showed a numbered list of six or seven long card descriptions per route. VET,
Workplace and PD share the same seven card types, so that was substantially the same paragraph
printed three times side by side - which is precisely why the real differences between the routes
were invisible to the person choosing.

The card list is now the card names as compact numbered chips: the sequence at a glance. The
space that frees carries a "How it differs" panel on each route saying what actually separates it
- that VET is written to be assessable and is the only route that imports a unit of competency,
that Workplace names your own policies and systems and uses no assessment language, that
University replaces scenarios with frameworks and case studies, that PD is about judgement rather
than procedure, and that Topics and Text is plain third-person prose on any subject.

Thirty long per-route strings are removed and replaced with seventeen short card names shared
across the routes that share the cards.

### Removed - about 2,600 lines of specification that contradicted the live prompts

`enterprise_qa.js`, `quality_scoring.js`, `scoreQualityGate`, `scoreAuditDefensibility`, the
audit-repair prompt and its three dispatchers, the expansion and banned-word rewrite prompts,
the story-QA prompt, and `training_packages.js`. All were exported, built and shipped, and all
were called from nowhere - some since v11.73.

They had also drifted: they described six legacy card types on routes that generate seven
unified ones, demanded 70+ word voiceover scripts, still asserted the old "different setting"
rule for card 4, and scored any card mentioning "email" or "meeting" as a failure. Four of the
seven specifications for card 6 in this repository were unreachable, and nothing indicated which
three were real. That is how the three unified routes were able to drift into each other without
anyone noticing.

The live repair machinery is untouched and every `Prompts.*` call in `generator.js` was verified
against the export list.


## 13.95.8 - 2026-09-02

### Changed - content prompts rewritten so cards carry a moment, not just a word count

The prompts specified shapes and word counts but never a standard, so the model wrote to the
count: correct, on-length and forgettable. Three changes across all four card-based routes.

Scenario cards (hook-scenario, applied-scenario) now require EXACTLY 2 sentences, 42-58 words
- the first sets the scene, the second says what is happening or what it costs you. Previously
these arrived as one long run-on sentence, which is what the old "37-52 words" invited.

The mistakes card's `consequence` now requires 2 sentences, 34-46 words. Sentence one is the
operational impact; sentence two has to land it on a real person, with a route-appropriate
worked example in each prompt - "the apprentice on the other end of the load is the one who
wears it" (VET), "the customer who waited three days for that callback is the one who tells
forty people about it" (Workplace), "the team member who stopped raising problems six months
ago did not go quiet by accident" (PD).

A shared MAKE IT LAND block now sits in all four card-based system prompts and all four repair
prompts: every card must contain at least one sentence a person could picture, and concrete
beats abstract - "the handover sheet nobody signed" over "documentation gaps". It also forbids
the failure mode this invites: no manufactured drama, no exaggerated risk, no fear used to
make a point.

Topics-and-Text is deliberately excluded. That route is third person and explicitly forbids
named characters and stories, so the rule would contradict its own contract.

### Fixed - the quiz gave the answer away by shape

The decision-point prompt capped each wrong answer at 8-12 words and left the correct answer
with no cap at all (or a wider one on two routes). Every generated quiz therefore had one long,
specific, self-justifying option and three short stubs, and a learner could pick the answer
without reading the question.

All four options are now 10-16 words on every route, with an explicit ANSWER-LENGTH PARITY
rule stating the failure mode, the mechanism, and that any justification belongs in the
feedback rather than the option text. Applied to VET, Workplace, PD and Topics-and-Text, to
all four repair prompts, and to the story-QA rewrite pass - the most likely place for the
correct answer to re-grow.

### Fixed - the two Card 6 columns had different shapes

"What to Avoid" items carried a label plus a consequence; "What Good Looks Like" carried only
a label, so the left column read as run-on sentences beside a tidy heading-plus-explanation
list on the right. This was a data-shape difference, not styling: `badItems` are
`{text, consequence}` and `goodItems` were bare strings.

`goodItems` now carry `{text, benefit}` - a short verb-first label plus one line on what it
changes for a real person in that role. Plumbed end to end: prompt, normaliser
(`_toGoodPairArray`), renderer (`.cc5-do-benefit`, sharing the existing consequence rule),
narration, text export, print HTML and SCORM export. Both editor collectors carry the benefit
across by index rather than collapsing the item to a string, the same guard v13.90.1 added for
`badItems`.

Modules generated before this change carry bare strings and render exactly as they did.

### Fixed - repair passes silently undid the new contract

Four of the five changes above were applied to the generation prompts only. The repair path
fires on any structural failure and restates a stripped-down card spec, which still described
the pre-change shape - and in one case actively contradicted it. The University repair prompt
was worse: every one of its floors was roughly half the generation range, so a University
section that tripped validation came back at about 55% of spec length, in one pass, invisibly.

All four repair prompts now carry the generation ranges verbatim, the MAKE IT LAND rule, and
an explicit instruction that a repaired field must never come back shorter than its range.

### Fixed - tick and cross characters rendered as mojibake

Reported from a live site: `âœ"` appearing beside quiz options. Three stylesheets carried
literal UTF-8 characters inside `content:` declarations - the tick U+2713, the cross U+2717,
the bullet, the arrow and the minus sign. A stylesheet with no `@charset` served under a
Latin-1 charset header decodes those bytes as cp1252, which is exactly the glyph sequence
reported.

All fifteen replaced with CSS hex escapes (`\2713`), which no charset header can misread. An
HTTP `Content-Type` charset overrides `@charset`, so the escapes are the more robust fix.
Worth confirming the real header on the served stylesheet - this plugin bypasses `styles.php`
and serves its CSS as static files, so a server-level `AddDefaultCharset` is the likely cause.

### Fixed - the focus-modal OK button was the wrong green

v13.95 darkened this button down the teal ramp (hue 168) to clear AA on its white label. It
cleared AA, but it sat beside green cards (hue 142) as a separate, muddier colour. The fill is
now the cards' own hue at a darker step: white on it is 5.11:1 resting and 7.08:1 on hover.
`--cc5-teal-darker` and `--cc5-teal-darkest` had no other consumer and are removed.

### Fixed - the Card Title box was blank on every unified card

Unified cards have no per-card title: only `competency-summary`'s prompt asks for one, and the
renderers print `section.title`, which nothing else assigns. The box was correct and simply
gave the author no way to know that. It now carries a placeholder saying the heading is fixed
for the card type.

It deliberately does NOT fall back to `card.heading`. On concept-explainer that field is the
legislation or policy name, and on decision-point it is the question itself - which already has
its own control in the same modal - so binding the title box to it would let a field labelled
"Card Title" silently overwrite the question and surface it a second time as an `<h3>`.


## 13.95.7 - 2026-09-01

### Fixed - rate-limited actions crashed on any site with developer debugging enabled

Reported from a live site: clicking Suggest Topics returned

    Coding error detected, it must be fixed by a programmer: Cache definition
    mod_contentcreator/ratelimit requires simple keys. Invalid key provided. (site:vendor)

The `ratelimit` cache declares `simplekeys`, and `cache_helper::hash_key()` rejects any key
containing a character outside `[a-zA-Z0-9_]`. Both keys this plugin built joined with a
colon - `5:vendor` for the per-user bucket and `site:vendor` for the site-wide ceiling.

The reason it went unnoticed is that Moodle wraps that check in `debugging()`. On a
production site with debugging off the key was accepted and everything worked; on any site
with developer debugging on it threw a fatal `coding_exception` and killed **every**
rate-limited action - topic suggestions, generation, voiceover, images - because the site
ceiling is checked before anything else runs.

Both keys now join with an underscore (`5_vendor`, `site_vendor`). `site_` remains a prefix
that cannot collide with a numeric user id. The change resets existing counters once, which
is harmless.

`jobowner`, the plugin's other simplekeys cache, was checked and is fine: its key is an md5
hash, and the colon it carries is in the value, not the key.

### Added - tests/ratelimiter_test.php

Three tests, including a regression test that exercises every bucket through both the
per-user and site-wide paths. Moodle's PHPUnit runs with debugging enabled, so merely calling
the limiter reproduces the fault - this was verified by restoring the colon and watching the
test fail, then restoring the fix and watching it pass.

The two behavioural tests set `ratelimitgenerate` explicitly, because `enforce()` prefers the
admin setting over the caller's default and the plugin ships a default of 60 - without that,
the tests would have passed while asserting nothing.


## 13.95.6 - 2026-09-01

### Fixed - the plugin could not have passed its own Moodle Plugin CI

The repository's CI workflow runs `moodle-plugin-ci phpcs --max-warnings 0` and
`moodle-plugin-ci grunt --max-lint-warnings 0`. Both treat a warning as a failure, so the 74
CodeSniffer warnings and 5 ESLint warnings carried by this plugin would have failed every run
even once a workflow appeared. All 79 are now cleared.

**CodeSniffer (74).** Every one was a comment that did not open with a capital:

- 35 `// pipeline-ignore:` directives, now `// Pipeline-ignore:`. Confirmed with the pipeline
  first that its parser is case-insensitive and only requires the directive to sit at the start
  of the comment, so the ignore behaviour is unchanged.
- 30 lowercase version stamps (`// v13.94.3:` and similar), now capitalised.
- 4 decorative `// =====` banner rules in the language file, converted to block comments, which
  the sniff exempts.
- 3 comments opening with a lowercase function name, reworded.
- 1 comment separator missing its terminating punctuation, removed.

No wording was changed beyond capitalisation and the three rewordings above.

**ESLint (5), all `no-unused-vars`.** `player5.js` had an unused `var self = this;` in
`setupCardVoiceoverSync()`, which is simply deleted. Three genuinely dead lookup tables
(`GENERIC_AI_ICONS`, `SCENE_PART_TITLE_ICONS`, `TOPICSTEXT_LEGACY_CARD_ORDER`) are underscored
and labelled rather than removed.

`updateCategoriesForUnit` in `builder.js` is underscored **and kept deliberately**. It is
assigned a function and never called, while a comment further down still reads "so
updateCategoriesForUnit() can reach it" - which reads like a lost call site rather than
intentional dead code. Deleting it would have erased that finding; it is flagged here instead
and is worth investigating separately.

`phpcs` now exits 0 with no output, and `grunt eslint` reports no errors and no warnings.


## 13.95.5 - 2026-09-01

Moodle Plugin Directory compliance: the naming, boilerplate and infrastructure items a
reviewer rejects on.

### Added - the managed Moodle Plugin CI workflow

`.github/workflows/ci.yml` did not exist, which is why the release pipeline reported
"Moodle Plugin CI workflow run is missing" - there was no workflow for it to find. Added,
based on `moodlehq/moodle-plugin-ci`, running on branch pushes, tag pushes and pull requests
across three matrix entries: PHP 8.1 on Moodle 4.2 (the plugin's declared `requires`
baseline) with PostgreSQL, PHP 8.2 on 4.5 with MariaDB, and PHP 8.3 on 4.5 with PostgreSQL.

The run title is set with `run-name` so a tag push produces exactly
`Moodle Plugin CI [tag:v<release>]`. The release gate matches on that string, so without it a
green run would still be rejected as evidence. Branch and pull-request runs keep the plain
title.

The workflow ships through git, not the ZIP - `.github/` is excluded from the package, as
required.

### Fixed - GPL boilerplate missing from every JavaScript source

All 25 `amd/src` files lacked the Moodle GPL block; three
(`document_generator/industryProfiles.js`, `document_generator/documentRegistry.js`,
`legislation.js`) had no `@copyright` or `@license` either. The requirement now covers
distributed JavaScript, not only PHP. Every file now carries the complete block, and the
three also gained `@module`, `@copyright` and `@license`.

### Fixed - global constants and helper functions now carry the full frankenstyle prefix

Three global constants became `MOD_CONTENTCREATOR_API_BASE`,
`MOD_CONTENTCREATOR_UPLOAD_MAXBYTES` and `MOD_CONTENTCREATOR_VOICE_MAXCHARS`. Thirteen global
helper functions gained the `mod_` prefix: `api_call`, `check_ratelimit`, `clean_voice_text`,
`fail`, `job_is_owned`, `manageable_courseids`, `prepare_long_request`, `remember_job_owner`,
`require_manage`, `response`, `signature_matches`, `validate_upload`, `vendor_endpoints`.

The nine Moodle core callbacks in `lib.php` - `contentcreator_supports`, `_add_instance`,
`_update_instance`, `_delete_instance`, `_reset_userdata`,
`_reset_course_form_definition`, `_reset_course_form_defaults`, `_get_coursemodule_info` and
`_view` - are **deliberately unchanged**. Their names are fixed by the Moodle API and
renaming them would break the plugin. Database table names are likewise untouched, since
`contentcreator_*` is the correct table prefix.

### Fixed - the text-to-speech lock was node-local, and billed twice for it

The per-section TTS lock file was created directly under `sys_get_temp_dir()`. Beyond being
the wrong API, that path is **node-local**: on a clustered site each web node held its own
lock file, so the lock serialised nothing - both nodes synthesised the same narration and the
site was charged for both. It now uses `make_temp_directory('contentcreator/tts')`, which
lives under `$CFG->tempdir` and is therefore shared moodledata across a cluster.

### Fixed - three `@` error suppressions

`@unlink()` in the TTS shutdown handler and `@filemtime()` / `@unlink()` in the chunk purge.
Suppression hides a real failure as readily as the expected race, so the race each was
covering is now handled explicitly with a `file_exists()` guard.

### Known - three architectural items remain open

Recorded rather than quietly skipped. Each is a substantial refactor and none is attempted
here:

- **`ajax.php` is an ad-hoc action router** - 1,807 lines, 15 `$action` branches behind
  `AJAX_SCRIPT`. Ordinary browser AJAX should be External Services called through
  `core/ajax`; only the multipart `vendor_upload` handler qualifies for the upload exception.
  Eleven external services already exist, so the pattern is established - 14 actions remain.
- **No Mustache templates** - 0 templates, 0 `render_from_template()`, 0 `core/templates`,
  and 62 `innerHTML` assignments building substantial interfaces from strings.
- **417 inline `style="` attributes** emitted from JavaScript, plus 47 `.style.x =`
  assignments, which belong in the scoped stylesheet.


## 13.95.4 - 2026-09-01

### Fixed - ESLint no-console error that would fail Moodle Plugin CI

`cc-state.js` called `console.warn` directly in the label-resolver's catch block. The plugin's
own ESLint config sets `no-console` to **error**, so `grunt eslint` exited non-zero and any
`moodle-plugin-ci` run would have failed on it. The fault predates this release cycle - the
same two lines are present in v13.94.8 - so CI has never been able to pass.

`createLogger()` documents itself as the plugin's single sanctioned console boundary, "which
is why the no-console rule is disabled here and nowhere else". The warning is therefore routed
through it rather than earning a second `eslint-disable`, which keeps that claim true.

`npx grunt eslint` now reports **0 errors** and completes successfully.

### Known - five ESLint no-unused-vars warnings, deliberately left

These do not fail the lint task, and each would be silenced by an `_` prefix - but that would
disguise dead code rather than remove it, so they are reported instead:

- `builder.js:952` `updateCategoriesForUnit` - declared, assigned a function at line 1613, and
  **never called**. The comment at line 1658 says "so updateCategoriesForUnit() can reach it",
  which suggests a call site was lost rather than that the function is deliberately unused.
  Worth investigating on its own merits.
- `cc-icons.js:280` `GENERIC_AI_ICONS` and `:298` `SCENE_PART_TITLE_ICONS` - dead lookup tables.
- `generator.js:959` `TOPICSTEXT_LEGACY_CARD_ORDER` - dead constant.
- `player5.js:4750` `self` in `setupCardVoiceoverSync()` - assigned, never read.


## 13.95.3 - 2026-09-01

Marketplace compliance: all user-facing text in JavaScript is now translatable.

### Fixed - every hardcoded user-facing string in the AMD modules

A compliance sweep found that text a user actually reads was written as literals in
`player5.js`, `builder.js` and `cc-activities.js` - notifications, button labels, form
labels, placeholders, `title` and `aria-label` attributes, the whole print/PDF export, the
country and voice-language pickers, and the mode-card body copy. None of it could be
translated or reworded by a site, and none of it reached AMOS, so a non-English site saw
English in the middle of otherwise translated content.

The first pass found 36. That count was wrong: it only looked at notification and status
text, and missed anything containing a double space, an HTML entity, a line break, or text
sitting between `</strong>` and `<strong>`. Successive passes with wider detection closed
**roughly 1,100 occurrences** across the three modules.

Nothing new was invented to do it. Both large modules already had the right machinery and
these strings had simply never been migrated into it:

- `player5.js` and `cc-activities.js` resolve **441 keys** through the existing `getLabel()`,
  which prefers a language pack, then a `cclabel_` string, then built-in English. New keys
  were added to `UI_LABELS.en`, which also enrols them in the single batched prefetch.
- `builder.js` resolves **566 keys** through the existing `s()` helper and its prefetched
  `CC_MESSAGE_KEYS` batch.
- `lang/en/contentcreator.php` now carries 1,364 strings, so a site can reword any of them.

English wording is unchanged throughout - each value was machine-verified to appear verbatim
in the v13.94.8 source. Sentences carrying a value use Moodle's `{$a}` convention rather than
concatenation, so word order is translatable. Where a label and its inline hint were one
string, they stayed one string: splitting a sentence across keys produces fragments no
translator can work with.

Deliberately not migrated, and recorded here rather than left implicit:

- The **AI prompt templates** in `builder.js`. That text is sent to the model, never rendered
  to a user, and translating it would change the generated content.
- The **eight Google TTS voice names** (Aoede, Kore, Leda, Zephyr, Puck, Charon, Fenrir,
  Orus). They are product identifiers, not copy.
- Six **picker vocabulary tables** (country/state, industry, sub-industry, job title, task
  category, equipment category) holding about 4,625 distinct terms. These are user-facing,
  but keying them would grow the English language file roughly fivefold and hand translators
  a vocabulary of trade equipment and job titles. That is a product decision, not a
  mechanical one, and is left open deliberately.

Also fixed along the way: two `.cc5-doc-link` handlers had been firing on every document
click, and four keys introduced earlier in this release cycle had their English altered by a
double space, an ellipsis character and an en-dash. All four were restored to the v13.94.8
text.

### Known - two pairs of strings disagree with themselves

Four keys predating this work carry different English in their JavaScript fallback than in
the language file, so the wording depends on whether the prefetch has landed:
`quizVoiceEnabledDesc` and `questionsReadAloud` in the player, `errsaveregenerated` and
`errtgaunavailable` in the builder. `errtgaunavailable` looks like a deliberate reword that
never made it back to the fallback. Resolving them means choosing which wording is correct,
which is an owner decision, so nothing was changed.

`cclabel_completeActivity` is defined with an empty English value. It predates this work, no
code references it, and other language packs carry real text for it - so it was left rather
than have English invented for it.

## 13.95.2 - 2026-09-01

Adds the per-subtopic billing key the vendor needs in order to price a subtopic once. No
pricing changes in the plugin: the estimator still quotes 100 credits per subtopic, which
under the agreed tariff is exactly correct.

### Added - every vendor call now says which subtopic it belongs to

The agreed tariff is a flat **100 credits per subtopic**, covering the content, the first
voiceover for each of its sections and the first image for each of its slides, with
regeneration charged at 5. The vendor cannot derive any of that from the HTTP calls alone.
One subtopic is one `/prompt` call **plus** a structural repair call whenever the first
response comes back malformed (`generateFiveCardSequence()` runs `MAX_ATTEMPTS = 2`), plus an
unpredictable number of `/tts` and image calls. Priced per request, a subtopic that needed
repairing would cost 200 rather than 100, and every voiceover would be charged on top of a
price meant to include it.

`planner.js` now mints a `billingKey` for each subtopic as it is created, and it is carried
by every downstream vendor call: content generation and its repair pass, translation passes,
builder voiceover pre-generation, player preload and on-demand voiceover, the background
regeneration after a slide edit, single image generation, and the bulk "images for all
slides" sweep. `generate_voiceover.php` accepts it too, for the mobile app.

The key is deliberately **not** derived from the subtopic id: `planner.js` emits ids like
`subtopic_0_0`, which repeat in every module ever built, and a collision would hand a
customer a free subtopic. It is minted fresh per build and restricted to `[a-z0-9_]` so it
survives `PARAM_ALPHANUMEXT`.

Both image routes now also send the section id. The single-image path already sent an
`isRegeneration` flag, but that flag is set by the browser and the bulk route never sent one
at all - so it cannot be the basis for pricing. The key and section id let the vendor keep
its own record of which section has already had its covered image, rather than trusting the
client's word for it.

Every field is optional and empty-safe on both sides: a site running an older plugin sends
nothing and is priced exactly as it is today.


## 13.95.1 - 2026-09-01

Credit accounting. Two independent audits of every credit-spending path - the PHP spend
layer and the JavaScript that initiates the calls - converged on the same conclusion: the
plugin was paying the vendor for work it then threw away, and in several places paying
again for the same work. Every finding below was verified against the code, not inferred.

### Fixed - voiceover charged, discarded, then charged again on every page load

`ajax.php`'s `generate_voice` fell through to `contentcreator_api_call()`'s 180-second curl
default. This plugin's own logs (v13.92) measured a 4-chunk Chirp 3 HD voiceover at
143-153s, and `CONTENTCREATOR_VOICE_MAXCHARS` allows five chunks - which lands at or past
that ceiling. When curl gave up, the vendor had already synthesised the audio and charged
5 credits; the branch returned `success: false` and skipped the cache write, so nothing was
kept. The client then retried three times, paying each time, and because the failed state
is deliberately not persisted, the whole four-call cycle repeated on the next page load.
Indefinitely.

The server call now gets 280s, inside the 300s of PHP time `prepare_long_request()` already
granted, and matching the web service twin in `generate_voiceover.php` which had used 300s
all along. The browser deadlines that sat *below* the server's ceiling (200s in both the
preload and on-demand paths) are now 300s, so the browser never abandons a synthesis the
site is being charged for.

### Fixed - a timed-out generation job was re-submitted, not resumed

The server charges at submit: `ajax.php` sends `creditsToUse` to `/prompt/start`. When
`pollJob()` gave up after six minutes it threw `OPENAI_TIMEOUT`, which `callAI()`'s own
retry logic classified as transient and retried by calling itself - issuing a brand new
billable job while the paid one was still running. Poll-error exhaustion did the same.
With `MAX_RETRIES = 5` inside a caller that allows two attempts, one flaky section could
bill six times.

On a translation pass that is not a rounding error: `ml_translate_*` is priced at 50
credits per submit, so a single subtopic quoted to the author at 50 credits could cost 300.

`callAI()` now records the job id the moment one is issued and refuses to re-submit after
that point, failing the section instead of buying the same content twice. Retrying is still
allowed before a job exists, which is the only point at which it was ever safe.

### Changed - document examples are generated once, not once per learner

`generate_document_example` was the only AI-calling endpoint in the plugin with no cache at
any layer, and the client never stored the result either - only the teacher's
edit-and-save path populated `documentCache`. So every learner opening the same document in
the same activity triggered a fresh generation, and so did the same learner opening it twice.

To be precise about what that did and did not cost: the vendor endpoint carries **no credit
logic at all**, so this was never a site-credit leak. It cost upstream AI spend, a full
generation's wait for the learner on every single open, and repeated load on an endpoint
that has no rate limit of its own.

The generated document is a pure function of its request payload - it carries no user,
course or activity identity - so it is now cached site-wide in the file store, keyed on that
payload. The lookup happens before the gates so a hit is never blocked by a rate limiter.
The write uses the same delete-before-create pattern as the voiceover cache, so two
concurrent requests cannot lose a document, and a cache-write failure can never fail the
request. The client now also keeps what it fetched, so a repeat open in one session costs
not even a round trip. The 60-second timeout, well under the time a full workplace document
takes, is now 180s.

### Fixed - a cache purge could bill a second generation job

The `jobowner` binding added in v13.94.3 lives in a `MODE_APPLICATION` cache, and
`contentcreator_job_is_owned()` collapsed "no binding found" and "belongs to someone else"
into a single refusal. On a site whose application cache is node-local, or any site where an
administrator purges caches during a job's six-minute window, every poll for a live job was
refused - and the client responded by starting a fresh, billable one.

Absence is now allowed through and logged; a binding that is present but does not match is
still refused, which is the case v13.94.3 was written to stop. The poll already sits behind
`require_login()` and a manage-capability check on the nominated activity, so what remains
is an author who has somehow learned another author's opaque vendor job id *and* whose
binding has expired - against a job that is stale within minutes.

### Fixed - bulk image generation discarded images it had paid for

The bulk path used a 120-second client timeout against a server that allows the vendor 180s,
for a call the code itself documents as taking 30-120s. On timeout the run reported "N of M
generated" while the vendor had billed 5 credits for each image thrown away. Now 210s, in
line with every other path in the plugin.

### Fixed - every document link fired two handlers

Two delegated `click .cc5-doc-link` handlers were bound on the same container: the real
document modal, and a v7.6.1 placeholder popup that had been superseded but never removed.
`e.stopPropagation()` does not suppress a sibling handler on the *same* element - that needs
`stopImmediatePropagation` - so both ran on every click. The placeholder also interpolated
the document name into HTML unescaped. Removed.

### Changed - the document cache is pruned on the existing retention setting

`prune_voice_cache` now sweeps `document_cache` alongside `voice_cache`. Deleting an entry
costs only the work to regenerate that exact document, so the long default retention is
deliberate.

### Fixed - the read-only rate limit could not be raised, and said the wrong thing

Reading the credit balance is a GET that spends nothing, and since v13.80 it has had its own
bucket so it cannot starve the credit-consuming ones. But that bucket was the only one in the
plugin with no setting behind it: 600/hour was hardcoded at the call site and absent from the
settings map, so an administrator could neither raise it nor switch it off. An author who met
it was locked out of reading their own balance with nothing the site could do about it. It is
now `ratelimitvendorread`, configurable like every other bucket, 0 to disable.

The message was wrong in three ways. `ratelimiter::enforce()` builds a detailed message naming
the actual ceiling and window - `ajax.php` threw it away and substituted "You have made too
many AI requests in a short time. Please wait a few minutes and try again." The window is an
**hour**, so "a few minutes" sent authors back to retry into a wall; the ceiling that was
actually hit was never shown; and a *read* is not an AI request, so someone who had merely
opened the builder was pointed at entirely the wrong problem. The detail message is now passed
through verbatim - it alone knows which admin-configured value was applied - and the read
bucket has its own wording stating plainly that no credits were used.

Note for anyone hitting a limit now: the counters live in the `ratelimit` application cache, so
*Site administration > Development > Purge caches* clears them immediately.

### Known - the server is under-charging for primary generation

`builder.js` quotes 100 credits per subtopic. The vendor confirmed on 2026-09-01 that
`/api/moodle/content-creator/prompt` honours the caller-supplied `creditsToUse` verbatim and
applies no tariff of its own - and the plugin sends `creditsToUse: 1`. The owner has since
confirmed that **100 credits per subtopic is the correct rate**, so the quote is right and the
charge is wrong: primary generation has been billing roughly one hundredth of its intended
price. Translation is unaffected and correct throughout (50 quoted, 50 sent, 50 charged).

No plugin change is made here, deliberately. The correct place to hold a price is the server:
this plugin is GPL and installed on customer sites, so any `creditsToUse` the client sends can
be edited by whoever runs it, and a price the client chooses is not a price. The vendor's
`/generate-slide-image` endpoint already demonstrates the right pattern - a server-side
constant, with `creditsToUse` absent from the request schema entirely.

One detail for whoever implements the server-side tariff: a subtopic is **not** one request.
`generateFiveCardSequence()` runs a validity gate with `MAX_ATTEMPTS = 2` - attempt 1
generates, attempt 2 is a structural repair issued only when the first response came back
malformed. A flat 100-per-request tariff would therefore charge 200 for any subtopic that
needed repairing. The billable unit is the subtopic, not the call.

## 13.95.0 - 29 August 2026

Two pieces of work: a fix for a Route 5 button that could render invisible, and the
plugin-wide sweep that fix prompted. Plus a way to apply a plugin update to content that
was already generated.

### Fixed - "Next Activity" was invisible once it unlocked (Route 5)

The button at the end of the three activities rendered white-on-white the moment it was
hovered, focused or clicked - contrast 1.02:1, and the chevron went with it because the
SVG uses `stroke="currentColor"`. Because `:focus` was in the selector list, a mouse click
left it invisible until focus moved elsewhere.

This was not a theme override. One rule in the v13.94.6 hover-hardening block set `color`
and no background - the only rule in that block to break the block's own stated contract -
so the background contest fell to the group above it, whose near-white `!important` value
beat the intended orange gradient. All three properties are now pinned together, as every
sibling group in that block already did.

The same button's disabled state was `opacity: 0.35` over a pair that was only 3.07:1 to
begin with, so the control a learner is waiting on measured about 1.44:1 before it
unlocked. It now states a muted pair explicitly instead of fading the label.

### Fixed - `--background` and `--border` were never defined

`player5.js` emits `border: 1px solid var(--border)` in 35 inline styles and
`background: var(--background)` in three. Neither custom property existed anywhere in the
plugin, so both declarations were invalid at computed-value time: the card-editor rows had
no border, and the move-up / move-down controls had no fill, which left the site theme free
to paint white glyphs on a transparent light background. Both are now defined, scoped to
the player so two very generically-named properties cannot leak into the theme.

### Fixed - colour contrast across the plugin

Verified with a harness that renders all 181 real button classes against a stand-in for the
button rules Boost ships, in both themes and in all four interaction states. Light mode went
from 71 failing state pairs to 3, dark mode from 31 to 4; the remainder in each are a probe
artefact (a container class rendered as a bare button, which does not occur in the markup).

Among the defects that fixed:

- The builder's whole `.cc-btn` family had no `:focus` or `:active` rules at all, so
  keyboard use handed both halves of the colour pair to the theme.
- The builder and cards surfaces had no keyboard focus ring outside four one-off rules
  (WCAG 2.4.7). The player got one in v13.94.6; the rest of the plugin now has one too.
- Rules that paired a hard-coded light background with a theme-flipping colour token, which
  resolve to light-on-light in dark mode. The dark input-method tab was 1.21:1.
- The brand blue and the alert red were used both as accents and as text or fills behind
  text. An accent needs 3:1; text needs 4.5:1. Both now have solid variants for the jobs
  that involve text, and keep their brand values for borders and icons.
- The amber prose tone's accent was 4.02:1 on its own card - the only one of the four tones
  below AA.
- Disabled states that used `opacity`, which fades the label along with the button.

### Added - apply a plugin update to content already generated

Every fix to the narration builder, the label translations or the voiceover schema used to
reach only content generated after the upgrade, because the audio is a stored artefact
rather than something re-derived on load. A teacher who upgraded to pick up a voiceover fix
heard the same audio as before, with nothing in the interface to say why, and the only
recourse was "Reset & Start Over" - which discards every topic, card and hand-edit.

Manifests now record the version that built them. When that is older than the running
plugin, the completion screen shows an "Apply updates & relaunch" panel naming what changed.
Applying it keeps all content, images, activities and edits exactly as they are and clears
only the baked voiceover, so it is re-recorded with the current narration engine on the next
open. Re-recording uses voiceover credits, and the panel says so. It is not shown at all
when the module is already current.

## 13.94.8 - 28 August 2026

A self-review of the 13.94.3-13.94.7 changes, run adversarially on the assumption the author
was careless. It found five real defects introduced by that work. Two were the same mistake
as the two the owner had already caught: a change reasoned about in one function and applied
in another without checking the surrounding scope.

### Fixed - ReferenceError froze the credit estimate

13.94.7 renamed `audAmount` to `usdAmount` when correcting the currency label, but only in
one of the two functions that render the estimate. `updateCreditEstimation()` kept
`const audAmount` while both its template literals interpolate `usdAmount` - a const scoped
to the other function. Under strict mode the handler threw before writing, so ticking an
additional-language checkbox silently froze the estimate at its initial value: the price
shown was wrong for exactly the case that changes it.

### Fixed - "must listen" could still lock a learner out of the section

`setupVoiceoverSync` locks every "Next Card" button, and 13.94.4 added a safety valve to
release them when the audio cannot play. But `state.onError` was REGISTERED at
`addEventListener` and never assigned - an undefined listener is a spec no-op, so the valve
was dead code that read as working code. A learner in "must listen" mode whose narration
404s was locked out of cards 2 onward and the whole activity block for the rest of the
slide. Now defined, along with an `ended` handler so the greyed "listen to unlock" pills
clear once the section has been read.

The mirror of this in `setupCardVoiceoverSync` is also finally gone: 13.94.6 rewrote that
comment to say the handlers had been removed and left the two `addEventListener` lines in
place.

### Fixed - the gate un-retired spent buttons

`applyProseGate` selected every `.cc5-prose-next-btn`, so in voiceover mode each segment
change re-enabled buttons `revealProseCard()` had already retired - undoing the 13.94.6 fix
that made a spent button keyboard-inert rather than merely pointer-inert.

### Fixed - the CJK narration weighting misfired on long single words

13.94.6 weighted segments by characters when the whitespace word-count looked implausibly
low for the length. That is true of Japanese - and equally true of any long compound token.
"Antidiscrimination" scored 9 instead of 1; "Arbeitsschutzverordnung Gesundheitsschutz"
scored 19 instead of 2, taking a wildly oversized share of the timeline and stalling the
card reveal. No ratio threshold separates the two cases: German at 41 characters over 2
words sits exactly where Japanese does.

Replaced with a direct script test - count the characters that actually belong to a
non-spacing script (CJK ideographs, kana, Hangul, Thai). Verified across English prose, long
English and German compounds, digit strings, Japanese, Chinese, Korean, Thai, and Japanese
containing a Latin acronym.

The card routes also never got the fix at all: their weighting fell back to characters only
when the word count was 1, so a Japanese segment containing any whitespace - an embedded
acronym, or a full-width U+3000 space - scored 2 instead of ~200.

### Fixed - numeric coercion could discard every narration request

The 13.94.6 staleness check compares section ids as strings, but the click handler read the
id through jQuery's `.data()`, which coerces numeric-looking values to Number. For a legacy
dotted id, `"1.10"` becomes `1.1`, never matches, and every narration request for that
section is discarded as stale with only a console warning. Now read through `.attr()`.

## 13.94.7 - 28 August 2026

### Fixed - CRITICAL regression: Topics and Text lost its narration after "Next Card"

v13.94.4 fixed a real complaint - clicking "Next Card" advanced the reveal while card 1 was
still being read over the top of card 2 - by STOPPING the audio. That was the wrong fix.
Topics and Text narrates the whole section from ONE file, so stopping it left cards 2 onward
with no narration at all and nothing able to restart it. A worse bug than the one it fixed,
and my error.

The audio is one continuous track with per-card boundaries already computed to drive the
reveal, so the correct behaviour was always to move the playhead rather than kill it.
"Next Card" now SEEKS the narration to where that card's audio begins and keeps playing -
the learner skips ahead and the voice follows them.

Guarded so it only ever jumps forward: if the narration has already passed the card being
revealed, the learner has heard it and the audio is left alone rather than replaying content
they have moved on from. It also forces the boundary calculation if the learner clicks
before the first timeupdate has fired, and resumes a paused element after the seek.

This now applies in every progression mode including "must listen to voiceover", where the
button only unlocks for a card already narrated - so the seek is a no-op there and the audio
runs on to the end, which is what the slide-level Next control waits for.

### Fixed - credit estimate was labelled AUD

The generation cost estimate in the builder read "($80 AUD)". Pricing is quoted in USD.
Corrected in all four places the estimate is rendered.

## 13.94.6 - 28 August 2026

Everything the four cross-route audits found, fixed. The theme running through most of it:
a control or a resolution path changes what the learner is looking at, and does not tell the
other subsystem.

### Fixed - the v13.94.3 translation work never reached the audio

The single most valuable fix in this release. `buildVoiceoverText()` resolves its ~47
headings and connectors through a label resolver that whoever is about to use it registers.
v13.94.3 removed the hardcoded English from that function and translated every key into all
53 languages. **But the only registration site was the player.** The BUILDER, which is what
actually synthesises the .ogg files, registered nothing - so the resolver was null there and
every key fell back to its English default. The English was still being baked permanently
into the audio of every non-English module. The translations existed; nothing consulted them.

There was a second cost. The player *did* register a resolver, so it computed different text
from what the builder had synthesised - `isHashStale` fired on every section of every
non-English module and re-synthesised the whole pack on the teacher's first open. A second
full TTS bill per module, every time.

Fixing it properly needed a new export. `translations.js` prunes `UI_LABELS` to the PAGE
language plus English at load, which is right for the player's chrome and wrong for
narration: the builder synthesises for the CONTENT language of each pack, possibly several
packs in one build, none of them the page language. So the 47 narration keys are now exported
in full for all 53 languages as `NARRATION_LABELS` - about 2,500 short strings, small enough
to keep without undoing the heap saving the compact export was written for.

Both the builder and the player now resolve narration against that one table, keyed on the
content language. Verified by computing the narration on both paths for a Japanese pack on an
English page and comparing the hashes: identical, no English in the output, and materially
different from the old no-resolver result.

The player deliberately does NOT use `getLabel` for this. `getLabel` is correct for the
screen - it lets a site customise wording through the lang file - but a site's custom wording
is something the builder never saw, and on an English Moodle serving a Japanese pack it
returns English because `UI_LABELS['ja']` was pruned away. Either would diverge the hash.

### Fixed - the active language never reached the label layer

`setCurrentLanguage` was called exactly once, at init, with the PRIMARY language.
`setActiveLang` swapped the topics, flushed the audio cache, re-rendered and re-preloaded -
and never updated it. With an English primary and a Vietnamese pack active, every label
resolved English, including the resolver handed to cc-state.

### Fixed - narration could play over the wrong slide, or two at once

`playCachedVoiceover` is now the single choke point for starting narration, and enforces two
things nothing enforced before.

It pauses and dereferences the previous element. The old code assigned
`this.currentAudio = new Audio(...)` straight over a PLAYING element; the discarded element
kept itself alive through its own listeners and went on talking with nothing left pointing at
it that could stop it.

And it checks the request is still current. `playVoiceover`'s guards all run BEFORE its fetch
is issued, and that fetch can take 200s on-demand or 230s on the wait-poll. A learner who
clicked Play, gave up and moved on had the abandoned request resolve minutes later and start
narrating the slide they left - on Route 5, arming a timeline sync from that audio onto the
DOM of the slide they were now looking at.

`render()` now stops the audio too, not merely the sync - it replaces the DOM wholesale, so
"Retry activities" mid-narration left a voice describing card 3 while the reveal sat frozen
on card 1, and saving a slide edit narrated the old text over the new.

### Fixed - the quiz feedback clip was owned by nothing

`_quizFbAudio` was referenced by exactly one handler and by nothing else - not navigation, not
teardown, not focus loss. Answering a quiz mid-narration produced two Chirp voices at once,
the same narrator reading different sentences, and the feedback clip then survived the slide
transition and played over the next slide. It is now stopped everywhere the narration is.

### Fixed - "must listen to voiceover" could be skipped entirely, and could also trap a learner

**Skipped:** `.cc5-challenge-continue-btn` stripped `cc5-disabled` from the Next chevron and
triggered a click on it. jQuery evaluates delegated selectors at dispatch time, so removing
the class immediately beforehand made the `:not(.cc5-disabled)` guard match - and
`canNavigateNext()` was never consulted on that path at all. A learner could ignore the
narration, complete the activities, click Continue and advance. The compliance guarantee the
mode exists to provide was void on all five routes.

**Trapped:** when audio failed to load, the error handler enabled the chevron but did not set
`voiceoverPlayed`, so `canNavigateNext` still returned false and `updateActivityNavState`
re-disabled it the moment the learner touched anything. A slide whose audio 404s handed back
a Next that went permanently grey, with no control on the page able to clear it. Audio that
cannot play cannot be listened to, so the requirement is now satisfied by definition.

### Fixed - the voiceover cache was never validated

The cache lookup was the FIRST return path in `playVoiceover`; the entire staleness apparatus
below it - schema version, word count, text hash - only ever guarded `section.voiceoverUrl`.
The cache is also persisted to `sessionStorage` and restored on a 30-minute window. So a
teacher edits a slide and saves, the edit correctly evicts the cache in that tab, and a second
tab restores the pre-edit audio and serves it ahead of every check. Entries are now
fingerprinted when written and validated on replay; an unstamped entry is discarded rather
than trusted.

### Fixed - PDF and text export printed `[object Object]`

`keyPoints` on hook-scenario, concept-explainer and applied-scenario is an array of
`{title, text}` objects, and `fixGrammar` coerces with `String()`. Latent until v13.89 stopped
deleting `keyPoints` after aliasing it. Every export on VET, Workplace and PD printed 11
`[object Object]` bullets per section - directly below the `sceneParts`/`conceptInsights`
content they were duplicating anyway. The block is now skipped when either of those is
present, and handles the object shape when it is not.

### Fixed - HTML reached the speech engine

`fixGrammar`/`_fg` stripped markdown and nothing else, so a field holding `<br>` or `<strong>`
was read aloud as "less than b r greater than". The renderers escape those tags for display,
which is why nobody saw them on screen. Both copies changed identically - they are contractually
byte-identical, because the player's hash must match the builder's.

### Fixed - the Route 5 paragraph sync was uncorrelated with the audio in CJK and Thai

Segment weights were whitespace word counts. Japanese, Mandarin, Cantonese and Thai are all
offered in the voice list and none of them spaces its words, so a 65-word-equivalent paragraph
counted as 1. Every segment got equal weight and the card reveal and paragraph lift landed
essentially at random - and in the fallback path `duration = totalWeight / WPS` put a
three-minute section at five seconds. Weighting now falls back to characters when the
whitespace count is implausible for the length. English counts are unchanged.

### Fixed - content that was generated, billed, rendered and never spoken

On VET, Workplace and PD the entire "What the law says" panel was silent - the legislation
name, the plain-English obligation and the link back to the scenario, which is the compliance
payload of the route. `badItems[].consequence` was displayed and not narrated. Every
section-level field - Key Takeaway, Pro Tip, Key Information, Expert Insight, Key Terms, the
requirements grid - was narrated ONLY on sections with no cards, because the block sat in the
wrong branch.

On University the narration order was inverted against the render order on every legacy card
type: `bodyText` was spoken before the structured lists but rendered after them, so on
case-study-1 the learner was asked three analysis questions about a case they had not yet been
told, then finally heard the case. `frameworks[].application` and `consequences[]` were silent,
and analytical-lens narrated the same list twice.

Three renderer/narrator alias mismatches meant content rendered and was silent. And "Now,
complete the activity below." was narrated twice, because the prompt requires the card to end
with it and the code appended it again.

### Fixed - CSS: the v13.92.2 remediation was itself the bug, 30 times over

Every `/* v13.92.2: pinned - theme button:hover forces #fff */` comment asserted a pin the
selector could not deliver. The block's own reasoning - *"a class plus a pseudo-class is
(0,2,0)"* - is true against `button:hover` and false against `#region-main button:hover`
(1,1,1). That one sentence is why 30 sites were "fixed" without `!important`. All now pinned,
and the analysis comment corrected to state the real rule.

The work had also only ever considered `:hover`. Boost's selector list includes `button:focus`
and `button:active`, and 69 button-bearing classes had no rule for either - so their base rules
lost outright, with no ID needed. `.cc5-back-btn` and `.cc5-nav-chevron`, the two most-clicked
controls in the player, went grey after every click and stayed there. The sort activity's
good/bad colour coding collapsed the moment a learner used it.

Also fixed: the focus-halo defect plugin-wide (`:focus` → `:focus-visible`, with the keyboard
ring preserved); `builder.css` having no dark mode at all on Moodle 4.4+ because it keys off
`.dark` and never `data-bs-theme`; `.cc5-dos-donts--single` dead at every viewport ≥640px,
leaving the competency-summary card with a blank half; missing `overflow-wrap` on card body
text, which CLIPPED long unbroken strings invisibly rather than wrapping them; wide tables
scrolling only below 640px; 65 media queries normalised so the 480/640/768 boundaries stop
double-matching.

### Fixed - controls that looked disabled but were not

Locked quiz options, decision options, and the Route 5 locked and spent "Next Card" buttons
were held only by `pointer-events: none` and opacity, which does not stop a keyboard Enter -
a learner could Tab to a locked option and answer again after submitting. All now carry a real
`disabled` property and `aria-disabled`.

### Fixed - smaller items

- `cc5-prose-active` was added on reveal and removed only by the next reveal, so after the last
  Route 5 card it stayed on forever - a persistent ring implying that card was still being
  narrated. Its three sibling state classes were cleared on teardown and it was not.
- An empty prose card was narrated as a bare heading while the renderer showed "no content yet".
- `--cc5-bg-hover` and `--border` were referenced but defined nowhere.

## 13.94.5 - 28 August 2026

Four parallel audits of voiceover and CSS across all five routes. This release lands the
critical findings; the remainder are recorded in the project audit note.

### Fixed - Route 5 Challenge Mode sat flush against the cards

Reported with a screenshot. On the other four routes the activity block is a `.cc5-card`
sibling and inherits the 2.5rem `margin-bottom` that spaces every card. Route 5 deliberately
zeroes that on its grid children, because the grid gap handles spacing BETWEEN cards - but
nothing replaced it ABOVE the activity block, so the orange Challenge Mode panel butted
straight against the last prose card and its 3px top border read as a divider rather than
as the start of a new section. `.cc5-prose-activities` now carries the same 2.5rem the
other four routes get.

### Fixed - a ReferenceError on every section-audio end, on four of five routes

Introduced earlier the same day, in v13.94.4. The gate handlers added to Route 5's
narration sync were also copied into `setupCardVoiceoverSync`, where they called
`applyProseGate($grid, ...)` - but `$grid` is declared in `setupVoiceoverSync`, not there;
that function's element set is `$cards`. Under `'use strict'` this threw out of the `ended`
and `error` listeners on every section of VET, Workplace, University and PD.

The fix is not to pass `$cards`. The reveal gate is a Route 5 concept and those routes have
no prose buttons to unlock, so the handlers should never have been there at all; they are
removed.

### Fixed - `animation-fill-mode: both` had killed every card hover across the plugin

`animation-fill-mode: both` retains the final keyframe indefinitely, and animation
declarations outrank normal author declarations in the cascade. Every entrance animation in
the player ended at `transform: translateY(0)`, so that retained identity transform
permanently beat every `:hover` transform on the element beneath it. `.cc5-card:hover`
(`translateY(-2px)`) and `.cc5-topic-card:hover` (`translateY(-4px) scale(1.01)`) have been
dead code on all five routes.

`cc5-flip-card-enter` was the worst of them: a retained `scale(1) translateY(0)` on a card
whose whole purpose is to flip.

A retained transform also establishes a containing block and a stacking context on every
card, which re-anchors any `position: fixed` descendant - and the doc and content popups
open from inside card body text.

The stylesheet already diagnosed this hazard correctly in v13.92 and documented it at
length - but the fix was applied only to Route 5's prose grid and never swept back through
the base rules. All 33 entrance animations now use `backwards`. `cc5-progress-fill` keeps
`both`, because it is the one animation whose final state is a value the base rule does not
otherwise provide.

### Fixed - the empty `<h3>` was still live in Challenge Mode

v13.94.3 guarded six card renderers against emitting `<h3 class="cc5-unified-title">` from a
`title` field no prompt produces. `renderDecisionChallenge` was missed - and it is the
PRIMARY decision-point path; the guarded `renderDecisionPoint` is only reached when a
section has neither flip nor sort items. Only Route 5's prompt asks for `title` on
`decision-point`, and nothing in the generator ever assigns it, so every activity block on
VET, Workplace and PD carried the same 14px phantom gap the earlier fix was meant to
remove.

## 13.94.4 - 28 August 2026

### Fixed - narration kept playing after "Next Card" on Topics and Text

Topics and Text narrates a whole section from one audio file and reveals each card from
that timeline. The "Next Card" handler never touched the audio, so a learner who clicked it
while card 1 was being read got card 2 on screen with card 1 still playing over it - and the
sync then dragged the reveal back as the timeline caught up. Clicking the button is the
learner saying they are reading rather than listening, so the narration now stops and the
reveal becomes theirs to drive.

### Added - "Must listen to voiceover" now gates the card reveal

The progression setting was enforced on the slide-level Next control but not on the prose
reveal, so on Topics and Text a learner could click straight through all five cards without
hearing any of it. Each card's button now unlocks only once the narration has finished
reading that card, with a "listen to unlock" hint on the locked state. A failed or missing
audio file unlocks everything rather than stranding the learner behind narration that is
never going to arrive.

In this mode the narration is deliberately NOT stopped on click: the button is only unlocked
for a card already read, and stopping the audio would strand the slide-level Next control,
which waits on the narration reaching its end.

### Fixed - "Next Card" button styling under Moodle themes

The v13.92.2 fix pinned the hover colour but without `!important`, which does not actually
win: `.cc5-prose-next-btn:hover` scores (0,2,0) while Boost's `#region-main button:hover`
scores (1,1,1) and takes it - the theme's white hover text on this button's white hover
background, the button vanishing under the cursor. Colour, background, border and decoration
are now pinned on both states.

The selected state is fixed too. Boost puts `box-shadow: 0 0 0 0.2rem` on `button:focus`,
which on a pill this small reads as a thick halo stuck to the button after every click. A
pointer click now gets a brief inset press and no ring; the visible ring is reserved for
`:focus-visible`, which is the keyboard case that actually needs it.

The spent-button state no longer fades to 35% opacity, which took the border and label down
with it and left a smudge reading as a rendering fault rather than a finished step - and put
the label under 3:1 contrast. It is now a flat, quiet dashed pill at full strength.

A used button was also only retired by `pointer-events: none`, which does not stop a
keyboard Enter. Both used and locked states are now guarded in the handler rather than by
styling alone.

### Fixed - Topics and Text image requests were missing their subject framing

Found by capturing the outgoing request payload rather than by reading the code.

`generateTopicImage()` resolves `topicTitle` as
`section.topicTitle || context.unitTitle || section.title`. Nothing sets `section.topicTitle`
and Topics and Text has no `unitTitle`, so it fell through to `section.title` - the vendor
received the same string twice, as both `slideTitle` and `topicTitle`, and never received the
parent topic at all. On a route whose images are editorial rather than workplace that is the
most useful framing there is: "Sleep stages and what each one does" is a very different
picture under "Foundations of Sleep Science" than under "Shift Rostering". The parent topic
is now sent.

`scenarioContext` had the same shape of problem. It is built as title plus content, but prose
cards carry no title or heading - the four headings are supplied by the platform and
deliberately stripped from the card - so it came out byte-identical to `slideDescription`,
sending the same paragraph twice under two names. It now leads with the section title.

## 13.94.3 - 28 August 2026

A full defect sweep across the plugin, run as seven parallel audits by defect class.
Everything below was found by that sweep and fixed in one release.

### Fixed - two Topics and Text defects that made earlier fixes unreachable

The four "Download ChatGPT Prompt File" handlers bound to hard-coded mode literals.
The button is rendered by a step shared by **both** the PD route and Topics and Text,
so a Route 5 author was handed the PD prompt - and the `topicstext` template added in
13.94.1 was dead code that nothing could ever reach. The route is now resolved at click
time.

Separately, `getCardSchemaForMode()` had no `topicstext` branch, so Route 5 fell through
to the seven-card VET schema. `normalizeCards()` then saw five cards against an expected
seven and returned early, which meant Route 5 never received the markdown stripping, slang
substitution or doubled-word repair every other route gets. A `TOPICSTEXT_CARD_SCHEMA` now
exists, with matching structure and word-floor branches in the quality gate. The same early
return also skipped clean-up on VET, Workplace and PD whenever activities were disabled;
the card-count check now gates only the positional backfill, not the clean-up.

### Fixed - learner progress and completions could be lost silently

`saveMoodleProgress()` had an empty `.then` **and** an empty `.catch`. A server-side
rejection returns HTTP 200 with `success: false`, so a failed save was discarded with no
trace anywhere - no log, no message, no retry. Failures are now recorded, and the learner
is told once when the save that failed was the one carrying completion.

### Fixed - English narration in translated courses

The plugin generates content in 53 languages and pre-renders narration to Google Chirp 3 HD
audio. `buildVoiceoverText()` was pushing English literals into that text: seven card
headings, five label prefixes, "Now, complete the activity below.", "You are {role}" and
"{term} means {definition}". A Japanese course had English phrases spoken mid-sentence in a
Japanese voice, baked permanently into the audio files. All of it now routes through the
label bundle, with the two sentence-splices handled as whole parameterised phrases rather
than concatenated fragments.

Around 22 renderer headings and the entire Route 5 activity block were hard-coded English
too, in every case where a correct translated key already existed and was simply not being
used.

### Added - complete translation coverage

`en` grew from 372 to 415 labels, and **all 53 language tables now have exact key parity**
at 415 each. 6,164 missing strings were written. Thirteen tables also carried between 135
and 271 filler keys referenced by nothing, which have been removed.

`lang/en/contentcreator.php` now mirrors that set exactly - 415 `cclabel_*` strings, with
nothing orphaned in either direction - so an administrator can reword any player label
through Moodle's normal language customisation.

### Changed - Workplace, PD and University now specify length in words

VET moved to explicit word ranges in 13.94.0 after producing roughly 40% of target length;
the other three routes were still specifying sentence counts and under-producing for the
same reason. All three now carry the same "LENGTH - NOT NEGOTIABLE" contract, with per-card
arithmetic verified: every card's minimum sums to at least 160 visible words and maximums
land between 228 and 243. All six University cards now clear their own 150-word floor,
which four of them previously did not.

### Fixed - PD invented legal obligations

PD's `concept-explainer` prompt was byte-identical to Workplace's and asked for "the
legislation or policy name". That fed a panel headed **"What the law says"** - so a PD module
about giving feedback grew a legal panel over a fabricated requirement, on the one route
explicitly documented as non-regulatory. PD now asks for a principle or professional
standard, and the panel is labelled accordingly.

### Fixed - PDF export produced a stray file, or nothing at all

The HTML fallback block sat *inside* the success branch. Every successful export therefore
also downloaded an unwanted `.html` file, and an export blocked by the pop-up blocker did
nothing whatsoever - no file, no message. The fallback now runs only when the print window
is actually blocked, and says so.

### Security

**Job polling was not bound to its owner.** `poll_job` accepted any job id from any caller
holding `:manage` on any Content Creator activity and returned the vendor's raw payload for
it, so one author could read another author's generated content by replaying an id. Job ids
are now bound to the user and course module they were issued to, via a short-lived cache,
and a poll that does not match is refused.

**A legacy manifest could break every slide edit.** `$section['scenario']` could hold a flat
string that was then written as an array - a fatal `TypeError` on PHP 8, surfaced to the
teacher as a generic "save failed". A second instance of the same pattern was found and
fixed alongside it.

**Capability and error handling.** Four external functions wrapped `require_capability()`
and `validate_context()` inside `catch (\Throwable)`, so a permission failure, a database
error and a fatal were all reported identically at HTTP 200. Capability checks now sit
outside the try, and the remaining catches log properly and return a machine-readable error
code. The `moodle/course:manageactivities` fallback was also removed from activity
enumeration, matching the change made everywhere else in 13.86.

### Fixed - voice and rate limits differed between the web and mobile paths

The web service path was missing the eight-locale fallback table the web path carries, so it
built Chirp voice ids that do not exist and those learners heard silence. Both paths now
share one helper. Rate limits likewise now honour the `ratelimit*` administrator settings on
every path, not just the web one. Chirp 3 HD remains the only voice engine; the fallbacks
cover only locales where Chirp 3 HD has no voice at all.

### Fixed - accessibility

The language switcher's `aria-label` - the only text a screen-reader user hears from that
control - was hard-coded English, inside a widget whose entire purpose is switching language.
It is now translated. The same control declared `role="tablist"` with `role="tab"` children
but had no tabpanel and no `aria-controls` anywhere, so assistive technology announced tabs
pointing at nothing. They are toggle buttons, and are now a labelled group using
`aria-pressed`.

### Fixed - smaller defects

- `manifest.builder` called `onComplete()` without awaiting it, so `build()` reported success
  while voiceover pre-generation and manifest saving were still running, and any rejection
  surfaced as an unhandled promise.
- The translation pass hard-coded `'vet'` as the route, so all five routes were attributed
  to VET.
- The SCORM exporter shipped two silent `catch (e) {}` blocks into customer LMS packages,
  hiding failed initialisation and failed completion writes.
- Five of seven card types emitted an empty `<h3>` carrying a 14px margin, because no prompt
  asks for `title` on those types - a phantom gap under the flow badge on every VET,
  Workplace and PD card.
- The `LANGUAGE OVERRIDE` block was emitted twice, back to back, at the top of every
  non-English prompt.
- Icon rules were being sent for `keyPoints` and `errorItems`, which have no icon field,
  costing roughly 16 lines of prompt per call on three routes for nothing.
- `CC_VERSION` had been left at `13.65` while the plugin shipped 13.94.x, so every support
  log claimed a version 29 releases old.
- `contentcreator_clean_voice_text()` truncated by bytes rather than characters, so a cut
  could split a multibyte character and send invalid UTF-8 to the speech service.

### Changed - coding standards

Full Moodle coding-standards pass: multi-line call formatting across 22 files, comment
capitalisation across 14, and `function (` spacing across 1,353 occurrences in 25 AMD
modules. The PHP reformatting was verified by comparing each file's token stream before and
after with `token_get_all()`, whitespace and comments excluded - all 25 files identical,
proving no behavioural change.

## 13.94.2 - 26 August 2026

### Fixed - Topics and Text printed as headings with nothing under them

`exportAsPdf()` reads 45 different card fields - sceneParts, conceptInsights, items,
keyTerms, goodItems, badItems, options, steps, standardItems, errorItems and the rest.
**`paragraphs` was the only one missing**, and it is the only field Topics and Text uses for
its content. A Route 5 pack therefore printed as four empty headings and an activity block.

Worse, the heading itself was wrong: on this route the four headings are supplied by the
platform and deliberately deleted from the card, so `card.heading || card.cardType` printed
the raw type - "overview", "key-concepts". Print now falls back to `CcState.PROSE_HEADINGS`,
giving the same fixed headings the learner sees, and renders each paragraph beneath them.

This was recorded as a known open item in the v13.92 route spec and has been outstanding
since the route shipped. Printing is how many clients produce a workbook, so for those
customers the route's entire content was missing from the deliverable.

## 13.94.1 - 26 August 2026

### Fixed - Topics and Text had no ChatGPT prompt file and was handing out the VET one

The route offers a "Download ChatGPT Prompt File" button, but `PROMPT_TEMPLATES` had no
`topicstext` key, so the lookup fell through its `|| PROMPT_TEMPLATES.vet` default. An author
on Topics and Text downloaded **the VET seven-card prompt**, under the generic filename
`ChatGPT-Prompt.txt`, and any content produced from it was the wrong shape for the route
entirely. The context block and topics list were not built for this mode either, so even the
wrong prompt arrived with no course details in it.

A Topics and Text template now exists. It asks for the route's real contract - four fixed
headings, exactly two paragraphs of 55-70 words a card, keyTerms, goodItems/badItems, a
four-option decision point, and explicitly no voiceoverText - and it asks for JSON output
separated by `=== NEXT ===`, which routes through the existing JSON fast-parse rather than
the legacy text-label parser. The context block and topics header are now built for this mode
by sharing the PD branch, which reads the same `cc-pd-*` fields the route already uses.

**Verified by round trip, not by reading.** A synthetic ChatGPT response in exactly the shape
the template asks for was fed through `generate()`: both sections parsed, five cards each,
two paragraphs on every prose card, keyTerms 3, goodItems 3, badItems 3, four options with
exactly one correct - and **zero AI calls**, confirming the fast-parse handled it rather than
silently falling back to paid generation.

### Changed - the prompt file had the same sentence-count weakness as the API prompts

Ten fields per template specified length as a sentence count with no word count - the same
pattern that produced 40% length on the API path. Forty replacements across the four
templates: step details now 35-45 words, highlights 18-28, decision questions 25-35, and each
of the four feedback fields 28-38. The prompt file and the API prompt now ask for the same
thing, so content pasted back from ChatGPT is the same length as content generated directly.

## 13.94.0 - 26 August 2026

### Changed - VET cards were coming out at 40% of their intended length

Measured on two independent VET runs (HLTAID011 and BSBTWK301). A section produced 679
words against a `CC_DEPTH_TARGET.vet` of floor 140 / band 160-240 a card - roughly
1,100-1,700 for seven cards:

| Card | Measured | Target band |
|---|---:|---|
| hook-scenario | 88 | 160-240 |
| concept-explainer | 104 | 160-240 |
| mental-model | 69 | 160-240 |
| applied-scenario | 77 | 160-240 |
| mistakes | 89 | 160-240 |
| **competency-summary** | **176** | 160-240 |
| decision-point | 76 | 160-240 |

**Card 6 is the tell.** It is the only card that hit its target, and the only card whose
prompt stated *word* minimums rather than sentence counts. Every other card asked for
`text(2 sentences)` or `detail(2-3 sentences)`, and every one of those fields came back at
12-20 words - one short sentence. A sentence count does not constrain length; a word count
does.

Three systems disagreed about what "long enough" meant and the lowest number won:

- **the prompt** asked for sentence counts, which bind nothing;
- **the vendor's token guard**, appended after our prompt and marked CRITICAL, ends "Being
  concise within populated fields is correct" - so the last instruction the model reads is
  an instruction to be brief;
- **the vendor's expansion floors** are 10 words for `keyPoints[].text`, 12 for
  `steps[].detail`, 12 for `errorItems[].consequence`. Output at 13-17 words clears all of
  them, so the expansion pass never fired.

Our own depth check measured the same cards against 140/160-240 and flagged them, but depth
has been report-only since 13.89, so nothing acted on it.

Every text field in the VET prompt now carries a word range instead of a sentence count,
sized so each card lands in the 160-240 band, with a LENGTH block stating the per-card
requirement outright. The ranges are arithmetically checked against the band rather than
guessed: worst case 132-184 a card at the bottom of every range, 204-238 at the top.
Sentences stay under 20 words - the extra length is more sentences carrying more specifics,
never longer ones.

Expected effect: roughly 1,065-1,537 words a section, against 679 today.

The two vendor-side contributors are not fixed by this release and need changes on
lms-labs.com: the "being concise is correct" sentence in the token guard, and the expansion
floors that are set well below what the prompts ask for.

## 13.93.3 - 26 August 2026

### Fixed - no request the plugin makes had a deadline, so any stall was permanent

13.93.2 put timeouts on the six fetch calls in `builder.js` after the builder was seen
frozen on "Preparing... 0%" for 23 minutes. That was the symptom, not the disease. A full
audit of every `fetch()` in the plugin found **sixteen call sites with no
`AbortController`**, across four files:

| File | Un-timed calls | What they do |
|---|---|---|
| `cc-state.js` | 3 | `vendorFetch`, `vendorUpload`, `vendorDownload` - the shared transport for the TGA unit fetch, topic suggestion, document extraction, Excel export, gallery |
| `player5.js` | 10 | learner-facing: voiceover, slide edits, image actions, downloads |
| `generator.js` | 2 | the async job poller and image generation |
| `builder.js` | 1 | remaining after 13.93.2 |

A browser applies no default timeout to `fetch`. If the upstream never answers, the promise
never settles - no `then`, no `catch`, no `finally`. Every one of these callers disables a
control or shows a spinner before awaiting, so an unanswered request leaves that state set
permanently, with no error and no way back but a page reload.

The three in `cc-state.js` are the worst of them, because they are shared: every route's
step-2 work goes through `vendorFetch`. That is the mechanism behind the frozen builder -
two POSTs in flight, neither ever returning, nothing to catch.

Two in `generator.js` deserve their own mention. **The job poller had no deadline**, and the
loop awaits it, so a single hung poll stopped the entire polling sequence - no further
polls, no consecutive-error counting, no timeout, for a job the server may well have
finished. And **image generation had none** either, on an endpoint already documented as
running 100s+ against a 180s ceiling.

All sixteen now go through one helper, `CcState.fetchWithDeadline()`, exported so builder,
player and generator share it. Deadlines are deliberately looser than the server's own
(210s against ajax.php's 180s vendor timeout; 25s for the 20s status call) so the browser
never abandons work the server is still doing. The helper leaves an existing `signal`
alone, so callers that already manage their own abort keep it. Timeouts reject with a
message naming the call, so the error a user sees says which step gave up.

### Note on the "Preparing... 0%" freeze

13.93.2 added a watchdog that hands the controls back if generation has not started within
30 seconds. That stays, as a backstop. With deadlines now on every request the underlying
stall should surface as a normal error instead - but the watchdog costs nothing and covers
the case where something fails to start for a reason that is not a network call.

## 13.93.2 - 26 August 2026

### Fixed - the builder could hang forever on "Preparing... 0%"

Seen on a live VET build. Clicking Generate showed the progress panel and disabled the
button, and then nothing happened for 23 minutes: no status change, no error, no network
activity that ever completed. Because the button disables itself first, the author cannot
even retry - only a page reload clears it. A second click on a fresh attempt generated
normally, so the failure is intermittent.

The mechanism is a request with no deadline. **Five of the six fetch call sites in
`builder.js` had no `AbortController`.** The browser applies no default timeout, so a POST
the server never answers hangs indefinitely: the `await` never settles, no `catch` runs, and
whatever UI state was set before the call stays set forever. Two POSTs were in flight
throughout; they never returned. (They do not appear in the Performance API either, which is
what made this look at first like "no request was made at all" - pending requests are not
recorded there.)

Two changes:

- **Every ajax POST in the builder now has a deadline.** A new `ccPost()` helper wraps the
  call with an `AbortController` at 210 seconds - deliberately looser than the 180 seconds
  `ajax.php` allows the vendor, so the browser never abandons work the server is still
  doing - and logs which call was abandoned. This also covers the two un-timed-out fetches
  introduced by the quiz-voice work in 13.93.0.
- **A watchdog on the start of generation.** Everything downstream reports through
  `onStatus`, so if that has not fired within 30 seconds the generation never started: the
  controls are handed back with an explanatory message instead of leaving a dead screen. It
  stands down on the first status, on `onError`, and in the catch block, so it can never
  fire over the top of a real error.

The underlying trigger for the stall is still not established - it did not reproduce on
demand. What is fixed is that it can no longer be silent or permanent.

## 13.93.1 - 26 August 2026

Found by the four-route proof run - the run that had been recommended after 13.86 and again
after 13.87 and never completed. Both defects are on the Workplace route and neither could
have been caught by reading the code alone.

### Fixed - the Workplace route was unusable without a document

v13.84 removed the requirement for an uploaded document, on the stated basis that "the
vendor then works from majorTopic + context alone". It does not. `suggestWorkplaceTopics()`
sent `content: workplaceData?.content || ''`, and the endpoint's schema requires `content`
to be **at least 100 characters**. So every no-document Workplace build failed server-side
validation, and the route stayed exactly as unusable as it had been before the fix - which
was the thing v13.84 set out to repair. Reproduced with a 28-character topic and again with
a 193-character one: the typed topic was never sent as `content` at all.

When there is no document, the training topic and the context the author already filled in
are the source material, so they are now composed into a brief and sent as `content` -
training type, company, audience, industry, department, location, and what the subtopics
must cover. It clears the minimum comfortably and gives the model more to plan from than a
bare topic line.

### Fixed - a raw validation object was shown to authors as an error message

The failure above surfaced in the builder as:

    [ { "code": "too_small", "minimum": 100, "type": "string", "inclusive": true,
        "exact": false, "message": "String must contain at least 100 character(s)",
        "path": [ "content" ] } ]

Vendor errors are passed through verbatim by design (v13.66, so that a teacher out of
credits sees the real reason instead of a shrug). That is right for a sentence and wrong for
a serialised validation object. `showError()` now pulls the human-readable part out of a
JSON payload when there is one, falls back to a plain sentence when there is not, and logs
the full text to the console for whoever is debugging. Plain-text vendor errors are
untouched and still shown exactly as sent.

## 13.93.0 - 26 August 2026

### Fixed - the activity block was narrated by a different voice than the cards

Reported from a live Topics and Text module: the voice reading the quiz feedback was not the
one chosen before generation. It never could have been.

Card narration is Chirp 3 HD in the author's selected voice. The quiz feedback was spoken by
the **browser's Web Speech API**, which has no knowledge of that selection and uses whatever
the learner's operating system provides. The code asked for the right accent (`en-AU`) and
then searched the installed voices for a match - but on a machine with no Australian voice
installed there is nothing to match, and Chrome fell through to its default. Captured live,
under a female Australian selection, the actual narrator was:

    Microsoft George - English (United Kingdom)

The consequence is worse than one wrong voice. The result depends on what each learner has
installed, so the same module is narrated by different people on different devices, and by
nobody the author picked. No audio element was involved at all.

**Every voice in this plugin is now Chirp 3 HD in the selected voice, without exception.**

- The builder pre-generates one feedback clip per quiz option at build time, in the chosen
  voice and language, persisting each to the file store exactly as section narration does.
  Generated once, billed once, identical for every learner.
- The player plays that clip. `speechSynthesis` no longer appears anywhere in the codebase.
- Where no clip exists - an older manifest, or a build where TTS failed - the feedback is
  **silent rather than spoken by the wrong voice**. Silence is recoverable; the wrong
  narrator is not. The player logs a warning naming the cause.
- Clip failures are non-fatal to the build: one silent feedback beats a failed module.

Re-generate an existing module to add its quiz narration.

### Fixed - the "read aloud" labels promised more than the code did

The setting read "Read quiz questions and feedback aloud when students answer" and the
player notice read "Questions & feedback are read aloud". Only feedback was ever spoken -
there is no code path that reads a question. Both labels now describe what actually happens,
and the setting says the narration uses the chosen voice.

## 13.92.3 - 26 August 2026

Found by a full end-to-end run of the Topics and Text route on a live site: two subtopics
generated, every card checked, all three activities played through to the results screen.
The route itself passed - four cards, fixed headings, two paragraphs each, 117-131 words a
card, correct tones, no escape artifacts, sequential reveal, quiz, flip cards and category
sort all working across both sections. These are the two defects that run surfaced.

### Fixed - the builder's step 2 called Topics and Text "Professional Development"

The two routes share `renderStep2PD()`, and its heading was hardcoded. An author who picked
Topics and Text was told, at the top of the next screen, that they were configuring
Professional Development. The heading is now route-aware. The shared `cc-pd-*` element ids
are left alone deliberately - they are internal and renaming them would be churn.

### Fixed - the completion screen always reported "0 activities"

`renderLocked()` counted sections carrying a `section.activity` field. Nothing in the plugin
has ever written that field: it is read in three places and set in none. So every build on
every route reported zero activities however many it had produced - this run built three per
section and was told it had none.

What actually drives the activity block is a `decision-point` card in the section, so that
is now what gets counted, with the old field kept as an alternative for any manifest that
does carry it. Not specific to Topics and Text; the count has been wrong on all five routes.

## 13.92.2 - 26 August 2026

### Fixed - white text on white background when hovering the Topics and Text buttons

Moodle's Boost theme ships `button:hover, button:focus, button.active, button:active
{ color: #fff; background: #434343; }`. Every player button rule beats that on *background*
- a class plus a pseudo-class is more specific than an element plus a pseudo-class. But an
undeclared property is not a contest, and `player5.css` never declared `color` inside a
`:hover` rule. Wherever a hover state set a background and left the text colour to inherit,
the theme supplied white.

On Topics and Text the hover background is pure white, so **"Next Card" and "Start
Activities" turned white-on-white and vanished under the cursor** - the two controls the
whole sequential-reveal flow depends on. "Try Again" on the quiz was white on pale peach.
Several buttons that carried no hover rule at all took the theme's dark grey pill instead
of their own styling.

An audit of every `:hover` rule in `player5.css` found 67 that set a background without a
colour. 31 single-selector rules are now pinned to the colour their own base rule declares;
the grouped selectors and the buttons with no hover rule are pinned in a new block at the
end of the file. `:focus` and `:active` on the Topics and Text button are pinned too, since
the theme's selector list covers those as well and that is the keyboard-only path.

Standing rule recorded in the stylesheet: if a `:hover` rule sets a background, it sets a
colour. Never left to inherit.

No change to generation, prompts, card contracts or any route.

## 13.92.1 - 26 August 2026

### Fixed - "Reset & Start Over" could not be used, and its failures were silent

On the locked completion screen, Reset & Start Over did nothing. Three separate faults sat
on top of each other:

1. **The confirmation modal's footer rendered with `display: none`**, so Cancel and
   "Start over" never appeared. The buttons were present in the DOM with their
   `data-action` attributes intact — they simply could not be seen or clicked, which left
   an author with no way to clear a module that had ended up in a bad state. The rule
   hiding it is not ours: this plugin declares no `.modal-footer` rule in any of its four
   stylesheets, and no same-origin rule setting `display` on that element could be found,
   so it arrives from an `@import`-ed sheet belonging to the theme or another plugin on the
   page. We cannot out-specify an unknown selector, so the footer of *this* modal is now
   forced visible with an important inline declaration — applied only when the computed
   display really is `none`, and a no-op everywhere else. Any other Moodle save/cancel
   modal on those pages is still affected; the stylesheet is worth finding separately.

2. **`.then(reset).catch(cancelled)` swallowed real errors.** A `catch` chained after a
   `then` also catches anything thrown inside the `then` body, so a genuine failure in the
   reset was reported as though the user had clicked Cancel. Now the two-argument form of
   `then()`, so a rejection means cancellation and nothing else.

3. **A failed save re-rendered as though it had succeeded.** `saveManifest()` reports
   success through its callback and the callback's flag was ignored, so an expired session,
   a changed capability or a server error left the author looking at a fresh wizard while
   the old content was still on the server — visible again on the next reload. The flag is
   now honoured, and a failure raises an explanatory alert instead of pretending.

No change to generation, prompts, card contracts or any route.

## 13.92.0 - 26 August 2026

### Changed - "Topics and Text" rebuilt: four fixed-heading cards, colour-coded, read one at a time

The v13.91 route shipped five topic-specific headings, up to four paragraphs a card and
250+ words a card. It was rhetorically sound and unreadable: walls of text, literal `\n\n`
escape sequences visible on screen, and no cap on card length. Reported as "funny symbols,
no paragraph spacing, no appropriate limits on card length, too much info to digest".

**The four sections are now fixed and universal**, chosen so they carry any short-course
subject without being reworded per topic:

| Card | Contains |
|---|---|
| **Overview** | What the subject is; why it matters |
| **Key Concepts** | The two or three load-bearing ideas, plus 3-4 flip-card terms |
| **Examples & Application** | The same ideas in two real situations |
| **Key Takeaways** | What to carry away, the common misconception corrected, plus 6 sortable items |

The heading is supplied by the renderer from the card type, never by the model, and the
topic name is never appended to it. "Overview - Colonisation" is now structurally
impossible: `normalizeCardSchema()` deletes any `heading` or `title` the model returns on
a prose card.

**Length is now a hard limit.** Exactly two paragraphs a card, 55-70 words each - about
110-140 words a card against 250+ before. `CC_DEPTH_TARGET.topicstext` and
`CC_READABILITY_TARGET.topicstext` are set to match the prompt so a correctly short card
never fails depth and triggers a pointless repair pass.

**The literal `\n\n` defect is fixed in two places.** The prompt forbids escape sequences
and requires one paragraph per array element; `normaliseProseParagraphs()` in generator.js
splits on both literal `\n` and real newlines, strips markdown, bullet glyphs and `<br>`,
and merges any third paragraph into the second rather than discarding it. The renderer
repeats the clean-up for manifests saved before this release.

### Added - the three activities, on this route too

Topics-and-Text now ends on the same Challenge Mode block as the other routes: quiz, Flip
& Learn, Category Sort. It feeds them from its own fields - `keyTerms` on Key Concepts
become the flip cards, `goodItems`/`badItems` on Key Takeaways become the sort. The route
carries a `decision-point` card for the first time, so the activities toggle now applies
to it exactly as it does to VET, Workplace and PD.

### Added - sequential reveal with narration sync

Cards no longer all appear at once. Card 1 slides gently up on arrival; when its narration
finishes the next card slides in, its "Next Card" button pulses to signal there is
something to click, and a green speaker pulses on whichever card is being read. The
paragraph currently being narrated lifts 3px on a soft shadow. When the audio ends, the
final card and the activity block both open.

Timing comes from the audio itself. `CcState.buildProseVoiceoverSegments()` produces the
narration script - fixed heading, then each paragraph **verbatim** - and the player divides
the audio duration across those same segments in proportion to word count. One source, so
the animation and the audio cannot drift apart by construction.

Every step also works by hand: the "Next Card" button on each card, and "Start Activities"
on the last, do the same thing with audio muted, finished, or blocked by the browser. All
motion is disabled under `prefers-reduced-motion`.

`VOICEOVER_SCHEMA_VERSION` is bumped to `13.92` - audio synthesised from the old
voiceoverText summary has both the wrong content and the wrong segment lengths.

### Verified - "must listen to voiceover" progression on this route

The route inherits the existing gate rather than reimplementing it. With progression set
to Voiceover, `canNavigateNext()` blocks the next slide until `voiceoverPlayed` is set on
the audio's `ended` event, and the next chevron is disabled for the duration of playback on
every route. With the gate off, `navigateToSlide()` pauses and discards the audio before
rendering the next slide, so narration never continues over a slide the learner has left -
the new sync listener is now torn down on the same three paths (next/prev, back to topics,
and finish on the last slide) so it cannot outlive the grid it was driving.

### Changed - colour-coordinated cards

Four soft tones, one per slot: blue Overview, violet Key Concepts, amber Examples &
Application, green Key Takeaways. Each is defined once as custom properties on the card, so
a rebrand means editing four blocks in `player5.css`. Tint, icon chip, heading colour and
hover glow all read from those properties. There is no top accent strip and no left accent
rail — the tone carries on its own — and no nested container.

### Fixed - defects found in review of this release, before shipping

A full adversarial pass over the diff turned up nine substantiated defects. All are fixed
here; they are listed because several were regressions this change would have introduced.

- **`render()` did not tear down the narration sync.** `navigateToSlide()` did, but ~24
  other call sites reach `render()` directly — the activity "Retry" button most reachably.
  The listener was left driving detached nodes: cards stopped revealing and the activity
  block never reopened. Teardown moved to the top of `render()`, which covers every path.
- **`animation-fill-mode: both` killed the hover lift.** Animation declarations outrank
  normal author declarations, so the entrance animation's `transform: translateY(0)`
  was retained permanently and `.cc5-prose-card:hover { transform: translateY(-3px) }`
  never applied. Changed to `backwards`. Verified by computed style: the card now lifts.
- **A non-finite `audio.duration` disabled the whole reveal.** Audio plays from a base64
  data URL, and an Ogg/WebM stream with no duration header reports `Infinity` in Chrome
  forever — in which case no card revealed, no paragraph lifted and no speaker pulsed for
  the entire section. An unusable duration now falls back to a words-per-second estimate.
- **New card-type aliases leaked to the other four routes.** `typeMap` is built once and
  applied on every route, so `'application'`, `'examples'`, `'summary'` and
  `'introduction'` would have re-routed PD, VET, Workplace and University cards into the
  prose renderer, discarding their fields. The loose aliases are now scoped to
  `mode === 'topicstext'`. Verified: `normalizeCardSchema()` output on all four other
  routes is byte-identical to 13.91.4.
- **The five-card span rule was dropped.** Saved v13.91 modules have five prose cards; the
  fifth sat half-width beside an empty cell. Restored — and it cannot match on the
  four-card route, where the last card is an even child.
- **`keyTerms` fed the flip cards from any card type.** University's `concept-anchor` also
  carries `keyTerms` and already renders them as a definition list. Now gated to the
  prose Key Concepts slot.
- **The green speaker kept pulsing while paused.** `pause`/`play` listeners now clear and
  restore it; the revealed card and highlighted paragraph correctly stay put.
- **"Next Card" and "Start Activities" were hardcoded English** — the only two controls in
  the route, on a plugin with 40 locale tables. Both now go through `getLabel()`, with
  `nextCard` / `startActivities` added to all 40.
- **Two paragraph helpers had divergent fallbacks.** `cc-state.proseParagraphs()` and
  `cc-card-slots.proseParagraphsOf()` address the same paragraphs by index; a one-element
  difference would lift the wrong paragraph for the rest of the section. Their emptiness
  test and fallback chain are now identical, and both say so.

### Fixed - defects found in a second review, of the fixes above

The fixes themselves were then reviewed. Seven more issues, three of them substantive:

- **The prose-normalisation branch was not route-gated.** It deletes `heading`, `title`,
  `bodyText`, `text` and string `content`/`description` and rewrites the card into
  `paragraphs[]`. `overview` and `key-takeaways` are entirely natural cardType values for
  a model to emit on a PD or VET section — such a card would have had its authored text
  destroyed and rendered with a fixed Topics-and-Text heading inside a vocational module.
  Now gated on `mode === 'topicstext'`, along with the two `in_practice` aliases that were
  also left global. Re-verified: `normalizeCardSchema()` output on all four other routes
  is identical to 13.91.4, including for the exact payload that triggered this.
- **The words-per-second fallback cached itself forever.** Chrome reports `Infinity` for a
  header-less Ogg/WebM data URL at first and can resolve a real duration moments later;
  the estimate was never replaced, so the whole section ran off a guess. Bounds are now
  recomputed while they are estimated. The `readyState` guard that was supposed to handle
  this was near-unreachable — `timeupdate` does not fire before the element has data.
- **The `onended` recovery read the grid through `_proseSync`,** which a mid-narration
  `render()` has already cleared — so after using the activity Retry button the learner
  was left on card 1 with the audio finished and the activity block shut. It now finds
  the grid in the DOM.
- A second `decision-point` card would have emitted a bare `</div>`, closing the slide
  container. Nothing produces one, but the price of trusting that was the whole page.
- The category-sort source omitted the legacy `boundaries` slot, which the edit modal
  already offers good/bad rows on.
- `onPlay` restored the speaker pulse but not the button pulse, so resuming mid-segment
  left the nudge off until the next segment boundary.
- 13 of the 53 locale tables had been missed. All 53 now carry both keys, verified by
  parsing the file and enumerating.

Three comments that were factually wrong have been corrected rather than left to mislead
the next edit: `:last-child` is structural and *does* match during the reveal (the rule is
safe for a different reason, now stated); `height: 100%` under `align-items: start` does
not equalise card heights; and the two paragraph builders were *asserted* to be identical
while differing by one whitespace rule — they are now genuinely identical, verified across
13 input shapes.

`overflow: hidden` was also dropped from the card. It existed only to clip the top accent
strip to the corner radius, and with the strip gone it clipped the focused paragraph's
lift shadow.

### Fixed - Topics-and-Text content was missing from the text export

`extractAllTextContent()` read no `paragraphs[]`, so the one route that is nothing but
text exported with none of its text. It now writes the fixed heading, both paragraphs and
the key terms. (This gap predates v13.92; the print view has the same shape and is not
addressed here.)

### Added - prose card editing in the Edit Slide modal

The route claimed full card editing and did not have it: the modal builds per-card-type
field blocks and there was none for the prose types, so an author saw a Card Title and a
Voiceover Script and no way to touch the actual words. There is now a paragraph editor,
key-term rows on Key Concepts and good/bad item rows on Key Takeaways. Card Title and
Voiceover Script are replaced on these cards with the fixed heading (read-only) and a note
explaining that narration reads the paragraphs verbatim — both fields are still emitted,
hidden, because the save collector reads them unconditionally.

### Added - "this card is being narrated" on all five routes

The card highlight and the green pulsing speaker are no longer specific to Topics and
Text. While a section's voiceover plays, the card currently being read carries a soft ring
and a speaker chip, on VET, Workplace, PD and University as well.

**No audio is regenerated and the schema is not bumped.** The segments come from
`buildVoiceoverText()`'s own traversal — the same function that produces the TTS script —
via an optional out-param that records `{ cardIndex, text }` per card. There is one
traversal, so the map and the narration cannot drift. `buildCardVoiceoverSegments()`
asserts this rather than assuming it: it calls the builder with and without the out-param
and returns nothing at all if the two strings ever differ, so a future edit that changed
the script would silently disable the highlight instead of running it out of step.
Verified across nine section shapes — promoted `voiceoverText`, the 7-card early-return
branch, the ultimate fallback, University, Workplace legacy, no-cards, terminology and
accent cards, empty arrays — all byte-identical to 13.91.4.

Cards are addressed by a `data-vo-card` index stamped by the player, not by editing nine
card renderers. The speaker chip is injected at playback time into the flow badge the
unified card types already carry, or the card header on the legacy and University types,
so it exists only while a section is actually being narrated.

**Deliberately not ported: the sequential reveal and the Next Card gating.** Those cards
are interactive — flip, sort, quiz — and their order is a narrative; putting each behind a
button changes the teaching, and the decision-point already gates progression.

**Also deliberately not ported: the paragraph-level highlight.** The other routes narrate
structural sub-elements — scene parts, insights, steps, mistake rows — and timing a
five-word step title off a proportional split is visibly loose, wrong outright on the cards
where an authored `voiceoverText` is narrated in place of the structural fields. A card is
60-110 words, which the split handles well. Card-level is the honest granularity here.

### Compatibility

The five v13.91 slot names (orientation / foundations / mechanism / in-practice /
boundaries) still render, mapped onto the new headings and colours, so modules built on the
old route keep working. Nothing generates them any more.

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
