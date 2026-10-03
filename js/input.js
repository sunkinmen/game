/* InputManager / ControlSettings — 全遊戲唯一的輸入入口
 * 動作：LEFT RIGHT JUMP SHOOT UP DOWN
 * 虛擬搖桿（左）：移動 + 八方向瞄準；右側 JUMP / SHOOT
 * 鍵盤：WASD / 方向鍵 八方向，J/X 射擊，K/空白 跳躍 */
(function (G) {
  'use strict';
  var ACTIONS = ['LEFT', 'RIGHT', 'JUMP', 'SHOOT', 'UP', 'DOWN'];
  var KEY_MAP = {
    ArrowLeft: 'LEFT', KeyA: 'LEFT', ArrowRight: 'RIGHT', KeyD: 'RIGHT',
    Space: 'JUMP', KeyK: 'JUMP', KeyJ: 'SHOOT', KeyX: 'SHOOT',
    ArrowUp: 'UP', KeyW: 'UP', ArrowDown: 'DOWN', KeyS: 'DOWN'
  };
  var KEY_ALIAS = {
    ' ': 'Space', Spacebar: 'Space', Left: 'ArrowLeft', Right: 'ArrowRight',
    Up: 'ArrowUp', Down: 'ArrowDown', a: 'KeyA', d: 'KeyD', w: 'KeyW', s: 'KeyS',
    j: 'KeyJ', k: 'KeyK', x: 'KeyX', p: 'KeyP', Esc: 'Escape'
  };

  var DEF = { buttonSize: 1, buttonOpacity: .55, buttonSpacing: 1, leftHandMode: false, rightHandMode: true, vibrationEnabled: true, showTouchControls: 'auto' };
  var RANGE = { buttonSize: [.7, 1.5], buttonOpacity: [.15, .9], buttonSpacing: [.6, 1.6] };
  var ControlSettings = {
    data: {}, _cbs: [],
    load: function () {
      var s = G.SaveManager ? SaveManager.section('controls', DEF) : DEF, k;
      for (k in DEF) this.data[k] = s[k];
      this._fix(); return this;
    },
    _fix: function () {
      var d = this.data, k;
      for (k in RANGE) { var v = +d[k]; if (!(v === v)) v = DEF[k]; d[k] = Math.min(RANGE[k][1], Math.max(RANGE[k][0], v)); }
      d.leftHandMode = !!d.leftHandMode; d.rightHandMode = !d.leftHandMode; d.vibrationEnabled = !!d.vibrationEnabled;
      if (['auto', 'on', 'off'].indexOf(d.showTouchControls) < 0) d.showTouchControls = 'auto';
    },
    get: function (k) { return this.data[k]; },
    set: function (k, v) {
      if (k === 'rightHandMode') { k = 'leftHandMode'; v = !v; }
      this.data[k] = v; this._fix();
      if (G.SaveManager) SaveManager.saveSection('controls', this.data);
      this._cbs.forEach(function (f) { try { f(); } catch (e) {} });
    },
    reset: function () { var k; for (k in DEF) this.data[k] = DEF[k]; if (G.SaveManager) SaveManager.saveSection('controls', this.data); this._cbs.forEach(function (f) { f(); }); },
    onChange: function (fn) { this._cbs.push(fn); }
  };
  ControlSettings.load();

  var IM = {
    touchMode: false,
    modal: false,
    stick: { active: false, id: null, cx: 0, cy: 0, nx: 0, ny: 0, angle: 0, mag: 0 },
    aimActive: false,
    aimAngle: 0,
    _kb: {}, _tc: {}, _kd: {}, _lp: {}, _lr: {}, _fp: {}, _fr: {}, _touch: {}, _btn: [], _ev: {}, _chg: [], _inited: false, _lastTouch: 0, _lastVib: 0,
    _joy: null,

    init: function () {
      if (this._inited) return this; this._inited = true;
      var self = this, opt = { passive: false }, w = G, i;
      for (i = 0; i < ACTIONS.length; i++) { var a = ACTIONS[i]; this._kb[a] = 0; this._tc[a] = 0; }
      this.touchMode = ('ontouchstart' in G) || (G.navigator.maxTouchPoints > 0);
      w.addEventListener('keydown', function (e) { self._key(e, true); });
      w.addEventListener('keyup', function (e) { self._key(e, false); });
      w.addEventListener('touchstart', function (e) { self._ts(e); }, opt);
      w.addEventListener('touchmove', function (e) { self._tm(e); }, opt);
      w.addEventListener('touchend', function (e) { self._te(e); }, opt);
      w.addEventListener('touchcancel', function (e) { self._te(e); }, opt);
      w.addEventListener('mousedown', function (e) { self._md(e); });
      w.addEventListener('mousemove', function (e) { self._mm(e); });
      w.addEventListener('mouseup', function (e) { self._mu(e); });
      w.addEventListener('blur', function () { self.reset(); });
      G.document.addEventListener('visibilitychange', function () { if (G.document.hidden) self.reset(); });
      ['gesturestart', 'gesturechange', 'gestureend', 'contextmenu', 'dblclick', 'selectstart'].forEach(function (ev) {
        w.addEventListener(ev, function (e) { if (!self._skip(e) && e.cancelable) e.preventDefault(); }, opt);
      });
      return this;
    },

    isDown: function (a) { return this._kb[a] > 0 || this._tc[a] > 0; },
    justPressed: function (a) { return !!this._fp[a]; },
    justReleased: function (a) { return !!this._fr[a]; },
    moveX: function () {
      if (this.stick.active && this.stick.mag > .25) return this.stick.nx;
      return (this.isDown('RIGHT') ? 1 : 0) - (this.isDown('LEFT') ? 1 : 0);
    },
    moveY: function () {
      if (this.stick.active && this.stick.mag > .25) return this.stick.ny;
      return (this.isDown('DOWN') ? 1 : 0) - (this.isDown('UP') ? 1 : 0);
    },
    /* 八方向瞄準角（弧度）；無輸入時回傳 null */
    getAim: function (faceRight) {
      if (this.stick.active && this.stick.mag > .3) {
        /* 搖桿：吸附 8 方向 */
        var a = this.stick.angle;
        var snap = Math.round(a / (Math.PI / 4)) * (Math.PI / 4);
        return snap;
      }
      var dx = (this.isDown('RIGHT') ? 1 : 0) - (this.isDown('LEFT') ? 1 : 0);
      var dy = (this.isDown('DOWN') ? 1 : 0) - (this.isDown('UP') ? 1 : 0);
      if (dx === 0 && dy === 0) return null;
      return Math.atan2(dy, dx);
    },
    frame: function () {
      var i, a, t;
      t = this._fp; this._fp = this._lp; this._lp = t;
      t = this._fr; this._fr = this._lr; this._lr = t;
      for (i = 0; i < ACTIONS.length; i++) { a = ACTIONS[i]; this._lp[a] = false; this._lr[a] = false; }
    },
    touchDown: function (a) { return this._tc[a] > 0; },
    stickState: function () { return this.stick; },

    on: function (name, fn) {
      var l = this._ev[name] || (this._ev[name] = []); l.push(fn);
      return function () { var i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); };
    },
    emit: function (name, a) { var l = this._ev[name]; if (!l) return; l = l.slice(); for (var i = 0; i < l.length; i++) try { l[i](a); } catch (e) {} },
    onChange: function (fn) { this._chg.push(fn); },
    _changed: function () { for (var i = 0; i < this._chg.length; i++) this._chg[i](); },

    setButtons: function (list) { this._btn = list || []; },
    setJoystick: function (joy) { this._joy = joy; },

    _hit: function (x, y, cur) {
      var best = null, bd = 1e9, i, b, dx, dy, r, d;
      for (i = 0; i < this._btn.length; i++) {
        b = this._btn[i]; dx = x - b.x; dy = y - b.y;
        r = b.r * (cur === b.action ? 1.4 : 1.12);
        d = Math.sqrt(dx * dx + dy * dy);
        if (d <= r && d / b.r < bd) { bd = d / b.r; best = b; }
      }
      return best;
    },
    _inJoy: function (x, y) {
      var j = this._joy; if (!j) return false;
      var dx = x - j.x, dy = y - j.y;
      return dx * dx + dy * dy <= j.r * j.r * 2.25;
    },
    _setStick: function (x, y) {
      var j = this._joy; if (!j) return;
      var dx = x - j.x, dy = y - j.y, mag = Math.sqrt(dx * dx + dy * dy), max = j.r * .85;
      if (mag > max) { dx = dx / mag * max; dy = dy / mag * max; mag = max; }
      var n = mag / max;
      this.stick.active = true;
      this.stick.cx = j.x + dx; this.stick.cy = j.y + dy;
      this.stick.nx = mag > 4 ? dx / mag : 0;
      this.stick.ny = mag > 4 ? dy / mag : 0;
      this.stick.mag = n;
      this.stick.angle = Math.atan2(this.stick.ny, this.stick.nx);
      this.aimActive = n > .3;
      this.aimAngle = this.stick.angle;
      this._changed();
    },
    _clearStick: function () {
      this.stick.active = false; this.stick.id = null;
      this.stick.nx = 0; this.stick.ny = 0; this.stick.mag = 0;
      this.aimActive = false;
      this._changed();
    },

    _skip: function (e) {
      if (this.modal) return true;
      var t = e && e.target; return !!(t && t.closest && t.closest('[data-tg-modal]'));
    },
    _touchesOn: function () {
      var m = ControlSettings.data.showTouchControls;
      return m === 'on' || (m === 'auto' && this.touchMode);
    },

    _press: function (id, a) {
      var cur = this._touch[id];
      if (cur === a) return;
      if (cur) this._release(id);
      this._touch[id] = a; this._tc[a]++; this._lp[a] = true;
      this.vibrate(10); this._changed();
    },
    _release: function (id) {
      var a = this._touch[id]; if (!a) return;
      delete this._touch[id]; if (this._tc[a] > 0) this._tc[a]--;
      this._lr[a] = true; this._changed();
    },

    _ts: function (e) {
      if (this._skip(e)) return;
      this._lastTouch = G.performance.now();
      if (!this.touchMode) { this.touchMode = true; this._changed(); }
      var ts = e.changedTouches || [], i, t, b;
      if (this._touchesOn()) for (i = 0; i < ts.length; i++) {
        t = ts[i];
        if (this._joy && this._inJoy(t.clientX, t.clientY) && !this.stick.active) {
          this.stick.id = t.identifier;
          this._setStick(t.clientX, t.clientY);
          continue;
        }
        b = this._hit(t.clientX, t.clientY, null);
        if (b) this._press(t.identifier, b.action);
      }
      if (e.cancelable) e.preventDefault();
    },
    _tm: function (e) {
      if (this._skip(e)) return;
      var ts = e.changedTouches || [], i, t, b, cur;
      for (i = 0; i < ts.length; i++) {
        t = ts[i];
        if (this.stick.active && this.stick.id === t.identifier) {
          this._setStick(t.clientX, t.clientY);
          continue;
        }
        cur = this._touch[t.identifier];
        if (!cur && !this._touchesOn()) continue;
        b = this._hit(t.clientX, t.clientY, cur);
        if (b) this._press(t.identifier, b.action); else if (cur) this._release(t.identifier);
      }
      if (e.cancelable) e.preventDefault();
    },
    _te: function (e) {
      var ts = e.changedTouches || [], i;
      for (i = 0; i < ts.length; i++) {
        if (this.stick.active && this.stick.id === ts[i].identifier) this._clearStick();
        this._release(ts[i].identifier);
      }
      this._lastTouch = G.performance.now();
      if (!this._skip(e) && e.cancelable && e.type === 'touchend') e.preventDefault();
    },

    _md: function (e) {
      if (this._skip(e) || G.performance.now() - this._lastTouch < 700 || !this._touchesOn()) return;
      if (this._joy && this._inJoy(e.clientX, e.clientY)) {
        this.stick.id = 'm'; this._setStick(e.clientX, e.clientY); return;
      }
      var b = this._hit(e.clientX, e.clientY, null); if (b) this._press('m', b.action);
    },
    _mm: function (e) {
      if (this.stick.active && this.stick.id === 'm') { this._setStick(e.clientX, e.clientY); return; }
      if (this._touch.m === undefined) return;
      var b = this._hit(e.clientX, e.clientY, this._touch.m);
      if (b) this._press('m', b.action); else this._release('m');
    },
    _mu: function () {
      if (this.stick.active && this.stick.id === 'm') this._clearStick();
      this._release('m');
    },

    _key: function (e, down) {
      var t = e.target, tag = t && t.tagName, code = e.code || e.key;
      code = KEY_ALIAS[code] || code;
      var inForm = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON';
      if (down && !e.repeat) {
        if (code === 'Escape' || code === 'KeyP') { this.emit('pause'); if (!inForm || code === 'Escape') return; }
        if (!inForm && /^(Digit|Numpad)[1-5]$/.test(code)) { this.emit('weapon', +code.slice(-1)); return; }
        if (!inForm && /^[1-5]$/.test(code)) { this.emit('weapon', +code); return; }
      }
      if (inForm || this.modal) return;
      var a = KEY_MAP[code]; if (!a) return;
      if (e.cancelable) e.preventDefault();
      if (down) { if (this._kd[code]) return; this._kd[code] = 1; this._kb[a]++; this._lp[a] = true; }
      else { if (!this._kd[code]) return; delete this._kd[code]; if (this._kb[a] > 0) this._kb[a]--; this._lr[a] = true; }
    },

    reset: function () {
      var i, a, id;
      for (id in this._touch) delete this._touch[id];
      this._kd = {};
      for (i = 0; i < ACTIONS.length; i++) { a = ACTIONS[i]; if (this._tc[a] || this._kb[a]) this._lr[a] = true; this._tc[a] = 0; this._kb[a] = 0; }
      this._clearStick();
      this._changed();
    },
    setModal: function (b) { this.modal = !!b; this.reset(); },

    vibrate: function (p) {
      if (!ControlSettings.data.vibrationEnabled || !G.navigator.vibrate) return;
      var now = G.performance.now(); if (now - this._lastVib < 25) return; this._lastVib = now;
      try { G.navigator.vibrate(p); } catch (e) {}
    }
  };

  G.InputManager = IM;
  G.ControlSettings = ControlSettings;
})(window);
