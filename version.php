<?php

// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <http://www.gnu.org/licenses/>.

/**
 * Content Creator v12.77
 *
 * v12.77: FIX-CC-MULTILANG-SECONDARY-PASSES — Punjabi (pa-IN) and other non-English
 *   additional-language cards were generated correctly in Pass 1 but then silently
 *   reverted to English by the server-side secondary passes (Pass 2 expansion,
 *   Pass 3 banned-word rewrite, Micro-expansion) in server/routes.ts.
 *   Root cause: these passes used hard-coded English system prompts with no language
 *   instruction. ccCheckWordFloors() fired on Gurmukhi content (non-English text can
 *   have different word-count distributions than the English-calibrated floors), which
 *   triggered Pass 2. The expansion system prompt said "Write in plain, direct language"
 *   — OpenAI interpreted this as English and rewrote every flagged field into English.
 *   diag.php Section 6 then found ZERO Gurmukhi characters and reported a FAIL.
 *   Fix: server/routes.ts now extracts the target language name from the incoming
 *   systemPrompt ("Generate ALL content in <Language>. This is NON-NEGOTIABLE") and
 *   injects a ⚠️ MANDATORY LANGUAGE REQUIREMENT guard into all four secondary pass
 *   system prompts: expansionSystemPrompt (Pass 2), rewriteSystemPrompt (Pass 3
 *   field-level), fallbackSystemPrompt (Pass 3 full-object fallback), and
 *   microSystemPrompt (Micro-expansion). Additionally, the deterministic English
 *   word substitution step (ccDeterministicClean) is now skipped for non-English
 *   content — the English regex patterns cannot match Gurmukhi/Devanagari/CJK
 *   script but skipping explicitly prevents any edge-case interaction with
 *   English-borrowed words in bilingual content. Server-side fix only — no AMD,
 *   PHP, CSS, or DB schema changes. version.php → 2026050900277.
 *
 * v12.74: FIX-CC-DIAG-SLIDES — "Slides per topic" in diag.php Section 3 was a
 *   FALSE FAIL for all v12+ card-based activities (VET, Workplace, University, PD).
 *   Root cause: the check read topic['slides'] only. The v12+ manifest format stores
 *   content as topic.sections[].cards[], not as topic.slides[]. Every card-based
 *   activity therefore scored 0 slides → FAIL even when fully generated.
 *   Fix: check renamed "Content per topic". Logic now inspects BOTH topic.slides[]
 *   (legacy format) AND topic.sections[].cards[] (v12+ card format). A topic is
 *   "populated" if either: (a) slides[] is non-empty, or (b) at least one section
 *   contains at least one card. PASS detail message now identifies which format was
 *   found and reports total sections + cards for card-based topics.
 *   PHP: diag.php Section 3 (lines ~156-215). No AMD, CSS, or DB changes.
 *   version.php → 2026050900274.
 *
 * v12.73: FIX-CC-DIAG-VOICEOVER — Voiceover language verification hardened in diag.php
 *   Section 6. Replaced the generic PASS (URL exists + content passed) with a
 *   three-layer honest proof model with explicit confidence levels:
 *   Layer 1 — Content propagation (DEFINITIVE FAIL): TTS is fed the stored card text;
 *   if that text is English, the audio is English — no URL check can override this.
 *   Layer 2 — URL sectionid language extraction (DEFINITIVE PASS when present): parses
 *   voiceover_{sectionid}.ogg filename from each HTTPS voiceoverUrl; if the sectionid
 *   contains the expected language code (e.g. mlsec_hi-IN_2.ogg confirms Hindi), that
 *   is physical proof the file was stored for this language.
 *   Layer 3 — Synthesis fingerprint (STRONG SIGNAL): checks voiceoverSchemaVersion
 *   ('12.32' = current TTS pipeline) and voiceoverTextHash presence on each section;
 *   if both are present with a passing content script check → HIGH CONFIDENCE.
 *   Outputs: [CONFIRMED] = URL+script both pass; [HIGH CONFIDENCE — fingerprinted] =
 *   fingerprint+script; [MEDIUM CONFIDENCE] = fingerprint present but similarity-only
 *   content check; [WARN — low confidence] = old schema or missing hash. Old/missing
 *   schema or voiceoverTextHash → WARN with regeneration advice rather than false PASS.
 *   PHP: diag.php Section 6 (section gather loop + Check 3 block). No AMD, CSS, or DB.
 *   version.php → 2026050900274.
 *
 * v12.72: FIX-CC-DIAG-LANG — Section 6 language checks hardened.
 *   (1) Unicode script detection (Method A) for 17 non-Latin scripts:
 *   Devanagari (hi), Gurmukhi (pa), Bengali (bn), Gujarati (gu), Tamil (ta),
 *   Telugu (te), Kannada (kn), Malayalam (ml), Arabic (ar/ur), Hebrew (he),
 *   Cyrillic (ru/uk), Thai (th), CJK (zh), Japanese (ja), Hangul (ko).
 *   Tests whether stored card text contains even one character from the expected
 *   script — a definitive FAIL if not. No HTTP requests. cc_script_map added.
 *   (2) Broad 800-char multi-card sampling via new cc_diag_collect_card_text()
 *   helper — collects text from ALL cards/sections (not just first card).
 *   (3) Critical voiceover fix: if content_is_english=true (script FAIL or
 *   similarity>85%), voiceover is now FAIL — "TTS synthesised English words,
 *   audio plays in English regardless of voice code". Previously emitted false
 *   PASS whenever URLs existed; a URL proves only audio was synthesised, not
 *   that it is in the correct language. Genuine PASS now requires URLs present
 *   AND content language check passed.
 *   PHP: diag.php Section 6. No AMD, CSS, or DB schema changes.
 *   version.php → 2026050900272.
 *
 * v12.71: FIX-CC-REPAIR-LANG — Additional-language content generation fix.
 *   Root cause: all 4 repair system prompt builders (buildContentRepairSystemPrompt,
 *   buildUniversityContentRepairSystemPrompt, buildWorkplaceContentRepairSystemPrompt,
 *   buildPDContentRepairSystemPrompt in prompts.js) accepted a `context` parameter but
 *   never called getLanguageInstructions(). When attempt 1 produced valid-schema English
 *   content and the generator entered the attempt-2 repair path, the repair system prompt
 *   was entirely in English regardless of the target language. The AI repaired the English
 *   content into correctly-structured English, defeating the translation entirely. The
 *   repair user prompt correctly had the getLangPrefixForUserPrompt() prefix (added in
 *   v12.69), but the system prompt (which has higher authority with OpenAI) had no language
 *   requirement — so the AI ignored the user prompt language instruction.
 *   Additionally: generator.js cache key and getLanguageInstructions() call both used
 *   `context?.voiceLanguage || context?.language` — if voiceLanguage was ever set (the
 *   teacher's primary TTS setting, carried via Object.assign into the additional-language
 *   context), it would resolve to 'en-AU' and the English system prompt would be cached
 *   and reused for all subsequent topics in the Spanish/French/etc. batch. Fixed to
 *   `context?.language || context?.voiceLanguage` so the explicit content language always
 *   takes priority. Diag: Section 6 added — checks multiLanguage array structure, topic/
 *   section/card counts per language, translation quality (text similarity vs primary),
 *   and voiceover pre-generation status per language. FAIL raised when similarity > 85%
 *   (English content stored in a non-English language slot) so teachers can detect the
 *   exact failure and are told to regenerate.
 *   AMD: prompts.js (4 repair system prompts), generator.js (2 lines).
 *   PHP: diag.php (Section 6). No PHP functional, CSS, or DB schema changes.
 *   version.php → 2026050900271.
 *
 * v12.70: ADD-CC-DIAG — Added diag.php diagnostic tool.
 *   Access at /mod/contentcreator/diag.php (config-only) or
 *   /mod/contentcreator/diag.php?cmid=<cmid> (activity-level checks).
 *   Checks: Site ID / API key config (via local_aiconfig or plugin settings),
 *   required DB tables, manifest JSON validity and structure (topics/slides),
 *   AMD build file presence and format (define() not ES6), and src-to-build
 *   file timestamp sync. Requires moodle/site:config capability. Read-only —
 *   no data is modified and no external requests are made.
 *   No PHP functional, AMD, CSS, or DB schema changes. version.php → 2026050800270.
 *
 * v12.69: FIX-CC-MULTILANG-TEXT — AI was generating English card content for
 *   all additional-language topics because every user prompt sent to OpenAI
 *   was 100% English (topic titles, performance criteria, and up to 12,000
 *   chars of English reference material). The "write in Spanish" instruction
 *   only appeared as a footnote at the end of the system prompt; OpenAI
 *   models follow the user message language more strongly than a system-prompt
 *   footnote, so all additional-language cards came back in English. Downstream
 *   consequence: the Spanish/etc. TTS voice then synthesised English card text,
 *   producing Spanish-accented English audio — not Spanish.
 *   Fix: new getLangPrefixForUserPrompt(context) helper in prompts.js injects
 *   a hard-gated "!!MANDATORY LANGUAGE REQUIREMENT!!" block as the very first
 *   line of every user prompt when context.language is non-English, before any
 *   English context follows. The block names the target language explicitly,
 *   forbids any English output, and clarifies that English reference material
 *   is subject-matter context only. The prefix is wired into all 8 prompt
 *   builders: buildVetFiveCardUserPrompt, buildWorkplaceFiveCardUserPrompt,
 *   buildPDFiveCardUserPrompt, buildUniversityFiveCardUserPrompt, and the four
 *   matching repair prompts (attempt-2 retry path). English generations
 *   (en-AU, en-GB, etc.) return an empty prefix — zero change to existing
 *   behaviour. prompts.js version tag bumped to v12.69.
 *   AMD: prompts.js only. No PHP, CSS, or DB schema changes.
 *   version.php → 2026050400269.
 *
 * v12.68: FIX-CC-MULTILANG-PERSIST + FIX-CC-MULTILANG-NAME-FALLBACK — Two
 *   additional-language fixes that together unblock Punjabi/Thai/etc. courses.
 *   (1) FIX-CC-MULTILANG-PERSIST (builder.js multi-language pregen loop): The
 *   loop stored each generated voiceover as a `data:audio/...;base64,...` URL on
 *   the section. saveManifestSilent's stripAudio() then deleted every data: URL
 *   on save (replaced with the 'pregenerated' sentinel) so the audio never
 *   reached the database. Primary-language audio recovers because a teacher
 *   reload triggers a re-persist via persistVoiceoverToFileStore on the player;
 *   additional languages had no such recovery, so students hit
 *   'INCOMPLETE VOICEOVERS - N section(s) not complete' on the player and
 *   could never play Punjabi/Thai audio. Fix: the multi-language pregen now
 *   POSTs each clip immediately to ajax.php?action=save_voiceover_file and
 *   stores the returned HTTPS URL on the section, marking voiceoverStatus
 *   'complete'. The HTTPS URL survives stripAudio cleanly and students get
 *   working audio.
 *   (2) FIX-CC-MULTILANG-NAME-FALLBACK (prompts.js getLanguageName): The
 *   LANGUAGE_NAMES map was missing pa-IN (Punjabi), cmn-TW (Mandarin
 *   Traditional), pt-PT (Portuguese Portugal) and is-IS (Icelandic) even though
 *   the builder UI offered them as checkboxes. The fallback returned
 *   'English (Australian)', so the LLM was literally instructed
 *   "Generate ALL content in English (Australian)" for those languages — that
 *   is why Punjabi-built courses came out in English. Fix: added the missing
 *   entries; getLanguageName now returns the raw code rather than silently
 *   falling back to English when the code is non-English-prefixed but unknown,
 *   and logs a console warning so future gaps surface immediately.
 *   No PHP, CSS, or DB schema changes. version.php → 2026050300268.
 *
 * v12.67: FIX-CC-MULTILANG-PROGRESS + FIX-CC-MULTILANG-SENTINEL-RESTORE — Two
 *   additional-language voiceover correctness fixes.
 *   (1) FIX-CC-MULTILANG-PROGRESS (player5.js getVoiceoverProgress): The function
 *   did not count sections whose voiceoverUrl === 'pregenerated' (the sentinel) as
 *   "ready", creating an inconsistency with isVoiceoverGenerationPending() which
 *   already treated the sentinel as "audio available" (v12.62 fix). In the edge case
 *   where renderVoiceoverWaiting() was invoked with additional-language sections active,
 *   the progress bar showed "0 / N slides" and could not advance, appearing permanently
 *   stuck. Fix: add hasPregenerated = (s.voiceoverUrl === 'pregenerated') guard so
 *   getVoiceoverProgress() counts sentinel sections as ready, matching isVoiceoverGenerationPending().
 *   (2) FIX-CC-MULTILANG-SENTINEL-RESTORE (player5.js playVoiceover): The student
 *   on-demand fetch path (reached via _wasPregenerated bypass introduced in v12.63)
 *   called `delete section.voiceoverUrl` BEFORE the fetch, removing the sentinel from
 *   the in-memory manifest section object. If the fetch subsequently failed (server
 *   error, rate limit, network drop, 200s abort), section.voiceoverUrl remained
 *   undefined. On the next Play click _wasPregenerated evaluated to false (sentinel
 *   gone), the student billing guard fired, and the Listen button was permanently
 *   disabled for that section for the rest of the session — the student could not
 *   retry without a page reload. Fix: both the .then() error branch and the .catch()
 *   handler now restore the sentinel (`section.voiceoverUrl = 'pregenerated'`) when
 *   _wasPregenerated was true and the fetch failed without producing a cache entry.
 *   AMD: player5.js triple-match 80120e8b22fc1f375ccb725a172fb44f.
 *   No PHP, CSS, or DB schema changes. version.php → 2026043000267.
 *
 * v12.66: FIX-CC-TTS-CACHE + FIX-CC-ML-LANG-CAPTURE (see $plugin->release comment).
 *
 * v12.63: FIX-CC-MULTILANG-GATE + FIX-CC-MULTILANG-LANG + FIX-CC-MULTILANG-STUDENT-PLAY
 *   — Three additional-language player fixes shipped together.
 *   (1) FIX-CC-MULTILANG-GATE: allVoiceoversComplete() now treats 'pregenerated'
 *   sentinel as complete, so setActiveLang → preloadVoiceovers → checkComplete() no
 *   longer sets manifest.voiceoversComplete=false when switching to an additional
 *   language. The global gate in playVoiceover (line 12933) blocked ALL Listen clicks
 *   for the entire session once voiceoversComplete was flipped to false.
 *   (2) FIX-CC-MULTILANG-LANG: preloadVoiceovers() preloadOne() and playVoiceover()
 *   on-demand path both now send `language = activeLang || voiceLanguage` instead of
 *   always sending the primary voiceLanguage. Previously, additional-language sections
 *   (e.g. Vietnamese) had TTS synthesised in the primary language voice (e.g. en-AU),
 *   producing English audio for non-English text. PHP caches by sectionid so the wrong
 *   voice would replay forever until the section was regenerated.
 *   (3) FIX-CC-MULTILANG-STUDENT-PLAY: playVoiceover() now tracks _wasPregenerated
 *   (section.voiceoverUrl === 'pregenerated') and uses it to bypass the student billing
 *   guard. A pregenerated sentinel guarantees the teacher already produced audio in the
 *   PHP file store — calling generate_voice returns the cached URL at zero credit cost.
 *   Without this, students clicking Listen on an additional-language slide hit the
 *   billing guard, which permanently disabled the button. AMD: player5.js only.
 *   No PHP or DB changes. version.php → 2026043000263.
 *
 * v12.62: FIX-CC-MULTILANG-WAIT-STUCK — isVoiceoverGenerationPending() now treats
 *   the 'pregenerated' sentinel as "audio available". For students, preloadVoiceovers()
 *   intentionally skips sentinel sections (on-demand fetch on Play click), so
 *   voiceoverCache is never populated for additional-language sections. Without this
 *   guard, switching to a non-primary language and then navigating back from a slide
 *   caused render() → isVoiceoverGenerationPending() to return true (no HTTPS URL,
 *   no cache) and render the "Preparing audio…" waiting screen indefinitely — preload
 *   never resolves it because it skips sentinel sections for students. Fix: added
 *   hasPregenerated = (s.voiceoverUrl === 'pregenerated') check; sentinel sections
 *   are treated as "not pending" so the topics grid is rendered instead.
 *   AMD: player5.js only. No PHP or DB changes. version.php → 2026043000262.
 *
 * v12.55: MULTILANGUAGE STUDENT LANGUAGE SWITCHER — Teachers can now generate full
 *   slide content and pre-generated voiceovers for additional student languages (Arabic,
 *   Dutch, French, Vietnamese, etc.) during content creation. Builder UI: checkbox list
 *   in Voice Settings; each selected language generates a full translated manifest via
 *   ManifestBuilder.build() and pre-generates voiceovers via generate_voice. Manifest
 *   stored under generatedManifest.multiLanguage[]. Player: language switcher pill bar
 *   rendered in renderTopicsGrid() when multiLanguage entries exist; clicking a pill
 *   calls setActiveLang(code) which swaps manifest.topics to the selected language's
 *   topics, stashes primaryTopics for restore, sets this.activeLang, re-renders topics
 *   grid, and triggers preloadVoiceovers() for the new language's sections. Credit
 *   estimate in builder header updates as additional languages are selected.
 *   AMD: player5.js, builder.js. No PHP or DB schema changes. version.php → 2026043000255.
 *
 * v12.49: BUG-CC-ZOMBIE-CHAIN — Clicking "Reset & retry audio" spun forever
 *   ("Regenerating 1 section…") and never completed. Root cause: a chain generation
 *   race. The auto-preload fires on page load → PHP returns 500 fast (CDN concurrent
 *   request rejection) → Promise microtask queues .catch(). User clicks Retry →
 *   button resets _preloadRetryCount → calls preloadVoiceovers() (new chain).
 *   Microseconds later the old chain's .catch() fires, sees _preRetry=0, and
 *   schedules a retry in 2s with _preloadScheduledRetry=true (v12.48 bypass flag).
 *   That 2s retry fires concurrently with the new chain's 10s POST-PRELOAD SWEEP →
 *   two concurrent PHP TTS curls for the same section → CDN HTTP 500 on both →
 *   infinite failure loop.
 *   Fix: Chain generation counter. Each preloadVoiceovers() call increments
 *   self._voiceoverChainGen and captures var _myChainGen. Every retry path
 *   (setTimeout callbacks, .catch() before scheduling a retry, preloadOne() at
 *   entry) checks _voiceoverChainGen !== _myChainGen — if stale, the zombie chain
 *   exits immediately, clears voiceoverLoading[section.id], and returns. The new
 *   chain's POST-PRELOAD SWEEP then picks up the section cleanly. Also adds a 30s
 *   follow-up sweep for the edge case where a slow in-flight PHP fetch (≤200s) was
 *   still blocking when the primary 10s sweep fired. AMD-only: player5.js.
 *   CC_VERSION 12.48 → 12.49. version.php → 2026041500249.
 *
 * v12.48: BUG-CC-TTS-CONCURRENT — Voiceover failed to play after clicking "Regenerate
 *   voiceover" in behavioral settings. Two root causes:
 *   (1) RETRY DELAY WINDOW: preloadOne().catch() deleted voiceoverLoading[section.id]
 *       before the retry delay (2/4/6s). During that window voiceoverLoading was false,
 *       so generateSlideVoiceoverBulk() fired a second concurrent PHP curl for the same
 *       section while the first was still alive (CURLOPT_TIMEOUT=180s). CDN saw two
 *       concurrent long-running requests → HTTP 500 on both. Fix: voiceoverLoading stays
 *       true during retry delays; _preloadScheduledRetry flag lets the scheduled retry
 *       bypass the guard when it fires. generateSlideVoiceoverBulk() also checks/sets
 *       voiceoverLoading to block concurrent firing.
 *   (2) NO PHP MUTEX: Even across page reloads, a stale PHP process from a previous
 *       attempt could hold the CDN connection open. New PHP file lock per sectionid
 *       (LOCK_EX|LOCK_NB) returns {pending:true} instead of making a concurrent TTS
 *       call. JS preloadOne() treats pending as a temporary hold (not a failure) and
 *       retries in 10s without consuming retry budget. Lock released via shutdown function.
 *   JS changes: player5.js (preloadOne guard, .catch, .then pending handler,
 *   generateSlideVoiceoverBulk). PHP changes: ajax.php generate_voice mutex.
 *   CC_VERSION 12.47 → 12.48. version.php → 2026041500248.
 *
 * v12.47: BUG-CC-RETRY-CONCURRENT — "Reset & retry audio" failed with "API error: 500"
 *   on every retry attempt. Root cause: aborting the browser fetch does NOT stop the
 *   PHP-FPM process — PHP remains blocked on curl_exec waiting for the TTS backend
 *   (CURLOPT_TIMEOUT=180s). Immediately restarting preloadVoiceovers() launched a new
 *   PHP process making a concurrent TTS curl to the same endpoint while the old one was
 *   still open. The deployment CDN rejected the second concurrent long-running request
 *   with HTTP 500, so all 3 retries failed instantly even though the backend itself
 *   returned 200. Fix: retry handler no longer aborts in-flight fetches — it only resets
 *   the retry counter (fresh 3-retry budget for the old chain). preloadVoiceovers() skips
 *   sections still in-flight (voiceoverLoading set), preventing concurrent TTS requests.
 *   CC_VERSION 12.47 → 12.48. AMD-only (player5.js + cc-state.js). version.php → 2026041500248.
 *
 * v12.43: BUG-CC-TIMEOUT-RACE — Two root-cause bugs fixed for "Reset & retry audio" failure:
 *   (1) CLIENT TIMEOUT TOO SHORT: Server logs confirmed 4-chunk en-AU-Chirp3-HD-Aoede
 *       voiceovers take 143-153s (POST /api/moodle/content-creator/tts 200 in 150429ms).
 *       The client's AbortController fired at 120s, killing the connection before the
 *       server could deliver the response. Every attempt appeared as a timeout even though
 *       the server succeeded. Fix: preload + on-demand AbortController raised 120s → 200s.
 *       Wait-poll raised 150s → 230s (always 30s beyond the abort to avoid final-chunk race).
 *   (2) RACE-CONDITION: In the preloadOne().catch() handler, delete voiceoverLoading[id]
 *       ran unconditionally BEFORE the _preloadAbortedByUser check. The retry handler calls
 *       preloadVoiceovers() synchronously, which sets voiceoverLoading=true for the new chain.
 *       The old chain's .catch() microtask fires after, deleting that lock. The POST-PRELOAD
 *       SWEEP then sees loading=false and launches a duplicate concurrent fetch — two competing
 *       requests for the same section causing 429 rate-limit cascades. Fix: moved
 *       delete voiceoverLoading[id] to after the user-abort exit path so the new chain
 *       retains ownership of its loading lock. AMD-only: player5.js + cc-state.js.
 *       CC_VERSION 12.42 → 12.43. No CSS, PHP, or DB changes. version.php → 2026041500243.
 *
 * v12.41: BUG-CC-SOFT-FAIL — Audio generation API sometimes responds with success=false
 *   or missing audioContent (e.g. rate limit, quota, transient server error). Previously
 *   this fell through silently: voiceoverPreloadStatus.loaded++ was called with no cache
 *   set and no status update — the section stayed 'pending', refreshTopicCardVoiceoverState
 *   was never called, and the waiting screen was stuck at N-1/N forever. The 'Reset & retry
 *   audio' button re-triggered the same soft failure and appeared to do nothing. Fix: add
 *   else-throw after if(data.success && data.audioContent) so .catch routes soft failures
 *   through the standard 3-retry mechanism. After exhausting retries, voiceoverStatus='failed'
 *   and refreshTopicCardVoiceoverState transitions the screen. Also added visual feedback:
 *   title changes to 'Retrying audio' and subtitle updates when retry button is clicked,
 *   with double-click guard. CC_VERSION bumped 12.38→12.41. No CSS, PHP, or DB changes.
 *   version.php → 2026041500241.
 *
 * v12.40: VERSION-BUMP — Forced version increment to ensure Moodle detects upgrade over any cached v12.39 install. No code changes beyond v12.39. version.php → 2026041500240.
 *
 * v12.39: BUILD-SYNC — AMD build files (player5.js, player5.min.js, cc-state.js,
 *   cc-state.min.js) were not updated when v12.36→v12.38 source fixes were applied.
 *   Moodle runs amd/build/ files, not amd/src/, so all fixes since v12.36 were
 *   silently ignored in the installed plugin. This release re-syncs all four build
 *   files with their sources and bumps CC_VERSION '12.36' → '12.38' in cc-state.js
 *   so console logs correctly identify the running version. No new functional changes
 *   beyond v12.38. No CSS, PHP, or DB changes. version.php → 2026041500239.
 *
 * v12.38: BUG-CC-RETRY-NARROW — "Reset & retry audio" button did nothing when the
 *   failing section was mid-retry (attempt 1 or 2 of 3, not yet 'failed'). Three bugs:
 *   (1) Condition too narrow: handler only cleared s.voiceoverStatus==='failed'; sections
 *       still in the retry loop had voiceoverStatus=undefined and were skipped.
 *   (2) _preloadRetryCount not cleared: mid-retry sections kept their counter (e.g. 2),
 *       so the fresh preload only got 1 attempt before being marked failed again.
 *   (3) voiceoverLoading not cleared: if the 120s fetch was still in-flight, the new
 *       preloadVoiceovers() saw voiceoverLoading[id]=true and skipped the section entirely.
 *   Fix: retry handler now clears ALL sections lacking complete audio (failed, mid-retry,
 *   or stuck), deleting voiceoverStatus, voiceoverUrl, _preloadRetryCount, and
 *   voiceoverLoading[id] so the fresh preload starts with a full 3-retry budget and
 *   no locks. AMD-only (player5.js). No CSS, PHP, or DB changes.
 *   version.php → 2026041500238.
 *
 * v12.37: UX-CC-BYPASS-HOVER — "Continue without audio" hover style fix.
 *   On hover the button now shows white text on the primary colour background
 *   (matching the retry button style) instead of darkening plain text over a
 *   transparent background, which was hard to read. CSS-only change (player5.css).
 *   No AMD, PHP, or DB changes. version.php → 2026041500237.
 *
 * v12.36: VOICEOVER WAITING SCREEN BUG FIXES + BYPASS BUTTONS —
 *   (1) BUG-CC-WAIT-STUCK-FAILED-GATE: isVoiceoverGenerationPending() did not skip
 *       sections with voiceoverStatus='failed', so a permanently-failed slide locked
 *       the gate indefinitely and students saw "Preparing audio... 5/6 slides" forever.
 *       Fixed by adding voiceoverStatus==='failed' guard in isVoiceoverGenerationPending()
 *       and getVoiceoverProgress() (failed sections count as ready so bar reaches 100%).
 *   (2) BUG-CC-WAIT-STUCK-NO-REFRESH: After exhausting 3 preload retries the catch handler
 *       set voiceoverStatus='failed' but never called refreshTopicCardVoiceoverState(),
 *       so the waiting screen was never told to re-evaluate and stayed at N-1/N slides.
 *       Fixed by calling refreshTopicCardVoiceoverState(section.id) after exhausted retries.
 *   (3) UX-CC-WAIT-BYPASS-BUTTON: No escape hatch when audio generation stalled.
 *       Added "Continue without audio" link (always visible) that bypasses the wait and
 *       transitions to the topics page. Teachers/canEdit also get a "Reset & retry audio"
 *       button that clears failed status on all failed sections and re-queues them via
 *       preloadVoiceovers() without a page reload. CSS in player5.css.
 *   AMD: player5.js, cc-state.js (CC_VERSION 12.32→12.36). No DB changes.
 *   version.php → 2026041500236.
 *
 * v12.34: IMAGE QUALITY UPGRADE (IMG-QUALITY-UPGRADE) —
 *   Three improvements to all AI-generated images in the Content Creator:
 *   (1) Quiz image Gemini prompt-writer: strengthened rule 7 to prohibit
 *   duplicate/cloned faces (at most 1–2 distinct people, never the same
 *   person twice); replaced the weak "no text overlays" rule with a hard
 *   CRITICAL NO-TEXT rule (zero letters, numbers, labels, or signs — omit
 *   diagram labels entirely). Added rule 10: no blurry or low-resolution
 *   elements. (2) Slide image prompt (both VET/Workplace and University
 *   routes): added a shared CRITICAL block after the existing TEXT-FREE
 *   block — every person must be visually distinct, no cloned faces, limit
 *   1–4 realistic people, no mirrored/repeated figures. (3) Image pipeline:
 *   OpenAI gpt-image-1 fallback quality raised 'medium'→'high'; shared
 *   optimizeImageBuffer pipeline raised max-width 1200→1536 and JPEG
 *   quality 85→92 for sharper output. Server-side only (routes.ts). No AMD,
 *   PHP, or DB schema changes. version.php → 2026040700234.
 *
 * v12.33: DECISION-POINT ANSWER SHUFFLE (FIX-DP-SHUFFLE) —
 *   The correct answer in the multiple-choice decision-point activity (Activity 1)
 *   was always rendered as Option B because the AI consistently assigns correct:true
 *   to the second option in the JSON it generates. Fix: cc-card-slots.js now shuffles
 *   the options array with a Fisher-Yates shuffle before rendering — in both
 *   renderDecisionPoint (standalone scenario view) and renderDecisionChallenge
 *   (3-activity challenge panel). The shuffle operates on a shallow copy so the
 *   original manifest data is never mutated. The data-correct attribute on each
 *   rendered option is still derived from opt.correct, so the correct answer is
 *   always honoured regardless of which letter it lands on. AMD: cc-card-slots.js
 *   triple-matched (src/build/min). No PHP or DB schema changes.
 *   version.php → 2026040700233.
 *
 * v12.32: VOICEOVER VET/WORKPLACE/UNIVERSITY TRUNCATION FIX (BUG-VO-VET-TRUNCATION) —
 *   Voiceover still stopped mid-narration on Vocational, Workplace, and University
 *   routes after the v12.31 PD fix. Root cause (two-part):
 *   (1) v12.31 raised the PHP char limit from 8000 → 12000 (for PD) but did NOT bump
 *   VOICEOVER_SCHEMA_VERSION. Any VET/Workplace/University voiceover stored at schema
 *   '12.30' under the old 8000-char limit passed the staleness check unchanged
 *   (preStoredSchema === VOICEOVER_SCHEMA_VERSION = '12.30'), so the truncated audio
 *   was never regenerated.
 *   (2) 12000 chars was still too low for older VET/Workplace/University content: old
 *   manifests produced before padVoiceoverSmart was introduced can have 200–300-word
 *   prose per card in voiceoverText PLUS long structural field extraction (sceneParts
 *   2-sentence texts, conceptInsights 2-3 sentences, mental-model detail 2-3 sentences,
 *   mistakes consequence 15+ words × 5, goodItems/badItems 10+ words × 10). Combined
 *   narration text regularly reaches 13000–16000 chars for these older sections.
 *   Fix 1 (ajax.php): char limit raised from 12000 → 20000. At 20000 chars = 4–5 TTS
 *   chunks (4800 bytes each) ≈ 60–75s synthesis, well inside the 120s AbortController.
 *   Fix 2 (cc-state.js): VOICEOVER_SCHEMA_VERSION bumped '12.30' → '12.32'. All stored
 *   voiceovers across ALL routes (Vocational, Workplace, University, PD) are detected as
 *   stale and automatically regenerated at the new 20000-char limit when a teacher opens
 *   any activity in edit mode. Students receive corrected full-length audio immediately
 *   after the teacher's first open saves back the new voiceoverUrl.
 *   AMD changes: cc-state.js only — triple-matched (src/build/min), MD5 7c7eff2aeea24ac17b7f73d0011d62a7.
 *   No DB or PHP schema changes. version.php → 2026040600232.
 *
 * v12.31: VOICEOVER PD TRUNCATION FIX (BUG-VO-PD-TRUNCATION) —
 *   Voiceover stopped at card 4 or 5 in PD (Professional Development) courses only.
 *   Root cause: ajax.php capped voiceover text at 8000 chars. PD courses use long
 *   prose voiceoverText per card (200–300 words, ~1400 chars each). At 7 cards ×
 *   250 words × 5.5 chars/word ≈ 9625 chars — above the limit. The sentence-boundary
 *   trim landed mid-way through card 5 (mistakes) or occasionally card 4 (applied-
 *   scenario), truncating the audio. VET/Workplace routes weren't affected because
 *   they use shorter structural field extraction (sceneParts, conceptInsights, steps)
 *   producing ~5000–7000 chars total.
 *   Fix: ajax.php char limit raised from 8000 → 12000. At 12000 chars = 3 TTS chunks
 *   (4800-byte each) = 45–60s synthesis, well within the JS AbortController (120s).
 *   PHP change only (ajax.php). No AMD, DB, or PHP schema changes.
 *   version.php → 2026040400231.
 *
 * v12.30: VOICEOVER COMPETENCY-SUMMARY HEADING FIX (BUG-VO-COMPETENCY-HEADING) —
 *   Two voiceover sub-heading bugs on the competency-summary card:
 *   (1) "What Good Looks Like" heading not voiced: early-return in cc-state.js consumed
 *   AI-generated voiceoverText (which omits sub-headings) instead of the structured
 *   goodItems/badItems path. Fix: early-return now skipped for competency-summary when
 *   goodItems or badItems are populated — structured branch always voices "What good
 *   looks like." / "What to avoid." sub-headings.
 *   (2) "Watch out for" voiced instead of "What to Avoid": same root cause. AI-generated
 *   voiceoverText used the phrase "Watch out for" as a transition; early-return fix
 *   ensures canonical heading text is always used.
 *   (3) player5.js patchMissingCardVoiceoverTexts: inserts correct sub-headings into
 *   card.voiceoverText so all downstream readers (hash checks, edit modal) are consistent.
 *   (4) VOICEOVER_SCHEMA_VERSION bumped '12.29'→'12.30': forces re-generation of all
 *   stored voiceovers with wrong headings when teacher opens any activity.
 *   (5) generator.js CC_VERSION corrected '12.28'→'12.30'.
 *   AMD files changed: cc-state.js, player5.js, generator.js (all triple-matched).
 *   No PHP or DB schema changes. version.php → 2026040200230.
 *
 * v12.29: VOICEOVER TRUNCATION FIX (BUG-VO-TRUNCATION) — Voiceover stopped halfway
 *   through card 4 (applied-scenario) in all routes (vocational, workplace, PD).
 *   Root cause: ajax.php capped voiceover text at 4000 chars before sending to the
 *   TTS API. Real 7-card VET sections routinely produce 5000–7000 chars of narration
 *   text (100–200 words per card × 5 chars + structural field extraction for sceneParts,
 *   conceptInsights, steps, items). The sentence-boundary trim landed mid-way through
 *   card 4, generating truncated audio that played correctly up to card 4 then cut off.
 *   Fix 1 (ajax.php): Raised char limit from 4000 to 8000. The SaaS TTS endpoint already
 *   handles chunking (4800-byte chunks, WAV concat, OGG encode) and the JS AbortController
 *   is 120s — 8000 chars (~2 TTS chunks) completes in 30–45s, well inside the timeout.
 *   Fix 2 (cc-state.js): Bumped VOICEOVER_SCHEMA_VERSION from '11.37' to '12.29'. Any
 *   stored voiceover stamped with an older schema version is detected as stale and
 *   regenerated when a teacher opens the activity in edit mode. Students receive corrected
 *   full-length audio as soon as the teacher's first open saves back the new voiceoverUrl.
 *   Files: ajax.php, amd/src/cc-state.js, amd/build/cc-state.js, amd/build/cc-state.min.js.
 *   PHP change only (no DB schema change). version.php → 2026040200229.
 *
 * v12.22: VOICEOVER COMPETENCY-SUMMARY FALLBACK FIX (BUG-VO-COMPETENCY-FALLBACK) +
 *   DECISION-POINT WORD-FLOOR EXCLUSION (BUG-VO-DP-WORDFLOOR) — Two critical voiceover
 *   bugs fixed:
 *   (1) BUG-VO-COMPETENCY-FALLBACK (cc-state.js): In buildVoiceoverText, the competency-
 *   summary branch unconditionally pushed "Now, complete the activity below." before the
 *   outer _7parts.length <= 1 fallback check. This made _7parts.length = 2, bypassing
 *   card.voiceoverText for sections where goodItems and badItems are both absent (common
 *   in PD/non-VET courses built from the ChatGPT template). Card 6 produced only the
 *   heading + CTA (~3s audio) instead of full narration, making voiceover appear to stop
 *   at card 4-5. Fix: check _7parts.length <= 1 && card.voiceoverText BEFORE the CTA
 *   push, inside the competency-summary branch.
 *   (2) BUG-VO-DP-WORDFLOOR (routes.ts/server): ccCheckWordFloors incorrectly applied
 *   the 60-word voiceoverText minimum to decision-point cards, which intentionally have
 *   empty voiceoverText (buildVoiceoverText explicitly clears _7parts for them). This
 *   triggered spurious repair passes visible as 0w→38w→0w→54w oscillation in logs.
 *   Fix: exclude card.cardType === 'decision-point' from the 60-word check.
 *   (3) player5.js patchMissingCardVoiceoverTexts: removed the mirrored CTA push for
 *   competency-summary (was included to mirror the old unconditional cc-state.js CTA).
 *   Now cc-state.js handles the CTA exclusively to prevent double "Now, complete..." when
 *   the new voiceoverText fallback path uses patched content.
 *   Files: amd/src/cc-state.js, amd/build/cc-state.js, amd/build/cc-state.min.js,
 *          amd/src/player5.js, amd/build/player5.js, amd/build/player5.min.js.
 *   cc-state.js AMD triple-match MD5: e472b3e3b74f3eeadc1e43417e3ca584.
 *   player5.js AMD triple-match MD5: 4595ef7323dd7e055576c7abb858e89c.
 *   No PHP or DB changes. version.php → 2026033102200.
 *
 * v12.07: EDIT MODAL ICON PRE-POPULATION FIX — icon pickers in the Edit Slide modal
 *   previously showed an empty field for any scenario/mistake part that had no
 *   explicitly stored icon (i.e. item.icon === ''). The rendered card showed the
 *   pool-default icon (step 1 of resolveScenePartIcon) while the modal showed nothing,
 *   creating a visible mismatch that made teachers think their icon saves were being
 *   silently discarded. Fix: all four renderIconPickerInput call-sites in the modal now
 *   compute the resolved display icon first — calling resolveScenePartIcon('', title,
 *   text, idx, cardType, new Set()) as a fallback — and pass the result as currentVal.
 *   Four locations patched: (1) mistakes single-section path, (2) mistakes multi-card
 *   accordion path, (3) hook/applied-scenario single-section sceneParts path,
 *   (4) hook/applied-scenario multi-card accordion sceneParts path. Side-effect: when
 *   a teacher saves without changing an icon the resolved default is now written
 *   explicitly into item.icon / part.icon, so step 0 (honour stored icon) honours it
 *   on every subsequent render and the pool-default logic never fires again for that
 *   item. player5.js only. AMD triple-match MD5: b9f0897bf75e35fd6d03e5ecb8a01470.
 *   No PHP or DB changes. version.php → 2026033002007.
 *
 * v12.06: SCENARIO CARD ICON — STRICT POSITIONAL DEFAULT — removed semantic content
 *   analysis from the fallback path for cards with a defined icon pool. Previously,
 *   resolveScenePartIcon() ran a regex-based semantic scan (step 1) before checking
 *   the card-type pool (step 2), so keyword matches on part titles/text ("setting",
 *   "job", "challenge", etc.) would override the pool, producing inconsistent icons
 *   on different modules even though the pool had been carefully chosen. New behaviour:
 *   after step 0 (honour stored icon), step 1 now does a strict positional lookup —
 *   part 0 always gets pool[0], part 1 always gets pool[1], etc. — with no content
 *   analysis. hook-scenario always shows: map-pin / users / message-circle / flame.
 *   applied-scenario always shows: briefcase / target / brain / check-circle.
 *   Semantic analysis is kept as step 2 for card types with no defined pool.
 *   cc-icons.js only. AMD triple-match MD5: 4e4779c29175a5f8715a0cf90a9f50ed.
 *   No PHP or DB changes. version.php → 2026033002006.
 *
 * v12.05: SCENARIO CARD DEFAULT ICON FIX — the fallback icon pool for hook-scenario
 *   and applied-scenario parts was nonsensical. hook-scenario used zap (lightning) for
 *   "What Happened" and alert-triangle (danger warning) for "The Pressure"; applied-
 *   scenario used map-pin (location) for "Back on the Job", users (people) for "The New
 *   Challenge", wrench (tools) for "The Decision Moment", and alert-triangle for "The
 *   Right Move". Replaced with semantically appropriate defaults: hook-scenario parts
 *   now use map-pin / users / message-circle / flame (location → people → event trigger
 *   → urgency/pressure); applied-scenario parts now use briefcase / target / brain /
 *   check-circle (workplace → goal/challenge → thinking it through → correct action).
 *   These defaults only fire when a part has no stored icon (e.g. AI-generated content
 *   or newly created sections). Teacher-set icons (step 0 since v12.04) are always
 *   honoured first. cc-icons.js only. AMD triple-match MD5:
 *   42285302c80ad3be326a085b85d4ff22. No PHP or DB changes. version.php → 2026033002005.
 *
 * v12.04: SCENE-PART ICON HONOUR FIX — teacher-set icons on hook-scenario (card 1)
 *   and applied-scenario (card 4) were visually ignored on every render even though
 *   v12.03 correctly saves them to the DB. Root cause: resolveScenePartIcon() in
 *   cc-icons.js evaluated the stored part.icon only at step 3, after (1) a strong
 *   semantic/contextual match on the part title + text and (2) a card-type icon pool
 *   scan. Step 1 almost always succeeds, so the teacher's chosen icon was thrown away
 *   every time. Fix: added step 0 — if aiIcon (the stored/teacher-selected icon name)
 *   is a valid Lucide icon, it is returned immediately before any semantic analysis or
 *   pool cycling. Steps 1-5 still run as fallbacks when no icon is stored (AI-generated
 *   content or legacy sections). cc-icons.js only. AMD triple-match MD5:
 *   1bd0a0690e26c44e7db6ceb9dd82c14d. No PHP or DB changes. version.php → 2026033002004.
 *
 * v12.03: SCENARIO CARDS ICON SAVE FIX — hook-scenario (card 1) and applied-
 *   scenario (card 4) were not saving icon changes made in the Edit Slide modal.
 *   Root cause: the single-section edit modal render always showed the legacy
 *   flat beats editor (splitting section.content into sentences) regardless of
 *   whether the section had a structured sceneParts[] array with icons. Because
 *   the icon-picker rows were never rendered, the icons could not be changed.
 *   The save path only read flat cc5-edit-beat-item textareas and wrote to
 *   cardData.content, discarding any sceneParts[] with icons entirely.
 *   Fix: (1) render — if section.sceneParts && section.sceneParts.length, the
 *   modal now shows the structured scene-parts editor with title, text, and
 *   icon picker per part (same as the multi-card path); flat beats editor is
 *   kept as a legacy fallback for sections without sceneParts[]. (2) save —
 *   single-section save now checks for cc5-edit-scene-part-item rows first;
 *   if found, collects {icon, title, text} into cardData.sceneParts; otherwise
 *   falls back to the flat beats join into cardData.content. player5.js only.
 *   AMD triple-match MD5: bc9c72dbb99b0e05234ee711152ee5f4. No PHP or DB changes.
 *   version.php → 2026033002003.
 *
 * v12.02: MISTAKES CARD ICON PICKER — The Edit Slide modal for the mistakes
 *   card (card 5 "Watch Out For") now includes a full icon picker on each
 *   mistake item row (text input + Browse button), matching the existing
 *   behaviour of hook-scenario, applied-scenario, and mental-model cards.
 *   Previously the icon was silently carried over from the original manifest
 *   data via _origIcon/_oIcon fallback and could never be changed by the
 *   teacher. Changes: player5.js — renderIconPickerInput added to (a) the
 *   single-section mistakes edit block, (b) the multi-card mistakes edit
 *   block, and (c) the dynamic "Add Mistake" row; saveSlideEdit now reads
 *   .cc5-edit-mistake-icon value directly instead of the _origIcon fallback
 *   in both the single-section and multi-card save paths. AMD triple-match
 *   MD5: e5e3e0685590acabf773aa8b1ce6aabc. No PHP or DB changes.
 *   version.php → 2026033002002.
 *
 * v12.01: SAVEPOINT ORDER HOTFIX — v12.00 shipped with the new savepoint block
 *   (2026033002000) placed before the v11.99 block (2026033001990) in
 *   db/upgrade.php. Moodle processes savepoint blocks top-to-bottom and treats
 *   any block whose numeric is lower than the already-recorded DB version as a
 *   downgrade, throwing "cannotdowngrade". Fix: blocks reordered to strict
 *   ascending sequence: ...1980 → 1990 → 2000 → 2026033002001. No JS, CSS, or
 *   DB schema changes. version.php → 2026033002001.
 *
 * v12.00: ARROW DOT-POINTS (CARD 2 ONLY) — Concept-explainer (card 2) uses a
 *   long paragraph text editor in Edit Slide so icons in its insight circles
 *   are not individually choosable. These are now changed from auto-assigned
 *   contextual icons to a consistent chevron-right arrow for clarity. Applies
 *   to concept-explainer conceptInsights and fallback insight chips only. All
 *   other card types (hook-scenario, applied-scenario, mistakes, requirement
 *   circles) retain their auto-assigned / teacher-selected icons as those
 *   cards have the icon picker available in the Edit Slide modal. CSS: chevron
 *   in concept-explainer insights gets springy translateX(4px) hover animation
 *   (cubic-bezier 0.34, 1.56, 0.64, 1 — overshoot bounce) and stroke-width
 *   2.5 for crispness. Changes: cc-card-slots.js (2 icon sites), player5.css
 *   (animation rules for .cc5-ci-icon svg and .cc5-insight-icon svg). AMD
 *   sync: cc-card-slots.js triple-match MD5 c9fbd22a703d6072d94759b0e4be9336.
 *   No PHP or DB schema changes. CC_VERSION unchanged. version.php → 2026033002000.
 *
 * v11.99: AMD TRIPLE-MATCH SYNC — v11.98 shipped with amd/src/player5.js and
 *   amd/build/ out of sync. The v11.98 icon-save bug fixes (all three JS changes)
 *   were applied exclusively to amd/src/player5.js but amd/build/player5.js and
 *   amd/build/player5.min.js were never updated from the prior v11.97 build. Moodle's
 *   AMD loader serves the build/ files in production; the src/ fix was therefore dead
 *   code in any deployed instance. Fix: copied amd/src/player5.js verbatim to both
 *   amd/build/player5.js and amd/build/player5.min.js. All three files now share MD5
 *   b2d40b94c2e850cdaed2b6f3f60b8722. No PHP, CSS, or DB schema changes.
 *   CC_VERSION → 11.99. version.php → 2026033001990.
 *
 * v11.98: ICON SAVE BUG FIX — Three bugs where icon changes made in the Edit Slide modal
 *   were silently discarded on save:
 *   (1) Single-section mental-model: the step editor did not render the icon picker at all
 *       for section.steps[] items — icons were invisible in the UI and stripped from the
 *       manifest on every save because saveSlideEdit never read a step icon. Fix: added
 *       renderIconPickerInput('cc5-edit-mm-step-icon') to the single-section mental-model
 *       step row (matching the multi-card path) and added stepIcon read in the save loop.
 *   (2) Multi-card mistakes card: _origMItems was set to (_cu.items || []) where _cu is a
 *       freshly-created object with no .items key — so _origMItems was always [] and every
 *       mistake icon was silently overwritten with ''. Fix: read from section.cards[_ci].items
 *       (the original in-memory card data) so existing icons are preserved.
 *   (3) Single-section mental-model local manifest: cardData.steps now includes the icon
 *       field in every step object so the in-memory manifest update (sec.steps = cardData.steps)
 *       correctly carries the new icon through to self.render() without requiring a page reload.
 *   player5.js only. No PHP or DB schema changes.
 *   CC_VERSION → 11.98. version.php → 2026033001980.
 *
 * v11.91: ICON PICKER — Edit Slide modal now shows a visual icon grid instead of plain
 *   text inputs for all icon fields (conceptItems, sceneParts, conceptInsights, mental-model
 *   steps). Each icon field shows a live preview square, keeps the text input for manual
 *   entry, and adds a "Browse" button that opens a searchable modal grid of all ~115 icons
 *   from cc-icons.js ICONS. Icons are shown as SVG + name label. Search filters the grid
 *   in real time. Clicking an icon selects it, closes the picker, and updates the preview.
 *   Changes: player5.js (renderIconPickerInput, buildIconPickerOverlay, 8 input sites,
 *   5 event handlers), styles/player5.css (icon picker styles).
 *   CC_VERSION → 11.91. version.php → 2026033001191. No DB changes.
 *
 * v11.73: QUALITY GATE REPLACEMENT (ChatGPT-approved).
 *   Removes the dual scoring system (scoreQualityGate + scoreAuditDefensibility +
 *   EnterpriseQA) that caused 150s poll timeouts and hard failures by retrying
 *   already-good content. Replaced with fast structural validateCards() check:
 *   verifies card count (VET=7, others=6), each card has cardType+title, decision-point
 *   has question+≥2 options, mental-model has ≥3 steps, voiceover ≥30 chars. Valid
 *   content returns immediately — no scoring overhead. Broken content gets one repair
 *   pass then getFailedCardSequence. Scoring constants removed: INSTRUCTIONAL_MAX,
 *   AUDIT_MAX, COMBINED_MAX, PUBLISH_THRESHOLD, AUDIT_MIN_THRESHOLD, bestCards,
 *   bestScore, bestInstructionalScore, bestAuditScore, lastAuditResult.
 *   CC_VERSION bumped to 11.73 in cc-state.js. AMD triple-match: generator.js (0f9080ee)
 *   + cc-state.js (1428044e). No DB schema changes.
 *   version.php → 2026033001173.
 *
 * v11.72: VOICEOVER GUARD UPGRADE (ChatGPT-approved micro-tweak on v11.71).
 *   CC_VERSION bumped to 11.72 in cc-state.js. version.php → 2026033001172.
 *
 * v11.69: BULLETPROOF FIXES (ChatGPT approved — 3 edge-case hardening fixes).
 *   (1) JSON salvage pass in parseJsonResponse: after all repair attempts fail, extract
 *       the first embedded array or object from prose text before giving up. Prevents
 *       discarding almost-valid AI responses that have explanatory text around the JSON.
 *   (2) lastIssues capped at 5 after EQA injection: previously injecting EQA errors +
 *       warnings could blow out the repair list beyond the 5-issue cap. Now re-sliced
 *       to 5 immediately after injection so repair stays focused.
 *   (3) System prompt cache keyed by mode+country+language (context._promptCache[key])
 *       instead of a flat context._cachedSystemPrompt. Prevents cross-topic prompt
 *       contamination in batch runs where context is reused across topics/modes/countries.
 *   generator.js updated. AMD build/min synced. No DB schema changes.
 *   version.php → 2026033001169.
 *
 * v11.68: PERFORMANCE UPGRADE — "Fast-First + Smart QA" architecture (ChatGPT approved).
 *   (1) MAX_ATTEMPTS reduced 3→2: micro-fix pass removed; generate → targeted repair only.
 *   (2) PUBLISH_THRESHOLD lowered 140→125 and AUDIT_MIN_THRESHOLD lowered 40→30 — prompt
 *       quality is high enough that near-perfect scores are not required for publication.
 *   (3) Single repair path: attempt 2 always uses targeted content repair (no audit-repair
 *       vs hard-reset branching). Top 5 issues only sent to repair prompt for focus.
 *   (4) Story QA gated behind context.deepQualityMode===true (default false) — removes
 *       an extra AI call per topic on every generation, 2-4x speed improvement.
 *   (5) System prompt cached on context._cachedSystemPrompt after first build — legislation,
 *       spelling, and language injection blocks not rebuilt on parse-fail retries.
 *   generator.js updated. AMD build/min synced. No DB schema changes.
 *   version.php → 2026033001168.
 *
 * v11.67: BUG FIX — Content Creator quality gate hard gate enforced.
 *   BEST_EFFORT content below 140/180 combined (or below 40/80 audit) now returns a
 *   failed sequence instead of silently publishing low-quality content. Scores like
 *   77/180 now correctly trigger the auto-redo ("Regenerate Failed") loop.
 *   generator.js updated. AMD build/min synced (MD5 149155b4). No DB schema changes.
 *   version.php → 2026033001167.
 *
 * v11.66: VERSION BUMP — Routine release increment. No code or DB schema changes.
 *   version.php → 2026032701166.
 *
 * v11.65: VERSION BUMP — Reverted video pipeline feature (generate_video / video_status
 *   ajax actions and video_generator AMD module removed). No DB schema changes.
 *   version.php → 2026032701165.
 *
 * v11.63: VERSION BUMP — Clean release increment following master release process.
 *   upgrade.php savepoints backfilled for v11.53–v11.63. CC_VERSION updated to 11.63
 *   in cc-state.js. BUILD_INFO.json updated. No code or DB schema changes.
 *   version.php → 2026032701163.
 *
 * v11.62: BUG FIX (x3): (1) Workplace Training — duplicate button ID resolved: inner "Suggest
 *   Subtopics" card button no longer shares id with the main #cc-wp-suggest-section button;
 *   updateGenerateTopicsButton() now called after successful topic suggestion, select/deselect
 *   all, and checkbox changes so the ChatGPT section and Next button correctly appear.
 *   (2) TGA foundation-skills over-counting — removed generic text-inference fallback that was
 *   adding boilerplate/introductory lines as phantom skills; only lines matching the standard
 *   "SkillName – description" format are now counted. (3) CC v11.62 content creator version
 *   string updated. version.php → 2026032701162.
 *
 * Content Creator v11.61
 *
 * v11.61: FIVE FIXES across image persistence, gallery, and modal positioning —
 *
 *   (1) PERSISTENT IMAGE STORAGE (BUG-CC-IMG-EPHEMERAL) — generated and uploaded
 *   slide images were saved only to the server's local cc-images/ filesystem directory.
 *   In cloud-deployed environments the directory is wiped on each redeployment, making
 *   all stored image URLs immediately return 404. Teachers who paid credits for image
 *   generation lost those images on every server restart. Fix: all three image-writing
 *   routes (generate-slide-image, generate-image, upload-slide-image) now also write
 *   each image to the stored_images PostgreSQL table (base64 data column). The cc-images
 *   serve route now falls back to the DB when the disk file is absent, and re-caches it
 *   to disk for subsequent requests. Images now survive redeployments indefinitely.
 *   Server-side only — no PHP change required.
 *
 *   (2) UPLOAD DATA-URL BUG (BUG-CC-UPLOAD-DATAURL) — the upload-slide-image route
 *   was returning a raw data:image/... URL to the player instead of an HTTPS URL.
 *   Moodle's PHP save_manifest safety net strips all data: URLs >200 chars and replaces
 *   them with the "pregenerated" sentinel, causing the uploaded image to be silently
 *   lost on first manifest save. Fix: upload-slide-image now saves to disk+DB and
 *   returns the same HTTPS cc-images URL as the generate routes, bypassing PHP stripping.
 *   Server-side only — no PHP change required.
 *
 *   (3) GALLERY COUNT DOUBLE-COUNT (BUG-GAL-COUNT-DOUBLE) — the picker gallery-row
 *   button count was computed as imageGallery.length + collectAllManifestImages().length.
 *   collectAllManifestImages() already merges imageGallery[] into its output, so this
 *   double-counted every gallery-only image. Fix: use only collectAllManifestImages().length
 *   (the correct total), matching the fix already applied to the gallery option card count.
 *   CC_VERSION also synced from stale 11.60 to 11.61 (second occurrence of the cc-state.js
 *   version-lag bug catalogued in v11.56).
 *
 *   (4) GALLERY BROKEN THUMBNAILS (BUG-GAL-BROKEN-IMG) — gallery <img> tags had no
 *   onerror handler; when a cc-images file returned 404 (e.g. after server restart before
 *   DB fallback was available) the gallery showed a grid of broken image icons with generic
 *   "Gallery image N" alt text. Fix: onerror on each gallery <img> hides the parent
 *   .cc5-gallery-item so broken slots disappear cleanly. Alt text improved to use the
 *   AI prompt or slide title instead of the generic placeholder.
 *
 *   (5) GALLERY COUNT STALE "..." (BUG-GAL-COUNT-STALE) — when siteGalleryCache was null,
 *   the picker gallery-row button rendered "..." and never updated after the async
 *   fetchSiteGallery() completed; the count remained "..." for the lifetime of the picker.
 *   Fix: fetchSiteGallery success callback now updates any open .cc5-show-gallery-btn
 *   elements with the correct total count after the fetch completes.
 *
 *   MODAL VIEWPORT FIX — All popup overlays (focus/tab-reset, edit slide,
 *   document viewer, PDF viewer, settings, zoom, link dialog, content popup, and
 *   document reference popup) were using `position: absolute` relative to the
 *   player container. On tall slides the vertical centre of the container sits
 *   far below the visible viewport, forcing the user to scroll down to interact
 *   with the modal. Fixed by changing every overlay from `position: absolute` to
 *   `position: fixed` so they always appear centred in the browser viewport
 *   regardless of scroll position. Affected overlays: cc5-focus-modal-overlay,
 *   cc5-edit-modal-overlay, cc5-doc-modal-overlay, cc5-zoom-modal-overlay,
 *   cc5-settings-modal-overlay, cc5-pdf-modal-overlay, cc5-doc-popup-overlay,
 *   cc5-link-dialog-overlay, cc5-content-popup-overlay. The image source,
 *   regenerate, picker, gallery, and community overlays already used
 *   `position: fixed` via cc5-image-modal-overlay and remain unchanged.
 *   player5.css only — no JS changes required.
 *
 * v11.60: TWO BUG FIXES —
 *   (1) APPLY-SELECTED-IMAGE SILENT SAVE FAILURE (BUG-CC-APPLYSAVE) — when a teacher
 *   picked an image from the 3-image picker, applySelectedImage() used a direct
 *   Ajax.call({methodname:'mod_contentcreator_save_manifest'}) with empty .done()
 *   and .fail() callbacks. This bypassed three critical safeguards in saveManifestSilent:
 *   (a) stripAudio() — large audio data: URLs inflated the POST body past PHP's
 *   post_max_size, causing a silent save failure that left the selected image lost
 *   on next page reload; (b) chunked upload — manifests >2 MB need multi-chunk
 *   delivery; the single Ajax.call failed silently; (c) retry with back-off — Moodle
 *   4.4+ service-worker message-channel drops hit the old empty .fail() handler.
 *   Fix: replace the direct Ajax.call with self.saveManifestSilent() — audio is
 *   stripped, chunking is used when needed, retries fire automatically.
 *   (2) OVERFLOW-VISIBLE BROWSER WARNING ON IMG ELEMENTS — Chrome's View Transitions
 *   API logs "Specifying 'overflow: visible' on img, video and canvas tags" when any
 *   <img> element participates in a view transition with the default overflow value.
 *   Fix: add overflow: hidden explicitly to all six img CSS rules in player5.css
 *   (.cc5-slide-image, .cc5-image-picker-item img, .cc5-zoom-modal-content img,
 *   .cc5-gallery-item img, .cc5-community-item img, .cc5-file-upload-preview img).
 *   CC_VERSION → '11.60'. version.php → 2026032600160.
 *
 * v11.59: THREE BUG FIXES —
 *   (1) IMAGE PICKER DATA: URL BUG — generate-slide-image route was returning raw
 *   data:image/jpeg;base64 URLs to the player for the 3-image picker. PHP
 *   save_manifest strips all data: URLs (>200 chars) and replaces them with the
 *   sentinel "pregenerated", causing the manifest to lose the image when the teacher
 *   picks one. Fix: save each of the 3 picker images to disk under cc-images/ and
 *   return HTTPS URLs (same approach as the single-image route fixed in v11.55).
 *   Server-side change only — no PHP change required.
 *   (2) GENERATE-MULTIPLE-IMAGES FALLBACK — generateMultipleImages() only fell back
 *   to OpenAI gpt-image-1 on HTTP 429 (rate limit). Imagen 4 Ultra also silently
 *   returns an empty generatedImages[] on content-policy blocks, throwing "No image
 *   data in Imagen 4 Ultra response" — not caught by the rate-limit-only condition.
 *   Fix: fall back for ALL Imagen 4 failures (parity with single-image fix in v11.58).
 *   Server-side change only — no PHP change required.
 *   (3) BROKEN IMAGE RECOVERY — when a cc-images/ file is unavailable (404, e.g.
 *   after a server restart wipes the directory), the <img> tag showed a broken icon
 *   and rendered the slide title as alt text. Fix: <img onerror> dispatches a custom
 *   bubbling event ('cc5img_error') so the container can degrade gracefully:
 *   teachers see the "Add Image" button to re-generate; students see nothing (container
 *   hidden). The native DOM 'error' event doesn't bubble, so a custom event is used
 *   for reliable jQuery delegation. CC_VERSION → '11.59'. version.php → 2026032600159.
 *
 * v11.58: TWO BUG FIXES —
 *   (1) IMAGE-GENERATION FALLBACK: generateImage() in server/routes.ts only fell
 *   back to OpenAI gpt-image-1 when Imagen 4 Ultra returned HTTP 429 (rate limit).
 *   Imagen 4 Ultra also silently returns an empty generatedImages[] when its content
 *   policy filters a prompt, throwing "No image data in Imagen 4 Ultra response".
 *   This was not caught by the rate-limit-only condition, so the slide was left with
 *   no image. Fix: fall back to OpenAI for ALL Imagen 4 failures, not just 429.
 *   Server-side change only — no PHP change required.
 *   (2) OVERVIEW LIST MARKUP: player5.js rendered section.voiceoverText as
 *   <ul class="cc5-introduction-list"><li> items in the Overview block. User
 *   requested plain-text rendering with no list markup. Fix: replaced <ul>/<li>
 *   with <p class="cc5-introduction-para"> tags. Matching CSS added to player5.css.
 *   Old .cc5-introduction-list/.cc5-introduction-item CSS kept for manifests
 *   generated before v11.58. CC_VERSION → '11.58'. version.php → 2026032500158.
 *
 * v11.57: ZIP-VALIDATION FIX — amd/build/legislation/ directory was empty in the
 *   v11.56 ZIP. The AMD sync script only handled .js files and skipped the
 *   legislation/ JSON data files (australia.json, canada.json, nz.json, uk.json,
 *   us.json) and the legislation/overlays/ subdirectory (8 state-level JSON files).
 *   Moodle's plugin validator rejected the ZIP with "Extracted file not found:
 *   contentcreator/amd/build/legislation/". Fix: all 13 JSON files copied from
 *   src/legislation/ to build/legislation/ (CRC verified). CC_VERSION bumped to
 *   '11.57'. version.php → 2026032500157.
 *
 * v11.56: VERSION BUMP — Maintenance release. CC_VERSION was stale at '11.53' in
 *   both cc-state.js and generator.js (two versions behind version.php at 11.55).
 *   Corrected to '11.56'. All AMD trios hard-synced src = build = min (CRC verified).
 *   No functional changes. version.php → 2026032500156.
 *
 * v11.55: IMAGE-DISPLAY FIX — Root cause of AI images not displaying:
 *   generateImage() returns data:image/jpeg;base64,... URLs. PHP save_manifest
 *   safety net strips ALL data: URLs >200 chars and replaces with "pregenerated".
 *   Player then rendered <img src="pregenerated"> → broken dark strip below header.
 *   Fix 1 (server/routes.ts): After Imagen/OpenAI generates the image, extract
 *   the base64 buffer, write it to a persistent cc-images/ directory, and return
 *   an HTTPS URL (/cc-images/uuid.jpg) instead of the data: URL. A new Express
 *   static route serves these files. Fix 2 (player5.js): All three hasImage
 *   checks now exclude "pregenerated" sentinel and raw data: URLs — legacy
 *   manifests show the Add-Image button instead of a broken img tag.
 *   version.php → 2026032500155.
 *
 * v11.54: TWO FIXES — (1) IMAGE-REGEN BUG: triggerFailedRegeneration() in
 *   builder.js omitted imageSettings and activitySettings from the inputs
 *   object, so any failed-slide re-run always disabled images and activities
 *   regardless of the original user selection. Fixed by reading both from
 *   existingManifest (fallback: imageSettings={enabled:false},
 *   activitySettings={enabled:true}).
 *   (2) CONCEPT-EXPLAINER REDESIGN: "What This Means" card (Card 2) replaced
 *   plain numbered blue circles with colour-cycling icon cards. Both paths are
 *   updated: conceptInsights[] preferred path adds cc5-ci-{blue|green|orange|
 *   purple} variant classes; fallback chips path swaps cc5-insight-num for
 *   cc5-insight-icon with a rotating icon set (lightbulb → check-circle → zap
 *   → shield → star → target → award) and matching colour variants
 *   cc5-chip-{blue|green|orange|purple}. Full light/dark-mode CSS added to
 *   player5.css. version.php → 2026032500154.
 *
 * v11.53: VERSION BUMP — Routine release packaging. CC_VERSION bumped to 11.53
 *   in cc-state.js and generator.js. All AMD build files hard-synced from src
 *   (CRC verified: src = build = min). version.php → 2026032500153.
 *
 * v11.42: BUG-CC-TOKEN-GUARD + BUG-CC-ROUTE-MISSING
 *
 *   BUG-CC-TOKEN-GUARD (server/routes.ts, no plugin update required for server fix):
 *   Even after v11.41 raised maxTokens to 16000, generation failures persisted on
 *   complex VET units. Root cause: gpt-4o's structured-output hard cap is 16,384
 *   tokens. The 54-field schema requires ALL fields per card even when null; gpt-4o
 *   over-fills 10-15 fields per card with verbose text instead of null. Estimated
 *   worst-case: ~150 tokens/field × 12 fields × 7 cards ≈ 12,600 content tokens +
 *   ~2,800 null-field overhead + JSON structure ≈ 16,200+ tokens → truncation at the
 *   16,000 limit → invalid JSON → "AI generation failed - invalid structure after
 *   retry". Fix: inject TOKEN_BUDGET_GUARD string into systemPrompt for PASS 1 and
 *   PASS 1 retry, explicitly instructing gpt-4o to target <14,000 tokens total and
 *   mandating null for all non-applicable fields. Server-side fix — immediate effect
 *   without plugin update.
 *
 *   BUG-CC-ROUTE-MISSING (generator.js + ajax.php — requires v11.42 plugin):
 *   callAI() never forwarded the content route (vet/university/workplace/pd) to
 *   ajax.php, and ajax.php never forwarded it to the server. Server always defaulted
 *   to route='vet' (ccExpectedCardCount=7). For university/workplace routes using
 *   6-card prompts, the server incorrectly expected 7 cards and triggered unnecessary
 *   PASS 2 expansion, potentially adding a corrupt 7th card. Fix: added `route` as
 *   5th parameter to callAI() (default 'vet'); generator.js appends it as FormData;
 *   ajax.php reads via optional_param and forwards in the API payload.
 *
 * v11.41: BUG-CC-GEN-TOKENS — raised maxTokens 12000→16000 in all 6 callOpenAI
 *   calls; added transient-retry patterns for "generation failed"/"invalid structure"/
 *   "empty response" in generator.js. version.php → 2026032401141.
 *   Fix 2 (generator.js): Added "generation failed", "invalid structure", and
 *   "empty response" to both isTransient patterns in callAI(). These errors now
 *   trigger the standard exponential-backoff retry loop (up to MAX_RETRIES=5)
 *   as a defence-in-depth layer for any future partial-failure scenarios.
 *   No DB schema changes.
 *
 * v11.40: BUG-CC-SSLIDE-PERM + BUG-CC-SSLIDE-NOTRY + BUG-CC-SSLIDE-SESSION —
 *   Three bugs in save_slide_edit.php that were missed by the v11.39 partial fix.
 *
 *   BUG-CC-SSLIDE-PERM: save_slide_edit external function used
 *   require_capability('mod/contentcreator:addinstance', $context) — the same
 *   wrong capability that caused "Failed to save generated content" in v11.38 and
 *   earlier. v11.39 fixed save_manifest.php and save_manifest_chunk.php but did
 *   NOT fix save_slide_edit.php. Every teacher edit-slide save (pencil icon →
 *   Save) continued to fail on Moodle sites with custom cloned roles.
 *   Fix: replaced with the two-step flexible check (mod/contentcreator:manage →
 *   moodle/course:manageactivities fallback) matching the pattern in ajax.php,
 *   save_manifest.php, and save_manifest_chunk.php.
 *
 *   BUG-CC-SSLIDE-NOTRY: save_slide_edit.php had no try/catch block. Unlike
 *   save_manifest.php and save_manifest_chunk.php which both wrap their logic in
 *   catch (\Throwable $e), save_slide_edit had zero error handling. PHP 7+ Fatal
 *   Errors (type mismatches, memory errors, etc.) are Error objects — not caught
 *   by catch (Exception $e) — and propagate as opaque HTTP 500 responses with no
 *   meaningful context. Fix: wrapped entire function body in try/catch (\Throwable)
 *   with error_log output matching the pattern of the other save externals.
 *
 *   BUG-CC-SSLIDE-SESSION: save_slide_edit.php never called
 *   \core\session\manager::write_close() before the DB read+write. Holding the
 *   session file lock during manifest JSON decode+encode (potentially hundreds of
 *   KB for large manifests) blocks concurrent requests from the same user session.
 *   Fix: added write_close() call immediately after the capability check and before
 *   the DB get_record call, matching save_manifest.php and save_manifest_chunk.php.
 *
 * v11.39: FIX-SAVE-PERMISSION — Fixed "Failed to save generated content" error
 *   for editing teachers on Moodle sites using custom roles. Root cause: the
 *   save_manifest and save_manifest_chunk external functions used
 *   require_capability('mod/contentcreator:addinstance') which is too strict
 *   and not granted to custom roles cloned from editingteacher. Fix: both
 *   external functions now mirror the flexible two-step check already in ajax.php:
 *   check mod/contentcreator:manage first, fall back to
 *   moodle/course:manageactivities (held by all genuine editing teachers).
 *   Also hardened both catch clauses to \Throwable for PHP 7+ Error types.
 *
 * v11.38: IMAGE-DOWNLOAD — Added download button to generated images (picker modal),
 *   gallery images, and community gallery images. Each image now has a circular
 *   download icon button (top-right). Uses fetch-as-blob for cross-origin CDN images
 *   with fallback to opening in a new tab. player5.js + player5.css updated.
 *
 * v11.31: COMPLETION-FIX — Fixed three critical Moodle completion bugs:
 *   1. Added contentcreator_view() with set_module_viewed() call — "Require
 *      view" completion condition was never firing because view.php never
 *      triggered it.
 *   2. Added contentcreator_get_coursemodule_info() to populate Moodle's
 *      completion cache with custom rules — without this, course completion
 *      aggregation and completion reports may ignore custom rules.
 *   3. Added course_module_viewed event class — standard Moodle log store
 *      now records views.
 *
 * Full changelog: see CHANGELOG.md
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

$plugin->version   = 2026081500;
$plugin->requires  = 2022041900;
$plugin->component = 'mod_contentcreator';
$plugin->maturity  = MATURITY_STABLE;
$plugin->release   = '13.64'; // FIX-CC-13DIGIT-SAVEPOINT-REBASE (v13.64): db/upgrade.php rebased all 193 legacy 13-digit upgrade gates/savepoints to 10-digit (max 2026072801, below $plugin->version). The previous file's 13-digit savepoints (max 2026072800232) re-wrote a 13-digit version into config_plugins during upgrade on rebased 10-digit sites, silently re-stranding them (core's final version write is skipped because installedversion > $plugin->version, and every later upgrade run then aborts with downgrade_exception). No schema, PHP logic, JS or lang changes — upgrade.php numbering only, plus pipeline-ignore marketplace-checker annotations on pre-existing raw-parameter lines (comments only).
// v13.63 was: // FIX-CC-QUIZ-VOICE-ACCENT (v13.62): Knowledge-check / Decision-Challenge feedback narration (Web Speech API in player5.js) now sets utter.lang to the active narration language (activeLang || voiceLanguage, e.g. en-AU) and selects a matching installed voice, so quiz feedback speaks in the CHOSEN accent (e.g. Australian) instead of the browser-default (American) voice. Slides already used the chosen Chirp voice; this brings the check-learning activities in line. AMD: player5.js (build+min). No PHP/CSS/DB changes. // FIX-CC-DP-VOICEOVER-EXEMPT (v13.53): validateCards() was checking voiceoverText on ALL card types including decision-point. The system prompt explicitly says "NO voiceoverText" for decision-point cards, so the AI correctly omits it. But the validator failed it anyway, triggering the repair prompt on attempt 2. The repair AI then tried to add a voiceover AND commonly dropped question/options, causing attempt 2 to fail with all three structural issues (missing question, missing options, missing voiceover). Fix: decision-point cards are now exempt from the voiceover validation check in validateCards(). AMD: generator.js (src+build+min). No PHP, CSS, or DB schema changes. Savepoint 2026071600053. // FIX-CC-CCLOG-PLAYER5 (v13.52): player5.js was missing `const ccLog = _log.log` in its logger setup (only ccWarn and ccError were extracted from CcState.createLogger()). Line 7113 called ccLog() to log the voiceover-complete event — throwing ReferenceError which crashed the voiceover-complete handler, preventing saveManifestSilent() from running. Result: voiceoversComplete=true was set in memory but never persisted to DB, so every page reload re-triggered voiceover regeneration. Fix: added `const ccLog = _log.log;` to player5.js (src+build+min). Moodle 4.5 compatibility verified — no PHP or external function changes required. Savepoint 2026071600052. // FIX-CC-SPLIT-PROMPT-PCS (v13.51): ChatGPT prompt download now includes only the PCs that belong to the selected split part. Previously, downloading the prompt with "Part 1 of 2" selected included all 11 PCs from the full element. Fix: in downloadDynamicPrompt() VET mode, checks if any selected topics have splitPart set; if so, builds a Set of PC codes from those topics' coverageSummary.performanceCriteria and filters el.performanceCriteria to only emit matching PCs. PC display index resets to 1 so the prompt shows "1. ... 2. ..." not "5. ... 6. ...". AMD: builder.js (src+build+min). No PHP, CSS, or DB schema changes. Savepoint 2026062600051. // FIX-CC-SPLIT-PC-DISPLAY (v13.50): Split element cards now show which specific PCs belong to each part. Previously "Elements: - | PCs: 11" appeared identically on both Part 1 and Part 2 cards. Two fixes: (1) coverageText display now shows PC codes (e.g. "PCs: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6") instead of just the count. (2) AI-split path (suggestMajorTopics flatMap) now slices coverageSummary.performanceCriteria at the same split point as the subtopics — Part 1 gets the first half of PC codes, Part 2 gets the second half. AMD: builder.js (src+build+min). No PHP, CSS, or DB schema changes. Savepoint 2026062600050. // FIX-CC-SPLIT-AI-PATH (v13.49): The auto-split badge was dead code in normal use. suggestMajorTopics() (AI path, normal flow) never set splitPart on returned topics — only createDefaultMajorTopics() (error fallback) did. Fix: added flatMap post-processing step immediately after AI topics are normalised in suggestMajorTopics(). For each AI-returned topic, checks the corresponding TGA element PC count; if >MAX_PCS_PER_SECTION(8), splits the topic subtopics in half and emits two topic objects (Part 1 of 2, Part 2 of 2) each with splitPart/splitTotal set. Amber badge now visible in the topic selector cards for any element with 9+ PCs when using the normal AI suggest path. AMD: builder.js (src+build+min). No PHP, CSS, or DB schema changes. Savepoint 2026062500049. // FIX-CC-SPLIT-BADGE-VISIBLE (v13.48): Amber split badge was added to renderTopicItemDOM() (the learning structure DOM view) in v13.46 but was never added to renderMajorTopicSelector() — the HTML-string topic card template that teachers actually see after generating topics. Both paths now render the amber "Part N of 2 — split (8+ PCs)" badge when topic.splitPart is set. AMD: builder.js (src+build+min). No PHP, CSS, or DB schema changes. Savepoint 2026062500048. // FIX-CC-AMD-CCSTATE-NAMED-DEFINE (v13.47): cc-state.js amd/build/ files (build/cc-state.js and build/cc-state.min.js) used anonymous define([],function (){}) instead of named define('mod_contentcreator/cc-state',[],function (){}). Anonymous define in amd/build/ is a combo-loader risk — RequireJS has no name to assign the module in a bundled response and can silently overwrite another module slot (e.g. jquery), collapsing site-wide navigation. Fixed by adding explicit module name as first arg to define() in cc-state.js (src+build+min). No PHP, CSS, or DB schema changes. Savepoint 2026062500047. // AUTO-SPLIT-SECTION (v13.46): Elements with more than 8 performance criteria now automatically split into two content packs (Part 1, Part 2). createDefaultMajorTopics() switched from .map() to .flatMap() with a buildSubtopicsFromPCs() helper; elements with ≤ MAX_PCS_PER_SECTION (8) produce one topic as before; elements with 9+ PCs produce two topics split at ceil(n/2). Each split topic carries splitPart/splitTotal metadata. renderTopicItemDOM() shows an amber badge "Part N of 2 — element split because it has more than 8 performance criteria" so teachers can see why and know to create two separate CC activities. Constant MAX_PCS_PER_SECTION=8 defined at module scope for easy tuning. AMD: builder.js (src+build). No PHP, CSS, or DB schema changes. Savepoint 2026062500046. // FIX-ADMIN-UNLOCK (v13.45): "Must listen" and "Sequential (Lockstep)" restrictions are now student-only. Editors and admins (editMode=true or canEdit=true) bypass both restrictions — canNavigateNext() returns true immediately for editors, and lockstep topic-card locking skips the prevProgress<100 check for editors. Admins in edit mode can now freely click through any slide or topic to review generated content. AMD: player5.js (src+build+min). No PHP, CSS, or DB schema changes. Savepoint 2026062500045. // FIX-CC-AMD-NAMED-DEFINE + FIX-CC-GETPCTEXT (v13.44): Two pre-existing bugs found in audit. (1) builder.js and player5.js amd/build/ files used anonymous define([) instead of named define('mod_contentcreator/builder',[) / define('mod_contentcreator/player5',[). Every other build file in the plugin had a named define; these two were the exception. An anonymous define in amd/build/ is a combo-loader risk — RequireJS has no name to assign the module in a bundled response and can silently overwrite another module slot (e.g. jquery), collapsing site-wide navigation. Fixed by adding the explicit module name as the first arg to define() in builder.js (src+build+min) and player5.js (src+build+min). (2) getPCText() helper in the compliance-mapping table renderer used integer index lookup (parseInt(parts[1])-1) for all PC codes. For AI-written 3-part codes like "5.1.0" (AI misread of "5.10"), parts[1]="1" → pcIdx=0 → returned PC 5.1 instead of 5.10. Fix: added parts.length===3 branch with two-level fallback (same pattern as the main coverage-mapping fix in v13.43): tries findPc(pcCode) then findPc(twoLevelCode) where twoLevelCode = parts[0]+'.'+parts[1]+parts[2]. AMD: builder.js (src+build+min), player5.js (src+build+min). No PHP, CSS, or DB schema changes. Savepoint 2026062400044. // FIX-CC-3LEVEL-PC (v13.43): Fixed PC extraction for TGA units that use 3-level performance criteria codes (e.g. "5.1.0", "5.1.1") such as transport/logistics units. Root cause: XML parser regex only captured 2-level codes ("5.1"), leaving ".0" as stray text; PDF parser dropped 3-level codes entirely; builder.js parseElementsText and coverage-mapping only handled 2-level codes. Fix: (1) tgaLookup.ts parseXmlContent: added pendingPcCode for lone-code lines, updated pcMatch to /^(\d+\.\d+(?:\.\d+)?)\s+(.+)/. (2) tgaLookup.ts extractElementsFromPdfText: same pendingPcCode pattern + updated pcMatch/embeddedPcMatch regexes. (3) builder.js parseElementsText guard/pcMatch updated for 3-level codes; cleanElementName pcBody stripping updated to /^[\d.]+\d\s+/; coverage mapping now handles 3-level codes via find-by-code instead of index lookup. AMD: builder.js (src+build+min). Server: tgaLookup.ts. No PHP, CSS, or DB schema changes. Savepoint 2026062400043. // FIX-CC-REGEN-BUTTON (v13.42): Added "Try Again" button to the generation error banner. When content generation fails (timeout, large content, or any other error), a "Try Again" button now appears in the error banner — clicking it dismisses the error and immediately re-runs generation. Error messages are now human-friendly (length/timeout errors give specific advice). Server: Express body limit for /api/moodle/content-creator/prompt increased from 1MB to 5MB; Zod max for systemPrompt and userPrompt increased from 100k to 500k chars to support large VET units. AMD: builder.js (src+build). No PHP, CSS, or DB schema changes. Savepoint 2026062400042. // FIX-VO-VERBATIM + FIX-KC-VOICE-DELAY + FIX-KC-WEB-VOICEOVER (v13.40): "Regenerate Failed" button was never visible even when AI generation failed for slides. Root cause: generateOneSection() in generator.js always returned generated:true at the section level even when all cards inside failed (from getFailedCardSequence). countFailedSlides() in player5.js and triggerFailedRegeneration() in builder.js only checked section.generated===false — which was never set — so failedCount always returned 0 and the button was never rendered. Fix: (1) generator.js generateOneSection return now sets generated:false when needsCards=true and all returned cards have failed:true; (2) player5.js countFailedSlides() now also counts sections where any card has failed:true (backwards-compatible for existing manifests); (3) builder.js triggerFailedRegeneration() uses the same card-level check. AMD: generator.js, player5.js, builder.js (src+build+min). No PHP or DB schema changes. Savepoint 2026062300040. // DEFAULT-CC-QUIZ-VOICE-ON (v13.39): Quiz feedback narration in the Decision Challenge now defaults ON for all new and existing modules (was default OFF since v13.32). Change: quizVoiceEnabled init and settings-modal read now use !== false instead of === true, so any module that has never explicitly touched the setting gets narration enabled immediately without a teacher needing to open Settings. AMD: player5.js (src+build+min). No PHP, CSS, or DB schema changes. Savepoint 2026062200039. // FIX-CC-QUIZ-VOICE-DELAY (v13.38): Knowledge Check Q2-Q5 feedback narration was delayed several seconds before speaking. Root cause: Chrome Web Speech API leaves residual internal TTS state after a prior utterance finishes naturally. Calling speak() immediately after cancel() in that state triggers a multi-second internal settle delay. Q1 was instant because synth was completely idle on first use. Fix: cancel() clears any queued/active utterance, then speak() is deferred 50 ms via setTimeout() so Chrome fully settles the synth before the new utterance is queued. AMD: player5.js (src+build+min). No PHP, CSS, or DB schema changes. Savepoint 2026062200038. // FIX-CC-BLANK-INIT (v13.36): Single-topic CC with no saved session now auto-navigates to slide view on load — eliminates the blank initial state reported in SCORM contexts where the right frame appeared empty until user clicked a TOC item. AMD: player5.js (src+build+min). // FIX-CC-TITLE-VO (v13.36): Section title removed from TTS voiceover script in buildVoiceoverText(). Title is displayed visually in the slide header; reading it aloud was redundant (reported: male voice reads section title before slide content). AMD: cc-state.js (src+build+min). // FIX-CC-ACTIVITY-BLANK (v13.36): When an activity-type slide has section.activity present but activityType missing or unknown, renderSlideContent() now falls back to renderLegacyActivity() instead of silently rendering a blank slide. AMD: player5.js (src+build+min). Savepoint 2026061800036. // FIX-CC-IMAGE-MODAL-CSS (v13.35): Two CSS fixes for the image selection modal. (1) Upload button cursor: Moodle Boost theme overrides cursor:pointer !important on <button> elements even in external stylesheets; applied inline style="cursor:pointer!important;" directly on the cc5-image-upload-option button element in player5.js (src+build+min) — inline styles win over theme overrides. (2) Generate option hover: .cc5-image-option:hover applied --cc5-primary (blue) border, clashing with the purple gradient icon on .cc5-image-generate-option; added scoped .cc5-image-generate-option:hover rule overriding border-color to --cc5-purple and background to --cc5-purple-light. AMD: player5.js (src+build+min). CSS: player5.css (plugin+public). No PHP or DB schema changes. Savepoint 2026061700035. // FIX-CC-PROGRESSION-TIMED (v13.34): Fix slide transition settings in all 4 modes (VET, Workplace, University, PD). Bug: clicking the Topic Navigation radio cards (lockstep/free) unconditionally ran the timed-options show/hide code, so selecting "Sequential (Lockstep)" hid the Timed Duration selector even when "Timed Reading" progression mode was active. Fix: added radio.name === 'progressionMode' guard so the timed-options div is only toggled by the Progression Mode card group, not the Topic Navigation card group. AMD: builder.js (src+build) only. No PHP, CSS, or DB schema changes. Savepoint 2026061700034. // OPT-CC-CHATGPT (v13.33): ChatGPT made optional in all 4 modes (VET, Workplace, University, PD). Previously the "ChatGPT Content (Required)" section gated the Continue/Generate button on paste content ≥ 50 chars, blocking teachers who wanted to generate directly from topics. Now: (1) All 4 chatgpt sections renamed "Reference Content (Optional)" with a green "Ready to generate" message as primary CTA. (2) ChatGPT instructions moved into "Or use the ChatGPT prompt for more control (optional)" secondary panel. (3) updateGenerateTopicsButton no longer requires paste content — Continue shown as soon as topics are selected. (4) validateStep2() paste gates removed for VET, Workplace, University modes. (5) PD paste event handler no longer hides Continue on short paste. Savepoint 2026061700033. // ADD-CC-QUIZ-VOICE (v13.32): Teacher toggle to enable quiz voiceover in the Decision Challenge panel. When enabled, a "Questions & feedback are read aloud" teal badge appears in the quiz panel header, and the Web Speech API (window.speechSynthesis) reads each answer's feedback text aloud when a student selects an option. When disabled (default), no badge and no audio. Setting stored at manifest.voiceSettings.quizEnabled (boolean, default false). AMD: player5.js (src+build) — quizVoiceEnabled init, settings checkbox, saveSettings read/write/instance-var, renderDecisionChallenge call, click handler TTS. AMD: cc-card-slots.js (src+build) — renderDecisionChallenge 5th param + conditional badge render. AMD: translations.js + build — 3 new English keys (quizVoiceEnabled, quizVoiceEnabledDesc, questionsReadAloud). CSS: plugin player5.css + public/player5.css — cc5-quiz-voice-badge teal badge styles. Savepoint 2026061600032. // FIX-CC-IMAGE-ZINDEX (v13.30): Slide images were rendering behind the decorative radial-gradient circle pseudo-elements (::before) on all 7 card types (hook, concept, mental-model, applied-scenario, decision-point, mistakes, competency-summary). Root cause: card ::before is position:absolute (stacking step 5 — positioned z-index:auto) which paints above .cc5-slide-image-container which was position:static (stacking step 2 — non-positioned block). Fix: .cc5-slide-image-container now has position:relative + z-index:1, placing it above the card's decorative ::before in the stacking order. Applied to both moodle-plugin/mod_contentcreator/styles/player5.css and public/player5.css. CSS-only. No AMD, PHP, or DB schema changes. Savepoint 2026061600030. // FIX-CC-WCAG-CONTRAST (v13.29): Comprehensive WCAG AA contrast audit and fix for all button types. Root causes: (1) --cc5-primary was hsl(217 91% 60%) = 3.64:1 on white → darkened to hsl(217 91% 45%) = 4.87:1; --cc5-primary-hover now hsl(217 91% 36%). Fixes teacher-btn-primary, tutorial-btn, check-sequence-btn, submit-btn, check-answer-btn, link-btn hover, community-search-btn, nav-chevron hover, edit-add-btn text. (2) Amber/teal/emerald backgrounds with white text (1.9–2.4:1) → switched to dark text: teacher-btn-warning now hsl(38 95% 12%), continue-btn now hsl(168 60% 10%), doc-modal-btn-primary now hsl(158 60% 12%), edit-modal-save now hsl(168 60% 10%). (3) Hardcoded #3b82f6 = 3.68:1 → #2563eb = 5.17:1 for image-regenerate-btn and regen-confirm-btn. (4) image-remove-btn red hsl(0 84% 60%) = 3.78:1 → hsl(0 84% 42%) = 5.9:1. (5) settings-save-btn gradient end #db2777 = 4.27:1 → #be185d = 6.1:1. (6) tutorial-btn hover hsl(220 90% 50%) → var(--cc5-primary-hover). All fixes applied to both moodle-plugin/mod_contentcreator/styles/player5.css and public/player5.css. CSS-only. No AMD, PHP, or DB schema changes. Savepoint 2026061600029. // FIX-CC-MISTAKE-STAR (v13.27): Mistake card items (.cc5-mistake-icon) now show ★ star instead of a Lucide SVG icon. The SVG inside .cc5-mistake-icon is hidden (display:none) and a ::before pseudo-element with content:'\2605' (★) replaces it, coloured amber hsl(38deg 92% 48%) to match the original icon tint. Applies to all 7-card-flow "Watch Out For" (mistakes) cards. CSS-only. No AMD, PHP, or DB schema changes. Savepoint 2026061600027. // FIX-CC-BULLET-STAR (v13.26): Replaced black circle dot pseudo-elements with ★ star icons (U+2605) on .cc5-key-points-list li::before and .cc5-action-grid .cc5-action-item li::before. Key-points star uses green hsl(142 72% 40%); action-grid star uses purple hsl(262 83% 58%). CSS-only change. No AMD, PHP, or DB schema changes. Savepoint 2026061600026. // FIX-CC-IMG-CURSOR (v13.25): Added cursor:pointer !important to .cc5-image-action-btn, .cc5-add-image-btn, .cc5-image-option and cursor:pointer to .cc5-slide-image-wrapper. Moodle Boost theme resets cursor on <button> elements with higher specificity, overriding the plugin's cursor:pointer. The !important ensures the hand cursor always shows on image action buttons and the image modal option buttons. CSS-only. No AMD, PHP, or DB schema changes. Savepoint 2026061600025. // FIX-CC-IMGGEN-SESSLOCK + FIX-CC-IMGGEN-CSRF + FIX-CC-IMGGEN-BULKCTX (v13.23): Three image generation bug fixes. (1) FIX-CC-IMGGEN-SESSLOCK: generate_image action in ajax.php now calls \core\session\manager::write_close() after auth/validation and before contentcreator_api_call(). Gemini + Imagen takes 30-120 s — without write_close() the Moodle session file stayed locked for that entire duration, blocking all other session-requiring operations for the user (manifest save, navigation) and causing the page to appear frozen. Matches the identical pattern already used by generate_voice. (2) FIX-CC-IMGGEN-CSRF: generate_image action now calls require_sesskey() at the start of its block, matching every other state-changing handler in ajax.php. Previously missing, exposing a CSRF vector for credit consumption. (3) FIX-CC-IMGGEN-BULKCTX: generateSlideImageBulk() in player5.js was sending only 8 of 13 context fields to the generate-image server endpoint. Missing: topicTitle, subIndustry, country, state, scenarioContext. Without country, Gemini could not specify correct PPE; without scenarioContext, it could not match the hook-scenario narrative in the slide cards. All fields now derived from manifest.context and first card. AMD: player5.js (src + build + min). PHP: ajax.php. No DB schema changes. Savepoint 2026061000023. // CARD-REORDER-DELETE (v13.22): Edit modal for multi-card sections now shows ↑/↓ move buttons and × delete button on each card's header. Cards collected in DOM order on save so reordering and deletion are correctly persisted. Voiceover-cost warning (5 credits) shown in the modal when cards section is visible. JS: player5.js (src+build) — _renumberCardButtons, cc5-edit-card-move-up/down/delete handlers, DOM-order push with deep-clone of original card, sec.cards full-replacement in local manifest. PHP: save_slide_edit.php — section.cards now fully replaced (not merge-by-index). No DB schema changes. // DEFAULT-VOICE-ZEPHYR (v13.21): Changed default voice from Aoede to Zephyr across settings.php, ajax.php, generate_voiceover.php. Zephyr is the next-generation Chirp 3 HD female voice. PHP-only. No AMD, CSS, or DB schema changes. // SAVEPOINT-BUMP v13.20: no-op savepoint marker for clean upgrade path. No DB schema changes.; // FIX-CC-ML-NB-NO (v13.19): Removed incorrect 'nb-NO' => 'no-NO' mapping from $languageMappings in ajax.php and generate_voiceover.php. Google Chirp 3 HD has no 'no-NO-Chirp3-HD-Aoede' voice — the correct code is 'nb-NO-Chirp3-HD-Aoede'. The wrong mapping caused all Norwegian voiceover pre-generation to fail with "Voice does not exist" from the TTS API. For old modules (pre-v13.5), the v13.18 _preloadFallbackUrl mechanism then played the stale English audio as a fallback when on-demand TTS also failed for the same reason — producing English audio for Norwegian. No DB schema changes. PHP-only: ajax.php, classes/external/generate_voiceover.php, version.php. Savepoint 2026051900019. // FIX-CC-ML-STUDENT-LANG-REGEN + FIX-CC-ML-VOICE-NON-CHIRP3 (v13.18): (1) player5.js preload + playVoiceover: isLangPrefixMissing now triggers URL deletion and on-demand TTS for ALL users including students (previously teacher-only). Students on courses built before v13.5 were served English audio for Korean/Bulgarian/Tamil/Thai/Turkish because the stale URL detection only cleaned the URL for teachers. (2) routes.ts getVoiceConfigWithId + ajax.php: added non-Chirp3-HD fallback voice mapping for ms-MY (→ms-MY-Standard-D), pa-IN (→hi-IN Chirp3-HD, closest Google TTS has), fil-PH (→fil-PH-Standard-A), yue-HK (→yue-HK-Standard-D), cmn-TW (→cmn-CN Chirp3-HD), pt-PT (→pt-BR Chirp3-HD), ca-ES (→es-ES Chirp3-HD), is-IS (→is-IS-Standard-A). Previously ms-MY-Chirp3-HD-Aoede was sent to Google TTS which rejected the request — no audio generated for those sections. (3) routes.ts getLanguageName: added ms-MY, pa-IN, fil-PH, cmn-TW, yue-HK, pt-PT, ca-ES, is-IS — previously returned "English (Australian)" causing AI to generate English content for those language slots. No DB schema changes. AMD: player5.js (src+build). PHP: ajax.php, version.php. Server: routes.ts. Savepoint 2026051900018. // FIX-CC-ML-TRANSLATE-CREDITS (v13.17): Extra languages now cost 50 credits per subtopic (translation pass) instead of 100 (same as primary generation). Updated ajax.php generate_slide + generate_slide_async: detects ml_translate_* contentType and sends creditsToUse=50 instead of 1. Updated getCreditEstimationHtml() and updateCreditEstimation() in builder.js (src+build): formula is now subtopics×100 + extraLangs×subtopics×50 instead of subtopics×100×totalLanguages. Updated tooltip note text. No DB schema changes. No PHP changes outside ajax.php. Savepoint 2026051400017. // FIX-CC-ML-TRANSLATE-CREDITS (v13.17): Extra languages now cost 50 credits per subtopic (translation pass) instead of 100 (same as primary generation). Updated ajax.php generate_slide + generate_slide_async: detects ml_translate_* contentType and sends creditsToUse=50 instead of 1. Updated getCreditEstimationHtml() and updateCreditEstimation() in builder.js (src+build): formula is now subtopics×100 + extraLangs×subtopics×50 instead of subtopics×100×totalLanguages. Updated tooltip note text. No DB schema changes. No PHP changes outside ajax.php. Savepoint 2026051400017. // FIX-CC-ML-TRANSLATE-BYPASS (v13.15): Replace ManifestBuilder.build() re-generation for additional languages with Generator.translateTopicsForLanguage() — takes primary topics and translates JSON via AI instead of re-generating from English source material. Root cause: AI generated English content for de-DE because 12000+ chars of English topicPlan+criteria overwhelmed the language gate. Translation is reliable because the AI input is entirely English card text with no competing reference material. Also fixed section filter (line 10101) to include non-cards sections for voiceover pre-generation. // FIX-CC-MULTILANG-CONFLICT (v13.12): Eliminated both completion-related debug warnings simultaneously. (1) "set_module_viewed must be called before header is printed" (DEBUG_DEVELOPER, introduced by v13.10 fix): set_module_viewed() calls write_close() internally then checks if header is printed — impossible to satisfy both constraints with that function. (2) "Script mutated the session after it was closed: $SESSION->editedpages" (original pre-v13.10 warning): fired because set_module_viewed→write_close() closed the session before $OUTPUT->header() wrote editedpages. Fix: Split into two operations. contentcreator_view() in lib.php now fires only the event (no completion call). In view.php: event fires before header (Moodle-correct); $OUTPUT->header() runs with session still open (editedpages written safely); THEN write_close() + $completion->update_state($cm, COMPLETION_VIEWED) runs after header. update_state() has no is_header_printed() check, so neither warning fires. Completion tracking behaviour is functionally identical. // FIX-CC-MULTILANG-SUFFIX (v13.11): German/Spanish/etc. content was being generated in English despite the MANDATORY LANGUAGE REQUIREMENT prefix in the user prompt. Root cause: every user prompt builder placed the language guard ONLY at the top, then appended up to 12,000 chars of English reference material, ending with "Generate the full 7-card sequence." in English as the final line. OpenAI attends most heavily to end-of-prompt instructions — that trailing English line dominated and overrode the language guard above. Fix: added getLangSuffixForUserPrompt() which appends "FINAL REMINDER: Write your ENTIRE response in [language] only." as the absolute last line of all four user prompt builders (VET, Workplace, PD, University). The language guard is now both the first AND last instruction the model reads, sandwiching the English reference material. No PHP, DB schema, or AMD structure changes. // FIX-CC-SESSION-EDITEDPAGES (v13.10): contentcreator_view() (which triggers completion->set_module_viewed()) was called before $OUTPUT->header(). In Moodle 4.x, set_module_viewed() internally calls write_close() to prevent session locking during the DB completion write. This closed the session before $OUTPUT->header() ran; header() then wrote $SESSION->editedpages (edit-mode tracking), triggering "Script mutated the session after it was closed: $SESSION->editedpages" in the shutdown handler — visible as a debug warning at the bottom of the page. Fix: moved contentcreator_view() call to after echo $OUTPUT->header(), matching the standard Moodle pattern used by mod/quiz, mod/book, mod/page. No AMD, CSS, or DB schema changes. version.php → 2026051313901. // ADD-CC-ML-CCMLTEXT (v13.9): Added window.ccMLText() plain-text console diagnostic alongside ccMLDump(). ccMLDump() uses console.group() which is non-expandable in some Moodle/browser DevTools contexts. ccMLText() outputs identical state data (activeLang, voiceLanguage, voiceoversComplete, multiLanguage entries with per-section URL/status/cached, and primary-language sections) as a single flat console.log string — fully copyable with no triangle interaction required. No PHP, DB schema, or CSS changes. // FIX-CC-ML-PRELOAD-PREFIX + CC-ML-CONTENT-SAMPLE-DIAG (v13.8): isLangPrefixMissing was added to isStale in v13.6 and the console.log correctly displayed "TEACHER-REGEN", but was never added to the actual deletion condition at line 13416. Teachers with only isLangPrefixMissing=true (all other stale flags false) fell through to the student else-branch and played the wrong (primary-language) audio unchanged. The condition now includes isLangPrefixMissing, so teachers correctly delete the stale URL and trigger on-demand TTS regeneration with the correct lang-prefixed filename (e.g. de-DE_voiceover_2.1.mp3). Students continue to play whatever URL exists as before. No PHP, DB schema, or CSS changes. AMD: cc-state.js (CC_VERSION 13.6→13.7), player5.js (condition fix). // v13.1: 8-VOICE SELECTOR — replaces binary Female/Male toggle with 8 individual Chirp 3 HD voices: Female: Aoede (Warm & Friendly), Kore (Clear & Professional), Leda (Soft & Nurturing), Zephyr (Energetic & Youthful); Male: Puck (Upbeat & Clear), Charon (Informative & Calm), Fenrir (Excitable & Bold), Orus (Firm & Direct). Builder shows clickable voice cards grouped by gender. Voiceover chain (builder.js, player5.js) sends voice= param to ajax.php; server validates against allowed list and falls back to gender for old manifests. PHP+AMD+CSS change. No DB schema changes.
// FIX-CC-MULTILANG-SECONDARY-PASSES: Server-side secondary passes (Pass 2 expansion, Pass 3 banned-word rewrite, Micro-expansion) now receive the target language name extracted from the incoming systemPrompt and inject a mandatory language guard into their system prompts. Previously these passes had no language instruction, causing OpenAI to silently rewrite Punjabi/Hindi/etc. card fields into English. ccDeterministicClean now skipped for non-English content. version.php → 2026050900277.
