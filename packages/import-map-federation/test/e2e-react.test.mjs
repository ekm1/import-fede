// The MFEs render inside the host's React tree, so a duplicated React or
// react-redux breaks them outright. Instance ids are asserted directly because a
// duplicate does not reliably throw: it only surfaces when the MFE calls a hook
// from its own copy.
import pw from 'playwright';
import { startServers } from '../examples/serve.mjs';

const { chromium } = pw;
let fails = 0;
const check = (label, cond, extra = '') => {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (cond ? '' : '  <- ' + extra));
  if (!cond) fails++;
};

const servers = await startServers({ hostPort: 8399, cdnPort: 8400, example: 'react' });
const browser = await chromium.launch();
const errors = [];

try {
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 200)));
  await page.goto(`${servers.hostUrl}/?cdn=${encodeURIComponent(servers.cdnUrl)}`);
  await page.waitForFunction('window.__ready === true', null, { timeout: 25000 });

  const bootError = await page.evaluate(() => window.__bootError);
  check('host boots with real React stack', !bootError, bootError);

  const v = await page.evaluate(() => window.__vendors);
  const id = (who, dep) => (who === 'host' ? v.host : v.mfes[who])?.[dep]?.instanceId;
  const ver = (who, dep) => (who === 'host' ? v.host : v.mfes[who])?.[dep]?.version;

  console.log('\n-- singletons are genuinely single --');
  check('react: host === dashboard', id('host', 'react') === id('dashboard', 'react'),
    `${id('host', 'react')} vs ${id('dashboard', 'react')}`);
  check('react: host === reports', id('host', 'react') === id('reports', 'react'));
  check('react-redux: host === dashboard', id('host', 'react-redux') === id('dashboard', 'react-redux'));
  check('react-redux: host === reports', id('host', 'react-redux') === id('reports', 'react-redux'));

  console.log('\n-- the one incompatible dep is isolated, the rest are not --');
  check('date-fns: dashboard shares host v4', id('host', 'date-fns') === id('dashboard', 'date-fns'));
  check('date-fns: reports has its OWN copy', id('host', 'date-fns') !== id('reports', 'date-fns'));
  check('date-fns: host/dashboard on 4.4.0',
    ver('host', 'date-fns') === '4.4.0' && ver('dashboard', 'date-fns') === '4.4.0');
  check('date-fns: reports on 2.30.0', ver('reports', 'date-fns') === '2.30.0', ver('reports', 'date-fns'));
  check('reports still rendered with its v2 date-fns',
    /report window: \d{4}-\d{2}-\d{2}/.test(await page.textContent('#rep-date')));

  console.log('\n-- remotes are map entries, not just URLs --');
  const map = await page.evaluate(() => window.__fed.importMap);
  check('map publishes "dashboard/App"', typeof map.imports['dashboard/App'] === 'string',
    JSON.stringify(Object.keys(map.imports)));
  check('map publishes "reports/App"', typeof map.imports['reports/App'] === 'string');
  check('a page can import the remote by name with only the map',
    await page.evaluate(async () => {
      const m = await import('dashboard/App');
      return typeof m.App === 'function';
    }));

  const counts = () => page.evaluate(() => ({
    host: +document.getElementById('host-count').textContent,
    dash: +document.getElementById('dash-count').textContent,
    rep: +document.getElementById('rep-count').textContent,
  }));

  console.log('\n-- one Redux store across the boundary --');
  check('all read 0', JSON.stringify(await counts()) === '{"host":0,"dash":0,"rep":0}');
  await page.click('#host-add');
  let c = await counts();
  check('host dispatch reaches both MFEs', c.host === 1 && c.dash === 1 && c.rep === 1, JSON.stringify(c));
  await page.click('#dash-add');
  c = await counts();
  check('MFE dispatch reaches host store', c.host === 2 && c.dash === 2 && c.rep === 2, JSON.stringify(c));

  console.log('\n-- hooks and router context cross the boundary --');
  await page.click('#dash-local-btn');
  check('MFE useState works inside host tree',
    (await page.textContent('#dash-local')) === '1');
  check('MFE sees host route "/"', (await page.textContent('#mfe-dashboard')).includes('/'));
  await page.click('a[href="/orders"]');
  await page.waitForFunction(
    () => document.querySelector('#mfe-dashboard').textContent.includes('/orders'),
    null, { timeout: 5000 }).catch(() => {});
  check('MFE follows host navigation to /orders',
    (await page.textContent('#mfe-dashboard')).includes('/orders'));

  console.log('\n-- same artifacts, standalone, no host --');
  for (const [name, wantDateFns] of [['dashboard', '4.4.0'], ['reports', '2.30.0']]) {
    const sp = await browser.newPage();
    const sErrs = [];
    sp.on('pageerror', (e) => sErrs.push(String(e).slice(0, 200)));
    await sp.goto(`${servers.cdnUrl}/${name}/standalone.html`);
    await sp.waitForFunction('window.__ready === true', null, { timeout: 15000 }).catch(() => {});
    const sv = await sp.evaluate(() => window.__vendors);
    const be = await sp.evaluate(() => window.__bootError);
    check(`${name} runs standalone with its own React + store`,
      !be && sv?.['date-fns']?.version === wantDateFns && sErrs.length === 0,
      be || JSON.stringify(sv) + sErrs.join('|'));
    await sp.close();
  }

  console.log('');
  check('no console/page errors', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close();
  await servers.close();
}

console.log(fails ? `\n${fails} FAILED` : '\nall react e2e checks passed');
process.exit(fails ? 1 : 0);
