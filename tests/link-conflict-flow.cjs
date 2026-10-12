// v41: a subscriber's link answer never replaces or silently ignores a tier change the owner set by hand; the owner decides.
// Synthetic local records only. Start a disposable server (see AGENTS.md), then: node tests/link-conflict-flow.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.WASOOLI_TEST_URL||'http://127.0.0.1:8098',H={'X-Requested-With':'wasool','Content-Type':'application/json'},checks=[];
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).protocol,'http:');
const out=path.resolve(process.env.WASOOLI_TEST_OUTPUT||'data/link-conflict-qa');fs.mkdirSync(out,{recursive:true});
const check=n=>{checks.push(n);console.log('PASS '+n);};
const run=Date.now().toString(36);const tok=n=>('qaLC'+n+run+'xxxxxxxxxxxx').slice(0,24);
const user=(name,token,tier)=>({name,joinDate:'2026-09-24',confirmToken:token,subscriptions:[{id:'s1',kind:'monthly',cycle:'monthly',packageId:'pkg_c',currency:'PKR',start:'2026-09-24',prices:[{from:'2026-09-24',price:4200}],payments:[{id:'p1',date:'2026-09-24',amount:4200,currency:'PKR'}],tierHistory:[{from:'2026-10-24',packageId:tier.pkg,price:tier.price,currency:'PKR',note:'owner set on WhatsApp'}]}]});
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--disable-gpu']});
 try{
  const ctx=await browser.newContext({viewport:{width:1400,height:900}});await ctx.addInitScript(()=>{if(!localStorage.getItem('pt-today'))localStorage.setItem('pt-today','2026-10-20');});
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(base+'/login',{waitUntil:'domcontentloaded'});await page.locator('[name=passcode]').fill('test1234');await page.locator('button[type=submit]').click();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  const api=async(method,pth,data)=>{const r=await ctx.request.fetch(base+pth,{method,headers:H,data:data===undefined?undefined:JSON.stringify(data)});let j=null;try{j=await r.json();}catch(e){}return {status:r.status(),j};};
  const st=(await api('GET','/api/docs/settings/main')).j.data;
  const pk=st.packages.filter(p=>p.id!=='pkg_cpro').concat([{id:'pkg_cpro',name:'C Pro',cycle:'monthly',price:5000,currency:'PKR',description:''}]);
  assert.equal((await api('PATCH','/api/docs/settings/main',{packages:pk,publicBaseUrl:base})).status,200);
  await api('POST','/api/import',{docs:{'users/lcA':user('Chose Other Tier',tok('A'),{pkg:'pkg_cpro',price:5000}),'users/lcB':user('Move Back',tok('B'),{pkg:'pkg_cmax',price:6000}),'users/lcC':user('Same Choice',tok('C'),{pkg:'pkg_cmax',price:6000})},replace:['users/','costs/']});
  await page.reload();await page.waitForSelector('tr.row[data-id="lcA"]');await page.waitForTimeout(5000);
  const doc=async p=>(await api('GET','/api/docs/'+p)).j.data;
  const answer=async(token,wanted)=>{const pub=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const pp=await pub.newPage();await pp.goto(base+'/c/'+token);
    const btns=await pp.locator('button[name=choice],button[value]').evaluateAll(b=>b.map(x=>({v:x.value||'',t:x.textContent.trim()})));
    const b=btns.find(x=>wanted.test(x.t));assert.ok(b,'button offered: '+JSON.stringify(btns));await pp.locator('button[value="'+b.v+'"]').first().click();await pp.waitForLoadState();await pub.close();return b;};

  /* A: owner set C Pro; the subscriber picks C Max on the link */
  const a=await answer(tok('A'),/C Max/);
  /* B: owner set C Max; the subscriber picks "Move back to C" */
  const b=await answer(tok('B'),/Move back to C|back to C|\bC\b$/);
  await page.reload();await page.waitForSelector('tr.row[data-id="lcA"]');await page.waitForTimeout(7000);
  let sA=(await doc('users/lcA')).subscriptions[0],sB=(await doc('users/lcB')).subscriptions[0];
  assert.equal(sA.tierHistory.length,1);assert.equal(sA.tierHistory[0].packageId,'pkg_cpro');assert.equal(sA.tierHistory[0].via,undefined);
  assert.equal(sA.linkConflict.packageId,'pkg_cmax');assert.equal(sA.linkConflict.cycle,'2026-10-24');
  check('Owner set C Pro, subscriber chose C Max on the link: the owner\'s C Pro change is kept and the difference is recorded');
  assert.equal(sB.tierHistory[0].packageId,'pkg_cmax');assert.equal(sB.linkConflict.packageId,'pkg_c');
  check('Owner set C Max, subscriber chose "Move back to C": no longer silently ignored; the difference is recorded for the owner');

  /* the owner sees it and decides */
  await page.locator('tr.row[data-id="lcA"]').click();const dA=page.locator('tr.detail[data-id="lcA"]');await dA.waitFor();
  const txt=(await dA.locator('.link-conflict').innerText()).replace(/\s+/g,' ');
  assert.match(txt,/Link answer differs from your tier change/);assert.match(txt,/chose C Max from Oct 24, 2026/);assert.match(txt,/you set C Pro/);assert.match(txt,/Nothing was changed/);
  check('The customer\'s card shows "Link answer differs from your tier change" naming both choices, with Use their choice / Keep mine');
  await dA.locator('[data-act=link-use]').click();await page.waitForTimeout(1200);
  sA=(await doc('users/lcA')).subscriptions[0];assert.equal(sA.linkConflict,undefined);assert.equal(sA.tierHistory.length,1);assert.equal(sA.tierHistory[0].packageId,'pkg_cmax');assert.equal(sA.tierHistory[0].via,'link');
  check('"Use their choice" replaces the owner\'s change with C Max from 24 Oct (marked as chosen on the link) and clears the notice');
  await page.locator('tr.row[data-id="lcA"]').click();
  await page.locator('tr.row[data-id="lcB"]').click();const dB=page.locator('tr.detail[data-id="lcB"]');await dB.waitFor();await dB.locator('[data-act=link-keep]').click();await page.waitForTimeout(1200);
  sB=(await doc('users/lcB')).subscriptions[0];assert.equal(sB.linkConflict,undefined);assert.equal(sB.tierHistory.length,1);assert.equal(sB.tierHistory[0].packageId,'pkg_cmax');assert.equal(sB.tierHistory[0].via,undefined);
  check('"Keep mine" keeps the owner\'s C Max change untouched and clears the notice');

  /* C: the subscriber agrees with the owner: nothing to decide */
  await answer(tok('C'),/Continue|continue|C Max|stay/i).catch(()=>{});
  await page.reload();await page.waitForSelector('tr.row[data-id="lcA"]');await page.waitForTimeout(6000);
  const sC=(await doc('users/lcC')).subscriptions[0];assert.equal(sC.linkConflict,undefined);assert.equal(sC.tierHistory.length,1);assert.equal(sC.tierHistory[0].packageId,'pkg_cmax');
  check('When the subscriber\'s answer matches or only confirms the owner\'s change, nothing is flagged and nothing changes');

  assert.deepEqual(errors,[]);check('No unexpected console/page errors');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({version:'43',checks},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
