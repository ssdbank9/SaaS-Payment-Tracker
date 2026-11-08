// v68: every product has its own billing cycle; the shared cycle is gone. Two products (24th legacy calendar and a 15th one), three customers
// (one on each, one on both). The Queue shows one section per cycle date in a reminder window, the link card carries a card per date,
// the Reminder run / Final notice tabs pick a date, Settings has the reminder leads instead of the billing day, and the Summary pill
// names the next date of every product. Synthetic records on a disposable server only:
//   WASOOLI_TEST_URL=http://127.0.0.1:<port> node tests/product-cycles-flow.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const stubWebFonts=require('./webfonts.cjs');

const base=process.env.WASOOLI_TEST_URL||'http://127.0.0.1:8098',H={'X-Requested-With':'wasool','Content-Type':'application/json'},checks=[];
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).protocol,'http:');
const out=path.resolve(process.env.WASOOLI_TEST_OUTPUT||'data/product-cycles-qa');fs.mkdirSync(out,{recursive:true});
const check=n=>{checks.push(n);console.log('PASS '+n);};
const norm=s=>String(s).replace(/\s+/g,' ').trim();
const plan=(id,pkg,start,anchor,price,pays)=>({id,kind:'monthly',cycle:'monthly',name:'',packageId:pkg,currency:'PKR',start,anchor,prorate:false,prices:[{from:start,price}],payments:pays||[]});
const pay=(id,date,amount)=>({id,date,amount,currency:'PKR',rate:null,note:''});
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--disable-gpu']});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await stubWebFonts(ctx);
  await ctx.addInitScript(()=>{if(!localStorage.getItem('pt-today'))localStorage.setItem('pt-today','2026-11-12');localStorage.setItem('pt-sum-open','1');});
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const setToday=async d=>{await page.evaluate(d=>localStorage.setItem('pt-today',d),d);await page.reload();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2200);};
  await page.goto(base+'/login',{waitUntil:'domcontentloaded'});await page.locator('[name=passcode]').fill('test1234');await page.locator('button[type=submit]').click();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  const api=async(method,pth,data)=>{const r=await ctx.request.fetch(base+pth,{method,headers:H,data:data===undefined?undefined:JSON.stringify(data)});let j=null;try{j=await r.json();}catch(e){}return {status:r.status(),j};};
  const doc=async p=>((await api('GET','/api/docs/'+p)).j||{}).data;
  const openQ=async()=>{if(await page.locator('#remindRun').isHidden())await page.locator('#btn-reminders').click();};
  const until=async(fn,what)=>{for(let i=0;i<80;i++){if(await fn())return;await page.waitForTimeout(250);}throw new Error('timed out waiting for '+what);};
  // known records: product C on the legacy 24th calendar (its cycle start was filled in by the v68 settings repair), product F15 on the 15th
  const st=await doc('settings/main');const cName=st.packages.find(p=>p.id==='pkg_c').name;
  assert.equal(st.packages.find(p=>p.id==='pkg_c').cycleStart,'2026-07-24');assert.equal(st.remindLead,4);assert.equal(st.replyLead,1);
  await api('PATCH','/api/docs/settings/main',{packages:[...st.packages,{id:'pkg_f15',name:'Fifteenth',cycle:'monthly',price:3000,currency:'PKR',description:'',cycleStart:'2026-10-15'}],publicBaseUrl:'https://links.example.test'});
  for(const d of (((await api('GET','/api/docs?prefix=users/')).j||{}).docs||[]))await api('DELETE','/api/docs/'+d.path);
  await api('POST','/api/import',{docs:{
   'users/pa':{name:'Pat Legacy',phone:'923001111111',email:'pa@example.test',joinDate:'2026-08-24',confirmToken:'PatLegacyTokenxxxxxxxx',subscriptions:[plan('s1','pkg_c','2026-08-24','2026-07-24',4200,[pay('p1','2026-08-24',4200),pay('p2','2026-09-24',4200),pay('p3','2026-10-24',4200)])]},
   'users/pb':{name:'Fia Fifteen',phone:'923002222222',email:'pb@example.test',joinDate:'2026-10-15',confirmToken:'FiaFifteenTokenxxxxxxx',subscriptions:[plan('s1','pkg_f15','2026-10-15','2026-10-15',3000,[pay('q1','2026-10-15',3000)])]},
   'users/pc':{name:'Bo Both',phone:'923003333333',email:'pc@example.test',joinDate:'2026-10-15',confirmToken:'BoBothTokenxxxxxxxxxxx',subscriptions:[plan('s1','pkg_c','2026-10-24','2026-07-24',4200,[pay('r1','2026-10-24',4200)]),plan('s2','pkg_f15','2026-10-15','2026-10-15',3000,[pay('r2','2026-10-15',3000)])]},
  },replace:[]});
  await setToday('2026-11-12');
  assert.equal(await page.locator('#app-ver').textContent(),'v68');

  // 1. Settings: no shared billing day; the two leads
  await page.locator('#btn-settings').click();await page.locator('#s-remind-lead').waitFor();
  assert.equal(await page.locator('#s-cycle-day').count(),0);assert.equal(await page.locator('#s-anchor-month').count(),0);
  assert.equal(await page.locator('#s-remind-lead').inputValue(),'4');assert.equal(await page.locator('#s-reply-lead').inputValue(),'1');
  const pkgDates=await page.locator('#pkgList [data-f=cycleStart]').evaluateAll(es=>es.map(e=>e.value));assert.ok(pkgDates.includes('2026-07-24')&&pkgDates.includes('2026-10-15'),pkgDates);
  await page.locator('#btn-settings').click();
  check('Settings has no shared billing day or renewal month; "Remind" is 4 days and "Reply by" 1 day before a cycle starts; every product shows its own cycle start');

  // 2. Summary pill names the next date of each product
  const note=norm(await page.locator('#cycle-note').innerText());assert.match(note,/Next cycles:/);assert.match(note,/Nov 15 \(Fifteenth\)/);assert.match(note,new RegExp('Nov 24 \\('+cName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  check('the Summary pill says "Next cycles: Nov 15 (Fifteenth) · Nov 24 (…)"');

  // 3. Nov 12: the 15th cycle is in its reminder window (stage 1 from Nov 11), the 24th is not
  await openQ();await page.locator('#rr-body .q-cycle').first().waitFor();
  let secs=await page.locator('#rr-body .q-cycle').evaluateAll(es=>es.map(e=>({cs:e.dataset.cs,head:e.querySelector('h4').textContent.replace(/\s+/g,' ').trim(),stage:e.querySelector('.qstage').dataset.stage,users:[...e.querySelectorAll('.qrow')].map(r=>r.dataset.user)})));
  assert.deepEqual(secs.map(s=>s.cs),['2026-11-15']);assert.equal(secs[0].stage,'1');assert.match(secs[0].head,/Cycle starting Nov 15, 2026 · Fifteenth/);assert.deepEqual(secs[0].users.sort(),['pb','pc']);
  const boMsg=await page.locator('#rr-body .qrow[data-user=pc] .qmsg').textContent();assert.match(boMsg,/Fifteenth/);assert.match(boMsg,/Rs 3,000/);assert.match(boMsg,/Rs 4,200/);assert.match(boMsg,/Nov 15 and Nov 24, 2026/);/* one message covers the month: both bills, each with its date */
  assert.equal(await page.locator('#rem-cnt').textContent(),'2');
  check('Nov 12: one Queue section, "Cycle starting Nov 15 · Fifteenth" at stage 1 with Fia and Bo; Bo\'s message covers both bills of the month (Rs 3,000 on Nov 15 and Rs 4,200 on Nov 24); badge 2');

  // 4. the link card: Bo carries a card per date, opens on Nov 15
  await until(async()=>!!(await doc('confirm/BoBothTokenxxxxxxxxxxx')),'confirm doc');
  const cd=await doc('confirm/BoBothTokenxxxxxxxxxxx');assert.equal(cd.cycleStart,'2026-11-15');
  assert.deepEqual(Object.keys(cd.cycles),['2026-11-15']);assert.deepEqual(cd.plans.map(p=>p.planId),['s2','s1']);assert.equal(cd.replyByISO,'2026-11-14');
  check('Bo\'s link document opens on Nov 15 with one card listing both bills of the month (Nov 15 and Nov 24), replies due Nov 14; the Nov 24 date gets no second card');

  // 5. Reminder run and Final notice follow the same date; Nov 14 is the reply-by day of the 15th cycle
  await setToday('2026-11-14');await openQ();await page.locator('#rr-body .q-cycle').first().waitFor();
  secs=await page.locator('#rr-body .q-cycle').evaluateAll(es=>es.map(e=>({cs:e.dataset.cs,stage:e.querySelector('.qstage').dataset.stage})));assert.deepEqual(secs,[{cs:'2026-11-15',stage:'2'}]);
  assert.match(norm(await page.locator('#remindBannerText').innerText()),/Final notice day/);
  await page.locator('#rr-tabs button[data-tab=final]').click();await page.waitForTimeout(300);assert.match(norm(await page.locator('#rr-sub').textContent()),/Cycle starting Nov 15, 2026 · replies were due by Nov 14/);
  assert.deepEqual((await page.locator('#rr-body table.fn tbody tr').evaluateAll(trs=>trs.map(t=>t.dataset.user))).sort(),['pb','pc']);
  await page.locator('#rr-tabs button[data-tab=run]').click();await page.waitForTimeout(300);assert.match(norm(await page.locator('#rr-sub').textContent()),/Cycle starting Nov 15, 2026/);
  check('Nov 14: stage 2 for the Nov 15 cycle, the final-notice banner shows, and the Final notice / Reminder run tabs are about Nov 15');

  // 6. Nov 20: the Nov 15 bills are overdue (listed under Overdue), the 24th cycle is in its window with Pat and Bo
  await setToday('2026-11-20');await openQ();await page.locator('#rr-body .q-cycle').first().waitFor();
  secs=await page.locator('#rr-body .q-cycle').evaluateAll(es=>es.map(e=>({cs:e.dataset.cs,stage:e.querySelector('.qstage').dataset.stage,users:[...e.querySelectorAll('.qrow')].map(r=>r.dataset.user).sort()})));
  assert.deepEqual(secs,[{cs:'2026-11-24',stage:'1',users:['pa','pc']}]);
  const od=await page.locator('#overdue-sec .rr-row').evaluateAll(es=>es.map(e=>e.dataset.user).sort());assert.deepEqual(od,['pb','pc']);
  const patMsg=await page.locator('#rr-body .qrow[data-user=pa] .qmsg').textContent();assert.match(patMsg,/Rs 4,200/);assert.match(patMsg,/Nov 23/);
  check('Nov 20: the Nov 24 cycle is at stage 1 with Pat and Bo (reply by Nov 23); the unpaid Nov 15 bills of Fia and Bo sit under Overdue');

  // 7. a shorter lead moves the window: 2 days before means nothing is due on Nov 20
  await page.locator('#btn-settings').click();await page.locator('#s-remind-lead').fill('2');await page.locator('[data-save-setting=remind-lead]').click();
  await until(async()=>(await doc('settings/main')).remindLead===2,'remindLead 2');
  await openQ();await page.waitForTimeout(400);
  secs=await page.locator('#rr-body .q-cycle').evaluateAll(es=>es.map(e=>({cs:e.dataset.cs,stage:e.querySelector('.qstage').dataset.stage})));assert.deepEqual(secs,[{cs:'2026-11-24',stage:'0'}]);
  assert.match(norm(await page.locator('#rr-sub').textContent()),/no messages are due today/);
  await page.locator('#btn-settings').click();await page.locator('#s-remind-lead').fill('1');await page.locator('[data-save-setting=remind-lead]').click();await page.waitForTimeout(400);
  assert.match(norm(await page.locator('#setting-status-remind-lead').textContent()),/before the reply-by day/);
  await page.locator('#s-remind-lead').fill('4');await page.locator('[data-save-setting=remind-lead]').click();await until(async()=>(await doc('settings/main')).remindLead===4,'remindLead back to 4');
  check('"Remind" 2 days before puts Nov 20 outside the Nov 24 window (stage 0, nothing due today); a lead not longer than "Reply by" is refused');

  // 8. Edit plan offers no shared billing day
  await openQ();await page.locator('#tbody tr.row[data-id=pa] td.who').click();await page.locator('tr.detail[data-id=pa] [data-key="edit:s1"]').first().click();const sf=page.locator('tr.detail[data-id=pa] form.subedit-form[data-sub=s1]');await sf.waitFor({state:'visible'});
  const opts=await sf.locator('[name=renewOn] option').evaluateAll(os=>os.map(o=>o.textContent));
  assert.ok(!opts.some(o=>/Shared billing day/.test(o)),opts);assert.ok(opts.some(o=>/Product's own cycle|This product's cycle|Its current cycle/.test(o)),opts);
  await page.locator('#tbody tr.row[data-id=pa] td.who').click();
  check('Edit plan "Renews on" has no "Shared billing day" option');

  // 9. layout with the Queue open
  await openQ();await page.locator('#rr-body .q-cycle').first().waitFor();
  for(const [w,h,scheme] of [[390,844,'light'],[390,844,'dark'],[1400,900,'light'],[1400,900,'dark']]){await page.setViewportSize({width:w,height:h});await page.emulateMedia({colorScheme:scheme});await page.waitForTimeout(300);
    await page.screenshot({path:path.join(out,`cycles-${w}-${scheme}.png`),fullPage:false});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`no sideways scroll at ${w} ${scheme}`);}
  check('the Queue fits at 390px and 1400px in light and dark');
  assert.deepEqual(errors,[]);check('No console or page errors');
  fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({version:'68',checks},null,2));console.log('product-cycles-flow: '+checks.length+' checks passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
