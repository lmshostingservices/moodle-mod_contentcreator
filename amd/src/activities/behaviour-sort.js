/**
 * Content Creator v5.0.0 - Behaviour Sort Activity
 * Sort behaviours into Do's and Don'ts categories
 * 
 * @module     mod_contentcreator/activities/behaviour-sort
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

define(['jquery'], function ($) {
    'use strict';

    /**
     * Behaviour Sort Activity
     * Drag-and-drop or click-to-sort behaviours into correct categories
     */
    var BehaviourSort = function (container, config) {
        this.container = $(container);
        this.config = config;
        this.items = this.shuffleArray(config.items || []);
        this.currentIndex = 0;
        this.results = [];
        this.onComplete = config.onComplete || function () {};
        
        this.init();
    };

    BehaviourSort.prototype = {
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
            var html = '<div class="cc5-activity cc5-behaviour-sort">';
            
            // Progress bar
            html += '<div class="cc5-sort-progress">';
            html += '<div class="cc5-sort-progress-bar" style="width: 0%"></div>';
            html += '<span class="cc5-sort-progress-text">0 / ' + this.items.length + '</span>';
            html += '</div>';
            
            // Current item card
            html += '<div class="cc5-sort-item-container">';
            html += '<div class="cc5-sort-item">';
            html += '<p class="cc5-sort-item-text">' + this.escapeHtml(this.items[0]?.text || '') + '</p>';
            html += '</div>';
            html += '</div>';
            
            // Category buttons
            html += '<div class="cc5-sort-categories">';
            html += '<button class="cc5-category-btn cc5-category-do" data-category="do">';
            html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
            html += '<span>DO</span>';
            html += '</button>';
            html += '<button class="cc5-category-btn cc5-category-dont" data-category="dont">';
            html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>';
            html += '<span>DON\'T</span>';
            html += '</button>';
            html += '</div>';
            
            // Feedback toast
            html += '<div class="cc5-sort-toast" style="display: none;"></div>';
            
            // Results area (hidden until complete)
            html += '<div class="cc5-sort-results" style="display: none;"></div>';
            
            html += '</div>';
            
            this.container.html(html);
        },

        bindEvents: function () {
            var self = this;
            
            this.container.on('click', '.cc5-category-btn', function (e) {
                if (self.currentIndex >= self.items.length) return;
                
                var category = $(this).data('category');
                self.sortItem(category);
            });
        },

        sortItem: function (selectedCategory) {
            var self = this;
            var item = this.items[this.currentIndex];
            var isCorrect = item.category === selectedCategory;
            
            this.results.push({
                item: item,
                selected: selectedCategory,
                correct: isCorrect
            });
            
            // Show toast feedback
            var $toast = this.container.find('.cc5-sort-toast');
            var toastClass = isCorrect ? 'correct' : 'incorrect';
            var toastIcon = isCorrect 
                ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>'
                : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>';
            var toastText = isCorrect ? 'Correct!' : 'This is a ' + (item.category === 'do' ? 'DO' : 'DON\'T');
            
            $toast.removeClass('correct incorrect').addClass(toastClass);
            $toast.html(toastIcon + '<span>' + toastText + '</span>');
            $toast.fadeIn(150);
            
            // Animate item out
            var $itemContainer = this.container.find('.cc5-sort-item-container');
            var direction = selectedCategory === 'do' ? '-100%' : '100%';
            $itemContainer.find('.cc5-sort-item').css({
                transform: 'translateX(' + direction + ') rotate(' + (selectedCategory === 'do' ? '-10' : '10') + 'deg)',
                opacity: 0
            });
            
            this.currentIndex++;
            
            // Update progress
            var progress = (this.currentIndex / this.items.length) * 100;
            this.container.find('.cc5-sort-progress-bar').css('width', progress + '%');
            this.container.find('.cc5-sort-progress-text').text(this.currentIndex + ' / ' + this.items.length);
            
            // Next item or complete
            setTimeout(function () {
                $toast.fadeOut(150);
                
                if (self.currentIndex >= self.items.length) {
                    self.showResults();
                } else {
                    self.showNextItem();
                }
            }, 800);
        },

        showNextItem: function () {
            var item = this.items[this.currentIndex];
            var $itemContainer = this.container.find('.cc5-sort-item-container');
            
            // v9.79 FIX (C-02): Reset rotation to 0deg in addition to translateX so the
            // previous card's +/-10deg rotation doesn't bleed onto the next card if the
            // CSS transition hasn't finished when showNextItem fires.
            $itemContainer.find('.cc5-sort-item')
                .css({ transform: 'translateX(0) rotate(0deg)', opacity: 0 })
                .find('.cc5-sort-item-text')
                .text(item.text);
            
            $itemContainer.find('.cc5-sort-item').animate({ opacity: 1 }, 200);
        },

        showResults: function () {
            var correctCount = this.results.filter(function (r) { return r.correct; }).length;
            var totalCount = this.results.length;
            var percentage = Math.round((correctCount / totalCount) * 100);
            var isPassing = percentage >= 80;
            
            var html = '<div class="cc5-results-card ' + (isPassing ? 'pass' : 'needs-review') + '">';
            html += '<div class="cc5-results-header">';
            html += '<div class="cc5-results-score">' + percentage + '%</div>';
            html += '<div class="cc5-results-text">' + correctCount + ' of ' + totalCount + ' correct</div>';
            html += '</div>';
            
            // Show incorrect items
            var incorrectResults = this.results.filter(function (r) { return !r.correct; });
            if (incorrectResults.length > 0) {
                html += '<div class="cc5-results-review">';
                html += '<p class="cc5-results-review-title">Review these items:</p>';
                incorrectResults.forEach(function (r) {
                    html += '<div class="cc5-results-item">';
                    html += '<span class="cc5-results-item-text">' + r.item.text + '</span>';
                    html += '<span class="cc5-results-item-correct">Correct: ' + (r.item.category === 'do' ? 'DO' : 'DON\'T') + '</span>';
                    html += '</div>';
                });
                html += '</div>';
            }
            
            html += '<button class="cc5-continue-btn">Continue</button>';
            html += '</div>';
            
            this.container.find('.cc5-sort-item-container, .cc5-sort-categories').fadeOut(200);
            this.container.find('.cc5-sort-results').html(html).fadeIn(200);
            
            var self = this;
            this.container.find('.cc5-continue-btn').on('click', function () {
                self.onComplete(isPassing);
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
            return new BehaviourSort(container, config);
        }
    };
});
