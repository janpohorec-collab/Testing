// Vercel serverless funkcija: TIS (itis.siol.net) iskanje po naslovih.
// POST /api/tis  { "addresses": [ { "key": "123", "street": "Ulica kneza Koclja 26", "city": "Maribor" }, ... ] }
// Vrne { results: { key: { entries: [...], approx: n, morePages: bool, error?: string } } }

import { parseTis, hiddenFields, normAddr } from '../lib/tis-parse.js';

const ORIGIN = 'https://itis.siol.net';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const MAX_PER_CALL = 10;
const PARALLEL = 3;
const STATE_TTL = 10 * 60 * 1000;

let state = null; // { fields, cookie, at }

function cookieFrom(res) {
  const raw = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean);
  return raw.map(c => c.split(';')[0]).join('; ');
}

async function getState(force = false) {
  if (!force && state && Date.now() - state.at < STATE_TTL) return state;
  const res = await fetch(ORIGIN + '/', { headers: { 'User-Agent': UA, 'Accept-Language': 'sl-SI,sl;q=0.9' } });
  if (!res.ok) throw new Error('TIS ni dosegljiv (' + res.status + ')');
  const html = await res.text();
  const fields = hiddenFields(html);
  if (!fields.__VIEWSTATE) throw new Error('TIS je spremenil obliko strani (ni viewstate).');
  state = { fields, cookie: cookieFrom(res), at: Date.now() };
  return state;
}

async function searchOnce(where, st) {
  const body = new URLSearchParams({
    __EVENTTARGET: '', __EVENTARGUMENT: '',
    ...st.fields,
    'ctl00$search$hfSearchMode': '',
    'ctl00$search$hfSearchFormMode': '2',
    'ctl00$search$tbWhoOrWhat': '',
    'ctl00$search$tbWhere': where,
    'ctl00$search$btnSearch': 'IŠČI'
  });
  const res = await fetch(ORIGIN + '/?rw=1', {
    method: 'POST',
    headers: {
      'User-Agent': UA, 'Accept-Language': 'sl-SI,sl;q=0.9',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Origin': ORIGIN, 'Referer': ORIGIN + '/',
      ...(st.cookie ? { Cookie: st.cookie } : {})
    },
    body
  });
  if (!res.ok) throw new Error('TIS ' + res.status);
  return res.text();
}

async function lookup(addr) {
  const where = [addr.street, addr.city].filter(Boolean).join(' ');
  let html;
  try {
    html = await searchOnce(where, await getState());
    if (!/RepeaterResults|Noben zapis/.test(html)) throw new Error('retry');
  } catch {
    html = await searchOnce(where, await getState(true));
  }
  const { entries, morePages } = parseTis(html);
  const target = normAddr(addr.street);
  const exact = entries.filter(e => normAddr(e.street) === target);
  return { entries: exact, approx: entries.length - exact.length, morePages };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Uporabi POST.' });

  let payload = req.body;
  if (typeof payload === 'string') { try { payload = JSON.parse(payload); } catch { payload = null; } }
  const list = Array.isArray(payload?.addresses) ? payload.addresses.slice(0, MAX_PER_CALL) : [];
  if (!list.length) return res.status(400).json({ error: 'Manjka seznam naslovov.' });

  const results = {};
  await getState().catch(() => {});
  // do 3 poizvedbe hkrati na klic
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(PARALLEL, list.length) }, async () => {
    while (i < list.length) {
      const a = list[i++];
      const key = String(a.key ?? a.street);
      try {
        if (!a.street) throw new Error('Manjka ulica.');
        results[key] = await lookup(a);
      } catch (e) {
        results[key] = { entries: [], approx: 0, morePages: false, error: String(e.message || e) };
      }
    }
  }));
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ results });
}
