// v70: a wholesaler who pays at the end of each cycle (Settings, Wholesalers, "Pays you") owes each period on the day after it ends, so a
// running period is not overdue; a direct customer on the same plan still owes from the start. A yearly seat cost on a supplier year
// (product "Cost is per Year", "Supplier year starts on") is one cost line from the join date, prorated by actual days to the end of that year,
// and Add user gives a new plan that supplier year. Synthetic records on a disposable server only:
//   WASOOLI_TEST_URL=http://127.0.0.1:<port> node tests/pay-at-end-flow.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const stubWebFonts=require('./webfonts.cjs');

const base=process.env.WASOOLI_TEST_URL||'http://127.0.0.1:8098',H={'X-Requested-With':'wasool','Content-Type':'application/json'},checks=[];
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).protocol,'http:');
const out=path.resolve(process.env.WASOOLI_TEST_OUTPUT||'data/pay-at-end-qa');fs.mkdirSync(out,{recursive:true});
const check=n=>{checks.push(n);console.log('PASS '+n);};
const norm=s=>String(s).replace(/\s+/g,' ').trim();
const plan=(start,extra)=>({id:'s1',kind:'monthly',cycle:'monthly',name:'',packageId:'pkg_cmax',currency:'USD',start,anchor:'2026-10-15',prorate:false,prices:[{from:start,price:13}],payments:[],...(extra||{})});
const yearCost={frequency:'yearly',anchor:'2026-07-24',first:'prorated',entries:[{from:'2026-11-15',amount:96,currency:'USD',rate:null,paidIn:'PKR',supplier:''}],overrides:{}};
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
  await api('PATCH','/api/docs/settings/main',{rate:280,pkrCostTax:5.2,wsSent:{},wsRemindDays:3,
    packages:st.packages.map(p=>p.id==='pkg_cmax'?{...p,cycleStart:'2026-10-15'}:p.id==='pkg_g'?{...p,cycleStart:'2026-07-24',price:48000,currency:'PKR',costAmount:96,costCurrency:'USD',costPaidIn:'PKR',costFirst:'prorated',costPer:'year'}:p),
    wholesalers:[{id:'ws_e',name:'End Payer',phone:'918200000001',notes:'',payAt:'end'},{id:'ws_s',name:'Start Payer',phone:'8801700000002',notes:''}]});
  for(const d of (((await api('GET','/api/docs?prefix=users/')).j||{}).docs||[]))await api('DELETE','/api/docs/'+d.path);
  await api('POST','/api/import',{docs:{
   'users/e1':{name:'End Unpaid',wholesalerId:'ws_e',joinDate:'2026-10-20',subscriptions:[plan('2026-10-20')]},
   'users/e2':{name:'End Paid',wholesalerId:'ws_e',joinDate:'2026-10-20',subscriptions:[plan('2026-10-20',{payments:[{id:'p1',date:'2026-11-15',amount:13,currency:'USD',rate:null,note:''}]})]},
   'users/e3':{name:'End New',wholesalerId:'ws_e',joinDate:'2026-11-15',subscriptions:[plan('2026-11-15')]},
   'users/s1':{name:'Start Unpaid',wholesalerId:'ws_s',joinDate:'2026-10-20',subscriptions:[plan('2026-10-20')]},
   'users/d1':{name:'Direct Unpaid',phone:'923001234567',joinDate:'2026-10-20',subscriptions:[plan('2026-10-20')]},
   'users/y1':{name:'Year Seat',phone:'923001234568',joinDate:'2026-11-15',subscriptions:[{id:'s1',kind:'monthly',cycle:'yearly',name:'',packageId:'pkg_g',currency:'PKR',start:'2026-11-15',end:'2027-07-23',anchor:'2026-11-15',ownStart:true,prorate:false,paymentEvery:1,prices:[{from:'2026-11-15',price:48000}],payments:[{id:'p2',date:'2026-11-15',amount:4000,currency:'PKR',rate:null,note:''}],accountCost:yearCost}]},
  },replace:[]});
  await page.reload();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  assert.equal(await page.locator('#app-ver').textContent(),'v85');
  const pill=async id=>norm(await page.locator(`#tbody tr.row[data-id=${id}] .m-st`).first().textContent());

  // 1. statuses: an end-of-cycle wholesaler's customer owes the Oct 15 - Nov 14 period on Nov 15, not since its start
  assert.match(await pill('e1'),/^Due today/);assert.match(await pill('e2'),/^Paid to Nov 14/);assert.match(await pill('e3'),/^Pays Dec 15/);
  assert.match(await pill('s1'),/^Overdue since Oct 20/);assert.match(await pill('d1'),/^Overdue since Oct 20/);/* v77: the day the bill was due (their start) */
  const owes=async id=>norm(await page.locator(`#tbody tr.row[data-id=${id}]`).first().innerText());
  assert.match(await owes('e1'),/\$13\b/);assert.ok(!/\$26/.test(await owes('e1')));assert.match(await owes('d1'),/\$26/);
  check('pays at the end: Oct 20 customer "Due today" $13 (the Oct 15 - Nov 14 period, due Nov 15), the paid one "Paid to Nov 14", a Nov 15 starter "Pays Dec 15"; the start-of-cycle wholesaler and the direct customer stay "Overdue since Oct 20" (their start) with $26');

  // 2. the wholesaler statement lists only the period that has ended
  if(await page.locator('#remindRun').isHidden())await page.locator('#btn-reminders').click();await page.locator('#rr-body #ws-sec').waitFor();
  const due=page.locator('#ws-sec .ws-q[data-ws=ws_e][data-kind=due]');assert.equal(await due.count(),1);
  assert.match(norm(await due.locator('.due').textContent()),/^Due now · 1 account · \$13$/);
  assert.ok((await due.locator('.qmsg').textContent()).includes('- End Unpaid · '),'End Unpaid listed');
  assert.equal(await page.locator('#ws-sec .ws-q[data-ws=ws_e][data-kind=soon]').count(),0);
  assert.match(norm(await page.locator('#ws-sec .ws-q[data-ws=ws_s][data-kind=due] .due').textContent()),/^Due now · 1 account · \$26$/);
  check('the End Payer statement says "Due now · 1 account · $13" and nothing renews soon; the Start Payer statement still asks $26');

  // 3. on Dec 12 the end-of-cycle statement turns to "due soon" for the Dec 15 payment
  await page.evaluate(()=>localStorage.setItem('pt-today','2026-12-12'));await api('PUT','/api/docs/users/e1',{...(await doc('users/e1')),subscriptions:[plan('2026-10-20',{payments:[{id:'p3',date:'2026-11-15',amount:13,currency:'USD',rate:null,note:''}]})]});
  await page.reload();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  if(await page.locator('#remindRun').isHidden())await page.locator('#btn-reminders').click();await page.locator('#rr-body #ws-sec').waitFor();
  const soon=page.locator('#ws-sec .ws-q[data-ws=ws_e][data-kind=soon]');assert.equal(await soon.count(),1);
  const sm=await soon.locator('.qmsg').textContent();assert.ok(sm.startsWith('Hi End Payer, 3 accounts are due soon:\n'),sm);assert.ok(sm.includes('· $13 · due Dec 15'),sm);
  assert.equal(await page.locator('#ws-sec .ws-q[data-ws=ws_e][data-kind=due]').count(),0);
  await page.evaluate(()=>localStorage.setItem('pt-today','2026-11-15'));
  check('on Dec 12 the End Payer statement reads "3 accounts are due soon" with each $13 due Dec 15, and no Due now row');

  // 4. the yearly seat cost: one line on the join date, $96 x 251/365 days = $66.02, at Rs 280 plus 5.2% tax
  await page.reload();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  const costRows=await page.locator('tr').evaluateAll(es=>es.map(e=>e.innerText.replace(/\s+/g,' ')).filter(t=>/Year Seat/.test(t)&&/cycle cost/.test(t)));
  assert.equal(costRows.length,1,costRows.join(' | '));assert.match(costRows[0],/^2026-11-15 /);assert.match(costRows[0],/Rs 18,485\.6\b|Rs 18,485\.60/);assert.match(costRows[0],/Rs 961\.25/);
  check('Year Seat (joined Nov 15, supplier year Jul 24 - Jul 23) has one cost line dated 2026-11-15: $66.02 = Rs 18,485.60 plus Rs 961.25 tax');

  // 5. Settings shows "Supplier year starts on" for a yearly product costed per year and saves it
  await page.locator('#btn-settings').click();const row=page.locator('#pkgList .pkg-row[data-id=pkg_g]');await row.waitFor();
  const ys=row.locator('[data-f=costStart]');assert.equal(await ys.count(),1);await ys.fill('2026-07-24');await ys.dispatchEvent('input');
  const wsSel=page.locator('#wsList .ws-row[data-id=ws_s] [data-w=payAt]');assert.equal(await wsSel.inputValue(),'');
  assert.equal(await page.locator('#wsList .ws-row[data-id=ws_e] [data-w=payAt]').inputValue(),'end');
  await page.locator('[data-save-setting=packages]').click();
  await until(async()=>((await doc('settings/main')).packages.find(p=>p.id==='pkg_g')||{}).costStart==='2026-07-24','costStart saved');
  check('Settings: the yearly product costed per year has "Supplier year starts on" and saves it; the End Payer row shows "At the end of each cycle"');

  // 6. Add user on that product: the new plan's yearly cost follows the supplier year
  await page.locator('#btn-add').click();await page.locator('#a-name').fill('New Seat');await page.locator('#a-pkg').selectOption('pkg_g');await page.waitForTimeout(300);
  await page.locator('#a-start').fill('2026-11-15');await page.locator('#a-price').fill('48000');await page.locator('#a-cur').selectOption('PKR');
  await page.locator('#addForm input[name=a-paid][value=no]').check();await page.locator('#addForm button[type=submit]').click();
  let nu=null;await until(async()=>{const d=(((await api('GET','/api/docs?prefix=users/')).j||{}).docs||[]).find(x=>x.data.name==='New Seat');nu=d&&d.data;return !!nu;},'New Seat saved');
  const ac=nu.subscriptions[0].accountCost;assert.ok(ac,'cost set');assert.equal(ac.frequency,'yearly');assert.equal(ac.anchor,'2026-07-24');assert.equal(ac.entries[0].amount,96);assert.equal(ac.first,'prorated');
  check('Add user on the yearly product saves a $96 yearly cost on the supplier year from Jul 24 (prorated by actual days)');

  // 7. layout
  await page.locator('#btn-settings').click();await page.waitForTimeout(400);if(!(await page.locator('#wsList').isVisible()))await page.locator('#s-show-all').click();await page.locator('#wsList').waitFor();
  for(const [w,h,scheme] of [[390,844,'light'],[390,844,'dark'],[1400,900,'light'],[1400,900,'dark']]){await page.setViewportSize({width:w,height:h});await page.emulateMedia({colorScheme:scheme});await page.waitForTimeout(300);
    await page.locator('#wsList').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`wholesalers-${w}-${scheme}.png`),fullPage:false});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`no sideways scroll at ${w} ${scheme}`);}
  check('Settings fits at 390px and 1400px in light and dark with no sideways scroll');
  assert.deepEqual(errors,[]);check('No console or page errors');
  fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({version:'78',checks},null,2));console.log('pay-at-end-flow: '+checks.length+' checks passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
