// v64: customers can pay in EUR or GBP. Settings carries PKR per EUR / GBP; Add customer takes a euro price; the bill shows €12 ≈ Rs 3,600;
// a PKR receipt on the euro plan locks the EUR rate and settles the bill; a GBP receipt on the euro plan converts through PKR; Search filters
// by EUR; Quick add reads "10 EUR" and "£9"; Edit plan offers all four currencies; the header badge shows the euro rate once it is in use.
// Synthetic records on a disposable server only:
//   WASOOLI_TEST_URL=http://127.0.0.1:<port> node tests/multi-currency-flow.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const stubWebFonts=require('./webfonts.cjs');

const base=process.env.WASOOLI_TEST_URL||'http://127.0.0.1:8098',H={'X-Requested-With':'wasool','Content-Type':'application/json'},checks=[];
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).protocol,'http:');
const out=path.resolve(process.env.WASOOLI_TEST_OUTPUT||'data/multi-currency-qa');fs.mkdirSync(out,{recursive:true});
const check=n=>{checks.push(n);console.log('PASS '+n);};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--disable-gpu']});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await stubWebFonts(ctx);await ctx.addInitScript(()=>{if(!localStorage.getItem('pt-today'))localStorage.setItem('pt-today','2026-10-20');});
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(base+'/login',{waitUntil:'domcontentloaded'});await page.locator('[name=passcode]').fill('test1234');await page.locator('button[type=submit]').click();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  const api=async(method,pth,data)=>{const r=await ctx.request.fetch(base+pth,{method,headers:H,data:data===undefined?undefined:JSON.stringify(data)});let j=null;try{j=await r.json();}catch(e){}return {status:r.status(),j};};
  const doc=async p=>((await api('GET','/api/docs/'+p)).j||{}).data;
  const until=async(fn,what)=>{for(let i=0;i<60;i++){if(await fn())return;await page.waitForTimeout(250);}throw new Error('timed out waiting for '+what);};
  const det=id=>page.locator('tr.detail[data-id="'+id+'"]');
  const expand=async id=>{if(!(await det(id).count()))await page.locator('tr.row[data-id="'+id+'"]').click();await det(id).waitFor();return det(id);};
  const payOpen=()=>page.locator('#paymentDialog').evaluate(d=>d.open);
  await api('PATCH','/api/docs/settings/main',{rate:280});
  await page.reload();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  assert.equal(await page.locator('#app-ver').textContent(),'v64');

  // 1. Settings: the two new rates save through the Exchange rate group
  await page.locator('#btn-settings').click();await page.locator('#s-rate-eur').waitFor({state:'visible'});
  await page.locator('#s-rate-eur').fill('300');await page.locator('#s-rate-gbp').fill('350');await page.locator('[data-save-setting=rate]').click();
  await until(async()=>{const s=await doc('settings/main');return s&&s.rateEUR===300&&s.rateGBP===350;},'rates saved');
  assert.equal((await doc('settings/main')).rate,280);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  check('Settings saves PKR per EUR and PKR per GBP next to the USD rate without horizontal scroll at 390px');

  // 2. Add customer in euros (own start date so the first bill is a full month); "Not yet" records nothing
  await page.locator('#btn-settings').click();await page.locator('#btn-add').click();await page.locator('#addForm').waitFor();
  assert.deepEqual(await page.locator('#a-cur option').evaluateAll(o=>o.map(x=>x.value)),['PKR','USD','EUR','GBP']);
  await page.locator('#a-name').fill('Euro Payer');await page.locator('#a-pkg').selectOption('pkg_c');await page.locator('#a-start').fill('2026-10-01');await page.locator('#a-start').dispatchEvent('input');await page.locator('#a-start').dispatchEvent('change');
  await page.locator('#a-price').fill('12');await page.locator('#a-cur').selectOption('EUR');await page.locator('#a-own').check();await page.waitForTimeout(300);
  assert.match(await page.locator('#a-price-lbl').textContent(),/\(€\)/);assert.match(await page.locator('#a-conv').textContent(),/€12\/mo ≈ Rs 3,600/);
  assert.match(await page.locator('#a-bill-preview').textContent(),/First bill: €12 for 1 Oct – 31 Oct 2026/);
  assert.match(await page.locator('#addForm input[name=a-paid][value=other]').locator('..').textContent(),/opens after Save/);
  await page.locator('#addForm input[name=a-paid][value=no]').check();await page.locator('#addForm button[type=submit]').click();
  let uid;await until(async()=>{const r=await api('GET','/api/docs?prefix=users/');const d=(r.j.docs||[]).find(x=>x.data.name==='Euro Payer');if(d)uid=d.path.slice(6);return !!uid;},'euro customer saved');
  let u=await doc('users/'+uid);assert.equal(u.subscriptions[0].currency,'EUR');assert.equal(u.subscriptions[0].prices[0].price,12);assert.equal((u.subscriptions[0].payments||[]).length,0);
  let d=await expand(uid);const t2=await d.textContent();assert.match(t2,/€12/);assert.match(t2,/Rs 3,600/);
  assert.match(await page.locator('#rate-badge').textContent(),/1 USD = Rs 280 · 1 EUR = Rs 300/);
  check('Add customer takes a €12 plan: preview, bill and badge show euros with the Rs equivalent at the EUR rate');

  // 3. Record Rs 3,600 on the euro plan with a blank rate: the receipt locks 300 (PKR per EUR) and the bill is paid
  await d.locator('[data-act=rec]').first().click();await until(payOpen,'payment box');
  assert.deepEqual(await page.locator('#payment-currency option').evaluateAll(o=>o.map(x=>x.value)),['PKR','USD','EUR','GBP']);
  assert.equal(await page.locator('#payment-rate-lbl').textContent(),'PKR per EUR');
  await page.locator('#payment-more').evaluate(d=>{d.open=true;});await page.locator('#payment-currency').selectOption('PKR');await page.locator('#payment-amount').fill('3600');await page.waitForTimeout(300);
  assert.equal(await page.locator('#payment-rate-lbl').textContent(),'PKR per EUR');assert.match(await page.locator('#payment-save').textContent(),/Record Rs 3,600/);
  await page.locator('#payment-save').click();await until(async()=>((await doc('users/'+uid)).subscriptions[0].payments||[]).length===1,'receipt saved');
  u=await doc('users/'+uid);const p1=u.subscriptions[0].payments[0];assert.equal(p1.currency,'PKR');assert.equal(p1.amount,3600);assert.equal(p1.rate,300);
  d=await expand(uid);await until(async()=>/Paid (for|to) [A-Za-z]+ ?[0-9]*/.test(await det(uid).textContent()),'paid status');
  check('A PKR receipt on the euro plan locks the EUR rate (300) and settles the €12 bill');

  // 4. A GBP receipt on the euro plan converts through PKR (£10 = Rs 3,500 = €11.67) and shows what is still owed on the next bill
  await api('PATCH','/api/docs/users/'+uid,{subscriptions:[Object.assign(u.subscriptions[0],{payments:u.subscriptions[0].payments.concat([{id:'p2',date:'2026-10-20',amount:10,currency:'GBP',rate:null,note:'pounds'}])})]});
  await page.reload();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  d=await expand(uid);const t4=await d.textContent();assert.match(t4,/£10/);assert.match(t4,/Paid (for|to) [A-Za-z]+ ?[0-9]*/);
  assert.match(t4.replace(/\s+/g,' '),/€0\.33/);
  check('A £10 receipt on the euro plan counts as €11.67 through the PKR rates');

  // 5. Search filters by currency; Edit plan lists every currency
  await page.locator('#btn-search').click();await page.locator('#searchPanel').waitFor({state:'visible'});
  await page.locator('#sr-cur').selectOption('EUR');await page.waitForTimeout(300);
  assert.deepEqual(await page.locator('#sr-body tr td.who b').allTextContents(),['Euro Payer']);await page.locator('#sr-cur').selectOption('GBP');await page.waitForTimeout(300);assert.equal(await page.locator('#sr-body tr').count(),0);
  await page.locator('#btn-search').click();d=await expand(uid);await d.locator('[data-key="edit:'+u.subscriptions[0].id+'"]').first().click();
  const f=d.locator('form.subedit-form');await f.waitFor({state:'visible'});assert.deepEqual(await f.locator('[name=currency] option').evaluateAll(o=>o.map(x=>x.value)),['PKR','USD','EUR','GBP']);assert.equal(await f.locator('[name=currency]').inputValue(),'EUR');
  check('Search filters by EUR/GBP and Edit plan offers all four currencies');

  // 6. Quick add reads euro and pound prices
  await page.locator('#btn-add').click();await page.locator('#btn-quick').click();await page.locator('#qa-text').fill('Sara Euro, sara@qa.test, joined Oct 15, C, 10 EUR\nPat Pound, pat@qa.test, joined Oct 15, C, £9');await page.locator('#qa-parse').click();
  await page.locator('#qa-review').waitFor({state:'visible'});
  const rows=await page.locator('#qa-body tr').evaluateAll(trs=>trs.map(tr=>[tr.querySelector('[data-f=price]').value,tr.querySelector('[data-f=cur]').value]));
  assert.deepEqual(rows,[['10','EUR'],['9','GBP']]);assert.deepEqual(await page.locator('#qa-cur option').evaluateAll(o=>o.map(x=>x.value)),['','PKR','USD','EUR','GBP']);
  check('Quick add reads "10 EUR" and "£9" into per-row prices and currencies');

  await page.screenshot({path:path.join(out,'multi-currency-390.png'),fullPage:true});
  assert.deepEqual(errors,[]);check('No console or page errors');
  fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify(checks,null,2));console.log('multi-currency-flow: '+checks.length+' checks passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
