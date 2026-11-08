// Synthetic local store only: focused settings saves, persistence and failure recovery.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const stubWebFonts=require('./webfonts.cjs');

const base=process.env.WASOOLI_TEST_URL||'http://127.0.0.1:8099';assert.equal(new URL(base).hostname,'127.0.0.1');
const out=process.env.WASOOLI_TEST_OUTPUT||'data/settings-qa';fs.mkdirSync(out,{recursive:true});
const errors=[],checks=[];let browser,expectedFailure=false;
(async()=>{
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE});
 const ctx=await browser.newContext({viewport:{width:1400,height:1000},colorScheme:'light'});await stubWebFonts(ctx);const page=await ctx.newPage();
 await ctx.addInitScript(()=>localStorage.setItem('pt-today','2026-10-20'));
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!(expectedFailure&&m.text().includes('503')))errors.push(m.text());});
 await page.goto(base+'/login');await page.locator('[name=passcode]').fill('test1234');await page.locator('button[type=submit]').click();await page.locator('#tbody tr.row').first().waitFor();
 const doc=async p=>(await(await ctx.request.get(base+'/api/docs/'+p)).json()).data;
 const before=await doc('settings/main'),usersBefore=await(await ctx.request.get(base+'/api/docs?prefix=users/')).json();
 const save=k=>page.locator('[data-save-setting="'+k+'"]');const status=k=>page.locator('#setting-status-'+k);
 const check=n=>{checks.push(n);console.log('PASS '+n);};
 await page.locator('#btn-settings').click();assert.equal(await page.locator('[data-save-setting]').count(),19);check('All 19 general settings have adjacent focused saves and local statuses');
 await page.locator('#s-app-name').fill('Pending branding');await page.locator('#s-remind-lead').fill('99');
 const first=page.locator('#pkgList input[data-f=name]').first();const pid=await first.evaluate(el=>el.closest('.pkg-row').dataset.id);
 await first.fill('Renamed QA product');await save('packages').click();await assertStatus('packages',/Saved/);
 let got=await doc('settings/main');assert.equal(got.packages.find(p=>p.id===pid).name,'Renamed QA product');assert.equal(got.appName,before.appName);assert.equal(got.remindLead,before.remindLead);assert.equal(await page.locator('#s-app-name').inputValue(),'Pending branding');assert.equal(await page.locator('#s-remind-lead').inputValue(),'99');check('Product save applies only products despite unrelated invalid and pending settings');
 assert.match(await page.locator('#pkgFilter').innerText(),/Renamed QA product/);assert.match(await page.locator('#acctBar').innerText(),/Renamed QA product/);check('Renamed product appears in existing accounts and product filter');
 await save('remind-lead').click();await assertStatus('remind-lead',/0 to 27/);assert.equal((await doc('settings/main')).remindLead,before.remindLead);check('Invalid scoped setting reports error beside its own control and writes nothing');
 await save('app-name').click();await assertStatus('app-name',/Saved/);assert.equal((await doc('settings/main')).appName,'Pending branding');check('Valid individual setting saves without validating unrelated drafts');
 await page.locator('#s-remind-lead').fill('6');await save('remind-lead').click();await assertStatus('remind-lead',/Saved/);got=await doc('settings/main');assert.equal(got.remindLead,6);assert.equal(got.replyLead,before.replyLead);
 await page.locator('#s-reply-lead').fill('2');await save('reply-lead').click();await assertStatus('reply-lead',/Saved/);got=await doc('settings/main');assert.equal(got.replyLead,2);assert.equal(got.remindLead,6);check('Reminder lead and reply-by lead each save on their own (v68: days before a cycle starts, no shared billing day)');
 const qBefore=(await doc('settings/main')).queueTemplates;await page.locator('#s-q1').fill('QA saved stage one');await page.locator('#s-q2').fill('QA pending stage two');await save('q1').click();await assertStatus('q1',/Saved/);got=await doc('settings/main');assert.equal(got.queueTemplates[1],'QA saved stage one');assert.equal(got.queueTemplates[2],qBefore[2]);check('One queue message saves without applying another message draft');
 await page.locator('#s-tagline').fill('Retry this draft');expectedFailure=true;
 await page.route('**/api/docs/settings/main',async route=>{if(route.request().method()==='PATCH')await route.fulfill({status:503,contentType:'application/json',body:'{"error":"qa_failure"}'});else await route.continue();});
 await save('tagline').click();await assertStatus('tagline',/Not saved/);assert.equal(await page.locator('#s-tagline').inputValue(),'Retry this draft');assert.equal((await doc('settings/main')).tagline,before.tagline);check('Failed save leaves stored value and draft intact with local retry feedback');
 await page.unroute('**/api/docs/settings/main');expectedFailure=false;await save('tagline').click();await assertStatus('tagline',/Saved/);check('Failed save can be retried successfully');
 await page.locator('#s-tagline').fill('Edited after save');await assertStatus('tagline',/Unsaved changes/);check('Editing a saved setting clears its stale Saved status');
 let release,started;const ready=new Promise(r=>started=r),gate=new Promise(r=>release=r);
 await page.route('**/api/docs/settings/main',async route=>{if(route.request().method()==='PATCH'){started();await gate;}await route.continue();});
 await save('tagline').click();await ready;assert.equal(await save('packages').isDisabled(),true);await page.locator('#s-tagline').fill('Newer pending draft');release();await assertStatus('tagline',/Unsaved changes/);await page.waitForFunction(()=>!document.querySelector('[data-save-setting="tagline"]').disabled);
 assert.equal((await doc('settings/main')).tagline,'Edited after save');await page.unroute('**/api/docs/settings/main');check('Overlapping saves are disabled and edits during a save stay marked unsaved');
 await page.locator('#s-tagline').fill('Retry this draft');await save('tagline').click();await assertStatus('tagline',/Saved/);
 await page.locator('#s-q2').fill('QA saved stage two');await page.locator('#s-remind-lead').fill('4');await page.locator('#s-reply-lead').fill('1');await page.locator('#settingsForm button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('#s-msg').textContent==='All settings saved.');
 got=await doc('settings/main');assert.equal(got.remindLead,4);assert.equal(got.replyLead,1);assert.equal(got.queueTemplates[2],'QA saved stage two');check('Explicit Save all validates and applies all drafts including the reminder leads and messages');
 for(const width of [390,1400])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height:1000});await page.emulateMedia({colorScheme:theme});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await save('packages').scrollIntoViewIfNeeded();const rect=await save('packages').boundingBox();assert.ok(rect.x>=0&&rect.x+rect.width<=width);
  await page.screenshot({path:path.join(out,`settings-${width}-${theme}.png`)});check(`Settings and product save fit ${width}px ${theme}`);
 }
 await page.reload();await page.locator('#tbody tr.row').first().waitFor();await page.locator('#btn-settings').click();assert.equal(await first.inputValue(),'Renamed QA product');assert.equal(await page.locator('#s-tagline').inputValue(),'Retry this draft');assert.equal(await page.locator('#s-app-name').inputValue(),'Pending branding');check('Saved values persist after reload; unsaved edits are not persisted');
 const usersAfter=await(await ctx.request.get(base+'/api/docs?prefix=users/')).json();assert.deepEqual(usersAfter.docs,usersBefore.docs);check('Settings changes leave all subscriber documents unchanged');
 assert.deepEqual(errors,[]);check('No unexpected console or page errors');fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({checks,errors},null,2));
 async function assertStatus(k,re){await page.waitForFunction(({k,re})=>new RegExp(re).test(document.querySelector('#setting-status-'+k).textContent),{k,re:re.source});}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
