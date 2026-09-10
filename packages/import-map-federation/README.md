# import-map-federation

Module Federation's shared-dependency semantics — version negotiation, singleton
enforcement, fallback to an MFE's own copy — expressed as a native browser
**import map** instead of MF's container protocol.

The consumer needs no runtime. A React host, a PHP page, or static HTML all
integrate an MFE with an import map and a `<script type="module">`.

## The idea

In Module Federation the share scope is a *runtime data structure*. Here the
share scope **is the import map** — a static, inspectable, cacheable document.
The work moves from runtime to map-generation time, and the browser enforces the
result.

`buildImportMap()` decides, per MFE and per shared dep:

- the elected version **satisfies** the MFE's `requiredVersion` → emit nothing.
  The MFE's bare import falls through to global `imports` and resolves to the
  **same module instance** the host uses. *Deduped.*
- it doesn't → emit a `scopes` entry pinning that MFE's `baseUrl` to its own
  vendored copy. *Isolated; the MFE still runs.*

Same MFE build artifact either way. The MFE never knows which mode it's in, so
it also runs standalone against its own import map with its own packages.

Scopes are lazy — a scope for an MFE that never loads costs only bytes. Every
known MFE can therefore be scoped up front, so the map never needs mutating at
runtime. That is what keeps this working in browsers without multiple-import-map
support (see *Browser constraints*).

## Usage

```js
import { buildImportMap } from './src/resolve.js';

const { importMap, decisions, warnings } = buildImportMap({
  host: { name: 'host', shares: { react: { version: '18.2.0', url: '/vendor/react-18.js' } } },
  mfes: [
    { name: 'mfe-a', baseUrl: 'https://cdn/mfe-a/',
      shared: { react: { requiredVersion: '^18.0.0', version: '18.2.0', url: 'https://cdn/mfe-a/vendor/react-18.js' } } },
    { name: 'mfe-b', baseUrl: 'https://cdn/mfe-b/',
      shared: { react: { requiredVersion: '^17.0.0', version: '17.0.2', url: 'https://cdn/mfe-b/vendor/react-17.js' } } },
  ],
});
```

```json
{
  "imports": { "react": "/vendor/react-18.js" },
  "scopes": {
    "https://cdn/mfe-b/": { "react": "https://cdn/mfe-b/vendor/react-17.js" }
  }
}
```

`host` is optional. With no host the MFEs still dedupe against each other, the
highest version winning (MF's `version-first` strategy). A single MFE and no host
yields a standalone map.

`decisions` is a per-MFE audit log (`dedupe` / `isolate` / `dedupe-forced` /
`dedupe-unsafe`) — assert on it in CI to catch a dep silently splitting in two.

### Singletons

Two copies of a singleton break shared context and hooks, so isolation is the
wrong answer there. On an unsatisfiable singleton, `onSingletonConflict`
chooses: `'host-wins'` (default — force the shared copy and warn, matching MF's
non-strict behaviour), `'isolate'`, or `'error'` (MF's `strictVersion`).

## Emitting the map

The map must exist before the first module load. Fetch manifests in a **classic**
script, inject one import map, then inject the entry module:

```html
<script>
  const map = buildImportMap(await fetchManifests());
  const im = document.createElement('script');
  im.type = 'importmap'; im.textContent = JSON.stringify(map);
  document.head.appendChild(im);
  // only now append the <script type="module"> entry
</script>
```

Because that creates exactly **one** map before any module loads, it needs no
multiple-import-map support. Server-side rendering the map into the document
works identically and avoids the fetch waterfall.

## Browser constraints

Verified in headless Chromium 141 (`test/browser-verify.mjs`):

- `import.meta.resolve(bare)` throws `TypeError` when unmapped — a synchronous,
  zero-network probe. It does **not** check that the file exists.
- Module identity is URL identity: same resolved URL → same namespace object.
  This is what makes singleton enforcement real rather than advisory.
- Import maps merge in document order and **the first definition of a key wins**.
  A later map can *add* keys but can never override one. Corrections must happen
  where the map is generated.
- There is no API to introspect an import map.
- Runtime injection of *additional* maps is Chromium 133+ / WebKit. Firefox has
  it only in Nightly behind `dom.multiple_import_maps.enabled` (since 150) —
  verify current status. The single-map bootstrap above sidesteps this entirely.
- A bare specifier can map to a `blob:` URL that re-exports a live in-memory
  module, so a host that already bundles a dep can share that exact instance.
  Export names must be enumerated, bindings are a snapshot rather than live, and
  CSP needs `script-src blob:`.

## Example

```
npm run example
```

Serves a host on :8099 and a CDN of MFEs on :8100 — two origins, as in a real
deployment.

| | | |
|---|---|---|
| host | `:8099/` | `@fed/ui@1.5.0`, `@fed/store@2.0.0` |
| catalog MFE | `:8100/catalog/standalone.html` | needs `@fed/store@^2.0.0` — **compatible** |
| legacy MFE | `:8100/legacy/standalone.html` | needs `@fed/store@^1.0.0` — **incompatible** |

`@fed/store` v1 exposes `add()` and v2 exposes `increment()`, so handing legacy the
host's v2 would genuinely throw — the fallback isn't decorative.

On the host page, Host and Catalog print the same store instance id and their
counters move together; Legacy has its own instance and counts alone. Both MFEs
still share `@fed/ui` with the host, because **isolation is per dependency, not per
MFE**. The page prints the resolution table and the generated map.

Each MFE also runs standalone from the same build artifact, against a static
import map emitted at build time — a lone MFE has nothing to negotiate, so that
path needs no runtime at all.

## Realistic example: React, Redux, React Router

```
npm install --prefix examples/react/build   # real packages
npm run build:react                          # vendor chunks + app bundles
npm run example:react
```

React 18, Redux Toolkit, react-redux, react-router-dom and date-fns, built with
esbuild into vendor chunks and app bundles wired through a generated import map.

Both MFEs render as React **components inside the host's tree**, so their hooks,
`useSelector` and `useLocation` only work if React, react-redux and react-router
are literally the host's instances. `reports` pins `date-fns@^2` against the
host's v4 and so gets its own copy of that one library — while still sharing
everything else and still reading the host's Redux store.

Clicking "Add from Host" or "Add to host cart" moves one store: the host and both
MFEs update together.

### What building against real packages surfaced

- **`export *` from a CommonJS package emits no named exports.** React is CJS, so
  the builder enumerates export names up front and re-exports them explicitly.
- **Node and esbuild disagree about default exports.** They resolve packages
  through different export conditions, so a package can have a default via
  `require` and none via `import` (react-router-dom). esbuild does the bundling,
  so it decides: the builder retries without the default when esbuild objects.
- **esbuild cannot rewrite `require()` of an external package** into an ESM
  import; it emits a shim that throws at runtime. That shim delegates to a
  `require` in scope, so vendor chunks get a banner binding one to the real ESM
  namespaces of their externals.
- **esbuild's `external` matches subpaths.** Externalising `react-dom` also
  externalises `react-dom/client`, which made that chunk import itself. Since
  `react-dom` already exports `createRoot`, the specifier now points at the same
  chunk — which also guarantees a single renderer instance.
- **Peer deps must stay external.** A react-redux chunk that bundled its own
  React would break every hook. The built chunk imports bare `"react"` and
  resolves through the map like everything else.

### On the negative test

Forcing React to isolate for `reports` produced **no error** — it only calls hooks
through react-redux, which was still shared, and React elements are
interchangeable across copies because `$$typeof` is a global symbol. Forcing the
same on `dashboard`, which calls `useState` from its own import, fails as
expected with `Cannot read properties of null (reading 'useState')`.

So a duplicated singleton does not reliably announce itself. That is why the e2e
asserts **instance identity** directly rather than relying on a crash, and why
`singleton: true` deps are forced onto one copy instead of being isolated.

## Tests

```
npm test                 # resolver logic
npm run test:browser     # generated map, real browser, two origins
npm run test:e2e         # basic example: mount, share, isolate, standalone
npm run test:e2e:react   # React/Redux/Router example (needs build:react first)
```

The e2e test asserts module *instance* identity, not just version strings: it
clicks through the host and both MFEs and checks that shared state moves together
where deduped and stays separate where isolated.

`browser-verify` needs `playwright` and the two fixture origins on :8099/:8100.
It asserts MFE-A shares the host's *instance* while MFE-B, its nested chunks
included, runs on its own copy.

## Vendored semver

`src/semver.js` is MF's own semver (`runtime-core/src/utils/semver`), transpiled
to ESM — 426 lines, no dependencies, MIT. Not reimplemented: range matching is
where a hand-rolled version would quietly diverge.
