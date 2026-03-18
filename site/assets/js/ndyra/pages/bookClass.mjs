function setVisible(sel,v){ const el=document.querySelector(sel); if(el) el.hidden=!v; }
export function initBookClass(){
 const tokenPathAllowed = false;
 const refs=['data-action="book-membership"','data-action="book-tokens"','data-action="update-payment"','data-token-path'];
 setVisible('[data-token-path]', tokenPathAllowed);
 return refs.length;
}
