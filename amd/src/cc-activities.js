/**
 * Content Creator  -  Activity renderer functions.
 *
 * Extracted from player5.js (v9.83 Phase-3) to reduce the monolithic player
 * file size.  All seven interactive activity types are rendered here.
 *
 * Usage:
 *   CcActivities.init({ getLabel, escapeHtml, fixGrammar, formatText, capitalizeFirst });
 *   var html = CcActivities.renderScenarioBranchingActivity(activity);
 *
 * The module is a singleton: call init() once during Player construction before
 * any render method is invoked.
 *
 * @module     mod_contentcreator/cc-activities
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
define([], function () {
    'use strict';

    // Helper references populated by init()
    var getLabel, escapeHtml, fixGrammar, formatText, capitalizeFirst;

    /**
     * Inject helper functions from player5.js scope.
     * Must be called before any render* method.
     * @param {Object} helpers
     */
    function init(helpers) {
        getLabel       = helpers.getLabel;
        escapeHtml     = helpers.escapeHtml;
        fixGrammar     = helpers.fixGrammar;
        formatText     = helpers.formatText;
        capitalizeFirst = helpers.capitalizeFirst;
    }

    // ===========================================================================
    // 1. SCENARIO BRANCHING
    // ===========================================================================
    function renderScenarioBranchingActivity(activity) {
        var html = '<div class="cc5-activity-section cc5-scenario-branching">';
        var totalPoints = (activity.decisionPoints && activity.decisionPoints.length) || 0;

        // Header with progress indicator
        html += '<div class="cc5-activity-header">';
        html += '<span class="cc5-layer-badge cc5-badge-activity">';
        html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>';
        html += getLabel('decisionActivity');
        html += '</span>';
        if (totalPoints > 1) {
            html += '<span class="cc5-activity-progress" data-total="' + totalPoints + '">';
            html += '<span class="cc5-progress-current">1</span> / ' + totalPoints;
            html += '</span>';
        }
        if (activity.title) {
            html += '<h3 class="cc5-activity-title">' + escapeHtml(fixGrammar(activity.title)) + '</h3>';
        }
        html += '</div>';

        // Scenario introduction
        if (activity.scenarioIntro) {
            html += '<div class="cc5-scenario-intro">';
            html += '<div class="cc5-intro-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/></svg></div>';
            html += '<p>' + escapeHtml(fixGrammar(activity.scenarioIntro)) + '</p>';
            html += '</div>';
        }

        // Decision points (interactive)
        if (activity.decisionPoints && activity.decisionPoints.length) {
            html += '<div class="cc5-decision-points" data-current-point="1" data-total-points="' + totalPoints + '">';
            activity.decisionPoints.forEach(function (point, idx) {
                var isActive = idx === 0;
                // v13.86: point.id is vendor JSON and was interpolated raw into both an
                // attribute and a text node.
                html += '<div class="cc5-decision-point' + (isActive ? ' cc5-active' : '') + '" data-point-id="' + escapeHtml(point.id) + '" data-point-index="' + (idx + 1) + '">';
                html += '<div class="cc5-point-header">';
                html += '<div class="cc5-point-number"><span class="cc5-point-step">' + escapeHtml(point.id) + '</span></div>';
                html += '<span class="cc5-think-prompt">' + getLabel('thinkCarefully') + '</span>';
                html += '</div>';
                html += '<p class="cc5-point-situation">' + escapeHtml(fixGrammar(point.situation)) + '</p>';
                html += '<div class="cc5-options">';
                point.options.forEach(function (opt, optIdx) {
                    // FIX-CC-QUIZ-INVERT: use explicit 'true'/'false' strings so the player5.js
                    // check (=== 'true') works correctly even when AI returns a numeric 1/0 or
                    // any other truthy/falsy value instead of a boolean.
                    html += '<button class="cc5-option" data-point="' + point.id + '" data-option="' + optIdx + '" data-correct="' + (opt.isCorrect ? 'true' : 'false') + '">';
                    html += '<span class="cc5-option-letter">' + String.fromCharCode(65 + optIdx) + '</span>';
                    html += '<span class="cc5-option-text">' + formatText(capitalizeFirst(opt.text)) + '</span>';
                    html += '<div class="cc5-option-feedback">';
                    html += '<span class="cc5-feedback-icon"></span>';
                    html += '<span class="cc5-feedback-text">' + escapeHtml(fixGrammar(opt.feedback)) + '</span>';
                    html += '</div>';
                    html += '</button>';
                });
                html += '</div>';
                html += '</div>';
            });
            html += '</div>';
        }

        // Score summary (hidden until complete)
        html += '<div class="cc5-activity-score cc5-hidden" data-total="' + totalPoints + '">';
        html += '<div class="cc5-score-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div>';
        html += '<div class="cc5-score-text">';
        html += '<span class="cc5-score-label">' + getLabel('yourScore') + '</span>';
        html += '<span class="cc5-score-value"><span class="cc5-score-correct">0</span> / ' + totalPoints + ' ' + getLabel('correct') + '</span>';
        html += '</div>';
        html += '<button type="button" class="cc5-try-again-btn" data-activity-type="scenario-branching">';
        html += '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>';
        html += '<span>' + getLabel('tryAgain') + '</span>';
        html += '</button>';
        html += '</div>';

        // Final outcome
        if (activity.finalOutcome) {
            html += '<div class="cc5-final-outcome cc5-hidden">';
            html += '<div class="cc5-outcome-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg></div>';
            html += '<div class="cc5-outcome-label">' + getLabel('finalOutcome') + '</div>';
            html += '<p>' + escapeHtml(fixGrammar(activity.finalOutcome)) + '</p>';
            html += '</div>';
        }

        // Instruction to complete
        var totalResponses = totalPoints;
        html += '<div class="cc5-activity-instruction cc5-br-instruction" data-total="' + totalResponses + '">';
        html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>';
        html += '<span>' + getLabel('revealAllToUnlock') + '</span>';
        html += '</div>';

        // Learning takeaway
        if (activity.learningTakeaway) {
            html += '<div class="cc5-learning-takeaway cc5-hidden">';
            html += '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
            html += '<span>' + escapeHtml(fixGrammar(activity.learningTakeaway)) + '</span>';
            html += '</div>';
        }

        html += '</div>';
        return html;
    }

    // ===========================================================================
    // 2. BEST RESPONSE ANALYSIS
    // v6.6.63: think first prompt, progress, score summary
    // ===========================================================================
    function renderBestResponseActivity(activity) {
        var html = '<div class="cc5-activity-section cc5-best-response">';
        var totalResponses = (activity.responses && activity.responses.length) || 0;

        html += '<div class="cc5-activity-header">';
        html += '<span class="cc5-layer-badge cc5-badge-activity">';
        html += '<svg viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>';
        html += getLabel('responseAnalysis');
        html += '</span>';
        if (totalResponses > 1) {
            html += '<span class="cc5-activity-progress" data-total="' + totalResponses + '">';
            html += '<span class="cc5-progress-revealed">0</span> / ' + totalResponses + ' ' + getLabel('revealed');
            html += '</span>';
        }
        if (activity.title) {
            html += '<h3 class="cc5-activity-title">' + escapeHtml(fixGrammar(activity.title)) + '</h3>';
        }
        html += '</div>';

        if (activity.situation) {
            html += '<div class="cc5-response-situation">';
            html += '<div class="cc5-situation-icon"><svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg></div>';
            html += '<p>' + escapeHtml(fixGrammar(activity.situation)) + '</p>';
            html += '</div>';
        }

        if (activity.responses && activity.responses.length) {
            html += '<div class="cc5-response-options" data-total="' + totalResponses + '">';
            html += '<div class="cc5-think-first-prompt">';
            html += '<svg viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>';
            html += '<span>' + getLabel('thinkFirstThenReveal') + '</span>';
            html += '</div>';

            // Classification legend
            html += '<div class="cc5-classification-legend">';
            html += '<div class="cc5-legend-title">' + getLabel('classificationGuide') + '</div>';
            html += '<div class="cc5-legend-items">';
            html += '<div class="cc5-legend-item cc5-legend-best"><span class="cc5-legend-badge cc5-class-best">' + getLabel('bestPractice') + '</span><span class="cc5-legend-desc">' + getLabel('bestPracticeDesc') + '</span></div>';
            html += '<div class="cc5-legend-item cc5-legend-acceptable"><span class="cc5-legend-badge cc5-class-acceptable">' + getLabel('acceptable') + '</span><span class="cc5-legend-desc">' + getLabel('acceptableDesc') + '</span></div>';
            html += '<div class="cc5-legend-item cc5-legend-inappropriate"><span class="cc5-legend-badge cc5-class-inappropriate">' + getLabel('notAppropriate') + '</span><span class="cc5-legend-desc">' + getLabel('notAppropriateDesc') + '</span></div>';
            html += '</div></div>';

            activity.responses.forEach(function (resp) {
                var classLabel = resp.classification === 'best' ? getLabel('bestPractice') :
                                (resp.classification === 'acceptable' ? getLabel('acceptable') : getLabel('notAppropriate'));
                var classIcon = resp.classification === 'best' ? 'cc5-class-best' :
                               (resp.classification === 'acceptable' ? 'cc5-class-acceptable' : 'cc5-class-inappropriate');
                html += '<div class="cc5-response-item" data-classification="' + resp.classification + '">';
                html += '<div class="cc5-response-text">' + formatText(resp.text) + '</div>';
                html += '<div class="cc5-response-reveal cc5-hidden">';
                html += '<span class="cc5-classification-badge ' + classIcon + '">' + classLabel + '</span>';
                html += '<p class="cc5-explanation">' + escapeHtml(fixGrammar(resp.explanation)) + '</p>';
                html += '</div>';
                html += '<button type="button" class="cc5-reveal-btn" aria-label="' + getLabel('showAnswer') + '">' + getLabel('showClassification') + '</button>';
                html += '</div>';
            });

            html += '</div>';
        }

        // Score summary
        html += '<div class="cc5-best-response-score cc5-hidden" data-total="' + totalResponses + '">';
        html += '<div class="cc5-score-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="28" height="28"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div>';
        html += '<div class="cc5-score-text">';
        html += '<span class="cc5-score-label">' + getLabel('allRevealed') + '</span>';
        html += '<span class="cc5-score-value">' + totalResponses + ' / ' + totalResponses + ' ' + getLabel('revealed') + '</span>';
        html += '</div>';
        html += '<button type="button" class="cc5-try-again-btn" data-activity-type="best-response">';
        html += '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>';
        html += '<span>' + getLabel('tryAgain') + '</span>';
        html += '</button>';
        html += '</div>';

        // Instruction
        html += '<div class="cc5-activity-instruction cc5-br-instruction" data-total="' + totalResponses + '">';
        html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>';
        html += '<span>' + getLabel('revealAllToUnlock') + '</span>';
        html += '</div>';

        if (activity.learningTakeaway) {
            html += '<div class="cc5-learning-takeaway">';
            html += '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
            html += '<span>' + escapeHtml(fixGrammar(activity.learningTakeaway)) + '</span>';
            html += '</div>';
        }

        html += '</div>';
        return html;
    }

    // ===========================================================================
    // 3. WHAT WENT WRONG CASE ANALYSIS
    // v6.6.63, v7.2.53
    // ===========================================================================
    function renderWhatWentWrongActivity(activity) {
        var html = '<div class="cc5-activity-section cc5-what-went-wrong">';
        var totalQuestions = (activity.analysisQuestions && activity.analysisQuestions.length) || 0;

        html += '<div class="cc5-activity-header">';
        html += '<span class="cc5-layer-badge cc5-badge-activity cc5-badge-warning">';
        html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>';
        html += getLabel('caseAnalysis');
        html += '</span>';
        if (totalQuestions > 1) {
            html += '<span class="cc5-activity-progress" data-total="' + totalQuestions + '">';
            html += '<span class="cc5-progress-opened">0</span> / ' + totalQuestions + ' ' + getLabel('answered');
            html += '</span>';
        }
        if (activity.title) {
            html += '<h3 class="cc5-activity-title">' + escapeHtml(fixGrammar(activity.title)) + '</h3>';
        }
        html += '</div>';

        if (activity.caseDescription) {
            html += '<div class="cc5-case-description">';
            html += '<div class="cc5-case-header">';
            html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>';
            html += '<div class="cc5-case-label">' + getLabel('incidentReport') + '</div>';
            html += '</div>';
            html += '<p>' + escapeHtml(fixGrammar(activity.caseDescription)) + '</p>';
            html += '</div>';
        }

        html += '<div class="cc5-think-first-prompt">';
        html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>';
        html += '<span>' + getLabel('thinkThenCompare') + '</span>';
        html += '</div>';

        if (activity.analysisQuestions && activity.analysisQuestions.length) {
            html += '<div class="cc5-analysis-questions" data-total="' + totalQuestions + '">';
            var questionIcons = {
                1: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>',
                2: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>',
                3: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>'
            };
            activity.analysisQuestions.forEach(function (q) {
                html += '<div class="cc5-analysis-item">';
                html += '<div class="cc5-question">';
                html += '<span class="cc5-q-icon">' + (questionIcons[q.id] || questionIcons[1]) + '</span>';
                html += '<span class="cc5-q-text">' + escapeHtml(fixGrammar(q.question)) + '</span>';
                html += '</div>';
                html += '<details class="cc5-model-answer">';
                html += '<summary>';
                html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
                html += '<span>' + getLabel('showModelAnswer') + '</span>';
                html += '</summary>';
                html += '<div class="cc5-answer-content"><p>' + escapeHtml(fixGrammar(q.modelAnswer)) + '</p></div>';
                // v13.85 FIX BUG-ACT-DETAILS-NEST: this was '</div>', so the <details>
                // opened above was never closed and every following question nested
                // inside the previous one's collapsed disclosure. Questions 2+, the
                // score summary, the unlock instruction and the takeaway were all
                // invisible until the learner opened question 1.
                html += '</details>';
                html += '</div>';
            });
            html += '</div>';
        }

        // Score summary
        html += '<div class="cc5-what-went-wrong-score cc5-hidden" data-total="' + totalQuestions + '">';
        html += '<div class="cc5-score-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="28" height="28"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div>';
        html += '<div class="cc5-score-text">';
        html += '<span class="cc5-score-label">' + getLabel('allAnswersReviewed') + '</span>';
        html += '<span class="cc5-score-value">' + totalQuestions + ' / ' + totalQuestions + ' ' + getLabel('answered') + '</span>';
        html += '</div>';
        html += '<button type="button" class="cc5-try-again-btn" data-activity-type="what-went-wrong">';
        html += '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>';
        html += '<span>' + getLabel('tryAgain') + '</span>';
        html += '</button>';
        html += '</div>';
        // v13.85: a second '</div>' stood here and closed the activity section early.
        // It was compensating for the mismatched '</details>' above; with that fixed
        // it is one closing tag too many.

        // Instruction
        html += '<div class="cc5-activity-instruction cc5-www-instruction" data-total="' + totalQuestions + '">';
        html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>';
        html += '<span>' + getLabel('openAllToUnlock') + '</span>';
        html += '</div>';

        if (activity.preventionTakeaway) {
            html += '<div class="cc5-prevention-takeaway">';
            html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>';
            html += '<div class="cc5-takeaway-content">';
            html += '<span class="cc5-takeaway-label">' + getLabel('keyPrevention') + ':</span> ';
            html += '<span class="cc5-takeaway-text">' + escapeHtml(fixGrammar(activity.preventionTakeaway)) + '</span>';
            html += '</div>';
            html += '</div>';
        }

        html += '</div>';
        return html;
    }

    // ===========================================================================
    // 4. TASK SEQUENCING
    // v6.6.58  -  interactive reordering; drag-and-drop + mobile arrows
    // ===========================================================================
    function renderSequencingActivity(activity) {
        var html = '<div class="cc5-activity-section cc5-sequencing">';

        html += '<div class="cc5-activity-header">';
        html += '<span class="cc5-layer-badge cc5-badge-activity">';
        html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="17" y1="18" x2="3" y2="18"/></svg>';
        html += getLabel('processSequencing');
        html += '</span>';
        if (activity.title) {
            html += '<h3 class="cc5-activity-title">' + escapeHtml(fixGrammar(activity.title)) + '</h3>';
        }
        html += '</div>';

        if (activity.context) {
            html += '<div class="cc5-sequence-context"><p>' + escapeHtml(fixGrammar(activity.context)) + '</p></div>';
        }

        html += '<p class="cc5-instruction">' + (activity.instruction || getLabel('arrangeStepsInstruction')) + '</p>';

        if (activity.steps && activity.steps.length) {
            html += '<div class="cc5-sequence-steps cc5-sortable-list" data-checked="false">';

            // Deterministic scramble
            var scrambledSteps = activity.steps.slice();
            for (var i = scrambledSteps.length - 1; i > 0; i--) {
                var j = (scrambledSteps[i].correctPosition * 7 + i * 3) % (i + 1);
                var temp = scrambledSteps[i];
                scrambledSteps[i] = scrambledSteps[j];
                scrambledSteps[j] = temp;
            }

            var upArrowIcon  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m18 15-6-6-6 6"/></svg>';
            var downArrowIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>';
            var dragIcon = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>';

            scrambledSteps.forEach(function (step, displayIndex) {
                var stepTypeClass = 'cc5-step-' + (step.stepType || 'action');
                html += '<div class="cc5-sequence-step ' + stepTypeClass + '" data-correct-position="' + step.correctPosition + '" draggable="true" tabindex="0">';
                html += '<div class="cc5-step-drag-handle" title="Drag to reorder">' + dragIcon + '</div>';
                html += '<span class="cc5-step-number cc5-step-current-pos">' + (displayIndex + 1) + '</span>';
                html += '<div class="cc5-step-content">';
                html += '<div class="cc5-step-main"><span class="cc5-step-text">' + formatText(step.text) + '</span></div>';
                html += '<span class="cc5-step-type">' + escapeHtml(fixGrammar(step.stepType || 'action')) + '</span>';
                html += '</div>';
                html += '<div class="cc5-step-reorder-btns">';
                html += '<button type="button" class="cc5-step-move-up" title="' + getLabel('moveUp') + '" ' + (displayIndex === 0 ? 'disabled' : '') + '>' + upArrowIcon + '</button>';
                html += '<button type="button" class="cc5-step-move-down" title="' + getLabel('moveDown') + '" ' + (displayIndex === scrambledSteps.length - 1 ? 'disabled' : '') + '>' + downArrowIcon + '</button>';
                html += '</div>';
                html += '<div class="cc5-step-explanation cc5-hidden"><p>' + escapeHtml(fixGrammar(step.whyHere || '')) + '</p></div>';
                html += '</div>';
            });

            html += '</div>';

            // Action buttons
            html += '<div class="cc5-sequence-actions">';
            html += '<button type="button" class="cc5-check-sequence-btn">';
            html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
            html += '<span>' + getLabel('checkOrder') + '</span>';
            html += '</button>';
            html += '<button type="button" class="cc5-reset-sequence-btn">';
            html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>';
            html += '<span>' + getLabel('startOver') + '</span>';
            html += '</button>';
            html += '</div>';

            // Feedback area
            html += '<div class="cc5-sequence-feedback cc5-hidden">';
            html += '<div class="cc5-feedback-correct cc5-hidden">';
            html += '<div class="cc5-celebration-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="32" height="32"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div>';
            html += '<span class="cc5-feedback-text">' + getLabel('perfectOrder') + '</span>';
            html += '<span class="cc5-feedback-subtext">' + getLabel('orderExplanation') + '</span>';
            html += '</div>';
            html += '<div class="cc5-feedback-incorrect cc5-hidden">';
            html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>';
            html += '<span>' + getLabel('notQuiteRight') + '</span>';
            html += '</div>';
            html += '</div>';
        }

        if (activity.learningTakeaway) {
            html += '<div class="cc5-learning-takeaway cc5-hidden-until-checked">';
            html += '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
            html += '<span>' + escapeHtml(fixGrammar(activity.learningTakeaway)) + '</span>';
            html += '</div>';
        }

        var totalSteps = (activity.steps && activity.steps.length) || 0;
        html += '<div class="cc5-activity-instruction cc5-seq-instruction" data-total="' + totalSteps + '">';
        html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>';
        html += '<span>' + getLabel('checkOrderToUnlock') + '</span>';
        html += '</div>';

        if (activity.commonMistake) {
            html += '<div class="cc5-common-mistake cc5-hidden-until-checked">';
            html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>';
            html += '<span>' + escapeHtml(fixGrammar(activity.commonMistake)) + '</span>';
            html += '</div>';
        }

        html += '</div>';
        return html;
    }

    // ===========================================================================
    // 5. ESCALATION DECISION
    // v6.6.63, v6.7.32, v6.7.34
    // ===========================================================================
    function renderEscalationActivity(activity) {
        var html = '<div class="cc5-activity-section cc5-escalation">';
        var totalSituations = (activity.situations && activity.situations.length) || 0;

        html += '<div class="cc5-activity-header">';
        html += '<span class="cc5-layer-badge cc5-badge-activity">';
        html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
        html += getLabel('escalationDecisions');
        html += '</span>';
        if (totalSituations > 1) {
            html += '<span class="cc5-activity-progress" data-total="' + totalSituations + '">';
            html += '<span class="cc5-progress-answered">0</span> / ' + totalSituations;
            html += '</span>';
        }
        if (activity.title) {
            html += '<h3 class="cc5-activity-title">' + escapeHtml(fixGrammar(activity.title)) + '</h3>';
        }
        html += '</div>';

        if (activity.instruction) {
            html += '<div class="cc5-escalation-intro">';
            html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>';
            html += '<p class="cc5-instruction">' + escapeHtml(fixGrammar(activity.instruction)) + '</p>';
            html += '</div>';
        }

        if (activity.decisionOptions && activity.decisionOptions.length) {
            html += '<div class="cc5-decision-legend">';
            html += '<div class="cc5-legend-title">' + getLabel('yourOptions') + '</div>';
            html += '<div class="cc5-legend-items">';
            activity.decisionOptions.forEach(function (opt) {
                html += '<div class="cc5-legend-item cc5-decision-' + opt.value + '">';
                html += '<span class="cc5-legend-label">' + escapeHtml(fixGrammar(opt.label)) + '</span>';
                html += '<span class="cc5-legend-desc">' + formatText(opt.description) + '</span>';
                html += '</div>';
            });
            html += '</div>';
            html += '</div>';
        }

        if (activity.situations && activity.situations.length) {
            html += '<div class="cc5-escalation-situations" data-total="' + totalSituations + '">';
            var decisionIcons = {
                handle:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
                clarify:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>',
                escalate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 9-6-6-6 6"/><path d="M12 3v14"/><path d="M5 21h14"/></svg>',
                document: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>'
            };

            activity.situations.forEach(function (sit, sitIndex) {
                html += '<div class="cc5-situation-item" data-correct="' + sit.correctDecision + '" data-index="' + (sitIndex + 1) + '">';
                html += '<div class="cc5-situation-header">';
                html += '<span class="cc5-situation-number">' + (sitIndex + 1) + '</span>';
                html += '<p class="cc5-situation-text">' + escapeHtml(fixGrammar(sit.situation)) + '</p>';
                html += '</div>';
                html += '<div class="cc5-situation-options">';
                ['handle', 'clarify', 'escalate', 'document'].forEach(function (dec) {
                    var isCorrect = dec === sit.correctDecision;
                    html += '<button type="button" class="cc5-decision-btn cc5-decision-' + dec + '" data-decision="' + dec + '" data-correct="' + isCorrect + '">';
                    html += decisionIcons[dec];
                    html += '<span class="cc5-decision-label">' + getLabel(dec) + '</span>';
                    html += '</button>';
                });
                html += '</div>';
                html += '<div class="cc5-situation-feedback cc5-hidden">';
                html += '<div class="cc5-feedback-icon"></div>';
                html += '<p>' + escapeHtml(fixGrammar(sit.explanation)) + '</p>';
                html += '</div>';
                html += '</div>';
            });

            html += '</div>';
        }

        // Instruction
        html += '<div class="cc5-activity-instruction cc5-escalation-instruction" data-total="' + totalSituations + '">';
        html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>';
        html += '<span>' + getLabel('makeAllDecisionsToUnlock') + '</span>';
        html += '</div>';

        // Score summary
        html += '<div class="cc5-escalation-score cc5-hidden" data-total="' + totalSituations + '">';
        html += '<div class="cc5-score-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg></div>';
        html += '<div class="cc5-score-text">';
        html += '<span class="cc5-score-label">' + getLabel('yourScore') + '</span>';
        html += '<span class="cc5-score-value"><span class="cc5-score-correct">0</span> / ' + totalSituations + ' ' + getLabel('correct') + '</span>';
        html += '</div>';
        html += '<button type="button" class="cc5-try-again-btn" data-activity-type="escalation-decision">';
        html += '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>';
        html += '<span>' + getLabel('tryAgain') + '</span>';
        html += '</button>';
        html += '</div>';

        if (activity.boundaryPrinciple) {
            html += '<div class="cc5-boundary-principle">';
            html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>';
            html += '<div class="cc5-principle-content">';
            html += '<span class="cc5-principle-label">' + getLabel('keyPrinciple') + '</span>';
            html += '<span>' + escapeHtml(fixGrammar(activity.boundaryPrinciple)) + '</span>';
            html += '</div>';
            html += '</div>';
        }

        html += '</div>';
        return html;
    }

    // ===========================================================================
    // 6. MICRO-REFLECTION
    // v6.6.63, v6.7.34, v6.7.38
    // ===========================================================================
    function renderReflectionActivity(activity) {
        var html = '<div class="cc5-activity-section cc5-reflection">';
        var totalPrompts = (activity.reflectionPrompts && activity.reflectionPrompts.length) || 0;

        var focusIcons = {
            personal:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 1 0-16 0"/></svg>',
            professional: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
            application:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>',
            team:         '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
            safety:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/></svg>',
            general:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>'
        };

        html += '<div class="cc5-activity-header">';
        html += '<span class="cc5-layer-badge cc5-badge-reflection">';
        html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
        html += getLabel('reflection');
        html += '</span>';
        if (totalPrompts > 1) {
            html += '<span class="cc5-activity-progress" data-total="' + totalPrompts + '">';
            html += '<span class="cc5-progress-complete">0</span> / ' + totalPrompts + ' ' + getLabel('complete');
            html += '</span>';
        }
        if (activity.title) {
            html += '<h3 class="cc5-activity-title">' + escapeHtml(fixGrammar(activity.title)) + '</h3>';
        }
        html += '</div>';

        html += '<div class="cc5-reflection-intro">';
        html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>';
        if (activity.instruction) {
            html += '<p class="cc5-instruction">' + escapeHtml(fixGrammar(activity.instruction)) + '</p>';
            html += '<p class="cc5-instruction">' + getLabel('reflectOnLearning') + '</p>';
        }
        html += '</div>';

        if (activity.reflectionPrompts && activity.reflectionPrompts.length) {
            html += '<div class="cc5-reflection-prompts" data-total="' + totalPrompts + '">';

            activity.reflectionPrompts.forEach(function (prompt) {
                var focusArea = prompt.focusArea || 'general';
                var focusIcon = focusIcons[focusArea] || focusIcons.general;

                // v13.86: focusArea, prompt.id and the label are vendor values in
                // attribute position - all three were raw.
                html += '<div class="cc5-reflection-item" data-focus="' + escapeHtml(focusArea) + '">';
                html += '<div class="cc5-prompt-header">';
                html += '<span class="cc5-focus-icon" title="' + escapeHtml(focusArea) + '">' + focusIcon + '</span>';
                html += '<span class="cc5-focus-label">' + getLabel('focus_' + focusArea) + '</span>';
                html += '</div>';
                html += '<div class="cc5-prompt-question">';
                html += '<span class="cc5-prompt-text">' + escapeHtml(fixGrammar(prompt.prompt)) + '</span>';
                html += '</div>';
                html += '<textarea class="cc5-reflection-input" placeholder="' + getLabel('shareYourThoughts') + '" rows="4" data-min-words="10" data-prompt-id="' + escapeHtml(prompt.id) + '"></textarea>';
                html += '<div class="cc5-word-counter">';
                html += '<span class="cc5-word-count">0</span> / ' + getLabel('minTenWords');
                html += '<span class="cc5-counter-status"></span>';
                html += '</div>';
                html += '<details class="cc5-example-response">';
                html += '<summary>';
                html += '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/></svg>';
                html += '<span>' + getLabel('needInspiration') + '</span>';
                html += '</summary>';
                html += '<div class="cc5-example-content">';
                html += '<span class="cc5-example-label">' + getLabel('exampleResponse') + '</span>';
                html += '<p>' + escapeHtml(fixGrammar(prompt.exampleResponse)) + '</p>';
                html += '</div>';
                // v13.85 FIX BUG-ACT-DETAILS-NEST: same defect as the analysis
                // questions above - '</div>' where '</details>' was needed, nesting
                // every prompt after the first inside its predecessor.
                html += '</details>';
                // v13.85: closes .cc5-reflection-item. A second '</div>' stood here,
                // compensating for the mismatched '</details>' above; with that fixed
                // it closed .cc5-reflection-prompts after the first prompt.
                html += '</div>';
            });

            html += '</div>';

            html += '<div class="cc5-reflection-requirement">';
            html += '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>';
            html += '<span>' + getLabel('reflectionRequirement') + '</span>';
            html += '</div>';
        }

        if (activity.learningTakeaway) {
            html += '<div class="cc5-learning-takeaway">';
            html += '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
            html += '<span>' + escapeHtml(fixGrammar(activity.learningTakeaway)) + '</span>';
            html += '</div>';
        }

        html += '</div>';
        return html;
    }

    // ===========================================================================
    // 7. LEGACY (backward compatibility shim)
    // ===========================================================================
    function renderLegacyActivity(activity) {
        var html = '<div class="cc5-activity-section cc5-legacy-activity">';
        html += '<div class="cc5-activity-header">';
        html += '<span class="cc5-layer-badge cc5-badge-activity">' + getLabel('activity') + '</span>';
        html += '</div>';
        html += '<p class="cc5-activity-description">' + getLabel('completeActivity') + '</p>';
        html += '</div>';
        return html;
    }

    return {
        init: init,
        renderScenarioBranchingActivity: renderScenarioBranchingActivity,
        renderBestResponseActivity:      renderBestResponseActivity,
        renderWhatWentWrongActivity:     renderWhatWentWrongActivity,
        renderSequencingActivity:        renderSequencingActivity,
        renderEscalationActivity:        renderEscalationActivity,
        renderReflectionActivity:        renderReflectionActivity,
        renderLegacyActivity:            renderLegacyActivity
    };
});
