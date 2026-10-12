// v39: a plan that starts mid-cycle is due on its own start date, not on the cycle start. Synthetic local records only.
// Start a disposable server (see AGENTS.md), then: node tests/due-day-flow.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.WASOOLI_TEST_URL||'http://127.0.0.1:8098',H={'X-Requested-With':'wasool','Content-Type':'application/json'},checks=[];
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).protocol,'http:');
const out=path.resolve(process.env.WASOOLI_TEST_OUTPUT||'data/due-day-qa');fs.mkdirSync(out,{recursive:true});
const check=n=>{checks.push(n);console.log('PASS '+n);};
const plan=(start,pays)=>({id:'s1',kind:'monthly',cycle:'monthly',packageId:'pkg_c',currency:'PKR',start,prices:[{from:start,price:4200}],payments:pays||[]});
const user=(name,start,pays)=>({name,joinDate:start,subscriptions:[plan(start,pays)]});
/* billing cycle runs 24th to 23rd (the default settings) */
const USERS={
  today:user('Starts Today','2026-10-28'),
  future:user('Starts Friday','2026-10-30'),
  yesterday:user('Started Yesterday','2026-10-27'),
  cycleday:user('Cycle Day Start','2026-10-24'),
  old:user('Old Regular','2026-08-24',[{id:'p1',date:'2026-08-24',amount:4200,currency:'PKR'},{id:'p2',date:'2026-09-24',amount:4200,currency:'PKR'}])
};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--disable-gpu']});
 try{
  const ctx=await browser.newContext({viewport:{width:1400,height:900}});
  const setToday=async d=>{await ctx.addInitScript(x=>{if(!localStorage.getItem('pt-today'))localStorage.setItem('pt-today',x);},d);};/* only when unset, so the test can move the date later */
  await setToday('2026-10-28');const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(base+'/login',{waitUntil:'domcontentloaded'});await page.locator('[name=passcode]').fill('test1234');await page.locator('button[type=submit]').click();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  const api=async(method,pth,data)=>ctx.request.fetch(base+pth,{method,headers:H,data:data===undefined?undefined:JSON.stringify(data)});
  await api('POST','/api/import',{docs:{},replace:['users/','costs/']});for(const [id,u] of Object.entries(USERS))assert.equal((await api('PUT','/api/docs/users/'+id,u)).status(),200);
  const row=async id=>(await page.locator('tr.row[data-id="'+id+'"]').innerText()).replace(/\s+/g,' ');
  const show=async d=>{await page.evaluate(x=>localStorage.setItem('pt-today',x),d);await page.reload();await page.waitForSelector('tr.row[data-id="today"]');await page.waitForTimeout(2500);};
  await show('2026-10-28');

  let t=await row('today');assert.match(t,/Due today/);assert.doesNotMatch(t,/Overdue/);
  check('A plan that starts today (mid-cycle) is "Due today", not overdue');
  t=await row('future');assert.match(t,/Starts later/);assert.doesNotMatch(t,/Overdue/);assert.doesNotMatch(t,/Rs 3,\d{3}/);assert.doesNotMatch(t,/Rs 4,200 Rs 0/);
  check('A plan that starts in two days shows "Starts later" and no balance');
  for(const id of ['yesterday','cycleday','old']){assert.match(await row(id),/Overdue since Oct 2[47]/);}
  check('Plans that really are late (started yesterday, on the cycle day, long ago) are still overdue');
  const tiles=(await page.locator('.tile').allInnerTexts()).map(x=>x.replace(/\s+/g,' ')).join(' || ');
  assert.match(tiles,/Outstanding balance Rs 16,100/);assert.match(tiles,/owed by 4 users/);assert.match(tiles,/4 of 5 active users · 3 overdue/);
  check('The Outstanding tile counts the due and overdue plans only (Rs 16,100, 4 users, 3 overdue), not the plan that has not started');

  /* the same plans two days later */
  await show('2026-10-30');
  t=await row('future');assert.match(t,/Due today/);assert.doesNotMatch(t,/Overdue/);
  t=await row('today');assert.match(t,/Overdue/);
  check('Two days later the plan that was "Starts later" is "Due today" and the one that started on the 28th is overdue');
  await show('2026-10-29');t=await row('today');assert.match(t,/Overdue/);t=await row('future');assert.match(t,/Starts later/);
  check('The day before its start the plan is still "Starts later"');

  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  check('No sideways scroll at 390px');
  assert.deepEqual(errors,[]);check('No unexpected console/page errors');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({version:'47',checks},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
