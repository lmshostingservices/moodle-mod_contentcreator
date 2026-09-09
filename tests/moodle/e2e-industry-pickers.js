/* The industry pickers, in a real Moodle builder, on both versions.
 *
 * Run:  CC_CMID=<cmid> node tests/moodle/e2e-industry-pickers.js
 *
 * CC_CMID must be an activity with NO generated content - a locked pack shows the
 * management screen, not the wizard, and the pickers are never rendered. tests/moodle/
 * SETUP.md has the seed script; default 4 is what that script creates second.
 *
 * The WORKPLACE route is driven on purpose: the VET route keeps the industry picker inside
 * #cc-element-dependent-sections, which stays hidden until unit elements are selected, so
 * VET cannot reach it without a real unit of competency.
 *
 * Counts are asserted as MINIMUMS plus named members. An exact-count assertion would fail
 * the next time someone adds an industry, which trains people to edit the test rather than
 * read it.
 */
const pw = require('playwright');
const CMID = process.env.CC_CMID || '4';
const TARGETS = [{name:'Moodle 4.5.13+',base:'http://127.0.0.1:8045'},{name:'Moodle 5.2.2+',base:'http://127.0.0.1:8052'}];
let failures=0, checks=0;
function check(l,ok,d){checks++; if(ok){console.log('    ok   '+l);return;} failures++; console.log('    FAIL '+l+(d?'\n           '+d:''));}
(async()=>{
const b=await pw.chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
for (const t of TARGETS){
  console.log('\n=== '+t.name+' ===');
  const ctx=await b.newContext(); const p=await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(t.base+'/login/index.php',{waitUntil:'domcontentloaded'});
  await p.fill('#username','admin'); await p.fill('#password','Admin#12345');
  await Promise.all([p.waitForLoadState('domcontentloaded'),p.click('#loginbtn')]);
  // id=3 is the second seeded activity in edit mode; id=2 is locked. Use ?edit=1 on id=2 to
  // reach the builder as a teacher would.
  // A fresh activity opens on the wizard: pick a mode, Continue, then step 2 carries the
  // industry pickers. This is the path an author walks.
  await p.goto(t.base+'/mod/contentcreator/view.php?id='+CMID+'',{waitUntil:'networkidle'});
  await p.waitForSelector('[data-mode="workplace"]', {timeout: 60000, state: 'attached'});
  await p.waitForTimeout(1500);
  await p.click('[data-mode="workplace"]');
  await p.waitForTimeout(400);
  await p.click('button.cc-btn-primary:has-text("Continue")');
  await p.waitForTimeout(1500);
  const sel = await p.$('#cc-industry, #cc-wp-industry');
  check('the builder renders an industry picker', !!sel);
  if(!sel){ await ctx.close(); continue; }
  const id = await sel.evaluate(e=>e.id);
  const opts = await p.$$eval('#'+id+' option', os=>os.map(o=>o.value).filter(Boolean));
  check('the dropdown offers at least 45 industries', opts.length>=45, opts.length+' offered');
  check('Employment Services is one of them', opts.includes('Employment Services'));
  check('Other is last', opts[opts.length-1]==='Other', opts[opts.length-1]);
  ['Rail','Maritime','Renewable Energy','Cleaning Services','Emergency Services'].forEach(n=>
    check('new industry present: '+n, opts.includes(n)));
  // Pick Community Services and read the sub-industry list the page builds.
  const subId = id==='cc-industry' ? 'cc-industry-sector' : 'cc-wp-industry-sector';
  await p.selectOption('#'+id, 'Community Services');
  await p.waitForTimeout(700);
  const subs = await p.$$eval('#'+subId+' option', os=>os.map(o=>o.value).filter(Boolean));
  check('Community Services lists at least 18 sub-industries', subs.length>=18, subs.length+': '+subs.join(', '));
  check('EMPLOYMENT SERVICES is selectable under Community Services', subs.includes('Employment Services'),
    subs.join(', '));
  await p.selectOption('#'+subId, 'Employment Services');
  check('...and it can actually be selected',
    (await p.$eval('#'+subId, e=>e.value))==='Employment Services');
  // And the standalone industry drives its own lists.
  await p.selectOption('#'+id, 'Employment Services');
  await p.waitForTimeout(700);
  const esubs = await p.$$eval('#'+subId+' option', os=>os.map(o=>o.value).filter(Boolean));
  check('Employment Services as an industry lists its own sub-industries',
    esubs.length>=12 && esubs.includes('Temporary & Contract Staffing')
    && esubs.includes('Job Placement & Case Management'), esubs.join(', '));
  check('no JS errors while switching industries', errs.length===0, errs.slice(0,2).join(' | '));
  await p.screenshot({path:'/tmp/ind-'+t.base.slice(-4)+'.png'});
  await ctx.close();
}
await b.close();
console.log('\n'+(failures?'FAILED '+failures+' of '+checks:'PASSED all '+checks+' industry-picker checks on real Moodle'));
process.exit(failures?1:0);})();
