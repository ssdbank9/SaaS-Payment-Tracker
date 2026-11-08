// v66: the Collected and Costs tiles open "by month": one fold per month with its total, the entries inside, totals equal to the tiles
// for the same range and product. Synthetic records on a disposable server only:
//   WASOOLI_TEST_URL=http://127.0.0.1:<port> node tests/tile-months-flow.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const stubWebFonts=require('./webfonts.cjs');

const base=process.env.WASOOLI_TEST_URL||'http://127.0.0.1:8098',H={'X-Requested-With':'wasool','Content-Type':'application/json'},checks=[];
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).protocol,'http:');
const out=path.resolve(process.env.WASOOLI_TEST_OUTPUT||'data/tile-months-qa');fs.mkdirSync(out,{recursive:true});
const check=n=>{checks.push(n);console.log('PASS '+n);};
const pay=(id,date,amount,note,cur)=>({id,date,amount,currency:cur||'PKR',rate:null,note:note||''});
const norm=s=>s.replace(/\s+/g,' ').trim();
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--disable-gpu']});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await stubWebFonts(ctx);await ctx.addInitScript(()=>{if(!localStorage.getItem('pt-today'))localStorage.setItem('pt-today','2026-10-20');localStorage.setItem('pt-sum-open','1');});
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(base+'/login',{waitUntil:'domcontentloaded'});await page.locator('[name=passcode]').fill('test1234');await page.locator('button[type=submit]').click();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  const api=async(method,pth,data)=>{const r=await ctx.request.fetch(base+pth,{method,headers:H,data:data===undefined?undefined:JSON.stringify(data)});let j=null;try{j=await r.json();}catch(e){}return {status:r.status(),j};};
  const until=async(fn,what)=>{for(let i=0;i<60;i++){if(await fn())return;await page.waitForTimeout(250);}throw new Error('timed out waiting for '+what);};
  // known records: two customers, payments in Aug/Sep/Oct, one refund, a dollar receipt, two costs (one USD at rate 280) and a seat cost on one plan
  for(const d of (((await api('GET','/api/docs?prefix=users/')).j||{}).docs||[]))await api('DELETE','/api/docs/'+d.path);
  for(const d of (((await api('GET','/api/docs?prefix=costs/')).j||{}).docs||[]))await api('DELETE','/api/docs/'+d.path);
  await api('POST','/api/import',{docs:{
   'users/ma':{name:'Month Person',email:'ma@example.test',joinDate:'2026-08-24',subscriptions:[{id:'s1',kind:'monthly',cycle:'monthly',name:'',packageId:'pkg_c',currency:'PKR',start:'2026-08-24',prorate:true,prices:[{from:'2026-08-24',price:4200}],
     payments:[pay('p1','2026-08-24',4200,'first'),pay('p2','2026-09-24',4200,''),pay('p3','2026-10-05',10,'dollars','USD')],refunds:[{id:'r1',date:'2026-10-10',amount:1000,currency:'PKR',rate:null,note:'left early'}],
     accountCost:{frequency:'monthly',first:'full',entries:[{from:'2026-09-24',amount:8,currency:'USD',rate:null,paidIn:'USD',supplier:''}],overrides:{}}}]},
   'users/mb':{name:'Gpt Person',joinDate:'2026-09-01',subscriptions:[{id:'s1',kind:'monthly',cycle:'monthly',name:'',packageId:'pkg_g',currency:'PKR',start:'2026-09-01',prorate:true,prices:[{from:'2026-09-01',price:5000}],payments:[pay('q1','2026-09-01',5000,'')]}]},
   'costs/c1':{date:'2026-10-02',description:'Shared tool',category:'Tools',packageId:'',currency:'USD',cost:20,tax:0,rate:280,receipt:'',source:'manual'},
   'costs/c2':{date:'2026-09-05',description:'Domain',category:'Hosting',packageId:'',currency:'PKR',cost:500,tax:0,rate:null,receipt:'',source:'manual'},
  },replace:[]});
  await page.reload();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  assert.equal(await page.locator('#app-ver').textContent(),'v68');
  await page.locator('#range').selectOption('all');await until(async()=>/16,200/.test(await page.locator('#t-col').textContent()),'Summary all time');

  // 1. the Collected tile opens the month list; the total line equals the tile; months newest first with payments and refunds
  await page.locator('#tile-col').click();await page.locator('#monthPanel').waitFor({state:'visible'});
  assert.equal(await page.locator('#mo-title').textContent(),'Collected by month');
  const colTile=norm(await page.locator('#t-col').textContent());const tot=norm(await page.locator('#mo-tot').textContent());
  assert.ok(tot.includes('Collected '+colTile),tot+' vs '+colTile);assert.match(tot,/\(4 payments\)/);assert.match(tot,/Refunds −Rs 1,000 \(1\)/);
  const months=async()=>page.locator('#mo-list details.mo-month').evaluateAll(ds=>ds.map(d=>({m:d.dataset.month,open:d.open,head:d.querySelector('summary').textContent.replace(/\s+/g,' ').trim(),rows:d.querySelectorAll('tbody tr').length})));
  let ms=await months();
  assert.deepEqual(ms.map(x=>x.m),['2026-10','2026-09','2026-08']);
  assert.match(ms[0].head,/Oct 2026/);assert.match(ms[0].head,/1 payment · 1 refund/);assert.match(ms[0].head,/Rs 2,800/);assert.match(ms[0].head,/−Rs 1,000/);
  assert.match(ms[1].head,/Sep 2026 2 payments Rs 9,200/);assert.match(ms[2].head,/Aug 2026 1 payment Rs 4,200/);
  assert.deepEqual(ms.map(x=>x.open),[false,false,false]);
  check('Collected tile opens "Collected by month": total Rs 16,200 (4 payments) and Rs 1,000 refunds equal the tile; Oct Rs 2,800 −Rs 1,000, Sep Rs 9,200, Aug Rs 4,200, newest first, folded');

  // 2. tapping a month unfolds its entries; a refund row is marked; the fold survives a redraw; tapping an entry opens the customer
  await page.locator('#mo-list details[data-month="2026-10"] summary').click();
  ms=await months();assert.equal(ms[0].open,true);assert.equal(ms[0].rows,2);
  const oct=page.locator('#mo-list details[data-month="2026-10"] tbody tr');const cells=async n=>norm((await oct.nth(n).evaluate(tr=>[...tr.children].map(c=>c.textContent.trim()).join(' '))));
  assert.match(await cells(0),/2026-10-10 Month Person C −Rs 1,000 Refund\s*left early/);
  assert.match(await cells(1),/2026-10-05 Month Person C \$10 dollars/);
  await page.locator('#range').selectOption('all');await page.waitForTimeout(400);ms=await months();assert.equal(ms[0].open,true,'the unfolded month stays open after a redraw');
  await oct.nth(0).click();await page.locator('tr.detail[data-id=ma]').waitFor();assert.equal(await page.locator('#monthPanel').isHidden(),true);
  check('a month unfolds to its entries (refund marked, dollar receipt with its rate), stays unfolded through a redraw, and an entry opens that customer');

  // 3. the Costs tile: actual entries plus the calculated cycle cost; total equals the Costs tile
  await page.locator('#tile-cost').click();await page.locator('#monthPanel').waitFor({state:'visible'});
  assert.equal(await page.locator('#mo-title').textContent(),'Costs by month');
  const costTile=norm(await page.locator('#t-cost').textContent());const ctot=norm(await page.locator('#mo-tot').textContent());
  assert.ok(ctot.includes('Costs '+costTile),ctot+' vs '+costTile);assert.match(ctot,/\(3 entries\)/);
  ms=await months();assert.deepEqual(ms.map(x=>x.m),['2026-10','2026-09']);
  assert.match(ms[0].head,/Oct 2026 1 entry Rs 5,600/);assert.match(ms[1].head,/Sep 2026 2 entries Rs 2,740/);
  await page.locator('#mo-list details[data-month="2026-09"] summary').click();const sep=await page.locator('#mo-list details[data-month="2026-09"] tbody tr').evaluateAll(trs=>trs.map(tr=>[...tr.children].map(c=>c.textContent.trim()).join(' ').replace(/\s+/g,' ')));
  assert.equal(sep.length,2);assert.match(sep[0],/2026-09-24 Month Person · C · cycle cost C \$8 at 280/);assert.match(sep[1],/2026-09-05 Domain Shared \/ unassigned Rs 500/);
  check('Costs tile opens "Costs by month": total Rs 8,340 (3 entries) equals the tile; Oct Rs 5,600, Sep Rs 2,740 = the Rs 500 domain plus the calculated $8 cycle cost');

  // 4. the product picker narrows both the panel and the Summary; Costs under Chatgpt Plus has nothing
  await page.locator('#mo-prod').selectOption('pkg_g');await page.waitForTimeout(400);
  assert.equal(await page.locator('#prod-filter').inputValue(),'pkg_g');assert.equal(await page.locator('#mo-none').isVisible(),true);
  await page.locator('#mo-kind button[data-kind=col]').click();await page.waitForTimeout(300);
  ms=await months();assert.deepEqual(ms.map(x=>x.m),['2026-09']);assert.match(ms[0].head,/Sep 2026 1 payment Rs 5,000/);
  assert.ok(norm(await page.locator('#mo-tot').textContent()).includes('Collected '+norm(await page.locator('#t-col').textContent())));
  await page.locator('#mo-prod').selectOption('');await page.waitForTimeout(300);
  check('the product picker in the panel is the Summary product filter: Chatgpt Plus shows no costs and one Sep payment, equal to the filtered tile');

  // 5. the range picker in the panel is the Summary range
  await page.locator('#mo-range').selectOption('month');await page.waitForTimeout(400);
  assert.equal(await page.locator('#range').inputValue(),'month');ms=await months();assert.deepEqual(ms.map(x=>x.m),['2026-10']);
  await page.locator('#mo-range').selectOption('all');await page.waitForTimeout(300);
  check('the range picker in the panel is the Summary range (This month shows October only)');

  // 6. layout at 390 and 1400, light and dark, with October unfolded (it may already be open from step 2)
  await page.locator('#mo-list details[data-month="2026-10"]').evaluate(d=>{d.open=true;});
  for(const [w,h,scheme] of [[390,844,'light'],[390,844,'dark'],[1400,900,'light'],[1400,900,'dark']]){await page.setViewportSize({width:w,height:h});await page.emulateMedia({colorScheme:scheme});await page.waitForTimeout(300);
    await page.screenshot({path:path.join(out,`months-${w}-${scheme}.png`),fullPage:false});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`no sideways scroll at ${w} ${scheme}`);}
  await page.locator('#mo-close').click();assert.equal(await page.locator('#monthPanel').isHidden(),true);
  check('the panel fits at 390px and 1400px in light and dark with no sideways scroll, and Close hides it');
  assert.deepEqual(errors,[]);check('No console or page errors');
  fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({version:'68',checks},null,2));console.log('tile-months-flow: '+checks.length+' checks passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
