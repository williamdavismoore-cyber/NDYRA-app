#!/usr/bin/env node
/**
 * NDYRA Load Harness (no deps)
 *
 * Purpose: quick sanity on local QA server responsiveness under concurrency.
 *
 * This is NOT a production benchmark.
 * It is a gate-style signal for regressions (e.g., accidental blocking IO, huge bundles, infinite redirects).
 */

import { performance } from 'node:perf_hooks';

function arg(name, fallback = null) {
  const ix = process.argv.indexOf(`--${name}`);
  if (ix === -1) return fallback;
  const v = process.argv[ix + 1];
  if (!v || v.startsWith('--')) return true;
  return v;
}

function toInt(v, fallback) {
  const n = Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? n : fallback;
}

function pct(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[idx];
}

async function hit(url) {
  const t0 = performance.now();
  const res = await fetch(url, { redirect: 'follow' });
  const body = await res.text();
  const t1 = performance.now();
  return { ok: res.ok, status: res.status, ms: t1 - t0, bytes: body.length };
}

async function runScenario({ base, path, seconds, concurrency }) {
  const url = new URL(path, base).toString();
  const endAt = Date.now() + seconds * 1000;

  const lat = [];
  let errors = 0;
  let bytes = 0;
  let requests = 0;

  async function worker() {
    while (Date.now() < endAt) {
      try {
        const r = await hit(url);
        requests += 1;
        bytes += r.bytes;
        lat.push(r.ms);
        if (!r.ok) errors += 1;
      } catch (e) {
        requests += 1;
        errors += 1;
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const avg = lat.length ? lat.reduce((a, b) => a + b, 0) / lat.length : 0;
  const p50 = pct(lat, 50);
  const p95 = pct(lat, 95);
  const p99 = pct(lat, 99);
  const errRate = requests ? (errors / requests) * 100 : 0;

  return {
    path,
    url,
    seconds,
    concurrency,
    requests,
    errors,
    errRate,
    avg,
    p50,
    p95,
    p99,
    bytes,
  };
}

async function main() {
  const base = arg('base', process.env.QA_BASE_URL || 'http://localhost:4173');
  const seconds = toInt(arg('duration', '6'), 6);
  const concurrency = toInt(arg('concurrency', '18'), 18);

  const pathsRaw = arg('paths', null);
  const defaultPaths = [
    "/",
    "/app/fyp/",
    "/app/following/",
    "/app/create/",
    "/app/notifications/",
    "/app/post/",
    "/assets/build.json"
  ];

  const paths = pathsRaw
    ? pathsRaw.split(',').map((s) => s.trim()).filter(Boolean)
    : defaultPaths;

  console.log('NDYRA Load Harness');
  console.log(`base=${base}`);
  console.log(`duration=${seconds}s, concurrency=${concurrency}`);
  console.log(`paths=${paths.join(', ')}`);
  console.log('');

  const results = [];
  for (const path of paths) {
    process.stdout.write(`• ${path} ... `);
    const r = await runScenario({ base, path, seconds, concurrency });
    results.push(r);
    process.stdout.write(`ok (${r.requests} req, p95 ${r.p95.toFixed(0)}ms, err ${r.errRate.toFixed(2)}%)\n`);
  }

  console.log('\nSummary');
  for (const r of results) {
    console.log(
      `${r.path} | req=${r.requests} | err=${r.errors} (${r.errRate.toFixed(2)}%) | p50=${r.p50.toFixed(0)}ms p95=${r.p95.toFixed(0)}ms p99=${r.p99.toFixed(0)}ms | avg=${r.avg.toFixed(0)}ms`
    );
  }

  // Very forgiving thresholds. This is a regression tripwire, not a KPI.
  const maxErrRate = 1.0; // %
  const maxP95 = 1500; // ms

  const bad = results.filter((r) => r.errRate > maxErrRate || r.p95 > maxP95);
  if (bad.length) {
    console.error('\nFAIL: load harness thresholds exceeded');
    for (const r of bad) {
      console.error(`- ${r.path} err=${r.errRate.toFixed(2)}% p95=${r.p95.toFixed(0)}ms`);
    }
    process.exit(1);
  }

  console.log('\nPASS');
}

main();
