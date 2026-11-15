// v49: the app loads IBM Plex from Google Fonts. A test must not depend on that request: on a slow or
// blocked network it fails, and a failed font load is both a console error (which every suite asserts is
// empty) and a layout shift that can land under a click. This answers the request with an empty stylesheet,
// so the page uses its fallback fonts, the run is quiet, and the layout is stable from the first paint.
// v78: every suite calls this once per browser context, so it also picks the layout: the suites written before
// v78 drive the one long page, so a context starts in the classic layout (localStorage pt-layout = classic) unless
// the suite asks for the tabs with stubWebFonts(ctx, {ui:'tabs'}) or WASOOLI_UI=tabs is set. The value is only
// written when none is stored, so a suite can still switch layouts itself and reload.
module.exports = async function stubWebFonts(context, opts) {
  await context.route('**fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await context.route('**fonts.gstatic.com/**', r => r.fulfill({ status: 200, contentType: 'font/woff2', body: Buffer.alloc(0) }));
  const ui = (opts && opts.ui) || process.env.WASOOLI_UI || 'classic';
  await context.addInitScript(v => { try { if (localStorage.getItem('pt-layout') == null) localStorage.setItem('pt-layout', v); } catch (e) {} }, ui);
};
