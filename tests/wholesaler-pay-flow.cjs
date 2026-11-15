// v74: one payment from a wholesaler covering its customers' bills. Record payment on the wholesaler's Queue statement (and on its heading in
// the customer list) opens a form listing each plan with money due (ticked) and the next bill (not ticked); saving records the receipts on each
// customer's plan with the note "via <wholesaler>". Synthetic records on a disposable server only:
//   WASOOLI_TEST_URL=http://127.0.0.1:<port> node tests/wholesaler-pay-flow.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const stubWebFonts=require('./webfonts.cjs');

const base=process.env.WASOOLI_TEST_URL||'http://127.0.0.1:8098',H={'X-Requested-With':'wasool','Content-Type':'application/json'},checks=[];
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).protocol,'http:');
const out=path.resolve(process.env.WASOOLI_TEST_OUTPUT||'data/wholesaler-pay-qa');fs.mkdirSync(out,{recursive:true});
const check=n=>{checks.push(n);console.log('PASS '+n);};
const norm=s=>String(s).replace(/\s+/g,' ').trim();
const plan=(start,price,extra)=>({id:'s1',kind:'monthly',cycle:'monthly',name:'',packageId:'pkg_cmax',currency:'USD',start,anchor:'2026-10-15',prorate:false,prices:[{from:start,price}],payments:[],...(extra||{})});
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
  await api('PATCH','/api/docs/settings/main',{wsSent:{},wsRemindDays:3,packages:st.packages.map(p=>p.id==='pkg_cmax'?{...p,cycleStart:'2026-10-15'}:p),
    wholesalers:[{id:'ws_e',name:'End Payer',phone:'918200000001',notes:'',payAt:'end'}]});
  for(const d of (((await api('GET','/api/docs?prefix=users/')).j||{}).docs||[]))await api('DELETE','/api/docs/'+d.path);
  await api('POST','/api/import',{docs:{
   'users/e1':{name:'Ann End',wholesalerId:'ws_e',joinDate:'2026-10-20',subscriptions:[plan('2026-10-20',13)]},
   'users/e2':{name:'Bob End',wholesalerId:'ws_e',joinDate:'2026-11-03',subscriptions:[plan('2026-11-03',12)]},
   'users/e3':{name:'Cat End',wholesalerId:'ws_e',joinDate:'2026-11-15',subscriptions:[plan('2026-11-15',13)]},
   'users/d1':{name:'Dan Direct',phone:'923001234567',joinDate:'2026-10-20',subscriptions:[plan('2026-10-20',13)]},
  },replace:[]});
  await page.reload();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  assert.equal(await page.locator('#app-ver').textContent(),'v74');

  // 1. the statement's Record payment opens the form: two bills due (ticked), the next bill not ticked, total $25
  if(await page.locator('#remindRun').isHidden())await page.locator('#btn-reminders').click();await page.locator('#rr-body #ws-sec').waitFor();
  await page.locator('#ws-sec .ws-q[data-ws=ws_e][data-kind=due] [data-act=wspay]').click();
  const dl=page.locator('#wsPayDialog');await dl.waitFor();
  assert.equal(norm(await page.locator('#wspay-who').textContent()),'End Payer');
  const lines=page.locator('#wspay-lines .wspay-line');assert.equal(await lines.count(),3);
  const txt=await lines.evaluateAll(es=>es.map(e=>e.innerText.replace(/\s+/g,' ').trim()+' ['+(e.querySelector('[data-wl=on]').checked?'x':' ')+'] '+e.querySelector('[data-wl=amt]').value));
  assert.match(txt[0],/^Ann End .*USD for 15 Oct . 14 Nov 2026 \[x\] 13$/,txt[0]);assert.match(txt[1],/^Bob End .*\[x\] 12$/,txt[1]);assert.match(txt[2],/^Cat End .*due Dec 15 · not due yet \[ \] 13$/,txt[2]);
  assert.equal(norm(await page.locator('#wspay-total').textContent()),'2 bills · total received $25.');
  assert.equal(norm(await page.locator('#wspay-save').textContent()),'Record $25');
  check('the End Payer statement\'s Record payment lists Ann $13 and Bob $12 ticked (due now) and Cat $13 unticked (due Dec 15); total "2 bills · total received $25"');

  // 2. a different amount for one bill, a note, save: receipts on each plan with "via End Payer"
  await lines.nth(1).locator('[data-wl=amt]').fill('10');await page.locator('#wspay-note').fill('USDT 1');
  assert.equal(norm(await page.locator('#wspay-total').textContent()),'2 bills · total received $23.');
  await page.locator('#wspay-save').click();await until(async()=>!(await dl.isVisible()),'dialog closed');
  const p1=(await doc('users/e1')).subscriptions[0].payments,p2=(await doc('users/e2')).subscriptions[0].payments,p3=(await doc('users/e3')).subscriptions[0].payments;
  assert.equal(p1.length,1);assert.equal(p1[0].amount,13);assert.equal(p1[0].date,'2026-11-15');assert.match(p1[0].note,/via End Payer · USDT 1$/);
  assert.equal(p2.length,1);assert.equal(p2[0].amount,10);assert.equal(p2[0].currency,'USD');assert.match(p2[0].note,/^for .* · via End Payer · USDT 1$/);
  assert.equal(p3.length,0);assert.equal(((await doc('users/d1')).subscriptions[0].payments||[]).length,0);
  check('saving records $13 on Ann and $10 on Bob, dated Nov 15, noted "via End Payer · USDT 1"; Cat and the direct customer get nothing');

  // 3. the list follows: Ann paid to Nov 14, Bob still owes $2, the statement asks only for Bob
  await page.waitForTimeout(800);
  const pill=async id=>norm(await page.locator(`#tbody tr.row[data-id=${id}] .m-st`).first().textContent());
  assert.match(await pill('e1'),/^Paid to Nov 14/);assert.match(await pill('e2'),/^Overdue/);
  if(await page.locator('#remindRun').isHidden())await page.locator('#btn-reminders').click();await page.locator('#rr-body #ws-sec').waitFor();
  assert.match(norm(await page.locator('#ws-sec .ws-q[data-ws=ws_e][data-kind=due] .due').textContent()),/^Due now · 1 account · \$2$/);
  check('Ann shows "Paid to Nov 14", Bob still owes, and the statement now asks "Due now · 1 account · $2"');

  // 4. the customer list heading opens the same form; layout at 390 and 1400, light and dark
  await page.locator('#btn-reminders').click().catch(()=>{});await page.waitForTimeout(300);
  const head=page.locator('#tbody tr.grp[data-ws=ws_e] [data-act=wspay]');await head.scrollIntoViewIfNeeded();await head.click();await dl.waitFor();
  assert.equal(await lines.count(),3);assert.equal(await page.locator('#wspay-lines [data-wl=on]:checked').count(),1);
  for(const [w,h,scheme] of [[390,844,'light'],[390,844,'dark'],[1400,900,'light'],[1400,900,'dark']]){await page.setViewportSize({width:w,height:h});await page.emulateMedia({colorScheme:scheme});await page.waitForTimeout(300);
    await page.screenshot({path:path.join(out,`wspay-${w}-${scheme}.png`),fullPage:false});
    const box=await dl.boundingBox();assert.ok(box&&box.x>=0&&box.x+box.width<=w+1,`dialog fits at ${w} ${scheme}`);
    assert.equal(await page.evaluate(()=>{const d=document.querySelector('#wsPayDialog');return d.scrollWidth<=d.clientWidth+1;}),true,`no sideways scroll in the dialog at ${w} ${scheme}`);}
  await page.locator('#wspay-cancel').click();assert.equal(await dl.isVisible(),false);
  check('the End Payer heading in the customer list opens the same form (Bob ticked, the next bills of Ann and Cat unticked); it fits at 390px and 1400px in light and dark and closes with Not now');
  assert.deepEqual(errors,[]);check('No console or page errors');
  fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({version:'74',checks},null,2));console.log('wholesaler-pay-flow: '+checks.length+' checks passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
