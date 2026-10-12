// v42: courtesy discounts (one bill, a number of bills, every bill; one-time items) and custom payment schedules (every N months, 1 to 24).
// Synthetic local records only. Start a disposable server (see AGENTS.md), then: node tests/courtesy-schedule-flow.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.WASOOLI_TEST_URL||'http://127.0.0.1:8098',H={'X-Requested-With':'wasool','Content-Type':'application/json'},checks=[];
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).protocol,'http:');
const out=path.resolve(process.env.WASOOLI_TEST_OUTPUT||'data/courtesy-qa');fs.mkdirSync(out,{recursive:true});
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
   'users/cd1':{name:'Courtesy Monthly Person',joinDate:'2026-08-24',subscriptions:[mon('s1','2026-08-24',{payments:[pay('p1','2026-08-24',4200),pay('p2','2026-09-24',4200)]})]},
   'users/cd2':{name:'Courtesy Item Person',joinDate:'2026-10-01',subscriptions:[{id:'s1',kind:'one-time',name:'Setup',packageId:null,currency:'PKR',total:10000,due:'2026-11-01',payments:[]}]},
   'users/cd3':{name:'Five Month Person',joinDate:'2026-01-24',subscriptions:[{id:'s1',kind:'monthly',cycle:'yearly',packageId:'pkg_g',currency:'PKR',start:'2026-01-24',prorate:true,prorationBasis:'actual',paymentEvery:5,prices:[{from:'2026-01-24',price:24000}],payments:[]}]},
  },replace:[]});
  await page.reload();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  const courtesy=async(uid,fill)=>{const d=await expand(uid);await d.locator('[data-key="courtesy:s1"]').first().click();const f=d.locator('form.courtesy-form[data-sub=s1]');await f.waitFor({state:'visible'});await fill(f);await f.locator('button[type=submit]').click();return f;};
  const plan=async uid=>(await doc('users/'+uid)).subscriptions[0];

  // one bill
  await courtesy('cd1',async f=>{assert.equal(await f.locator('[data-role=cd-n-wrap]').isHidden(),true);await f.locator('[name=amount]').fill('500');await f.locator('[name=from]').selectOption('2026-10-24');});
  await until(async()=>((await plan('cd1')).courtesy||[]).length===1,'one-bill courtesy saved');
  let c=(await plan('cd1')).courtesy[0];assert.deepEqual([c.from,c.to,c.amount],['2026-10-24','2026-10-24',500]);
  await until(async()=>/3,700/.test(await det('cd1').textContent()),'Rs 3,700 bill shown');check('one bill: Rs 500 off only the 24 Oct bill (shown as Rs 3,700)');
  // a number of bills
  await courtesy('cd1',async f=>{await f.locator('[name=amount]').fill('200');await f.locator('[name=from]').selectOption('2026-11-24');await f.locator('[name=tenure]').selectOption('n');assert.equal(await f.locator('[name=count]').isVisible(),true);await f.locator('[name=count]').fill('3');});
  await until(async()=>((await plan('cd1')).courtesy||[]).length===2,'n-bills courtesy saved');
  c=(await plan('cd1')).courtesy[1];assert.deepEqual([c.from,c.to,c.amount],['2026-11-24','2027-01-24',200]);check('a number of bills: Rs 200 off 3 bills, 24 Nov to 24 Jan');
  // every bill
  await courtesy('cd1',async f=>{await f.locator('[name=amount]').fill('100');await f.locator('[name=from]').selectOption('2027-02-24');await f.locator('[name=tenure]').selectOption('all');});
  await until(async()=>((await plan('cd1')).courtesy||[]).length===3,'every-bill courtesy saved');
  c=(await plan('cd1')).courtesy[2];assert.equal(c.to,null);assert.equal(c.from,'2027-02-24');check('every bill: Rs 100 off from 24 Feb with no end');
  assert.match(await det('cd1').locator('.courtesy-line').textContent(),/Courtesy discount:.*off the .*bill.*each bill from.*every bill from/);check('the plan shows a plain summary of its courtesy discounts');
  // remove asks first (the open form is also captured in both themes at 390px)
  let d=await expand('cd1');await d.locator('[data-key="courtesy:s1"]').first().click();
  {const f=d.locator('form.courtesy-form[data-sub=s1]');await f.locator('[name=tenure]').selectOption('n');await f.screenshot({path:path.join(out,'courtesy-form-light.png')});
   await page.emulateMedia({colorScheme:'dark'});await page.waitForTimeout(300);await f.screenshot({path:path.join(out,'courtesy-form-dark.png')});await page.emulateMedia({colorScheme:'light'});}
  await d.locator('form.courtesy-form [data-act=courtesy-remove]').last().click();await d.locator('[data-act=courtesy-remove-yes]').click();
  await until(async()=>((await plan('cd1')).courtesy||[]).length===2,'courtesy removed');check('removing a courtesy discount asks Yes/Cancel and removes only that one');
  // the monthly plan's computed money (Summary discounts) includes the courtesy
  // one-time item
  await courtesy('cd2',async f=>{assert.equal(await f.locator('[name=from]').count(),0);await f.locator('[name=amount]').fill('1000');});
  await until(async()=>((await plan('cd2')).courtesy||[]).length===1,'item courtesy saved');
  c=(await plan('cd2')).courtesy[0];assert.equal(c.amount,1000);assert.equal(c.from,undefined);
  await until(async()=>/Remaining\s*Rs\s*9,000/.test(await det('cd2').textContent()),'item remaining 9,000');check('one-time item: Rs 1,000 courtesy leaves Rs 9,000 to pay');

  // custom schedule: every 5 months on a yearly G plan (Rs 24,000 a year -> Rs 10,000 per 5 months)
  d=await expand('cd3');await until(async()=>/10,000/.test(await d.textContent()),'5-month instalment shown');check('a yearly plan paid every 5 months bills Rs 10,000 per instalment');
  // Add plan offers the custom choices and saves one
  await d.locator('[data-key=addsub]').first().click();const add=d.locator('form.addsub-form');await add.locator('[name=packageId]').selectOption('pkg_g');
  const vals=await add.locator('[name=paymentEvery] option').evaluateAll(o=>o.map(x=>+x.value));assert.deepEqual(vals.slice().sort((a,b)=>a-b),Array.from({length:24},(_,i)=>i+1));check('the payment schedule offers every 1 to 24 months (custom choices grouped)');
  await add.locator('[name=price]').fill('24000');await add.locator('[name=date]').fill('2026-10-24');await add.locator('[name=paymentEvery]').selectOption('24');await add.locator('button[type=submit]').click();
  await until(async()=>(await doc('users/cd3')).subscriptions.length===2,'24-month plan added');
  assert.equal((await doc('users/cd3')).subscriptions[1].paymentEvery,24);check('a plan saved with "every 24 months" keeps that schedule');
  await page.waitForTimeout(1500);
  for(const id of ['cd1','cd2','cd3'])if(!(await det(id).count()))await expand(id);
  await page.screenshot({path:path.join(out,'courtesy-390.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);check('No sideways scroll and no unexpected console/page errors');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({version:'42',checks},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
