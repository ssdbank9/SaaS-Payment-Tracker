// v41: CSV export neutralises formulas (#27); a CSV import is all or nothing when a new product cannot be saved (#28). Synthetic local records only.
// Start a disposable server (see AGENTS.md), then: node tests/csv-flow.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.WASOOLI_TEST_URL||'http://127.0.0.1:8098',H={'X-Requested-With':'wasool','Content-Type':'application/json'},checks=[];
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).protocol,'http:');
const out=path.resolve(process.env.WASOOLI_TEST_OUTPUT||'data/csv-qa');fs.mkdirSync(out,{recursive:true});
const check=n=>{checks.push(n);console.log('PASS '+n);};
const mon=(extra)=>Object.assign({id:'s1',kind:'monthly',cycle:'monthly',packageId:'pkg_c',currency:'PKR',start:'2026-09-24',prices:[{from:'2026-09-24',price:4200}],payments:[{id:'p1',date:'2026-09-24',amount:4200,currency:'PKR'}]},extra||{});
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--disable-gpu']});
 try{
  const ctx=await browser.newContext({viewport:{width:1400,height:900},acceptDownloads:true});await ctx.addInitScript(()=>{if(!localStorage.getItem('pt-today'))localStorage.setItem('pt-today','2026-10-20');});
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error'&&!/503/.test(m.text()))errors.push(m.text());});
  await page.goto(base+'/login',{waitUntil:'domcontentloaded'});await page.locator('[name=passcode]').fill('test1234');await page.locator('button[type=submit]').click();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  const api=async(method,pth,data)=>{const r=await ctx.request.fetch(base+pth,{method,headers:H,data:data===undefined?undefined:JSON.stringify(data)});let j=null;try{j=await r.json();}catch(e){}return {status:r.status(),j};};
  const users=async()=>(await api('GET','/api/docs?prefix=users/')).j.docs.map(d=>({id:d.path.split('/')[1],...d.data}));
  await api('POST','/api/import',{docs:{
    'users/e1':{name:'=HYPERLINK("http://x.test","click")',email:'e1@example.test',phone:'923001234567',telegram:'handle',joinDate:'2026-09-24',notes:'+cmd|calc',subscriptions:[mon({name:'@SUM(1+1)'})]},
    'users/e2':{name:'Eren Turkish',email:'e2@example.test',phone:'905333537662',joinDate:'2026-09-24',notes:'-2+3',subscriptions:[mon()]}},replace:['users/','costs/']});
  await page.reload();await page.waitForSelector('tr.row[data-id="e1"]');await page.waitForTimeout(1500);

  /* #27 export */
  await page.locator('#btn-io').click();const dl=page.waitForEvent('download');await page.locator('#btn-export').click();const file=await (await dl).path();const csv=fs.readFileSync(file,'utf8');fs.writeFileSync(path.join(out,'export.csv'),csv);
  assert.ok(!/(^|,)"?=HYPERLINK/m.test(csv)&&!/(^|,)"?@SUM/m.test(csv)&&!/(^|,)"?\+cmd/m.test(csv)&&!/(^|,)"?\+9[0-9]{9,}/m.test(csv),'an unprotected formula cell remains');
  assert.match(csv,/"'=HYPERLINK\(""http:\/\/x\.test"",""click""\)"/);assert.match(csv,/'@SUM\(1\+1\)/);assert.match(csv,/'\+cmd\|calc/);
  check('The exported CSV protects cells that start with = + - or @ with a leading apostrophe (a formula in a name, a plan label and a note)');
  assert.match(csv,/'\+923001234567/);assert.match(csv,/'\+905333537662/);assert.match(csv,/'@handle|(^|,)handle(,|$)/m);
  check('Phone numbers (+92…, +90…) are exported as text so Excel does not turn them into errors or drop the +');
  assert.match(csv,/,4200,/);assert.doesNotMatch(csv,/'4200|'-?\d+(\.\d+)?,/);
  check('Real numbers (prices, amounts) are left untouched');

  /* round trip: import that file into an empty store */
  await api('POST','/api/import',{docs:{},replace:['users/','costs/']});await page.reload();await page.waitForSelector('#app-ver');await page.waitForTimeout(2000);
  await page.locator('#btn-io').click();await page.fill('#importText',csv);await page.click('#btn-import');await page.waitForFunction(()=>/Imported/.test(document.querySelector('#importMsg').textContent),null,{timeout:20000});await page.waitForTimeout(1200);
  const us=await users();const a=us.find(u=>u.email==='e1@example.test'),b=us.find(u=>u.email==='e2@example.test');
  assert.equal(a.name,'=HYPERLINK("http://x.test","click")');assert.equal(a.notes,'+cmd|calc');assert.equal(a.phone,'923001234567');assert.equal(b.phone,'905333537662');assert.equal(a.subscriptions[0].name,'@SUM(1+1)');
  check('Importing the exported file back restores the original text (the protective apostrophes are removed) and keeps +92 and +90 numbers intact');

  /* #28 a failed save of the new product imports nothing */
  const pkBefore=(await api('GET','/api/docs/settings/main')).j.data.packages.length;
  let blocked=0,failSave=true;await page.route(u=>/\/api\/docs\/settings\/main$/.test(u.toString()),async route=>{const m=route.request().method();if((m==='PUT'||m==='PATCH')&&failSave){blocked++;return route.fulfill({status:503,contentType:'application/json',body:'{"error":"injected"}'});}return route.continue();});
  const csv2='name,email,join_date,package,kind,currency,price\nNew Pkg User,newpkg@example.test,2026-09-24,BRANDNEW,monthly,PKR,3000';
  await page.locator('#importText').fill(csv2);await page.click('#btn-import');await page.waitForTimeout(2500);
  assert.match(await page.locator('#importMsg').innerText(),/Nothing was imported: the new product could not be saved/);assert.ok(blocked>=1);
  assert.equal((await users()).find(u=>u.email==='newpkg@example.test'),undefined);assert.equal((await api('GET','/api/docs/settings/main')).j.data.packages.length,pkBefore);
  check('If the new product cannot be saved the import stops: "Nothing was imported", no customer saved, no product added');
  failSave=false;await page.locator('#importText').fill(csv2);await page.click('#btn-import');await page.waitForFunction(()=>/Imported 1 new/.test(document.querySelector('#importMsg').textContent),null,{timeout:20000});await page.waitForTimeout(1200);
  const nu=(await users()).find(u=>u.email==='newpkg@example.test');const pk=(await api('GET','/api/docs/settings/main')).j.data.packages;
  assert.ok(nu&&pk.some(p=>p.id===nu.subscriptions[0].packageId&&p.name==='BRANDNEW'));
  check('Trying again once saving works imports the customer and creates the product');

  assert.deepEqual(errors,[]);check('No unexpected console/page errors');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({version:'42',checks},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
