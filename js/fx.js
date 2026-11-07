/* ============================================================================
   ZEUS — visual effects: procedural lightning bolts, electric arcs, sparkles,
   coin shower (gravity particles), screen flash and camera shake.
   ========================================================================== */
(function (root) {
  'use strict';
  const ZEUS = root.ZEUS || (root.ZEUS = {});
  const FX = ZEUS.fx = { bolts: [], particles: [], flash: 0, shake: 0, time: 0 };

  function boltPath(x0, y0, x1, y1, depth, jag) {
    let pts = [{ x: x0, y: y0 }, { x: x1, y: y1 }];
    for (let d = 0; d < depth; d++) {
      const out = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1]; out.push(a);
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len, off = (Math.random() - 0.5) * len * jag;
        out.push({ x: (a.x + b.x) / 2 + nx * off, y: (a.y + b.y) / 2 + ny * off });
      }
      out.push(pts[pts.length - 1]); pts = out;
    }
    return pts;
  }
  FX.strike = function (x1, y1, o) {
    o = o || {};
    const x0 = o.x0 != null ? o.x0 : x1 + (Math.random() - 0.5) * 500, y0 = o.y0 != null ? o.y0 : -60;
    const main = boltPath(x0, y0, x1, y1, 6, 0.32), branches = [], nb = o.branches == null ? 4 : o.branches;
    for (let i = 0; i < nb; i++) {
      const idx = 2 + Math.floor(Math.random() * Math.max(1, main.length - 6)), p = main[idx];
      const ang = Math.atan2(y1 - y0, x1 - x0) + (Math.random() - 0.5) * 1.8, L = 50 + Math.random() * 170;
      branches.push(boltPath(p.x, p.y, p.x + Math.cos(ang) * L, p.y + Math.sin(ang) * L, 4, 0.45));
    }
    this.bolts.push({ main: main, branches: branches, t: 0, life: o.life || 0.3, width: o.width || 4, alpha: 1, glow: true });
    this.flash = Math.max(this.flash, o.flash == null ? 0.45 : o.flash);
    this.shake = Math.max(this.shake, o.shake == null ? 6 : o.shake);
    this.sparkle(x1, y1, 10, { color: '#cfe4ff', speed: 300 });
  };
  FX.arc = function (x0, y0, x1, y1, o) {
    this.bolts.push({ main: boltPath(x0, y0, x1, y1, 4, 0.55), branches: [], t: 0, life: (o && o.life) || 0.08, width: 1.6, alpha: 0.85, glow: false });
  };
  FX.sparkle = function (x, y, n, o) {
    o = o || {}; const sp = o.speed || 200;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = sp * (0.3 + Math.random() * 0.7);
      this.particles.push({ type: 'spark', x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: 0.5 + Math.random() * 0.5, t: 0, size: 3 + Math.random() * 5, color: o.color || '#ffe27a', g: 200, rot: Math.random() * 6.28 });
    }
  };
  FX.coins = function (n, o) {
    o = o || {};
    for (let i = 0; i < n; i++) this.particles.push({
      type: 'coin', x: o.x != null ? o.x : 160 + Math.random() * 1600, y: -40 - Math.random() * 400,
      vx: (Math.random() - 0.5) * 160, vy: 60 + Math.random() * 220, rot: Math.random() * 6.28, rv: (Math.random() - 0.5) * 12,
      spin: Math.random() * 6.28, sv: 5 + Math.random() * 9, size: 28 + Math.random() * 30, life: 7, t: 0, g: 950
    });
  };
  FX.update = function (dt) {
    this.time += dt;
    this.flash = Math.max(0, this.flash - this.flash * dt * 7 - dt * 0.2);
    this.shake = Math.max(0, this.shake - dt * 28);
    this.bolts = this.bolts.filter(b => (b.t += dt) < b.life);
    const ps = this.particles; let w = 0;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i]; p.t += dt;
      if (p.t >= p.life || p.y > 1180) continue;
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.type === 'coin') { p.rot += p.rv * dt; p.spin += p.sv * dt; }
      ps[w++] = p;
    }
    ps.length = w;
  };
  FX.drawBolts = function (ctx) {
    if (!this.bolts.length) return;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.globalCompositeOperation = 'lighter';
    this.bolts.forEach(b => {
      const u = b.t / b.life, a = b.alpha * (1 - u) * (0.75 + 0.25 * Math.random());
      const draw = (pts, wmul) => {
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        if (b.glow) {
          ctx.shadowColor = 'rgba(120,170,255,1)'; ctx.shadowBlur = 24;
          ctx.strokeStyle = 'rgba(110,160,255,' + a * 0.35 + ')'; ctx.lineWidth = b.width * 5 * wmul; ctx.stroke();
          ctx.shadowBlur = 0;
        }
        ctx.strokeStyle = 'rgba(170,205,255,' + a * 0.7 + ')'; ctx.lineWidth = b.width * 1.8 * wmul; ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,' + a + ')'; ctx.lineWidth = b.width * 0.7 * wmul; ctx.stroke();
      };
      draw(b.main, 1); b.branches.forEach(br => draw(br, 0.5));
    });
    ctx.restore();
  };
  FX.drawParticles = function (ctx) {
    if (!this.particles.length) return;
    const coin = ZEUS.assets.coin();
    ctx.save();
    this.particles.forEach(p => {
      const u = p.t / p.life;
      if (p.type === 'spark') {
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.max(0, 1 - u);
        ctx.translate(p.x, p.y); ctx.rotate(p.rot + p.t * 4); ctx.fillStyle = p.color;
        const s = p.size * (1 - u * 0.5); ctx.beginPath();
        for (let i = 0; i < 8; i++) { const r = i % 2 ? s * 0.35 : s, an = i * Math.PI / 4; ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r); }
        ctx.closePath(); ctx.fill(); ctx.restore();
      } else {
        ctx.save(); ctx.globalAlpha = u > 0.85 ? (1 - u) / 0.15 : 1;
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        const sx = Math.cos(p.spin); ctx.scale(Math.max(0.08, Math.abs(sx)), 1);
        ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 6;
        ctx.drawImage(coin, -p.size / 2, -p.size / 2, p.size, p.size);
        if (sx < 0) { ctx.fillStyle = 'rgba(80,50,0,0.25)'; ctx.beginPath(); ctx.arc(0, 0, p.size / 2 - 1, 0, 6.283); ctx.fill(); }
        ctx.restore();
      }
    });
    ctx.restore();
  };
  FX.drawFlash = function (ctx, w, h) {
    if (this.flash > 0.01) { ctx.fillStyle = 'rgba(235,240,255,' + Math.min(0.85, this.flash) + ')'; ctx.fillRect(-20, -20, w + 40, h + 40); }
  };
})(window);
