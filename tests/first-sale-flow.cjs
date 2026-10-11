// v39: the first customer of a product created in Settings chooses a tracking plan or a one-time annual plan. Synthetic local records only.
// Start a disposable server (see AGENTS.md), then: node tests/first-sale-flow.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.WASOOLI_TEST_URL||'http://127.0.0.1:8098',H={'X-Requested-With':'wasool','Content-Type':'application/json'},checks=[];
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).protocol,'http:');
const out=path.resolve(process.env.WASOOLI_TEST_OUTPUT||'data/first-sale-qa');fs.mkdirSync(out,{recursive:true});
const check=n=>{checks.push(n);console.log('PASS '+n);};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--disable-gpu']});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await ctx.addInitScript(()=>{if(!localStorage.getItem('pt-today'))localStorage.setItem('pt-today','2026-10-28');});
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(base+'/login',{waitUntil:'domcontentloaded'});await page.locator('[name=passcode]').fill('test1234');await page.locator('button[type=submit]').click();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  const api=async(method,pth,data)=>{const r=await ctx.request.fetch(base+pth,{method,headers:H,data:data===undefined?undefined:JSON.stringify(data)});let j=null;try{j=await r.json();}catch(e){}return {status:r.status(),j};};
  await api('POST','/api/import',{docs:{},replace:['users/','costs/']});
  assert.equal((await api('PUT','/api/docs/users/old',{name:'Existing Customer',joinDate:'2026-08-24',subscriptions:[{id:'s1',kind:'monthly',cycle:'monthly',packageId:'pkg_c',currency:'PKR',start:'2026-08-24',prices:[{from:'2026-08-24',price:4200}],payments:[]}]})).status,200);
  await page.reload();await page.waitForSelector('tr.row[data-id="old"]');await page.waitForTimeout(1500);

  /* a product created in Settings is marked new */
  await page.locator('#btn-settings').click();await page.locator('#pkg-add').click();
  const names=page.locator('#pkgList input[data-f=name]');await names.last().fill('NewTool');await page.locator('#pkgList select[data-f=cycle]').last().selectOption('yearly');
  await page.locator('[data-save-setting="packages"]').click();await page.waitForFunction(()=>/Saved/.test((document.querySelector('#setting-status-packages')||{}).textContent||''),null,{timeout:15000});
  const pk=(await api('GET','/api/docs/settings/main')).j.data.packages;const nt=pk.find(p=>p.name==='NewTool');
  assert.ok(nt&&nt.fresh===true);assert.equal(nt.cycle,'yearly');assert.ok(['pkg_c','pkg_cmax','pkg_g'].every(id=>!pk.find(p=>p.id===id).fresh));
  check('A product created in Settings is marked as new; C, C Max and G are not');
  await page.locator('#btn-settings').click();

  /* Add user with an existing product: no question */
  await page.locator('#btn-add').click();await page.locator('#a-pkg').selectOption('pkg_c');
  assert.equal(await page.locator('#a-first [data-role=first-sale]').isHidden(),true);
  check('Adding a customer to an existing product (C) asks nothing new');

  /* Add user with the new product: the choice appears and is required */
  await page.locator('#a-pkg').selectOption(nt.id);await page.locator('#a-name').fill('First Buyer');await page.locator('#a-start').fill('2026-10-10');await page.locator('#a-price').fill('12000');
  assert.equal(await page.locator('#a-first [data-role=first-sale]').isVisible(),true);
  await page.locator('#addForm button[type=submit]').click();await page.waitForTimeout(500);
  assert.match(await page.locator('#a-err').innerText(),/first customer for a new product/);
  check('The first customer of the new product must choose: tracking plan or one-time annual plan');
  await page.locator('#a-first input[value=once]').check();
  assert.match(await page.locator('#a-price-lbl').innerText(),/Amount for the year/);assert.match(await page.locator('#a-bill-preview').innerText(),/Renews Oct 10, 2027/);
  const box=await page.locator('#a-first [data-role=first-sale]').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:path.join(out,'first-sale-390.png')});
  check('Choosing one-time annual shows "Amount for the year" and the renewal date, and fits a 390px phone');
  await page.locator('#addForm button[type=submit]').click();await page.locator('#paymentDialog[open]').waitFor({timeout:15000});await page.locator('#payment-cancel').click();
  const users=(await api('GET','/api/docs?prefix=users/')).j.docs.map(d=>d.data);const fb=users.find(u=>u.name==='First Buyer');const it=fb.subscriptions[0];
  assert.equal(it.kind,'one-time');assert.equal(it.total,12000);assert.equal(it.start,'2026-10-10');assert.equal(it.due,'2026-10-10');assert.equal(it.renews,'2027-10-10');assert.equal(it.packageId,nt.id);
  check('Saved as a one-time annual item: Rs 12,000, due on the purchase day 10 Oct 2026, renews 10 Oct 2027');
  const fbId=(await api('GET','/api/docs?prefix=users/')).j.docs.find(d=>d.data.name==='First Buyer').path.split('/')[1];
  await page.locator('tr.row[data-id="'+fbId+'"]').click();const det=(await page.locator('tr.detail[data-id="'+fbId+'"]').innerText()).replace(/\s+/g,' ');
  assert.match(det,/one-time annual/i);assert.match(det,/Renews Oct 10, 2027/i);assert.doesNotMatch(det,/prorat/i);
  check('The plan card shows "one-time annual" and the renewal date');
  await page.locator('tr.row[data-id="'+fbId+'"]').click();

  /* an existing customer starts the first tracking plan of the new product */
  await page.locator('tr.row[data-id="old"]').click();await page.locator('tr.detail[data-id="old"] [data-key="addsub"]').first().click();
  const add=page.locator('tr.detail[data-id="old"] form.addsub-form');await add.locator('[name=packageId]').selectOption(nt.id);
  assert.equal(await add.locator('[data-role=first-sale]').isVisible(),true);
  check('The question is offered again while the new product has no tracking plan (here for an existing customer)');
  await add.locator('input[value=tracking]').check();await add.locator('[name=price]').fill('12000');await add.locator('[name=date]').fill('2026-10-20');
  await add.locator('button[type=submit]').click();await add.waitFor({state:'hidden',timeout:15000});
  const old=(await api('GET','/api/docs/users/old')).j.data;const tr=old.subscriptions.find(x=>x.packageId===nt.id);
  assert.equal(tr.kind,'monthly');assert.equal(tr.cycle,'yearly');assert.equal(tr.start,'2026-10-20');
  check('Choosing "Start a tracking plan" adds a recurring yearly plan from the purchase day');

  /* later customers are not asked */
  await page.locator('#btn-add').click();await page.locator('#a-pkg').selectOption(nt.id);
  assert.equal(await page.locator('#a-first [data-role=first-sale]').isHidden(),true);
  check('Once the product has a tracking plan, later customers are not asked again');

  assert.deepEqual(errors,[]);check('No unexpected console/page errors');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({version:'40',checks},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
