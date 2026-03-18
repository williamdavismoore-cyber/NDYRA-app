import { escHtml } from '../lib/utils.mjs';
import { fetchJson } from '../lib/http.mjs';

const BUILD_ID = '2026-03-16_122';
const EXPERIENCE_PREFS_KEY = 'ndyra:experience:prefs';

let detachUnreadSubscription = null;
let moduleHostPromise = null;
let started = false;

function loadModuleHost(){
  if(!moduleHostPromise){
    moduleHostPromise = import(`/assets/js/ndyra/modules/moduleHost/index.mjs?v=${BUILD_ID}`);
  }
  return moduleHostPromise;
}

async function applyBuild(){
  try {
    const build = await fetchJson(`/assets/build.json?v=${BUILD_ID}`, { timeoutMs: 5000 });
    document.querySelectorAll('[data-build-label]').forEach((el)=> {
      el.textContent = build?.label || (`CP${build?.cp || ''}`);
    });
  } catch (error) {
    console.warn('build label failed', error);
  }
}

function getShellContext(pathname = window.location.pathname){
  const path = String(pathname || '/');
  if(path.startsWith('/admin/')) return 'admin';
  if(path.startsWith('/biz/')) return 'business';
  if(path.startsWith('/app/')) return 'member';
  if(path.startsWith('/for-gyms/')) return 'for-gyms';
  return 'public';
}

function navItemsForContext(context){
  switch(context){
    case 'admin':
      return [
        { label:'Preview', href:'/preview/' },
        { label:'Status', href:'/admin/status/' },
        { label:'Wiring', href:'/admin/wiring/' },
        { label:'Execute', href:'/admin/execute/' },
      ];
    case 'business':
      return [
        { label:'Home', href:'/' },
        { label:'For gyms', href:'/for-gyms/' },
        { label:'Biz home', href:'/biz/' },
        { label:'Shop', href:'/biz/shop/' },
        { label:'Settings', href:'/biz/settings/' },
      ];
    case 'for-gyms':
      return [
        { label:'Home', href:'/' },
        { label:'For gyms', href:'/for-gyms/' },
        { label:'Pricing', href:'/for-gyms/pricing.html' },
        { label:'Start', href:'/for-gyms/start.html' },
        { label:'Sign in', href:'/login/' },
      ];
    case 'member':
      return [
        { label:'For You', href:'/app/fyp/' },
        { label:'Messages', href:'/app/inbox/', appLink:'inbox' },
        { label:'Alerts', href:'/app/notifications/', appLink:'notifications' },
        { label:'Profile', href:'/app/profile/' },
        { label:'More', href:'/app/more/' },
      ];
    default:
      return [
        { label:'Home', href:'/' },
        { label:'Join', href:'/join.html' },
        { label:'Pricing', href:'/pricing.html' },
        { label:'For gyms', href:'/for-gyms/' },
        { label:'Sign in', href:'/login/' },
      ];
  }
}

function renderNavItems(items=[]){
  return items.map((item)=> {
    const attrs = [
      `href="${escHtml(item.href || '/')}"`,
      item.appLink ? `data-app-link="${escHtml(item.appLink)}"` : '',
    ].filter(Boolean).join(' ');
    return `<a ${attrs}>${escHtml(item.label || 'Open')}</a>`;
  }).join('');
}

function applyFriendlyNav(){
  const nav = document.querySelector('header .nav');
  if(!nav || nav.dataset.preserveNav === 'true') return;
  nav.innerHTML = renderNavItems(navItemsForContext(getShellContext()));
}

function ensureSkipLink(){
  const main = document.querySelector('main');
  if(!main) return;
  if(!main.id) main.id = 'main-content';
  if(document.querySelector('.skip-link')) return;
  const link = document.createElement('a');
  link.className = 'skip-link';
  link.href = '#main-content';
  link.textContent = 'Skip to content';
  document.body.insertBefore(link, document.body.firstChild || null);
}

function markCurrentNavLinks(){
  document.querySelectorAll('nav.nav').forEach((nav)=> {
    if(!nav.getAttribute('aria-label')) nav.setAttribute('aria-label', 'Primary navigation');
    nav.querySelectorAll('a[href]').forEach((link)=> {
      const href = link.getAttribute('href') || '';
      const isCurrent = href && (
        link.pathname === window.location.pathname ||
        (link.pathname !== '/' && window.location.pathname.startsWith(link.pathname))
      );
      if(isCurrent) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  });
}

function enhanceShellAccessibility(){
  if(document.documentElement && !document.documentElement.lang){
    document.documentElement.lang = 'en';
  }
  ensureSkipLink();
  markCurrentNavLinks();
}

function ensureAppCommandBadges(){
  if(!window.location.pathname.startsWith('/app/')) return;
  const nav = document.querySelector('header .nav');
  if(!nav) return;
  const specs = [
    { name:'inbox', href:'/app/inbox/', label:'Messages' },
    { name:'notifications', href:'/app/notifications/', label:'Alerts' },
  ];
  for(const spec of specs){
    let link = nav.querySelector(`[data-app-link="${spec.name}"]`);
    if(!link){
      link = document.createElement('a');
      link.href = spec.href;
      link.dataset.appLink = spec.name;
      link.style.display = 'inline-flex';
      link.style.alignItems = 'center';
      link.style.gap = '8px';
      link.textContent = spec.label;
      nav.appendChild(link);
    }
    let badge = link.querySelector(`[data-nav-badge="${spec.name}"]`);
    if(!badge){
      badge = document.createElement('span');
      badge.dataset.navBadge = spec.name;
      badge.className = 'ndyra-pill is-active';
      badge.style.display = 'none';
      badge.textContent = '0';
      link.appendChild(badge);
    }
    const isCurrent = window.location.pathname === spec.href || window.location.pathname.startsWith(spec.href);
    if(isCurrent){
      link.classList.add('primary');
      link.setAttribute('aria-current', 'page');
    }
  }
}

function setNavBadge(name, value){
  const el = document.querySelector(`[data-nav-badge="${name}"]`);
  if(!el) return;
  const count = Number(value || 0);
  el.textContent = String(count);
  el.style.display = count > 0 ? 'inline-flex' : 'none';
}

function applyCounts(counts){
  setNavBadge('notifications', counts?.notifications);
  setNavBadge('inbox', counts?.inbox);
}

async function applyAppBadges(){
  if(!window.location.pathname.startsWith('/app/')) return;
  ensureAppCommandBadges();
  try{
    const mod = await import(`/assets/js/ndyra/lib/unreadCounts.mjs?v=${BUILD_ID}`);
    if(detachUnreadSubscription) detachUnreadSubscription();
    detachUnreadSubscription = mod.subscribeUnreadCounts(applyCounts, { emitInitial:true });
    const counts = await mod.refreshUnreadCounts();
    applyCounts(counts);
  }catch(error){
    console.warn('app nav badges failed', error);
  }
}

async function applyExperiencePrefs(){
  try{
    const mod = await loadModuleHost();
    const [prefs, hostStatus] = await Promise.all([
      mod.getExperiencePrefs(),
      typeof mod.getModuleHostStatus === 'function' ? mod.getModuleHostStatus() : Promise.resolve(null),
    ]);
    document.documentElement.setAttribute('data-ndyra-mode', prefs?.mode === 'full' ? 'full' : 'simple');
    document.documentElement.setAttribute('data-ndyra-comfort', prefs?.comfort_mode ? 'true' : 'false');
    const disabledCount = Number(hostStatus?.disabled_module_count || 0);
    document.documentElement.setAttribute('data-ndyra-disabled-modules', String(disabledCount));
  }catch(_error){
    document.documentElement.setAttribute('data-ndyra-mode', 'simple');
    document.documentElement.setAttribute('data-ndyra-comfort', 'false');
    document.documentElement.setAttribute('data-ndyra-disabled-modules', '0');
  }
}

function bindRuntimeEvents(){
  window.addEventListener('ndyra:experience:changed', ()=> { void applyExperiencePrefs(); });
  window.addEventListener('storage', (event)=> {
    if(event?.key === EXPERIENCE_PREFS_KEY) void applyExperiencePrefs();
  });
}

async function initShellRuntime(){
  applyFriendlyNav();
  enhanceShellAccessibility();
  await applyExperiencePrefs();
  await applyBuild();
  await applyAppBadges();
}

export function startShellRuntime(){
  if(started) return;
  started = true;
  window.NDYRA = { ...(window.NDYRA || {}), version: BUILD_ID };
  bindRuntimeEvents();
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', ()=> { void initShellRuntime(); }, { once:true });
    return;
  }
  void initShellRuntime();
}
