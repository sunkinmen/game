/* Game scene — 玩法邏輯（移動 / 物理 / 關卡 / HUD）。
 * 音效、特效、輸入、背景、敵人 AI 都已拆到獨立模組：
 *   AudioManager / CombatFeedback / InputManager / ParallaxBackground / EnemyFactory */
const TC=[0,0xffffff,0x66ff66,0x55aaff,0xcc55ff,0xffcc33];
const WEAPONS=[null,
 {n:'手槍',d:1,r:380,s:420,p:1,c:0xffffff,kb:1},
 {n:'衝鋒槍',d:1,r:120,s:460,p:1,c:0x66ff66,sp:.12,kb:.55},
 {n:'霰彈槍',d:1,r:560,s:380,p:5,c:0x55aaff,sp:.6,life:500,kb:.7},
 {n:'雷射槍',d:3,r:240,s:620,p:1,c:0xcc55ff,pierce:1,kb:.8},
 {n:'電漿砲',d:7,r:420,s:500,p:3,c:0xffcc33,sp:.25,pierce:1,big:1,kb:1.6}];
const hex=n=>'#'+n.toString(16).padStart(6,'0');
const ST={fontSize:'14px',color:'#fff',stroke:'#000',strokeThickness:3};
const fx=o=>o.setScrollFactor(0);
const pick=a=>a[Math.random()*a.length|0];
const TALK={coin:['賺到啦！','發財啦～','呷飽沒？有錢啦'],shroom:['吃蕈蕈變大隻！','補一下啦～'],star:['無敵啦！衝三小！','來呀～閃開啦'],hurt:['靠杯喔！','哎喲喂～','痛痛痛啦！'],pit:['夭壽喔！掉下去啦'],kill:['爽啦！','小事一樁','夭壽讚！'],weapon:['這支夠力！','讚啦！新傢伙'],block:['敲到寶啦！','哇～有料！'],
 bear:['來呷拎北的拳頭！','熊熊要你好看','莫宰羊～','你欠揍喔'],bird:['啾啾～青鳥來啦','你嘛幫幫忙','咕嚕咕嚕～'],boss:['少年仔，莫衝動！','你以為你是誰？'],
 shooter:['看我的啦！','吃我一發'],jumper:['跳跳跳～','蹦蹦蹦'],chaser:['衝啊！！','別跑！'],tank:['大隻的來啦','撞死你']};

/* 手感參數（毫秒 / 速度） */
const DOUBLE_JUMP=false;   // 二段跳預設關閉（原版沒有）；設 true 即啟用並觸發 player_double_jump
const JUMP_BUF=110;        // 落地前提早按跳，落地瞬間仍會起跳
const COYOTE=90;           // 離開平台邊緣後仍可起跳的寬限
const JUMP_CUT=240;        // 提早放開跳躍鍵 → 上升速度上限（短按 = 小跳，長按 = 大跳）

class Game extends Phaser.Scene{
 init(d){this.d=d||{}}
 create(){
  const d=this.d,si=d.s||0,cf=STG[si];
  registerTextures(this);
  Object.assign(this,{si,cf,hp:d.hp||5,own:d.own||[0,1,0,0,0,0],cur:d.cur||1,score:d.score||0,coins:d.coins||0,
   en:[],bl:[],eb:[],it:[],t:0,nf:0,inv:0,star:0,big:false,og:false,end:false,bossOn:false,cleared:false,wi:0,safe:60,
   bb:[],nsay:4000,aim:0,bk:[],fc:0,mvx:0,paused:false,pkx:0,jbuf:0,coy:0,jc:0,jhold:false,cpi:0,streak:0,lastCoin:-9999,bp:[],ebp:[]});
  let sd=si*977+13;const R=()=>(sd=(sd*16807)%2147483647)/2147483647;this.R=R;
  const pits=[];for(let i=0;i<cf.pits;i++)pits.push(800+i*((LW-1700)/cf.pits)+R()*180);
  this.gs=[];let c0=0;pits.forEach(x=>{this.gs.push([c0,x]);c0=x+90});this.gs.push([c0,LW]);
  this.pf=[];for(let i=0;i<9;i++)this.pf.push({x:300+i*((LW-800)/9)+R()*80,y:GY-60-(R()*2|0)*50,w:90+R()*60});
  this.bg(R);
  this.pf.forEach((f,i)=>{if(i===2)this.addIt('shroom',f.x+f.w/2,f.y-16);else if(i===6)this.addIt('star',f.x+f.w/2,f.y-16);
   else for(let k=0;k<4;k++)this.addIt('coin',f.x+16+k*(f.w-32)/3,f.y-18)});
  for(let x=450;x<LW-500;x+=420)for(let k=0;k<3;k++)this.addIt('coin',x+k*26,GY-18);
  for(let x=620;x<LW-700;x+=460+R()*160){const n=1+(R()*3|0);for(let k=0;k<n;k++)this.bk.push({x:x+k*28,y:GY-108,used:false,s:this.add.sprite(x+k*28+14,GY-108+14,'qb').setDepth(5)})}
  this.p=this.add.sprite(60,GY,'p').setOrigin(.5,1);Object.assign(this.p,{vy:0,dir:1});
  this.pw=this.add.sprite(60,GY-20,'w1').setOrigin(.25,.5);
  const cam=this.cameras.main;cam.setBounds(0,0,LW,H);cam.startFollow(this.p,true,.12,1);
  const ws=[];for(let x=520;x<LW-450;x+=130+R()*110){const q=R();ws.push({x,bird:R()<.45,cls:q<.05+si*.01?2:q<.28?1:0})}
  EnemyFactory.init(this);
  this.waves=EnemyFactory.planWaves(ws,si);        // 隨機波次 + levels.js 的手寫 SPAWNS
  this.ebpool=[];this.blpool=[];
  CombatFeedback.init(this);
  this.gf=fx(this.add.graphics()).setDepth(999);
  this.ht=fx(this.add.text(8,6,'',ST)).setDepth(1000);
  this.mt=fx(this.add.text(W/2,110,'',{fontSize:'24px',color:'#ffdd55',stroke:'#000',strokeThickness:5})).setOrigin(.5).setDepth(1000).setAlpha(0);
  const icon=(x,t,fn)=>{const o=fx(this.add.text(x,2,t,{fontSize:'22px',padding:{x:6,y:4}})).setOrigin(1,0).setDepth(1000).setInteractive();o.on('pointerdown',fn);return o};
  this.mb=icon(W-4,AudioManager.isMuted()?'🔇':'🔊',()=>{AudioManager.unlock();const m=AudioManager.toggleMute();if(!m)AudioManager.play('button_click');this.mb.setText(m?'🔇':'🔊')});
  this.fs=icon(W-48,'⛶',()=>{AudioManager.play('button_click');try{const sc=this.scale;if(sc.isFullscreen)sc.stopFullscreen();else{sc.startFullscreen();screen.orientation&&screen.orientation.lock&&screen.orientation.lock('landscape').catch(()=>{})}}catch(e){}});
  this.gear=icon(W-92,'⚙',()=>Menu.open());
  this.slots=[1,2,3,4,5].map(i=>{const x=W/2-84+(i-1)*42,y=24;
   const r=fx(this.add.rectangle(x,y,36,30,0x111111)).setStrokeStyle(3,TC[i]).setInteractive().setDepth(1000);
   const n=fx(this.add.sprite(x,y,'w'+i)).setScale(.8).setDepth(1001);
   r.on('pointerdown',()=>{if(this.own[i]&&this.cur!==i){this.cur=i;AudioManager.play('button_click',{vol:.6})}});return {r,n}});
  /* 輸入全部經 InputManager；場景只訂閱事件並在 shutdown 取消訂閱（避免場景重啟後重複觸發） */
  this.offs=[InputManager.on('weapon',n=>{if(!this.end&&this.own[n]&&this.cur!==n){this.cur=n;AudioManager.play('button_click',{vol:.6})}}),
   InputManager.on('pause',()=>{if(!this.end)Menu.toggle()}),
   Menu.bind({open:()=>{this.paused=true},close:()=>{this.paused=false}})];
  this.input.on('pointerdown',()=>{AudioManager.unlock();
   if(this.end&&performance.now()-this.endT>800){AudioManager.play('button_click');this.scene.restart({})}});
  if(cf.k==='rain'){this.rg=fx(this.add.graphics()).setDepth(998);this.rn=Array.from({length:60},()=>({x:Math.random()*W,y:Math.random()*H}))}
  this.events.once('shutdown',()=>{this.offs.forEach(f=>f());this.offs=[];EnemyFactory.dispose();if(Menu.isOpen())Menu.close()});
  AudioManager.playBGM(cf.bgm,{delay:d.clear?1.5:.1,fade:.5});
  this.msg('第 '+(si+1)+' 關　'+cf.n);this.time.delayedCall(700,()=>this.say(this.p,cf.q,2400));
 }
 /* 背景：視差 5 層交給 ParallaxBackground；這裡只畫「遊戲層」（地面、坑洞、平台，速度 1.0） */
 bg(R){const cf=this.cf;
  ParallaxBackground.legacyBurn(R,cf,LW,W);
  this.px=new ParallaxBackground(this,{si:this.si,cf,W,H,GY,LW});
  const n=this.add.graphics().setDepth(-10);
  n.fillStyle(0x05060a).fillRect(0,GY,LW,H-GY);
  this.gs.forEach(([a,b])=>{n.fillStyle(cf.ground).fillRect(a,GY,b-a,H-GY);n.fillStyle(0x8888a0).fillRect(a,GY,b-a,6);
   n.fillStyle(0xdddddd);for(let x=a+20;x<b-30;x+=60)n.fillRect(x,GY+36,28,3)});
  this.pf.forEach(f=>{n.fillStyle(0xa0522d).fillRect(f.x,f.y,f.w,12).fillStyle(0xd08a5a).fillRect(f.x,f.y,f.w,4)})}
 /* ---- 給敵人 AI 使用的世界查詢 ---- */
 surfaceY(x,fy){const lim=fy-4;let r=null;
  for(let i=0;i<this.gs.length;i++){const g=this.gs[i];if(x>g[0]&&x<g[1]){if(GY>=lim)r=GY;break}}
  for(let i=0;i<this.pf.length;i++){const f=this.pf[i];if(x>f.x&&x<f.x+f.w&&f.y>=lim&&(r===null||f.y<r))r=f.y}
  return r}
 nearestGroundX(x){for(let k=0;k<4;k++){let ok=false;for(let i=0;i<this.gs.length;i++){const g=this.gs[i];if(x>g[0]+10&&x<g[1]-10){ok=true;break}}if(ok)return x;x+=100}return x}
 addIt(kind,x,y,tier,life,pop){const o=this.add.sprite(x,y,kind==='w'?'w'+tier:kind).setDepth(900).setScale(kind==='w'?1.4:kind==='coin'?1.2:1.3);
  Object.assign(o,{kind,tier,by:y,dl:life?this.t+life:1e12,ph:Math.random()*6,pop:pop?12:0,pv:pop?260:0});
  if(kind==='w'){o.g=this.add.sprite(x,y,'glow').setTint(TC[tier]).setScale(1.4).setDepth(899);
   this.tweens.add({targets:o.g,alpha:.3,yoyo:true,repeat:-1,duration:450})}
  this.it.push(o)}
 msg(s){this.mt.setText(s).setAlpha(1);this.tweens.add({targets:this.mt,alpha:0,delay:1600,duration:600})}
 say(o,t,ttl=1500){if(this.bb.length>=3||!o||!o.active)return;
  const x=this.add.text(0,0,t,{fontSize:'14px',color:'#111',fontFamily:'sans-serif',fontStyle:'bold'}).setOrigin(.5),w=x.width+16,h=x.height+10,g=this.add.graphics();
  g.fillStyle(0xffffff).fillRoundedRect(-w/2,-h/2,w,h,8).lineStyle(2,0x111111).strokeRoundedRect(-w/2,-h/2,w,h,8).fillTriangle(-5,h/2-1,5,h/2-1,0,h/2+9).lineBetween(-5,h/2,0,h/2+9).lineBetween(5,h/2,0,h/2+9);
  this.bb.push({c:this.add.container(o.x,o.y,[g,x]).setDepth(1500),o,e:this.t+ttl})}
 ang(){const p=this.p,up=InputManager.isDown('UP'),r=p.dir>0;return up?(this.mvx?(r?-Math.PI/4:-3*Math.PI/4):-Math.PI/2):(r?0:Math.PI)}
 burst(x,y,c,n,v){CombatFeedback.burst(x,y,c,n,v)}
 hitBlock(b){if(b.used)return;b.used=true;b.s.setTexture('qu');this.tweens.add({targets:b.s,y:b.s.y-8,yoyo:true,duration:90});
  const r=Math.random(),x=b.x+14,y=b.y-14;AudioManager.play('block_hit');this.burst(x,b.y+14,0xffdd55,8,200);
  if(r<.5)this.addIt('coin',x,y,0,8000);else if(r<.65)this.addIt('shroom',x,y,0,12000);else if(r<.75)this.addIt('star',x,y,0,12000);else this.addIt('w',x,y,1+(Math.random()*3|0),15000);
  this.say(this.p,pick(TALK.block),1000)}
 /* ---- 子彈（物件池） ---- */
 getBullet(){let b=this.blpool.pop();if(!b)b=this.add.sprite(0,0,'dot').setBlendMode(Phaser.BlendModes.ADD).setDepth(950);b.hit=b.hit||new Set();b.hit.clear();return b.setActive(true).setVisible(true)}
 enemyBullet(x,y,vx,vy,life,o){o=o||{};let s=this.ebpool.pop();if(!s)s=this.add.sprite(0,0,'dot').setDepth(950);
  s.setActive(true).setVisible(true).setPosition(x,y).setTint(o.tint||0xff3333).setScale(o.sx||o.scale||3,o.sy||o.scale||3);
  Object.assign(s,{vx,vy,life});this.eb.push(s);return s}
 fire(){const w=WEAPONS[this.cur],a=this.aim,sc=this.big?Z*1.35:Z,p=this.p,mx=p.x+Math.cos(a)*30,my=p.y-20*sc+Math.sin(a)*30;
  for(let i=0;i<w.p;i++){const aa=a+(Math.random()-.5)*(w.sp||0);
   const b=this.getBullet().setPosition(mx,my).setTint(w.c).setScale(w.big?7:4,w.big?4:1.6).setRotation(aa);
   Object.assign(b,{vx:Math.cos(aa)*w.s*1.3,vy:Math.sin(aa)*w.s*1.3,d:w.d,pi:w.pierce,life:w.life||800,col:w.c,tr:this.cur>=3,kb:w.kb});this.bl.push(b)}
  CombatFeedback.playerShoot(mx,my,a,this.cur,w.c)}
 dmg(e,n,b){return e.takeHit(n,b)}
 /* 敵人死亡（分數 / 掉落 / Boss 旗桿）。視覺與音效在 CombatFeedback.enemyDeath */
 onEnemyKilled(e){this.score+=e.score;
  e.rollDrops().forEach(d=>this.addIt(d.kind,e.x,d.y,d.tier,d.life,true));
  if(e.boss){this.cleared=true;this.bossHp=0;const g=this.add.graphics().setDepth(5);g.fillStyle(0xffffff).fillRect(LW-60,GY-120,4,120).fillStyle(0xe03a3a).fillTriangle(LW-56,GY-120,LW-56,GY-90,LW-20,GY-105);
   this.msg('小魔王已擊倒！前往旗桿')}
  if(e.cls>=1&&Math.random()<.35)this.say(this.p,pick(TALK.kill),1000)}
 hurt(pit,src,n){const t=this.t;if(!pit&&(t<this.inv||t<this.star))return;
  if(this.big&&!pit){this.big=false;this.inv=t+1200;CombatFeedback.playerDamage(src,{soft:true});return}
  this.hp-=n||1;this.inv=t+1500;this.say(this.p,pit?TALK.pit[0]:pick(TALK.hurt),1200);
  CombatFeedback.playerDamage(src,{pit,lethal:this.hp<=0});
  if(pit){this.p.x=Math.max(this.cameras.main.scrollX+30,this.safe-60);this.p.y=GY-120;this.p.vy=0}
  if(this.hp<=0)this.finish(false)}
 finish(win){this.end=true;this.win=win;this.endT=performance.now();
  const best=SaveManager.setBest(this.score);
  AudioManager.stopBGM({fade:.3});
  if(win)AudioManager.play('level_clear');else{AudioManager.play('player_die');AudioManager.play('game_over',{delay:.9});CombatFeedback.playerDeath()}
  fx(this.add.text(W/2,H/2,(win?'全關通關！':'你倒下了')+'\n分數 '+this.score+'　最高 '+best+'\n\n點一下重新開始',{fontSize:'24px',color:'#fff',align:'center',stroke:'#000',strokeThickness:5})).setOrigin(.5).setDepth(2000)}
update(_,dt){
  if(this.paused)return;
  
  // 1. 防護：確保 dt 是有效數字，避免在手機剛啟動或翻轉時拿到 undefined/NaN
  if(typeof dt !== 'number' || isNaN(dt)) dt = 16.6; 
  if(dt>50)dt=50;                                   
  
  if(this.end){CombatFeedback.update(dt/1000);return}
  if(CombatFeedback.freeze(dt))return;              
  InputManager.frame();
  this.t+=dt;const t=this.t,d=dt/1000,p=this.p,IM=InputManager,cam=this.cameras.main;
  
  // 2. 防護：確保 InputManager 回傳的絕對是數字 0，不能是 undefined
  const mx = this.mvx = (IM.moveX() || 0); 
  if(mx) p.dir = mx;
  
  let kx=0;
  if(this.pkx){
      kx=this.pkx*d;
      this.pkx*=Math.pow(.0005,d);
      if(Math.abs(this.pkx)<10) this.pkx=0;
  }
  
  // 3. 防護：確保攝影機的 scrollX 沒有壞掉，再進行 Clamp 計算
  const safeCamX = isNaN(cam.scrollX) ? 0 : cam.scrollX;
  p.x = Phaser.Math.Clamp(p.x + mx * 140 * d + kx, safeCamX + 14, LW - 14);
  
  // 終極防護：如果主角座標還是變成 NaN，強制拉回預設點，避免整個畫面渲染崩潰
  if (isNaN(p.x)) p.x = 60;
  if (isNaN(p.y)) p.y = GY;

  /* --- 下方的跳躍邏輯維持原樣不變 --- */
  /* 跳躍：提前輸入緩衝 + 離地寬限 + 可變跳躍高度 */
  if(IM.justPressed('JUMP'))this.jbuf=JUMP_BUF;else if(this.jbuf>0)this.jbuf-=dt;
  if(this.og){this.coy=COYOTE;this.jc=0}else if(this.coy>0)this.coy-=dt;
  if(this.jbuf>0){
   if(this.og||this.coy>0){p.vy=-400;this.og=false;this.coy=0;this.jbuf=0;this.jhold=true;AudioManager.play('player_jump');CombatFeedback.dust(p.x,p.y)}
   else if(DOUBLE_JUMP&&this.jc<1){p.vy=-360;this.jc=1;this.jbuf=0;this.jhold=true;AudioManager.play('player_double_jump');CombatFeedback.dust(p.x,p.y)}}
  if(IM.justReleased('JUMP')){if(this.jhold&&p.vy<-JUMP_CUT)p.vy=-JUMP_CUT;this.jhold=false}
  const py=p.y,vyb=p.vy;p.vy+=1100*d;p.y+=p.vy*d;let ld=null;
  if(p.vy<0){const hs=42*(this.big?Z*1.35:Z);for(const b of this.bk){const bt=b.y+28;if(p.x>b.x-6&&p.x<b.x+34&&py-hs>=bt&&p.y-hs<bt){p.y=bt+hs;p.vy=60;this.hitBlock(b);break}}}
  if(p.vy>=0){const c=[];if(this.gs.some(([a,b])=>p.x>a&&p.x<b))c.push(GY);this.pf.forEach(f=>{if(p.x>f.x&&p.x<f.x+f.w)c.push(f.y)});this.bk.forEach(b=>{if(p.x>b.x-4&&p.x<b.x+32)c.push(b.y)});
   for(const y of c)if(py<=y+3&&p.y>=y&&(ld===null||y<ld))ld=y}
  if(ld!==null){p.y=ld;p.vy=0;if(!this.og&&vyb>260)CombatFeedback.dust(p.x,ld);this.og=true;if(ld===GY)this.safe=p.x}else this.og=false;
  if(p.y>H+60)this.hurt(true);
  const sc=this.big?Z*1.35:Z;p.setScale(sc).setFlipX(p.dir<0).setDepth(p.y);p.alpha=(t<this.inv&&((t/80)|0)%2)?.4:1;p.setTexture(mx&&this.og&&((t/150)|0)%2?'p2':'p');
  if(t<this.star)p.setTint(Phaser.Display.Color.HSVToRGB((t/300)%1,.6,1).color);else if(this.starOn){p.clearTint();this.starOn=false}
  const w=WEAPONS[this.cur];
  this.aim=this.ang();
  const rc=CombatFeedback.recoil,ca=Math.cos(this.aim),sa=Math.sin(this.aim);   // 後座力：武器沿射擊反方向後退並上揚
  this.pw.setTexture('w'+this.cur).setScale(sc*(1+rc*.1),sc*(1-rc*.06)).setPosition(p.x-ca*rc*5,p.y-20*sc-sa*rc*5).setRotation(this.aim+(ca<0?1:-1)*rc*.1).setFlipY(ca<-.1).setDepth(p.y+1).setAlpha(p.alpha);
  if((IM.isDown('SHOOT')||IM.justPressed('SHOOT'))&&t>this.nf){this.nf=t+w.r;this.fire()}
  this.fc++;
  const bl=this.bl;
  for(let i=bl.length-1;i>=0;i--){const b=bl[i];b.x+=b.vx*d;b.y+=b.vy*d;b.life-=dt;
   if(b.tr&&this.fc%2===0)CombatFeedback.trail(b);
   if(b.life>0)for(let j=0;j<this.en.length;j++){const e=this.en[j];if(!e.canBeHit()||b.hit.has(e))continue;
    if(Math.hypot(e.x-b.x,e.y-e.displayHeight/2-b.y)<e.rr+4){b.hit.add(e);this.dmg(e,b.d,b);if(!b.pi){b.life=0;break}}}
   if(b.life<=0||b.x<cam.scrollX-30||b.x>cam.scrollX+W+30||b.y<-20){b.setActive(false).setVisible(false);this.blpool.push(b);bl[i]=bl[bl.length-1];bl.pop()}}
  /* 敵人出生 / Boss */
  while(this.wi<this.waves.length&&this.waves[this.wi].x<cam.scrollX+W+30&&!this.bossOn)EnemyFactory.spawn(this,this.waves[this.wi++]);
  if(!this.bossOn&&p.x>LW-300){this.bossOn=true;cam.setBounds(LW-W,0,W,H);EnemyFactory.spawnBoss(this);this.msg('⚠ 小魔王：'+BOSS[this.si][1]);
   AudioManager.play('boss_intro');AudioManager.playBGM('boss',{fade:.3,delay:1.2})}
  if(this.cpi<2&&p.x>LW*(.33+this.cpi*.33)&&!this.bossOn){this.cpi++;AudioManager.play('checkpoint');this.msg('★ 檢查點')}
  /* 敵人更新（離開鏡頭的敵人在 update 內早退；死亡演出結束或離場過遠者回收） */
  for(let i=this.en.length-1;i>=0;i--){const e=this.en[i];e.update(dt,t,p,cam);
   if(e.removed){e.dispose();this.en[i]=this.en[this.en.length-1];this.en.pop();continue}
   if(e.canHurtPlayer()&&Math.hypot(e.x-p.x,e.y-e.displayHeight/2-(p.y-20*sc))<e.rr+12){if(t<this.star){if(!e.boss)e.takeHit(99,null)}else this.hurt(false,e,e.dmg)}}
  for(let i=this.eb.length-1;i>=0;i--){const s=this.eb[i];s.x+=s.vx*d;s.y+=s.vy*d;s.life-=dt;if(Math.hypot(s.x-p.x,s.y-p.y+20*sc)<14){s.life=0;this.hurt(false,s,1)}
   if(s.life<=0||s.y<-20||s.y>H+20){s.setActive(false).setVisible(false);this.ebpool.push(s);this.eb[i]=this.eb[this.eb.length-1];this.eb.pop()}}
  for(let i=this.it.length-1;i>=0;i--){const o=this.it[i];
   if(o.pop>0||o.pv>0){o.pv-=900*d;o.pop+=o.pv*d;if(o.pop<=0){o.pop=0;o.pv=0}}
   o.y=o.by+Math.sin(t/200+o.ph)*3-(o.pop||0);if(o.g)o.g.y=o.y;
   if(Math.hypot(o.x-p.x,o.y-p.y+20*sc)<26){o.dl=0;const k=o.kind;
    CombatFeedback.pickup(o.x,o.y,k==='coin'?0xffdd55:k==='w'?TC[o.tier]:0xffffff);
    if(k==='coin'){this.streak=t-this.lastCoin<700?this.streak+1:0;this.lastCoin=t;AudioManager.play('coin_collect',{pitch:1+Math.min(this.streak,7)*.05});
     this.coins++;this.score+=20;if(this.coins%12===0)this.say(p,pick(TALK.coin),1000);if(this.coins%50===0&&this.hp<5){this.hp++;this.msg('金幣 50！ +1 ♥')}}
    else if(k==='shroom'){AudioManager.play('powerup_collect');if(this.big)this.score+=200;else{this.big=true;this.msg('變大了！');this.say(p,pick(TALK.shroom),1200)}}
    else if(k==='star'){AudioManager.play('powerup_collect');this.star=t+8000;this.starOn=true;this.msg('無敵星星！');this.say(p,pick(TALK.star),1400)}
    else{const n=o.tier;if(!this.own[n]){AudioManager.play('powerup_collect');this.own[n]=1;if(n>this.cur)this.cur=n;this.msg('獲得 '+WEAPONS[n].n+'！');this.say(p,pick(TALK.weapon),1200)}else{AudioManager.play('coin_collect');this.score+=50*n}}}
   if(t>o.dl){if(o.g)o.g.destroy();o.destroy();this.it[i]=this.it[this.it.length-1];this.it.pop()}}
  if(this.cleared&&p.x>LW-80){AudioManager.play('level_clear');AudioManager.stopBGM({fade:.3});
   if(this.si<4)this.scene.restart({s:this.si+1,hp:this.hp,own:this.own,cur:this.cur,score:this.score+500,coins:this.coins,clear:1});else this.finish(true);return}
  if(t>this.nsay){this.nsay=t+4500+Math.random()*3500;const v=this.en.filter(e=>!e.boss&&e.active&&e.x>cam.scrollX&&e.x<cam.scrollX+W);
   if(v.length&&Math.random()<.7){const e=pick(v);this.say(e,pick(TALK[e.type]||(e.fly?TALK.bird:TALK.bear)),1500)}
   else this.say(p,this.hp<=2?'快撐不住啦…':this.big?'大隻真爽！':pick(['今天運氣不錯','吃飽沒？繼續衝','北漂辛苦啦']),1500)}
  for(let i=this.bb.length-1;i>=0;i--){const b=this.bb[i];if(!b.o.active||t>b.e){b.c.destroy();this.bb.splice(i,1)}else b.c.setPosition(Phaser.Math.Clamp(b.o.x,cam.scrollX+60,cam.scrollX+W-60),b.o.y-b.o.displayHeight-26)}
  const gf=this.gf.clear(),bo=this.en.find(e=>e.boss&&e.state!=='DEAD');
  if(bo)gf.fillStyle(0,.6).fillRect(W/2-120,48,240,8).fillStyle(0xe03a3a).fillRect(W/2-120,48,240*Math.max(0,bo.hp/bo.mhp),8);
  if(this.rg){const g=this.rg.clear().lineStyle(1,0x9ec9ff,.5);for(const r of this.rn){r.y+=620*d;r.x-=120*d;if(r.y>H){r.y=-10;r.x=Math.random()*(W+100)}g.lineBetween(r.x,r.y,r.x-3,r.y+10)}}
  this.ht.setText('♥'.repeat(Math.max(0,this.hp))+(this.big?' 🍄':'')+(t<this.star?' ⭐':'')+'\n'+this.cf.n+'　🪙'+this.coins+'\n分數 '+this.score);
  this.slots.forEach((s,i)=>{const n=i+1;s.r.setFillStyle(this.cur===n?TC[n]:0x111111,this.cur===n?.5:1);s.r.setAlpha(this.own[n]?1:.3);s.n.setAlpha(this.own[n]?1:.3)});
  this.px.update(d,cam.scrollX);
  CombatFeedback.update(d);
 }
}

/* 明確掛到 window，避免不同瀏覽器/模組載入環境下的 global lexical scope 差異。 */
window.Game = Game;
