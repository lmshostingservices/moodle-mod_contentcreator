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
 * Content Creator v8.4.0 Player
 * Slide-based navigation with progression controls
 * 
 * ChatGPT 3-Layer Learning Model Support:
 * - Layer 1: Core Concept (Knowledge) - foundational content
 * - Layer 2: Workplace Scenario (Application) - decision-based learning
 * - Layer 3: Outcome/Consequences (Why it matters) - impact awareness
 * - Card type badges: Knowledge, Application, Outcome, Assessment Support
 * 
 * Context-Aware Contrast Pairs (v6.5.7):
 * - Dynamic headings: Safe/Unsafe, Compliant/Non-Compliant, Professional/Unprofessional, etc.
 * - Context-matched icons: shield, thumbs-up/down, trending arrows, etc.
 * - Replaces static "Do's and Don'ts" with content-appropriate alternatives
 * 
 * World-Class Topic-End Activities (v6.3.0):
 * - Scenario Branching Decision (FLAGSHIP)
 * - Best Response Analysis
 * - What Went Wrong Case Analysis
 * - Task/Process Sequencing
 * - Escalation Decision
 * - Structured Micro-Reflection
 * 
 * @module     mod_contentcreator/player5
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

define([
    'jquery',
    'core/str',
    'core/ajax',
    'core/notification',
    'core/config',
    'mod_contentcreator/translations',
    'mod_contentcreator/cc-state',
    'mod_contentcreator/cc-icons',
    'mod_contentcreator/cc-activities',
    'mod_contentcreator/cc-card-slots',
    'mod_contentcreator/cc-voiceover',
    'mod_contentcreator/cc-language-switcher'
], function ($, Str, Ajax, Notification, Config, UI_LABELS, CcState, CcIcons, CcActivities, CcCardSlots, CcVoiceover, CcLangSwitcher) {
    'use strict';

    // v9.83 Phase-1: Version + logger from shared cc-state module (eliminates duplication with builder.js).
    const CC_VERSION = CcState.CC_VERSION;
    const _log = CcState.createLogger(false);
    const ccLog = _log.log;
    const ccWarn = _log.warn;
    const ccError = _log.error;

    // v11.02: Voiceover schema version now lives in cc-state.js (single source of truth
    // for both player5.js and builder.js). Alias here so all existing references keep working.
    const VOICEOVER_SCHEMA_VERSION = CcState.VOICEOVER_SCHEMA_VERSION;

    // v9.83 Phase-2: ICONS, CONTEXTUAL_ICON_MAP, CONTRAST_PAIRS, getIcon and
    // getContextualSlideIcon have been moved to cc-icons.js. Module-level aliases
    // below keep all existing call-sites unchanged (no callers need updating).
    var getIcon = CcIcons.getIcon;
    var hasIcon = CcIcons.hasIcon;
    var getContextualSlideIcon = CcIcons.getContextualSlideIcon;
    var resolveScenePartIcon = CcIcons.resolveScenePartIcon;
    // CONTRAST_PAIRS alias so getContrastPair() (below) continues to work unchanged.
    var CONTRAST_PAIRS = CcIcons.CONTRAST_PAIRS;

    /**
     * Get contrast pair configuration (v6.5.7, v6.5.53 - translated labels)
     * @param {string} contrastType - The contrast type key
     * @returns {Object} The contrast pair configuration with translated labels
     */
    function getContrastPair(contrastType) {
        var base = CONTRAST_PAIRS[contrastType] || CONTRAST_PAIRS['dos-donts'];
        
        // v6.5.53: Return translated labels using the UI_LABELS system
        // Map contrastType to UI_LABELS keys
        var labelKeyMap = {
            // v13.94.3: this map had drifted from CONTRAST_PAIRS in cc-icons.js. It
            // carried three keys that exist in no palette ('above-below', 'pro-con',
            // 'right-wrong') and was missing four that do ('great-poor-service',
            // 'compliant-noncompliant', 'above-below-line', 'tick-cross') - so those
            // four would have drawn their own icons under Do's/Don'ts labels. The keys
            // below now match CONTRAST_PAIRS exactly, one for one.
            'dos-donts': { pos: 'dos_donts_pos', neg: 'dos_donts_neg' },
            'safe-unsafe': { pos: 'safe_pos', neg: 'safe_neg' },
            'great-poor-service': { pos: 'service_pos', neg: 'service_neg' },
            'compliant-noncompliant': { pos: 'compliant_pos', neg: 'compliant_neg' },
            'above-below-line': { pos: 'aboveTheLine', neg: 'belowTheLine' },
            'professional-unprofessional': { pos: 'professional_pos', neg: 'professional_neg' },
            'effective-ineffective': { pos: 'effective_pos', neg: 'effective_neg' },
            'best-avoid': { pos: 'best_pos', neg: 'best_neg' },
            'correct-incorrect': { pos: 'correct_pos', neg: 'correct_neg' },
            'tick-cross': { pos: 'correct_pos', neg: 'correct_neg' },
            'acceptable-unacceptable': { pos: 'acceptable_pos', neg: 'acceptable_neg' }
        };
        
        var keys = labelKeyMap[contrastType] || labelKeyMap['dos-donts'];
        
        return {
            positive: getLabel(keys.pos),
            negative: getLabel(keys.neg),
            positiveIcon: base.positiveIcon,
            negativeIcon: base.negativeIcon,
            positiveListIcon: base.positiveListIcon,
            negativeListIcon: base.negativeListIcon
        };
    }

    // ===========================================================================
    // v9.98: Voiceover text fingerprint  -  djb2 hash of the full TTS script.
    // Stored alongside every voiceoverUrl so staleness detection catches
    // content changes regardless of word count (the old +/-3-word check missed
    // regenerated topics with similar-length text, playing stale audio over
    // new slides). Any mismatch between the stored hash and the current
    // buildFullVoiceoverText() output forces fresh TTS synthesis.
    // ===========================================================================
    // v11.02: Hash function now lives in cc-state.js. Alias for all existing call-sites.
    var voiceoverTextHash = CcState.voiceoverTextHash;

    // ===========================================================================
    // v6.6.94: Audio Feedback System
    // Pleasant sounds for correct/incorrect answers using Web Audio API
    // ===========================================================================
    var audioContext = null;
    
    /**
     * Initialize Web Audio API context (lazy initialization)
     */
    function getAudioContext() {
        if (!audioContext) {
            try {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
            } catch (e) {
                return null;
            }
        }
        return audioContext;
    }
    
    
    
    /**
     * v7.9.62: Play a simple tick sound for checkbox interactions
     * Uses a single short click sound appropriate for ticking boxes
     */
    function playTickSound() {
        var ctx = getAudioContext();
        if (!ctx) return;
        
        if (ctx.state === 'suspended') {
            ctx.resume();
        }
        
        var now = ctx.currentTime;
        var oscillator = ctx.createOscillator();
        var gainNode = ctx.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        // Simple high-pitched tick - short and unobtrusive
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(1200, now); // Higher pitch for tick
        
        // Very short duration with quick fade
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.12, now + 0.005);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        
        oscillator.start(now);
        oscillator.stop(now + 0.05);
    }

    /**
     * v6.7.47: Play celebration sound for perfect activity score
     * Uses an ascending arpeggio for celebratory feedback
     */
    function playCelebrationSound() {
        var ctx = getAudioContext();
        if (!ctx) return;
        
        if (ctx.state === 'suspended') {
            ctx.resume();
        }
        
        var now = ctx.currentTime;
        
        // Celebratory ascending arpeggio (C5  ->  E5  ->  G5  ->  C6)
        var frequencies = [523.25, 659.25, 783.99, 1046.50];
        var duration = 0.12;
        var gap = 0.08;
        
        frequencies.forEach(function (freq, i) {
            var oscillator = ctx.createOscillator();
            var gainNode = ctx.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);
            
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(freq, now + (i * (duration + gap)));
            
            var noteStart = now + (i * (duration + gap));
            gainNode.gain.setValueAtTime(0, noteStart);
            gainNode.gain.linearRampToValueAtTime(0.25, noteStart + 0.02);
            gainNode.gain.exponentialRampToValueAtTime(0.01, noteStart + duration);
            
            oscillator.start(noteStart);
            oscillator.stop(noteStart + duration);
        });
    }

    /**
     * v11.10: Play a soft "whoosh" for card flip interaction.
     * A filtered noise burst that sounds like flipping a physical card.
     */
    function playFlipSound() {
        var ctx = getAudioContext();
        if (!ctx) return;
        if (ctx.state === 'suspended') { ctx.resume(); }
        var now = ctx.currentTime;
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        var filter = ctx.createBiquadFilter();
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.12);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2000, now);
        filter.frequency.exponentialRampToValueAtTime(400, now + 0.12);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.1, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.12);
    }

    /**
     * v11.10: Play a soft drop "thunk" when a sort item lands in a column.
     */
    function playSortDropSound() {
        var ctx = getAudioContext();
        if (!ctx) return;
        if (ctx.state === 'suspended') { ctx.resume(); }
        var now = ctx.currentTime;
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.08);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.08, now + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
    }

    /**
     * v11.10: Play a triumphant fanfare for 100% challenge completion.
     * 5-note ascending major arpeggio with harmonics.
     */
    function playChallengeCompleteSound() {
        var ctx = getAudioContext();
        if (!ctx) return;
        if (ctx.state === 'suspended') { ctx.resume(); }
        var now = ctx.currentTime;
        var notes = [523.25, 659.25, 783.99, 1046.50, 1318.51];
        var dur = 0.18;
        var gap = 0.07;
        notes.forEach(function (freq, i) {
            var osc = ctx.createOscillator();
            var osc2 = ctx.createOscillator();
            var gain = ctx.createGain();
            osc.connect(gain);
            osc2.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc2.type = 'triangle';
            osc.frequency.setValueAtTime(freq, now);
            osc2.frequency.setValueAtTime(freq * 2, now);
            var t0 = now + i * (dur + gap);
            gain.gain.setValueAtTime(0, t0);
            gain.gain.linearRampToValueAtTime(i === notes.length - 1 ? 0.2 : 0.14, t0 + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
            osc.start(t0);
            osc.stop(t0 + dur);
            osc2.start(t0);
            osc2.stop(t0 + dur);
        });
    }

    /**
     * v11.10: Play a smooth "swoosh" when panels slide between activities.
     * A quick filtered sweep that sounds like a page turning.
     */
    function playSlideSound() {
        var ctx = getAudioContext();
        if (!ctx) return;
        if (ctx.state === 'suspended') { ctx.resume(); }
        var now = ctx.currentTime;
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        var filter = ctx.createBiquadFilter();
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.15);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(3000, now);
        filter.frequency.exponentialRampToValueAtTime(300, now + 0.15);
        filter.Q.setValueAtTime(2, now);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.06, now + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
    }

    /**
     * v11.10: Play a subtle "pop" when the Next button becomes enabled.
     */
    function playUnlockSound() {
        var ctx = getAudioContext();
        if (!ctx) return;
        if (ctx.state === 'suspended') { ctx.resume(); }
        var now = ctx.currentTime;
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(1320, now + 0.06);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.1, now + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        osc.start(now);
        osc.stop(now + 0.06);
    }

    /**
     * v10.63: Play a two-note ascending success sound for a correct decision-point answer.
     * Distinct from playCelebrationSound (4-note arpeggio for perfect ALL-correct score)  - 
     * this is a shorter, softer "ding-ding" for a single correct option pick.
     */
    function playDecisionCorrectSound() {
        var ctx = getAudioContext();
        if (!ctx) return;
        if (ctx.state === 'suspended') { ctx.resume(); }
        var now = ctx.currentTime;
        // G5 (784 Hz)  ->  C6 (1047 Hz)  -  ascending major interval, cheerful
        var notes = [783.99, 1046.50];
        var noteDur = 0.13;
        var gap     = 0.06;
        notes.forEach(function (freq, i) {
            var osc  = ctx.createOscillator();
            var gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + i * (noteDur + gap));
            var t0 = now + i * (noteDur + gap);
            gain.gain.setValueAtTime(0, t0);
            gain.gain.linearRampToValueAtTime(0.18, t0 + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.001, t0 + noteDur);
            osc.start(t0);
            osc.stop(t0 + noteDur);
        });
    }

    /**
     * v10.63: Play a two-note descending "try again" sound for a wrong decision-point answer.
     * Gentle and non-harsh  -  signals "not quite" without being alarming.
     */
    function playDecisionIncorrectSound() {
        var ctx = getAudioContext();
        if (!ctx) return;
        if (ctx.state === 'suspended') { ctx.resume(); }
        var now = ctx.currentTime;
        // E4 (330 Hz)  ->  C4 (262 Hz)  -  descending minor second, soft "nope"
        var notes = [329.63, 261.63];
        var noteDur = 0.14;
        var gap     = 0.05;
        notes.forEach(function (freq, i) {
            var osc  = ctx.createOscillator();
            var gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + i * (noteDur + gap));
            var t0 = now + i * (noteDur + gap);
            gain.gain.setValueAtTime(0, t0);
            gain.gain.linearRampToValueAtTime(0.12, t0 + 0.018);
            gain.gain.exponentialRampToValueAtTime(0.001, t0 + noteDur);
            osc.start(t0);
            osc.stop(t0 + noteDur);
        });
    }

    /**
     * v11.15: Trigger a short haptic buzz on supported mobile devices.
     * Falls back silently on desktop / unsupported browsers.
     */
    function haptic(ms) {
        try { if (navigator.vibrate) { navigator.vibrate(ms || 10); } } catch (e) { /* noop */ }
    }

    /**
     * v11.15: Show a per-activity mini celebration banner.
     * Injects a brief "Activity Complete!" toast inside the panel that animates in
     * and fades out after ~2 seconds. Provides a rewarding milestone moment
     * before the user taps "Next Activity".
     */
    function showActivityMiniCelebration($panel) {
        if ($panel.find('.cc5-mini-celebration').length) return;
        var $banner = $('<div class="cc5-mini-celebration">'
            + '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>'
            + ' Activity Complete!'
            + '</div>');
        $panel.append($banner);
        setTimeout(function () { $banner.addClass('cc5-mini-celebration-out'); }, 2200);
        setTimeout(function () { $banner.remove(); }, 2800);
    }

    /**
     * v11.15: Validate uploaded image aspect ratio before sending to server.
     * Accepts landscape and moderate ratios (width/height between 1.0 and 3.5).
     * Rejects portrait or extreme panoramic images. Calls onAccept(file) if OK,
     * otherwise shows an error toast and resets the file input.
     */
    function validateImageAspectRatio(file, onAccept) {
        var img = new Image();
        var url = URL.createObjectURL(file);
        img.onload = function () {
            URL.revokeObjectURL(url);
            var ratio = img.width / img.height;
            if (ratio < 1.0) {
                showErrorToast(
                    'Portrait images are not supported. Please use a landscape image (wider than it is tall). Ideal ratio is 16:9, e.g. 1920\u00d71080.',
                    'imageRatioPortrait'
                );
                return;
            }
            if (ratio > 3.5) {
                showErrorToast(
                    'This image is too wide (panoramic). Please use a standard landscape image. Ideal ratio is 16:9, e.g. 1920\u00d71080.',
                    'imageRatioPanoramic'
                );
                return;
            }
            onAccept(file);
        };
        img.onerror = function () {
            URL.revokeObjectURL(url);
            showErrorToast('Could not read this image file. Please try a different image.', 'imageReadError');
        };
        img.src = url;
    }

    /**
     * v6.7.47: Show mini confetti for perfect activity completion
     */

    function showActivityConfetti() {
        var root = document.getElementById('contentcreator-app');
        if (!root) {
            return;
        }
        var canvas = document.createElement('canvas');
        canvas.className = 'cc5-activity-confetti';
        var rect = root.getBoundingClientRect();
        canvas.width = Math.max(1, Math.floor(rect.width));
        canvas.height = Math.max(1, Math.floor(rect.height));
        canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999';
        root.appendChild(canvas);
        
        var ctx = canvas.getContext('2d');
        var particles = [];
        var colors = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#fbbf24'];
        
        for (var i = 0; i < 80; i++) {
            particles.push({
                x: Math.random() * canvas.width,
                y: -20 - Math.random() * 80,
                vx: (Math.random() - 0.5) * 4,
                vy: Math.random() * 2 + 2,
                color: colors[Math.floor(Math.random() * colors.length)],
                size: Math.random() * 6 + 3,
                rotation: Math.random() * 360,
                rotationSpeed: (Math.random() - 0.5) * 8
            });
        }
        
        var frameCount = 0;
        var maxFrames = 120;
        
        function animate() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            particles.forEach(function (p) {
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rotation * Math.PI / 180);
                ctx.fillStyle = p.color;
                ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size);
                ctx.restore();
                
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.1;
                p.rotation += p.rotationSpeed;
            });
            
            frameCount++;
            if (frameCount < maxFrames) {
                requestAnimationFrame(animate);
                return;
            }
            if (canvas.parentNode) {
                canvas.parentNode.removeChild(canvas);
            }
        }
        
        animate();
    }

    // Color theme classes
    const COLOR_THEMES = {
        primary: { bg: 'cc5-bg-primary', text: 'cc5-text-primary', light: 'cc5-bg-primary-light' },
        blue: { bg: 'cc5-bg-blue', text: 'cc5-text-blue', light: 'cc5-bg-blue-light' },
        green: { bg: 'cc5-bg-green', text: 'cc5-text-green', light: 'cc5-bg-green-light' },
        amber: { bg: 'cc5-bg-amber', text: 'cc5-text-amber', light: 'cc5-bg-amber-light' },
        rose: { bg: 'cc5-bg-rose', text: 'cc5-text-rose', light: 'cc5-bg-rose-light' },
        purple: { bg: 'cc5-bg-purple', text: 'cc5-text-purple', light: 'cc5-bg-purple-light' },
        red: { bg: 'cc5-bg-red', text: 'cc5-text-red', light: 'cc5-bg-red-light' },
        yellow: { bg: 'cc5-bg-yellow', text: 'cc5-text-yellow', light: 'cc5-bg-yellow-light' },
        teal: { bg: 'cc5-bg-teal', text: 'cc5-text-teal', light: 'cc5-bg-teal-light' },
        gray: { bg: 'cc5-bg-gray', text: 'cc5-text-gray', light: 'cc5-bg-gray-light' }
    };

    // Progression modes
    const PROGRESSION_MODES = {
        FREE: 'free',           // Click next anytime
        VOICEOVER: 'voiceover', // Must listen to voiceover
        TIMED: 'timed'          // Minimum time per slide
    };

    // ===========================================================================

    // Current language code (extracted from voiceSettings.language)
    var currentLang = 'en';

    /**
     * Get UI label by key (v6.5.24)
     * Falls back to English if translation not found
     * @param {string} key - The label key
     * @returns {string} The translated label
     */
    /**
     * v13.86: labels resolved through Moodle first, the private table second.
     *
     * The ~347 player labels lived ONLY in translations.js, so no site could translate
     * them through AMOS or override the wording, and the private table duplicated work
     * Moodle already does. They are now declared in lang/en/contentcreator.php as
     * cclabel_<key> and prefetched below, so an administrator's customisation and any
     * community translation win. The private table remains the fallback and still
     * serves the other 52 languages, so nothing regresses while the rest migrate.
     */
    var _moodleLabels = {};

    /**
     * Prefetch every player label from Moodle's string API in one request.
     *
     * Str.get_strings() batches, so this is a single round trip rather than 347.
     * Until it resolves - and for any key a site has not defined - getLabel() simply
     * uses the private table, which is the behaviour that existed before v13.86.
     *
     * @param {Array} keys The label keys used by this player.
     * @return {Promise} Resolves once the labels are cached, and never rejects.
     */
    function preloadMoodleLabels(keys) {
        try {
            var requests = keys.map(function (k) {
                return { key: 'cclabel_' + k, component: 'mod_contentcreator' };
            });
            return Str.get_strings(requests).then(function (values) {
                keys.forEach(function (k, i) {
                    var v = values[i];
                    // Moodle returns '[[key]]' for an undefined string; never cache that.
                    if (typeof v === 'string' && v && v.indexOf('[[') !== 0) {
                        _moodleLabels[k] = v;
                    }
                });
                return true;
            }).catch(function () {
                return false;
            });
        } catch (e) {
            return Promise.resolve(false);
        }
    }

    function getLabel(key) {
        var langCode = currentLang.split('-')[0]; // Extract 'ja' from 'ja-JP'

        // v13.90 FIX: the Moodle string table used to win unconditionally. Moodle serves
        // strings in the SITE's language, not the pack's, so on an English Moodle every
        // label defined in the lang file came back English - and a Japanese or Spanish
        // pack rendered its chrome in English while its content was translated. The
        // pack's own table wins whenever the pack is not English and a table exists for
        // it. Moodle strings remain the source for English packs, where they let a site
        // customise wording - which is what they were added for.
        if (langCode !== 'en' && UI_LABELS[langCode] && UI_LABELS[langCode][key]) {
            return UI_LABELS[langCode][key];
        }
        if (Object.prototype.hasOwnProperty.call(_moodleLabels, key)) {
            return _moodleLabels[key];
        }
        var labels = UI_LABELS[langCode] || UI_LABELS['en'];
        return labels[key] || UI_LABELS['en'][key] || key;
    }

    /**
     * Set current language from manifest (v6.5.24)
     * @param {string} language - The language code (e.g., 'ja-JP', 'zh-CN', 'en-AU')
     */
    function setCurrentLanguage(language) {
        currentLang = language || 'en-AU';
    }

    /**
     * Get color theme
     */
    function getColorTheme(color) {
        return COLOR_THEMES[color] || COLOR_THEMES.primary;
    }

    /**
     * Find a section's subtopic billing key.
     *
     * FIX-CC-SUBTOPIC-BILLING-KEY (v13.95.2): the on-demand voiceover path holds only a
     * section id, but the vendor needs the subtopic key to tell a first narration (covered by
     * the subtopic's price) from a regeneration (charged). Returns '' when the manifest
     * predates this release, which the vendor treats as "price it the old way".
     *
     * @param {object} manifest - The player manifest.
     * @param {string} sectionId - The section to look up.
     * @returns {string} The billing key, or '' when unknown.
     */
    function billingKeyForSection(manifest, sectionId) {
        var topics = (manifest && manifest.topics) || [];
        for (var i = 0; i < topics.length; i++) {
            var sections = topics[i].sections || topics[i].subtopics || [];
            for (var j = 0; j < sections.length; j++) {
                if (sections[j] && sections[j].id === sectionId) {
                    return sections[j].billingKey || '';
                }
            }
        }
        return '';
    }

    /**
     * Find section by ID with fallback strategies (v6.5.58)
     * Handles ID format mismatches between old/new content generation
     * @param {Array} topics - The topics array from manifest
     * @param {string} topicId - The topic ID to find
     * @param {string} sectionId - The section ID to find
     * @returns {object|null} - { section, topicIndex, sectionIndex } or null
     */
    function findSectionWithFallback(topics, topicId, sectionId) {
        if (!topics || !sectionId) return null;
        
        // Strategy 1: Exact match on topic.id and section.id
        for (var i = 0; i < topics.length; i++) {
            if (topics[i].id === topicId) {
                var sections = topics[i].sections || [];
                for (var j = 0; j < sections.length; j++) {
                    if (sections[j].id === sectionId) {
                        return { section: sections[j], topicIndex: i, sectionIndex: j };
                    }
                }
                
                // Strategy 2: Try pcNumber match within same topic
                for (var k = 0; k < sections.length; k++) {
                    if (sections[k].pcNumber === sectionId) {
                        return { section: sections[k], topicIndex: i, sectionIndex: k };
                    }
                }
                break;
            }
        }
        
        // Strategy 3: Index-based lookup (e.g., "1.4" -> topic 0, section 3)
        if (sectionId && sectionId.includes('.')) {
            var parts = sectionId.split('.');
            var topicIdx = parseInt(parts[0]) - 1;
            var sectionIdx = parseInt(parts[1]) - 1;
            if (topics[topicIdx] && topics[topicIdx].sections && topics[topicIdx].sections[sectionIdx]) {
                return { section: topics[topicIdx].sections[sectionIdx], topicIndex: topicIdx, sectionIndex: sectionIdx };
            }
        }
        
        return null;
    }

    /**
     * Escape HTML to prevent XSS
     */
    function normalizeTerm(t) {
        if (!t) return null;
        if (typeof t === 'object' && (t.term || t.name) && (t.definition || t.meaning)) return t;
        if (typeof t === 'string') {
            var sep = t.indexOf(' - ');
            if (sep === -1) sep = t.indexOf(': ');
            if (sep > 0) {
                return { term: t.substring(0, sep).trim(), definition: t.substring(sep + (t.charAt(sep + 1) === ' ' ? 3 : 2)).trim() };
            }
            return { term: t.trim(), definition: '' };
        }
        if (typeof t === 'object') {
            var name = t.term || t.name || t.label || '';
            var def = t.definition || t.meaning || t.description || t.explanation || '';
            if (name) return { term: name, definition: def };
        }
        return null;
    }

    /**
     * Get deduplicated terminology from section
     * @param {object} section - The section data
     * @returns {Array} Deduplicated array of {term, definition} objects
     */
    function getTerminology(section) {
        var combined = [];
        var seen = {};
        var terms = section.terminology || [];
        if (!Array.isArray(terms)) terms = [terms];
        terms.forEach(function (rawTerm) {
            var term = normalizeTerm(rawTerm);
            if (!term) return;
            var name = (term.term || '').trim().toLowerCase();
            if (name && !seen[name]) {
                seen[name] = true;
                combined.push(term);
            }
        });
        return combined;
    }

    /**
     * Fix AI-generated intro text sentence boundaries
     * Shared helper used by voiceover build and slide intro card rendering
     * @param {string} text - Raw voiceover/intro text
     * @returns {Array} Array of cleaned sentences (max 5, min 10 chars each)
     */
    function fixIntroSentences(text) {
        if (!text) return [];
        var fixed = text.replace(/([a-z]{3,})\s{2,}([A-Z])/g, "$1. $2").replace(/([a-z]{3,}[^.!?])\s+([A-Z][a-z]{3,})/g, function (m, p1, p2) { if (/(?:before|after|during|using|like|and|with|from|into|near|for|the|than|about)$/i.test(p1)) return m; return p1 + ". " + p2; });
        return fixed.split(/(?<=[.!?])\s+/).map(function (s) { var t = s.trim(); if (t && !/[.!?]$/.test(t)) t += '.'; return t; }).filter(function (s) { return s.length > 10; }).slice(0, 5);
    }
    /**
     * v13.94.6: narration weight for one segment, in word-equivalents.
     *
     * Whitespace word counting silently collapses on scripts that do not space their
     * words - Japanese, Mandarin, Cantonese and Thai, all four of which the plugin offers
     * a Chirp 3 HD voice for. A whole paragraph counts as one "word", so every segment
     * ends up equally weighted and the proportional split that drives the card reveal and
     * the paragraph highlight stops corresponding to the audio at all.
     *
     * If the whitespace count is implausibly low for the character count, the text is
     * treated as unspaced and weighted by characters instead, scaled so the number is
     * comparable to a word count (~2.2 characters per word-equivalent, which is close to
     * the speaking rate ratio for CJK against English at the same wpm setting).
     *
     * @param {String} text Segment text.
     * @return {Number} Weight in word-equivalents, always at least 1.
     */
    function _voWeight(text) {
        var t = String(text || '').trim();
        if (!t) { return 1; }
        var words = t.split(/\s+/).filter(Boolean).length;
        // v13.94.8: detect the script directly rather than inferring it from spacing.
        //
        // The first version tested "few words for this many characters", which is true of
        // CJK but is ALSO true of any long compound token - "Antidiscrimination" scored 9
        // instead of 1, and German compounds like
        // "Arbeitsschutzverordnung Gesundheitsschutz" scored 19 instead of 2, taking a
        // wildly oversized share of the narration timeline. No ratio threshold separates
        // the two cases: German at 41 chars / 2 words sits right where Japanese does.
        //
        // Counting the characters that actually belong to a non-spacing script is exact.
        // Covers CJK ideographs, kana, Hangul and Thai - every unspaced language the voice
        // list offers. ~2.2 characters per word-equivalent approximates the speaking-rate
        // ratio against English at the same wpm.
        var unspaced = (t.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af\u0e00-\u0e7f]/g) || []).length;
        if (unspaced > t.length / 2) {
            return Math.max(1, Math.ceil(t.length / 2.2));
        }
        return Math.max(1, words);
    }


    function fixGrammar(str) {
        if (!str) return str;
        if (typeof str !== 'string') str = String(str);
        var s = str;
        // v13.94.6: this function stripped MARKDOWN and nothing else, so a field
        // holding HTML - a <br> between two sentences, a <strong> around a term, an
        // <em> the AI wrapped a definition in - reached Chirp 3 HD as literal tag
        // text and was read out as "less than b r greater than". The renderer escapes
        // those tags for display, which is why nobody saw them on screen; narration
        // has to delete them instead. <br> and closing block tags become a space so
        // the sentences either side do not fuse into one word; everything else is
        // removed outright. Done FIRST so the markdown passes below see clean text.
        // NOTE: cc-state.js _fg carries the identical three lines - they must match,
        // or the voiceover hash computed by the player diverges from the builder's.
        s = s.replace(/<br\s*\/?>/gi, ' ');
        s = s.replace(/<\/(?:p|div|li|ul|ol|h[1-6]|tr|td|th|blockquote)>/gi, ' ');
        s = s.replace(/<[^>]+>/g, '');
        // v10.13: Strip markdown before TTS  -  convert **bold** and _italic_ to plain text
        s = s.replace(/\*\*([^*]+)\*\*/g, '$1');
        s = s.replace(/__([^_]+)__/g, '$1');
        s = s.replace(/\*([^*]+)\*/g, '$1');
        s = s.replace(/_([^_]+)_/g, '$1');
        // v12.57 FIX-VO-SYMBOLS: Strip markdown horizontal rules and other symbol sequences
        // that Google Chirp TTS reads aloud as "dash dash dash dot" etc. These appear when
        // AI-generated content uses --- as a section divider or when editors paste markdown.
        // Three or more consecutive hyphens are never valid prose  -  safe to remove entirely.
        // Also strip triple-star (***) and triple-underscore (___) horizontal rule variants.
        s = s.replace(/-{3,}/g, '');
        s = s.replace(/\*{3,}/g, '');
        s = s.replace(/#{1,6}\s*/g, '');  // strip markdown headings (# ## ### etc.)  -  TTS says "hash"
        s = s.replace(/\bso you don['\u2019]?t\s+(?=[a-z]+\b)(?!have|get|need|make|miss|lose|fall|cause|end|skip|forget|ignore|rush|start|put|leave|let|take|break|use|risk|create|become|repeat|face|allow|go|run|do|know|see|feel|think|try|keep|come|give|find|want|work|stop|set|move|turn|hold|bring|begin|carry|follow|overlook|expose|compromise|violate|exceed|delay|suffer|experience|injure|damage|endanger|contaminate|drop|wear|hit|cut|catch|pass|sit|stand|add|open|check|provide|handle|manage|ensure|maintain|avoid|prevent|reduce|increase|improve|receive|complete)/gi, 'so you avoid ');
        s = s.replace(/\bso you\s+your\b/gi, 'so you protect your');
        s = s.replace(/\bso you\s+safety\b/gi, 'so you maintain safety');
        s = s.replace(/\bso you\s+the\s+safety\b/gi, 'so you ensure the safety');
        s = s.replace(/\bso you\s+the\s+/gi, 'so you understand the ');
        s = s.replace(/\bso you\s+(?:optimal|proper|adequate|sufficient|full|complete|clear|immediate|minimal|consistent|accurate|appropriate|correct|comfortable|effective|efficient|maximum|minimum|good|better|best|safe|total|reliable|thorough|reasonable|necessary|successful|secure|healthy|stable|strong|smooth|timely|rapid|quick|clean|standard|suitable|regular|balanced|controlled|steady|uniform)\b/gi, function (match) {
            return 'so you ensure ' + match.replace(/^so you\s+/i, '');
        });
        s = s.replace(/\b(is|are|was|were)\s+because\s+because\b/gi, '$1 because');
        s = s.replace(/\b(\w{4,})\s+\1\b/g, '$1');
        s = s.replace(/\.\s*\.\s*/g, '. ');
        s = s.replace(/\s{2,}/g, ' ');
        return s.trim();
    }

    /**
     * v13.86: strip anything executable from vendor-supplied document HTML.
     *
     * The document example is deliberately rendered as markup rather than escaped -
     * it is a formatted workplace document, and escaping it would show the learner
     * raw tags. That makes it the one innerHTML path in this file that does not go
     * through escapeHtml(), so it gets its own allow-list instead: parse the markup
     * inertly, then remove script/style/iframe/object and every on* handler and
     * javascript: URL before it reaches the live DOM.
     *
     * @param {String} html Untrusted markup.
     * @return {String} Markup with executable content removed.
     */
    function sanitiseDocumentHtml(html) {
        if (!html) { return ''; }
        try {
            var doc = new DOMParser().parseFromString(String(html), 'text/html');
            var banned = doc.body.querySelectorAll('script,style,iframe,object,embed,link,meta,form,base');
            Array.prototype.forEach.call(banned, function (node) { node.parentNode.removeChild(node); });
            var all = doc.body.querySelectorAll('*');
            Array.prototype.forEach.call(all, function (node) {
                Array.prototype.slice.call(node.attributes).forEach(function (attr) {
                    var name = attr.name.toLowerCase();
                    var value = String(attr.value || '').replace(/\s+/g, '').toLowerCase();
                    if (name.indexOf('on') === 0) { node.removeAttribute(attr.name); return; }
                    if ((name === 'href' || name === 'src' || name === 'xlink:href') &&
                        (value.indexOf('javascript:') === 0 || value.indexOf('data:text/html') === 0)) {
                        node.removeAttribute(attr.name);
                    }
                });
            });
            return doc.body.innerHTML;
        } catch (e) {
            // If parsing fails, showing the document as plain text is the safe outcome.
            return escapeHtml(String(html));
        }
    }

    /**
     * v13.86: decide whether the player should render dark, and stamp the classes.
     *
     * Precedence: an explicit choice by the Moodle theme (data-bs-theme or a .dark
     * class on html/body) wins; otherwise the operating system preference decides.
     * Re-runs when either changes, so a learner toggling their site theme or their OS
     * appearance does not have to reload the activity.
     *
     * @return {void}
     */
    function applyThemeClasses() {
        var apply = function () {
            var root = document.documentElement;
            var body = document.body;
            var explicit = '';
            [root, body].forEach(function (el) {
                if (!el || explicit) { return; }
                var attr = el.getAttribute('data-bs-theme') || el.getAttribute('data-theme') || '';
                if (attr === 'dark' || attr === 'light') { explicit = attr; return; }
                // Skip the `dark` class ON BODY when we are the ones who put it there -
                // otherwise our own stamp reads back as the site's explicit choice and
                // the player can never follow the OS switching back to light.
                var ourOwnStamp = (el === body && applyThemeClasses._stampedBody);
                if (!ourOwnStamp && (el.classList.contains('dark') || el.classList.contains('theme-dark'))) { explicit = 'dark'; }
                if (el.classList.contains('light') || el.classList.contains('theme-light')) { explicit = 'light'; }
            });

            var isDark;
            if (explicit) {
                isDark = (explicit === 'dark');
            } else {
                isDark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
            }

            // Every family the stylesheet looks for, so one resolved decision drives
            // all 335 rules instead of leaving most of them unreachable.
            if (body) {
                body.classList.toggle('dark', isDark);
                applyThemeClasses._stampedBody = isDark;
            }
            document.querySelectorAll('.cc5-player').forEach(function (el) {
                el.classList.toggle('dark', isDark);
                el.classList.toggle('cc5-dark', isDark);
                el.classList.toggle('dark-mode', isDark);
            });
            document.querySelectorAll('.cc5-container, #contentcreator-app').forEach(function (el) {
                el.classList.toggle('dark', isDark);
                el.classList.toggle('cc5-dark', isDark);
            });
        };

        apply();

        try {
            if (window.matchMedia) {
                var mq = window.matchMedia('(prefers-color-scheme: dark)');
                if (mq.addEventListener) {
                    mq.addEventListener('change', apply);
                } else if (mq.addListener) {
                    mq.addListener(apply);
                }
            }
            // The site theme can flip at runtime; watch the attributes that carry it.
            if (window.MutationObserver) {
                var observer = new MutationObserver(apply);
                observer.observe(document.documentElement, {
                    attributes: true,
                    attributeFilter: ['data-bs-theme', 'data-theme', 'class']
                });
                if (document.body) {
                    observer.observe(document.body, {
                        attributes: true,
                        attributeFilter: ['data-bs-theme', 'data-theme', 'class']
                    });
                }
            }
        } catch (e) {
            // Theme following is a nicety; never let it stop the player loading.
        }

        // The player replaces its own container on every navigation, so newly built
        // elements need stamping too. Watching the app root for child changes is
        // cheaper and more responsive than polling.
        try {
            var app = document.getElementById('contentcreator-app');
            if (app && window.MutationObserver && !applyThemeClasses._domObserver) {
                applyThemeClasses._domObserver = new MutationObserver(function () { apply(); });
                applyThemeClasses._domObserver.observe(app, { childList: true, subtree: true });
            }
        } catch (e) {
            // Non-fatal.
        }
    }

    function escapeHtml(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.textContent = str;
        // v13.86: the HTML serialiser escapes & < > in a text node but NEVER quotes,
        // and this function is used in attribute position throughout the file - alt
        // text, data-* attributes, and the slide editor's input values. A quote in
        // vendor or teacher content closed the attribute and everything after it was
        // parsed as markup. Escaping both quote characters closes that off at the
        // one place every call site already goes through.
        return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // FIX v10.43: Strip leaked PC body text from topic titles stored in old manifests.
    // Some TGA table-format PDFs (e.g. TLIF0009) caused the PDF parser to append all
    // PC body texts to the element name, which then propagated into manifest topic.title.
    // This sanitizer is the display-time safety net that repairs old manifests on the fly.
    function sanitizeTopicTitle(title) {
        if (!title || title.length <= 150) return title;
        // Try to find where the element heading ends using decreasing key lengths from
        // common PC-body language patterns (capitalised sentences after the heading).
        var pcEndMatch = title.match(/^(.{30,120})\s+[A-Z][a-z]{3,}/);
        if (pcEndMatch) {
            var candidate = pcEndMatch[1].replace(/[.,;:]+$/, '').trim();
            // Only trust the truncation if it shaved off meaningful content
            if (candidate.length < title.length - 10) return candidate;
        }
        // Hard fallback: truncate to 120 chars at the nearest word boundary
        var truncated = title.substring(0, 120);
        var lastSpace = truncated.lastIndexOf(' ');
        return (lastSpace > 30 ? truncated.substring(0, lastSpace) : truncated).trim();
    }

    /**
     * Show user-friendly error toast notification (v6.5.80)
     * Uses Moodle's Notification system with fallback to console
     * @param {string} message - User-friendly error message
     * @param {string} context - Optional context for debugging (function name, etc.)
     * @param {Error|string} error - Optional error object for logging
     */
    function showErrorToast(message, context, error) {
        if (Notification && Notification.addNotification) {
            Notification.addNotification({
                message: message || getLabel('somethingWentWrong') || 'Something went wrong. Please try again.',
                type: 'error'
            });
        }
    }
    
    /**
     * Capitalize the first letter of a string
     */
    function capitalizeFirst(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    /**
     * Apply document table formatting fixes after DOM insertion (v6.5.64, v6.6.40)
     * Cleans up table cells and ensures proper formatting
     * v6.6.40: Detects content tables vs checkbox tables and applies appropriate column widths
     */
    function applyDocumentTableFixes($container) {
        if (!$container || !$container.length) return;
        
        // Find all first-column cells and sanitize their content
        $container.find('td:first-child').each(function () {
            var $cell = $(this);
            var text = $cell.text();
            // Remove leading checkbox Unicode characters
            var cleaned = text.replace(/^[\u2610\u2611OKOK\u25a1\u25a0\u25a2\u25a3\u25fb\u25fc\u2b1c\u2b1b\u274f\u2750\u2751\u2752]\s*/, '');
            if (cleaned !== text) {
                // Preserve HTML but clean up the text
                var html = $cell.html();
                html = html.replace(/^[\u2610\u2611OKOK\u25a1\u25a0\u25a2\u25a3\u25fb\u25fc\u2b1c\u2b1b\u274f\u2750\u2751\u2752]\s*/, '');
                $cell.html(html);
            }
        });
        
        // v6.6.40: Detect table type and apply appropriate formatting
        $container.find('table').each(function () {
            var $table = $(this);
            var $headers = $table.find('th');
            var columnCount = $headers.length;
            
            // For 3-column tables, detect if it's a content table or checkbox table
            if (columnCount >= 3) { $table.addClass("cc5-table-3col"); }
            if (columnCount === 3) {
                $table.addClass("cc5-table-3col-only");
                var isCheckboxTable = false;
                var secondColHeader = $headers.eq(1).text().trim().toLowerCase();
                
                // Check if second column header suggests a checkbox column
                var checkboxHeaders = ['check', 'OK', 'tick', 'done', 'complete', 'verified', 'y/n'];
                checkboxHeaders.forEach(function (header) {
                    if (secondColHeader.indexOf(header) !== -1) {
                        isCheckboxTable = true;
                    }
                });
                
                // Also check if all cells in second column are short (< 5 chars = likely checkmarks)
                if (!isCheckboxTable) {
                    var allShort = true;
                    $table.find('tbody tr td:nth-child(2)').each(function () {
                        if ($(this).text().trim().length > 10) {
                            allShort = false;
                        }
                    });
                    isCheckboxTable = allShort && $table.find('tbody tr').length > 0;
                }
                
                if (!isCheckboxTable) {
                    // It's a content table (like SWMS) - apply even column distribution
                    $table.addClass('cc5-content-table');
                    
                    // Check if it looks like an SWMS table (Step/Hazard/Control pattern)
                    var firstHeader = $headers.eq(0).text().trim().toLowerCase();
                    var thirdHeader = $headers.eq(2).text().trim().toLowerCase();
                    if ((firstHeader.indexOf('step') !== -1 || firstHeader.indexOf('task') !== -1) &&
                        (secondColHeader.indexOf('hazard') !== -1 || secondColHeader.indexOf('risk') !== -1) &&
                        (thirdHeader.indexOf('control') !== -1 || thirdHeader.indexOf('measure') !== -1)) {
                        $table.addClass('cc5-swms-table');
                    }
                }
            }
        });
        
        // Ensure check columns are properly centered with tick marks (only for checkbox tables)
        $container.find('table:not(.cc5-content-table) td:nth-child(2)').each(function () {
            var $cell = $(this);
            var text = $cell.text().trim();
            // If it looks like a check mark, style it properly
            if (text === 'OK' || text === 'OK' || text === '\u2611' || text === 'Y' || text === 'Yes') {
                $cell.addClass('cc5-doc-check-cell');
                // Replace with consistent tick mark
                if (text === 'Y' || text === 'Yes' || text === '\u2611') {
                    $cell.html('OK');
                }
            }
        });
    }

    /**
     * Format text - escape HTML and convert markdown emphasis to HTML (v6.5.0)
     * Converts *word* to <strong>word</strong> and **word** to <strong>word</strong>
     */
    function formatText(str) {
        if (!str) return '';
        var cleaned = fixGrammar(str);
        var escaped = escapeHtml(cleaned);
        escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        escaped = escaped.replace(/\*([^*]+)\*/g, '<strong>$1</strong>');
        return escaped;
    }


    /**
     * Format text with document links (v6.5.3)
     * Detects workplace document mentions and wraps them in clickable links
     * v6.6.43: Capitalize first letter of each word in document link text
     * v7.2.50: Only link FIRST occurrence of each document type per slide (deduplication)
     * @param {string} str - Text to format
     * @param {Object} linkedDocs - Tracker object to record which doc types have been linked (optional)
     */
    function formatTextWithDocLinks(str, linkedDocs) {
        // v7.5.3: DISABLED document links - return plain text only
        if (!str) return '';
        var cleaned = fixGrammar(str);
        var escaped = escapeHtml(cleaned);
        escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        escaped = escaped.replace(/\*([^*]+)\*/g, '<strong>$1</strong>');
        return escaped;
    }

    // v9.83 Phase-3: Inject helper closures into cc-activities module so it can
    // call getLabel/escapeHtml/fixGrammar/formatText/capitalizeFirst without
    // coupling to player5.js's scope.
    CcActivities.init({
        getLabel:       getLabel,
        escapeHtml:     escapeHtml,
        fixGrammar:     fixGrammar,
        formatText:     formatText,
        capitalizeFirst: capitalizeFirst
    });

    // v9.83 Phase-4: Inject helpers into card-slot renderer module.
    CcCardSlots.init({
        getLabel:               getLabel,
        escapeHtml:             escapeHtml,
        fixGrammar:             fixGrammar,
        getIcon:                getIcon,
        hasIcon:                hasIcon,
        getContextualSlideIcon: getContextualSlideIcon,
        resolveScenePartIcon:   resolveScenePartIcon,
        formatText:             formatText,
        formatTextWithDocLinks: formatTextWithDocLinks
    });

    // v13.94.6: register cc-state's narration resolver against NARRATION_LABELS, NOT
    // against getLabel.
    //
    // getLabel is the right resolver for the SCREEN - it lets a Moodle site customise
    // wording through the lang file, and it reads UI_LABELS, which translations.js prunes
    // to the page language plus English. Both of those are wrong for narration.
    //
    // The narration text is the input to voiceoverTextHash, and that hash has to match the
    // one the BUILDER computed when it synthesised the audio. The builder resolves against
    // NARRATION_LABELS for the content language. If the player resolved the same keys
    // through getLabel it would get: a site's customised wording (which the builder never
    // saw), or - on an English Moodle serving a Japanese pack - English, because
    // UI_LABELS['ja'] was pruned away at module load. Either way the hash diverges, every
    // section reads as stale, and the whole pack is re-synthesised on first open.
    //
    // Same table, same language, same string, same hash.
    var _narrationLabels = (UI_LABELS && UI_LABELS.NARRATION_LABELS) || {};

    /**
     * Point cc-state's narration at the CONTENT language of what is being played.
     *
     * @param {String} lang Language code, e.g. 'ja-JP'.
     * @return {void}
     */
    function useNarrationLanguage(lang) {
        if (!CcState || typeof CcState.setLabelResolver !== 'function') { return; }
        var code = String(lang || 'en');
        var table = _narrationLabels[code]
            || _narrationLabels[code.split('-')[0]]
            || _narrationLabels.en
            || {};
        CcState.setLabelResolver(function (key) {
            return table[key];
        });
    }

    /**
     * Player class
     */
    var Player = function (config) {
        this.cmid = config.cmid;
        this.manifest = config.manifest;
        this.container = $(config.container);
        this.currentView = 'topics';
        
        // The vendor base URL and the site credentials are deliberately absent: every
        // vendor request now goes through the server-side proxy in ajax.php, which
        // injects the credentials. The browser never sees the site id or the API key.
        this.courseUrl = config.courseUrl || ''; // v11.36: Return to Course navigation
        this.currentTopicId = null;
        this.currentSlideIndex = 0;
        this.currentAudio = null;
        this.slideTimer = null;
        this.slideTimeRemaining = 0;
        this.voiceoverPlayed = false;
        this.tutorialShown = false;
        
        // Progression settings from manifest (course creator configurable)
        this.progressionMode = (config.manifest.settings?.progressionMode) || PROGRESSION_MODES.FREE;
        this.slideDuration = (config.manifest.settings?.slideDuration) || 5; // seconds
        
        // Voice settings from manifest (v6.3.0 - Chirp 3 HD, v6.5.11 - added enabled toggle)
        // v6.5.37: Enhanced debug logging for voiceover initialization
        
        this.voiceoverEnabled = (config.manifest.voiceSettings?.enabled) !== false; // Default true
        this.quizVoiceEnabled = (config.manifest.voiceSettings?.quizEnabled) !== false; // v13.32: Default true (enable quiz feedback narration out of the box)
        this.activitiesEnabled = (config.manifest.activitySettings?.enabled) !== false; // v11.11: Default true
        this.voiceGender = (config.manifest.voiceSettings?.gender) || 'female';
        // v13.1: resolve voice name — prefer explicit voice, fall back to gender-based default
        this.voiceName = config.manifest.voiceSettings?.voice ||
            (this.voiceGender === 'male' ? 'Puck' : 'Aoede');
        this.voiceLanguage = (config.manifest.voiceSettings?.language) || 'en-AU';
        this.activeLang = null;         // v12.55: active student language code (null = primary)
        this._primaryTopics = null;     // v12.55: stash of primary-language topics for swapping
        
        // v7.9.99: Comprehensive voiceover debug logging on init
        var _voTotal = 0, _voWithUrl = 0, _voSentinel = 0;
        if (config.manifest && config.manifest.topics) {
            config.manifest.topics.forEach(function (t) {
                (t.sections || []).forEach(function (s) {
                    if (s.slideType !== 'activity') {
                        _voTotal++;
                        if (s.voiceoverUrl && s.voiceoverUrl !== 'pregenerated') _voWithUrl++;
                        else if (s.voiceoverUrl === 'pregenerated') _voSentinel++;
                    }
                });
            });
        }
        if ((_voTotal - _voWithUrl - _voSentinel) > 0) {
            ccWarn('[VOICEOVER v' + CC_VERSION + '] ' + (_voTotal - _voWithUrl - _voSentinel) + '/' + _voTotal + ' sections MISSING pre-generated voiceover. Students will experience delays.');
        }
        
        // v6.5.24: Set current language for UI label translations
        setCurrentLanguage(this.voiceLanguage);
        // v13.94.6: narration follows the CONTENT language, always.
        useNarrationLanguage(this.voiceLanguage);

        
        // v6.5.11: If voiceover disabled but mode was somehow set to VOICEOVER, override to FREE
        if (!this.voiceoverEnabled && this.progressionMode === PROGRESSION_MODES.VOICEOVER) {
            this.progressionMode = PROGRESSION_MODES.FREE;
        }
        
        // Voiceover pre-generation cache (v6.4.2)
        this.voiceoverCache = {};
        // v13.94.6: parallel map of voiceoverTextHash at the moment each cache entry was
        // written, so playVoiceover can tell a fresh entry from one that predates an edit.
        this.voiceoverCacheHash = {};
        this.voiceoverLoading = {}; // Track in-progress voiceover requests to prevent race conditions
        this.voiceoverPreloadStatus = { total: 0, loaded: 0, loading: false };
        
        // v6.6.62: Activity completion tracking
        // Maps slideId -> boolean (true = completed)
        this.activityCompleted = {};
        // v6.7.38: Minimum word count for micro-reflection reduced to 10 words per prompt
        this.reflectionMinWords = 10;
        
        // Browser focus requirement (v6.4.4)
        this.requireFocus = config.requireFocus || false;
        this.focusModalShown = false;
        
        // v6.7.32: Require full score to progress setting
        this.requireFullScore = config.requireFullScore || false;
        
        // Slide editing capability (v6.5.0)
        this.canEdit = config.canEdit || false;
        // v12.16: Teacher flag  -  capability only, not gated by Moodle edit mode toggle.
        // canEdit requires capability + edit mode ON (controls edit UI).
        // isTeacher requires capability only (controls voiceover playback/generation).
        this.isTeacher = config.isTeacher || false;
        
        this.progress = this.loadProgress();
        this.init();
    };

    Player.prototype = {
        /**
         * Initialize the player
         * v6.5.63: Show preloading screen and wait for all content before showing topics
         * v6.6.88: Skip preloading on page reload if content already cached (edit mode toggle fix)
         */
        init: function () {
            var self = this;
            
            // v7.2.0: ALWAYS log session state check for debugging edit mode toggle issue
            
            // Track preload completion status
            this.preloadStatus = {
                voiceovers: false,
                documents: false
            };
            
            // v7.2.0: CRITICAL FIX - Check if manifest already has content
            // If content exists, NEVER show preload screen - just render directly
            var hasExistingContent = this.manifest && this.manifest.topics && this.manifest.topics.length > 0;
            
            // v6.6.88: Check if we have cached session state (e.g. user toggled edit mode)
            var cachedState = this.loadSessionState();
            
            // v7.2.0: Skip preload if EITHER cached state exists OR content already exists
            if ((cachedState && cachedState.ready) || hasExistingContent) {
                // Restore cached voiceovers and documents if available
                if (cachedState && cachedState.voiceoverCache) {
                    this.voiceoverCache = cachedState.voiceoverCache;
                }
                if (cachedState && cachedState.documentExamples) {
                    this.documentExamples = cachedState.documentExamples;
                }
                // Restore view state if available
                if (cachedState) {
                    this.currentView = cachedState.currentView || 'topics';
                    this.currentTopicId = cachedState.currentTopicId || null;
                    this.currentTopicIndex = cachedState.currentTopicIndex || 0;
                    this.currentSlideIndex = cachedState.currentSlideIndex || 0;
                    // v12.89 FIX-CC-LANG-PERSIST: Restore the previously-selected additional
                    // language silently — swap manifest.topics to the correct language topics
                    // without triggering renderTopicsGrid() or preloadVoiceovers() side effects.
                    // Without this, refreshing the page always reverted to primary (English)
                    // content and voiceovers regardless of the language the user had selected,
                    // because saveSessionState() never persisted activeLang.
                    if (cachedState.activeLang) {
                        var _mlArr = (this.manifest && this.manifest.multiLanguage) || [];
                        for (var _li = 0; _li < _mlArr.length; _li++) {
                            if (_mlArr[_li].code === cachedState.activeLang &&
                                    _mlArr[_li].topics && _mlArr[_li].topics.length) {
                                this._primaryTopics = this.manifest.topics;
                                this.manifest.topics = _mlArr[_li].topics;
                                this.activeLang = cachedState.activeLang;
                                break;
                            }
                        }
                    }
                }
                // v13.36 FIX-CC-BLANK-INIT: For single-topic content with no saved session
                // state, skip the topics grid and navigate directly to slide view so content
                // is visible immediately on page load. Eliminates the blank initial state
                // reported in SCORM contexts where the frame appeared empty until the user
                // clicked a slide title from the left-hand TOC sidebar.
                if (!cachedState) {
                    var _initTopics = this.manifest && this.manifest.topics;
                    if (_initTopics && _initTopics.length === 1 &&
                            _initTopics[0].sections && _initTopics[0].sections.length > 0) {
                        this.currentView = 'slides';
                        this.currentTopicId = _initTopics[0].id;
                        this.currentTopicIndex = 0;
                        this.currentSlideIndex = 0;
                    }
                }
                // Bind events and render directly
                this.bindEvents();
                if (this.requireFocus) {
                    this.setupFocusDetection();
                }
                // v11.90 FIX: ALWAYS run preload  -  removes !cachedState guard that permanently
                // blocked returning students from ever setting voiceoversComplete.
                if (hasExistingContent) {
                    this.preloadVoiceovers(function () {
                        self.saveSessionState();

                        // v11.90 FIX: Re-enable voiceover buttons after preload completes.
                        // render() fires before async preload finishes, so buttons are left
                        // disabled. This callback re-enables them without a full re-render.
                        if (self.manifest.voiceoversComplete === true) {
                            self.container.find('.cc5-voiceover-btn-large[disabled]')
                                .prop('disabled', false)
                                .attr('title', 'Play voiceover');
                        }
                    });

                }
                this.render();
                return;
            }
            
            // Show preloading screen first (only for truly NEW content)
            this.renderPreloadingScreen();
            this.bindEvents();
            
            // Setup browser focus detection (v6.4.4)
            if (this.requireFocus) {
                this.setupFocusDetection();
            }
            
            // Start preloading with callbacks - when both complete, show topics
            this.preloadVoiceovers(function () {
                self.preloadStatus.voiceovers = true;
                self.checkPreloadComplete();
            });
            
            self.preloadStatus.documents = true;
            self.checkPreloadComplete();
        },
        
        /**
         * Render preloading screen while voiceovers and documents are prepared (v6.5.63)
         */
        renderPreloadingScreen: function () {
            var html = '<div class="cc5-player" role="region" aria-label="' + getLabel('contentPlayer') + '">';
            html += '<div class="cc5-preloading-screen">';
            html += '<div class="cc5-preloading-content">';
            html += '<div class="cc5-preloading-icon">' + getIcon('loader') + '</div>';
            html += '<h2 class="cc5-preloading-title">' + getLabel('preparingContent') + '</h2>';
            html += '<p class="cc5-preloading-message">' + getLabel('loadingResources') + '</p>';
            html += '<div class="cc5-preloading-progress" role="status" aria-live="polite" aria-label="' + getLabel('loadingStatus') + '">';
            html += '<div class="cc5-preloading-bar" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100"><div class="cc5-preloading-fill" style="width: 0%"></div></div>';
            html += '<span class="cc5-preloading-percent">0%</span>';
            html += '</div>';
            html += '</div>';
            html += '</div>';
            html += '</div>';
            
            this.container.html(html);
        },
        
        /**
         * Update preloading screen progress (v6.5.63)
         */
        updatePreloadingProgress: function () {
            var voiceStatus = this.voiceoverPreloadStatus || { total: 0, loaded: 0 };
            var docStatus = this.documentPreloadStatus || { total: 0, loaded: 0 };
            
            var totalItems = voiceStatus.total + docStatus.total;
            var loadedItems = voiceStatus.loaded + docStatus.loaded;
            
            // If no items to preload, consider 100%
            var percent = totalItems === 0 ? 100 : Math.round((loadedItems / totalItems) * 100);
            
            var fill = this.container.find('.cc5-preloading-fill');
            var percentText = this.container.find('.cc5-preloading-percent');
            
            if (fill.length) {
                fill.css('width', percent + '%');
                percentText.text(percent + '%');
            }
        },
        
        /**
         * Check if all preloading is complete and show topics (v6.5.63)
         * v6.6.88: Save session state for page reload recovery
         */
        checkPreloadComplete: function () {
            if (this.preloadStatus.voiceovers && this.preloadStatus.documents) {
                // v6.6.88: Save session state so page reload skips preloading
                this.saveSessionState();
                this.render();
            }
        },
        
        /**
         * Load session state from sessionStorage (v6.6.88)
         * Used to skip preloading on page reload (e.g. edit mode toggle)
         * v7.2.0: Use time-based validation (30 min window) instead of strict hash matching
         * to prevent "Preparing Content" screen on edit mode toggle
         */
        loadSessionState: function () {
            try {
                var key = 'cc5_session_' + this.cmid;
                
                var stored = sessionStorage.getItem(key);
                
                if (stored) {
                    var state = JSON.parse(stored);
                    
                    // v7.2.0: Check if state is recent (within 30 minutes)
                    var now = Date.now();
                    var maxAge = 30 * 60 * 1000; // 30 minutes in milliseconds
                    var isRecent = state.timestamp && (now - state.timestamp) < maxAge;
                    
                    
                    if (isRecent && state.ready) {
                        return state;
                    }
                }
            } catch (e) {
                // sessionStorage may be unavailable (private mode / disabled cookies) or hold
                // corrupt JSON. Either way there is simply no restorable session state.
                ccLog('Session state could not be read', e);
            }
            return null;
        },

        /**
         * Save session state to sessionStorage (v6.6.88)
         * Stores current view, slide position, and preloaded content
         */
        saveSessionState: function () {
            try {
                var key = 'cc5_session_' + this.cmid;
                
                // v7.2.35: Limit cache size to prevent quota exceeded errors
                var limitedVoiceoverCache = {};
                var voiceoverKeys = Object.keys(this.voiceoverCache || {});
                var self = this;
                // Keep only last 3 voiceovers to prevent quota issues
                voiceoverKeys.slice(-3).forEach(function (k) {
                    limitedVoiceoverCache[k] = self.voiceoverCache[k];
                });
                
                var state = {
                    ready: true,
                    manifestHash: this.getManifestHash(),
                    currentView: this.currentView,
                    currentTopicId: this.currentTopicId,
                    currentTopicIndex: this.currentTopicIndex,
                    currentSlideIndex: this.currentSlideIndex,
                    activeLang: this.activeLang || null,
                    voiceoverCache: limitedVoiceoverCache,
                    timestamp: Date.now()
                };
                sessionStorage.setItem(key, JSON.stringify(state));
            } catch (e) {
                // v7.2.35: Handle quota exceeded gracefully
                try {
                    for (var i = sessionStorage.length - 1; i >= 0; i--) {
                        var storageKey = sessionStorage.key(i);
                        if (storageKey && storageKey.indexOf('cc5_session_') === 0) {
                            sessionStorage.removeItem(storageKey);
                        }
                    }
                    var minimalState = {
                        ready: true,
                        manifestHash: this.getManifestHash(),
                        currentView: this.currentView,
                        timestamp: Date.now()
                    };
                    sessionStorage.setItem('cc5_session_' + this.cmid, JSON.stringify(minimalState));
                } catch (retryError) {
                    // Even the minimal state does not fit; session restore is skipped this load.
                    ccWarn('Session state could not be saved', retryError);
                }
            }
        },
        /**
         * Get a simple hash of manifest for cache validation (v6.6.88)
         */
        getManifestHash: function () {
            // Simple hash based on manifest structure
            var topics = this.manifest.topics || [];
            var slideCount = topics.reduce(function (sum, t) {
                return sum + (t.sections || []).length;
            }, 0);
            return this.cmid + '_' + topics.length + '_' + slideCount;
        },
        /**
         * v7.7.5: Mark Before You Start checklist as complete
         * Sends completion data to Moodle for activity completion tracking
         */
        markChecklistComplete: function () {
            var self = this;
            
            // Store checklist completion state
            var storageKey = 'cc5_checklist_' + this.cmid + '_' + this.currentTopicId;
            try {
                localStorage.setItem(storageKey, JSON.stringify({
                    complete: true,
                    timestamp: Date.now()
                }));
            } catch (e) {
                // localStorage unavailable (private mode / quota). The server-side
                // save_checklist call below is the authoritative record, so this is safe.
                ccLog('Checklist state could not be cached locally', e);
            }
            
            // v9.78 FIX (A-05): Replace non-existent Moodle external WS
            // 'mod_contentcreator_checklist_complete' with a direct POST to ajax.php.
            // The external WS was never registered in db/services.php so every call
            // returned a 400 "web service not found" error. Now routes to ajax.php
            // action=save_checklist which records the same data server-side.
            try {
                var checklistData = new FormData();
                checklistData.append('sesskey', Config.sesskey);
                checklistData.append('action', 'save_checklist');
                checklistData.append('cmid', self.cmid);
                checklistData.append('topicid', self.currentTopicId || '');
                checklistData.append('complete', '1');
                CcState.fetchWithDeadline(CcState.ajaxUrl(), {
                    method: 'POST',
                    body: checklistData
                }).catch(function (err) {
                    // Non-fatal: the localStorage backup written above still holds the state.
                    ccWarn('save_checklist request failed', err);
                });
            } catch (e) {
                // Non-fatal: the localStorage backup written above still holds the state.
                ccWarn('save_checklist could not be dispatched', e);
            }

        },

        /**
         * v7.7.5: Check if Before You Start checklist was previously completed
         */
        isChecklistComplete: function () {
            var storageKey = 'cc5_checklist_' + this.cmid + '_' + this.currentTopicId;
            try {
                var data = JSON.parse(localStorage.getItem(storageKey) || '{}');
                return data.complete === true;
            } catch (e) {
                return false;
            }
        },

        isQuickCheckComplete: function () {
            var $section = this.container.find('.cc5-quickcheck-checklist');
            if ($section.length === 0) return true;
            var totalItems = $section.find('.cc5-checklist-checkbox').length;
            if (totalItems === 0) return true;
            var checkedItems = $section.find('.cc5-checklist-checkbox:checked').length;
            return checkedItems === totalItems;
        },

        /**
         * Setup browser focus/visibility detection (v6.4.4)
         * Resets slide progress if student navigates away from tab
         */
        setupFocusDetection: function () {
            var self = this;
            
            document.addEventListener('visibilitychange', function () {
                if (document.hidden && self.currentView === 'slides') {
                    // User switched tabs or minimized - reset current slide
                    self.handleFocusLost();
                }
            });
        },

        /**
         * Handle focus lost - show modal and reset slide (v6.4.4)
         */
        handleFocusLost: function () {
            
            // Pause audio but KEEP the reference and position so we can resume exactly where we left off.
            // Do NOT null currentAudio  -  nulling it loses currentTime and causes voiceover to restart.
            if (this.currentAudio) {
                this.pausedAudioTime = this.currentAudio.currentTime;
                this.currentAudio.pause();
            } else {
                this.pausedAudioTime = null;
            }
            
            // Clear any timers (stop ticking while modal is shown)
            if (this.slideTimer) {
                clearInterval(this.slideTimer);
                this.slideTimer = null;
            }
            
            // v11.05 FIX: Clear 15s card-type auto-completion timer on focus loss.
            // Previously this timer was not cancelled when the user switched tabs,
            // allowing card-type slides to be marked complete without actual viewing.
            if (this.slideCompletionTimer) {
                clearTimeout(this.slideCompletionTimer);
                this.slideCompletionTimer = null;
            }
            
            // Do NOT reset voiceoverPlayed or slideTimeRemaining  -  student resumes from where they left off.
            
            // Show focus lost modal
            this.showFocusLostModal();
        },

        /**
         * Show focus lost modal (v6.4.4)
         */
        showFocusLostModal: function () {
            var self = this;
            
            // Remove any existing modal
            $('.cc5-focus-modal-overlay').remove();
            
            var modalHtml = '<div class="cc5-focus-modal-overlay">';
            modalHtml += '<div class="cc5-focus-modal">';
            modalHtml += '<div class="cc5-focus-modal-icon">' + getIcon('alert-triangle') + '</div>';
            modalHtml += '<h3 class="cc5-focus-modal-title">' + getLabel('slidePaused') + '</h3>';
            modalHtml += '<p class="cc5-focus-modal-message">' + getLabel('focusPausedMessage') + '</p>';
            modalHtml += '<button type="button" class="cc5-focus-modal-btn">' + getLabel('ok') + '</button>';
            modalHtml += '</div>';
            modalHtml += '</div>';
            
            $(document.body).append(modalHtml);
            
            // Bind close button  -  resume from where the student left off, do NOT re-render
            $(document.body).find('.cc5-focus-modal-btn').on('click', function () {
                $('.cc5-focus-modal-overlay').fadeOut(300, function () {
                    $(this).remove();
                });
                self.resumeAfterFocusReturn();
            });
            
            // Show with fade
            this.container.find('.cc5-focus-modal-overlay').hide().fadeIn(300);
        },

        /**
         * Resume slide state after student returns from a browser focus loss.
         * Continues voiceover and slide timer from exactly where they were paused.
         * Does NOT call render()  -  the slide DOM is already in place.
         */
        resumeAfterFocusReturn: function () {
            var self = this;

            // Resume voiceover from saved position
            if (this.currentAudio && this.pausedAudioTime !== null && this.pausedAudioTime !== undefined) {
                this.currentAudio.currentTime = this.pausedAudioTime;
                this.pausedAudioTime = null;
                // v13.94.3: was an empty catch, so a failed resume after a slide-timer
                // pause vanished without trace. Still non-fatal, but no longer invisible.
                this.currentAudio.play().catch(function (e) {
                    ccWarn('[CC v' + CC_VERSION + '] timer resume play() rejected: ' + e.name);
                });
            }

            // Resume slide timer from remaining time without resetting slideTimeRemaining
            if (this.slideTimeRemaining > 0 && !this.slideTimer) {
                this.slideTimer = setInterval(function () {
                    self.slideTimeRemaining--;
                    var $timer = self.container.find('#cc5-timer .cc5-timer-value');
                    $timer.text(self.slideTimeRemaining + 's');

                    if (self.slideTimeRemaining <= 0) {
                        clearInterval(self.slideTimer);
                        self.slideTimer = null;
                        self.container.find('.cc5-nav-chevron.cc5-next').removeClass('cc5-disabled').prop('disabled', false);
                        var sections = self.getCurrentSections();
                        if (sections[self.currentSlideIndex]) {
                            var currentSection = sections[self.currentSlideIndex];
                            self.markSectionComplete(currentSection.slideId || currentSection.id);
                        }
                    }
                }, 1000);
            }
        },

        /**
         * Load progress from localStorage (with Moodle DB fallback)
         */
        loadProgress: function () {
            var key = 'cc5_progress_' + this.cmid;
            var localProgress = { sections: {}, lastVisited: null };
            try {
                var stored = localStorage.getItem(key);
                if (stored) {
                    localProgress = JSON.parse(stored);
                }
            } catch (e) {
                // Unreadable or corrupt local progress: fall back to the empty default and
                // let loadMoodleProgress() below repopulate it from the database.
                ccLog('Local progress could not be read', e);
            }
            this.loadMoodleProgress();
            return localProgress;
        },

        /**
         * Load progress from Moodle database
         */

        loadMoodleProgress: function () {
            var self = this;
            var formData = new FormData();
            formData.append('sesskey', Config.sesskey);
            formData.append('action', 'load_completion');
            formData.append('cmid', this.cmid);
            
            var ajaxUrl = CcState.ajaxUrl();
            
            // v7.2.51: Add 60s timeout to prevent infinite spinner on slow connections
            var controller = new AbortController();
            var timeoutId = setTimeout(function () { controller.abort(); }, 60000);
            
            CcState.fetchWithDeadline(ajaxUrl, {
                method: 'POST',
                body: formData,
                signal: controller.signal
            })
            .then(function (response) {
                clearTimeout(timeoutId);
                    if (!response.ok) {
                        throw new Error('Server returned ' + response.status);
                    }
                    return response.json();
                })
                .then(function (data) {
                    // v9.78 FIX (A-06): Apply fetched DB progress to player state.
                    // Previously the response was received and immediately discarded.
                    // Now we deep-merge the DB record (may contain cross-device progress)
                    // into the in-memory progress object, save back to localStorage so
                    // subsequent loads also benefit, then refresh the nav UI.
                    if (!data || !data.success || !data.progress) return;
                    var dbProgress = data.progress;
                    if (!dbProgress || typeof dbProgress !== 'object') return;

                    if (!self.progress) self.progress = { sections: {}, lastVisited: null };
                    if (!self.progress.sections) self.progress.sections = {};

                    // Deep-merge sections: DB wins for any completed section
                    var dbSections = dbProgress.sections || {};
                    Object.keys(dbSections).forEach(function (sectionId) {
                        var dbSec = dbSections[sectionId];
                        if (!self.progress.sections[sectionId]) {
                            self.progress.sections[sectionId] = dbSec;
                        } else {
                            // Keep true values  -  never downgrade a section from complete to incomplete
                            if (dbSec.complete) self.progress.sections[sectionId].complete = true;
                            if (dbSec.contentComplete) self.progress.sections[sectionId].contentComplete = true;
                            if (dbSec.activityComplete) self.progress.sections[sectionId].activityComplete = true;
                        }
                    });

                    // Restore last-visited slide if we don't already have one locally
                    if (!self.progress.lastVisited && dbProgress.lastVisited) {
                        self.progress.lastVisited = dbProgress.lastVisited;
                    }

                    // Persist the merged state to localStorage so future local loads benefit
                    try {
                        localStorage.setItem('cc5_progress_' + self.cmid, JSON.stringify(self.progress));
                    } catch (e) {
                        // Cache-only write. The database already holds this progress.
                        ccLog('Merged progress could not be cached locally', e);
                    }

                    // v11.05 FIX: After merging DB progress, check if overall progress
                    // is now 100% and fire saveMoodleProgress so the Moodle completion
                    // flag is written. This handles the cross-device edge case where
                    // device A had 99% and device B had the remaining 1%  -  without this,
                    // the completed=1 record was never written because neither device
                    // alone reached 100%.
                    if (self.calculateOverallProgress() === 100) {
                        self.saveMoodleProgress();
                    }

                    // Refresh the sidebar/nav to reflect restored completion states
                    if (typeof self.updateNavState === 'function') {
                        self.updateNavState();
                    }
                })
                .catch(function (error) {
                });
        },

        /**
         * Save progress to localStorage
         */
        saveProgressLocal: function () {
            var key = 'cc5_progress_' + this.cmid;
            try {
                localStorage.setItem(key, JSON.stringify(this.progress));
            } catch (e) {
                // Cache-only write; saveMoodleProgress() persists the authoritative copy.
                ccLog('Progress could not be cached locally', e);
            }
        },

        /**
         * Save progress to localStorage and Moodle DB
         */
        saveProgress: function () {
            this.saveProgressLocal();
            this.saveMoodleProgress();
        },

        /**
         * Save progress to Moodle database
         */
        saveMoodleProgress: function () {
            var isComplete = this.calculateOverallProgress() === 100;
            
            var formData = new FormData();
            formData.append('sesskey', Config.sesskey);
            formData.append('action', 'save_completion');
            formData.append('cmid', this.cmid);
            formData.append('progress', JSON.stringify(this.progress));
            formData.append('completed', isComplete ? 1 : 0);
            
            var ajaxUrl = CcState.ajaxUrl();
            CcState.fetchWithDeadline(ajaxUrl, {
                method: 'POST',
                body: formData
            })
            .then(function (response) {
                    if (!response.ok) {
                        throw new Error('Server returned ' + response.status);
                    }
                    return response.json();
                })
                .then(function (data) {
                    // v13.94.3: this used to be an empty handler. A server-side failure
                    // (bad sesskey, capability change, DB error) returns HTTP 200 with
                    // success:false, so the learner's progress was being discarded with
                    // no trace anywhere. Record it, and tell the learner once when the
                    // run that was lost is the one that would have marked them complete.
                    if (data && data.success === false) {
                        this._noteProgressSaveFailure(isComplete, data.error || 'no reason given');
                    } else {
                        this._progressSaveWarned = false;
                    }
                }.bind(this))
                .catch(function (error) {
                    this._noteProgressSaveFailure(isComplete, (error && error.message) ? error.message : String(error));
                }.bind(this));
        },

        /**
         * v13.94.3: single place that records a failed progress save. Warns the learner
         * at most once per session, and only on the save that carried completion  -  a
         * mid-module save that fails is retried by the next one, but a lost completion
         * is not recoverable without the learner knowing to redo it.
         */
        _noteProgressSaveFailure: function (wasCompletion, reason) {
            ccWarn('[CC] save_completion failed (completion=' + wasCompletion + '): ' + reason);
            if (wasCompletion && !this._progressSaveWarned) {
                this._progressSaveWarned = true;
                showErrorToast(
                    getLabel('progressNotSaved')
                        || 'Your progress could not be saved. Please check your connection and revisit the last slide.',
                    'saveMoodleProgress'
                );
            }
        },
        /**
         * Pre-generate all voiceovers in background for instant playback (v6.4.2)
         * v6.5.11: Skip if voiceover is disabled
         * v6.5.63: Accept callback for completion notification
         * v6.6.57: CRITICAL - Only preload LEARNING slides, NOT activity slides
         * v7.1.5: PARALLEL - Load 3 voiceovers at once for faster preloading
         */
        preloadVoiceovers: function (onComplete) {
            // v6.5.11: Skip preloading if voiceover is disabled
            if (!this.voiceoverEnabled) {                if (onComplete) onComplete();
                return;
            }
            
            var self = this;
            // v12.49 BUG-CC-ZOMBIE-CHAIN: Each preloadVoiceovers() invocation gets a unique
            // generation ID captured in the closure. preloadOne() and its retry callbacks check
            // whether the current global generation matches. If the user clicked "Reset & retry
            // audio" (new preloadVoiceovers() called  ->  generation incremented), the old chain's
            // .catch() sees a mismatch, clears voiceoverLoading, and exits WITHOUT scheduling
            // another retry  -  preventing two concurrent TTS fetches that caused CDN HTTP 500.
            self._voiceoverChainGen = (self._voiceoverChainGen || 0) + 1;
            var _myChainGen = self._voiceoverChainGen;
            var topics = this.manifest.topics || [];
            var allSections = [];
            
            // v6.6.57: Collect ONLY learning sections (skip activity slides)
            for (var i = 0; i < topics.length; i++) {
                var sections = topics[i].sections || [];
                for (var j = 0; j < sections.length; j++) {
                    if (sections[j].slideType !== 'activity') {
                        allSections.push(sections[j]);
                    }
                }
            }
            
            
            if (allSections.length === 0) {
                if (onComplete) onComplete();
                return;
            }
            
            this.voiceoverPreloadStatus = {
                total: allSections.length,
                loaded: 0,
                loading: true
            };
            
            this.updatePreloadingProgress();
            
            // v7.1.5: PARALLEL preloading - 3 concurrent requests for faster loading
            var CONCURRENT_PRELOADS = 3;
            var index = 0;
            var activeRequests = 0;
            var completed = false;

            // v11.86 FIX 1+2+4: Single source of truth  -  every learning section must have
            // voiceoverStatus='complete' AND an HTTPS URL before the manifest is saved as ready.
            // Activity slides are exempt (they never have voiceover).
            // v12.63 FIX-CC-MULTILANG-GATE: 'pregenerated' sentinel means audio was already
            // generated by the teacher and persisted to the PHP file store; only the HTTPS URL
            // was stripped for DB-size reasons (stripAudio). Treat it as "complete enough" so
            // that manifest.voiceoversComplete is NOT reset to false when a student switches to
            // an additional language whose sections all carry the sentinel.  Without this,
            // setActiveLang -> preloadVoiceovers -> checkComplete() overrode voiceoversComplete
            // to false  -  tripping the line 12908 global gate and silently blocking every Play
            // click for the additional language for the entire session.
            // v12.79 CC-VOICEOVER-MODULE: Delegate to cc-voiceover.js (single source of truth).
            var allVoiceoversComplete = CcVoiceover.allVoiceoversComplete;

            function checkComplete() {
                if (completed) return;
                if (index >= allSections.length && activeRequests === 0) {
                    completed = true;
                    self.voiceoverPreloadStatus.loading = false;
                    var _failList = allSections.filter(function (s) { return !CcVoiceover.isSectionVoiceoverComplete(s); });
                    if (_failList.length) {
                        _failList.forEach(function (s) {
                        });
                    }
                    // v11.89 FIX: Calculate completion for ALL users (students + teachers),
                    // but only SAVE to DB for teachers. This unblocks the line 12022 global
                    // gate for students whose content has valid HTTPS URLs (old content pre-v11.86
                    // has valid URLs but voiceoversComplete was never set). Students get an
                    // in-memory true for the session; teachers persist it so students see it
                    // correctly after a page reload.
                    var _isComplete = allVoiceoversComplete(allSections);
                    self.manifest.voiceoversComplete = _isComplete;
                    // v11.84: Post-preload sweep  -  for teachers, find any sections that
                    // exhausted all retries and still have no HTTPS URL. Schedule one
                    // final pass 10s later when the server may have recovered.
                    if (self.editMode || self.canEdit || self.isTeacher) {
                        var _missingSections = allSections.filter(function (s) {
                            return !(typeof s.voiceoverUrl === 'string' && s.voiceoverUrl.startsWith('http')) &&
                                   !self.voiceoverCache[s.id];
                        });
                        if (_missingSections.length > 0) {
                            ccWarn('[CC v' + CC_VERSION + '] POST-PRELOAD SWEEP: ' + _missingSections.length + ' section(s) still missing audio  -  retrying in 10s');
                            // UX-CC-SWEEP-FEEDBACK (v12.44): immediately update the wait screen
                            // in-place so the user sees activity instead of a frozen progress bar.
                            var _n = _missingSections.length;
                            var _plural = _n === 1 ? '' : 's';
                            self.container.find('.cc5-vo-wait-title').text(getLabel('voWaitAlmost'));
                            self.container.find('.cc5-vo-wait-sub').text(_n + ' section' + _plural + ' still generating \u2014 please keep this page open. Audio can take 1\u20133 minutes.');
                            setTimeout(function () {
                                // v12.49 BUG-CC-ZOMBIE-CHAIN: If a new chain has started
                                // (user clicked Retry again), don't fire  -  the new chain owns it.
                                if (self._voiceoverChainGen !== _myChainGen) return;
                                // Update message when the retry actually fires (10 s later)
                                self.container.find('.cc5-vo-wait-title').text(getLabel('voWaitGenerating'));
                                self.container.find('.cc5-vo-wait-sub').text('Regenerating ' + _n + ' section' + _plural + '\u2026 This may take 1\u20133 minutes.');
                                var _stillBlocked = [];
                                _missingSections.forEach(function (s) {
                                    delete s._preloadRetryCount;
                                    if (!self.voiceoverCache[s.id] && !self.voiceoverLoading[s.id]) {
                                        preloadOne(s);
                                    } else if (self.voiceoverLoading[s.id]) {
                                        // v12.49: Section still locked by an in-flight old chain fetch.
                                        // Queue it for a follow-up sweep when the old chain exits.
                                        _stillBlocked.push(s);
                                    }
                                });
                                // v12.49: Follow-up sweep 30s later for sections that were still
                                // in-flight at primary sweep time (long-running PHP curl from a
                                // stale chain). By then the stale chain's .catch() will have fired,
                                // cleared voiceoverLoading, and the section is available again.
                                if (_stillBlocked.length > 0) {
                                    setTimeout(function () {
                                        if (self._voiceoverChainGen !== _myChainGen) return;
                                        _stillBlocked.forEach(function (s) {
                                            delete s._preloadRetryCount;
                                            if (!self.voiceoverCache[s.id] && !self.voiceoverLoading[s.id]) {
                                                preloadOne(s);
                                            }
                                        });
                                    }, 30000);
                                }
                            }, 10000);
                        }

                        var _failCount = allSections.filter(function (s) {
                            return s.slideType !== 'activity' && s.voiceoverStatus !== 'complete';
                        }).length;

                        if (_isComplete) {
                            // All uploads confirmed — save immediately.
                            self.saveManifestSilent();
                        } else {
                            // FIX-CC-PRELOAD-EARLY-SAVE (v13.54): DO NOT save here when incomplete.
                            // persistVoiceoverToFileStore POSTs are still in-flight at this point —
                            // section.voiceoverUrl is NULL in memory because the async callbacks
                            // haven't returned yet. Saving now writes url=NULL to the DB. Then the
                            // persist callbacks fire, set the real HTTPS URLs in memory, and schedule
                            // a 3s debounced saveManifestSilent — but the teacher sees "reload will
                            // retry" below and reloads, cancelling the debounce timer. The DB retains
                            // url=NULL forever and the loop repeats on every page load.
                            // Fix: let persistVoiceoverToFileStore's success callbacks handle saving
                            // via their own 3s debounce (line ~7120). By then all URLs are in memory.
                            ccWarn('[CC v' + CC_VERSION + '] INCOMPLETE VOICEOVERS  -  ' + _failCount + ' section(s) not complete. Uploads still in-flight — save deferred to persistVoiceoverToFileStore callbacks.');
                        }
                    }

                    if (onComplete) onComplete();
                }
            }
            
            function preloadOne(section) {
                activeRequests++;

                // v12.49 BUG-CC-ZOMBIE-CHAIN: If a newer preloadVoiceovers() call has started
                // (e.g. user clicked "Reset & retry audio"), exit immediately without making
                // any TTS request. Clean up any lingering state so the new chain can own this
                // section.
                if (self._voiceoverChainGen !== _myChainGen) {
                    delete section._preloadScheduledRetry;
                    delete section._preloadRetryCount;
                    delete self.voiceoverLoading[section.id];
                    activeRequests--;
                    startNext();
                    return;
                }

                // v12.48 FIX-CC-RETRY-DELAY-LOCK: _preloadScheduledRetry flag lets a
                // scheduled retry bypass the voiceoverLoading guard (which stays true
                // during the delay to block any concurrent callers from firing a second
                // PHP curl for the same section while the delay window is open).
                var _isScheduledRetry = !!section._preloadScheduledRetry;
                if (_isScheduledRetry) {
                    delete section._preloadScheduledRetry;
                }

                if (self.voiceoverCache[section.id] || (self.voiceoverLoading[section.id] && !_isScheduledRetry)) {
                    self.voiceoverPreloadStatus.loaded++;
                    self.updatePreloadingProgress();
                    activeRequests--;
                    startNext();
                    return;
                }

                // v11.51 FIX: 'pregenerated' sentinel means audio WAS generated but stripped
                // from the manifest for DB size (v11.49). Treat it like missing:
                // - Teachers: clear sentinel so the preload generates fresh audio.
                // - Students: skip preload (API not available); student guard handles play click.
                // v11.73 FIX: guard typeof before .startsWith()  -  voiceoverUrl may be undefined
                // when section has never had audio generated (normal first-load state).
                // v11.86 FIX 3: Also force-regen for teachers when voiceoverStatus !== 'complete'
                // even if a URL exists  -  ensures stale/partial state from a prior interrupted
                // preload is never left in the manifest as if it were ready.
                // v12.89 FIX-CC-START-LEARNING: _teacherNeedsRegen neutralised. The check fired
                // for ANY teacher whenever a section had an HTTPS URL but voiceoverStatus !==
                // 'complete' — including brand-new content where the builder saved valid HTTPS
                // voiceover URLs but never wrote voiceoverStatus='complete' on the sections.
                // Result: the player deleted the URL and started async TTS regen on every first
                // load, rendering the "Preparing audio…" waiting screen instead of the topics
                // grid. The teacher had to dismiss the waiting screen before reaching "Start
                // Learning", and students whose sections lacked URLs hit the same gate.
                // After a page reload the regenerated audio was saved (voiceoverStatus='complete'),
                // so the waiting screen no longer appeared — hence "works after refresh".
                // Root cause: the staleness check at lines below ALREADY handles every case
                // _teacherNeedsRegen intended to address: sections with no fingerprint
                // (preNoFingerprint=true) trigger regen for teachers via preCanRegen; sections
                // with a matching fingerprint are correctly marked complete in the else branch.
                // _teacherNeedsRegen was fully redundant and actively harmful — it deleted valid
                // URLs before the staleness check could evaluate them.
                // Fix: set to false unconditionally; staleness check is sole authority.
                var _hasHttpsUrl = typeof section.voiceoverUrl === 'string' && section.voiceoverUrl.startsWith('http');
                var _teacherNeedsRegen = false;
                if (!_hasHttpsUrl || _teacherNeedsRegen) {
                    if (!self.editMode && !self.canEdit && !self.isTeacher) {                        self.voiceoverPreloadStatus.loaded++;
                        self.updatePreloadingProgress();
                        activeRequests--;
                        startNext();
                        return;
                    }
                    // Teacher: clear URL + status and fall through to regenerate.
                    // v12.19 FIX: When regen fires on a section that already HAS a valid HTTPS URL
                    // (_teacherNeedsRegen path), save the existing URL as _preloadFallbackUrl BEFORE
                    // deleting it. The WAITING loop in playVoiceover checks this fallback so the
                    // teacher gets instant playback of the old audio while the new TTS generates in
                    // the background  -  eliminating the 30s/90s wait on first click.
                    if (_teacherNeedsRegen) {
                        ccWarn('[VOICEOVER v' + CC_VERSION + '] PRELOAD FORCE REGEN section ' + section.id + '  -  has URL but voiceoverStatus=' + section.voiceoverStatus + ' (not complete). Saving fallback URL for instant play.');
                        section._preloadFallbackUrl = section.voiceoverUrl; // v12.19: save before delete
                    }
                    delete section.voiceoverUrl;
                    section.voiceoverStatus = 'pending';
                }

                if (section.voiceoverUrl) {
                    var preCurrentText = self.buildFullVoiceoverText(section);
                    var preCurrentWords = preCurrentText.split(/\s+/).length;
                    var preStoredWords = section.voiceoverWordCount || 0;
                    // v9.73: Schema version check  -  catches pre-v9.66/v9.69 audio with wrong content
                    var preStoredSchema = section.voiceoverSchemaVersion || '';
                    var preIsSchemaStale = preStoredSchema !== VOICEOVER_SCHEMA_VERSION;
                    var preIsWordStale = preStoredWords > 0 && Math.abs(preCurrentWords - preStoredWords) > 3;
                    // v9.98: Hash check  -  catches content changes regardless of word count.
                    // The old +/-3-word check missed regenerated topics with similar word counts,
                    // causing stale audio to play over entirely new slide content.
                    var preCurrentHash = voiceoverTextHash(preCurrentText);
                    var preStoredHash = section.voiceoverTextHash || '';
                    var preIsHashStale = !!preStoredHash && preStoredHash !== preCurrentHash;
                    var preNoHash = !preStoredHash;
                    // FIX-CC-ML-PRELOAD-PREFIX (v13.8): Mirror the isLangPrefixMissing check from
                    // playVoiceover into preloadVoiceovers. Previously, the preload stale check had
                    // no prefix check — a German section with URL voiceover_2.1.mp3 (missing the
                    // 'de-DE_' prefix) was marked 'complete' and voiceoversComplete=true was set.
                    // Students then attempted to play and heard the wrong-language audio. Teachers
                    // saw the file as fresh and didn't get the on-demand regen. The fix: detect the
                    // missing prefix here so preload deletes the URL and regenerates proactively,
                    // exactly like playVoiceover already does when the teacher clicks Play.
                    var preIsLangPrefixMissing = false;
                    if (self.activeLang && typeof section.voiceoverUrl === 'string' && section.voiceoverUrl.startsWith('http')) {
                        var _preUrlFn = section.voiceoverUrl.split('/').pop().split('?')[0];
                        preIsLangPrefixMissing = !_preUrlFn.includes('voiceover_' + self.activeLang + '_');
                    }
                    var preIsStale = preIsSchemaStale || preIsWordStale || preIsHashStale || preIsLangPrefixMissing;
                    var preNoFingerprint = !preStoredWords || preNoHash;
                    // v9.75: Extend stale regeneration to canEdit teachers in view mode.
                    // editMode covers the builder; canEdit covers instructors in Select/Preview.
                    // Regenerating during preload means the correct audio is ready before they
                    // click Play  -  no extra wait at the button.
                    // FIX-CC-ML-STUDENT-LANG-REGEN (v13.18): isLangPrefixMissing previously
                    // only triggered regen for teachers/edit mode. Regular students fell into
                    // the else-branch and had voiceoverStatus='complete' set on the wrong-
                    // language URL — they then heard English audio for Korean/Bulgarian/etc.
                    // sections that were built before the v13.5 section-ID collision fix.
                    // A language mismatch is always wrong; unlike schema/word-count drift
                    // (which is "close enough"), a Korean student hearing English is a hard
                    // failure. Fix: pull isLangPrefixMissing out of the teacher-only gate so
                    // ALL users (including students) delete the URL and trigger fresh TTS.
                    var preCanRegen = preIsLangPrefixMissing || self.editMode || ((self.canEdit || self.isTeacher) && (preIsSchemaStale || preNoFingerprint || preIsWordStale || preIsHashStale));
                    if ((preIsStale || preNoFingerprint) && preCanRegen) {
                        ccWarn('[VOICEOVER v' + CC_VERSION + '] PRELOAD STALE section ' + section.id + ' | schema: ' + preStoredSchema + '/' + VOICEOVER_SCHEMA_VERSION + ' | stored: ' + preStoredWords + ' | current: ' + preCurrentWords + ' | hashStale: ' + preIsHashStale + ' | noHash: ' + preNoHash + ' | regenerating (editMode=' + self.editMode + ' canEdit=' + self.canEdit + ')');
                        // v12.92 FIX-CC-STALE-WAIT-SCREEN: Save the existing HTTPS URL as
                        // _preloadFallbackUrl BEFORE deleting it. isVoiceoverGenerationPending()
                        // and getVoiceoverProgress() both treat sections with a fallback URL as
                        // "has audio", so the topics grid (and "Start Learning" button) show
                        // immediately while new TTS generates in the background.
                        // This fixes Bug 1 (initial load wait screen) AND Bug 2 (language-switch
                        // wait screen) — both stem from the same stale-detection URL deletion.
                        // Mirrors the _preloadFallbackUrl pattern from the _teacherNeedsRegen
                        // block above (line 1893), which was the intended fix but was dead code
                        // because _teacherNeedsRegen was neutralised by FIX-CC-START-LEARNING.
                        if (typeof section.voiceoverUrl === 'string' && section.voiceoverUrl.startsWith('http')) {
                            section._preloadFallbackUrl = section.voiceoverUrl;
                        }
                        delete section.voiceoverUrl;
                        delete section.voiceoverSchemaVersion;
                        delete section.voiceoverTextHash;
                        delete self.voiceoverCache[section.id];
                        // v13.94.6: drop the fingerprint with the entry it belongs to.
                        if (self.voiceoverCacheHash) { delete self.voiceoverCacheHash[section.id]; }
                        // v12.92: Also reset voiceoverStatus to 'pending'. The stale deletion
                        // leaves voiceoverStatus='complete' (unchanged from before), which makes
                        // _failCount=0 even though the URL is gone — allVoiceoversComplete()
                        // then returns false while _failCount shows 0 (confusing inconsistency).
                        // persistVoiceoverToFileStore sets it back to 'complete' once the HTTPS
                        // URL is confirmed stored, so this is safe and correct.
                        section.voiceoverStatus = 'pending';
                    } else {
                        // v11.89 FIX: A section with a valid, non-stale HTTPS URL IS ready.
                        // Mark voiceoverStatus='complete' so allVoiceoversComplete() counts it.
                        // Old content (pre-v11.86) has HTTPS URLs but no status stamp  -  without
                        // this, allVoiceoversComplete() returns false and students are blocked
                        // even though the audio plays perfectly fine.
                        section.voiceoverStatus = 'complete';                        self.voiceoverPreloadStatus.loaded++;
                        self.updatePreloadingProgress();
                        activeRequests--;
                        startNext();
                        return;
                    }
                }
                
                // v7.5.7 + v8.1.6: Students CANNOT trigger voiceover API calls (costs credits)
                // Voiceovers must be pre-generated by teacher during content creation or edit.
                // v9.92: canEdit teachers in view/preview mode ARE allowed  -  they pay for credits
                // and their regenerated audio gets saved back so students benefit too.
                // v12.16: isTeacher allows teachers with edit mode OFF to generate voiceovers.
                if (!self.editMode && !self.canEdit && !self.isTeacher) {
                    // CC-ML-DEBUG: student hit the no-regen gate — this section has no URL
                    self.voiceoverPreloadStatus.loaded++;
                    self.updatePreloadingProgress();
                    activeRequests--;
                    startNext();
                    return;
                }

                
                self.voiceoverLoading[section.id] = true;
                // v11.85: Mark as in-flight so page-reload can detect incomplete sections.
                if (!section.voiceoverStatus || section.voiceoverStatus === 'failed') {
                    section.voiceoverStatus = 'pending';
                }
                var text = self.buildFullVoiceoverText(section);
                var formData = new FormData();
                formData.append('sesskey', Config.sesskey);
                formData.append('action', 'generate_voice');
                formData.append('cmid', self.cmid);
                formData.append('text', text);
                formData.append('sectionid', section.id);
                formData.append('subtopickey', section.billingKey || '');
                // v12.63 FIX-CC-MULTILANG-LANG: Use activeLang when set (teacher/student switched
                // to an additional language).  Previously self.voiceLanguage (always the primary
                // language, e.g. 'en-AU') was sent for ALL sections regardless of which language
                // tab was active, causing Vietnamese/French/etc. additional-language voiceovers
                // to be synthesised in the primary language voice.
                formData.append('language', (self.activeLang || self.voiceLanguage));
                formData.append('voice', self.voiceName);
                // CC-ML-DEBUG
                
                var ajaxUrl = CcState.ajaxUrl();
                // v11.83: AbortController  -  prevents a hung fetch from locking
                // voiceoverLoading[id] past the 30s wait-loop. v11.92: raised from
                // 60s to 120s  -  Google Chirp 3 HD on a 7-card voiceover (multiple
                // 4800-byte chunks + WAV concat + OGG encode) can legitimately take
                // 60-90s. v12.43: raised from 120s to 200s  -  server logs confirm
                // 4-chunk en-AU-Chirp3-HD-Aoede voiceovers consistently take 143-153s
                // (POST /api/moodle/content-creator/tts 200 in 150429ms). The 120s
                // client abort was firing before the server responded, causing every
                // retry to appear as a timeout even though the server succeeded.
                // PHP CURLOPT_TIMEOUT (180s) and set_time_limit(0) remain unchanged.
                // Retry up to 3 times.
                var _preRetry = section._preloadRetryCount || 0;
                var _preAbortCtrl = new AbortController();
                // v12.42: Store AbortController on section so the retry button can cancel
                // any in-flight fetch immediately instead of waiting for it to time out.
                section._preloadAbortCtrl = _preAbortCtrl;
                // FIX-CC-TTS-CLIENT-DEADLINE (v13.95.1): the browser deadline must sit ABOVE the
                // server's curl ceiling, now 280s (ajax.php generate_voice). At 200s the browser
                // gave up while the vendor was still synthesising, the cache was never written,
                // and the retry below paid for the same audio again.
                var _preTimeoutId = setTimeout(function () { _preAbortCtrl.abort(); }, 300000);
                CcState.fetchWithDeadline(ajaxUrl, {
                    method: 'POST',
                    body: formData,
                    signal: _preAbortCtrl.signal
                })
                .then(function (response) {
                    clearTimeout(_preTimeoutId);
                    if (!response.ok) throw new Error('Server returned ' + response.status);
                    return response.json();
                })
                .then(function (data) {
                    delete section._preloadAbortCtrl;
                    // v12.48 FIX-CC-TTS-MUTEX: PHP returns {pending:true} when its file lock
                    // cannot be acquired (another PHP process is already generating this section).
                    // Treat as a temporary hold  -  don't count against retry budget, wait 10s.
                    if (data.pending) {
                        var _pendingCount = (section._preloadPendingCount || 0) + 1;
                        section._preloadPendingCount = _pendingCount;
                        ccWarn('[CC v' + CC_VERSION + '] TTS PENDING section ' + section.id + '  -  server busy, waiting 10s (pending attempt ' + _pendingCount + ')');
                        // v12.50 BUG-CC-PENDING-LIMIT-LOW: Old limit was 6 (60s total wait).
                        // TTS can legitimately take 143-153s (4-chunk Chirp 3 HD voiceover).
                        // A PHP process holding the file lock for >60s caused preload to abandon
                        // the section while the PHP curl was still running, then on-demand also
                        // failed because the lock was still held (see BUG-CC-ONDEMAND-PENDING).
                        // Fix: raise limit to 25 (250s), ensuring the pending wait outlasts the
                        // 200s PHP abort timeout by 50s. Once the PHP process finishes (whether
                        // by completing or being aborted), its lock releases and the next retry
                        // gets through to start a fresh TTS request.
                        if (_pendingCount < 25) {
                            // voiceoverLoading stays true  -  schedule retry without decrementing retries
                            section._preloadScheduledRetry = true;
                            activeRequests--;
                            startNext();
                            setTimeout(function () {
                                // v12.49 BUG-CC-ZOMBIE-CHAIN: Check generation before firing pending retry.
                                if (self._voiceoverChainGen !== _myChainGen) {
                                    delete section._preloadScheduledRetry;
                                    delete self.voiceoverLoading[section.id];
                                    return;
                                }
                                // v12.51 BUG-CC-PENDING-DUPE-TTS: If attempt 1 completed and cached
                                // the audio while we were in the pending wait loop, do NOT fire another
                                // TTS request. The audio is already ready  -  the user can Play now.
                                // Without this guard, every pending retry that fires AFTER attempt 1
                                // succeeds would start a fresh PHP TTS call (wasteful, costs credits).
                                if (self.voiceoverCache[section.id] ||
                                    (typeof section.voiceoverUrl === 'string' && section.voiceoverUrl.startsWith('http'))) {
                                    delete section._preloadScheduledRetry;
                                    delete section._preloadPendingCount;
                                    delete self.voiceoverLoading[section.id];                                    self.refreshTopicCardVoiceoverState(section.id);
                                    return;
                                }
                                preloadOne(section);
                            }, 10000);
                        } else {
                            // Too many pending waits  -  give up
                            delete section._preloadPendingCount;
                            delete self.voiceoverLoading[section.id];
                            section.voiceoverStatus = 'failed';
                            ccError('[CC v' + CC_VERSION + '] TTS PENDING exhausted for section ' + section.id + '  -  too many concurrent waits');
                            self.voiceoverPreloadStatus.loaded++;
                            self.updatePreloadingProgress();
                            activeRequests--;
                            startNext();
                            self.refreshTopicCardVoiceoverState(section.id);
                        }
                        return;
                    }
                    // FIX-CC-LANG-PRELOAD-RACE (v12.84): Guard stale-chain cache writes.
                    // If the user switched languages while this fetch was in-flight,
                    // _voiceoverChainGen was incremented by the new preloadVoiceovers() call
                    // and voiceoverCache/voiceoverLoading were both flushed to fresh objects.
                    // Without this guard, the old fetch's .then() would write old-language
                    // audio into the new language's empty cache under the same section.id —
                    // the new preload then finds the key "cached" and skips generation, so
                    // the student hears the wrong language. The v12.83 flush is necessary but
                    // not sufficient: it only blocks new sections from starting, not in-flight
                    // fetches that already passed preloadOne()'s entry guard.
                    // Exit cleanly here; the .catch() stale-chain path (line ~2117) handles
                    // voiceoverLoading cleanup via its own chain-gen guard when applicable.
                    if (self._voiceoverChainGen !== _myChainGen) {
                        activeRequests--;
                        startNext();
                        return;
                    }
                    delete self.voiceoverLoading[section.id];
                    delete section._preloadRetryCount;
                    delete section._preloadPendingCount;
                    delete section._supersededRetryCount; // v12.54: reset orphan-rescue counter on success
                    if (data.success && data.audioContent) {
                        // CC-ML-DEBUG
                        var audioUrl = 'data:' + data.audioType + ';base64,' + data.audioContent;
                        self.voiceoverCache[section.id] = audioUrl;
                    // v13.94.6: stamp the entry so it can be validated on replay.
                    self.voiceoverCacheHash = self.voiceoverCacheHash || {};
                    self.voiceoverCacheHash[section.id] = section.voiceoverTextHash
                        || voiceoverTextHash(self.buildFullVoiceoverText(section));
                        // v13.94.6: stamp the entry so it can be validated on replay.
                        self.voiceoverCacheHash = self.voiceoverCacheHash || {};
                        self.voiceoverCacheHash[section.id] = section.voiceoverTextHash
                            || voiceoverTextHash(self.buildFullVoiceoverText(section));
                        // v12.21: Progressively unlock topic cards as each section's audio completes.
                        self.refreshTopicCardVoiceoverState(section.id);
                        // v11.86 MICRO FIX (ChatGPT idempotency fix): voiceoverStatus is now set
                        // ONLY after persistVoiceoverToFileStore confirms the HTTPS URL is stored.
                        // Previously status was set here (before persist), meaning a failed persist
                        // left status='complete' with no URL in the DB  -  teacher reload would not
                        // regen it (FIX 3 only regens when URL exists but status!='complete') and
                        // the system would pay TTS again on next preload. Now: status stays 'pending'
                        // until persist succeeds. If persist fails, FIX 3 forces regen on next load.

                        // v11.70: Persist audio to Moodle file store  ->  HTTPS URL in manifest.
                        // The HTTPS URL from the file store passes through stripAudio() untouched
                        //  ->  DB stores the real URL  ->  students play instantly from pluginfile.php.
                        if (self.editMode || self.canEdit || self.isTeacher) {
                            var _preVoText = self.buildFullVoiceoverText(section);
                            section.voiceoverWordCount = _preVoText.split(/\s+/).length;
                            section.voiceoverSchemaVersion = VOICEOVER_SCHEMA_VERSION; // v9.73
                            section.voiceoverTextHash = voiceoverTextHash(_preVoText); // v9.98
                            // v11.71: Dedup guard  -  skip upload if HTTPS URL already stored.
                            // Prevents duplicate file-store writes when preload + priority both fire.
                            if (!section.voiceoverUrl || !section.voiceoverUrl.startsWith('http')) {
                                // v11.86: voiceoverStatus = 'complete' set INSIDE persistVoiceoverToFileStore
                                // success callback  -  only marked complete when URL is safely stored in DB.
                                // v13.6: Prefix section.id with activeLang for additional-language sections.
                                self.persistVoiceoverToFileStore(data.audioContent, data.audioType, (self.activeLang ? self.activeLang + '_' + section.id : section.id), section);
                            } else {
                                // URL already persisted  -  safe to mark complete immediately (no new write needed)
                                section.voiceoverStatus = 'complete';
                            }
                        }
                    } else {
                        // BUG-CC-SOFT-FAIL (v12.41): API responded but returned
                        // success=false or no audioContent. Previously this fell through
                        // to voiceoverPreloadStatus.loaded++ with NO cache set and NO status
                        // update  -  section stayed 'pending', refreshTopicCardVoiceoverState
                        // was never called, and the waiting screen was stuck at N-1/N forever.
                        // Even clicking "Reset & retry audio" re-triggered the same soft failure
                        //  ->  same stuck screen  ->  appeared to do nothing.
                        // Fix: throw so .catch handles it via the standard 3-retry mechanism.
                        // After retries are exhausted, voiceoverStatus='failed' is set and
                        // refreshTopicCardVoiceoverState transitions the screen correctly.
                        var _softErr = 'generate_voice soft-failure: success=' + data.success +
                            ' hasAudio=' + (!!data.audioContent) +
                            (data.error ? ' serverError=' + data.error : '');
                        ccError('[CC v' + CC_VERSION + '] ' + _softErr + '  -  routing to retry mechanism');
                        throw new Error(_softErr);
                    }
                    self.voiceoverPreloadStatus.loaded++;
                    self.updatePreloadingProgress();
                    activeRequests--;
                    startNext();
                })
                .catch(function (error) {
                    clearTimeout(_preTimeoutId);
                    var errorMsg = error.message || String(error);
                    var isAborted = error.name === 'AbortError';
                    // v12.42: If abort was triggered by the user clicking "Reset & retry audio"
                    // (section._preloadAbortedByUser flag set), silently exit this old chain  - 
                    // a fresh preloadVoiceovers() is already running from the retry handler.
                    // Without this, the old chain schedules its own competing retry chain,
                    // and both run concurrently causing rate-limit cascades.
                    // v12.43 RACE-FIX: Do NOT delete voiceoverLoading[section.id] here.
                    // The retry handler called preloadVoiceovers() synchronously BEFORE this
                    // microtask fires, so the new chain has already set voiceoverLoading=true
                    // for this section. Deleting it here would orphan the new chain's lock  - 
                    // the POST-PRELOAD SWEEP would then see loading=false and launch a duplicate
                    // concurrent fetch, causing 429 rate-limit failures that make retry appear broken.
                    if (isAborted && section._preloadAbortedByUser) {
                        delete section._preloadAbortedByUser;
                        delete section._preloadAbortCtrl;
                        ccWarn('[CC v' + CC_VERSION + '] Preload for section ' + section.id + ' cancelled by user retry  -  old chain exiting cleanly');
                        activeRequests--;
                        startNext();
                        return;
                    }
                    delete section._preloadAbortCtrl;
                    ccError('[CC v' + CC_VERSION + '] Preload voiceover failed section ' + section.id + ' - ' + (isAborted ? 'TIMEOUT 200s' : errorMsg) + ' (attempt ' + (_preRetry + 1) + ')');
                    if (/429|quota|rate.limit|resource.exhausted/i.test(errorMsg)) {
                        ccError('[CC v' + CC_VERSION + '] QUOTA/RATE LIMIT hit during preload - Google Chirp 3 HD');
                    }
                    // v12.49 BUG-CC-ZOMBIE-CHAIN: If the user clicked "Reset & retry audio"
                    // while this fetch was in-flight or in a retry delay, a new preloadVoiceovers()
                    // call incremented _voiceoverChainGen. This chain is now stale  -  exit without
                    // scheduling another retry so the new chain can own this section cleanly.
                    // Clear voiceoverLoading so the new chain's POST-PRELOAD SWEEP can pick it up.
                    if (self._voiceoverChainGen !== _myChainGen) {
                        delete section._preloadScheduledRetry;
                        delete section._preloadRetryCount;
                        delete self.voiceoverLoading[section.id];
                        // v12.54 FIX-CC-ORPHANED-SECTION: The new chain's POST-PRELOAD SWEEPs
                        // (t+10s and t+40s) may have already run while this section's lock was
                        // held by the old 200s AbortController. Now the lock is free but no code
                        // is watching  -  this section is permanently orphaned for the session.
                        // Fix: trigger a fresh preloadVoiceovers() so the active chain picks it
                        // up. Guard: limit to 3 rescues to prevent infinite loops when TTS keeps
                        // failing for a permanently-broken section (e.g. malformed content).
                        var _supRetries = (section._supersededRetryCount || 0);
                        if (_supRetries < 3 &&
                                !self.voiceoverCache[section.id] &&
                                !(typeof section.voiceoverUrl === 'string' && section.voiceoverUrl.startsWith('http'))) {
                            section._supersededRetryCount = _supRetries + 1;
                            ccWarn('[CC v' + CC_VERSION + '] FIX-CC-ORPHANED-SECTION: section ' + section.id + ' freed after chain supersede  -  scheduling fresh preload in 2s (rescue ' + (_supRetries + 1) + '/3)');
                            setTimeout(function () { self.preloadVoiceovers(); }, 2000);
                        }
                        ccWarn('[CC v' + CC_VERSION + '] Preload chain for section ' + section.id + ' superseded (gen ' + _myChainGen + '  ->  ' + self._voiceoverChainGen + ')  -  exiting cleanly, new chain owns it');
                        activeRequests--;
                        startNext();
                        return;
                    }
                    // v11.83: Retry up to 3 times  -  release slot, let other sections proceed,
                    // then re-queue this one after a backoff delay.
                    // v12.48 FIX-CC-RETRY-DELAY-LOCK: Do NOT delete voiceoverLoading when
                    // scheduling a retry. Keep it true during the delay so that generateSlideVoiceoverBulk
                    // (and any other caller) sees loading=true and skips this section  -  preventing
                    // a second concurrent PHP curl which causes CDN to return 500 on both requests.
                    // The _preloadScheduledRetry flag tells preloadOne to bypass the loading guard
                    // when the delayed retry fires.
                    var MAX_PRELOAD_RETRIES = 3;
                    if (_preRetry < MAX_PRELOAD_RETRIES) {
                        section._preloadRetryCount = _preRetry + 1;
                        var _retryDelay = (_preRetry + 1) * 2000;
                        ccWarn('[CC v' + CC_VERSION + '] PRELOAD RETRY ' + (_preRetry + 1) + '/' + MAX_PRELOAD_RETRIES + ' section ' + section.id + ' in ' + (_retryDelay / 1000) + 's (voiceoverLoading kept true during delay)');
                        // voiceoverLoading stays true  -  no delete here
                        section._preloadScheduledRetry = true;
                        activeRequests--;
                        startNext();
                        setTimeout(function () {
                            // v12.49 BUG-CC-ZOMBIE-CHAIN: Check generation before firing.
                            // If user clicked Retry between now and then, new chain owns it.
                            if (self._voiceoverChainGen !== _myChainGen) {
                                delete section._preloadScheduledRetry;
                                delete self.voiceoverLoading[section.id];
                                ccWarn('[CC v' + CC_VERSION + '] Retry timeout for section ' + section.id + ' cancelled  -  chain superseded (gen ' + _myChainGen + '  ->  ' + self._voiceoverChainGen + ')');
                                return;
                            }
                            preloadOne(section);
                        }, _retryDelay);
                    } else {
                        delete section._preloadRetryCount;
                        delete section._preloadPendingCount;
                        delete section._supersededRetryCount; // v12.54: reset orphan-rescue counter on final failure
                        // v12.48: voiceoverLoading was kept true during retry delays (not deleted
                        // at the top of .catch any more). Delete it now that all retries are done.
                        delete self.voiceoverLoading[section.id];
                        // v11.85: Mark as failed so gate/UI work correctly this session.
                        // v12.45: stripAudio() now omits 'failed' from the DB save  -  on reload
                        // the section looks fresh, the wait screen shows, and regen is visible.
                        section.voiceoverStatus = 'failed';
                        ccError('[CC v' + CC_VERSION + '] PRELOAD EXHAUSTED section ' + section.id + ' after ' + MAX_PRELOAD_RETRIES + ' retries  -  voiceoverStatus=failed (session only; stripped from DB save by stripAudio so next reload retries visibly)');
                        self.voiceoverPreloadStatus.loaded++;
                        self.updatePreloadingProgress();
                        activeRequests--;
                        startNext();
                        // v12.36 BUG-CC-WAIT-STUCK-NO-REFRESH: After exhausting retries the
                        // waiting screen was never told to re-evaluate  -  it stayed at N-1/N
                        // slides forever. Now immediately check if all remaining sections are
                        // done (or also failed) and transition to the topics page if so.
                        self.refreshTopicCardVoiceoverState(section.id);
                    }
                });
            }
            
            function startNext() {
                while (activeRequests < CONCURRENT_PRELOADS && index < allSections.length) {
                    var section = allSections[index];
                    index++;
                    preloadOne(section);
                }
                checkComplete();
            }
            
            startNext();
        },
        /**
         * Priority preload for current slide - ensures instant playback (v7.1.5)
         */
        priorityPreloadCurrentSlide: function () {
            if (!this.voiceoverEnabled) return;
            // v11.51 FIX BUG-VO-RACE: Students cannot generate voiceover (credits).
            // v11.49 stripAudio() sets voiceoverUrl='' (falsy), causing this function
            // to call the TTS API for every student page load  -  burning credits AND
            // setting voiceoverLoading[id]=true. When the student then clicks Play,
            // playVoiceover() sees loading=true and enters the 30 s wait; the slow
            // TTS call causes the 30 s timeout and "Voiceover timed out" notification.
            // Teachers (editMode or canEdit or isTeacher) still get priority pre-generation.
            if (!this.editMode && !this.canEdit && !this.isTeacher) return;
            
            var self = this;
            var sections = this.getCurrentSections();
            var currentSection = sections[this.currentSlideIndex];
            
            if (!currentSection) return;
            if (currentSection.slideType === 'activity') return;
            // v9.66b: Strip _learning/_activity suffix so the cache check matches what
            // preloadVoiceovers() stores (preloadVoiceovers uses the manifest base ID).
            var _ppBaseId = (currentSection.id || '').replace(/_learning$|_activity$/, '');
            if (this.voiceoverCache[currentSection.id] || this.voiceoverCache[_ppBaseId]) return;
            if (this.voiceoverLoading[currentSection.id] || this.voiceoverLoading[_ppBaseId]) return;
            if (currentSection.voiceoverUrl && currentSection.voiceoverUrl !== 'pregenerated') return;
            
            this.voiceoverLoading[currentSection.id] = true;
            var text = this.buildFullVoiceoverText(currentSection);
            
            var formData = new FormData();
            formData.append('sesskey', Config.sesskey);
            formData.append('action', 'generate_voice');
            formData.append('cmid', this.cmid);
            formData.append('text', text);
            formData.append('sectionid', currentSection.id);
            formData.append('subtopickey', currentSection.billingKey || '');
            // v12.79 FIX-CC-PRIORITY-LANG: Use activeLang when the teacher/student is viewing
            // an additional language — was always sending the primary voiceLanguage.
            formData.append('language', (this.activeLang || this.voiceLanguage));
            formData.append('voice', this.voiceName);
            
            var ajaxUrl = CcState.ajaxUrl();
            CcState.fetchWithDeadline(ajaxUrl, {
                method: 'POST',
                body: formData
            })
            .then(function (response) {
                if (!response.ok) throw new Error('Server returned ' + response.status);
                return response.json();
            })
            .then(function (data) {
                delete self.voiceoverLoading[currentSection.id];
                if (data.success && data.audioContent) {
                    var audioUrl = 'data:' + (data.audioType || 'audio/ogg') + ';base64,' + data.audioContent;
                    self.voiceoverCache[currentSection.id] = audioUrl;                    if (self.editMode || self.canEdit || self.isTeacher) {
                        // v9.66 FIX: currentSection is an expanded (shallow-copy) object from
                        // getCurrentSections(). Writing voiceoverUrl to it does NOT update the
                        // manifest, so saveManifestSilent() would persist nothing.  Find the
                        // real manifest section and update it so the URL is actually saved.
                        //
                        // v9.66b: Also strip _learning/_activity suffixes  -  getCurrentSections()
                        // appends these suffixes to expanded slide IDs, but manifest sections
                        // always carry the base ID, so a suffix-aware comparison is required.
                        //
                        // v9.92: Extended to canEdit so instructors in view/preview mode also
                        // persist priority-generated audio for students.
                        //
                        // v11.70: Use persistVoiceoverToFileStore instead of setting data: URL
                        // directly. The file store returns an HTTPS URL that survives stripAudio()
                        // and is stored in DB  -  students play instantly with zero TTS wait.
                        var _csId = currentSection.id || '';
                        var _baseId = _csId.replace(/_learning$|_activity$/, '');
                        var savedToManifest = false;
                        var mTopics = self.manifest.topics || [];
                        for (var mti = 0; mti < mTopics.length && !savedToManifest; mti++) {
                            var mSects = mTopics[mti].sections || [];
                            for (var msi = 0; msi < mSects.length && !savedToManifest; msi++) {
                                var _mId = mSects[msi].id || '';
                                if (_mId === _csId || _mId === _baseId) {
                                    var _priVoText = self.buildFullVoiceoverText(mSects[msi]);
                                    mSects[msi].voiceoverWordCount = _priVoText.split(/\s+/).length;
                                    mSects[msi].voiceoverSchemaVersion = VOICEOVER_SCHEMA_VERSION; // v9.73
                                    mSects[msi].voiceoverTextHash = voiceoverTextHash(_priVoText); // v9.98
                                    // v11.71: Dedup guard  -  only upload if no HTTPS URL already in manifest.
                                    if (!mSects[msi].voiceoverUrl || !mSects[msi].voiceoverUrl.startsWith('http')) {
                                        // persistVoiceoverToFileStore sets mSects[msi].voiceoverUrl = httpsUrl
                                        // and schedules saveManifestSilent (debounced 3 s).
                                        // v13.6: Prefix with activeLang for additional-language sections.
                                        var _prStorageId = self.activeLang ? self.activeLang + '_' + (_baseId || _csId) : (_baseId || _csId);
                                        self.persistVoiceoverToFileStore(data.audioContent, data.audioType, _prStorageId, mSects[msi]);
                                    }
                                    savedToManifest = true;
                                }
                            }
                        }
                    }
                } else {
                    ccWarn('[VOICEOVER v' + CC_VERSION + '] PRIORITY PRELOAD FAILED section ' + currentSection.id + ' | ' + (data.error || 'no audio'));
                }
            })
            .catch(function (error) {
                delete self.voiceoverLoading[currentSection.id];
                ccError('[VOICEOVER v' + CC_VERSION + '] PRIORITY PRELOAD ERROR section ' + currentSection.id + ' | ' + error.message);
            });
        },
        /**
         * Update voiceover preload UI indicator
         */
        updateVoiceoverPreloadUI: function () {
            var status = this.voiceoverPreloadStatus;
            var indicator = this.container.find('.cc5-voiceover-preload-indicator');
            
            if (status.loading && status.loaded < status.total) {
                if (indicator.length === 0) {
                    var html = '<div class="cc5-voiceover-preload-indicator">';
                    html += '<span class="cc5-preload-icon">' + getIcon('loader') + '</span>';
                    html += '<span class="cc5-preload-text">' + getLabel('preparingAudio') + '</span>';
                    html += '</div>';
                    this.container.find('.cc5-header').append(html);
                    var pct = Math.round((status.loaded / status.total) * 100);
                    indicator.find('.cc5-preload-text').text('Audio ready: ' + pct + '%');
                }
                indicator.fadeOut(300, function () { $(this).remove(); });
            }
        },

        /**
         * Build full voiceover text including all content (v6.5.7)
         * Includes: title, description, requirements, contrast pairs, scenario, mistakes, takeaway
         * Now uses dynamic contrast pair labels instead of hardcoded "Remember to" / "Things to avoid"
         */
        // v11.02: Delegates to CcState.buildVoiceoverText  -  the single canonical
        // implementation shared by both player5.js and builder.js. This ensures
        // builder pre-generated voiceovers produce byte-identical text  ->  no staleness.
        buildFullVoiceoverText: function (section) {
            return CcState.buildVoiceoverText(section, this.manifest);
        },
        getSmartIconForText: function (text) {
            if (!text) return 'check-circle';
            
            var lowerText = text.toLowerCase();
            
            // Icon mapping based on keywords
            var iconMap = [
                // Inspection/Verification
                { keywords: ['inspect', 'check', 'verify', 'examine', 'look', 'visual'], icon: 'eye' },
                { keywords: ['search', 'find', 'locate', 'identify'], icon: 'search' },
                
                // Safety/Protection
                { keywords: ['safety', 'protect', 'secure', 'guard', 'hazard', 'risk', 'ppe'], icon: 'shield-check' },
                { keywords: ['warning', 'danger', 'caution', 'alert'], icon: 'alert-triangle' },
                
                // Equipment/Tools
                { keywords: ['equipment', 'tool', 'gear', 'machine', 'device'], icon: 'wrench' },
                { keywords: ['ladder', 'scaffold', 'platform', 'height'], icon: 'layers' },
                { keywords: ['harness', 'anchor', 'lanyard', 'rope', 'fall'], icon: 'anchor' },
                
                // Documentation
                { keywords: ['document', 'form', 'paperwork', 'record', 'log', 'report'], icon: 'clipboard-list' },
                { keywords: ['swms', 'jsa', 'permit', 'licence', 'certificate'], icon: 'file-check' },
                { keywords: ['sign', 'label', 'tag'], icon: 'tag' },
                
                // Communication
                { keywords: ['communicate', 'report', 'notify', 'inform', 'tell', 'ask'], icon: 'message-circle' },
                { keywords: ['supervisor', 'manager', 'boss', 'lead'], icon: 'user-check' },
                { keywords: ['team', 'worker', 'colleague', 'staff'], icon: 'users' },
                
                // Process/Procedure
                { keywords: ['procedure', 'process', 'step', 'method', 'follow'], icon: 'list-checks' },
                { keywords: ['plan', 'prepare', 'organise', 'arrange'], icon: 'clipboard-check' },
                { keywords: ['train', 'learn', 'competent', 'qualified'], icon: 'graduation-cap' },
                
                // Environment/Conditions
                { keywords: ['weather', 'wind', 'rain', 'temperature'], icon: 'cloud' },
                { keywords: ['ground', 'surface', 'area', 'site', 'location'], icon: 'map-pin' },
                
                // Time/Frequency
                { keywords: ['before', 'prior', 'first'], icon: 'clock' },
                { keywords: ['daily', 'regular', 'routine', 'always'], icon: 'repeat' },
                
                // Measurement
                { keywords: ['measure', 'distance', 'weight', 'load', 'capacity', 'rating'], icon: 'ruler' },
                
                // Action verbs
                { keywords: ['ensure', 'confirm', 'make sure'], icon: 'check-circle' },
                { keywords: ['stop', 'halt', 'cease', 'never'], icon: 'x-circle' }
            ];
            
            // Find matching icon
            for (var i = 0; i < iconMap.length; i++) {
                var mapping = iconMap[i];
                for (var j = 0; j < mapping.keywords.length; j++) {
                    if (lowerText.indexOf(mapping.keywords[j]) !== -1) {
                        return mapping.icon;
                    }
                }
            }
            
            // Default fallback
            return 'check-circle';
        },
        
        /**
         * Extract first verb as heading from requirement text (v6.6.104)
         * Simple approach: first word becomes the heading, full sentence shown below
         * Examples: "Inspect your harness..."  ->  heading "Inspect", desc is full sentence
         */
        extractRequirementTitle: function (text) {
            if (!text) return '';
            
            // Clean the text
            var cleanText = text.trim();
            
            // v7.2.9: Skip common prefixes like "Per Section X.X:" before extracting verb
            // Patterns to skip: "Per Section 1.3:", "Section 1.3:", "Step 1:", etc.
            cleanText = cleanText.replace(/^(Per\s+)?(Section\s+[0-9.]+\s*:|Step\s+[0-9]+\s*:)\s*/i, "");
            
            // v6.6.104: Extract FIRST WORD (verb) as heading
            // This creates clean, scannable headings like "Inspect", "Verify", "Check"
            var words = cleanText.split(/\s+/);
            var firstWord = words[0] || '';
            
            // Capitalize first letter, remove any trailing punctuation
            var verb = firstWord.replace(/[.,;:!?]+$/, '');
            verb = verb.charAt(0).toUpperCase() + verb.slice(1).toLowerCase();
            
            return verb;
        },
        
        /**
         * Get full requirement text for display below heading (v6.6.104)
         * Returns the complete sentence - no truncation
         */
        getFullRequirementText: function (text) {
            if (!text) return '';
            return text.trim();
        },
        

        showCompletionCelebration: function () {
            var root = document.getElementById('contentcreator-app');
            if (!root) {
                return;
            }
            var canvas = document.createElement('canvas');
            canvas.className = 'cc5-confetti-canvas';
            var rect = root.getBoundingClientRect();
            canvas.width = Math.max(1, Math.floor(rect.width));
            canvas.height = Math.max(1, Math.floor(rect.height));
            canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999';
            root.appendChild(canvas);
            
            var ctx = canvas.getContext('2d');
            var particles = [];
            var colors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
            
            for (var i = 0; i < 100; i++) {
                particles.push({
                    x: Math.random() * canvas.width,
                    y: -20 - Math.random() * 100,
                    vx: (Math.random() - 0.5) * 4,
                    vy: Math.random() * 3 + 2,
                    color: colors[Math.floor(Math.random() * colors.length)],
                    size: Math.random() * 8 + 4,
                    rotation: Math.random() * 360,
                    rotationSpeed: (Math.random() - 0.5) * 10
                });
            }
            
            var frameCount = 0;
            var maxFrames = 180;
            
            function animate() {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                
                particles.forEach(function (p) {
                    ctx.save();
                    ctx.translate(p.x, p.y);
                    ctx.rotate(p.rotation * Math.PI / 180);
                    ctx.fillStyle = p.color;
                    ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size);
                    ctx.restore();
                    
                    p.x += p.vx;
                    p.y += p.vy;
                    p.vy += 0.1;
                    p.rotation += p.rotationSpeed;
                });
                
                frameCount++;
                if (frameCount < maxFrames) {
                    requestAnimationFrame(animate);
                    return;
                }
                if (canvas.parentNode) {
                    canvas.parentNode.removeChild(canvas);
                }
            }
            
            animate();
            
            Notification.addNotification({
                message: getLabel('allSectionsComplete'),
                type: 'success'
            });
        },

        /**
         * Main render function
         */
        render: function () {
            // v13.92: render() replaces .cc5-player wholesale, so a live Topics-and-Text
            // narration sync is left driving detached nodes - the visible cards stop
            // revealing and the activity block never opens. navigateToSlide() tore it
            // down, but ~24 other call sites reach render() directly (the activity
            // "Retry" button and the image apply/remove handlers among them). Tearing it
            // down here covers all of them; setupVoiceoverSync() re-arms on the next play.
            //
            // v13.94.6: tearing down the sync was only half of it. The AUDIO went on
            // playing against a DOM that had been replaced wholesale - so "Retry
            // activities" mid-narration left a voice describing card 3 while the reveal
            // sat frozen on card 1, and saving a slide edit narrated the old text over the
            // new. Stop the element too.
            this.teardownVoiceoverSync();
            if (this.currentAudio) {
                try { this.currentAudio.pause(); } catch (e) { /* already detached */ }
                this.currentAudio = null;
                this.currentAudioSectionId = null;
            }
            if (this._quizFbAudio) {
                try { this._quizFbAudio.pause(); } catch (e) { /* already detached */ }
                this._quizFbAudio = null;
            }
            if (this.currentView === 'topics') {
                // v12.21: Block the topic page until ALL voiceovers are ready.
                // If audio is still being generated, show a waiting screen instead.
                if (this.isVoiceoverGenerationPending()) {
                    this.renderVoiceoverWaiting();
                } else {
                    this.renderTopicsGrid();
                }
            } else if (this.currentView === 'slides') {
                this.renderSlideView();
            }
        },
        /**
         * v12.21: Returns true if voiceovers are enabled and any learning section
         * across all topics is missing audio (no HTTPS URL and not in memory cache).
         * Used to gate the topic page  -  students wait until all audio is ready.
         */
        isVoiceoverGenerationPending: function () {
            if (!this.voiceoverEnabled) return false;
            // v12.36 BUG-CC-WAIT-STUCK-FAILED-GATE: user clicked "Continue" bypass button.
            if (this.voiceoverWaitBypassed) return false;
            // v12.93 FIX-CC-TEACHER-WAIT: Teachers and editors must never be blocked by the
            // voiceover wait screen. They are the ones who generate audio — showing the wait
            // screen on their first visit (when sections have no URL yet) made "Start Learning"
            // appear to do nothing. Students still wait until all audio is ready.
            if (this.editMode || this.canEdit || this.isTeacher) return false;
            var topics = (this.manifest && this.manifest.topics) || [];
            var self = this;
            for (var i = 0; i < topics.length; i++) {
                var sections = topics[i].sections || [];
                for (var j = 0; j < sections.length; j++) {
                    var s = sections[j];
                    if (s.slideType === 'activity') continue;
                    // v12.36 BUG-CC-WAIT-STUCK-FAILED-GATE: permanently-failed sections will
                    // never produce audio  -  do NOT let them block the gate indefinitely.
                    if (s.voiceoverStatus === 'failed') continue;
                    var hasUrl = typeof s.voiceoverUrl === 'string' && s.voiceoverUrl.startsWith('http');
                    var hasCached = !!self.voiceoverCache[s.id];
                    // v12.62 FIX-CC-MULTILANG-WAIT-STUCK: 'pregenerated' sentinel means audio
                    // already exists in the PHP file store (builder pre-generated it and PHP
                    // cached it).  For students, preloadVoiceovers() intentionally skips these
                    // sections (on-demand fetch on Play click), so voiceoverCache is never
                    // populated for additional-language sections.  Without this guard, switching
                    // to a non-primary language (e.g. Spanish) and then navigating back from
                    // a slide causes render() -> isVoiceoverGenerationPending() to return true
                    // (no http URL, no cache) and show "Preparing audio..." permanently.
                    // Fix: treat sentinel as "audio available" -- the gate must not block on
                    // content that is already generated and will be fetched on-demand.
                    var hasPregenerated = s.voiceoverUrl === 'pregenerated';
                    // v12.92 FIX-CC-STALE-WAIT-SCREEN: A section currently being stale-regenerated
                    // has its voiceoverUrl deleted but retains old (valid) audio in _preloadFallbackUrl.
                    // Treat this as "has audio" so the gate does not show the wait screen while new
                    // TTS is generating in the background — the old audio plays via the fallback URL.
                    var hasFallback = typeof s._preloadFallbackUrl === 'string' && s._preloadFallbackUrl.startsWith('http');
                    if (!hasUrl && !hasCached && !hasPregenerated && !hasFallback) return true;
                }
            }
            return false;
        },

        /**
         * v12.21: Returns { ready, total } counts of learning sections with audio
         * across all topics. Used to display progress on the waiting screen.
         * v12.36: Failed sections are counted as ready (they won't generate audio;
         * exclude them from the "still waiting" tally so the bar reaches 100%).
         */
        getVoiceoverProgress: function () {
            var topics = (this.manifest && this.manifest.topics) || [];
            var self = this;
            var total = 0;
            var ready = 0;
            topics.forEach(function (topic) {
                (topic.sections || []).forEach(function (s) {
                    if (s.slideType === 'activity') return;
                    total++;
                    var hasUrl = typeof s.voiceoverUrl === 'string' && s.voiceoverUrl.startsWith('http');
                    var hasCached = !!self.voiceoverCache[s.id];
                    // v12.36: count failed sections as ready  -  they won't generate audio
                    var hasFailed = s.voiceoverStatus === 'failed';
                    // v12.67 FIX-CC-MULTILANG-PROGRESS: count 'pregenerated' sentinel as ready.
                    // isVoiceoverGenerationPending() already treats the sentinel as "audio available"
                    // (v12.62 fix).  Without this mirror fix, getVoiceoverProgress() reported
                    // 0/N ready for additional-language sections, so any edge-case rendering of
                    // renderVoiceoverWaiting() would show "0 / N slides" and appear permanently stuck.
                    var hasPregenerated = s.voiceoverUrl === 'pregenerated';
                    // v12.92 FIX-CC-STALE-WAIT-SCREEN: count _preloadFallbackUrl as ready so the
                    // progress bar shows correct counts when stale sections are being regenerated.
                    var hasFallback = typeof s._preloadFallbackUrl === 'string' && s._preloadFallbackUrl.startsWith('http');
                    if (hasUrl || hasCached || hasFailed || hasPregenerated || hasFallback) ready++;
                });
            });
            return { ready: ready, total: total };
        },

        /**
         * v12.21: Full-page waiting screen shown instead of the topic grid when
         * voiceover audio is still being generated. Auto-transitions to the real
         * topic page once all sections have audio.
         * v12.36 UX-CC-WAIT-BYPASS-BUTTON: Added "Continue without audio" button
         * (always visible) so users can bypass a stuck waiting screen, and a
         * "Retry failed audio" button (teachers/canEdit only) to re-queue failed
         * sections without a full page reload.
         */
        renderVoiceoverWaiting: function () {
            var self = this;
            var prog = this.getVoiceoverProgress();
            var pct = prog.total > 0 ? Math.round((prog.ready / prog.total) * 100) : 0;
            // v12.41: Show "Retrying..." state when teacher clicked Reset & retry audio,
            // so the UI confirms the click was registered before the background request completes.
            var _retrying = !!this._voiceoverRetryPending;
            var html = '<div class="cc5-player cc5-vo-wait-screen">';
            html += '<div class="cc5-vo-wait-inner">';
            html += '<div class="cc5-vo-wait-spinner"></div>';
            html += '<h2 class="cc5-vo-wait-title">' + (_retrying ? getLabel('voWaitRetrying') : getLabel('voWaitPreparing')) + '</h2>';
            html += '<p class="cc5-vo-wait-sub">' + (_retrying ? getLabel('voWaitRegenSub') : getLabel('voWaitFirstTimeSub')) + '</p>';
            html += '<div class="cc5-vo-wait-bar-wrap">';
            html += '<div class="cc5-vo-wait-bar"><div class="cc5-vo-wait-fill" style="width:' + pct + '%"></div></div>';
            html += '<span class="cc5-vo-wait-count">' + prog.ready + ' / ' + prog.total + ' slides</span>';
            html += '</div>';
            // v12.36: Bypass buttons  -  always render so a stuck screen has an escape hatch.
            html += '<div class="cc5-vo-wait-actions">';
            html += '<button type="button" class="cc5-vo-wait-continue-btn">' + getLabel('continueWithoutAudio') + '</button>';
            if (this.canEdit || this.isTeacher || this.editMode) {
                html += '<button type="button" class="cc5-vo-wait-retry-btn">' + getLabel('resetRetryAudio') + '</button>';
            }
            html += '</div>';
            html += '</div>';
            html += '</div>';
            this.container.html(html);

            // v12.36: Bind bypass button events immediately after rendering.
            this.container.find('.cc5-vo-wait-continue-btn').off('click').on('click', function () {                self.voiceoverWaitBypassed = true;
                self.renderTopicsGrid();
            });
            this.container.find('.cc5-vo-wait-retry-btn').off('click').on('click', function () {
                // v12.42: 3-second debounce instead of "blocked forever until retry completes".
                // The old _voiceoverRetryPending guard prevented a second click from working at all
                // if the first retry's 120s fetch was still in-flight  -  the user saw "nothing happens"
                // for up to 8 minutes (4 retries  x  120s each). Now clicks are allowed again after 3s.
                var _now = Date.now();
                if (self._lastRetryClickTime && (_now - self._lastRetryClickTime) < 3000) return;
                self._lastRetryClickTime = _now;
                ccWarn('[CC v' + CC_VERSION + '] RETRY BUTTON CLICKED  -  aborting any in-flight fetches and re-queuing all incomplete sections');
                // BUG-CC-RETRY-NARROW (v12.38): Previously only cleared sections with voiceoverStatus='failed'.
                // Sections still mid-retry (attempt 1 or 2 of 3) never reach 'failed' status  - 
                // their voiceoverStatus is undefined and _preloadRetryCount is set. The old handler
                // matched nothing, preloadVoiceovers() then skipped them because voiceoverLoading
                // was still true from the in-flight 120s timeout. Nothing actually regenerated.
                // Fix: clear ALL sections that lack complete audio  -  failed, mid-retry, or stuck.
                // v12.42: Also abort any in-flight AbortController so the old 120s fetch is
                // cancelled immediately, preventing up to 4 x 120s = 8 minutes of competing chains.
                var topics = (self.manifest && self.manifest.topics) || [];
                topics.forEach(function (topic) {
                    (topic.sections || []).forEach(function (s) {
                        if (s.slideType === 'activity') return;
                        var hasCompleteAudio = s.voiceoverStatus === 'complete' &&
                            typeof s.voiceoverUrl === 'string' && s.voiceoverUrl.startsWith('http');
                        var hasCached = !!self.voiceoverCache[s.id];
                        if (!hasCompleteAudio && !hasCached) {
                            if (s._preloadAbortCtrl) {
                                // v12.47 BUG-CC-RETRY-CONCURRENT: Do NOT abort in-flight fetches.
                                // Aborting the browser fetch does NOT stop the PHP-FPM process  - 
                                // PHP blocks on curl_exec until CURLOPT_TIMEOUT (180s). When the
                                // retry handler aborts and immediately calls preloadVoiceovers(),
                                // a NEW PHP process makes a concurrent TTS curl to our backend
                                // while the old PHP curl is still open. The deployment CDN rejects
                                // this second concurrent long-running request with HTTP 500, so
                                // all retries fail instantly with "API error: 500" even though
                                // the backend itself returns 200.
                                // Fix: let the old PHP curl complete naturally. Only reset the
                                // retry budget so the old chain gets fresh 3-retry allowance if
                                // it eventually fails. preloadVoiceovers() below SKIPS this
                                // section because voiceoverLoading[s.id] is still set, so no
                                // concurrent fetch is started.
                                delete s._preloadRetryCount; // fresh 3-retry budget for old chain
                                // Do NOT abort, do NOT delete voiceoverLoading
                            } else {
                                // Section is not in-flight  -  safe to reset state and restart.
                                delete s.voiceoverStatus;
                                delete s.voiceoverUrl;
                                delete s._preloadRetryCount;
                                delete s._supersededRetryCount; // v12.54: fresh orphan-rescue budget on explicit retry
                                delete self.voiceoverLoading[s.id];
                            }
                        }
                    });
                });
                self.voiceoverWaitBypassed = false;
                self._voiceoverRetryPending = true;  // v12.41: flag triggers "Retrying..." UI
                self.preloadVoiceovers();
                self.render();
            });
        },

        /**
         * v12.21: Called after each section's voiceover is cached in memory.
         * Updates the waiting screen progress bar if visible, or does nothing
         * (the waiting screen was already dismissed by a re-render on completion).
         * When the last section finishes, calls render() to transition to topic page.
         */
        refreshTopicCardVoiceoverState: function (sectionId) {
            // Only relevant when on the topics view
            if (this.currentView !== 'topics') return;

            if (!this.isVoiceoverGenerationPending()) {
                // All audio ready (or all failed)  -  transition to real topic page.
                // v12.41: Clear retry flag so next visit shows "Preparing..." again.
                this._voiceoverRetryPending = false;                this.render();
                return;
            }

            // Still pending  -  update the progress bar in the waiting screen (if shown)
            var prog = this.getVoiceoverProgress();
            var pct = prog.total > 0 ? Math.round((prog.ready / prog.total) * 100) : 0;
            this.container.find('.cc5-vo-wait-fill').css('width', pct + '%');
            this.container.find('.cc5-vo-wait-count').text(prog.ready + ' / ' + prog.total + ' slides');
        },

        /**
         * Render the topics grid view
         */
        setActiveLang: function (code) {
            // v12.55: Swap manifest.topics to the chosen student language and re-render.
            // The primary topics are stashed in _primaryTopics on first switch so they
            // can be restored cleanly when the student switches back.

            // FIX-CC-LANG-AUDIO-CACHE (v12.83): voiceoverCache is keyed by section.id.
            // Primary and additional-language topic sets share the same section IDs —
            // images are mirrored from primary into additional-language sections (see
            // FIX-CC-MULTILANG-IMAGE below), so IDs are deliberately identical.
            // When the student is on the primary (English) language, preloadVoiceovers()
            // populates voiceoverCache[section.id] with English audio. On switching to
            // an additional language (e.g. Vietnamese), preloadVoiceovers() checks
            // voiceoverCache[section.id], finds the stale English entry, and skips the
            // section as "already cached". playVoiceover() then serves the English audio
            // instead of generating Vietnamese TTS — the student always hears English.
            //
            // Fix: whenever the active language changes, flush voiceoverCache and
            // voiceoverLoading entirely. Section IDs are shared between language sets so
            // the cache cannot be selectively evicted by ID — a full flush is both
            // correct and safe. The cost is one fresh preload round-trip per language
            // switch, which is acceptable and required for correctness.
            var _prevLang = this.activeLang;
            if (code !== _prevLang) {
                this.voiceoverCache   = {};
                this.voiceoverLoading = {};
            }

            // NOTE (v12.84): This is a reference assignment, not a deep copy — intentional
            // for O(1) swap performance. Both _primaryTopics and manifest.topics point to
            // the same array while the primary language is active. When activeLang is set,
            // manifest.topics is reassigned to mlEntry.topics; _primaryTopics continues to
            // hold the original primary array. buildSaveManifest() always serialises with
            // _primaryTopics as the topics key so saves never corrupt the primary content.
            if (!this._primaryTopics) {
                this._primaryTopics = this.manifest.topics;
            }
            if (!code) {
                // Restore primary language
                this.manifest.topics = this._primaryTopics;
                this.activeLang = null;
                // v13.94.6: back to the primary language - move the label language with it.
                setCurrentLanguage(this.voiceLanguage);
                useNarrationLanguage(this.voiceLanguage);
            } else {
                var mlEntry = null;
                var mlArr = this.manifest.multiLanguage || [];
                for (var _i = 0; _i < mlArr.length; _i++) {
                    if (mlArr[_i].code === code) { mlEntry = mlArr[_i]; break; }
                }
                if (!mlEntry) {
                    ccWarn('setLanguage: no multiLanguage entry for code', code);
                } else if (!mlEntry.topics || !mlEntry.topics.length) {
                    ccWarn('setLanguage: multiLanguage entry has no topics', code);
                }
                if (mlEntry && mlEntry.topics && mlEntry.topics.length) {
                    // FIX-CC-MULTILANG-IMAGE: Mirror image data from primary topics into the
                    // additional-language topics before rendering. Images are language-agnostic
                    // (visual content) and are only stored on primary sections — additional-language
                    // topics are generated with imageSettings.enabled=false, so every section.image
                    // is undefined. Without this copy, section.image is undefined in additional-
                    // language mode: hasImage=false, the slide image container renders empty, and
                    // the "Add Image" button appears even for slides that already have an image.
                    var _primTopics = this._primaryTopics || [];
                    mlEntry.topics.forEach(function (mlTopic) {
                        var _primTopic = null;
                        for (var _pi = 0; _pi < _primTopics.length; _pi++) {
                            if (_primTopics[_pi].id === mlTopic.id) { _primTopic = _primTopics[_pi]; break; }
                        }
                        if (!_primTopic) { return; }
                        var _primSects = _primTopic.sections || [];
                        (mlTopic.sections || []).forEach(function (mlSection) {
                            for (var _si = 0; _si < _primSects.length; _si++) {
                                if (String(_primSects[_si].id) === String(mlSection.id)) {
                                    // Copy image if primary has one (preserve any image already
                                    // explicitly added to the additional-language section)
                                    if (_primSects[_si].image && !mlSection.image) {
                                        mlSection.image = _primSects[_si].image;
                                    }
                                    break;
                                }
                            }
                        });
                    });
                    this.manifest.topics = mlEntry.topics;
                    this.activeLang = code;
            // v13.94.6: setCurrentLanguage was called exactly once, at init, with the
            // PRIMARY language - so switching to an additional-language pack swapped the
            // topics, the audio and the render, but left every label resolving English.
            // That includes the resolver handed to cc-state, which is what builds the
            // narration text, so a regenerated section in the active language got English
            // labels spliced into it.
            setCurrentLanguage(code || this.voiceLanguage);
            useNarrationLanguage(code || this.voiceLanguage);
                    // CC-ML-DEBUG v13.8: Show actual content of first German/non-English section
                    // so teacher/developer can confirm whether AI produced translated content
                    // or silently fell back to English. This is the DEFINITIVE diagnostic for
                    // "English with German accent" bugs — if title/voiceoverText below is English,
                    // the AI generation produced English content and the course needs regeneration.
                    (function () {
                        var _dbgTopics = mlEntry.topics || [];
                        var _dbgSect = null;
                        for (var _dti = 0; _dti < _dbgTopics.length && !_dbgSect; _dti++) {
                            var _dbgSects = _dbgTopics[_dti].sections || _dbgTopics[_dti].subtopics || [];
                            if (_dbgSects.length > 0) { _dbgSect = _dbgSects[0]; }
                        }
                        if (_dbgSect) {
                            ccLog('setLanguage sample section', _dbgSect.id,
                                (_dbgSect.cards && _dbgSect.cards.length) ? _dbgSect.cards[0] : null);
                        }
                    })();
                }
            }
            this.renderTopicsGrid();
            // v12.93 FIX-CC-LANG-SAVE: Immediately persist the newly-selected language to
            // session storage. Previously setActiveLang() never called saveSessionState(), so
            // activeLang was only saved when the user clicked "Start Learning" (which calls
            // saveSessionState() in its handler). If the page was refreshed BEFORE clicking
            // Start Learning the language selection was silently discarded — on reload,
            // loadSessionState() found activeLang=null and rendered primary (English) content.
            // Calling saveSessionState() here ensures the switch is persisted immediately.
            this.saveSessionState();
            // v12.55 FIX: Trigger preload for the newly-active language's sections.
            // Builder pre-gens voiceovers for each language and PHP caches the audio
            // files server-side.  Without this call, additional-language sections have
            // voiceoverUrl='pregenerated' but voiceoverCache is empty  -  students must
            // click Play individually and wait for a server round-trip on every slide.
            // Calling preloadVoiceovers() here fetches those cached files into
            // voiceoverCache so audio is ready when the student opens each slide.
            // Primary-language sections re-entering preload are found immediately in
            // cache and skipped, so switching back is essentially free.
            if (this.voiceoverEnabled) {
                this.preloadVoiceovers();
            }
        },

        renderTopicsGrid: function () {
            var self = this;
            var manifest = this.manifest;
            var topics = manifest.topics || [];
                        var html = '<div class="cc5-player" role="region" aria-label="' + getLabel('contentPlayer') + '">';
            // Header with title and progress
            html += '<div class="cc5-header">';
            html += '<div class="cc5-header-content">';
            html += '<h1 class="cc5-title">' + escapeHtml(fixGrammar(manifest.context?.topic || getLabel('learningTopics'))) + '</h1>';
            if (manifest.context?.unitCode) {
                html += '<p class="cc5-subtitle">' + escapeHtml(fixGrammar(manifest.context.unitCode + ' - ' + (manifest.context.unitTitle || ''))) + '</p>';
            }
            html += '</div>';
            
            // v6.6.14: Teacher navigation buttons (visible when canEdit is true)
            if (this.canEdit) {
                var failedCount = this.countFailedSlides();
                html += '<div class="cc5-teacher-nav">';
                
                // v6.6.15: Regenerate button when there are failed slides
                if (failedCount > 0) {
                    html += '<button type="button" class="cc5-teacher-btn cc5-teacher-btn-warning cc5-regenerate-btn" title="' + getLabel('regenerateContent') + '">';
                    html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>';
                    html += '<span>' + getLabel('regenerateContent') + ' (' + failedCount + ')</span>';
                    html += '</button>';
                }
                
                html += '<a href="?id=' + this.cmid + '&edit=1" class="cc5-teacher-btn cc5-teacher-btn-primary" title="' + getLabel('backToBuilder') + '">';
                html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
                html += '<span>' + getLabel('editSettings') + '</span>';
                html += '</a>';
                
                // v6.6.66: Export buttons for offline teaching
                html += '<button type="button" class="cc5-teacher-btn cc5-teacher-btn-secondary cc5-export-pdf-btn" title="' + getLabel('downloadPdf') + '">';
                html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M12 18v-6"/><path d="m9 15 3 3 3-3"/></svg>';
                html += '<span>' + getLabel('downloadPdf') + '</span>';
                html += '</button>';
                
                html += '<button type="button" class="cc5-teacher-btn cc5-teacher-btn-secondary cc5-export-text-btn" title="' + getLabel('downloadText') + '">';
                html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>';
                html += '<span>' + getLabel('downloadText') + '</span>';
                html += '</button>';
                
                // v6.7.57: Settings button for behavioral settings
                html += '<button type="button" class="cc5-teacher-btn cc5-teacher-btn-secondary cc5-settings-btn" title="' + getLabel('behaviorSettings') + '">';
                html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
                html += '<span>' + getLabel('behaviorSettings') + '</span>';
                html += '</button>';
                
                html += '</div>';
            }
            
            html += '<div class="cc5-progress-badge">';
            html += '<span class="cc5-progress-text">' + getLabel('progressStatus') + '</span>';
            html += '<span class="cc5-progress-value">' + this.calculateOverallProgress() + '%</span>';
            html += '</div>';
            html += '</div>';

            // v12.79 CC-LANG-SWITCHER-MODULE: Delegate to cc-language-switcher.js.
            // Previously: ~25 lines of inline HTML building with a local _langLabels map.
            html += CcLangSwitcher.renderLangSwitcherHtml(manifest, self.activeLang, getLabel);

            // Estimated time banner
            var ccEtaSeconds = 0;
            var ccTotalLearning = 0;
            var ccTotalActivities = 0;
            var ccHasVoiceover = !!(manifest.voiceSettings && manifest.voiceSettings.enabled !== false);
            topics.forEach(function (topic) {
                var secs = topic.sections || [];
                ccTotalLearning += secs.length;
                secs.forEach(function (s) {
                    if (s.activity && s.activity.activityType) ccTotalActivities++;
                });
            });
            ccEtaSeconds = (topics.length * 60) + (ccTotalLearning * 1200) + (ccTotalActivities * 300);
            if (ccHasVoiceover) ccEtaSeconds = Math.ceil(ccEtaSeconds * 1.3);
            var ccEtaMinutes = Math.ceil(ccEtaSeconds / 60);
            var ccEtaTimeStr = ccEtaMinutes < 1 ? 'Under 1 minute' : (ccEtaMinutes === 1 ? '~1 minute' : (ccEtaMinutes < 60 ? '~' + ccEtaMinutes + ' minutes' : '~' + Math.floor(ccEtaMinutes / 60) + (Math.floor(ccEtaMinutes / 60) === 1 ? ' hr ' : ' hrs ') + (ccEtaMinutes % 60) + ' min'));
            var ccClockSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';

            // Topics grid
            // v6.5.3: Check topic navigation mode (lockstep vs free)
            var topicNavMode = (manifest.settings && manifest.settings.topicNavMode) || 'free';
            var topicProgressCache = []; // Cache progress for lockstep checks
            topics.forEach(function (topic) {
                topicProgressCache.push(self.calculateTopicProgress(topic));
            });

            if (topics.length === 1) {
                // -- Single-topic hero layout --------------------------------------
                var sTopic = topics[0];
                var sTheme = getColorTheme(sTopic.color || 'primary');
                var sProgress = topicProgressCache[0];
                var sStatusClass = sProgress === 100 ? 'complete' : (sProgress > 0 ? 'in-progress' : 'not-started');
                var sIcon = self.getContentIcon(sTopic, 0);
                var sSections = sTopic.sections || [];
                var sLearning = sSections.length;
                var sActivity = sSections.filter(function (s) { return s.activity && s.activity.activityType; }).length;
                var sSlides = sLearning + sActivity;
                var sStartLabel = sStatusClass === 'complete'
                    ? (getLabel('review') || 'Review Content')
                    : (sStatusClass === 'in-progress'
                        ? (getLabel('continueLearning') || 'Continue Learning')
                        : (getLabel('startLearning') || 'Start Learning'));
                var sArrowSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';
                var sBookSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>';
                var sStarSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';

                html += '<div id="cc5-main-content" class="cc5-single-topic-hero">';

                // Left: icon + title + description + badges
                html += '<div class="cc5-single-topic-left">';
                html += '<div class="cc5-topic-icon cc5-single-topic-icon-lg ' + sTheme.light + ' ' + sTheme.text + '">';
                html += getIcon(sIcon);
                html += '</div>';
                html += '<div class="cc5-single-topic-text">';
                html += '<h2 class="cc5-single-topic-title">' + escapeHtml(fixGrammar(sanitizeTopicTitle(sTopic.title))) + '</h2>';
                if (sTopic.description) {
                    html += '<p class="cc5-single-topic-desc">' + formatText(sTopic.description) + '</p>';
                }
                html += '<div class="cc5-topic-type-badges">';
                html += '<span class="cc5-type-badge cc5-badge-learning">';
                html += sBookSvg + getLabel('learning') + ' (' + sLearning + ')';
                html += '</span>';
                if (sActivity > 0) {
                    html += '<span class="cc5-type-badge cc5-badge-activity">';
                    html += sStarSvg + getLabel('activity') + ' (' + sActivity + ')';
                    html += '</span>';
                }
                html += '</div>';
                html += '</div>'; // single-topic-text
                html += '</div>'; // single-topic-left

                // Right: stats + progress + action button
                html += '<div class="cc5-single-topic-right">';

                // Stats
                html += '<div class="cc5-single-stats">';
                html += '<div class="cc5-single-stat">';
                html += '<div class="cc5-single-stat-icon cc5-single-stat-time">' + ccClockSvg + '</div>';
                html += '<div class="cc5-single-stat-val">' + ccEtaTimeStr + '</div>';
                html += '<div class="cc5-single-stat-lbl">' + getLabel('estTime') + '</div>';
                html += '</div>';
                html += '<div class="cc5-single-stat">';
                html += '<div class="cc5-single-stat-icon cc5-single-stat-slides">' + sBookSvg + '</div>';
                html += '<div class="cc5-single-stat-val">' + sSlides + '</div>';
                html += '<div class="cc5-single-stat-lbl">' + getLabel('slidesStat') + '</div>';
                html += '</div>';
                if (sActivity > 0) {
                    html += '<div class="cc5-single-stat">';
                    html += '<div class="cc5-single-stat-icon cc5-single-stat-activity">' + sStarSvg + '</div>';
                    html += '<div class="cc5-single-stat-val">' + sActivity + '</div>';
                    html += '<div class="cc5-single-stat-lbl">' + getLabel('activitiesStat') + '</div>';
                    html += '</div>';
                }
                html += '</div>'; // cc5-single-stats

                // Progress bar (only if started)
                if (sProgress > 0) {
                    html += '<div class="cc5-single-progress">';
                    html += '<div class="cc5-single-progress-bar"><div class="cc5-single-progress-fill" style="width:' + sProgress + '%"></div></div>';
                    html += '<span class="cc5-single-progress-pct">' + sProgress + '% complete</span>';
                    html += '</div>';
                }

                // Start/Continue/Review button  -  reuses cc5-topic-card so existing click handler fires
                html += '<button type="button" class="cc5-single-start-btn cc5-topic-card" data-topic-id="' + escapeHtml(sTopic.id) + '" data-locked="false" tabindex="0">';
                html += '<span>' + sStartLabel + '</span>';
                html += sArrowSvg;
                html += '</button>';

                html += '</div>'; // single-topic-right
                html += '</div>'; // cc5-single-topic-hero

            } else {
                // -- Multi-topic: ETA banner + grid --------------------------------
                html += '<div class="cc5-eta-banner">';
                html += '<div class="cc5-eta-icon-wrap">' + ccClockSvg + '</div>';
                html += '<div class="cc5-eta-body">';
                html += '<span class="cc5-eta-label">' + getLabel('estimatedCompletionTime') + '</span>';
                html += '<span class="cc5-eta-time">' + ccEtaTimeStr + '</span>';
                html += '<span class="cc5-eta-detail">' + topics.length + ' topics, ' + ccTotalLearning + ' learning slides, ' + ccTotalActivities + ' activities</span>';
                html += '</div></div>';

                html += '<div id="cc5-main-content" class="cc5-topics-grid">';
                topics.forEach(function (topic, index) {
                    var theme = getColorTheme(topic.color || 'primary');
                    var topicProgress = topicProgressCache[index];
                    var statusClass = topicProgress === 100 ? 'complete' : (topicProgress > 0 ? 'in-progress' : 'not-started');
                    var topicIcon = self.getContentIcon(topic, index);

                    // v6.5.3: Lockstep logic
                    // v13.45: Editors/admins bypass lockstep — they must be able to preview any topic
                    var isLocked = false;
                    if (topicNavMode === 'lockstep' && index > 0 && !self.editMode && !self.canEdit) {
                        var prevProgress = topicProgressCache[index - 1];
                        isLocked = prevProgress < 100;
                    }

                    var sections = topic.sections || [];
                    var learningCount = sections.length;
                    var activityCount = sections.filter(function (s) { return s.activity && s.activity.activityType; }).length;
                    var totalSlides = learningCount + activityCount;

                    var cardClasses = 'cc5-topic-card' + (isLocked ? ' cc5-topic-locked' : '');
                    html += '<div class="' + cardClasses + '" data-topic-id="' + escapeHtml(topic.id) + '" data-locked="' + isLocked + '" tabindex="0" role="button">';

                    if (isLocked) {
                        html += '<div class="cc5-topic-lock-badge">';
                        html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
                        html += '</div>';
                    }

                    if (topicProgress === 100) {
                        html += '<div class="cc5-topic-complete-badge">';
                        html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>';
                        html += '</div>';
                    }

                    html += '<div class="cc5-topic-icon ' + theme.light + ' ' + theme.text + '">';
                    html += getIcon(topicIcon);
                    html += '</div>';
                    html += '<div class="cc5-topic-content">';
                    html += '<h3 class="cc5-topic-title">' + escapeHtml(fixGrammar(sanitizeTopicTitle(topic.title))) + '</h3>';
                    html += '<p class="cc5-topic-description">' + formatText(topic.description) + '</p>';

                    html += '<div class="cc5-topic-type-badges">';
                    html += '<span class="cc5-type-badge cc5-badge-learning">';
                    html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>';
                    html += getLabel('learning') + ' (' + learningCount + ')';
                    html += '</span>';
                    if (activityCount > 0) {
                        html += '<span class="cc5-type-badge cc5-badge-activity">';
                        html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
                        html += getLabel('activity') + ' (' + activityCount + ')';
                        html += '</span>';
                    }
                    html += '</div>';

                    html += '<div class="cc5-topic-meta">';
                    html += '<span class="cc5-section-count">' + totalSlides + ' slides</span>';
                    html += '<span class="cc5-topic-status cc5-status-' + statusClass + '">';
                    if (statusClass === 'complete') {
                        html += '<svg class="cc5-check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
                        html += getLabel('complete') || 'Complete';
                    } else if (statusClass === 'in-progress') {
                        html += topicProgress + '% ' + (getLabel('complete') || 'complete');
                    }
                    html += '</span>';
                    html += '</div>';
                    html += '</div>';
                    html += '<div class="cc5-topic-arrow">' + getIcon('chevron-right') + '</div>';
                    html += '</div>';
                });
                html += '</div>'; // cc5-topics-grid

                // v11.36 FIX-NEXT-ACTIVITY: Show "Return to Course" button when all topics are complete.
                var allTopicsDone = topics.length > 0 && topics.every(function (t, i) { return topicProgressCache[i] === 100; });
                if (allTopicsDone && self.courseUrl) {
                    html += '<div class="cc5-return-course-wrap">';
                    html += '<a href="' + escapeHtml(self.courseUrl) + '" class="cc5-return-course-btn">';
                    html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>';
                    html += '<span>' + (getLabel('returnToCourse') || 'Return to Course') + '</span>';
                    html += '</a>';
                    html += '</div>';
                }
            }

            html += '</div>'; // cc5-player
            
            this.container.html(html);
        },

        /**
         * Get content-appropriate icon based on topic content
         * Priority: Specific work context > Hazard type > Activity type > Generic
         */
        getContentIcon: function (topic, index) {
            var text = ((topic.title || '') + ' ' + (topic.description || '')).toLowerCase();
            
            // TIER 1: Specific work environments (highest priority)
            if (text.includes('height') || text.includes('elevat') || text.includes('ladder') || text.includes('scaffold') || text.includes('roof') || text.includes('platform')) return 'hard-hat';
            if (text.includes('confine') || text.includes('enclosed') || text.includes('tank') || text.includes('pit') || text.includes('trench')) return 'hard-hat';
            if (text.includes('electric') || text.includes('power') || text.includes('energy') || text.includes('voltage') || text.includes('circuit')) return 'zap';
            if (text.includes('chemical') || text.includes('hazmat') || text.includes('toxic') || text.includes('corrosive') || text.includes('flammable')) return 'droplets';
            if (text.includes('fire') || text.includes('emergency') || text.includes('evacuat') || text.includes('rescue')) return 'flame';
            
            // TIER 2: Equipment and physical controls
            if (text.includes('sign') || text.includes('barricade') || text.includes('barrier') || text.includes('cone') || text.includes('exclusion')) return 'alert-triangle';
            if (text.includes('fall') || text.includes('harness') || text.includes('anchor') || text.includes('lanyard') || text.includes('arrest')) return 'hard-hat';
            if (text.includes('ppe') || text.includes('helmet') || text.includes('glove') || text.includes('goggle') || text.includes('respirator')) return 'hard-hat';
            if (text.includes('machine') || text.includes('equipment') || text.includes('tool') || text.includes('plant')) return 'wrench';
            if (text.includes('vehicle') || text.includes('forklift') || text.includes('crane') || text.includes('truck') || text.includes('transport')) return 'truck';
            
            // TIER 3: Hazards and risks
            if (text.includes('hazard') || text.includes('risk') || text.includes('danger')) return 'alert-triangle';
            if (text.includes('warn') || text.includes('caution') || text.includes('alert')) return 'alert-triangle';
            if (text.includes('injur') || text.includes('incident') || text.includes('accident') || text.includes('first aid')) return 'heartbeat';
            
            // TIER 4: Administrative controls
            if (text.includes('permit') || text.includes('authoris') || text.includes('authoriz') || text.includes('approval')) return 'clipboard';
            if (text.includes('inspect') || text.includes('check') || text.includes('assess') || text.includes('review')) return 'eye';
            if (text.includes('document') || text.includes('record') || text.includes('report') || text.includes('log')) return 'clipboard';
            if (text.includes('train') || text.includes('induct') || text.includes('competenc')) return 'graduation-cap';
            if (text.includes('communicat') || text.includes('brief') || text.includes('notify') || text.includes('consult')) return 'users';
            
            // TIER 5: Process phases (lowest priority - these are generic)
            if (text.includes('prepar') || text.includes('plan') || text.includes('before') || text.includes('setting up')) return 'clipboard';
            if (text.includes('perform') || text.includes('conduct') || text.includes('execut') || text.includes('carry')) return 'wrench';
            if (text.includes('clean') || text.includes('finali') || text.includes('pack') || text.includes('restore')) return 'wrench';
            if (text.includes('supervis') || text.includes('monitor') || text.includes('oversee')) return 'eye';
            
            // TIER 6: General safety (fallback before defaults)
            if (text.includes('safety') || text.includes('safe') || text.includes('protect')) return 'shield';
            if (text.includes('system') || text.includes('control') || text.includes('procedure')) return 'clipboard';
            
            // Default icons by position
            var defaultIcons = ['shield', 'clipboard', 'wrench', 'eye', 'users'];
            return defaultIcons[index % defaultIcons.length];
        },

        /**
         * Render slide-based view with navigation controls
         */
        renderSlideView: function () {            var self = this;
            // FIX-CC-TOPIC-FIND (v12.94): Use String() coercion so that a numeric topic.id
            // from the JSON manifest (e.g. 1) matches a string currentTopicId from jQuery
            // .data() (e.g. "1") and vice-versa. Strict === silently returns undefined when
            // the types differ, causing the !topic guard below to fire and re-render the
            // topics grid over the user's click — "Start Learning does nothing on first load".
            var _ctid = String(self.currentTopicId);
            var topic = this.manifest.topics?.find(function (t) { return String(t.id) === _ctid; });
            if (!topic) {
                // FIX-CC-CLICK-DIAG (v12.94): Log the mismatch so it surfaces in the browser
                // console if the topic-not-found fallback fires unexpectedly.
                var _allIds = (this.manifest.topics || []).map(function (t) { return t.id; });
                ccWarn('[CC v' + CC_VERSION + '] renderSlideView: topic not found for currentTopicId=' +
                    JSON.stringify(self.currentTopicId) + ' (type=' + typeof self.currentTopicId +
                    '). manifest topic ids=' + JSON.stringify(_allIds) + '. Falling back to topics grid.');
                this.currentView = 'topics';
                this.renderTopicsGrid();
                return;
            }
            
            // Use expanded sections for interleaved learning + activity (v6.4.4)
            var sections = this.getCurrentSections();
            var currentSection = sections[this.currentSlideIndex] || sections[0];
            var allSlidesComplete = this.areAllExpandedSlidesComplete(sections);
            var canNavigateNext = this.canNavigateNext(currentSection);
            
            var html = '<div class="cc5-player cc5-slide-view">';
            
            // Top navigation bar
            html += '<div class="cc5-slide-topbar">';
            
            // Back button (v6.7.54: Always enabled - students can return to topics anytime)
            html += '<button type="button" class="cc5-back-btn" data-action="back" aria-label="' + getLabel('backToTopics') + '">';
            html += getIcon('arrow-left');
            html += '<span>' + getLabel('backToTopics') + '</span>';
            html += '</button>';
            
            // Slide indicators (pills with completion ticks) - differentiate activity slides (v6.4.4)
            html += '<div class="cc5-slide-indicators" role="tablist" aria-label="' + getLabel('slideProgress') + '">';
            var currentSectionForLock = sections[self.currentSlideIndex];
            var currentSlideBlocked = currentSectionForLock && !self.canNavigateNext(currentSectionForLock);
            sections.forEach(function (section, index) {
                var isComplete = self.isSectionComplete(section.slideId || section.id);
                var isCurrent = index === self.currentSlideIndex;
                var isActivity = section.slideType === 'activity';
                var isLocked = index > self.currentSlideIndex && !isComplete && currentSlideBlocked;
                var classes = 'cc5-slide-indicator';
                if (isCurrent) classes += ' cc5-current';
                if (isComplete) classes += ' cc5-complete';
                if (isActivity) classes += ' cc5-indicator-activity';
                if (isLocked) classes += ' cc5-indicator-locked';
                
                var slideTypeLabel = isActivity ? getLabel('activityPrefix') + ' ' : getLabel('learningPrefix') + ' ';
                html += '<button class="' + classes + '"' + (isLocked ? ' disabled aria-disabled="true"' : '') + ' data-slide-index="' + index + '" title="' + slideTypeLabel + escapeHtml(section.shortTitle || section.title) + '">';
                if (isComplete) {
                    html += '<svg class="cc5-indicator-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>';
                } else if (isActivity) {
                    // Star icon for activity indicators
                }
                html += '<span class="cc5-indicator-num">' + (index + 1) + '</span>';
                html += '</button>';
            });
            html += '</div>';
            
            // Progress counter
            html += '<div class="cc5-slide-counter" role="status" aria-label="' + getLabel('progressStatus') + '">';
            html += '<span>' + (this.currentSlideIndex + 1) + '</span>';
            html += '<span class="cc5-counter-sep">/</span>';
            html += '<span>' + sections.length + '</span>';
            html += '</div>';
            
            html += '</div>'; // .cc5-slide-topbar
            
            // Main slide content
            // FIX-CC-RENDER-GUARD (v12.94): Wrap in try/catch so any JS exception inside
            // renderSlideContent() (e.g. accessing undefined properties on a malformed section)
            // surfaces in the console instead of silently leaving the topics grid on screen.
            // Previously an uncaught throw here caused jQuery to swallow the exception and the
            // click handler returned without ever calling this.container.html(html) — producing
            // the "Start Learning does nothing on first load" symptom.
            if (currentSection) {
                try {
                    html += this.renderSlideContent(currentSection, topic);
                } catch (renderErr) {
                    ccError('[CC v' + CC_VERSION + '] FIX-CC-RENDER-GUARD: renderSlideContent threw for section=' +
                        JSON.stringify(currentSection && currentSection.id) + ' topic=' + JSON.stringify(topic && topic.id) +
                        ' slideIndex=' + self.currentSlideIndex + '. Error: ' + renderErr);
                    html += '<div class="cc5-slide-error" style="padding:2rem;text-align:center;color:#b91c1c;">' +
                        '<p>' + getLabel('slideRenderFailed') + '</p>' +
                        '<p style="font-size:0.8em;opacity:0.7;">' + escapeHtml(String(renderErr)) + '</p>' +
                        '</div>';
                }
            }
            
            // Bottom navigation with chevrons
            html += '<nav class="cc5-slide-nav" role="navigation" aria-label="' + getLabel('navigationControls') + '">';
            
            // Left chevron (previous)
            html += '<button type="button" class="cc5-nav-chevron cc5-prev ' + (this.currentSlideIndex === 0 ? 'cc5-disabled' : '') + '" data-action="prev" ' + (this.currentSlideIndex === 0 ? 'disabled' : '') + ' aria-label="' + getLabel('previousSlide') + '">';
            html += getIcon('chevron-left');
            html += '</button>';
            
            // Center - progression info/timer (v6.4.4 - use slideId for expanded sections)
            // v6.6.57: Skip voiceover hint for activity slides (they don't have voiceover)
            // v6.7.32: Show "Achieve 100% to continue" for activity slides when requireFullScore is enabled
            html += '<div class="cc5-nav-center">';
            var currentSlideId = currentSection?.slideId || currentSection?.id;
            var isCurrentActivitySlide = currentSection?.slideType === 'activity';
            if (isCurrentActivitySlide && this.requireFullScore && !this.isSectionComplete(currentSlideId)) {
                // Show full score requirement message for activity slides
                html += '<div class="cc5-fullscore-hint">';
                html += '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
                html += '<span>' + getLabel('perfectScoreRequired') + '</span>';
                html += '</div>';
            } else if (this.progressionMode === PROGRESSION_MODES.TIMED && !this.isSectionComplete(currentSlideId)) {
                html += '<div class="cc5-timer-display" id="cc5-timer" role="timer" aria-live="polite">';
                html += '<svg class="cc5-timer-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
                html += '<span class="cc5-timer-value">' + this.slideDuration + 's</span>';
                html += '</div>';
            } else if (this.progressionMode === PROGRESSION_MODES.VOICEOVER && !isCurrentActivitySlide && !this.isSectionComplete(currentSlideId)) {
                // v8.4.6: Show appropriate hint based on what's still needed
                var voNeedVo = !this.voiceoverPlayed;
                var voNeedActivity = this.requireFullScore && currentSection && currentSection.activity && currentSection.activity.activityType && !this.isActivityComplete(currentSection, currentSlideId);
                if (voNeedVo && voNeedActivity) {
                    html += '<div class="cc5-voiceover-hint">';
                    html += '<span>' + getLabel('listenToContinue') + ' & ' + getLabel('perfectScoreRequired') + '</span>';
                    html += '</div>';
                } else if (voNeedVo) {
                    html += '<div class="cc5-voiceover-hint">';
                    html += '<span>' + getLabel('listenToContinue') + '</span>';
                    html += '</div>';
                } else if (voNeedActivity) {
                    html += '<div class="cc5-fullscore-hint">';
                    html += '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
                    html += '<span>' + getLabel('perfectScoreRequired') + '</span>';
                    html += '</div>';
                }
            }
            html += '</div>';
            
            // Right chevron (next)
            var isLastSlide = this.currentSlideIndex === sections.length - 1;
            var nextDisabled = !canNavigateNext;
            html += '<button type="button" class="cc5-nav-chevron cc5-next ' + (nextDisabled ? 'cc5-disabled' : '') + '" data-action="next" ' + (nextDisabled ? 'disabled' : '') + ' aria-label="' + (isLastSlide && allSlidesComplete ? getLabel('finishTopic') : getLabel('nextSlide')) + '">';
            if (isLastSlide && allSlidesComplete) {
                html += '<span class="cc5-finish-text">' + getLabel('finish') + '</span>';
            }
            html += getIcon('chevron-right');
            html += '</button>';
            
            html += '</nav>'; // .cc5-slide-nav
            
            html += '</div>'; // .cc5-player
            
            this.container.html(html);
            this.initScrollReveal(); // v10.92: gentle rise-in animation for card elements

            
            // Auto-scroll to top of slide content (v6.4.4)
            var slideContent = this.container.find('.cc5-slide-topbar')[0];
            if (slideContent) {
                setTimeout(function () {
                    slideContent.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 50);
            }
            
            // Show tutorial on first visit
            if (!this.tutorialShown && this.currentSlideIndex === 0) {
                this.showTutorial();
            }
            
            // Start timer if timed mode (v6.4.4 - use slideId for expanded sections)
            var timerSlideId = currentSection?.slideId || currentSection?.id;
            if (this.progressionMode === PROGRESSION_MODES.TIMED && !this.isSectionComplete(timerSlideId)) {
                this.startSlideTimer();
            }
        },

        /**
         * Render individual slide content (v6.4.4)
         * Supports interleaved learning + activity slides */
        /**
         * v7.7.0: Get card progress for a section
         * Returns { current: X, total: Y, timeEstimate: "X min" }
         */
        getCardProgress: function (section, topic) {
            // Count total sections in this topic
            var totalSections = topic.sections ? topic.sections.length : 1;
            var currentIndex = 1;
            
            if (topic.sections && section.id) {
                for (var i = 0; i < topic.sections.length; i++) {
                    if (topic.sections[i].id === section.id) {
                        currentIndex = i + 1;
                        break;
                    }
                }
            }
            
            // Time estimate based on content type
            var timeEstimate = '2 min';
            if (section.scenario) {
                timeEstimate = '3 min';
            } else if (section.requirements && section.requirements.length > 5) {
                timeEstimate = '4 min';
            }
            
            return {
                current: currentIndex,
                total: totalSections,
                timeEstimate: timeEstimate
            };
        },

        // v10.92: Gentle rise-in entrance animation for card elements within the current slide.
        // Uses IntersectionObserver so elements animate as they enter the viewport  -  works
        // correctly inside Moodle regardless of whether scroll is on window or a parent container.
        // Animation is a one-shot CSS keyframe; the class is stripped on animationend so hover
        // transforms and other existing styles are completely unaffected afterwards.
        initScrollReveal: function () {
            var self = this;
            if (this._revealObserver) {
                this._revealObserver.disconnect();
                this._revealObserver = null;
            }
            if (!window.IntersectionObserver) return;
            var containerEl = this.container && this.container[0];
            if (!containerEl) return;

            // Target the individual card/item elements across all slide types
            var targets = Array.from(containerEl.querySelectorAll(
                '.cc5-scene-part, .cc5-concept-insight, .cc5-mistake-item, .cc5-summary-item'
            ));
            if (!targets.length) return;

            // Compute stagger delay: each element gets a delay based on its index among siblings
            // sharing the same parent container (e.g. all 4 scene-parts stagger 0, 70, 140, 210 ms)
            var parentCounters = new Map();
            targets.forEach(function (el) {
                var parent = el.parentElement;
                var idx = parentCounters.has(parent) ? parentCounters.get(parent) : 0;
                parentCounters.set(parent, idx + 1);
                el.dataset.ccRevealIdx = idx;
            });

            this._revealObserver = new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    if (entry.isIntersecting) {
                        var el = entry.target;
                        var delay = (parseInt(el.dataset.ccRevealIdx) || 0) * 0.07;
                        el.style.animationDelay = delay + 's';
                        el.classList.add('cc5-rise-in');
                        el.addEventListener('animationend', function () {
                            el.classList.remove('cc5-rise-in');
                            el.style.animationDelay = '';
                        }, { once: true });
                        self._revealObserver.unobserve(el);
                    }
                });
            }, { threshold: 0.08, rootMargin: '0px 0px -20px 0px' });

            targets.forEach(function (el) {
                self._revealObserver.observe(el);
            });
        },

        renderSlideContent: function (section, topic) {                                  
            var self = this;
            
            // v7.2.50: Track which document types have been linked on this slide (deduplication)
            var linkedDocsTracker = {};
            
            // Determine slide type from expanded section (v6.4.4 interleaved mode)
            var isActivitySlide = section.slideType === 'activity';
            var slideTitle = section.displayTitle || section.title;
            
            
            var html = '<div class="cc5-slide-content" data-section-id="' + escapeHtml(section.slideId || section.id) + '" data-slide-type="' + (section.slideType || 'learning') + '">';
            
            // Slide header with Moodle primary color and white text
            // Apply custom header color from manifest (v6.4.4) or use default
            var headerColor = this.manifest.appearanceSettings?.headerColor || '#047857';
            var headerClasses = 'cc5-slide-header' + (isActivitySlide ? ' cc5-slide-header--has-type-label' : '');
            html += '<div class="' + headerClasses + '" style="background: ' + headerColor + ';">';
            
            // v7.9.87: Only show slide type label for activity slides (removes empty div from learning slides)
            if (isActivitySlide) {
                html += '<div class="cc5-slide-type-label">';
                html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>';
                html += '<span>' + getLabel('practiceActivity') + '</span>';
                html += '</div>';
            }
            
            
            // v6.5.30: Use contextual icon for BOTH learning and activity slides
            // Activity slides now get content-aware icons (e.g., consulting = message-circle, not puzzle)
            html += '<div class="cc5-slide-header-content">';
            html += '<h4 class="cc5-slide-title">' + escapeHtml(fixGrammar(slideTitle)) + '</h4>';
            html += '</div>';
            
            // Slide header actions container (v6.5.0)
            html += '<div class="cc5-slide-header-actions">';
            
            // Large voiceover button (mobile-first) - add attention pulse in voiceover mode (v6.4.4)
            // v6.5.11: Only show if voiceover is enabled
            // v6.6.57: CRITICAL - Only show voiceover on LEARNING slides, NOT activity slides
            // Activity slides are interactive - students should complete them, not listen passively
            if (this.voiceoverEnabled && !isActivitySlide) {
                var voiceoverClasses = 'cc5-voiceover-btn-large';
                var voiceoverSlideId = section.slideId || section.id;
                if (this.progressionMode === PROGRESSION_MODES.VOICEOVER && !this.isSectionComplete(voiceoverSlideId) && !this.voiceoverPlayed) {
                    voiceoverClasses += ' cc5-attention';
                }
                // v11.86 FIX 2+5: Render button disabled for students when voiceoversComplete
                // is not true  -  prevents any click before content is ready, giving students a
                // clear visual indicator that voiceovers have not been prepared yet.
                var _studentBlocked = (!this.editMode && !this.canEdit && this.manifest.voiceoversComplete !== true);
                var _voBtn_disabled = _studentBlocked ? ' disabled' : '';
                var _voBtn_title = _studentBlocked ? 'Audio not yet ready  -  check back shortly' : 'Play voiceover';
                // Use original section.id for voiceover lookup
                html += '<div class="cc5-voiceover-controls">';
                html += '<button class="' + voiceoverClasses + '" data-section-id="' + escapeHtml(section.id) + '" title="' + _voBtn_title + '"' + _voBtn_disabled + '>';
                html += '<span class="cc5-voiceover-icon">' + getIcon('volume2') + '</span>';
                html += '<span class="cc5-voiceover-label">' + getLabel('playVoiceover') + '</span>';
                html += '</button>';
                html += '<button class="cc5-voiceover-pause-btn" data-section-id="' + escapeHtml(section.id) + '" title="' + getLabel('pauseVoiceover') + '" style="display:none;">';
                html += '<span class="cc5-pause-icon">' + getIcon('pause') + '</span>';
                html += '<span class="cc5-voiceover-label">' + getLabel('pauseVoiceover') + '</span>';
                html += '</button>';
                html += '</div>';
            }
            
            // Edit button for teachers (v6.5.0) - now also on activity slides (v6.5.26)
            if (this.canEdit) {
                html += '<button type="button" class="cc5-edit-slide-btn" data-topic-id="' + escapeHtml(topic.id) + '" data-section-id="' + escapeHtml(section.id) + '" title="' + getLabel('editThisSlide') + '">';
                html += '<span class="cc5-edit-icon">' + getIcon('pencil') + '</span>';
                html += '<span class="cc5-edit-label">' + getLabel('edit') + '</span>';
                html += '</button>';
            }
            
            html += '</div>'; // .cc5-slide-header-actions
            html += '</div>';
            
            // ===================================================================
            // SLIDE IMAGE (v6.6.67): Display image under header if present
            // Responsive sizing for PC, tablet, and mobile
            // ===================================================================
            if (!isActivitySlide) {
                var sectionImage = section.image;
                // v11.55 FIX: Treat "pregenerated" sentinel and raw data: URLs as no-image.
                // The PHP save_manifest safety net strips data: URLs (>200 chars) from the
                // manifest and replaces them with "pregenerated". The server now saves images
                // to disk and returns HTTPS URLs, so "pregenerated" and data: URLs only appear
                // in manifests generated before v11.55  -  show the Add-Image button instead of
                // rendering a broken <img> tag.
                var hasImage = sectionImage && sectionImage.url
                    && sectionImage.url !== 'pregenerated'
                    && sectionImage.url.indexOf('data:') !== 0;
                
                html += '<div class="cc5-slide-image-container" data-section-id="' + escapeHtml(section.id) + '">';
                
                if (hasImage) {
                    // Display the image
                    html += '<div class="cc5-slide-image-wrapper">';
                    // v11.58: onerror fires a custom bubbling event so jQuery delegation can recover the broken-image state.
                    // The native 'error' event doesn't bubble, so delegated .on('error') would silently fail.
                    html += '<img src="' + escapeHtml(sectionImage.url) + '" alt="' + escapeHtml(section.title) + '" class="cc5-slide-image" loading="lazy" onerror="this.dispatchEvent(new CustomEvent(\'cc5img_error\',{bubbles:true,cancelable:false}))">';
                    
                    // Teacher controls overlay (only for canEdit)
                    if (self.canEdit) {
                        html += '<div class="cc5-slide-image-controls">';
                        html += '<button type="button" class="cc5-image-action-btn cc5-image-regenerate-btn" data-section-id="' + escapeHtml(section.id) + '" title="' + getLabel('regenerateImage') + '">';
                        html += getIcon('refresh-cw');
                        html += '<span>' + getLabel('regenerateImage') + '</span>';
                        html += '<span class="cc5-credit-badge">' + getLabel('imageCreditCost') + '</span>';
                        html += '</button>';
                        html += '<button type="button" class="cc5-image-action-btn cc5-image-remove-btn" data-section-id="' + escapeHtml(section.id) + '" title="' + getLabel('removeImage') + '">';
                        html += getIcon('x');
                        html += '<span>' + getLabel('removeImage') + '</span>';
                        html += '</button>';
                        html += '</div>';
                    }
                    html += '</div>';
                } else if (self.canEdit) {
                    // Empty state with Add Image button (teachers only)
                    // v6.7.10: Inline style to override Moodle theme hover backgrounds
                    html += '<div class="cc5-slide-image-empty">';
                    html += '<button type="button" class="cc5-add-image-btn" style="background:#fff !important;" data-section-id="' + escapeHtml(section.id) + '" data-topic-id="' + escapeHtml(topic.id) + '" onmouseover="this.style.background=\'#fff\'" onmouseout="this.style.background=\'#fff\'">';
                    html += '<span class="cc5-add-image-icon">' + getIcon('image-plus') + '</span>';
                    html += '<span class="cc5-add-image-text">' + getLabel('addImage') + '</span>';
                    html += '</button>';
                    html += '</div>';
                }
                
                html += '</div>'; // .cc5-slide-image-container
            }
            
            // Slide body
            html += '<div class="cc5-slide-body">';
            
            // ===================================================================
            // INTERLEAVED MODE (v6.4.4): Show learning OR activity based on slideType
            // ===================================================================
            
            if (!isActivitySlide) {
                // ===================================================================
                // LEARNING SLIDE: Show all learning content
                // ===================================================================
                
                // ===================================================================
                // v8.4.4: INTRODUCTION CARD - Display voiceoverText as visible intro
                // This text was previously only narrated but invisible to students.
                // Now shown as a styled intro paragraph above the Knowledge section.
                // ===================================================================
                if (section.voiceoverText) {
                    var introSentences = fixIntroSentences(section.voiceoverText);
                    section._displayedIntroText = introSentences.join(' ');
                    html += '<div class="cc5-introduction-card">';
                    html += '<div class="cc5-layer-header cc5-overview-header">';
                    html += '<span class="cc5-layer-badge cc5-badge-overview">';
                    html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>';
                    html += (getLabel('overview') || 'Overview');
                    html += '</span>';
                    html += '</div>';
                    html += '<div class="cc5-introduction-content">';
                    // v11.58: Render as plain paragraphs  -  no list markup.
                    introSentences.forEach(function (sentence) {
                        html += '<p class="cc5-introduction-para">' + formatTextWithDocLinks(sentence.trim(), linkedDocsTracker) + '</p>';
                    });
                    html += '</div>';
                    html += '</div>';
                }

                // v7.7.0: KNOWLEDGE BADGE HEADER (World-Class Learning Enhancement)
                html += '<div class="cc5-layer-header cc5-knowledge-header">';
                html += '<span class="cc5-layer-badge cc5-badge-knowledge">';
                html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>';
                html += (getLabel('knowledge') || 'Knowledge');
                html += '</span>';
                html += '</div>';

                // Description (v6.5.3: use formatTextWithDocLinks for document popup detection)
                // v8.4.6: Skip description when voiceoverText intro card is present (avoids redundant unnarrated text)
                // v12.63 FIX-CC-TOPIC-REPEAT: Skip description when it duplicates the section title.
                // The generator sets firstCard.description = section title text for knowledge cards,
                // which causes the topic name to render twice on card 1: once in the breadcrumb /
                // slide heading and again here in the Knowledge body.
                // Fix: normalise both strings (strip leading "X.Y" number prefix, trailing punctuation,
                // lowercase) and suppress the description if they match or one contains the other.
                if (section.description && !section.voiceoverText) {
                    var _descNorm = section.description.replace(/^[\d]+\.[\d]*\.?\s*/, '').replace(/[.!?:]*$/, '').trim().toLowerCase();
                    var _titleNorm = (section.title || '').replace(/^[\d]+\.[\d]*\.?\s*/, '').replace(/[.!?:]*$/, '').trim().toLowerCase();
                    var _isDescTitleRepeat = _descNorm && _titleNorm && (_descNorm === _titleNorm || _titleNorm.startsWith(_descNorm) || _descNorm.startsWith(_titleNorm));
                    if (!_isDescTitleRepeat) {
                        html += '<p class="cc5-slide-description">' + formatTextWithDocLinks(section.description, linkedDocsTracker) + '</p>';
                    }
                }
                
                // v6.6.73: Requirements grid - colorful feature cards with icon headers
                // Rotates through orange/green/blue/purple colors like Key Features section
                if (section.requirements && section.requirements.length) {
                    // Color rotation for requirement cards (orange, green, blue, purple)
                    var reqColors = ['orange', 'green', 'blue', 'purple'];
                    
                    html += '<div class="cc5-requirements-grid">';
                    
                    section.requirements.forEach(function (req, idx) {
                        // v6.6.17: Handle both string and object formats for backwards compatibility
                        var reqText = typeof req === 'string' ? req : (req.text || req.requirement || '');
                        var reqIcon = (typeof req === 'object' && req.icon) ? req.icon : null;
                        if (!reqText) return; // Skip empty requirements
                        
                        // Smart icon selection based on text content (v6.5.3)
                        var smartIcon = reqIcon || self.getSmartIconForText(reqText);
                        
                        // Color rotation
                        var colorClass = 'cc5-req-' + reqColors[idx % reqColors.length];
                        
                        // v6.6.104: First verb as heading, full sentence as description
                        var reqTitle = self.extractRequirementTitle(reqText); // e.g., "Inspect"
                        var reqDesc = self.getFullRequirementText(reqText);   // Full sentence
                        
                        html += '<div class="cc5-requirement-card ' + colorClass + '">';
                        html += '<div class="cc5-requirement-icon-circle">' + getIcon(smartIcon) + '</div>';
                        html += '<div class="cc5-requirement-content">';
                        html += '<h4 class="cc5-requirement-title">' + escapeHtml(fixGrammar(reqTitle)) + '</h4>';
                        html += '<p class="cc5-requirement-desc">' + formatTextWithDocLinks(reqDesc, linkedDocsTracker) + '</p>';
                        html += '</div>';
                        html += '</div>';
                    });
                    html += '</div>';
                }
                
                // ===================================================================
                // CONTRAST PAIRS (v6.5.7): Dynamic headings based on content context
                // Supports both legacy (doList/dontList) and new (positiveList/negativeList)
                // ===================================================================
                var positiveItems = section.positiveList || section.doList || [];
                var negativeItems = section.negativeList || section.dontList || [];
                // v13.94.3: section.contrastType was never written by anything - see
                // CcState.sectionContrastType(). This resolved to 'dos-donts' always.
                var contrastType = CcState.sectionContrastType(section);
                var contrastConfig = getContrastPair(contrastType);
                
                if (positiveItems.length || negativeItems.length) {
                    html += '<div class="cc5-dos-donts cc5-contrast-' + escapeHtml(contrastType) + '">';
                    
                    // Positive column (Do's / Safe / Compliant / etc.)
                    if (positiveItems.length) {
                        html += '<div class="cc5-dos-column">';
                        html += '<div class="cc5-column-header cc5-dos-header">';
                        html += getIcon(contrastConfig.positiveIcon);
                        html += '<span>' + escapeHtml(contrastConfig.positive) + '</span>';
                        html += '</div>';
                        html += '<ul class="cc5-dos-list">';
                        positiveItems.forEach(function (item) {
                            html += '<li class="cc5-do-item">';
                            html += '<span class="cc5-list-icon">' + getIcon(contrastConfig.positiveListIcon) + '</span>';
                            html += '<span>' + formatTextWithDocLinks(item, linkedDocsTracker) + '</span>';
                            html += '</li>';
                        });
                        html += '</ul>';
                        html += '</div>';
                    }
                    
                    // Negative column (Don'ts / Unsafe / Non-Compliant / etc.)
                    if (negativeItems.length) {
                        html += '<div class="cc5-donts-column">';
                        html += '<div class="cc5-column-header cc5-donts-header">';
                        html += getIcon(contrastConfig.negativeIcon);
                        html += '<span>' + escapeHtml(contrastConfig.negative) + '</span>';
                        html += '</div>';
                        html += '<ul class="cc5-donts-list">';
                        negativeItems.forEach(function (item) {
                            html += '<li class="cc5-dont-item">';
                            html += '<span class="cc5-list-icon">' + getIcon(contrastConfig.negativeListIcon) + '</span>';
                            html += '<span>' + formatTextWithDocLinks(item, linkedDocsTracker) + '</span>';
                            html += '</li>';
                        });
                        html += '</ul>';
                        html += '</div>';
                    }
                    
                    html += '</div>'; // .cc5-dos-donts
                }
                
                // ===================================================================
                // KEY TERMINOLOGY - Deduplicated term list
                // ===================================================================
                var combinedTerms = getTerminology(section);
                if (combinedTerms.length > 0) {
                    html += '<div class="cc5-knowledge-terminology">';
                    html += '<h4 class="cc5-terminology-title">' + (getLabel('keyTerms') || 'Key Terms') + '</h4>';
                    html += '<dl class="cc5-terminology-list">';
                    combinedTerms.forEach(function (term) {
                        html += '<dt class="cc5-term">' + escapeHtml(fixGrammar(term.term || '')) + '</dt>';
                        html += '<dd class="cc5-definition">' + escapeHtml(fixGrammar(term.definition || '')) + '</dd>';
                    });
                    html += '</dl>';
                    html += '</div>';
                }
                
                // ===================================================================
                // ACCENT CARDS (v6.6.70): Coloured cards for visual interest
                // Green = Key Takeaway, Amber = Pro Tip, Blue = Key Info, Purple = Expert Insight
                // ===================================================================
                html += this.renderAccentCards(section, linkedDocsTracker);
                
                // ===================================================================
                // v9.16: ROUTE-SPECIFIC CARD MODEL
                // VET (7): performance-anchor, plain-english, action-breakdown, competence-standard, scenario-1, scenario-2, common-errors
                // University (6): concept-anchor, theoretical-framework, analytical-lens, ethics-considerations, case-study-1, case-study-2
                // Workplace (6): business-impact, action-framework, risk-card, policy-alignment, scenario-1, scenario-2
                // ===================================================================
                
                // ROUTE-AWARE CARD RENDERING
                // v9.38: Iterate section.cards array  -  each card has its own cardType
                // v10.96 FIX-DP-ORDER: sort a shallow copy so decision-point always
                // renders last regardless of the order the AI returned the JSON array.
                // Does not mutate the stored section.cards[]  -  slice() first.
                if (section.cards && section.cards.length > 0) {
                    var _renderCards = section.cards.slice().sort(function (a, b) {
                        if (a.cardType === 'decision-point') return 1;
                        if (b.cardType === 'decision-point') return -1;
                        return 0;
                    });
                    // v11.10: Collect sibling card data for the 3-activity challenge
                    var _flipItems = [];
                    var _sortItems = [];
                    var _sortLabels = null;
                    _renderCards.forEach(function (c) {
                        if (c.cardType === 'concept-explainer' && c.conceptInsights && c.conceptInsights.length) {
                            c.conceptInsights.forEach(function (ins) {
                                var front = ins.title || '';
                                var back  = ins.text || ins.content || ins.description || '';
                                if (front && back) _flipItems.push({ front: front, back: back });
                            });
                        }
                        if (c.cardType === 'mental-model' && c.steps && c.steps.length) {
                            c.steps.forEach(function (s) {
                                var front = s.step || s.title || '';
                                var back  = s.detail || s.text || s.description || '';
                                if (front && back) _flipItems.push({ front: front, back: back });
                            });
                        }
                        if (c.cardType === 'mistakes' && c.items && c.items.length) {
                            c.items.forEach(function (m) {
                                var front = m.mistake || m.title || '';
                                var back  = m.consequence || m.text || m.description || '';
                                if (front && back) _flipItems.push({ front: front, back: back });
                            });
                        }
                        // v13.92: Topics-and-Text feeds the same three-activity block as
                        // every other route, but from its own fields - keyTerms on the
                        // Key Concepts card become the flip cards, and goodItems/badItems
                        // on the Key Takeaways card become the category sort.
                        if (c.keyTerms && c.keyTerms.length &&
                            /^(key-concepts|foundations)$/.test(c.cardType || '')) {
                            c.keyTerms.forEach(function (t) {
                                var front = (typeof t === 'string') ? t : (t.term || t.title || '');
                                var back  = (typeof t === 'string') ? '' : (t.definition || t.text || '');
                                if (front && back) _flipItems.push({ front: front, back: back });
                            });
                        }
                        if (c.cardType === 'competency-summary' || c.cardType === 'key-takeaways' ||
                            c.cardType === 'boundaries') {
                            (c.goodItems || []).forEach(function (gi) {
                                var t = typeof gi === 'string' ? gi : (gi.text || gi.behaviour || gi.criterion || '');
                                if (t) _sortItems.push({ text: t, category: 'good' });
                            });
                            (c.badItems || []).forEach(function (bi) {
                                var t = typeof bi === 'string' ? bi : (bi.text || '');
                                if (t) _sortItems.push({ text: t, category: 'bad' });
                            });
                        }
                    });
                    // Determine category labels from section contrastType
                    // v13.94.3: two bugs here. section.contrastType was never written
                    // by anything, so this map only ever returned its first entry; and
                    // the labels were hardcoded English, so a translated module showed
                    // English sort columns. Both now go through the shared resolver and
                    // the label bundle.
                    var _ct = CcState.sectionContrastType(section);
                    var _ctPair = getContrastPair(_ct);
                    _sortLabels = { positive: _ctPair.positive, negative: _ctPair.negative };
                    // Shuffle sort items deterministically using section id
                    if (_sortItems.length > 1) {
                        var _seed = 0;
                        var _sid = String(section.id || '');
                        for (var _si = 0; _si < _sid.length; _si++) _seed += _sid.charCodeAt(_si);
                        for (var _sj = _sortItems.length - 1; _sj > 0; _sj--) {
                            _seed = (_seed * 9301 + 49297) % 233280;
                            var _sk = _seed % (_sj + 1);
                            var _tmp = _sortItems[_sj];
                            _sortItems[_sj] = _sortItems[_sk];
                            _sortItems[_sk] = _tmp;
                        }
                    }

                    // v13.92: Topics-and-Text renders its four prose cards two across, and
                    // reveals them ONE AT A TIME - each slides gently up into place, is
                    // narrated, and offers a "Next Card" button. Detected from the cards
                    // themselves rather than from a mode flag, so a saved manifest renders
                    // correctly even when its route metadata is absent.
                    //
                    // The decision-point is deliberately rendered OUTSIDE the grid: it is
                    // not a prose card, it is the activity block, and it stays hidden until
                    // the last card has been revealed.
                    var _PROSE_TYPES = /^(overview|key-concepts|examples-application|key-takeaways|orientation|foundations|mechanism|in-practice|boundaries)$/;
                    var _proseCards = _renderCards.filter(function (c) {
                        return c && c.cardType && _PROSE_TYPES.test(c.cardType);
                    });
                    var _isProsePack = _proseCards.length > 0 && _renderCards.every(function (c) {
                        return c && c.cardType && (_PROSE_TYPES.test(c.cardType) || c.cardType === 'decision-point');
                    });
                    var _proseHasActivities = _isProsePack && self.activitiesEnabled &&
                        _renderCards.some(function (c) { return c.cardType === 'decision-point'; });
                    var _proseSeq = 0;
                    var _proseGridClosed = false;

                    // v13.92: stamp each rendered card with its index into section.cards,
                    // so the voiceover sync can find "the card being narrated" without
                    // every renderer having to be edited. _renderCards is a SORTED copy
                    // (decision-point pushed last) while the narration is built in
                    // section.cards order, so the index has to come from the original
                    // array, not from the render loop counter.
                    var _origCards = section.cards || [];
                    var _voIndexOf = function (card) {
                        for (var i = 0; i < _origCards.length; i++) {
                            if (_origCards[i] === card) { return i; }
                        }
                        return -1;
                    };
                    var _stampVoCard = function (cardHtml, voIdx) {
                        if (voIdx < 0 || !cardHtml) { return cardHtml; }
                        // Every route-card renderer opens with '<div class="cc5-card ...'.
                        return cardHtml.replace(/^(\s*<div\b)/, '$1 data-vo-card="' + voIdx + '"');
                    };

                    if (_isProsePack) {
                        html += '<div class="cc5-prose-grid" data-prose-seq="1" data-prose-total="'
                             + _proseCards.length + '" data-section-id="'
                             + escapeHtml(String(section.slideId || section.id || '')) + '">';
                    }

                    _renderCards.forEach(function (card, cardIdx) {
                        if (card.cardType) {
                            // v11.10: decision-point becomes the 3-activity challenge
                            // v11.11: skip challenge rendering when activities are disabled
                            if (card.cardType === 'decision-point' && self.activitiesEnabled) {
                                // v13.92: close the prose grid first, then wrap the activity
                                // block so it can be revealed after the final card.
                                // _proseGridClosed guards against a second decision-point:
                                // nothing in the pipeline should produce one, but a bare
                                // extra '</div>' would close the slide container and break
                                // the whole page, which is too high a price for trusting it.
                                if (_isProsePack && !_proseGridClosed) {
                                    html += '</div>';
                                    _proseGridClosed = true;
                                    html += '<div class="cc5-prose-activities cc5-prose-hidden" aria-hidden="true">';
                                    html += CcCardSlots.renderDecisionChallenge(card, _flipItems, _sortItems, _sortLabels, self.quizVoiceEnabled);
                                    html += '</div>';
                                } else if (!_isProsePack) {
                                    html += CcCardSlots.renderDecisionChallenge(card, _flipItems, _sortItems, _sortLabels, self.quizVoiceEnabled);
                                }
                            } else if (card.cardType === 'decision-point' && !self.activitiesEnabled) {
                                // Activities disabled  -  skip decision-point card entirely
                                if (_isProsePack && !_proseGridClosed) {
                                    html += '</div>';
                                    _proseGridClosed = true;
                                }
                            } else if (_isProsePack) {
                                html += _stampVoCard(self.renderRouteCard(card, {
                                    index: _proseSeq,
                                    total: _proseCards.length,
                                    hasActivities: _proseHasActivities
                                }), _voIndexOf(card));
                                _proseSeq++;
                            } else {
                                html += _stampVoCard(self.renderRouteCard(card), _voIndexOf(card));
                            }
                        }
                    });
                    // Close the grid when no decision-point closed it for us.
                    if (_isProsePack && !_proseGridClosed) {
                        html += '</div>';
                        _proseGridClosed = true;
                    }
                } else if (section.cardType) {
                    html += this.renderRouteCard(section);
                }
                
                // ===================================================================
                // v7.5.15: Document Activity - Interactive document-based exercises
                // ===================================================================
                if (section.docActivity && section.docActivity.activityType) {
                    html += this.renderDocActivity(section.docActivity);
                }
                
                // ===================================================================
                // ACTIVITY SLIDE: Show only the interactive activity
                // v6.6.96: Show activity instruction instead of generic "Apply what you learned"
                // ===================================================================
                
                // Show activity instruction if available, otherwise skip the intro
                if (section.activity && section.activity.instruction) {
                    html += '<div class="cc5-activity-intro">';
                    html += '<p class="cc5-activity-context">' + escapeHtml(fixGrammar(section.activity.instruction)) + '</p>';
                    html += '</div>';
                }
                
                // Render the activity
                if (section.activity && section.activity.activityType) {
                    html += this.renderActivity(section.activity);
                } else if (section.activity && section.slideType === 'activity') {
                    // v13.36 FIX-CC-ACTIVITY-BLANK: activityType is missing/unknown on
                    // an activity-type slide — fall back to legacy renderer so the slide
                    // is not blank (shows "Complete the activity" placeholder instead).
                    html += this.renderLegacyActivity(section.activity);
                }
            }
            
            html += '</div>'; // .cc5-slide-body
            html += '</div>'; // .cc5-slide-content
            
            return html;
        },

        renderPerformanceAnchor: function (section) { return CcCardSlots.renderPerformanceAnchor(section); },
        renderPlainEnglish: function (section) { return CcCardSlots.renderPlainEnglish(section); },
        renderActionBreakdown: function (section) { return CcCardSlots.renderActionBreakdown(section); },
        renderCompetenceStandard: function (section) { return CcCardSlots.renderCompetenceStandard(section); },
        renderRouteScenarioCard: function (section) { return CcCardSlots.renderRouteScenarioCard(section); },
        renderCommonErrors: function (section) { return CcCardSlots.renderCommonErrors(section); },
        renderConceptAnchor: function (section) { return CcCardSlots.renderConceptAnchor(section); },
        renderTheoreticalFramework: function (section) { return CcCardSlots.renderTheoreticalFramework(section); },
        renderAnalyticalLens: function (section) { return CcCardSlots.renderAnalyticalLens(section); },
        renderEthicsConsiderations: function (section) { return CcCardSlots.renderEthicsConsiderations(section); },
        renderCaseStudy: function (section) { return CcCardSlots.renderCaseStudy(section); },
        renderBusinessImpact: function (section) { return CcCardSlots.renderBusinessImpact(section); },
        renderActionFramework: function (section) { return CcCardSlots.renderActionFramework(section); },
        renderRiskCard: function (section) { return CcCardSlots.renderRiskCard(section); },
        renderPolicyAlignment: function (section) { return CcCardSlots.renderPolicyAlignment(section); },
        renderSkillAnchor: function (section) { return CcCardSlots.renderSkillAnchor(section); },
        renderCoreFramework: function (section) { return CcCardSlots.renderCoreFramework(section); },
        renderApplicationGuide: function (section) { return CcCardSlots.renderApplicationGuide(section); },
        renderCommonPitfalls: function (section) { return CcCardSlots.renderCommonPitfalls(section); },
        renderPDScenarioCard: function (section) { return CcCardSlots.renderPDScenarioCard(section); },

        // ===================================================================
        // v13.92: TOPICS-AND-TEXT SEQUENTIAL REVEAL + NARRATION SYNC
        //
        // Cards do not all appear at once. Card 1 slides gently up on arrival; when
        // its narration finishes the next card slides up, and so on, with the
        // paragraph currently being read lifted slightly to show focus. A "Next Card"
        // button on each card does the same thing by hand, so the route works
        // identically with audio off, muted, or blocked by the browser.
        //
        // Timing comes from the audio itself. The narration script for these sections
        // is built by CcState.buildProseVoiceoverSegments() - the fixed heading, then
        // each paragraph verbatim - so the segment list here is the SAME list that was
        // sent to TTS, in the same order. Each segment gets a share of the audio
        // duration proportional to its word count. That is an approximation, but a
        // close one on speech synthesised at a constant rate, and it degrades
        // gracefully: if it drifts by a beat, a card reveals a moment early or late
        // and nothing breaks.
        //
        // Deliberately restrained, per the owner: a slow slide up, a soft shadow, a
        // 3px lift on the focused paragraph. No scaling, no bouncing, no colour flash.
        // ===================================================================

        /**
         * Reveal one prose card.
         *
         * @param {Object}  $grid    jQuery wrapper for .cc5-prose-grid.
         * @param {Number}  index    0-based card index to reveal.
         * @param {Boolean} scrollTo Whether to bring the card into view.
         * @return {void}
         */
        revealProseCard: function ($grid, index, scrollTo) {
            if (!$grid || !$grid.length || isNaN(index)) { return; }
            var $card = $grid.find('.cc5-prose-card[data-prose-index="' + index + '"]');
            if (!$card.length) { return; }
            // Reveal every card up to this one, so a jump forward never leaves a hole.
            for (var i = 0; i <= index; i++) {
                var $c = $grid.find('.cc5-prose-card[data-prose-index="' + i + '"]');
                if ($c.hasClass('cc5-prose-hidden')) {
                    $c.removeClass('cc5-prose-hidden').removeAttr('aria-hidden');
                }
            }
            $grid.find('.cc5-prose-card').removeClass('cc5-prose-active');
            $card.addClass('cc5-prose-active');
            // The button on the card we just left has done its job.
            $grid.find('.cc5-prose-card[data-prose-index="' + (index - 1) + '"] .cc5-prose-next-btn')
                // v13.94.6: a spent button was retired by pointer-events:none only, which
                // leaves it focusable and still fires on Enter. Disable it for real.
                .addClass('cc5-prose-btn-used')
                .attr('aria-disabled', 'true')
                .prop('disabled', true);
            if (scrollTo && $card[0] && typeof $card[0].scrollIntoView === 'function') {
                try {
                    $card[0].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                } catch (e) {
                    $card[0].scrollIntoView(false);
                }
            }
        },

        /**
         * Reveal the three-activity block that follows the four prose cards.
         *
         * @param {Object} $grid jQuery wrapper for .cc5-prose-grid.
         * @return {void}
         */
        revealProseActivities: function ($grid) {
            // A length-0 set is not a usable anchor: nextAll() on it returns nothing and
            // a container-wide search would reveal an unrelated block if a slide ever
            // renders more than one section. Bail instead of guessing.
            if (!$grid || !$grid.length) { return; }
            var $block = $grid.nextAll('.cc5-prose-activities').first();
            if (!$block.length) { return; }
            $block.removeClass('cc5-prose-hidden').removeAttr('aria-hidden');
            // v13.94.6: same as above - keyboard-inert, not just pointer-inert.
            $grid.find('.cc5-prose-final-btn')
                 .addClass('cc5-prose-btn-used')
                 .attr('aria-disabled', 'true')
                 .prop('disabled', true);
            if ($block[0] && typeof $block[0].scrollIntoView === 'function') {
                try {
                    $block[0].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                } catch (e) {
                    $block[0].scrollIntoView(false);
                }
            }
        },

        /**
         * Lift the paragraph currently being narrated.
         *
         * @param {Object} $grid     jQuery wrapper for .cc5-prose-grid.
         * @param {Number} cardIndex Card holding the paragraph, or -1 to clear.
         * @param {Number} paraIndex Paragraph within that card, or -1 for none.
         * @return {void}
         */
        focusProseParagraph: function ($grid, cardIndex, paraIndex) {
            if (!$grid || !$grid.length) { return; }
            $grid.find('.cc5-prose-para.cc5-para-focus').removeClass('cc5-para-focus');
            if (cardIndex < 0 || paraIndex < 0) { return; }
            $grid.find('.cc5-prose-card[data-prose-index="' + cardIndex + '"]')
                 .find('.cc5-prose-para[data-para-index="' + paraIndex + '"]')
                 .addClass('cc5-para-focus');
        },

        /**
         * v13.94.4: stop the section narration because the learner advanced by hand.
         *
         * Pauses the audio, detaches the timeline sync so it cannot pull the reveal
         * backwards, and clears the "speaking" affordances. Cards already revealed stay
         * revealed - the learner keeps everything they have been given.
         *
         * @return {void}
         */
        /**
         * v13.94.7: SEEK the narration to a card, instead of stopping it.
         *
         * This replaces stopProseNarration(), which was wrong and is removed.
         *
         * v13.94.4 fixed a real complaint - clicking "Next Card" advanced the reveal while
         * card 1 was still being read over the top of card 2 - by stopping the audio. But
         * Topics and Text narrates the WHOLE section from ONE file, so stopping it left the
         * learner with no narration at all for cards 2 onward, and nothing to restart it.
         * A worse bug than the one it fixed.
         *
         * The audio is one continuous track with per-card boundaries already computed for
         * the reveal sync, so the correct behaviour was always to jump the playhead to
         * where that card's narration begins and keep playing. The learner skips ahead;
         * the voice follows them.
         *
         * @param {Object} $grid     The prose grid.
         * @param {Number} cardIndex Card the learner has just revealed.
         * @return {void}
         */
        seekProseNarrationToCard: function ($grid, cardIndex) {
            var sync = this._proseSync;
            var audio = this.currentAudio;
            if (!sync || !audio || !sync.segments || !sync.segments.length) {
                // No narration running - nothing to follow. The reveal still happened.
                return;
            }
            try {
                // Bounds are cumulative END times per segment, so the START of segment i
                // is bounds[i - 1]. Recompute if the sync has not built them yet (it does
                // so lazily on the first timeupdate, which may not have fired).
                if (!sync.bounds && typeof sync.computeBounds === 'function') {
                    sync.bounds = sync.computeBounds();
                }
                if (!sync.bounds || !sync.bounds.length) { return; }

                var target = -1;
                for (var i = 0; i < sync.segments.length; i++) {
                    if (sync.segments[i] && sync.segments[i].cardIndex === cardIndex) {
                        target = i;
                        break;
                    }
                }
                if (target < 0) { return; }

                var startAt = (target === 0) ? 0 : sync.bounds[target - 1];
                if (!isFinite(startAt) || startAt < 0) { return; }

                // Only ever jump FORWARD. If the narration is already past this card the
                // learner has heard it, and yanking the audio backwards would replay
                // content they have moved on from.
                if (startAt <= audio.currentTime) { return; }

                audio.currentTime = startAt;
                sync.lastSeg = target - 1;   // let the next tick re-enter the target segment
                if (audio.paused) {
                    var p = audio.play();
                    if (p && typeof p.catch === 'function') {
                        p.catch(function (e) {
                            ccWarn('[CC] could not resume narration after seek: '
                                + (e && e.message ? e.message : e));
                        });
                    }
                }
            } catch (e) {
                ccWarn('[CC] narration seek failed: ' + (e && e.message ? e.message : e));
            }
        },

        /**
         * v13.94.4: lock or unlock the manual reveal buttons for "must listen" mode.
         *
         * In PROGRESSION_MODES.VOICEOVER a card may not be advanced past by hand until
         * the narration has finished reading it. `passedCardIndex` is the highest card
         * the narration has completed; every button whose SOURCE card index is at or
         * below that is unlocked, the rest are locked.
         *
         * @param {Object} $grid          The prose grid.
         * @param {Number} passedCardIndex Highest card index the narration has finished.
         * @return {void}
         */
        applyProseGate: function ($grid, passedCardIndex) {
            if (!$grid || !$grid.length) { return; }
            // v13.94.8: :not(.cc5-prose-btn-used) on BOTH selectors. This matched every
            // button, so in voiceover mode each segment change re-enabled buttons
            // revealProseCard() had already retired - undoing the v13.94.6 fix that made a
            // spent button keyboard-inert, not merely pointer-inert. Also restores the
            // disabled property here, which this branch cleared the class and aria for but
            // never the property.
            if (this.progressionMode !== PROGRESSION_MODES.VOICEOVER) {
                $grid.find('.cc5-prose-next-btn:not(.cc5-prose-btn-used)')
                     .removeClass('cc5-prose-btn-locked')
                     .removeAttr('aria-disabled')
                     .prop('disabled', false)
                     .find('.cc5-prose-btn-lock').remove();
                return;
            }
            var lockLabel = getLabel('listenToUnlock');
            $grid.find('.cc5-prose-next-btn:not(.cc5-prose-btn-used)').each(function () {
                var $b = $(this);
                var $card = $b.closest('.cc5-prose-card');
                var srcIdx = parseInt($card.attr('data-prose-index'), 10);
                if (isNaN(srcIdx)) { return; }
                var unlocked = srcIdx <= passedCardIndex;
                if (unlocked) {
                    $b.removeClass('cc5-prose-btn-locked')
                      .removeAttr('aria-disabled')
                      .prop('disabled', false);
                    $b.find('.cc5-prose-btn-lock').remove();
                } else {
                    // v13.94.6: aria-disabled alone is advisory. The locked state has only
                    // cursor:not-allowed in CSS, so the button was clickable by mouse AND
                    // keyboard while the gate was supposed to be holding it.
                    $b.addClass('cc5-prose-btn-locked')
                      .attr('aria-disabled', 'true')
                      .prop('disabled', true);
                    if (!$b.find('.cc5-prose-btn-lock').length) {
                        $b.append($('<span class="cc5-prose-btn-lock"></span>').text(' - ' + lockLabel));
                    }
                }
            });
        },

        /**
         * Clear any running narration sync and its visual state.
         *
         * @return {void}
         */
        teardownVoiceoverSync: function () {
            if (this._proseSync && this._proseSync.audio) {
                try {
                    this._proseSync.audio.removeEventListener('timeupdate', this._proseSync.onTick);
                    this._proseSync.audio.removeEventListener('pause', this._proseSync.onPause);
                    this._proseSync.audio.removeEventListener('play', this._proseSync.onPlay);
                    this._proseSync.audio.removeEventListener('ended', this._proseSync.onEnded);
                    this._proseSync.audio.removeEventListener('error', this._proseSync.onError);
                } catch (e) {
                    // Audio element already gone; nothing to detach.
                }
            }
            if (this._proseSync && this._proseSync.$grid) {
                this._proseSync.$grid.find('.cc5-prose-para.cc5-para-focus').removeClass('cc5-para-focus');
                // v13.94.6: cc5-prose-active was added on reveal and removed only by the
                // NEXT reveal, so after the last card it stayed on forever - and its rule
                // is a persistent ring implying that card is still being narrated. The
                // three sibling state classes were all cleared here and this one was not.
                this._proseSync.$grid.find('.cc5-prose-card')
                    .removeClass('cc5-prose-speaking cc5-prose-active');
                this._proseSync.$grid.find('.cc5-prose-next-btn').removeClass('cc5-prose-btn-ready');
                // The card-level sync stores the cards themselves in $grid, so clear the
                // class on the set as well as inside it.
                this._proseSync.$grid.removeClass('cc5-vo-speaking');
                this._proseSync.$grid.find('.cc5-vo-speaking').removeClass('cc5-vo-speaking');
            }
            this._proseSync = null;
        },

        /**
         * Drive the card reveal and paragraph focus from the section's audio.
         *
         * @param {Object} audio   The HTMLAudioElement now playing.
         * @param {Object} section The manifest section being narrated.
         * @return {void}
         */
        /**
         * v13.92: the card-level half of the same idea, for the OTHER four routes.
         *
         * Topics-and-Text reveals cards and lifts the paragraph being read. The other
         * routes cannot do the paragraph half honestly - they narrate structural
         * sub-elements, and timing a five-word step title off a proportional split is
         * visibly loose - but "which card is being read" is a 60-110 word question, which
         * the same proportional split answers well. So those routes get the active-card
         * treatment and the green speaker, and nothing else: no reveal gating, because
         * their cards are interactive and their sequence is a narrative.
         *
         * The speaker chip is injected here rather than added to nine card renderers.
         * It only exists while a section is being narrated, and it lands in the flow
         * badge the unified cards already carry, or the card header on the legacy types.
         *
         * @param {Object} audio   The HTMLAudioElement now playing.
         * @param {Object} section The manifest section being narrated.
         * @return {void}
         */
        setupCardVoiceoverSync: function (audio, section) {
            if (!audio || !section || !CcState.buildCardVoiceoverSegments) { return; }

            var segments = CcState.buildCardVoiceoverSegments(section, this.manifest);
            if (!segments.length) { return; }

            var $cards = this.container.find('[data-vo-card]');
            if (!$cards.length) { return; }

            // Inject the chip once per card, into whichever header that card type has.
            var chip = '<span class="cc5-vo-chip" aria-hidden="true">'
                + '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" '
                + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
                + '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>'
                + '<path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>'
                + '<path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg></span>';
            $cards.each(function () {
                var $c = $(this);
                if ($c.find('.cc5-vo-chip, .cc5-prose-vo-dot').length) { return; }
                var $host = $c.children('.cc5-flow-badge').first();
                if (!$host.length) { $host = $c.children('.cc5-card-header').first(); }
                if ($host.length) { $host.append(chip); } else { $c.prepend(chip); }
            });

            // v13.94.6: same character fallback as the prose branch - see _voWeight().
            // v13.94.8: was `seg.words > 1 ? seg.words : _voWeight(...)`, so a Japanese
            // segment containing any whitespace - an embedded Latin acronym, or a
            // full-width U+3000 space, which \s matches - scored 2 instead of ~200 and
            // never reached the character fallback. Same weighting as the prose path.
            var weights = segments.map(function (seg) {
                return Math.max(1, _voWeight(seg.text));
            });
            var totalWeight = weights.reduce(function (a, b) { return a + b; }, 0);
            var FALLBACK_WPS = 2.6;

            var state = {
                audio: audio,
                $grid: $cards,
                segments: segments,
                bounds: null,
                estimated: false,
                lastSeg: -1,
                onTick: null,
                onPause: null,
                onPlay: null
            };

            var computeBounds = function () {
                var duration = audio.duration;
                var usable = !!duration && isFinite(duration) && duration > 0;
                state.estimated = !usable;
                if (!usable) { duration = totalWeight / FALLBACK_WPS; }
                var bounds = [];
                var acc = 0;
                for (var i = 0; i < weights.length; i++) {
                    acc += (weights[i] / totalWeight) * duration;
                    bounds.push(acc);
                }
                return bounds;
            };

            var mark = function (idx) {
                var seg = state.segments[idx];
                $cards.removeClass('cc5-vo-speaking');
                if (!seg) { return; }
                $cards.filter('[data-vo-card="' + seg.cardIndex + '"]').addClass('cc5-vo-speaking');
            };

            state.onTick = function () {
                if (!state.bounds || state.estimated) {
                    var recomputed = computeBounds();
                    if (recomputed) { state.bounds = recomputed; }
                    if (!state.bounds) { return; }
                }
                var t = audio.currentTime;
                var idx = 0;
                while (idx < state.bounds.length - 1 && t > state.bounds[idx]) { idx++; }
                if (idx === state.lastSeg) { return; }
                state.lastSeg = idx;
                mark(idx);
            };
            state.onPause = function () { $cards.removeClass('cc5-vo-speaking'); };
            state.onPlay  = function () { mark(state.lastSeg); };

            // v13.94.4: NO onEnded/onError here.
            //
            // An earlier v13.94.4 edit copied the prose branch's gate handlers into this
            // function, where they called applyProseGate($grid, ...) - but $grid is
            // declared in setupVoiceoverSync, not here; this function's element set is
            // $cards. Under 'use strict' that is a ReferenceError thrown out of the
            // 'ended' and 'error' listeners on EVERY section of the four card routes.
            // The reveal gate is a Route 5 concept and these routes have no prose buttons
            // to unlock, so the correct fix is not to pass $cards - it is to not have the
            // handlers at all.
            //
            // v13.94.8: the v13.94.6 edit rewrote this comment but left the two
            // addEventListener lines in place. state.onEnded/onError are undefined in this
            // function, so they were spec no-ops rather than the ReferenceError the
            // comment describes - dead cruft that read as working code. Now actually gone.

            audio.addEventListener('timeupdate', state.onTick);
            audio.addEventListener('pause', state.onPause);
            audio.addEventListener('play', state.onPlay);
            this._proseSync = state;
            mark(0);
            state.lastSeg = 0;
        },

        /**
         * Entry point: arm whichever narration sync this section can support.
         *
         * Topics-and-Text gets the fine-grained treatment - sequential card reveal plus
         * the paragraph being read lifted into focus. Every other route gets the
         * card-level one: which card is being narrated, and nothing else.
         *
         * @param {Object} audio   The HTMLAudioElement now playing.
         * @param {Object} section The manifest section being narrated.
         * @return {void}
         */
        setupVoiceoverSync: function (audio, section) {
            var self = this;
            this.teardownVoiceoverSync();
            if (!audio || !section) { return; }
            if (!CcState.isProseSection || !CcState.isProseSection(section)) {
                this.setupCardVoiceoverSync(audio, section);
                return;
            }

            // Address by section id when the section has one - the same reason
            // revealProseActivities() refuses to guess. Only one section renders per
            // slide today, so .first() is the correct fallback rather than a bug.
            var _sid = String(section.slideId || section.id || '');
            var $grid = _sid
                ? this.container.find('.cc5-prose-grid[data-section-id="' + _sid.replace(/"/g, '') + '"]').first()
                : $();
            if (!$grid.length) {
                $grid = this.container.find('.cc5-prose-grid[data-prose-seq]').first();
            }
            if (!$grid.length) { return; }

            var segments = CcState.buildProseVoiceoverSegments(section);
            if (!segments.length) { return; }

            // Word count per segment, floored at 1 so a one-word heading still gets a
            // slice of the timeline rather than a zero-length one.
            // v13.94.6: weight by CHARACTERS when the text has no word spacing.
            //
            // Japanese, Mandarin, Cantonese and Thai are all offered in the voice list and
            // none of them delimits words with spaces, so a 65-word-equivalent paragraph
            // counted as 1. Every segment then got weight 1 and the section split into
            // equal slices regardless of real length - the card reveal and the paragraph
            // lift landed essentially at random. Worse in the fallback path, where
            // duration = totalWeight / WPS put a three-minute section at five seconds.
            var weights = segments.map(function (seg) {
                return Math.max(1, _voWeight(seg.text));
            });
            var totalWeight = weights.reduce(function (a, b) { return a + b; }, 0);

            var state = {
                audio: audio,
                $grid: $grid,
                segments: segments,
                weights: weights,
                totalWeight: totalWeight,
                bounds: null,
                estimated: false,
                lastSeg: -1,
                onTick: null,
                onPause: null,
                onPlay: null
            };

            // Words per second of synthesised speech. Only used when the audio element
            // will not tell us its duration - see computeBounds().
            var FALLBACK_WPS = 2.6;

            // Cumulative end time of each segment.
            //
            // audio.duration is NaN until metadata loads, which is why this is computed
            // lazily on the first usable tick rather than up front. It can also be
            // Infinity forever: audio is played from a base64 data URL, and an Ogg or
            // WebM stream served without a duration header reports Infinity in Chrome and
            // never resolves. Returning null in that case would mean NO card ever
            // reveals, no paragraph ever lifts and no speaker ever pulses for the whole
            // section - an all-or-nothing failure, not the graceful drift this is
            // supposed to degrade into. So an unusable duration falls back to a
            // words-per-second estimate, which is what the proportional split
            // approximates anyway.
            var computeBounds = function () {
                var duration = audio.duration;
                var usable = !!duration && isFinite(duration) && duration > 0;
                state.estimated = !usable;
                if (!usable) {
                    duration = totalWeight / FALLBACK_WPS;
                }
                var bounds = [];
                var acc = 0;
                for (var i = 0; i < weights.length; i++) {
                    acc += (weights[i] / totalWeight) * duration;
                    bounds.push(acc);
                }
                return bounds;
            };

            // v13.94.7: expose the bounds builder so seekProseNarrationToCard() can force
            // it. Bounds are built lazily on the first timeupdate, and a learner can click
            // "Next Card" before that has fired.
            state.computeBounds = computeBounds;

            // v13.94.8: RELEASE THE GATE when the narration cannot play.
            //
            // setupVoiceoverSync ends by locking every "Next Card" button with
            // applyProseGate($grid, -1), and until now the only things that could unlock
            // them were onTick (needs the audio to advance) and the section's onended.
            // `state.onError` was REGISTERED at addEventListener but never assigned - so
            // the listener was undefined, a spec no-op, and dead. A learner in "must
            // listen" mode whose audio 404s or fails to decode was locked out of cards 2
            // onward and the whole activity block for the rest of the slide, recoverable
            // only by navigating away. Audio that cannot play cannot be listened to.
            state.onError = function () {
                ccWarn('[CC] section narration failed to load - releasing the reveal gate');
                self.applyProseGate($grid, state.segments.length);
            };

            // Once the section has been narrated to the end every card has been read, so
            // nothing stays gated - and the greyed "listen to unlock" pills go away.
            state.onEnded = function () {
                self.applyProseGate($grid, state.segments.length);
            };

            state.onTick = function () {
                // Recompute while the bounds are only an estimate: Chrome reports
                // Infinity for a header-less Ogg/WebM data URL at first, and may resolve
                // a real duration moments later. Caching the guess forever would run the
                // whole section off a words-per-second approximation even when the exact
                // figure was available a beat later.
                if (!state.bounds || state.estimated) {
                    var recomputed = computeBounds();
                    if (recomputed) { state.bounds = recomputed; }
                    if (!state.bounds) { return; }
                }
                var t = audio.currentTime;
                var idx = 0;
                while (idx < state.bounds.length - 1 && t > state.bounds[idx]) { idx++; }
                if (idx === state.lastSeg) { return; }
                state.lastSeg = idx;
                var seg = state.segments[idx];
                if (!seg) { return; }
                self.revealProseCard($grid, seg.cardIndex, false);
                self.focusProseParagraph($grid, seg.cardIndex, seg.kind === 'para' ? seg.paraIndex : -1);
                // Green pulsing speaker on the card being read, and only that card.
                $grid.find('.cc5-prose-card').removeClass('cc5-prose-speaking');
                var $speaking = $grid.find('.cc5-prose-card[data-prose-index="' + seg.cardIndex + '"]');
                $speaking.addClass('cc5-prose-speaking');
                // v13.92: the moment the previous card's narration finished, this card slid
                // in - so nudge its button too, or a learner listening rather than watching
                // has no signal that there is something to click.
                $grid.find('.cc5-prose-next-btn').removeClass('cc5-prose-btn-ready');
                $speaking.find('.cc5-prose-next-btn:not(.cc5-prose-btn-used)')
                         .addClass('cc5-prose-btn-ready');
                // v13.94.4: in "must listen" mode the manual reveal unlocks card by card
                // as the narration finishes each one. Reaching a segment on card N means
                // every card before N has been read in full, so N-1 is the highest card
                // the learner may advance past by hand.
                self.applyProseGate($grid, seg.cardIndex - 1);
            };

            // v13.92: while the learner has the audio paused, nothing is being narrated -
            // so the green speaker must stop pulsing and the button must stop nudging.
            // Both resume on play. The card stays revealed and the paragraph stays
            // highlighted, which is the correct reading of "paused here".
            state.onPause = function () {
                $grid.find('.cc5-prose-card').removeClass('cc5-prose-speaking');
                $grid.find('.cc5-prose-next-btn').removeClass('cc5-prose-btn-ready');
            };
            state.onPlay = function () {
                var seg = state.segments[state.lastSeg];
                if (!seg) { return; }
                var $card = $grid.find('.cc5-prose-card[data-prose-index="' + seg.cardIndex + '"]');
                $card.addClass('cc5-prose-speaking');
                // Restore the button nudge too. onTick only re-applies it when the
                // segment index CHANGES, so resuming mid-segment would otherwise leave it
                // off until the next segment boundary - or for good, on the last one.
                $card.find('.cc5-prose-next-btn:not(.cc5-prose-btn-used)')
                     .addClass('cc5-prose-btn-ready');
            };

            // v13.94.4: NO onEnded/onError here.
            //
            // An earlier v13.94.4 edit copied the prose branch's gate handlers into this
            // function, where they called applyProseGate($grid, ...) - but $grid is
            // declared in setupVoiceoverSync, not here; this function's element set is
            // $cards. Under 'use strict' that is a ReferenceError thrown out of the
            // 'ended' and 'error' listeners on EVERY section of the four card routes.
            // The reveal gate is a Route 5 concept and these routes have no prose buttons
            // to unlock, so the correct fix is not to pass $cards - it is to not have the
            // handlers at all.

            audio.addEventListener('timeupdate', state.onTick);
            audio.addEventListener('pause', state.onPause);
            audio.addEventListener('play', state.onPlay);
            audio.addEventListener('ended', state.onEnded);
            audio.addEventListener('error', state.onError);
            this._proseSync = state;

            // Card 1 is on screen from the start; mark it active so it reads as the
            // one in play rather than as one of four identical cards.
            this.revealProseCard($grid, 0, false);
            // v13.94.4: nothing has been narrated yet, so in "must listen" mode no card
            // can be advanced past. -1 locks every button.
            this.applyProseGate($grid, -1);
        },

        renderRouteCard: function (section, seqOpts) { return CcCardSlots.renderRouteCard(section, seqOpts); },
        renderBeforeYouStartCard: function (checklistItems) { return CcCardSlots.renderBeforeYouStartCard(checklistItems); },
        renderDocActivity: function (docActivity) { return CcCardSlots.renderDocActivity(docActivity); },
        renderAccentCards: function (section, linkedDocsTracker) { return CcCardSlots.renderAccentCards(section, linkedDocsTracker); },

        // ===================================================================
        // WORLD-CLASS TOPIC-END ACTIVITIES (v6.3.0)
        // ===================================================================

        /**
         * Render any activity type by dispatching to specific renderer
         */
        renderActivity: function (activity) {
            if (!activity || !activity.activityType) return '';
            
            switch (activity.activityType) {
                case 'scenario-branching':
                    return this.renderScenarioBranchingActivity(activity);
                case 'best-response':
                    return this.renderBestResponseActivity(activity);
                case 'what-went-wrong':
                    return this.renderWhatWentWrongActivity(activity);
                case 'task-sequencing':
                    return this.renderSequencingActivity(activity);
                case 'escalation-decision':
                    return this.renderEscalationActivity(activity);
                case 'micro-reflection':
                    return this.renderReflectionActivity(activity);
                default:
                    return this.renderLegacyActivity(activity);
            }
        },

        /**
         * 1. SCENARIO BRANCHING (FLAGSHIP)
         * v6.6.63: World-class improvements - progress indicator, visual feedback icons
         */
        renderScenarioBranchingActivity: function (activity) { return CcActivities.renderScenarioBranchingActivity(activity); },

        /**
         * 2. BEST RESPONSE ANALYSIS
         * v6.6.63: World-class improvements - think first prompt, progress, score summary
         */
        renderBestResponseActivity: function (activity) { return CcActivities.renderBestResponseActivity(activity); },

        /**
         * 3. WHAT WENT WRONG CASE ANALYSIS
         * v6.6.63: World-class improvements - think first prompt, progress, enhanced visuals
         * v7.2.53: Added icon debugging
         */
        renderWhatWentWrongActivity: function (activity) { return CcActivities.renderWhatWentWrongActivity(activity); },

        /**
         * 4. TASK SEQUENCING (v6.6.58 - Complete rebuild with interactive reordering)
         * Features:
         * - Steps displayed in SCRAMBLED order initially
         * - Mobile: Up/down arrow buttons (48px touch targets)
         * - Desktop: Drag-and-drop support
         * - Check Answer button with feedback
         * - Correct/incorrect visual indicators
         */
        renderSequencingActivity: function (activity) { return CcActivities.renderSequencingActivity(activity); },

        /**
         * 5. ESCALATION DECISION
         * v6.6.63: World-class improvements - progress indicator, score summary
         */
        renderEscalationActivity: function (activity) { return CcActivities.renderEscalationActivity(activity); },

        /**
         * 6. MICRO-REFLECTION
         * v6.6.63: World-class improvements - focus area icons, progress, enhanced styling
         */
        renderReflectionActivity: function (activity) { return CcActivities.renderReflectionActivity(activity); },

        /**
         * Render legacy activity types (backward compatibility)
         */
        renderLegacyActivity: function (activity) { return CcActivities.renderLegacyActivity(activity); },

        /**
         * Get section icon using comprehensive contextual mapping (v6.5.30)
         * Unified function for all slide types - now uses 60+ keyword mappings
         */
        getSectionIcon: function (section) {
            // Use the comprehensive contextual icon function
            return getContextualSlideIcon(section.title, section.description);
        },

        /**
         * Show tutorial overlay on first slide
         * v6.5.11: Adjust message based on voiceover enabled state
         */
        showTutorial: function () {
            this.tutorialShown = true;
            
            var message = '';
            switch (this.progressionMode) {
                case PROGRESSION_MODES.VOICEOVER:
                    message = getLabel('listenToVoiceoverMessage');
                    break;
                case PROGRESSION_MODES.TIMED:
                    message = 'Each slide requires <strong>' + this.slideDuration + ' seconds</strong> of reading time before you can continue.';
                    break;
                default:
                    // v6.5.11: Only mention voiceover if enabled
                    if (this.voiceoverEnabled) {
                        message = getLabel('navigateSlidesMessage');
                        message = getLabel('navigateSlidesNoVoiceover');
                    }
            }
            
            var html = '<div class="cc5-tutorial-overlay">';
            html += '<div class="cc5-tutorial-card">';
            html += '<div class="cc5-tutorial-icon">' + getIcon('info') + '</div>';
            html += '<h3 class="cc5-tutorial-title">' + getLabel('welcome') + '</h3>';
            html += '<p class="cc5-tutorial-message">' + message + '</p>';
            html += '<button type="button" class="cc5-tutorial-btn" data-action="dismiss-tutorial">' + getLabel('gotIt') + '</button>';
            html += '</div>';
            html += '</div>';
            
            this.container.append(html);
            
            // Store that tutorial was shown
            try {
                localStorage.setItem('cc5_tutorial_' + this.cmid, 'shown');
            } catch (e) {
                // Cosmetic only: without storage the tutorial is simply shown again next time.
                ccLog('Tutorial-shown flag could not be stored', e);
            }
        },

        /**
         * Check if user can navigate to next slide (v6.4.4)
         * v6.6.57: Activity slides are always navigable (no voiceover requirement)
         * v6.6.62: Activity slides now require completion before navigation
         */
        canNavigateNext: function (section) {
            if (!section) return false;

            // v13.45 FIX-ADMIN-UNLOCK: Editors and teachers can always click through slides freely.
            // "Must listen" and "Sequential" restrictions are student-only — admins in edit mode
            // should never be blocked when checking generated content.
            if (this.editMode || this.canEdit) return true;
            
            // If section is already complete, always allow (use slideId for expanded sections)
            if (this.isSectionComplete(section.slideId || section.id)) return true;
            
            // v6.6.62: Activity slides require completion
            if (section.slideType === 'activity') {
                var slideId = section.slideId || section.id;
                var activityOk = this.isActivityComplete(section, slideId);
                // v8.4.6: If voiceover mode, also require voiceover even on activity slides
                if (this.progressionMode === PROGRESSION_MODES.VOICEOVER && !this.voiceoverPlayed) {
                    // Activity slides may not have voiceover - only block if voiceover exists
                    // Activity slides typically don't have voiceover, so skip voiceover check for them
                }
                return activityOk;
            }
            
            // v8.4.6: For learning slides, check BOTH progression mode AND requireFullScore
            switch (this.progressionMode) {
                case PROGRESSION_MODES.VOICEOVER:
                    if (!this.voiceoverPlayed) return false;
                    if (this.requireFullScore && section.activity && section.activity.activityType) {
                        var lSlideId = section.slideId || section.id;
                        if (!this.isActivityComplete(section, lSlideId)) return false;
                    }
                    return true;
                case PROGRESSION_MODES.TIMED:
                    if (this.slideTimeRemaining > 0) return false;
                    if (this.requireFullScore && section.activity && section.activity.activityType) {
                        var tSlideId = section.slideId || section.id;
                        if (!this.isActivityComplete(section, tSlideId)) return false;
                    }
                    return true;
                default:
                    if (this.requireFullScore && section.activity && section.activity.activityType) {
                        var fSlideId = section.slideId || section.id;
                        if (!this.isActivityComplete(section, fSlideId)) return false;
                    }
                    return true;
            }
        },
        
        /**
         * v6.6.62: Check if an activity slide is complete
         * Each activity type has different completion criteria
         */
        isActivityComplete: function (section, slideId) {
            var self = this;
            
            // Already marked complete
            if (this.activityCompleted[slideId]) return true;
            
            var activity = section.activity;
            if (!activity || !activity.activityType) return true; // No activity = complete
            
            var activityType = activity.activityType;
            var $container = this.container;
            var isComplete = false;
            
            switch (activityType) {
                case 'scenario-branching':
                    // All decision points must be answered
                    var $decisionPoints = $container.find('.cc5-scenario-branching .cc5-decision-point');
                    if ($decisionPoints.length === 0) {
                        isComplete = true;
                        var $answered = $decisionPoints.filter('.cc5-answered');
                        isComplete = $answered.length === $decisionPoints.length;
                    }
                    break;
                    
                case 'best-response':
                    // All response items must be revealed
                    var $responseItems = $container.find('.cc5-best-response .cc5-response-item');
                    if ($responseItems.length === 0) {
                        isComplete = true;
                        var $revealed = $responseItems.filter('.cc5-revealed');
                        isComplete = $revealed.length === $responseItems.length;
                    }
                    break;
                    
                case 'what-went-wrong':
                    // All details elements must be opened (checked via [open] attribute)
                    var $details = $container.find('.cc5-what-went-wrong details.cc5-model-answer');
                    if ($details.length === 0) {
                        isComplete = true;
                        var $opened = $details.filter('[open]');
                        isComplete = $opened.length === $details.length;
                    }
                    break;
                    
                case 'task-sequencing':
                    // Check Order button must have been clicked
                    var $sequenceSteps = $container.find('.cc5-sequencing .cc5-sequence-steps');
                    if ($sequenceSteps.length === 0) {
                        isComplete = true;
                        isComplete = $sequenceSteps.attr('data-checked') === 'true';
                    }
                    break;
                    
                case 'escalation-decision':
                    // All situation items must have a decision made
                    var $situationItems = $container.find('.cc5-escalation .cc5-situation-item');
                    if ($situationItems.length === 0) {
                        isComplete = true;
                        var $decided = $situationItems.filter(function () {
                            return $(this).find('.cc5-decision-btn.cc5-selected').length > 0;
                        });
                        isComplete = $decided.length === $situationItems.length;
                    }
                    break;
                    
                case 'micro-reflection':
                    // All reflection prompts must have minimum word count
                    var $textareas = $container.find('.cc5-reflection .cc5-reflection-input');
                    if ($textareas.length === 0) {
                        isComplete = true;
                        var allMeetMinimum = true;
                        $textareas.each(function () {
                            var text = $(this).val() || '';
                            var wordCount = self.countWords(text);
                            if (wordCount < self.reflectionMinWords) {
                                allMeetMinimum = false;
                                return false; // break
                            }
                        });
                        isComplete = allMeetMinimum;
                    }
                    break;
                    
                default:
                    isComplete = true;
            }
            
            // v6.7.32: If requireFullScore is enabled, check for perfect score on scored activities
            if (isComplete && this.requireFullScore) {
                var hasPerfectScore = this.checkActivityPerfectScore(activityType, $container);
                if (!hasPerfectScore) {
                    // Activity is answered but not perfect - don't mark as complete
                    return false;
                }
            }
            
            // Cache completion status
            if (isComplete) {
                this.activityCompleted[slideId] = true;
            }
            
            return isComplete;
        },
        
        /**
         * v6.7.32: Check if activity has perfect score
         */
        checkActivityPerfectScore: function (activityType, $container) {
            switch (activityType) {
                case 'scenario-branching':
                    var $points = $container.find('.cc5-scenario-branching .cc5-decision-point');
                    var correctCount = $points.filter('.cc5-answered-correct').length;
                    return correctCount === $points.length;
                    
                case 'escalation-decision':
                    var $situations = $container.find('.cc5-escalation .cc5-situation-item');
                    var correctDecisions = $situations.filter(function () {
                        var $selected = $(this).find('.cc5-decision-btn.cc5-selected');
                        return $selected.attr('data-correct') === 'true';
                    }).length;
                    return correctDecisions === $situations.length;
                    
                case 'task-sequencing':
                    var $steps = $container.find('.cc5-sequencing .cc5-sequence-steps');
                    return $steps.attr('data-correct') === 'true';
                    
                default:
                    // Non-scored activities (best-response, what-went-wrong, reflection) are always "perfect"
                    return true;
            }
        },
        
        /**
         * v6.6.62: Count words in text (handles multiple languages)
         */
        countWords: function (text) {
            if (!text || typeof text !== 'string') return 0;
            text = text.trim();
            if (text === '') return 0;
            
            // For languages with spaces (English, Spanish, etc.)
            var words = text.split(/\s+/);
            return words.length;
        },
        
        /**
         * v6.6.62: Get activity-specific incomplete warning message
         */
        getActivityIncompleteMessage: function (section) {
            if (!section.activity) return getLabel('activityIncomplete');
            
            var activityType = section.activity.activityType;
            switch (activityType) {
                case 'scenario-branching':
                    return getLabel('scenarioIncomplete');
                case 'best-response':
                    return getLabel('bestResponseIncomplete');
                case 'what-went-wrong':
                    return getLabel('wwwIncomplete');
                case 'task-sequencing':
                    return getLabel('sequencingIncomplete');
                case 'escalation-decision':
                    return getLabel('escalationIncomplete');
                case 'micro-reflection':
                    return getLabel('reflectionIncomplete');
                default:
                    return getLabel('activityIncomplete');
            }
        },
        
        /**
         * v6.6.62: Show activity incomplete warning toast
         */
        showActivityWarning: function (message) {
            var self = this;
            
            // Remove any existing warning
            this.container.find('.cc5-activity-warning').remove();
            
            var html = '<div class="cc5-activity-warning">';
            html += '<div class="cc5-warning-icon">' + getIcon('alert-circle') + '</div>';
            html += '<span class="cc5-warning-text">' + escapeHtml(message) + '</span>';
            html += '</div>';
            
            this.container.append(html);
            
            // Auto-dismiss after 4 seconds
            setTimeout(function () {
                self.container.find('.cc5-activity-warning').addClass('cc5-fade-out');
                setTimeout(function () {
                    self.container.find('.cc5-activity-warning').remove();
                }, 300);
            }, 4000);
        },

        /**
         * Start slide timer for timed progression
         */
        startSlideTimer: function () {
            var self = this;
            
            if (this.slideTimer) {
                return;
            }
            
            this.slideTimeRemaining = this.slideDuration;
            
            this.slideTimer = setInterval(function () {
                self.slideTimeRemaining--;
                var $timer = self.container.find('#cc5-timer .cc5-timer-value');
                $timer.text(self.slideTimeRemaining + 's');
                
                if (self.slideTimeRemaining <= 0) {
                    clearInterval(self.slideTimer);
                    self.slideTimer = null;
                    // Enable next button
                    self.container.find('.cc5-nav-chevron.cc5-next').removeClass('cc5-disabled').prop('disabled', false);
                    // Mark section as viewed (v6.4.4 - use slideId for expanded sections)
                    var sections = self.getCurrentSections();
                    if (sections[self.currentSlideIndex]) {
                        var currentSection = sections[self.currentSlideIndex];
                        self.markSectionComplete(currentSection.slideId || currentSection.id);
                    }
                }
            }, 1000);
        },

        /**
         * Get sections for current topic (v6.4.4)
         * Expands sections with activities into interleaved learning + activity slides
         * Structure: Learning 1  ->  Activity 1  ->  Learning 2  ->  Activity 2  ->  ...
         */
        /**
         * v13.94.6: id of the section the learner is looking at right now.
         *
         * Used to discard a narration request that resolved after the learner moved on.
         * Suffix-stripped, because getCurrentSections() expands each manifest section into
         * interleaved `<id>_learning` / `<id>_activity` slides while the voiceover is keyed
         * on the manifest base id - comparing the two forms directly would reject every
         * request as stale.
         *
         * @return {String|null} Base section id, or null when there is no current slide.
         */
        getCurrentSectionId: function () {
            var sections = this.getCurrentSections();
            var cur = sections && sections[this.currentSlideIndex];
            if (!cur || !cur.id) { return null; }
            return String(cur.id).replace(/_learning$|_activity$/, '');
        },

        getCurrentSections: function () {
            var self = this;
            // FIX-CC-TOPIC-FIND (v12.94): Mirror the String() coercion from renderSlideView so
            // getCurrentSections always resolves the same topic regardless of numeric vs string ID.
            var _ctid = String(self.currentTopicId);
            var topic = this.manifest.topics?.find(function (t) { return String(t.id) === _ctid; });
            var rawSections = topic?.sections || [];
            
            // Expand into interleaved learning + activity slides
            var expandedSections = [];
            rawSections.forEach(function (section, index) {
                // Learning slide (always present)
                expandedSections.push({
                    ...section,
                    slideType: 'learning',
                    slideId: section.id + '_learning',
                    originalIndex: index
                });
                
                // Activity slide (only if section has activity)
                if (section.activity && section.activity.activityType) {
                    expandedSections.push({
                        ...section,
                        slideType: 'activity',
                        slideId: section.id + '_activity',
                        originalIndex: index,
                        // Activity slide title includes translated "Activity:" prefix
                        displayTitle: getLabel('activityPrefix') + ' ' + section.title
                    });
                }
            });
            
            return expandedSections;
        },

        /**
         * Check if all expanded slides are complete (v6.4.4)
         * Used for interleaved learning + activity mode
         */
        areAllExpandedSlidesComplete: function (expandedSections) {
            var self = this;
            if (!expandedSections || expandedSections.length === 0) return true;
            return expandedSections.every(function (section) {
                return self.isSectionComplete(section.slideId || section.id);
            });
        },

        /**
         * Check if section is complete
         */
        isSectionComplete: function (sectionId) {
            return this.progress.sections[sectionId]?.complete === true;
        },

        /**
         * Mark section as complete
         */
        markSectionComplete: function (sectionId) {
            if (!this.progress.sections[sectionId]) {
                this.progress.sections[sectionId] = {};
            }
            this.progress.sections[sectionId].complete = true;
            this.progress.sections[sectionId].contentComplete = true;
            this.progress.sections[sectionId].activityComplete = true;
            this.saveProgress();
            
            // Update UI indicator
            var $indicator = this.container.find('.cc5-slide-indicator[data-slide-index="' + this.currentSlideIndex + '"]');
            if (!$indicator.hasClass('cc5-complete')) {
                $indicator.addClass('cc5-complete');
                $indicator.prepend('<svg class="cc5-indicator-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>');
            }
            
            // Check if all slides complete and play celebration sound (v6.4.4 - use expanded sections)
            // v6.7.54: Back button is always enabled, just play completion sound
            var expandedSections = this.getCurrentSections();
            if (this.areAllExpandedSlidesComplete(expandedSections)) {
                this.playTopicCompleteSound();
            }
        },

        /**
         * Play success chime when all slides in a topic are complete
         */
        playTopicCompleteSound: function () {
            try {
                var AudioContext = window.AudioContext || window.webkitAudioContext;
                if (!AudioContext) return;
                
                var ctx = new AudioContext();
                var now = ctx.currentTime;
                
                // Create a pleasant 3-note ascending chime (C5, E5, G5)
                var notes = [523.25, 659.25, 783.99]; // C5, E5, G5 frequencies
                var duration = 0.15;
                var gap = 0.08;
                
                notes.forEach(function (freq, i) {
                    var osc = ctx.createOscillator();
                    var gain = ctx.createGain();
                    
                    osc.type = 'sine';
                    osc.frequency.value = freq;
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    
                    var startTime = now + (i * (duration + gap));
                    gain.gain.setValueAtTime(0, startTime);
                    gain.gain.linearRampToValueAtTime(0.3, startTime + 0.02);
                    gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
                    
                    osc.start(startTime);
                    osc.stop(startTime + duration);
                });
                
                // Close audio context after sound completes
                setTimeout(function () { ctx.close(); }, 800);
            } catch (e) {
                // Web Audio is decorative here; a browser that blocks or lacks AudioContext
                // just plays no sound effect.
                ccLog('Sound effect could not be played', e);
            }
        },

        /**
         * Check if all slides in topic are complete (v6.4.4)
         * Checks both learning and activity slides for each section
         */
        areAllSlidesComplete: function (topic) {
            var self = this;
            var sections = topic.sections || [];
            if (sections.length === 0) return true;
            
            return sections.every(function (section) {
                // Check learning slide
                var learningComplete = self.isSectionComplete(section.id + '_learning');
                // Check activity slide if present
                var activityComplete = true;
                if (section.activity && section.activity.activityType) {
                    activityComplete = self.isSectionComplete(section.id + '_activity');
                }
                return learningComplete && activityComplete;
            });
        },

        /**
         * Calculate overall progress percentage (v6.4.4)
         * Uses expanded sections to count both learning and activity slides
         */
        calculateOverallProgress: function () {
            var topics = this.manifest.topics || [];
            if (!topics.length) return 0;
            
            var totalSlides = 0;
            var completedSlides = 0;
            var self = this;
            
            topics.forEach(function (topic) {
                // Expand sections to get true slide count
                var rawSections = topic.sections || [];
                rawSections.forEach(function (section) {
                    // Learning slide
                    totalSlides++;
                    if (self.isSectionComplete(section.id + '_learning')) {
                        completedSlides++;
                    }
                    // Activity slide (if section has activity)
                    if (section.activity && section.activity.activityType) {
                        totalSlides++;
                        if (self.isSectionComplete(section.id + '_activity')) {
                            completedSlides++;
                        }
                    }
                });
            });
            
            return totalSlides ? Math.round((completedSlides / totalSlides) * 100) : 0;
        },

        /**
         * Calculate progress for a specific topic (v6.4.4)
         * Uses expanded sections to count both learning and activity slides
         */
        calculateTopicProgress: function (topic) {
            var rawSections = topic.sections || [];
            if (!rawSections.length) return 0;
            
            var totalSlides = 0;
            var completedSlides = 0;
            var self = this;
            
            rawSections.forEach(function (section) {
                // Learning slide
                totalSlides++;
                if (self.isSectionComplete(section.id + '_learning')) {
                    completedSlides++;
                }
                // Activity slide (if section has activity)
                if (section.activity && section.activity.activityType) {
                    totalSlides++;
                    if (self.isSectionComplete(section.id + '_activity')) {
                        completedSlides++;
                    }
                }
            });
            
            return Math.round((completedSlides / totalSlides) * 100);
        },

        /**
         * Count slides with generated: false (v6.6.15)
         * These are slides where AI generation failed and fallback content was used
         */
        countFailedSlides: function () {
            var manifest = this.manifest;
            var topics = manifest.topics || [];
            var failedCount = 0;
            
            topics.forEach(function (topic) {
                var sections = topic.sections || [];
                sections.forEach(function (section) {
                    // Check if main section content failed (section-level flag OR any card has failed:true)
                    // v13.90.1: needsReview marks a section whose content was KEPT after
                    // exhausting its generation attempts rather than replaced with
                    // placeholders. It renders normally, but it still needs the author's
                    // attention and must stay retryable, so it counts here too - otherwise
                    // the Regenerate button never appears for it and the flag is inert.
                    if (section.generated === false || (section.cards && section.cards.some(function (c) {
                        return c.failed || c.needsReview;
                    }))) {
                        failedCount++;
                    }
                    // Check scenario
                    if (section.scenario && section.scenario.generated === false) {
                        failedCount++;
                    }
                    // Check activity
                    if (section.activity && section.activity.generated === false) {
                        failedCount++;
                    }
                });
            });
            
            return failedCount;
        },

        // ===========================================================================
        // EXPORT FUNCTIONS (v6.6.66) - PDF and Text export for offline teaching
        // ===========================================================================

        /**
         * Extract all text content from manifest for export (v6.6.66)
         * Creates a nicely formatted text document with good line spacing
         */
        extractAllTextContent: function () {
            var manifest = this.manifest;
            var topics = manifest.topics || [];
            var lines = [];
            
            // Header
            lines.push('===================================================================');
            lines.push(manifest.context?.topic || 'Learning Content');
            if (manifest.context?.unitCode) {
                lines.push(manifest.context.unitCode + ' - ' + (manifest.context.unitTitle || ''));
            }
            lines.push('===================================================================');
            lines.push('');
            lines.push('');
            
            topics.forEach(function (topic, topicIdx) {
                // Topic header
                lines.push('-------------------------------------------------------------------');
                lines.push(getLabel('topicLabel') + ' ' + (topicIdx + 1) + ': ' + fixGrammar(sanitizeTopicTitle(topic.title)));
                lines.push('-------------------------------------------------------------------');
                if (topic.description) {
                    lines.push(fixGrammar(topic.description));
                }
                lines.push('');
                
                var sections = topic.sections || [];
                sections.forEach(function (section, secIdx) {
                    // Section header
                    lines.push('');
                    lines.push('> ' + getLabel('learningSlide') + ' ' + (topicIdx + 1) + '.' + (secIdx + 1) + ': ' + fixGrammar(section.title));
                    lines.push('');
                    
                    if (section.voiceoverText) {
                        lines.push((getLabel('introduction') || 'Introduction') + ':');
                        var introSentences = fixIntroSentences(section.voiceoverText);
                        lines.push('  ' + fixGrammar(introSentences.join(' ')));
                        lines.push('');
                    } else if (section.description) {
                        lines.push(fixGrammar(section.description));
                        lines.push('');
                    }
                    
                    // Key Requirements
                    if (section.requirements && section.requirements.length) {
                        lines.push(getLabel('keyRequirementsTitle') + ':');
                        section.requirements.forEach(function (req) {
                            lines.push('  * ' + fixGrammar(req.text || req));
                        });
                        lines.push('');
                    }
                    
                    var positiveItems = section.positiveList || section.doList || [];
                    if (positiveItems.length) {
                        var contrastConfig = getContrastPair(CcState.sectionContrastType(section));
                        lines.push(contrastConfig.positive + ':');
                        positiveItems.forEach(function (item) {
                            lines.push('  OK ' + fixGrammar(item));
                        });
                        lines.push('');
                    }
                    
                    var negativeItems = section.negativeList || section.dontList || [];
                    if (negativeItems.length) {
                        var contrastConfig2 = getContrastPair(CcState.sectionContrastType(section));
                        lines.push(contrastConfig2.negative + ':');
                        negativeItems.forEach(function (item) {
                            lines.push('  x ' + fixGrammar(item));
                        });
                        lines.push('');
                    }
                    
                    var combinedTerms = getTerminology(section);
                    if (combinedTerms.length > 0) {
                        lines.push((getLabel('keyTerms') || 'Key Terms') + ':');
                        combinedTerms.forEach(function (term) {
                            lines.push('  ' + (term.term || '') + ': ' + fixGrammar(term.definition || ''));
                        });
                        lines.push('');
                    }
                    
                    if (section.keyTakeaway) {
                        lines.push((getLabel('keyTakeaway') || 'Key Takeaway') + ': ' + fixGrammar(section.keyTakeaway));
                        lines.push('');
                    }
                    if (section.proTip) {
                        lines.push((getLabel('proTip') || 'Pro Tip') + ': ' + fixGrammar(section.proTip));
                        lines.push('');
                    }
                    if (section.keyInfo || section.didYouKnow) {
                        var infoLabel = section.didYouKnow ? (getLabel('didYouKnow') || 'Did You Know?') : (getLabel('keyInfo') || 'Key Information');
                        lines.push(infoLabel + ': ' + fixGrammar(section.keyInfo || section.didYouKnow));
                        lines.push('');
                    }
                    if (section.expertInsight) {
                        lines.push((getLabel('expertInsight') || 'Expert Insight') + ': ' + fixGrammar(section.expertInsight));
                        lines.push('');
                    }
                    
                    if (section.scenario) {
                        lines.push(getLabel('workplaceScenario') + ':');
                        if (section.scenario.title || section.scenario.scenarioTitle) {
                            lines.push('  ' + fixGrammar(section.scenario.title || section.scenario.scenarioTitle));
                        }
                        if (section.scenario.role) {
                            lines.push('  ' + fixGrammar(capitalizeFirst(section.scenario.role)));
                        }
                        if (section.scenario.context) {
                            lines.push('  ' + fixGrammar(section.scenario.context));
                        }
                        if (section.scenario.complication) {
                            lines.push('  ' + fixGrammar(section.scenario.complication));
                        }
                        var mmObj = section.scenario.mentalModel || null;
                        if (mmObj) {
                            var mmName = (typeof mmObj === 'string') ? mmObj : (mmObj.name || mmObj.concept || '');
                            var mmPrinciple = (typeof mmObj === 'object') ? (mmObj.principle || mmObj.application || '') : '';
                            if (mmName) {
                                lines.push('  Mental Model: ' + fixGrammar(mmName));
                                if (mmPrinciple) lines.push('    ' + fixGrammar(mmPrinciple));
                            }
                        }
                        var predObj = section.scenario.predictionPrompt || null;
                        if (predObj) {
                            var predQ = (typeof predObj === 'string') ? predObj : (predObj.question || '');
                            var predOpts = (typeof predObj === 'object' && Array.isArray(predObj.options)) ? predObj.options : [];
                            if (predQ) {
                                lines.push('  Prediction: ' + fixGrammar(predQ));
                                predOpts.forEach(function (opt) {
                                    var optText = (typeof opt === 'string') ? opt : (opt.text || opt.option || '');
                                lines.push('    * ' + fixGrammar(optText));
                                });
                            }
                        }
                        lines.push('');
                    }
                    
                    // v11.08: Export all route cards from section.cards array
                    // Unified 7-card types AND legacy card types are both handled.
                    // v11.26 FIX-DP-ORDER: sort decision-point last (matches player render sort)
                    var exportCards = (section.cards && section.cards.length > 0) ? section.cards.slice().sort(function (a, b) {
                        if (a.cardType === 'decision-point') return 1;
                        if (b.cardType === 'decision-point') return -1;
                        return 0;
                    }) : (section.cardType ? [section] : []);
                    exportCards.forEach(function (card) {
                        if (!card.cardType) return;
                        lines.push('Card Type: ' + card.cardType);
                        if (card.heading) lines.push('  ' + fixGrammar(card.heading));

                        // v13.92: Topics-and-Text keeps its body in paragraphs[], and
                        // nothing here read it - so the one route that is nothing BUT
                        // text exported with no text in it. The fixed heading is written
                        // out too, since the card does not carry one.
                        if (CcState.PROSE_CARD_TYPES && CcState.PROSE_CARD_TYPES.indexOf(card.cardType) >= 0) {
                            var _pHead = (typeof CcState.proseHeadingFor === 'function')
                                ? CcState.proseHeadingFor(card.cardType)
                                : (CcState.PROSE_HEADINGS || {})[card.cardType];
                            if (_pHead) { lines.push('  ' + _pHead); }
                            CcState.proseParagraphs(card).forEach(function (para) {
                                lines.push('    ' + fixGrammar(para));
                                lines.push('');
                            });
                            if (card.keyTerms && card.keyTerms.length) {
                                lines.push('  ' + (getLabel('keyTerms') || 'Key Terms') + ':');
                                card.keyTerms.forEach(function (t) {
                                    if (t && t.term) { lines.push('    ' + t.term + ': ' + fixGrammar(t.definition || '')); }
                                });
                                lines.push('');
                            }
                        }

                        // v11.08 FIX: Unified card fields  -  sceneParts (hook/applied), conceptInsights,
                        // items (mistakes), goodItems/badItems (competency-summary), question/options (decision-point)
                        if (card.sceneParts && card.sceneParts.length) {
                            card.sceneParts.forEach(function (part) {
                                var partTitle = part.title || '';
                                var partText = part.text || part.content || part.description || part.detail || part.body || part.narrative || '';
                                if (partTitle) lines.push('  ' + fixGrammar(partTitle));
                                if (partText) lines.push('    ' + fixGrammar(partText));
                            });
                        }
                        if (card.highlightText) {
                            lines.push('  Highlight: ' + fixGrammar(card.highlightText));
                        }
                        if (card.conceptInsights && card.conceptInsights.length) {
                            card.conceptInsights.forEach(function (insight) {
                                var iTitle = insight.title || '';
                                var iText = insight.text || insight.content || insight.description || '';
                                if (iTitle) lines.push('  ' + fixGrammar(iTitle));
                                if (iText) lines.push('    ' + fixGrammar(iText));
                            });
                        }
                        if (card.legalLink && card.legalLink.legislationName) {
                            lines.push('  Legislation: ' + fixGrammar(card.legalLink.legislationName));
                            if (card.legalLink.legalObligation) lines.push('    Obligation: ' + fixGrammar(card.legalLink.legalObligation));
                            if (card.legalLink.scenarioConnection) lines.push('    Connection: ' + fixGrammar(card.legalLink.scenarioConnection));
                        }
                        if (card.items && card.items.length) {
                            card.items.forEach(function (item) {
                                var mistake = typeof item === 'string' ? item : (item.mistake || item.error || item.pitfall || '');
                                var consequence = typeof item === 'string' ? '' : (item.consequence || '');
                                if (mistake) lines.push('  - ' + fixGrammar(mistake));
                                if (consequence) lines.push('    Consequence: ' + fixGrammar(consequence));
                            });
                        }
                        if (card.goodItems && card.goodItems.length) {
                            lines.push('  What Good Looks Like:');
                            card.goodItems.forEach(function (gi) {
                                // v13.95.8: include the benefit, and never fall back to the
                                // object itself - fixGrammar(obj) printed "[object Object]".
                                if (typeof gi === 'string') { lines.push('    OK ' + fixGrammar(gi)); return; }
                                var _gl = '    OK ' + fixGrammar(gi.text || '');
                                if (gi.benefit) { _gl += ' - ' + fixGrammar(gi.benefit); }
                                lines.push(_gl);
                            });
                        }
                        if (card.badItems && card.badItems.length) {
                            lines.push('  Common Mistakes:');
                            card.badItems.forEach(function (bi) {
                                if (typeof bi === 'string') { lines.push('    x ' + fixGrammar(bi)); return; }
                                var _bl = '    x ' + fixGrammar(bi.text || '');
                                if (bi.consequence) { _bl += ' - ' + fixGrammar(bi.consequence); }
                                lines.push(_bl);
                            });
                        }
                        if (card.question) {
                            lines.push('  Question: ' + fixGrammar(card.question));
                        }
                        if (card.options && card.options.length) {
                            var dpLetters = ['A', 'B', 'C', 'D'];
                            card.options.forEach(function (opt, oIdx) {
                                var isCorrect = !!(opt.correct || opt.isCorrect);
                                var marker = isCorrect ? 'OK' : ' ';
                                var letter = dpLetters[oIdx] || String.fromCharCode(65 + oIdx);
                                lines.push('    ' + marker + ' ' + letter + ') ' + fixGrammar(opt.text || ''));
                                if (opt.feedback) lines.push('       ->  ' + fixGrammar(opt.feedback));
                            });
                        }

                        // Legacy card fields (pre-unified content)
                        if (card.bodyText) lines.push('  ' + fixGrammar(card.bodyText));
                        if (card.pcStatement) lines.push('  PC: ' + fixGrammar(card.pcStatement));
                        if (card.elementText) lines.push('  Element: ' + fixGrammar(card.elementText));
                        if (card.summaryLine) lines.push('  Summary: ' + fixGrammar(card.summaryLine));
                        // v13.94.6: same object-shape and duplication defect as the HTML
                        // export below - see the note there.
                        var _kpDupeTxt = (card.sceneParts && card.sceneParts.length)
                            || (card.conceptInsights && card.conceptInsights.length);
                        if (!_kpDupeTxt && card.keyPoints && card.keyPoints.length) {
                            card.keyPoints.forEach(function (pt) {
                                var _t = (typeof pt === 'string') ? pt : ((pt && (pt.text || pt.title)) || '');
                                if (_t) { lines.push('  - ' + fixGrammar(_t)); }
                            });
                        }
                        if (card.actions && card.actions.length) {
                            card.actions.forEach(function (a) {
                                if (a.heading) lines.push('  ' + fixGrammar(a.heading));
                                if (a.bullets && a.bullets.length) a.bullets.forEach(function (b) { lines.push('    - ' + fixGrammar(b)); });
                            });
                        }
                        if (card.standardItems && card.standardItems.length) {
                            card.standardItems.forEach(function (s) { lines.push('  - ' + fixGrammar(typeof s === 'string' ? s : (s.text || ''))); });
                        }
                        if (card.context) lines.push('  Context: ' + fixGrammar(card.context));
                        if (card.consequence) lines.push('  Consequence: ' + fixGrammar(card.consequence));
                        if (card.optimisationTips && card.optimisationTips.length) {
                            lines.push('  Tips:');
                            card.optimisationTips.forEach(function (tip) { lines.push('    - ' + fixGrammar(tip)); });
                        }
                        if (card.errorItems && card.errorItems.length) {
                            card.errorItems.forEach(function (e) {
                                lines.push('  Error: ' + fixGrammar(e.error || ''));
                                if (e.consequence) lines.push('    Consequence: ' + fixGrammar(e.consequence));
                            });
                        }
                        if (card.frameworks && card.frameworks.length) {
                            card.frameworks.forEach(function (fw) {
                                if (fw.name) lines.push('  Framework: ' + fixGrammar(fw.name));
                                if (fw.originator) lines.push('    Originator: ' + fixGrammar(fw.originator));
                                if (fw.principle || fw.description) lines.push('    Principle: ' + fixGrammar(fw.principle || fw.description));
                                if (fw.application) lines.push('    Application: ' + fixGrammar(fw.application));
                                if (fw.limitation) lines.push('    Limitation: ' + fixGrammar(fw.limitation));
                            });
                        }
                        if (card.considerations && card.considerations.length) {
                            card.considerations.forEach(function (c) {
                                if (typeof c === 'object' && c !== null) {
                                    var dim = c.dimension || c.title || '';
                                    var desc = c.description || c.text || '';
                                    lines.push('  - ' + fixGrammar(dim) + (desc ? ': ' + fixGrammar(desc) : ''));
                                } else {
                                    lines.push('  - ' + fixGrammar(c));
                                }
                            });
                        }
                        if (card.analysisPrompts && card.analysisPrompts.length) {
                            card.analysisPrompts.forEach(function (p) { lines.push('  - ' + fixGrammar(p)); });
                        }
                        if (card.consequences && card.consequences.length) {
                            card.consequences.forEach(function (c) { lines.push('  - ' + fixGrammar(c)); });
                        }
                        if (card.impactStatement) lines.push('  Impact: ' + fixGrammar(card.impactStatement));
                        if (card.keyMetrics && card.keyMetrics.length) {
                            card.keyMetrics.forEach(function (m) { lines.push('  Metric: ' + fixGrammar(m)); });
                        }
                        if (card.steps && card.steps.length) {
                            card.steps.forEach(function (s, i) {
                                if (typeof s === 'string') {
                                    lines.push('  ' + (i + 1) + '. ' + fixGrammar(s));
                                } else {
                                    lines.push('  ' + (i + 1) + '. ' + fixGrammar(s.step || s.action || s.text || ''));
                                    if (s.detail) lines.push('     ' + fixGrammar(s.detail));
                                    if (s.timeframe) lines.push('     Timeframe: ' + fixGrammar(s.timeframe));
                                }
                            });
                        }
                        if (card.risks && card.risks.length) {
                            card.risks.forEach(function (r) {
                                lines.push('  Risk: ' + fixGrammar(r.risk || r.text || ''));
                                if (r.likelihood) lines.push('    Likelihood: ' + fixGrammar(r.likelihood));
                                if (r.impact) lines.push('    Impact: ' + fixGrammar(r.impact));
                                if (r.consequence) lines.push('    Consequence: ' + fixGrammar(r.consequence));
                                if (r.mitigation) lines.push('    Mitigation: ' + fixGrammar(r.mitigation));
                            });
                        }
                        var dlPolItems = card.policyItems || card.policies || [];
                        if (dlPolItems.length) {
                            dlPolItems.forEach(function (p) {
                                if (typeof p === 'string') {
                                    lines.push('  - ' + fixGrammar(p));
                                } else {
                                    lines.push('  - ' + fixGrammar(p.policy || p.text || ''));
                                    if (p.requirement) lines.push('    Requirement: ' + fixGrammar(p.requirement));
                                    if (p.consequence) lines.push('    Consequence: ' + fixGrammar(p.consequence));
                                }
                            });
                        }
                        if (card.keyInsight) lines.push('  Key Insight: ' + fixGrammar(card.keyInsight));
                        if (card.criticalReflection) lines.push('  Critical Reflection: ' + fixGrammar(card.criticalReflection));
                        if (card.conceptDefinition) lines.push('  Definition: ' + fixGrammar(card.conceptDefinition));
                        if (card.significance) lines.push('  Significance: ' + fixGrammar(card.significance));
                        if (card.keyTerms && card.keyTerms.length) {
                            card.keyTerms.forEach(function (t) { lines.push('  ' + fixGrammar(t.term) + ': ' + fixGrammar(t.definition)); });
                        }
                        if (card.cognitiveConsiderations && card.cognitiveConsiderations.length) {
                            card.cognitiveConsiderations.forEach(function (c) { lines.push('  - ' + fixGrammar(typeof c === 'string' ? c : (c.text || c.description || ''))); });
                        }
                        if (card.skillStatement) lines.push('  Skill: ' + fixGrammar(card.skillStatement));
                        if (card.relevance) lines.push('  Relevance: ' + fixGrammar(card.relevance));
                        if (card.keyIndicators && card.keyIndicators.length) {
                            card.keyIndicators.forEach(function (ind) { lines.push('  - ' + fixGrammar(typeof ind === 'string' ? ind : (ind.text || ''))); });
                        }
                        if (card.frameworkSteps && card.frameworkSteps.length) {
                            card.frameworkSteps.forEach(function (s, i) {
                                lines.push('  ' + (i + 1) + '. ' + fixGrammar(s.step || ''));
                                if (s.explanation) lines.push('    ' + fixGrammar(s.explanation));
                                if (s.example) lines.push('    Example: ' + fixGrammar(s.example));
                            });
                        }
                        if (card.keyPrinciple) lines.push('  Principle: ' + fixGrammar(card.keyPrinciple));
                        if (card.applications && card.applications.length) {
                            card.applications.forEach(function (a) {
                                lines.push('  Situation: ' + fixGrammar(a.situation || ''));
                                lines.push('    Action: ' + fixGrammar(a.action || ''));
                                if (a.rationale) lines.push('    Rationale: ' + fixGrammar(a.rationale));
                            });
                        }
                        if (card.pitfallItems && card.pitfallItems.length) {
                            card.pitfallItems.forEach(function (p) {
                                lines.push('  Pitfall: ' + fixGrammar(p.pitfall || ''));
                                if (p.consequence) lines.push('    Consequence: ' + fixGrammar(p.consequence));
                                if (p.correction) lines.push('    Correction: ' + fixGrammar(p.correction));
                            });
                        }
                        if (card.turningPoint) lines.push('  Turning Point: ' + fixGrammar(card.turningPoint));
                        if (card.reflection) {
                            if (typeof card.reflection === 'string') {
                                lines.push('  Reflection: ' + fixGrammar(card.reflection));
                            } else if (card.reflection.question) {
                                lines.push('  Reflection: ' + fixGrammar(card.reflection.question));
                                if (card.reflection.sampleAnswers && Array.isArray(card.reflection.sampleAnswers)) {
                                    card.reflection.sampleAnswers.forEach(function (a) { lines.push('    - ' + fixGrammar(a)); });
                                }
                            }
                        }
                        lines.push('');
                    });
                    
                    // Document Activity
                    if (section.docActivity && section.docActivity.activityType) {
                        lines.push((getLabel('documentActivity') || 'Document Activity') + ':');
                        if (section.docActivity.title) lines.push('  ' + section.docActivity.title);
                        if (section.docActivity.scenario || section.docActivity.instructions) {
                            lines.push('  ' + (section.docActivity.scenario || section.docActivity.instructions));
                        }
                        if (section.docActivity.questions && section.docActivity.questions.length > 0) {
                            section.docActivity.questions.forEach(function (q, idx) {
                                lines.push('  Q' + (idx + 1) + ': ' + (q.question || q.text));
                                if (q.options && q.options.length > 0) {
                                    q.options.forEach(function (opt, optIdx) {
                                        var optText = typeof opt === 'string' ? opt : opt.text;
                                        var isCorrect = opt.isCorrect || opt.correct || false;
                                        var marker = isCorrect ? 'OK' : ' ';
                                        lines.push('    ' + marker + ' ' + String.fromCharCode(65 + optIdx) + ') ' + optText);
                                    });
                                }
                                if (q.explanation || q.feedback) {
                                    lines.push('    -> ' + (q.explanation || q.feedback));
                                }
                            });
                        }
                        lines.push('');
                    }
                    
                    // Activity - v6.9.31: Include FULL activity content
                    if (section.activity && section.activity.activityType) {
                        var act = section.activity;
                        lines.push('> ' + getLabel('activitySlide') + ': ' + act.activityType);
                        lines.push('');
                        
                        // Activity title if present
                        if (act.title) {
                            lines.push('  ' + act.title);
                        }
                        
                        // Common fields
                        if (act.question) lines.push('  Question: ' + act.question);
                        if (act.scenario) lines.push('  Scenario: ' + act.scenario);
                        if (act.scenarioIntro) lines.push('  Scenario: ' + act.scenarioIntro);
                        if (act.situation) lines.push('  Situation: ' + act.situation);
                        if (act.context) lines.push('  Context: ' + act.context);
                        if (act.caseDescription) lines.push('  Case: ' + act.caseDescription);
                        if (act.prompt) lines.push('  Prompt: ' + act.prompt);
                        
                        // Scenario Branching: Decision points with options
                        if (act.decisionPoints && act.decisionPoints.length) {
                            lines.push('');
                            act.decisionPoints.forEach(function (point, pIdx) {
                                lines.push('  Decision ' + (pIdx + 1) + ': ' + point.situation);
                                if (point.options) {
                                    point.options.forEach(function (opt, oIdx) {
                                        var marker = opt.isCorrect ? 'OK' : 'x';
                                        lines.push('    ' + marker + ' ' + String.fromCharCode(65 + oIdx) + ') ' + opt.text);
                                        if (opt.feedback) lines.push('        ->  ' + opt.feedback);
                                    });
                                }
                            });
                        }
                        
                        // Best Response: Response items with classifications
                        if (act.responses && act.responses.length) {
                            lines.push('');
                            lines.push('  Responses:');
                            act.responses.forEach(function (resp, rIdx) {
                                var classLabel = resp.classification === 'best' ? '[BEST]' : 
                                                (resp.classification === 'acceptable' ? '[OK]' : '[NO]');
                                lines.push('    ' + (rIdx + 1) + '. ' + classLabel + ' ' + resp.text);
                                if (resp.explanation) lines.push('        ->  ' + resp.explanation);
                            });
                        }
                        
                        // What Went Wrong: Analysis questions
                        if (act.analysisQuestions && act.analysisQuestions.length) {
                            lines.push('');
                            lines.push('  Analysis Questions:');
                            act.analysisQuestions.forEach(function (q, qIdx) {
                                lines.push('    Q' + (qIdx + 1) + ': ' + q.question);
                                if (q.modelAnswer) lines.push('    A: ' + q.modelAnswer);
                            });
                        }
                        
                        // Task Sequencing: Steps in order
                        if (act.steps && act.steps.length) {
                            lines.push('');
                            lines.push('  Correct Sequence:');
                            act.steps.forEach(function (step, sIdx) {
                                var stepText = typeof step === 'string' ? step : (step.text || step.description || '');
                                lines.push('    ' + (sIdx + 1) + '. ' + stepText);
                            });
                        }
                        
                        // Escalation Decision: Scenarios
                        if (act.situations && act.situations.length) {
                            lines.push('');
                            act.situations.forEach(function (sit, sIdx) {
                                lines.push('  Scenario ' + (sIdx + 1) + ': ' + sit.situation);
                                if (sit.correctDecision) lines.push('    Answer: ' + sit.correctDecision);
                                if (sit.explanation) lines.push('     ->  ' + sit.explanation);
                            });
                        }
                        
                        // Reflection: Reflection items
                        if (act.reflectionPrompts && act.reflectionPrompts.length) {
                            lines.push('');
                            lines.push('  Reflection Points:');
                            act.reflectionPrompts.forEach(function (rp, iIdx) {
                                var itemText = typeof rp === 'string' ? rp : (rp.question || rp.prompt || '');
                                lines.push('    * ' + itemText);
                            });
                        }
                        
                        // Outcomes
                        if (act.finalOutcome) lines.push('  Outcome: ' + act.finalOutcome);
                        if (act.learningTakeaway) lines.push('  Key Takeaway: ' + act.learningTakeaway);
                        
                        lines.push('');
                    }
                    
                    lines.push('');
                });
                
                lines.push('');
                lines.push('');
            });
            
            return lines.join('\n');
        },

        /**
         * Export content as text file (v6.6.66)
         * Downloads a .txt file with all learning content
         */
        exportAsText: function () {
            var content = this.extractAllTextContent();
            var filename = (this.manifest.context?.topic || 'learning-content').replace(/[^a-zA-Z0-9]/g, '_') + '.txt';
            
            var blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
            var url = URL.createObjectURL(blob);
            
            var a = document.createElement('a');
            a.href = url;
            a.download = filename;
            var dlRoot = document.getElementById('contentcreator-app') || document.body;
            dlRoot.appendChild(a);
            a.click();
            dlRoot.removeChild(a);
            URL.revokeObjectURL(url);
            
            Notification.addNotification({
                message: getLabel('downloadText') + ' - ' + filename,
                type: 'success'
            });
        },

        /**
         * Export content as PDF (v6.6.66)
         * Generates a professional-looking PDF with all slides
         */
        exportAsPdf: function () {
            var manifest = this.manifest;
            var topics = manifest.topics || [];
            var title = manifest.context?.topic || 'Learning Content';
            var subtitle = manifest.context?.unitCode ? (manifest.context.unitCode + ' - ' + (manifest.context.unitTitle || '')) : '';
            
            // Create a printable HTML document
            var printHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8">';
            printHtml += '<title>' + escapeHtml(fixGrammar(title)) + '</title>';
            printHtml += '<style>';
            // v6.9.34: Improved PDF formatting with proper page breaks and margins
            printHtml += '@page { size: A4; margin: 25mm 20mm 30mm 20mm; }';
            printHtml += '@page :first { margin-top: 20mm; }';
            printHtml += 'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 100%; margin: 0; padding: 0; color: #1a1a1a; line-height: 1.6; font-size: 11pt; }';
            printHtml += 'h1 { color: #1e40af; border-bottom: 3px solid #1e40af; padding-bottom: 12px; margin-bottom: 8px; font-size: 22pt; }';
            printHtml += '.subtitle { color: #6b7280; margin-bottom: 24px; font-size: 12pt; }';
            // Topic containers - allow page breaks inside but keep header with first content
            printHtml += '.topic { margin-bottom: 24px; }';
            printHtml += '.topic-header { background: linear-gradient(135deg, #1e40af, #3b82f6); -webkit-print-color-adjust: exact; print-color-adjust: exact; color: white; padding: 12px 16px; border-radius: 6px 6px 0 0; margin-bottom: 0; page-break-after: avoid; }';
            printHtml += '.topic-header h2 { margin: 0; font-size: 14pt; }';
            printHtml += '.topic-desc { background: #f8fafc; -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 10px 16px; border: 1px solid #e2e8f0; border-top: none; margin-bottom: 16px; border-radius: 0 0 6px 6px; font-size: 10pt; }';
            // Slides - avoid breaking inside, keep together
            printHtml += '.slide { background: #fff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; margin-bottom: 12px; page-break-inside: avoid; break-inside: avoid; }';
            printHtml += '.slide-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid #e2e8f0; page-break-after: avoid; }';
            printHtml += '.slide-badge { background: #dbeafe; -webkit-print-color-adjust: exact; print-color-adjust: exact; color: #1e40af; padding: 3px 8px; border-radius: 4px; font-size: 9pt; font-weight: 600; }';
            printHtml += '.slide-badge.activity { background: #fef3c7; color: #92400e; }';
            printHtml += '.slide-title { font-size: 12pt; font-weight: 600; color: #1e293b; margin: 0; }';
            printHtml += '.slide-desc { color: #475569; margin-bottom: 12px; font-size: 10pt; }';
            // Content blocks - avoid breaking
            printHtml += '.requirements { background: #f1f5f9; -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 10px 14px; border-radius: 5px; margin-bottom: 10px; page-break-inside: avoid; break-inside: avoid; }';
            printHtml += '.requirements h4 { margin: 0 0 6px 0; font-size: 9pt; color: #64748b; text-transform: uppercase; page-break-after: avoid; }';
            printHtml += '.requirements ul, .requirements ol { margin: 0; padding-left: 18px; font-size: 10pt; }';
            printHtml += '.requirements li { margin-bottom: 3px; orphans: 2; widows: 2; }';
            // Dos and Donts - stack on narrow pages for print
            printHtml += '.dos-donts { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 10px; }';
            printHtml += '.dos, .donts { flex: 1 1 45%; min-width: 200px; page-break-inside: avoid; break-inside: avoid; }';
            printHtml += '.dos { background: #dcfce7; -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 10px 14px; border-radius: 5px; border-left: 4px solid #22c55e; }';
            printHtml += '.donts { background: #fee2e2; -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 10px 14px; border-radius: 5px; border-left: 4px solid #ef4444; }';
            printHtml += '.dos h4, .donts h4 { margin: 0 0 6px 0; font-size: 9pt; page-break-after: avoid; }';
            printHtml += '.dos h4 { color: #166534; } .donts h4 { color: #991b1b; }';
            printHtml += '.dos ul, .donts ul { margin: 0; padding-left: 16px; font-size: 10pt; }';
            printHtml += '.dos li { color: #166534; margin-bottom: 2px; } .donts li { color: #991b1b; margin-bottom: 2px; }';
            // Scenario and outcome boxes
            printHtml += '.scenario { background: #fef3c7; -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 12px 14px; border-radius: 5px; margin-bottom: 10px; border-left: 4px solid #f59e0b; page-break-inside: avoid; break-inside: avoid; }';
            printHtml += '.scenario h4 { margin: 0 0 6px 0; color: #92400e; font-size: 9pt; text-transform: uppercase; page-break-after: avoid; }';
            printHtml += '.scenario p { margin: 3px 0; color: #78350f; font-size: 10pt; }';
            printHtml += '.knowledge-terms { background: #f0fdf4; -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 10px 14px; border-radius: 5px; margin-bottom: 10px; border-left: 4px solid #22c55e; page-break-inside: avoid; }';
            printHtml += '.knowledge-terms h4 { margin: 0 0 6px 0; color: #166534; font-size: 9pt; text-transform: uppercase; }';
            printHtml += '.knowledge-terms dt { font-weight: 600; font-size: 10pt; margin-top: 4px; }';
            printHtml += '.knowledge-terms dd { margin: 0 0 2px 12px; font-size: 10pt; color: #4b5563; }';
            printHtml += '.accent-card { padding: 10px 14px; border-radius: 5px; margin-bottom: 10px; page-break-inside: avoid; break-inside: avoid; -webkit-print-color-adjust: exact; print-color-adjust: exact; }';
            printHtml += '.accent-green { background: #f0fdf4; border-left: 4px solid #22c55e; }';
            printHtml += '.accent-amber { background: #fffbeb; border-left: 4px solid #f59e0b; }';
            printHtml += '.accent-blue { background: #eff6ff; border-left: 4px solid #3b82f6; }';
            printHtml += '.accent-purple { background: #faf5ff; border-left: 4px solid #a855f7; }';
            printHtml += '.accent-card h4 { margin: 0 0 4px 0; font-size: 9pt; text-transform: uppercase; }';
            printHtml += '.accent-green h4 { color: #166534; } .accent-amber h4 { color: #92400e; } .accent-blue h4 { color: #1e40af; } .accent-purple h4 { color: #6b21a8; }';
            printHtml += '.accent-card p { margin: 0; font-size: 10pt; }';
            printHtml += '.docactivity { background: #f8fafc; -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 12px 14px; border-radius: 5px; margin-bottom: 10px; border-left: 4px solid #64748b; page-break-inside: avoid; }';
            printHtml += '.docactivity h4 { margin: 0 0 6px 0; color: #334155; font-size: 9pt; text-transform: uppercase; }';
            printHtml += '.docactivity p { margin: 3px 0; font-size: 10pt; }';
            printHtml += '.docactivity .doc-questions { margin: 6px 0 0 0; padding: 0; }';
            printHtml += '.docactivity .doc-question { margin-bottom: 6px; }';
            printHtml += '.docactivity .doc-question strong { font-size: 10pt; }';
            printHtml += '.docactivity .doc-options { margin: 2px 0 0 16px; padding: 0; font-size: 10pt; }';
            printHtml += '.docactivity .doc-options li { margin: 1px 0; }';
            // Activity slides
            printHtml += '.activity-slide { background: #fffbeb; -webkit-print-color-adjust: exact; print-color-adjust: exact; border-left: 4px solid #f59e0b; }';
            // Print-specific rules
            printHtml += '@media print { ';
            printHtml += '  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }';
            printHtml += '  body { padding: 0; }';
            printHtml += '  h1, h2, h3, h4 { page-break-after: avoid; orphans: 3; widows: 3; }';
            printHtml += '  .slide, .requirements, .dos, .donts, .scenario, .outcome { page-break-inside: avoid; break-inside: avoid; }';
            printHtml += '  .topic-header { page-break-after: avoid; }';
            printHtml += '  ul, ol { orphans: 2; widows: 2; }';
            printHtml += '}';
            printHtml += '</style></head><body>';
            
            // Title
            printHtml += '<h1>' + escapeHtml(fixGrammar(title)) + '</h1>';
            if (subtitle) {
                printHtml += '<p class="subtitle">' + escapeHtml(fixGrammar(subtitle)) + '</p>';
            }
            
            // Topics and slides
            topics.forEach(function (topic, topicIdx) {
                printHtml += '<div class="topic">';
                printHtml += '<div class="topic-header"><h2>' + getLabel('topicLabel') + ' ' + (topicIdx + 1) + ': ' + escapeHtml(fixGrammar(sanitizeTopicTitle(topic.title))) + '</h2></div>';
                if (topic.description) {
                    printHtml += '<div class="topic-desc">' + escapeHtml(fixGrammar(topic.description)) + '</div>';
                }
                
                var sections = topic.sections || [];
                sections.forEach(function (section, secIdx) {
                    var contrastConfig = getContrastPair(CcState.sectionContrastType(section));
                    
                    // Learning slide
                    printHtml += '<div class="slide">';
                    printHtml += '<div class="slide-header">';
                    printHtml += '<span class="slide-badge">' + getLabel('learningSlide') + ' ' + (topicIdx + 1) + '.' + (secIdx + 1) + '</span>';
                    printHtml += '<h3 class="slide-title">' + escapeHtml(fixGrammar(section.title)) + '</h3>';
                    printHtml += '</div>';
                    
                    // v8.4.56: Introduction voiceoverText - apply fixIntroSentences (matches slide/voiceover/TXT)
                    if (section.voiceoverText) {
                        var pdfIntroSentences = fixIntroSentences(section.voiceoverText);
                        printHtml += '<div class="slide-intro"><h4>' + (getLabel('introduction') || 'Introduction') + '</h4>';
                        printHtml += '<p>' + escapeHtml(fixGrammar(pdfIntroSentences.join(' '))) + '</p></div>';
                    } else if (section.description) {
                        printHtml += '<p class="slide-desc">' + escapeHtml(fixGrammar(section.description)) + '</p>';
                    }
                    
                    // Requirements
                    if (section.requirements && section.requirements.length) {
                        printHtml += '<div class="requirements">';
                        printHtml += '<h4>' + getLabel('keyRequirementsTitle') + '</h4>';
                        printHtml += '<ul>';
                        section.requirements.forEach(function (req) {
                            printHtml += '<li>' + escapeHtml(fixGrammar(req.text || req)) + '</li>';
                        });
                        printHtml += '</ul></div>';
                    }
                    
                    // Do's and Don'ts
                    var positiveItems = section.positiveList || section.doList || [];
                    var negativeItems = section.negativeList || section.dontList || [];
                    if (positiveItems.length || negativeItems.length) {
                        printHtml += '<div class="dos-donts">';
                        if (positiveItems.length) {
                            printHtml += '<div class="dos"><h4>' + escapeHtml(contrastConfig.positive) + '</h4><ul>';
                            positiveItems.forEach(function (item) {
                                printHtml += '<li>' + escapeHtml(fixGrammar(item)) + '</li>';
                            });
                            printHtml += '</ul></div>';
                        }
                        if (negativeItems.length) {
                            printHtml += '<div class="donts"><h4>' + escapeHtml(contrastConfig.negative) + '</h4><ul>';
                            negativeItems.forEach(function (item) {
                                printHtml += '<li>' + escapeHtml(fixGrammar(item)) + '</li>';
                            });
                            printHtml += '</ul></div>';
                        }
                        printHtml += '</div>';
                    }
                    
                    // Terminology - deduplicated term list
                    var combinedTerms = getTerminology(section);
                    if (combinedTerms.length > 0) {
                        printHtml += '<div class="knowledge-terms">';
                        printHtml += '<h4>' + (getLabel('keyTerms') || 'Key Terms') + '</h4>';
                        printHtml += '<dl>';
                        combinedTerms.forEach(function (term) {
                            printHtml += '<dt>' + escapeHtml(fixGrammar(term.term || '')) + '</dt>';
                            printHtml += '<dd>' + escapeHtml(fixGrammar(term.definition || '')) + '</dd>';
                        });
                        printHtml += '</dl></div>';
                    }
                    
                    // v7.9.95: Accent Cards (keyTakeaway, proTip, keyInfo/didYouKnow, expertInsight)
                    if (section.keyTakeaway) {
                        printHtml += '<div class="accent-card accent-green"><h4>' + (getLabel('keyTakeaway') || 'Key Takeaway') + '</h4>';
                        printHtml += '<p>' + escapeHtml(fixGrammar(section.keyTakeaway)) + '</p></div>';
                    }
                    if (section.proTip) {
                        printHtml += '<div class="accent-card accent-amber"><h4>' + (getLabel('proTip') || 'Pro Tip') + '</h4>';
                        printHtml += '<p>' + escapeHtml(fixGrammar(section.proTip)) + '</p></div>';
                    }
                    if (section.keyInfo || section.didYouKnow) {
                        var infoText = section.keyInfo || section.didYouKnow;
                        var infoLabel = section.didYouKnow ? (getLabel('didYouKnow') || 'Did You Know?') : (getLabel('keyInfo') || 'Key Information');
                        printHtml += '<div class="accent-card accent-blue"><h4>' + infoLabel + '</h4>';
                        printHtml += '<p>' + escapeHtml(fixGrammar(infoText)) + '</p></div>';
                    }
                    if (section.expertInsight) {
                        printHtml += '<div class="accent-card accent-purple"><h4>' + (getLabel('expertInsight') || 'Expert Insight') + '</h4>';
                        printHtml += '<p>' + escapeHtml(fixGrammar(section.expertInsight)) + '</p></div>';
                    }
                    
                    // Scenario (Card 2) - v8.4.6: matches slide rendering exactly
                    if (section.scenario) {
                        printHtml += '<div class="scenario">';
                        printHtml += '<h4>' + getLabel('workplaceScenario') + '</h4>';
                        if (section.scenario.title || section.scenario.scenarioTitle) printHtml += '<p><strong>' + escapeHtml(fixGrammar(section.scenario.title || section.scenario.scenarioTitle)) + '</strong></p>';
                        if (section.scenario.role) printHtml += '<p><em>' + getLabel('printRole') + ' ' + escapeHtml(fixGrammar(section.scenario.role)) + '</em></p>';
                        if (section.scenario.context) printHtml += '<p>' + escapeHtml(fixGrammar(section.scenario.context)) + '</p>';
                        if (section.scenario.complication) printHtml += '<p>' + escapeHtml(fixGrammar(section.scenario.complication)) + '</p>';
                        // v8.4.6: Mental Model (matches slide purple gradient card)
                        var mmObj = section.scenario.mentalModel || null;
                        if (mmObj) {
                            var mmName = (typeof mmObj === 'string') ? mmObj : (mmObj.name || mmObj.concept || '');
                            var mmPrinciple = (typeof mmObj === 'object') ? (mmObj.principle || mmObj.application || '') : '';
                            if (mmName) {
                                printHtml += '<div class="mental-model"><strong>' + getLabel('printMentalModel') + ' ' + escapeHtml(fixGrammar(mmName)) + '</strong>';
                                if (mmPrinciple) printHtml += '<p>' + escapeHtml(fixGrammar(mmPrinciple)) + '</p>';
                                printHtml += '</div>';
                            }
                        }
                        // v8.4.6: Prediction Prompt (matches slide amber gradient card)
                        var predObj = section.scenario.predictionPrompt || null;
                        if (predObj) {
                            var predQ = (typeof predObj === 'string') ? predObj : (predObj.question || '');
                            var predOpts = (typeof predObj === 'object' && Array.isArray(predObj.options)) ? predObj.options : [];
                            if (predQ) {
                                printHtml += '<div class="prediction"><strong>' + getLabel('printPrediction') + ' ' + escapeHtml(fixGrammar(predQ)) + '</strong>';
                                if (predOpts.length > 0) {
                                    printHtml += '<ul>';
                                    predOpts.forEach(function (opt) {
                                        var optText = (typeof opt === 'string') ? opt : (opt.text || opt.option || '');
                                        printHtml += '<li>' + escapeHtml(fixGrammar(optText)) + '</li>';
                                    });
                                    printHtml += '</ul>';
                                }
                                printHtml += '</div>';
                            }
                        }
                        printHtml += '</div>';
                    }
                    
                    // v11.08: Print all route cards from section.cards array
                    // Unified 7-card types AND legacy card types are both handled.
                    // v11.26 FIX-DP-ORDER: sort decision-point last (matches player render sort)
                    var printCards = (section.cards && section.cards.length > 0) ? section.cards.slice().sort(function (a, b) {
                        if (a.cardType === 'decision-point') return 1;
                        if (b.cardType === 'decision-point') return -1;
                        return 0;
                    }) : (section.cardType ? [section] : []);
                    printCards.forEach(function (card) {
                        if (!card.cardType) return;
                        printHtml += '<div class="slide" style="border-left: 4px solid #6366f1;">';
                        // v13.94.2 FIX-CC-PRINT-PROSE: Topics and Text keeps its content in
                        // paragraphs[], and the print builder read every other field the plugin
                        // produces except that one. A Route 5 pack therefore printed as four
                        // headings with nothing under them - and on this route the heading is
                        // supplied by the platform and deleted from the card, so even the
                        // heading printed as the raw cardType ("overview"). Both fixed here.
                        // v13.94.3: prefer the translated heading when one exists.
                        var _printHeading = card.heading
                            || ((CcState && typeof CcState.proseHeadingFor === 'function')
                                ? CcState.proseHeadingFor(card.cardType)
                                : ((CcState && CcState.PROSE_HEADINGS) || {})[card.cardType])
                            || card.cardType;
                        printHtml += '<h4>' + escapeHtml(fixGrammar(_printHeading)) + '</h4>';
                        if (card.paragraphs && card.paragraphs.length) {
                            card.paragraphs.forEach(function (para) {
                                var _pt = (typeof para === 'string') ? para : (para && (para.text || para.content)) || '';
                                if (_pt) {
                                    printHtml += '<p style="margin:0 0 10px 0;">'
                                        + escapeHtml(fixGrammar(_pt)) + '</p>';
                                }
                            });
                        }

                        // v11.08 FIX: Unified card fields  -  sceneParts, conceptInsights, items,
                        // goodItems/badItems, question/options, legalLink, highlightText
                        if (card.sceneParts && card.sceneParts.length) {
                            card.sceneParts.forEach(function (part) {
                                var partText = part.text || part.content || part.description || part.detail || part.body || part.narrative || '';
                                printHtml += '<div style="margin-bottom:8px; padding:8px 12px; background:#f8fafc; border-radius:4px;">';
                                if (part.title) printHtml += '<p style="margin:0 0 4px 0;"><strong>' + escapeHtml(fixGrammar(part.title)) + '</strong></p>';
                                if (partText) printHtml += '<p style="margin:0; font-size:10pt;">' + escapeHtml(fixGrammar(partText)) + '</p>';
                                printHtml += '</div>';
                            });
                        }
                        if (card.highlightText) {
                            printHtml += '<div class="accent-card accent-amber"><p><strong>' + escapeHtml(fixGrammar(card.highlightText)) + '</strong></p></div>';
                        }
                        if (card.conceptInsights && card.conceptInsights.length) {
                            card.conceptInsights.forEach(function (insight) {
                                var iText = insight.text || insight.content || insight.description || '';
                                printHtml += '<div style="margin-bottom:8px; padding:8px 12px; background:#eff6ff; border-radius:4px;">';
                                if (insight.title) printHtml += '<p style="margin:0 0 4px 0;"><strong>' + escapeHtml(fixGrammar(insight.title)) + '</strong></p>';
                                if (iText) printHtml += '<p style="margin:0; font-size:10pt;">' + escapeHtml(fixGrammar(iText)) + '</p>';
                                printHtml += '</div>';
                            });
                        }
                        if (card.legalLink && card.legalLink.legislationName) {
                            printHtml += '<div class="accent-card accent-blue">';
                            printHtml += '<h4>' + getLabel('whatTheLawSaysHeading') + '</h4>';
                            printHtml += '<p><strong>' + escapeHtml(fixGrammar(card.legalLink.legislationName)) + '</strong></p>';
                            if (card.legalLink.legalObligation) printHtml += '<p>' + escapeHtml(fixGrammar(card.legalLink.legalObligation)) + '</p>';
                            if (card.legalLink.scenarioConnection) printHtml += '<p><em>' + escapeHtml(fixGrammar(card.legalLink.scenarioConnection)) + '</em></p>';
                            printHtml += '</div>';
                        }
                        if (card.items && card.items.length) {
                            card.items.forEach(function (item) {
                                var mistake = typeof item === 'string' ? item : (item.mistake || item.error || item.pitfall || '');
                                var consequence = typeof item === 'string' ? '' : (item.consequence || '');
                                printHtml += '<div style="margin-bottom:6px; padding:6px 10px; background:#fef2f2; border-left:3px solid #ef4444; border-radius:3px;">';
                                if (mistake) printHtml += '<p style="margin:0;"><strong>' + escapeHtml(fixGrammar(mistake)) + '</strong></p>';
                                if (consequence) printHtml += '<p style="margin:2px 0 0 0; font-size:10pt; color:#991b1b;">' + escapeHtml(fixGrammar(consequence)) + '</p>';
                                printHtml += '</div>';
                            });
                        }
                        if (card.goodItems && card.goodItems.length) {
                            printHtml += '<div class="dos"><h4>' + getLabel('whatGoodLooksLike') + '</h4><ul>';
                            card.goodItems.forEach(function (gi) {
                                if (typeof gi === 'string') { printHtml += '<li>' + escapeHtml(fixGrammar(gi)) + '</li>'; return; }
                                printHtml += '<li>' + escapeHtml(fixGrammar(gi.text || ''));
                                if (gi.benefit) {
                                    printHtml += '<p style="margin:2px 0 0 0; font-size:10pt; color:#166534;">' + escapeHtml(fixGrammar(gi.benefit)) + '</p>';
                                }
                                printHtml += '</li>';
                            });
                            printHtml += '</ul></div>';
                        }
                        if (card.badItems && card.badItems.length) {
                            printHtml += '<div class="donts"><h4>' + getLabel('commonMistakes') + '</h4><ul>';
                            card.badItems.forEach(function (bi) {
                                if (typeof bi === 'string') { printHtml += '<li>' + escapeHtml(fixGrammar(bi)) + '</li>'; return; }
                                printHtml += '<li>' + escapeHtml(fixGrammar(bi.text || ''));
                                if (bi.consequence) {
                                    printHtml += '<p style="margin:2px 0 0 0; font-size:10pt; color:#991b1b;">' + escapeHtml(fixGrammar(bi.consequence)) + '</p>';
                                }
                                printHtml += '</li>';
                            });
                            printHtml += '</ul></div>';
                        }
                        if (card.question) {
                            printHtml += '<p><strong>' + getLabel('printQuestion') + '</strong> ' + escapeHtml(fixGrammar(card.question)) + '</p>';
                        }
                        if (card.options && card.options.length) {
                            var dpLetters = ['A', 'B', 'C', 'D'];
                            printHtml += '<div style="margin-top:6px;">';
                            card.options.forEach(function (opt, oIdx) {
                                var isCorrect = !!(opt.correct || opt.isCorrect);
                                var marker = isCorrect ? '&#10003;' : '&#9675;';
                                var letter = dpLetters[oIdx] || String.fromCharCode(65 + oIdx);
                                printHtml += '<div style="margin-bottom:4px; padding:4px 8px; background:' + (isCorrect ? '#dcfce7' : '#f8fafc') + '; border-radius:3px;">';
                                printHtml += '<p style="margin:0;"><strong>' + marker + ' ' + letter + ')</strong> ' + escapeHtml(fixGrammar(opt.text || '')) + '</p>';
                                if (opt.feedback) printHtml += '<p style="margin:2px 0 0 12px; font-size:9pt; color:#475569;"><em>' + escapeHtml(fixGrammar(opt.feedback)) + '</em></p>';
                                printHtml += '</div>';
                            });
                            printHtml += '</div>';
                        }

                        // Legacy card fields (pre-unified content)
                        if (card.bodyText) printHtml += '<p>' + escapeHtml(fixGrammar(card.bodyText)) + '</p>';
                        if (card.pcStatement) printHtml += '<p><strong>' + getLabel('printPc') + '</strong> ' + escapeHtml(fixGrammar(card.pcStatement)) + '</p>';
                        if (card.elementText) printHtml += '<p>' + escapeHtml(fixGrammar(card.elementText)) + '</p>';
                        if (card.summaryLine) printHtml += '<p><strong>' + escapeHtml(fixGrammar(card.summaryLine)) + '</strong></p>';
                        // v13.94.6: keyPoints on hook-scenario, concept-explainer and applied-scenario is an
                        // array of {title, text} OBJECTS, not strings - fixGrammar coerces with
                        // String(), so every bullet printed the literal "[object Object]". Latent
                        // until v13.89 stopped deleting keyPoints after aliasing it into
                        // sceneParts/conceptInsights. And because those two ARE printed above,
                        // this block was duplicating them anyway - so it is skipped entirely
                        // when either is present, and handles the object shape when it is not.
                        var _kpDupe = (card.sceneParts && card.sceneParts.length)
                            || (card.conceptInsights && card.conceptInsights.length);
                        if (!_kpDupe && card.keyPoints && card.keyPoints.length) {
                            printHtml += '<ul>';
                            card.keyPoints.forEach(function (pt) {
                                var _t = (typeof pt === 'string') ? pt : ((pt && (pt.text || pt.title)) || '');
                                if (_t) { printHtml += '<li>' + escapeHtml(fixGrammar(_t)) + '</li>'; }
                            });
                            printHtml += '</ul>';
                        }
                        if (card.actions && card.actions.length) {
                            card.actions.forEach(function (a) {
                                if (a.heading) printHtml += '<p><strong>' + escapeHtml(fixGrammar(a.heading)) + '</strong></p>';
                                if (a.bullets && a.bullets.length) {
                                    printHtml += '<ul>';
                                    a.bullets.forEach(function (b) { printHtml += '<li>' + escapeHtml(fixGrammar(b)) + '</li>'; });
                                    printHtml += '</ul>';
                                }
                            });
                        }
                        if (card.standardItems && card.standardItems.length) {
                            printHtml += '<ul>';
                            card.standardItems.forEach(function (s) { printHtml += '<li>' + escapeHtml(fixGrammar(typeof s === 'string' ? s : (s.text || ''))) + '</li>'; });
                            printHtml += '</ul>';
                        }
                        if (card.context) printHtml += '<p>' + escapeHtml(fixGrammar(card.context)) + '</p>';
                        if (card.consequence) printHtml += '<p><strong>' + getLabel('printConsequence') + '</strong> ' + escapeHtml(fixGrammar(card.consequence)) + '</p>';
                        if (card.errorItems && card.errorItems.length) {
                            card.errorItems.forEach(function (e) {
                                printHtml += '<p><strong>' + getLabel('printError') + '</strong> ' + escapeHtml(fixGrammar(e.error || '')) + '</p>';
                                if (e.consequence) printHtml += '<p><em>' + escapeHtml(fixGrammar(e.consequence)) + '</em></p>';
                            });
                        }
                        if (card.frameworks && card.frameworks.length) {
                            card.frameworks.forEach(function (fw) {
                                printHtml += '<p><strong>' + escapeHtml(fixGrammar(fw.name || '')) + '</strong></p>';
                                printHtml += '<p>' + escapeHtml(fixGrammar(fw.description || '')) + '</p>';
                            });
                        }
                        if (card.considerations && card.considerations.length) {
                            printHtml += '<ul>';
                            card.considerations.forEach(function (c) {
                                if (typeof c === 'object' && c !== null) {
                                    var dim = c.dimension || c.title || '';
                                    var desc = c.description || c.text || '';
                                    printHtml += '<li>' + escapeHtml(fixGrammar(dim)) + (desc ? ': ' + escapeHtml(fixGrammar(desc)) : '') + '</li>';
                                } else {
                                    printHtml += '<li>' + escapeHtml(fixGrammar(c)) + '</li>';
                                }
                            });
                            printHtml += '</ul>';
                        }
                        if (card.analysisPrompts && card.analysisPrompts.length) {
                            printHtml += '<ul>';
                            card.analysisPrompts.forEach(function (p) { printHtml += '<li>' + escapeHtml(fixGrammar(p)) + '</li>'; });
                            printHtml += '</ul>';
                        }
                        if (card.consequences && card.consequences.length) {
                            printHtml += '<ul>';
                            card.consequences.forEach(function (c) { printHtml += '<li>' + escapeHtml(fixGrammar(c)) + '</li>'; });
                            printHtml += '</ul>';
                        }
                        if (card.impactStatement) printHtml += '<p><strong>' + getLabel('printImpact') + '</strong> ' + escapeHtml(fixGrammar(card.impactStatement)) + '</p>';
                        if (card.keyMetrics && card.keyMetrics.length) {
                            printHtml += '<ul>';
                            card.keyMetrics.forEach(function (m) { printHtml += '<li>' + escapeHtml(fixGrammar(m)) + '</li>'; });
                            printHtml += '</ul>';
                        }
                        if (card.steps && card.steps.length) {
                            printHtml += '<ol>';
                            card.steps.forEach(function (s) {
                                if (typeof s === 'string') {
                                    printHtml += '<li>' + escapeHtml(fixGrammar(s)) + '</li>';
                                } else {
                                    printHtml += '<li><strong>' + escapeHtml(fixGrammar(s.step || s.action || s.text || '')) + '</strong>';
                                    if (s.detail) printHtml += '<br>' + escapeHtml(fixGrammar(s.detail));
                                    if (s.timeframe) printHtml += ' <em>(' + escapeHtml(fixGrammar(s.timeframe)) + ')</em>';
                                    printHtml += '</li>';
                                }
                            });
                            printHtml += '</ol>';
                        }
                        if (card.risks && card.risks.length) {
                            card.risks.forEach(function (r) {
                                printHtml += '<p><strong>' + getLabel('printRisk') + '</strong> ' + escapeHtml(fixGrammar(r.risk || r.text || '')) + '</p>';
                                if (r.likelihood) printHtml += '<p><strong>' + getLabel('printLikelihood') + '</strong> ' + escapeHtml(fixGrammar(r.likelihood)) + '</p>';
                                if (r.impact) printHtml += '<p>' + escapeHtml(fixGrammar(r.impact)) + '</p>';
                                if (r.consequence) printHtml += '<p><em>' + escapeHtml(fixGrammar(r.consequence)) + '</em></p>';
                                if (r.mitigation) printHtml += '<p><strong>' + getLabel('printMitigation') + '</strong> ' + escapeHtml(fixGrammar(r.mitigation)) + '</p>';
                            });
                        }
                        var prPolItems = card.policyItems || card.policies || [];
                        if (prPolItems.length) {
                            printHtml += '<div>';
                            prPolItems.forEach(function (p) {
                                if (typeof p === 'string') {
                                    printHtml += '<p>' + escapeHtml(fixGrammar(p)) + '</p>';
                                } else {
                                    if (p.policy) printHtml += '<p><strong>' + escapeHtml(fixGrammar(p.policy)) + '</strong></p>';
                                    if (p.requirement) printHtml += '<p>' + escapeHtml(fixGrammar(p.requirement)) + '</p>';
                                    if (p.consequence) printHtml += '<p><em>' + escapeHtml(fixGrammar(p.consequence)) + '</em></p>';
                                    if (p.text) printHtml += '<p>' + escapeHtml(fixGrammar(p.text)) + '</p>';
                                }
                            });
                            printHtml += '</div>';
                        }
                        if (card.keyInsight) printHtml += '<p><strong>' + getLabel('keyInsightColon') + '</strong> ' + escapeHtml(fixGrammar(card.keyInsight)) + '</p>';
                        if (card.criticalReflection) printHtml += '<p><strong>' + getLabel('criticalReflectionColon') + '</strong> ' + escapeHtml(fixGrammar(card.criticalReflection)) + '</p>';
                        if (card.conceptDefinition) printHtml += '<p><strong>' + getLabel('printDefinition') + '</strong> ' + escapeHtml(fixGrammar(card.conceptDefinition)) + '</p>';
                        if (card.significance) printHtml += '<p><strong>' + getLabel('printSignificance') + '</strong> ' + escapeHtml(fixGrammar(card.significance)) + '</p>';
                        if (card.keyTerms && card.keyTerms.length) {
                            printHtml += '<dl>';
                            card.keyTerms.forEach(function (t) { printHtml += '<dt><strong>' + escapeHtml(fixGrammar(t.term)) + '</strong></dt><dd>' + escapeHtml(fixGrammar(t.definition)) + '</dd>'; });
                            printHtml += '</dl>';
                        }
                        if (card.cognitiveConsiderations && card.cognitiveConsiderations.length) {
                            printHtml += '<ul>';
                            card.cognitiveConsiderations.forEach(function (c) { printHtml += '<li>' + escapeHtml(fixGrammar(typeof c === 'string' ? c : (c.text || c.description || ''))) + '</li>'; });
                            printHtml += '</ul>';
                        }
                        if (card.skillStatement) printHtml += '<p><strong>' + getLabel('printSkill') + '</strong> ' + escapeHtml(fixGrammar(card.skillStatement)) + '</p>';
                        if (card.relevance) printHtml += '<p>' + escapeHtml(fixGrammar(card.relevance)) + '</p>';
                        if (card.keyIndicators && card.keyIndicators.length) {
                            printHtml += '<ul>';
                            card.keyIndicators.forEach(function (ind) { printHtml += '<li>' + escapeHtml(fixGrammar(typeof ind === 'string' ? ind : (ind.text || ''))) + '</li>'; });
                            printHtml += '</ul>';
                        }
                        if (card.frameworkSteps && card.frameworkSteps.length) {
                            printHtml += '<ol>';
                            card.frameworkSteps.forEach(function (s) {
                                printHtml += '<li><strong>' + escapeHtml(fixGrammar(s.step || '')) + '</strong>';
                                if (s.explanation) printHtml += '<br>' + escapeHtml(fixGrammar(s.explanation));
                                if (s.example) printHtml += '<br><em>' + getLabel('printExample') + ' ' + escapeHtml(fixGrammar(s.example)) + '</em>';
                                printHtml += '</li>';
                            });
                            printHtml += '</ol>';
                        }
                        if (card.keyPrinciple) printHtml += '<p><strong>' + getLabel('printPrinciple') + '</strong> ' + escapeHtml(fixGrammar(card.keyPrinciple)) + '</p>';
                        if (card.applications && card.applications.length) {
                            card.applications.forEach(function (a) {
                                printHtml += '<div style="margin-bottom:8px;">';
                                printHtml += '<p><strong>' + getLabel('printSituation') + '</strong> ' + escapeHtml(fixGrammar(a.situation || '')) + '</p>';
                                printHtml += '<p><strong>' + getLabel('printAction') + '</strong> ' + escapeHtml(fixGrammar(a.action || '')) + '</p>';
                                if (a.rationale) printHtml += '<p><em>' + getLabel('printRationale') + ' ' + escapeHtml(fixGrammar(a.rationale)) + '</em></p>';
                                printHtml += '</div>';
                            });
                        }
                        if (card.pitfallItems && card.pitfallItems.length) {
                            card.pitfallItems.forEach(function (p) {
                                printHtml += '<div style="margin-bottom:8px;">';
                                printHtml += '<p><strong>' + getLabel('printPitfall') + '</strong> ' + escapeHtml(fixGrammar(p.pitfall || '')) + '</p>';
                                if (p.consequence) printHtml += '<p><em>' + getLabel('printConsequence') + ' ' + escapeHtml(fixGrammar(p.consequence)) + '</em></p>';
                                if (p.correction) printHtml += '<p>' + getLabel('printCorrection') + ' ' + escapeHtml(fixGrammar(p.correction)) + '</p>';
                                printHtml += '</div>';
                            });
                        }
                        if (card.turningPoint) printHtml += '<p><strong>' + getLabel('turningPointColon') + '</strong> ' + escapeHtml(fixGrammar(card.turningPoint)) + '</p>';
                        if (card.reflection) {
                            if (typeof card.reflection === 'string') {
                                printHtml += '<p><strong>' + getLabel('printReflection') + '</strong> ' + escapeHtml(fixGrammar(card.reflection)) + '</p>';
                            } else if (card.reflection.question) {
                                printHtml += '<p><strong>' + getLabel('printReflection') + '</strong> ' + escapeHtml(fixGrammar(card.reflection.question)) + '</p>';
                                if (card.reflection.sampleAnswers && Array.isArray(card.reflection.sampleAnswers)) {
                                    printHtml += '<ul>';
                                    card.reflection.sampleAnswers.forEach(function (a) { printHtml += '<li>' + escapeHtml(fixGrammar(a)) + '</li>'; });
                                    printHtml += '</ul>';
                                }
                            }
                        }
                        printHtml += '</div>';
                    });
                    
                    // v7.9.95: Document Activity (docActivity)
                    if (section.docActivity && section.docActivity.activityType) {
                        printHtml += '<div class="docactivity">';
                        printHtml += '<h4>' + (getLabel('documentActivity') || 'Document Activity') + '</h4>';
                        if (section.docActivity.title) printHtml += '<p><strong>' + escapeHtml(fixGrammar(section.docActivity.title)) + '</strong></p>';
                        if (section.docActivity.scenario || section.docActivity.instructions) {
                            printHtml += '<p>' + escapeHtml(fixGrammar(section.docActivity.scenario || section.docActivity.instructions)) + '</p>';
                        }
                        if (section.docActivity.questions && section.docActivity.questions.length > 0) {
                            printHtml += '<div class="doc-questions">';
                            section.docActivity.questions.forEach(function (q, idx) {
                                printHtml += '<div class="doc-question"><strong>Q' + (idx + 1) + ': ' + escapeHtml(fixGrammar(q.question || q.text)) + '</strong>';
                                if (q.options && q.options.length > 0) {
                                    printHtml += '<ul class="doc-options">';
                                    q.options.forEach(function (opt, optIdx) {
                                        var optText = typeof opt === 'string' ? opt : opt.text;
                                        var isCorrect = opt.isCorrect || opt.correct || false;
                                        var marker = isCorrect ? 'OK' : '*';
                                        printHtml += '<li>' + marker + ' ' + String.fromCharCode(65 + optIdx) + ') ' + escapeHtml(fixGrammar(optText)) + '</li>';
                                    });
                                    printHtml += '</ul>';
                                }
                                if (q.explanation || q.feedback) {
                                    printHtml += '<p><em>' + escapeHtml(fixGrammar(q.explanation || q.feedback)) + '</em></p>';
                                }
                                printHtml += '</div>';
                            });
                            printHtml += '</div>';
                        }
                        printHtml += '</div>';
                    }
                    
                    printHtml += '</div>';
                    
                    // Activity slide (if present) - v6.9.31: Include FULL activity content
                    if (section.activity && section.activity.activityType) {
                        var act = section.activity;
                        printHtml += '<div class="slide activity-slide">';
                        printHtml += '<div class="slide-header">';
                        printHtml += '<span class="slide-badge activity">' + getLabel('activitySlide') + '</span>';
                        printHtml += '<h3 class="slide-title">' + escapeHtml(fixGrammar(section.title)) + ' - ' + getLabel('practiceActivity') + '</h3>';
                        printHtml += '</div>';
                        printHtml += '<p class="slide-desc">' + getLabel('printActivityType') + ' ' + escapeHtml(fixGrammar(act.activityType)) + '</p>';
                        
                        // Common fields
                        if (act.title) printHtml += '<p><strong>' + escapeHtml(fixGrammar(act.title)) + '</strong></p>';
                        if (act.question) printHtml += '<p><strong>' + getLabel('printQuestion') + '</strong> ' + escapeHtml(fixGrammar(act.question)) + '</p>';
                        if (act.scenario) printHtml += '<p><strong>' + getLabel('printScenario') + '</strong> ' + escapeHtml(fixGrammar(act.scenario)) + '</p>';
                        if (act.scenarioIntro) printHtml += '<p><strong>' + getLabel('printScenario') + '</strong> ' + escapeHtml(fixGrammar(act.scenarioIntro)) + '</p>';
                        if (act.situation) printHtml += '<p><strong>' + getLabel('printSituation') + '</strong> ' + escapeHtml(fixGrammar(act.situation)) + '</p>';
                        if (act.context) printHtml += '<p><strong>' + getLabel('printContext') + '</strong> ' + escapeHtml(fixGrammar(act.context)) + '</p>';
                        if (act.caseDescription) printHtml += '<p><strong>' + getLabel('printCase') + '</strong> ' + escapeHtml(fixGrammar(act.caseDescription)) + '</p>';
                        if (act.prompt) printHtml += '<p><strong>' + getLabel('printPrompt') + '</strong> ' + escapeHtml(fixGrammar(act.prompt)) + '</p>';
                        
                        // Scenario Branching: Decision points
                        if (act.decisionPoints && act.decisionPoints.length) {
                            printHtml += '<div class="requirements"><h4>' + getLabel('decisionPoints') + '</h4><ul>';
                            act.decisionPoints.forEach(function (point, pIdx) {
                                printHtml += '<li><strong>' + getLabel('decisionNumber').replace('{number}', pIdx + 1) + '</strong> ' + escapeHtml(fixGrammar(point.situation));
                                if (point.options && point.options.length) {
                                    printHtml += '<ul>';
                                    point.options.forEach(function (opt, oIdx) {
                                        var marker = opt.isCorrect ? 'OK' : 'x';
                                        printHtml += '<li>' + marker + ' ' + String.fromCharCode(65 + oIdx) + ') ' + escapeHtml(fixGrammar(opt.text));
                                        if (opt.feedback) printHtml += ' <em> ->  ' + escapeHtml(fixGrammar(opt.feedback)) + '</em>';
                                        printHtml += '</li>';
                                    });
                                    printHtml += '</ul>';
                                }
                                printHtml += '</li>';
                            });
                            printHtml += '</ul></div>';
                        }
                        
                        // Best Response: Responses
                        if (act.responses && act.responses.length) {
                            printHtml += '<div class="requirements"><h4>' + getLabel('responseClassification') + '</h4><ul>';
                            act.responses.forEach(function (resp, rIdx) {
                                var classLabel = resp.classification === 'best' ? 'OK BEST' : 
                                                (resp.classification === 'acceptable' ? '* OK' : 'x NO');
                                printHtml += '<li><strong>[' + classLabel + ']</strong> ' + escapeHtml(fixGrammar(resp.text));
                                if (resp.explanation) printHtml += '<br/><em> ->  ' + escapeHtml(fixGrammar(resp.explanation)) + '</em>';
                                printHtml += '</li>';
                            });
                            printHtml += '</ul></div>';
                        }
                        
                        // What Went Wrong: Analysis questions
                        if (act.analysisQuestions && act.analysisQuestions.length) {
                            printHtml += '<div class="requirements"><h4>' + getLabel('analysisQuestions') + '</h4><ul>';
                            act.analysisQuestions.forEach(function (q, qIdx) {
                                printHtml += '<li><strong>Q' + (qIdx + 1) + ':</strong> ' + escapeHtml(fixGrammar(q.question));
                                if (q.modelAnswer) printHtml += '<br/><strong>A:</strong> ' + escapeHtml(fixGrammar(q.modelAnswer));
                                printHtml += '</li>';
                            });
                            printHtml += '</ul></div>';
                        }
                        
                        // Task Sequencing: Steps
                        if (act.steps && act.steps.length) {
                            printHtml += '<div class="requirements"><h4>' + getLabel('correctSequence') + '</h4><ol>';
                            act.steps.forEach(function (step) {
                                var stepText = typeof step === 'string' ? step : (step.text || step.description || '');
                                printHtml += '<li>' + escapeHtml(fixGrammar(stepText)) + '</li>';
                            });
                            printHtml += '</ol></div>';
                        }
                        
                        // Escalation Decision: Scenarios
                        if (act.situations && act.situations.length) {
                            printHtml += '<div class="requirements"><h4>' + getLabel('escalationSituations') + '</h4><ul>';
                            act.situations.forEach(function (sit, sIdx) {
                                printHtml += '<li><strong>' + getLabel('scenarioNumber').replace('{number}', sIdx + 1) + '</strong> ' + escapeHtml(fixGrammar(sit.situation));
                                if (sit.correctDecision) printHtml += '<br/><strong>' + getLabel('printAnswer') + '</strong> ' + escapeHtml(fixGrammar(sit.correctDecision));
                                if (sit.explanation) printHtml += '<br/><em> ->  ' + escapeHtml(fixGrammar(sit.explanation)) + '</em>';
                                printHtml += '</li>';
                            });
                            printHtml += '</ul></div>';
                        }
                        
                        // Reflection: Items
                        if (act.reflectionPrompts && act.reflectionPrompts.length) {
                            printHtml += '<div class="requirements"><h4>' + getLabel('reflectionPoints') + '</h4><ul>';
                            act.reflectionPrompts.forEach(function (rp) {
                                var itemText = typeof rp === 'string' ? rp : (rp.question || rp.prompt || '');
                                printHtml += '<li>' + escapeHtml(fixGrammar(itemText)) + '</li>';
                            });
                            printHtml += '</ul></div>';
                        }
                        
                        // Outcomes
                        if (act.finalOutcome) {
                            printHtml += '<div class="outcome"><h4>' + getLabel('outcome') + '</h4><p>' + escapeHtml(fixGrammar(act.finalOutcome)) + '</p></div>';
                        }
                        if (act.learningTakeaway) {
                            printHtml += '<div class="outcome"><h4>' + getLabel('keyTakeaway') + '</h4><p>' + escapeHtml(fixGrammar(act.learningTakeaway)) + '</p></div>';
                        }
                        
                        printHtml += '</div>';
                    }
                });
                
                printHtml += '</div>';
            });
            
            printHtml += '</body></html>';
            
            // Open print dialog in new window
            var printWindow = window.open('', '_blank');
            if (printWindow) {
                printWindow.document.write(printHtml);
                printWindow.document.close();
                
                // Wait for content to load then trigger print
                printWindow.onload = function () {
                    printWindow.print();
                };
                
                Notification.addNotification({
                    message: getLabel('downloadPdf') + ' - ' + getLabel('generatingPdf'),
                    type: 'info'
                });
            } else {
                // v13.94.3: this HTML fallback block used to sit INSIDE the success
                // branch, so a successful print also dumped an unwanted .html file to
                // disk, and a popup-blocked export did nothing at all. It now runs only
                // when window.open was blocked, which is what it was written for.
                var blob = new Blob([printHtml], { type: 'text/html;charset=utf-8' });
                var url = URL.createObjectURL(blob);
                var filename = (title).replace(/[^a-zA-Z0-9]/g, '_') + '.html';

                var a = document.createElement('a');
                a.href = url;
                a.download = filename;
                var dlRoot = document.getElementById('contentcreator-app') || document.body;
                dlRoot.appendChild(a);
                a.click();
                dlRoot.removeChild(a);
                URL.revokeObjectURL(url);

                Notification.addNotification({
                    message: getLabel('popupBlockedHtmlFallback')
                        || 'Your browser blocked the print window, so the content was downloaded as an HTML file instead.',
                    type: 'warning'
                });
            }
        },

        // ===========================================================================
        // BEHAVIOR SETTINGS MODAL (v6.7.57)
        // Allows teachers to change navigation and completion settings without regenerating content
        // ===========================================================================

        /**
         * Show settings modal (v6.7.57)
         * Displays behavioral settings that don't require content regeneration
         */
        showSettingsModal: function () {
            var self = this;
            var manifest = this.manifest;
            var settings = manifest.settings || {};
            var voiceSettings = manifest.voiceSettings || {};
            
            // Current values
            var topicNavMode = settings.topicNavMode || 'free';
            var progressionMode = settings.progressionMode || 'free';
            var slideDuration = settings.slideDuration || 5;
            var requireFullScore = settings.requireFullScore || false;
            var voiceoverEnabled = voiceSettings.enabled !== false;
            var quizVoiceEnabled = voiceSettings.quizEnabled !== false; // v13.32: Default true
            var activitySettings = manifest.activitySettings || {};
            var activitiesEnabled = activitySettings.enabled !== false;
            
            var html = '<div class="cc5-settings-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="cc5-settings-modal-title">';
            html += '<div class="cc5-settings-modal">';
            
            // Header
            html += '<div class="cc5-settings-modal-header">';
            html += '<div class="cc5-settings-header-content">';
            html += '<h3>' + getLabel('behaviorSettings') + '</h3>';
            html += '<p class="cc5-settings-subtitle">' + getLabel('settingsDescription') + '</p>';
            html += '</div>';
            html += '<button type="button" class="cc5-settings-modal-close" aria-label="' + getLabel('closeDialog') + '">' + getIcon('x') + '</button>';
            html += '</div>';
            
            // Body
            html += '<div class="cc5-settings-modal-body">';
            
            // Topic Navigation
            html += '<div class="cc5-settings-section">';
            html += '<label class="cc5-settings-label">' + getLabel('topicNavigation') + '</label>';
            html += '<div class="cc5-settings-radio-group">';
            html += '<label class="cc5-settings-radio">';
            html += '<input type="radio" name="topicNavMode" value="free"' + (topicNavMode === 'free' ? ' checked' : '') + '>';
            html += '<span class="cc5-radio-indicator"></span>';
            html += '<span class="cc5-radio-content">';
            html += '<span class="cc5-radio-title">' + getLabel('topicNavFree') + '</span>';
            html += '<span class="cc5-radio-desc">' + getLabel('topicNavFreeDesc') + '</span>';
            html += '</span>';
            html += '</label>';
            html += '<label class="cc5-settings-radio">';
            html += '<input type="radio" name="topicNavMode" value="lockstep"' + (topicNavMode === 'lockstep' ? ' checked' : '') + '>';
            html += '<span class="cc5-radio-indicator"></span>';
            html += '<span class="cc5-radio-content">';
            html += '<span class="cc5-radio-title">' + getLabel('topicNavLockstep') + '</span>';
            html += '<span class="cc5-radio-desc">' + getLabel('topicNavLockstepDesc') + '</span>';
            html += '</span>';
            html += '</label>';
            html += '</div>';
            html += '</div>';
            
            // Slide Progression
            html += '<div class="cc5-settings-section">';
            html += '<label class="cc5-settings-label">' + getLabel('slideProgression') + '</label>';
            html += '<div class="cc5-settings-radio-group">';
            html += '<label class="cc5-settings-radio">';
            html += '<input type="radio" name="progressionMode" value="free"' + (progressionMode === 'free' ? ' checked' : '') + '>';
            html += '<span class="cc5-radio-indicator"></span>';
            html += '<span class="cc5-radio-content">';
            html += '<span class="cc5-radio-title">' + getLabel('progressionFree') + '</span>';
            html += '<span class="cc5-radio-desc">' + getLabel('progressionFreeDesc') + '</span>';
            html += '</span>';
            html += '</label>';
            html += '<label class="cc5-settings-radio">';
            html += '<input type="radio" name="progressionMode" value="voiceover"' + (progressionMode === 'voiceover' ? ' checked' : '') + (voiceoverEnabled ? '' : ' disabled') + '>';
            html += '<span class="cc5-radio-indicator"></span>';
            html += '<span class="cc5-radio-content">';
            html += '<span class="cc5-radio-title">' + getLabel('progressionVoiceover') + '</span>';
            html += '<span class="cc5-radio-desc">' + getLabel('progressionVoiceoverDesc') + '</span>';
            html += '</span>';
            html += '</label>';
            html += '<label class="cc5-settings-radio">';
            html += '<input type="radio" name="progressionMode" value="timed"' + (progressionMode === 'timed' ? ' checked' : '') + '>';
            html += '<span class="cc5-radio-indicator"></span>';
            html += '<span class="cc5-radio-content">';
            html += '<span class="cc5-radio-title">' + getLabel('progressionTimed') + '</span>';
            html += '<span class="cc5-radio-desc">' + getLabel('progressionTimedDesc') + '</span>';
            html += '</span>';
            html += '</label>';
            html += '</div>';
            
            // Timed duration input (show conditionally based on progressionMode)
            html += '<div class="cc5-settings-timed-options' + (progressionMode === 'timed' ? '' : ' cc5-hidden') + '">';
            html += '<label class="cc5-settings-sublabel">' + getLabel('slideDuration') + '</label>';
            html += '<input type="number" id="cc5-slide-duration" value="' + slideDuration + '" min="3" max="600" class="cc5-settings-number-input">';
            html += '</div>';
            html += '</div>';
            
            // Activity Completion
            html += '<div class="cc5-settings-section">';
            html += '<label class="cc5-settings-label">' + getLabel('activityCompletion') + '</label>';
            html += '<label class="cc5-settings-checkbox">';
            html += '<input type="checkbox" id="cc5-require-full-score"' + (requireFullScore ? ' checked' : '') + '>';
            html += '<span class="cc5-checkbox-indicator"></span>';
            html += '<span class="cc5-checkbox-content">';
            html += '<span class="cc5-checkbox-title">' + getLabel('requireFullScore') + '</span>';
            html += '<span class="cc5-checkbox-desc">' + getLabel('requireFullScoreDesc') + '</span>';
            html += '</span>';
            html += '</label>';
            html += '</div>';
            
            // Voiceover Enabled
            html += '<div class="cc5-settings-section">';
            html += '<label class="cc5-settings-checkbox">';
            html += '<input type="checkbox" id="cc5-voiceover-enabled"' + (voiceoverEnabled ? ' checked' : '') + '>';
            html += '<span class="cc5-checkbox-indicator"></span>';
            html += '<span class="cc5-checkbox-content">';
            html += '<span class="cc5-checkbox-title">' + getLabel('voiceoverEnabled') + '</span>';
            html += '<span class="cc5-checkbox-desc">' + getLabel('voiceoverEnabledDesc') + '</span>';
            html += '</span>';
            html += '</label>';
            html += '</div>';
            
            // v11.11: Decision Challenge Activities Toggle
            html += '<div class="cc5-settings-section">';
            html += '<label class="cc5-settings-checkbox">';
            html += '<input type="checkbox" id="cc5-activities-enabled"' + (activitiesEnabled ? ' checked' : '') + '>';
            html += '<span class="cc5-checkbox-indicator"></span>';
            html += '<span class="cc5-checkbox-content">';
            html += '<span class="cc5-checkbox-title">' + getLabel('activitiesEnabled') + '</span>';
            html += '<span class="cc5-checkbox-desc">' + getLabel('activitiesEnabledDesc') + '</span>';
            html += '</span>';
            html += '</label>';
            html += '</div>';

            // v13.32: Quiz Voiceover Toggle
            html += '<div class="cc5-settings-section">';
            html += '<label class="cc5-settings-checkbox">';
            html += '<input type="checkbox" id="cc5-quiz-voice-enabled"' + (quizVoiceEnabled ? ' checked' : '') + '>';
            html += '<span class="cc5-checkbox-indicator"></span>';
            html += '<span class="cc5-checkbox-content">';
            html += '<span class="cc5-checkbox-title">' + getLabel('quizVoiceEnabled') + '</span>';
            html += '<span class="cc5-checkbox-desc">' + getLabel('quizVoiceEnabledDesc') + '</span>';
            html += '</span>';
            html += '</label>';
            html += '</div>';
            
            // v7.2.44: Bulk AI Image Generation Section
            var slidesWithoutImages = self.countSlidesWithoutImages();
            if (self.canEdit && slidesWithoutImages > 0) {
                html += '<div class="cc5-settings-section cc5-bulk-image-section">';
                html += '<label class="cc5-settings-label">' + getLabel('applyAIToAllSlides') + '</label>';
                html += '<p class="cc5-settings-desc">' + getLabel('applyAIToAllSlidesDesc') + '</p>';
                html += '<button type="button" class="cc5-bulk-generate-images-btn">';
                html += getIcon('sparkles') + ' ' + getLabel('applyAIToAllSlides');
                html += '<span class="cc5-credit-badge">' + (slidesWithoutImages * 5) + ' credits</span>';
                html += '</button>';
                html += '<p class="cc5-bulk-image-count">' + getLabel('slidesWithoutImages').replace('{count}', slidesWithoutImages) + '</p>';
                html += '</div>';
            }

            // v7.9.88: Bulk AI Voiceover Generation Section
            var slidesWithoutVoiceover = self.countSlidesWithoutVoiceover();
            if (self.canEdit && slidesWithoutVoiceover > 0) {
                html += '<div class="cc5-settings-section cc5-bulk-voiceover-section">';
                html += '<label class="cc5-settings-label">' + getLabel('applyVoiceoverToAllSlides') + '</label>';
                html += '<p class="cc5-settings-desc">' + getLabel('applyVoiceoverToAllSlidesDesc') + '</p>';
                html += '<button type="button" class="cc5-bulk-generate-voiceover-btn">';
                html += getIcon('volume2') + ' ' + getLabel('applyVoiceoverToAllSlides'); // v9.80 FIX (A-02b): hyphenated key 'volume-2' returned undefined; icon registry uses 'volume2'
                html += '<span class="cc5-credit-badge">' + (slidesWithoutVoiceover * 5) + ' credits</span>';
                html += '</button>';
                html += '<p class="cc5-bulk-voiceover-count">' + getLabel('slidesWithoutVoiceover').replace('{count}', slidesWithoutVoiceover) + '</p>';
                html += '</div>';
            }
            
            html += '</div>'; // .cc5-settings-modal-body
            
            // Footer
            html += '<div class="cc5-settings-modal-footer">';
            html += '<button type="button" class="cc5-settings-cancel-btn">' + getLabel('cancel') + '</button>';
            html += '<button type="button" class="cc5-settings-save-btn">' + getLabel('saveChanges') + '</button>';
            html += '</div>';
            
            html += '</div>'; // .cc5-settings-modal
            html += '</div>'; // .cc5-settings-modal-overlay
            
            $(document.body).append(html);
            
            // v8.4.6: Apply cc5-checked/cc5-disabled classes (replaces CSS :has() for Moodle minifier compatibility)
            $('.cc5-settings-radio, .cc5-settings-checkbox').each(function () {
                var $label = $(this);
                var $input = $label.find('input');
                if ($input.is(':checked')) { $label.addClass('cc5-checked'); }
                if ($input.is(':disabled')) { $label.addClass('cc5-disabled'); }
            });
            $(document).off('change.cc5settings').on('change.cc5settings', '.cc5-settings-radio input, .cc5-settings-checkbox input', function () {
                var $input = $(this);
                var $label = $input.closest('.cc5-settings-radio, .cc5-settings-checkbox');
                if ($input.attr('type') === 'radio') {
                    $label.closest('.cc5-settings-radio-group').find('.cc5-settings-radio').removeClass('cc5-checked');
                }
                $label.toggleClass('cc5-checked', $input.is(':checked'));
                $label.toggleClass('cc5-disabled', $input.is(':disabled'));
            });
            
            // WCAG 2.1 AA: Focus management - focus first interactive element
            setTimeout(function () {
                $('.cc5-settings-modal-close').first().focus();
            }, 100);
            
            // Toggle timed options visibility when progression mode changes
            $(document).on('change', 'input[name="progressionMode"]', function () {
                var showTimed = $(this).val() === 'timed';
                $('.cc5-settings-timed-options').toggleClass('cc5-hidden', !showTimed);
            });
            
            // Handle voiceover enabled checkbox - enable/disable voiceover progression mode
            $(document).on('change', '#cc5-voiceover-enabled', function () {
                var isEnabled = $(this).is(':checked');
                var $voLabel = $('input[name="progressionMode"][value="voiceover"]').closest('.cc5-settings-radio');
                $('input[name="progressionMode"][value="voiceover"]').prop('disabled', !isEnabled);
                $voLabel.toggleClass('cc5-disabled', !isEnabled);
                if (!isEnabled && $('input[name="progressionMode"][value="voiceover"]').is(':checked')) {
                    $('input[name="progressionMode"][value="free"]').prop('checked', true).trigger('change');
                }
            });
        },

        /**
         * Count slides without images (v7.2.44)
         */
        countSlidesWithoutImages: function () {
            var count = 0;
            var topics = this.manifest.topics || [];
            for (var i = 0; i < topics.length; i++) {
                var sections = topics[i].sections || [];
                for (var j = 0; j < sections.length; j++) {
                    var section = sections[j];
                    // Only count learning slides (not activity slides)
                    if (section.slideType !== 'activity') {
                        var hasImage = section.image && section.image.url
                            && section.image.url !== 'pregenerated'
                            && section.image.url.indexOf('data:') !== 0;
                        if (!hasImage) {
                            count++;
                        }
                    }
                }
            }
            return count;
        },

        /**
         * Count slides without voiceover (v7.9.88)
         */
        countSlidesWithoutVoiceover: function () {
            // v9.94 FIX-COUNT-STALE: Count both slides with NO voiceover URL AND slides
            // whose stored URL is stale (schema mismatch or word-count divergence > 3).
            // Previously only counted slides with no URL at all  -  sites with old wrong
            // audio always showed 0 and teachers never knew the bulk button was needed.
            var count = 0;
            var self = this;
            var topics = this.manifest.topics || [];
            for (var i = 0; i < topics.length; i++) {
                var sections = topics[i].sections || [];
                for (var j = 0; j < sections.length; j++) {
                    var section = sections[j];
                    if (section.slideType !== 'activity') {
                        var hasVoiceover = section.voiceoverUrl || self.voiceoverCache[section.id];
                        if (!hasVoiceover) {
                            count++;
                        } else if (section.voiceoverUrl && !self.voiceoverCache[section.id]) {
                            // Has stored URL  -  check if stale
                            var _cText = self.buildFullVoiceoverText(section);
                            var _cWords = _cText.split(/\s+/).length;
                            var _sWords = section.voiceoverWordCount || 0;
                            var _sSchema = section.voiceoverSchemaVersion || '';
                            // v10.51 FIX-RC3: Add hash stale check. Previously this function missed
                            // content-changed slides where word count didn't drift >3 words  -  the UI
                            // showed "0 slides to regenerate" but playVoiceover detected hash-stale
                            // and regenerated anyway, confusing teachers who saw "up to date" then
                            // heard a regen on click. All three stale-detection paths now agree.
                            var _cHash = voiceoverTextHash(_cText);
                            var _sHash = section.voiceoverTextHash || '';
                            var _schStale = _sSchema !== VOICEOVER_SCHEMA_VERSION;
                            var _wdStale = _sWords > 0 && Math.abs(_cWords - _sWords) > 3;
                            var _noFp = !_sWords;
                            var _hashStale = !!_sHash && _sHash !== _cHash;
                            if (_schStale || _wdStale || _noFp || _hashStale) {
                                count++;
                            }
                        }
                    }
                }
            }
            return count;
        },

        /**
         * Bulk generate AI images for all slides without images (v7.2.44)
         */
        bulkGenerateImages: function () {
            var self = this;
            var slidesToProcess = [];
            
            // Collect all learning slides without images
            var topics = this.manifest.topics || [];
            for (var i = 0; i < topics.length; i++) {
                var sections = topics[i].sections || [];
                for (var j = 0; j < sections.length; j++) {
                    var section = sections[j];
                    if (section.slideType !== 'activity') {
                        var hasImage = section.image && section.image.url
                            && section.image.url !== 'pregenerated'
                            && section.image.url.indexOf('data:') !== 0;
                        if (!hasImage) {
                            slidesToProcess.push({
                                sectionId: section.id,
                                topicId: topics[i].id,
                                topicIndex: i,
                                sectionIndex: j,
                                title: section.title
                            });
                        }
                    }
                }
            }
            
            if (slidesToProcess.length === 0) {
                Notification.addNotification({
                    message: getLabel('allSlidesHaveImages'),
                    type: 'info'
                });
                return;
            }
            
            // Close settings modal
            $('.cc5-settings-modal-overlay').remove();
            
            // Show progress notification
            var progressMessage = getLabel('bulkImageProgress')
                .replace('{current}', '1')
                .replace('{total}', slidesToProcess.length.toString());
            Notification.addNotification({
                message: progressMessage,
                type: 'info'
            });
            
            // Process slides sequentially to avoid overwhelming the API
            var currentIndex = 0;
            var successCount = 0;

            function processNext() {
                if (currentIndex >= slidesToProcess.length) {
                    // All done
                    var message = getLabel('bulkImageComplete') + ' (' + successCount + '/' + slidesToProcess.length + ')';
                    Notification.addNotification({
                        message: message,
                        type: successCount > 0 ? 'success' : 'error'
                    });
                    self.render();
                    return;
                }
                
                var slide = slidesToProcess[currentIndex];
                currentIndex++;
                
                // Update progress
                if (currentIndex > 1) {
                    var progressMsg = getLabel('bulkImageProgress')
                        .replace('{current}', currentIndex.toString())
                        .replace('{total}', slidesToProcess.length.toString());
                    Notification.addNotification({
                        message: progressMsg,
                        type: 'info'
                    });
                }
                
                // Generate image for this slide
                self.generateSlideImageBulk(slide.sectionId, function (success) {
                    if (success) {
                        successCount++;
                    }
                    // Small delay between requests
                    setTimeout(processNext, 1000);
                });
            }
            
            processNext();
        },

        /**
         * Bulk generate AI voiceovers for all slides without voiceover (v7.9.88)
         */
        bulkGenerateVoiceovers: function () {
            var self = this;
            var slidesToProcess = [];
            
            // v9.94 FIX-BULK-STALE: Collect learning slides with NO voiceover URL
            // AND slides whose stored URL is stale (schema mismatch / word-count drift).
            // Previously only collected slides with !voiceoverUrl  -  sites with old wrong
            // audio could never be fixed via the bulk button even though it was broken.
            var topics = this.manifest.topics || [];
            for (var i = 0; i < topics.length; i++) {
                var sections = topics[i].sections || [];
                for (var j = 0; j < sections.length; j++) {
                    var section = sections[j];
                    if (section.slideType !== 'activity') {
                        var hasVoiceover = section.voiceoverUrl || self.voiceoverCache[section.id];
                        var _needsRegen = false;
                        if (!hasVoiceover) {
                            _needsRegen = true;
                        } else if (section.voiceoverUrl && !self.voiceoverCache[section.id]) {
                            // Stale check  -  same logic as preloadVoiceovers & countSlidesWithoutVoiceover
                            var _bText = self.buildFullVoiceoverText(section);
                            var _bWords = _bText.split(/\s+/).length;
                            var _bStored = section.voiceoverWordCount || 0;
                            var _bSchema = section.voiceoverSchemaVersion || '';
                            // v10.51 FIX-RC3: Add hash stale check to match playVoiceover stale detection.
                            // Previously bulk regen skipped slides with content edits of +/-3 words or fewer,
                            // so teachers who clicked "Regenerate All" still got stale audio on those slides.
                            var _bHash = voiceoverTextHash(_bText);
                            var _bStoredHash = section.voiceoverTextHash || '';
                            var _bHashStale = !!_bStoredHash && _bStoredHash !== _bHash;
                            if (_bSchema !== VOICEOVER_SCHEMA_VERSION ||
                                (_bStored > 0 && Math.abs(_bWords - _bStored) > 3) ||
                                !_bStored ||
                                _bHashStale) {
                                _needsRegen = true;
                            }
                        }
                        if (_needsRegen) {
                            slidesToProcess.push({
                                section: section,
                                topicIndex: i,
                                sectionIndex: j
                            });
                        }
                    }
                }
            }
            
            if (slidesToProcess.length === 0) {
                Notification.addNotification({
                    message: getLabel('allSlidesHaveVoiceover'),
                    type: 'info'
                });
                return;
            }
            
            // Close settings modal
            $('.cc5-settings-modal-overlay').remove();
            
            // Show progress notification
            var progressMessage = getLabel('bulkVoiceoverProgress')
                .replace('{current}', '1')
                .replace('{total}', slidesToProcess.length.toString());
            Notification.addNotification({
                message: progressMessage,
                type: 'info'
            });
            
            // Process slides sequentially to avoid overwhelming the API
            var currentIndex = 0;
            var successCount = 0;

            function processNextVoiceover() {
                if (currentIndex >= slidesToProcess.length) {
                    // All done
                    // BUG-VOC-PERSIST FIX: Cancel any pending debounce timer and save immediately
                    // so that navigating away right after the success notification does not lose data.
                    if (self.voiceoverSaveTimer) {
                        clearTimeout(self.voiceoverSaveTimer);
                        self.voiceoverSaveTimer = null;
                    }
                    if (successCount > 0) {
                        self.saveManifestSilent();
                    }
                    var message = getLabel('bulkVoiceoverComplete') + ' (' + successCount + '/' + slidesToProcess.length + ')';
                    Notification.addNotification({
                        message: message,
                        type: successCount > 0 ? 'success' : 'error'
                    });
                    self.render();
                    return;
                }
                
                var slideData = slidesToProcess[currentIndex];
                currentIndex++;
                
                // Update progress
                if (currentIndex > 1) {
                    var progressMsg = getLabel('bulkVoiceoverProgress')
                        .replace('{current}', currentIndex.toString())
                        .replace('{total}', slidesToProcess.length.toString());
                    Notification.addNotification({
                        message: progressMsg,
                        type: 'info'
                    });
                }
                
                // Generate voiceover for this slide
                self.generateSlideVoiceoverBulk(slideData.section, slideData.topicIndex, slideData.sectionIndex, function (success) {
                    if (success) {
                        successCount++;
                    }
                    // Small delay between requests
                    setTimeout(processNextVoiceover, 1000);
                });
            }
            
            processNextVoiceover();
        },

        /**
         * v9.95 FIX-MIXED-CARDS: Synthesize voiceoverText for any card that is missing it.
         * Mutates section.cards in-place so every card has a consistent narration script
         * before TTS text is assembled. Eliminates MIXED-CARDS manifests permanently  - 
         * once bulk regen runs on an affected section the patch is saved to the manifest.
         * @param {Object} section - Section object (mutated in-place)
         * @returns {number} Number of cards that were patched
         */
        patchMissingCardVoiceoverTexts: function (section) {
            if (!section.cards || !section.cards.length) return 0;
            var patched = 0;
            section.cards.forEach(function (card) {
                if (!card) return;
                // Skip cards that already have a valid voiceoverText
                if (card.voiceoverText && card.voiceoverText.trim()) return;
                // v10.66 BUG-VO-DP-SUPPRESS: decision-point voiceover is intentionally silent.
                // The competency-summary card (Card 6) already ends with "Now, complete the
                // activity below."  -  narrating the question and options would be redundant and
                // would undermine the interactive challenge. If an author wants custom narration
                // they must set card.voiceoverText explicitly (caught by the guard above).
                if (card.cardType === 'decision-point') return;
                // Assemble narration from all known structured fields (same priority
                // order as buildFullVoiceoverText's fallback branch)
                var parts = [];
                if (card.heading)           parts.push(fixGrammar(card.heading));
                if (card.bodyText)          parts.push(fixGrammar(card.bodyText));
                // v10.47 BUG-VO-PATCH-DESC: read card.description as bodyText fallback
                // (matches buildFullVoiceoverText line 2107 which does the same fallback)
                if (!card.bodyText && card.description) parts.push(fixGrammar(card.description));
                if (card.pcStatement)       parts.push(fixGrammar(card.pcStatement));
                if (card.elementText)       parts.push(fixGrammar(card.elementText));
                // v10.47 BUG-VO-PATCH-KEYPOINTS: keyPoints[] narrated in buildFullVoiceoverText
                // (lines 2109-2111) but was absent from patchMissing  -  cards with only keyPoints
                // produced empty voiceoverText in bulk TTS path
                if (card.keyPoints && card.keyPoints.length) {
                    parts.push(card.keyPoints.map(function (p) { return fixGrammar(typeof p === 'string' ? p : (p.text || '')); }).join('. '));
                }
                // v10.47 BUG-VO-PATCH-ACTIONS: actions[] narrated in buildFullVoiceoverText
                // (lines 2143-2146) but was absent from patchMissing
                if (card.actions && card.actions.length) {
                    card.actions.forEach(function (a) {
                        if (a.heading) parts.push(fixGrammar(a.heading));
                        if (a.bullets && a.bullets.length) parts.push(a.bullets.map(function (b) { return fixGrammar(b); }).join('. '));
                    });
                }
                if (card.impactStatement)   parts.push(fixGrammar(card.impactStatement));
                if (card.summaryLine)       parts.push(fixGrammar(card.summaryLine));
                if (card.conceptDefinition) parts.push(fixGrammar(card.conceptDefinition));
                if (card.significance)      parts.push(fixGrammar(card.significance));
                if (card.keyInsight)        parts.push(fixGrammar(card.keyInsight));
                if (card.turningPoint)      parts.push(fixGrammar(card.turningPoint));
                if (card.consequence)       parts.push(fixGrammar(card.consequence));
                if (card.context)           parts.push(fixGrammar(card.context));
                if (card.keyMetrics && card.keyMetrics.length) {
                    parts.push(card.keyMetrics.map(fixGrammar).join('. '));
                }
                if (card.reflection) {
                    var r = card.reflection;
                    if (typeof r === 'string') {
                        parts.push(fixGrammar(r));
                    } else if (r && r.question) {
                        parts.push(fixGrammar(r.question));
                        if (r.sampleAnswers && r.sampleAnswers.length) {
                            parts.push(r.sampleAnswers.map(fixGrammar).join('. '));
                        }
                    }
                }
                if (card.steps && card.steps.length) {
                    card.steps.forEach(function (s) {
                        // v10.46 BUG4 FIX: 7-card mental-model uses s.step (verb-led title) not s.action
                        // (Workplace action-framework format). Read s.step || s.action || s.title.
                        var _stepLabel = s.step || s.action || s.title || '';
                        if (_stepLabel) parts.push(fixGrammar(_stepLabel));
                        if (s.detail) parts.push(fixGrammar(s.detail));
                    });
                }
                // v10.46 BUG4 FIX: sceneParts[] (hook-scenario / applied-scenario) and
                // conceptInsights[] (concept-explainer) were not handled here, causing
                // voiceoverText to stay empty for those card types (patchMissingCardVoiceoverTexts
                // only ran when voiceoverText was absent  -  so the fallback was never populated).
                if (card.sceneParts && card.sceneParts.length) {
                    card.sceneParts.forEach(function (part) {
                        if (part.title) parts.push(fixGrammar(part.title));
                        var _pt = part.text || part.content || part.description || '';
                        if (_pt) parts.push(fixGrammar(_pt));
                    });
                    if (card.highlightText) parts.push(fixGrammar(card.highlightText));
                }
                if (card.conceptInsights && card.conceptInsights.length) {
                    card.conceptInsights.forEach(function (insight) {
                        if (insight.title) parts.push(fixGrammar(insight.title));
                        var _it = insight.text || insight.content || insight.description || '';
                        if (_it) parts.push(fixGrammar(_it));
                    });
                }
                // v10.13: Add missing fields that buildFullVoiceoverText reads in multi-card path
                if (card.risks && card.risks.length) {
                    card.risks.forEach(function (r) {
                        if (r.risk || r.text) parts.push(fixGrammar(r.risk || r.text));
                        if (r.likelihood) parts.push(fixGrammar(r.likelihood));
                        if (r.impact) parts.push(fixGrammar(r.impact));
                        if (r.mitigation) parts.push(fixGrammar(r.mitigation));
                        if (r.consequence) parts.push(fixGrammar(r.consequence));
                    });
                }
                var _patchPolItems = card.policyItems || card.policies || [];
                if (_patchPolItems.length) {
                    _patchPolItems.forEach(function (p) {
                        if (p.policy) parts.push(fixGrammar(p.policy + (p.requirement ? ': ' + p.requirement : '')));
                        if (p.consequence) parts.push(fixGrammar(p.consequence));
                    });
                }
                if (card.frameworks && card.frameworks.length) {
                    card.frameworks.forEach(function (fw) {
                        if (fw.name) parts.push(fixGrammar(fw.name));
                        if (fw.originator) parts.push(fixGrammar(fw.originator));
                        if (fw.principle) parts.push(fixGrammar(fw.principle));
                        else if (fw.description) parts.push(fixGrammar(fw.description));
                        if (fw.limitation) parts.push(fixGrammar(fw.limitation));
                    });
                }
                if (card.frameworkSteps && card.frameworkSteps.length) {
                    card.frameworkSteps.forEach(function (s) {
                        if (s.step) parts.push(fixGrammar(s.step));
                        if (s.explanation) parts.push(fixGrammar(s.explanation));
                        if (s.example) parts.push(fixGrammar(s.example));
                    });
                }
                if (card.applications && card.applications.length) {
                    card.applications.forEach(function (a) {
                        if (a.situation) parts.push(fixGrammar(a.situation));
                        if (a.action) parts.push(fixGrammar(a.action));
                        if (a.rationale) parts.push(fixGrammar(a.rationale));
                    });
                }
                if (card.pitfallItems && card.pitfallItems.length) {
                    card.pitfallItems.forEach(function (p) {
                        if (p.pitfall) parts.push(fixGrammar(p.pitfall));
                        if (p.consequence) parts.push(fixGrammar(p.consequence));
                        if (p.correction) parts.push(fixGrammar(p.correction));
                    });
                }
                if (card.keyTerms && card.keyTerms.length) {
                    card.keyTerms.forEach(function (t) {
                        if (t.term && t.definition) parts.push(fixGrammar(t.term) + ' means ' + fixGrammar(t.definition));
                        else if (typeof t === 'string') parts.push(fixGrammar(t));
                    });
                }
                if (card.cognitiveConsiderations && card.cognitiveConsiderations.length) {
                    parts.push(card.cognitiveConsiderations.map(function (c) {
                        return fixGrammar(typeof c === 'string' ? c : (c.text || c.description || ''));
                    }).join('. '));
                }
                if (card.analysisPrompts && card.analysisPrompts.length) {
                    parts.push(card.analysisPrompts.map(function (p) { return fixGrammar(p); }).join('. '));
                }
                if (card.considerations && card.considerations.length) {
                    card.considerations.forEach(function (c) {
                        if (typeof c === 'string') { parts.push(fixGrammar(c)); }
                        else if (c.dimension && c.description) { parts.push(fixGrammar(c.dimension) + '. ' + fixGrammar(c.description)); }
                        else { parts.push(fixGrammar(c.text || c.description || '')); }
                    });
                }
                if (card.criticalReflection) parts.push(fixGrammar(card.criticalReflection));
                if (card.skillStatement) parts.push(fixGrammar(card.skillStatement));
                if (card.relevance) parts.push(fixGrammar(card.relevance));
                if (card.keyIndicators && card.keyIndicators.length) {
                    parts.push(card.keyIndicators.map(function (ind) {
                        return fixGrammar(typeof ind === 'string' ? ind : (ind.text || ''));
                    }).join('. '));
                }
                if (card.optimisationTips && card.optimisationTips.length) {
                    parts.push(card.optimisationTips.map(function (t) { return fixGrammar(t); }).join('. '));
                }
                // v10.35: 7-card format fields absent from original patch list
                // v10.47: removed dead card.content read (always undefined after normalizeCardSchema
                // moves card.content  ->  card.description and deletes card.content)
                if (card.highlightText) parts.push(fixGrammar(card.highlightText));
                if (card.question)      parts.push(fixGrammar(card.question));
                if (card.options && card.options.length) {
                    card.options.forEach(function (o) { if (o.text) parts.push(fixGrammar(o.text)); });
                }
                if (card.items && card.items.length) {
                    card.items.forEach(function (item) {
                        if (typeof item === 'string') { parts.push(fixGrammar(item)); }
                        else {
                            if (item.mistake)     parts.push(fixGrammar(item.mistake));
                            if (item.consequence) parts.push(fixGrammar(item.consequence));
                        }
                    });
                }
                // v10.39: competency-summary goodItems/badItems
                // v12.30 FIX (BUG-VO-COMPETENCY-HEADING): Include "What good looks like" and
                // "What to avoid" sub-headings so that any code path reading card.voiceoverText
                // directly (e.g. edit-modal staleness check, legacy display helpers) sees the
                // correct canonical sub-headings matching what cc-state.js buildVoiceoverText
                // voices via the structured goodItems/badItems branch. cc-state.js v12.30 now
                // skips the voiceoverText early-return for competency-summary when
                // goodItems/badItems are populated, so the structured path always runs and
                // these patched sub-headings are consistent with the TTS output.
                if (card.goodItems && card.goodItems.length) {
                    parts.push('What good looks like');
                    card.goodItems.forEach(function (gi) {
                        if (typeof gi === 'string') { parts.push(fixGrammar(gi)); return; }
                        // v13.95.8: narrate the benefit too, matching the badItems
                        // branch below - it is the half that says why it matters.
                        var gline = fixGrammar(gi.text || '');
                        if (gi.benefit) { gline += '. ' + fixGrammar(gi.benefit); }
                        parts.push(gline);
                    });
                }
                if (card.badItems && card.badItems.length) {
                    parts.push('What to avoid');
                    card.badItems.forEach(function (bi) {
                        if (typeof bi === 'string') { parts.push(fixGrammar(bi)); return; }
                        // v13.85: the consequence is now preserved through normalisation,
                        // so narrate it too - it is the half that explains why the mistake
                        // matters, and it was previously generated and then discarded.
                        var line = fixGrammar(bi.text || '');
                        if (bi.consequence) { line += '. ' + fixGrammar(bi.consequence); }
                        parts.push(line);
                    });
                }
                // v10.51 FIX-RC2-CTA: competency-summary always ends with "Now, complete the
                // activity below."  -  appended unconditionally by cc-state.js buildVoiceoverText.
                // v12.22 FIX: Removed the mirrored CTA push from patchMissingCardVoiceoverTexts.
                // Previously including it here caused a double CTA when buildVoiceoverText's
                // new v12.22 voiceoverText fallback (for empty goodItems/badItems) used the
                // patched voiceoverText AND then unconditionally appended the CTA again.
                // cc-state.js always appends the CTA  -  this function must NOT include it.
                if (parts.length) {
                    card.voiceoverText = parts.join('. ');
                    patched++;
                }
            });
            return patched;
        },

        /**
         * Generate voiceover for bulk operation (v7.9.88) - simplified version with callback
         */
        generateSlideVoiceoverBulk: function (section, topicIndex, sectionIndex, callback) {
            var self = this;

            // v12.48 FIX-CC-BULK-CONCURRENT: If preloadVoiceovers() already has this section
            // in-flight (voiceoverLoading=true, kept true during retry delays by v12.48 fix),
            // don't fire a second concurrent PHP curl.
            // v12.53 FIX-CC-BULK-SKIP: Previously returned callback(false) immediately, causing
            // "0/1 voiceovers generated" error even though preload was running fine in the
            // background. Fix: poll voiceoverLoading every 3s for up to 90s. When the lock
            // clears, check if preload succeeded (cache or HTTPS URL present) and call
            // callback(true). If it timed out without result, fall through to normal generation.
            if (self.voiceoverLoading[section.id]) {
                ccWarn('[Bulk Voiceover] Section ' + section.id + ' is already in preload  -  waiting for preload to complete (up to 90s)');
                var _bulkPollAttempts = 0;
                var _bulkPollInterval = setInterval(function () {
                    _bulkPollAttempts++;
                    if (!self.voiceoverLoading[section.id]) {
                        clearInterval(_bulkPollInterval);
                        var _hasAudio = self.voiceoverCache[section.id] ||
                            (typeof section.voiceoverUrl === 'string' && section.voiceoverUrl.startsWith('http'));
                        if (_hasAudio) {
                            if (callback) callback(true);
                        } else {
                            ccWarn('[Bulk Voiceover] Section ' + section.id + ' preload lock released but no audio  -  retrying via bulk');
                            // Lock is free now  -  fall through to normal generation path
                            self.generateSlideVoiceoverBulk(section, topicIndex, sectionIndex, callback);
                        }
                        return;
                    }
                    if (_bulkPollAttempts >= 30) { // 90s timeout
                        clearInterval(_bulkPollInterval);
                        ccWarn('[Bulk Voiceover] Section ' + section.id + ' poll timeout  -  preload still in progress after 90s');
                        if (callback) callback(false);
                    }
                }, 3000);
                return;
            }

            // v9.95 FIX-MIXED-CARDS: before assembling TTS text, ensure every card has
            // a voiceoverText so the audio covers the full slide content consistently.
            var _patchedCards = self.patchMissingCardVoiceoverTexts(section);
            if (_patchedCards > 0) {
                ccLog('Patched ' + _patchedCards + ' card(s) with missing voiceover text for section', section.id);
            }

            var text = this.buildFullVoiceoverText(section);
            
            if (!text || text.length < 10) {
                if (callback) callback(false);
                return;
            }

            // v12.48: Claim the loading lock so nothing else tries to generate concurrently.
            self.voiceoverLoading[section.id] = true;
            
            var formData = new FormData();
            formData.append('sesskey', Config.sesskey);
            formData.append('action', 'generate_voice');
            formData.append('cmid', this.cmid);
            formData.append('text', text);
            formData.append('sectionid', section.id);
                formData.append('subtopickey', section.billingKey || '');
            // v12.79 FIX-CC-REGEN-LANG: Use activeLang when the teacher/student is viewing
            // an additional language — was always sending the primary voiceLanguage.
            formData.append('language', (this.activeLang || this.voiceLanguage));
            formData.append('voice', this.voiceName);
            
            var ajaxUrl = CcState.ajaxUrl();
            
            CcState.fetchWithDeadline(ajaxUrl, {
                method: 'POST',
                body: formData
            })
            .then(function (response) {
                if (!response.ok) throw new Error('Server returned ' + response.status);
                return response.json();
            })
            .then(function (data) {
                delete self.voiceoverLoading[section.id];
                if (data.success && data.audioContent) {
                    var audioUrl = 'data:' + data.audioType + ';base64,' + data.audioContent;
                    self.voiceoverCache[section.id] = audioUrl;
                    // v13.94.6: stamp the entry so it can be validated on replay.
                    self.voiceoverCacheHash = self.voiceoverCacheHash || {};
                    self.voiceoverCacheHash[section.id] = section.voiceoverTextHash
                        || voiceoverTextHash(self.buildFullVoiceoverText(section));
                    
                    // v11.77 FIX: Persist to Moodle file store immediately so the HTTPS URL
                    // is written to the manifest before saveManifestSilent runs. Previously
                    // _bulkSec.voiceoverUrl was set to the raw data: URL which stripAudio()
                    // immediately converted to 'pregenerated'  -  every student then hit the
                    // sentinel and waited for on-demand TTS. Now the HTTPS URL survives
                    // stripAudio()  ->  students play instantly from pluginfile.php.
                    if (self.manifest.topics[topicIndex] && self.manifest.topics[topicIndex].sections[sectionIndex]) {
                        var _bulkSec = self.manifest.topics[topicIndex].sections[sectionIndex];
                        var _bulkVoText = self.buildFullVoiceoverText(_bulkSec);
                        _bulkSec.voiceoverWordCount = _bulkVoText.split(/\s+/).length;
                        _bulkSec.voiceoverSchemaVersion = VOICEOVER_SCHEMA_VERSION;
                        _bulkSec.voiceoverTextHash = voiceoverTextHash(_bulkVoText); // v9.98
                        // persistVoiceoverToFileStore sets _bulkSec.voiceoverUrl = httpsUrl
                        // and schedules saveManifestSilent (debounced 3 s).
                        self.persistVoiceoverToFileStore(data.audioContent, data.audioType, section.id, _bulkSec);
                    }
                    
                    if (callback) callback(true);
                } else {
                    if (callback) callback(false);
                }
            })
            .catch(function (error) {
                delete self.voiceoverLoading[section.id];
                ccError('[Bulk Voiceover] Error:', error);
                if (callback) callback(false);
            });
        },

        /**
         * Generate image for bulk operation (v7.2.44) - simplified version with callback
         */
        generateSlideImageBulk: function (sectionId, callback) {
            var self = this;
            var sectionData = this.findSectionById(sectionId);
            if (!sectionData) {
                if (callback) callback(false);
                return;
            }
            
            var section = sectionData.section;
            var context = this.manifest.context || {};

            // BUG-GAL-AI-PROMPT-EMPTY FIX: for 7-card unified sections, section.description
            // is always empty  -  content lives in section.cards[].  Build a rich fallback
            // from the first available card text so the AI has meaningful context.
            var _slideDesc = section.description || '';
            if (!_slideDesc && section.cards && section.cards.length > 0) {
                var _descParts = [];
                section.cards.forEach(function (card) {
                    var _t = card.bodyText || card.heading || card.highlightText || '';
                    if (_t && _descParts.length < 2) _descParts.push(_t);
                    if (!_t && card.sceneParts && card.sceneParts.length) {
                        var _sp = card.sceneParts[0];
                        var _spt = (_sp.text || _sp.content || _sp.description || '');
                        if (_spt && _descParts.length < 2) _descParts.push(_spt);
                    }
                });
                _slideDesc = _descParts.join(' ');
            }

            // Build request
            // FIX-CC-IMGGEN-BULKCTX (v13.23): Added missing context fields topicTitle,
            // subIndustry, country, state, scenarioContext. The server uses all of these
            // in the Gemini meta-prompt (stage 1 of generate-image). Without them, Gemini
            // produced prompts missing correct country PPE, sub-industry details, and the
            // hook-scenario narrative — resulting in generic images unrelated to the slide.
            var _bulkFirstCard = section.cards && section.cards.length > 0 ? section.cards[0] : {};
            var _bulkScenario = _bulkFirstCard.title
                ? (_bulkFirstCard.title + '. ' + (_bulkFirstCard.content || _bulkFirstCard.description || '')).trim()
                : (_bulkFirstCard.content || _bulkFirstCard.description || '');
            var requestData = {
                // FIX-CC-SUBTOPIC-BILLING-KEY (v13.95.2): the bulk route sends no
                // isRegeneration flag, so without these the vendor cannot tell a first fill
                // from a second sweep over the same deck.
                subtopicKey: section.billingKey || '',
                sectionId: String(section.id || ''),
                slideTitle: section.title,
                slideDescription: _slideDesc,
                requirements: (section.requirements || []).map(function (r) { return typeof r === 'string' ? r : r.text || ''; }),
                topicTitle: context.unitTitle || section.title || '',
                unitCode: context.unitCode || '',
                unitTitle: context.unitTitle || '',
                industry: context.industry || '',
                subIndustry: context.subIndustry || context.industrySector || '',
                workplace: context.workplace || '',
                jobRole: context.jobRole || context.jobTitle || '',
                country: context.country || 'Australia',
                state: context.state || '',
                route: context.route || this.manifest.mode || 'vet',
                scenarioContext: _bulkScenario.substring(0, 600)
            };
            
            // Make the request
            var formData = new FormData();
            formData.append('action', 'generate_image');
            formData.append('cmid', this.cmid);
            formData.append('sesskey', Config.sesskey);
            formData.append('data', JSON.stringify(requestData));
            
            var ajaxUrl = CcState.ajaxUrl();
            
            $.ajax({
                url: ajaxUrl,
                type: 'POST',
                data: formData,
                processData: false,
                contentType: false,
                // FIX-CC-IMAGE-TIMEOUT-DISCARDS-PAID-WORK (v13.95.1): the server allows the vendor
                // 180s and image generation takes 30-120s, so a 120s client timeout threw away
                // images that had already been charged at 5 credits each.
                timeout: 210000
            }).done(function (response) {
                try {
                    var data = typeof response === 'string' ? JSON.parse(response) : response;
                    if (data.success && data.images && data.images.length > 0) {
                        // Apply first image to slide
                        var selectedImage = data.images[0];
                        self.manifest.topics[sectionData.topicIndex].sections[sectionData.sectionIndex].image = {
                            url: selectedImage.url,
                            prompt: selectedImage.prompt || requestData.slideTitle,
                            generatedAt: new Date().toISOString()
                        };
                        
                        // Save remaining images to gallery
                        if (data.images.length > 1) {
                            if (!self.manifest.imageGallery) {
                                self.manifest.imageGallery = [];
                            }
                            for (var i = 1; i < data.images.length; i++) {
                                self.manifest.imageGallery.push({
                                    url: data.images[i].url,
                                    prompt: data.images[i].prompt || requestData.slideTitle,
                                    addedAt: new Date().toISOString()
                                });
                            }
                        }
                        
                        // Save manifest
                        self.saveManifestSilent();
                        if (callback) callback(true);
                    } else {
                        // BUG-BULK-DOUBLE-CALLBACK FIX (v11.02): old code called
                        // callback(true) then callback(false) on every success  -  the
                        // second call double-counted failures and fired processNext()
                        // twice, causing concurrent API requests and incorrect totals.
                        if (callback) callback(false);
                    }
                } catch (e) {
                    if (callback) callback(false);
                }
            }).fail(function (xhr, status, error) {
                ccError('Bulk slide image generation failed', xhr && xhr.status, error);
                if (callback) callback(false);
            });
        },

        /**
         * v11.70: Persist pre-generated voiceover audio to Moodle's file store and store the
         * returned HTTPS URL in the manifest section object.
         *
         * WHY THIS EXISTS:
         * Previously, voiceover save-back stored the raw base64 data: URL in section.voiceoverUrl.
         * saveManifestSilent's stripAudio() converts every data: URL to the string 'pregenerated'
         * before saving to DB, so the URL was NEVER persisted. Every student session started cold  - 
         * hitting the sentinel, falling through to on-demand TTS generation, waiting 3 - 8 seconds,
         * and burning a TTS credit. This function breaks that cycle:
         *
         *   TTS success  ->  persistVoiceoverToFileStore()  ->  PHP writes audio to Moodle file store
         *    ->  returns pluginfile.php HTTPS URL  ->  stored in section.voiceoverUrl in manifest
         *    ->  saveManifestSilent() runs  ->  stripAudio() leaves HTTPS URL untouched (only strips data:)
         *    ->  DB has HTTPS URL  ->  students play instantly from pluginfile.php, no TTS call needed.
         *
         * @param {string} audioContent  Base64-encoded audio (raw, no data: prefix).
         * @param {string} audioType     MIME type, e.g. 'audio/ogg'.
         * @param {string} sectionId     Section identifier used for the filename.
         * @param {object} manifestSection  The actual manifest section object to update with the URL.
         */
        persistVoiceoverToFileStore: function (audioContent, audioType, sectionId, manifestSection) {
            var self = this;
            if (!audioContent || !manifestSection) { return; }

            var formData = new FormData();
            formData.append('sesskey', Config.sesskey);
            formData.append('action', 'save_voiceover_file');
            formData.append('cmid', self.cmid);
            formData.append('sectionid', String(sectionId || 'section'));
            formData.append('audiocontent', audioContent);
            formData.append('audiotype', audioType || 'audio/ogg');

            var ajaxUrl = CcState.ajaxUrl();
            CcState.fetchWithDeadline(ajaxUrl, { method: 'POST', body: formData })
                .then(function (r) {
                    if (!r.ok) { throw new Error('HTTP ' + r.status); }
                    return r.json();
                })
                .then(function (data) {
                    if (data.success && data.url) {
                        manifestSection.voiceoverUrl = data.url;
                        // v11.86 MICRO FIX: Set voiceoverStatus='complete' ONLY here, after the
                        // HTTPS URL is confirmed stored in the Moodle file store. This makes the
                        // system truly idempotent  -  a failed persist leaves status='pending' so
                        // FIX 3 forces regeneration on the next teacher load (no silent data loss,
                        // no double-pay risk from a stale 'complete' status with no stored URL).
                        manifestSection.voiceoverStatus = 'complete';

                        // FIX-CC-VOICECOMPLETE-RACE (v13.14): checkComplete() fires before
                        // persistVoiceoverToFileStore resolves, so it always sees
                        // voiceoverStatus='pending' and saves voiceoversComplete=false. This
                        // leaves play buttons disabled even though audio is fully ready. Fix:
                        // after each persist, re-evaluate voiceoversComplete from the current
                        // language's sections and immediately update both the flag and buttons.
                        var _reTopicContainer = self.activeLang
                            ? (function () {
                                var _ml = self.manifest.multiLanguage || [];
                                for (var _ri = 0; _ri < _ml.length; _ri++) {
                                    if (_ml[_ri].code === self.activeLang) { return _ml[_ri]; }
                                }
                                return null;
                            })()
                            : self.manifest;
                        var _reSects = [];
                        ((_reTopicContainer && _reTopicContainer.topics) || []).forEach(function (t) {
                            (t.sections || []).forEach(function (s) { _reSects.push(s); });
                        });
                        if (_reSects.length > 0 && CcVoiceover.allVoiceoversComplete(_reSects)) {
                            self.manifest.voiceoversComplete = true;
                            // Re-enable any voiceover buttons that checkComplete left disabled
                            // because it fired before the async persist completed.
                            self.container.find('.cc5-voiceover-btn-large[disabled]')
                                .prop('disabled', false)
                                .attr('title', 'Play voiceover');
                            ccLog('%c[VOICEOVER v' + CC_VERSION + '] FIX-CC-VOICECOMPLETE-RACE: all sections now complete — voiceoversComplete set to true, buttons re-enabled', 'color:#10b981;font-weight:bold');
                        }

                        // Debounce: clear any pending timer so multiple concurrent saves
                        // coalesce into one manifest write after all sections complete.
                        if (self.voiceoverSaveTimer) { clearTimeout(self.voiceoverSaveTimer); }
                        self.voiceoverSaveTimer = setTimeout(function () {
                            self.saveManifestSilent();
                            self.voiceoverSaveTimer = null;
                        }, 3000);
                    } else {
                        ccWarn('[VOICEOVER v' + CC_VERSION + '] FILE STORE FAIL section ' + sectionId + ' | ' + (data.error || 'no url returned'));
                    }
                })
                .catch(function (e) {
                    ccWarn('[VOICEOVER v' + CC_VERSION + '] FILE STORE ERROR section ' + sectionId + ' | ' + e.message);
                });
        },

        /**
         * Save manifest silently without notification (v7.2.44)
         */
        saveManifestSilent: function () {
            var self = this;
            // BUG-CC-MSGCHAN + BUG-CC-DBWRITE fix (v11.49):
            // 1. stripAudio() removes base64 data: URLs from manifest before every save
            //    (reduces payload from 6 - 10 MB to <1 MB, prevents MySQL max_allowed_packet errors).
            // 2. Both direct-save and chunked-save now retry up to MAX_SAVE_RETRIES times
            //    with exponential back-off  -  handles Moodle 4.4+ service-worker message channel
            //    drops that fire immediately after voiceover generation.
            var MAX_SAVE_RETRIES = 3;
            var CHUNK_THRESHOLD = 2 * 1024 * 1024; // 2 MB
            var CHUNK_SIZE      = 900 * 1024;       // 900 KB per chunk

            function stripAudio(obj) {
                if (Array.isArray(obj)) { return obj.map(stripAudio); }
                if (obj && typeof obj === 'object') {
                    var out = {};
                    Object.keys(obj).forEach(function (k) {
                        if ((k === 'voiceoverUrl' || k === 'audioUrl') && typeof obj[k] === 'string' && obj[k].indexOf('data:') === 0) {
                            // v11.51 FIX: Use 'pregenerated' sentinel instead of '' so that
                            // - priorityPreloadCurrentSlide guard (if voiceoverUrl) correctly returns
                            // - INIT count does not report these as MISSING
                            // - playVoiceover sentinel handler falls through to on-demand generation
                            out[k] = 'pregenerated';
                        } else if (k === 'voiceoverStatus' && obj[k] === 'failed') {
                            // v12.45 FIX: Do NOT persist 'failed' status to the DB.
                            // When 'failed' is saved, subsequent page loads treat the section as
                            // "not blocking"  -  they silently retry in the background with no visible
                            // progress. The teacher sees a section with no audio and no indication
                            // of what is happening.
                            // By omitting 'failed' from the persisted manifest, the section looks
                            // brand-new on reload (no URL, no status). isVoiceoverGenerationPending()
                            // returns true for it, the wait screen shows, and regeneration is visible.
                            // 'failed' still exists in memory during the current session  -  the gate
                            // and UI use it correctly  -  it just never reaches the DB.
                        } else {
                            out[k] = stripAudio(obj[k]);
                        }
                    });
                    return out;
                }
                return obj;
            }

            // v12.93 FIX-CC-SAVE-LANG-MANIFEST: Use buildSaveManifest() so that when a
            // teacher has an additional language active (activeLang set, manifest.topics
            // pointing at e.g. Vietnamese topics), the DB always receives the PRIMARY topics.
            // Previously stripAudio(self.manifest) serialised whatever manifest.topics
            // pointed to at call time — if the teacher had switched languages and preload
            // then completed and called saveManifestSilent(), the additional-language topics
            // were written to the DB as the primary, corrupting all subsequent page loads.
            // buildSaveManifest() returns Object.assign({}, manifest, { topics: _primaryTopics })
            // when activeLang is set, guaranteeing primary topics are always persisted.
            var cleanManifest = stripAudio(self.buildSaveManifest());
            var manifestStr = JSON.stringify(cleanManifest);
            if (manifestStr.length <= CHUNK_THRESHOLD) {
                // Direct save with retry. Function expression, not a declaration: it was
                // previously declared inside this if-block, which is invalid in strict mode
                // and only worked because of legacy function hoisting.
                var attemptDirectSave = function (attempt) {
                    Ajax.call([{
                        methodname: 'mod_contentcreator_save_manifest',
                        args: { cmid: self.cmid, manifest: manifestStr }
                    }])[0].done(function (response) {
                        if (response && response.success === false) {
                            ccError('[CC SAVE] saveManifestSilent attempt ' + attempt + ' reported failure: ' + response.message);
                            if (attempt < MAX_SAVE_RETRIES) {
                                setTimeout(function () { attemptDirectSave(attempt + 1); }, 1000 * attempt);
                            } else {
                                ccError('[CC SAVE] saveManifestSilent: all ' + MAX_SAVE_RETRIES + ' direct retries exhausted.');
                            }
                        }
                    }).fail(function (error) {
                        ccError('[CC SAVE] saveManifestSilent direct attempt ' + attempt + ' FAILED: ' + (error && (error.message || JSON.stringify(error)) || 'unknown'));
                        if (attempt < MAX_SAVE_RETRIES) {
                            setTimeout(function () { attemptDirectSave(attempt + 1); }, 1000 * attempt);
                        } else {
                            ccError('[CC SAVE] saveManifestSilent: all ' + MAX_SAVE_RETRIES + ' direct retries exhausted.');
                        }
                    });
                };
                attemptDirectSave(1);
                return;
            }

            // Chunked save with retry (entire sequence retried with fresh uploadId)
            var totalChunks = Math.ceil(manifestStr.length / CHUNK_SIZE);
            var version = new Date().toISOString().substr(0, 19);
            function attemptChunkedSave(attempt) {
                var uploadId = 'cc5_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                function sendChunk(index) {
                    var start = index * CHUNK_SIZE;
                    var chunk = manifestStr.substr(start, CHUNK_SIZE);
                    var isLast = (index === totalChunks - 1) ? 1 : 0;

                    Ajax.call([{
                        methodname: 'mod_contentcreator_save_manifest_chunk',
                        args: {
                            cmid: self.cmid,
                            uploadid: uploadId,
                            chunk: chunk,
                            chunkindex: index,
                            totalchunks: totalChunks,
                            islast: isLast,
                            version: isLast ? version : ''
                        }
                    }])[0].done(function (response) {
                        if (response && response.success === false) {
                            ccError('[CC SAVE] Chunk ' + index + ' attempt ' + attempt + ' failed: ' + response.message);
                            if (attempt < MAX_SAVE_RETRIES) {
                                setTimeout(function () { attemptChunkedSave(attempt + 1); }, 1000 * attempt);
                            } else {
                                ccError('[CC SAVE] saveManifestSilent: all ' + MAX_SAVE_RETRIES + ' chunked retries exhausted.');
                            }
                            return;
                        }
                        if (!isLast) {
                            sendChunk(index + 1);
                        }
                    }).fail(function (error) {
                        ccError('[CC SAVE] Chunk ' + index + ' attempt ' + attempt + ' FAILED: ' + (error && (error.message || JSON.stringify(error)) || 'unknown'));
                        if (attempt < MAX_SAVE_RETRIES) {
                            setTimeout(function () { attemptChunkedSave(attempt + 1); }, 1000 * attempt);
                        } else {
                            ccError('[CC SAVE] saveManifestSilent: all ' + MAX_SAVE_RETRIES + ' chunked retries exhausted.');
                        }
                    });
                }

                sendChunk(0);
            }

            attemptChunkedSave(1);
        },

        /**
         * Save settings from modal (v6.7.57)
         */
        saveSettings: function () {
            var self = this;
            
            // Gather values from modal
            var topicNavMode = $('input[name="topicNavMode"]:checked').val() || 'free';
            var progressionMode = $('input[name="progressionMode"]:checked').val() || 'free';
            var slideDuration = parseInt($('#cc5-slide-duration').val()) || 5;
            var requireFullScore = $('#cc5-require-full-score').is(':checked');
            var voiceoverEnabled = $('#cc5-voiceover-enabled').is(':checked');
            var activitiesEnabled = $('#cc5-activities-enabled').is(':checked');
            var quizVoiceEnabled = $('#cc5-quiz-voice-enabled').is(':checked');
            
            // Clamp slide duration
            if (slideDuration < 3) slideDuration = 3;
            if (slideDuration > 600) slideDuration = 600;
            
            // Update manifest settings
            if (!self.manifest.settings) {
                self.manifest.settings = {};
            }
            self.manifest.settings.topicNavMode = topicNavMode;
            self.manifest.settings.progressionMode = progressionMode;
            self.manifest.settings.slideDuration = slideDuration;
            self.manifest.settings.requireFullScore = requireFullScore;
            
            // Update voiceSettings
            if (!self.manifest.voiceSettings) {
                self.manifest.voiceSettings = {};
            }
            self.manifest.voiceSettings.enabled = voiceoverEnabled;
            self.manifest.voiceSettings.quizEnabled = quizVoiceEnabled; // v13.32
            
            // v11.11: Update activitySettings
            if (!self.manifest.activitySettings) {
                self.manifest.activitySettings = {};
            }
            self.manifest.activitySettings.enabled = activitiesEnabled;
            
            // Update instance variables
            self.progressionMode = progressionMode;
            self.slideDuration = slideDuration;
            self.requireFullScore = requireFullScore;
            self.voiceoverEnabled = voiceoverEnabled;
            self.quizVoiceEnabled = quizVoiceEnabled; // v13.32
            self.activitiesEnabled = activitiesEnabled;
            
            // Save manifest via AJAX
            Ajax.call([{
                methodname: 'mod_contentcreator_save_manifest',
                args: {
                    cmid: self.cmid,
                    manifest: JSON.stringify(self.manifest)
                }
            }])[0].done(function (response) {
                if (response.success !== false) {
                    
                    Notification.addNotification({
                        message: getLabel('settingsSaved'),
                        type: 'success'
                    });
                    
                    // Close modal
                    $('.cc5-settings-modal-overlay').remove();
                    
                    // Re-render to apply new settings
                    self.render();
                } else {
                    Notification.addNotification({
                        message: getLabel('settingsSaveFailed'),
                        type: 'error'
                    });
                }
            }).fail(function (error) {
                Notification.addNotification({
                    message: getLabel('settingsSaveFailed'),
                    type: 'error'
                });
            });
        },

        // ===========================================================================
        // SLIDE IMAGE MANAGEMENT (v6.6.67)
        // Functions for adding, generating, uploading, and removing slide images
        // ===========================================================================

        /**
         * Show image source selection modal (v6.6.67)
         */
        showImageModal: function (sectionId, topicId) {
            var self = this;
            // v6.6.78: Ensure sectionId is always a string (fixes "3.1" being parsed as float)
            sectionId = String(sectionId);
            var section = this.findSectionById(sectionId);
            if (!section) {
                return;
            }
            
            var html = '<div class="cc5-image-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="cc5-image-modal-title">';
            html += '<div class="cc5-image-modal">';
            html += '<div class="cc5-image-modal-header">';
            html += '<h3>' + getLabel('chooseImageSource') + '</h3>';
            html += '<button type="button" class="cc5-image-modal-close" aria-label="' + getLabel('closeDialog') + '">' + getIcon('x') + '</button>';
            html += '</div>';
            html += '<div class="cc5-image-modal-body">';
            
            // Generate with AI option
            html += '<button type="button" class="cc5-image-option cc5-image-generate-option" data-section-id="' + escapeHtml(sectionId) + '">';
            html += '<div class="cc5-image-option-icon">' + getIcon('sparkles') + '</div>';
            html += '<div class="cc5-image-option-content">';
            html += '<div class="cc5-image-option-title">' + getLabel('generateAIImage') + '</div>';
            html += '<div class="cc5-image-option-desc">' + getLabel('imageCreditWarning') + '</div>';
            html += '</div>';
            html += '<div class="cc5-image-option-badge cc5-credit-badge">' + getLabel('imageCreditCost') + '</div>';
            html += '</button>';
            
            // Upload option
            html += '<button type="button" class="cc5-image-option cc5-image-upload-option" style="cursor:pointer!important;" data-section-id="' + escapeHtml(sectionId) + '">';
            html += '<div class="cc5-image-option-icon">' + getIcon('upload') + '</div>';
            html += '<div class="cc5-image-option-content">';
            html += '<div class="cc5-image-option-title">' + getLabel('uploadFromDevice') + '</div>';
            html += '<div class="cc5-image-option-desc">' + getLabel('imageUploadHint') + '</div>';
            html += '</div>';
            html += '<div class="cc5-image-option-badge cc5-free-badge">' + getLabel('freeUpload') + '</div>';
            html += '</button>';
            
            // v7.2.67: ALWAYS show gallery option - count all previously purchased images
            // Includes: saved gallery images + all slide images already generated.
            // BUG-GAL-COUNT-DOUBLE FIX: collectAllManifestImages() already merges
            // imageGallery[] into its output (step 2 of that function).  Adding
            // imageGallery.length on top double-counts those items.  Use only
            // collectAllManifestImages().length  -  it is already the correct total.
            var totalImages = self.collectAllManifestImages ? self.collectAllManifestImages().length : 0;

            // Always show gallery option so users can access their purchased images
            html += '<button type="button" class="cc5-image-option cc5-image-gallery-option" data-section-id="' + escapeHtml(sectionId) + '">';
            html += '<div class="cc5-image-option-icon">' + getIcon('gallery') + '</div>';
            html += '<div class="cc5-image-option-content">';
            html += '<div class="cc5-image-option-title">' + getLabel('imageGallery') + '</div>';
            html += '<div class="cc5-image-option-desc">' + getLabel('galleryDesc') + '</div>';
            html += '</div>';
            // BUG-GAL-BADGE-LABEL FIX: was `totalImages + ' ' + getLabel('freeUpload')`
            // which rendered "3 Free"  -  nonsensical on a gallery count badge.
            // Now shows count in parentheses with no misleading label.
            if (totalImages > 0) {
                html += '<div class="cc5-image-option-badge cc5-free-badge">(' + totalImages + ')</div>';
            }
            html += '</button>';
            
            // Community Gallery option (v11.29)
            html += '<button type="button" class="cc5-image-option cc5-image-community-option" data-section-id="' + escapeHtml(sectionId) + '">';
            html += '<div class="cc5-image-option-icon">' + getIcon('globe') + '</div>';
            html += '<div class="cc5-image-option-content">';
            html += '<div class="cc5-image-option-title">' + getLabel('communityGallery') + '</div>';
            html += '<div class="cc5-image-option-desc">' + getLabel('communityGalleryDesc') + '</div>';
            html += '</div>';
            html += '<div class="cc5-image-option-badge cc5-credit-badge">1 credit</div>';
            html += '</button>';
            
            // Hidden file input for upload
            html += '<input type="file" class="cc5-image-file-input" accept="image/jpeg,image/png,image/webp,image/gif" style="display:none;">';
            
            html += '</div>'; // .cc5-image-modal-body
            html += '</div>'; // .cc5-image-modal
            html += '</div>'; // .cc5-image-modal-overlay
            
            $(document.body).append(html);
            
            // WCAG 2.1 AA: Focus management - focus first interactive element
            // BUG-GAL-FOCUS-SELECTOR FIX: was .cc5-settings-modal-close (settings modal
            // close button  -  a different element).  Image modals use .cc5-image-modal-close.
            setTimeout(function () {
                $('.cc5-image-modal-close').first().focus();
            }, 100);
        },

        /**
         * Find section in manifest by ID (v6.6.67)
         */
        findSectionById: function (sectionId) {
            // v6.6.78: Ensure sectionId is always a string for comparison
            sectionId = String(sectionId);
            var topics = this.manifest.topics || [];
            for (var i = 0; i < topics.length; i++) {
                var sections = topics[i].sections || [];
                for (var j = 0; j < sections.length; j++) {
                    // Compare as strings to handle numeric-like IDs
                    if (String(sections[j].id) === sectionId || String(sections[j].pcNumber) === sectionId) {
                        return { section: sections[j], topicIndex: i, sectionIndex: j };
                    }
                }
            }
            return null;
        },

        /**
         * FIX-CC-MULTILANG-IMAGE: Mirror an image write to the primary-language topics.
         * When activeLang is set, manifest.topics is the additional-language array.
         * Any image assigned via topicIndex/sectionIndex is only written to that array.
         * This helper also writes the same image to the matching primary section so:
         *   (a) Switching back to primary still shows the image.
         *   (b) Saving the manifest (which must always use primary topics) keeps the image.
         * Safe to call unconditionally — does nothing when activeLang is null/empty.
         */
        mirrorImageToPrimary: function (topicIndex, sectionIndex, imageData) {
            if (!this.activeLang || !this._primaryTopics) { return; }
            var primTopic = this._primaryTopics[topicIndex];
            if (!primTopic) { return; }
            var primSects = primTopic.sections || [];
            // Match by position first (same index); fall back to ID match in case
            // additional-language topics have a different ordering.
            var mlTopics = this.manifest.topics || [];
            var mlTopic = mlTopics[topicIndex];
            var mlSection = mlTopic && mlTopic.sections ? mlTopic.sections[sectionIndex] : null;
            var targetPrimSection = null;
            if (mlSection) {
                for (var _i = 0; _i < primSects.length; _i++) {
                    if (String(primSects[_i].id) === String(mlSection.id)) {
                        targetPrimSection = primSects[_i];
                        break;
                    }
                }
            }
            if (!targetPrimSection && primSects[sectionIndex]) {
                targetPrimSection = primSects[sectionIndex];
            }
            if (targetPrimSection) {
                targetPrimSection.image = imageData;
            }
        },

        /**
         * FIX-CC-MULTILANG-IMAGE: Return a manifest object safe for JSON serialisation.
         * When activeLang is set, manifest.topics is the additional-language array.
         * Saving JSON.stringify(manifest) at that point would overwrite the primary
         * topics key with additional-language content, corrupting the manifest.
         * This helper returns a shallow clone with topics restored to primary so every
         * save operation always persists the correct primary topics structure.
         */
        buildSaveManifest: function () {
            if (!this.activeLang || !this._primaryTopics) {
                return this.manifest;
            }
            return Object.assign({}, this.manifest, { topics: this._primaryTopics });
        },

        /**
         * Show regenerate image modal with custom prompt input (v6.6.69)
         */
        showRegenerateModal: function (sectionId) {
            
            var html = '<div class="cc5-image-modal-overlay cc5-regenerate-modal-overlay">';
            html += '<div class="cc5-image-modal cc5-regenerate-modal">';
            html += '<div class="cc5-image-modal-header">';
            html += '<h3>' + getLabel('regenerateImageTitle') + '</h3>';
            html += '<button type="button" class="cc5-image-modal-close" aria-label="' + getLabel('closeDialog') + '">' + getIcon('x') + '</button>';
            html += '</div>';
            html += '<div class="cc5-image-modal-body">';
            
            html += '<p class="cc5-regen-desc">' + getLabel('regenerateInstructions') + '</p>';
            html += '<textarea class="cc5-regen-prompt-input" id="cc5-regen-prompt" placeholder="' + escapeHtml(getLabel('regeneratePlaceholder')) + '" rows="3"></textarea>';
            
            html += '<div class="cc5-regen-cost-notice">';
            html += '<span class="cc5-credit-badge">' + getLabel('imageRegenerateCost') + '</span>';
            html += '</div>';
            
            html += '<div class="cc5-regen-buttons">';
            html += '<button type="button" class="cc5-regen-cancel-btn">' + getLabel('regenerateCancel') + '</button>';
            html += '<button type="button" class="cc5-regen-confirm-btn" data-section-id="' + escapeHtml(sectionId) + '">' + getLabel('regenerateConfirm') + '</button>';
            html += '</div>';
            
            html += '</div>'; // .cc5-image-modal-body
            html += '</div>'; // .cc5-image-modal
            html += '</div>'; // .cc5-image-modal-overlay
            
            $(document.body).append(html);
            
            // WCAG 2.1 AA: Focus management - BUG-GAL-FOCUS-SELECTOR FIX
            setTimeout(function () {
                $('.cc5-image-modal-close').first().focus();
            }, 100);
            
            // Focus on the textarea
            setTimeout(function () {
                $('#cc5-regen-prompt').focus();
            }, 100);
        },

        /**
         * Generate AI image for slide (v6.6.67, v6.6.69, v6.6.72 - pick 1 of 3 + gallery)
         */
        generateSlideImage: function (sectionId, customPrompt, isRegeneration) {
            var self = this;
            var sectionData = this.findSectionById(sectionId);
            if (!sectionData) {
                return;
            }
            
            var section = sectionData.section;
            var context = this.manifest.context || {};
            
            // Show loading state
            var $container = this.container.find('.cc5-slide-image-container[data-section-id="' + sectionId + '"]');
            $container.html('<div class="cc5-image-loading"><div class="cc5-image-spinner"></div><span>' + getLabel('imageGenerating') + '</span></div>');

            // BUG-GAL-AI-PROMPT-EMPTY FIX (same as generateSlideImageBulk above):
            // section.description is empty for 7-card sections; build rich fallback.
            var _slideDesc2 = section.description || '';
            if (!_slideDesc2 && section.cards && section.cards.length > 0) {
                var _descParts2 = [];
                section.cards.forEach(function (card) {
                    var _t2 = card.bodyText || card.heading || card.highlightText || '';
                    if (_t2 && _descParts2.length < 2) _descParts2.push(_t2);
                    if (!_t2 && card.sceneParts && card.sceneParts.length) {
                        var _sp2 = card.sceneParts[0];
                        var _spt2 = (_sp2.text || _sp2.content || _sp2.description || '');
                        if (_spt2 && _descParts2.length < 2) _descParts2.push(_spt2);
                    }
                });
                _slideDesc2 = _descParts2.join(' ');
            }

            // Build request. This is the original generate-slide-image payload,
            // unchanged except that siteId/apiKey are no longer sent from the browser:
            // the proxy injects them server-side. The nested context object and every
            // field name are preserved so the vendor composes the same prompt as before.
            var requestData = {
                slideTitle: section.title,
                slideDescription: _slideDesc2,
                requirements: (section.requirements || []).map(function (r) { return typeof r === 'string' ? r : r.text || ''; }),
                positiveList: section.positiveList || section.doList || [],
                negativeList: section.negativeList || section.dontList || [],
                context: {
                    topic: context.topic || '',
                    unitCode: context.unitCode || '',
                    unitTitle: context.unitTitle || '',
                    industry: context.industry || '',
                    industrySector: context.industrySector || '',
                    jobTitle: context.jobTitle || '',
                    country: context.country || 'AU',
                    route: context.route || 'vet'
                },
                aspectRatio: '16:9',
                customPrompt: customPrompt || '',
                isRegeneration: isRegeneration || false,
                // FIX-CC-SUBTOPIC-BILLING-KEY (v13.95.2): isRegeneration alone cannot be the
                // basis for pricing - it is set by the browser, and the bulk route below does
                // not send it at all. These let the vendor keep its own record of which
                // section has already had the image covered by its subtopic's price.
                subtopicKey: section.billingKey || '',
                sectionId: String(section.id || '')
            };

            CcState.vendorFetch(this.cmid, 'generateslideimage', {payload: requestData})
                .then(function (response) {
                    // v10.62 FIX BUG-CC-IMGGEN: the handler must show the picker for
                    // multiple images, apply directly for exactly one, and never fall
                    // through to the failure path on success.
                    if (response && (response.imageUrls || response.imageUrl)) {
                        var images = response.imageUrls || [response.imageUrl];

                        if (images.length > 1) {
                            // Multiple images  -  show picker; applySelectedImage is called
                            // by the picker click handler when the user chooses one.
                            self.showImagePickerModal(sectionId, images, response.prompt, sectionData);
                        } else {
                            // Single image  -  apply directly (also saves to gallery).
                            self.applySelectedImage(sectionId, images[0], response.prompt, sectionData, []);
                        }

                        Notification.addNotification({
                            message: getLabel('imageGenerateSuccess') + ' (' + (response.creditsUsed || '') + ' credits)',
                            type: 'success'
                        });
                        return;
                    }
                    self.render();
                    Notification.addNotification({
                        message: getLabel('imageGenerateFailed'),
                        type: 'error'
                    });
                })
                .catch(function (err) {
                    ccError('generateSlideImage failed', err);
                    self.render();
                    Notification.addNotification({
                        message: err.message || 'Image generation failed',
                        type: 'error'
                    });
                });
        },
        
        /**
         * Show image picker modal with multiple images (v6.6.72)
         */
        showImagePickerModal: function (sectionId, images, prompt, sectionData) {
            images.forEach(function (url, i) {
            });
            var self = this;
            
            var html = '<div class="cc5-image-modal-overlay cc5-image-picker-overlay">';
            html += '<div class="cc5-image-modal cc5-image-picker-modal">';
            html += '<div class="cc5-image-modal-header">';
            html += '<h3>' + getLabel('chooseYourImage') + '</h3>';
            html += '<button type="button" class="cc5-image-modal-close" aria-label="' + getLabel('closeDialog') + '">' + getIcon('x') + '</button>';
            html += '</div>';
            html += '<div class="cc5-image-modal-body">';
            html += '<p class="cc5-picker-desc">' + getLabel('selectImageDesc') + '</p>';
            
            // Image grid
            html += '<div class="cc5-image-picker-grid">';
            images.forEach(function (imgUrl, index) {
                html += '<div class="cc5-image-picker-item" data-index="' + index + '" data-section-id="' + escapeHtml(sectionId) + '">';
                html += '<img src="' + escapeHtml(imgUrl) + '" alt="' + getLabel('optionLabel') + ' ' + (index + 1) + '">'; // v13.86: was raw
                html += '<div class="cc5-picker-item-overlay">';
                html += '<span class="cc5-picker-item-number">' + (index + 1) + '</span>';
                html += '</div>';
                // v7.2.0: Add zoom button to preview image fullscreen
                html += '<button type="button" class="cc5-image-zoom-btn" data-image-url="' + imgUrl + '" aria-label="' + getLabel('zoomImage') + '">';
                html += getIcon('zoomIn');
                html += '</button>';
                // v11.10: Download button for generated images
                html += '<button type="button" class="cc5-image-download-btn" data-image-url="' + imgUrl + '" aria-label="' + getLabel('downloadImage') + '" title="' + getLabel('downloadImage') + '">';
                html += getIcon('download');
                html += '</button>';
                html += '</div>';
            });
            html += '</div>';
            
            // Gallery buttons row
            html += '<div class="cc5-picker-gallery-row">';
            
            // v7.2.64: Site-wide gallery button - shows count from entire Moodle site
            // Always show button, fetch will load site-wide images
            // BUG-GAL-COUNT-DOUBLE FIX v11.61: collectAllManifestImages() already merges imageGallery[]
            // into its output, so adding imageGallery.length on top double-counts those items.
            var localGalleryCount = self.collectAllManifestImages ? self.collectAllManifestImages().length : (self.manifest.imageGallery || []).length;
            var siteCount = self.siteGalleryCache ? self.siteGalleryCache.length : 0;
            var totalCount = localGalleryCount + siteCount;
            var countLabel = self.siteGalleryCache !== null ? totalCount : '...';
            html += '<button type="button" class="cc5-show-gallery-btn" data-section-id="' + escapeHtml(sectionId) + '">';
            html += getIcon('folder') + ' ' + getLabel('selectFromGallery') + ' (' + countLabel + ')';
            html += '</button>';
            // Trigger site gallery fetch to update count for next time
            if (self.siteGalleryCache === null) {
                self.fetchSiteGallery(null);
            }
            
            // Community Gallery button (v6.6.74)
            html += '<button type="button" class="cc5-show-community-btn" data-section-id="' + escapeHtml(sectionId) + '">';
            html += getIcon('globe') + ' ' + getLabel('communityGallery') + ' (1 credit)';
            html += '</button>';
            
            html += '</div>';
            
            html += '</div>';
            html += '</div>';
            html += '</div>';
            
            $(document.body).append(html);
            
            // WCAG 2.1 AA: Focus management - BUG-GAL-FOCUS-SELECTOR FIX
            setTimeout(function () {
                $('.cc5-image-modal-close').first().focus();
            }, 100);
            
            // Store data for click handlers
            $('.cc5-image-picker-overlay').data('images', images);
            $('.cc5-image-picker-overlay').data('prompt', prompt);
            $('.cc5-image-picker-overlay').data('sectionData', sectionData);
        },
        
        /**
         * Apply selected image to slide and save others to gallery (v6.6.72)
         */
        applySelectedImage: function (sectionId, selectedUrl, prompt, sectionData, otherImages) {
            var self = this;
            
            // Update manifest with selected image
            self.manifest.topics[sectionData.topicIndex].sections[sectionData.sectionIndex].image = {
                url: selectedUrl,
                type: 'generated',
                prompt: prompt,
                generatedAt: new Date().toISOString()
            };
            
            // v10.62 FIX BUG-CC-GALLERYSAVE: Always save the SELECTED (applied) image
            // to the gallery so users can access it from "Choose Image Source  ->  Gallery".
            // Previously only unused/unchosen images were saved  -  the applied image was
            // never reachable from the gallery, making it appear that generated images
            // were "lost" after being applied to a slide.
            if (!self.manifest.imageGallery) {
                self.manifest.imageGallery = [];
            }
            var alreadyInGallery = self.manifest.imageGallery.some(function (item) {
                return item.url === selectedUrl;
            });
            if (!alreadyInGallery) {
                self.manifest.imageGallery.push({
                    url: selectedUrl,
                    prompt: prompt,
                    savedAt: new Date().toISOString(),
                    sourceSlide: sectionData && sectionData.section ? sectionData.section.title : '',
                    inUse: true
                });
            }
            
            // Save unused images to gallery
            if (otherImages && otherImages.length > 0) {
                otherImages.forEach(function (imgUrl) {
                    var alreadyThere = self.manifest.imageGallery.some(function (item) {
                        return item.url === imgUrl;
                    });
                    if (!alreadyThere) {
                        self.manifest.imageGallery.push({
                            url: imgUrl,
                            prompt: prompt,
                            savedAt: new Date().toISOString(),
                            sourceSlide: sectionData && sectionData.section ? sectionData.section.title : ''
                        });
                    }
                });
            }
            
            // v11.23: Auto-contribute all generated images to community gallery
            var allImagesForCommunity = [{url: selectedUrl, prompt: prompt}];
            if (otherImages && otherImages.length > 0) {
                otherImages.forEach(function (imgUrl) {
                    allImagesForCommunity.push({url: imgUrl, prompt: prompt});
                });
            }
            self.contributeToGallery(allImagesForCommunity, {
                slideTitle: sectionData && sectionData.section ? sectionData.section.title : '',
                topic: self.manifest?.title || '',
                unitCode: self.manifest?.context?.unitCode || ''
            });

            // v11.60 FIX BUG-CC-APPLYSAVE: Use saveManifestSilent() instead of the
            // previous direct Ajax.call({methodname:'mod_contentcreator_save_manifest'}).
            // The direct call bypassed three critical safeguards in saveManifestSilent:
            //   1. stripAudio()  -  without stripping, large audio data: URLs inflated
            //      the POST body past PHP post_max_size, causing a silent save failure
            //      that left the selected image lost on next page reload.
            //   2. Chunked upload  -  manifests >2MB need multi-chunk delivery;
            //      single-call Ajax.call fails with no error surfaced to the teacher.
            //   3. Retry with back-off  -  Moodle 4.4+ service-worker message-channel
            //      drops triggered the old empty .fail() handler silently; now up to
            //      3 retries fire automatically.
            self.saveManifestSilent();

            // Re-render the slide
            self.render();
        },
        
        /**
         * Show fullscreen zoom preview of image (v7.2.0)
         */
        showImageZoomModal: function (imageUrl) {
            var html = '<div class="cc5-zoom-modal-overlay">';
            html += '<div class="cc5-zoom-modal">';
            html += '<button type="button" class="cc5-zoom-modal-close" aria-label="' + getLabel('closeZoom') + '">';
            html += getIcon('x');
            html += '</button>';
            html += '<div class="cc5-zoom-modal-content">';
            html += '<img src="' + imageUrl + '" alt="' + getLabel('zoomImage') + '">';
            html += '</div>';
            html += '</div>';
            html += '</div>';
            
            $(document.body).append(html);
            
            // Allow ESC key to close
            $(document).one('keydown.zoomModal', function (e) {
                if (e.key === 'Escape') {
                    $('.cc5-zoom-modal-overlay').remove();
                }
            });
        },

        /**
         * v11.10: Download an image from a URL using fetch-as-blob (handles cross-origin CDN images)
         */
        downloadImage: function (url) {
            var filename = 'content-creator-image-' + Date.now() + '.png';
            // v13.93.3: a download that never answers used to leave no trace at all.
            CcState.fetchWithDeadline(url, {}, 'The image download', 60000)
                .then(function (response) { return response.blob(); })
                .then(function (blob) {
                    var blobUrl = URL.createObjectURL(blob);
                    var a = document.createElement('a');
                    a.href = blobUrl;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(blobUrl);
                })
                .catch(function () {
                    window.open(url, '_blank');
                });
        },
        
        /**
         * v7.2.64: Site-wide gallery cache - stores images from ALL Content Creator activities
         */
        siteGalleryCache: null,
        siteGalleryLoading: false,
        siteGalleryCallbacks: [],
        
        /**
         * v7.2.64: Fetch site-wide image gallery from server
         * Collects images from ALL Content Creator activities on the Moodle site
         */
        fetchSiteGallery: function (callback) {
            var self = this;
            
            // If already cached, return immediately
            if (this.siteGalleryCache !== null) {
                if (callback) callback(this.siteGalleryCache);
                return;
            }
            
            // If already loading, queue the callback
            if (this.siteGalleryLoading) {
                if (callback) this.siteGalleryCallbacks.push(callback);
                return;
            }
            
            this.siteGalleryLoading = true;
            if (callback) this.siteGalleryCallbacks.push(callback);
            
            var ajaxUrl = CcState.ajaxUrl();
            
            $.ajax({
                url: ajaxUrl,
                method: 'POST',
                data: {
                    action: 'get_site_gallery',
                    cmid: this.cmid,
                    sesskey: Config.sesskey
                },
                dataType: 'json',
                success: function (response) {
                    self.siteGalleryLoading = false;
                    if (response.success && response.images) {
                        self.siteGalleryCache = response.images;
                    } else {
                        self.siteGalleryCache = [];
                    }
                    // v11.61: Update any currently-open picker gallery count buttons
                    // (they rendered "..." while loading  -  now we have the real count)
                    try {
                        var localCount = self.collectAllManifestImages ? self.collectAllManifestImages().length : (self.manifest.imageGallery || []).length;
                        var updatedTotal = localCount + (self.siteGalleryCache ? self.siteGalleryCache.length : 0);
                        $('.cc5-show-gallery-btn').html(getIcon('folder') + ' ' + getLabel('selectFromGallery') + ' (' + updatedTotal + ')');
                    } catch (_countErr) { /* ignore UI update failures */ }
                    // Execute all queued callbacks
                    self.siteGalleryCallbacks.forEach(function (cb) {
                        cb(self.siteGalleryCache);
                    });
                    self.siteGalleryCallbacks = [];
                },
                error: function (xhr, status, error) {
                    ccError('Site gallery could not be loaded', xhr && xhr.status, error);
                    self.siteGalleryLoading = false;
                    self.siteGalleryCache = [];
                    // Execute all queued callbacks with empty array
                    self.siteGalleryCallbacks.forEach(function (cb) {
                        cb([]);
                    });
                    self.siteGalleryCallbacks = [];
                }
            });
        },
        
        /**
         * Collect ALL images from manifest - slides + gallery (v7.2.48)
         * This ensures all previously generated images are available for reuse
         */
        collectAllManifestImages: function () {
            var allImages = [];
            var seenUrls = {}; // Prevent duplicates
            
            // 1. Collect images from all slides in all topics
            if (this.manifest.topics) {
                this.manifest.topics.forEach(function (topic, topicIndex) {
                    if (topic.sections) {
                        topic.sections.forEach(function (section, sectionIndex) {
                            if (section.image && section.image.url) {
                                if (!seenUrls[section.image.url]) {
                                    seenUrls[section.image.url] = true;
                                    allImages.push({
                                        url: section.image.url,
                                        prompt: section.image.prompt || section.title || 'Slide image',
                                        sourceSlide: (topicIndex + 1) + '.' + (sectionIndex + 1) + ' ' + (section.title || 'Slide'),
                                        inUse: true
                                    });
                                }
                            }
                        });
                    }
                });
            }
            
            // 2. Add images from gallery array (unused images)
            if (this.manifest.imageGallery) {
                this.manifest.imageGallery.forEach(function (item) {
                    if (item.url && !seenUrls[item.url]) {
                        seenUrls[item.url] = true;
                        allImages.push({
                            url: item.url,
                            prompt: item.prompt || 'Gallery image',
                            sourceSlide: item.sourceSlide || getLabel('saved'),
                            inUse: false
                        });
                    }
                });
            }
            
            return allImages;
        },
        
        /**
         * Show image gallery modal (v7.2.64 - Shows ALL images from entire Moodle site)
         */
        showGalleryModal: function (sectionId) {
            var self = this;
            
            this.fetchSiteGallery(function (siteImages) {
                self._renderGalleryModal(sectionId, siteImages);
            });
        },
        
        /**
         * v7.2.64: Render the gallery modal with provided images
         */
        _renderGalleryModal: function (sectionId, siteImages) {
            var self = this;
            // Combine current manifest images with site-wide images
            var localImages = self.collectAllManifestImages();
            var seenUrls = {};
            var gallery = [];
            
            // Add local images first (current activity)
            localImages.forEach(function (img) {
                if (!seenUrls[img.url]) {
                    seenUrls[img.url] = true;
                    gallery.push(img);
                }
            });
            
            // Add site-wide images (from other activities)
            siteImages.forEach(function (img) {
                if (!seenUrls[img.url]) {
                    seenUrls[img.url] = true;
                    gallery.push({
                        url: img.url,
                        prompt: img.prompt || 'Site image',
                        sourceSlide: img.source || 'Other activity',
                        // BUG-GAL-INUSE-STALE FIX: site images belong to other activities;
                        // they must be inUse:true so applyGalleryImage skips the splice
                        // attempt on this activity's imageGallery array (where they don't exist).
                        inUse: true
                    });
                }
            });
            
            
            // BUG-GAL-EMPTY-SECTIONID FIX: When gallery is empty, no [data-section-id]
            // children exist inside the overlay, so the close handler's
            // $overlay.find('[data-section-id]').first().data('section-id') returns
            // undefined.  Put data-section-id on the overlay itself so the close
            // handler can always find it via $overlay.attr('data-section-id').
            var html = '<div class="cc5-image-modal-overlay cc5-gallery-modal-overlay" data-section-id="' + escapeHtml(String(sectionId)) + '">';
            html += '<div class="cc5-image-modal cc5-gallery-modal">';
            html += '<div class="cc5-image-modal-header">';
            html += '<h3>' + getLabel('imageGallery') + '</h3>';
            html += '<button type="button" class="cc5-image-modal-close" aria-label="' + getLabel('closeDialog') + '">' + getIcon('x') + '</button>';
            html += '</div>';
            html += '<div class="cc5-image-modal-body">';
            
            if (gallery.length === 0) {
                html += '<div class="cc5-gallery-empty">';
                html += '<div class="cc5-gallery-empty-icon">' + getIcon('folder') + '</div>';
                html += '<p>' + getLabel('noGalleryImages') + '</p>';
                html += '<p class="cc5-gallery-empty-hint">' + getLabel('galleryEmpty') + '</p>';
                html += '</div>';
            } else {
                html += '<p class="cc5-gallery-desc">' + getLabel('galleryDesc') + '</p>';
                html += '<div class="cc5-gallery-grid">';
                gallery.forEach(function (item, index) {
                    html += '<div class="cc5-gallery-item" data-index="' + index + '" data-section-id="' + escapeHtml(sectionId) + '">';
                    // BUG-GAL-ZOOM-CLASS FIX: was <div class="cc5-zoom-icon" data-zoom-url="...">
                    // but the click handler listens for .cc5-image-zoom-btn and reads data-image-url.
                    // Changed to a <button> with matching class and attribute.
                    // v13.86: item.url is vendor-supplied and was interpolated raw.
                    html += '<button type="button" class="cc5-image-zoom-btn" data-image-url="' + escapeHtml(item.url) + '" aria-label="' + escapeHtml(getLabel('zoomImage')) + '">' + getIcon('search') + '</button>';
                    // v11.10: Download button for gallery images
                    html += '<button type="button" class="cc5-image-download-btn" data-image-url="' + escapeHtml(item.url) + '" aria-label="' + getLabel('downloadImage') + '" title="' + getLabel('downloadImage') + '">' + getIcon('download') + '</button>';
                    // v11.61: onerror hides broken thumbnails (e.g. cc-images 404 after server restart)
                    // Improved alt text uses prompt or slide title instead of generic "Gallery image N"
                    var imgAlt = escapeHtml(item.prompt ? item.prompt.substring(0, 80) : (item.sourceSlide || ('Gallery image ' + (index + 1))));
                    html += '<img src="' + escapeHtml(item.url) + '" alt="' + escapeHtml(imgAlt) + '" loading="lazy" onerror="var p=this.closest(\'.cc5-gallery-item\');if(p)p.style.display=\'none\';">'; // v13.86: was raw
                    html += '<div class="cc5-gallery-item-overlay">';
                    html += '<span class="cc5-gallery-item-source">' + escapeHtml(item.sourceSlide || getLabel('saved')) + '</span>';
                    html += '</div>';
                    html += '</div>';
                });
                html += '</div>';
            }
            
            html += '</div>';
            html += '</div>';
            html += '</div>';
            
            $(document.body).append(html);
            
            // WCAG 2.1 AA: Focus management - BUG-GAL-FOCUS-SELECTOR FIX
            setTimeout(function () {
                $('.cc5-image-modal-close').first().focus();
            }, 100);
        },
        
        /**
         * Apply gallery image to slide (v7.2.64 - Works with site-wide images)
         */
        applyGalleryImage: function (sectionId, galleryIndex) {
            var self = this;
            
            // v7.2.64: Build combined gallery same as in _renderGalleryModal
            var localImages = this.collectAllManifestImages();
            var siteImages = this.siteGalleryCache || [];
            var seenUrls = {};
            var allImages = [];
            
            // Add local images first
            localImages.forEach(function (img) {
                if (!seenUrls[img.url]) {
                    seenUrls[img.url] = true;
                    allImages.push(img);
                }
            });
            
            // Add site-wide images
            siteImages.forEach(function (img) {
                if (!seenUrls[img.url]) {
                    seenUrls[img.url] = true;
                    allImages.push({
                        url: img.url,
                        prompt: img.prompt || 'Site image',
                        sourceSlide: img.source || 'Other activity',
                        // BUG-GAL-INUSE-STALE FIX (same as _renderGalleryModal):
                        // site images are in use on their source activities.
                        inUse: true
                    });
                }
            });
            
            var sectionData = this.findSectionById(sectionId);
            
            if (!sectionData || galleryIndex >= allImages.length) {
                return;
            }
            
            var selectedImage = allImages[galleryIndex];
            
            // Update manifest with selected image
            self.manifest.topics[sectionData.topicIndex].sections[sectionData.sectionIndex].image = {
                url: selectedImage.url,
                type: 'gallery',
                prompt: selectedImage.prompt,
                selectedAt: new Date().toISOString()
            };
            
            // v7.2.48: Only remove from gallery array if it was an unused gallery image
            // Images already in use on slides stay there (they're being copied to this slide)
            if (!selectedImage.inUse && this.manifest.imageGallery) {
                // Find and remove from gallery array by URL
                var galleryIdx = this.manifest.imageGallery.findIndex(function (item) {
                    return item.url === selectedImage.url;
                });
                if (galleryIdx !== -1) {
                    this.manifest.imageGallery.splice(galleryIdx, 1);
                }
            }
            
            // v7.1.8: Save manifest via AJAX
            Ajax.call([{
                methodname: 'mod_contentcreator_save_manifest',
                args: {
                    cmid: self.cmid,
                    manifest: JSON.stringify(self.manifest)
                }
            }])[0].fail(function (error) {
                ccError('Manifest save failed after image removal', error);
            });

            // Re-render
            self.render();
            
            // Close modal
            $('.cc5-gallery-modal-overlay').remove();
            
            Notification.addNotification({
                message: getLabel('imageSelectedGallery'),
                type: 'success'
            });
        },

        /**
         * Show community gallery modal (v6.6.74)
         */
        showCommunityGalleryModal: function (sectionId) {
            
            var html = '<div class="cc5-image-modal-overlay cc5-community-modal-overlay">';
            html += '<div class="cc5-image-modal cc5-community-modal">';
            html += '<div class="cc5-image-modal-header">';
            html += '<h3>' + getIcon('globe') + ' ' + getLabel('communityGallery') + '</h3>';
            html += '<button type="button" class="cc5-image-modal-close" aria-label="' + getLabel('closeDialog') + '">' + getIcon('x') + '</button>';
            html += '</div>';
            html += '<div class="cc5-image-modal-body">';
            
            // Search bar
            html += '<div class="cc5-community-search">';
            html += '<input type="text" class="cc5-community-search-input" placeholder="' + getLabel('communitySearchPlaceholder') + '" data-section-id="' + escapeHtml(sectionId) + '">';
            html += '<button type="button" class="cc5-community-search-btn">' + getIcon('search') + '</button>';
            html += '</div>';
            
            html += '<p class="cc5-community-desc">' + getLabel('communityGalleryDesc') + '</p>';
            
            // Loading state
            html += '<div class="cc5-community-loading">';
            html += '<div class="cc5-image-spinner"></div>';
            html += '<span>' + getLabel('loadingCommunity') + '</span>';
            html += '</div>';
            
            // Images grid (populated via AJAX)
            html += '<div class="cc5-community-grid" data-section-id="' + escapeHtml(sectionId) + '"></div>';
            
            // Pagination
            html += '<div class="cc5-community-pagination" style="display:none;"></div>';
            
            html += '</div>';
            html += '</div>';
            html += '</div>';
            
            $(document.body).append(html);
            
            // WCAG 2.1 AA: Focus management - BUG-GAL-FOCUS-SELECTOR FIX
            setTimeout(function () {
                $('.cc5-image-modal-close').first().focus();
            }, 100);
            
            // Close picker modal when opening community
            $('.cc5-image-picker-overlay').remove();
            
            // Load community images
            this.browseCommunityGallery(sectionId, '', 0);
        },
        
        /**
         * Browse community gallery via the server-side vendor proxy (v6.6.74)
         *
         * Scalar members of the payload are turned into query parameters server-side
         * (limit, offset, search, industry, jobTitle). The site credentials are injected
         * by ajax.php and never reach the browser.
         *
         * @param {String} sectionId Section the chosen image will be applied to.
         * @param {String} search Optional free-text search term.
         * @param {Number} offset Zero-based pagination offset.
         */
        browseCommunityGallery: function (sectionId, search, offset) {
            offset = offset || 0;

            var params = {
                limit: 12,
                offset: offset
            };

            if (search) {
                params.search = search;
            }

            // Get industry/jobTitle from manifest context if available
            if (this.manifest && this.manifest.context) {
                if (this.manifest.context.industry) {
                    params.industry = this.manifest.context.industry;
                }
                if (this.manifest.context.jobTitle) {
                    params.jobTitle = this.manifest.context.jobTitle;
                }
            }

            CcState.vendorFetch(this.cmid, 'gallerybrowse', {payload: params})
                .then(function (response) {
                    $('.cc5-community-loading').hide();
                    var $grid = $('.cc5-community-grid');
                    $grid.empty();

                    if (!response || !response.images || response.images.length === 0) {
                        $('.cc5-community-pagination').hide();
                        $grid.html('<div class="cc5-community-empty">' +
                            '<div class="cc5-gallery-empty-icon">' + getIcon('image') + '</div>' +
                            '<p>' + getLabel('noCommunityImages') + '</p>' +
                        '</div>');
                        return null;
                    }

                    response.images.forEach(function (img) {
                        var html = '<div class="cc5-community-item" data-image-id="' + escapeHtml(img.id) + '" data-section-id="' + escapeHtml(sectionId) + '">';
                        html += '<img src="' + escapeHtml(img.imageUrl) + '" alt="' + getLabel('communityImage') + '">';
                        // v11.10: Download button for community gallery images
                        html += '<button type="button" class="cc5-image-download-btn" data-image-url="' + escapeHtml(img.imageUrl) + '" aria-label="' + getLabel('downloadImage') + '" title="' + getLabel('downloadImage') + '">' + getIcon('download') + '</button>';
                        html += '<div class="cc5-community-item-overlay">';
                        if (img.unitCode) {
                            html += '<span class="cc5-community-item-tag">' + escapeHtml(img.unitCode) + '</span>';
                        }
                        if (img.topic) {
                            html += '<span class="cc5-community-item-tag">' + escapeHtml(img.topic) + '</span>';
                        }
                        if (img.industry) {
                            html += '<span class="cc5-community-item-tag">' + escapeHtml(img.industry) + '</span>';
                        }
                        if (img.jobTitle) {
                            html += '<span class="cc5-community-item-tag">' + escapeHtml(img.jobTitle) + '</span>';
                        }
                        html += '<span class="cc5-community-item-uses">' + (img.timesUsed || 0) + ' uses</span>';
                        html += '</div>';
                        html += '</div>';
                        $grid.append(html);
                    });

                    // Show pagination if needed
                    if (response.total > 12) {
                        var $pagination = $('.cc5-community-pagination');
                        $pagination.empty().show();

                        var totalPages = Math.ceil(response.total / 12);
                        var currentPage = Math.floor(offset / 12) + 1;

                        if (currentPage > 1) {
                            $pagination.append('<button type="button" class="cc5-community-page-btn" data-offset="' + ((currentPage - 2) * 12) + '">' + getIcon('chevronLeft') + '</button>');
                        }
                        $pagination.append('<span class="cc5-community-page-info">' + getLabel('pageXofY').replace('{current}', currentPage).replace('{total}', totalPages) + '</span>');
                        if (currentPage < totalPages) {
                            $pagination.append('<button type="button" class="cc5-community-page-btn" data-offset="' + (currentPage * 12) + '">' + getIcon('chevronRight') + '</button>');
                        }
                    } else {
                        $('.cc5-community-pagination').hide();
                    }
                    return null;
                })
                .catch(function (err) {
                    // Surface the server's translated message (permission, rate limit,
                    // vendor error) rather than a generic string.
                    ccError('Community gallery browse failed', err);
                    $('.cc5-community-loading').hide();
                    $('.cc5-community-pagination').hide();
                    $('.cc5-community-grid').html('<div class="cc5-community-empty"><p>' +
                        escapeHtml(err.message || 'Failed to load community images. Please try again.') + '</p></div>');
                    return null;
                });
        },

        /**
         * Use a community image (costs 1 credit) (v6.6.74)
         *
         * @param {String} sectionId Section to apply the image to.
         * @param {String} imageId Community gallery image identifier.
         */
        useCommunityImage: function (sectionId, imageId) {
            var self = this;
            var sectionData = this.findSectionById(sectionId);

            if (!sectionData) {
                return;
            }

            CcState.vendorFetch(this.cmid, 'galleryuse', {payload: {imageId: imageId}})
                .then(function (response) {
                    if (!response || !response.image) {
                        throw new Error('Failed to use community image');
                    }
                    // Update manifest with community image
                    self.manifest.topics[sectionData.topicIndex].sections[sectionData.sectionIndex].image = {
                        url: response.image.imageUrl,
                        type: 'community',
                        communityImageId: imageId,
                        industry: response.image.industry,
                        selectedAt: new Date().toISOString()
                    };

                    // v7.1.8: Save manifest via AJAX
                    Ajax.call([{
                        methodname: 'mod_contentcreator_save_manifest',
                        args: {
                            cmid: self.cmid,
                            manifest: JSON.stringify(self.manifest)
                        }
                    }])[0].fail(function (error) {
                        showErrorToast('The image was applied but settings could not be saved. Please try again.', 'communityImageManifestSave', error);
                    });

                    // Close modal and re-render
                    $('.cc5-community-modal-overlay').remove();
                    self.render();

                    Notification.addNotification({
                        message: getLabel('communityImageUsed') + ' (1 credit)',
                        type: 'success'
                    });
                    return null;
                })
                .catch(function (err) {
                    ccError('Community gallery use failed', err);
                    Notification.addNotification({
                        message: err.message || 'Failed to use community image',
                        type: 'error'
                    });
                    return null;
                });
        },

        /**
         * Contribute images to community gallery (v6.6.74)
         *
         * Fire and forget: a failure here never blocks the teacher's workflow.
         *
         * @param {Array} images Image objects (or plain URLs) to contribute.
         * @param {Object} context Slide context used to tag the contribution.
         */
        contributeToGallery: function (images, context) {
            var self = this;

            if (!images || images.length === 0) {
                return;
            }

            var contribution = images.map(function (img) {
                return {
                    imageUrl: img.url || img,
                    prompt: img.prompt || '',
                    industry: context.industry || self.manifest?.context?.industry,
                    jobTitle: context.jobTitle || self.manifest?.context?.jobTitle,
                    slideContext: context.slideTitle || '',
                    topic: context.topic || self.manifest?.context?.courseTitle || self.manifest?.title || '',
                    unitCode: context.unitCode || self.manifest?.context?.unitCode || '',
                    country: self.manifest?.context?.country || 'AU'
                };
            });

            CcState.vendorFetch(this.cmid, 'gallerycontribute', {payload: {images: contribution}})
                .then(function () {
                    ccLog('Contributed ' + contribution.length + ' image(s) to the community gallery');
                    return null;
                })
                .catch(function (err) {
                    ccWarn('[COMMUNITY-GALLERY] Contribute failed:', err.message || err);
                    return null;
                });
        },

        /**
         * Upload an image for a slide through the server-side vendor proxy (v6.6.67)
         *
         * The file is posted to ajax.php, which validates the byte signature
         * (PNG/JPEG/WEBP, 20 MB maximum) before forwarding it to the vendor.
         *
         * @param {String} sectionId Section to attach the uploaded image to.
         * @param {File} file The image file chosen by the user.
         */
        uploadSlideImage: function (sectionId, file) {
            var self = this;
            var sectionData = this.findSectionById(sectionId);
            if (!sectionData) {
                return;
            }

            var $container = this.container.find('.cc5-slide-image-container[data-section-id="' + sectionId + '"]');
            $container.html('<div class="cc5-image-loading"><div class="cc5-image-spinner"></div><span>' + getLabel('uploading') + '</span></div>');

            CcState.vendorUpload(this.cmid, 'uploadslideimage', file)
                .then(function (response) {
                    if (!response || !response.imageUrl) {
                        throw new Error('Failed to upload image');
                    }
                    // Update manifest
                    self.manifest.topics[sectionData.topicIndex].sections[sectionData.sectionIndex].image = {
                        url: response.imageUrl,
                        type: 'uploaded',
                        fileName: response.fileName,
                        uploadedAt: new Date().toISOString()
                    };

                    // v6.7.18: Save manifest via AJAX (fix: saveManifest is not a function)
                    Ajax.call([{
                        methodname: 'mod_contentcreator_save_manifest',
                        args: {
                            cmid: self.cmid,
                            manifest: JSON.stringify(self.manifest)
                        }
                    }])[0].fail(function (error) {
                        showErrorToast('Image was uploaded but settings could not be saved. Please try again.', 'imageUploadManifestSave', error);
                    });

                    // Re-render the slide
                    self.render();

                    Notification.addNotification({
                        message: getLabel('imageUploadSuccess'),
                        type: 'success'
                    });
                    return null;
                })
                .catch(function (err) {
                    ccError('Slide image upload failed', err);

                    // Restore empty state
                    self.render();

                    Notification.addNotification({
                        message: err.message || 'Image upload failed',
                        type: 'error'
                    });
                    return null;
                });
        },

        /**
         * Remove image from slide (v6.6.67)
         * v7.2.0: Optimized for instant feedback - removes image from DOM first, then saves in background
         */
        removeSlideImage: function (sectionId) {
            var self = this;
            var sectionData = this.findSectionById(sectionId);
            if (!sectionData) {
                return;
            }

            // Store old image in case we need to restore on save failure
            var oldImage = self.manifest.topics[sectionData.topicIndex].sections[sectionData.sectionIndex].image;

            // Remove from manifest immediately
            delete self.manifest.topics[sectionData.topicIndex].sections[sectionData.sectionIndex].image;

            var $imageContainer = self.container.find('.cc5-slide-image-container[data-section-id="' + sectionId + '"]');
            if ($imageContainer.length) {
                var topicId = '';
                self.manifest.topics.some(function (t) {
                    return t.sections.some(function (s) {
                        if (s.id === sectionId) { topicId = t.id; return true; }
                        return false;
                    });
                });

                var emptyHtml = '<div class="cc5-slide-image-empty">';
                emptyHtml += '<button type="button" class="cc5-add-image-btn" style="background:#fff !important;" data-section-id="' + sectionId + '" data-topic-id="' + topicId + '">';
                emptyHtml += '<span class="cc5-add-image-icon">' + getIcon('image-plus') + '</span>';
                emptyHtml += '<span class="cc5-add-image-text">' + getLabel('addImage') + '</span>';
                emptyHtml += '</button>';
                emptyHtml += '</div>';

                var $wrapper = $imageContainer.find('.cc5-slide-image-wrapper');
                if ($wrapper.length) {
                    // Fade out, then swap  -  correct order so animation completes before DOM replacement
                    $wrapper.fadeOut(150, function () {
                        $imageContainer.html(emptyHtml);
                    });
                } else {
                    $imageContainer.html(emptyHtml);
                }
            }

            // Show immediate feedback
            Notification.addNotification({
                message: getLabel('imageRemoved') || 'Image removed',
                type: 'info'
            });

            // Save manifest in background (non-blocking)  -  v11.49: retry + strip audio
            var _imgRemoveMaxRetries = 3;
            function _imgRemoveStripAudio(obj) {
                if (Array.isArray(obj)) { return obj.map(_imgRemoveStripAudio); }
                if (obj && typeof obj === 'object') {
                    var out = {};
                    Object.keys(obj).forEach(function (k) {
                        if ((k === 'voiceoverUrl' || k === 'audioUrl') && typeof obj[k] === 'string' && obj[k].indexOf('data:') === 0) {
                            out[k] = 'pregenerated'; // v11.51: sentinel, not empty string
                        } else { out[k] = _imgRemoveStripAudio(obj[k]); }
                    });
                    return out;
                }
                return obj;
            }
            var _imgRemoveManifestStr = JSON.stringify(_imgRemoveStripAudio(self.manifest));
            function _attemptImageRemoveSave(attempt) {
                Ajax.call([{
                    methodname: 'mod_contentcreator_save_manifest',
                    args: { cmid: self.cmid, manifest: _imgRemoveManifestStr }
                }])[0].done(function (saveResponse) {
                    if (saveResponse.success === false) {
                        if (attempt < _imgRemoveMaxRetries) {
                            setTimeout(function () { _attemptImageRemoveSave(attempt + 1); }, 1000 * attempt);
                        } else {
                            self.manifest.topics[sectionData.topicIndex].sections[sectionData.sectionIndex].image = oldImage;
                            self.render();
                            showErrorToast('Failed to save changes. Please try again.', 'imageRemoveManifestSave');
                        }
                    }
                }).fail(function (error) {
                    if (attempt < _imgRemoveMaxRetries) {
                        setTimeout(function () { _attemptImageRemoveSave(attempt + 1); }, 1000 * attempt);
                    } else {
                        self.manifest.topics[sectionData.topicIndex].sections[sectionData.sectionIndex].image = oldImage;
                        self.render();
                        showErrorToast('Failed to save changes. Please try again.', 'imageRemoveManifestSave', error);
                    }
                });
            }
            _attemptImageRemoveSave(1);
        },

        // ===================================================================
        // IMAGE2 feature removed in v11.16  -  methods and event handlers deleted.
        // Old section.image2 data in existing manifests is harmlessly ignored.
        // ===================================================================

        // ===================================================================
        // v11.10: DECISION CHALLENGE  -  sort activity + completion helpers
        // ===================================================================

        _initSortActivity: function ($challenge) {
            var $arena = $challenge.find('.cc5-sort-arena');
            if ($arena.data('initialized')) return;
            $arena.data('initialized', true);
            $arena.data('current', 0);
            $arena.data('score', 0);
            this._showSortItem($challenge, 0);
        },

        _showSortItem: function ($challenge, idx) {
            var $arena = $challenge.find('.cc5-sort-arena');
            var $items = $arena.find('.cc5-sort-items-data [data-sort-item]');
            var total = $items.length;
            // Single declaration: the early-return branch below and the normal path both
            // operate on the same element, and re-declaring it shadowed nothing useful.
            var $current = $arena.find('.cc5-sort-current-item');
            if (idx >= total) {
                $current.addClass('cc5-sort-all-done');
                $current.find('.cc5-sort-item-text').text(getLabel('allItemsSorted'));
                $current.find('.cc5-sort-tap-btns').hide();
                var score = parseInt($arena.data('score'), 10) || 0;
                $challenge.data('sort-passed', score === total);
                $arena.find('.cc5-sort-progress-fill').css('width', '100%');
                $arena.find('.cc5-sort-idx').text(total);
                var $btn = $challenge.find('.cc5-challenge-finish-btn');
                $btn.prop('disabled', false).addClass('cc5-enabled cc5-btn-pulse');
                if (score === total) {
                    playUnlockSound();
                    haptic(20);
                } else {
                    playDecisionCorrectSound();
                }
                showActivityMiniCelebration($arena.closest('.cc5-challenge-panel'));
                return;
            }
            var $item = $items.eq(idx);
            $current.show().removeClass('cc5-sort-all-done');
            $current.find('.cc5-sort-tap-btns').show();
            // Slide-in animation
            $current.addClass('cc5-sort-item-enter');
            $current.find('.cc5-sort-item-text').text($item.text());
            $arena.find('.cc5-sort-idx').text(idx + 1);
            $arena.find('.cc5-sort-progress-fill').css('width', ((idx / total) * 100) + '%');
            $arena.data('current', idx);
            setTimeout(function () { $current.removeClass('cc5-sort-item-enter'); }, 300);
        },

        _handleSortAnswer: function ($challenge, tapped) {
            var self = this;
            var $arena = $challenge.find('.cc5-sort-arena');
            if ($arena.data('sorting-locked')) return;
            $arena.data('sorting-locked', true);
            var idx = parseInt($arena.data('current'), 10) || 0;
            var $items = $arena.find('.cc5-sort-items-data [data-sort-item]');
            var $item = $items.eq(idx);
            var correctCat = $item.data('category');
            var isCorrect = (tapped === correctCat);
            var score = parseInt($arena.data('score'), 10) || 0;
            var streak = parseInt($arena.data('streak'), 10) || 0;

            var $currentItem = $arena.find('.cc5-sort-current-item');
            var $scoreEl = $arena.find('.cc5-sort-score');
            if (isCorrect) {
                score++;
                streak++;
                $arena.data('score', score).data('streak', streak);
                $currentItem.addClass('cc5-sort-correct');
                playDecisionCorrectSound();
                haptic(10);
                if (streak >= 3) {
                    $scoreEl.addClass('cc5-sort-streak');
                    setTimeout(function () { $scoreEl.removeClass('cc5-sort-streak'); }, 500);
                }
            } else {
                streak = 0;
                $arena.data('streak', streak);
                $currentItem.addClass('cc5-sort-incorrect');
                playDecisionIncorrectSound();
                haptic(30);
            }

            $arena.find('.cc5-sort-tap').prop('disabled', true);

            var $dropzone = $arena.find('.cc5-sort-dropzone[data-category="' + correctCat + '"]');
            var icon = isCorrect
                ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>'
                : '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
            var $dropped = $('<div class="cc5-sort-dropped-item ' + (isCorrect ? 'cc5-drop-correct' : 'cc5-drop-incorrect') + '">'
                + '<span class="cc5-drop-icon">' + icon + '</span>'
                + '<span>' + $item.text() + '</span>'
                + '</div>');
            $dropzone.append($dropped);
            playSortDropSound();

            $scoreEl.text(score);

            setTimeout(function () {
                $currentItem.removeClass('cc5-sort-correct cc5-sort-incorrect');
                $arena.find('.cc5-sort-tap').prop('disabled', false);
                $arena.data('sorting-locked', false);
                self._showSortItem($challenge, idx + 1);
            }, 600);
        },

        _showChallengeComplete: function ($challenge) {
            var self = this;
            var total = parseInt($challenge.data('total-activities'), 10) || 3;
            var passed = 0;
            if ($challenge.data('quiz-passed')) passed++;
            if ($challenge.data('flip-passed')) passed++;
            if ($challenge.data('sort-passed')) passed++;
            var pct = Math.round((passed / total) * 100);

            // Slide current panel out left, completion slides in from right
            $challenge.addClass('cc5-transitioning');
            playSlideSound();
            var $currentPanel = $challenge.find('.cc5-challenge-panel.cc5-active');
            $currentPanel.addClass('cc5-panel-slide-out-left');

            setTimeout(function () {
                $currentPanel.removeClass('cc5-active cc5-panel-slide-out-left');
                $challenge.find('.cc5-challenge-step').addClass('cc5-done').removeClass('cc5-active');

                var $complete = $challenge.find('.cc5-challenge-complete').removeClass('cc5-hidden').addClass('cc5-complete-slide-in-right');

                // v12.57 FIX-CC-CHALLENGE-NEXT: Hide the Continue button when the challenge
                // is on the last slide (no next chevron exists or it will be a Finish button
                // returning to the topic grid rather than advancing to a new content slide).
                var $nextChevron = self.container.find('.cc5-nav-chevron.cc5-next');
                var _isLastSlide = $nextChevron.length === 0;
                if (_isLastSlide) {
                    $complete.find('.cc5-challenge-continue-btn').hide();
                }

                // Set result text based on score
                var $resultText = $complete.find('.cc5-challenge-result-text');
                if (pct === 100) {
                    $resultText.html('<span class="cc5-result-correct">' + passed + '</span> / ' + total + ' Activities Complete &mdash; Perfect!');
                } else {
                    $resultText.html('<span class="cc5-result-correct">' + passed + '</span> / ' + total + ' Activities Complete');
                }

                // SVG ring setup
                var circumference = 2 * Math.PI * 52;
                $complete.find('.cc5-score-track, .cc5-score-fill').css({
                    'stroke-dasharray': circumference,
                    fill: 'none',
                    'stroke-width': 8
                });
                $complete.find('.cc5-score-track').css({ stroke: 'hsl(0 0% 92%)', 'stroke-linecap': 'round' });
                var fillStroke = pct === 100 ? 'hsl(142 71% 45%)' : (pct >= 50 ? 'hsl(22 90% 55%)' : 'hsl(0 72% 55%)');
                $complete.find('.cc5-score-fill').css({
                    stroke: fillStroke,
                    'stroke-dashoffset': circumference,
                    'stroke-linecap': 'round',
                    transform: 'rotate(-90deg)',
                    'transform-origin': '50% 50%',
                    transition: 'stroke-dashoffset 0.04s linear'
                });

                var $pct = $complete.find('.cc5-challenge-percentage');
                $pct.text('0%');
                var pctColor = pct === 100 ? 'hsl(142 55% 35%)' : (pct >= 50 ? 'hsl(22 80% 38%)' : 'hsl(0 65% 45%)');
                $pct.css('color', pctColor);
                var currentPct = 0;
                setTimeout(function () {
                    var animInterval = setInterval(function () {
                        currentPct += 1;
                        if (currentPct > pct) currentPct = pct;
                        $pct.text(currentPct + '%');
                        var offset = circumference - (currentPct / 100) * circumference;
                        $complete.find('.cc5-score-fill').css('stroke-dashoffset', offset);
                        if (currentPct >= pct) {
                            clearInterval(animInterval);
                            if (pct === 100) {
                                $complete.find('.cc5-challenge-score-ring').addClass('cc5-score-glow-green');
                            } else if (pct >= 50) {
                                $complete.find('.cc5-challenge-score-ring').addClass('cc5-score-glow-orange');
                            } else {
                                $complete.find('.cc5-challenge-score-ring').addClass('cc5-score-glow-red');
                            }
                        }
                    }, 18);
                }, 300);

                if (pct === 100) {
                    setTimeout(function () {
                        playChallengeCompleteSound();
                        haptic(40);
                        self._fireConfetti($complete.find('.cc5-confetti-container'));
                        showActivityConfetti();
                    }, 400);

                    // v11.10: Record challenge completion in progress for Moodle completion tracking.
                    var challengeSectionId = $challenge.closest('.cc5-slide-content').attr('data-section-id');
                    if (challengeSectionId) {
                        if (!self.progress.sections[challengeSectionId]) {
                            self.progress.sections[challengeSectionId] = {};
                        }
                        self.progress.sections[challengeSectionId].challengeComplete = true;
                        self.saveProgress();
                    }
                } else {
                    setTimeout(function () { playDecisionCorrectSound(); }, 300);
                }

                setTimeout(function () {
                    $complete.removeClass('cc5-complete-slide-in-right');
                    $challenge.removeClass('cc5-transitioning');
                }, 500);
            }, 300);
        },

        _fireConfetti: function ($container) {
            var colors = ['#f94144','#f3722c','#f8961e','#f9c74f','#90be6d','#43aa8b','#577590','#277da1'];
            var shapes = ['cc5-confetti-square','cc5-confetti-circle','cc5-confetti-strip'];
            for (var i = 0; i < 80; i++) {
                var shape = shapes[Math.floor(Math.random() * shapes.length)];
                var $piece = $('<div class="cc5-confetti-piece ' + shape + '"></div>');
                $piece.css({
                    left: (Math.random() * 100) + '%',
                    background: colors[Math.floor(Math.random() * colors.length)],
                    animationDelay: (Math.random() * 1.0) + 's',
                    animationDuration: (1.5 + Math.random() * 1.5) + 's'
                });
                $container.append($piece);
            }
            setTimeout(function () { $container.find('.cc5-confetti-piece').remove(); }, 4500);
        },

        /**
         * Bind event handlers
         */
        bindEvents: function () {
            var self = this;            
            // v6.6.43: Log container for debugging event delegation
            // DEBUG: Document-level click to verify clicks work
            $(document).on("click", ".cc5-topic-card", function (e) { });
            
            // Topic card click (v6.5.3: respect lockstep mode)
            this.container.on('click keydown', '.cc5-topic-card', function (e) {
                // WCAG 2.1 AA: Keyboard support for topic cards.
                // v13.85: this guard had been merged onto the end of the comment line
                // above, so EVERY keystroke on a focused topic card opened the topic and
                // preventDefault() ran unconditionally - Tab could not move focus off a
                // topic card at all.
                if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') { return; }
                if (e.type === 'keydown') { e.preventDefault(); }
                e.preventDefault();
                
                // v6.5.3: Check if topic is locked
                var isLocked = $(this).data('locked') === true || $(this).data('locked') === 'true';
                if (isLocked) {
                    // Show locked message
                    var $card = $(this);
                    var $lockBadge = $card.find('.cc5-topic-lock-badge');
                    if ($lockBadge.length) {
                        $lockBadge.addClass('cc5-lock-shake');
                        setTimeout(function () {
                            $lockBadge.removeClass('cc5-lock-shake');
                        }, 600);
                    }
                    return; // Prevent navigation
                }
                
                var topicId = $(this).data('topic-id');
                // FIX-CC-CLICK-DIAG (v12.94): Log the raw topicId value and type so that any
                // future topic-not-found fallback in renderSlideView() can be correlated here.
                ccLog('[CC v' + CC_VERSION + '] topic-card click: topicId=' +
                    JSON.stringify(topicId) + ' type=' + typeof topicId);
                self.currentView = 'slides';
                self.currentTopicId = topicId;
                self.currentSlideIndex = 0;
                self.voiceoverPlayed = false;
                self.tutorialShown = !!localStorage.getItem('cc5_tutorial_' + self.cmid);
                self.saveSessionState(); // v6.6.88: Save state for page reload
                self.render();
            });
            
            // ===============================================================
            // v13.92: Topics-and-Text sequential card reveal.
            //
            // "Next Card" advances by hand. When voiceover is playing, the reveal
            // advances itself from the audio timeline (see setupVoiceoverSync) and this
            // button is the manual path for a learner with audio muted or finished.
            // ===============================================================
            this.container.on('click', '.cc5-prose-next-btn', function (e) {
                e.preventDefault();
                var $btn = $(this);
                // v13.94.4: a used button is only visually retired by CSS
                // (pointer-events: none), which does not stop a keyboard Enter, and a
                // locked button must not advance at all. Guard both here rather than
                // relying on styling to enforce behaviour.
                if ($btn.hasClass('cc5-prose-btn-used') || $btn.hasClass('cc5-prose-btn-locked')) {
                    return;
                }
                var target = $btn.attr('data-prose-next');
                var $grid = $btn.closest('.cc5-prose-grid');
                $btn.removeClass('cc5-prose-btn-ready');

                if (target === 'activities') {
                    self.revealProseActivities($grid);
                } else {
                    var _targetCard = parseInt(target, 10);
                    self.revealProseCard($grid, _targetCard, true);
                    // v13.94.7: the narration FOLLOWS the learner.
                    //
                    // v13.94.4 stopped the audio here. That fixed the reported symptom -
                    // card 1 still being read over card 2 - but Topics and Text narrates
                    // the whole section from ONE file, so stopping it meant cards 2 onward
                    // had no narration at all and nothing could restart it. Seeking the
                    // playhead to where this card's narration begins fixes the original
                    // complaint AND keeps the voice going.
                    //
                    // Applies in every progression mode, including "must listen": there
                    // the button only unlocks for a card already read, so the seek is a
                    // no-op (it never jumps backwards) and the audio runs on to the end,
                    // which is what the slide-level Next control waits for.
                    self.seekProseNarrationToCard($grid, _targetCard);
                }
            });

            // Back button click (v6.7.54: Always enabled, no disabled check needed)
            this.container.on('click', '.cc5-back-btn', function (e) {
                e.preventDefault();
                if (self.slideTimer) {
                    clearInterval(self.slideTimer);
                    self.slideTimer = null;
                }
                if (self._quizFbAudio) {
                    // v13.94.6: the quiz feedback clip was referenced by exactly one handler
                    // and by nothing else, so it survived the slide transition and played on
                    // over the next slide's narration.
                    try { self._quizFbAudio.pause(); } catch (e) { /* detached */ }
                    self._quizFbAudio = null;
                }
                if (self.currentAudio) {
                    self.currentAudio.pause();
                    self.currentAudio = null;
                }
                self.teardownVoiceoverSync(); // v13.92
                self.currentView = 'topics';
                self.currentTopicId = null;
                self.saveSessionState(); // v6.6.88: Save state for page reload
                self.render();
            });
            
            // v7.7.5: Before You Start checklist checkbox handler
            
            // v8.4.46: QuickCheck checklist - whole row clickable, toggles native checkbox
            this.container.on('click', '.cc5-quickcheck-section .cc5-checklist-item', function (e) {
                if ($(e.target).is('input[type="checkbox"]')) return;
                e.preventDefault();
                var $item = $(this);
                var $checkbox = $item.find('.cc5-checklist-checkbox');
                if ($checkbox.length) {
                    var newState = !$checkbox.prop('checked');
                    $checkbox.prop('checked', newState).trigger('change');
                }
            });
            // Users MUST tick all boxes before slide can be considered complete
            this.container.on('change', '.cc5-checklist-checkbox', function (e) {
                var $checkbox = $(this);
                var $item = $checkbox.closest('.cc5-checklist-item');
                var $section = $checkbox.closest('.cc5-beforestart-section, .cc5-quickcheck-checklist');
                var isChecked = $checkbox.prop('checked');
                
                // Update visual state
                $item.attr('data-checked', isChecked ? 'true' : 'false');
                $item.toggleClass('cc5-checked', isChecked);
                $item.find('.cc5-check-empty').toggle(!isChecked);
                $item.find('.cc5-check-filled').toggle(isChecked);
                
                if (isChecked) {
                    playTickSound();
                }
                
                // Check if all items are checked
                var totalItems = parseInt($section.attr('data-checklist-count')) || 0;
                var checkedItems = $section.find('.cc5-checklist-checkbox:checked').length;
                var allChecked = checkedItems === totalItems;
                
                // Update completion status indicator
                $section.find('.cc5-checklist-status').toggle(allChecked);
                
                // Mark section as complete/incomplete
                $section.attr('data-checklist-complete', allChecked);
                
                // v7.7.5: Update slide completion state for activity completion
                if (allChecked) {
                    self.markChecklistComplete();
                }
                
                self.updateActivityNavState();
            });

            
            // Slide indicator click
            // v8.4.6: Block forward navigation if current slide is not complete (progression enforcement)
            this.container.on('click keydown', '.cc5-slide-indicator', function (e) {
                // WCAG 2.1 AA: Keyboard support for slide indicators
                if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
                if (e.type === 'keydown') e.preventDefault();
                e.preventDefault();
                var index = parseInt($(this).data('slide-index'));
                if (index !== self.currentSlideIndex) {
                    // Allow going backward always, but forward only if current slide is complete
                    if (index > self.currentSlideIndex) {
                        var sections = self.getCurrentSections();
                        var currentSection = sections[self.currentSlideIndex];
                        if (currentSection && !self.canNavigateNext(currentSection)) {                            return;
                        }
                    }
                    self.navigateToSlide(index);
                }
            });
            
            // Previous slide
            this.container.on('click', '.cc5-nav-chevron.cc5-prev:not(.cc5-disabled)', function (e) {
                e.preventDefault();
                self.navigateToSlide(self.currentSlideIndex - 1);
            });
            
            // Next slide
            this.container.on('click', '.cc5-nav-chevron.cc5-next:not(.cc5-disabled)', function (e) {
                e.preventDefault();
                var sections = self.getCurrentSections();
                
                // Mark current slide complete when advancing (v6.4.4 - use slideId for expanded sections)
                if (sections[self.currentSlideIndex]) {
                    var currentSection = sections[self.currentSlideIndex];
                    self.markSectionComplete(currentSection.slideId || currentSection.id);
                }
                
                if (self.currentSlideIndex < sections.length - 1) {
                    self.navigateToSlide(self.currentSlideIndex + 1);
                    // After advancing, if all slides are now complete go back to topics
                    if (self.areAllExpandedSlidesComplete(self.getCurrentSections())) {
                        self.currentView = 'topics';
                        self.currentTopicId = null;
                        self.saveSessionState();
                        self.render();
                    }
                } else {
                    // v9.65: On the last slide the "Finish" chevron must navigate back to topics.
                    // Previously the outer condition was false, so only markSectionComplete ran
                    // (triggering the completion chime) but the view never changed.
                    // v10.43c FIX-NAV-AUDIO: stop any playing voiceover before leaving the slide
                    // view. This path doesn't go through navigateToSlide so audio was never
                    // stopped  -  it would keep playing silently in the background on the topics screen.
                    if (self.currentAudio) {
                        self.currentAudio.pause();
                        self.currentAudio = null;
                    }
                    self.teardownVoiceoverSync(); // v13.92
                    self.currentAudioSectionId = null;
                    self.currentView = 'topics';
                    self.currentTopicId = null;
                    self.saveSessionState();
                    self.render();
                }
            });
            
            // v6.6.62: Show warning when clicking disabled next button on activity slides
            this.container.on('click', '.cc5-nav-chevron.cc5-next.cc5-disabled', function (e) {
                e.preventDefault();
                e.stopPropagation();
                
                var sections = self.getCurrentSections();
                var currentSection = sections[self.currentSlideIndex];
                
                // Only show warning for activity slides
                if (currentSection && currentSection.slideType === 'activity') {
                    var message = self.getActivityIncompleteMessage(currentSection);
                    self.showActivityWarning(message);
                }
            });
            
            // Voiceover button click (large button)
            // v12.55: Language switcher  -  swap manifest.topics to selected language
            this.container.on('click', '.cc5-lang-pill', function (e) {
                e.preventDefault();
                var code = $(this).data('lang') || '';
                self.setActiveLang(code);
            });

            this.container.on('click', '.cc5-voiceover-btn-large', function (e) {
                e.preventDefault();
                e.stopPropagation();
                var sectionId = $(this).attr('data-section-id');
                self.playVoiceover(sectionId);
            });
            
            // v8.4.53: Pause voiceover button click
            this.container.on('click', '.cc5-voiceover-pause-btn', function (e) {
                e.preventDefault();
                e.stopPropagation();
                var sectionId = $(this).attr('data-section-id');
                if (self.currentAudio && !self.currentAudio.paused) {
                    self.currentAudio.pause();
                    var playBtn = self.container.find('.cc5-voiceover-btn-large[data-section-id="' + sectionId + '"]');
                    playBtn.removeClass('cc5-playing');
                    $(this).hide();
                }
            });
            
            // Tutorial dismiss
            this.container.on('click', '[data-action="dismiss-tutorial"]', function (e) {
                e.preventDefault();
                self.container.find('.cc5-tutorial-overlay').fadeOut(200, function () {
                    $(this).remove();
                });
            });
            
            // v6.6.15: Regenerate content button click
            this.container.on('click', '.cc5-regenerate-btn', function (e) {
                e.preventDefault();
                // Redirect to builder with regenerate=failed parameter
                // The builder will only regenerate slides with generated:false
                var failedCount = self.countFailedSlides();
                if (failedCount > 0) {
                    var confirmMsg = 'There are ' + failedCount + ' slides with placeholder content. ' +
                        'Regenerate only the failed slides? (Successful content will be preserved)';
                    Notification.saveCancelPromise('Regenerate failed slides', confirmMsg, 'Regenerate')
                        .then(function () {
                            window.location.href = '?id=' + self.cmid + '&edit=1&regenerate=failed';
                            return null;
                        })
                        .catch(function () {
                            // User cancelled  -  nothing to do.
                            return null;
                        });
                }
            });
            
            // v6.6.66: Export PDF button click
            this.container.on('click', '.cc5-export-pdf-btn', function (e) {
                e.preventDefault();
                e.stopPropagation();
                self.exportAsPdf();
            });
            
            // v6.6.66: Export Text button click
            this.container.on('click', '.cc5-export-text-btn', function (e) {
                e.preventDefault();
                e.stopPropagation();
                self.exportAsText();
            });
            
            // v6.7.57: Settings button click
            this.container.on('click', '.cc5-settings-btn', function (e) {
                e.preventDefault();
                e.stopPropagation();
                self.showSettingsModal();
            });
            
            // v6.7.57: Settings modal event handlers
            $(document).on('click', '.cc5-settings-modal-close', function (e) {
                e.preventDefault();
                e.stopPropagation();
                $('.cc5-settings-modal-overlay').remove();
            });
            
            $(document).on('click', '.cc5-settings-modal-overlay', function (e) {
                if ($(e.target).hasClass('cc5-settings-modal-overlay')) {
                    $('.cc5-settings-modal-overlay').remove();
                }
            });
            
            $(document).on('click', '.cc5-settings-save-btn', function (e) {
                e.preventDefault();
                e.stopPropagation();
                self.saveSettings();
            });
            
            $(document).on('click', '.cc5-settings-cancel-btn', function (e) {
                e.preventDefault();
                e.stopPropagation();
                $('.cc5-settings-modal-overlay').remove();
            });
            
            // v7.2.46: Bulk generate AI images button handler
            $(document).on('click', '.cc5-bulk-generate-images-btn', function (e) {
                e.preventDefault();
                e.stopPropagation();
                self.bulkGenerateImages();
            });

            // v7.9.88: Bulk generate AI voiceover button handler
            $(document).on('click', '.cc5-bulk-generate-voiceover-btn', function (e) {
                e.preventDefault();
                e.stopPropagation();
                self.bulkGenerateVoiceovers();
            });
            
            // ===================================================================
            // SLIDE IMAGE EVENT HANDLERS (v6.6.67)
            // ===================================================================
            
            // Add Image button click - show modal
            this.container.on('click', '.cc5-add-image-btn', function (e) {
                e.preventDefault();
                e.stopPropagation();
                var sectionId = $(this).attr('data-section-id');
                var topicId = $(this).data('topic-id');
                self.showImageModal(sectionId, topicId);
            });

            // v11.58: Slide image load failure recovery.
            // When a cc-images/ file 404s (e.g. server restart wiped the file), the <img> onerror
            // dispatches a custom bubbling 'cc5img_error' event so we can degrade gracefully:
            //   - Teachers: replace the broken image with the "Add Image" button to re-generate.
            //   - Students: hide the container so they never see the broken-icon + alt text.
            // NOTE: The native DOM 'error' event doesn't bubble, so jQuery delegated
            //       .on('error', '.cc5-slide-image') would silently fail  -  hence the custom event.
            this.container.on('cc5img_error', '.cc5-slide-image-container', function () {
                var $container = $(this);
                var sectionId = $container.data('section-id');
                ccWarn('[CC5] Slide image 404 for section ' + sectionId + ' (server file may have been removed). Recovering UI...');

                if (self.canEdit && sectionId) {
                    // Teacher mode: swap broken wrapper  ->  Add Image empty state
                    var topicId = '';
                    if (self.manifest && self.manifest.topics) {
                        self.manifest.topics.some(function (t) {
                            return t.sections.some(function (s) {
                                if (s.id === sectionId) { topicId = t.id; return true; }
                                return false;
                            });
                        });
                    }
                    var emptyHtml = '<div class="cc5-slide-image-empty">';
                    emptyHtml += '<button type="button" class="cc5-add-image-btn" style="background:#fff !important;" data-section-id="' + sectionId + '" data-topic-id="' + topicId + '">';
                    emptyHtml += '<span class="cc5-add-image-icon">' + getIcon('image-plus') + '</span>';
                    emptyHtml += '<span class="cc5-add-image-text">' + getLabel('addImage') + '</span>';
                    emptyHtml += '</button>';
                    emptyHtml += '</div>';
                    $container.html(emptyHtml);
                } else {
                    // Student mode: silently hide the container  -  no broken icon, no alt text
                    $container.hide();
                }
            });
            
            // Image regenerate button click - show modal with prompt input (v6.6.69)
            this.container.on('click', '.cc5-image-regenerate-btn', function (e) {
                e.preventDefault();
                e.stopPropagation();
                var sectionId = $(this).attr('data-section-id');
                self.showRegenerateModal(sectionId);
            });

            // IMAGE2 event handlers removed in v11.16
            
            $(document).on('click', '.cc5-regen-cancel-btn', function (e) {
                e.preventDefault();
                e.stopPropagation();
                $('.cc5-regenerate-modal-overlay').remove();
            });
            
            // Regenerate modal confirm button
            $(document).on('click', '.cc5-regen-confirm-btn', function (e) {
                e.preventDefault();
                e.stopPropagation();
                var sectionId = $(this).attr('data-section-id');
                var customPrompt = $('#cc5-regen-prompt').val() || '';
                $('.cc5-regenerate-modal-overlay').remove();
                self.generateSlideImage(sectionId, customPrompt, true);
            });
            
            // Image remove button click
            this.container.on('click', '.cc5-image-remove-btn', function (e) {
                e.preventDefault();
                e.stopPropagation();
                var sectionId = $(this).attr('data-section-id');
                self.removeSlideImage(sectionId);
            });
            
            $(document).on('click', '.cc5-image-modal-close', function (e) {
                e.preventDefault();
                e.stopPropagation();
                
                var $overlay = $(this).closest('.cc5-image-modal-overlay');
                var sectionId = $overlay.attr('data-section-id') ||
                                $overlay.find('[data-section-id]').first().attr('data-section-id');
                
                var isGalleryModal = $overlay.hasClass('cc5-gallery-modal-overlay');
                var isPickerModal = $overlay.hasClass('cc5-image-picker-overlay');
                var isCommunityModal = $overlay.hasClass('cc5-community-modal-overlay');
                
                $overlay.remove();
                
                if ((isGalleryModal || isPickerModal || isCommunityModal) && sectionId) {
                    self.showImageModal(sectionId);
                }
            });
            
            $(document).on('click', '.cc5-image-modal-overlay', function (e) {
                if ($(e.target).hasClass('cc5-image-modal-overlay')) {
                    var $overlay = $(e.target);
                    var sectionId = $overlay.attr('data-section-id') ||
                                    $overlay.find('[data-section-id]').first().attr('data-section-id');
                    
                    var isGalleryModal = $overlay.hasClass('cc5-gallery-modal-overlay');
                    var isPickerModal = $overlay.hasClass('cc5-image-picker-overlay');
                    var isCommunityModal = $overlay.hasClass('cc5-community-modal-overlay');
                    
                    $overlay.remove();
                    
                    if ((isGalleryModal || isPickerModal || isCommunityModal) && sectionId) {
                        self.showImageModal(sectionId);
                    }
                }
            });
            
            // -- v10.36: Decision Point card  -  interactive option click -----------
            // Handles tap/click on .cc5-dp-option inside .cc5-decision-point-card.
            // On first click: marks chosen option correct/incorrect, reveals feedback,
            // locks the card. Wrong answer also reveals the Try Again button.
            // Keyboard: Enter/Space activate.
            $(document).on('click keydown', '.cc5-dp-option', function (e) {
                if (e.type === 'keydown' && e.which !== 13 && e.which !== 32) return;
                var $option  = $(this);
                if ($option.closest('.cc5-decision-challenge').length) return;
                var $card    = $option.closest('.cc5-decision-point-card');
                var $options = $option.closest('.cc5-dp-options');
                if ($options.data('answered') === true || $options.attr('data-answered') === 'true') return;
                e.preventDefault();
                var isCorrect = ($option.attr('data-correct') === 'true');
                // Mark the chosen option
                $option.attr('data-selected', isCorrect ? 'correct' : 'incorrect');
                // v13.86: announce the result in text, and reflect the locked state, so a
                // screen-reader user gets the same signal the colour and glyph give
                // everyone else.
                $option.attr('aria-pressed', 'true');
                $option.find('.cc5-dp-result-text').text(isCorrect ? 'Correct' : 'Incorrect');
                // Show its feedback
                $option.find('.cc5-dp-feedback').show();
                // Lock the options container
                $options.attr('data-answered', 'true').data('answered', true);
                $options.find('.cc5-dp-option').attr('aria-disabled', 'true');
                // For keyboard: focus the chosen option for accessibility
                $option.focus();
                // v10.63: Play audio feedback
                if (isCorrect) {
                    playDecisionCorrectSound();
                } else {
                    playDecisionIncorrectSound();
                }
                // v10.36: Show Try Again only for wrong answers
                if (!isCorrect) {
                    $card.find('.cc5-dp-try-again').show();
                }
            });

            // -- v10.43b: Try Again  -  completely reset the decision-point card --
            // Re-renders each option from scratch (removes all inline styles, attrs,
            // and jQuery .data() in one clean pass) so no stale CSS or state survives.
            $(document).on('click', '.cc5-dp-try-again-btn', function (e) {
                e.preventDefault();
                e.stopPropagation();
                var $btn     = $(this);
                if ($btn.closest('.cc5-decision-challenge').length) return;
                var $card    = $btn.closest('.cc5-decision-point-card');
                var $options = $card.find('.cc5-dp-options');

                // -- 1. Unlock the container (both jQuery data store AND DOM attr) --
                $options
                    .attr('data-answered', 'false')
                    .data('answered', false)
                    .removeData('answered');
                $options.attr('data-answered', 'false');

                // -- 2. Reset every option row completely --
                $options.find('.cc5-dp-option').each(function () {
                    var $opt = $(this);
                    // Remove selection attribute so CSS colour rules don't apply
                    $opt.removeAttr('data-selected');
                    // v13.86: clear the announced result and the locked state too.
                    $opt.attr('aria-pressed', 'false').removeAttr('aria-disabled');
                    $opt.find('.cc5-dp-result-text').text('');
                    // Clear any inline styles jQuery or previous code may have set
                    $opt.css({ 'border-color': '', background: '', opacity: '', 'pointer-events': '' });
                    // Force-hide feedback (remove inline display:block set by .show())
                    var $fb = $opt.find('.cc5-dp-feedback');
                    $fb.hide();
                    $fb.css('display', ''); // remove inline style so CSS default (display:none) applies
                    // Hide result icon
                    $opt.find('.cc5-dp-result-icon').css('opacity', '');
                });

                // -- 3. Hide the Try Again button --
                $card.find('.cc5-dp-try-again').hide();

                // -- 4. Return focus to first option --
                $options.find('.cc5-dp-option').first().trigger('focus');
            });
            // -- end v10.43b decision point handler ----------------------------

            // ===============================================================
            // v11.10: DECISION CHALLENGE  -  3-activity event handlers
            // ===============================================================

            // Enable "Next" button in challenge when quiz answered correctly
            $(document).on('click keydown', '.cc5-decision-challenge .cc5-dp-option', function (e) {
                if (e.type === 'keydown' && e.which !== 13 && e.which !== 32) return;
                var $opt = $(this);
                var $challenge = $opt.closest('.cc5-decision-challenge');
                var $options = $opt.closest('.cc5-dp-options');
                if ($options.data('answered') === true || $options.attr('data-answered') === 'true') return;
                e.preventDefault();
                var isCorrect = ($opt.attr('data-correct') === 'true');
                $opt.attr('data-selected', isCorrect ? 'correct' : 'incorrect');
                // v13.86: same accessibility treatment as the standalone card above.
                $opt.attr('aria-pressed', 'true');
                $opt.find('.cc5-dp-result-text').text(isCorrect ? 'Correct' : 'Incorrect');
                $opt.find('.cc5-dp-feedback').show();
                $options.attr('data-answered', 'true').data('answered', true);
                $options.find('.cc5-dp-option').attr('aria-disabled', 'true');
                $opt.focus();
                // v13.32: Quiz voiceover — speak feedback text aloud via Web Speech API
                // FIX-CC-QUIZ-VOICE-DELAY (v13.38): Chrome Web Speech API has a known
                // bug where calling speak() immediately after cancel() — even when no
                // utterance is actively playing — causes a multi-second delay before the
                // new utterance starts. Root cause: after a prior utterance finishes
                // naturally, Chrome leaves residual state in its internal TTS state
                // machine. Q1 fired instantly because the synth was completely idle on
                // first use; Q2-Q5 were delayed because each had a prior completed
                // utterance's residual state. Fix: cancel() to clear any queued/active
                // utterance, then defer speak() by 50 ms (one event-loop cycle) so the
                // browser fully settles the synth before queuing the new utterance.
                // FIX-CC-QUIZ-VOICE-ENGINE (v13.93): this used the browser's Web Speech API.
                //
                // That could never honour the author's choice. Card narration is Chirp 3 HD
                // in the selected voice (self.voiceName - Aoede, Kore, Puck...); Web Speech
                // knows nothing about it and speaks in whatever the operating system
                // provides. Worse, the en-AU accent hint only worked if the learner's device
                // happened to have an en-AU voice installed. On a Windows machine with none,
                // it fell through to "Microsoft George - English (United Kingdom)": a male UK
                // voice under a female Australian selection. Two learners on two devices
                // heard two different narrators, and neither heard the one the author picked.
                //
                // Every voice in this plugin is now Chirp 3 HD in the selected voice, without
                // exception. The feedback clip is pre-generated at build time and its URL is
                // carried on the option element. If there is no clip - an older manifest, or
                // a build where TTS failed - the feedback is silent rather than spoken by the
                // wrong voice. Silence is recoverable; the wrong narrator is not.
                if (self.quizVoiceEnabled) {
                    var _fbUrl = $opt.attr('data-feedback-audio');
                    if (_fbUrl) {
                        try {
                            // v13.94.6: the section narration has to stop too. This handler
                            // only ever knew about the PREVIOUS feedback clip, so answering a
                            // quiz while the section was still being narrated produced two
                            // Chirp voices at once - the same narrator, different sentences.
                            if (self.currentAudio) {
                                try { self.currentAudio.pause(); } catch (e) { /* detached */ }
                            }
                            if (self._quizFbAudio) {
                                self._quizFbAudio.pause();
                                self._quizFbAudio.currentTime = 0;
                            }
                            self._quizFbAudio = new Audio(_fbUrl);
                            self._quizFbAudio.play().catch(function (e) {
                                // Autoplay policy, or a missing file. Never fall back to a
                                // different voice - just log it.
                                ccWarn('[QUIZ VOICE] feedback clip would not play: ' + e.message);
                            });
                        } catch (e) {
                            ccWarn('[QUIZ VOICE] feedback clip error: ' + e.message);
                        }
                    } else {
                        ccWarn('[QUIZ VOICE] no pre-generated feedback clip on this option  -  '
                            + 'silent by design. Re-generate the module to add quiz narration.');
                    }
                }
                if (isCorrect) {
                    playDecisionCorrectSound();
                    haptic(12);
                    if (!$challenge.data('quiz-passed')) {
                        $challenge.data('quiz-passed', true);
                        var $btn = $challenge.find('.cc5-challenge-next-btn').first();
                        $btn.prop('disabled', false).addClass('cc5-enabled cc5-btn-pulse');
                        playUnlockSound();
                        $challenge.find('.cc5-challenge-step[data-step="1"] .cc5-step-status')
                            .html('<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>');
                        showActivityMiniCelebration($challenge.find('.cc5-challenge-panel.cc5-active'));
                    }
                    $challenge.find('.cc5-challenge-panel.cc5-active .cc5-dp-try-again').hide();
                } else {
                    playDecisionIncorrectSound();
                    haptic(30);
                    $challenge.find('.cc5-challenge-panel.cc5-active .cc5-dp-try-again').show();
                }
            });

            // Try Again inside challenge quiz  -  reset options so user can try again
            $(document).on('click', '.cc5-decision-challenge .cc5-dp-try-again-btn', function (e) {
                e.preventDefault();
                e.stopPropagation();
                var $btn = $(this);
                var $panel = $btn.closest('.cc5-challenge-panel');
                var $options = $panel.find('.cc5-dp-options');
                $options.attr('data-answered', 'false').data('answered', false).removeData('answered');
                $options.find('.cc5-dp-option').each(function () {
                    var $opt = $(this);
                    $opt.removeAttr('data-selected');
                    // v13.86: clear the announced result and the locked state too.
                    $opt.attr('aria-pressed', 'false').removeAttr('aria-disabled');
                    $opt.find('.cc5-dp-result-text').text('');
                    $opt.css({ 'border-color': '', background: '', opacity: '', 'pointer-events': '' });
                    var $fb = $opt.find('.cc5-dp-feedback');
                    $fb.hide();
                    $fb.css('display', '');
                    $opt.find('.cc5-dp-result-icon').css('opacity', '');
                });
                $panel.find('.cc5-dp-try-again').hide();
                $options.find('.cc5-dp-option').first().trigger('focus');
            });

            // "Next Activity" button  -  slide current panel left, new panel slides in from right
            $(document).on('click', '.cc5-challenge-next-btn', function (e) {
                e.preventDefault();
                if ($(this).prop('disabled')) return;
                var nextPanel = parseInt($(this).data('next'), 10);
                var $challenge = $(this).closest('.cc5-decision-challenge');
                // Clip overflow during transition so sliding panels don't leak
                $challenge.addClass('cc5-transitioning');
                playSlideSound();
                // Slide current panel out to the left
                var $current = $challenge.find('.cc5-challenge-panel.cc5-active');
                $current.addClass('cc5-panel-slide-out-left');
                setTimeout(function () {
                    $current.removeClass('cc5-active cc5-panel-slide-out-left');
                    // Slide new panel in from the right
                    var $next = $challenge.find('.cc5-challenge-panel[data-panel="' + nextPanel + '"]');
                    $next.addClass('cc5-active cc5-panel-slide-in-right');
                    $challenge.find('.cc5-challenge-step').removeClass('cc5-active');
                    var $nextStep = $challenge.find('.cc5-challenge-step[data-step="' + nextPanel + '"]');
                    $nextStep.addClass('cc5-active');
                    // In review mode keep all steps marked done; in normal mode mark previous as done
                    if ($challenge.data('reviewing')) {
                        $challenge.find('.cc5-challenge-step').addClass('cc5-done');
                        $nextStep.addClass('cc5-active');
                    } else {
                        $nextStep.prevAll('.cc5-challenge-step').addClass('cc5-done');
                    }
                    // Start sort activity if entering sort panel
                    if ($next.find('.cc5-sort-arena').length) {
                        self._initSortActivity($challenge);
                    }
                    setTimeout(function () {
                        $next.removeClass('cc5-panel-slide-in-right');
                        $challenge.removeClass('cc5-transitioning');
                    }, 450);
                }, 300);
            });

            // Flip card click with satisfying whoosh sound
            $(document).on('click keydown', '.cc5-flip-card', function (e) {
                if (e.type === 'keydown' && e.which !== 13 && e.which !== 32) return;
                e.preventDefault();
                var $card = $(this);
                if ($card.attr('data-flipped') === 'true') return;
                $card.attr('data-flipped', 'true').addClass('cc5-flipped');
                playFlipSound();
                haptic(8);
                var $grid = $card.closest('.cc5-flip-grid');
                var flipped = $grid.find('.cc5-flip-card[data-flipped="true"]').length;
                var total = parseInt($grid.data('total'), 10);
                $grid.data('flipped', flipped);
                var $panel = $grid.closest('.cc5-challenge-panel');
                $panel.find('.cc5-flip-count').text(flipped);
                var pct = Math.round((flipped / total) * 100);
                $panel.find('.cc5-flip-progress-fill').css('width', pct + '%');
                if (flipped >= total) {
                    $card.addClass('cc5-flip-last-sparkle');
                    var $btn = $panel.find('.cc5-challenge-next-btn, .cc5-challenge-finish-btn');
                    $btn.prop('disabled', false).addClass('cc5-enabled cc5-btn-pulse');
                    $panel.closest('.cc5-decision-challenge').data('flip-passed', true);
                    playUnlockSound();
                    haptic(20);
                    $panel.find('.cc5-flip-complete-msg').removeClass('cc5-hidden');
                    showActivityMiniCelebration($panel);
                }
            });

            // Sort activity tap buttons with drop sound
            $(document).on('click', '.cc5-sort-tap', function (e) {
                e.preventDefault();
                var $btn = $(this);
                $btn.addClass('cc5-tap-pressed');
                setTimeout(function () { $btn.removeClass('cc5-tap-pressed'); }, 150);
                var tapped = $btn.data('tap');
                self._handleSortAnswer($btn.closest('.cc5-decision-challenge'), tapped);
            });

            // "See Results" button  -  trigger completion
            $(document).on('click', '.cc5-challenge-finish-btn', function (e) {
                e.preventDefault();
                if ($(this).prop('disabled')) return;
                var $challenge = $(this).closest('.cc5-decision-challenge');
                self._showChallengeComplete($challenge);
            });

            // Retry activities  -  preserve scroll position across re-render
            $(document).on('click', '.cc5-challenge-retry-btn', function (e) {
                e.preventDefault();
                playTickSound();
                var scrollTop = $(window).scrollTop();
                self.render();
                setTimeout(function () { $(window).scrollTop(scrollTop); }, 50);
            });

            // v12.57 FIX-CC-CHALLENGE-NEXT: "Continue" button  -  navigate to the next slide/topic
            // after completing the Challenge Mode so students can progress to Content 2 without
            // needing to scroll back up to the top-of-slide chevron navigation.
            // Implementation: enable the next-chevron (challenge completion already records
            // progress, so canNavigateNext should allow it) then fire a programmatic click.
            // If there is no next slide (this is already the last one), hide the button.
            $(document).on('click', '.cc5-challenge-continue-btn', function (e) {
                e.preventDefault();
                // v13.94.6: this used to strip cc5-disabled and then trigger the chevron.
                // The Next handler is delegated as '.cc5-nav-chevron.cc5-next:not(.cc5-disabled)'
                // and jQuery evaluates a delegated selector at DISPATCH time, so removing the
                // class immediately before .trigger() made the guard match - and
                // canNavigateNext() was never consulted on this path at all.
                //
                // The effect was that "must listen to voiceover" could be skipped entirely:
                // open a slide, ignore the narration, scroll to the activity block, complete
                // the three activities, click Continue, advance. Same for TIMED mode's
                // minimum dwell. The compliance guarantee the mode exists to provide was
                // void on all five routes. Ask the same question the chevron asks.
                var _sections = self.getCurrentSections();
                if (!self.canNavigateNext(_sections[self.currentSlideIndex])) {
                    return;
                }
                var $nextChevron = self.container.find('.cc5-nav-chevron.cc5-next');
                $nextChevron.removeClass('cc5-disabled').prop('disabled', false);
                $nextChevron.trigger('click');
            });

            // Review activities  -  slide completion out, show panel 1 in read-only review mode.
            // Mark all steps as "done" so the user can navigate freely between panels using
            // the Next buttons (which stay enabled from the first pass). The step indicators
            // correctly show all activities completed during review.
            $(document).on('click', '.cc5-challenge-review-btn', function (e) {
                e.preventDefault();
                var $challenge = $(this).closest('.cc5-decision-challenge');
                $challenge.addClass('cc5-transitioning');
                $challenge.data('reviewing', true);
                playSlideSound();
                var $complete = $challenge.find('.cc5-challenge-complete');
                $complete.addClass('cc5-complete-slide-out-left');
                setTimeout(function () {
                    $complete.addClass('cc5-hidden').removeClass('cc5-complete-slide-out-left');
                    $challenge.find('.cc5-challenge-panel').removeClass('cc5-active');
                    $challenge.find('.cc5-challenge-panel').first().addClass('cc5-active cc5-panel-slide-in-right');
                    // Show all steps as completed (review mode) with step 1 also active
                    $challenge.find('.cc5-challenge-step').addClass('cc5-done').removeClass('cc5-active');
                    $challenge.find('.cc5-challenge-step').first().addClass('cc5-active');
                    setTimeout(function () {
                        $challenge.find('.cc5-challenge-panel').first().removeClass('cc5-panel-slide-in-right');
                        $challenge.removeClass('cc5-transitioning');
                    }, 450);
                }, 300);
            });
            // -- end v11.10 challenge handlers -----------------------------

            // Generate AI image option click
            $(document).on('click', '.cc5-image-generate-option', function (e) {
                e.preventDefault();
                e.stopPropagation();
                var sectionId = $(this).attr('data-section-id');
                $('.cc5-image-modal-overlay').remove();
                self.generateSlideImage(sectionId);
            });
            
            // Upload image option click - trigger file input
            $(document).on('click', '.cc5-image-upload-option', function (e) {
                e.preventDefault();
                e.stopPropagation();
                var $modal = $(this).closest('.cc5-image-modal');
                $modal.find('.cc5-image-file-input').data('section-id', $(this).attr('data-section-id')).click();
            });
            
            // v7.2.0: Gallery option click - show gallery modal
            $(document).on('click', '.cc5-image-gallery-option', function (e) {
                e.preventDefault();
                e.stopPropagation();
                var sectionId = $(this).attr('data-section-id');
                $('.cc5-image-modal-overlay').remove();
                self.showGalleryModal(sectionId);
            });
            
            // v11.29: Community Gallery option click from Add Image modal
            $(document).on('click', '.cc5-image-community-option', function (e) {
                e.preventDefault();
                e.stopPropagation();
                var sectionId = $(this).attr('data-section-id');
                $('.cc5-image-modal-overlay').remove();
                self.showCommunityGalleryModal(sectionId);
            });
            
            // File input change - validate aspect ratio then upload
            $(document).on('change', '.cc5-image-file-input', function (e) {
                var file = this.files[0];
                var sectionId = $(this).attr('data-section-id');
                var $input = $(this);
                if (file && sectionId) {
                    validateImageAspectRatio(file, function (validFile) {
                        $('.cc5-image-modal-overlay').remove();
                        self.uploadSlideImage(sectionId, validFile);
                    });
                    $input.val('');
                }
            });
            
            // v7.2.0: Zoom button click - show fullscreen preview
            $(document).on('click', '.cc5-image-zoom-btn', function (e) {
                e.preventDefault();
                e.stopPropagation();
                
                var imageUrl = $(this).data('image-url');
                if (imageUrl) {
                    self.showImageZoomModal(imageUrl);
                }
            });

            // v11.10: Download button click - download image via fetch-as-blob
            $(document).on('click', '.cc5-image-download-btn', function (e) {
                e.preventDefault();
                e.stopPropagation();

                var imageUrl = $(this).data('image-url');
                if (imageUrl) {
                    self.downloadImage(imageUrl);
                }
            });
            
            // v7.2.0: Close zoom modal
            $(document).on('click', '.cc5-zoom-modal-overlay, .cc5-zoom-modal-close', function (e) {
                if ($(e.target).hasClass('cc5-zoom-modal-overlay') || $(e.target).closest('.cc5-zoom-modal-close').length) {
                    e.preventDefault();
                    $('.cc5-zoom-modal-overlay').remove();
                }
            });
            
            // v6.6.72: Image picker item click - select image from generated options
            $(document).on('click', '.cc5-image-picker-item', function (e) {
                e.preventDefault();
                e.stopPropagation();
                
                var $item = $(this);
                var index = parseInt($item.data('index'), 10);
                var sectionId = $item.data('section-id');
                var $overlay = $('.cc5-image-picker-overlay');
                var images = $overlay.data('images') || [];
                var prompt = $overlay.data('prompt') || '';
                var sectionData = $overlay.data('sectionData');
                
                if (images.length > index) {
                    var selectedUrl = images[index];
                    var otherImages = images.filter(function (_, i) { return i !== index; });
                    
                    // Close modal
                    $overlay.remove();
                    
                    // Apply selected image and save others to gallery
                    self.applySelectedImage(sectionId, selectedUrl, prompt, sectionData, otherImages);
                    
                    if (otherImages.length > 0) {
                        Notification.addNotification({
                            message: getLabel('savedToGallery'),
                            type: 'info'
                        });
                    }
                }
            });
            
            // v6.6.72: Show gallery button click
            $(document).on('click', '.cc5-show-gallery-btn', function (e) {
                e.preventDefault();
                e.stopPropagation();
                var sectionId = $(this).attr('data-section-id');
                $('.cc5-image-modal-overlay').remove();
                self.showGalleryModal(sectionId);
            });
            
            $(document).on('click', '.cc5-gallery-item', function (e) {
                e.preventDefault();
                e.stopPropagation();
                var $item = $(this);
                var index = parseInt($item.data('index'), 10);
                var sectionId = $item.data('section-id');
                self.applyGalleryImage(sectionId, index);
            });
            
            // v6.6.74: Show community gallery button click
            $(document).on('click', '.cc5-show-community-btn', function (e) {
                e.preventDefault();
                e.stopPropagation();
                var sectionId = $(this).attr('data-section-id');
                self.showCommunityGalleryModal(sectionId);
            });
            
            // v6.6.74: Community gallery item click - use image
            $(document).on('click', '.cc5-community-item', function (e) {
                e.preventDefault();
                e.stopPropagation();
                var $item = $(this);
                var imageId = $item.data('image-id');
                var sectionId = $item.data('section-id');
                self.useCommunityImage(sectionId, imageId);
            });
            
            // v6.6.74: Community gallery search
            $(document).on('click', '.cc5-community-search-btn', function (e) {
                e.preventDefault();
                var $input = $('.cc5-community-search-input');
                var search = $input.val() || '';
                var sectionId = $input.data('section-id');
                $('.cc5-community-loading').show();
                self.browseCommunityGallery(sectionId, search, 0);
            });
            
            // v6.6.74: Community gallery search on enter key
            $(document).on('keypress', '.cc5-community-search-input', function (e) {
                if (e.which === 13) {
                    e.preventDefault();
                    var search = $(this).val() || '';
                    var sectionId = $(this).attr('data-section-id');
                    $('.cc5-community-loading').show();
                    self.browseCommunityGallery(sectionId, search, 0);
                }
            });
            
            // v6.6.74: Community gallery pagination
            $(document).on('click', '.cc5-community-page-btn', function (e) {
                e.preventDefault();
                var offset = parseInt($(this).data('offset'), 10);
                var search = $('.cc5-community-search-input').val() || '';
                var sectionId = $('.cc5-community-grid').data('section-id');
                $('.cc5-community-loading').show();
                self.browseCommunityGallery(sectionId, search, offset);
            });
            
            
            // FIX-CC-DOCLINK-DOUBLE-HANDLER (v13.95.1): a second delegated 'click .cc5-doc-link'
            // handler used to live here - the v7.6.1 placeholder popup ("In a real workplace you
            // would locate this document..."). It was superseded by showDocumentModal() below,
            // but never removed, and both were bound on this.container for the same selector.
            // e.stopPropagation() does not suppress a sibling handler on the SAME element (that
            // needs stopImmediatePropagation), so every document link opened the placeholder AND
            // the real modal. It also interpolated docName into HTML unescaped. Removed.

            // Touch gestures for mobile - swipe left/right
            
            var touchStartX = 0;
            this.container.on('touchstart', '.cc5-slide-content', function (e) {
                touchStartX = e.originalEvent.touches[0].clientX;
            });
            
            this.container.on('touchend', '.cc5-slide-content', function (e) {
                var touchEndX = e.originalEvent.changedTouches[0].clientX;
                var diff = touchStartX - touchEndX;
                
                if (Math.abs(diff) > 50) { // Minimum swipe distance
                    if (diff > 0 && self.canNavigateNext(self.getCurrentSections()[self.currentSlideIndex])) {
                        // Swipe left - next slide
                        self.container.find('.cc5-nav-chevron.cc5-next').click();
                    } else if (diff < 0 && self.currentSlideIndex > 0) {
                        // Swipe right - previous slide
                        self.container.find('.cc5-nav-chevron.cc5-prev').click();
                    }
                }
            });
            
            // Edit slide button click (v6.5.0)
            // v6.6.43: Enhanced logging to diagnose click handler issues
            this.container.on('click', '.cc5-edit-slide-btn', function (e) {
                e.preventDefault();
                e.stopPropagation();
                var topicId = $(this).data('topic-id');
                var sectionId = $(this).attr('data-section-id');
                
                // Visual feedback to confirm click registered
                $(this).css('opacity', '0.5');
                setTimeout(function () {
                    $(this).css('opacity', '1');
                }.bind(this), 200);
                
                self.showEditModal(topicId, sectionId);
            });
            
            // Edit modal close button
            $(document).on('click', '.cc5-edit-modal-close', function (e) {
                e.preventDefault();
                e.stopPropagation();
                $('.cc5-edit-modal-overlay').remove();
            });
            
            // Click on overlay background to close
            $(document).on('click', '.cc5-edit-modal-overlay', function (e) {
                if ($(e.target).hasClass('cc5-edit-modal-overlay')) {
                    $('.cc5-edit-modal-overlay').remove();
                }
            });
            
            // Edit modal save button
            $(document).on('click', '.cc5-edit-modal-save', function (e) {
                e.preventDefault();
                e.stopPropagation();
                if (typeof self.saveSlideEdit !== 'function') {
                    return;
                }
                self.saveSlideEdit();
            });

            // -- Icon picker (v11.90) ------------------------------------------

            // Open icon picker overlay when "Browse" button is clicked
            $(document).on('click', '.cc5-icon-picker-btn', function (e) {
                e.preventDefault();
                e.stopPropagation();
                var wrap = $(this).closest('.cc5-icon-picker-wrap');
                var input = wrap.find('.cc5-ipi-input');
                $('#cc5-icon-picker-overlay').remove();
                var overlay = $(self.buildIconPickerOverlay());
                $('body').append(overlay);
                // Highlight currently selected icon
                var currentVal = input.val().trim();
                if (currentVal) {
                    overlay.find('.cc5-icon-picker-item[data-icon="' + currentVal + '"]').addClass('cc5-ipi-selected');
                }
                overlay.data('targetInput', input);
                overlay.find('.cc5-icon-picker-search').focus();
            });

            // Select an icon from the grid
            $(document).on('click', '.cc5-icon-picker-item', function (e) {
                e.preventDefault();
                e.stopPropagation();
                var iconName = $(this).data('icon');
                var overlay = $('#cc5-icon-picker-overlay');
                var input = overlay.data('targetInput');
                if (input && input.length) {
                    input.val(iconName).trigger('change');
                    var preview = input.closest('.cc5-icon-picker-wrap').find('.cc5-ipi-preview');
                    preview.html(getIcon(iconName)).removeClass('cc5-ipi-empty');
                }
                overlay.remove();
            });

            // Close picker via X button
            $(document).on('click', '.cc5-icon-picker-close', function (e) {
                e.preventDefault();
                e.stopPropagation();
                $('#cc5-icon-picker-overlay').remove();
            });

            // Close picker by clicking the backdrop
            $(document).on('click', '#cc5-icon-picker-overlay', function (e) {
                if ($(e.target).is('#cc5-icon-picker-overlay')) {
                    $(this).remove();
                }
            });

            // Filter icons by search query
            $(document).on('input', '.cc5-icon-picker-search', function () {
                var q = $(this).val().toLowerCase().trim();
                $(this).closest('.cc5-icon-picker-popup').find('.cc5-icon-picker-item').each(function () {
                    var name = String($(this).data('icon'));
                    $(this).toggle(!q || name.indexOf(q) !== -1);
                });
            });

            // Live preview while typing an icon name manually into the input
            $(document).on('input', '.cc5-ipi-input', function () {
                var val = $(this).val().trim();
                var preview = $(this).closest('.cc5-icon-picker-wrap').find('.cc5-ipi-preview');
                if (val && CcIcons.hasIcon(val)) {
                    preview.html(getIcon(val)).removeClass('cc5-ipi-empty');
                } else {
                    preview.html('').addClass('cc5-ipi-empty');
                }
            });
            
            // Edit modal add requirement
            $(document).on('click', '.cc5-edit-add-requirement', function (e) {
                e.preventDefault();
                var list = $('.cc5-edit-requirements-list');
                var idx = list.find('.cc5-edit-list-item').length;
                var newItem = self.renderEditListItem('requirement', idx, { icon: 'check-circle', text: '' });
                list.append(newItem);
            });
            
            // Edit modal add do item
            $(document).on('click', '.cc5-edit-add-do', function (e) {
                e.preventDefault();
                var list = $('.cc5-edit-do-list');
                var currentCount = list.find('.cc5-edit-list-item').length;
                var newItem = self.renderEditListItem('do', currentCount, '');
                list.append(newItem);
            });
            
            // Edit modal add dont item
            $(document).on('click', '.cc5-edit-add-dont', function (e) {
                e.preventDefault();
                var list = $('.cc5-edit-dont-list');
                var currentCount = list.find('.cc5-edit-list-item').length;
                var newItem = self.renderEditListItem('dont', currentCount, '');
                list.append(newItem);
            });
            
            
            // ===================================================================
            // v7.9.3: 5-CARD MODEL EDIT HANDLERS
            // ===================================================================
            
            // Add terminology term (Knowledge card only)
            $(document).on('click', '.cc5-edit-add-term', function (e) {
                e.preventDefault();
                var list = $('.cc5-edit-knowledge-terminology');
                var idx = list.find('.cc5-edit-term-item').length;
                var newItem = '<div class="cc5-edit-term-item" data-idx="' + idx + '">';
                newItem += '<input type="text" class="cc5-edit-term-name" placeholder="' + getLabel('term') + '" value="">';
                newItem += '<input type="text" class="cc5-edit-term-definition" placeholder="' + getLabel('definition') + '" value="">';
                newItem += '<button type="button" class="cc5-edit-remove-term" title="' + getLabel('remove') + '">' + getIcon('x') + '</button>';
                newItem += '</div>';
                list.append(newItem);
            });
            
            // Remove terminology term
            $(document).on('click', '.cc5-edit-remove-term', function (e) {
                e.preventDefault();
                $(this).closest('.cc5-edit-term-item').remove();
            });

            // ===================================================================
            // v13.22: CARD REORDER / DELETE HANDLERS
            // Up/Down arrows reorder cards within the edit modal. Delete removes
            // a card entirely. All three prevent details toggle via stopPropagation.
            // On save, cards are sent in the new DOM order as full card objects.
            // Voiceover is automatically regenerated (5 credits) when cards change.
            // ===================================================================
            function _renumberCardButtons($container) {
                var $blocks = $container.find('.cc5-edit-card-block');
                var total = $blocks.length;
                $blocks.each(function (newPos) {
                    var $up = $(this).find('.cc5-edit-card-move-up');
                    var $dn = $(this).find('.cc5-edit-card-move-down');
                    var isFirst = (newPos === 0);
                    var isLast  = (newPos === total - 1);
                    $up.prop('disabled', isFirst)
                       .css({ opacity: isFirst ? '0.3' : '1', cursor: isFirst ? 'default' : 'pointer' });
                    $dn.prop('disabled', isLast)
                       .css({ opacity: isLast  ? '0.3' : '1', cursor: isLast  ? 'default' : 'pointer' });
                });
            }

            $(document).on('click', '.cc5-edit-card-move-up', function (e) {
                e.preventDefault();
                e.stopPropagation();
                var $blk = $(this).closest('.cc5-edit-card-block');
                var $prev = $blk.prev('.cc5-edit-card-block');
                if (!$prev.length) return;
                $prev.before($blk);
                _renumberCardButtons($blk.closest('.cc5-edit-modal-body, .cc5-edit-modal'));
            });

            $(document).on('click', '.cc5-edit-card-move-down', function (e) {
                e.preventDefault();
                e.stopPropagation();
                var $blk = $(this).closest('.cc5-edit-card-block');
                var $next = $blk.next('.cc5-edit-card-block');
                if (!$next.length) return;
                $next.after($blk);
                _renumberCardButtons($blk.closest('.cc5-edit-modal-body, .cc5-edit-modal'));
            });

            $(document).on('click', '.cc5-edit-card-delete', function (e) {
                e.preventDefault();
                e.stopPropagation();
                var $blk = $(this).closest('.cc5-edit-card-block');
                var cardLabel = $blk.find('summary span:first').text().trim();
                Notification.saveCancelPromise(
                    'Remove card',
                    'Remove "' + cardLabel + '" from this slide? This takes effect when you click ' +
                        'Save. Close without saving to cancel.',
                    'Remove'
                ).then(function () {
                    var $container = $blk.closest('.cc5-edit-modal-body, .cc5-edit-modal');
                    $blk.remove();
                    _renumberCardButtons($container);
                    return null;
                }).catch(function () {
                    // User cancelled  -  the card stays.
                    return null;
                });
            });
            // ===================================================================
            // END v13.22 CARD REORDER / DELETE HANDLERS
            // ===================================================================

            // Add decision option
            $(document).on('click', '.cc5-edit-add-option', function (e) {
                e.preventDefault();
                var list = $('.cc5-edit-decision-options');
                var idx = list.find('.cc5-edit-option-item').length;
                var newItem = '<div class="cc5-edit-option-item" data-idx="' + idx + '">';
                newItem += '<div class="cc5-edit-option-header">';
                newItem += '<label class="cc5-edit-correct-checkbox"><input type="radio" name="cc5-correct-option" value="' + idx + '"> ' + getLabel('correct') + '</label>';
                newItem += '<button type="button" class="cc5-edit-remove-option" title="' + getLabel('remove') + '">' + getIcon('x') + '</button>';
                newItem += '</div>';
                newItem += '<input type="text" class="cc5-edit-option-text" placeholder="' + getLabel('optionText') + '" value="">';
                newItem += '<input type="text" class="cc5-edit-option-feedback" placeholder="' + getLabel('feedbackWhenSelected') + '" value="">';
                newItem += '</div>';
                list.append(newItem);
            });
            
            // Remove decision option
            $(document).on('click', '.cc5-edit-remove-option', function (e) {
                e.preventDefault();
                $(this).closest('.cc5-edit-option-item').remove();
            });
            
            // Add checklist item
            $(document).on('click', '.cc5-edit-add-checklist', function (e) {
                e.preventDefault();
                var list = $('.cc5-edit-checklist-list');
                var idx = list.find('.cc5-edit-checklist-item').length;
                var newItem = '<div class="cc5-edit-checklist-item" data-idx="' + idx + '">';
                newItem += '<input type="text" class="cc5-edit-checklist-text" placeholder="' + getLabel('checklistItem') + '" value="">';
                newItem += '<button type="button" class="cc5-edit-remove-checklist" title="' + getLabel('remove') + '">' + getIcon('x') + '</button>';
                newItem += '</div>';
                list.append(newItem);
            });
            
            // Remove checklist item
            $(document).on('click', '.cc5-edit-remove-checklist', function (e) {
                e.preventDefault();
                $(this).closest('.cc5-edit-checklist-item').remove();
            });
            
            // v7.9.4: Add Quick-Check terminology
            $(document).on('click', '.cc5-edit-add-qc-term', function (e) {
                e.preventDefault();
                var list = $('.cc5-edit-qc-terminology');
                var idx = list.find('.cc5-edit-term-item').length;
                var newItem = '<div class="cc5-edit-term-item" data-idx="' + idx + '">';
                newItem += '<input type="text" class="cc5-edit-qc-term" placeholder="' + getLabel('term') + '" value="">';
                newItem += '<input type="text" class="cc5-edit-qc-definition" placeholder="' + getLabel('definition') + '" value="">';
                newItem += '<button type="button" class="cc5-edit-remove-term cc5-edit-remove-qc-term" title="' + getLabel('remove') + '">' + getIcon('x') + '</button>';
                newItem += '</div>';
                list.append(newItem);
            });
            
            // v7.9.4: Remove Quick-Check terminology
            $(document).on('click', '.cc5-edit-remove-qc-term', function (e) {
                e.preventDefault();
                e.stopPropagation();
                $(this).closest('.cc5-edit-term-item').remove();
            });
            
            // -- v10.27: Add / Remove handlers for unified 7-card editors -----

            // mental-model add step
            $(document).on('click', '.cc5-edit-add-mm-step', function (e) {
                e.preventDefault();
                var list = $(this).siblings('.cc5-edit-mm-steps-list');
                var idx  = list.find('.cc5-edit-mm-step-item').length;
                var row  = '<div class="cc5-edit-mm-step-item" data-idx="' + idx + '" style="border:1px solid var(--border);border-radius:6px;padding:8px;margin-bottom:8px;">';
                // v10.49: include icon field in new step rows
                row += '<div style="display:flex;gap:8px;margin-bottom:4px;">';
                row += self.renderIconPickerInput('', 'cc5-edit-mm-step-icon', 'Icon (e.g. check)');
                row += '<input type="text" class="cc5-edit-mm-step-title" placeholder="' + getLabel('stepTitle') + '" value="" style="flex:1;">';
                row += '</div>';
                row += '<textarea class="cc5-edit-mm-step-detail" rows="2" placeholder="' + getLabel('stepDetail') + '"></textarea>';
                row += '<button type="button" class="cc5-edit-remove-mm-step" title="' + getLabel('remove') + '">' + getIcon('x') + ' Remove</button>';
                row += '</div>';
                list.append(row);
            });
            $(document).on('click', '.cc5-edit-remove-mm-step', function (e) {
                e.preventDefault(); e.stopPropagation();
                $(this).closest('.cc5-edit-mm-step-item').remove();
            });

            // decision-point add option
            $(document).on('click', '.cc5-edit-add-dp-option', function (e) {
                e.preventDefault();
                var list = $(this).siblings('.cc5-edit-dp-options-list');
                var idx  = list.find('.cc5-edit-dp-option-item').length;
                var letters = ['A','B','C','D','E','F'];
                var row  = '<div class="cc5-edit-dp-option-item" data-idx="' + idx + '" style="border:1px solid var(--border);border-radius:6px;padding:8px;margin-bottom:8px;">';
                row += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">';
                row += '<strong style="min-width:16px;">' + (letters[idx] || (idx + 1)) + '</strong>';
                row += '<input type="checkbox" class="cc5-edit-dp-correct" title="' + getLabel('markAsCorrect') + '">';
                row += '<label style="font-size:0.8rem;margin:0;">' + getLabel('correctAnswerLabel') + '</label>';
                row += '</div>';
                row += '<input type="text" class="cc5-edit-dp-option-text" placeholder="' + getLabel('optionText') + '" value="" style="margin-bottom:4px;">';
                row += '<textarea class="cc5-edit-dp-feedback" rows="2" placeholder="' + getLabel('feedbackForThisOption') + '"></textarea>';
                row += '<button type="button" class="cc5-edit-remove-dp-option" title="' + getLabel('remove') + '">' + getIcon('x') + ' Remove</button>';
                row += '</div>';
                list.append(row);
            });
            $(document).on('click', '.cc5-edit-remove-dp-option', function (e) {
                e.preventDefault(); e.stopPropagation();
                $(this).closest('.cc5-edit-dp-option-item').remove();
            });

            // mistakes add item
            $(document).on('click', '.cc5-edit-add-mistake', function (e) {
                e.preventDefault();
                var list = $(this).siblings('.cc5-edit-mistakes-list');
                var idx  = list.find('.cc5-edit-mistake-item').length;
                var row  = '<div class="cc5-edit-mistake-item" data-idx="' + idx + '" style="border:1px solid var(--border);border-radius:6px;padding:8px;margin-bottom:8px;">';
                row += '<input type="text" class="cc5-edit-mistake-text" placeholder="' + getLabel('mistake') + '" value="" style="margin-bottom:4px;">';
                row += '<textarea class="cc5-edit-mistake-consequence" rows="3" placeholder="' + getLabel('consequence') + '"></textarea>';
                row += self.renderIconPickerInput('', 'cc5-edit-mistake-icon', 'Icon (e.g. alert-triangle)');
                row += '<button type="button" class="cc5-edit-remove-mistake" title="' + getLabel('remove') + '">' + getIcon('x') + ' Remove</button>';
                row += '</div>';
                list.append(row);
            });
            $(document).on('click', '.cc5-edit-remove-mistake', function (e) {
                e.preventDefault(); e.stopPropagation();
                $(this).closest('.cc5-edit-mistake-item').remove();
            });

            // competency-summary good/bad items add/remove  [v10.39]
            $(document).on('click', '.cc5-edit-add-good-item', function (e) {
                e.preventDefault();
                var list = $(this).siblings('.cc5-edit-good-items-list');
                var idx  = list.find('.cc5-edit-good-item').length;
                var row  = '<div class="cc5-edit-good-item" data-idx="' + idx + '">';
                row += '<input type="text" class="cc5-edit-good-item-text" value="">';
                row += '<button type="button" class="cc5-edit-remove-good-item" title="' + getLabel('remove') + '">' + getIcon('x') + '</button>';
                row += '</div>';
                list.append(row);
            });
            $(document).on('click', '.cc5-edit-remove-good-item', function (e) {
                e.preventDefault(); e.stopPropagation();
                $(this).closest('.cc5-edit-good-item').remove();
            });
            $(document).on('click', '.cc5-edit-add-bad-item', function (e) {
                e.preventDefault();
                var list = $(this).siblings('.cc5-edit-bad-items-list');
                // v13.90.1 FIX-BADITEM-IDX-COLLISION: this used the row COUNT as the new
                // index, which collides after a delete. Three rows (idx 0,1,2), delete the
                // middle one, and the two survivors keep idx 0 and 2 - then a new row also
                // takes idx 2. On save both map to _priorBad[2], so the brand-new item
                // silently inherits the other item's consequence and the learner reads a
                // "what to avoid" bullet explained by an unrelated mistake.
                // A fresh row has no prior consequence by definition, so give it an index
                // that cannot match any existing one.
                var idx = -1;
                list.find('.cc5-edit-bad-item').each(function () {
                    var v = parseInt($(this).data('idx'), 10);
                    if (!isNaN(v) && v > idx) { idx = v; }
                });
                idx = idx + 1;
                var row  = '<div class="cc5-edit-bad-item" data-idx="' + idx + '">';
                row += '<input type="text" class="cc5-edit-bad-item-text" value="">';
                row += '<button type="button" class="cc5-edit-remove-bad-item" title="' + getLabel('remove') + '">' + getIcon('x') + '</button>';
                row += '</div>';
                list.append(row);
            });
            $(document).on('click', '.cc5-edit-remove-bad-item', function (e) {
                e.preventDefault(); e.stopPropagation();
                $(this).closest('.cc5-edit-bad-item').remove();
            });

            // hook-scenario / applied-scenario: add/remove story beat rows  [v10.40]
            $(document).on('click', '.cc5-edit-add-beat', function (e) {
                e.preventDefault();
                var list = $(this).siblings('.cc5-edit-beats-list');
                var idx  = list.find('.cc5-edit-beat-item').length;
                var row  = '<div class="cc5-edit-beat-item" data-idx="' + idx + '" style="display:flex;align-items:flex-start;gap:8px;margin-bottom:8px;">';
                row += '<span style="min-width:22px;height:22px;border-radius:50%;background:var(--cc5-accent,#6366f1);color:#fff;font-size:0.75rem;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:8px;">' + (idx + 1) + '</span>';
                row += '<textarea class="cc5-edit-beat-text" rows="2" style="flex:1;" placeholder="' + getLabel('enterSentence') + '"></textarea>';
                row += '<button type="button" class="cc5-edit-remove-beat" title="' + getLabel('removeBeat') + '" style="flex-shrink:0;margin-top:4px;">' + getIcon('x') + '</button>';
                row += '</div>';
                list.append(row);
            });
            $(document).on('click', '.cc5-edit-remove-beat', function (e) {
                e.preventDefault(); e.stopPropagation();
                $(this).closest('.cc5-edit-beat-item').remove();
            });

            // concept-explainer: add/remove insight chip rows  [v10.40]
            $(document).on('click', '.cc5-edit-add-insight', function (e) {
                e.preventDefault();
                var list = $(this).siblings('.cc5-edit-insights-list');
                var idx  = list.find('.cc5-edit-insight-item').length;
                var row  = '<div class="cc5-edit-insight-item" data-idx="' + idx + '" style="display:flex;align-items:flex-start;gap:8px;margin-bottom:8px;">';
                row += '<span style="min-width:22px;height:22px;border-radius:50%;background:hsl(217deg 80% 55%);color:#fff;font-size:0.75rem;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:8px;">' + (idx + 1) + '</span>';
                row += '<textarea class="cc5-edit-insight-text" rows="2" style="flex:1;" placeholder="' + getLabel('enterInsightSentence') + '"></textarea>';
                row += '<button type="button" class="cc5-edit-remove-insight" title="' + getLabel('removeInsight') + '" style="flex-shrink:0;margin-top:4px;">' + getIcon('x') + '</button>';
                row += '</div>';
                list.append(row);
            });
            $(document).on('click', '.cc5-edit-remove-insight', function (e) {
                e.preventDefault(); e.stopPropagation();
                $(this).closest('.cc5-edit-insight-item').remove();
            });

            // concept-explainer: add/remove conceptItem (detail card) rows  [v10.40]
            $(document).on('click', '.cc5-edit-add-concept-item', function (e) {
                e.preventDefault();
                var list = $(this).siblings('.cc5-edit-concept-items-list');
                var idx  = list.find('.cc5-edit-concept-item').length;
                var row  = '<div class="cc5-edit-concept-item" data-idx="' + idx + '" style="border:1px solid var(--border);border-radius:6px;padding:8px;margin-bottom:8px;">';
                row += '<div style="display:flex;gap:8px;margin-bottom:4px;">';
                row += self.renderIconPickerInput('', 'cc5-edit-ci-icon', 'Icon name');
                row += '<input type="text" class="cc5-edit-ci-title" placeholder="' + getLabel('cardTitle') + '" value="" style="flex:1;">';
                row += '</div>';
                row += '<textarea class="cc5-edit-ci-description" rows="2" placeholder="' + getLabel('cardDescription') + '"></textarea>';
                row += '<button type="button" class="cc5-edit-remove-concept-item" title="' + getLabel('removeCard') + '" style="margin-top:4px;">' + getIcon('x') + ' Remove</button>';
                row += '</div>';
                list.append(row);
            });
            $(document).on('click', '.cc5-edit-remove-concept-item', function (e) {
                e.preventDefault(); e.stopPropagation();
                $(this).closest('.cc5-edit-concept-item').remove();
            });

            // hook-scenario / applied-scenario: add/remove sceneParts[] rows  [v10.47]
            $(document).on('click', '.cc5-edit-add-scene-part', function (e) {
                e.preventDefault();
                var list = $(this).siblings('.cc5-edit-scene-parts-list');
                var idx  = list.find('.cc5-edit-scene-part-item').length;
                var row  = '<div class="cc5-edit-scene-part-item" data-idx="' + idx + '" style="border:1px solid var(--border);border-radius:6px;padding:8px;margin-bottom:8px;">';
                row += '<div style="display:flex;gap:8px;margin-bottom:4px;">';
                row += self.renderIconPickerInput('', 'cc5-edit-sp-icon', 'Icon (e.g. map-pin)');
                row += '<input type="text" class="cc5-edit-sp-title" placeholder="' + getLabel('partTitle') + '" value="" style="flex:1;">';
                row += '</div>';
                row += '<textarea class="cc5-edit-sp-text" rows="4" placeholder="' + getLabel('sceneText') + '"></textarea>';
                row += '<button type="button" class="cc5-edit-remove-scene-part" title="' + getLabel('remove') + '">' + getIcon('x') + ' Remove</button>';
                row += '</div>';
                list.append(row);
            });
            $(document).on('click', '.cc5-edit-remove-scene-part', function (e) {
                e.preventDefault(); e.stopPropagation();
                $(this).closest('.cc5-edit-scene-part-item').remove();
            });

            // concept-explainer: add/remove conceptInsights[] rows  [v10.47]
            $(document).on('click', '.cc5-edit-add-concept-insight', function (e) {
                e.preventDefault();
                var list = $(this).siblings('.cc5-edit-concept-insights-list');
                var idx  = list.find('.cc5-edit-concept-insight-item').length;
                var row  = '<div class="cc5-edit-concept-insight-item" data-idx="' + idx + '" style="border:1px solid var(--border);border-radius:6px;padding:8px;margin-bottom:8px;">';
                row += '<div style="display:flex;gap:8px;margin-bottom:4px;">';
                row += self.renderIconPickerInput('', 'cc5-edit-cins-icon', 'Icon (e.g. lightbulb)');
                row += '<input type="text" class="cc5-edit-cins-title" placeholder="' + getLabel('insightTitle') + '" value="" style="flex:1;">';
                row += '</div>';
                row += '<textarea class="cc5-edit-cins-text" rows="3" placeholder="' + getLabel('insightText') + '"></textarea>';
                row += '<button type="button" class="cc5-edit-remove-concept-insight" title="' + getLabel('remove') + '">' + getIcon('x') + ' Remove</button>';
                row += '</div>';
                list.append(row);
            });
            $(document).on('click', '.cc5-edit-remove-concept-insight', function (e) {
                e.preventDefault(); e.stopPropagation();
                $(this).closest('.cc5-edit-concept-insight-item').remove();
            });

            // -- end v10.27 add/remove handlers -------------------------------

            // -- v11.04: Add/Remove handlers for top-level card-type editors (v9.87) --
            // competence-standard
            $(document).on('click', '.cc5-edit-add-standard', function (e) {
                e.preventDefault();
                var list = $(this).siblings('.cc5-edit-standard-items');
                var idx = list.find('.cc5-edit-standard-item').length;
                var row = '<div class="cc5-edit-standard-item" data-idx="' + idx + '">';
                row += '<input type="text" class="cc5-edit-standard-text" value="">';
                row += '<button type="button" class="cc5-edit-remove-standard" title="' + getLabel('remove') + '">' + getIcon('x') + '</button>';
                row += '</div>';
                list.append(row);
            });
            $(document).on('click', '.cc5-edit-remove-standard', function (e) {
                e.preventDefault(); e.stopPropagation();
                $(this).closest('.cc5-edit-standard-item').remove();
            });
            // common-errors
            $(document).on('click', '.cc5-edit-add-error', function (e) {
                e.preventDefault();
                var list = $(this).siblings('.cc5-edit-error-items');
                var idx = list.find('.cc5-edit-error-item').length;
                var row = '<div class="cc5-edit-error-item" data-idx="' + idx + '">';
                row += '<input type="text" class="cc5-edit-error-text" placeholder="' + getLabel('error') + '" value="">';
                row += '<input type="text" class="cc5-edit-error-consequence" placeholder="' + getLabel('consequence') + '" value="">';
                row += '<button type="button" class="cc5-edit-remove-error" title="' + getLabel('remove') + '">' + getIcon('x') + '</button>';
                row += '</div>';
                list.append(row);
            });
            $(document).on('click', '.cc5-edit-remove-error', function (e) {
                e.preventDefault(); e.stopPropagation();
                $(this).closest('.cc5-edit-error-item').remove();
            });
            // action-breakdown
            $(document).on('click', '.cc5-edit-add-action', function (e) {
                e.preventDefault();
                var list = $(this).siblings('.cc5-edit-action-items');
                var idx = list.find('.cc5-edit-action-item').length;
                var row = '<div class="cc5-edit-action-item" data-idx="' + idx + '">';
                row += '<input type="text" class="cc5-edit-action-heading" placeholder="' + getLabel('actionHeading') + '" value="">';
                row += '<textarea class="cc5-edit-action-bullets" placeholder="' + getLabel('bulletsOnePerLine') + '" rows="3"></textarea>';
                row += '<button type="button" class="cc5-edit-remove-action" title="' + getLabel('remove') + '">' + getIcon('x') + '</button>';
                row += '</div>';
                list.append(row);
            });
            $(document).on('click', '.cc5-edit-remove-action', function (e) {
                e.preventDefault(); e.stopPropagation();
                $(this).closest('.cc5-edit-action-item').remove();
            });
            // performance-anchor  -  no list items, only text fields
            // plain-english
            $(document).on('click', '.cc5-edit-add-keypoint', function (e) {
                e.preventDefault();
                var list = $(this).siblings('.cc5-edit-keypoints-list');
                var idx = list.find('.cc5-edit-keypoint-item').length;
                var row = '<div class="cc5-edit-keypoint-item" data-idx="' + idx + '">';
                row += '<input type="text" class="cc5-edit-keypoint-text" value="">';
                row += '<button type="button" class="cc5-edit-remove-keypoint" title="' + getLabel('remove') + '">' + getIcon('x') + '</button>';
                row += '</div>';
                list.append(row);
            });
            $(document).on('click', '.cc5-edit-remove-keypoint', function (e) {
                e.preventDefault(); e.stopPropagation();
                $(this).closest('.cc5-edit-keypoint-item').remove();
            });
            // concept-anchor keyTerms
            $(document).on('click', '.cc5-edit-add-cardterm', function (e) {
                e.preventDefault();
                var list = $(this).siblings('.cc5-edit-card-keyterms-list');
                var idx = list.find('.cc5-edit-card-keyterm-item').length;
                var row = '<div class="cc5-edit-card-keyterm-item" data-idx="' + idx + '">';
                row += '<input type="text" class="cc5-edit-cardterm-name" placeholder="' + getLabel('term') + '" value="">';
                row += '<input type="text" class="cc5-edit-cardterm-def" placeholder="' + getLabel('definition') + '" value="">';
                row += '<button type="button" class="cc5-edit-remove-cardterm" title="' + getLabel('remove') + '">' + getIcon('x') + '</button>';
                row += '</div>';
                list.append(row);
            });
            $(document).on('click', '.cc5-edit-remove-cardterm', function (e) {
                e.preventDefault(); e.stopPropagation();
                $(this).closest('.cc5-edit-card-keyterm-item').remove();
            });
            // v13.92: Topics-and-Text prose card rows.
            $(document).on('click', '.cc5-edit-add-prose-para', function (e) {
                e.preventDefault();
                var list = $(this).siblings('.cc5-edit-prose-paras');
                var idx = list.find('.cc5-edit-prose-para').length;
                list.append('<textarea class="cc5-edit-prose-para" rows="5" data-idx="' + idx +
                    '" placeholder="' + getLabel('paragraph') + ' ' + (idx + 1) + '" style="margin-bottom:8px;"></textarea>');
            });
            $(document).on('click', '.cc5-edit-add-prose-term', function (e) {
                e.preventDefault();
                var list = $(this).siblings('.cc5-edit-prose-terms-list');
                var idx = list.find('.cc5-edit-prose-term-item').length;
                var row = '<div class="cc5-edit-prose-term-item" data-idx="' + idx + '">';
                row += '<input type="text" class="cc5-edit-prose-term-name" placeholder="' + getLabel('term') + '" value="">';
                row += '<input type="text" class="cc5-edit-prose-term-def" placeholder="' + getLabel('definition') + '" value="">';
                row += '<button type="button" class="cc5-edit-remove-prose-term" title="' + getLabel('remove') + '">' + getIcon('x') + '</button>';
                row += '</div>';
                list.append(row);
            });
            $(document).on('click', '.cc5-edit-remove-prose-term', function (e) {
                e.preventDefault(); e.stopPropagation();
                $(this).closest('.cc5-edit-prose-term-item').remove();
            });
            ['good', 'bad'].forEach(function (kind) {
                $(document).on('click', '.cc5-edit-add-prose-' + kind, function (e) {
                    e.preventDefault();
                    var list = $(this).siblings('.cc5-edit-prose-' + kind + '-list');
                    var idx = list.find('.cc5-edit-prose-' + kind + '-item').length;
                    var row = '<div class="cc5-edit-prose-' + kind + '-item" data-idx="' + idx + '">';
                    row += '<input type="text" class="cc5-edit-prose-' + kind + '-text" placeholder="' + getLabel('statement') + '" value="">';
                    row += '<button type="button" class="cc5-edit-remove-prose-item" title="' + getLabel('remove') + '">' + getIcon('x') + '</button>';
                    row += '</div>';
                    list.append(row);
                });
            });
            $(document).on('click', '.cc5-edit-remove-prose-item', function (e) {
                e.preventDefault(); e.stopPropagation();
                $(this).closest('[class*="cc5-edit-prose-"]').remove();
            });

            // theoretical-framework
            $(document).on('click', '.cc5-edit-add-framework', function (e) {
                e.preventDefault();
                var list = $(this).siblings('.cc5-edit-frameworks-list');
                var idx = list.find('.cc5-edit-framework-item').length;
                var row = '<div class="cc5-edit-framework-item" data-idx="' + idx + '" style="border:1px solid var(--border);border-radius:6px;padding:8px;margin-bottom:8px;">';
                row += '<input type="text" class="cc5-edit-fw-name" placeholder="' + getLabel('frameworkName') + '" value="" style="margin-bottom:4px;">';
                row += '<input type="text" class="cc5-edit-fw-originator" placeholder="' + getLabel('originator') + '" value="" style="margin-bottom:4px;">';
                row += '<textarea class="cc5-edit-fw-principle" rows="2" placeholder="' + getLabel('principle') + '"></textarea>';
                row += '<input type="text" class="cc5-edit-fw-application" placeholder="' + getLabel('application') + '" value="" style="margin-bottom:4px;">';
                row += '<input type="text" class="cc5-edit-fw-limitation" placeholder="' + getLabel('limitation') + '" value="" style="margin-bottom:4px;">';
                row += '<button type="button" class="cc5-edit-remove-framework" title="' + getLabel('remove') + '">' + getIcon('x') + ' Remove</button>';
                row += '</div>';
                list.append(row);
            });
            $(document).on('click', '.cc5-edit-remove-framework', function (e) {
                e.preventDefault(); e.stopPropagation();
                $(this).closest('.cc5-edit-framework-item').remove();
            });
            // analytical-lens: cognitiveConsiderations
            $(document).on('click', '.cc5-edit-add-cogconsideration', function (e) {
                e.preventDefault();
                var list = $(this).siblings('.cc5-edit-cogconsiderations-list');
                var idx = list.find('.cc5-edit-cogconsideration-item').length;
                var row = '<div class="cc5-edit-cogconsideration-item" data-idx="' + idx + '">';
                row += '<input type="text" class="cc5-edit-cogconsideration-text" value="">';
                row += '<button type="button" class="cc5-edit-remove-cogconsideration" title="' + getLabel('remove') + '">' + getIcon('x') + '</button>';
                row += '</div>';
                list.append(row);
            });
            $(document).on('click', '.cc5-edit-remove-cogconsideration', function (e) {
                e.preventDefault(); e.stopPropagation();
                $(this).closest('.cc5-edit-cogconsideration-item').remove();
            });
            // analytical-lens: analysisPrompts
            $(document).on('click', '.cc5-edit-add-analysisprompt', function (e) {
                e.preventDefault();
                var list = $(this).siblings('.cc5-edit-analysisprompts-list');
                var idx = list.find('.cc5-edit-analysisprompt-item').length;
                var row = '<div class="cc5-edit-analysisprompt-item" data-idx="' + idx + '">';
                row += '<input type="text" class="cc5-edit-analysisprompt-text" value="">';
                row += '<button type="button" class="cc5-edit-remove-analysisprompt" title="' + getLabel('remove') + '">' + getIcon('x') + '</button>';
                row += '</div>';
                list.append(row);
            });
            $(document).on('click', '.cc5-edit-remove-analysisprompt', function (e) {
                e.preventDefault(); e.stopPropagation();
                $(this).closest('.cc5-edit-analysisprompt-item').remove();
            });
            // ethics-considerations
            $(document).on('click', '.cc5-edit-add-ethicsconsideration', function (e) {
                e.preventDefault();
                var list = $(this).siblings('.cc5-edit-ethicsconsiderations-list');
                var idx = list.find('.cc5-edit-ethicsconsideration-item').length;
                var row = '<div class="cc5-edit-ethicsconsideration-item" data-idx="' + idx + '" style="border:1px solid var(--border);border-radius:6px;padding:8px;margin-bottom:8px;">';
                row += '<input type="text" class="cc5-edit-ethicsdim-text" placeholder="' + getLabel('dimensionExample') + '" value="" style="margin-bottom:4px;">';
                row += '<textarea class="cc5-edit-ethicsdesc-text" rows="2" placeholder="' + getLabel('description') + '"></textarea>';
                row += '<button type="button" class="cc5-edit-remove-ethicsconsideration" title="' + getLabel('remove') + '">' + getIcon('x') + ' Remove</button>';
                row += '</div>';
                list.append(row);
            });
            $(document).on('click', '.cc5-edit-remove-ethicsconsideration', function (e) {
                e.preventDefault(); e.stopPropagation();
                $(this).closest('.cc5-edit-ethicsconsideration-item').remove();
            });
            // case-study-1/2: analysisPrompts
            $(document).on('click', '.cc5-edit-add-casestudyprompt', function (e) {
                e.preventDefault();
                var list = $(this).siblings('.cc5-edit-casestudyprompts-list');
                var idx = list.find('.cc5-edit-casestudyprompt-item').length;
                var row = '<div class="cc5-edit-casestudyprompt-item" data-idx="' + idx + '">';
                row += '<input type="text" class="cc5-edit-casestudyprompt-text" value="">';
                row += '<button type="button" class="cc5-edit-remove-casestudyprompt" title="' + getLabel('remove') + '">' + getIcon('x') + '</button>';
                row += '</div>';
                list.append(row);
            });
            $(document).on('click', '.cc5-edit-remove-casestudyprompt', function (e) {
                e.preventDefault(); e.stopPropagation();
                $(this).closest('.cc5-edit-casestudyprompt-item').remove();
            });
            // business-impact: keyMetrics
            $(document).on('click', '.cc5-edit-add-keymetric', function (e) {
                e.preventDefault();
                var list = $(this).siblings('.cc5-edit-keymetrics-list');
                var idx = list.find('.cc5-edit-keymetric-item').length;
                var row = '<div class="cc5-edit-keymetric-item" data-idx="' + idx + '">';
                row += '<input type="text" class="cc5-edit-keymetric-text" value="">';
                row += '<button type="button" class="cc5-edit-remove-keymetric" title="' + getLabel('remove') + '">' + getIcon('x') + '</button>';
                row += '</div>';
                list.append(row);
            });
            $(document).on('click', '.cc5-edit-remove-keymetric', function (e) {
                e.preventDefault(); e.stopPropagation();
                $(this).closest('.cc5-edit-keymetric-item').remove();
            });
            // business-impact: consequences
            $(document).on('click', '.cc5-edit-add-consequence', function (e) {
                e.preventDefault();
                var list = $(this).siblings('.cc5-edit-consequences-list');
                var idx = list.find('.cc5-edit-consequence-item').length;
                var row = '<div class="cc5-edit-consequence-item" data-idx="' + idx + '">';
                row += '<input type="text" class="cc5-edit-consequence-text" value="">';
                row += '<button type="button" class="cc5-edit-remove-consequence" title="' + getLabel('remove') + '">' + getIcon('x') + '</button>';
                row += '</div>';
                list.append(row);
            });
            $(document).on('click', '.cc5-edit-remove-consequence', function (e) {
                e.preventDefault(); e.stopPropagation();
                $(this).closest('.cc5-edit-consequence-item').remove();
            });
            // action-framework: steps
            $(document).on('click', '.cc5-edit-add-actionstep', function (e) {
                e.preventDefault();
                var list = $(this).siblings('.cc5-edit-actionsteps-list');
                var idx = list.find('.cc5-edit-actionstep-item').length;
                var row = '<div class="cc5-edit-actionstep-item" data-idx="' + idx + '" style="border:1px solid var(--border);border-radius:6px;padding:8px;margin-bottom:8px;">';
                row += '<input type="text" class="cc5-edit-step-action" placeholder="' + getLabel('action') + '" value="" style="margin-bottom:4px;">';
                row += '<input type="text" class="cc5-edit-step-detail" placeholder="' + getLabel('detailOptional') + '" value="" style="margin-bottom:4px;">';
                row += '<input type="text" class="cc5-edit-step-timeframe" placeholder="' + getLabel('timeframeOptional') + '" value="" style="margin-bottom:4px;">';
                row += '<button type="button" class="cc5-edit-remove-actionstep" title="' + getLabel('remove') + '">' + getIcon('x') + ' Remove</button>';
                row += '</div>';
                list.append(row);
            });
            $(document).on('click', '.cc5-edit-remove-actionstep', function (e) {
                e.preventDefault(); e.stopPropagation();
                $(this).closest('.cc5-edit-actionstep-item').remove();
            });
            // risk-card
            $(document).on('click', '.cc5-edit-add-risk', function (e) {
                e.preventDefault();
                var list = $(this).siblings('.cc5-edit-risks-list');
                var idx = list.find('.cc5-edit-risk-item').length;
                var row = '<div class="cc5-edit-risk-item" data-idx="' + idx + '" style="border:1px solid var(--border);border-radius:6px;padding:8px;margin-bottom:8px;">';
                row += '<input type="text" class="cc5-edit-risk-text" placeholder="' + getLabel('risk') + '" value="" style="margin-bottom:4px;">';
                row += '<input type="text" class="cc5-edit-risk-likelihood" placeholder="' + getLabel('likelihoodExample') + '" value="" style="margin-bottom:4px;">';
                row += '<input type="text" class="cc5-edit-risk-impact" placeholder="' + getLabel('impactExample') + '" value="" style="margin-bottom:4px;">';
                row += '<input type="text" class="cc5-edit-risk-consequence" placeholder="' + getLabel('consequence') + '" value="" style="margin-bottom:4px;">';
                row += '<input type="text" class="cc5-edit-risk-mitigation" placeholder="' + getLabel('mitigationStrategy') + '" value="" style="margin-bottom:4px;">';
                row += '<button type="button" class="cc5-edit-remove-risk" title="' + getLabel('remove') + '">' + getIcon('x') + ' Remove</button>';
                row += '</div>';
                list.append(row);
            });
            $(document).on('click', '.cc5-edit-remove-risk', function (e) {
                e.preventDefault(); e.stopPropagation();
                $(this).closest('.cc5-edit-risk-item').remove();
            });
            // policy-alignment
            $(document).on('click', '.cc5-edit-add-policyitem', function (e) {
                e.preventDefault();
                var list = $(this).siblings('.cc5-edit-policyitems-list');
                var idx = list.find('.cc5-edit-policyitem-item').length;
                var row = '<div class="cc5-edit-policyitem-item" data-idx="' + idx + '" style="border:1px solid var(--border);border-radius:6px;padding:8px;margin-bottom:8px;">';
                row += '<textarea class="cc5-edit-policy-text" rows="2" placeholder="' + getLabel('policyStatement') + '"></textarea>';
                row += '<input type="text" class="cc5-edit-policy-requirement" placeholder="' + getLabel('requirement') + '" value="" style="margin-bottom:4px;">';
                row += '<input type="text" class="cc5-edit-policy-consequence" placeholder="' + getLabel('consequenceNonCompliance') + '" value="" style="margin-bottom:4px;">';
                row += '<button type="button" class="cc5-edit-remove-policyitem" title="' + getLabel('remove') + '">' + getIcon('x') + ' Remove</button>';
                row += '</div>';
                list.append(row);
            });
            $(document).on('click', '.cc5-edit-remove-policyitem', function (e) {
                e.preventDefault(); e.stopPropagation();
                $(this).closest('.cc5-edit-policyitem-item').remove();
            });
            // scenario-1/2: optimisationTips
            $(document).on('click', '.cc5-edit-add-opttip', function (e) {
                e.preventDefault();
                var list = $(this).siblings('.cc5-edit-opttips-list');
                var idx = list.find('.cc5-edit-opttip-item').length;
                var row = '<div class="cc5-edit-opttip-item" data-idx="' + idx + '">';
                row += '<input type="text" class="cc5-edit-opttip-text" value="">';
                row += '<button type="button" class="cc5-edit-remove-opttip" title="' + getLabel('remove') + '">' + getIcon('x') + '</button>';
                row += '</div>';
                list.append(row);
            });
            $(document).on('click', '.cc5-edit-remove-opttip', function (e) {
                e.preventDefault(); e.stopPropagation();
                $(this).closest('.cc5-edit-opttip-item').remove();
            });
            // skill-anchor: keyIndicators
            $(document).on('click', '.cc5-edit-add-keyindicator', function (e) {
                e.preventDefault();
                var list = $(this).siblings('.cc5-edit-keyindicators-list');
                var idx = list.find('.cc5-edit-keyindicator-item').length;
                var row = '<div class="cc5-edit-keyindicator-item" data-idx="' + idx + '">';
                row += '<input type="text" class="cc5-edit-keyindicator-text" value="">';
                row += '<button type="button" class="cc5-edit-remove-keyindicator" title="' + getLabel('remove') + '">' + getIcon('x') + '</button>';
                row += '</div>';
                list.append(row);
            });
            $(document).on('click', '.cc5-edit-remove-keyindicator', function (e) {
                e.preventDefault(); e.stopPropagation();
                $(this).closest('.cc5-edit-keyindicator-item').remove();
            });
            // core-framework: frameworkSteps
            $(document).on('click', '.cc5-edit-add-frameworkstep', function (e) {
                e.preventDefault();
                var list = $(this).siblings('.cc5-edit-frameworksteps-list');
                var idx = list.find('.cc5-edit-frameworkstep-item').length;
                var row = '<div class="cc5-edit-frameworkstep-item" data-idx="' + idx + '" style="border:1px solid var(--border);border-radius:6px;padding:8px;margin-bottom:8px;">';
                row += '<input type="text" class="cc5-edit-fwstep-step" placeholder="' + getLabel('stepName') + '" value="" style="margin-bottom:4px;">';
                row += '<textarea class="cc5-edit-fwstep-explanation" rows="2" placeholder="' + getLabel('explanation') + '"></textarea>';
                row += '<input type="text" class="cc5-edit-fwstep-example" placeholder="' + getLabel('example') + '" value="" style="margin-bottom:4px;">';
                row += '<button type="button" class="cc5-edit-remove-frameworkstep" title="' + getLabel('remove') + '">' + getIcon('x') + ' Remove</button>';
                row += '</div>';
                list.append(row);
            });
            $(document).on('click', '.cc5-edit-remove-frameworkstep', function (e) {
                e.preventDefault(); e.stopPropagation();
                $(this).closest('.cc5-edit-frameworkstep-item').remove();
            });
            // application-guide: applications
            $(document).on('click', '.cc5-edit-add-application', function (e) {
                e.preventDefault();
                var list = $(this).siblings('.cc5-edit-applications-list');
                var idx = list.find('.cc5-edit-application-item').length;
                var row = '<div class="cc5-edit-application-item" data-idx="' + idx + '" style="border:1px solid var(--border);border-radius:6px;padding:8px;margin-bottom:8px;">';
                row += '<input type="text" class="cc5-edit-app-situation" placeholder="' + getLabel('situation') + '" value="" style="margin-bottom:4px;">';
                row += '<textarea class="cc5-edit-app-action" rows="2" placeholder="' + getLabel('action') + '"></textarea>';
                row += '<input type="text" class="cc5-edit-app-rationale" placeholder="' + getLabel('rationale') + '" value="" style="margin-bottom:4px;">';
                row += '<button type="button" class="cc5-edit-remove-application" title="' + getLabel('remove') + '">' + getIcon('x') + ' Remove</button>';
                row += '</div>';
                list.append(row);
            });
            $(document).on('click', '.cc5-edit-remove-application', function (e) {
                e.preventDefault(); e.stopPropagation();
                $(this).closest('.cc5-edit-application-item').remove();
            });
            // common-pitfalls: pitfallItems
            $(document).on('click', '.cc5-edit-add-pitfall', function (e) {
                e.preventDefault();
                var list = $(this).siblings('.cc5-edit-pitfalls-list');
                var idx = list.find('.cc5-edit-pitfall-item').length;
                var row = '<div class="cc5-edit-pitfall-item" data-idx="' + idx + '" style="border:1px solid var(--border);border-radius:6px;padding:8px;margin-bottom:8px;">';
                row += '<input type="text" class="cc5-edit-pitfall-text" placeholder="' + getLabel('pitfall') + '" value="" style="margin-bottom:4px;">';
                row += '<input type="text" class="cc5-edit-pitfall-consequence" placeholder="' + getLabel('consequence') + '" value="" style="margin-bottom:4px;">';
                row += '<input type="text" class="cc5-edit-pitfall-correction" placeholder="' + getLabel('correction') + '" value="" style="margin-bottom:4px;">';
                row += '<button type="button" class="cc5-edit-remove-pitfall" title="' + getLabel('remove') + '">' + getIcon('x') + ' Remove</button>';
                row += '</div>';
                list.append(row);
            });
            $(document).on('click', '.cc5-edit-remove-pitfall', function (e) {
                e.preventDefault(); e.stopPropagation();
                $(this).closest('.cc5-edit-pitfall-item').remove();
            });
            // -- end v11.04 top-level card-type add/remove handlers ---------------

            // Document popup link click (v6.5.3)
            this.container.on('click keydown', '.cc5-doc-link', function (e) {
                // Handle click or Enter/Space key
                if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') {
                    return;
                }
                e.preventDefault();
                e.stopPropagation();
                var docId = $(this).data('doc-id');
                var docName = $(this).data('doc-name');
                self.showDocumentModal(docId, docName);
            });
            
            // v7.1.8: PDF section link click - opens PDF viewer at specific page
            this.container.on('click keydown', '.cc5-pdf-link', function (e) {
                if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') {
                    return;
                }
                e.preventDefault();
                e.stopPropagation();
                var docId = $(this).data('pdf-doc-id');
                var sectionTitle = $(this).data('pdf-section');
                var targetPage = parseInt($(this).data('pdf-page')) || 1;
                self.showPdfModal(docId, sectionTitle, targetPage);
            });
            
            // Document modal close handlers - v6.5.43: Restore scroll position
            $(document).on('click', '.cc5-doc-modal-close', function (e) {
                e.preventDefault();
                e.stopPropagation();
                $('.cc5-doc-modal-overlay').remove();
                // Restore scroll position
                if (typeof self.savedScrollPosition === 'number') {
                    window.scrollTo(0, self.savedScrollPosition);
                }
            });
            
            $(document).on('click', '.cc5-doc-modal-overlay', function (e) {
                if ($(e.target).hasClass('cc5-doc-modal-overlay')) {
                    $('.cc5-doc-modal-overlay').remove();
                    // Restore scroll position
                    if (typeof self.savedScrollPosition === 'number') {
                        window.scrollTo(0, self.savedScrollPosition);
                    }
                }
            });
            
            // Escape key to close document modal
            $(document).on('keydown.cc5docmodal', function (e) {
                if (e.key === 'Escape' && $('.cc5-doc-modal-overlay').length) {
                    $('.cc5-doc-modal-overlay').remove();
                    // Restore scroll position
                    if (typeof self.savedScrollPosition === 'number') {
                        window.scrollTo(0, self.savedScrollPosition);
                    }
                }
            });
            
            // Edit modal delete list item
            $(document).on('click', '.cc5-edit-delete-item', function (e) {
                e.preventDefault();
                var itemToDelete = $(this).closest('.cc5-edit-list-item');
                itemToDelete.remove();
            });
            
            // v6.5.22: Escalation Decision Activity button clicks
            // v6.6.63: Enhanced with progress tracking and score summary
            this.container.on('click', '.cc5-decision-btn', function (e) {
                e.preventDefault();
                e.stopPropagation();
                
                var $btn = $(this);
                var $situationItem = $btn.closest('.cc5-situation-item');
                var $escalation = $situationItem.closest('.cc5-escalation');
                var $feedback = $situationItem.find('.cc5-situation-feedback');
                var $allBtns = $situationItem.find('.cc5-decision-btn');
                
                // Remove selected state from all buttons in this situation
                $allBtns.removeClass('cc5-selected');
                
                // Add selected state to clicked button
                $btn.addClass('cc5-selected');
                
                // Show feedback with correct/incorrect icon
                $feedback.removeClass('cc5-hidden');
                
                // Play correct/incorrect sound feedback
                var isCorrect = $btn.attr('data-correct') === 'true';
                var $feedbackIcon = $feedback.find('.cc5-feedback-icon');
                if (isCorrect) {
                    $situationItem.addClass('cc5-answered-correct').removeClass('cc5-answered-incorrect');
                    $feedbackIcon.html('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>');
                    // v6.6.94: Play pleasant correct answer sound
                    playTickSound();
                } else {
                    $situationItem.addClass('cc5-answered-incorrect').removeClass('cc5-answered-correct');
                    $feedbackIcon.html('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>');
                    // v6.7.44: Play incorrect answer sound
                    playTickSound();
                }
                
                // v6.6.63: Update progress indicator
                var $situations = $escalation.find('.cc5-escalation-situations');
                var total = parseInt($situations.data('total')) || 0;
                var answered = $situations.find('.cc5-situation-item.cc5-answered-correct, .cc5-situation-item.cc5-answered-incorrect').length;
                var correctCount = $situations.find('.cc5-situation-item.cc5-answered-correct').length;
                
                var $progressIndicator = $escalation.find('.cc5-activity-progress .cc5-progress-answered');
                if ($progressIndicator.length) {
                    $progressIndicator.text(answered);
                }
                
                // v6.6.63: Show score summary when all answered
                if (answered >= total && total > 0) {
                    var $scoreSummary = $escalation.find('.cc5-escalation-score');
                    $scoreSummary.find('.cc5-score-correct').text(correctCount);
                    $scoreSummary.removeClass('cc5-hidden');
                    $escalation.find('.cc5-escalation-instruction').addClass('cc5-hidden');
                    
                    // v6.7.47: Perfect score celebration
                    if (correctCount === total) {
                        setTimeout(function () {
                            playCelebrationSound();
                            showActivityConfetti();
                        }, 200);
                    }
                    
                    // Scroll to score summary
                    setTimeout(function () {
                        $scoreSummary[0]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 300);
                }
                
                // v6.6.62: Update nav state after decision
                self.updateActivityNavState();
            });
            
            // ===========================================================================
            // v6.5.31: CRITICAL FIX - Missing Activity Click Handlers
            // These handlers were missing, causing educational feedback to never appear!
            // ===========================================================================
            
            // 1. SCENARIO BRANCHING: Option click reveals feedback and advances to next decision
            this.container.on('click', '.cc5-option', function (e) {
                e.preventDefault();
                e.stopPropagation();
                
                var $btn = $(this);
                var $decisionPoint = $btn.closest('.cc5-decision-point');
                var $allOptions = $decisionPoint.find('.cc5-option');
                var $decisionPoints = $btn.closest('.cc5-decision-points');
                // v6.7.49: Fix missing totalDecisions variable
                var totalDecisions = parseInt($decisionPoints.data('total-points')) || $decisionPoints.find('.cc5-decision-point').length;
                
                // If already answered, don't allow re-selection
                if ($decisionPoint.hasClass('cc5-answered')) {
                    return;
                }
                
                // Mark as answered
                $decisionPoint.addClass('cc5-answered');
                
                // Disable all options in this decision point.
                // v13.94.6: the class alone only sets pointer-events:none, which does not
                // stop a keyboard Enter - a learner could Tab to a locked option and answer
                // again after submitting. These are real <button>s, so disable them properly
                // and mark them for assistive tech.
                $allOptions.addClass('cc5-disabled')
                           .prop('disabled', true)
                           .attr('aria-disabled', 'true');
                
                // Show correct/incorrect state
                var isCorrect = $btn.attr('data-correct') === 'true';
                if (isCorrect) {
                    $btn.addClass('cc5-selected cc5-correct');
                    $decisionPoint.addClass('cc5-answered-correct');
                    // v6.6.94: Play pleasant correct answer sound
                    playTickSound();
                } else {
                    $btn.addClass('cc5-selected cc5-incorrect');
                    $decisionPoint.addClass('cc5-answered-incorrect');
                    // Also highlight the correct answer so learner can see what they should have chosen
                    $allOptions.filter('[data-correct="true"]').addClass('cc5-show-correct');
                    // v6.7.44: Play incorrect answer sound
                    playTickSound();
                }
                
                // Reveal the feedback for the selected option
                var $feedback = $btn.find('.cc5-option-feedback');
                $feedback.addClass('cc5-visible');
                
                // v6.6.10: Calculate dynamic delay based on feedback text length
                // This ensures students have enough time to listen to the voiceover
                var feedbackText = $feedback.text() || '';
                var wordCount = feedbackText.trim().split(/\s+/).length;
                var wordsPerSecond = 2.5; // TTS reading speed
                var minDelay = 3000; // Minimum 3 seconds to read feedback
                var calculatedDelay = Math.max(minDelay, (wordCount / wordsPerSecond) * 1000 + 1500); // +1.5s buffer
                
                // After a delay, advance to next decision point (if any)
                setTimeout(function () {
                    var currentPointId = $decisionPoint.data('point-id');
                    var $nextPoint = $decisionPoints.find('.cc5-decision-point').filter(function () {
                        return $(this).data('point-id') > currentPointId && !$(this).hasClass('cc5-active');
                    }).first();
                    
                    // v6.6.64: Update progress indicator
                    var $activity = $btn.closest('.cc5-scenario-branching');
                    var $progressIndicator = $activity.find('.cc5-activity-progress .cc5-progress-current');
                    var nextPointIndex = $decisionPoint.data('point-index') + 1;
                    if ($progressIndicator.length && nextPointIndex <= totalDecisions) {
                        $progressIndicator.text(nextPointIndex);
                    }
                    
                    if ($nextPoint.length) {
                        // Scroll to and activate next decision point
                        $decisionPoint.removeClass('cc5-active');
                        $nextPoint.addClass('cc5-active');
                        $nextPoint[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
                    } else {
                        // All decisions made - show score summary, final outcome and learning takeaway
                        
                        // v6.6.64: Calculate and show score
                        var correctCount = $decisionPoints.find('.cc5-decision-point.cc5-answered-correct').length;
                        var totalPoints = $decisionPoints.find('.cc5-decision-point').length;
                        var $scoreSummary = $activity.find('.cc5-activity-score');
                        $scoreSummary.find('.cc5-score-correct').text(correctCount);
                        $scoreSummary.removeClass('cc5-hidden').addClass('cc5-celebrate');
                        
                        // v6.7.47: Perfect score celebration
                        if (correctCount === totalPoints) {
                            setTimeout(function () {
                                playCelebrationSound();
                                showActivityConfetti();
                            }, 200);
                        }
                        
                        $activity.find('.cc5-final-outcome').removeClass('cc5-hidden').addClass('cc5-visible');
                        $activity.find('.cc5-learning-takeaway').removeClass('cc5-hidden').addClass('cc5-visible');
                        
                        // Scroll to score summary
                        setTimeout(function () {
                            $scoreSummary[0]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }, 300);
                        
                        // v6.6.62: Update nav state when all decisions made
                        self.updateActivityNavState();
                    }
                }, calculatedDelay); // v6.6.10: Dynamic delay based on feedback text length
            });
            
            // 2. BEST RESPONSE ANALYSIS: Reveal button shows classification and explanation
            // v6.6.64: Enhanced with progress indicator and score summary
            this.container.on('click', '.cc5-reveal-btn', function (e) {
                e.preventDefault();
                e.stopPropagation();
                
                var $btn = $(this);
                var $responseItem = $btn.closest('.cc5-response-item');
                var $revealContent = $responseItem.find('.cc5-response-reveal');
                var $bestResponse = $btn.closest('.cc5-best-response');
                var $responseOptions = $bestResponse.find('.cc5-response-options');
                
                // Hide the reveal button
                $btn.addClass('cc5-hidden');
                
                // Show the classification and explanation with animation
                $revealContent.removeClass('cc5-hidden').addClass('cc5-visible');
                
                // Add visual feedback based on classification
                var classification = $responseItem.data('classification');
                $responseItem.addClass('cc5-revealed cc5-revealed-' + classification);
                
                // v7.1.8: Play sound feedback based on classification
                if (classification === 'best') {
                    playTickSound();
                } else if (classification === 'not') {
                    playTickSound();
                }
                
                // v6.6.64: Update progress indicator
                var total = parseInt($responseOptions.data('total')) || 0;
                var revealed = $responseOptions.find('.cc5-response-item.cc5-revealed').length;
                
                var $progressIndicator = $bestResponse.find('.cc5-activity-progress .cc5-progress-revealed');
                if ($progressIndicator.length) {
                    $progressIndicator.text(revealed);
                }
                
                // v6.6.64: Show score summary when all revealed
                if (revealed >= total && total > 0) {
                    var $scoreSummary = $bestResponse.find('.cc5-best-response-score');
                    $scoreSummary.removeClass('cc5-hidden').addClass('cc5-celebrate');
                    
                    // v7.1.8: Hide instruction when completed
                    $bestResponse.find('.cc5-br-instruction').addClass('cc5-hidden');
                    // Show learning takeaway
                    $bestResponse.find('.cc5-learning-takeaway').removeClass('cc5-hidden').addClass('cc5-visible');
                    
                    // Scroll to score summary
                    setTimeout(function () {
                        $scoreSummary[0]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 300);
                }
                
                // Scroll the revealed content into view if needed
                setTimeout(function () {
                    $revealContent[0]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }, 100);
                
                // v6.6.62: Update nav state after revealing
                self.updateActivityNavState();
            });
            
            // ===========================================================================
            // v6.6.58: TASK SEQUENCING - Complete interactive reordering support
            // Mobile: Up/down buttons (48px touch targets)
            // Desktop: Drag-and-drop
            // ===========================================================================
            
            // Helper function to update step position numbers
            function updateStepNumbers($container) {
                $container.find('.cc5-sequence-step').each(function (index) {
                    $(this).find('.cc5-step-current-pos').text(index + 1);
                    // Update button states
                    var $moveUp = $(this).find('.cc5-step-move-up');
                    var $moveDown = $(this).find('.cc5-step-move-down');
                    $moveUp.prop('disabled', index === 0);
                    $moveDown.prop('disabled', index === $container.find('.cc5-sequence-step').length - 1);
                });
            }
            
            // 3a. Move Up button (mobile-friendly reordering)
            this.container.on('click', '.cc5-step-move-up', function (e) {
                e.preventDefault();
                e.stopPropagation();
                
                var $btn = $(this);
                var $step = $btn.closest('.cc5-sequence-step');
                var $container = $step.parent('.cc5-sequence-steps');
                var $prevStep = $step.prev('.cc5-sequence-step');
                
                if ($prevStep.length) {
                    // Animate the swap
                    $step.addClass('cc5-step-moving');
                    $prevStep.addClass('cc5-step-moving');
                    
                    // Move this step before the previous one
                    $step.insertBefore($prevStep);
                    
                    // Update position numbers
                    updateStepNumbers($container);
                    
                    // Remove animation class after transition
                    setTimeout(function () {
                        $step.removeClass('cc5-step-moving');
                        $prevStep.removeClass('cc5-step-moving');
                    }, 300);
                    
                    // Clear any previous check results
                    $container.attr('data-checked', 'false');
                    $container.find('.cc5-sequence-step').removeClass('cc5-step-correct cc5-step-incorrect');
                    $container.closest('.cc5-sequencing').find('.cc5-sequence-feedback').addClass('cc5-hidden');
                    $container.closest('.cc5-sequencing').find('.cc5-common-mistake').addClass('cc5-hidden-until-checked');
                }
            });
            
            // 3b. Move Down button (mobile-friendly reordering)
            this.container.on('click', '.cc5-step-move-down', function (e) {
                e.preventDefault();
                e.stopPropagation();
                
                var $btn = $(this);
                var $step = $btn.closest('.cc5-sequence-step');
                var $container = $step.parent('.cc5-sequence-steps');
                var $nextStep = $step.next('.cc5-sequence-step');
                
                if ($nextStep.length) {
                    // Animate the swap
                    $step.addClass('cc5-step-moving');
                    $nextStep.addClass('cc5-step-moving');
                    
                    // Move this step after the next one
                    $step.insertAfter($nextStep);
                    
                    // Update position numbers
                    updateStepNumbers($container);
                    
                    // Remove animation class after transition
                    setTimeout(function () {
                        $step.removeClass('cc5-step-moving');
                        $nextStep.removeClass('cc5-step-moving');
                    }, 300);
                    
                    // Clear any previous check results
                    $container.attr('data-checked', 'false');
                    $container.find('.cc5-sequence-step').removeClass('cc5-step-correct cc5-step-incorrect');
                    $container.closest('.cc5-sequencing').find('.cc5-sequence-feedback').addClass('cc5-hidden');
                    $container.closest('.cc5-sequencing').find('.cc5-common-mistake').addClass('cc5-hidden-until-checked');
                }
            });
            
            // 3c. Check Order button
            this.container.on('click', '.cc5-check-sequence-btn', function (e) {
                e.preventDefault();
                e.stopPropagation();
                
                var $btn = $(this);
                var $activity = $btn.closest('.cc5-sequencing');
                var $container = $activity.find('.cc5-sequence-steps');
                var $feedback = $activity.find('.cc5-sequence-feedback');
                var $commonMistake = $activity.find('.cc5-common-mistake');
                
                // Check each step's position
                var allCorrect = true;
                $container.find('.cc5-sequence-step').each(function (displayIndex) {
                    var correctPosition = parseInt($(this).attr('data-correct-position'));
                    var isCorrect = (displayIndex + 1) === correctPosition;
                    
                    $(this).removeClass('cc5-step-correct cc5-step-incorrect');
                    // v9.78 FIX (A-03): was: incorrect class + allCorrect=false inside isCorrect branch.
                    // else branch was completely missing, so every step got both classes.
                    if (isCorrect) {
                        $(this).addClass('cc5-step-correct');
                        $(this).find('.cc5-step-explanation').removeClass('cc5-hidden');
                    } else {
                        $(this).addClass('cc5-step-incorrect');
                        allCorrect = false;
                    }
                });
                
                // Mark as checked and store correct status for perfect score check
                $container.attr('data-checked', 'true');
                // v6.7.50: Set data-correct for perfect score requirement check
                $container.attr('data-correct', allCorrect ? 'true' : 'false');
                
                // Show appropriate feedback
                $feedback.removeClass('cc5-hidden');
                // v9.78 FIX (A-03): was: allCorrect=true block had both correct+incorrect feedback
                // shown in sequence (incorrect overwriting correct), and wrong sound played.
                if (allCorrect) {
                    $feedback.find('.cc5-feedback-correct').removeClass('cc5-hidden');
                    $feedback.find('.cc5-feedback-incorrect').addClass('cc5-hidden');
                    // Show common mistake tip
                    $commonMistake.removeClass('cc5-hidden-until-checked');
                    // v6.7.47: Perfect order celebration with confetti
                    setTimeout(function () {
                        playCelebrationSound();
                        showActivityConfetti();
                    }, 200);
                } else {
                    $feedback.find('.cc5-feedback-correct').addClass('cc5-hidden');
                    $feedback.find('.cc5-feedback-incorrect').removeClass('cc5-hidden');
                    // v6.7.44: Play incorrect answer sound
                    playTickSound();
                }
                
                // Scroll feedback into view
                setTimeout(function () {
                    $feedback[0]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 100);
                
                // v6.6.62: Update nav state after checking order
                self.updateActivityNavState();
            });
            
            // v6.6.63: Reset/Start Over button
            this.container.on('click', '.cc5-reset-sequence-btn', function (e) {
                e.preventDefault();
                e.stopPropagation();
                
                var $btn = $(this);
                var $activity = $btn.closest('.cc5-sequencing');
                var $container = $activity.find('.cc5-sequence-steps');
                var $feedback = $activity.find('.cc5-sequence-feedback');
                var $commonMistake = $activity.find('.cc5-common-mistake');
                
                // Get all steps and shuffle them again using Fisher-Yates
                var $steps = $container.find('.cc5-sequence-step').detach();
                var stepsArray = $steps.toArray();
                
                for (var i = stepsArray.length - 1; i > 0; i--) {
                    var j = Math.floor(Math.random() * (i + 1));
                    var temp = stepsArray[i];
                    stepsArray[i] = stepsArray[j];
                    stepsArray[j] = temp;
                }
                
                // Re-append in new order
                stepsArray.forEach(function (step) {
                    $container.append(step);
                });
                
                // Update position numbers
                updateStepNumbers($container);
                
                // Reset all states
                $container.attr('data-checked', 'false');
                // v6.7.50: Clear data-correct when resetting
                $container.removeAttr('data-correct');
                $container.find('.cc5-sequence-step').removeClass('cc5-step-correct cc5-step-incorrect');
                $container.find('.cc5-step-explanation').addClass('cc5-hidden');
                $feedback.addClass('cc5-hidden');
                $feedback.find('.cc5-feedback-correct, .cc5-feedback-incorrect').addClass('cc5-hidden');
                $commonMistake.addClass('cc5-hidden-until-checked');
                
                // Visual feedback - brief highlight animation
                $container.addClass('cc5-reshuffle-animation');
                setTimeout(function () {
                    $container.removeClass('cc5-reshuffle-animation');
                }, 500);
                
                // Scroll container into view
                $container[0]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                
                // Update nav state
                self.updateActivityNavState();
            });
            
            // 3d. Drag and Drop support for desktop
            var draggedStep = null;
            
            // v7.2.64: Improved drag-drop with better detection and visual feedback
            this.container.on('dragstart', '.cc5-sequence-step', function (e) {
                draggedStep = this;
                $(this).addClass('cc5-dragging');
                // Set drag image with slight offset for better visibility
                e.originalEvent.dataTransfer.effectAllowed = 'move';
                e.originalEvent.dataTransfer.setData('text/plain', $(this).index().toString());
                // Add dragging class to container for styling
                $(this).closest('.cc5-sequence-steps').addClass('cc5-dragging-active');
            });
            
            this.container.on('dragend', '.cc5-sequence-step', function (e) {
                $(this).removeClass('cc5-dragging');
                draggedStep = null;
                // Remove all drag indicators
                self.container.find('.cc5-sequence-step').removeClass('cc5-drag-over cc5-drag-above cc5-drag-below');
                self.container.find('.cc5-sequence-steps').removeClass('cc5-dragging-active');
            });
            
            // Handle dragover on individual steps
            this.container.on('dragover', '.cc5-sequence-step', function (e) {
                e.preventDefault();
                e.originalEvent.dataTransfer.dropEffect = 'move';
                
                if (this !== draggedStep && draggedStep) {
                    // Clear other indicators
                    $(this).siblings().removeClass('cc5-drag-over cc5-drag-above cc5-drag-below');
                    
                    // Determine if dropping above or below
                    var rect = this.getBoundingClientRect();
                    var mouseY = e.originalEvent.clientY;
                    var midpoint = rect.top + rect.height / 2;
                    
                    $(this).removeClass('cc5-drag-above cc5-drag-below');
                    // v9.79 FIX (A-04): was adding BOTH cc5-drag-above AND cc5-drag-below
                    // inside the if(mouseY < midpoint) branch  -  only one should ever be active.
                    if (mouseY < midpoint) {
                        $(this).addClass('cc5-drag-above');
                    } else {
                        $(this).addClass('cc5-drag-below');
                    }
                    $(this).addClass('cc5-drag-over');
                }
            });
            
            this.container.on('dragleave', '.cc5-sequence-step', function (e) {
                // Only remove if leaving to outside the element
                var rect = this.getBoundingClientRect();
                var x = e.originalEvent.clientX;
                var y = e.originalEvent.clientY;
                if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
                    $(this).removeClass('cc5-drag-over cc5-drag-above cc5-drag-below');
                }
            });
            
            // Handle drop on step
            this.container.on('drop', '.cc5-sequence-step', function (e) {
                e.preventDefault();
                e.stopPropagation();
                
                if (this !== draggedStep && draggedStep) {
                    var $target = $(this);
                    var $dragged = $(draggedStep);
                    var $container = $target.parent('.cc5-sequence-steps');
                    
                    // Use the visual indicator to determine position
                    if ($target.hasClass('cc5-drag-above')) {
                        $dragged.insertBefore($target);
                    } else {
                        $dragged.insertAfter($target);
                    }
                    
                    // Update position numbers
                    updateStepNumbers($container);
                    
                    // Clear any previous check results
                    $container.attr('data-checked', 'false');
                    $container.find('.cc5-sequence-step').removeClass('cc5-step-correct cc5-step-incorrect');
                    $container.closest('.cc5-sequencing').find('.cc5-sequence-feedback').addClass('cc5-hidden');
                    $container.closest('.cc5-sequencing').find('.cc5-common-mistake').addClass('cc5-hidden-until-checked');
                    
                }
                
                $(this).removeClass('cc5-drag-over cc5-drag-above cc5-drag-below');
            });
            
            // v7.2.64: Also handle drops on the container (in case user drops between steps)
            this.container.on('dragover', '.cc5-sequence-steps', function (e) {
                e.preventDefault();
                e.originalEvent.dataTransfer.dropEffect = 'move';
            });
            
            this.container.on('drop', '.cc5-sequence-steps', function (e) {
                // Only handle if not dropped on a step (fallback)
                if ($(e.target).closest('.cc5-sequence-step').length === 0 && draggedStep) {
                    e.preventDefault();
                    var $container = $(this);
                    var $dragged = $(draggedStep);
                    
                    // Find the closest step based on drop position
                    var dropY = e.originalEvent.clientY;
                    var $steps = $container.find('.cc5-sequence-step');
                    var inserted = false;
                    
                    $steps.each(function () {
                        var rect = this.getBoundingClientRect();
                        if (!inserted && dropY < rect.top + rect.height / 2) {
                            $dragged.insertBefore($(this));
                            inserted = true;
                            return false;
                        }
                    });
                    
                    if (!inserted) {
                        // Drop at end
                        $container.append($dragged);
                    }
                    
                    updateStepNumbers($container);
                    $container.attr('data-checked', 'false');
                    $container.find('.cc5-sequence-step').removeClass('cc5-step-correct cc5-step-incorrect cc5-drag-over');
                    $container.closest('.cc5-sequencing').find('.cc5-sequence-feedback').addClass('cc5-hidden');
                    
                }
            });
            
            // ===========================================================================
            // v7.2.64: Mobile Tap-to-Select, Tap-to-Place for Sequence Ordering
            // First tap selects a step, second tap on another step swaps positions
            // ===========================================================================
            var selectedSequenceStep = null;
            
            this.container.on('click', '.cc5-sequence-step', function (e) {
                // Don't interfere with drag handle or reorder buttons
                if ($(e.target).closest('.cc5-step-drag-handle, .cc5-step-move-up, .cc5-step-move-down').length) {
                    return;
                }
                
                var $step = $(this);
                var $container = $step.parent('.cc5-sequence-steps');
                
                if (!selectedSequenceStep) {
                    // First tap: select this step
                    selectedSequenceStep = this;
                    $container.find('.cc5-sequence-step').removeClass('cc5-step-selected');
                    $step.addClass('cc5-step-selected');
                } else if (selectedSequenceStep === this) {
                    // Tapped same step: deselect
                    selectedSequenceStep = null;
                    $step.removeClass('cc5-step-selected');
                } else {
                    // Second tap on different step: swap positions
                    var $selected = $(selectedSequenceStep);
                    var $target = $step;
                    
                    // Move selected to target position
                    var selectedIndex = $selected.index();
                    var targetIndex = $target.index();
                    
                    if (selectedIndex < targetIndex) {
                        $selected.insertAfter($target);
                    } else {
                        $selected.insertBefore($target);
                    }
                    
                    // Update position numbers
                    updateStepNumbers($container);
                    
                    // Clear selection and reset state
                    selectedSequenceStep = null;
                    $container.find('.cc5-sequence-step').removeClass('cc5-step-selected cc5-step-correct cc5-step-incorrect');
                    $container.closest('.cc5-sequencing').find('.cc5-sequence-feedback').addClass('cc5-hidden');
                    $container.attr('data-checked', 'false');
                }
            });
            
            // ===========================================================================
            // v6.6.62: Micro-Reflection Word Count Tracking
            // v6.6.63: Enhanced with progress indicator updates
            // ===========================================================================
            
            this.container.on('input', '.cc5-reflection-input', function () {
                var $textarea = $(this);
                var $item = $textarea.closest('.cc5-reflection-item');
                var $reflection = $textarea.closest('.cc5-reflection');
                var $counter = $textarea.siblings('.cc5-word-counter');
                var $countSpan = $counter.find('.cc5-word-count');
                
                var text = $textarea.val() || '';
                var wordCount = self.countWords(text);
                var minWords = parseInt($textarea.attr('data-min-words')) || 20;
                
                $countSpan.text(wordCount);
                
                if (wordCount >= minWords) {
                    $counter.addClass('cc5-words-met cc5-word-count-complete');
                    $item.addClass('cc5-reflection-complete');
                } else {
                    $counter.removeClass('cc5-words-met cc5-word-count-complete');
                    $item.removeClass('cc5-reflection-complete');
                }
                
                // v6.6.63: Update progress indicator
                var $prompts = $reflection.find('.cc5-reflection-prompts');
                var complete = $prompts.find('.cc5-reflection-item.cc5-reflection-complete').length;
                
                var $progressIndicator = $reflection.find('.cc5-activity-progress .cc5-progress-complete');
                if ($progressIndicator.length) {
                    $progressIndicator.text(complete);
                }
                
                // Check if all textareas meet minimum - update nav button state
                self.updateActivityNavState();
            });
            
            // ===========================================================================
            // v6.6.62: What Went Wrong - Track details opening
            // v6.6.64: Enhanced with progress indicator and score summary
            // ===========================================================================
            
            this.container.on('toggle', '.cc5-what-went-wrong details.cc5-model-answer', function () {
                var $details = $(this);
                var $whatWentWrong = $details.closest('.cc5-what-went-wrong');
                var $analysisQuestions = $whatWentWrong.find('.cc5-analysis-questions');
                
                // Mark as opened if expanding (not collapsing)
                if (this.open) {
                    $details.closest('.cc5-analysis-item').addClass('cc5-item-opened');
                }
                
                // v6.6.64: Update progress indicator
                var total = parseInt($analysisQuestions.data('total')) || 0;
                var opened = $whatWentWrong.find('.cc5-analysis-item.cc5-item-opened').length;
                
                var $progressIndicator = $whatWentWrong.find('.cc5-activity-progress .cc5-progress-opened');
                if ($progressIndicator.length) {
                    $progressIndicator.text(opened);
                }
                
                // v6.6.64: Show score summary when all opened
                if (opened >= total && total > 0) {
                    var $scoreSummary = $whatWentWrong.find('.cc5-what-went-wrong-score');
                    if ($scoreSummary.hasClass('cc5-hidden')) {
                        $scoreSummary.removeClass('cc5-hidden').addClass('cc5-celebrate');
                        
                        // Show prevention takeaway
                        // v7.1.8: Hide instruction when completed
                        $whatWentWrong.find('.cc5-www-instruction').addClass('cc5-hidden');
                        $whatWentWrong.find('.cc5-prevention-takeaway').removeClass('cc5-hidden').addClass('cc5-visible');
                        
                        // Scroll to score summary
                        setTimeout(function () {
                            $scoreSummary[0]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }, 300);
                    }
                }
                
                self.updateActivityNavState();
            });
            
            // ===========================================================================
            // v6.7.32: Try Again button - reset activity and allow retry
            // ===========================================================================
            
            this.container.on('click', '.cc5-try-again-btn', function (e) {
                e.preventDefault();
                e.stopPropagation();
                
                var activityType = $(this).data('activity-type');
                self.resetActivity(activityType);
            });
        },
        
        /**
         * v6.7.32: Reset activity to allow retry
         * v6.7.42: Improved scroll to top of activity section
         */
        resetActivity: function (activityType) {
            var self = this;
            var sections = this.getCurrentSections();
            var currentSection = sections[this.currentSlideIndex];
            var slideId = currentSection?.slideId || currentSection?.id;
            var sectionId = currentSection?.id || slideId;
            
            // v7.1.8: Comprehensive state reset for Try Again functionality
            // 1. Clear activity completion cache
            delete this.activityCompleted[slideId];
            
            // 2. Clear progress section state (allow re-completion)
            if (this.progress && this.progress.sections && this.progress.sections[sectionId]) {
                delete this.progress.sections[sectionId].activityComplete;
            }
            if (slideId !== sectionId && this.progress && this.progress.sections && this.progress.sections[slideId]) {
                delete this.progress.sections[slideId].activityComplete;
            }
            
            // 3. Reset next button to disabled state (will be re-enabled on completion)
            var $nextBtn = this.container.find('.cc5-nav-chevron.cc5-next');
            if (this.requireFullScore) {
                $nextBtn.addClass('cc5-disabled').prop('disabled', true);
            }
            
            // 4. Re-render the slide to reset all DOM state
            this.render();
            
            // 5. Scroll to top of slide content
            var slideContent = this.container.find('.cc5-slide-content');
            if (slideContent.length) {
                slideContent[0].scrollTop = 0;
            }
            
            // 6. Smooth scroll activity section into view
            var activitySection = this.container.find('.cc5-activity-section');
            if (activitySection.length) {
                setTimeout(function () {
                    activitySection[0].scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 100);
            }
            
            // 7. Update navigation state after reset
            setTimeout(function () {
                self.updateActivityNavState();
            }, 200);
        },
        
        /**
         * v6.6.62: Update navigation button state based on activity completion
         */
        updateActivityNavState: function () {
            var sections = this.getCurrentSections();
            var currentSection = sections[this.currentSlideIndex];
            
            if (!currentSection) return;
            
            var slideId = currentSection.slideId || currentSection.id;
            
            // v8.4.6: Handle both activity slides and learning slides with embedded activities
            if (currentSection.slideType === 'activity') {
                var isComplete = this.isActivityComplete(currentSection, slideId);
                if (isComplete) {
                    this.activityCompleted[slideId] = true;
                    this.markSectionComplete(slideId);
                }
            }
            
            // v8.4.6: Re-evaluate next button based on ALL progression requirements
            var $nextBtn = this.container.find('.cc5-nav-chevron.cc5-next');
            if (this.canNavigateNext(currentSection)) {
                $nextBtn.removeClass('cc5-disabled').prop('disabled', false);
                this.container.find('.cc5-voiceover-hint').fadeOut();
                this.container.find('.cc5-fullscore-hint').fadeOut();
            } else {
                $nextBtn.addClass('cc5-disabled').prop('disabled', true);
            }
        },

        /**
         * Navigate to specific slide
         */
        navigateToSlide: function (index) {
            var self = this;
            var sections = this.getCurrentSections();
            if (index < 0 || index >= sections.length) return;
            
            if (this.slideTimer) {
                clearInterval(this.slideTimer);
                this.slideTimer = null;
            }
            if (this._quizFbAudio) {
                // v13.94.6: the quiz feedback clip was referenced by exactly one handler and
                // by nothing else - not by navigation, not by teardown - so it survived the
                // slide transition and played on over the next slide's narration.
                try { this._quizFbAudio.pause(); } catch (e) { /* detached */ }
                this._quizFbAudio = null;
            }
            if (this.currentAudio) {
                this.currentAudio.pause();
                this.currentAudio = null;
            }
            // v13.92: drop the Topics-and-Text narration sync with the audio it was
            // driving. The listener would otherwise outlive the slide, holding a
            // reference to a grid that render() is about to replace.
            this.teardownVoiceoverSync();
            // v10.43c FIX-NAV-AUDIO: always clear currentAudioSectionId on navigation.
            // Previously only currentAudio was nulled, leaving a stale sectionId that could
            // confuse the "different-section audio guard" in playVoiceover on subsequent slides.
            this.currentAudioSectionId = null;
            if (this.slideCompletionTimer) {
                clearTimeout(this.slideCompletionTimer);
                this.slideCompletionTimer = null;
            }
            
            this.currentSlideIndex = index;
            this.voiceoverPlayed = false;
            this.slideTimeRemaining = this.slideDuration;
            this.saveSessionState();
            this.render();
            
            this.priorityPreloadCurrentSlide();
            
            var currentSection = sections[index];
            var slideId = currentSection.slideId || currentSection.id;
            if (currentSection.cardType && !this.isSectionComplete(slideId)) {
                this.slideCompletionTimer = setTimeout(function () {
                    self.markSectionComplete(slideId);
                }, 15000);
            }
            
            var slideContent = this.container.find('.cc5-slide-content');
            if (slideContent.length) {
                slideContent[0].scrollTop = 0;
            }
            this.container[0].scrollIntoView({ behavior: 'smooth', block: 'start' });
        },

        /**
         * Render an icon-picker input control (v11.90).
         * Returns an HTML string: preview square + text input + "Browse" button.
         * @param {string} currentVal  Currently-selected icon name (may be empty).
         * @param {string} cssClass    Class to put on the <input> (e.g. 'cc5-edit-ci-icon').
         * @param {string} placeholder Placeholder text shown when input is empty.
         * @returns {string} HTML fragment.
         */
        renderIconPickerInput: function (currentVal, cssClass, placeholder) {
            var previewSvg = (currentVal && CcIcons.hasIcon(currentVal)) ? getIcon(currentVal) : '';
            var previewClass = 'cc5-ipi-preview' + (previewSvg ? '' : ' cc5-ipi-empty');
            var html = '';
            html += '<div class="cc5-icon-picker-wrap">';
            html += '<span class="' + previewClass + '">' + previewSvg + '</span>';
            html += '<input type="text" class="' + cssClass + ' cc5-ipi-input" placeholder="' + escapeHtml(placeholder) + '" value="' + escapeHtml(currentVal || '') + '" style="flex:1;min-width:0;">';
            html += '<button type="button" class="cc5-icon-picker-btn" title="' + getLabel('browseAllIcons') + '">' + getLabel('browse') + '</button>';
            html += '</div>';
            return html;
        },

        /**
         * Build the full icon-picker overlay HTML (v11.90).
         * Appended to <body> as a singleton; removed on selection or dismiss.
         * @returns {string} HTML string for the overlay.
         */
        buildIconPickerOverlay: function () {
            var allNames = Object.keys(CcIcons.ICONS);
            var html = '<div id="cc5-icon-picker-overlay">';
            html += '<div class="cc5-icon-picker-popup">';
            html += '<div class="cc5-icon-picker-header">';
            html += '<input type="text" class="cc5-icon-picker-search" placeholder="' + getLabel('searchIcons') + '" autocomplete="off">';
            html += '<button type="button" class="cc5-icon-picker-close" title="' + getLabel('close') + '">' + getIcon('x') + '</button>';
            html += '</div>';
            html += '<div class="cc5-icon-picker-grid">';
            for (var ni = 0; ni < allNames.length; ni++) {
                var n = allNames[ni];
                html += '<button type="button" class="cc5-icon-picker-item" data-icon="' + escapeHtml(n) + '" title="' + escapeHtml(n) + '">';
                html += '<span class="cc5-ipi-item-svg">' + getIcon(n) + '</span>';
                html += '<span class="cc5-ipi-item-name">' + escapeHtml(n) + '</span>';
                html += '</button>';
            }
            html += '</div></div></div>';
            return html;
        },

        /**
         * Show edit modal for a slide (v6.5.0)
         * v6.5.58: Enhanced section lookup with fallback strategies
         */
        showEditModal: function (topicId, sectionId) {
            var self = this;
            var section = null;
            var foundTopic = null;
            
            // v6.6.78: Ensure sectionId is always a string (fixes "3.1" being parsed as float)
            sectionId = String(sectionId);
            topicId = String(topicId);
            
            
            // Strategy 1: Exact match on topic.id and section.id
            for (var i = 0; i < this.manifest.topics.length; i++) {
                if (this.manifest.topics[i].id === topicId) {
                    foundTopic = this.manifest.topics[i];
                    for (var j = 0; j < foundTopic.sections.length; j++) {
                        if (foundTopic.sections[j].id === sectionId) {
                            section = foundTopic.sections[j];
                            break;
                        }
                    }
                    break;
                }
            }
            
            // Strategy 2: If topic found but section not, try pcNumber match
            if (foundTopic && !section) {
                for (var k = 0; k < foundTopic.sections.length; k++) {
                    if (foundTopic.sections[k].pcNumber === sectionId) {
                        section = foundTopic.sections[k];
                        break;
                    }
                }
            }
            
            // Strategy 3: If still not found, try matching by index (e.g., "1.4" -> index 3 in topic 0)
            if (!section && sectionId && sectionId.includes('.')) {
                var parts = sectionId.split('.');
                var topicIdx = parseInt(parts[0]) - 1;
                var sectionIdx = parseInt(parts[1]) - 1;
                if (this.manifest.topics[topicIdx] && this.manifest.topics[topicIdx].sections[sectionIdx]) {
                    section = this.manifest.topics[topicIdx].sections[sectionIdx];
                    foundTopic = this.manifest.topics[topicIdx];
                }
            }
            
            if (!section) {
                Notification.addNotification({ message: getLabel('sectionNotFound'), type: 'error' });
                return;
            }
            
            // v8.4.14: Apply fixGrammar to section data so edit modal matches slide display exactly
            // Deep clone section to avoid mutating the manifest, then grammar-fix all text fields
            var editSection = JSON.parse(JSON.stringify(section));
            var grammarFixDeep = function (obj) {
                if (!obj || typeof obj !== 'object') return obj;
                if (Array.isArray(obj)) {
                    for (var ai = 0; ai < obj.length; ai++) {
                        if (typeof obj[ai] === 'string') {
                            obj[ai] = fixGrammar(obj[ai]);
                        } else if (typeof obj[ai] === 'object') {
                            grammarFixDeep(obj[ai]);
                        }
                    }
                    return obj;
                }
                var skipKeys = {id:1, type:1, contrastType:1, language:1, gender:1, voiceoverUrl:1, image:1, icon:1, color:1, sectionId:1, slideId:1, slideType:1, pcNumber:1, isCorrect:1, voiceoverWordCount:1};
                for (var key in obj) {
                    if (!Object.prototype.hasOwnProperty.call(obj, key) || skipKeys[key]) { continue; }
                    if (typeof obj[key] === 'string') {
                        obj[key] = fixGrammar(obj[key]);
                    } else if (typeof obj[key] === 'object') {
                        grammarFixDeep(obj[key]);
                    }
                }
                return obj;
            };
            grammarFixDeep(editSection);
            section = editSection;            // v10.54: Store section on instance so saveSlideEdit can reference section.cardType
            // without triggering ReferenceError (section is local to showEditModal, not saveSlideEdit).
            self._editingSection = section;
            
            // v6.5.24: All labels use getLabel() for multi-language support
            var html = '<div class="cc5-edit-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="cc5-edit-modal-title">';
            html += '<div class="cc5-edit-modal">';
            html += '<div class="cc5-edit-modal-header">';
            html += '<h3>' + getLabel('editSlide') + '</h3>';
            html += '<button type="button" class="cc5-edit-modal-close" title="' + getLabel('closeModal') + '" aria-label="' + getLabel('closeDialog') + '">' + getIcon('x') + '</button>';
            html += '</div>';
            html += '<div class="cc5-edit-modal-body">';
            
            // Hidden fields
            html += '<input type="hidden" id="cc5-edit-topic-id" value="' + escapeHtml(topicId) + '">';
            html += '<input type="hidden" id="cc5-edit-section-id" value="' + escapeHtml(sectionId) + '">';
            
            // Title
            html += '<div class="cc5-edit-field">';
            html += '<label for="cc5-edit-title">' + getLabel('title') + '</label>';
            html += '<input type="text" id="cc5-edit-title" value="' + escapeHtml(section.title || '') + '">';
            html += '</div>';
            
            // v10.63: Legacy top-section fields (description, introduction, requirements, dos, donts,
            // terminology, accent cards, scenario) removed  -  they belonged to the old flat/5-card model
            // and appeared for every slide regardless of type. Card-specific content is in
            // the per-cardType block and the Individual Card Content accordion below.

            
            if (section.cardType) {
                html += '<div class="cc5-edit-field cc5-edit-route-card-section">';
                html += '<h4 class="cc5-edit-section-title">' + getIcon('layers') + ' Route Card: ' + escapeHtml(section.cardType) + '</h4>';
                html += '<div class="cc5-edit-field">';
                html += '<label for="cc5-edit-card-heading">' + getLabel('heading') + '</label>';
                html += '<input type="text" id="cc5-edit-card-heading" value="' + escapeHtml(section.heading || '') + '">';
                html += '</div>';
                html += '<div class="cc5-edit-field">';
                html += '<label for="cc5-edit-card-bodytext">' + getLabel('bodyText') + '</label>';
                html += '<textarea id="cc5-edit-card-bodytext" rows="4">' + escapeHtml(section.bodyText || '') + '</textarea>';
                html += '</div>';
                if (section.cardType === 'scenario-1' || section.cardType === 'scenario-2' || section.cardType === 'case-study-1' || section.cardType === 'case-study-2') {
                    html += '<div class="cc5-edit-field">';
                    html += '<label for="cc5-edit-card-context">' + getLabel('context') + '</label>';
                    html += '<textarea id="cc5-edit-card-context" rows="3">' + escapeHtml(section.context || '') + '</textarea>';
                    html += '</div>';
                    html += '<div class="cc5-edit-field">';
                    html += '<label for="cc5-edit-card-consequence">' + getLabel('consequence') + '</label>';
                    html += '<textarea id="cc5-edit-card-consequence" rows="2">' + escapeHtml(section.consequence || '') + '</textarea>';
                    html += '</div>';
                }
                if (section.cardType === 'competence-standard') {
                    html += '<div class="cc5-edit-field">';
                    html += '<label>' + getLabel('standardItems') + '</label>';
                    html += '<div class="cc5-edit-standard-items">';
                    (section.standardItems || []).forEach(function (item, idx) {
                        var text = typeof item === 'string' ? item : (item.text || '');
                        html += '<div class="cc5-edit-standard-item" data-idx="' + idx + '">';
                        html += '<input type="text" class="cc5-edit-standard-text" value="' + escapeHtml(text) + '">';
                        html += '<button type="button" class="cc5-edit-remove-standard" title="' + getLabel('remove') + '">' + getIcon('x') + '</button>';
                        html += '</div>';
                    });
                    html += '</div>';
                    html += '<button type="button" class="cc5-edit-add-btn cc5-edit-add-standard">' + getIcon('plus') + ' Add Standard Item</button>';
                    html += '</div>';
                }
                if (section.cardType === 'common-errors') {
                    html += '<div class="cc5-edit-field">';
                    html += '<label>' + getLabel('errorItems') + '</label>';
                    html += '<div class="cc5-edit-error-items">';
                    (section.errorItems || []).forEach(function (item, idx) {
                        html += '<div class="cc5-edit-error-item" data-idx="' + idx + '">';
                        html += '<input type="text" class="cc5-edit-error-text" placeholder="' + getLabel('error') + '" value="' + escapeHtml(item.error || '') + '">';
                        html += '<input type="text" class="cc5-edit-error-consequence" placeholder="' + getLabel('consequence') + '" value="' + escapeHtml(item.consequence || '') + '">';
                        html += '<button type="button" class="cc5-edit-remove-error" title="' + getLabel('remove') + '">' + getIcon('x') + '</button>';
                        html += '</div>';
                    });
                    html += '</div>';
                    html += '<button type="button" class="cc5-edit-add-btn cc5-edit-add-error">' + getIcon('plus') + ' Add Error Item</button>';
                    html += '</div>';
                }
                if (section.cardType === 'action-breakdown') {
                    html += '<div class="cc5-edit-field">';
                    html += '<label>' + getLabel('actionItems') + '</label>';
                    html += '<div class="cc5-edit-action-items">';
                    (section.actions || []).forEach(function (action, idx) {
                        html += '<div class="cc5-edit-action-item" data-idx="' + idx + '">';
                        html += '<input type="text" class="cc5-edit-action-heading" placeholder="' + getLabel('actionHeading') + '" value="' + escapeHtml(action.heading || '') + '">';
                        html += '<textarea class="cc5-edit-action-bullets" placeholder="' + getLabel('bulletsOnePerLine') + '" rows="3">' + escapeHtml((action.bullets || []).join('\n')) + '</textarea>';
                        html += '<button type="button" class="cc5-edit-remove-action" title="' + getLabel('remove') + '">' + getIcon('x') + '</button>';
                        html += '</div>';
                    });
                    html += '</div>';
                    html += '<button type="button" class="cc5-edit-add-btn cc5-edit-add-action">' + getIcon('plus') + ' Add Action</button>';
                    html += '</div>';
                }
                // ===================================================================
                // v9.87: EXPANDED ROUTE CARD EDITORS  -  per-card-type structured fields
                // ===================================================================
                
                // VET: performance-anchor  -  pcStatement, elementText, summaryLine
                if (section.cardType === 'performance-anchor') {
                    html += '<div class="cc5-edit-field">';
                    html += '<label for="cc5-edit-pc-statement">' + getLabel('performanceCriteriaStatement') + '</label>';
                    html += '<textarea id="cc5-edit-pc-statement" rows="2">' + escapeHtml(section.pcStatement || '') + '</textarea>';
                    html += '</div>';
                    html += '<div class="cc5-edit-field">';
                    html += '<label for="cc5-edit-element-text">' + getLabel('elementOfCompetency') + '</label>';
                    html += '<input type="text" id="cc5-edit-element-text" value="' + escapeHtml(section.elementText || '') + '">';
                    html += '</div>';
                    html += '<div class="cc5-edit-field">';
                    html += '<label for="cc5-edit-summary-line">' + getLabel('summaryLine') + '</label>';
                    html += '<input type="text" id="cc5-edit-summary-line" value="' + escapeHtml(section.summaryLine || '') + '">';
                    html += '</div>';
                }
                
                // VET/All: plain-english  -  keyPoints[]
                if (section.cardType === 'plain-english') {
                    html += '<div class="cc5-edit-field">';
                    html += '<label>' + getLabel('keyPoints') + '</label>';
                    html += '<div class="cc5-edit-keypoints-list">';
                    (section.keyPoints || []).forEach(function (pt, idx) {
                        html += '<div class="cc5-edit-keypoint-item" data-idx="' + idx + '">';
                        html += '<input type="text" class="cc5-edit-keypoint-text" value="' + escapeHtml(pt || '') + '">';
                        html += '<button type="button" class="cc5-edit-remove-keypoint" title="' + getLabel('remove') + '">' + getIcon('x') + '</button>';
                        html += '</div>';
                    });
                    html += '</div>';
                    html += '<button type="button" class="cc5-edit-add-btn cc5-edit-add-keypoint">' + getIcon('plus') + ' Add Key Point</button>';
                    html += '</div>';
                }
                
                // UNI: concept-anchor  -  conceptDefinition, significance, keyTerms[]
                if (section.cardType === 'concept-anchor') {
                    html += '<div class="cc5-edit-field">';
                    html += '<label for="cc5-edit-concept-definition">' + getLabel('conceptDefinition') + '</label>';
                    html += '<textarea id="cc5-edit-concept-definition" rows="3">' + escapeHtml(section.conceptDefinition || '') + '</textarea>';
                    html += '</div>';
                    html += '<div class="cc5-edit-field">';
                    html += '<label for="cc5-edit-significance">' + getLabel('significance') + '</label>';
                    html += '<textarea id="cc5-edit-significance" rows="2">' + escapeHtml(section.significance || '') + '</textarea>';
                    html += '</div>';
                    html += '<div class="cc5-edit-field">';
                    html += '<label>' + getLabel('cardLevelKeyTerms') + '</label>';
                    html += '<div class="cc5-edit-card-keyterms-list">';
                    (section.keyTerms || []).forEach(function (t, idx) {
                        html += '<div class="cc5-edit-card-keyterm-item" data-idx="' + idx + '">';
                        html += '<input type="text" class="cc5-edit-cardterm-name" placeholder="' + getLabel('term') + '" value="' + escapeHtml(t.term || '') + '">';
                        html += '<input type="text" class="cc5-edit-cardterm-def" placeholder="' + getLabel('definition') + '" value="' + escapeHtml(t.definition || t.meaning || '') + '">';
                        html += '<button type="button" class="cc5-edit-remove-cardterm" title="' + getLabel('remove') + '">' + getIcon('x') + '</button>';
                        html += '</div>';
                    });
                    html += '</div>';
                    html += '<button type="button" class="cc5-edit-add-btn cc5-edit-add-cardterm">' + getIcon('plus') + ' Add Term</button>';
                    html += '</div>';
                }
                
                // UNI: theoretical-framework  -  frameworks[] (name, originator, principle, limitation)
                if (section.cardType === 'theoretical-framework') {
                    html += '<div class="cc5-edit-field">';
                    html += '<label>' + getLabel('theoreticalFrameworks') + '</label>';
                    html += '<div class="cc5-edit-frameworks-list">';
                    (section.frameworks || []).forEach(function (fw, idx) {
                        html += '<div class="cc5-edit-framework-item" data-idx="' + idx + '" style="border:1px solid var(--border);border-radius:6px;padding:8px;margin-bottom:8px;">';
                        html += '<input type="text" class="cc5-edit-fw-name" placeholder="' + getLabel('frameworkName') + '" value="' + escapeHtml(fw.name || '') + '" style="margin-bottom:4px;">';
                        html += '<input type="text" class="cc5-edit-fw-originator" placeholder="' + getLabel('originatorAuthor') + '" value="' + escapeHtml(fw.originator || '') + '" style="margin-bottom:4px;">';
                        html += '<textarea class="cc5-edit-fw-principle" rows="2" placeholder="' + getLabel('corePrinciple') + '">' + escapeHtml(fw.principle || fw.description || '') + '</textarea>';
                        html += '<input type="text" class="cc5-edit-fw-application" placeholder="' + getLabel('practicalApplication') + '" value="' + escapeHtml(fw.application || '') + '" style="margin-bottom:4px;">';
                        html += '<input type="text" class="cc5-edit-fw-limitation" placeholder="' + getLabel('limitationCritique') + '" value="' + escapeHtml(fw.limitation || '') + '" style="margin-bottom:4px;">';
                        html += '<button type="button" class="cc5-edit-remove-framework" title="' + getLabel('remove') + '">' + getIcon('x') + ' Remove framework</button>';
                        html += '</div>';
                    });
                    html += '</div>';
                    html += '<button type="button" class="cc5-edit-add-btn cc5-edit-add-framework">' + getIcon('plus') + ' Add Framework</button>';
                    html += '</div>';
                }
                
                // UNI: analytical-lens  -  cognitiveConsiderations[], analysisPrompts[]
                if (section.cardType === 'analytical-lens') {
                    html += '<div class="cc5-edit-field">';
                    html += '<label>' + getLabel('cognitiveConsiderations') + '</label>';
                    html += '<div class="cc5-edit-cogconsiderations-list">';
                    (section.cognitiveConsiderations || []).forEach(function (c, idx) {
                        var txt = typeof c === 'string' ? c : (c.text || c.description || '');
                        html += '<div class="cc5-edit-cogconsideration-item" data-idx="' + idx + '">';
                        html += '<input type="text" class="cc5-edit-cogconsideration-text" value="' + escapeHtml(txt) + '">';
                        html += '<button type="button" class="cc5-edit-remove-cogconsideration" title="' + getLabel('remove') + '">' + getIcon('x') + '</button>';
                        html += '</div>';
                    });
                    html += '</div>';
                    html += '<button type="button" class="cc5-edit-add-btn cc5-edit-add-cogconsideration">' + getIcon('plus') + ' Add Consideration</button>';
                    html += '</div>';
                    html += '<div class="cc5-edit-field">';
                    html += '<label>' + getLabel('analysisPrompts') + '</label>';
                    html += '<div class="cc5-edit-analysisprompts-list">';
                    (section.analysisPrompts || []).forEach(function (p, idx) {
                        html += '<div class="cc5-edit-analysisprompt-item" data-idx="' + idx + '">';
                        html += '<input type="text" class="cc5-edit-analysisprompt-text" value="' + escapeHtml(p || '') + '">';
                        html += '<button type="button" class="cc5-edit-remove-analysisprompt" title="' + getLabel('remove') + '">' + getIcon('x') + '</button>';
                        html += '</div>';
                    });
                    html += '</div>';
                    html += '<button type="button" class="cc5-edit-add-btn cc5-edit-add-analysisprompt">' + getIcon('plus') + ' Add Analysis Prompt</button>';
                    html += '</div>';
                }
                
                // UNI: ethics-considerations  -  considerations[] (dimension, description)
                if (section.cardType === 'ethics-considerations') {
                    html += '<div class="cc5-edit-field">';
                    html += '<label>' + getLabel('ethicalConsiderations') + '</label>';
                    html += '<div class="cc5-edit-ethicsconsiderations-list">';
                    (section.considerations || []).forEach(function (c, idx) {
                        var dim = (typeof c === 'object' && c) ? (c.dimension || c.title || '') : '';
                        var desc = (typeof c === 'object' && c) ? (c.description || c.text || '') : (c || '');
                        html += '<div class="cc5-edit-ethicsconsideration-item" data-idx="' + idx + '" style="border:1px solid var(--border);border-radius:6px;padding:8px;margin-bottom:8px;">';
                        html += '<input type="text" class="cc5-edit-ethicsdim-text" placeholder="' + getLabel('dimensionExample') + '" value="' + escapeHtml(dim) + '" style="margin-bottom:4px;">';
                        html += '<textarea class="cc5-edit-ethicsdesc-text" rows="2" placeholder="' + getLabel('description') + '">' + escapeHtml(desc) + '</textarea>';
                        html += '<button type="button" class="cc5-edit-remove-ethicsconsideration" title="' + getLabel('remove') + '">' + getIcon('x') + ' Remove</button>';
                        html += '</div>';
                    });
                    html += '</div>';
                    html += '<button type="button" class="cc5-edit-add-btn cc5-edit-add-ethicsconsideration">' + getIcon('plus') + ' Add Consideration</button>';
                    html += '</div>';
                }
                
                // UNI/WP: case-study-1 / case-study-2  -  analysisPrompts[], keyInsight, criticalReflection
                if (section.cardType === 'case-study-1' || section.cardType === 'case-study-2') {
                    html += '<div class="cc5-edit-field">';
                    html += '<label>' + getLabel('analysisPrompts') + '</label>';
                    html += '<div class="cc5-edit-casestudyprompts-list">';
                    (section.analysisPrompts || []).forEach(function (p, idx) {
                        html += '<div class="cc5-edit-casestudyprompt-item" data-idx="' + idx + '">';
                        html += '<input type="text" class="cc5-edit-casestudyprompt-text" value="' + escapeHtml(p || '') + '">';
                        html += '<button type="button" class="cc5-edit-remove-casestudyprompt" title="' + getLabel('remove') + '">' + getIcon('x') + '</button>';
                        html += '</div>';
                    });
                    html += '</div>';
                    html += '<button type="button" class="cc5-edit-add-btn cc5-edit-add-casestudyprompt">' + getIcon('plus') + ' Add Analysis Prompt</button>';
                    html += '</div>';
                    html += '<div class="cc5-edit-field">';
                    html += '<label for="cc5-edit-key-insight">' + getLabel('keyInsight') + '</label>';
                    html += '<textarea id="cc5-edit-key-insight" rows="2">' + escapeHtml(section.keyInsight || '') + '</textarea>';
                    html += '</div>';
                    html += '<div class="cc5-edit-field">';
                    html += '<label for="cc5-edit-critical-reflection">' + getLabel('criticalReflectionQuestion') + '</label>';
                    html += '<textarea id="cc5-edit-critical-reflection" rows="2">' + escapeHtml(section.criticalReflection || '') + '</textarea>';
                    html += '</div>';
                }
                
                // WP: business-impact  -  impactStatement, keyMetrics[], consequences[]
                if (section.cardType === 'business-impact') {
                    html += '<div class="cc5-edit-field">';
                    html += '<label for="cc5-edit-impact-statement">' + getLabel('impactStatement') + '</label>';
                    html += '<textarea id="cc5-edit-impact-statement" rows="2">' + escapeHtml(section.impactStatement || '') + '</textarea>';
                    html += '</div>';
                    html += '<div class="cc5-edit-field">';
                    html += '<label>' + getLabel('keyMetrics') + '</label>';
                    html += '<div class="cc5-edit-keymetrics-list">';
                    (section.keyMetrics || []).forEach(function (m, idx) {
                        html += '<div class="cc5-edit-keymetric-item" data-idx="' + idx + '">';
                        html += '<input type="text" class="cc5-edit-keymetric-text" value="' + escapeHtml(typeof m === 'string' ? m : (m.metric || m.text || '')) + '">';
                        html += '<button type="button" class="cc5-edit-remove-keymetric" title="' + getLabel('remove') + '">' + getIcon('x') + '</button>';
                        html += '</div>';
                    });
                    html += '</div>';
                    html += '<button type="button" class="cc5-edit-add-btn cc5-edit-add-keymetric">' + getIcon('plus') + ' Add Metric</button>';
                    html += '</div>';
                    html += '<div class="cc5-edit-field">';
                    html += '<label>' + getLabel('consequences') + '</label>';
                    html += '<div class="cc5-edit-consequences-list">';
                    (section.consequences || []).forEach(function (c, idx) {
                        html += '<div class="cc5-edit-consequence-item" data-idx="' + idx + '">';
                        html += '<input type="text" class="cc5-edit-consequence-text" value="' + escapeHtml(typeof c === 'string' ? c : (c.text || '')) + '">';
                        html += '<button type="button" class="cc5-edit-remove-consequence" title="' + getLabel('remove') + '">' + getIcon('x') + '</button>';
                        html += '</div>';
                    });
                    html += '</div>';
                    html += '<button type="button" class="cc5-edit-add-btn cc5-edit-add-consequence">' + getIcon('plus') + ' Add Consequence</button>';
                    html += '</div>';
                }
                
                // WP: action-framework  -  steps[] (action, detail, timeframe)
                if (section.cardType === 'action-framework') {
                    html += '<div class="cc5-edit-field">';
                    html += '<label>' + getLabel('actionSteps') + '</label>';
                    html += '<div class="cc5-edit-actionsteps-list">';
                    (section.steps || []).forEach(function (s, idx) {
                        var action = typeof s === 'string' ? s : (s.action || s.text || '');
                        var detail = (typeof s === 'object' && s) ? (s.detail || '') : '';
                        var timeframe = (typeof s === 'object' && s) ? (s.timeframe || '') : '';
                        html += '<div class="cc5-edit-actionstep-item" data-idx="' + idx + '" style="border:1px solid var(--border);border-radius:6px;padding:8px;margin-bottom:8px;">';
                        html += '<input type="text" class="cc5-edit-step-action" placeholder="' + getLabel('action') + '" value="' + escapeHtml(action) + '" style="margin-bottom:4px;">';
                        html += '<input type="text" class="cc5-edit-step-detail" placeholder="' + getLabel('detailOptional') + '" value="' + escapeHtml(detail) + '" style="margin-bottom:4px;">';
                        html += '<input type="text" class="cc5-edit-step-timeframe" placeholder="' + getLabel('timeframeOptional') + '" value="' + escapeHtml(timeframe) + '" style="margin-bottom:4px;">';
                        html += '<button type="button" class="cc5-edit-remove-actionstep" title="' + getLabel('remove') + '">' + getIcon('x') + ' Remove</button>';
                        html += '</div>';
                    });
                    html += '</div>';
                    html += '<button type="button" class="cc5-edit-add-btn cc5-edit-add-actionstep">' + getIcon('plus') + ' Add Step</button>';
                    html += '</div>';
                }
                
                // WP: risk-card  -  risks[] (risk, likelihood, impact, consequence, mitigation)
                if (section.cardType === 'risk-card') {
                    html += '<div class="cc5-edit-field">';
                    html += '<label>' + getLabel('risks') + '</label>';
                    html += '<div class="cc5-edit-risks-list">';
                    (section.risks || []).forEach(function (r, idx) {
                        html += '<div class="cc5-edit-risk-item" data-idx="' + idx + '" style="border:1px solid var(--border);border-radius:6px;padding:8px;margin-bottom:8px;">';
                        html += '<input type="text" class="cc5-edit-risk-text" placeholder="' + getLabel('risk') + '" value="' + escapeHtml(r.risk || r.text || '') + '" style="margin-bottom:4px;">';
                        html += '<input type="text" class="cc5-edit-risk-likelihood" placeholder="' + getLabel('likelihoodExample') + '" value="' + escapeHtml(r.likelihood || '') + '" style="margin-bottom:4px;">';
                        html += '<input type="text" class="cc5-edit-risk-impact" placeholder="' + getLabel('impactExample') + '" value="' + escapeHtml(r.impact || '') + '" style="margin-bottom:4px;">';
                        html += '<input type="text" class="cc5-edit-risk-consequence" placeholder="' + getLabel('consequence') + '" value="' + escapeHtml(r.consequence || '') + '" style="margin-bottom:4px;">';
                        html += '<input type="text" class="cc5-edit-risk-mitigation" placeholder="' + getLabel('mitigationStrategy') + '" value="' + escapeHtml(r.mitigation || '') + '" style="margin-bottom:4px;">';
                        html += '<button type="button" class="cc5-edit-remove-risk" title="' + getLabel('remove') + '">' + getIcon('x') + ' Remove</button>';
                        html += '</div>';
                    });
                    html += '</div>';
                    html += '<button type="button" class="cc5-edit-add-btn cc5-edit-add-risk">' + getIcon('plus') + ' Add Risk</button>';
                    html += '</div>';
                }
                
                // WP: policy-alignment  -  policyItems[] (policy, requirement, consequence)
                if (section.cardType === 'policy-alignment') {
                    html += '<div class="cc5-edit-field">';
                    html += '<label>' + getLabel('policyItems') + '</label>';
                    html += '<div class="cc5-edit-policyitems-list">';
                    var polItems = section.policyItems || section.policies || [];
                    polItems.forEach(function (p, idx) {
                        var policyText = typeof p === 'string' ? p : (p.policy || p.text || '');
                        var reqText = (typeof p === 'object' && p) ? (p.requirement || '') : '';
                        var consText = (typeof p === 'object' && p) ? (p.consequence || '') : '';
                        html += '<div class="cc5-edit-policyitem-item" data-idx="' + idx + '" style="border:1px solid var(--border);border-radius:6px;padding:8px;margin-bottom:8px;">';
                        html += '<textarea class="cc5-edit-policy-text" rows="2" placeholder="' + getLabel('policyStatement') + '">' + escapeHtml(policyText) + '</textarea>';
                        html += '<input type="text" class="cc5-edit-policy-requirement" placeholder="' + getLabel('requirement') + '" value="' + escapeHtml(reqText) + '" style="margin-bottom:4px;">';
                        html += '<input type="text" class="cc5-edit-policy-consequence" placeholder="' + getLabel('consequenceNonCompliance') + '" value="' + escapeHtml(consText) + '" style="margin-bottom:4px;">';
                        html += '<button type="button" class="cc5-edit-remove-policyitem" title="' + getLabel('remove') + '">' + getIcon('x') + ' Remove</button>';
                        html += '</div>';
                    });
                    html += '</div>';
                    html += '<button type="button" class="cc5-edit-add-btn cc5-edit-add-policyitem">' + getIcon('plus') + ' Add Policy Item</button>';
                    html += '</div>';
                }
                
                // WP/VET/PD: scenario-1, scenario-2  -  optimisationTips[]
                if (section.cardType === 'scenario-1' || section.cardType === 'scenario-2') {
                    html += '<div class="cc5-edit-field">';
                    html += '<label>' + getLabel('optimisationTips') + '</label>';
                    html += '<div class="cc5-edit-opttips-list">';
                    (section.optimisationTips || []).forEach(function (tip, idx) {
                        html += '<div class="cc5-edit-opttip-item" data-idx="' + idx + '">';
                        html += '<input type="text" class="cc5-edit-opttip-text" value="' + escapeHtml(tip || '') + '">';
                        html += '<button type="button" class="cc5-edit-remove-opttip" title="' + getLabel('remove') + '">' + getIcon('x') + '</button>';
                        html += '</div>';
                    });
                    html += '</div>';
                    html += '<button type="button" class="cc5-edit-add-btn cc5-edit-add-opttip">' + getIcon('plus') + ' Add Tip</button>';
                    html += '</div>';
                    // PD scenarios also have turningPoint + reflection
                    if (section.reflection || section.turningPoint) {
                        html += '<div class="cc5-edit-field">';
                        html += '<label for="cc5-edit-turning-point">' + getLabel('turningPoint') + '</label>';
                        html += '<textarea id="cc5-edit-turning-point" rows="2">' + escapeHtml(section.turningPoint || '') + '</textarea>';
                        html += '</div>';
                        var reflObj = section.reflection || {};
                        html += '<div class="cc5-edit-field">';
                        html += '<label for="cc5-edit-reflection-question">' + getLabel('reflectionQuestion') + '</label>';
                        html += '<input type="text" id="cc5-edit-reflection-question" value="' + escapeHtml(reflObj.question || '') + '">';
                        html += '</div>';
                        html += '<div class="cc5-edit-field">';
                        html += '<label>' + getLabel('sampleAnswersOnePerLine') + '</label>';
                        html += '<textarea id="cc5-edit-reflection-answers" rows="3">' + escapeHtml((reflObj.sampleAnswers || []).join('\n')) + '</textarea>';
                        html += '</div>';
                    }
                }
                
                // PD: skill-anchor  -  skillStatement, relevance, keyIndicators[]
                if (section.cardType === 'skill-anchor') {
                    html += '<div class="cc5-edit-field">';
                    html += '<label for="cc5-edit-skill-statement">' + getLabel('skillStatement') + '</label>';
                    html += '<textarea id="cc5-edit-skill-statement" rows="2">' + escapeHtml(section.skillStatement || '') + '</textarea>';
                    html += '</div>';
                    html += '<div class="cc5-edit-field">';
                    html += '<label for="cc5-edit-relevance">' + getLabel('relevance') + '</label>';
                    html += '<textarea id="cc5-edit-relevance" rows="2">' + escapeHtml(section.relevance || '') + '</textarea>';
                    html += '</div>';
                    html += '<div class="cc5-edit-field">';
                    html += '<label>' + getLabel('keyIndicators') + '</label>';
                    html += '<div class="cc5-edit-keyindicators-list">';
                    (section.keyIndicators || []).forEach(function (ind, idx) {
                        var txt = typeof ind === 'string' ? ind : (ind.text || ind.indicator || '');
                        html += '<div class="cc5-edit-keyindicator-item" data-idx="' + idx + '">';
                        html += '<input type="text" class="cc5-edit-keyindicator-text" value="' + escapeHtml(txt) + '">';
                        html += '<button type="button" class="cc5-edit-remove-keyindicator" title="' + getLabel('remove') + '">' + getIcon('x') + '</button>';
                        html += '</div>';
                    });
                    html += '</div>';
                    html += '<button type="button" class="cc5-edit-add-btn cc5-edit-add-keyindicator">' + getIcon('plus') + ' Add Indicator</button>';
                    html += '</div>';
                }
                
                // PD: core-framework  -  frameworkSteps[] (step, explanation, example), keyPrinciple
                if (section.cardType === 'core-framework') {
                    html += '<div class="cc5-edit-field">';
                    html += '<label for="cc5-edit-key-principle">' + getLabel('keyPrinciple') + '</label>';
                    html += '<textarea id="cc5-edit-key-principle" rows="2">' + escapeHtml(section.keyPrinciple || '') + '</textarea>';
                    html += '</div>';
                    html += '<div class="cc5-edit-field">';
                    html += '<label>' + getLabel('frameworkSteps') + '</label>';
                    html += '<div class="cc5-edit-frameworksteps-list">';
                    (section.frameworkSteps || []).forEach(function (s, idx) {
                        html += '<div class="cc5-edit-frameworkstep-item" data-idx="' + idx + '" style="border:1px solid var(--border);border-radius:6px;padding:8px;margin-bottom:8px;">';
                        html += '<input type="text" class="cc5-edit-fwstep-step" placeholder="' + getLabel('stepName') + '" value="' + escapeHtml(s.step || '') + '" style="margin-bottom:4px;">';
                        html += '<textarea class="cc5-edit-fwstep-explanation" rows="2" placeholder="' + getLabel('explanation') + '">' + escapeHtml(s.explanation || '') + '</textarea>';
                        html += '<input type="text" class="cc5-edit-fwstep-example" placeholder="' + getLabel('example') + '" value="' + escapeHtml(s.example || '') + '" style="margin-bottom:4px;">';
                        html += '<button type="button" class="cc5-edit-remove-frameworkstep" title="' + getLabel('remove') + '">' + getIcon('x') + ' Remove</button>';
                        html += '</div>';
                    });
                    html += '</div>';
                    html += '<button type="button" class="cc5-edit-add-btn cc5-edit-add-frameworkstep">' + getIcon('plus') + ' Add Step</button>';
                    html += '</div>';
                }
                
                // PD: application-guide  -  applications[] (situation, action, rationale)
                if (section.cardType === 'application-guide') {
                    html += '<div class="cc5-edit-field">';
                    html += '<label>' + getLabel('applicationScenarios') + '</label>';
                    html += '<div class="cc5-edit-applications-list">';
                    (section.applications || []).forEach(function (a, idx) {
                        html += '<div class="cc5-edit-application-item" data-idx="' + idx + '" style="border:1px solid var(--border);border-radius:6px;padding:8px;margin-bottom:8px;">';
                        html += '<input type="text" class="cc5-edit-app-situation" placeholder="' + getLabel('situation') + '" value="' + escapeHtml(a.situation || '') + '" style="margin-bottom:4px;">';
                        html += '<textarea class="cc5-edit-app-action" rows="2" placeholder="' + getLabel('action') + '">' + escapeHtml(a.action || '') + '</textarea>';
                        html += '<input type="text" class="cc5-edit-app-rationale" placeholder="' + getLabel('rationale') + '" value="' + escapeHtml(a.rationale || '') + '" style="margin-bottom:4px;">';
                        html += '<button type="button" class="cc5-edit-remove-application" title="' + getLabel('remove') + '">' + getIcon('x') + ' Remove</button>';
                        html += '</div>';
                    });
                    html += '</div>';
                    html += '<button type="button" class="cc5-edit-add-btn cc5-edit-add-application">' + getIcon('plus') + ' Add Application</button>';
                    html += '</div>';
                }
                
                // PD: common-pitfalls  -  pitfallItems[] (pitfall, consequence, correction)
                if (section.cardType === 'common-pitfalls') {
                    html += '<div class="cc5-edit-field">';
                    html += '<label>' + getLabel('pitfallItems') + '</label>';
                    html += '<div class="cc5-edit-pitfalls-list">';
                    (section.pitfallItems || []).forEach(function (p, idx) {
                        html += '<div class="cc5-edit-pitfall-item" data-idx="' + idx + '" style="border:1px solid var(--border);border-radius:6px;padding:8px;margin-bottom:8px;">';
                        html += '<input type="text" class="cc5-edit-pitfall-text" placeholder="' + getLabel('pitfall') + '" value="' + escapeHtml(p.pitfall || '') + '" style="margin-bottom:4px;">';
                        html += '<input type="text" class="cc5-edit-pitfall-consequence" placeholder="' + getLabel('consequence') + '" value="' + escapeHtml(p.consequence || '') + '" style="margin-bottom:4px;">';
                        html += '<input type="text" class="cc5-edit-pitfall-correction" placeholder="' + getLabel('correction') + '" value="' + escapeHtml(p.correction || '') + '" style="margin-bottom:4px;">';
                        html += '<button type="button" class="cc5-edit-remove-pitfall" title="' + getLabel('remove') + '">' + getIcon('x') + ' Remove</button>';
                        html += '</div>';
                    });
                    html += '</div>';
                    html += '<button type="button" class="cc5-edit-add-btn cc5-edit-add-pitfall">' + getIcon('plus') + ' Add Pitfall</button>';
                    html += '</div>';
                }
                
                // -- v10.27 unified 7-card type editors --------------------------

                // hook-scenario / applied-scenario: title + per-sentence beat cards + optional highlight
                // v10.40: each sentence beat gets its own editable row (mirrors what's rendered)
                // v12.03: if section already has structured sceneParts[], show icon-picker editor
                //         instead of the flat beats editor so icons can actually be changed.
                if (section.cardType === 'hook-scenario' || section.cardType === 'applied-scenario') {
                    if (section.sceneParts && section.sceneParts.length) {
                        // -- Structured sceneParts[] editor (with icon pickers) --------------
                        html += '<div class="cc5-edit-field">';
                        html += '<label>' + getLabel('scenePartsLabel') + '</label>';
                        html += '<div class="cc5-edit-scene-parts-list">';
                        section.sceneParts.forEach(function (part, pidx) {
                            // v12.07 FIX: Pre-populate with resolved display icon so the
                            // picker matches what the card renders (pool default if no icon stored).
                            var _spPartText = part.text || part.content || part.description || '';
                            var _spDisplayIcon = part.icon || resolveScenePartIcon('', part.title || '', _spPartText, pidx, section.cardType, new Set());
                            html += '<div class="cc5-edit-scene-part-item" data-idx="' + pidx + '" style="border:1px solid var(--border);border-radius:6px;padding:8px;margin-bottom:8px;">';
                            html += '<input type="text" class="cc5-edit-sp-title" placeholder="' + getLabel('title') + '" value="' + escapeHtml(part.title || '') + '" style="margin-bottom:4px;">';
                            html += '<textarea class="cc5-edit-sp-text" rows="3" placeholder="' + getLabel('text') + '">' + escapeHtml(_spPartText) + '</textarea>';
                            html += self.renderIconPickerInput(_spDisplayIcon, 'cc5-edit-sp-icon', 'Icon (e.g. map-pin)');
                            html += '<button type="button" class="cc5-edit-remove-scene-part" title="' + getLabel('remove') + '">' + getIcon('x') + ' Remove</button>';
                            html += '</div>';
                        });
                        html += '</div>';
                        html += '<button type="button" class="cc5-edit-add-btn cc5-edit-add-scene-part">' + getIcon('plus') + ' Add Scene Part</button>';
                        html += '</div>';
                    } else {
                        // -- Legacy flat beats editor ----------------------------------------
                        var _hsRaw = (section.content || section.bodyText || section.description || '').replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
                        var _hsParts = _hsRaw.split(/\.\s+(?=[A-Z\u201C\u2018"'])/);
                        var _hsBeats = [];
                        for (var _hsi = 0; _hsi < _hsParts.length; _hsi++) {
                            var _hsS = _hsParts[_hsi].trim();
                            if (!_hsS) continue;
                            if (_hsi < _hsParts.length - 1 && !/[.!?]$/.test(_hsS)) _hsS += '.';
                            if (_hsS.length > 12) _hsBeats.push(_hsS);
                        }
                        if (_hsBeats.length < 2 && _hsRaw) _hsBeats = [_hsRaw];
                        html += '<div class="cc5-edit-field">';
                        html += '<label>' + getLabel('storyBeats') + ' <small style="font-weight:400;opacity:0.7;">' + getLabel('storyBeatsHint') + '</small></label>';
                        html += '<div class="cc5-edit-beats-list">';
                        _hsBeats.forEach(function (beat, idx) {
                            html += '<div class="cc5-edit-beat-item" data-idx="' + idx + '" style="display:flex;align-items:flex-start;gap:8px;margin-bottom:8px;">';
                            html += '<span style="min-width:22px;height:22px;border-radius:50%;background:var(--cc5-accent,#6366f1);color:#fff;font-size:0.75rem;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:8px;">' + (idx + 1) + '</span>';
                            html += '<textarea class="cc5-edit-beat-text" rows="2" style="flex:1;">' + escapeHtml(beat) + '</textarea>';
                            html += '<button type="button" class="cc5-edit-remove-beat" title="' + getLabel('removeBeat') + '" style="flex-shrink:0;margin-top:4px;">' + getIcon('x') + '</button>';
                            html += '</div>';
                        });
                        html += '</div>';
                        html += '<button type="button" class="cc5-edit-add-btn cc5-edit-add-beat">' + getIcon('plus') + ' Add Beat</button>';
                        html += '</div>';
                    }
                    html += '<div class="cc5-edit-field">';
                    html += '<label for="cc5-edit-unified-highlight">' + getLabel('highlightPullQuoteLabel') + '</label>';
                    html += '<textarea id="cc5-edit-unified-highlight" rows="2">' + escapeHtml(section.highlightText || '') + '</textarea>';
                    html += '</div>';
                }

                // concept-explainer: per-sentence insight chips + optional conceptItems grid
                // v10.40: each sentence chip and each concept item gets its own editable row
                if (section.cardType === 'concept-explainer') {
                    // Split content into chips using same logic as splitIntoBeats
                    var _ceRaw = (section.content || section.bodyText || section.description || '').replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
                    var _ceParts = _ceRaw.split(/\.\s+(?=[A-Z\u201C\u2018"'])/);
                    var _ceChips = [];
                    for (var _cei = 0; _cei < _ceParts.length; _cei++) {
                        var _ceS = _ceParts[_cei].trim();
                        if (!_ceS) continue;
                        if (_cei < _ceParts.length - 1 && !/[.!?]$/.test(_ceS)) _ceS += '.';
                        if (_ceS.length > 12) _ceChips.push(_ceS);
                    }
                    if (_ceChips.length < 2 && _ceRaw) _ceChips = [_ceRaw];

                    html += '<div class="cc5-edit-field">';
                    html += '<label>' + getLabel('insightSentencesLabel') + '</label>';
                    html += '<div class="cc5-edit-insights-list">';
                    _ceChips.forEach(function (chip, idx) {
                        html += '<div class="cc5-edit-insight-item" data-idx="' + idx + '" style="display:flex;align-items:flex-start;gap:8px;margin-bottom:8px;">';
                        html += '<span style="min-width:22px;height:22px;border-radius:50%;background:hsl(217deg 80% 55%);color:#fff;font-size:0.75rem;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:8px;">' + (idx + 1) + '</span>';
                        html += '<textarea class="cc5-edit-insight-text" rows="2" style="flex:1;">' + escapeHtml(chip) + '</textarea>';
                        html += '<button type="button" class="cc5-edit-remove-insight" title="' + getLabel('removeInsight') + '" style="flex-shrink:0;margin-top:4px;">' + getIcon('x') + '</button>';
                        html += '</div>';
                    });
                    html += '</div>';
                    html += '<button type="button" class="cc5-edit-add-btn cc5-edit-add-insight">' + getIcon('plus') + ' Add Insight</button>';
                    html += '</div>';

                    // conceptItems[] grid  -  each item has an icon, title, and description
                    html += '<div class="cc5-edit-field">';
                    html += '<label>' + getLabel('detailCardsLabel') + '</label>';
                    html += '<div class="cc5-edit-concept-items-list">';
                    (section.conceptItems || []).forEach(function (ci, idx) {
                        html += '<div class="cc5-edit-concept-item" data-idx="' + idx + '" style="border:1px solid var(--border);border-radius:6px;padding:8px;margin-bottom:8px;">';
                        html += '<div style="display:flex;gap:8px;margin-bottom:4px;">';
                        html += self.renderIconPickerInput(ci.icon || '', 'cc5-edit-ci-icon', 'Icon name');
                        html += '<input type="text" class="cc5-edit-ci-title" placeholder="' + getLabel('cardTitle') + '" value="' + escapeHtml(ci.title || '') + '" style="flex:1;">';
                        html += '</div>';
                        html += '<textarea class="cc5-edit-ci-description" rows="2" placeholder="' + getLabel('cardDescription') + '">' + escapeHtml(ci.description || '') + '</textarea>';
                        html += '<button type="button" class="cc5-edit-remove-concept-item" title="' + getLabel('removeCard') + '" style="margin-top:4px;">' + getIcon('x') + ' Remove</button>';
                        html += '</div>';
                    });
                    html += '</div>';
                    html += '<button type="button" class="cc5-edit-add-btn cc5-edit-add-concept-item">' + getIcon('plus') + ' Add Detail Card</button>';
                    html += '</div>';
                }

                // mental-model: title + steps[] {step, detail}
                if (section.cardType === 'mental-model') {
                    html += '<div class="cc5-edit-field">';
                    html += '<label>' + getLabel('steps') + ' <small style="font-weight:400;opacity:0.7;">' + getLabel('stepsIconHint') + '</small></label>';
                    html += '<div class="cc5-edit-mm-steps-list">';
                    (section.steps || []).forEach(function (s, idx) {
                        html += '<div class="cc5-edit-mm-step-item" data-idx="' + idx + '" style="border:1px solid var(--border);border-radius:6px;padding:8px;margin-bottom:8px;">';
                        html += '<div style="display:flex;gap:8px;margin-bottom:4px;">';
                        html += self.renderIconPickerInput(s.icon || '', 'cc5-edit-mm-step-icon', 'Icon (e.g. check)');
                        html += '<input type="text" class="cc5-edit-mm-step-title" placeholder="' + getLabel('stepTitle') + '" value="' + escapeHtml(s.step || s.action || s.title || '') + '" style="flex:1;">';
                        html += '</div>';
                        html += '<textarea class="cc5-edit-mm-step-detail" rows="2" placeholder="' + getLabel('stepDetail') + '">' + escapeHtml(s.detail || s.description || '') + '</textarea>';
                        html += '<button type="button" class="cc5-edit-remove-mm-step" title="' + getLabel('remove') + '">' + getIcon('x') + ' Remove</button>';
                        html += '</div>';
                    });
                    html += '</div>';
                    html += '<button type="button" class="cc5-edit-add-btn cc5-edit-add-mm-step">' + getIcon('plus') + ' Add Step</button>';
                    html += '</div>';
                }

                // decision-point: title + question + options[] {text, feedback, correct}
                if (section.cardType === 'decision-point') {
                    html += '<div class="cc5-edit-field">';
                    html += '<label for="cc5-edit-dp-question">' + getLabel('question') + '</label>';
                    html += '<textarea id="cc5-edit-dp-question" rows="3">' + escapeHtml(section.question || '') + '</textarea>';
                    html += '</div>';
                    html += '<div class="cc5-edit-field">';
                    html += '<label>' + getLabel('options') + '</label>';
                    html += '<div class="cc5-edit-dp-options-list">';
                    var dpLetters = ['A', 'B', 'C', 'D'];
                    (section.options || []).forEach(function (opt, idx) {
                        html += '<div class="cc5-edit-dp-option-item" data-idx="' + idx + '" style="border:1px solid var(--border);border-radius:6px;padding:8px;margin-bottom:8px;">';
                        html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">';
                        html += '<strong style="min-width:16px;">' + (dpLetters[idx] || (idx + 1)) + '</strong>';
                        html += '<input type="checkbox" class="cc5-edit-dp-correct" ' + (opt.correct ? 'checked' : '') + ' title="' + getLabel('markAsCorrect') + '">';
                        html += '<label style="font-size:0.8rem;margin:0;">' + getLabel('correctAnswerLabel') + '</label>';
                        html += '</div>';
                        html += '<input type="text" class="cc5-edit-dp-option-text" placeholder="' + getLabel('optionText') + '" value="' + escapeHtml(opt.text || '') + '" style="margin-bottom:4px;">';
                        html += '<textarea class="cc5-edit-dp-feedback" rows="2" placeholder="' + getLabel('feedbackForThisOption') + '">' + escapeHtml(opt.feedback || '') + '</textarea>';
                        html += '<button type="button" class="cc5-edit-remove-dp-option" title="' + getLabel('remove') + '">' + getIcon('x') + ' Remove</button>';
                        html += '</div>';
                    });
                    html += '</div>';
                    html += '<button type="button" class="cc5-edit-add-btn cc5-edit-add-dp-option">' + getIcon('plus') + ' Add Option</button>';
                    html += '</div>';
                }

                // mistakes: title + items[] {mistake, consequence, icon}
                if (section.cardType === 'mistakes') {
                    html += '<div class="cc5-edit-field">';
                    html += '<label>' + getLabel('mistakes') + '</label>';
                    html += '<div class="cc5-edit-mistakes-list">';
                    (section.items || []).forEach(function (item, idx) {
                        // v12.07 FIX: Pre-populate picker with resolved display icon, not just stored icon.
                        // When item.icon is empty the card renders a pool-default via step 1 of
                        // resolveScenePartIcon. Without this pre-population the picker showed an
                        // empty field while the card showed an icon, making saves appear silent.
                        var _mkDisplayIcon = item.icon || resolveScenePartIcon('', item.mistake || '', item.consequence || '', idx, 'mistakes', new Set());
                        html += '<div class="cc5-edit-mistake-item" data-idx="' + idx + '" style="border:1px solid var(--border);border-radius:6px;padding:8px;margin-bottom:8px;">';
                        html += '<input type="text" class="cc5-edit-mistake-text" placeholder="' + getLabel('mistake') + '" value="' + escapeHtml(item.mistake || '') + '" style="margin-bottom:4px;">';
                        html += '<textarea class="cc5-edit-mistake-consequence" rows="3" placeholder="' + getLabel('consequence') + '">' + escapeHtml(item.consequence || '') + '</textarea>';
                        html += self.renderIconPickerInput(_mkDisplayIcon, 'cc5-edit-mistake-icon', 'Icon (e.g. alert-triangle)');
                        html += '<button type="button" class="cc5-edit-remove-mistake" title="' + getLabel('remove') + '">' + getIcon('x') + ' Remove</button>';
                        html += '</div>';
                    });
                    html += '</div>';
                    html += '<button type="button" class="cc5-edit-add-btn cc5-edit-add-mistake">' + getIcon('plus') + ' Add Mistake</button>';
                    html += '</div>';
                }

                // competency-summary: title + goodItems[] (green) + badItems[] (red)  [v10.39]
                if (section.cardType === 'competency-summary') {
                    // "What Good Looks Like" column
                    html += '<div class="cc5-edit-field">';
                    html += '<label style="color:var(--cc5-green)">' + getLabel('whatGoodLooksLike') + '</label>';
                    html += '<div class="cc5-edit-good-items-list">';
                    (section.goodItems || []).forEach(function (item, idx) {
                        var text = typeof item === 'string' ? item : (item.text || '');
                        html += '<div class="cc5-edit-good-item" data-idx="' + idx + '">';
                        html += '<input type="text" class="cc5-edit-good-item-text" value="' + escapeHtml(text) + '">';
                        html += '<button type="button" class="cc5-edit-remove-good-item" title="' + getLabel('remove') + '">' + getIcon('x') + '</button>';
                        html += '</div>';
                    });
                    html += '</div>';
                    html += '<button type="button" class="cc5-edit-add-btn cc5-edit-add-good-item">' + getIcon('plus') + ' Add Good Item</button>';
                    html += '</div>';
                    // "What to Avoid" column
                    html += '<div class="cc5-edit-field">';
                    html += '<label style="color:var(--cc5-red)">' + getLabel('whatToAvoid') + '</label>';
                    html += '<div class="cc5-edit-bad-items-list">';
                    (section.badItems || []).forEach(function (item, idx) {
                        var text = typeof item === 'string' ? item : (item.text || '');
                        html += '<div class="cc5-edit-bad-item" data-idx="' + idx + '">';
                        html += '<input type="text" class="cc5-edit-bad-item-text" value="' + escapeHtml(text) + '">';
                        html += '<button type="button" class="cc5-edit-remove-bad-item" title="' + getLabel('remove') + '">' + getIcon('x') + '</button>';
                        html += '</div>';
                    });
                    html += '</div>';
                    html += '<button type="button" class="cc5-edit-add-btn cc5-edit-add-bad-item">' + getIcon('plus') + ' Add Bad Item</button>';
                    html += '</div>';
                }

                // -- end v10.27 unified editors -------------------------------

                html += '</div>';
            }
            
            // ===================================================================
            // END ROUTE-SPECIFIC CARD EDITING
            // ===================================================================

            // ===================================================================
            // v10.42: MULTI-CARD SECTION EDITING
            // For 7-card unified sections, section.cards[] holds each card with
            // its own cardType. Render a per-card editor for every card in the array.
            // ===================================================================
            if (section.cards && section.cards.length > 0) {
                var _mcHeadings = {
                    'hook-scenario':     'Card 1  -  Scene Setting',
                    'concept-explainer': 'Card 2  -  What This Means',
                    'mental-model':      'Card 3  -  How to Handle It',
                    'applied-scenario':  'Card 4  -  On the Job',
                    'mistakes':          'Card 5  -  Watch Out For',
                    'competency-summary':'Card 6  -  You Are Ready When You Can',
                    'decision-point':    'Card 7  -  Your Decision',
                    // v13.92: Topics-and-Text. Its decision-point is card 5, not card 7,
                    // but the map is keyed by type so the generic label would read
                    // "Card 7" on a four-card route. Named without a number instead.
                    'overview':             'Overview',
                    'key-concepts':         'Key Concepts',
                    'examples-application': 'Examples & Application',
                    'key-takeaways':        'Key Takeaways'
                };
                // v13.92: the four prose slots (plus the v13.91 names still in saved
                // modules). Their heading is fixed by the renderer and their narration is
                // the paragraphs read verbatim, so neither Card Title nor Voiceover Script
                // applies to them - both are replaced below with an explanation.
                var _PROSE_EDIT_TYPES = ['overview', 'key-concepts', 'examples-application', 'key-takeaways',
                    'orientation', 'foundations', 'mechanism', 'in-practice', 'boundaries'];
                var _PROSE_EDIT_HEADINGS = {
                    'overview': 'Overview', 'key-concepts': 'Key Concepts',
                    'examples-application': 'Examples & Application', 'key-takeaways': 'Key Takeaways',
                    'orientation': 'Overview', 'foundations': 'Key Concepts',
                    'mechanism': 'How It Works', 'in-practice': 'Examples & Application',
                    'boundaries': 'Key Takeaways'
                };
                html += '<div class="cc5-edit-field">';
                html += '<h4 class="cc5-edit-section-title" style="margin:12px 0 4px;font-size:0.95rem;font-weight:700;color:var(--cc5-accent,#6366f1);">' + getLabel('individualCardContent') + '</h4>';
                html += '<p style="font-size:0.8rem;opacity:0.7;margin:0 0 6px;">' + getLabel('editEachCardHint') + '</p>';
                html += '<p style="font-size:0.78rem;background:rgba(234,179,8,0.12);border:1px solid rgba(234,179,8,0.45);border-radius:4px;padding:6px 10px;margin:0 0 12px;">' + getLabel('movingCardsRegenVo') + '</p>';
                html += '</div>';

                section.cards.forEach(function (card, cardIdx) {
                    var ct = card.cardType || '';
                    var cardLabel = _mcHeadings[ct] || (ct || ('Card ' + (cardIdx + 1)));
                    var _isFirstCard = (cardIdx === 0);
                    var _isLastCard  = (cardIdx === section.cards.length - 1);
                    html += '<details class="cc5-edit-card-block" data-card-idx="' + cardIdx + '" data-card-type="' + escapeHtml(ct) + '" style="border:1px solid var(--border);border-radius:6px;margin-bottom:10px;">';
                    html += '<summary style="padding:8px 12px;cursor:pointer;user-select:none;display:flex;align-items:center;justify-content:space-between;gap:8px;">';
                    html += '<span style="font-weight:600;font-size:0.9rem;">' + escapeHtml(cardLabel) + '</span>';
                    html += '<span class="cc5-card-mgmt-btns" style="display:flex;gap:4px;flex-shrink:0;">';
                    html += '<button type="button" class="cc5-edit-card-move-up" title="' + getLabel('moveCardUp') + '"' + (_isFirstCard ? ' disabled' : '') + ' style="padding:1px 8px;font-size:0.85rem;line-height:1.7;border:1px solid var(--border);border-radius:4px;background:var(--background);color:var(--cc5-text);cursor:' + (_isFirstCard ? 'default' : 'pointer') + ';opacity:' + (_isFirstCard ? '0.3' : '1') + ';">\u2191</button>';
                    html += '<button type="button" class="cc5-edit-card-move-down" title="' + getLabel('moveCardDown') + '"' + (_isLastCard ? ' disabled' : '') + ' style="padding:1px 8px;font-size:0.85rem;line-height:1.7;border:1px solid var(--border);border-radius:4px;background:var(--background);color:var(--cc5-text);cursor:' + (_isLastCard ? 'default' : 'pointer') + ';opacity:' + (_isLastCard ? '0.3' : '1') + ';">\u2193</button>';
                    html += '<button type="button" class="cc5-edit-card-delete" title="' + getLabel('removeThisCard') + '" style="padding:1px 8px;font-size:0.85rem;line-height:1.7;border:1px solid rgba(220,38,38,0.45);border-radius:4px;background:var(--background);cursor:pointer;color:#dc2626;">\u00d7</button>';
                    html += '</span>';
                    html += '</summary>';
                    html += '<div style="padding:0 12px 12px;">';

                    var _isProseCard = _PROSE_EDIT_TYPES.indexOf(ct) !== -1;

                    if (_isProseCard) {
                        // v13.92: heading is fixed and narration is the paragraphs read
                        // verbatim. Both inputs are still emitted, hidden and empty, because
                        // the save collector reads .val() on them unconditionally.
                        html += '<div class="cc5-edit-field">';
                        html += '<label>' + getLabel('headingFixedForRoute') + '</label>';
                        html += '<input type="text" value="' + escapeHtml(_PROSE_EDIT_HEADINGS[ct] || '') + '" disabled>';
                        html += '<p style="font-size:0.75rem;opacity:0.7;margin:4px 0 0;">' + getLabel('fixedHeadingsNote') + '</p>';
                        html += '</div>';
                        html += '<input type="hidden" class="cc5-edit-card-title" value="">';
                        html += '<textarea class="cc5-edit-card-voiceover" style="display:none;"></textarea>';
                        html += '<p style="font-size:0.75rem;opacity:0.7;margin:0 0 10px;">' + getLabel('narrationVerbatimNote') + '</p>';
                    } else {
                        // Card title
                        html += '<div class="cc5-edit-field">';
                        html += '<label>' + getLabel('cardTitleLabel') + '</label>';
                        // v13.95.8 FIX-CC-CARDTITLE-BLANK: this box was blank on every
                        // unified card, and the honest reason is that unified cards have no
                        // title - only competency-summary's prompt asks for one, and the
                        // unified renderers print section.title, which nothing else assigns.
                        //
                        // It must NOT fall back to card.heading. On concept-explainer heading
                        // is the legislation or policy name, and on decision-point it is the
                        // question itself, which already has its own control further down this
                        // modal. Writing either into title makes cc-card-slots print it as an
                        // <h3> card title, duplicating the question on screen.
                        //
                        // So the field stays bound to card.title, and the placeholder tells the
                        // author what an empty box means rather than leaving them guessing.
                        html += '<input type="text" class="cc5-edit-card-title" value="' + escapeHtml(card.title || '') + '"'
                            + ' placeholder="' + escapeHtml(getLabel('cardTitleOptionalPlaceholder')) + '">';
                        html += '</div>';

                        // Card voiceover
                        html += '<div class="cc5-edit-field">';
                        html += '<label>' + getLabel('voiceoverScriptLabel') + '</label>';
                        html += '<textarea class="cc5-edit-card-voiceover" rows="3">' + escapeHtml(card.voiceoverText || '') + '</textarea>';
                        html += '</div>';
                    }

                    // -- v13.92 Topics-and-Text: paragraphs, plus the fields that feed
                    // the flip cards and the category sort ------------------------
                    if (_isProseCard) {
                        var _pParas = Array.isArray(card.paragraphs) ? card.paragraphs.slice() : [];
                        _pParas = _pParas.map(function (p) {
                            return typeof p === 'string' ? p : ((p && (p.text || p.paragraph || p.body)) || '');
                        });
                        while (_pParas.length < 2) { _pParas.push(''); }
                        html += '<div class="cc5-edit-field">';
                        html += '<label>' + getLabel('paragraphsLabel') + '</label>';
                        html += '<div class="cc5-edit-prose-paras">';
                        _pParas.forEach(function (para, pIdx) {
                            html += '<textarea class="cc5-edit-prose-para" rows="5" data-idx="' + pIdx + '" ' +
                                'placeholder="' + getLabel('paragraph') + ' ' + (pIdx + 1) + '" style="margin-bottom:8px;">' +
                                escapeHtml(para) + '</textarea>';
                        });
                        html += '</div>';
                        html += '<button type="button" class="cc5-edit-add-btn cc5-edit-add-prose-para">' + getIcon('plus') + ' Add Paragraph</button>';
                        html += '</div>';

                        if (ct === 'key-concepts' || ct === 'foundations') {
                            html += '<div class="cc5-edit-field">';
                            html += '<label>' + getLabel('keyTermsFlipLabel') + '</label>';
                            html += '<div class="cc5-edit-prose-terms-list">';
                            (card.keyTerms || []).forEach(function (t, tIdx) {
                                html += '<div class="cc5-edit-prose-term-item" data-idx="' + tIdx + '">';
                                html += '<input type="text" class="cc5-edit-prose-term-name" placeholder="' + getLabel('term') + '" value="' + escapeHtml(t.term || '') + '">';
                                html += '<input type="text" class="cc5-edit-prose-term-def" placeholder="' + getLabel('definition') + '" value="' + escapeHtml(t.definition || '') + '">';
                                html += '<button type="button" class="cc5-edit-remove-prose-term" title="' + getLabel('remove') + '">' + getIcon('x') + '</button>';
                                html += '</div>';
                            });
                            html += '</div>';
                            html += '<button type="button" class="cc5-edit-add-btn cc5-edit-add-prose-term">' + getIcon('plus') + ' Add Term</button>';
                            html += '</div>';
                        }

                        if (ct === 'key-takeaways' || ct === 'boundaries') {
                            [['good', 'Sound Understanding', card.goodItems], ['bad', 'Common Misconceptions', card.badItems]].forEach(function (pair) {
                                var kind = pair[0];
                                html += '<div class="cc5-edit-field">';
                                html += '<label>' + pair[1] + ' <small>' + getLabel('categorySortItemsHint') + '</small></label>';
                                html += '<div class="cc5-edit-prose-' + kind + '-list">';
                                (pair[2] || []).forEach(function (it, iIdx) {
                                    var txt = typeof it === 'string' ? it : ((it && it.text) || '');
                                    html += '<div class="cc5-edit-prose-' + kind + '-item" data-idx="' + iIdx + '">';
                                    html += '<input type="text" class="cc5-edit-prose-' + kind + '-text" placeholder="' + getLabel('statement') + '" value="' + escapeHtml(txt) + '">';
                                    html += '<button type="button" class="cc5-edit-remove-prose-item" title="' + getLabel('remove') + '">' + getIcon('x') + '</button>';
                                    html += '</div>';
                                });
                                html += '</div>';
                                html += '<button type="button" class="cc5-edit-add-btn cc5-edit-add-prose-' + kind + '">' + getIcon('plus') + ' Add Item</button>';
                                html += '</div>';
                            });
                        }
                    }

                    // -- hook-scenario / applied-scenario ----------------------
                    // v10.47: sceneParts[] (JSON format) takes priority over flat text beats (legacy).
                    // Structured editor: icon / title / text per part. Falls back to beat editor for
                    // legacy sections that never had a sceneParts[] array.
                    if (ct === 'hook-scenario' || ct === 'applied-scenario') {
                        if (card.sceneParts && card.sceneParts.length) {
                            // -- Structured sceneParts[] editor -----------------
                            html += '<div class="cc5-edit-field">';
                            html += '<label>' + getLabel('scenePartsLabel') + '</label>';
                            html += '<div class="cc5-edit-scene-parts-list">';
                            card.sceneParts.forEach(function (part, pidx) {
                                // v12.07 FIX: Pre-populate with resolved display icon (multi-card accordion path).
                                var _mcSpText = part.text || '';
                                var _mcSpDisplayIcon = part.icon || resolveScenePartIcon('', part.title || '', _mcSpText, pidx, ct, new Set());
                                html += '<div class="cc5-edit-scene-part-item" data-idx="' + pidx + '" style="border:1px solid var(--border);border-radius:6px;padding:8px;margin-bottom:8px;">';
                                html += '<div style="display:flex;gap:8px;margin-bottom:4px;">';
                                html += self.renderIconPickerInput(_mcSpDisplayIcon, 'cc5-edit-sp-icon', 'Icon (e.g. map-pin)');
                                html += '<input type="text" class="cc5-edit-sp-title" placeholder="' + getLabel('partTitle') + '" value="' + escapeHtml(part.title || '') + '" style="flex:1;">';
                                html += '</div>';
                                html += '<textarea class="cc5-edit-sp-text" rows="4" placeholder="' + getLabel('sceneText') + '">' + escapeHtml(_mcSpText) + '</textarea>';
                                html += '<button type="button" class="cc5-edit-remove-scene-part" title="' + getLabel('remove') + '">' + getIcon('x') + ' Remove</button>';
                                html += '</div>';
                            });
                            html += '</div>';
                            html += '<button type="button" class="cc5-edit-add-btn cc5-edit-add-scene-part">' + getIcon('plus') + ' Add Scene Part</button>';
                            html += '</div>';
                        } else {
                            // -- Legacy flat-text beat editor -------------------
                            var _mcRaw = (card.content || card.bodyText || card.description || '').replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
                            var _mcParts = _mcRaw.split(/\.\s+(?=[A-Z\u201C\u2018"'])/);
                            var _mcBeats = [];
                            for (var _mci = 0; _mci < _mcParts.length; _mci++) {
                                var _mcS = _mcParts[_mci].trim();
                                if (!_mcS) continue;
                                if (_mci < _mcParts.length - 1 && !/[.!?]$/.test(_mcS)) _mcS += '.';
                                if (_mcS.length > 12) _mcBeats.push(_mcS);
                            }
                            if (_mcBeats.length < 2 && _mcRaw) _mcBeats = [_mcRaw];
                            html += '<div class="cc5-edit-field">';
                            html += '<label>' + getLabel('storyBeats') + ' <small>' + getLabel('storyBeatsHint') + '</small></label>';
                            html += '<div class="cc5-edit-beats-list">';
                            _mcBeats.forEach(function (beat, bidx) {
                                html += '<div class="cc5-edit-beat-item" data-idx="' + bidx + '" style="display:flex;align-items:flex-start;gap:8px;margin-bottom:8px;">';
                                html += '<span style="min-width:22px;height:22px;border-radius:50%;background:var(--cc5-accent,#6366f1);color:#fff;font-size:0.75rem;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:8px;">' + (bidx + 1) + '</span>';
                                html += '<textarea class="cc5-edit-beat-text" rows="2" style="flex:1;">' + escapeHtml(beat) + '</textarea>';
                                html += '<button type="button" class="cc5-edit-remove-beat" title="' + getLabel('removeBeat') + '" style="flex-shrink:0;margin-top:4px;">' + getIcon('x') + '</button>';
                                html += '</div>';
                            });
                            html += '</div>';
                            html += '<button type="button" class="cc5-edit-add-btn cc5-edit-add-beat">' + getIcon('plus') + ' Add Beat</button>';
                            html += '</div>';
                        }
                        html += '<div class="cc5-edit-field">';
                        html += '<label>' + getLabel('highlightPullQuotePlainLabel') + '</label>';
                        html += '<textarea class="cc5-edit-card-highlight" rows="2">' + escapeHtml(card.highlightText || '') + '</textarea>';
                        html += '</div>';
                    }

                    // -- concept-explainer -------------------------------------
                    // v10.47: replaced flat "insight sentences" + conceptItems[] with
                    // conceptInsights[] (icon/title/text)  -  matches cc-card-slots.js rendering
                    // and buildFullVoiceoverText. conceptItems was a non-existent field alias.
                    if (ct === 'concept-explainer') {
                        html += '<div class="cc5-edit-field">';
                        html += '<label>' + getLabel('conceptInsightsLabel') + '</label>';
                        html += '<div class="cc5-edit-concept-insights-list">';
                        (card.conceptInsights || []).forEach(function (ci, ciidx) {
                            html += '<div class="cc5-edit-concept-insight-item" data-idx="' + ciidx + '" style="border:1px solid var(--border);border-radius:6px;padding:8px;margin-bottom:8px;">';
                            html += '<div style="display:flex;gap:8px;margin-bottom:4px;">';
                            html += self.renderIconPickerInput(ci.icon || '', 'cc5-edit-cins-icon', 'Icon (e.g. lightbulb)');
                            html += '<input type="text" class="cc5-edit-cins-title" placeholder="' + getLabel('insightTitle') + '" value="' + escapeHtml(ci.title || '') + '" style="flex:1;">';
                            html += '</div>';
                            html += '<textarea class="cc5-edit-cins-text" rows="3" placeholder="' + getLabel('insightText') + '">' + escapeHtml(ci.text || '') + '</textarea>';
                            html += '<button type="button" class="cc5-edit-remove-concept-insight" title="' + getLabel('remove') + '">' + getIcon('x') + ' Remove</button>';
                            html += '</div>';
                        });
                        html += '</div>';
                        html += '<button type="button" class="cc5-edit-add-btn cc5-edit-add-concept-insight">' + getIcon('plus') + ' Add Concept Insight</button>';
                        html += '</div>';
                    }

                    // -- mental-model ------------------------------------------
                    // v10.49: added step.icon field  -  rendered as icon-in-circle when present,
                    // else step number shown. Was missing from editor causing icon to be lost on save.
                    if (ct === 'mental-model') {
                        html += '<div class="cc5-edit-field">';
                        html += '<label>' + getLabel('steps') + ' <small>' + getLabel('stepsIconHint') + '</small></label>';
                        html += '<div class="cc5-edit-mm-steps-list">';
                        (card.steps || []).forEach(function (s, sidx) {
                            html += '<div class="cc5-edit-mm-step-item" data-idx="' + sidx + '" style="border:1px solid var(--border);border-radius:6px;padding:8px;margin-bottom:8px;">';
                            html += '<div style="display:flex;gap:8px;margin-bottom:4px;">';
                            html += self.renderIconPickerInput(s.icon || '', 'cc5-edit-mm-step-icon', 'Icon (e.g. check)');
                            html += '<input type="text" class="cc5-edit-mm-step-title" placeholder="' + getLabel('stepTitle') + '" value="' + escapeHtml(s.step || s.action || s.title || '') + '" style="flex:1;">';
                            html += '</div>';
                            html += '<textarea class="cc5-edit-mm-step-detail" rows="2" placeholder="' + getLabel('stepDetail') + '">' + escapeHtml(s.detail || s.description || '') + '</textarea>';
                            html += '<button type="button" class="cc5-edit-remove-mm-step" title="' + getLabel('remove') + '">' + getIcon('x') + ' Remove</button>';
                            html += '</div>';
                        });
                        html += '</div>';
                        html += '<button type="button" class="cc5-edit-add-btn cc5-edit-add-mm-step">' + getIcon('plus') + ' Add Step</button>';
                        html += '</div>';
                    }

                    // -- decision-point ----------------------------------------
                    if (ct === 'decision-point') {
                        html += '<div class="cc5-edit-field">';
                        html += '<label>' + getLabel('question') + '</label>';
                        html += '<textarea class="cc5-edit-card-dp-question" rows="3">' + escapeHtml(card.question || '') + '</textarea>';
                        html += '</div>';
                        html += '<div class="cc5-edit-field">';
                        html += '<label>' + getLabel('options') + '</label>';
                        html += '<div class="cc5-edit-dp-options-list">';
                        var _mcDpLetters = ['A','B','C','D'];
                        (card.options || []).forEach(function (opt, oidx) {
                            html += '<div class="cc5-edit-dp-option-item" data-idx="' + oidx + '" style="border:1px solid var(--border);border-radius:6px;padding:8px;margin-bottom:8px;">';
                            html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">';
                            html += '<strong style="min-width:16px;">' + (_mcDpLetters[oidx] || (oidx + 1)) + '</strong>';
                            html += '<input type="checkbox" class="cc5-edit-dp-correct" ' + (opt.correct ? 'checked' : '') + ' title="' + getLabel('markAsCorrect') + '">';
                            html += '<label style="font-size:0.8rem;margin:0;">' + getLabel('correctAnswerLabel') + '</label>';
                            html += '</div>';
                            html += '<input type="text" class="cc5-edit-dp-option-text" placeholder="' + getLabel('optionText') + '" value="' + escapeHtml(opt.text || '') + '" style="margin-bottom:4px;">';
                            html += '<textarea class="cc5-edit-dp-feedback" rows="2" placeholder="' + getLabel('feedbackForThisOption') + '">' + escapeHtml(opt.feedback || '') + '</textarea>';
                            html += '<button type="button" class="cc5-edit-remove-dp-option" title="' + getLabel('remove') + '">' + getIcon('x') + ' Remove</button>';
                            html += '</div>';
                        });
                        html += '</div>';
                        html += '<button type="button" class="cc5-edit-add-btn cc5-edit-add-dp-option">' + getIcon('plus') + ' Add Option</button>';
                        html += '</div>';
                    }

                    // -- mistakes ----------------------------------------------
                    if (ct === 'mistakes') {
                        html += '<div class="cc5-edit-field">';
                        html += '<label>' + getLabel('mistakes') + '</label>';
                        html += '<div class="cc5-edit-mistakes-list">';
                        (card.items || []).forEach(function (item, midx) {
                            // v12.07 FIX: Pre-populate with resolved display icon (mirrors single-section fix).
                            var _mkDisplayIcon = item.icon || resolveScenePartIcon('', item.mistake || '', item.consequence || '', midx, 'mistakes', new Set());
                            html += '<div class="cc5-edit-mistake-item" data-idx="' + midx + '" style="border:1px solid var(--border);border-radius:6px;padding:8px;margin-bottom:8px;">';
                            html += '<input type="text" class="cc5-edit-mistake-text" placeholder="' + getLabel('mistake') + '" value="' + escapeHtml(item.mistake || '') + '" style="margin-bottom:4px;">';
                            html += '<textarea class="cc5-edit-mistake-consequence" rows="3" placeholder="' + getLabel('consequence') + '">' + escapeHtml(item.consequence || '') + '</textarea>';
                            html += self.renderIconPickerInput(_mkDisplayIcon, 'cc5-edit-mistake-icon', 'Icon (e.g. alert-triangle)');
                            html += '<button type="button" class="cc5-edit-remove-mistake" title="' + getLabel('remove') + '">' + getIcon('x') + ' Remove</button>';
                            html += '</div>';
                        });
                        html += '</div>';
                        html += '<button type="button" class="cc5-edit-add-btn cc5-edit-add-mistake">' + getIcon('plus') + ' Add Mistake</button>';
                        html += '</div>';
                    }

                    // -- competency-summary ------------------------------------
                    if (ct === 'competency-summary') {
                        html += '<div class="cc5-edit-field">';
                        html += '<label style="color:var(--cc5-green,#10b981)">' + getLabel('whatGoodLooksLike') + '</label>';
                        html += '<div class="cc5-edit-good-items-list">';
                        (card.goodItems || []).forEach(function (item, giidx) {
                            var gtext = typeof item === 'string' ? item : (item.text || '');
                            html += '<div class="cc5-edit-good-item" data-idx="' + giidx + '">';
                            html += '<input type="text" class="cc5-edit-good-item-text" value="' + escapeHtml(gtext) + '">';
                            html += '<button type="button" class="cc5-edit-remove-good-item" title="' + getLabel('remove') + '">' + getIcon('x') + '</button>';
                            html += '</div>';
                        });
                        html += '</div>';
                        html += '<button type="button" class="cc5-edit-add-btn cc5-edit-add-good-item">' + getIcon('plus') + ' Add Good Item</button>';
                        html += '</div>';
                        html += '<div class="cc5-edit-field">';
                        html += '<label style="color:var(--cc5-red,#ef4444)">' + getLabel('whatToAvoid') + '</label>';
                        html += '<div class="cc5-edit-bad-items-list">';
                        (card.badItems || []).forEach(function (item, biidx) {
                            var btext = typeof item === 'string' ? item : (item.text || '');
                            html += '<div class="cc5-edit-bad-item" data-idx="' + biidx + '">';
                            html += '<input type="text" class="cc5-edit-bad-item-text" value="' + escapeHtml(btext) + '">';
                            html += '<button type="button" class="cc5-edit-remove-bad-item" title="' + getLabel('remove') + '">' + getIcon('x') + '</button>';
                            html += '</div>';
                        });
                        html += '</div>';
                        html += '<button type="button" class="cc5-edit-add-btn cc5-edit-add-bad-item">' + getIcon('plus') + ' Add Item to Avoid</button>';
                        html += '</div>';
                    }

                    html += '</div>'; // inner padding div
                    html += '</details>'; // .cc5-edit-card-block
                });
            }
            // -- end v10.42 multi-card section editing -------------------------

            // Voiceover regeneration option
            html += '<div class="cc5-edit-field cc5-edit-voiceover-option">';
            html += '<label class="cc5-edit-checkbox-label">';
            html += '<input type="checkbox" id="cc5-edit-regenerate-voiceover">';
            html += '<span>' + getLabel('voiceoverCredits') + '</span>';
            html += '</label>';
            html += '</div>';
            
            html += '</div>'; // .cc5-edit-modal-body
            
            html += '<div class="cc5-edit-modal-footer">';
            html += '<button type="button" class="cc5-edit-modal-cancel cc5-edit-modal-close">' + getIcon('x') + ' ' + getLabel('cancel') + '</button>';
            html += '<button type="button" class="cc5-edit-modal-save">' + getIcon('save') + ' ' + getLabel('saveChanges') + '</button>';
            html += '</div>';
            
            html += '</div>'; // .cc5-edit-modal
            html += '</div>'; // .cc5-edit-modal-overlay
            
            $(document.body).append(html);
            
            // WCAG 2.1 AA: Focus management - focus first interactive element
            // v10.54: Fixed  -  was incorrectly targeting .cc5-settings-modal-close
            setTimeout(function () {
                $('.cc5-edit-modal-close').first().focus();
            }, 100);
        },

        /**
         * Render edit list item (v6.5.0)
         */
        // v7.9.70: Fixed renderEditListItem - was missing handlers for keyfact/do/dont types
        renderEditListItem: function (type, idx, data) {
            var html = '<div class="cc5-edit-list-item" data-type="' + type + '">';
            
            if (type === 'requirement') {
                // Requirements can be string or object with .text/.requirement
                var reqVal = typeof data === 'string' ? data : (data.text || data.requirement || '');
                html += '<input type="text" class="cc5-edit-item-text" value="' + escapeHtml(reqVal) + '" placeholder="' + getLabel('requirementPlaceholder') + '">';
            } else if (type === 'do') {
                // Do's are strings
                html += '<input type="text" class="cc5-edit-item-text" value="' + escapeHtml(data || '') + '" placeholder="' + getLabel('doPlaceholder') + '">';
            } else if (type === 'dont') {
                // Don'ts are strings
                html += '<input type="text" class="cc5-edit-item-text" value="' + escapeHtml(data || '') + '" placeholder="' + getLabel('dontPlaceholder') + '">';
            } else if (type === 'keyfact') {
                // Key facts are strings
                html += '<input type="text" class="cc5-edit-item-text" value="' + escapeHtml(data || '') + '" placeholder="' + (getLabel('keyFactPlaceholder') || 'Enter a key fact...') + '">';
            } else {
                // Default fallback for any other type
                html += '<input type="text" class="cc5-edit-item-text" value="' + escapeHtml(typeof data === 'string' ? data : (data.text || '')) + '" placeholder="' + getLabel('enterText') + '">';
            }
            
            html += '<button type="button" class="cc5-edit-delete-item" title="' + getLabel('remove') + '" aria-label="' + getLabel('deleteItem') + '">' + getIcon('x') + '</button>';
            html += '</div>';
            
            return html;
        },

        /**
         * Save slide edit (v6.5.0)
         */
        saveSlideEdit: function () {
            var self = this;
            var modal = $('.cc5-edit-modal');
            var saveBtn = modal.find('.cc5-edit-modal-save');
            
            saveBtn.prop('disabled', true).addClass('cc5-saving');
            
            var topicId = $('#cc5-edit-topic-id').val();
            var sectionId = $('#cc5-edit-section-id').val();
            var title = $('#cc5-edit-title').val().trim();
            var regenerateVoiceover = $('#cc5-edit-regenerate-voiceover').is(':checked');

            // v10.63: All fields below preserve the existing section value when their UI element
            // is absent (top-section legacy fields were removed from showEditModal). This prevents
            // silent data loss when fields are no longer rendered in the modal.
            var _es = self._editingSection || {};
            var _esc = _es.scenario || {};

            // description / voiceoverText  -  preserve existing when not in modal
            var description = $('#cc5-edit-description').length
                ? $('#cc5-edit-description').val().trim()
                : (_es.description || '');
            var introduction = $('#cc5-edit-introduction').length
                ? ($('#cc5-edit-introduction').val() || '').trim()
                : (_es.voiceoverText || '');

            // Accent card values  -  preserve existing when not in modal
            var editKeyTakeaway = $('#cc5-edit-keytakeaway').length
                ? ($('#cc5-edit-keytakeaway').val() || '').trim()
                : (_es.keyTakeaway !== undefined ? _es.keyTakeaway : undefined);
            var editProTip = $('#cc5-edit-protip').length
                ? ($('#cc5-edit-protip').val() || '').trim()
                : (_es.proTip !== undefined ? _es.proTip : undefined);
            var editKeyInfo = $('#cc5-edit-keyinfo').length
                ? ($('#cc5-edit-keyinfo').val() || '').trim()
                : (_es.keyInfo !== undefined ? (_es.keyInfo || _es.didYouKnow || '') : undefined);
            var editExpertInsight = $('#cc5-edit-expertinsight').length
                ? ($('#cc5-edit-expertinsight').val() || '').trim()
                : (_es.expertInsight !== undefined ? _es.expertInsight : undefined);

            // keyFacts  -  preserve existing (UI was removed at v8.4.6, was silently wiping to [])
            var keyFacts = $('.cc5-edit-keyfacts-list').length
                ? (function () {
                    var kf = [];
                    $('.cc5-edit-keyfacts-list .cc5-edit-list-item').each(function () {
                        var t = $(this).find('.cc5-edit-item-text').val().trim();
                        if (t) kf.push(t);
                    });
                    return kf;
                }())
                : (_es.keyFacts || []);

            // Requirements  -  preserve existing when list not rendered
            var requirements = [];
            if ($('.cc5-edit-requirements-list').length) {
                $('.cc5-edit-requirements-list .cc5-edit-list-item').each(function () {
                    var text = $(this).find('.cc5-edit-item-text').val().trim();
                    if (text) requirements.push({ icon: 'check-circle', text: text });
                });
            } else {
                requirements = _es.requirements || [];
            }

            // Do list  -  preserve existing when list not rendered
            var doList = [];
            if ($('.cc5-edit-do-list').length) {
                $('.cc5-edit-do-list .cc5-edit-list-item').each(function () {
                    var text = $(this).find('.cc5-edit-item-text').val().trim();
                    if (text) doList.push(text);
                });
            } else {
                doList = _es.positiveList || _es.doList || [];
            }

            // Dont list  -  preserve existing when list not rendered
            var dontList = [];
            if ($('.cc5-edit-dont-list').length) {
                $('.cc5-edit-dont-list .cc5-edit-list-item').each(function () {
                    var text = $(this).find('.cc5-edit-item-text').val().trim();
                    if (text) dontList.push(text);
                });
            } else {
                dontList = _es.negativeList || _es.dontList || [];
            }

            // Terminology  -  preserve existing when terminology editor not rendered
            var terminology = [];
            if ($('.cc5-edit-knowledge-terminology').length) {
                $('.cc5-edit-knowledge-terminology .cc5-edit-term-item').each(function () {
                    var term = $(this).find('.cc5-edit-term-name').val().trim();
                    var definition = $(this).find('.cc5-edit-term-definition').val().trim();
                    if (term) terminology.push({ term: term, definition: definition });
                });
            } else {
                terminology = _es.terminology || [];
            }

            // Scenario fields  -  preserve existing when scenario UI not rendered
            var scenarioTitle = $('#cc5-edit-scenario-title').length
                ? ($('#cc5-edit-scenario-title').val() || '').trim()
                : (_esc.title || _esc.scenarioTitle || undefined);
            var scenarioRole = $('#cc5-edit-scenario-role').length
                ? ($('#cc5-edit-scenario-role').val() || '').trim()
                : (_esc.role || undefined);
            var scenarioContext = $('#cc5-edit-scenario-context').length
                ? ($('#cc5-edit-scenario-context').val() || '').trim()
                : (_esc.context || undefined);
            var scenarioComplication = $('#cc5-edit-scenario-complication').length
                ? ($('#cc5-edit-scenario-complication').val() || '').trim()
                : (_esc.complication || undefined);
            var mmNameEl = $('#cc5-edit-mentalmodel-name');
            var mmPrincipleEl = $('#cc5-edit-mentalmodel-principle');
            var scenarioMentalModel;
            if (mmNameEl.length || mmPrincipleEl.length) {
                var mmName = (mmNameEl.val() || '').trim();
                var mmPrinciple = (mmPrincipleEl.val() || '').trim();
                scenarioMentalModel = (mmName || mmPrinciple) ? { name: mmName, principle: mmPrinciple } : null;
            } else {
                scenarioMentalModel = _esc.mentalModel !== undefined ? _esc.mentalModel : undefined;
            }
            var predQuestionEl = $('#cc5-edit-prediction-question');
            var scenarioPrediction;
            if (predQuestionEl.length) {
                var predQuestion = (predQuestionEl.val() || '').trim();
                var predOptions = [];
                $('.cc5-edit-prediction-option').each(function () {
                    var optVal = $(this).val().trim();
                    if (optVal) predOptions.push(optVal);
                });
                scenarioPrediction = (predQuestion || predOptions.length > 0) ? { question: predQuestion, options: predOptions } : null;
            } else {
                scenarioPrediction = _esc.predictionPrompt !== undefined ? _esc.predictionPrompt : undefined;
            }
            // Legacy flat-text scenario field (no UI since v8.4.1)  -  always empty, server ignores
            var scenario = '';
            
            
            if (!title) {
                Notification.addNotification({ message: getLabel('titleRequired'), type: 'error' });
                saveBtn.prop('disabled', false).removeClass('cc5-saving');
                return;
            }
            
            // v9.87: Collect route-card-specific fields into cardData JSON blob
            // All 18 card types now covered  -  each field maps 1:1 with the edit modal above
            // v10.54 CRITICAL FIX: `section` was never declared in this function  -  only in
            // showEditModal (a separate prototype method). Accessing section.cardType threw
            // ReferenceError: section is not defined, crashing saveSlideEdit before the AJAX
            // call at line 10742 could ever fire. Fixed by storing on self._editingSection.
            var section = self._editingSection || {};
            var cardData = {};
            if (section.cardType) {
                var editHeadingVal = modal.find('#cc5-edit-card-heading').val();
                var editBodyTextVal = modal.find('#cc5-edit-card-bodytext').val();
                if (editHeadingVal !== undefined) cardData.heading = editHeadingVal;
                if (editBodyTextVal !== undefined) cardData.bodyText = editBodyTextVal;
                var editContextVal = modal.find('#cc5-edit-card-context').val();
                var editConsequenceVal = modal.find('#cc5-edit-card-consequence').val();
                if (editContextVal !== undefined) cardData.context = editContextVal;
                if (editConsequenceVal !== undefined) cardData.consequence = editConsequenceVal;
                // competence-standard
                if (section.cardType === 'competence-standard') {
                    var stdItemsArr = [];
                    modal.find('.cc5-edit-standard-text').each(function () { var t=$(this).val().trim(); if(t) stdItemsArr.push(t); });
                    cardData.standardItems = stdItemsArr;
                }
                // common-errors
                if (section.cardType === 'common-errors') {
                    var errItemsArr = [];
                    modal.find('.cc5-edit-error-item').each(function () {
                        var err=$(this).find('.cc5-edit-error-text').val().trim();
                        var cons=$(this).find('.cc5-edit-error-consequence').val().trim();
                        if(err) errItemsArr.push({error:err, consequence:cons});
                    });
                    cardData.errorItems = errItemsArr;
                }
                // action-breakdown
                if (section.cardType === 'action-breakdown') {
                    var actItemsArr = [];
                    modal.find('.cc5-edit-action-item').each(function () {
                        var h=$(this).find('.cc5-edit-action-heading').val().trim();
                        var br=$(this).find('.cc5-edit-action-bullets').val().trim();
                        var bl=br?br.split('\n').filter(function (b){return b.trim();}):[]; 
                        if(h||bl.length) actItemsArr.push({heading:h, bullets:bl});
                    });
                    cardData.actions = actItemsArr;
                }
                // performance-anchor
                if (section.cardType === 'performance-anchor') {
                    cardData.pcStatement = modal.find('#cc5-edit-pc-statement').val() || '';
                    cardData.elementText = modal.find('#cc5-edit-element-text').val() || '';
                    cardData.summaryLine = modal.find('#cc5-edit-summary-line').val() || '';
                }
                // plain-english
                if (section.cardType === 'plain-english') {
                    var kpArr = [];
                    modal.find('.cc5-edit-keypoint-text').each(function () { var t=$(this).val().trim(); if(t) kpArr.push(t); });
                    cardData.keyPoints = kpArr;
                }
                // concept-anchor
                if (section.cardType === 'concept-anchor') {
                    cardData.conceptDefinition = modal.find('#cc5-edit-concept-definition').val() || '';
                    cardData.significance = modal.find('#cc5-edit-significance').val() || '';
                    var cktArr = [];
                    modal.find('.cc5-edit-card-keyterm-item').each(function () {
                        var tn=$(this).find('.cc5-edit-cardterm-name').val().trim();
                        var td=$(this).find('.cc5-edit-cardterm-def').val().trim();
                        if(tn) cktArr.push({term:tn, definition:td});
                    });
                    cardData.keyTerms = cktArr;
                }
                // theoretical-framework
                if (section.cardType === 'theoretical-framework') {
                    var fwArr = [];
                    modal.find('.cc5-edit-framework-item').each(function () {
                        var fn=$(this).find('.cc5-edit-fw-name').val().trim();
                        var fo=$(this).find('.cc5-edit-fw-originator').val().trim();
                        var fp=$(this).find('.cc5-edit-fw-principle').val().trim();
                        var fa=$(this).find('.cc5-edit-fw-application').val().trim();
                        var fl=$(this).find('.cc5-edit-fw-limitation').val().trim();
                        if(fn||fp) fwArr.push({name:fn, originator:fo, principle:fp, application:fa, limitation:fl});
                    });
                    cardData.frameworks = fwArr;
                }
                // analytical-lens
                if (section.cardType === 'analytical-lens') {
                    var cogArr = [];
                    modal.find('.cc5-edit-cogconsideration-text').each(function () { var t=$(this).val().trim(); if(t) cogArr.push(t); });
                    cardData.cognitiveConsiderations = cogArr;
                    var apArr = [];
                    modal.find('.cc5-edit-analysisprompt-text').each(function () { var t=$(this).val().trim(); if(t) apArr.push(t); });
                    cardData.analysisPrompts = apArr;
                }
                // ethics-considerations
                if (section.cardType === 'ethics-considerations') {
                    var ethArr = [];
                    modal.find('.cc5-edit-ethicsconsideration-item').each(function () {
                        var dim=$(this).find('.cc5-edit-ethicsdim-text').val().trim();
                        var desc=$(this).find('.cc5-edit-ethicsdesc-text').val().trim();
                        if(dim||desc) ethArr.push({dimension:dim, description:desc});
                    });
                    cardData.considerations = ethArr;
                }
                // case-study-1 / case-study-2
                if (section.cardType === 'case-study-1' || section.cardType === 'case-study-2') {
                    var csApArr = [];
                    modal.find('.cc5-edit-casestudyprompt-text').each(function () { var t=$(this).val().trim(); if(t) csApArr.push(t); });
                    cardData.analysisPrompts = csApArr;
                    cardData.keyInsight = modal.find('#cc5-edit-key-insight').val() || '';
                    cardData.criticalReflection = modal.find('#cc5-edit-critical-reflection').val() || '';
                }
                // business-impact
                if (section.cardType === 'business-impact') {
                    cardData.impactStatement = modal.find('#cc5-edit-impact-statement').val() || '';
                    var kmArr = [];
                    modal.find('.cc5-edit-keymetric-text').each(function () { var t=$(this).val().trim(); if(t) kmArr.push(t); });
                    cardData.keyMetrics = kmArr;
                    var consqArr = [];
                    modal.find('.cc5-edit-consequence-text').each(function () { var t=$(this).val().trim(); if(t) consqArr.push(t); });
                    cardData.consequences = consqArr;
                }
                // action-framework
                if (section.cardType === 'action-framework') {
                    var stepsArr = [];
                    modal.find('.cc5-edit-actionstep-item').each(function () {
                        var act=$(this).find('.cc5-edit-step-action').val().trim();
                        var det=$(this).find('.cc5-edit-step-detail').val().trim();
                        var tf=$(this).find('.cc5-edit-step-timeframe').val().trim();
                        if(act) stepsArr.push({action:act, detail:det, timeframe:tf});
                    });
                    cardData.steps = stepsArr;
                }
                // risk-card
                if (section.cardType === 'risk-card') {
                    var risksArr = [];
                    modal.find('.cc5-edit-risk-item').each(function () {
                        var rt=$(this).find('.cc5-edit-risk-text').val().trim();
                        var rl=$(this).find('.cc5-edit-risk-likelihood').val().trim();
                        var ri=$(this).find('.cc5-edit-risk-impact').val().trim();
                        var rc=$(this).find('.cc5-edit-risk-consequence').val().trim();
                        var rm=$(this).find('.cc5-edit-risk-mitigation').val().trim();
                        if(rt) risksArr.push({risk:rt, likelihood:rl, impact:ri, consequence:rc, mitigation:rm});
                    });
                    cardData.risks = risksArr;
                }
                // policy-alignment
                if (section.cardType === 'policy-alignment') {
                    var polArr = [];
                    modal.find('.cc5-edit-policyitem-item').each(function () {
                        var pt=$(this).find('.cc5-edit-policy-text').val().trim();
                        var pr=$(this).find('.cc5-edit-policy-requirement').val().trim();
                        var pc=$(this).find('.cc5-edit-policy-consequence').val().trim();
                        if(pt) polArr.push({policy:pt, requirement:pr, consequence:pc});
                    });
                    cardData.policyItems = polArr;
                }
                // scenario-1 / scenario-2 (optimisationTips + optional PD reflection)
                if (section.cardType === 'scenario-1' || section.cardType === 'scenario-2') {
                    var otArr = [];
                    modal.find('.cc5-edit-opttip-text').each(function () { var t=$(this).val().trim(); if(t) otArr.push(t); });
                    cardData.optimisationTips = otArr;
                    if (modal.find('#cc5-edit-turning-point').length) {
                        cardData.turningPoint = modal.find('#cc5-edit-turning-point').val() || '';
                        var rq = modal.find('#cc5-edit-reflection-question').val() || '';
                        var raRaw = modal.find('#cc5-edit-reflection-answers').val() || '';
                        var raSplit = raRaw ? raRaw.split('\n').filter(function (l){return l.trim();}) : [];
                        cardData.reflection = {question: rq, sampleAnswers: raSplit};
                    }
                }
                // skill-anchor
                if (section.cardType === 'skill-anchor') {
                    cardData.skillStatement = modal.find('#cc5-edit-skill-statement').val() || '';
                    cardData.relevance = modal.find('#cc5-edit-relevance').val() || '';
                    var kiArr = [];
                    modal.find('.cc5-edit-keyindicator-text').each(function () { var t=$(this).val().trim(); if(t) kiArr.push(t); });
                    cardData.keyIndicators = kiArr;
                }
                // core-framework
                if (section.cardType === 'core-framework') {
                    cardData.keyPrinciple = modal.find('#cc5-edit-key-principle').val() || '';
                    var fsArr = [];
                    modal.find('.cc5-edit-frameworkstep-item').each(function () {
                        var st=$(this).find('.cc5-edit-fwstep-step').val().trim();
                        var ex=$(this).find('.cc5-edit-fwstep-explanation').val().trim();
                        var eg=$(this).find('.cc5-edit-fwstep-example').val().trim();
                        if(st) fsArr.push({step:st, explanation:ex, example:eg});
                    });
                    cardData.frameworkSteps = fsArr;
                }
                // application-guide
                if (section.cardType === 'application-guide') {
                    var appArr = [];
                    modal.find('.cc5-edit-application-item').each(function () {
                        var sit=$(this).find('.cc5-edit-app-situation').val().trim();
                        var act=$(this).find('.cc5-edit-app-action').val().trim();
                        var rat=$(this).find('.cc5-edit-app-rationale').val().trim();
                        if(sit||act) appArr.push({situation:sit, action:act, rationale:rat});
                    });
                    cardData.applications = appArr;
                }
                // common-pitfalls
                if (section.cardType === 'common-pitfalls') {
                    var pfArr = [];
                    modal.find('.cc5-edit-pitfall-item').each(function () {
                        var pf=$(this).find('.cc5-edit-pitfall-text').val().trim();
                        var pc=$(this).find('.cc5-edit-pitfall-consequence').val().trim();
                        var pcr=$(this).find('.cc5-edit-pitfall-correction').val().trim();
                        if(pf) pfArr.push({pitfall:pf, consequence:pc, correction:pcr});
                    });
                    cardData.pitfallItems = pfArr;
                }

                // -- v10.27 unified 7-card save logic -------------------------
                // v10.40: hook/applied  -  collect individual beat textareas, rejoin into content string
                if (section.cardType === 'hook-scenario' || section.cardType === 'applied-scenario') {
                    // v12.03: structured sceneParts[] editor takes priority; flat beats is legacy fallback
                    var _spItems = modal.find('.cc5-edit-scene-part-item');
                    if (_spItems.length) {
                        var _ssparts = [];
                        _spItems.each(function () {
                            var ic = $(this).find('.cc5-edit-sp-icon').val().trim();
                            var ti = $(this).find('.cc5-edit-sp-title').val().trim();
                            var te = $(this).find('.cc5-edit-sp-text').val().trim();
                            if (ti || te) _ssparts.push({ icon: ic, title: ti, text: te });
                        });
                        cardData.sceneParts = _ssparts;
                    } else {
                        var _beatTexts = [];
                        modal.find('.cc5-edit-beat-item').each(function () {
                            var t = $(this).find('.cc5-edit-beat-text').val().trim();
                            if (t) _beatTexts.push(t);
                        });
                        cardData.content = _beatTexts.join(' ');
                    }
                    var _hl = modal.find('#cc5-edit-unified-highlight').val().trim();
                    cardData.highlightText = _hl || '';
                }
                // v10.40: concept-explainer  -  collect insight chips + conceptItems grid
                if (section.cardType === 'concept-explainer') {
                    var _insightTexts = [];
                    modal.find('.cc5-edit-insight-item').each(function () {
                        var t = $(this).find('.cc5-edit-insight-text').val().trim();
                        if (t) _insightTexts.push(t);
                    });
                    cardData.content = _insightTexts.join(' ');
                    var _ciArr = [];
                    modal.find('.cc5-edit-concept-item').each(function () {
                        var icon = $(this).find('.cc5-edit-ci-icon').val().trim();
                        var title = $(this).find('.cc5-edit-ci-title').val().trim();
                        var desc = $(this).find('.cc5-edit-ci-description').val().trim();
                        if (title || desc) _ciArr.push({ icon: icon, title: title, description: desc });
                    });
                    cardData.conceptItems = _ciArr;
                }
                if (section.cardType === 'mental-model') {
                    var mmSteps = [];
                    modal.find('.cc5-edit-mm-step-item').each(function () {
                        var stepIcon  = $(this).find('.cc5-edit-mm-step-icon').val().trim();
                        var stepTitle = $(this).find('.cc5-edit-mm-step-title').val().trim();
                        var stepDetail = $(this).find('.cc5-edit-mm-step-detail').val().trim();
                        if (stepTitle) mmSteps.push({ icon: stepIcon, step: stepTitle, detail: stepDetail });
                    });
                    cardData.steps = mmSteps;
                }
                if (section.cardType === 'decision-point') {
                    cardData.question = modal.find('#cc5-edit-dp-question').val().trim();
                    var dpOptions = [];
                    modal.find('.cc5-edit-dp-option-item').each(function () {
                        var optText = $(this).find('.cc5-edit-dp-option-text').val().trim();
                        var optFeedback = $(this).find('.cc5-edit-dp-feedback').val().trim();
                        var optCorrect = $(this).find('.cc5-edit-dp-correct').is(':checked');
                        if (optText) dpOptions.push({ text: optText, feedback: optFeedback, correct: optCorrect });
                    });
                    cardData.options = dpOptions;
                }
                if (section.cardType === 'mistakes') {
                    var mistakeItems = [];
                    modal.find('.cc5-edit-mistake-item').each(function () {
                        var m = $(this).find('.cc5-edit-mistake-text').val().trim();
                        var c = $(this).find('.cc5-edit-mistake-consequence').val().trim();
                        var ic = $(this).find('.cc5-edit-mistake-icon').val().trim();
                        if (m) mistakeItems.push({ mistake: m, icon: ic, consequence: c });
                    });
                    cardData.items = mistakeItems;
                }
                if (section.cardType === 'competency-summary') {
                    // v10.39: goodItems/badItems dual-column schema
                    // v13.95.8: goodItems carry {text, benefit}; carry the benefit across by
                    // index rather than collapsing to a bare string and destroying it.
                    var _priorGood = Array.isArray(cardData.goodItems) ? cardData.goodItems : [];
                    var goodItems = [];
                    modal.find('.cc5-edit-good-item').each(function () {
                        var s = $(this).find('.cc5-edit-good-item-text').val().trim();
                        if (!s) { return; }
                        var _gidx = parseInt($(this).data('idx'), 10);
                        var _gp = (!isNaN(_gidx) && _priorGood[_gidx]
                            && typeof _priorGood[_gidx] === 'object') ? _priorGood[_gidx] : null;
                        goodItems.push({ text: s, benefit: (_gp && _gp.benefit) || '' });
                    });
                    // v13.85: badItems entries carry {text, consequence}. The editor only
                    // exposes the text, so carry the existing consequence across by index
                    // instead of collapsing the item back to a bare string and destroying it.
                    var _priorBad = Array.isArray(cardData.badItems) ? cardData.badItems : [];
                    var badItems = [];
                    modal.find('.cc5-edit-bad-item').each(function () {
                        var s = $(this).find('.cc5-edit-bad-item-text').val().trim();
                        if (!s) { return; }
                        var idx = parseInt($(this).data('idx'), 10);
                        var prior = (!isNaN(idx) && _priorBad[idx] && typeof _priorBad[idx] === 'object')
                            ? _priorBad[idx] : null;
                        badItems.push({ text: s, consequence: (prior && prior.consequence) || '' });
                    });
                    cardData.goodItems = goodItems;
                    cardData.badItems  = badItems;
                }
                // -- end v10.27 save logic -------------------------------------
            }

            // -- v13.22: Collect per-card updates from multi-card section editors --
            // Cards are collected in DOM order (supports reorder/delete).
            // Each _cu starts as a deep copy of the original card so image,
            // icon, and other non-editable fields are preserved after a full
            // section.cards[] replacement on both client and server.
            var cardsDataArr = null;
            var _mcCardBlocks = modal.find('.cc5-edit-card-block');
            if (_mcCardBlocks.length > 0) {
                cardsDataArr = [];
                var _origCards = (self._editingSection && self._editingSection.cards) ? self._editingSection.cards : [];
                _mcCardBlocks.each(function () {
                    var _blk = $(this);
                    var _ci  = parseInt(_blk.data('card-idx')); // original index — look up source card
                    var _ct  = _blk.data('card-type') || '';
                    // Deep-clone original card to preserve non-editable fields
                    var _origCard = (_origCards[_ci] && typeof _origCards[_ci] === 'object')
                        ? JSON.parse(JSON.stringify(_origCards[_ci])) : {};
                    // v13.95.8 FIX-CC-CARDTITLE-BLANK: card.heading is deliberately NOT
                    // written here. On concept-explainer it holds the legislation name and on
                    // decision-point the question itself, so writing the title box into it
                    // would let a box labelled "Card Title" silently overwrite the question.
                    var _cardTitleVal = _blk.find('.cc5-edit-card-title').val().trim();
                    var _cu = Object.assign(_origCard, {
                        cardType:     _ct,
                        title:        _cardTitleVal,
                        voiceoverText:_blk.find('.cc5-edit-card-voiceover').val().trim()
                    });
                    // v13.92: Topics-and-Text prose cards.
                    if (['overview','key-concepts','examples-application','key-takeaways',
                         'orientation','foundations','mechanism','in-practice','boundaries'].indexOf(_ct) !== -1) {
                        var _pParas = [];
                        _blk.find('.cc5-edit-prose-para').each(function () {
                            var t = $(this).val().trim();
                            if (t) { _pParas.push(t); }
                        });
                        // Only overwrite when the author left something behind. An
                        // accidental clear-all must not silently empty the card.
                        if (_pParas.length) { _cu.paragraphs = _pParas; }
                        // The heading is fixed and the narration is the paragraphs, so
                        // neither of these is authored on this route.
                        delete _cu.heading;
                        _cu.title = '';
                        _cu.voiceoverText = '';
                        if (_blk.find('.cc5-edit-prose-terms-list').length) {
                            var _pTerms = [];
                            _blk.find('.cc5-edit-prose-term-item').each(function () {
                                var n = $(this).find('.cc5-edit-prose-term-name').val().trim();
                                var d = $(this).find('.cc5-edit-prose-term-def').val().trim();
                                if (n && d) { _pTerms.push({ term: n, definition: d }); }
                            });
                            _cu.keyTerms = _pTerms;
                        }
                        ['good', 'bad'].forEach(function (kind) {
                            if (!_blk.find('.cc5-edit-prose-' + kind + '-list').length) { return; }
                            var _items = [];
                            _blk.find('.cc5-edit-prose-' + kind + '-item').each(function () {
                                var t = $(this).find('.cc5-edit-prose-' + kind + '-text').val().trim();
                                if (t) { _items.push({ text: t }); }
                            });
                            _cu[kind === 'good' ? 'goodItems' : 'badItems'] = _items;
                        });
                    }
                    if (_ct === 'hook-scenario' || _ct === 'applied-scenario') {
                        // v10.47: collect structured sceneParts[] (JSON format) first;
                        // fall back to flat beats for legacy sections without sceneParts[]
                        var _sparts = [];
                        _blk.find('.cc5-edit-scene-part-item').each(function () {
                            var ic = $(this).find('.cc5-edit-sp-icon').val().trim();
                            var ti = $(this).find('.cc5-edit-sp-title').val().trim();
                            var te = $(this).find('.cc5-edit-sp-text').val().trim();
                            if (ti || te) _sparts.push({ icon: ic, title: ti, text: te });
                        });
                        if (_sparts.length) {
                            _cu.sceneParts = _sparts;
                        } else {
                            var _beats = [];
                            _blk.find('.cc5-edit-beat-item').each(function () {
                                var t = $(this).find('.cc5-edit-beat-text').val().trim();
                                if (t) _beats.push(t);
                            });
                            _cu.content = _beats.join(' ');
                        }
                        _cu.highlightText = _blk.find('.cc5-edit-card-highlight').val().trim();
                    }
                    if (_ct === 'concept-explainer') {
                        // v10.47: collect conceptInsights[] (icon/title/text)  -  matches cc-card-slots.js
                        // rendering and buildFullVoiceoverText. Replaces old conceptItems/content fields.
                        var _cinsights = [];
                        _blk.find('.cc5-edit-concept-insight-item').each(function () {
                            var ic = $(this).find('.cc5-edit-cins-icon').val().trim();
                            var ti = $(this).find('.cc5-edit-cins-title').val().trim();
                            var te = $(this).find('.cc5-edit-cins-text').val().trim();
                            if (ti || te) _cinsights.push({ icon: ic, title: ti, text: te });
                        });
                        _cu.conceptInsights = _cinsights;
                    }
                    if (_ct === 'mental-model') {
                        // v10.49: collect step.icon (was missing  -  icon lost on every save)
                        var _steps = [];
                        _blk.find('.cc5-edit-mm-step-item').each(function () {
                            var ic = $(this).find('.cc5-edit-mm-step-icon').val().trim();
                            var st = $(this).find('.cc5-edit-mm-step-title').val().trim();
                            var de = $(this).find('.cc5-edit-mm-step-detail').val().trim();
                            if (st) _steps.push({ icon: ic, step: st, detail: de });
                        });
                        _cu.steps = _steps;
                    }
                    if (_ct === 'decision-point') {
                        _cu.question = _blk.find('.cc5-edit-card-dp-question').val().trim();
                        var _opts = [];
                        _blk.find('.cc5-edit-dp-option-item').each(function () {
                            var tx = $(this).find('.cc5-edit-dp-option-text').val().trim();
                            var fb = $(this).find('.cc5-edit-dp-feedback').val().trim();
                            var co = $(this).find('.cc5-edit-dp-correct').is(':checked');
                            if (tx) _opts.push({ text: tx, feedback: fb, correct: co });
                        });
                        _cu.options = _opts;
                    }
                    if (_ct === 'mistakes') {
                        var _mits = [];
                        _blk.find('.cc5-edit-mistake-item').each(function () {
                            var mi = $(this).find('.cc5-edit-mistake-text').val().trim();
                            var co = $(this).find('.cc5-edit-mistake-consequence').val().trim();
                            var _ico = $(this).find('.cc5-edit-mistake-icon').val().trim();
                            if (mi) _mits.push({ mistake: mi, icon: _ico, consequence: co });
                        });
                        _cu.items = _mits;
                    }
                    if (_ct === 'competency-summary') {
                        // v13.95.8: goodItems now carry {text, benefit}, the mirror of
                        // {text, consequence} on badItems. Collapsing them back to bare
                        // strings here would destroy the benefit on every save - the exact
                        // defect v13.90.1 fixed for badItems immediately below. The editor
                        // exposes only the item text, so the benefit is carried across by
                        // index from the original card data, the same way.
                        var _priorGoodCard = Array.isArray(_cu.goodItems) ? _cu.goodItems : [];
                        var _gi = [];
                        _blk.find('.cc5-edit-good-item').each(function () {
                            var s = $(this).find('.cc5-edit-good-item-text').val().trim();
                            if (!s) { return; }
                            var _gidx = parseInt($(this).data('idx'), 10);
                            var _gprior = (!isNaN(_gidx) && _priorGoodCard[_gidx]
                                && typeof _priorGoodCard[_gidx] === 'object') ? _priorGoodCard[_gidx] : null;
                            _gi.push({ text: s, benefit: (_gprior && _gprior.benefit) || '' });
                        });
                        // v13.90.1 FIX-BADITEMS-CONSEQUENCE-LOSS: this collapsed every
                        // badItem back to a bare string, permanently destroying its
                        // consequence.
                        //
                        // v13.85 fixed exactly this bug - but in the OTHER copy of the
                        // code, the section-level branch further up. This is the v13.22
                        // per-card branch, and it is the one that actually runs for real
                        // content: competency-summary is Card 6 of the unified 7-card
                        // flow, so it renders as a .cc5-edit-card-block and is collected
                        // here, not there. A teacher who opened a slide editor, changed
                        // only the card title and hit Save lost every "What to Avoid"
                        // consequence in that card - roughly fifty generated, billed words
                        // per card, unrecoverable, because nothing regenerates them.
                        //
                        // The editor exposes only the item text, so carry the existing
                        // consequence across by index, exactly as the section-level branch
                        // does. _priorBadCard is read from the ORIGINAL card data, which
                        // _cu was deep-copied from above.
                        var _priorBadCard = Array.isArray(_cu.badItems) ? _cu.badItems : [];
                        var _bi = [];
                        _blk.find('.cc5-edit-bad-item').each(function () {
                            var s = $(this).find('.cc5-edit-bad-item-text').val().trim();
                            if (!s) { return; }
                            var _bidx = parseInt($(this).data('idx'), 10);
                            var _bprior = (!isNaN(_bidx) && _priorBadCard[_bidx]
                                && typeof _priorBadCard[_bidx] === 'object') ? _priorBadCard[_bidx] : null;
                            _bi.push({ text: s, consequence: (_bprior && _bprior.consequence) || '' });
                        });
                        _cu.goodItems = _gi;
                        _cu.badItems  = _bi;
                    }
                    // Push in DOM order (not by original index) so reorders and
                    // deletions are reflected in the final section.cards[] array.
                    cardsDataArr.push(_cu);
                });
            }
            // -- end v13.22 per-card collection --------------------------------

            // v9.78 FIX (A-07): terminology, mentalModel, predictionPrompt, keyTakeaway,
            // proTip, keyInfo, expertInsight were collected from the edit modal but never
            // included in the Ajax.call args  ->  they were discarded on save and reverted to
            // the AI-generated values next time the module loaded from the DB manifest.
            // Also adding scenarioTitle, scenarioRole, scenarioContext, scenarioComplication
            // which had the same problem (collected locally but not sent to server).
            // v9.87: Added voiceoverText + cardData for route-card-specific field persistence.
            // v11.49 BUG-CC-MSGCHAN: Wrap in retry  -  service-worker channel drops handled.
            var _slideEditMaxRetries = 3;
            var _slideEditArgs = {
                cmid: self.cmid,
                topicId: topicId,
                sectionId: sectionId,
                title: title,
                description: description,
                voiceoverText: introduction,
                requirements: JSON.stringify(requirements),
                doList: JSON.stringify(doList),
                dontList: JSON.stringify(dontList),
                scenario: scenario,
                scenarioTitle: scenarioTitle !== undefined ? (scenarioTitle || '') : '',
                scenarioRole: scenarioRole !== undefined ? (scenarioRole || '') : '',
                scenarioContext: scenarioContext !== undefined ? (scenarioContext || '') : '',
                scenarioComplication: scenarioComplication !== undefined ? (scenarioComplication || '') : '',
                mentalModel: scenarioMentalModel !== undefined ? JSON.stringify(scenarioMentalModel || null) : '',
                predictionPrompt: scenarioPrediction !== undefined ? JSON.stringify(scenarioPrediction || null) : '',
                terminology: JSON.stringify(terminology),
                keyTakeaway: editKeyTakeaway !== undefined ? (editKeyTakeaway || '') : '',
                proTip: editProTip !== undefined ? (editProTip || '') : '',
                keyInfo: editKeyInfo !== undefined ? (editKeyInfo || '') : '',
                expertInsight: editExpertInsight !== undefined ? (editExpertInsight || '') : '',
                cardData: Object.keys(cardData).length > 0 ? JSON.stringify(cardData) : '{}',
                cardsData: cardsDataArr ? JSON.stringify(cardsDataArr) : '[]',
                regenerateVoiceover: regenerateVoiceover
            };
            function _attemptSlideEditSave(attempt) {
                Ajax.call([{
                    methodname: 'mod_contentcreator_save_slide_edit',
                    args: _slideEditArgs
                }])[0].done(function (response) {
                
                if (response.success) {
                    Notification.addNotification({ message: response.message, type: 'success' });
                    
                    // Update local manifest - v6.5.58: Use fallback helper for consistent lookup
                    var found = findSectionWithFallback(self.manifest.topics, topicId, sectionId);
                    if (found) {
                        var sec = self.manifest.topics[found.topicIndex].sections[found.sectionIndex];
                        sec.title = title;
                        // v8.4.56: Description field is always shown in edit modal now
                        sec.description = description;
                        sec.voiceoverText = introduction;
                        sec.requirements = requirements;
                        sec.doList = doList;
                        sec.positiveList = doList;
                        sec.dontList = dontList;
                        sec.negativeList = dontList;
                        if (!sec.scenario) sec.scenario = {};
                        sec.keyFacts = keyFacts;
                        sec.keyTakeaway = editKeyTakeaway !== undefined ? editKeyTakeaway : (sec.keyTakeaway || '');
                        sec.proTip = editProTip !== undefined ? editProTip : (sec.proTip || '');
                        sec.keyInfo = editKeyInfo !== undefined ? editKeyInfo : (sec.keyInfo || sec.didYouKnow || '');
                        sec.expertInsight = editExpertInsight !== undefined ? editExpertInsight : (sec.expertInsight || '');
                        
                        // ===============================================================
                        // v7.9.3: Save 5-CARD MODEL fields
                        // ===============================================================
                        
                        // CARD 1: Save terminology (Knowledge card)
                        sec.terminology = terminology;
                        
                        // CARD 2: Save scenario (preserve other fields, update all editable fields)
                        if (!sec.scenario) sec.scenario = {};
                        // v8.4.56: Save scenario fields (allow clearing when field exists in edit modal)
                        if (scenarioTitle !== undefined) sec.scenario.title = scenarioTitle;
                        if (scenarioRole !== undefined) sec.scenario.role = scenarioRole;
                        if (scenarioContext !== undefined) sec.scenario.context = scenarioContext;
                        if (scenarioComplication !== undefined) sec.scenario.complication = scenarioComplication;
                        // v8.4.56: Save mentalModel and predictionPrompt (allow clearing)
                        if (scenarioMentalModel !== undefined) sec.scenario.mentalModel = scenarioMentalModel;
                        if (scenarioPrediction !== undefined) sec.scenario.predictionPrompt = scenarioPrediction;
                        
                        // v9.87: Apply cardData to local manifest (both section level AND cards[0] for multi-card sections)
                        if (Object.keys(cardData).length > 0) {
                            Object.keys(cardData).forEach(function (k) { sec[k] = cardData[k]; });
                            // Sync to sec.cards[0] if multi-card section so renderer reads updated values
                            if (sec.cards && sec.cards.length > 0) {
                                Object.keys(cardData).forEach(function (k) { sec.cards[0][k] = cardData[k]; });
                            }
                        }

                        // v13.22: Replace sec.cards entirely with the new ordered array.
                        // cardsDataArr is now a dense DOM-order array of full card objects,
                        // supporting reorder and delete as well as field edits.
                        if (cardsDataArr && cardsDataArr.length > 0) {
                            sec.cards = cardsDataArr.slice();
                        }

                        // v12.09: AUTO-DETECT TEXT CHANGE  -  compare new voiceover text hash to the
                        // stored hash. If the text changed since the last voiceover was generated,
                        // automatically flag regeneration so the stored URL is invalidated and fresh
                        // audio is produced. This fires even when the "Regenerate voiceover" checkbox
                        // is not ticked, ensuring students always hear audio that matches the edited text.
                        // v12.26 FIX (BUG-CC-NOREGEN): The original condition required sec.voiceoverTextHash
                        // to exist before running the comparison. Sections generated before v9.98 (when hash
                        // tracking was introduced) have no stored hash, so the block was always skipped and
                        // regenerateVoiceover stayed false. Combined with sec.voiceoverUrl already being set,
                        // neither auto-regen branch fired  -  edits to card text were saved to the DB but the
                        // audio stayed stale and no "regenerating" notification was ever shown.
                        // Fix: if a hash exists, compare as before; if no hash but a voiceoverUrl exists,
                        // we cannot compare so we always flag regeneration on edit.
                        if (!regenerateVoiceover) {
                            if (sec.voiceoverTextHash) {
                                var _newCheckText = self.buildFullVoiceoverText(sec);
                                var _newCheckHash = voiceoverTextHash(_newCheckText || '');
                                if (_newCheckHash && _newCheckHash !== sec.voiceoverTextHash) {                                    regenerateVoiceover = true;
                                }
                            } else if (sec.voiceoverUrl) {
                                // No stored hash but voiceover audio exists  -  cannot compare text hashes,
                                // so flag regeneration unconditionally to ensure edited content is heard.
                                // v13.85: this assignment had been merged onto the end of the
                                // comment above, so the branch did nothing and an edited
                                // section with audio but no stored hash kept its stale
                                // narration.
                                regenerateVoiceover = true;
                            }
                        }

                        // Always clear voiceover cache when content is edited
                        delete self.voiceoverCache[sectionId];
                        // v13.94.6: drop the fingerprint with the entry it belongs to.
                        if (self.voiceoverCacheHash) { delete self.voiceoverCacheHash[sectionId]; }
                        if (regenerateVoiceover) {
                            delete sec.voiceoverUrl;
                            delete sec.voiceoverTextHash; // v9.98
                        }
                        
                        // v8.1.6: Auto-generate voiceover after edit so students never wait
                        if (self.voiceoverEnabled && (regenerateVoiceover || !sec.voiceoverUrl)) {
                            var voText = self.buildFullVoiceoverText(sec);
                            if (voText && voText.trim().length > 10) {                                // v12.25: Notify user that voiceover is regenerating in background
                                Notification.addNotification({
                                    message: getLabel('voRegenBackground'),
                                    type: 'info'
                                });
                                var voFormData = new FormData();
                                voFormData.append('sesskey', Config.sesskey);
                                voFormData.append('action', 'generate_voice');
                                voFormData.append('cmid', self.cmid);
                                voFormData.append('text', voText);
                                voFormData.append('sectionid', sectionId);
                                voFormData.append('subtopickey', sec.billingKey || '');
                                // v12.79 FIX-CC-BGVO-LANG: Use activeLang for background regen.
                                voFormData.append('language', (self.activeLang || self.voiceLanguage));
                                voFormData.append('voice', self.voiceName);
                                
                                CcState.fetchWithDeadline(CcState.ajaxUrl(), {
                                    method: 'POST',
                                    body: voFormData
                                })
                                .then(function (voResp) { return voResp.json(); })
                                .then(function (voData) {
                                    // v12.51 BUG-CC-AUTOGEN-PENDING: PHP mutex returns {pending:true}
                                    // when another PHP process holds the file lock for this sectionId
                                    // (e.g. the background preload from page load is still running TTS).
                                    // Old code fell through to the failure else-branch and showed
                                    // "Slide saved but voiceover regeneration failed"  -  alarming and wrong.
                                    // Fix: detect pending before success. Show a clear info notice so the
                                    // user knows to try the Play button in a few minutes, once the ongoing
                                    // PHP TTS request completes and voiceoverCache is populated.
                                    if (voData.pending) {
                                        ccWarn('[VOICEOVER v' + CC_VERSION + '] AUTO-GEN PENDING section ' + sectionId + '  -  PHP mutex busy (preload in progress); voiceover will be available shortly');
                                        Notification.addNotification({
                                            message: getLabel('slideSavedVoPending'),
                                            type: 'info'
                                        });
                                    } else if (voData.success && voData.audioContent) {
                                        var audioUrl = 'data:' + voData.audioType + ';base64,' + voData.audioContent;
                                        var _autoVoText = self.buildFullVoiceoverText(sec);
                                        // v11.77 FIX: Persist to file store immediately  -  do NOT
                                        // store the raw data: URL in sec.voiceoverUrl because
                                        // stripAudio() would convert it to 'pregenerated' before
                                        // the manifest is saved. persistVoiceoverToFileStore sets
                                        // sec.voiceoverUrl = httpsUrl and schedules saveManifestSilent.
                                        sec.voiceoverWordCount = _autoVoText.split(/\s+/).length;
                                        sec.voiceoverSchemaVersion = VOICEOVER_SCHEMA_VERSION;
                                        sec.voiceoverTextHash = voiceoverTextHash(_autoVoText); // v9.98
                                        self.voiceoverCache[sectionId] = audioUrl;
                        // v13.94.6: stamp the entry so it can be validated on replay.
                        self.voiceoverCacheHash = self.voiceoverCacheHash || {};
                        self.voiceoverCacheHash[sectionId] = section.voiceoverTextHash
                            || voiceoverTextHash(self.buildFullVoiceoverText(section));
                                        // v13.94.6: stamp the entry so it can be validated on replay.
                                        self.voiceoverCacheHash = self.voiceoverCacheHash || {};
                                        self.voiceoverCacheHash[sectionId] = section.voiceoverTextHash
                                            || voiceoverTextHash(self.buildFullVoiceoverText(section));                                        // v12.25: Confirm voiceover is ready
                                        Notification.addNotification({
                                            message: getLabel('voUpdated'),
                                            type: 'success'
                                        });
                                        self.persistVoiceoverToFileStore(voData.audioContent, voData.audioType, sectionId, sec);
                                    } else {
                                        ccError('[VOICEOVER v' + CC_VERSION + '] AUTO-GEN FAIL section ' + sectionId + ': ' + (voData.error || 'unknown'));
                                        // v12.25: Warn user that voiceover regen failed
                                        Notification.addNotification({
                                            message: getLabel('voRegenFailed'),
                                            type: 'warning'
                                        });
                                    }
                                })
                                .catch(function (voErr) {
                                    ccError('[VOICEOVER v' + CC_VERSION + '] AUTO-GEN ERROR section ' + sectionId + ': ' + voErr.message);
                                    // v12.25: Warn user on network error
                                    Notification.addNotification({
                                        message: getLabel('voRegenNetworkError'),
                                        type: 'warning'
                                    });
                                });
                            }
                        }
                    }
                    
                    // Close modal and re-render
                    $('.cc5-edit-modal-overlay').remove();
                    self.render();
                } else {
                    Notification.addNotification({ message: response.message || 'Failed to save', type: 'error' });
                }
                }).fail(function (error) {
                    if (attempt < _slideEditMaxRetries) {                        setTimeout(function () { _attemptSlideEditSave(attempt + 1); }, 1000 * attempt);
                    } else {
                        showErrorToast(getLabel('slideSaveFailed') || 'Failed to save changes. Please try again.', 'saveSlideEdit', error);
                        saveBtn.prop('disabled', false).removeClass('cc5-saving');
                    }
                }).done(function () {
                    saveBtn.prop('disabled', false).removeClass('cc5-saving');
                });
            } // end _attemptSlideEditSave
            _attemptSlideEditSave(1);
        },

        /**
         * Play voiceover for a section
         * v6.5.11: Check if voiceover is enabled
         * v6.6.57: Only for learning slides (activity slides are interactive, no voiceover)
         */
        playVoiceover: function (sectionId) {
            
            // v7.9.1: Guard against undefined sectionId
            if (!sectionId || sectionId === 'undefined') {
                Notification.addNotification({
                    message: getLabel('voUnavailable'),
                    type: 'warning'
                });
                return;
            }
            
            // v6.5.11: Do nothing if voiceover is disabled
            if (!this.voiceoverEnabled) {
                return;
            }

            // v11.86 FIX 2: Global completion gate for students. If the teacher has not yet
            // successfully completed preload for all sections (manifest.voiceoversComplete !== true),
            // students see a clear "not ready" message and the button is disabled. This prevents
            // any broken/empty audio state from being exposed  -  students only interact with
            // content that has been fully prepared and verified by the preload system.
            // v12.16: isTeacher (capability without edit mode) bypasses this gate  -  teachers
            // must be able to preview voiceovers with Moodle edit mode OFF.
            if (!this.editMode && !this.canEdit && !this.isTeacher && this.manifest.voiceoversComplete !== true) {
                var _btn86 = this.container.find('.cc5-voiceover-btn-large[data-section-id="' + sectionId + '"]');
                _btn86.prop('disabled', true).attr('title', 'Audio not yet ready  -  teacher must open this content first');
                ccWarn('[VOICEOVER v' + CC_VERSION + '] GLOBAL BLOCK section ' + sectionId + '  -  manifest.voiceoversComplete=' + this.manifest.voiceoversComplete + '. Content not ready for students.');
                Notification.addNotification({
                    message: getLabel('contentPreparing'),
                    type: 'warning'
                });
                return;
            }

            // v6.6.57: Find the section and check if it's an activity slide
            var isActivitySlide = false;
            var topics = this.manifest.topics || [];
            for (var t = 0; t < topics.length && !isActivitySlide; t++) {
                var sects = topics[t].sections || [];
                for (var s = 0; s < sects.length; s++) {
                    if (sects[s].id === sectionId && sects[s].slideType === 'activity') {
                        isActivitySlide = true;
                        break;
                    }
                }
            }
            
            // v6.6.57: Activity slides don't have voiceover - exit early
            if (isActivitySlide) {
                return;
            }
            
            var self = this;
            var btn = this.container.find('.cc5-voiceover-btn-large[data-section-id="' + sectionId + '"]');
            
            // Check if audio exists for a DIFFERENT section - stop it first
            if (this.currentAudio && this.currentAudioSectionId && this.currentAudioSectionId !== sectionId) {
                this.currentAudio.pause();
                this.currentAudio = null;
                var oldBtn = this.container.find('.cc5-voiceover-btn-large[data-section-id="' + this.currentAudioSectionId + '"]');
                oldBtn.removeClass('cc5-playing');
                var oldPauseBtn = this.container.find('.cc5-voiceover-pause-btn[data-section-id="' + this.currentAudioSectionId + '"]');
                oldPauseBtn.hide();
                this.currentAudioSectionId = null;
            }
            
            // Check if already playing same section - toggle to pause
            if (this.currentAudio && !this.currentAudio.paused) {
                this.currentAudio.pause();
                btn.removeClass('cc5-playing');
                var pauseBtnToggle = this.container.find('.cc5-voiceover-pause-btn[data-section-id="' + sectionId + '"]');
                pauseBtnToggle.hide();
                return;
            }
            
            // Check if paused same section - resume playback
            if (this.currentAudio && this.currentAudio.paused && this.currentAudio.currentTime > 0) {
                // v13.94.3 FIX-CC-RESUME-SILENT: this called play() and added the playing
                // class without waiting to see whether playback actually started. A
                // rejection here (autoplay policy, a lost media element) left the button
                // showing "playing" over silence, with an unhandled promise rejection and
                // nothing said to the learner. The initial-play path at ~14797 has handled
                // this since v13.6; resume never did.
                var _resumeSelf = this;
                var _resumePromise = this.currentAudio.play();
                if (_resumePromise !== undefined) {
                    _resumePromise.catch(function (e) {
                        ccError('[CC v' + CC_VERSION + '] audio resume rejected | ' + e.name + ': ' + e.message);
                        btn.removeClass('cc5-playing cc5-loading cc5-attention');
                        _resumeSelf.container.find('.cc5-voiceover-pause-btn[data-section-id="' + sectionId + '"]').hide();
                        Notification.addNotification({
                            message: getLabel('audioBlocked'),
                            type: 'warning'
                        });
                    });
                }
                btn.addClass('cc5-playing');
                var pauseBtnResume = this.container.find('.cc5-voiceover-pause-btn[data-section-id="' + sectionId + '"]');
                pauseBtnResume.show();
                return;
            }
            
            // Find the section data - v6.6.91: Enhanced lookup with expanded section ID support
            // 'topics' is already declared above (same value, this.manifest.topics) - reuse it
            // rather than re-declaring, which var-hoisted into a single binding anyway.
            var section = null;
            
            // v6.6.91: Strip _learning or _activity suffix from expanded section IDs
            var baseSectionId = sectionId;
            if (typeof sectionId === 'string') {
                if (sectionId.endsWith('_learning')) {
                    baseSectionId = sectionId.replace('_learning', '');
                } else if (sectionId.endsWith('_activity')) {
                    baseSectionId = sectionId.replace('_activity', '');
                }
            }
            
            // Strategy 1: Exact section.id match (try both expanded and base ID)
            for (var i = 0; i < topics.length; i++) {
                var sections = topics[i].sections || [];
                for (var j = 0; j < sections.length; j++) {
                    if (sections[j].id === sectionId || sections[j].id === baseSectionId) {
                        section = sections[j];
                        break;
                    }
                }
                if (section) break;
            }
            
            // Strategy 2: Try pcNumber match (use baseSectionId for expanded IDs)
            if (!section) {
                for (var ii = 0; ii < topics.length; ii++) {
                    sects = topics[ii].sections || [];
                    for (var jj = 0; jj < sects.length; jj++) {
                        if (sects[jj].pcNumber === sectionId || sects[jj].pcNumber === baseSectionId) {
                            section = sects[jj];
                            break;
                        }
                    }
                    if (section) break;
                }
            }
            
            // Strategy 3: Index-based lookup for "X.Y" format (e.g., "3.4_learning" -> "3.4" -> topic 2, section 3)
            var sectionIdStr = String(baseSectionId || '');
            if (!section && sectionIdStr && sectionIdStr.includes('.')) {
                var parts = sectionIdStr.split('.');
                var topicIdx = parseInt(parts[0]) - 1;
                var sectionIdx = parseInt(parts[1]) - 1;
                if (topics[topicIdx] && topics[topicIdx].sections && topics[topicIdx].sections[sectionIdx]) {
                    section = topics[topicIdx].sections[sectionIdx];
                }
            }
            
            // Strategy 4: v6.7.26 - Handle "subtopic_X_Y" format from planner.js
            if (!section && sectionIdStr && sectionIdStr.startsWith('subtopic_')) {
                var subtopicParts = sectionIdStr.replace('subtopic_', '').split('_');
                var tIdx = parseInt(subtopicParts[0]);
                var sIdx = parseInt(subtopicParts[1]);
                if (!isNaN(tIdx) && !isNaN(sIdx) && topics[tIdx] && topics[tIdx].sections && topics[tIdx].sections[sIdx]) {
                    section = topics[tIdx].sections[sIdx];
                }
            }
            
            // Strategy 5: v6.7.26 - Fallback: Find current section by slide index
            if (!section) {
                var currentSections = this.getCurrentSections();
                var currentSection = currentSections[this.currentSlideIndex];
                if (currentSection) {
                    // Use the raw manifest section that matches this expanded section
                    for (var ti = 0; ti < topics.length; ti++) {
                        var rawSects = topics[ti].sections || [];
                        for (var si = 0; si < rawSects.length; si++) {
                            if (rawSects[si].id === currentSection.id || 
                                rawSects[si].id === baseSectionId ||
                                rawSects[si].number === currentSection.number) {
                                section = rawSects[si];
                                break;
                            }
                        }
                        if (section) break;
                    }
                }
            }
            
            if (!section) {
                Notification.addNotification({
                    message: getLabel('sectionNotFound'),
                    type: 'error'
                });
                return;
            }
            
            // CC-ML-DEBUG v13.4: playVoiceover entry

            // Check cache first (v6.4.2 - instant playback)
            //
            // v13.94.6: the cache entry is now fingerprinted before it is trusted.
            //
            // This was the FIRST return path in the function, and the entire staleness
            // apparatus below it - schema version, word count, text hash - only ever
            // guarded section.voiceoverUrl. A cache entry was never checked against
            // anything. The cache is also persisted to sessionStorage and restored on a
            // 30-minute window, and loadSessionState writes a manifestHash it never reads
            // back. So: a teacher edits a slide and saves; the edit correctly evicts the
            // cache in THAT tab; a second tab, or the same tab after a reload inside the
            // window, restores the pre-edit audio and serves it ahead of every check. The
            // learner hears the old script over the new text, with no warning.
            if (this.voiceoverCache[sectionId]) {
                var _cachedHash = this.voiceoverCacheHash && this.voiceoverCacheHash[sectionId];
                var _liveHash = '';
                try {
                    _liveHash = voiceoverTextHash(this.buildFullVoiceoverText(section));
                } catch (e) {
                    _liveHash = '';
                }
                // An entry stamped at write time and still matching is good. An UNSTAMPED
                // entry predates this fix (or came from an older sessionStorage payload) and
                // cannot be vouched for, so it is discarded rather than trusted.
                if (_cachedHash && _liveHash && _cachedHash === _liveHash) {
                    this.playCachedVoiceover(this.voiceoverCache[sectionId], btn, sectionId, section);
                    return;
                }
                ccWarn('[CC] discarding stale cached voiceover for section ' + sectionId
                    + (_cachedHash ? ' (content changed)' : ' (unstamped entry)'));
                delete this.voiceoverCache[sectionId];
                if (this.voiceoverCacheHash) { delete this.voiceoverCacheHash[sectionId]; }
            }
            
            // v11.51 FIX: 'pregenerated' sentinel means audio WAS generated but was stripped
            // from the manifest for DB-size reasons (v11.49 stripAudio). Clear it and fall
            // through to on-demand generation  -  both teachers and students regenerate here
            // (students pay per-play; teachers' result is saved back by saveManifestSilent).
            // v11.73 FIX: guard typeof before .startsWith()  -  voiceoverUrl may be undefined
            // when section has never had audio (sentinel stripped, or fresh content). This is
            // a normal state. Calling .startsWith() on undefined causes an immediate crash.
            // v12.63 FIX-CC-MULTILANG-STUDENT-PLAY: Track whether the sentinel was specifically
            // 'pregenerated' (vs undefined / empty).  A 'pregenerated' sentinel guarantees the
            // teacher already produced audio that is cached in the PHP file store.  Students can
            // safely call generate_voice for these sections  -  PHP returns the cached URL and
            // does NOT generate new TTS (no credit cost).  The _wasPregenerated flag is then
            // used below to bypass the student billing guard specifically for this case.
            var _wasPregenerated = (section.voiceoverUrl === 'pregenerated');
            if (!(typeof section.voiceoverUrl === 'string' && section.voiceoverUrl.startsWith('http'))) {                delete section.voiceoverUrl;
                delete this.voiceoverCache[sectionId];
            }

            // Check for pre-generated voiceover URL
            // v9.73: Stale detection uses BOTH schema version AND word-count fingerprint.
            // Schema version mismatch = audio was generated before v9.66/v9.69 text-building
            // fixes  ->  content is wrong. Edit-mode regenerates; student-mode shows a clear
            // warning and unlocks the next button so students are never stuck.
            if (section.voiceoverUrl) {
                var currentText = this.buildFullVoiceoverText(section);
                var currentWordCount = currentText.split(/\s+/).length;
                var storedWordCount = section.voiceoverWordCount || 0;
                var storedSchema = section.voiceoverSchemaVersion || '';
                var isSchemaStale = storedSchema !== VOICEOVER_SCHEMA_VERSION;
                var isWordCountStale = storedWordCount > 0 && Math.abs(currentWordCount - storedWordCount) > 3;
                // v9.98: Hash check  -  catches content changes regardless of word count.
                // The old +/-3-word check missed regenerated topics with similar word counts,
                // causing stale audio to play over entirely new slide content.
                var currentHash = voiceoverTextHash(currentText);
                var storedHash = section.voiceoverTextHash || '';
                var isHashStale = !!storedHash && storedHash !== currentHash;
                var hasNoHash = !storedHash;
                // FIX-CC-ML-URL-PREFIX-CHECK (v13.6): If an additional language is active
                // (activeLang=de-DE etc.) and the stored voiceoverUrl filename does NOT contain
                // the expected 'activeLang_' prefix, the file was generated before v13.5's
                // collision fix — the last writer (primary or additional language) silently
                // overwrote the other's audio. Mark stale so teachers trigger on-demand TTS,
                // which now saves the file with the correct prefix (e.g. voiceover_de-DE_2.1.mp3).
                var isLangPrefixMissing = false;
                if (this.activeLang && typeof section.voiceoverUrl === 'string' && section.voiceoverUrl.startsWith('http')) {
                    var _urlFn = section.voiceoverUrl.split('/').pop().split('?')[0];
                    isLangPrefixMissing = !_urlFn.includes('voiceover_' + this.activeLang + '_');
                }
                var isStale = isSchemaStale || isWordCountStale || isHashStale || isLangPrefixMissing;
                var hasNoFingerprint = !storedWordCount || hasNoHash;

                if (isStale || hasNoFingerprint) {
                    ccWarn('[VOICEOVER v' + CC_VERSION + '] STALE DETECTED section ' + sectionId + ' | schema: ' + storedSchema + '/' + VOICEOVER_SCHEMA_VERSION + ' | storedWords: ' + storedWordCount + ' | currentWords: ' + currentWordCount + ' | hashStale: ' + isHashStale + ' | noHash: ' + hasNoHash + ' | schemaStale: ' + isSchemaStale + ' | editMode: ' + this.editMode + ' | canEdit: ' + this.canEdit);
                    // CC-ML-DEBUG v13.4: stale/no-fingerprint breakdown
                    // v9.75 ROOT-CAUSE FIX: The stale-detection gate is restructured with these
                    // design principles:
                    //
                    // 1. ONLY teachers (editMode=true or canEdit=true) regenerate.
                    //    Previously, hasNoFingerprint=true triggered regeneration for ALL users
                    //    including students  -  burning TTS credits every time a student clicked
                    //    Play on a section with no word-count stored.
                    //
                    // 2. Students NEVER see the "Voiceover audio is outdated" blocking error.
                    //    Students cannot regenerate audio. Blocking them with an error they
                    //    cannot resolve destroys the learning experience and holds them hostage.
                    //    Any audio  -  even slightly stale  -  is infinitely better than no audio.
                    //    The original blocking error was intended for old pre-v9.66 content but
                    //    also caught ALL builder-generated voiceovers (which were never stamped
                    //    until v9.75 Bug #1 fix). This made the error fire on EVERY published
                    //    course on all deployments running pre-v9.75.
                    //
                    // 3. Teachers regenerate on both schema-stale AND no-fingerprint cases.
                    //    canEdit teachers in Select/Preview mode get fresh audio before clicking Play.
                    // v9.90 FIX (VO-STALE-REGEN): isWordCountStale must also allow canEdit
                    // teachers (non-editMode) to regenerate.  Content generated between v9.78
                    // and v9.81 carries schema '9.81' (matches VOICEOVER_SCHEMA_VERSION) AND
                    // a stored word-count fingerprint, so neither isSchemaStale nor
                    // hasNoFingerprint fires.  But the old buggy buildFullVoiceoverText only
                    // narrated card[0] + a raw field-dump instead of all cards  -  the word count
                    // always differs by >>3 words.  Without this fix those teachers (and their
                    // students) heard "overview then random stuff" every session forever.
                    // FIX-CC-ML-PREFIX-REGEN (v13.7): isLangPrefixMissing was added to isStale and
                    // the ccLog correctly showed "TEACHER-REGEN", but was never added to THIS
                    // condition. Teachers with only isLangPrefixMissing=true fell through to the
                    // student else-branch and played the wrong (primary-language) audio. Fixed.
                    // FIX-CC-ML-STUDENT-LANG-REGEN (v13.18): Pull isLangPrefixMissing out of the
                    // teacher-only gate. Korean/Bulgarian/Thai/etc. students on courses built before
                    // v13.5 (section-ID collision fix) had voiceoverUrls without the lang prefix —
                    // those sections were served English audio because the student else-branch played
                    // "whatever URL exists". A language mismatch is not "close enough"; it is a hard
                    // failure that destroys the multilingual learning experience. Students now also
                    // delete the stale URL and fall through to on-demand TTS for their language.
                    if (isLangPrefixMissing || this.editMode || ((this.canEdit || this.isTeacher) && (isSchemaStale || hasNoFingerprint || isWordCountStale || isHashStale))) {
                        // CC-ML-DEBUG v13.4
                        delete section.voiceoverUrl;
                        delete section.voiceoverSchemaVersion;
                        delete section.voiceoverTextHash; // v9.98
                        delete this.voiceoverCache[sectionId];
                    } else {
                        // Student path: play whatever URL exists.
                        // Schema may be stale (no stamp before v9.75) or word count may have
                        // drifted slightly  -  audio content is close enough to serve learners.
                        // Teachers will gradually refresh content as they enter editMode.
                        ccWarn('[VOICEOVER v' + CC_VERSION + '] Student mode - playing pre-gen audio as-is | schema: ' + storedSchema + ' | words: ' + storedWordCount + '/' + currentWordCount + ' | section: ' + sectionId);
                        // CC-ML-DEBUG v13.4
                        this.playCachedVoiceover(section.voiceoverUrl, btn, sectionId, section, true);
                        return;
                    }
                } else {
                    // CC-ML-DEBUG v13.4: clean (non-stale) URL play
                    this.playCachedVoiceover(section.voiceoverUrl, btn, sectionId, section, true);
                    return;
                }
            }
            // v7.9.90: Fallback to on-demand voiceover generation when pre-generated is missing            
            // If preload is already generating this voiceover, wait for it
            // v7.2.51: Add 30s timeout to prevent infinite spinner
            // v12.13 FIX: Extended timeout from 30s to 90s  -  preload uses a 120s TTS abort
            // (raised in v11.92 for long Chirp 3 HD voiceovers), so the old 30s wait fired
            // before TTS could complete, causing "Voiceover timed out" on first play.
            // v12.21 FIX: Extended from 90s to 150s  -  the preload AbortController fires at
            // 120s (set in v11.92), so any TTS call taking 91-119s caused the wait-poll to
            // time out BEFORE the preload finished. Raising to 150s (30s beyond the 120s abort)
            // ensures the wait-poll always outlasts the preload under any conditions.
            // v12.43 FIX: Extended from 150s to 230s  -  preload abort raised to 200s in v12.43
            // (server logs confirmed 4-chunk voiceovers take 143-153s). Wait-poll must exceed
            // the new 200s abort by at least 30s to avoid race on final chunk delivery.
            // Also poll section.voiceoverUrl: persistVoiceoverToFileStore sets the HTTPS URL
            // asynchronously AFTER voiceoverLoading is cleared  -  catching it here lets the
            // button play from the URL even when the sectionId key mismatches the cache key.
            // v12.50 BUG-CC-BYPASS-PLAY: User clicked "Continue without audio"
            // (voiceoverWaitBypassed=true) then immediately clicked Play on a slide
            // that is still generating audio in the background.
            // The old code entered the 230s blocking setInterval wait loop  -  the user
            // already said they don't want to wait, so blocking them for up to 230s
            // is wrong. Instead: show a brief non-blocking notice and return. The
            // background preload chain continues unaffected; clicking Play again when
            // it completes (or when the PHP mutex releases and TTS succeeds) will work
            // normally via the cache / HTTPS URL path at the top of this function.
            if (this.voiceoverWaitBypassed && this.voiceoverLoading[sectionId]) {
                ccWarn('[VOICEOVER v' + CC_VERSION + '] BYPASSED+LOADING section ' + sectionId + '  -  user bypassed audio wait, skipping 230s loop');
                Notification.addNotification({
                    message: getLabel('voStillGenerating'),
                    type: 'info'
                });
                return;
            }

            if (this.voiceoverLoading[sectionId]) {
                ccWarn('[VOICEOVER v' + CC_VERSION + '] WAITING for in-progress load of section ' + sectionId + ' (230s timeout)');
                btn.addClass('cc5-loading');
                var waitStartTime = Date.now();
                var checkInterval = setInterval(function () {
                    // v12.13 FIX: Check voiceoverUrl FIRST  -  set by persistVoiceoverToFileStore
                    // after TTS completes, even when cache key differs from sectionId.
                    // v12.19 FIX: Also check _preloadFallbackUrl  -  saved by _teacherNeedsRegen
                    // branch before deleting the existing HTTPS URL. This gives teachers instant
                    // playback of the previous audio while regeneration runs in the background,
                    // eliminating the 30s/90s wait that plagued edit mode.
                    var _waitUrl = section.voiceoverUrl || section._preloadFallbackUrl;
                    if (_waitUrl && typeof _waitUrl === 'string' && _waitUrl.startsWith('http')) {
                        clearInterval(checkInterval);
                        delete self.voiceoverLoading[sectionId];
                        btn.removeClass('cc5-loading');                        self.playCachedVoiceover(_waitUrl, btn, sectionId, section, true);
                        return;
                    }
                    // v12.13 FIX: Timeout raised from 30s to 90s.
                    // v12.21 FIX: Raised from 90s to 150s  -  see comment above.
                    // v12.43 FIX: Raised from 150s to 230s  -  see comment above.
                    if (Date.now() - waitStartTime > 230000) {
                        clearInterval(checkInterval);
                        delete self.voiceoverLoading[sectionId];
                        btn.removeClass('cc5-loading');
                        Notification.addNotification({
                            message: getLabel('voTimedOut'),
                            type: 'warning'
                        });
                        return;
                    }
                    if (self.voiceoverCache[sectionId]) {
                        clearInterval(checkInterval);
                        btn.removeClass('cc5-loading');
                        self.playCachedVoiceover(self.voiceoverCache[sectionId], btn, sectionId, section);
                    } else if (!self.voiceoverLoading[sectionId]) {
                        // v11.83: Preload finished but cache still empty (all retries
                        // exhausted). Re-enter playVoiceover  -  on-demand path will fire
                        // instead of silently exiting with no audio.
                        clearInterval(checkInterval);
                        btn.removeClass('cc5-loading');
                        self.playVoiceover(sectionId, btn);
                    }
                }, 200);
                return;
            }
            
            // v11.84: Student billing guard  -  students are NEVER allowed to trigger on-demand
            // TTS generation. Only teachers (editMode or canEdit or isTeacher) may generate audio.
            // v11.86 FIX 5: Hard block  -  button is disabled (not just a soft notification).
            // This prevents the infinite click -> message loop ChatGPT identified. Students
            // cannot retry a broken state  -  it must be resolved by the teacher re-running
            // preload so manifest.voiceoversComplete becomes true. Costs zero TTS credits.
            // v12.16: isTeacher allows teachers to generate on-demand when edit mode is OFF.
            // v12.63 FIX-CC-MULTILANG-STUDENT-PLAY: If _wasPregenerated is true the teacher
            // already generated audio stored in the PHP file store.  PHP's generate_voice returns
            // the cached URL without generating new TTS  -  no credit cost for the student.
            // Allow the fetch below so additional-language voiceovers play for students.
            if (!this.editMode && !this.canEdit && !this.isTeacher && !_wasPregenerated) {
                ccWarn('[VOICEOVER v' + CC_VERSION + '] STUDENT GUARD section ' + sectionId + '  -  on-demand blocked. Button disabled. manifest.voiceoversComplete=' + this.manifest.voiceoversComplete);
                btn.removeClass('cc5-loading').prop('disabled', true).attr('title', 'Audio not ready  -  please check back shortly');
                Notification.addNotification({
                    message: getLabel('contentPreparing'),
                    type: 'warning'
                });
                return;
            }
            // v12.84: _wasPregenerated + student path — teacher already generated audio and
            // PHP file store has it cached. The on-demand fetch below returns cached audio at
            // zero credit cost. No additional guard needed here; the fetch proceeds normally.
            if (_wasPregenerated && !this.editMode && !this.canEdit && !this.isTeacher) {
                ccLog('[CC v' + CC_VERSION + '] STUDENT SENTINEL section ' + sectionId + '  -  pregenerated sentinel, fetching from PHP cache (0 credits)');
            }

            // Mark as loading to prevent race conditions
            this.voiceoverLoading[sectionId] = true;
            
            // v6.6.57: Only learning slides get voiceover (activity slides exit early above)
            var text = this.buildFullVoiceoverText(section);
            // CC-ML-DEBUG v13.8: Show EXACT text sent to TTS so we can confirm German vs English.
            // If activeLang=de-DE but text below is English, the section.voiceoverText/cards are
            // stored in English — root cause is AI generation failure, not a player bug.
            var _onDemandStart = Date.now();            
            btn.addClass('cc5-loading');
            
            // Call the voiceover API with voice settings (v6.3.0)
            var formData = new FormData();
            formData.append('sesskey', Config.sesskey);
            formData.append('action', 'generate_voice');
            formData.append('cmid', this.cmid);
            formData.append('text', text);
            // FIX-CC-ML-SECTIONID-COLLISION (v13.6 player): Mirror v13.5 builder fix for the
            // player's on-demand path. Prefix sectionid with activeLang so generate_voice caches
            // and save_voiceover_file stores the audio in a language-specific file
            // (e.g. voiceover_de-DE_2.1.mp3), preventing the primary-language file from
            // overwriting — or being overwritten by — additional-language audio.
            var _odSectionId = this.activeLang ? (this.activeLang + '_' + sectionId) : sectionId;
            formData.append('sectionid', _odSectionId);
            formData.append('subtopickey', billingKeyForSection(this.manifest, sectionId));
            // v12.63 FIX-CC-MULTILANG-LANG: Use activeLang when the student/teacher is viewing
            // an additional language (activeLang set by setActiveLang).  Sending the primary
            // voiceLanguage for a Vietnamese section, for example, generated English TTS for
            // Vietnamese text.  PHP caches by sectionid so the correct language on the first
            // call is essential  -  the wrong voice would be cached and replayed forever.
            formData.append('language', (this.activeLang || this.voiceLanguage));
            formData.append('voice', this.voiceName);
            // CC-ML-DEBUG v13.4: on-demand TTS request log
            
            var ajaxUrl = CcState.ajaxUrl();
            // v11.83: AbortController  -  ensures voiceoverLoading lock is always released.
            // v11.92: raised from 60s to 120s to match preload timeout. Google Chirp 3 HD
            // on a 7-card voiceover can legitimately take 60-90s; 60s was firing too early.
            // v12.43: raised from 120s to 200s  -  server logs confirm 4-chunk voiceovers
            // take 143-153s; 120s was timing out on-demand fetches before server responded.
            var _odAbortCtrl = new AbortController();
            // FIX-CC-TTS-CLIENT-DEADLINE (v13.95.1): raised to 300s to sit above the server's
            // 280s curl ceiling, so the browser never abandons a synthesis the vendor charges for.
            var _odTimeoutId = setTimeout(function () { _odAbortCtrl.abort(); }, 300000);
            CcState.fetchWithDeadline(ajaxUrl, {
                method: 'POST',
                body: formData,
                signal: _odAbortCtrl.signal
            })
            .then(function (response) {
                    clearTimeout(_odTimeoutId);
                    if (!response.ok) {
                        throw new Error('Server returned ' + response.status);
                    }
                    return response.json();
                })
                .then(function (data) {
                    var _onDemandDur = ((Date.now() - _onDemandStart) / 1000).toFixed(1);
                    // v12.50 BUG-CC-ONDEMAND-PENDING: PHP mutex returns {pending:true} when
                    // another PHP process already holds the file lock for this sectionId.
                    // Old code fell through to the data.success else-branch and logged
                    // ON-DEMAND FAIL + showed an error toast, leaving the user with no audio
                    // and no clear path forward.
                    // Fix: detect data.pending before the success check. Show a brief info
                    // notice ("still generating  -  try again shortly") and clear btn state.
                    // Do NOT set voiceoverLoading so the next click of Play re-tries cleanly.
                    // The background PHP process is still running; when it finishes (<=200s)
                    // the lock releases and the next Play click will succeed via on-demand.
                    if (data.pending) {
                        delete self.voiceoverLoading[sectionId];
                        btn.removeClass('cc5-loading');
                        ccWarn('[VOICEOVER v' + CC_VERSION + '] ON-DEMAND PENDING section ' + sectionId + ' | ' + _onDemandDur + 's  -  server busy (lock held by another process)');
                        Notification.addNotification({
                            message: getLabel('voStillGenerating'),
                            type: 'info'
                        });
                        return;
                    }
                    delete self.voiceoverLoading[sectionId];
                    btn.removeClass('cc5-loading');
                    if (data.success && data.audioContent) {                        var audioUrl = 'data:' + (data.audioType || 'audio/ogg') + ';base64,' + data.audioContent;
                        self.voiceoverCache[sectionId] = audioUrl;
                        // v13.94.6: stamp the entry so it can be validated on replay.
                        self.voiceoverCacheHash = self.voiceoverCacheHash || {};
                        self.voiceoverCacheHash[sectionId] = section.voiceoverTextHash
                            || voiceoverTextHash(self.buildFullVoiceoverText(section));
                        // v9.90 FIX (VO-CANEDIT-SAVEBACK): persist regenerated audio for
                        // canEdit teachers (non-editMode) as well as editMode teachers.
                        //
                        // v11.70: Use persistVoiceoverToFileStore instead of setting the raw
                        // data: URL. Stores audio as a Moodle file  ->  returns HTTPS URL  -> 
                        // survives stripAudio()  ->  DB has real URL  ->  students play instantly
                        // next session without any TTS API call.
                        if (self.editMode || self.canEdit) {
                            var _odVoText = self.buildFullVoiceoverText(section);
                            section.voiceoverWordCount = _odVoText.split(/\s+/).length;
                            section.voiceoverSchemaVersion = VOICEOVER_SCHEMA_VERSION; // v9.73
                            section.voiceoverTextHash = voiceoverTextHash(_odVoText); // v9.98
                            // v11.71: Dedup guard  -  skip re-upload if file store URL already present.
                            // On-demand audio plays immediately from audioUrl (base64); file store
                            // upload is fire-and-forget in background.
                            if (!section.voiceoverUrl || !section.voiceoverUrl.startsWith('http')) {
                                // v13.6: Use the language-prefixed ID so save_voiceover_file stores
                                // the audio as voiceover_de-DE_2.1.mp3 (not voiceover_2.1.mp3).
                                self.persistVoiceoverToFileStore(data.audioContent, data.audioType, _odSectionId, section);
                            }
                        }
                        self.playCachedVoiceover(audioUrl, btn, sectionId, section);
                    } else {
                        var errorMsg = data.error || 'Unknown TTS error';
                        var errorType = data.errorType || 'unknown';
                        ccError('[VOICEOVER v' + CC_VERSION + '] ON-DEMAND FAIL section ' + sectionId + ' | ' + _onDemandDur + 's | type: ' + errorType + ' | ' + errorMsg);
                        // v12.67 FIX-CC-MULTILANG-SENTINEL-RESTORE: playVoiceover deleted
                        // section.voiceoverUrl (the 'pregenerated' sentinel) before the fetch.
                        // If the fetch fails and _wasPregenerated was true, the sentinel is now
                        // gone.  On the next Play click _wasPregenerated would be false (voiceoverUrl
                        // undefined), and the student billing guard would permanently disable the
                        // button.  Fix: restore the sentinel so the next click can retry.
                        if (_wasPregenerated && !section.voiceoverUrl) {
                            section.voiceoverUrl = 'pregenerated';
                        }
                        Notification.addNotification({
                            message: errorType === 'quota'
                                ? 'Voiceover temporarily unavailable (rate limit). Try again in a minute.'
                                : 'Voiceover failed: ' + errorMsg,
                            type: 'warning'
                        });
                    }
                })
                .catch(function (error) {
                    clearTimeout(_odTimeoutId);
                    var _onDemandNetDur = ((Date.now() - _onDemandStart) / 1000).toFixed(1);
                    delete self.voiceoverLoading[sectionId];
                    btn.removeClass('cc5-loading');
                    // v12.67 FIX-CC-MULTILANG-SENTINEL-RESTORE: same as .then() else branch above —
                    // network errors (abort, timeout, connection drop) also delete the sentinel
                    // before this catch fires.  Restore it so the next Play click can retry
                    // via the _wasPregenerated path instead of hitting the student guard.
                    if (_wasPregenerated && !section.voiceoverUrl) {
                        section.voiceoverUrl = 'pregenerated';
                    }
                    var errorMsg = error.message || String(error);
                    var isOdAborted = error.name === 'AbortError';
                    // v12.53 FIX: Log label was stale "120s"  -  abort timer raised to 200s in v12.43.
                    ccError('[VOICEOVER v' + CC_VERSION + '] ON-DEMAND ' + (isOdAborted ? 'TIMEOUT 200s' : 'NETWORK ERR') + ' section ' + sectionId + ' | ' + _onDemandNetDur + 's | ' + errorMsg);
                    Notification.addNotification({
                        message: isOdAborted
                            ? 'Voiceover timed out. Please try again.'
                            : 'Voiceover request failed: ' + errorMsg,
                        type: 'error'
                    });
                });
        },
        playCachedVoiceover: function (audioDataUrl, btn, sectionId, section, isPreGenerated) {
            var self = this;

            // v13.94.6: this is now the single choke point for starting narration, and it
            // enforces two things nothing enforced before.
            //
            // FIRST - the previous element is paused and dereferenced. The line below used
            // to assign `this.currentAudio = new Audio(...)` straight over the top of a
            // PLAYING element. The old element kept its own reference alive through its
            // event listeners and went on talking, with nothing left pointing at it that
            // could stop it. Two narrations at once, and the only escape was to navigate.
            //
            // SECOND - a staleness check. playVoiceover's guards all run BEFORE its fetch
            // is issued, and that fetch can take 200s (on-demand) or 230s (wait-poll). A
            // learner who clicks Play, gives up, and moves on would have the abandoned
            // request resolve here minutes later and start narrating the slide they left -
            // on Route 5, arming a timeline sync from that audio onto the DOM of the slide
            // they are now looking at. A request is only honoured if the section it was
            // issued for is still the one on screen.
            if (this.currentAudio) {
                try { this.currentAudio.pause(); } catch (e) { /* already detached */ }
            }
            this.teardownVoiceoverSync();

            var _liveSection = this.getCurrentSectionId();
            var _wantSection = String(sectionId || '').replace(/_learning$|_activity$/, '');
            if (_liveSection !== null && _liveSection !== _wantSection) {
                ccWarn('[CC] discarding stale narration for section ' + sectionId
                    + ' - learner is now on ' + _liveSection);
                this.currentAudio = null;
                this.currentAudioSectionId = null;
                btn.removeClass('cc5-playing cc5-loading');
                return;
            }

            this.currentAudio = new Audio(audioDataUrl);
            this.currentAudioSectionId = sectionId;
            
            // v13.92: Topics-and-Text - drive the sequential card reveal and the in-focus
            // paragraph lift from this audio element's timeline.
            this.setupVoiceoverSync(this.currentAudio, section);

            this.currentAudio.onplaying = function () {
                btn.addClass('cc5-playing').removeClass('cc5-attention');
                var pauseBtn = self.container.find('.cc5-voiceover-pause-btn[data-section-id="' + sectionId + '"]');
                pauseBtn.show();
                self.container.find('.cc5-nav-chevron.cc5-next').addClass('cc5-disabled').prop('disabled', true);
            };
            
            this.currentAudio.onended = function () {
                btn.removeClass('cc5-playing');
                var pauseBtn = self.container.find('.cc5-voiceover-pause-btn[data-section-id="' + sectionId + '"]');
                pauseBtn.hide();
                // v13.92: narration is over - drop the paragraph focus, open the last
                // card and its activity block so nothing is left locked behind audio.
                // Read the grid from the DOM, not from _proseSync: a render() during
                // playback (the activity Retry button, a settings save, an image
                // apply/remove) tears the sync down, and reading through it would skip
                // this recovery entirely - leaving the learner on card 1 with the audio
                // finished and the activity block shut.
                var _$proseGrid = self.container.find('.cc5-prose-grid[data-prose-seq]').first();
                self.teardownVoiceoverSync();
                if (_$proseGrid && _$proseGrid.length) {
                    var _lastIdx = parseInt(_$proseGrid.attr('data-prose-total'), 10) - 1;
                    if (!isNaN(_lastIdx)) { self.revealProseCard(_$proseGrid, _lastIdx, false); }
                    _$proseGrid.find('.cc5-prose-next-btn').removeClass('cc5-prose-btn-ready');
                    self.revealProseActivities(_$proseGrid);
                }
                self.currentAudio = null;
                self.currentAudioSectionId = null;
                self.voiceoverPlayed = true;
                
                var sections = self.getCurrentSections();
                var currentSection = sections[self.currentSlideIndex];
                // v9.68: Removed cardType guard  -  multi-card learning sections have no
                // top-level cardType, so the guard was preventing markSectionComplete()
                // from ever being called on those slides, leaving the Next button
                // permanently disabled after voiceover. Now any slide type is marked
                // complete when its voiceover finishes; canNavigateNext() still enforces
                // activity-completion requirements for activity slides independently.
                if (currentSection) {
                    var completeId = currentSection.slideId || currentSection.id;
                    if (!self.isSectionComplete(completeId)) {
                        self.markSectionComplete(completeId);
                    }
                    if (self.slideCompletionTimer) {
                        clearTimeout(self.slideCompletionTimer);
                        self.slideCompletionTimer = null;
                    }
                }
                
                // v8.4.6: Only enable next if ALL progression requirements are met
                sections = self.getCurrentSections();
                currentSection = sections[self.currentSlideIndex];
                if (currentSection && self.canNavigateNext(currentSection)) {
                    self.container.find('.cc5-nav-chevron.cc5-next').removeClass('cc5-disabled').prop('disabled', false);
                    self.container.find('.cc5-voiceover-hint').fadeOut();
                    self.container.find('.cc5-fullscore-hint').fadeOut();
                } else {
                    // Voiceover done but activity still needed - update hint
                    self.container.find('.cc5-voiceover-hint').fadeOut(300, function () {
                        // After voiceover hint fades, show activity hint if needed
                        if (self.requireFullScore && !self.container.find('.cc5-fullscore-hint').length) {
                            var hintHtml = '<div class="cc5-fullscore-hint">';
                            hintHtml += '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
                            hintHtml += '<span>' + getLabel('perfectScoreRequired') + '</span>';
                            hintHtml += '</div>';
                            self.container.find('.cc5-nav-center').append(hintHtml);
                        }
                    });                }
                // v9.65: Safety re-check  -  ensures button state is correct regardless of
                // any async re-render that may have occurred while audio was playing.
                setTimeout(function () { self.updateActivityNavState(); }, 50);
            };
            
            this.currentAudio.onerror = function (e) {
                btn.removeClass('cc5-playing cc5-attention');
                var pauseBtn = self.container.find('.cc5-voiceover-pause-btn[data-section-id="' + sectionId + '"]');
                pauseBtn.hide();
                self.currentAudioSectionId = null;
                // v13.94.6: enabling the chevron here was not enough to release the gate.
                // canNavigateNext() still returns false while voiceoverPlayed is false, and
                // updateActivityNavState() re-disables the button the moment the learner
                // ticks a checkbox or finishes an activity - so a slide whose audio 404s
                // handed back a Next that went grey again permanently, with no control on
                // the page able to clear it. Audio that cannot play cannot be listened to,
                // so the listen requirement is satisfied by definition.
                self.voiceoverPlayed = true;
                self.container.find('.cc5-nav-chevron.cc5-next').removeClass('cc5-disabled').prop('disabled', false);
                var audioError = self.currentAudio && self.currentAudio.error;
                var errorCode = audioError ? audioError.code : 'unknown';
                var errorMsg = audioError ? audioError.message : 'unknown';
                ccError('[CC v' + CC_VERSION + '] Audio playback error - code: ' + errorCode + ', message: ' + errorMsg + ', sectionId: ' + sectionId);
                if (isPreGenerated) {
                    Notification.addNotification({
                        message: getLabel('audioPlayError'),
                        type: 'error'
                    });
                } else {
                    self.voiceoverRetryCount = (self.voiceoverRetryCount || 0) + 1;
                    if (self.voiceoverRetryCount < 2) {
                        delete self.voiceoverCache[sectionId];
                        // v13.94.6: drop the fingerprint with the entry it belongs to.
                        if (self.voiceoverCacheHash) { delete self.voiceoverCacheHash[sectionId]; }
                        self.playVoiceover(sectionId);
                    } else {
                        self.voiceoverRetryCount = 0;
                        Notification.addNotification({
                            message: getLabel('audioPlayErrorRetry'),
                            type: 'error'
                        });
                    }
                }
            };
            
            // v13.6: Catch play() promise rejections (e.g. browser autoplay policy) which
            // are otherwise completely silent — no onerror fires, no console output.
            var _playPromise = this.currentAudio.play();
            if (_playPromise !== undefined) {
                _playPromise.catch(function (e) {
                    ccError('[CC v' + CC_VERSION + '] audio.play() rejected | sectionId=' + sectionId + ' | ' + e.name + ': ' + e.message);
                    btn.removeClass('cc5-playing cc5-loading cc5-attention');
                    self.currentAudio = null;
                    self.currentAudioSectionId = null;
                    Notification.addNotification({
                        message: getLabel('audioBlocked'),
                        type: 'warning'
                    });
                });
            }
        },

        /**
         * Show workplace document popup modal (v6.5.3, v6.5.14: Pre-generated support)
         * Displays AI-generated contextual example document
         * v6.5.14: Checks for pre-generated content first - instant display for students
         * v6.5.43: Save/restore scroll position on open/close
         */
        showDocumentModal: function (docId, docName) {
            var self = this;
            
            // v6.5.43: Save scroll position before opening modal
            this.savedScrollPosition = window.pageYOffset || document.documentElement.scrollTop || 0;
            
            // Get context from manifest for contextual generation
            // v7.2.49 FIX: Include unitCode and unitTitle for SWMS/document relevance
            var context = {
                country: this.manifest.context?.country || 'AU',
                state: this.manifest.context?.state || '',
                industry: this.manifest.context?.industry || 'general',
                subIndustry: this.manifest.context?.subIndustry || '',
                jobLevel: this.manifest.context?.jobLevel || 'worker',
                jobTitle: this.manifest.context?.jobTitle || 'Worker',
                route: this.manifest.mode || 'workplace',
                unitCode: this.manifest.context?.unitCode || '',
                unitTitle: this.manifest.context?.unitTitle || ''
            };
            
            // v6.5.14: Check for pre-generated content first
            // v6.5.42: Also check runtime cache from preloading
            var pregenerated = this.manifest.documentExamples?.[docId];
            var cachedContent = this.documentCache?.[docId];
            
            // v7.2.63: Check if pregenerated content matches current unit context
            // If unit has changed OR old doc has no unitCode, force regeneration
            var currentUnit = this.manifest.context?.unitCode || '';
            if (pregenerated && pregenerated.content) {
                // An old document with no unitCode, or one built for a different unit,
                // is discarded so a fresh one is generated for the current context.
                if (!pregenerated.unitCode || pregenerated.unitCode !== currentUnit) {
                    pregenerated = null;
                }
            }
            
            var hasPregenerated = (pregenerated && pregenerated.content) || cachedContent;
            
            // Build modal HTML
            var html = '<div class="cc5-doc-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="cc5-doc-title">';
            html += '<div class="cc5-doc-modal">';
            
            // Header
            html += '<div class="cc5-doc-modal-header">';
            html += '<div class="cc5-doc-modal-title-group">';
            html += '<h3 class="cc5-doc-modal-title" id="cc5-doc-title">';
            html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>';
            html += escapeHtml(docName);
            html += '</h3>';
            html += '<span class="cc5-doc-modal-subtitle">' + getLabel('trainingExampleDocument') + '</span>';
            html += '</div>';
            html += '<button type="button" class="cc5-doc-modal-close" aria-label="' + getLabel('closeModal') + '">';
            html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
            html += '</button>';
            html += '</div>';
            
            // Body - v6.5.14: Show pre-generated content immediately OR loading state
            html += '<div class="cc5-doc-modal-body">';
            if (hasPregenerated) {
                // Instant display - no loading spinner!
                var contentToShow = (pregenerated && pregenerated.content) ? pregenerated.content : cachedContent;
                html += '<div class="cc5-doc-context-badge">';
                html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>';
                html += escapeHtml(context.industry) + ' | ' + escapeHtml(context.jobLevel);
                html += '</div>';
                // v13.86: defence in depth. The server now runs clean_text() over this,
                // but a manifest saved before v13.86 can still carry unsanitised markup,
                // so the client strips scripts and event handlers before rendering.
                html += '<div class="cc5-doc-content">' + sanitiseDocumentHtml(contentToShow) + '</div>';
                html += '<div class="cc5-doc-disclaimer">';
                html += '<strong>' + getLabel('trainingExampleTitle') + '</strong>  -  ' + getLabel('trainingExampleDisclaimer');
                html += '</div>';
                // Fallback: Show loading and fetch from API (legacy behavior)
                html += '<div class="cc5-doc-modal-loading">';
                html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>';
                html += '<span>' + getLabel('generatingContextualExample') + '</span>';
                html += '</div>';
            }
            html += '</div>';
            
            // Footer - v6.5.49: Add edit button for editors
            html += '<div class="cc5-doc-modal-footer">';
            if (this.canEdit && hasPregenerated) {
                html += '<button type="button" class="cc5-doc-modal-btn cc5-doc-modal-btn-secondary cc5-doc-edit-btn" data-doc-id="' + escapeHtml(docId) + '">';
                html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
                html += getLabel('editDocument');
                html += '</button>';
            }
            // v7.2.38: Removed Got it button - close X is sufficient
            html += '</div>';
            
            html += '</div></div>';
            
            // Append modal to body
            $(document.body).append(html);
            
            // WCAG 2.1 AA: Focus management
            // BUG-GAL-FOCUS-SELECTOR FIX: redundant wrong-target call removed.
            // The correct focus is applied two lines below via .cc5-doc-modal-close.
            
            // v6.5.64: Apply document table formatting fixes after DOM insertion
            var $modal = $('.cc5-doc-modal');
            applyDocumentTableFixes($modal);
            
            // Focus trap - focus the modal
            $('.cc5-doc-modal-close').first().focus();
            
            // v6.5.49: Edit button click handler
            if (this.canEdit && hasPregenerated) {
                var contentToEdit = (pregenerated && pregenerated.content) ? pregenerated.content : cachedContent;
                $('.cc5-doc-edit-btn').on('click', function () {
                    self.toggleDocumentEditMode(docId, docName, contentToEdit);
                });
            }
            
            // Only fetch from API if not pre-generated (fallback for older manifests)
            if (!hasPregenerated) {
                this.fetchDocumentContent(docId, docName, context);
            }
        },

        /**
         * Toggle document edit mode (v6.5.49)
         * Switches between view and edit mode for document content
         */
        toggleDocumentEditMode: function (docId, docName, currentContent) {
            var self = this;
            var $body = $('.cc5-doc-modal-body');
            var $editBtn = $('.cc5-doc-edit-btn');
            var isEditing = $editBtn.hasClass('cc5-editing');
            
            if (!isEditing) {
                // Switch to edit mode
                $editBtn.addClass('cc5-editing');
                $editBtn.html('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>' + getLabel('saveDocument'));
                
                // Get current content (strip HTML for editing)
                var $contentDiv = $body.find('.cc5-doc-content');
                var htmlContent = $contentDiv.html();
                
                // Store original for cancel
                $body.data('original-content', htmlContent);
                
                // Replace content div with textarea
                var editHtml = '<div class="cc5-doc-edit-container">';
                editHtml += '<label class="cc5-doc-edit-label">' + getLabel('documentContent') + '</label>';
                editHtml += '<textarea class="cc5-doc-edit-textarea" rows="20">' + escapeHtml(htmlContent) + '</textarea>';
                editHtml += '</div>';
                
                $contentDiv.replaceWith(editHtml);
                
                // Focus textarea
                $body.find('.cc5-doc-edit-textarea').focus();
            } else {
                // Save and switch to view mode
                var $textarea = $body.find('.cc5-doc-edit-textarea');
                var newContent = $textarea.val();
                
                // Show saving state
                $editBtn.prop('disabled', true);
                $editBtn.html('<svg class="cc5-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>' + getLabel('saving'));
                
                // Save to manifest
                this.saveDocumentContent(docId, newContent, function (success) {
                    if (success) {
                        // Replace textarea with rendered content
                        var viewHtml = '<div class="cc5-doc-content">' + newContent + '</div>';
                        $body.find('.cc5-doc-edit-container').replaceWith(viewHtml);
                        
                        // Reset button to edit mode
                        $editBtn.removeClass('cc5-editing');
                        $editBtn.prop('disabled', false);
                        $editBtn.html('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' + getLabel('editDocument'));
                        
                        // Show success notification
                        self.showDocumentSaveNotification(true);
                    } else {
                        // Restore button on error
                        $editBtn.prop('disabled', false);
                        $editBtn.html('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>' + getLabel('saveDocument'));
                        self.showDocumentSaveNotification(false);
                    }
                });
            }
        },

        /**
         * Save document content to manifest (v6.5.49)
         */
        saveDocumentContent: function (docId, content, callback) {
            
            // Update local manifest
            if (!this.manifest.documentExamples) {
                this.manifest.documentExamples = {};
            }
            // v7.2.63: Store unit context so we can detect when regeneration is needed
            this.manifest.documentExamples[docId] = {
                content: content,
                updatedAt: new Date().toISOString(),
                unitCode: this.manifest.context?.unitCode || '',
                unitTitle: this.manifest.context?.unitTitle || ''
            };
            
            // Also update cache
            if (!this.documentCache) {
                this.documentCache = {};
            }
            this.documentCache[docId] = content;
            
            // Save to server via AJAX
            Ajax.call([{
                methodname: 'mod_contentcreator_save_manifest',
                args: {
                    cmid: this.cmid,
                    manifest: JSON.stringify(this.manifest)
                }
            }])[0].done(function (response) {
                callback(response.success !== false);
            }).fail(function (error) {
                showErrorToast(getLabel('documentSaveFailed') || 'Could not save document. Please try again.', 'saveDocumentContent', error);
                callback(false);
            });
        },

        /**
         * Show save notification (v6.5.49)
         */
        showDocumentSaveNotification: function (success) {
            var message = success ? getLabel('documentSaved') : 'Error saving document';
            var className = success ? 'cc5-doc-save-success' : 'cc5-doc-save-error';
            
            var html = '<div class="cc5-doc-save-notification ' + className + '" role="alert" aria-live="polite">';
            if (success) {
                html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
            } else {
                html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
            }
            html += message + '</div>';
            
            var $notification = $(html);
            $('.cc5-doc-modal-body').prepend($notification);
            
            // Auto-remove after 3 seconds
            setTimeout(function () {
                $notification.fadeOut(300, function () {
                    $(this).remove();
                });
            }, 3000);
        },

        /**
         * v7.1.8: Show PDF viewer modal at specific page
         * Opens uploaded reference PDFs in an embedded viewer with page navigation
         */
        showPdfModal: function (docId, sectionTitle, targetPage) {
            var self = this;
            
            // Save scroll position
            this.savedScrollPosition = window.pageYOffset || document.documentElement.scrollTop || 0;
            
            // Find the reference document in manifest
            var refDoc = null;
            var refDocs = this.manifest.context?.pdfDocuments || [];
            
            for (var i = 0; i < refDocs.length; i++) {
                if (refDocs[i].id === docId || refDocs[i].name === docId) {
                    refDoc = refDocs[i];
                    break;
                }
            }
            
            if (!refDoc || !refDoc.pdfBase64 || refDoc.pdfBase64.length < 100 || (!refDoc.pdfBase64.startsWith('data:application/pdf') && !refDoc.pdfBase64.startsWith('data:application/octet-stream'))) {
                this.showDocumentModal(docId, sectionTitle || docId);
                return;
            }
            
            var page = targetPage || 1;
            var totalPages = refDoc.pageCount || 1;
            var docName = refDoc.title || refDoc.name || 'Reference Document';
            
            // Build modal HTML with PDF viewer
            var html = '<div class="cc5-pdf-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="cc5-pdf-title">';
            html += '<div class="cc5-pdf-modal">';
            
            // Header with page navigation
            html += '<div class="cc5-pdf-modal-header">';
            html += '<div class="cc5-pdf-modal-title-group">';
            html += '<h3 class="cc5-pdf-modal-title" id="cc5-pdf-title">';
            html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>';
            html += escapeHtml(docName);
            html += '</h3>';
            if (sectionTitle) {
                html += '<span class="cc5-pdf-modal-subtitle">' + escapeHtml(sectionTitle) + '</span>';
            }
            html += '</div>';
            
            // Page navigation controls
            html += '<div class="cc5-pdf-nav-controls">';
            html += '<button type="button" class="cc5-pdf-nav-btn cc5-pdf-prev" data-action="pdf-prev" ' + (page <= 1 ? 'disabled' : '') + ' aria-label="' + getLabel('previousPage') + '">';
            html += '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>';
            html += '</button>';
            html += '<span class="cc5-pdf-page-info">' + getLabel('pageXofY').replace('{current}', '<span class="cc5-pdf-current-page">' + page + '</span>').replace('{total}', totalPages) + '</span>';
            html += '<button type="button" class="cc5-pdf-nav-btn cc5-pdf-next" data-action="pdf-next" ' + (page >= totalPages ? 'disabled' : '') + ' aria-label="' + getLabel('nextPage') + '">';
            html += '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>';
            html += '</button>';
            html += '</div>';
            
            // Close button
            html += '<button type="button" class="cc5-pdf-modal-close" aria-label="' + getLabel('closePdfViewer') + '">';
            html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
            html += '</button>';
            html += '</div>';
            
            // PDF viewer body - v7.2.62: Use Blob URL for better browser compatibility
            html += '<div class="cc5-pdf-modal-body">';
            // Create placeholder iframe - will set src after DOM insertion using Blob URL
            html += '<iframe class="cc5-pdf-iframe" data-page="' + page + '" title="' + getLabel('pdfDocumentViewer') + '"></iframe>';
            html += '</div>';
            
            html += '</div>'; // .cc5-pdf-modal
            html += '</div>'; // .cc5-pdf-modal-overlay
            
            // Remove any existing PDF modals and add new one
            $('.cc5-pdf-modal-overlay').remove();
            $(document.body).append(html);
            
            // v7.2.62: Convert base64 to Blob URL for better browser compatibility
            // Data URLs in iframes are blocked by some browsers for security
            var $iframe = $('.cc5-pdf-iframe');
            try {
                // Extract base64 data (remove data:application/pdf;base64, prefix)
                var base64Data = refDoc.pdfBase64.split(',')[1];
                if (base64Data) {
                    var binaryString = atob(base64Data);
                    var bytes = new Uint8Array(binaryString.length);
                    // Distinct counter name: 'i' is already the reference-document lookup
                    // counter earlier in this same function scope.
                    for (var _bi = 0; _bi < binaryString.length; _bi++) {
                        bytes[_bi] = binaryString.charCodeAt(_bi);
                    }
                    var blob = new Blob([bytes], { type: 'application/pdf' });
                    var blobUrl = URL.createObjectURL(blob);
                    $iframe.attr('src', blobUrl + '#page=' + page);
                    
                    // v7.2.80: Add page navigation guidance since #page=X doesn't work with blob URLs
                    if (page > 1) {
                        var $body = $('.cc5-pdf-modal-body');
                        $body.prepend('<div class="cc5-pdf-page-hint">' + getLabel('pdfPageHint').replace('{page}', page) + '</div>');
                    }
                    
                    // Store blob URL for cleanup and navigation
                    $iframe.data('blob-url', blobUrl);
                }
            } catch (e) {
                // Fallback to data URL
                $iframe.attr('src', refDoc.pdfBase64 + '#page=' + page);
            }
            
            // Store current state for navigation
            var $overlay = $('.cc5-pdf-modal-overlay');
            $overlay.data('doc-id', docId);
            $overlay.data('current-page', page);
            $overlay.data('total-pages', totalPages);
            $overlay.data('pdf-base64', refDoc.pdfBase64);
            
            // Bind close handlers
            $overlay.on('click', function (e) {
                if ($(e.target).hasClass('cc5-pdf-modal-overlay')) {
                    // v7.2.62: Cleanup Blob URL before removing
                    var blobUrl = $overlay.find('.cc5-pdf-iframe').data('blob-url');
                    if (blobUrl) URL.revokeObjectURL(blobUrl);
                    $overlay.remove();
                    if (typeof self.savedScrollPosition === 'number') {
                        window.scrollTo(0, self.savedScrollPosition);
                    }
                }
            });
            
            $overlay.find('.cc5-pdf-modal-close').on('click', function (e) {
                e.preventDefault();
                $overlay.remove();
                if (typeof self.savedScrollPosition === 'number') {
                    window.scrollTo(0, self.savedScrollPosition);
                }
            });
            
            // Bind page navigation
            $overlay.on('click', '.cc5-pdf-nav-btn', function (e) {
                e.preventDefault();
                var action = $(this).data('action');
                var currentPage = $overlay.data('current-page');
                var total = $overlay.data('total-pages');
                var base64 = $overlay.data('pdf-base64');
                
                if (action === 'pdf-prev' && currentPage > 1) {
                    currentPage--;
                } else if (action === 'pdf-next' && currentPage < total) {
                    currentPage++;
                }
                
                $overlay.data('current-page', currentPage);
                $overlay.find('.cc5-pdf-current-page').text(currentPage);
                // v7.2.62: Recreate Blob URL for new page
                var $iframe = $overlay.find('.cc5-pdf-iframe');
                var oldBlobUrl = $iframe.data('blob-url');
                if (oldBlobUrl) {
                    URL.revokeObjectURL(oldBlobUrl); // Cleanup old Blob
                }
                try {
                    var base64Data = base64.split(',')[1];
                    if (base64Data) {
                        var binaryString = atob(base64Data);
                        var bytes = new Uint8Array(binaryString.length);
                        for (var i = 0; i < binaryString.length; i++) {
                            bytes[i] = binaryString.charCodeAt(i);
                        }
                        var blob = new Blob([bytes], { type: 'application/pdf' });
                        var blobUrl = URL.createObjectURL(blob);
                        $iframe.attr('src', blobUrl + '#page=' + currentPage);
                        $iframe.data('blob-url', blobUrl);
                    }
                } catch (e) {
                    // Fallback
                    $iframe.attr('src', base64 + '#page=' + currentPage);
                }
                $overlay.find('.cc5-pdf-prev').prop('disabled', currentPage <= 1);
                $overlay.find('.cc5-pdf-next').prop('disabled', currentPage >= total);
            });
            
            // Escape key to close
            $(document).one('keydown.cc5pdfmodal', function (e) {
                if (e.key === 'Escape') {
                    $overlay.remove();
                    if (typeof self.savedScrollPosition === 'number') {
                        window.scrollTo(0, self.savedScrollPosition);
                    }
                }
            });
        },

        /**
         * Fetch document content from API (v6.5.3)
         */
        fetchDocumentContent: function (docId, docName, context) {
            var self = this;
            
            // Build request data
            var requestData = {
                cmid: this.cmid,
                docId: docId,
                docName: docName,
                country: context.country,
                state: context.state,
                industry: context.industry,
                subIndustry: context.subIndustry,
                jobLevel: context.jobLevel,
                jobTitle: context.jobTitle,
                route: context.route,
                // v7.1.5: Pass unit of competency for relevant document content
                unitCode: context.unitCode || '',
                unitTitle: context.unitTitle || ''
            };
            
            // Make AJAX call to Moodle web service
            Ajax.call([{
                methodname: 'mod_contentcreator_generate_document_example',
                args: requestData
            }])[0].done(function (response) {
                if (response.success && response.content) {
                    // FIX-CC-DOCEXAMPLE-NEVER-CACHED (v13.95.1): store what we just paid for.
                    // Only the teacher edit-and-save path used to populate documentCache, so a
                    // learner re-opening the same document in the same session billed a fresh
                    // generation every time. The server-side cache added in this release makes
                    // the repeat free site-wide; this makes it free without a round trip at all.
                    if (!self.documentCache) {
                        self.documentCache = {};
                    }
                    self.documentCache[docId] = response.content;
                    self.renderDocumentContent(response.content, docName, context);
                } else {
                    self.renderDocumentError(response.error || 'Failed to generate document example');
                }
            }).fail(function (error) {
                // Show fallback content instead of error.
                ccWarn('generate_document_example failed, showing fallback', error);
                self.renderDocumentFallback(docId, docName, context);
            });
        },

        /**
         * Render document content in modal (v6.5.3)
         */
        renderDocumentContent: function (content, docName, context) {
            var $body = $('.cc5-doc-modal-body');
            
            var html = '';
            
            // Context badge
            html += '<div class="cc5-doc-context-badge">';
            html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>';
            html += escapeHtml(context.industry) + ' | ' + escapeHtml(context.jobLevel);
            html += '</div>';
            
            // Document content
            html += '<div class="cc5-doc-content">';
            html += content; // Already formatted HTML from API
            html += '</div>';
            
            // Mandatory disclaimer
            html += '<div class="cc5-doc-disclaimer">';
            html += '<strong>' + getLabel('trainingExampleTitle') + '</strong>  -  ' + getLabel('trainingExampleDisclaimer');
            html += '</div>';
            
            $body.html(html);
        },

        /**
         * Render document error in modal (v6.5.3)
         */
        renderDocumentError: function (errorMessage) {
            var $body = $('.cc5-doc-modal-body');
            
            var html = '<div class="cc5-doc-modal-error">';
            html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" x2="9" y1="9" y2="15"/><line x1="9" x2="15" y1="9" y2="15"/></svg>';
            html += '<span>' + escapeHtml(errorMessage) + '</span>';
            html += '</div>';
            
            $body.html(html);
        },

        /**
         * Render fallback document content (v6.5.3)
         * Shows static example when API is unavailable
         */
        renderDocumentFallback: function (docId, docName, context) {
            var $body = $('.cc5-doc-modal-body');
            
            // Static fallback content based on document type
            var fallbackContent = this.getFallbackDocumentContent(docId, context);
            
            var html = '';
            
            // Context badge
            html += '<div class="cc5-doc-context-badge">';
            html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>';
            html += escapeHtml(context.industry) + ' | ' + escapeHtml(context.jobLevel);
            html += '</div>';
            
            // Document content
            html += '<div class="cc5-doc-content">';
            html += fallbackContent;
            html += '</div>';
            
            // Mandatory disclaimer
            html += '<div class="cc5-doc-disclaimer">';
            html += '<strong>' + getLabel('trainingExampleTitle') + '</strong>  -  ' + getLabel('trainingExampleDisclaimer');
            html += '</div>';
            
            $body.html(html);
        },

        /**
         * Get fallback document content for common document types (v6.5.3)
         */
        getFallbackDocumentContent: function (docId, context) {
            var fallbacks = {
                swms: getLabel('docFallbackSwms'),
                jsa: getLabel('docFallbackJsa'),
                risk_assessment: getLabel('docFallbackRiskAssessment'),
                incident_report: getLabel('docFallbackIncidentReport'),
                sop: getLabel('docFallbackSop')
            };
            
            // v6.6.6: Fixed banned phrase "ensure compliance"  ->  use observable action language
            return fallbacks[docId] || '<h3>' + escapeHtml(docId.replace(/_/g, ' ').replace(/\b\w/g, function (l) { return l.toUpperCase(); })) + '</h3>' + getLabel('docFallbackGenericBody');
        }
    };

    return {
        /**
         * Initialize the Content Creator v6 Player
         */
        init: function (config) {
            // v13.86: bring the player's labels under Moodle's string API. One batched
            // request; the private table serves until it lands, and for any key a site
            // has not overridden.
            try {
                preloadMoodleLabels(Object.keys(UI_LABELS.en || {}));
            } catch (e) {
                // Non-fatal - getLabel() falls back to the private table.
            }
            // v13.86: apply the dark theme classes the stylesheet has always expected.
            // player5.css carries 335 dark rules across six selector families -
            // `.dark`, `.cc5-dark`, `.cc5-container.cc5-dark`, `.cc5-player.dark-mode`,
            // `body.dark` and `body[data-bs-theme="dark"]` - and NOTHING in the plugin
            // ever set any of them. Only the Bootstrap attribute could fire, and only if
            // the site's theme happens to put it on <body> rather than <html>, so on a
            // dark Moodle the cards kept their near-white backgrounds behind light text.
            // Rather than rewrite six families of CSS, resolve the theme once and stamp
            // every class name they look for, then keep it in step with the environment.
            applyThemeClasses();
            $(document).ready(function () {
                var container = $('#contentcreator-app');

                Ajax.call([{
                    methodname: 'mod_contentcreator_get_manifest',
                    args: { cmid: config.cmid }
                }])[0].done(function (response) {
                    if (!response.success || !response.manifest) {
                        // v9.72 FIX: Missing else for empty/failed manifest  -  previously left container
                        // blank with no visible feedback when manifest was empty.
                        var html = '<div class="cc5-no-content">';
                        html += '<div class="cc5-no-content-icon">' + getIcon('sparkles') + '</div>';
                        html += '<h2>' + getLabel('contentComingSoon') + '</h2>';
                        html += '<p>' + getLabel('instructorPreparingContent') + '</p>';
                        html += '<p>' + getLabel('pleaseCheckBackLater') + '</p>';
                        html += '</div>';
                        container.html(html);
                        return;
                    }

                    var manifest;
                    try {
                        manifest = JSON.parse(response.manifest);
                    } catch (e) {
                        // v9.72 FIX: Corrected log message  -  was "Manifest parsed" (wrong, in catch).
                        // v13.85: the container.html() call had been merged onto the end of
                        // that comment, so a corrupted manifest returned silently and the
                        // learner got a blank page with no explanation.
                        container.html('<div class="cc5-error">' + getLabel('contentDataCorrupted') + '</div>');
                        return;
                    }

                    // v10.99 FIX-LOAD-NORMALIZE: normalizeCardSchema in generator.js only runs during
                    // content generation, not at load time.  Manifests saved before v10.97 can contain
                    // hook-scenario / applied-scenario cards whose text is stored in a flat `content`
                    // or `description` field (no `sceneParts` array).  The player renders those cards
                    // with the numbered-circle fallback (icons missing, no panel text).
                    // Fix: run the same sceneParts synthesis and field-alias expansion on every card
                    // immediately after JSON.parse so every render path sees correct data.
                    (function _normSceneParts99(mf) {
                        if (!mf || !Array.isArray(mf.topics)) return;
                        var _hookTitles = ['The Setting', 'The Details', 'What Happened', 'The Pressure'];
                        var _applyTitles = ['Back on the Job', 'The New Challenge', 'The Decision Moment', 'The Right Move'];
                        mf.topics.forEach(function (topic) {
                            if (!topic || !Array.isArray(topic.sections)) return;
                            topic.sections.forEach(function (section) {
                                // Normalize cards[] array (7-card unified sections)
                                if (Array.isArray(section.cards)) {
                                    section.cards.forEach(function (card) {
                                        if (card.cardType !== 'hook-scenario' && card.cardType !== 'applied-scenario') return;
                                        // Alias normalization (mirrors generator.js normalizeCardSchema)
                                        if (!card.sceneParts && card.scene_parts) { card.sceneParts = card.scene_parts; }
                                        if (!card.sceneParts && card.parts && Array.isArray(card.parts)) { card.sceneParts = card.parts; }
                                        // Normalize existing sceneParts field names
                                        if (Array.isArray(card.sceneParts)) {
                                            card.sceneParts = card.sceneParts.map(function (p) {
                                                if (typeof p === 'string') return { title: '', icon: '', text: p };
                                                return {
                                                    title: p.title || p.label || '',
                                                    icon: p.icon || '',
                                                    text: p.text || p.content || p.description || p.detail || p.body || p.narrative || ''
                                                };
                                            });
                                        }
                                        // Synthesis fallback: build 4 sceneParts from flat text
                                        if (!card.sceneParts || !card.sceneParts.length) {
                                            var _titles = card.cardType === 'applied-scenario' ? _applyTitles : _hookTitles;
                                            // FIX-CC-FAILED-SCENE-PARTS: failed card descriptions contain the topic title
                                            // which may have dots (e.g. "1.4. Load is packed..."), causing the sentence-split
                                            // regex to fragment the error message across all 4 quadrant fields.
                                            // Guard: build clean error sceneParts for failed cards instead of splitting.
                                            if (card.failed) {
                                                card.sceneParts = [
                                                    { title: _titles[0], icon: '', text: 'AI generation failed for this topic.' },
                                                    { title: _titles[1], icon: '', text: '' },
                                                    { title: _titles[2], icon: '', text: '' },
                                                    { title: _titles[3], icon: '', text: 'Please use \u201cRegenerate Failed\u201d to retry.' },
                                                ];
                                            } else {
                                                var _flat = (card.content || card.description || card.bodyText || '').trim();
                                                if (_flat) {
                                                    var _sents = _flat.match(/[^.!?]+[.!?][\s]*/g) || [_flat];
                                                    _sents = _sents.map(function (s) { return s.trim(); }).filter(Boolean);
                                                    card.sceneParts = [];
                                                    for (var _pi = 0; _pi < 4; _pi++) {
                                                        var _s = Math.floor(_pi * _sents.length / 4);
                                                        var _e = Math.min(Math.floor((_pi + 1) * _sents.length / 4), _sents.length);
                                                        var _txt = _sents.slice(_s, Math.max(_s + 1, _e)).join(' ').trim();
                                                        card.sceneParts.push({ title: _titles[_pi], icon: '', text: _txt || _sents[Math.min(_pi, _sents.length - 1)] || '' });
                                                    }                                                }
                                            }
                                        }
                                    });
                                }
                                // Also normalize single-card sections (section.cardType without section.cards[])
                                if (!Array.isArray(section.cards) && (section.cardType === 'hook-scenario' || section.cardType === 'applied-scenario')) {
                                    if (!section.sceneParts && section.scene_parts) { section.sceneParts = section.scene_parts; }
                                    if (!section.sceneParts && section.parts && Array.isArray(section.parts)) { section.sceneParts = section.parts; }
                                    if (Array.isArray(section.sceneParts)) {
                                        section.sceneParts = section.sceneParts.map(function (p) {
                                            if (typeof p === 'string') return { title: '', icon: '', text: p };
                                            return {
                                                title: p.title || p.label || '',
                                                icon: p.icon || '',
                                                text: p.text || p.content || p.description || p.detail || p.body || p.narrative || ''
                                            };
                                        });
                                    }
                                    if (!section.sceneParts || !section.sceneParts.length) {
                                        var _flatS = (section.content || section.description || section.bodyText || '').trim();
                                        if (_flatS) {
                                            var _sentsS = _flatS.match(/[^.!?]+[.!?][\s]*/g) || [_flatS];
                                            _sentsS = _sentsS.map(function (s) { return s.trim(); }).filter(Boolean);
                                            var _titlesS = section.cardType === 'applied-scenario' ? _applyTitles : _hookTitles;
                                            section.sceneParts = [];
                                            for (var _piS = 0; _piS < 4; _piS++) {
                                                var _sS = Math.floor(_piS * _sentsS.length / 4);
                                                var _eS = Math.min(Math.floor((_piS + 1) * _sentsS.length / 4), _sentsS.length);
                                                var _txtS = _sentsS.slice(_sS, Math.max(_sS + 1, _eS)).join(' ').trim();
                                                section.sceneParts.push({ title: _titlesS[_piS], icon: '', text: _txtS || _sentsS[Math.min(_piS, _sentsS.length - 1)] || '' });
                                            }
                                        }
                                    }
                                }
                            });
                        });
                    }(manifest));

                    if (manifest && manifest.topics && manifest.topics.length > 0) {                        window.CC5Player = new Player({
                            cmid: config.cmid,
                            manifest: manifest,
                            container: container,
                            canEdit: config.canEdit,
                            // v12.19 FIX: Wire isTeacher from PHP config into Player constructor.
                            // view.php passes isTeacher=(bool)$hasCapability correctly since v12.16,
                            // but this constructor call never forwarded it  -  so this.isTeacher was
                            // ALWAYS false, blocking voiceover playback for teachers/admins with
                            // edit mode OFF. All 8 guards using !this.isTeacher were dead code.
                            isTeacher: config.isTeacher || false,
                            requireFocus: config.requireFocus || false,
                            requireFullScore: config.requireFullScore || false
                        });
                    } else {
                        // v9.72 FIX: manifest.topics.length crashed with TypeError when manifest.topics
                        // is undefined (e.g. manifest = {locked:true} with no topics array).
                        // That TypeError prevented "Content Coming Soon" from rendering  ->  blank white page.
                        // v13.85: the declaration below had been merged onto the end of that
                        // comment. `html` was only var-hoisted, so the next line ran
                        // `undefined += ...` and the screen rendered the literal word
                        // "undefined" with no wrapper element - the very failure the
                        // comment above describes, reintroduced by a line merge.
                        var emptyHtml = '<div class="cc5-no-content">';
                        emptyHtml += '<div class="cc5-no-content-icon">' + getIcon('sparkles') + '</div>';
                        emptyHtml += '<h2>' + getLabel('contentComingSoon') + '</h2>';
                        emptyHtml += '<p>' + getLabel('instructorPreparingContent') + '</p>';
                        emptyHtml += '<p>' + getLabel('pleaseCheckBackLater') + '</p>';
                        emptyHtml += '</div>';
                        container.html(emptyHtml);
                    }
                }).fail(function (error) {
                    ccError('Manifest could not be loaded', error);
                    // The refresh handler is bound in JS rather than emitted as an inline
                    // onclick attribute, which any Content-Security-Policy without
                    // 'unsafe-inline' would block.
                    container.html('<div class="cc5-error"><div class="cc5-error-icon">' + getIcon('alertTriangle') +
                        '</div><h3>' + getLabel('unableToLoadContent') + '</h3><p>We encountered a problem loading this activity. ' +
                        'Please try refreshing the page.</p>' +
                        '<button type="button" class="cc5-btn cc5-retry-btn">' + getLabel('refreshPage') + '</button></div>');
                    container.find('.cc5-retry-btn').on('click', function () {
                        window.location.reload();
                    });
                });
            });
        }
    };
});
