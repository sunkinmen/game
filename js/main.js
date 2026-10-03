/* 啟動入口：所有相依模組先載入，再建立 Phaser Game。
 * 這裡刻意不把 sw.js 當普通 script 載入；Service Worker 必須透過 navigator.serviceWorker.register() 註冊。
 */
(function (G) {
  'use strict';

  function showBootError(err) {
    var box = G.document.getElementById('boot-error');
    if (!box) return;
    var msg = err && (err.stack || err.message) ? (err.stack || err.message) : String(err || 'Unknown error');
    box.textContent = '遊戲啟動失敗\n\n' + msg + '\n\n請重新整理頁面；若仍失敗，請檢查瀏覽器 Console。';
    box.style.display = 'block';
  }

  function refreshLayout() {
    try {
      if (G.TouchUI && G.TouchUI.layout) G.TouchUI.layout();
      if (G.game && G.game.scale) G.game.scale.refresh();
    } catch (e) {}
  }

  function boot() {
    try {
      if (!G.Phaser) throw new Error('Phaser 尚未載入。請確認網路可以存取 cdnjs.cloudflare.com。');
      /* game.js 使用 classic script 的全域 lexical class Game，不會自動成為 window.Game。
       * 其他模組則刻意掛在 window 上；因此這裡要用 typeof Game 檢查，而不是 G.Game。 */
      if (!G.AudioManager || !G.InputManager || !G.TouchUI || typeof Game === 'undefined') {
        var missing = [];
        if (!G.AudioManager) missing.push('AudioManager');
        if (!G.InputManager) missing.push('InputManager');
        if (!G.TouchUI) missing.push('TouchUI');
        if (typeof Game === 'undefined') missing.push('Game');
        throw new Error('遊戲模組未完整載入：' + missing.join(', ') + '\n請確認 js/ 資料夾、檔案載入順序與 index.html 位於同一網站根目錄。');
      }

      G.AudioManager.init();
      G.InputManager.init();
      G.TouchUI.init();

      G.game = new G.Phaser.Game({
        type: G.Phaser.AUTO,
        width: G.W,
        height: G.H,
        backgroundColor: '#07080c',
        pixelArt: true,
        audio: { noAudio: true },
        scale: {
          mode: G.Phaser.Scale.FIT,
          autoCenter: G.Phaser.Scale.CENTER_BOTH,
          width: G.W,
          height: G.H,
          expandParent: true
        },
        input: { activePointers: 6 },
        scene: Game
      });

      G.addEventListener('resize', refreshLayout, { passive: true });
      G.addEventListener('orientationchange', function () {
        refreshLayout();
        G.setTimeout(refreshLayout, 250);
        G.setTimeout(refreshLayout, 700);
      }, { passive: true });

      if ('serviceWorker' in G.navigator) {
        G.addEventListener('load', function () {
          G.navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(function (e) {
            /* SW 失敗不能阻止遊戲本體運作 */
            try { console.warn('Service Worker registration skipped:', e); } catch (_) {}
          });
        }, { once: true });
      }
    } catch (e) {
      try { console.error(e); } catch (_) {}
      showBootError(e);
    }
  }

  if (G.document.readyState === 'loading') G.document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})(window);
