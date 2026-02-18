import { requireAuth } from '../lib/supabase.mjs';

function markActiveNav(){
  const path = window.location.pathname.replace(/\/+/g,'/');
  document.querySelectorAll('[data-nav]').forEach(a => {
    const href = a.getAttribute('href') || '';
    const on = href && (path === href || path.startsWith(href));
    if(on) a.classList.add('active'); else a.classList.remove('active');
  });
}

export async function init(){
  markActiveNav();
  await requireAuth();
  const box = document.querySelector('[data-ndyra-stub]');
  if(box) box.textContent = 'Notifications is next (read from notifications table + mark read).';
}
