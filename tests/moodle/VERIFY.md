# Verifying a release on a real Moodle — the part no automated suite here can do

Everything in `tests/js` and `tests/php` runs without Moodle. That covers the checks, the
prompts, the rendered markup, the reveal behaviour in headless Chromium, and the plugin's
own metadata. **Three things it cannot cover**, because they need a live site, a vendor API
key and credits:

1. The plugin installing and upgrading on a real Moodle (4.x and 5.x).
2. Moodle's AMD loader serving the rebuilt modules — the built bundles are checked for
   content here, never *loaded by Moodle*.
3. Whether a newly generated pack actually arrives with per-option feedback. That is a
   round trip through LMS Labs and the model; nothing local can answer it.

This file is the 10-minute manual pass that closes those three. Run it on **Moodle 4.5 LTS
and the current Moodle 5.x**, on PHP 8.2+ (the plugin's `$plugin->requires` is 2023042400 —
Moodle 4.2).

---

## A. Install and upgrade — 2 minutes, both versions

1. On a site already running the PREVIOUS release, drop this ZIP in via
   *Site administration → Plugins → Install plugins* and confirm the upgrade page shows
   the new `$plugin->version` and completes without a notice.
   **Watch for:** "This version is the same or older" — that means the version number did
   not move, which `tests/php/static-checks.php` also guards.
2. On a clean site, install from scratch and add one Content Creator activity to a course.
3. *Site administration → Users → Permissions → Define roles → Student*: confirm
   **Generate content on demand** (`mod/contentcreator:generateondemand`) reads as a real
   capability name, not a raw `contentcreator:generateondemand` key.
   **Known gap:** `db/upgrade.php` grants nothing, so a site using a CUSTOM student role
   with no archetype will not have this capability after upgrade and its learners lose
   voiceover and on-demand generation. If you use custom roles, check and grant it.

## B. The player loads — 1 minute

Open any existing pack (an old one, not a fresh generation) with the browser console open.

- **No console errors.** Specifically nothing containing `mod_contentcreator/player5` or
  `Uncaught` — an AMD module that fails to load leaves the card blank with a clean-looking
  page, which is how v15.4.6's null-card bug hid.
- The section renders its cards and the activity block appears at the end.

## C. The reported defect, on a pack generated BEFORE this release — 2 minutes

This is the case existing customers are in: distractors that carry no feedback because it
was never written.

1. Open the Challenge, press Start, and **deliberately answer a question wrong**.
2. Expect: your option turns red with a cross; **the correct option lights green, shows a
   "Correct answer" badge and its explanation**; the third option stays dimmed.
3. Press Enter on a wrong option instead of clicking — same result.
4. Switch the site (or your OS) to dark mode and repeat: the borders must still read green
   and red, not grey.

If the reveal does not appear, the built `player5.min.js` is not the one being served —
check for a cached `?ver=` on `player5.min.js` and purge caches.

## D. The actual fix, on a NEWLY generated pack — 5 minutes, one section's credits

Generate one section on each route you care about (VET and Topics-and-Text at minimum).

1. Answer a question wrong. **The distractor should now carry its own reason** — an
   explanation of why THAT answer is wrong, not the correct answer's explanation and not
   "incorrect, the answer is B".
2. If the reveal works but the distractor has no reason of its own, the prompt change did
   not take. Do not guess: open the section's quality issues and look for either
   - `wrong options carry NO FEEDBACK` (repairable — the shape works, this card slipped), or
   - `NO WRONG-ANSWER FEEDBACK ANYWHERE IN THIS PACK` (review-only — the route is dropping
     the `{text, feedback}` option shape, which is a vendor-side question).
   Which of the two appears is the diagnosis.
3. On Topics-and-Text specifically, confirm the pack comes back as **6-10 subtopic cards,
   each with its own heading**, plus one decision-point last. That route's generation prompt
   was asking for a retired five-card shape until v15.4.21.

## E. If you have a non-English site — 1 minute

Generate or open a Japanese, Chinese or Thai pack and check the section's quality issues do
**not** say every option is "below the 10-16 word range". Before v15.4.21 they always did,
and each of those packs spent a repair attempt per section fixing content that was fine.

---

## What to send back if something fails

The section's quality issues, the browser console, and `$plugin->version` from
*Site administration → Plugins → Plugins overview*. Those three identify almost every
failure in this list without a second round trip.
