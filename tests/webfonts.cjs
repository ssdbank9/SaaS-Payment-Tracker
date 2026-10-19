// v49: the app loads IBM Plex from Google Fonts. A test must not depend on that request: on a slow or
// blocked network it fails, and a failed font load is both a console error (which every suite asserts is
// empty) and a layout shift that can land under a click. This answers the request with an empty stylesheet,
// so the page uses its fallback fonts, the run is quiet, and the layout is stable from the first paint.
module.exports = async function stubWebFonts(context) {
  await context.route('**fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await context.route('**fonts.gstatic.com/**', r => r.fulfill({ status: 200, contentType: 'font/woff2', body: Buffer.alloc(0) }));
};
