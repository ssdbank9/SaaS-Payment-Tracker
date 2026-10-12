// v41: small fixes #20 (Queue Except list), #21 (confirm before removing), #23 (cancelled customer with a later plan), #25 (Set package),
// #26 (two decimals) and #39 (chart labels). Synthetic local records only.
// Start a disposable server (see AGENTS.md), then: node tests/small-fixes-flow.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.WASOOLI_TEST_URL||'http://127.0.0.1:8098',H={'X-Requested-With':'wasool','Content-Type':'application/json'},checks=[];
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).protocol,'http:');
const out=path.resolve(process.env.WASOOLI_TEST_OUTPUT||'data/small-fixes-qa');fs.mkdirSync(out,{recursive:true});
const check=n=>{checks.push(n);console.log('PASS '+n);};
const mon=(id,start,extra)=>Object.assign({id,kind:'monthly',cycle:'monthly',packageId:'pkg_c',currency:'PKR',start,prorate:true,prices:[{from:start,price:4200}],payments:[]},extra||{});
const pay=(id,date,amount)=>({id,date,amount,currency:'PKR'});
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--disable-gpu']});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await ctx.addInitScript(()=>{if(!localStorage.getItem('pt-today'))localStorage.setItem('pt-today','2026-10-20');});
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(base+'/login',{waitUntil:'domcontentloaded'});await page.locator('[name=passcode]').fill('test1234');await page.locator('button[type=submit]').click();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  const api=async(method,pth,data)=>{const r=await ctx.request.fetch(base+pth,{method,headers:H,data:data===undefined?undefined:JSON.stringify(data)});let j=null;try{j=await r.json();}catch(e){}return {status:r.status(),j};};
  const doc=async p=>(await api('GET','/api/docs/'+p)).j.data;
  const until=async(fn,what)=>{for(let i=0;i<40;i++){if(await fn())return;await page.waitForTimeout(250);}throw new Error('timed out waiting for '+what);};
  await api('POST','/api/import',{docs:{
    'users/q1':{name:'Queue Person',joinDate:'2026-09-24',subscriptions:[mon('s1','2026-09-24',{payments:[pay('p1','2026-09-24',4200)]})]},
    'users/u21':{name:'Remove Person',joinDate:'2026-09-24',subscriptions:[mon('s1','2026-09-24',{payments:[pay('p1','2026-09-24',4200),pay('p2','2026-10-24',4200)],refunds:[{id:'r1',date:'2026-10-25',amount:100,currency:'PKR',rate:null,note:''}]})]},
    'users/u23':{name:'Cancelled Later Plan',joinDate:'2026-08-24',phone:'923001112222',cancel:{lastDay:'2026-10-31',reason:'x',note:'',at:'2026-10-20'},subscriptions:[mon('s1','2026-08-24',{end:'2026-10-31',payments:[pay('p1','2026-08-24',4200)]}),mon('s2','2026-11-24',{end:'2026-10-31',packageId:'pkg_cmax',prices:[{from:'2026-11-24',price:6000}]})]},
    'users/u25':{name:'No Package',joinDate:'2026-09-24',subscriptions:[mon('s1','2026-09-24',{packageId:null})]},
    'users/u26':{name:'Fraction',joinDate:'2026-09-24',subscriptions:[mon('s1','2026-09-24',{payments:[pay('p1','2026-10-05',20111.6)]})]},
    'costs/c1':{date:'2026-10-02',description:'x',category:'x',packageId:'pkg_c',currency:'PKR',cost:900,tax:0,rate:null}},replace:['users/','costs/']});
  await page.reload();await page.waitForSelector('tr.row[data-id="q1"]');await page.waitForTimeout(2500);await page.locator('#statusFilter').selectOption('all');await page.waitForTimeout(300);

  /* #20 the Except list stays on screen on a phone */
  await page.locator('#btn-reminders').click();await page.locator('#rr-tabs button[data-tab=queue]').click();await page.waitForTimeout(500);
  await page.locator('details.except summary').first().click();await page.waitForTimeout(300);
  const box=await page.locator('.except-list').first().boundingBox();assert.ok(box&&box.x>=0&&box.x+box.width<=390,'Except list inside the screen: '+JSON.stringify(box));
  await page.locator('.except-list input[data-act=skip]').first().scrollIntoViewIfNeeded();
  check('#20 On a 390px phone the Queue "Except…" list opens fully on screen (bottom sheet), not cut off on the left');
  await page.locator('#btn-reminders').click();

  /* #20b on the cycle start day the tick is saved for today's cycle and the person leaves today's list */
  await page.evaluate(()=>localStorage.setItem('pt-today','2026-10-24'));await page.reload();await page.waitForSelector('tr.row[data-id="q1"]');await page.waitForTimeout(2500);
  await page.locator('#btn-reminders').click();await page.locator('#rr-tabs button[data-tab=queue]').click();await page.waitForTimeout(500);
  assert.match(await page.locator('#rr-body').innerText(),/Stage 3/);assert.ok((await page.locator('.qrow[data-user="q1"]').count())===1);
  await page.locator('details.except summary').first().click();await page.locator('.except-list input[data-act=skip][data-user="q1"]').check();await page.waitForTimeout(1500);
  const rem=(await doc('users/q1')).reminders||{};assert.ok(rem['2026-10-24']&&rem['2026-10-24'].skipped,'saved for 24 Oct');assert.equal(rem['2026-11-24'],undefined);
  assert.equal(await page.locator('.qrow[data-user="q1"]').count(),0);
  check('#20 On the cycle start day (stage 3) ticking Except saves for the 24 Oct cycle and removes the person from today\'s list');
  await page.locator('#btn-reminders').click();await page.evaluate(()=>localStorage.setItem('pt-today','2026-10-20'));await page.reload();await page.waitForSelector('tr.row[data-id="q1"]');await page.waitForTimeout(2000);await page.locator('#statusFilter').selectOption('all');await page.waitForTimeout(300);

  /* #21 confirm before removing a receipt or refund */
  await page.locator('tr.row[data-id="u21"]').click();const d21=page.locator('tr.detail[data-id="u21"]');await d21.waitFor();
  await d21.locator('[data-act=pay-remove][data-pay=p2]').click();await page.waitForTimeout(300);
  assert.match(await d21.innerText(),/Remove this receipt\?/);assert.equal((await doc('users/u21')).subscriptions[0].payments.length,2);
  await d21.locator('[data-act=rm-no]').click();await page.waitForTimeout(400);assert.equal((await doc('users/u21')).subscriptions[0].payments.length,2);
  check('#21 Removing a receipt asks "Remove this receipt?" first; Cancel keeps it');
  await d21.locator('[data-act=pay-remove][data-pay=p2]').click();await d21.locator('[data-act=pay-remove-yes]').click();await until(async()=>(await doc('users/u21')).subscriptions[0].payments.length===1,'the receipt to be removed');
  assert.equal((await doc('users/u21')).subscriptions[0].payments.length,1);
  await d21.locator('[data-act=refund-remove]').click();assert.match(await d21.innerText(),/Remove this refund\?/);assert.equal((await doc('users/u21')).subscriptions[0].refunds.length,1);
  await d21.locator('[data-act=refund-remove-yes]').click();await until(async()=>((await doc('users/u21')).subscriptions[0].refunds||[]).length===0,'the refund to be removed');assert.equal(((await doc('users/u21')).subscriptions[0].refunds||[]).length,0);
  check('#21 Yes removes the receipt; a refund asks "Remove this refund?" and Yes removes it');
  await page.locator('tr.row[data-id="u21"]').click();

  /* #23 cancelled customer whose second plan starts after the last day */
  await page.locator('tr.row[data-id="u23"]').click();const d23=page.locator('tr.detail[data-id="u23"]');await d23.waitFor();
  await d23.locator('[data-key=edit]').first().click();const ef=d23.locator('.edit-form');await ef.waitFor({state:'visible'});await ef.locator('[name=notes]').fill('saved while cancelled');await ef.locator('button[type=submit]').click();await ef.waitFor({state:'hidden',timeout:10000});
  assert.equal((await doc('users/u23')).notes,'saved while cancelled');
  check('#23 A cancelled customer with a plan that starts after the last day can be edited (notes saved, no "start after end" error)');
  await d23.locator('[data-key="edit:s2"]').first().click();const pf=d23.locator('form.subedit-form[data-sub=s2]');await pf.waitFor({state:'visible'});await pf.locator('[name=name]').fill('Later plan');await pf.locator('button[type=submit]').click();await until(async()=>(await doc('users/u23')).subscriptions[1].name==='Later plan','the later plan to be saved').catch(async e=>{throw new Error(e.message+'; page said: '+(await page.locator('.toast').allInnerTexts()).join(' | '));});
  assert.equal((await doc('users/u23')).subscriptions[1].name,'Later plan');
  check('#23 That later plan itself can be edited and saved');
  await page.locator('tr.row[data-id="u23"]').click();

  /* #25 Set package... */
  const sel=page.locator('tr.row[data-id="u25"] select.pkg-quick');await sel.selectOption('__new');await page.waitForTimeout(800);
  assert.equal((await doc('users/u25')).subscriptions[0].packageId,null);assert.ok(await page.locator('#pkgList input[data-f=name]').count()>=4);
  check('#25 "+ New package…" in Set package opens the new product form and saves nothing (no "__new" package)');
  await page.locator('#btn-settings').click();
  await sel.selectOption('pkg_g');await page.waitForTimeout(800);assert.equal((await doc('users/u25')).subscriptions[0].packageId,null);
  check('#25 A yearly package cannot be set on a monthly plan');

  /* #26 two decimals */
  const col=(await page.locator('#t-col').innerText()).trim();assert.match(col,/Rs 20,111\.60/);
  check('#26 A rupee amount with a fraction shows two decimals: Rs 20,111.60 (not 20,111.6)');

  /* #39 chart labels do not overlap on a phone */
  await page.locator('#chart').scrollIntoViewIfNeeded();const labs=await page.locator('#chart .xlab').evaluateAll(l=>l.map(e=>{const r=e.getBoundingClientRect();return [r.left,r.right];}));
  assert.ok(labs.length>=5);for(let i=1;i<labs.length;i++)assert.ok(labs[i][0]>=labs[i-1][1]-0.5,'labels overlap: '+JSON.stringify(labs));
  check('#39 The Summary chart\'s month labels no longer overlap at 390px');

  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);check('No sideways scroll and no unexpected console/page errors');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({version:'42',checks},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
