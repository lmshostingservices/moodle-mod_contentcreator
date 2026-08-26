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
 * Content Creator - Save slide edit external function
 * Allows teachers to edit individual slide content and optionally regenerate voiceover.
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
use context_course;

/**
 * External function that saves teacher edits to a single slide/section.
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class save_slide_edit extends external_api {
    /**
     * Describes the parameters for execute().
     *
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'cmid' => new external_value(PARAM_INT, 'Course module ID'),
            'topicId' => new external_value(PARAM_TEXT, 'Topic ID'),
            'sectionId' => new external_value(PARAM_TEXT, 'Section ID'),
            'title' => new external_value(PARAM_TEXT, 'Section title'),
            'description' => new external_value(PARAM_TEXT, 'Section description', VALUE_DEFAULT, ''),
            // Raw.
            'requirements' => new external_value(
                PARAM_RAW, // pipeline-ignore: PARAM_RAW - JSON or free-form text, decoded and validated on use.
                'JSON array of requirements',
                VALUE_DEFAULT,
                '[]',
            ),
            // Raw.
            'doList' => new external_value(
                PARAM_RAW, // pipeline-ignore: PARAM_RAW - JSON or free-form text, decoded and validated on use.
                'JSON array of do items',
                VALUE_DEFAULT,
                '[]',
            ),
            // Raw.
            'dontList' => new external_value(
                PARAM_RAW, // pipeline-ignore: PARAM_RAW - JSON or free-form text, decoded and validated on use.
                'JSON array of dont items',
                VALUE_DEFAULT,
                '[]',
            ),
            // Version 6.6.82: Layer 2 content fields for full slide editing
            // raw.
            'scenario' => new external_value(
                PARAM_RAW, // pipeline-ignore: PARAM_RAW - JSON or free-form text, decoded and validated on use.
                'Scenario/situation text',
                VALUE_DEFAULT,
                '',
            ),
            // Raw.
            'decision' => new external_value(
                PARAM_RAW, // pipeline-ignore: PARAM_RAW - JSON or free-form text, decoded and validated on use.
                'Decision point text',
                VALUE_DEFAULT,
                '',
            ),
            // Raw.
            'correctResponse' => new external_value(
                PARAM_RAW, // pipeline-ignore: PARAM_RAW - JSON or free-form text, decoded and validated on use.
                'JSON object with action, why, communicate',
                VALUE_DEFAULT,
                '{}',
            ),
            // Version 7.7.9: 5-card feedback and content linking
            // raw.
            'feedback' => new external_value(
                PARAM_RAW, // pipeline-ignore: PARAM_RAW - JSON or free-form text, decoded and validated on use.
                'JSON object with correctExplanation, incorrectConsequence, keyTakeaway',
                VALUE_DEFAULT,
                '{}',
            ),
            // Raw.
            'linkedContent' => new external_value(
                PARAM_RAW, // pipeline-ignore: PARAM_RAW - JSON or free-form text, decoded and validated on use.
                'JSON array of linked content items',
                VALUE_DEFAULT,
                '[]',
            ),
            // Version 9.78 FIX (A-07): 11 fields were collected in the edit modal but never
            // sent to this external function. Teachers' edits were saved to localStorage
            // only and reverted to AI-generated values on the next page load from the DB.
            'scenarioTitle' => new external_value(PARAM_TEXT, 'Scenario slide title', VALUE_DEFAULT, ''),
            'scenarioRole' => new external_value(PARAM_TEXT, 'Scenario learner role', VALUE_DEFAULT, ''),
            // Raw.
            'scenarioContext' => new external_value(
                PARAM_RAW, // pipeline-ignore: PARAM_RAW - JSON or free-form text, decoded and validated on use.
                'Scenario context text',
                VALUE_DEFAULT,
                '',
            ),
            // Raw.
            'scenarioComplication' => new external_value(
                PARAM_RAW, // pipeline-ignore: PARAM_RAW - JSON or free-form text, decoded and validated on use.
                'Scenario complication text',
                VALUE_DEFAULT,
                '',
            ),
            // Raw.
            'mentalModel' => new external_value(
                PARAM_RAW, // pipeline-ignore: PARAM_RAW - JSON or free-form text, decoded and validated on use.
                'JSON: {name, principle} or null',
                VALUE_DEFAULT,
                '',
            ),
            // Raw.
            'predictionPrompt' => new external_value(
                PARAM_RAW, // pipeline-ignore: PARAM_RAW - JSON or free-form text, decoded and validated on use.
                'JSON: {question, options[]} or null',
                VALUE_DEFAULT,
                '',
            ),
            // Raw.
            'terminology' => new external_value(
                PARAM_RAW, // pipeline-ignore: PARAM_RAW - JSON or free-form text, decoded and validated on use.
                'JSON array of {term, definition} objects',
                VALUE_DEFAULT,
                '[]',
            ),
            'keyTakeaway' => new external_value(PARAM_TEXT, 'Key takeaway accent card text', VALUE_DEFAULT, ''),
            'proTip' => new external_value(PARAM_TEXT, 'Pro tip accent card text', VALUE_DEFAULT, ''),
            'keyInfo' => new external_value(PARAM_TEXT, 'Key info accent card text', VALUE_DEFAULT, ''),
            'expertInsight' => new external_value(PARAM_TEXT, 'Expert insight accent card text', VALUE_DEFAULT, ''),
            // Version 9.87: voiceoverText (Introduction) was edited locally but never sent to server — edits lost on reload
            // raw.
            'voiceoverText' => new external_value(
                PARAM_RAW, // pipeline-ignore: PARAM_RAW - JSON or free-form text, decoded and validated on use.
                'Introduction / voiceover text shown above knowledge section',
                VALUE_DEFAULT,
                '',
            ),
            // Version 9.87: cardData stores all route-card-specific fields (18 card types × multiple fields)
            // avoids adding dozens of individual parameters for every card type field
            // raw.
            'cardData' => new external_value(
                PARAM_RAW, // pipeline-ignore: PARAM_RAW - JSON or free-form text, decoded and validated on use.
                'JSON object with route-card-specific fields (heading, bodyText, steps, risks, etc)',
                VALUE_DEFAULT,
                '{}',
            ),
            // Version 10.42: cardsData — JSON array of per-card updates for 7-card unified sections (section.cards[i])
            // raw.
            'cardsData' => new external_value(
                PARAM_RAW, // pipeline-ignore: PARAM_RAW - JSON or free-form text, decoded and validated on use.
                'JSON array of per-card updates indexed by card position',
                VALUE_DEFAULT,
                '[]',
            ),
            'regenerateVoiceover' => new external_value(PARAM_BOOL, 'Regenerate voiceover (costs 5 credits)', VALUE_DEFAULT, false),
        ]);
    }

    /**
     * Apply a teacher's slide edits to the stored manifest.
     *
     * All string parameters carry either plain authoring text or a JSON blob; see
     * execute_parameters() for the meaning of each one.
     *
     * @param int $cmid Course module id.
     * @param string $topicid Topic id.
     * @param string $sectionid Section id.
     * @param string $title Section title.
     * @param string $description Section description.
     * @param string $requirements JSON array of requirements.
     * @param string $dolist JSON array of do items.
     * @param string $dontlist JSON array of dont items.
     * @param string $scenario Scenario text.
     * @param string $decision Decision point text.
     * @param string $correctresponse JSON object with action, why and communicate.
     * @param string $feedback JSON object with the three feedback fields.
     * @param string $linkedcontent JSON array of linked content items.
     * @param string $scenariotitle Scenario slide title.
     * @param string $scenariorole Scenario learner role.
     * @param string $scenariocontext Scenario context text.
     * @param string $scenariocomplication Scenario complication text.
     * @param string $mentalmodel JSON object with name and principle.
     * @param string $predictionprompt JSON object with question and options.
     * @param string $terminology JSON array of term and definition objects.
     * @param string $keytakeaway Key takeaway accent card text.
     * @param string $protip Pro tip accent card text.
     * @param string $keyinfo Key info accent card text.
     * @param string $expertinsight Expert insight accent card text.
     * @param string $voiceovertext Introduction / voiceover text.
     * @param string $carddata JSON object of route-card-specific fields.
     * @param string $cardsdata JSON array of per-card updates.
     * @param bool $regeneratevoiceover Whether to flag the voiceover for regeneration.
     * @return array Result structure as described by execute_returns().
     */
    public static function execute(
        int $cmid,
        string $topicid,
        string $sectionid,
        string $title,
        string $description = '',
        string $requirements = '[]',
        string $dolist = '[]',
        string $dontlist = '[]',
        string $scenario = '',
        string $decision = '',
        string $correctresponse = '{}',
        string $feedback = '{}',
        string $linkedcontent = '[]',
        string $scenariotitle = '',
        string $scenariorole = '',
        string $scenariocontext = '',
        string $scenariocomplication = '',
        string $mentalmodel = '',
        string $predictionprompt = '',
        string $terminology = '[]',
        string $keytakeaway = '',
        string $protip = '',
        string $keyinfo = '',
        string $expertinsight = '',
        string $voiceovertext = '',
        string $carddata = '{}',
        string $cardsdata = '[]',
        bool $regeneratevoiceover = false
    ): array {
        global $DB;

        try {
            $params = self::validate_parameters(self::execute_parameters(), [
                'cmid' => $cmid,
                'topicId' => $topicid,
                'sectionId' => $sectionid,
                'title' => $title,
                'description' => $description,
                'requirements' => $requirements,
                'doList' => $dolist,
                'dontList' => $dontlist,
                'scenario' => $scenario,
                'decision' => $decision,
                'correctResponse' => $correctresponse,
                'feedback' => $feedback,
                'linkedContent' => $linkedcontent,
                'scenarioTitle' => $scenariotitle,
                'scenarioRole' => $scenariorole,
                'scenarioContext' => $scenariocontext,
                'scenarioComplication' => $scenariocomplication,
                'mentalModel' => $mentalmodel,
                'predictionPrompt' => $predictionprompt,
                'terminology' => $terminology,
                'keyTakeaway' => $keytakeaway,
                'proTip' => $protip,
                'keyInfo' => $keyinfo,
                'expertInsight' => $expertinsight,
                'voiceoverText' => $voiceovertext,
                'cardData' => $carddata,
                'cardsData' => $cardsdata,
                'regenerateVoiceover' => $regeneratevoiceover,
            ]);

            $cm = get_coursemodule_from_id('contentcreator', $params['cmid'], 0, false, MUST_EXIST);
            $context = context_module::instance($cm->id);
            self::validate_context($context);

            // Version 11.40 FIX (BUG-CC-SSLIDE-PERM): Mirror the flexible capability check from
            // ajax.php and the other save externals (save_manifest, save_manifest_chunk).
            // The original require_capability('mod/contentcreator:addinstance', $context)
            // was too strict — custom roles cloned from editingteacher do not automatically
            // inherit new plugin capabilities, so legitimate editing teachers received
            // "Failed to save generated content" on every slide-edit save.
            // Fix: check mod/contentcreator:manage first (module context), fall back to
            // moodle/course:manageactivities in the course context — every genuine editing
            // teacher has this regardless of whether their cloned role explicitly lists
            // mod/contentcreator capabilities.
            // v13.86: the moodle/course:manageactivities fallback was removed. It made
            // mod/contentcreator:manage advisory - a CAP_PROHIBIT on it denied nothing.
            // Roles that already hold manageactivities are granted :manage by the
            // upgrade step in db/upgrade.php, so no legitimate editing teacher loses
            // access.
            require_capability('mod/contentcreator:manage', $context);

            // Version 11.40 FIX (BUG-CC-SSLIDE-SESSION): Release session lock before DB read+write.
            // Holding the session file lock during manifest JSON decode+encode (potentially
            // several hundred KB) blocks all concurrent requests from the same user session.
            \core\session\manager::write_close();

            $contentcreator = $DB->get_record('contentcreator', ['id' => $cm->instance], '*', MUST_EXIST);

            if (empty($contentcreator->manifestjson)) {
                return [
                    'success' => false,
                    'message' => get_string('errornomanifest', 'mod_contentcreator'),
                    'creditsUsed' => 0,
                ];
            }

            // Version 11.48 FIX BUG-CC-DBWRITE: decompress before json_decode (may be gz: compressed).
            $manifest = json_decode(\mod_contentcreator\manifest_storage::decompress($contentcreator->manifestjson), true);

            if (json_last_error() !== JSON_ERROR_NONE || !is_array($manifest) || !isset($manifest['topics'])) {
                return [
                    'success' => false,
                    'message' => get_string('errorinvalidmanifest', 'mod_contentcreator'),
                    'creditsUsed' => 0,
                ];
            }

            $requirementsarr = json_decode($params['requirements'], true) ?: [];
            $dolistarr = json_decode($params['doList'], true) ?: [];
            $dontlistarr = json_decode($params['dontList'], true) ?: [];
            // Version 6.6.82: Layer 2 content.
            $correctresponsearr = json_decode($params['correctResponse'], true) ?: [];
            // Version 7.7.9: 5-card feedback and content linking.
            $feedbackarr = json_decode($params['feedback'], true) ?: [];
            $linkedcontentarr = json_decode($params['linkedContent'], true) ?: [];
            // Version 9.78 FIX (A-07): parse new fields.
            $terminologyarr = json_decode($params['terminology'], true) ?: [];
            $mentalmodelval = ($params['mentalModel'] !== '' && $params['mentalModel'] !== 'null')
                ? json_decode($params['mentalModel'], true) : null;
            $predictionpromptval = ($params['predictionPrompt'] !== '' && $params['predictionPrompt'] !== 'null')
                ? json_decode($params['predictionPrompt'], true) : null;

            $sectionfound = false;
            $creditsused = 0;

            foreach ($manifest['topics'] as &$topic) {
                if ($topic['id'] === $params['topicId']) {
                    foreach ($topic['sections'] as &$section) {
                        if ($section['id'] === $params['sectionId']) {
                            $section['title'] = $params['title'];
                            $section['description'] = $params['description'];
                            $section['requirements'] = $requirementsarr;
                            $section['doList'] = $dolistarr;
                            $section['dontList'] = $dontlistarr;
                            // Version 6.6.82: Layer 2 content fields.
                            if (!empty($params['scenario'])) {
                                $section['scenario'] = $params['scenario'];
                            }
                            if (!empty($params['decision'])) {
                                $section['decision'] = $params['decision'];
                            }
                            if (!empty($correctresponsearr)) {
                                $section['correctResponse'] = $correctresponsearr;
                            }
                            // Version 7.7.9: Save feedback to section.feedback (not outcome!) for player5 to read.
                            $hasfeedback = !empty($feedbackarr) && (
                                !empty($feedbackarr['correctExplanation'])
                                || !empty($feedbackarr['incorrectConsequence'])
                                || !empty($feedbackarr['keyTakeaway'])
                            );
                            if ($hasfeedback) {
                                $section['feedback'] = $feedbackarr;
                            }
                            // Version 7.7.9: Save linked content.
                            if (!empty($linkedcontentarr)) {
                                $section['linkedContent'] = $linkedcontentarr;
                            }
                            // Version 9.78 FIX (A-07): Save previously dropped fields to the DB manifest
                            // so teacher edits survive page refresh and new student sessions.
                            if (!empty($terminologyarr)) {
                                $section['terminology'] = $terminologyarr;
                            }
                            if (!empty($params['keyTakeaway'])) {
                                $section['keyTakeaway'] = $params['keyTakeaway'];
                            } else if (isset($params['keyTakeaway']) && $params['keyTakeaway'] === '') {
                                // Explicit clear — teacher removed the text.
                                $section['keyTakeaway'] = '';
                            }
                            if (!empty($params['proTip'])) {
                                $section['proTip'] = $params['proTip'];
                            } else if (isset($params['proTip']) && $params['proTip'] === '') {
                                $section['proTip'] = '';
                            }
                            if (!empty($params['keyInfo'])) {
                                $section['keyInfo'] = $params['keyInfo'];
                            } else if (isset($params['keyInfo']) && $params['keyInfo'] === '') {
                                $section['keyInfo'] = '';
                            }
                            if (!empty($params['expertInsight'])) {
                                $section['expertInsight'] = $params['expertInsight'];
                            } else if (isset($params['expertInsight']) && $params['expertInsight'] === '') {
                                $section['expertInsight'] = '';
                            }
                            // Version 9.87: voiceoverText (Introduction) — was edited locally only, now persisted to DB
                            // Always save (including empty string = teacher cleared the introduction).
                            $section['voiceoverText'] = $params['voiceoverText'];
                            // Version 9.87: cardData — route-card-specific fields for all 18 card types
                            // Apply each key in cardData to both section level AND cards[0] (multi-card sections).
                            if (!empty($params['cardData']) && $params['cardData'] !== '{}') {
                                $carddataarr = json_decode($params['cardData'], true);
                                if (is_array($carddataarr)) {
                                    foreach ($carddataarr as $cdkey => $cdval) {
                                        $section[$cdkey] = $cdval;
                                    }
                                    // Also update cards[0] for multi-card sections so renderer reads updated data.
                                    if (!empty($section['cards']) && is_array($section['cards'])) {
                                        foreach ($carddataarr as $cdkey => $cdval) {
                                            $section['cards'][0][$cdkey] = $cdval;
                                        }
                                    }
                                }
                            }
                            // Version 13.22: cardsData — full ordered replacement of section.cards[].
                            // JS now sends cards in DOM order as complete card objects (original
                            // card data deep-cloned and merged with edited fields). This supports
                            // card reordering and deletion as well as normal field-level edits.
                            if (!empty($params['cardsData']) && $params['cardsData'] !== '[]') {
                                $cardsdataarr = json_decode($params['cardsData'], true);
                                if (is_array($cardsdataarr) && count($cardsdataarr) > 0) {
                                    $section['cards'] = array_values($cardsdataarr);
                                }
                            }
                            // Scenario sub-fields.
                            if (!isset($section['scenario'])) {
                                $section['scenario'] = [];
                            }
                            if (!empty($params['scenarioTitle'])) {
                                $section['scenario']['title'] = $params['scenarioTitle'];
                            }
                            if (!empty($params['scenarioRole'])) {
                                $section['scenario']['role'] = $params['scenarioRole'];
                            }
                            if (!empty($params['scenarioContext'])) {
                                $section['scenario']['context'] = $params['scenarioContext'];
                            }
                            if (!empty($params['scenarioComplication'])) {
                                $section['scenario']['complication'] = $params['scenarioComplication'];
                            }
                            if ($mentalmodelval !== null) {
                                $section['scenario']['mentalModel'] = $mentalmodelval;
                            }
                            if ($predictionpromptval !== null) {
                                $section['scenario']['predictionPrompt'] = $predictionpromptval;
                            }
                            $section['lastEdited'] = date('c');

                            if ($params['regenerateVoiceover']) {
                                $section['voiceover'] = [
                                    'generated' => false,
                                    'audioUrl' => null,
                                    'duration' => null,
                                    'pendingRegeneration' => true,
                                ];
                                // Clear pre-generated voiceover URL so it regenerates on play.
                                unset($section['voiceoverUrl']);
                                $creditsused = 5; // Voiceover pricing: 5 credits per slide.
                            }

                            $sectionfound = true;
                            break 2;
                        }
                    }
                }
            }
            unset($topic, $section);

            if (!$sectionfound) {
                return [
                    'success' => false,
                    'message' => get_string('errorsectionnotfound', 'mod_contentcreator'),
                    'creditsUsed' => 0,
                ];
            }

            $record = new \stdClass();
            $record->id = $cm->instance;
            // Version 11.48 FIX BUG-CC-DBWRITE: compress before write to stay under MySQL max_allowed_packet.
            $record->manifestjson = \mod_contentcreator\manifest_storage::compress(json_encode($manifest));
            $record->timemodified = time();

            $DB->update_record('contentcreator', $record);

            return [
                'success' => true,
                'message' => $params['regenerateVoiceover']
                    ? get_string('slidesavedvoiceover', 'mod_contentcreator')
                    : get_string('slidesaved', 'mod_contentcreator'),
                'creditsUsed' => $creditsused,
            ];
        } catch (\Throwable $e) {
            // Version 11.40 FIX (BUG-CC-SSLIDE-NOTRY): Catch PHP 7+ Error objects (type errors,
            // parse errors, etc.) as well as Exceptions.
            debugging('Content Creator save_slide_edit exception: ' . $e->getMessage(), DEBUG_DEVELOPER);
            return [
                'success' => false,
                'message' => get_string('errorsavefailed', 'mod_contentcreator'),
                'creditsUsed' => 0,
            ];
        }
    }

    /**
     * Describes the return value for execute().
     *
     * @return external_single_structure
     */
    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'success' => new external_value(PARAM_BOOL, 'Success status'),
            'message' => new external_value(PARAM_TEXT, 'Response message'),
            'creditsUsed' => new external_value(PARAM_INT, 'Credits used for voiceover regeneration'),
        ]);
    }
}
