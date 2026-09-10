/*
 * Real end-to-end for FIX-SUBTOPIC-PARAGRAPHS-DISCARDED (v15.4.30).
 *
 * Reproduces, on a real Moodle, exactly what was reported: open a slide editor on a
 * Topics-and-Text `subtopic` card, change the paragraph text, press Save Changes, reload
 * the page, and read what the learner actually sees.
 *
 * Before the fix this suite fails on "the edited paragraph survives a reload" — Save
 * returned success and the stored paragraph was still the old one, which is why no amount
 * of refreshing helped and why the bug looked like a caching problem.
 *
 * Requires tests/moodle/seed-subtopic.php to have been run against both sites; set
 * CC_CMID to the cmid it printed (default 6).
 */
'use strict';
const pw = require('playwright');

const CMID = process.env.CC_CMID || '6';
// localhost, not 127.0.0.1: this suite turns editing mode on, and editmode.php redirects
// to $CFG->wwwroot. Starting on a host that is not wwwroot lands the browser on a
// different origin mid-run and silently drops the session.
const TARGETS = [
    {name: 'Moodle 4.5.13+', base: 'http://localhost:8045'},
    {name: 'Moodle 5.2.2+', base: 'http://localhost:8052'},
];

// Deliberately not a prefix of the seeded text: a check that passes on "starts with"
// would also pass on an untouched card.
const NEW_P1 = 'EDITED-PARAGRAPH-ONE The Pathway offers a comprehensive learning experience '
    + 'for those involved in the programme, and this sentence exists only so that the test '
    + 'can tell an edited card apart from a seeded one at a glance.';

let failures = 0, checks = 0;
function check(label, ok, detail) {
    checks++;
    if (ok) { console.log('    ok   ' + label); return; }
    failures++;
    console.log('    FAIL ' + label + (detail ? '\n           ' + detail : ''));
}

function proseText(page) {
    return page.evaluate(() => {
        const out = [];
        document.querySelectorAll('.cc5-prose-card').forEach(card => {
            const head = card.querySelector('.cc5-card-header, h3');
            // Paragraphs render as .cc5-prose-para divs, not <p> elements. Reading <p>
            // here returned an empty body on a page that was rendering perfectly well —
            // a test that reports "no content" when the content is on screen.
            const paras = card.querySelectorAll('.cc5-prose-para, p');
            out.push({
                heading: head ? head.textContent.trim() : '',
                body: Array.from(paras).map(p => p.textContent.trim()),
            });
        });
        return out;
    });
}

(async () => {
    const browser = await pw.chromium.launch({
        executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    });

    for (const t of TARGETS) {
        console.log('\n=== ' + t.name + ' ===');
        const ctx = await browser.newContext();
        const page = await ctx.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(String(e)));

        await page.goto(t.base + '/login/index.php', {waitUntil: 'domcontentloaded'});
        await page.fill('#username', 'admin');
        await page.fill('#password', 'Admin#12345');
        await Promise.all([page.waitForLoadState('domcontentloaded'), page.click('#loginbtn')]);
        check('admin login succeeds', !/login/.test(page.url()), page.url());

        const view = t.base + '/mod/contentcreator/view.php?id=' + CMID;
        await page.goto(view, {waitUntil: 'networkidle'});

        // The slide editor is gated on editing mode, not just on capability. Moodle's
        // edit-mode switch is a POST form, so flip the real switch the way a teacher
        // does rather than guessing a GET URL for it.
        const swtch = await page.$('.editmode-switch-form input[name="setmode"]');
        check('Moodle renders its edit-mode switch on the activity page', !!swtch);
        if (swtch) {
            await Promise.all([
                page.waitForNavigation({waitUntil: 'networkidle'}).catch(() => {}),
                swtch.click(),
            ]);
        }
        // Match on the PATH. The editmode URL carries the destination in its query
        // string, so testing the whole URL for "contentcreator" matches the query and
        // skips the navigation, leaving the run on editmode.php with nothing rendered.
        if (!/\/mod\/contentcreator\//.test(new URL(page.url()).pathname)) {
            await page.goto(view, {waitUntil: 'networkidle'});
        }
        await page.waitForTimeout(1000);

        const tut = await page.$('.cc5-tutorial-btn');
        if (tut) { await tut.click(); await page.waitForTimeout(500); }

        const before = await proseText(page);
        check('the seeded subtopic cards render', before.length >= 2,
            JSON.stringify(before).slice(0, 200));
        const seededP1 = (before[0] && before[0].body[0]) || '';
        check('card 1 shows its SEEDED first paragraph', /SEEDED-PARAGRAPH-ONE/.test(seededP1),
            seededP1.slice(0, 80));
        const seededTitle = (before[0] && before[0].heading) || '';
        check('card 1 shows its authored heading', /CampusPlus Training Pathway/.test(seededTitle),
            seededTitle);

        // Open the slide editor the way a teacher does.
        const editBtn = await page.$('.cc5-edit-slide-btn');
        check('the Edit Slide button is available in editing mode', !!editBtn);
        if (!editBtn) { await ctx.close(); continue; }
        await editBtn.click();
        await page.waitForSelector('.cc5-edit-modal', {timeout: 8000});
        check('the Edit Slide modal opens', !!(await page.$('.cc5-edit-modal')));

        // Each card is a collapsed <details>. A teacher expands the one they want; the
        // test expands them all so the boxes are visible and fillable.
        await page.evaluate(() => {
            document.querySelectorAll('.cc5-edit-modal details').forEach(d => { d.open = true; });
        });
        await page.waitForTimeout(300);

        const paraBoxes = await page.$$('.cc5-edit-card-block .cc5-edit-prose-para');
        check('the modal offers paragraph boxes for a subtopic card', paraBoxes.length >= 2,
            'found ' + paraBoxes.length);
        if (!paraBoxes.length) { await ctx.close(); continue; }

        const loaded = await paraBoxes[0].inputValue();
        check('the first box is loaded with the stored paragraph',
            /SEEDED-PARAGRAPH-ONE/.test(loaded), loaded.slice(0, 80));

        // Type the change, exactly as reported.
        await paraBoxes[0].fill(NEW_P1);
        check('the box now holds the new text', (await paraBoxes[0].inputValue()) === NEW_P1);

        // Key terms sit in the SAME prose branch as the paragraphs, so they were being
        // discarded on a subtopic card by the same defect. They feed the Flip & Learn
        // cards, so a silent loss here is content the author cannot get back.
        const termBox = await page.$('.cc5-edit-card-block .cc5-edit-prose-term-name');
        check('the modal offers key-term boxes for a subtopic card', !!termBox);
        if (termBox) { await termBox.fill('EDITED-TERM'); }

        const saveBtn = await page.$('.cc5-edit-modal-save');
        check('the Save Changes button is present', !!saveBtn);
        await saveBtn.click();

        // Wait for the modal to go away — that is the plugin's own signal that the
        // webservice returned success.
        await page.waitForSelector('.cc5-edit-modal', {state: 'detached', timeout: 20000})
            .catch(() => {});
        check('the editor closes after saving', !(await page.$('.cc5-edit-modal')));

        // THE CHECK THIS SUITE EXISTS FOR. A fresh page load, no cache, read what the
        // learner sees.
        await page.goto(view + '&cachebust=' + Date.now(), {waitUntil: 'networkidle'});
        const tut2 = await page.$('.cc5-tutorial-btn');
        if (tut2) { await tut2.click(); await page.waitForTimeout(400); }
        const after = await proseText(page);
        const shownP1 = (after[0] && after[0].body[0]) || '';

        check('THE EDITED PARAGRAPH SURVIVES A RELOAD',
            /EDITED-PARAGRAPH-ONE/.test(shownP1), 'shown: ' + shownP1.slice(0, 120));
        check('...and the old text is gone', !/SEEDED-PARAGRAPH-ONE/.test(shownP1),
            shownP1.slice(0, 120));

        // The regression my fix could have caused: subtopic writes its own heading, and
        // the fixed-slot branch blanks title. If that blanking ever applies to subtopic,
        // the card loses its name and renders "No content yet".
        const shownTitle = (after[0] && after[0].heading) || '';
        check('the card KEEPS its authored heading after the save',
            /CampusPlus Training Pathway/.test(shownTitle), shownTitle);
        check('...and is not rendered as an unnamed card',
            !/no content yet/i.test(shownTitle), shownTitle);

        // Card 2 was never opened. A full cards[] replacement must not touch it.
        const p2a = (after[1] && after[1].body[0]) || '';
        const p2b = (after[1] && after[1].body[1]) || '';
        check('the untouched second card keeps its first paragraph',
            /SEEDED-SECOND-CARD-ONE/.test(p2a), p2a.slice(0, 80));
        check('the untouched second card keeps its second paragraph',
            /SEEDED-SECOND-CARD-TWO/.test(p2b), p2b.slice(0, 80));

        // The edited card's OTHER paragraph must survive too — collecting only the
        // changed box would silently delete it.
        const shownP2 = (after[0] && after[0].body[1]) || '';
        check('the paragraph that was NOT edited is still there',
            /SEEDED-PARAGRAPH-TWO/.test(shownP2), shownP2.slice(0, 80));

        // Reopen the editor on the reloaded page. The boxes are filled from the manifest
        // the server just sent, so what they hold is what was actually stored.
        const editBtn2 = await page.$('.cc5-edit-slide-btn');
        if (editBtn2) {
            await editBtn2.click();
            await page.waitForSelector('.cc5-edit-modal', {timeout: 8000}).catch(() => {});
            await page.evaluate(() => {
                document.querySelectorAll('.cc5-edit-modal details').forEach(d => { d.open = true; });
            });
            const reBoxes = await page.$$('.cc5-edit-card-block .cc5-edit-prose-para');
            const reVal = reBoxes.length ? await reBoxes[0].inputValue() : '';
            check('reopening the editor shows the EDITED paragraph, not the old one',
                /EDITED-PARAGRAPH-ONE/.test(reVal), reVal.slice(0, 80));
            const reTerm = await page.$('.cc5-edit-card-block .cc5-edit-prose-term-name');
            const reTermVal = reTerm ? await reTerm.inputValue() : '';
            check('the edited key term persisted too', reTermVal === 'EDITED-TERM', reTermVal);
        }

        check('no uncaught JS errors through the whole edit-save-reload cycle',
            errors.length === 0, errors.slice(0, 2).join(' | '));

        await ctx.close();
    }

    await browser.close();
    console.log('\n' + (failures ? 'FAILED ' + failures + ' of ' + checks
        : 'PASSED all ' + checks) + ' slide-edit persistence checks on real Moodle');
    process.exit(failures ? 1 : 0);
})();
