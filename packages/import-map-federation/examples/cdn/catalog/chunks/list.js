import { VERSION } from '@fed/ui';        // transitive bare import from a nested chunk
export function productList(el) {
  return el('ul', { class: 'list' },
    ['Widget', 'Gadget', 'Doohickey'].map((n) => el('li', {}, `${n} (rendered by ui@${VERSION})`)));
}
