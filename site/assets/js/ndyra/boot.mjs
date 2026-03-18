const pageMap = {
  'ndyra-fyp': '/assets/js/ndyra/pages/fyp.mjs',
  'ndyra-profile': '/assets/js/ndyra/pages/profile.mjs',
  'ndyra-following': '/assets/js/ndyra/pages/following.mjs',
  'ndyra-signals': '/assets/js/ndyra/pages/signals.mjs',
  'ndyra-stories': '/assets/js/ndyra/pages/stories.mjs',
  'ndyra-performance': '/assets/js/ndyra/pages/performance.mjs',
  'ndyra-post': '/assets/js/ndyra/pages/post.mjs',
  'ndyra-wallet': '/assets/js/ndyra/pages/wallet.mjs',
  'ndyra-purchases': '/assets/js/ndyra/pages/purchases.mjs',
  'ndyra-library-timers': '/assets/js/ndyra/pages/libraryTimers.mjs',
  'ndyra-shop': '/assets/js/ndyra/pages/shop.mjs',
  'ndyra-aftermath': '/assets/js/ndyra/pages/aftermath.mjs',
  'ndyra-notifications': '/assets/js/ndyra/pages/notifications.mjs',
  'ndyra-inbox': '/assets/js/ndyra/pages/inbox.mjs',
  'ndyra-app-home': '/assets/js/ndyra/pages/appHome.mjs',
  'ndyra-app-launch': '/assets/js/ndyra/pages/appLaunch.mjs',
  'ndyra-app-more': '/assets/js/ndyra/pages/appMore.mjs',
  'ndyra-settings': '/assets/js/ndyra/pages/settings.mjs',
  'ndyra-members': '/assets/js/ndyra/pages/members.mjs',
};

document.addEventListener('DOMContentLoaded', async()=>{
  const page = document.body.dataset.page || 'none';
  document.documentElement.setAttribute('data-page', page);
  const modPath = pageMap[page];
  if(!modPath) return;
  try{
    const mod = await import(modPath + '?v=2026-03-16_122');
    if(typeof mod.init === 'function') await mod.init();
  }catch(err){
    console.error('NDYRA boot failed for page', page, err);
  }
});
