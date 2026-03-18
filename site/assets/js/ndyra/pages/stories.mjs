import { getSignalsStoriesPolicy } from '../modules/signalsStoriesPolicy/index.mjs';
import { escHtml } from '../lib/utils.mjs';

const $ = (s, r=document)=> r.querySelector(s);

function storyTypeCard(title, body){
  return `<section class="ndyra-card" style="padding:16px;min-height:0;"><div class="ndyra-h2">${escHtml(title)}</div><div class="muted ndyra-mt-2" style="line-height:1.55;">${escHtml(body)}</div></section>`;
}

export async function init(){
  const root = $('[data-stories-root]');
  if(!root) return;
  const policy = getSignalsStoriesPolicy();
  root.innerHTML = `
    <section class="hero">
      <div class="hero-grid">
        <div>
          <span class="badge">NDYRA stories lane</span>
          <h1 style="margin-top:10px;">Stories are content. Signals are alerts.</h1>
          <p>${escHtml(policy.stories.description)} This route is now reserved for SOC01 so Core can mount Stories cleanly without faking a finished feed first.</p>
          <div class="btn-row">
            <a class="btn primary" href="/app/fyp/">Back to For You</a>
            <a class="btn" href="/app/aftermath/">Open Aftermath</a>
            <a class="btn" href="/app/signals/">Open Signals</a>
          </div>
        </div>
        <div class="card" style="padding:18px;display:grid;gap:10px;min-height:0;">
          <div style="font-weight:900;">Current Core truth</div>
          <div class="small" style="line-height:1.55;display:grid;gap:8px;">
            <div>Stories are a dedicated SOC01 content lane.</div>
            <div>Aftermath will be able to create stories.</div>
            <div>Signals stay reserved for alerts and prompts.</div>
            <div>Biometric story cards stay opt-in only.</div>
          </div>
        </div>
      </div>
    </section>
    <section class="ndyra-grid ndyra-mt-4" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;">
      ${storyTypeCard('Workout stories', 'Generated from workout recaps and member highlights.')}
      ${storyTypeCard('Gym stories', 'Shared by gyms without leaking operator tools into member home.')}
      ${storyTypeCard('Challenge stories', 'Milestones, streaks, and leaderboard movement that read like content instead of alerts.')}
      ${storyTypeCard('Biometric stories', 'Only when the member explicitly shares a metric or achievement.')}
    </section>`;
}
