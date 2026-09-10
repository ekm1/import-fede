// @fed/store@2.0.0 — v2 API: increment()
const state = { count: 0 };
const subs = new Set();
export const VERSION = '2.0.0';
export const instanceId = 'store-' + Math.random().toString(36).slice(2, 7);
export function getCount() { return state.count; }
export function increment(by = 1) {
  state.count += by;
  subs.forEach((f) => f(state.count));
  return state.count;
}
export function subscribe(f) { subs.add(f); return () => subs.delete(f); }
