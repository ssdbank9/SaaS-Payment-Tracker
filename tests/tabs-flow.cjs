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
  assert.equal(new URL(page.url()).pathname,'/');assert.equal(await page.locator('#tabBar').count(),0);assert.equal(await page.locator('#app-ver').textContent(),'v85');
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
  assert.equal(await page.locator('#app-ver').textContent(),'v85');assert.equal(new URL(page.url()).pathname,'/new');
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
  assert.equal(await page.evaluate(()=>document.body.dataset.cust),'d2');assert.equal(norm(await page.locator('#tbody tr.detail[data-id=d2] .cp-name').textContent()),'Sam Soon');assert.equal(await shown('#custHead'),false);assert.ok(await page.evaluate(()=>scrollY)<5,'the page opens at its top');
  await go('more');await page.locator('[data-more=search]').click();await page.waitForTimeout(300);assert.equal(await tab(),'more');assert.equal(await shown('#searchPanel'),true);
  await page.locator('#sr-q').fill('Nora');await page.waitForTimeout(300);await page.locator('#sr-body tr[data-user=d3]').click();await page.waitForTimeout(500);
  assert.equal(await tab(),'customers');assert.equal(await page.locator('tr.detail[data-id=d3]').count(),1);assert.equal(await page.evaluate(()=>document.body.dataset.cust),'d3');assert.equal(await shown('#tbody tr.detail[data-id=d3] .cp-pay'),true);
  check('Tapping Sam Soon under Due this week opens his customer page (v82) on Customers; a Search result (More) opens that customer\'s page too');

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
  // P2-10 (v82) opening a row shows the customer page with Record payment, and Cancel plans in its More menu
  await page.locator('#tbody tr.row[data-id=w1] .nm').click();await page.waitForTimeout(400);
  assert.equal(await page.locator('tr.detail[data-id=w1]').count(),1);assert.equal(await page.evaluate(()=>document.body.dataset.cust),'w1');
  assert.equal(await shown('#tbody tr.detail[data-id=w1] .cp-pay'),true);assert.equal(await shown('#tbody tr.row[data-id=w1]'),false);
  await page.screenshot({path:path.join(out,'customers-open-390-light.png'),fullPage:true});
  await page.locator('#tbody tr.detail[data-id=w1] .cp-pay').click();await pd.waitFor();assert.equal(norm(await page.locator('#payment-who').textContent()),'Wally One');
  await page.locator('#payment-close').click().catch(async()=>{await page.keyboard.press('Escape');});await until(async()=>!(await pd.isVisible()),'payment dialog closed');
  await page.locator('#tbody tr.detail[data-id=w1] [data-cp=cmenu]').click();await page.waitForTimeout(250);assert.equal(await page.locator('#cpSheet [data-k=cancelplans]').isEnabled(),true);
  await page.locator('#cpSheet [data-k=cancelplans]').click();await page.waitForTimeout(300);assert.equal(await page.locator('#cancelPlanDialog').evaluate(d=>d.open),true);
  await page.locator('#cp-close').click();await until(async()=>!(await page.locator('#cancelPlanDialog').evaluate(d=>d.open)),'cancel plan dialog closed');
  await page.locator('#tbody tr.detail[data-id=w1] [data-cp=back]').click();await page.waitForTimeout(300);assert.equal(await page.locator('tr.detail').count(),0);
  assert.equal(await noSideScroll(),true);await page.screenshot({path:path.join(out,'customers-390-light.png'),fullPage:true});
  check('Tapping Wally One opens his page with Record payment (it opens the payment box for Wally One) and Cancel plans in the More menu (it opens the Cancel plan box); Back closes the page; no sideways scroll');
  // v82 phase 3: the customer page. More test data: a customer with 3 plans of different products (a long product name), PKR and USD,
  // a price change, a refund, a one-time item and an ended plan; a plain 3-plan customer; customers to save against.
  {const st2=await doc('settings/main');await api('PATCH','/api/docs/settings/main',{packages:st2.packages.filter(p=>p.id!=='pkg_long').concat([{id:'pkg_long',name:'Claude Max Team Annual Workspace',cycle:'monthly',price:4200,currency:'PKR',description:'',cycleStart:'2026-09-05'}])});}
  const mp=(id,pkg,cur,price,start,extra)=>({id,kind:'monthly',cycle:'monthly',name:'',packageId:pkg,currency:cur,start,anchor:start,ownStart:true,prorate:false,prices:[{from:start,price}],payments:[],...(extra||{})});
  const pay=(id,date,amount,currency)=>({id,date,amount,currency:currency||'PKR',note:''});
  await api('POST','/api/import',{docs:{
   'users/m3':{name:'Mira Manyplans-Longname Qureshi-Siddiqui',phone:'923001234570',email:'mira.manyplans@example.com',telegram:'miratest',joinDate:'2026-06-01',notes:'Pays by NayaPay',subscriptions:[
     mp('s1','pkg_long','PKR',4000,'2026-09-05',{prices:[{from:'2026-09-05',price:4000},{from:'2026-10-05',price:4200}],payments:[pay('p1','2026-09-05',4000),pay('p2','2026-10-05',4200)]}),
     mp('s2','pkg_cmax','USD',15,'2026-10-20',{payments:[{...pay('p3','2026-10-20',15,'USD'),rate:280}],refunds:[{id:'r1',date:'2026-10-25',amount:5,currency:'USD',rate:280,note:'outage'}]}),
     {...mp('s4','pkg_g','PKR',50000,'2026-03-01',{payments:[pay('p4','2026-03-01',50000)]}),cycle:'yearly',prorationBasis:'actual',paymentEvery:12},
     {id:'s3',kind:'one-time',name:'Account setup',packageId:'',currency:'PKR',start:'2026-11-01',total:3000,due:'2026-11-20',payments:[pay('p5','2026-11-01',2000)]},
     {...mp('s5','pkg_c','PKR',4200,'2026-06-01',{payments:[pay('p6','2026-06-01',4200),pay('p7','2026-07-01',4200),pay('p8','2026-08-01',4200)]}),end:'2026-08-31',endReason:'moved to the long plan'}]},
   'users/t3':{name:'Tara Three',phone:'923001234571',email:'tara@example.com',joinDate:'2026-09-10',subscriptions:[
     mp('s1','pkg_c','PKR',4200,'2026-09-10',{payments:[pay('p1','2026-09-10',4200),pay('p2','2026-10-10',4200)]}),mp('s2','pkg_cmax','USD',15,'2026-09-12',{payments:[{...pay('p3','2026-09-12',15,'USD'),rate:280},{...pay('p4','2026-10-12',15,'USD'),rate:280}]}),
     mp('s3','pkg_long','PKR',4200,'2026-09-14',{payments:[pay('p5','2026-09-14',4200),pay('p6','2026-10-14',4200)]})]},
   'users/e1':{name:'Eddie Ends',phone:'923001234572',joinDate:'2026-10-10',subscriptions:[mp('s1','pkg_c','PKR',4200,'2026-10-10',{payments:[pay('p1','2026-10-10',4200)]}),mp('s2','pkg_cmax','PKR',5000,'2026-10-10',{payments:[pay('p2','2026-10-10',5000)]})]},
   'users/r1':{name:'Rita Resume',phone:'923001234573',joinDate:'2026-10-01',subscriptions:[mp('s1','pkg_c','PKR',4200,'2026-10-01',{payments:[pay('p1','2026-10-01',4200)]})]},
  },replace:[]});
  await page.reload();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);await go('customers');
  const cust=()=>page.evaluate(()=>document.body.dataset.cust||'');
  const sheetOpen=()=>page.locator('#cpSheet').evaluate(d=>d.open);
  const dlgOpen=id=>page.locator('#'+id).evaluate(d=>d.open);
  const D=id=>`#tbody tr.detail[data-id=${id}]`;
  const openCust=async id=>{await page.locator(`#tbody tr.row[data-id=${id}] .nm`).click();await page.waitForTimeout(400);assert.equal(await cust(),id);};
  const back=async()=>{await page.locator('#tbody [data-cp=back]').click();await page.waitForTimeout(300);assert.equal(await cust(),'');};
  const menu=async(sel,key)=>{await page.locator(sel).click();await page.waitForTimeout(250);assert.equal(await sheetOpen(),true,'menu '+sel);if(key){const it=page.locator(`#cpSheet .cpm-item[data-k=${key}]`);assert.equal(await it.isEnabled(),true,key+' enabled');await it.click();await page.waitForTimeout(400);}};
  const formOn=sel=>page.locator(sel).first().evaluate(f=>!f.hidden&&f.getBoundingClientRect().height>0);
  const closeForm=async(sel,key)=>{await page.locator(`${sel} [data-act=toggle][data-key="${key}"]`).first().click();await page.waitForTimeout(250);assert.equal(await page.locator(sel).first().evaluate(f=>f.hidden),true,'closed '+sel);};
  const closeDlg=async(id,btn)=>{await page.locator('#'+btn).click();await until(async()=>!(await dlgOpen(id)),id+' closed');};
  const user=id=>doc('users/'+id);

  // P3-1 the page: its own screen with Back; the list, header, chips and other rows are hidden
  await page.evaluate(()=>scrollTo(0,0));await openCust('m3');
  assert.equal(await shown('#custHead'),false);assert.equal(await shown('.toolbar'),false);assert.equal(await shown('#payStrip'),false);assert.equal(await shown('#tbody tr.row[data-id=d3]'),false);assert.equal(await shown('#tbody tr.grp'),false);
  assert.equal(norm(await page.locator(D('m3')+' .cp-name').textContent()),'Mira Manyplans-Longname Qureshi-Siddiqui');
  const top=norm(await page.locator(D('m3')+' .cp-top').innerText());assert.match(top,/^Owes Rs 5,200 \+ \$5 3 plans · 1 one-time .*Record payment WhatsApp Email Telegram$/,top);
  assert.equal(await page.locator(D('m3')+' .cp-card').count(),5);assert.equal(await page.locator(D('m3')+' .cp-card[data-ended]').count(),1);assert.equal(await page.locator(D('m3')+' .cp-card.cp-one').count(),1);
  const c1=norm(await page.locator(D('m3')+' .cp-card[data-sub=s1]').innerText());
  assert.match(c1,/^Claude Max Team Annual Workspace Rs 4,200 a month .*Renews on the 5th Paid to Nov 4 Your cost Not set 5 Dec 2026 . 4 Jan 2027 Upcoming · due Dec 5 Rs 4,200 5 Nov . 4 Dec 2026 Not paid · was due Nov 5 Rs 4,200 5 Oct . 4 Nov 2026 Paid Rs 4,200 All bills and payments$/,c1);
  assert.match(norm(await page.locator(D('m3')+' .cp-card[data-sub=s3]').innerText()),/^Account setup One-time .*Total Rs 3,000 Paid Rs 2,000 Left · due Nov 20 Rs 1,000 Record Rs 1,000 Payments and refunds$/);
  assert.match(norm(await page.locator(D('m3')+' .cp-card[data-sub=s5]').innerText()),/^C Rs 4,200 a month Ended Aug 31 .*from Jun 1, 2026 to Aug 31, 2026\. Nothing owed\. Reason: moved to the long plan\. Change last day All bills and payments$/);
  check('A customer opens as its own page: Back, name, "Owes Rs 5,200 + $5", Record payment, WhatsApp / Email / Telegram; one card per plan with renews on, paid to, your cost and the latest 3 bills; a one-time card (total, paid, left, Record Rs 1,000) and a muted ended plan with its last day');

  // P3-2 phone layout at 390 and 375, light and dark: nothing sideways, amounts on one line, long names wrap inside their box
  const layout=async tag=>{assert.equal(await noSideScroll(),true,'no sideways scroll '+tag);
    const r=await page.evaluate(()=>{const W=innerWidth,d=document.querySelector('#tbody tr.detail');const one=e=>{const cs=getComputedStyle(e),lh=parseFloat(cs.lineHeight)||parseFloat(cs.fontSize)*1.4;return e.getBoundingClientRect().height<lh*1.6;};
      const amts=[...d.querySelectorAll('.cp-ba,.cp-owe>span,.cp-price,.cp-f .v.num')].filter(e=>e.getBoundingClientRect().width>0);
      const out=[...d.querySelectorAll('.cp *')].filter(e=>{const b=e.getBoundingClientRect();return b.width>0&&(b.right>W+0.5||b.left<-0.5);}).map(e=>e.className||e.tagName);
      return {amts:amts.length,bad:amts.filter(e=>!one(e)).map(e=>e.textContent),out};});
    assert.ok(r.amts>=10&&!r.bad.length&&!r.out.length,tag+' '+JSON.stringify(r));};
  await layout('390 light');await page.screenshot({path:path.join(out,'customer-390-light.png'),fullPage:true});
  await page.setViewportSize({width:375,height:812});await page.waitForTimeout(250);await layout('375 light');await page.screenshot({path:path.join(out,'customer-375-light.png'),fullPage:true});
  await page.emulateMedia({colorScheme:'dark'});await page.waitForTimeout(200);await layout('375 dark');await page.screenshot({path:path.join(out,'customer-375-dark.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(250);await layout('390 dark');await page.screenshot({path:path.join(out,'customer-390-dark.png'),fullPage:true});
  await page.emulateMedia({colorScheme:'light'});await page.waitForTimeout(200);
  check('At 375px and 390px, light and dark: no sideways scroll, nothing outside the screen, every amount on one line, the long name and product wrap inside their boxes');

  // P3-3 the plan More menu: every entry opens its existing form or dialog
  const pm=D('m3')+' [data-cp=pmenu][data-sub=s1]',q=c=>`${D('m3')} .${c}[data-sub=s1]`;
  await menu(pm);const keys=await page.locator('#cpSheet .cpm-item').evaluateAll(es=>es.map(e=>e.dataset.k));
  assert.deepEqual(keys,['price','adjust','refund','dates','product','upto','advanced','end','remove']);
  const sb2=await page.locator('#cpSheet').boundingBox();assert.ok(sb2.x===0&&sb2.width===390&&sb2.y+sb2.height>=843,'a bottom sheet '+JSON.stringify(sb2));await page.screenshot({path:path.join(out,'plan-menu-390-light.png')});
  await page.locator('#cps-close').click();await page.waitForTimeout(250);assert.equal(await sheetOpen(),false);assert.equal(await page.evaluate(()=>document.activeElement&&document.activeElement.dataset.cp),'pmenu','focus back on More');
  await menu(pm);await page.keyboard.press('Escape');await page.waitForTimeout(250);assert.equal(await sheetOpen(),false);assert.equal(await cust(),'m3','Escape closes the menu, not the page');
  await menu(pm);await page.mouse.click(195,30);await page.waitForTimeout(250);assert.equal(await sheetOpen(),false,'backdrop closes');
  await menu(pm,'price');assert.equal(await formOn(q('price-form')),true);assert.equal(await shown(D('m3')+' .cp-also [data-key="courtesy:s1"]'),true);assert.ok(/Price history/.test(await page.locator(D('m3')+' .cp-card[data-sub=s1]').innerText()));await closeForm(q('price-form'),'price:s1');
  await menu(pm,'adjust');assert.equal(await sheetOpen(),true);assert.equal(await page.locator('#cps-bill').inputValue(),'2026-11-05');assert.deepEqual(await page.locator('#cpSheet .cpm-item').evaluateAll(es=>es.map(e=>e.dataset.k)),['bill','amt','courtesy']);
  await page.locator('#cpSheet [data-k=bill]').click();await page.waitForTimeout(300);assert.equal(await dlgOpen('billDialog'),true);assert.equal(await page.locator('#bill-account').inputValue(),'s1');assert.equal(await page.locator('#bill-period').inputValue(),'2026-11-05');await closeDlg('billDialog','bill-close');
  await menu(pm,'adjust');await page.locator('#cps-bill').selectOption('2026-12-05');await page.locator('#cpSheet [data-k=amt]').click();await page.waitForTimeout(400);
  assert.equal(await formOn(`${D('m3')} .amt-form[data-sub=s1][data-start="2026-12-05"]`),true);await page.locator(`${D('m3')} .amt-form[data-sub=s1] [data-act=amt-cancel]`).click();await page.waitForTimeout(250);
  await menu(pm,'adjust');await page.locator('#cpSheet [data-k=courtesy]').click();await page.waitForTimeout(400);assert.equal(await formOn(q('courtesy-form')),true);
  assert.deepEqual(await page.locator(q('courtesy-form')).evaluate(f=>[f.elements.from.value,f.elements.tenure.value]),['2026-11-05','one']);await closeForm(q('courtesy-form'),'courtesy:s1');
  await menu(pm,'refund');assert.equal(await dlgOpen('refundDialog'),true);assert.equal(await page.locator('#refund-account').inputValue(),'s1');await closeDlg('refundDialog','refund-close');
  await menu(pm,'dates');assert.deepEqual(await page.locator('#cpSheet .cpm-item').evaluateAll(es=>es.map(e=>e.dataset.k)),['start','renew']);await page.locator('#cpSheet [data-k=start]').click();await page.waitForTimeout(300);assert.equal(await dlgOpen('startDialog'),true);assert.equal(await page.locator('#start-account').inputValue(),'s1');await closeDlg('startDialog','start-close');
  await menu(pm,'dates');await page.locator('#cpSheet [data-k=renew]').click();await page.waitForTimeout(400);assert.equal(await formOn(q('subedit-form')),true);await closeForm(q('subedit-form'),'edit:s1');
  await menu(pm,'product');assert.deepEqual(await page.locator('#cpSheet .cpm-item').evaluateAll(es=>es.map(e=>e.dataset.k)),['tier','cost','pkg']);await page.locator('#cpSheet [data-k=tier]').click();await page.waitForTimeout(400);assert.equal(await formOn(q('tier-form')),true);await closeForm(q('tier-form'),'tier:s1');
  await menu(pm,'product');await page.locator('#cpSheet [data-k=cost]').click();await page.waitForTimeout(400);assert.equal(await formOn(q('subedit-form')),true);assert.equal(await shown(q('subedit-form')+' .account-cost-fields'),true);await closeForm(q('subedit-form'),'edit:s1');
  await menu(pm,'upto');assert.equal(await formOn(q('upto-form')),true);await page.locator(q('upto-form')+' [data-act=toggle][data-key="upto:s1"]').first().click();await page.waitForTimeout(250);
  await menu(pm,'advanced');assert.equal(await formOn(q('subedit-form')),true);await closeForm(q('subedit-form'),'edit:s1');
  await menu(pm,'end');assert.equal(await dlgOpen('cancelPlanDialog'),true);assert.deepEqual(await page.locator('#cp-list input').evaluateAll(es=>es.filter(e=>e.checked).map(e=>e.value)),['s1']);await closeDlg('cancelPlanDialog','cp-close');
  await menu(pm,'remove');assert.equal(await shown(q('subedit-form')+' [data-act=sub-remove-yes]'),true);await page.locator(q('subedit-form')+' [data-act=sub-remove-no]').click();await page.waitForTimeout(300);await closeForm(q('subedit-form'),'edit:s1');
  assert.equal((await user('m3')).subscriptions.length,5,'nothing removed');
  await menu(D('m3')+' [data-cp=pmenu][data-sub=s3]');assert.deepEqual(await page.locator('#cpSheet .cpm-item').evaluateAll(es=>es.map(e=>e.dataset.k)),['refund','courtesy','edit','remove']);await page.keyboard.press('Escape');await page.waitForTimeout(200);
  check('The plan More menu (a bottom sheet; Close, Escape and the backdrop close it, focus returns): Change price (with price history and the Courtesy / Standing discount links), Adjust a bill (pick a bill, then Set bill, Bill it as another product or a one-off courtesy discount on that bill), Refund, Plan dates (start dialog, Renews on / end in Edit plan), Change product or cost (tier form, supplier cost), Pay several months, Advanced, End this plan (only that plan ticked) and Remove this plan (its confirmation) each open the existing form or dialog; a one-time item has Refund, Courtesy discount, Edit item, Remove');

  // P3-4 the customer More menu
  const cm=D('m3')+' [data-cp=cmenu]';
  await menu(cm);assert.deepEqual(await page.locator('#cpSheet .cpm-item').evaluateAll(es=>es.map(e=>e.dataset.k)),['edit','add','link','cancelplans','cancel','delete']);
  assert.match(norm(await page.locator('#cps-sub').textContent()),/^3 plans · customer since Jun 1, 2026 · paid /);await page.screenshot({path:path.join(out,'customer-menu-390-light.png')});await page.keyboard.press('Escape');await page.waitForTimeout(200);
  await menu(cm,'edit');assert.equal(await formOn(D('m3')+' .edit-form'),true);assert.equal(await shown(D('m3')+' .edit-form [name=phone]'),true);await closeForm(D('m3')+' .edit-form','edit');
  await menu(cm,'add');assert.equal(await formOn(D('m3')+' .addsub-form'),true);await closeForm(D('m3')+' .addsub-form','addsub');
  await menu(cm,'cancelplans');assert.equal(await dlgOpen('cancelPlanDialog'),true);await closeDlg('cancelPlanDialog','cp-close');
  await menu(cm,'cancel');assert.equal(await formOn(D('m3')+' .cancel-form'),true);await closeForm(D('m3')+' .cancel-form','cancel');
  await menu(cm,'delete');assert.equal(await shown(D('m3')+' .edit-form [data-act=del-yes]'),true);await page.locator(D('m3')+' .edit-form [data-act=del-no]').click();await page.waitForTimeout(300);await closeForm(D('m3')+' .edit-form','edit');
  assert.ok(await user('m3'),'not deleted');
  check('The customer More menu: Edit details (contact fields shown), Add a plan or one-time item, Copy the customer link, Cancel plans (dialog), Cancel the whole subscription (form) and Delete customer (its Yes / Cancel confirmation) each open the existing form or dialog');

  // P3-5 a tapped bill: Record payment for it saves a payment for that bill
  await page.locator(D('m3')+' .cp-bill[data-sub=s1][data-start="2026-11-05"]').click();await page.waitForTimeout(250);
  assert.match(norm(await page.locator('#cps-title').textContent()),/^Bill 5 Nov . 4 Dec 2026$/);assert.deepEqual(await page.locator('#cpSheet .cpm-item').evaluateAll(es=>es.map(e=>e.dataset.k)),['rec','bill','amt','courtesy']);
  await page.locator('#cpSheet [data-k=rec]').click();await pd.waitFor();assert.equal(await page.locator('#payment-account').inputValue(),'s1');assert.match(await page.locator('#payment-month option:checked').textContent(),/5 Nov . 4 Dec 2026/);assert.equal(Number(await page.locator('#payment-amount').inputValue()),4200);
  await page.locator('#payment-save').click();await until(async()=>!(await pd.isVisible()),'payment dialog closed');
  await until(async()=>((await user('m3')).subscriptions[0].payments||[]).length===3,'the bill payment stored');assert.equal((await user('m3')).subscriptions[0].payments[2].amount,4200);
  await until(async()=>/Paid Rs 4,200 5 Oct/.test(norm(await page.locator(D('m3')+' .cp-card[data-sub=s1]').innerText()))&&/5 Nov . 4 Dec 2026 Paid/.test(norm(await page.locator(D('m3')+' .cp-card[data-sub=s1]').innerText())),'the bill shows Paid');
  check('Tapping the 5 Nov - 4 Dec bill offers Record payment for this bill and the three Adjust ways; Record payment opens the payment box on that plan and bill with Rs 4,200; saving stores the payment and the bill reads Paid');

  // P3-6 the top Record payment, under the Owes chip: the page stays open when the customer stops owing
  await back();await page.locator('#payStrip [data-pf=owes]').click();await page.waitForTimeout(300);await openCust('m3');
  await page.locator(D('m3')+' .cp-pay').click();await pd.waitFor();assert.match(norm(await page.locator('#payment-who').textContent()),/^Mira Manyplans/);
  await page.locator('#payment-account').selectOption('s2');await page.waitForTimeout(250);assert.equal(Number(await page.locator('#payment-amount').inputValue()),5);
  const n2=((await user('m3')).subscriptions[1].payments||[]).length;await page.locator('#payment-save').click();await until(async()=>!(await pd.isVisible()),'payment dialog closed');
  await until(async()=>((await user('m3')).subscriptions[1].payments||[]).length===n2+1,'the payment stored');assert.equal(await cust(),'m3','the page stays open');
  await until(async()=>/^Owes Rs 1,000$/.test(norm(await page.locator(D('m3')+' .cp-owe').innerText())),'only the one-time item owed');
  await page.locator(D('m3')+' .cp-card[data-sub=s3] .cp-rec1').click();await pd.waitFor();assert.equal(await page.locator('#payment-account').inputValue(),'s3');assert.equal(Number(await page.locator('#payment-amount').inputValue()),1000);
  await page.locator('#payment-save').click();await until(async()=>!(await pd.isVisible()),'payment dialog closed');await until(async()=>((await user('m3')).subscriptions[3].payments||[]).length===2,'the item payment stored');
  await until(async()=>/Nothing owed/.test(await page.locator(D('m3')+' .cp-owe').innerText()),'nothing owed');
  await back();assert.ok(!(await rowNames()).includes('Mira Manyplans-Longname Qureshi-Siddiqui'),'back on the Owes list, which she has left');await page.locator('#payStrip [data-pf=""]').click();await page.waitForTimeout(300);
  check('Record payment at the top opens the payment box for the plan that needs money ($5 on C Max); saving stores it and the page reads "Owes Rs 1,000"; the one-time card Record Rs 1,000 opens the box on that item; after saving, the page stays open (even under the Owes chip) and reads "Nothing owed"; Back returns to the Owes list without her');

  // P3-7 Back, the browser Back and Escape return to the list where it was
  const list0=await page.evaluate(()=>{scrollTo(0,document.documentElement.scrollHeight);return scrollY;});assert.ok(list0>50,'the list scrolls: '+list0);
  const lastRow=await page.locator('#tbody tr.row').evaluateAll(rs=>{const v=rs.filter(r=>{const b=r.getBoundingClientRect();return b.top>0&&b.bottom<innerHeight-80;});return v.length?v[v.length-1].dataset.id:'';});assert.ok(lastRow);
  await openCust(lastRow);assert.ok(await page.evaluate(()=>scrollY)<5,'the page opens at its top');assert.equal(new URL(page.url()).pathname,'/new');
  await back();assert.ok(Math.abs(await page.evaluate(()=>scrollY)-list0)<3,'Back restores the list position');
  await openCust(lastRow);await page.goBack();await page.waitForTimeout(500);assert.equal(await cust(),'');assert.equal(new URL(page.url()).pathname,'/new','still on the site');assert.ok(Math.abs(await page.evaluate(()=>scrollY)-list0)<3,'browser Back restores the list position');
  assert.equal(await page.locator('#tbody tr.row').count()>5,true);
  await openCust(lastRow);await page.keyboard.press('Escape');await page.waitForTimeout(300);assert.equal(await cust(),'');assert.ok(Math.abs(await page.evaluate(()=>scrollY)-list0)<3,'Escape restores the list position');
  await openCust('t3');await go('today');assert.equal(await cust(),'');await go('customers');assert.equal(await cust(),'');assert.equal(await shown('#custHead'),true);
  await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>history.state&&history.state.cp||''),'','no page entry left in the history by a tab switch');
  check('Back, the browser Back and Escape each return from the page to the list at the scroll position it had (the address stays /new); switching tab and coming back shows the list');
  // P3-7b v83: opening and closing customers faster than the browser steps back must not step back twice (that left the site)
  {const r=await page.evaluate(async()=>{const vis=e=>{const b=e.getBoundingClientRect();return b.width>0&&b.height>0;};const ids=[...document.querySelectorAll('#tbody tr.row')].filter(vis).slice(0,2).map(x=>x.dataset.id);
     for(const id of [ids[0],ids[1],ids[0]]){document.querySelector(`#tbody tr.row[data-id="${id}"] .nm`).click();document.querySelector('#tbody tr.detail [data-cp=back]').click();}
     document.querySelector(`#tbody tr.row[data-id="${ids[1]}"] .nm`).click();await new Promise(z=>setTimeout(z,600));
     return {path:location.pathname,cust:document.body.dataset.cust||'',want:ids[1],cp:(history.state&&history.state.cp)||''};});
   assert.deepEqual([r.path,r.cust,r.cp],['/new',r.want,r.want],JSON.stringify(r));
   await page.goBack();await page.waitForTimeout(500);assert.equal(new URL(page.url()).pathname,'/new','browser Back after a fast sequence stays on the site');assert.equal(await cust(),'');assert.equal(await shown('#tabBar'),true);}
  check('Opening and closing three customers with no pause, then opening a fourth, stays on /new with that customer open; the browser Back then returns to the list');

  // P3-8 the visible buttons and the length of a 3-plan customer at 390px
  await openCust('t3');
  const cnt=await page.evaluate(()=>{const d=document.querySelector('#tbody tr.detail');const vis=[...d.querySelectorAll('button,a[href],select,input')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;});
    const cards=[...d.querySelectorAll('.cp-card')],last=cards[cards.length-1].getBoundingClientRect(),first=d.getBoundingClientRect();
    return {all:vis.length,bills:vis.filter(e=>e.classList.contains('cp-bill')).length,other:vis.filter(e=>!e.classList.contains('cp-bill')).map(e=>e.dataset.cp||e.dataset.act||e.textContent.trim()),screens:Math.round((last.bottom-first.top)/innerHeight*100)/100};});
  console.log('visible controls (3 plans, 390px): '+JSON.stringify(cnt));
  assert.equal(cnt.bills,9);assert.equal(cnt.other.length,12,JSON.stringify(cnt.other));assert.ok(cnt.screens<=2.2,'about two screens: '+cnt.screens);
  await page.screenshot({path:path.join(out,'customer3-390-light.png'),fullPage:true});
  check(`A customer with 3 plans at 390px shows ${cnt.other.length} buttons (Back, More, Record payment, WhatsApp, Email, Telegram and a More and All bills per plan) plus ${cnt.bills} bill rows, ${cnt.screens} screens long before All bills`);

  // P3-9 a poll redraw keeps the page, an open form, what was typed and the scroll position
  await back();await openCust('e1');await menu(D('e1')+' [data-cp=pmenu][data-sub=s1]','price');await page.locator('#pr-price-s1').fill('4321');
  const y0=await page.evaluate(()=>scrollY);const nora=await doc('users/d3');await api('POST','/api/import',{docs:{'users/d3':{...nora,name:'Nora Polled'}},replace:[]});
  await until(async()=>(await page.evaluate(()=>{const e=document.querySelector('#tbody tr.row[data-id=d3] .nm');return e?e.textContent:'';}))==='Nora Polled','the background refresh redrew the list');
  await page.waitForTimeout(500);
  assert.equal(await cust(),'e1');assert.equal(await page.locator('#pr-price-s1').inputValue(),'4321');assert.equal(await formOn(`${D('e1')} .price-form[data-sub=s1]`),true);assert.ok(Math.abs(await page.evaluate(()=>scrollY)-y0)<3,'scroll kept');
  check('A background refresh (another device changed a customer) leaves the page open with the Change price form still open, "4321" still typed and the scroll position kept');

  // P3-10 saves through the page: a price change, a refund, ending one plan
  const from=await page.locator('#pr-from-s1').inputValue();await page.locator(`${D('e1')} .price-form[data-sub=s1] button[type=submit]`).click();
  await until(async()=>((await user('e1')).subscriptions[0].prices||[]).some(p=>p.from===from&&p.price===4321),'the price stored');
  await menu(D('e1')+' [data-cp=pmenu][data-sub=s1]','refund');assert.equal(await dlgOpen('refundDialog'),true);await page.locator('#refund-amount').fill('500');await page.locator('#refund-save').click();await until(async()=>!(await dlgOpen('refundDialog')),'refund saved');
  await until(async()=>((await user('e1')).subscriptions[0].refunds||[]).length===1,'the refund stored');assert.equal((await user('e1')).subscriptions[0].refunds[0].amount,500);
  await menu(D('e1')+' [data-cp=pmenu][data-sub=s2]','end');assert.deepEqual(await page.locator('#cp-list input').evaluateAll(es=>es.filter(e=>e.checked).map(e=>e.value)),['s2']);
  await page.locator('#cp-save').click();await until(async()=>!(await dlgOpen('cancelPlanDialog')),'plan ended');
  await until(async()=>!!(await user('e1')).subscriptions[1].end,'the end stored');{const e=await user('e1');assert.ok(!e.subscriptions[0].end&&!e.cancel,'the other plan and the customer continue');}
  check(`Through the page: Change price saves Rs 4,321 from ${from}; Refund saves a Rs 500 refund; End this plan ends only that plan (the other plan runs, the customer is not cancelled)`);

  // P3-11 Cancel, then Resume
  await back();await openCust('r1');await menu(D('r1')+' [data-cp=cmenu]','cancel');assert.equal(await formOn(D('r1')+' .cancel-form'),true);
  await page.locator(D('r1')+' .cancel-form button[type=submit]').click();await until(async()=>!!(await user('r1')).cancel,'cancelled');assert.equal(await cust(),'r1','the page stays open');
  await until(async()=>(await page.locator(D('r1')+' .cp-cx').count())===1,'the cancellation card');await page.screenshot({path:path.join(out,'customer-cancelled-390-light.png'),fullPage:true});
  await page.locator(D('r1')+' .cp-cx [data-key=react]').click();await page.waitForTimeout(300);assert.equal(await formOn(D('r1')+' .react-form'),true);
  await page.locator(D('r1')+' .react-form button[type=submit]').click();await until(async()=>!(await user('r1')).cancel,'resumed');
  await until(async()=>(await page.locator(D('r1')+' .cp-cx').count())===0,'the card goes');
  check('Cancel the whole subscription saves the cancellation and the page shows it with Resume; Resume saves and the customer runs again');

  // P3-12 a computer: the page is full width beside the side bar (no list beside it), light and dark
  await back();for(const scheme of ['light','dark']){await page.setViewportSize({width:1400,height:900});await page.emulateMedia({colorScheme:scheme});await page.waitForTimeout(200);await openCust('m3');
    assert.equal(await noSideScroll(),true);const bx=await page.locator(D('m3')+' .cp').boundingBox();assert.ok(bx.x>=220&&bx.width<=820,JSON.stringify(bx));
    await page.screenshot({path:path.join(out,`customer-1400-${scheme}.png`),fullPage:true});await menu(D('m3')+' [data-cp=pmenu][data-sub=s1]');const mb=await page.locator('#cpSheet').boundingBox();assert.ok(mb.width<=460,'a small dialog: '+JSON.stringify(mb));await page.keyboard.press('Escape');await page.waitForTimeout(200);await back();}
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({colorScheme:'light'});await page.waitForTimeout(200);
  check('At 1400px, light and dark: the customer page sits beside the side bar, at most 820px wide, no sideways scroll; the More menu is a small dialog');

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
  /* v82: the classic layout still opens a customer inside the list (the details under the row, no customer page) */
  await page.locator('#tbody tr.row[data-id=d2] .nm').click();await page.waitForTimeout(400);
  assert.equal(await page.locator('#tbody tr.detail[data-id=d2] .detail-head').count(),1);assert.equal(await page.locator('#tbody .cp').count(),0);assert.equal(await shown('#tbody tr.row[data-id=d2]'),true);assert.equal(await shown('.toolbar'),true);assert.equal(await page.evaluate(()=>document.body.dataset.cust||''),'');
  await page.locator('#tbody tr.row[data-id=d2] .nm').click();await page.waitForTimeout(300);assert.equal(await page.locator('#tbody tr.detail').count(),0);
  check('The old layout is unchanged: every control on the toolbar, the three-box strip (Owe money, Due this week, Paid up), Record payment on each row, a customer opens inside the list, no Filter sheet or folding headings');
  /* v82: the details the old layout draws in /new are the same, character for character, as the usual page draws at / (the customer page must not change them) */
  {const grab=async id=>{await page.locator(`#tbody tr.row[data-id=${id}] .nm`).click();await page.waitForTimeout(500);const h=await page.locator(`#tbody tr.detail[data-id=${id}]`).innerHTML();await page.locator(`#tbody tr.row[data-id=${id}] .nm`).click();await page.waitForTimeout(300);return h;};
   /* v84: also an open Edit plan form, an open Edit user form and the Add form, as the old layout of /new draws them */
   const grabForms=async()=>{const r={};await page.locator('#tbody tr.row[data-id=m3] .nm').click();await page.waitForTimeout(500);
     await page.locator(D('m3')+' .sub-acts [data-act=toggle][data-key="edit:s1"]').click();await page.waitForTimeout(400);r['Edit plan']=await page.locator(D('m3')+' .subedit-form[data-sub=s1]').evaluate(f=>f.hidden?'':f.outerHTML);
     await page.locator(D('m3')+' .detail-acts [data-act=toggle][data-key=edit]').click();await page.waitForTimeout(400);r['Edit user']=await page.locator(D('m3')+' .edit-form').evaluate(f=>f.hidden?'':f.outerHTML);
     await page.locator(D('m3')+' .subedit-form[data-sub=s1] [data-act=toggle][data-key="edit:s1"]').first().click();await page.waitForTimeout(300);await page.locator(D('m3')+' .edit-form [data-act=toggle][data-key=edit]').first().click();await page.waitForTimeout(300);
     await page.locator('#tbody tr.row[data-id=m3] .nm').click();await page.waitForTimeout(300);
     await page.locator('#btn-add').click();await page.locator('#addPanel').waitFor({state:'visible'});r['Add form']=await page.locator('#addForm').evaluate(f=>f.outerHTML);await page.locator('#add-close').click();await page.waitForTimeout(200);return r;};
   /* an empty style="" left on a focused field by the browser at run time is not markup; it is removed from both before comparing */
   const same=(what,h,n)=>{h=h.replace(/ style=""/g,'');n=n.replace(/ style=""/g,'');if(h!==n){let i=0;while(i<h.length&&h[i]===n[i])i++;assert.fail(`${what} differ at ${i}: / has "${h.slice(Math.max(0,i-60),i+80)}" and /new has "${n.slice(Math.max(0,i-60),i+80)}"`);}};
   const ids=['m3','w1','e1'],inNew={};for(const id of ids)inNew[id]=await grab(id);const formsNew=await grabForms();
   await page.goto(base+'/',{waitUntil:'domcontentloaded'});await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);assert.equal(await page.locator('#tabBar').count(),0);
   for(const id of ids){const h=await grab(id);same('details of '+id,h,inNew[id]);assert.ok(h.length>2000,id+' details drawn');}
   {const formsOld=await grabForms();for(const k of Object.keys(formsOld)){assert.ok(formsOld[k].length>1500,k+' drawn open');same(k,formsOld[k],formsNew[k]);}}
   await page.goto(base+'/new',{waitUntil:'domcontentloaded'});await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(1500);assert.equal(await page.evaluate(()=>document.body.dataset.ui),'classic');}
  check('In the old layout a customer\'s details (4 plans with a one-time item and an ended plan; a wholesaler customer; a customer with an ended plan), an open Edit plan form, an open Edit user form and the Add form are identical to the usual page\'s');
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
  fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({version:'84',checks},null,2));console.log('tabs-flow: '+checks.length+' checks passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
