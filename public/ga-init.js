// Google tag (gtag.js) config. Extracted from an inline <script> in
// index.html so the site's Content-Security-Policy script-src can require
// 'self' instead of 'unsafe-inline' — see vercel.json. Stripped from the
// desktop build the same way as before (vite.config.mjs still removes the
// whole ga:start/ga:end block, which now includes this file's <script> tag
// instead of an inline one).
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());

gtag('config', 'G-L1BT87PKXV');
