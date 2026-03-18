import { getExperiencePrefs, getPreferredMemberEntryPath } from '../modules/moduleHost/index.mjs';
import { escHtml } from '../lib/utils.mjs';

const $ = (s, r=document)=> r.querySelector(s);

function fallback(path){
  const root = $('[data-app-launch-root]');
  if(!root) return;
  root.innerHTML = `
    <section class="hero">
      <div class="hero-grid">
        <div>
          <span class="badge">NDYRA member launch</span>
          <h1 style="margin-top:10px;">Choose how NDYRA should open for you.</h1>
          <p class="muted">For You is the familiar default. Simple Home is the calmer backup when you want only the essentials.</p>
          <div class="btn-row">
            <a class="btn primary" href="/app/fyp/">Open For You</a>
            <a class="btn" href="/app/home/">Open Simple Home</a>
            <a class="btn" href="${escHtml(path)}">Retry default</a>
          </div>
        </div>
      </div>
    </section>`;
}

export async function init(){
  try{
    const prefs = await getExperiencePrefs();
    const path = getPreferredMemberEntryPath(prefs);
    location.replace(path + location.search + location.hash);
  }catch(_e){
    fallback('/app/fyp/');
  }
}
