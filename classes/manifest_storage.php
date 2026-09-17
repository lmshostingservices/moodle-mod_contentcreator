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
 * Content Creator - Manifest storage helper (compress/decompress)
 *
 * v11.48 FIX BUG-CC-DBWRITE: MySQL max_allowed_packet rejects large UPDATE payloads.
 * A fully-generated manifest for a VET unit with voiceover can reach 6–10 MB as raw
 * JSON. MySQL's default max_allowed_packet (4 MB on many hosts) causes $DB->update_record()
 * to throw "Error writing to database" — regardless of retries, because the query itself
 * is too large to transmit.
 *
 * Fix: gzip-compress the manifest JSON before every DB write and decompress after every
 * DB read. A 6 MB manifest compresses to ~600 KB; base64 encoding adds ~33%, giving
 * ~800 KB — well under any reasonable max_allowed_packet. Old uncompressed manifests
 * (no 'gz:' prefix) are returned as-is so existing data is read correctly.
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace mod_contentcreator;

/**
 * Compresses and decompresses the manifest JSON blob stored on the activity record.
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class manifest_storage {
    /** Manifests smaller than this are stored raw (no compression overhead needed). */
    const COMPRESS_THRESHOLD = 524288;

    /**
     * Compress manifest JSON for storage.
     * Returns the original string unchanged if compression is unnecessary or fails.
     *
     * @param string $json Raw manifest JSON string.
     * @return string Compressed 'gz:<base64>' string, or original JSON if below threshold.
     */
    public static function compress(string $json): string {
        if (strlen($json) < self::COMPRESS_THRESHOLD) {
            return $json;
        }
        $gz = gzencode($json, 6);
        if ($gz === false) {
            debugging(
                'Content Creator gzencode() failed, storing raw JSON (' . strlen($json) . ' bytes).',
                DEBUG_DEVELOPER
            );
            return $json;
        }
        $stored = 'gz:' . base64_encode($gz);
        debugging(
            'Content Creator compressed manifest ' . round(strlen($json) / 1024) . ' KB to ' .
                round(strlen($stored) / 1024) . ' KB.',
            DEBUG_DEVELOPER
        );
        return $stored;
    }

    /**
     * Decompress manifest from storage.
     * Returns the original string unchanged if it is not in compressed format
     * (backward-compatible with manifests stored before v11.48).
     *
     * @param string $stored Value read from the manifestjson DB column.
     * @return string Raw manifest JSON string.
     */
    public static function decompress(string $stored): string {
        if (substr($stored, 0, 3) !== 'gz:') {
            return $stored;
        }
        $decoded = base64_decode(substr($stored, 3), true);
        if ($decoded === false) {
            debugging('Content Creator base64_decode() failed, returning the stored value as-is.', DEBUG_DEVELOPER);
            return $stored;
        }
        $json = gzdecode($decoded);
        if ($json === false) {
            debugging('Content Creator gzdecode() failed, returning the stored value as-is.', DEBUG_DEVELOPER);
            return $stored;
        }
        return $json;
    }

    /**
     * Remove the answer key from a manifest before it is sent to a learner.
     *
     * V15.5.0 FIX-CC-ANSWER-IN-DOM. Decision-point options carried four things that name
     * the answer: `correct` / `isCorrect` on the winning option, `correctIndex` on the
     * question, `feedback` on every option (which reads "Correct! ..." on the right one),
     * and `feedbackAudioUrl`, the pre-generated narration of that same feedback. A
     * learner could read the first three in the network tab and play the fourth.
     *
     * Everything else is left exactly as it was - option text, question text, ordering,
     * card structure - because the player renders from this and the only thing it must no
     * longer be able to do is answer the question on the learner's behalf.
     * mod_contentcreator_check_answer returns the verdict, the chosen option's feedback
     * and its clip after the learner commits.
     *
     * Deliberately narrow: only cards whose cardType is decision-point are touched, and
     * only inside their options. A `correct` field anywhere else in the manifest is some
     * other feature's and is none of this method's business.
     *
     * @param string $rawmanifest Decompressed manifest JSON.
     * @return string Manifest JSON with the answer key removed, or the input unchanged
     *                when it does not parse - a manifest this method cannot read is one
     *                it must not silently blank.
     */
    public static function strip_answer_key(string $rawmanifest): string {
        if (trim($rawmanifest) === '') {
            return $rawmanifest;
        }

        $manifest = json_decode($rawmanifest, true);
        if (!is_array($manifest) || empty($manifest['topics']) || !is_array($manifest['topics'])) {
            return $rawmanifest;
        }

        $stripped = false;

        foreach ($manifest['topics'] as &$topic) {
            if (!is_array($topic) || empty($topic['sections']) || !is_array($topic['sections'])) {
                continue;
            }
            foreach ($topic['sections'] as &$section) {
                if (!is_array($section) || empty($section['cards']) || !is_array($section['cards'])) {
                    continue;
                }
                foreach ($section['cards'] as &$card) {
                    if (!is_array($card) || ($card['cardType'] ?? '') !== 'decision-point') {
                        continue;
                    }

                    // The current shape holds a questions array; the older one is itself a
                    // single question. Both are handled, because both are still in stored
                    // manifests on live sites.
                    if (!empty($card['questions']) && is_array($card['questions'])) {
                        foreach ($card['questions'] as &$question) {
                            if (is_array($question)) {
                                self::strip_question_answer_key($question, $stripped);
                            }
                        }
                        unset($question);
                    }
                    self::strip_question_answer_key($card, $stripped);
                }
                unset($card);
            }
            unset($section);
        }
        unset($topic);

        if (!$stripped) {
            return $rawmanifest;
        }

        $encoded = json_encode($manifest);
        // A re-encode that fails - invalid UTF-8 surviving from an old import, say -
        // must not hand the learner an empty activity. Better the answer key than a
        // blank screen, and the failure is loud in developer debugging.
        if ($encoded === false) {
            debugging(
                'Content Creator could not re-encode the manifest after stripping the answer key; '
                    . 'sending it unchanged.',
                DEBUG_DEVELOPER
            );
            return $rawmanifest;
        }
        return $encoded;
    }

    /**
     * Strip the answer-bearing fields from one question in place.
     *
     * @param array $question Question or legacy single-question card, modified in place.
     * @param bool $stripped Set to true when something was removed.
     * @return void
     */
    protected static function strip_question_answer_key(array &$question, bool &$stripped): void {
        if (isset($question['correctIndex'])) {
            unset($question['correctIndex']);
            $stripped = true;
        }
        if (isset($question['correctAnswer'])) {
            unset($question['correctAnswer']);
            $stripped = true;
        }
        if (empty($question['options']) || !is_array($question['options'])) {
            return;
        }
        foreach ($question['options'] as &$option) {
            if (!is_array($option)) {
                continue;
            }
            foreach (['correct', 'isCorrect', 'feedback', 'feedbackAudioUrl'] as $field) {
                if (array_key_exists($field, $option)) {
                    unset($option[$field]);
                    $stripped = true;
                }
            }
        }
        unset($option);
    }
}
