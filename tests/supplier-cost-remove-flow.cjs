// v61: Edit plan can remove a plan's supplier cost; its computed cycle-cost rows leave Costs, actual expenses stay.
// Synthetic records on a disposable server only:  WASOOLI_TEST_URL=http://127.0.0.1:<port> node tests/supplier-cost-remove-flow.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const stubWebFonts=require('./webfonts.cjs');

const base=process.env.WASOOLI_TEST_URL||'http://127.0.0.1:8098',H={'X-Requested-With':'wasool','Content-Type':'application/json'},checks=[];
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).protocol,'http:');
const out=path.resolve(process.env.WASOOLI_TEST_OUTPUT||'data/supplier-cost-remove-qa');fs.mkdirSync(out,{recursive:true});
const check=n=>{checks.push(n);console.log('PASS '+n);};
const AC={frequency:'monthly',entries:[{from:'2026-08-24',amount:840,currency:'PKR',rate:0,paidIn:'PKR',supplier:''}],overrides:{},first:'full',firstAmount:null};
const plan=(id,extra)=>Object.assign({id,kind:'monthly',cycle:'monthly',name:'',packageId:'pkg_c',currency:'PKR',start:'2026-08-24',prorate:true,prices:[{from:'2026-08-24',price:4200}],payments:[]},extra||{});
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--disable-gpu']});
 try{
  const ctx=await browser.newContext({viewport:{width:1400,height:900}});await stubWebFonts(ctx);
  await ctx.addInitScript(()=>{if(!localStorage.getItem('pt-today'))localStorage.setItem('pt-today','2026-10-20');localStorage.setItem('pt-sum-open','1');});
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(base+'/login',{waitUntil:'domcontentloaded'});await page.locator('[name=passcode]').fill('test1234');await page.locator('button[type=submit]').click();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  const api=async(method,pth,data)=>{const r=await ctx.request.fetch(base+pth,{method,headers:H,data:data===undefined?undefined:JSON.stringify(data)});let j=null;try{j=await r.json();}catch(e){}return {status:r.status(),j};};
  for(const p of ['users/','costs/'])for(const d of ((await api('GET','/api/docs?prefix='+p)).j.docs||[]))await api('DELETE','/api/docs/'+d.path);
  await api('POST','/api/import',{docs:{
   'users/rm':{name:'Remove Person',joinDate:'2026-08-24',subscriptions:[plan('s1',{accountCost:AC}),plan('s2',{accountCost:JSON.parse(JSON.stringify(AC))})]},
   'costs/own1':{date:'2026-10-02',description:'Remove Person · own expense',category:'Product',packageId:'pkg_c',currency:'PKR',cost:500,tax:0,rate:0,receipt:'',source:'manual',userId:'rm',subscriptionId:'s1'},
  },replace:[]});
  await page.reload();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2000);
  assert.equal(await page.locator('#app-ver').textContent(),'v67');
  const doc=async()=>(await api('GET','/api/docs/users/rm')).j.data;
  const cycleRows=async()=>page.locator('#costBody [data-act=cost-edit][data-cost^="ac_rm_"]').evaluateAll(els=>els.map(e=>e.dataset.cost));
  const det=()=>page.locator('tr.detail[data-id=rm]');
  const open=async()=>{if(!(await det().count()))await page.locator('tr.row[data-id=rm]').click();await det().waitFor();};
  const planForm=async sid=>{await open();await det().locator('[data-key="edit:'+sid+'"]').first().click();const f=det().locator('.subedit-form[data-sub='+sid+']');await f.waitFor({state:'visible'});return f;};

  // 1. both plans produce cycle-cost rows (Aug, Sep, Oct for each = 6)
  const before=await cycleRows();assert.equal(before.filter(id=>id.startsWith('ac_rm_s1_')).length,2,before);assert.equal(before.filter(id=>id.startsWith('ac_rm_s2_')).length,2,before);
  check('two plans with a supplier cost each show two computed cycle-cost rows (Aug and Sep; Oct has not started)');

  // 2. the remove choice is offered only on a plan that has a supplier cost
  let f=await planForm('s2');const opts=await f.locator('[name=accountCostMode] option').evaluateAll(o=>o.map(x=>x.value));assert.ok(opts.includes('remove'),opts);
  await det().locator('[data-key="edit:s2"]').first().click();await f.waitFor({state:'hidden'});
  await det().locator('[data-key=addsub]').first().click();const add=det().locator('.addsub-form');await add.waitFor({state:'visible'});
  assert.equal(await add.locator('[name=accountCostMode] option[value=remove]').count(),0);await det().locator('[data-key=addsub]').first().click();await add.waitFor({state:'hidden'});
  check('Edit plan offers "No supplier cost: remove it" for a plan with a cost; Add plan does not');

  // 3. removing it: the plan loses accountCost, its rows leave Costs, the other plan and the owner's own expense stay
  f=await planForm('s2');await f.locator('[name=accountCostMode]').selectOption('remove');assert.equal(await f.locator('[data-role=account-cost-options]').isHidden(),true);
  await f.locator('button[type=submit]').click();await f.waitFor({state:'hidden'});await page.waitForTimeout(800);
  const u=await doc();assert.equal(u.subscriptions[1].accountCost,undefined);assert.deepEqual(u.subscriptions[0].accountCost.entries.map(e=>[e.from,e.amount,e.currency]),[['2026-08-24',840,'PKR']]);
  const after=await cycleRows();assert.equal(after.filter(id=>id.startsWith('ac_rm_s2_')).length,0,after);assert.equal(after.filter(id=>id.startsWith('ac_rm_s1_')).length,2,after);
  assert.equal(await page.locator('#costBody [data-act=cost-edit][data-cost=own1]').count(),1);assert.equal((await api('GET','/api/docs/costs/own1')).status,200);
  check('saving with "remove" drops the supplier cost: its rows are gone, the other plan keeps its two, and the hand-entered expense stays');

  // 4. it survives a reload (stored, not just redrawn)
  await page.reload();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2000);
  const again=await cycleRows();assert.equal(again.filter(id=>id.startsWith('ac_rm_s2_')).length,0,again);assert.equal(again.length,2,again);
  f=await planForm('s2');assert.equal(await f.locator('[name=accountCostMode] option[value=remove]').count(),0);assert.equal(await f.locator('[name=accountCostMode]').inputValue(),'none');
  check('after a reload the removed cost stays removed and Edit plan no longer offers the remove choice');
  assert.deepEqual(errors,[]);check('No unexpected console/page errors');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({version:'67',checks},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
