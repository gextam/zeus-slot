/* ============================================================================
   ZEUS — canvas renderer. Virtual 1920x1080 scene: background, logo, gold
   bezel, five cylindrical reels (perspective slicing + motion blur + drum
   lighting + glass), win presentation, HUD/message bar and overlays.
   ========================================================================== */
(function (root) {
  'use strict';
  const ZEUS = root.ZEUS, A = ZEUS.assets, FX = ZEUS.fx;
  const W = 1920, H = 1080;
  const REEL = { x: 380, y: 196, cellW: 232, cellH: 186, cols: 5, rows: 3 };
  REEL.w = REEL.cellW * REEL.cols; REEL.h = REEL.cellH * REEL.rows; REEL.cy = REEL.y + REEL.h / 2;
  const PAD = 30, R_CELLS = 3.0;
  const FONT = 'Cinzel, "Trajan Pro", "Palatino Linotype", "Times New Roman", serif';
  const rr = A.roundRect;
  const fmt = n => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  ZEUS.fmt = fmt; ZEUS.LAYOUT = { W: W, H: H, REEL: REEL, PAD: PAD };

  function proj(u) { const a = Math.max(-1.45, Math.min(1.45, u / R_CELLS)); return R_CELLS * Math.sin(a) * REEL.cellH; }
  function easeOutBack(u) { if (u >= 1) return 1; if (u <= 0) return 0; const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2); }
  function cover(ctx, img) { const r = Math.max(W / img.width, H / img.height), w = img.width * r, h = img.height * r; ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h); }

  function Renderer(canvas, game) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d', { alpha: false }); this.game = game;
    this.scale = 1; this.dpr = 1; this.bgMix = 0; this.bgTarget = 0; this.time = 0; this.anticipationReel = -1;
    this.resize();
    root.addEventListener('resize', () => this.resize());
  }
  const P = Renderer.prototype;

  P.resize = function () {
    const vw = root.innerWidth, vh = root.innerHeight, s = Math.min(vw / W, vh / H);
    this.scale = s; this.dpr = Math.min(2, root.devicePixelRatio || 1);
    const stage = document.getElementById('stage');
    if (stage) stage.style.transform = 'translate(-50%,-50%) scale(' + s + ')';
    this.canvas.width = Math.round(W * s * this.dpr); this.canvas.height = Math.round(H * s * this.dpr);
    this.canvas.style.width = W + 'px'; this.canvas.style.height = H + 'px';
  };
  P.setBackground = function (name) { this.bgTarget = name === 'storm' ? 1 : 0; };
  P.cellRect = function (reel, row) {
    const x = REEL.x + reel * REEL.cellW, y0 = REEL.cy + proj(row - 1.5), y1 = REEL.cy + proj(row - 0.5);
    return { x: x, y: y0, w: REEL.cellW, h: y1 - y0, cx: x + REEL.cellW / 2, cy: (y0 + y1) / 2 };
  };

  P.update = function (dt) {
    this.bgMix += (this.bgTarget - this.bgMix) * Math.min(1, dt * 1.5);
  };
  P.draw = function (now, dt) {
    const ctx = this.ctx, S = this.scale * this.dpr;
    this.time = now;
    ctx.setTransform(S, 0, 0, S, 0, 0);
    ctx.save();
    if (FX.shake > 0.3) ctx.translate((Math.random() - 0.5) * FX.shake, (Math.random() - 0.5) * FX.shake);
    this.drawBackground(ctx);
    this.drawLogo(ctx);
    this.drawFrame(ctx);
    this.drawReels(ctx, now);
    this.drawWinLayer(ctx, now);
    this.drawGlass(ctx);
    this.drawMessage(ctx);
    FX.drawBolts(ctx);
    FX.drawParticles(ctx);
    this.drawOverlay(ctx, now);
    FX.drawFlash(ctx, W, H);
    ctx.restore();
  };

  /* ------------------------------------------------------------ scene */
  P.drawBackground = function (ctx) {
    const b = A.image('bgBase'), s = A.image('bgFree');
    ctx.fillStyle = '#05060c'; ctx.fillRect(-20, -20, W + 40, H + 40);
    if (b) cover(ctx, b); else this.drawProceduralScene(ctx, 0);
    if (this.bgMix > 0.01) {
      ctx.globalAlpha = this.bgMix;
      if (s) cover(ctx, s); else this.drawProceduralScene(ctx, 1);
      ctx.globalAlpha = 1;
    }
    let g = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.3, W / 2, H * 0.45, H * 0.98);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const t = this.time;
    ctx.globalCompositeOperation = 'lighter';
    g = ctx.createRadialGradient(W * 0.5 + Math.sin(t * 0.07) * 300, H * 0.3 + Math.cos(t * 0.05) * 80, 40, W * 0.5, H * 0.3, 760);
    const warm = this.bgMix < 0.5;
    g.addColorStop(0, warm ? 'rgba(255,215,140,0.07)' : 'rgba(150,180,255,0.06)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
  };
  P.drawProceduralScene = function (ctx, storm) {
    let g = ctx.createLinearGradient(0, 0, 0, H);
    if (storm) { g.addColorStop(0, '#05060f'); g.addColorStop(0.6, '#161a33'); g.addColorStop(1, '#0a0b16'); }
    else { g.addColorStop(0, '#0f1d3f'); g.addColorStop(0.55, '#3b4f86'); g.addColorStop(0.8, '#c98a3a'); g.addColorStop(1, '#2b1d0f'); }
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.globalAlpha = 0.5;
    for (let i = 0; i < 9; i++) {
      const cx = (i * 263 + 120) % W, cy = 620 + (i % 3) * 90, rx = 260 + (i % 4) * 60, ry = 60 + (i % 2) * 30;
      const cg = ctx.createRadialGradient(cx, cy, 10, cx, cy, rx);
      cg.addColorStop(0, storm ? 'rgba(90,100,140,0.9)' : 'rgba(255,230,190,0.95)'); cg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = cg; ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, 6.283); ctx.fill();
    }
    ctx.restore();
    [120, 250, 1670, 1800].forEach(x => {
      const cg = ctx.createLinearGradient(x - 40, 0, x + 40, 0);
      cg.addColorStop(0, '#3a3226'); cg.addColorStop(0.35, storm ? '#9aa0b8' : '#e9dcc3'); cg.addColorStop(0.7, storm ? '#5a5f78' : '#bda985'); cg.addColorStop(1, '#2a241b');
      ctx.fillStyle = cg; ctx.fillRect(x - 40, 120, 80, 900);
      ctx.fillStyle = storm ? '#6f7590' : '#d8c9a6'; ctx.fillRect(x - 56, 100, 112, 34); ctx.fillRect(x - 56, 1000, 112, 40);
    });
  };
  P.drawLogo = function (ctx) {
    const img = A.image('logo'), bw = 900, bh = 180, by = 4;
    const pulse = 0.8 + 0.2 * Math.sin(this.time * 1.7);
    ctx.save();
    ctx.shadowColor = 'rgba(255,200,80,' + (0.45 * pulse) + ')'; ctx.shadowBlur = 48;
    if (img) {
      const r = Math.min(bw / img.width, bh / img.height), w = img.width * r, h = img.height * r;
      ctx.drawImage(img, W / 2 - w / 2, by + (bh - h) / 2, w, h);
    } else this.goldText(ctx, 'ZEUS', W / 2, by + bh / 2, 128, { glow: 30 * pulse });
    ctx.restore();
  };
  P.drawMeander = function (ctx, x, y, len, s, color) {
    ctx.save(); ctx.strokeStyle = color; ctx.globalAlpha = 0.5; ctx.lineWidth = Math.max(1, s * 0.16); ctx.lineCap = 'square';
    ctx.beginPath();
    const u = s * 1.6, n = Math.floor(len / u);
    for (let i = 0; i < n; i++) {
      const ox = x + i * u;
      ctx.moveTo(ox, y + s); ctx.lineTo(ox, y); ctx.lineTo(ox + u * 0.85, y); ctx.lineTo(ox + u * 0.85, y + s * 0.65);
      ctx.lineTo(ox + u * 0.35, y + s * 0.65); ctx.lineTo(ox + u * 0.35, y + s * 0.3); ctx.lineTo(ox + u * 0.6, y + s * 0.3);
    }
    ctx.stroke(); ctx.restore();
  };
  P.drawFrame = function (ctx) {
    const x = REEL.x - PAD, y = REEL.y - PAD, w = REEL.w + 2 * PAD, h = REEL.h + 2 * PAD, r = 26;
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 18; ctx.fillStyle = '#1a1206'; rr(ctx, x, y, w, h, r); ctx.fill(); ctx.restore();
    let g = ctx.createLinearGradient(0, y, 0, y + h);
    [[0, '#4a3408'], [0.08, '#d7b245'], [0.2, '#fff3bd'], [0.35, '#c99b23'], [0.6, '#6e4e0a'], [0.8, '#d4ae3b'], [0.93, '#fbe79a'], [1, '#3b2906']].forEach(s => g.addColorStop(s[0], s[1]));
    ctx.fillStyle = g; rr(ctx, x, y, w, h, r); ctx.fill();
    ctx.save(); rr(ctx, x + 9, y + 9, w - 18, h - 18, r - 8); ctx.clip(); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x, y, w, h); ctx.restore();
    this.drawMeander(ctx, x + 16, y + 10, w - 32, 10, '#fff1b0');
    this.drawMeander(ctx, x + 16, y + h - 20, w - 32, 10, '#fff1b0');
    g = ctx.createLinearGradient(0, y + 18, 0, y + h - 18); g.addColorStop(0, '#fff6cf'); g.addColorStop(0.5, '#8f6a12'); g.addColorStop(1, '#2e2004');
    ctx.fillStyle = g; rr(ctx, x + 18, y + 18, w - 36, h - 36, r - 14); ctx.fill();
    ctx.fillStyle = '#05050a'; rr(ctx, x + 24, y + 24, w - 48, h - 48, r - 18); ctx.fill();
    /* corner rosettes */
    [[x + 16, y + 16], [x + w - 16, y + 16], [x + 16, y + h - 16], [x + w - 16, y + h - 16]].forEach(p => {
      const cg = ctx.createRadialGradient(p[0] - 3, p[1] - 3, 1, p[0], p[1], 11);
      cg.addColorStop(0, '#fff7d0'); cg.addColorStop(0.6, '#c99b23'); cg.addColorStop(1, '#5a3d08');
      ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(p[0], p[1], 10, 0, 6.283); ctx.fill();
    });
  };

  /* ------------------------------------------------------------ reels */
  P.drawReels = function (ctx, now) {
    const g = this.game, noise = A.noise();
    for (let i = 0; i < REEL.cols; i++) {
      const reel = g.reels[i], rx = REEL.x + i * REEL.cellW;
      ctx.save(); ctx.beginPath(); ctx.rect(rx, REEL.y, REEL.cellW, REEL.h); ctx.clip();
      let grad = ctx.createLinearGradient(0, REEL.y, 0, REEL.y + REEL.h);
      grad.addColorStop(0, '#0b0b13'); grad.addColorStop(0.5, '#2a2a3a'); grad.addColorStop(1, '#0b0b13');
      ctx.fillStyle = grad; ctx.fillRect(rx, REEL.y, REEL.cellW, REEL.h);
      const grainA = 0.09 * (1 - Math.min(1, reel.speed / 10));
      if (grainA > 0.005) {
        ctx.globalAlpha = grainA;
        const off = ((reel.pos * REEL.cellH) % 256 + 256) % 256;
        for (let yy = REEL.y - 256 + off; yy < REEL.y + REEL.h; yy += 256) ctx.drawImage(noise, rx, yy, 256, 256);
        ctx.globalAlpha = 1;
      }
      const level = reel.speed < 5 ? 0 : reel.speed < 13 ? 1 : reel.speed < 21 ? 2 : 3;
      const kc = Math.round(reel.pos);
      for (let k = kc - 2; k <= kc + 2; k++) this.drawSymbol(ctx, reel, k, rx, level, 1);
      if (level >= 2) { ctx.fillStyle = 'rgba(0,0,0,' + (0.06 * (level - 1)) + ')'; ctx.fillRect(rx, REEL.y, REEL.cellW, REEL.h); }
      grad = ctx.createLinearGradient(0, REEL.y, 0, REEL.y + REEL.h);
      grad.addColorStop(0, 'rgba(0,0,0,0.66)'); grad.addColorStop(0.17, 'rgba(0,0,0,0)'); grad.addColorStop(0.31, 'rgba(255,255,255,0)');
      grad.addColorStop(0.37, 'rgba(255,255,255,0.075)'); grad.addColorStop(0.43, 'rgba(255,255,255,0)'); grad.addColorStop(0.83, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,0.66)');
      ctx.fillStyle = grad; ctx.fillRect(rx, REEL.y, REEL.cellW, REEL.h);
      grad = ctx.createLinearGradient(rx, 0, rx + REEL.cellW, 0);
      grad.addColorStop(0, 'rgba(0,0,0,0.4)'); grad.addColorStop(0.07, 'rgba(0,0,0,0)'); grad.addColorStop(0.93, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,0.4)');
      ctx.fillStyle = grad; ctx.fillRect(rx, REEL.y, REEL.cellW, REEL.h);
      if (this.anticipationReel === i) {
        const a = 0.55 + 0.35 * Math.sin(now * 14);
        ctx.fillStyle = 'rgba(120,170,255,' + a * 0.28 + ')'; ctx.fillRect(rx, REEL.y, REEL.cellW, REEL.h);
        ctx.save(); ctx.shadowColor = 'rgba(150,190,255,1)'; ctx.shadowBlur = 34; ctx.strokeStyle = 'rgba(200,225,255,' + a + ')'; ctx.lineWidth = 9; ctx.strokeRect(rx + 5, REEL.y + 5, REEL.cellW - 10, REEL.h - 10); ctx.restore();
        if (Math.random() < 0.25) { const side = Math.random() < 0.5 ? rx + 8 : rx + REEL.cellW - 8, y0 = REEL.y + Math.random() * REEL.h; FX.arc(side, y0, side + (Math.random() - 0.5) * 40, y0 + (Math.random() - 0.5) * 120); }
      }
      ctx.restore();
    }
    for (let i = 1; i < REEL.cols; i++) {
      const dx = REEL.x + i * REEL.cellW, grad = ctx.createLinearGradient(dx - 4, 0, dx + 4, 0);
      grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(0.3, 'rgba(0,0,0,0.85)'); grad.addColorStop(0.5, 'rgba(110,98,70,0.9)'); grad.addColorStop(0.7, 'rgba(0,0,0,0.85)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad; ctx.fillRect(dx - 4, REEL.y, 8, REEL.h);
    }
  };
  P.drawSymbol = function (ctx, reel, k, rx, level, scale) {
    const img = A.symbol(reel.symbolAt(k), level); if (!img) return;
    const u = reel.pos - k; if (Math.abs(u) > 2.1) return;
    const n = level > 0 ? 4 : 10, pad = 6;
    const dw = (REEL.cellW - 2 * pad) * (scale || 1), dx = rx + REEL.cellW / 2 - dw / 2;
    const c = REEL.cy + proj(u);
    for (let j = 0; j < n; j++) {
      const u0 = u - 0.5 + j / n, u1 = u0 + 1 / n;
      let y0 = REEL.cy + proj(u0), y1 = REEL.cy + proj(u1);
      if (scale && scale !== 1) { y0 = c + (y0 - c) * scale; y1 = c + (y1 - c) * scale; }
      if (y1 <= REEL.y - 1 || y0 >= REEL.y + REEL.h + 1) continue;
      ctx.drawImage(img, 0, j * img.height / n, img.width, img.height / n, dx, y0, dw, (y1 - y0) + 0.7);
    }
  };

  /* ------------------------------------------------------- win layer */
  P.drawWinLayer = function (ctx, now) {
    const g = this.game, pr = g.present; if (!pr) return;
    ctx.save(); ctx.beginPath(); ctx.rect(REEL.x, REEL.y, REEL.w, REEL.h); ctx.clip();
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(REEL.x, REEL.y, REEL.w, REEL.h);
    const cells = pr.mode === 'line' ? pr.lineCells : pr.cells;
    const pulse = 1 + 0.05 * Math.sin((now - pr.t0) * 7);
    cells.forEach(c => {
      const reel = g.reels[c.reel], k = Math.round(reel.pos) + 1 - c.row, rx = REEL.x + c.reel * REEL.cellW, rect = this.cellRect(c.reel, c.row);
      ctx.save();
      ctx.shadowColor = c.scatter ? 'rgba(140,190,255,0.95)' : 'rgba(255,205,80,0.95)'; ctx.shadowBlur = 28;
      ctx.lineWidth = 4; ctx.strokeStyle = c.scatter ? '#bcd8ff' : '#ffe17a';
      rr(ctx, rect.x + 5, rect.y + 5, rect.w - 10, rect.h - 10, 14); ctx.stroke();
      ctx.restore();
      this.drawSymbol(ctx, reel, k, rx, 0, pulse);
      const ph = ((now - pr.t0) * 0.8 + c.reel * 0.19) % 1.7;
      if (ph < 1) {
        ctx.save(); rr(ctx, rect.x + 8, rect.y + 8, rect.w - 16, rect.h - 16, 12); ctx.clip();
        const sx = rect.x - rect.w * 0.6 + ph * rect.w * 2.2, sg = ctx.createLinearGradient(sx, 0, sx + 90, 0);
        sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,0.22)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = sg; ctx.globalCompositeOperation = 'lighter';
        ctx.beginPath(); ctx.moveTo(sx - 60, rect.y + rect.h); ctx.lineTo(sx + 30, rect.y); ctx.lineTo(sx + 120, rect.y); ctx.lineTo(sx + 30, rect.y + rect.h); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    });
    const lines = pr.mode === 'line' ? [pr.wins[pr.idx]] : (pr.wins.length <= 8 ? pr.wins : []);
    lines.forEach((w, n) => this.drawPayline(ctx, w, pr.mode === 'line' ? 1 : 0.45, pr.mode === 'line' ? pr.idx : n));
    ctx.restore();
    if (pr.mode === 'line') this.drawLineBadge(ctx, pr.wins[pr.idx], pr.idx);
  };
  const LINE_COLORS = ['#ffd24a', '#ff8a3c', '#6ad0ff', '#c58bff', '#7cff9d', '#ff6b9a', '#ffe9a8', '#5ee6d6'];
  P.drawPayline = function (ctx, w, alpha, n) {
    const pts = w.rows.map((row, r) => { const c = this.cellRect(r, row); return { x: c.cx, y: c.cy }; });
    const hue = LINE_COLORS[n % LINE_COLORS.length];
    ctx.save(); ctx.globalAlpha = alpha; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(REEL.x, pts[0].y); pts.forEach(p => ctx.lineTo(p.x, p.y)); ctx.lineTo(REEL.x + REEL.w, pts[4].y);
    ctx.shadowColor = hue; ctx.shadowBlur = 22; ctx.strokeStyle = hue; ctx.lineWidth = 7; ctx.stroke();
    ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  };
  P.drawLineBadge = function (ctx, w, n) {
    const hue = LINE_COLORS[n % LINE_COLORS.length];
    [[REEL.x - PAD - 14, w.rows[0]], [REEL.x + REEL.w + PAD + 14, w.rows[4]]].forEach(([x, row], side) => {
      const y = this.cellRect(side ? 4 : 0, row).cy;
      ctx.save(); ctx.shadowColor = hue; ctx.shadowBlur = 16;
      const g = ctx.createRadialGradient(x - 4, y - 4, 2, x, y, 22); g.addColorStop(0, '#fff6cf'); g.addColorStop(0.5, hue); g.addColorStop(1, '#3a2a08');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 21, 0, 6.283); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = '#1a1204'; ctx.font = '900 20px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(w.line + 1), x, y + 1); ctx.restore();
    });
  };
  P.drawGlass = function (ctx) {
    ctx.save(); ctx.beginPath(); ctx.rect(REEL.x, REEL.y, REEL.w, REEL.h); ctx.clip();
    let g = ctx.createLinearGradient(REEL.x, REEL.y, REEL.x + REEL.w * 0.55, REEL.y + REEL.h);
    g.addColorStop(0, 'rgba(255,255,255,0.11)'); g.addColorStop(0.3, 'rgba(255,255,255,0.03)'); g.addColorStop(0.5, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(REEL.x, REEL.y, REEL.w, REEL.h);
    g = ctx.createLinearGradient(REEL.x + REEL.w * 0.6, REEL.y + REEL.h, REEL.x + REEL.w, REEL.y + REEL.h * 0.4);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.6, 'rgba(255,255,255,0.025)'); g.addColorStop(1, 'rgba(255,255,255,0.07)');
    ctx.fillStyle = g; ctx.fillRect(REEL.x, REEL.y, REEL.w, REEL.h);
    g = ctx.createLinearGradient(0, REEL.y, 0, REEL.y + 26); g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(REEL.x, REEL.y, REEL.w, 26);
    g = ctx.createLinearGradient(0, REEL.y + REEL.h - 26, 0, REEL.y + REEL.h); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = g; ctx.fillRect(REEL.x, REEL.y + REEL.h - 26, REEL.w, 26);
    ctx.restore();
  };

  /* --------------------------------------------------- text & overlays */
  P.goldText = function (ctx, text, x, y, size, o) {
    o = o || {}; ctx.save();
    ctx.font = (o.weight || '900') + ' ' + size + 'px ' + FONT; ctx.textAlign = o.align || 'center'; ctx.textBaseline = 'middle';
    const g = ctx.createLinearGradient(0, y - size * 0.55, 0, y + size * 0.55);
    g.addColorStop(0, '#fff6c8'); g.addColorStop(0.42, '#f8d865'); g.addColorStop(0.5, '#b8860b'); g.addColorStop(0.62, '#f5cf4a'); g.addColorStop(1, '#8a5a06');
    if (o.glow) { ctx.shadowColor = o.glowColor || 'rgba(255,200,90,0.9)'; ctx.shadowBlur = o.glow; }
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2, size * 0.08); ctx.strokeStyle = o.stroke || '#2a1a02'; ctx.strokeText(text, x, y);
    ctx.shadowBlur = 0; ctx.fillStyle = o.fill || g; ctx.fillText(text, x, y);
    ctx.restore();
  };
  P.drawMessage = function (ctx) {
    const g = this.game, y = 812;
    ctx.save(); ctx.font = '700 28px ' + FONT; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 8; ctx.fillStyle = '#ffe3a0';
    ctx.fillText(g.message || '', W / 2, y);
    if (g.fs.active) {
      ctx.font = '700 25px ' + FONT; ctx.fillStyle = '#bcd8ff';
      ctx.textAlign = 'left'; ctx.fillText('FREE SPINS LEFT  ' + g.fs.left, REEL.x - PAD, y);
      ctx.textAlign = 'right'; ctx.fillText('FEATURE WIN  ' + fmt(g.fs.win), REEL.x + REEL.w + PAD, y);
    }
    ctx.restore();
  };
  P.drawOverlay = function (ctx, now) {
    const ov = this.game.overlay; if (!ov) return;
    const t = now - ov.t0, fadeIn = Math.min(1, t / 0.35), fadeOut = ov.ending ? Math.max(0, 1 - (now - ov.endAt) / 0.4) : 1, a = fadeIn * fadeOut;
    if (a <= 0) return;
    ctx.save(); ctx.globalAlpha = a;
    if (ov.kind === 'bigwin') {
      const g = ctx.createRadialGradient(W / 2, H * 0.45, 100, W / 2, H * 0.45, 950);
      g.addColorStop(0, 'rgba(10,5,0,0.3)'); g.addColorStop(1, 'rgba(0,0,0,0.8)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const titles = ['', 'BIG WIN', 'MEGA WIN', 'EPIC WIN'], sc = easeOutBack(Math.min(1, t / 0.7));
      ctx.save(); ctx.translate(W / 2, 390); ctx.scale(sc, sc);
      this.goldText(ctx, titles[ov.tier], 0, 0, 150 + ov.tier * 12, { glow: 40 + 20 * Math.sin(now * 6) }); ctx.restore();
      this.goldText(ctx, fmt(this.game.winDisplay), W / 2, 590, 124, { glow: 25, fill: '#fff6d0', stroke: '#5a3a00' });
    } else if (ov.kind === 'feature') {
      ctx.fillStyle = 'rgba(4,6,20,0.84)'; ctx.fillRect(0, 0, W, H);
      const sc = easeOutBack(Math.min(1, t / 0.8));
      ctx.save(); ctx.translate(W / 2, 370); ctx.scale(sc, sc);
      this.goldText(ctx, ov.retrigger ? 'MORE FREE SPINS!' : 'FEATURE', 0, 0, ov.retrigger ? 110 : 140, { glow: 40 }); ctx.restore();
      if (t > 0.6) {
        const s2 = easeOutBack(Math.min(1, (t - 0.6) / 0.7));
        ctx.save(); ctx.translate(W / 2, 560); ctx.scale(s2, s2);
        this.goldText(ctx, (ov.retrigger ? '+' : '') + ov.spins + ' FREE SPINS', 0, 0, 132, { glow: 30 }); ctx.restore();
      }
      if (t > 1.4) { ctx.font = '700 30px ' + FONT; ctx.fillStyle = 'rgba(255,240,200,' + (0.55 + 0.45 * Math.sin(now * 5)) + ')'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('PRESS SPIN TO CONTINUE', W / 2, 720); }
    } else if (ov.kind === 'summary') {
      ctx.fillStyle = 'rgba(4,6,20,0.84)'; ctx.fillRect(0, 0, W, H);
      this.goldText(ctx, 'FREE SPINS COMPLETE', W / 2, 320, 92, { glow: 30 });
      ctx.font = '700 36px ' + FONT; ctx.fillStyle = '#ffe9a8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(ov.played + ' FREE SPINS PLAYED', W / 2, 420);
      this.goldText(ctx, 'YOU WON', W / 2, 510, 58, {});
      this.goldText(ctx, fmt(ov.shown || 0), W / 2, 630, 140, { glow: 30, fill: '#fff6d0', stroke: '#5a3a00' });
      if (t > 2) { ctx.font = '700 30px ' + FONT; ctx.fillStyle = 'rgba(255,240,200,' + (0.55 + 0.45 * Math.sin(now * 5)) + ')'; ctx.fillText('PRESS SPIN TO CONTINUE', W / 2, 760); }
    }
    ctx.restore();
  };

  ZEUS.Renderer = Renderer;
})(window);
