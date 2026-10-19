// v40: a refund on a one-time item asks why: courtesy/prorated (the rest is still owed) or sale cancelled (nothing more owed).
// Synthetic local records only. Start a disposable server (see AGENTS.md), then: node tests/onetime-refund-flow.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const stubWebFonts=require('./webfonts.cjs');

const base=process.env.WASOOLI_TEST_URL||'http://127.0.0.1:8098',H={'X-Requested-With':'wasool','Content-Type':'application/json'},checks=[];
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).protocol,'http:');
const out=path.resolve(process.env.WASOOLI_TEST_OUTPUT||'data/onetime-refund-qa');fs.mkdirSync(out,{recursive:true});
const check=n=>{checks.push(n);console.log('PASS '+n);};
const item=()=>({id:'s3',kind:'one-time',name:'Setup',packageId:'pkg_c',currency:'PKR',total:1000,due:'2026-10-31',start:'2026-10-01',payments:[{id:'p1',date:'2026-10-05',amount:400,currency:'PKR'}]});
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--disable-gpu']});
 try{
  const ctx=await browser.newContext({viewport:{width:1400,height:900}});await stubWebFonts(ctx);await ctx.addInitScript(()=>{if(!localStorage.getItem('pt-today'))localStorage.setItem('pt-today','2026-10-28');});
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(base+'/login',{waitUntil:'domcontentloaded'});await page.locator('[name=passcode]').fill('test1234');await page.locator('button[type=submit]').click();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  const api=async(method,pth,data)=>{const r=await ctx.request.fetch(base+pth,{method,headers:H,data:data===undefined?undefined:JSON.stringify(data)});let j=null;try{j=await r.json();}catch(e){}return {status:r.status(),j};};
  await api('POST','/api/import',{docs:{
    'users/kind':{name:'Courtesy Case',joinDate:'2026-10-01',subscriptions:[item()]},
    'users/gone':{name:'Cancelled Sale',joinDate:'2026-10-01',subscriptions:[item()]},
    'users/mon':{name:'Monthly Case',joinDate:'2026-09-24',subscriptions:[{id:'s1',kind:'monthly',cycle:'monthly',packageId:'pkg_c',currency:'PKR',start:'2026-09-24',prices:[{from:'2026-09-24',price:4200}],payments:[{id:'p1',date:'2026-09-24',amount:4200,currency:'PKR'}]}]}},replace:['users/','costs/']});
  await page.reload();await page.waitForSelector('tr.row[data-id="kind"]');await page.waitForTimeout(1500);
  const det=id=>page.locator('tr.detail[data-id="'+id+'"]');
  const openRefund=async(id,sid)=>{if(!(await det(id).count()))await page.locator('tr.row[data-id="'+id+'"]').click();await det(id).waitFor();await det(id).locator('[data-key="refund:'+sid+'"]').first().click();await page.locator('#refundDialog[open]').waitFor();};
  const row=async id=>(await page.locator('tr.row[data-id="'+id+'"]').innerText()).replace(/\s+/g,' ');

  /* the reason must be chosen */
  await openRefund('kind','s3');assert.equal(await page.locator('#refund-purpose').inputValue(),'');await page.locator('#refund-amount').fill('100');await page.locator('#refund-date').fill('2026-10-28');await page.waitForTimeout(200);
  assert.match(await page.locator('#refund-preview').innerText(),/Choose why the money goes back/);assert.equal(await page.locator('#refund-save').isDisabled(),true);
  check('A refund on a one-time item cannot be saved until you choose why the money goes back');

  /* courtesy / prorated refund */
  await page.locator('#refund-purpose').selectOption('courtesy');await page.waitForTimeout(200);
  assert.match((await page.locator('#refund-preview').innerText()).replace(/\s+/g,' '),/the sale becomes Rs 900; Rs 300 kept; still owed Rs 600/);
  await page.locator('#refund-save').click();await page.locator('#refundDialog').waitFor({state:'hidden'});await page.waitForTimeout(800);
  let r=(await api('GET','/api/docs/users/kind')).j.data.subscriptions[0].refunds[0];assert.equal(r.amount,100);assert.equal(r.closesSale,undefined);
  assert.match(await row('kind'),/Rs 600/);assert.doesNotMatch(await row('kind'),/Sale cancelled/);
  check('Courtesy refund of Rs 100: the sale becomes Rs 900, Rs 300 kept, Rs 600 still owed');

  /* sale cancelled */
  await openRefund('gone','s3');await page.locator('#refund-purpose').selectOption('closesale');await page.locator('#refund-amount').fill('400');await page.locator('#refund-date').fill('2026-10-28');await page.waitForTimeout(200);
  assert.match(await page.locator('#refund-preview').innerText(),/Sale cancelled: nothing more is owed; Rs 0 kept stays as revenue/);
  await page.locator('#refund-save').click();await page.locator('#refundDialog').waitFor({state:'hidden'});await page.waitForTimeout(800);
  r=(await api('GET','/api/docs/users/gone')).j.data.subscriptions[0].refunds[0];assert.equal(r.closesSale,true);
  const t=await row('gone');assert.match(t,/Sale cancelled/);assert.doesNotMatch(t,/Overdue|Rs 600/);
  check('Sale cancelled with the Rs 400 returned: the item shows "Sale cancelled" and nothing is owed');

  /* monthly plans keep their own choices */
  await openRefund('mon','s1');assert.equal(await page.locator('#refund-purpose').inputValue(),'cash');
  assert.equal(await page.locator('#refund-purpose option[value=courtesy]').evaluate(o=>o.hidden),true);assert.equal(await page.locator('#refund-purpose option[value=bill]').evaluate(o=>o.hidden),false);
  await page.locator('#refundDialog [data-act=close],#refund-cancel').first().click().catch(()=>page.keyboard.press('Escape'));
  check('Monthly plans keep their three refund choices; the one-time reasons are not offered there');

  assert.deepEqual(errors,[]);check('No unexpected console/page errors');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({version:'49',checks},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
