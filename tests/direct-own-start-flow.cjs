// v75: direct customers renew on their own start date (Add user ticks it; picking a wholesaler unticks it) while the supplier cost keeps the
// product's date; Owe money lists who owes for which period; "edit days / rate" opens Set bill; Set bill can move one bill's due date.
// Synthetic records on a disposable server only:
//   WASOOLI_TEST_URL=http://127.0.0.1:<port> node tests/direct-own-start-flow.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const stubWebFonts=require('./webfonts.cjs');

const base=process.env.WASOOLI_TEST_URL||'http://127.0.0.1:8098',H={'X-Requested-With':'wasool','Content-Type':'application/json'},checks=[];
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).protocol,'http:');
const out=path.resolve(process.env.WASOOLI_TEST_OUTPUT||'data/direct-own-start-qa');fs.mkdirSync(out,{recursive:true});
const check=n=>{checks.push(n);console.log('PASS '+n);};
const norm=s=>String(s).replace(/\s+/g,' ').trim();
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--disable-gpu']});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await stubWebFonts(ctx);await ctx.addInitScript(()=>{if(!localStorage.getItem('pt-today'))localStorage.setItem('pt-today','2026-11-15');});
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(base+'/login',{waitUntil:'domcontentloaded'});await page.locator('[name=passcode]').fill('test1234');await page.locator('button[type=submit]').click();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  const api=async(method,pth,data)=>{const r=await ctx.request.fetch(base+pth,{method,headers:H,data:data===undefined?undefined:JSON.stringify(data)});let j=null;try{j=await r.json();}catch(e){}return {status:r.status(),j};};
  const doc=async p=>((await api('GET','/api/docs/'+p)).j||{}).data;
  const until=async(fn,what)=>{for(let i=0;i<60;i++){if(await fn())return;await page.waitForTimeout(250);}throw new Error('timed out waiting for '+what);};
  await until(async()=>((await doc('meta/schema'))||{}).version>=12,'the settings repair');
  const st=await doc('settings/main');
  await api('PATCH','/api/docs/settings/main',{packages:st.packages.map(p=>p.id==='pkg_cmax'?{...p,cycleStart:'2026-10-15',price:15,currency:'USD',costAmount:15,costCurrency:'USD',costPaidIn:'USD',costFirst:'prorated30'}:p),
    wholesalers:[{id:'ws_a',name:'Some Seller',phone:'918200000001',notes:''}]});
  for(const d of (((await api('GET','/api/docs?prefix=users/')).j||{}).docs||[]))await api('DELETE','/api/docs/'+d.path);
  await api('POST','/api/import',{docs:{
   'users/o1':{name:'Olive Own',phone:'923001234561',joinDate:'2026-10-26',subscriptions:[{id:'s1',kind:'monthly',cycle:'monthly',name:'',packageId:'pkg_cmax',currency:'USD',start:'2026-10-26',anchor:'2026-10-26',ownStart:true,prorate:false,prices:[{from:'2026-10-26',price:15}],payments:[]}]},
   'users/o2':{name:'Pete Prorated',phone:'923001234562',joinDate:'2026-10-26',subscriptions:[{id:'s1',kind:'monthly',cycle:'monthly',name:'',packageId:'pkg_cmax',currency:'USD',start:'2026-10-26',anchor:'2026-10-15',prorate:true,prices:[{from:'2026-10-26',price:15}],payments:[]}]},
  },replace:[]});
  await page.reload();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  assert.equal(await page.locator('#app-ver').textContent(),'v76');

  // 1. Owe money lists each unpaid bill with its period, due day and amount
  await page.locator('#payStrip [data-pf=owes]').click();await page.locator('#oweList table').waitFor();
  const rows=await page.locator('#oweList tbody tr').evaluateAll(es=>es.map(e=>e.innerText.replace(/\s+/g,' ').trim()));
  assert.equal(rows.length,3,rows.join(' | '));
  assert.ok(rows.some(r=>/^Olive Own .*26 Oct . 25 Nov 2026 Oct 26 \$15$/.test(r)),rows.join(' | '));
  assert.ok(rows.some(r=>/^Pete Prorated .*26 Oct . 14 Nov 2026 Oct 26 \$/.test(r)),rows.join(' | '));
  assert.ok(rows.some(r=>/^Pete Prorated .*15 Nov . 14 Dec 2026 Nov 15 \$15$/.test(r)),rows.join(' | '));
  assert.match(norm(await page.locator('#oweList h4').textContent()),/^Who owes and for which period · 3 bills · /);
  await page.screenshot({path:path.join(out,'owe-list-390.png')});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no sideways scroll with the owe list');
  check('Owe money lists 3 bills: Olive 26 Oct - 25 Nov due Oct 26 $15 (own start date), Pete\'s prorated 26 Oct - 14 Nov and his 15 Nov - 14 Dec due Nov 15 $15');

  // 2. "edit days / rate" opens Set bill on the service-dates mode (it threw before)
  await page.locator('#oweList [data-owe-open=o2]').first().click();await page.waitForTimeout(600);
  await page.locator('tr.detail[data-id=o2] button',{hasText:'edit days / rate'}).first().click();
  const bd=page.locator('#billDialog');await bd.waitFor();assert.equal(await page.locator('#bill-mode').inputValue(),'days');assert.equal(await page.locator('#bill-period').inputValue(),'2026-10-15');
  check('"edit days / rate" on a prorated first bill opens Set bill for that bill with "Charge for selected service dates"');

  // 3. Set bill: keep the charge, move the due date to Nov 30
  await page.locator('#bill-mode').selectOption('keep');await page.locator('#bill-due').fill('2026-11-30');await page.locator('#bill-due').dispatchEvent('input');
  assert.match(await page.locator('#bill-preview').textContent(),/Payment due: Nov 30, 2026 \(set by hand\)/);
  await page.locator('#bill-save').click();await until(async()=>!(await bd.isVisible()),'bill dialog closed');
  const s2=(await doc('users/o2')).subscriptions[0];assert.deepEqual(s2.dueOn,{'2026-10-15':'2026-11-30'});assert.equal(Object.keys(s2.periodOverrides||{}).length,0);
  await page.waitForTimeout(600);const rows2=await page.locator('#oweList tbody tr').evaluateAll(es=>es.map(e=>e.innerText.replace(/\s+/g,' ').trim()));
  assert.equal(rows2.length,2,rows2.join(' | '));assert.ok(!rows2.some(r=>/26 Oct . 14 Nov/.test(r)),rows2.join(' | '));
  check('Set bill with "Keep the charge as it is" and Payment due on Nov 30 stores only the due date; that bill leaves the Owe money list');

  // 4. Add user: direct customers get "Renews on its own start date"; picking a wholesaler unticks it; the cost keeps the product's 15th
  await page.locator('#btn-add').click();await page.locator('#a-name').fill('Nina New');await page.locator('#a-pkg').selectOption('pkg_cmax');await page.waitForTimeout(300);
  assert.equal(await page.locator('#a-own').isChecked(),true,'direct: own start date ticked');
  await page.locator('#a-ws').selectOption('ws_a');await page.waitForTimeout(200);assert.equal(await page.locator('#a-own').isChecked(),false,'wholesaler: product date');
  await page.locator('#a-ws').selectOption('');await page.waitForTimeout(200);assert.equal(await page.locator('#a-own').isChecked(),true,'direct again');
  await page.locator('#a-start').fill('2026-11-05');await page.locator('#a-price').fill('15');await page.locator('#a-cur').selectOption('USD');
  await page.locator('#addForm input[name=a-paid][value=no]').check();await page.locator('#addForm button[type=submit]').click();
  let nu=null;await until(async()=>{const d=(((await api('GET','/api/docs?prefix=users/')).j||{}).docs||[]).find(x=>x.data.name==='Nina New');nu=d&&d.data;return !!nu;},'Nina saved');
  const ns=nu.subscriptions[0];assert.equal(ns.ownStart,true);assert.equal(ns.anchor,'2026-11-05');assert.equal(ns.accountCost.anchor,'2026-10-15');
  await page.waitForTimeout(800);
  const cost=await page.locator('tr').evaluateAll(es=>es.map(e=>e.innerText.replace(/\s+/g,' ')).filter(t=>/Nina New/.test(t)&&/cycle cost/.test(t)));
  assert.equal(cost.length,2,cost.join(' | '));assert.ok(cost.some(c=>/^2026-11-05 .*\$5\b/.test(c)),cost.join(' | '));assert.ok(cost.some(c=>/^2026-11-15 .*\$15\b/.test(c)),cost.join(' | '));
  check('Add user: a direct customer renews on its start date (Nov 5) while its $15 supplier cost keeps the product\'s 15th: $5 for Nov 5 - Nov 14, then $15 on Nov 15; a wholesaler\'s customer is left on the product date');

  // 5. layout
  await page.locator('#payStrip [data-pf=owes]').click().catch(()=>{});
  for(const [w,h,scheme] of [[390,844,'dark'],[1400,900,'light'],[1400,900,'dark']]){await page.setViewportSize({width:w,height:h});await page.emulateMedia({colorScheme:scheme});await page.waitForTimeout(300);
    await page.screenshot({path:path.join(out,`owe-${w}-${scheme}.png`)});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`no sideways scroll at ${w} ${scheme}`);}
  check('no sideways scroll at 390px and 1400px in light and dark');
  assert.deepEqual(errors,[]);check('No console or page errors');
  fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({version:'76',checks},null,2));console.log('direct-own-start-flow: '+checks.length+' checks passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
