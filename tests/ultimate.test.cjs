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
const scene = types.nose.ultimate.scene;
function ultimate(place) {
  const b = setup(), [self, target] = b.fighters;
  place?.(b, self, target);
  self.ult = 1;
  while (!b.cutscene) { step(b); assert.ok(b.time < 10, '궁극기가 발동해야 함'); }
  return { b, self, target };
}
{
  // Full gauge fires the ultimate as a scene: the fight freezes, fixed hits land, then it resumes.
  const { b, self, target } = ultimate();
  assert.equal(self.ult, 0, '발동하면 게이지 초기화');
  assert.ok(b.events[0].text.includes('궁극기 코 분쇄기'));
  assert.equal(b.cutscene.slot, 0); assert.equal(b.cutscene.name, '코 분쇄기');
  const hp = target.hp, total = self.skills[0].params.ultTotal;
  const snapshot = () => JSON.stringify([b.time, b.fighters.map(f => [f.x, f.y, f.vx, f.vy, f.shield]), b.fighters.map(f => f.skills.map(s => s.remaining)), b.effects.map(e => e.age)]);
  const frozen = snapshot(); const drops = []; let frames = 0, grinderFrames = 0;
  while (b.cutscene) {
    const before = target.hp; step(b); frames++;
    if (target.hp < before) drops.push([+(frames / 120).toFixed(3), before - target.hp, b.audioEvents.map(e => e.type)]);
    assert.equal(self.ult, 0, '연출 중 게이지 안 참');
  }
  assert.equal(snapshot(), frozen, '연출 동안 싸움이 완전히 멈춤 (위치·시간·쿨타임·효과)');
  assert.ok(Math.abs(frames / 120 - scene.duration) < .02, '연출 길이');
  assert.equal(drops.length, scene.hits.length, '정해진 횟수만큼 맞음');
  drops.forEach(([t], i) => assert.ok(Math.abs(t - scene.hits[i]) < .01, '정해진 시점에 맞음'));
  assert.ok(drops.every(d => d[2].includes('spinHit')), '맞을 때마다 타격음');
  assert.ok(Math.abs(hp - target.hp - total) < 1e-9, '항상 같은 총 피해');
  step(b); assert.ok(b.time > 0 && !b.cutscene, '연출이 끝나면 싸움 재개');
}
{
  // Same damage no matter how far away the opponent is or how much shield it has.
  const far = ultimate((b, self, target) => { Object.assign(self, { x: 60, y: 60 }); Object.assign(target, { x: 660, y: 660, shield: 999, shieldTime: 99, damageReduction: .9 }); });
  const hp = far.target.hp; while (far.b.cutscene) step(far.b);
  assert.ok(Math.abs(hp - far.target.hp - far.self.skills[0].params.ultTotal) < 1e-9, '거리·보호막·피해감소 무시');
  assert.equal(far.target.shield, 999, '보호막은 소모되지 않음');
}
{
  // No gauge gain from walls/bumps while the scene plays, and a lethal ultimate ends the match after it.
  const { b, self, target } = ultimate(); target.hp = 10;
  while (b.cutscene) { step(b); assert.equal(self.ult, 0); assert.equal(b.state, 'running'); }
  step(b); assert.equal(b.state, 'ended'); assert.equal(b.winner, 0, '궁극기로 쓰러뜨리면 승리');
}
{
  // Older saves with the removed spin fields still load; the new total uses its default.
  const config = copy(ctx.ArenaDefaults), a = copy(ctx.ArenaNosePreset.ability);
  a.params.ultDamage = 9; a.params.ultRange = 190; config.abilities.push(a);
  const clean = ctx.ArenaEngine.validate(config, types).abilities.find(x => x.id === a.id);
  assert.equal(clean.params.ultTotal, 50); assert.equal(clean.params.ultRange, undefined);
}
console.log('ultimate ok');
