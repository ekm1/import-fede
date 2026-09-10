var ImportMapFederation = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/bootstrap.js
  var bootstrap_exports = {};
  __export(bootstrap_exports, {
    bootstrap: () => bootstrap,
    fetchManifest: () => fetchManifest,
    injectImportMap: () => injectImportMap
  });

  // src/semver.js
  var buildIdentifier = "[0-9A-Za-z-]+";
  var build = `(?:\\+(${buildIdentifier}(?:\\.${buildIdentifier})*))`;
  var numericIdentifier = "0|[1-9]\\d*";
  var numericIdentifierLoose = "[0-9]+";
  var nonNumericIdentifier = "\\d*[a-zA-Z-][a-zA-Z0-9-]*";
  var preReleaseIdentifierLoose = `(?:${numericIdentifierLoose}|${nonNumericIdentifier})`;
  var preReleaseLoose = `(?:-?(${preReleaseIdentifierLoose}(?:\\.${preReleaseIdentifierLoose})*))`;
  var preReleaseIdentifier = `(?:${numericIdentifier}|${nonNumericIdentifier})`;
  var preRelease = `(?:-(${preReleaseIdentifier}(?:\\.${preReleaseIdentifier})*))`;
  var xRangeIdentifier = `${numericIdentifier}|x|X|\\*`;
  var xRangePlain = `[v=\\s]*(${xRangeIdentifier})(?:\\.(${xRangeIdentifier})(?:\\.(${xRangeIdentifier})(?:${preRelease})?${build}?)?)?`;
  var hyphenRange = `^\\s*(${xRangePlain})\\s+-\\s+(${xRangePlain})\\s*$`;
  var mainVersionLoose = `(${numericIdentifierLoose})\\.(${numericIdentifierLoose})\\.(${numericIdentifierLoose})`;
  var loosePlain = `[v=\\s]*${mainVersionLoose}${preReleaseLoose}?${build}?`;
  var gtlt = "((?:<|>)?=?)";
  var comparatorTrim = `(\\s*)${gtlt}\\s*(${loosePlain}|${xRangePlain})`;
  var loneTilde = "(?:~>?)";
  var tildeTrim = `(\\s*)${loneTilde}\\s+`;
  var loneCaret = "(?:\\^)";
  var caretTrim = `(\\s*)${loneCaret}\\s+`;
  var star = "(<|>)?=?\\s*\\*";
  var caret = `^${loneCaret}${xRangePlain}$`;
  var mainVersion = `(${numericIdentifier})\\.(${numericIdentifier})\\.(${numericIdentifier})`;
  var fullPlain = `v?${mainVersion}${preRelease}?${build}?`;
  var tilde = `^${loneTilde}${xRangePlain}$`;
  var xRange = `^${gtlt}\\s*${xRangePlain}$`;
  var comparator = `^${gtlt}\\s*(${fullPlain})$|^$`;
  var gte0 = "^\\s*>=\\s*0.0.0\\s*$";
  function parseRegex(source) {
    return new RegExp(source);
  }
  function isXVersion(version) {
    return !version || version.toLowerCase() === "x" || version === "*";
  }
  function pipe(...fns) {
    return (x) => fns.reduce((v, f) => f(v), x);
  }
  function extractComparator(comparatorString) {
    return comparatorString.match(parseRegex(comparator));
  }
  function combineVersion(major, minor, patch, preRelease2) {
    const mainVersion2 = `${major}.${minor}.${patch}`;
    if (preRelease2) {
      return `${mainVersion2}-${preRelease2}`;
    }
    return mainVersion2;
  }
  function parseHyphen(range) {
    return range.replace(
      parseRegex(hyphenRange),
      (_range, from, fromMajor, fromMinor, fromPatch, _fromPreRelease, _fromBuild, to, toMajor, toMinor, toPatch, toPreRelease) => {
        if (isXVersion(fromMajor)) {
          from = "";
        } else if (isXVersion(fromMinor)) {
          from = `>=${fromMajor}.0.0`;
        } else if (isXVersion(fromPatch)) {
          from = `>=${fromMajor}.${fromMinor}.0`;
        } else {
          from = `>=${from}`;
        }
        if (isXVersion(toMajor)) {
          to = "";
        } else if (isXVersion(toMinor)) {
          to = `<${Number(toMajor) + 1}.0.0-0`;
        } else if (isXVersion(toPatch)) {
          to = `<${toMajor}.${Number(toMinor) + 1}.0-0`;
        } else if (toPreRelease) {
          to = `<=${toMajor}.${toMinor}.${toPatch}-${toPreRelease}`;
        } else {
          to = `<=${to}`;
        }
        return `${from} ${to}`.trim();
      }
    );
  }
  function parseComparatorTrim(range) {
    return range.replace(parseRegex(comparatorTrim), "$1$2$3");
  }
  function parseTildeTrim(range) {
    return range.replace(parseRegex(tildeTrim), "$1~");
  }
  function parseCaretTrim(range) {
    return range.replace(parseRegex(caretTrim), "$1^");
  }
  function parseCarets(range) {
    return range.trim().split(/\s+/).map(
      (rangeVersion) => rangeVersion.replace(
        parseRegex(caret),
        (_, major, minor, patch, preRelease2) => {
          if (isXVersion(major)) {
            return "";
          } else if (isXVersion(minor)) {
            return `>=${major}.0.0 <${Number(major) + 1}.0.0-0`;
          } else if (isXVersion(patch)) {
            if (major === "0") {
              return `>=${major}.${minor}.0 <${major}.${Number(minor) + 1}.0-0`;
            } else {
              return `>=${major}.${minor}.0 <${Number(major) + 1}.0.0-0`;
            }
          } else if (preRelease2) {
            if (major === "0") {
              if (minor === "0") {
                return `>=${major}.${minor}.${patch}-${preRelease2} <${major}.${minor}.${Number(patch) + 1}-0`;
              } else {
                return `>=${major}.${minor}.${patch}-${preRelease2} <${major}.${Number(minor) + 1}.0-0`;
              }
            } else {
              return `>=${major}.${minor}.${patch}-${preRelease2} <${Number(major) + 1}.0.0-0`;
            }
          } else {
            if (major === "0") {
              if (minor === "0") {
                return `>=${major}.${minor}.${patch} <${major}.${minor}.${Number(patch) + 1}-0`;
              } else {
                return `>=${major}.${minor}.${patch} <${major}.${Number(minor) + 1}.0-0`;
              }
            }
            return `>=${major}.${minor}.${patch} <${Number(major) + 1}.0.0-0`;
          }
        }
      )
    ).join(" ");
  }
  function parseTildes(range) {
    return range.trim().split(/\s+/).map(
      (rangeVersion) => rangeVersion.replace(
        parseRegex(tilde),
        (_, major, minor, patch, preRelease2) => {
          if (isXVersion(major)) {
            return "";
          } else if (isXVersion(minor)) {
            return `>=${major}.0.0 <${Number(major) + 1}.0.0-0`;
          } else if (isXVersion(patch)) {
            return `>=${major}.${minor}.0 <${major}.${Number(minor) + 1}.0-0`;
          } else if (preRelease2) {
            return `>=${major}.${minor}.${patch}-${preRelease2} <${major}.${Number(minor) + 1}.0-0`;
          }
          return `>=${major}.${minor}.${patch} <${major}.${Number(minor) + 1}.0-0`;
        }
      )
    ).join(" ");
  }
  function parseXRanges(range) {
    return range.split(/\s+/).map(
      (rangeVersion) => rangeVersion.trim().replace(
        parseRegex(xRange),
        (ret, gtlt2, major, minor, patch, preRelease2) => {
          const isXMajor = isXVersion(major);
          const isXMinor = isXMajor || isXVersion(minor);
          const isXPatch = isXMinor || isXVersion(patch);
          if (gtlt2 === "=" && isXPatch) {
            gtlt2 = "";
          }
          preRelease2 = "";
          if (isXMajor) {
            if (gtlt2 === ">" || gtlt2 === "<") {
              return "<0.0.0-0";
            } else {
              return "*";
            }
          } else if (gtlt2 && isXPatch) {
            if (isXMinor) {
              minor = 0;
            }
            patch = 0;
            if (gtlt2 === ">") {
              gtlt2 = ">=";
              if (isXMinor) {
                major = Number(major) + 1;
                minor = 0;
                patch = 0;
              } else {
                minor = Number(minor) + 1;
                patch = 0;
              }
            } else if (gtlt2 === "<=") {
              gtlt2 = "<";
              if (isXMinor) {
                major = Number(major) + 1;
              } else {
                minor = Number(minor) + 1;
              }
            }
            if (gtlt2 === "<") {
              preRelease2 = "-0";
            }
            return `${gtlt2 + major}.${minor}.${patch}${preRelease2}`;
          } else if (isXMinor) {
            return `>=${major}.0.0${preRelease2} <${Number(major) + 1}.0.0-0`;
          } else if (isXPatch) {
            return `>=${major}.${minor}.0${preRelease2} <${major}.${Number(minor) + 1}.0-0`;
          }
          return ret;
        }
      )
    ).join(" ");
  }
  function parseStar(range) {
    return range.trim().replace(parseRegex(star), "");
  }
  function parseGTE0(comparatorString) {
    return comparatorString.trim().replace(parseRegex(gte0), "");
  }
  function compareAtom(rangeAtom, versionAtom) {
    rangeAtom = Number(rangeAtom) || rangeAtom;
    versionAtom = Number(versionAtom) || versionAtom;
    if (rangeAtom > versionAtom) {
      return 1;
    }
    if (rangeAtom === versionAtom) {
      return 0;
    }
    return -1;
  }
  function comparePreRelease(rangeAtom, versionAtom) {
    const { preRelease: rangePreRelease } = rangeAtom;
    const { preRelease: versionPreRelease } = versionAtom;
    if (rangePreRelease === void 0 && Boolean(versionPreRelease)) {
      return 1;
    }
    if (Boolean(rangePreRelease) && versionPreRelease === void 0) {
      return -1;
    }
    if (rangePreRelease === void 0 && versionPreRelease === void 0) {
      return 0;
    }
    for (let i = 0, n = rangePreRelease.length; i <= n; i++) {
      const rangeElement = rangePreRelease[i];
      const versionElement = versionPreRelease[i];
      if (rangeElement === versionElement) {
        continue;
      }
      if (rangeElement === void 0 && versionElement === void 0) {
        return 0;
      }
      if (!rangeElement) {
        return 1;
      }
      if (!versionElement) {
        return -1;
      }
      return compareAtom(rangeElement, versionElement);
    }
    return 0;
  }
  function compareVersion(rangeAtom, versionAtom) {
    return compareAtom(rangeAtom.major, versionAtom.major) || compareAtom(rangeAtom.minor, versionAtom.minor) || compareAtom(rangeAtom.patch, versionAtom.patch) || comparePreRelease(rangeAtom, versionAtom);
  }
  function eq(rangeAtom, versionAtom) {
    return rangeAtom.version === versionAtom.version;
  }
  function compare(rangeAtom, versionAtom) {
    switch (rangeAtom.operator) {
      case "":
      case "=":
        return eq(rangeAtom, versionAtom);
      case ">":
        return compareVersion(rangeAtom, versionAtom) < 0;
      case ">=":
        return eq(rangeAtom, versionAtom) || compareVersion(rangeAtom, versionAtom) < 0;
      case "<":
        return compareVersion(rangeAtom, versionAtom) > 0;
      case "<=":
        return eq(rangeAtom, versionAtom) || compareVersion(rangeAtom, versionAtom) > 0;
      case void 0: {
        return true;
      }
      default:
        return false;
    }
  }
  function parseComparatorString(range) {
    return pipe(
      // handle caret
      // ^ --> * (any, kinda silly)
      // ^2, ^2.x, ^2.x.x --> >=2.0.0 <3.0.0-0
      // ^2.0, ^2.0.x --> >=2.0.0 <3.0.0-0
      // ^1.2, ^1.2.x --> >=1.2.0 <2.0.0-0
      // ^1.2.3 --> >=1.2.3 <2.0.0-0
      // ^1.2.0 --> >=1.2.0 <2.0.0-0
      parseCarets,
      // handle tilde
      // ~, ~> --> * (any, kinda silly)
      // ~2, ~2.x, ~2.x.x, ~>2, ~>2.x ~>2.x.x --> >=2.0.0 <3.0.0-0
      // ~2.0, ~2.0.x, ~>2.0, ~>2.0.x --> >=2.0.0 <2.1.0-0
      // ~1.2, ~1.2.x, ~>1.2, ~>1.2.x --> >=1.2.0 <1.3.0-0
      // ~1.2.3, ~>1.2.3 --> >=1.2.3 <1.3.0-0
      // ~1.2.0, ~>1.2.0 --> >=1.2.0 <1.3.0-0
      parseTildes,
      parseXRanges,
      parseStar
    )(range);
  }
  function parseRange(range) {
    return pipe(
      // handle hyphenRange
      // `1.2.3 - 1.2.4` => `>=1.2.3 <=1.2.4`
      parseHyphen,
      // handle trim comparator
      // `> 1.2.3 < 1.2.5` => `>1.2.3 <1.2.5`
      parseComparatorTrim,
      // handle trim tilde
      // `~ 1.2.3` => `~1.2.3`
      parseTildeTrim,
      // handle trim caret
      // `^ 1.2.3` => `^1.2.3`
      parseCaretTrim
    )(range.trim()).split(/\s+/).join(" ");
  }
  function satisfy(version, range) {
    if (!version) {
      return false;
    }
    const extractedVersion = extractComparator(version);
    if (!extractedVersion) {
      return false;
    }
    const [
      ,
      versionOperator,
      ,
      versionMajor,
      versionMinor,
      versionPatch,
      versionPreRelease
    ] = extractedVersion;
    const versionAtom = {
      operator: versionOperator,
      version: combineVersion(
        versionMajor,
        versionMinor,
        versionPatch,
        versionPreRelease
      ),
      // exclude build atom
      major: versionMajor,
      minor: versionMinor,
      patch: versionPatch,
      preRelease: versionPreRelease?.split(".")
    };
    const orRanges = range.split("||");
    for (const orRange of orRanges) {
      const trimmedOrRange = orRange.trim();
      if (!trimmedOrRange) {
        return true;
      }
      if (trimmedOrRange === "*" || trimmedOrRange === "x") {
        return true;
      }
      try {
        const parsedSubRange = parseRange(trimmedOrRange);
        if (!parsedSubRange.trim()) {
          return true;
        }
        const parsedComparatorString = parsedSubRange.split(" ").map((rangeVersion) => parseComparatorString(rangeVersion)).join(" ");
        if (!parsedComparatorString.trim()) {
          return true;
        }
        const comparators = parsedComparatorString.split(/\s+/).map((comparator2) => parseGTE0(comparator2)).filter(Boolean);
        if (comparators.length === 0) {
          continue;
        }
        let subRangeSatisfied = true;
        for (const comparator2 of comparators) {
          const extractedComparator = extractComparator(comparator2);
          if (!extractedComparator) {
            subRangeSatisfied = false;
            break;
          }
          const [
            ,
            rangeOperator,
            ,
            rangeMajor,
            rangeMinor,
            rangePatch,
            rangePreRelease
          ] = extractedComparator;
          const rangeAtom = {
            operator: rangeOperator,
            version: combineVersion(
              rangeMajor,
              rangeMinor,
              rangePatch,
              rangePreRelease
            ),
            major: rangeMajor,
            minor: rangeMinor,
            patch: rangePatch,
            preRelease: rangePreRelease?.split(".")
          };
          if (!compare(rangeAtom, versionAtom)) {
            subRangeSatisfied = false;
            break;
          }
        }
        if (subRangeSatisfied) {
          return true;
        }
      } catch (e) {
        console.error(
          `[semver] Error processing range part "${trimmedOrRange}":`,
          e
        );
        continue;
      }
    }
    return false;
  }

  // src/resolve.js
  function buildImportMap({
    host = null,
    mfes = [],
    onSingletonConflict = "host-wins",
    exposeRemotes = true
  } = {}) {
    const imports = {};
    const scopes = {};
    const decisions = [];
    const warnings = [];
    const names = /* @__PURE__ */ new Set();
    for (const n of Object.keys(host?.shares ?? {})) names.add(n);
    for (const m of mfes) for (const n of Object.keys(m.shared ?? {})) names.add(n);
    for (const name of names) {
      const hostShare = host?.shares?.[name];
      const consumers = mfes.filter((m) => m.shared?.[name]).map((m) => ({ mfe: m, dep: m.shared[name] }));
      let winner = hostShare ? { version: hostShare.version, url: hostShare.url, from: host.name ?? "host" } : null;
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
      for (const { mfe, dep } of consumers) {
        const range = dep.requiredVersion ?? `^${dep.version}`;
        const compatible = range === "*" || range === false || satisfy(winner.version, range);
        if (compatible) {
          decisions.push({
            mfe: mfe.name,
            dep: name,
            action: "dedupe",
            resolved: winner.version,
            from: winner.from
          });
          continue;
        }
        const singleton = dep.singleton ?? false;
        if (singleton) {
          const msg = `Singleton "${name}": ${mfe.name} requires ${range} but the shared copy is ${winner.version} (from ${winner.from}).`;
          if (onSingletonConflict === "error") {
            throw new Error(msg + " Refusing to build a map with two copies of a singleton.");
          }
          if (onSingletonConflict === "host-wins") {
            warnings.push(msg + " Forcing the shared copy (set onSingletonConflict to change).");
            decisions.push({
              mfe: mfe.name,
              dep: name,
              action: "dedupe-forced",
              resolved: winner.version,
              from: winner.from,
              requested: range
            });
            continue;
          }
          warnings.push(msg + " Isolating anyway \u2014 it must own its whole subtree.");
        }
        if (!dep.url) {
          warnings.push(`${mfe.name} needs ${name}@${range}, incompatible with ${winner.version}, and ships no own copy. It will get ${winner.version} and may break.`);
          decisions.push({
            mfe: mfe.name,
            dep: name,
            action: "dedupe-unsafe",
            resolved: winner.version,
            requested: range
          });
          continue;
        }
        (scopes[mfe.baseUrl] ??= {})[name] = dep.url;
        decisions.push({
          mfe: mfe.name,
          dep: name,
          action: "isolate",
          resolved: dep.version,
          requested: range
        });
      }
    }
    if (exposeRemotes) {
      for (const m of mfes) {
        const entries = Object.entries(m.exposes ?? {});
        if (m.entry) entries.push([".", m.entry]);
        for (const [key, url] of entries) {
          if (!url) continue;
          const spec = key === "." ? m.name : `${m.name}/${key.replace(/^\.\//, "")}`;
          if (imports[spec] !== void 0) {
            warnings.push(`Remote "${m.name}" cannot publish "${spec}": a shared dependency already claims that specifier. Import it by URL instead.`);
            continue;
          }
          imports[spec] = url;
        }
      }
    }
    const importMap = Object.keys(scopes).length ? { imports, scopes } : { imports };
    return { importMap, decisions, warnings };
  }

  // src/bootstrap.js
  async function fetchManifest(manifestUrl) {
    const abs = new URL(manifestUrl, location.href).href;
    const res = await fetch(abs);
    if (!res.ok) throw new Error(`Manifest ${abs} -> HTTP ${res.status}`);
    const m = await res.json();
    const baseUrl = new URL(".", abs).href;
    const rel = (u) => u ? new URL(u, baseUrl).href : void 0;
    const shared = {};
    for (const [name, s] of Object.entries(m.shared ?? {})) shared[name] = { ...s, url: rel(s.url) };
    const exposes = {};
    for (const [k, v] of Object.entries(m.exposes ?? {})) exposes[k] = rel(v);
    return { name: m.name, baseUrl, entry: rel(m.entry), exposes, shared };
  }
  function injectImportMap(importMap) {
    if (document.querySelector('script[type="importmap"][data-federation]')) {
      throw new Error("An import map has already been injected by this bootstrap.");
    }
    const s = document.createElement("script");
    s.type = "importmap";
    s.dataset.federation = "";
    s.textContent = JSON.stringify(importMap);
    document.head.appendChild(s);
    return s;
  }
  async function bootstrap({ host = null, manifests = [], onSingletonConflict } = {}) {
    const mfes = await Promise.all(manifests.map(fetchManifest));
    const { importMap, decisions, warnings } = buildImportMap({ host, mfes, onSingletonConflict });
    injectImportMap(importMap);
    for (const w of warnings) console.warn("[federation]", w);
    const byName = new Map(mfes.map((m) => [m.name, m]));
    async function load(name, expose = "./App") {
      const m = byName.get(name);
      if (!m) throw new Error(`Unknown MFE "${name}". Known: ${[...byName.keys()].join(", ")}`);
      const url = m.exposes[expose] ?? m.entry;
      if (!url) throw new Error(`MFE "${name}" exposes no "${expose}"`);
      return import(url);
    }
    return { importMap, decisions, warnings, mfes, load };
  }
  return __toCommonJS(bootstrap_exports);
})();
