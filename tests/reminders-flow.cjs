// v85: the Reminders tab of the new page (/new, tabs layout) shows the same reminders as the old Queue (/): for every cycle date and every
// step (1, 2, 3), every wholesaler statement and every overdue row, the customers listed, the message text and each link (WhatsApp, Email,
// Telegram, the customer link inside the message) are equal; the Reminder run and Final notice lists for a chosen date are equal; a Sent
// tick (customer and wholesaler), Leave out (Except), Use their choice, Keep mine, Confirm stop and Dismiss store the same documents on both
// pages (ids, tokens and timestamps removed). Also: the badge and Today's row equal the old count, the step switcher, the row menu (Close,
// Escape, backdrop, focus back), the main button for a customer without WhatsApp, Tools and each of its views, How this works, the Answers
// section, empty sections, the layout at 375/390 (light, dark) and 1400, the visible-button count, and that the old layout's Queue, Reminder
// run and Final notice in /new are identical, character for character, to /. Synthetic records on a disposable server only:
//   WASOOLI_TEST_URL=http://127.0.0.1:<port> node tests/reminders-flow.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const stubWebFonts=require('./webfonts.cjs');

const base=process.env.WASOOLI_TEST_URL||'http://127.0.0.1:8098',H={'X-Requested-With':'wasool','Content-Type':'application/json'},checks=[];
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).protocol,'http:');
const out=path.resolve(process.env.WASOOLI_TEST_OUTPUT||'data/reminders-qa');fs.mkdirSync(out,{recursive:true});
const check=n=>{checks.push(n);console.log('PASS '+n);};
const norm=s=>String(s).replace(/\s+/g,' ').trim();
const GEN=new Set(['id','confirmToken','at','createdAt','updatedAt','updated_at']);
function strip(d){const ids=new Set();const walk=v=>{if(Array.isArray(v))return v.map(walk);if(v&&typeof v==='object'){const o={};for(const k of Object.keys(v).sort()){if(GEN.has(k)){if(k==='id'&&typeof v[k]==='string')ids.add(v[k]);continue;}o[k]=walk(v[k]);}return o;}return v;};
  const c=JSON.parse(JSON.stringify(d||null));if(c&&typeof c==='object'){delete c.name;}const r=walk(c);return JSON.parse(JSON.stringify(r,(k,v)=>typeof v==='string'&&ids.has(v)?'<id>':v));}
const T='2026-11-20';
const tok=id=>('RemTok_'+id+'_abcdefghijklmnop').slice(0,26);
const pay=(id,date,amount,cur)=>({id,date,amount,currency:cur,rate:null,note:''});
const P=(id,pkg,cur,price,start,paid)=>({id,kind:'monthly',cycle:'monthly',name:'',packageId:pkg,currency:cur,start,anchor:start,ownStart:true,prorate:false,prices:[{from:start,price}],payments:paid.map((d,i)=>pay(id+'_p'+i,d,price,cur))});
const on=(day,id,pkg,cur,price)=>P(id||'s1',pkg||'pkg_rc',cur||'PKR',price||4000,'2026-09-'+day,['2026-09-'+day,'2026-10-'+day]);
const U=(name,o,subs)=>Object.assign({name,email:'',phone:'',telegram:'',joinDate:subs[0].start,notes:'',subscriptions:subs},o);
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--disable-gpu']});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await stubWebFonts(ctx,{ui:'tabs'});await ctx.addInitScript(t=>{if(!localStorage.getItem('pt-today'))localStorage.setItem('pt-today',t);},T);
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('dialog',d=>d.dismiss().catch(()=>{}));
  await page.goto(base+'/login',{waitUntil:'domcontentloaded'});await page.locator('[name=passcode]').fill('test1234');await page.locator('button[type=submit]').click();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  const api=async(method,pth,data)=>{const r=await ctx.request.fetch(base+pth,{method,headers:H,data:data===undefined?undefined:JSON.stringify(data)});let j=null;try{j=await r.json();}catch(e){}return {status:r.status(),j};};
  const doc=async p=>((await api('GET','/api/docs/'+p)).j||{}).data;
  const until=async(fn,what)=>{for(let i=0;i<100;i++){if(await fn())return;await page.waitForTimeout(250);}await page.screenshot({path:path.join(out,'timeout.png'),fullPage:true});throw new Error('timed out waiting for '+what);};
  await until(async()=>((await doc('meta/schema'))||{}).version>=12,'the settings repair');
  const st=await doc('settings/main');
  await api('PATCH','/api/docs/settings/main',{publicBaseUrl:base,rate:280,rateEUR:300,packages:st.packages.filter(p=>!/^pkg_r/.test(p.id)).concat([
    {id:'pkg_rc',name:'Claude Pro',cycle:'monthly',price:4000,currency:'PKR',description:'',cycleStart:'2026-09-24'},
    {id:'pkg_rmax',name:'Claude Max Team Annual Workspace',cycle:'monthly',price:22000,currency:'PKR',description:'',cycleStart:'2026-09-24'},
    {id:'pkg_rteam',name:'ChatGPT Team Business Plan',cycle:'monthly',price:9000,currency:'PKR',description:'',cycleStart:'2026-09-24'},
    {id:'pkg_rusd',name:'ChatGPT Plus',cycle:'monthly',price:20,currency:'USD',description:'',cycleStart:'2026-09-24'},
    {id:'pkg_reur',name:'Gemini Advanced',cycle:'monthly',price:15,currency:'EUR',description:'',cycleStart:'2026-09-22'}]),
    wholesalers:[{id:'ws_due',name:'Karim Traders Wholesale Partners',phone:'923331234567',notes:''},{id:'ws_soon',name:'Saima Distributors',phone:'',notes:''}]});
  for(const d of (((await api('GET','/api/docs?prefix=users/')).j||{}).docs||[]))await api('DELETE','/api/docs/'+d.path);
  const ph=n=>'92300100'+String(1000+n);
  const people={
    r_a:U('Aisha Rahman-Qureshi Siddiqui Longname',{phone:ph(1),email:'aisha@example.test',telegram:'aisha_r'},[on(24,'s1'),on(24,'s2','pkg_rmax','PKR',22000),on(24,'s3','pkg_rteam','PKR',9000)]),
    r_b:U('Bilal Ahmed',{phone:ph(2)},[on(24,'s1','pkg_rusd','USD',20)]),
    r_c:U('Chen Email-Only',{email:'chen@example.test'},[on(22,'s1','pkg_reur','EUR',15)]),
    r_d:U('Danish Telegram-Only',{telegram:'danish_tg'},[on(22)]),
    r_e:U('Esha No-Contact',{},[on(21)]),
    r_f:U('Farah Stage-Two',{phone:ph(6)},[on(21,'s1','pkg_rmax','PKR',22000)]),
    r_g:U('Ghazal Stage-Three',{phone:ph(7)},[on(20)]),
    r_h:U('Hamza Final-Day',{phone:ph(8),email:'hamza@example.test'},[on(20,'s1','pkg_rusd','USD',20)]),
    r_i:U('Imran Left-Out',{phone:ph(9),reminders:{'2026-11-24':{reminded:null,confirmed:null,final:null,skipped:'2026-11-19'}}},[on(24)]),
    r_j:U('Javed Overdue',{phone:ph(10)},[P('s1','pkg_rc','PKR',4000,'2026-09-15',['2026-09-15'])]),
    r_k:U('Kiran Overdue Email',{email:'kiran@example.test'},[P('s1','pkg_reur','EUR',15,'2026-09-15',['2026-09-15'])]),
    r_l:U('Laila Continues',{phone:ph(12)},[on(22)]),
    r_m:U('Mehwish Upgrades',{phone:ph(13)},[on(24)]),
    r_n:U('Nadia Stops',{phone:ph(14)},[on(24)]),
    w1:U('Wasim Wholesale One',{wholesalerId:'ws_due'},[P('s1','pkg_rc','PKR',4000,'2026-09-10',['2026-09-10'])]),
    w2:U('Wardah Wholesale Two',{wholesalerId:'ws_due'},[P('s1','pkg_rusd','USD',20,'2026-10-05',[])]),
    w3:U('Waqar Wholesale Three With A Longer Name',{wholesalerId:'ws_due'},[P('s1','pkg_rmax','PKR',22000,'2026-10-12',[]),P('s2','pkg_reur','EUR',15,'2026-10-12',['2026-10-12'])]),
    w4:U('Wajiha Renews Soon',{wholesalerId:'ws_soon'},[P('s1','pkg_rc','PKR',4000,'2026-10-22',['2026-10-22'])])};
  const conflict=()=>{const s=on(24);s.tierHistory=[{from:'2026-11-24',packageId:'pkg_rmax',price:22000,currency:'PKR',note:'Set by hand'}];s.linkConflict={cycle:'2026-11-24',packageId:'pkg_rteam',at:'2026-11-18'};return [s];};
  const stop=()=>({discontinue:{cycleStart:'2026-11-24',at:'2026-11-18T09:30:00.000Z',planIds:[],note:'Too expensive this month'}});
  for(const [c,o,subs] of [['tick',{},()=>[on(24)]],['skip',{},()=>[on(24)]],['keep',{},conflict],['use',{},conflict],['stop',stop(),()=>[on(24)]],['dis',stop(),()=>[on(24)]]]){
    people['o_'+c]=U('Olivia Oldpage ('+c+')',{phone:ph(40),...o},subs());people['n_'+c]=U('Nimra Newpage ('+c+')',{phone:ph(40),...o},subs());}
  const docs={};for(const id of Object.keys(people)){people[id].confirmToken=tok(id);docs['users/'+id]=people[id];}
  assert.equal((await api('POST','/api/import',{docs,replace:[]})).status,200);

  // 0. three answers on the customer link pages: Continue (Laila, bill of Nov 22), an upgrade (Mehwish) and Discontinue (Nadia, Nov 24)
  await page.goto(base+'/',{waitUntil:'domcontentloaded'});await page.waitForSelector('#app-ver',{timeout:30000});
  assert.equal(await page.locator('#app-ver').textContent(),'v85');assert.equal(await page.locator('#tabBar').count(),0);
  for(const id of ['r_l','r_m','r_n'])await until(async()=>{const d=await doc('confirm/'+tok(id));return d&&d.plans&&d.plans.length>0;},'the link page document of '+id);
  const anon=await browser.newContext({viewport:{width:390,height:844}});await stubWebFonts(anon);const cp=await anon.newPage();
  for(const [id,sel] of [['r_l','button[value=continue]'],['r_m','button.choice.switch'],['r_n','button[value=discontinue]']]){await cp.goto(base+'/c/'+tok(id));await cp.locator(sel).first().click();await cp.waitForURL(/done=1/);}
  await anon.close();
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('#app-ver',{timeout:30000});
  await until(async()=>{const l=await doc('users/r_l'),m=await doc('users/r_m'),n=await doc('users/r_n');return ((l.reminders||{})['2026-11-22']||{}).confirmed&&(m.subscriptions[0].tierHistory||[]).some(t=>t.via==='link')&&n.discontinue;},'the three answers applied');
  await page.waitForTimeout(3000);
  check('Three answers given on the customer link pages (continue, upgrade, discontinue) are applied as before: a Confirmed tick, a product chosen on the link from Nov 24, a stop request');

  // 1. the old page (/): the classic Queue, Reminder run and Final notice as drawn on a fresh page (for the identity check), then every step
  /* the links of a row by kind (the customer link inside the message is part of the message text) */
  const kinds=`window.__links=r=>{const kind=h=>/^mailto:/.test(h)?'email':/t\\.me\\//.test(h)?'telegram':/wa\\.me|^whatsapp:|^intent:/.test(h)?'whatsapp':'';const o={};for(const a of r.querySelectorAll('a[href]')){const k=kind(a.getAttribute('href'));if(k){if(o[k]&&o[k]!==a.getAttribute('href'))o[k+'2']=a.getAttribute('href');else o[k]=a.getAttribute('href');}}return o;};`;
  const grab=()=>page.evaluate(k=>{(0,eval)(k);const links=window.__links;const o={dates:[],q:{},ws:[],own:[]};
    for(const sec of document.querySelectorAll('#rr-body .q-cycle[data-cs]')){o.dates.push(sec.dataset.cs);o.q[sec.dataset.cs]=[...sec.querySelectorAll('.qrow[data-user]')].map(r=>Object.assign({id:r.dataset.user,text:r.querySelector('.qmsg').textContent},links(r))).sort((x,y)=>x.id.localeCompare(y.id));}
    o.ws=[...document.querySelectorAll('#rr-body .qrow[data-ws]')].map(r=>Object.assign({ws:r.dataset.ws,key:r.dataset.key,kind:r.dataset.kind,text:r.querySelector('.qmsg').textContent},links(r)));
    o.own=[...document.querySelectorAll('#overdue-sec .rr-row[data-user]')].map(r=>Object.assign({id:r.dataset.user},links(r))).sort((x,y)=>x.id.localeCompare(y.id));return o;},kinds);
  const stage=async(cs,n)=>{await page.locator(`#rr-body .q-cycle[data-cs="${cs}"] .q-stages button[data-stage="${n}"]`).click();await page.waitForTimeout(250);};
  const grabSteps=async()=>{const r={};const d0=await grab();r.auto=d0;for(const n of [1,2,3]){for(const cs of d0.dates)await stage(cs,n);r[n]=await grab();}return r;};
  const grabRun=()=>page.evaluate(k=>{(0,eval)(k);const links=window.__links;return {sub:document.querySelector('#rr-sub').textContent,rows:[...document.querySelectorAll('#rr-body .rr-row[data-user]')].map(r=>Object.assign({id:r.dataset.user,due:r.querySelector('.due').textContent},links(r)))};},kinds);
  const grabFinal=()=>page.evaluate(k=>{(0,eval)(k);const links=window.__links;return {sub:document.querySelector('#rr-sub').textContent,rows:[...document.querySelectorAll('#rr-body table.fn tr[data-user]')].map(r=>Object.assign({id:r.dataset.user,amt:r.querySelector('.amt').textContent,st:r.querySelector('.st').textContent},links(r)))};},kinds);
  const rrHTML=()=>page.locator('#remindRun').evaluate(e=>e.innerHTML.replace(/ style=""/g,''));
  const openClassicQueue=async()=>{await page.locator('#btn-reminders').click();await page.locator('#rr-body').waitFor({state:'visible'});await page.waitForTimeout(400);};
  const classicSet=async()=>{const r={};await openClassicQueue();r.queue=await rrHTML();await page.locator('#rr-tabs [data-tab=run]').click();await page.waitForTimeout(300);r.run=await rrHTML();await page.locator('#rr-tabs [data-tab=final]').click();await page.waitForTimeout(300);r.final=await rrHTML();await page.locator('#rr-tabs [data-tab=queue]').click();await page.waitForTimeout(300);return r;};
  const countIn=sel=>page.evaluate(sel=>{window.scrollTo(0,0);const vh=innerHeight;const vis=e=>{const b=e.getBoundingClientRect();return b.width>0&&b.height>0&&getComputedStyle(e).visibility!=='hidden';};
    const els=[...document.querySelectorAll(sel+' :is(button,a[href],summary,select,input[type=checkbox])')].filter(vis);const isBtn=e=>!e.matches('input');const name=e=>norm(e.getAttribute('aria-label')||e.textContent||e.tagName).slice(0,40);function norm(s){return String(s).replace(/\s+/g,' ').trim();}
    const btns=els.filter(isBtn),first=btns.filter(e=>e.getBoundingClientRect().top<vh);const tally={};for(const e of btns){const k=name(e).replace(/More for .*/,'More (row menu)');tally[k]=(tally[k]||0)+1;}
    return {buttons:btns.length,outsideAnswers:btns.filter(e=>!e.closest('#rq-answers')).length,ticks:els.length-btns.length,firstScreen:first.length,firstNames:first.map(name),tally};},sel);
  const oldCnt=await page.evaluate(()=>{const c=document.querySelector('#rem-cnt');return c.hidden?'':c.textContent;});assert.ok(Number(oldCnt)>=10,'a two-digit Queue count: '+oldCnt);
  const classicOld=await classicSet();assert.ok(classicOld.queue.length>5000&&classicOld.run.length>3000&&classicOld.final.length>2000,'the classic views drawn');
  await page.screenshot({path:path.join(out,'old-queue-390.png'),fullPage:true});
  const oldButtons=await countIn('#remindRun');console.log('Old Queue at 390px, visible controls: '+JSON.stringify(oldButtons));
  const OLD=await grabSteps();
  await page.locator('#rr-tabs [data-tab=run]').click();await page.waitForTimeout(300);await page.locator('#rr-dates [data-rrdate="2026-11-22"]').click();await page.waitForTimeout(300);const runOld=await grabRun();
  await page.locator('#rr-tabs [data-tab=final]').click();await page.waitForTimeout(300);const finalOld=await grabFinal();
  await page.locator('#rr-tabs [data-tab=queue]').click();await page.waitForTimeout(300);
  await page.locator('#rr-body .q-cycle[data-cs="2026-11-24"] details.except summary').click();
  const exceptOld=await page.locator('#rr-body .q-cycle[data-cs="2026-11-24"] .except-list input[data-act=skip]').evaluateAll(b=>b.map(x=>x.dataset.user+':'+x.checked).sort());
  assert.ok(OLD.auto.dates.length>=4,'four cycle dates in a window: '+OLD.auto.dates);assert.ok(runOld.rows.length>=3&&finalOld.rows.length>=3,'run and final lists');

  // 2. the old layout of /new: the Queue, Reminder run and Final notice are identical to /
  const same=(what,h,n)=>{if(h!==n){let i=0;while(i<h.length&&h[i]===n[i])i++;assert.fail(`${what} differ at ${i}: / has "${h.slice(Math.max(0,i-80),i+80)}" and /new has "${n.slice(Math.max(0,i-80),i+80)}"`);}};
  await page.evaluate(()=>localStorage.setItem('pt-layout','classic'));await page.goto(base+'/new',{waitUntil:'domcontentloaded'});await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(3000);
  assert.equal(await page.evaluate(()=>document.body.dataset.ui),'classic');
  {const c=await classicSet();for(const k of ['queue','run','final'])same('classic '+k,classicOld[k],c[k]);}
  check('In the old layout of /new the Queue, the Reminder run and the Final notice are identical, character for character, to the usual page\'s');

  // 3. the new page (/new, tabs): the Reminders tab
  await page.evaluate(()=>localStorage.setItem('pt-layout','tabs'));await page.goto(base+'/new',{waitUntil:'domcontentloaded'});await page.waitForSelector('#tabBar',{timeout:30000});await page.waitForTimeout(3000);
  assert.equal(await page.locator('#app-ver').textContent(),'v85');
  const go=async t=>{await page.locator(`#tabBar [data-go=${t}]`).click();await page.waitForTimeout(300);};
  const shown=sel=>page.locator(sel).first().isVisible();
  const badge=await page.evaluate(()=>{const b=document.querySelector('#tab-rem-cnt'),c=document.querySelector('#rem-cnt');return {b:b.hidden?'':b.textContent,c:c.hidden?'':c.textContent};});
  assert.equal(badge.b,oldCnt);assert.equal(badge.c,oldCnt);
  await go('today');assert.equal(norm(await page.locator('#td-rem').textContent()),`${oldCnt} reminders to send`);
  await page.locator('#td-rem').click();await page.waitForTimeout(400);assert.equal(await page.evaluate(()=>document.body.dataset.tab),'reminders');
  assert.equal(norm(await page.locator('#rq-title').textContent()),'Reminders');assert.equal(norm(await page.locator('#rq-line').textContent()),`${oldCnt} messages to send today`);
  assert.equal(await shown('#rr-tabs'),false,'the old sub-tabs are not shown');assert.equal(await shown('#rr-close'),false);
  check(`The Reminders tab badge and Today's row say ${oldCnt}, the old Queue's count; the tab opens with the title Reminders and "${oldCnt} messages to send today"`);
  await page.screenshot({path:path.join(out,'reminders-390-light.png'),fullPage:true});
  const newButtons=await countIn('#remindRun');console.log('Reminders tab at 390px, visible controls: '+JSON.stringify(newButtons));
  /* the sections, in order, and the step switcher marks today's step */
  const order=await page.locator('#rr-body .rq>.rq-sec').evaluateAll(s=>s.map(x=>x.dataset.cs||x.id));
  assert.deepEqual(order,[...OLD.auto.dates,'ws-sec','overdue-sec','rq-answers'],'section order');
  for(const cs of OLD.auto.dates){const auto=await page.locator(`#rr-body .q-cycle[data-cs="${cs}"] .rq-steps button:has(.rq-today)`).getAttribute('data-stage');
    assert.equal(await page.locator(`#rr-body .q-cycle[data-cs="${cs}"] .rq-steps button[data-stage="${auto}"]`).getAttribute('aria-pressed'),'true');
    assert.equal(norm(await page.locator(`#rr-body .q-cycle[data-cs="${cs}"] .rq-step`).textContent()),`Today: step ${auto} of 3`);}
  {const s=d=>page.locator(`#rr-body .q-cycle[data-cs="${d}"] .rq-steps button:has(.rq-today)`).getAttribute('data-stage');assert.deepEqual([await s('2026-11-20'),await s('2026-11-21'),await s('2026-11-22'),await s('2026-11-24')],['3','2','1','1']);}
  const NEW=await grabSteps();
  for(const k of ['auto',1,2,3]){assert.deepEqual(NEW[k].dates,OLD[k].dates,'dates '+k);
    for(const cs of OLD[k].dates){assert.deepEqual(NEW[k].q[cs],OLD[k].q[cs],`rows of ${cs} at step ${k}`);}
    assert.deepEqual(NEW[k].ws,OLD[k].ws,'wholesaler statements');assert.deepEqual(NEW[k].own,OLD[k].own,'overdue rows');}
  const nRows=k=>Object.values(OLD[k].q).reduce((t,l)=>t+l.length,0);
  assert.ok(nRows(1)>=10&&nRows(2)>=3&&nRows(3)>=3,'rows at each step: '+[nRows(1),nRows(2),nRows(3)]);assert.equal(OLD.auto.ws.length,2);assert.ok(OLD.auto.own.length>=4);
  {const lk=OLD[1].q['2026-11-24'].find(r=>r.id==='r_a');assert.ok(lk.whatsapp&&lk.email&&lk.telegram&&lk.text.includes(base+'/c/'+tok('r_a')),'Aisha has three links and her customer link');}
  check(`For each of the ${OLD.auto.dates.length} cycle dates at today's step and at steps 1, 2 and 3 (${nRows(1)}, ${nRows(2)} and ${nRows(3)} rows), the 2 wholesaler statements and the ${OLD.auto.own.length} overdue rows, the customers listed, the message text (with the customer link) and every WhatsApp, Email and Telegram link are the same on / and on /new; the switcher marks today's step on each date (3, 2, 1, 1) and previewing another step lists what / lists`);
  for(const cs of OLD.auto.dates)await stage(cs,Number(await page.locator(`#rr-body .q-cycle[data-cs="${cs}"] .rq-steps button:has(.rq-today)`).getAttribute('data-stage')));
  /* Reminder run, Final notice and Except for a chosen date, from Tools */
  const tools=async k=>{await page.locator('#rr-body [data-rq=tools]').click();await page.waitForTimeout(250);assert.equal(await page.locator('#cpSheet').evaluate(d=>d.open),true,'Tools opens');await page.locator(`#cpSheet .cpm-item[data-k=${k}]`).click();await page.waitForTimeout(400);};
  const backRq=async()=>{await page.locator('#rr-body [data-rq=back]').click();await page.waitForTimeout(300);assert.equal(await page.locator('#rq-title').count(),1);};
  await tools('run');assert.equal(await shown('#rr-body .rq-back'),true);await page.locator('#rr-dates [data-rrdate="2026-11-22"]').click();await page.waitForTimeout(300);
  assert.deepEqual(await grabRun(),runOld,'Reminder run for Nov 22');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(out,'run-390.png'),fullPage:true});
  await page.locator('#rr-body .rq-howd summary').click();assert.equal(norm(await page.locator('#rr-body .rq-howd p').textContent()),norm(runOld.sub));await backRq();
  await tools('final');assert.deepEqual(await grabFinal(),finalOld,'Final notice for Nov 22');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(out,'final-390.png'),fullPage:true});await backRq();
  await tools('except');const exceptNew=await page.locator('#rr-body .rq-sec[data-cs="2026-11-24"] input[data-act=skip]').evaluateAll(b=>b.map(x=>x.dataset.user+':'+x.checked).sort());
  assert.deepEqual(exceptNew,exceptOld);assert.ok(exceptNew.includes('r_i:true'));await page.screenshot({path:path.join(out,'except-390.png'),fullPage:true});await backRq();
  check(`From Tools: the Reminder run (${runOld.rows.length} rows) and the Final notice (${finalOld.rows.length} rows) for Nov 22 list the same customers, amounts, states and links as on /, with the old explanation under How this works; Leave customers out lists the same ${exceptOld.length} customers for Nov 24 as the old Except list (Imran ticked)`);

  // 4. rows: one main button; a customer without WhatsApp gets Email, then Telegram, then Add phone; the menu
  const R=(id,cs)=>`#rr-body .rq-row[data-user="${id}"][data-cs="${cs}"]`;
  const mainOf=sel=>page.locator(sel+' .rq-acts .rq-go').evaluate(e=>({t:e.textContent.trim(),ch:e.dataset.ch||'',rq:e.dataset.rq||''}));
  assert.deepEqual(await mainOf(R('r_b','2026-11-24')),{t:'WhatsApp',ch:'whatsapp',rq:''});
  assert.deepEqual(await mainOf(R('r_c','2026-11-22')),{t:'Email',ch:'email',rq:''});
  assert.deepEqual(await mainOf(R('r_d','2026-11-22')),{t:'Telegram',ch:'telegram',rq:''});
  await stage('2026-11-21',1);assert.deepEqual(await mainOf(R('r_e','2026-11-21')),{t:'Add phone',ch:'',rq:'addphone'});
  for(const sel of ['#rr-body .rq-row'])assert.equal(await page.locator(sel).evaluateAll(rs=>rs.filter(r=>r.querySelectorAll('.rq-acts>*').length!==2).length),0,'each row has one main button and the menu');
  const sheetOpen=()=>page.locator('#cpSheet').evaluate(d=>d.open);
  const focusIsMore=sel=>page.evaluate(s=>{const r=document.querySelector(s);return !!r&&document.activeElement===r.querySelector('.rq-more');},sel);
  const openMenu=async sel=>{await page.locator(sel+' .rq-more').click();await page.waitForTimeout(250);assert.equal(await sheetOpen(),true,'menu '+sel);};
  await openMenu(R('r_c','2026-11-22'));
  const items=await page.locator('#cpSheet .cps-body .cpm-item').evaluateAll(es=>es.map(e=>e.dataset.k));
  assert.deepEqual(items,['addphone','copy','link','amt','skip','view','cust'],'menu of a customer with email only');
  assert.equal(norm(await page.locator('#cps-title').textContent()),'Chen Email-Only');
  await page.screenshot({path:path.join(out,'menu-390.png')});
  await page.locator('#cps-close').click();await page.waitForTimeout(250);assert.equal(await sheetOpen(),false);assert.equal(await focusIsMore(R('r_c','2026-11-22')),true,'focus back after Close');
  await openMenu(R('r_c','2026-11-22'));await page.keyboard.press('Escape');await page.waitForTimeout(250);assert.equal(await sheetOpen(),false);assert.equal(await focusIsMore(R('r_c','2026-11-22')),true,'focus back after Escape');
  await openMenu(R('r_c','2026-11-22'));await page.mouse.click(195,30);await page.waitForTimeout(250);assert.equal(await sheetOpen(),false,'backdrop closes');assert.equal(await focusIsMore(R('r_c','2026-11-22')),true,'focus back after the backdrop');
  /* Aisha: WhatsApp on the row; Email and Telegram in the menu, with the same links as the row's own */
  await openMenu(R('r_a','2026-11-24'));
  const mlinks=await page.locator('#cpSheet a.cpm-item').evaluateAll(as=>as.map(a=>[a.dataset.k,a.getAttribute('href')]));
  const rowLinks=await page.locator(R('r_a','2026-11-24')+' .rq-x a').evaluateAll(as=>as.map(a=>[a.dataset.rqx,a.getAttribute('href')]));
  assert.deepEqual(mlinks,rowLinks);assert.deepEqual(mlinks.map(x=>x[0]),['email','telegram']);
  assert.equal(mlinks[0][1],OLD[1].q['2026-11-24'].find(r=>r.id==='r_a').email);
  await page.locator('#cpSheet .cpm-item[data-k=view]').click();await page.waitForTimeout(250);
  assert.equal(await page.locator('#cpSheet pre.rq-msg').textContent(),OLD[1].q['2026-11-24'].find(r=>r.id==='r_a').text,'View the message shows the text that is sent');
  await page.screenshot({path:path.join(out,'view-message-390.png')});await page.keyboard.press('Escape');await page.waitForTimeout(250);
  /* a wholesaler: WhatsApp on the row; Copy and Record payment in the menu; the one without a number gets Add phone */
  await openMenu('#rr-body .rq-row[data-ws=ws_due]');assert.deepEqual(await page.locator('#cpSheet .cps-body .cpm-item').evaluateAll(es=>es.map(e=>e.dataset.k)),['copy','pay','view']);
  await page.locator('#cpSheet .cpm-item[data-k=pay]').click();await page.waitForTimeout(400);assert.equal(await page.locator('#wsPayDialog').evaluate(d=>d.open),true,'Record payment opens the wholesaler payment form');
  await page.keyboard.press('Escape');await page.waitForTimeout(300);
  assert.deepEqual(await mainOf('#rr-body .rq-row[data-ws=ws_soon]'),{t:'Add phone',ch:'',rq:''});
  /* Add phone opens Edit details on the customer page */
  await page.locator(R('r_e','2026-11-21')+' [data-rq=addphone]').click();await page.waitForTimeout(600);
  assert.equal(await page.evaluate(()=>document.body.dataset.cust||''),'r_e');assert.equal(await shown('#tbody tr.detail[data-id=r_e] .edit-form [name=phone]'),true,'Edit details with WhatsApp');
  await page.locator('#tbody tr.detail[data-id=r_e] .edit-form [data-act=toggle][data-key=edit]').first().click();await page.waitForTimeout(200);
  await go('reminders');assert.equal(await page.locator('#rq-title').count(),1);
  check('One main button per row: WhatsApp, else Email (Chen), else Telegram (Danish), else Add phone (Esha, opening Edit details); the More menu opens, closes by Close, Escape and the backdrop and gives focus back to its button; its links are the row\'s own (Aisha: email and Telegram); View the message shows the exact text; a wholesaler\'s menu has Copy, Record payment (the wholesaler payment form) and View; a wholesaler without a number gets Add phone');

  // 5. Answers, Tools: Sent log and How this works
  const ans=async id=>norm(await page.locator(`#rq-answers .rq-ans[data-user=${id}]`).innerText());
  assert.match(await ans('r_l'),/Bill of Nov 22: Continues/);assert.match(await ans('r_m'),/Bill of Nov 24: (Upgrade|Move) to /);assert.match(await ans('r_n'),/Stop/);assert.match(await ans('r_n'),/Asked to stop from Nov 24, 2026/);
  assert.equal(await page.locator('#rq-answers .rq-ans[data-user=r_n] [data-act=disc-confirm]').count(),1);assert.equal(await page.locator('#rq-answers .rq-ans[data-user=r_n] [data-act=disc-dismiss]').count(),1);
  assert.match(await ans('n_use'),/Chose ChatGPT Team Business Plan from Nov 24, 2026 on the link/);assert.equal(await page.locator('#rq-answers .rq-ans[data-user=n_use] [data-act=link-use]').count(),1);assert.equal(await page.locator('#rq-answers .rq-ans[data-user=n_use] [data-act=link-keep]').count(),1);
  await page.locator('#rq-answers').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'answers-390.png')});
  await page.locator('#rq-answers .rq-ans[data-user=r_l] [data-rq=cust]').click();await page.waitForTimeout(500);assert.equal(await page.evaluate(()=>document.body.dataset.cust||''),'r_l','the name opens the customer page');
  await go('reminders');
  await tools('how');const how=norm(await page.locator('#cpSheet .rq-how').innerText());assert.match(how,/Tap Sent after sending; the tick is saved per user, stage and cycle\./);assert.match(how,/Wholesalers: one message per wholesaler instead of one per customer/);assert.match(how,/A wholesaler's customers are on the wholesaler statement instead/);
  await page.screenshot({path:path.join(out,'how-390.png')});await page.keyboard.press('Escape');await page.waitForTimeout(250);
  check('Answers from customer links: Laila "Continues", Mehwish\'s new product, Nadia\'s stop request with Confirm and Dismiss, a product chosen on the link that differs from yours with Use their choice and Keep mine; the name opens the customer page; Tools, How this works shows the old explanations in full');

  // 6. the same saves on both pages: Sent (customer, wholesaler), Leave out, Use their choice, Keep mine, Confirm stop, Dismiss
  const ws0=normWs((await doc('settings/main')).wsSent);function normWs(w){return JSON.parse(JSON.stringify(w||{}));}
  const wsKey=OLD.auto.ws.find(r=>r.ws==='ws_due').key;
  /* on /new */
  await page.locator(R('n_tick','2026-11-24')+' input[data-act=qsent]').check();await until(async()=>((await doc('users/n_tick')).reminders||{})['2026-11-24'],'n_tick sent');
  await page.waitForTimeout(500);assert.equal(await page.locator('#rr-body .rq-sentf '+R('n_tick','2026-11-24').replace('#rr-body ','')).count(),1,'a sent row moves under "Sent at this step"');
  await openMenu(R('n_skip','2026-11-24'));await page.locator('#cpSheet .cpm-item[data-k=skip]').click();await until(async()=>((await doc('users/n_skip')).reminders||{})['2026-11-24'],'n_skip left out');
  await page.waitForTimeout(400);
  await page.locator('#rr-body .rq-row[data-ws=ws_due] input[data-act=wssent]').check();await until(async()=>(((await doc('settings/main')).wsSent||{}).ws_due||{})[wsKey],'statement sent on /new');const wsNew=normWs((await doc('settings/main')).wsSent);
  await page.waitForTimeout(400);await page.locator('#ws-sec details.rq-sentf summary').click();await page.locator('#rr-body .rq-row[data-ws=ws_due] input[data-act=wssent]').uncheck();await until(async()=>!(((await doc('settings/main')).wsSent||{}).ws_due),'statement unticked on /new');
  assert.deepEqual(normWs((await doc('settings/main')).wsSent),ws0,'unticking restores the settings');
  await tools('sent');assert.ok(await page.locator('#rr-body .rq-log').count()>=1,'the Sent log lists the tick');assert.match(norm(await page.locator('#rr-body .rq-log').first().innerText()),/Nimra Newpage \(tick\)|Karim/);await page.screenshot({path:path.join(out,'sent-log-390.png'),fullPage:true});await backRq();
  for(const [id,act] of [['n_use','link-use'],['n_keep','link-keep'],['n_stop','disc-confirm'],['n_dis','disc-dismiss']]){
    await page.locator(`#rq-answers .rq-ans[data-user=${id}] [data-act=${act}]`).click();
    await until(async()=>{const u=await doc('users/'+id);return act.startsWith('link')?!u.subscriptions[0].linkConflict:act==='disc-confirm'?!!u.cancel:!u.discontinue;},id+' '+act+' on /new');await page.waitForTimeout(500);}
  /* on / */
  await page.goto(base+'/',{waitUntil:'domcontentloaded'});await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);await openClassicQueue();
  await page.locator('#rr-body .qrow[data-user=o_tick][data-cs="2026-11-24"] input[data-act=qsent]').check();await until(async()=>((await doc('users/o_tick')).reminders||{})['2026-11-24'],'o_tick sent');await page.waitForTimeout(400);
  await page.locator('#rr-body .q-cycle[data-cs="2026-11-24"] details.except summary').click();/* the old popover list overlaps itself on a phone, and a refresh may redraw it: tick the box as drawn now until it is saved */await until(async()=>{await page.evaluate(()=>{const e=document.querySelector('#rr-body .q-cycle[data-cs="2026-11-24"] .except-list input[data-user=o_skip]');if(e&&!e.checked&&!e.disabled)e.click();});await page.waitForTimeout(400);return ((await doc('users/o_skip')).reminders||{})['2026-11-24'];},'o_skip left out');await page.waitForTimeout(400);
  await page.locator('#rr-body .ws-q[data-ws=ws_due] input[data-act=wssent]').check();await until(async()=>(((await doc('settings/main')).wsSent||{}).ws_due||{})[wsKey],'statement sent on /');const wsOld=normWs((await doc('settings/main')).wsSent);
  await page.waitForTimeout(400);await page.locator('#rr-body .ws-q[data-ws=ws_due] input[data-act=wssent]').uncheck();await until(async()=>!(((await doc('settings/main')).wsSent||{}).ws_due),'statement unticked on /');
  await page.locator('#rr-close').click();
  for(const [id,act] of [['o_use','link-use'],['o_keep','link-keep'],['o_stop','disc-confirm'],['o_dis','disc-dismiss']]){
    await page.locator(`#tbody tr.row[data-id=${id}] .nm`).click();await page.waitForTimeout(500);await page.locator(`#tbody tr.detail[data-id=${id}] [data-act=${act}]`).first().click();
    await until(async()=>{const u=await doc('users/'+id);return act.startsWith('link')?!u.subscriptions[0].linkConflict:act==='disc-confirm'?!!u.cancel:!u.discontinue;},id+' '+act+' on /');await page.waitForTimeout(500);
    if(await page.locator(`#tbody tr.detail[data-id=${id}]`).count())await page.locator(`#tbody tr.row[data-id=${id}] .nm`).click();await page.waitForTimeout(300);}
  const cmp=[];for(const c of ['tick','skip','use','keep','stop','dis']){const a=await doc('users/o_'+c),b=await doc('users/n_'+c);assert.deepEqual(strip(b),strip(a),'case '+c+' differs');cmp.push(c);}
  {const t=(await doc('users/o_tick')).reminders['2026-11-24'];assert.equal(t.sent.length,1);assert.equal(t.sent[0].stage,1);assert.equal(t.sent[0].channel,'manual');assert.equal(t.reminded,T);
   assert.equal((await doc('users/o_skip')).reminders['2026-11-24'].skipped,T);assert.equal((await doc('users/o_use')).subscriptions[0].tierHistory[0].packageId,'pkg_rteam');assert.equal((await doc('users/o_keep')).subscriptions[0].tierHistory[0].packageId,'pkg_rmax');
   assert.equal((await doc('users/o_stop')).cancel.lastDay,'2026-11-23');assert.equal((await doc('users/o_dis')).discontinue,null);}
  assert.deepEqual(strip(wsNew),strip(wsOld),'the wholesaler Sent tick');assert.ok(wsOld.ws_due[wsKey].channel==='manual');
  check(`The same documents are stored by / and /new (ids, tokens, timestamps and the name removed) for: a customer's Sent tick (stage 1, Nov 24), Leave out of this round (the menu) and Except (/), Use their choice, Keep mine, Confirm stop (cancelled, last day Nov 23) and Dismiss; a wholesaler's Sent tick stores the same entry in Settings on both pages (${wsKey}) and unticking removes it`);

  // 7. layout: 375 and 390 in light and dark, 1400 in light and dark; no sideways scroll, nothing outside the screen, no amount broken over two lines
  await page.goto(base+'/new',{waitUntil:'domcontentloaded'});await page.waitForSelector('#tabBar',{timeout:30000});await page.waitForTimeout(2500);await go('reminders');
  const layout=async tag=>{const r=await page.evaluate(()=>{const W=innerWidth,R=document.querySelector('#remindRun');const els=[...R.querySelectorAll('*')].filter(e=>{const b=e.getBoundingClientRect();return b.width>0&&b.height>0;});
      const outside=els.filter(e=>{const b=e.getBoundingClientRect();return b.right>W+0.5||b.left<-0.5;}).map(e=>e.className||e.tagName);
      const cut=els.filter(e=>e.matches('button,label,h2,h3,b,summary,.rq-what,.rq-meta')&&e.scrollWidth>e.clientWidth+1&&getComputedStyle(e).overflowX!=='visible').map(e=>e.className||e.tagName);
      const broken=[...R.querySelectorAll('.rq-nw')].filter(e=>e.getClientRects().length>1).map(e=>e.textContent);
      const small=[...R.querySelectorAll('.rq-go,.rq-more,.rq-tick,.rq-steps button,.rq-toolsb')].filter(e=>{const b=e.getBoundingClientRect();return b.width>0&&(b.height<43.5||b.width<43.5);}).map(e=>e.className);
      return {n:els.length,side:document.documentElement.scrollWidth>W,outside,cut,broken,small};});
    assert.ok(r.n>50&&!r.side&&!r.outside.length&&!r.cut.length&&!r.broken.length&&!r.small.length,tag+' '+JSON.stringify(r));};
  await layout('390 light');
  await page.setViewportSize({width:375,height:812});await page.waitForTimeout(300);await layout('375 light');await page.screenshot({path:path.join(out,'reminders-375-light.png'),fullPage:true});
  await page.emulateMedia({colorScheme:'dark'});await page.waitForTimeout(300);await layout('375 dark');await page.screenshot({path:path.join(out,'reminders-375-dark.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);await layout('390 dark');await page.screenshot({path:path.join(out,'reminders-390-dark.png'),fullPage:true});
  await openMenu(R('r_a','2026-11-24'));await page.screenshot({path:path.join(out,'menu-390-dark.png')});await page.keyboard.press('Escape');await page.waitForTimeout(200);
  for(const scheme of ['light','dark']){await page.setViewportSize({width:1400,height:900});await page.emulateMedia({colorScheme:scheme});await page.waitForTimeout(300);await layout('1400 '+scheme);
    const bx=await page.locator('#remindRun').boundingBox();assert.ok(bx.width<=822,'at most 820px wide: '+JSON.stringify(bx));await page.screenshot({path:path.join(out,`reminders-1400-${scheme}.png`),fullPage:true});
    await openMenu(R('r_b','2026-11-24'));const mb=await page.locator('#cpSheet').boundingBox();assert.ok(mb.width<=460,'a small dialog on a computer');await page.keyboard.press('Escape');await page.waitForTimeout(200);}
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({colorScheme:'light'});await page.waitForTimeout(300);
  check('Reminders tab at 375px and 390px in light and dark and at 1400px in light and dark: no sideways scroll, nothing outside the screen, no text cut off, no amount broken over two lines, every main button, menu button, Sent tick and step at least 44px; at most 820px wide on a computer, the menu a small dialog');

  // 8. far fewer buttons than the old Queue
  console.log(`Visible buttons at 390px before any menu: old Queue ${oldButtons.buttons} buttons and links + ${oldButtons.ticks} ticks (${oldButtons.firstScreen} on the first screen); Reminders tab ${newButtons.buttons} + ${newButtons.ticks} ticks (${newButtons.firstScreen} on the first screen: ${newButtons.firstNames.join(' | ')})`);
  console.log('Reminders tab buttons by kind: '+JSON.stringify(newButtons.tally));
  assert.ok(newButtons.buttons<oldButtons.buttons&&newButtons.outsideAnswers*2<=oldButtons.buttons,'far fewer buttons: '+JSON.stringify([newButtons.buttons,newButtons.outsideAnswers,oldButtons.buttons]));
  check(`Visible buttons and links at 390px before any menu is opened: ${newButtons.buttons} on the Reminders tab (${newButtons.outsideAnswers} outside the Answers section, which the old Queue does not have; ${newButtons.firstScreen} on the first screen) against ${oldButtons.buttons} in the old Queue for the same customers; Sent ticks ${newButtons.ticks} against ${oldButtons.ticks}`);

  // 9. empty sections show one quiet line; nothing due today names the next round
  for(const d of (((await api('GET','/api/docs?prefix=users/')).j||{}).docs||[]))await api('DELETE','/api/docs/'+d.path);
  await api('POST','/api/import',{docs:{'users/z1':U('Zara Paid Ahead',{phone:ph(50),confirmToken:tok('z1')},[P('s1','pkg_rc','PKR',4000,'2026-09-28',['2026-09-28','2026-10-28'])])},replace:[]});
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('#tabBar',{timeout:30000});await page.waitForTimeout(2500);await go('reminders');
  assert.equal(norm(await page.locator('#rq-line').textContent()),'Nothing to send today · next round starts Nov 24');
  assert.equal(norm(await page.locator('#ws-sec .rq-empty').textContent()),'No statement to send.');assert.equal(norm(await page.locator('#overdue-sec .rq-empty').textContent()),'Nobody is overdue.');
  assert.equal(await page.locator('#rq-answers').count(),0);assert.equal(norm(await page.locator('#rr-body .q-cycle[data-cs="2026-11-28"] .rq-step').textContent()),'No step today');
  assert.equal(await page.locator('#rr-body .rq p:not(.rq-line):not(.rq-empty):not(.rq-meta):not(.rq-note)').count(),0,'no paragraphs of explanation');
  await page.screenshot({path:path.join(out,'reminders-empty-390.png'),fullPage:true});
  check('With nothing due: "Nothing to send today · next round starts Nov 24", the next date with no step today, Wholesalers "No statement to send.", Overdue "Nobody is overdue.", no Answers section, and no paragraphs of explanation');
  assert.deepEqual(errors,[]);check('No console or page errors');
  fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({version:'85',checks,oldButtons,newButtons},null,2));console.log('reminders-flow: '+checks.length+' checks passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
