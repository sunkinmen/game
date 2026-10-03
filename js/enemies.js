/* Enemy AI Framework — Entity + State Machine
 * 結構：
 *   StateMachine（IDLE/PATROL/CHASE/ATTACK/HURT/KNOCKBACK/DEAD） + EnemyBase（HP/傷害/速度/重力/擊退/偵測/冷卻/受擊/死亡/分數/掉落/動畫）
 *   EnemyWalker / Shooter / Jumper / Flyer / Chaser / Tank / Boss  —— 各自只覆寫「狀態」
 *   EnemyFactory：EnemyFactory.spawn(scene, {type:'shooter', x:1200, hp:3, patrolRange:100})
 * 效能：
 *   - 精靈物件池（死亡/離場後回收，不 destroy）
 *   - 離開鏡頭 ±70px 的敵人整個跳過 AI/物理（asleep），落後鏡頭 520px 以上自動回收
 * 新增敵人只需：1) 寫一個 class 覆寫 buildStates()  2) EnemyFactory.register('type', {...DEFS...}) */
(function (G) {
  'use strict';
  var W = 640, H = 360, GY = 300, LW = 3400, Z = (window.Z||2), GRAV = 1000;
  var TIER = { hp: [1, 4, 10], sp: [1, .8, .65], sc: [1, 1.6, 2.4], kb: [0, .3, .8] };
  var SCORE = [10, 50, 200, 1000];
  var rnd = Math.random, abs = Math.abs, sgn = Math.sign;
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var AM = function () { return G.AudioManager; }, CF = function () { return G.CombatFeedback; };

  /* ---------- 敵人外觀變體（由原 bear 貼圖換色產生；art.js 啟動時建立貼圖） ---------- */
  var ENEMY_SKINS = [
    { k: 'bearP', from: 'bear', map: { r: 'u', R: 'U' } },   // 射手：紫
    { k: 'bearM', from: 'bear', map: { r: 'm', R: 'M' } },   // 跳躍者：綠
    { k: 'bearE', from: 'bear', map: { r: 'e', R: 'E' } },   // 衝撞者：橘
    { k: 'bearG', from: 'bear', map: { r: 'g', R: 'G' } }    // 坦克：鋼灰
  ];

  /* ---------- StateMachine ---------- */
  function SM(owner) { this.o = owner; this.cur = ''; this.t = 0; this.map = {}; }
  SM.prototype.add = function (n, d) { this.map[n] = d; return this; };
  SM.prototype.go = function (n) {
    if (this.cur === n) return;
    var m = this.map[this.cur]; if (m && m.exit) m.exit(this.o);
    this.cur = n; this.t = 0;
    m = this.map[n]; if (m && m.enter) m.enter(this.o);
  };
  SM.prototype.update = function (ds) { this.t += ds; var m = this.map[this.cur]; if (m && m.update) m.update(this.o, ds, this.t); };

  /* ---------- 設定表（資料化；cfg 可覆寫任何欄位） ---------- */
  var DEFS = {
    walker:  { tex: 'bear',  hp: 4, speed: 55,  detect: 620, patrol: 80,  dmg: 1, stun: .12 },
    flyer:   { tex: 'bird',  hp: 2, speed: 85,  detect: 700, patrol: 0,   dmg: 1, fly: true, stun: .1, swoopCd: 3.2 },
    shooter: { tex: 'bearP', hp: 3, speed: 50,  detect: 430, patrol: 90,  dmg: 1, stun: .12, fireCd: 2.4, gun: true },
    jumper:  { tex: 'bearM', hp: 3, speed: 70,  detect: 520, patrol: 60,  dmg: 1, stun: .1, hopCd: 1.1 },
    chaser:  { tex: 'bearE', hp: 2, speed: 60,  detect: 360, patrol: 40,  dmg: 1, stun: .08, rush: 2.4, windup: .45, scale: .9 },
    tank:    { tex: 'bearG', hp: 4, speed: 55,  detect: 600, patrol: 60,  dmg: 1, stun: 0, tier: 2, slamCd: 3.5 },
    boss:    { hp: 60, speed: 50, dmg: 1, boss: true, cls: 3, noStun: true, noGravity: true }
  };

  /* ---------- EnemyBase ---------- */
  function EnemyBase(scene, cfg, def, x, y) {
    var tier = cfg.tier != null ? cfg.tier : (def.tier || 0);
    this.scene = scene; this.def = def; this.type = cfg.type; this.cls = def.cls != null ? def.cls : tier; this.tier = tier;
    this.boss = !!def.boss; this.fly = !!def.fly;
    this.mhp = this.hp = cfg.hp != null ? cfg.hp : def.hp * TIER.hp[tier] * (1 + scene.si * .2);
    this.speed = (cfg.speed != null ? cfg.speed : def.speed) * (def.boss ? 1 : TIER.sp[tier]);
    this.dmg = cfg.dmg != null ? cfg.dmg : def.dmg || 1;
    this.detect = cfg.detect != null ? cfg.detect : def.detect || 600;
    this.patrolRange = cfg.patrolRange != null ? cfg.patrolRange : def.patrol || 0;
    this.kbResist = def.boss ? 1 : Math.min(.95, cfg.kbResist != null ? cfg.kbResist : TIER.kb[tier]);
    this.score = cfg.score != null ? cfg.score : SCORE[this.cls];
    this.dropCfg = cfg.drop || null;
    this.stun = def.stun || 0;
    this.vx = 0; this.vy = 0; this.grounded = false; this.dir = x < scene.p.x ? 1 : -1; this.homeX = x; this.cool = 0.6 + rnd();
    this.ph = scene.R() * 6; this.state = 'IDLE'; this.asleep = false; this.removed = false; this.flashT = 0; this._fl = false; this.deadT = 0; this.walkT = 0;
    this.maxX = LW - 18;
    var sp = this.spr = Factory.getSprite(scene);
    sp.setTexture(def.tex || 'bear').setOrigin(.5, 1).setScale(Z * TIER.sc[tier] * (def.scale || 1)).setPosition(x, y).setDepth(y);
    this.base = def.tex || 'bear';
    this.rr = sp.displayWidth * .38;
    this.fsm = new SM(this); this.buildStates(this.fsm); this.fsm.go('IDLE');
  }
  var P = EnemyBase.prototype;
  Object.defineProperties(P, {
    x: { get: function () { return this.spr.x; }, set: function (v) { this.spr.x = v; } },
    y: { get: function () { return this.spr.y; }, set: function (v) { this.spr.y = v; } },
    displayHeight: { get: function () { return this.spr.displayHeight; } },
    active: { get: function () { return !this.removed && this.state !== 'DEAD' && this.spr.active; } }
  });
  Object.defineProperty(P, 'state', { get: function () { return this.fsm ? this.fsm.cur : 'IDLE'; }, set: function () {} });

  P.buildStates = function (sm) {                                  // 子類覆寫；這裡是所有敵人共通的 HURT / KNOCKBACK / DEAD
    var self = this;
    sm.add('IDLE', { enter: function (e) { e.vx = 0; }, update: function (e, ds, t) { e.look(); if (t > .5) e.fsm.go(e.sees() ? 'CHASE' : 'PATROL'); } });
    sm.add('PATROL', { update: function (e, ds) { e.patrolStep(ds); if (e.sees()) e.fsm.go('CHASE'); } });
    sm.add('CHASE', { update: function (e, ds) { e.chaseStep(ds); } });
    sm.add('HURT', { enter: function (e) { e.vx = 0; }, update: function (e, ds, t) { if (t >= e.stun) e.fsm.go(e.resume()); } });
    sm.add('KNOCKBACK', { update: function (e, ds, t) { e.vx *= Math.pow(.02, ds); if (t >= .18 && (e.grounded || e.fly)) e.fsm.go(e.resume()); } });
    sm.add('DEAD', {});
  };
  P.resume = function () { return this.sees() ? 'CHASE' : 'PATROL'; };

  /* --- 感知 --- */
  P.dx = function () { return this.scene.p.x - this.spr.x; };
  P.sees = function () {
    var p = this.scene.p, dx = abs(p.x - this.spr.x), dy = abs(p.y - this.spr.y);
    return dx < this.detect && (this.fly || dy < 160);
  };
  P.look = function () { var dx = this.dx(); if (abs(dx) > 4) this.dir = sgn(dx); };
  P.edgeAhead = function (dir) {                                    // 前方沒有同高度的地面/平台（坑洞或平台邊緣）
    if (this.fly || this.def.noGravity) return false;
    var sf = this.scene.surfaceY(this.spr.x + dir * 18, this.spr.y - 6);
    return !(sf !== null && sf - this.spr.y <= 14);
  };
  P.walk = function (dir, sp) { if (dir && !this.edgeAhead(dir)) { this.vx = dir * sp; this.dir = dir; } else this.vx = 0; };

  P.patrolStep = function (ds) {
    if (!this.patrolRange) { this.vx = 0; return; }
    var x = this.spr.x;
    if (x > this.homeX + this.patrolRange) this.dir = -1; else if (x < this.homeX - this.patrolRange) this.dir = 1;
    if (this.edgeAhead(this.dir)) this.dir = -this.dir;
    this.walk(this.dir, this.speed * .5);
  };
  P.chaseStep = function (ds) {                                     // 預設行為：朝玩家走（遇邊緣停下）；過遠則回到巡邏
    var dx = this.dx();
    if (abs(dx) > this.detect * 1.5) { this.fsm.go('PATROL'); return; }
    if (abs(dx) < 6) { this.vx = 0; return; }
    this.walk(sgn(dx), this.speed);
  };

  /* --- 每幀 --- */
  P.update = function (dt, t, p, cam) {
    var ds = dt / 1000;
    if (this.state === 'DEAD') { this.deadUpdate(ds); return; }
    var x = this.spr.x, cl = cam.scrollX;
    this.asleep = x < cl - 70 || x > cl + W + 70;
    if (this.asleep) { if (this.gun) this.gun.setVisible(false); if (x < cl - 520) this.removed = true; return; }       // 離開畫面：不跑 AI / 物理，落後太遠直接回收
    if (this.cool > 0) this.cool -= ds;
    if (this.flashT > 0) { this.flashT -= ds; this.spr.setTintFill(0xffffff); this._fl = true; } else if (this._fl) { this._fl = false; this.spr.clearTint(); }
    this.fsm.update(ds);
    this.move(ds);
    this.animate(t, ds);
  };
  P.move = function (ds) {
    var s = this.spr;
    s.x = clamp(s.x + this.vx * ds, 18, this.maxX);
    if (this.fly || this.def.noGravity) return;
    var py = s.y, ny, sf;
    this.vy += GRAV * ds; ny = py + this.vy * ds; sf = this.scene.surfaceY(s.x, py);
    if (this.vy >= 0 && sf !== null && py <= sf + 4 && ny >= sf) { s.y = sf; this.vy = 0; this.grounded = true; } else { s.y = ny; this.grounded = false; }
    if (s.y > H + 90) this.removed = true;                                    // 掉進坑洞：直接回收
  };
  P.animate = function (t, ds) {
    var s = this.spr, moving = abs(this.vx) > 8 || this.fly;
    s.setFlipX(this.dir < 0).setDepth(s.y);
    s.setTexture(moving && (((t / 170) | 0) + (this.ph | 0)) % 2 ? this.base + '2' : this.base);
  };

  /* --- 受擊 / 擊退 / 死亡 --- */
  P.canBeHit = function () { return this.state !== 'DEAD' && !this.removed; };
  P.canHurtPlayer = function () { return this.state !== 'DEAD' && !this.removed && !this.asleep; };
  P.takeHit = function (n, b) {
    if (!this.canBeHit()) return false;
    this.hp -= n; var killed = this.hp <= 0;
    if (CF()) CF().hitEnemy(this, b, n, killed);
    if (this.onHit) this.onHit(n);
    if (killed) { this.die(); return true; }
    this.flashT = .07;
    this.react(b);
    return true;
  };
  P.react = function (b) {
    if (this.def.noStun) return;
    var from = b && b.vx ? sgn(b.vx) : sgn(this.spr.x - this.scene.p.x) || 1;
    var f = 90 * (b && b.kb != null ? b.kb : 1) * (1 - this.kbResist);
    if (f > 12) { this.vx = from * f; if (this.grounded) { this.vy = -90 * (1 - this.kbResist); this.grounded = false; } this.fsm.go('KNOCKBACK'); this.fsm.t = 0; }
    else if (this.stun > 0) { this.fsm.go('HURT'); this.fsm.t = 0; }
  };
  P.die = function () {
    this.hp = 0; this.vx = 0; this.fsm.go('DEAD'); this.deadT = 0;
    if (this.gun) { Factory.releaseSprite(this.gun); this.gun = null; }
    this.scene.onEnemyKilled(this);
    if (CF()) CF().enemyDeath(this);
  };
  P.deadDur = function () { return this.boss ? 1.0 : .38; };
  P.deadUpdate = function (ds) {
    var s = this.spr, d = this.deadDur(), k;
    this.deadT += ds; k = this.deadT / d;
    if (k >= 1) { this.removed = true; return; }
    if (this.deadT < .08) s.setTintFill(0xffffff); else if (this.boss) s.setTintFill(((this.deadT * 20) | 0) % 2 ? 0xffffff : 0xff5533); else s.clearTint();
    s.setAngle(this.dir * (this.boss ? 0 : 40 * k)).setAlpha(1 - k * k).setScale(s.scaleX, s.scaleY);
    if (this.boss) { s.x += (rnd() - .5) * 4; if (rnd() < ds * 9 && CF()) CF().burst(s.x + (rnd() - .5) * s.displayWidth * .6, s.y - rnd() * s.displayHeight, 0xff7744, 8, 220, { life: .4 }); }
    else { s.y -= (k < .3 ? 70 : -150) * ds; }
  };
  /* 掉落規則（與原版 kill() 相同；cfg.drop 可覆寫） */
  P.rollDrops = function () {
    var c = this.cls, r = rnd, out = [], tier = 0, y = Math.min(GY - 14, this.spr.y - 14);
    if (this.dropCfg) { out.push({ kind: this.dropCfg.kind || 'coin', tier: this.dropCfg.tier || 0, y: y, life: this.dropCfg.life || 12000 }); return out; }
    if (c === 0 && r() < .2) tier = r() < .75 ? 1 : 2;
    if (c === 1) tier = [2, 2, 3, 3, 4][r() * 5 | 0];
    if (c === 2) tier = [3, 4, 4, 5][r() * 4 | 0];
    if (c === 3) tier = [3, 3, 4, 4, 5][this.scene.si];
    if (tier) out.push({ kind: 'w', tier: tier, y: y, life: 15000 });
    else if (r() < .5) out.push({ kind: 'coin', tier: 0, y: y, life: 8000 });
    if (c >= 1 && c < 3 && r() < .1) out.push({ kind: r() < .6 ? 'shroom' : 'star', tier: 0, y: y - 20, life: 10000 });
    return out;
  };
  P.dispose = function () {
    if (this.gun) { Factory.releaseSprite(this.gun); this.gun = null; }
    Factory.releaseSprite(this.spr); this.spr = null;
  };

  /* ---------- 子類 ---------- */
  function inherit(C, proto) { C.prototype = Object.create(P); C.prototype.constructor = C; for (var k in proto) C.prototype[k] = proto[k]; return C; }

  /* Walker：巡邏 → 發現玩家就追（預設行為，全由 EnemyBase 提供） */
  function EnemyWalker(s, c, d, x, y) { EnemyBase.call(this, s, c, d, x, y); }
  inherit(EnemyWalker, {});

  /* Shooter：保持距離、瞄準玩家射擊 */
  function EnemyShooter(s, c, d, x, y) { EnemyBase.call(this, s, c, d, x, y); this.fireCd = c.fireCd || d.fireCd; this.aimA = 0; this.gun = Factory.getSprite(s).setTexture('w1').setOrigin(.25, .5).setScale(Z * .9).setDepth(y + 1); }
  inherit(EnemyShooter, {
    buildStates: function (sm) {
      P.buildStates.call(this, sm);
      sm.add('CHASE', { update: function (e, ds) {
        var dx = e.dx(), ax = abs(dx);
        if (ax > e.detect * 1.4) { e.fsm.go('PATROL'); return; }
        e.dir = sgn(dx) || e.dir;
        if (ax < 150) e.walk(-sgn(dx), e.speed * .8); else if (ax > 270) e.walk(sgn(dx), e.speed); else e.vx = 0;
        if (e.cool <= 0 && ax < 360 && e.sees()) e.fsm.go('ATTACK');
      } });
      sm.add('ATTACK', { enter: function (e) { e.vx = 0; e.fired = false; }, update: function (e, ds, t) {
        e.look();
        if (t >= .35 && !e.fired) { e.fired = true; e.shoot(); }
        if (t >= .6) { e.cool = e.fireCd * (.85 + rnd() * .3); e.fsm.go('CHASE'); }
      } });
    },
    shoot: function () {
      var s = this.scene, p = s.p, gx = this.spr.x + this.dir * 16, gy = this.spr.y - this.spr.displayHeight * .45;
      var a = Math.atan2(p.y - 26 - gy, p.x - gx);
      s.enemyBullet(gx, gy, Math.cos(a) * 170, Math.sin(a) * 170, 3000, { tint: 0xff8844, scale: 3 });
      if (AM()) AM().play('enemy_shoot'); if (CF()) CF()._flash(gx, gy, 0xffaa55, .4, 1, .08, .9);
    },
    animate: function (t, ds) {
      P.animate.call(this, t, ds);
      var g = this.gun, s = this.spr; if (!g) return;
      var wind = this.state === 'ATTACK' && this.fsm.t < .35;
      var a = Math.atan2(this.scene.p.y - 26 - (s.y - s.displayHeight * .45), this.scene.p.x - s.x);
      g.setActive(true).setVisible(true).setPosition(s.x, s.y - s.displayHeight * .45).setRotation(a).setFlipY(Math.cos(a) < -.1).setDepth(s.y + 1).setAlpha(s.alpha);
      if (wind) s.setTint(((this.fsm.t * 14) | 0) % 2 ? 0xffffff : 0xffbb99); else if (!this._fl && this.state !== 'DEAD') s.clearTint();
    }
  });

  /* Jumper：跳躍逼近；玩家在上方平台時跳得更高 */
  function EnemyJumper(s, c, d, x, y) { EnemyBase.call(this, s, c, d, x, y); this.hopCd = c.hopCd || d.hopCd; }
  inherit(EnemyJumper, {
    buildStates: function (sm) {
      P.buildStates.call(this, sm);
      sm.add('CHASE', { update: function (e, ds) {
        var dx = e.dx(); e.dir = sgn(dx) || e.dir;
        if (abs(dx) > e.detect * 1.5) { e.fsm.go('PATROL'); return; }
        if (e.grounded) { e.vx = 0; if (e.cool <= 0 && abs(dx) < 300) e.fsm.go('ATTACK'); }
      } });
      sm.add('ATTACK', { enter: function (e) {                                       // ATTACK = 空中跳躍階段
        var up = e.scene.p.y < e.spr.y - 50 && abs(e.dx()) < 160;
        e.vy = up ? -470 : -380; e.grounded = false; e.vx = e.dir * e.speed * 1.7; e.cool = e.hopCd * (.9 + rnd() * .6);
      }, update: function (e, ds, t) { if (t > .15 && e.grounded) { e.vx = 0; e.fsm.go('CHASE'); } } });
    }
  });

  /* Chaser：蓄力預警（閃爍）後高速衝刺，衝完休息 */
  function EnemyChaser(s, c, d, x, y) { EnemyBase.call(this, s, c, d, x, y); }
  inherit(EnemyChaser, {
    buildStates: function (sm) {
      P.buildStates.call(this, sm);
      sm.add('IDLE', { enter: function (e) { e.vx = 0; }, update: function (e, ds, t) { e.look(); if (t > .5 && e.cool <= 0 && e.sees()) e.fsm.go('ATTACK'); } });
      sm.add('PATROL', { update: function (e, ds) { e.patrolStep(ds); if (e.sees()) e.fsm.go('ATTACK'); } });
      sm.add('ATTACK', { enter: function (e) { e.vx = 0; if (e.scene.say) e.scene.say(e, '！', 600); }, update: function (e, ds, t) {
        e.look(); e.spr.x += ((rnd() - .5) * 2);                                         // 蓄力顫抖
        e.spr.setTint(((t * 16) | 0) % 2 ? 0xffffff : 0xffcc66);
        if (t >= e.def.windup) { e.spr.clearTint(); e.fsm.go('CHASE'); }
      } });
      sm.add('CHASE', { enter: function (e) { e.rushDir = e.dir; }, update: function (e, ds, t) {
        e.walk(e.rushDir, e.speed * e.def.rush);
        if (t > 1.5 || e.vx === 0 || (e.dx() * e.rushDir < -80)) { e.cool = 1.2; e.fsm.go('IDLE'); }
      } });
    },
    resume: function () { return 'IDLE'; }
  });

  /* Tank：慢速、高 HP、強抗擊退；近距離重擊地面，往兩側釋放低矮衝擊波 */
  function EnemyTank(s, c, d, x, y) { EnemyBase.call(this, s, c, d, x, y); this.slamCd = c.slamCd || d.slamCd; this.cool = 2; }
  inherit(EnemyTank, {
    buildStates: function (sm) {
      P.buildStates.call(this, sm);
      sm.add('CHASE', { update: function (e, ds) {
        e.chaseStep(ds);
        if (e.cool <= 0 && abs(e.dx()) < 200 && e.grounded) e.fsm.go('ATTACK');
      } });
      sm.add('ATTACK', { enter: function (e) { e.vx = 0; e.slammed = false; }, update: function (e, ds, t) {
        e.look();
        if (t < .65) e.spr.setScale(e.spr.scaleX, e.spr.scaleY * (1 + ds * .6));          // 蓄力：身體微微拉長
        if (t >= .65 && !e.slammed) { e.slammed = true; e.slam(); }
        if (t >= 1.0) { e.spr.setScale(Z * TIER.sc[e.tier] * (e.def.scale || 1)); e.cool = e.slamCd; e.fsm.go('CHASE'); }
      } });
    },
    slam: function () {
      var s = this.scene, x = this.spr.x, y = this.spr.y - 20;
      s.enemyBullet(x - 20, y, -170, 0, 900, { tint: 0xffaa33, sx: 4, sy: 2.5 }); s.enemyBullet(x + 20, y, 170, 0, 900, { tint: 0xffaa33, sx: 4, sy: 2.5 });
      if (CF()) { CF().shake(.004, 160); CF().dust(x - 20, y + 20); CF().dust(x + 20, y + 20); }
      if (AM()) AM().play('boss_hit', { vol: .8, pitch: .7 });
    }
  });

  /* Flyer：空中盤旋追蹤；靠近時俯衝攻擊再拉回 */
  function EnemyFlyer(s, c, d, x, y) { EnemyBase.call(this, s, c, d, x, y); this.by = y; this.swoopCd = c.swoopCd || d.swoopCd; this.cool = 1.5; }
  inherit(EnemyFlyer, {
    buildStates: function (sm) {
      P.buildStates.call(this, sm);
      sm.add('IDLE', { update: function (e, ds, t) { e.look(); e.hover(); if (t > .25) e.fsm.go('CHASE'); } });
      sm.add('PATROL', { update: function (e) { e.fsm.go('CHASE'); } });
      sm.add('CHASE', { update: function (e, ds) {
        var dx = e.dx(); e.dir = sgn(dx) || e.dir; e.vx = abs(dx) > 8 ? sgn(dx) * e.speed : 0; e.hover();
        if (e.cool <= 0 && abs(dx) < 140) e.fsm.go('ATTACK');
      } });
      sm.add('ATTACK', { enter: function (e) { e.vx = 0; e.diveSet = false; }, update: function (e, ds, t) {
        var p = e.scene.p;
        if (t < .25) { e.spr.y -= 30 * ds; return; }                                      // 拉高蓄力
        if (!e.diveSet) { e.diveSet = true; var a = Math.atan2(p.y - 24 - e.spr.y, p.x - e.spr.x); e.vx = Math.cos(a) * 280; e.vyD = Math.sin(a) * 280; }
        e.spr.y += e.vyD * ds;
        if (t > .75 || e.spr.y > GY - 6) { e.vyD = 0; e.cool = e.swoopCd; e.fsm.go('CHASE'); }
      } });
      sm.add('KNOCKBACK', { update: function (e, ds, t) { e.vx *= Math.pow(.02, ds); e.hover(); if (t >= .18) e.fsm.go('CHASE'); } });
      sm.add('HURT', { update: function (e, ds, t) { e.vx = 0; if (t >= e.stun) e.fsm.go('CHASE'); } });
    },
    hover: function () {
      var t = this.scene.t, target = this.by + Math.sin(t / 300 + this.ph) * 22;
      this.spr.y += (target - this.spr.y) * .12;
    }
  });

  /* Boss：沿用原版行為（接近/後退、每 2 秒彈幕），加入受擊白閃與死亡演出 */
  function EnemyBoss(s, c, d, x, y) {
    EnemyBase.call(this, s, c, d, x, y); this.key = c.key; this.nx = s.t + 1500; this.lo = false; this.maxX = LW - 50;
  }
  inherit(EnemyBoss, {
    buildStates: function (sm) {
      P.buildStates.call(this, sm);
      sm.add('IDLE', { update: function (e, ds, t) { if (t > .3) e.fsm.go('CHASE'); } });
      sm.add('CHASE', { update: function (e, ds) {
        var dx = e.dx(), cam = e.scene.cameras.main; e.dir = sgn(dx) || e.dir;
        e.spr.x = clamp(e.spr.x + sgn(dx) * e.speed * ds * (abs(dx) > 170 ? 1 : -.6), cam.scrollX + 50, LW - 50);
        e.vx = 0;
        if (e.scene.t > e.nx) { e.nx = e.scene.t + 2000; e.fire(dx); }
      } });
    },
    fire: function (dx) {
      var s = this.scene, p = s.p, t = s.t, cy = this.spr.y - this.spr.displayHeight / 2, aim = Math.atan2(p.y - 20 - cy, dx), i, as;
      as = this.key === 'boss' ? Array.apply(null, Array(10)).map(function (_, i) { return i / 10 * 6.283 + t / 500; }) : [aim - .25, aim, aim + .25];
      for (i = 0; i < as.length; i++) s.enemyBullet(this.spr.x, cy, Math.cos(as[i]) * 140, Math.sin(as[i]) * 140, 3500, { tint: 0xff3333, scale: 3 });
      if (AM()) AM().play('enemy_shoot', { pitch: .6, vol: 1.2 }); if (CF()) CF()._flash(this.spr.x, cy, 0xff5533, .8, 2, .12, .9);
    },
    onHit: function () {
      if (!this.lo && this.hp > 0 && this.hp < this.mhp * .4) { this.lo = true; this.scene.say(this, '你很會喔！莫以為我怕你', 1800); }
    },
    animate: function (t, ds) {
      var s = this.spr; s.setFlipX(this.dir < 0).setDepth(s.y);
      s.setTexture((((t / 170) | 0) + (this.ph | 0)) % 2 ? this.base + '2' : this.base);
    },
    deadDur: function () { return 1.0; }
  });

  /* ---------- Factory ---------- */
  var Factory = {
    types: {}, pool: [], scene: null,
    register: function (type, def, ctor) { def.type = type; this.types[type] = { def: def, ctor: ctor || EnemyWalker }; DEFS[type] = def; },
    init: function (scene) { this.scene = scene; this.pool = []; },
    dispose: function () { this.pool = []; this.scene = null; },
    getSprite: function (scene) {
      var s = this.pool.pop();
      if (!s || !s.scene) s = scene.add.sprite(0, 0, 'bear');
      return s.setActive(true).setVisible(true).clearTint().setAlpha(1).setAngle(0).setFlipX(false).setFlipY(false).setRotation(0).setBlendMode(0);
    },
    releaseSprite: function (s) { if (!s) return; s.setActive(false).setVisible(false).clearTint(); if (this.pool.length < 40) this.pool.push(s); },
    /* 把 R() 產生的波次 + 手寫 SPAWNS 整理成一份依 x 排序的出生表 */
    planWaves: function (ws, si) {
      var mix = (G.WAVE_MIX && G.WAVE_MIX[si]) || { walker: 1 }, keys = Object.keys(mix), total = 0, out = [];
      keys.forEach(function (k) { total += mix[k]; });
      ws.forEach(function (w, i) {
        var type, h = Math.abs(Math.sin((i + 1) * 12.9898 + si * 78.233) * 43758.5453) % 1;       // 與關卡 RNG 無關的決定性雜湊
        if (w.bird) type = 'flyer'; else if (w.cls === 2) type = 'tank'; else if (w.cls === 1) type = 'walker';
        else { var r = h * total, k = 0; type = keys[0]; for (k = 0; k < keys.length; k++) { r -= mix[keys[k]]; if (r < 0) { type = keys[k]; break; } } }
        out.push({ type: type, x: w.x, tier: w.cls });
      });
      ((G.SPAWNS && G.SPAWNS[si]) || []).forEach(function (s) { out.push(Object.assign({}, s)); });
      out.sort(function (a, b) { return a.x - b.x; });
      return out;
    },
    create: function (scene, cfg, x, y) {
      var t = this.types[cfg.type] || this.types.walker;
      var e = new t.ctor(scene, cfg, t.def, x, y);
      scene.en.push(e); return e;
    },
    /* EnemyFactory.spawn(scene, {type, x, y?, hp?, patrolRange?, tier?, speed?, detect?, drop?}) */
    spawn: function (scene, cfg) {
      var cam = scene.cameras.main, x = Math.max(cfg.x, cam.scrollX + W + 30), t = this.types[cfg.type] || this.types.walker, y;
      if (t.def.fly) y = cfg.y != null && cfg.y < GY - 40 ? cfg.y : GY - 90 - scene.R() * 50;
      else { x = scene.nearestGroundX(x); y = cfg.y != null ? cfg.y : GY; }
      return this.create(scene, cfg, x, y);
    },
    spawnBoss: function (scene) {
      var b = BOSS[scene.si], key = b[0], big = key === 'boss';
      var def = Object.assign({}, DEFS.boss, { tex: key, hp: big ? 300 : 60 + scene.si * 45, speed: key === 'taxiK' ? 75 : 50, scale: big ? 1.9 / 1 : 2.4 });
      var cfg = { type: 'boss', key: key, hp: def.hp, speed: def.speed, tier: 0 };
      var e = new EnemyBoss(scene, cfg, def, LW - 70, GY);
      e.spr.setScale(Z * def.scale); e.rr = e.spr.displayWidth * .35; e.cls = 3;
      scene.en.push(e); scene.say(e, TALK.boss[scene.si % 2], 2200); return e;
    }
  };
  Factory.register('walker', DEFS.walker, EnemyWalker);
  Factory.register('flyer', DEFS.flyer, EnemyFlyer);
  Factory.register('shooter', DEFS.shooter, EnemyShooter);
  Factory.register('jumper', DEFS.jumper, EnemyJumper);
  Factory.register('chaser', DEFS.chaser, EnemyChaser);
  Factory.register('tank', DEFS.tank, EnemyTank);

  G.ENEMY_SKINS = ENEMY_SKINS;
  G.EnemyBase = EnemyBase; G.EnemyFactory = Factory; G.EnemyStates = ['IDLE', 'PATROL', 'CHASE', 'ATTACK', 'HURT', 'KNOCKBACK', 'DEAD'];
})(window);
