// v50: wholesalers. Settings gets a wholesaler and a product that renews on the 15th with a $15 supplier cost paid in PKR (5.2% tax,
// 30-day proration). Quick add takes a pasted list of emails for that wholesaler: each plan renews on the 15th, is charged the full first
// month and starts with the product's cost; a mid-month joiner's first cost is prorated on 30 days. Add user fills the cost from the
// product and unticks proration for a wholesaler. A loss of 7 seats ($120 paid in PKR) is a cost marked Loss. The list filters and
// labels by wholesaler, WhatsApp goes to the wholesaler for a customer with no number, Summary has a By wholesaler table, and Edit user
// can move a customer back to direct. Synthetic records on a disposable server only:
//   WASOOLI_TEST_URL=http://127.0.0.1:<port> node tests/wholesaler-flow.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const stubWebFonts=require('./webfonts.cjs');

const base=process.env.WASOOLI_TEST_URL||'http://127.0.0.1:8098',H={'X-Requested-With':'wasool','Content-Type':'application/json'},checks=[];
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).protocol,'http:');
const out=path.resolve(process.env.WASOOLI_TEST_OUTPUT||'data/wholesaler-qa');fs.mkdirSync(out,{recursive:true});
const check=n=>{checks.push(n);console.log('PASS '+n);};
const num=t=>Number(String(t).replace(/[^0-9.\-]/g,''));
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--disable-gpu']});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await stubWebFonts(ctx);await ctx.addInitScript(()=>{if(!localStorage.getItem('pt-today'))localStorage.setItem('pt-today','2026-11-25');});
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(base+'/login',{waitUntil:'domcontentloaded'});await page.locator('[name=passcode]').fill('test1234');await page.locator('button[type=submit]').click();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  assert.equal(await page.locator('#app-ver').textContent(),'v50');
  const api=async(method,pth,data)=>{const r=await ctx.request.fetch(base+pth,{method,headers:H,data:data===undefined?undefined:JSON.stringify(data)});let j=null;try{j=await r.json();}catch(e){}return {status:r.status(),j};};
  const doc=async p=>((await api('GET','/api/docs/'+p)).j||{}).data;
  const users=async()=>((await api('GET','/api/docs?prefix=users/')).j.docs||[]).map(x=>({id:(x.path||'').split('/')[1],...(x.data||x)}));
  const until=async(fn,what)=>{for(let i=0;i<60;i++){if(await fn())return;await page.waitForTimeout(250);}throw new Error('timed out waiting for '+what);};
  const rate=(await doc('settings/main')).rate;assert.ok(rate>0,'the store has a default rate');

  // 1. Settings: a wholesaler and a product that renews on the 15th with its supplier cost
  await page.locator('#btn-settings').click();await page.locator('#ws-add').click();
  const ws=page.locator('#wsList .ws-row').last();await ws.locator('[data-w=name]').fill('Test Wholesaler A');await ws.locator('[data-w=phone]').fill('+880 1700 000001');
  await page.locator('[data-save-setting=wholesalers]').click();
  await until(async()=>((await doc('settings/main')).wholesalers||[]).length===1,'wholesaler saved');
  const W=(await doc('settings/main')).wholesalers[0];assert.equal(W.name,'Test Wholesaler A');assert.equal(W.phone,'8801700000001');
  await page.locator('#ws-add').click();const ws2=page.locator('#wsList .ws-row').last();await ws2.locator('[data-w=name]').fill('Test Wholesaler B');await ws2.locator('[data-w=phone]').fill('+91 900 000 0002');
  await page.locator('[data-save-setting=wholesalers]').click();await until(async()=>((await doc('settings/main')).wholesalers||[]).length===2,'second wholesaler saved');
  const W2=(await doc('settings/main')).wholesalers[1];
  await page.locator('#pkg-add').click();const row=page.locator('#pkgList .pkg-row').last();
  await row.locator('[data-f=name]').fill('Max 15th');await row.locator('[data-f=price]').fill('30');await row.locator('[data-f=currency]').selectOption('USD');
  await row.locator('[data-f=renewDay]').fill('15');await row.locator('[data-f=costAmount]').fill('15');await row.locator('[data-f=costCurrency]').selectOption('USD');await row.locator('[data-f=costPaidIn]').selectOption('PKR');await row.locator('[data-f=costFirst]').selectOption('prorated30');
  await page.locator('[data-save-setting=packages]').click();
  await until(async()=>((await doc('settings/main')).packages||[]).some(p=>p.name==='Max 15th'),'product saved');
  const P=(await doc('settings/main')).packages.find(p=>p.name==='Max 15th');
  assert.equal(P.renewDay,15);assert.equal(P.costAmount,15);assert.equal(P.costCurrency,'USD');assert.equal(P.costPaidIn,'PKR');assert.equal(P.costFirst,'prorated30');
  await page.locator('#settings-close,[data-act=settings-close]').first().click().catch(()=>page.locator('#btn-settings').click());
  check('Settings saves two wholesalers with WhatsApp numbers and a product that renews on the 15th with a $15 cost paid in PKR, prorated on 30 days');

  // 2. Quick add: a wholesaler's list of emails, one product, price and start date for all rows
  await page.locator('#btn-quick').click();await page.locator('#qa-text').fill('qa1@test.dev\nqa2@test.dev');await page.locator('#qa-parse').click();
  await page.locator('#qa-review').waitFor({state:'visible'});
  await page.locator('#qa-ws').selectOption(W.id);await page.locator('#qa-pkg').selectOption(P.id);await page.locator('#qa-price').fill('30');await page.locator('#qa-cur').selectOption('USD');await page.locator('#qa-start').fill('2026-11-25');
  await page.locator('#qa-apply').click();assert.match(await page.locator('#qa-ws-note').textContent(),/sold through Test Wholesaler A/);
  await page.locator('#qa-save').click();
  await until(async()=>(await users()).filter(u=>/^qa[12]@test\.dev$/.test(u.email)).length===2,'quick add saved');
  for(const u of (await users()).filter(u=>/^qa[12]@test\.dev$/.test(u.email))){const s=u.subscriptions[0];
    assert.equal(u.wholesalerId,W.id);assert.equal(s.packageId,P.id);assert.equal(s.start,'2026-11-25');assert.equal(s.anchor,'2026-11-15');assert.equal(s.prorate,false);assert.equal(s.currency,'USD');assert.equal(s.prices[0].price,30);
    assert.equal(s.accountCost.first,'prorated30');assert.equal(s.accountCost.entries[0].amount,15);assert.equal(s.accountCost.entries[0].paidIn,'PKR');}
  check('Quick add puts two pasted emails under the wholesaler, each renewing on the 15th, charged the full $30 first month, with the product cost attached');

  // 3. the first cost is prorated on 30 days (Nov 25 - Dec 14 = 20 days of $15 = $10), converted to PKR with 5.2% tax
  await page.locator('#costsSec').scrollIntoViewIfNeeded();
  const costRow=page.locator('#costBody tr').filter({hasText:'qa1@test.dev'}).first();await costRow.waitFor();
  const cells=await costRow.locator('td').allTextContents();const baseP=Math.round(10*rate*100)/100,tax=Math.round(baseP*5.2)/100;
  assert.ok(Math.abs(num(cells[4])-baseP)<0.6,`cost ${cells[4]} vs ${baseP}`);assert.ok(Math.abs(num(cells[5])-tax)<0.6,`tax ${cells[5]} vs ${tax}`);
  check(`a customer joining Nov 25 costs $10 for the first part month (20 of 30 days), paid in PKR at ${rate} plus 5.2% tax`);

  // 4. the bill: full first month, renewing on Dec 15; WhatsApp goes to the wholesaler
  const qa1=(await users()).find(u=>u.email==='qa1@test.dev');
  const r1=page.locator('tr.row[data-id="'+qa1.id+'"]');await r1.scrollIntoViewIfNeeded();assert.match(await r1.textContent(),/via Test Wholesaler A/);
  const wa=await r1.locator('a.wa').first().getAttribute('href');assert.match(wa,/8801700000001/);
  await r1.click();const d1=page.locator('tr.detail[data-id="'+qa1.id+'"]');await d1.waitFor();const dt=await d1.textContent();
  assert.match(dt,/\$30/);assert.match(dt,/Dec 1[45]/);
  check('the customer row says via Test Wholesaler A, Remind opens WhatsApp to the wholesaler, and the plan bills $30 to Dec 14 then renews Dec 15');

  // 5. Add user: choosing the product fills its cost; choosing a wholesaler unticks proration
  await page.locator('#btn-add').click();await page.locator('#a-email').fill('direct-to-b@test.dev');await page.locator('#a-ws').selectOption(W2.id);
  assert.equal(await page.locator('#a-prorate').isChecked(),false);
  await page.locator('#a-pkg').selectOption(P.id);await page.locator('#a-start').fill('2026-11-20');await page.locator('#a-join').fill('2026-11-20');await page.locator('#a-price').fill('28');await page.locator('#a-cur').selectOption('USD');
  assert.equal(await page.locator('#a-account-cost [name=accountCostMode]').inputValue(),'cycle');assert.equal(await page.locator('#a-account-cost [name=accountCost]').inputValue(),'15');assert.equal(await page.locator('#a-account-cost [name=accountCostPaidIn]').inputValue(),'PKR');
  await page.locator('#addForm button[type=submit]').click();
  await until(async()=>!!(await users()).find(u=>u.email==='direct-to-b@test.dev'),'add user saved');
  const b=(await users()).find(u=>u.email==='direct-to-b@test.dev');assert.equal(b.wholesalerId,W2.id);assert.equal(b.subscriptions[0].anchor,'2026-11-15');assert.equal(b.subscriptions[0].prorate,false);assert.equal(b.subscriptions[0].accountCost.entries[0].amount,15);
  await page.locator('#paymentDialog').evaluate(dl=>dl.open&&dl.close()).catch(()=>{});
  check('Add user with a wholesaler: proration is unticked, the product fills its $15 PKR-paid cost, and the plan renews on the 15th');

  // 6. a loss: 7 seats paid for and lost, $120 paid in PKR
  await page.locator('#btn-cost').click();await page.locator('#c-kind').selectOption('loss');await page.locator('#c-seats').fill('7');
  await page.locator('#c-date').fill('2026-11-10');await page.locator('#c-desc').fill('7 Claude Max accounts lost');await page.locator('#c-cur').selectOption('USD');await page.locator('#c-cost').fill('120');await page.locator('#c-paid').selectOption('PKR');
  await page.locator('#c-submit').click();
  let loss;await until(async()=>{loss=((await api('GET','/api/docs?prefix=costs/')).j.docs||[]).map(x=>x.data||x).find(c=>c.kind==='loss');return !!loss;},'loss saved');
  assert.equal(loss.seats,7);assert.equal(loss.category,'Loss');assert.equal(loss.currency,'PKR');assert.ok(Math.abs(loss.cost+loss.tax-(Math.round(120*rate*100)/100)*1.052)<1,'loss total');
  await until(async()=>/Loss · 7 seats/.test(await page.locator('#costBody').textContent()),'loss shown in Costs');assert.match(await page.locator('#t-cost-sub').textContent(),/incl\. losses/);
  check('a Loss of 7 seats ($120 paid in PKR, plus 5.2% tax) is saved, tagged in Costs and counted in the Costs tile');

  // 7. filter by wholesaler, By wholesaler table, Edit user back to direct
  await page.locator('#wsFilter').selectOption(W.id);await until(async()=>(await page.locator('#tbody tr.row').count())===2,'filter shows two');
  await page.locator('#wsFilter').selectOption('');
  assert.match(await page.locator('#pkgBreak').textContent(),/By wholesaler[\s\S]*Test Wholesaler A[\s\S]*Test Wholesaler B/);
  check('the list filters to the wholesaler\'s two customers and Summary shows a By wholesaler table');
  const rb=page.locator('tr.row[data-id="'+b.id+'"]');await rb.click();const db=page.locator('tr.detail[data-id="'+b.id+'"]');await db.waitFor();
  await db.locator('[data-key=edit]').first().click();await db.locator('select[name=wholesalerId]').selectOption('');await db.locator('form button[type=submit]',{hasText:'Save changes'}).click();
  await until(async()=>!(await users()).find(u=>u.id===b.id).wholesalerId,'moved to direct');
  check('Edit user moves a customer back to direct');

  await page.screenshot({path:path.join(out,'wholesaler-390.png'),fullPage:false});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.locator('#btn-settings').click();await page.locator('#wsList').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'wholesaler-settings-390.png')});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.locator('#settings-close').click();
  await page.setViewportSize({width:1400,height:1000});await page.emulateMedia({colorScheme:'dark'});await page.locator('#btn-settings').click();await page.locator('#wsList').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'wholesaler-settings-1400-dark.png')});
  assert.deepEqual(errors,[]);check('No sideways scroll at 390px and no console/page errors');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({version:'50',checks},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
