// NDYRA — Signals (CP36)

import { loadDemoSignals, renderSignalStrip } from '../components/signalStrip.mjs';
import { renderHeader, wireHeaderAndNav } from '../components/header.mjs';
import { renderBottomNav, markActiveNav } from '../components/bottomNav.mjs';

let recorder = null;
let recStream = null;
let chunks = [];

function qs(sel){ return document.querySelector(sel); }

async function startRecording(){
  const startBtn = qs('[data-signal-rec-start]');
  const stopBtn = qs('[data-signal-rec-stop]');
  const preview = qs('[data-signal-rec-preview]');

  if(!navigator.mediaDevices?.getUserMedia){
    alert('This browser cannot record audio.');
    return;
  }

  startBtn.disabled = true;
  stopBtn.disabled = false;
  chunks = [];

  // Native capture smoothing via constraints.
  recStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  });

  const mimeCandidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ];

  let mimeType = '';
  for(const m of mimeCandidates){
    if(window.MediaRecorder?.isTypeSupported?.(m)){
      mimeType = m;
      break;
    }
  }

  recorder = new MediaRecorder(recStream, mimeType ? { mimeType } : undefined);

  recorder.ondataavailable = (e) => {
    if(e.data && e.data.size > 0) chunks.push(e.data);
  };

  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' });
    const url = URL.createObjectURL(blob);

    preview.src = url;
    preview.muted = true; // non-negotiable: muted by default
    preview.play().then(() => preview.pause()).catch(() => {});

    // Cleanup stream.
    recStream?.getTracks?.().forEach((t) => t.stop());
    recStream = null;
  };

  recorder.start();
}

function stopRecording(){
  const startBtn = qs('[data-signal-rec-start]');
  const stopBtn = qs('[data-signal-rec-stop]');

  stopBtn.disabled = true;
  startBtn.disabled = false;

  try{ recorder?.stop?.(); } catch {}
}

export async function init(){
  renderHeader();
  wireHeaderAndNav();
  renderBottomNav();
  markActiveNav();

  // Demo strip for QA.
  const mount = qs('[data-signal-strip]');
  if(mount){
    const signals = await loadDemoSignals();
    renderSignalStrip(mount, signals);
  }

  // Recorder controls.
  qs('[data-signal-rec-start]')?.addEventListener('click', () => {
    startRecording().catch((err) => {
      console.error(err);
      alert('Mic permission denied, or recording unavailable.');

      const startBtn = qs('[data-signal-rec-start]');
      const stopBtn = qs('[data-signal-rec-stop]');
      if(startBtn) startBtn.disabled = false;
      if(stopBtn) stopBtn.disabled = true;
    });
  });

  qs('[data-signal-rec-stop]')?.addEventListener('click', stopRecording);
}
