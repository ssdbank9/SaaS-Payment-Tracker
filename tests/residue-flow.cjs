// v40: a fraction of a cent (USD) or rupee (PKR) left by a currency conversion counts as paid; a real shortfall still shows.
// Synthetic local records only. Start a disposable server (see AGENTS.md), then: node tests/residue-flow.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.WASOOLI_TEST_URL||'http://127.0.0.1:8098',H={'X-Requested-With':'wasool','Content-Type':'application/json'},checks=[];
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).protocol,'http:');
const out=path.resolve(process.env.WASOOLI_TEST_OUTPUT||'data/residue-qa');fs.mkdirSync(out,{recursive:true});
const check=n=>{checks.push(n);console.log('PASS '+n);};
const plan=(cur,price,pays)=>({id:'s1',kind:'monthly',cycle:'monthly',packageId:'pkg_c',currency:cur,start:'2026-09-24',prorate:true,prices:[{from:'2026-09-24',price}],payments:pays.map((p,i)=>Object.assign({id:'p'+i},p))});
const USERS={
  usdres:{name:'USD Residue',joinDate:'2026-09-24',subscriptions:[plan('USD',20,[{date:'2026-09-24',amount:20,currency:'USD'},{date:'2026-10-24',amount:5000,currency:'PKR',rate:280},{date:'2026-10-24',amount:2.14,currency:'USD'}])]},
  pkrres:{name:'PKR Residue',joinDate:'2026-09-24',subscriptions:[plan('PKR',4200,[{date:'2026-09-24',amount:4200,currency:'PKR'},{date:'2026-10-24',amount:15,currency:'USD',rate:279.99}])]},
  usdshort:{name:'USD Short',joinDate:'2026-09-24',subscriptions:[plan('USD',20,[{date:'2026-09-24',amount:20,currency:'USD'},{date:'2026-10-24',amount:19.99,currency:'USD'}])]},
  ahead:{name:'Eren Style',joinDate:'2026-07-24',subscriptions:[Object.assign(plan('USD',14,[{date:'2026-07-24',amount:14,currency:'USD'},{date:'2026-08-24',amount:14,currency:'USD'},{date:'2026-09-24',amount:14,currency:'USD'},{date:'2026-10-20',amount:14,currency:'USD'}]),{start:'2026-07-24',prices:[{from:'2026-07-24',price:14}]})]},
  ahead2:{name:'Paid Ahead',joinDate:'2026-07-24',subscriptions:[Object.assign(plan('USD',14,[0,1,2,3,4].map(i=>({date:'2026-10-20',amount:14,currency:'USD'}))),{start:'2026-07-24',prices:[{from:'2026-07-24',price:14}]})]},
  pkrshort:{name:'PKR Short',joinDate:'2026-09-24',subscriptions:[plan('PKR',4200,[{date:'2026-09-24',amount:4200,currency:'PKR'},{date:'2026-10-24',amount:4199,currency:'PKR'}])]}
};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE,args:['--disable-gpu']});
 try{
  const ctx=await browser.newContext({viewport:{width:1400,height:900}});await ctx.addInitScript(()=>{if(!localStorage.getItem('pt-today'))localStorage.setItem('pt-today','2026-10-28');});
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(base+'/login',{waitUntil:'domcontentloaded'});await page.locator('[name=passcode]').fill('test1234');await page.locator('button[type=submit]').click();await page.waitForSelector('#app-ver',{timeout:30000});await page.waitForTimeout(2500);
  const api=async(method,pth,data)=>ctx.request.fetch(base+pth,{method,headers:H,data:data===undefined?undefined:JSON.stringify(data)});
  await api('POST','/api/import',{docs:{},replace:['users/','costs/']});for(const [id,u] of Object.entries(USERS))assert.equal((await api('PUT','/api/docs/users/'+id,u)).status(),200);
  await page.reload();await page.waitForSelector('tr.row[data-id="usdres"]');await page.waitForTimeout(2500);
  const row=async id=>(await page.locator('tr.row[data-id="'+id+'"]').innerText()).replace(/\s+/g,' ');

  let t=await row('usdres');assert.match(t,/Paid to Nov 23/);assert.doesNotMatch(t,/Overdue|Partial/);
  check('$20 + Rs 5,000 at 280 + $2.14 against two $20 months is paid (the $0.003 left by conversion is ignored)');
  t=await row('pkrres');assert.match(t,/Paid to Nov 23/);assert.doesNotMatch(t,/Overdue/);
  check('Rs 4,200 + $15 at 279.99 (Rs 4,199.85) against two Rs 4,200 months is paid (15 paisa left by conversion)');
  t=await row('usdshort');assert.match(t,/Overdue since Oct 24/);assert.match(t,/\$0\.01/);
  check('A real one-cent shortfall still shows: $19.99 against $20 is overdue by $0.01');
  t=await row('pkrshort');assert.match(t,/Overdue since Oct 24/);assert.match(t,/Rs 1\b/);
  check('A real one-rupee shortfall still shows: Rs 4,199 against Rs 4,200 is overdue by Rs 1');

  t=await row('ahead');assert.match(t,/Paid to Nov 23/);assert.doesNotMatch(t,/Paid to Oct|Paid for Oct/);
  check('A customer paid through 23 Nov shows "Paid to Nov 23" (not "Paid to Oct")');
  t=await row('ahead2');assert.match(t,/paid to Dec 23/);assert.match(t,/Paid to Dec 23/);assert.doesNotMatch(t,/paid for Nov/);
  check('When the coming bill is already paid, the Due column says "paid to Dec 23" (the last day it covers)');
  assert.deepEqual(errors,[]);check('No unexpected console/page errors');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({version:'43',checks},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
