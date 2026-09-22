const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const s=vm.createContext({});for(const f of ['abilities.js','characters.js','engine.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',f),'utf8'),s);
const {Battle,copy,PAD,SIZE}=s.ArenaEngine;
function make(){const c=copy(s.ArenaDefaults);c.characters.forEach(f=>{f.abilities=[];f.contactDamage=0;});const b=new Battle(c,['blue','coral']);b.start();return b;}
function verify(b){for(const f of b.fighters){assert.ok([f.x,f.y,f.vx,f.vy].every(Number.isFinite));assert.ok(f.x>=PAD+f.radius-.001&&f.x<=SIZE-PAD-f.radius+.001);assert.ok(f.y>=PAD+f.radius-.001&&f.y<=SIZE-PAD-f.radius+.001);}}
for(const kind of ['head-on','same-direction','fast-slow','dash','fixed','wall','corner','fixed-wall','coincident']){
 const b=make(),[a,c]=b.fighters;Object.assign(a,{x:300,y:300,vx:200,vy:0});Object.assign(c,{x:380,y:300,vx:-200,vy:0});
 if(kind==='same-direction')c.vx=200;
 if(kind==='fast-slow'){a.speed=450;a.vx=450;c.speed=50;c.vx=50;}
 if(kind==='dash'){a.dash={remaining:.6,speed:590,damage:0,hit:false};a.vx=590;}
 if(kind==='fixed'){c.rooted=true;c.vx=200;}
 if(kind==='wall'){a.x=48;c.x=125;}
 if(kind==='corner'){a.x=48;a.y=48;c.x=90;c.y=90;}
 if(kind==='fixed-wall'){a.x=48;c.x=100;c.rooted=true;}
 if(kind==='coincident'){c.x=a.x;c.y=a.y;}
 const fixed={x:c.x,y:c.y};b.step(1/120);verify(b);
 assert.ok(Math.hypot(a.x-c.x,a.y-c.y)>=a.radius+c.radius-.001,kind+' overlaps after resolution');
 const initial=Math.hypot(a.x-c.x,a.y-c.y);for(let i=0;i<12;i++){b.step(1/120);verify(b);}
 assert.ok(Math.hypot(a.x-c.x,a.y-c.y)>initial+1,kind+' must separate, not stick');
 if(c.rooted){assert.equal(c.x,fixed.x);assert.equal(c.y,fixed.y);}
}
{
 const b=make(),[a,c]=b.fighters;
 Object.assign(a,{x:300,y:300,vx:200,vy:60});Object.assign(c,{x:340,y:300,vx:-200,vy:-60});
 assert.equal(a.spin,0);assert.equal(a.facing,0);
 b.step(1/120);
 assert.notEqual(a.spin,0,'충돌하면 스핀 발생');assert.notEqual(c.spin,0,'충돌하면 스핀 발생');
 b.step(1/120);
 assert.notEqual(a.facing,0,'스핀이 회전각에 누적');
 const spinAfterHit=Math.abs(a.spin);
 for(let i=0;i<30;i++)b.step(1/120);
 assert.ok(Math.abs(a.spin)<spinAfterHit,'스핀은 시간이 지나면 감쇠');
}
{
 const b=make(),[a,c]=b.fighters;
 Object.assign(a,{x:150,y:150,vx:0,vy:0});Object.assign(c,{x:550,y:550,vx:0,vy:0});
 for(let i=0;i<60;i++)b.step(1/120);
 assert.notEqual(a.facing,0,'부딪히지 않아도 캐릭터는 계속 조금씩 회전');
 assert.equal(a.spin,0,'충돌이 없으면 스핀 값 자체는 그대로 0');
}
{
 const b=make(),[a]=b.fighters;
 a.rooted=true;const before=a.facing;
 for(let i=0;i<60;i++)b.step(1/120);
 assert.equal(a.facing,before,'장전 중 고정된 캐릭터는 회전하지 않음');
}
{
 const b=make(),[a,c]=b.fighters;Object.assign(a,{x:300,y:300,vx:200,vy:0});Object.assign(c,{x:380,y:300,vx:-200,vy:0});
 b.step(1/120);
 assert.ok(b.audioEvents.some(e=>e.type==='bump'),'충돌하면 부딪히는 소리 이벤트 발생');
 let bumps=0;for(let i=0;i<12;i++){b.step(1/120);bumps+=b.audioEvents.filter(e=>e.type==='bump').length;}
 assert.equal(bumps,0,'접촉 판정 쿨타임 동안에는 소리도 반복되지 않음');
}
console.log('충돌 회귀 검사 통과: 정면·같은 방향·속도 차이·돌진·고정 장전·벽·모서리·벽 사이 끼임·중심 일치·충돌 스핀과 감쇠·상시 회전·충돌음');
