/* ============================================================================
   ZEUS — bootstrap: load assets, build symbol variants, run the frame loop.
   Debug: open with ?force=feature | feature5 | zeus | bigwin | wild to force
   outcomes while testing.
   ========================================================================== */
(function (root) {
  'use strict';
  const ZEUS = root.ZEUS;

  function setupDebug() {
    const q = new URLSearchParams(root.location.search), f = q.get('force');
    if (!f) return;
    const find = (strip, pred) => { for (let S = 0; S < strip.length; S++) if (pred(ZEUS.windowAt(strip, S, 3))) return S; return null; };
    const rnd = strip => Math.floor(Math.random() * strip.length);
    ZEUS.DEBUG_FORCE = function (set) {
      if (f === 'feature') return set.map((s, i) => (i < 3 ? find(s, w => w.indexOf('FEATURE') >= 0) : null) ?? rnd(s));
      if (f === 'feature5') return set.map(s => find(s, w => w.indexOf('FEATURE') >= 0) ?? rnd(s));
      if (f === 'zeus') return set.map(s => find(s, w => w[0] === 'ZEUS' && w[1] === 'ZEUS' && w[2] === 'ZEUS') ?? rnd(s));
      if (f === 'bigwin') return set.map((s, i) => (i < 4 ? find(s, w => w[1] === 'PEGASUS' || w[1] === 'WILD') : null) ?? rnd(s));
      if (f === 'wild') return set.map((s, i) => (i > 0 && i < 4 ? find(s, w => w[1] === 'WILD') : null) ?? rnd(s));
      if (f === 'none') return set.map((s, i) => find(s, w => w[1] === (i % 2 ? 'VASE' : 'HELMET') && w[0] !== 'FEATURE' && w[2] !== 'FEATURE') ?? rnd(s));
      return null;
    };
  }

  root.addEventListener('load', () => {
    const canvas = document.getElementById('game');
    const game = new ZEUS.Game();
    const renderer = new ZEUS.Renderer(canvas, game);
    game.renderer = renderer;
    const ui = new ZEUS.UI(game, renderer);
    ZEUS.game = game; ZEUS.renderer = renderer; ZEUS.ui = ui;
    setupDebug();

    const fontReady = (document.fonts && document.fonts.load)
      ? Promise.race([Promise.all([document.fonts.load('900 60px Cinzel'), document.fonts.load('700 30px Cinzel')]).catch(() => {}), new Promise(r => setTimeout(r, 2500))])
      : Promise.resolve();
    Promise.all([ZEUS.assets.load(p => ui.setProgress(p)), fontReady]).then(() => {
      ZEUS.assets.prepareSymbols(464, 372);
      ui.buildPaytable();
      ui.assetsLoaded();
    });

    /* virtual clock: real time plus an offset that test code can advance */
    ZEUS.timeOffset = 0;
    const clock = () => performance.now() / 1000 + ZEUS.timeOffset;
    let last = clock();
    function tick(now, dt, draw) {
      game.update(now, dt);
      ZEUS.fx.update(dt);
      renderer.update(dt);
      if (draw) { renderer.draw(now, dt); ui.refresh(); }
    }
    function frame() {
      const now = clock(), dt = Math.min(0.05, Math.max(0, now - last)); last = now;
      tick(now, dt, true);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    /* ZEUS.step(seconds): advance the simulation deterministically (used when the
       page is throttled in a background tab during automated testing) */
    ZEUS.step = function (seconds) {
      const h = 1 / 60, n = Math.max(1, Math.round(seconds / h));
      for (let i = 0; i < n; i++) { ZEUS.timeOffset += h; const now = clock(); last = now; tick(now, h, i === n - 1); }
    };
    document.addEventListener('visibilitychange', () => { if (!document.hidden && ZEUS.audio.ctx) ZEUS.audio.ctx.resume(); });
  });
})(window);
