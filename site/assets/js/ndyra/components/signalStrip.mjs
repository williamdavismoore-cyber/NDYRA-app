// NDYRA — Signals (disciplined Stories)
// Smallest-change demo strip used on FYP + Following.
// Non‑negotiables:
//  • muted by default, tap to hear
//  • curated fonts only (client-side mapping)
//  • visibility must reuse can_view_post() (server side; demo mode here)

import { makeEl, safeJsonFetch } from '../lib/utils.mjs';

const CURATED_FONT_KEYS = new Set(['display', 'serif', 'mono']);

function clampInt(n, min, max) {
  const x = Number.isFinite(n) ? n : 0;
  return Math.max(min, Math.min(max, x));
}

function resolveFontClass(fontKey) {
  if (!fontKey) return '';
  const key = String(fontKey).toLowerCase();
  if (!CURATED_FONT_KEYS.has(key)) return '';
  return `signal-font-${key}`;
}

function getSignalType(signal) {
  const media = Array.isArray(signal?.post_media) ? signal.post_media : [];
  const first = media[0];
  const t = String(first?.media_type || '').toLowerCase();
  if (t === 'audio' || t === 'video') return t;
  return 'text';
}

function buildSignalCard(signal) {
  const type = getSignalType(signal);

  const author = signal?.author || {};
  const handle = author.handle ? `@${author.handle}` : 'Signal';
  const display = author.full_name || author.handle || 'NDYRA';
  const avatarUrl = author.avatar_url || '/assets/branding/ndyra-icon-192.png';

  const root = makeEl('button', {
    class: 'signal-card',
    type: 'button',
    'data-signal-card': '1',
    'data-signal-type': type,
    title: `${display} — ${type} signal`,
  });

  const thumb = makeEl('div', { class: 'signal-thumb' });
  const meta = makeEl('div', { class: 'signal-meta' });

  const avatar = makeEl('img', {
    class: 'signal-avatar',
    src: avatarUrl,
    alt: display,
    loading: 'lazy',
  });

  const who = makeEl('div', { class: 'signal-who' }, [
    makeEl('div', { class: 'signal-name' }, [display]),
    makeEl('div', { class: 'signal-handle' }, [handle]),
  ]);

  const tap = makeEl('div', { class: 'signal-tap' }, ['Tap to hear']);

  let mediaEl = null;

  if (type === 'audio') {
    const src = signal?.post_media?.[0]?.public_url;
    mediaEl = makeEl('audio', {
      class: 'signal-media',
      src,
      preload: 'metadata',
    });
    mediaEl.muted = true;

    thumb.append(
      makeEl('div', { class: 'signal-audio-icon', 'aria-hidden': 'true' }, ['🔊'])
    );
  } else if (type === 'video') {
    const src = signal?.post_media?.[0]?.public_url;
    mediaEl = makeEl('video', {
      class: 'signal-media',
      src,
      preload: 'metadata',
      playsinline: 'true',
      loop: 'true',
    });
    mediaEl.muted = true;

    thumb.append(mediaEl);
  } else {
    const fontClass = resolveFontClass(signal?.signal_font_key);
    const text = String(signal?.content_text || '').trim() || '—';
    thumb.append(
      makeEl('div', { class: `signal-text ${fontClass}` }, [text])
    );
  }

  if (mediaEl && type !== 'video') {
    // Audio element stays hidden; video is already appended.
    mediaEl.style.display = 'none';
    root.append(mediaEl);
  }

  meta.append(avatar, who);
  root.append(thumb, tap, meta);

  // Tap-to-hear behavior.
  if (type === 'audio' || type === 'video') {
    root.addEventListener('click', async () => {
      const el = type === 'video' ? thumb.querySelector('video') : mediaEl;
      if (!el) return;

      const isPlaying = !el.paused && !el.ended;
      if (isPlaying) {
        el.pause();
        el.muted = true;
        root.classList.remove('is-playing');
        tap.textContent = 'Tap to hear';
        return;
      }

      try {
        el.muted = false;
        await el.play();
        root.classList.add('is-playing');
        tap.textContent = 'Tap to mute';
      } catch {
        // Autoplay policy or decode error — keep muted and surface a useful hint.
        el.muted = true;
        root.classList.remove('is-playing');
        tap.textContent = 'Tap again';
      }
    });
  }

  return root;
}

export async function loadDemoSignals() {
  const data = await safeJsonFetch('/assets/data/ndyra_demo_signals.json');
  const list = Array.isArray(data?.signals) ? data.signals : [];

  // Keep ordering deterministic for QA.
  const sorted = [...list].sort((a, b) => {
    const ta = Date.parse(a?.created_at || '') || 0;
    const tb = Date.parse(b?.created_at || '') || 0;
    return tb - ta;
  });

  // Cap at 10 for strip.
  return sorted.slice(0, 10);
}

export function renderSignalStrip(mount, signals) {
  if (!mount) return;
  mount.innerHTML = '';

  const list = Array.isArray(signals) ? signals : [];
  if (list.length === 0) {
    mount.append(
      makeEl('div', { class: 'signal-strip-empty' }, ['No signals right now.'])
    );
    return;
  }

  const row = makeEl('div', { class: 'signal-strip-row' });

  for (const s of list) {
    row.append(buildSignalCard(s));
  }

  mount.append(
    makeEl('div', { class: 'signal-strip-head' }, [
      makeEl('div', { class: 'signal-strip-title' }, ['Signals']),
      makeEl('div', { class: 'signal-strip-sub' }, ['Muted by default · tap to hear']),
    ]),
    row
  );
}

