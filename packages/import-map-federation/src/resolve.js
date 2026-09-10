import { satisfy } from './semver.js';

/**
 * Build an import map that dedupes shared deps across a federated host + MFEs,
 * while letting any MFE fall back to its own copy when no compatible version exists.
 *
 * Resolution per shared dep, mirroring MF's "version-first" strategy:
 *   1. Collect candidates: the host's copy (if any) + every MFE's own copy.
 *   2. Elect a winner  -> global `imports`. Host wins by default, else highest version.
 *   3. Per MFE: winner satisfies its requiredVersion -> emit nothing. It falls through
 *      to `imports` and shares the *same module instance*.
 *      Otherwise -> emit a `scopes` entry pinning that MFE's baseUrl to its own copy.
 *
 * Scopes are lazy: a scope for an MFE that never loads costs only bytes. So every
 * known MFE can be scoped up front and the map never has to be mutated at runtime
 * (which is what keeps this working in browsers without multiple-import-map support).
 */
export function buildImportMap({ host = null, mfes = [], onSingletonConflict = 'host-wins' } = {}) {
  const imports = {};
  const scopes = {};
  const decisions = [];
  const warnings = [];

  const names = new Set();
  for (const n of Object.keys(host?.shares ?? {})) names.add(n);
  for (const m of mfes) for (const n of Object.keys(m.shared ?? {})) names.add(n);

  for (const name of names) {
    const hostShare = host?.shares?.[name];
    const consumers = mfes
      .filter((m) => m.shared?.[name])
      .map((m) => ({ mfe: m, dep: m.shared[name] }));

    // --- elect the winner that lands in global `imports` ---
    let winner = hostShare
      ? { version: hostShare.version, url: hostShare.url, from: host.name ?? 'host' }
      : null;
    if (!winner) {
      for (const { mfe, dep } of consumers) {
        if (!dep.version || !dep.url) continue;
        if (!winner || satisfy(winner.version, `<=${dep.version}`)) {
          winner = { version: dep.version, url: dep.url, from: mfe.name };
        }
      }
    }
    if (!winner) continue;
    imports[name] = winner.url;

    // --- per-consumer: dedupe or isolate ---
    for (const { mfe, dep } of consumers) {
      const range = dep.requiredVersion ?? `^${dep.version}`;
      const compatible = range === '*' || range === false || satisfy(winner.version, range);

      if (compatible) {
        decisions.push({ mfe: mfe.name, dep: name, action: 'dedupe',
          resolved: winner.version, from: winner.from });
        continue;
      }

      const singleton = dep.singleton ?? false;
      if (singleton) {
        const msg = `Singleton "${name}": ${mfe.name} requires ${range} but the shared copy `
          + `is ${winner.version} (from ${winner.from}).`;
        if (onSingletonConflict === 'error') {
          throw new Error(msg + ' Refusing to build a map with two copies of a singleton.');
        }
        if (onSingletonConflict === 'host-wins') {
          // Two copies of a singleton break shared context/hooks. Force the shared one.
          warnings.push(msg + ' Forcing the shared copy (set onSingletonConflict to change).');
          decisions.push({ mfe: mfe.name, dep: name, action: 'dedupe-forced',
            resolved: winner.version, from: winner.from, requested: range });
          continue;
        }
        warnings.push(msg + ' Isolating anyway — it must own its whole subtree.');
      }

      if (!dep.url) {
        warnings.push(`${mfe.name} needs ${name}@${range}, incompatible with ${winner.version}, `
          + `and ships no own copy. It will get ${winner.version} and may break.`);
        decisions.push({ mfe: mfe.name, dep: name, action: 'dedupe-unsafe',
          resolved: winner.version, requested: range });
        continue;
      }

      (scopes[mfe.baseUrl] ??= {})[name] = dep.url;
      decisions.push({ mfe: mfe.name, dep: name, action: 'isolate',
        resolved: dep.version, requested: range });
    }
  }

  const importMap = Object.keys(scopes).length ? { imports, scopes } : { imports };
  return { importMap, decisions, warnings };
}
