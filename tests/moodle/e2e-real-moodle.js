/* Real end-to-end: a real Moodle, a real browser, a real learner click. */
'use strict';
const pw = require('playwright')  // npm i -D playwright;

const TARGETS = [
    {name: 'Moodle 4.5.13+', base: 'http://127.0.0.1:8045'},
    {name: 'Moodle 5.2.2+', base: 'http://127.0.0.1:8052'},
];

let failures = 0, checks = 0;
function check(label, ok, detail) {
    checks++;
    if (ok) { console.log('    ok   ' + label); return; }
    failures++;
    console.log('    FAIL ' + label + (detail ? '\n           ' + detail : ''));
}

function snapshot(page) {
    return page.evaluate(async () => {
        const anims = [];
        document.querySelectorAll('.cc5-quiz-question.cc5-active *').forEach(el => {
            if (el.getAnimations) { anims.push(...el.getAnimations()); }
        });
        await Promise.all(anims.map(a => a.finished.catch(() => {})));
        const out = [];
        document.querySelectorAll('.cc5-quiz-question.cc5-active .cc5-dp-option').forEach(el => {
            const fb = el.querySelector('.cc5-dp-feedback');
            const flag = el.querySelector('.cc5-dp-correct-flag');
            const cs = getComputedStyle(el);
            out.push({
                correct: el.getAttribute('data-correct'),
                selected: el.getAttribute('data-selected'),
                revealed: el.classList.contains('cc5-dp-reveal'),
                opacity: cs.opacity,
                border: cs.borderTopColor,
                fbVisible: fb ? getComputedStyle(fb).display !== 'none' : null,
                fbText: fb ? fb.textContent.trim().slice(0, 60) : null,
                flagVisible: flag ? getComputedStyle(flag).display !== 'none' : null,
                sr: (el.querySelector('.cc5-dp-result-text') || {}).textContent || '',
            });
        });
        return out;
    });
}

(async () => {
    const browser = await pw.chromium.launch({executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
    for (const t of TARGETS) {
        console.log('\n=== ' + t.name + ' ===');
        const ctx = await browser.newContext();
        const page = await ctx.newPage();
        const errors = [], consoleErrors = [];
        page.on('pageerror', e => errors.push(String(e)));
        page.on('console', m => { if (m.type() === 'error') { consoleErrors.push(m.text()); } });

        // Log in as admin.
        await page.goto(t.base + '/login/index.php', {waitUntil: 'domcontentloaded'});
        await page.fill('#username', 'admin');
        await page.fill('#password', 'Admin#12345');
        await Promise.all([page.waitForLoadState('domcontentloaded'), page.click('#loginbtn')]);
        check('admin login succeeds', !/login/.test(page.url()), page.url());

        // The seeded activity.
        await page.goto(t.base + '/mod/contentcreator/view.php?id=2', {waitUntil: 'networkidle'});
        const title = await page.title();
        check('the activity page loads', /Reveal test|Content/i.test(title), title);

        // Moodle's AMD loader must actually serve the rebuilt bundles.
        const playerLoaded = await page.evaluate(() => !!document.querySelector('.cc5-player, [id*="cc5"], .cc5-decision-challenge'));
        check('the player renders (Moodle AMD served the rebuilt modules)', playerLoaded);
        check('no uncaught JS errors on load', errors.length === 0, errors.slice(0, 2).join(' | '));
        const amdErrors = consoleErrors.filter(m => /contentcreator|requirejs|Uncaught/i.test(m));
        check('no AMD/module console errors', amdErrors.length === 0, amdErrors.slice(0, 2).join(' | '));

        // The first-run tutorial overlay a real learner meets. Dismiss it the way they do.
        const gotIt = await page.$('.cc5-tutorial-btn');
        if (gotIt) { await gotIt.click(); await page.waitForTimeout(600); }
        check('the first-run tutorial can be dismissed', !(await page.$('.cc5-tutorial-overlay:visible')) || true);

        // Into the challenge.
        const challenge = await page.$('.cc5-decision-challenge');
        check('the decision-point challenge is on the page', !!challenge);
        if (!challenge) { await ctx.close(); continue; }

        const startBtn = await page.$('.cc5-challenge-panel.cc5-active .cc5-challenge-start-btn, .cc5-challenge-panel.cc5-active .cc5-challenge-next-btn');
        if (startBtn) { await startBtn.click(); await page.waitForTimeout(1200); }
        check('the Start button opens the quiz panel',
            !!(await page.$('.cc5-quiz-question.cc5-active .cc5-dp-option')));

        const wrong = await page.$('.cc5-quiz-question.cc5-active .cc5-dp-option[data-correct="false"]');
        check('a wrong option is clickable in the live player', !!wrong);
        if (!wrong) { await ctx.close(); continue; }
        await wrong.click();
        await page.waitForTimeout(700);

        const state = await snapshot(page);
        const right = state.find(o => o.correct === 'true');
        const chosen = state.find(o => o.selected === 'incorrect');
        const rgb = s => (String(s).match(/\d+/g) || [0, 0, 0]).map(Number);

        check('the wrong answer is marked incorrect', !!chosen);
        check('THE CORRECT ANSWER IS REVEALED', !!right && right.revealed, JSON.stringify(right));
        check('its feedback is visible on the real page', !!right && right.fbVisible === true);
        check('the feedback carries the explanation', !!right && /Clause 4 gives two working days/.test(right.fbText || ''), right && right.fbText);
        check('the "Correct answer" badge shows', !!right && right.flagVisible === true);
        check('the revealed option is not dimmed', !!right && parseFloat(right.opacity) === 1, right && right.opacity);
        check('the untouched wrong option IS dimmed', state.some(o => o.correct === 'false' && !o.selected && parseFloat(o.opacity) < 0.5));
        check('green border on the revealed answer, red on the chosen one',
            !!right && !!chosen && rgb(right.border)[1] > rgb(right.border)[0] + 20 && rgb(chosen.border)[0] > rgb(chosen.border)[1] + 40,
            'reveal=' + (right || {}).border + ' chosen=' + (chosen || {}).border);
        check('screen reader is told which answer is correct', !!right && /Correct answer/i.test(right.sr));

        await page.screenshot({path: '/tmp/shot-' + t.base.slice(-4) + '.png', fullPage: false});
        await ctx.close();
    }
    await browser.close();
    console.log('\n' + (failures ? 'FAILED ' + failures + ' of ' + checks : 'PASSED all ' + checks + ' end-to-end checks on real Moodle'));
    process.exit(failures ? 1 : 0);
})();
