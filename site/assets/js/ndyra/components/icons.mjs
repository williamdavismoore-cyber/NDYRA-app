// NDYRA — curated minimal icon set for the Social Shell.
// No external deps. Stroke uses currentColor so it inherits theming.

const ICONS = {
  home: '<path d="M3 10.5L12 3l9 7.5v10a1.5 1.5 0 0 1-1.5 1.5H4.5A1.5 1.5 0 0 1 3 20.5v-10z"/><path d="M9.5 22V14.5h5V22"/>',
  users: '<circle cx="8" cy="8" r="3"/><path d="M2 21v-1.2a6 6 0 0 1 12 0V21"/><circle cx="17" cy="9" r="2.5"/><path d="M14 21v-1a4.8 4.8 0 0 1 8.5-3"/>',
  signal: '<circle cx="12" cy="12" r="9"/><path d="M13 7l-4 6h4l-2 6 4-6h-4z"/>',
  user: '<circle cx="12" cy="8" r="3.2"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 12h18"/>',
  dumbbell: '<path d="M6 10v4"/><path d="M18 10v4"/><path d="M8 9v6"/><path d="M16 9v6"/><path d="M10 12h4"/>',
  tag: '<path d="M3 12l9 9 9-9-9-9H3v9z"/><path d="M7.5 7.5h.01"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7"/><path d="M10.3 21a2 2 0 0 0 3.4 0"/>',
  bolt: '<path d="M13 2L3 14h7l-1 8 10-12h-7z"/>',
};

export function iconSvg(name, { size = 18, className = 'ndyra-ico', title = '' } = {}){
  const inner = ICONS[name] || '';
  const t = title ? `<title>${escapeHtml(title)}</title>` : '';
  return `<svg class="${className}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="${title ? 'false' : 'true'}" focusable="false">${t}${inner}</svg>`;
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, (c)=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  }[c]));
}
