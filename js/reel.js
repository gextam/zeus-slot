/* ============================================================================
   ZEUS — reel physics.
   A reel is a continuous coordinate `pos` along an infinite strip. Symbol at
   integer coordinate k is strip[(anchorIndex + k - anchorT) mod len].
   Rendering convention: screen y of symbol k = windowCenter + (pos - k) * cell,
   so increasing pos moves symbols DOWN like a real drum. At rest, pos = T and
   rows top..bottom show strip indices S+1, S, S-1 (see config windowAt()).

   States: stopped -> windup (pull back) -> accel -> spin -> decel -> settle
   decel: constant deceleration from v0 to 0, ending `overshoot` past target
   settle: damped spring (omega, zeta) pulls the drum back onto the stop
   ========================================================================== */
(function (root) {
  'use strict';
  const ZEUS = root.ZEUS || (root.ZEUS = {});
  const mod = (a, n) => ((a % n) + n) % n;

  function Reel(index, strip, opts) {
    opts = opts || {};
    this.index = index;
    this.setStrip(strip, opts.startIndex != null ? opts.startIndex : Math.floor(Math.random() * strip.length));
    this.vmax = opts.vmax || 27;           // symbols / second
    this.accelTime = opts.accelTime || 0.45;
    this.windupTime = 0.14;
    this.windupDist = 0.2;
    this.overshoot = opts.overshoot || 0.26;
    this.omega = opts.omega || 22;
    this.zeta = opts.zeta || 0.42;
    this.state = 'stopped';
    this.vel = 0;
    this.speed = 0;                        // smoothed |vel| for motion blur
    this.stopIndex = null;
    this.fast = false;
    this.stopReady = false;
    this.onStop = null;
    this.onPass = null;
    this._lastInt = Math.floor(this.pos);
    this.landedAt = 0;
  }
  const P = Reel.prototype;

  P.setStrip = function (strip, index) {
    this.strip = strip; this.len = strip.length;
    this.anchorT = 0; this.anchorIndex = mod(index, this.len);
    this.pos = 0; this._lastInt = 0; this.target = 0;
  };
  P.symbolAt = function (k) {
    return this.strip[mod(this.anchorIndex + (k - this.anchorT), this.len)];
  };
  /* visible rows top..bottom (meaningful when stopped) */
  P.visible = function () {
    const T = Math.round(this.pos);
    return [this.symbolAt(T + 1), this.symbolAt(T), this.symbolAt(T - 1)];
  };
  P.isSpinning = function () { return this.state !== 'stopped'; };

  P.spin = function (now) {
    if (this.state !== 'stopped') return;
    this.state = 'windup'; this.t0 = now; this.p0 = this.pos;
    this.stopIndex = null; this.stopReady = false; this.fast = false;
  };
  P.requestStop = function (stopIndex, fast) {
    this.stopIndex = stopIndex; this.fast = !!fast; this.stopReady = true;
  };
  P.slam = function () { if (this.stopIndex != null) { this.fast = true; this.stopReady = this.state === 'accel' || this.state === 'spin'; } };

  P.update = function (now, dt) {
    dt = Math.min(dt, 0.05);
    switch (this.state) {
      case 'windup': {
        const u = (now - this.t0) / this.windupTime;
        if (u >= 1) { this.pos = this.p0 - this.windupDist; this.state = 'accel'; this.t0 = now; this.vel = 0; }
        else { const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; this.pos = this.p0 - this.windupDist * e; this.vel = -1; }
        break;
      }
      case 'accel': {
        const u = Math.min(1, (now - this.t0) / this.accelTime);
        this.vel = this.vmax * Math.pow(u, 1.7);
        this.pos += this.vel * dt;
        if (u >= 1) this.state = 'spin';
        if (this.stopReady && this.fast && this.vel >= 12) this._planStop(now);
        break;
      }
      case 'spin': {
        this.vel = this.vmax; this.pos += this.vel * dt;
        if (this.stopReady) this._planStop(now);
        break;
      }
      case 'decel': {
        const t = now - this.t0;
        if (t >= this.td) {
          this.pos = this.pEnd; this.vel = 0; this.state = 'settle'; this.x = this.overshoot; this.xv = 0;
          this.landedAt = now;
          if (this.onLand) this.onLand(this);
        }
        else { this.pos = this.pD + this.v0 * t - 0.5 * this.a * t * t; this.vel = this.v0 - this.a * t; }
        break;
      }
      case 'settle': {
        const k = this.omega * this.omega, c = 2 * this.zeta * this.omega, n = 4, h = dt / n;
        for (let i = 0; i < n; i++) { const acc = -k * this.x - c * this.xv; this.xv += acc * h; this.x += this.xv * h; }
        this.pos = this.target + this.x; this.vel = this.xv;
        if (Math.abs(this.x) < 0.002 && Math.abs(this.xv) < 0.02) {
          this.pos = this.target; this.vel = 0; this.state = 'stopped'; this.landedAt = now;
          if (this.onStop) this.onStop(this);
        }
        break;
      }
      default: break;
    }
    const fi = Math.floor(this.pos);
    if (fi !== this._lastInt) {
      if (this.onPass && this.state !== 'windup' && this.state !== 'settle') this.onPass(this, Math.abs(this.vel));
      this._lastInt = fi;
    }
    this.speed += (Math.abs(this.vel) - this.speed) * Math.min(1, dt * 18);
  };

  P._planStop = function (now) {
    this.stopReady = false;
    const v0 = Math.max(10, this.vel);
    const minDist = this.fast ? 1.7 : 3.6 + Math.random() * 1.0;
    const T = Math.ceil(this.pos + minDist);
    /* splice the outcome into the strip while it is a blur */
    this.anchorT = T; this.anchorIndex = mod(this.stopIndex, this.len);
    this.target = T; this.pEnd = T + this.overshoot;
    const d = this.pEnd - this.pos;
    this.td = 2 * d / v0; this.a = v0 / this.td; this.v0 = v0; this.pD = this.pos; this.t0 = now;
    this.state = 'decel';
  };

  ZEUS.Reel = Reel;
})(typeof window !== 'undefined' ? window : globalThis);
