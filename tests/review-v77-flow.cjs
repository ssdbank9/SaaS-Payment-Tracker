// v77: fixes from the v76 end-of-day review. A renewal-date change keeps what was set on each bill (agreed amount, hand-set due date);
// the wholesaler statement lists a bill due today when an older bill has a later due date, and one-time items still owed; "Pays on day"
// refuses 32; "Overdue since" names the day the bill was due (not before the customer started); a product without a cycle date takes the
// first own-start customer's day; Set bill names no bill after the plan's end; the Owe money table fits a phone.
// Synthetic records on a disposable server only:
//   WASOOLI_TEST_URL=http://127.0.0.1:<port> node tests/review-v77-flow.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const stubWebFonts=require('./webfonts.cjs');

const base=process.env.WASOOLI_TEST_URL||'http://127.0.0.1:8098',H={'X-Requested-With':'wasool','Content-Type':'application/json'},checks=[];
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).protocol,'http:');
const out=path.resolve(process.env.WASOOLI_TEST_OUTPUT||'data/review-v77-qa');fs.mkdirSync(out,{recursive:true});
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
  await api('PATCH','/api/docs/settings/main',{packages:st.packages.map(p=>p.id==='pkg_cmax'?{...p,cycleStart:'2026-10-15',price:15,currency:'USD'}:p).concat([{id:'pkg_new',name:'NewTool',cycle:'yearly',price:12000,currency:'PKR',description:'',fresh:true}]),
    wholesalers:[{id:'ws_a',name:'Some Seller',phone:'918200000001',notes:''}]});
  for(const d of (((await api('GET','/api/docs?prefix=users/')).j||{}).docs||[]))await api('DELETE','/api/docs/'+d.path);
  const plan=(start,anchor,x)=>({id:'s1',kind:'monthly',cycle:'monthly',name:'',packageId:'pkg_cmax',currency:'USD',start,anchor,prorate:false,prices:[{from:start,price:15}],payments:[],...(x||{})});
  await api('POST','/api/import',{docs:{
   'users/r1':{name:'Rita Agreed',phone:'923001234561',joinDate:'2026-10-26',subscriptions:[plan('2026-10-26','2026-10-26',{ownStart:true,periodOverrides:{'2026-10-26':{amount:10,note:'agreed',at:'2026-10-26'}},payments:[{id:'p1',date:'2026-10-26',amount:10,currency:'USD',rate:null,note:''}]})]},
   'users/r2':{name:'Rob Due',phone:'923001234562',joinDate:'2026-10-26',subscriptions:[plan('2026-10-26','2026-10-26',{ownStart:true,dueOn:{'2026-10-26':'2026-11-30'}})]},
   'users/r3':{name:'Ruth Ending',phone:'923001234563',joinDate:'2026-10-26',subscriptions:[plan('2026-10-26','2026-10-26',{ownStart:true,end:'2026-11-25'})]},
   'users/c1':{name:'Cal Later',wholesalerId:'ws_a',joinDate:'2026-10-15',subscriptions:[plan('2026-10-15','2026-10-15',{dueOn:{'2026-10-15':'2026-11-30'}})]},
   'users/c2':{name:'Cora Item',wholesalerId:'ws_a',joinDate:'2026-11-01',subscriptions:[{id:'s1',kind:'one-time',name:'Setup',currency:'PKR',total:1000,due:'2026-11-10',payments:[]}]},
   'users/c3':{name:'Cy Started',wholesalerId:'ws_a',joinDate:'2026-11-05',subscriptions:[plan('2026-11-05','2026-10-15')]},
   'users/f1':{name:'First Fresh',phone:'923001234564',joinDate:'2026-10-10',subscriptions:[{id:'s1',kind:'monthly',cycle:'yearly',name:'',packageId:'pkg_new',currency:'PKR',start:'2026-10-10',anchor:'2026-10-10',ownStart:true,prorate:true,paymentEvery:12,prices:[{from:'2026-10-10',price:12000}],payments:[]}]},
  },replace:[]});
  await reload();
  assert.equal(await page.locator('#app-ver').textContent(),'v83');

  // 1. "Overdue since" is the bill's due day
  assert.match(await pill('c3'),/^Overdue since Nov 5/);assert.match(await pill('r1'),/^Paid to Nov 25/);assert.match(await pill('r2'),/^Pays Nov 30/);
  check('a wholesaler\'s customer who started Nov 5 on the Oct 15 cycle reads "Overdue since Nov 5", not Oct 15');

  // 2. renewal-date change keeps the agreed amount and the hand-set due date on the same bill
  const editPlan=async uid=>{const dd=await expand(uid);await dd.locator('[data-key="edit:s1"]').first().click();const f=dd.locator('form.subedit-form[data-sub=s1]');await f.waitFor({state:'visible'});return f;};
  for(const id of ['r1','r2']){const f=await editPlan(id);await f.locator('[name=renewOn]').selectOption('date');await f.locator('[name=renewDate]').fill('2026-11-20');await f.locator('button[type=submit]').click();
    await until(async()=>((await doc('users/'+id)).subscriptions[0].anchor==='2026-11-20'),id+' saved');await page.waitForTimeout(600);}
  const s1=(await doc('users/r1')).subscriptions[0],s2=(await doc('users/r2')).subscriptions[0];
  assert.deepEqual(Object.keys(s1.periodOverrides),['2026-10-20']);assert.equal(s1.periodOverrides['2026-10-20'].amount,10);assert.deepEqual(s2.dueOn,{'2026-10-20':'2026-11-30'});
  await reload();assert.match(await pill('r1'),/^Paid to Nov 19/);assert.match(await pill('r2'),/^Pays Nov 30/);
  check('moving the renewal date to the 20th keeps the agreed $10 first bill (still "Paid", now to Nov 19) and the Nov 30 due date on the first bill');

  // 3. wholesaler statement: a bill due today behind a later hand-set date, and a one-time item
  if(await page.locator('#remindRun').isHidden())await page.locator('#btn-reminders').click();await page.locator('#rr-body #ws-sec').waitFor();
  const msg=await page.locator('#ws-sec .ws-q[data-ws=ws_a][data-kind=due] .qmsg').textContent();
  assert.ok(msg.includes('- Cal Later · '),msg);assert.ok(/- Cal Later · [^\n]*\$15\b/.test(msg),msg);assert.ok(/- Cora Item · [^\n]*Rs 1,000/.test(msg),msg);assert.ok(msg.includes('- Cy Started · '),msg);
  await page.locator('#btn-reminders').click();
  check('the wholesaler statement asks for Cal Later\'s $15 due today (his older bill is due Nov 30) and Cora Item\'s Rs 1,000 one-time item');

  // 4. Pays on day 32 is refused and nothing is saved
  await page.locator('#btn-settings').click();await page.waitForTimeout(400);if(!(await page.locator('#wsList').isVisible()))await page.locator('#s-show-all').click();await page.locator('#wsList').waitFor();
  const pd=page.locator('#wsList .ws-row[data-id=ws_a] [data-w=payDay]');await pd.fill('32');await pd.dispatchEvent('input');await page.locator('[data-save-setting=wholesalers]').click();await page.waitForTimeout(800);
  assert.ok((await page.locator('body').innerText()).includes('Pays on day must be a whole number from 1 to 31, or blank.'));
  assert.equal(((await doc('settings/main')).wholesalers.find(w=>w.id==='ws_a')||{}).payDay,undefined);
  await pd.fill('20');await pd.dispatchEvent('input');await page.locator('[data-save-setting=wholesalers]').click();
  await until(async()=>((await doc('settings/main')).wholesalers.find(w=>w.id==='ws_a')||{}).payDay===20,'payDay 20 saved');
  await page.locator('#btn-settings').click();
  check('Settings refuses "Pays on day" 32 with a message and keeps the stored value; 20 then saves');

  // 5. a product without a cycle date takes the first own-start customer's day for a wholesaler's customer
  await reload();await page.locator('#btn-add').click();await page.locator('#a-name').fill('Wes Wholesale');await page.locator('#a-pkg').selectOption('pkg_new');await page.waitForTimeout(300);
  await page.locator('#a-ws').selectOption('ws_a');await page.waitForTimeout(200);await page.locator('#a-start').fill('2026-11-15');await page.locator('#a-price').fill('12000');await page.locator('#a-cur').selectOption('PKR');
  await page.locator('#addForm input[name=a-paid][value=no]').check();await page.locator('#addForm button[type=submit]').click();
  let nu=null;await until(async()=>{const d=(((await api('GET','/api/docs?prefix=users/')).j||{}).docs||[]).find(x=>x.data.name==='Wes Wholesale');nu=d&&d.data;return !!nu;},'Wes saved');
  assert.equal(nu.subscriptions[0].anchor,'2026-10-10');assert.notEqual(nu.subscriptions[0].ownStart,true);
  check('NewTool has no cycle date: a wholesaler\'s customer added on Nov 15 follows the first direct customer\'s day, Oct 10 (not the hidden Jul 24)');

  // 6. Set bill names no bill after the plan's end
  await reload();const d3=await expand('r3');await d3.locator('.row-bill').click();await page.locator('#billDialog[open]').waitFor();
  await page.locator('#bill-mode').selectOption('keep');await page.waitForTimeout(200);
  assert.match(await page.locator('#bill-preview').textContent(),/Next bill: none \(the plan ends on Nov 25, 2026\)\./);
  await page.locator('#bill-cancel, #billDialog button[value=cancel], #billDialog [data-act=cancel]').first().click().catch(async()=>{await page.keyboard.press('Escape');});
  check('Set bill on the last bill of a plan ending Nov 25 says "Next bill: none"');

  // 7. Owe money table fits 390px
  await reload();await page.locator('#payStrip [data-pf=owes]').click();await page.locator('#oweList table').waitFor();
  const fit=await page.evaluate(()=>{const w=document.querySelector('#oweList .table-wrap'),t=w.querySelector('table');return t.scrollWidth<=w.clientWidth+1;});assert.equal(fit,true,'owe table fits');
  await page.screenshot({path:path.join(out,'owe-390.png')});
  for(const [w,h,scheme] of [[390,844,'dark'],[1400,900,'light']]){await page.setViewportSize({width:w,height:h});await page.emulateMedia({colorScheme:scheme});await page.waitForTimeout(300);
    await page.screenshot({path:path.join(out,`owe-${w}-${scheme}.png`)});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`no sideways scroll at ${w} ${scheme}`);}
  check('the Owe money table fits 390px without swiping (plan under the name); no sideways scroll at 390 dark and 1400 light');
  assert.deepEqual(errors,[]);check('No console or page errors');
  fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({version:'78',checks},null,2));console.log('review-v77-flow: '+checks.length+' checks passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
