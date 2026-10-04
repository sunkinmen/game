/* Grade — 整體氛圍與光影（調色、暗角、光束、環境飄浮物、腳下陰影）
 *  1. 調色+暗角：每關 1 張 640x360 貼圖，整個畫面只多 1 個 draw call（不用 CSS filter）
 *  2. 日光光束（晴天/傍晚）：4 個加亮混合的斜光，緩慢搖擺
 *  3. 環境飄浮物（花粉閃光 / 櫻花瓣 / 螢火蟲 / 餘燼）：固定 22 個物件池，環繞回收
 *  4. 腳下陰影：固定 24 個，指派給玩家與畫面內敵人（隨離地高度縮放、變淡）
 *  全部讀取 camera.scrollX 或實體座標，不影響碰撞、玩家移動或 Camera。 */
(function (G) {
  'use strict';
  var TAU = Math.PI * 2;
  function mod(a, n) { return ((a % n) + n) % n; }
  function mkTex(scene, key, w, h, fn) { var T = scene.textures; if (T.exists(key)) return key; var t = T.createCanvas(key, w, h); fn(t.getContext()); t.refresh(); return key; }

  /* 每關調色：wash = 整體色彩疊色(rgba)，vig = 暗角強度，top/bot = 上下漸層 */
  var LOOK = {
    sun:   { wash: [255, 244, 214, .06], vig: .32, top: [255, 255, 255, 0], bot: [30, 20, 60, .1] },
    tree:  { wash: [255, 170, 100, .12], vig: .36, top: [255, 140, 60, .08], bot: [60, 20, 40, .14] },
    '101': { wash: [60, 40, 130, .14], vig: .5, top: [20, 10, 70, .16], bot: [10, 0, 30, .2] },
    rain:  { wash: [40, 70, 110, .2], vig: .55, top: [10, 20, 40, .2], bot: [0, 10, 20, .22] },
    dusk:  { wash: [255, 90, 60, .12], vig: .5, top: [90, 20, 90, .18], bot: [40, 0, 30, .2] }
  };
  var KINDS = { sun: 'pollen', tree: 'petal', '101': 'firefly', rain: null, dusk: 'ember' };

  var Grade = {
    create: function (scene, cf, W, H) {
      var g = { s: scene, cf: cf, W: W, H: H, t: 0, lastX: 0 }, L = LOOK[cf.k] || LOOK.sun, id = 'gr' + scene.si + '_', i, fx = function (o) { return o.setScrollFactor(0); };
      scene.textures.getTextureKeys().forEach(function (k) { if (/^gr\d_/.test(k) && k.indexOf(id) !== 0) scene.textures.remove(k); });
      /* 調色 + 暗角 */
      mkTex(scene, id + 'v', W, H, function (c) {
        c.fillStyle = 'rgba(' + L.wash.join(',').replace(/,([^,]*)$/, ',$1') + ')'; c.fillRect(0, 0, W, H);
        var tg = c.createLinearGradient(0, 0, 0, H * .5); tg.addColorStop(0, 'rgba(' + L.top.join(',') + ')'); tg.addColorStop(1, 'rgba(' + L.top.slice(0, 3).join(',') + ',0)'); c.fillStyle = tg; c.fillRect(0, 0, W, H * .5);
        var bg = c.createLinearGradient(0, H * .6, 0, H); bg.addColorStop(0, 'rgba(' + L.bot.slice(0, 3).join(',') + ',0)'); bg.addColorStop(1, 'rgba(' + L.bot.join(',') + ')'); c.fillStyle = bg; c.fillRect(0, H * .6, W, H * .4);
        var rg = c.createRadialGradient(W / 2, H / 2, H * .38, W / 2, H / 2, W * .62); rg.addColorStop(0, 'rgba(4,2,16,0)'); rg.addColorStop(1, 'rgba(4,2,16,' + L.vig + ')'); c.fillStyle = rg; c.fillRect(0, 0, W, H);
      });
      g.vig = fx(scene.add.image(0, 0, id + 'v')).setOrigin(0).setDepth(990);
      /* 日光光束 */
      g.shafts = [];
      if (cf.k === 'sun' || cf.k === 'tree') {
        mkTex(scene, 'gr_shaft', 64, 256, function (c) { var gr = c.createLinearGradient(0, 0, 64, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.5, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 64, 256);
          var vgr = c.createLinearGradient(0, 0, 0, 256); vgr.addColorStop(0, 'rgba(0,0,0,0)'); vgr.addColorStop(.7, 'rgba(0,0,0,0.6)'); vgr.addColorStop(1, 'rgba(0,0,0,1)'); c.globalCompositeOperation = 'destination-out'; c.fillStyle = vgr; c.fillRect(0, 0, 64, 256); });
        for (i = 0; i < 4; i++) g.shafts.push({ sp: fx(scene.add.image(0, -20, 'gr_shaft')).setOrigin(.5, 0).setDepth(989).setBlendMode(1).setRotation(-.45).setScale(1.4 + i * .5, 1.6).setTint(cf.k === 'tree' ? 0xffc890 : 0xfff2c0), x0: 140 + i * 150, ph: i * 1.7 });
      }
      /* 環境飄浮物 */
      g.kind = KINDS[cf.k]; g.motes = [];
      if (g.kind) for (i = 0; i < 22; i++) {
        var sp = fx(scene.add.sprite(0, 0, g.kind === 'petal' ? 'dot' : 'glow')).setDepth(985).setBlendMode(g.kind === 'petal' ? 0 : 1);
        if (g.kind === 'petal') sp.setTint(i % 2 ? 0xffb7c5 : 0xf8cfe0).setScale(1.1, .8);
        else if (g.kind === 'pollen') sp.setTint(0xfff4b0).setScale(.12 + (i % 3) * .05);
        else if (g.kind === 'firefly') sp.setTint(0xb8ff8a).setScale(.14 + (i % 3) * .05);
        else sp.setTint(0xff8a40).setScale(.1 + (i % 3) * .04);
        g.motes.push({ sp: sp, x: Math.random() * W, y: Math.random() * H, v: 6 + Math.random() * 14, ph: Math.random() * 6, d: .3 + Math.random() * .7 });
      }
      /* 陰影 */
      mkTex(scene, 'gr_shadow', 40, 12, function (c) { var gr = c.createRadialGradient(20, 6, 1, 20, 6, 20); gr.addColorStop(0, 'rgba(10,6,30,.75)'); gr.addColorStop(1, 'rgba(10,6,30,0)'); c.save(); c.translate(0, 0); c.scale(1, .3); c.fillStyle = gr; c.fillRect(0, -40, 40, 160); c.restore(); });
      g.sh = []; for (i = 0; i < 24; i++) g.sh.push(scene.add.image(0, 0, 'gr_shadow').setVisible(false).setDepth(-8));
      g.update = Grade.update.bind(null, g); g.shadows = Grade.shadows.bind(null, g);
      scene.events.once('shutdown', function () { g.dead = true; });
      return g;
    },
    update: function (g, dt, camX) {
      var t = (g.t += dt), W = g.W, H = g.H, i, m, d = camX - g.lastX; g.lastX = camX;
      for (i = 0; i < g.shafts.length; i++) { var s = g.shafts[i]; s.sp.setPosition(mod(s.x0 - camX * .06, W + 240) - 60, -20).setAlpha(.05 + .035 * Math.sin(t * .5 + s.ph)); }
      for (i = 0; i < g.motes.length; i++) {
        m = g.motes[i];
        if (g.kind === 'petal') { m.y += m.v * 1.6 * dt; m.x += (14 + Math.sin(t * 1.3 + m.ph) * 16) * dt - d * .35 * m.d; m.sp.setRotation(t * 2 + m.ph).setAlpha(.9); }
        else if (g.kind === 'ember') { m.y -= m.v * 1.2 * dt; m.x += Math.sin(t + m.ph) * 8 * dt - d * .3 * m.d; m.sp.setAlpha(.35 + .4 * Math.sin(t * 3 + m.ph)); }
        else { m.y += Math.sin(t * .8 + m.ph) * 8 * dt; m.x += (Math.cos(t * .6 + m.ph) * 8) * dt - d * .3 * m.d; m.sp.setAlpha(g.kind === 'firefly' ? .15 + .85 * Math.max(0, Math.sin(t * 2 + m.ph)) : .25 + .3 * Math.sin(t * 2 + m.ph)); }
        if (m.y > H + 10) m.y = -10; else if (m.y < -10) m.y = H + 10;
        m.sp.setPosition(mod(m.x, W + 20) - 10, m.y);
      }
    },
    /* 為玩家與畫面內敵人指派陰影 */
    shadows: function (g, scene, p, sc) {
      var i = 0, cam = scene.cameras.main, list = scene.en, sh = g.sh, e, gy, h, s, sy;
      var put = function (x, y, fy, w, depth) {
        var gy = scene.surfaceY(x, fy); if (gy === null || i >= sh.length) return;
        var h = Math.max(0, gy - y), k = 1 - Math.min(1, h / 140) * .55;
        sh[i++].setVisible(true).setPosition(x, gy + 1).setScale(w * k / 40 * 1.3, 1).setAlpha(.9 * k).setDepth(gy - .5);
      };
      put(p.x, p.y, p.y - 4, 34 * (sc / Z), 0);
      for (var j = 0; j < list.length && i < sh.length; j++) {
        e = list[j]; if (e.removed || e.asleep || e.state === 'DEAD' || !e.spr) continue;
        if (e.x < cam.scrollX - 40 || e.x > cam.scrollX + g.W + 40) continue;
        put(e.x, e.y, e.fly ? e.y : e.y - 4, e.spr.displayWidth * .9, 0);
      }
      for (; i < sh.length && sh[i].visible; i++) sh[i].setVisible(false);
    }
  };
  G.Grade = Grade;
})(window);
