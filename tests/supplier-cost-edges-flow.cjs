// v41: supplier costs stay in step with the customer's plan (review items 13-17). Synthetic local records only.
// Start a disposable server (see AGENTS.md), then: node tests/supplier-cost-edges-flow.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.WASOOLI_TEST_URL||'http://127.0.0.1:8098',H={'X-Requested-With':'wasool','Content-Type':'application/json'},checks=[];
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).protocol,'http:');
const out=path.resolve(process.env.WASOOLI_TEST_OUTPUT||'data/supplier-cost-edges-qa');fs.mkdirSync(out,{recursive:true});
const check=n=>{checks.push(n);console.log('PASS '+n);};
const ac=(from,first)=>({frequency:'monthly',first:first||'full',entries:[{from,amount:3000,currency:'PKR',rate:null,paidIn:'USD',supplier:'Sup'}],overrides:{}});
const mon=(start,extra)=>Object.assign({id:'s1',kind:'monthly',cycle:'monthly',packageId:'pkg_c',currency:'PKR',start,prorate:true,prices:[{from:start,price:4200}],payments:[]},extra||{});
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--disable-gpu']});
 try{
  const ctx=await browser.newContext({viewport:{width:1400,height:900}});await ctx.addInitScript(()=>{if(!localStorage.getItem('pt-today'))localStorage.setItem('pt-today','2026-10-28');});
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('dialog',d=>d.accept());
  await page.goto(base+'/login',{waitUntil:'domcontentloaded'});await page.locator('[name=passcode]').fill('test1234');await page.locator('button[type=submit]').click();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  const api=async(method,pth,data)=>{const r=await ctx.request.fetch(base+pth,{method,headers:H,data:data===undefined?undefined:JSON.stringify(data)});let j=null;try{j=await r.json();}catch(e){}return {status:r.status(),j};};
  const get=async p=>(await api('GET','/api/docs/'+p)).j;
  await api('POST','/api/import',{docs:{
    'users/c2':{name:'Start Earlier',joinDate:'2026-07-01',subscriptions:[mon('2026-09-10',{accountCost:ac('2026-09-10','prorated')})]},
    'users/c3':{name:'Resumed',joinDate:'2026-07-24',cancel:{lastDay:'2026-08-23',reason:'x',note:'',at:'2026-08-20'},subscriptions:[mon('2026-07-24',{end:'2026-08-23',accountCost:ac('2026-07-24'),payments:[{id:'p1',date:'2026-07-24',amount:4200,currency:'PKR'}]})]},
    'users/c4':{name:'Tier Switch',joinDate:'2026-08-24',subscriptions:[mon('2026-08-24',{accountCost:ac('2026-08-24'),tierHistory:[{from:'2026-09-24',packageId:'pkg_cmax',price:6000,currency:'PKR',note:''}]})]},
    'users/c5':{name:'One Time Cost',joinDate:'2026-08-01',subscriptions:[{id:'s1',kind:'one-time',name:'Setup',packageId:'pkg_c',currency:'PKR',total:1500,due:'2026-08-01',start:'2026-08-01',payments:[],accountCost:ac('2026-08-01')}]},
    'users/c6':{name:'Delete Me',joinDate:'2026-09-24',subscriptions:[mon('2026-09-24',{costId:'account_c6_s1'})]},
    'costs/account_c6_s1':{date:'2026-10-01',description:'Delete Me cost',category:'Product',packageId:'pkg_c',currency:'PKR',cost:777,tax:0,rate:null,source:'account',userId:'c6',subscriptionId:'s1'},
    'users/c7':{name:'Remove Plan',joinDate:'2026-09-24',subscriptions:[mon('2026-09-24',{costId:'account_c7_s1'})]},
    'costs/account_c7_s1':{date:'2026-10-01',description:'Remove Plan cost',category:'Product',packageId:'pkg_c',currency:'PKR',cost:888,tax:0,rate:null,source:'account',userId:'c7',subscriptionId:'s1'}},replace:['users/','costs/']});
  await page.reload();await page.waitForSelector('tr.row[data-id="c2"]');await page.waitForTimeout(1500);await page.locator('#statusFilter').selectOption('all');await page.waitForTimeout(300);
  const costRows=async pf=>{await page.locator('#range').selectOption('all');await page.waitForTimeout(300);return page.evaluate(pf=>[...document.querySelectorAll('#costBody tr')].filter(tr=>{const b=tr.querySelector('[data-act=cost-edit]');return b&&b.dataset.cost.startsWith(pf);}).map(tr=>({id:tr.querySelector('[data-act=cost-edit]').dataset.cost,text:tr.innerText.replace(/\s+/g,' ')})),pf);};
  const det=id=>page.locator('tr.detail[data-id="'+id+'"]');
  const expand=async id=>{if(!(await det(id).count()))await page.locator('tr.row[data-id="'+id+'"]').click();await det(id).waitFor();return det(id);};

  /* #13 start moved earlier */
  await page.locator('tr.row[data-id="c2"] .row-start').click();await page.locator('#startDialog[open]').waitFor();await page.locator('#start-date').fill('2026-07-10');await page.locator('#start-date').dispatchEvent('change');await page.waitForTimeout(300);await page.locator('#start-save').click();await page.locator('#startDialog').waitFor({state:'hidden',timeout:10000});await page.waitForTimeout(800);
  let s=(await get('users/c2')).data.subscriptions[0];assert.equal(s.start,'2026-07-10');assert.equal(s.accountCost.entries[0].from,'2026-07-10');
  let rows=await costRows('ac_c2_');assert.ok(rows.some(r=>r.id.endsWith('2026-06-24')),'cost for the first partial cycle from 10 Jul');assert.ok(rows.some(r=>r.id.endsWith('2026-07-24')),'cost for the Jul 24 cycle');
  check('#13 Moving the start from 10 Sep to 10 Jul moves the supplier cost with it: cost rows now begin 10 Jul');

  /* #14 resume after a gap */
  let d=await expand('c3');await d.locator('button[data-key=react]').first().click();const f=d.locator('form.react-form');await f.waitFor({state:'visible'});await f.locator('[name=start]').fill('2026-09-15');await f.locator('button[type=submit]').click();await page.waitForTimeout(1500);
  const u3=(await get('users/c3')).data;const np=u3.subscriptions.at(-1);assert.equal(u3.cancel,null);assert.ok(np.accountCost,'resumed plan keeps a supplier cost');assert.equal(np.accountCost.entries[0].from,'2026-09-15');assert.equal(np.accountCost.entries[0].amount,3000);
  rows=await costRows('ac_c3_'+np.id+'_');assert.ok(rows.length>=2,'cost rows after the resume');
  check('#14 Resuming on 15 Sep keeps the Rs 3,000 supplier cost from the resume date; cost rows continue');

  /* #15 tier switch */
  rows=await costRows('ac_c4_');const after=rows.filter(r=>r.id.endsWith('2026-09-24')||r.id.endsWith('2026-10-24'));const before=rows.filter(r=>r.id.endsWith('2026-08-24'));
  assert.ok(after.length===2&&after.every(r=>/C Max/.test(r.text)),'cycles from the switch are under C Max');assert.ok(before.length===1&&!/C Max/.test(before[0].text),'the cycle before the switch stays under C');
  check('#15 After the C to C Max switch on 24 Sep, those cycle costs are filed under C Max; the August cycle stays under C');

  /* #16 one-time items */
  rows=await costRows('ac_c5_');assert.equal(rows.length,0);
  d=await expand('c5');await d.locator('[data-key=edit]').first().click();const ef=d.locator('.edit-form');await ef.waitFor({state:'visible'});
  const optHidden=await ef.locator('[name="s1:accountCostMode"] option[value=cycle]').evaluate(o=>o.hidden||o.disabled);
  await page.locator('#btn-add').click();if(!await page.locator('#a-more').evaluate(x=>x.open))await page.locator('#a-more summary').click();await page.locator('#a-cycle').selectOption('one-time');await page.locator('#a-name').fill('x');await page.waitForTimeout(300);
  const addHidden=await page.locator('#a-account-cost [name$="accountCostMode"] option[value=cycle]').evaluate(o=>o.hidden||o.disabled);
  await page.locator('#btn-add').click();
  assert.equal(addHidden,true);
  check('#16 One-time items accrue no cycle cost, and Add user hides "Cost every cycle" when Billing is one-time');
  void optHidden;

  /* #17 delete user / remove plan with their linked expense */
  await page.reload();await page.waitForSelector('tr.row[data-id="c6"]');await page.waitForTimeout(1200);await page.locator('#statusFilter').selectOption('all');await page.waitForTimeout(300);
  d=await expand('c6');await d.locator('[data-key=edit]').first().click();await d.locator('.edit-form [data-act=del]').waitFor({state:'visible'});await d.locator('.edit-form [data-act=del]').click();const conf=d.locator('[data-role=del-costs]');assert.equal(await conf.isChecked(),true);
  assert.match(await d.locator('label:has([data-role=del-costs])').innerText(),/Also delete the linked supplier expense \(Rs 777\)/);
  await d.locator('[data-act=del-yes]').click();await page.waitForTimeout(1200);
  assert.equal((await api('GET','/api/docs/users/c6')).status,404);assert.equal((await api('GET','/api/docs/costs/account_c6_s1')).status,404);
  check('#17 Deleting a user offers "Also delete the linked supplier expense (Rs 777)", ticked; Yes deletes both');
  d=await expand('c7');await d.locator('[data-key="edit:s1"]').first().click();await d.locator('[data-act=sub-remove]').first().waitFor({state:'visible'});await d.locator('[data-act=sub-remove]').first().click();await d.locator('[data-role=del-costs]').uncheck();await d.locator('[data-act=sub-remove-yes]').click();await page.waitForTimeout(1200);
  assert.equal((await get('users/c7')).data.subscriptions.length,0);assert.equal((await api('GET','/api/docs/costs/account_c7_s1')).status,200);
  check('#17 Removing a plan with the box unticked keeps its expense (the owner chooses)');

  assert.deepEqual(errors,[]);check('No unexpected console/page errors');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({version:'44',checks},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
