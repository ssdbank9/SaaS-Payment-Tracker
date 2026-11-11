// v54: the customer list on a phone (one line per customer with its status and what it owes), the Owe money / Due soon / Paid up strip,
// the summary folded to one line on a phone, and Cancel plan (one plan or every plan, with the last day). Synthetic records on a disposable server only:
//   WASOOLI_TEST_URL=http://127.0.0.1:<port> node tests/list-cancel-flow.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const stubWebFonts=require('./webfonts.cjs');

const base=process.env.WASOOLI_TEST_URL||'http://127.0.0.1:8098',H={'X-Requested-With':'wasool','Content-Type':'application/json'},checks=[];
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).protocol,'http:');
const out=path.resolve(process.env.WASOOLI_TEST_OUTPUT||'data/list-cancel-qa');fs.mkdirSync(out,{recursive:true});
const check=n=>{checks.push(n);console.log('PASS '+n);};
const pay=(id,date,amount)=>({id,date,amount,currency:'PKR',note:''});
const plan=(id,payments)=>({id,kind:'monthly',cycle:'monthly',name:'',packageId:'pkg_c',currency:'PKR',start:'2026-09-24',prorate:true,prices:[{from:'2026-09-24',price:4200}],payments});
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--disable-gpu']});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await stubWebFonts(ctx);await ctx.addInitScript(()=>{if(!localStorage.getItem('pt-today'))localStorage.setItem('pt-today','2026-10-20');});
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(base+'/login',{waitUntil:'domcontentloaded'});await page.locator('[name=passcode]').fill('test1234');await page.locator('button[type=submit]').click();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  const api=async(method,pth,data)=>{const r=await ctx.request.fetch(base+pth,{method,headers:H,data:data===undefined?undefined:JSON.stringify(data)});let j=null;try{j=await r.json();}catch(e){}return {status:r.status(),j};};
  const doc=async p=>((await api('GET','/api/docs/'+p)).j||{}).data;
  const until=async(fn,what)=>{for(let i=0;i<60;i++){if(await fn())return;await page.waitForTimeout(250);}throw new Error('timed out waiting for '+what);};
  const users=((await api('GET','/api/docs?prefix=users/')).j.docs||[]);for(const d of users)await api('DELETE','/api/docs/'+d.path);
  await api('POST','/api/import',{docs:{
   'users/lo':{name:'Owes Person',joinDate:'2026-09-24',subscriptions:[plan('s1',[])]},
   'users/lp':{name:'Paid Person',joinDate:'2026-09-24',subscriptions:[plan('s1',[pay('p1','2026-09-24',8400)])]},
   'users/lm':{name:'Two Plans',joinDate:'2026-09-24',subscriptions:[plan('s1',[pay('m1','2026-09-24',8400)]),plan('s2',[pay('m2','2026-09-24',8400)])]},
  },replace:[]});
  await page.reload();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  assert.equal(await page.locator('#app-ver').textContent(),'v72');
  const row=nm=>page.locator('#tbody tr.row').filter({hasText:nm});

  // 1. the strip: who owes, who is paid up; a tap filters, a second tap shows everyone
  const strip=page.locator('#payStrip');await strip.waitFor({state:'visible'});
  assert.match(await strip.locator('[data-pf=owes]').innerText(),/1\s*Owe money\s*Rs 4,200/);assert.match(await strip.locator('[data-pf=paid]').innerText(),/2\s*Paid up/);assert.match(await strip.locator('[data-pf=soon]').innerText(),/0\s*Due soon/);
  await strip.locator('[data-pf=owes]').click();await until(async()=>await page.locator('#tbody tr.row').count()===1,'owes filter');assert.equal(await strip.locator('[data-pf=owes]').getAttribute('aria-pressed'),'true');
  await strip.locator('[data-pf=owes]').click();await until(async()=>await page.locator('#tbody tr.row').count()===3,'everyone again');
  await strip.locator('[data-pf=paid]').click();await until(async()=>await page.locator('#tbody tr.row').count()===2,'paid filter');await strip.locator('.ps-all').click();await until(async()=>await page.locator('#tbody tr.row').count()===3,'show everyone');
  check('the strip shows 1 owes money (Rs 4,200), 0 due soon, 2 paid up; tapping a group lists only them, tapping again or Show everyone lists all 3');

  // 2. a phone line per customer: status and amount owed, Record payment opens the pre-filled box, no sideways scroll
  const lo=row('Owes Person');assert.equal(await lo.locator('.m-st').isVisible(),true);assert.match(await lo.locator('.m-st').innerText(),/Overdue since Sep 24.*Owes Rs 4,200/s);
  assert.match(await row('Paid Person').locator('.m-st').innerText(),/Paid to Nov 23/);assert.equal(await row('Paid Person').locator('.m-owe').count(),0);
  assert.equal(await page.locator('#table thead').isVisible(),false);assert.equal(await page.locator('[data-act=row-start],[data-act=row-bill]').count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await lo.locator('[data-act=row-pay]').click();await until(async()=>page.locator('#paymentDialog').evaluate(d=>d.open),'payment box');assert.match(await page.locator('#paymentDialog').innerText(),/Owes Person/);
  await page.locator('#paymentDialog').evaluate(d=>d.close());
  check('on a phone each customer is one line with "Overdue since Sep 24 · Owes Rs 4,200" or "Paid to Nov 23"; Record payment opens the pre-filled payment box; no sideways scroll');

  // 3. the summary folds to one line on a phone and remembers being opened; a computer always shows it
  assert.equal(await page.locator('#summaryBlock').isVisible(),false);assert.match(await page.locator('#sumFold').innerText(),/Rs 4,200 owed/);
  await page.locator('#sumFold').click();assert.equal(await page.locator('#summaryBlock').isVisible(),true);assert.equal(await page.locator('#sumFold').getAttribute('aria-expanded'),'true');
  await page.reload();await page.waitForSelector('#app-ver');await page.waitForTimeout(1500);assert.equal(await page.locator('#summaryBlock').isVisible(),true);
  await page.locator('#sumFold').click();assert.equal(await page.locator('#summaryBlock').isVisible(),false);
  await page.setViewportSize({width:1400,height:900});assert.equal(await page.locator('#summaryBlock').isVisible(),true);assert.equal(await page.locator('#sumFold').isVisible(),false);await page.setViewportSize({width:390,height:844});
  check('on a phone the summary is one line ("Rs 4,200 owed"), opens on tap and stays open after a reload, folds again; on a computer it always shows');

  // 4. Cancel plan: one of two plans, with the default last day before the next bill
  await row('Two Plans').locator('[data-act=row-cancel]').click();await until(async()=>page.locator('#cancelPlanDialog').evaluate(d=>d.open),'cancel box');
  assert.equal(await page.locator('#cp-list input').count(),2);assert.equal(await page.locator('#cp-list input:checked').count(),0);assert.equal(await page.locator('#cp-last').inputValue(),'2026-10-23');
  await page.locator('#cp-save').click();assert.match(await page.locator('#cp-error').textContent(),/Tick at least one plan/);
  await page.locator('#cp-list input').nth(1).check();await until(async()=>/stops after Oct 23, 2026.*other plans carry on/s.test(await page.locator('#cp-preview').textContent()),'preview');
  await page.locator('#cp-reason').fill('Moved to one account');await page.locator('#cp-save').click();
  await until(async()=>!(await page.locator('#cancelPlanDialog').evaluate(d=>d.open)),'box closes');
  let m=await doc('users/lm');assert.equal(m.subscriptions[1].end,'2026-10-23');assert.equal(m.subscriptions[1].endReason,'Moved to one account');assert.ok(!m.subscriptions[0].end);assert.ok(!m.cancel);
  assert.equal(m.subscriptions[1].payments.length,1);assert.equal(await row('Two Plans').locator('[data-act=row-cancel]').count(),1);
  check('Cancel plan on a customer with two plans: nothing ticked is refused; ticking one sets only its End date to Oct 23, 2026 (the day before the next bill) with the reason; the other plan, the payments and the customer stay');

  // 5. Cancel plan with every running plan ticked is the customer's cancellation
  await row('Two Plans').locator('[data-act=row-cancel]').click();await until(async()=>page.locator('#cancelPlanDialog').evaluate(d=>d.open),'cancel box 2');
  assert.equal(await page.locator('#cp-list input').count(),2);assert.match(await page.locator('#cp-list').innerText(),/already ends Oct 23, 2026/);
  await page.locator('#cp-close').click();
  await row('Owes Person').locator('[data-act=row-cancel]').click();await until(async()=>page.locator('#cancelPlanDialog').evaluate(d=>d.open),'cancel box 3');
  await page.locator('#cp-last').fill('2026-10-23');await until(async()=>/Still owed after this: Rs 4,200.*moves to Cancelled/s.test(await page.locator('#cp-preview').textContent()),'all-plans preview');
  await page.locator('#cp-save').click();await until(async()=>!!(await doc('users/lo')).cancel,'cancelled');
  const o=await doc('users/lo');assert.equal(o.cancel.lastDay,'2026-10-23');assert.deepEqual(o.cancel.ended,['s1']);assert.equal(o.subscriptions[0].end,'2026-10-23');
  await until(async()=>await row('Owes Person').count()===0,'cancelled customer leaves the active list');
  check('a customer\'s last running plan: the box ticks it, the preview says Rs 4,200 is still owed and the customer moves to Cancelled; saving records the cancellation (last day Oct 23, 2026) and they leave the active list');

  // 6. layout at 390 and 1400, light and dark, with the cancel box open
  for(const [w,h,scheme] of [[390,844,'light'],[390,844,'dark'],[1400,900,'light'],[1400,900,'dark']]){await page.setViewportSize({width:w,height:h});await page.emulateMedia({colorScheme:scheme});await page.waitForTimeout(300);
    await page.screenshot({path:path.join(out,`list-${w}-${scheme}.png`)});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`no sideways scroll at ${w} ${scheme}`);
    await row('Paid Person').locator('[data-act=row-cancel]').click();await until(async()=>page.locator('#cancelPlanDialog').evaluate(d=>d.open),'cancel box');await page.screenshot({path:path.join(out,`cancel-${w}-${scheme}.png`)});await page.locator('#cp-cancel').click();}
  check('the list and the Cancel plan box fit at 390px and 1400px in light and dark with no sideways scroll');
  assert.deepEqual(errors,[]);check('No unexpected console/page errors');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({version:'72',checks},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
