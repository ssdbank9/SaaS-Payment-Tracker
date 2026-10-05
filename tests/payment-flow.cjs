// Run against a disposable local Flask store only. No production URL is accepted.
// Requires Playwright; PLAYWRIGHT_MODULE and PLAYWRIGHT_EXECUTABLE are optional overrides.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.WASOOLI_TEST_URL || 'http://127.0.0.1:8098';
assert.equal(new URL(base).hostname, '127.0.0.1', 'Only a disposable local server may be tested');
assert.equal(new URL(base).protocol, 'http:');
const out = path.resolve(process.env.WASOOLI_TEST_OUTPUT || 'data/payment-qa');
fs.mkdirSync(out, {recursive:true});
const headers = {'X-Requested-With':'wasool'};
const checks = [];
const sample = () => ({name:'Payment QA example',email:'payment-qa@example.test',joinDate:'2026-09-01',confirmToken:'qa-payment-example-token',subscriptions:[{id:'qa-c',kind:'monthly',packageId:'pkg_c',cycle:'monthly',currency:'PKR',start:'2026-09-01',prorate:true,prices:[{from:'2026-09-01',price:4200}],payments:[{id:'qa-p1',date:'2026-09-01',amount:4200,currency:'PKR',rate:null,note:'First receipt'},{id:'qa-p2',date:'2026-10-04',amount:4200,currency:'PKR',rate:null,note:'Second receipt'}]}]});
let browser;
(async () => {
  browser = await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE}:{}),args:['--disable-gpu']});
  const context = await browser.newContext({viewport:{width:1400,height:1000},colorScheme:'light'});
  await context.addInitScript(() => localStorage.setItem('pt-today','2026-10-26'));
  const page = await context.newPage();
  const errors = [];
  const expectedFailureErrors = [];
  let testingFailedSave = false;
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'){if(testingFailedSave&&m.text().includes('503'))expectedFailureErrors.push(m.text());else errors.push(m.text());}});
  await page.goto(base+'/login',{waitUntil:'domcontentloaded'});
  await page.locator('[name=passcode]').fill('test1234');
  await page.locator('button[type=submit]').click();
  await page.waitForSelector('#tbody tr.row');
  assert.equal((await (await context.request.get(base+'/healthz')).json()).version,'34');
  const get = async id => (await (await context.request.get(base+'/api/docs/users/'+id)).json()).data;
  const put = async (id,user) => assert.equal((await context.request.put(base+'/api/docs/users/'+id,{headers,data:user})).status(),200);
  const reset = async user => {if(await page.locator('#paymentDialog').evaluate(d=>d.open))await page.locator('#payment-cancel').click();await put('qa-payment',user||sample());await page.reload({waitUntil:'domcontentloaded'});await page.locator('tr.row[data-id="qa-payment"]').waitFor();};
  const row = () => page.locator('tr.row[data-id="qa-payment"]');
  const paid = () => row().locator('[data-role=total-paid]');
  const open = async () => {await row().locator('.row-pay').click();await page.locator('#paymentDialog[open]').waitFor();};
  const options = async () => {if(!await page.locator('#payment-more').evaluate(d=>d.open))await page.locator('#payment-more summary').click();};
  const expectPaid = async value => page.waitForFunction(v=>{const el=document.querySelector('tr.row[data-id="qa-payment"] [data-role="total-paid"]');return !!el&&el.textContent.includes(v);},value);
  const save = async () => {await page.locator('#payment-save').click();await page.locator('#paymentDialog').waitFor({state:'hidden'});};
  const check = (name) => {checks.push(name);console.log('PASS '+name);};

  await reset();await open();
  assert.equal(await page.locator('#payment-month').inputValue(),'2');
  assert.equal(await page.locator('#payment-amount').inputValue(),'3220');
  assert.match(await page.locator('#payment-bill').innerText(),/Oct 2026/);
  assert.match(await page.locator('#payment-bill').innerText(),/already covered Rs 980/);
  assert.match(await page.locator('#payment-preview').innerText(),/Rs 8,400 → Rs 11,620/);
  await page.locator('#payment-date').fill('2026-10-29');
  assert.equal(await page.locator('#payment-amount').inputValue(),'3220');
  await save();await expectPaid('11,620');
  let user=await get('qa-payment');assert.equal(user.subscriptions[0].payments.at(-1).date,'2026-10-29');
  assert.equal(user.subscriptions[0].prices[0].price,4200);assert.equal(user.subscriptions[0].start,'2026-09-01');
  await page.reload({waitUntil:'domcontentloaded'});await expectPaid('11,620');check('Month choice, cash date, immediate total and reload persistence');

  await reset();await open();await page.locator('#payment-month').selectOption('3');
  assert.equal(await page.locator('#payment-amount').inputValue(),'7420');
  assert.match(await page.locator('#payment-bill').innerText(),/Includes earlier unpaid periods: Oct 2026/);
  await save();await expectPaid('15,820');user=await get('qa-payment');
  assert.deepEqual(user.subscriptions[0].payments.slice(-2).map(p=>p.amount),[3220,4200]);
  assert.equal(user.subscriptions[0].payments.length,4);check('Later month includes earlier dues; same-day receipts both retained');

  await reset();await open();await page.locator('#payment-amount').fill('1000');
  assert.match(await page.locator('#payment-preview').innerText(),/partial payment/);
  await save();await expectPaid('9,400');await open();assert.equal(await page.locator('#payment-amount').inputValue(),'2220');
  await save();await expectPaid('11,620');check('Partial receipt and remaining full-cycle charge');

  await reset();await row().click();await page.locator('[data-act=pay-edit][data-pay=qa-p2]').click();
  assert.equal(await page.locator('#payment-month-label').isHidden(),true);
  assert.match(await page.locator('#payment-bill').innerText(),/Sep 2026.*Oct 2026/s);
  await page.locator('#payment-amount').fill('4800');
  assert.match(await page.locator('#payment-preview').innerText(),/Rs 8,400 → Rs 9,000/);
  await save();await expectPaid('9,000');user=await get('qa-payment');
  assert.equal(user.subscriptions[0].payments.length,2);assert.equal(user.subscriptions[0].payments[0].amount,4200);
  assert.equal(user.subscriptions[0].payments.find(p=>p.id==='qa-p2').amount,4800);check('Receipt edit identifies covered months and updates cash without duplicating');

  await reset();await row().click();await page.locator('[data-key="amt:qa-c:2026-10-24"]').click();
  const chargeForm=page.locator('.amt-form[data-start="2026-10-24"]');
  await chargeForm.locator('[name=disc]').fill('500');
  assert.equal(await chargeForm.locator('[name=amount]').inputValue(),'3700');
  await chargeForm.locator('button[type=submit]').click();await chargeForm.waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.querySelector('tr.row[data-id="qa-payment"] [data-role="total-paid"]')?.textContent.includes('Discounts / reductions Rs 500'));
  assert.equal((await get('qa-payment')).subscriptions[0].periodOverrides['2026-10-24'].amount,3700);
  assert.deepEqual((await get('qa-payment')).subscriptions[0].payments,sample().subscriptions[0].payments);
  assert.match(await paid().innerText(),/Discounts \/ reductions Rs 500/);
  await open();assert.equal(await page.locator('#payment-amount').inputValue(),'2720');
  assert.match(await page.locator('#payment-bill').innerText(),/Rs 500 discount/);
  await save();await expectPaid('11,120');
  user=await get('qa-payment');assert.equal(user.subscriptions[0].payments.reduce((n,p)=>n+p.amount,0),11120);
  assert.match(await paid().innerText(),/Rs 500/);check('Discount reduces charge; dashboard receipts remain actual cash');

  await reset();await open();await options();await page.locator('#payment-currency').selectOption('USD');
  assert.equal(await page.locator('#payment-amount').inputValue(),'11.5');await page.locator('#payment-rate').fill('280');
  await save();user=await get('qa-payment');assert.equal(user.subscriptions[0].payments.at(-1).currency,'USD');
  assert.equal(user.subscriptions[0].payments.at(-1).amount,11.5);assert.equal(user.subscriptions[0].payments.at(-1).rate,280);
  assert.match(await row().innerText(),/Paid for Oct/);check('USD receipt converts at its recorded rate');

  const settingsPath=base+'/api/docs/settings/main';
  const savedSettings=(await (await context.request.get(settingsPath)).json()).data;
  try{
    assert.equal((await context.request.put(settingsPath,{headers,data:{...savedSettings,rate:null}})).status(),200);
    await reset();await open();await options();await page.locator('#payment-currency').selectOption('USD');
    assert.equal(await page.locator('#payment-save').isDisabled(),true);
    assert.match(await page.locator('#payment-preview').innerText(),/Set the exchange rate/);
    await page.locator('#payment-rate').fill('280');assert.equal(await page.locator('#payment-amount').inputValue(),'11.5');
    await save();user=await get('qa-payment');assert.equal(user.subscriptions[0].payments.at(-1).rate,280);
    assert.match(await row().innerText(),/Paid for Oct/);check('Missing default rate requires a usable receipt rate');
  }finally{
    assert.equal((await context.request.put(settingsPath,{headers,data:savedSettings})).status(),200);
  }

  const refunded=sample();refunded.subscriptions[0].refunds=[{id:'qa-refund',date:'2026-10-05',amount:980,currency:'PKR',rate:null,note:'QA refund'}];
  await reset(refunded);await expectPaid('7,420');await open();
  assert.equal(await page.locator('#payment-amount').inputValue(),'4200');
  await save();await expectPaid('11,620');user=await get('qa-payment');
  assert.deepEqual(user.subscriptions[0].refunds,refunded.subscriptions[0].refunds);
  assert.equal(user.subscriptions[0].payments.reduce((n,p)=>n+p.amount,0),12600);check('Refunds reduce kept receipts without being shown as discounts');

  const ended=sample();ended.subscriptions[0].end='2026-10-23';
  await reset(ended);await open();assert.equal(await page.locator('#payment-month-label').isHidden(),true);
  assert.match(await page.locator('#payment-bill').innerText(),/No unpaid period/);
  await page.locator('#payment-amount').fill('1000');await save();await expectPaid('9,400');
  user=await get('qa-payment');assert.equal(user.subscriptions[0].end,'2026-10-23');assert.equal(user.subscriptions[0].payments.length,3);
  check('Ended plan still accepts actual money without creating a new charge');

  const multi=sample();multi.subscriptions.push({id:'qa-g',kind:'monthly',cycle:'yearly',packageId:'pkg_g',currency:'PKR',start:'2026-08-30',prorate:false,prices:[{from:'2026-08-30',price:50000}],payments:[{id:'qa-gp1',date:'2026-08-30',amount:25000,currency:'PKR'}]});
  multi.subscriptions.push({id:'qa-item',kind:'one-time',name:'Setup item',packageId:'pkg_c',currency:'PKR',total:1000,payments:[]});
  await reset(multi);await open();await page.locator('#payment-account').selectOption('qa-g');
  assert.equal(await page.locator('#payment-amount').inputValue(),'25000');await save();
  user=await get('qa-payment');assert.equal(user.subscriptions[0].payments.length,2);assert.equal(user.subscriptions[1].payments.length,2);
  await open();await page.locator('#payment-account').selectOption('qa-item');assert.equal(await page.locator('#payment-amount').inputValue(),'1000');
  assert.equal(await page.locator('#payment-month-label').isHidden(),true);
  await save();user=await get('qa-payment');assert.equal(user.subscriptions[2].payments.length,1);check('Account picker isolates yearly and one-time receipts');

  await reset();await page.locator('#btn-add').click();
  await page.locator('#a-name').fill('Joining QA '+Date.now());await page.locator('#a-join').fill('2026-10-10');
  assert.match(await page.locator('#a-bill-preview').innerText(),/First bill: Rs 1,960/);
  assert.match(await page.locator('#a-bill-preview').innerText(),/Then Rs 4,200\/mo from Oct 24, 2026/);
  await page.locator('#addForm button[type=submit]').click();await page.locator('#paymentDialog[open]').waitFor();
  assert.equal(await page.locator('#payment-amount').inputValue(),'1960');
  await page.locator('#payment-date').fill('2026-10-21');assert.equal(await page.locator('#payment-amount').inputValue(),'1960');
  await save();check('New user previews one prorated bill and opens first receipt form');

  await reset();await open();await options();await page.locator('#payment-amount').fill('3000');await page.locator('#payment-note').fill('Keep this draft');
  await put('qa-background',{name:'Background QA '+Date.now(),joinDate:'2026-10-26',confirmToken:'qa-background-example-token',subscriptions:[]});
  await page.waitForTimeout(4500);
  assert.equal(await page.locator('#payment-amount').inputValue(),'3000');assert.equal(await page.locator('#payment-note').inputValue(),'Keep this draft');
  await page.locator('#payment-cancel').click();assert.equal((await get('qa-payment')).subscriptions[0].payments.length,2);check('Background redraw keeps unsaved receipt fields; cancel stores no money');

  await open();await page.locator('#payment-amount').fill('0');assert.equal(await page.locator('#payment-save').isDisabled(),true);
  await page.locator('#payment-amount').fill('3220');await options();await page.locator('#payment-rate').fill('-1');assert.equal(await page.locator('#payment-save').isDisabled(),true);
  await page.locator('#payment-cancel').click();check('Invalid amounts and exchange rates cannot be saved');

  await reset();await open();await options();await page.locator('#payment-note').fill('Retry once');
  const failRoute=async route=>{if(route.request().method()==='PUT')await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'qa_unavailable'})});else await route.continue();};
  testingFailedSave=true;await page.route('**/api/docs/users/qa-payment',failRoute);await page.locator('#payment-save').click();
  await page.waitForFunction(()=>document.querySelector('#payment-error').textContent.includes('not saved'));
  assert.equal(await page.locator('#payment-amount').inputValue(),'3220');assert.equal(await page.locator('#payment-note').inputValue(),'Retry once');
  assert.equal((await get('qa-payment')).subscriptions[0].payments.length,2);
  await page.unroute('**/api/docs/users/qa-payment',failRoute);testingFailedSave=false;await save();
  assert.equal((await get('qa-payment')).subscriptions[0].payments.length,3);await expectPaid('11,620');
  assert.equal(expectedFailureErrors.length,1);check('Failed save retains fields and retry records one receipt');

  await reset();
  for(const width of [390,1400])for(const theme of ['light','dark']){
    await page.waitForFunction(()=>document.fonts.status==='loaded');
    await page.setViewportSize({width,height:width===390?844:1000});await page.emulateMedia({colorScheme:theme});
    await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
    await row().scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'Page horizontal scroll at '+width+' '+theme);
    const bounds=await row().locator('.row-pay').boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=width,'Record button reachable');
    await page.screenshot({path:path.join(out,'main-'+width+'-'+theme+'.png')});
    await open();await page.locator('#payment-month').selectOption('3');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
    const dialog=await page.locator('#paymentDialog').boundingBox();assert(dialog.x>=0&&dialog.x+dialog.width<=width);
    await page.locator('#payment-save').scrollIntoViewIfNeeded();const saveBox=await page.locator('#payment-save').boundingBox();assert(saveBox.x>=0&&saveBox.x+saveBox.width<=width);
    await page.screenshot({path:path.join(out,'payment-'+width+'-'+theme+'.png')});
    await page.locator('#payment-cancel').click();
    await page.locator('#btn-add').click();await page.locator('#a-join').fill('2026-10-10');
    assert.match(await page.locator('#a-bill-preview').innerText(),/First bill: Rs 1,960/);
    await page.locator('#a-bill-preview').scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'Joining form horizontal scroll');
    const firstBill=await page.locator('#a-bill-preview').boundingBox();assert(firstBill.x>=0&&firstBill.x+firstBill.width<=width);
    await page.screenshot({path:path.join(out,'joining-'+width+'-'+theme+'.png')});
    await page.locator('#add-close').click();check('Layout '+width+'px '+theme+' main, receipt and joining bill');
  }
  assert.deepEqual(errors,[],'Console and page errors must be empty');
  const summary={version:'34',checks:checks.length,passed:checks,consoleErrors:errors,expectedFailureErrors,output:out};
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
  await browser.close();browser=null;
})().catch(async e=>{console.error(e);if(browser)await browser.close();process.exitCode=1;});
