// PUBLIC config endpoint.
// Purpose: provide *public* client-side config values to the static frontend
// without committing them into the repo.
//
// IMPORTANT: Only return values that are safe to expose in the browser.
// - Supabase URL + anon/publishable key are intended to be public.
// - Never return service-role keys.

exports.handler = async () => {
  const supabase_url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const supabase_anon_key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

  const payload = {
    supabase_url,
    supabase_anon_key,
  };

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      // If you ever want to request this from a different origin,
      // you can loosen this later. For now, keep it same-origin only.
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(payload),
  };
};
