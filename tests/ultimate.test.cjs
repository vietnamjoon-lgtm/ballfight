const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), assert = require('node:assert/strict');
const ctx = vm.createContext({});
for (const file of ['abilities.js', 'ability-packs.js', 'characters.js', 'engine.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), ctx);
const { Battle, copy, ULT_CHARGE } = ctx.ArenaEngine, types = ctx.ArenaAbilities;
const casts = Math.round(1 / ULT_CHARGE);
function setup() {
  const config = copy(ctx.ArenaDefaults);
  config.abilities.push(copy(ctx.ArenaNosePreset.ability));
  for (const f of config.characters) { f.abilities = []; f.contactDamage = 0; f.hp = 1000; }
  config.characters[0].abilities = [ctx.ArenaNosePreset.ability.id];
  const b = new Battle(config, ['blue', 'coral'], types, () => .5);
  b.start(); return b;
}
const step = b => b.step(1/120);
{
  const b = setup(), [self, other] = b.fighters, cd = self.skills[0].cooldown;
  assert.equal(self.ultIndex, 0, '코 능력이 궁극기를 제공');
  assert.equal(other.ultIndex, -1, '궁극기 능력이 없으면 게이지 없음');
  // Gauge fills a step per regular cast.
  for (let i = 1; i < casts; i++) {
    while (b.events.filter(e => e.text.endsWith('쭉 늘어나는 코')).length < i) step(b);
    assert.ok(Math.abs(self.ult - i * ULT_CHARGE) < 1e-9, `${i}번 사용 후 게이지 ${i * ULT_CHARGE}`);
  }
  while (!b.events.some(e => e.text.includes('궁극기'))) { step(b); assert.ok(b.time < cd * (casts + 2), '궁극기가 발동해야 함'); }
  assert.equal(self.ult, 0, '발동하면 게이지 초기화');
  assert.ok(self.ultTime > 0);
  const club = b.effects.find(e => e.owner === 0 && e.mode === 'club'); assert.ok(club, '몽둥이 효과 생성');
  assert.equal(b.effects.filter(e => e.owner === 0 && e.type === 'nose').length, 1, '일반 코와 겹치지 않음');
  // No regular casts and no gauge gain while the ultimate runs.
  const remaining = self.skills[0].remaining, start = b.time;
  while (self.ultTime > 0) { step(b); if (self.ultTime > 0) { assert.equal(self.skills[0].remaining, remaining); assert.equal(self.ult, 0); } }
  const duration = b.time - start;
  assert.ok(duration > 2 && duration < 3, '몽둥이 분쇄기는 약 2초 회전');
  assert.equal(b.effects.filter(e => e.mode === 'club').length, 0, '끝나면 사라짐');
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
