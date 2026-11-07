/* Second pass: combine base/free candidates and rank by distance to 95.97% RTP. */
'use strict';
const L = require('./rtp-lib.js');
const TARGET = 0.9597;
function mk(spec) { // spec values may be a number or a per-reel array
  return [0, 1, 2, 3, 4].map(i => { const o = {}; Object.keys(spec).forEach(k => { const v = spec[k]; o[k] = Array.isArray(v) ? v[i] : v; }); return o; });
}
const BASES = {
  B1: mk({ ZEUS: 3, PEGASUS: 3, BOAT: 4, HELMET: 4, HARP: 5, VASE: 5, GOLD: 6, SILVER: 6, WREATH: 8, WILD: 1, FEATURE: [2, 1, 2, 1, 2] }),
  B2: mk({ ZEUS: 3, PEGASUS: 3, BOAT: 4, HELMET: 4, HARP: 5, VASE: 5, GOLD: 6, SILVER: 6, WREATH: 8, WILD: 1, FEATURE: [2, 2, 1, 2, 2] }),
  B3: mk({ ZEUS: 3, PEGASUS: 3, BOAT: 4, HELMET: 4, HARP: 5, VASE: 5, GOLD: 6, SILVER: 6, WREATH: 9, WILD: [1, 1, 2, 1, 1], FEATURE: [2, 1, 2, 1, 2] }),
  B4: mk({ ZEUS: 3, PEGASUS: 3, BOAT: 4, HELMET: 4, HARP: 5, VASE: 5, GOLD: 7, SILVER: 7, WREATH: 9, WILD: 1, FEATURE: [2, 1, 2, 1, 2] }),
  B5: mk({ ZEUS: 3, PEGASUS: 3, BOAT: 4, HELMET: 4, HARP: 6, VASE: 6, GOLD: 6, SILVER: 6, WREATH: 8, WILD: 1, FEATURE: [2, 1, 2, 1, 2] }),
  B6: mk({ ZEUS: 3, PEGASUS: 4, BOAT: 4, HELMET: 4, HARP: 5, VASE: 5, GOLD: 6, SILVER: 6, WREATH: 8, WILD: 1, FEATURE: [2, 1, 2, 1, 2] }),
  B7: mk({ ZEUS: 3, PEGASUS: 3, BOAT: 4, HELMET: 4, HARP: 5, VASE: 5, GOLD: 6, SILVER: 6, WREATH: 8, WILD: 1, FEATURE: [2, 1, 1, 1, 2] }),
  B8: mk({ ZEUS: 3, PEGASUS: 3, BOAT: 3, HELMET: 3, HARP: 5, VASE: 5, GOLD: 6, SILVER: 6, WREATH: 8, WILD: 1, FEATURE: [2, 1, 2, 1, 2] }),
  B9: mk({ ZEUS: 3, PEGASUS: 3, BOAT: 4, HELMET: 4, HARP: 5, VASE: 5, GOLD: 6, SILVER: 6, WREATH: 8, WILD: [0, 1, 1, 1, 0], FEATURE: [2, 1, 2, 1, 2] })
};
const FREES = {
  F1: mk({ ZEUS: 6, PEGASUS: 4, BOAT: 4, HELMET: 4, HARP: 5, VASE: 5, GOLD: 5, SILVER: 5, WREATH: 6, WILD: 4, FEATURE: 2 }),
  F2: mk({ ZEUS: 6, PEGASUS: 4, BOAT: 4, HELMET: 4, HARP: 5, VASE: 5, GOLD: 5, SILVER: 5, WREATH: 6, WILD: [3, 4, 4, 4, 3], FEATURE: 2 }),
  F3: mk({ ZEUS: 6, PEGASUS: 4, BOAT: 4, HELMET: 4, HARP: 5, VASE: 5, GOLD: 5, SILVER: 5, WREATH: 6, WILD: 4, FEATURE: [2, 1, 2, 1, 2] }),
  F4: mk({ ZEUS: 6, PEGASUS: 4, BOAT: 4, HELMET: 4, HARP: 6, VASE: 6, GOLD: 6, SILVER: 6, WREATH: 6, WILD: [3, 5, 5, 5, 3], FEATURE: 2 }),
  F5: mk({ ZEUS: 6, PEGASUS: 4, BOAT: 4, HELMET: 4, HARP: 5, VASE: 5, GOLD: 5, SILVER: 5, WREATH: 6, WILD: [3, 4, 4, 4, 3], FEATURE: [2, 1, 2, 1, 2] }),
  F6: mk({ ZEUS: 6, PEGASUS: 4, BOAT: 4, HELMET: 4, HARP: 5, VASE: 5, GOLD: 5, SILVER: 5, WREATH: 7, WILD: [3, 5, 5, 5, 3], FEATURE: [2, 1, 2, 1, 2] })
};
const rows = [];
Object.keys(BASES).forEach(b => Object.keys(FREES).forEach(f => {
  const r = L.analyze(BASES[b], FREES[f]);
  rows.push({ b, f, r });
}));
rows.sort((x, y) => Math.abs(x.r.rtp - TARGET) - Math.abs(y.r.rtp - TARGET));
rows.slice(0, 18).forEach(({ b, f, r }) => console.log(b, f, 'evB', r.evB.toFixed(3), 'trig 1/' + r.trigEvery.toFixed(0), 'evF', r.evF.toFixed(3), 'aF', r.aF.toFixed(3),
  'expFS', r.expFS.toFixed(3), 'base%', (r.rtpBase * 100).toFixed(1), 'FS%', (r.rtpFS * 100).toFixed(1), 'RTP', (r.rtp * 100).toFixed(2)));
console.log('\nbase only:');
Object.keys(BASES).forEach(b => { const r = L.analyze(BASES[b], FREES.F1); console.log(b, 'len', r.lenB.join('/'), 'evB', r.evB.toFixed(3), 'trig 1/' + r.trigEvery.toFixed(0), 'P3', r.p3.toFixed(4), 'P4', r.p4.toFixed(5), 'P5', (r.p5 || 0).toExponential(2)); });
