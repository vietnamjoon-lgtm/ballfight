/* New abilities can contain their own cast, update and draw functions here.
   Save files contain only IDs and numbers, never executable code. */
(function (global) {
  const field = (label, min, max, step, value) => ({ label, min, max, step, default: value });
  // User-supplied nose photo (assets/nose.png), embedded as base64 in media.js for offline file:// use.
  const noseImage = typeof Image !== 'undefined' && global.ArenaMedia ? new Image() : null;
  if (noseImage) noseImage.src = global.ArenaMedia.nose;
  global.ArenaAbilities.nose = {
    label: '늘어나는 코',
    description: '발동 순간 상대 방향으로 코를 뻗었다가 회수합니다. 실제 코에 닿아야 적중하며 한 번 뻗을 때 한 번만 피해를 줍니다.',
    fields: {
      damage: field('피해', 1, 100, 1, 24), range: field('최대 길이', 80, 600, 10, 380),
      width: field('코 두께', 8, 60, 1, 24), extend: field('늘어나는 시간 (초)', .1, 1, .05, .25),
      hold: field('유지 시간 (초)', 0, 1, .05, .15), retract: field('돌아오는 시간 (초)', .1, 1, .05, .3)
    },
    cast(api, self, target, p) {
      api.effect('nose', self, { ...p, angle: Math.atan2(target.y - self.y, target.x - self.x), age: 0, length: 0, hit: false }, p.extend + p.hold + p.retract);
    },
    update(e, api, self, target, dt) {
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
      }
    },
    draw(ctx, e) {
      if (!e.length) return;
      ctx.translate(e.x, e.y); ctx.rotate(e.angle);
      if (noseImage?.complete && noseImage.naturalWidth) {
        // Source photo's wide end reaches toward the target (local +x); its tapered tip stays at the body (x=0).
        // Drawn a bit wider than the hit width so the photo's own taper never thins to nothing at the seam —
        // it's still one continuous stretched photo, just chunkier, instead of a separate patch shape glued on.
        const drawWidth = e.width * 1.6;
        ctx.save();
        ctx.translate(e.length, 0); ctx.rotate(Math.PI / 2);
        ctx.drawImage(noseImage, -drawWidth / 2, 0, drawWidth, e.length);
        ctx.restore();
      } else {
        // Fallback vector nose while the embedded photo is still decoding.
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#6c3434'; ctx.lineWidth = e.width + 4;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(e.length, 0); ctx.stroke();
        const skin = ctx.createLinearGradient(0, -e.width / 2, 0, e.width / 2);
        skin.addColorStop(0, '#f6c4b2'); skin.addColorStop(.4, '#df9589'); skin.addColorStop(1, '#aa5558');
        ctx.strokeStyle = skin; ctx.lineWidth = e.width;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(e.length, 0); ctx.stroke();
      }
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
