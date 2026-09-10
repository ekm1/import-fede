import { buildImportMap } from './resolve.js';

/**
 * Fetch an MFE manifest and resolve its relative URLs against the manifest's own
 * location, so an MFE stays relocatable — move the folder, nothing to rewrite.
 */
export async function fetchManifest(manifestUrl) {
  const abs = new URL(manifestUrl, location.href).href;
  const res = await fetch(abs);
  if (!res.ok) throw new Error(`Manifest ${abs} -> HTTP ${res.status}`);
  const m = await res.json();
  const baseUrl = new URL('.', abs).href;
  const rel = (u) => (u ? new URL(u, baseUrl).href : undefined);

  const shared = {};
  for (const [name, s] of Object.entries(m.shared ?? {})) shared[name] = { ...s, url: rel(s.url) };
  const exposes = {};
  for (const [k, v] of Object.entries(m.exposes ?? {})) exposes[k] = rel(v);

  return { name: m.name, baseUrl, entry: rel(m.entry), exposes, shared };
}

/** Inject the import map. MUST run before the first module load. */
export function injectImportMap(importMap) {
  if (document.querySelector('script[type="importmap"][data-federation]')) {
    throw new Error('An import map has already been injected by this bootstrap.');
  }
  const s = document.createElement('script');
  s.type = 'importmap';
  s.dataset.federation = '';
  s.textContent = JSON.stringify(importMap);
  document.head.appendChild(s);
  return s;
}

/**
 * Resolve every MFE's shared deps into one import map, inject it, and hand back
 * a loader. Call this from a CLASSIC script: importing this module would itself
 * count as the first module load and lock the map in browsers that allow only
 * one (see README, "Browser constraints").
 */
export async function bootstrap({ host = null, manifests = [], onSingletonConflict } = {}) {
  const mfes = await Promise.all(manifests.map(fetchManifest));
  const { importMap, decisions, warnings } = buildImportMap({ host, mfes, onSingletonConflict });
  injectImportMap(importMap);
  for (const w of warnings) console.warn('[federation]', w);

  const byName = new Map(mfes.map((m) => [m.name, m]));
  async function load(name, expose = './App') {
    const m = byName.get(name);
    if (!m) throw new Error(`Unknown MFE "${name}". Known: ${[...byName.keys()].join(', ')}`);
    const url = m.exposes[expose] ?? m.entry;
    if (!url) throw new Error(`MFE "${name}" exposes no "${expose}"`);
    return import(url);
  }
  return { importMap, decisions, warnings, mfes, load };
}
