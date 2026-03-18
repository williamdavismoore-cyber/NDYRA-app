export function safeJsonParse(raw, fallback=null){
  try{ return JSON.parse(raw || 'null') ?? fallback; }catch(_e){ return fallback; }
}

export function mergeDeep(base, extra){
  const out = { ...(base || {}) };
  for(const [key, value] of Object.entries(extra || {})){
    if(value && typeof value === 'object' && !Array.isArray(value)) out[key] = mergeDeep(out[key], value);
    else out[key] = value;
  }
  return out;
}

export function looksPlaceholder(value=''){
  const text = String(value || '').trim();
  if(!text) return true;
  return /YOUR_|your-|example|xxx|REPLACE_ME|<your-|PRICE_ID_|pk_test_xxx|sk_test_xxx/i.test(text);
}

export function normalizeObjectRows(raw){
  if(Array.isArray(raw)) return raw;
  if(raw && typeof raw === 'object') return Object.entries(raw).map(([key, value])=> ({ key, ...(value || {}) }));
  return [];
}
