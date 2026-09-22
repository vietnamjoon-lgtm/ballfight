/* Money-gated homing missile: no timed auto-fire, no external assets. */
(function (global) {
  'use strict';
  const missileImage = typeof Image !== 'undefined' && global.ArenaMedia ? new Image() : null;
  if (missileImage) missileImage.src = global.ArenaMedia.image;
  const field = (label, min, max, step, value) => ({ label, min, max, step, default: value });
  const bankFor = api => api.shared('missile-money', () => ({ coins: [], collected: [], intervals: [], nextDrop: null, processedAt: -1, renderer: null }));
  // Remote timeline: pull it out and press the button right away (PRE), then hold it down through a 3s countdown.
  const PRE_CHARGE = 1, COUNTDOWN = 3, TOTAL_CHARGE = PRE_CHARGE + COUNTDOWN;
  global.ArenaAbilities.moneyMissile = {
    label: '미사일 쏘기', trigger: 'pickup', uniquePerCharacter: true,
    description: '바닥의 돈(최대 4개)을 모아 소모하면 리모컨을 꺼내자마자 버튼을 누르고, 3초 카운트다운이 끝나면 경기장 밖에서 유도 미사일이 날아옵니다. 이 능력이 있는 캐릭터만 돈을 줍습니다. 시간만 지나서는 발사하지 않습니다.',
    fields: {
      required: field('발사에 필요한 돈', 1, 10, 1, 3), dropInterval: field('돈이 떨어지는 간격 (초)', .5, 10, .5, 2),
      damage: field('미사일 피해', 1, 100, 1, 55), speed: field('미사일 속도', 150, 1400, 10, 800),
      turnRate: field('유도 회전 속도', 1, 12, .5, 9), lifetime: field('최대 추적 시간 (초)', 2, 15, .5, 8)
    },
    status(self, skill) {
      const state = self.skillState[skill.id];
      if (state?.charging > 0) return { label: `발사 준비 ${Math.ceil(Math.min(state.charging, COUNTDOWN))}`, progress: 1 - state.charging / TOTAL_CHARGE };
      const count = state?.money || 0;
      return { label: `돈 ${count} / ${skill.params.required}`, progress: count / skill.params.required };
    },
    cast(api, self, target, p, skill) {
      const bank = bankFor(api); bank.intervals.push(p.dropInterval);
      if (bank.renderer === null) bank.renderer = self.slot;
      self.skillState[skill.id] = { money: 0 };
      api.effect('moneyMissile', self, { ...p, skillId: skill.id, missiles: [], pickups: [], charge: 0, recoil: 0, aim: 0, nextFire: 0 }, 125);
    },
    update(e, api, self, target, dt) {
      const now = api.now(), bank = bankFor(api); e.bank = bank;
      if (bank.processedAt !== now) {
        bank.processedAt = now;
        bank.collected = bank.collected.filter(p => p.until > now);
        const interval = Math.min(...bank.intervals);
        if (bank.nextDrop === null) bank.nextDrop = now - dt + interval;
        if (now + 1e-8 >= bank.nextDrop) {
          bank.nextDrop += interval;
          if (bank.coins.length < 4) {
            const clear = p => bank.coins.every(c => Math.hypot(c.x - p.x, c.y - p.y) >= 150)
              && bank.collected.every(c => Math.hypot(c.x - p.x, c.y - p.y) >= 180)
              && [self, target].every(f => Math.hypot(f.x - p.x, f.y - p.y) >= f.radius + 90);
            let point = null;
            for (let i = 0; i < 48; i++) {
              const candidate = { x: 55 + api.random() * 610, y: 55 + api.random() * 610 };
              if (clear(candidate)) { point = candidate; break; }
            }
            // Deterministic fallback still honors every distance restriction.
            if (!point) for (let i = 0; i < 49; i++) {
              const candidate = { x: 55 + (i % 7) * 100, y: 55 + Math.floor(i / 7) * 100 };
              if (clear(candidate)) { point = candidate; break; }
            }
            if (point) bank.coins.push({ ...point, born: now, ready: now + .35, expires: now + 24 });
          }
        }
        bank.coins = bank.coins.filter(c => c.expires > now);
      }
      e.recoil = Math.max(0, e.recoil - dt);
      if (e.charge > 0) e.aim = Math.atan2(target.y - self.y, target.x - self.x);
      const wallet = self.skillState[e.skillId];
      if (self.hp <= 0) { e.charge = 0; self.rooted = false; wallet.charging = 0; }
      else if (e.charge > 0) {
        const beforeCeil = Math.ceil(e.charge), wasPreCharge = e.charge > COUNTDOWN;
        e.charge = Math.max(0, e.charge - dt); if (e.charge < 1e-8) e.charge = 0;
        wallet.charging = e.charge;
        // The button gets pressed the instant the remote finishes coming out; the 3s countdown starts from there.
        if (wasPreCharge && e.charge <= COUNTDOWN) { api.sound('remoteClick'); api.sound('countdownTick'); }
        if (e.charge > 0 && Math.ceil(e.charge) !== beforeCeil && beforeCeil <= COUNTDOWN) api.sound('countdownTick');
        if (e.charge === 0) {
          self.rooted = false; e.nextFire = now + .6; e.recoil = .6;
          const side = Math.min(3, Math.floor(api.random() * 4)), along = 70 + api.random() * 580;
          const spawn = [{ x: -64, y: along }, { x: 784, y: along }, { x: along, y: -64 }, { x: along, y: 784 }][side];
          const angle = Math.atan2(target.y - spawn.y, target.x - spawn.x);
          e.missiles.push({ ...spawn, angle, entered: false, life: e.lifetime, trail: [] });
          api.sound('missileLaunch'); api.log(`${self.name} · 카운트다운 종료! 외부 미사일 접근`);
        }
      } else {
        bank.coins = bank.coins.filter(c => {
          if (now >= c.ready && Math.hypot(self.x - c.x, self.y - c.y) <= self.radius + 18) {
            bank.collected.push({ x: c.x, y: c.y, until: now + 8 });
            wallet.money++; e.pickups.push({ x: c.x, y: c.y, life: .55 }); return false;
          }
          return true;
        });
        if (wallet.money >= e.required && now >= e.nextFire) {
          wallet.money -= e.required; e.charge = TOTAL_CHARGE; wallet.charging = TOTAL_CHARGE; self.rooted = true; e.remoteSide = self.x > 500 ? -1 : 1; e.aim = Math.atan2(target.y - self.y, target.x - self.x);
          api.log(`${self.name} · 돈 ${e.required}개 사용! 스위치를 누르고 3초 카운트다운 시작`);
        }
      }
      for (const m of e.missiles) {
        const aim = Math.atan2(target.y - m.y, target.x - m.x), delta = Math.atan2(Math.sin(aim - m.angle), Math.cos(aim - m.angle));
        m.angle += Math.max(-e.turnRate * dt, Math.min(e.turnRate * dt, delta));
        const oldX = m.x, oldY = m.y;
        m.x += Math.cos(m.angle) * e.speed * dt; m.y += Math.sin(m.angle) * e.speed * dt; m.life -= dt;
        m.trail.push({ x: m.x, y: m.y }); if (m.trail.length > 22) m.trail.shift();
        // Segment-circle collision prevents fast missiles skipping through a target.
        const dx = m.x - oldX, dy = m.y - oldY, denom = dx * dx + dy * dy;
        const t = denom ? Math.max(0, Math.min(1, ((target.x - oldX) * dx + (target.y - oldY) * dy) / denom)) : 0;
        if (target.hp > 0 && Math.hypot(target.x - oldX - t * dx, target.y - oldY - t * dy) <= target.radius + 16) {
          api.explosion(target, e.damage, self); api.sound('missileExplosion'); m.life = 0;
        }
        const inside = m.x >= 8 && m.x <= 712 && m.y >= 8 && m.y <= 712;
        if (inside) m.entered = true;
        if ((m.entered && !inside) || m.x < -120 || m.x > 840 || m.y < -120 || m.y > 840) m.life = 0;
      }
      e.missiles = e.missiles.filter(m => m.life > 0);
      for (const p of e.pickups) p.life -= dt; e.pickups = e.pickups.filter(p => p.life > 0);
    },
    draw(ctx, e, self) {
      if (e.charge > 0 || e.recoil > 0) {
        // Elapsed time since the remote came out: PRE_CHARGE(1s) to rise and press, then COUNTDOWN(3s) held down.
        const t = e.charge > 0 ? TOTAL_CHARGE - e.charge : PRE_CHARGE;
        const deploy = e.charge > 0 ? Math.min(1, t / .5) : Math.min(1, e.recoil / .22);
        const side = e.remoteSide || 1, rx = side * (self.radius * .65 + 19) * deploy;
        const ry = self.radius * .55 + 15 - deploy * 40;
        // Press the button once, right after rising (t in [.5,.8]), then lift the finger back off (t in [.8,1]).
        const pressStroke = e.charge > 0 ? (t < .5 ? 0 : t < .8 ? (t - .5) / .3 : Math.max(0, 1 - (t - .8) / .2)) : 0;
        const pressed = e.charge <= 0 && e.recoil > .28;
        const buttonDown = pressed;
        const finger = pressStroke;
        ctx.save(); ctx.translate(self.x, self.y);
        // Pocket seam, hand and a rising one-button remote based on the reference.
        ctx.strokeStyle = '#444'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(side * 10, self.radius * .45); ctx.lineTo(side * 27, self.radius * .72); ctx.lineTo(side * 40, self.radius * .43); ctx.stroke();
        ctx.strokeStyle = '#e1b092'; ctx.lineWidth = 11; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(side * 14, 15); ctx.lineTo(rx - side * 7, ry + 22); ctx.stroke();
        ctx.save(); ctx.translate(rx, ry); ctx.scale(.65 + deploy * .35, .65 + deploy * .35); ctx.rotate(side * -.3);
        ctx.lineWidth = 2.5; ctx.strokeStyle = '#171717';
        ctx.fillStyle = '#626262'; ctx.beginPath(); ctx.moveTo(-20,-30); ctx.lineTo(-12,-38); ctx.lineTo(25,-38); ctx.lineTo(18,-30); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#505050'; ctx.beginPath(); ctx.moveTo(18,-30); ctx.lineTo(25,-38); ctx.lineTo(25,28); ctx.lineTo(18,36); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#858585'; ctx.fillRect(-20,-30,38,66); ctx.strokeRect(-20,-30,38,66);
        // Kinked antenna based on the new reference photo.
        ctx.strokeStyle = '#111'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(0,-35); ctx.lineTo(-7,-39); ctx.lineTo(5,-43); ctx.lineTo(-7,-47); ctx.lineTo(5,-51); ctx.lineTo(-4,-56); ctx.stroke();
        ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(-4,-59,5,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#9e090e'; ctx.lineWidth = 3; ctx.fillStyle = '#53080c'; ctx.beginPath(); ctx.arc(-1,4,15,0,Math.PI*2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = buttonDown ? '#b40812' : '#f01620'; ctx.beginPath(); ctx.ellipse(-1, buttonDown ? 6 : 2, buttonDown ? 11 : 13, buttonDown ? 10 : 13,0,0,Math.PI*2); ctx.fill();
        if (!buttonDown) { ctx.strokeStyle = '#ff8b8b'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(-1,2,10,3.5,5.1); ctx.stroke(); }
        if (pressed) {
          ctx.strokeStyle = '#f24637'; ctx.lineWidth = 2;
          for (let i=0;i<3;i++) { const radius=12+i*8+(1-e.recoil/.6)*12; ctx.beginPath(); ctx.arc(-4,-59,radius,-2.5,-.6);ctx.stroke(); }
        }
        // The finger presses down right after the remote rises, then stays on the button through the countdown.
        if (finger > 0) { ctx.strokeStyle = '#6b4939'; ctx.lineWidth=11; ctx.beginPath(); ctx.moveTo(-side*28,-12); ctx.lineTo(-side*(24-23*finger), buttonDown?5:2); ctx.stroke(); ctx.strokeStyle='#efc3a4';ctx.lineWidth=8;ctx.stroke(); }
        ctx.restore(); ctx.restore();
        // Just the 3·2·1 countdown number, nothing else, once the button's been pressed and released.
        if (e.charge > 0 && e.charge <= COUNTDOWN) {
          const panelY = Math.min(660, Math.max(43, self.y-self.radius-64));
          ctx.fillStyle='#292b30';ctx.beginPath();ctx.arc(self.x,panelY-4,22,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#dc4545';ctx.lineWidth=2;ctx.stroke();
          ctx.textAlign='center';ctx.fillStyle='#fff';ctx.font='900 26px Arial';ctx.fillText(String(Math.ceil(e.charge)),self.x,panelY+5);
        }
      }
      const bank = e.bank;
      if (bank && bank.renderer === self.slot) {
        for (const coin of bank.coins) {
          const fall = Math.max(0, (coin.ready - bank.processedAt) / .35), y = coin.y - fall * 48;
          ctx.fillStyle = '#00000018'; ctx.beginPath(); ctx.ellipse(coin.x, coin.y + 15, 19.5, 6, 0, 0, Math.PI * 2); ctx.fill();
          ctx.save(); ctx.translate(coin.x, y); ctx.rotate(-.13); ctx.scale(1.5, 1.5);
          ctx.fillStyle = '#a4e49a'; ctx.strokeStyle = '#27743b'; ctx.lineWidth = 2; ctx.fillRect(-14, -9, 28, 18); ctx.strokeRect(-14, -9, 28, 18);
          ctx.font = 'bold 14px Arial'; ctx.textAlign = 'center'; ctx.fillStyle = '#27743b'; ctx.fillText('$', 0, 5); ctx.restore();
        }
      }
      for (const p of e.pickups) { ctx.globalAlpha = p.life / .55; ctx.fillStyle = '#23833b'; ctx.font = 'bold 18px Arial'; ctx.textAlign = 'center'; ctx.fillText('+1', p.x, p.y - 20 - (1 - p.life / .55) * 28); } ctx.globalAlpha = 1;
      for (const m of e.missiles) {
        if (!m.entered) {
          const x=Math.max(20,Math.min(700,m.x)), y=Math.max(20,Math.min(700,m.y));
          ctx.save();ctx.translate(x,y);ctx.rotate(m.angle);ctx.fillStyle='#dc3828';ctx.beginPath();ctx.moveTo(12,0);ctx.lineTo(-8,-9);ctx.lineTo(-8,9);ctx.closePath();ctx.fill();ctx.restore();
        }
        m.trail.forEach((p, i) => { ctx.globalAlpha = i / m.trail.length * .35; ctx.fillStyle = '#939393'; ctx.beginPath(); ctx.arc(p.x, p.y, 5 + (1 - i / m.trail.length) * 9, 0, Math.PI * 2); ctx.fill(); }); ctx.globalAlpha = 1;
        if (missileImage?.complete && missileImage.naturalWidth) {
          // Source photo already points nose-first along +x, so no extra rotation offset is needed.
          const w = 150, h = w * missileImage.naturalHeight / missileImage.naturalWidth;
          ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(m.angle);
          ctx.drawImage(missileImage, -w / 2, -h / 2, w, h); ctx.restore(); continue;
        }
        ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(m.angle); ctx.scale(2.1, 2.1);
        ctx.fillStyle = '#ff9b24'; ctx.beginPath(); ctx.moveTo(-12, -4); ctx.lineTo(-34, 0); ctx.lineTo(-12, 4); ctx.fill();
        ctx.fillStyle = '#647182'; ctx.beginPath(); ctx.moveTo(-8, -4); ctx.lineTo(-15, -11); ctx.lineTo(-14, 11); ctx.lineTo(-8, 4); ctx.fill();
        ctx.fillStyle = '#e3e8ee'; ctx.strokeStyle = '#303947'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-13,-5); ctx.lineTo(6,-5); ctx.lineTo(15,0); ctx.lineTo(6,5); ctx.lineTo(-13,5); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ce3935'; ctx.beginPath(); ctx.moveTo(6,-5); ctx.lineTo(15,0); ctx.lineTo(6,5); ctx.closePath(); ctx.fill(); ctx.restore();
      }
    }
  };
  global.ArenaMissilePreset = {
    id: 'pack_money_missile_v1', name: '미사일 쏘기', type: 'moneyMissile', cooldown: 1,
    params: { required: 3, dropInterval: 2, damage: 55, speed: 800, turnRate: 9, lifetime: 8 }
  };
})(globalThis);
