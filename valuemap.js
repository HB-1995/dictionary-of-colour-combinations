/* Value map: repaint an image using only the colours of a palette, following the image's value structure.
   1. Lightness (CIELAB L*) for every pixel.
   2. Stretch the image's values (between its darks and lights points) to the palette's value range.
   3. Assign a palette colour per pixel: by nearest value, or by share (darkest x% of the image -> darkest colour).
      Palette colours within TIE L* of each other form a group; inside a group the pixel's temperature
      (warm vs cool, on the painter's wheel) picks the colour, then hue.
   4. Clean up: majority filter, then patches below a minimum size merge into their neighbours.
   Pure functions, no DOM: works in the browser and in Node. */
(function (root) {
  const TIE = 8;
  const lin = v => (v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  const f = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  function lab(r, g, b) {
    const R = lin(r), G = lin(g), B = lin(b);
    const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, Y = R * 0.2126 + G * 0.7152 + B * 0.0722, Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
  }
  // painter's (RYB) wheel and temperature, as in the app's Warm -> cool sort: orange warmest, blue coolest, greys near 0
  const A = [[0, 0], [30, 60], [60, 120], [120, 180], [240, 240], [285, 300], [360, 360]];
  function toRyb(h) { h = ((h % 360) + 360) % 360; for (let i = 0; i < A.length - 1; i++) { const a = A[i], b = A[i + 1]; if (h >= a[0] && h <= b[0]) return a[1] + (h - a[0]) / (b[0] - a[0]) * (b[1] - a[1]) } return h }
  function hue(r, g, b) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return 0; let H = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; H *= 60; return H < 0 ? H + 360 : H }
  const warmth = (r, g, b, L) => Math.hypot(L[1], L[2]) * Math.cos((toRyb(hue(r, g, b)) - 60) * Math.PI / 180);
  const rgbOf = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

  function prepare(palette) {
    const P = palette.map((p, i) => { const c = rgbOf(p.hex), L = lab(...c); return { i, hex: p.hex, rgb: c, L, w: warmth(...c, L), share: Math.max(0, +p.share || 0) } })
      .sort((a, b) => a.L[0] - b.L[0]);
    // groups of colours close in value
    let g = 0; P.forEach((p, k) => { if (k && p.L[0] - P[k - 1].L[0] >= TIE) g++; p.g = g });
    return P;
  }

  /* data: RGBA bytes, w x h. palette: [{hex, share?}]. Returns {index: Uint8Array of palette indices (input order), grey: Uint8Array L*,
     counts: per palette colour (input order), range:[lo,hi] of the image}. */
  function map(data, w, h, palette, opt = {}) {
    const n = w * h, P = prepare(palette), mode = opt.mode || 'value', ties = opt.ties !== false, stretch = opt.stretch !== false;
    const Ls = new Float32Array(n), W = new Float32Array(n), AB = new Float32Array(n * 2), grey = new Uint8Array(n);
    const hist = new Uint32Array(101);
    for (let p = 0; p < n; p++) {
      const r = data[p * 4], g = data[p * 4 + 1], b = data[p * 4 + 2], L = lab(r, g, b);
      Ls[p] = L[0]; W[p] = warmth(r, g, b, L); AB[2 * p] = L[1]; AB[2 * p + 1] = L[2];
      const q = Math.max(0, Math.min(100, Math.round(L[0]))); grey[p] = q; hist[q]++;
    }
    // percentile in the image's value distribution
    const cum = new Float32Array(101); let s = 0; for (let i = 0; i <= 100; i++) { s += hist[i]; cum[i] = s / n }
    const pct = q => { for (let i = 0; i <= 100; i++) if (cum[i] >= q) return i; return 100 };
    const darks = (opt.darks || 0) / 100, lights = (opt.lights || 0) / 100;
    const lo = pct(0.01 + darks), hi = Math.max(lo + 1, pct(0.99 - lights));
    const pmin = P[0].L[0], pmax = P[P.length - 1].L[0];
    const toPal = L => stretch ? pmin + Math.max(0, Math.min(1, (L - lo) / (hi - lo))) * (pmax - pmin) : L;

    /* Every pixel and every palette colour gets a position u from 0 (dark) to 1 (light):
       by value: the stretched lightness, scaled to the palette's range; by share: rank in the image vs. the centre of each colour's band.
       The pixel takes the nearest colour by u. If that colour has value neighbours (its tie group), temperature and hue join the cost,
       so they only decide between colours that are close in value for that pixel. */
    const span = Math.max(1e-6, pmax - pmin);
    if (mode === 'share') {
      const tot = P.reduce((a, p) => a + p.share, 0), eq = tot <= 0; let acc = 0;
      P.forEach(p => { const sh = eq ? 1 / P.length : p.share / tot; p.u = acc + sh / 2; acc += sh });
    } else P.forEach(p => { p.u = (p.L[0] - pmin) / span });
    const groups = []; P.forEach(p => (groups[p.g] ??= []).push(p));
    const idx = new Uint8Array(n);
    for (let p = 0; p < n; p++) {
      const q = Math.max(0, Math.min(100, Math.round(Ls[p])));
      const u = mode === 'share' ? cum[q] - hist[q] / (2 * n) : (toPal(Ls[p]) - pmin) / span;
      let c = P[0], bd = Infinity;
      for (const k of P) { const d = Math.abs(k.u - u); if (d < bd) { bd = d; c = k } }
      const g = groups[c.g];
      if (ties && g.length > 1) {
        let bs = Infinity;
        for (const k of g) { const sc = 100 * Math.abs(k.u - u) + 0.1 * Math.abs(W[p] - k.w) + 0.02 * Math.hypot(AB[2 * p] - k.L[1], AB[2 * p + 1] - k.L[2]); if (sc < bs) { bs = sc; c = k } }
      }
      idx[p] = c.i;
    }
    clean(idx, w, h, opt.clean || 0, palette.length);
    const counts = new Array(palette.length).fill(0); for (let p = 0; p < n; p++) counts[idx[p]]++;
    return { index: idx, grey, counts, range: [lo, hi] };
  }

  /* level 0 off, 1 light, 2 medium, 3 bold. Majority filter passes, then merge patches under minSize px into their most common neighbour.
     minSize scales with image area so preview and download look alike. */
  function clean(idx, w, h, level, k) {
    if (!level) return;
    const n = w * h, tmp = new Uint8Array(n), cnt = new Uint16Array(k);
    for (let pass = 0; pass < level; pass++) {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        cnt.fill(0);
        for (let j = Math.max(0, y - 1); j <= Math.min(h - 1, y + 1); j++) for (let i = Math.max(0, x - 1); i <= Math.min(w - 1, x + 1); i++) cnt[idx[j * w + i]]++;
        let b = idx[y * w + x], bc = cnt[b]; for (let c = 0; c < k; c++) if (cnt[c] > bc) { bc = cnt[c]; b = c }
        tmp[y * w + x] = bc >= 5 ? b : idx[y * w + x];
      }
      idx.set(tmp);
    }
    const minSize = Math.round([0, 6, 24, 90][level] * n / 240000);
    if (minSize < 2) return;
    const lab = new Int32Array(n).fill(-1), stack = new Int32Array(n), nb = new Uint32Array(k);
    for (let s = 0; s < n; s++) {
      if (lab[s] >= 0) continue;
      const c = idx[s]; let top = 0, size = 0; stack[top++] = s; lab[s] = s; nb.fill(0);
      const members = [];
      while (top) {
        const p = stack[--top]; members.push(p); size++;
        const x = p % w, y = (p - x) / w;
        const look = q => { if (idx[q] === c) { if (lab[q] < 0) { lab[q] = s; stack[top++] = q } } else nb[idx[q]]++ };
        if (x > 0) look(p - 1); if (x < w - 1) look(p + 1); if (y > 0) look(p - w); if (y < h - 1) look(p + w);
      }
      if (size < minSize) {
        let b = -1, bc = 0; for (let c2 = 0; c2 < k; c2++) if (nb[c2] > bc) { bc = nb[c2]; b = c2 }
        if (b >= 0) for (const p of members) idx[p] = b;
      }
    }
  }

  const api = { map, prepare, lab, TIE };
  if (typeof module !== 'undefined') module.exports = api; else root.ValueMap = api;
})(this);
