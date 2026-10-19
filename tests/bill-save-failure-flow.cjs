// Run against a disposable local Flask store only. No production URL is accepted.
// v49: a bill form whose save is refused must keep what the owner typed, say why, and stay open
// so it can be saved again. Before, the form closed first and the discount was lost with no message.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');const stubWebFonts=require('./webfonts.cjs');

const base = process.env.WASOOLI_TEST_URL || 'http://127.0.0.1:8098';
assert.equal(new URL(base).hostname, '127.0.0.1', 'Only a disposable local server may be tested');
assert.equal(new URL(base).protocol, 'http:');
const out = path.resolve(process.env.WASOOLI_TEST_OUTPUT || 'data/bill-qa');
fs.mkdirSync(out, {recursive:true});
const headers = {'X-Requested-With':'wasool'};
const checks = [];
const sample = () => ({name:'Bill QA example',email:'bill-qa@example.test',joinDate:'2026-09-01',confirmToken:'bill-qa-example-token',subscriptions:[{id:'qa-c',kind:'monthly',packageId:'pkg_c',cycle:'monthly',currency:'PKR',start:'2026-09-01',prorate:true,prices:[{from:'2026-09-01',price:4200}],payments:[{id:'qa-p1',date:'2026-09-01',amount:4200,currency:'PKR',rate:null,note:'First receipt'}]}]});
let browser;
(async () => {
  browser = await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE}:{}),args:['--disable-gpu']});
  const context = await browser.newContext({viewport:{width:1400,height:1000},colorScheme:'light'});await stubWebFonts(context);
  await context.addInitScript(() => localStorage.setItem('pt-today','2026-10-26'));
  await context.route('**fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await context.route('**fonts.gstatic.com/**',r=>r.fulfill({status:200,contentType:'font/woff2',body:Buffer.alloc(0)}));
  const page = await context.newPage();
  const errors = [];
  const expectedFailureErrors = [];
  let expectingFailure = false;
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'){if(expectingFailure)expectedFailureErrors.push(m.text());else errors.push(m.text());}});
  await page.goto(base+'/login',{waitUntil:'domcontentloaded'});
  await page.locator('[name=passcode]').fill('test1234');
  await page.locator('button[type=submit]').click();
  await page.waitForSelector('#tbody tr.row');
  const get = async id => (await (await context.request.get(base+'/api/docs/users/'+id)).json()).data;
  const put = async (id,user) => assert.equal((await context.request.put(base+'/api/docs/users/'+id,{headers,data:user})).status(),200);
  const reset = async user => {await put('qa-bill',user||sample());await page.reload({waitUntil:'domcontentloaded'});await page.locator('tr.row[data-id="qa-bill"]').waitFor();};
  const check = name => {checks.push(name);console.log('PASS '+name);};

  // 1. a save the server refuses (409, as another device that saved the same record would cause)
  await reset();await page.locator('tr.row[data-id="qa-bill"]').click();
  await page.locator('[data-key="amt:qa-c:2026-10-24"]').click();
  const form=page.locator('.amt-form[data-start="2026-10-24"]');
  await form.locator('[name=disc]').fill('500');
  assert.equal(await form.locator('[name=amount]').inputValue(),'3700');
  const conflict=async route=>{if(route.request().method()==='PUT')await route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'conflict'})});else await route.continue();};
  await page.route('**/api/docs/users/qa-bill',conflict);
  expectingFailure=true;
  await form.locator('button[type=submit]').click();
  await page.waitForFunction(()=>{const f=document.querySelector('.amt-form[data-start="2026-10-24"]');if(!f)return true;const e=f.querySelector('[data-role=amt-err]');return !!(e&&e.textContent.trim());},null,{timeout:20000});
  expectingFailure=false;
  const stillOpen=await page.locator('.amt-form[data-start="2026-10-24"]').count();
  assert.equal(stillOpen,1,'The bill form must stay open when the save was refused');
  const why=await page.locator('.amt-form[data-start="2026-10-24"] [data-role=amt-err]').innerText();
  assert.ok(why.trim(),'The bill form must say why it was not saved');
  assert.match(why,/not saved/i);
  assert.equal(await page.locator('.amt-form[data-start="2026-10-24"] [name=disc]').inputValue(),'500','The typed discount must be kept');
  assert.equal((await get('qa-bill')).subscriptions[0].periodOverrides,undefined,'Nothing may be stored when the save was refused');
  check('A refused save keeps the form open with the reason and the typed discount');

  // 2. the owner presses Save again and the server accepts: the discount is stored
  await page.unroute('**/api/docs/users/qa-bill',conflict);
  await page.locator('.amt-form[data-start="2026-10-24"] button[type=submit]').click();
  await page.locator('.amt-form[data-start="2026-10-24"]').waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.querySelector('tr.row[data-id="qa-bill"] [data-role="total-paid"]')?.textContent.includes('Discounts / reductions Rs 500'));
  assert.equal((await get('qa-bill')).subscriptions[0].periodOverrides['2026-10-24'].amount,3700);
  check('Saving again after a refused save stores the discount');

  // 3. a dropped connection is named as such and the form keeps the entry
  await reset();await page.locator('tr.row[data-id="qa-bill"]').click();
  await page.locator('[data-key="amt:qa-c:2026-10-24"]').click();
  const form2=page.locator('.amt-form[data-start="2026-10-24"]');
  await form2.locator('[name=disc]').fill('500');
  const drop=async route=>{if(route.request().method()==='PUT')await route.abort('connectionfailed');else await route.continue();};
  await page.route('**/api/docs/users/qa-bill',drop);
  expectingFailure=true;
  await form2.locator('button[type=submit]').click();
  await page.waitForFunction(()=>{const f=document.querySelector('.amt-form[data-start="2026-10-24"]');if(!f)return true;const e=f.querySelector('[data-role=amt-err]');return !!(e&&e.textContent.trim());},null,{timeout:20000});
  expectingFailure=false;
  await page.unroute('**/api/docs/users/qa-bill',drop);
  assert.equal(await page.locator('.amt-form[data-start="2026-10-24"]').count(),1,'The bill form must stay open when the connection dropped');
  const why2=await page.locator('.amt-form[data-start="2026-10-24"] [data-role=amt-err]').innerText();
  assert.match(why2,/not saved/i);
  assert.equal(await page.locator('.amt-form[data-start="2026-10-24"] [name=disc]').inputValue(),'500','The typed discount must be kept after a dropped connection');
  assert.equal((await get('qa-bill')).subscriptions[0].periodOverrides,undefined,'Nothing may be stored when the connection dropped');
  check('A dropped connection keeps the form open and names the reason');

  assert.deepEqual(errors,[],'Console and page errors must be empty');
  assert.equal(expectedFailureErrors.length,2,'The two refused saves must each show one network error');
  const summary={checks:checks.length,passed:checks,consoleErrors:errors,expectedFailureErrors,output:out};
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
  await browser.close();browser=null;
})().catch(async e=>{console.error(e);if(browser)await browser.close();process.exitCode=1;});
