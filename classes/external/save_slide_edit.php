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

defined('MOODLE_INTERNAL') || die();

global $CFG;
require_once($CFG->libdir . '/externallib.php');

use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_single_structure;
use core_external\external_value;
use context_module;
use context_course;

class save_slide_edit extends external_api {
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'cmid' => new external_value(PARAM_INT, 'Course module ID'),
            'topicId' => new external_value(PARAM_TEXT, 'Topic ID'),
            'sectionId' => new external_value(PARAM_TEXT, 'Section ID'),
            'title' => new external_value(PARAM_TEXT, 'Section title'),
            'description' => new external_value(PARAM_TEXT, 'Section description', VALUE_DEFAULT, ''),
            'requirements' => new external_value(PARAM_RAW, 'JSON array of requirements', VALUE_DEFAULT, '[]'), // pipeline-ignore: PARAM_RAW — JSON blob or free-form authoring text, json_decode()'d/sanitised on use, never echoed raw
            'doList' => new external_value(PARAM_RAW, 'JSON array of do items', VALUE_DEFAULT, '[]'), // pipeline-ignore: PARAM_RAW — JSON blob or free-form authoring text, json_decode()'d/sanitised on use, never echoed raw
            'dontList' => new external_value(PARAM_RAW, 'JSON array of dont items', VALUE_DEFAULT, '[]'), // pipeline-ignore: PARAM_RAW — JSON blob or free-form authoring text, json_decode()'d/sanitised on use, never echoed raw
            // v6.6.82: Layer 2 content fields for full slide editing
            'scenario' => new external_value(PARAM_RAW, 'Scenario/situation text', VALUE_DEFAULT, ''), // pipeline-ignore: PARAM_RAW — JSON blob or free-form authoring text, json_decode()'d/sanitised on use, never echoed raw
            'decision' => new external_value(PARAM_RAW, 'Decision point text', VALUE_DEFAULT, ''), // pipeline-ignore: PARAM_RAW — JSON blob or free-form authoring text, json_decode()'d/sanitised on use, never echoed raw
            'correctResponse' => new external_value(PARAM_RAW, 'JSON object with action, why, communicate', VALUE_DEFAULT, '{}'), // pipeline-ignore: PARAM_RAW — JSON blob or free-form authoring text, json_decode()'d/sanitised on use, never echoed raw
            // v7.7.9: 5-card feedback and content linking
            'feedback' => new external_value(PARAM_RAW, 'JSON object with correctExplanation, incorrectConsequence, keyTakeaway', VALUE_DEFAULT, '{}'), // pipeline-ignore: PARAM_RAW — JSON blob or free-form authoring text, json_decode()'d/sanitised on use, never echoed raw
            'linkedContent' => new external_value(PARAM_RAW, 'JSON array of linked content items', VALUE_DEFAULT, '[]'), // pipeline-ignore: PARAM_RAW — JSON blob or free-form authoring text, json_decode()'d/sanitised on use, never echoed raw
            // v9.78 FIX (A-07): 11 fields were collected in the edit modal but never
            // sent to this external function. Teachers' edits were saved to localStorage
            // only and reverted to AI-generated values on the next page load from the DB.
            'scenarioTitle' => new external_value(PARAM_TEXT, 'Scenario slide title', VALUE_DEFAULT, ''),
            'scenarioRole' => new external_value(PARAM_TEXT, 'Scenario learner role', VALUE_DEFAULT, ''),
            'scenarioContext' => new external_value(PARAM_RAW, 'Scenario context text', VALUE_DEFAULT, ''), // pipeline-ignore: PARAM_RAW — JSON blob or free-form authoring text, json_decode()'d/sanitised on use, never echoed raw
            'scenarioComplication' => new external_value(PARAM_RAW, 'Scenario complication text', VALUE_DEFAULT, ''), // pipeline-ignore: PARAM_RAW — JSON blob or free-form authoring text, json_decode()'d/sanitised on use, never echoed raw
            'mentalModel' => new external_value(PARAM_RAW, 'JSON: {name, principle} or null', VALUE_DEFAULT, ''), // pipeline-ignore: PARAM_RAW — JSON blob or free-form authoring text, json_decode()'d/sanitised on use, never echoed raw
            'predictionPrompt' => new external_value(PARAM_RAW, 'JSON: {question, options[]} or null', VALUE_DEFAULT, ''), // pipeline-ignore: PARAM_RAW — JSON blob or free-form authoring text, json_decode()'d/sanitised on use, never echoed raw
            'terminology' => new external_value(PARAM_RAW, 'JSON array of {term, definition} objects', VALUE_DEFAULT, '[]'), // pipeline-ignore: PARAM_RAW — JSON blob or free-form authoring text, json_decode()'d/sanitised on use, never echoed raw
            'keyTakeaway' => new external_value(PARAM_TEXT, 'Key takeaway accent card text', VALUE_DEFAULT, ''),
            'proTip' => new external_value(PARAM_TEXT, 'Pro tip accent card text', VALUE_DEFAULT, ''),
            'keyInfo' => new external_value(PARAM_TEXT, 'Key info accent card text', VALUE_DEFAULT, ''),
            'expertInsight' => new external_value(PARAM_TEXT, 'Expert insight accent card text', VALUE_DEFAULT, ''),
            // v9.87: voiceoverText (Introduction) was edited locally but never sent to server — edits lost on reload
            'voiceoverText' => new external_value(PARAM_RAW, 'Introduction / voiceover text shown above knowledge section', VALUE_DEFAULT, ''), // pipeline-ignore: PARAM_RAW — JSON blob or free-form authoring text, json_decode()'d/sanitised on use, never echoed raw
            // v9.87: cardData stores all route-card-specific fields (18 card types × multiple fields)
            // avoids adding dozens of individual parameters for every card type field
            'cardData' => new external_value(PARAM_RAW, 'JSON object with route-card-specific fields (heading, bodyText, steps, risks, etc)', VALUE_DEFAULT, '{}'), // pipeline-ignore: PARAM_RAW — JSON blob or free-form authoring text, json_decode()'d/sanitised on use, never echoed raw
            // v10.42: cardsData — JSON array of per-card updates for 7-card unified sections (section.cards[i])
            'cardsData' => new external_value(PARAM_RAW, 'JSON array of per-card updates indexed by card position', VALUE_DEFAULT, '[]'), // pipeline-ignore: PARAM_RAW — JSON blob or free-form authoring text, json_decode()'d/sanitised on use, never echoed raw
            'regenerateVoiceover' => new external_value(PARAM_BOOL, 'Regenerate voiceover (costs 5 credits)', VALUE_DEFAULT, false)
        ]);
    }

    public static function execute(
        int $cmid,
        string $topicId,
        string $sectionId,
        string $title,
        string $description = '',
        string $requirements = '[]',
        string $doList = '[]',
        string $dontList = '[]',
        string $scenario = '',
        string $decision = '',
        string $correctResponse = '{}',
        string $feedback = '{}',
        string $linkedContent = '[]',
        string $scenarioTitle = '',
        string $scenarioRole = '',
        string $scenarioContext = '',
        string $scenarioComplication = '',
        string $mentalModel = '',
        string $predictionPrompt = '',
        string $terminology = '[]',
        string $keyTakeaway = '',
        string $proTip = '',
        string $keyInfo = '',
        string $expertInsight = '',
        string $voiceoverText = '',
        string $cardData = '{}',
        string $cardsData = '[]',
        bool $regenerateVoiceover = false
    ): array {
        global $DB, $CFG;

        try {
            $params = self::validate_parameters(self::execute_parameters(), [
                'cmid' => $cmid,
                'topicId' => $topicId,
                'sectionId' => $sectionId,
                'title' => $title,
                'description' => $description,
                'requirements' => $requirements,
                'doList' => $doList,
                'dontList' => $dontList,
                'scenario' => $scenario,
                'decision' => $decision,
                'correctResponse' => $correctResponse,
                'feedback' => $feedback,
                'linkedContent' => $linkedContent,
                'scenarioTitle' => $scenarioTitle,
                'scenarioRole' => $scenarioRole,
                'scenarioContext' => $scenarioContext,
                'scenarioComplication' => $scenarioComplication,
                'mentalModel' => $mentalModel,
                'predictionPrompt' => $predictionPrompt,
                'terminology' => $terminology,
                'keyTakeaway' => $keyTakeaway,
                'proTip' => $proTip,
                'keyInfo' => $keyInfo,
                'expertInsight' => $expertInsight,
                'voiceoverText' => $voiceoverText,
                'cardData' => $cardData,
                'cardsData' => $cardsData,
                'regenerateVoiceover' => $regenerateVoiceover
            ]);

            $cm = get_coursemodule_from_id('contentcreator', $params['cmid'], 0, false, MUST_EXIST);
            $context = context_module::instance($cm->id);
            self::validate_context($context);

            // v11.40 FIX (BUG-CC-SSLIDE-PERM): Mirror the flexible capability check from
            // ajax.php and the other save externals (save_manifest, save_manifest_chunk).
            // The original require_capability('mod/contentcreator:addinstance', $context)
            // was too strict — custom roles cloned from editingteacher do not automatically
            // inherit new plugin capabilities, so legitimate editing teachers received
            // "Failed to save generated content" on every slide-edit save.
            // Fix: check mod/contentcreator:manage first (module context), fall back to
            // moodle/course:manageactivities in the course context — every genuine editing
            // teacher has this regardless of whether their cloned role explicitly lists
            // mod/contentcreator capabilities.
            if (!has_capability('mod/contentcreator:manage', $context)) {
                $coursecontext = context_course::instance($cm->course);
                if (!has_capability('moodle/course:manageactivities', $coursecontext)) {
                    require_capability('mod/contentcreator:manage', $context);
                }
            }

            // v11.40 FIX (BUG-CC-SSLIDE-SESSION): Release session lock before DB read+write.
            // Holding the session file lock during manifest JSON decode+encode (potentially
            // several hundred KB) blocks all concurrent requests from the same user session.
            \core\session\manager::write_close();

            $contentcreator = $DB->get_record('contentcreator', ['id' => $cm->instance], '*', MUST_EXIST);
            
            if (empty($contentcreator->manifestjson)) {
                return [
                    'success' => false,
                    'message' => 'No content has been generated yet',
                    'creditsUsed' => 0
                ];
            }
            
            // v11.48 FIX BUG-CC-DBWRITE: decompress before json_decode (may be gz: compressed)
            $manifest = json_decode(\mod_contentcreator\manifest_storage::decompress($contentcreator->manifestjson), true);

            if (json_last_error() !== JSON_ERROR_NONE || !is_array($manifest) || !isset($manifest['topics'])) {
                return [
                    'success' => false,
                    'message' => 'Invalid manifest data',
                    'creditsUsed' => 0
                ];
            }

            $requirementsArr = json_decode($params['requirements'], true) ?: [];
            $doListArr = json_decode($params['doList'], true) ?: [];
            $dontListArr = json_decode($params['dontList'], true) ?: [];
            // v6.6.82: Layer 2 content
            $correctResponseArr = json_decode($params['correctResponse'], true) ?: [];
            // v7.7.9: 5-card feedback and content linking
            $feedbackArr = json_decode($params['feedback'], true) ?: [];
            $linkedContentArr = json_decode($params['linkedContent'], true) ?: [];
            // v9.78 FIX (A-07): parse new fields
            $terminologyArr = json_decode($params['terminology'], true) ?: [];
            $mentalModelVal = ($params['mentalModel'] !== '' && $params['mentalModel'] !== 'null')
                ? json_decode($params['mentalModel'], true) : null;
            $predictionPromptVal = ($params['predictionPrompt'] !== '' && $params['predictionPrompt'] !== 'null')
                ? json_decode($params['predictionPrompt'], true) : null;

            $sectionFound = false;
            $creditsUsed = 0;

            foreach ($manifest['topics'] as &$topic) {
                if ($topic['id'] === $params['topicId']) {
                    foreach ($topic['sections'] as &$section) {
                        if ($section['id'] === $params['sectionId']) {
                            $section['title'] = $params['title'];
                            $section['description'] = $params['description'];
                            $section['requirements'] = $requirementsArr;
                            $section['doList'] = $doListArr;
                            $section['dontList'] = $dontListArr;
                            // v6.6.82: Layer 2 content fields
                            if (!empty($params['scenario'])) {
                                $section['scenario'] = $params['scenario'];
                            }
                            if (!empty($params['decision'])) {
                                $section['decision'] = $params['decision'];
                            }
                            if (!empty($correctResponseArr)) {
                                $section['correctResponse'] = $correctResponseArr;
                            }
                            // v7.7.9: Save feedback to section.feedback (not outcome!) for player5 to read
                            if (!empty($feedbackArr) && (!empty($feedbackArr['correctExplanation']) || !empty($feedbackArr['incorrectConsequence']) || !empty($feedbackArr['keyTakeaway']))) {
                                $section['feedback'] = $feedbackArr;
                            }
                            // v7.7.9: Save linked content
                            if (!empty($linkedContentArr)) {
                                $section['linkedContent'] = $linkedContentArr;
                            }
                            // v9.78 FIX (A-07): Save previously dropped fields to the DB manifest
                            // so teacher edits survive page refresh and new student sessions.
                            if (!empty($terminologyArr)) {
                                $section['terminology'] = $terminologyArr;
                            }
                            if (!empty($params['keyTakeaway'])) {
                                $section['keyTakeaway'] = $params['keyTakeaway'];
                            } else if (isset($params['keyTakeaway']) && $params['keyTakeaway'] === '') {
                                // Explicit clear — teacher removed the text
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
                            // v9.87: voiceoverText (Introduction) — was edited locally only, now persisted to DB
                            // Always save (including empty string = teacher cleared the introduction)
                            $section['voiceoverText'] = $params['voiceoverText'];
                            // v9.87: cardData — route-card-specific fields for all 18 card types
                            // Apply each key in cardData to both section level AND cards[0] (multi-card sections)
                            if (!empty($params['cardData']) && $params['cardData'] !== '{}') {
                                $cardDataArr = json_decode($params['cardData'], true);
                                if (is_array($cardDataArr)) {
                                    foreach ($cardDataArr as $cdKey => $cdVal) {
                                        $section[$cdKey] = $cdVal;
                                    }
                                    // Also update cards[0] for multi-card sections so renderer reads updated data
                                    if (!empty($section['cards']) && is_array($section['cards'])) {
                                        foreach ($cardDataArr as $cdKey => $cdVal) {
                                            $section['cards'][0][$cdKey] = $cdVal;
                                        }
                                    }
                                }
                            }
                            // v13.22: cardsData — full ordered replacement of section.cards[].
                            // JS now sends cards in DOM order as complete card objects (original
                            // card data deep-cloned and merged with edited fields). This supports
                            // card reordering and deletion as well as normal field-level edits.
                            if (!empty($params['cardsData']) && $params['cardsData'] !== '[]') {
                                $cardsDataArr = json_decode($params['cardsData'], true);
                                if (is_array($cardsDataArr) && count($cardsDataArr) > 0) {
                                    $section['cards'] = array_values($cardsDataArr);
                                }
                            }
                            // Scenario sub-fields
                            if (!isset($section['scenario'])) $section['scenario'] = [];
                            if (!empty($params['scenarioTitle'])) $section['scenario']['title'] = $params['scenarioTitle'];
                            if (!empty($params['scenarioRole'])) $section['scenario']['role'] = $params['scenarioRole'];
                            if (!empty($params['scenarioContext'])) $section['scenario']['context'] = $params['scenarioContext'];
                            if (!empty($params['scenarioComplication'])) $section['scenario']['complication'] = $params['scenarioComplication'];
                            if ($mentalModelVal !== null) $section['scenario']['mentalModel'] = $mentalModelVal;
                            if ($predictionPromptVal !== null) $section['scenario']['predictionPrompt'] = $predictionPromptVal;
                            $section['lastEdited'] = date('c');
                            
                            if ($params['regenerateVoiceover']) {
                                $section['voiceover'] = [
                                    'generated' => false,
                                    'audioUrl' => null,
                                    'duration' => null,
                                    'pendingRegeneration' => true
                                ];
                                // Clear pre-generated voiceover URL so it regenerates on play
                                unset($section['voiceoverUrl']);
                                $creditsUsed = 5; // Voiceover pricing: 5 credits per slide
                            }
                            
                            $sectionFound = true;
                            break 2;
                        }
                    }
                }
            }
            unset($topic, $section);

            if (!$sectionFound) {
                return [
                    'success' => false,
                    'message' => 'Section not found',
                    'creditsUsed' => 0
                ];
            }

            $record = new \stdClass();
            $record->id = $cm->instance;
            // v11.48 FIX BUG-CC-DBWRITE: compress before write to stay under MySQL max_allowed_packet
            $record->manifestjson = \mod_contentcreator\manifest_storage::compress(json_encode($manifest));
            $record->timemodified = time();

            $DB->update_record('contentcreator', $record);

            return [
                'success' => true,
                'message' => $params['regenerateVoiceover'] 
                    ? 'Slide saved. Voiceover will regenerate when you click Listen (5 credits).' 
                    : 'Slide saved successfully.',
                'creditsUsed' => $creditsUsed
            ];

        } catch (\Throwable $e) {
            // v11.40 FIX (BUG-CC-SSLIDE-NOTRY): Catch PHP 7+ Error objects (type errors,
            // parse errors, etc.) as well as Exceptions. Without \Throwable, a PHP Error
            // during JSON decode/encode or DB write propagates as an opaque 500 with no
            // meaningful error context in the Moodle external API response.
            error_log('[CC_SLIDE_EDIT] Exception: ' . $e->getMessage());
            error_log('[CC_SLIDE_EDIT] Trace: ' . $e->getTraceAsString());
            throw $e;
        }
    }

    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'success' => new external_value(PARAM_BOOL, 'Success status'),
            'message' => new external_value(PARAM_TEXT, 'Response message'),
            'creditsUsed' => new external_value(PARAM_INT, 'Credits used for voiceover regeneration')
        ]);
    }
}
