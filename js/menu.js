/* Menu — 暫停 / 設定面板（單一 DOM 面板，第一次開啟才建立，關閉時 display:none）
 * 內容：音量、靜音、螢幕震動強度、按鈕大小/透明度/間距、左右手、觸控鍵顯示、手機震動
 * 開啟時 InputManager.setModal(true)：遊戲輸入暫停，面板內的滑桿/按鈕可正常觸控 */
(function (G) {
  'use strict';
  var D = G.document, AM = G.AudioManager, CS = G.ControlSettings, IM = G.InputManager;
  var el = null, isOpen = false, hooks = [], lastClick = 0;

  var CSS = '#tgm{position:fixed;inset:0;z-index:20;background:rgba(0,0,0,.72);display:none;align-items:center;justify-content:center;font:14px/1.3 sans-serif;color:#fff}' +
    '#tgm .pn{width:min(94vw,640px);max-height:92%;overflow-y:auto;-webkit-overflow-scrolling:touch;touch-action:pan-y;background:linear-gradient(#26305a,#0d1124);border:3px solid #f2c14e;border-radius:14px;padding:10px 16px;box-sizing:border-box;box-shadow:0 0 0 2px #0a0c18,0 8px 30px rgba(0,0,0,.6),inset 0 0 0 2px rgba(255,255,255,.12)}' +
    '#tgm h2{margin:0 0 6px;font-size:18px;color:#ffe9a0;text-shadow:0 2px 0 #0a0c18}#tgm h3{margin:8px 0 4px;font-size:13px;color:#8fc4ff;border-bottom:1px solid rgba(242,193,78,.4);padding-bottom:2px}' +
    '#tgm .cols{display:flex;gap:18px;flex-wrap:wrap}#tgm .col{flex:1 1 240px;min-width:0}' +
    '#tgm label{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:5px 0;min-height:30px}' +
    '#tgm input[type=range]{flex:1;max-width:150px;height:28px}#tgm select{font-size:14px;padding:3px}' +
    '#tgm input[type=checkbox]{width:22px;height:22px}' +
    '#tgm button{font-size:15px;padding:8px 16px;margin:8px 8px 2px 0;border:2px solid #f2c14e;border-radius:8px;background:linear-gradient(#4a8cff,#2a5ac0);color:#fff;min-height:40px;font-weight:700;text-shadow:0 1px 0 #0a0c18}' +
    '#tgm button.s{background:linear-gradient(#5a617a,#3a4056);border-color:#9aa0b8}';

  var HTML = '<div class="pn"><h2>⏸ 暫停 / 設定</h2><div class="cols"><div class="col"><h3>音訊</h3>' +
    '<label>主音量<input type="range" min="0" max="100" data-k="a_master"></label>' +
    '<label>音樂<input type="range" min="0" max="100" data-k="a_bgm"></label>' +
    '<label>音效<input type="range" min="0" max="100" data-k="a_sfx"></label>' +
    '<label>靜音<input type="checkbox" data-k="a_mute"></label>' +
    '<h3>畫面</h3><label>螢幕震動<input type="range" min="0" max="200" data-k="f_shake"></label></div>' +
    '<div class="col"><h3>操作</h3>' +
    '<label>按鈕大小<input type="range" min="70" max="150" data-k="c_buttonSize"></label>' +
    '<label>按鈕透明度<input type="range" min="15" max="90" data-k="c_buttonOpacity"></label>' +
    '<label>按鈕間距<input type="range" min="60" max="160" data-k="c_buttonSpacing"></label>' +
    '<label>慣用手<select data-k="c_hand"><option value="r">右手（左移動/右動作）</option><option value="l">左手（右移動/左動作）</option></select></label>' +
    '<label>觸控按鈕<select data-k="c_show"><option value="auto">自動</option><option value="on">一律顯示</option><option value="off">隱藏</option></select></label>' +
    '<label>手機震動<input type="checkbox" data-k="c_vib"></label></div></div>' +
    '<button data-k="resume">▶ 繼續遊戲</button><button class="s" data-k="reset">還原操作預設</button></div>';

  function q(k) { return el.querySelector('[data-k="' + k + '"]'); }
  function click() { var n = G.performance.now(); if (n - lastClick > 120) { lastClick = n; AM.play('button_click'); } }

  function sync() {
    var v = AM.getVolumes(), s = CS.data, fx = G.CombatFeedback ? CombatFeedback.settings : { shake: 1 };
    q('a_master').value = Math.round(v.master * 100); q('a_bgm').value = Math.round(v.bgm * 100); q('a_sfx').value = Math.round(v.sfx * 100);
    q('a_mute').checked = AM.isMuted(); q('f_shake').value = Math.round(fx.shake * 100);
    q('c_buttonSize').value = Math.round(s.buttonSize * 100); q('c_buttonOpacity').value = Math.round(s.buttonOpacity * 100); q('c_buttonSpacing').value = Math.round(s.buttonSpacing * 100);
    q('c_hand').value = s.leftHandMode ? 'l' : 'r'; q('c_show').value = s.showTouchControls; q('c_vib').checked = s.vibrationEnabled;
  }

  function build() {
    var st = D.createElement('style'); st.textContent = CSS; D.head.appendChild(st);
    el = D.createElement('div'); el.id = 'tgm'; el.setAttribute('data-tg-modal', '1'); el.innerHTML = HTML; D.body.appendChild(el);
    var num = function (k) { return +q(k).value / 100; };
    var on = function (k, ev, fn) { q(k).addEventListener(ev, fn); };
    on('a_master', 'input', function () { AM.setMasterVolume(num('a_master')); });
    on('a_bgm', 'input', function () { AM.setBGMVolume(num('a_bgm')); });
    on('a_sfx', 'input', function () { AM.setSFXVolume(num('a_sfx')); });
    on('a_sfx', 'change', click);
    on('a_mute', 'change', function () { if (q('a_mute').checked) AM.mute(); else { AM.unmute(); click(); } });
    on('f_shake', 'input', function () { if (G.CombatFeedback) CombatFeedback.setShakeScale(num('f_shake')); });
    on('c_buttonSize', 'input', function () { CS.set('buttonSize', num('c_buttonSize')); });
    on('c_buttonOpacity', 'input', function () { CS.set('buttonOpacity', num('c_buttonOpacity')); });
    on('c_buttonSpacing', 'input', function () { CS.set('buttonSpacing', num('c_buttonSpacing')); });
    on('c_hand', 'change', function () { CS.set('leftHandMode', q('c_hand').value === 'l'); click(); });
    on('c_show', 'change', function () { CS.set('showTouchControls', q('c_show').value); click(); });
    on('c_vib', 'change', function () { CS.set('vibrationEnabled', q('c_vib').checked); if (q('c_vib').checked) IM.vibrate(30); });
    on('resume', 'click', function () { Menu.close(); });
    on('reset', 'click', function () { CS.reset(); sync(); click(); });
    /* 面板內的觸控不要被遊戲層攔截；點背景空白處 = 繼續 */
    el.addEventListener('click', function (e) { if (e.target === el) Menu.close(); });
  }

  var Menu = {
    isOpen: function () { return isOpen; },
    /* 場景註冊 open/close 回呼，回傳取消註冊函式 */
    bind: function (h) { hooks.push(h); return function () { var i = hooks.indexOf(h); if (i >= 0) hooks.splice(i, 1); }; },
    open: function () {
      if (isOpen) return; if (!el) build();
      isOpen = true; sync(); el.style.display = 'flex'; IM.setModal(true);
      AM.play('menu_open');
      hooks.slice().forEach(function (h) { if (h.open) h.open(); });
    },
    close: function () {
      if (!isOpen) return; isOpen = false; el.style.display = 'none'; IM.setModal(false);
      AM.play('menu_close');
      if (G.SaveManager) SaveManager.flush();
      hooks.slice().forEach(function (h) { if (h.close) h.close(); });
    },
    toggle: function () { if (isOpen) this.close(); else this.open(); }
  };
  /* 切到背景自動暫停（只在有場景註冊時） */
  D.addEventListener('visibilitychange', function () { if (D.hidden && hooks.length && !isOpen) Menu.open(); });
  G.Menu = Menu;
})(window);
