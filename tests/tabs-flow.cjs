// v78: the tabs layout (Today, Customers, Reminders, Money, More) and the Today screen. Today's month card equals the Summary tiles for
// This month; Owes now lists each due bill of a direct customer and one row per wholesaler; Record opens the payment dialog on the right
// bill (or the wholesaler payment form); Due this week lists the next 7 days only; each tab shows its own blocks; the old layout switch.
// Synthetic records on a disposable server only:
//   WASOOLI_TEST_URL=http://127.0.0.1:<port> node tests/tabs-flow.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const stubWebFonts=require('./webfonts.cjs');

const base=process.env.WASOOLI_TEST_URL||'http://127.0.0.1:8098',H={'X-Requested-With':'wasool','Content-Type':'application/json'},checks=[];
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).protocol,'http:');
const out=path.resolve(process.env.WASOOLI_TEST_OUTPUT||'data/tabs-qa');fs.mkdirSync(out,{recursive:true});
const check=n=>{checks.push(n);console.log('PASS '+n);};
const norm=s=>String(s).replace(/\s+/g,' ').trim();
const plan=(id,cur,price,start,payments)=>({id,kind:'monthly',cycle:'monthly',name:'',packageId:'pkg_cmax',currency:cur,start,anchor:start,ownStart:true,prorate:false,prices:[{from:start,price}],payments:payments||[]});
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--disable-gpu']});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await stubWebFonts(ctx,{ui:'tabs'});await ctx.addInitScript(()=>{if(!localStorage.getItem('pt-today'))localStorage.setItem('pt-today','2026-11-15');});
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(base+'/login',{waitUntil:'domcontentloaded'});await page.locator('[name=passcode]').fill('test1234');await page.locator('button[type=submit]').click();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  const api=async(method,pth,data)=>{const r=await ctx.request.fetch(base+pth,{method,headers:H,data:data===undefined?undefined:JSON.stringify(data)});let j=null;try{j=await r.json();}catch(e){}return {status:r.status(),j};};
  const doc=async p=>((await api('GET','/api/docs/'+p)).j||{}).data;
  const until=async(fn,what)=>{for(let i=0;i<60;i++){if(await fn())return;await page.waitForTimeout(250);}throw new Error('timed out waiting for '+what);};
  await until(async()=>((await doc('meta/schema'))||{}).version>=12,'the settings repair');
  const st=await doc('settings/main');
  await api('PATCH','/api/docs/settings/main',{wsSent:{},packages:st.packages.map(p=>p.id==='pkg_cmax'?{...p,cycleStart:'2026-10-15'}:p),
    wholesalers:[{id:'ws_a',name:'Some Seller',phone:'918200000001',notes:''}]});
  for(const d of (((await api('GET','/api/docs?prefix=users/')).j||{}).docs||[]))await api('DELETE','/api/docs/'+d.path);
  await api('POST','/api/import',{docs:{
   'users/d1':{name:'Dana Direct',phone:'923001234561',joinDate:'2026-10-26',subscriptions:[plan('s1','USD',15,'2026-10-26')]},
   'users/d2':{name:'Sam Soon',phone:'923001234562',joinDate:'2026-10-20',subscriptions:[plan('s1','PKR',4000,'2026-10-20',[{id:'p1',date:'2026-10-20',amount:4000,currency:'PKR',note:''}])]},
   'users/d3':{name:'Nora Nine',phone:'923001234563',joinDate:'2026-10-24',subscriptions:[plan('s1','PKR',4000,'2026-10-24',[{id:'p1',date:'2026-10-24',amount:4000,currency:'PKR',note:''}])]},
   'users/c1':{name:'Carl Cancelled',joinDate:'2026-09-20',cancel:{lastDay:'2026-11-09',reason:'moved',note:'',at:'2026-11-01',ended:['s1']},subscriptions:[{...plan('s1','PKR',3000,'2026-09-20'),end:'2026-11-09'}]},
   'users/w1':{name:'Wally One',wholesalerId:'ws_a',joinDate:'2026-11-01',subscriptions:[{...plan('s1','USD',15,'2026-11-01'),ownStart:false}]},
   'users/w2':{name:'Wendy Two',wholesalerId:'ws_a',joinDate:'2026-11-15',subscriptions:[{...plan('s1','PKR',4000,'2026-11-15'),ownStart:false}]},
   'users/w3':{name:'Will Three',wholesalerId:'ws_a',joinDate:'2026-11-01',subscriptions:[{...plan('s1','USD',15,'2026-11-01',[{id:'p1',date:'2026-11-01',amount:15,currency:'USD',note:''}]),ownStart:false}]},
   'costs/t78a':{date:'2026-11-03',description:'Tabs test seats',category:'Tools',packageId:'pkg_cmax',currency:'PKR',cost:2500,tax:0,rate:null,receipt:'',source:'manual'},
  },replace:[]});
  await page.reload();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  assert.equal(await page.locator('#app-ver').textContent(),'v78');
  const tab=()=>page.evaluate(()=>document.body.dataset.tab);
  const go=async t=>{await page.locator(`#tabBar [data-go=${t}]`).click();await page.waitForTimeout(250);};
  const shown=sel=>page.locator(sel).first().isVisible();
  const noSideScroll=()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);

  // 1. lands on Today, compact header with the version badge
  assert.equal(await page.evaluate(()=>document.body.dataset.ui),'tabs');assert.equal(await tab(),'today');
  assert.equal(await shown('#todayPanel'),true);assert.equal(await shown('#app-ver'),true);assert.equal(await shown('#btn-settings'),false);
  assert.equal(await page.locator('#tabBar [data-go=today]').getAttribute('aria-current'),'page');
  assert.match(await page.locator('#td-date').textContent(),/^Sunday, 15 November 2026$/);
  await page.screenshot({path:path.join(out,'today-390-light.png'),fullPage:true});
  check('Opens on Today (tabs layout): heading with "Sunday, 15 November 2026", the version badge shown, the classic header buttons hidden');

  // 2. Owes now: Dana's bill, one row for the wholesaler (2 of 3 customers), the cancelled customer left out
  const owe=await page.locator('#td-owe .td-row').evaluateAll(es=>es.map(e=>e.innerText.replace(/\s+/g,' ').trim()));
  assert.equal(owe.length,2,owe.join(' | '));
  assert.match(owe[0],/^Dana Direct .*26 Oct . 25 Nov 2026 Overdue since Oct 26 \$15 Record/,owe.join(' | '));
  assert.match(owe[1],/^Some Seller Wholesaler · 2 of 3 customers Overdue since Nov 1 Rs 4,000 \+ \$15 Record/,owe.join(' | '));
  assert.ok(!owe.some(r=>/Carl|Wally|Wendy/.test(r)));
  assert.equal(norm(await page.locator('#td-owe-n').textContent()),'2');assert.equal(norm(await page.locator('#td-owe-tot').textContent()),'Rs 4,000 + $30');
  check('Owes now: Dana Direct 26 Oct - 25 Nov overdue since Oct 26 $15, and one row "Some Seller · Wholesaler · 2 of 3 customers" Rs 4,000 + $15; total Rs 4,000 + $30; a cancelled customer is left out');

  // 3. Due this week: Sam's bill on Fri Nov 20 (5 days), not Nora's on Nov 24 (9 days)
  const soon=await page.locator('#td-soon .td-row').evaluateAll(es=>es.map(e=>e.innerText.replace(/\s+/g,' ').trim()));
  assert.equal(soon.length,1,soon.join(' | '));assert.match(soon[0],/^Sam Soon .*Fri Nov 20 Rs 4,000$/,soon.join(' | '));
  check('Due this week lists Sam Soon on Fri Nov 20 (Rs 4,000, 5 days away) and not Nora Nine on Nov 24 (9 days away)');

  // 4. the month card equals the Summary tiles for This month, All products
  const card=[];for(const id of ['td-col','td-cost','td-net'])card.push(norm(await page.locator('#'+id).textContent()));
  assert.ok(card[1]!=='Rs 0',card.join(' | '));
  await page.locator('#td-month').click();await page.waitForTimeout(300);assert.equal(await tab(),'money');
  assert.equal(await page.locator('#range').inputValue(),'month');assert.equal(await page.locator('#prod-filter').inputValue(),'');
  const tiles=[];for(const id of ['t-col','t-cost','t-net'])tiles.push(norm(await page.locator('#'+id).textContent()));
  assert.deepEqual(card,tiles);
  assert.equal(await shown('#summaryBlock'),true,'the Summary is open on the Money tab of a phone');
  check(`Today's month card (${card.join(' / ')}) equals the Summary tiles Collected / Costs / Net for This month; tapping it opens Money with the Summary shown`);

  // 5. each tab shows its own blocks and hides the others
  const panes={today:'#todayPanel',customers:'#tableWrap',reminders:'#remindRun',money:'#summaryBlock',more:'#morePanel'};
  for(const t of Object.keys(panes)){await go(t);assert.equal(await tab(),t);assert.equal(await page.locator(`#tabBar [data-go=${t}]`).getAttribute('aria-current'),'page');
    for(const [o,sel] of Object.entries(panes))assert.equal(await shown(sel),o===t,`${sel} on the ${t} tab`);
    assert.equal(await noSideScroll(),true,`no sideways scroll on ${t}`);
    if(t!=='today')await page.screenshot({path:path.join(out,`${t}-390-light.png`),fullPage:true});}
  await go('customers');assert.equal(await shown('.toolbar'),true);assert.equal(await shown('#payStrip'),true);
  await go('money');assert.equal(await shown('#costsSec'),true);assert.equal(await shown('#moneyBar'),true);
  check('Each tab shows its own blocks (Today, the customer list, the Queue, the Summary and costs, More) and hides the others; aria-current follows; no sideways scroll');

  // 6. the Reminders tab badge equals the Queue count
  const qc=await page.evaluate(()=>{const c=document.querySelector('#rem-cnt'),b=document.querySelector('#tab-rem-cnt');return {c:c.hidden?'':c.textContent,b:b.hidden?'':b.textContent};});
  assert.equal(qc.b,qc.c);assert.ok(qc.c!=='','the queue has messages');
  await go('today');assert.equal(norm(await page.locator('#td-rem').textContent()),`${qc.c} reminder${qc.c==='1'?'':'s'} to send`);
  await page.locator('#td-rem').click();await page.waitForTimeout(300);assert.equal(await tab(),'reminders');assert.equal(await shown('#rr-body'),true);
  check(`The Reminders tab badge (${qc.b}) equals the Queue count; Today's "${qc.c} reminders to send" row opens the Reminders tab`);

  // 7. Money: Payments and Analytics buttons open their panels on the Money tab
  await go('money');await page.locator('#mb-pay').click();await page.waitForTimeout(300);assert.equal(await shown('#payPanel'),true);assert.equal(await tab(),'money');
  await page.locator('#mb-an').click();await page.waitForTimeout(300);assert.equal(await shown('#analyticsPanel'),true);assert.equal(await tab(),'money');
  await page.locator('#tile-cost').click();await page.waitForTimeout(300);assert.equal(await shown('#monthPanel'),true);assert.equal(await tab(),'money');
  check('Money tab: Payments, Analytics and the Costs tile (by month) open on the Money tab');

  // 8. Record on Today opens the payment dialog on Dana's bill; saving removes the row
  await go('today');await page.locator('#td-owe .td-row[data-id=d1] [data-td-pay]').click();
  const pd=page.locator('#paymentDialog');await pd.waitFor();
  assert.equal(norm(await page.locator('#payment-who').textContent()),'Dana Direct');assert.equal(await page.locator('#payment-account').inputValue(),'s1');
  assert.match(await page.locator('#payment-month option:checked').textContent(),/26 Oct . 25 Nov 2026/);assert.equal(Number(await page.locator('#payment-amount').inputValue()),15);
  await page.locator('#payment-save').click();await until(async()=>!(await pd.isVisible()),'payment dialog closed');
  await until(async()=>(await page.locator('#td-owe .td-row[data-id=d1]').count())===0,'Dana leaves Owes now');
  const d1=await doc('users/d1');assert.equal(d1.subscriptions[0].payments.length,1);assert.equal(d1.subscriptions[0].payments[0].amount,15);
  assert.equal(norm(await page.locator('#td-owe-tot').textContent()),'Rs 4,000 + $15');
  check('Record on Dana\'s row opens Record payment for her plan and the 26 Oct - 25 Nov bill with $15; saving stores one $15 payment and the row leaves Owes now');

  // 9. the wholesaler row opens the wholesaler payment form
  await page.locator('#td-owe .td-row[data-ws=ws_a] button').click();const wd=page.locator('#wsPayDialog');await wd.waitFor();
  assert.equal(norm(await page.locator('#wspay-who').textContent()),'Some Seller');await page.locator('#wspay-close').click();await until(async()=>!(await wd.isVisible()),'wholesaler form closed');
  check('Record on the wholesaler row opens the wholesaler payment form for Some Seller');

  // 10. tapping a customer on Today opens that customer on Customers; Search (More) does too
  await page.locator('#td-soon [data-td-open=d2]').click();await page.waitForTimeout(500);
  assert.equal(await tab(),'customers');assert.equal(await page.locator('tr.detail[data-id=d2]').count(),1);
  await go('more');await page.locator('[data-more=search]').click();await page.waitForTimeout(300);assert.equal(await tab(),'more');assert.equal(await shown('#searchPanel'),true);
  await page.locator('#sr-q').fill('Nora');await page.waitForTimeout(300);await page.locator('#sr-body tr[data-user=d3]').click();await page.waitForTimeout(500);
  assert.equal(await tab(),'customers');assert.equal(await page.locator('tr.detail[data-id=d3]').count(),1);
  check('Tapping Sam Soon under Due this week opens Customers with Sam expanded; a Search result (More) opens that customer on Customers');

  // 11. More: Settings opens; the old layout and back
  await go('more');await page.locator('[data-more=settings]').click();await page.waitForTimeout(300);assert.equal(await shown('#settingsPanel'),true);assert.equal(await tab(),'more');
  await page.locator('#more-classic').click();await page.waitForLoadState('domcontentloaded');await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(1500);
  assert.equal(await page.evaluate(()=>document.body.dataset.ui),'classic');assert.equal(await shown('#tabBar'),false);assert.equal(await shown('#btn-settings'),true);assert.equal(await shown('#tableWrap'),true);assert.equal(await shown('#todayPanel'),false);
  await page.screenshot({path:path.join(out,'classic-390-light.png')});
  /* the layout choice has its own storage key: saving a list preference (which rewrites pt-ui) must not flip the layout, and the preference must survive */
  const sortV=await page.locator('#sort option').nth(1).getAttribute('value');await page.locator('#sort').selectOption(sortV);await page.waitForTimeout(300);
  await page.reload();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(1500);
  assert.equal(await page.evaluate(()=>document.body.dataset.ui),'classic','still classic after a preference was saved');assert.equal(await page.locator('#sort').inputValue(),sortV);
  await page.locator('#tryTabs').click();await page.waitForLoadState('domcontentloaded');await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(1500);
  assert.equal(await page.evaluate(()=>document.body.dataset.ui),'tabs');assert.equal(await tab(),'today');assert.equal(await shown('#tryTabs'),false);assert.equal(await page.evaluate(()=>document.querySelector('#sort').value),sortV,'the sort preference survived both switches');
  check('More: Settings opens on the More tab; "Use the old layout" shows the one long page (no tab bar) and stays after a preference is saved; "Try the new layout" returns to the tabs on Today with the preference kept');

  // 12. layout: 390 dark, 1400 light and dark; no sideways scroll; the side bar on a computer
  await page.emulateMedia({colorScheme:'dark'});await page.waitForTimeout(300);await page.screenshot({path:path.join(out,'today-390-dark.png'),fullPage:true});assert.equal(await noSideScroll(),true);
  for(const t of ['customers','money'])await go(t),assert.equal(await noSideScroll(),true,`390 dark ${t}`);
  for(const scheme of ['light','dark']){await page.setViewportSize({width:1400,height:900});await page.emulateMedia({colorScheme:scheme});await go('today');
    const nav=await page.locator('#tabBar').boundingBox();assert.ok(nav.x===0&&nav.width>=200&&nav.width<=240&&nav.height>=880,JSON.stringify(nav));
    const tp=await page.locator('#todayPanel').boundingBox();assert.ok(tp.x>=nav.width,'content to the right of the side bar');
    await page.screenshot({path:path.join(out,`today-1400-${scheme}.png`)});assert.equal(await noSideScroll(),true,`1400 ${scheme} today`);
    await go('customers');await page.screenshot({path:path.join(out,`customers-1400-${scheme}.png`)});assert.equal(await noSideScroll(),true,`1400 ${scheme} customers`);
    for(const t of ['reminders','money','more']){await go(t);assert.equal(await noSideScroll(),true,`1400 ${scheme} ${t}`);}}
  check('A computer shows the side bar (220px, full height) with the content to its right; no sideways scroll at 390px and 1400px in light and dark');
  assert.deepEqual(errors,[]);check('No console or page errors');
  fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({version:'78',checks},null,2));console.log('tabs-flow: '+checks.length+' checks passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
