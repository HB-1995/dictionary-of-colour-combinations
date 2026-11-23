/* Seen in art: finds Harvard Art Museums works whose colours match a palette.
   GET /api/art?c=HEX,HEX,...&type=Paintings|Prints|Drawings|Textile Arts|Photographs|all&n=12
   The Harvard key stays here (HARVARD_ART_MUSEUMS_API env var). Responses are cached by Vercel for up to 14 days,
   within Harvard's terms (non-commercial, cache < 2 weeks, link back, images from returned URLs). */
const M = require('../mix.js')({ LATENT_SIZE: 7 });
const BASE = 'https://api.harvardartmuseums.org/object';
const TYPES = ['Paintings', 'Prints', 'Drawings', 'Textile Arts', 'Photographs'];
const FIELDS = 'id,title,people,dated,url,primaryimageurl,colors,classification,imagepermissionlevel';

const labOf = h => M.lab(M.rgbOf(h));
const chroma = l => Math.hypot(l[1], l[2]);
/* Harvard's colour search matches the simplified colours it extracts from each image: every RGB channel
   is a multiple of 25 (0, 25 ... 250). So each palette colour is snapped to its nearest grid colours. */
const grid = v => [Math.max(0, Math.floor(v / 25) * 25), Math.min(250, Math.ceil(v / 25) * 25)];
const gridHex = (r, g, b) => '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
function snapGrid(hex, k = 2) {
  const [r, g, b] = M.rgbOf(hex), lab = labOf(hex), out = [];
  for (const R of new Set(grid(r))) for (const G of new Set(grid(g))) for (const B of new Set(grid(b))) { const h = gridHex(R, G, B); out.push({ h, d: M.de2000(lab, labOf(h.toUpperCase())) }) }
  return out.sort((x, y) => x.d - y.d).slice(0, k).map(x => x.h);
}

async function harvard(params) {
  const u = new URL(BASE);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u);
  if (!r.ok) throw new Error('Harvard API ' + r.status);
  const j = await r.json();
  return j.records || [];
}

function score(rec, pal) {
  const cols = (rec.colors || []).filter(c => c && c.color).map((c, i) => ({ i, hex: c.color.toUpperCase(), pct: +c.percent || 0, lab: labOf(c.color) }));
  if (!cols.length) return null;
  let matched = 0, deSum = 0, presence = 0;
  const hits = new Set();
  pal.forEach(p => {
    let best = null;
    cols.forEach((c, i) => { const d = M.de2000(p.lab, c.lab); if (!best || d < best.d) best = { d, i } });
    const limit = chroma(p.lab) < 15 ? 10 : 14;           // muted colours must match more tightly
    if (best && best.d < limit) { matched++; deSum += best.d; presence += Math.min(cols[best.i].pct, 0.3) / 0.3; hits.add(best.i) }
  });
  const need = pal.length >= 3 ? pal.length - 1 : pal.length;
  if (matched < need) return null;
  const closeness = deSum / matched;
  const off = cols.reduce((s, c, i) => s + (!hits.has(i) && chroma(c.lab) > 20 && Math.min(...pal.map(p => M.de2000(p.lab, c.lab))) > 20 ? c.pct : 0), 0);
  const s = 100 * matched / pal.length - 2.5 * closeness + 20 * presence / pal.length - 40 * off;
  return { s, closeness, matched, hits, cols };
}

module.exports = async (req, res) => {
  const key = process.env.HARVARD_ART_MUSEUMS_API || process.env.HARVARD_API_KEY;
  res.setHeader('Content-Type', 'application/json');
  if (!key) { res.statusCode = 503; return res.end(JSON.stringify({ error: 'not-configured' })) }
  const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  const hexes = String(q.c || '').split(',').map(h => h.trim().replace(/^#?/, '#').toUpperCase()).filter(h => /^#[0-9A-F]{6}$/.test(h)).slice(0, 12);
  if (!hexes.length) { res.statusCode = 400; return res.end(JSON.stringify({ error: 'no-colours' })) }
  const type = TYPES.includes(q.type) ? q.type : (q.type === 'all' ? 'all' : 'Paintings');
  const n = Math.max(1, Math.min(24, +q.n || 12));
  const pal = hexes.map(h => ({ hex: h, lab: labOf(h) }));
  try {
    const snapped = [...new Set(pal.flatMap(p => snapGrid(p.hex, pal.length > 4 ? 1 : 2)))];
    const common = { apikey: key, hasimage: 1, size: 40, fields: FIELDS, q: 'imagepermissionlevel:0' };
    if (type !== 'all') common.classification = type;
    const pools = await Promise.all(snapped.map(h => harvard({ ...common, color: h }).catch(() => [])));
    const seen = new Map();
    pools.flat().forEach(r => { if (r && r.id && r.primaryimageurl && !seen.has(r.id)) seen.set(r.id, r) });
    const ranked = [...seen.values()].map(r => ({ r, m: score(r, pal) })).filter(x => x.m && x.m.closeness < 12)
      .sort((a, b) => b.m.s - a.m.s).slice(0, n)
      .map(({ r, m }) => ({
        id: r.id, title: r.title || 'Untitled', artist: (r.people && r.people[0] && r.people[0].name) || '', dated: r.dated || '',
        classification: r.classification || '', url: r.url || `https://harvardartmuseums.org/collections/object/${r.id}`,
        image: r.primaryimageurl, matched: m.matched, de: Math.round(m.closeness * 10) / 10,
        colors: m.cols.slice().sort((a, b) => b.pct - a.pct).slice(0, 8).map(c => ({ hex: c.hex, pct: Math.round(c.pct * 1000) / 10, hit: m.hits.has(c.i) }))
      }));
    res.setHeader('Cache-Control', ranked.length ? 'public, s-maxage=1209600, stale-while-revalidate=86400' : 'no-store');
    res.end(JSON.stringify({ palette: hexes, type, candidates: seen.size, results: ranked, source: 'Harvard Art Museums' }));
  } catch (e) {
    res.statusCode = 502; res.end(JSON.stringify({ error: 'upstream', detail: String(e.message || e) }));
  }
};
