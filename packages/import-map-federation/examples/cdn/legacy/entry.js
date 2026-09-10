import { el, card, VERSION as UI_V, instanceId as uiId } from '@fed/ui';
import { getTotal, add, subscribe, VERSION as S_V, instanceId as storeId } from '@fed/store';
import { legend } from './chunks/legend.js';

export const meta = { name: 'legacy', ui: UI_V, store: S_V, uiId, storeId };

export function mount(root) {
  // add() exists only in v1; the host's v2 would throw here.
  const total = el('strong', { id: 'legacy-total' }, getTotal());
  subscribe((n) => { total.textContent = n; });
  const panel = card('Legacy MFE', `@fed/ui@${UI_V} · @fed/store@${S_V}`);
  panel.append(
    el('p', { class: 'id' }, `store instance: ${storeId}`),
    el('p', {}, 'own total: ', total),
    el('button', { id: 'legacy-inc', onClick: () => add(1) }, '+1 from Legacy'),
    legend(el),
  );
  root.append(panel);
  return meta;
}
