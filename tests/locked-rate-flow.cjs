// v39: a receipt in another currency keeps the rate of the day it was recorded. Synthetic local records only.
// Start a disposable server (see AGENTS.md), then: node tests/locked-rate-flow.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.WASOOLI_TEST_URL||'http://127.0.0.1:8098',H={'X-Requested-With':'wasool','Content-Type':'application/json'},checks=[];
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).protocol,'http:');
const out=path.resolve(process.env.WASOOLI_TEST_OUTPUT||'data/locked-rate-qa');fs.mkdirSync(out,{recursive:true});
const check=n=>{checks.push(n);console.log('PASS '+n);};
const usdPlan=pays=>({id:'s1',kind:'monthly',cycle:'monthly',packageId:'pkg_c',currency:'USD',start:'2026-09-24',prorate:true,prorationBasis:'fixed30',prices:[{from:'2026-09-24',price:20}],payments:pays});
const USERS={
  fresh:{name:'Fresh Payer',joinDate:'2026-09-24',subscriptions:[usdPlan([{id:'p1',date:'2026-09-24',amount:20,currency:'USD'}])]},
  legacy:{name:'Legacy Payer',joinDate:'2026-09-24',subscriptions:[usdPlan([{id:'p1',date:'2026-09-24',amount:20,currency:'USD'},{id:'pold',date:'2026-10-24',amount:5600,currency:'PKR',rate:null,note:'old'}])]}
};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--disable-gpu']});
 try{
  const ctx=await browser.newContext({viewport:{width:1400,height:900}});await ctx.addInitScript(()=>{if(!localStorage.getItem('pt-today'))localStorage.setItem('pt-today','2026-10-28');});
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(base+'/login',{waitUntil:'domcontentloaded'});await page.locator('[name=passcode]').fill('test1234');await page.locator('button[type=submit]').click();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  const api=async(method,pth,data)=>{const r=await ctx.request.fetch(base+pth,{method,headers:H,data:data===undefined?undefined:JSON.stringify(data)});let j=null;try{j=await r.json();}catch(e){}return {status:r.status(),j};};
  const doc=async id=>(await api('GET','/api/docs/users/'+id)).j.data;
  assert.equal((await api('PATCH','/api/docs/settings/main',{rate:280})).status,200);
  await api('POST','/api/import',{docs:{},replace:['users/','costs/']});for(const [id,u] of Object.entries(USERS))assert.equal((await api('PUT','/api/docs/users/'+id,u)).status,200);
  const reload=async()=>{await page.reload();await page.waitForSelector('tr.row[data-id="fresh"]');await page.waitForTimeout(2500);};
  const row=async id=>(await page.locator('tr.row[data-id="'+id+'"]').innerText()).replace(/\s+/g,' ');
  await reload();
  const legacyBefore=JSON.stringify(await doc('legacy'));

  /* record Rs 5,600 (= $20 at 280) with the rate left blank, through the payment dialog */
  await page.locator('tr.row[data-id="fresh"] .row-pay').click();await page.locator('#paymentDialog[open]').waitFor();
  if(!await page.locator('#payment-more').evaluate(d=>d.open))await page.locator('#payment-more summary').click();await page.locator('#payment-currency').selectOption('PKR');await page.locator('#payment-amount').fill('5600');
  await page.waitForFunction(()=>!document.querySelector('#payment-save').disabled);await page.locator('#payment-save').click();await page.locator('#paymentDialog').waitFor({state:'hidden'});
  let pays=(await doc('fresh')).subscriptions[0].payments;const rec=pays.find(p=>p.currency==='PKR');
  assert.equal(rec.amount,5600);assert.equal(rec.rate,280);
  check('A PKR payment recorded on a USD plan with the rate left blank is saved with that day\'s rate (280)');
  assert.doesNotMatch(await row('fresh'),/Overdue/);

  /* the default rate changes later: the recorded payment keeps its dollar value */
  assert.equal((await api('PATCH','/api/docs/settings/main',{rate:290})).status,200);await reload();
  assert.doesNotMatch(await row('fresh'),/Overdue/);assert.match(await row('fresh'),/Paid to Nov 23/);
  assert.match(await row('legacy'),/Overdue/);
  const tiles=(await page.locator('.tile').allInnerTexts()).join(' ').replace(/\s+/g,' ');
  assert.match(tiles,/Collected Rs 11,200 \$39\.31/);assert.match(tiles,/owed by 1 user/);
  check('After the default rate changes to 290 the newly recorded payment still counts as $20 (still paid) while the old blank-rate receipt floats to $19.31 (overdue by $0.69)');

  /* a typed rate is kept; a same-currency payment gets no rate */
  const u=await doc('fresh');u.subscriptions[0].payments.push({id:'px',date:'2026-10-28',amount:5500,currency:'PKR',rate:275,note:'typed'},{id:'py',date:'2026-10-28',amount:5,currency:'USD',rate:null,note:'same currency'});assert.equal((await api('PUT','/api/docs/users/fresh',u)).status,200);
  assert.equal((await doc('fresh')).subscriptions[0].payments.find(p=>p.id==='px').rate,275);assert.equal((await doc('fresh')).subscriptions[0].payments.find(p=>p.id==='py').rate,null);
  check('A typed rate and a same-currency payment are stored as they were entered');

  /* old receipts are not rewritten by loading the page */
  await reload();assert.equal(JSON.stringify(await doc('legacy')),legacyBefore);
  check('An old receipt with a blank rate is left exactly as stored when the page loads');
  /* editing it locks it at the rate in force today */
  await page.locator('tr.row[data-id="legacy"]').click();await page.locator('[data-act=pay-edit][data-pay=pold]').click();await page.locator('#paymentDialog[open]').waitFor();
  await page.locator('#payment-note').fill('old, edited');await page.waitForFunction(()=>!document.querySelector('#payment-save').disabled);await page.locator('#payment-save').click();await page.locator('#paymentDialog').waitFor({state:'hidden'});
  const edited=(await doc('legacy')).subscriptions[0].payments.find(p=>p.id==='pold');assert.equal(edited.rate,290);assert.equal(edited.amount,5600);assert.equal(edited.note,'old, edited');
  check('Editing an old blank-rate receipt saves it with today\'s default rate (290), keeping its amount and id');

  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  check('No sideways scroll at 390px');
  assert.deepEqual(errors,[]);check('No unexpected console/page errors');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({version:'43',checks},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
