// v43: a credit-card statement charge matched to a customer account replaces that cycle's calculated supplier cost instead of being added twice.
// Uses the paste-text path (no AI key needed). Synthetic local records only. Start a disposable server (see AGENTS.md), then: node tests/statement-match-flow.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.WASOOLI_TEST_URL||'http://127.0.0.1:8098',H={'X-Requested-With':'wasool','Content-Type':'application/json'},checks=[];
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).protocol,'http:');
const out=path.resolve(process.env.WASOOLI_TEST_OUTPUT||'data/statement-match-qa');fs.mkdirSync(out,{recursive:true});
const check=n=>{checks.push(n);console.log('PASS '+n);};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--disable-gpu']});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await ctx.addInitScript(()=>{if(!localStorage.getItem('pt-today'))localStorage.setItem('pt-today','2026-10-20');});
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(base+'/login',{waitUntil:'domcontentloaded'});await page.locator('[name=passcode]').fill('test1234');await page.locator('button[type=submit]').click();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  const api=async(method,pth,data)=>{const r=await ctx.request.fetch(base+pth,{method,headers:H,data:data===undefined?undefined:JSON.stringify(data)});let j=null;try{j=await r.json();}catch(e){}return {status:r.status(),j};};
  const doc=async p=>(await api('GET','/api/docs/'+p)).j.data;
  const costs=async()=>((await api('GET','/api/docs?prefix=costs/')).j.docs||[]).map(d=>d.data||d);
  const until=async(fn,what)=>{for(let i=0;i<40;i++){if(await fn())return;await page.waitForTimeout(250);}throw new Error('timed out waiting for '+what);};
  await api('POST','/api/import',{docs:{
   'users/sm1':{name:'Card Match Person',joinDate:'2026-08-24',subscriptions:[{id:'s1',kind:'monthly',cycle:'monthly',packageId:'pkg_c',currency:'PKR',start:'2026-08-24',prorate:true,prices:[{from:'2026-08-24',price:7000}],payments:[],
     accountCost:{frequency:'monthly',first:'full',entries:[{from:'2026-08-24',amount:5000,currency:'PKR',supplier:'OpenAI'}],overrides:{}}}]},
  },replace:[]});
  const before=(await costs()).length;
  await page.reload();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  await page.locator('#btn-shot').click();await page.locator('#shotPanel').waitFor({state:'visible'});
  if(!(await page.locator('#shot-alt').evaluate(d=>d.open)))await page.locator('#shot-alt summary').click();
  await page.locator('#shot-text').fill('25 Sep 2026  OPENAI CHATGPT SUBSCR  Rs 5,150.00\n10 Sep 2026  AWS EMEA  Rs 1,000.00');
  await page.locator('#shot-text-go').click();await until(async()=>(await page.locator('#rv-body tr').count())===2,'two rows read');
  const rows=page.locator('#rv-body tr');
  const m1=await rows.nth(0).locator('select.match').inputValue(),m2=await rows.nth(1).locator('select.match').inputValue();
  assert.equal(m1,'sm1|s1|2026-09-24');check('the OpenAI charge is suggested for Card Match Person, cycle 24 Sep (close date and amount)');
  assert.equal(m2,'');check('the unrelated AWS charge is not matched to any customer');
  assert.match(await page.locator('#rv-total').textContent(),/1 replaces a customer's calculated cost/);check('the review total says one charge replaces a calculated cost');
  await page.locator('#rv-save').click();
  await until(async()=>{const s=(await doc('users/sm1')).subscriptions[0];return s.accountCost.overrides&&s.accountCost.overrides['2026-09-24'];},'override saved');
  const ov=(await doc('users/sm1')).subscriptions[0].accountCost.overrides['2026-09-24'];
  assert.equal(ov.cost,5150);assert.equal(ov.currency,'PKR');assert.equal(ov.date,'2026-09-25');assert.equal(ov.fromStatement,true);assert.match(ov.description,/Card Match Person .* OPENAI/);
  check('the card amount Rs 5,150 replaces the calculated Rs 5,000 for that cycle (dated as charged)');
  await until(async()=>(await costs()).length===before+1,'one plain cost added');
  const added=(await costs()).filter(c=>c.source==='screenshot');assert.equal(added.length,1);assert.match(added[0].description,/AWS/);
  check('only the AWS charge is added as a separate cost, so the OpenAI charge is not counted twice');
  // option 1: importing the same statement again flags both rows as possible duplicates and unticks them
  if(!(await page.locator('#shot-alt').evaluate(d=>d.open)))await page.locator('#shot-alt summary').click();
  await page.locator('#shot-text').fill('25 Sep 2026  OPENAI CHATGPT SUBSCR  Rs 5,150.00\n10 Sep 2026  AWS EMEA  Rs 1,000.00');
  await page.locator('#shot-text-go').click();await until(async()=>(await page.locator('#rv-body tr').count())===2,'rows read again');
  assert.deepEqual(await page.locator('#rv-body tr').evaluateAll(t=>t.map(x=>x.dataset.dup+x.dataset.sel)),['10','10']);
  assert.match(await page.locator('#rv-body').textContent(),/Possible duplicate of .*AWS/);
  assert.equal(await page.locator('#rv-save').isDisabled(),true);check('importing the same statement again marks both rows Possible duplicate and unticks them');
  await page.locator('#rv-body tr').nth(1).locator('[data-f=sel]').check();assert.equal(await page.locator('#rv-save').isDisabled(),false);check('a flagged row can be ticked again if it really is a second charge');
  await page.locator('#rv-clear').click();
  // the Costs list shows the cycle with the card amount and can go back to the calculated cost
  const row=page.locator('#costBody tr',{hasText:'OPENAI CHATGPT'});await row.waitFor();assert.match(await row.textContent(),/5,150/);
  await row.locator('[data-act=cost-unmatch]').click();
  await until(async()=>!((await doc('users/sm1')).subscriptions[0].accountCost.overrides||{})['2026-09-24'],'override removed');
  check('"Use calculated" removes the card amount and the cycle goes back to the calculated cost');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);check('No sideways scroll and no unexpected console/page errors');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({version:'43',checks},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
