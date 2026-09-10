import { el, card, VERSION as UI_V, instanceId as uiId } from '@fed/ui';
import { getCount, increment, subscribe, VERSION as S_V, instanceId as storeId } from '@fed/store';
import { productList } from './chunks/list.js';

export const meta = { name: 'catalog', ui: UI_V, store: S_V, uiId, storeId };

export function mount(root) {
  const count = el('strong', { id: 'catalog-count' }, getCount());
  subscribe((n) => { count.textContent = n; });
  const panel = card('Catalog MFE', `@fed/ui@${UI_V} · @fed/store@${S_V}`);
  panel.append(
    el('p', { class: 'id' }, `store instance: ${storeId}`),
    el('p', {}, 'shared count: ', count),
    el('button', { id: 'catalog-inc', onClick: () => increment(1) }, '+1 from Catalog'),
    productList(el),
  );
  root.append(panel);
  return meta;
}
