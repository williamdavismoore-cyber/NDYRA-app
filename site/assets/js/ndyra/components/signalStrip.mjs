import { makeEl } from '../lib/utils.mjs';

/**
 * NDYRA Signals (disciplined Stories)
 * Non‑negotiables enforced at UI level:
 * - muted by default, tap to hear
 * - curated fonts only
 * (limits + visibility are enforced server-side / RLS via can_view_post())
 */

const CURATED_FONTS = {
  'ndyra-serif': 'signal-font-serif',
  'ndyra-sans': 'signal-font-sans',
  'ndyra-grotesk': 'signal-font-grotesk',
};
const CURATED_FONT_KEYS = Object.keys(CURATED_FONTS);

function resolveFontClass(fontKey) {
  return CURATED_FONTS[fontKey] || CURATED_FONTS['ndyra-grotesk'];
}

function getSignalType(signal) {
  const mt = signal?.post_media?.[0]?.media_type;
  if (mt === 'audio') return 'audio';
  if (mt === 'video') return 'video';
  return 'text';
}

/* =========================================================
   Modal viewer (shared)
   ========================================================= */

let __modal = null;
let __mediaWrap = null;
let __cap = null;
let __sub = null;
let __tap = null;
let __mediaEl = null;

function ensureModal() {
  if (__modal) return;

  __modal = makeEl('div', { class: 'signal-modal', hidden: true, 'data-signal-modal': '1' });

  const backdrop = makeEl('div', { class: 'signal-modal__backdrop', 'data-signal-close': '1' });
  const panel = makeEl('div', { class: 'signal-modal__panel' });

  __mediaWrap = makeEl('div', { class: 'signal-modal__media', 'data-signal-media': '1' });

  const meta = makeEl('div', { class: 'signal-modal__meta' });
  __cap = makeEl('div', { class: 'signal-modal__cap', 'data-signal-caption': '1' });
  __sub = makeEl('div', { class: 'signal-modal__sub', 'data-signal-sub': '1' });
  __tap = makeEl('button', { class: 'signal-modal__tap', type: 'button', 'data-signal-tap': '1' });
  __tap.textContent = 'Tap to hear';

  meta.append(__cap, __sub, __tap);

  panel.append(__mediaWrap, meta);

  const closeBtn = makeEl('button', {
    class: 'signal-modal__close',
    type: 'button',
    'aria-label': 'Close',
    'data-signal-close': '1',
  });
  closeBtn.textContent = '×';

  __modal.append(backdrop, panel, closeBtn);
  document.body.append(__modal);

  __modal.addEventListener('click', (e) => {
    if (e.target.closest('[data-signal-close]')) closeModal();
  });

  window.addEventListener('keydown', (e) => {
    if (!__modal || __modal.hidden) return;
    if (e.key === 'Escape' || e.key === 'Esc') closeModal();
  });

  __tap.addEventListener('click', async () => {
    if (!__mediaEl) return;
    if (__mediaEl.muted) {
      __mediaEl.muted = false;
      __mediaEl.removeAttribute('muted');
    }
    try {
      await __mediaEl.play();
    } catch (err) {}
    __tap.textContent = __mediaEl.muted ? 'Tap to hear' : 'Sound on';
  });
}

function closeModal() {
  if (!__modal) return;

  if (__mediaEl) {
    try { __mediaEl.pause(); } catch (e) {}
    try { __mediaEl.currentTime = 0; } catch (e) {}
  }

  __mediaEl = null;
  if (__mediaWrap) __mediaWrap.innerHTML = '';
  __modal.hidden = true;
  document.body.classList.remove('ndyra-no-scroll');
}

async function openModal(signal, opts = {}) {
  ensureModal();

  const type = getSignalType(signal);
  const fontClass = resolveFontClass(signal?.signal_font_key);

  const authorName = signal?.author?.full_name || 'NDYRA';
  const authorHandle = signal?.author?.handle ? `@${signal.author.handle}` : '';
  const titleText = signal?.content_text || 'Signal';

  __cap.textContent = titleText;
  __cap.className = `signal-modal__cap ${fontClass}`;
  __sub.textContent = `${authorName}${authorHandle ? ` · ${authorHandle}` : ''}`;

  __tap.textContent = 'Tap to hear';

  // clear old
  __mediaWrap.innerHTML = '';

  // Build media element (muted by default)
  let media = null;

  if (type === 'text') {
    const card = makeEl('div', { class: `signal-text ${fontClass}` });
    card.textContent = titleText;
    __mediaWrap.append(card);
  } else if (type === 'audio') {
    media = makeEl('audio', {
      preload: 'metadata',
      class: 'signal-modal__audio',
      'data-signal-audio': '1',
    });
    media.src = signal?.post_media?.[0]?.public_url || '';
    media.muted = true;
    media.setAttribute('muted', '');

    __mediaWrap.append(media);
  } else {
    media = makeEl('video', {
      preload: 'metadata',
      playsinline: '',
      class: 'signal-modal__video',
      'data-signal-audio': '1', // video also counts as "audio muted" for tests
    });
    media.src = signal?.post_media?.[0]?.public_url || '';
    media.poster = signal?.post_media?.[0]?.poster_url || '';
    media.loop = true;
    media.muted = true;
    media.setAttribute('muted', '');

    __mediaWrap.append(media);
  }

  __mediaEl = media;

  __modal.hidden = false;
  document.body.classList.add('ndyra-no-scroll');

  // Autoplay muted (safe for most browsers); ignore failures.
  if (__mediaEl) {
    setTimeout(() => { try { __mediaEl.play(); } catch (e) {} }, 40);
  }

  // If they tapped "Tap to hear" on the card, honor that.
  if (opts.autoSound && __mediaEl) {
    setTimeout(async () => {
      if (!__mediaEl) return;
      __mediaEl.muted = false;
      __mediaEl.removeAttribute('muted');
      try { await __mediaEl.play(); } catch (e) {}
      __tap.textContent = 'Sound on';
    }, 80);
  }
}

/* =========================================================
   Strip renderer
   ========================================================= */

function buildNewCard() {
  const root = makeEl('button', {
    class: 'signal-card signal-card--new',
    type: 'button',
    'data-signal-new': '1',
    title: 'Create a new Signal',
  });

  const thumb = makeEl('div', { class: 'signal-thumb signal-thumb--new' });
  thumb.innerHTML = '<span style="font-size:28px;font-weight:900;">＋</span>';

  const meta = makeEl('div', { class: 'signal-meta' });
  meta.innerHTML = '<div class="signal-who"><div class="signal-name">New Signal</div><div class="signal-handle">Create</div></div>';

  root.append(thumb, meta);

  root.addEventListener('click', () => {
    // Keep it simple: route to creator with explicit tab to prevent drift.
    window.location.href = '/app/create/?tab=signal';
  });

  return root;
}

function buildSignalCard(signal) {
  const type = getSignalType(signal);
  const fontClass = resolveFontClass(signal?.signal_font_key);

  const root = makeEl('button', {
    class: 'signal-card',
    type: 'button',
    'data-signal-card': '1',
    'data-signal-open': signal?.id || '',
    'data-signal-type': type,
    title: 'Open Signal',
  });

  const thumb = makeEl('div', { class: 'signal-thumb' });

  if (type === 'audio') {
    const audioWrap = makeEl('div', { class: 'signal-audio' });
    const icon = makeEl('div', { class: 'signal-audio-icon' });
    icon.textContent = '🔊';
    audioWrap.append(icon);
    thumb.append(audioWrap);
  } else if (type === 'video') {
    const v = makeEl('video', {
      class: 'signal-media',
      muted: '',
      playsinline: '',
      preload: 'metadata',
    });
    v.src = signal?.post_media?.[0]?.public_url || '';
    v.poster = signal?.post_media?.[0]?.poster_url || '';
    v.muted = true;
    thumb.append(v);
  } else {
    const t = makeEl('div', { class: `signal-text ${fontClass}` });
    t.textContent = (signal?.content_text || 'Signal').slice(0, 60);
    thumb.append(t);
  }

  const tap = makeEl('div', { class: 'signal-tap' });
  tap.textContent = 'Tap to hear';

  const meta = makeEl('div', { class: 'signal-meta' });

  const avatar = makeEl('img', {
    class: 'signal-avatar',
    src: signal?.author?.avatar_url || '/assets/branding/NDYRA_Icon_DarkCircle_512.png',
    alt: '',
    loading: 'lazy',
  });

  const who = makeEl('div', { class: 'signal-who' });
  const name = makeEl('div', { class: 'signal-name' });
  name.textContent = signal?.author?.full_name || 'NDYRA';
  const handle = makeEl('div', { class: 'signal-handle' });
  handle.textContent = signal?.author?.handle ? `@${signal.author.handle}` : '';
  who.append(name, handle);

  meta.append(avatar, who);

  root.append(thumb, tap, meta);

  root.addEventListener('click', (e) => {
    const autoSound = !!e.target.closest('.signal-tap');
    openModal(signal, { autoSound });
  });

  return root;
}

export async function loadDemoSignals() {
  try {
    const res = await fetch('/assets/data/ndyra_demo_signals.json', { cache: 'no-store' });
    const json = await res.json();
    return json.signals || [];
  } catch (err) {
    return [];
  }
}

export function renderSignalStrip(mount, signals, opts = {}) {
  if (!mount) return;

  const maxPerUser = opts.maxPerUser || 2;
  const maxPerTenant = opts.maxPerTenant || 10;

  // demo-only: just cap list length (real enforcement happens in DB / services)
  const capped = (signals || []).slice(0, Math.max(1, maxPerTenant));

  mount.innerHTML = '';

  const head = makeEl('div', { class: 'signal-strip-head' });
  head.innerHTML = `<h3 class="signal-strip-title">Signals</h3><p class="signal-strip-sub">Muted by default. Tap to hear.</p>`;

  const cards = [buildNewCard(), ...capped.map(buildSignalCard)];

  const row = makeEl('div', { class: 'signal-strip-row', 'data-signal-strip-row': '1' }, [head, ...cards]);
  mount.append(row);

  if (capped.length === 0) {
    const empty = makeEl('div', { class: 'signal-strip-empty' });
    empty.textContent = `No Signals yet. Limits: ${maxPerUser} per user, ${maxPerTenant} per gym/club.`;
    mount.append(empty);
  }
}
