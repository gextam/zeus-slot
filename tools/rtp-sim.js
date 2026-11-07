/* Exact RTP calculator + Monte-Carlo hit-rate check for the Zeus reel strips.
   usage: node tools/rtp-sim.js [mcSpins] [--strips] */
'use strict';
const ZEUS = require('../js/config.js');
const C = ZEUS.CONFIG;
const strips = ZEUS.buildStrips();
const IDS = C.symbols.map(s => s.id);

function freqs(strip) {
  const f = {};
  strip.forEach(s => { f[s] = (f[s] || 0) + 1; });
  Object.keys(f).forEach(k => { f[k] /= strip.length; });
  return f;
}
/* exact expected line pay (per line bet) given independent reels */
function lineEV(set) {
  const F = set.map(freqs);
  let ev = 0;
  const line = new Array(5);
  (function rec(r, p) {
    if (r === 5) { const w = ZEUS.evalLine(line); if (w) ev += p * w.pay; return; }
    for (const id of IDS) { const q = F[r][id]; if (!q) continue; line[r] = id; rec(r + 1, p * q); }
  })(0, 1);
  return ev;
}
/* exact distribution of total FEATURE count in the 5x3 window */
function scatterDist(set) {
  let dist = [1];
  set.forEach(strip => {
    const n = strip.length, per = [0, 0, 0, 0];
    for (let S = 0; S < n; S++) {
      const w = ZEUS.windowAt(strip, S, 3);
      per[w.filter(x => x === 'FEATURE').length]++;
    }
    per.forEach((v, i) => { per[i] = v / n; });
    const next = new Array(dist.length + 3).fill(0);
    dist.forEach((p, i) => per.forEach((q, j) => { next[i + j] += p * q; }));
    dist = next;
  });
  return dist;
}
function fsAward(dist) {
  const fs = C.symbolById.FEATURE.freeSpins;
  let a = 0;
  for (let k = 3; k < dist.length; k++) a += (dist[k] || 0) * fs[Math.min(k, 5)];
  return a;
}
const evB = lineEV(strips.base), evF = lineEV(strips.free);
const dB = scatterDist(strips.base), dF = scatterDist(strips.free);
const aB = fsAward(dB), aF = fsAward(dF);
const pTrig = dB.slice(3).reduce((a, b) => a + b, 0);
const expFS = aB / (1 - aF);
const rtpBase = evB, rtpFS = expFS * evF, rtp = rtpBase + rtpFS;
console.log('strip lengths base:', strips.base.map(s => s.length).join(','), ' free:', strips.free.map(s => s.length).join(','));
console.log('base line EV      : %s', evB.toFixed(4));
console.log('free line EV      : %s', evF.toFixed(4));
console.log('P(trigger)        : %s  (1 in %s spins)', pTrig.toFixed(5), (1 / pTrig).toFixed(0));
console.log('P(3/4/5 scatters) : %s / %s / %s', dB[3].toFixed(5), dB[4].toFixed(6), (dB[5] || 0).toExponential(2));
console.log('retrigger award/FS: %s', aF.toFixed(4));
console.log('expected FS/spin  : %s', expFS.toFixed(4));
console.log('RTP base %s%%  + free spins %s%%  =  %s%%', (rtpBase * 100).toFixed(2), (rtpFS * 100).toFixed(2), (rtp * 100).toFixed(2));

const seen = new Set(C.paylines.map(p => p.join('')));
if (seen.size !== C.paylines.length) console.log('WARNING: duplicate paylines!');

/* Monte Carlo: hit frequency and distribution on 30 lines */
const N = parseInt(process.argv[2] || '300000', 10);
let hits = 0, totalWin = 0, maxWin = 0, bigWins = 0, fsTrig = 0;
const buckets = {};
for (let i = 0; i < N; i++) {
  const grid = strips.base.map(strip => ZEUS.windowAt(strip, Math.floor(Math.random() * strip.length), 3));
  const res = ZEUS.evalSpin(grid, 30);
  const win = res.lineWins.reduce((a, w) => a + w.pay, 0);
  if (win > 0 || res.freeSpins) hits++;
  if (res.freeSpins) fsTrig++;
  totalWin += win;
  if (win > maxWin) maxWin = win;
  const ratio = win / 30;
  if (ratio >= 15) bigWins++;
  const b = ratio === 0 ? '0' : ratio < 1 ? '<1x' : ratio < 2 ? '1-2x' : ratio < 5 ? '2-5x' : ratio < 15 ? '5-15x' : ratio < 50 ? '15-50x' : '50x+';
  buckets[b] = (buckets[b] || 0) + 1;
}
console.log('\nMonte Carlo %d spins @30 lines: hit rate %s%%, base line-RTP %s%%, FS triggers 1 in %s, max win %sx bet, big wins (>=15x) 1 in %s',
  N, (hits / N * 100).toFixed(1), (totalWin / (N * 30) * 100).toFixed(2), (N / Math.max(1, fsTrig)).toFixed(0), (maxWin / 30).toFixed(1), (N / Math.max(1, bigWins)).toFixed(0));
console.log('win buckets (x total bet):', JSON.stringify(buckets));
if (process.argv.includes('--strips')) { console.log('\nBASE'); strips.base.forEach(s => console.log(s.join(' '))); console.log('\nFREE'); strips.free.forEach(s => console.log(s.join(' '))); }
