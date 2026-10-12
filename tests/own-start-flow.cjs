// v47: "Renews on its own start date" per plan. An annual plan that started Aug 30 moves from the shared Jul 24 year to Aug 30 - Aug 29
// (the Rs 25,000 already paid stays; Rs 25,000 remains); a start change moves the renewal date; switching back restores the shared day;
// Add user with the box ticked makes a plan that renews on its own day (no proration), unticked stays on the shared day; the link card
// shows an own-start plan's own due date. Synthetic records on a disposable server only:
//   WASOOLI_TEST_URL=http://127.0.0.1:<port> node tests/own-start-flow.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.WASOOLI_TEST_URL||'http://127.0.0.1:8098',H={'X-Requested-With':'wasool','Content-Type':'application/json'},checks=[];
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).protocol,'http:');
const out=path.resolve(process.env.WASOOLI_TEST_OUTPUT||'data/own-start-qa');fs.mkdirSync(out,{recursive:true});
const check=n=>{checks.push(n);console.log('PASS '+n);};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--disable-gpu']});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await ctx.addInitScript(()=>{if(!localStorage.getItem('pt-today'))localStorage.setItem('pt-today','2026-10-20');});
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(base+'/login',{waitUntil:'domcontentloaded'});await page.locator('[name=passcode]').fill('test1234');await page.locator('button[type=submit]').click();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  const api=async(method,pth,data)=>{const r=await ctx.request.fetch(base+pth,{method,headers:H,data:data===undefined?undefined:JSON.stringify(data)});let j=null;try{j=await r.json();}catch(e){}return {status:r.status(),j};};
  const doc=async p=>((await api('GET','/api/docs/'+p)).j||{}).data;
  const until=async(fn,what)=>{for(let i=0;i<60;i++){if(await fn())return;await page.waitForTimeout(250);}throw new Error('timed out waiting for '+what);};
  const det=id=>page.locator('tr.detail[data-id="'+id+'"]');
  const expand=async id=>{if(!(await det(id).count()))await page.locator('tr.row[data-id="'+id+'"]').click();await det(id).waitFor();return det(id);};
  const tok='OwnStartToken'+'R'.repeat(10);
  await api('POST','/api/import',{docs:{
   'users/os1':{name:'Annual Late Starter',joinDate:'2026-08-30',subscriptions:[{id:'s1',kind:'monthly',cycle:'yearly',name:'',packageId:'pkg_g',currency:'PKR',start:'2026-08-30',prorate:false,prorationBasis:'actual',paymentEvery:12,dueBy:'2027-02-28',prices:[{from:'2026-08-30',price:50000}],payments:[{id:'p1',date:'2026-08-30',amount:25000,currency:'PKR'}]}]},
   'users/os2':{name:'Own Day Monthly',joinDate:'2026-10-10',confirmToken:tok,subscriptions:[{id:'s1',kind:'monthly',cycle:'monthly',name:'',packageId:'pkg_c',currency:'PKR',start:'2026-10-10',anchor:'2026-10-10',ownStart:true,prorate:true,prices:[{from:'2026-10-10',price:4200}],payments:[{id:'p1',date:'2026-10-10',amount:4200,currency:'PKR'}]}]},
  },replace:[]});
  await page.reload();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  assert.equal(await page.locator('#app-ver').textContent(),'v48');

  // 1. the annual plan on the shared calendar: Jul 24 year; switch Renews on to its own start date
  let d=await expand('os1');assert.match(await d.textContent(),/Jul 24, 2026/);
  const editPlan=async(uid)=>{const dd=await expand(uid);await dd.locator('[data-key="edit:s1"]').first().click();const f=dd.locator('form.subedit-form[data-sub=s1]');await f.waitFor({state:'visible'});return f;};
  let f=await editPlan('os1');assert.equal(await f.locator('[name=renewOn]').inputValue(),'shared');
  await f.locator('[name=renewOn]').selectOption('own');await f.locator('button[type=submit]').click();
  await until(async()=>(await doc('users/os1')).subscriptions[0].ownStart===true,'own start saved');
  let s=(await doc('users/os1')).subscriptions[0];assert.equal(s.anchor,'2026-08-30');assert.equal(s.payments.length,1);assert.equal(s.payments[0].amount,25000);
  d=await expand('os1');await until(async()=>/Aug 30, 2026 – Aug 29, 2027/.test(await d.textContent()),'own year shown');
  const t=await d.textContent();assert.match(t,/renews every Aug 30/);assert.match(t,/Remaining on the current period Rs 25,000/);assert.doesNotMatch(t,/Jul 24, 2026 –/);
  check('switching Renews on to its own start date: the annual plan runs Aug 30, 2026 - Aug 29, 2027, Rs 25,000 paid stays and Rs 25,000 remains');

  // 2. a start change moves the renewal date with it
  f=await editPlan('os1');await f.locator('[name=start]').fill('2026-09-01');await f.locator('button[type=submit]').click();
  await until(async()=>(await doc('users/os1')).subscriptions[0].start==='2026-09-01','start saved');
  s=(await doc('users/os1')).subscriptions[0];assert.equal(s.anchor,'2026-09-01');assert.equal(s.ownStart,true);
  check('changing the start date of an own-start plan moves its renewal date to the new start');

  // 3. switching back to the shared billing day restores the Jul 24 year
  f=await editPlan('os1');await f.locator('[name=renewOn]').selectOption('shared');await f.locator('button[type=submit]').click();
  await until(async()=>!(await doc('users/os1')).subscriptions[0].anchor,'back to shared');
  s=(await doc('users/os1')).subscriptions[0];assert.equal(s.ownStart,undefined);
  d=await expand('os1');await until(async()=>/Jul 24, 2026 –/.test(await d.textContent()),'shared year shown');
  check('switching back to the shared billing day removes the own date and the plan follows Jul 24 again');

  // 4. Add user: ticked = renews on its own day with no proration; unticked (default) = shared day
  await page.locator('#btn-add').click();await page.locator('#a-pkg').selectOption('pkg_c');
  await page.locator('#a-name').fill('Own Day New');await page.locator('#a-join').fill('2026-10-10');await page.locator('#a-start').fill('2026-10-10');await page.locator('#a-price').fill('4200');
  await page.evaluate(()=>{document.querySelector('#a-more').open=true;});assert.equal(await page.locator('#a-own').isChecked(),false);await page.locator('#a-own').check();
  await until(async()=>/Rs 4,200 for 10 Oct – 9 Nov/.test(await page.locator('#a-bill-preview').textContent()),'own-day preview: '+await page.locator('#a-bill-preview').textContent());
  await page.locator('#addForm button[type=submit]').click();
  const findU=async n=>((await api('GET','/api/docs?prefix=users/')).j.docs||[]).map(x=>x.data||x).find(u=>u.name===n);
  await until(async()=>!!(await findU('Own Day New')),'user added');let nu=await findU('Own Day New');assert.equal(nu.subscriptions[0].anchor,'2026-10-10');assert.equal(nu.subscriptions[0].ownStart,true);
  await page.keyboard.press('Escape');await page.locator('#paymentDialog').evaluate(dl=>dl.open&&dl.close()).catch(()=>{});
  await page.locator('#btn-add').click();await page.locator('#a-pkg').selectOption('pkg_c');
  await page.locator('#a-name').fill('Shared Day New');await page.locator('#a-join').fill('2026-10-10');await page.locator('#a-start').fill('2026-10-10');await page.locator('#a-price').fill('4200');
  await page.locator('#addForm button[type=submit]').click();await until(async()=>!!(await findU('Shared Day New')),'second user added');
  nu=await findU('Shared Day New');assert.equal(nu.subscriptions[0].anchor,undefined);
  await page.locator('#paymentDialog').evaluate(dl=>dl.open&&dl.close()).catch(()=>{});
  check('Add user: with Renews on its own start date ticked the plan bills Oct 10 - Nov 9 in full; left unticked (the default) it stays on the shared day');

  // 5. the link card carries an own-start plan's own due date
  await until(async()=>{const c=await doc('confirm/'+tok);return c&&c.cycles&&c.cycles['2026-10-24']&&c.cycles['2026-10-24'].plans.length===1;},'link card');
  const pl=(await doc('confirm/'+tok)).cycles['2026-10-24'].plans[0];assert.equal(pl.dueISO,'2026-11-10');assert.equal(pl.amountText,'Rs 4,200');
  check('the customer\'s link card shows the own-start plan due on Nov 10 (its own renewal day) for Rs 4,200');

  await page.screenshot({path:path.join(out,'own-start-390.png')});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);check('No sideways scroll and no unexpected console/page errors');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({version:'48',checks},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
