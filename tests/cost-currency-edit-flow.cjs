// v40: editing a linked one-off supplier expense from a USD quote to a PKR quote leaves no old USD purchase record behind.
// Synthetic local records only. Start a disposable server (see AGENTS.md), then: node tests/cost-currency-edit-flow.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.WASOOLI_TEST_URL||'http://127.0.0.1:8098',H={'X-Requested-With':'wasool','Content-Type':'application/json'},checks=[];
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).protocol,'http:');
const out=path.resolve(process.env.WASOOLI_TEST_OUTPUT||'data/cost-currency-qa');fs.mkdirSync(out,{recursive:true});
const check=n=>{checks.push(n);console.log('PASS '+n);};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--disable-gpu']});
 try{
  const ctx=await browser.newContext({viewport:{width:1400,height:900}});await ctx.addInitScript(()=>{if(!localStorage.getItem('pt-today'))localStorage.setItem('pt-today','2026-10-28');});
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(base+'/login',{waitUntil:'domcontentloaded'});await page.locator('[name=passcode]').fill('test1234');await page.locator('button[type=submit]').click();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  const api=async(method,pth,data)=>{const r=await ctx.request.fetch(base+pth,{method,headers:H,data:data===undefined?undefined:JSON.stringify(data)});let j=null;try{j=await r.json();}catch(e){}return {status:r.status(),j};};
  const st=(await api('GET','/api/docs/settings/main')).j.data;Object.assign(st,{rate:280,pkrCostTax:5.2,costPaymentBase:null,costPaymentHistory:[]});assert.equal((await api('PUT','/api/docs/settings/main',st)).status,200);
  await api('POST','/api/import',{docs:{'users/c1':{name:'Cost Edit',joinDate:'2026-09-24',subscriptions:[{id:'s1',kind:'monthly',cycle:'monthly',packageId:'pkg_c',currency:'PKR',start:'2026-09-24',prices:[{from:'2026-09-24',price:4200}],payments:[]}]}},replace:['users/','costs/']});
  const edit=async fill=>{await page.reload();await page.waitForSelector('tr.row[data-id="c1"]');await page.waitForTimeout(1200);if(!(await page.locator('tr.detail[data-id="c1"]').count()))await page.locator('tr.row[data-id="c1"]').click();const det=page.locator('tr.detail[data-id="c1"]');await det.waitFor();await det.locator('[data-key=edit]').first().click();const f=det.locator('.edit-form');await f.waitFor({state:'visible'});await fill(f);await f.locator('button[type=submit]').click();await f.waitFor({state:'hidden',timeout:10000});await page.waitForTimeout(800);};
  const F=(f,n)=>f.locator(`[name="s1:${n}"]`);

  await edit(async f=>{await F(f,'accountCostMode').selectOption('once');await F(f,'accountCostCurrency').selectOption('USD');await F(f,'accountCostPaidIn').selectOption('PKR');await F(f,'accountCost').fill('10');await F(f,'accountCostDate').fill('2026-10-01');});
  const cid=(await api('GET','/api/docs/users/c1')).j.data.subscriptions[0].costId;let d=(await api('GET','/api/docs/costs/'+cid)).j.data;
  assert.equal(d.currency,'PKR');assert.equal(d.cost,2800);assert.equal(d.tax,145.6);assert.equal(d.purchase.currency,'USD');assert.equal(d.purchase.amount,10);
  check('A USD 10 expense paid in PKR is saved as Rs 2,800 + Rs 145.60 tax with its USD purchase record');

  await edit(async f=>{await F(f,'accountCostCurrency').selectOption('PKR');await F(f,'accountCost').fill('3000');});
  d=(await api('GET','/api/docs/costs/'+cid)).j.data;
  assert.equal(d.currency,'PKR');assert.equal(d.cost,3000);assert.equal(d.tax,0);assert.equal(d.purchase,null);
  check('Edited to a PKR 3,000 quote: Rs 3,000, no tax carried over, and no old USD purchase record left behind');

  await page.locator('#btn-cost').click().catch(()=>{});await page.locator('[data-act=cost-edit][data-cost="'+cid+'"]').first().click();
  assert.equal(await page.locator('#c-cur').inputValue(),'PKR');assert.equal(await page.locator('#c-cost').inputValue(),'3000');
  check('Opening the expense again shows it as PKR 3,000 (not the old USD 10)');

  assert.deepEqual(errors,[]);check('No unexpected console/page errors');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({version:'43',checks},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
