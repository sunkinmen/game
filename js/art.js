/* Art — Kenney Pixel Platformer 素材 + 程式產生的武器／道具後備 */
const PAL={k:'#111',w:'#fff',b:'#3b8cff',B:'#1a4fb0',l:'#8fc4ff',n:'#12306e',r:'#e03a3a',R:'#8a1c1c',q:'#5a1010',y:'#fc3',Y:'#c90',s:'#f1c9a0',S:'#d9a577',h:'#2a1b14',d:'#222',o:'#f80',g:'#667',G:'#3a3d4a',W:'#ccd',e:'#ffb02e',E:'#c06a10',p:'#ff9aa8',c:'#f4ecd8',a:'#4ff',u:'#a050e0',U:'#5a2a90',m:'#6f6',M:'#2a9a3a',z:'#8a5a2b'};

const PIX_ITEMS=[
['w1',["................", "..WWWWWWWWW.....", "..WWWWWWWWWW....", "..GGGGGGGGG.....", "..GGGG..G.......", "..kkk...........", "..kkk...........", "..kk............"]],
['w2',["................", "....mmmmmmmmmmm.", "..mmmMMMMMMMMMMM", "..GGGGGGGGGGGGG.", "..kk.GG.kk......", "..kk.GG.kk......", "..kk....kk......", "................"]],
['w3',["................", "................", "..WWWWWWWWWWWWWW", "..GGGGGGGGGGGGGG", "zzzzzzzGaaaaG...", "zzzzzzz.kk......", ".zzzz...........", "................"]],
['w4',["................", "......aa........", "..uuuuuuuuuaaaa.", ".uuUUUUUUUuaaaa.", "..UUUUUUUUUGGGG.", "..UU.uu.UU......", "..UU............", "................"]],
['w5',["...yy...........", "..yyyyyyyyyyyy..", ".yyYYYYYYYYYyyyy", ".yYGGGGGGGGGYooo", ".yYGGGGGGGGGYooo", ".yyYYYYYYYYYyyyy", "..yyyyyyyyyyyy..", "...yy.....kk...."]],
['coin',["..yyyy..",".yyyYyy.","yyyyYyyy","yyyyYyyy","yyyyYyyy","yyyyYyyy",".yyyYyy.","..yyyy.."]],
['shroom',["....rrrr....","..rrrrrrrr..",".rrwwrrrwwr.","rrwwwrrrwwwr","rrrwrrrrrwrr","rrrrrrrrrrrr","RRRRRRRRRRRR","...cccccc...","...ckcckc...","...cccccc...","...cccccc...","....cccc...."]],
['star',[".....yy.....",".....yy.....","....yyyy....","yyyyyyyyyyyy",".yyyyyyyyyy.","..yykyykyy..","...yyyyyy...","...yyyyyy...","..yyyyyyyy..","..yyy..yyy..",".yyy....yyy.",".yy......yy."]],
['qb',["kkkkkkkkkkkkkk","kyyyyyyyyyyyyk","kyyyyyyyyyyyyk","kyyyykkyyyyyyk","kyyyykkyyyyyyk","kyyyyyyyyyyyyk","kyyyyyyyyyyyyk","kyyyyyyyyyyyyk","kyyyyyyyyyyyyk","kyyyyyyyyyyyyk","kyyyyyyyyyyyyk","kyyyyyyyyyyyyk","kyyyyyyyyyyyyk","kkkkkkkkkkkkkk"]],
['qu',["kkkkkkkkkkkkkk","kggggggggggggk","kggggggggggggk","kggggggggggggk","kggggggggggggk","kggggggggggggk","kggggggggggggk","kggggggggggggk","kggggggggggggk","kggggggggggggk","kggggggggggggk","kggggggggggggk","kggggggggggggk","kkkkkkkkkkkkkk"]]
];

function mk(sc,key,rows,px){
  const t=sc.textures.createCanvas(key,rows[0].length*px,rows.length*px),x=t.getContext();
  rows.forEach((r,j)=>[...r].forEach((ch,i)=>{const c=PAL[ch];if(c){x.fillStyle=c;x.fillRect(i*px,j*px,px,px)}}));
  t.refresh();
}

function copyTex(scene,fromKey,toKey){
  if(scene.textures.exists(toKey)||!scene.textures.exists(fromKey))return;
  try{
    const src=scene.textures.get(fromKey).getSourceImage();
    const c=document.createElement('canvas');
    c.width=src.width;c.height=src.height;
    c.getContext('2d').drawImage(src,0,0);
    scene.textures.addCanvas(toKey,c);
  }catch(e){}
}

function registerTextures(scene){
  if(scene.textures.exists('__art_ready'))return;
  scene.textures.addCanvas('__art_ready',document.createElement('canvas'));

  /* Kenney 個別 PNG（preload 為 img_*） */
  ['p','p2','bear','bear2','bird','bird2','boss','boss2','slime'].forEach(function(k){
    copyTex(scene,'img_'+k,k);
  });
  /* 黃角色當備用主角變體 */
  copyTex(scene,'img_p_alt','p_alt');
  copyTex(scene,'img_p_alt2','p_alt2');

  /* 敵人變體別名 */
  [['bearP','img_p_blue'],['bearP2','img_p_blue'],
   ['bearM','img_p'],['bearM2','img_p2'],
   ['bearE','img_p_alt'],['bearE2','img_p_alt2'],
   ['bearG','img_boss'],['bearG2','img_boss2'],
   ['bearK','img_boss'],['bearK2','img_boss2'],
   ['birdK','img_bird'],['birdK2','img_bird2'],
   ['teaK','img_slime'],['teaK2','img_slime'],
   ['taxiK','img_p_alt'],['taxiK2','img_p_alt2']].forEach(function(pair){
    copyTex(scene,pair[1],pair[0]);
  });

  /* 武器／道具／特效 */
  PIX_ITEMS.forEach(function(pair){ if(!scene.textures.exists(pair[0])) mk(scene,pair[0],pair[1],2); });
  if(!scene.textures.exists('dot')) mk(scene,'dot',['ww','ww'],2);
  if(!scene.textures.exists('glow')){
    const gt=scene.textures.createCanvas('glow',48,48),x=gt.getContext(),gr=x.createRadialGradient(24,24,2,24,24,24);
    gr.addColorStop(0,'rgba(255,255,255,.9)');gr.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=gr;x.fillRect(0,0,48,48);gt.refresh();
  }

  /* 後備：若 Kenney 圖沒載入成功，畫簡易像素人 */
  if(!scene.textures.exists('p')){
    mk(scene,'p',[".....rrrrrr.....","....rrrrrrrr....","....hssssssh....","....hskssksh....","....hssssssh....",".....SssssS.....","...bbbbbbbbbb...","..bbbllbbllbbb..",".sbbbbbbbbbbbbs.",".sbbbbwwwwbbbbs.","..BbbbbbbbbbbB..","...nnnnnnnnnn...","...nnnn..nnnn...","...WWWW..WWWW..."],2);
    mk(scene,'p2',[".....rrrrrr.....","....rrrrrrrr....","....hssssssh....","....hskssksh....","....hssssssh....",".....SssssS.....","...bbbbbbbbbb...","..bbbllbbllbbb..",".sbbbbbbbbbbbbs.",".sbbbbwwwwbbbbs.","..BbbbbbbbbbbB..","...nnnnnnnnnn...","..nnnn....nnnn..","..WWWW....WWWW.."],2);
  }
  ['bear','bear2','bird','bird2','boss','boss2'].forEach(function(k){
    if(!scene.textures.exists(k)) copyTex(scene,'p',k);
  });
}

class Boot extends Phaser.Scene{
  constructor(){ super({key:'Boot'}); }
  preload(){
    this.load.image('img_p','assets/c/p.png');
    this.load.image('img_p2','assets/c/p2.png');
    this.load.image('img_p_blue','assets/c/p_blue.png');
    this.load.image('img_p_alt','assets/c/p_alt.png');
    this.load.image('img_p_alt2','assets/c/p_alt2.png');
    this.load.image('img_bear','assets/c/bear.png');
    this.load.image('img_bear2','assets/c/bear2.png');
    this.load.image('img_bird','assets/c/bird.png');
    this.load.image('img_bird2','assets/c/bird2.png');
    this.load.image('img_boss','assets/c/boss.png');
    this.load.image('img_boss2','assets/c/boss2.png');
    this.load.image('img_slime','assets/c/slime.png');
    this.load.image('img_ground','assets/c/ground.png');
    this.load.image('img_plat','assets/c/plat.png');
  }
  create(){
    this.scene.start('Game');
  }
}
window.Boot = Boot;
window.registerTextures = registerTextures;
