/**
 * Vendor chunk builder.
 *
 * Turns an npm package into a single ESM file a browser can load through an
 * import map. Two things make this non-trivial:
 *
 *  - Many packages (React among them) are CommonJS. `export * from 'react'`
 *    emits NO named exports, because CJS exports can't be analysed statically.
 *    So the export names are enumerated up front and re-exported explicitly.
 *  - Peer dependencies must stay external. If react-redux bundled its own React,
 *    it would get a second copy and every hook would break. Externals are left as
 *    bare specifiers so they resolve through the import map like everything else.
 *
 * Each chunk is stamped with `__vendor` so the browser can report which version
 * and which *instance* it actually got.
 */
import { build } from 'esbuild';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const RESERVED = new Set(['default', '__esModule', 'null', 'true', 'false']);

/**
 * Export names a bare `export *` would miss. Node reports these for CommonJS too,
 * via cjs-module-lexer.
 *
 * The probe is written into `cwd` and imported from there so it resolves through
 * the same "import"/browser condition esbuild will use. Probing via require()
 * instead would read a package's CJS build and disagree with the ESM build that
 * actually gets bundled — notably about whether a default export exists.
 */
export async function exportNamesOf(pkg, cwd) {
  const { pathToFileURL } = await import('node:url');
  await mkdir(join(cwd, '.vendor-entries'), { recursive: true });
  const dir = await mkdtemp(join(cwd, '.vendor-entries', 'probe-'));
  const file = join(dir, 'probe.mjs');
  try {
    await writeFile(file, `export const keys = Object.keys(await import(${JSON.stringify(pkg)}));`);
    const { keys } = await import(pathToFileURL(file).href);
    return {
      names: keys.filter((k) => IDENT.test(k) && !RESERVED.has(k)),
      hasDefault: keys.includes('default'),
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function buildVendorChunk({
  pkg, name = pkg, version, outfile, external = [], cwd = process.cwd(), minify = false,
}) {
  const { names, hasDefault } = await exportNamesOf(pkg, cwd);
  // The generated entry must sit inside `cwd`: Node/esbuild resolve bare specifiers
  // by walking up from the importing file, so an entry in the OS temp dir would
  // never find the project's node_modules.
  await mkdir(join(cwd, '.vendor-entries'), { recursive: true });
  const tmp = await mkdtemp(join(cwd, '.vendor-entries', 'v-'));
  const entry = join(tmp, 'entry.js');

  const spec = JSON.stringify(pkg);
  const lines = [`export { ${names.join(', ')} } from ${spec};`];
  if (hasDefault) lines.push(`export { default } from ${spec};`);
  lines.push(
    `export const __vendor = {`,
    `  name: ${JSON.stringify(name)},`,
    `  version: ${JSON.stringify(version)},`,
    `  instanceId: Math.random().toString(36).slice(2, 8),`,
    `};`,
  );
  await mkdir(dirname(outfile), { recursive: true });

  // CommonJS packages (react-dom, react-redux) call require('react'). esbuild cannot
  // rewrite a require() of an EXTERNAL package into an ESM import, so it emits a
  // __require shim that throws. That shim delegates to `require` when one is in
  // scope, so bind one to the real ESM namespaces of the externals.
  const banner = external.length
    ? {
        js: [
          ...external.map((e, i) => `import * as __ext${i} from ${JSON.stringify(e)};`),
          `var __externals = { ${external.map((e, i) => `${JSON.stringify(e)}: __ext${i}`).join(', ')} };`,
          `var require = (id) => {`,
          `  const m = __externals[id];`,
          `  if (!m) throw new Error('Vendor chunk for ' + ${JSON.stringify(name)} + ' required "' + id + '", which is not one of its externals');`,
          `  return m.default ?? m;`,
          `};`,
        ].join('\n'),
      }
    : undefined;

  const run = async (withDefault, quiet = false) => {
    const src = withDefault ? [...lines] : lines.filter((l) => !l.startsWith('export { default }'));
    await writeFile(entry, src.join('\n'));
    await build({
      entryPoints: [entry], outfile, bundle: true, format: 'esm', platform: 'browser',
      target: 'es2020', minify, external, absWorkingDir: cwd, banner,
      logLevel: quiet ? 'silent' : 'warning',
      // React and friends branch on this; without it the bundle throws on `process`.
      define: { 'process.env.NODE_ENV': '"production"' },
    });
  };

  // Node and esbuild can resolve a package through different export conditions, so
  // they disagree about whether a default export exists (react-router-dom, notably).
  // esbuild is the one doing the bundling, so let it be the authority.
  let emittedDefault = hasDefault;
  try {
    // Quiet on the speculative pass: a rejected default is expected, not an error.
    await run(hasDefault, hasDefault);
  } catch (err) {
    if (hasDefault && /for import "default"/.test(String(err.message))) {
      emittedDefault = false;
      await run(false);
    } else {
      throw err;
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
  return { pkg, name, version, outfile, exports: names.length + (emittedDefault ? 1 : 0),
           hasDefault: emittedDefault, external };
}

/** Bundle an app/MFE, leaving every shared dep as a bare specifier for the import map. */
export async function buildApp({ entry, outfile, external = [], cwd = process.cwd(), minify = false }) {
  await mkdir(dirname(outfile), { recursive: true });
  await build({
    entryPoints: [entry], outfile, bundle: true, format: 'esm', platform: 'browser',
    target: 'es2020', minify, external, absWorkingDir: cwd, logLevel: 'warning',
    jsx: 'transform', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment',
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  return { entry, outfile, external };
}
