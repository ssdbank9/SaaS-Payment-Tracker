// Signs in once on a fresh disposable store so its first-run setup (settings, seed users) is finished before a suite starts.
// Usage: node tests/tools/warm.cjs http://127.0.0.1:<port>   (needs PLAYWRIGHT_MODULE / PLAYWRIGHT_EXECUTABLE like the suites)
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const stubWebFonts=require('../webfonts.cjs');
(async()=>{
  const base=process.argv[2];if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(base||''))throw new Error('Only a disposable local server may be warmed');
  const b=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE});const ctx=await b.newContext();await stubWebFonts(ctx);const p=await ctx.newPage();
  await p.goto(base+'/login');await p.fill('[name=passcode]','test1234');await p.press('[name=passcode]','Enter');
  await p.waitForSelector('#app-ver',{timeout:30000});await p.waitForTimeout(5000);await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
