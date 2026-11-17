// v76: a wholesaler may pay on a chosen day of the month (Settings "Pays on day"): each bill of its customers is due on that day (after the
// cycle starts, or after it ends for a wholesaler that pays at the end). Edit plan "Renews on" offers "Another date I choose": the plan's
// bills run from that date, it can be changed again later, and the supplier cost keeps the product's date.
// Synthetic records on a disposable server only:
//   WASOOLI_TEST_URL=http://127.0.0.1:<port> node tests/pay-day-flow.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const stubWebFonts=require('./webfonts.cjs');

const base=process.env.WASOOLI_TEST_URL||'http://127.0.0.1:8098',H={'X-Requested-With':'wasool','Content-Type':'application/json'},checks=[];
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).protocol,'http:');
const out=path.resolve(process.env.WASOOLI_TEST_OUTPUT||'data/pay-day-qa');fs.mkdirSync(out,{recursive:true});
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
  const det=id=>page.locator('tr.detail[data-id="'+id+'"]');
  const expand=async id=>{if(!(await det(id).count()))await page.locator('tr.row[data-id="'+id+'"]').click();await det(id).waitFor();return det(id);};
  const pill=async id=>norm(await page.locator(`#tbody tr.row[data-id=${id}] .m-st`).first().textContent());
  const reload=async()=>{await page.reload();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);};
  await until(async()=>((await doc('meta/schema'))||{}).version>=12,'the settings repair');
  const st=await doc('settings/main');
  await api('PATCH','/api/docs/settings/main',{packages:st.packages.map(p=>p.id==='pkg_cmax'?{...p,cycleStart:'2026-10-15',price:15,currency:'USD'}:p),
    wholesalers:[{id:'ws_s',name:'Start Seller',phone:'918200000001',notes:''},{id:'ws_e',name:'End Seller',phone:'918200000002',notes:'',payAt:'end',payDay:20}]});
  for(const d of (((await api('GET','/api/docs?prefix=users/')).j||{}).docs||[]))await api('DELETE','/api/docs/'+d.path);
  const plan=(start,anchor,x)=>({id:'s1',kind:'monthly',cycle:'monthly',name:'',packageId:'pkg_cmax',currency:'USD',start,anchor,prorate:false,prices:[{from:start,price:15}],payments:[],...(x||{})});
  await api('POST','/api/import',{docs:{
   'users/w1':{name:'Will Start',wholesalerId:'ws_s',joinDate:'2026-10-15',subscriptions:[plan('2026-10-15','2026-10-15')]},
   'users/w2':{name:'Ella End',wholesalerId:'ws_e',joinDate:'2026-10-15',subscriptions:[plan('2026-10-15','2026-10-15')]},
   'users/o1':{name:'Olga Own',phone:'923001234561',joinDate:'2026-10-26',subscriptions:[plan('2026-10-26','2026-10-26',{ownStart:true,accountCost:{entries:[{amount:15,currency:'USD',from:'2026-10-26',paidIn:'USD',rate:null,supplier:''}],first:'prorated30',frequency:'monthly',anchor:'2026-10-15',overrides:{}}})]},
  },replace:[]});
  await reload();
  assert.equal(await page.locator('#app-ver').textContent(),'v81');

  // 1. Settings: type 20 in Start Seller's "Pays on day" and save
  assert.match(await pill('w1'),/^Overdue since Oct 15/);
  await page.locator('#btn-settings').click();await page.waitForTimeout(400);if(!(await page.locator('#wsList').isVisible()))await page.locator('#s-show-all').click();await page.locator('#wsList').waitFor();
  assert.equal(await page.locator('#wsList .ws-row[data-id=ws_e] [data-w=payDay]').inputValue(),'20');
  const pd=page.locator('#wsList .ws-row[data-id=ws_s] [data-w=payDay]');assert.equal(await pd.inputValue(),'');await pd.fill('20');await pd.dispatchEvent('input');
  await page.locator('[data-save-setting=wholesalers]').click();
  await until(async()=>((await doc('settings/main')).wholesalers.find(w=>w.id==='ws_s')||{}).payDay===20,'payDay saved');
  check('Settings: each wholesaler has "Pays on day"; 20 typed for Start Seller is saved as payDay 20');

  // 2. statuses and the owe list follow the pay day
  await reload();
  assert.match(await pill('w1'),/^Overdue since Oct 20/);assert.match(await pill('w2'),/^Pays Nov 20/);
  await page.locator('#payStrip [data-pf=owes]').click();await page.locator('#oweList table').waitFor();
  const rows=await page.locator('#oweList tbody tr').evaluateAll(es=>es.map(e=>e.innerText.replace(/\s+/g,' ').trim()));
  assert.ok(rows.some(r=>/^Will Start .*15 Oct . 14 Nov 2026 Oct 20 \$15$/.test(r)),rows.join(' | '));assert.ok(!rows.some(r=>/^Ella End/.test(r)),rows.join(' | '));
  await page.locator('#payStrip [data-pf=owes]').click().catch(()=>{});
  check('pay day 20: Start Seller\'s customer is "Overdue since Oct 20" and listed under Owe money due Oct 20; End Seller\'s customer (pays at the end) reads "Pays Nov 20" and owes nothing yet');

  // 3. Edit plan: Renews on -> Another date I choose -> Nov 20
  const editPlan=async uid=>{const dd=await expand(uid);await dd.locator('[data-key="edit:s1"]').first().click();const f=dd.locator('form.subedit-form[data-sub=s1]');await f.waitFor({state:'visible'});return f;};
  let f=await editPlan('o1');assert.equal(await f.locator('[name=renewOn]').inputValue(),'own');assert.equal(await f.locator('[data-role=renew-date]').isHidden(),true);
  await f.locator('[name=renewOn]').selectOption('date');assert.equal(await f.locator('[data-role=renew-date]').isVisible(),true);
  await f.locator('[name=renewDate]').fill('2026-11-20');await f.locator('button[type=submit]').click();
  await until(async()=>((await doc('users/o1')).subscriptions[0].anchor==='2026-11-20'),'anchor saved');
  let s=(await doc('users/o1')).subscriptions[0];assert.equal(s.ownDate,true);assert.equal(s.ownStart,undefined);assert.equal(s.accountCost.anchor,'2026-10-15');
  await page.waitForTimeout(800);let d=await expand('o1');assert.match(norm(await d.textContent()),/renews on the 20th of each month \(a date you set\)/);
  check('Edit plan "Another date I choose" Nov 20: the plan renews on the 20th (a date you set) and its supplier cost stays on the 15th');

  // 4. the date is not fixed: change it again to Nov 5
  f=await editPlan('o1');assert.equal(await f.locator('[name=renewOn]').inputValue(),'date');assert.equal(await f.locator('[name=renewDate]').inputValue(),'2026-11-20');
  await f.locator('[name=renewDate]').fill('2026-11-05');await f.locator('button[type=submit]').click();
  await until(async()=>((await doc('users/o1')).subscriptions[0].anchor==='2026-11-05'),'anchor changed');
  s=(await doc('users/o1')).subscriptions[0];assert.equal(s.ownDate,true);assert.equal(s.accountCost.anchor,'2026-10-15');
  await page.waitForTimeout(800);d=await expand('o1');assert.match(norm(await d.textContent()),/renews on the 5th of each month \(a date you set\)/);
  check('the date can be changed again (Nov 20 to Nov 5); the cost still stays on the 15th');

  // 5. layout
  for(const [w,h,scheme] of [[390,844,'dark'],[1400,900,'light']]){await page.setViewportSize({width:w,height:h});await page.emulateMedia({colorScheme:scheme});await page.waitForTimeout(300);
    await page.screenshot({path:path.join(out,`pay-day-${w}-${scheme}.png`)});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`no sideways scroll at ${w} ${scheme}`);}
  check('no sideways scroll at 390px dark and 1400px light');
  assert.deepEqual(errors,[]);check('No console or page errors');
  fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({version:'78',checks},null,2));console.log('pay-day-flow: '+checks.length+' checks passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
