// v42 #30: in browser-only mode (index.html opened as a file) a change is never reported as saved when the browser refused to store it.
// No server needed: opens index.html directly. Synthetic sample data only. Run: node tests/browser-save-failure-flow.cjs
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const checks=[];const check=n=>{checks.push(n);console.log('PASS '+n);};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--disable-gpu']});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844}});
  await ctx.addInitScript(()=>{if(!localStorage.getItem('pt-today'))localStorage.setItem('pt-today','2026-10-20');});
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.stack));
  await page.goto(pathToFileURL(path.resolve(__dirname,'..','index.html')).href,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(1500);
  const rows=()=>page.evaluate(()=>[...document.querySelectorAll('#tbody tr')].map(r=>r.textContent).join('|'));
  const addUser=async name=>{
   if(await page.locator('#addPanel').isHidden())await page.locator('#btn-add').click();await page.locator('#a-name').fill(name);
   if(!await page.locator('#a-join').inputValue())await page.locator('#a-join').fill('2026-10-01');
   if(!await page.locator('#a-start').inputValue())await page.locator('#a-start').fill('2026-10-01');
   await page.locator('#a-price').fill('4200');await page.locator('#addForm button[type=submit]').click();
  };
  // storage refuses writes (full or blocked)
  await page.evaluate(()=>{window.__real=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException('quota','QuotaExceededError');};});
  await addUser('Failing Save Person');
  await page.waitForSelector('.toast',{timeout:5000});
  assert.match(await page.locator('.toast').first().textContent(),/could not save your change.*Nothing was saved/);check('a refused browser write shows a plain "nothing was saved" message');
  await page.waitForTimeout(800);
  assert.ok(!(await rows()).includes('Failing Save Person'));check('...and the person is not shown as added');
  assert.equal(await page.locator('#paymentDialog[open]').count(),0);check('...and no receipt form opens for a person who was not saved');
  // storage works again: the same action succeeds
  await page.evaluate(()=>{Storage.prototype.setItem=window.__real;});
  await page.waitForTimeout(3600);
  await addUser('Working Save Person');
  await page.waitForFunction(()=>[...document.querySelectorAll('#tbody tr')].some(r=>r.textContent.includes('Working Save Person')),null,{timeout:8000});check('with storage working again the same add succeeds');
  const stored=await page.evaluate(()=>localStorage.getItem('pt-data')||'');
  assert.ok(stored.includes('Working Save Person')&&!stored.includes('Failing Save Person'));check('...and only the successful one is stored');
  assert.deepEqual(errors,[]);check('no page errors');
 }finally{await browser.close();}
 console.log('Passed '+checks.length+' browser save-failure checks');
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
