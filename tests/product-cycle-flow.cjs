// v63: the cycle lives on the product (own cycle date, or "customers renew on their own start date"), seat costs on yearly products,
// "Apply to the running plans" with the lump-sum warning, Edit plan "This product's cycle", the "Your cost" line, cycle-cost rows
// keeping their date, the currency note and the supplier-cost preview on the plan's own calendar.
// Synthetic records on a disposable server only:  WASOOLI_TEST_URL=http://127.0.0.1:<port> node tests/product-cycle-flow.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const stubWebFonts=require('./webfonts.cjs');

const base=process.env.WASOOLI_TEST_URL||'http://127.0.0.1:8098',H={'X-Requested-With':'wasool','Content-Type':'application/json'},checks=[];
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).protocol,'http:');
const out=path.resolve(process.env.WASOOLI_TEST_OUTPUT||'data/product-cycle-qa');fs.mkdirSync(out,{recursive:true});
const check=n=>{checks.push(n);console.log('PASS '+n);};
const plan=(id,start,extra)=>Object.assign({id,kind:'monthly',cycle:'monthly',name:'',packageId:'pkg_c',currency:'PKR',start,prorate:true,prices:[{from:start,price:4200}],payments:[]},extra||{});
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--disable-gpu']});
 try{
  const ctx=await browser.newContext({viewport:{width:1400,height:900}});await stubWebFonts(ctx);
  await ctx.addInitScript(()=>{if(!localStorage.getItem('pt-today'))localStorage.setItem('pt-today','2026-10-20');localStorage.setItem('pt-sum-open','1');});
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(base+'/login',{waitUntil:'domcontentloaded'});await page.locator('[name=passcode]').fill('test1234');await page.locator('button[type=submit]').click();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  const api=async(method,pth,data)=>{const r=await ctx.request.fetch(base+pth,{method,headers:H,data:data===undefined?undefined:JSON.stringify(data)});let j=null;try{j=await r.json();}catch(e){}return {status:r.status(),j};};
  const doc=async p=>((await api('GET','/api/docs/'+p)).j||{}).data;
  const until=async(fn,what)=>{for(let i=0;i<60;i++){if(await fn())return;await page.waitForTimeout(250);}throw new Error('timed out waiting for '+what);};
  const det=id=>page.locator('tr.detail[data-id="'+id+'"]');
  const expand=async id=>{if(!(await det(id).count()))await page.locator('tr.row[data-id="'+id+'"]').click();await det(id).waitFor();return det(id);};
  const planForm=async(uid,sid)=>{const d=await expand(uid);const f=d.locator('form.subedit-form[data-sub='+sid+']');if(await f.isHidden()){await d.locator('[data-key="edit:'+sid+'"]').first().click();await f.waitFor({state:'visible'});}return f;};
  // fixtures: Claude Pro (pkg_c) gets its own cycle from Jul 15 and an $8 seat cost; the yearly G gets $8 per month paid in PKR; a new "Own Tool" renews on each customer's own start
  const st=await doc('settings/main');const pk=st.packages.map(p=>p.id==='pkg_c'?{...p,cycleStart:'2026-07-15',costAmount:8,costCurrency:'USD',costPaidIn:'USD',costFirst:'full'}:p.id==='pkg_g'?{...p,costAmount:8,costPer:'month',costCurrency:'USD',costPaidIn:'PKR'}:p);
  if(!pk.some(p=>p.id==='pkg_own'))pk.push({id:'pkg_own',name:'Own Tool',cycle:'monthly',price:1000,currency:'PKR',description:'',ownStart:true});
  assert.equal((await api('PATCH','/api/docs/settings/main',{packages:pk,prorationBasis:'fixed30'})).status,200);
  for(const p of ['users/','costs/'])for(const d of ((await api('GET','/api/docs?prefix='+p)).j.docs||[]))await api('DELETE','/api/docs/'+d.path);
  await api('POST','/api/import',{docs:{
   'users/u1':{name:'Shared Person',joinDate:'2026-08-24',subscriptions:[plan('s1','2026-08-24')]},
   'users/u2':{name:'Own Person',joinDate:'2026-09-17',subscriptions:[plan('s1','2026-09-17',{ownStart:true,anchor:'2026-09-17'})]},
   'users/u3':{name:'Cost Person',joinDate:'2026-08-24',subscriptions:[plan('s1','2026-08-24',{anchor:'2026-08-15',accountCost:{frequency:'monthly',first:'full',firstAmount:null,overrides:{},entries:[{from:'2026-08-24',amount:5,currency:'USD',rate:null,paidIn:'USD',supplier:''}]}})]},
   'costs/lump1':{date:'2026-10-20',description:'Oct lump',category:'Product',packageId:'pkg_c',currency:'USD',cost:64,tax:0,rate:0,receipt:'',source:'manual'},
  },replace:[]});
  await page.reload();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  assert.equal(await page.locator('#app-ver').textContent(),'v64');

  // 1. Settings → Products: seat cost on the yearly product, the own-start tick, the off-cycle count and the apply button
  await page.locator('#btn-settings').click();await page.locator('#pkgList').waitFor();
  const row=id=>page.locator('#pkgList .pkg-row[data-id='+id+']');
  assert.equal(await row('pkg_g').locator('[data-f=costAmount]').inputValue(),'8');assert.equal(await row('pkg_g').locator('[data-f=costPer]').inputValue(),'month');assert.equal(await row('pkg_g').locator('[data-f=costPaidIn]').inputValue(),'PKR');
  assert.equal(await row('pkg_own').locator('[data-f=ownStart]').isChecked(),true);assert.match(await row('pkg_own').locator('.pkg-note').first().textContent(),/renews on the date it started/i);
  assert.match(await row('pkg_c').locator('.pkg-note').first().textContent(),/2 running plans still on another cycle/);
  assert.match(await row('pkg_c').locator('[data-act=pkg-seat]').textContent(),/Apply to the 3 running plans/);
  check('Settings: a yearly product carries a seat cost (per month, paid in PKR), the own-start product is ticked, Claude Pro says 2 of its 3 running plans are on another cycle');

  // 2. the apply box: the current cycle warns about the hand-entered expense, the next cycle does not
  await row('pkg_c').locator('[data-act=pkg-seat]').click();const dlg=page.locator('#seatDialog');await dlg.waitFor({state:'visible'});
  const opts=await dlg.locator('#seat-from option').evaluateAll(o=>o.map(x=>x.value));assert.deepEqual(opts.slice(0,2),['2026-10-15','2026-11-15'],opts);assert.equal(await dlg.locator('#seat-from').inputValue(),'2026-11-15');
  assert.doesNotMatch(await dlg.locator('#seat-preview').textContent(),/Warning/);
  await dlg.locator('#seat-from').selectOption('2026-10-15');assert.match(await dlg.locator('#seat-preview').textContent(),/Warning: 1 expense .*Oct lump \$64/);
  check('the apply box starts at the next product cycle and warns when a hand-entered expense already falls in the chosen cycle');

  // 3. apply from Nov 15: each plan from its own next cycle; the earlier entry of the plan that had one is kept
  await dlg.locator('#seat-from').selectOption('2026-11-15');assert.match(await dlg.locator('#seat-list').textContent(),/Own Person.*from Nov 17, 2026 \(its next cycle\)/);
  await dlg.locator('#seat-save').click();await until(async()=>!!((await doc('users/u1')).subscriptions[0].accountCost),'seat cost applied');await dlg.waitFor({state:'hidden'});
  const e=async u=>(await doc('users/'+u)).subscriptions[0].accountCost.entries.map(x=>[x.from,x.amount,x.currency,x.paidIn]);
  assert.deepEqual(await e('u1'),[['2026-11-24',8,'USD','USD']]);assert.deepEqual(await e('u2'),[['2026-11-17',8,'USD','USD']]);assert.deepEqual(await e('u3'),[['2026-08-24',5,'USD','USD'],['2026-11-15',8,'USD','USD']]);
  check('applied to 3 plans: the shared-cycle plan from Nov 24, the own-start plan from Nov 17, the product-cycle plan from Nov 15 keeping its earlier $5 entry');

  // 4. Edit plan: "This product's cycle" moves a plan onto the product calendar; the Settings count drops
  await page.locator('#btn-settings').click();await page.waitForTimeout(300);
  let f=await planForm('u1','s1');const ro=await f.locator('[name=renewOn] option').evaluateAll(o=>o.map(x=>[x.value,x.textContent]));assert.ok(ro.some(x=>x[0]==='product'&&/This product's cycle/.test(x[1])),JSON.stringify(ro));
  await f.locator('[name=renewOn]').selectOption('product');await f.locator('button[type=submit]').click();await until(async()=>(await doc('users/u1')).subscriptions[0].anchor==='2026-08-15','moved onto the product cycle');
  assert.equal((await doc('users/u1')).subscriptions[0].ownStart,undefined);
  assert.match(await det('u1').locator('.your-cost').first().textContent(),/Your cost \$8\/mo/);
  await page.locator('#btn-settings').click();await page.locator('#pkgList').waitFor();assert.match(await row('pkg_c').locator('.pkg-note').first().textContent(),/1 running plan still on another cycle/);await page.locator('#btn-settings').click();await page.waitForTimeout(300);
  check('Edit plan offers "This product\'s cycle"; saving puts the plan on the product calendar (anchor Aug 15), the plan box shows "Your cost $8/mo", Settings now counts 1 plan off-cycle');

  // 5. a computed cycle cost keeps its cycle date when edited from Costs
  const rowSel='#costBody [data-act=cost-edit][data-cost="ac_u3_s1_2026-09-15"]';await page.locator(rowSel).click();await page.locator('#costForm').waitFor({state:'visible'});
  assert.equal(await page.locator('#c-date').isDisabled(),true);assert.equal(await page.locator('#c-date').inputValue(),'2026-09-15');await page.locator('#c-cost').fill('9');await page.locator('#c-submit').click();
  await until(async()=>{const o=(await doc('users/u3')).subscriptions[0].accountCost.overrides||{};return o['2026-09-15']&&o['2026-09-15'].cost===9;},'cycle cost override saved');
  const ov=(await doc('users/u3')).subscriptions[0].accountCost.overrides['2026-09-15'];assert.equal(ov.date,'2026-09-15');
  assert.equal(await page.locator('#costBody tr',{hasText:'Cost Person'}).filter({hasText:'2026-09-15'}).count(),1);
  check('editing a computed cycle cost keeps its cycle date (the date box is locked) while the amount changes');

  // 6. the supplier-cost currency note, and the preview on the product calendar / own-start default in Add plan and Add user
  f=await planForm('u3','s1');await f.locator('[name=accountCostCurrency]').selectOption('PKR');await page.waitForTimeout(200);assert.match(await f.locator('[data-role=account-cost-preview]').textContent(),/seat cost in Settings is in USD, not PKR/);
  await det('u3').locator('[data-key="edit:s1"]').first().click();await f.waitFor({state:'hidden'});
  await det('u3').locator('[data-key=addsub]').first().click();const add=det('u3').locator('.addsub-form');await add.waitFor({state:'visible'});
  await add.locator('[name=packageId]').selectOption('pkg_own');assert.equal(await add.locator('[name=ownStart]').isChecked(),true);
  await add.locator('[name=packageId]').selectOption('pkg_c');assert.equal(await add.locator('[name=ownStart]').isChecked(),false);
  await add.locator('[name=price]').fill('4200');await add.locator('[name=date]').fill('2026-10-20');await page.waitForTimeout(300);
  assert.match(await add.locator('[data-role=account-cost-preview]').textContent(),/First affected cycle Oct 20, 2026 – Nov 14, 2026/);
  await add.locator('[name=packageId]').selectOption('pkg_g');await page.waitForTimeout(200);assert.equal(await add.locator('[name=accountCost]').inputValue(),'8');assert.equal(await add.locator('[name=accountCostPaidIn]').inputValue(),'PKR');assert.equal(await add.locator('[name=accountCostFrequency]').inputValue(),'monthly');
  await det('u3').locator('[data-key=addsub]').first().click();await add.waitFor({state:'hidden'});
  await page.locator('#btn-add').click();await page.locator('#addForm').waitFor({state:'visible'});await page.locator('#a-pkg').selectOption('pkg_own');assert.equal(await page.locator('#a-own').isChecked(),true);await page.locator('#a-pkg').selectOption('pkg_c');assert.equal(await page.locator('#a-own').isChecked(),false);
  check('a PKR supplier cost on a USD-seat product gets a note; Add plan previews on the product calendar (Oct 20 – Nov 14), pre-ticks own start for the own-start product and fills the yearly product\'s $8/month paid in PKR; Add user pre-ticks own start too');
  assert.deepEqual(errors,[]);check('No unexpected console/page errors');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({version:'64',checks},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
