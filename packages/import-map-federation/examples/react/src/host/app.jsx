import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import { Provider, useSelector, useDispatch, __vendor as vReactRedux } from 'react-redux';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { format, __vendor as vDateFns } from 'date-fns';
import { __vendor as vReact } from 'react';

const cart = createSlice({
  name: 'cart',
  initialState: { items: [] },
  reducers: { addItem: (s, a) => { s.items.push(a.payload); } },
});
const store = configureStore({ reducer: { cart: cart.reducer } });

export const vendors = { react: vReact, 'react-redux': vReactRedux, 'date-fns': vDateFns };

function HostPanel() {
  const items = useSelector((s) => s.cart.items);
  const dispatch = useDispatch();
  const location = useLocation();
  return (
    <div className="card">
      <h3>Host application</h3>
      <p className="id">react {vReact.version} · {vReact.instanceId} — date-fns {vDateFns.version}</p>
      <p>route: <code>{location.pathname}</code> · cart: <strong id="host-count">{items.length}</strong></p>
      <button id="host-add" onClick={() => dispatch(cart.actions.addItem({ sku: 'HOST-' + Date.now(), from: 'host' }))}>
        Add from Host
      </button>
      <nav className="sub">
        <Link to="/">home</Link> · <Link to="/orders">orders</Link>
      </nav>
      <p className="sub">built {format(new Date(), 'yyyy-MM-dd')} · date-fns@{vDateFns.version}</p>
    </div>
  );
}

function Report({ fed, mounted }) {
  const rows = fed.decisions.map((d, i) => {
    const m = mounted.find((x) => x.name === d.mfe);
    const v = m?.vendors?.[d.dep];
    const hostV = vendors[d.dep];
    const shares = v && hostV ? v.instanceId === hostV.instanceId : null;
    return (
      <tr key={i} className={d.action.startsWith('dedupe') ? 'ok' : 'iso'}>
        <td>{d.mfe}</td><td>{d.dep}</td><td>{d.action}</td><td>{d.resolved}</td>
        <td>{shares === null ? '—' : shares ? 'yes — same instance' : 'no — own copy'}</td>
      </tr>
    );
  });
  return (
    <>
      <h2>Resolution</h2>
      <table>
        <thead><tr>{['MFE', 'dependency', 'action', 'version', 'shares host instance?'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows}</tbody>
      </table>
      <h2>Generated import map</h2>
      <pre>{JSON.stringify(fed.importMap, null, 2)}</pre>
    </>
  );
}

function Shell({ fed, remotes }) {
  const mounted = remotes.map((r) => ({ name: r.name, vendors: r.mod.vendors }));
  return (
    <>
      <HostPanel />
      <Routes>
        <Route path="/orders" element={<p className="sub">Orders route — MFEs stay mounted below.</p>} />
        <Route path="*" element={null} />
      </Routes>
      <section id="mfes">
        {remotes.map((r) => (
          <div className="mfe" id={`mfe-${r.name}`} key={r.name}>
            <h3>{r.name} MFE</h3>
            <r.mod.App />
          </div>
        ))}
      </section>
      <Report fed={fed} mounted={mounted} />
    </>
  );
}

export async function start(fed) {
  const remotes = [];
  for (const m of fed.mfes) remotes.push({ name: m.name, mod: await fed.load(m.name) });
  createRoot(document.getElementById('root')).render(
    <Provider store={store}>
      <BrowserRouter>
        <Shell fed={fed} remotes={remotes} />
      </BrowserRouter>
    </Provider>,
  );
  window.__vendors = { host: vendors, mfes: Object.fromEntries(remotes.map((r) => [r.name, r.mod.vendors])) };
}
