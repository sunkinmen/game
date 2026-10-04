/* Art — 像素美術資料與貼圖產生（資料由原 index.html 原樣搬出，未更動） */
const PAL={k:'#111',w:'#fff',b:'#3b8cff',B:'#1a4fb0',l:'#8fc4ff',n:'#12306e',r:'#e03a3a',R:'#8a1c1c',q:'#5a1010',y:'#fc3',Y:'#c90',s:'#f1c9a0',S:'#d9a577',h:'#2a1b14',d:'#222',o:'#f80',g:'#667',G:'#3a3d4a',W:'#ccd',e:'#ffb02e',E:'#c06a10',p:'#ff9aa8',c:'#f4ecd8',a:'#4ff',u:'#a050e0',U:'#5a2a90',m:'#6f6',M:'#2a9a3a',z:'#8a5a2b'};
Object.assign(PAL,{H:'#7a4a2a',x:'#2b6fd6',t:'#2a9d8f'});
const PIX=[['p',["....RRRRRRRR....", "...RrrrrrrrrR...", "..RrrrrYYrrrrR..", ".hRRRRRRRRRRRRh.", ".hHsssssssssSHh.", ".hsskwsssskwssh.", ".hsskksssskksSh.", ".hsppssqqssppsh.", "...SssssssssS...", "....ccwwwwcc....", "..bllbbbbbbbbB..", ".sbbbbwwwwbbbbs.", ".sBbbbwwwwbbBbs.", "..BbbbbbbbbbbB..", "..kkkkkYYkkkkk..", "...nnnnnnnnnn...", "...nnnn..nnnn...", "...nnnn..nnnn...", "...nnnn..nnnn...", "...WWWW..WWWW...", "..kkkkk..kkkkk.."]],
['bird',[".......bbb......", "......bbbbb.....", ".....bbbbbbb....", ".....bbwkbbbee..", ".....bbbbbbEE...", "..b.bbbbbbbb....", ".bbbllbbbbbbl...", "bbbbllllbbbb....", ".BbbbllllbbB....", "..BBbbbbbbBB....", "...BBBBBBBB.....", ".....e...e......", "....ee..ee......", "....EE..EE......"]],
['bear',["..rr........rr..", ".rrpr......rprr.", ".rrrrrrrrrrrrrr.", "rrrrrrrrrrrrrrrr", "rrrwkrrrrrkwrrrr", "rrrrrrrrrrrrrrrr", "rrrrrrccccrrrrrr", "rrrrrrckkcrrrrrr", "rrrrrrcqqcrrrrrr", ".rrrrrrrrrrrrrr.", "RrrrrrrrrrrrrrrR", "RrrrrrrrrrrrrrrR", ".RrrrrrrrrrrrrR.", "..rrrr....rrrr..", "..rrrr....rrrr..", "..RRRR....RRRR.."]],
['boss',["......dddddddd......", ".....dddddddddd.....", "....dddddssddddd....", "...dddssssssssddd...", "...dssssssssssssd...", "...dsGGGssssGGGsd...", "...dsGkGssssGkGsd...", "...dsGGGssssGGGsd...", "...dssssssssssssd...", "....sssssSSsssss....", "....ssssqqqqssss....", ".....ssssssssss.....", ".......ssssss.......", "....wwwwwwwwwwww....", "kkkkkkkwwrrwwkkkkkkk", "kkkkkkkkwrrwkkkkkkkk", "kkkkkkkkkrrkkkkkkkkk", "skkkkkkkkrrkkkkkkkks", "skkkkkkkkrrkkkkkkkks", ".kkkkkkkkrrkkkkkkkk.", ".kkkkkkkkkkkkkkkkkk.", "..kkkkkkkkkkkkkkkk..", "...GGGGGGGGGGGGGG...", "..GGGGGGG..GGGGGGG..", "..GGGGGGG..GGGGGGG..", "..GGGGGGG..GGGGGGG..", "..kkkkkkk..kkkkkkk..", "kkkkkkkkk..kkkkkkkkk"]],
['w1',["................", "..WWWWWWWWW.....", "..WWWWWWWWWW....", "..GGGGGGGGG.....", "..GGGG..G.......", "..kkk...........", "..kkk...........", "..kk............"]],
['w2',["................", "....mmmmmmmmmmm.", "..mmmMMMMMMMMMMM", "..GGGGGGGGGGGGG.", "..kk.GG.kk......", "..kk.GG.kk......", "..kk....kk......", "................"]],
['w3',["................", "................", "..WWWWWWWWWWWWWW", "..GGGGGGGGGGGGGG", "zzzzzzzGaaaaG...", "zzzzzzz.kk......", ".zzzz...........", "................"]],
['w4',["................", "......aa........", "..uuuuuuuuuaaaa.", ".uuUUUUUUUuaaaa.", "..UUUUUUUUUGGGG.", "..UU.uu.UU......", "..UU............", "................"]],
['w5',["...yy...........", "..yyyyyyyyyyyy..", ".yyYYYYYYYYYyyyy", ".yYGGGGGGGGGYooo", ".yYGGGGGGGGGYooo", ".yyYYYYYYYYYyyyy", "..yyyyyyyyyyyy..", "...yy.....kk...."]],
['coin',["..yyyy..",".yyyYyy.","yyyyYyyy","yyyyYyyy","yyyyYyyy","yyyyYyyy",".yyyYyy.","..yyyy.."]],
['shroom',["....rrrr....","..rrrrrrrr..",".rrwwrrrwwr.","rrwwwrrrwwwr","rrrwrrrrrwrr","rrrrrrrrrrrr","RRRRRRRRRRRR","...cccccc...","...ckcckc...","...cccccc...","...cccccc...","....cccc...."]],
['star',[".....yy.....",".....yy.....","....yyyy....","yyyyyyyyyyyy",".yyyyyyyyyy.","..yykyykyy..","...yyyyyy...","...yyyyyy...","..yyyyyyyy..","..yyy..yyy..",".yyy....yyy.",".yy......yy."]],
['bearK',["..rr.y.yy.y.rr..", ".rrpryyyyyyrprr.", ".rrrrYYYYYYrrrr.", "rrkkrrrrrrrrkkrr", "rrrwkrrrrrkwrrrr", "rrrrrrccccrrrrrr", "rrrrrrckkcrrrrrr", "rrrrrrcqqcrrrrrr", ".rrrrrrrrrrrrrr.", ".rrWWWWWWWWWWrr.", "RrrrrrrrrrrrrrrR", "RrrrrrrrrrrrrrrR", ".RrrrrrrrrrrrrR.", "..rrrr....rrrr..", "..rrrr....rrrr..", "..RRRR....RRRR.."]],
['birdK',["....b..b.b......", "....bb.bbb......", ".....bbbbbbb....", ".....bkkkkbbee..", ".....bbbbbbbEE..", "....bbbbbbbbE...", "..bbbbllbbbbbb..", ".bbbllllllbbbbb.", "bbbbllllllbbbbb.", "BbbbbllllbbbbB..", ".BBbbbbbbbbBB...", "..BBBBBBBBBB....", "....wwwwwww.....", ".....e.....e....", "....ee....ee....", "....EE....EE...."]],
['teaK',[".......rr.......", ".......rr.......", "......rrrr......", "..wwwwwwwwwwww..", "..wwwwwwwwwwww..", "...cccccccccc...", "...cckcccckcc...", "...cckcccckcc...", "...cccccccccc...", "...ccckkkkccc...", "...ccqqqqqqcc...", "...cccccccccc...", "...zkzzkzzkzz...", "....zzzzzzzz....", "....kk....kk....", "...kkkk..kkkk..."]],
['taxiK',["......rrrr......", "....yyyyyyyy....", "...yaaaaaaaay...", "..yyaakwwkaayy..", "..yyaaaaaaaayy..", ".yyyyyyyyyyyyyy.", ".yykkkkkkkkkkyy.", ".yywkwkwkwkwkyy.", ".yyyyyyyyyyyyyy.", ".yoyyyyyyyyyyoy.", ".yyyyyyyyyyyyyy.", "kkkyyyyyyyyyykkk", "kkkkyyyyyyyykkkk", "kkkk........kkkk", ".kkk........kkk."]],
['qb',["kkkkkkkkkkkkkk", "kyyyyyyyyyyyyk", "kyyyykkkkyyyyk", "kyyykyyyykyyyk", "kyyyyyyyykyyyk", "kyyyyyykkyyyyk", "kyyyyykyyyyyyk", "kyyyyykyyyyyyk", "kyyyyyyyyyyyyk", "kyyyyykyyyyyyk", "kyyyyykyyyyyyk", "kyyyyyyyyyyyyk", "kYYYYYYYYYYYYk", "kkkkkkkkkkkkkk"]],
['qu',["kkkkkkkkkkkkkk", "kggggggggggggk", "kggggggggggggk", "kggggggggggggk", "kggggggggggggk", "kggggggggggggk", "kggggggggggggk", "kggggggggggggk", "kggggggggggggk", "kggggggggggggk", "kggggggggggggk", "kggggggggggggk", "kggggggggggggk", "kkkkkkkkkkkkkk"]]];
/* mk：把字元網格轉成貼圖。經 Stylize 後處理（圓角輪廓 + 受光/背光 + 彩色描邊）；opt.plain 則維持原樣。 */
function mk(sc,key,rows,px,opt){
 if(sc.textures.exists(key))sc.textures.remove(key);
 if(window.Stylize&&!(opt&&opt.plain)){
  const cv=Stylize.render(rows,PAL,px,opt),t=sc.textures.createCanvas(key,cv.width,cv.height);
  t.getContext().drawImage(cv,0,0);t.refresh();return}
 const t=sc.textures.createCanvas(key,rows[0].length*px,rows.length*px),x=t.getContext();
 rows.forEach((r,j)=>[...r].forEach((ch,i)=>{const c=PAL[ch];if(c){x.fillStyle=c;x.fillRect(i*px,j*px,px,px)}}));
 t.refresh()}
const LEGS={p:5,bear:3,bearK:3,teaK:2,taxiK:3,boss:5};
function altFrame(k,r){
 if(k==='bird'||k==='birdK'){const a=[...r];[a[6],a[8]]=[a[8],a[6]];return a}
 const n=LEGS[k];if(!n)return null;
 return r.map((row,i)=>{if(i<r.length-n)return row;const h=row.length/2;return '.'+row.slice(0,h-1)+row.slice(h+1)+'.'})}


/* 建立所有貼圖；每個 Phaser Game 只做一次（場景重啟會直接略過） */
function registerTextures(scene){
 if(scene.textures.exists('p'))return;
 PIX.forEach(([k,r])=>{mk(scene,k,r,2);const a=altFrame(k,r);if(a)mk(scene,k+'2',a,2)});
 (window.ENEMY_SKINS||[]).forEach(sk=>{const src=PIX.find(x=>x[0]===sk.from);if(!src)return;
  const rows=src[1].map(r=>r.replace(/./g,c=>sk.map[c]||c));mk(scene,sk.k,rows,2);const a=altFrame(sk.from,rows);if(a)mk(scene,sk.k+'2',a,2)});
 mk(scene,'dot',['ww','ww'],2,{plain:1});
 const gt=scene.textures.createCanvas('glow',48,48),x=gt.getContext(),gr=x.createRadialGradient(24,24,2,24,24,24);
 gr.addColorStop(0,'rgba(255,255,255,.9)');gr.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=gr;x.fillRect(0,0,48,48);gt.refresh();
}
