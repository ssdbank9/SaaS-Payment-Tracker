// v39: yearly and instalment periods are prorated by actual days under the fixed-30-day setting too; one-time items never are.
// Synthetic local records only. Start a disposable server (see AGENTS.md), then: node tests/yearly-proration-flow.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.WASOOLI_TEST_URL||'http://127.0.0.1:8098',H={'X-Requested-With':'wasool','Content-Type':'application/json'},checks=[];
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).protocol,'http:');
const out=path.resolve(process.env.WASOOLI_TEST_OUTPUT||'data/yearly-proration-qa');fs.mkdirSync(out,{recursive:true});
const check=n=>{checks.push(n);console.log('PASS '+n);};
/* shared billing cycle: 24 July to 23 July for yearly plans, 24th to 23rd for monthly; today is 28 Oct 2026; Settings use the fixed 30-day month */
const yearly=(start,extra)=>Object.assign({id:'s1',kind:'monthly',cycle:'yearly',packageId:'pkg_g',currency:'PKR',start,prorate:true,prices:[{from:start,price:36000}],payments:[]},extra||{});
const monthly=(start,pays)=>({id:'s2',kind:'monthly',cycle:'monthly',packageId:'pkg_c',currency:'PKR',start,prorate:true,prices:[{from:start,price:4200}],payments:pays||[]});
const user=(name,subs)=>({name,joinDate:'2026-08-24',subscriptions:subs});
const USERS={
  y1:user('Yearly Default',[yearly('2026-10-10')]),
  y2:user('Yearly April',[yearly('2026-04-10')]),
  y3:user('Yearly Actual',[yearly('2026-10-10',{prorationBasis:'actual'})]),
  q1:user('Quarterly',[yearly('2026-09-01',{paymentEvery:3})]),
  m1:user('Monthly',[monthly('2026-10-10')]),
  o1:user('One Time',[{id:'s3',kind:'one-time',packageId:'',name:'Setup',currency:'PKR',total:5000,due:'2026-10-31',start:'2026-10-10',payments:[]}]),
  add:user('Added Product',[monthly('2026-08-24',[{id:'p1',date:'2026-08-24',amount:4200,currency:'PKR'},{id:'p2',date:'2026-09-24',amount:4200,currency:'PKR'},{id:'p3',date:'2026-10-24',amount:4200,currency:'PKR'}]),Object.assign(yearly('2026-10-10'),{id:'s9'})])
};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--disable-gpu']});
 try{
  const ctx=await browser.newContext({viewport:{width:1400,height:900}});await ctx.addInitScript(()=>{if(!localStorage.getItem('pt-today'))localStorage.setItem('pt-today','2026-10-28');});
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(base+'/login',{waitUntil:'domcontentloaded'});await page.locator('[name=passcode]').fill('test1234');await page.locator('button[type=submit]').click();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  const api=async(method,pth,data)=>ctx.request.fetch(base+pth,{method,headers:H,data:data===undefined?undefined:JSON.stringify(data)});
  assert.equal((await api('PATCH','/api/docs/settings/main',{prorationBasis:'fixed30'})).status(),200);
  await api('POST','/api/import',{docs:{},replace:['users/','costs/']});for(const [id,u] of Object.entries(USERS))assert.equal((await api('PUT','/api/docs/users/'+id,u)).status(),200);
  await page.reload();await page.waitForSelector('tr.row[data-id="y1"]');await page.waitForTimeout(2500);
  const row=async id=>(await page.locator('tr.row[data-id="'+id+'"]').innerText()).replace(/\s+/g,' ');

  let t=await row('y1');assert.match(t,/Rs 28,307/);assert.doesNotMatch(t,/Rs 36,000 Rs 0|Rs 36,000 Overdue/);
  check('A yearly Rs 36,000 plan that started 10 Oct is billed Rs 28,307 (287 of 365 days) under the fixed 30-day setting, not the full Rs 36,000');
  assert.match(await row('y3'),/Rs 28,307/);
  check('A yearly plan already set to actual days gives the same Rs 28,307');
  t=await row('y2');assert.match(t,/Rs 46,356/);assert.doesNotMatch(t,/Rs 72,000/);
  check('A yearly plan that started 10 Apr owes Rs 10,356 for its 105-day first period plus the full Rs 36,000 for the year now running (Rs 46,356, not Rs 72,000)');
  t=await row('q1');assert.match(t,/Rs 14,185/);
  check('A quarterly instalment plan started 1 Sep owes Rs 5,185 (53 of 92 days of Rs 9,000) plus the full Rs 9,000 instalment now due');
  t=await row('m1');assert.match(t,/Rs 6,160/);
  check('Monthly plans are unchanged: Rs 4,200 from 10 Oct is Rs 1,960 (14 x Rs 140) plus the full Rs 4,200');
  t=await row('o1');assert.match(t,/Rs 5,000/);assert.doesNotMatch(t,/Rs 5,000 Rs 0|Rs 1,|Rs 2,|Rs 3,/);
  check('A one-time item started mid-cycle is never prorated: it stays Rs 5,000');
  t=await row('add');assert.match(t,/Rs 28,307 Overdue/);assert.doesNotMatch(t,/Rs 36,000 Overdue/);
  check('A new yearly product added for an existing monthly customer starts on its own purchase day (10 Oct) and is billed Rs 28,307 for that first period');

  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  check('No sideways scroll at 390px');
  assert.deepEqual(errors,[]);check('No unexpected console/page errors');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({version:'46',checks},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
