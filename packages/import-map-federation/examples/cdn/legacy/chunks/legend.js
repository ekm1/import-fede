import { VERSION } from '@fed/ui';
export function legend(el) {
  return el('p', { class: 'sub' },
    `This MFE pins @fed/store@^1.0.0, but still shares @fed/ui@${VERSION} with the host.`);
}
