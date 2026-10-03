/* TouchUI — 虛擬搖桿 + 動作鍵
 * 左：圓盤搖桿（移動 + 八方向瞄準）
 * 右：跳躍 / 射擊 */
(function (G) {
  'use strict';
  var D = G.document, IM = G.InputManager, CS = G.ControlSettings;
  var LABEL = { JUMP: '跳', SHOOT: '射' };
  var TINT = { JUMP: '110,180,255', SHOOT: '255,100,90' };

  var TouchUI = {
    cv: null, cx: null, w: 0, h: 0, dpr: 1, dirty: true, shown: false, buttons: [], joy: null,
    _probe: null, _raf: 0, _lastW: 0, _lastH: 0,

    init: function () {
      if (this.cv) return this;
      var cv = this.cv = D.createElement('canvas');
      cv.setAttribute('aria-hidden', 'true');
      cv.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:5;touch-action:none';
      D.body.appendChild(cv);
      this.cx = cv.getContext('2d');
      var p = this._probe = D.createElement('div');
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
    _relayoutSoon: function () {
      var self = this; this.layout(); G.setTimeout(function () { self.layout(); }, 250);
    },
    _safe: function () {
      var cs = G.getComputedStyle(this._probe);
      return { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
    },
    visible: function () { var m = CS.data.showTouchControls; return m === 'on' || (m === 'auto' && IM.touchMode); },

    layout: function () {
      var vv = G.visualViewport, vw = G.innerWidth, vh = G.innerHeight;
      if (vv && vv.width > 0 && vv.height > 0) { vw = Math.round(vv.width); vh = Math.round(vv.height); }
      var dpr = Math.min(2, G.devicePixelRatio || 1), cv = this.cv, S = CS.data, sf = this._safe();
      if (vw !== this._lastW || vh !== this._lastH || dpr !== this.dpr) {
        this._lastW = vw; this._lastH = vh; this.w = vw; this.h = vh; this.dpr = dpr;
        cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr);
      }
      var base = Math.max(48, Math.min(88, Math.min(vw, vh) * .19)) * S.buttonSize, r = base / 2;
      var gap = base * .18 * S.buttonSpacing, mx = Math.max(14, vw * .03), my = Math.max(12, vh * .035);
      var L = mx + sf.l, R = mx + sf.r, B = my + sf.b;
      var y0 = vh - B - r, left = S.leftHandMode, list = [];

      /* 虛擬搖桿 */
      var joyR = r * 1.35;
      var jx = left ? (vw - R - joyR) : (L + joyR);
      var jy = y0 - r * .15;
      this.joy = { x: jx, y: jy, r: joyR };
      IM.setJoystick(this.visible() ? this.joy : null);

      /* 動作鍵（對側） */
      var sx, jy2;
      if (!left) { sx = vw - R - r; jy2 = sx - base - gap; } else { sx = L + r; jy2 = sx + base + gap; }
      list.push({ action: 'JUMP', x: jy2, y: y0 - r * .45, r: r });
      list.push({ action: 'SHOOT', x: sx, y: y0 - r * .05, r: r * 1.12 });
      this.buttons = list;
      IM.setButtons(this.visible() ? list : []);
      this.dirty = true; this._kick();
    },

    _kick: function () { if (this._raf) return; var self = this; this._raf = G.requestAnimationFrame(function () { self._raf = 0; self.draw(); }); },

    draw: function () {
      if (!this.dirty) return; this.dirty = false;
      var c = this.cx, d = this.dpr, S = CS.data, i;
      c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.cv.width, this.cv.height);
      var vis = this.visible();
      IM.setButtons(vis ? this.buttons : []);
      IM.setJoystick(vis ? this.joy : null);
      if (!vis) return;
      c.setTransform(d, 0, 0, d, 0, 0);
      c.textAlign = 'center'; c.textBaseline = 'middle';

      /* 搖桿底座 + 方向指示 */
      if (this.joy) {
        var j = this.joy, st = IM.stickState(), a = Math.min(1, S.buttonOpacity + .1);
        c.beginPath(); c.arc(j.x, j.y, j.r, 0, 6.2832);
        c.fillStyle = 'rgba(255,255,255,' + (a * .12).toFixed(3) + ')'; c.fill();
        c.lineWidth = 2.5; c.strokeStyle = 'rgba(255,255,255,' + (a * .35).toFixed(3) + ')'; c.stroke();
        /* 八方向刻度 */
        for (i = 0; i < 8; i++) {
          var ang = i * Math.PI / 4, ir = j.r * .72, or = j.r * .88;
          c.beginPath();
          c.moveTo(j.x + Math.cos(ang) * ir, j.y + Math.sin(ang) * ir);
          c.lineTo(j.x + Math.cos(ang) * or, j.y + Math.sin(ang) * or);
          c.strokeStyle = 'rgba(255,255,255,' + (a * .2).toFixed(3) + ')'; c.lineWidth = 1.5; c.stroke();
        }
        /* 搖桿帽 */
        var kx = st.active ? st.cx : j.x, ky = st.active ? st.cy : j.y, kr = j.r * .42;
        c.beginPath(); c.arc(kx, ky, kr, 0, 6.2832);
        c.fillStyle = 'rgba(255,255,255,' + (a * (st.active ? .45 : .28)).toFixed(3) + ')'; c.fill();
        c.lineWidth = 2; c.strokeStyle = 'rgba(180,220,255,' + Math.min(1, a + .2).toFixed(3) + ')'; c.stroke();
      }

      for (i = 0; i < this.buttons.length; i++) {
        var b = this.buttons[i], on = IM.touchDown(b.action), rr = b.r * (on ? .92 : 1), tn = TINT[b.action];
        var alpha = Math.min(1, S.buttonOpacity + (on ? .38 : 0));
        c.beginPath(); c.arc(b.x, b.y, rr, 0, 6.2832);
        c.fillStyle = 'rgba(' + tn + ',' + (alpha * (on ? .55 : .22)).toFixed(3) + ')'; c.fill();
        c.lineWidth = on ? 3 : 2; c.strokeStyle = 'rgba(' + tn + ',' + Math.min(1, alpha + .15).toFixed(3) + ')'; c.stroke();
        c.fillStyle = 'rgba(255,255,255,' + Math.min(1, alpha + .25).toFixed(3) + ')';
        c.font = '700 ' + Math.round(rr * .7) + 'px "Noto Sans TC",system-ui,sans-serif';
        c.fillText(LABEL[b.action], b.x, b.y + 1);
      }
    }
  };

  G.TouchUI = TouchUI;
})(window);
