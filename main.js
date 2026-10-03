/* 啟動：初始化各管理器（順序固定），再建立 Phaser Game */
AudioManager.init();          // 只註冊解鎖手勢，不建立 AudioContext
InputManager.init();
TouchUI.init();

// 將 Phaser Game 實例指派給變數 game，以便後續呼叫
const game = new Phaser.Game({
    type: Phaser.AUTO, 
    width: W, 
    height: H, 
    backgroundColor: '#07080c', 
    pixelArt: true,
    audio: { noAudio: true },        
    scale: {
        // 將 ENVELOP 改為 FIT，確保畫面完整顯示且不會被異常裁切出鏡
        mode: Phaser.Scale.FIT, 
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    input: { activePointers: 6 },
    scene: Game
});

// 加入視窗大小改變 (翻轉) 的監聽器
window.addEventListener('resize', () => {
    // 延遲 250 毫秒，等待手機瀏覽器的網址列/工具列收合以及轉向確實完成
    setTimeout(() => {
        if (game.isBooted) {
            game.scale.refresh(); // 強制重新計算畫布比例與尺寸
        }
    }, 250);
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
