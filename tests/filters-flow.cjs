// v40: Summary and Analytics filter by product (revenue, costs, profit) and by a custom date range. Synthetic local records only.
// Start a disposable server (see AGENTS.md), then: node tests/filters-flow.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const stubWebFonts=require('./webfonts.cjs');

const base=process.env.WASOOLI_TEST_URL||'http://127.0.0.1:8098',H={'X-Requested-With':'wasool','Content-Type':'application/json'},checks=[];
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).protocol,'http:');
const out=path.resolve(process.env.WASOOLI_TEST_OUTPUT||'data/filters-qa');fs.mkdirSync(out,{recursive:true});
const check=n=>{checks.push(n);console.log('PASS '+n);};
const plan=(pkg,price,pays)=>({id:'s1',kind:'monthly',cycle:'monthly',packageId:pkg,currency:'PKR',start:'2026-09-24',prorate:true,prices:[{from:'2026-09-24',price}],payments:pays});
const cost=(date,pkg,amount)=>({date,description:'QA '+pkg+' '+date,category:'Product',packageId:pkg,currency:'PKR',cost:amount,tax:0,rate:null});
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--disable-gpu']});
 try{
  const ctx=await browser.newContext({viewport:{width:1400,height:900}});await stubWebFonts(ctx);await ctx.addInitScript(()=>{if(!localStorage.getItem('pt-today'))localStorage.setItem('pt-today','2026-10-28');});
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(base+'/login',{waitUntil:'domcontentloaded'});await page.locator('[name=passcode]').fill('test1234');await page.locator('button[type=submit]').click();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  const api=async(method,pth,data)=>ctx.request.fetch(base+pth,{method,headers:H,data:data===undefined?undefined:JSON.stringify(data)});
  await api('POST','/api/import',{docs:{
    'users/fa':{name:'Filter C',joinDate:'2026-09-24',subscriptions:[plan('pkg_c',4200,[{id:'p1',date:'2026-09-24',amount:4200,currency:'PKR'},{id:'p2',date:'2026-10-24',amount:4200,currency:'PKR'}])]},
    'users/fb':{name:'Filter Max',joinDate:'2026-10-24',subscriptions:[plan('pkg_cmax',6000,[{id:'p1',date:'2026-10-24',amount:6000,currency:'PKR'}])]},
    'costs/c1':cost('2026-10-05','pkg_c',1000),'costs/c2':cost('2026-10-10','pkg_cmax',2500),'costs/c3':cost('2026-09-10','pkg_c',500)},replace:['users/','costs/']});
  await page.reload();await page.waitForSelector('tr.row[data-id="fa"]');await page.waitForTimeout(2000);
  const tile=async id=>(await page.locator('#'+id).innerText()).trim();
  const tiles=async()=>({col:await tile('t-col'),cost:await tile('t-cost'),net:await tile('t-net'),sub:await tile('t-col-sub')});
  const pick=async v=>{await page.locator('#prod-filter').selectOption(v);await page.waitForTimeout(400);};
  await page.locator('#range').selectOption('month');

  let t=await tiles();assert.equal(t.col,'Rs 10,200');assert.equal(t.cost,'Rs 3,500');assert.equal(t.net,'Rs 6,700');
  check('All products, this month: collected Rs 10,200, costs Rs 3,500, net Rs 6,700');
  await pick('pkg_c');t=await tiles();assert.equal(t.col,'Rs 4,200');assert.equal(t.cost,'Rs 1,000');assert.equal(t.net,'Rs 3,200');assert.match(t.sub,/· C$/);
  check('Filtered to C: revenue Rs 4,200, cost Rs 1,000, profit Rs 3,200, labelled C');
  await pick('pkg_cmax');t=await tiles();assert.equal(t.col,'Rs 6,000');assert.equal(t.cost,'Rs 2,500');assert.equal(t.net,'Rs 3,500');
  check('Filtered to C Max: revenue Rs 6,000, cost Rs 2,500, profit Rs 3,500 (C + C Max = the all-products total)');
  const brk=(await page.locator('#pkgBreak').innerText()).replace(/\s+/g,' ');assert.match(brk,/C 1 Rs 4,200/);
  check('The By product table still lists every product and matches the filtered figures');

  /* custom range */
  await pick('pkg_c');await page.locator('#range').selectOption('custom');await page.locator('#range-custom').waitFor();
  await page.locator('#range-from').fill('2026-09-01');await page.locator('#range-from').dispatchEvent('change');await page.locator('#range-to').fill('2026-09-30');await page.locator('#range-to').dispatchEvent('change');await page.waitForTimeout(400);
  t=await tiles();assert.equal(t.col,'Rs 4,200');assert.equal(t.cost,'Rs 500');assert.equal(t.net,'Rs 3,700');assert.match(t.sub,/Sep 1, 2026 – Sep 30, 2026 · C/);
  check('Custom range 1–30 Sep with C: revenue Rs 4,200, cost Rs 500, profit Rs 3,700, labelled with the dates');
  await page.reload();await page.waitForSelector('tr.row[data-id="fa"]');await page.waitForTimeout(1500);
  assert.equal(await page.locator('#range').inputValue(),'custom');assert.equal(await page.locator('#range-from').inputValue(),'2026-09-01');assert.equal(await page.locator('#prod-filter').inputValue(),'pkg_c');assert.equal(await tile('t-col'),'Rs 4,200');
  check('The custom range and product filter are remembered after a reload');

  /* Analytics follows the product filter; its table total stays all products */
  await page.locator('#btn-analytics').click();await page.locator('#an-body .tile').first().waitFor();
  const an=(await page.locator('#analyticsPanel').innerText()).replace(/\s+/g,' ');
  assert.match(an,/C only · All time/);assert.match(an,/Collected all time Rs 8,400/);assert.match(an,/Costs all time Rs 1,500/);assert.match(an,/Net all time Rs 6,900/);assert.match(an,/Total \(all products\)/);
  check('Analytics filtered to C: collected Rs 8,400, costs Rs 1,500, net Rs 6,900 all time; the package table total is marked all products');
  await page.locator('#an-prod').selectOption('');await page.waitForTimeout(400);
  assert.match((await page.locator('#analyticsPanel').innerText()).replace(/\s+/g,' '),/Collected all time Rs 14,400/);
  check('Choosing All products in Analytics shows everything again (Rs 14,400 collected)');
  await page.locator('#an-close').click();

  await page.locator('#range').selectOption('custom');await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(out,'filters-390.png')});
  check('Product filter and custom dates fit a 390px phone without sideways scroll');
  assert.deepEqual(errors,[]);check('No unexpected console/page errors');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({version:'49',checks},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
