/* Stylize — 像素 sprite 風格化後處理（Q 版 + 插畫感）
 * 輸入：原本的字元網格 (rows) 與色盤 (PAL)。輸出：同樣大小(+邊框)的 canvas。
 * 處理步驟（全部在建立貼圖時做一次，遊戲中零成本）：
 *   1. 以 px 放大成像素塊（維持原本的像素風）
 *   2. 外凸轉角削圓 1 像素 → 輪廓圓潤、可愛，不再是方塊
 *   3. 受光面（左上）提亮、背光面（右下）壓暗 → 立體感
 *   4. 上亮下暗的整體漸層
 *   5. 彩色外框：取相鄰顏色混入深紫褐色，而不是死黑 → 像插畫的描邊
 * 貼圖尺寸：寬 +2、高 +1（左右與上方各 1px 外框；底部不加，讓腳底仍貼齊地面） */
(function (G) {
  'use strict';
  var OUT = [26, 15, 42];

  function parse(c) {
    if (c.charAt(0) !== '#') return [255, 0, 255];
    if (c.length === 4) return [parseInt(c[1] + c[1], 16), parseInt(c[2] + c[2], 16), parseInt(c[3] + c[3], 16)];
    return [parseInt(c.substr(1, 2), 16), parseInt(c.substr(3, 2), 16), parseInt(c.substr(5, 2), 16)];
  }
  function mixc(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

  /* opt: { noOutline, noShade, round (預設 true), outline (0~1 外框濃度) } */
  function render(rows, PAL, px, opt) {
    opt = opt || {};
    var gw = rows[0].length, gh = rows.length, W = gw * px + 2, H = gh * px + 1, x, y, i, j, k;
    var cols = [], cache = {};
    var cell = function (ci, cj) { if (ci < 0 || cj < 0 || ci >= gw || cj >= gh) return null; var ch = rows[cj].charAt(ci); if (!PAL[ch]) return null; return cache[ch] || (cache[ch] = parse(PAL[ch])); };
    var buf = new Array(W * H);                      // 每格存 [r,g,b] 或 undefined
    for (j = 0; j < gh; j++) for (i = 0; i < gw; i++) {
      var c = cell(i, j); if (!c) continue;
      for (y = 0; y < px; y++) for (x = 0; x < px; x++) buf[(1 + j * px + y) * W + 1 + i * px + x] = c;
      if (opt.round !== false && px >= 2) {          // 外凸轉角削圓
        var U = !cell(i, j - 1), D = !cell(i, j + 1), L = !cell(i - 1, j), R = !cell(i + 1, j);
        if (U && L) buf[(1 + j * px) * W + 1 + i * px] = undefined;
        if (U && R) buf[(1 + j * px) * W + 1 + i * px + px - 1] = undefined;
        if (D && L) buf[(1 + j * px + px - 1) * W + 1 + i * px] = undefined;
        if (D && R) buf[(1 + j * px + px - 1) * W + 1 + i * px + px - 1] = undefined;
      }
    }
    var has = function (xx, yy) { return xx >= 0 && yy >= 0 && xx < W && yy < H && !!buf[yy * W + xx]; };
    var out = new Array(W * H);
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      var p = buf[y * W + x];
      if (p) {
        var col = p;
        if (!opt.noShade) {
          var t = 1.05 - .14 * (y / H);                         // 上亮下暗
          col = [p[0] * t, p[1] * t, p[2] * t];
          if (!has(x, y - 1)) col = mixc(col, [255, 255, 255], .26);        // 上緣受光
          else if (!has(x - 1, y)) col = mixc(col, [255, 255, 255], .12);   // 左緣受光
          if (!has(x + 1, y)) col = mixc(col, [20, 10, 40], .2);            // 右緣背光
        }
        if (!opt.noOutline && y === H - 1) col = mixc(col, OUT, .55);       // 腳底：以內縮的暗邊代替外框
        out[y * W + x] = col;
      } else if (!opt.noOutline) {
        var n = null;
        if (has(x, y + 1)) n = buf[(y + 1) * W + x]; else if (has(x - 1, y)) n = buf[y * W + x - 1]; else if (has(x + 1, y)) n = buf[y * W + x + 1]; else if (has(x, y - 1)) n = buf[(y - 1) * W + x];
        if (n) out[y * W + x] = mixc(n, OUT, opt.outline == null ? .8 : opt.outline);
      }
    }
    var cv = G.document.createElement('canvas'); cv.width = W; cv.height = H;
    var c2 = cv.getContext('2d'), img = c2.createImageData(W, H), d = img.data;
    for (k = 0; k < W * H; k++) { var o = out[k]; if (o) { d[k * 4] = o[0] | 0; d[k * 4 + 1] = o[1] | 0; d[k * 4 + 2] = o[2] | 0; d[k * 4 + 3] = 255; } }
    c2.putImageData(img, 0, 0);
    return cv;
  }

  G.Stylize = { render: render, OUT: OUT, parse: parse, mix: mixc };
})(window);
