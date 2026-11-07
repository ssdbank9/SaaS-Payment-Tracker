// v57: Settings → Public base URL works again on the server. Customer links use LINK_DOMAIN (none here), else the typed URL when the
// server can find its name, else the server's own address; a name that cannot be found is shown as such and never used.
// Synthetic records on a disposable server only:  WASOOLI_TEST_URL=http://127.0.0.1:<port> node tests/link-base-flow.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const stubWebFonts=require('./webfonts.cjs');

const base=process.env.WASOOLI_TEST_URL||'http://127.0.0.1:8098',H={'X-Requested-With':'wasool','Content-Type':'application/json'},checks=[];
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).protocol,'http:');
const out=path.resolve(process.env.WASOOLI_TEST_OUTPUT||'data/link-base-qa');fs.mkdirSync(out,{recursive:true});
const check=n=>{checks.push(n);console.log('PASS '+n);};
const viaLocalhost=base.replace('127.0.0.1','localhost');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--disable-gpu']});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await stubWebFonts(ctx);
  await ctx.addInitScript(()=>{if(!localStorage.getItem('pt-today'))localStorage.setItem('pt-today','2026-10-20');localStorage.setItem('pt-sum-open','1');
    Object.defineProperty(Navigator.prototype,'clipboard',{configurable:true,get(){return {writeText:t=>{window.__copied=t;return Promise.resolve();}};}});});
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(base+'/login',{waitUntil:'domcontentloaded'});await page.locator('[name=passcode]').fill('test1234');await page.locator('button[type=submit]').click();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  const api=async(method,pth,data)=>{const r=await ctx.request.fetch(base+pth,{method,headers:H,data:data===undefined?undefined:JSON.stringify(data)});let j=null;try{j=await r.json();}catch(e){}return {status:r.status(),j};};
  const until=async(fn,what)=>{for(let i=0;i<80;i++){if(await fn())return;await page.waitForTimeout(250);}throw new Error('timed out waiting for '+what);};
  for(const d of ((await api('GET','/api/docs?prefix=users/')).j.docs||[]))await api('DELETE','/api/docs/'+d.path);
  await api('POST','/api/import',{docs:{'users/lk':{name:'Link Person',joinDate:'2026-09-24',subscriptions:[{id:'s1',kind:'monthly',cycle:'monthly',name:'',packageId:'pkg_c',currency:'PKR',start:'2026-09-24',prorate:true,prices:[{from:'2026-09-24',price:4200}],payments:[]}]}},replace:[]});
  await page.reload();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2000);
  assert.equal(await page.locator('#app-ver').textContent(),'v62');
  const state=()=>page.locator('#s-base-url-state').textContent();
  const openSettings=async()=>{await page.locator('#btn-settings').click();await page.locator('#settingsPanel').waitFor({state:'visible'});};
  const closeSettings=async()=>{await page.locator('#settings-close,[data-act=settings-close]').first().click().catch(()=>page.locator('#btn-settings').click());};
  const saveUrl=async v=>{await page.locator('#s-base-url').fill(v);await page.locator('[data-save-setting="base-url"]').click();await until(async()=>((await api('GET','/api/docs/settings/main')).j.data||{}).publicBaseUrl===v.replace(/\/+$/,''),'saved '+v);};
  /* the link in the customer's Queue message (Oct 20 is a reminder day) */
  const copied=async()=>{await page.locator('#btn-reminders').click();await page.locator('#rr-tabs button[data-tab=queue]').click();let link='';
    await until(async()=>{const m=(await page.locator('#rr-body').innerText()).match(/https?:\/\/[^\s]+\/c\/[A-Za-z0-9_-]+/);link=m?m[0]:'';return !!link;},'link in the Queue');
    await page.locator('#btn-reminders').click();return link;};

  // 1. no setting: the box can be typed in and links use the server's own address
  await openSettings();assert.equal(await page.locator('#s-base-url').isDisabled(),false);
  await until(async()=>(await state())===`Customer links use ${base}.`,'own address note');
  await closeSettings();assert.match(await copied(),new RegExp('^'+base.replace(/[.:/]/g,'\\$&')+'/c/[A-Za-z0-9_-]+$'));
  check('with the box empty it can be typed in, Settings says customer links use this server, and Copy link gives '+base+'/c/<token>');

  // 2. a name that cannot be found (as pay-up.duckdns.org today): shown in red, links stay on the server's own address
  await openSettings();await saveUrl('https://pay-up.invalid');
  await until(async()=>/pay-up\.invalid cannot be found, so customer links use /.test(await state()),'not found note');assert.equal(await page.locator('#s-base-url-state').getAttribute('data-state'),'bad');
  await closeSettings();assert.ok((await copied()).startsWith(base+'/c/'));
  check('a saved Public base URL whose name cannot be found is reported in Settings and not used; Copy link still gives the server address');

  // 3. a name the server can find is used for every link
  await openSettings();await saveUrl(viaLocalhost+'/');
  await until(async()=>(await state())===`Customer links use ${viaLocalhost}.`,'found note');
  await closeSettings();assert.ok((await copied()).startsWith(viaLocalhost+'/c/'),'link uses the typed address');
  check('a Public base URL whose name is found ('+viaLocalhost+') is used: Settings says so and Copy link gives that address');

  // 4. clearing the box goes back to the server address
  await openSettings();await page.locator('#s-base-url').fill('');await page.locator('[data-save-setting="base-url"]').click();
  await until(async()=>!((await api('GET','/api/docs/settings/main')).j.data||{}).publicBaseUrl,'cleared');await until(async()=>(await state())===`Customer links use ${base}.`,'back to own');
  await page.screenshot({path:path.join(out,'settings-390.png')});await closeSettings();assert.ok((await copied()).startsWith(base+'/c/'));
  check('clearing the box goes back to the server address');
  assert.deepEqual(errors,[]);check('No unexpected console/page errors');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({version:'62',checks},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
