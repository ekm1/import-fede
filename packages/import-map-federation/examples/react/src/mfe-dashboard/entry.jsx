import React, { useState } from 'react';
import { useSelector, useDispatch, __vendor as vReactRedux } from 'react-redux';
import { useLocation } from 'react-router-dom';
import { format, __vendor as vDateFns } from 'date-fns';
import { __vendor as vReact } from 'react';

export const vendors = { react: vReact, 'react-redux': vReactRedux, 'date-fns': vDateFns };

/**
 * Rendered INSIDE the host's React tree. useSelector/useDispatch reach the host's
 * store through context, and useLocation reaches the host's router — both of which
 * only work if React and react-redux are the very same instances the host loaded.
 */
export function App() {
  const items = useSelector((s) => s.cart.items);
  const dispatch = useDispatch();
  const location = useLocation();
  const [n, setN] = useState(0);           // a hook: throws if React is duplicated

  return (
    <div className="mfe-body">
      <p className="id">react {vReact.version} · {vReact.instanceId} — date-fns {vDateFns.version}</p>
      <p>host route seen by MFE: <code>{location.pathname}</code></p>
      <p>cart from host store: <strong id="dash-count">{items.length}</strong></p>
      <p>local hook state: <strong id="dash-local">{n}</strong></p>
      <button id="dash-add" onClick={() => dispatch({ type: 'cart/addItem', payload: { sku: 'DASH-' + Date.now(), from: 'dashboard' } })}>
        Add to host cart
      </button>
      <button id="dash-local-btn" onClick={() => setN((v) => v + 1)}>local +1</button>
      <p className="sub">rendered {format(new Date(), 'yyyy-MM-dd')} by date-fns@{vDateFns.version}</p>
    </div>
  );
}

/** Standalone: no host, so it brings its own store and router. */
export async function mountStandalone(el) {
  const { createRoot } = await import('react-dom/client');
  const { configureStore, createSlice } = await import('@reduxjs/toolkit');
  const { Provider } = await import('react-redux');
  const { BrowserRouter } = await import('react-router-dom');
  const cart = createSlice({ name: 'cart', initialState: { items: [] },
    reducers: { addItem: (s, a) => { s.items.push(a.payload); } } });
  const store = configureStore({ reducer: { cart: cart.reducer } });
  createRoot(el).render(
    <Provider store={store}><BrowserRouter><App /></BrowserRouter></Provider>);
  return vendors;
}
