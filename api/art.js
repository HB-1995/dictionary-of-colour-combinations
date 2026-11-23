/* Seen in art: finds Harvard Art Museums works whose colours match a palette.
   GET /api/art?c=HEX,HEX,...&type=Paintings|Prints|Drawings|Textile Arts|Photographs|all&n=12
   The Harvard key stays here (HARVARD_ART_MUSEUMS_API env var). Responses are cached by Vercel for up to 14 days,
   within Harvard's terms (non-commercial, cache < 2 weeks, link back, images from returned URLs). */
const M = require('../mix.js')({ LATENT_SIZE: 7 });
const CSS = {"aliceblue":"#F0F8FF","antiquewhite":"#FAEBD7","aqua":"#00FFFF","aquamarine":"#7FFFD4","azure":"#F0FFFF","beige":"#F5F5DC","bisque":"#FFE4C4","black":"#000000","blanchedalmond":"#FFEBCD","blue":"#0000FF","blueviolet":"#8A2BE2","brown":"#A52A2A","burlywood":"#DEB887","cadetblue":"#5F9EA0","chartreuse":"#7FFF00","chocolate":"#D2691E","coral":"#FF7F50","cornflowerblue":"#6495ED","cornsilk":"#FFF8DC","crimson":"#DC143C","cyan":"#00FFFF","darkblue":"#00008B","darkcyan":"#008B8B","darkgoldenrod":"#B8860B","darkgray":"#A9A9A9","darkgreen":"#006400","darkgrey":"#A9A9A9","darkkhaki":"#BDB76B","darkmagenta":"#8B008B","darkolivegreen":"#556B2F","darkorange":"#FF8C00","darkorchid":"#9932CC","darkred":"#8B0000","darksalmon":"#E9967A","darkseagreen":"#8FBC8F","darkslateblue":"#483D8B","darkslategray":"#2F4F4F","darkslategrey":"#2F4F4F","darkturquoise":"#00CED1","darkviolet":"#9400D3","deeppink":"#FF1493","deepskyblue":"#00BFFF","dimgray":"#696969","dimgrey":"#696969","dodgerblue":"#1E90FF","firebrick":"#B22222","floralwhite":"#FFFAF0","forestgreen":"#228B22","fuchsia":"#FF00FF","gainsboro":"#DCDCDC","ghostwhite":"#F8F8FF","gold":"#FFD700","goldenrod":"#DAA520","gray":"#808080","green":"#008000","greenyellow":"#ADFF2F","grey":"#808080","honeydew":"#F0FFF0","hotpink":"#FF69B4","indianred":"#CD5C5C","indigo":"#4B0082","ivory":"#FFFFF0","khaki":"#F0E68C","lavender":"#E6E6FA","lavenderblush":"#FFF0F5","lawngreen":"#7CFC00","lemonchiffon":"#FFFACD","lightblue":"#ADD8E6","lightcoral":"#F08080","lightcyan":"#E0FFFF","lightgoldenrodyellow":"#FAFAD2","lightgray":"#D3D3D3","lightgreen":"#90EE90","lightgrey":"#D3D3D3","lightpink":"#FFB6C1","lightsalmon":"#FFA07A","lightseagreen":"#20B2AA","lightskyblue":"#87CEFA","lightslategray":"#778899","lightslategrey":"#778899","lightsteelblue":"#B0C4DE","lightyellow":"#FFFFE0","lime":"#00FF00","limegreen":"#32CD32","linen":"#FAF0E6","magenta":"#FF00FF","maroon":"#800000","mediumaquamarine":"#66CDAA","mediumblue":"#0000CD","mediumorchid":"#BA55D3","mediumpurple":"#9370DB","mediumseagreen":"#3CB371","mediumslateblue":"#7B68EE","mediumspringgreen":"#00FA9A","mediumturquoise":"#48D1CC","mediumvioletred":"#C71585","midnightblue":"#191970","mintcream":"#F5FFFA","mistyrose":"#FFE4E1","moccasin":"#FFE4B5","navajowhite":"#FFDEAD","navy":"#000080","oldlace":"#FDF5E6","olive":"#808000","olivedrab":"#6B8E23","orange":"#FFA500","orangered":"#FF4500","orchid":"#DA70D6","palegoldenrod":"#EEE8AA","palegreen":"#98FB98","paleturquoise":"#AFEEEE","palevioletred":"#DB7093","papayawhip":"#FFEFD5","peachpuff":"#FFDAB9","peru":"#CD853F","pink":"#FFC0CB","plum":"#DDA0DD","powderblue":"#B0E0E6","purple":"#800080","rebeccapurple":"#663399","red":"#FF0000","rosybrown":"#BC8F8F","royalblue":"#4169E1","saddlebrown":"#8B4513","salmon":"#FA8072","sandybrown":"#F4A460","seagreen":"#2E8B57","seashell":"#FFF5EE","sienna":"#A0522D","silver":"#C0C0C0","skyblue":"#87CEEB","slateblue":"#6A5ACD","slategray":"#708090","slategrey":"#708090","snow":"#FFFAFA","springgreen":"#00FF7F","steelblue":"#4682B4","tan":"#D2B48C","teal":"#008080","thistle":"#D8BFD8","tomato":"#FF6347","turquoise":"#40E0D0","violet":"#EE82EE","wheat":"#F5DEB3","white":"#FFFFFF","whitesmoke":"#F5F5F5","yellow":"#FFFF00","yellowgreen":"#9ACD32"};
const CSS_LIST = Object.entries(CSS).map(([name, hex]) => ({ name, hex, lab: M.lab(M.rgbOf(hex)) }));
const BASE = 'https://api.harvardartmuseums.org/object';
const TYPES = ['Paintings', 'Prints', 'Drawings', 'Textile Arts', 'Photographs'];
const FIELDS = 'id,title,people,dated,url,primaryimageurl,colors,classification,imagepermissionlevel';

const labOf = h => M.lab(M.rgbOf(h));
const chroma = l => Math.hypot(l[1], l[2]);
const snap = lab => CSS_LIST.reduce((b, c) => { const d = M.de2000(lab, c.lab); return d < b.d ? { c, d } : b }, { d: 1e9 }).c;

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
  if (q.debug === '1') {                                  // temporary: which colour query form does Harvard accept?
    const tries = { plain: {}, colorHash: { color: '#a0522d' }, colorBare: { color: 'a0522d' }, colorSpectrum: { color: '#af4b4b' }, qCss3: { q: 'colors.css3:"#a0522d"' }, qHue: { q: 'colors.hue:Red' }, qColor: { q: 'colors.color:"#a0522d"' } };
    const out = {};
    for (const [k, p] of Object.entries(tries)) {
      try { const u = new URL(BASE); Object.entries({ apikey: key, hasimage: 1, size: 1, fields: 'id,colors', ...p }).forEach(([a, b]) => u.searchParams.set(a, b));
        const r = await fetch(u); const j = await r.json(); out[k] = { status: r.status, total: j.info && j.info.totalrecords, sample: j.records && j.records[0] && (j.records[0].colors || []).slice(0, 3) };
      } catch (e) { out[k] = String(e) }
    }
    res.setHeader('Cache-Control', 'no-store'); return res.end(JSON.stringify(out));
  }
  const hexes = String(q.c || '').split(',').map(h => h.trim().replace(/^#?/, '#').toUpperCase()).filter(h => /^#[0-9A-F]{6}$/.test(h)).slice(0, 12);
  if (!hexes.length) { res.statusCode = 400; return res.end(JSON.stringify({ error: 'no-colours' })) }
  const type = TYPES.includes(q.type) ? q.type : (q.type === 'all' ? 'all' : 'Paintings');
  const n = Math.max(1, Math.min(24, +q.n || 12));
  const pal = hexes.map(h => ({ hex: h, lab: labOf(h) }));
  try {
    const snapped = [...new Set(pal.map(p => snap(p.lab).hex))];
    const common = { apikey: key, hasimage: 1, size: 60, fields: FIELDS, q: 'imagepermissionlevel:0' };
    if (type !== 'all') common.classification = type;
    const pools = await Promise.all(snapped.map(async h => {
      let recs = await harvard({ ...common, color: h.toLowerCase() });
      if (!recs.length) recs = await harvard({ ...common, q: `imagepermissionlevel:0 AND colors.css3:"${h.toLowerCase()}"` });
      return recs;
    }));
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
