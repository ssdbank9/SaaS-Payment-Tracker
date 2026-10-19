// v45: fixes from the adversarial review of v44. Synthetic local records on a disposable server only (see AGENTS.md), then:
//   WASOOLI_TEST_URL=http://127.0.0.1:<port> node tests/review-v45-flow.cjs
// Courtesy + Set bill (no double discount), currency change with money paid ahead (moved, schedule kept), plan change then cancel then resume
// (only the new plan resumes), resume keeps instalments, Add user / CSV package-cycle rule, a redraw keeps the courtesy "Number of bills" field,
// statement import (identical charges, tax of row above, a credit, typing focus, a failed save stays, a re-ticked duplicate is saved).
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const stubWebFonts=require('./webfonts.cjs');

const base=process.env.WASOOLI_TEST_URL||'http://127.0.0.1:8098',H={'X-Requested-With':'wasool','Content-Type':'application/json'},checks=[];
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).protocol,'http:');
const out=path.resolve(process.env.WASOOLI_TEST_OUTPUT||'data/review-v45-qa');fs.mkdirSync(out,{recursive:true});
const check=n=>{checks.push(n);console.log('PASS '+n);};
const mon=(start,extra)=>Object.assign({id:'s1',kind:'monthly',cycle:'monthly',packageId:'pkg_c',currency:'PKR',start,prorate:true,prices:[{from:start,price:4200}],payments:[]},extra||{});
const pay=(id,date,amount)=>({id,date,amount,currency:'PKR'});
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--disable-gpu']});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await stubWebFonts(ctx);await ctx.addInitScript(()=>{if(!localStorage.getItem('pt-today'))localStorage.setItem('pt-today','2026-10-20');});
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error'&&!/status of 500/.test(m.text()))errors.push(m.text());});
  await page.goto(base+'/login',{waitUntil:'domcontentloaded'});await page.locator('[name=passcode]').fill('test1234');await page.locator('button[type=submit]').click();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  const api=async(method,pth,data)=>{const r=await ctx.request.fetch(base+pth,{method,headers:H,data:data===undefined?undefined:JSON.stringify(data)});let j=null;try{j=await r.json();}catch(e){}return {status:r.status(),j};};
  const doc=async p=>(await api('GET','/api/docs/'+p)).j.data;
  const costs=async()=>((await api('GET','/api/docs?prefix=costs/')).j.docs||[]).map(d=>d.data||d);
  const until=async(fn,what)=>{for(let i=0;i<60;i++){if(await fn())return;await page.waitForTimeout(250);}throw new Error('timed out waiting for '+what);};
  const det=id=>page.locator('tr.detail[data-id="'+id+'"]');
  const expand=async id=>{if(!(await det(id).count()))await page.locator('tr.row[data-id="'+id+'"]').click();await det(id).waitFor();return det(id);};
  await api('POST','/api/import',{docs:{
   'users/v1':{name:'Courtesy Bill Person',joinDate:'2026-08-24',subscriptions:[mon('2026-08-24',{courtesy:[{id:'c1',from:'2026-10-24',to:null,amount:500,note:'',at:'2026-10-01'}]})]},
   'users/v2':{name:'Paid Ahead Person',joinDate:'2026-07-24',subscriptions:[mon('2026-07-24',{payments:[pay('p1','2026-07-24',4200),pay('p2','2026-08-24',4200),pay('p3','2026-09-24',4200),pay('p4','2026-10-15',4200)]})]},
   'users/v3':{name:'Instalment Change Person',joinDate:'2026-07-24',subscriptions:[{id:'s1',kind:'monthly',cycle:'yearly',packageId:'pkg_g',currency:'PKR',start:'2026-07-24',prorate:true,prorationBasis:'actual',paymentEvery:1,prices:[{from:'2026-07-24',price:24000}],payments:[]}]},
   'users/v4':{name:'Resume Instalment Person',joinDate:'2026-07-24',cancel:{lastDay:'2026-09-23',reason:'x',note:'',at:'2026-09-20'},subscriptions:[{id:'s1',kind:'monthly',cycle:'yearly',packageId:'pkg_g',currency:'PKR',start:'2026-07-24',end:'2026-09-23',prorate:true,prorationBasis:'actual',paymentEvery:1,prices:[{from:'2026-07-24',price:24000}],payments:[]}]},
  },replace:[]});
  await page.reload();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  assert.equal(await page.locator('#app-ver').textContent(),'v49');await page.locator('#statusFilter').selectOption('all');

  // 1. Set bill with a courtesy discount: saving the agreed amount unchanged keeps Rs 3,700 (before: the Rs 500 came off twice, Rs 3,200)
  await page.locator('tr.row[data-id=v1] .row-bill').click();await page.locator('#billDialog[open]').waitFor();await page.locator('#bill-period').selectOption('2026-10-24');
  assert.equal(await page.locator('#bill-amount').inputValue(),'3700');await page.locator('#bill-save').click();await page.locator('#billDialog').waitFor({state:'hidden'});
  await until(async()=>((await doc('users/v1')).subscriptions[0].periodOverrides||{})['2026-10-24'],'bill saved');
  assert.equal((await doc('users/v1')).subscriptions[0].periodOverrides['2026-10-24'].amount,4200);
  const d1=await expand('v1');await until(async()=>/3,700/.test(await d1.textContent())&&!/3,200/.test(await d1.textContent()),'Rs 3,700 shown');
  check('Set bill with a Rs 500 courtesy: saving Rs 3,700 unchanged keeps the bill at Rs 3,700 (stored before the courtesy: Rs 4,200)');

  // 2. a redraw keeps the courtesy form's "Number of bills" choice and its field
  await d1.locator('[data-key="courtesy:s1"]').first().click();const cf=d1.locator('form.courtesy-form[data-sub=s1]');await cf.waitFor({state:'visible'});
  await cf.locator('[name=tenure]').selectOption('n');await cf.locator('[name=count]').fill('4');
  await api('PUT','/api/docs/users/v9',{name:'Redraw Trigger',joinDate:'2026-10-01',subscriptions:[]});
  await until(async()=>(await page.locator('tr.row[data-id=v9]').count())>0,'redraw from the new user');
  assert.equal(await cf.locator('[name=tenure]').inputValue(),'n');assert.equal(await cf.locator('[name=count]').isVisible(),true);assert.equal(await cf.locator('[name=count]').inputValue(),'4');
  check('a background redraw keeps the courtesy form on "A number of bills" with its Number of bills field visible');
  await cf.locator('[name=tenure]').selectOption('one');await d1.locator('[data-key="courtesy:s1"]').first().click();

  // 3. currency change with money paid ahead: the Rs 4,200 for Oct 24 - Nov 23 moves to the new USD plan, so that period is not billed again
  const editPlan=async uid=>{const d=await expand(uid);await d.locator('[data-key="edit:s1"]').first().click();const f=d.locator('form.subedit-form[data-sub=s1]');await f.waitFor({state:'visible'});return f;};
  let f=await editPlan('v2');await f.locator('[name=currency]').selectOption('USD');await f.locator('[name=chgPrice]').fill('15');await f.locator('[name=chgFrom]').selectOption('2026-10-24');
  assert.match(await f.locator('[data-role=chg-hint]').textContent(),/paid for bills after that date moves to the new plan/);
  await f.locator('button[type=submit]').click();
  await until(async()=>(await doc('users/v2')).subscriptions.length===2,'new plan');
  let u2=await doc('users/v2');let [o2,n2]=u2.subscriptions;
  assert.equal(o2.end,'2026-10-23');assert.deepEqual((o2.refunds||[]).map(r=>[r.amount,r.currency]),[[4200,'PKR']]);
  assert.deepEqual(n2.payments.map(p=>[p.amount,p.currency,p.rate>0]),[[4200,'PKR',true]]);assert.equal(n2.currency,'USD');
  const d2=await expand('v2');await until(async()=>!/Overdue|due today/i.test(await page.locator('tr.row[data-id=v2]').textContent()),'not overdue');
  check('currency change: Rs 4,200 paid ahead is moved to the new USD plan (refund on the old plan, the same amount received on the new one); the customer is not billed again');

  // 4. that plan change, then a cancellation on Oct 23, then Resume from Oct 24: only the new USD plan comes back
  await d2.locator('button[data-key=cancel]').first().click();const cfm=d2.locator('.cancel-form');await cfm.waitFor({state:'visible'});await cfm.locator('[name=lastDay]').fill('2026-10-23');await cfm.locator('button[type=submit]').click();
  await until(async()=>!!(await doc('users/v2')).cancel,'cancelled');
  await page.locator('#search').fill('Paid Ahead');await expand('v2');const rf=d2.locator('form.react-form');if(!(await rf.isVisible()))await d2.locator('button[data-key=react]:visible').first().click();await rf.waitFor({state:'visible'});await rf.locator('[name=start]').fill('2026-10-24');await rf.locator('button[type=submit]').click();
  await until(async()=>!(await doc('users/v2')).cancel,'resumed');
  u2=await doc('users/v2');assert.deepEqual(u2.subscriptions.map(s=>[s.currency,s.end||null]),[['PKR','2026-10-23'],['USD',null]]);
  check('plan change, cancel on the old plan\'s last day, Resume: only the new USD plan resumes (before, both plans were billed)');

  await page.locator('#search').fill('');
  // 5. a yearly plan paid monthly keeps its instalments through a currency change and through a resume
  f=await editPlan('v3');await f.locator('[name=currency]').selectOption('USD');await f.locator('[name=chgPrice]').fill('90');await f.locator('[name=chgFrom]').selectOption({index:0});await f.locator('button[type=submit]').click();
  await until(async()=>(await doc('users/v3')).subscriptions.length===2,'new yearly plan');assert.equal((await doc('users/v3')).subscriptions[1].paymentEvery,1);
  await page.locator('#search').fill('Resume Instalment');const d4=await expand('v4');const rf4=d4.locator('form.react-form');if(!(await rf4.isVisible()))await d4.locator('button[data-key=react]:visible').first().click();await rf4.waitFor({state:'visible'});await rf4.locator('[name=start]').fill('2026-10-24');await rf4.locator('button[type=submit]').click();
  await until(async()=>!(await doc('users/v4')).cancel,'v4 resumed');const s4=(await doc('users/v4')).subscriptions.at(-1);assert.equal(s4.start,'2026-10-24');assert.equal(s4.paymentEvery,1);
  await page.locator('#search').fill('');
  check('a yearly plan billed every month keeps that schedule after a currency change and after a resume (before: one full yearly bill)');

  // 6. Add user refuses a monthly cycle on the yearly package G; CSV takes the cycle from the package
  await page.locator('#btn-add').click();await page.locator('#a-pkg').selectOption('pkg_g');await page.evaluate(()=>{const c=document.querySelector('#a-cycle');c.value='monthly';});
  await page.locator('#a-name').fill('Mismatch Person');await page.locator('#a-join').fill('2026-10-01');await page.locator('#a-start').fill('2026-10-01');await page.locator('#a-price').fill('2000');
  await page.locator('#addForm button[type=submit]').click();await until(async()=>/yearly package/.test(await page.locator('#a-err').textContent()),'mismatch refused');
  assert.equal(Object.values((await api('GET','/api/docs?prefix=users/')).j.docs||[]).some(d=>(d.data||d).name==='Mismatch Person'),false);
  await page.locator('#btn-add').click();
  await page.locator('#btn-io').click();await page.fill('#importText','name,joined,package,price\nCsv G Person,2026-07-24,G,24000');await page.click('#btn-import');
  await page.waitForFunction(()=>/Imported/.test(document.querySelector('#importMsg').textContent),null,{timeout:20000});
  const csvU=((await api('GET','/api/docs?prefix=users/')).j.docs||[]).map(d=>d.data||d).find(u=>u.name==='Csv G Person');assert.equal(csvU.subscriptions[0].cycle,'yearly');
  await page.locator('#btn-io').click();
  check('Add user refuses a monthly plan on the yearly package G; a CSV row without a kind takes the package\'s yearly cycle');

  // 7. statement import from pasted text
  await page.locator('#btn-shot').click();await page.locator('#shotPanel').waitFor({state:'visible'});
  const paste=async text=>{await page.evaluate(()=>{document.querySelector('#shot-alt').open=true;});await page.locator('#shot-text').fill(text);await page.locator('#shot-text-go').click();};
  await paste(['2026-09-25 NETFLIX.COM 1,500.00','2026-09-25 NETFLIX.COM 1,500.00','2026-09-26 SOFTWARE LTD 2,000.00','2026-09-26 FED EXCISE DUTY 104.00','2026-09-27 MERCHANT REFUND 300.00 CR','2026-09-28 GOOGLE STORAGE 999.00','2026-09-28 SALES TAX 52.00'].join('\n'));
  await until(async()=>(await page.locator('#rv-body tr').count())===7,'seven rows');
  const row=i=>page.locator('#rv-body tr').nth(i);
  const amt=row(0).locator('[data-f=amount]');await amt.fill('150');await amt.press('0');
  assert.equal(await page.evaluate(()=>document.activeElement&&document.activeElement.dataset.f),'amount');assert.equal(await amt.inputValue(),'1500');
  check('typing an amount in the review list keeps the box focused');
  await row(3).locator('[data-f=role]').selectOption('taxabove');await row(6).locator('[data-f=role]').selectOption('taxabove');
  await row(4).locator('[data-f=sel]').check();await row(5).locator('[data-f=sel]').uncheck();
  const before=(await costs()).filter(c=>c.source==='screenshot').length;
  await page.locator('#rv-save').click();await until(async()=>(await costs()).filter(c=>c.source==='screenshot').length===before+5,'five costs');
  const got=(await costs()).filter(c=>c.source==='screenshot').map(c=>[c.description,c.cost,c.tax]).sort((a,b)=>String(a).localeCompare(String(b)));
  assert.deepEqual(got,[['NETFLIX.COM',1500,0],['NETFLIX.COM',1500,0],['Refund: MERCHANT REFUND',-300,0],['SALES TAX',0,52],['SOFTWARE LTD',2000,104]].sort((a,b)=>String(a).localeCompare(String(b))));
  assert.equal(await page.locator('#rv-body tr').count(),1);
  check('Apply: both identical Rs 1,500 charges are added, the duty joins the ticked row above, tax under an unticked row is its own entry, a ticked credit is a negative cost; only the unticked row stays');
  await page.locator('#rv-clear').click();
  // a save that fails leaves its row in the list; Apply again saves it
  await paste('2026-10-02 DOMAIN RENEWAL 3,333.00');await until(async()=>(await page.locator('#rv-body tr').count())===1,'one row');
  await page.route('**/api/docs/costs/**',r=>r.request().method()==='PUT'?r.fulfill({status:500,contentType:'application/json',body:'{"error":"test"}'}):r.continue());
  await page.locator('#rv-save').click();await until(async()=>/not saved/.test(await page.locator('#rv-msg').textContent()),'failure message');
  assert.equal(await page.locator('#rv-body tr').count(),1);await page.unroute('**/api/docs/costs/**');
  await page.locator('#rv-save').click();await until(async()=>(await page.locator('#rv-body tr').count())===0,'row saved');
  assert.equal((await costs()).filter(c=>c.description==='DOMAIN RENEWAL').length,1);
  check('a cost that fails to save stays in the review list, and Apply again saves it once');
  // a flagged duplicate the owner ticks again is saved
  await paste('2026-09-25 NETFLIX.COM 1,500.00');await until(async()=>(await page.locator('#rv-body tr').count())===1,'dup row');
  assert.equal(await row(0).getAttribute('data-dup'),'1');await row(0).locator('[data-f=sel]').check();await page.locator('#rv-save').click();
  await until(async()=>(await costs()).filter(c=>c.description==='NETFLIX.COM').length===3,'re-ticked duplicate saved');
  check('a row flagged Possible duplicate and ticked again by the owner is saved');

  await page.screenshot({path:path.join(out,'review-v45-390.png')});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);check('No sideways scroll and no unexpected console/page errors');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({version:'49',checks},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
