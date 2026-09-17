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
 * Content Creator - Server-side completion evidence
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace mod_contentcreator;

defined('MOODLE_INTERNAL') || die();

/**
 * The server's own record of what a learner has done, and the only thing completion reads.
 *
 * V15.5.0 FIX-CC-COMPLETION-FORGEABLE. Until this release the browser decided:
 * ajax.php's save_completion took `completed` as a POST parameter and passed it to
 * completion_info::update_state(). A single request marked a compliance module
 * complete. record_section_view, the endpoint that looked like the evidence trail,
 * validated its parameters and returned success without writing a row.
 *
 * What a server can and cannot prove is worth being precise about, because the
 * difference decides how much each half of this class is worth:
 *
 * - Challenge answers are PROVABLE. The answer key lives in the manifest on the
 *   server. record_answer() is reachable only from \mod_contentcreator\external\
 *   check_answer, which grades against that key. A client cannot mark a challenge
 *   passed at all, whatever it sends. This is the half that matters for an RTO: the
 *   learner demonstrably answered the questions.
 *
 * - Section views are ATTESTED, not proved. No server can know a human read a slide;
 *   SCORM does not either. What changed is that a view is now a discrete event the
 *   server records against a section id it has checked exists in the manifest, and
 *   completion is computed from those rows rather than from a boolean the client
 *   sends. A claim naming a section that is not in the manifest is dropped, and the
 *   count can never exceed the number of sections that exist.
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class evidence {
    /**
     * Decode the stored manifest for a course module.
     *
     * @param \stdClass|\cm_info $cm Course module record (needs ->instance).
     * @return array Decoded manifest, or an empty array when there is none.
     */
    public static function manifest(\stdClass|\cm_info $cm): array {
        global $DB;

        $raw = $DB->get_field('contentcreator', 'manifestjson', ['id' => $cm->instance]);
        if (empty($raw)) {
            return [];
        }
        $decoded = json_decode(manifest_storage::decompress($raw), true);
        return is_array($decoded) ? $decoded : [];
    }

    /**
     * Apply exactly the transformation PARAM_ALPHANUMEXT applies, and nothing else.
     *
     * V15.5.2. This exists to match a client's section id against the one the manifest
     * holds when the two are not byte-identical, and it is only correct if it mangles a
     * string the same way the transport did.
     *
     * Moodle's clean_param() for PARAM_ALPHANUMEXT REMOVES every disallowed character:
     * `preg_replace('/[^A-Za-z0-9_-]/i', '', $param)`. So "pc 1.1" arrives as "pc11".
     *
     * That is deliberately NOT what CcState.safeSectionId() does. The client-side helper
     * SUBSTITUTES an underscore, because its job is to mint a readable id at creation
     * time - "pc 1.1" becomes "pc_1_1" - and an id that has been through it is already
     * clean, so the transport is a no-op on it. The first version of this method copied
     * the substitution, which meant a legacy id normalised to "pc_1_1" on the server and
     * arrived as "pc11" from the transport: the comparison this method exists for could
     * never match, on exactly the manifests it was written to rescue.
     *
     * @param string $id Candidate id.
     * @return string The id with every non-[A-Za-z0-9_-] character removed.
     */
    public static function normalise_section_id(string $id): string {
        return (string)preg_replace('/[^A-Za-z0-9_-]/', '', $id);
    }

    /**
     * Resolve a section id supplied by a client to the id the manifest actually holds.
     *
     * An exact match wins. Failing that, the challenge slide's "<sectionid>_learning"
     * spelling is tried, then a normalised comparison for legacy manifests. A normalised
     * comparison that matches MORE than one section is refused rather than guessed at: two
     * ids that differ only in characters this strips are ambiguous, and grading the wrong
     * section is worse than not grading at all.
     *
     * @param array $manifest Decoded manifest.
     * @param string $claimed Section id as the client sent it.
     * @return string The manifest's own spelling of that id, or '' when it resolves to none.
     */
    public static function resolve_section_id(array $manifest, string $claimed): string {
        $ids = self::section_ids($manifest);
        if ($claimed === '') {
            return '';
        }

        if (in_array($claimed, $ids, true)) {
            return $claimed;
        }

        // The challenge renders on a slide whose slideId is "<sectionid>_learning".
        if (substr($claimed, -9) === '_learning') {
            $stripped = substr($claimed, 0, -9);
            if (in_array($stripped, $ids, true)) {
                return $stripped;
            }
        }

        $wanted = self::normalise_section_id($claimed);
        if ($wanted === '') {
            return '';
        }
        $matches = [];
        foreach ($ids as $id) {
            if (self::normalise_section_id($id) === $wanted) {
                $matches[] = $id;
            }
        }
        if (count($matches) === 1) {
            return $matches[0];
        }
        return '';
    }

    /**
     * Every section id the manifest defines, in order.
     *
     * @param array $manifest Decoded manifest.
     * @return string[] Section ids.
     */
    public static function section_ids(array $manifest): array {
        $ids = [];
        foreach (($manifest['topics'] ?? []) as $topic) {
            foreach (($topic['sections'] ?? []) as $section) {
                $id = (string)($section['id'] ?? '');
                if ($id !== '') {
                    $ids[] = $id;
                }
            }
        }
        return $ids;
    }

    /**
     * Sections that carry a challenge, mapped to the number of questions in it.
     *
     * A section counts as carrying a challenge when it holds a decision-point card.
     * The question count is what that card's `questions` array holds, falling back to
     * 1 for the older single-question shape.
     *
     * @param array $manifest Decoded manifest.
     * @return array<string,int> Section id => question count.
     */
    public static function challenge_sections(array $manifest): array {
        $out = [];

        // An author who has switched the interactive challenge off has no questions to
        // answer, so there is nothing for this class to require.
        $activitysettings = $manifest['activitySettings'] ?? [];
        if (isset($activitysettings['enabled']) && $activitysettings['enabled'] === false) {
            return $out;
        }

        foreach (($manifest['topics'] ?? []) as $topic) {
            foreach (($topic['sections'] ?? []) as $section) {
                $id = (string)($section['id'] ?? '');
                if ($id === '') {
                    continue;
                }
                foreach (($section['cards'] ?? []) as $card) {
                    if (($card['cardType'] ?? '') !== 'decision-point') {
                        continue;
                    }
                    $questions = $card['questions'] ?? null;
                    $count = (is_array($questions) && !empty($questions)) ? count($questions) : 1;
                    // V15.5.2: the FIRST decision-point card only, and the first version of
                    // this accumulated across all of them, which was wrong in a way that
                    // deadlocked completion.
                    //
                    // The player renders each decision-point card as its own challenge, and
                    // each one numbers its questions from zero in its own container. A
                    // server that flattened two cards into one list of six would grade the
                    // second card's question 0 against the FIRST card's question 0, and
                    // would then require six answers while the learner could only ever
                    // supply three - so the activity could never be completed, permanently.
                    //
                    // No route produces a second decision-point card: the seven-card schema,
                    // Policy's six and Topics & Text all specify exactly one, and player5's
                    // own _proseGridClosed guard exists because "nothing in the pipeline
                    // should produce one". Counting the first is therefore exact for every
                    // pack the plugin builds, and for a hand-edited manifest it leaves the
                    // extra card unscored rather than blocking the learner.
                    $out[$id] = $count;
                    break;
                }
            }
        }
        return $out;
    }

    /**
     * Locate a decision-point question and return its option list.
     *
     * @param array $manifest Decoded manifest.
     * @param string $sectionid Section id.
     * @param int $questionindex Zero-based question index within the section's challenge.
     * @return array|null The question's options, or null when the question does not exist.
     */
    public static function question_options(array $manifest, string $sectionid, int $questionindex): ?array {
        $question = self::question_at($manifest, $sectionid, $questionindex);
        if ($question === null) {
            return null;
        }
        $options = $question['options'] ?? null;
        return is_array($options) ? $options : null;
    }

    /**
     * Locate one question of a section's challenge, whole.
     *
     * Decision-point cards come in two shapes. The current one holds a `questions`
     * array; the older one is itself a single question. Both are flattened here into
     * one list in the order a learner meets them, which is the order the player's
     * question index counts in.
     *
     * @param array $manifest Decoded manifest.
     * @param string $sectionid Section id.
     * @param int $questionindex Zero-based question index within the section's challenge.
     * @return array|null The question, or null when it does not exist.
     */
    public static function question_at(array $manifest, string $sectionid, int $questionindex): ?array {
        foreach (($manifest['topics'] ?? []) as $topic) {
            foreach (($topic['sections'] ?? []) as $section) {
                if ((string)($section['id'] ?? '') !== $sectionid) {
                    continue;
                }
                // V15.5.2: the FIRST decision-point card only. The question index arriving
                // from the player is scoped to ONE rendered challenge - see the note in
                // challenge_sections() for why flattening across cards graded the wrong
                // question and deadlocked completion.
                $flat = [];
                foreach (($section['cards'] ?? []) as $card) {
                    if (($card['cardType'] ?? '') !== 'decision-point') {
                        continue;
                    }
                    $questions = $card['questions'] ?? null;
                    if (is_array($questions) && !empty($questions)) {
                        foreach ($questions as $q) {
                            $flat[] = $q;
                        }
                    } else {
                        // Older single-question decision-point: the card IS the question.
                        $flat[] = $card;
                    }
                    break;
                }
                if (!isset($flat[$questionindex]) || !is_array($flat[$questionindex])) {
                    return null;
                }
                return $flat[$questionindex];
            }
        }
        return null;
    }

    /**
     * Which option index is the correct one.
     *
     * Three shapes have been produced over the plugin's life and all three are still
     * found in stored manifests: a per-option `correct` boolean, a per-option
     * `isCorrect` boolean, and a question-level `correctIndex`. The first match wins.
     *
     * @param array $options Option list for one question.
     * @param array|null $question The question, for its correctIndex if the options carry no flag.
     * @return int|null Zero-based index of the correct option, or null when none is marked.
     */
    public static function correct_index(array $options, ?array $question = null): ?int {
        foreach ($options as $i => $opt) {
            if (!is_array($opt)) {
                continue;
            }
            if (!empty($opt['correct']) || !empty($opt['isCorrect'])) {
                return (int)$i;
            }
        }
        if (is_array($question) && isset($question['correctIndex']) && is_numeric($question['correctIndex'])) {
            $idx = (int)$question['correctIndex'];
            if ($idx >= 0 && $idx < count($options)) {
                return $idx;
            }
        }
        return null;
    }

    /**
     * Fetch or build the evidence row for one section.
     *
     * @param int $cmid Course module id.
     * @param int $userid User id.
     * @param string $sectionkey Manifest section id.
     * @return \stdClass The existing row, or an unsaved row with id unset.
     */
    protected static function row(int $cmid, int $userid, string $sectionkey): \stdClass {
        global $DB;

        $existing = $DB->get_record('contentcreator_evidence', [
            'cmid' => $cmid,
            'userid' => $userid,
            'sectionkey' => $sectionkey,
        ]);
        if ($existing) {
            return $existing;
        }

        $row = new \stdClass();
        $row->cmid = $cmid;
        $row->userid = $userid;
        $row->sectionkey = $sectionkey;
        $row->viewed = 0;
        $row->questiontotal = 0;
        $row->questionsanswered = 0;
        $row->questionscorrect = 0;
        $row->answermask = null;
        $row->timecreated = time();
        $row->timemodified = time();
        return $row;
    }

    /**
     * Write a row back, inserting or updating as appropriate.
     *
     * The unique index on (cmid, userid, sectionkey) means two concurrent first-writes
     * race; the loser is caught and folded into the winner rather than failing the
     * request, because losing a section view to a duplicate-key error would cost the
     * learner a completion.
     *
     * @param \stdClass $row Row to persist.
     * @return void
     */
    protected static function save(\stdClass $row): void {
        global $DB;

        $row->timemodified = time();
        if (!empty($row->id)) {
            $DB->update_record('contentcreator_evidence', $row);
            return;
        }
        try {
            $DB->insert_record('contentcreator_evidence', $row);
        } catch (\dml_exception $e) {
            $winner = $DB->get_record('contentcreator_evidence', [
                'cmid' => $row->cmid,
                'userid' => $row->userid,
                'sectionkey' => $row->sectionkey,
            ]);
            if (!$winner) {
                throw $e;
            }
            $winner->viewed = max((int)$winner->viewed, (int)$row->viewed);
            $winner->questiontotal = max((int)$winner->questiontotal, (int)$row->questiontotal);
            $winner->questionsanswered = max((int)$winner->questionsanswered, (int)$row->questionsanswered);
            $winner->questionscorrect = max((int)$winner->questionscorrect, (int)$row->questionscorrect);
            $winner->timemodified = time();
            $DB->update_record('contentcreator_evidence', $winner);
        }
    }

    /**
     * Record that a learner opened a section.
     *
     * The caller must have already established that $sectionkey names a section in this
     * activity's manifest. record_views() below does that check; call it rather than
     * this method when the ids came from a client.
     *
     * @param int $cmid Course module id.
     * @param int $userid User id.
     * @param string $sectionkey Manifest section id.
     * @return void
     */
    public static function record_view(int $cmid, int $userid, string $sectionkey): void {
        $row = self::row($cmid, $userid, $sectionkey);
        if ((int)$row->viewed === 1) {
            return;
        }
        $row->viewed = 1;
        self::save($row);
    }

    /**
     * Record a batch of claimed section views, dropping any that are not real sections.
     *
     * @param int $cmid Course module id.
     * @param int $userid User id.
     * @param array $manifest Decoded manifest.
     * @param string[] $claimed Section ids the client says were viewed.
     * @return int Number of claims that named a real section.
     */
    public static function record_views(int $cmid, int $userid, array $manifest, array $claimed): int {
        $valid = array_flip(self::section_ids($manifest));
        $kept = 0;
        foreach ($claimed as $key) {
            $key = (string)$key;
            // The progress JSON keys a section's challenge as "<sectionid>_learning".
            // Both spellings attest to the same section.
            if (!isset($valid[$key]) && substr($key, -9) === '_learning') {
                $key = substr($key, 0, -9);
            }
            if (!isset($valid[$key])) {
                continue;
            }
            self::record_view($cmid, $userid, $key);
            $kept++;
        }
        return $kept;
    }

    /**
     * Record the outcome of one challenge answer, as graded by the server.
     *
     * Re-answering a question replaces that question's result rather than adding to it,
     * so the counts can never exceed the number of questions the manifest holds.
     *
     * @param int $cmid Course module id.
     * @param int $userid User id.
     * @param string $sectionkey Manifest section id.
     * @param int $questionindex Zero-based question index.
     * @param bool $correct Whether the server graded the answer correct.
     * @param int $questiontotal Questions in this section's challenge.
     * @return void
     */
    public static function record_answer(
        int $cmid,
        int $userid,
        string $sectionkey,
        int $questionindex,
        bool $correct,
        int $questiontotal
    ): void {
        $row = self::row($cmid, $userid, $sectionkey);

        $tally = self::apply_answer(
            $row->answermask,
            $questionindex,
            $correct,
            $questiontotal
        );

        $row->answermask = $tally['mask'];
        $row->questiontotal = $questiontotal;
        $row->questionsanswered = $tally['answered'];
        $row->questionscorrect = $tally['correct'];
        // Answering a question in a section is proof of having opened it.
        $row->viewed = 1;
        self::save($row);
    }

    /**
     * Fold one graded answer into a stored answer mask and re-tally it.
     *
     * V15.5.4: extracted from record_answer() so it can be tested without a database.
     * The counting here decides whether a learner's activity can ever be completed, and
     * three of its rules are only obvious once written down:
     *
     * - **Re-answering REPLACES.** The mask is keyed by question index, so a learner who
     *   answers question 1 twice is recorded once. Without this, questionsanswered would
     *   climb past questiontotal and the comparison in all_challenges_answered() would
     *   pass for the wrong reason.
     * - **Out-of-range entries are DROPPED.** An author who edits a challenge from five
     *   questions down to three leaves answers for questions 3 and 4 in the mask. Keeping
     *   them would hold questionsanswered at five against a total of three forever - and
     *   dropping them is safe because the questions no longer exist to be answered.
     * - **questionsanswered can never exceed questiontotal**, because only in-range keys
     *   are counted. That is the invariant completion depends on.
     *
     * @param string|null $storedmask The row's existing answermask JSON, or null.
     * @param int $questionindex Zero-based index of the question just answered.
     * @param bool $correct Whether the server graded it correct.
     * @param int $questiontotal Questions the manifest holds for this challenge.
     * @return array{mask: string, answered: int, correct: int} The new mask and its tally.
     */
    public static function apply_answer(
        ?string $storedmask,
        int $questionindex,
        bool $correct,
        int $questiontotal
    ): array {
        $mask = [];
        if (!empty($storedmask)) {
            $decoded = json_decode($storedmask, true);
            if (is_array($decoded)) {
                $mask = $decoded;
            }
        }
        $mask[(string)$questionindex] = $correct ? 1 : 0;

        $answered = 0;
        $correctcount = 0;
        foreach ($mask as $qi => $result) {
            if ((int)$qi < 0 || (int)$qi >= $questiontotal) {
                unset($mask[$qi]);
                continue;
            }
            $answered++;
            if ((int)$result === 1) {
                $correctcount++;
            }
        }

        return [
            // The (object) cast forces an object. Without it, json_encode() on a mask
            // whose keys happen to be sequential emits a LIST, and the same data is
            // stored in two different shapes depending on which questions were answered.
            'mask' => json_encode((object)$mask),
            'answered' => $answered,
            'correct' => $correctcount,
        ];
    }

    /**
     * Every evidence row this user holds for this course module, keyed by section.
     *
     * @param int $cmid Course module id.
     * @param int $userid User id.
     * @return array<string,\stdClass> Section id => row.
     */
    public static function rows(int $cmid, int $userid): array {
        global $DB;

        $records = $DB->get_records('contentcreator_evidence', ['cmid' => $cmid, 'userid' => $userid]);
        $out = [];
        foreach ($records as $record) {
            $out[$record->sectionkey] = $record;
        }
        return $out;
    }

    /**
     * Has the learner opened every section the manifest defines?
     *
     * @param \stdClass|\cm_info $cm Course module record.
     * @param int $userid User id.
     * @param array|null $manifest Decoded manifest, fetched when not supplied.
     * @return bool
     */
    public static function all_sections_viewed(\stdClass|\cm_info $cm, int $userid, ?array $manifest = null): bool {
        $manifest = $manifest ?? self::manifest($cm);
        $sections = self::section_ids($manifest);
        if (empty($sections)) {
            // No content has been generated yet. There is nothing to view, so there is
            // nothing to withhold completion for.
            return true;
        }
        $rows = self::rows((int)$cm->id, $userid);
        foreach ($sections as $id) {
            if (empty($rows[$id]) || (int)$rows[$id]->viewed !== 1) {
                return false;
            }
        }
        return true;
    }

    /**
     * Has the learner answered every question in every challenge?
     *
     * Answering, not passing. The challenge is formative and carries no score into the
     * gradebook; v15.4.6 removed Try Again from the quiz precisely so that a learner is
     * not made to guess until they hit the right option. The bar for completion is
     * therefore that every question was engaged with, and the server knows that because
     * the server graded each one.
     *
     * @param \stdClass|\cm_info $cm Course module record.
     * @param int $userid User id.
     * @param array|null $manifest Decoded manifest, fetched when not supplied.
     * @return bool
     */
    public static function all_challenges_answered(\stdClass|\cm_info $cm, int $userid, ?array $manifest = null): bool {
        $manifest = $manifest ?? self::manifest($cm);
        $challenges = self::challenge_sections($manifest);
        if (empty($challenges)) {
            return true;
        }
        $rows = self::rows((int)$cm->id, $userid);
        foreach ($challenges as $sectionid => $total) {
            if (empty($rows[$sectionid])) {
                return false;
            }
            if ((int)$rows[$sectionid]->questionsanswered < (int)$total) {
                return false;
            }
        }
        return true;
    }

    /**
     * Whether this learner's activity is complete, as the server sees it.
     *
     * Sticky: a completion recorded before this release, when the browser was the
     * authority, is honoured. The evidence table starts empty at upgrade, so
     * recomputing without this would revoke every completion on the site - including
     * ones an RTO has already reported to a funding body. New completions are earned
     * against the evidence.
     *
     * @param \stdClass|\cm_info $cm Course module record.
     * @param int $userid User id.
     * @param array|null $manifest Decoded manifest, fetched when not supplied.
     * @return bool
     */
    public static function is_complete(\stdClass|\cm_info $cm, int $userid, ?array $manifest = null): bool {
        global $DB;

        $already = $DB->get_field('contentcreator_attempts', 'completed', [
            'contentcreatorid' => $cm->instance,
            'userid' => $userid,
        ]);
        if (!empty($already)) {
            return true;
        }

        $manifest = $manifest ?? self::manifest($cm);
        return self::all_sections_viewed($cm, $userid, $manifest)
            && self::all_challenges_answered($cm, $userid, $manifest);
    }

    /**
     * Delete every evidence row for a course module. Used by course/module deletion.
     *
     * @param int $cmid Course module id.
     * @return void
     */
    public static function delete_for_cm(int $cmid): void {
        global $DB;
        $DB->delete_records('contentcreator_evidence', ['cmid' => $cmid]);
    }
}
