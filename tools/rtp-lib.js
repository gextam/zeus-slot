/* Exact RTP math from symbol counts (independent of strip arrangement, which
   only has to keep FEATURE symbols >= 3 apart so a window holds at most one). */
'use strict';
const ZEUS = require('../js/config.js');
const C = ZEUS.CONFIG;
const IDS = C.symbols.map(s => s.id);

function total(c) { return Object.keys(c).reduce((a, k) => a + c[k], 0); }
function freqs(c) { const len = total(c), f = {}; Object.keys(c).forEach(k => { f[k] = c[k] / len; }); return f; }
function lineEV(countsPerReel) {
  const F = countsPerReel.map(freqs);
  let ev = 0; const line = new Array(5);
  (function rec(r, p) {
    if (r === 5) { const w = ZEUS.evalLine(line); if (w) ev += p * w.pay; return; }
    for (const id of IDS) { const q = F[r][id]; if (!q) continue; line[r] = id; rec(r + 1, p * q); }
  })(0, 1);
  return ev;
}
function scatterDist(countsPerReel) {
  let dist = [1];
  countsPerReel.forEach(c => {
    const p = 3 * (c.FEATURE || 0) / total(c), per = [1 - p, p];
    const next = new Array(dist.length + 1).fill(0);
    dist.forEach((a, i) => per.forEach((b, j) => { next[i + j] += a * b; }));
    dist = next;
  });
  return dist;
}
function fsAward(dist) {
  const fs = C.symbolById.FEATURE.freeSpins; let a = 0;
  for (let k = 3; k < dist.length; k++) a += dist[k] * fs[Math.min(k, 5)];
  return a;
}
function analyze(baseCounts, freeCounts) {
  const evB = lineEV(baseCounts), evF = lineEV(freeCounts);
  const dB = scatterDist(baseCounts), dF = scatterDist(freeCounts);
  const aB = fsAward(dB), aF = fsAward(dF);
  const pTrig = dB.slice(3).reduce((a, b) => a + b, 0);
  const expFS = aB / (1 - aF);
  return { evB, evF, pTrig, trigEvery: 1 / pTrig, aF, expFS, rtpBase: evB, rtpFS: expFS * evF, rtp: evB + expFS * evF, p3: dB[3], p4: dB[4], p5: dB[5], lenB: baseCounts.map(total), lenF: freeCounts.map(total) };
}
module.exports = { total, freqs, lineEV, scatterDist, fsAward, analyze };
