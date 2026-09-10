import { satisfy } from './semver.js';

function sharedNames(host, mfes) {
  const names = new Set(Object.keys(host?.shares ?? {}));
  for (const m of mfes) for (const n of Object.keys(m.shared ?? {})) names.add(n);
  return names;
}

function elect(hostShare, consumers, hostName) {
  if (hostShare) return { version: hostShare.version, url: hostShare.url, from: hostName };

  let best = null;
  for (const { mfe, dep } of consumers) {
    if (!dep.version || !dep.url) continue;
    if (!best || satisfy(best.version, `<=${dep.version}`)) {
      best = { version: dep.version, url: dep.url, from: mfe.name };
    }
  }
  return best;
}

const accepts = (range, version) =>
  range === '*' || range === false || satisfy(version, range);

function remoteSpecifiers(mfe) {
  const entries = Object.entries(mfe.exposes ?? {})
    .map(([key, url]) => [`${mfe.name}/${key.replace(/^\.\//, '')}`, url]);
  if (mfe.entry) entries.push([mfe.name, mfe.entry]);
  return entries.filter(([, url]) => url);
}

export function buildImportMap({
  host = null, mfes = [], onSingletonConflict = 'host-wins', exposeRemotes = true,
} = {}) {
  const imports = {};
  const scopes = {};
  const decisions = [];
  const warnings = [];

  for (const name of sharedNames(host, mfes)) {
    const consumers = mfes
      .filter((m) => m.shared?.[name])
      .map((m) => ({ mfe: m, dep: m.shared[name] }));

    const winner = elect(host?.shares?.[name], consumers, host?.name ?? 'host');
    if (!winner) continue;
    imports[name] = winner.url;

    for (const { mfe, dep } of consumers) {
      const range = dep.requiredVersion ?? `^${dep.version}`;
      let action = 'dedupe';

      if (!accepts(range, winner.version)) {
        action = 'isolate';

        if (dep.singleton) {
          const conflict = `Singleton "${name}": ${mfe.name} requires ${range}, `
            + `shared copy is ${winner.version} from ${winner.from}.`;
          // Two copies of a singleton break shared context and hooks, so the
          // default is to force the shared one rather than isolate.
          if (onSingletonConflict === 'error') {
            throw new Error(`${conflict} Refusing to emit two copies.`);
          }
          if (onSingletonConflict === 'host-wins') {
            warnings.push(`${conflict} Forcing the shared copy.`);
            action = 'dedupe-forced';
          } else {
            warnings.push(`${conflict} Isolating; it must own its whole subtree.`);
          }
        }

        if (action === 'isolate' && !dep.url) {
          warnings.push(`${mfe.name} needs ${name}@${range}, incompatible with `
            + `${winner.version}, and ships no copy of its own. It may break.`);
          action = 'dedupe-unsafe';
        }
      }

      if (action === 'isolate') {
        (scopes[mfe.baseUrl] ??= {})[name] = dep.url;
        decisions.push({ mfe: mfe.name, dep: name, action, resolved: dep.version, requested: range });
      } else {
        decisions.push({
          mfe: mfe.name, dep: name, action, resolved: winner.version, from: winner.from,
          ...(action === 'dedupe' ? {} : { requested: range }),
        });
      }
    }
  }

  if (exposeRemotes) {
    for (const mfe of mfes) {
      for (const [spec, url] of remoteSpecifiers(mfe)) {
        if (imports[spec] !== undefined) {
          warnings.push(`Remote "${mfe.name}" cannot publish "${spec}": `
            + `a shared dependency already claims it. Import it by URL instead.`);
          continue;
        }
        imports[spec] = url;
      }
    }
  }

  return {
    importMap: Object.keys(scopes).length ? { imports, scopes } : { imports },
    decisions,
    warnings,
  };
}
