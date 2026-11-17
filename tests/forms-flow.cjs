// v84: the Add and Edit forms of the new page (/new, tabs layout) save exactly what the old forms (/) save. Each case is done once on / and once
// on /new (on /new touching only the first-screen fields unless the case says otherwise); both stored documents are fetched through the API and
// must be deep-equal after removing only generated values (ids, confirmToken, timestamps) and the customer name used to tell them apart.
// Also: six fields on the first screen of Add customer, More options opening itself for a refused save, the "N changed" line, drafts kept
// across a poll redraw, each plan-menu entry opening the right Edit plan group, and the layout at 375/390/1400 in light and dark.
// Synthetic records on a disposable server only:
//   WASOOLI_TEST_URL=http://127.0.0.1:<port> node tests/forms-flow.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const stubWebFonts=require('./webfonts.cjs');

const base=process.env.WASOOLI_TEST_URL||'http://127.0.0.1:8098',H={'X-Requested-With':'wasool','Content-Type':'application/json'},checks=[];
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).protocol,'http:');
const out=path.resolve(process.env.WASOOLI_TEST_OUTPUT||'data/forms-qa');fs.mkdirSync(out,{recursive:true});
const check=n=>{checks.push(n);console.log('PASS '+n);};
const norm=s=>String(s).replace(/\s+/g,' ').trim();
const GEN=new Set(['id','confirmToken','at','createdAt','updatedAt','updated_at']);
/* a stored customer without the values that are generated on every save, and without its name */
function strip(d){const ids=new Set();const walk=v=>{if(Array.isArray(v))return v.map(walk);if(v&&typeof v==='object'){const o={};for(const k of Object.keys(v).sort()){if(GEN.has(k)){if(k==='id'&&typeof v[k]==='string')ids.add(v[k]);continue;}o[k]=walk(v[k]);}return o;}return v;};
  const c=JSON.parse(JSON.stringify(d));delete c.name;delete c._path;/* _path: the document path this test adds when it lists customers */const r=walk(c);return JSON.parse(JSON.stringify(r,(k,v)=>typeof v==='string'&&ids.has(v)?'<id>':v));}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--disable-gpu']});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await stubWebFonts(ctx,{ui:'tabs'});await ctx.addInitScript(()=>{if(!localStorage.getItem('pt-today'))localStorage.setItem('pt-today','2026-11-15');});
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(base+'/login',{waitUntil:'domcontentloaded'});await page.locator('[name=passcode]').fill('test1234');await page.locator('button[type=submit]').click();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  const api=async(method,pth,data)=>{const r=await ctx.request.fetch(base+pth,{method,headers:H,data:data===undefined?undefined:JSON.stringify(data)});let j=null;try{j=await r.json();}catch(e){}return {status:r.status(),j};};
  const doc=async p=>((await api('GET','/api/docs/'+p)).j||{}).data;
  const users=async()=>(((await api('GET','/api/docs?prefix=users/')).j||{}).docs||[]).map(d=>Object.assign({_path:d.path},d.data));
  const byName=async nm=>(await users()).find(u=>u.name===nm);
  const until=async(fn,what)=>{for(let i=0;i<80;i++){if(await fn())return;await page.waitForTimeout(250);}await page.screenshot({path:path.join(out,'timeout.png'),fullPage:true});throw new Error('timed out waiting for '+what+' · a-err: '+await page.locator('#a-err').textContent().catch(()=>''));};
  await until(async()=>((await doc('meta/schema'))||{}).version>=12,'the settings repair');
  const st=await doc('settings/main');
  await api('PATCH','/api/docs/settings/main',{packages:st.packages.filter(p=>!/^pkg_t/.test(p.id)).concat([
    {id:'pkg_tlong',name:'Claude Max Team Annual Workspace',cycle:'monthly',price:4200,currency:'PKR',description:'',cycleStart:'2026-09-05',costAmount:20,costCurrency:'USD',costPaidIn:'PKR',costFirst:'prorated30'},
    {id:'pkg_tusd',name:'ChatGPT Plus Business',cycle:'monthly',price:25,currency:'USD',description:'',cycleStart:'2026-10-01'},
    {id:'pkg_tyear',name:'Gemini Advanced Yearly',cycle:'yearly',price:60000,currency:'PKR',description:'',cycleStart:'2026-01-01'},
    {id:'pkg_tfresh',name:'Brand New Product',cycle:'monthly',price:3000,currency:'PKR',description:'',fresh:true}]),
    wholesalers:[{id:'ws_t',name:'Karim Traders Wholesale Partners',phone:'923331234567',notes:''}]});
  for(const d of (((await api('GET','/api/docs?prefix=users/')).j||{}).docs||[]))await api('DELETE','/api/docs/'+d.path);
  /* twins for the customer page cases: the same customer twice, one edited on /, the other on /new */
  const pay=(id,date,amount)=>({id,date,amount,currency:'PKR',note:''});
  const twin=()=>({phone:'923001110001',joinDate:'2026-09-10',notes:'Pays by NayaPay',subscriptions:[{id:'s1',kind:'monthly',cycle:'monthly',name:'',packageId:'pkg_tlong',currency:'PKR',start:'2026-09-10',anchor:'2026-09-10',ownStart:true,prorate:false,prices:[{from:'2026-09-10',price:4200}],payments:[pay('p1','2026-09-10',4200),pay('p2','2026-10-10',4200)]}]});
  const OLD=c=>'Olivia Oldpage-Longname Qureshi ('+c+')',NEW=c=>'Nadia Newpage-Longname Siddiqui ('+c+')',docs={};
  for(const c of ['i','j','k','l','m','z']){docs['users/o_'+c]={...twin(),name:OLD(c)};docs['users/n_'+c]={...twin(),name:NEW(c)};}
  for(let i=1;i<=11;i++)docs['users/f'+i]={...twin(),name:'Filler Customer Number '+i,phone:'92300222'+String(1000+i)};
  assert.equal((await api('POST','/api/import',{docs,replace:[]})).status,200);
  await page.goto(base+'/new',{waitUntil:'domcontentloaded'});await page.waitForSelector('#tabBar',{timeout:30000});await page.waitForTimeout(2000);
  assert.equal(await page.locator('#app-ver').textContent(),'v85');
  const go=async t=>{await page.locator(`#tabBar [data-go=${t}]`).click();await page.waitForTimeout(250);};
  const shown=sel=>page.locator(sel).first().isVisible();
  const noSideScroll=()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);
  const D=id=>`#tbody tr.detail[data-id=${id}]`;
  const sheetOpen=()=>page.locator('#cpSheet').evaluate(d=>d.open);
  const menu=async(sel,key,sub)=>{await page.locator(sel).click();await page.waitForTimeout(250);assert.equal(await sheetOpen(),true,'menu '+sel);await page.locator(`#cpSheet .cpm-item[data-k=${key}]`).click();await page.waitForTimeout(sub?250:450);if(sub){await page.locator(`#cpSheet .cpm-item[data-k=${sub}]`).click();await page.waitForTimeout(450);}};
  const openCust=async id=>{await go('customers');if(await page.evaluate(()=>document.body.dataset.cust||'')){await page.locator('#tbody [data-cp=back]').click();await page.waitForTimeout(400);}
    await page.locator(`#tbody tr.row[data-id=${id}] .nm`).click();await page.waitForTimeout(500);assert.equal(await page.evaluate(()=>document.body.dataset.cust||''),id);};
  const back=async()=>{await page.waitForTimeout(300);await page.locator('#tbody [data-cp=back]').click();await page.waitForTimeout(400);};
  const groups=sel=>page.locator(sel+' .p4-g').evaluateAll(gs=>gs.map(g=>g.dataset.p4g+':'+(g.querySelector('.p4-gb').hidden?0:1)).join(' '));
  const poll=async(tag)=>{const f=await doc('users/f1');await api('POST','/api/import',{docs:{'users/f1':{...f,name:'Filler Polled '+tag}},replace:[]});
    await until(async()=>(await page.evaluate(()=>{const e=document.querySelector('#tbody tr.row[data-id=f1] .nm');return e?e.textContent:'';}))==='Filler Polled '+tag,'the background refresh');await page.waitForTimeout(500);};
  /* layout: no sideways scroll, nothing outside the screen, no label, button text or amount cut off inside its box */
  const layout=async(root,tag)=>{assert.equal(await noSideScroll(),true,'no sideways scroll '+tag);
    const r=await page.evaluate(sel=>{const W=innerWidth,R=document.querySelector(sel);const els=[...R.querySelectorAll('*')].filter(e=>{const b=e.getBoundingClientRect();return b.width>0&&b.height>0;});
      const out=els.filter(e=>{const b=e.getBoundingClientRect();return b.right>W+0.5||b.left<-0.5;}).map(e=>e.id||e.className||e.tagName);
      const cut=els.filter(e=>e.matches('label,button,b,.p4-gs,.p4-note,.cover,.err,legend,h3,h4,p')&&!e.matches('select,input')&&e.scrollWidth>e.clientWidth+1&&getComputedStyle(e).overflowX!=='visible').map(e=>e.id||e.className||e.tagName);
      const wide=els.filter(e=>e.matches('label,button,b,.p4-gs,h3,h4,p')&&e.scrollWidth>e.getBoundingClientRect().width+2).map(e=>(e.id||e.className||e.tagName)+':'+e.textContent.slice(0,30));
      return {n:els.length,out,cut,wide};},root);
    assert.ok(r.n>10&&!r.out.length&&!r.cut.length&&!r.wide.length,tag+' '+JSON.stringify(r));};

  // F1 Add customer: six fields on the first screen, the rest under More options (closed), every old field still in the form exactly once
  await go('customers');await page.locator('#cu-add').click();await page.locator('#addPanel').waitFor({state:'visible'});
  const fs1=await page.evaluate(()=>{const vis=e=>{const b=e.getBoundingClientRect();return b.width>0&&b.height>0;};const first=document.querySelector('#a-first-screen');
    const labels=[...first.querySelectorAll('label.f')].filter(l=>vis(l)&&l.querySelector('input,select'));
    const ctl=[...document.querySelectorAll('#addForm input,#addForm select,#addForm textarea')].filter(e=>vis(e)&&e.type!=='radio'&&!document.querySelector('#a-opts-body').contains(e));
    return {labels:labels.map(l=>l.firstChild.textContent.trim()||l.textContent.trim().split(/\s{2,}/)[0]),ctl:ctl.map(e=>e.id),more:document.querySelector('#a-opts-body').hidden};});
  console.log('Add customer, first screen: '+JSON.stringify(fs1));
  assert.deepEqual(fs1.ctl,['a-name','a-cc','a-phone','a-pkg','a-price','a-start','a-ws'],JSON.stringify(fs1));assert.equal(fs1.labels.length,6,JSON.stringify(fs1));assert.equal(fs1.more,true);
  for(const id of ['a-name','a-email','a-cc','a-phone','a-tg','a-ws','a-notes','a-pkg','a-start','a-price','a-cur','a-cycle','a-join','a-payment','a-plan','a-due','a-prorate','a-waive','a-own','a-bill-preview','a-paid-yes','a-paid-hint','a-again','a-err','a-account-cost'])
    assert.equal(await page.locator('#addForm #'+id).count(),1,id+' once in the form');
  for(const id of ['a-email','a-tg','a-notes','a-join','a-cur','a-cycle','a-plan','a-prorate','a-waive','a-own'])assert.equal(await page.locator('#a-opts-body #'+id).count(),1,id+' under More options'),assert.equal(await shown('#'+id),false,id+' folded');
  assert.equal(await page.locator('#addForm input[name=a-paid]').count(),3);assert.equal(await page.locator('#addForm fieldset.add-grp :is(input,select,textarea)').count(),0,'nothing left in the old groups');
  assert.equal(norm(await page.locator('#a-opts-btn').innerText()),'More options Email, Telegram, notes, joined on, billing, currency, renewal day, proration, your cost');
  await page.screenshot({path:path.join(out,'add-390-light.png'),fullPage:true});await layout('#addPanel','add 390 light first screen');
  check(`Add customer shows ${fs1.labels.length} fields before More options (Name, WhatsApp with its country code, Product, Price, Starts on, Sold through), then "Have they paid the first bill?" and More options, closed; every field of the old form is still in it, once`);

  // F2 the "N changed" line, and More options opening itself for a refused save (the field is focused, the message shows)
  await page.locator('#a-opts-btn').click();assert.equal(await shown('#a-email'),true);await page.locator('#a-email').fill('not-an-email');await page.locator('#a-notes').fill('Pays by NayaPay');await page.locator('#a-opts-btn').click();
  assert.equal(norm(await page.locator('#a-opts-btn b').innerText()),'More options · 2 changed');assert.equal(norm(await page.locator('#a-opts .p4-gs').innerText()),'Changed: email, notes');
  await page.screenshot({path:path.join(out,'add-changed-390-light.png')});
  await page.locator('#a-name').fill('Refused Save Customer');await page.locator('#a-start').fill('2026-11-15');await page.locator('#addForm button[type=submit]').click();await page.waitForTimeout(500);
  assert.equal(norm(await page.locator('#a-err').textContent()),'That email does not look valid.');assert.equal(await shown('#a-email'),true,'More options opened itself');assert.equal(await page.evaluate(()=>document.activeElement&&document.activeElement.id),'a-email');
  assert.equal(await byName('Refused Save Customer'),undefined);
  await page.locator('#a-email').fill('');await page.locator('#a-notes').fill('');assert.equal(norm(await page.locator('#a-opts-btn b').innerText()),'More options');
  /* a cycle that does not match the product (chosen under More options) */
  await page.locator('#a-pkg').selectOption('pkg_tyear');await page.locator('#a-cycle').selectOption('monthly');await page.locator('#a-opts-btn').click();assert.equal(await shown('#a-cycle'),false);
  assert.equal(norm(await page.locator('#a-opts-btn b').innerText()),'More options · 1 changed');
  await page.locator('#addForm button[type=submit]').click();await page.waitForTimeout(500);
  assert.match(norm(await page.locator('#a-err').textContent()),/is a yearly package, so Billing cycle must be Yearly/);assert.equal(await shown('#a-cycle'),true);assert.equal(await page.evaluate(()=>document.activeElement&&document.activeElement.id),'a-cycle');
  await page.locator('#a-cycle').selectOption('yearly');await page.locator('#a-opts-btn').click();
  /* the first-sale question of a brand-new product is a required choice: it shows on the first screen, More options stays closed */
  await page.locator('#a-pkg').selectOption('pkg_tfresh');assert.equal(await shown('#a-first [data-role=first-sale]'),true);assert.equal(await page.locator('#a-first-screen #a-first').count(),1);assert.equal(await shown('#a-email'),false);
  await page.locator('#addForm button[type=submit]').click();await page.waitForTimeout(500);
  assert.match(norm(await page.locator('#a-err').textContent()),/first customer for a new product/);assert.equal(await shown('#a-email'),false,'More options stays closed');assert.equal(await page.evaluate(()=>document.activeElement&&document.activeElement.name),'a-first');
  await page.locator('#add-close').click();await page.waitForTimeout(200);
  check('Typing an email and notes under More options and closing it reads "More options · 2 changed" / "Changed: email, notes"; Save with a wrong email opens More options, focuses Email and shows "That email does not look valid." (nothing saved); a monthly cycle for a yearly product does the same for Billing; the first-sale question of a new product shows on the first screen and is focused, More options stays closed');

  // F3 a draft survives a poll redraw: Add customer with More options open, and Add a plan on the customer page with More options open
  await page.locator('#cu-add').click();await page.locator('#addPanel').waitFor({state:'visible'});await page.locator('#a-name').fill('Draft Keeper Customer');await page.locator('#a-opts-btn').click();await page.locator('#a-tg').fill('@draftkeeper');
  await poll('1');assert.equal(await page.locator('#a-name').inputValue(),'Draft Keeper Customer');assert.equal(await page.locator('#a-tg').inputValue(),'@draftkeeper');assert.equal(await shown('#a-tg'),true,'More options still open');
  await page.locator('#a-tg').fill('');await page.locator('#a-name').fill('');await page.locator('#add-close').click();
  await openCust('n_z');await menu(D('n_z')+' [data-cp=cmenu]','add');const AS=D('n_z')+' .addsub-form';
  assert.equal(await groups(AS),'more:0');assert.equal(await shown(AS+' [name=packageId]'),true);assert.equal(await shown(AS+' [name=price]'),true);assert.equal(await shown(AS+' [name=date]'),true);assert.equal(await shown(AS+' [name=kind]'),false);
  await page.locator(AS+' [name=price]').fill('4321');await page.locator(AS+' [data-p4t=more]').click();await page.waitForTimeout(300);await page.locator(AS+' [name=name]').fill('Second seat');
  const y1=await page.evaluate(()=>scrollY);await poll('2');
  assert.equal(await page.locator(AS+' [name=price]').inputValue(),'4321');assert.equal(await page.locator(AS+' [name=name]').inputValue(),'Second seat');assert.equal(await groups(AS),'more:1');assert.ok(Math.abs(await page.evaluate(()=>scrollY)-y1)<3,'scroll kept');
  assert.equal(norm(await page.locator(AS+' .p4-more b').innerText()),'More options · 1 changed');
  await page.locator(AS+' [data-act=toggle][data-key=addsub]').click();await page.waitForTimeout(300);
  check('A background refresh keeps Add customer\'s typed name, the Telegram typed under More options and More options open; on the customer page, Add a plan keeps its price, the label typed under More options, More options open ("More options · 1 changed") and the scroll position');

  // F4 the plan menu opens Edit plan on the right group; a refused save opens the group holding the field
  const SE=D('n_z')+' .subedit-form[data-sub=s1]',pm=D('n_z')+' [data-cp=pmenu][data-sub=s1]';
  await menu(pm,'dates','renew');assert.equal(await groups(SE),'price:0 dates:1 adv:0');assert.equal(await shown(SE+' [name=end]'),true);assert.equal(await shown(SE+' [name=discType]'),false);
  await page.screenshot({path:path.join(out,'editplan-dates-390-light.png'),fullPage:true});
  await page.locator(SE+' [name=end]').fill('2027-01-09');await poll('3');assert.equal(await page.locator(SE+' [name=end]').inputValue(),'2027-01-09');assert.equal(await groups(SE),'price:0 dates:1 adv:0');
  assert.equal(norm(await page.locator(SE+' [data-p4g=dates] b').innerText()),'Dates · 1 changed');
  await page.locator(SE+' [data-act=toggle][data-key="edit:s1"]').first().click();await page.waitForTimeout(300);
  await menu(pm,'product','cost');assert.equal(await groups(SE),'price:0 dates:0 adv:1');assert.equal(await shown(SE+' .account-cost-fields'),true);await page.locator(SE+' [data-act=toggle][data-key="edit:s1"]').first().click();await page.waitForTimeout(300);
  await menu(pm,'product','pkg');assert.equal(await groups(SE),'price:0 dates:0 adv:1');assert.equal(await shown(SE+' [name=packageId]'),true);await page.locator(SE+' [data-act=toggle][data-key="edit:s1"]').first().click();await page.waitForTimeout(300);
  await menu(pm,'advanced');assert.equal(await groups(SE),'price:1 dates:1 adv:1');
  const placed=await page.locator(SE).evaluate(f=>{const o={};for(const el of f.querySelectorAll('input,select,textarea')){if(!el.name)continue;const g=el.closest('.p4-g');o[el.name]=g?g.dataset.p4g:'none';}return o;});
  console.log('Edit plan groups: '+JSON.stringify(placed));
  assert.deepEqual(Object.entries(placed).filter(([n,g])=>g==='none'),[]);
  for(const [n,g] of [['currency','price'],['cycle','price'],['chgPrice','price'],['chgFrom','price'],['discType','price'],['discValue','price'],['start','dates'],['end','dates'],['dueBy','dates'],['renewOn','dates'],['renewDate','dates'],['packageId','adv'],['name','adv'],['basis','adv'],['prorate','adv'],['waiveFirst','adv'],['accountCostMode','adv']])assert.equal(placed[n],g,n);
  await page.screenshot({path:path.join(out,'editplan-all-390-light.png'),fullPage:true});
  await layout(D('n_z'),'edit plan 390 light');
  /* a percent discount with no value: the message (a toast) is about a field under Price, which opens again with the field focused */
  await page.locator(SE+' [name=discType]').selectOption('percent');await page.locator(SE+' [data-p4t=price]').click();await page.waitForTimeout(300);assert.equal(await groups(SE),'price:0 dates:1 adv:1');
  await page.locator(SE+' button[type=submit]').click();await page.waitForTimeout(700);
  assert.equal(await groups(SE),'price:1 dates:1 adv:1');assert.equal(await page.evaluate(()=>document.activeElement&&document.activeElement.name),'discValue');
  assert.ok(await page.locator('.toast').filter({hasText:'Enter the discount value'}).count()>=1);
  await page.locator(SE+' [data-act=toggle][data-key="edit:s1"]').first().click();await page.waitForTimeout(300);
  assert.deepEqual(strip(await doc('users/n_z')),strip(await doc('users/o_z')),'nothing was saved');
  check('Plan dates → Renews on and end date opens Edit plan with only Dates open (a typed end date and the open group survive a refresh, "Dates · 1 changed"); Your cost and Product of every bill open Advanced; Advanced opens all three; every field is in exactly one group (Price: currency, cycle, new price and date, discount; Dates: start, end, remaining due by, renews on, its date; Advanced: product, label, proration basis, prorate, waive, supplier cost); a discount without a value opens Price again with the value focused and saves nothing');

  // F5 Edit details: contact first, plan start dates and costs folded; a refused save about a plan start opens that section
  const ED=D('n_z')+' .edit-form';await menu(D('n_z')+' [data-cp=cmenu]','edit');
  assert.deepEqual(await page.locator(ED+' [data-role=contact] label.f').evaluateAll(ls=>ls.map(l=>l.querySelector('input,select').name)),['name','cc','email','telegram','joinDate','notes','wholesalerId']);
  assert.equal(await groups(ED),'plans:0');assert.equal(await shown(ED+' [name="productStart:s1"]'),false);
  await page.locator(ED+' [data-p4t=plans]').click();await page.waitForTimeout(300);await page.locator(ED+' [name="productStart:s1"]').fill('');await page.locator(ED+' [data-p4t=plans]').click();await page.waitForTimeout(300);
  assert.equal(norm(await page.locator(ED+' [data-p4g=plans] b').innerText()),'Plan start dates and costs · 1 changed');
  await page.locator(ED+' button[type=submit]').click();await page.waitForTimeout(700);
  assert.equal(await groups(ED),'plans:1');assert.equal(await page.evaluate(()=>document.activeElement&&document.activeElement.name),'productStart:s1');assert.match(norm(await page.locator(ED+' [data-role=edit-err]').textContent()),/start date/i);
  await page.screenshot({path:path.join(out,'editdetails-390-light.png'),fullPage:true});await layout(D('n_z'),'edit details 390 light');
  await page.locator(ED+' [data-act=toggle][data-key=edit]').first().click();await page.waitForTimeout(300);
  assert.deepEqual(strip(await doc('users/n_z')),strip(await doc('users/o_z')),'nothing was saved');await back();
  check('Edit details lists Name, WhatsApp, Email, Telegram, Joined on and Notes first and folds "Plan start dates and costs"; clearing a plan\'s start date there and saving opens that section again, focuses the date and shows the message; nothing is saved');

  // F6 the equivalence cases. On / (old form) first, then on /new.
  const ADD=[
    {c:'a',pkg:'pkg_tlong',start:'2026-11-12',paid:'yes'},
    {c:'b',pkg:'pkg_tlong',start:'2026-11-12',paid:'no'},
    {c:'c',pkg:'pkg_tlong',ws:'ws_t',start:'2026-11-03',paid:'no'},
    {c:'d',pkg:'pkg_tyear',start:'2026-11-10',paid:'yes'},
    {c:'e',pkg:'pkg_tusd',start:'2026-11-14',paid:'yes'},
    {c:'f',pkg:'pkg_tlong',price:'15000',cycle:'one-time',start:'2026-11-15',paid:'no'},
    {c:'h',pkg:'pkg_tusd',start:'2026-11-08',paid:'no',again:true},
  ];
  const openAddOld=async()=>{if(await page.locator('#addPanel').isHidden())await page.locator('#btn-add').click();await page.locator('#addPanel').waitFor({state:'visible'});};
  const openAddNew=async()=>{await go('customers');if(await page.evaluate(()=>!!document.body.dataset.cust))await back();if(await page.locator('#addPanel').isHidden())await page.locator('#cu-add').click();await page.locator('#addPanel').waitFor({state:'visible'});};
  const fillAdd=async(side,o,name)=>{await page.locator('#a-name').fill(name);await page.locator('#a-phone').fill('300 5550188');
    await page.locator('#a-pkg').selectOption(o.pkg);if(o.ws)await page.locator('#a-ws').selectOption(o.ws);if(o.first)await page.locator(`#a-first input[value=${o.first}]`).check();
    if(o.price)await page.locator('#a-price').fill(o.price);await page.locator('#a-start').fill(o.start);
    if(o.cycle){if(side==='new'){await page.locator('#a-opts-btn').click();assert.equal(await shown('#a-cycle'),true);}await page.locator('#a-cycle').selectOption(o.cycle);}
    await page.locator(`#addForm input[name=a-paid][value=${o.paid}]`).check();};
  const saved=async(name,paid)=>until(async()=>{const u=await byName(name);return u&&(paid!=='yes'||(u.subscriptions[0].payments||[]).length>0);},name+' saved');
  const addSide=async(side,nm)=>{for(const o of ADD){const name=nm(o.c);side==='old'?await openAddOld():await openAddNew();await fillAdd(side,o,name);
      if(o.again){await page.locator('#a-again').click();await saved(name,o.paid);assert.equal(await page.locator('#addPanel').isVisible(),true);
        await until(async()=>(await page.locator('#a-name').inputValue())==='','the form cleared for the next customer');
        const n2=nm('h2');await page.locator('#a-name').fill(n2);await page.locator('#addForm input[name=a-paid][value=no]').check();await page.locator('#addForm button[type=submit]').click();await saved(n2,'no');}
      else{await page.locator('#addForm button[type=submit]').click();await saved(name,o.paid);}
      await page.waitForTimeout(300);if(await page.locator('#paymentDialog').evaluate(d=>d.open))throw new Error('payment box opened for '+name);}};
  /* (g) a brand-new product: the first-sale question; the customer saved on / is removed before /new so the product is new again */
  const G={c:'g',pkg:'pkg_tfresh',first:'tracking',start:'2026-11-11',paid:'no'};
  await page.goto(base+'/',{waitUntil:'domcontentloaded'});await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2000);assert.equal(await page.locator('#tabBar').count(),0);
  await openAddOld();await fillAdd('old',G,OLD('g'));await page.locator('#addForm button[type=submit]').click();await saved(OLD('g'),'no');const gOld=await byName(OLD('g'));
  await addSide('old',OLD);
  /* (i) Add a plan, (j) end date, (k) currency from a later cycle, (l) renews on a chosen date, (m) WhatsApp and notes: on / in the old details */
  const openOld=async id=>{await page.locator(`#tbody tr.row[data-id=${id}] .nm`).click();await page.waitForTimeout(500);assert.equal(await page.locator(D(id)).count(),1);};
  const closeOld=async id=>{await page.locator(`#tbody tr.row[data-id=${id}] .nm`).click();await page.waitForTimeout(300);};
  const OSE=id=>D(id)+' .subedit-form[data-sub=s1]';
  await openOld('o_i');await page.locator(D('o_i')+' [data-act=toggle][data-key=addsub]').first().click();await page.waitForTimeout(300);
  {const f=D('o_i')+' .addsub-form';await page.locator(f+' [name=packageId]').selectOption('pkg_tusd');await page.locator(f+' [name=date]').fill('2026-11-10');await page.locator(f+' button[type=submit]').click();}
  await until(async()=>(await doc('users/o_i')).subscriptions.length===2,'(i) on /');await closeOld('o_i');
  await openOld('o_j');await page.locator(D('o_j')+' .sub-acts [data-act=toggle][data-key="edit:s1"]').click();await page.waitForTimeout(300);await page.locator(OSE('o_j')+' [name=end]').fill('2027-01-09');await page.locator(OSE('o_j')+' button[type=submit]').click();
  await until(async()=>(await doc('users/o_j')).subscriptions[0].end==='2027-01-09','(j) on /');await closeOld('o_j');
  await openOld('o_k');await page.locator(D('o_k')+' .sub-acts [data-act=toggle][data-key="edit:s1"]').click();await page.waitForTimeout(300);await page.locator(OSE('o_k')+' [name=currency]').selectOption('USD');await page.waitForTimeout(200);
  const kFrom=await page.locator(OSE('o_k')+' [name=chgFrom]').inputValue();await page.locator(OSE('o_k')+' [name=chgPrice]').fill('15');await page.locator(OSE('o_k')+' button[type=submit]').click();
  await until(async()=>(await doc('users/o_k')).subscriptions.length===2,'(k) on /');await closeOld('o_k');
  await openOld('o_l');await page.locator(D('o_l')+' .sub-acts [data-act=toggle][data-key="edit:s1"]').click();await page.waitForTimeout(300);await page.locator(OSE('o_l')+' [name=renewOn]').selectOption('date');await page.locator(OSE('o_l')+' [name=renewDate]').fill('2026-11-20');await page.locator(OSE('o_l')+' button[type=submit]').click();
  await until(async()=>(await doc('users/o_l')).subscriptions[0].ownDate===true,'(l) on /');await closeOld('o_l');
  await openOld('o_m');await page.locator(D('o_m')+' .detail-acts [data-act=toggle][data-key=edit]').click();await page.waitForTimeout(300);
  {const f=D('o_m')+' .edit-form',t=page.locator(f+' [data-act=toggle-contact]');if((await t.getAttribute('aria-expanded'))!=='true')await t.click();await page.locator(f+' [name=phone]').fill('300 9998887');await page.locator(f+' [name=notes]').fill('Pays by bank transfer from December');await page.locator(f+' button[type=submit]').click();}
  await until(async()=>(await doc('users/o_m')).notes==='Pays by bank transfer from December','(m) on /');await closeOld('o_m');
  /* (n) Add several: three pasted lines */
  const lines=s=>[`Rehan Studio ${s}, @rehanstudio, Claude Max Team Annual Workspace, 4300`,`Mint Labs ${s}, ChatGPT Plus Business, $26 paid`,`Zoya Farooq-Siddiqui ${s}, joined 2026-11-01, Gemini Advanced Yearly`].join('\n');
  const quick=async s=>{await page.locator('#qa-text').fill(lines(s));await page.locator('#qa-parse').click();await page.locator('#qa-review').waitFor({state:'visible'});assert.equal(norm(await page.locator('#qa-save').textContent()),'Add 3 users');await page.locator('#qa-save').click();
    await until(async()=>{const us=await users();return ['Rehan Studio','Mint Labs','Zoya Farooq-Siddiqui'].every(n=>us.some(u=>u.name===n+' '+s));},'three quick adds '+s);};
  await page.locator('#btn-quick').click();await page.locator('#quickPanel').waitFor({state:'visible'});await quick('Oldpage');
  /* now /new: the brand-new product first (after removing the customer / saved), then the same cases */
  await api('DELETE','/api/docs/'+gOld._path);
  await page.goto(base+'/new',{waitUntil:'domcontentloaded'});await page.waitForSelector('#tabBar',{timeout:30000});await page.waitForTimeout(2000);
  await openAddNew();await fillAdd('new',G,NEW('g'));assert.equal(await shown('#a-email'),false,'More options closed');await page.locator('#addForm button[type=submit]').click();await saved(NEW('g'),'no');
  await addSide('new',NEW);
  await openCust('n_i');await menu(D('n_i')+' [data-cp=cmenu]','add');{const f=D('n_i')+' .addsub-form';await page.locator(f+' [name=packageId]').selectOption('pkg_tusd');await page.locator(f+' [name=date]').fill('2026-11-10');assert.equal(await shown(f+' [name=kind]'),false);await page.locator(f+' button[type=submit]').click();}
  await until(async()=>(await doc('users/n_i')).subscriptions.length===2,'(i) on /new');
  await openCust('n_j');await menu(D('n_j')+' [data-cp=pmenu][data-sub=s1]','dates','renew');await page.locator(D('n_j')+' .subedit-form [name=end]').fill('2027-01-09');await page.locator(D('n_j')+' .subedit-form button[type=submit]').click();
  await until(async()=>(await doc('users/n_j')).subscriptions[0].end==='2027-01-09','(j) on /new');
  await openCust('n_k');await menu(D('n_k')+' [data-cp=pmenu][data-sub=s1]','dates','renew');await page.locator(D('n_k')+' .subedit-form [data-p4t=price]').click();await page.waitForTimeout(300);
  await page.locator(D('n_k')+' .subedit-form [name=currency]').selectOption('USD');await page.waitForTimeout(200);assert.equal(await shown(D('n_k')+' .subedit-form [name=chgPrice]'),true);assert.equal(await page.locator(D('n_k')+' .subedit-form [name=chgFrom]').inputValue(),kFrom);
  await page.screenshot({path:path.join(out,'editplan-currency-390-light.png'),fullPage:true});
  await page.locator(D('n_k')+' .subedit-form [name=chgPrice]').fill('15');await page.locator(D('n_k')+' .subedit-form button[type=submit]').click();
  await until(async()=>(await doc('users/n_k')).subscriptions.length===2,'(k) on /new');
  await openCust('n_l');await menu(D('n_l')+' [data-cp=pmenu][data-sub=s1]','dates','renew');await page.locator(D('n_l')+' .subedit-form [name=renewOn]').selectOption('date');await page.locator(D('n_l')+' .subedit-form [name=renewDate]').fill('2026-11-20');await page.locator(D('n_l')+' .subedit-form button[type=submit]').click();
  await until(async()=>(await doc('users/n_l')).subscriptions[0].ownDate===true,'(l) on /new');
  await openCust('n_m');await menu(D('n_m')+' [data-cp=cmenu]','edit');await page.locator(D('n_m')+' .edit-form [name=phone]').fill('300 9998887');await page.locator(D('n_m')+' .edit-form [name=notes]').fill('Pays by bank transfer from December');await page.locator(D('n_m')+' .edit-form button[type=submit]').click();
  await until(async()=>(await doc('users/n_m')).notes==='Pays by bank transfer from December','(m) on /new');await back();
  await go('customers');await page.locator('#cu-add').click();await page.locator('#add-several').click();await page.locator('#quickPanel').waitFor({state:'visible'});
  assert.equal(norm(await page.locator('#quickPanel .panel-head h3').textContent()),'Add several');
  await page.locator('#qa-text').fill(lines('Newpage'));await page.locator('#qa-parse').click();await page.locator('#qa-review').waitFor({state:'visible'});
  await layout('#quickPanel','add several 390 light');await page.screenshot({path:path.join(out,'addseveral-390-light.png'),fullPage:true});
  await page.locator('#qa-save').click();await until(async()=>{const us=await users();return ['Rehan Studio','Mint Labs','Zoya Farooq-Siddiqui'].every(n=>us.some(u=>u.name===n+' Newpage'));},'three quick adds on /new');
  /* compare */
  const pairs=[];for(const o of ADD)pairs.push([o.c,OLD(o.c),NEW(o.c)]);pairs.push(['h (second customer)',OLD('h2'),NEW('h2')]);
  const res=[];const cmp=(c,a,b)=>{assert.ok(a&&b,'both saved: '+c);const x=strip(a),y=strip(b);assert.deepEqual(y,x,'case '+c+' differs');res.push(c);};
  cmp('g',gOld,await byName(NEW('g')));
  for(const [c,o,n] of pairs)cmp(c,await byName(o),await byName(n));
  for(const c of ['i','j','k','l','m'])cmp(c,await doc('users/o_'+c),await doc('users/n_'+c));
  for(const n of ['Rehan Studio','Mint Labs','Zoya Farooq-Siddiqui'])cmp('n: '+n,await byName(n+' Oldpage'),await byName(n+' Newpage'));
  {const a=await byName(OLD('a'));assert.ok(a.subscriptions[0].payments.length>0&&a.subscriptions[0].accountCost,'(a) has its first payment and the product seat cost');
   const c=await byName(OLD('c'));assert.equal(c.wholesalerId,'ws_t');assert.equal(c.subscriptions[0].prorate,false);const f=await byName(OLD('f'));assert.equal(f.subscriptions[0].kind,'one-time');
   const k=await doc('users/o_k');assert.equal(k.subscriptions[1].currency,'USD');const g=await byName(NEW('g'));assert.equal(g.subscriptions[0].anchor,'2026-11-11');}
  console.log('equal cases: '+res.join(', '));
  check(`Saved on / and on /new, the stored customers are equal (ids, tokens, timestamps and the name removed) in every case: (a) direct monthly, paid; (b) not paid; (c) a wholesaler's customer; (d) a yearly product; (e) a USD product; (f) a one-time sale chosen under More options; (g) a brand-new product with the first-sale question; (h) Save and add another, both customers; (i) Add a plan; (j) Edit plan end date; (k) the currency from a later cycle start (${kFrom}); (l) renews on a chosen date; (m) WhatsApp and notes; (n) three pasted lines in Add several`);

  // F7 layout: Add customer at 375 and 390 in light and dark (More options open and closed), Add a plan and Edit plan, 1400 light and dark
  const addLayout=async tag=>{await openAddNew();await layout('#addPanel',tag+' closed');await page.locator('#a-opts-btn').click();await layout('#addPanel',tag+' open');await page.screenshot({path:path.join(out,'add-'+tag.replace(/ /g,'-')+'.png'),fullPage:true});await page.locator('#a-opts-btn').click();};
  await openAddNew();await page.locator('#a-pkg').selectOption('pkg_tlong');await page.locator('#a-ws').selectOption('ws_t');await page.locator('#a-price').fill('4200');
  await addLayout('390 light');
  await page.setViewportSize({width:375,height:812});await page.waitForTimeout(250);await addLayout('375 light');
  await page.emulateMedia({colorScheme:'dark'});await page.waitForTimeout(200);await addLayout('375 dark');
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(250);await addLayout('390 dark');
  await openCust('n_z');await menu(D('n_z')+' [data-cp=pmenu][data-sub=s1]','advanced');await layout(D('n_z'),'edit plan 390 dark');await page.screenshot({path:path.join(out,'editplan-390-dark.png'),fullPage:true});
  await page.locator(D('n_z')+' .subedit-form [data-act=toggle][data-key="edit:s1"]').first().click();await page.waitForTimeout(300);
  await menu(D('n_z')+' [data-cp=cmenu]','add');await page.locator(D('n_z')+' .addsub-form [data-p4t=more]').click();await page.waitForTimeout(300);await layout(D('n_z'),'add a plan 390 dark');await page.screenshot({path:path.join(out,'addplan-390-dark.png'),fullPage:true});
  await page.locator(D('n_z')+' .addsub-form [data-act=toggle][data-key=addsub]').click();await page.waitForTimeout(300);await back();
  for(const scheme of ['light','dark']){await page.setViewportSize({width:1400,height:900});await page.emulateMedia({colorScheme:scheme});await page.waitForTimeout(250);
    await openAddNew();await page.locator('#a-opts-btn').click();await layout('#addPanel','1400 '+scheme);const bx=await page.locator('#addForm').boundingBox();assert.ok(bx.width<=640,'Add customer at most 640px: '+JSON.stringify(bx));
    await page.screenshot({path:path.join(out,`add-1400-${scheme}.png`),fullPage:true});await page.locator('#a-opts-btn').click();await page.locator('#add-close').click();
    await openCust('n_z');await menu(D('n_z')+' [data-cp=pmenu][data-sub=s1]','advanced');await layout(D('n_z'),'edit plan 1400 '+scheme);const eb=await page.locator(D('n_z')+' .subedit-form').boundingBox();assert.ok(eb.width<=640,'Edit plan at most 640px: '+JSON.stringify(eb));
    await page.screenshot({path:path.join(out,`editplan-1400-${scheme}.png`),fullPage:true});await page.locator(D('n_z')+' .subedit-form [data-act=toggle][data-key="edit:s1"]').first().click();await page.waitForTimeout(300);await back();}
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({colorScheme:'light'});
  check('Add customer (More options open and closed) at 375px and 390px in light and dark, Edit plan with every group open and Add a plan with More options open at 390px dark, Add several at 390px, and Add customer and Edit plan at 1400px in light and dark: no sideways scroll, nothing outside the screen, no label or button text cut off; on a computer each form is at most 640px wide');
  assert.deepEqual(errors,[]);check('No console or page errors');
  fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({version:'84',checks},null,2));console.log('forms-flow: '+checks.length+' checks passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
