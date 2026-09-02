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
 * Content Creator v5.0.0 - Scenario Decision Cards Activity
 * Workplace scenarios requiring judgment calls
 * 
 * @module     mod_contentcreator/activities/scenario-decision
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

define(['jquery'], function ($) {
    'use strict';

    /**
     * Scenario Decision Activity
     * Presents workplace scenarios with multiple choice options
     * User must select the best course of action
     */
    var ScenarioDecision = function (container, config) {
        this.container = $(container);
        this.config = config;
        this.scenario = config.scenario || {};
        this.options = config.options || [];
        this.correctIndex = config.correctIndex || 0;
        this.explanation = config.explanation || '';
        this.selectedIndex = null;
        this.submitted = false;
        this.onComplete = config.onComplete || function () {};
        
        this.init();
    };

    ScenarioDecision.prototype = {
        init: function () {
            this.render();
            this.bindEvents();
        },

        render: function () {
            var self = this;
            var html = '<div class="cc5-activity cc5-scenario-decision">';
            
            // Scenario card
            html += '<div class="cc5-scenario-card">';
            html += '<div class="cc5-scenario-badge">';
            html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/><circle cx="12" cy="12" r="10"/></svg>';
            html += '<span>SCENARIO</span>';
            html += '</div>';
            html += '<p class="cc5-scenario-text">' + this.escapeHtml(this.scenario.text || 'What would you do?') + '</p>';
            if (this.scenario.context) {
                html += '<p class="cc5-scenario-context">' + this.escapeHtml(this.scenario.context) + '</p>';
            }
            html += '</div>';
            
            // Options
            html += '<div class="cc5-options-list">';
            this.options.forEach(function (option, index) {
                html += '<button class="cc5-option-btn" data-index="' + index + '">';
                html += '<span class="cc5-option-letter">' + String.fromCharCode(65 + index) + '</span>';
                html += '<span class="cc5-option-text">' + self.escapeHtml(option.text) + '</span>';
                html += '<span class="cc5-option-feedback"></span>';
                html += '</button>';
            });
            html += '</div>';
            
            // Submit button
            html += '<div class="cc5-activity-actions">';
            html += '<button class="cc5-submit-btn" disabled>Check Answer</button>';
            html += '</div>';
            
            // Feedback area
            html += '<div class="cc5-feedback-area" style="display: none;"></div>';
            
            html += '</div>';
            
            this.container.html(html);
        },

        bindEvents: function () {
            var self = this;
            
            // Option selection
            this.container.on('click', '.cc5-option-btn', function (e) {
                if (self.submitted) return;
                
                var $btn = $(this);
                var index = parseInt($btn.data('index'), 10);
                
                self.container.find('.cc5-option-btn').removeClass('selected');
                $btn.addClass('selected');
                self.selectedIndex = index;
                
                self.container.find('.cc5-submit-btn').prop('disabled', false);
            });
            
            // Submit
            this.container.on('click', '.cc5-submit-btn', function (e) {
                if (self.submitted || self.selectedIndex === null) return;
                self.submit();
            });
        },

        submit: function () {
            var self = this;
            this.submitted = true;
            
            var isCorrect = this.selectedIndex === this.correctIndex;
            
            // Mark options
            this.container.find('.cc5-option-btn').each(function (index) {
                var $btn = $(this);
                $btn.prop('disabled', true);
                
                if (index === self.correctIndex) {
                    $btn.addClass('correct');
                    $btn.find('.cc5-option-feedback').html('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>');
                } else if (index === self.selectedIndex && !isCorrect) {
                    $btn.addClass('incorrect');
                    $btn.find('.cc5-option-feedback').html('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>');
                }
            });
            
            // Show feedback
            var feedbackClass = isCorrect ? 'correct' : 'incorrect';
            var feedbackIcon = isCorrect 
                ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
                : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" x2="9" y1="9" y2="15"/><line x1="9" x2="15" y1="9" y2="15"/></svg>';
            var feedbackTitle = isCorrect ? 'Correct!' : 'Not quite right';
            
            var feedbackHtml = '<div class="cc5-feedback ' + feedbackClass + '">';
            feedbackHtml += '<div class="cc5-feedback-header">';
            feedbackHtml += feedbackIcon;
            feedbackHtml += '<span>' + feedbackTitle + '</span>';
            feedbackHtml += '</div>';
            if (this.explanation) {
                feedbackHtml += '<p class="cc5-feedback-text">' + this.escapeHtml(this.explanation) + '</p>';
            }
            feedbackHtml += '</div>';
            
            this.container.find('.cc5-feedback-area').html(feedbackHtml).slideDown(200);
            this.container.find('.cc5-submit-btn').text('Continue').off('click').on('click', function () {
                self.onComplete(isCorrect);
            });
        },

        escapeHtml: function (str) {
            if (!str) return '';
            var div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        }
    };

    return {
        init: function (container, config) {
            return new ScenarioDecision(container, config);
        }
    };
});
