/* InputManager / ControlSettings — 全遊戲唯一的輸入入口
 * 動作（action）：LEFT RIGHT JUMP SHOOT UP(瞄準向上)
 * 來源：鍵盤、多點觸控（touchstart/move/end/cancel）、滑鼠（桌機點虛擬鍵）
 * 遊戲只查詢：isDown / justPressed / justReleased / moveX，不直接監聽任何 DOM 事件。
 * 事件：InputManager.on('pause'|'weapon', fn) → 回傳取消訂閱函式（場景 shutdown 時務必呼叫） */
(function (G) {
  'use strict';
  var ACTIONS = ['LEFT', 'RIGHT', 'JUMP', 'SHOOT', 'UP'];
  var KEY_MAP = { ArrowLeft: 'LEFT', KeyA: 'LEFT', ArrowRight: 'RIGHT', KeyD: 'RIGHT', Space: 'JUMP', KeyK: 'JUMP', KeyJ: 'SHOOT', KeyX: 'SHOOT', ArrowUp: 'UP', KeyW: 'UP' };
  var KEY_ALIAS = { ' ': 'Space', Spacebar: 'Space', Left: 'ArrowLeft', Right: 'ArrowRight', Up: 'ArrowUp', a: 'KeyA', d: 'KeyD', w: 'KeyW', j: 'KeyJ', k: 'KeyK', x: 'KeyX', p: 'KeyP', Esc: 'Escape' };

  /* ---------- ControlSettings ---------- */
  var DEF = { buttonSize: 1, buttonOpacity: .5, buttonSpacing: 1, leftHandMode: false, rightHandMode: true, vibrationEnabled: true, showTouchControls: 'auto' };
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

  /* ---------- InputManager ---------- */
  var IM = {
    touchMode: false,          // 偵測到觸控裝置 / 發生過觸控 → 顯示虛擬鍵
    modal: false,              // 設定面板開啟時暫停遊戲輸入
    _kb: {}, _tc: {}, _kd: {}, _lp: {}, _lr: {}, _fp: {}, _fr: {}, _touch: {}, _btn: [], _ev: {}, _chg: [], _inited: false, _lastTouch: 0, _lastVib: 0,

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
      /* 防止縮放 / 長按選單 / 雙擊放大 / 反白 */
      ['gesturestart', 'gesturechange', 'gestureend', 'contextmenu', 'dblclick', 'selectstart'].forEach(function (ev) {
        w.addEventListener(ev, function (e) { if (!self._skip(e) && e.cancelable) e.preventDefault(); }, opt);
      });
      return this;
    },

    /* ----- 查詢 ----- */
    isDown: function (a) { return this._kb[a] > 0 || this._tc[a] > 0; },
    justPressed: function (a) { return !!this._fp[a]; },
    justReleased: function (a) { return !!this._fr[a]; },
    moveX: function () { return (this.isDown('RIGHT') ? 1 : 0) - (this.isDown('LEFT') ? 1 : 0); },
    /* 每個 update 開頭呼叫一次：把「兩幀之間發生的按下/放開」交給這一幀（短暫點擊也不會漏） */
    frame: function () {
      var i, a, t;
      t = this._fp; this._fp = this._lp; this._lp = t;
      t = this._fr; this._fr = this._lr; this._lr = t;
      for (i = 0; i < ACTIONS.length; i++) { a = ACTIONS[i]; this._lp[a] = false; this._lr[a] = false; }
    },
    /* 觸控虛擬鍵目前是否被按住（供 UI 畫 pressed 狀態） */
    touchDown: function (a) { return this._tc[a] > 0; },

    /* ----- 事件 ----- */
    on: function (name, fn) {
      var l = this._ev[name] || (this._ev[name] = []); l.push(fn);
      return function () { var i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); };
    },
    emit: function (name, a) { var l = this._ev[name]; if (!l) return; l = l.slice(); for (var i = 0; i < l.length; i++) try { l[i](a); } catch (e) {} },
    onChange: function (fn) { this._chg.push(fn); },
    _changed: function () { for (var i = 0; i < this._chg.length; i++) this._chg[i](); },

    /* ----- 虛擬按鍵（由 TouchUI 提供，座標為 CSS px） ----- */
    setButtons: function (list) { this._btn = list || []; },
    _hit: function (x, y, cur) {
      var best = null, bd = 1e9, i, b, dx, dy, r, d;
      for (i = 0; i < this._btn.length; i++) {
        b = this._btn[i]; dx = x - b.x; dy = y - b.y;
        r = b.r * (cur === b.action ? 1.4 : 1.12);                 // 已按住的鍵給較大容錯，手指微滑不會放開
        d = Math.sqrt(dx * dx + dy * dy);
        if (d <= r && d / b.r < bd) { bd = d / b.r; best = b; }
      }
      return best;
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
      if (this._touchesOn()) for (i = 0; i < ts.length; i++) { t = ts[i]; b = this._hit(t.clientX, t.clientY, null); if (b) this._press(t.identifier, b.action); }
      if (e.cancelable) e.preventDefault();                           // 擋捲動、縮放、300ms click 延遲、長按選單
    },
    _tm: function (e) {
      if (this._skip(e)) return;
      var ts = e.changedTouches || [], i, t, b, cur;
      for (i = 0; i < ts.length; i++) {
        t = ts[i]; cur = this._touch[t.identifier];
        if (!cur && !this._touchesOn()) continue;
        b = this._hit(t.clientX, t.clientY, cur);
        if (b) this._press(t.identifier, b.action); else if (cur) this._release(t.identifier);
      }
      if (e.cancelable) e.preventDefault();
    },
    _te: function (e) {
      var ts = e.changedTouches || [], i;
      for (i = 0; i < ts.length; i++) this._release(ts[i].identifier);
      this._lastTouch = G.performance.now();
      if (!this._skip(e) && e.cancelable && e.type === 'touchend') e.preventDefault();   // 擋 iOS 雙擊放大
    },

    _md: function (e) {
      if (this._skip(e) || G.performance.now() - this._lastTouch < 700 || !this._touchesOn()) return;
      var b = this._hit(e.clientX, e.clientY, null); if (b) this._press('m', b.action);
    },
    _mm: function (e) {
      if (this._touch.m === undefined) return;
      var b = this._hit(e.clientX, e.clientY, this._touch.m);
      if (b) this._press('m', b.action); else this._release('m');
    },
    _mu: function () { this._release('m'); },

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

    /* 清空所有按住狀態（切到背景、開啟選單、失去焦點時） */
    reset: function () {
      var i, a, id;
      for (id in this._touch) delete this._touch[id];
      this._kd = {};
      for (i = 0; i < ACTIONS.length; i++) { a = ACTIONS[i]; if (this._tc[a] || this._kb[a]) this._lr[a] = true; this._tc[a] = 0; this._kb[a] = 0; }
      this._changed();
    },
    setModal: function (b) { this.modal = !!b; this.reset(); },

    /* 震動（Android Chrome；iOS Safari 無 vibrate API，自動忽略） */
    vibrate: function (p) {
      if (!ControlSettings.data.vibrationEnabled || !G.navigator.vibrate) return;
      var now = G.performance.now(); if (now - this._lastVib < 25) return; this._lastVib = now;
      try { G.navigator.vibrate(p); } catch (e) {}
    }
  };

  G.ControlSettings = ControlSettings;
  G.InputManager = IM;
})(window);
