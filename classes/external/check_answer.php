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
 * Content Creator - Server-side challenge grading
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace mod_contentcreator\external;

use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_single_structure;
use core_external\external_value;
use context_module;

/**
 * Grade one challenge answer against the answer key held on the server.
 *
 * V15.5.0 FIX-CC-ANSWER-IN-DOM. The challenge used to be graded entirely in the
 * browser: cc-card-slots.js wrote data-correct="true" onto the winning option, put
 * every option's feedback into the markup next to it, and flagged the right answer
 * with a hidden span. A learner with the Elements panel open could read the answer
 * before clicking, and the click handler's verdict was the only thing recorded.
 *
 * Grading now happens here. The option list is re-read from the stored manifest, the
 * verdict is decided on the server, the result is written to the evidence table that
 * completion reads, and the response carries back only what the learner has now
 * earned the right to see: whether they were right, the feedback for the option they
 * actually chose, and - once they have committed to an answer - which option was
 * correct and why.
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class check_answer extends external_api {
    /**
     * Describes the parameters for execute().
     *
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters(
            [
                'cmid' => new external_value(PARAM_INT, 'Course module ID'),
                // V15.5.2: PARAM_ALPHANUMEXT, and deliberately not an unfiltered type.
                //
                // The first version of this took an unfiltered string, reasoning that a
                // section id is author-opaque and that narrowing it might reject a valid
                // manifest. That was the wrong end to fix. A section id is not only a web
                // service parameter: the player concatenates it into jQuery selectors in
                // ten places, and a quote in one of those throws and takes the handler with
                // it. An id that needs an unfiltered parameter type to survive the trip is
                // an id that should never have been allowed to contain those characters.
                //
                // So ids are constrained where they are created instead - see
                // CcState.safeSectionId() in cc-state.js - and this parameter now takes the
                // matching type. Manifests generated before that change can still hold an
                // unconstrained id; evidence::resolve_section_id() matches those by
                // comparing both sides through the same normalisation, so a legacy pack
                // keeps working.
                'sectionid' => new external_value(PARAM_ALPHANUMEXT, 'Manifest section id'),
                'questionindex' => new external_value(PARAM_INT, 'Zero-based question index'),
                'optionindex' => new external_value(PARAM_INT, 'Zero-based index of the chosen option, in manifest order'),
            ]
        );
    }

    /**
     * Grade the chosen option and record the result.
     *
     * @param int $cmid Course module id.
     * @param string $sectionid Manifest section id.
     * @param int $questionindex Zero-based question index.
     * @param int $optionindex Zero-based option index in manifest order.
     * @return array Result structure as described by execute_returns().
     */
    public static function execute(int $cmid, string $sectionid, int $questionindex, int $optionindex): array {
        global $USER;

        $params = self::validate_parameters(
            self::execute_parameters(),
            [
                'cmid' => $cmid,
                'sectionid' => $sectionid,
                'questionindex' => $questionindex,
                'optionindex' => $optionindex,
            ]
        );

        $cm = get_coursemodule_from_id('contentcreator', $params['cmid'], 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        self::validate_context($context);

        require_capability('mod/contentcreator:view', $context);

        $manifest = \mod_contentcreator\evidence::manifest($cm);

        // The player reads the id off the slide wrapper, which carries
        // `section.slideId || section.id`. A section's CHALLENGE renders on a slide whose
        // slideId is "<sectionid>_learning" - the same spelling custom_completion has used
        // for the challengeComplete key since v11. resolve_section_id() handles that, an
        // exact match, and the normalised comparison that keeps pre-v15.5.2 manifests
        // working. It returns the MANIFEST's own spelling, so everything downstream - the
        // question lookup, the question count, and the evidence row - is keyed on one
        // value that the server chose rather than on whatever the client sent.
        $sectionid = \mod_contentcreator\evidence::resolve_section_id($manifest, $params['sectionid']);
        if ($sectionid === '') {
            throw new \moodle_exception('errorsectionnotinactivity', 'mod_contentcreator');
        }
        $params['sectionid'] = $sectionid;

        $question = \mod_contentcreator\evidence::question_at(
            $manifest,
            $sectionid,
            $params['questionindex']
        );

        if ($question === null) {
            throw new \moodle_exception('errorquestionnotfound', 'mod_contentcreator');
        }

        $options = $question['options'] ?? [];
        if (!is_array($options) || empty($options)) {
            throw new \moodle_exception('errorquestionnotfound', 'mod_contentcreator');
        }

        if ($params['optionindex'] < 0 || $params['optionindex'] >= count($options)) {
            throw new \moodle_exception('erroroptionnotfound', 'mod_contentcreator');
        }

        $correctindex = \mod_contentcreator\evidence::correct_index($options, $question);

        // A question with nothing marked correct is an authoring defect, not a learner
        // failure. Accept the answer, record it as answered, and say nothing about
        // correctness - which is what the player renders when iscorrect comes back with
        // correctindex at -1.
        $graded = ($correctindex !== null);
        $iscorrect = $graded && ((int)$params['optionindex'] === (int)$correctindex);

        // How many questions this section's challenge holds, so record_answer() knows
        // when the learner has finished it. challenge_sections() returns 0 entries when
        // the author has switched challenges off, in which case a stray answer still
        // counts as one question out of one rather than dividing by nothing.
        $challenges = \mod_contentcreator\evidence::challenge_sections($manifest);
        $questiontotal = (int)($challenges[$params['sectionid']] ?? 1);
        if ($questiontotal < 1) {
            $questiontotal = 1;
        }

        \mod_contentcreator\evidence::record_answer(
            (int)$cm->id,
            (int)$USER->id,
            $params['sectionid'],
            (int)$params['questionindex'],
            $iscorrect,
            $questiontotal
        );

        // Re-evaluate completion: this answer may have been the last one outstanding.
        $completion = new \completion_info(get_course($cm->course));
        if ($completion->is_enabled($cm)) {
            $completion->update_state($cm, COMPLETION_UNKNOWN, $USER->id);
        }

        $chosen = $options[$params['optionindex']];
        $chosenfeedback = is_array($chosen) ? (string)($chosen['feedback'] ?? '') : '';

        // The v13.93 pre-generated feedback narration. Its URL used to sit on every option
        // in the markup, which meant a learner could play every clip and hear which one
        // starts "Correct!". It is stripped from the learner's manifest now and returned
        // here for the one option they actually chose - so the audio behaviour v15.4.27
        // settled on (their own answer's clip, or silence) is unchanged.
        $chosenaudio = is_array($chosen) ? (string)($chosen['feedbackAudioUrl'] ?? '') : '';

        // The correct option is disclosed only now, after the learner has committed.
        // Before this call the browser held no way of knowing it.
        $correctfeedback = '';
        if ($graded && !$iscorrect && isset($options[$correctindex]) && is_array($options[$correctindex])) {
            $correctfeedback = (string)($options[$correctindex]['feedback'] ?? '');
        }

        return [
            'success' => true,
            'graded' => $graded,
            'iscorrect' => $iscorrect,
            'correctindex' => $graded ? (int)$correctindex : -1,
            'feedback' => $chosenfeedback,
            'correctfeedback' => $correctfeedback,
            'feedbackaudiourl' => $chosenaudio,
        ];
    }

    /**
     * Describes the return value for execute().
     *
     * @return external_single_structure
     */
    public static function execute_returns(): external_single_structure {
        return new external_single_structure(
            [
                'success' => new external_value(PARAM_BOOL, 'Success status'),
                'graded' => new external_value(PARAM_BOOL, 'False when the question has no option marked correct'),
                'iscorrect' => new external_value(PARAM_BOOL, 'Whether the chosen option is the correct one'),
                'correctindex' => new external_value(PARAM_INT, 'Index of the correct option, or -1 when ungraded'),
                'feedback' => new external_value(
                    PARAM_RAW, // Pipeline-ignore: PARAM_RAW - author text, escaped by the player before insertion.
                    'Feedback for the option the learner chose',
                ),
                'correctfeedback' => new external_value(
                    PARAM_RAW, // Pipeline-ignore: PARAM_RAW - author text, escaped by the player before insertion.
                    'Feedback for the correct option, sent only after a wrong answer',
                ),
                'feedbackaudiourl' => new external_value(
                    PARAM_URL,
                    'Pre-generated narration for the chosen option\'s feedback, empty when there is none',
                ),
            ]
        );
    }
}
