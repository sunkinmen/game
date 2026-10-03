/* 啟動：初始化各管理器（順序固定），再建立 Phaser Game */
AudioManager.init();          // 只註冊解鎖手勢，不建立 AudioContext
InputManager.init();
TouchUI.init();
new Phaser.Game({type:Phaser.AUTO,width:W,height:H,backgroundColor:'#07080c',pixelArt:true,
 audio:{noAudio:true},        // 全遊戲只有 AudioManager 一個 AudioContext（關閉 Phaser 內建音訊，避免重複初始化）
 scale:{mode:Phaser.Scale.ENVELOP,autoCenter:Phaser.Scale.CENTER_BOTH},input:{activePointers:6},scene:Game});
if('serviceWorker' in navigator)addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
