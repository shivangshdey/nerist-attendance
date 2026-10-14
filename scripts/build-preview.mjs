// Bundles public/ into one self-contained HTML file with the data embedded, so the
// dashboard can be previewed anywhere (no server, no module files).
//   node scripts/build-preview.mjs                → dist/preview.html (full document)
//   node scripts/build-preview.mjs --fragment f   → body-only fragment (for hosts that add their own <html>/<head>)
import fs from 'node:fs/promises';
const p = (f) => new URL(`../public/${f}`, import.meta.url);
const read = (f) => fs.readFile(p(f), 'utf8');
const fragment = process.argv.includes('--fragment');
const out = process.argv.filter((a) => !a.startsWith('--')).slice(2)[0] || 'dist/preview.html';

// One module: lib → app, with the local imports/exports removed.
const strip = (src) => src
  .replace(/^import\s*\{[\s\S]*?\}\s*from\s*'\.\/[^']+';\s*$/gm, '')
  .replace(/^export\s+(?=(async\s+)?function|const|let|class)/gm, '');
const js = [strip(await read('lib/attendance.js')), strip(await read('app.js'))].join('\n');

let html = await read('index.html');
const css = await read('styles.css');
const data = await read('data/attendance.json');
html = html
  .replace('<link rel="stylesheet" href="styles.css" />', `<style>\n${css}\n</style>`)
  .replace('<script type="module" src="app.js"></script>',
    `<script type="application/json" id="embedded-data">${data.replace(/</g, '\\u003c')}</script>\n<script type="module">\n${js}\n</script>`);
if (fragment) {
  const head = html.match(/<head>([\s\S]*?)<\/head>/)[1]
    .split('\n').filter((l) => !/<meta (charset|name="viewport")/.test(l)).join('\n');
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/)[1];
  html = `${head.trim()}\n${body.trim()}\n`;
}
const url = new URL('../' + out, import.meta.url);
await fs.mkdir(new URL('.', url), { recursive: true });
await fs.writeFile(url, html);
console.log('wrote', out);
