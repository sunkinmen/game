/* 關卡資料（純資料，不含邏輯）
 * - STG：場景設定（天空/建築/地面顏色、特效類型、開場台詞、BGM）
 * - BOSS：每關 Boss（貼圖 key、名稱）
 * - WAVE_MIX：一般小兵（tier0 地面敵）各類型出現權重
 * - SPAWNS：手寫的指定敵人，格式即 EnemyFactory 設定：
 *     { type:'shooter', x:1200, hp:3, patrolRange:100 }
 *   x 為「鏡頭右緣進入此 x 時」觸發出生；可用欄位見 enemies.js 的 DEFS */
(function (G) {
  'use strict';
  var STG = [
    { n: '忠孝東路', sky: [0x6ec6ff, 0xcfeaff], bld: 0x8a9bb3, ground: 0x555a66, pits: 1, k: 'sun', bgm: 'stage0' },
    { n: '仁愛路', sky: [0xf29a5a, 0xffe1b0], bld: 0x6a8a6a, ground: 0x4a4f58, pits: 2, k: 'tree', bgm: 'stage1' },
    { n: '信義路', sky: [0x0b1030, 0x3a2a5a], bld: 0x151a33, ground: 0x2b2d36, pits: 3, k: '101', night: 1, bgm: 'stage2' },
    { n: '中山北路', sky: [0x151c26, 0x35465a], bld: 0x1d2733, ground: 0x20262e, pits: 3, k: 'rain', night: 1, bgm: 'stage3' },
    { n: '敦化南路', sky: [0x2a0f3a, 0xd0603a], bld: 0x2a1830, ground: 0x302830, pits: 4, k: 'dusk', night: 1, bgm: 'stage4' }
  ];
  ['忠孝東路又塞車，用跑的啦！', '仁愛路樹這麼多，小心偷襲喔', '信義路在施工，小心坑洞！', '中山北路下雨啦，路好滑', '敦化南路到了，最後一關拚啦！']
    .forEach(function (q, i) { STG[i].q = q; });

  var BOSS = [['bearK', '紅熊王'], ['birdK', '青鳥大王'], ['teaK', '珍奶怪'], ['taxiK', '計程車怪'], ['boss', '中分頭西裝男']];

  var SIGNS = ['西門町', '夜市', '珍奶', '臺北', '捷運', '牛肉麵', '鹽酥雞', '便利商店'];

  /* 各關 tier0 地面敵比例（權重，不需加總 100） */
  var WAVE_MIX = [
    { walker: 78, jumper: 12, shooter: 10, chaser: 0 },
    { walker: 56, jumper: 16, shooter: 16, chaser: 12 },
    { walker: 40, jumper: 20, shooter: 22, chaser: 18 },
    { walker: 34, jumper: 18, shooter: 26, chaser: 22 },
    { walker: 28, jumper: 20, shooter: 28, chaser: 24 }
  ];

  var SPAWNS = [
    [{ type: 'shooter', x: 1200, hp: 3, patrolRange: 100 }, { type: 'jumper', x: 1900 }, { type: 'shooter', x: 2600, hp: 3 }],
    [{ type: 'chaser', x: 900 }, { type: 'shooter', x: 1500, patrolRange: 120 }, { type: 'jumper', x: 2100 }, { type: 'chaser', x: 2700 }],
    [{ type: 'shooter', x: 800 }, { type: 'chaser', x: 1300 }, { type: 'shooter', x: 1700 }, { type: 'tank', x: 2000 }, { type: 'jumper', x: 2300 }],
    [{ type: 'chaser', x: 700 }, { type: 'shooter', x: 1100 }, { type: 'jumper', x: 1500 }, { type: 'tank', x: 1900 }, { type: 'shooter', x: 2400 }],
    [{ type: 'tank', x: 900 }, { type: 'shooter', x: 1300 }, { type: 'chaser', x: 1700 }, { type: 'jumper', x: 2000 }, { type: 'tank', x: 2400 }, { type: 'shooter', x: 2700 }]
  ];

  G.STG = STG; G.BOSS = BOSS; G.SIGNS = SIGNS; G.WAVE_MIX = WAVE_MIX; G.SPAWNS = SPAWNS;
})(window);
