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

// Paginated GET: loops through Range chunks (Supabase caps responses at ~1000
// rows by default). Parses Content-Range to detect the total and stops when
// all rows are fetched. Pass an endpoint WITHOUT `limit=` query param.
async function sbFetchAll(endpoint, pageSize = 1000) {
  const out = [];
  let offset = 0;
  // Safety ceiling to avoid runaway loops if the server misbehaves.
  const MAX_PAGES = 50;
  for (let page = 0; page < MAX_PAGES; page++) {
    const end = offset + pageSize - 1;
    const res = await fetch(SUPABASE_URL + '/rest/v1/' + endpoint, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation,count=exact',
        'Range-Unit': 'items',
        'Range': `${offset}-${end}`,
      },
    });
    if (!res.ok) throw new Error(await res.text());
    const text = await res.text();
    const chunk = text ? JSON.parse(text) : [];
    out.push(...chunk);
    // Parse "items 0-999/1392" or "0-999/1392"
    const cr = res.headers.get('content-range') || '';
    const total = Number((cr.split('/')[1] || '').trim());
    if (!Number.isFinite(total) || out.length >= total) break;
    if (chunk.length === 0) break; // safety
    offset += pageSize;
  }
  return out;
}
