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
 * Content Creator v3.0.0 - Manifest Builder
 * [SPEC] Immutable manifest after generation
 * [SPEC] Validates and locks content structure
 *
 * @module     mod_contentcreator/manifest.builder
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
define(['mod_contentcreator/planner', 'mod_contentcreator/generator', 'mod_contentcreator/cc-state'], function (Planner, Generator, CcState) {
    'use strict';

    // Gated diagnostics  -  silent in production, enabled by flipping the flag in cc-state.js.
    var _log = CcState.createLogger(false);
    var ccLog = _log.log;
    var ccError = _log.error;

    const STATUS = {
        EMPTY: 'empty',
        PLANNING: 'planning',
        GENERATING: 'generating',
        COMPLETE: 'complete',
        ERROR: 'error'
    };

    const validateInputs = (inputs) => {
        const errors = [];

        if (!inputs.mode) {
            errors.push('Mode is required (VET, Workplace, or University)');
        }

        // If topicPlan already exists with topics, skip strict validation
        // The AI already planned the content structure
        if (inputs.topicPlan?.topics?.length > 0) {
            return { valid: true, errors: [] };
        }

        // VET mode validation - criteria is tgaData object with elements
        if (inputs.mode === 'vet') {
            if (!inputs.criteria || typeof inputs.criteria !== 'object') {
                errors.push('TGA unit data is required for VET mode');
            } else if (!inputs.criteria.elements || !Array.isArray(inputs.criteria.elements) || inputs.criteria.elements.length === 0) {
                // Check alternative property names
                const hasData = inputs.criteria.performanceCriteria?.length > 0 ||
                               inputs.criteria.knowledgeEvidence?.length > 0 ||
                               inputs.criteria.code || inputs.criteria.unitCode;
                if (!hasData) {
                    errors.push('Unit must have TGA data');
                }
            }
        } 
        // Workplace mode validation (v6.5.11)
        else if (inputs.mode === 'workplace') {
            // Workplace mode uses context for validation, not criteria
            // Topics are generated from uploaded document content
            if (!inputs.context) {
                errors.push('Workplace context is required');
            }
        }
        // University mode validation - criteria has outcomes array
        else if (inputs.mode === 'university') {
            if (!inputs.context?.courseName || inputs.context.courseName.trim() === '') {
                errors.push('Course name is required');
            }
            if (!inputs.criteria?.outcomes || !Array.isArray(inputs.criteria.outcomes) || inputs.criteria.outcomes.length === 0) {
                errors.push('At least one learning outcome is required');
            }
        }

        return {
            valid: errors.length === 0,
            errors: errors
        };
    };

    // v6.6.15: Options for build function
    // - regenerateFailedOnly: if true, only regenerate slides with generated:false
    // - existingManifest: the saved manifest with content to preserve
    const build = async (inputs, cmid, callbacks, options = {}) => {
        const { onStatus, onProgress, onComplete, onError } = callbacks || {};
        const { regenerateFailedOnly = false, existingManifest = null } = options;

        ccLog('[ManifestBuilder]', 'build() CALLED | mode=' + inputs?.mode + ' | cmid=' + cmid);

        const validation = validateInputs(inputs);
        ccLog('[ManifestBuilder]', 'Validation:', validation.valid ? 'PASSED' : 'FAILED: ' + validation.errors.join(', '));
        if (!validation.valid) {
            if (onError) onError(validation.errors.join('. '));
            return { success: false, errors: validation.errors };
        }

        try {
            if (onStatus) onStatus(STATUS.PLANNING);
            ccLog('[ManifestBuilder]', 'Has topicPlan=' + !!(inputs.topicPlan?.topics?.length > 0) + ' | topics=' + (inputs.topicPlan?.topics?.length || 0));

            let plannedManifest;
            if (inputs.topicPlan && inputs.topicPlan.topics && inputs.topicPlan.topics.length > 0) {
                plannedManifest = {
                    version: '6.3.0',
                    locked: false,
                    createdAt: new Date().toISOString(),
                    mode: inputs.mode,
                    context: inputs.context,
                    topics: inputs.topicPlan.topics,
                    totalSections: inputs.topicPlan.topics.reduce((sum, t) => sum + (t.subtopics?.length || t.sections?.length || 0), 0),
                    estimatedMinutes: inputs.duration || 10,
                    settings: inputs.settings || { progressionMode: 'free', slideDuration: 10, topicNavMode: 'free' },
                    voiceSettings: inputs.voiceSettings || { enabled: true, gender: 'female', language: 'en-AU' },
                    imageSettings: inputs.imageSettings || { enabled: false }, // v7.5.13: FIX - Pass imageSettings to generator
                    appearanceSettings: inputs.appearanceSettings || { headerColor: null }
                };
                // v7.5.13: Debug logging for imageSettings flow
            } else {
                plannedManifest = Planner.plan({
                    mode: inputs.mode,
                    context: inputs.context,
                    criteria: inputs.criteria,
                    duration: inputs.duration || 10
                });
                // Add settings and voiceSettings to Planner.plan() output (v6.3.0)
                plannedManifest.settings = inputs.settings || { progressionMode: 'free', slideDuration: 10, topicNavMode: 'free' };
                plannedManifest.voiceSettings = inputs.voiceSettings || { enabled: true, gender: 'female', language: 'en-AU' };
                plannedManifest.imageSettings = inputs.imageSettings || { enabled: false }; // v7.5.13: FIX - Pass imageSettings to generator
                plannedManifest.appearanceSettings = inputs.appearanceSettings || { headerColor: null };
                // v7.5.13: Debug logging for imageSettings flow
            }
            

            ccLog('[ManifestBuilder]', 'plannedManifest ready | topics=' + (plannedManifest.topics?.length || 0) + ' | sections=' + plannedManifest.totalSections);
            if (onStatus) onStatus(STATUS.GENERATING);
            ccLog('[ManifestBuilder]', 'Calling Generator.generate()...');

            const generatedManifest = await Generator.generate(
                plannedManifest,
                cmid,
                onProgress,
                { regenerateFailedOnly, existingManifest }
            );

            // v13.84: replace the planned duration with a measured one.
            // estimatedMinutes was the author's target from the planning step and
            // was never revisited, so every pack declared 10 minutes while its
            // narration alone ran 18-23. It now describes the pack that was actually
            // generated. Note the value is currently written but not read anywhere in
            // the plugin - it is carried in the manifest for export and reporting, and
            // it needs to be right before anything starts displaying it.
            generatedManifest.estimatedMinutes = estimateMinutes(generatedManifest)
                || generatedManifest.estimatedMinutes || inputs.duration || 10;

            generatedManifest.locked = true;
            generatedManifest.lockedAt = new Date().toISOString();
            generatedManifest.inputHash = hashInputs(inputs);

            if (onStatus) onStatus(STATUS.COMPLETE);
            // v13.94.3: onComplete is the ~500-line post-generation stage in builder.js
            // (voiceover pre-generation, then saveManifest). It is async. Calling it
            // without awaiting meant build() resolved success while that work was still
            // in flight, and any rejection inside it surfaced as an unhandled rejection
            // rather than reaching the catch below.
            if (onComplete) { await onComplete(generatedManifest); }

            return { success: true, manifest: generatedManifest };

        } catch (error) {
            ccError('[CC DIAG ManifestBuilder] build() EXCEPTION:', error.message, error.stack);
            if (onStatus) onStatus(STATUS.ERROR);
            if (onError) onError(error.message);
            return { success: false, error: error.message };
        }
    };

    /**
     * v13.84: measure a generated pack's real running time.
     *
     * Narration at 150 words per minute, plus reading time for the visible text
     * on cards that carry no voiceover (200 wpm), plus 45 seconds for each
     * interactive card the learner has to answer. Rounded up to the nearest minute.
     *
     * @param {Object} manifest A generated manifest.
     * @return {Number} Estimated minutes, or 0 if nothing could be measured.
     */
    const estimateMinutes = (manifest) => {
        const NARRATION_WPM = 150;
        const READING_WPM = 200;
        const INTERACTION_MINUTES = 0.75;
        // Cards the learner has to act on rather than watch. decision-point is the
        // interactive card in the unified 7-card sequence; its voiceoverText is
        // deliberately cleared during generation, so it reaches the reading branch.
        const INTERACTIVE_CARD_TYPES = /^(decision-point|scenario-decision|spot-issue|sequence-order|requirement-match|behaviour-sort)$/;

        const wordCount = (value) => {
            if (typeof value !== 'string') { return 0; }
            const trimmed = value.trim();
            return trimmed ? trimmed.split(/\s+/).length : 0;
        };

        // Walk any shape of card object and total its human-readable strings,
        // skipping the keys that hold markup, ids, urls or the voiceover itself.
        const SKIP_KEYS = /^(voiceoverText|voiceover|audioUrl|imageUrl|image|icon|id|cardType|type|contrastType|slideHtml|html|url|src|class|className)$/;
        const visibleWords = (node, depth) => {
            if (depth > 6 || node === null || node === undefined) { return 0; }
            if (typeof node === 'string') { return wordCount(node); }
            if (Array.isArray(node)) {
                return node.reduce((sum, item) => sum + visibleWords(item, depth + 1), 0);
            }
            if (typeof node !== 'object') { return 0; }
            return Object.keys(node).reduce((sum, key) => {
                if (SKIP_KEYS.test(key)) { return sum; }
                return sum + visibleWords(node[key], depth + 1);
            }, 0);
        };

        let narrationWords = 0;
        let readingWords = 0;
        let interactions = 0;

        const topics = Array.isArray(manifest?.topics) ? manifest.topics : [];
        topics.forEach((topic) => {
            const sections = topic.sections || topic.subtopics || [];
            if (!Array.isArray(sections)) { return; }
            sections.forEach((section) => {
                if (section && section.activity) { interactions += 1; }
                const cards = section && Array.isArray(section.cards) ? section.cards : [];
                cards.forEach((card) => {
                    if (card && INTERACTIVE_CARD_TYPES.test(card.cardType || '')) {
                        interactions += 1;
                    }
                    const vo = wordCount(card && (card.voiceoverText || card.voiceover));
                    if (vo > 0) {
                        narrationWords += vo;
                    } else {
                        readingWords += visibleWords(card, 0);
                    }
                });
            });
        });

        if (!narrationWords && !readingWords && !interactions) { return 0; }

        const minutes = (narrationWords / NARRATION_WPM)
            + (readingWords / READING_WPM)
            + (interactions * INTERACTION_MINUTES);
        return Math.max(1, Math.ceil(minutes));
    };

    const hashInputs = (inputs) => {
        const str = JSON.stringify({
            mode: inputs.mode,
            context: inputs.context,
            criteria: inputs.criteria,
            duration: inputs.duration
        });
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(16);
    };

    const isLocked = (manifest) => {
        if (!manifest) return false;
        
        // Primary check: explicit locked flag
        if (manifest.locked === true) return true;
        
        // v7.1.3 BACKWARD COMPATIBILITY FIX:
        // Older manifests may not have locked property but still have generated content.
        // Check if manifest has topics with generated sections - this indicates completed generation.
        // This prevents regeneration after plugin upgrades where locked flag wasn't set.
        if (manifest.topics && Array.isArray(manifest.topics) && manifest.topics.length > 0) {
            const hasGeneratedContent = manifest.topics.some(topic => {
                const sections = topic.sections || topic.subtopics || [];
                return sections.some(section => 
                    section.generated === true || 
                    section.content || 
                    section.slideHtml
                );
            });
            if (hasGeneratedContent) {
                return true;
            }
        }
        
        return false;
    };

    const canRegenerate = (manifest, inputs) => {
        if (!manifest || !manifest.locked) return true;
        return false;
    };

    const serialize = (manifest) => {
        // v7.8.6: Optimize manifest before saving - strip unnecessary data
        const optimized = JSON.parse(JSON.stringify(manifest)); // Deep clone
        
        // Strip debug/temporary fields that aren't needed for playback
        const stripFields = ['_debug', '_temp', 'rawApiResponse', 'processingTime', 'retryCount'];
        
        const stripObject = (obj) => {
            if (!obj || typeof obj !== 'object') return;
            
            // Remove unnecessary fields
            stripFields.forEach(field => delete obj[field]);
            
            // Recursively process arrays and objects
            Object.values(obj).forEach(val => {
                if (Array.isArray(val)) {
                    val.forEach(item => stripObject(item));
                } else if (val && typeof val === 'object') {
                    stripObject(val);
                }
            });
        };
        
        stripObject(optimized);
        
        // Remove topicPlan if topics already expanded (redundant data)
        if (optimized.topics && optimized.topics.length > 0) {
            delete optimized.topicPlan;
        }
        
        // Remove large context fields that aren't needed for playback
        if (optimized.context) {
            delete optimized.context.rawTgaData;
            delete optimized.context.performanceEvidence;
            delete optimized.context.knowledgeEvidence;
            delete optimized.context.foundationSkills;
        }
        
        // v7.8.8: Additional optimization - strip HTML whitespace bloat
        const compressHtml = (obj) => {
            if (!obj || typeof obj !== 'object') return;
            Object.keys(obj).forEach(key => {
                if (typeof obj[key] === 'string' && (key.includes('Html') || key.includes('html'))) {
                    // Collapse multiple spaces/newlines in HTML
                    obj[key] = obj[key].replace(/\s+/g, ' ').replace(/>\s+</g, '><').trim();
                } else if (Array.isArray(obj[key])) {
                    obj[key].forEach(item => compressHtml(item));
                } else if (obj[key] && typeof obj[key] === 'object') {
                    compressHtml(obj[key]);
                }
            });
        };
        compressHtml(optimized);
        
        const json = JSON.stringify(optimized);
        
        return json;
    };

    const deserialize = (json) => {
        try {
            const manifest = JSON.parse(json);
            return { success: true, manifest: manifest };
        } catch (e) {
            return { success: false, error: 'Invalid manifest JSON' };
        }
    };

    return {
        STATUS: STATUS,
        build: build,
        validateInputs: validateInputs,
        isLocked: isLocked,
        canRegenerate: canRegenerate,
        serialize: serialize,
        deserialize: deserialize,
        hashInputs: hashInputs
    };
});
