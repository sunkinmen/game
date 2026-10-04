/* Hud — 遊戲介面美化（RPG 風格半透明邊框面板、愛心血量、金幣圖示、滾動分數、武器欄、Boss 血條）
 * 所有圖示在啟動時以 Canvas2D 畫一次成貼圖；之後只更新「有變化」的物件，不每幀重畫 Graphics（Boss 血條除外，僅 Boss 戰時才畫）。 */
(function (G) {
  'use strict';
  var TAU = Math.PI * 2, FONT = '"Noto Sans TC","PingFang TC","Microsoft JhengHei",system-ui,sans-serif';
  var GOLD = 'rgba(242,193,78,.95)';

  function mkTex(scene, key, w, h, fn) {
    var T = scene.textures; if (T.exists(key)) return key;
    var t = T.createCanvas(key, w, h); fn(t.getContext()); t.refresh(); return key;
  }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function panel(c, w, h, r, a) {
    rr(c, 1.5, 1.5, w - 3, h - 3, r); var g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(34,44,78,' + a + ')'); g.addColorStop(1, 'rgba(10,14,32,' + a + ')'); c.fillStyle = g; c.fill();
    c.lineWidth = 2; c.strokeStyle = GOLD; c.stroke();
    rr(c, 4, 4, w - 8, h - 8, r - 2); c.lineWidth = 1; c.strokeStyle = 'rgba(255,255,255,.18)'; c.stroke();
  }
  function heart(c, full) {
    c.clearRect(0, 0, 20, 18); c.beginPath(); c.moveTo(10, 16); c.bezierCurveTo(-3, 7, 2, -2, 10, 4.5); c.bezierCurveTo(18, -2, 23, 7, 10, 16); c.closePath();
    var g = c.createLinearGradient(0, 2, 0, 16); if (full) { g.addColorStop(0, '#ff8a9a'); g.addColorStop(1, '#d81e3c'); } else { g.addColorStop(0, '#4a4f66'); g.addColorStop(1, '#2a2e42'); }
    c.fillStyle = g; c.fill(); c.lineWidth = 1.6; c.strokeStyle = '#2a0a1e'; c.stroke();
    if (full) { c.fillStyle = 'rgba(255,255,255,.75)'; c.beginPath(); c.ellipse(5.6, 5.4, 2.2, 1.4, -.6, 0, TAU); c.fill(); }
  }
  function coin(c) {
    c.clearRect(0, 0, 16, 16); c.beginPath(); c.arc(8, 8, 6.6, 0, TAU); var g = c.createLinearGradient(2, 2, 14, 14); g.addColorStop(0, '#fff0a0'); g.addColorStop(1, '#e0a020'); c.fillStyle = g; c.fill();
    c.lineWidth = 1.4; c.strokeStyle = '#6a3a0a'; c.stroke(); c.fillStyle = 'rgba(160,90,10,.7)'; c.fillRect(7, 4, 2, 8);
  }
  function slotBg(c, sel) { rr(c, 1, 1, 38, 32, 6); var g = c.createLinearGradient(0, 0, 0, 34); g.addColorStop(0, sel ? 'rgba(70,86,140,.95)' : 'rgba(30,38,70,.85)'); g.addColorStop(1, 'rgba(8,10,24,.9)'); c.fillStyle = g; c.fill(); }
  function slotFrame(c) { rr(c, 1.5, 1.5, 37, 31, 6); c.lineWidth = 3; c.strokeStyle = '#fff'; c.stroke(); }

  var Hud = {
    create: function (scene, cb) {
      var h = { s: scene, hp: -1, coins: -1, shown: 0, pop: 0, slots: [] }, fx = function (o) { return o.setScrollFactor(0); };
      var ts = { fontFamily: FONT, fontSize: '12px', color: '#ffffff', stroke: '#0a0c12', strokeThickness: 3, resolution: 2 };
      mkTex(scene, 'hud_p1', 156, 74, function (c) { panel(c, 156, 74, 9, .72); });
      mkTex(scene, 'hud_bar', 232, 40, function (c) { panel(c, 232, 40, 10, .55); });
      mkTex(scene, 'hud_h1', 20, 18, function (c) { heart(c, true); }); mkTex(scene, 'hud_h0', 20, 18, function (c) { heart(c, false); });
      mkTex(scene, 'hud_coin', 16, 16, coin);
      mkTex(scene, 'hud_sbg', 40, 34, function (c) { slotBg(c, false); }); mkTex(scene, 'hud_sbs', 40, 34, function (c) { slotBg(c, true); }); mkTex(scene, 'hud_sfr', 40, 34, slotFrame);
      h.panel = fx(scene.add.image(4, 4, 'hud_p1')).setOrigin(0).setDepth(999);
      h.hearts = []; for (var i = 0; i < 5; i++) h.hearts.push(fx(scene.add.image(18 + i * 22, 19, 'hud_h1')).setDepth(1000));
      h.stage = fx(scene.add.text(12, 33, '', ts)).setDepth(1000);
      h.coinI = fx(scene.add.image(19, 61, 'hud_coin')).setDepth(1000);
      h.coinT = fx(scene.add.text(31, 54, '0', ts)).setDepth(1000);
      h.scoreT = fx(scene.add.text(146, 54, '', ts)).setOrigin(1, 0).setDepth(1000);
      h.buff = fx(scene.add.text(130, 11, '', { fontFamily: FONT, fontSize: '14px', resolution: 2 })).setDepth(1000);
      h.bar = fx(scene.add.image(W / 2, 24, 'hud_bar')).setDepth(999);
      for (i = 1; i <= 5; i++) {
        (function (n) {
          var x = W / 2 - 84 + (n - 1) * 42, y = 24;
          var bg = fx(scene.add.image(x, y, 'hud_sbg')).setScale(.9).setDepth(1000).setInteractive();
          var fr = fx(scene.add.image(x, y, 'hud_sfr')).setScale(.9).setDepth(1001).setTint(TC[n]);
          var ic = fx(scene.add.sprite(x, y, 'w' + n)).setScale(.8).setDepth(1002);
          bg.on('pointerdown', function () { if (cb && cb.onSlot) cb.onSlot(n); });
          h.slots.push({ bg: bg, fr: fr, ic: ic, n: n, sel: null });
        })(i);
      }
      h.bossT = fx(scene.add.text(W / 2, 62, '', { fontFamily: FONT, fontSize: '12px', color: '#ffe9a0', stroke: '#0a0c12', strokeThickness: 3, resolution: 2 })).setOrigin(.5, 0).setDepth(1000).setVisible(false);
      h.update = Hud.update.bind(null, h); h.bossBar = Hud.bossBar.bind(null, h);
      return h;
    },
    update: function (h, dt) {
      var s = h.s, i, hp = Math.max(0, s.hp);
      if (hp !== h.hp) {
        for (i = 0; i < 5; i++) h.hearts[i].setTexture(i < hp ? 'hud_h1' : 'hud_h0');
        if (h.hp >= 0) h.pop = 1; h.hp = hp;
      }
      if (h.pop > 0) { h.pop = Math.max(0, h.pop - dt * 4); var sc = 1 + .35 * h.pop; for (i = 0; i < 5; i++) h.hearts[i].setScale(sc); }
      var lowHp = hp <= 2 && hp > 0; if (lowHp) { var pu = 1 + .12 * Math.max(0, Math.sin(s.t / 160)); h.hearts[hp - 1].setScale(pu); }
      if (!h.stageSet) { h.stage.setText('第 ' + (s.si + 1) + ' 關　' + s.cf.n); h.stageSet = true; }
      if (s.coins !== h.coins) { h.coins = s.coins; h.coinT.setText('x ' + s.coins); }
      var diff = s.score - h.shown; h.shown += Math.abs(diff) < 1 ? diff : diff * Math.min(1, dt * 9);
      var v = Math.round(h.shown); if (v !== h.lastScore) { h.lastScore = v; h.scoreT.setText(String(v)); }
      var b = (s.big ? '🍄' : '') + (s.t < s.star ? '⭐' : ''); if (b !== h.lastBuff) { h.lastBuff = b; h.buff.setText(b); }
      for (i = 0; i < 5; i++) {
        var sl = h.slots[i], owned = !!s.own[sl.n], sel = s.cur === sl.n, key = (owned ? 1 : 0) + (sel ? 2 : 0);
        if (sl.sel !== key) { sl.sel = key; sl.bg.setTexture(sel ? 'hud_sbs' : 'hud_sbg').setAlpha(owned ? 1 : .35); sl.fr.setAlpha(sel ? 1 : owned ? .45 : .15).setScale(sel ? 1 : .9); sl.ic.setAlpha(owned ? 1 : .3).setScale(sel ? .92 : .8); }
      }
    },
    bossBar: function (h, gf, bo) {
      var show = !!bo; h.bossT.setVisible(show);
      if (!show) return;
      if (!h.bossName) { h.bossName = true; h.bossT.setText('小魔王：' + BOSS[h.s.si][1]); }
      var x = W / 2 - 124, y = 46, w = 248, r = Math.max(0, bo.hp / bo.mhp);
      gf.fillStyle(0x0a0c18, .85).fillRoundedRect(x, y, w, 13, 4);
      gf.fillStyle(0xb8202e, 1).fillRoundedRect(x + 2, y + 2, (w - 4) * r, 9, 3);
      gf.fillStyle(0xff7a6a, .8).fillRoundedRect(x + 2, y + 2, (w - 4) * r, 3, 2);
      gf.lineStyle(2, 0xf2c14e, .95).strokeRoundedRect(x, y, w, 13, 4);
      for (var i = 1; i < 5; i++) gf.fillStyle(0x0a0c18, .5).fillRect(x + 2 + (w - 4) * i / 5, y + 2, 1, 9);
    }
  };
  G.Hud = Hud;
})(window);
