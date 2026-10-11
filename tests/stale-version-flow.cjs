// v39: a page loaded before an update must stop saving and ask for a reload. Synthetic local records only.
// Start a disposable server (see AGENTS.md), then: node tests/stale-version-flow.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.WASOOLI_TEST_URL||'http://127.0.0.1:8098',H={'X-Requested-With':'wasool','Content-Type':'application/json'},checks=[];
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).protocol,'http:');
const out=path.resolve(process.env.WASOOLI_TEST_OUTPUT||'data/stale-version-qa');fs.mkdirSync(out,{recursive:true});
const check=n=>{checks.push(n);console.log('PASS '+n);},sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--disable-gpu']});
 try{
  const ctx=await browser.newContext({viewport:{width:1400,height:900},colorScheme:'light'});await ctx.addInitScript(()=>localStorage.setItem('pt-today','2026-10-10'));
  const page=await ctx.newPage();const errors=[],writes=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('request',r=>{if(['PUT','POST','PATCH','DELETE'].includes(r.method())&&r.url().includes('/api/'))writes.push(r.method()+' '+r.url().replace(base,''));});
  const api=async(method,pth,data)=>{const r=await ctx.request.fetch(base+pth,{method,headers:H,data:data===undefined?undefined:JSON.stringify(data)});let j=null;try{j=await r.json();}catch(e){}return {status:r.status(),j};};
  await page.goto(base+'/login',{waitUntil:'domcontentloaded'});await page.locator('[name=passcode]').fill('test1234');await page.locator('button[type=submit]').click();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  const badge=(await page.locator('#app-ver').innerText()).trim().replace(/^v/i,'');

  /* server reports its release */
  const v=await api('GET','/api/version');assert.equal(typeof v.j.version,'number');assert.equal(v.j.app,badge);
  check('The server reports its app version and it matches the page badge');

  await api('POST','/api/import',{docs:{},replace:['users/','costs/']});
  assert.equal((await api('PUT','/api/docs/users/stale-qa',{name:'Stale QA',email:'stale-qa@example.test',phone:'923001234567',joinDate:'2026-09-24',notes:'original',subscriptions:[{id:'s1',kind:'monthly',cycle:'monthly',packageId:'pkg_c',currency:'PKR',start:'2026-09-24',prices:[{from:'2026-09-24',price:4200}],payments:[]}]})).status,200);
  await page.reload();await page.waitForSelector('tr.row[data-id="stale-qa"]');await page.waitForTimeout(6500);
  assert.equal(await page.locator('#staleBanner').isHidden(),true);
  check('No banner while the page and the server run the same release');
  assert.equal(await page.locator('#remindBanner').isHidden(),true);
  check('A banner marked hidden is really hidden (the empty "Open queue" bar no longer shows when the queue is empty)');

  /* the server is "updated": the page keeps its own badge, the server reports another release */
  let newer=false;await page.route(u=>/\/api\/version$/.test(u.toString()),async route=>{if(!newer)return route.continue();const r=await route.fetch();const j=await r.json();j.app='999';return route.fulfill({response:r,body:JSON.stringify(j)});});
  newer=true;await page.waitForSelector('#staleBanner:not([hidden])',{timeout:15000});
  assert.match(await page.locator('#staleBanner').innerText(),/Wasooli was updated/);
  check('After the server reports a newer release the page shows "Wasooli was updated" with a Reload button');

  /* saving is blocked, reading still works */
  const before=writes.length;
  await page.locator('tr.row[data-id="stale-qa"] td.who .nm').click();await page.waitForSelector('tr.detail[data-id="stale-qa"]');await page.locator('tr.detail[data-id="stale-qa"] .detail-acts [data-key="edit"]').click();
  const form=page.locator('tr.detail[data-id="stale-qa"] form.edit-form');await form.locator('[name=notes]').fill('edited by an old page');await form.locator('button[type=submit]').click();await page.waitForTimeout(1500);
  const toast=(await page.locator('.toast').allInnerTexts()).join(' | ');assert.match(toast,/Wasooli was updated/);
  assert.equal((await api('GET','/api/docs/users/stale-qa')).j.data.notes,'original');assert.equal(writes.length,before);
  check('An old page cannot save: nothing is sent, the record is unchanged and the owner is told to reload');
  assert.equal(await form.locator('[name=notes]').inputValue(),'edited by an old page');
  check('What was typed is kept in the form while the owner reloads');

  /* phone width, both themes */
  for(const theme of ['light','dark']){await page.setViewportSize({width:390,height:844});await page.emulateMedia({colorScheme:theme});await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(300);
   assert.equal(await page.locator('#staleBanner').isVisible(),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   const box=await page.locator('#staleReload').boundingBox();assert.ok(box&&box.x>=0&&box.x+box.width<=390&&box.height>=28);
   await page.screenshot({path:path.join(out,'stale-banner-390-'+theme+'.png')});}
  check('The banner and its Reload button fit a 390px phone in light and dark themes without sideways scroll');

  /* reload clears it and saving works again */
  newer=false;await page.setViewportSize({width:1400,height:900});await page.emulateMedia({colorScheme:'light'});await page.locator('#staleReload').click();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForSelector('tr.row[data-id="stale-qa"]');await page.waitForTimeout(6500);
  assert.equal(await page.locator('#staleBanner').isHidden(),true);
  await page.locator('tr.row[data-id="stale-qa"] td.who .nm').click();await page.waitForSelector('tr.detail[data-id="stale-qa"]');await page.locator('tr.detail[data-id="stale-qa"] .detail-acts [data-key="edit"]').click();
  const f2=page.locator('tr.detail[data-id="stale-qa"] form.edit-form');await f2.locator('[name=notes]').fill('saved after reload');await f2.locator('button[type=submit]').click();await page.waitForTimeout(1500);
  assert.equal((await api('GET','/api/docs/users/stale-qa')).j.data.notes,'saved after reload');
  check('After Reload the banner is gone and saving works again');

  assert.deepEqual(errors,[]);check('No unexpected console/page errors');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({version:badge,checks},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
