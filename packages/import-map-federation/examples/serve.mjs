// Two origins, mirroring a real deployment: the host app, and a CDN serving MFEs.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const PKG = join(HERE, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
                '.mjs': 'text/javascript', '.css': 'text/css' };

function serve(roots, { cors = false } = {}) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith('/')) path += 'index.html';
    if (cors) res.setHeader('Access-Control-Allow-Origin', '*');
    for (const [prefix, dir] of roots) {
      if (!path.startsWith(prefix)) continue;
      const rel = normalize(path.slice(prefix.length)).replace(/^(\.\.[/\\])+/, '');
      try {
        const body = await readFile(join(dir, rel));
        res.writeHead(200, { 'Content-Type': TYPES[extname(rel)] ?? 'application/octet-stream' });
        return res.end(body);
      } catch { /* try next root */ }
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 ' + path);
  });
}

const EXAMPLES = {
  basic: { host: join(HERE, 'host'), cdn: join(HERE, 'cdn') },
  react: { host: join(HERE, 'react/dist/host'), cdn: join(HERE, 'react/dist/cdn') },
};

export async function startServers({ hostPort = 8099, cdnPort = 8100, example = 'basic' } = {}) {
  const dirs = EXAMPLES[example];
  if (!dirs) throw new Error(`Unknown example "${example}". Try: ${Object.keys(EXAMPLES).join(', ')}`);
  // /dist/ serves the bootstrap IIFE from the package, for both examples.
  const host = serve([['/dist/', join(PKG, 'dist')], ['/', dirs.host]]);
  const cdn = serve([['/', dirs.cdn]], { cors: true });
  await new Promise((r) => host.listen(hostPort, '127.0.0.1', r));
  await new Promise((r) => cdn.listen(cdnPort, '127.0.0.1', r));
  return {
    hostUrl: `http://127.0.0.1:${hostPort}`,
    cdnUrl: `http://127.0.0.1:${cdnPort}`,
    async close() { await Promise.all([host, cdn].map((s) => new Promise((r) => s.close(r)))); },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const example = process.argv[2] ?? 'basic';
  const { hostUrl, cdnUrl } = await startServers({ example });
  const mfes = example === 'react' ? ['dashboard', 'reports'] : ['catalog', 'legacy'];
  console.log(`example    ${example}`);
  console.log(`host       ${hostUrl}/`);
  for (const m of mfes) console.log(`${m.padEnd(10)} ${cdnUrl}/${m}/standalone.html`);
  console.log('\nCtrl-C to stop.');
}
