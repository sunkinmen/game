/* ParallaxBackground v7 — 插畫風視差背景（柔和配色、層次分明；所有圖像皆為原創繪製）
 *   Layer0 天空 0.02 ／ Layer1 日月雲 0.05 ／ Layer1.5 遠山 0.08 ／ Layer2 遠景城市 0.12 ／
 *   Layer3 中景街景（廟宇、騎樓店屋）0.25 ／ Layer4 前景（行道樹、灌木、路燈、電線桿）0.5 ／ Gameplay 1.0
 * 技術：
 *  - 每層預先用 Canvas2D 畫成 2 的次方尺寸的無縫貼圖（含抗鋸齒、漸層、受光/背光、彩色描邊），
 *    以 TileSprite + tilePositionX = cameraX * speed 捲動；執行時每層只有 1 個 draw call
 *  - 雲 / 燈光 / 鳥群使用固定大小物件池，modulo 環繞回收；背景只讀 camera.scrollX，不影響碰撞與鏡頭
 *  - 貼圖以關卡編號命名，換關時移除其他關的貼圖 */
(function (G) {
  'use strict';
  var SPEED = { sky: .02, sun: .05, hill: .08, far: .12, mid: .25, near: .5 };
  var TW = 1024, PAD = 16, TAU = Math.PI * 2;

  /* ---------- 小工具 ---------- */
  function rgb(n) { return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mix(a, b, t) { var A = rgb(a), B = rgb(b); return (((A[0] + (B[0] - A[0]) * t) | 0) << 16) | (((A[1] + (B[1] - A[1]) * t) | 0) << 8) | ((A[2] + (B[2] - A[2]) * t) | 0); }
  function lit(n, t) { return mix(n, 0xffffff, t); }
  function drk(n, t) { return mix(n, 0x120a24, t); }
  function css(n, a) { var c = rgb(n); return a == null || a >= 1 ? '#' + ('000000' + (n >>> 0).toString(16)).slice(-6) : 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function mod(a, n) { return ((a % n) + n) % n; }
  function box(c, x, y, w, h, col) { c.fillStyle = css(col); c.fillRect(x, y, w, h); }
  function circ(c, x, y, r, col, a) { c.fillStyle = css(col, a); c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
  function vgrad(c, y0, y1, stops) { var g = c.createLinearGradient(0, y0, 0, y1); for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], css(stops[i][1], stops[i][2])); return g; }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function stroke(c, col, lw) { c.lineWidth = lw || 1; c.strokeStyle = css(col); c.stroke(); }
  function glowAt(c, x, y, r, col, a) { var g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, css(col, a)); g.addColorStop(1, css(col, 0)); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); }
  var NEON = [0xc0392b, 0xd68910, 0x1e8449, 0x2471a3, 0x8e44ad];

  /* 各關配色（晴天、夕照、夜、雨夜、黃昏） */
  var PALS = {
    sun: { haze: 0xcfeaff, mtA: 0x86c0d4, mtB: 0x5aa583, wall: [0xf6e7c8, 0xd5ecd9, 0xf6d3d2, 0xd3e1f3], roof: 0xd0603e, accent: 0xe2574c, tree: 0x4fb35a, treeD: 0x2f8a46 },
    tree: { haze: 0xffd9b0, mtA: 0xcf94a0, mtB: 0x7d9060, wall: [0xf6dcc0, 0xeacaa8, 0xdde4b8, 0xf2c4b4], roof: 0xb8492f, accent: 0xd6442f, tree: 0x5da34a, treeD: 0x3a7a3a },
    '101': { haze: 0x5b4a8c, mtA: 0x33397a, mtB: 0x232b63, wall: [0x5a639a, 0x66589a, 0x4d5b92, 0x6a5a92], roof: 0x3b4278, accent: 0xe0584c, tree: 0x2c5e58, treeD: 0x1b3d44 },
    rain: { haze: 0x45566e, mtA: 0x31465c, mtB: 0x263647, wall: [0x5f7089, 0x566a82, 0x66778c, 0x52647c], roof: 0x35495e, accent: 0xc0504a, tree: 0x2f5a52, treeD: 0x1f423e },
    dusk: { haze: 0xe0703f, mtA: 0x86405e, mtB: 0x4e2a4c, wall: [0x86526e, 0x946072, 0x774a6c, 0x94647a], roof: 0x5c2f58, accent: 0xe8643c, tree: 0x44385e, treeD: 0x2c2444 }
  };

  /* 為保留既有關卡配置：舊版 bg() 會消耗關卡亂數 R()，這裡原樣空轉，後面的平台/方塊/波次位置才不會改變 */
  function legacyBurn(R, cf, LW, W) {
    var x, k;
    for (x = 0; x < LW * .35 + W; x += 34) { R(); if (cf.night) for (k = 0; k < 5; k++) { R(); R(); } }
    for (x = 200; x < LW; x += 330) { R(); R(); }
  }

  /* ---------- Layer0 天空 512x512（畫面 y = 貼圖 y - PAD） ---------- */
  function makeSky(c, cf, P, H, GY, rn) {
    var s0 = cf.sky[0], s1 = cf.sky[1], k = cf.k, i;
    c.fillStyle = vgrad(c, PAD, PAD + H, [[0, s0], [.55, mix(s0, s1, .72)], [1, s1]]); c.fillRect(0, 0, 512, 512);
    var hz = k === 'sun' ? [0xfff4d0, .45] : k === 'tree' ? [0xffa860, .55] : k === 'dusk' ? [0xff8a48, .5] : k === 'rain' ? [0x6a7f98, .35] : [0x9a74d8, .35];
    c.fillStyle = vgrad(c, PAD + GY - 150, PAD + GY + 10, [[0, hz[0], 0], [1, hz[0], hz[1]]]); c.fillRect(0, PAD + GY - 150, 512, 160);
    if (cf.night) {
      for (i = 0; i < 80; i++) { var sx = rn() * 512, sy = PAD + rn() * (GY - 90), r = rn() < .15 ? 1.3 : .7; circ(c, sx, sy, r, rn() < .25 ? 0xffe9b0 : 0xffffff, .5 + rn() * .5); }
      for (i = 0; i < 6; i++) { var bx = rn() * 500 + 6, by = PAD + rn() * (GY - 120); circ(c, bx, by, 1.4, 0xffffff, 1); box(c, bx - 3, by - .5, 6, 1, 0xffffff); box(c, bx - .5, by - 3, 1, 6, 0xffffff); }
      for (i = 0; i < 4; i++) glowAt(c, rn() * 512, PAD + 20 + rn() * (GY - 140), 70 + rn() * 50, k === 'dusk' ? 0xd0508a : 0x7a5cd0, .14);
    }
    if (k === 'rain') for (i = 0; i < 9; i++) { var cx = i * 64 + rn() * 30, cy = PAD + 8 + rn() * 70; glowAt(c, cx, cy, 90 + rn() * 50, 0x0c1420, .55); }
    if (k === 'tree' || k === 'dusk') for (i = 0; i < 5; i++) {
      var yy = PAD + 40 + i * 34 + rn() * 14, ww = 120 + rn() * 140, xx = rn() * 512;
      [0, -512, 512].forEach(function (o) { c.fillStyle = css(k === 'tree' ? 0xffc8a0 : 0xff9a70, .22); c.beginPath(); c.ellipse(xx + o, yy, ww, 6 + rn() * 4, 0, 0, TAU); c.fill(); });
    }
  }
  /* 太陽 / 月亮（80x80，抗鋸齒） */
  function makeSun(c, cf) {
    c.clearRect(0, 0, 80, 80);
    var k = cf.k, g;
    if (k === 'sun' || k === 'tree' || k === 'dusk') {
      var col = k === 'sun' ? [0xfffbd8, 0xffe27a] : k === 'tree' ? [0xffe2b0, 0xff9a40] : [0xffc890, 0xe0502a], r = k === 'dusk' ? 30 : 26;
      g = c.createRadialGradient(40, 40, 2, 40, 40, r); g.addColorStop(0, css(col[0])); g.addColorStop(.7, css(col[1])); g.addColorStop(1, css(col[1])); c.fillStyle = g; c.beginPath(); c.arc(40, 40, r, 0, TAU); c.fill();
      stroke(c, lit(col[1], .35), 1.2);
    } else {
      circ(c, 40, 40, 17, 0xf6f2dc); c.globalCompositeOperation = 'destination-out'; circ(c, 49, 35, 15, 0x000000); c.globalCompositeOperation = 'source-over';
      circ(c, 30, 46, 2, 0xd8d2b8, .7); circ(c, 33, 36, 1.4, 0xd8d2b8, .6);
    }
  }
  /* 蓬鬆的雲（抗鋸齒、底部帶藍紫陰影） */
  function makeCloud(c, w, h, seed) {
    var rn = mulberry(seed), n = 5 + ((rn() * 3) | 0), i, base = h - 4;
    c.clearRect(0, 0, w, h); c.fillStyle = '#fff'; c.beginPath();
    for (i = 0; i < n; i++) { var t = (i + .5) / n, r = (h * .3 + rn() * h * .28) * (1 - Math.abs(t - .5) * .9), cx = 6 + t * (w - 12); c.moveTo(cx + r, base - r * .55); c.arc(cx, base - r * .55, r, 0, TAU); }
    c.rect(8, base - 6, w - 16, 6); c.fill();
    c.globalCompositeOperation = 'source-atop';
    c.fillStyle = vgrad(c, 0, h, [[0, 0xffffff, 0], [.5, 0xdfe8f8, .25], [1, 0x9bb0dc, .8]]); c.fillRect(0, 0, w, h);
    c.fillStyle = vgrad(c, 0, h * .5, [[0, 0xffffff, .9], [1, 0xffffff, 0]]); c.fillRect(0, 0, w, h * .5);
    c.globalCompositeOperation = 'source-over';
  }
  function makeBird(c, up) { c.clearRect(0, 0, 12, 8); c.strokeStyle = '#1c1830'; c.lineWidth = 1.2; c.lineCap = 'round'; c.beginPath(); if (up) { c.moveTo(1, 1); c.quadraticCurveTo(4, 5, 6, 4); c.quadraticCurveTo(8, 5, 11, 1); } else { c.moveTo(1, 5); c.quadraticCurveTo(4, 2, 6, 4); c.quadraticCurveTo(8, 2, 11, 5); } c.stroke(); }

  /* ---------- Layer1.5 遠山 1024x256（樓底線 y=224；整數倍頻正弦疊加，左右無縫） ---------- */
  function makeHills(c, cf, P, rn) {
    var i, x, ph = [rn() * TAU, rn() * TAU, rn() * TAU, rn() * TAU];
    var back = function (x) { return 112 + 26 * Math.sin(TAU * 2 * x / TW + ph[0]) + 18 * Math.sin(TAU * 3 * x / TW + ph[1]) + 9 * Math.sin(TAU * 7 * x / TW + ph[2]) + 4 * Math.sin(TAU * 13 * x / TW + ph[3]); };
    var front = function (x) { return 58 + 15 * Math.sin(TAU * 3 * x / TW + ph[2]) + 10 * Math.sin(TAU * 5 * x / TW + ph[0]) + 6 * Math.sin(TAU * 9 * x / TW + ph[1]) + 3 * Math.sin(TAU * 17 * x / TW + ph[3]); };
    var cA = mix(P.mtA, P.haze, .2), cB = P.mtB;
    for (x = 0; x < TW; x += 2) {
      var h = back(x), sl = h - back(x - 2), col = sl > 1.6 ? lit(cA, .12) : sl < -1.6 ? drk(cA, .12) : cA;
      c.fillStyle = vgrad(c, 224 - h, 224, [[0, col], [1, mix(col, P.haze, .75)]]); c.fillRect(x, 224 - h, 2, h + 32);
    }
    for (i = 0; i < 16; i++) { var tx = (i * 64 + rn() * 40) | 0, tr = 3 + rn() * 3; circ(c, tx, 224 - back(tx) + 3, tr, mix(cA, P.treeD, .35), .75); }
    var px = 300 + (rn() * 300 | 0), py = 224 - back(px);
    box(c, px - 5, py - 7, 10, 7, drk(P.wall[0], .2)); c.fillStyle = css(P.accent); c.beginPath(); c.moveTo(px - 8, py - 7); c.lineTo(px, py - 14); c.lineTo(px + 8, py - 7); c.closePath(); c.fill();
    for (x = 0; x < TW; x += 2) {
      var f = front(x), s2 = f - front(x - 2), cc = s2 > 1.2 ? lit(cB, .14) : s2 < -1.2 ? drk(cB, .16) : cB;
      c.fillStyle = vgrad(c, 224 - f, 224, [[0, lit(cc, .08)], [1, mix(cc, P.haze, .45)]]); c.fillRect(x, 224 - f, 2, f + 32);
    }
    for (i = 0; i < 46; i++) { var fx = (rn() * TW) | 0, fy = 224 - front(fx); circ(c, fx, fy + 2 + rn() * 4, 2.5 + rn() * 3, rn() < .5 ? P.treeD : mix(P.treeD, P.tree, .5), .9); }
    c.fillStyle = vgrad(c, 120, 224, [[0, P.haze, 0], [1, P.haze, .6]]); c.fillRect(0, 120, TW, 104);
  }

  /* ---------- Layer2 遠景城市 1024x256 ---------- */
  function makeFar(c, cf, P, rn, lights) {
    var amt = cf.night ? .28 : .5, x = 0, ws = [28, 32, 36, 40, 44, 48, 56, 64];
    while (x < TW) {
      var w = ws[(rn() * 8) | 0], h = (36 + ((rn() * 120) | 0)) & ~3, base = mix(cf.bld, P.haze, amt + rn() * .08), r = rn();
      if (x + w > TW - 20) w = TW - x;
      c.fillStyle = vgrad(c, 224 - h, 224, [[0, lit(base, .14)], [1, base]]); c.fillRect(x, 224 - h, w, h + 32);
      box(c, x, 224 - h, 2, h, lit(base, .2)); box(c, x + w - 2, 224 - h, 2, h, drk(base, .18)); box(c, x, 224 - h, w, 2, lit(base, .26));
      if (r < .26 && w >= 28) { box(c, x + (w >> 1), 224 - h - 14, 2, 14, drk(base, .1)); lights.push({ x: x + (w >> 1), y: 224 - h - 16, c: 0xff3b30, kind: 'beacon', per: 1.1 + rn() * .6, ph: rn() * 6, s: 2, glow: 1 }); }
      else if (r < .5) { box(c, x + 4, 224 - h - 8, 10, 8, drk(base, .12)); box(c, x + 3, 224 - h - 9, 12, 2, drk(base, .02)); }
      for (var yy = 224 - h + 6; yy < 218; yy += 8) for (var xx = x + 4; xx < x + w - 4; xx += 8) {
        if (cf.night) { if (rn() < .22) { var warm = rn() < .82 ? 0xffd86b : 0x9fe8ff; box(c, xx, yy, 3, 3, warm); if (rn() < .08) lights.push({ x: xx + 1, y: yy + 1, c: warm, kind: 'flick', per: 1, ph: rn() * 6, s: 3 }); } }
        else if (rn() < .5) box(c, xx, yy, 2, 3, lit(base, .22));
      }
      x += w;
    }
  }

  /* ---------- Layer3 中景：廟宇 + 騎樓店屋 1024x256（樓底 y=224） ---------- */
  function drawTemple(c, x, w, cf, P, rn, lights) {
    var night = !!cf.night, cx = x + w / 2, red = night ? 0x9a2e3c : 0xc9423a, gold = 0xf2c14e, ol = 0x2a0f24, i;
    box(c, x + 6, 224 - 8, w - 12, 8, 0xb7b0a8); box(c, x + 18, 224 - 16, w - 36, 8, 0xcfc8bd); box(c, x + 18, 224 - 16, w - 36, 2, 0xe8e2d6);
    var bx = x + 34, bw = w - 68;
    c.fillStyle = vgrad(c, 224 - 72, 224 - 16, [[0, lit(red, .1)], [1, drk(red, .15)]]); c.fillRect(bx, 224 - 72, bw, 56); box(c, bx, 224 - 72, bw, 3, gold);
    for (i = 0; i < 4; i++) { var px = bx + 4 + i * ((bw - 14) / 3); box(c, px, 224 - 70, 6, 54, drk(red, .25)); box(c, px - 1, 224 - 72, 8, 4, gold); box(c, px - 1, 224 - 20, 8, 4, 0xd8d0c4); }
    rr(c, cx - 14, 224 - 56, 28, 40, 12); c.fillStyle = css(night ? 0xffb347 : 0x4a1c1a); c.fill(); stroke(c, ol, 1.2);
    if (night) { glowAt(c, cx, 224 - 38, 34, 0xffb347, .5); lights.push({ x: cx, y: 224 - 38, c: 0xffd890, kind: 'steady', per: 1, ph: rn() * 6, s: 0, glow: 2 }); }
    for (i = 0; i < 4; i++) circ(c, cx - 8 + (i % 2) * 16, 224 - 46 + ((i / 2) | 0) * 14, 1.1, gold);
    var roof = function (rx, rw, ry, th) {
      var tip = th + 12, l = rx - 12, r = rx + rw + 12;
      c.beginPath(); c.moveTo(l, ry - tip); c.quadraticCurveTo(rx + rw * .28, ry + 6, rx + rw / 2, ry + 3); c.quadraticCurveTo(rx + rw * .72, ry + 6, r, ry - tip);
      c.lineTo(r - 8, ry - tip - 7); c.quadraticCurveTo(rx + rw * .72, ry - th - 6, rx + rw / 2, ry - th - 4); c.quadraticCurveTo(rx + rw * .28, ry - th - 6, l + 8, ry - tip - 7); c.closePath();
      c.fillStyle = vgrad(c, ry - th - 8, ry + 6, [[0, lit(P.roof, .35)], [.45, P.roof], [1, drk(P.roof, .3)]]); c.fill(); stroke(c, ol, 1.2);
      c.save(); c.clip(); for (var q = 0; q < rw + 30; q += 5) { c.strokeStyle = css(drk(P.roof, .35), .55); c.lineWidth = 1; c.beginPath(); c.moveTo(l + q, ry - th - 10); c.lineTo(l + q, ry + 8); c.stroke(); } c.restore();
      c.fillStyle = css(gold); c.beginPath(); c.arc(l + 2, ry - tip - 4, 3, 0, TAU); c.arc(r - 2, ry - tip - 4, 3, 0, TAU); c.fill();
    };
    roof(x + 14, w - 28, 224 - 66, 12);
    var ux = cx - 34; box(c, ux, 224 - 108, 68, 30, drk(red, .05)); box(c, ux, 224 - 108, 68, 3, gold); box(c, ux + 20, 224 - 100, 28, 18, night ? 0xffd890 : 0xf2dca0);
    roof(ux - 8, 84, 224 - 100, 11);
    circ(c, cx, 224 - 142, 4.5, gold); stroke(c, ol, 1); box(c, cx - 1, 224 - 140, 2, 8, gold);
    for (i = 0; i < 5; i++) { var lx = x + 22 + i * ((w - 44) / 4); if (Math.abs(lx - cx) < 16) continue; c.strokeStyle = css(ol); c.lineWidth = 1; c.beginPath(); c.moveTo(lx, 224 - 66); c.lineTo(lx, 224 - 60); c.stroke(); circ(c, lx, 224 - 54, 5, 0xd9302a); stroke(c, ol, 1); box(c, lx - 3, 224 - 60, 6, 2, gold); box(c, lx - 3, 224 - 49, 6, 2, gold); if (night) { glowAt(c, lx, 224 - 54, 16, 0xff6a40, .55); lights.push({ x: lx, y: 224 - 54, c: 0xff7a4a, kind: 'steady', per: 1, ph: rn() * 6, s: 0, glow: 1.2 }); } }
  }

  function drawShop(c, x, w, h, cf, P, rn, lights) {
    var night = !!cf.night, top = 224 - h, wall = P.wall[(rn() * P.wall.length) | 0], ol = mix(wall, 0x1a0f2a, .74), i, j;
    c.fillStyle = vgrad(c, top, 224, [[0, lit(wall, .12)], [.7, wall], [1, drk(wall, .22)]]); c.fillRect(x, top, w, h + 32);
    box(c, x, top, 3, h, lit(wall, .22)); box(c, x + w - 4, top, 4, h, drk(wall, .24));
    if (rn() < .55) {
      var rh = 16; c.beginPath(); c.moveTo(x - 5, top + 2); c.lineTo(x + 8, top - rh); c.lineTo(x + w - 8, top - rh); c.lineTo(x + w + 5, top + 2); c.closePath();
      c.fillStyle = vgrad(c, top - rh, top + 2, [[0, lit(P.roof, .3)], [1, drk(P.roof, .25)]]); c.fill(); stroke(c, ol, 1.2);
      c.save(); c.clip(); for (i = top - rh + 3; i < top + 2; i += 4) { c.strokeStyle = css(drk(P.roof, .4), .5); c.beginPath(); c.moveTo(x - 6, i); c.lineTo(x + w + 6, i); c.stroke(); } c.restore();
    } else {
      box(c, x - 2, top - 6, w + 4, 6, drk(wall, .1)); box(c, x - 2, top - 6, w + 4, 2, lit(wall, .25));
      var tx = x + 12 + rn() * (w - 50); box(c, tx, top - 20, 14, 14, 0x9aa3ad); box(c, tx - 2, top - 24, 18, 4, 0x7d8690); box(c, tx + 2, top - 6, 2, 6, 0x6a737d); box(c, tx + 10, top - 6, 2, 6, 0x6a737d);
    }
    for (var fy = top + 10; fy < 224 - 66; fy += 26) {
      var n = Math.max(2, ((w - 24) / 34) | 0), gap = (w - 24 - n * 18) / (n + 1);
      for (i = 0; i < n; i++) {
        var wx = x + 12 + gap + i * (18 + gap), on = night && rn() < .5;
        rr(c, wx - 1, fy - 1, 20, 22, 2); c.fillStyle = css(drk(wall, .45)); c.fill();
        c.fillStyle = on ? vgrad(c, fy, fy + 20, [[0, 0xffe9a0], [1, 0xffb347]]) : night ? vgrad(c, fy, fy + 20, [[0, 0x35406e], [1, 0x1e2650]]) : vgrad(c, fy, fy + 20, [[0, 0xdff2ff], [1, 0x8fc0e0]]); c.fillRect(wx, fy, 18, 20);
        box(c, wx + 8, fy, 2, 20, drk(wall, .4)); box(c, wx, fy + 9, 18, 2, drk(wall, .4)); box(c, wx - 2, fy + 21, 22, 3, lit(wall, .3));
        if (on) { glowAt(c, wx + 9, fy + 10, 24, 0xffc060, .35); if (rn() < .3) lights.push({ x: wx + 9, y: fy + 10, c: 0xffd890, kind: 'flick', per: 1, ph: rn() * 6, s: 0, glow: .9 }); }
        if (rn() < .3) { circ(c, wx + 4, fy + 21, 3, P.tree); circ(c, wx + 11, fy + 20, 2.6, P.treeD); }
      }
    }
    var ah = 46, acc = NEON[(rn() * 5) | 0];
    c.fillStyle = css(drk(wall, .55)); c.fillRect(x, 224 - ah, w, ah);
    for (i = 0; i < 2; i++) {
      var sx = x + 14 + i * ((w - 40) / 2 + 6), sw = (w - 40) / 2 - 8;
      c.fillStyle = night ? vgrad(c, 224 - 36, 224, [[0, 0xffeeb8], [1, 0xffb866]]) : vgrad(c, 224 - 36, 224, [[0, 0xf4f8ff], [1, 0xbcd6ea]]); c.fillRect(sx, 224 - 36, sw, 36);
      box(c, sx, 224 - 36, sw, 2, drk(wall, .5)); for (j = 0; j < 3; j++) box(c, sx + 4 + j * (sw / 3), 224 - 14, 8, 10, [0xe2574c, 0xf2c14e, 0x4fb35a][j]);
      if (night) { glowAt(c, sx + sw / 2, 224 - 20, sw * .7, 0xffc060, .35); lights.push({ x: sx + sw / 2, y: 224 - 20, c: 0xffe0a0, kind: 'steady', per: 1, ph: rn() * 6, s: 0, glow: 1.5 }); }
    }
    [x, x + w / 2 - 4, x + w - 8].forEach(function (px) { box(c, px, 224 - ah, 8, ah, lit(wall, .08)); box(c, px, 224 - ah, 2, ah, lit(wall, .3)); box(c, px + 6, 224 - ah, 2, ah, drk(wall, .3)); });
    box(c, x - 2, 224 - ah - 8, w + 4, 8, acc); box(c, x - 2, 224 - ah - 8, w + 4, 2, lit(acc, .4)); box(c, x - 2, 224 - ah - 2, w + 4, 2, drk(acc, .35));
    var txt = G.SIGNS[(rn() * G.SIGNS.length) | 0], sc = NEON[(rn() * 5) | 0], sy = 224 - ah - 30;
    rr(c, x + 10, sy, 112, 20, 4); c.fillStyle = css(sc); c.fill(); stroke(c, ol, 1.2); box(c, x + 13, sy + 2, 106, 2, lit(sc, .35));
    c.fillStyle = '#fff'; c.font = 'bold 14px "Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 2.5; c.strokeStyle = css(drk(sc, .6)); c.strokeText(txt, x + 66, sy + 11, 100); c.fillText(txt, x + 66, sy + 11, 100);
    var vx = x + w - 28, vt = G.SIGNS[(rn() * G.SIGNS.length) | 0].slice(0, 4), vc = NEON[(rn() * 5) | 0], vh = vt.length * 15 + 8;
    rr(c, vx, top + 16, 20, vh, 3); c.fillStyle = css(vc); c.fill(); stroke(c, ol, 1.2);
    c.font = 'bold 13px "Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif'; c.fillStyle = '#fff';
    for (i = 0; i < vt.length; i++) c.fillText(vt[i], vx + 10, top + 16 + 12 + i * 15);
    if (night) { glowAt(c, vx + 10, top + 16 + vh / 2, 28, vc, .4); lights.push({ x: vx + 10, y: top + 16 + vh / 2, c: vc, kind: 'neon', per: 2 + rn(), ph: rn() * 6, s: 0, glow: 1.3 }); }
    for (i = 0; i < 3; i++) {
      var lx = x + 22 + i * ((w - 44) / 2); c.strokeStyle = css(ol); c.lineWidth = 1; c.beginPath(); c.moveTo(lx, 224 - ah); c.lineTo(lx, 224 - ah + 5); c.stroke();
      circ(c, lx, 224 - ah + 11, 5.5, 0xd9302a); stroke(c, ol, 1); box(c, lx - 3, 224 - ah + 4, 6, 2, 0xf2c14e); box(c, lx - 3, 224 - ah + 16, 6, 2, 0xf2c14e); circ(c, lx - 1.5, 224 - ah + 9, 1.6, 0xff8a70, .8);
      if (night) { glowAt(c, lx, 224 - ah + 11, 18, 0xff6a40, .5); lights.push({ x: lx, y: 224 - ah + 11, c: 0xff7a4a, kind: 'steady', per: 1, ph: rn() * 6, s: 0, glow: 1.2 }); }
    }
    box(c, x + 12, 224 - 4, w - 24, 4, drk(wall, .4));
    c.beginPath(); c.rect(x, top, w, h); stroke(c, ol, 1.2);
  }

  function makeMid(c, cf, P, rn, lights) {
    var ti = (rn() * 4) | 0, i;
    for (i = 0; i < 4; i++) {
      var x0 = i * 256;
      if (i === ti) drawTemple(c, x0 + 6, 244, cf, P, rn, lights);
      else drawShop(c, x0 + 12, 220 + ((rn() * 3) | 0) * 6, 104 + ((rn() * 4) | 0) * 10, cf, P, rn, lights);
    }
    box(c, 0, 224, TW, 32, drk(P.wall[0], .55));
  }

  /* ---------- Layer4 前景 1024x128（地面線 y=112） ---------- */
  function makeNear(c, cf, P, rn, lights) {
    var B = 112, night = !!cf.night, ol = 0x1a0f2a, i, k;
    var tree = function (x, s) {
      s = s || 1; box(c, x - 3 * s, B - 56 * s, 6 * s, 56 * s, 0x6b4a2b); box(c, x - 3 * s, B - 56 * s, 2 * s, 56 * s, 0x8a6238); box(c, x + 1 * s, B - 56 * s, 2 * s, 56 * s, 0x4c321c);
      var cr = P.tree, cd = P.treeD, cl = lit(P.tree, .3), pts = [[0, -78], [-18, -66], [18, -66], [-26, -50], [0, -56], [26, -50], [-12, -42], [14, -42]];
      pts.forEach(function (p) { circ(c, x + p[0] * s, B + p[1] * s, 18 * s, cd); });
      pts.forEach(function (p) { circ(c, x + p[0] * s - 1, B + p[1] * s - 2, 15 * s, cr); });
      pts.forEach(function (p, q) { if (q % 2 === 0) circ(c, x + p[0] * s - 5 * s, B + p[1] * s - 6 * s, 7 * s, cl, .85); });
      for (k = 0; k < 6; k++) circ(c, x + (rn() - .5) * 46 * s, B - (46 + rn() * 34) * s, 1.4, 0xffe9a0, .7);
    };
    var bush = function (x, w) {
      for (k = 0; k < w / 10; k++) circ(c, x + 6 + k * 10, B - 8, 11, P.treeD);
      for (k = 0; k < w / 10; k++) { circ(c, x + 6 + k * 10, B - 10, 9, P.tree); circ(c, x + 3 + k * 10, B - 14, 4, lit(P.tree, .3), .8); }
      for (k = 0; k < 5; k++) circ(c, x + 4 + rn() * (w - 8), B - 6 - rn() * 12, 1.6, [0xff8fb0, 0xffe066, 0xffffff][k % 3]);
    };
    var lamp = function (x) {
      box(c, x, B - 78, 3, 78, 0x3a3340); box(c, x - 1, B - 78, 1, 78, 0x5a5160); box(c, x - 6, B - 6, 15, 6, 0x3a3340);
      circ(c, x + 1.5, B - 86, 8, night ? 0xffd890 : 0xf6e6b8); stroke(c, ol, 1.2); box(c, x - 4, B - 95, 11, 3, 0xb8302a); box(c, x - 3, B - 78, 9, 2, 0xb8302a);
      lights.push({ x: x + 1.5, y: B - 86, c: 0xffe9a8, kind: night ? 'steady' : 'none', per: 1, ph: rn() * 6, s: 0, glow: 2.4 });
    };
    var scooter = function (x) {
      var bc = NEON[(rn() * 5) | 0];
      circ(c, x + 6, B - 6, 6, 0x1c1a22); circ(c, x + 30, B - 6, 6, 0x1c1a22); circ(c, x + 6, B - 6, 2.4, 0x9a98a8); circ(c, x + 30, B - 6, 2.4, 0x9a98a8);
      rr(c, x + 8, B - 17, 22, 10, 4); c.fillStyle = css(bc); c.fill(); stroke(c, ol, 1); box(c, x + 22, B - 27, 3, 14, bc); box(c, x + 18, B - 29, 10, 3, 0x20232a);
      rr(c, x + 5, B - 21, 14, 5, 2); c.fillStyle = css(0x2a2b34); c.fill(); box(c, x + 24, B - 31, 2, 6, 0xb8e0f4);
    };
    var bus = function (x) {
      box(c, x, B - 54, 66, 5, 0x44505c); box(c, x + 2, B - 50, 3, 50, 0x44505c); box(c, x + 61, B - 50, 3, 50, 0x44505c);
      c.fillStyle = vgrad(c, B - 48, B - 14, [[0, night ? 0x3a5878 : 0xcfeaf8], [1, night ? 0x28405a : 0x9ccbe0]]); c.fillRect(x + 5, B - 48, 56, 34); box(c, x + 5, B - 48, 56, 2, 0xffffff);
      rr(c, x + 46, B - 80, 14, 28, 3); c.fillStyle = css(0x2a9d8f); c.fill(); stroke(c, ol, 1); box(c, x + 49, B - 76, 8, 8, 0xffffff); box(c, x + 8, B - 16, 32, 4, 0x8a5a2b);
      if (night) lights.push({ x: x + 53, y: B - 66, c: 0xbff8ee, kind: 'steady', per: 1, ph: 0, s: 0, glow: 1.4 });
    };
    var pole = function (x) {
      box(c, x, B - 104, 5, 104, 0x4a4030); box(c, x, B - 104, 2, 104, 0x6a5e46); box(c, x - 11, B - 103, 27, 3, 0x4a4030); box(c, x - 9, B - 95, 23, 3, 0x4a4030); box(c, x - 6, B - 87, 17, 2, 0x4a4030);
      [x - 10, x - 5, x + 9, x + 14].forEach(function (ix) { box(c, ix, B - 106, 2, 3, 0xd8d4c8); });
    };
    pole(60); pole(60 + 512);
    c.strokeStyle = '#1a1626'; c.lineWidth = 1.1;
    [[-9, -97], [-4, -92], [10, -92], [15, -97]].forEach(function (o) {
      [0, -TW].forEach(function (off) { c.beginPath(); c.moveTo(60 + o[0] + off, B + o[1]); c.quadraticCurveTo(60 + 256 + off, B + o[1] + 26, 60 + 512 + o[0] + off, B + o[1]); c.quadraticCurveTo(60 + 768 + off, B + o[1] + 26, 60 + TW + o[0] + off, B + o[1]); c.stroke(); });
    });
    for (i = 0; i < 8; i++) {
      var sx = i * 128 + 8, r = rn(), px = sx + 22 + ((rn() * 50) | 0);
      if ((px > 34 && px < 96) || (px > 34 + 512 && px < 96 + 512)) { bush(sx + 66, 50); continue; }
      var wantTree = cf.k === 'tree' ? r < .5 : cf.k === 'sun' ? r < .3 : r < .16;
      if (wantTree) { tree(px, .85 + rn() * .25); if (rn() < .6) bush(px + 24, 40); }
      else if (r < .46) { lamp(px); if (rn() < .5) bush(px + 14, 36); }
      else if (r < .68) { scooter(px - 12); if (rn() < .6) scooter(px + 28); }
      else if (r < .76 && px < sx + 52) bus(px);
      else bush(px - 10, 44 + ((rn() * 3) | 0) * 10);
    }
    c.fillStyle = vgrad(c, B - 2, 128, [[0, 0x000000, .25], [1, 0x000000, .5]]); c.fillRect(0, B, TW, 16);
  }

  /* ---------- 組裝 ---------- */
  function ParallaxBackground(scene, o) { this.sc = scene; this.o = o; this.t = 0; this.birdT = 5; this.flock = null; this._build(); }
  ParallaxBackground.legacyBurn = legacyBurn;
  ParallaxBackground.SPEED = SPEED;
  var PB = ParallaxBackground.prototype;

  PB._tex = function (key, w, h, draw) {
    var T = this.sc.textures;
    if (!T.exists(key)) { var t = T.createCanvas(key, w, h); draw(t.getContext()); t.refresh(); }
    return key;
  };
  PB._build = function () {
    var s = this.sc, o = this.o, cf = Object.assign({}, o.cf), W = o.W, H = o.H, GY = o.GY, id = 'px' + o.si + '_', self = this, T = s.textures, i;
    var P = this.P = PALS[cf.k] || PALS.sun;
    T.getTextureKeys().forEach(function (k) { if (/^px\d_/.test(k) && k.indexOf(id) !== 0) T.remove(k); });
    var rn = mulberry(1000 + o.si * 97), lf = [], lm = [], ln = [];
    var add = function (k, h, y, depth) { return s.add.tileSprite(-PAD, y, W + PAD * 2, h, k).setOrigin(0, 0).setScrollFactor(0).setDepth(depth); };
    this.sky = add(this._tex(id + 'sky', 512, 512, function (c) { makeSky(c, cf, P, H, GY, rn); }), H + PAD * 2, -PAD, -30);
    this.hill = add(this._tex(id + 'hill', TW, 256, function (c) { makeHills(c, cf, P, rn); }), 256, GY - 224, -27.5);
    this.far = add(this._tex(id + 'far', TW, 256, function (c) { makeFar(c, cf, P, rn, lf); }), 256, GY - 224, -26);
    this.mid = add(this._tex(id + 'mid', TW, 256, function (c) { makeMid(c, cf, P, rn, lm); }), 256, GY - 224, -22);
    this.near = add(this._tex(id + 'near', TW, 128, function (c) { makeNear(c, cf, P, rn, ln); }), 128, GY - 112, -14);
    var sunPos = { sun: [540, 70], tree: [470, 150], dusk: [300, 190], '101': [150, 60], rain: null }[cf.k];
    this.sun = null; this.glow = null;
    if (sunPos) {
      this._tex(id + 'sun', 80, 80, function (c) { makeSun(c, cf); });
      this.sunX = sunPos[0]; this.sunY = sunPos[1];
      if (T.exists('glow')) this.glow = s.add.sprite(0, 0, 'glow').setScrollFactor(0).setDepth(-29).setBlendMode(1).setScale(cf.night ? 2.8 : 4.2).setAlpha(cf.night ? .2 : .45).setTint(cf.k === 'dusk' ? 0xff7a3a : cf.k === 'tree' ? 0xffa050 : cf.night ? 0xcfd8ff : 0xffe9a0);
      this.sun = s.add.image(0, 0, id + 'sun').setScrollFactor(0).setDepth(-28);
    }
    this.t101 = null;
    if (cf.k === '101') {
      this._tex(id + '101', 48, 256, function (c) {
        var j; for (j = 0; j < 8; j++) { var w = j % 2 ? 26 : 34, y = 232 - j * 20 - 18; c.fillStyle = vgrad(c, y, y + 18, [[0, 0x3fb0a0], [1, 0x1f7a6e]]); c.fillRect(24 - w / 2, y, w, 18); box(c, 24 - w / 2, y, w, 2, 0x8af0dc); box(c, 24 - w / 2, y + 16, w, 2, 0x155a52); }
        box(c, 11, 232, 26, 22, 0x1f7a6e); box(c, 14, 64, 20, 8, 0x2a9d8f); box(c, 22, 24, 4, 44, 0x9ff5e6); box(c, 23, 14, 2, 12, 0xffffff);
        for (j = 0; j < 8; j++) for (var q = 0; q < 6; q++) if (((j * 7 + q * 3) % 5) < 2) box(c, 12 + q * 4, 232 - j * 20 - 14, 2, 2, 0xffe9a8);
        glowAt(c, 24, 20, 14, 0xfff0b0, .6);
      });
      this.t101 = s.add.image(0, 0, id + '101').setOrigin(.5, 1).setScrollFactor(0).setDepth(-26.5);
    }
    this._tex('pxc0', 72, 26, function (c) { makeCloud(c, 72, 26, 3); });
    this._tex('pxc1', 104, 32, function (c) { makeCloud(c, 104, 32, 11); });
    this._tex('pxc2', 56, 20, function (c) { makeCloud(c, 56, 20, 29); });
    var dense = cf.k === 'rain' ? 10 : cf.night ? 6 : 8, tint = cf.k === 'rain' ? 0x6a7686 : cf.night ? 0x6a72a0 : cf.k === 'dusk' ? 0xf0a090 : cf.k === 'tree' ? 0xffd9b8 : 0xffffff;
    this.clouds = []; this.CP = W + 320;
    for (i = 0; i < dense; i++) {
      var sp = s.add.image(0, 0, 'pxc' + (i % 3)).setScrollFactor(0).setDepth(-27).setTint(tint).setScale(1 + rn() * 1.5).setAlpha(cf.night ? .6 : cf.k === 'rain' ? .88 : .95);
      this.clouds.push({ sp: sp, x0: rn() * this.CP, y: 12 + rn() * 118, v: 3 + rn() * 7 });
    }
    this.lights = [];
    var Ls = [{ list: lf, f: SPEED.far, top: GY - 224, depth: -25.5 }, { list: lm, f: SPEED.mid, top: GY - 224, depth: -21.5 }, { list: ln, f: SPEED.near, top: GY - 112, depth: -13.5 }];
    Ls.forEach(function (l) { l.list.forEach(function (d) { if (d.kind !== 'none') { d.f = l.f; d.top = l.top; d.depth = l.depth; self.lights.push(d); } }); });
    this.dots = []; this.glows = [];
    for (i = 0; i < 28; i++) this.dots.push(s.add.sprite(0, 0, 'dot').setScrollFactor(0).setVisible(false).setBlendMode(1));
    for (i = 0; i < 18; i++) this.glows.push(s.add.sprite(0, 0, 'glow').setScrollFactor(0).setVisible(false).setBlendMode(1));
    this._tex('pxb0', 12, 8, function (c) { makeBird(c, true); }); this._tex('pxb1', 12, 8, function (c) { makeBird(c, false); });
    this.birds = []; this.canBird = !cf.night && cf.k !== 'rain';
    if (this.canBird) for (i = 0; i < 5; i++) this.birds.push(s.add.image(0, 0, 'pxb0').setScrollFactor(0).setDepth(-26.8).setVisible(false));
    this.lastX = 0; this.rn = rn;
    s.events.once('shutdown', function () { self.destroy(); });
  };

  /* dt：秒；camX：cam.scrollX */
  PB.update = function (dt, camX) {
    var o = this.o, W = o.W, t = (this.t += dt), i;
    this.sky.tilePositionX = camX * SPEED.sky; this.hill.tilePositionX = camX * SPEED.hill; this.far.tilePositionX = camX * SPEED.far; this.mid.tilePositionX = camX * SPEED.mid; this.near.tilePositionX = camX * SPEED.near;
    if (this.sun) { var sx = this.sunX - camX * SPEED.sun; this.sun.setPosition(sx, this.sunY); if (this.glow) this.glow.setPosition(sx, this.sunY); }
    if (this.t101) this.t101.setPosition(470 - camX * SPEED.far, o.GY + 6);
    for (i = 0; i < this.clouds.length; i++) { var c = this.clouds[i]; c.sp.setPosition(mod(c.x0 + c.v * t - camX * SPEED.sun, this.CP) - 160, c.y); }
    var di = 0, gi = 0, L, sxl, on, a, cf = o.cf;
    for (i = 0; i < this.lights.length; i++) {
      L = this.lights[i]; sxl = mod(L.x - camX * L.f, TW); if (sxl > TW - 40) sxl -= TW; sxl -= PAD;
      if (sxl < -40 || sxl > W + 40) continue;
      a = 1;
      if (L.kind === 'beacon') a = ((t / L.per + L.ph) % 1) < .35 ? 1 : 0;
      else if (L.kind === 'flick') { on = Math.sin(t * 3.1 + L.ph) * Math.sin(t * 1.7 + L.ph * 2); a = on > -.35 ? 1 : .15; if (cf.k === 'rain') a *= (Math.sin(t * 17 + L.ph) > -.8 ? 1 : .3); }
      else if (L.kind === 'neon') a = .65 + .35 * Math.sin(t * 6.28 / L.per + L.ph);
      else a = .88 + .12 * Math.sin(t * 5 + L.ph);
      if (L.s > 0 && di < this.dots.length && a > .05) this.dots[di++].setVisible(true).setPosition(sxl, L.top + L.y).setScale(L.s / 4 * 1.2).setTint(L.c).setAlpha(a).setDepth(L.depth);
      if (L.glow && gi < this.glows.length) this.glows[gi++].setVisible(true).setPosition(sxl, L.top + L.y).setScale(L.glow).setTint(L.c).setAlpha(.5 * a).setDepth(L.depth);
    }
    for (; di < this.dots.length && this.dots[di].visible; di++) this.dots[di].setVisible(false);
    for (; gi < this.glows.length && this.glows[gi].visible; gi++) this.glows[gi].setVisible(false);
    if (this.canBird) this._birds(dt, camX);
    this.lastX = camX;
  };
  PB._birds = function (dt, camX) {
    var f = this.flock, i, b, W = this.o.W;
    if (!f) {
      this.birdT -= dt;
      if (this.birdT <= 0) {
        var dir = this.rn() < .5 ? 1 : -1, n = 3 + ((this.rn() * 3) | 0);
        f = this.flock = { dir: dir, x: dir > 0 ? -30 : W + 30, y: 30 + this.rn() * 80, v: 40 + this.rn() * 30, n: n };
        for (i = 0; i < n; i++) this.birds[i].setVisible(true).setFlipX(dir < 0);
      }
      return;
    }
    f.x += f.dir * f.v * dt - (camX - this.lastX) * SPEED.sun;
    var fr = ((this.t * 7) | 0) % 2 ? 'pxb1' : 'pxb0';
    for (i = 0; i < f.n; i++) { b = this.birds[i]; b.setTexture(fr).setPosition(f.x - f.dir * i * 14, f.y + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 5 + Math.sin(this.t * 3 + i) * 1.5); }
    if ((f.dir > 0 && f.x - f.n * 14 > W + 20) || (f.dir < 0 && f.x + f.n * 14 < -20)) {
      for (i = 0; i < this.birds.length; i++) this.birds[i].setVisible(false);
      this.flock = null; this.birdT = 8 + this.rn() * 14;
    }
  };
  PB.destroy = function () {
    if (this.dead) return; this.dead = true;
    var a = [this.sky, this.hill, this.far, this.mid, this.near, this.sun, this.glow, this.t101].concat(this.dots, this.glows, this.birds, this.clouds.map(function (c) { return c.sp; }));
    a.forEach(function (o) { if (o && o.destroy) try { o.destroy(); } catch (e) {} });
    this.clouds = this.dots = this.glows = this.birds = this.lights = [];
  };

  G.ParallaxBackground = ParallaxBackground;
})(window);
