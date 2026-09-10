import { buildImportMap } from './resolve.js';

// URLs are resolved against the manifest's own location, so an MFE stays
// relocatable: move the folder and nothing needs rewriting.
export async function fetchManifest(manifestUrl) {
  const abs = new URL(manifestUrl, location.href).href;
  const res = await fetch(abs);
  if (!res.ok) throw new Error(`Manifest ${abs} -> HTTP ${res.status}`);

  const manifest = await res.json();
  const baseUrl = new URL('.', abs).href;
  const rel = (u) => (u ? new URL(u, baseUrl).href : undefined);

  const shared = {};
  for (const [name, s] of Object.entries(manifest.shared ?? {})) {
    shared[name] = { ...s, url: rel(s.url) };
  }
  const exposes = {};
  for (const [key, url] of Object.entries(manifest.exposes ?? {})) {
    exposes[key] = rel(url);
  }

  return { name: manifest.name, baseUrl, entry: rel(manifest.entry), exposes, shared };
}

export function injectImportMap(importMap) {
  if (document.querySelector('script[type="importmap"][data-federation]')) {
    throw new Error('An import map has already been injected by this bootstrap.');
  }
  const script = document.createElement('script');
  script.type = 'importmap';
  script.dataset.federation = '';
  script.textContent = JSON.stringify(importMap);
  document.head.appendChild(script);
  return script;
}

// Call this from a classic script. Importing it as a module would itself be the
// first module load, which locks the import map in browsers that allow only one.
export async function bootstrap({ host = null, manifests = [], onSingletonConflict } = {}) {
  const mfes = await Promise.all(manifests.map(fetchManifest));
  const { importMap, decisions, warnings } = buildImportMap({ host, mfes, onSingletonConflict });

  injectImportMap(importMap);
  for (const w of warnings) console.warn('[federation]', w);

  const byName = new Map(mfes.map((m) => [m.name, m]));

  async function load(name, expose = './App') {
    const mfe = byName.get(name);
    if (!mfe) throw new Error(`Unknown MFE "${name}". Known: ${[...byName.keys()].join(', ')}`);
    const url = mfe.exposes[expose] ?? mfe.entry;
    if (!url) throw new Error(`MFE "${name}" exposes no "${expose}"`);
    return import(url);
  }

  return { importMap, decisions, warnings, mfes, load };
}
