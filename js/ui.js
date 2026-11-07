/* ============================================================================
   ZEUS — DOM user interface: meters, bet controls, spin/auto buttons,
   paytable overlay, splash screen, keyboard shortcuts, volume.
   ========================================================================== */
(function (root) {
  'use strict';
  const ZEUS = root.ZEUS, C = ZEUS.CONFIG, A = ZEUS.audio;
  const $ = id => document.getElementById(id);
  const fmt = n => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  function UI(game, renderer) {
    this.game = game; this.renderer = renderer;
    this.el = {
      credits: $('m-credits'), creditsMeter: $('meter-credits'), win: $('m-win'), bet: $('m-bet'), lines: $('m-lines'), total: $('m-total'),
      spin: $('btn-spin'), auto: $('btn-auto'), max: $('btn-max'),
      linesDn: $('btn-lines-dn'), linesUp: $('btn-lines-up'), betDn: $('btn-bet-dn'), betUp: $('btn-bet-up'),
      pay: $('btn-pay'), sound: $('btn-sound'), vol: $('vol'),
      splash: $('splash'), splashText: $('splash-text'), splashBar: $('splash-bar'),
      paytable: $('paytable'), payClose: $('pay-close'), payBody: $('pay-body')
    };
    this.splashVisible = true; this.paytableOpen = false; this.assetsReady = false;
    this.bind();
  }
  const P = UI.prototype;

  P.bind = function () {
    const g = this.game, e = this.el;
    const press = (el, fn) => el.addEventListener('click', ev => { ev.preventDefault(); A.init(); fn(); });
    press(e.spin, () => g.pressSpin());
    press(e.creditsMeter, () => g.addCredits(1000));
    press(e.auto, () => { A.click(); g.toggleAuto(); });
    press(e.max, () => { A.click(); g.maxBet(); });
    press(e.linesDn, () => g.changeLines(-1)); press(e.linesUp, () => g.changeLines(1));
    press(e.betDn, () => g.changeBet(-1)); press(e.betUp, () => g.changeBet(1));
    press(e.pay, () => { A.click(); this.togglePaytable(); });
    press(e.payClose, () => { A.click(); this.togglePaytable(false); });
    press(e.sound, () => { const m = A.toggleMute(); this.updateSound(); if (!m) A.click(); });
    e.vol.addEventListener('input', () => { A.init(); A.setVolume(parseFloat(e.vol.value)); if (A.muted) { A.setMuted(false); this.updateSound(); } });
    e.splash.addEventListener('pointerdown', () => { if (this.assetsReady) this.start(); });
    root.addEventListener('keydown', ev => {
      if (ev.repeat) return;
      if (ev.code === 'Space' || ev.code === 'Enter') {
        ev.preventDefault(); A.init();
        if (this.splashVisible) { if (this.assetsReady) this.start(); }
        else if (this.paytableOpen) this.togglePaytable(false);
        else g.pressSpin();
        return;
      }
      if (this.splashVisible) return;
      A.init();
      switch (ev.code) {
        case 'ArrowUp': g.changeBet(1); break;
        case 'ArrowDown': g.changeBet(-1); break;
        case 'ArrowRight': g.changeLines(1); break;
        case 'ArrowLeft': g.changeLines(-1); break;
        case 'KeyA': A.click(); g.toggleAuto(); break;
        case 'KeyM': A.toggleMute(); this.updateSound(); break;
        case 'KeyI': case 'KeyP': A.click(); this.togglePaytable(); break;
        case 'KeyX': A.click(); g.maxBet(); break;
        case 'Escape': this.togglePaytable(false); break;
        default: break;
      }
    });
    e.vol.value = A.volume; this.updateSound();
  };
  P.start = function () {
    A.init(); A.startMusic('base');
    this.splashVisible = false; this.el.splash.classList.add('hidden');
    this.game.begin(); A.coinIn();
  };
  P.setProgress = function (p) { this.el.splashBar.style.width = Math.round(p * 100) + '%'; };
  P.assetsLoaded = function () {
    this.assetsReady = true;
    this.el.splashText.textContent = 'PRESS TO PLAY';
    this.el.splash.classList.add('ready');
  };
  function set(el, text) { if (el && el._t !== text) { el._t = text; el.textContent = text; } }
  P.refresh = function () {
    const g = this.game, e = this.el, st = g.state;
    set(e.credits, fmt(g.credits)); set(e.win, fmt(g.winDisplay)); set(e.bet, String(g.bet()));
    set(e.lines, String(g.lines())); set(e.total, fmt(g.totalBet()));
    let label = 'SPIN';
    if (g.overlay) label = 'CONTINUE';
    else if (st === 'spinning') label = 'STOP';
    else if (st === 'present' && g.rollup) label = 'SKIP';
    else if (g.fs.active) label = 'FREE';
    set(e.spin, label);
    e.spin.classList.toggle('long', label.length > 5);
    e.auto.classList.toggle('on', g.autoplay); set(e.auto, g.autoplay ? 'AUTO ON' : 'AUTO');
    const lock = !g.canAdjust();
    [e.betDn, e.betUp, e.linesDn, e.linesUp, e.max].forEach(b => { b.disabled = lock; });
    e.spin.disabled = st === 'boot' || (g.fs.active && !g.overlay && st !== 'spinning' && !g.rollup);
    e.spin.classList.toggle('pulse', st === 'idle' && !g.autoplay);
  };
  P.updateSound = function () {
    this.el.sound.textContent = A.muted ? '🔇' : '🔊';
    this.el.sound.classList.toggle('muted', A.muted);
  };
  P.togglePaytable = function (force) {
    const open = force == null ? !this.paytableOpen : force;
    this.paytableOpen = open; this.el.paytable.classList.toggle('hidden', !open);
  };
  P.buildPaytable = function () {
    let html = '<div class="pay-grid">';
    C.symbols.forEach(s => {
      let pays = '';
      if (s.pays) pays = [5, 4, 3, 2].filter(n => s.pays[n]).map(n => '<div><b>' + n + '</b><span>' + s.pays[n] + '</span></div>').join('');
      else if (s.wild) pays = '<p>Substitutes for all symbols except FEATURE. Appears on all reels, stacked in free spins.</p>';
      else pays = '<div><b>5</b><span>100 FREE SPINS</span></div><div><b>4</b><span>25 FREE SPINS</span></div><div><b>3</b><span>10 FREE SPINS</span></div>';
      html += '<div class="pay-card"><img src="assets/symbols/' + s.file + '.png" alt="' + s.name + '" onerror="this.style.visibility=\'hidden\'">' +
        '<div class="pay-name">' + s.name.toUpperCase() + '</div><div class="pay-list">' + pays + '</div></div>';
    });
    html += '</div><ul class="rules">' + C.rules.map(r => '<li>' + r + '</li>').join('') + '</ul>';
    html += '<p class="rtp">Theoretical return to player ' + (ZEUS.RTP || '96') + '%. Line pays are multiplied by the bet per line. ' +
      'Unofficial fan recreation for entertainment only &mdash; play money, no real wagering.</p>';
    this.el.payBody.innerHTML = html;
  };

  ZEUS.UI = UI;
})(window);
