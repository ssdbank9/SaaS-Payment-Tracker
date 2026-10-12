// v44: the screenshot path end to end: a picture of a card statement goes to /api/read-image, the transactions come back as review rows
// (charges ticked, payments to the card not), Apply records the costs, and importing the same statement again marks every row
// "Possible duplicate" and unticks it. A charge equal to a customer's calculated supplier cost is flagged too.
// Start tests/fake-reader-server.py on a disposable store first (it replaces only the call to the Claude API), then:
//   WASOOLI_TEST_URL=http://127.0.0.1:<port> node tests/statement-import-flow.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.WASOOLI_TEST_URL||'http://127.0.0.1:8098',H={'X-Requested-With':'wasool','Content-Type':'application/json'},checks=[];
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).protocol,'http:');
const out=path.resolve(process.env.WASOOLI_TEST_OUTPUT||'data/statement-import-qa');fs.mkdirSync(out,{recursive:true});
const check=n=>{checks.push(n);console.log('PASS '+n);};
const png=path.resolve(__dirname,'..','assets','icon-192.png');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--disable-gpu']});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await ctx.addInitScript(()=>{if(!localStorage.getItem('pt-today'))localStorage.setItem('pt-today','2026-10-20');});
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(base+'/login',{waitUntil:'domcontentloaded'});await page.locator('[name=passcode]').fill('test1234');await page.locator('button[type=submit]').click();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  const api=async(method,pth,data)=>{const r=await ctx.request.fetch(base+pth,{method,headers:H,data:data===undefined?undefined:JSON.stringify(data)});let j=null;try{j=await r.json();}catch(e){}return {status:r.status(),j};};
  const costs=async()=>((await api('GET','/api/docs?prefix=costs/')).j.docs||[]).map(d=>d.data||d);
  const until=async(fn,what)=>{for(let i=0;i<60;i++){if(await fn())return;await page.waitForTimeout(250);}throw new Error('timed out waiting for '+what);};
  assert.equal((await api('GET','/api/read-image')).j.enabled,true);
  await api('POST','/api/import',{docs:{
   'users/si1':{name:'Supplier Cost Person',joinDate:'2026-08-24',subscriptions:[{id:'s1',kind:'monthly',cycle:'monthly',packageId:'pkg_c',currency:'PKR',start:'2026-08-24',prorate:true,prices:[{from:'2026-08-24',price:7000}],payments:[],
     accountCost:{frequency:'monthly',first:'full',entries:[{from:'2026-08-24',amount:5150,currency:'PKR',supplier:'OpenAI'}],overrides:{}}}]},
  },replace:[]});
  await page.reload();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  const before=(await costs()).filter(c=>c.source==='screenshot').length;
  const readPicture=async()=>{await page.locator('#shot-file').setInputFiles(png);await until(async()=>(await page.locator('#rv-body tr').count())===3,'three transactions read from the picture');};
  await page.locator('#btn-shot').click();await page.locator('#shotPanel').waitFor({state:'visible'});
  assert.match(await page.locator('#shot-cap').textContent(),/reads each picture/);check('with reading set up, the import panel accepts statement pictures');
  await readPicture();
  const rows=await page.locator('#rv-body tr').evaluateAll(t=>t.map(x=>({sel:x.dataset.sel,dup:x.dataset.dup,desc:x.querySelector('[data-f=desc]').value,amt:x.querySelector('[data-f=amount]').value,date:x.querySelector('[data-f=date]').value})));
  assert.deepEqual(rows.map(r=>[r.date,r.desc,r.amt]),[['2026-09-25','OPENAI *CHATGPT SUBSCR','5150'],['2026-09-26','FED EXCISE DUTY','823.5'],['2026-09-28','PAYMENT RECEIVED - THANK YOU','20000']]);
  check('the picture goes to the reader and each transaction comes back as a row with its date, description and amount');
  // the OpenAI charge equals the customer's calculated supplier cost (Rs 5,150 on 24 Sep, one day apart), so it is flagged and unticked
  assert.deepEqual(rows.map(r=>r.dup+r.sel),['10','01','00']);
  assert.match(await page.locator('#rv-body tr').first().textContent(),/Possible duplicate of Supplier Cost Person/);
  check('a charge equal to a customer\'s calculated supplier cost is marked Possible duplicate and unticked; the payment to the card is unticked; the tax charge stays ticked');
  await page.locator('#rv-body tr').nth(1).locator('[data-f=role]').selectOption('cost');
  await page.locator('#rv-save').click();
  await until(async()=>(await costs()).filter(c=>c.source==='screenshot').length===before+1,'one cost saved');
  const saved=(await costs()).filter(c=>c.source==='screenshot');assert.equal(saved.length,before+1);assert.equal(saved.at(-1).cost,823.5);assert.equal(saved.at(-1).date,'2026-09-26');
  check('Apply records only the ticked charge, with the date and amount read from the statement');
  // the same statement again (after clearing what was left in the list): every charge is flagged
  await page.locator('#rv-clear').click();await until(async()=>(await page.locator('#rv-body tr').count())===0,'list cleared');
  await readPicture();
  const again=await page.locator('#rv-body tr').evaluateAll(t=>t.map(x=>x.dataset.dup+x.dataset.sel));
  assert.deepEqual(again.slice(0,2),['10','10']);assert.equal(await page.locator('#rv-save').isDisabled(),true);
  check('reading the same statement again marks the charges Possible duplicate and nothing is ticked');
  await page.locator('#rv-body tr').nth(1).locator('[data-f=sel]').check();assert.equal(await page.locator('#rv-save').isDisabled(),false);check('a flagged row can be ticked again if it really is a second charge');
  await page.locator('#rv-clear').click();
  await page.screenshot({path:path.join(out,'import-390.png')});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);check('No sideways scroll and no unexpected console/page errors');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({version:'44',checks},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
