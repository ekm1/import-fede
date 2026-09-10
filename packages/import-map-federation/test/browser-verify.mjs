import pw from 'playwright'; const { chromium } = pw;
import { buildImportMap } from '../src/resolve.js';
const CDN = 'http://127.0.0.1:8100';
const { importMap, decisions } = buildImportMap({
  host: { name:'host', shares: { react: { version:'18.2.0', url:'http://127.0.0.1:8099/vendor/react-18.js' } } },
  mfes: [
    { name:'mfe-a', baseUrl:`${CDN}/mfe-a/`, shared:{ react:{ requiredVersion:'^18.0.0', version:'18.2.0', url:`${CDN}/mfe-a/vendor/react-18.js` } } },
    { name:'mfe-b', baseUrl:`${CDN}/mfe-b/`, shared:{ react:{ requiredVersion:'^17.0.0', version:'17.0.2', url:`${CDN}/mfe-b/vendor/react-17.js` } } },
  ],
});
const b = await chromium.launch(); const p = await b.newPage();
const errs=[]; p.on('console', m=>{ if(m.type()==='error') errs.push(m.text().slice(0,140)); });
await p.goto('http://127.0.0.1:8099/federated.html');
await p.evaluate((map) => {
  const s = document.createElement('script');
  s.type = 'importmap'; s.textContent = JSON.stringify(map);
  document.head.appendChild(s);
}, importMap);
const out = await p.evaluate(async () => {
  const host = await import('react');
  const a  = await import('http://127.0.0.1:8100/mfe-a/entry.js');
  const bb = await import('http://127.0.0.1:8100/mfe-b/entry.js');
  return {
    host: host.version + '/' + host.marker.owner,
    mfeA: a.seen + '/' + a.marker.owner + ' (deep ' + a.deepSeen + ')',
    mfeB: bb.seen + '/' + bb.marker.owner + ' (deep ' + bb.deepSeen + ')',
    mfeA_SAME_INSTANCE_as_host: a.marker === host.marker,
    mfeB_isolated_from_host:    bb.marker !== host.marker,
  };
});
console.log('decisions:', JSON.stringify(decisions));
console.log(JSON.stringify(out, null, 2));
console.log('consoleErrors:', errs.length);
await b.close();
