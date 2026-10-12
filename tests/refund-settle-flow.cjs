// v40: a bill reduction followed by "Stop access and return money" is not taken off the last bill twice. Synthetic local records only.
// Start a disposable server (see AGENTS.md), then: node tests/refund-settle-flow.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.WASOOLI_TEST_URL||'http://127.0.0.1:8098',H={'X-Requested-With':'wasool','Content-Type':'application/json'},checks=[];
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).protocol,'http:');
const out=path.resolve(process.env.WASOOLI_TEST_OUTPUT||'data/refund-settle-qa');fs.mkdirSync(out,{recursive:true});
const check=n=>{checks.push(n);console.log('PASS '+n);};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--disable-gpu']});
 try{
  const ctx=await browser.newContext({viewport:{width:1400,height:900}});await ctx.addInitScript(()=>{if(!localStorage.getItem('pt-today'))localStorage.setItem('pt-today','2026-10-28');});
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(base+'/login',{waitUntil:'domcontentloaded'});await page.locator('[name=passcode]').fill('test1234');await page.locator('button[type=submit]').click();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  const api=async(method,pth,data)=>{const r=await ctx.request.fetch(base+pth,{method,headers:H,data:data===undefined?undefined:JSON.stringify(data)});let j=null;try{j=await r.json();}catch(e){}return {status:r.status(),j};};
  await api('POST','/api/import',{docs:{'users/ali':{name:'Ali Leaving',joinDate:'2026-09-24',subscriptions:[{id:'s1',kind:'monthly',cycle:'monthly',packageId:'pkg_c',currency:'PKR',start:'2026-09-24',prorate:true,prices:[{from:'2026-09-24',price:4200}],payments:[{id:'p1',date:'2026-09-24',amount:4200,currency:'PKR'},{id:'p2',date:'2026-10-24',amount:4200,currency:'PKR'}]}]}},replace:['users/','costs/']});
  await page.reload();await page.waitForSelector('tr.row[data-id="ali"]');await page.waitForTimeout(1500);
  const det=()=>page.locator('tr.detail[data-id="ali"]');
  const expand=async()=>{if(!(await det().count()))await page.locator('tr.row[data-id="ali"]').click();await det().waitFor();};
  const openRefund=async()=>{await expand();await det().locator('[data-key="refund:s1"]').first().click();await page.locator('#refundDialog[open]').waitFor();};

  /* 1. Rs 1,000 back as a discount on the October bill */
  await openRefund();await page.locator('#refund-purpose').selectOption('bill');await page.locator('#refund-period').selectOption('2026-10-24');await page.locator('#refund-amount').fill('1000');await page.locator('#refund-date').fill('2026-10-28');await page.waitForTimeout(200);
  await page.locator('#refund-save').click();await page.locator('#refundDialog').waitFor({state:'hidden'});await page.waitForTimeout(800);
  /* 2. he leaves: Rs 2,100 back and access stops on 28 Oct */
  await openRefund();await page.locator('#refund-purpose').selectOption('cancel');await page.locator('#refund-amount').fill('2100');await page.locator('#refund-date').fill('2026-10-28');await page.locator('#refund-last').fill('2026-10-28');await page.locator('#refund-last').dispatchEvent('change');await page.waitForTimeout(300);
  assert.equal(await page.locator('#refund-save').isDisabled(),false);await page.locator('#refund-save').click();await page.locator('#refundDialog').waitFor({state:'hidden'});await page.waitForTimeout(1000);

  const s=(await api('GET','/api/docs/users/ali')).j.data.subscriptions[0];const ov=s.periodOverrides['2026-10-24'];
  assert.equal(ov.fromRefund,true);assert.equal(ov.amount,1100);
  check('The settlement records Rs 1,100 kept for October (Rs 8,400 paid, Rs 1,000 + Rs 2,100 returned, Rs 4,200 for September)');
  await page.locator('#statusFilter').selectOption('all');await page.waitForTimeout(400);/* cancelled customers are listed under All or Cancelled */
  await expand();const txt=(await det().innerText()).replace(/\s+/g,' ');
  assert.match(txt,/Rs 4,200 → Rs 1,100/);assert.doesNotMatch(txt,/→ Rs 100\)/);
  check('October\'s bill shows Rs 1,100 kept, not Rs 100 (the Rs 1,000 reduction is not taken off twice)');
  assert.match(await page.locator('tr.row[data-id="ali"]').innerText(),/Cancelled · settled/);
  check('The customer shows "Cancelled · settled": nothing owed either way');

  assert.deepEqual(errors,[]);check('No unexpected console/page errors');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({version:'44',checks},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
