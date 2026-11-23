/* Palette extraction: pixels in, a palette of k colours with shares out.
   Runs in the browser; images never leave the device.
   1. Bucket pixels (5 bits per channel) so a 200 px image becomes a few thousand colours.
   2. Convert each bucket to CIELAB and weight it by pixel count, boosted for vivid colours
      so small accents survive.
   3. Weighted k-means in Lab with a few spare clusters, then merge the closest pairs down to k.
   4. Shares come from real pixel counts (not the boosted weights); largest first. */
(function (root) {
  const lin = v => (v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  const f = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  function lab(r, g, b) {
    const R = lin(r), G = lin(g), B = lin(b);
    const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, Y = R * 0.2126 + G * 0.7152 + B * 0.0722, Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
  }
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  const hex = (r, g, b) => '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase();

  function extract(data, w, h, opt = {}) {
    const k = Math.max(1, opt.k || 6), c = opt.crop;
    const x0 = c ? Math.max(0, Math.floor(c.x0)) : 0, x1 = c ? Math.min(w, Math.ceil(c.x1)) : w;
    const y0 = c ? Math.max(0, Math.floor(c.y0)) : 0, y1 = c ? Math.min(h, Math.ceil(c.y1)) : h;
    const buckets = new Map();
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const p = (y * w + x) * 4;
      if (data[p + 3] < 128) continue;
      const r = data[p], g = data[p + 1], b = data[p + 2], key = (r >> 3) << 10 | (g >> 3) << 5 | (b >> 3);
      let e = buckets.get(key);
      if (!e) buckets.set(key, e = { n: 0, r: 0, g: 0, b: 0 });
      e.n++; e.r += r; e.g += g; e.b += b;
    }
    let items = [];
    for (const e of buckets.values()) {
      const r = e.r / e.n, g = e.g / e.n, b = e.b / e.n, L = lab(r, g, b), C = Math.hypot(L[1], L[2]);
      if (opt.ignoreExtremes && ((L[0] > 93 && C < 8) || L[0] < 9)) continue;
      items.push({ n: e.n, r, g, b, L, w: e.n * (1 + Math.min(C, 80) / 25) });
    }
    if (!items.length) return [];
    const total = items.reduce((s, it) => s + it.n, 0);

    // deterministic seeding: heaviest colour first, then the colour that is heaviest x furthest from all seeds
    const K = Math.min(k + 4, items.length);
    const seeds = [items.reduce((a, b) => b.w > a.w ? b : a).L.slice()];
    const minD = items.map(it => d2(it.L, seeds[0]));
    while (seeds.length < K) {
      let best = -1, bi = 0;
      items.forEach((it, i) => { const s = it.w * minD[i]; if (s > best) { best = s; bi = i } });
      if (best <= 0) break;
      seeds.push(items[bi].L.slice());
      items.forEach((it, i) => { minD[i] = Math.min(minD[i], d2(it.L, seeds[seeds.length - 1])) });
    }
    let cl = seeds.map(L => ({ L }));
    for (let iter = 0; iter < 14; iter++) {
      const acc = cl.map(() => ({ w: 0, l: 0, a: 0, b: 0 }));
      for (const it of items) {
        let bi = 0, bd = Infinity;
        cl.forEach((q, i) => { const d = d2(it.L, q.L); if (d < bd) { bd = d; bi = i } });
        it.c = bi; const A = acc[bi]; A.w += it.w; A.l += it.L[0] * it.w; A.a += it.L[1] * it.w; A.b += it.L[2] * it.w;
      }
      cl = acc.map((A, i) => A.w ? { L: [A.l / A.w, A.a / A.w, A.b / A.w] } : cl[i]);
    }
    // gather clusters with real counts and mean colour
    let groups = cl.map(q => ({ L: q.L, w: 0, n: 0, r: 0, g: 0, b: 0 }));
    for (const it of items) { const G = groups[it.c]; G.w += it.w; G.n += it.n; G.r += it.r * it.n; G.g += it.g * it.n; G.b += it.b * it.n }
    groups = groups.filter(G => G.n);
    // similar colours (ΔE < 10) average; distinct ones keep the heavier colour, so two accents never blend into a colour that isn't in the image
    const merge = (A, B) => {
      if (d2(A.L, B.L) < 100) return { L: [0, 1, 2].map(j => (A.L[j] * A.w + B.L[j] * B.w) / (A.w + B.w)), w: A.w + B.w, n: A.n + B.n, r: A.r + B.r, g: A.g + B.g, b: A.b + B.b };
      const [H, Lo] = A.w >= B.w ? [A, B] : [B, A], s = (H.n + Lo.n) / H.n;
      return { L: H.L, w: H.w + Lo.w, n: H.n + Lo.n, r: H.r * s, g: H.g * s, b: H.b * s };
    };
    for (;;) {
      if (groups.length <= 1) break;
      let bi = 0, bj = 1, bd = Infinity;
      // Ward cost: distance x size, so slivers (edge blends, noise) fold in before two large distinct areas do
      let near = Infinity;
      for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
        const A = groups[i], B = groups[j], d = d2(A.L, B.L), cost = d * A.w * B.w / (A.w + B.w);
        near = Math.min(near, d);
        if (groups.length > k ? cost < bd : d < 16 && cost < bd) { bd = cost; bi = i; bj = j }
      }
      // merge down to k; below k, still merge colours that are near-identical (ΔE < 4)
      if (groups.length <= k && near >= 16) break;
      groups[bi] = merge(groups[bi], groups[bj]); groups.splice(bj, 1);
    }
    return groups
      .map(G => { const r = G.r / G.n, g = G.g / G.n, b = G.b / G.n; return { hex: hex(r, g, b), pct: 100 * G.n / total, lab: lab(r, g, b) } })
      .sort((a, b) => b.pct - a.pct);
  }

  // average colour of a small square around (x, y)
  function pick(data, w, h, x, y, rad = 1) {
    let n = 0, r = 0, g = 0, b = 0;
    for (let j = Math.max(0, y - rad); j <= Math.min(h - 1, y + rad); j++) for (let i = Math.max(0, x - rad); i <= Math.min(w - 1, x + rad); i++) {
      const p = (j * w + i) * 4; r += data[p]; g += data[p + 1]; b += data[p + 2]; n++;
    }
    return n ? hex(r / n, g / n, b / n) : null;
  }

  const api = { extract, pick, lab };
  if (typeof module !== 'undefined') module.exports = api; else root.Extract = api;
})(this);
