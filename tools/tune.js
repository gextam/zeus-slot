/* Scan symbol-count tables to hit the target RTP. usage: node tools/tune.js */
'use strict';
const L = require('./rtp-lib.js');
const rep = o => [0, 1, 2, 3, 4].map(() => Object.assign({}, o));
function show(name, base, free) {
  const r = L.analyze(base, free);
  console.log(name.padEnd(30), 'len', r.lenB[0] + '/' + r.lenF[0], 'evB', r.evB.toFixed(3), 'trig 1/' + r.trigEvery.toFixed(0),
    'evF', r.evF.toFixed(3), 'aF', r.aF.toFixed(3), 'FS%', (r.rtpFS * 100).toFixed(1), 'RTP', (r.rtp * 100).toFixed(2));
  return r;
}
console.log('--- base reel scan (free fixed) ---');
const free0 = rep({ ZEUS: 6, PEGASUS: 4, BOAT: 4, HELMET: 4, HARP: 5, VASE: 5, GOLD: 5, SILVER: 5, WREATH: 6, WILD: 4, FEATURE: 2 });
for (const wild of [1, 2]) for (const extra of [0, 4, 8, 12, 16, 20]) {
  const base = rep({ ZEUS: 3, PEGASUS: 3, BOAT: 4, HELMET: 4, HARP: 5, VASE: 5, GOLD: 6 + Math.floor(extra / 4), SILVER: 6 + Math.floor(extra / 4), WREATH: 8 + extra - 2 * Math.floor(extra / 4), WILD: wild, FEATURE: 2 });
  show('base wild' + wild + ' extra' + extra, base, free0);
}
console.log('--- free reel scan (base fixed) ---');
const base0 = rep({ ZEUS: 3, PEGASUS: 3, BOAT: 4, HELMET: 4, HARP: 5, VASE: 5, GOLD: 8, SILVER: 8, WREATH: 12, WILD: 1, FEATURE: 2 });
for (const wild of [3, 4, 6]) for (const low of [5, 7, 9]) {
  const free = rep({ ZEUS: 6, PEGASUS: 4, BOAT: 4, HELMET: 4, HARP: low, VASE: low, GOLD: low, SILVER: low, WREATH: low + 1, WILD: wild, FEATURE: 2 });
  show('free wild' + wild + ' low' + low, base0, free);
}
