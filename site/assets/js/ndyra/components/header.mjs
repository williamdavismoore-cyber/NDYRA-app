// NDYRA shared header (smallest-change component)
// Used by /app/signals/ and can be reused by other NDYRA pages.

export function renderHeader({ mount, active = '' } = {}) {
  if (!mount) return;

  const is = (key) => (key === active ? 'class="ndyra-pill is-active"' : 'class="ndyra-pill"');

  mount.innerHTML = `
    <div class="inner">
      <a class="brand" href="/" aria-label="NDYRA home">
        <img src="/assets/branding/NDYRA_Icon_DarkCircle_512.png" alt="NDYRA" width="26" height="26" />
        <span>NDYRA</span>
      </a>

      <div class="ndyra-header__center">
        <a ${is('fyp')} href="/app/fyp/">For You</a>
        <a ${is('following')} href="/app/following/">Following</a>
        <a ${is('signals')} href="/app/signals/">Signals</a>
      </div>

      <div class="ndyra-header__right">
        <a class="ndyra-pill" href="/app/create/">Create</a>
        <a class="ndyra-pill" href="/app/notifications/">Alerts</a>
        <a class="ndyra-pill" href="/app/profile/">Me</a>
      </div>
    </div>
  `;
}

// kept as a no-op helper to satisfy pages that call it; we can extend later without drift
export function wireHeaderAndNav() {
  return;
}
