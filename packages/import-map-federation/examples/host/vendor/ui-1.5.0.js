// @fed/ui@1.5.0
export const VERSION = '1.5.0';
export const instanceId = 'ui-' + Math.random().toString(36).slice(2, 7);
export function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2).toLowerCase(), v);
    else n.setAttribute(k, v);
  }
  for (const k of kids.flat()) n.append(k?.nodeType ? k : String(k));
  return n;
}
export function card(title, subtitle) {
  return el('div', { class: 'card' }, el('h3', {}, title), el('p', { class: 'sub' }, subtitle));
}
