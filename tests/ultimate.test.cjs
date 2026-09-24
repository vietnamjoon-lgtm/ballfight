const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), assert = require('node:assert/strict');
const ctx = vm.createContext({});
for (const file of ['abilities.js', 'ability-packs.js', 'characters.js', 'engine.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), ctx);
const { Battle, copy, ULT_CHARGE } = ctx.ArenaEngine, types = ctx.ArenaAbilities;
function setup() {
  const config = copy(ctx.ArenaDefaults);
  config.abilities.push(copy(ctx.ArenaNosePreset.ability));
  for (const f of config.characters) { f.abilities = []; f.contactDamage = 0; f.hp = 1000; }
  config.characters[0].abilities = [ctx.ArenaNosePreset.ability.id];
  const b = new Battle(config, ['blue', 'coral'], types, () => .5);
  b.start(); return b;
}
const step = b => b.step(1/120);
const near = (a, b) => Math.abs(a - b) < 1e-9;
{
  // Casting a skill alone no longer charges the gauge.
  const b = setup(), [self, other] = b.fighters;
  assert.equal(self.ultIndex, 0, '코 능력이 궁극기를 제공');
  assert.equal(other.ultIndex, -1, '궁극기 능력이 없으면 게이지 없음');
  Object.assign(self, { x: 100, y: 100 }); Object.assign(other, { x: 600, y: 600, vx: 0, vy: 0 });
  types.nose.cast(b.api, self, { x: 100, y: 600 }, self.skills[0].params); b.effects[0].angle = -Math.PI / 2;
  b.effects[0].range = 0; self.vx = 0; self.vy = 0.001; self.speed = 0.001; other.speed = 0.001;
  for (let i = 0; i < 60; i++) step(b);
  assert.equal(self.ult, 0, '빗나간 스킬 사용만으로는 충전 안 됨');
}
{
  // Wall bounce: +3%, once per bounce.
  const b = setup(), [self, other] = b.fighters;
  Object.assign(other, { x: 600, y: 600, vx: 0, vy: 0, speed: 0.001 });
  Object.assign(self, { x: 6 + self.radius + 1, y: 360, vx: -300, vy: 0 });
  step(b); step(b);
  assert.ok(near(self.ult, ULT_CHARGE.wall), '벽 충돌 3%');
  assert.ok(near(ULT_CHARGE.wall, .03) && near(ULT_CHARGE.bump, .02));
}
{
  // Bumping into the opponent: +2% each (per contact tick, not every frame).
  const b = setup(), [self, other] = b.fighters;
  Object.assign(self, { x: 300, y: 360, vx: 300, vy: 0 }); Object.assign(other, { x: 300 + self.radius + other.radius - 2, y: 360, vx: -300, vy: 0 });
  step(b);
  assert.ok(near(self.ult, ULT_CHARGE.bump), '상대와 부딪히면 2%');
  for (let i = 0; i < 20; i++) step(b);
  assert.ok(self.ult <= ULT_CHARGE.bump * 2 + 1e-9, '접촉이 이어져도 프레임마다 차지 않음');
}
function poke(offset) {
  const b = setup(), [self, target] = b.fighters;
  for (const f of [self, target]) Object.assign(f, { vx: 0, vy: 0.001, speed: 0.001 });
  Object.assign(self, { x: 150, y: 350 }); Object.assign(target, { x: 450, y: 350 + offset });
  types.nose.cast(b.api, self, { x: 450, y: 350 }, self.skills[0].params);
  const hp = target.hp; for (let i = 0; i < 40; i++) step(b);
  assert.ok(target.hp < hp, '코 적중');
  return self.ult;
}
{
  const p = copy(ctx.ArenaNosePreset.ability.params), edge = 42 + p.width / 2;
  assert.ok(Math.abs(poke(0) - .17) < .005, '정중앙 찌르기 17%');
  const graze = poke(edge - .5);
  assert.ok(graze >= .12 && graze < .125, `살짝 스치면 12% (${graze})`);
  const mid = poke(edge / 2); assert.ok(mid > .13 && mid < .16, '중간은 그 사이');
}
{
  // Full gauge fires the ultimate; nothing charges while it spins.
  const b = setup(), [self, other] = b.fighters, cd = self.skills[0].cooldown;
  self.ult = 1;
  while (!b.events.some(e => e.text.includes('궁극기'))) { step(b); assert.ok(b.time < cd * 3, '궁극기가 발동해야 함'); }
  assert.equal(self.ult, 0, '발동하면 게이지 초기화');
  assert.ok(self.ultTime > 0);
  const spin = b.effects.find(e => e.owner === 0 && e.mode === 'spin'); assert.ok(spin, '코 회전 효과 생성');
  assert.equal(spin.width, self.skills[0].params.width, '코는 원래 두께 그대로');
  assert.equal(b.effects.filter(e => e.owner === 0 && e.type === 'nose').length, 1, '일반 코와 겹치지 않음');
  // No regular casts and no gauge gain while the ultimate runs.
  const remaining = self.skills[0].remaining, start = b.time;
  while (self.ultTime > 0) { step(b); if (self.ultTime > 0) { assert.equal(self.skills[0].remaining, remaining); assert.equal(self.ult, 0); } }
  const duration = b.time - start;
  assert.ok(duration > 2 && duration < 3, '코 분쇄기는 약 2초 회전');
  assert.equal(b.effects.filter(e => e.mode === 'spin').length, 0, '끝나면 사라짐');
}
{
  // A target standing inside the spin radius is hit repeatedly, spaced by the hit gap.
  const b = setup(), [self, target] = b.fighters, p = self.skills[0].params;
  Object.assign(self, { x: 360, y: 360, vx: 0, vy: 0, speed: 0.0001 });
  Object.assign(target, { x: 360 + p.ultRange * .7, y: 360, vx: 0, vy: 0, speed: 0.0001 });
  types.nose.ultimate.cast(b.api, self, target, p);
  const hp = target.hp; let hits = 0, prev = hp;
  for (let i = 0; i < 120 * 2.7; i++) {
    Object.assign(target, { x: 360 + p.ultRange * .7, y: 360 });
    step(b); if (target.hp < prev) { hits++; assert.equal(prev - target.hp, p.ultDamage); prev = target.hp; }
  }
  assert.ok(hits >= 4 && hits <= 9, `여러 번 적중 (${hits})`);
}
console.log('ultimate ok');
