// v48: the Payments view (every payment and refund of every customer), the per-plan "Payments and refunds" heading under the bill boxes,
// and refunds in the users CSV (exported as negative rows, read back as refunds). Synthetic records on a disposable server only:
//   WASOOLI_TEST_URL=http://127.0.0.1:<port> node tests/payments-view-flow.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.WASOOLI_TEST_URL||'http://127.0.0.1:8098',H={'X-Requested-With':'wasool','Content-Type':'application/json'},checks=[];
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).protocol,'http:');
const out=path.resolve(process.env.WASOOLI_TEST_OUTPUT||'data/payments-view-qa');fs.mkdirSync(out,{recursive:true});
const check=n=>{checks.push(n);console.log('PASS '+n);};
const pay=(id,date,amount,note)=>({id,date,amount,currency:'PKR',note:note||''});
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--disable-gpu']});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,acceptDownloads:true});await ctx.addInitScript(()=>{if(!localStorage.getItem('pt-today'))localStorage.setItem('pt-today','2026-10-20');});
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(base+'/login',{waitUntil:'domcontentloaded'});await page.locator('[name=passcode]').fill('test1234');await page.locator('button[type=submit]').click();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  const api=async(method,pth,data)=>{const r=await ctx.request.fetch(base+pth,{method,headers:H,data:data===undefined?undefined:JSON.stringify(data)});let j=null;try{j=await r.json();}catch(e){}return {status:r.status(),j};};
  const doc=async p=>((await api('GET','/api/docs/'+p)).j||{}).data;
  const until=async(fn,what)=>{for(let i=0;i<60;i++){if(await fn())return;await page.waitForTimeout(250);}throw new Error('timed out waiting for '+what);};
  // replace the sample users so the totals are known
  const users=((await api('GET','/api/docs?prefix=users/')).j.docs||[]);for(const d of users)await api('DELETE','/api/docs/'+d.path);
  await api('POST','/api/import',{docs:{
   'users/pa':{name:'Payments Person',email:'pa@example.test',joinDate:'2026-09-24',subscriptions:[{id:'s1',kind:'monthly',cycle:'monthly',name:'',packageId:'pkg_c',currency:'PKR',start:'2026-09-24',prorate:true,prices:[{from:'2026-09-24',price:4200}],
     payments:[pay('p1','2026-09-24',4200,'NayaPay'),pay('p2','2026-10-05',4200,'')],refunds:[{id:'r1',date:'2026-10-10',amount:1000,currency:'PKR',note:'left early'}]}]},
   'users/pb':{name:'Cancelled Payer',joinDate:'2026-08-24',cancel:{lastDay:'2026-09-23',reason:'x',note:'',at:'2026-09-20'},subscriptions:[{id:'s1',kind:'monthly',cycle:'monthly',name:'',packageId:'pkg_c',currency:'PKR',start:'2026-08-24',end:'2026-09-23',prorate:true,prices:[{from:'2026-08-24',price:2000}],payments:[pay('q1','2026-08-24',2000,'')]}]},
  },replace:[]});
  await page.reload();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  assert.equal(await page.locator('#app-ver').textContent(),'v48');

  // 1. the Payments view: every payment and refund, newest first, totals equal to the Summary tiles for the same range
  await page.locator('#btn-payments').click();await page.locator('#payPanel').waitFor({state:'visible'});
  const rows=async()=>page.locator('#pl-body tr').evaluateAll(t=>t.map(x=>[...x.children].slice(0,4).map(c=>c.textContent.trim())));
  let r=await rows();
  assert.deepEqual(r.map(x=>x[0]),['2026-10-10','2026-10-05','2026-09-24','2026-08-24']);assert.equal(r[0][1],'Payments Person');assert.match(r[0][3],/−Rs 1,000|-Rs 1,000/);
  assert.match(await page.locator('#pl-body tr').first().textContent(),/Refund/);
  const tot=await page.locator('#pl-tot').textContent();assert.match(tot,/Paid in Rs 10,400 \(3 payments\)/);assert.match(tot,/Refunds .Rs 1,000 \(1\)/);assert.match(tot,/Net Rs 9,400/);
  await page.locator('#range').selectOption('all');await until(async()=>/10,400/.test(await page.locator('#t-col').textContent()),'Summary all time');
  assert.match(await page.locator('#t-ref').textContent(),/1,000/);
  check('Payments lists all 4 payments and refunds newest first (the refund marked Refund, negative); Paid in Rs 10,400, Refunds Rs 1,000, Net Rs 9,400 equal the Summary tiles for all time');

  // 2. filters: search, kind, product, range
  await page.locator('#pl-q').fill('left early');assert.equal(await page.locator('#pl-body tr').count(),1);await page.locator('#pl-q').fill('');
  await page.locator('#pl-kind').selectOption('ref');assert.equal(await page.locator('#pl-body tr').count(),1);await page.locator('#pl-kind').selectOption('pay');assert.equal(await page.locator('#pl-body tr').count(),3);await page.locator('#pl-kind').selectOption('');
  await page.locator('#pl-prod').selectOption('pkg_g');assert.equal(await page.locator('#pl-body tr').count(),0);assert.equal(await page.locator('#pl-none').isVisible(),true);await page.locator('#pl-prod').selectOption('');
  await page.locator('#pl-range').selectOption('month');r=await rows();assert.deepEqual(r.map(x=>x[0]),['2026-10-10','2026-10-05']);
  await page.locator('#pl-range').selectOption('custom');await page.locator('#pl-from').fill('2026-08-01');await page.locator('#pl-from').dispatchEvent('change');await page.locator('#pl-to').fill('2026-09-30');await page.locator('#pl-to').dispatchEvent('change');
  r=await rows();assert.deepEqual(r.map(x=>x[0]),['2026-09-24','2026-08-24']);await page.locator('#pl-range').selectOption('all');
  check('search, payments/refunds only, product and date range (this month, custom) narrow the list');

  // 3. tapping a line opens that customer (a cancelled customer too)
  await page.locator('#pl-body tr',{hasText:'Cancelled Payer'}).click();
  await page.locator('tr.detail[data-id=pb]').waitFor();assert.equal(await page.locator('#payPanel').isHidden(),true);
  check('tapping a line closes the list and opens that customer, even a cancelled one');

  // 4. per-plan heading right under the bill boxes
  await page.locator('tr.row[data-id=pa]').click();const det=page.locator('tr.detail[data-id=pa]');await det.waitFor();
  assert.equal(await det.locator('.periods + h4.pays-h').count(),1);assert.match(await det.locator('h4.pays-h').textContent(),/Payments and refunds \(3\)/);
  check('each plan shows "Payments and refunds (3)" right under its bill boxes');

  // 5. CSV: refunds exported as negative rows and read back as refunds (no duplicates on re-import)
  await page.locator('#btn-io').click();const [dl]=await Promise.all([page.waitForEvent('download'),page.locator('#btn-export').click()]);
  const csv=fs.readFileSync(await dl.path(),'utf8');fs.writeFileSync(path.join(out,'users.csv'),csv);
  const refLine=csv.split('\n').find(l=>/2026-10-10/.test(l));assert.ok(refLine,'refund row');assert.match(refLine,/,-1000,/);assert.match(refLine,/Refund: left early/);
  await page.fill('#importText',csv);await page.click('#btn-import');await page.waitForFunction(()=>/Imported/.test(document.querySelector('#importMsg').textContent),null,{timeout:20000});
  await until(async()=>true,'');await page.waitForTimeout(1500);
  const s1=(await doc('users/pa')).subscriptions[0];assert.equal(s1.payments.length,2);assert.equal((s1.refunds||[]).length,1);assert.equal(s1.refunds[0].amount,1000);assert.equal(s1.refunds[0].note,'left early');
  check('the users CSV has the refund as its own row (-1000, "Refund: left early"); importing that file back keeps 2 payments and 1 refund');
  await page.locator('#btn-io').click();

  // 6. layout at 390 and 1400, light and dark
  for(const [w,h,scheme] of [[390,844,'light'],[390,844,'dark'],[1400,900,'light'],[1400,900,'dark']]){await page.setViewportSize({width:w,height:h});await page.emulateMedia({colorScheme:scheme});
    await page.locator('#btn-payments').click();await page.locator('#payPanel').waitFor({state:'visible'});await page.screenshot({path:path.join(out,`payments-${w}-${scheme}.png`)});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`no sideways scroll at ${w} ${scheme}`);await page.locator('#pl-close').click();}
  check('the Payments view fits at 390px and 1400px in light and dark with no sideways scroll');
  assert.deepEqual(errors,[]);check('No unexpected console/page errors');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({version:'48',checks},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
