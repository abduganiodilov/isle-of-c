#!/usr/bin/env node
// Minimal static server for the built game (dist/). No dependencies.
// The game needs no backend: C is compiled and run inside the browser.
// This server only adds what plain file hosting may lack: correct MIME types
// (application/wasm), precompressed .gz files and long-lived caching for the
// ~100 MB compiler toolchain.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');
const PORT = Number(process.env.PORT || 8080);
// --lan (or HOST=0.0.0.0) lets other devices on the same network open the game.
const LAN = process.argv.includes('--lan');
const HOST = process.env.HOST || (LAN ? '0.0.0.0' : '127.0.0.1');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.wasm': 'application/wasm',
  '.tar': 'application/x-tar', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

if (!fs.existsSync(path.join(ROOT, 'index.html'))) {
  console.error('dist/ not found. Run `npm run build` first.');
  process.exit(1);
}

http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (urlPath.endsWith('/')) urlPath += 'index.html';
  const file = path.normalize(path.join(ROOT, urlPath));
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
    return;
  }
  const ext = path.extname(file);
  const headers = {
    'content-type': TYPES[ext] || 'application/octet-stream',
    'x-content-type-options': 'nosniff',
    'cache-control': urlPath.includes('/toolchain/') || urlPath.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
  };
  const gz = file + '.gz';
  if (/\bgzip\b/.test(req.headers['accept-encoding'] || '') && fs.existsSync(gz)) {
    headers['content-encoding'] = 'gzip';
    headers['content-length'] = fs.statSync(gz).size;
    headers.vary = 'accept-encoding';
    res.writeHead(200, headers);
    fs.createReadStream(gz).pipe(res);
    return;
  }
  headers['content-length'] = fs.statSync(file).size;
  res.writeHead(200, headers);
  fs.createReadStream(file).pipe(res);
}).listen(PORT, HOST, () => {
  if (HOST !== '0.0.0.0') {
    console.log(`Isle of C running at http://${HOST}:${PORT}/`);
    return;
  }
  console.log(`Isle of C running on this computer at http://127.0.0.1:${PORT}/`);
  const addrs = Object.values(os.networkInterfaces()).flat().filter((a) => a && a.family === 'IPv4' && !a.internal);
  for (const a of addrs) console.log(`Other devices on the same network: http://${a.address}:${PORT}/`);
  console.log('Press Ctrl+C to stop.');
});
