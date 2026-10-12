// v39: the settings repair and the settings save merge onto the stored document and never drop its other fields.
// Synthetic local records only; never use the owner's database. Start a disposable server (see AGENTS.md), then:
//   node tests/settings-repair-flow.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.WASOOLI_TEST_URL||'http://127.0.0.1:8098',H={'X-Requested-With':'wasool','Content-Type':'application/json'},checks=[];
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).protocol,'http:');
const out=path.resolve(process.env.WASOOLI_TEST_OUTPUT||'data/settings-repair-qa');fs.mkdirSync(out,{recursive:true});
const check=n=>{checks.push(n);console.log('PASS '+n);},sleep=ms=>new Promise(r=>setTimeout(r,ms));
const COST={pkrCostTax:7,costPaymentBase:{rate:280,taxPercent:5.2},costPaymentHistory:[{from:'2026-10-01',rate:290,taxPercent:7}],ownerName:'QA Owner'};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--disable-gpu']});
 try{
  const ctx=await browser.newContext({viewport:{width:1400,height:900}});await ctx.addInitScript(()=>localStorage.setItem('pt-today','2026-10-10'));
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error'&&!/40[0-9]/.test(m.text()))errors.push(m.text());});
  const api=async(method,pth,data)=>{const r=await ctx.request.fetch(base+pth,{method,headers:H,data:data===undefined?undefined:JSON.stringify(data)});let j=null;try{j=await r.json();}catch(e){}return {status:r.status(),j};};
  const settings=async()=>(await api('GET','/api/docs/settings/main')).j.data;
  const marker=async()=>{const r=await api('GET','/api/docs/meta/schema');return r.status===200?r.j.data.version:null;};
  const login=async()=>{await page.goto(base+'/login',{waitUntil:'domcontentloaded'});await page.locator('[name=passcode]').fill('test1234');await page.locator('button[type=submit]').click();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);};
  const reload=async()=>{await page.reload();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);};
  const waitMarker=async()=>{for(let i=0;i<40;i++){if(await marker()===11)return;await sleep(500);}throw new Error('schema marker was not rewritten to 11');};

  await login();
  await api('POST','/api/import',{docs:{},replace:['users/','costs/']});
  const user={name:'Repair QA',email:'repair-qa@example.test',phone:'923001234567',joinDate:'2026-09-24',subscriptions:[{id:'s1',kind:'monthly',cycle:'monthly',packageId:'pkg_c',currency:'PKR',start:'2026-09-24',prices:[{from:'2026-09-24',price:4200}],payments:[]}]};
  assert.equal((await api('PUT','/api/docs/users/repair-qa',user)).status,200);
  const put=async extra=>{const s=await settings();Object.assign(s,COST,extra||{});assert.equal((await api('PUT','/api/docs/settings/main',s)).status,200);return s;};
  assert.equal((await api('PUT','/api/docs/meta/schema',{version:11})).status,200);
  let want=await put({prorationBasis:'actual'});

  /* 1. current marker: nothing is rewritten */
  await reload();assert.deepEqual(await settings(),want);
  check('A store at the current schema marker is left alone');

  /* 2. missing marker: the repair runs but keeps every stored field and the owner's chosen basis */
  assert.equal((await api('DELETE','/api/docs/meta/schema')).status,200);await reload();await waitMarker();
  let s=await settings();
  assert.equal(s.pkrCostTax,7);assert.deepEqual(s.costPaymentHistory,COST.costPaymentHistory);assert.deepEqual(s.costPaymentBase,COST.costPaymentBase);assert.equal(s.ownerName,'QA Owner');
  check('Repair after a missing marker keeps the cost tax, rate history, base and ownerName');
  assert.equal(s.prorationBasis,'actual');
  check('A missing marker no longer overrides the proration basis the owner chose');

  /* 3. a recorded older schema still pins the fixed 30-day month, and still keeps the other fields */
  await put({prorationBasis:'actual'});assert.equal((await api('PUT','/api/docs/meta/schema',{version:5})).status,200);await reload();await waitMarker();
  s=await settings();assert.equal(s.prorationBasis,'fixed30');assert.equal(s.pkrCostTax,7);assert.deepEqual(s.costPaymentHistory,COST.costPaymentHistory);assert.equal(s.ownerName,'QA Owner');
  check('A recorded older schema still pins fixed 30 days and keeps the other fields');

  /* 4. the full settings save (CSV import that adds a package) keeps fields the page does not list */
  await page.click('#btn-io');await page.fill('#importText','name,email,join_date,package,kind,currency,price\nCsv User,csv@example.test,2026-09-24,NEWPKG,monthly,PKR,3000');
  await page.click('#btn-import');await page.waitForFunction(()=>/Imported/.test(document.querySelector('#importMsg').textContent),null,{timeout:20000});await sleep(1000);
  s=await settings();assert.ok(s.packages.some(p=>p.name==='NEWPKG'));assert.equal(s.ownerName,'QA Owner');assert.equal(s.pkrCostTax,7);assert.deepEqual(s.costPaymentHistory,COST.costPaymentHistory);
  check('Adding a package through the CSV import saves settings without dropping ownerName or the cost fields');

  assert.deepEqual(errors,[]);check('No unexpected console/page errors');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({version:'41',checks},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
