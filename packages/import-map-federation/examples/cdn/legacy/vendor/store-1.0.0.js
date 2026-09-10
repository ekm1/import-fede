// @fed/store@1.0.0 — v1 API: add(). Deliberately has no increment(),
// so handing this MFE the host's v2 would throw. Isolation is required.
const state = { total: 0 };
const subs = new Set();
export const VERSION = '1.0.0';
export const instanceId = 'store-' + Math.random().toString(36).slice(2, 7);
export function getTotal() { return state.total; }
export function add(n = 1) {
  state.total += n;
  subs.forEach((f) => f(state.total));
  return state.total;
}
export function subscribe(f) { subs.add(f); return () => subs.delete(f); }
