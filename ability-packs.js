/* New abilities can contain their own cast, update and draw functions here.
   Save files contain only IDs and numbers, never executable code. */
(function (global) {
  const field = (label, min, max, step, value) => ({ label, min, max, step, default: value });
  // User-supplied nose photo (assets/nose.png), embedded as base64 in media.js for offline file:// use.
  const noseImage = typeof Image !== 'undefined' && global.ArenaMedia ? new Image() : null;
  if (noseImage) noseImage.src = global.ArenaMedia.nose;
  // Ultimate "nose grinder": the nose stretches out, then whirls around its owner for SPIN_TIME seconds.
  const NOSE_CHARGE_GRAZE = .12, NOSE_CHARGE_CENTER = .17;
  const SPIN_GROW = .3, SPIN_TIME = 2, SPIN_SHRINK = .3, SPIN_TURN = 22, SPIN_HIT_GAP = .25;
  // Draws the nose along local +x from 0 to length: the photo when decoded, else a vector nose.
  function drawNoseShape(ctx, length, width) {
    if (noseImage?.complete && noseImage.naturalWidth) {
      // Source photo's wide end reaches toward the target (local +x); its tapered tip stays at the body (x=0).
      // Drawn a bit wider than the hit width so the photo's own taper never thins to nothing at the seam —
      // it's still one continuous stretched photo, just chunkier, instead of a separate patch shape glued on.
      const drawWidth = width * 1.6;
      ctx.save();
      ctx.translate(length, 0); ctx.rotate(Math.PI / 2);
      ctx.drawImage(noseImage, -drawWidth / 2, 0, drawWidth, length);
      ctx.restore();
    } else {
      // Fallback vector nose while the embedded photo is still decoding.
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#6c3434'; ctx.lineWidth = width + 4;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(length, 0); ctx.stroke();
      const skin = ctx.createLinearGradient(0, -width / 2, 0, width / 2);
      skin.addColorStop(0, '#f6c4b2'); skin.addColorStop(.4, '#df9589'); skin.addColorStop(1, '#aa5558');
      ctx.strokeStyle = skin; ctx.lineWidth = width;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(length, 0); ctx.stroke();
    }
  }
  global.ArenaAbilities.nose = {
    label: '늘어나는 코',
    description: '발동 순간 상대 방향으로 코를 뻗었다가 회수합니다. 실제 코에 닿아야 적중하며 한 번 뻗을 때 한 번만 피해를 줍니다. 궁극기: 코를 쭉 뻗은 채 2초 동안 분쇄기처럼 돌며 휘두릅니다.',
    fields: {
      damage: field('피해', 1, 100, 1, 24), range: field('최대 길이', 80, 600, 10, 380),
      width: field('코 두께', 8, 60, 1, 24), extend: field('늘어나는 시간 (초)', .1, 1, .05, .25),
      hold: field('유지 시간 (초)', 0, 1, .05, .15), retract: field('돌아오는 시간 (초)', .1, 1, .05, .3),
      ultDamage: field('궁극기 타격 피해', 1, 100, 1, 9), ultRange: field('궁극기 코 길이', 80, 400, 10, 190)
    },
    ultimate: {
      name: '코 분쇄기',
      duration: SPIN_GROW + SPIN_TIME + SPIN_SHRINK,
      cast(api, self, target, p) {
        api.effect('nose', self, { mode: 'spin', damage: p.ultDamage, range: p.ultRange, width: p.width,
          angle: Math.atan2(target.y - self.y, target.x - self.x), age: 0, length: 0, turn: 0, hitTimer: 0 }, SPIN_GROW + SPIN_TIME + SPIN_SHRINK);
        api.shake(.35);
      }
    },
    cast(api, self, target, p) {
      api.effect('nose', self, { ...p, angle: Math.atan2(target.y - self.y, target.x - self.x), age: 0, length: 0, hit: false }, p.extend + p.hold + p.retract);
    },
    update(e, api, self, target, dt) {
      if (e.mode === 'spin') return this.updateSpin(e, api, self, target, dt);
      e.age += dt;
      const ratio = e.age < e.extend ? 1 - Math.pow(1 - e.age / e.extend, 2) : e.age < e.extend + e.hold ? 1 : Math.max(0, 1 - (e.age - e.extend - e.hold) / e.retract);
      const dx = Math.cos(e.angle), dy = Math.sin(e.angle);
      e.x = self.x + dx * self.radius * .55; e.y = self.y + dy * self.radius * .55;
      // Stop at the inside edge of the wall, including the rounded tip.
      const inset = 6 + e.width / 2;
      const bx = Math.abs(dx) < 1e-8 ? Infinity : ((dx > 0 ? 720 - inset : inset) - e.x) / dx;
      const by = Math.abs(dy) < 1e-8 ? Infinity : ((dy > 0 ? 720 - inset : inset) - e.y) / dy;
      e.length = Math.max(0, Math.min(e.range * ratio, bx, by));
      const projection = Math.max(0, Math.min(e.length, (target.x - e.x) * dx + (target.y - e.y) * dy));
      const distance = Math.hypot(target.x - (e.x + dx * projection), target.y - (e.y + dy * projection));
      if (!e.hit && e.age <= e.extend + e.hold && e.length > 0 && distance <= target.radius + e.width / 2) {
        e.hit = true; api.damage(target, e.damage, self); api.pushAway(target, self); api.sound('noseHit');
        // Ultimate charge: a graze gives 12%, a dead-centre poke 17%, scaled by how far the target's centre sits off the nose's line.
        const offset = Math.abs((target.x - e.x) * dy - (target.y - e.y) * dx);
        const precision = Math.max(0, 1 - offset / (target.radius + e.width / 2));
        api.chargeUltimate?.(self, NOSE_CHARGE_GRAZE + (NOSE_CHARGE_CENTER - NOSE_CHARGE_GRAZE) * precision);
      }
    },
    updateSpin(e, api, self, target, dt) {
      e.age += dt; e.hitTimer -= dt;
      const spinEnd = SPIN_GROW + SPIN_TIME;
      const ratio = e.age < SPIN_GROW ? 1 - Math.pow(1 - e.age / SPIN_GROW, 2) : e.age < spinEnd ? 1 : Math.max(0, 1 - (e.age - spinEnd) / SPIN_SHRINK);
      // Spin up while the nose stretches, full speed for the spin, wind down as it shrinks.
      e.turn = SPIN_TURN * ratio; e.angle += e.turn * dt;
      self.spin = 6;
      const dx = Math.cos(e.angle), dy = Math.sin(e.angle);
      e.x = self.x + dx * self.radius * .55; e.y = self.y + dy * self.radius * .55;
      e.length = e.range * ratio;
      const projection = Math.max(0, Math.min(e.length, (target.x - e.x) * dx + (target.y - e.y) * dy));
      const distance = Math.hypot(target.x - (e.x + dx * projection), target.y - (e.y + dy * projection));
      if (e.hitTimer <= 0 && e.age <= spinEnd && ratio > .5 && distance <= target.radius + e.width / 2) {
        e.hitTimer = SPIN_HIT_GAP; api.damage(target, e.damage, self); api.pushAway(target, self); api.sound('noseHit'); api.shake(.2);
      }
    },
    draw(ctx, e, self) {
      if (!e.length) return;
      if (e.mode === 'spin') {
        const reach = self.radius * .55 + e.length, blur = Math.min(1, e.turn / SPIN_TURN);
        // Grinder blur: a faint swept disc plus a motion arc trailing the nose tip.
        ctx.save(); ctx.translate(self.x, self.y);
        ctx.globalAlpha = .1 * blur; ctx.fillStyle = self.color;
        ctx.beginPath(); ctx.arc(0, 0, reach, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = .45 * blur; ctx.strokeStyle = self.color; ctx.lineWidth = e.width * .7; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(0, 0, reach - e.width * .35, e.angle - 1.4 * blur, e.angle); ctx.stroke();
        ctx.restore();
        // Afterimages of the nose just behind its current angle.
        for (const k of [3, 2, 1]) {
          const back = e.angle - k * .22 * blur;
          ctx.save(); ctx.globalAlpha = .12 * (4 - k) * blur;
          ctx.translate(self.x + Math.cos(back) * self.radius * .55, self.y + Math.sin(back) * self.radius * .55); ctx.rotate(back);
          drawNoseShape(ctx, e.length, e.width); ctx.restore();
        }
      }
      ctx.translate(e.x, e.y); ctx.rotate(e.angle);
      drawNoseShape(ctx, e.length, e.width);
    }
  };
  global.ArenaNosePreset = {
    ability: { id: 'pack_nose_v1', name: '쭉 늘어나는 코', type: 'nose', cooldown: 2.8, params: { damage: 24, range: 380, width: 24, extend: .25, hold: .15, retract: .3 } },
    character: { id: 'pack_nose_demo_v1', name: '코 늘리기', color: '#b198d1', hp: 200, speed: 300, radius: 42, contactDamage: 5, image: '', abilities: ['pack_nose_v1'] }
  };
  // Singed's poison trail, but a fart cloud: every cooldown, the caster trails little puffs behind them for
  // trailTime seconds as they move. Each puff is dropped where the caster currently stands, then stays put
  // and fades out on its own over puffDuration. Only the opponent is hurt by it, never the owner. It's all
  // one effect instance per cast — puffs live inside it until they've each faded, so the container's own
  // duration is sized to trailTime + puffDuration and nothing gets cut off early.
  global.ArenaAbilities.fart = {
    label: '방구 흔적',
    description: '쿨타임마다 발동해 몇 초 동안 이동한 자리마다 방구 구름을 남깁니다. 구름 위에 있으면 상대가 조금씩 피해를 입습니다.',
    fields: {
      damage: field('초당 피해', 1, 30, 1, 5), radius: field('구름 반경', 10, 60, 1, 26),
      trailTime: field('흔적 남기는 시간 (초)', .5, 6, .5, 3), puffDuration: field('구름 지속 시간 (초)', 1, 10, .5, 4)
    },
    cast(api, self, target, p) {
      api.effect('fart', self, { ...p, age: 0, sincePuff: 0, puffs: [] }, p.trailTime + p.puffDuration);
    },
    update(e, api, self, target, dt) {
      e.age += dt;
      if (e.age <= e.trailTime) {
        e.sincePuff += dt;
        if (e.sincePuff >= .2) { e.sincePuff -= .2; e.puffs.push({ x: self.x, y: self.y, age: 0, tick: 0 }); }
      }
      for (const puff of e.puffs) {
        puff.age += dt; puff.tick += dt;
        if (puff.tick >= .4) {
          puff.tick -= .4;
          if (target.hp > 0 && Math.hypot(target.x - puff.x, target.y - puff.y) <= e.radius + target.radius) api.damage(target, e.damage * .4, self);
        }
      }
      e.puffs = e.puffs.filter(p => p.age < e.puffDuration);
    },
    draw(ctx, e) {
      ctx.fillStyle = '#b06bcf';
      for (const puff of e.puffs) {
        const fade = Math.max(0, Math.min(1, 1 - puff.age / e.puffDuration));
        if (fade <= 0) continue;
        ctx.globalAlpha = fade * .45;
        ctx.beginPath(); ctx.arc(puff.x, puff.y, e.radius, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  };
  global.ArenaFartPreset = { id: 'pack_fart_v1', name: '방구 흔적', type: 'fart', cooldown: 5, params: { damage: 5, radius: 26, trailTime: 3, puffDuration: 4 } };
})(globalThis);
/* PHONE PACK v1 */
(function (g) {
  'use strict';
  if (g.ArenaPhonePack) return;
  const A = g.ArenaAbilities;
  const field = (label, min, max, value) =>
    ({ label, min, max, step: 1, default: value });
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function spot(api, self, target, items = []) {
    for (let i = 0; i < 60; i++) {
      const p = {
        x: 42 + api.random() * 636,
        y: 42 + api.random() * 636
      };
      if (
        distance(p, self) > self.radius + 65 &&
        distance(p, target) > target.radius + 65 &&
        items.every(v => distance(p, v) > 110)
      ) return p;
    }
    return null;
  }

  function disk(c, x, y, r, color) {
    c.fillStyle = color;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
  }

  function wifi(c, x, y, color) {
    c.strokeStyle = color;
    c.lineWidth = 4;
    for (const r of [10, 19, 28]) {
      c.beginPath();
      c.arc(x, y, r, -2.35, -.79);
      c.stroke();
    }
    disk(c, x, y, 3, color);
  }

  A.phoneThrow = {
    label: '핸드폰 던지기',
    description: '이동 방향으로 던집니다. 유도 없이 직진하고 충돌하거나 사거리가 끝나면 깨집니다.',
    fields: {
      damage: field('피해', 1, 100, 20),
      speed: field('비행 속도', 100, 1200, 560),
      range: field('사거리', 80, 1000, 600)
    },
    cast(api, self, target, p) {
      const angle = Math.atan2(self.vy, self.vx);
      api.effect('phoneThrow', self, {
        ...p,
        x: self.x,
        y: self.y,
        vx: Math.cos(angle) * p.speed,
        vy: Math.sin(angle) * p.speed,
        angle,
        travel: 0,
        broken: false,
        fade: .65
      }, p.range / p.speed + .8);
    },
    update(e, api, self, target, dt) {
      if (e.broken) {
        e.fade -= dt;
        if (e.fade <= 0) e.remaining = 0;
        return;
      }
      const x = e.x, y = e.y;
      const step = Math.min(e.speed * dt, e.range - e.travel);
      const dx = e.vx / e.speed * step;
      const dy = e.vy / e.speed * step;

      let wall = 1;
      if (dx > 0) wall = Math.min(wall, (700 - x) / dx);
      if (dx < 0) wall = Math.min(wall, (20 - x) / dx);
      if (dy > 0) wall = Math.min(wall, (700 - y) / dy);
      if (dy < 0) wall = Math.min(wall, (20 - y) / dy);
      wall = Math.max(0, wall);

      const sx = dx * wall, sy = dy * wall;
      const length2 = sx * sx + sy * sy;
      const t = length2 ? Math.max(0, Math.min(1,
        ((target.x - x) * sx + (target.y - y) * sy) / length2
      )) : 0;
      const hit = Math.hypot(
        target.x - x - sx * t,
        target.y - y - sy * t
      ) <= target.radius + 14;

      e.x += sx * (hit ? t : 1);
      e.y += sy * (hit ? t : 1);
      e.travel += step * wall;
      e.angle += dt * 11;

      if (hit) {
        api.damage(target, e.damage, self);
        api.pushAway(target, self);
      }
      if (hit || wall < 1 || e.travel >= e.range - .001) {
        e.broken = true;
        e.remaining = .7;
      }
    },
    draw(c, e) {
      c.save();
      c.translate(e.x, e.y);
      c.rotate(e.angle);
      c.globalAlpha = e.broken ? Math.max(0, e.fade / .65) : 1;

      c.fillStyle = '#141820';
      c.fillRect(-12, -23, 24, 46);
      c.fillStyle = e.broken ? '#27313d' : '#eaf7ff';
      c.fillRect(-9, -19, 18, 37);
      c.fillStyle = '#141820';
      c.fillRect(-5, -20, 10, 4);

      if (e.broken) {
        c.strokeStyle = '#fff';
        c.lineWidth = 1.4;
        const spread = (1 - e.fade / .65) * 45;
        for (let i = 0; i < 8; i++) {
          const a = i * Math.PI / 4;
          c.beginPath();
          c.moveTo(0, 0);
          c.lineTo(Math.cos(a) * 10, Math.sin(a) * 21);
          c.stroke();
          c.fillStyle = i % 2 ? '#6fa1be' : '#222';
          c.fillRect(
            Math.cos(a) * (18 + spread),
            Math.sin(a) * (25 + spread),
            4, 7
          );
        }
      }
      c.restore();
    }
  };

  A.supplementPickup = {
    label: '영양제 주워 먹기',
    description: '주기적으로 영양제가 떨어집니다. 주인만 주워 회복하며 최대 체력을 넘지 않습니다.',
    uniquePerCharacter: true,
    fields: {
      heal: field('회복량', 1, 100, 15),
      maxItems: field('바닥 최대 개수', 1, 6, 3),
      lifetime: field('영양제 유지 시간', 3, 30, 15)
    },
    cast(api, self, target, p, skill) {
      const state = api.shared(
        'phone-vitamins-' + self.slot,
        () => ({ active: false })
      );
      if (state.active) return;
      state.active = true;
      api.effect('supplementPickup', self, {
        ...p,
        interval: skill.cooldown,
        timer: 0,
        items: []
      }, 121);
    },
    update(e, api, self, target, dt) {
      e.items.forEach(v => v.life -= dt);
      e.items = e.items.filter(v => {
        if (v.life <= 0) return false;
        if (distance(v, self) <= self.radius + 15) {
          api.heal(self, e.heal);
          return false;
        }
        return true;
      });

      e.timer -= dt;
      if (e.timer <= 0) {
        e.timer += e.interval;
        if (e.items.length < e.maxItems) {
          const p = spot(api, self, target, e.items);
          if (p) e.items.push({ ...p, life: e.lifetime });
        }
      }
    },
    draw(c, e) {
      for (const v of e.items) {
        c.save();
        c.translate(v.x, v.y);
        disk(c, 0, 0, 22, '#e1f7e7');
        c.fillStyle = '#f6bd45';
        c.fillRect(-11, -10, 22, 27);
        c.fillStyle = '#38764c';
        c.fillRect(-10, -17, 20, 8);
        c.fillStyle = '#fff';
        c.fillRect(-8, -3, 16, 14);
        c.fillStyle = '#328c52';
        c.font = 'bold 15px sans-serif';
        c.textAlign = 'center';
        c.fillText('+', 0, 9);
        c.restore();
      }
    }
  };

  A.hotspotRequest = {
    label: '하스팟 줘!',
    description: '상대가 제한 시간 안에 하스팟을 줍지 않으면 파장이 퍼집니다. 파장에 닿으면 한 번 피해를 입습니다.',
    uniquePerCharacter: true,
    fields: {
      damage: field('파장 피해', 1, 100, 30),
      wait: field('줍기 제한 시간', 1, 10, 4),
      range: field('파장 최대 범위', 100, 1000, 650)
    },
    cast(api, self, target, p) {
      const lock = api.shared(
        'phone-hotspot-' + self.slot,
        () => ({ until: 0 })
      );
      if (api.now() < lock.until) return;
      const pos = spot(api, self, target);
      if (!pos) return;
      lock.until = api.now() + p.wait + 1.3;
      api.effect('hotspotRequest', self, {
        ...p,
        ...pos,
        age: 0,
        phase: 'wait',
        radius: 0,
        hit: false
      }, p.wait + 1.3);
    },
    update(e, api, self, target, dt) {
      e.age += dt;
      if (e.phase === 'wait') {
        if (
          e.age <= e.wait &&
          distance(e, target) <= target.radius + 18
        ) {
          api.log(target.name + ' · 하스팟 수령! 공격 취소');
          e.remaining = 0;
          return;
        }
        if (e.age < e.wait) return;
        e.phase = 'wave';
        api.log(self.name + ' · 하스팟 안 먹었지!');
      }

      const previous = e.radius;
      e.radius = Math.min(
        e.range,
        Math.max(0, e.age - e.wait) / 1.2 * e.range
      );
      const d = distance(e, target);
      if (
        !e.hit &&
        d + target.radius >= previous &&
        d - target.radius <= e.radius
      ) {
        e.hit = true;
        api.damage(target, e.damage, self);
        api.pushAway(target, e);
      }
    },
    draw(c, e, self) {
      if (e.phase === 'wait') {
        disk(c, e.x, e.y, 26, '#e3f2ff');
        wifi(c, e.x, e.y + 10, '#2485d5');
        c.textAlign = 'center';
        c.fillStyle = '#205c96';
        c.font = 'bold 16px sans-serif';
        c.fillText(
          Math.max(0, Math.ceil(e.wait - e.age)) + '초',
          e.x, e.y + 46
        );

        if (e.age < 2) {
          const x = Math.max(80, Math.min(640, self.x));
          const y = Math.max(30, self.y - self.radius - 30);
          c.fillStyle = '#fff';
          c.strokeStyle = '#222';
          c.lineWidth = 2;
          c.fillRect(x - 74, y - 22, 148, 36);
          c.strokeRect(x - 74, y - 22, 148, 36);
          c.fillStyle = '#222';
          c.font = 'bold 20px sans-serif';
          c.fillText('하스팟 줘!', x, y + 3);
        }
      } else {
        c.strokeStyle = '#268bdf';
        c.lineWidth = 6;
        c.globalAlpha = Math.max(
          0, 1 - (e.age - e.wait) / 1.3
        );
        for (const offset of [0, 30, 60]) {
          const r = e.radius - offset;
          if (r <= 0) continue;
          c.beginPath();
          c.arc(e.x, e.y, r, 0, Math.PI * 2);
          c.stroke();
        }
        c.globalAlpha = 1;
      }
    }
  };

  const pack = g.ArenaPhonePack = {
    abilities: [
      {
        id: 'phone_throw_v1',
        name: '핸드폰 던지기',
        type: 'phoneThrow',
        cooldown: 3,
        params: { damage: 20, speed: 560, range: 600 }
      },
      {
        id: 'phone_vitamins_v1',
        name: '영양제 주워 먹기',
        type: 'supplementPickup',
        cooldown: 5,
        params: { heal: 15, maxItems: 3, lifetime: 15 }
      },
      {
        id: 'phone_hotspot_v1',
        name: '하스팟 줘!',
        type: 'hotspotRequest',
        cooldown: 10,
        params: { damage: 30, wait: 4, range: 650 }
      }
    ],
    character: {
      id: 'phone_user_v1',
      name: '하스팟 줘',
      color: '#8fbbea',
      hp: 200,
      speed: 300,
      radius: 42,
      contactDamage: 5,
      image: '',
      abilities: [
        'phone_throw_v1',
        'phone_vitamins_v1',
        'phone_hotspot_v1'
      ]
    }
  };

  if (typeof document === 'undefined') return;
  document.addEventListener('DOMContentLoaded', () => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '핸드폰 3스킬 JSON 다운로드';
    button.style.cssText =
      'display:block;margin:16px auto;padding:14px;' +
      'background:#1969ad;color:white;border:0;' +
      'border-radius:10px;font-size:16px';

    button.onclick = () => {
      try {
        const saved = localStorage.getItem('bounce.roster.v1');
        const data = JSON.parse(
          saved || JSON.stringify(g.ArenaDefaults)
        );

        function add(list, item) {
          if (item && !list.some(v => v.id === item.id)) {
            list.push(item);
          }
        }

        add(data.abilities, g.ArenaNosePreset?.ability);
        add(data.characters, g.ArenaNosePreset?.character);
        add(data.abilities, g.ArenaMissilePreset);
        add(data.abilities, g.ArenaFartPreset);
        pack.abilities.forEach(a => add(data.abilities, a));
        add(data.characters, pack.character);

        const clean = g.ArenaEngine.validate(data, A);
        const url = URL.createObjectURL(new Blob(
          [JSON.stringify(clean, null, 2)],
          { type: 'application/json' }
        ));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'phone-skills.json';
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } catch (error) {
        alert('JSON 생성 실패: ' + error.message);
      }
    };


  });
})(globalThis);
/* 독가스 편집 설정 v2 */
(function (g) {
  const STYLE = {
    colors: ['120,200,40', '90,170,30', '160,220,60'],
    interval: 2 / 60,
    growth: 1.01,
    maxGrowth: 2.2,
    maxParticles: 1024
  };

  const skill = g.ArenaAbilities.fart;
  Object.assign(skill.fields, {
    visualThickness: {
      label: '연기 두께 (%)',
      min: 20, max: 250, step: 1, default: 100
    },
    visualSpread: {
      label: '연기 퍼짐 (픽셀)',
      min: 0, max: 60, step: 1, default: 5
    },
    visualLifetime: {
      label: '연기가 남는 시간 (초)',
      min: .3, max: 8, step: .1, default: 1
    }
  });

  skill.fields.radius.label = '피해 판정 범위';
  skill.fields.puffDuration.label = '피해 판정 지속 시간 (초)';

  const cache = new WeakMap();
  const rng = s => {
    s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0;
    return s.seed / 4294967296;
  };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  g.ArenaDrawGas = function (ctx, battle) {
    let system = cache.get(battle);
    if (!system) {
      system = { states: new Map(), particles: [] };
      cache.set(battle, system);
    }

    const now = battle.time;
    system.particles = system.particles.filter(
      p => now - p.born < p.life
    );
    const active = new Set();

    for (const e of battle.effects) {
      if (e.type !== 'fart') continue;
      const f = battle.fighters[e.owner];
      if (!f || f.hp <= 0) continue;
      active.add(e);

      let s = system.states.get(e);
      if (!s) {
        s = {
          start: now - e.age,
          next: now - e.age,
          time: now,
          x: f.x,
          y: f.y,
          seed: (f.slot + 1) * 7919 + Math.floor(now * 1000)
        };
        system.states.set(e, s);
      }

      const life = clamp(e.visualLifetime ?? 1, .3, 8);
      const spread = clamp(e.visualSpread ?? 5, 0, 60);
      const thickness =
        clamp(e.visualThickness ?? 100, 20, 250) / 100;
      const end = Math.min(now, s.start + e.trailTime);

      s.next = Math.max(s.next, now - life);

      while (s.next <= end + 1e-8) {
        const born = s.next;
        s.next += STYLE.interval;
        if (system.particles.length >= STYLE.maxParticles) continue;

        const t = now > s.time
          ? clamp((born - s.time) / (now - s.time), 0, 1)
          : 1;
        const dx = f.x - s.x, dy = f.y - s.y;
        const angle = Math.hypot(dx, dy) > .01
          ? Math.atan2(dy, dx)
          : Math.atan2(f.vy, f.vx);
        const drift = rng(s) * Math.PI * 2;
        const speed = rng(s) * spread;

        system.particles.push({
          born,
          life,
          thickness,
          x: s.x + dx * t + (rng(s) - .5) * spread,
          y: s.y + dy * t + (rng(s) - .5) * spread,
          vx: Math.cos(drift) * speed,
          vy: Math.sin(drift) * speed,
          radius: f.radius * (.5 + rng(s) * .3),
          angle: angle + (rng(s) - .5) * .3,
          color: STYLE.colors[
            Math.floor(rng(s) * STYLE.colors.length)
          ],
          phase: rng(s) * Math.PI * 2
        });
      }

      s.time = now;
      s.x = f.x;
      s.y = f.y;
    }

    for (const e of system.states.keys()) {
      if (!active.has(e)) system.states.delete(e);
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(6, 6, 708, 708);
    ctx.clip();

    for (const p of system.particles) {
      const age = now - p.born;
      const remaining = Math.max(0, p.life - age);
      const r = p.radius * Math.min(
        STYLE.maxGrowth,
        Math.pow(STYLE.growth, age * 60)
      );

      ctx.save();
      ctx.translate(p.x + p.vx * age, p.y + p.vy * age);
      ctx.rotate(p.angle);
      ctx.scale(1, p.thickness);
      ctx.globalAlpha = Math.min(1, remaining * .3);

      for (let i = 0; i < 3; i++) {
        const a = p.phase + i * Math.PI * 2 / 3;
        const x = Math.cos(a) * r * .22;
        const y = Math.sin(a) * r * .22;
        const radius = r * (i === 0 ? .8 : .65);
        const fill = ctx.createRadialGradient(
          x, y, 0, x, y, radius
        );

        fill.addColorStop(0, 'rgba(' + p.color + ',.65)');
        fill.addColorStop(.45, 'rgba(' + p.color + ',.3)');
        fill.addColorStop(1, 'rgba(' + p.color + ',0)');

        ctx.fillStyle = fill;
        ctx.fillRect(
          x - radius, y - radius,
          radius * 2, radius * 2
        );
      }
      ctx.restore();
    }
    ctx.restore();
  };

  skill.draw = function () {};
})(globalThis);
/* SIX SEVEN v1 */
(function(g){
  'use strict';

  const SIX_SEVEN = {
    cooldown: 6,
    duration: 1.5,
    shakePeriod: .7,
    handScale: 2 / 3,
    pairs: 2,
    interval: .35,
    numberSize: 38,
    projectileSpeed: 560,
    projectileLife: 2.5,
    handPath: 'assets/six-seven-hand.jpg',
    fade: .25
  };

  const field=(label,min,max,step,value)=>
    ({label,min,max,step,default:value});
  const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));

  let hand=null;

  if(typeof Image!=='undefined'&&typeof document!=='undefined'){
    const image=new Image();
    image.onload=()=>{
      const canvas=document.createElement('canvas');
      canvas.width=256;
      canvas.height=Math.round(
        256*image.naturalHeight/image.naturalWidth
      );
      const c=canvas.getContext('2d');
      c.drawImage(image,0,0,canvas.width,canvas.height);

      try{
        const pixels=c.getImageData(
          0,0,canvas.width,canvas.height
        );
        for(let i=0;i<pixels.data.length;i+=4){
          const white=Math.min(
            pixels.data[i],
            pixels.data[i+1],
            pixels.data[i+2]
          );
          pixels.data[i+3]*=1-clamp((white-225)/30,0,1);
        }
        c.putImageData(pixels,0,0);
        hand=canvas;
      }catch{
        hand=image;
      }
    };
    image.src=SIX_SEVEN.handPath;
  }

  function fade(e){
    if(e.age>e.active)return 0;
    return Math.min(
      1,
      e.age/.12,
      Math.max(0,(e.active-e.age)/SIX_SEVEN.fade)
    );
  }

  function bob(e,self){
    return -self.radius*.07*
      (.5+.5*Math.cos(e.age/e.shakePeriod*Math.PI*4))*
      fade(e);
  }

  function handPoint(e,self,left){
    const phase=
      Math.cos(e.age/e.shakePeriod*Math.PI*2)*
      (left?1:-1);
    return {
      x:self.x+(left?-1:1)*self.radius*.78,
      y:self.y+self.radius*.85-
        phase*self.radius*.3+bob(e,self),
      phase
    };
  }

  g.Arena67BodyOffset=(self,battle)=>{
    let offset=0;
    for(const e of battle.effects){
      if(e.type==='sixSeven'&&e.owner===self.slot){
        offset=Math.min(offset,bob(e,self));
      }
    }
    return offset;
  };

  function fallbackHand(ctx,w,h){
    ctx.fillStyle='#ffd457';
    ctx.strokeStyle='#cb912b';
    ctx.lineWidth=2;
    ctx.beginPath();
    ctx.ellipse(0,-h*.28,w*.36,h*.27,0,0,Math.PI*2);
    ctx.fill();ctx.stroke();

    for(let i=0;i<4;i++){
      ctx.beginPath();
      ctx.ellipse(
        (i-1.5)*w*.17,-h*.05,
        w*.095,h*.2,0,0,Math.PI*2
      );
      ctx.fill();ctx.stroke();
    }

    ctx.beginPath();
    ctx.ellipse(
      -w*.38,-h*.32,w*.2,h*.1,-.3,0,Math.PI*2
    );
    ctx.fill();ctx.stroke();
  }

  function number(ctx,value,x,y,size,alpha=1,angle=0){
    ctx.save();
    ctx.translate(x,y);
    ctx.rotate(angle);
    ctx.globalAlpha=alpha;
    ctx.textAlign='center';
    ctx.textBaseline='middle';
    ctx.font='900 '+size+'px Arial, sans-serif';
    ctx.lineJoin='round';
    ctx.lineWidth=Math.max(2,size*.08);
    ctx.strokeStyle='#20252d';
    ctx.fillStyle=value===6?'#ffd84e':'#73d6ff';
    ctx.strokeText(String(value),0,0);
    ctx.fillText(String(value),0,0);
    ctx.restore();
  }

  g.ArenaAbilities.sixSeven={
    label:'6 7 던지기',
    description:'6→7을 번갈아 던집니다. 피해는 각각 6·7로 고정됩니다. 반복 횟수는 6→7 한 쌍 기준이며, 던지기가 길면 연출도 자동 연장됩니다.',
    uniquePerCharacter:true,

    fields:{
      pairs:field(
        '한 사이클의 6→7 반복 횟수',
        1,12,1,SIX_SEVEN.pairs
      ),
      interval:field(
        '숫자 던지는 간격 (초)',
        .06,2,.01,SIX_SEVEN.interval
      ),
      numberSize:field(
        '던지는 숫자 크기',
        16,100,1,SIX_SEVEN.numberSize
      ),
      projectileSpeed:field(
        '숫자 비행 속도',
        100,1200,10,SIX_SEVEN.projectileSpeed
      ),
      duration:field(
        '최소 연출 시간 (초)',
        .5,10,.1,SIX_SEVEN.duration
      ),
      shakePeriod:field(
        '손 왕복 시간 (초)',
        .2,2,.05,SIX_SEVEN.shakePeriod
      ),
      handScale:field(
        '손 크기 / 캐릭터 지름',
        .3,1.5,.05,SIX_SEVEN.handScale
      )
    },

    cast(api,self,target,p){
      const lock=api.shared(
        'six-seven-'+self.slot,
        ()=>({until:0})
      );
      if(api.now()<lock.until)return;

      const active=Math.max(
        p.duration,(p.pairs*2-1)*p.interval+.3
      );
      lock.until=api.now()+active;

      api.effect('sixSeven',self,{
        ...p,
        active,
        age:0,
        thrown:0,
        next:0,
        shots:[],
        sparks:[]
      },active+SIX_SEVEN.projectileLife+.25);
    },

    update(e,api,self,target,dt){
      e.age+=dt;

      while(
        self.hp>0&&
        e.thrown<e.pairs*2&&
        e.age+1e-8>=e.next
      ){
        const left=e.thrown%2===0;
        const value=left?6:7;
        const point=handPoint(e,self,left);
        const radius=e.numberSize*.32;

        const x=clamp(point.x,6+radius,714-radius);
        const y=clamp(
          point.y-e.numberSize*.6,6+radius,714-radius
        );
        const angle=Math.atan2(target.y-y,target.x-x);

        e.shots.push({
          x,y,
          vx:Math.cos(angle)*e.projectileSpeed,
          vy:Math.sin(angle)*e.projectileSpeed,
          value,
          radius,
          spin:left?-1:1,
          angle:0,
          life:SIX_SEVEN.projectileLife
        });
        api.sound(value===6?'sixThrow':'sevenThrow');

        e.thrown++;
        e.next+=e.interval;
      }

      for(const s of e.shots){
        const x=s.x,y=s.y;
        let dx=s.vx*dt,dy=s.vy*dt,wall=1;
        const lo=6+s.radius,hi=714-s.radius;

        if(dx>0)wall=Math.min(wall,(hi-x)/dx);
        if(dx<0)wall=Math.min(wall,(lo-x)/dx);
        if(dy>0)wall=Math.min(wall,(hi-y)/dy);
        if(dy<0)wall=Math.min(wall,(lo-y)/dy);

        wall=clamp(wall,0,1);
        dx*=wall;
        dy*=wall;

        const n=dx*dx+dy*dy;
        const t=n?clamp(
          ((target.x-x)*dx+(target.y-y)*dy)/n,0,1
        ):0;

        const hit=target.hp>0&&Math.hypot(
          target.x-x-dx*t,
          target.y-y-dy*t
        )<=target.radius+s.radius;

        s.x+=dx*(hit?t:1);
        s.y+=dy*(hit?t:1);
        s.angle+=s.spin*dt*1.5;
        s.life-=dt;

        if(hit){
          api.damage(target,s.value,self);
          e.sparks.push({
            x:s.x,y:s.y,value:s.value,life:.25
          });
        }
        if(hit||wall<1)s.life=0;
      }

      e.shots=e.shots.filter(s=>s.life>0);
      e.sparks.forEach(s=>s.life-=dt);
      e.sparks=e.sparks.filter(s=>s.life>0);
    },

    draw(ctx,e,self){
      const opacity=fade(e);

      if(opacity>0){
        const w=self.radius*2*e.handScale;
        const h=hand?w*hand.height/hand.width:w*.85;

        for(const left of [true,false]){
          const p=handPoint(e,self,left);
          ctx.save();
          ctx.translate(p.x,p.y);
          if(!left)ctx.scale(-1,1);
          ctx.globalAlpha=opacity;

          if(hand){
            ctx.drawImage(hand,-w/2,-h*.15,w,h);
          }else{
            fallbackHand(ctx,w,h);
          }
          ctx.restore();

          const raised=(p.phase+1)/2;
          number(
            ctx,left?6:7,
            p.x,p.y-h*.35,
            e.numberSize*(.6+raised*.5),
            opacity*(.2+raised*.8)
          );
        }
      }

      for(const s of e.shots){
        number(
          ctx,s.value,s.x,s.y,e.numberSize,
          Math.min(1,s.life/.2),s.angle
        );
      }

      for(const s of e.sparks){
        ctx.save();
        ctx.globalAlpha=s.life/.25;
        ctx.strokeStyle=s.value===6?'#ffcb32':'#4cbce9';
        ctx.lineWidth=3;

        const r=8+(1-s.life/.25)*28;
        for(let i=0;i<6;i++){
          const a=i*Math.PI/3;
          ctx.beginPath();
          ctx.moveTo(
            s.x+Math.cos(a)*r,
            s.y+Math.sin(a)*r
          );
          ctx.lineTo(
            s.x+Math.cos(a)*(r+8),
            s.y+Math.sin(a)*(r+8)
          );
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  };

  if(typeof document!=='undefined'){
    document.addEventListener('DOMContentLoaded',()=>{
      const type=document.getElementById('ability-type');
      type?.addEventListener('change',()=>{
        if(type.value==='sixSeven'){
          document.getElementById('ability-cooldown').value=
            SIX_SEVEN.cooldown;
        }
      });
    });
  }
})(globalThis);
/* ORB BALLS v1 */
/* Moved here from app.js: it was previously defined AFTER app.js's own setup IIFE had already run (same
   script-load order problem app.js's other presets avoid by living in files that load before app.js), so
   ArenaAbilities.orbBalls and ArenaOrbPreset didn't exist yet when the ability-type dropdown and default
   roster were built — the ability was registered too late to ever be selectable or equipped. */
(function(g){
  'use strict';

  const ORB = {
    cooldown: 1.5,          // 편집 화면 쿨타임 = 공 생성 간격
    ballPath: 'assets/orb-ball.png',
    grow: .25,              // 새 공이 커지는 시간
    shotLife: 3,            // 발사된 공 최대 비행 시간
    spin: 3                 // 궤도 회전 속도
  };

  const field=(label,min,max,step,value)=>
    ({label,min,max,step,default:value});
  const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));

  let ball=null;
  if(typeof Image!=='undefined'){
    ball=new Image();
    ball.src=ORB.ballPath;
  }

  function orbPos(e,self,i){
    const a=e.spin+i*Math.PI*2/e.count;
    const r=self.radius*e.orbit;
    return {x:self.x+Math.cos(a)*r,y:self.y+Math.sin(a)*r};
  }

  function drawBall(ctx,x,y,r,rot,stretch,auraStrength){
    if(r<=.5)return;
    stretch=stretch||1;
    auraStrength=auraStrength==null?100:auraStrength;
    ctx.save();
    ctx.translate(x,y);

    // Purple aura behind the ball; strength (0-300%) controls both how bright and how big it glows.
    if(auraStrength>0){
      const glowAlpha=Math.min(1,auraStrength/100*.8);
      const glowRadius=r*(1.4+auraStrength/100*1.1);
      const glow=ctx.createRadialGradient(0,0,r*.3,0,0,glowRadius);
      glow.addColorStop(0,'rgba(168,85,247,'+glowAlpha+')');
      glow.addColorStop(1,'rgba(168,85,247,0)');
      ctx.fillStyle=glow;
      ctx.beginPath();
      ctx.arc(0,0,glowRadius,0,Math.PI*2);
      ctx.fill();
    }

    ctx.rotate(rot);
    ctx.scale(stretch,1); // elongates along the rotated (flight) direction for a speed-streak look
    if(ball&&ball.complete&&ball.naturalWidth){
      ctx.drawImage(ball,-r,-r,r*2,r*2);
    }else{
      ctx.fillStyle='#fff';
      ctx.strokeStyle='#e0c52c';
      ctx.lineWidth=3/stretch;
      ctx.beginPath();
      ctx.arc(0,0,r,0,Math.PI*2);
      ctx.fill();ctx.stroke();
    }
    ctx.restore();
  }

  g.ArenaAbilities.orbBalls={
    label:'궤도 공',
    description:'쿨타임마다 공이 하나씩 생겨 캐릭터 주위를 돕니다. 개수가 다 차면 모든 공이 상대를 따라가 공격합니다.',
    uniquePerCharacter:true,

    fields:{
      count:field('모이면 발사할 공 개수',1,8,1,3),
      damage:field('공 1개당 피해',1,100,1,8),
      orbit:field('궤도 반경 / 캐릭터 반지름',1.2,4,.1,1.9),
      size:field('공 크기 / 캐릭터 반지름',.2,1.5,.05,.5),
      speed:field('발사 속도',100,1200,10,520),
      auraStrength:field('아우라 강도 (%)',0,300,5,160)
    },

    cast(api,self,target,p,skill){
      const lock=api.shared(
        'orb-balls-'+self.slot,
        ()=>({active:false})
      );
      if(lock.active)return;
      lock.active=true;

      api.effect('orbBalls',self,{
        ...p,
        interval:skill?.cooldown||ORB.cooldown,
        timer:0,
        spin:0,
        orbs:[{age:0}],
        shots:[]
      },121);
    },

    update(e,api,self,target,dt){
      e.spin+=ORB.spin*dt;
      e.orbs.forEach(o=>o.age+=dt);

      if(self.hp>0){
        e.timer+=dt;
        if(e.timer>=e.interval&&e.orbs.length<e.count){
          e.timer-=e.interval;
          e.orbs.push({age:0});
        }
        if(e.orbs.length<e.count)e.timer=Math.min(e.timer,e.interval);
        else e.timer=0;

        const last=e.orbs[e.orbs.length-1];
        if(e.orbs.length>=e.count&&last.age>=ORB.grow){
          for(let i=0;i<e.orbs.length;i++){
            const p=orbPos(e,self,i);
            e.shots.push({x:p.x,y:p.y,life:ORB.shotLife,trail:[],angle:0});
          }
          e.orbs=[];
          e.timer=0;
        }
      }

      const r=self.radius*e.size;
      for(const s of e.shots){
        s.life-=dt;
        if(target.hp<=0){s.life=0;continue;}
        const dx=target.x-s.x,dy=target.y-s.y;
        const l=Math.hypot(dx,dy)||1;
        s.angle=Math.atan2(dy,dx); // faces (and stretches toward) wherever it's currently homing
        if(l<=target.radius+r*.6){
          api.damage(target,e.damage,self);
          api.sound('orbHit');
          s.life=0;
          continue;
        }
        s.trail.push([s.x,s.y]);
        if(s.trail.length>8)s.trail.shift();
        const step=Math.min(l,e.speed*dt);
        s.x=clamp(s.x+dx/l*step,6+r,714-r);
        s.y=clamp(s.y+dy/l*step,6+r,714-r);
      }
      e.shots=e.shots.filter(s=>s.life>0);
    },

    draw(ctx,e,self){
      const r=self.radius*e.size;

      for(const s of e.shots){
        s.trail.forEach((p,i)=>{
          ctx.globalAlpha=i/20;
          ctx.fillStyle='#e6dc3c';
          ctx.beginPath();
          ctx.arc(p[0],p[1],r*.7*i/8,0,Math.PI*2);
          ctx.fill();
        });
        ctx.globalAlpha=1;
        drawBall(ctx,s.x,s.y,r,s.angle,1.4,e.auraStrength);
      }

      if(self.hp<=0)return;
      e.orbs.forEach((o,i)=>{
        const p=orbPos(e,self,i);
        drawBall(ctx,p.x,p.y,r*Math.min(1,o.age/ORB.grow),e.spin*1.3,1,e.auraStrength);
      });
    }
  };

  g.ArenaOrbPreset={
    id:'pack_orb_balls_v1',
    name:'궤도 공',
    type:'orbBalls',
    cooldown:ORB.cooldown,
    params:{count:3,damage:8,orbit:1.9,size:.5,speed:520,auraStrength:160}
  };

  if(typeof document!=='undefined'){
    document.addEventListener('DOMContentLoaded',()=>{
      const type=document.getElementById('ability-type');
      type?.addEventListener('change',()=>{
        if(type.value==='orbBalls'){
          document.getElementById('ability-cooldown').value=
            ORB.cooldown;
        }
      });
    });
  }
})(globalThis);
/* BERSERK v3 */
/* Three modes in a loop. 'survive': takes reduced damage and heals by eating bread that drops on the floor
   (Minecraft-style bites). Once the timer runs out, 'cine': all bread is cleared, the fighter roots, glides
   to the arena center while the arena shakes a little and a magic circle spins under it, and its body wraps
   in bandages. 'berserk': for the rest of a fixed total window (which includes the cine time), it hammers
   the opponent — charge in, slam for big damage with a fragment burst and a hard screen shake, retreat,
   charge again. When the window runs out it reverts fully back to 'survive' and the cycle repeats. */
(function(g){
  'use strict';
  const field=(label,min,max,step,value)=>({label,min,max,step,default:value});
  const CENTER=360, MOVE_DUR=1.6, CINE_DUR=4.5;
  /* Portrait transform timing (seconds of awakenAge): the body shakes harder and harder until SHAKE_PEAK, then
     the awakened photo blurs in between BLEND_FROM and BLEND_TO while the shaking holds, and the shaking dies
     down by the end of the cine. At the end of the berserk window the photo blurs back over REVERT_DUR. */
  const SHAKE_PEAK=1.3, BLEND_FROM=1.1, BLEND_TO=3.3, REVERT_DUR=.6, JITTER_MAX=9, BLUR_MAX=9;
  const smooth=u=>{u=Math.min(1,Math.max(0,u)); return u*u*(3-2*u);};
  const portraitFx=(mode,age,duration)=>{
    let mix=0, jitter=0;
    if(mode==='cine'){
      mix=smooth((age-BLEND_FROM)/(BLEND_TO-BLEND_FROM));
      jitter=age<SHAKE_PEAK?Math.pow(age/SHAKE_PEAK,2):age<BLEND_TO?1:Math.max(0,1-(age-BLEND_TO)/(CINE_DUR-BLEND_TO));
    }else if(mode==='berserk'){
      mix=smooth((duration-age)/REVERT_DUR);
      jitter=(1-mix)*.5;
    }
    jitter*=JITTER_MAX;
    return {
      mix, jitter,
      blur:(mix>0&&mix<1?Math.sin(mix*Math.PI)*BLUR_MAX:0)+jitter*.25,
      dx:(Math.sin(age*97)+Math.sin(age*61.3)*.6)/1.6*jitter,
      dy:(Math.cos(age*89)+Math.sin(age*53.7)*.6)/1.6*jitter
    };
  };
  const breadBank=(api,self)=>api.shared('berserk-bread-'+self.slot,()=>({pieces:[],nextDrop:null,processedAt:-1,renderer:null}));
  const breadImage=typeof Image!=='undefined'&&g.ArenaMedia?new Image():null;
  if(breadImage) breadImage.src=g.ArenaMedia.bread;
  const drawBreadShape=ctx=>{
    ctx.lineWidth=2.5; ctx.strokeStyle='#1a1a1a'; ctx.fillStyle='#e08a2e';
    ctx.beginPath();
    ctx.moveTo(-17,4);
    ctx.quadraticCurveTo(-18,-8,-7,-10);
    ctx.quadraticCurveTo(4,-13,13,-8);
    ctx.quadraticCurveTo(20,-4,17,3);
    ctx.quadraticCurveTo(13,10,3,10);
    ctx.quadraticCurveTo(-9,11,-17,4);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-9,-5); ctx.quadraticCurveTo(-7,1,-10,6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(1,-8); ctx.quadraticCurveTo(3,-1,0,6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(10,-8); ctx.quadraticCurveTo(12,-2,9,4); ctx.stroke();
  };
  const drawBread=(ctx,x,y,scale,rotation=-.25,size=34)=>{
    ctx.save(); ctx.translate(x,y); ctx.rotate(rotation); ctx.scale(scale*size/34,scale*size/34);
    if(breadImage&&breadImage.complete&&breadImage.naturalWidth){
      const s=34; ctx.drawImage(breadImage,-s/2,-s/2,s,s);
    }else{
      drawBreadShape(ctx);
    }
    ctx.restore();
  };
  const drawMagicCircle=(ctx,self,t)=>{
    const r=self.radius+22;
    ctx.save();
    ctx.translate(self.x,self.y);
    ctx.globalAlpha=Math.min(1,t*3)*Math.max(0,1-Math.max(0,t-.8)/.2);
    ctx.strokeStyle='#8b5cf6'; ctx.lineWidth=2.5;
    ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.arc(0,0,r-9,0,Math.PI*2); ctx.stroke();
    ctx.rotate(t*6);
    for(let i=0;i<12;i++){
      const a=i/12*Math.PI*2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a)*(r-9),Math.sin(a)*(r-9));
      ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r);
      ctx.stroke();
    }
    ctx.restore();
  };
  const spawnParticles=(api,e,x,y)=>{
    for(let i=0;i<9;i++){
      const a=api.random()*Math.PI*2, s=80+api.random()*160;
      e.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.4+api.random()*.2,maxLife:.6,rot:api.random()*Math.PI*2,spin:(api.random()-.5)*10,color:api.random()<.5?'#b45309':'#78350f'});
    }
  };
  const drawParticles=(ctx,particles)=>{
    for(const p of particles){
      ctx.save();
      ctx.translate(p.x,p.y); ctx.rotate(p.rot);
      ctx.globalAlpha=Math.max(0,Math.min(1,p.life/p.maxLife));
      ctx.fillStyle=p.color;
      ctx.beginPath();
      ctx.moveTo(-4,-2); ctx.lineTo(4,-1); ctx.lineTo(2,4); ctx.lineTo(-3,3);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha=1;
  };

  g.ArenaAbilities.berserk={
    label:'각성 폭주',
    trigger:'pickup',
    description:'각성 전까지는 접촉 피해를 줄여주고, 바닥에 떨어지는 빵을 먹어 체력을 회복하며 버팁니다. 설정한 시간이 지나면 체력과 무관하게 각성합니다: 전장 중앙으로 이동하며 화면이 흔들리고 마법진이 돌면서, 캐릭터의 각성 사진(설정했다면)으로 모습이 바뀝니다. 이후 정해진 시간 동안 상대에게 계속 돌진해 큰 피해로 박치기하고 물러났다가 다시 돌진하기를 반복하며, 돌진할 때마다 화면이 크게 흔들리고 파편이 튑니다. 시간이 다 되면 다시 평화로운 상태(원래 사진)로 돌아가고, 이 과정이 반복됩니다.',
    fields:{
      transformTime:field('각성까지 걸리는 시간 (초)',5,120,1,30),
      damageReduction:field('각성 전 피해 감소 (%)',0,90,5,40),
      breadHeal:field('빵 회복량',1,100,1,15),
      breadCount:field('빵 최대 개수',1,6,1,3),
      breadInterval:field('빵이 떨어지는 간격 (초)',.5,10,.5,2),
      breadSize:field('빵 크기',10,70,1,34),
      awakenDuration:field('각성 지속 시간 (초, 변신 포함)',6,30,1,12),
      berserkDamage:field('돌진 피해',10,150,5,80),
      chargeSpeed:field('돌진 속도',200,1400,10,850),
      retreatSpeed:field('후퇴 속도',100,800,10,300),
      cycleTime:field('돌진+후퇴 주기 (초)',.2,2,.1,.5)
    },
    status(self,skill){
      const s=self.skillState[skill.id];
      if(!s) return null;
      if(s.mode==='cine') return {label:'변신 중',progress:1};
      if(s.mode==='berserk') return {label:'각성!',progress:1};
      return {label:`각성까지 ${Math.max(0,Math.ceil(skill.params.transformTime-s.elapsed))}초`,progress:Math.min(1,s.elapsed/skill.params.transformTime)};
    },
    photo(self,skill){
      const s=self.skillState[skill.id];
      return s&&s.mode!=='survive'?'secondary':'primary';
    },
    photoFx(self,skill){
      const s=self.skillState[skill.id];
      return portraitFx(s?.mode,s?.awakenAge||0,skill.params.awakenDuration);
    },
    cast(api,self,target,p,skill){
      self.skillState[skill.id]={elapsed:0,mode:'survive'};
      api.effect('berserk',self,{...p,skillId:skill.id,mode:'survive',elapsed:0,awakenAge:0,eating:null,particles:[],phase:'charge',phaseTimer:0},1e9);
    },
    update(e,api,self,target,dt){
      if(e.mode==='survive'){
        if(self.hp<=0||target.hp<=0) return;
        self.damageReduction=e.damageReduction/100;
        e.elapsed+=dt;

        const now=api.now(), bank=breadBank(api,self); e.bank=bank;
        if(bank.renderer===null) bank.renderer=self.slot;
        if(bank.processedAt!==now){
          bank.processedAt=now;
          bank.pieces=bank.pieces.filter(p=>p.expires>now);
          if(bank.nextDrop===null) bank.nextDrop=now-dt+e.breadInterval;
          if(now+1e-8>=bank.nextDrop){
            bank.nextDrop+=e.breadInterval;
            if(bank.pieces.length<e.breadCount){
              const clear=p=>bank.pieces.every(c=>Math.hypot(c.x-p.x,c.y-p.y)>=90)
                &&[self,target].every(f=>Math.hypot(f.x-p.x,f.y-p.y)>=f.radius+70);
              let point=null;
              for(let i=0;i<48;i++){
                const candidate={x:55+api.random()*610,y:55+api.random()*610};
                if(clear(candidate)){point=candidate;break;}
              }
              if(!point) for(let i=0;i<49;i++){
                const candidate={x:55+(i%7)*100,y:55+Math.floor(i/7)*100};
                if(clear(candidate)){point=candidate;break;}
              }
              if(point) bank.pieces.push({...point,ready:now+.35,expires:now+24});
            }
          }
        }
        if(!e.eating){
          const hit=bank.pieces.find(p=>now>=p.ready&&Math.hypot(self.x-p.x,self.y-p.y)<=self.radius+16);
          if(hit){
            bank.pieces=bank.pieces.filter(p=>p!==hit);
            api.heal(self,e.breadHeal); api.sound('breadEat');
            e.eating={bites:0,timer:.5};
          }
        }else{
          e.eating.timer-=dt;
          if(e.eating.timer<=0){
            e.eating.bites++;
            if(e.eating.bites>=3) e.eating=null; else e.eating.timer=.5;
          }
        }

        if(e.elapsed>=e.transformTime){
          e.mode='cine'; e.awakenAge=0;
          self.rooted=true; self.damageReduction=0;
          e.startX=self.x; e.startY=self.y;
          bank.pieces=[]; e.eating=null;
          api.sound('awaken');
        }
        self.skillState[e.skillId]={elapsed:e.elapsed,mode:e.mode,awakenAge:e.awakenAge};
        return;
      }

      e.awakenAge+=dt;
      if(e.mode==='cine'){
        api.shake(.06+.14*portraitFx('cine',e.awakenAge,e.awakenDuration).jitter/JITTER_MAX);
        const t=Math.min(1,e.awakenAge/MOVE_DUR);
        const ease=1-Math.pow(1-t,2);
        self.x=e.startX+(CENTER-e.startX)*ease;
        self.y=e.startY+(CENTER-e.startY)*ease;
        if(e.awakenAge>=CINE_DUR){
          e.mode='berserk'; self.rooted=false;
          e.phase='charge'; e.phaseTimer=e.cycleTime/2; e.chargeHit=false;
          e.lastSetVx=undefined; e.lastSetVy=undefined;
        }
      }else{
        if(self.hp>0&&target.hp>0){
          if(e.lastSetVx!==undefined){
            if(e.lastSetVx&&Math.sign(self.vx)!==Math.sign(e.lastSetVx)) spawnParticles(api,e,self.x,self.y);
            if(e.lastSetVy&&Math.sign(self.vy)!==Math.sign(e.lastSetVy)) spawnParticles(api,e,self.x,self.y);
          }
          e.phaseTimer-=dt;
          if(e.phaseTimer<=0){
            e.phase=e.phase==='charge'?'retreat':'charge';
            e.phaseTimer=e.cycleTime/2;
            if(e.phase==='charge') e.chargeHit=false;
          }
          const angle=Math.atan2(target.y-self.y,target.x-self.x);
          const speed=e.phase==='charge'?e.chargeSpeed:e.retreatSpeed;
          const dir=e.phase==='charge'?1:-1;
          self.vx=Math.cos(angle)*speed*dir; self.vy=Math.sin(angle)*speed*dir;
          e.lastSetVx=self.vx; e.lastSetVy=self.vy;
          if(e.phase==='charge'&&!e.chargeHit){
            const dist=Math.hypot(target.x-self.x,target.y-self.y);
            if(dist<self.radius+target.radius+2){
              api.explosion(target,e.berserkDamage,self);
              api.sound('berserkSlam');
              spawnParticles(api,e,target.x,target.y);
              e.chargeHit=true;
            }
          }
        }
        if(e.awakenAge>=e.awakenDuration){
          e.mode='survive'; e.elapsed=0; e.awakenAge=0;
          self.damageReduction=e.damageReduction/100;
        }
      }
      for(const p of e.particles){ p.x+=p.vx*dt; p.y+=p.vy*dt; p.life-=dt; p.rot+=p.spin*dt; }
      e.particles=e.particles.filter(p=>p.life>0);
      self.skillState[e.skillId]={elapsed:e.elapsed,mode:e.mode,awakenAge:e.awakenAge};
    },
    draw(ctx,e,self){
      if(e.mode==='survive'){
        if(e.bank&&e.bank.renderer===self.slot){
          for(const p of e.bank.pieces) drawBread(ctx,p.x,p.y,1,-.25,e.breadSize);
        }
        if(e.eating){
          const scale=1-e.eating.bites*.3;
          const t=.5-e.eating.timer;
          const wobble=Math.sin(t*50)*.5-.25;
          const jx=Math.sin(t*70)*3, jy=Math.cos(t*65)*3;
          ctx.globalAlpha=Math.max(.15,scale);
          drawBread(ctx,self.x+jx,self.y-self.radius-22+jy,Math.max(.3,scale),wobble,e.breadSize);
          ctx.globalAlpha=1;
        }
        return;
      }
      if(e.mode==='cine'){
        const t=Math.min(1,e.awakenAge/CINE_DUR);
        drawMagicCircle(ctx,self,t);
      }
      if(e.particles?.length) drawParticles(ctx,e.particles);
    }
  };

  g.ArenaBerserkPreset={
    id:'pack_berserk_v1',
    name:'각성 폭주',
    type:'berserk',
    cooldown:1,
    params:{transformTime:30,damageReduction:40,breadHeal:15,breadCount:3,breadInterval:2,breadSize:34,awakenDuration:12,berserkDamage:80,chargeSpeed:850,retreatSpeed:300,cycleTime:.5}
  };
})(globalThis);
/* SPIKE GUARD v1 */
/* Curls up in place for a short time: damage taken drops sharply, and a ring of spikes forms right around
   the character's own body (not a separate creature). Anyone touching the spikes while it's up gets stabbed
   for extra reflected damage on top of normal contact damage. */
(function(g){
  'use strict';
  const field=(label,min,max,step,value)=>({label,min,max,step,default:value});

  g.ArenaAbilities.spikeGuard={
    label:'가시 갑옷',
    description:'잠깐 동안 몸을 웅크려 주위를 가시로 완전히 둘러쌉니다. 그동안 받는 피해가 크게 줄고, 몸에 닿은 상대는 가시에 찔려 반사 피해를 추가로 입습니다.',
    fields:{
      duration:field('지속 시간 (초)',.5,10,.5,4),
      damageReduction:field('피해 감소 (%)',0,90,5,50),
      thornDamage:field('가시 반사 피해',1,60,1,15)
    },
    cast(api,self,target,p){
      self.damageReduction=p.damageReduction/100;
      self.contactDamage+=p.thornDamage;
      api.effect('spikeGuard',self,{...p,age:0,reverted:false},p.duration+.15);
    },
    update(e,api,self,target,dt){
      e.age+=dt;
      if(!e.reverted&&(e.age>e.duration||self.hp<=0)){
        self.damageReduction=0;
        self.contactDamage-=e.thornDamage;
        e.reverted=true;
      }
    },
    draw(ctx,e,self){
      if(e.age>e.duration) return;
      const n=10, inner=self.radius-2, outer=self.radius+14;
      ctx.save();
      ctx.translate(self.x,self.y);
      ctx.strokeStyle='#2c1c10'; ctx.lineWidth=3;
      ctx.beginPath(); ctx.arc(0,0,inner+3,0,Math.PI*2); ctx.stroke();
      ctx.fillStyle='#5b3a22';
      for(let i=0;i<n;i++){
        ctx.save();
        ctx.rotate(i/n*Math.PI*2);
        ctx.beginPath();
        ctx.moveTo(inner,-6);
        ctx.lineTo(outer,0);
        ctx.lineTo(inner,6);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }
  };

  g.ArenaSpikeGuardPreset={
    id:'pack_spike_guard_v1',
    name:'가시 갑옷',
    type:'spikeGuard',
    cooldown:8,
    params:{duration:4,damageReduction:50,thornDamage:15}
  };
})(globalThis);
