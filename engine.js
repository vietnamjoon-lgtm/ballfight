(function (global) {
  'use strict';
  const SIZE = 720, PAD = 6, IDLE_SPIN = 1.4;
  const copy = value => JSON.parse(JSON.stringify(value));
  const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  function validate(input, types) {
    if (!input || input.version !== 1 || !Array.isArray(input.characters) || !Array.isArray(input.abilities)) throw Error('버전 1의 캐릭터 설정 파일이 필요합니다.');
    if (input.characters.length < 1 || input.characters.length > 100 || input.abilities.length > 200) throw Error('캐릭터는 1~100개, 능력은 최대 200개까지 가능합니다.');
    const text = (value, label, max = 40) => { if (typeof value !== 'string' || !value.trim() || value.length > max) throw Error(label + '을 확인하세요.'); return value.trim(); };
    const number = (value, min, max, label) => { if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw Error(`${label}: ${min}~${max} 사이의 숫자가 필요합니다.`); return value; };
    const ids = new Set();
    const unique = id => { text(id, 'ID', 80); if (!/^[a-zA-Z0-9_-]+$/.test(id) || ids.has(id)) throw Error('ID는 중복되지 않는 영문·숫자·밑줄·하이픈이어야 합니다.'); ids.add(id); return id; };
    const abilities = input.abilities.map(a => {
      if (!a || typeof a !== 'object' || !own(types, a.type)) throw Error('지원하지 않는 능력 종류입니다.');
      const type = types[a.type], params = {};
      for (const [key, field] of Object.entries(type.fields)) {
        const value = a.params?.[key] ?? field.default;
        params[key] = number(value, field.min, field.max, field.label);
        if (field.step === 1 && !Number.isInteger(value)) throw Error(field.label + '은 정수여야 합니다.');
      }
      return { id: unique(a.id), name: text(a.name, '능력 이름'), type: a.type, cooldown: number(a.cooldown, .3, 60, '쿨타임'), params };
    });
    const abilityIds = new Set(abilities.map(a => a.id)); ids.clear();
    const characters = input.characters.map(c => {
      if (!c || typeof c !== 'object') throw Error('캐릭터 형식을 확인하세요.');
      if (!/^#[0-9a-fA-F]{6}$/.test(c.color)) throw Error('캐릭터 색상을 확인하세요.');
      if (!Array.isArray(c.abilities) || c.abilities.length > 3 || new Set(c.abilities).size !== c.abilities.length || c.abilities.some(id => !abilityIds.has(id))) throw Error('캐릭터에는 존재하는 능력을 중복 없이 최대 3개 장착할 수 있습니다.');
      const equippedTypes = c.abilities.map(id => abilities.find(a => a.id === id).type);
      if (equippedTypes.some((type, i) => types[type].uniquePerCharacter && equippedTypes.indexOf(type) !== i)) throw Error('이 자원 수집 능력은 캐릭터당 하나만 장착할 수 있습니다.');
      const image = c.image || '';
      if (typeof image !== 'string' || image.length > 1500000 || (image && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image))) throw Error('캐릭터 이미지는 작은 PNG·JPG·WebP 이미지여야 합니다.');
      return { id: unique(c.id), name: text(c.name, '캐릭터 이름'), color: c.color, hp: number(c.hp, 10, 1000, '체력'), speed: number(c.speed, 50, 450, '이동 속도'), radius: number(c.radius, 12, 45, '크기'), contactDamage: number(c.contactDamage, 0, 100, '접촉 피해'), image, abilities: [...c.abilities] };
    });
    return { version: 1, abilities, characters };
  }
  class Battle {
    constructor(config, selected, types = global.ArenaAbilities, random = Math.random) {
      this.types = types; this.config = validate(config, types); this.random = random;
      this.sharedState = new Map(); this.audioEvents = []; this.wallHits = []; this.time = 0; this.state = 'ready'; this.winner = null; this.contactTimer = 0;
      this.effects = []; this.impacts = []; this.impactId = 0; this.shots = []; this.particles = []; this.rings = []; this.orbits = []; this.events = []; this.eventId = 0;
      this.fighters = selected.map((id, slot) => {
        const c = this.config.characters.find(c => c.id === id); if (!c) throw Error('캐릭터를 선택하세요.');
        const angle = random() * Math.PI * 2;
        return { ...copy(c), slot, maxHp: c.hp, x: slot ? 525 : 195, y: slot ? 450 : 270, vx: Math.cos(angle) * c.speed, vy: Math.sin(angle) * c.speed,
          skills: c.abilities.map(id => { const a = this.config.abilities.find(a => a.id === id); return { ...copy(a), remaining: a.cooldown }; }),
          skillState: {}, dash: null, shield: 0, shieldTime: 0, flash: 0, trail: [], spin: 0, facing: 0 };
      });
      if (this.fighters.length !== 2) throw Error('두 명을 선택하세요.');
      this.api = Object.freeze({
        now: () => this.time,
        random: () => this.random(),
        shared: (key, create) => { if (!this.sharedState.has(key)) this.sharedState.set(key, create()); return this.sharedState.get(key); },
        sound: type => { if (this.audioEvents.length < 16) this.audioEvents.push({ type }); },
        log: text => this.log(text),
        explosion: (target, amount, source) => this.damage(target, amount, source, 'explosion'),
        effect: (type, self, state, duration) => {
          if (!own(this.types, type) || typeof this.types[type].update !== 'function' || !Number.isFinite(duration) || duration <= 0) throw Error('지속 능력 등록을 확인하세요.');
          this.effects.push({ ...copy(state), type, owner: self.slot, remaining: duration });
        },
        damage: (target, amount, source) => this.damage(target, amount, source),
        projectile: (self, angle, p) => this.projectile(self, angle, p),
        dash: (self, target, p) => { const a = Math.atan2(target.y - self.y, target.x - self.x); self.dash = { remaining: p.duration, damage: p.damage, speed: p.speed, hit: false }; self.vx = Math.cos(a) * p.speed; self.vy = Math.sin(a) * p.speed; },
        heal: (self, amount) => { self.hp = Math.min(self.maxHp, self.hp + amount); this.ring(self, 75, '#91edb3'); },
        shield: (self, p) => { self.shield = p.amount; self.shieldTime = p.duration; },
        ring: (self, range, color) => this.ring(self, range, color),
        pushAway: (target, source) => { const a = Math.atan2(target.y - source.y, target.x - source.x); const speed = target.dash?.speed || target.speed; target.vx = Math.cos(a) * speed; target.vy = Math.sin(a) * speed; },
        orbit: (self, p) => { this.orbits = this.orbits.filter(o => o.owner !== self.slot); for (let i = 0; i < p.count; i++) this.orbits.push({ ...p, owner: self.slot, angle: i / p.count * Math.PI * 2, remaining: p.duration, hitTimer: 0 }); }
      });
    }
    log(text) { this.events.unshift({ id: ++this.eventId, time: this.time, text }); this.events.length = Math.min(this.events.length, 5); }
    start() {
      if (this.state === 'ready') {
        for (const f of this.fighters) for (const skill of f.skills) if (this.types[skill.type].trigger === 'pickup') this.types[skill.type].cast(this.api, f, this.fighters[1-f.slot], skill.params, skill);
        this.state = 'running';
      } else if (this.state === 'paused') this.state = 'running';
    }
    pause() { if (this.state === 'running') this.state = 'paused'; }
    ring(f, range, color = f.color) { this.rings.push({ x: f.x, y: f.y, from: f.radius, range, color, life: .45 }); }
    burst(f) { for (let i = 0; i < 9; i++) { const angle = this.random() * Math.PI * 2, speed = 70 + this.random() * 100; this.particles.push({ x: f.x, y: f.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: .4, color: f.color }); } }
    damage(target, amount, source, kind = 'hit') {
      if (!Number.isFinite(amount) || amount <= 0 || target.hp <= 0) return;
      const absorbed = Math.min(target.shield, amount), actual = Math.min(target.hp, amount - absorbed);
      target.shield -= absorbed; target.hp = Math.max(0, target.hp - actual); target.flash = .22; this.burst(target);
      this.impacts.push({ id: ++this.impactId, x: target.x, y: target.y, amount: actual, absorbed, kind, power: Math.min(1, amount / 25) });
      if (this.impacts.length > 20) this.impacts.shift();
    }
    projectile(self, angle, p) { this.shots.push({ owner: self.slot, color: self.color, x: self.x + Math.cos(angle) * (self.radius + 7), y: self.y + Math.sin(angle) * (self.radius + 7), vx: Math.cos(angle) * p.speed, vy: Math.sin(angle) * p.speed, damage: p.damage, bounces: p.bounces, radius: 5, life: 4 }); }
    normalize(f) { const s = f.dash?.speed || f.speed, m = Math.hypot(f.vx, f.vy); if (m < .001) { f.vx = s; f.vy = 0; } else { f.vx *= s / m; f.vy *= s / m; } }
    wall(f) {
      let hit = false;
      for (const [axis, v] of [['x', 'vx'], ['y', 'vy']]) {
        const lo = PAD + f.radius, hi = SIZE - PAD - f.radius;
        if (f[axis] <= lo) { hit ||= f[v] < 0; f[axis] = lo; f[v] = Math.abs(f[v]); }
        else if (f[axis] >= hi) { hit ||= f[v] > 0; f[axis] = hi; f[v] = -Math.abs(f[v]); }
      }
      // Only fighter bounces generate audio events; correction and projectile hits stay silent.
      if (hit && Number.isInteger(f.slot) && !this.wallHits.some(e => e.slot === f.slot)) this.wallHits.push({ slot: f.slot });
    }
    separateFighters(a, b) {
      const dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy), minimum = a.radius + b.radius;
      if (distance >= minimum) return false;
      const nx = distance > 1e-8 ? dx / distance : 1, ny = distance > 1e-8 ? dy / distance : 0;
      const room = (f, x, y) => {
        const lo = PAD + f.radius, hi = SIZE - PAD - f.radius;
        return Math.max(0, Math.min(Math.abs(x) < 1e-9 ? Infinity : ((x > 0 ? hi : lo) - f.x) / x,
          Math.abs(y) < 1e-9 ? Infinity : ((y > 0 ? hi : lo) - f.y) / y));
      };
      const depth = minimum - distance + .6, bothFixed = a.rooted && b.rooted;
      const availableA = a.rooted && !bothFixed ? 0 : room(a, -nx, -ny);
      const availableB = b.rooted && !bothFixed ? 0 : room(b, nx, ny);
      let moveA = Math.min(availableA, depth * (b.rooted && !bothFixed ? 1 : .5));
      let moveB = Math.min(availableB, depth - moveA);
      moveA = Math.min(availableA, depth - moveB);
      a.x -= nx * moveA; a.y -= ny * moveA; b.x += nx * moveB; b.y += ny * moveB;
      // When a fixed launcher pins the other against a wall, resolve tangentially.
      if (moveA + moveB < depth - .001 && Boolean(a.rooted) !== Boolean(b.rooted)) {
        const fixed = a.rooted ? a : b, moving = a.rooted ? b : a;
        const base = Math.atan2(moving.y - fixed.y, moving.x - fixed.x), radius = minimum + .6;
        let best = null;
        for (let i = 0; i < 72; i++) {
          const angle = base + i * Math.PI / 36, x = fixed.x + Math.cos(angle) * radius, y = fixed.y + Math.sin(angle) * radius;
          const lo = PAD + moving.radius, hi = SIZE - PAD - moving.radius;
          if (x < lo || x > hi || y < lo || y > hi) continue;
          const cost = (x - moving.x) ** 2 + (y - moving.y) ** 2;
          if (!best || cost < best.cost) best = { x, y, cost };
        }
        if (best) { moving.x = best.x; moving.y = best.y; }
      }
      // Keep each fighter's own speed, but give it an actual outward heading.
      // A rooted launcher has zero physical velocity, regardless of stored heading.
      for (const [f, sign] of [[a, -1], [b, 1]]) {
        if (f.rooted) continue;
        const speed = f.dash?.speed || f.speed;
        const gap = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const ox = (b.x - a.x) / gap * sign, oy = (b.y - a.y) / gap * sign;
        const tangent = f.vx * -oy + f.vy * ox;
        const outward = Math.max(Math.abs(f.vx * ox + f.vy * oy), speed * .5);
        f.vx = ox * outward - oy * tangent; f.vy = oy * outward + ox * tangent;
        // A glancing bump nudges the character's spin a little; it settles back down on its own.
        f.spin = Math.max(-6, Math.min(6, f.spin + tangent / f.radius * .5));
        const lo = PAD + f.radius, hi = SIZE - PAD - f.radius;
        // Slide away along a wall instead of reflecting straight back into the pair.
        if ((f.x <= lo + 1 && f.vx < 0) || (f.x >= hi - 1 && f.vx > 0)) {
          f.vx = f.x <= lo + 1 ? speed * .08 : -speed * .08;
          if (Math.abs(f.vy) < speed * .2) f.vy = f.y < SIZE / 2 ? speed : -speed;
        }
        if ((f.y <= lo + 1 && f.vy < 0) || (f.y >= hi - 1 && f.vy > 0)) {
          f.vy = f.y <= lo + 1 ? speed * .08 : -speed * .08;
          if (Math.abs(f.vx) < speed * .2) f.vx = f.x < SIZE / 2 ? speed : -speed;
        }
        this.normalize(f);
      }
      return true;
    }
    step(dt) {
      this.wallHits = []; this.audioEvents = [];
      if (this.state !== 'running') return;
      if (!(dt > 0 && dt <= 1 / 60)) throw Error('물리 계산은 1/60초 이하 간격으로 실행하세요.');
      this.time += dt; this.contactTimer = Math.max(0, this.contactTimer - dt);
      for (const f of this.fighters) {
        f.flash = Math.max(0, f.flash - dt); f.shieldTime -= dt; if (f.shieldTime <= 0) f.shield = 0;
        if (!f.rooted) f.facing += (f.spin + IDLE_SPIN) * dt; f.spin *= Math.max(0, 1 - dt * 3.2);
        if (f.dash) { f.dash.remaining -= dt; if (f.dash.remaining <= 0) { f.dash = null; this.normalize(f); } }
        for (const skill of f.skills) {
          if (this.types[skill.type].trigger === 'pickup' || f.rooted) continue;
          skill.remaining -= dt;
          if (skill.remaining <= 0) { this.types[skill.type].cast(this.api, f, this.fighters[1 - f.slot], skill.params, skill); skill.remaining += skill.cooldown; this.log(`${f.name} · ${skill.name}`); }
        }
        if (!f.rooted) { f.x += f.vx * dt; f.y += f.vy * dt; this.wall(f); }
        f.trail.push({ x: f.x, y: f.y }); if (f.trail.length > 14) f.trail.shift();
      }
      const [a, b] = this.fighters;
      if (this.separateFighters(a, b)) {
        if (this.contactTimer <= 0) {
          const hit = f => f.contactDamage + (f.dash && !f.dash.hit ? f.dash.damage : 0);
          const da = hit(a), db = hit(b); this.damage(a, db); this.damage(b, da);
          for (const f of [a, b]) if (f.dash) f.dash.hit = true;
          this.api.sound('bump');
          this.contactTimer = .35;
        }
      }
      for (const s of this.shots) {
        s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
        const target = this.fighters[1 - s.owner];
        if (Math.hypot(s.x - target.x, s.y - target.y) < target.radius + s.radius) { this.damage(target, s.damage); s.life = 0; }
        const outside = s.x < PAD + s.radius || s.x > SIZE - PAD - s.radius || s.y < PAD + s.radius || s.y > SIZE - PAD - s.radius;
        if (outside) { if (s.bounces > 0) { this.wall(s); s.bounces--; } else s.life = 0; }
      }
      this.shots = this.shots.filter(s => s.life > 0);
      for (const o of this.orbits) {
        o.remaining -= dt; o.hitTimer -= dt; o.angle += o.speed * dt;
        const f = this.fighters[o.owner], target = this.fighters[1 - o.owner];
        o.x = f.x + Math.cos(o.angle) * o.range; o.y = f.y + Math.sin(o.angle) * o.range;
        if (o.remaining > 0 && o.hitTimer <= 0 && Math.hypot(o.x - target.x, o.y - target.y) < target.radius + 9) { this.damage(target, o.damage); o.hitTimer = .35; }
      }
      this.orbits = this.orbits.filter(o => o.remaining > 0);
      // Each custom ability owns its simulation; the engine manages lifetime/reset.
      for (const e of this.effects) {
        this.types[e.type].update(e, this.api, this.fighters[e.owner], this.fighters[1 - e.owner], dt);
        e.remaining -= dt;
      }
      this.effects = this.effects.filter(e => e.remaining > 0);
      for (const p of this.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
      this.particles = this.particles.filter(p => p.life > 0);
      for (const r of this.rings) r.life -= dt; this.rings = this.rings.filter(r => r.life > 0);
      // 장기전 피해는 보호막을 무시하며 시간이 지날수록 커집니다. 120초에는 판정합니다.
      if (this.time > 60) for (const f of this.fighters) f.hp = Math.max(0, f.hp - (3 + (this.time - 60) * .5) * dt);
      if (a.hp <= 0 || b.hp <= 0 || this.time >= 120) {
        const score = f => f.hp / f.maxHp; this.state = 'ended';
        this.winner = Math.abs(score(a) - score(b)) < 1e-9 ? null : score(a) > score(b) ? 0 : 1;
        this.log(this.winner === null ? '무승부' : `${this.fighters[this.winner].name} 승리!`);
      }
    }
  }
  global.ArenaEngine = { Battle, validate, copy, SIZE, PAD };
})(globalThis);
