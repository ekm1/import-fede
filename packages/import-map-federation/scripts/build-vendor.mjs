import { build } from 'esbuild';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const RESERVED = new Set(['default', '__esModule', 'null', 'true', 'false']);
const PROD = { 'process.env.NODE_ENV': '"production"' };

const scratch = async (cwd) => {
  await mkdir(join(cwd, '.vendor-entries'), { recursive: true });
  return mkdtemp(join(cwd, '.vendor-entries', 'v-'));
};

// `export * from` a CommonJS package emits no named exports, so they have to be
// listed explicitly. The probe runs from `cwd` to resolve through the same export
// condition esbuild will use; probing via require() reads a package's CJS build
// and can disagree about whether a default export exists.
export async function exportNamesOf(pkg, cwd) {
  const dir = await scratch(cwd);
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

// esbuild cannot turn require() of an external package into an ESM import; it
// emits a shim that throws unless a `require` is in scope. Bind one to the real
// namespaces so CJS packages (react-dom, react-redux) can reach their peers.
function externalsBanner(externals, name) {
  if (!externals.length) return undefined;
  const map = externals.map((e, i) => `${JSON.stringify(e)}: __ext${i}`).join(', ');
  return {
    js: [
      ...externals.map((e, i) => `import * as __ext${i} from ${JSON.stringify(e)};`),
      `var __externals = { ${map} };`,
      'var require = (id) => {',
      '  const m = __externals[id];',
      `  if (!m) throw new Error('Vendor chunk ${name} required "' + id + '", not one of its externals');`,
      '  return m.default ?? m;',
      '};',
    ].join('\n'),
  };
}

export async function buildVendorChunk({
  pkg, name = pkg, version, outfile, external = [], cwd = process.cwd(), minify = false,
}) {
  const { names, hasDefault } = await exportNamesOf(pkg, cwd);
  const spec = JSON.stringify(pkg);
  const stamp = `export const __vendor = { name: ${JSON.stringify(name)}, `
    + `version: ${JSON.stringify(version)}, instanceId: Math.random().toString(36).slice(2, 8) };`;

  const dir = await scratch(cwd);
  const entry = join(dir, 'entry.js');
  await mkdir(dirname(outfile), { recursive: true });

  const run = async (withDefault, quiet = false) => {
    await writeFile(entry, [
      `export { ${names.join(', ')} } from ${spec};`,
      ...(withDefault ? [`export { default } from ${spec};`] : []),
      stamp,
    ].join('\n'));
    await build({
      entryPoints: [entry], outfile, bundle: true, format: 'esm', platform: 'browser',
      target: 'es2020', minify, external, absWorkingDir: cwd, define: PROD,
      banner: externalsBanner(external, name),
      logLevel: quiet ? 'silent' : 'warning',
    });
  };

  // Node and esbuild can resolve through different export conditions and disagree
  // about a default export. esbuild does the bundling, so let it decide.
  let emittedDefault = hasDefault;
  try {
    await run(hasDefault, hasDefault);
  } catch (err) {
    if (!hasDefault || !/for import "default"/.test(String(err.message))) throw err;
    emittedDefault = false;
    await run(false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }

  return { pkg, name, version, outfile, hasDefault: emittedDefault, external };
}

// Shared deps stay as bare specifiers for the import map to resolve.
export async function buildApp({ entry, outfile, external = [], cwd = process.cwd(), minify = false }) {
  await mkdir(dirname(outfile), { recursive: true });
  await build({
    entryPoints: [entry], outfile, bundle: true, format: 'esm', platform: 'browser',
    target: 'es2020', minify, external, absWorkingDir: cwd, define: PROD, logLevel: 'warning',
    jsx: 'transform', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment',
  });
  return { entry, outfile, external };
}
