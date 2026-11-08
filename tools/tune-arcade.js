/* Scan "arcade" settings: more frequent FEATURE triggers with smaller free-spin awards,
   ranked by distance to a target RTP.  usage: node tools/tune-arcade.js [targetRtp=0.965] */
'use strict';
const ZEUS = require('../js/config.js');
const L = require('./rtp-lib.js');
const TARGET = parseFloat(process.argv[2] || '0.965');
const FS = ZEUS.CONFIG.symbolById.FEATURE.freeSpins;
function mk(spec) { return [0, 1, 2, 3, 4].map(i => { const o = {}; Object.keys(spec).forEach(k => { const v = spec[k]; o[k] = Array.isArray(v) ? v[i] : v; }); return o; }); }
const BASE = { ZEUS: 3, PEGASUS: 3, BOAT: 3, HELMET: 3, HARP: 5, VASE: 5, GOLD: 6, SILVER: 6, WREATH: 8, WILD: 1 };
const FREE = { ZEUS: 6, PEGASUS: 4, BOAT: 4, HELMET: 4, HARP: 5, VASE: 5, GOLD: 5, SILVER: 5, WREATH: 6, WILD: [3, 4, 4, 4, 3] };
const FEAT = { classic: [2, 1, 2, 1, 2], a: [2, 2, 2, 2, 2], b: [3, 2, 3, 2, 3], c: [3, 2, 2, 2, 3], d: [3, 3, 3, 3, 3], e: [3, 3, 2, 3, 3] };
const AWARDS = { classic: [10, 25, 100], a: [8, 15, 50], b: [7, 12, 40], c: [6, 10, 30], d: [5, 8, 25], e: [8, 12, 30], f: [6, 12, 50], g: [5, 10, 40] };
const saved = [FS[3], FS[4], FS[5]];
const rows = [];
for (const fk of Object.keys(FEAT)) for (const ak of Object.keys(AWARDS)) for (const ff of [2, 1]) {
  const base = mk(Object.assign({}, BASE, { FEATURE: FEAT[fk] }));
  const free = mk(Object.assign({}, FREE, { FEATURE: ff }));
  const aw = AWARDS[ak]; FS[3] = aw[0]; FS[4] = aw[1]; FS[5] = aw[2];
  const r = L.analyze(base, free);
  rows.push({ name: 'feature ' + FEAT[fk].join('') + '  awards ' + aw.join('/') + '  free-strip FEATURE ' + ff, r });
}
FS[3] = saved[0]; FS[4] = saved[1]; FS[5] = saved[2];
const near = rows.filter(x => x.r.trigEvery >= 30 && x.r.trigEvery <= 60);
near.sort((a, b) => Math.abs(a.r.rtp - TARGET) - Math.abs(b.r.rtp - TARGET));
near.slice(0, 24).forEach(({ name, r }) => console.log(name.padEnd(56), 'trig 1/' + r.trigEvery.toFixed(0), 'base', (r.rtpBase * 100).toFixed(1), 'FS', (r.rtpFS * 100).toFixed(1), 'RTP', (r.rtp * 100).toFixed(2), 'spins/trigger', (r.expFS / r.pTrig).toFixed(1)));
console.log(near.length + ' candidates between 1/30 and 1/60 of ' + rows.length);
