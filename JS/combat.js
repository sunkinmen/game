/* CombatFeedback — 打擊感統一管理
 * 公開 API：playerShoot / hitEnemy / enemyDeath / playerDamage / playerDeath / pickup / dust / burst / popText / shake / trail
 * 效能設計：
 *  - 粒子、閃光、浮動文字全部用「固定大小物件池」，場景建立時一次配置，遊戲中零 new / 零 destroy / 零 tween
 *  - 粒子以 TypedArray 儲存狀態；只用既有 'dot' / 'glow' 貼圖（ADD 混合），無 CSS filter、無 DOM
 *  - 自動降載：連續偵測到 FPS 過低就降低粒子數量，穩定後再回升
 *  - 場景 shutdown 時 dispose()，不殘留引用 */
(function (G) {
  'use strict';
  var MAXP = 200, MAXF = 20, MAXN = 14, ADD = 1, NORMAL = 0;
  var SM = G.SaveManager, AM = G.AudioManager;
  var rnd = Math.random;
  var hexs = function (n) { return '#' + ('000000' + n.toString(16)).slice(-6); };

  var CF = {
    settings: { shake: 1, numbers: true, hitStop: true },
    sc: null, q: 1, recoil: 0, combo: 0, comboT: 0, hs: 0, pf: 0, _hsAt: -1e9,
    _shakeUntil: 0, _shakePow: 0, _fpsLow: 0, _fpsT: 0, _cur: 0, _fcur: 0, _ncur: 0,

    init: function (scene) {
      this.dispose();
      if (SM) { var s = SM.section('fx', this.settings); this.settings.shake = Math.max(0, Math.min(2, +s.shake)); this.settings.numbers = !!s.numbers; this.settings.hitStop = !!s.hitStop; }
      this.sc = scene; this.combo = 0; this.comboT = 0; this.recoil = 0; this.hs = 0; this.pf = 0;
      var i, s;
      this.P = { a: new Uint8Array(MAXP), x: new Float32Array(MAXP), y: new Float32Array(MAXP), vx: new Float32Array(MAXP), vy: new Float32Array(MAXP),
        life: new Float32Array(MAXP), max: new Float32Array(MAXP), sx: new Float32Array(MAXP), sy: new Float32Array(MAXP), al: new Float32Array(MAXP),
        g: new Float32Array(MAXP), dr: new Float32Array(MAXP), mode: new Uint8Array(MAXP), spr: [] };
      for (i = 0; i < MAXP; i++) { s = scene.add.sprite(0, 0, 'dot').setDepth(960).setBlendMode(ADD).setVisible(false).setActive(false); this.P.spr.push(s); }
      this.F = { a: new Uint8Array(MAXF), life: new Float32Array(MAXF), max: new Float32Array(MAXF), s0: new Float32Array(MAXF), s1: new Float32Array(MAXF), al: new Float32Array(MAXF), spr: [] };
      for (i = 0; i < MAXF; i++) { s = scene.add.sprite(0, 0, 'glow').setDepth(961).setBlendMode(ADD).setVisible(false).setActive(false); this.F.spr.push(s); }
      this.N = { a: new Uint8Array(MAXN), life: new Float32Array(MAXN), vy: new Float32Array(MAXN), s: new Float32Array(MAXN), spr: [] };
      for (i = 0; i < MAXN; i++) {
        s = scene.add.text(0, 0, '', { fontSize: '14px', color: '#ffffff', fontStyle: 'bold', stroke: '#000', strokeThickness: 3 }).setOrigin(.5).setDepth(1100).setVisible(false).setActive(false);
        this.N.spr.push(s);
      }
      this.ct = scene.add.text(scene.scale.width - 10, 52, '', { fontSize: '20px', color: '#ffdd55', fontStyle: 'bold', stroke: '#000', strokeThickness: 4 })
        .setOrigin(1, 0).setScrollFactor(0).setDepth(1000).setVisible(false);
      scene.events.once('shutdown', function () { CF.dispose(); });
      return this;
    },
    dispose: function () {
      this.sc = null; this.P = this.F = this.N = this.ct = null;
    },

    /* ---------- 基礎：粒子 ---------- */
    _emit: function (x, y, vx, vy, life, sx, sy, color, al, g, dr, mode, blend) {
      var P = this.P, i = this._cur; this._cur = (i + 1) % MAXP;
      P.a[i] = 1; P.x[i] = x; P.y[i] = y; P.vx[i] = vx; P.vy[i] = vy; P.life[i] = life; P.max[i] = life; P.sx[i] = sx; P.sy[i] = sy;
      P.al[i] = al; P.g[i] = g; P.dr[i] = dr; P.mode[i] = mode;
      P.spr[i].setActive(true).setVisible(true).setTint(color).setBlendMode(blend == null ? ADD : blend).setPosition(x, y).setScale(sx, sy).setAlpha(al).setRotation(0);
      return i;
    },
    _cnt: function (n) { return n <= 0 ? 0 : Math.max(1, Math.round(n * this.q)); },
    /* 放射狀爆裂（相容舊 scene.burst(x,y,color,n,speed)） */
    burst: function (x, y, color, n, speed, o) {
      if (!this.P) return; o = o || {};
      n = this._cnt(n); var i, a, v, ang = o.angle, spr = o.spread == null ? 6.283 : o.spread;
      for (i = 0; i < n; i++) {
        a = (ang == null ? 0 : ang) + (rnd() - .5) * spr + (ang == null ? 3.14 : 0); v = speed * (.4 + rnd() * .6);
        this._emit(x, y, Math.cos(a) * v, Math.sin(a) * v, (o.life || .3) * (.7 + rnd() * .6), (o.s || 1) * (.6 + rnd() * 1.0), (o.s || 1) * (.6 + rnd() * 1.0), color, 1, o.g || 0, o.dr == null ? 3 : o.dr, 0, o.blend);
      }
    },
    _flash: function (x, y, color, s0, s1, life, al) {
      if (!this.F) return; var F = this.F, i = this._fcur; this._fcur = (i + 1) % MAXF;
      F.a[i] = 1; F.life[i] = life; F.max[i] = life; F.s0[i] = s0; F.s1[i] = s1; F.al[i] = al == null ? 1 : al;
      F.spr[i].setActive(true).setVisible(true).setTint(color).setPosition(x, y).setScale(s0).setAlpha(F.al[i]);
    },
    /* 浮動文字（傷害、分數、COMBO）；scale 控制強調 */
    popText: function (x, y, str, color, scale) {
      if (!this.N) return; var N = this.N, i = this._ncur; this._ncur = (i + 1) % MAXN;
      N.a[i] = 1; N.life[i] = .75; N.vy[i] = -55; N.s[i] = scale || 1;
      N.spr[i].setActive(true).setVisible(true).setText(String(str)).setTint(color == null ? 0xffffff : color).setPosition(x, y).setScale((scale || 1) * 1.5).setAlpha(1);
    },
    trail: function (b) {                                          // 子彈拖尾（取代舊的每 2 幀 add.sprite + tween）
      if (!this.P) return;
      this._emit(b.x, b.y, 0, 0, .16, b.scaleX * .8, b.scaleY * .8, b.col, .6, 0, 0, 1);
      this.P.spr[(this._cur + MAXP - 1) % MAXP].setRotation(b.rotation);
    },
    dust: function (x, y) {
      if (!this.P) return; var n = this._cnt(4), i;
      for (i = 0; i < n; i++) this._emit(x + (rnd() - .5) * 10, y - 2, (rnd() - .5) * 70, -10 - rnd() * 25, .28, .7 + rnd() * .5, .7 + rnd() * .5, 0xcfd3dc, .7, 0, 2, 0, NORMAL);
    },
    pickup: function (x, y, color) {
      if (!this.P) return; this.burst(x, y, color || 0xffdd55, 6, 120, { life: .35, s: .8 }); this._flash(x, y, color || 0xffdd55, .4, 1, .18, .7);
    },

    /* ---------- 螢幕震動（可調強度、上限、不被弱震動覆蓋） ---------- */
    shake: function (intensity, ms) {
      var sc = this.sc; if (!sc) return;
      var i = Math.min(.014, intensity * this.settings.shake); if (i < .0003) return;
      var now = G.performance.now();
      if (now < this._shakeUntil && i < this._shakePow * .75) return;
      this._shakeUntil = now + ms; this._shakePow = i;
      sc.cameras.main.shake(ms, i, true);
    },
    setShakeScale: function (v) { this.settings.shake = Math.max(0, Math.min(2, +v)); this._saveFx(); },
    _saveFx: function () { if (SM) SM.saveSection('fx', this.settings); },
    setQuality: function (q) { this.q = Math.max(.3, Math.min(1, q)); },
    _stop: function (ms) {                                         // hit-stop：極短暫凍結畫面，強化打擊力道
      if (!this.settings.hitStop) return; var now = G.performance.now();
      if (now - this._hsAt < 160) return; this._hsAt = now; this.hs = Math.max(this.hs, ms / 1000);
    },
    freeze: function (dtMs) { if (this.hs > 0) { this.hs -= dtMs / 1000; return true; } return false; },

    /* ---------- 事件：玩家射擊 ---------- */
    playerShoot: function (x, y, a, cur, color) {
      if (!this.P) return;
      if (AM) AM.play('player_shoot', { variant: cur });
      this.recoil = Math.min(1, .55 + cur * .09);
      this._flash(x, y, color, .5 + cur * .18, (.5 + cur * .18) * 1.8, .09, .95);                       // 槍口閃光
      this.burst(x, y, color, 2 + cur, 220, { angle: a, spread: .7, life: .22, s: .8 });                  // 子彈生成火花
      var ca = Math.cos(a), sa = Math.sin(a), i = this._emit(x, y, ca * 40, sa * 40, .07, 5 + cur, .7, color, .9, 0, 0, 1);   // 射出方向的光條
      this.P.spr[i].setRotation(a);
      if (cur <= 3 && this._cnt(1)) this._emit(x - ca * 14, y - 4, -ca * 40 + (rnd() - .5) * 40, -110 - rnd() * 60, .45, .5, 1, 0xffd060, 1, 900, 0, 0);     // 彈殼
      if (cur >= 3) this.shake(.0015 * cur, 70);
      if (cur >= 4) G.InputManager && InputManager.vibrate(8);
    },

    /* ---------- 事件：子彈命中敵人 ---------- */
    hitEnemy: function (e, b, dmg, killed) {
      if (!this.P) return;
      var boss = e.boss, ex = e.x, ey = e.y - e.displayHeight * .5, hx = b ? b.x : ex, hy = b ? b.y : ey, col = b && b.col ? b.col : 0xffee88;
      if (AM) { AM.play('bullet_hit'); if (!killed) AM.play(boss ? 'boss_hit' : 'enemy_hit'); }
      var back = b ? Math.atan2(b.vy, b.vx) + Math.PI : -1.57;
      this._flash(hx, hy, col, .35, .9, .08, .9);                                                       // 命中閃光
      this.burst(hx, hy, col, 4 + Math.min(4, dmg | 0), 190, { angle: back, spread: 1.6, life: .26, s: .9 });   // 小型粒子爆炸
      e.flashT = .07;                                                                                    // 敵人白閃
      if (this.settings.numbers) {                                                                       // 浮動傷害數字（同一敵人 120ms 內合併）
        var now = G.performance.now(); e.dnAcc = (e.dnAcc || 0) + dmg;
        if (now - (e.dnT || 0) > 120 || killed) { this.popText(ex + (rnd() - .5) * 16, ey - 14, Math.round(e.dnAcc), e.dnAcc >= 3 ? 0xffcc33 : 0xffffff, e.dnAcc >= 7 ? 1.6 : e.dnAcc >= 3 ? 1.25 : 1); e.dnAcc = 0; e.dnT = now; }
      }
      this._combo();
      if (dmg >= 3 || boss) this.shake(boss ? .003 : .002, 90);
      if (dmg >= 7) this._stop(30);
    },
    _combo: function () {
      this.combo++; this.comboT = 1.6;
      var c = this.combo, t = this.ct; if (!t) return;
      t.setVisible(true).setText(c + ' HIT').setScale(1.5).setAlpha(1).setColor(c >= 25 ? '#ff5544' : c >= 10 ? '#ff9933' : '#ffdd55');
      if (c % 10 === 0 && this.sc) { this.sc.score += c * 5; var p = this.sc.p; this.popText(p.x, p.y - 70, 'COMBO ' + c + '!  +' + c * 5, 0xff9933, 1.4); }
    },

    /* ---------- 事件：敵人死亡 ---------- */
    enemyDeath: function (e) {
      if (!this.P) return;
      var boss = e.boss, c = e.cls, ex = e.x, ey = e.y - e.displayHeight * .5;
      if (AM) AM.play(boss ? 'boss_die' : 'enemy_die');
      this.burst(ex, ey, boss ? 0xff5533 : 0xffdd66, boss ? 40 : 12 + c * 6, boss ? 300 : 240, { life: .45 });
      this.burst(ex, ey, 0xffffff, boss ? 14 : 4, 160, { life: .3, s: .7 });
      this._flash(ex, ey, boss ? 0xff8844 : 0xffee99, .6, boss ? 4 : 1.8 + c * .4, boss ? .5 : .22, .9);
      this.popText(ex, ey - 24, '+' + e.score, 0xffdd55, boss ? 1.8 : 1.1);                             // 分數跳字
      this.shake(boss ? .012 : c >= 1 ? .004 : .0015, boss ? 400 : c >= 1 ? 120 : 70);
      this._stop(boss ? 90 : c >= 1 ? 40 : 22);
      if (boss && G.InputManager) InputManager.vibrate([30, 40, 60]);
    },

    /* ---------- 事件：玩家受傷 / 死亡 ---------- */
    playerDamage: function (src, o) {
      if (!this.P) return; o = o || {};
      var sc = this.sc, p = sc.p, px = p.x, py = p.y - 26, dir = src && src.x != null ? (px >= src.x ? 1 : -1) : -p.dir;
      if (AM && !o.lethal) AM.play('player_hurt', { vol: o.soft ? .6 : 1 });
      this.pf = .22; this.combo = 0; this.comboT = 0; if (this.ct) this.ct.setVisible(false);          // 白閃 → 紅閃
      this.burst(px, py, 0xff4433, o.soft ? 6 : 12, 220, { life: .4 });
      this.burst(px, py, 0xffffff, 4, 140, { life: .25, s: .7 });
      this._flash(px, py, 0xff5544, .5, 1.5, .15, .8);
      if (!o.pit) { sc.pkx = dir * (o.soft ? 130 : 210); if (sc.og) { p.vy = -170; sc.og = false; } }      // 擊退
      this.shake(o.lethal ? .01 : .006, o.lethal ? 300 : 180);
      this._stop(o.soft ? 25 : 50);
      this.popText(px, py - 30, '-1', 0xff5544, 1.2);
      if (G.InputManager) InputManager.vibrate(o.lethal ? [60, 40, 100] : 50);
    },
    playerDeath: function () {
      if (!this.P) return; var p = this.sc.p;
      this.burst(p.x, p.y - 26, 0xff4433, 30, 300, { life: .6 }); this.burst(p.x, p.y - 26, 0xffffff, 10, 200, { life: .4 });
    },

    /* ---------- 每幀 ---------- */
    update: function (ds) {
      if (!this.P) return;
      var P = this.P, F = this.F, N = this.N, i, s, k;
      for (i = 0; i < MAXP; i++) {
        if (!P.a[i]) continue;
        P.life[i] -= ds;
        if (P.life[i] <= 0) { P.a[i] = 0; P.spr[i].setActive(false).setVisible(false); continue; }
        if (P.dr[i]) { k = 1 - P.dr[i] * ds; if (k < 0) k = 0; P.vx[i] *= k; P.vy[i] *= k; }
        P.vy[i] += P.g[i] * ds; P.x[i] += P.vx[i] * ds; P.y[i] += P.vy[i] * ds;
        k = P.life[i] / P.max[i]; s = P.spr[i];
        s.setPosition(P.x[i], P.y[i]);
        if (P.mode[i] === 1) s.setScale(P.sx[i], P.sy[i] * k); else s.setScale(P.sx[i] * (.35 + .65 * k), P.sy[i] * (.35 + .65 * k));
        s.setAlpha(P.al[i] * k);
      }
      for (i = 0; i < MAXF; i++) {
        if (!F.a[i]) continue;
        F.life[i] -= ds;
        if (F.life[i] <= 0) { F.a[i] = 0; F.spr[i].setActive(false).setVisible(false); continue; }
        k = 1 - F.life[i] / F.max[i]; F.spr[i].setScale(F.s0[i] + (F.s1[i] - F.s0[i]) * k).setAlpha(F.al[i] * (1 - k));
      }
      for (i = 0; i < MAXN; i++) {
        if (!N.a[i]) continue;
        N.life[i] -= ds; s = N.spr[i];
        if (N.life[i] <= 0) { N.a[i] = 0; s.setActive(false).setVisible(false); continue; }
        N.vy[i] *= 1 - 3 * ds; s.y += N.vy[i] * ds;
        k = N.life[i] / .75; s.setScale(N.s[i] * (1 + Math.max(0, k - .85) * 3.3)).setAlpha(k < .35 ? k / .35 : 1);
      }
      if (this.recoil > 0) this.recoil = Math.max(0, this.recoil - ds * 6);
      if (this.comboT > 0) {
        this.comboT -= ds; var t = this.ct;
        if (t) { if (this.comboT <= 0) { this.combo = 0; t.setVisible(false); } else { var sc2 = t.scaleX > 1 ? Math.max(1, t.scaleX - ds * 4) : 1; t.setScale(sc2).setAlpha(this.comboT < .4 ? this.comboT / .4 : 1); if (this.combo < 2) t.setVisible(false); } }
      }
      if (this.pf > 0) {                                                                                 // 玩家受傷閃爍
        this.pf -= ds; var pl = this.sc.p;
        if (this.pf > .14) pl.setTintFill(0xffffff); else if (this.pf > 0) pl.setTint(0xff4444); else pl.clearTint();
      }
      this._fpsT += ds;
      if (this._fpsT >= 1) {                                                                             // 自動降載
        this._fpsT = 0; var fps = this.sc.game.loop.actualFps || 60;
        if (fps < 48) { if (++this._fpsLow >= 2) { this.setQuality(this.q - .2); this._fpsLow = 0; } } else { this._fpsLow = 0; if (fps > 56 && this.q < 1) this.setQuality(this.q + .1); }
      }
    }
  };
  G.CombatFeedback = CF;
})(window);
