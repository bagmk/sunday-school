#!/usr/bin/env node
/*
 * tools/serve.mjs - tiny static file server for local testing. Node 22+, no dependencies.
 * Owner: QA agent.
 *
 * Usage:   node tools/serve.mjs [--port 8080] [--root DIR] [--host 127.0.0.1]
 * Import:  import { startServer } from './serve.mjs';
 *          const srv = await startServer({ root, port: 0 });  // port 0 = any free port
 *          ... srv.url ... await srv.close();
 *
 * Serves files only from inside the root (no directory listing, no path traversal), sends
 * "Cache-Control: no-store" so every reload sees fresh files, and maps "/" to index.html.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf'
};

export function startServer(opts = {}) {
  const root = path.resolve(opts.root || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
  const host = opts.host || '127.0.0.1';
  const port = opts.port == null ? 0 : Number(opts.port);
  const log = opts.log || null;
  const server = http.createServer((req, res) => {
    let rel;
    try {
      rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch (e) {
      res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('bad request');
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' });
      res.end();
      return;
    }
    if (rel.endsWith('/')) rel += 'index.html';
    const abs = path.resolve(root, '.' + rel);
    if (abs !== root && !abs.startsWith(root + path.sep)) {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('forbidden');
      return;
    }
    fs.stat(abs, (err, st) => {
      if (!err && st.isDirectory()) {
        res.writeHead(301, { location: rel + '/' });
        res.end();
        return;
      }
      if (err || !st.isFile()) {
        if (log) log(`404 ${rel}`);
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
        res.end('not found');
        return;
      }
      res.writeHead(200, {
        'content-type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream',
        'content-length': st.size,
        'cache-control': 'no-store'
      });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      fs.createReadStream(abs).on('error', () => res.destroy()).pipe(res);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const addr = server.address();
      resolve({
        server,
        root,
        port: addr.port,
        url: `http://${host}:${addr.port}/`,
        close: () => new Promise((r) => server.close(() => r()))
      });
    });
  });
}

function parseArgs(argv) {
  const a = { port: 8080, root: null, host: '127.0.0.1' };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === '--port') a.port = Number(argv[++i]);
    else if (x === '--root') a.root = path.resolve(argv[++i]);
    else if (x === '--host') a.host = argv[++i];
    else if (x === '-h' || x === '--help') a.help = true;
  }
  return a;
}

const invokedDirectly = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node tools/serve.mjs [--port 8080] [--root DIR] [--host 127.0.0.1]');
    process.exit(0);
  }
  startServer({ root: args.root, port: args.port, host: args.host, log: (m) => console.log(m) })
    .then((srv) => console.log(`Serving ${srv.root} at ${srv.url} (Ctrl+C to stop)`))
    .catch((e) => {
      console.error(`Could not start the server: ${e.message}`);
      process.exit(1);
    });
}
