/**
 * Content Creator v5.0.0 - Requirement Match Activity
 * Match requirements/rules to situations
 * 
 * @module     mod_contentcreator/activities/requirement-match
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

define(['jquery'], function ($) {
    'use strict';

    /**
     * Requirement Match Activity
     * Match situations to their corresponding requirements
     */
    var RequirementMatch = function (container, config) {
        this.container = $(container);
        this.config = config;
        this.pairs = config.pairs || [];
        this.situations = this.shuffleArray(this.pairs.map(function (p) { return { id: p.id, text: p.situation }; }));
        this.requirements = this.shuffleArray(this.pairs.map(function (p) { return { id: p.id, text: p.requirement }; }));
        this.selectedSituation = null;
        this.matches = {};
        this.submitted = false;
        this.onComplete = config.onComplete || function () {};
        
        this.init();
    };

    RequirementMatch.prototype = {
        init: function () {
            this.render();
            this.bindEvents();
        },

        shuffleArray: function (array) {
            var shuffled = array.slice();
            for (var i = shuffled.length - 1; i > 0; i--) {
                var j = Math.floor(Math.random() * (i + 1));
                var temp = shuffled[i];
                shuffled[i] = shuffled[j];
                shuffled[j] = temp;
            }
            return shuffled;
        },

        render: function () {
            var self = this;
            var html = '<div class="cc5-activity cc5-requirement-match">';
            
            // Header
            html += '<div class="cc5-match-header">';
            html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/></svg>';
            html += '<span>Match each situation to its requirement</span>';
            html += '</div>';
            
            // Matching columns
            html += '<div class="cc5-match-columns">';
            
            // Situations column
            html += '<div class="cc5-match-column cc5-situations-column">';
            html += '<h4 class="cc5-column-title">Situations</h4>';
            this.situations.forEach(function (sit, index) {
                html += '<div class="cc5-match-item cc5-situation" data-id="' + self.escapeHtml(sit.id) + '">';
                html += '<span class="cc5-match-number">' + (index + 1) + '</span>';
                html += '<span class="cc5-match-text">' + self.escapeHtml(sit.text) + '</span>';
                html += '<div class="cc5-match-connector"><div class="cc5-connector-line"></div></div>';
                html += '</div>';
            });
            html += '</div>';
            
            // Requirements column
            html += '<div class="cc5-match-column cc5-requirements-column">';
            html += '<h4 class="cc5-column-title">Requirements</h4>';
            this.requirements.forEach(function (req, index) {
                html += '<div class="cc5-match-item cc5-requirement" data-id="' + self.escapeHtml(req.id) + '">';
                html += '<span class="cc5-match-letter">' + String.fromCharCode(65 + index) + '</span>';
                html += '<span class="cc5-match-text">' + self.escapeHtml(req.text) + '</span>';
                html += '<div class="cc5-match-feedback"></div>';
                html += '</div>';
            });
            html += '</div>';
            
            html += '</div>';
            
            // Progress
            html += '<div class="cc5-match-progress">';
            html += '<span class="cc5-match-count">0</span> of ' + this.pairs.length + ' matched';
            html += '</div>';
            
            // Submit button
            html += '<div class="cc5-activity-actions">';
            html += '<button class="cc5-submit-btn" disabled>Check Matches</button>';
            html += '</div>';
            
            // Feedback area
            html += '<div class="cc5-feedback-area" style="display: none;"></div>';
            
            html += '</div>';
            
            this.container.html(html);
        },

        bindEvents: function () {
            var self = this;
            
            // Situation selection
            this.container.on('click', '.cc5-situation', function (e) {
                if (self.submitted) return;
                
                var $sit = $(this);
                var sitId = $sit.data('id');
                
                // If already matched, unmatch
                if (self.matches[sitId]) {
                    self.unmatch(sitId);
                    return;
                }
                
                self.container.find('.cc5-situation').removeClass('selected');
                $sit.addClass('selected');
                self.selectedSituation = sitId;
            });
            
            // Requirement selection
            this.container.on('click', '.cc5-requirement', function (e) {
                if (self.submitted || !self.selectedSituation) return;
                
                var $req = $(this);
                var reqId = $req.data('id');
                
                // If requirement already matched, unmatch it first
                for (var sitId in self.matches) {
                    if (self.matches[sitId] === reqId) {
                        self.unmatch(sitId);
                        break;
                    }
                }
                
                self.match(self.selectedSituation, reqId);
            });
            
            // Submit
            this.container.on('click', '.cc5-submit-btn', function (e) {
                if (self.submitted) return;
                self.submit();
            });
        },

        match: function (sitId, reqId) {
            this.matches[sitId] = reqId;
            
            var $sit = this.container.find('.cc5-situation[data-id="' + sitId + '"]');
            var $req = this.container.find('.cc5-requirement[data-id="' + reqId + '"]');
            
            $sit.removeClass('selected').addClass('matched');
            $req.addClass('matched');
            
            // v9.80 FIX (C-03): Previously set only plain text in cc5-connector-line  -  no CSS
            // existed to make it visible, so users saw no visual indicator of the match.
            // Now render a styled inline badge with the requirement letter so the connection
            // between situation and requirement is clearly legible without external CSS.
            var reqLetter = $req.find('.cc5-match-letter').text();
            var badgeStyle = 'display:inline-flex;align-items:center;justify-content:center;' +
                'min-width:22px;height:22px;border-radius:50%;background:#3a86ff;color:#fff;' +
                'font-size:11px;font-weight:700;flex-shrink:0;cursor:default;';
            $sit.find('.cc5-connector-line').html(
                '<span class="cc5-connector-badge" style="' + badgeStyle + '">' +
                reqLetter + '</span>'
            );
            
            this.selectedSituation = null;
            this.updateProgress();
        },

        unmatch: function (sitId) {
            var reqId = this.matches[sitId];
            delete this.matches[sitId];
            
            var $sit = this.container.find('.cc5-situation[data-id="' + sitId + '"]');
            var $req = this.container.find('.cc5-requirement[data-id="' + reqId + '"]');
            
            $sit.removeClass('matched');
            $req.removeClass('matched');
            $sit.find('.cc5-connector-line').html('');
            
            this.updateProgress();
        },

        updateProgress: function () {
            var count = Object.keys(this.matches).length;
            this.container.find('.cc5-match-count').text(count);
            this.container.find('.cc5-submit-btn').prop('disabled', count < this.pairs.length);
        },

        submit: function () {
            var self = this;
            this.submitted = true;
            
            var correctCount = 0;
            
            this.container.find('.cc5-situation').each(function () {
                var $sit = $(this);
                var sitId = $sit.data('id');
                var matchedReqId = self.matches[sitId];
                var isCorrect = sitId === matchedReqId;
                
                if (isCorrect) {
                    correctCount++;
                    $sit.addClass('correct');
                    $sit.find('.cc5-connector-badge').css({ background: '#22c55e' });
                } else {
                    $sit.addClass('incorrect');
                    $sit.find('.cc5-connector-badge').css({ background: '#ef4444' });
                }
            });
            
            this.container.find('.cc5-requirement').each(function () {
                var $req = $(this);
                var reqId = $req.data('id');
                
                // Find if this was matched correctly
                for (var sitId in self.matches) {
                    if (self.matches[sitId] === reqId) {
                        var isCorrect = sitId === reqId;
                        if (isCorrect) {
                            $req.addClass('correct');
                            $req.find('.cc5-match-feedback').html('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>');
                        } else {
                            $req.addClass('incorrect');
                            $req.find('.cc5-match-feedback').html('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>');
                        }
                        break;
                    }
                }
            });
            
            var allCorrect = correctCount === this.pairs.length;
            
            var feedbackClass = allCorrect ? 'correct' : 'incorrect';
            var feedbackIcon = allCorrect 
                ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
                : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" x2="9" y1="9" y2="15"/><line x1="9" x2="15" y1="9" y2="15"/></svg>';
            var feedbackTitle = allCorrect ? 'All matches correct!' : correctCount + ' of ' + this.pairs.length + ' matched correctly';
            
            var feedbackHtml = '<div class="cc5-feedback ' + feedbackClass + '">';
            feedbackHtml += '<div class="cc5-feedback-header">';
            feedbackHtml += feedbackIcon;
            feedbackHtml += '<span>' + feedbackTitle + '</span>';
            feedbackHtml += '</div>';
            feedbackHtml += '</div>';
            
            this.container.find('.cc5-feedback-area').html(feedbackHtml).slideDown(200);
            this.container.find('.cc5-submit-btn').text('Continue').off('click').on('click', function () {
                self.onComplete(allCorrect);
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
            return new RequirementMatch(container, config);
        }
    };
});
