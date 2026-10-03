/* AudioManager — 全遊戲唯一的音訊入口
 * - 無外部音檔：以 Web Audio 即時合成 8-bit 音效與程序化 BGM（placeholder）
 * - 使用者第一次 touchend/click/keydown 後才建立「唯一一個」AudioContext
 * - 不支援 Web Audio 的瀏覽器：所有 API 變成安全的 no-op，不會丟錯
 * - 可選：AudioManager.load({event:'url'}) 之後同名事件改播音檔，缺檔自動退回合成音
 * 遊戲物件請只呼叫 AudioManager.play('event')，不要自己 new Audio / AudioContext */
(function (G) {
  'use strict';
  var Ctor = G.AudioContext || G.webkitAudioContext || null;
  var noop = function () {};
  var clamp01 = function (v) { v = +v; return v > 1 ? 1 : v >= 0 ? v : 0; };
  var mtof = function (n) { return 440 * Math.pow(2, (n - 69) / 12); };

  /* 把一串音高展開成連續音符 layer */
  function seq(freqs, step, d, w, v, endMul, t0) {
    return freqs.map(function (f, i) { return { w: w, t: (t0 || 0) + i * step, d: d, f: [f, f * (endMul || 1)], v: v }; });
  }

  /* ---------- SFX 定義 ----------
   * cd：同事件最短間隔 ms；max：同事件最大同時數；pri：優先權（滿載時高者可擠掉低者）
   * L：layers（或 function(opts)→layers）
   *   w：square|triangle|sawtooth|sine|noise；t：起始秒；d：長度秒；f：[起,迄]Hz（noise 為濾波頻率）；v：音量 */
  function shootLayers(o) {
    switch (o.variant | 0) {
      case 2: return [{ w: 'square', t: 0, d: .05, f: [1050, 320], v: .08 }, { w: 'noise', t: 0, d: .035, f: [5200, 2200], ft: 'highpass', v: .06 }];
      case 3: return [{ w: 'noise', t: 0, d: .22, f: [2800, 260], ft: 'lowpass', v: .22 }, { w: 'square', t: 0, d: .16, f: [170, 45], v: .15 }];
      case 4: return [{ w: 'sawtooth', t: 0, d: .17, f: [2300, 380], v: .09 }, { w: 'square', t: 0, d: .10, f: [1700, 420], v: .04 }];
      case 5: return [{ w: 'sawtooth', t: 0, d: .30, f: [560, 70], v: .14 }, { w: 'sine', t: 0, d: .30, f: [240, 55], v: .18 }, { w: 'noise', t: 0, d: .12, f: [1800, 400], ft: 'bandpass', v: .07 }];
      default: return [{ w: 'square', t: 0, d: .085, f: [900, 190], v: .11 }, { w: 'noise', t: 0, d: .03, f: [5000, 2600], ft: 'highpass', v: .06 }];
    }
  }

  var SFX = {
    player_jump: { cd: 60, max: 2, pri: 2, L: [{ w: 'square', t: 0, d: .14, f: [250, 620], v: .15 }] },
    player_double_jump: { cd: 60, max: 2, pri: 2, L: [{ w: 'square', t: 0, d: .08, f: [420, 800], v: .13 }, { w: 'triangle', t: .07, d: .13, f: [640, 1400], v: .16 }] },
    player_shoot: { cd: 28, max: 4, pri: 1, jit: .05, L: shootLayers },
    bullet_hit: { cd: 35, max: 3, pri: 1, L: [{ w: 'noise', t: 0, d: .035, f: [6000, 3000], ft: 'highpass', v: .07 }] },
    enemy_hit: { cd: 45, max: 3, pri: 2, jit: .08, L: [{ w: 'square', t: 0, d: .07, f: [260, 110], v: .13 }, { w: 'noise', t: 0, d: .05, f: [2400, 600], ft: 'lowpass', v: .10 }] },
    enemy_die: { cd: 50, max: 3, pri: 3, jit: .06, L: [{ w: 'noise', t: 0, d: .26, f: [2600, 180], ft: 'lowpass', v: .20 }, { w: 'square', t: 0, d: .22, f: [360, 50], v: .13 }] },
    enemy_shoot: { cd: 60, max: 3, pri: 2, jit: .05, L: [{ w: 'square', t: 0, d: .12, f: [520, 150], v: .08 }, { w: 'noise', t: 0, d: .05, f: [3000, 1200], ft: 'bandpass', v: .05 }] },
    coin_collect: { cd: 25, max: 3, pri: 2, L: [{ w: 'square', t: 0, d: .05, f: [784, 784], v: .10 }, { w: 'square', t: .05, d: .20, f: [1175, 1175], v: .10 }] },
    block_hit: { cd: 80, max: 2, pri: 2, L: [{ w: 'square', t: 0, d: .08, f: [210, 120], v: .14 }, { w: 'triangle', t: .04, d: .16, f: [900, 900], v: .10 }] },
    player_hurt: { cd: 120, max: 2, pri: 6, L: [{ w: 'sawtooth', t: 0, d: .28, f: [330, 70], v: .20 }, { w: 'noise', t: 0, d: .16, f: [1800, 200], ft: 'lowpass', v: .18 }] },
    player_die: { cd: 0, max: 1, pri: 9, L: seq([392, 349, 311, 262, 220, 196, 165], .11, .18, 'sawtooth', .16, .9).concat([{ w: 'noise', t: 0, d: .5, f: [2400, 100], ft: 'lowpass', v: .2 }]) },
    powerup_collect: { cd: 60, max: 2, pri: 5, L: seq([392, 494, 587, 784, 988, 1175], .055, .16, 'triangle', .16, 1).concat(seq([784, 988, 1175, 1568], .055, .12, 'square', .05, 1, .06)) },
    checkpoint: { cd: 200, max: 1, pri: 5, L: seq([659, 880, 1319], .09, .22, 'triangle', .18, 1).concat([{ w: 'sine', t: .2, d: .5, f: [1760, 1760], v: .06 }]) },
    boss_intro: { cd: 0, max: 1, pri: 8, L: [
      { w: 'sawtooth', t: 0, d: .28, f: [150, 110], v: .18 }, { w: 'sawtooth', t: .34, d: .28, f: [150, 110], v: .18 }, { w: 'sawtooth', t: .68, d: .34, f: [150, 100], v: .18 },
      { w: 'noise', t: 0, d: 1.1, f: [500, 120], ft: 'lowpass', v: .20 }, { w: 'sine', t: 0, d: 1.2, f: [60, 45], v: .22 }] },
    boss_hit: { cd: 55, max: 3, pri: 4, jit: .06, L: [{ w: 'square', t: 0, d: .10, f: [150, 60], v: .18 }, { w: 'noise', t: 0, d: .08, f: [1200, 200], ft: 'lowpass', v: .16 }] },
    boss_die: { cd: 0, max: 1, pri: 9, L: [
      { w: 'noise', t: 0, d: 1.3, f: [3200, 60], ft: 'lowpass', v: .28 }, { w: 'square', t: 0, d: 1.0, f: [260, 28], v: .18 }, { w: 'sawtooth', t: .1, d: .9, f: [130, 20], v: .14 },
      { w: 'triangle', t: .8, d: .5, f: [880, 1760], v: .10 }] },
    level_clear: { cd: 0, max: 1, pri: 8, L: seq([523, 659, 784, 1047, 784, 1047, 1319], .11, .2, 'square', .09, 1).concat(seq([262, 330, 392, 523, 392, 523, 659], .11, .2, 'triangle', .14, 1)) },
    game_over: { cd: 0, max: 1, pri: 8, L: seq([392, 370, 349, 330, 311, 294, 262], .2, .3, 'sawtooth', .10, .97).concat(seq([196, 185, 175, 165, 156, 147, 131], .2, .3, 'triangle', .16, .97)) },
    button_click: { cd: 40, max: 2, pri: 3, L: [{ w: 'square', t: 0, d: .04, f: [1500, 900], v: .09 }] },
    menu_open: { cd: 80, max: 1, pri: 3, L: [{ w: 'triangle', t: 0, d: .09, f: [480, 960], v: .14 }, { w: 'square', t: .06, d: .07, f: [960, 960], v: .05 }] },
    menu_close: { cd: 80, max: 1, pri: 3, L: [{ w: 'triangle', t: 0, d: .09, f: [960, 480], v: .14 }, { w: 'square', t: .06, d: .07, f: [480, 480], v: .05 }] }
  };

  /* ---------- 程序化 BGM（種子隨機產生旋律，每次一致） ---------- */
  var TRACKS = {
    stage0: { bpm: 132, root: 60, sc: [0, 2, 4, 7, 9], prog: [[0, 'M'], [9, 'm'], [5, 'M'], [7, 'M']], seed: 11, lead: 'square', dens: .62, kit: 1 },
    stage1: { bpm: 116, root: 55, sc: [0, 2, 4, 7, 9], prog: [[0, 'M'], [5, 'M'], [9, 'm'], [7, 'M']], seed: 23, lead: 'triangle', dens: .5, kit: 1 },
    stage2: { bpm: 122, root: 57, sc: [0, 3, 5, 7, 10], prog: [[0, 'm'], [8, 'M'], [3, 'M'], [10, 'M']], seed: 37, lead: 'square', dens: .6, kit: 2 },
    stage3: { bpm: 104, root: 52, sc: [0, 3, 5, 7, 10], prog: [[0, 'm'], [5, 'm'], [8, 'M'], [7, 'm']], seed: 41, lead: 'triangle', dens: .42, kit: 1 },
    stage4: { bpm: 142, root: 50, sc: [0, 3, 5, 7, 10], prog: [[0, 'm'], [8, 'M'], [5, 'm'], [7, 'M']], seed: 53, lead: 'sawtooth', dens: .7, kit: 2 },
    boss: { bpm: 164, root: 48, sc: [0, 3, 5, 6, 7, 10], prog: [[0, 'm'], [1, 'M'], [0, 'm'], [6, 'M']], seed: 67, lead: 'sawtooth', dens: .78, kit: 3, bassSaw: true }
  };
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  /* 把 track 設定展開成 steps 陣列（每 step = 一個 16 分音符） */
  function buildTrack(t) {
    if (t._b) return t._b;
    var rnd = mulberry(t.seed), motif = [], steps = [], m, b, s, bar, idx, n = t.sc.length;
    for (m = 0; m < 2; m++) {
      bar = []; idx = 2 + ((rnd() * 3) | 0);
      for (s = 0; s < 16; s++) {
        var on = s % 4 === 0 ? rnd() < .9 : s % 2 === 0 ? rnd() < t.dens : rnd() < t.dens * .35;
        if (!on) { bar.push(0); continue; }
        idx += (rnd() < .5 ? -1 : 1) * (rnd() < .7 ? 1 : 2);
        idx = Math.max(0, Math.min(n * 2 - 1, idx));
        bar.push(t.root + 12 + t.sc[idx % n] + 12 * ((idx / n) | 0));
      }
      motif.push(bar);
    }
    var kick = t.kit === 3 ? [0, 3, 8, 10] : t.kit === 2 ? [0, 4, 8, 12] : [0, 8];
    for (b = 0; b < t.prog.length; b++) {
      var cr = t.root + t.prog[b][0] - 12;
      for (s = 0; s < 16; s++) {
        var st = { bass: 0, lead: motif[b % 2][s], kick: kick.indexOf(s) >= 0, snare: s === 4 || s === 12, hat: s % 2 === 0 };
        if (s % 2 === 0) st.bass = cr + (s % 8 === 6 ? 12 : s % 8 === 4 && t.kit > 1 ? 7 : 0);
        if (t.kit === 3) { st.hat = true; if (s % 2 === 1) st.bass = cr; }
        steps.push(st);
      }
    }
    t._b = steps; return steps;
  }

  /* iOS 靜音鍵繞過：iOS 才用，且只在沒有 navigator.audioSession 時 */
  function silentWavUri() {
    var n = 800, bytes = [], i;
    function w32(v) { bytes.push(v & 255, v >> 8 & 255, v >> 16 & 255, v >> 24 & 255); }
    function w16(v) { bytes.push(v & 255, v >> 8 & 255); }
    bytes.push(82, 73, 70, 70); w32(36 + n * 2); bytes.push(87, 65, 86, 69, 102, 109, 116, 32); w32(16); w16(1); w16(1); w32(8000); w32(16000); w16(2); w16(16);
    bytes.push(100, 97, 116, 97); w32(n * 2); for (i = 0; i < n * 2; i++) bytes.push(0);
    return 'data:audio/wav;base64,' + G.btoa(String.fromCharCode.apply(null, bytes));
  }
  var IS_IOS = /iP(hone|ad|od)/.test(G.navigator.userAgent) || (G.navigator.platform === 'MacIntel' && G.navigator.maxTouchPoints > 1);

  var AudioManager = {
    supported: !!Ctor, ctx: null, unlocked: false, muted: false,
    vol: { master: .8, bgm: .45, sfx: .9 },
    maxVoices: 14, defs: SFX, tracks: TRACKS,
    _v: [], _last: {}, _buf: {}, _loads: null, _noise: null, _bgm: null, _want: null,
    _timer: 0, _step: 0, _nextT: 0, _inited: false, _hid: false, _cbs: [], _silent: null,

    /* 只需呼叫一次（重複呼叫安全）。不會建立 AudioContext，要等手勢。 */
    init: function () {
      if (this._inited) return this; this._inited = true;
      var SM = G.SaveManager, self = this;
      if (SM) { var s = SM.section('audio', this.vol); this.vol.master = clamp01(s.master); this.vol.bgm = clamp01(s.bgm); this.vol.sfx = clamp01(s.sfx); this.muted = SM.isMuted(); }
      if (!Ctor) return this;
      try { if (G.navigator.audioSession) G.navigator.audioSession.type = 'playback'; } catch (e) {}
      var h = function () { self._gesture(); };
      /* iOS 只承認 touchend/click 等「完成型」手勢，touchstart 不能解鎖 */
      ['touchend', 'pointerup', 'mouseup', 'click', 'keydown'].forEach(function (ev) { G.addEventListener(ev, h, true); });
      G.document.addEventListener('visibilitychange', function () { self._vis(); });
      G.addEventListener('pagehide', function () { if (self.ctx && self.ctx.suspend) try { self.ctx.suspend(); } catch (e) {} });
      return this;
    },
    unlock: function () { this._gesture(); return this.unlocked; },
    isUnlocked: function () { return this.unlocked; },
    onUnlock: function (cb) { if (this.unlocked) { try { cb(); } catch (e) {} } else this._cbs.push(cb); },

    _gesture: function () {
      if (!Ctor) return;
      if (this.ctx && this.ctx.state === 'running') return;      // 已啟動：此 handler 幾乎零成本
      var self = this;
      try {
        if (!this.ctx) this._create();
        var c = this.ctx; if (!c) return;
        this._prime();
        var r = c.resume && c.resume();
        if (r && r.then) r.then(function () { self._ready(); }, noop); else this._ready();
        if (IS_IOS && !G.navigator.audioSession && !this._silent) {
          try { var a = new G.Audio(silentWavUri()); a.loop = true; a.volume = .01; this._silent = a; var pr = a.play(); if (pr && pr.catch) pr.catch(noop); } catch (e) {}
        }
      } catch (e) {}
    },
    _create: function () {
      var c; try { c = new Ctor({ latencyHint: 'interactive' }); } catch (e) { try { c = new Ctor(); } catch (e2) { this.supported = false; return; } }
      this.ctx = c;
      this.master = c.createGain(); this.sfxGain = c.createGain(); this.bgmGain = c.createGain();
      var comp = c.createDynamicsCompressor ? c.createDynamicsCompressor() : null;
      if (comp) { try { comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 6; comp.attack.value = .003; comp.release.value = .2; } catch (e) {} }
      this.sfxGain.connect(this.master); this.bgmGain.connect(this.master);
      if (comp) { this.master.connect(comp); comp.connect(c.destination); } else this.master.connect(c.destination);
      this._applyGains(true);
      var len = (c.sampleRate * 1.5) | 0, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0), i;
      for (i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this._noise = buf;
      var self = this; c.onstatechange = function () { if (c.state === 'running') self._ready(); };
      if (this._loads) { var L = this._loads; this._loads = null; this.load(L); }
    },
    _prime: function () {                                          // 舊版 iOS：播放一個靜音 buffer 完成解鎖
      try { var c = this.ctx, b = c.createBuffer(1, 1, 22050), s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); if (s.start) s.start(0); else s.noteOn(0); } catch (e) {}
    },
    _ready: function () {
      if (!this.ctx || this.ctx.state !== 'running' || this.unlocked) { return; }
      this.unlocked = true;
      var cbs = this._cbs; this._cbs = []; cbs.forEach(function (f) { try { f(); } catch (e) {} });
      if (this._want) { var w = this._want; this._want = null; this.playBGM(w.name, w.o); }
    },
    _vis: function () {
      if (!this.ctx) return;
      if (G.document.hidden) { this._hid = true; try { this.ctx.suspend(); } catch (e) {} if (this._silent) try { this._silent.pause(); } catch (e) {} }
      else if (this._hid) { this._hid = false; try { var r = this.ctx.resume(); if (r && r.catch) r.catch(noop); } catch (e) {} if (this._silent) try { this._silent.play(); } catch (e) {} }
    },
    _applyGains: function (now) {
      if (!this.ctx) return; var t = this.ctx.currentTime, k = now ? 0 : .02;
      try {
        this.master.gain.setTargetAtTime(this.muted ? 0 : this.vol.master, t, k || .001);
        this.sfxGain.gain.setTargetAtTime(this.vol.sfx, t, k || .001);
        this.bgmGain.gain.setTargetAtTime(this.vol.bgm, t, k || .001);
      } catch (e) { this.master.gain.value = this.muted ? 0 : this.vol.master; this.sfxGain.gain.value = this.vol.sfx; this.bgmGain.gain.value = this.vol.bgm; }
    },
    _save: function () { var SM = G.SaveManager; if (SM) SM.saveSection('audio', { master: this.vol.master, bgm: this.vol.bgm, sfx: this.vol.sfx }); },

    /* ---------- 音量 / 靜音 ---------- */
    setMasterVolume: function (v) { this.vol.master = clamp01(v); this._applyGains(); this._save(); },
    setBGMVolume: function (v) { this.vol.bgm = clamp01(v); this._applyGains(); this._save(); },
    setSFXVolume: function (v) { this.vol.sfx = clamp01(v); this._applyGains(); this._save(); },
    getVolumes: function () { return { master: this.vol.master, bgm: this.vol.bgm, sfx: this.vol.sfx }; },
    mute: function () { this.muted = true; this._applyGains(); if (G.SaveManager) SaveManager.setMuted(true); },
    unmute: function () { this.muted = false; this._applyGains(); if (G.SaveManager) SaveManager.setMuted(false); },
    toggleMute: function () { if (this.muted) this.unmute(); else this.mute(); return this.muted; },
    isMuted: function () { return this.muted; },
    setMaxVoices: function (n) { this.maxVoices = Math.max(2, n | 0); },
    setEventConfig: function (name, cfg) { var d = this.defs[name]; if (d) for (var k in cfg) d[k] = cfg[k]; },
    registerSound: function (name, def) { this.defs[name] = def; },
    registerTrack: function (name, def) { this.tracks[name] = def; },

    /* 選用：外部音檔（不存在就忽略，繼續用合成音） */
    load: function (map) {
      if (!this.ctx) { this._loads = Object.assign(this._loads || {}, map); return; }
      var self = this, c = this.ctx;
      Object.keys(map).forEach(function (name) {
        try {
          G.fetch(map[name]).then(function (r) { if (!r.ok) throw 0; return r.arrayBuffer(); }).then(function (ab) {
            var ok = function (b) { self._buf[name] = b; };
            var p = c.decodeAudioData(ab, ok, noop); if (p && p.then) p.then(ok, noop);
          }).catch(noop);
        } catch (e) {}
      });
    },

    /* ---------- SFX ---------- */
    _prune: function (now) { var v = this._v, i = v.length; while (i--) if (v[i].end < now) v.splice(i, 1); },
    _kill: function (voice) { voice.nodes.forEach(function (n) { try { n.stop(0); } catch (e) {} }); voice.end = 0; },
    _steal: function (pred) {                                      // 擠掉符合條件、優先權最低（同優先權取最舊）的 voice
      var v = this._v, best = -1, i;
      for (i = 0; i < v.length; i++) if (pred(v[i]) && (best < 0 || v[i].pri < v[best].pri)) best = i;
      if (best < 0) return false; this._kill(v[best]); v.splice(best, 1); return true;
    },
    stats: function () { return { state: this.ctx ? this.ctx.state : 'none', unlocked: this.unlocked, voices: this._v.length, bgm: this._bgm ? this._bgm.name : null }; },

    /* AudioManager.play('coin_collect', {pitch:1.1, vol:.8, delay:.2, variant:3}) → 是否有實際發聲 */
    play: function (name, o) {
      var c = this.ctx;
      if (!c || c.state !== 'running' || this.muted) return false;
      var def = this.defs[name]; if (!def) return false;
      o = o || {};
      var ms = G.performance.now();
      if (ms - (this._last[name] || -1e9) < (def.cd || 0)) return false;
      var now = c.currentTime, st = now + (o.delay || 0), pri = def.pri || 1, i, cnt = 0;
      this._prune(now);
      for (i = 0; i < this._v.length; i++) if (this._v[i].name === name) cnt++;
      if (cnt >= (def.max || 3) && !this._steal(function (x) { return x.name === name; })) return false;
      if (this._v.length >= this.maxVoices && !this._steal(function (x) { return x.pri < pri; })) return false;
      this._last[name] = ms;
      var voice = { name: name, pri: pri, end: st, nodes: [] };
      var vm = (o.vol == null ? 1 : o.vol), pm = (o.pitch || 1) * (1 + (Math.random() - .5) * (def.jit || .03));
      if (this._buf[name]) {
        try { var s = c.createBufferSource(), g = c.createGain(); s.buffer = this._buf[name]; g.gain.value = vm; s.connect(g); g.connect(this.sfxGain);
          s.playbackRate.value = pm; s.start(st); voice.nodes.push(s); voice.end = st + s.buffer.duration / pm;
          s.onended = function () { try { s.disconnect(); g.disconnect(); } catch (e) {} }; } catch (e) { return false; }
      } else {
        var L = typeof def.L === 'function' ? def.L(o) : def.L, e0 = st;
        for (i = 0; i < L.length; i++) { var end = this._layer(L[i], st, vm, pm, voice); if (end > e0) e0 = end; }
        voice.end = e0 + .05;
      }
      this._v.push(voice);
      return true;
    },
    stopAllSFX: function () { var v = this._v; for (var i = 0; i < v.length; i++) this._kill(v[i]); this._v.length = 0; },

    _layer: function (L, st, vm, pm, voice) {
      var c = this.ctx, d = L.d, end = st + L.t + d, t0 = st + L.t, v = (L.v || .1) * vm, g = c.createGain(), src, flt = null;
      g.gain.setValueAtTime(.0001, t0);
      g.gain.linearRampToValueAtTime(v, t0 + .004);
      g.gain.exponentialRampToValueAtTime(.0001, end);
      if (L.w === 'noise') {
        src = c.createBufferSource(); src.buffer = this._noise; src.loop = true;
        flt = c.createBiquadFilter(); flt.type = L.ft || 'lowpass';
        flt.frequency.setValueAtTime(Math.max(40, L.f[0] * pm), t0);
        flt.frequency.exponentialRampToValueAtTime(Math.max(40, L.f[1] * pm), end);
        if (L.q) flt.Q.value = L.q;
        src.connect(flt); flt.connect(g);
        src.start(t0, Math.random() * 0.5);
      } else {
        src = c.createOscillator(); src.type = L.w;
        src.frequency.setValueAtTime(Math.max(20, L.f[0] * pm), t0);
        if (L.f[1] !== L.f[0]) src.frequency.exponentialRampToValueAtTime(Math.max(20, L.f[1] * pm), end);
        src.connect(g); src.start(t0);
      }
      g.connect(this.sfxGain);
      src.stop(end + .03);
      src.onended = function () { try { src.disconnect(); g.disconnect(); if (flt) flt.disconnect(); } catch (e) {} };
      voice.nodes.push(src);
      return end;
    },

    /* ---------- BGM ---------- */
    /* playBGM('stage0', {fade:.5, delay:0, restart:false}) —— 尚未解鎖時先記住，解鎖後自動補播 */
    playBGM: function (name, o) {
      o = o || {};
      if (!Ctor || !this.tracks[name]) return false;
      this._want = { name: name, o: o };
      var c = this.ctx;
      if (!c || c.state !== 'running') return true;
      this._want = null;
      if (this._bgm && this._bgm.name === name && !o.restart) return true;
      this._startBGM(name, o); return true;
    },
    _startBGM: function (name, o) {
      var c = this.ctx, now = c.currentTime, fade = o.fade == null ? .5 : o.fade, dl = o.delay || 0;
      this._endBGM(Math.min(.4, fade));
      var env = c.createGain(); env.gain.setValueAtTime(.0001, now);
      env.gain.setValueAtTime(.0001, now + dl); env.gain.exponentialRampToValueAtTime(1, now + dl + Math.max(.05, fade));
      env.connect(this.bgmGain);
      this._bgm = { name: name, track: this.tracks[name], steps: buildTrack(this.tracks[name]), env: env };
      this._step = 0; this._nextT = now + dl + .05;
      if (!this._timer) { var self = this; this._timer = G.setInterval(function () { self._tick(); }, 40); }
    },
    _endBGM: function (fade) {
      var b = this._bgm; if (!b) return; this._bgm = null;
      var c = this.ctx, now = c.currentTime, env = b.env;
      try { env.gain.cancelScheduledValues(now); env.gain.setValueAtTime(Math.max(env.gain.value, .0001), now); env.gain.exponentialRampToValueAtTime(.0001, now + fade); } catch (e) {}
      G.setTimeout(function () { try { env.disconnect(); } catch (e) {} }, (fade + .7) * 1000);
    },
    stopBGM: function (o) {
      this._want = null;
      if (this.ctx && this._bgm) this._endBGM((o && o.fade != null) ? o.fade : .4);
      if (this._timer) { G.clearInterval(this._timer); this._timer = 0; }
    },
    currentBGM: function () { return this._bgm ? this._bgm.name : null; },
    _tick: function () {
      var b = this._bgm, c = this.ctx;
      if (!b || !c || c.state !== 'running') return;
      var sd = 60 / b.track.bpm / 4, n = b.steps.length, guard = 0;
      while (this._nextT < c.currentTime + .18 && guard++ < 8) {
        if (this._nextT < c.currentTime - .5) this._nextT = c.currentTime + .02;     // 長時間卡頓後不補播
        if (!this.muted) this._playStep(b, b.steps[this._step % n], this._nextT, sd);
        this._nextT += sd; this._step++;
      }
    },
    _note: function (dest, t, f, d, w, v) {
      var c = this.ctx, o = c.createOscillator(), g = c.createGain();
      o.type = w; o.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(v, t + .006); g.gain.exponentialRampToValueAtTime(.0001, t + d);
      o.connect(g); g.connect(dest); o.start(t); o.stop(t + d + .03);
      o.onended = function () { try { o.disconnect(); g.disconnect(); } catch (e) {} };
    },
    _noiseHit: function (dest, t, d, f, type, v) {
      var c = this.ctx, s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
      s.buffer = this._noise; s.loop = true; fl.type = type; fl.frequency.value = f;
      g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.0001, t + d);
      s.connect(fl); fl.connect(g); g.connect(dest); s.start(t, Math.random() * .5); s.stop(t + d + .02);
      s.onended = function () { try { s.disconnect(); fl.disconnect(); g.disconnect(); } catch (e) {} };
    },
    _playStep: function (b, st, t, sd) {
      var env = b.env, tr = b.track;
      if (st.bass) this._note(env, t, mtof(st.bass), sd * 1.9, tr.bassSaw ? 'sawtooth' : 'triangle', tr.bassSaw ? .11 : .2);
      if (st.lead) this._note(env, t, mtof(st.lead), sd * 1.6, tr.lead, .06);
      if (st.kick) { var o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(40, t + .1);
        g.gain.setValueAtTime(.32, t); g.gain.exponentialRampToValueAtTime(.0001, t + .13); o.connect(g); g.connect(env); o.start(t); o.stop(t + .15);
        o.onended = function () { try { o.disconnect(); g.disconnect(); } catch (e) {} }; }
      if (st.snare) this._noiseHit(env, t, .09, 1800, 'bandpass', .12);
      if (st.hat) this._noiseHit(env, t, .03, 7000, 'highpass', .04);
    }
  };

  G.AudioManager = AudioManager;
})(window);
