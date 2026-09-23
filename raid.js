(function(g){
'use strict';
const {Battle,copy,SIZE,PAD}=g.ArenaEngine;
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

class RaidBattle extends Battle{
  constructor(config,entries,mode,random=Math.random){
    if(!Array.isArray(entries)||entries.length<2||entries.length>8)
      throw Error('참가자는 2~8명이어야 합니다.');

    const safe=copy(config);
    for(const c of safe.characters)c.radius=Math.min(45,c.radius);
    super(safe,entries.slice(0,2).map(e=>e.id),g.ArenaAbilities,random);

    this.mode=mode;
    this.contacts=new Map();
    this.result='';

    this.fighters=entries.map((entry,slot)=>{
      const c=safe.characters.find(c=>c.id===entry.id);
      if(!c)throw Error('참가 캐릭터를 선택하세요.');

      const radius=Number(entry.radius),hp=Number(entry.hp);
      if(!Number.isFinite(radius)||radius<12||radius>120)
        throw Error('크기는 12~120 사이여야 합니다.');
      if(!Number.isFinite(hp)||hp<10||hp>100000)
        throw Error('체력은 10~100000 사이여야 합니다.');

      const angle=random()*Math.PI*2;
      return {
        ...copy(c),
        slot,
        team:mode==='boss'?(slot===0?0:1):slot,
        hp,
        maxHp:hp,
        radius,
        x:360,
        y:360,
        vx:Math.cos(angle)*c.speed,
        vy:Math.sin(angle)*c.speed,
        skills:c.abilities.map(id=>({
          ...copy(safe.abilities.find(a=>a.id===id)),
          remaining:safe.abilities.find(a=>a.id===id).cooldown
        })),
        skillState:{},
        dash:null,
        shield:0,
        shieldTime:0,
        flash:0,
        trail:[],
        spin:0,
        facing:0
      };
    });

    this.api=Object.freeze({
      ...this.api,
      effect:(type,self,state,duration)=>{
        if(!this.types[type]?.update||
           !Number.isFinite(duration)||duration<=0)
          throw Error('지원하지 않는 지속 능력입니다.');

        this.effects.push({
          ...copy(state),
          type,
          owner:self.slot,
          targetSlot:this.target(self)?.slot,
          remaining:duration
        });
      }
    });

    this.place();
  }

  enemies(f){
    return this.fighters.filter(t=>t.hp>0&&t.team!==f.team);
  }

  target(f){
    return this.enemies(f).sort((a,b)=>dist(f,a)-dist(f,b))[0];
  }

  effectTarget(e){
    const self=this.fighters[e.owner];
    const old=this.fighters[e.targetSlot];
    if(old?.hp>0&&old.team!==self.team)return old;

    const target=this.target(self);
    e.targetSlot=target?.slot;
    return target;
  }

  fits(f,placed){
    return f.x>=PAD+f.radius&&
      f.x<=SIZE-PAD-f.radius&&
      f.y>=PAD+f.radius&&
      f.y<=SIZE-PAD-f.radius&&
      placed.every(p=>dist(f,p)>=f.radius+p.radius+8);
  }

  place(){
    if(this.mode==='boss'){
      const [boss,...others]=this.fighters;
      boss.x=boss.y=360;

      const big=Math.max(...others.map(f=>f.radius));
      const low=boss.radius+big+16;
      const high=348-big;

      for(let r=high;r>=low;r-=2){
        const placed=[boss];
        let valid=true;

        others.forEach((f,i)=>{
          const angle=-Math.PI/2+i/others.length*Math.PI*2;
          f.x=360+Math.cos(angle)*r;
          f.y=360+Math.sin(angle)*r;
          if(!this.fits(f,placed))valid=false;
          placed.push(f);
        });

        if(valid)return;
      }
    }else{
      const order=[...this.fighters].sort((a,b)=>b.radius-a.radius);

      for(let attempt=0;attempt<40;attempt++){
        const placed=[];
        let valid=true;

        for(const f of order){
          let found=false;
          for(let i=0;i<300;i++){
            const lo=PAD+f.radius+3;
            const span=SIZE-2*lo;
            f.x=lo+this.random()*span;
            f.y=lo+this.random()*span;

            if(this.fits(f,placed)){
              found=true;
              break;
            }
          }
          if(!found){
            valid=false;
            break;
          }
          placed.push(f);
        }

        if(valid)return;
      }
    }

    throw Error('겹치지 않게 배치할 공간이 부족합니다. 인원이나 크기를 줄여 주세요.');
  }

  damage(target,amount,source,kind='hit'){
    if(!target||target.hp<=0||
       (source&&source.team===target.team))return;
    super.damage(target,amount,source,kind);
  }

  cast(f,s){
    const target=this.target(f);
    if(!target)return;

    if(s.type==='pulse'){
      this.api.ring(f,s.params.range);
      for(const t of this.enemies(f)){
        if(dist(f,t)<=s.params.range+t.radius){
          this.damage(t,s.params.damage,f);
          this.api.pushAway(t,f);
        }
      }
    }else{
      this.types[s.type].cast(this.api,f,target,s.params,s);
    }
  }

  start(){
    if(this.state==='ready'){
      for(const f of this.fighters){
        for(const s of f.skills){
          if(this.types[s.type].trigger==='pickup'){
            this.cast(f,s);
          }
        }
      }
    }

    if(this.state==='ready'||this.state==='paused'){
      this.state='running';
    }
  }

  finish(){
    const live=this.fighters.filter(f=>f.hp>0);
    const teams=new Set(live.map(f=>f.team));

    if(teams.size<=1){
      this.state='ended';
      this.result=!live.length?'무승부':
        this.mode==='boss'?
          (live[0].team===0?'보스 승리!':'레이드 팀 승리!'):
          live[0].name+' 승리!';
    }else if(this.time>=120){
      this.state='ended';
      this.result='시간 종료 · 무승부';
    }
  }

  step(dt){
    this.wallHits=[];
    this.audioEvents=[];
    if(this.state!=='running')return;
    if(!(dt>0&&dt<=1/60))throw Error('잘못된 물리 간격');

    this.time+=dt;

    for(const f of this.fighters){
      if(f.hp<=0)continue;

      f.flash=Math.max(0,f.flash-dt);
      f.shieldTime-=dt;
      if(f.shieldTime<=0)f.shield=0;

      if(!f.rooted)f.facing+=(f.spin+1.4)*dt;
      f.spin*=Math.max(0,1-dt*3.2);

      if(f.dash){
        f.dash.remaining-=dt;
        if(f.dash.remaining<=0){
          f.dash=null;
          this.normalize(f);
        }
      }

      for(const s of f.skills){
        if(this.types[s.type].trigger==='pickup'||f.rooted)continue;
        s.remaining-=dt;
        if(s.remaining<=0){
          this.cast(f,s);
          s.remaining+=s.cooldown;
        }
      }

      if(!f.rooted){
        f.x+=f.vx*dt;
        f.y+=f.vy*dt;
        this.wall(f);
      }
    }

    for(let pass=0;pass<4;pass++){
      for(let i=0;i<this.fighters.length;i++){
        for(let j=i+1;j<this.fighters.length;j++){
          const a=this.fighters[i];
          const b=this.fighters[j];

          if(a.hp<=0||b.hp<=0||
             !this.separateFighters(a,b)||a.team===b.team)continue;

          const key=i+':'+j;
          if((this.contacts.get(key)||0)>this.time)continue;

          const da=a.contactDamage+
            (a.dash&&!a.dash.hit?a.dash.damage:0);
          const db=b.contactDamage+
            (b.dash&&!b.dash.hit?b.dash.damage:0);

          this.damage(a,db,b);
          this.damage(b,da,a);

          if(a.dash)a.dash.hit=true;
          if(b.dash)b.dash.hit=true;

          this.contacts.set(key,this.time+.35);
          this.api.sound('bump');
        }
      }
    }

    for(const s of this.shots){
      const owner=this.fighters[s.owner];
      if(owner.hp<=0){
        s.life=0;
        continue;
      }

      const x=s.x,y=s.y;
      s.x+=s.vx*dt;
      s.y+=s.vy*dt;
      s.life-=dt;

      const dx=s.x-x,dy=s.y-y,n=dx*dx+dy*dy;
      const hits=this.enemies(owner).map(t=>{
        const k=n?Math.max(0,Math.min(1,
          ((t.x-x)*dx+(t.y-y)*dy)/n)):0;

        return {
          t,
          k,
          hit:Math.hypot(
            t.x-x-k*dx,
            t.y-y-k*dy
          )<=t.radius+s.radius
        };
      }).filter(h=>h.hit).sort((a,b)=>a.k-b.k);

      if(hits.length){
        this.damage(hits[0].t,s.damage,owner);
        s.life=0;
      }

      const outside=s.x<PAD+s.radius||
        s.x>SIZE-PAD-s.radius||
        s.y<PAD+s.radius||
        s.y>SIZE-PAD-s.radius;

      if(outside){
        if(s.bounces>0){
          this.wall(s);
          s.bounces--;
        }else{
          s.life=0;
        }
      }
    }

    this.shots=this.shots.filter(s=>s.life>0);

    for(const o of this.orbits){
      const f=this.fighters[o.owner];
      o.remaining-=dt;

      if(f.hp<=0){
        o.remaining=0;
        continue;
      }

      o.angle+=o.speed*dt;
      o.x=f.x+Math.cos(o.angle)*o.range;
      o.y=f.y+Math.sin(o.angle)*o.range;
      o.hits=o.hits||{};

      for(const t of this.enemies(f)){
        if(o.remaining>0&&
           (o.hits[t.slot]||0)<=this.time&&
           dist(o,t)<t.radius+9){
          this.damage(t,o.damage,f);
          o.hits[t.slot]=this.time+.35;
        }
      }
    }

    this.orbits=this.orbits.filter(o=>o.remaining>0);

    const bank=this.sharedState.get('missile-money');
    if(bank){
      bank.renderer=this.effects.find(e=>
        e.type==='moneyMissile'&&
        this.fighters[e.owner].hp>0
      )?.owner;
    }

    for(const e of this.effects){
      const f=this.fighters[e.owner];
      const target=this.effectTarget(e);

      if(f.hp<=0||!target){
        e.remaining=0;
        f.rooted=false;
        continue;
      }

      this.types[e.type].update(e,this.api,f,target,dt);
      e.remaining-=dt;
    }

    this.effects=this.effects.filter(e=>
      e.remaining>0&&this.fighters[e.owner].hp>0
    );

    for(const p of this.particles){
      p.x+=p.vx*dt;
      p.y+=p.vy*dt;
      p.life-=dt;
    }
    this.particles=this.particles.filter(p=>p.life>0);

    for(const r of this.rings)r.life-=dt;
    this.rings=this.rings.filter(r=>r.life>0);

    this.finish();
  }
}

g.RaidBattle=RaidBattle;
})(globalThis);

(function(g){
'use strict';

function mount(){
  if(document.getElementById('raid-open'))return;

  document.getElementById('character-radius').max='120';

  const main=document.querySelector('main');
  const open=document.createElement('button');
  open.id='raid-open';
  open.textContent='다인전 · 보스 레이드';
  document.querySelector('header').append(open);

  const panel=document.createElement('section');
  panel.hidden=true;
  panel.style.cssText='max-width:900px;margin:20px auto;padding:16px';

  panel.innerHTML=[
    '<h2>다인전 · 보스 레이드</h2>',
    '<p>2~8명 · 같은 캐릭터도 여러 번 참가 가능 · 최대 120초</p>',
    '<label>배치 방식 <select id="raid-mode"><option value="random">랜덤 배치 · 개인전</option><option value="boss">보스 중앙 · 원형 포위</option></select></label>',
    '<p id="raid-help">모두 서로 공격합니다. 원이 겹치지 않게 무작위 배치합니다.</p>',
    '<div id="raid-rows"></div>',
    '<button id="raid-add">＋ 참가자 추가</button> ',
    '<button id="raid-place">다시 배치</button> ',
    '<button id="raid-start">3·2·1 시작</button> ',
    '<button id="raid-pause" disabled>일시정지</button> ',
    '<button id="raid-back">기존 대전으로</button>',
    '<label style="display:block;margin:12px 0"><input type="checkbox" id="raid-sound" checked> 소리</label>',
    '<p id="raid-message" role="status"></p>',
    '<canvas id="raid-canvas" width="720" height="720" style="display:block;width:100%;height:auto;border:3px solid #222;background:white"></canvas>',
    '<div id="raid-hp" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;margin-top:12px"></div>'
  ].join('');

  document.body.append(panel);

  const $=id=>document.getElementById('raid-'+id);
  const ctx=$('canvas').getContext('2d');
  const sound=new g.ArenaWallSound();
  sound.last=Array(8).fill(-Infinity);

  const images=new Map();
  let config,battle,countdown=null,frameId=0,last=0,acc=0;
  let seenImpact=0,shake=0,tick=0;

  const reduced=g.matchMedia?.(
    '(prefers-reduced-motion: reduce)'
  ).matches;

  function roster(){
    const raw=localStorage.getItem('bounce.roster.v1');
    const data=raw?
      JSON.parse(raw):
      g.ArenaEngine.copy(g.ArenaDefaults);

    const add=(list,item)=>{
      if(item&&!list.some(v=>v.id===item.id)){
        list.push(g.ArenaEngine.copy(item));
      }
    };

    add(data.abilities,g.ArenaNosePreset?.ability);
    add(data.characters,g.ArenaNosePreset?.character);
    add(data.abilities,g.ArenaMissilePreset);
    add(data.abilities,g.ArenaFartPreset);

    if(g.ArenaPhonePack){
      g.ArenaPhonePack.abilities.forEach(a=>
        add(data.abilities,a)
      );
      add(data.characters,g.ArenaPhonePack.character);
    }

    return g.ArenaEngine.validate(data,g.ArenaAbilities);
  }

  function say(text){
    $('message').textContent=text;
  }

  function buttons(){
    const busy=!!countdown||
      battle?.state==='running'||
      battle?.state==='paused';

    for(const el of $('rows').querySelectorAll('input,select,button')){
      el.disabled=busy;
    }

    $('mode').disabled=busy;
    $('add').disabled=busy||$('rows').children.length>=8;
    $('place').disabled=busy;
    $('start').disabled=busy;
    $('pause').disabled=!busy;
  }

  function entries(){
    return [...$('rows').children].map(row=>({
      id:row.querySelector('select').value,
      radius:Number(row.querySelector('[data-radius]').value),
      hp:Number(row.querySelector('[data-hp]').value)
    }));
  }

  function preview(){
    try{
      const next=new g.RaidBattle(
        config,entries(),$('mode').value
      );

      sound.stopSamples();
      battle=next;
      countdown=null;
      acc=0;
      seenImpact=0;
      shake=0;

      $('pause').textContent='일시정지';
      say('배치 준비 완료 · 시작을 누르세요.');

      const hp=$('hp');
      hp.replaceChildren();

      for(const f of battle.fighters){
        const card=document.createElement('div');
        card.style.cssText=
          'padding:10px;border:1px solid #ccc;border-radius:8px';
        hp.append(card);
      }

      buttons();
      draw();
      return true;
    }catch(error){
      battle=null;
      say(error.message);
      $('hp').replaceChildren();
      buttons();
      draw();
      return false;
    }
  }

  function row(id){
    if($('rows').children.length>=8)return;

    const host=document.createElement('div');
    host.style.cssText=
      'display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:10px 0;padding:10px;border:1px solid #ccc';

    host.innerHTML=
      '<select aria-label="참가 캐릭터"></select>'+
      '<label>크기 <input data-radius type="number" min="12" max="120" step="1" style="width:72px"></label>'+
      '<label>체력 <input data-hp type="number" min="10" max="100000" step="1" style="width:100px"></label>'+
      '<button type="button">빼기</button>';

    const select=host.querySelector('select');

    for(const c of config.characters){
      const o=document.createElement('option');
      o.value=c.id;
      o.textContent=c.name;
      select.append(o);
    }

    select.value=id||config.characters[0].id;

    const defaults=()=>{
      const c=config.characters.find(c=>c.id===select.value);
      host.querySelector('[data-radius]').value=c.radius;
      host.querySelector('[data-hp]').value=c.hp;
    };

    defaults();

    select.onchange=()=>{
      defaults();
      preview();
    };

    for(const input of host.querySelectorAll('input')){
      input.onchange=preview;
    }

    host.querySelector('button').onclick=()=>{
      if($('rows').children.length<=2){
        say('최소 2명이 필요합니다.');
        return;
      }
      host.remove();
      preview();
    };

    $('rows').append(host);
  }

  function circle(x,y,r,color){
    ctx.fillStyle=color;
    ctx.beginPath();
    ctx.arc(x,y,r,0,Math.PI*2);
    ctx.fill();
  }

  function draw(){
    ctx.clearRect(0,0,720,720);
    ctx.fillStyle='#fff';
    ctx.fillRect(0,0,720,720);
    if(!battle)return;

    ctx.save();

    if(!reduced&&shake>0){
      ctx.translate(
        Math.sin(last*.11)*shake*12,
        Math.cos(last*.13)*shake*12
      );
    }

    ctx.beginPath();
    ctx.rect(6,6,708,708);
    ctx.clip();

    for(const r of battle.rings){
      ctx.globalAlpha=Math.max(0,r.life/.45);
      ctx.strokeStyle=r.color;
      ctx.lineWidth=3;
      ctx.beginPath();
      ctx.arc(
        r.x,r.y,
        r.from+(r.range-r.from)*(1-r.life/.45),
        0,Math.PI*2
      );
      ctx.stroke();
    }

    ctx.globalAlpha=1;
    globalThis.ArenaDrawGas?.(ctx,battle);

    for(const f of battle.fighters){
      if(f.hp<=0)continue;

      ctx.save();
      ctx.translate(
        0,
        globalThis.Arena67BodyOffset?.(f,battle)||0
      );

      circle(f.x,f.y,f.radius,f.color);

      const img=images.get(f.id);
      if(img?.complete&&img.naturalWidth){
        const side=Math.min(
          img.naturalWidth,img.naturalHeight
        );

        ctx.save();
        ctx.translate(f.x,f.y);
        ctx.rotate(f.facing);
        ctx.beginPath();
        ctx.arc(0,0,f.radius,0,Math.PI*2);
        ctx.clip();

        ctx.drawImage(
          img,
          (img.naturalWidth-side)/2,
          (img.naturalHeight-side)/2,
          side,side,
          -f.radius,-f.radius,
          2*f.radius,2*f.radius
        );

        ctx.restore();
      }

      if(!reduced&&f.flash>0){
        ctx.globalAlpha=f.flash*2;
        circle(f.x,f.y,f.radius,'#ff2222');
        ctx.globalAlpha=1;
      }

      ctx.strokeStyle=f.shield>0?'#dfad27':
        battle.mode==='boss'&&f.slot===0?'#c12828':'#222';
      ctx.lineWidth=3;
      ctx.beginPath();
      ctx.arc(f.x,f.y,f.radius+1,0,Math.PI*2);
      ctx.stroke();

      ctx.fillStyle='#333';
      ctx.font='bold 15px sans-serif';
      ctx.textAlign='center';

      ctx.fillText(
        (battle.mode==='boss'&&f.slot===0?'보스 · ':'')+f.name,
        f.x,
        Math.max(20,f.y-f.radius-10)
      );

      const width=Math.max(50,f.radius*2);
      const y=Math.min(699,f.y+f.radius+9);

      ctx.fillStyle='#ddd';
      ctx.fillRect(f.x-width/2,y,width,8);
      ctx.fillStyle='#24af42';
      ctx.fillRect(
        f.x-width/2,y,width*f.hp/f.maxHp,8
      );

      ctx.restore();

      if(countdown){
        ctx.save();
        ctx.translate(f.x,f.y);
        ctx.rotate(countdown.angle(f.slot));
        ctx.strokeStyle='#222';
        ctx.lineWidth=4;

        const start=f.radius+8,end=start+28;
        ctx.beginPath();
        ctx.moveTo(start,0);
        ctx.lineTo(end,0);
        ctx.lineTo(end-9,-7);
        ctx.moveTo(end,0);
        ctx.lineTo(end-9,7);
        ctx.stroke();

        ctx.restore();
      }
    }

    for(const e of battle.effects){
      const target=battle.effectTarget(e);
      if(!target)continue;

      ctx.save();
      g.ArenaAbilities[e.type].draw?.(
        ctx,e,battle.fighters[e.owner],target
      );
      ctx.restore();
    }

    for(const o of battle.orbits){
      circle(
        o.x,o.y,8,battle.fighters[o.owner].color
      );
    }

    for(const s of battle.shots){
      circle(s.x,s.y,s.radius,s.color);
    }

    for(const p of battle.particles){
      ctx.globalAlpha=Math.max(0,p.life/.4);
      circle(p.x,p.y,3,p.color);
    }

    ctx.globalAlpha=1;
    ctx.restore();

    if(countdown||battle.state==='ended'){
      ctx.fillStyle='rgba(255,255,255,.7)';
      ctx.fillRect(0,295,720,120);
      ctx.fillStyle='#222';
      ctx.textAlign='center';
      ctx.font='bold 42px sans-serif';
      ctx.fillText(
        countdown?String(countdown.number):battle.result,
        360,365
      );
    }

    battle.fighters.forEach((f,i)=>{
      const card=$('hp').children[i];
      if(!card)return;

      card.textContent=
        (f.hp<=0?'탈락 · ':'')+
        (battle.mode==='boss'&&i===0?'보스 · ':'')+
        f.name+' '+Math.ceil(f.hp)+' / '+f.maxHp;
      card.style.opacity=f.hp>0?'1':'.45';
    });
  }

  function loop(now){
    const dt=last?Math.min(.05,(now-last)/1000):0;
    last=now;

    try{
      if(countdown){
        countdown.update(dt);

        if(tick!==countdown.number){
          tick=countdown.number;
          sound.play('countdownTick');
        }

        if(countdown.done){
          countdown=null;
          battle.start();
          acc=0;
        }
      }else if(battle?.state==='running'){
        acc+=dt;

        while(acc>=1/120&&battle.state==='running'){
          battle.step(1/120);
          acc-=1/120;

          for(const h of battle.wallHits){
            sound.hit(h.slot);
          }
          for(const e of battle.audioEvents){
            sound.play(e.type);
          }
        }

        if(battle.impactId>seenImpact){
          shake=.3;
          seenImpact=battle.impactId;
        }

        say(
          battle.state==='ended'?battle.result:
          Math.floor(battle.time)+'초 · 생존 '+
          battle.fighters.filter(f=>f.hp>0).length+'명'
        );

        if(battle.state==='ended')buttons();
      }

      sound.setFlight(
        battle?.state==='running'&&
        battle.effects.some(e=>
          e.type==='moneyMissile'&&e.missiles.length
        )
      );

      shake=Math.max(0,shake-dt);
      draw();
    }catch(error){
      if(battle)battle.pause();
      sound.stopSamples();
      say('진행 중 오류: '+error.message);
      buttons();
    }

    if(!panel.hidden){
      frameId=requestAnimationFrame(loop);
    }
  }

  open.onclick=()=>{
    try{
      config=roster();

      const oldPause=document.getElementById('pause');
      if(!oldPause.disabled&&oldPause.textContent==='일시정지'){
        oldPause.click();
      }

      images.clear();

      for(const c of config.characters){
        if(c.image){
          const img=new Image();
          img.src=c.image;
          images.set(c.id,img);
        }
      }

      $('rows').replaceChildren();
      row(config.characters[0].id);
      row(config.characters[1]?.id||config.characters[0].id);

      $('mode').value='random';
      $('help').textContent=
        '랜덤 개인전: 모두 서로 공격합니다. 크기와 체력 변경은 이번 다인전에 적용됩니다.';

      main.hidden=true;
      panel.hidden=false;

      preview();
      last=0;
      frameId=requestAnimationFrame(loop);
      panel.scrollIntoView();
    }catch(error){
      say(error.message);
      alert(error.message);
    }
  };

  $('add').onclick=()=>{
    row();
    preview();
  };

  $('place').onclick=preview;

  $('mode').onchange=()=>{
    const boss=$('mode').value==='boss';

    $('help').textContent=boss?
      '첫 번째 참가자가 보스입니다. 나머지는 한 팀이며 보스만 공격합니다. 보스 크기·체력을 직접 조절하세요.':
      '랜덤 개인전: 모두 서로 공격합니다.';

    if(boss){
      const first=$('rows').firstElementChild;
      first.querySelector('[data-radius]').value=90;
      first.querySelector('[data-hp]').value=2000;
    }

    preview();
  };

  $('start').onclick=()=>{
    if((!battle||battle.state!=='ready')&&!preview())return;

    sound.unlock();
    countdown=new g.ArenaCountdown(battle.fighters);
    tick=3;
    sound.play('countdownTick');
    buttons();
  };

  $('pause').onclick=()=>{
    if(countdown){
      countdown.paused=!countdown.paused;
      $('pause').textContent=countdown.paused?
        '계속하기':'일시정지';
    }else if(battle?.state==='running'){
      battle.pause();
      $('pause').textContent='계속하기';
    }else if(battle?.state==='paused'){
      battle.start();
      acc=0;
      sound.unlock();
      $('pause').textContent='일시정지';
    }

    sound.stopSamples();
  };

  $('sound').onchange=()=>{
    sound.enabled=$('sound').checked;
    if(sound.enabled)sound.unlock();
    else sound.stopSamples();
  };

  $('back').onclick=()=>{
    cancelAnimationFrame(frameId);
    sound.stopSamples();
    countdown=null;
    battle=null;
    panel.hidden=true;
    main.hidden=false;
    open.focus();
  };

  document.addEventListener('visibilitychange',()=>{
    if(document.hidden&&!panel.hidden){
      if(countdown)countdown.paused=true;
      if(battle?.state==='running')battle.pause();
      $('pause').textContent='계속하기';
      sound.stopSamples();
    }
  });
}

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',mount);
}else{
  mount();
}
})(globalThis);
