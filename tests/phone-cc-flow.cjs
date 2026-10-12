// v41: phone numbers are saved with a country code (box beside the number, +92 unless changed). Synthetic local records only.
// Start a disposable server (see AGENTS.md), then: node tests/phone-cc-flow.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.WASOOLI_TEST_URL||'http://127.0.0.1:8098',H={'X-Requested-With':'wasool','Content-Type':'application/json'},checks=[];
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).protocol,'http:');
const out=path.resolve(process.env.WASOOLI_TEST_OUTPUT||'data/phone-cc-qa');fs.mkdirSync(out,{recursive:true});
const check=n=>{checks.push(n);console.log('PASS '+n);};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--disable-gpu']});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await ctx.addInitScript(()=>{if(!localStorage.getItem('pt-today'))localStorage.setItem('pt-today','2026-10-28');});
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(base+'/login',{waitUntil:'domcontentloaded'});await page.locator('[name=passcode]').fill('test1234');await page.locator('button[type=submit]').click();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  const api=async(method,pth,data)=>{const r=await ctx.request.fetch(base+pth,{method,headers:H,data:data===undefined?undefined:JSON.stringify(data)});let j=null;try{j=await r.json();}catch(e){}return {status:r.status(),j};};
  await api('POST','/api/import',{docs:{'users/eren':{name:'Eren',joinDate:'2026-07-24',phone:'905333537662',subscriptions:[{id:'s1',kind:'monthly',cycle:'monthly',packageId:'pkg_c',currency:'USD',start:'2026-07-24',prices:[{from:'2026-07-24',price:14}],payments:[]}]},
    'users/bad':{name:'Old Local Number',joinDate:'2026-09-24',phone:'03001234567',subscriptions:[{id:'s1',kind:'monthly',cycle:'monthly',packageId:'pkg_c',currency:'PKR',start:'2026-09-24',prices:[{from:'2026-09-24',price:4200}],payments:[]}]}},replace:['users/','costs/']});
  await page.reload();await page.waitForSelector('tr.row[data-id="eren"]');await page.waitForTimeout(1500);
  const users=async()=>(await api('GET','/api/docs?prefix=users/')).j.docs.map(d=>({id:d.path.split('/')[1],...d.data}));
  const addUser=async(name,cc,phone,tg)=>{if(await page.locator('#addPanel').isHidden())await page.locator('#btn-add').click();await page.locator('#a-pkg').selectOption('pkg_c');await page.locator('#a-name').fill(name);await page.locator('#a-price').fill('4200');
    await page.locator('#a-cc').fill(cc);await page.locator('#a-phone').fill(phone);if(tg){if(!await page.locator('#a-more').evaluate(x=>x.open))await page.locator('#a-more summary').click();await page.locator('#a-tg').fill(tg);}
    const hint=(await page.locator('#addForm [data-role=phone-hint]').innerText()).trim();
    await page.locator('#addForm button[type=submit]').click();await page.locator('#paymentDialog[open]').waitFor({timeout:15000});await page.locator('#payment-cancel').click();await page.waitForTimeout(600);return hint;};

  assert.equal(await page.locator('#btn-add').click().then(()=>page.locator('#a-cc').inputValue()),'+92');
  const box=await page.locator('#addForm .phone-in').boundingBox();assert.ok(box&&box.x>=0&&box.x+box.width<=390);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:path.join(out,'phone-390.png')});
  check('Add user shows a country code box prefilled with +92 beside the number, fitting a 390px phone');

  let hint=await addUser('Local Buyer','+92','0300 1234567','0300 7654321');let u=(await users()).find(x=>x.name==='Local Buyer');
  assert.equal(hint,'Saved as +923001234567');assert.equal(u.phone,'923001234567');assert.equal(u.telegram,'923007654321');
  check('"0300 1234567" with +92 is saved as +92 300 1234567 (the preview says so); a Telegram number gets the code too');
  const href=await page.locator('tr.row[data-id="'+u.id+'"] a[href*="923001234567"]').count();assert.ok(href>=1);
  check('The WhatsApp link uses 923001234567');
  hint=await addUser('Turkish Buyer','+90','0533 353 7662');u=(await users()).find(x=>x.name==='Turkish Buyer');assert.equal(u.phone,'905333537662');
  check('With the box changed to +90, "0533 353 7662" is saved as +90 533 353 7662');
  hint=await addUser('UK Buyer','+92','+44 7911 123456');u=(await users()).find(x=>x.name==='UK Buyer');assert.equal(u.phone,'447911123456');
  check('A number typed with its own +44 keeps it, whatever the box says');

  /* Edit user */
  const editSave=async(id,fill)=>{await page.reload();await page.waitForSelector('tr.row[data-id="'+id+'"]');await page.waitForTimeout(1000);await page.locator('tr.row[data-id="'+id+'"]').click();const d=page.locator('tr.detail[data-id="'+id+'"]');await d.waitFor();await d.locator('[data-key=edit]').first().click();const f=d.locator('.edit-form');await f.waitFor({state:'visible'});await fill(f);await f.locator('button[type=submit]').click();await f.waitFor({state:'hidden',timeout:10000});await page.waitForTimeout(600);};
  await editSave('eren',async f=>{await f.locator('[name=notes]').fill('pays via Wise');});
  assert.equal((await api('GET','/api/docs/users/eren')).j.data.phone,'905333537662');
  check('Editing Eren\'s notes leaves his +90 number exactly as it was');
  await editSave('bad',async f=>{await f.locator('[name=phone]').fill('0300 1234567');});
  assert.equal((await api('GET','/api/docs/users/bad')).j.data.phone,'923001234567');
  check('An old number saved without a code is fixed by retyping it in Edit user: 0300 1234567 becomes 923001234567');

  assert.deepEqual(errors,[]);check('No unexpected console/page errors');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({version:'41',checks},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
