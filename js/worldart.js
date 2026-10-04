/* WorldArt — 遊戲層（速度 1.0）的美術：人行道+路緣+柏油路、坑洞、草頂木棧板平台
 * 全部在建立時用 Canvas2D 畫成可無縫平鋪的小貼圖（128x64 / 32x24 / 16x64），
 * 場景中以 TileSprite 平鋪：每段地面 1 個物件、每個平台 1 個物件，沒有 Graphics 每幀重繪。
 * 不影響碰撞：碰撞仍使用 scene.gs（地面區段）與 scene.pf（平台）的座標，這裡只負責「畫」。 */
(function (G) {
  'use strict';
  var TAU = Math.PI * 2;
  function rgb(n) { return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mix(a, b, t) { var A = rgb(a), B = rgb(b); return (((A[0] + (B[0] - A[0]) * t) | 0) << 16) | (((A[1] + (B[1] - A[1]) * t) | 0) << 8) | ((A[2] + (B[2] - A[2]) * t) | 0); }
  function lit(n, t) { return mix(n, 0xffffff, t); }
  function drk(n, t) { return mix(n, 0x120a24, t); }
  function css(n, a) { var c = rgb(n); return a == null || a >= 1 ? '#' + ('000000' + (n >>> 0).toString(16)).slice(-6) : 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function box(c, x, y, w, h, col, a) { c.fillStyle = css(col, a); c.fillRect(x, y, w, h); }
  function vg(c, y0, y1, a, b) { var g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, css(a)); g.addColorStop(1, css(b)); return g; }

  var GRASS = {
    sun: [0x7ad24c, 0x45a23c], tree: [0x8cc04a, 0x56983a], '101': [0x3f9a74, 0x216a54], rain: [0x3f8a66, 0x24604c], dusk: [0x6a62a0, 0x403a72]
  };

  function groundTex(c, cf, rn) {
    var base = cf.ground, sw = lit(base, cf.night ? .16 : .3), road = drk(base, .06), i, x, y, k = cf.k;
    c.fillStyle = vg(c, 0, 14, lit(sw, .12), sw); c.fillRect(0, 0, 128, 14);
    box(c, 0, 0, 128, 1, lit(sw, .5)); box(c, 0, 1, 128, 1, lit(sw, .25));
    c.fillStyle = css(drk(sw, .16));                                   // 人行道磚縫
    for (x = 0; x < 128; x += 32) c.fillRect(x, 2, 1, 6);
    for (x = 16; x < 128; x += 32) c.fillRect(x, 8, 1, 6);
    c.fillRect(0, 8, 128, 1);
    for (i = 0; i < 18; i++) box(c, (rn() * 126) | 0, 2 + ((rn() * 11) | 0), 2, 1, rn() < .5 ? lit(sw, .2) : drk(sw, .12), .6);
    box(c, 0, 14, 128, 1, lit(sw, .35));                               // 路緣
    c.fillStyle = vg(c, 15, 20, drk(sw, .2), drk(sw, .45)); c.fillRect(0, 15, 128, 5);
    box(c, 0, 20, 128, 1, 0x000000, .45);
    c.fillStyle = vg(c, 21, 64, lit(road, .04), drk(road, .4)); c.fillRect(0, 21, 128, 43);        // 柏油
    for (i = 0; i < 70; i++) box(c, (rn() * 127) | 0, 22 + ((rn() * 41) | 0), 1 + ((rn() * 2) | 0), 1, rn() < .5 ? 0xffffff : 0x000000, .06 + rn() * .1);
    box(c, 22, 41, 60, 3, 0xf4e9b8); box(c, 22, 41, 60, 1, 0xffffff, .55); box(c, 22, 44, 60, 1, 0x000000, .3);   // 車道虛線
    for (i = 0; i < 2; i++) { c.strokeStyle = css(0x000000, .25); c.lineWidth = 1; c.beginPath(); c.moveTo(90 + i * 14, 24); c.lineTo(94 + i * 14, 36); c.lineTo(88 + i * 14, 52); c.stroke(); }  // 路面裂紋
    if (k === 'rain') for (i = 0; i < 5; i++) { var px = 18 + rn() * 90, py = 26 + rn() * 32; c.fillStyle = css(0xaec8e8, .2); c.beginPath(); c.ellipse(px, py, 6 + rn() * 10, 2 + rn() * 2, 0, 0, TAU); c.fill(); box(c, px - 3, py - 1, 5, 1, 0xffffff, .4); }
    if (k === 'tree') for (i = 0; i < 12; i++) box(c, 6 + rn() * 114, 3 + rn() * 55, 3, 2, rn() < .6 ? 0xffb7c5 : 0xf48fb1, .85);
    if (cf.night) for (i = 0; i < 3; i++) { c.fillStyle = css(0xffe3a0, .05); c.beginPath(); c.ellipse(20 + i * 44, 26, 24, 5, 0, 0, TAU); c.fill(); }
  }
  function platTex(c, cf, rn) {
    var g = GRASS[cf.k] || GRASS.sun, wood = cf.night ? 0x7a5a48 : 0xc58444, i;
    c.fillStyle = vg(c, 0, 7, g[0], g[1]); c.fillRect(0, 0, 32, 7);
    for (i = 0; i < 9; i++) { var bx = 1 + i * 3.6; c.fillStyle = css(lit(g[0], .3)); c.beginPath(); c.moveTo(bx, 3); c.lineTo(bx + 1, 0); c.lineTo(bx + 2, 3); c.fill(); }
    box(c, 0, 0, 32, 1, lit(g[0], .45)); box(c, 4, 1, 2, 1, 0xffffff, .9); box(c, 21, 1, 2, 1, 0xffe27a, .95); box(c, 12, 2, 2, 1, 0xff9fbd, .9);
    box(c, 0, 6, 32, 2, drk(g[1], .35));
    for (i = 0; i < 6; i++) box(c, 2 + i * 5, 7, 2, 2 + (i % 3), drk(g[1], .15));                         // 草垂下
    c.fillStyle = vg(c, 8, 21, lit(wood, .12), drk(wood, .18)); c.fillRect(0, 8, 32, 13);
    box(c, 0, 14, 32, 1, drk(wood, .35)); box(c, 0, 15, 32, 1, lit(wood, .18));
    box(c, 0, 8, 1, 6, drk(wood, .3)); box(c, 16, 8, 1, 6, drk(wood, .3)); box(c, 8, 15, 1, 6, drk(wood, .3)); box(c, 24, 15, 1, 6, drk(wood, .3));
    for (i = 0; i < 10; i++) box(c, (rn() * 30) | 0, 9 + ((rn() * 11) | 0), 3 + ((rn() * 4) | 0), 1, rn() < .5 ? drk(wood, .22) : lit(wood, .15), .55);
    box(c, 2, 10, 1, 1, 0x3a2410); box(c, 14, 10, 1, 1, 0x3a2410); box(c, 10, 17, 1, 1, 0x3a2410); box(c, 26, 17, 1, 1, 0x3a2410);
    c.fillStyle = vg(c, 20, 24, drk(wood, .55), 0x000000); c.globalAlpha = .6; c.fillRect(0, 20, 32, 4); c.globalAlpha = 1;
  }
  function pitTex(c) {
    c.fillStyle = vg(c, 0, 64, 0x1c1236, 0x000000); c.fillRect(0, 0, 16, 64);
    for (var i = 0; i < 3; i++) box(c, 3 + i * 5, 0, 1, 20 + i * 8, 0x6a5ad0, .12);
  }

  var WorldArt = {
    build: function (scene, cf, gs, pf, GY, H) {
      var id = 'wa' + scene.si + '_', T = scene.textures, rn = mulberry(77 + scene.si * 13);
      T.getTextureKeys().forEach(function (k) { if (/^wa\d_/.test(k) && k.indexOf(id) !== 0) T.remove(k); });
      var mk = function (k, w, h, fn) { if (!T.exists(k)) { var t = T.createCanvas(k, w, h); fn(t.getContext(), cf, rn); t.refresh(); } return k; };
      var kg = mk(id + 'ground', 128, 64, groundTex), kp = mk(id + 'plat', 32, 24, platTex), kt = mk(id + 'pit', 16, 64, pitTex);
      var objs = [];
      gs.forEach(function (g, i) {
        objs.push(scene.add.tileSprite(g[0], GY, g[1] - g[0], H - GY, kg).setOrigin(0, 0).setDepth(-9.9));
        if (i < gs.length - 1) objs.push(scene.add.tileSprite(g[1], GY, gs[i + 1][0] - g[1], H - GY, kt).setOrigin(0, 0).setDepth(-9.8));
      });
      pf.forEach(function (f) { objs.push(scene.add.tileSprite(f.x, f.y, Math.round(f.w), 24, kp).setOrigin(0, 0).setDepth(-9)); });
      scene.events.once('shutdown', function () { objs.forEach(function (o) { try { o.destroy(); } catch (e) {} }); });
      return objs;
    }
  };
  G.WorldArt = WorldArt;
})(window);
