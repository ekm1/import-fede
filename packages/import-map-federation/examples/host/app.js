import { el, card, VERSION as UI_V, instanceId as uiId } from '@fed/ui';
import { getCount, increment, subscribe, VERSION as S_V, instanceId as storeId } from '@fed/store';

export const hostMeta = { name: 'host', ui: UI_V, store: S_V, uiId, storeId };

export async function start(fed) {
  const count = el('strong', { id: 'host-count' }, getCount());
  subscribe((n) => { count.textContent = n; });
  const panel = card('Host application', `@fed/ui@${UI_V} · @fed/store@${S_V}`);
  panel.append(
    el('p', { class: 'id' }, `store instance: ${storeId}`),
    el('p', {}, 'shared count: ', count),
    el('button', { id: 'host-inc', onClick: () => increment(1) }, '+1 from Host'),
  );
  document.getElementById('host-panel').append(panel);

  const mounted = [];
  for (const m of fed.mfes) {
    const box = el('div', { class: 'mfe', id: `mfe-${m.name}` });
    document.getElementById('mfes').append(box);
    try {
      const mod = await fed.load(m.name);
      mounted.push(mod.mount(box));
    } catch (err) {
      box.append(el('p', { class: 'err' }, `Failed to mount ${m.name}: ${err.message}`));
      console.error(err);
    }
  }

  renderReport(fed, mounted);
  window.__meta = { host: hostMeta, mfes: mounted };
}

function renderReport(fed, mounted) {
  const byName = Object.fromEntries(mounted.map((m) => [m.name, m]));
  const rows = fed.decisions.map((d) => {
    const m = byName[d.mfe];
    const key = d.dep === '@fed/store' ? 'storeId' : 'uiId';
    const shares = m ? m[key] === hostMeta[key] : null;
    return el('tr', { class: d.action.startsWith('dedupe') ? 'ok' : 'iso' },
      el('td', {}, d.mfe), el('td', {}, d.dep),
      el('td', {}, d.action), el('td', {}, d.resolved),
      el('td', {}, shares === null ? '—' : shares ? 'yes — same instance' : 'no — own copy'));
  });

  document.getElementById('report').append(
    el('h2', {}, 'Resolution'),
    el('table', {},
      el('thead', {}, el('tr', {},
        ...['MFE', 'dependency', 'action', 'version', 'shares host instance?'].map((h) => el('th', {}, h)))),
      el('tbody', {}, rows)),
    el('h2', {}, 'Generated import map'),
    el('pre', {}, JSON.stringify(fed.importMap, null, 2)),
  );
}
