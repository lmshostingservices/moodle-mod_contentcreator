/**
 * Content Creator  -  Card slot renderer functions.
 *
 * Extracted from player5.js (v9.83 Phase-4) to reduce the monolithic player
 * file size.  Contains 24 card-slot render functions that generate the HTML
 * for each card-type slide component.
 *
 * Usage:
 *   CcCardSlots.init({ getLabel, escapeHtml, fixGrammar, getIcon,
 *                      resolveScenePartIcon, formatTextWithDocLinks });
 *   var html = CcCardSlots.renderPerformanceAnchor(section);
 *
 * The module is a singleton: call init() once before any render method.
 *
 * @module     mod_contentcreator/cc-card-slots
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
define([], function () {
    'use strict';

    var getLabel, escapeHtml, fixGrammar, getIcon, resolveScenePartIcon, formatTextWithDocLinks;

    /**
     * Inject helper functions from player5.js scope.
     * Must be called before any render* method.
     * @param {Object} helpers
     */
    /**
     * v12.33 FIX-DP-SHUFFLE: Fisher-Yates shuffle  -  returns a new array so the
     * original card data is never mutated.  Used to randomise decision-point
     * option order so the correct answer is not always Option B.
     */
    function shuffleOptions(arr) {
        var a = arr.slice();
        for (var i = a.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
        }
        return a;
    }

    // v13.94.3: getLabel() ends `return labels[key] || UI_LABELS['en'][key] || key`, so
    // it never returns a falsy value and `getLabel('x') || 'Fallback'` is dead code (see
    // the TOPICSTEXT_HEADINGS note below). Call it directly. _lbl() exists only for the
    // handful of strings that carry runtime values, which cannot be built by
    // concatenating translated fragments: word order differs by language, so the whole
    // sentence is one key with {placeholders} substituted in.
    function _lbl(key, params) {
        var s = getLabel(key);
        Object.keys(params || {}).forEach(function (k) {
            s = s.split('{' + k + '}').join(params[k]);
        });
        return s;
    }

    function init(helpers) {
        getLabel               = helpers.getLabel;
        escapeHtml             = helpers.escapeHtml;
        fixGrammar             = helpers.fixGrammar;
        getIcon                = helpers.getIcon;
        resolveScenePartIcon   = helpers.resolveScenePartIcon;
        formatTextWithDocLinks = helpers.formatTextWithDocLinks;
    }

    // ---------------------------------------------------------------------------
    // SENTENCE BEAT SPLITTER  -  v10.39
    // Breaks a single narrative paragraph into individual sentence "beats" for
    // card-per-sentence display. Returns the original string in a 1-element array
    // if no useful split is found (e.g. AI wrote a single long sentence).
    // ---------------------------------------------------------------------------
    function splitIntoBeats(text) {
        var raw = (text || '').replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
        // Split on ". UpperCase" boundaries (period-space-uppercase = sentence end).
        // Lookahead (?=[A-Z]) keeps the capital on the NEXT segment.
        var parts = raw.split(/\.\s+(?=[A-Z\u201C\u2018"'])/);
        var beats = [];
        for (var i = 0; i < parts.length; i++) {
            var s = parts[i].trim();
            if (!s) continue;
            // Re-attach the period that split() consumed, unless last segment
            if (i < parts.length - 1 && !/[.!?]$/.test(s)) { s += '.'; }
            if (s.length > 12) beats.push(s);
        }
        // Also split on "! " and "? " boundaries and collect those as extra beats
        if (beats.length <= 1) {
            var excParts = raw.split(/[!?]\s+(?=[A-Z])/);
            if (excParts.length >= 2) {
                beats = excParts.map(function (p) { return p.trim(); }).filter(function (p) { return p.length > 12; });
            }
        }
        return beats.length >= 2 ? beats : [raw];
    }

    // ===========================================================================
    // 1. PERFORMANCE ANCHOR
    // ===========================================================================
    function renderPerformanceAnchor(section) {
        var html = '<div class="cc5-card cc5-performance-anchor-card">';
        html += '<div class="cc5-card-header">' + getIcon('anchor') + '<h4>' + escapeHtml(fixGrammar(section.heading || 'Performance Criteria')) + '</h4></div>';
        html += '<div class="cc5-card-body">';
        if (section.pcStatement)  html += '<p class="cc5-pc-statement">'  + escapeHtml(fixGrammar(section.pcStatement))  + '</p>';
        if (section.elementText)  html += '<p class="cc5-element-text">'  + escapeHtml(fixGrammar(section.elementText))  + '</p>';
        if (section.bodyText)     html += '<p>'                           + escapeHtml(fixGrammar(section.bodyText))     + '</p>';
        if (section.summaryLine)  html += '<p class="cc5-summary-line"><strong>' + escapeHtml(fixGrammar(section.summaryLine)) + '</strong></p>';
        html += '</div></div>';
        return html;
    }

    // ===========================================================================
    // 2. PLAIN ENGLISH
    // ===========================================================================
    function renderPlainEnglish(section) {
        var html = '<div class="cc5-card cc5-plain-english-card">';
        html += '<div class="cc5-card-header">' + getIcon('glasses') + '<h4>' + escapeHtml(fixGrammar(section.heading || 'What This Means on the Job')) + '</h4></div>';
        html += '<div class="cc5-card-body">';
        if (section.bodyText) html += '<p>' + escapeHtml(fixGrammar(section.bodyText)) + '</p>';
        // v10.54: keyPoints rendered as beautiful 4-card grid (not bulleted list)
        if (section.keyPoints && section.keyPoints.length) {
            var kpColors = ['orange', 'green', 'blue', 'purple'];
            var kpIcons  = ['lightbulb', 'check-circle', 'award', 'brain'];
            html += '<div class="cc5-kp-grid">';
            section.keyPoints.forEach(function (pt, idx) {
                var ptText = typeof pt === 'string' ? pt : (pt.text || '');
                if (!ptText) return;
                var colorClass = 'cc5-req-' + kpColors[idx % kpColors.length];
                var icon = kpIcons[idx % kpIcons.length];
                html += '<div class="cc5-requirement-card ' + colorClass + '">';
                html += '<div class="cc5-requirement-icon-circle">' + getIcon(icon) + '</div>';
                html += '<div class="cc5-requirement-content">';
                html += '<p class="cc5-requirement-desc">' + escapeHtml(fixGrammar(ptText)) + '</p>';
                html += '</div>';
                html += '</div>';
            });
            html += '</div>';
        }
        html += '</div></div>';
        return html;
    }

    // ===========================================================================
    // 3. ACTION BREAKDOWN
    // ===========================================================================
    function renderActionBreakdown(section) {
        var html = '<div class="cc5-card cc5-action-breakdown-card">';
        html += '<div class="cc5-card-header">' + getIcon('list-checks') + '<h4>' + escapeHtml(fixGrammar(section.heading || 'Action Breakdown')) + '</h4></div>';
        html += '<div class="cc5-card-body"><div class="cc5-action-grid">';
        if (section.actions && section.actions.length) {
            section.actions.forEach(function (action) {
                html += '<div class="cc5-action-item">';
                html += '<h5>' + escapeHtml(fixGrammar(action.heading || '')) + '</h5>';
                if (action.bullets && action.bullets.length) {
                    html += '<ul>';
                    action.bullets.forEach(function (b) { html += '<li>' + escapeHtml(fixGrammar(b)) + '</li>'; });
                    html += '</ul>';
                }
                html += '</div>';
            });
        }
        if (section.bodyText) html += '<p>' + escapeHtml(fixGrammar(section.bodyText)) + '</p>';
        html += '</div></div></div>';
        return html;
    }

    // ===========================================================================
    // 4. COMPETENCE STANDARD
    // ===========================================================================
    function renderCompetenceStandard(section) {
        var html = '<div class="cc5-card cc5-competence-standard-card">';
        html += '<div class="cc5-card-header">' + getIcon('clipboard-check') + '<h4>' + escapeHtml(fixGrammar(section.heading || 'To Be Competent You Must:')) + '</h4></div>';
        html += '<div class="cc5-card-body">';
        if (section.standardItems && section.standardItems.length) {
            html += '<ul class="cc5-standard-checklist">';
            section.standardItems.forEach(function (item) {
                html += '<li>' + getIcon('check-circle') + ' <span>' + escapeHtml(fixGrammar(typeof item === 'string' ? item : (item.text || ''))) + '</span></li>';
            });
            html += '</ul>';
        }
        if (section.bodyText) html += '<p>' + escapeHtml(fixGrammar(section.bodyText)) + '</p>';
        html += '</div></div>';
        return html;
    }

    // ===========================================================================
    // 5. ROUTE SCENARIO CARD (Workplace scenario-2 without turningPoint)
    // v9.75: Renders optimisationTips[]
    // ===========================================================================
    function renderRouteScenarioCard(section) {
        var html = '<div class="cc5-card cc5-scenario-card">';
        html += '<div class="cc5-card-header">' + getIcon('briefcase') + '<h4>' + escapeHtml(fixGrammar(section.heading || section.title || 'Scenario')) + '</h4></div>';
        html += '<div class="cc5-card-body">';
        if (section.context)     html += '<p class="cc5-scenario-context">' + escapeHtml(fixGrammar(section.context)) + '</p>';
        if (section.bodyText)    html += '<p>'                              + escapeHtml(fixGrammar(section.bodyText)) + '</p>';
        if (section.consequence) html += '<div class="cc5-scenario-consequence"><strong>Consequence:</strong> ' + escapeHtml(fixGrammar(section.consequence)) + '</div>';
        if (section.optimisationTips && section.optimisationTips.length) {
            html += '<div class="cc5-scenario-tips"><h5>' + (getLabel('tipsForHandling') || 'Tips for Handling This') + '</h5><ul class="cc5-tips-list">';
            section.optimisationTips.forEach(function (tip) { html += '<li>' + escapeHtml(fixGrammar(tip)) + '</li>'; });
            html += '</ul></div>';
        }
        html += '</div></div>';
        return html;
    }

    // ===========================================================================
    // 6. COMMON ERRORS
    // ===========================================================================
    function renderCommonErrors(section) {
        var html = '<div class="cc5-card cc5-common-errors-card">';
        html += '<div class="cc5-card-header">' + getIcon('alert-triangle') + '<h4>' + escapeHtml(fixGrammar(section.heading || 'Common Errors')) + '</h4></div>';
        html += '<div class="cc5-card-body">';
        if (section.errorItems && section.errorItems.length) {
            html += '<div class="cc5-error-items">';
            section.errorItems.forEach(function (item) {
                html += '<div class="cc5-error-item">';
                html += '<div class="cc5-error-text">' + getIcon('x-circle') + ' <span>' + escapeHtml(fixGrammar(item.error || '')) + '</span></div>';
                if (item.consequence) html += '<div class="cc5-error-consequence">' + escapeHtml(fixGrammar(item.consequence)) + '</div>';
                html += '</div>';
            });
            html += '</div>';
        }
        if (section.bodyText) html += '<p>' + escapeHtml(fixGrammar(section.bodyText)) + '</p>';
        html += '</div></div>';
        return html;
    }

    // ===========================================================================
    // 7. CONCEPT ANCHOR
    // ===========================================================================
    function renderConceptAnchor(section) {
        var html = '<div class="cc5-card cc5-concept-anchor-card">';
        html += '<div class="cc5-card-header">' + getIcon('lightbulb') + '<h4>' + escapeHtml(fixGrammar(section.heading || 'Core Concept')) + '</h4></div>';
        html += '<div class="cc5-card-body">';
        if (section.conceptDefinition) {
            // v13.94.3: hard-coded English sub-heading over translated body text.
            html += '<div class="cc5-concept-definition"><h5>' + escapeHtml(getLabel('definition')) + '</h5>';
            html += '<p>' + escapeHtml(fixGrammar(section.conceptDefinition)) + '</p></div>';
        }
        if (section.significance) {
            // v13.94.3: whyItMatters already existed in translations.js, unused here.
            html += '<div class="cc5-concept-significance"><h5>' + escapeHtml(getLabel('whyItMatters')) + '</h5>';
            html += '<p>' + escapeHtml(fixGrammar(section.significance)) + '</p></div>';
        }
        var terms = section.keyTerms || [];
        if (terms.length) {
            // v13.94.3: keyTerms already existed in translations.js, unused here.
            html += '<div class="cc5-concept-terms"><h5>' + escapeHtml(getLabel('keyTerms')) + '</h5><dl>';
            terms.forEach(function (t) {
                html += '<dt>' + escapeHtml(fixGrammar(t.term || '')) + '</dt>';
                html += '<dd>' + escapeHtml(fixGrammar(t.definition || '')) + '</dd>';
            });
            html += '</dl></div>';
        }
        if (section.bodyText) html += '<p>' + escapeHtml(fixGrammar(section.bodyText)) + '</p>';
        html += '</div></div>';
        return html;
    }

    // ===========================================================================
    // 8. THEORETICAL FRAMEWORK
    // v9.88 FIX BUG-RENDER-FW-APP: fw.application now rendered
    // ===========================================================================
    function renderTheoreticalFramework(section) {
        var html = '<div class="cc5-card cc5-theoretical-framework-card">';
        html += '<div class="cc5-card-header">' + getIcon('layers') + '<h4>' + escapeHtml(fixGrammar(section.heading || 'Theoretical Framework')) + '</h4></div>';
        html += '<div class="cc5-card-body">';
        if (section.frameworks && section.frameworks.length) {
            section.frameworks.forEach(function (fw) {
                html += '<div class="cc5-framework-item"><h5>' + escapeHtml(fixGrammar(fw.name || '')) + '</h5>';
                if (fw.originator)  html += '<p class="cc5-fw-originator"><em>' + escapeHtml(fixGrammar(fw.originator)) + '</em></p>';
                html += '<p>' + escapeHtml(fixGrammar(fw.principle || fw.description || '')) + '</p>';
                // v13.84: arrow glyph dropped in favour of a plain label, matching the
                // VET/Workplace/PD routes.
                if (fw.application) html += '<p class="cc5-fw-application"><strong>' + escapeHtml(getLabel('application') || 'In practice') + ':</strong> <span>' + escapeHtml(fixGrammar(fw.application)) + '</span></p>';
                if (fw.limitation)  html += '<p class="cc5-fw-limitation">'  + getIcon('alert-circle')  + ' <span>' + escapeHtml(fixGrammar(fw.limitation)) + '</span></p>';
                // v13.84 FIX BUG-RENDER-FW-NEST: this closing tag was missing, so every
                // framework after the first was rendered INSIDE its predecessor —
                // the panel-in-panel-in-card nesting seen on the University route.
                html += '</div>';
            });
        }
        if (section.bodyText) html += '<p>' + escapeHtml(fixGrammar(section.bodyText)) + '</p>';
        html += '</div></div>';
        return html;
    }

    // ===========================================================================
    // 9. ANALYTICAL LENS
    // v9.86: analysisPrompts[] now rendered
    // ===========================================================================
    function renderAnalyticalLens(section) {
        var html = '<div class="cc5-card cc5-analytical-lens-card">';
        html += '<div class="cc5-card-header">' + getIcon('search') + '<h4>' + escapeHtml(fixGrammar(section.heading || 'Analytical Lens')) + '</h4></div>';
        html += '<div class="cc5-card-body">';
        var items = section.cognitiveConsiderations || section.considerations || [];
        if (items.length) {
            html += '<ul class="cc5-considerations-list">';
            items.forEach(function (c) { html += '<li>' + escapeHtml(fixGrammar(typeof c === 'string' ? c : (c.text || c.description || ''))) + '</li>'; });
            html += '</ul>';
        }
        if (section.analysisPrompts && section.analysisPrompts.length) {
            html += '<div class="cc5-analysis-prompts"><h5>' + (getLabel('analysisQuestions') || 'Analysis Questions') + ':</h5><ul>';
            section.analysisPrompts.forEach(function (p) { html += '<li>' + escapeHtml(fixGrammar(p)) + '</li>'; });
            html += '</ul></div>';
        }
        if (section.bodyText) html += '<p>' + escapeHtml(fixGrammar(section.bodyText)) + '</p>';
        html += '</div></div>';
        return html;
    }

    // ===========================================================================
    // 10. ETHICS CONSIDERATIONS
    // ===========================================================================
    function renderEthicsConsiderations(section) {
        var html = '<div class="cc5-card cc5-ethics-considerations-card">';
        html += '<div class="cc5-card-header">' + getIcon('scale') + '<h4>' + escapeHtml(fixGrammar(section.heading || 'Ethics & Legal Considerations')) + '</h4></div>';
        html += '<div class="cc5-card-body">';
        if (section.considerations && section.considerations.length) {
            html += '<div class="cc5-ethics-list">';
            section.considerations.forEach(function (c) {
                if (typeof c === 'object' && c.dimension) {
                    html += '<div class="cc5-ethics-item"><strong>' + escapeHtml(fixGrammar(c.dimension)) + ':</strong> ';
                    html += escapeHtml(fixGrammar(c.description || '')) + '</div>';
                } else {
                    html += '<div class="cc5-ethics-item">' + escapeHtml(fixGrammar(typeof c === 'string' ? c : (c.text || c.description || ''))) + '</div>';
                }
            });
            html += '</div>';
        }
        if (section.bodyText) html += '<p>' + escapeHtml(fixGrammar(section.bodyText)) + '</p>';
        html += '</div></div>';
        return html;
    }

    // ===========================================================================
    // 11. CASE STUDY
    // v9.65: Always renders criticalReflection block
    // ===========================================================================
    function renderCaseStudy(section) {
        var html = '<div class="cc5-card cc5-case-study-card">';
        html += '<div class="cc5-card-header">' + getIcon('file-text') + '<h4>' + escapeHtml(fixGrammar(section.heading || section.title || 'Case Study')) + '</h4></div>';
        html += '<div class="cc5-card-body">';
        if (section.context)  html += '<p class="cc5-case-context">' + escapeHtml(fixGrammar(section.context)) + '</p>';
        if (section.bodyText) html += '<p>' + escapeHtml(fixGrammar(section.bodyText)) + '</p>';
        if (section.analysisPrompts && section.analysisPrompts.length) {
            html += '<div class="cc5-analysis-prompts"><h5>Analysis Questions:</h5><ul>';
            section.analysisPrompts.forEach(function (p) { html += '<li>' + escapeHtml(fixGrammar(p)) + '</li>'; });
            html += '</ul></div>';
        }
        if (section.keyInsight) {
            // v13.94.3: hard-coded English sub-heading.
            html += '<div class="cc5-key-insight"><h5>' + escapeHtml(getLabel('keyInsight')) + '</h5><p>' + escapeHtml(fixGrammar(section.keyInsight)) + '</p></div>';
        }
        var reflectionText = section.criticalReflection ||
            'How does this case connect to your own professional context? What would you do differently?';
        // v13.94.3: hard-coded English sub-heading.
        html += '<div class="cc5-critical-reflection"><h5>' + escapeHtml(getLabel('criticalReflection')) + '</h5><p>' + escapeHtml(fixGrammar(reflectionText)) + '</p></div>';
        html += '</div></div>';
        return html;
    }

    // ===========================================================================
    // 12. BUSINESS IMPACT
    // ===========================================================================
    function renderBusinessImpact(section) {
        var html = '<div class="cc5-card cc5-business-impact-card">';
        html += '<div class="cc5-card-header">' + getIcon('trending-up') + '<h4>' + escapeHtml(fixGrammar(section.heading || 'Business Impact')) + '</h4></div>';
        html += '<div class="cc5-card-body">';
        if (section.impactStatement) {
            html += '<div class="cc5-impact-statement"><p>' + escapeHtml(fixGrammar(section.impactStatement)) + '</p></div>';
        }
        if (section.keyMetrics && section.keyMetrics.length) {
            // v13.94.3: hard-coded English sub-heading.
            html += '<div class="cc5-key-metrics"><h5>' + escapeHtml(getLabel('keyMetrics')) + '</h5><ul>';
            section.keyMetrics.forEach(function (m) { html += '<li>' + escapeHtml(fixGrammar(m)) + '</li>'; });
            html += '</ul></div>';
        }
        if (section.consequences && section.consequences.length) {
            html += '<ul class="cc5-consequences-list">';
            section.consequences.forEach(function (c) { html += '<li>' + escapeHtml(fixGrammar(c)) + '</li>'; });
            html += '</ul>';
        }
        if (section.bodyText) html += '<p>' + escapeHtml(fixGrammar(section.bodyText)) + '</p>';
        html += '</div></div>';
        return html;
    }

    // ===========================================================================
    // 13. ACTION FRAMEWORK
    // ===========================================================================
    function renderActionFramework(section) {
        var html = '<div class="cc5-card cc5-action-framework-card">';
        html += '<div class="cc5-card-header">' + getIcon('list-checks') + '<h4>' + escapeHtml(fixGrammar(section.heading || 'Action Framework')) + '</h4></div>';
        html += '<div class="cc5-card-body">';
        if (section.steps && section.steps.length) {
            html += '<ol class="cc5-action-steps">';
            section.steps.forEach(function (s) {
                if (typeof s === 'string') {
                    html += '<li>' + escapeHtml(fixGrammar(s)) + '</li>';
                } else {
                    html += '<li class="cc5-action-step-item">';
                    html += '<strong>' + escapeHtml(fixGrammar(s.action || s.text || '')) + '</strong>';
                    if (s.detail)     html += '<p>' + escapeHtml(fixGrammar(s.detail)) + '</p>';
                    if (s.timeframe)  html += '<span class="cc5-step-timeframe">' + escapeHtml(fixGrammar(s.timeframe)) + '</span>';
                    html += '</li>';
                }
            });
            html += '</ol>';
        }
        if (section.bodyText) html += '<p>' + escapeHtml(fixGrammar(section.bodyText)) + '</p>';
        html += '</div></div>';
        return html;
    }

    // ===========================================================================
    // 14. RISK CARD
    // ===========================================================================
    function renderRiskCard(section) {
        var html = '<div class="cc5-card cc5-risk-card">';
        html += '<div class="cc5-card-header">' + getIcon('alert-triangle') + '<h4>' + escapeHtml(fixGrammar(section.heading || 'Risk Assessment')) + '</h4></div>';
        html += '<div class="cc5-card-body">';
        if (section.risks && section.risks.length) {
            html += '<div class="cc5-risk-items">';
            section.risks.forEach(function (r) {
                html += '<div class="cc5-risk-item">';
                html += '<div class="cc5-risk-text">' + getIcon('alert-circle') + ' <span>' + escapeHtml(fixGrammar(r.risk || r.text || '')) + '</span></div>';
                if (r.likelihood)  html += '<div class="cc5-risk-likelihood"><strong>Likelihood:</strong> ' + escapeHtml(fixGrammar(r.likelihood)) + '</div>';
                if (r.impact)      html += '<div class="cc5-risk-impact">'      + escapeHtml(fixGrammar(r.impact))      + '</div>';
                if (r.consequence) html += '<div class="cc5-risk-consequence">' + escapeHtml(fixGrammar(r.consequence)) + '</div>';
                if (r.mitigation)  html += '<div class="cc5-risk-mitigation">'  + getIcon('check-circle') + ' <span>' + escapeHtml(fixGrammar(r.mitigation)) + '</span></div>';
                html += '</div>';
            });
            html += '</div>';
        }
        if (section.bodyText) html += '<p>' + escapeHtml(fixGrammar(section.bodyText)) + '</p>';
        html += '</div></div>';
        return html;
    }

    // ===========================================================================
    // 15. POLICY ALIGNMENT
    // ===========================================================================
    function renderPolicyAlignment(section) {
        var html = '<div class="cc5-card cc5-policy-alignment-card">';
        html += '<div class="cc5-card-header">' + getIcon('file-check') + '<h4>' + escapeHtml(fixGrammar(section.heading || 'Policy & Procedure Alignment')) + '</h4></div>';
        html += '<div class="cc5-card-body">';
        var pols = section.policyItems || section.policies || [];
        if (pols.length) {
            html += '<div class="cc5-policy-items">';
            pols.forEach(function (p) {
                if (typeof p === 'string') {
                    html += '<div class="cc5-policy-item"><p>' + escapeHtml(fixGrammar(p)) + '</p></div>';
                } else {
                    html += '<div class="cc5-policy-item">';
                    if (p.policy)      html += '<div class="cc5-policy-name"><strong>' + escapeHtml(fixGrammar(p.policy)) + '</strong></div>';
                    if (p.requirement) html += '<div class="cc5-policy-requirement">' + escapeHtml(fixGrammar(p.requirement)) + '</div>';
                    if (p.consequence) html += '<div class="cc5-policy-consequence"><em>' + escapeHtml(fixGrammar(p.consequence)) + '</em></div>';
                    if (p.text)        html += '<p>' + escapeHtml(fixGrammar(p.text)) + '</p>';
                    html += '</div>';
                }
            });
            html += '</div>';
        }
        if (section.bodyText) html += '<p>' + escapeHtml(fixGrammar(section.bodyText)) + '</p>';
        html += '</div></div>';
        return html;
    }

    // ===========================================================================
    // 16. SKILL ANCHOR
    // ===========================================================================
    function renderSkillAnchor(section) {
        var html = '<div class="cc5-card cc5-skill-anchor-card">';
        html += '<div class="cc5-card-header">' + getIcon('target') + '<h4>' + escapeHtml(fixGrammar(section.heading || 'Skill Anchor')) + '</h4></div>';
        html += '<div class="cc5-card-body">';
        if (section.skillStatement) {
            html += '<div class="cc5-skill-statement"><p>' + escapeHtml(fixGrammar(section.skillStatement)) + '</p></div>';
        }
        if (section.relevance) {
            // v13.94.3: hard-coded English sub-heading.
            html += '<div class="cc5-skill-relevance"><h5>' + escapeHtml(getLabel('whyThisMatters')) + '</h5>';
            html += '<p>' + escapeHtml(fixGrammar(section.relevance)) + '</p></div>';
        }
        var indicators = section.keyIndicators || [];
        if (indicators.length) {
            // v13.94.3: hard-coded English sub-heading.
            html += '<div class="cc5-skill-indicators"><h5>' + escapeHtml(getLabel('keyIndicators')) + '</h5><ul>';
            indicators.forEach(function (ind) { html += '<li>' + escapeHtml(fixGrammar(typeof ind === 'string' ? ind : (ind.text || ''))) + '</li>'; });
            html += '</ul></div>';
        }
        if (section.bodyText) html += '<p>' + escapeHtml(fixGrammar(section.bodyText)) + '</p>';
        html += '</div></div>';
        return html;
    }

    // ===========================================================================
    // 17. CORE FRAMEWORK
    // ===========================================================================
    function renderCoreFramework(section) {
        var html = '<div class="cc5-card cc5-core-framework-card">';
        html += '<div class="cc5-card-header">' + getIcon('layers') + '<h4>' + escapeHtml(fixGrammar(section.heading || 'Core Framework')) + '</h4></div>';
        html += '<div class="cc5-card-body">';
        var steps = section.frameworkSteps || [];
        if (steps.length) {
            html += '<ol class="cc5-framework-steps">';
            steps.forEach(function (s) {
                html += '<li class="cc5-framework-step"><div class="cc5-framework-step-content">';
                html += '<strong>' + escapeHtml(fixGrammar(s.step || '')) + '</strong>';
                html += '<p>' + (s.explanation ? escapeHtml(fixGrammar(s.explanation)) : '') + '</p>';
                html += '<p class="cc5-framework-example">' + (s.example ? '<em>' + escapeHtml(fixGrammar(s.example)) + '</em>' : '') + '</p>';
                html += '</div></li>';
            });
            html += '</ol>';
        }
        if (section.keyPrinciple) {
            // v13.94.3: keyPrinciple already existed in translations.js, unused here.
            html += '<div class="cc5-key-principle"><h5>' + escapeHtml(getLabel('keyPrinciple')) + '</h5>';
            html += '<p>' + escapeHtml(fixGrammar(section.keyPrinciple)) + '</p></div>';
        }
        if (section.bodyText) html += '<p>' + escapeHtml(fixGrammar(section.bodyText)) + '</p>';
        html += '</div></div>';
        return html;
    }

    // ===========================================================================
    // 18. APPLICATION GUIDE
    // ===========================================================================
    function renderApplicationGuide(section) {
        var html = '<div class="cc5-card cc5-application-guide-card">';
        html += '<div class="cc5-card-header">' + getIcon('compass') + '<h4>' + escapeHtml(fixGrammar(section.heading || 'Application Guide')) + '</h4></div>';
        html += '<div class="cc5-card-body">';
        var apps = section.applications || [];
        if (apps.length) {
            html += '<div class="cc5-application-items">';
            apps.forEach(function (a, idx) {
                html += '<div class="cc5-application-item">';
                html += '<div class="cc5-application-scenario-label">';
                html += '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
                html += '<span>Scenario ' + (idx + 1) + '</span>';
                html += '</div>';
                html += '<div class="cc5-application-situation"><strong>' + escapeHtml(fixGrammar(a.situation || '')) + '</strong></div>';
                if (a.action)    html += '<div class="cc5-application-action">'    + escapeHtml(fixGrammar(a.action)) + '</div>';
                if (a.rationale) html += '<div class="cc5-application-rationale">' + getIcon('info') + ' <em>' + escapeHtml(fixGrammar(a.rationale)) + '</em></div>';
                html += '</div>';
            });
            html += '</div>';
        }
        if (section.bodyText) html += '<p>' + escapeHtml(fixGrammar(section.bodyText)) + '</p>';
        html += '</div></div>';
        return html;
    }

    // ===========================================================================
    // 19. COMMON PITFALLS
    // ===========================================================================
    function renderCommonPitfalls(section) {
        var html = '<div class="cc5-card cc5-common-pitfalls-card">';
        html += '<div class="cc5-card-header">' + getIcon('alert-triangle') + '<h4>' + escapeHtml(fixGrammar(section.heading || 'Where Experienced Professionals Go Wrong')) + '</h4></div>';
        html += '<div class="cc5-card-body">';
        var pitfalls = section.pitfallItems || [];
        if (pitfalls.length) {
            html += '<div class="cc5-pitfall-items">';
            pitfalls.forEach(function (p) {
                html += '<div class="cc5-pitfall-item"><div class="cc5-pitfall-cols">';
                html += '<div class="cc5-pitfall-negative">';
                html += '<div class="cc5-pitfall-text">' + getIcon('x-circle') + ' <span>' + escapeHtml(fixGrammar(p.pitfall || '')) + '</span></div>';
                if (p.consequence) html += '<div class="cc5-pitfall-consequence">' + escapeHtml(fixGrammar(p.consequence)) + '</div>';
                html += '</div>';
                html += '<div class="cc5-pitfall-positive">';
                if (p.correction) html += '<div class="cc5-pitfall-correction">' + getIcon('check-circle') + ' <span>' + escapeHtml(fixGrammar(p.correction)) + '</span></div>';
                html += '</div>';
                html += '</div></div>';
            });
            html += '</div>';
        }
        if (section.bodyText) html += '<p>' + escapeHtml(fixGrammar(section.bodyText)) + '</p>';
        html += '</div></div>';
        return html;
    }

    // ===========================================================================
    // 20. PD SCENARIO CARD (scenario-2 with turningPoint)
    // v9.88 FIX BUG-RENDER-PD-OPT: optimisationTips[] now rendered
    // ===========================================================================
    function renderPDScenarioCard(section) {
        var html = '<div class="cc5-card cc5-scenario-card cc5-pd-scenario-card">';
        html += '<div class="cc5-card-header">' + getIcon('briefcase') + '<h4>' + escapeHtml(fixGrammar(section.heading || section.title || 'Scenario')) + '</h4></div>';
        html += '<div class="cc5-card-body">';
        if (section.context)       html += '<p class="cc5-scenario-context">'       + escapeHtml(fixGrammar(section.context)) + '</p>';
        if (section.turningPoint)  html += '<div class="cc5-scenario-turning-point"><strong>Turning Point:</strong> ' + escapeHtml(fixGrammar(section.turningPoint)) + '</div>';
        if (section.consequence)   html += '<div class="cc5-scenario-consequence"><strong>Consequence:</strong> '   + escapeHtml(fixGrammar(section.consequence)) + '</div>';
        if (section.reflection) {
            if (typeof section.reflection === 'object' && section.reflection.question) {
                html += '<div class="cc5-scenario-reflection"><strong>Reflection:</strong> ' + escapeHtml(fixGrammar(section.reflection.question)) + '</div>';
                if (section.reflection.sampleAnswers && Array.isArray(section.reflection.sampleAnswers)) {
                    html += '<ul class="cc5-scenario-reflection-answers">';
                    section.reflection.sampleAnswers.forEach(function (ans) { html += '<li>' + escapeHtml(fixGrammar(ans)) + '</li>'; });
                    html += '</ul>';
                }
            } else {
                html += '<div class="cc5-scenario-reflection"><strong>Reflection:</strong> ' + escapeHtml(fixGrammar(section.reflection)) + '</div>';
            }
        }
        if (section.optimisationTips && section.optimisationTips.length) {
            html += '<div class="cc5-optimisation-tips"><h5>' + (getLabel('optimisationTips') || 'Optimisation Tips') + '</h5><ul>';
            section.optimisationTips.forEach(function (tip) { html += '<li>' + escapeHtml(fixGrammar(tip)) + '</li>'; });
            html += '</ul></div>';
        }
        if (section.bodyText) html += '<p>' + escapeHtml(fixGrammar(section.bodyText)) + '</p>';
        html += '</div></div>';
        return html;
    }

    // ===========================================================================
    // UNIFIED 7-CARD LEARNING FLOW (v10.27  -  applies to all 4 routes)
    // Card 1: Hook Scenario    -  scene-setting narrative
    // Card 2: Concept Explainer  -  "what you just saw means..."
    // Card 3: Mental Model     -  numbered step flow (signature UI)
    // Card 4: Applied Scenario  -  "later that day..." continuation
    // Card 5: Decision Point   -  interactive choice inside the story
    // Card 6: Mistakes         -  warning cards grounded in scenario
    // Card 7: Competency Summary  -  achievement checklist
    // ===========================================================================

    function renderHookScenario(section) {
        var html = '<div class="cc5-card cc5-hook-scenario-card">';
        // v13.94.3: flow-badge text was a hard-coded English literal, so a Japanese
        // module showed an English pill above translated prose. Same key the narration
        // uses in cc-state.js buildVoiceoverText().
        html += '<div class="cc5-flow-badge"><span class="cc5-flow-pill cc5-flow-pill-hook">' + escapeHtml(getLabel('sceneSetting')) + '</span></div>';
        // v13.94.3: emitted unconditionally, but NO prompt asks for `title` on this card
        // type and no code assigns one - only card 6 gets a title. So this rendered a
        // literal <h3></h3> on every hook-scenario card of every VET/Workplace/PD
        // module, and .cc5-unified-title carries `margin: 0 0 14px 0`, i.e. a 14px
        // phantom gap under the flow badge. Guarded the way renderCompetencySummary
        // already guards its own title.
        if (section.title) {
            html += '<h3 class="cc5-unified-title">' + escapeHtml(fixGrammar(section.title)) + '</h3>';
        }

        // v10.43: sceneParts[]  -  named subsection cards with icons (preferred path)
        if (section.sceneParts && section.sceneParts.length) {
            html += '<div class="cc5-scene-parts cc5-scene-parts-hook">';
            var hookUsedIcons = new Set();
            section.sceneParts.forEach(function (part, idx) {
                var partText = part.text || part.content || part.description || part.detail || part.body || part.narrative || '';
                var resolvedIcon = resolveScenePartIcon(part.icon, part.title, partText, idx, 'hook-scenario', hookUsedIcons);
                html += '<div class="cc5-scene-part">';
                html += '<div class="cc5-scene-part-icon">';
                html += getIcon(resolvedIcon);
                html += '</div>';
                html += '<div class="cc5-scene-part-body">';
                if (part.title) html += '<div class="cc5-scene-part-title">' + escapeHtml(fixGrammar(part.title)) + '</div>';
                if (partText) html += '<p class="cc5-scene-part-text">' + escapeHtml(fixGrammar(partText)) + '</p>';
                html += '</div>';
                html += '</div>';
            });
            html += '</div>';
        } else {
            var content = section.content || section.bodyText || section.description || '';
            if (content) {
                var beats = splitIntoBeats(content);
                html += '<div class="cc5-scene-parts cc5-scene-parts-hook">';
                beats.forEach(function (beat, idx) {
                    html += '<div class="cc5-scene-part">';
                    html += '<div class="cc5-scene-part-icon" style="font-size:0.82rem;font-weight:700;">' + (idx + 1) + '</div>';
                    html += '<div class="cc5-scene-part-body">';
                    html += '<p class="cc5-scene-part-text">' + escapeHtml(fixGrammar(beat)) + '</p>';
                    html += '</div>';
                    html += '</div>';
                });
                html += '</div>';
            }
        }

        if (section.highlightText) {
            html += '<div class="cc5-scenario-highlight"><span>' + escapeHtml(fixGrammar(section.highlightText)) + '</span></div>';
        }
        html += '</div>';
        return html;
    }

    function renderConceptExplainer(section) {
        var html = '<div class="cc5-card cc5-concept-explainer-card">';
        // v13.94.3: hard-coded English flow badge - see renderHookScenario.
        html += '<div class="cc5-flow-badge"><span class="cc5-flow-pill cc5-flow-pill-concept">' + escapeHtml(getLabel('whatThisMeans')) + '</span></div>';
        // v13.94.3: emitted unconditionally, but NO prompt asks for `title` on this card
        // type and no code assigns one - only card 6 gets a title. So this rendered a
        // literal <h3></h3> on every concept-explainer card of every VET/Workplace/PD
        // module, and .cc5-unified-title carries `margin: 0 0 14px 0`, i.e. a 14px
        // phantom gap under the flow badge. Guarded the way renderCompetencySummary
        // already guards its own title.
        if (section.title) {
            html += '<h3 class="cc5-unified-title">' + escapeHtml(fixGrammar(section.title)) + '</h3>';
        }

        // v10.43: conceptInsights[]  -  named insight cards with icons (preferred path)
        // v11.54: Added colour-cycling (blue  ->  green  ->  orange  ->  purple) for visual hierarchy
        if (section.conceptInsights && section.conceptInsights.length) {
            var ciPalette = ['cc5-ci-blue', 'cc5-ci-green', 'cc5-ci-orange', 'cc5-ci-purple'];
            html += '<div class="cc5-concept-insights">';
            section.conceptInsights.forEach(function (insight, idx) {
                var colorClass = ciPalette[idx % ciPalette.length];
                html += '<div class="cc5-concept-insight ' + colorClass + '">';
                html += '<div class="cc5-ci-icon">';
                html += getIcon('chevron-right');
                html += '</div>';
                html += '<div class="cc5-ci-body">';
                if (insight.title) html += '<div class="cc5-ci-title">' + escapeHtml(fixGrammar(insight.title)) + '</div>';
                var insightText = insight.text || insight.content || insight.description || '';
                if (insightText) html += '<p class="cc5-ci-text">' + escapeHtml(fixGrammar(insightText)) + '</p>';
                html += '</div>';
                html += '</div>';
            });
            html += '</div>';
        } else {
            // v10.39 / v11.54: Icon-based insight chips (no numbers) for legacy content
            var chipPalette   = ['cc5-chip-blue', 'cc5-chip-green', 'cc5-chip-orange', 'cc5-chip-purple'];
            var content = section.content || section.bodyText || section.description || '';
            if (content) {
                var beats = splitIntoBeats(content);
                html += '<div class="cc5-insight-chips">';
                beats.forEach(function (beat, idx) {
                    html += '<div class="cc5-insight-chip ' + chipPalette[idx % chipPalette.length] + '">';
                    html += '<div class="cc5-insight-icon">' + getIcon('chevron-right') + '</div>';
                    html += '<p>' + escapeHtml(fixGrammar(beat)) + '</p>';
                    html += '</div>';
                });
                html += '</div>';
            }
            if (section.conceptItems && section.conceptItems.length) {
                html += '<div class="cc5-concept-items-grid">';
                section.conceptItems.forEach(function (item) {
                    html += '<div class="cc5-concept-item">';
                    if (item.icon) html += '<div class="cc5-concept-item-icon">' + getIcon(item.icon) + '</div>';
                    html += '<div class="cc5-concept-item-body">';
                    if (item.title) html += '<h5>' + escapeHtml(fixGrammar(item.title)) + '</h5>';
                    if (item.description) html += '<p>' + escapeHtml(fixGrammar(item.description)) + '</p>';
                    html += '</div></div>';
                });
                html += '</div>';
            }
        }

        // v10.97: Legal Link panel  -  audit-visible legislation anchor
        if (section.legalLink && section.legalLink.legislationName) {
            html += '<div class="cc5-legal-link">';
            // v13.94.3: PD carries labelKey 'whatThePrincipleRequires' - see generator.js.
            var _llKey = section.legalLink.labelKey || 'whatTheLawSays';
            html += '<div class="cc5-legal-link-header">' + getIcon(_llKey === 'whatTheLawSays' ? 'shield-check' : 'award') + '<span class="cc5-legal-link-label">' + escapeHtml(getLabel(_llKey)) + '</span></div>';
            html += '<div class="cc5-legal-link-body">';
            html += '<p class="cc5-legal-link-legislation"><strong>' + escapeHtml(fixGrammar(section.legalLink.legislationName)) + '</strong></p>';
            if (section.legalLink.legalObligation) {
                html += '<p class="cc5-legal-link-obligation">' + escapeHtml(fixGrammar(section.legalLink.legalObligation)) + '</p>';
            }
            if (section.legalLink.scenarioConnection) {
                html += '<p class="cc5-legal-link-connection">' + escapeHtml(fixGrammar(section.legalLink.scenarioConnection)) + '</p>';
            }
            html += '</div>';
            html += '</div>';
        }

        html += '</div>';
        return html;
    }

    function renderMentalModel(section) {
        var html = '<div class="cc5-card cc5-mental-model-card">';
        // v13.94.3: hard-coded English flow badge - see renderHookScenario.
        html += '<div class="cc5-flow-badge"><span class="cc5-flow-pill cc5-flow-pill-mental">' + escapeHtml(getLabel('howToHandleIt')) + '</span></div>';
        // v13.94.3: emitted unconditionally, but NO prompt asks for `title` on this card
        // type and no code assigns one - only card 6 gets a title. So this rendered a
        // literal <h3></h3> on every mental-model card of every VET/Workplace/PD
        // module, and .cc5-unified-title carries `margin: 0 0 14px 0`, i.e. a 14px
        // phantom gap under the flow badge. Guarded the way renderCompetencySummary
        // already guards its own title.
        if (section.title) {
            html += '<h3 class="cc5-unified-title">' + escapeHtml(fixGrammar(section.title)) + '</h3>';
        }
        var steps = section.steps || [];
        if (steps.length) {
            // v10.83: Card layout  -  mirrors scene-parts style with purple palette.
            // Numbers (1, 2, 3) or icons appear in the left icon circle; step title
            // is the uppercase label; detail is the body text.
            html += '<div class="cc5-scene-parts cc5-scene-parts-mental">';
            steps.forEach(function (s, idx) {
                html += '<div class="cc5-scene-part">';
                html += '<div class="cc5-scene-part-icon">';
                if (s.icon) {
                    html += getIcon(s.icon);
                } else {
                    html += '<span style="font-size:0.875rem;font-weight:700;line-height:1;">' + (idx + 1) + '</span>';
                }
                html += '</div>';
                html += '<div class="cc5-scene-part-body">';
                var stepTitle = s.step || s.action || s.title || '';
                if (stepTitle) html += '<div class="cc5-scene-part-title">' + escapeHtml(fixGrammar(stepTitle)) + '</div>';
                var detail = s.detail || s.description || s.explanation || '';
                if (detail) html += '<p class="cc5-scene-part-text">' + escapeHtml(fixGrammar(detail)) + '</p>';
                html += '</div>';
                html += '</div>';
            });
            html += '</div>';
        }
        html += '</div>';
        return html;
    }

    function renderAppliedScenario(section) {
        var html = '<div class="cc5-card cc5-applied-scenario-card">';
        // v13.94.3: hard-coded English flow badge - see renderHookScenario.
        html += '<div class="cc5-flow-badge"><span class="cc5-flow-pill cc5-flow-pill-applied">' + escapeHtml(getLabel('onTheJob')) + '</span></div>';
        html += '<div class="cc5-continuity-banner">';
        html += '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
        // v13.94.3: hard-coded English continuity banner.
        html += '<span>' + escapeHtml(getLabel('continuingTheScenario')) + '</span>';
        html += '</div>';
        // v13.94.3: emitted unconditionally, but NO prompt asks for `title` on this card
        // type and no code assigns one - only card 6 gets a title. So this rendered a
        // literal <h3></h3> on every applied-scenario card of every VET/Workplace/PD
        // module, and .cc5-unified-title carries `margin: 0 0 14px 0`, i.e. a 14px
        // phantom gap under the flow badge. Guarded the way renderCompetencySummary
        // already guards its own title.
        if (section.title) {
            html += '<h3 class="cc5-unified-title">' + escapeHtml(fixGrammar(section.title)) + '</h3>';
        }

        if (section.sceneParts && section.sceneParts.length) {
            html += '<div class="cc5-scene-parts cc5-scene-parts-applied">';
            var appliedUsedIcons = new Set();
            section.sceneParts.forEach(function (part, idx) {
                var partText = part.text || part.content || part.description || part.detail || part.body || part.narrative || '';
                var resolvedIcon = resolveScenePartIcon(part.icon, part.title, partText, idx, 'applied-scenario', appliedUsedIcons);
                html += '<div class="cc5-scene-part">';
                html += '<div class="cc5-scene-part-icon">';
                html += getIcon(resolvedIcon);
                html += '</div>';
                html += '<div class="cc5-scene-part-body">';
                if (part.title) html += '<div class="cc5-scene-part-title">' + escapeHtml(fixGrammar(part.title)) + '</div>';
                if (partText) html += '<p class="cc5-scene-part-text">' + escapeHtml(fixGrammar(partText)) + '</p>';
                html += '</div>';
                html += '</div>';
            });
            html += '</div>';
        } else {
            var content = section.content || section.bodyText || section.description || '';
            if (content) {
                var beats = splitIntoBeats(content);
                html += '<div class="cc5-scene-parts cc5-scene-parts-applied">';
                beats.forEach(function (beat, idx) {
                    html += '<div class="cc5-scene-part">';
                    html += '<div class="cc5-scene-part-icon" style="font-size:0.82rem;font-weight:700;">' + (idx + 1) + '</div>';
                    html += '<div class="cc5-scene-part-body">';
                    html += '<p class="cc5-scene-part-text">' + escapeHtml(fixGrammar(beat)) + '</p>';
                    html += '</div>';
                    html += '</div>';
                });
                html += '</div>';
            }
        }

        if (section.highlightText) {
            html += '<div class="cc5-scenario-highlight cc5-applied-highlight"><span>' + escapeHtml(fixGrammar(section.highlightText)) + '</span></div>';
        }
        html += '</div>';
        return html;
    }

    function renderDecisionPoint(section) {
        var html = '<div class="cc5-card cc5-decision-point-card">';
        // v13.94.3: yourDecision already existed in translations.js, unused here.
        html += '<div class="cc5-flow-badge"><span class="cc5-flow-pill cc5-flow-pill-decision">' + escapeHtml(getLabel('yourDecision')) + '</span></div>';
        html += '<div class="cc5-continuity-banner cc5-activity-banner">';
        html += '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>';
        // v13.94.3: hard-coded English activity banner.
        html += '<span>' + escapeHtml(getLabel('nowCompleteActivityConfirm')) + '</span>';
        html += '</div>';
        // v13.94.3: same unconditional empty <h3> as the other five 7-card renderers -
        // no prompt asks for `title` here either, so this shipped a 14px phantom gap
        // under the flow badge. Guarded to match renderCompetencySummary.
        if (section.title) {
            html += '<h3 class="cc5-unified-title">' + escapeHtml(fixGrammar(section.title)) + '</h3>';
        }
        if (section.question) {
            html += '<p class="cc5-dp-question">' + escapeHtml(fixGrammar(section.question)) + '</p>';
        }
        var opts = shuffleOptions(section.options || []); // v12.33 FIX-DP-SHUFFLE
        var letters = ['A', 'B', 'C', 'D'];
        if (opts.length) {
            html += '<div class="cc5-dp-options" data-answered="false">';
            opts.forEach(function (opt, idx) {
                var letter = letters[idx] || String.fromCharCode(65 + idx);
                var isCorrect = !!(opt.correct || opt.isCorrect);
                // v13.86: correctness was conveyed by a background colour plus a CSS ::after
                // glyph on a permanently empty span, on a div with no aria-pressed, no
                // aria-disabled once locked, and feedback in no live region.
                // v13.93: URL of this option's feedback narration, pre-generated at build
                // time in the author's chosen Chirp 3 HD voice. Carried on the element so
                // the click handler needs no lookup back into the manifest.
                var _fbAudio = opt.feedbackAudioUrl ? ' data-feedback-audio="' + escapeHtml(opt.feedbackAudioUrl) + '"' : '';
                html += '<div class="cc5-dp-option" data-idx="' + idx + '" data-correct="' + isCorrect + '"' + _fbAudio + ' role="button" tabindex="0" aria-pressed="false">';
                html += '<span class="cc5-dp-option-letter">' + letter + '</span>';
                html += '<div class="cc5-dp-option-body">';
                html += '<span class="cc5-dp-option-text">' + escapeHtml(fixGrammar(opt.text || '')) + '</span>';
                if (opt.feedback) {
                    html += '<div class="cc5-dp-feedback" role="status" aria-live="polite">' +
                        escapeHtml(fixGrammar(opt.feedback)) + '</div>';
                }
                html += '</div>';
                html += '<span class="cc5-dp-result-icon" aria-hidden="true"></span>';
                html += '<span class="cc5-sr-only cc5-dp-result-text"></span>';
                html += '</div>';
            });
            html += '</div>';
            // v10.36: Try Again button  -  shown only after an incorrect answer; hidden by default
            html += '<div class="cc5-dp-try-again" style="display:none;">';
            // v13.94.3: hard-coded English label AND aria-label; tryAgain already
            // existed in translations.js, unused here.
            html += '<button type="button" class="cc5-dp-try-again-btn" aria-label="' + escapeHtml(getLabel('tryAgain')) + '">';
            html += '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/></svg>';
            html += ' ' + escapeHtml(getLabel('tryAgain')) + '</button>';
            html += '</div>';
        }
        html += '</div>';
        return html;
    }

    function renderMistakesCard(section) {
        var html = '<div class="cc5-card cc5-mistakes-card">';
        // v13.94.3: hard-coded English flow badge - see renderHookScenario.
        html += '<div class="cc5-flow-badge"><span class="cc5-flow-pill cc5-flow-pill-mistakes">' + escapeHtml(getLabel('watchOutFor')) + '</span></div>';
        // v13.94.3: emitted unconditionally, but NO prompt asks for `title` on this card
        // type and no code assigns one - only card 6 gets a title. So this rendered a
        // literal <h3></h3> on every mistakes card of every VET/Workplace/PD
        // module, and .cc5-unified-title carries `margin: 0 0 14px 0`, i.e. a 14px
        // phantom gap under the flow badge. Guarded the way renderCompetencySummary
        // already guards its own title.
        if (section.title) {
            html += '<h3 class="cc5-unified-title">' + escapeHtml(fixGrammar(section.title)) + '</h3>';
        }
        html += '<div class="cc5-mistakes-list">';
        var items = section.items || [];
        var legacyItems = section.errorItems || section.pitfallItems || [];
        var allItems = items.length ? items : legacyItems;
        var mistakesUsedIcons = new Set();
        allItems.forEach(function (item, idx) {
            var mistake = typeof item === 'string' ? item : (item.mistake || item.error || item.pitfall || '');
            var consequence = typeof item === 'string' ? '' : (item.consequence || '');
            var aiIcon = typeof item === 'string' ? '' : (item.icon || '');
            var resolvedIcon = resolveScenePartIcon(aiIcon, mistake, consequence, idx, 'mistakes', mistakesUsedIcons);
            html += '<div class="cc5-mistake-item">';
            html += '<div class="cc5-mistake-header">';
            html += '<div class="cc5-mistake-icon">' + getIcon(resolvedIcon) + '</div>';
            html += '<p class="cc5-mistake-text">' + escapeHtml(fixGrammar(mistake)) + '</p>';
            html += '</div>';
            if (consequence) {
                html += '<div class="cc5-mistake-consequence">';
                html += '<span class="cc5-consequence-label">' + getIcon('arrow-right') + ' Result</span>';
                html += '<p>' + escapeHtml(fixGrammar(consequence)) + '</p>';
                html += '</div>';
            }
            html += '</div>';
        });
        html += '</div></div>';
        return html;
    }

    function renderCompetencySummary(section) {
        var html = '<div class="cc5-card cc5-competency-summary-card">';
        html += '<div class="cc5-flow-badge"><span class="cc5-flow-pill cc5-flow-pill-summary">You Are Ready When You Can\u2026</span></div>';
        // v11.02 FIX-COMP-TITLE-DOUBLE: Suppress the title if it essentially duplicates
        // the hardcoded badge text (old prompts used "You Are Ready When You Can" as the
        // example, so ChatGPT copied it verbatim).
        var _compTitle = (section.title || '').replace(/[^a-zA-Z]/g, '').toLowerCase();
        var _compBadgeDupe = _compTitle === 'youarereadywhenyoucan' || _compTitle === 'youhavethisskillwhenyoucan';
        if (!_compBadgeDupe && section.title) {
            html += '<h3 class="cc5-unified-title">' + escapeHtml(fixGrammar(section.title)) + '</h3>';
        }

        var goodItems = section.goodItems || [];
        var badItems  = section.badItems  || [];

        // v10.43b: Promote legacy items[] to goodItems so old content also uses the
        // dual-column layout rather than the plain checklist fallback.
        if (!goodItems.length && !badItems.length) {
            var legacyItems = section.items || section.standardItems || [];
            if (legacyItems.length) {
                goodItems = legacyItems; // treat all old items as "good" criteria
            }
        }

        if (goodItems.length || badItems.length) {
            // Dual-column layout.  When only goodItems exist (legacy content upgrade),
            // use cc5-dos-donts--single so the column spans the full width.
            var layoutClass = (goodItems.length && badItems.length)
                ? 'cc5-dos-donts'
                : 'cc5-dos-donts cc5-dos-donts--single';
            html += '<div class="' + layoutClass + '">';

            if (goodItems.length) {
                html += '<div class="cc5-dos-column">';
                html += '<div class="cc5-column-header cc5-dos-header">';
                html += '<span class="cc5-list-icon">' + getIcon('check-circle') + '</span>';
                // v13.94.3: hard-coded English column header. Same key the narration uses.
                html += '<strong>' + escapeHtml(getLabel('whatGoodLooksLike')) + '</strong>';
                html += '</div>';
                html += '<ul class="cc5-dos-list">';
                goodItems.forEach(function (item) {
                    var text = typeof item === 'string' ? item : (item.text || item.behaviour || item.criterion || '');
                    html += '<li class="cc5-do-item">';
                    html += '<span class="cc5-list-icon">' + getIcon('check') + '</span>';
                    html += '<span>' + escapeHtml(fixGrammar(text)) + '</span>';
                    html += '</li>';
                });
                html += '</ul></div>';
            }

            if (badItems.length) {
                html += '<div class="cc5-donts-column">';
                html += '<div class="cc5-column-header cc5-donts-header">';
                html += '<span class="cc5-list-icon">' + getIcon('x-circle') + '</span>';
                // v13.94.3: hard-coded English column header. Same key the narration uses.
                html += '<strong>' + escapeHtml(getLabel('whatToAvoid')) + '</strong>';
                html += '</div>';
                html += '<ul class="cc5-donts-list">';
                badItems.forEach(function (item) {
                    var text = typeof item === 'string' ? item : (item.text || '');
                    // v13.85: the prompt asks for a 10+ word consequence on every one of
                    // these, and the normaliser now keeps it. Previously only the label
                    // reached the page and the consequence was discarded upstream.
                    var consequence = (typeof item === 'string') ? '' : (item.consequence || '');
                    html += '<li class="cc5-dont-item">';
                    html += '<span class="cc5-list-icon">' + getIcon('x') + '</span>';
                    html += '<span>' + escapeHtml(fixGrammar(text));
                    if (consequence) {
                        html += '<span class="cc5-dont-consequence">' + escapeHtml(fixGrammar(consequence)) + '</span>';
                    }
                    html += '</span>';
                    html += '</li>';
                });
                html += '</ul></div>';
            }

            html += '</div>'; // .cc5-dos-donts
        }

        html += '</div>'; // .cc5-card
        return html;
    }

    // ===========================================================================
    // 21a. DECISION CHALLENGE (v11.10)  -  3-activity challenge replacing the
    // single decision-point card.  Activity 1 = quiz, Activity 2 = flip cards,
    // Activity 3 = category sort (good/bad).  Completion triggers celebration.
    // ===========================================================================
    function renderDecisionChallenge(dpCard, flipItems, sortItems, sortLabels, quizVoiceEnabled) {
        var totalActivities = 1;
        var hasFlip = flipItems && flipItems.length >= 2;
        var hasSort = sortItems && sortItems.length >= 4;
        if (hasFlip) totalActivities++;
        if (hasSort) totalActivities++;

        if (totalActivities === 1 && !hasFlip && !hasSort) {
            return renderDecisionPoint(dpCard);
        }

        var actNum = 0;
        var quizIdx  = ++actNum;
        var flipIdx  = hasFlip ? ++actNum : -1;
        var sortIdx  = hasSort ? ++actNum : -1;

        var html = '<div class="cc5-card cc5-decision-challenge" data-total-activities="' + totalActivities + '">';

        // Decorative corner accent
        html += '<div class="cc5-challenge-corner-accent"></div>';

        html += '<div class="cc5-flow-badge"><span class="cc5-flow-pill cc5-flow-pill-decision">';
        html += '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
        // v13.94.3: hard-coded English badge.
        html += ' ' + escapeHtml(getLabel('challengeMode')) + '</span></div>';

        html += '<div class="cc5-continuity-banner cc5-activity-banner">';
        html += '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
        // v13.94.3: hard-coded English banner wrapped around a count - one parameterised
        // key, since the number does not sit in the same place in every language.
        html += '<span>' + _lbl('completeNActivities', {count: '<strong>' + totalActivities + '</strong>'}) + '</span>';
        html += '</div>';

        // Progress stepper with icons
        html += '<div class="cc5-challenge-progress">';

        // Quiz step
        html += '<div class="cc5-challenge-step cc5-active" data-step="' + quizIdx + '">';
        html += '<span class="cc5-step-num"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span>';
        // v13.94.3: hard-coded English progress-stepper label.
        html += '<span class="cc5-step-label">' + escapeHtml(getLabel('quiz')) + '</span>';
        html += '<span class="cc5-step-status"></span>';
        html += '</div>';

        // Flip step
        if (hasFlip) {
            html += '<div class="cc5-challenge-step-line"></div>';
            html += '<div class="cc5-challenge-step" data-step="' + flipIdx + '">';
            html += '<span class="cc5-step-num"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg></span>';
            // v13.94.3: hard-coded English progress-stepper label.
            html += '<span class="cc5-step-label">' + escapeHtml(getLabel('flipAndLearn')) + '</span>';
            html += '<span class="cc5-step-status"></span>';
            html += '</div>';
        }

        // Sort step
        if (hasSort) {
            html += '<div class="cc5-challenge-step-line"></div>';
            html += '<div class="cc5-challenge-step" data-step="' + sortIdx + '">';
            html += '<span class="cc5-step-num"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="16" y1="3" x2="16" y2="21"/><polyline points="12 7 16 3 20 7"/><line x1="8" y1="21" x2="8" y2="3"/><polyline points="4 17 8 21 12 17"/></svg></span>';
            // v13.94.3: hard-coded English progress-stepper label.
            html += '<span class="cc5-step-label">' + escapeHtml(getLabel('categorySort')) + '</span>';
            html += '<span class="cc5-step-status"></span>';
            html += '</div>';
        }
        html += '</div>';

        // -- Activity 1: Quiz --------------------------------------------------
        html += '<div class="cc5-challenge-panel cc5-active" data-panel="' + quizIdx + '">';
        html += '<div class="cc5-panel-header">';
        html += '<span class="cc5-panel-badge cc5-badge-quiz">';
        html += '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
        // v13.94.3: hard-coded English panel badge.
        html += ' ' + escapeHtml(_lbl('activityNumber', {number: quizIdx})) + '</span>';
        // v13.32: Show "Questions & feedback are read aloud" notice when quiz voiceover is enabled
        if (quizVoiceEnabled) {
            html += '<span class="cc5-quiz-voice-badge">';
            html += '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';
            html += ' ' + (getLabel('questionsReadAloud') || 'Questions & feedback are read aloud');
            html += '</span>';
        }
        html += '</div>';
        // v13.94.4: guarded, matching the six sibling renderers fixed in v13.94.3.
        // renderDecisionChallenge was missed in that sweep - and it is the PRIMARY
        // decision-point path (renderDecisionPoint is only reached when there are neither
        // flip nor sort items). Only Route 5's prompt asks for `title` on decision-point;
        // VET, Workplace and PD do not, and nothing in the generator assigns it. So every
        // activity block on those three routes emitted an empty <h3> carrying
        // `margin: 0 0 14px 0` - a phantom gap between the Challenge Mode pill and the
        // banner beneath it.
        if (dpCard.title) {
            html += '<h3 class="cc5-unified-title">' + escapeHtml(fixGrammar(dpCard.title)) + '</h3>';
        }
        if (dpCard.question) {
            html += '<p class="cc5-dp-question">' + escapeHtml(fixGrammar(dpCard.question)) + '</p>';
        }
        var opts = shuffleOptions(dpCard.options || []); // v12.33 FIX-DP-SHUFFLE
        var letters = ['A', 'B', 'C', 'D'];
        if (opts.length) {
            html += '<div class="cc5-dp-options" data-answered="false">';
            opts.forEach(function (opt, idx) {
                var letter = letters[idx] || String.fromCharCode(65 + idx);
                var isCorrect = !!(opt.correct || opt.isCorrect);
                // v13.86: correctness was conveyed by a background colour plus a CSS ::after
                // glyph on a permanently empty span, on a div with no aria-pressed, no
                // aria-disabled once locked, and feedback in no live region.
                // v13.93: URL of this option's feedback narration, pre-generated at build
                // time in the author's chosen Chirp 3 HD voice. Carried on the element so
                // the click handler needs no lookup back into the manifest.
                var _fbAudio = opt.feedbackAudioUrl ? ' data-feedback-audio="' + escapeHtml(opt.feedbackAudioUrl) + '"' : '';
                html += '<div class="cc5-dp-option" data-idx="' + idx + '" data-correct="' + isCorrect + '"' + _fbAudio + ' role="button" tabindex="0" aria-pressed="false">';
                html += '<span class="cc5-dp-option-letter">' + letter + '</span>';
                html += '<div class="cc5-dp-option-body">';
                html += '<span class="cc5-dp-option-text">' + escapeHtml(fixGrammar(opt.text || '')) + '</span>';
                if (opt.feedback) {
                    html += '<div class="cc5-dp-feedback" role="status" aria-live="polite">' +
                        escapeHtml(fixGrammar(opt.feedback)) + '</div>';
                }
                html += '</div>';
                html += '<span class="cc5-dp-result-icon" aria-hidden="true"></span>';
                html += '<span class="cc5-sr-only cc5-dp-result-text"></span>';
                html += '</div>';
            });
            html += '</div>';
            html += '<div class="cc5-dp-try-again" style="display:none;">';
            // v13.94.3: hard-coded English label AND aria-label; tryAgain already
            // existed in translations.js, unused here.
            html += '<button type="button" class="cc5-dp-try-again-btn" aria-label="' + escapeHtml(getLabel('tryAgain')) + '">';
            html += '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/></svg>';
            html += ' ' + escapeHtml(getLabel('tryAgain')) + '</button>';
            html += '</div>';
        }
        if (totalActivities > 1) {
            html += '<button type="button" class="cc5-challenge-next-btn" data-next="' + (quizIdx + 1) + '" disabled>';
            html += '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>';
            // v13.94.3: hard-coded English button label.
            html += ' ' + escapeHtml(getLabel('nextActivity'));
            html += '</button>';
        }
        html += '</div>';

        // -- Activity 2: Flip Cards --------------------------------------------
        if (hasFlip) {
            html += '<div class="cc5-challenge-panel" data-panel="' + flipIdx + '">';
            html += '<div class="cc5-panel-header">';
            html += '<span class="cc5-panel-badge cc5-badge-flip">';
            html += '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>';
            // v13.94.3: hard-coded English panel badge.
            html += ' ' + escapeHtml(_lbl('activityNumber', {number: flipIdx})) + '</span>';
            html += '</div>';
            // v13.94.3: the whole Route 5 activity block was hard-coded English - title,
            // instruction, card face labels, progress text and buttons - so a learner on a
            // Japanese module hit a wall of English the moment the prose cards ended. The
            // instruction carries a count, so it is one parameterised key rather than
            // English fragments concatenated around a number.
            html += '<h3 class="cc5-unified-title">' + escapeHtml(getLabel('flipAndLearn')) + '</h3>';
            html += '<p class="cc5-challenge-instruction">'
                 +  escapeHtml(_lbl('flipInstruction', {count: flipItems.length})) + '</p>';
            html += '<div class="cc5-flip-grid" data-total="' + flipItems.length + '" data-flipped="0">';
            flipItems.forEach(function (item, idx) {
                var flipIcon = resolveScenePartIcon(item.icon || '', item.front || '', item.back || '', idx);
                html += '<div class="cc5-flip-card" data-flip-idx="' + idx + '" data-flipped="false" role="button" tabindex="0" style="animation-delay:' + (idx * 0.08) + 's">';
                html += '<div class="cc5-flip-inner">';
                html += '<div class="cc5-flip-front">';
                html += '<div class="cc5-flip-front-icon">' + getIcon(flipIcon) + '</div>';
                html += '<div class="cc5-flip-label">';
                html += '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 13"/></svg>';
                // v13.94.3: hard-coded English card-front label.
                html += ' ' + escapeHtml(getLabel('tapToReveal')) + '</div>';
                html += '<p class="cc5-flip-front-text">' + escapeHtml(fixGrammar(item.front || '')) + '</p>';
                html += '</div>';
                html += '<div class="cc5-flip-back">';
                html += '<div class="cc5-flip-back-label">';
                html += '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>';
                // v13.94.3: hard-coded English card-back label.
                html += ' ' + escapeHtml(getLabel('insight')) + '</div>';
                html += '<p class="cc5-flip-back-text">' + escapeHtml(fixGrammar(item.back || '')) + '</p>';
                html += '</div>';
                html += '</div></div>';
            });
            html += '</div>';
            html += '<div class="cc5-flip-progress-row">';
            html += '<div class="cc5-flip-progress-bar"><div class="cc5-flip-progress-fill" style="width:0%"></div></div>';
            // v13.94.3: 'explored' was a bare English word appended after a number.
            html += '<span class="cc5-flip-progress-text"><span class="cc5-flip-count">0</span> / '
                 +  flipItems.length + ' ' + escapeHtml(getLabel('explored')) + '</span>';
            html += '</div>';
            html += '<div class="cc5-flip-complete-msg cc5-hidden">';
            html += '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
            // v13.94.3: hard-coded English completion message.
            html += ' ' + escapeHtml(getLabel('allCardsExplored'));
            html += '</div>';
            var nextAfterFlip = hasSort ? sortIdx : -1;
            if (nextAfterFlip > 0) {
                html += '<button type="button" class="cc5-challenge-next-btn" data-next="' + nextAfterFlip + '" disabled>';
                html += '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>';
                // v13.94.3: hard-coded English button label.
            html += ' ' + escapeHtml(getLabel('nextActivity'));
                html += '</button>';
            } else {
                html += '<button type="button" class="cc5-challenge-finish-btn" disabled>';
                html += '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
                // v13.94.3: hard-coded English button label.
            html += ' ' + escapeHtml(getLabel('seeResults')) + '</button>';
            }
            html += '</div>';
        }

        // -- Activity 3: Category Sort -----------------------------------------
        if (hasSort) {
            // v13.94.3: when the manifest carries no contrast labels these fell back to
            // English literals, so the two sort columns and both tap buttons read
            // "Good Practice" / "Avoid" in every language.
            var posLabel = (sortLabels && sortLabels.positive) || getLabel('goodPractice');
            var negLabel = (sortLabels && sortLabels.negative) || getLabel('avoidLabel');
            html += '<div class="cc5-challenge-panel" data-panel="' + sortIdx + '">';
            html += '<div class="cc5-panel-header">';
            html += '<span class="cc5-panel-badge cc5-badge-sort">';
            html += '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="16" y1="3" x2="16" y2="21"/><polyline points="12 7 16 3 20 7"/><line x1="8" y1="21" x2="8" y2="3"/><polyline points="4 17 8 21 12 17"/></svg>';
            // v13.94.3: hard-coded English panel badge.
            html += ' ' + escapeHtml(_lbl('activityNumber', {number: sortIdx})) + '</span>';
            html += '</div>';
            // v13.94.3: hard-coded English title and instruction. The instruction embeds
            // both category names mid-sentence, so it is one parameterised key - the
            // English word order it assumed does not survive translation.
            html += '<h3 class="cc5-unified-title">' + escapeHtml(getLabel('categorySort')) + '</h3>';
            html += '<p class="cc5-challenge-instruction">'
                 +  _lbl('sortInstruction', {
                        positive: '<strong>' + escapeHtml(posLabel) + '</strong>',
                        negative: '<strong>' + escapeHtml(negLabel) + '</strong>'
                    })
                 +  '</p>';
            html += '<div class="cc5-sort-arena" data-total="' + sortItems.length + '" data-current="0" data-score="0">';

            // Columns
            html += '<div class="cc5-sort-columns">';
            html += '<div class="cc5-sort-column cc5-sort-good" data-category="good">';
            html += '<div class="cc5-sort-header">';
            html += '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
            html += ' <span>' + escapeHtml(posLabel) + '</span>';
            html += '</div>';
            html += '<div class="cc5-sort-dropzone" data-category="good"></div>';
            html += '</div>';
            html += '<div class="cc5-sort-column cc5-sort-bad" data-category="bad">';
            html += '<div class="cc5-sort-header">';
            html += '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
            html += ' <span>' + escapeHtml(negLabel) + '</span>';
            html += '</div>';
            html += '<div class="cc5-sort-dropzone" data-category="bad"></div>';
            html += '</div>';
            html += '</div>';

            // Current item card
            html += '<div class="cc5-sort-current-item" style="display:none;">';
            // v13.94.3: hard-coded English "Item n of N" wrapped around live markup. The
            // <span> the sort handler updates is substituted in as {current}, so the two
            // numbers can be ordered however the language needs.
            html += '<div class="cc5-sort-item-badge">'
                 +  _lbl('itemXofY', {current: '<span class="cc5-sort-idx">1</span>', total: sortItems.length})
                 +  '</div>';
            html += '<div class="cc5-sort-item-text"></div>';
            html += '<div class="cc5-sort-tap-btns">';
            html += '<button type="button" class="cc5-sort-tap cc5-sort-tap-good" data-tap="good">';
            html += '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';
            html += ' <span>' + escapeHtml(posLabel) + '</span>';
            html += '</button>';
            html += '<button type="button" class="cc5-sort-tap cc5-sort-tap-bad" data-tap="bad">';
            html += '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
            html += ' <span>' + escapeHtml(negLabel) + '</span>';
            html += '</button>';
            html += '</div>';
            html += '</div>';

            // Score + progress
            html += '<div class="cc5-sort-score-row">';
            // v13.94.3: hard-coded English score label.
            html += '<span class="cc5-sort-score-label">' + escapeHtml(getLabel('scoreLabel'))
                 +  ': <strong class="cc5-sort-score">0</strong> / ' + sortItems.length + '</span>';
            html += '</div>';
            html += '<div class="cc5-sort-progress-bar"><div class="cc5-sort-progress-fill"></div></div>';

            // Hidden data
            html += '<div class="cc5-sort-items-data" style="display:none;">';
            sortItems.forEach(function (item, idx) {
                html += '<div data-sort-item="' + idx + '" data-category="' + escapeHtml(item.category) + '">' + escapeHtml(item.text) + '</div>';
            });
            html += '</div>';
            html += '</div>';

            html += '<button type="button" class="cc5-challenge-finish-btn" disabled>';
            html += '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
            // v13.94.3: hard-coded English button label.
            html += ' ' + escapeHtml(getLabel('seeResults')) + '</button>';
            html += '</div>';
        }

        // -- Completion screen -------------------------------------------------
        html += '<div class="cc5-challenge-complete cc5-hidden">';
        html += '<div class="cc5-confetti-container"></div>';
        html += '<div class="cc5-complete-trophy">';
        html += '<svg viewBox="0 0 64 64" width="48" height="48">';
        html += '<path d="M20 8h24v18c0 6.63-5.37 12-12 12s-12-5.37-12-12V8z" fill="hsl(40 95% 52%)" stroke="hsl(36 90% 42%)" stroke-width="1.5"/>';
        html += '<path d="M20 14h-6a6 6 0 0 0 0 12h6" fill="hsl(42 90% 58%)" stroke="hsl(36 90% 42%)" stroke-width="1.5"/>';
        html += '<path d="M44 14h6a6 6 0 0 1 0 12h-6" fill="hsl(42 90% 58%)" stroke="hsl(36 90% 42%)" stroke-width="1.5"/>';
        html += '<rect x="28" y="38" width="8" height="10" rx="2" fill="hsl(36 80% 45%)" stroke="hsl(36 90% 42%)" stroke-width="1"/>';
        html += '<rect x="22" y="48" width="20" height="5" rx="2.5" fill="hsl(36 70% 40%)" stroke="hsl(36 90% 42%)" stroke-width="1"/>';
        html += '<path d="M26 8v4h12V8" fill="hsl(42 95% 65%)" opacity="0.5"/>';
        html += '</svg>';
        html += '</div>';
        html += '<div class="cc5-challenge-score-ring">';
        html += '<svg viewBox="0 0 120 120" class="cc5-score-svg"><circle class="cc5-score-track" cx="60" cy="60" r="52"/><circle class="cc5-score-fill" cx="60" cy="60" r="52"/></svg>';
        html += '<div class="cc5-challenge-percentage">0%</div>';
        html += '</div>';
        // v13.94.3: hard-coded English completion tally.
        html += '<div class="cc5-challenge-result-text">'
             +  _lbl('nActivitiesComplete', {current: '<span class="cc5-result-correct">0</span>', total: totalActivities})
             +  '</div>';
        html += '<div class="cc5-challenge-actions">';
        html += '<button type="button" class="cc5-challenge-retry-btn">';
        html += '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/></svg>';
        // v13.94.3: tryAgain already existed in translations.js, unused here.
        html += ' ' + escapeHtml(getLabel('tryAgain')) + '</button>';
        html += '<button type="button" class="cc5-challenge-review-btn">';
        html += '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
        // v13.94.3: hard-coded English button label.
        html += ' ' + escapeHtml(getLabel('reviewAnswers')) + '</button>';
        // v12.57 FIX-CC-CHALLENGE-NEXT: "Continue" button so students can progress to Content 2
        // (the next topic) after completing the Challenge Mode activity. Previously the
        // completion screen only offered "Try Again" and "Review Answers"  -  there was no
        // way to move forward without scrolling up to find the next-slide chevron.
        // The button is always rendered (it will be enabled/hidden by the click handler in
        // player5.js if there is no next slide to navigate to).
        html += '<button type="button" class="cc5-challenge-continue-btn">';
        html += '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><polyline points="12 5 19 12 12 19"/></svg>';
        // v13.94.3: hard-coded English button label.
        html += ' ' + escapeHtml(getLabel('continueLabel')) + '</button>';
        html += '</div>';
        html += '</div>';

        html += '</div>';
        return html;
    }

    // ===========================================================================
    // 21b. ROUTE CARD (dispatch  -  calls other card renderers by cardType)
    // ===========================================================================
    // ===========================================================================
    // v13.92: ROUTE 5 - "TOPICS AND TEXT" prose card.
    //
    // ONE renderer serves all four slots. They differ in colour and icon, never in
    // shape: a fixed heading and exactly two short paragraphs.
    //
    // Standing requirements, all four from the owner:
    //   - The heading is FIXED and universal - Overview / Key Concepts /
    //     Examples & Application / Key Takeaways - and NEVER carries the topic name.
    //     It is supplied here, from the card type. Anything the model returned in
    //     `heading` was already deleted in generator.js normalizeCardSchema().
    //   - Colour-coordinated: each slot owns a soft tint, an accent and an icon chip.
    //   - NO left accent rail, and NO nested container. The card IS the container.
    //   - Cards reveal one at a time. Each carries a "Next Card" button; the last
    //     one's button reveals the activity block instead.
    //
    // Sequential-reveal markup contract (player5.js and player5.css depend on it):
    //   .cc5-prose-grid[data-prose-seq]   wrapper, one per section
    //   .cc5-prose-card[data-prose-index] one per card, 0-based
    //   .cc5-prose-card.cc5-prose-hidden  not yet revealed (display:none - it is OUT of
    //                                     the flow; the grid fills left-to-right so no
    //                                     card already on screen changes position, though
    //                                     row 1 can grow taller when card 2 arrives)
    //   .cc5-prose-card.cc5-prose-active  currently being narrated
    //   .cc5-prose-para[data-para-index]  one per paragraph
    //   .cc5-prose-para.cc5-para-focus    the paragraph being read right now
    // ===========================================================================
    // v13.94.3: TOPICSTEXT_HEADINGS - an English heading table that sat behind
    // `(_headKey && getLabel(_headKey)) || TOPICSTEXT_HEADINGS[cardType] || 'Overview'`
    // - has been DELETED, along with those two fallback arms. It was unreachable.
    // getLabel() ends `return labels[key] || UI_LABELS['en'][key] || key`, and a key is
    // always a non-empty string, so getLabel() can never return a falsy value and no
    // `|| fallback` after it can ever run. The table looked like a safety net and was
    // not one: if a key were ever missing from translations.js the card would render the
    // raw key name, and the table would not have stopped it. The fix for a missing key
    // is to add it to translations.js.
    //
    // NOTE the difference from cc-state.js's PROSE_HEADINGS, which is deliberately kept:
    // there the fallback is REACHABLE, because cc-state reaches the label bundle through
    // a resolver the player registers at init, and that resolver is null until it does
    // (and stays null on build-time paths that never start the player).
    //
    // The v13.91 slot names still need mapping, so the key table below keeps them:
    // four map onto the nearest current heading so saved modules built on the old
    // Explanatory Spine still read correctly, and 'mechanism' keeps a heading of its own
    // because folding it into either neighbour would put two identically-headed cards in
    // one saved module. Nothing generates it any more.

    var TOPICSTEXT_ICONS = {
        // Every value here is verified present in cc-icons.js. Do not add one without
        // checking: getIcon() on an unknown name yields no glyph, and the header then
        // renders with a gap where the icon should be.
        'overview':             'book-open',
        'key-concepts':         'lightbulb',
        'examples-application': 'clipboard-list',
        'key-takeaways':        'award',
        'orientation':          'book-open',
        'foundations':          'lightbulb',
        'mechanism':            'puzzle',
        'in-practice':          'clipboard-list',
        'boundaries':           'award'
    };

    // Colour token suffix per slot. The palette itself lives in player5.css as
    // --cc5-prose-{tone}-* custom properties, so a rebrand is a CSS-only change.
    var TOPICSTEXT_TONES = {
        'overview':             'blue',
        'key-concepts':         'violet',
        'examples-application': 'amber',
        'key-takeaways':        'green',
        'orientation':          'blue',
        'foundations':          'violet',
        'mechanism':            'violet',
        'in-practice':          'amber',
        'boundaries':           'green'
    };

    /**
     * Clean paragraph strings from whatever shape the card carries.
     *
     * v13.91 shipped cards showing a literal backslash-n on screen, because the model
     * returned the whole card as ONE string with escaped newlines inside it and nothing
     * ever split it. generator.js now normalises this on the way in; this is the second
     * line of defence for manifests saved before that fix.
     *
     * @param {Object} section The prose card.
     * @return {Array} Plain-text paragraphs.
     */
    function proseParagraphsOf(section) {
        var paras = section && section.paragraphs;
        if (typeof paras === 'string') { paras = [paras]; }
        if (!Array.isArray(paras) || !paras.length) {
            // `description` last: getFailedCardSequence() stamps the "AI generation
            // failed - use Regenerate Failed to retry" message there. Without this the
            // author saw a bare "No content yet" and no way to tell a failed card from
            // an empty one.
            var fallback = (section && (section.bodyText || section.text || section.content || section.description)) || '';
            paras = fallback ? [fallback] : [];
        }
        var out = [];
        paras.forEach(function (p) {
            var t = typeof p === 'string' ? p : ((p && (p.text || p.paragraph || p.body)) || '');
            if (!t) { return; }
            t.replace(/\\r\\n|\\n|\\r/g, '\n')
             .replace(/<br\s*\/?>/gi, '\n')
             .split(/\n+/)
             .forEach(function (part) {
                var c = part.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '')
                            .replace(/\*\*(.+?)\*\*/g, '$1')
                            .replace(/\s{2,}/g, ' ')
                            .trim();
                if (c) { out.push(c); }
             });
        });
        return out;
    }

    /**
     * Render one Topics-and-Text prose card.
     *
     * @param {Object} section   The card.
     * @param {Object} seqOpts   Sequential-reveal options: { index, total, hasActivities }.
     * @return {String} HTML.
     */
    function renderProseSection(section, seqOpts) {
        var cardType = section.cardType || '';
        var paras = proseParagraphsOf(section);
        var opts = seqOpts || {};
        var index = typeof opts.index === 'number' ? opts.index : 0;
        var total = typeof opts.total === 'number' ? opts.total : 1;
        var isLast = index >= total - 1;

        var icon = TOPICSTEXT_ICONS[cardType] || 'book-open';
        var tone = TOPICSTEXT_TONES[cardType] || 'blue';
        // The heading is never taken from the card. See the block comment above.
        // v13.94.3: the heading was returned as a hard-coded English string, so a module
        // generated in another language rendered (and had TTS read) an English heading
        // over translated prose. Prefer the translated label; fall back to English.
        var _headKeys = {
            'overview': 'proseOverview',
            'key-concepts': 'proseKeyConcepts',
            'examples-application': 'proseExamplesApplication',
            'key-takeaways': 'proseKeyTakeaways',
            'orientation': 'proseOverview',
            'foundations': 'proseKeyConcepts',
            'mechanism': 'proseHowItWorks',
            'in-practice': 'proseExamplesApplication',
            'boundaries': 'proseKeyTakeaways'
        };
        // v13.94.3: dead fallback arms removed - getLabel() cannot return falsy.
        var heading = getLabel(_headKeys[cardType] || 'proseOverview');

        var cls = 'cc5-card cc5-prose-card cc5-prose-' + tone
                + ' cc5-' + escapeHtml(cardType || 'prose') + '-card';
        // Card 0 is visible from the start; the rest wait to be revealed.
        if (index > 0) { cls += ' cc5-prose-hidden'; }

        var html = '<div class="' + cls + '" data-prose-index="' + index + '"'
                 + ' data-prose-tone="' + tone + '"'
                 + (index > 0 ? ' aria-hidden="true"' : '') + '>';
        html += '<div class="cc5-card-header cc5-prose-header">'
             +  '<span class="cc5-prose-icon">' + getIcon(icon) + '</span>'
             +  '<h4>' + escapeHtml(heading) + '</h4>'
             // v13.92: green pulsing speaker, top right. Shown ONLY while this card is
             // the one being narrated - player5.js adds .cc5-prose-speaking. It is
             // decorative; the audio state is already announced by the voiceover button.
             +  '<span class="cc5-prose-vo-dot" aria-hidden="true">'
             +  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" '
             +  'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
             +  '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>'
             +  '<path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>'
             +  '<path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>'
             +  '</span>'
             +  '</div>';
        html += '<div class="cc5-card-body cc5-prose-body">';
        if (!paras.length) {
            // Never render an empty shell - name the problem so the author sees which card.
            html += '<p class="cc5-prose-empty">' + escapeHtml(getLabel('noContentYet')) + '</p>';
        } else {
            paras.forEach(function (p, pi) {
                html += '<p class="cc5-prose-para" data-para-index="' + pi + '">'
                     +  escapeHtml(fixGrammar(p)) + '</p>';
            });
        }
        // The reveal control. Present on every card; the last card's button opens the
        // activity block when there is one, and is simply omitted when there is not.
        if (!isLast) {
            html += '<button type="button" class="cc5-prose-next-btn" data-prose-next="' + (index + 1) + '">'
                 +  '<span>' + escapeHtml(getLabel('nextCard') || 'Next Card') + '</span>'
                 +  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" '
                 +  'stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
                 +  '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>'
                 +  '</button>';
        } else if (opts.hasActivities) {
            html += '<button type="button" class="cc5-prose-next-btn cc5-prose-final-btn" data-prose-next="activities">'
                 +  '<span>' + escapeHtml(getLabel('startActivities') || 'Start Activities') + '</span>'
                 +  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" '
                 +  'stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
                 +  '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>'
                 +  '</button>';
        }
        html += '</div></div>';
        return html;
    }

    function renderRouteCard(section, seqOpts) {
        var cardType = section.cardType || '';
        switch (cardType) {
            // -- v13.92 Topics and Text: four prose slots, one renderer ---------
            // (the five v13.91 slot names still route here so saved modules render)
            case 'overview':
            case 'key-concepts':
            case 'examples-application':
            case 'key-takeaways':
            case 'orientation':
            case 'foundations':
            case 'mechanism':
            case 'in-practice':
            case 'boundaries':          return renderProseSection(section, seqOpts);
            // -- v10.27 unified 7-card types (all routes) ----------------------
            case 'hook-scenario':       return renderHookScenario(section);
            case 'concept-explainer':   return renderConceptExplainer(section);
            case 'mental-model':        return renderMentalModel(section);
            case 'applied-scenario':    return renderAppliedScenario(section);
            case 'decision-point':      return renderDecisionPoint(section);
            case 'mistakes':            return renderMistakesCard(section);
            case 'competency-summary':  return renderCompetencySummary(section);
            // -- legacy card types (backward compat for saved modules) ---------
            case 'performance-anchor':  return renderPerformanceAnchor(section);
            case 'plain-english':       return renderPlainEnglish(section);
            case 'action-breakdown':    return renderActionBreakdown(section);
            case 'competence-standard': return renderCompetenceStandard(section);
            case 'scenario-1':
            case 'scenario-2':          return section.turningPoint ? renderPDScenarioCard(section) : renderRouteScenarioCard(section);
            case 'common-errors':       return renderCommonErrors(section);
            case 'concept-anchor':      return renderConceptAnchor(section);
            case 'theoretical-framework': return renderTheoreticalFramework(section);
            case 'analytical-lens':     return renderAnalyticalLens(section);
            case 'ethics-considerations': return renderEthicsConsiderations(section);
            case 'case-study-1':
            case 'case-study-2':        return renderCaseStudy(section);
            case 'business-impact':     return renderBusinessImpact(section);
            case 'action-framework':    return renderActionFramework(section);
            case 'risk-card':           return renderRiskCard(section);
            case 'policy-alignment':    return renderPolicyAlignment(section);
            case 'skill-anchor':        return renderSkillAnchor(section);
            case 'core-framework':      return renderCoreFramework(section);
            case 'application-guide':   return renderApplicationGuide(section);
            case 'common-pitfalls':     return renderCommonPitfalls(section);
            default:
                var html = '<div class="cc5-card cc5-' + escapeHtml(cardType || 'generic') + '-card">';
                html += '<div class="cc5-card-header">' + getIcon('info') + '<h4>' + escapeHtml(fixGrammar(section.heading || section.title || '')) + '</h4></div>';
                html += '<div class="cc5-card-body">';
                if (section.bodyText) html += '<p>' + escapeHtml(fixGrammar(section.bodyText)) + '</p>';
                html += '</div></div>';
                return html;
        }
    }

    // ===========================================================================
    // 22. BEFORE YOU START CARD (v7.6.8)
    // Interactive pre-task safety checklist; user MUST tick each item
    // ===========================================================================
    function renderBeforeYouStartCard(checklistItems) {
        if (!checklistItems || checklistItems.length === 0) return '';

        var html = '<div class="cc5-beforestart-section" data-checklist-required="true" data-checklist-count="' + checklistItems.length + '">';

        html += '<div class="cc5-layer-header cc5-beforestart-header">';
        html += '<span class="cc5-layer-badge cc5-badge-beforestart">';
        html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>';
        html += (getLabel('beforeYouStart') || 'Before You Start');
        html += '</span>';
        html += '<span class="cc5-checklist-status" style="display:none;margin-left:auto;font-size:0.75rem;color:var(--cc5-green);font-weight:600;">';
        html += '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> ';
        html += (getLabel('completed') || 'Completed');
        html += '</span>';
        html += '</div>';

        html += '<div class="cc5-beforestart-checklist">';
        html += '<p class="cc5-checklist-instruction" style="font-size:0.875rem;color:var(--cc5-text-muted);margin-bottom:12px;">';
        html += '<span class="cc5-instruction-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg></span>';
        html += (getLabel('checkAllItems') || 'Tick each box to confirm you have completed these pre-start checks');
        html += '</p>';
        html += '<ul class="cc5-checklist-items">';
        checklistItems.forEach(function (item, idx) {
            var itemId   = 'cc5-checklist-' + Date.now() + '-' + idx;
            var itemText = escapeHtml(fixGrammar(typeof item === 'string' ? item : item.text || item.item || ''));
            html += '<li class="cc5-checklist-item cc5-checklist-interactive" data-checked="false">';
            html += '<label class="cc5-check-label" for="' + itemId + '">';
            html += '<input type="checkbox" id="' + itemId + '" class="cc5-checklist-checkbox" />';
            html += '<span class="cc5-check-box">';
            html += '<svg class="cc5-check-empty" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>';
            html += '<svg class="cc5-check-filled" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none;"><path d="M9 11l3 3L22 4"/><rect x="3" y="3" width="18" height="18" rx="2"/></svg>';
            html += '</span>';
            html += '<span class="cc5-check-text">' + itemText + '</span>';
            html += '</label>';
            html += '</li>';
        });
        html += '</ul>';
        html += '</div>';

        html += '</div>';
        return html;
    }

    // ===========================================================================
    // 23. DOC ACTIVITY (v7.5.15)
    // Interactive document-based exercise rendered after Quick-Check card
    // ===========================================================================
    function renderDocActivity(docActivity) {
        if (!docActivity || !docActivity.activityType) return '';

        var html = '<div class="cc5-docactivity-section">';

        html += '<div class="cc5-layer-header cc5-docactivity-header">';
        html += '<span class="cc5-layer-badge cc5-badge-docactivity">';
        html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>';
        html += (getLabel('documentActivity') || 'Document Activity');
        html += '</span>';
        if (docActivity.title) {
            html += '<h3 class="cc5-docactivity-title">' + escapeHtml(fixGrammar(docActivity.title)) + '</h3>';
        }
        html += '</div>';

        if (docActivity.scenario || docActivity.instructions) {
            html += '<div class="cc5-docactivity-context">';
            html += '<p>' + escapeHtml(fixGrammar(docActivity.scenario || docActivity.instructions)) + '</p>';
            html += '</div>';
        }

        if (docActivity.questions && docActivity.questions.length > 0) {
            html += '<div class="cc5-docactivity-questions">';
            docActivity.questions.forEach(function (q, idx) {
                html += '<div class="cc5-docactivity-question" data-question-index="' + idx + '">';
                html += '<div class="cc5-question-number">Q' + (idx + 1) + '</div>';
                html += '<div class="cc5-question-content">';
                html += '<p class="cc5-question-text">' + escapeHtml(fixGrammar(q.question || q.text)) + '</p>';
                if (q.options && q.options.length > 0) {
                    html += '<ul class="cc5-question-options">';
                    // v13.36 FIX-QUIZ-CORRECT-HIGHLIGHT: Prefer per-option isCorrect/correct flags.
                    // Only fall back to q.correctAnswer index when NO option has explicit flags.
                    // Prevents AI generating correctAnswer:0 (A) AND isCorrect:true on D from
                    // marking both A and D correct, causing inverted green/red highlight.
                    var anyExplicitCorrect = q.options.some(function (o) { return o.isCorrect || o.correct; });
                    q.options.forEach(function (opt, optIdx) {
                        var isCorrect = anyExplicitCorrect
                            ? !!(opt.isCorrect || opt.correct)
                            : (q.correctAnswer === optIdx);
                        html += '<li class="cc5-option' + (isCorrect ? ' cc5-correct-option' : '') + '" data-correct="' + isCorrect + '">';
                        html += '<span class="cc5-option-letter">' + String.fromCharCode(65 + optIdx) + '</span>';
                        html += '<span class="cc5-option-text">' + escapeHtml(fixGrammar(typeof opt === 'string' ? opt : opt.text)) + '</span>';
                        html += '</li>';
                    });
                    html += '</ul>';
                }
                if (q.explanation || q.feedback) {
                    html += '<div class="cc5-question-explanation" style="display:none;">';
                    html += '<p>' + escapeHtml(fixGrammar(q.explanation || q.feedback)) + '</p>';
                    html += '</div>';
                }
                html += '</div>';
                html += '</div>';
            });
            html += '</div>';
        }

        html += '</div>';
        return html;
    }

    // ===========================================================================
    // 24. ACCENT CARDS (keyTakeaway / proTip / keyInfo / expertInsight)
    // Note: linkifyPdfSections is a no-op since v7.4.9; formatTextWithDocLinks
    //       is called directly here.
    // ===========================================================================
    function renderAccentCards(section, linkedDocsTracker) {
        var html = '';
        linkedDocsTracker = linkedDocsTracker || {};

        // Green card: Key Takeaway
        if (section.keyTakeaway) {
            html += '<div class="cc5-accent-card cc5-accent-card-green">';
            html += '<div class="cc5-accent-card-icon">';
            html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>';
            html += '</div>';
            html += '<div class="cc5-accent-card-content">';
            html += '<div class="cc5-accent-card-title">' + getLabel('keyTakeaway') + '</div>';
            html += '<p class="cc5-accent-card-text">' + formatTextWithDocLinks(section.keyTakeaway, linkedDocsTracker) + '</p>';
            html += '</div>';
            html += '</div>';
        }

        // Amber card: Pro Tip
        if (section.proTip) {
            html += '<div class="cc5-accent-card cc5-accent-card-amber">';
            html += '<div class="cc5-accent-card-icon">';
            html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>';
            html += '</div>';
            html += '<div class="cc5-accent-card-content">';
            html += '<div class="cc5-accent-card-title">' + getLabel('proTip') + '</div>';
            html += '<p class="cc5-accent-card-text">' + formatTextWithDocLinks(section.proTip, linkedDocsTracker) + '</p>';
            html += '</div>';
            html += '</div>';
        }

        // Blue card: Did You Know / Key Information
        if (section.keyInfo || section.didYouKnow) {
            var infoText = section.keyInfo || section.didYouKnow;
            html += '<div class="cc5-accent-card cc5-accent-card-blue">';
            html += '<div class="cc5-accent-card-icon">';
            html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>';
            html += '</div>';
            html += '<div class="cc5-accent-card-content">';
            html += '<div class="cc5-accent-card-title">' + getLabel(section.didYouKnow ? 'didYouKnow' : 'keyInfo') + '</div>';
            html += '<p class="cc5-accent-card-text">' + formatTextWithDocLinks(infoText, linkedDocsTracker) + '</p>';
            html += '</div>';
            html += '</div>';
        }

        // Purple card: Expert Insight
        if (section.expertInsight) {
            html += '<div class="cc5-accent-card cc5-accent-card-purple">';
            html += '<div class="cc5-accent-card-icon">';
            html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
            html += '</div>';
            html += '<div class="cc5-accent-card-content">';
            html += '<div class="cc5-accent-card-title">' + getLabel('expertInsight') + '</div>';
            html += '<p class="cc5-accent-card-text">' + formatTextWithDocLinks(section.expertInsight, linkedDocsTracker) + '</p>';
            html += '</div>';
            html += '</div>';
        }

        return html;
    }

    return {
        init:                      init,
        // v13.94.3: the seven unified 7-card renderers and renderProseSection were
        // exported here with ZERO callers anywhere in amd/src - every one of them is
        // reached through renderRouteCard(), which dispatches on cardType internally.
        // Exporting them advertised an entry point nobody used and that nobody should
        // use: calling one directly bypasses the dispatch and the seqOpts renderRouteCard
        // threads into renderProseSection. The functions themselves are untouched.
        // legacy renderers (backward compat)
        renderPerformanceAnchor:   renderPerformanceAnchor,
        renderPlainEnglish:        renderPlainEnglish,
        renderActionBreakdown:     renderActionBreakdown,
        renderCompetenceStandard:  renderCompetenceStandard,
        renderRouteScenarioCard:   renderRouteScenarioCard,
        renderCommonErrors:        renderCommonErrors,
        renderConceptAnchor:       renderConceptAnchor,
        renderTheoreticalFramework: renderTheoreticalFramework,
        renderAnalyticalLens:      renderAnalyticalLens,
        renderEthicsConsiderations: renderEthicsConsiderations,
        renderCaseStudy:           renderCaseStudy,
        renderBusinessImpact:      renderBusinessImpact,
        renderActionFramework:     renderActionFramework,
        renderRiskCard:            renderRiskCard,
        renderPolicyAlignment:     renderPolicyAlignment,
        renderSkillAnchor:         renderSkillAnchor,
        renderCoreFramework:       renderCoreFramework,
        renderApplicationGuide:    renderApplicationGuide,
        renderCommonPitfalls:      renderCommonPitfalls,
        renderPDScenarioCard:      renderPDScenarioCard,
        renderRouteCard:           renderRouteCard,
        renderDecisionChallenge:   renderDecisionChallenge,
        renderBeforeYouStartCard:  renderBeforeYouStartCard,
        renderDocActivity:         renderDocActivity,
        renderAccentCards:         renderAccentCards
    };
});
