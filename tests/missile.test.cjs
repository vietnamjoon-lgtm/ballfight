const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), assert = require('node:assert/strict');
const s = vm.createContext({});
for (const file of ['abilities.js','missile-ability.js','characters.js','engine.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),s);
const {Battle,copy}=s.ArenaEngine, types=s.ArenaAbilities, preset=s.ArenaMissilePreset;
function setup(both=false,slot=0){
  const config=copy(s.ArenaDefaults);config.abilities.push(copy(preset));
  config.characters.forEach(c=>{c.abilities=[];c.contactDamage=0;});
  config.characters[slot].abilities=[preset.id];if(both)config.characters[1-slot].abilities=[preset.id];
  const b=new Battle(config,['blue','coral'],types,()=>.95);
  b.fighters.forEach((f,i)=>Object.assign(f,{x:i?500:150,y:350,vx:0,vy:0}));b.start();
  return {b,self:b.fighters[slot],target:b.fighters[1-slot],bank:b.sharedState.get('missile-money')};
}
function tick(b,n){const sounds=[];for(let i=0;i<n;i++){b.step(1/120);sounds.push(...b.audioEvents.map(e=>e.type));}return sounds;}
function drop(bank,b,f,count){for(let i=0;i<count;i++)bank.coins.push({x:f.x,y:f.y,born:b.time,ready:b.time,expires:b.time+24});}
{
 const {b,self,target,bank}=setup();assert.equal(bank.coins.length,0);tick(b,239);assert.equal(bank.coins.length,0);tick(b,2);assert.equal(bank.coins.length,1);
 assert.equal(b.effects[0].missiles.length,0);assert.equal(self.skillState[preset.id].money,0);
 bank.coins=[];drop(bank,b,target,1);tick(b,1);assert.equal(bank.coins.length,1,'비보유자는 못 줍기');
 bank.coins=[];drop(bank,b,self,2);assert.equal(tick(b,1).length,0);assert.equal(self.skillState[preset.id].money,2);assert.equal(b.effects[0].missiles.length,0);
 drop(bank,b,self,1);assert.deepEqual(tick(b,1),[]); assert.equal(self.rooted,true); const stationary={x:self.x,y:self.y}; const chargeSounds=tick(b,480); assert.equal(chargeSounds.filter(x=>x==='remoteClick').length,1,'꺼내자마자 버튼을 누르는 소리'); assert.equal(chargeSounds.filter(x=>x==='missileLaunch').length,1); assert.equal(chargeSounds.filter(x=>x==='countdownTick').length,3,'3·2·1에 맞춰 정확히 3번'); assert.equal(self.x,stationary.x); assert.equal(self.y,stationary.y); assert.equal(self.rooted,false);assert.equal(self.skillState[preset.id].money,0);assert.equal(b.effects[0].missiles.length,1);
 const missile=b.effects[0].missiles[0],angle=missile.angle;assert.equal(missile.entered,false);assert.ok(missile.x<0||missile.x>720||missile.y<0||missile.y>720,'경기장 밖 출현');target.y+=65;tick(b,1);assert.notEqual(missile.angle,angle,'움직인 적 방향으로 선회');
 const sounds=tick(b,300);assert.equal(sounds.filter(x=>x==='missileExplosion').length,1);assert.equal(target.hp,target.maxHp-55);assert.equal(b.impacts[0].kind,'explosion');assert.equal(b.effects[0].missiles.length,0);
}
{
 const {b,self,bank}=setup(false,1);drop(bank,b,self,3);assert.deepEqual(tick(b,1),[]); assert.equal(self.rooted,true); const stationary={x:self.x,y:self.y}; const chargeSounds=tick(b,480); assert.equal(chargeSounds.filter(x=>x==='remoteClick').length,1); assert.equal(chargeSounds.filter(x=>x==='missileLaunch').length,1); assert.equal(chargeSounds.filter(x=>x==='countdownTick').length,3); assert.equal(self.x,stationary.x); assert.equal(self.y,stationary.y); assert.equal(self.rooted,false);assert.equal(self.skillState[preset.id].money,0,'두 번째 슬롯도 발사');
 const count=b.effects.length;b.pause();const time=b.time;tick(b,200);assert.equal(b.time,time);b.start();assert.equal(b.effects.length,count,'재개 시 중복 설치 금지');
}
{
 const {b,bank}=setup(true);tick(b,241);assert.equal(bank.coins.length,1,'두 보유자가 있어도 공용 돈은 한 번 생성');
 drop(bank,b,b.fighters[1],1);tick(b,1);assert.equal(b.fighters[1].skillState[preset.id].money,1);assert.equal(b.fighters[0].skillState[preset.id].money,0);
}
{
 const {b,self,bank}=setup();drop(bank,b,self,3);bank.coins.forEach(c=>c.ready=b.time+.35);tick(b,20);assert.equal(self.skillState[preset.id].money,0,'낙하 중에는 수집 불가');tick(b,23);assert.equal(b.effects[0].missiles.length,0);assert.equal(self.rooted,true);tick(b,480);assert.equal(b.effects[0].missiles.length,1);
}
{
 const {b}=setup();const sounds=tick(b,2500);assert.ok(!sounds.includes('missileLaunch'),'시간만으로 발사 금지');
 const fresh=setup();assert.equal(fresh.bank.coins.length,0);assert.equal(fresh.self.skillState[preset.id].money,0);
}
const drawing=new Proxy({}, {get:()=>()=>{}});
{ const {b,self,bank}=setup();drop(bank,b,self,3);tick(b,1);types.moneyMissile.draw(drawing,b.effects[0],self); tick(b,440);types.moneyMissile.draw(drawing,b.effects[0],self);tick(b,40);types.moneyMissile.draw(drawing,b.effects[0],self);tick(b,40);assert.ok(b.effects[0].missiles[0].entered,'외부 미사일이 경계에서 사라지지 않고 진입'); }
{
 const {b,self,bank}=setup(); tick(b,2000);assert.equal(bank.coins.length,4,'바닥 최대 4개');
 for(let i=0;i<bank.coins.length;i++)for(let j=i+1;j<bank.coins.length;j++)assert.ok(Math.hypot(bank.coins[i].x-bank.coins[j].x,bank.coins[i].y-bank.coins[j].y)>=150);
 bank.coins[0].x=self.x;bank.coins[0].y=self.y;bank.coins[0].ready=0;tick(b,1);assert.equal(bank.coins.length,3);
 tick(b,240);assert.equal(bank.coins.length,4,'수집 후 낙하 주기에 4개까지 보충');
}
{
 const {b,self,bank}=setup();drop(bank,b,self,3);tick(b,1);const charge=b.effects[0].charge;b.pause();tick(b,240);assert.equal(b.effects[0].charge,charge);b.start();tick(b,480);assert.equal(self.rooted,false);
}
{
 const {b,self,bank}=setup(); tick(b,241); const old={x:bank.coins[0].x,y:bank.coins[0].y};
 self.x=old.x;self.y=old.y;tick(b,44);assert.equal(bank.collected.length,1);
 self.x=150;self.y=350;tick(b,600);
 for(const coin of bank.coins)assert.ok(Math.hypot(coin.x-old.x,coin.y-old.y)>=180,'주운 자리 근처 재생성 제한');
}
console.log('미사일 검사 통과: 주기적 낙하, 수집 자격, 낙하 완료, 돈 충족/소모, 유도, 1회 폭발/피해/음향 이벤트, 양쪽 슬롯, 공용 돈, 일시정지/초기화');
