// v46: a customer with two products, one on the shared cycle (renews 24 Nov) and one on its own cycle (renews 5 Dec). The link page lists each
// product with its own renewal date, amount and buttons; the Queue keeps the customer in stage 2 until both products are answered; a
// Discontinue on one product ends only that product, the day before its own renewal. Synthetic records on a disposable server only:
//   WASOOLI_TEST_URL=http://127.0.0.1:<port> node tests/multi-product-link-flow.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.WASOOLI_TEST_URL||'http://127.0.0.1:8098',H={'X-Requested-With':'wasool','Content-Type':'application/json'},checks=[];
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).protocol,'http:');
const out=path.resolve(process.env.WASOOLI_TEST_OUTPUT||'data/multi-product-qa');fs.mkdirSync(out,{recursive:true});
const check=n=>{checks.push(n);console.log('PASS '+n);};
const pay=(id,date,amount)=>({id,date,amount,currency:'PKR'});
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--disable-gpu']});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await ctx.addInitScript(()=>{if(!sessionStorage.getItem('day-set')){localStorage.setItem('pt-today','2026-11-20');sessionStorage.setItem('day-set','1');}});
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(base+'/login',{waitUntil:'domcontentloaded'});await page.locator('[name=passcode]').fill('test1234');await page.locator('button[type=submit]').click();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  const api=async(method,pth,data)=>{const r=await ctx.request.fetch(base+pth,{method,headers:H,data:data===undefined?undefined:JSON.stringify(data)});let j=null;try{j=await r.json();}catch(e){}return {status:r.status(),j};};
  const doc=async p=>((await api('GET','/api/docs/'+p)).j||{}).data;
  const until=async(fn,what)=>{for(let i=0;i<80;i++){if(await fn())return;await page.waitForTimeout(250);}throw new Error('timed out waiting for '+what);};
  const tok='MultiProductTok'+'Q'.repeat(8);
  await api('POST','/api/import',{docs:{'users/mp1':{name:'Two Product Person',email:'two@example.test',phone:'923001234567',joinDate:'2026-08-24',confirmToken:tok,subscriptions:[
    {id:'s1',kind:'monthly',cycle:'monthly',name:'',packageId:'pkg_c',currency:'PKR',start:'2026-08-24',prorate:true,prices:[{from:'2026-08-24',price:4200}],payments:[pay('p1','2026-08-24',4200),pay('p2','2026-09-24',4200),pay('p3','2026-10-24',4200)]},
    {id:'s2',kind:'monthly',cycle:'monthly',name:'Second account',packageId:'pkg_cmax',currency:'PKR',start:'2026-09-05',anchor:'2026-01-05',prorate:true,prices:[{from:'2026-09-05',price:4000}],payments:[pay('q1','2026-09-05',4000),pay('q2','2026-10-05',4000),pay('q3','2026-11-05',4000)]}]}},replace:[]});
  await page.reload();await page.waitForSelector('#app-ver',{timeout:30000});
  assert.equal(await page.locator('#app-ver').textContent(),'v47');

  // 1. the link page document carries both products with their own renewal dates and amounts
  await until(async()=>{const d=await doc('confirm/'+tok);const c=d&&d.cycles&&d.cycles['2026-11-24'];return c&&c.plans&&c.plans.length===2;},'link page document with two products');
  const card=(await doc('confirm/'+tok)).cycles['2026-11-24'];
  assert.deepEqual(card.plans.map(p=>[p.planId,p.tier,p.dueISO,p.amountText]),[['s1','C','2026-11-24','Rs 4,200'],['s2','C Max','2026-12-05','Rs 4,000']]);
  assert.match(card.amountText,/Rs 8,200/);assert.match(card.amountText,/on Nov 24/);assert.match(card.amountText,/on Dec 5/);assert.match(card.dueDateText,/Nov 24 and Dec 5/);
  check('each product is on the link card with its own name, renewal date and amount (C Rs 4,200 on 24 Nov, C Max Rs 4,000 on 5 Dec, its own cycle)');

  // 2. the customer's page: two products, each with its own date and its own Continue / Discontinue
  const anon=await browser.newContext({viewport:{width:390,height:844}});const cp=await anon.newPage();
  await cp.goto(base+'/c/'+tok);const txt=await cp.locator('main').innerText();
  assert.match(txt,/Due on Nov 24, 2026/);assert.match(txt,/Due on Dec 5, 2026/);assert.match(txt,/Rs 4,200/);assert.match(txt,/Rs 4,000/);
  assert.equal(await cp.locator('section.plan form').count(),2);
  check('the customer\'s page shows both products, each with its own due date, amount and buttons');
  await cp.screenshot({path:path.join(out,'link-page-390.png'),fullPage:true});

  // 3. Continue on the first product only: in stage 2 the Queue still lists the customer
  await cp.locator('section.plan').nth(0).locator('button[value=continue]').click();await cp.waitForURL(/done=1/);
  await page.evaluate(()=>localStorage.setItem('pt-today','2026-11-23'));await page.reload();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  await page.locator('#btn-reminders').click();await page.locator('#rr-body').waitFor({state:'visible'});
  await until(async()=>/Stage 2/.test(await page.locator('#rr-body').innerText()),'stage 2');
  assert.equal(await page.locator('#rr-body .qrow[data-user=mp1]').count(),1);
  check('stage 2: answering for one product only keeps the customer in the Queue (the other product is still unanswered)');

  // 4. Discontinue on the second product: the customer leaves the Queue; confirming ends only that product, the day before 5 Dec
  await cp.goto(base+'/c/'+tok);await cp.locator('section.plan').nth(1).locator('button[value=discontinue]').click();await cp.waitForURL(/done=1/);
  await page.reload();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  await page.locator('#btn-reminders').click();await page.locator('#rr-body').waitFor({state:'visible'});await until(async()=>/Stage 2/.test(await page.locator('#rr-body').innerText()),'stage 2 again');
  await until(async()=>(await page.locator('#rr-body .qrow[data-user=mp1]').count())===0,'customer left the stage 2 list');
  check('once both products are answered, the customer is left out of stage 2');
  await until(async()=>{const u=await doc('users/mp1');return u.discontinue&&u.discontinue.planIds&&u.discontinue.planIds.includes('s2');},'discontinue request on the second product');
  await page.locator('#rr-close').click();
  await page.locator('tr.row[data-id=mp1]').click();const det=page.locator('tr.detail[data-id=mp1]');await det.waitFor();
  const btn=det.locator('[data-act=disc-confirm]');assert.match(await btn.textContent(),/Dec 4/);await btn.click();
  await until(async()=>{const u=await doc('users/mp1');return u.subscriptions[1].end==='2026-12-04';},'second product ends 4 Dec');
  const u=await doc('users/mp1');assert.equal(u.subscriptions[0].end||null,null);assert.equal(u.cancel||null,null);
  check('Discontinue on one product ends only that product, on 4 Dec (the day before its own renewal); the C plan continues');

  await anon.close();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);check('No sideways scroll and no unexpected console/page errors');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({version:'47',checks},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
