// v39: a new product's tracking plan starts the product's own cycle on the first purchase day; later customers are prorated against it.
// Synthetic local records only. Start a disposable server (see AGENTS.md), then: node tests/own-cycle-flow.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.WASOOLI_TEST_URL||'http://127.0.0.1:8098',H={'X-Requested-With':'wasool','Content-Type':'application/json'},checks=[];
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).protocol,'http:');
const out=path.resolve(process.env.WASOOLI_TEST_OUTPUT||'data/own-cycle-qa');fs.mkdirSync(out,{recursive:true});
const check=n=>{checks.push(n);console.log('PASS '+n);};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--disable-gpu']});
 try{
  const ctx=await browser.newContext({viewport:{width:1400,height:900}});await ctx.addInitScript(()=>{if(!localStorage.getItem('pt-today'))localStorage.setItem('pt-today','2027-01-20');});
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(base+'/login',{waitUntil:'domcontentloaded'});await page.locator('[name=passcode]').fill('test1234');await page.locator('button[type=submit]').click();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  const api=async(method,pth,data)=>{const r=await ctx.request.fetch(base+pth,{method,headers:H,data:data===undefined?undefined:JSON.stringify(data)});let j=null;try{j=await r.json();}catch(e){}return {status:r.status(),j};};
  const st=(await api('GET','/api/docs/settings/main')).j.data;
  const pk=st.packages.filter(p=>!['pkg_nt','pkg_nm'].includes(p.id)).concat([{id:'pkg_nt',name:'NewTool',cycle:'yearly',price:12000,currency:'PKR',description:'',fresh:true},{id:'pkg_nm',name:'NewMonthly',cycle:'yearly',price:12000,currency:'PKR',description:'',fresh:true}]);
  assert.equal((await api('PATCH','/api/docs/settings/main',{packages:pk,prorationBasis:'fixed30'})).status,200);
  await api('POST','/api/import',{docs:{},replace:['users/','costs/']});
  assert.equal((await api('PUT','/api/docs/users/shared',{name:'Shared Customer',joinDate:'2027-01-15',subscriptions:[{id:'s1',kind:'monthly',cycle:'monthly',packageId:'pkg_c',currency:'PKR',start:'2027-01-15',prorate:true,prices:[{from:'2027-01-15',price:4200}],payments:[]}]})).status,200);
  await page.reload();await page.waitForSelector('tr.row[data-id="shared"]');await page.waitForTimeout(1500);
  const users=async()=>(await api('GET','/api/docs?prefix=users/')).j.docs;
  const byName=async n=>(await users()).find(d=>d.data.name===n);
  const row=async id=>(await page.locator('tr.row[data-id="'+id+'"]').innerText()).replace(/\s+/g,' ');
  const openAddForm=async()=>{if(await page.locator('#addPanel').isHidden())await page.locator('#btn-add').click();await page.locator('#addForm').waitFor();};
  const addUser=async(name,pkg,start,choose,every)=>{await openAddForm();await page.locator('#a-pkg').selectOption(pkg);await page.locator('#a-name').fill(name);await page.locator('#a-start').fill(start);await page.locator('#a-price').fill('12000');
    if(choose){await page.locator('#a-first input[value='+choose+']').check();if(every)await page.locator('#a-first [data-role=first-every]').selectOption(every);}
    await page.locator('#addForm button[type=submit]').click();await page.locator('#paymentDialog[open]').waitFor({timeout:15000});await page.locator('#payment-cancel').click();await page.waitForTimeout(800);};

  /* first buyer starts the product's own yearly cycle on the purchase day */
  await openAddForm();await page.locator('#a-pkg').selectOption('pkg_nt');await page.locator('#a-first input[value=tracking]').check();
  assert.equal(await page.locator('#a-first [data-role=first-bill]').isVisible(),true);assert.equal(await page.locator('#a-payment-wrap').isHidden(),true);
  check('For a new yearly product, "Start a tracking plan" offers Billed: monthly, every 3 or 6 months, or yearly');
  await addUser('First Buyer','pkg_nt','2026-10-10','tracking','12');
  let d=await byName('First Buyer');let s=d.data.subscriptions[0];
  assert.equal(s.anchor,'2026-10-10');assert.equal(s.cycle,'yearly');assert.equal(s.paymentEvery,12);
  let t=await row(d.path.split('/')[1]);assert.match(t,/Rs 12,000 Overdue/);
  check('The first buyer\'s plan starts the product\'s own cycle on 10 Oct 2026 and is billed the full Rs 12,000 (not prorated)');
  await page.locator('tr.row[data-id="'+d.path.split('/')[1]+'"]').click();
  assert.match((await page.locator('tr.detail[data-id="'+d.path.split('/')[1]+'"]').innerText()).replace(/\s+/g,' '),/yearly · PKR · own cycle from Oct 10/i);
  await page.locator('tr.row[data-id="'+d.path.split('/')[1]+'"]').click();
  check('The plan card says it follows the product\'s own cycle, renewing on the 10th each year');

  /* a later customer is not asked and is prorated against the product's cycle */
  await openAddForm();await page.locator('#a-pkg').selectOption('pkg_nt');
  assert.equal(await page.locator('#a-first [data-role=first-sale]').isHidden(),true);
  await addUser('Second Buyer','pkg_nt','2027-01-15');
  d=await byName('Second Buyer');s=d.data.subscriptions[0];assert.equal(s.anchor,'2026-10-10');
  t=await row(d.path.split('/')[1]);assert.match(t,/Rs 8,811/);
  check('A later customer (15 Jan 2027) joins the product\'s cycle and pays Rs 8,811 for 268 of its 365 days');

  /* monthly billing for a new yearly product */
  await addUser('Monthly Payer','pkg_nm','2027-01-15','tracking','1');
  d=await byName('Monthly Payer');s=d.data.subscriptions[0];assert.equal(s.anchor,'2027-01-15');assert.equal(s.paymentEvery,1);
  t=await row(d.path.split('/')[1]);assert.match(t,/Rs 1,000/);assert.doesNotMatch(t,/Rs 12,000 Overdue|Rs 12,000 Due/);
  check('Billed monthly, the new yearly product charges Rs 1,000 a month from the purchase day (15 Jan)');

  /* existing products keep the shared cycle */
  d=(await api('GET','/api/docs/users/shared')).j.data;assert.equal(d.subscriptions[0].anchor,undefined);
  assert.match(await row('shared'),/Rs 1,260/);
  check('Existing products keep the shared 24th cycle: C from 15 Jan is still Rs 1,260 for 9 days');

  /* Settings shows which products have their own cycle */
  await page.locator('#btn-settings').click();const pl=(await page.locator('#pkgList').innerText()).replace(/\s+/g,' ');
  assert.match(pl,/own cycle from Oct 10, 2026/);assert.match(pl,/own cycle from Jan 15/);
  check('Settings → Packages & products shows "own cycle from …" for the new products');
  await page.locator('#btn-settings').click();

  /* the Queue lists own-cycle plans from their due date until paid */
  assert.equal((await api('PUT','/api/docs/users/todaybuyer',{name:'Today Buyer',joinDate:'2027-01-20',subscriptions:[{id:'s1',kind:'monthly',cycle:'yearly',packageId:'pkg_nt',currency:'PKR',start:'2027-01-20',anchor:'2026-10-10',prorate:true,prorationBasis:'actual',paymentEvery:12,prices:[{from:'2027-01-20',price:12000}],payments:[]}]})).status,200);
  const openQueue=async()=>{await page.reload();await page.waitForSelector('tr.row[data-id="shared"]');await page.waitForTimeout(1500);await page.locator('#btn-reminders').click();await page.locator('#rr-tabs button[data-tab=queue]').click();return (await page.locator('#rr-body').innerText()).replace(/\s+/g,' ');};
  let q=await openQueue();
  assert.match(q,/Due on their product's own cycle · 4/i);assert.match(q,/Today Buyer NewTool · Rs [\d,]+ due today/);assert.match(q,/First Buyer NewTool · Rs 12,000 overdue since Oct 10/);assert.doesNotMatch(q.split(/Due on their product's own cycle/i)[1]||'',/Shared Customer/);assert.match(q,/Stage 1 · Reminder/);
  assert.ok(Number(await page.locator('#rem-cnt').innerText())>=4);
  check('The Queue lists own-cycle plans on their due date ("due today") and while overdue, and counts them in the Queue badge');
  const fb=await byName('First Buyer');fb.data.subscriptions[0].payments.push({id:'pfb',date:'2027-01-20',amount:12000,currency:'PKR'});assert.equal((await api('PUT','/'+'api/docs/'+fb.path,fb.data)).status,200);
  q=await openQueue();assert.doesNotMatch(q,/First Buyer/);assert.match(q,/Due on their product's own cycle · 3/i);
  check('Once paid, the plan leaves the Queue');
  await page.locator('#btn-reminders').click();
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  check('No sideways scroll at 390px');
  assert.deepEqual(errors,[]);check('No unexpected console/page errors');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({version:'42',checks},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
