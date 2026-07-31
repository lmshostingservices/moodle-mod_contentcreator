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
 * Upgrade script for Content Creator.
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

/**
 * Upgrade the mod_contentcreator plugin.
 *
 * @param int $oldversion The old version of the plugin.
 * @return bool Always returns true.
 */
function xmldb_contentcreator_upgrade($oldversion) {
    global $DB;

    $dbman = $DB->get_manager();

    // v7.8.4: Change manifestjson from TEXT to LONGTEXT.
    if ($oldversion < 2026011678) {
        $table = new xmldb_table('contentcreator');
        $field = new xmldb_field('manifestjson', XMLDB_TYPE_TEXT, 'big', null, null, null, null, 'intro');
        if ($dbman->field_exists($table, $field)) {
            $dbman->change_field_precision($table, $field);
        }
        upgrade_mod_savepoint(true, 2026011678, 'contentcreator');
    }

    // v9.78: Create contentcreator_checklist table.
    if ($oldversion < 2026031700978) {
        $table = new xmldb_table('contentcreator_checklist');
        if (!$dbman->table_exists($table)) {
            $table->add_field('id', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, XMLDB_SEQUENCE, null);
            $table->add_field('cmid', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, null);
            $table->add_field('userid', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, null);
            $table->add_field('topicid', XMLDB_TYPE_CHAR, '255', null, null, null, null);
            $table->add_field('complete', XMLDB_TYPE_INTEGER, '1', null, XMLDB_NOTNULL, null, '0');
            $table->add_field('timecreated', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, null);
            $table->add_field('timemodified', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, null);
            $table->add_key('primary', XMLDB_KEY_PRIMARY, ['id']);
            $table->add_key('userid', XMLDB_KEY_FOREIGN, ['userid'], 'user', ['id']);
            $table->add_index('cmid_userid_topicid', XMLDB_INDEX_UNIQUE, ['cmid', 'userid', 'topicid']);
            $dbman->create_table($table);
        }
        upgrade_mod_savepoint(true, 2026031700978, 'contentcreator');
    }

    // v9.78–v11.01: Consolidated JS/CSS/prompt fixes (no DB schema changes).
    if ($oldversion < 2026032101101) {
        upgrade_mod_savepoint(true, 2026032101101, 'contentcreator');
    }

    // v11.02: Shared voiceover module, field-order fix, title dedup, em dash fix.
    // No DB schema change.
    if ($oldversion < 2026032101102) {
        upgrade_mod_savepoint(true, 2026032101102, 'contentcreator');
    }

    // v11.03: AI images toggle defaults to on. No DB schema change.
    if ($oldversion < 2026032101103) {
        upgrade_mod_savepoint(true, 2026032101103, 'contentcreator');
    }

    // v11.04: image2 grammar whitelist fix + edit modal add/remove handlers. No DB schema change.
    if ($oldversion < 2026032101104) {
        upgrade_mod_savepoint(true, 2026032101104, 'contentcreator');
    }

    // v11.05: Make contentcreator_attempts (contentcreatorid, userid) index UNIQUE.
    // Deduplicate any existing rows first (keep the newest per user+activity),
    // then drop the old non-unique index and create a unique one.
    if ($oldversion < 2026032101105) {
        $table = new xmldb_table('contentcreator_attempts');

        // Step 1: Remove duplicate rows — keep the one with the highest id per pair.
        $dupes = $DB->get_records_sql(
            "SELECT contentcreatorid, userid, MAX(id) AS keepid, COUNT(*) AS cnt
               FROM {contentcreator_attempts}
           GROUP BY contentcreatorid, userid
             HAVING COUNT(*) > 1"
        );
        foreach ($dupes as $dupe) {
            $DB->delete_records_select(
                'contentcreator_attempts',
                'contentcreatorid = :cid AND userid = :uid AND id <> :keepid',
                ['cid' => $dupe->contentcreatorid, 'uid' => $dupe->userid, 'keepid' => $dupe->keepid]
            );
        }

        // Step 2: Drop old non-unique index, create unique one.
        $oldindex = new xmldb_index('user_activity', XMLDB_INDEX_NOTUNIQUE, ['contentcreatorid', 'userid']);
        if ($dbman->index_exists($table, $oldindex)) {
            $dbman->drop_index($table, $oldindex);
        }
        $newindex = new xmldb_index('user_activity', XMLDB_INDEX_UNIQUE, ['contentcreatorid', 'userid']);
        if (!$dbman->index_exists($table, $newindex)) {
            $dbman->add_index($table, $newindex);
        }

        upgrade_mod_savepoint(true, 2026032101105, 'contentcreator');
    }

    // v11.06: IMAGE2-RETRY-FIX — JS-only changes (no DB schema changes).
    if ($oldversion < 2026032101106) {
        upgrade_mod_savepoint(true, 2026032101106, 'contentcreator');
    }

    // v11.07: SERVER-CARDTYPE-MISMATCH-FIX — server-side fix, no DB schema changes.
    if ($oldversion < 2026032101107) {
        upgrade_mod_savepoint(true, 2026032101107, 'contentcreator');
    }

    // v11.08: EXPORT-UNIFIED-CARDS-FIX — client-side JS fix, no DB schema changes.
    if ($oldversion < 2026032101108) {
        upgrade_mod_savepoint(true, 2026032101108, 'contentcreator');
    }

    // v11.09: BUILD-DEPLOY-FIX — deployment fix, no DB schema changes.
    if ($oldversion < 2026032101109) {
        upgrade_mod_savepoint(true, 2026032101109, 'contentcreator');
    }

    // v11.10: COMPLETION-ALL-ACTIVITIES — add completionallactivities column.
    if ($oldversion < 2026032101110) {
        $table = new xmldb_table('contentcreator');
        $field = new xmldb_field('completionallactivities', XMLDB_TYPE_INTEGER, '1', null, XMLDB_NOTNULL, null, '0', 'completionviewallslides');
        if (!$dbman->field_exists($table, $field)) {
            $dbman->add_field($table, $field);
        }
        upgrade_mod_savepoint(true, 2026032101110, 'contentcreator');
    }

    // v11.11: ACTIVITIES-TOGGLE — JS/manifest-only (no DB changes).
    if ($oldversion < 2026032101111) {
        upgrade_mod_savepoint(true, 2026032101111, 'contentcreator');
    }

    // v11.12: BUILD-DEPLOY — clean release.
    if ($oldversion < 2026032101112) {
        upgrade_mod_savepoint(true, 2026032101112, 'contentcreator');
    }

    // v11.13: CANEDIT-FIX + VET-PROMPT-LEGAL — view.php fix, prompt update. No DB changes.
    if ($oldversion < 2026032201113) {
        upgrade_mod_savepoint(true, 2026032201113, 'contentcreator');
    }

    // v11.14: CHUNK-SIZE-FIX — builder.js chunk size 2MB→900KB. No DB changes.
    if ($oldversion < 2026032201114) {
        upgrade_mod_savepoint(true, 2026032201114, 'contentcreator');
    }

    // v11.15: CHALLENGE-POLISH — Decision Challenge UX improvements. No DB changes.
    if ($oldversion < 2026032201115) {
        upgrade_mod_savepoint(true, 2026032201115, 'contentcreator');
    }

    // v11.16: IMAGE2-REMOVAL — Removed broken image2 feature. No DB changes.
    if ($oldversion < 2026032201116) {
        upgrade_mod_savepoint(true, 2026032201116, 'contentcreator');
    }

    // v11.17: Release build with all v11.15–v11.16 changes. No DB changes.
    if ($oldversion < 2026032201117) {
        upgrade_mod_savepoint(true, 2026032201117, 'contentcreator');
    }

    // v11.18: VOICEOVER-TITLE-FIX — section titles with "1.1." format caused double-reading. No DB changes.
    if ($oldversion < 2026032201118) {
        upgrade_mod_savepoint(true, 2026032201118, 'contentcreator');
    }

    // v11.19: ICON-VOCABULARY — expanded prompt icon vocabulary + resolveScenePartIcon fallback. No DB changes.
    if ($oldversion < 2026032201119) {
        upgrade_mod_savepoint(true, 2026032201119, 'contentcreator');
    }

    // v11.20: ICON-BUGFIX — position fallback array 5th entry, edit modal icon preservation. No DB changes.
    if ($oldversion < 2026032201120) {
        upgrade_mod_savepoint(true, 2026032201120, 'contentcreator');
    }

    // v11.21: BOOST-HOVER-FIX — Category Sort button hover colour override. No DB changes.
    if ($oldversion < 2026032201121) {
        upgrade_mod_savepoint(true, 2026032201121, 'contentcreator');
    }

    // v11.22: PROMPT-CARD-ORDER — ChatGPT prompt templates card order fix. No DB changes.
    if ($oldversion < 2026032201122) {
        upgrade_mod_savepoint(true, 2026032201122, 'contentcreator');
    }

    // v11.23: READING-TIME-EXTEND — Reading time per slide dropdown extended to 10 minutes. No DB changes.
    if ($oldversion < 2026032201123) {
        upgrade_mod_savepoint(true, 2026032201123, 'contentcreator');
    }

    // v11.24: COMMUNITY-GALLERY-FIX — CORS fix, auto-contribute, topic/unitCode search. No Moodle DB changes.
    if ($oldversion < 2026032201124) {
        upgrade_mod_savepoint(true, 2026032201124, 'contentcreator');
    }

    // v11.25: ICON-RELEVANCE — Content-matched icons on mistake/scene/flip cards. No DB changes.
    if ($oldversion < 2026032201125) {
        upgrade_mod_savepoint(true, 2026032201125, 'contentcreator');
    }

    // v11.26: TIMED-READING-FIX — Timer reset guard, player settings duration cap fix, focus detection typo. No DB changes.
    if ($oldversion < 2026032201126) {
        upgrade_mod_savepoint(true, 2026032201126, 'contentcreator');
    }

    // v11.27: ETA BANNERS — Estimated Time to Complete banners in topics grid. No DB changes.
    if ($oldversion < 2026032201127) {
        upgrade_mod_savepoint(true, 2026032201127, 'contentcreator');
    }

    // v11.28: VERSION BUMP — Maintenance release. JS version constant sync. No DB changes.
    if ($oldversion < 2026032201128) {
        upgrade_mod_savepoint(true, 2026032201128, 'contentcreator');
    }

    // v11.29: ETA recalibration, flip card CSS grid fix, badge positioning, tap-to-reveal icon.
    if ($oldversion < 2026032201129) {
        upgrade_mod_savepoint(true, 2026032201129, 'contentcreator');
    }

    // v11.30: Community Gallery added to Add Image modal. Flip card back-face scrollbar fix (CSS grid).
    if ($oldversion < 2026032201130) {
        upgrade_mod_savepoint(true, 2026032201130, 'contentcreator');
    }

    // v11.31: Completion fixes — contentcreator_view(), contentcreator_get_coursemodule_info(), course_module_viewed event class.
    if ($oldversion < 2026032301131) {
        upgrade_mod_savepoint(true, 2026032301131, 'contentcreator');
    }

    // v11.32: Course info time estimation update — 30 min per slide.
    if ($oldversion < 2026032301132) {
        upgrade_mod_savepoint(true, 2026032301132, 'contentcreator');
    }

    // v11.33: Single-topic hero layout — two-column panel with ETA stats and action button.
    if ($oldversion < 2026032301133) {
        upgrade_mod_savepoint(true, 2026032301133, 'contentcreator');
    }

    // v11.34: Version bump — CC_VERSION sync, maintenance release.
    if ($oldversion < 2026032301134) {
        upgrade_mod_savepoint(true, 2026032301134, 'contentcreator');
    }

    // v11.35: ETA 20 min per slide; fixed 'Start Learning' label.
    if ($oldversion < 2026032301135) {
        upgrade_mod_savepoint(true, 2026032301135, 'contentcreator');
    }

    // v11.36: FIX (4 tester bugs) — VoiceOver prefix, flip card heights, skip link, Return to Course button.
    if ($oldversion < 2026032301136) {
        upgrade_mod_savepoint(true, 2026032301136, 'contentcreator');
    }

    // v11.37: BUG FIXES — (1) VoiceOver schema bumped to force teacher-side TTS regeneration
    //         of sections still carrying the old "1.1. Topic Name" numeric-prefix audio.
    //         (2) Flip & Learn cards: fixed card heights with grid-auto-rows:220px.
    //         (3) Skip-to-main-content: CSS hides Moodle Boost skip link on CC pages.
    //         (4) Next Activity: $OUTPUT->activity_navigation() added to view.php.
    //         No DB schema changes — JS, CSS, and PHP-only fixes.
    if ($oldversion < 2026032401137) {
        upgrade_mod_savepoint(true, 2026032401137, 'contentcreator');
    }

    // v11.38: IMAGE-DOWNLOAD — Added download button to generated images (picker modal,
    //         gallery, community gallery). Uses fetch-as-blob for cross-origin CDN images;
    //         falls back to opening in a new tab. No DB schema changes.
    if ($oldversion < 2026032401138) {
        upgrade_mod_savepoint(true, 2026032401138, 'contentcreator');
    }

    // v11.39: FIX-SAVE-PERMISSION — Fixed "Failed to save generated content" error for
    //         editing teachers on Moodle sites using custom roles. save_manifest and
    //         save_manifest_chunk external functions now mirror ajax.php's two-step
    //         capability check (mod/contentcreator:manage → moodle/course:manageactivities).
    //         \Throwable catch added to both. CC_VERSION bumped to '11.39' in cc-state.js
    //         and generator.js; build files synced. No DB schema changes.
    if ($oldversion < 2026032401139) {
        upgrade_mod_savepoint(true, 2026032401139, 'contentcreator');
    }

    // v11.40: BUG-CC-SSLIDE-PERM + BUG-CC-SSLIDE-NOTRY + BUG-CC-SSLIDE-SESSION —
    //         Three bugs in save_slide_edit.php missed by the v11.39 partial fix.
    //
    //         BUG-CC-SSLIDE-PERM: save_slide_edit still used
    //         require_capability('mod/contentcreator:addinstance') — same wrong cap
    //         that caused "Failed to save generated content" for custom-role teachers.
    //         v11.39 fixed save_manifest + save_manifest_chunk but missed this file.
    //         Fixed: same two-step check (manage → manageactivities fallback).
    //
    //         BUG-CC-SSLIDE-NOTRY: No try/catch(\Throwable) — PHP 7+ Error objects
    //         propagated as opaque HTTP 500 with no log context. Fixed: wrapped in
    //         try/catch(\Throwable) with error_log(), matching other save externals.
    //
    //         BUG-CC-SSLIDE-SESSION: No \core\session\manager::write_close() call —
    //         session lock held during manifest JSON decode+encode. Fixed: write_close()
    //         added after capability check, before DB operations.
    //
    //         No DB schema changes.
    if ($oldversion < 2026032401140) {
        upgrade_mod_savepoint(true, 2026032401140, 'contentcreator');
    }

    // v11.41: BUG-CC-GEN-TOKENS — Persistent AI content generation failures on VET courses.
    //         Root cause: v11.40 set maxTokens=12000 in all six callOpenAI calls inside the
    //         /api/moodle/content-creator/prompt endpoint. VET 7-card content (~1500-2000
    //         tokens/card × 7 ≈ 11,900 tokens) regularly hit the cap, truncating JSON.
    //         ccUnwrapCards() failed, server retried once at the same cap, both failed.
    //         Returned {"success":false,"error":"AI generation failed - invalid structure
    //         after retry"} — a non-transient error that suppressed all client-side retries.
    //         Fix 1 (server/routes.ts): All six maxTokens raised 12000 → 16000.
    //         Fix 2 (generator.js): Added "generation failed"/"invalid structure"/"empty
    //         response" to isTransient patterns for defence-in-depth retry coverage.
    //         No DB schema changes.
    if ($oldversion < 2026032401141) {
        upgrade_mod_savepoint(true, 2026032401141, 'contentcreator');
    }

    // v11.42: BUG-CC-TOKEN-GUARD + BUG-CC-ROUTE-MISSING.
    //         BUG-CC-TOKEN-GUARD (server/routes.ts): gpt-4o json_schema hard cap = 16,384
    //         tokens. Server now injects TOKEN_BUDGET_GUARD into systemPrompt for PASS 1
    //         and retry, instructing gpt-4o to target <14,000 tokens and emit null for
    //         non-applicable fields. No DB schema changes.
    //         BUG-CC-ROUTE-MISSING (generator.js + ajax.php): callAI() never forwarded
    //         the route param (vet/university/workplace/pd) to ajax.php or the server.
    //         Server always defaulted route='vet' (7 cards). For 6-card routes this
    //         triggered unnecessary PASS 2 expansion. Fixed: route added as 5th param
    //         to callAI(); ajax.php reads optional_param('route'). No DB schema changes.
    if ($oldversion < 2026032401142) {
        upgrade_mod_savepoint(true, 2026032401142, 'contentcreator');
    }

    // v11.43: VERSION BUMP — clean release following master release process.
    //         No code changes beyond v11.42. CC_VERSION → 11.43.
    //         BUILD_INFO.json updated. Stale v11.41 ZIP removed. No DB schema changes.
    if ($oldversion < 2026032401143) {
        upgrade_mod_savepoint(true, 2026032401143, 'contentcreator');
    }

    // v11.44: TIMEOUT FIX — BUG-CC-PROMPT-SILENT-FAIL:
    //         Server: max_tokens 16000→8000, TOKEN_BUDGET_GUARD <9000→<7500, callOpenAI
    //         AbortController timeout formula changed to min(65s, max(30s, tokens*8ms))
    //         so requests abort gracefully BEFORE Replit proxy kills them silently.
    //         Timeout catch now returns HTTP 504 with user-readable message.
    //         ajax.php: set_time_limit(0) + error_log diagnostics added around cURL call.
    //         CC_VERSION → 11.44. No DB schema changes.
    if ($oldversion < 2026032401144) {
        upgrade_mod_savepoint(true, 2026032401144, 'contentcreator');
    }

    // v11.45: ASYNC GENERATION — Eliminated Replit proxy 120s timeout failures.
    //         JS calls action=generate_slide_async → PHP hits Express /start → returns
    //         {jobId} in ~500ms. JS polls action=poll_job every 3s via PHP → Express
    //         GET /api/jobs/:jobId. When status=done, result processed identically to
    //         the former sync response. Internal loopback bypasses proxy hard limit.
    //         12s client-side abort guard. CC_VERSION → 11.45. No DB schema changes.
    if ($oldversion < 2026032401145) {
        upgrade_mod_savepoint(true, 2026032401145, 'contentcreator');
    }

    // v11.46: VERSION BUMP — Clean release following master release process.
    //         No code changes beyond v11.45. CC_VERSION → 11.46. No DB schema changes.
    if ($oldversion < 2026032401146) {
        upgrade_mod_savepoint(true, 2026032401146, 'contentcreator');
    }

    // v11.47: BUG-CC-MSGCHAN — saveManifest() now retries up to 3 times with
    //         exponential back-off (1s, 2s, 3s) on both direct-save and chunked-save
    //         paths. Fixes "Failed to save generated content" caused by Moodle 4.4+
    //         service-worker message channel closing between the last voiceover
    //         Ajax call and the manifest save Ajax call. No DB schema changes.
    if ($oldversion < 2026032401147) {
        upgrade_mod_savepoint(true, 2026032401147, 'contentcreator');
    }

    // v11.48: BUG-CC-DBWRITE — MySQL max_allowed_packet rejects large UPDATE payloads.
    //         A fully-generated manifest for a VET unit with voiceover data can reach
    //         6–10 MB as raw JSON. MySQL default max_allowed_packet (4 MB on many hosts)
    //         causes $DB->update_record() to throw "Error writing to database" on every
    //         attempt — retries cannot help because the query size never changes.
    //         Fix: manifest_storage::compress() gzip-compresses JSON before every write;
    //         manifest_storage::decompress() detects the 'gz:' prefix and decompresses
    //         on every read. Old uncompressed records are read transparently.
    //         New class: classes/manifest_storage.php (auto-loaded by Moodle).
    //         Write sites patched: save_manifest.php, save_manifest_chunk.php,
    //                              save_slide_edit.php.
    //         Read sites patched:  get_manifest.php, save_slide_edit.php, view.php,
    //                              custom_completion.php, ajax.php.
    //         No DB schema changes.
    if ($oldversion < 2026032401148) {
        upgrade_mod_savepoint(true, 2026032401148, 'contentcreator');
    }

    // v11.49: BUG-CC-DBWRITE (ROOT CAUSE) — Inline base64 voiceover audio was stored
    //         in the manifest, adding 2–6 MB of already-compressed binary data per
    //         generation.  gzip barely shrinks base64-encoded MP3/OGG audio, so the
    //         compressed manifest still exceeded MySQL max_allowed_packet.
    //         Fix: builder.js stripInlineAudio() strips all 'data:audio/...;base64,...'
    //         voiceoverUrl values before serialisation.  voiceoverText (TTS script) is
    //         preserved, allowing the player to regenerate audio on demand.  Manifests
    //         now serialise to ~100-300 KB — well within any max_allowed_packet.
    //         No DB schema changes.  The PHP-side gzip compression from v11.48 is kept
    //         as an extra safety net for any remaining large manifests.
    if ($oldversion < 2026032401149) {
        upgrade_mod_savepoint(true, 2026032401149, 'contentcreator');
    }

    if ($oldversion < 2026032500150) {
        // v11.50: VERSION BUMP — routine release packaging following v11.49 bug fixes.
        // CC_VERSION bumped to 11.50 in cc-state.js and generator.js so console logs
        // correctly identify the installed version. No DB schema changes.
        upgrade_mod_savepoint(true, 2026032500150, 'contentcreator');
    }

    if ($oldversion < 2026032500151) {
        // v11.51: FIX BUG-VO-RACE + FIX BUG-CC-DBWRITE (root cause improvements)
        //
        // FIX BUG-VO-RACE (player5.js):
        //   priorityPreloadCurrentSlide() had no student guard. After v11.49 set
        //   voiceoverUrl='' (falsy), the guard `if (currentSection.voiceoverUrl) return`
        //   stopped firing for ALL users, causing the function to make live TTS API calls
        //   for students (burning credits) and setting voiceoverLoading[id]=true.
        //   When the student clicked Play, playVoiceover() found loading=true, entered the
        //   30-second wait, and timed out when the slow TTS API took >30s to respond.
        //   Fix: added `if (!this.editMode && !this.canEdit) return` guard.
        //
        // FIX SENTINEL (player5.js + builder.js):
        //   All three stripAudio / stripInlineAudio functions now write 'pregenerated'
        //   instead of '' so that truthy checks (priorityPreloadCurrentSlide guard,
        //   INIT missing-count) see a valid value and do not trigger false positives.
        //   preloadVoiceovers() and playVoiceover() handle the 'pregenerated' sentinel:
        //   students skip preload (on-demand on click); teachers clear it and regenerate.
        //
        // FIX BUG-CC-DBWRITE (save_manifest_chunk.php + save_manifest.php):
        //   PHP-side preg_replace strips any remaining data: URLs >200 chars (embedded
        //   images, PDFs, etc. not covered by JS stripAudio) before gzip + DB write,
        //   reducing payload and preventing MySQL max_allowed_packet errors.
        //   DB write exceptions now return success:false instead of re-throwing so the
        //   JS .done() retry handler fires correctly (all 3 attempts were previously
        //   bypassed because the throw triggered Moodle's fault path → .fail() only).
        //
        // No DB schema changes.
        upgrade_mod_savepoint(true, 2026032500151, 'contentcreator');
    }

    if ($oldversion < 2026032500152) {
        // v11.52: Version bump. No DB schema changes.
        upgrade_mod_savepoint(true, 2026032500152, 'contentcreator');
    }

    if ($oldversion < 2026032500153) {
        // v11.53: VERSION BUMP — Routine release packaging. No DB schema changes.
        upgrade_mod_savepoint(true, 2026032500153, 'contentcreator');
    }

    if ($oldversion < 2026032500154) {
        // v11.54: TWO FIXES — Image-regen bug + image gen always saves to gallery. No DB schema changes.
        upgrade_mod_savepoint(true, 2026032500154, 'contentcreator');
    }

    if ($oldversion < 2026032500155) {
        // v11.55: IMAGE-DISPLAY FIX — generateImage() returns HTTPS URL not data:image. No DB schema changes.
        upgrade_mod_savepoint(true, 2026032500155, 'contentcreator');
    }

    if ($oldversion < 2026032500156) {
        // v11.56: VERSION BUMP — CC_VERSION stale fix (11.53→11.56). No DB schema changes.
        upgrade_mod_savepoint(true, 2026032500156, 'contentcreator');
    }

    if ($oldversion < 2026032500157) {
        // v11.57: ZIP-VALIDATION FIX — amd/build/legislation/ empty in v11.56 ZIP. No DB schema changes.
        upgrade_mod_savepoint(true, 2026032500157, 'contentcreator');
    }

    if ($oldversion < 2026032500158) {
        // v11.58: TWO BUG FIXES — Image-generation fallback + image picker data:URL bug. No DB schema changes.
        upgrade_mod_savepoint(true, 2026032500158, 'contentcreator');
    }

    if ($oldversion < 2026032600159) {
        // v11.59: THREE BUG FIXES — Image picker, gallery save, voiceover. No DB schema changes.
        upgrade_mod_savepoint(true, 2026032600159, 'contentcreator');
    }

    if ($oldversion < 2026032600160) {
        // v11.60: TWO BUG FIXES — applySelectedImage silent save failure + overflow-visible CSS. No DB schema changes.
        upgrade_mod_savepoint(true, 2026032600160, 'contentcreator');
    }

    if ($oldversion < 2026032601161) {
        // v11.61: FIVE FIXES — Persistent image storage, upload data:URL, gallery count, broken thumbnails, stale count. No DB schema changes.
        upgrade_mod_savepoint(true, 2026032601161, 'contentcreator');
    }

    if ($oldversion < 2026032701162) {
        // v11.62: BUG FIX (x3) — Workplace Training button, generate topics state, TGA foundation overcount. No DB schema changes.
        upgrade_mod_savepoint(true, 2026032701162, 'contentcreator');
    }

    if ($oldversion < 2026032701163) {
        // v11.63: VERSION BUMP — Clean release increment. No code or DB schema changes.
        upgrade_mod_savepoint(true, 2026032701163, 'contentcreator');
    }

    if ($oldversion < 2026032701165) {
        // v11.65: VERSION BUMP — Video pipeline reverted. No DB schema changes.
        upgrade_mod_savepoint(true, 2026032701165, 'contentcreator');
    }

    if ($oldversion < 2026032701166) {
        // v11.66: VERSION BUMP — Routine release increment. No DB schema changes.
        upgrade_mod_savepoint(true, 2026032701166, 'contentcreator');
    }

    if ($oldversion < 2026033001167) {
        // v11.67: BUG FIX — Quality gate hard gate: BEST_EFFORT content below 140/180
        // (or below 40/80 audit) now returns failed sequence to force auto-redo.
        // generator.js updated. No DB schema changes.
        upgrade_mod_savepoint(true, 2026033001167, 'contentcreator');
    }

    if ($oldversion < 2026033001168) {
        // v11.68: PERFORMANCE UPGRADE — Fast-First + Smart QA architecture.
        // MAX_ATTEMPTS 3→2, thresholds lowered, single repair path, Story QA gated,
        // system prompt cached. generator.js updated. No DB schema changes.
        upgrade_mod_savepoint(true, 2026033001168, 'contentcreator');
    }

    if ($oldversion < 2026033001169) {
        // v11.69: BULLETPROOF FIXES (ChatGPT approved — 3 edge-case hardening fixes).
        // (1) JSON salvage pass: after all repair attempts fail, extract embedded array/object
        //     from prose text before giving up. Prevents discarding almost-valid AI responses.
        // (2) lastIssues re-capped at 5 after EQA injection to keep repair focused.
        // (3) System prompt cache keyed by mode+country+language (context._promptCache[key])
        //     instead of flat context._cachedSystemPrompt — prevents cross-topic contamination
        //     in batch runs. generator.js updated. AMD build/min synced (9398fc43). No DB schema changes.
        upgrade_mod_savepoint(true, 2026033001169, 'contentcreator');
    }

    if ($oldversion < 2026033001170) {
        // v11.70: VOICEOVER FIX — Instant student playback via Moodle file store.
        // Previously, voiceover audio (base64 data: URLs) was stripped to the string
        // 'pregenerated' by saveManifestSilent() on every save, so no audio URL was
        // ever persisted in the DB. Students were forced to call the TTS API on every
        // session (3–8 s wait, credit cost per student per slide per session).
        // Fix: new save_voiceover_file AJAX action stores audio as a Moodle file in the
        // 'voiceovers' filearea and returns a pluginfile.php HTTPS URL. The JS stores
        // this URL in section.voiceoverUrl — stripAudio() only strips data: URLs so the
        // HTTPS URL survives all saves. Students play from the file store instantly.
        // New mod_contentcreator_pluginfile() added to lib.php. No DB schema changes.
        upgrade_mod_savepoint(true, 2026033001170, 'contentcreator');
    }

    if ($oldversion < 2026033001171) {
        // v11.71: VOICEOVER DEDUP + VALIDATION (ChatGPT-approved hardening pass).
        // Three targeted improvements on top of the v11.70 file-store architecture:
        // (1) Dedup upload guard: persistVoiceoverToFileStore() is now only called when
        //     section.voiceoverUrl is absent or === 'pregenerated'. Prevents redundant file-store
        //     writes when preloadVoiceovers + priorityPreloadCurrentSlide both fire for the same
        //     slide, eliminating unnecessary network calls and backend load.
        // (2) On-demand dedup: same guard applied to the teacher on-demand play path — if the
        //     file store already has a valid HTTPS URL for this section, the upload is skipped;
        //     playback still fires immediately from the local base64 audioUrl (fire-and-forget).
        // (3) PHP validation threshold raised from 100 → 1000 bytes in ajax.php
        //     save_voiceover_file — rejects tiny/corrupt audio payloads that would pass the
        //     old threshold but are not valid audio files.
        // Also bumps CC_VERSION in cc-state.js from 11.70 → 11.71. No DB schema changes.
        upgrade_mod_savepoint(true, 2026033001171, 'contentcreator');
    }

    if ($oldversion < 2026033001172) {
        // v11.72: VOICEOVER GUARD UPGRADE (ChatGPT-approved micro-tweak on v11.71 dedup guards).
        // Replaces `section.voiceoverUrl === 'pregenerated'` with `!section.voiceoverUrl.startsWith('http')`
        // at all three persistVoiceoverToFileStore() call-sites (preloadVoiceovers,
        // priorityPreloadCurrentSlide, on-demand playVoiceover).
        // The old check only caught the known sentinel string; the new check rejects any
        // non-HTTPS value (broken URL, expired token, wrong format, unknown sentinels)
        // ensuring upload only runs when a valid pluginfile.php URL is absent.
        // CC_VERSION bumped to 11.72 in cc-state.js.
        // AMD triple-match: player5.js 702002e2 / cc-state.js 0acee077. No DB schema changes.
        upgrade_mod_savepoint(true, 2026033001172, 'contentcreator');
    }

    if ($oldversion < 2026033001173) {
        // v11.73: QUALITY GATE REPLACEMENT (ChatGPT-approved).
        // Removes the dual scoring system (scoreQualityGate + scoreAuditDefensibility +
        // EnterpriseQA) that caused 150s poll timeouts and hard failures by retrying
        // already-good content. Replaced with fast structural validateCards() check:
        // checks card count, required fields (cardType, title), decision-point has
        // question + ≥2 options, mental-model has ≥3 steps, voiceover ≥30 chars.
        // Valid content returns immediately; broken content gets one repair pass then
        // getFailedCardSequence. Scoring constants removed (INSTRUCTIONAL_MAX, AUDIT_MAX,
        // COMBINED_MAX, PUBLISH_THRESHOLD, AUDIT_MIN_THRESHOLD, bestCards, bestScore,
        // bestInstructionalScore, bestAuditScore, lastAuditResult). CC_VERSION → 11.73.
        // AMD triple-match: generator.js + cc-state.js synced. No DB schema changes.
        upgrade_mod_savepoint(true, 2026033001173, 'contentcreator');
    }

    if ($oldversion < 2026033001174) {
        // v11.74: VOICEOVER CRASH FIX + SPEED OPTIMISATION (ChatGPT-approved).
        // (1) BUG-VO-STARTSWITH: player5.js crashed with "Cannot read properties of undefined
        //     (reading 'startsWith')" when voiceoverUrl was undefined (normal state for
        //     sentinel-stripped or never-generated audio). v11.72 replaced the safe
        //     `=== 'pregenerated'` check with `.startsWith('http')` but did not guard against
        //     undefined. Fixed at both call-sites (preloadVoiceovers line ~1712 and
        //     playVoiceover line ~12050) using typeof guard:
        //     !(typeof section.voiceoverUrl === 'string' && section.voiceoverUrl.startsWith('http'))
        // (2) SPEED: Repair prompt now includes "Fix ONLY the listed structural issues.
        //     Do NOT rewrite existing content." directive — prevents full rewrites on attempt 2,
        //     cutting token usage and eliminating new-error risk.
        // player5.js + prompts.js updated. AMD build/min synced. No DB schema changes.
        upgrade_mod_savepoint(true, 2026033001174, 'contentcreator');
    }

    if ($oldversion < 2026033001175) {
        // v11.75: PROMPT COMPRESSION + CHATGPT 5-FIX HARDENING (ChatGPT-approved production upgrade).
        // (1) GENERATION SYSTEM PROMPTS COMPRESSED ~50-70%: All 4 system prompts (VET, University,
        //     Workplace, PD) rewritten as lean, pattern-based specs. Removed: OBJECTIVE block,
        //     ANTI-DUPLICATION block, LEGAL INTEGRATION RULE block, verbose VOICE/VOICEOVER paragraphs,
        //     per-card instructional prose, redundant icon selection rule. Retained: card schema
        //     (pipe-separated inline spec), domain logic (VET: HLTAID/WHS/trades), condensed icon
        //     vocabulary, all structural constraints required by validator and renderer.
        // (2) USER PROMPTS TRIMMED ~90%: Trailing 6-8 repeated rules block removed from all 4
        //     user prompt builders (VET, Workplace, PD, University). Replaced with a single
        //     "Generate the full 7-card sequence." / "Generate the full 6-card sequence." closing line.
        //     Reduces token cost per request, eliminates hallucinated formatting from redundant rules.
        // (3) CHATGPT 3-FIX HARDENING added to all 4 system prompts:
        //     FIX 1 — FIELDS LOCK: "All fields must be returned exactly as specified. Do not rename,
        //       omit, or reorder fields." Prevents schema drift and frontend rendering failures.
        //     FIX 2 — HARD CARD COUNT: "If fewer or more than N cards are returned, the output is
        //       invalid." Reduces off-by-one errors and repair triggers.
        //     FIX 3 — VOICEOVER GUARD: "voiceoverText must not be empty and must reflect the visible
        //       content." Prevents silent failures and UI playback issues.
        // prompts.js updated. AMD triple-match: prompts.js (3d267446d510267b366c2bb7003e9606).
        // player5.js (618572b7) + cc-state.js (bcf72a8a) unchanged. No DB schema changes.
        upgrade_mod_savepoint(true, 2026033001175, 'contentcreator');
    }

    // v11.76: VERSION BUMP — Routine release increment. No code or AMD changes.
    // No DB schema changes. version.php → 2026033001176.
    if ($oldversion < 2026033001176) {
        upgrade_mod_savepoint(true, 2026033001176, 'contentcreator');
    }

    // v11.77: TWO FIXES.
    // (1) VOICEOVER SENTINEL FIX: Bulk voiceover generation and auto-gen after slide edit
    //     were storing the raw base64 data: URL in section.voiceoverUrl. saveManifestSilent's
    //     stripAudio() immediately converted every data: URL to the 'pregenerated' sentinel
    //     before the manifest was saved — so the URL was NEVER persisted. Every student session
    //     hit the sentinel, triggered on-demand TTS, burned credits, and waited 3–8 seconds per
    //     slide. Fixed in player5.js by calling persistVoiceoverToFileStore() at both sites
    //     (generateVoiceoverBulk and auto-gen after slide edit) instead of setting voiceoverUrl
    //     directly. The HTTPS pluginfile.php URL now survives stripAudio() → DB stores real URL
    //     → students play instantly. Console sentinel warnings downgraded from console.warn to
    //     ccLog (debug-only).
    // (2) INSTRUCTION CARD ICON FIX: The 'One element/topic per content pack' info callout used
    //     a thin stroke-only info circle (outline SVG) at 20 px — the 'i' was invisible at that
    //     size. Replaced with a filled info circle (fill=currentColor) in builder.js across all
    //     4 renderStep2 callout instances (VET, University, Workplace, PD). Icon is now clearly
    //     recognisable as an information indicator.
    // AMD: player5.js (1fe61a4b) × 3, builder.js (3fd2fd0c) × 3.
    // prompts.js (3d267446) + cc-state.js (bcf72a8a) unchanged.
    // No DB schema changes. version.php → 2026033001177.
    if ($oldversion < 2026033001177) {
        upgrade_mod_savepoint(true, 2026033001177, 'contentcreator');
    }

    // v11.78: ELEMENT NUMBERING BUG FIX — selecting Element 2 showed "Element 1"/
    //   "1.1, 1.2" everywhere in topics, manifest title, and player display.
    //   Root cause: suggestMajorTopics() in builder.js filtered tgaData.elements to only
    //   the selected element (e.g., Element 2 → elements[0]), then sent it to the server
    //   without the original index. The server numbered it Element 1 in the AI prompt;
    //   the AI echoed back elementNumber=1, pcNumber="1.1" etc. across all outputs.
    //   Fix (server): suggest-topics endpoint now accepts selectedElementIds[] and uses
    //   selectedElementIds[idx] for element/PC numbering in the AI prompt (routes.ts).
    //   Fix (client): builder.js passes selectedElementIds in the request payload and
    //   applies a belt-and-suspenders correction loop after the API response to remap
    //   elementNumber, id, title, subtopic pcNumber/id/title, and coverageSummary.
    //   AMD: builder.js updated, cc-state.js CC_VERSION → '11.78'. No DB schema changes.
    //   version.php → 2026033001178.
    if ($oldversion < 2026033001178) {
        upgrade_mod_savepoint(true, 2026033001178, 'contentcreator');
    }

    // v11.79: CRITICAL FIX — validateCards() voiceover field name wrong since v11.73.
    //   validateCards() checked card.voiceover (undefined after normalisation) instead of
    //   card.voiceoverText (the canonical field). normalizeCardSchema() at line ~1019 maps
    //   any card.voiceover alias → card.voiceoverText then deletes card.voiceover, so the
    //   check always returned undefined — marking every single card as "missing voiceover".
    //   This caused 100% of content generations to fail the v11.73 validity gate and
    //   trigger an unnecessary repair pass (attempt 2). When that repair timed out (OpenAI
    //   API > 64s), users saw the "Regenerate Failed" loop for every generation attempt.
    //   Fix: validateCards() now reads `card.voiceoverText || card.voiceover` — picks up
    //   the real field after normalisation. Valid content passes immediately (1 AI call),
    //   only genuinely broken content triggers the repair path. CC_VERSION → '11.79'.
    //   AMD: generator.js updated, cc-state.js CC_VERSION bumped. No DB schema changes.
    //   version.php → 2026033001179.
    if ($oldversion < 2026033001179) {
        upgrade_mod_savepoint(true, 2026033001179, 'contentcreator');
    }

    // v11.80: ICON SYSTEM OVERHAUL — Deterministic semantic icon matching.
    //   Three changes: (1) prompts.js — all 3 route system prompts now provide
    //   meaning-based icon definitions and card-type consistency rules. (2) cc-icons.js —
    //   getContextualSlideIcon() rewritten to 8-tier priority regex (Risk > Comm > People >
    //   Process > Thinking > Time > Business > Equipment), returns null on no match.
    //   GENERIC_AI_ICONS blacklist reduced from 16 → 3 (sparkles/star/check-circle).
    //   CARD_ICON_STRATEGY added for per-card-type fallback pools. resolveScenePartIcon()
    //   rewritten: semantic → card-type pool → AI icon → position. (3) cc-card-slots.js —
    //   all scenePart render calls now pass cardType. No DB schema changes.
    //   version.php → 2026033001180.
    if ($oldversion < 2026033001180) {
        upgrade_mod_savepoint(true, 2026033001180, 'contentcreator');
    }

    //   version.php → 2026033001181.
    if ($oldversion < 2026033001181) {
        upgrade_mod_savepoint(true, 2026033001181, 'contentcreator');
    }

    //   version.php → 2026033001182.
    if ($oldversion < 2026033001182) {
        upgrade_mod_savepoint(true, 2026033001182, 'contentcreator');
    }

    //   version.php → 2026033001183.
    if ($oldversion < 2026033001183) {
        upgrade_mod_savepoint(true, 2026033001183, 'contentcreator');
    }

    //   version.php → 2026033001184.
    if ($oldversion < 2026033001184) {
        upgrade_mod_savepoint(true, 2026033001184, 'contentcreator');
    }

    //   version.php → 2026033001185.
    if ($oldversion < 2026033001185) {
        upgrade_mod_savepoint(true, 2026033001185, 'contentcreator');
    }

    //   version.php → 2026033001186.
    //   v11.86: ChatGPT 5-fix voiceover mandate — allVoiceoversComplete() hard gate,
    //   manifest.voiceoversComplete global flag, force retry for non-complete teacher
    //   sections, completion-only final save, student hard-block with button disable.
    //   No DB schema changes.
    if ($oldversion < 2026033001186) {
        upgrade_mod_savepoint(true, 2026033001186, 'contentcreator');
    }

    //   version.php → 2026033001187.
    //   v11.87: IDEMPOTENCY FIX — voiceoverStatus='complete' now set ONLY inside
    //   persistVoiceoverToFileStore() success callback, after the HTTPS URL is confirmed
    //   stored in the Moodle file store. Previously status was set immediately after TTS
    //   success (before persist), meaning a failed file-store write left the section with
    //   status='complete' but no URL in the DB. On next teacher load FIX 3 (v11.86) would
    //   not regen it (force-regen only fires when URL exists but status!='complete'), yet
    //   allVoiceoversComplete() would return false (no HTTPS URL) keeping voiceoversComplete=false
    //   permanently. Fix: status stays 'pending' until persist confirms the URL. If persist
    //   fails, status remains 'pending' and FIX 3 forces full regeneration on the next teacher
    //   load. For the dedup-guard path (URL already persisted), status is set 'complete'
    //   immediately inline (safe — no new write needed). player5.js updated.
    //   AMD triple-match: player5.js (1b58bd51), cc-state.js (d93ed18b). No DB schema changes.
    if ($oldversion < 2026033001187) {
        upgrade_mod_savepoint(true, 2026033001187, 'contentcreator');
    }

    // v11.88: TTS timeout raised from 25s to 60s in player5.js (both preload AbortController
    //   and on-demand AbortController). 25s was too aggressive — OpenAI TTS on longer slides
    //   legitimately takes up to 45s, causing every voiceover call to timeout on the first
    //   attempt, exhaust all 3 retries, and leave manifest.voiceoversComplete=false.
    //   Also: Structure Validation Results badge changed from "Repaired" to "Valid" (builder.js).
    //   AMD triple-match: player5.js and builder.js synced. No DB schema changes.
    if ($oldversion < 2026033001188) {
        upgrade_mod_savepoint(true, 2026033001188, 'contentcreator');
    }

    if ($oldversion < 2026033001189) {
        // v11.89: Voiceover playback regression fix (pre-v11.86 content).
        // Two JS changes in player5.js and cc-state.js — no DB schema changes.
        // (1) preloadOne HAS_URL skip now sets voiceoverStatus='complete' so
        //     allVoiceoversComplete() counts sections with valid HTTPS URLs correctly.
        // (2) checkComplete sets manifest.voiceoversComplete in-memory for ALL users,
        //     not just teachers — students can play immediately; teachers persist it.
        upgrade_mod_savepoint(true, 2026033001189, 'contentcreator');
    }

    if ($oldversion < 2026033001190) {
        // v11.90: VOICEOVER LIFECYCLE FIX — Two-part fix in player5.js init().
        // BUG 1: `if (hasExistingContent && !cachedState)` guard skipped preloadVoiceovers()
        //   for ALL returning students (cachedState is almost always present), so
        //   manifest.voiceoversComplete was never set — button disabled forever.
        // BUG 2: render() fires synchronously before async preload completes — even on
        //   first visit the button was disabled and never re-enabled.
        // FIX 1: Condition changed to `if (hasExistingContent)` — preload always runs.
        // FIX 2: Post-preload callback re-enables .cc5-voiceover-btn-large[disabled]
        //   without a full re-render. CC_VERSION bumped to 11.90 in cc-state.js.
        // AMD triple-match: player5.js MD5 89c131bbecbd15d02b1b10ab7d405f32.
        // No DB schema changes.
        upgrade_mod_savepoint(true, 2026033001190, 'contentcreator');
    }

    if ($oldversion < 2026033001191) {
        // v11.91: ICON PICKER — Visual icon selection in Edit Slide modal.
        // All 8 icon text inputs (across conceptItems, sceneParts, conceptInsights,
        // mental-model steps) replaced with renderIconPickerInput() which renders:
        // live SVG preview square + text input + "Browse" button opening a searchable
        // ~115-icon grid. Selecting an icon fills the field and closes the picker.
        // CSS added to player5.css. AMD triple-match: player5.js MD5 — icon picker
        // visual grid. CC_VERSION → 11.91. No DB schema changes.
        upgrade_mod_savepoint(true, 2026033001191, 'contentcreator');
    }

    if ($oldversion < 2026033001920) {
        // v11.92: VOICEOVER TIMEOUT FIX — Two-part fix for voiceover consistently
        // failing with TIMEOUT 60s on every attempt.
        // FIX 1 (PHP): ajax.php generate_voice now calls @set_time_limit(0) before
        //   the TTS API call — same fix already applied to generate_slide (v11.44).
        //   PHP-FPM default max_execution_time (30-60s) was killing the script
        //   mid-cURL before Google Chirp 3 HD audio returned, causing silent failure.
        // FIX 2 (JS): Both AbortController timeouts in player5.js (preload and
        //   on-demand) raised from 60s to 120s. Google Chirp 3 HD on a 7-card
        //   voiceover (multiple 4800-byte chunks + WAV concat + OGG encode) can
        //   legitimately take 60-90s — 60s was always too short.
        // AMD triple-match: player5.js MD5 4faff7cdae5e9515f07d5fa7b21c3aae,
        //   cc-state.js MD5 9e14e858ee55a3ff52cdb68a9e9c61ba. No DB schema changes.
        upgrade_mod_savepoint(true, 2026033001920, 'contentcreator');
    }

    if ($oldversion < 2026033001930) {
        // v11.93: TTS TEXT LIMIT — Reduced voiceover character cap from 12000 to 4000.
        // At 12000 chars, Google Chirp 3 HD required 3–5 sequential TTS chunks + WAV
        // concat + OGG encode, taking 60–90s total — consistently exceeding the 60s
        // (v11.92: 120s) JS AbortController. 4000 chars (~600 words) covers a full
        // 7-card voiceover comfortably (7 cards × ~70 words × 5 chars/word ≈ 2450 chars).
        // TTS time drops to 20–30s, well inside the 120s JS timeout and PHP cURL 180s
        // ceiling. Sentence boundary detection updated (min boundary lowered 4000→1500
        // to match the new limit). PHP-only change — no JS or DB schema changes.
        // ajax.php only. No AMD changes. version.php → 2026033001930.
        upgrade_mod_savepoint(true, 2026033001930, 'contentcreator');
    }

    if ($oldversion < 2026033001940) {
        // v11.94: CHALLENGE MODE TOP PADDING — Added 16px top padding to the
        // .cc5-decision-challenge card wrapper (was padding: 0 24px 24px, now
        // 16px 24px 24px). The "CHALLENGE MODE" badge was flush against the
        // orange top border with no breathing room. CSS-only change — player5.css
        // only. No PHP, JS, AMD, or DB schema changes. version.php → 2026033001940.
        upgrade_mod_savepoint(true, 2026033001940, 'contentcreator');
    }

    if ($oldversion < 2026033001950) {
        // v11.95: FLIP CARD GROW FIX — Flip cards (insight/consequence/outcome
        // categories) were showing vertical scrollbars when text exceeded the
        // v11.37 fixed 220px height. Three CSS-only changes in player5.css:
        // (1) .cc5-flip-grid: grid-auto-rows: 220px → minmax(220px, auto) — rows
        // start at 220px minimum but grow to fit content; all cards in a row remain
        // the same height (grid takes the tallest). (2) .cc5-flip-card: height:220px
        // → height:auto; min-height:220px. (3) .cc5-flip-inner: height:220px →
        // height:100%; min-height:220px (per CSS Grid spec, height:100% on a grid item
        // is treated as height:auto during intrinsic sizing — no circular dependency).
        // (4) .cc5-flip-front / .cc5-flip-back: removed overflow-y:auto — changed to
        // overflow:visible so content is never clipped. version.php → 2026033001950.
        upgrade_mod_savepoint(true, 2026033001950, 'contentcreator');
    }

    if ($oldversion < 2026033001960) {
        // v11.96: VERSION BUMP — Maintenance release. All 6 sync locations updated
        // to 11.96 / 2026033001960. No code, CSS, JS, AMD, or DB schema changes.
        // version.php → 2026033001960.
        upgrade_mod_savepoint(true, 2026033001960, 'contentcreator');
    }

    if ($oldversion < 2026033001970) {
        // v11.97: ICON PICKER SVG VISIBILITY FIX — CSS-only change to styles/player5.css.
        // The icon picker overlay (.cc5-icon-picker-item grid) was showing icon names but
        // no visible SVG icons. Root cause: all icon SVGs use stroke="currentColor"; Moodle
        // global button CSS injects color:white on <button> elements, so the strokes rendered
        // white-on-white (invisible against the popup's white background).
        // Fix: added color:#222 !important to .cc5-ipi-item-svg svg — explicitly overrides
        // Moodle's cascade so currentColor resolves to a dark, visible stroke in light mode.
        // Also added:
        //   .cc5-icon-picker-item.cc5-ipi-selected .cc5-ipi-item-svg svg { color:#fff !important }
        //   — keeps the selected item's icon white-on-blue.
        //   body[data-bs-theme="dark"] / body.dark variants — light grey (#e5e7eb) for dark mode.
        // CSS-only. No PHP, JS, AMD, or DB schema changes.
        // version.php → 2026033001970.
        upgrade_mod_savepoint(true, 2026033001970, 'contentcreator');
    }

    if ($oldversion < 2026033001980) {
        // v11.98: ICON SAVE BUG FIX — Three bugs where icon changes in the Edit Slide modal
        // were silently discarded on save.
        // (1) Single-section mental-model steps: icon picker not rendered, icon stripped on save.
        //     Fix: renderIconPickerInput added to step row; stepIcon read in saveSlideEdit loop.
        // (2) Multi-card mistakes: _origMItems read from _cu.items (always []) instead of
        //     section.cards[_ci].items. Fix: reads from original card data.
        // (3) Single-section mental-model: cardData.steps now includes icon field so in-memory
        //     manifest update carries new icon through to self.render().
        // player5.js only. No PHP or DB schema changes.
        // version.php → 2026033001980.
        upgrade_mod_savepoint(true, 2026033001980, 'contentcreator');
    }

    if ($oldversion < 2026033001990) {
        // v11.99: AMD TRIPLE-MATCH SYNC — v11.98 shipped with amd/src/player5.js and
        // amd/build/ out of sync. The v11.98 icon-save bug fixes were applied only to
        // amd/src/player5.js; amd/build/player5.js and amd/build/player5.min.js were
        // never updated from v11.97. Moodle's AMD loader serves build/ in production,
        // so all three v11.98 JS fixes were effectively dead code on every deployed site.
        // Fix: amd/src/player5.js copied verbatim to amd/build/player5.js and
        // amd/build/player5.min.js. AMD triple-match MD5: b2d40b94c2e850cdaed2b6f3f60b8722.
        // No PHP, CSS, or DB schema changes. version.php → 2026033001990.
        upgrade_mod_savepoint(true, 2026033001990, 'contentcreator');
    }

    if ($oldversion < 2026033002000) {
        // v12.00: ARROW DOT-POINTS (CARD 2 ONLY) — Concept-explainer (card 2) uses a
        // long paragraph text editor in Edit Slide so its insight icons are not
        // individually choosable. These now show a chevron-right arrow instead of
        // auto-assigned contextual icons. Applies to concept-explainer conceptInsights
        // and fallback insight chips only. Other card types retain their icons (those
        // cards have the icon picker in Edit Slide). CSS: springy translateX(4px) hover
        // animation + stroke-width:2.5 for .cc5-ci-icon svg and .cc5-insight-icon svg.
        // cc-card-slots.js (2 icon sites) + player5.css. AMD triple-match MD5:
        // c9fbd22a703d6072d94759b0e4be9336. No PHP or DB changes. version.php → 2026033002000.
        upgrade_mod_savepoint(true, 2026033002000, 'contentcreator');
    }

    if ($oldversion < 2026033002001) {
        // v12.01: SAVEPOINT ORDER HOTFIX — v12.00 shipped with savepoint block
        // 2026033002000 placed before 2026033001990 in db/upgrade.php. Moodle
        // processes blocks top-to-bottom; hitting a lower numeric after a higher
        // one throws "cannotdowngrade". Fix: reordered to strict ascending sequence
        // ...1980 → 1990 → 2000 → 2026033002001. No JS, CSS, or DB schema changes.
        // version.php → 2026033002001.
        upgrade_mod_savepoint(true, 2026033002001, 'contentcreator');
    }

    if ($oldversion < 2026033002002) {
        // v12.02: MISTAKES CARD ICON PICKER — Edit Slide modal for the mistakes card
        // (card 5 "Watch Out For") now includes an icon picker on each mistake item row.
        // Previously the icon was silently carried over from the original manifest via
        // _origIcon/_oIcon fallback and could not be changed by the teacher. Fix:
        // renderIconPickerInput added to single-section edit block, multi-card edit block,
        // and the dynamic "Add Mistake" row in player5.js. saveSlideEdit now reads
        // .cc5-edit-mistake-icon value directly in both save paths. AMD triple-match MD5:
        // e5e3e0685590acabf773aa8b1ce6aabc. No PHP or DB changes. version.php → 2026033002002.
        upgrade_mod_savepoint(true, 2026033002002, 'contentcreator');
    }

    if ($oldversion < 2026033002003) {
        // v12.03: SCENARIO CARDS ICON SAVE FIX — hook-scenario (card 1) and applied-scenario
        // (card 4) icons were not saveable in the Edit Slide modal. Root cause: the
        // single-section edit modal always showed the legacy flat beats editor regardless
        // of whether the section had a structured sceneParts[] array with icons. The save
        // path only read flat beat textareas and wrote cardData.content, discarding any
        // sceneParts[] entirely. Fix: (1) render — modal now checks section.sceneParts &&
        // section.sceneParts.length first; if true, shows structured scene-parts editor
        // with icon pickers (same as multi-card path); else falls back to legacy beats
        // editor. (2) save — checks for cc5-edit-scene-part-item rows first, collects
        // {icon, title, text} into cardData.sceneParts; otherwise falls back to flat beats
        // join into cardData.content. player5.js only. AMD triple-match MD5:
        // bc9c72dbb99b0e05234ee711152ee5f4. No PHP or DB changes. version.php → 2026033002003.
        upgrade_mod_savepoint(true, 2026033002003, 'contentcreator');
    }

    if ($oldversion < 2026033002004) {
        // v12.04: SCENE-PART ICON HONOUR FIX — teacher-set icons on hook-scenario (card 1)
        // and applied-scenario (card 4) were visually ignored on every render even though
        // v12.03 correctly saved them to the DB. Root cause: resolveScenePartIcon() in
        // cc-icons.js evaluated the stored part.icon only at step 3, after a strong
        // semantic/contextual match on the part title+text (step 1) and a card-type icon
        // pool scan (step 2). Step 1 almost always succeeds, so the teacher's chosen icon
        // was thrown away every time the card re-rendered. Fix: added step 0 — if aiIcon
        // (the stored/teacher-selected icon name) is a valid Lucide icon it is returned
        // immediately before any semantic analysis or pool cycling runs. Steps 1-5 still
        // provide fallbacks for cards with no stored icon. cc-icons.js only. AMD triple-
        // match MD5: 1bd0a0690e26c44e7db6ceb9dd82c14d. No PHP or DB changes.
        // version.php → 2026033002004.
        upgrade_mod_savepoint(true, 2026033002004, 'contentcreator');
    }

    if ($oldversion < 2026033002005) {
        // v12.05: SCENARIO CARD DEFAULT ICON FIX — CARD_ICON_STRATEGY fallback pools in
        // cc-icons.js used nonsensical defaults for hook-scenario and applied-scenario.
        // hook-scenario parts "What Happened" and "The Pressure" defaulted to zap
        // (lightning bolt) and alert-triangle (danger warning). applied-scenario parts
        // "Back on the Job", "The New Challenge", "The Decision Moment", and "The Right
        // Move" defaulted to map-pin, users, wrench, and alert-triangle respectively.
        // Replaced with semantically appropriate icons:
        //   hook-scenario:    map-pin / users / message-circle / flame
        //   applied-scenario: briefcase / target / brain / check-circle
        // These fallback pools only fire for parts with no stored icon (new AI-generated
        // content or legacy sections). Teacher-set icons (step 0 since v12.04) are
        // always honoured first. cc-icons.js only. AMD triple-match MD5:
        // 42285302c80ad3be326a085b85d4ff22. No PHP or DB changes.
        // version.php → 2026033002005.
        upgrade_mod_savepoint(true, 2026033002005, 'contentcreator');
    }

    if ($oldversion < 2026033002006) {
        // v12.06: SCENARIO CARD ICON — STRICT POSITIONAL DEFAULT — removed semantic
        // content analysis from the fallback path for cards with a defined icon pool.
        // resolveScenePartIcon() previously ran a regex keyword scan (step 1) before
        // the card-type pool check (step 2), so titles like "The Setting" or "The New
        // Challenge" would match keywords and override the pool, producing different
        // icons on different modules despite the pool being carefully chosen. Fix: step 1
        // now does a strict positional lookup (part 0 → pool[0], part 1 → pool[1], etc.)
        // with no content analysis when a card type has a defined pool. Semantic analysis
        // is preserved as step 2 for card types with no pool entry. Result: hook-scenario
        // always shows map-pin / users / message-circle / flame; applied-scenario always
        // shows briefcase / target / brain / check-circle unless teacher overrides.
        // cc-icons.js only. AMD triple-match MD5: 4e4779c29175a5f8715a0cf90a9f50ed.
        // No PHP or DB changes. version.php → 2026033002006.
        upgrade_mod_savepoint(true, 2026033002006, 'contentcreator');
    }

    if ($oldversion < 2026033002007) {
        // v12.07: EDIT MODAL ICON PRE-POPULATION FIX — icon pickers in the Edit Slide
        // modal previously showed an empty field for any part with no explicitly stored
        // icon (item.icon === ''). The rendered card showed the pool-default icon (step 1
        // of resolveScenePartIcon) while the modal showed nothing, creating a visible
        // mismatch. Teachers who saved text edits without touching the icon picker would
        // write icon:'' back to the DB, then wonder why the displayed icon appeared to
        // change or not save. Fix: all four renderIconPickerInput call-sites now resolve
        // the display icon first via resolveScenePartIcon('', title, text, idx, cardType,
        // new Set()) and pass the result as currentVal. Locations patched: (1) mistakes
        // single-section, (2) mistakes multi-card accordion, (3) hook/applied-scenario
        // single-section sceneParts, (4) hook/applied-scenario multi-card sceneParts.
        // Side-effect: saving without changing an icon now writes the resolved default
        // explicitly, so step 0 honours it on all future renders. player5.js only.
        // AMD triple-match MD5: b9f0897bf75e35fd6d03e5ecb8a01470.
        // No PHP or DB changes. version.php → 2026033002007.
        upgrade_mod_savepoint(true, 2026033002007, 'contentcreator');
    }

    if ($oldversion < 2026033100001) {
        // v12.08: FOCUS RETURN VOICEOVER RESUME FIX — when a student navigated away from the
        // browser tab, the focus-lost handler was nullifying currentAudio (losing the playback
        // position), resetting voiceoverPlayed=false and slideTimeRemaining=slideDuration, then
        // calling render() on modal dismiss, which restarted the slide and voiceover from scratch.
        // Fix: handleFocusLost() now saves pausedAudioTime=currentAudio.currentTime and only pauses
        // (does not null) currentAudio. voiceoverPlayed and slideTimeRemaining are preserved. The
        // modal dismiss now calls resumeAfterFocusReturn() instead of render() — this seeks audio
        // to pausedAudioTime, resumes playback, and restarts the countdown timer from the saved
        // remaining time. Modal title changed to "Slide Paused", message updated accordingly.
        // player5.min.js only. No PHP or DB changes. version.php → 2026033100001.
        upgrade_mod_savepoint(true, 2026033100001, 'contentcreator');
    }

    if ($oldversion < 2026033100900) {
        // v12.09: TWO FIXES — (1) PANEL TITLE: "Who's Here" renamed to "The Details" across
        //   all rendering and generation paths. "Who's Here" was ambiguous and confusing; "The
        //   Details" clearly describes the panel's purpose (the people and context of the scene).
        //   Updated in: player5.js _hookTitles fallback synthesis array (line 13371);
        //   generator.js _hookTitles97 normalisation array (line 1062);
        //   prompts/chatgpt-prompt-vocational.txt panel label example. New AI-generated content
        //   and any legacy content synthesised from flat text will both show "The Details".
        //   (2) VOICEOVER AUTO-REGEN ON EDIT: Previously, editing slide text and clicking Save
        //   only regenerated the voiceover when the "Regenerate voiceover" checkbox was manually
        //   ticked. If the checkbox was left unchecked, students continued to hear the old audio
        //   even after the text had changed. Fix: saveSlideEdit() now computes the new voiceover
        //   text hash immediately after applying all field updates to sec, and compares it against
        //   the stored sec.voiceoverTextHash. If they differ, regenerateVoiceover is automatically
        //   set to true — causing sec.voiceoverUrl and sec.voiceoverTextHash to be deleted and
        //   fresh TTS generation to fire. The checkbox is still respected; this logic only engages
        //   when the checkbox is unchecked and a stored hash exists. player5.js and player5.min.js.
        //   generator.js and generator.min.js. AMD player5 MD5: 1fa4ee4fe612c50386710d6d7ece17ba.
        //   AMD generator MD5: f63bb62dadc690482a85ef45abf21bed. No PHP or DB changes.
        //   version.php → 2026033100900.
        upgrade_mod_savepoint(true, 2026033100900, 'contentcreator');
    }

    // v12.10: UI — Removed the contextual icon and its rounded background shape from the slide
    //   header bar. The <div class="cc5-slide-icon"> element (which rendered a contextual SVG icon
    //   inside a rounded background shape beside the slide title) was removed from buildSlideHtml()
    //   in player5.js. The slide title now stands alone in the header. JS-only change to
    //   player5.js; all three AMD files updated (src, build/player5.js, build/player5.min.js).
    //   No PHP or DB changes. version.php → 2026033101000.
    // v12.11: VERSION BUMP — Completes the v12.10 release. The v12.10 patch shipped without an
    //   upgrade.php savepoint (Location 2 of the 6-location sync rule was missed). No code
    //   changes from v12.10. No PHP or DB changes. version.php → 2026033101100.
    if ($oldversion < 2026033101100) {
        upgrade_mod_savepoint(true, 2026033101100, 'contentcreator');
    }

    // v12.12: VERSION BUMP — Routine release following 6-location sync process. No code changes.
    //   No PHP or DB schema changes. version.php → 2026033101200.
    if ($oldversion < 2026033101200) {
        upgrade_mod_savepoint(true, 2026033101200, 'contentcreator');
    }

    // v12.13: VOICEOVER BUG FIX — WAITING loop extended from 30s to 90s timeout.
    //   Root cause: preloadVoiceovers sets voiceoverLoading[id]=true and makes a TTS fetch
    //   with a 120s abort ceiling (v11.92). The old 30s playVoiceover WAITING loop fired
    //   before TTS could complete for long Chirp 3 HD voiceovers, producing "Voiceover timed
    //   out" on first play for teachers with canEdit=true. Fix: timeout raised to 90s and
    //   polling interval now also checks section.voiceoverUrl (set by persistVoiceoverToFileStore)
    //   so audio plays the moment a URL is available even if sectionId key mismatches cache key.
    //   JS-only change — all 3 AMD files updated (src, build/player5.js, build/player5.min.js).
    //   No PHP or DB schema changes. version.php → 2026033101300.
    if ($oldversion < 2026033101300) {
        upgrade_mod_savepoint(true, 2026033101300, 'contentcreator');
    }

    // v12.14: VERSION BUMP — Routine release following all 6-location sync rules.
    //   No code changes. No PHP or DB schema changes. version.php → 2026033101400.
    if ($oldversion < 2026033101400) {
        upgrade_mod_savepoint(true, 2026033101400, 'contentcreator');
    }

    // v12.15: FIX "Launch Learning Module" redirect loop — builder.js click handler
    //   was calling window.location.reload() which kept ?edit=1 in the URL, causing
    //   PHP view.php to always re-serve the builder. Fixed to navigate to ?id=<cmid>
    //   (no edit param) so PHP serves the player when content is locked.
    //   builder.js + amd/build/builder.min.js updated. version.php → 2026033101500.
    if ($oldversion < 2026033101500) {
        upgrade_mod_savepoint(true, 2026033101500, 'contentcreator');
    }

    // v12.16: FIX voiceover blocked for teachers when Moodle edit mode is OFF.
    //   Root cause: canEdit = $hasCapability && !empty($USER->editing) — false when
    //   edit mode is off. All 4 voiceover guard sites used !editMode && !canEdit as
    //   the "student" test, accidentally blocking teachers too. Fix: view.php now
    //   passes isTeacher = (bool)$hasCapability (capability only, no edit mode gate).
    //   player5.js stores this.isTeacher and adds && !this.isTeacher to all 4 guards:
    //   preloadVoiceovers sentinel skip, preload API-call gate, playVoiceover global
    //   completion gate, and playVoiceover on-demand generation gate.
    //   view.php + amd/src/player5.js + amd/build files updated. version.php → 2026033101600.
    if ($oldversion < 2026033101600) {
        upgrade_mod_savepoint(true, 2026033101600, 'contentcreator');
    }

    // v12.17: Z-INDEX STACKING FIX — "Slide Paused" and all other player modal
    //   overlays were being appended to #contentcreator-app. When the format_aicourse
    //   hero banner (.aicourse-hero-sticky-wrap) had z-index:100, its stacking context
    //   sat above the player container, causing modals to appear behind the banner.
    //   Fix: all $(document.body).append() calls in player5.js moved from
    //   #contentcreator-app to document.body, removing them from any ancestor stacking
    //   context. Companion fix in format_aicourse v1.7.30 lowers hero z-index 100→1.
    //   player5.js only — no PHP or DB schema changes. version.php → 2026033101700.
    if ($oldversion < 2026033101700) {
        upgrade_mod_savepoint(true, 2026033101700, 'contentcreator');
    }

    // v12.18: VERSION BUMP — Routine release following all 6-location sync rules.
    //   Completes the v12.17 release: adds the missing pluginConfig.ts changelog
    //   entry (v12.17 was shipped without prepending a changelog[] item at index 0)
    //   and corrects BUILD_INFO.json field layout (amd_src_md5 now in its own field,
    //   verification is a snake_case tag). No code, JS, CSS, or DB schema changes.
    //   version.php → 2026033101800.
    if ($oldversion < 2026033101800) {
        upgrade_mod_savepoint(true, 2026033101800, 'contentcreator');
    }

    // v12.19: VOICEOVER CRITICAL FIX — Two bugs corrected in player5.js:
    //
    //   BUG 1 (CRITICAL): isTeacher never reached the Player constructor.
    //   view.php correctly passes isTeacher=(bool)$hasCapability since v12.16,
    //   but the Player constructor call at the bottom of player5.js omitted
    //   isTeacher: config.isTeacher entirely. So this.isTeacher was ALWAYS false,
    //   making all 8 guard conditions (!this.isTeacher) dead code. Result: teachers
    //   and site admins could NOT play voiceovers when Moodle edit mode was OFF.
    //   Fix: added isTeacher: config.isTeacher || false to the Player constructor.
    //
    //   BUG 2: 30s/90s WAITING delay when teacher clicks Play in edit mode.
    //   When _teacherNeedsRegen fires (section has HTTPS URL but voiceoverStatus
    //   !== 'complete'), the old URL was deleted before TTS regeneration started.
    //   If the teacher clicked Play before TTS completed, the WAITING loop could
    //   not find any URL and sat for up to 90s. Fix: save the existing URL as
    //   section._preloadFallbackUrl before deleting it; the WAITING loop now checks
    //   voiceoverUrl || _preloadFallbackUrl so old audio plays instantly while the
    //   new TTS generates in the background.
    //
    //   BUG 3: TTS API credentials not passed for isTeacher view-mode teachers.
    //   view.php only fetched siteId/apiKey when canEditSlides=true. Teachers with
    //   edit mode OFF received empty credentials, causing all TTS calls unlocked by
    //   Fix 1 to fail with 401. Fix: credential fetch gate changed from
    //   canEditSlides to hasCapability so all teachers (edit mode ON or OFF) get
    //   the credentials needed to generate voiceovers. No DB schema changes.
    //   player5.js AMD triple-match MD5: ebaf330b68abb1a0995dcfdfb53491c6.
    //   version.php → 2026033101900.
    if ($oldversion < 2026033101900) {
        upgrade_mod_savepoint(true, 2026033101900, 'contentcreator');
    }

    // v12.20: VERSION BUMP — Routine release following all 6-location sync rules.
    //   Consolidation release after the v12.19 voiceover triple-fix (three critical
    //   bugs fixed: isTeacher constructor wire, _preloadFallbackUrl delay, and
    //   credential gate). No code, JS, CSS, or DB schema changes in this release.
    //   version.php → 2026033102000.
    if ($oldversion < 2026033102000) {
        upgrade_mod_savepoint(true, 2026033102000, 'contentcreator');
    }

    // v12.21: BUG FIX (x1) + LOG FIX (x2) + VERSION STRING FIX (x1):
    //   BUG: Wait-poll timeout (90s) was shorter than the preload AbortController (120s).
    //   Any TTS call taking 91-119s caused the wait-poll to give up with "Voiceover timed
    //   out. Please try again." BEFORE the preload could complete. Raised wait-poll from
    //   90s to 150s (30s beyond the 120s preload abort) so the poll always outlasts TTS.
    //   LOG FIX 1: Preload abort log string was still "TIMEOUT 60s" (stale — abort was
    //   raised to 120s in v11.92 but the console.error string was never updated). Fixed to
    //   "TIMEOUT 120s" to match the actual AbortController value.
    //   LOG FIX 2: On-demand abort log string also showed "TIMEOUT 60s" — same stale string.
    //   Fixed to "TIMEOUT 120s".
    //   VERSION STRING: CC_VERSION in cc-state.js updated from '11.92' to '12.21' so all
    //   voiceover console logs (WAITING, TIMEOUT, PRELOAD OK etc) reflect the current
    //   plugin version instead of the v11.92 label they showed since the AMD refactor.
    //   Files: amd/src/player5.js, amd/build/player5.js, amd/build/player5.min.js,
    //          amd/src/cc-state.js, amd/build/cc-state.js, amd/build/cc-state.min.js.
    //   player5.js AMD triple-match MD5: c2471a5ce1fad80aef54a885b032a34a.
    //   cc-state.js AMD triple-match MD5: 7a31d7508f5ce6d197398dbf6de57be7.
    //   No PHP or DB schema changes. version.php → 2026033102100.
    if ($oldversion < 2026033102100) {
        upgrade_mod_savepoint(true, 2026033102100, 'contentcreator');
    }

    // v12.22: VOICEOVER COMPETENCY-SUMMARY FALLBACK FIX + DECISION-POINT WORD-FLOOR EXCLUSION.
    //   BUG-VO-COMPETENCY-FALLBACK (cc-state.js buildVoiceoverText): competency-summary branch
    //   unconditionally pushed "Now, complete the activity below." before the outer
    //   _7parts.length <= 1 fallback check, making length = 2 and bypassing card.voiceoverText
    //   for sections where goodItems and badItems are both absent (common in PD/non-VET courses
    //   built from the ChatGPT template). Card 6 produced only the heading + CTA (~3s audio)
    //   instead of full narration, making voiceover appear to stop at card 4-5.
    //   Fix: check _7parts.length <= 1 && card.voiceoverText BEFORE the CTA push.
    //   BUG-VO-DP-WORDFLOOR (routes.ts server): ccCheckWordFloors applied the 60-word minimum
    //   to decision-point cards, which intentionally have empty voiceoverText (buildVoiceoverText
    //   explicitly clears _7parts for decision-point). Triggered spurious repair passes visible
    //   as 0w→38w→0w oscillation in server logs. Fix: exclude decision-point from the check.
    //   player5.js patchMissingCardVoiceoverTexts: removed mirrored CTA push for
    //   competency-summary (previously included to mirror old unconditional cc-state.js CTA).
    //   cc-state.js now handles the CTA exclusively, preventing double "Now, complete..." when
    //   the new voiceoverText fallback path uses bulk-generated (patched) card content.
    //   Files: amd/src/cc-state.js, amd/build/cc-state.js, amd/build/cc-state.min.js,
    //          amd/src/player5.js, amd/build/player5.js, amd/build/player5.min.js.
    //   cc-state.js AMD triple-match MD5: e472b3e3b74f3eeadc1e43417e3ca584.
    //   player5.js AMD triple-match MD5: 4595ef7323dd7e055576c7abb858e89c.
    //   No PHP or DB schema changes. version.php → 2026033102200.
    if ($oldversion < 2026033102200) {
        upgrade_mod_savepoint(true, 2026033102200, 'contentcreator');
    }

    // v12.23: UPGRADE FIX — Corrected upgrade.php savepoint ordering. v12.20 block
    //   (2026033102000) was mistakenly inserted after v12.22 (2026033102200) instead of
    //   before v12.21 (2026033102100). Sites upgrading from v12.19 or earlier would hit
    //   the 2026033102200 savepoint first, then attempt to set 2026033102000, triggering
    //   a "Cannot downgrade" error at upgrade line 1268. Fixed by moving the v12.20 block
    //   to its correct position (after v12.19, before v12.21). No code, JS, CSS, or DB
    //   schema changes. version.php → 2026040100200.
    if ($oldversion < 2026040100200) {
        upgrade_mod_savepoint(true, 2026040100200, 'contentcreator');
    }

    if ($oldversion < 2026040100201) {
        // v12.24: VERSION BUMP — Fixed two stale AMD CC_VERSION constants:
        //   (1) cc-state.js: CC_VERSION '12.22' → '12.24' (authoritative source for
        //       builder.js and player5.js which pull via CcState.CC_VERSION).
        //   (2) generator.js: CC_VERSION '11.73' → '12.24' (independent constant
        //       used for generator-specific console debug log prefixes).
        //   (3) generator.js: hardcoded string 'v11.73 — VALIDITY GATE...' updated
        //       to 'v12.24'. (4) builder.js AMD build trio synced (was out of sync
        //       with src — build/builder.js and build/builder.min.js did not match src).
        //   AMD trios verified: cc-state.js MD5 bca870dd1357e8a389f57ec41fdb9e49,
        //   generator.js MD5 19d0acb7839c8928a513617f66c5469e,
        //   builder.js MD5 dcc658489471cf9ff65b9c2a3027f252.
        //   No PHP or DB schema changes. version.php → 2026040100201.
        upgrade_mod_savepoint(true, 2026040100201, 'contentcreator');
    }


    if ($oldversion < 2026040100225) {
        // v12.25: THREE FIXES.
        // (1) CARD VOICEOVER PRIORITY: buildVoiceoverText in cc-state.js ignored
        //     card.voiceoverText for 7-card sections when structural fields (sceneParts,
        //     conceptInsights, steps etc.) were non-empty. Teachers editing the "Voiceover
        //     Script" textarea in the Edit Slide modal saw their text saved to DB but the
        //     TTS hash check compared structural content (unchanged) → hash matched →
        //     no regen → old audio played. Fix: in buildVoiceoverText, for non-decision-
        //     point 7-card types, check card.voiceoverText FIRST. If set, use it as the
        //     narration source and skip structural field extraction. competency-summary
        //     still appends "Now, complete the activity below." CTA.
        // (2) AUTO-REGEN NOT FIRING: Same root cause — saveSlideEdit's hash check called
        //     buildFullVoiceoverText which skipped card.voiceoverText → hash unchanged →
        //     regenerateVoiceover stayed false. Fixed by fix (1): hash now differs when
        //     voiceoverText is edited → auto-regen triggers correctly.
        // (3) NO POPUP NOTIFICATION: voiceover auto-regen fetch() at line 12285 fired
        //     silently. Users saw "Slide saved" with no indication audio was regenerating.
        //     Fix: added three Notification.addNotification() calls — "Voiceover is being
        //     regenerated in the background" before fetch, "Voiceover updated successfully"
        //     on success, "Slide saved but voiceover regeneration failed" on error/catch.
        //   AMD trios: cc-state.js and player5.js both triple-matched (src/build/min).
        //   No PHP or DB schema changes. version.php → 2026040100225.
        upgrade_mod_savepoint(true, 2026040100225, 'contentcreator');
    }


    if ($oldversion < 2026040100226) {
        // v12.26: FIX (BUG-CC-NOREGEN) — Voiceover auto-regeneration skipped for
        //   sections that lacked a stored voiceoverTextHash (any section generated before
        //   v9.98 when hash tracking was introduced). The saveSlideEdit hash check in
        //   player5.js was gated on `sec.voiceoverTextHash` being truthy. When no hash
        //   was stored and sec.voiceoverUrl already existed, neither the hash-compare
        //   branch nor the `!sec.voiceoverUrl` branch fired — edits to card text were
        //   persisted to the DB but the audio remained stale and no "regenerating"
        //   notification was shown. Fix: added an `else if (sec.voiceoverUrl)` branch
        //   that unconditionally flags regeneration when a voiceoverUrl exists but no
        //   hash is stored, ensuring audio always reflects the latest edited content.
        //   AMD trios: player5.js and cc-state.js triple-matched (src/build/min).
        //   No PHP or DB schema changes. version.php → 2026040100226.
        upgrade_mod_savepoint(true, 2026040100226, 'contentcreator');
    }

    if ($oldversion < 2026040100227) {
        // v12.27: VERSION BUMP — Corrected stale CC_VERSION constant in generator.js
        //   (was '12.24', three versions behind cc-state.js). Updated to '12.27' so
        //   generator-module console logs display the correct version prefix. No PHP
        //   or DB schema changes. AMD trios: cc-state.js and generator.js triple-matched
        //   (src/build/min). version.php → 2026040100227.
        upgrade_mod_savepoint(true, 2026040100227, 'contentcreator');
    }

    // v12.28 FIX-CC-VO-HEADINGS: 7-card VET content stores per-card teacher headings in
    //   card.heading; buildVoiceoverText was only checking card.title. Cards authored with
    //   a heading produced no voiced heading text — voiceover read only the default label.
    //   Fix: use card.heading || card.title throughout heading normalisation.
    //   No DB schema changes. AMD: cc-state.js updated. version.php → 2026040200228.
    if ($oldversion < 2026040200228) {
        upgrade_mod_savepoint(true, 2026040200228, 'contentcreator');
    }

    // v12.29 FIX (BUG-VO-TRUNCATION): Raised ajax.php TTS char limit 4000→8000.
    //   Bumped VOICEOVER_SCHEMA_VERSION '11.37'→'12.29' in cc-state.js to force
    //   re-generation of all truncated stored voiceovers. PHP-only change; no DB schema
    //   changes. AMD: cc-state.js triple-matched. version.php → 2026040200229.
    if ($oldversion < 2026040200229) {
        upgrade_mod_savepoint(true, 2026040200229, 'contentcreator');
    }

    // v12.30 FIX (BUG-VO-COMPETENCY-HEADING): Fixed two voiceover sub-heading bugs on
    //   competency-summary cards. (1) "What Good Looks Like" heading not voiced: early-return
    //   in cc-state.js buildVoiceoverText used AI-generated voiceoverText (no sub-headings)
    //   instead of the structured goodItems/badItems path. Fix: early-return skipped for
    //   competency-summary when goodItems/badItems populated — structured branch always fires,
    //   voicing "What good looks like." / "What to avoid." (2) "Watch out for" voiced instead
    //   of "What to Avoid": same root cause, same fix. (3) player5.js
    //   patchMissingCardVoiceoverTexts: inserts correct sub-headings before item lists.
    //   (4) VOICEOVER_SCHEMA_VERSION bumped '12.29'→'12.30'. (5) generator.js CC_VERSION
    //   corrected '12.28'→'12.30'. No PHP or DB schema changes.
    //   AMD: cc-state.js, player5.js, generator.js triple-matched. version.php → 2026040200230.
    if ($oldversion < 2026040200230) {
        upgrade_mod_savepoint(true, 2026040200230, 'contentcreator');
    }

    // v12.31: BUG-VO-PD-TRUNCATION — ajax.php char limit raised 8000→12000 so PD course
    //   voiceovers (7 cards of 200–300-word prose ≈ 9600+ chars) are no longer truncated
    //   at card 4/5. PHP change only (ajax.php). No DB schema changes.
    //   version.php → 2026040400231.
    if ($oldversion < 2026040400231) {
        upgrade_mod_savepoint(true, 2026040400231, 'contentcreator');
    }

    // v12.32: BUG-VO-VET-TRUNCATION — Two-part fix for VET/Workplace/University voiceover
    //   truncation. (1) ajax.php char limit raised 12000→20000 (old content with long prose
    //   voiceoverText + structural fields reaches 13000–16000 chars). (2) cc-state.js
    //   VOICEOVER_SCHEMA_VERSION bumped '12.30'→'12.32' to force regeneration of ALL stored
    //   voiceovers that were generated under the old 8000 or 12000-char limit (v12.31 raised
    //   the limit but never bumped the schema version, so VET/Workplace/University audio stored
    //   at schema='12.30' was never detected as stale). AMD: cc-state.js triple-matched,
    //   MD5 7c7eff2aeea24ac17b7f73d0011d62a7. No DB schema changes.
    //   version.php → 2026040600232.
    if ($oldversion < 2026040600232) {
        upgrade_mod_savepoint(true, 2026040600232, 'contentcreator');
    }

    // v12.33: FIX-DP-SHUFFLE — cc-card-slots.js now shuffles the decision-point
    //   options with a Fisher-Yates shuffle before rendering so the correct answer
    //   is no longer always Option B. Shuffle applied in both renderDecisionPoint
    //   and renderDecisionChallenge. Shallow copy used — manifest data never mutated.
    //   AMD: cc-card-slots.js triple-matched, MD5 654daec7ca0f4d476a9f9afdea888614.
    //   No PHP or DB schema changes. version.php → 2026040700233.
    if ($oldversion < 2026040700233) {
        upgrade_mod_savepoint(true, 2026040700233, 'contentcreator');
    }

    // v12.34: IMG-QUALITY-UPGRADE — Three server-side image generation improvements.
    //   (1) Quiz image Gemini prompt-writer (routes.ts): rule 7 now prohibits duplicate/
    //   cloned faces; rule 8 upgraded from "no text overlays" to CRITICAL NO-TEXT
    //   (zero letters/numbers/labels/signs; omit diagram labels entirely); added rule 10
    //   (no blurry or low-res elements). (2) Slide image buildImagePrompt (routes.ts):
    //   new shared CRITICAL block after TEXT-FREE — every person distinct, no cloned
    //   faces, limit 1–4 realistic people, no mirrored/repeated figures. (3) Pipeline:
    //   OpenAI gpt-image-1 quality 'medium'→'high'; optimizeImageBuffer max-width
    //   1200→1536 and JPEG quality 85→92. Server-side only. No AMD, PHP, or DB changes.
    //   version.php → 2026040700234.
    if ($oldversion < 2026040700234) {
        upgrade_mod_savepoint(true, 2026040700234, 'contentcreator');
    }

    // v12.35: RELEASE SYNC — Version bump to 2026041500235. Stale ZIPs removed from
    //   moodle-plugin/ (mod_contentcreator_v12.30.zip, plagiarism_essayguard_v1.2.52.zip)
    //   and from public/downloads/ (local_rtocompliance v4.0.47/v4.0.48, format_aicourse
    //   v1.7.31, mod_courseinfo v1.0.38). No code, AMD, PHP, or DB schema changes.
    //   version.php → 2026041500235.
    if ($oldversion < 2026041500235) {
        upgrade_mod_savepoint(true, 2026041500235, 'contentcreator');
    }

    // v12.36 — Three voiceover-waiting-screen bug fixes + bypass buttons:
    //   (1) BUG-CC-WAIT-STUCK-FAILED-GATE: isVoiceoverGenerationPending() did not
    //       exclude sections with voiceoverStatus='failed', so a permanently-failed
    //       section kept the gate open and the "Preparing audio..." screen was stuck
    //       forever. Fixed by skipping failed sections in both isVoiceoverGenerationPending()
    //       and getVoiceoverProgress() (failed → counted as ready so bar reaches 100%).
    //       Also: a voiceoverWaitBypassed flag allows user-initiated bypass via the new
    //       "Continue without audio" button.
    //   (2) BUG-CC-WAIT-STUCK-NO-REFRESH: After exhausting 3 preload retries for a
    //       section the error handler set voiceoverStatus='failed' but never called
    //       refreshTopicCardVoiceoverState() — the waiting screen was never told to
    //       re-evaluate and remained stuck at N-1/N slides. Fixed by calling
    //       refreshTopicCardVoiceoverState(section.id) after the final retry failure.
    //   (3) UX-CC-WAIT-BYPASS-BUTTON: No escape hatch existed when audio generation
    //       stalled. Added a "Continue without audio" link (always visible) that bypasses
    //       the wait and goes directly to the topics page. Teachers and canEdit users also
    //       see a "Reset & retry audio" button that clears failed status and re-queues all
    //       failed sections without a page reload. CSS added to player5.css.
    //   No DB schema changes. AMD: player5.js, cc-state.js (CC_VERSION 12.32→12.36),
    //   build files updated. version.php → 2026041500236.
    if ($oldversion < 2026041500236) {
        upgrade_mod_savepoint(true, 2026041500236, 'contentcreator');
    }

    // v12.37 — UX-CC-BYPASS-HOVER: "Continue without audio" hover style fix.
    //   On hover the button now shows white text on the primary colour background
    //   instead of darkening plain text with no background (hard to read).
    //   CSS-only change (player5.css). No AMD, PHP, or DB schema changes.
    //   version.php → 2026041500237.
    if ($oldversion < 2026041500237) {
        upgrade_mod_savepoint(true, 2026041500237, 'contentcreator');
    }

    // v12.38 — BUG-CC-RETRY-NARROW: "Reset & retry audio" button did nothing when the
    //   failing section was mid-retry (attempt 1 or 2 of 3, not yet voiceoverStatus='failed').
    //   Three root causes fixed in the retry click handler (player5.js):
    //   (1) Condition s.voiceoverStatus==='failed' was too narrow — mid-retry sections have
    //       voiceoverStatus=undefined and were never cleared.
    //   (2) s._preloadRetryCount was not deleted — fresh preload inherited the old retry count
    //       (e.g. 2) giving only 1 attempt before being marked failed again.
    //   (3) self.voiceoverLoading[s.id] was not deleted — if the 120s fetch was still active,
    //       preloadVoiceovers() skipped the section (guard: voiceoverLoading[id]=true).
    //   Fix: handler now clears ALL sections without complete audio, deleting voiceoverStatus,
    //   voiceoverUrl, _preloadRetryCount, and voiceoverLoading[id]. AMD-only (player5.js).
    //   No CSS, PHP, or DB schema changes. version.php → 2026041500238.
    if ($oldversion < 2026041500238) {
        upgrade_mod_savepoint(true, 2026041500238, 'contentcreator');
    }

    // v12.39 — BUILD-SYNC: AMD build files were not updated when v12.36→v12.38 source
    //   fixes were applied. Moodle runs amd/build/ (not amd/src/), so the retry handler
    //   fix (BUG-CC-RETRY-NARROW) and hover CSS (UX-CC-BYPASS-HOVER) were silently
    //   ignored in the installed plugin despite being correct in the source. This release
    //   re-syncs player5.js, player5.min.js, cc-state.js, cc-state.min.js build files
    //   and bumps CC_VERSION '12.36'→'12.38' in cc-state. No new functional changes
    //   beyond v12.38. No PHP or DB schema changes. version.php → 2026041500239.
    if ($oldversion < 2026041500239) {
        upgrade_mod_savepoint(true, 2026041500239, 'contentcreator');
    }

    // v12.40 — VERSION-BUMP: Forced increment to ensure Moodle detects upgrade
    //   over any cached v12.39 install. No code changes beyond v12.39.
    //   version.php → 2026041500240.
    if ($oldversion < 2026041500240) {
        upgrade_mod_savepoint(true, 2026041500240, 'contentcreator');
    }

    // v12.41 — BUG-CC-SOFT-FAIL: Audio generation API sometimes responds with
    //   success=false or missing audioContent (rate limit, quota, transient error).
    //   Previously this fell through silently — voiceoverPreloadStatus.loaded++ ran
    //   with no cache set and no status update, section stayed 'pending', and
    //   refreshTopicCardVoiceoverState was never called → waiting screen stuck forever.
    //   "Reset & retry audio" re-triggered the same soft failure and appeared to do
    //   nothing. Fix: else-throw after if(data.success && data.audioContent) routes
    //   soft failures through the standard 3-retry mechanism. CC_VERSION 12.38→12.41.
    //   Added visual feedback ("Retrying audio…") and double-click guard on button.
    //   AMD-only: player5.js, cc-state.js. No CSS, PHP, or DB schema changes.
    //   version.php → 2026041500241.
    if ($oldversion < 2026041500241) {
        upgrade_mod_savepoint(true, 2026041500241, 'contentcreator');
    }

    // v12.42 — BUG FIX: Retry button appeared to do nothing when TTS fetch was still
    //   in-flight (120s timeout). Old _voiceoverRetryPending guard blocked all subsequent
    //   clicks for the full duration. Root causes: (1) AbortController was local to
    //   preloadOne() — the retry handler couldn't cancel hung 120s fetches. (2) After
    //   user-abort, .catch() scheduled a competing retry chain (4×120s = 8 minutes of
    //   parallel requests). (3) Guard blocked second clicks indefinitely even though
    //   user expected a fresh retry start.
    //   Fix: Store AbortController on section (_preloadAbortCtrl). Retry handler aborts
    //   in-flight fetches immediately and sets _preloadAbortedByUser flag so .catch()
    //   exits cleanly without spawning a competing chain. Guard replaced with 3-second
    //   debounce (_lastRetryClickTime). CC_VERSION 12.41→12.42.
    //   AMD-only: player5.js, cc-state.js. No CSS, PHP, or DB schema changes.
    //   version.php → 2026041500242.
    if ($oldversion < 2026041500242) {
        upgrade_mod_savepoint(true, 2026041500242, 'contentcreator');
    }

    // v12.43 — BUG FIX (BUG-CC-TIMEOUT-RACE): AbortController timeout 120s→200s;
    //   delete voiceoverLoading[id] moved to after _preloadAbortedByUser check.
    //   AMD-only: player5.js, cc-state.js. No DB changes.
    //   version.php → 2026041500243.
    if ($oldversion < 2026041500243) {
        upgrade_mod_savepoint(true, 2026041500243, 'contentcreator');
    }

    // v12.44 — UX FIX (UX-CC-SWEEP-FEEDBACK): POST-PRELOAD SWEEP now updates the
    //   wait screen in-place immediately when missing sections are detected, so the
    //   user sees "Almost there…" + descriptive message instead of a frozen progress
    //   bar. After the 10-second delay the message changes to "Generating audio…"
    //   to confirm the retry is actively in progress. No PHP or DB changes.
    //   AMD-only: player5.js. version.php → 2026041500244.
    if ($oldversion < 2026041500244) {
        upgrade_mod_savepoint(true, 2026041500244, 'contentcreator');
    }

    // v12.45 — BUG FIX (BUG-CC-FAILED-PERSIST): voiceoverStatus='failed' was being persisted
    //   to the DB via saveManifestSilent. On subsequent page loads failed sections were treated
    //   as "not blocking" — silently regenerated in the background with no visible wait screen.
    //   Fix: stripAudio() now omits voiceoverStatus='failed' before every DB save. On reload the
    //   section looks brand-new (no URL, no status), isVoiceoverGenerationPending() returns true,
    //   the wait screen shows, and the teacher sees visible progress. AMD-only: player5.js.
    //   version.php → 2026041500245.
    if ($oldversion < 2026041500245) {
        upgrade_mod_savepoint(true, 2026041500245, 'contentcreator');
    }

    // v12.46 — STRUCTURE FIX: upgrade.php blocks for v12.43–v12.45 were incorrectly appended
    //   outside the xmldb_contentcreator_upgrade() function (after return true; }).
    //   PHP ran them as global code during require_once() with $oldversion=null, causing
    //   a 'cannotdowngrade' error on every install attempt. Blocks moved inside the function.
    //   No functional code changes beyond v12.45. AMD-only: player5.js, cc-state.js.
    //   version.php → 2026041500246.
    if ($oldversion < 2026041500246) {
        upgrade_mod_savepoint(true, 2026041500246, 'contentcreator');
    }

    // v12.47: BUG-CC-RETRY-CONCURRENT — "Reset & retry audio" button caused HTTP 500 on
    //   all retry attempts because aborting the browser fetch did not stop the PHP-FPM curl
    //   process. PHP kept its curl connection to the TTS backend alive (CURLOPT_TIMEOUT=180s)
    //   while the retry handler immediately launched a new PHP process with a concurrent curl
    //   to the same endpoint. The deployment CDN rejected the second concurrent long-running
    //   request with HTTP 500, making all retries fail instantly even though the backend
    //   returned 200. Fix: retry handler no longer aborts in-flight fetches — it only resets
    //   the retry counter so the old chain gets a fresh 3-retry budget if it fails. The new
    //   preloadVoiceovers() call skips sections that are still in-flight (voiceoverLoading set),
    //   preventing concurrent TTS requests entirely. AMD-only: player5.js + cc-state.js.
    //   CC_VERSION 12.46 → 12.47. No CSS, PHP schema, or DB changes. version.php → 2026041500247.
    if ($oldversion < 2026041500247) {
        upgrade_mod_savepoint(true, 2026041500247, 'contentcreator');
    }

    // v12.48: BUG-CC-TTS-CONCURRENT — Voiceover failed to play after "Regenerate voiceover".
    //   Two root causes fixed:
    //   (1) JS RETRY DELAY WINDOW: preloadOne().catch() cleared voiceoverLoading before the
    //       retry delay window (2/4/6s), allowing generateSlideVoiceoverBulk() to fire a
    //       second concurrent PHP curl. CDN → HTTP 500 on both. Fix: voiceoverLoading stays
    //       true during delays; _preloadScheduledRetry flag lets the scheduled retry proceed.
    //   (2) PHP MUTEX: New per-section file lock (LOCK_EX|LOCK_NB) in ajax.php returns
    //       {pending:true} instead of making a concurrent TTS call. JS retries in 10s.
    //   JS changes: player5.js + cc-state.js. PHP changes: ajax.php.
    //   CC_VERSION 12.47 → 12.48. No DB schema changes. version.php → 2026041500248.
    if ($oldversion < 2026041500248) {
        upgrade_mod_savepoint(true, 2026041500248, 'contentcreator');
    }

    // v12.49: BUG-CC-ZOMBIE-CHAIN — Clicking "Reset & retry audio" spun forever.
    //   Root cause: chain generation race between auto-preload .catch() microtask and
    //   the retry button's new preloadVoiceovers() call. The old chain's .catch() fired
    //   after button click, scheduled a 2s retry via _preloadScheduledRetry bypass flag.
    //   That 2s retry fired concurrently with the new chain's 10s POST-PRELOAD SWEEP →
    //   two concurrent PHP TTS curls → CDN HTTP 500 on both → infinite loop.
    //   Fix: chain generation counter (_voiceoverChainGen). Old chains self-terminate
    //   in preloadOne(), .catch(), and retry setTimeout callbacks when generation
    //   has advanced. 30s follow-up sweep for slow in-flight PHP fetches. AMD-only.
    //   CC_VERSION 12.48 → 12.49. No DB schema changes. version.php → 2026041500249.
    if ($oldversion < 2026041500249) {
        upgrade_mod_savepoint(true, 2026041500249, 'contentcreator');
    }

    // v12.50: Three AMD-only bug fixes in player5.js. No DB schema changes.
    //   (1) BUG-CC-BYPASS-PLAY — After clicking "Continue without audio", clicking Play
    //       entered the 230s blocking wait loop. Fix: when voiceoverWaitBypassed=true and
    //       voiceoverLoading[sectionId]=true, skip the wait loop and show an info notice.
    //   (2) BUG-CC-PENDING-LIMIT-LOW — Pending retry limit was 6 (60s). TTS takes up to
    //       153s on 4-chunk Chirp 3 HD voiceovers, so the PHP file lock was still held
    //       when retries exhausted. Fix: raise limit from 6 to 25 (250s > 200s PHP abort).
    //   (3) BUG-CC-ONDEMAND-PENDING — On-demand generation received {pending:true} from PHP
    //       but fell through to the failure else-branch, showing an error toast. Fix: detect
    //       data.pending before data.success; show info notice; let user retry manually.
    //   CC_VERSION 12.49 → 12.50. version.php → 2026041500250.
    if ($oldversion < 2026041500250) {
        upgrade_mod_savepoint(true, 2026041500250, 'contentcreator');
    }

    // v12.51: Two AMD-only bug fixes in player5.js. No DB schema changes.
    //   (1) BUG-CC-AUTOGEN-PENDING — Behaviour Settings AUTO-GEN raw fetch received
    //       {pending:true} from PHP (preload holding lock) but fell through to failure
    //       else-branch, showing "Slide saved but voiceover regeneration failed". Fix:
    //       detect voData.pending before voData.success; show info notice instead.
    //   (2) BUG-CC-PENDING-DUPE-TTS — After PHP attempt 1 completed and cached audio,
    //       already-scheduled pending retry setTimeouts still fired preloadOne(), which
    //       acquired the now-free PHP lock and started unnecessary duplicate TTS calls
    //       (wasteful, costs TTS credits). Fix: pending retry setTimeout checks
    //       voiceoverCache[section.id] and section.voiceoverUrl before calling
    //       preloadOne(); if audio already cached, exits cleanly.
    //   CC_VERSION 12.50 → 12.51. version.php → 2026041500251.
    if ($oldversion < 2026041500251) {
        upgrade_mod_savepoint(true, 2026041500251, 'contentcreator');
    }

    // v12.52: VOICEOVER TIMEOUT FIX (server + PHP). Multi-chunk TTS switched from
    // LINEAR16/WAV (~45MB) to MP3 (~2MB), reducing server response time from 150s to
    // under 30s. generate_voiceover.php CURLOPT_TIMEOUT raised 120s → 300s. No DB changes.
    if ($oldversion < 2026041500252) {
        upgrade_mod_savepoint(true, 2026041500252, 'contentcreator');
    }

    // v12.53: Three bug fixes (1 PHP + 2 AMD). No DB schema changes.
    //   (1) BUG-CC-SAVEVO-PERM — save_voiceover_file in ajax.php used
    //       require_capability('addinstance') which is too strict for custom-role
    //       editing teachers. Fix: use contentcreator_require_manage() two-step check.
    //   (2) BUG-CC-BULK-SKIP — generateSlideVoiceoverBulk() called callback(false)
    //       immediately when preloadVoiceovers() was in-flight for the same section,
    //       causing the bulk UI to report "0/1 voiceovers generated" as an error even
    //       though audio was actively being generated. Fix: poll voiceoverLoading every
    //       3s for up to 90s; call callback(true) when preload succeeds.
    //   (3) BUG-CC-LOG-STALE — on-demand AbortController catch label "TIMEOUT 120s"
    //       was stale; abort raised to 200s in v12.43. Fixed to "TIMEOUT 200s".
    //   CC_VERSION 12.51 → 12.53. version.php → 2026041500253.
    if ($oldversion < 2026041500253) {
        upgrade_mod_savepoint(true, 2026041500253, 'contentcreator');
    }

    //   CC_VERSION 12.53 → 12.54. version.php → 2026041500254.
    //   AMD-only: FIX-CC-ORPHANED-SECTION in player5.js — after "Reset & retry audio" click
    //   while a 200s fetch was in-flight, the new chain's sweeps (t+10s, t+40s) ran while
    //   the lock was held and gave up. When the old fetch aborted at t=200s the freed section
    //   was never picked up again. Fix: old chain now schedules self.preloadVoiceovers() after
    //   clearing voiceoverLoading (guarded with _supersededRetryCount < 3 to prevent loops).
    if ($oldversion < 2026041500254) {
        upgrade_mod_savepoint(true, 2026041500254, 'contentcreator');
    }

    // v12.55: FEAT — Multi-language content generation.
    //   Teacher can select additional student languages (Vietnamese, Mandarin, etc.) in the
    //   builder wizard. The AI generates a full separate set of slides and voiceovers for each
    //   selected language, stored as manifest.multiLanguage[]. Students see a language pill bar
    //   at the top of the course page and can switch between languages instantly.
    //   Files changed: amd/src/builder.js (UI + generation loop), amd/src/player5.js (switcher
    //   UI + setActiveLang(), click handler), styles/builder.css, styles/player5.css.
    //   All AMD files triple-matched (src/build/min). No DB schema changes.
    //   CC_VERSION 12.54 → 12.55. version.php → 2026041600255.
    if ($oldversion < 2026041600255) {
        upgrade_mod_savepoint(true, 2026041600255, 'contentcreator');
    }

    // v12.56: FIX — Sync CC_VERSION constant in generator.js to '12.55' (was stale at '12.30').
    //   All debug console logs now correctly identify as [CC v12.55]. No functional changes.
    //   AMD-only: generator.js. No DB schema changes. version.php → 2026041600256.
    if ($oldversion < 2026041600256) {
        upgrade_mod_savepoint(true, 2026041600256, 'contentcreator');
    }

    // v12.57: THREE BUG FIXES — AMD-only (player5.js, cc-state.js, cc-card-slots.js,
    //   builder.js) + server-side TTS sanitise + player5.css "Continue" button styles.
    //   (1) FIX-CC-TTS-DASHES: Voiceover was reading "---" separator lines aloud. Root cause:
    //       fixGrammar() in player5.js and _fg()/_buildVoiceoverText in cc-state.js did not
    //       strip Markdown decorators (---, ***, # headings). Fixed in all three locations.
    //       Server-side routes.ts TTS route also strips these before sending to Google TTS.
    //   (2) FIX-CC-CHALLENGE-NEXT: No "Next" navigation after completing a Challenge slide.
    //       Added cc5-challenge-continue-btn to challenge result HTML in cc-card-slots.js.
    //       Click handler in player5.js triggers .cc5-nav-chevron.cc5-next; button hidden on
    //       last slide via _showChallengeComplete() guard. player5.css adds green button CSS.
    //   (3) FIX-CC-BUILDER-STUCK: Builder indefinitely suspended on "Generating voiceover"
    //       when TTS API timed out. Added 210s AbortController to pregenOne() in builder.js
    //       so each attempt aborts and retries (max 3) instead of hanging. Also added a
    //       "Skip voiceover generation and continue" bypass button in the builder's progress
    //       UI — sets _voSkipRequested flag; pregenOne() exits early; voiceovers fall back to
    //       on-demand generation when the activity is first opened. No DB schema changes.
    //   CC_VERSION 12.56 → 12.57. version.php → 2026041700257.
    if ($oldversion < 2026041700257) {
        upgrade_mod_savepoint(true, 2026041700257, 'contentcreator');
    }

    // FEAT-CC-MULTILANG-54 (v12.58): Additional Student Languages expanded from 12 to all
    //   54 languages matching the Voiceover Language dropdown. Checkboxes sorted
    //   alphabetically. Primary language is auto-hidden/unchecked from the Additional
    //   Languages list via syncAdditionalLangFilter() in builder.js whenever the primary
    //   voice language changes. No DB schema changes. AMD triple-matched (src/build/min).
    //   CC_VERSION 12.57 → 12.58. version.php → 2026041700258.
    if ($oldversion < 2026041700258) {
        upgrade_mod_savepoint(true, 2026041700258, 'contentcreator');
    }

    // v12.59 - FIX-CC-MULTILANG-54-VISIBILITY: Primary voice language was hidden (display:none)
    //   from the Additional Student Languages checkbox list, showing only 53 of 54 languages.
    //   Root cause: syncAdditionalLangFilter() in amd/src/builder.js set row.style.display='none'
    //   for the primary language. Fixed to set cb.disabled=true and row.style.opacity='0.45'
    //   instead, keeping all 54 checkboxes visible. Primary shows tooltip "This is already the
    //   primary language". AMD triple-matched (MD5: a145175c8ab7627793a6b08f489bfc96).
    //   No DB schema changes. version.php → 2026041800259.
    if ($oldversion < 2026041800259) {
        upgrade_mod_savepoint(true, 2026041800259, 'contentcreator');
    }

    // v12.60 - FIX-CC-MULTILANG-DEFAULT-LABEL: Primary voice language checkbox in the
    //   Additional Student Languages multi-select now appends " — Default" to the label text
    //   (e.g. "English (Australia) — Default") so teachers understand the primary language is
    //   already included automatically without needing to tick it. The original label is
    //   restored whenever the primary changes. Tooltip updated to "Already your primary
    //   language — included automatically". No DB schema changes.
    //   AMD triple-matched (MD5: 07e75f7d63a6332257ed2d1df85ed9d3). version.php → 2026041800260.
    if ($oldversion < 2026041800260) {
        upgrade_mod_savepoint(true, 2026041800260, 'contentcreator');
    }
    // v12.61: AMD ENCODING FIX: All non-ASCII characters (em dashes, arrows, box-drawing chars, ellipsis, bullets, emoji, accented Latin) scrubbed from all AMD JS files (amd/src, amd/build, amd/build/*.min.js). Root cause of Moodle primary/secondary navigation menus disappearing site-wide: non-ASCII bytes in any installed plugin's AMD file cause a SyntaxError inside RequireJS's first.js bundle, throwing "No define call for core/first" and aborting the entire AMD module chain. No PHP, DB schema, or functional changes in this release.
    if ($oldversion < 2026042200261) {
        upgrade_mod_savepoint(true, 2026042200261, 'contentcreator');
    }
    // v12.62: FIX-CC-MULTILANG-WAIT-STUCK: isVoiceoverGenerationPending() now treats
    // voiceoverUrl==='pregenerated' as "audio available" so students switching to a
    // non-primary language are not stuck on "Preparing audio..." when navigating back
    // from slides. No DB schema changes.
    if ($oldversion < 2026042300262) {
        upgrade_mod_savepoint(true, 2026042300262, 'contentcreator');
    }

    // v12.63: FIX-CC-FAILED-SCENE-PARTS: hook-scenario/applied-scenario failed cards
    // were displaying garbled text across the 4 quadrant fields (THE SETTING, THE DETAILS,
    // WHAT HAPPENED, THE PRESSURE). Root cause: sentence-split synthesis in generator.js
    // and player5.js split the error description on every "." — topic titles containing
    // numbered elements (e.g. "1.4. Load is packed...") caused fragments of the error
    // message to land in each quadrant. Fix: added card.failed guard in both synthesis
    // blocks; failed cards now receive clean error sceneParts directly. No DB schema changes.
    if ($oldversion < 2026042400263) {
        upgrade_mod_savepoint(true, 2026042400263, 'contentcreator');
    }

    // v12.64: TWO BUG FIXES (AMD-only: player5.js, cc-state.js):
    // (1) FIX-CC-MULTILANG-GATE: Additional-language Play button did nothing for students.
    //   setActiveLang()->preloadVoiceovers()->checkComplete() overwrote
    //   manifest.voiceoversComplete=false because allVoiceoversComplete() rejected sections
    //   with voiceoverUrl='pregenerated', tripping the global play gate. Fix: accept sentinel
    //   as complete. Student guard in playVoiceover() now allows API fetch for pre-generated
    //   sections (PHP returns cached URL, no new TTS cost).
    // (2) FIX-CC-TOPIC-REPEAT: Section title appeared twice on card 1 — in slide heading
    //   and in Knowledge body. Fix: suppress description when normalised text matches title.
    // BONUS FIX-CC-MULTILANG-LANG: preload and on-demand API calls now send activeLang.
    // No DB schema changes.
    if ($oldversion < 2026042400264) {
        upgrade_mod_savepoint(true, 2026042400264, 'contentcreator');
    }

    // v12.65 - NAV FIX: isset($settings) guard added to settings.php per BUG_FIXES.md
    //   defensive pattern. No DB schema changes. version.php -> 2026042500265.
    if ($oldversion < 2026042500265) {
        upgrade_mod_savepoint(true, 2026042500265, 'contentcreator');
    }

    // v12.66 - FIX-CC-TTS-CACHE: generate_voice checks Moodle file store (mod_contentcreator/
    //   voice_cache, system context) before calling TTS API. Cache key = MD5(text|voiceid|lang).
    //   FIX-CC-ML-LANG-CAPTURE: pregenLangOne IIFE captures langCode by value.
    //   AMD triple-match 722e62b7827095e752248e92dda67372. No DB schema changes.
    //   version.php → 2026043000266.
    if ($oldversion < 2026043000266) {
        upgrade_mod_savepoint(true, 2026043000266, 'contentcreator');
    }

    // v12.67 - FIX-CC-MULTILANG-PROGRESS: getVoiceoverProgress() now counts 'pregenerated'
    //   sentinel sections as ready (mirrors v12.62 isVoiceoverGenerationPending() fix).
    //   FIX-CC-MULTILANG-SENTINEL-RESTORE: playVoiceover() restores sentinel in both
    //   .then() error branch and .catch() so students can retry after a network failure
    //   on additional-language slides without needing a page reload.
    //   AMD player5.js triple-match 80120e8b22fc1f375ccb725a172fb44f. No DB schema changes.
    //   version.php → 2026043000267.
    if ($oldversion < 2026043000267) {
        upgrade_mod_savepoint(true, 2026043000267, 'contentcreator');
    }

    // v12.89 - FIX-CC-START-LEARNING: _teacherNeedsRegen neutralised in player5.js.
    //   The check fired for any teacher whenever a section had an HTTPS URL but
    //   voiceoverStatus !== 'complete', deleting the URL and triggering async TTS regen.
    //   Brand-new content from the builder had valid HTTPS URLs but no voiceoverStatus
    //   set, causing the waiting screen to appear instead of the topics grid on every
    //   first load. After reload the regen was saved (status='complete'), so the bug
    //   appeared to "work after refresh". Fix: _teacherNeedsRegen = false; staleness
    //   check is sole authority on whether a teacher's URL needs regeneration.
    //   FIX-CC-LANG-PERSIST: saveSessionState() now persists activeLang. init() restores
    //   it silently by swapping manifest.topics to the saved additional-language topics
    //   before preloadVoiceovers() runs, so the selected language (and its voiceovers)
    //   are preserved across page refreshes.
    //   AMD: player5.js (src + build + min synced). No PHP, CSS, or DB schema changes.
    //   version.php → 2026051100289.
    if ($oldversion < 2026051100289) {
        upgrade_mod_savepoint(true, 2026051100289, 'contentcreator');
    }

    // v13.0 - FIX-CC-LANG-EXPLICIT: explicit language= param sent through full generation
    //   chain (all 4 routes: vet/workplace/university/pd). generator.js callAI() now sends
    //   formData.append('language', language) so server secondary passes (Pass 2 expansion,
    //   Pass 3 banned-word rewrite) receive language directly instead of parsing system
    //   prompt text — the fragile extraction silently failed for German. ajax.php
    //   generate_slide_async + generate_slide (sync, defensive) both read
    //   optional_param('language','en-AU') and forward to API. diag.php Section 18 added.
    //   PHP+AMD change. No DB schema changes. version.php → 2026051313000.
    if ($oldversion < 2026051313000) {
        upgrade_mod_savepoint(true, 2026051313000, 'contentcreator');
    }

    // v13.1 - 8-VOICE SELECTOR: replaces binary Female/Male toggle with 8 individual
    //   Chirp 3 HD voice choices. Builder UI, builder.js, player5.js, ajax.php updated.
    //   Backward compat: old manifests with voiceSettings.gender fall back to Puck (male)
    //   or Aoede (female). PHP+AMD+CSS change. No DB schema changes.
    //   version.php → 2026051313100.
    if ($oldversion < 2026051313100) {
        upgrade_mod_savepoint(true, 2026051313100, 'contentcreator');
    }

    // v13.2 - 8-VOICE MULTILANG FIX: generate_voiceover.php external function now accepts
    //   voice= param and resolves it with legacy fallback (male→Puck, female→Aoede, or
    //   direct voice name). settings.php admin default updated from binary Male/Female to
    //   all 8 voices. lang strings updated. ajax.php + generate_voiceover.php both send
    //   voiceGender=voiceName in TTS payload. PHP-only change. No AMD or DB schema changes.
    //   version.php → 2026051313200.
    if ($oldversion < 2026051313200) {
        upgrade_mod_savepoint(true, 2026051313200, 'contentcreator');
    }

    // v13.3 - CC-ML-DEBUG: Comprehensive multi-language diagnostic logging injected into
    //   player5.js and builder.js. Logs visible in browser console under [CC-ML] prefix.
    //   window.ccMLDump() exposes a live state dump callable from DevTools.
    //   Key log points: init manifest audit, session restore, lang-pill click, setActiveLang
    //   found/not-found, preloadVoiceovers start+done, student gate skip, TTS request/response.
    //   builder.js: additionalLangs gathered, per-lang content result, voiceover coverage audit
    //   before manifest push. PHP-only settings changes from v13.2 included. AMD+PHP change.
    //   No DB schema changes. version.php → 2026051313300.
    if ($oldversion < 2026051313300) {
        upgrade_mod_savepoint(true, 2026051313300, 'contentcreator');
    }

    // v13.4 - CC-ML-DEBUG-PLAY: Added [CC-ML PLAY *] debug logs directly inside
    //   playVoiceover() to catch the exact code path taken when Play is clicked on an
    //   additional-language section. New log points:
    //   [CC-ML PLAY ENTRY]: sectionId, voiceoverUrl, cache state, editMode/canEdit/isTeacher,
    //     voiceoverWordCount, voiceoverSchemaVersion, voiceoverTextHash.
    //   [CC-ML PLAY STALE]: stale-check breakdown — isSchemaStale, isWordCountStale, isHashStale,
    //     hasNoHash, hasNoFingerprint, and which path (TEACHER-REGEN vs STUDENT-PLAY-ANYWAY).
    //   [CC-ML PLAY URL-DELETED]: fires when teacher's stale-check deletes voiceoverUrl — shows
    //     the URL that was deleted, confirming the root cause of teacher on-demand re-TTS loops.
    //   [CC-ML PLAY STUDENT-STALE-OK]: student taking the "play anyway" path.
    //   [CC-ML PLAY CLEAN-URL]: fingerprint OK, playing HTTPS URL directly.
    //   [CC-ML PLAY ON-DEMAND-TTS]: on-demand TTS fired, shows exact language/voice sent.
    //   AMD-only (player5.js). No PHP, CSS, or DB schema changes. version.php → 2026051313400.
    if ($oldversion < 2026051313400) {
        upgrade_mod_savepoint(true, 2026051313400, 'contentcreator');
    }

    if ($oldversion < 2026051313500) {
        // FIX-CC-ML-SECTIONID-COLLISION (v13.5): pregenLangOne in builder.js
        // now prefixes sectionid with langCode (e.g. 'de-DE_2.1') so additional-
        // language voiceover files are stored separately from primary-language files
        // instead of overwriting them. AMD-only change. No PHP, CSS, or DB schema changes.
        // version.php → 2026051313500.
        upgrade_mod_savepoint(true, 2026051313500, 'contentcreator');
    }

    // v13.20: SAVEPOINT-BUMP — no-op marker for clean upgrade path. No DB schema changes.
    if ($oldversion < 2026060400020) {
        upgrade_mod_savepoint(true, 2026060400020, 'contentcreator');
    }

    // v13.23: FIX-CC-IMGGEN-SESSLOCK + FIX-CC-IMGGEN-CSRF + FIX-CC-IMGGEN-BULKCTX
    // No DB schema changes. PHP: ajax.php (require_sesskey + write_close for generate_image).
    // AMD: player5.js (src+build+min) — added missing context fields to generateSlideImageBulk.
    if ($oldversion < 2026061000023) {
        upgrade_mod_savepoint(true, 2026061000023, 'contentcreator');
    }

    // v13.38: FIX-CC-QUIZ-VOICE-DELAY — Knowledge Check Q2-Q5 feedback narration delay fix.
    // setTimeout(50ms) after speechSynthesis.cancel() before speak() to let Chrome settle.
    // AMD: player5.js (src+build+min). No PHP, CSS, or DB schema changes.
    if ($oldversion < 2026062200038) {
        upgrade_mod_savepoint(true, 2026062200038, 'contentcreator');
    }

    if ($oldversion < 2026062300040) {
        // FIX-CC-REGEN-FAILED-BTN: AMD-only fix. No DB schema changes.
        upgrade_mod_savepoint(true, 2026062300040, 'contentcreator');
    }

    if ($oldversion < 2026062500045) {
        // FIX-ADMIN-UNLOCK: AMD-only fix. No DB schema changes.
        // canNavigateNext() and lockstep topic locking now bypass restrictions for editors/admins.
        upgrade_mod_savepoint(true, 2026062500045, 'contentcreator');
    }

    if ($oldversion < 2026062500048) {
        // FIX-CC-SPLIT-BADGE-VISIBLE: AMD-only fix. No DB schema changes.
        // Amber split badge now shown in renderMajorTopicSelector() topic cards (not just structure DOM view).
        upgrade_mod_savepoint(true, 2026062500048, 'contentcreator');
    }

    if ($oldversion < 2026062500049) {
        // FIX-CC-SPLIT-AI-PATH: AMD-only fix. No DB schema changes.
        // Auto-split post-processing now applied to AI-returned topics in suggestMajorTopics().
        upgrade_mod_savepoint(true, 2026062500049, 'contentcreator');
    }

    if ($oldversion < 2026062600050) {
        // FIX-CC-SPLIT-PC-DISPLAY: AMD-only fix. No DB schema changes.
        // Split cards now show specific PC codes per part, not the total count for both.
        upgrade_mod_savepoint(true, 2026062600050, 'contentcreator');
    }

    if ($oldversion < 2026062600051) {
        // FIX-CC-SPLIT-PROMPT-PCS: AMD-only fix. No DB schema changes.
        // ChatGPT prompt download now only includes PCs belonging to the selected split part.
        upgrade_mod_savepoint(true, 2026062600051, 'contentcreator');
    }

    if ($oldversion < 2026071600052) {
        // FIX-CC-CCLOG-PLAYER5: AMD-only fix. No DB schema changes.
        // Added missing `const ccLog = _log.log` to player5.js logger setup.
        // Fixes voiceoversComplete never being persisted to DB after voiceover regeneration.
        if (function_exists('opcache_invalidate')) {
            $_pluginDir = realpath(__DIR__ . '/..');
            foreach (['version.php', 'db/upgrade.php'] as $_f) {
                $_full = $_pluginDir . '/' . $_f;
                if (file_exists($_full)) {
                    opcache_invalidate($_full, true);
                }
            }
        } elseif (function_exists('opcache_reset')) {
            opcache_reset();
        }
        upgrade_mod_savepoint(true, 2026071600052, 'contentcreator');
    }

    if ($oldversion < 2026071600053) {
        // FIX-CC-DP-VOICEOVER-EXEMPT: AMD-only fix. No DB schema changes.
        // decision-point cards are now exempt from voiceover validation in validateCards().
        // The system prompt says "NO voiceoverText" for decision-point — the validator was
        // failing it anyway, triggering a repair pass that dropped question/options.
        if (function_exists('opcache_invalidate')) {
            $_pluginDir = realpath(__DIR__ . '/..');
            foreach (['version.php', 'db/upgrade.php'] as $_f) {
                $_full = $_pluginDir . '/' . $_f;
                if (file_exists($_full)) {
                    opcache_invalidate($_full, true);
                }
            }
        } elseif (function_exists('opcache_reset')) {
            opcache_reset();
        }
        upgrade_mod_savepoint(true, 2026071600053, 'contentcreator');
    }

    if ($oldversion < 2026071600054) {
        // FIX-CC-PRELOAD-EARLY-SAVE: AMD-only fix. No DB schema changes.
        // checkComplete() called saveManifestSilent() unconditionally at PRELOAD DONE —
        // before persistVoiceoverToFileStore async POSTs returned. This wrote url=NULL to
        // the DB. The teacher then reloaded (prompted by "Teacher reload will retry"),
        // cancelling the 3s debounce that would have saved the real URLs. Fix: only call
        // saveManifestSilent() from checkComplete() when _isComplete=true. When incomplete,
        // defer the save to persistVoiceoverToFileStore's own debounced saveManifestSilent.
        if (function_exists('opcache_invalidate')) {
            $_pluginDir = realpath(__DIR__ . '/..');
            foreach (['version.php', 'db/upgrade.php'] as $_f) {
                $_full = $_pluginDir . '/' . $_f;
                if (file_exists($_full)) {
                    opcache_invalidate($_full, true);
                }
            }
        } elseif (function_exists('opcache_reset')) {
            opcache_reset();
        }
        upgrade_mod_savepoint(true, 2026071600054, 'contentcreator');
    }

    if ($oldversion < 2026072300226) {
        // FIX-API-DOMAIN: Updated all API endpoint URLs from lms-labs.com to lms-labs.com.
        // lms-labs.com has no DNS resolution from Moodle server side; lms-labs.com is the
        // correct working domain. All ajax.php, api_client, unlock_verifier, lib.php calls updated.
        if (function_exists('opcache_invalidate')) {
            $_pluginDir = realpath(__DIR__ . '/..');
            foreach (['version.php', 'db/upgrade.php'] as $_f) {
                $_full = $_pluginDir . '/' . $_f;
                if (file_exists($_full)) {
                    opcache_invalidate($_full, true);
                }
            }
        } elseif (function_exists('opcache_reset')) {
            opcache_reset();
        }
        upgrade_mod_savepoint(true, 2026072300226, 'contentcreator');
    }

    if ($oldversion < 2026072300227) {
        // FIX-API-DOMAIN: Reverted API endpoint to lms-labs.com (correct domain).
        // lms-labs.com was the original single-plugin domain; lms-labs.com is correct.
        if (function_exists('opcache_invalidate')) {
            $_pluginDir = realpath(__DIR__ . '/..');
            foreach (['version.php', 'db/upgrade.php'] as $_f) {
                $_full = $_pluginDir . '/' . $_f;
                if (file_exists($_full)) { opcache_invalidate($_full, true); }
            }
        } elseif (function_exists('opcache_reset')) { opcache_reset(); }
        upgrade_mod_savepoint(true, 2026072300227, 'contentcreator');
    }

    if ($oldversion < 2026072300228) {
        // FIX-DOMAIN: CSS/template references updated from old brand to lms-labs.com.
        if (function_exists('opcache_invalidate')) {
            $_pluginDir = realpath(__DIR__ . '/..');
            foreach (['version.php', 'db/upgrade.php'] as $_f) {
                $_full = $_pluginDir . '/' . $_f;
                if (file_exists($_full)) { opcache_invalidate($_full, true); }
            }
        } elseif (function_exists('opcache_reset')) { opcache_reset(); }
        upgrade_mod_savepoint(true, 2026072300228, 'contentcreator');
    }

    if ($oldversion < 2026072300229) {
        // Domain update: lms-labs.com → lms-labs.com
        if (function_exists('opcache_invalidate')) {
            $_pluginDir = realpath(__DIR__ . '/..');
            foreach (['version.php', 'lib.php', 'db/upgrade.php'] as $_f) {
                $_full = $_pluginDir . '/' . $_f;
                if (file_exists($_full)) { opcache_invalidate($_full, true); }
            }
        } elseif (function_exists('opcache_reset')) { opcache_reset(); }
        upgrade_mod_savepoint(true, 2026072300229, 'contentcreator');
    }

    if ($oldversion < 2026072300230) {
        // CSS/template domain update: lms-labs.com → lms-labs.com
        if (function_exists('opcache_invalidate')) {
            $_pluginDir = realpath(__DIR__ . '/..');
            foreach (['version.php', 'db/upgrade.php'] as $_f) {
                if (file_exists($_pluginDir . '/' . $_f)) opcache_invalidate($_pluginDir . '/' . $_f, true);
            }
        } elseif (function_exists('opcache_reset')) { opcache_reset(); }
        upgrade_mod_savepoint(true, 2026072300230, 'contentcreator');
    }

    if ($oldversion < 2026072800231) {
        // FIX-CC-STALE-MINJS: Rebuild generator.min.js and manifest.builder.min.js from source.
        // Both were stale (built Jul 23, src modified afterward), causing generation issues.
        // AMD-only: no PHP or DB schema changes.
        if (function_exists('opcache_invalidate')) {
            $_pluginDir = realpath(__DIR__ . '/..');
            foreach (['version.php', 'db/upgrade.php'] as $_f) {
                if (file_exists($_pluginDir . '/' . $_f)) opcache_invalidate($_pluginDir . '/' . $_f, true);
            }
        } elseif (function_exists('opcache_reset')) { opcache_reset(); }
        upgrade_mod_savepoint(true, 2026072800231, 'contentcreator');
    }

    if ($oldversion < 2026072800232) {
        // STALE-AMD-MASS-REBUILD (v13.61 — 28 Jul 2026): Full AMD src=build audit found
        // 22 out of 25 JS files had stale build files. Two distinct issues:
        //
        // (1) FIX-AMD-NAMED-DEFINE (21 files): The named AMD define fix (applied to build/
        //     files to prevent the Moodle combo-loader from overwriting AMD slots and
        //     collapsing page nav) was never synced back to the corresponding amd/src/ files.
        //     This left src/ with anonymous define([], function() {}) while build/ had the
        //     correct define('mod_contentcreator/MODULE', [], function() {}). Any future
        //     AMD rebuild from src/ would have re-shipped anonymous defines, triggering the
        //     AMD slot collision bug. Fixed: named define applied to all 21 src/ files.
        //
        // (2) FIX-CC-QUIZ-CORRECT-HIGHLIGHT (cc-card-slots.js, not yet shipped): src/ had
        //     a real bug fix that was never built — preferring per-option isCorrect/correct
        //     flags with anyExplicitCorrect guard, instead of the old simple OR that could
        //     mark both the correctAnswer index AND a different option with isCorrect:true
        //     as correct simultaneously (inverted green/red highlights). The current ZIP was
        //     shipping the OLD buggy cc-card-slots build. Now fixed.
        //
        // (3) player5.js + cc-activities.js: src/ had more verbose comment expansions (bug
        //     reference detail) not yet built.
        //
        // All 25 JS files rebuilt from src/. src=build verified 25/25.
        // No PHP, CSS, or DB schema changes.
        if (function_exists('opcache_invalidate')) {
            $_pluginDir = realpath(__DIR__ . '/..');
            foreach ([
                'version.php',
                'db/upgrade.php',
                'amd/build/cc-card-slots.js',
                'amd/build/cc-card-slots.min.js',
                'amd/build/player5.js',
                'amd/build/player5.min.js',
                'amd/build/cc-activities.js',
                'amd/build/cc-activities.min.js',
            ] as $_f) {
                if (file_exists($_pluginDir . '/' . $_f)) opcache_invalidate($_pluginDir . '/' . $_f, true);
            }
        } elseif (function_exists('opcache_reset')) { opcache_reset(); }
        upgrade_mod_savepoint(true, 2026072800232, 'contentcreator');
    }

    return true;
}