// v39: USD bills are worked out to the cent and shown with two decimals; PKR stays in whole rupees. Synthetic local records only.
// Start a disposable server (see AGENTS.md), then: node tests/usd-cents-flow.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.WASOOLI_TEST_URL||'http://127.0.0.1:8098',H={'X-Requested-With':'wasool','Content-Type':'application/json'},checks=[];
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).protocol,'http:');
const out=path.resolve(process.env.WASOOLI_TEST_OUTPUT||'data/usd-cents-qa');fs.mkdirSync(out,{recursive:true});
const check=n=>{checks.push(n);console.log('PASS '+n);};
const pay=(id,date,amount,currency)=>({id,date,amount,currency});
const plan=(o)=>Object.assign({id:'s1',kind:'monthly',cycle:'monthly',packageId:'pkg_c',prorate:true,prorationBasis:'fixed30',payments:[]},o);
/* cycle runs 24th to 23rd; fixed 30-day basis for partial months */
const USERS={
  usddisc:{name:'USD Discount',joinDate:'2026-09-24',subscriptions:[plan({currency:'USD',start:'2026-09-24',discount:{type:'percent',value:10},prices:[{from:'2026-09-24',price:25}],payments:[pay('p1','2026-09-24',22.5,'USD'),pay('p2','2026-10-24',22.5,'USD')]})]},
  usdpart:{name:'USD Partial',joinDate:'2026-10-10',subscriptions:[plan({currency:'USD',start:'2026-10-10',prices:[{from:'2026-10-10',price:20}],payments:[pay('p1','2026-10-10',9.33,'USD'),pay('p2','2026-10-24',20,'USD')]})]},
  usdshort:{name:'USD Short',joinDate:'2026-09-24',subscriptions:[plan({currency:'USD',start:'2026-09-24',discount:{type:'percent',value:10},prices:[{from:'2026-09-24',price:25}],payments:[pay('p1','2026-09-24',22.5,'USD'),pay('p2','2026-10-24',22,'USD')]})]},
  pkrdisc:{name:'PKR Discount',joinDate:'2026-09-24',subscriptions:[plan({currency:'PKR',start:'2026-09-24',discount:{type:'percent',value:10},prices:[{from:'2026-09-24',price:4200}],payments:[pay('p1','2026-09-24',3780,'PKR'),pay('p2','2026-10-24',3780,'PKR')]})]},
  pkrpart:{name:'PKR Partial',joinDate:'2026-10-10',subscriptions:[plan({currency:'PKR',start:'2026-10-10',prices:[{from:'2026-10-10',price:4200}],payments:[pay('p1','2026-10-10',1960,'PKR'),pay('p2','2026-10-24',4200,'PKR')]})]}
};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--disable-gpu']});
 try{
  const ctx=await browser.newContext({viewport:{width:1400,height:900}});await ctx.addInitScript(()=>{if(!localStorage.getItem('pt-today'))localStorage.setItem('pt-today','2026-10-28');});
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(base+'/login',{waitUntil:'domcontentloaded'});await page.locator('[name=passcode]').fill('test1234');await page.locator('button[type=submit]').click();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  const api=async(method,pth,data)=>ctx.request.fetch(base+pth,{method,headers:H,data:data===undefined?undefined:JSON.stringify(data)});
  await api('POST','/api/import',{docs:{},replace:['users/','costs/']});for(const [id,u] of Object.entries(USERS))assert.equal((await api('PUT','/api/docs/users/'+id,u)).status(),200);
  await page.reload();await page.waitForSelector('tr.row[data-id="usddisc"]');await page.waitForTimeout(2500);
  const row=async id=>(await page.locator('tr.row[data-id="'+id+'"]').innerText()).replace(/\s+/g,' ');

  let t=await row('usddisc');assert.match(t,/\$22\.50\/mo/);assert.doesNotMatch(t,/Overdue/);assert.doesNotMatch(t,/\$23/);
  check('$25 with 10% off bills $22.50 (shown with cents) and a user who paid $22.50 each month is not overdue');
  t=await row('usdpart');assert.doesNotMatch(t,/Overdue/);
  check('A $20 plan started on the 10th bills the first 14 days as $9.33, so paying $9.33 then $20 leaves nothing owed');
  t=await row('usdshort');assert.match(t,/Overdue/);assert.match(t,/\$0\.50/);
  check('Paying $22 against a $22.50 bill leaves exactly $0.50 owed, shown with cents');
  t=await row('pkrdisc');assert.match(t,/Rs 3,780\/mo/);assert.doesNotMatch(t,/Overdue/);
  t=await row('pkrpart');assert.doesNotMatch(t,/Overdue/);
  check('PKR plans are unchanged: Rs 4,200 at 10% off is Rs 3,780 and the 14-day first bill is Rs 1,960');

  /* the first-period bill text in the plan details */
  await page.locator('tr.row[data-id="usdpart"] td.who .nm').click();await page.waitForSelector('tr.detail[data-id="usdpart"]');
  const det=(await page.locator('tr.detail[data-id="usdpart"]').innerText()).replace(/\s+/g,' ');assert.match(det,/\$9\.33/);
  check('The plan details show the first partial bill as $9.33');

  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  check('No sideways scroll at 390px');
  assert.deepEqual(errors,[]);check('No unexpected console/page errors');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({version:'40',checks},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
