function composeAbortSignal(signal, timeoutMs=10000){
  const timeout = Math.max(1, Number(timeoutMs || 0));
  const controller = new AbortController();
  const onAbort = ()=> controller.abort(signal?.reason || new DOMException('Request aborted', 'AbortError'));
  let timer = null;

  if(signal){
    if(signal.aborted){
      controller.abort(signal.reason || new DOMException('Request aborted', 'AbortError'));
    }else{
      signal.addEventListener('abort', onAbort, { once:true });
    }
  }

  if(Number.isFinite(timeout) && timeout > 0){
    timer = setTimeout(()=> {
      controller.abort(new DOMException(`Request timed out after ${timeout}ms`, 'TimeoutError'));
    }, timeout);
  }

  return {
    signal: controller.signal,
    cleanup(){
      if(timer) clearTimeout(timer);
      if(signal) signal.removeEventListener('abort', onAbort);
    },
  };
}

export async function fetchText(url, { timeoutMs=10000, signal, headers, ...options }={}){
  const { signal: mergedSignal, cleanup } = composeAbortSignal(signal, timeoutMs);
  try{
    const res = await fetch(url, {
      cache: 'no-store',
      ...options,
      headers,
      signal: mergedSignal,
    });
    if(!res.ok){
      const body = await res.text().catch(()=> '');
      throw new Error(`${url} -> ${res.status}${body ? ` :: ${body.slice(0, 160)}` : ''}`);
    }
    return await res.text();
  }finally{
    cleanup();
  }
}

export async function fetchJson(url, { timeoutMs=10000, signal, headers, ...options }={}){
  const text = await fetchText(url, {
    timeoutMs,
    signal,
    headers: {
      Accept: 'application/json',
      ...(headers || {}),
    },
    ...options,
  });
  try{
    return JSON.parse(text || 'null');
  }catch(_e){
    throw new Error(`${url} returned invalid JSON`);
  }
}
