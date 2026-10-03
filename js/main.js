/* 啟動入口：先確認所有模組，再建立 Phaser。 */
(function (G) {
  'use strict';

  function showError(err) {
    var box = G.document.getElementById('boot-error');
    var msg = err && (err.stack || err.message) ? (err.stack || err.message) : String(err || 'Unknown error');
    try { console.error('[Taipei Street Shooter]', err); } catch (_) {}
    if (box) { box.textContent = '遊戲啟動失敗\n\n' + msg; box.style.display = 'block'; }
  }

  function refresh() {
    try { if (G.TouchUI) G.TouchUI.layout(); } catch (_) {}
    try { if (G.game && G.game.scale) G.game.scale.refresh(); } catch (_) {}
  }

  function boot() {
    try {
      if (!G.Phaser) throw new Error('Phaser 尚未載入');
      if (!G.AudioManager || !G.InputManager || !G.TouchUI || !G.Game)
        throw new Error('遊戲模組未完整載入：' +
          ['AudioManager','InputManager','TouchUI','Game'].filter(function (k) { return !G[k]; }).join(', '));

      G.AudioManager.init();
      G.InputManager.init();
      G.TouchUI.init();

      G.game = new G.Phaser.Game({
        type: G.Phaser.CANVAS,
        width: G.W,
        height: G.H,
        parent: 'game-root',
        backgroundColor: '#07080c',
        pixelArt: true,
        antialias: false,
        audio: { noAudio: true },
        scale: {
          mode: G.Phaser.Scale.ENVELOP,
          autoCenter: G.Phaser.Scale.CENTER_BOTH,
          width: G.W,
          height: G.H,
          expandParent: true
        },
        render: { antialias: false, roundPixels: true },
        input: { activePointers: 6 },
        scene: G.Game
      });

      G.addEventListener('error', function(ev){ showError(ev.error || new Error(ev.message || 'Runtime error')); }, { passive: true });
      G.addEventListener('unhandledrejection', function(ev){ showError(ev.reason || new Error('Unhandled promise rejection')); }, { passive: true });
      G.addEventListener('resize', refresh, { passive: true });
      G.addEventListener('orientationchange', function () {
        refresh(); G.setTimeout(refresh, 250); G.setTimeout(refresh, 700);
      }, { passive: true });

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
