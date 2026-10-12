// v42 #24: changing a plan's currency or billing cycle in Edit plan asks for a new price and a start date instead of reusing the old number.
// Synthetic local records only. Start a disposable server (see AGENTS.md), then: node tests/plan-change-flow.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.WASOOLI_TEST_URL||'http://127.0.0.1:8098',H={'X-Requested-With':'wasool','Content-Type':'application/json'},checks=[];
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).protocol,'http:');
const out=path.resolve(process.env.WASOOLI_TEST_OUTPUT||'data/plan-change-qa');fs.mkdirSync(out,{recursive:true});
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
  const det=id=>page.locator('tr.detail[data-id="'+id+'"]');
  const expand=async id=>{if(!(await det(id).count()))await page.locator('tr.row[data-id="'+id+'"]').click();await det(id).waitFor();return det(id);};
  await api('POST','/api/import',{docs:{
   'users/pc1':{name:'Paid Currency Person',joinDate:'2026-09-24',subscriptions:[mon('s1','2026-09-24',{payments:[pay('p1','2026-09-24',4200)]})]},
   'users/pc2':{name:'Fresh Mistake Person',joinDate:'2026-10-10',subscriptions:[mon('s1','2026-10-10')]},
   'users/pc3':{name:'Cycle Change Person',joinDate:'2026-08-24',subscriptions:[mon('s1','2026-08-24',{payments:[pay('p1','2026-08-24',4200),pay('p2','2026-09-24',4200)]})]},
  },replace:[]});
  await page.reload();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  const form=async(uid)=>{const d=await expand(uid);await d.locator('[data-key="edit:s1"]').first().click();const f=d.locator('form.subedit-form[data-sub=s1]');await f.waitFor({state:'visible'});return f;};

  // A: a plan with a receipt, currency changed
  let f=await form('pc1');
  assert.equal(await f.locator('[data-role=chg-block]').isHidden(),true);check('the new-price block is hidden while currency and cycle are unchanged');
  await f.locator('[name=currency]').selectOption('USD');
  assert.equal(await f.locator('[data-role=chg-block]').isVisible(),true);check('changing Pays in shows the new-price block');
  const optsA=await f.locator('[name=chgFrom] option').evaluateAll(o=>o.map(x=>x.value));
  assert.ok(optsA.length>=1&&!optsA.includes('start')&&optsA.every(v=>/^\d{4}-\d\d-\d\d$/.test(v)),JSON.stringify(optsA));check('a plan with a receipt offers only later cycles, never "from the start"');
  await f.locator('button[type=submit]').click();
  await page.waitForTimeout(500);let u=await doc('users/pc1');assert.equal(u.subscriptions.length,1);assert.equal(u.subscriptions[0].currency,'PKR');check('saving without a new price is refused and changes nothing');
  await f.locator('[name=chgPrice]').fill('30');const eff=await f.locator('[name=chgFrom]').inputValue();
  await f.locator('button[type=submit]').click();
  await until(async()=>(await doc('users/pc1')).subscriptions.length===2,'split plan saved');
  u=await doc('users/pc1');const [o,n]=u.subscriptions;
  assert.equal(o.currency,'PKR');assert.equal(o.prices[0].price,4200);assert.equal(o.payments.length,1);assert.equal(o.end,new Date(Date.parse(eff)-864e5).toISOString().slice(0,10));
  assert.equal(n.currency,'USD');assert.equal(n.start,eff);assert.deepEqual(n.prices,[{from:eff,price:30}]);assert.equal(n.cycle,'monthly');assert.equal(n.packageId,'pkg_c');
  check('currency change with money recorded: old plan keeps its PKR price and receipt and ends the day before; a new USD plan starts at the chosen cycle at the new price');

  // B: a plan with nothing recorded, corrected from its start
  f=await form('pc2');await f.locator('[name=currency]').selectOption('USD');
  const optsB=await f.locator('[name=chgFrom] option').evaluateAll(o=>o.map(x=>x.value));assert.ok(optsB.includes('start'));check('a plan with nothing recorded also offers "from the plan\'s start"');
  await f.locator('[name=chgFrom]').selectOption('start');await f.locator('[name=chgPrice]').fill('20');await f.locator('button[type=submit]').click();
  await until(async()=>(await doc('users/pc2')).subscriptions[0].currency==='USD','corrected plan saved');
  u=await doc('users/pc2');assert.equal(u.subscriptions.length,1);assert.deepEqual(u.subscriptions[0].prices,[{from:'2026-10-10',price:20}]);
  check('corrected from the start: same plan, new currency and only the new price');

  // C: billing cycle monthly -> yearly
  f=await form('pc3');await f.locator('[name=packageId]').selectOption('pkg_g');
  assert.match(await f.locator('[data-role=chg-per]').textContent(),/year/);check('the price label follows the new cycle (per year)');
  await f.locator('[name=chgPrice]').fill('45000');await f.locator('button[type=submit]').click();
  await until(async()=>(await doc('users/pc3')).subscriptions.length===2,'cycle split saved');
  u=await doc('users/pc3');assert.equal(u.subscriptions[0].cycle,'monthly');assert.equal(u.subscriptions[0].prices[0].price,4200);assert.equal(u.subscriptions[0].packageId,'pkg_c');assert.equal(u.subscriptions[1].packageId,'pkg_g');assert.equal(u.subscriptions[1].cycle,'yearly');assert.equal(u.subscriptions[1].prices[0].price,45000);assert.equal(u.subscriptions[1].paymentEvery,12);
  check('cycle change by moving to the yearly package G: old monthly plan keeps package C and its price, new yearly plan is on G at the new price');

  // E: a plan's cycle must match its package's cycle (C is monthly, G is yearly)
  f=await form('pc2');await f.locator('[name=cycle]').selectOption('yearly');await f.locator('[name=chgPrice]').fill('1000');await f.locator('[name=chgFrom]').selectOption('start');
  await f.locator('button[type=submit]').click();await page.waitForSelector('.toast');
  assert.match(await page.locator('.toast').last().textContent(),/C is a monthly package, so Billing cycle must be Monthly/);
  u=await doc('users/pc2');assert.equal(u.subscriptions[0].cycle,'monthly');check('yearly cycle on the monthly package C is refused and nothing is saved');
  await f.locator('[name=cycle]').selectOption('monthly');await f.locator('[name=packageId]').selectOption('pkg_g');
  assert.equal(await f.locator('[name=cycle]').inputValue(),'yearly');check('choosing the yearly package G in Edit plan sets Billing cycle to Yearly by itself');
  await f.locator('[name=packageId]').selectOption('pkg_c');
  const d2=await expand('pc2');await d2.locator('[data-key=addsub]').first().click();const add=d2.locator('form.addsub-form');await add.locator('[name=packageId]').selectOption('pkg_g');
  await add.locator('[name=kind]').selectOption('monthly');await add.locator('[name=price]').fill('100');await add.locator('[name=date]').fill('2026-10-20');await add.locator('button[type=submit]').click();
  await page.waitForFunction(()=>/yearly package/.test((document.querySelector('[data-role=addsub-err],#addsub-err,.addsub-form .err')||{}).textContent||''),null,{timeout:5000});
  u=await doc('users/pc2');assert.equal(u.subscriptions.length,1);check('Add plan: a monthly cycle on the yearly package G is refused and nothing is added');

  // D: ordinary edit still saves without a price
  f=await form('pc1');await f.locator('[name=name]').first().fill('Label only');await f.locator('button[type=submit]').click();
  await until(async()=>(await doc('users/pc1')).subscriptions.some(s=>s.name==='Label only'),'plain edit saved');
  u=await doc('users/pc1');assert.equal(u.subscriptions.length,2);check('an ordinary edit (no currency or cycle change) saves as before and adds no plan');

  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);check('No sideways scroll and no unexpected console/page errors');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({version:'46',checks},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
