import React from 'react';
import { useSelector, __vendor as vReactRedux } from 'react-redux';
import { format, formatDistanceToNow, __vendor as vDateFns } from 'date-fns';
import { __vendor as vReact } from 'react';

export const vendors = { react: vReact, 'react-redux': vReactRedux, 'date-fns': vDateFns };

// Pins date-fns@^2 against the host's v4, so it gets its own copy of that one
// library while still sharing React and reading the host's store.
export function App() {
  const items = useSelector((s) => s.cart.items);
  const since = new Date(Date.now() - 1000 * 60 * 90);

  return (
    <div className="mfe-body">
      <p className="id">react {vReact.version} · {vReact.instanceId} — date-fns {vDateFns.version}</p>
      <p>items in host cart: <strong id="rep-count">{items.length}</strong></p>
      <ul className="list">
        {items.map((it, i) => <li key={i}>{it.sku} <span className="sub">via {it.from}</span></li>)}
      </ul>
      <p className="sub" id="rep-date">
        report window: {format(since, 'yyyy-MM-dd HH:mm')} ({formatDistanceToNow(since)} ago)
      </p>
    </div>
  );
}

export async function mountStandalone(el) {
  const { createRoot } = await import('react-dom/client');
  const { configureStore, createSlice } = await import('@reduxjs/toolkit');
  const { Provider } = await import('react-redux');
  const cart = createSlice({ name: 'cart', initialState: { items: [{ sku: 'DEMO-1', from: 'standalone' }] },
    reducers: { addItem: (s, a) => { s.items.push(a.payload); } } });
  const store = configureStore({ reducer: { cart: cart.reducer } });
  createRoot(el).render(<Provider store={store}><App /></Provider>);
  return vendors;
}
