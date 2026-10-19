// v39: two devices, one record. Synthetic local records only; never use the owner's database.
// Start a disposable server (see AGENTS.md), then: node tests/conflict-flow.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const stubWebFonts=require('./webfonts.cjs');

const base=process.env.WASOOLI_TEST_URL||'http://127.0.0.1:8098',H={'X-Requested-With':'wasool','Content-Type':'application/json'},checks=[];
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).protocol,'http:');
const out=path.resolve(process.env.WASOOLI_TEST_OUTPUT||'data/conflict-qa');fs.mkdirSync(out,{recursive:true});
const check=n=>{checks.push(n);console.log('PASS '+n);},sleep=ms=>new Promise(r=>setTimeout(r,ms));
const userDoc=()=>({name:'Conflict QA',email:'conflict-qa@example.test',phone:'923001234567',joinDate:'2026-09-24',notes:'original',subscriptions:[{id:'s1',kind:'monthly',cycle:'monthly',packageId:'pkg_c',currency:'PKR',start:'2026-09-24',prorate:true,prices:[{from:'2026-09-24',price:4200}],payments:[{id:'p0',date:'2026-09-24',amount:4200,currency:'PKR',rate:null,note:'Sep'}],accountCost:{frequency:'monthly',entries:[{from:'2026-09-24',amount:10,currency:'USD',rate:280,paidIn:'USD',supplier:'SupA'}],first:'prorated',firstAmount:null,overrides:{}}}]});
let browser;
async function open(opt){const ctx=await browser.newContext(Object.assign({viewport:{width:1400,height:900}},opt||{}));await stubWebFonts(ctx);await ctx.addInitScript(()=>localStorage.setItem('pt-today','2026-10-10'));const p=await ctx.newPage();p._errs=[];p.on('pageerror',e=>p._errs.push(e.stack));p.on('console',m=>{if(m.type()==='error'&&!/40[0-9]|50[0-9]/.test(m.text()))p._errs.push(m.text());});
 await p.goto(base+'/login',{waitUntil:'domcontentloaded'});await p.locator('[name=passcode]').fill('test1234');await p.locator('button[type=submit]').click();await p.waitForSelector('#app-ver',{timeout:30000});await p.waitForTimeout(2500);return {ctx,p};}
const api=async(ctx,method,pth,data,extra)=>{const r=await ctx.request.fetch(base+pth,{method,headers:Object.assign({},H,extra||{}),data:data===undefined?undefined:JSON.stringify(data)});let j=null;try{j=await r.json();}catch(e){}return {status:r.status(),j};};
const getUser=async(ctx,id)=>(await api(ctx,'GET','/api/docs/users/'+id)).j;
const rowText=async(p,id)=>(await p.locator('tr.row[data-id="'+id+'"]').innerText().catch(()=>'NO ROW')).replace(/\s+/g,' ');
async function openEdit(p,id){if(!(await p.locator('tr.detail[data-id="'+id+'"]').count()))await p.locator('tr.row[data-id="'+id+'"] td.who .nm').click();await p.waitForSelector('tr.detail[data-id="'+id+'"]');await p.locator('tr.detail[data-id="'+id+'"] .detail-acts [data-key="edit"]').click();await p.waitForSelector('tr.detail[data-id="'+id+'"] form.edit-form:not([hidden])');}
const editForm=(p,id)=>p.locator('tr.detail[data-id="'+id+'"] form.edit-form');
async function reset(ctx,id){await api(ctx,'POST','/api/import',{docs:{},replace:['users/','costs/']});const r=await api(ctx,'PUT','/api/docs/users/'+id,userDoc());assert.equal(r.status,200);}
(async()=>{
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--disable-gpu']});
 try{
  const D=await open();const id='conflict-qa';await reset(D.ctx,id);

  /* 1. server contract */
  let cur=await getUser(D.ctx,id),at1=cur.updated_at;
  let r=await api(D.ctx,'PUT','/api/docs/users/'+id,Object.assign(cur.data,{notes:'n2'}),{'X-Base-Updated':at1});assert.equal(r.status,200);const at2=r.j.updated_at;
  check('A save based on the current copy is accepted and returns the new version');
  r=await api(D.ctx,'PUT','/api/docs/users/'+id,Object.assign(cur.data,{notes:'n3'}),{'X-Base-Updated':at1});assert.equal(r.status,409);assert.equal(r.j.error,'conflict');assert.equal((await getUser(D.ctx,id)).data.notes,'n2');
  check('A save based on an outdated copy is refused (409) and writes nothing');
  r=await api(D.ctx,'PUT','/api/docs/users/'+id,Object.assign(cur.data,{notes:'n4'}));assert.equal(r.status,200);
  check('A save without a base (older open tab) is still accepted');
  r=await api(D.ctx,'POST','/api/import',{docs:{['users/'+id]:cur.data,'costs/qa-k':{description:'k',date:'2026-10-01',currency:'PKR',cost:1}},replace:[],base:{['users/'+id]:at1}});assert.equal(r.status,409);assert.equal((await api(D.ctx,'GET','/api/docs/costs/qa-k')).status,404);
  check('A batch save with an outdated base is refused as a whole; nothing is written');
  await reset(D.ctx,id);

  /* 2. phone with a stale copy: desktop records a payment, phone saves an edit before it has refreshed */
  const P=await open({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await P.p.reload();await P.p.waitForSelector('tr.row[data-id="'+id+'"]');await sleep(1500);
  let blocked=true;await P.p.route(u=>/\/api\/version|\/api\/docs\?prefix=/.test(u.toString()),route=>blocked?route.fulfill({status:503,contentType:'application/json',body:'{"error":"offline"}'}):route.continue());
  const u=(await getUser(D.ctx,id)).data;u.subscriptions[0].payments.push({id:'p-desk',date:'2026-10-10',amount:4200,currency:'PKR',rate:null,note:'Oct'});assert.equal((await api(D.ctx,'PUT','/api/docs/users/'+id,u)).status,200);
  await openEdit(P.p,id);await editForm(P.p,id).locator('[name=notes]').fill('edited on phone');await editForm(P.p,id).locator('button[type=submit]').click();await P.p.waitForTimeout(1500);
  const toast=(await P.p.locator('#toast, .toast').allInnerTexts().catch(()=>[])).join(' | ');const err=(await editForm(P.p,id).locator('.err').allInnerTexts().catch(()=>[])).join(' | ');
  let srv=(await getUser(D.ctx,id)).data;assert.equal(srv.subscriptions[0].payments.length,2);assert.equal(srv.notes,'original');
  assert.match(toast,/changed on another device/);
  check('Phone with an outdated copy: save refused, the desktop payment survives, the owner is told why');
  blocked=false;await P.p.waitForFunction(()=>/8,400/.test(document.querySelector('tr.row[data-id="conflict-qa"]').innerText),null,{timeout:20000});
  assert.equal(await editForm(P.p,id).locator('[name=notes]').inputValue(),'edited on phone');
  check('After the conflict the phone reloads the newer record and keeps what was typed');
  await editForm(P.p,id).locator('button[type=submit]').click();await P.p.waitForTimeout(1500);srv=(await getUser(D.ctx,id)).data;assert.equal(srv.notes,'edited on phone');assert.equal(srv.subscriptions[0].payments.length,2);
  check('Saving again keeps both the desktop payment and the phone edit');
  assert.equal(await P.p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);check('No sideways scroll at 390px after a conflict');

  /* 3. open Edit user: only the fields the owner changed are written */
  await reset(D.ctx,id);await D.p.reload();await D.p.waitForSelector('tr.row[data-id="'+id+'"]');await sleep(1500);await openEdit(D.p,id);
  const e=(await getUser(D.ctx,id)).data;e.phone='923009998888';e.subscriptions[0].start='2026-10-01';e.subscriptions[0].prices=[{from:'2026-10-01',price:4200}];e.subscriptions[0].accountCost.entries.push({from:'2026-10-24',amount:12,currency:'USD',rate:280,paidIn:'USD',supplier:'SupB'});
  assert.equal((await api(D.ctx,'PUT','/api/docs/users/'+id,e)).status,200);
  await D.p.waitForFunction(()=>{const f=document.querySelector('tr.detail[data-id="conflict-qa"] form.edit-form [name="productStart:s1"]');return f&&f.value==='2026-10-01';},null,{timeout:20000});
  check('An open Edit form refreshes fields the owner has not touched when another device changed them');
  await editForm(D.p,id).locator('[name=notes]').fill('desktop notes');await editForm(D.p,id).locator('button[type=submit]').click();await D.p.waitForTimeout(1500);
  let a=(await getUser(D.ctx,id)).data,s=a.subscriptions[0];
  assert.equal(a.notes,'desktop notes');assert.equal(a.phone,'923009998888');assert.equal(s.start,'2026-10-01');assert.equal(s.accountCost.entries.length,2);assert.equal(s.accountCost.entries[1].supplier,'SupB');
  check('Saving only the notes keeps the phone, start date and supplier cost changed on another device');
  await openEdit(D.p,id);await editForm(D.p,id).locator('[name="productStart:s1"]').fill('2026-10-05');await editForm(D.p,id).locator('button[type=submit]').click();await D.p.waitForTimeout(1500);
  a=(await getUser(D.ctx,id)).data;assert.equal(a.subscriptions[0].start,'2026-10-05');assert.equal(a.notes,'desktop notes');
  check('A field the owner does change is still saved');

  assert.deepEqual(D.p._errs.concat(P.p._errs),[]);check('No unexpected console/page errors');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({version:'49',checks},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
