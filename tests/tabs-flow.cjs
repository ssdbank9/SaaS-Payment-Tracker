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
  // v78: the usual address keeps the page as it was; the new design is a separate file at /new, behind the same sign-in
  assert.equal(new URL(page.url()).pathname,'/');assert.equal(await page.locator('#tabBar').count(),0);assert.equal(await page.locator('#app-ver').textContent(),'v81');
  check('the usual address still serves the page without tabs');
  {const anon=await browser.newContext();const r=await anon.request.get(base+'/new',{maxRedirects:0});assert.equal(r.status(),302);assert.match(r.headers().location||'',/\/login\?next=\/new$/);await anon.close();}
  check('/new asks for sign-in first');
  await page.goto(base+'/new',{waitUntil:'domcontentloaded'});await page.waitForSelector('#tabBar',{timeout:30000});await page.waitForTimeout(1500);
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
  assert.equal(await page.locator('#app-ver').textContent(),'v81');assert.equal(new URL(page.url()).pathname,'/new');
  assert.deepEqual(await page.locator('#more-oldsite').evaluate(e=>[e.hidden,e.getAttribute('href')]),[false,'/']);check('More links back to the usual address');
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

  // 3b. v79: on a phone an amount never breaks inside itself, and the month card is one row per figure
  const amt=await page.locator('#todayPanel .td-amt').evaluateAll(es=>es.map(e=>{const cs=getComputedStyle(e),lh=parseFloat(cs.lineHeight)||parseFloat(cs.fontSize)*1.5,lines=e.querySelectorAll('br').length+1;return {ws:cs.whiteSpace,ok:e.getBoundingClientRect().height<lh*(lines+0.6)};}));
  assert.ok(amt.length>=3&&amt.every(a=>a.ws==='nowrap'&&a.ok),JSON.stringify(amt));
  assert.equal(await page.locator('#td-owe .td-row[data-ws=ws_a] .td-amt br').count(),1,'the wholesaler total is one currency per line');
  const mv=await page.locator('#td-month .td-m').evaluateAll(es=>es.map(e=>{const v=e.querySelector('.v'),cs=getComputedStyle(v);return {top:Math.round(e.getBoundingClientRect().top),ws:cs.whiteSpace,h:v.getBoundingClientRect().height,lh:parseFloat(cs.lineHeight)||parseFloat(cs.fontSize)*1.5};}));
  assert.ok(mv.length===3&&mv[0].top<mv[1].top&&mv[1].top<mv[2].top&&mv.every(m=>m.ws==='nowrap'&&m.h<m.lh*1.6),JSON.stringify(mv));
  check('At 390px each amount on Today stays on one line (a total in two currencies is one currency per line) and the month card is three rows: Collected, Costs, Net');

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
  // v79: the wholesaler heading wraps, so its Record payment is on screen; the strip's Due this week is the customers Today lists
  const gb=await page.locator('tr.grp[data-ws=ws_a] [data-act=wspay]').boundingBox();assert.ok(gb&&gb.x>=0&&gb.x+gb.width<=390,'the wholesaler heading button is on screen: '+JSON.stringify(gb));
  assert.equal(norm(await page.locator('#payStrip [data-pf=soon] .ps-l').textContent()),'Due this week');assert.equal(norm(await page.locator('#payStrip [data-pf=soon] b').textContent()),'1');
  await page.locator('#payStrip [data-pf=soon]').click();await page.waitForTimeout(300);
  {const names=norm(await page.locator('#tbody').innerText());assert.ok(/Sam Soon/.test(names)&&!/Nora Nine|Dana Direct|Wally One/.test(names),names.slice(0,300));}
  await page.locator('#payStrip [data-pf=""]').click();await page.waitForTimeout(300);assert.ok(/Nora Nine/.test(await page.locator('#tbody').innerText()));
  check('Customers at 390px: the wholesaler heading keeps Record payment on screen; the strip says Due this week 1 and lists Sam Soon only, as Today does');
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

  // 10b. v80 phase 2: the Customers list (tabs layout, 390px)
  await go('customers');
  if(await page.locator('tr.row[aria-expanded=true]').count()){await page.locator('tr.row[aria-expanded=true] .nm').click();await page.waitForTimeout(300);}
  assert.equal(await page.locator('tr.detail').count(),0);
  const rowNames=async()=>page.locator('#tbody tr.row .nm').evaluateAll(es=>es.map(e=>e.textContent.trim()));
  const fbtn=()=>page.locator('#btn-fsheet').textContent().then(norm);
  const vis=(sel)=>`[...document.querySelectorAll(${JSON.stringify(sel)})].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;})`;
  // P2-1 header: title and one Add; Add opens the Add form, which links to Add several (Quick add)
  assert.equal(norm(await page.locator('#cu-title').textContent()),'Customers');assert.equal(await shown('#cu-add'),true);
  assert.equal(await shown('#btn-add'),false);assert.equal(await shown('#btn-quick'),false);assert.equal(await shown('#btn-io'),false);
  await page.locator('#cu-add').click();await page.waitForTimeout(300);assert.equal(await shown('#addPanel'),true);assert.equal(await shown('#add-several'),true);
  await page.locator('#add-several').click();await page.waitForTimeout(300);assert.equal(await shown('#quickPanel'),true);assert.equal(await shown('#addPanel'),false);assert.equal(await tab(),'customers');
  await page.locator('#quick-close').click();await page.waitForTimeout(200);assert.equal(await shown('#quickPanel'),false);
  check('Customers header: the title "Customers" and one Add button (Add user, Quick add and Import / export are not on the toolbar); Add opens the Add form, whose "Add several at once" opens Quick add');
  // P2-2 controls above the first customer, counted on screen
  await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(200);
  const above=await page.evaluate(()=>{const first=document.querySelector('#tbody tr.row');const top=first.getBoundingClientRect().top;
    return [...document.querySelectorAll('.wrap button,.wrap input,.wrap select,.wrap a[href],.wrap textarea')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom<=top+1&&getComputedStyle(e).visibility!=='hidden';}).map(e=>e.id||e.dataset.pf!==undefined&&('chip:'+(e.dataset.pf||'all'))||e.className);});
  assert.deepEqual(above,['cu-add','search','btn-fsheet','chip:all','chip:owes','chip:soon','chip:paid','grp-fold'],JSON.stringify(above));
  const sb=await page.locator('#search').boundingBox(),fb=await page.locator('#btn-fsheet').boundingBox();assert.ok(Math.abs(sb.y-fb.y)<4&&fb.x+fb.width<=390,'search and Filter on one line');
  const chipBox=await page.locator('#payStrip .ps-btn').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {y:Math.round(r.top),r:r.right,h:r.height};}));
  assert.ok(chipBox.length===4&&chipBox.every(c=>c.y===chipBox[0].y&&c.r<=390&&c.h>=44),JSON.stringify(chipBox));
  check(`At 390px there are ${above.length} controls above the first customer: Add, search, Filter, the four chips and the Direct group heading; search and Filter share a line, the four chips share a line, each chip 44px tall`);
  // P2-3 rows: no buttons on a closed row, at least 56px, name and products left, status and amount right
  const closed=await page.evaluate(`${vis('#tbody tr.row')}.map(r=>({id:r.dataset.id,h:r.getBoundingClientRect().height,ctl:[...r.querySelectorAll('button,a[href],input,select')].filter(e=>{const b=e.getBoundingClientRect();return b.width>0&&b.height>0;}).length,em:[...r.querySelectorAll('.em,.ws-tag')].some(e=>e.getBoundingClientRect().height>0)}))`);
  assert.ok(closed.length>=6&&closed.every(r=>r.ctl===0&&r.h>=56&&!r.em),JSON.stringify(closed));
  const wally=norm(await page.locator('#tbody tr.row[data-id=w1] td.who').innerText());
  assert.match(wally,/^Wally One \S.* Overdue since Nov 1 \$15$/,wally);
  const ow=await page.locator('#tbody tr.row[data-id=w1] .cu-owe').evaluate(e=>({c:getComputedStyle(e).color,ws:getComputedStyle(e.firstElementChild).whiteSpace,h:e.getBoundingClientRect().height}));assert.equal(ow.ws,'nowrap');assert.ok(ow.h<30,JSON.stringify(ow));
  check(`A closed row has no buttons, is at least 56px tall and hides the email and "via" lines; Wally One reads "${wally}" with the amount on one line`);
  // P2-3b v81: a long products line wraps inside its cell (the chevron stays on the row), and the chips fit a 375px phone with two-digit counts
  {const r=await page.evaluate(()=>{const row=document.querySelector('#tbody tr.row'),who=row.querySelector('td.who'),p=row.querySelector('.cu-prod'),old=p.textContent;p.textContent='Claude Pro \u00d72 \u00b7 Chatgpt Plus \u00b7 Cursor Pro \u00b7 Another Product';
     const kids=[...row.children].filter(c=>getComputedStyle(c).display!=='none'),a=kids[0].getBoundingClientRect(),b=kids[kids.length-1].getBoundingClientRect(),e=row.querySelector('.cu-end').getBoundingClientRect();
     const o={basis:getComputedStyle(who).flexBasis,sameLine:b.top<a.bottom&&b.left>=a.right-1,chevRight:b.right,endRight:e.right,w:innerWidth};p.textContent=old;return o;});
   assert.ok(r.basis==='0px'&&r.sameLine&&r.chevRight<=r.w&&r.endRight<=r.chevRight,JSON.stringify(r));}
  await page.setViewportSize({width:375,height:812});await page.waitForTimeout(200);
  {const s=await page.evaluate(()=>{const el=document.querySelector('#payStrip'),bs=[...el.querySelectorAll('b')],old=bs.map(b=>b.textContent);['17','2','4','11'].forEach((v,i)=>{bs[i].textContent=v;});const o={sw:el.scrollWidth,cw:el.clientWidth};bs.forEach((b,i)=>{b.textContent=old[i];});return o;});
   assert.ok(s.sw<=s.cw,'the chips fit at 375px: '+JSON.stringify(s));}
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200);
  check('A products line too long for one line wraps inside its cell with the chevron still on the row; the four chips fit a 375px phone with counts 17, 2, 4 and 11');
  // P2-4 chips: All / Owes / Due this week / Paid up with counts; each lists exactly its count
  const chips=await page.locator('#payStrip .ps-btn').evaluateAll(es=>es.map(e=>({pf:e.dataset.pf,l:e.querySelector('.ps-l').textContent,n:Number(e.querySelector('b').textContent),p:e.getAttribute('aria-pressed')})));
  assert.deepEqual(chips.map(c=>c.l),['All','Owes','Due this week','Paid up']);assert.equal(chips[0].p,'true');assert.equal(chips[0].n,(await rowNames()).length);
  assert.equal(await shown('#payStrip .ps-all'),false);assert.equal(await shown('#oweList'),false);
  for(const c of chips){await page.locator(`#payStrip [data-pf="${c.pf}"]`).click();await page.waitForTimeout(250);
    assert.equal((await rowNames()).length,c.n,c.l);assert.equal(await page.locator(`#payStrip [data-pf="${c.pf}"]`).getAttribute('aria-pressed'),'true');}
  await page.locator('#payStrip [data-pf=owes]').click();await page.waitForTimeout(250);assert.ok((await rowNames()).includes('Wally One'));assert.equal(await shown('#oweList'),false,'no owe table in the tabs layout');
  await page.locator('#payStrip [data-pf=""]').click();await page.waitForTimeout(250);
  check(`Chips ${chips.map(c=>c.l+' '+c.n).join(', ')}: each lists exactly that many customers, the chosen one is pressed; no "Show everyone" link and no owe table`);
  // P2-5 Filter sheet: opens, closes by Close, Escape and the backdrop, focus back on Filter
  const sheet=page.locator('#filterSheet');const isOpen=()=>sheet.evaluate(d=>d.open);
  assert.equal(await fbtn(),'Filter');
  await page.locator('#btn-fsheet').click();await page.waitForTimeout(250);assert.equal(await isOpen(),true);
  for(const id of ['pkgFilter','wsFilter','statusFilter','sort','btn-group','btn-filter','fs-adv','fs-clear'])assert.equal(await page.locator('#filterSheet #'+id).isVisible(),true,id+' in the sheet');
  const sbox=await sheet.boundingBox();assert.ok(sbox.y+sbox.height>=843&&sbox.x===0&&sbox.width===390,'a bottom sheet: '+JSON.stringify(sbox));
  await page.screenshot({path:path.join(out,'filter-390-light.png')});
  await page.keyboard.press('Escape');await page.waitForTimeout(250);assert.equal(await isOpen(),false);assert.equal(await page.evaluate(()=>document.activeElement&&document.activeElement.id),'btn-fsheet');
  await page.locator('#btn-fsheet').click();await page.waitForTimeout(200);await page.locator('#fs-close').click();await page.waitForTimeout(250);assert.equal(await isOpen(),false);
  await page.locator('#btn-fsheet').click();await page.waitForTimeout(200);await page.mouse.click(195,40);await page.waitForTimeout(250);assert.equal(await isOpen(),false,'a tap on the backdrop closes the sheet');
  check('Filter opens a bottom sheet holding Package, Sold by, Status, Sort, Group by wholesaler, Hasn\'t paid, Advanced search and Clear filters; Escape, Close and a tap on the backdrop close it, and focus returns to Filter');
  // P2-6 filters apply at once and are counted; Clear filters resets them, not the sort
  await page.locator('#btn-fsheet').click();await page.waitForTimeout(200);
  await page.locator('#wsFilter').selectOption('ws_a');await page.waitForTimeout(250);
  assert.deepEqual((await rowNames()).sort(),['Wally One','Wendy Two','Will Three']);assert.equal(await fbtn(),'Filter · 1');
  await page.locator('#statusFilter').selectOption('all');await page.waitForTimeout(200);await page.locator('#btn-filter').click();await page.waitForTimeout(250);
  assert.equal(await fbtn(),'Filter · 3');assert.match(norm(await page.locator('#fs-done').textContent()),/^Show \d+ customers?$/);
  const sortBefore=await page.locator('#sort').inputValue();
  await page.locator('#fs-clear').click();await page.waitForTimeout(250);
  assert.equal(await fbtn(),'Filter');assert.equal(await page.locator('#statusFilter').inputValue(),'active');assert.equal(await page.locator('#wsFilter').inputValue(),'');assert.equal(await page.locator('#btn-filter').getAttribute('aria-pressed'),'false');assert.equal(await page.locator('#sort').inputValue(),sortBefore);
  assert.ok(!(await rowNames()).includes('Carl Cancelled'));assert.equal((await rowNames()).length,chips[0].n);
  await page.locator('#fs-done').click();await page.waitForTimeout(200);assert.equal(await isOpen(),false);
  check('In the sheet, Sold by Some Seller lists its 3 customers at once and Filter reads "Filter · 1"; with Status all and Hasn\'t paid it reads "Filter · 3"; Clear filters returns to Filter with Status active and the sort kept');
  // P2-7 Advanced search opens the Search panel
  await page.locator('#btn-fsheet').click();await page.waitForTimeout(200);await page.locator('#fs-adv').click();await page.waitForTimeout(400);
  assert.equal(await isOpen(),false);assert.equal(await shown('#searchPanel'),true);assert.equal(await tab(),'more');
  await go('customers');check('Advanced search in the sheet opens the Search panel (as More: Search does)');
  // P2-8 a wholesaler group folds, stays folded after a reload, and a search or a chip shows its matches anyway
  const ws=['Wally One','Wendy Two','Will Three'];const anyWs=async()=>(await rowNames()).filter(n=>ws.includes(n));
  await page.locator('tr.grp[data-ws=ws_a] .grp-fold').click();await page.waitForTimeout(300);
  assert.deepEqual(await anyWs(),[]);assert.equal(await page.locator('tr.grp[data-ws=ws_a] .grp-fold').getAttribute('aria-expanded'),'false');assert.equal(await shown('tr.grp[data-ws=ws_a] [data-act=wspay]'),true);
  {const g=norm(await page.locator('tr.grp[data-ws=ws_a]').innerText());assert.match(g,/^Some Seller · 3 customers · owes Rs 4,000 \+ \$15 Record payment$/,g);}
  await page.reload();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2000);await go('customers');
  assert.deepEqual(await anyWs(),[],'still folded after a reload');
  await page.locator('#search').fill('Wally');await page.waitForTimeout(300);assert.deepEqual(await rowNames(),['Wally One']);
  await page.locator('#search').fill('');await page.waitForTimeout(300);assert.deepEqual(await anyWs(),[]);
  await page.locator('#payStrip [data-pf=owes]').click();await page.waitForTimeout(300);assert.ok((await anyWs()).includes('Wally One'));
  await page.locator('#payStrip [data-pf=""]').click();await page.waitForTimeout(300);assert.deepEqual(await anyWs(),[]);
  await page.locator('tr.grp[data-ws=direct] td').click({position:{x:60,y:20}});await page.waitForTimeout(300);assert.ok(!(await rowNames()).includes('Sam Soon'),'the Direct group folds too');
  await page.locator('tr.grp[data-ws=direct] .grp-fold').click();await page.waitForTimeout(300);await page.locator('tr.grp[data-ws=ws_a] .grp-fold').click();await page.waitForTimeout(300);
  assert.equal((await anyWs()).length,3);
  check('Tapping the Some Seller heading folds its 3 customers (heading keeps "3 customers · owes Rs 4,000 + $15" and Record payment); it stays folded after a reload; a search for Wally and the Owes chip show Wally anyway; the Direct group folds too');
  // P2-9 nothing matches: one line and Clear filters
  await page.locator('#search').fill('zzzz');await page.waitForTimeout(300);
  assert.equal(norm(await page.locator('#nores').innerText()),'No customers match. Clear filters');
  await page.locator('#nores-clear').click();await page.waitForTimeout(300);assert.equal(await page.locator('#search').inputValue(),'');assert.equal(await shown('#nores'),false);assert.equal((await rowNames()).length,chips[0].n);
  check('A search that matches nobody shows "No customers match." with Clear filters, which brings the whole list back');
  // P2-10 opening a row shows the details with Record payment and Cancel plan
  await page.locator('#tbody tr.row[data-id=w1] .nm').click();await page.waitForTimeout(400);
  assert.equal(await page.locator('tr.detail[data-id=w1]').count(),1);assert.equal(await shown('#tbody tr.row[data-id=w1] .row-pay'),true);assert.equal(await shown('#tbody tr.row[data-id=w1] .row-cancel'),true);
  await page.screenshot({path:path.join(out,'customers-open-390-light.png'),fullPage:true});
  await page.locator('#tbody tr.row[data-id=w1] .row-pay').click();await pd.waitFor();assert.equal(norm(await page.locator('#payment-who').textContent()),'Wally One');
  await page.locator('#payment-close').click().catch(async()=>{await page.keyboard.press('Escape');});await until(async()=>!(await pd.isVisible()),'payment dialog closed');
  await page.locator('#tbody tr.row[data-id=w1] .nm').click();await page.waitForTimeout(300);assert.equal(await page.locator('tr.detail').count(),0);
  assert.equal(await noSideScroll(),true);await page.screenshot({path:path.join(out,'customers-390-light.png'),fullPage:true});
  check('Tapping Wally One opens the details with Record payment and Cancel plan shown; Record payment opens the payment box for Wally One; tapping again closes it; no sideways scroll');

  // 11. More: Settings opens; the old layout and back
  await go('more');await page.locator('[data-more=settings]').click();await page.waitForTimeout(300);assert.equal(await shown('#settingsPanel'),true);assert.equal(await tab(),'more');
  await page.locator('#more-classic').click();await page.waitForLoadState('domcontentloaded');await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(1500);
  assert.equal(await page.evaluate(()=>document.body.dataset.ui),'classic');assert.equal(await shown('#tabBar'),false);assert.equal(await shown('#btn-settings'),true);assert.equal(await shown('#tableWrap'),true);assert.equal(await shown('#todayPanel'),false);
  await page.screenshot({path:path.join(out,'classic-390-light.png')});
  /* v80: the classic layout keeps the v79 list: the controls on the toolbar, the three-box strip, rows with their buttons, no Filter sheet */
  for(const id of ['search','btn-filter','pkgFilter','statusFilter','sort','btn-add','btn-quick','btn-io'])assert.equal(await page.locator('.toolbar #'+id).count(),1,id+' on the toolbar');
  assert.equal(await shown('#btn-fsheet'),false);assert.equal(await shown('#cu-add'),false);assert.equal(await page.locator('#payStrip .ps-btn').count(),3);assert.equal(await page.locator('#payStrip [data-pf=""]').count(),0);
  assert.equal(await page.locator('#tbody .cu-end,#tbody .grp-fold').count(),0);assert.equal(norm(await page.locator('#payStrip [data-pf=owes] .ps-l').textContent()),'Owe money');
  assert.ok(await page.locator('#tbody tr.row .row-pay').first().isVisible(),'Record payment on a closed classic row');
  check('The old layout is unchanged: every control on the toolbar, the three-box strip (Owe money, Due this week, Paid up), Record payment on each row, no Filter sheet or folding headings');
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
  await go('customers');await page.screenshot({path:path.join(out,'customers-390-dark.png'),fullPage:true});
  await page.locator('#btn-fsheet').click();await page.waitForTimeout(250);await page.screenshot({path:path.join(out,'filter-390-dark.png')});await page.keyboard.press('Escape');await page.waitForTimeout(200);
  for(const scheme of ['light','dark']){await page.setViewportSize({width:1400,height:900});await page.emulateMedia({colorScheme:scheme});await go('today');
    const nav=await page.locator('#tabBar').boundingBox();assert.ok(nav.x===0&&nav.width>=200&&nav.width<=240&&nav.height>=880,JSON.stringify(nav));
    const tp=await page.locator('#todayPanel').boundingBox();assert.ok(tp.x>=nav.width,'content to the right of the side bar');
    await page.screenshot({path:path.join(out,`today-1400-${scheme}.png`)});assert.equal(await noSideScroll(),true,`1400 ${scheme} today`);
    await go('customers');await page.screenshot({path:path.join(out,`customers-1400-${scheme}.png`)});assert.equal(await noSideScroll(),true,`1400 ${scheme} customers`);
    {/* v80: on a computer too, a closed row has no buttons (the Remind column is in the details) and the header, search, Filter and chips sit above the table */
      const ctl=await page.locator('#tbody tr.row').evaluateAll(rs=>rs.map(r=>[...r.querySelectorAll('button,a[href]')].filter(e=>{const b=e.getBoundingClientRect();return b.width>0&&b.height>0;}).length));
      assert.ok(ctl.length>=6&&ctl.every(n=>n===0),JSON.stringify(ctl));
      const tw=await page.locator('#tableWrap').boundingBox(),ch=await page.locator('#payStrip').boundingBox(),hd=await page.locator('#cu-add').boundingBox();assert.ok(hd.y<ch.y&&ch.y<tw.y,'header, chips, then the table');}
    for(const t of ['reminders','money','more']){await go(t);assert.equal(await noSideScroll(),true,`1400 ${scheme} ${t}`);}}
  check('A computer shows the side bar (220px, full height) with the content to its right; Customers has no buttons on a closed row; no sideways scroll at 390px and 1400px in light and dark');
  assert.deepEqual(errors,[]);check('No console or page errors');
  fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({version:'81',checks},null,2));console.log('tabs-flow: '+checks.length+' checks passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
