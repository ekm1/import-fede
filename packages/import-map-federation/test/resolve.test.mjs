import { buildImportMap } from '../src/resolve.js';
const CDN = 'http://127.0.0.1:8100';
const p = (o) => JSON.stringify(o);
let fails = 0;
const check = (label, cond, extra='') => { console.log((cond?'  PASS  ':'  FAIL  ')+label+(cond?'':' '+extra)); if(!cond) fails++; };

const host = { name: 'host', shares: { react: { version: '18.2.0', url: 'http://127.0.0.1:8099/vendor/react-18.js' } } };
const mfeA = { name: 'mfe-a', baseUrl: `${CDN}/mfe-a/`,
  shared: { react: { requiredVersion: '^18.0.0', version: '18.2.0', url: `${CDN}/mfe-a/vendor/react-18.js` } } };
const mfeB = { name: 'mfe-b', baseUrl: `${CDN}/mfe-b/`,
  shared: { react: { requiredVersion: '^17.0.0', version: '17.0.2', url: `${CDN}/mfe-b/vendor/react-17.js` } } };

console.log('\n1. federated host: compatible dedupes, incompatible isolates');
const r1 = buildImportMap({ host, mfes: [mfeA, mfeB] });
check('MFE-A deduped', r1.decisions.find(d=>d.mfe==='mfe-a').action === 'dedupe');
check('MFE-B isolated', r1.decisions.find(d=>d.mfe==='mfe-b').action === 'isolate');
check('no scope for MFE-A', !r1.importMap.scopes?.[mfeA.baseUrl]);
check('scope pins MFE-B to own copy', r1.importMap.scopes[mfeB.baseUrl].react === `${CDN}/mfe-b/vendor/react-17.js`);
console.log('     map: ' + p(r1.importMap));

console.log('\n2. NO host: MFEs still dedupe with each other (highest wins)');
const old = { name: 'mfe-old', baseUrl: `${CDN}/mfe-old/`,
  shared: { lodash: { requiredVersion: '^4.0.0', version: '4.17.20', url: `${CDN}/mfe-old/vendor/lodash.js` } } };
const neu = { name: 'mfe-new', baseUrl: `${CDN}/mfe-new/`,
  shared: { lodash: { requiredVersion: '^4.17.0', version: '4.17.21', url: `${CDN}/mfe-new/vendor/lodash.js` } } };
const r2 = buildImportMap({ mfes: [old, neu] });
check('elects highest (4.17.21)', r2.importMap.imports.lodash === `${CDN}/mfe-new/vendor/lodash.js`, p(r2.importMap));
check('both dedupe, no scopes', !r2.importMap.scopes && r2.decisions.every(d=>d.action==='dedupe'));

console.log('\n3. standalone: one MFE, no host -> runs on its own packages');
const r3 = buildImportMap({ mfes: [mfeB] });
check('maps to its own copy', r3.importMap.imports.react === `${CDN}/mfe-b/vendor/react-17.js`);
check('no scopes needed', !r3.importMap.scopes);

console.log('\n4. singleton conflict -> forced share, not two copies');
const sB = { ...mfeB, shared: { react: { ...mfeB.shared.react, singleton: true } } };
const r4 = buildImportMap({ host, mfes: [mfeA, sB] });
check('forced onto shared copy', r4.decisions.find(d=>d.mfe==='mfe-b').action === 'dedupe-forced');
check('no second React scoped in', !r4.importMap.scopes);
check('warned about it', r4.warnings.length === 1, p(r4.warnings));
let threw = false;
try { buildImportMap({ host, mfes: [mfeA, sB], onSingletonConflict: 'error' }); }
catch { threw = true; }
check("onSingletonConflict:'error' throws", threw);
console.log(fails ? `\n${fails} FAILED` : '\nall checks passed');
process.exit(fails ? 1 : 0);
