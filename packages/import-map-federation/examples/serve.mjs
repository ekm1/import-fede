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

export async function startServers({ hostPort = 8099, cdnPort = 8100 } = {}) {
  const host = serve([['/dist/', join(PKG, 'dist')], ['/', join(HERE, 'host')]]);
  const cdn = serve([['/', join(HERE, 'cdn')]], { cors: true });
  await new Promise((r) => host.listen(hostPort, '127.0.0.1', r));
  await new Promise((r) => cdn.listen(cdnPort, '127.0.0.1', r));
  return {
    hostUrl: `http://127.0.0.1:${hostPort}`,
    cdnUrl: `http://127.0.0.1:${cdnPort}`,
    async close() { await Promise.all([host, cdn].map((s) => new Promise((r) => s.close(r)))); },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { hostUrl, cdnUrl } = await startServers();
  console.log(`host       ${hostUrl}/`);
  console.log(`catalog    ${cdnUrl}/catalog/standalone.html`);
  console.log(`legacy     ${cdnUrl}/legacy/standalone.html`);
  console.log('\nCtrl-C to stop.');
}
