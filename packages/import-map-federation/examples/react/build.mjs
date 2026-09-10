/**
 * Builds the realistic example: React 18, Redux Toolkit, react-redux, react-router
 * and date-fns, as vendor chunks + app bundles wired through an import map.
 *
 * Each app ships its OWN complete vendor set so it can run standalone; the import
 * map is what decides, at load time, whether it actually uses them.
 */
import { buildVendorChunk, buildApp } from '../../scripts/build-vendor.mjs';
import { writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const CWD = join(HERE, 'build');          // where node_modules lives
const DIST = join(HERE, 'dist');

const SHARED = ['react', 'react-dom', 'react-dom/client', '@reduxjs/toolkit',
                'react-redux', 'react-router-dom', 'date-fns'];

// pkg, specifier it is published as, version, externals it must NOT bundle
const base = (dateFnsPkg, dateFnsVersion) => [
  { pkg: 'react',            name: 'react',            version: '18.3.1',      external: [] },
  { pkg: 'react-dom',        name: 'react-dom',        version: '18.3.1',      external: ['react'] },
  { pkg: '@reduxjs/toolkit', name: '@reduxjs/toolkit', version: '2.12.0',      external: [] },
  { pkg: 'react-redux',      name: 'react-redux',      version: '9.3.0',       external: ['react', 'react-dom'] },
  { pkg: 'react-router-dom', name: 'react-router-dom', version: '6.30.6',      external: ['react', 'react-dom'] },
  { pkg: dateFnsPkg,         name: 'date-fns',         version: dateFnsVersion, external: [] },
];

const slug = (n, v) => `${n.replace(/[@/]/g, '-').replace(/^-/, '')}-${v}.js`;

async function buildVendors(specs, outDir) {
  const urls = {};
  for (const s of specs) {
    const file = slug(s.name, s.version);
    await buildVendorChunk({ ...s, outfile: join(outDir, 'vendor', file), cwd: CWD });
    urls[s.name] = { version: s.version, url: `./vendor/${file}` };
  }
  // react-dom already exports createRoot/hydrateRoot, so "react-dom/client" points at
  // the same chunk. Building it separately would either duplicate the renderer or, with
  // react-dom external, make the chunk import itself — esbuild's `external` matches
  // subpaths, so externalising "react-dom" also externalises "react-dom/client".
  urls['react-dom/client'] = { ...urls['react-dom'] };
  return urls;
}

const MFES = [
  { name: 'dashboard', src: 'mfe-dashboard', dateFns: ['date-fns', '4.4.0'], requires: { 'date-fns': '^4.0.0' } },
  { name: 'reports',   src: 'mfe-reports',   dateFns: ['date-fns-v2', '2.30.0'], requires: { 'date-fns': '^2.30.0' } },
];
const SINGLETON = new Set(['react', 'react-dom', 'react-dom/client', 'react-redux', 'react-router-dom']);
const RANGES = { react: '^18.0.0', 'react-dom': '^18.0.0', 'react-dom/client': '^18.0.0',
                 '@reduxjs/toolkit': '^2.0.0', 'react-redux': '^9.0.0', 'react-router-dom': '^6.0.0' };

await rm(DIST, { recursive: true, force: true });

// ---------------- host ----------------
console.log('building host vendors...');
const hostVendors = await buildVendors(base('date-fns', '4.4.0'), join(DIST, 'host'));
await buildApp({ entry: join(HERE, 'src/host/app.jsx'), outfile: join(DIST, 'host/app.js'),
                 external: SHARED, cwd: CWD });

const hostShares = Object.fromEntries(Object.entries(hostVendors)
  .map(([n, v]) => [n, { version: v.version, url: v.url.replace('./', '/') }]));
await writeFile(join(DIST, 'host/index.html'), hostHtml());

// ---------------- MFEs ----------------
for (const mfe of MFES) {
  console.log(`building ${mfe.name} vendors...`);
  const out = join(DIST, 'cdn', mfe.name);
  const vendors = await buildVendors(base(...mfe.dateFns), out);
  await buildApp({ entry: join(HERE, 'src', mfe.src, 'entry.jsx'),
                   outfile: join(out, 'entry.js'), external: SHARED, cwd: CWD });

  const shared = {};
  for (const [name, v] of Object.entries(vendors)) {
    shared[name] = {
      requiredVersion: mfe.requires[name] ?? RANGES[name] ?? `^${v.version}`,
      version: v.version, url: v.url,
      ...(SINGLETON.has(name) ? { singleton: true } : {}),
    };
  }
  await writeFile(join(out, 'manifest.json'), JSON.stringify(
    { name: mfe.name, entry: './entry.js', exposes: { './App': './entry.js' }, shared }, null, 2));

  const imports = Object.fromEntries(Object.entries(vendors).map(([n, v]) => [n, v.url]));
  imports[`${mfe.name}/App`] = './entry.js';   // the remote is a map entry too
  await writeFile(join(out, 'standalone.html'), standaloneHtml(mfe.name, imports));
}

console.log('\ndist/ built. Run: npm run example:react');

// ---------------- templates ----------------
function styles() {
  return `
  :root { color-scheme: light dark; --bd:#d5d8dd; --mut:#666; --ok:#0a7c42; --iso:#b25000; }
  @media (prefers-color-scheme: dark) { :root { --bd:#3a3f47; --mut:#9aa0a8; --ok:#4ade80; --iso:#fb923c; } }
  body { font: 14px/1.55 system-ui, sans-serif; margin: 0; padding: 24px; max-width: 1000px; }
  h1 { font-size: 20px; margin: 0 0 4px; } h2 { font-size: 15px; margin: 26px 0 8px; }
  h3 { margin: 0 0 4px; font-size: 14px; }
  .lede { color: var(--mut); margin: 0 0 18px; }
  .card { border: 1px solid var(--bd); border-radius: 8px; padding: 12px 14px; margin-bottom: 14px; }
  .sub, .id { color: var(--mut); font-size: 12px; } .id { font-family: ui-monospace, monospace; }
  #mfes { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 14px; }
  .mfe { border: 1px dashed var(--bd); border-radius: 10px; padding: 12px; }
  .mfe-body p { margin: 6px 0; }
  button { font: inherit; padding: 5px 11px; border: 1px solid var(--bd); border-radius: 6px;
           background: transparent; color: inherit; cursor: pointer; margin-right: 6px; }
  strong { font-variant-numeric: tabular-nums; font-size: 15px; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid var(--bd); }
  th { font-weight: 600; color: var(--mut); }
  tr.ok td:nth-child(3), tr.ok td:last-child { color: var(--ok); }
  tr.iso td:nth-child(3), tr.iso td:last-child { color: var(--iso); }
  pre { background: color-mix(in srgb, currentColor 6%, transparent); padding: 12px;
        border-radius: 8px; overflow-x: auto; font-size: 12px; }
  .list { margin: 4px 0; padding-left: 18px; font-size: 12px; } code { font-size: 12px; }
  .err { color: #c0392b; white-space: pre-wrap; }`;
}

function hostHtml() {
  return `<!doctype html>
<meta charset="utf-8">
<title>Import Map Federation — React host</title>
<style>${styles()}</style>
<h1>Import Map Federation — React, Redux, React Router</h1>
<p class="lede">
  Both MFEs render as React components <em>inside</em> the host's tree, so their hooks,
  <code>useSelector</code> and <code>useLocation</code> only work if React, react-redux and
  react-router are literally the same instances the host loaded. Reports pins
  <code>date-fns@^2</code> against the host's v4, so it gets its own copy of that one library.
</p>
<div id="root"></div>
<script src="/dist/import-map-federation.global.js"></script>
<script>
  (async () => {
    const CDN = new URLSearchParams(location.search).get('cdn') || 'http://127.0.0.1:8100';
    try {
      const fed = await window.ImportMapFederation.bootstrap({
        host: { name: 'host', shares: ${JSON.stringify(hostShares)} },
        manifests: [CDN + '/dashboard/manifest.json', CDN + '/reports/manifest.json'],
      });
      window.__fed = fed;
      const app = await import('/app.js');
      await app.start(fed);
      window.__ready = true;
    } catch (err) {
      document.body.insertAdjacentHTML('beforeend',
        '<p class="err">Bootstrap failed: ' + (err && err.stack || err) + '</p>');
      window.__bootError = String(err); window.__ready = true;
    }
  })();
</script>`;
}

function standaloneHtml(name, imports) {
  return `<!doctype html>
<meta charset="utf-8">
<title>${name} MFE — standalone</title>
<style>${styles()}</style>
<h1>${name} MFE — standalone</h1>
<p class="lede">No host, no loader, no manifest fetch. One static import map, and the remote
  imported by name: <code>import('${name}/App')</code>.</p>
<script type="importmap">
${JSON.stringify({ imports }, null, 2)}
</script>
<div id="root"></div>
<script type="module">
  import { mountStandalone } from '${name}/App';
  mountStandalone(document.getElementById('root'))
    .then((v) => { window.__vendors = v; window.__ready = true; })
    .catch((e) => { window.__bootError = String(e); window.__ready = true;
      document.body.insertAdjacentHTML('beforeend', '<p class="err">' + e.stack + '</p>'); });
</script>`;
}
