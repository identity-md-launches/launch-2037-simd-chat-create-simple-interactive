import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

// The override keeps this worker's test dependencies outside the submitted repository.
export function loadTestModule(name, entry = 'index.mjs') {
  return import(process.env.SIMD_TEST_MODULES
    ? pathToFileURL(resolve(process.env.SIMD_TEST_MODULES, name, entry)).href
    : name);
}

export async function startPreview() {
  const root = resolve('dist');
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (!pathname.startsWith('/preview/')) { response.writeHead(404).end(); return; }
    const file = resolve(root, decodeURIComponent(pathname.slice('/preview/'.length)) || 'index.html');
    if (!file.startsWith(root + sep)) { response.writeHead(403).end(); return; }
    try {
      const content = await readFile(file);
      response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      response.end(content);
    } catch { response.writeHead(404).end('Not found'); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}/preview/`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
