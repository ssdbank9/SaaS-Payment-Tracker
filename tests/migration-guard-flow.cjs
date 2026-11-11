// v65: a schema migration only normalises format. A store marked schema 4 with a plan set to a full first month (prorate:false), a
// lower-case currency code and a receipt without a currency is brought to the current schema: the codes are fixed, the receipt gets its
// plan's currency and a null rate, and prorate stays false. A customer whose email matched one of the retired v3-v10 repairs keeps the
// price and receipts the owner recorded. Synthetic records on a disposable server only:
//   WASOOLI_TEST_URL=http://127.0.0.1:<port> node tests/migration-guard-flow.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const stubWebFonts=require('./webfonts.cjs');

const base=process.env.WASOOLI_TEST_URL||'http://127.0.0.1:8098',H={'X-Requested-With':'wasool','Content-Type':'application/json'},checks=[];
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).protocol,'http:');
const out=path.resolve(process.env.WASOOLI_TEST_OUTPUT||'data/migration-guard-qa');fs.mkdirSync(out,{recursive:true});
const check=n=>{checks.push(n);console.log('PASS '+n);};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--disable-gpu']});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await stubWebFonts(ctx);await ctx.addInitScript(()=>{if(!localStorage.getItem('pt-today'))localStorage.setItem('pt-today','2026-10-20');});
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(base+'/login',{waitUntil:'domcontentloaded'});await page.locator('[name=passcode]').fill('test1234');await page.locator('button[type=submit]').click();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  const api=async(method,pth,data)=>{const r=await ctx.request.fetch(base+pth,{method,headers:H,data:data===undefined?undefined:JSON.stringify(data)});let j=null;try{j=await r.json();}catch(e){}return {status:r.status(),j};};
  const doc=async p=>((await api('GET','/api/docs/'+p)).j||{}).data;
  const until=async(fn,what)=>{for(let i=0;i<80;i++){if(await fn())return;await page.waitForTimeout(250);}throw new Error('timed out waiting for '+what);};
  assert.equal(await page.locator('#app-ver').textContent(),'v72');
  const cur=await doc('meta/schema');assert.ok(cur&&Number(cur.version)>=11,'a seeded store is at the current schema');

  // an old store: schema 4, a wholesaler customer on a full first month, a plan with a lower-case code and a receipt without a currency,
  // and a customer whose email the retired v3-v10 repairs used to match
  await api('POST','/api/import',{docs:{
   'users/mg_full':{name:'Full First Month',joinDate:'2026-10-15',wholesalerId:'w1',subscriptions:[{id:'s1',kind:'monthly',cycle:'monthly',name:'',packageId:'pkg_c',currency:'PKR',start:'2026-10-15',prorate:false,prices:[{from:'2026-10-15',price:4000}],payments:[]}]},
   'users/mg_code':{name:'Lower Case',joinDate:'2026-09-24',subscriptions:[{id:'s1',kind:'monthly',name:'',packageId:'pkg_c',currency:'usd',start:'2026-09-24',prorate:false,prices:[{from:'2026-09-24',price:20}],payments:[{id:'p1',date:'2026-09-24',amount:20}]}]},
   'users/mg_named':{name:'Named Customer',email:'erenkumcuoglu@gmail.com',joinDate:'2026-07-24',notes:'',subscriptions:[{id:'s1',kind:'monthly',cycle:'monthly',name:'',packageId:'pkg_c',currency:'USD',start:'2026-07-24',prorate:false,prices:[{from:'2026-07-24',price:20}],payments:[{id:'p1',date:'2026-07-24',amount:20,currency:'USD',rate:null,note:''}]}]},
  },replace:[]});
  const put=await api('PUT','/api/docs/meta/schema',{version:4,at:'2026-01-01T00:00:00.000Z'});assert.equal(put.status,200);
  await page.reload();await page.waitForSelector('#app-ver',{timeout:30000});
  await until(async()=>{const m=await doc('meta/schema');return m&&Number(m.version)>=11&&m.from===4;},'the migration to run');
  check('a store marked schema 4 is brought to the current schema on load');

  const full=(await doc('users/mg_full')).subscriptions[0];assert.equal(full.prorate,false);assert.equal(full.currency,'PKR');assert.equal(full.prices[0].price,4000);
  check('a plan set to a full first month keeps prorate:false (the old rule forced it on)');

  const code=(await doc('users/mg_code')).subscriptions[0];assert.equal(code.currency,'USD');assert.equal(code.cycle,'monthly');assert.equal(code.prorate,false);
  assert.equal(code.payments[0].currency,'USD');assert.equal(code.payments[0].rate,null);assert.equal(code.payments[0].amount,20);
  check('format is still normalised: lower-case usd becomes USD, a missing cycle is monthly, a receipt gets its plan currency and a null rate');

  const named=await doc('users/mg_named');const ns=named.subscriptions[0];assert.equal(ns.prices[0].price,20);assert.equal(ns.payments.length,1);assert.equal(ns.payments[0].amount,20);
  assert.equal(named.notes,'');assert.equal(named.telegram||'','');assert.equal(ns.prorate,false);
  check('a customer whose email matched the retired repairs keeps the recorded price, receipts, notes and contact details');

  await page.waitForTimeout(1500);
  const again=await doc('meta/schema');assert.equal(Number(again.version)>=11,true);
  await page.reload();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  assert.deepEqual((await doc('users/mg_full')).subscriptions[0].prorate,false);
  check('a second load changes nothing');

  await page.screenshot({path:path.join(out,'migration-guard-390.png'),fullPage:true});
  assert.deepEqual(errors,[]);check('No console or page errors');
  fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({version:'72',checks},null,2));console.log('migration-guard-flow: '+checks.length+' checks passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
