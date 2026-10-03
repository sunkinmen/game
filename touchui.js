/* TouchUI — 虛擬按鍵的版面與繪製
 * - 只用「一個」全螢幕覆蓋 canvas（pointer-events:none），不產生任何按鍵 DOM
 * - 只有在按鍵狀態 / 版面改變時才重畫（平常 0 成本）
 * - 以 CSS px 計算，自動避開 iPhone 瀏海 / Home Indicator（safe-area）
 * - 按鍵位置、大小、透明度、間距、左右手皆來自 ControlSettings
 * - 只負責「畫」與「提供按鍵區域給 InputManager」，不處理任何事件 */
(function (G) {
  'use strict';
  var D = G.document, IM = G.InputManager, CS = G.ControlSettings;
  var LABEL = { LEFT: '◀', RIGHT: '▶', UP: '▲', JUMP: '跳', SHOOT: '射' };
  var TINT = { LEFT: '255,255,255', RIGHT: '255,255,255', UP: '255,255,255', JUMP: '110,180,255', SHOOT: '255,100,90' };

  var TouchUI = {
    cv: null, cx: null, w: 0, h: 0, dpr: 1, dirty: true, shown: false, buttons: [], _probe: null, _raf: 0, _lastW: 0, _lastH: 0,

    init: function () {
      if (this.cv) return this;
      var cv = this.cv = D.createElement('canvas');
      cv.setAttribute('aria-hidden', 'true');
      cv.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:5;touch-action:none';
      D.body.appendChild(cv);
      this.cx = cv.getContext('2d');
      var p = this._probe = D.createElement('div');                   // 讀取 safe-area-inset 用
      p.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
        'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
      D.body.appendChild(p);
      var self = this, rs = function () { self._relayoutSoon(); };
      G.addEventListener('resize', rs); G.addEventListener('orientationchange', rs);
      if (G.visualViewport) G.visualViewport.addEventListener('resize', rs);
      CS.onChange(function () { self.layout(); });
      IM.onChange(function () { self.dirty = true; self._kick(); });
      this.layout();
      return this;
    },
    _relayoutSoon: function () {                                      // iOS 旋轉後 innerWidth 會延遲更新，所以立即 + 延遲各算一次
      var self = this; this.layout(); G.setTimeout(function () { self.layout(); }, 250);
    },
    _safe: function () {
      var cs = G.getComputedStyle(this._probe);
      return { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
    },
    visible: function () { var m = CS.data.showTouchControls; return m === 'on' || (m === 'auto' && IM.touchMode); },

    layout: function () {
      var vw = G.innerWidth, vh = G.innerHeight, dpr = Math.min(2, G.devicePixelRatio || 1), cv = this.cv, S = CS.data, sf = this._safe();
      if (vw !== this._lastW || vh !== this._lastH || dpr !== this.dpr) {
        this._lastW = vw; this._lastH = vh; this.w = vw; this.h = vh; this.dpr = dpr;
        cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr);
      }
      var base = Math.max(44, Math.min(80, Math.min(vw, vh) * .17)) * S.buttonSize, r = base / 2;
      var gap = base * .16 * S.buttonSpacing, mx = Math.max(12, vw * .025), my = Math.max(10, vh * .03);
      var L = mx + sf.l, R = mx + sf.r, B = my + sf.b;
      var y0 = vh - B - r, left = S.leftHandMode, list = [], lx, rx, sx, jx;
      /* 移動區 */
      if (!left) { lx = L + r; rx = lx + base + gap; } else { rx = vw - R - r; lx = rx - base - gap; }
      var ux = (lx + rx) / 2, ur = r * .8, uy = y0 - r - ur - gap * .8;
      /* 動作區 */
      if (!left) { sx = vw - R - r; jx = sx - base - gap; } else { sx = L + r; jx = sx + base + gap; }
      list.push({ action: 'LEFT', x: lx, y: y0, r: r });
      list.push({ action: 'RIGHT', x: rx, y: y0, r: r });
      list.push({ action: 'UP', x: ux, y: uy, r: ur });
      list.push({ action: 'JUMP', x: jx, y: y0 - r * .5, r: r });
      list.push({ action: 'SHOOT', x: sx, y: y0 - r * .1, r: r * 1.08 });
      this.buttons = list;
      IM.setButtons(this.visible() ? list : []);
      this.dirty = true; this._kick();
    },

    _kick: function () { if (this._raf) return; var self = this; this._raf = G.requestAnimationFrame(function () { self._raf = 0; self.draw(); }); },

    draw: function () {
      if (!this.dirty) return; this.dirty = false;
      var c = this.cx, d = this.dpr, S = CS.data, i;
      c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.cv.width, this.cv.height);
      var vis = this.visible(); IM.setButtons(vis ? this.buttons : []);
      if (!vis) return;
      c.setTransform(d, 0, 0, d, 0, 0);
      c.textAlign = 'center'; c.textBaseline = 'middle';
      for (i = 0; i < this.buttons.length; i++) {
        var b = this.buttons[i], on = IM.touchDown(b.action), rr = b.r * (on ? .92 : 1), tn = TINT[b.action];
        var a = Math.min(1, S.buttonOpacity + (on ? .38 : 0));
        c.beginPath(); c.arc(b.x, b.y, rr, 0, 6.2832);
        c.fillStyle = 'rgba(' + tn + ',' + (a * (on ? .55 : .22)).toFixed(3) + ')'; c.fill();
        c.lineWidth = on ? 3 : 2; c.strokeStyle = 'rgba(' + tn + ',' + Math.min(1, a + .15).toFixed(3) + ')'; c.stroke();
        c.fillStyle = 'rgba(255,255,255,' + Math.min(1, a + .25).toFixed(3) + ')';
        c.font = 'bold ' + Math.round(rr * .85) + 'px sans-serif';
        c.fillText(LABEL[b.action], b.x, b.y + 1);
      }
    }
  };
  G.TouchUI = TouchUI;
})(window);
