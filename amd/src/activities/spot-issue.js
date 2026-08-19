/**
 * Content Creator v5.0.0 - Spot the Issue Activity
 * Identify hazards/issues in workplace scenarios
 * 
 * @module     mod_contentcreator/activities/spot-issue
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

define(['jquery'], function($) {
    'use strict';

    /**
     * Spot Issue Activity
     * Select all issues from a list of statements about a scenario
     */
    var SpotIssue = function(container, config) {
        this.container = $(container);
        this.config = config;
        this.scenario = config.scenario || {};
        this.items = config.items || [];
        this.selectedItems = [];
        this.submitted = false;
        this.onComplete = config.onComplete || function() {};
        
        this.init();
    };

    SpotIssue.prototype = {
        init: function() {
            this.render();
            this.bindEvents();
        },

        render: function() {
            var self = this;
            var html = '<div class="cc5-activity cc5-spot-issue">';
            
            // Scenario description
            html += '<div class="cc5-spot-scenario">';
            html += '<div class="cc5-spot-badge">';
            html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>';
            html += '<span>SPOT THE ISSUES</span>';
            html += '</div>';
            html += '<p class="cc5-spot-text">' + this.escapeHtml(this.scenario.text || 'Review the scenario and select all safety issues:') + '</p>';
            html += '</div>';
            
            // Instruction
            html += '<p class="cc5-spot-instruction">Select all statements that represent an issue or hazard:</p>';
            
            // Items grid
            html += '<div class="cc5-spot-items">';
            this.items.forEach(function(item, index) {
                html += '<button class="cc5-spot-item" data-index="' + index + '">';
                html += '<div class="cc5-spot-checkbox">';
                html += '<svg class="cc5-check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
                html += '</div>';
                html += '<span class="cc5-spot-item-text">' + self.escapeHtml(item.text) + '</span>';
                html += '<div class="cc5-spot-item-feedback"></div>';
                html += '</button>';
            });
            html += '</div>';
            
            // Counter
            html += '<div class="cc5-spot-counter">';
            html += '<span class="cc5-selected-count">0</span> selected';
            html += '</div>';
            
            // Submit button
            html += '<div class="cc5-activity-actions">';
            html += '<button class="cc5-submit-btn">Check Answers</button>';
            html += '</div>';
            
            // Feedback area
            html += '<div class="cc5-feedback-area" style="display: none;"></div>';
            
            html += '</div>';
            
            this.container.html(html);
        },

        bindEvents: function() {
            var self = this;
            
            // Item selection
            this.container.on('click', '.cc5-spot-item', function(e) {
                if (self.submitted) return;
                
                var $item = $(this);
                var index = parseInt($item.data('index'), 10);
                
                if ($item.hasClass('selected')) {
                    $item.removeClass('selected');
                    self.selectedItems = self.selectedItems.filter(function(i) { return i !== index; });
                } else {
                    $item.addClass('selected');
                    self.selectedItems.push(index);
                }
                
                self.container.find('.cc5-selected-count').text(self.selectedItems.length);
            });
            
            // Submit
            this.container.on('click', '.cc5-submit-btn', function(e) {
                if (self.submitted) return;
                self.submit();
            });
        },

        submit: function() {
            var self = this;
            this.submitted = true;
            
            var correctIssues = [];
            var incorrectSelections = [];
            var missedIssues = [];
            
            this.items.forEach(function(item, index) {
                var isSelected = self.selectedItems.indexOf(index) !== -1;
                var isIssue = item.isIssue === true;
                
                if (isIssue) {
                    correctIssues.push(index);
                    if (!isSelected) {
                        missedIssues.push(index);
                    }
                }
                
                if (isSelected && !isIssue) {
                    incorrectSelections.push(index);
                }
            });
            
            // Mark items
            this.container.find('.cc5-spot-item').each(function(index) {
                var $item = $(this);
                var isSelected = self.selectedItems.indexOf(index) !== -1;
                var isIssue = self.items[index].isIssue === true;
                
                $item.prop('disabled', true);
                
                if (isIssue && isSelected) {
                    // Correctly identified
                    $item.addClass('correct-issue');
                    $item.find('.cc5-spot-item-feedback').html('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>');
                } else if (isIssue && !isSelected) {
                    // Missed issue
                    $item.addClass('missed-issue');
                    $item.find('.cc5-spot-item-feedback').html('<span class="cc5-missed-label">Missed</span>');
                } else if (!isIssue && isSelected) {
                    // Incorrect selection
                    $item.addClass('incorrect-selection');
                    $item.find('.cc5-spot-item-feedback').html('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>');
                } else {
                    // Correctly not selected
                    $item.addClass('correct-safe');
                }
            });
            
            // Calculate score
            // v9.79 FIX (C-01): Old formula subtracted 1 correct identification per wrong
            // selection  -  correctlyIdentified - incorrectSelections.length  -  which could zero-score
            // a student who correctly identified ALL issues but clicked one wrong item.
            // New formula: base score is % of issues correctly identified, each wrong selection
            // deducts 10 percentage points (capped at 0). Pass threshold lowered to 60% so
            // students who find all hazards but make minor wrong selections are not punished.
            var correctlyIdentified = correctIssues.length - missedIssues.length;
            var maxScore = correctIssues.length;
            var baseScore = maxScore > 0 ? Math.round((correctlyIdentified / maxScore) * 100) : 0;
            var percentage = Math.max(0, baseScore - (incorrectSelections.length * 10));
            var isPassing = percentage >= 60;
            
            // Feedback
            var feedbackClass = isPassing ? 'correct' : 'incorrect';
            var feedbackIcon = isPassing 
                ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
                : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" x2="9" y1="9" y2="15"/><line x1="9" x2="15" y1="9" y2="15"/></svg>';
            
            var feedbackTitle = isPassing 
                ? 'Great job! You identified all the issues.' 
                : 'You found ' + (correctIssues.length - missedIssues.length) + ' of ' + correctIssues.length + ' issues.';
            
            var feedbackHtml = '<div class="cc5-feedback ' + feedbackClass + '">';
            feedbackHtml += '<div class="cc5-feedback-header">';
            feedbackHtml += feedbackIcon;
            feedbackHtml += '<span>' + feedbackTitle + '</span>';
            feedbackHtml += '</div>';
            
            if (missedIssues.length > 0 || incorrectSelections.length > 0) {
                feedbackHtml += '<div class="cc5-feedback-details">';
                if (missedIssues.length > 0) {
                    feedbackHtml += '<p class="cc5-feedback-missed">Missed ' + missedIssues.length + ' issue(s)</p>';
                }
                if (incorrectSelections.length > 0) {
                    feedbackHtml += '<p class="cc5-feedback-incorrect">' + incorrectSelections.length + ' incorrect selection(s)</p>';
                }
                feedbackHtml += '</div>';
            }
            feedbackHtml += '</div>';
            
            this.container.find('.cc5-feedback-area').html(feedbackHtml).slideDown(200);
            this.container.find('.cc5-submit-btn').text('Continue').off('click').on('click', function() {
                self.onComplete(isPassing);
            });
        },

        escapeHtml: function(str) {
            if (!str) return '';
            var div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        }
    };

    return {
        init: function(container, config) {
            return new SpotIssue(container, config);
        }
    };
});
