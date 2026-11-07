// v55: the Add a customer form: every field visible in three groups (Customer, Plan, Payment), Joined on follows the start,
// "Have they paid?" answered in the form (Yes records the first bill, Not yet records nothing, unanswered opens the payment box),
// and Save and add another. Synthetic records on a disposable server only:
//   WASOOLI_TEST_URL=http://127.0.0.1:<port> node tests/add-form-flow.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const stubWebFonts=require('./webfonts.cjs');

const base=process.env.WASOOLI_TEST_URL||'http://127.0.0.1:8098',H={'X-Requested-With':'wasool','Content-Type':'application/json'},checks=[];
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).protocol,'http:');
const out=path.resolve(process.env.WASOOLI_TEST_OUTPUT||'data/add-form-qa');fs.mkdirSync(out,{recursive:true});
const check=n=>{checks.push(n);console.log('PASS '+n);};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--disable-gpu']});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await stubWebFonts(ctx);await ctx.addInitScript(()=>{if(!localStorage.getItem('pt-today'))localStorage.setItem('pt-today','2026-10-20');});
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(base+'/login',{waitUntil:'domcontentloaded'});await page.locator('[name=passcode]').fill('test1234');await page.locator('button[type=submit]').click();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  const api=async(method,pth,data)=>{const r=await ctx.request.fetch(base+pth,{method,headers:H,data:data===undefined?undefined:JSON.stringify(data)});let j=null;try{j=await r.json();}catch(e){}return {status:r.status(),j};};
  const users=async()=>((await api('GET','/api/docs?prefix=users/')).j.docs||[]).map(d=>Object.assign({path:d.path},d.data));
  const byName=async nm=>(await users()).find(u=>u.name===nm);
  const until=async(fn,what)=>{for(let i=0;i<60;i++){if(await fn())return;await page.waitForTimeout(250);}throw new Error('timed out waiting for '+what);};
  for(const d of ((await api('GET','/api/docs?prefix=users/')).j.docs||[]))await api('DELETE','/api/docs/'+d.path);
  await page.reload();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2000);
  assert.equal(await page.locator('#app-ver').textContent(),'v62');
  const payOpen=()=>page.locator('#paymentDialog').evaluate(d=>d.open);
  const openAdd=async()=>{if(await page.locator('#addPanel').isHidden())await page.locator('#btn-add').click();await page.locator('#addPanel').waitFor({state:'visible'});};

  // 1. every field is on show, in three groups
  await openAdd();
  const legends=(await page.locator('#addForm .add-grp>legend').allTextContents()).map(x=>x.trim());assert.deepEqual(legends,['Customer','Plan','Payment']);
  for(const id of ['a-name','a-email','a-phone','a-tg','a-notes','a-pkg','a-start','a-join','a-price','a-cur','a-cycle','a-plan','a-prorate','a-waive','a-own'])assert.equal(await page.locator('#'+id).isVisible(),true,id+' visible');
  assert.equal(await page.locator('#addForm details').count(),0);
  check('Add a customer shows every field without opening anything: Customer (name, email, WhatsApp, Telegram, notes), Plan (product, start, joined, price, currency, billing, label, proration choices), Payment');

  // 2. Joined on follows the start until it is changed by hand
  await page.locator('#a-start').fill('2026-10-10');assert.equal(await page.locator('#a-join').inputValue(),'2026-10-10');
  await page.locator('#a-join').fill('2026-10-01');await page.locator('#a-start').fill('2026-10-12');assert.equal(await page.locator('#a-join').inputValue(),'2026-10-01');
  await page.locator('#add-close').click();await page.reload();await page.waitForSelector('#app-ver');await page.waitForTimeout(1500);
  check('Joined on copies Package started on (Oct 10) until it is set by hand (Oct 1 stays when the start moves to Oct 12)');

  // 3. Yes records the first bill shown in the label, with no payment box
  await openAdd();await page.locator('#a-name').fill('Yes Payer');await page.locator('#a-start').fill('2026-10-20');await page.locator('#a-price').fill('4200');await page.locator('#a-cur').selectOption('PKR');
  await until(async()=>/^Yes, Rs [\d,]+ \(the first bill\)$/.test((await page.locator('#a-paid-yes').textContent()).trim()),'Yes label with amount');
  const label=(await page.locator('#a-paid-yes').textContent()).trim(),amt=Number(label.match(/Rs ([\d,]+)/)[1].replace(/,/g,''));assert.ok(amt>0&&amt<=4200,label);
  await page.locator('#addForm input[name=a-paid][value=yes]').check();await page.locator('#addForm button[type=submit]').click();
  await until(async()=>{const u=await byName('Yes Payer');return u&&(u.subscriptions[0].payments||[]).length>0;},'payment recorded');
  const yu=await byName('Yes Payer'),ys=yu.subscriptions[0];assert.equal(ys.payments.reduce((t,p)=>t+p.amount,0),amt);assert.equal(ys.payments[0].date,'2026-10-20');assert.equal(ys.payments[0].currency,'PKR');
  assert.equal(await payOpen(),false);assert.equal(await page.locator('#addPanel').isHidden(),true);
  await until(async()=>/Paid to Oct 23/.test(await page.locator('#tbody tr.row').filter({hasText:'Yes Payer'}).innerText()),'row paid');
  check(`"Yes, Rs ${amt.toLocaleString('en-US')} (the first bill)" records exactly that, dated today, without opening the payment box; the row shows Paid to Oct 23`);

  // 4. Not yet records nothing; unanswered opens the payment box as before
  await openAdd();await page.locator('#a-name').fill('Later Payer');await page.locator('#a-start').fill('2026-10-20');await page.locator('#a-price').fill('4200');
  await page.locator('#addForm input[name=a-paid][value=no]').check();await page.locator('#addForm button[type=submit]').click();
  await until(async()=>!!(await byName('Later Payer')),'saved');assert.equal(((await byName('Later Payer')).subscriptions[0].payments||[]).length,0);assert.equal(await payOpen(),false);
  await openAdd();await page.locator('#a-name').fill('Ask Payer');await page.locator('#a-start').fill('2026-10-20');await page.locator('#a-price').fill('4200');await page.locator('#addForm button[type=submit]').click();
  await until(payOpen,'payment box');assert.match(await page.locator('#paymentDialog').innerText(),/Ask Payer/);await page.locator('#paymentDialog').evaluate(d=>d.close());
  check('Not yet saves the customer with no payment; leaving the question unanswered opens the pre-filled payment box, as before');

  // 5. Save and add another keeps the plan fields and clears the customer
  await openAdd();await page.locator('#a-name').fill('Batch One');await page.locator('#a-phone').fill('3001234567');await page.locator('#a-start').fill('2026-10-15');await page.locator('#a-price').fill('3900');
  await page.locator('#a-join').fill('2026-10-01');await page.locator('#addForm input[name=a-paid][value=no]').check();await page.locator('#a-again').click();
  await until(async()=>!!(await byName('Batch One')),'first of batch');assert.equal((await byName('Batch One')).joinDate,'2026-10-01');
  /* v56: after Save and add another, Joined on follows the start again */
  assert.equal(await page.locator('#a-join').inputValue(),'2026-10-15');await page.locator('#a-start').fill('2026-10-20');assert.equal(await page.locator('#a-join').inputValue(),'2026-10-20');await page.locator('#a-start').fill('2026-10-15');assert.equal(await page.locator('#a-join').inputValue(),'2026-10-15');
  assert.equal(await page.locator('#addPanel').isVisible(),true);assert.equal(await page.locator('#a-name').inputValue(),'');assert.equal(await page.locator('#a-phone').inputValue(),'');
  assert.equal(await page.locator('#a-start').inputValue(),'2026-10-15');assert.equal(await page.locator('#a-price').inputValue(),'3900');assert.equal(await page.locator('#addForm input[name=a-paid]:checked').count(),0);
  await page.locator('#a-name').fill('Batch Two');await page.locator('#addForm input[name=a-paid][value=no]').check();await page.locator('#a-again').click();
  await until(async()=>!!(await byName('Batch Two')),'second of batch');
  const b1=await byName('Batch One'),b2=await byName('Batch Two');assert.equal(b2.subscriptions[0].start,'2026-10-15');assert.equal(b2.subscriptions[0].prices[0].price,3900);assert.equal(b1.phone,'923001234567');assert.ok(!b2.phone);assert.notEqual(b1.subscriptions[0].id,b2.subscriptions[0].id);
  check('Save and add another saves the customer (its own Joined on Oct 1 kept), resets Joined on to follow the start for the next one, keeps the form open with the same start (Oct 15) and price (Rs 3,900), clears the name, phone and the paid answer; the next customer gets the same plan');

  // 6. layout at 390 and 1400, light and dark
  for(const [w,h,scheme] of [[390,844,'light'],[390,844,'dark'],[1400,900,'light'],[1400,900,'dark']]){await page.setViewportSize({width:w,height:h});await page.emulateMedia({colorScheme:scheme});await openAdd();await page.waitForTimeout(200);
    await page.locator('#addPanel').screenshot({path:path.join(out,`add-${w}-${scheme}.png`)});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`no sideways scroll at ${w} ${scheme}`);
    const sb=await page.locator('#addForm button[type=submit]').boundingBox();assert.ok(sb.x>=0&&sb.x+sb.width<=w,'Save reachable');}
  await page.locator('#add-close').click();
  check('the Add form fits at 390px and 1400px in light and dark with no sideways scroll; Save is reachable');
  assert.deepEqual(errors,[]);check('No unexpected console/page errors');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({version:'62',checks},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
