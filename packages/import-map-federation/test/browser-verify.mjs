// Runs the generated map in a real browser across two origins. Starts its own
// servers so it can't pass against whatever happens to be listening.
import pw from 'playwright';
import { buildImportMap } from '../src/resolve.js';
import { startServers } from '../examples/serve.mjs';

const { chromium } = pw;
let fails = 0;
const check = (label, cond, extra = '') => {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (cond ? '' : '  <- ' + extra));
  if (!cond) fails++;
};

const servers = await startServers({ hostPort: 8299, cdnPort: 8300, example: 'fixtures' });
const HOST = servers.hostUrl;
const CDN = servers.cdnUrl;

const { importMap, decisions } = buildImportMap({
  host: { name: 'host', shares: { react: { version: '18.2.0', url: `${HOST}/vendor/react-18.js` } } },
  mfes: [
    { name: 'mfe-a', baseUrl: `${CDN}/mfe-a/`,
      shared: { react: { requiredVersion: '^18.0.0', version: '18.2.0', url: `${CDN}/mfe-a/vendor/react-18.js` } } },
    { name: 'mfe-b', baseUrl: `${CDN}/mfe-b/`,
      shared: { react: { requiredVersion: '^17.0.0', version: '17.0.2', url: `${CDN}/mfe-b/vendor/react-17.js` } } },
  ],
});

const browser = await chromium.launch();
const errs = [];
try {
  const p = await browser.newPage();
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
  p.on('pageerror', (e) => errs.push('pageerror: ' + String(e).slice(0, 160)));
  await p.goto(`${HOST}/federated.html`);
  await p.evaluate((map) => {
    const s = document.createElement('script');
    s.type = 'importmap';
    s.textContent = JSON.stringify(map);
    document.head.appendChild(s);
  }, importMap);

  const out = await p.evaluate(async ([cdn]) => {
    const host = await import('react');
    const a = await import(`${cdn}/mfe-a/entry.js`);
    const b = await import(`${cdn}/mfe-b/entry.js`);
    return {
      host: host.version + '/' + host.marker.owner,
      mfeA: a.seen + '/' + a.marker.owner + ' (deep ' + a.deepSeen + ')',
      mfeB: b.seen + '/' + b.marker.owner + ' (deep ' + b.deepSeen + ')',
      sameAsHost: a.marker === host.marker,
      isolated: b.marker !== host.marker,
    };
  }, [CDN]);

  console.log('decisions:', JSON.stringify(decisions));
  check('compatible remote shares the host instance', out.sameAsHost, out.mfeA);
  check('compatible remote resolved host version', out.mfeA.startsWith('18.2.0/HOST'), out.mfeA);
  check('incompatible remote is isolated', out.isolated, out.mfeB);
  check('incompatible remote runs on its own copy',
    out.mfeB.startsWith('17.0.2/MFE-B-OWN-COPY'), out.mfeB);
  check('nested chunks follow the same resolution',
    out.mfeA.includes('deep 18.2.0/HOST') && out.mfeB.includes('deep 17.0.2/MFE-B-OWN-COPY'));
  check('no console/page errors', errs.length === 0, errs.join(' | '));
} finally {
  await browser.close();
  await servers.close();
}
console.log(fails ? `\n${fails} FAILED` : '\nall browser checks passed');
process.exit(fails ? 1 : 0);
