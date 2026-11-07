/* ============================================================================
   ZEUS — asset loading, pre-rendered symbol variants (sharp + motion blurred)
   and procedural textures (grain, coin sprite). Missing images fall back to
   drawn placeholders so the game always runs.
   ========================================================================== */
(function (root) {
  'use strict';
  const ZEUS = root.ZEUS || (root.ZEUS = {});
  const A = ZEUS.assets = { images: {}, missing: {}, symbols: {}, ready: false, progress: 0 };
  const FILES = { logo: 'assets/logo.png', bgBase: 'assets/bg/olympus.jpg', bgFree: 'assets/bg/storm.jpg' };
  ZEUS.CONFIG.symbols.forEach(s => { FILES['sym_' + s.id] = 'assets/symbols/' + s.file + '.png'; });

  function loadImage(key, src) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => { A.images[key] = img; resolve(img); };
      img.onerror = () => { A.missing[key] = true; resolve(null); };
      img.src = src;
    });
  }
  A.load = function (onProgress) {
    const keys = Object.keys(FILES); let done = 0;
    return Promise.all(keys.map(k => loadImage(k, FILES[k]).then(() => {
      done++; A.progress = done / keys.length; if (onProgress) onProgress(A.progress);
    }))).then(() => { A.ready = true; return A; });
  };
  A.image = function (key) { return A.images[key] || null; };
  A.symbolImage = function (id) { return A.images['sym_' + id] || null; };

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  A.roundRect = roundRect;

  /* Offscreen variants per symbol: [sharp, blur1, blur2, blur3] at 2x cell size */
  A.prepareSymbols = function (w, h) {
    A.symW = w; A.symH = h;
    ZEUS.CONFIG.symbols.forEach(s => {
      const base = document.createElement('canvas'); base.width = w; base.height = h;
      const ctx = base.getContext('2d');
      const img = A.symbolImage(s.id);
      if (img) {
        const m = 0.035, aw = w * (1 - 2 * m), ah = h * (1 - 2 * m);
        const sc = Math.min(aw / img.width, ah / img.height), dw = img.width * sc, dh = img.height * sc;
        ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
      } else drawFallback(ctx, s, w, h);
      const variants = [base];
      [0.07, 0.17, 0.3].forEach(frac => {
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const cx = c.getContext('2d'), n = 12, span = h * frac;
        cx.globalCompositeOperation = 'lighter'; cx.globalAlpha = 1 / n;
        for (let i = 0; i < n; i++) cx.drawImage(base, 0, -span / 2 + span * i / (n - 1));
        variants.push(c);
      });
      A.symbols[s.id] = variants;
    });
  };
  A.symbol = function (id, level) {
    const v = A.symbols[id]; if (!v) return null;
    return v[Math.max(0, Math.min(3, level | 0))];
  };
  function drawFallback(ctx, s, w, h) {
    ctx.save();
    roundRect(ctx, w * 0.07, h * 0.07, w * 0.86, h * 0.86, Math.min(w, h) * 0.12);
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#2b3052'); g.addColorStop(1, '#0c0e1c');
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = Math.max(2, w * 0.015); ctx.strokeStyle = '#d4af37'; ctx.stroke();
    ctx.fillStyle = '#f3d77a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold ' + Math.floor(h * 0.15) + 'px Cinzel, "Times New Roman", serif';
    const words = s.name.toUpperCase().split(' ');
    words.forEach((wd, i) => ctx.fillText(wd, w / 2, h / 2 + (i - (words.length - 1) / 2) * h * 0.19));
    ctx.restore();
  }

  /* ---------- procedural textures ---------- */
  A.noise = function () {
    if (A._noise) return A._noise;
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const ctx = c.getContext('2d'), id = ctx.createImageData(256, 256), d = id.data;
    for (let i = 0; i < d.length; i += 4) { const v = 128 + (Math.random() - 0.5) * 80; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
    ctx.putImageData(id, 0, 0); A._noise = c; return c;
  };
  A.coin = function () {
    if (A._coin) return A._coin;
    const s = 64, c = document.createElement('canvas'); c.width = c.height = s;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(s * 0.38, s * 0.35, s * 0.05, s / 2, s / 2, s / 2);
    g.addColorStop(0, '#fff6c2'); g.addColorStop(0.35, '#f5d060'); g.addColorStop(0.8, '#b8860b'); g.addColorStop(1, '#6b4e07');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s / 2, s / 2, s / 2 - 1, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(120,80,0,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(s / 2, s / 2, s / 2 - 6, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(s * 0.4, s * 0.32, s * 0.16, s * 0.09, -0.6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(110,70,0,0.75)'; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.beginPath();
    ctx.moveTo(s * 0.56, s * 0.22); ctx.lineTo(s * 0.42, s * 0.5); ctx.lineTo(s * 0.53, s * 0.5); ctx.lineTo(s * 0.44, s * 0.78);
    ctx.lineTo(s * 0.62, s * 0.46); ctx.lineTo(s * 0.51, s * 0.46); ctx.closePath(); ctx.stroke();
    A._coin = c; return c;
  };
})(window);
