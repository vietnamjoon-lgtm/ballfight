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
