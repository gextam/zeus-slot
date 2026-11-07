/* ============================================================================
   ZEUS — game state machine: betting, spin scheduling, anticipation, win
   evaluation & presentation, free spins (trigger, retrigger, summary),
   autoplay and attract mode.
   ========================================================================== */
(function (root) {
  'use strict';
  const ZEUS = root.ZEUS, C = ZEUS.CONFIG, A = ZEUS.audio, FX = ZEUS.fx;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const rng = ZEUS.rng = {
    int: function (n) {
      const c = root.crypto;
      if (c && c.getRandomValues) {
        const max = Math.floor(0x100000000 / n) * n, a = new Uint32Array(1);
        do { c.getRandomValues(a); } while (a[0] >= max);
        return a[0] % n;
      }
      return Math.floor(Math.random() * n);
    }
  };

  function Game() {
    this.strips = ZEUS.buildStrips();
    this.credits = C.startCredits;
    this.linesIdx = C.lineOptions.length - 1;
    this.betIdx = 0;
    this.win = 0; this.winDisplay = 0;
    this.state = 'boot';
    this.message = 'LOADING';
    this.reels = [];
    for (let i = 0; i < C.reels; i++) {
      const r = new ZEUS.Reel(i, this.strips.base[i]);
      r.onLand = rr => this.onReelLand(rr);
      r.onStop = rr => this.onReelStop(rr);
      r.onPass = (rr, v) => { if (v > 4 && (Math.floor(rr.pos) & 1) === 0) A.reelTick(rr.index); };
      this.reels.push(r);
    }
    this.fs = { active: false, left: 0, played: 0, total: 0, win: 0 };
    this.autoplay = false;
    this.present = null; this.overlay = null; this.rollup = null;
    this.pendingFeature = 0; this.now = 0; this.nextAttract = 20; this.spinTimer = 0; this.evalAt = 0;
    this.renderer = null;
    this.stats = { spins: 0, wagered: 0, won: 0, features: 0 };
  }
  const P = Game.prototype;

  P.lines = function () { return C.lineOptions[this.linesIdx]; };
  P.bet = function () { return C.betOptions[this.betIdx]; };
  P.totalBet = function () { return this.lines() * this.bet(); };
  P.setMessage = function (m) { this.message = m; };
  P.defaultMessage = function () { return 'PLAY ' + this.lines() + ' LINES  ·  BET ' + this.bet() + ' PER LINE  ·  PRESS SPIN'; };
  P.begin = function () { this.state = 'idle'; this.setMessage(this.defaultMessage()); this.nextAttract = this.now + 18; };
  P.canAdjust = function () {
    return !this.fs.active && !this.overlay && !this.rollup && (this.state === 'idle' || this.state === 'present');
  };
  P.changeLines = function (d) {
    if (!this.canAdjust()) { A.deny(); return; }
    this.linesIdx = clamp(this.linesIdx + d, 0, C.lineOptions.length - 1); A.tick(); this.setMessage(this.defaultMessage());
  };
  P.changeBet = function (d) {
    if (!this.canAdjust()) { A.deny(); return; }
    this.betIdx = clamp(this.betIdx + d, 0, C.betOptions.length - 1); A.tick(); this.setMessage(this.defaultMessage());
  };
  P.maxBet = function () {
    if (!this.canAdjust()) { A.deny(); return; }
    this.linesIdx = C.lineOptions.length - 1; this.betIdx = C.betOptions.length - 1; A.tick();
    this.setMessage(this.defaultMessage()); this.spin();
  };
  P.addCredits = function (n) {
    if (this.state === 'spinning' || this.fs.active) { A.deny(); return; }
    this.credits += n; A.coinIn();
    if (this.state === 'idle') this.setMessage(this.defaultMessage());
  };
  P.toggleAuto = function () {
    this.autoplay = !this.autoplay;
    if (this.autoplay && this.state === 'idle' && !this.fs.active) this.spin();
  };

  /* main button: context sensitive */
  P.pressSpin = function () {
    this.nextAttract = this.now + 18;
    if (this.overlay) {
      if (this.overlay.skippable && this.now - this.overlay.t0 > (this.overlay.minTime || 0.8)) this.endOverlay();
      return;
    }
    if (this.state === 'spinning') { this.slam(); return; }
    if (this.state === 'present') {
      if (this.rollup) { this.finishRollup(); return; }
      if (this.pendingFeature) { this.afterPresentation(); return; }
      if (!this.fs.active && !this.autoplay) this.spin();
      return;
    }
    if (this.state === 'idle') this.spin();
  };

  P.spin = function () {
    const free = this.fs.active, bet = this.totalBet();
    if (!free) {
      if (this.credits < bet) { A.deny(); this.setMessage('INSUFFICIENT CREDITS  ·  CLICK THE CREDITS METER TO ADD 1,000'); this.autoplay = false; return false; }
      this.credits -= bet; this.stats.wagered += bet;
    }
    this.stats.spins++;
    this.clearPresent(); this.win = 0; this.winDisplay = 0; this.pendingFeature = 0; this.spinTimer = 0;
    this.state = 'spinning'; this.spinStartedAt = this.now;
    this.setMessage(free ? 'FREE SPIN ' + (this.fs.played + 1) + ' OF ' + this.fs.total : 'GOOD LUCK!');
    const set = free ? this.strips.free : this.strips.base;
    this.stops = set.map(s => rng.int(s.length));
    if (ZEUS.DEBUG_FORCE) { const f = ZEUS.DEBUG_FORCE(set, free); if (f) this.stops = f; }
    this.grid = set.map((s, i) => ZEUS.windowAt(s, this.stops[i], 3));
    this.result = ZEUS.evalSpin(this.grid, this.lines());
    /* schedule: reels start staggered, stop requests staggered; anticipation
       (predetermined from the outcome) stretches reels after 2 scatters */
    const base = this.now, gap = free ? 0.27 : 0.33, first = free ? 0.95 : 1.1;
    this.sched = { startAt: [], stopAt: [], started: [], requested: [], antic: [] };
    let scat = 0, extra = 0;
    for (let i = 0; i < 5; i++) {
      this.sched.antic[i] = scat >= 2;
      if (this.sched.antic[i]) extra += 1.7;
      this.sched.startAt[i] = base + i * 0.07;
      this.sched.stopAt[i] = base + first + i * gap + extra;
      this.sched.started[i] = false; this.sched.requested[i] = false;
      scat += this.grid[i].filter(s => s === 'FEATURE').length;
    }
    this.stoppedCount = 0; this.landedCount = 0; this.scattersLanded = 0; this.slammed = false;
    A.spinStart();
    return true;
  };
  P.slam = function () {
    if (this.state !== 'spinning' || this.slammed) return;
    this.slammed = true; let n = 0;
    for (let i = 0; i < 5; i++) {
      const r = this.reels[i];
      if (r.state === 'stopped' && this.sched.started[i]) continue;
      if (!this.sched.requested[i]) this.sched.stopAt[i] = Math.min(this.sched.stopAt[i], this.now + n * 0.06);
      r.slam(); n++;
    }
    A.anticipationStop(); if (this.renderer) this.renderer.anticipationReel = -1;
    A.click();
  };

  P.update = function (now, dt) {
    this.now = now;
    if (this.state === 'spinning' && this.sched) {
      const s = this.sched;
      for (let i = 0; i < 5; i++) {
        const r = this.reels[i];
        if (!s.started[i] && now >= s.startAt[i]) { r.spin(now); s.started[i] = true; }
        if (s.started[i] && !s.requested[i] && now >= s.stopAt[i]) { r.requestStop(this.stops[i], this.slammed); s.requested[i] = true; }
      }
      let sp = 0; this.reels.forEach(r => { sp += r.speed; });
      A.spinLoopSet(sp / (5 * this.reels[0].vmax));
    }
    for (let i = 0; i < 5; i++) this.reels[i].update(now, dt);
    if (this.evalAt && now >= this.evalAt) { this.evalAt = 0; this.evaluate(); }
    if (this.rollup) {
      const ru = this.rollup, u = Math.min(1, (now - ru.t0) / ru.dur), e = 1 - Math.pow(1 - u, 2);
      this.winDisplay = Math.round(ru.to * e); this.credits = ru.creditsBase + this.winDisplay;
      if (u >= 1) this.finishRollup();
    }
    const pr = this.present;
    if (pr) {
      if (pr.mode === 'all' && pr.allUntil && now > pr.allUntil) this.nextLine();
      else if (pr.mode === 'line' && now - pr.lineT0 > 1.1) this.nextLine();
      if (pr.zeusCells.length && this.renderer && now - (pr.lastArc || 0) > 0.07) {
        pr.lastArc = now;
        const c = pr.zeusCells[Math.floor(Math.random() * pr.zeusCells.length)], rect = this.renderer.cellRect(c.reel, c.row);
        let x0, y0, x1, y1;
        if (Math.random() < 0.5) { y0 = rect.y + 6; y1 = rect.y + rect.h - 6; x0 = rect.x + 10 + Math.random() * (rect.w - 20); x1 = rect.x + 10 + Math.random() * (rect.w - 20); }
        else { x0 = rect.x + 6; x1 = rect.x + rect.w - 6; y0 = rect.y + 10 + Math.random() * (rect.h - 20); y1 = rect.y + 10 + Math.random() * (rect.h - 20); }
        FX.arc(x0, y0, x1, y1);
      }
      if (pr.autoEnd && now >= pr.autoEnd && !this.rollup && !this.overlay) this.afterPresentation();
    }
    if (this.overlay) {
      const ov = this.overlay;
      if (ov.kind === 'summary' && !ov.ending) ov.shown = Math.round(ov.win * clamp((now - ov.t0 - 0.5) / 2.2, 0, 1));
      if (ov.kind === 'bigwin' && !ov.ending && Math.random() < dt * 22) FX.coins(1);
      if (!ov.ending && now - ov.t0 >= ov.dur) this.endOverlay();
      else if (ov.ending && now >= ov.endAt + 0.4) this.overlayDone();
    }
    if (this.spinTimer && now >= this.spinTimer) { this.spinTimer = 0; this.spin(); }
    if (this.state === 'idle' && !this.fs.active && now > this.nextAttract && A.ready) {
      this.nextAttract = now + 14 + Math.random() * 12;
      FX.strike(960 + (Math.random() - 0.5) * 520, 90 + Math.random() * 60, { flash: 0.18, shake: 2, branches: 3 });
      A.lightning(0.35);
    }
  };

  /* ---------------------------------------------------- reel events */
  P.onReelLand = function (reel) {
    const i = reel.index, R = this.renderer, col = this.grid[i];
    this.landedCount++;
    A.reelStop(i);
    col.forEach((sym, row) => {
      if (sym !== 'FEATURE') return;
      this.scattersLanded++;
      const rect = R.cellRect(i, row);
      FX.strike(rect.cx, rect.cy - 10, { flash: 0.16 + 0.08 * this.scattersLanded, shake: 4, branches: 3, width: 3 });
      A.scatterLand(this.scattersLanded);
    });
    if (col[0] === 'ZEUS' && col[1] === 'ZEUS' && col[2] === 'ZEUS') {
      A.zeusLand(); FX.flash = Math.max(FX.flash, 0.12);
      for (let row = 0; row < 3; row++) { const rect = R.cellRect(i, row); FX.sparkle(rect.cx, rect.cy, 10, { color: '#ffe27a' }); }
    } else if (col.indexOf('WILD') >= 0) {
      A.wildLand();
      col.forEach((s, row) => { if (s === 'WILD') { const rect = R.cellRect(i, row); FX.sparkle(rect.cx, rect.cy, 12, { color: '#fff2b0' }); } });
    }
    if (this.sched.antic[i]) { A.anticipationStop(); R.anticipationReel = -1; }
    if (!this.slammed && i < 4 && this.sched.antic[i + 1]) { A.anticipationStop(); A.anticipationStart(); R.anticipationReel = i + 1; }
  };
  P.onReelStop = function (reel) {
    this.stoppedCount++;
    if (this.stoppedCount >= 5) {
      A.spinLoopStop(); A.anticipationStop(); if (this.renderer) this.renderer.anticipationReel = -1;
      this.evalAt = this.now + 0.2;
    }
  };

  /* ------------------------------------------------------- outcome */
  P.evaluate = function () {
    const r = this.result, bet = this.bet();
    const total = r.lineWins.reduce((a, w) => a + w.pay, 0) * bet;
    this.win = total; this.stats.won += total; this.pendingFeature = r.freeSpins;
    if (r.freeSpins) this.stats.features++;
    if (this.fs.active) { this.fs.played++; this.fs.left--; }
    if (total > 0) this.presentWins(total);
    else { this.state = 'present'; this.afterPresentation(); }
  };
  P.presentWins = function (total) {
    const r = this.result, now = this.now; this.state = 'present';
    const ratio = total / this.totalBet(), tier = ratio >= 100 ? 3 : ratio >= 50 ? 2 : ratio >= 15 ? 1 : 0;
    const cells = [], seen = {}, zeusCells = [];
    r.lineWins.forEach(w => {
      for (let i = 0; i < w.count; i++) {
        const key = i + ':' + w.rows[i]; if (seen[key]) continue; seen[key] = true;
        const sym = this.grid[i][w.rows[i]], c = { reel: i, row: w.rows[i], sym: sym };
        cells.push(c); if (sym === 'ZEUS' || sym === 'WILD') zeusCells.push(c);
      }
    });
    if (r.freeSpins) r.scatters.forEach(s => cells.push({ reel: s.reel, row: s.row, sym: 'FEATURE', scatter: true }));
    this.present = { mode: 'all', wins: r.lineWins, idx: -1, cells: cells, zeusCells: zeusCells, t0: now, allUntil: 0, lineT0: 0, lineCells: [], cycles: 0, autoEnd: 0, lastArc: 0 };
    const dur = tier ? 2.6 + tier * 0.9 : clamp(0.3 + ratio * 0.35, 0.35, 2.2);
    this.rollup = { t0: now, dur: dur, to: total, creditsBase: this.credits };
    if (this.fs.active) this.fs.win += total;
    if (tier) {
      A.bigWin(tier); A.coinShower(dur + 1);
      this.overlay = { kind: 'bigwin', tier: tier, t0: now, dur: dur + 2.0, skippable: true, minTime: 1.0 };
      FX.coins(30 + tier * 30);
      FX.strike(960 + (Math.random() - 0.5) * 600, 300, { flash: 0.5, shake: 10 });
      if (tier >= 2) setTimeout(() => FX.strike(400 + Math.random() * 1100, 450, { flash: 0.3, shake: 6 }), 500);
    } else A.lineWin(ratio < 1 ? 0 : ratio < 5 ? 1 : 2, 0);
    A.rollupStart(dur, ratio);
    this.setMessage('WIN ' + ZEUS.fmt(total));
    /* auto-advance in free spins, autoplay, or when a feature trigger is waiting behind this win */
    if (this.fs.active || this.autoplay || r.freeSpins) this.present.autoEnd = now + Math.max(dur + 0.7, 1.0 + 0.9 * Math.min(r.lineWins.length, 2)) + (tier ? 2.2 : 0);
  };
  P.finishRollup = function () {
    const ru = this.rollup; if (!ru) return;
    this.winDisplay = ru.to; this.credits = ru.creditsBase + ru.to; this.rollup = null;
    A.rollupStop(true);
    if (this.present) this.present.allUntil = this.now + 1.0;
  };
  P.nextLine = function () {
    const pr = this.present; if (!pr || !pr.wins.length) return;
    pr.idx = (pr.idx + 1) % pr.wins.length;
    if (pr.idx === 0 && pr.mode === 'line') pr.cycles++;
    pr.mode = 'line'; pr.lineT0 = this.now;
    const w = pr.wins[pr.idx]; pr.lineCells = [];
    for (let i = 0; i < w.count; i++) pr.lineCells.push({ reel: i, row: w.rows[i], sym: this.grid[i][w.rows[i]] });
    this.setMessage('LINE ' + (w.line + 1) + '   ' + w.count + ' x ' + C.symbolById[w.sym].name.toUpperCase() + '   PAYS ' + ZEUS.fmt(w.pay * this.bet()));
    if (pr.cycles === 0) A.tick();
  };
  P.clearPresent = function () { if (this.rollup) this.finishRollup(); this.present = null; };
  P.afterPresentation = function () {
    this.clearPresent();
    if (this.pendingFeature) { const n = this.pendingFeature; this.pendingFeature = 0; this.triggerFeature(n); return; }
    if (this.fs.active) {
      if (this.fs.left > 0) { this.state = 'free'; this.spinTimer = this.now + 0.75; }
      else this.endFreeSpins();
      return;
    }
    this.state = 'idle'; this.setMessage(this.defaultMessage());
    if (this.autoplay) {
      if (this.credits >= this.totalBet()) this.spinTimer = this.now + 0.6;
      else { this.autoplay = false; this.setMessage('INSUFFICIENT CREDITS  ·  CLICK THE CREDITS METER TO ADD 1,000'); }
    }
  };

  /* ----------------------------------------------------- free spins */
  P.triggerFeature = function (spins) {
    const retrigger = this.fs.active; this.state = 'feature';
    A.featureTrigger();
    const sc = this.result.scatters, R = this.renderer;
    sc.forEach((s, i) => setTimeout(() => { const rect = R.cellRect(s.reel, s.row); FX.strike(rect.cx, rect.cy, { flash: 0.35, shake: 8, branches: 5 }); }, 150 * i));
    if (retrigger) { this.fs.left += spins; this.fs.total += spins; }
    else this.fs = { active: true, left: spins, played: 0, total: spins, win: 0 };
    this.overlay = { kind: 'feature', spins: spins, retrigger: retrigger, t0: this.now, dur: 4.4, skippable: true, minTime: 1.3, onDone: () => this.startFreeSpins(retrigger) };
    this.setMessage(retrigger ? spins + ' MORE FREE SPINS' : spins + ' FREE SPINS AWARDED');
    setTimeout(() => A.banner(), 700);
  };
  P.startFreeSpins = function (retrigger) {
    if (!retrigger) {
      this.reels.forEach((r, i) => r.setStrip(this.strips.free[i], rng.int(this.strips.free[i].length)));
      this.renderer.setBackground('storm'); A.startMusic('free');
      FX.flash = 0.9; FX.strike(960, 200, { flash: 0.6, shake: 8 });
    }
    this.state = 'free'; this.spinTimer = this.now + 0.8; this.setMessage('FREE SPINS');
  };
  P.endFreeSpins = function () {
    this.state = 'summary'; A.freeSpinsEnd();
    this.overlay = { kind: 'summary', win: this.fs.win, played: this.fs.played, shown: 0, t0: this.now, dur: 6, skippable: true, minTime: 2.2, onDone: () => this.leaveFreeSpins() };
    FX.coins(40);
  };
  P.leaveFreeSpins = function () {
    this.fs = { active: false, left: 0, played: 0, total: 0, win: 0 };
    this.reels.forEach((r, i) => r.setStrip(this.strips.base[i], rng.int(this.strips.base[i].length)));
    this.renderer.setBackground('olympus'); A.startMusic('base'); FX.flash = 0.5;
    this.state = 'idle'; this.setMessage(this.defaultMessage());
    if (this.autoplay) { if (this.credits >= this.totalBet()) this.spinTimer = this.now + 0.8; else this.autoplay = false; }
  };
  P.endOverlay = function () {
    const ov = this.overlay; if (!ov || ov.ending) return;
    ov.ending = true; ov.endAt = this.now;
    if (ov.kind === 'bigwin' && this.rollup) this.finishRollup();
    if (ov.kind === 'summary') ov.shown = ov.win;
  };
  P.overlayDone = function () { const ov = this.overlay; this.overlay = null; if (ov && ov.onDone) ov.onDone(); };

  ZEUS.Game = Game;
})(window);
