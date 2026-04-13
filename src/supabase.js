// supabase.js — thin REST wrapper around the Supabase project.
// Depends on globals from config.js: SUPABASE_URL, SUPABASE_KEY.

async function sbFetch(endpoint, options={}) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + endpoint, {
    ...options,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...(options.headers||{})
    }
  });
  if (!res.ok) throw new Error(await res.text());
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}
