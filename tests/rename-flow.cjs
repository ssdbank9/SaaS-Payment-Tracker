// v41: renaming a product changes it everywhere: link page, messages, plan labels, one-time items and automatic expense descriptions.
// Synthetic local records only. Start a disposable server (see AGENTS.md), then: node tests/rename-flow.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const stubWebFonts=require('./webfonts.cjs');

const base=process.env.WASOOLI_TEST_URL||'http://127.0.0.1:8098',H={'X-Requested-With':'wasool','Content-Type':'application/json'},checks=[];
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).protocol,'http:');
const out=path.resolve(process.env.WASOOLI_TEST_OUTPUT||'data/rename-qa');fs.mkdirSync(out,{recursive:true});
const check=n=>{checks.push(n);console.log('PASS '+n);};
const run=Date.now().toString(36);const tokA=('qaRN'+'A'+run+'xxxxxxxxxxxx').slice(0,24),tokB=('qaRN'+'B'+run+'xxxxxxxxxxxx').slice(0,24);
const mon=extra=>Object.assign({id:'s1',kind:'monthly',cycle:'monthly',packageId:'pkg_c',currency:'PKR',start:'2026-09-24',prices:[{from:'2026-09-24',price:4200}],payments:[{id:'p1',date:'2026-09-24',amount:4200,currency:'PKR'}]},extra||{});
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--disable-gpu']});
 try{
  const ctx=await browser.newContext({viewport:{width:1400,height:900}});await stubWebFonts(ctx);await ctx.addInitScript(()=>{if(!localStorage.getItem('pt-today'))localStorage.setItem('pt-today','2026-10-20');});
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(base+'/login',{waitUntil:'domcontentloaded'});await page.locator('[name=passcode]').fill('test1234');await page.locator('button[type=submit]').click();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  const api=async(method,pth,data)=>{const r=await ctx.request.fetch(base+pth,{method,headers:H,data:data===undefined?undefined:JSON.stringify(data)});let j=null;try{j=await r.json();}catch(e){}return {status:r.status(),j};};
  assert.equal((await api('PATCH','/api/docs/settings/main',{publicBaseUrl:base})).status,200);
  const cost=(desc,uid)=>({date:'2026-10-01',description:desc,category:'Product',packageId:'pkg_c',currency:'PKR',cost:500,tax:0,rate:null,source:'account',userId:uid,subscriptionId:'s1'});
  await api('POST','/api/import',{docs:{
    'users/rnA':{name:'Plain Plan',joinDate:'2026-09-24',confirmToken:tokA,subscriptions:[mon()]},
    'users/rnB':{name:'Labelled Plan',joinDate:'2026-09-24',confirmToken:tokB,subscriptions:[mon({name:'C'}),{id:'s2',kind:'one-time',name:'C',packageId:'pkg_c',currency:'PKR',total:1000,due:'2026-10-30',start:'2026-10-01',payments:[]}]},
    'costs/account_rnA_s1':cost('Plain Plan · C cost','rnA'),'costs/hand':{...cost('My own note about C','rnB'),source:'manual'}},replace:['users/','costs/']});
  await page.reload();await page.waitForSelector('tr.row[data-id="rnA"]');await page.waitForTimeout(5000);
  const textOf=h=>h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g,' ').replace(/<[^>]+>/g,' ').replace(/&#39;/g,"'").replace(/\s+/g,' ');
  const linkText=async t=>textOf(await (await ctx.request.get(base+'/c/'+t)).text());
  const rename=async(from,to)=>{await page.locator('#btn-settings').click();const inp=page.locator('#pkgList input[data-f=name]').first();assert.equal(await inp.inputValue(),from);await inp.fill(to);await page.locator('[data-save-setting="packages"]').click();await page.waitForFunction(()=>/Saved/.test((document.querySelector('#setting-status-packages')||{}).textContent||''),null,{timeout:15000});await page.locator('#btn-settings').click();await page.waitForTimeout(3500);};

  await rename('C','Claude Pro');
  const pk=(await api('GET','/api/docs/settings/main')).j.data.packages.find(p=>p.id==='pkg_c');assert.equal(pk.name,'Claude Pro');assert.deepEqual(pk.aliases,['C']);
  check('Renaming C to "Claude Pro" saves the new name and remembers the old one');
  const A=await linkText(tokA),B=await linkText(tokB);
  assert.match(A,/Claude Pro Rs 4,200\/mo/);assert.match(B,/Claude Pro Rs 4,200\/mo/);assert.doesNotMatch(B,/\bC Claude Pro\b/);assert.doesNotMatch(A+B,/24 Oct – 23 Nov 2026 C\b/);
  check('The subscriber link page shows "Claude Pro" for both customers, including the one whose plan label was the old name "C"');
  await page.locator('#btn-reminders').click();await page.locator('#rr-tabs button[data-tab=queue]').click();await page.waitForTimeout(600);
  const q=(await page.locator('#rr-body').innerText()).replace(/\s+/g,' ');assert.match(q,/Labelled Plan Claude Pro/);assert.match(q,/your Claude Pro plan renews/);assert.doesNotMatch(q,/Claude Pro · C\b|your C plan/);
  await page.locator('#btn-reminders').click();
  check('The reminder messages say "your Claude Pro plan"; no leftover "C"');
  await page.locator('tr.row[data-id="rnB"]').click();const det=(await page.locator('tr.detail[data-id="rnB"]').innerText()).replace(/\s+/g,' ');
  assert.match(det,/ACCOUNT Labelled Plan Claude Pro/);assert.doesNotMatch(det,/Claude Pro · C\b/);
  check('The customer\'s card and the one-time item show "Claude Pro" only (no "Claude Pro · C")');
  await page.locator('tr.row[data-id="rnB"]').click();
  await page.locator('#range').selectOption('all');await page.waitForTimeout(300);
  const costs=(await page.locator('#costBody').innerText()).replace(/\s+/g,' ');
  assert.match(costs,/Plain Plan · Claude Pro cost/);assert.match(costs,/My own note about C/);
  check('The automatic expense description follows the rename ("Plain Plan · Claude Pro cost"); a description you wrote ("My own note about C") is untouched');

  await rename('Claude Pro','Claude Max Pro');
  const pk2=(await api('GET','/api/docs/settings/main')).j.data.packages.find(p=>p.id==='pkg_c');assert.deepEqual(pk2.aliases,['C','Claude Pro']);
  const B2=await linkText(tokB);assert.match(B2,/Claude Max Pro Rs 4,200\/mo/);assert.doesNotMatch(B2,/Claude Pro Claude Max Pro|\bC Claude Max Pro/);
  check('A second rename works the same: the link now shows "Claude Max Pro" and both earlier names are remembered');

  assert.deepEqual(errors,[]);check('No unexpected console/page errors');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({version:'49',checks},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
