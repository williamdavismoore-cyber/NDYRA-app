// NDYRA shared bottom nav (mobile-first)

export function renderBottomNav({ mount, active = '' } = {}) {
  if (!mount) return;

  const is = (key) => (key === active ? 'class="active"' : '');

  mount.innerHTML = `
    <nav class="ndyra-bottomnav" aria-label="Primary">
      <a ${is('fyp')} href="/app/fyp/">For You</a>
      <a ${is('following')} href="/app/following/">Following</a>
      <a ${is('create')} href="/app/create/">Create</a>
      <a ${is('alerts')} href="/app/notifications/">Alerts</a>
      <a ${is('me')} href="/app/profile/">Me</a>
    </nav>
  `;
}
