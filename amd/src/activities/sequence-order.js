/**
 * Content Creator v5.0.0 - Sequence Order Activity
 * Arrange procedural steps in correct order
 * 
 * @module     mod_contentcreator/activities/sequence-order
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

define('mod_contentcreator/activities/sequence-order', ['jquery'], function($) {
    'use strict';

    /**
     * Sequence Order Activity
     * Drag-and-drop to arrange steps in correct sequence
     */
    var SequenceOrder = function(container, config) {
        this.container = $(container);
        this.config = config;
        this.title = config.title || 'Arrange the steps in order';
        this.steps = this.shuffleArray(config.steps || []);
        this.correctOrder = config.correctOrder || config.steps.map(function(s) { return s.id; });
        this.submitted = false;
        this.onComplete = config.onComplete || function() {};
        
        this.init();
    };

    SequenceOrder.prototype = {
        init: function() {
            this.render();
            this.bindEvents();
            this.initDragDrop();
        },

        shuffleArray: function(array) {
            var shuffled = array.slice();
            for (var i = shuffled.length - 1; i > 0; i--) {
                var j = Math.floor(Math.random() * (i + 1));
                var temp = shuffled[i];
                shuffled[i] = shuffled[j];
                shuffled[j] = temp;
            }
            return shuffled;
        },

        render: function() {
            var self = this;
            var html = '<div class="cc5-activity cc5-sequence-order">';
            
            // Title
            html += '<div class="cc5-sequence-header">';
            html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/></svg>';
            html += '<span>' + this.escapeHtml(this.title) + '</span>';
            html += '</div>';
            
            // Steps list
            html += '<div class="cc5-steps-list">';
            this.steps.forEach(function(step, index) {
                html += '<div class="cc5-step-item" data-id="' + self.escapeHtml(step.id) + '" draggable="true">';
                html += '<div class="cc5-step-handle">';
                html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>';
                html += '</div>';
                html += '<div class="cc5-step-number">' + (index + 1) + '</div>';
                html += '<div class="cc5-step-text">' + self.escapeHtml(step.text) + '</div>';
                html += '<div class="cc5-step-feedback"></div>';
                html += '</div>';
            });
            html += '</div>';
            
            // Submit button
            html += '<div class="cc5-activity-actions">';
            html += '<button class="cc5-submit-btn">Check Order</button>';
            html += '</div>';
            
            // Feedback area
            html += '<div class="cc5-feedback-area" style="display: none;"></div>';
            
            html += '</div>';
            
            this.container.html(html);
        },

        bindEvents: function() {
            var self = this;
            
            this.container.on('click', '.cc5-submit-btn', function(e) {
                if (self.submitted) return;
                self.submit();
            });
        },

        initDragDrop: function() {
            var self = this;
            var $list = this.container.find('.cc5-steps-list');
            var draggedItem = null;
            
            $list.on('dragstart', '.cc5-step-item', function(e) {
                draggedItem = this;
                $(this).addClass('dragging');
                e.originalEvent.dataTransfer.effectAllowed = 'move';
            });
            
            $list.on('dragend', '.cc5-step-item', function(e) {
                $(this).removeClass('dragging');
                draggedItem = null;
                self.updateNumbers();
            });
            
            $list.on('dragover', function(e) {
                e.preventDefault();
                var $afterElement = self.getDragAfterElement($list[0], e.originalEvent.clientY);
                var $dragging = $list.find('.dragging');
                
                if ($afterElement.length === 0) {
                    $list.append($dragging);
                } else {
                    $afterElement.before($dragging);
                }
            });
            
            // Touch support
            $list.on('touchstart', '.cc5-step-handle', function(e) {
                var $item = $(this).closest('.cc5-step-item');
                $item.addClass('touch-dragging');
            });
            
            $list.on('touchmove', function(e) {
                var $dragging = $list.find('.touch-dragging');
                if ($dragging.length === 0) return;
                
                e.preventDefault();
                var touch = e.originalEvent.touches[0];
                var $afterElement = self.getDragAfterElement($list[0], touch.clientY);
                
                if ($afterElement.length === 0) {
                    $list.append($dragging);
                } else {
                    $afterElement.before($dragging);
                }
            });
            
            $list.on('touchend', '.cc5-step-item', function(e) {
                $(this).removeClass('touch-dragging');
                self.updateNumbers();
            });
        },

        getDragAfterElement: function(container, y) {
            var $items = $(container).find('.cc5-step-item:not(.dragging):not(.touch-dragging)');
            var result = null;
            var closestOffset = Number.NEGATIVE_INFINITY;
            
            $items.each(function() {
                var box = this.getBoundingClientRect();
                var offset = y - box.top - box.height / 2;
                
                if (offset < 0 && offset > closestOffset) {
                    closestOffset = offset;
                    result = this;
                }
            });
            
            return result ? $(result) : $();
        },

        updateNumbers: function() {
            this.container.find('.cc5-step-item').each(function(index) {
                $(this).find('.cc5-step-number').text(index + 1);
            });
        },

        submit: function() {
            var self = this;
            this.submitted = true;
            
            var currentOrder = [];
            this.container.find('.cc5-step-item').each(function() {
                currentOrder.push($(this).data('id'));
            });
            
            var correctCount = 0;
            this.container.find('.cc5-step-item').each(function(index) {
                var $item = $(this);
                var itemId = $item.data('id');
                var isCorrect = itemId === self.correctOrder[index];
                
                if (isCorrect) {
                    correctCount++;
                    $item.addClass('correct');
                    $item.find('.cc5-step-feedback').html('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>');
                } else {
                    $item.addClass('incorrect');
                    $item.find('.cc5-step-feedback').html('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>');
                }
                
                $item.attr('draggable', 'false');
            });
            
            var allCorrect = correctCount === this.correctOrder.length;
            var percentage = Math.round((correctCount / this.correctOrder.length) * 100);
            
            var feedbackClass = allCorrect ? 'correct' : 'incorrect';
            var feedbackIcon = allCorrect 
                ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
                : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" x2="9" y1="9" y2="15"/><line x1="9" x2="15" y1="9" y2="15"/></svg>';
            var feedbackTitle = allCorrect ? 'Perfect order!' : correctCount + ' of ' + this.correctOrder.length + ' steps in correct position';
            
            var feedbackHtml = '<div class="cc5-feedback ' + feedbackClass + '">';
            feedbackHtml += '<div class="cc5-feedback-header">';
            feedbackHtml += feedbackIcon;
            feedbackHtml += '<span>' + feedbackTitle + '</span>';
            feedbackHtml += '</div>';
            // v9.79 FIX (C-04): Show the correct order after a wrong submission so students
            // can learn from mistakes instead of just seeing a count.
            if (!allCorrect) {
                feedbackHtml += '<div class="cc5-correct-order-detail">';
                feedbackHtml += '<p class="cc5-correct-order-label"><strong>Correct order:</strong></p>';
                feedbackHtml += '<ol class="cc5-correct-order-list">';
                self.correctOrder.forEach(function(id) {
                    var step = null;
                    for (var si = 0; si < self.steps.length; si++) {
                        if (self.steps[si].id === id) { step = self.steps[si]; break; }
                    }
                    feedbackHtml += '<li class="cc5-correct-order-item">' + self.escapeHtml(step ? step.text : id) + '</li>';
                });
                feedbackHtml += '</ol>';
                feedbackHtml += '</div>';
            }
            feedbackHtml += '</div>';
            
            this.container.find('.cc5-feedback-area').html(feedbackHtml).slideDown(200);
            this.container.find('.cc5-submit-btn').text('Continue').off('click').on('click', function() {
                self.onComplete(allCorrect);
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
            return new SequenceOrder(container, config);
        }
    };
});
