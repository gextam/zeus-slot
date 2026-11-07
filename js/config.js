/* ============================================================================
   ZEUS — game configuration: symbols, paytable, paylines, reel strips.
   Shared by the browser game (window.ZEUS) and the node RTP tool (module.exports).
   Pays are in multiples of the LINE bet, matching the WMS Zeus paytable:
     Zeus 500/200/50/4, Pegasus 400/150/40, Boat 350/100/30, Helmet 350/100/30,
     Harp 250/100/20, Vase 250/100/20, Gold 200/75/15, Silver 200/75/15,
     Wreath 150/50/5.  Feature: 3 = 10, 4 = 25, 5 = 100 free spins.
   ========================================================================== */
(function (root) {
  'use strict';
  const ZEUS = root.ZEUS || (root.ZEUS = {});

  const SYMBOLS = [
    { id: 'ZEUS',    name: 'Zeus',          pays: { 5: 500, 4: 200, 3: 50, 2: 4 }, file: 'zeus' },
    { id: 'PEGASUS', name: 'Pegasus',       pays: { 5: 400, 4: 150, 3: 40 },       file: 'pegasus' },
    { id: 'BOAT',    name: 'Warship',       pays: { 5: 350, 4: 100, 3: 30 },       file: 'boat' },
    { id: 'HELMET',  name: 'Helmet',        pays: { 5: 350, 4: 100, 3: 30 },       file: 'helmet' },
    { id: 'HARP',    name: 'Harp',          pays: { 5: 250, 4: 100, 3: 20 },       file: 'harp' },
    { id: 'VASE',    name: 'Vase',          pays: { 5: 250, 4: 100, 3: 20 },       file: 'vase' },
    { id: 'GOLD',    name: 'Gold Coin',     pays: { 5: 200, 4: 75,  3: 15 },       file: 'gold' },
    { id: 'SILVER',  name: 'Silver Coin',   pays: { 5: 200, 4: 75,  3: 15 },       file: 'silver' },
    { id: 'WREATH',  name: 'Laurel Wreath', pays: { 5: 150, 4: 50,  3: 5 },        file: 'wreath' },
    { id: 'WILD',    name: 'Wild',          wild: true,                            file: 'wild' },
    { id: 'FEATURE', name: 'Feature',       scatter: true, freeSpins: { 3: 10, 4: 25, 5: 100 }, file: 'feature' }
  ];
  const SYMBOL_BY_ID = {};
  SYMBOLS.forEach(s => { SYMBOL_BY_ID[s.id] = s; });
  const PAYING_IDS = SYMBOLS.filter(s => s.pays).map(s => s.id);

  /* 30 paylines, rows per reel (0 = top, 1 = middle, 2 = bottom) */
  const PAYLINES = [
    [1,1,1,1,1],[0,0,0,0,0],[2,2,2,2,2],[0,1,2,1,0],[2,1,0,1,2],
    [1,0,0,0,1],[1,2,2,2,1],[0,0,1,2,2],[2,2,1,0,0],[1,0,1,2,1],
    [1,2,1,0,1],[0,1,1,1,0],[2,1,1,1,2],[0,1,0,1,0],[2,1,2,1,2],
    [1,1,0,1,1],[1,1,2,1,1],[0,0,2,0,0],[2,2,0,2,2],[0,2,2,2,0],
    [2,0,0,0,2],[1,0,2,0,1],[1,2,0,2,1],[0,2,0,2,0],[2,0,2,0,2],
    [0,0,1,0,0],[2,2,1,2,2],[0,1,2,2,2],[2,1,0,0,0],[1,2,2,1,0]
  ];

  /* ---------- deterministic PRNG for strip layout (mulberry32) ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rnd) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /* Build one reel strip from symbol counts. Stacked symbols are placed as
     contiguous units; the layout is rejected until no run exceeds its stack
     size and FEATURE symbols are spaced at least `gap` apart (circular). */
  function buildStrip(counts, seed, opts) {
    opts = opts || {};
    const stacks = opts.stacks || {};
    const gap = opts.scatterGap || 6;
    const rnd = mulberry32(seed);
    const units = [];
    Object.keys(counts).forEach(sym => {
      let remaining = counts[sym];
      const st = stacks[sym] || 1;
      while (remaining > 0) {
        const size = Math.min(st, remaining);
        units.push({ sym: sym, size: size });
        remaining -= size;
      }
    });
    let last = null;
    for (let attempt = 0; attempt < 4000; attempt++) {
      const u = shuffle(units.slice(), rnd);
      const strip = [];
      u.forEach(x => { for (let i = 0; i < x.size; i++) strip.push(x.sym); });
      last = strip;
      if (validStrip(strip, stacks, gap)) return strip;
    }
    return last;
  }
  function validStrip(strip, stacks, gap) {
    const n = strip.length;
    let start = 0;
    for (let k = 0; k < n; k++) { if (strip[k] !== strip[(k - 1 + n) % n]) { start = k; break; } }
    let i = start, seen = 0;
    while (seen < n) {
      const sym = strip[i];
      let run = 0;
      while (run < n && strip[(i + run) % n] === sym) run++;
      if (run > (stacks[sym] || 1)) return false;
      i = (i + run) % n; seen += run;
    }
    const sc = [];
    for (let k = 0; k < n; k++) if (strip[k] === 'FEATURE') sc.push(k);
    for (let a = 0; a < sc.length; a++) for (let b = a + 1; b < sc.length; b++) {
      const d = Math.abs(sc[a] - sc[b]);
      if (Math.min(d, n - d) < gap) return false;
    }
    return true;
  }

  /* ---------- reel strip definitions (symbol counts per reel) ---------- */
  /* Tuned with tools/tune2.js + tools/rtp-sim.js: exact RTP 95.96%
     (base game 69.1% + free spins 26.9%), feature triggers about 1 in 101 spins. */
  const BASE_COUNTS = [
    { ZEUS: 3, PEGASUS: 3, BOAT: 3, HELMET: 3, HARP: 5, VASE: 5, GOLD: 6, SILVER: 6, WREATH: 8, WILD: 1, FEATURE: 2 },
    { ZEUS: 3, PEGASUS: 3, BOAT: 3, HELMET: 3, HARP: 5, VASE: 5, GOLD: 6, SILVER: 6, WREATH: 8, WILD: 1, FEATURE: 1 },
    { ZEUS: 3, PEGASUS: 3, BOAT: 3, HELMET: 3, HARP: 5, VASE: 5, GOLD: 6, SILVER: 6, WREATH: 8, WILD: 1, FEATURE: 2 },
    { ZEUS: 3, PEGASUS: 3, BOAT: 3, HELMET: 3, HARP: 5, VASE: 5, GOLD: 6, SILVER: 6, WREATH: 8, WILD: 1, FEATURE: 1 },
    { ZEUS: 3, PEGASUS: 3, BOAT: 3, HELMET: 3, HARP: 5, VASE: 5, GOLD: 6, SILVER: 6, WREATH: 8, WILD: 1, FEATURE: 2 }
  ];
  const BASE_STACKS = { ZEUS: 3, WILD: 1 };

  const FREE_COUNTS = [
    { ZEUS: 6, PEGASUS: 4, BOAT: 4, HELMET: 4, HARP: 5, VASE: 5, GOLD: 5, SILVER: 5, WREATH: 6, WILD: 3, FEATURE: 2 },
    { ZEUS: 6, PEGASUS: 4, BOAT: 4, HELMET: 4, HARP: 5, VASE: 5, GOLD: 5, SILVER: 5, WREATH: 6, WILD: 4, FEATURE: 2 },
    { ZEUS: 6, PEGASUS: 4, BOAT: 4, HELMET: 4, HARP: 5, VASE: 5, GOLD: 5, SILVER: 5, WREATH: 6, WILD: 4, FEATURE: 2 },
    { ZEUS: 6, PEGASUS: 4, BOAT: 4, HELMET: 4, HARP: 5, VASE: 5, GOLD: 5, SILVER: 5, WREATH: 6, WILD: 4, FEATURE: 2 },
    { ZEUS: 6, PEGASUS: 4, BOAT: 4, HELMET: 4, HARP: 5, VASE: 5, GOLD: 5, SILVER: 5, WREATH: 6, WILD: 3, FEATURE: 2 }
  ];
  const FREE_STACKS = { ZEUS: 3, WILD: 3 };

  function buildStrips() {
    return {
      base: BASE_COUNTS.map((c, i) => buildStrip(c, 1001 + i * 17, { stacks: BASE_STACKS, scatterGap: 6 })),
      free: FREE_COUNTS.map((c, i) => buildStrip(c, 2001 + i * 23, { stacks: FREE_STACKS, scatterGap: 6 }))
    };
  }

  /* ---------- win evaluation (shared with the RTP tool) ---------- */
  function evalLine(syms) {
    let best = null;
    for (let c = 0; c < PAYING_IDS.length; c++) {
      const id = PAYING_IDS[c];
      let n = 0;
      while (n < syms.length && (syms[n] === id || syms[n] === 'WILD')) n++;
      const pay = SYMBOL_BY_ID[id].pays[n];
      if (pay && (!best || pay > best.pay)) best = { sym: id, count: n, pay: pay };
    }
    return best;
  }

  /* grid[reel][row] -> { lineWins:[{line, rows, sym, count, pay}], scatters:[{reel,row}], freeSpins } */
  function evalSpin(grid, linesPlayed) {
    const lineWins = [];
    for (let l = 0; l < linesPlayed; l++) {
      const rows = PAYLINES[l];
      const syms = rows.map((row, r) => grid[r][row]);
      const w = evalLine(syms);
      if (w) lineWins.push({ line: l, rows: rows, sym: w.sym, count: w.count, pay: w.pay });
    }
    const scatters = [];
    for (let r = 0; r < grid.length; r++) for (let row = 0; row < grid[r].length; row++) {
      if (grid[r][row] === 'FEATURE') scatters.push({ reel: r, row: row });
    }
    const fs = SYMBOL_BY_ID.FEATURE.freeSpins[Math.min(scatters.length, 5)] || 0;
    return { lineWins: lineWins, scatters: scatters, freeSpins: scatters.length >= 3 ? fs : 0 };
  }

  /* Window for a stop index S: rows top..bottom = strip[S+1], strip[S], strip[S-1] */
  function windowAt(strip, S, rows) {
    rows = rows || 3;
    const n = strip.length;
    const out = [];
    const half = (rows - 1) / 2;
    for (let row = 0; row < rows; row++) {
      const k = S + half - row;
      out.push(strip[((k % n) + n) % n]);
    }
    return out;
  }

  ZEUS.CONFIG = {
    title: 'ZEUS',
    reels: 5,
    rows: 3,
    maxLines: 30,
    lineOptions: [1, 5, 10, 15, 20, 25, 30],
    betOptions: [1, 2, 3, 5, 10, 20],
    startCredits: 10000,
    symbols: SYMBOLS,
    symbolById: SYMBOL_BY_ID,
    payingIds: PAYING_IDS,
    paylines: PAYLINES,
    rules: [
      'All wins pay left to right on adjacent reels beginning with the leftmost reel, except FEATURE.',
      'WILD is wild for all symbols except FEATURE.',
      'FEATURE symbols pay in any position. 3 = 10 FREE SPINS, 4 = 25 FREE SPINS, 5 = 100 FREE SPINS.',
      'Free spins are played at the lines and bet of the triggering game.',
      '3 or more FEATURE symbols during free spins award additional free spins.',
      'Only the highest win is paid per line. Line wins are multiplied by the line bet.',
      'Coinciding wins on different lines are added. Malfunction voids all pays and plays.'
    ]
  };
  ZEUS.RTP = '95.96';
  ZEUS.buildStrips = buildStrips;
  ZEUS.buildStrip = buildStrip;
  ZEUS.evalLine = evalLine;
  ZEUS.evalSpin = evalSpin;
  ZEUS.windowAt = windowAt;
  ZEUS.mulberry32 = mulberry32;

  if (typeof module !== 'undefined' && module.exports) module.exports = ZEUS;
})(typeof window !== 'undefined' ? window : globalThis);
