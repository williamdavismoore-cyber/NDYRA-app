(function(){
  const BUILD_ID = '2026-03-16_122';
  import(`/assets/js/ndyra/shell/runtime.mjs?v=${BUILD_ID}`)
    .then((mod)=> {
      if(typeof mod.startShellRuntime === 'function') mod.startShellRuntime();
    })
    .catch((error)=> {
      console.error('NDYRA shell runtime failed', error);
    });
})();
