/**
 * End-to-end: boots the example host with two MFEs in a real browser and asserts
 * that a compatible MFE shares the host's module *instance* while an incompatible
 * one falls back to its own — including that shared state moves together.
 */
import pw from 'playwright';
import { startServers } from '../examples/serve.mjs';

const { chromium } = pw;
let fails = 0;
const check = (label, cond, extra = '') => {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (cond ? '' : '  <- ' + extra));
  if (!cond) fails++;
};

const servers = await startServers({ hostPort: 8199, cdnPort: 8200 });
const browser = await chromium.launch();
const errors = [];

try {
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 200)));
  await page.goto(`${servers.hostUrl}/?cdn=${encodeURIComponent(servers.cdnUrl)}`);
  await page.waitForFunction('window.__ready === true', null, { timeout: 15000 });

  const bootError = await page.evaluate(() => window.__bootError);
  check('host bootstraps', !bootError, bootError);

  const meta = await page.evaluate(() => window.__meta);
  const host = meta.host;
  const catalog = meta.mfes.find((m) => m.name === 'catalog');
  const legacy = meta.mfes.find((m) => m.name === 'legacy');
  check('both MFEs mounted', !!catalog && !!legacy);

  console.log('\n-- dedupe vs isolate, per dependency --');
  check('catalog SHARES host @fed/store instance', catalog.storeId === host.storeId,
    `${catalog.storeId} vs ${host.storeId}`);
  check('legacy has its OWN @fed/store instance', legacy.storeId !== host.storeId);
  check('legacy resolved store 1.0.0', legacy.store === '1.0.0', legacy.store);
  check('catalog resolved store 2.0.0', catalog.store === '2.0.0', catalog.store);
  check('catalog SHARES host @fed/ui', catalog.uiId === host.uiId);
  check('legacy ALSO shares host @fed/ui (isolation is per-dep)', legacy.uiId === host.uiId,
    `${legacy.uiId} vs ${host.uiId}`);
  check('legacy got ui 1.5.0 from host, not its own 1.2.0', legacy.ui === '1.5.0', legacy.ui);

  const read = () => page.evaluate(() => ({
    host: +document.getElementById('host-count').textContent,
    catalog: +document.getElementById('catalog-count').textContent,
    legacy: +document.getElementById('legacy-total').textContent,
  }));

  console.log('\n-- shared state actually moves together --');
  check('all start at 0', JSON.stringify(await read()) === '{"host":0,"catalog":0,"legacy":0}');

  await page.click('#host-inc');
  let s = await read();
  check('host +1 -> catalog follows', s.host === 1 && s.catalog === 1, JSON.stringify(s));
  check('host +1 -> legacy unaffected', s.legacy === 0, JSON.stringify(s));

  await page.click('#catalog-inc');
  s = await read();
  check('catalog +1 -> host follows', s.host === 2 && s.catalog === 2, JSON.stringify(s));
  check('catalog +1 -> legacy still unaffected', s.legacy === 0, JSON.stringify(s));

  await page.click('#legacy-inc');
  s = await read();
  check('legacy +1 -> only legacy moves', s.legacy === 1 && s.host === 2 && s.catalog === 2,
    JSON.stringify(s));

  console.log('\n-- same artifacts, standalone, no host --');
  for (const [name, wantStore, wantUi] of [['catalog', '2.0.0', '1.5.0'], ['legacy', '1.0.0', '1.2.0']]) {
    const sp = await browser.newPage();
    sp.on('pageerror', (e) => errors.push(`[${name} standalone] ` + String(e).slice(0, 160)));
    await sp.goto(`${servers.cdnUrl}/${name}/standalone.html`);
    await sp.waitForFunction('window.__ready === true', null, { timeout: 10000 }).catch(() => {});
    const m = await sp.evaluate(() => window.__meta);
    check(`${name} runs standalone on its own packages`,
      m && m.store === wantStore && m.ui === wantUi, JSON.stringify(m));
    await sp.close();
  }

  console.log('');
  check('no console/page errors', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close();
  await servers.close();
}

console.log(fails ? `\n${fails} FAILED` : '\nall e2e checks passed');
process.exit(fails ? 1 : 0);
