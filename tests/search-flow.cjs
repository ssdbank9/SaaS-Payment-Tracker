// v58: the Search panel: anything (name, phone in any form, Telegram, notes, payment notes), product, status, currency, dates
// (joined, plan started, cancelled / ended, paid between), money (owes at least, price between), totals, open a customer, CSV.
// Synthetic records on a disposable server only:  WASOOLI_TEST_URL=http://127.0.0.1:<port> node tests/search-flow.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const stubWebFonts=require('./webfonts.cjs');

const base=process.env.WASOOLI_TEST_URL||'http://127.0.0.1:8098',H={'X-Requested-With':'wasool','Content-Type':'application/json'},checks=[];
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).protocol,'http:');
const out=path.resolve(process.env.WASOOLI_TEST_OUTPUT||'data/search-qa');fs.mkdirSync(out,{recursive:true});
const check=n=>{checks.push(n);console.log('PASS '+n);};
const plan=(id,cur,price,start,payments,extra)=>Object.assign({id,kind:'monthly',cycle:'monthly',name:'',packageId:'pkg_c',currency:cur,start,prorate:true,prices:[{from:start,price}],payments},extra||{});
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--disable-gpu']});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,acceptDownloads:true});await stubWebFonts(ctx);
  await ctx.addInitScript(()=>{if(!localStorage.getItem('pt-today'))localStorage.setItem('pt-today','2026-10-20');});
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(base+'/login',{waitUntil:'domcontentloaded'});await page.locator('[name=passcode]').fill('test1234');await page.locator('button[type=submit]').click();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  const api=async(method,pth,data)=>{const r=await ctx.request.fetch(base+pth,{method,headers:H,data:data===undefined?undefined:JSON.stringify(data)});let j=null;try{j=await r.json();}catch(e){}return {status:r.status(),j};};
  for(const d of ((await api('GET','/api/docs?prefix=users/')).j.docs||[]))await api('DELETE','/api/docs/'+d.path);
  await api('POST','/api/import',{docs:{
   'users/sa':{name:'Ali Raza',email:'ali@example.test',phone:'923001112222',telegram:'aliraza',notes:'NayaPay',joinDate:'2026-09-24',subscriptions:[plan('s1','PKR',4200,'2026-09-24',[])]},
   'users/sb':{name:'Bina Shah',joinDate:'2026-10-01',subscriptions:[plan('s1','USD',10,'2026-10-01',[{id:'b1',date:'2026-10-05',amount:10,currency:'USD',note:'USDT Binance'}])]},
   'users/sc':{name:'Cara Khan',joinDate:'2026-08-24',cancel:{lastDay:'2026-09-23',reason:'moved away',note:'',at:'2026-09-20',ended:['s1']},subscriptions:[plan('s1','PKR',3000,'2026-08-24',[{id:'c1',date:'2026-08-24',amount:3000,currency:'PKR',note:''}],{end:'2026-09-23'})]},
  },replace:[]});
  await page.reload();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2000);
  assert.equal(await page.locator('#app-ver').textContent(),'v69');
  const names=async()=>(await page.locator('#sr-body tr td.who b').allTextContents()).sort();
  const clear=async()=>{await page.locator('#sr-clear').click();};
  const set=async(id,v)=>{const el=page.locator('#'+id);if(await el.evaluate(e=>e.tagName)==='SELECT')await el.selectOption(v);else await el.fill(v);};

  // 1. the panel opens from the header and lists everyone
  await page.locator('#btn-search').click();await page.locator('#searchPanel').waitFor({state:'visible'});assert.equal(await page.locator('#btn-search').getAttribute('aria-expanded'),'true');
  assert.deepEqual(await names(),['Ali Raza','Bina Shah','Cara Khan']);assert.match(await page.locator('#sr-tot').innerText(),/^3 customers/);
  check('Search opens from the header and lists all 3 customers');

  // 2. anything: phone written any way, Telegram, notes, payment notes, cancel reason
  for(const [q,want] of [['0300 111','Ali Raza'],['+92 300-1112222','Ali Raza'],['aliraza','Ali Raza'],['nayapay','Ali Raza'],['usdt','Bina Shah'],['moved away','Cara Khan']]){await set('sr-q',q);assert.deepEqual(await names(),[want],q);}
  await clear();
  check('Anything finds a customer by phone written as 0300 111 or +92 300-1112222, Telegram handle, notes (NayaPay), a payment note (USDT) and a cancellation reason');

  // 3. choices
  await set('sr-cur','USD');assert.deepEqual(await names(),['Bina Shah']);await clear();
  await set('sr-status','cancelled');assert.deepEqual(await names(),['Cara Khan']);await set('sr-status','owes');assert.deepEqual(await names(),['Ali Raza']);await set('sr-status','active');assert.deepEqual(await names(),['Ali Raza','Bina Shah']);await clear();
  check('Pays in USD finds Bina; Status Cancelled finds Cara, Owes money finds Ali, Not cancelled finds Ali and Bina');

  // 4. dates
  await set('sr-join-from','2026-10-01');await set('sr-join-to','2026-10-31');assert.deepEqual(await names(),['Bina Shah']);await clear();
  await set('sr-start-to','2026-09-01');assert.deepEqual(await names(),['Cara Khan']);await clear();
  await set('sr-end-from','2026-09-01');await set('sr-end-to','2026-09-30');assert.deepEqual(await names(),['Cara Khan']);await clear();
  await set('sr-paid-from','2026-10-01');await set('sr-paid-to','2026-10-31');assert.deepEqual(await names(),['Bina Shah']);assert.equal(await page.locator('#sr-paid-th').isVisible(),true);
  assert.match(await page.locator('#sr-body tr').first().innerText(),/\$10/);assert.match(await page.locator('#sr-tot').innerText(),/paid in range Rs 2,800/);await clear();
  check('Joined in October finds Bina; plan started by Sep 1 finds Cara; cancelled in September finds Cara; paid in October finds Bina with $10 shown and Rs 2,800 in the totals');

  // 5. money
  await set('sr-owe','4000');assert.deepEqual(await names(),['Ali Raza']);await clear();
  await set('sr-price-min','4000');await set('sr-price-max','5000');assert.deepEqual(await names(),['Ali Raza']);await set('sr-price-min','2500');await set('sr-price-max','3000');assert.deepEqual(await names(),['Bina Shah','Cara Khan']);await clear();
  check('Owes at least Rs 4,000 finds Ali; price Rs 4,000-5,000 finds Ali; Rs 2,500-3,000 finds Bina ($10 = Rs 2,800) and Cara (Rs 3,000)');

  // 6. fields combine; nothing found says so
  await set('sr-cur','USD');await set('sr-q','ali');assert.equal(await page.locator('#sr-body tr').count(),0);assert.equal(await page.locator('#sr-none').isVisible(),true);await clear();
  check('fields must all match: USD and "ali" finds nobody and says so');

  // 7. CSV of the results
  await set('sr-status','active');const [dl]=await Promise.all([page.waitForEvent('download'),page.locator('#sr-csv').click()]);const csv=fs.readFileSync(await dl.path(),'utf8');fs.writeFileSync(path.join(out,'search.csv'),csv);
  const lines=csv.trim().split('\n');assert.match(lines[0],/^name,email,phone,telegram,sold_through,products,status,owes,owes_pkr,joined,notes$/);assert.equal(lines.length,3);assert.match(csv,/Ali Raza,ali@example\.test,923001112222,aliraza,/);await clear();
  check('Save results as CSV writes the matching customers (2 rows with phone, Telegram, status and what they owe)');

  // 8. tap a customer: the panel closes and the customer opens in the list, even a cancelled one
  await set('sr-q','cara');await page.locator('#sr-body tr').first().click();
  await page.locator('#searchPanel').waitFor({state:'hidden'});await page.locator('tr.detail[data-id="sc"]').waitFor();assert.equal(await page.locator('#statusFilter').inputValue(),'all');
  check('tapping a result closes Search and opens that customer in the list (the Status filter switches to all for a cancelled one)');

  // 9. layout
  for(const [w,h,scheme] of [[390,844,'light'],[390,844,'dark'],[1400,900,'light'],[1400,900,'dark']]){await page.setViewportSize({width:w,height:h});await page.emulateMedia({colorScheme:scheme});
    if(await page.locator('#searchPanel').isHidden())await page.locator('#btn-search').click();await clear();await page.waitForTimeout(200);await page.locator('#searchPanel').screenshot({path:path.join(out,`search-${w}-${scheme}.png`)});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`no sideways scroll at ${w} ${scheme}`);}
  check('Search fits at 390px and 1400px in light and dark with no sideways scroll');
  assert.deepEqual(errors,[]);check('No unexpected console/page errors');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({version:'69',checks},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
