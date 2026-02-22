#!/usr/bin/env node
/**
 * NDYRA static server (QA / local dev)
 * - Serves /site as the publish root
 * - Implements the Blueprint v7.3.1 route map rewrites (no new routing framework)
 *
 * Usage:
 *   node tools/static_server.cjs --port 4173 --root site
 */

const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { URL } = require('url');

// ------------------------------------------------------------
// Args
// ------------------------------------------------------------
function getArg(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  const v = process.argv[idx + 1];
  return v ?? fallback;
}

const PORT = Number(getArg('--port', process.env.PORT || 4173));
const ROOT_DIR = path.resolve(process.cwd(), getArg('--root', 'site'));

// ------------------------------------------------------------
// Blueprint v7.3.1 route map (must match the Blueprint exactly)
// ------------------------------------------------------------
const routeMap = [
  // Public
  { pattern: '/gym/:slug/join', to: '/gym/join/index.html' },
  { pattern: '/gym/join', to: '/gym/join/index.html' },

  // App
  { pattern: '/app/book/class/:class_session_id', to: '/app/book/class/index.html' },
  { pattern: '/app/post/:id', to: '/app/post/index.html' },
  { pattern: '/app/profile/:handle', to: '/app/profile/index.html' },
  { pattern: '/app/signals/:handle', to: '/app/signals/index.html' },

  // Business portal migration
  { pattern: '/biz/migrate', to: '/biz/migrate/index.html' },
  { pattern: '/biz/migrate/members', to: '/biz/migrate/members/index.html' },
  { pattern: '/biz/migrate/schedule', to: '/biz/migrate/schedule/index.html' }, // optional, recommended
  { pattern: '/biz/migrate/verify', to: '/biz/migrate/verify/index.html' },
  { pattern: '/biz/migrate/commit', to: '/biz/migrate/commit/index.html' },
  { pattern: '/biz/migrate/cutover', to: '/biz/migrate/cutover/index.html' },

  // Business check-in
  { pattern: '/biz/check-in', to: '/biz/check-in/index.html' }
];

// ------------------------------------------------------------
// Routing helpers
// ------------------------------------------------------------
function normalizePathname(p) {
  if (!p) return '/';
  // strip trailing slash except root
  if (p.length > 1 && p.endsWith('/')) return p.slice(0, -1);
  return p;
}

function compilePattern(pattern) {
  // Converts "/gym/:slug/join" to regex and param names.
  const parts = pattern.split('/').filter(Boolean);
  const names = [];
  const rxParts = parts.map((seg) => {
    if (seg.startsWith(':')) {
      names.push(seg.slice(1));
      return '([^/]+)';
    }
    return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  });
  const rx = new RegExp('^/' + rxParts.join('/') + '$');
  return { rx, names };
}

const compiledRouteMap = routeMap.map((r) => ({
  ...r,
  ...compilePattern(r.pattern)
}));

function rewritePath(pathname) {
  const p = normalizePathname(pathname);

  for (const r of compiledRouteMap) {
    const m = p.match(r.rx);
    if (m) return r.to;
  }

  return p;
}

// ------------------------------------------------------------
// Static serving
// ------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg'
};

function safeResolve(root, urlPath) {
  // Prevent path traversal.
  const p = urlPath.replace(/\0/g, '');
  const resolved = path.resolve(root, '.' + p);
  if (!resolved.startsWith(root)) return null;
  return resolved;
}

async function fileExists(p) {
  try {
    const st = await fsp.stat(p);
    return st.isFile() ? { ok: true, stat: st } : { ok: false };
  } catch {
    return { ok: false };
  }
}

async function dirIndex(p) {
  const idx = path.join(p, 'index.html');
  const exists = await fileExists(idx);
  return exists.ok ? idx : null;
}

function setCommonHeaders(res, servedPath) {
  // Build fingerprint should never be cached during QA.
  if (servedPath.endsWith(path.join('assets', 'build.json'))) {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
  } else {
    // Reasonable default for local dev.
    res.setHeader('Cache-Control', 'no-cache');
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.statusCode = status;
  res.setHeader('Content-Type', type);
  res.end(body);
}

async function serveFile(req, res, servedPath) {
  const ext = path.extname(servedPath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';

  setCommonHeaders(res, servedPath);
  res.statusCode = 200;
  res.setHeader('Content-Type', type);

  // Stream for memory friendliness
  const stream = fs.createReadStream(servedPath);
  stream.on('error', () => send(res, 500, 'Server error'));
  stream.pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = rewritePath(u.pathname);

    // Map directories to index.html
    let wanted = pathname;
    if (wanted.endsWith('/')) wanted = wanted + 'index.html';

    const resolved = safeResolve(ROOT_DIR, wanted);
    if (!resolved) return send(res, 400, 'Bad request');

    // If path is a directory, try index.html
    let candidate = resolved;
    try {
      const st = await fsp.stat(candidate);
      if (st.isDirectory()) {
        const idx = await dirIndex(candidate);
        if (idx) candidate = idx;
      }
    } catch {
      // ignore; fileExists handles
    }

    const exists = await fileExists(candidate);
    if (exists.ok) return serveFile(req, res, candidate);

    // If not found and request looked like a directory path without trailing slash,
    // try directory index (e.g. /app/fyp -> /app/fyp/index.html)
    const maybeDir = safeResolve(ROOT_DIR, pathname);
    if (maybeDir) {
      try {
        const st = await fsp.stat(maybeDir);
        if (st.isDirectory()) {
          const idx = await dirIndex(maybeDir);
          if (idx) return serveFile(req, res, idx);
        }
      } catch {}
    }

    send(res, 404, 'Not found');
  } catch (e) {
    send(res, 500, 'Server error');
  }
});

server.listen(PORT, () => {
  console.log(`NDYRA static server listening on http://127.0.0.1:${PORT}`);
  console.log(`Root: ${ROOT_DIR}`);
});
