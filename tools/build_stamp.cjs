#!/usr/bin/env node
/**
 * build_stamp.cjs
 *
 * Goal:
 * - Ensure site/assets/build.json is valid JSON (no BOM / no stray characters)
 * - Rewrite it in canonical formatting (2-space indent + trailing newline)
 * - Optional: stamp build_date_iso if missing
 *
 * Why:
 * - Playwright gate reads /assets/build.json and parses JSON.
 * - On Windows, some editors can introduce a UTF-8 BOM or invalid JSON.
 * - This script makes Netlify builds + local QA deterministic.
 */

const fs = require('fs');
const path = require('path');

const repoRoot = process.cwd();
const buildPath = path.join(repoRoot, 'site', 'assets', 'build.json');

function stripUtf8Bom(buf) {
  if (!buf || buf.length < 3) return buf;
  // UTF-8 BOM: EF BB BF
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.slice(3);
  }
  return buf;
}

try {
  if (!fs.existsSync(buildPath)) {
    console.error(`[build_stamp] ERROR: Missing ${buildPath}`);
    process.exit(1);
  }

  const rawBuf = fs.readFileSync(buildPath);
  const raw = stripUtf8Bom(rawBuf).toString('utf8');

  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error('[build_stamp] ERROR: build.json is not valid JSON.');
    console.error('[build_stamp] Tip: do not hand-edit build.json; let checkpoint scripts generate it.');
    console.error('[build_stamp] Parse error:', e && e.message ? e.message : e);
    process.exit(1);
  }

  // Minimal sanity checks (don’t mutate cp/label/build_id automatically)
  const required = ['cp', 'label', 'build_id', 'kit_version'];
  const missing = required.filter((k) => !(k in data));
  if (missing.length) {
    console.warn(`[build_stamp] WARN: build.json missing fields: ${missing.join(', ')}`);
  }

  if (!data.build_date_iso) {
    data.build_date_iso = new Date().toISOString();
  }

  const out = JSON.stringify(data, null, 2) + '\n';
  fs.writeFileSync(buildPath, out, { encoding: 'utf8' });

  console.log('[build_stamp] OK: build.json validated + normalized');
} catch (e) {
  console.error('[build_stamp] FATAL:', e && e.stack ? e.stack : e);
  process.exit(1);
}
