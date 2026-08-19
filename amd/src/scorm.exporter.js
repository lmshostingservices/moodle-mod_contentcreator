/**
 * Content Creator v3.1.0 - SCORM 1.2 Exporter
 * [SPEC] Completion-only tracking (lesson_status), NO scores
 * [SPEC] Self-contained HTML package with manifest
 *
 * @module     mod_contentcreator/scorm.exporter
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
define([], function() {
    'use strict';

    const SCORM_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{TITLE}}</title>
    <style>{{STYLES}}</style>
</head>
<body>
    <div class="cc-app" id="contentcreator-app"></div>
    <script>
        var MANIFEST = {{MANIFEST}};
        var scormAPI = null;

        function initSCORM() {
            if (typeof window.API !== 'undefined') {
                scormAPI = window.API;
            } else if (typeof window.API_1484_11 !== 'undefined') {
                scormAPI = window.API_1484_11;
            }
            if (scormAPI) {
                try {
                    scormAPI.LMSInitialize('');
                    scormAPI.LMSSetValue('cmi.core.lesson_status', 'incomplete');
                    scormAPI.LMSCommit('');
                } catch (e) {}
            }
        }

        function setComplete() {
            if (scormAPI) {
                try {
                    scormAPI.LMSSetValue('cmi.core.lesson_status', 'completed');
                    scormAPI.LMSCommit('');
                    scormAPI.LMSFinish('');
                } catch (e) {}
            }
        }

        {{PLAYER_SCRIPT}}

        initSCORM();
        initPlayer(MANIFEST);
    </script>
</body>
</html>`;

    const IMSMANIFEST_TEMPLATE = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="{{IDENTIFIER}}" version="1.0"
    xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
    xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd
                        http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
    <metadata>
        <schema>ADL SCORM</schema>
        <schemaversion>1.2</schemaversion>
    </metadata>
    <organizations default="ORG-1">
        <organization identifier="ORG-1">
            <title>{{TITLE}}</title>
            <item identifier="ITEM-1" identifierref="RES-1">
                <title>{{TITLE}}</title>
            </item>
        </organization>
    </organizations>
    <resources>
        <resource identifier="RES-1" type="webcontent" adlcp:scormtype="sco" href="index.html">
            <file href="index.html"/>
        </resource>
    </resources>
</manifest>`;

    // -------------------------------------------------------------------------
    // Player script — runs inside the exported SCORM HTML
    // -------------------------------------------------------------------------
    const generatePlayerScript = () => {
        return `
function initPlayer(manifest) {
    var container = document.getElementById('contentcreator-app');
    var currentSlide = 0;
    var responses = {};
    var completed = false;

    // ---- helpers ----
    function esc(str) {
        if (str === null || str === undefined) return '';
        var d = document.createElement('div');
        d.textContent = String(str);
        return d.innerHTML;
    }

    function isComplete(slide) {
        var passThrough = ['title','content','image-narrative','reflection','summary','finish'];
        if (passThrough.indexOf(slide.type) >= 0) return true;
        return responses[slide.id] !== undefined;
    }

    // ---- slide renderers ----
    function renderSlide(slide) {
        var c = slide.content || {};
        switch (slide.type) {
            case 'title':      return renderTitle(c);
            case 'content':    return renderContent(c);
            case 'reflection': return renderReflection(c);
            case 'summary':    return renderSummary(c);
            case 'activity':   return renderActivity(slide);
            case 'finish':     return renderFinish(c);
            default:           return renderContent(c);
        }
    }

    function renderTitle(c) {
        return '<div class="cc-slide-header cc-hdr-title">' +
            '<div class="cc-badge">Learning Module</div>' +
            '<h1 class="cc-heading">' + esc(c.headline || 'Learning Module') + '</h1>' +
            (c.subheadline ? '<p class="cc-subheading">' + esc(c.subheadline) + '</p>' : '') +
            '</div>';
    }

    function renderContent(c) {
        var paras = (c.paragraphs || []).map(function(p) {
            return '<p class="cc-para">' + esc(p) + '</p>';
        }).join('');
        return '<div class="cc-slide-header cc-hdr-content">' +
            '<div class="cc-badge">Content</div>' +
            '<h2 class="cc-heading">' + esc(c.heading || '') + '</h2>' +
            '</div>' +
            '<div class="cc-slide-body">' + paras + '</div>';
    }

    function renderReflection(c) {
        return '<div class="cc-slide-header cc-hdr-reflection">' +
            '<div class="cc-badge">Reflect</div>' +
            '<h2 class="cc-heading">' + esc(c.heading || 'Reflection') + '</h2>' +
            '</div>' +
            '<div class="cc-slide-body">' +
            '<div class="cc-reflect-icon">\uD83D\uDCAD</div>' +
            '<p class="cc-reflect-prompt">' + esc(c.prompt || '') + '</p>' +
            '</div>';
    }

    function renderSummary(c) {
        var items = (c.keyTakeaways || []).map(function(t) {
            return '<div class="cc-takeaway">' +
                '<div class="cc-tick"></div>' +
                '<span class="cc-takeaway-text">' + esc(t) + '</span>' +
                '</div>';
        }).join('');
        return '<div class="cc-slide-header cc-hdr-summary">' +
            '<div class="cc-badge">Summary</div>' +
            '<h2 class="cc-heading">' + esc(c.heading || 'Key Takeaways') + '</h2>' +
            '</div>' +
            '<div class="cc-slide-body">' + items + '</div>';
    }

    function renderActivity(slide) {
        var c = slide.content || {};
        var opts = c.options || [];
        var resp = responses[slide.id];
        var answered = resp !== undefined;

        var optHtml = opts.map(function(opt, i) {
            var letter = String.fromCharCode(65 + i);
            var isSelected = resp && resp.selected === i;
            var cls = 'cc-opt';
            if (answered) {
                if (isSelected) {
                    cls += opt.isCorrect ? ' cc-opt-correct' : ' cc-opt-incorrect';
                } else if (opt.isCorrect) {
                    cls += ' cc-opt-show-correct';
                }
            } else if (isSelected) {
                cls += ' cc-opt-selected';
            }
            var disabledAttr = answered ? ' disabled' : '';
            return '<button class="' + cls + '" data-option="' + i + '" data-correct="' + (opt.isCorrect ? 'true' : 'false') + '"' + disabledAttr + '>' +
                '<span class="cc-opt-letter">' + letter + '</span>' +
                '<span class="cc-opt-text">' + esc(opt.text || '') + '</span>' +
                '</button>';
        }).join('');

        var feedbackHtml = '';
        if (answered) {
            var selOpt = opts[resp.selected] || {};
            var isCorr = !!resp.isCorrect;
            var fbText = selOpt.feedback ||
                (isCorr
                    ? (c.feedbackCorrect || 'Correct! Well done.')
                    : (c.feedbackIncorrect || 'Not quite \u2014 the correct answer is highlighted above.'));
            feedbackHtml = '<div class="cc-feedback ' + (isCorr ? 'cc-fb-ok' : 'cc-fb-no') + '">' + esc(fbText) + '</div>';
        }

        return '<div class="cc-slide-header cc-hdr-activity">' +
            '<div class="cc-badge">Knowledge Check</div>' +
            '<h2 class="cc-heading">' + esc(c.stem || c.question || 'Select the best answer:') + '</h2>' +
            '</div>' +
            '<div class="cc-slide-body">' +
            '<div class="cc-opt-grid">' + optHtml + '</div>' +
            '<div id="feedback-area">' + feedbackHtml + '</div>' +
            '</div>';
    }

    function renderFinish(c) {
        return '<div class="cc-slide-header cc-hdr-finish">' +
            '<div class="cc-badge">Complete</div>' +
            '<h2 class="cc-heading">' + esc(c.congratsMessage || 'Module Complete!') + '</h2>' +
            '</div>' +
            '<div class="cc-slide-body cc-finish-body">' +
            '<div class="cc-finish-icon">\u2705</div>' +
            '<p class="cc-finish-text">' + esc(c.encouragement || 'You have successfully completed this learning module.') + '</p>' +
            '</div>';
    }

    // ---- event binding ----
    function bindEvents(slide) {
        var prevBtn = document.getElementById('btn-prev');
        var nextBtn = document.getElementById('btn-next');

        prevBtn && prevBtn.addEventListener('click', function() {
            if (currentSlide > 0) { currentSlide--; render(); }
        });

        nextBtn && nextBtn.addEventListener('click', function() {
            if (!isComplete(slide)) return;
            if (currentSlide === manifest.slides.length - 1) {
                if (!completed) { completed = true; setComplete(); }
                render();
            } else {
                currentSlide++;
                render();
            }
        });

        if (slide.type === 'activity') {
            container.querySelectorAll('.cc-opt:not([disabled])').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    var optIdx = parseInt(btn.dataset.option, 10);
                    var isCorrect = btn.dataset.correct === 'true';
                    responses[slide.id] = { selected: optIdx, isCorrect: isCorrect };
                    render();
                });
            });
        }
    }

    // ---- main render ----
    function render() {
        var slide = manifest.slides[currentSlide];
        var pct = Math.round((currentSlide / manifest.slides.length) * 100);
        var canProceed = isComplete(slide);
        var isLast = currentSlide === manifest.slides.length - 1;

        container.innerHTML =
            '<div class="cc-wrap"><div class="cc-player">' +
            '<div class="cc-progress-bar">' +
            '<span class="cc-progress-label">' + (currentSlide + 1) + ' / ' + manifest.slides.length + '</span>' +
            '<div class="cc-progress-track"><div class="cc-progress-fill" style="width:' + pct + '%"></div></div>' +
            '</div>' +
            '<div class="cc-card">' + renderSlide(slide) + '</div>' +
            '<div class="cc-nav">' +
            '<button class="cc-btn cc-btn-secondary" id="btn-prev"' + (currentSlide === 0 ? ' disabled' : '') + '>\u2190 Previous</button>' +
            '<button class="cc-btn cc-btn-primary" id="btn-next"' + (!canProceed ? ' disabled' : '') + '>' +
            (isLast ? (completed ? 'Done \u2713' : 'Complete \u2713') : 'Next \u2192') +
            '</button>' +
            '</div>' +
            '</div></div>';

        bindEvents(slide);
    }

    render();
}
`;
    };

    // -------------------------------------------------------------------------
    // Styles — injected into the SCORM HTML <style> block
    // -------------------------------------------------------------------------
    const getStyles = () => {
        return `
:root {
    --cc-blue:      #0f6cbf;
    --cc-blue-dk:   #0a4d8f;
    --cc-purple:    #7c3aed;
    --cc-teal:      #0d9488;
    --cc-green:     #059669;
    --cc-amber:     #d97706;
    --cc-red:       #dc2626;
    --cc-bg:        #eef2f7;
    --cc-card:      #ffffff;
    --cc-muted:     #f1f5f9;
    --cc-border:    rgba(0,0,0,0.08);
    --cc-text:      #0f172a;
    --cc-text2:     #475569;
    --cc-text3:     #94a3b8;
    --cc-r:         10px;
    --cc-tx:        180ms ease;
}
*  { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif; background: var(--cc-bg); min-height: 100vh; }

/* ---- Outer layout ---- */
.cc-app   { min-height: 100vh; }
.cc-wrap  { min-height: 100vh; display: flex; align-items: flex-start; justify-content: center; padding: 28px 16px 48px; }
.cc-player { width: 100%; max-width: 860px; }

/* ---- Progress bar ---- */
.cc-progress-bar   { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.cc-progress-label { font-size: 12px; font-weight: 600; color: var(--cc-text3); white-space: nowrap; }
.cc-progress-track { flex: 1; height: 5px; background: rgba(0,0,0,0.1); border-radius: 3px; overflow: hidden; }
.cc-progress-fill  { height: 100%; background: var(--cc-blue); border-radius: 3px; transition: width 0.35s ease; }

/* ---- Card shell ---- */
.cc-card { background: var(--cc-card); border-radius: var(--cc-r); border: 1px solid var(--cc-border); overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.06); min-height: 340px; display: flex; flex-direction: column; }

/* ---- Shared slide header ---- */
.cc-slide-header { padding: 22px 28px; }
.cc-badge { display: inline-block; font-size: 10px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; padding: 3px 10px; border-radius: 20px; margin-bottom: 10px; background: rgba(255,255,255,0.22); color: #fff; }
.cc-heading    { font-size: 22px; font-weight: 700; line-height: 1.3; color: #fff; }
.cc-subheading { font-size: 16px; margin-top: 8px; color: rgba(255,255,255,0.88); line-height: 1.45; }

/* ---- Slide body ---- */
.cc-slide-body { padding: 22px 28px; flex: 1; }

/* ---- Title / cover ---- */
.cc-hdr-title { background: linear-gradient(135deg, #0f6cbf 0%, #1e40af 100%); min-height: 210px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 36px 32px; }
.cc-hdr-title .cc-heading { font-size: 30px; }
.cc-hdr-title .cc-badge   { background: rgba(255,255,255,0.25); }

/* ---- Content ---- */
.cc-hdr-content { background: linear-gradient(135deg, #0369a1 0%, #0284c7 100%); }
.cc-para { font-size: 15px; line-height: 1.72; color: var(--cc-text2); margin-bottom: 14px; }
.cc-para:last-child { margin-bottom: 0; }

/* ---- Reflection ---- */
.cc-hdr-reflection { background: linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%); }
.cc-reflect-icon   { font-size: 42px; margin-bottom: 18px; }
.cc-reflect-prompt { font-size: 16px; line-height: 1.65; color: var(--cc-text2); font-style: italic; }

/* ---- Summary ---- */
.cc-hdr-summary { background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%); }
.cc-takeaway      { display: flex; align-items: flex-start; gap: 12px; padding: 11px 0; border-bottom: 1px solid var(--cc-border); }
.cc-takeaway:last-child { border-bottom: none; }
.cc-tick          { width: 22px; height: 22px; border-radius: 50%; background: var(--cc-teal); flex-shrink: 0; margin-top: 1px; display: flex; align-items: center; justify-content: center; }
.cc-tick::after   { content: "\\2713"; font-size: 11px; color: #fff; font-weight: 800; }
.cc-takeaway-text { font-size: 15px; line-height: 1.5; color: var(--cc-text); }

/* ---- Activity / knowledge check ---- */
.cc-hdr-activity { background: linear-gradient(135deg, #d97706 0%, #b45309 100%); }
.cc-hdr-activity .cc-heading { font-size: 18px; line-height: 1.45; }

/* Option grid */
.cc-opt-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.cc-opt {
    display: flex; align-items: flex-start; gap: 10px;
    padding: 14px 16px; border: 2px solid var(--cc-border);
    border-radius: var(--cc-r); background: #fff; cursor: pointer;
    text-align: left; transition: border-color var(--cc-tx), background var(--cc-tx);
    width: 100%;
}
.cc-opt:not([disabled]):hover { border-color: #93c5fd; background: #eff6ff; }
.cc-opt-letter {
    width: 28px; height: 28px; border-radius: 50%;
    background: var(--cc-muted); border: 2px solid rgba(0,0,0,0.1);
    display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 700; color: var(--cc-text); flex-shrink: 0;
    transition: background var(--cc-tx), border-color var(--cc-tx), color var(--cc-tx);
}
.cc-opt-text { font-size: 14px; line-height: 1.5; color: var(--cc-text); }

/* Selected (before answer revealed) */
.cc-opt-selected            { border-color: var(--cc-blue); background: #eff6ff; }
.cc-opt-selected .cc-opt-letter { background: #dbeafe; border-color: var(--cc-blue); }

/* Correct answer selected */
.cc-opt-correct             { border-color: #16a34a !important; background: #f0fdf4 !important; }
.cc-opt-correct .cc-opt-letter { background: #16a34a !important; border-color: #16a34a !important; color: #fff !important; }
.cc-opt-correct .cc-opt-letter::after { content: "\\2713"; }
.cc-opt-correct .cc-opt-letter { font-size: 0; }
.cc-opt-correct .cc-opt-letter::after { font-size: 13px; }

/* Wrong selection */
.cc-opt-incorrect             { border-color: #dc2626 !important; background: #fef2f2 !important; }
.cc-opt-incorrect .cc-opt-letter { background: #dc2626 !important; border-color: #dc2626 !important; color: #fff !important; }
.cc-opt-incorrect .cc-opt-letter::after { content: "\\00D7"; }
.cc-opt-incorrect .cc-opt-letter { font-size: 0; }
.cc-opt-incorrect .cc-opt-letter::after { font-size: 15px; }

/* Reveal correct after wrong selection */
.cc-opt-show-correct             { border-color: #16a34a !important; background: #f0fdf4 !important; opacity: 0.82; }
.cc-opt-show-correct .cc-opt-letter { background: #16a34a !important; border-color: #16a34a !important; color: #fff !important; }
.cc-opt-show-correct .cc-opt-letter::after { content: "\\2713"; }
.cc-opt-show-correct .cc-opt-letter { font-size: 0; }
.cc-opt-show-correct .cc-opt-letter::after { font-size: 13px; }

.cc-opt[disabled] { cursor: not-allowed; }

/* Feedback */
.cc-feedback { margin-top: 16px; padding: 12px 16px; border-radius: var(--cc-r); font-size: 14px; line-height: 1.55; font-weight: 500; }
.cc-fb-ok { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; }
.cc-fb-no { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }

/* ---- Finish ---- */
.cc-hdr-finish  { background: linear-gradient(135deg, #059669 0%, #047857 100%); }
.cc-finish-body { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 36px 28px; }
.cc-finish-icon { font-size: 52px; margin-bottom: 20px; }
.cc-finish-text { font-size: 16px; line-height: 1.65; color: var(--cc-text2); max-width: 520px; }

/* ---- Navigation ---- */
.cc-nav { display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; border-top: 1px solid var(--cc-border); background: #fafbfc; }
.cc-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 10px 22px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; border: none; transition: opacity var(--cc-tx), transform var(--cc-tx); }
.cc-btn:active:not([disabled]) { transform: scale(0.97); }
.cc-btn-primary           { background: var(--cc-blue); color: #fff; }
.cc-btn-primary:hover:not([disabled]) { opacity: 0.88; }
.cc-btn-secondary         { background: var(--cc-muted); color: var(--cc-text); border: 1px solid rgba(0,0,0,0.1); }
.cc-btn-secondary:hover:not([disabled]) { background: #e2e8f0; }
.cc-btn[disabled]         { opacity: 0.38; cursor: not-allowed; }

/* ---- Responsive ---- */
@media (max-width: 600px) {
    .cc-wrap { padding: 12px 8px 32px; }
    .cc-opt-grid { grid-template-columns: 1fr; }
    .cc-hdr-title .cc-heading { font-size: 22px; }
    .cc-heading { font-size: 18px; }
    .cc-slide-header, .cc-slide-body { padding: 16px 18px; }
    .cc-nav { padding: 12px 16px; }
}
`;
    };

    // -------------------------------------------------------------------------
    // flattenManifest — converts nested topics/sections/cards into flat slides[]
    // v3.1: detects quiz/activity cards and creates proper activity slides
    // -------------------------------------------------------------------------
    const flattenManifest = (manifest) => {
        const slides = [];

        const buildParas = (obj) => {
            const paras = [];
            if (obj.bodyText)    paras.push(obj.bodyText);
            if (obj.pcStatement) paras.push(obj.pcStatement);
            if (obj.elementText) paras.push(obj.elementText);
            if (obj.skillStatement) paras.push(obj.skillStatement);
            if (obj.relevance)   paras.push(obj.relevance);
            if (obj.context)     paras.push(obj.context);

            if (obj.keyPoints && obj.keyPoints.length) {
                paras.push(obj.keyPoints.join(' \u2022 '));
            }
            if (obj.summaryLine) paras.push(obj.summaryLine);
            if (obj.consequence) paras.push(obj.consequence);

            if (obj.sceneParts && obj.sceneParts.length) {
                obj.sceneParts.forEach(function(part) {
                    if (!part) return;
                    var t = part.text || part.content || part.description || '';
                    if (t) paras.push(t);
                });
            }
            if (obj.conceptInsights && obj.conceptInsights.length) {
                obj.conceptInsights.forEach(function(insight) {
                    if (!insight) return;
                    var t = insight.text || insight.content || insight.description || '';
                    if (t) paras.push(t);
                });
            }
            if (obj.steps && obj.steps.length && (obj.cardType === 'mental-model' || obj.cardType === 'action-framework')) {
                obj.steps.forEach(function(s) {
                    if (!s) return;
                    var heading = s.step || s.action || s.title || '';
                    var detail  = s.detail || s.description || s.explanation || '';
                    if (heading && detail) paras.push(heading + ': ' + detail);
                    else if (heading) paras.push(heading);
                    else if (detail)  paras.push(detail);
                });
            }
            if (obj.items && obj.items.length) {
                obj.items.forEach(function(item) {
                    if (!item) return;
                    if (typeof item === 'string') { paras.push(item); return; }
                    var m = item.mistake || item.error || item.pitfall || '';
                    var c = item.consequence || '';
                    if (m && c) paras.push(m + ' \u2014 ' + c);
                    else if (m) paras.push(m);
                });
            }
            if (obj.goodItems && obj.goodItems.length) {
                var goodTexts = obj.goodItems.map(function(item) {
                    return typeof item === 'string' ? item : (item.text || item.behaviour || item.criterion || '');
                }).filter(Boolean);
                if (goodTexts.length) paras.push(goodTexts.join(' \u2022 '));
            }
            if (obj.badItems && obj.badItems.length) {
                var badTexts = obj.badItems.map(function(item) {
                    return typeof item === 'string' ? item : (item.text || '');
                }).filter(Boolean);
                if (badTexts.length) paras.push(badTexts.join(' \u2022 '));
            }
            if (obj.question) paras.push(obj.question);

            return paras.filter(Boolean);
        };

        // Detect if an obj is a quiz/activity card that should become an activity slide
        const isActivityCard = (obj) => {
            if (!obj.options || !Array.isArray(obj.options) || obj.options.length < 2) return false;
            return obj.options.some(function(o) {
                return o && (o.isCorrect === true || o.isBest === true);
            });
        };

        const buildActivitySlide = (id, obj) => {
            return {
                id: id,
                type: 'activity',
                meta: { activityType: obj.cardType || 'knowledge-check' },
                content: {
                    stem: obj.heading || obj.question || obj.stem || 'Select the best answer:',
                    options: (obj.options || []).map(function(o) {
                        return {
                            text: o.text || o.label || '',
                            isCorrect: !!(o.isCorrect || o.isBest),
                            feedback: o.feedback || o.explanation || ''
                        };
                    }),
                    feedbackCorrect: obj.feedbackCorrect || obj.correctFeedback || '',
                    feedbackIncorrect: obj.feedbackIncorrect || obj.incorrectFeedback || ''
                }
            };
        };

        // Cover slide
        slides.push({
            id: 'slide-cover',
            type: 'title',
            content: {
                headline: manifest.title || 'Learning Module',
                subheadline: manifest.subtitle || ''
            }
        });

        const topics = manifest.topics || [];
        topics.forEach((topic, ti) => {
            if (topics.length > 1) {
                slides.push({
                    id: 'slide-topic-' + ti,
                    type: 'title',
                    content: { headline: topic.title || ('Part ' + (ti + 1)), subheadline: '' }
                });
            }

            const sections = topic.sections || [];
            sections.forEach((section, si) => {
                if (section.cards && section.cards.length > 0) {
                    section.cards.forEach((card, ci) => {
                        var slideId = 'slide-' + ti + '-' + si + '-' + ci;
                        if (isActivityCard(card)) {
                            slides.push(buildActivitySlide(slideId, card));
                        } else {
                            slides.push({
                                id: slideId,
                                type: 'content',
                                content: {
                                    heading: card.heading || section.title || '',
                                    paragraphs: buildParas(card)
                                }
                            });
                        }
                    });
                } else {
                    var slideId = 'slide-' + ti + '-' + si;
                    if (isActivityCard(section)) {
                        slides.push(buildActivitySlide(slideId, section));
                    } else {
                        slides.push({
                            id: slideId,
                            type: 'content',
                            content: {
                                heading: section.heading || section.title || '',
                                paragraphs: buildParas(section)
                            }
                        });
                    }
                }
            });
        });

        // Completion slide
        slides.push({
            id: 'slide-finish',
            type: 'finish',
            content: {
                congratsMessage: 'Module Complete!',
                encouragement: 'You have successfully completed this learning module.'
            }
        });

        return { title: manifest.title || 'Learning Module', slides: slides };
    };

    // -------------------------------------------------------------------------
    // exportSCORM — main entry point
    // -------------------------------------------------------------------------
    const exportSCORM = (manifest, title) => {
        const identifier = 'CC_' + Date.now();
        const flatManifest = flattenManifest(manifest);

        const html = SCORM_TEMPLATE
            .replace('{{TITLE}}', title || 'Learning Module')
            .replace('{{STYLES}}', getStyles())
            .replace('{{MANIFEST}}', JSON.stringify(flatManifest))
            .replace('{{PLAYER_SCRIPT}}', generatePlayerScript());

        const imsmanifest = IMSMANIFEST_TEMPLATE
            .replace(/{{IDENTIFIER}}/g, identifier)
            .replace(/{{TITLE}}/g, title || 'Learning Module');

        return {
            files: [
                { name: 'index.html', content: html },
                { name: 'imsmanifest.xml', content: imsmanifest }
            ],
            identifier: identifier
        };
    };

    return {
        exportSCORM: exportSCORM,
        getStyles: getStyles,
        generatePlayerScript: generatePlayerScript
    };
});
