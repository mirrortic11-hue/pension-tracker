// quotes.js — KRX equity quote fetching with Naver → Yahoo fallback
// and a localStorage cache that survives network failures.
//
// Public surface used by the rest of the app:
//   normalizeKrxCode(code)         -> 6-digit string
//   fetchKrxQuotesForCodes(codes)  -> { [norm6]: {price,prevClose,diff,rate} | null }
//
// No DOM access. No app state. Safe to edit in isolation.

function normalizeKrxCode(code) {
  const d = String(code || '').replace(/\D/g, '');
  if (!d) return '';
  return d.padStart(6, '0').slice(-6);
}

function priceFromYahooChartJson(j) {
  const meta = j?.chart?.result?.[0]?.meta;
  if (!meta) return null;
  const price = meta.regularMarketPrice ?? meta.chartPreviousClose ?? meta.previousClose;
  return typeof price === 'number' && price > 0 ? price : null;
}

/** Yahoo 직접 fetch는 브라우저에서 CORS로 막히는 경우가 많아, 실패 시 Jina 프록시로 동일 JSON 수신 */
async function fetchYahooChartJson(sym) {
  const path = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5d`;
  try {
    const res = await fetch(path);
    if (res.status === 429) await new Promise(r => setTimeout(r, 600));
    else if (res.ok) {
      const j = await res.json();
      if (j.chart?.result?.[0]?.meta) return j;
    }
  } catch (_) { /* CORS 등 */ }
  try {
    const res = await fetch('https://r.jina.ai/' + path);
    if (!res.ok) return null;
    const text = await res.text();
    const marker = 'Markdown Content:\n';
    let raw = text.includes(marker) ? text.slice(text.indexOf(marker) + marker.length).trim() : text;
    const b = raw.indexOf('{"chart"');
    if (b >= 0) raw = raw.slice(b);
    return JSON.parse(raw.trim());
  } catch (_) {
    return null;
  }
}

function extractJsonFromJinaText(text) {
  const marker = 'Markdown Content:\n';
  let raw = text.includes(marker) ? text.slice(text.indexOf(marker) + marker.length).trim() : text.trim();
  const start = raw.indexOf('{');
  if (start > 0) raw = raw.slice(start);
  return raw;
}

async function fetchNaverKrxQuote(norm6) {
  try {
    const url = `https://r.jina.ai/http://polling.finance.naver.com/api/realtime/domestic/stock/${encodeURIComponent(norm6)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const text = await res.text();
    const data = JSON.parse(extractJsonFromJinaText(text));
    const row = data?.datas?.[0];
    if (!row) return null;
    const price = Number(String(row.closePriceRaw || '').replace(/\D/g, ''));
    const diff = Number(String(row.compareToPreviousClosePriceRaw ?? row.compareToPreviousClosePrice ?? '').replace(/,/g, ''));
    const rate = Number(String(row.fluctuationsRatioRaw ?? row.fluctuationsRatio ?? '').replace(/,/g, ''));
    if (!Number.isFinite(price) || price <= 0) return null;
    const prevClose = price - (Number.isFinite(diff) ? diff : 0);
    return { price, prevClose, diff: Number.isFinite(diff) ? diff : 0, rate: Number.isFinite(rate) ? rate : 0 };
  } catch (_) {
    return null;
  }
}

/** 코스피·코스닥 접미사 자동 시도 */
async function fetchYahooKrxQuote(norm6) {
  for (const suf of ['.KS', '.KQ']) {
    const sym = norm6 + suf;
    const j = await fetchYahooChartJson(sym);
    const meta = j?.chart?.result?.[0]?.meta;
    const p = priceFromYahooChartJson(j);
    if (p != null) {
      const closes = j?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [];
      const validCloses = closes.filter(v => typeof v === 'number' && Number.isFinite(v) && v > 0);
      const prevFromSeries = validCloses.length >= 2 ? validCloses[validCloses.length - 2] : null;
      const prevMeta = Number(meta?.previousClose ?? meta?.chartPreviousClose ?? 0);
      const prevClose = prevFromSeries ?? (prevMeta > 0 ? prevMeta : 0);
      const diff = prevClose > 0 ? (p - prevClose) : 0;
      const rate = prevClose > 0 ? (diff / prevClose * 100) : 0;
      return { price: p, prevClose, diff, rate };
    }
  }
  return null;
}

async function fetchKrxQuote(norm6) {
  const naver = await fetchNaverKrxQuote(norm6);
  if (naver) return naver;
  return fetchYahooKrxQuote(norm6);
}

async function fetchKrxQuotesForCodes(codes) {
  const QUOTE_CACHE_KEY = 'pension_tracker_quote_cache_v1';
  const norms = [...new Set(codes.map(normalizeKrxCode))].filter(c => c && c !== '000000');
  const cached = (() => {
    try { return JSON.parse(localStorage.getItem(QUOTE_CACHE_KEY) || '{}'); }
    catch (_) { return {}; }
  })();
  const map = {};
  for (const n of norms) {
    const q = await fetchKrxQuote(n);
    if (q && q.price) {
      map[n] = q;
      cached[n] = { ...q, ts: Date.now() };
    } else if (cached[n] && cached[n].price) {
      map[n] = cached[n];
    } else {
      map[n] = null;
    }
    await new Promise(r => setTimeout(r, 100));
  }
  try { localStorage.setItem(QUOTE_CACHE_KEY, JSON.stringify(cached)); } catch (_) {}
  return map;
}
