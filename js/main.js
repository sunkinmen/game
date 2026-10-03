/* 啟動入口：先確認所有模組，再建立 Phaser。 */
(function (G) {
  'use strict';

  function showError(err) {
    var box = G.document.getElementById('boot-error');
    var msg = err && (err.stack || err.message) ? (err.stack || err.message) : String(err || 'Unknown error');
    try { console.error('[Taipei Street Shooter]', err); } catch (_) {}
    if (box) { box.textContent = '遊戲啟動失敗\n\n' + msg; box.style.display = 'block'; }
  }

  /* Safari 分頁列／工具列會改動 visualViewport；用 innerHeight + visualViewport
     把 body 高度鎖在「實際可見區」，再叫 Phaser scale.refresh()，避免畫面下半被擠出。 */
  function fitViewport() {
    var h = G.innerHeight;
    var vv = G.visualViewport;
    if (vv && vv.height > 0) {
      /* visualViewport 更貼近 Safari 目前可見高度（含分頁列收合） */
      h = Math.round(vv.height);
    }
    if (h > 0) {
      try {
        G.document.documentElement.style.height = h + 'px';
        G.document.body.style.height = h + 'px';
      } catch (_) {}
    }
  }

  function refresh() {
    fitViewport();
    try { if (G.TouchUI) G.TouchUI.layout(); } catch (_) {}
    try { if (G.game && G.game.scale) G.game.scale.refresh(); } catch (_) {}
  }

  function boot() {
    try {
      if (!G.Phaser) throw new Error('Phaser 尚未載入');
      if (!G.AudioManager || !G.InputManager || !G.TouchUI || !G.Game || !G.Boot)
        throw new Error('遊戲模組未完整載入：' +
          ['AudioManager','InputManager','TouchUI','Game','Boot'].filter(function (k) { return !G[k]; }).join(', '));

      fitViewport();

      G.AudioManager.init();
      G.InputManager.init();
      G.TouchUI.init();

      G.game = new G.Phaser.Game({
        type: G.Phaser.AUTO,
        width: G.W,
        height: G.H,
        parent: document.body,
        backgroundColor: '#07080c',
        pixelArt: true,
        antialias: false,
        audio: { noAudio: true },
        scale: {
          mode: G.Phaser.Scale.FIT,
          autoCenter: G.Phaser.Scale.CENTER_BOTH,
          width: G.W,
          height: G.H,
          expandParent: false
        },
        render: { antialias: false, roundPixels: true },
        input: { activePointers: 6 },
        scene: [G.Boot, G.Game]
      });

      G.addEventListener('resize', refresh, { passive: true });
      G.addEventListener('orientationchange', function () {
        refresh(); G.setTimeout(refresh, 250); G.setTimeout(refresh, 700);
      }, { passive: true });

      /* Safari 分頁列收合／展開主要靠 visualViewport */
      if (G.visualViewport) {
        G.visualViewport.addEventListener('resize', refresh, { passive: true });
        G.visualViewport.addEventListener('scroll', refresh, { passive: true });
      }

      /* 頁面從背景回來、或工具列動畫結束後再對一次 */
      G.addEventListener('pageshow', function () { refresh(); G.setTimeout(refresh, 100); }, { passive: true });
      G.addEventListener('focus', function () { G.setTimeout(refresh, 50); }, { passive: true });

      if ('serviceWorker' in G.navigator) {
        G.addEventListener('load', function () {
          G.navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(function (e) {
            try { console.warn('Service Worker skipped:', e); } catch (_) {}
          });
        }, { once: true });
      }
    } catch (e) { showError(e); }
  }

  if (G.document.readyState === 'loading') G.document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})(window);
