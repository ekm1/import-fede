# import-map-federation

Module Federation's shared-dependency behaviour (version negotiation, singleton
enforcement, fallback to an MFE's own copy) built on native browser import maps
instead of MF's container protocol.

The consumer needs no runtime. A React host, a PHP page or a static HTML file can
all load an MFE with an import map and a `<script type="module">`.

## The idea

In Module Federation the share scope is a runtime data structure. Here it is the
import map itself: a static document you can read, diff and cache. The work moves
from runtime to map-generation time, and the browser enforces the result.

For each MFE and each shared dependency, `buildImportMap()` does one of two
things. If the elected version satisfies the MFE's `requiredVersion` it emits
nothing, and the MFE's bare import falls through to the global `imports` and
resolves to the same module instance the host uses. Otherwise it emits a `scopes`
entry pinning that MFE's `baseUrl` to its own vendored copy, so the MFE keeps
working on a version it can use.

The build artifact is identical in both cases. An MFE never knows which mode it
is in, which is also why it runs standalone against its own import map and its
own packages.

Scopes cost only bytes until something under them loads, so every known MFE can
be scoped up front and the map never needs mutating at runtime. That is what
keeps this working in browsers without multiple-import-map support (see
[Browser constraints](#browser-constraints)).

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
gives a standalone map.

Each remote's exposes are published as bare specifiers too: `dashboard/App`, plus
the remote's own name for its entry. A page can then `import('dashboard/App')`
with nothing but the import map, no loader and no manifest fetch. A shared
dependency wins any name collision, and the clash is reported in `warnings`. Pass
`exposeRemotes: false` to emit shared dependencies only.

`decisions` is a per-MFE audit log of `dedupe`, `isolate`, `dedupe-forced` and
`dedupe-unsafe`. Assert on it in CI to catch a dependency splitting in two.

### Singletons

Two copies of a singleton break shared context and hooks, so isolating one is the
wrong answer. On an unsatisfiable singleton, `onSingletonConflict` picks between
`'host-wins'` (the default: force the shared copy and warn, matching MF's
non-strict behaviour), `'isolate'`, and `'error'` (MF's `strictVersion`).

## Emitting the map

The map has to exist before the first module load. Fetch the manifests from a
classic script, inject one import map, then inject the entry module:

```html
<script>
  const map = buildImportMap(await fetchManifests());
  const im = document.createElement('script');
  im.type = 'importmap'; im.textContent = JSON.stringify(map);
  document.head.appendChild(im);
  // only now append the <script type="module"> entry
</script>
```

That creates exactly one map before any module loads, so it needs no
multiple-import-map support. Rendering the map into the document server-side
works the same way and avoids the fetch waterfall.

## Browser constraints

Verified in headless Chromium 141 by `test/browser-verify.mjs`:

- `import.meta.resolve(bare)` throws a `TypeError` when the specifier is
  unmapped, which gives you a synchronous, zero-network probe. It does not check
  that the file exists.
- Module identity is URL identity: the same resolved URL yields the same
  namespace object. Singleton enforcement rests entirely on this.
- Import maps merge in document order, and the first definition of a key wins. A
  later map can add keys but can never override one, so corrections have to
  happen where the map is generated.
- There is no API to introspect an import map.
- Runtime injection of additional maps works in Chromium 133+ and WebKit.
  Firefox has it only in Nightly behind `dom.multiple_import_maps.enabled`, since
  version 150, so check the current status. The single-map bootstrap above avoids
  the question.
- A bare specifier can map to a `blob:` URL that re-exports a live in-memory
  module, letting a host that already bundles a dependency share that exact
  instance. The export names have to be enumerated, the bindings are a snapshot
  and not live, and CSP needs `script-src blob:`.

## Example

```
npm run example
```

Serves a host on :8099 and a CDN of MFEs on :8100, two origins as in a real
deployment.

| | | |
|---|---|---|
| host | `:8099/` | `@fed/ui@1.5.0`, `@fed/store@2.0.0` |
| catalog MFE | `:8100/catalog/standalone.html` | needs `@fed/store@^2.0.0`, compatible |
| legacy MFE | `:8100/legacy/standalone.html` | needs `@fed/store@^1.0.0`, incompatible |

`@fed/store` v1 exposes `add()` and v2 exposes `increment()`, so handing legacy
the host's v2 would throw. The fallback is load-bearing.

On the host page, Host and Catalog print the same store instance id and their
counters move together, while Legacy has its own instance and counts alone. Both
MFEs still share `@fed/ui` with the host, because isolation applies per
dependency and not per MFE. The page prints the resolution table and the
generated map.

Each MFE also runs standalone from the same build artifact against a static
import map emitted at build time. A lone MFE has nothing to negotiate, so that
path needs no runtime at all.

## Realistic example: React, Redux, React Router

```
npm install --prefix examples/react/build   # real packages
npm run build:react                          # vendor chunks + app bundles
npm run example:react
```

React 18, Redux Toolkit, react-redux, react-router-dom and date-fns, built with
esbuild into vendor chunks and app bundles wired through a generated import map.

Both MFEs render as React components inside the host's tree, so their hooks,
`useSelector` and `useLocation` only work if React, react-redux and react-router
are the host's own instances. `reports` pins `date-fns@^2` against the host's v4
and gets its own copy of that one library, while still sharing everything else
and still reading the host's Redux store.

Clicking "Add from Host" or "Add to host cart" moves one store: the host and both
MFEs update together.

### What building against real packages surfaced

`export *` from a CommonJS package emits no named exports. React is CJS, so the
builder enumerates the export names up front and re-exports them explicitly.

Node and esbuild resolve packages through different export conditions and so
disagree about default exports: react-router-dom has one via `require` and none
via `import`. esbuild does the bundling, so it decides, and the builder retries
without the default when esbuild objects.

esbuild cannot rewrite `require()` of an external package into an ESM import. It
emits a shim that throws at runtime, but the shim delegates to a `require` in
scope, so vendor chunks get a banner binding one to the real ESM namespaces of
their externals.

esbuild's `external` matches subpaths, so externalising `react-dom` also
externalises `react-dom/client`, which made that chunk import itself. `react-dom`
already exports `createRoot`, so that specifier now points at the same chunk,
which also guarantees a single renderer instance.

Peer dependencies have to stay external. A react-redux chunk that bundled its own
React would break every hook, so the built chunk imports bare `"react"` and
resolves through the map like everything else.

### On the negative test

Forcing React to isolate for `reports` produced no error at all. It only calls
hooks through react-redux, which was still shared, and React elements are
interchangeable across copies because `$$typeof` is a global symbol. Forcing the
same on `dashboard`, which calls `useState` from its own import, fails as
expected with `Cannot read properties of null (reading 'useState')`.

A duplicated singleton therefore does not reliably announce itself. That is why
the e2e asserts instance identity directly instead of waiting for a crash, and
why `singleton: true` dependencies are forced onto one copy.

## Tests

```
npm run test:all         # everything below
npm test                 # resolver logic
npm run test:browser     # generated map, real browser, two origins
npm run test:e2e         # basic example: mount, share, isolate, standalone
npm run test:e2e:react   # React/Redux/Router example (needs build:react first)
```

The browser suites need `playwright`. Each one starts its own servers on its own
ports, so none of them can pass against a server left running from something
else.

They assert module instance identity rather than version strings: the e2e clicks
through the host and both MFEs and checks that shared state moves together where
deduped and stays separate where isolated.

## Vendored semver

`src/semver.js` is MF's own semver from `runtime-core/src/utils/semver`,
transpiled to ESM. No dependencies, MIT. It is vendored rather than reimplemented
because range matching is where a hand-rolled version would drift without anyone
noticing.
