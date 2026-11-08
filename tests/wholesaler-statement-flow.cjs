// v67: one Queue statement per wholesaler. "Due now" lists the wholesaler's accounts with money due (from each product's cycle day until paid),
// "Renews soon" the accounts renewing within the Settings days; WhatsApp opens the wholesaler's number with the text, the Sent tick is saved in
// settings.wsSent and counted in the badge; a wholesaler's customers leave the per-customer Queue lists; "New cost applies from" is shown only
// in Edit plan when a supplier cost already exists. Synthetic records on a disposable server only:
//   WASOOLI_TEST_URL=http://127.0.0.1:<port> node tests/wholesaler-statement-flow.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const stubWebFonts=require('./webfonts.cjs');

const base=process.env.WASOOLI_TEST_URL||'http://127.0.0.1:8098',H={'X-Requested-With':'wasool','Content-Type':'application/json'},checks=[];
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).protocol,'http:');
const out=path.resolve(process.env.WASOOLI_TEST_OUTPUT||'data/wholesaler-statement-qa');fs.mkdirSync(out,{recursive:true});
const check=n=>{checks.push(n);console.log('PASS '+n);};
const norm=s=>String(s).replace(/\s+/g,' ').trim();
const plan=(start,price,extra)=>({id:'s1',kind:'monthly',cycle:'monthly',name:'',packageId:'pkg_cmax',currency:'USD',start,anchor:'2026-10-15',prorate:false,prices:[{from:'2026-10-15',price}],payments:[],...(extra||{})});
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--disable-gpu']});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await stubWebFonts(ctx);await ctx.addInitScript(()=>{if(!localStorage.getItem('pt-today'))localStorage.setItem('pt-today','2026-11-13');});
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(base+'/login',{waitUntil:'domcontentloaded'});await page.locator('[name=passcode]').fill('test1234');await page.locator('button[type=submit]').click();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  const api=async(method,pth,data)=>{const r=await ctx.request.fetch(base+pth,{method,headers:H,data:data===undefined?undefined:JSON.stringify(data)});let j=null;try{j=await r.json();}catch(e){}return {status:r.status(),j};};
  const doc=async p=>((await api('GET','/api/docs/'+p)).j||{}).data;
  const until=async(fn,what)=>{for(let i=0;i<60;i++){if(await fn())return;await page.waitForTimeout(250);}throw new Error('timed out waiting for '+what);};
  // known records: a wholesaler, a product on the 15th, three of its customers (two unpaid, one paid to Nov 14) and a direct customer on the same cycle
  const st=await doc('settings/main');const maxName=st.packages.find(p=>p.id==='pkg_cmax').name;
  await api('PATCH','/api/docs/settings/main',{packages:st.packages.map(p=>p.id==='pkg_cmax'?{...p,cycleStart:'2026-10-15'}:p),wholesalers:[{id:'ws_a',name:'Test Wholesaler A',phone:'8801700000001',notes:''}],wsSent:{}});
  for(const d of (((await api('GET','/api/docs?prefix=users/')).j||{}).docs||[]))await api('DELETE','/api/docs/'+d.path);
  await api('POST','/api/import',{docs:{
   'users/wa1':{name:'Alpha One',wholesalerId:'ws_a',joinDate:'2026-10-24',subscriptions:[plan('2026-10-24',63)]},
   'users/wa2':{name:'Beta Two',wholesalerId:'ws_a',joinDate:'2026-10-15',subscriptions:[plan('2026-10-15',63,{payments:[{id:'p1',date:'2026-10-15',amount:63,currency:'USD',rate:null,note:''}]})]},
   'users/wa3':{name:'Gamma Three',wholesalerId:'ws_a',joinDate:'2026-10-19',subscriptions:[plan('2026-10-19',70,{accountCost:{frequency:'monthly',first:'prorated30',entries:[{from:'2026-10-19',amount:15,currency:'USD',rate:null,paidIn:'PKR',supplier:''}],overrides:{}}})]},
   'users/d1':{name:'Direct Dan',phone:'923001234567',joinDate:'2026-10-15',subscriptions:[plan('2026-10-15',63)]},
  },replace:[]});
  await page.reload();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  assert.equal(await page.locator('#app-ver').textContent(),'v67');
  const openQueue=async()=>{if(await page.locator('#remindRun').isHidden())await page.locator('#btn-reminders').click();await page.locator('#rr-body #ws-sec').waitFor();};
  const row=k=>page.locator(`#ws-sec .ws-q[data-kind=${k}]`);

  // 1. the Wholesalers section: one "Due now" statement with both unpaid accounts, the total and the WhatsApp link to the wholesaler
  await openQueue();
  assert.equal(norm(await page.locator('#ws-sec h4').textContent()),'Wholesalers · 2');
  assert.equal(await row('due').count(),1);assert.match(norm(await row('due').locator('.due').textContent()),/^Due now · 2 accounts · \$133$/);
  const msg=await row('due').locator('.qmsg').textContent();
  assert.ok(msg.startsWith('Hi Test Wholesaler A, 2 accounts are due now:\n'),msg);
  assert.ok(msg.includes(`- Gamma Three · ${maxName} · $70 · overdue since Oct 19\n- Alpha One · ${maxName} · $63 · overdue since Oct 24\nTotal: $133.`),msg);
  const href=await row('due').locator('a.wa').getAttribute('href');assert.ok(href.includes('8801700000001')&&href.includes(encodeURIComponent('Hi Test Wholesaler A')),href);
  check('the Queue shows "Wholesalers · 2": the Due now statement lists Gamma $70 (since Oct 19) and Alpha $63 (since Oct 24), total $133, and WhatsApp opens the wholesaler\'s number with the text');

  // 2. the "Renews soon" statement: the paid account renewing on Nov 15, within the default 3 days
  assert.equal(await row('soon').count(),1);assert.match(norm(await row('soon').locator('.due').textContent()),/^Renews within 3 days · 1 account · \$63$/);
  assert.ok((await row('soon').locator('.qmsg').textContent()).includes(`Hi Test Wholesaler A, 1 account renews soon:\n- Beta Two · ${maxName} · $63 · due Nov 15\nTotal: $63.`));
  check('the Renews soon statement lists Beta Two $63 due Nov 15');

  // 3. the wholesaler's customers are not listed one by one; the direct customer still is; the badge counts the two statements plus the direct row
  const ownRows=await page.locator('#rr-body .rr-row[data-own]').allTextContents();
  assert.equal(ownRows.length,1);assert.match(ownRows[0],/Direct Dan/);assert.ok(!ownRows.join(' ').includes('Alpha One'));
  assert.equal(await page.locator('#rem-cnt').textContent(),'3');
  check('only the direct customer has a row of his own; the badge counts 3 (two statements and one direct row)');

  // 4. Sent is saved per wholesaler and cycle, survives a reload and leaves the badge
  await row('due').locator('input[data-act=wssent]').check();
  await until(async()=>{const s=await doc('settings/main');return s.wsSent&&s.wsSent.ws_a&&s.wsSent.ws_a['due:2026-10-15'];},'wsSent saved');
  const saved=(await doc('settings/main')).wsSent.ws_a['due:2026-10-15'];assert.equal(saved.channel,'manual');assert.match(saved.at,/^2026-/);
  await until(async()=>(await page.locator('#rem-cnt').textContent())==='2','badge 2');
  await page.reload();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2000);await openQueue();
  assert.equal(await row('due').locator('input[data-act=wssent]').isChecked(),true);assert.match(norm(await row('due').locator('.when').textContent()),/manual/);
  check('the Sent tick is stored in settings.wsSent per wholesaler and cycle, the badge drops to 2, and the tick is still there after a reload');

  // 5. Settings: "Remind a wholesaler" 0 turns the Renews soon statement off
  await page.locator('#btn-settings').click();await page.locator('#s-ws-remind').waitFor();
  assert.equal(await page.locator('#s-ws-remind').inputValue(),'3');
  await page.locator('#s-ws-remind').fill('0');await page.locator('[data-save-setting=wholesalers]').click();
  await until(async()=>(await doc('settings/main')).wsRemindDays===0,'wsRemindDays 0');
  await openQueue();assert.equal(norm(await page.locator('#ws-sec h4').textContent()),'Wholesalers · 1');assert.equal(await row('soon').count(),0);
  check('Settings, Wholesalers: "Remind a wholesaler" 0 days removes the Renews soon statement');

  // 6. "New cost applies from" is hidden on Add user and on a plan without a cost, shown in Edit plan when a cost exists
  await page.locator('#btn-add').click();await page.locator('#a-pkg').selectOption('pkg_cmax');await page.waitForTimeout(300);
  const addFrom=page.locator('#a-account-cost [name$="accountCostFrom"]');assert.equal(await addFrom.count(),1);assert.equal(await addFrom.getAttribute('type'),'hidden');
  assert.ok(!(await page.locator('#addForm').innerText()).includes('New cost applies from'));
  await page.locator('#btn-add').click();
  const openEdit=async id=>{await page.locator(`#tbody tr.row[data-id=${id}] td.who`).click();await page.locator(`tr.detail[data-id=${id}] [data-key=edit]`).first().click();await page.locator(`tr.detail[data-id=${id}] .edit-form`).waitFor();return page.locator(`tr.detail[data-id=${id}] .edit-form`);};
  let ef=await openEdit('wa3');assert.equal(await ef.locator('[name$="accountCostFrom"]').getAttribute('type'),'date');assert.ok((await ef.innerText()).includes('New cost applies from'));
  await page.locator('#tbody tr.row[data-id=wa3] td.who').click();
  ef=await openEdit('wa1');assert.equal(await ef.locator('[name$="accountCostFrom"]').getAttribute('type'),'hidden');assert.ok(!(await ef.innerText()).includes('New cost applies from'));
  await page.locator('#tbody tr.row[data-id=wa1] td.who').click();
  check('"New cost applies from" is a hidden field on Add user and on a plan without a supplier cost, and a date field in Edit plan when a cost exists');

  // 7. layout at 390 and 1400, light and dark, with the Queue open
  await openQueue();
  for(const [w,h,scheme] of [[390,844,'light'],[390,844,'dark'],[1400,900,'light'],[1400,900,'dark']]){await page.setViewportSize({width:w,height:h});await page.emulateMedia({colorScheme:scheme});await page.waitForTimeout(300);
    await page.locator('#ws-sec').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`statement-${w}-${scheme}.png`),fullPage:false});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`no sideways scroll at ${w} ${scheme}`);}
  check('the statements fit at 390px and 1400px in light and dark with no sideways scroll');
  assert.deepEqual(errors,[]);check('No console or page errors');
  fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({version:'67',checks},null,2));console.log('wholesaler-statement-flow: '+checks.length+' checks passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
