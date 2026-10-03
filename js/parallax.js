/* ParallaxBackground — 2D 視差捲動背景（純 Canvas / Phaser，無 DOM）
 *   Layer0 天空 0.02 ／ Layer1 日月雲 0.05 ／ Layer2 遠景城市 0.12 ／ Layer3 中景街景 0.25 ／ Layer4 前景 0.5 ／ Gameplay 1.0（由場景自行繪製）
 * 做法：
 *  - 每層預先畫成「2 的次方尺寸」的 canvas 貼圖（無縫可循環），用 TileSprite + tilePositionX = cameraX * speed，
 *    因此永遠不會露出空白，也不需要逐物件更新（每層只有 1 個 draw call）
 *  - 雲 / 閃爍燈光 / 鳥群使用固定大小物件池，以 modulo 方式環繞回收，不 new、不 destroy
 *  - 背景只讀取 camera.scrollX，不影響碰撞、玩家移動與 Camera 系統
 *  - 貼圖以關卡編號命名；進入新關時移除其他關的貼圖，避免記憶體累積 */
(function (G) {
  'use strict';
  var SPEED = { sky: .02, sun: .05, far: .12, mid: .25, near: .5 };
  var TW = 1024, PAD = 16;

  function rgb(n) { return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mix(a, b, t) { var A = rgb(a), B = rgb(b); return (((A[0] + (B[0] - A[0]) * t) | 0) << 16) | (((A[1] + (B[1] - A[1]) * t) | 0) << 8) | ((A[2] + (B[2] - A[2]) * t) | 0); }
  function css(n) { return '#' + ('000000' + (n >>> 0).toString(16)).slice(-6); }
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function box(c, x, y, w, h, col) { c.fillStyle = typeof col === 'number' ? css(col) : col; c.fillRect(x | 0, y | 0, w | 0, h | 0); }
  function disc(c, cx, cy, r, col) { c.fillStyle = css(col); for (var dy = -r; dy <= r; dy++) { var hw = Math.floor(Math.sqrt(r * r - dy * dy)); c.fillRect(cx - hw, cy + dy, hw * 2 + 1, 1); } }
  function mod(a, n) { return ((a % n) + n) % n; }
  var NEON = [0xc0392b, 0xd68910, 0x1e8449, 0x2471a3, 0x8e44ad];

  /* 為保留既有關卡配置：舊版 bg() 會消耗關卡亂數 R()，新版把這些呼叫原樣空轉，後面的平台/方塊/波次位置才不會改變 */
  function legacyBurn(R, cf, LW, W) {
    var x, k, n = G.SIGNS.length;
    for (x = 0; x < LW * .35 + W; x += 34) { R(); if (cf.night) for (k = 0; k < 5; k++) { R(); R(); } }
    for (x = 200; x < LW; x += 330) { R(); R(); }
  }

  /* ---------- 貼圖產生 ---------- */
  function makeSky(c, cf, H, GY) {
    var y, t, rn = mulberry(7 + cf.n.length);
    for (y = 0; y < 512; y += 4) { t = Math.max(0, Math.min(1, (y - PAD) / H)); box(c, 0, y, 512, 4, mix(cf.sky[0], cf.sky[1], t)); }
    if (cf.k === 'dusk' || cf.k === 'tree') for (y = GY - 90; y < GY; y += 4) box(c, 0, y + PAD, 512, 4, mix(mix(cf.sky[0], cf.sky[1], (y + PAD) / H), 0xffb070, .16 + (y - GY + 90) / 90 * .2));
    if (cf.night) for (var i = 0; i < 90; i++) { var s = rn() < .15 ? 2 : 1; c.globalAlpha = .4 + rn() * .6; box(c, rn() * 510, PAD + rn() * (GY - 70), s, s, rn() < .2 ? 0xffe9b0 : 0xffffff); }
    c.globalAlpha = 1;
  }
  function makeSun(c, cf) {
    c.clearRect(0, 0, 80, 80);
    if (cf.k === 'sun') { disc(c, 40, 40, 26, 0xffe680); disc(c, 40, 40, 22, 0xfff3a0); disc(c, 40, 40, 14, 0xfffbd0); }
    else if (cf.k === 'tree') { disc(c, 40, 40, 26, 0xff9a40); disc(c, 40, 40, 22, 0xffb860); disc(c, 40, 40, 14, 0xffd890); }
    else if (cf.k === 'dusk') { disc(c, 40, 40, 30, 0xd8452a); disc(c, 40, 40, 26, 0xf2703a); disc(c, 40, 40, 18, 0xffa060); }
    else { disc(c, 40, 40, 16, 0xf4f1da); c.globalCompositeOperation = 'destination-out'; disc(c, 48, 36, 14, 0x000000); c.globalCompositeOperation = 'source-over'; }
  }
  function makeCloud(c, w, h, seed) {
    var rn = mulberry(seed), bumps = [], i, x, k, hh;
    for (i = 0; i < 4; i++) bumps.push([rn() * w, 10 + rn() * (h - 8), 10 + rn() * 16]);
    for (x = 0; x < w; x += 2) {
      hh = 0; for (k = 0; k < bumps.length; k++) { var d = (x - bumps[k][0]) / bumps[k][2]; if (abs1(d)) hh = Math.max(hh, bumps[k][1] * Math.sqrt(1 - d * d)); }
      hh = Math.max(hh | 0, x > 3 && x < w - 3 ? 4 : 0);
      box(c, x, h - hh, 2, hh, 0xffffff); box(c, x, h - Math.min(hh, 3), 2, Math.min(hh, 3), 0xc8d2e0);
    }
  }
  function abs1(d) { return d > -1 && d < 1; }
  function makeBird(c, up) { c.clearRect(0, 0, 12, 8); var col = '#151515'; box(c, 5, 3, 2, 2, col); if (up) { box(c, 2, 1, 3, 1, col); box(c, 0, 0, 2, 1, col); box(c, 7, 1, 3, 1, col); box(c, 10, 0, 2, 1, col); } else { box(c, 2, 4, 3, 1, col); box(c, 0, 5, 2, 1, col); box(c, 7, 4, 3, 1, col); box(c, 10, 5, 2, 1, col); } }

  /* 遠景城市天際線 1024x256，樓底在 y=224。回傳閃爍燈光資料 */
  function makeFar(c, cf, rn, lights, GY) {
    var haze = cf.night ? .22 : .5, col = mix(cf.bld, cf.sky[1], haze), x = 0, ws = [28, 32, 36, 40, 44, 48, 56, 64];
    while (x < TW) {
      var w = ws[(rn() * 8) | 0], h = (40 + ((rn() * 130) | 0)) & ~3, sh = mix(col, 0x000000, rn() * .14), r = rn();
      if (x + w > TW - 20) w = TW - x;
      box(c, x, 224 - h, w, h + 32, sh);
      if (r < .28 && w >= 28) { box(c, x + (w >> 1), 224 - h - 14, 2, 14, sh); lights.push({ x: x + (w >> 1), y: 224 - h - 16, c: 0xff3b30, kind: 'beacon', per: 1.1 + rn() * .6, ph: rn() * 6, s: 2 }); }
      else if (r < .5) box(c, x + 4, 224 - h - 8, 10, 8, mix(sh, 0x000000, .15));
      for (var yy = 224 - h + 6; yy < 218; yy += 8) for (var xx = x + 4; xx < x + w - 4; xx += 8) {
        if (cf.night) { if (rn() < .2) { var warm = rn() < .8 ? 0xffd86b : 0x9fe8ff; box(c, xx, yy, 3, 3, warm); if (rn() < .1) lights.push({ x: xx + 1, y: yy + 1, c: warm, kind: 'flick', per: 1, ph: rn() * 6, s: 3 }); } }
        else if (rn() < .45) box(c, xx, yy, 2, 3, mix(sh, 0xffffff, .14));
      }
      x += w;
    }
  }

  /* 中景街景 1024x256：四棟店面，樓底在 y=224。臺灣風格：招牌、直式看板、鐵窗冷氣、騎樓遮雨棚 */
  function makeMid(c, cf, rn, lights) {
    var wall0 = mix(cf.bld, cf.night ? 0x445577 : 0xffffff, cf.night ? .12 : .22), i, k;
    for (i = 0; i < 4; i++) {
      var x0 = i * 256, bw = 232, bx = x0 + 12, bh = 96 + ((rn() * 5) | 0) * 10, top = 224 - bh, wall = mix(wall0, 0x000000, rn() * .12);
      box(c, bx, top, bw, bh + 32, wall); box(c, bx - 2, top - 4, bw + 4, 4, mix(wall, 0x000000, .35));
      for (k = 0; k < 2; k++) { var ax = bx + 12 + rn() * (bw - 50); box(c, ax, top - 9, 14, 9, 0x8c929c); box(c, ax + 2, top - 7, 10, 2, 0x5c626c); }
      for (var yy = top + 10; yy < 224 - 66; yy += 22) for (var xx = bx + 10; xx < bx + bw - 24; xx += 30) {
        var lit = cf.night && rn() < .42; box(c, xx - 1, yy - 1, 18, 14, mix(wall, 0x000000, .4));
        box(c, xx, yy, 16, 12, lit ? 0xffd86b : cf.night ? 0x1c2540 : 0xa9c6dc);
        if (!lit) box(c, xx + 7, yy, 2, 12, mix(wall, 0x000000, .3)); else if (rn() < .25) lights.push({ x: xx + 8, y: yy + 6, c: 0xffd86b, kind: 'flick', per: 1, ph: rn() * 6, s: 6 });
        box(c, xx - 2, yy + 13, 20, 2, 0x6a6f78);
      }
      box(c, bx, 224 - 40, bw, 40, mix(wall, 0x000000, .28));
      var aw = NEON[(rn() * 5) | 0]; box(c, bx + 4, 224 - 46, bw - 8, 8, 0xf4ecd8);
      for (k = 0; k < bw - 8; k += 16) box(c, bx + 4 + k, 224 - 46, 8, 8, aw);
      for (k = 0; k < 2; k++) { var sx = bx + 14 + k * 108; box(c, sx, 224 - 34, 92, 34, cf.night ? 0xffe9a8 : 0xd4e6f2); box(c, sx + 44, 224 - 34, 3, 34, mix(wall, 0x000000, .4)); if (cf.night) lights.push({ x: sx + 46, y: 224 - 20, c: 0xffe9a8, kind: 'steady', per: 1, ph: rn() * 6, s: 0, glow: 1.6 }); }
      var txt = G.SIGNS[(rn() * G.SIGNS.length) | 0], sc = NEON[(rn() * 5) | 0], sy = 224 - 78;
      box(c, bx + 10, sy, 118, 20, sc); box(c, bx + 10, sy, 118, 2, mix(sc, 0xffffff, .35));
      c.fillStyle = '#fff'; c.font = 'bold 14px "PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, bx + 69, sy + 11, 110);
      var vx = bx + bw - 30, vt = G.SIGNS[(rn() * G.SIGNS.length) | 0].slice(0, 4), vc = NEON[(rn() * 5) | 0];
      box(c, vx, top + 14, 20, vt.length * 15 + 6, vc); c.font = 'bold 13px "PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif'; c.fillStyle = '#fff';
      for (k = 0; k < vt.length; k++) c.fillText(vt[k], vx + 10, top + 14 + 11 + k * 15);
      if (cf.night) lights.push({ x: vx + 10, y: top + 14 + (vt.length * 15 + 6) / 2, c: vc, kind: 'neon', per: 2 + rn(), ph: rn() * 6, s: 0, glow: 1.4 });
      lights.push({ x: x0 + 6, y: 224 - 64, c: 0xffe0a0, kind: cf.night ? 'steady' : 'none', per: 1, ph: rn() * 6, s: 0, glow: 1.2 });
      box(c, x0 + 5, 224 - 62, 2, 62, 0x2a2d36); box(c, x0 + 3, 224 - 66, 7, 3, 0x2a2d36);
    }
    box(c, 0, 224, TW, 32, mix(wall0, 0x000000, .5));
  }

  /* 前景 1024x128，地面在 y=112：電線桿+電線、路燈、行道樹、機車、公車亭、垃圾桶、盆栽 */
  function makeNear(c, cf, rn, lights) {
    var B = 112, dark = mix(cf.ground, 0x000000, .35), i, k;
    var wire = function (x1, x2) {
      c.fillStyle = '#16181e'; for (var wy = 0; wy < 3; wy++) for (var xx = x1; xx < x2; xx += 2) {
        var u = (xx - x1) / (x2 - x1); box(c, xx, B - 98 + wy * 5 + Math.sin(u * Math.PI) * 9, 2, 1, '#16181e');
      }
    };
    var pole = function (x) { box(c, x, B - 100, 4, 100, 0x3a3326); box(c, x - 10, B - 100, 24, 3, 0x3a3326); box(c, x - 8, B - 93, 20, 3, 0x3a3326); box(c, x - 6, B - 86, 16, 2, 0x3a3326); };
    var tree = function (x) { box(c, x - 3, B - 54, 7, 54, 0x6b4a2b); var cr = cf.night ? 0x16402a : 0x2e8b3a, cl = cf.night ? 0x1d5535 : 0x46b04f;
      box(c, x - 22, B - 100, 44, 14, cr); box(c, x - 30, B - 90, 60, 22, cr); box(c, x - 24, B - 70, 48, 14, cr); box(c, x - 14, B - 100, 18, 6, cl); box(c, x - 24, B - 88, 12, 6, cl); };
    var lamp = function (x) { box(c, x, B - 86, 3, 86, dark); box(c, x, B - 88, 16, 3, dark); box(c, x + 12, B - 86, 8, 4, 0xd8d8c0);
      lights.push({ x: x + 16, y: B - 83, c: 0xffe9a8, kind: cf.night ? 'steady' : 'none', per: 1, ph: rn() * 6, s: 3, glow: 2.2 }); };
    var scooter = function (x) { var bc = NEON[(rn() * 5) | 0];
      disc(c, x + 5, B - 5, 5, 0x15171c); disc(c, x + 29, B - 5, 5, 0x15171c); box(c, x + 8, B - 14, 20, 8, bc); box(c, x + 22, B - 24, 3, 12, bc); box(c, x + 18, B - 26, 10, 3, 0x20232a); box(c, x + 6, B - 18, 14, 4, 0x20232a); box(c, x + 24, B - 28, 2, 7, 0x9fd4ee); };
    var bus = function (x) { box(c, x, B - 52, 64, 4, dark); box(c, x + 2, B - 48, 3, 48, dark); box(c, x + 59, B - 48, 3, 48, dark);
      box(c, x + 5, B - 46, 54, 34, cf.night ? 0x28405a : 0x9ccbe0); box(c, x + 48, B - 74, 12, 22, 0x2a9d8f); box(c, x + 50, B - 70, 8, 6, 0xffffff); box(c, x + 8, B - 14, 30, 4, 0x6a4a2b); };
    var bin = function (x) { box(c, x, B - 16, 12, 16, 0x4a5a4a); box(c, x - 1, B - 18, 14, 3, 0x354035); };
    var plant = function (x) { box(c, x, B - 10, 12, 10, 0xa0522d); box(c, x - 4, B - 24, 20, 14, 0x2e8b3a); box(c, x, B - 30, 12, 8, 0x46b04f); };
    pole(60); pole(60 + 512); wire(62, 62 + 512);
    for (k = 0; k < 2; k++) for (var xx = 62 + 512; xx < 62 + 1024; xx += 2) { var uu = (xx - 574) / 512, yy = Math.sin(uu * Math.PI) * 9; for (i = 0; i < 3; i++) box(c, xx % TW, B - 98 + i * 5 + yy, 2, 1, '#16181e'); break; }
    for (i = 0; i < 8; i++) {
      var sx = i * 128 + 8, r = rn(), px = sx + 20 + ((rn() * 56) | 0);
      if (px > 40 && px < 90 || px > 40 + 512 && px < 90 + 512) continue;
      if (cf.k === 'tree' ? r < .55 : cf.k === 'sun' ? r < .22 : false) tree(px);
      else if (r < .45) lamp(px);
      else if (r < .68) { scooter(px - 10); if (rn() < .6) scooter(px + 28); }
      else if (r < .76 && px < sx + 50) bus(px);
      else if (r < .88) bin(px);
      else plant(px);
    }
    box(c, 0, B, TW, 16, dark);
  }

  function ParallaxBackground(scene, o) { this.sc = scene; this.o = o; this.t = 0; this.parts = []; this.birdT = 5; this.flock = null; this._build(); }
  ParallaxBackground.legacyBurn = legacyBurn;
  ParallaxBackground.SPEED = SPEED;
  var PB = ParallaxBackground.prototype;

  PB._tex = function (key, w, h, draw) {
    var T = this.sc.textures;
    if (!T.exists(key)) { var t = T.createCanvas(key, w, h); draw(t.getContext()); t.refresh(); }
    this.keys.push(key); return key;
  };
  PB._build = function () {
    var s = this.sc, o = this.o, cf = o.cf, W = o.W, H = o.H, GY = o.GY, id = 'px' + o.si + '_', self = this, T = s.textures;
    this.keys = [];
    T.getTextureKeys().forEach(function (k) { if (k.indexOf('px') === 0 && /^px\d_/.test(k) && k.indexOf(id) !== 0) T.remove(k); });   // 清掉其他關的貼圖
    var rn = mulberry(1000 + o.si * 97), lf = [], lm = [], ln = [], add = function (k, h, y, depth, f) {
      return s.add.tileSprite(-PAD, y, W + PAD * 2, h, k).setOrigin(0, 0).setScrollFactor(0).setDepth(depth);
    };
    cf = Object.assign({}, cf);
    this.sky = add(this._tex(id + 'sky', 512, 512, function (c) { makeSky(c, cf, H, GY); }), H + PAD * 2, -PAD, -30);
    this.far = add(this._tex(id + 'far', TW, 256, function (c) { makeFar(c, cf, rn, lf, GY); }), 256, GY - 224, -26);
    this.mid = add(this._tex(id + 'mid', TW, 256, function (c) { makeMid(c, cf, rn, lm); }), 256, GY - 224, -22);
    this.near = add(this._tex(id + 'near', TW, 128, function (c) { makeNear(c, cf, rn, ln); }), 128, GY - 112, -14);
    if (this.near) this.near.setAlpha(cf.night ? .92 : .95);
    /* 日 / 月 */
    var sunPos = { sun: [540, 70], tree: [470, 168], dusk: [300, 196], '101': [150, 60], rain: null }[cf.k];
    this.sun = null; this.glow = null;
    if (sunPos) {
      this._tex(id + 'sun', 80, 80, function (c) { makeSun(c, cf); });
      this.sunX = sunPos[0]; this.sunY = sunPos[1];
      if (s.textures.exists('glow')) this.glow = s.add.sprite(0, 0, 'glow').setScrollFactor(0).setDepth(-29).setBlendMode(1).setScale(cf.night ? 2.6 : 3.4).setAlpha(cf.night ? .18 : .4).setTint(cf.k === 'dusk' ? 0xff7a3a : cf.k === 'tree' ? 0xffa050 : 0xffe9a0);
      this.sun = s.add.image(0, 0, id + 'sun').setScrollFactor(0).setDepth(-28);
    }
    /* 101 地標（單一物件，只出現一次） */
    this.t101 = null;
    if (cf.k === '101') {
      this._tex(id + '101', 48, 256, function (c) {
        var i; for (i = 0; i < 8; i++) { var w = i % 2 ? 26 : 34; box(c, 24 - w / 2, 232 - i * 20 - 18, w, 18, 0x23867a); box(c, 24 - w / 2, 232 - i * 20 - 18, w, 3, 0x2a9d8f); }
        box(c, 11, 232, 26, 22, 0x1f7a6e); box(c, 14, 232 - 8 * 20 - 8, 20, 8, 0x2a9d8f); box(c, 22, 24, 4, 60, 0x7fe3d3);
        for (i = 0; i < 8; i++) for (var j = 0; j < 6; j++) if (((i * 7 + j * 3) % 5) < 2) box(c, 12 + j * 4, 232 - i * 20 - 14, 2, 2, 0xffe9a8);
      });
      this.t101 = s.add.image(0, 0, id + '101').setOrigin(.5, 1).setScrollFactor(0).setDepth(-26.5);
    }
    /* 雲：固定數量，環繞回收 */
    this._tex('pxc0', 64, 22, function (c) { makeCloud(c, 64, 22, 3); });
    this._tex('pxc1', 96, 28, function (c) { makeCloud(c, 96, 28, 11); });
    this._tex('pxc2', 48, 18, function (c) { makeCloud(c, 48, 18, 29); });
    this.keys = this.keys.filter(function (k) { return k.indexOf('pxc') !== 0 && k.indexOf('pxb') !== 0; });     // 共用貼圖不在關卡清理範圍
    var dense = cf.k === 'rain' ? 10 : cf.night ? 6 : 8, tint = cf.k === 'rain' ? 0x6a7686 : cf.night ? 0x59607e : cf.k === 'dusk' ? 0xf0a090 : cf.k === 'tree' ? 0xffd9b8 : 0xffffff;
    this.clouds = []; this.CP = W + 320;
    for (var i = 0; i < dense; i++) {
      var sp = s.add.image(0, 0, 'pxc' + (i % 3)).setScrollFactor(0).setDepth(-27).setTint(tint).setScale(1 + rn() * 1.6).setAlpha(cf.night ? .55 : cf.k === 'rain' ? .85 : .92);
      this.clouds.push({ sp: sp, x0: rn() * this.CP, y: 14 + rn() * 120, v: 3 + rn() * 7 });
    }
    /* 燈光池 */
    this.lights = [];
    var L = [{ list: lf, f: SPEED.far, top: GY - 224, depth: -25.5 }, { list: lm, f: SPEED.mid, top: GY - 224, depth: -21.5 }, { list: ln, f: SPEED.near, top: GY - 112, depth: -13.5 }];
    L.forEach(function (l) { l.list.forEach(function (d) { if (d.kind !== 'none') { d.f = l.f; d.top = l.top; d.depth = l.depth; self.lights.push(d); } }); });
    this.dots = []; this.glows = [];
    for (i = 0; i < 28; i++) this.dots.push(s.add.sprite(0, 0, 'dot').setScrollFactor(0).setVisible(false).setBlendMode(1));
    for (i = 0; i < 10; i++) this.glows.push(s.add.sprite(0, 0, 'glow').setScrollFactor(0).setVisible(false).setBlendMode(1));
    /* 鳥 */
    this._tex('pxb0', 12, 8, function (c) { makeBird(c, true); }); this._tex('pxb1', 12, 8, function (c) { makeBird(c, false); });
    this.keys = this.keys.filter(function (k) { return k.indexOf('pxb') !== 0; });
    this.birds = [];
    var canBird = !cf.night && cf.k !== 'rain'; this.canBird = canBird;
    if (canBird) for (i = 0; i < 5; i++) this.birds.push(s.add.image(0, 0, 'pxb0').setScrollFactor(0).setDepth(-26.8).setVisible(false));
    this.lastX = 0; this.rn = rn;
    s.events.once('shutdown', function () { self.destroy(); });
  };

  /* dt：秒；camX：cam.scrollX */
  PB.update = function (dt, camX) {
    var o = this.o, W = o.W, t = (this.t += dt), i, n;
    this.sky.tilePositionX = camX * SPEED.sky; this.far.tilePositionX = camX * SPEED.far; this.mid.tilePositionX = camX * SPEED.mid; this.near.tilePositionX = camX * SPEED.near;
    if (this.sun) { var sx = this.sunX - camX * SPEED.sun; this.sun.setPosition(sx, this.sunY); if (this.glow) this.glow.setPosition(sx, this.sunY); }
    if (this.t101) this.t101.setPosition(470 - camX * SPEED.far, o.GY + 6);
    for (i = 0; i < this.clouds.length; i++) { var c = this.clouds[i]; c.sp.setPosition(mod(c.x0 + c.v * t - camX * SPEED.sun, this.CP) - 160, c.y); }
    /* 燈光：以 modulo 對應到畫面，超出畫面者不顯示；物件池循環使用 */
    var di = 0, gi = 0, L, sxl, on, a, cf = o.cf;
    for (i = 0; i < this.lights.length; i++) {
      L = this.lights[i]; sxl = mod(L.x - camX * L.f, TW); if (sxl > TW - 24) sxl -= TW; sxl -= PAD;
      if (sxl < -20 || sxl > W + 20) continue;
      a = 1;
      if (L.kind === 'beacon') a = ((t / L.per + L.ph) % 1) < .35 ? 1 : 0;
      else if (L.kind === 'flick') { on = Math.sin(t * 3.1 + L.ph) * Math.sin(t * 1.7 + L.ph * 2); a = on > -.35 ? 1 : .15; if (cf.k === 'rain') a *= (Math.sin(t * 17 + L.ph) > -.8 ? 1 : .3); }
      else if (L.kind === 'neon') a = .65 + .35 * Math.sin(t * 6.28 / L.per + L.ph);
      else a = .85 + .15 * Math.sin(t * 5 + L.ph);
      if (L.s > 0 && di < this.dots.length && a > .05) this.dots[di++].setVisible(true).setPosition(sxl, L.top + L.y).setScale(L.s / 4 * 1.2).setTint(L.c).setAlpha(a).setDepth(L.depth);
      if (L.glow && gi < this.glows.length) this.glows[gi++].setVisible(true).setPosition(sxl, L.top + L.y).setScale(L.glow).setTint(L.c).setAlpha(.45 * a).setDepth(L.depth);
    }
    for (; di < this.dots.length && this.dots[di].visible; di++) this.dots[di].setVisible(false);
    for (; gi < this.glows.length && this.glows[gi].visible; gi++) this.glows[gi].setVisible(false);
    /* 鳥群 */
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
    if ((f.dir > 0 && f.x - f.n * 14 > W + 20) || (f.dir < 0 && f.x + f.n * 14 < -20)) {          // 飛出畫面：回收
      for (i = 0; i < this.birds.length; i++) this.birds[i].setVisible(false);
      this.flock = null; this.birdT = 8 + this.rn() * 14;
    }
  };
  PB.destroy = function () {
    if (this.dead) return; this.dead = true;
    var a = [this.sky, this.far, this.mid, this.near, this.sun, this.glow, this.t101].concat(this.dots, this.glows, this.birds, this.clouds.map(function (c) { return c.sp; }));
    a.forEach(function (o) { if (o && o.destroy) try { o.destroy(); } catch (e) {} });
    this.clouds = this.dots = this.glows = this.birds = this.lights = [];
  };

  G.ParallaxBackground = ParallaxBackground;
})(window);
