// NDYRA — Bottom Nav (mobile-first Social Shell)
// Injected into pages via [data-ndyra-bottomnav]. No external deps.

import { iconSvg } from './icons.mjs';

export function renderBottomNav(){
  const mount = document.querySelector('[data-ndyra-bottomnav]');
  if(!mount) return;

  const items = [
    { key: 'fyp', label: 'For You', href: '/app/fyp/', icon: 'home' },
    { key: 'following', label: 'Following', href: '/app/following/', icon: 'users' },
    { key: 'signals', label: 'Signals', href: '/app/signals/', icon: 'signal' },
    { key: 'profile', label: 'Profile', href: '/app/profile/', icon: 'user' },
    { key: 'biz', label: 'Business', href: '/biz/check-in/', icon: 'briefcase' },
  ];

  mount.innerHTML = `
    <nav class="ndyra-bottomnav" role="navigation" aria-label="NDYRA">
      ${items.map((it)=>`
        <a class="ndyra-bottomnav__item" href="${it.href}" data-nav="${it.key}">
          <span class="ico">${iconSvg(it.icon)}</span>
          <span class="label">${it.label}</span>
        </a>
      `).join('')}
    </nav>
  `;
}

export function markActiveNav(){
  // Prefer explicit hint from body data-active-nav.
  let active = document.body?.getAttribute?.('data-active-nav') || '';

  // Fallback: infer from the current pathname.
  if(!active){
    const p = (location?.pathname || '').toLowerCase();
    if(p.startsWith('/app/fyp')) active = 'fyp';
    else if(p.startsWith('/app/following')) active = 'following';
    else if(p.startsWith('/app/signals')) active = 'signals';
    else if(p.startsWith('/app/profile')) active = 'profile';
    else if(p.startsWith('/biz')) active = 'biz';
  }

  if(!active) return;

  document.querySelectorAll('.ndyra-bottomnav [data-nav]').forEach((a)=>{
    const key = a.getAttribute('data-nav');
    if(key === active) a.classList.add('is-active');
  });
}
