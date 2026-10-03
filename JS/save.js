/* SaveManager — 所有 localStorage 讀寫集中於此
 * - Safari 無痕模式 / 儲存空間滿 / 被停用時，自動退回記憶體，不丟例外
 * - 沿用舊版 key：'mute'、'best'，舊存檔不會遺失
 * - 設定（音量/操作/特效）統一存在 'tg_settings' 一個 JSON，寫入有 debounce */
(function (G) {
  'use strict';
  var mem = {}, timer = 0, pending = null;
  function ls() { try { return G.localStorage; } catch (e) { return null; } }
  var SaveManager = {
    get: function (k, d) {
      try { var s = ls(); var v = s ? s.getItem(k) : null; if (v == null) v = mem[k]; return v == null ? d : v; }
      catch (e) { return mem[k] != null ? mem[k] : d; }
    },
    set: function (k, v) {
      v = String(v); mem[k] = v;
      try { var s = ls(); if (s) s.setItem(k, v); } catch (e) {}
    },
    getJSON: function (k, d) { try { var v = this.get(k, null); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    setJSON: function (k, o) { try { this.set(k, JSON.stringify(o)); } catch (e) {} },
    /* 讀取設定區塊：缺的欄位用 defaults 補 */
    section: function (name, defaults) {
      var all = pending || this.getJSON('tg_settings', {}), src = (all && all[name]) || {}, o = {}, k;
      for (k in defaults) o[k] = src[k] !== undefined ? src[k] : defaults[k];
      return o;
    },
    /* 寫入設定區塊（200ms debounce，避免拉滑桿時狂寫） */
    saveSection: function (name, obj) {
      var self = this;
      pending = pending || this.getJSON('tg_settings', {});
      pending[name] = obj;
      clearTimeout(timer);
      timer = setTimeout(function () { var p = pending; pending = null; self.setJSON('tg_settings', p); }, 200);
    },
    flush: function () { if (pending) { clearTimeout(timer); var p = pending; pending = null; this.setJSON('tg_settings', p); } },
    isMuted: function () { return this.get('mute', '0') === '1'; },
    setMuted: function (b) { this.set('mute', b ? '1' : '0'); },
    getBest: function () { return +this.get('best', 0) || 0; },
    setBest: function (n) { var b = Math.max(n, this.getBest()); this.set('best', b); return b; }
  };
  G.addEventListener('pagehide', function () { SaveManager.flush(); });
  G.SaveManager = SaveManager;
})(window);
