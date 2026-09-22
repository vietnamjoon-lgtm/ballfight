const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), assert = require('node:assert/strict');
const ctx = vm.createContext({});
for (const file of ['abilities.js', 'ability-packs.js', 'characters.js', 'engine.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), ctx);
const { Battle, copy } = ctx.ArenaEngine, types = ctx.ArenaAbilities;
function setup() {
  const config = copy(ctx.ArenaDefaults);
  for (const f of config.characters) { f.abilities = []; f.contactDamage = 0; }
  const b = new Battle(config, ['blue', 'coral'], types), self = b.fighters[0], target = b.fighters[1];
  Object.assign(self, { x: 150, y: 350, vx: 0, vy: 0 }); Object.assign(target, { x: 450, y: 350, vx: 0, vy: 0 });
  b.start(); return { b, self, target };
}
function advance(b, n) { for (let i = 0; i < n; i++) b.step(1 / 120); }
const params = copy(ctx.ArenaFartPreset.params); // damage 5, radius 26, trailTime 3, puffDuration 4

// Puffs drop periodically at the caster's current position while trailing, tracing out movement.
{
  const { b, self, target } = setup();
  types.fart.cast(b.api, self, target, copy(params));
  assert.equal(b.effects.length, 1);
  assert.equal(b.effects[0].puffs.length, 0, '캐스트 순간에는 아직 구름이 없음');
  advance(b, 28);
  assert.equal(b.effects[0].puffs.length, 1, '이동 중이면 일정 간격으로 구름이 생김');
  assert.equal(b.effects[0].puffs[0].x, self.x);
  self.x += 60;
  advance(b, 28);
  assert.equal(b.effects[0].puffs.length, 2);
  assert.notEqual(b.effects[0].puffs[1].x, b.effects[0].puffs[0].x, '이동하면 새 구름은 다른 자리에 남아 흔적을 그림');
}
// No more puffs once trailTime has elapsed, even though the effect (and its existing puffs) are still alive.
{
  const { b, self, target } = setup();
  types.fart.cast(b.api, self, target, copy(params));
  advance(b, Math.round(params.trailTime * 120) + 12);
  const countAtEnd = b.effects[0].puffs.length;
  assert.ok(countAtEnd > 5, '흔적 시간 동안 여러 개의 구름이 쌓임');
  self.x += 60;
  advance(b, 30);
  assert.equal(b.effects[0].puffs.length, countAtEnd, '흔적 남기는 시간이 끝나면 더 이상 새 구름이 생기지 않음');
}
// The caster never takes damage from its own trail, even standing right on top of it.
{
  const { b, self, target } = setup();
  target.x = self.x + 500; target.y = self.y; // out of the way, so only self's own trail is in play
  types.fart.cast(b.api, self, target, copy(params));
  const hpSelf = self.hp;
  advance(b, 200);
  assert.equal(self.hp, hpSelf, '자기 자신은 자신의 방구 흔적에 피해를 입지 않음');
}
// Standing in a puff damages the target.
{
  const { b, self, target } = setup();
  target.x = self.x + 500; target.y = self.y; // clear of the caster and the puff for now
  types.fart.cast(b.api, self, target, copy(params));
  advance(b, 28); // let the first puff actually drop at self's position
  const puffSpot = { x: b.effects[0].puffs[0].x, y: b.effects[0].puffs[0].y };
  self.x = 600; self.y = 600; // caster wanders off, leaving the puff behind
  target.x = puffSpot.x; target.y = puffSpot.y; // target steps into the puff
  const hpTarget = target.hp;
  advance(b, 90);
  assert.ok(target.hp < hpTarget, '방구 위에 있으면 상대는 피해를 입음');
}
// Standing well outside every puff takes no damage.
{
  const { b, self, target } = setup();
  target.x = self.x + 500; target.y = self.y;
  types.fart.cast(b.api, self, target, copy(params));
  const hp = target.hp;
  advance(b, 90);
  assert.equal(target.hp, hp, '반경 밖에 있으면 무피해');
}
// A puff stays put where it was dropped — someone who walks into that stale spot later still takes damage.
{
  const { b, self, target } = setup();
  types.fart.cast(b.api, self, target, copy(params));
  advance(b, 28);
  const puff = b.effects[0].puffs[0];
  self.x = 600; self.y = 600;
  target.x = puff.x; target.y = puff.y;
  const hp = target.hp;
  advance(b, 90);
  assert.ok(target.hp < hp, '구름은 놓인 자리에 고정되어, 나중에 밟은 상대도 피해');
}
// Each puff fades and disappears on its own after puffDuration, independent of the others still trailing.
{
  const { b, self, target } = setup();
  types.fart.cast(b.api, self, target, copy(params));
  advance(b, 28);
  assert.equal(b.effects[0].puffs.length, 1);
  const firstPuff = b.effects[0].puffs[0];
  advance(b, Math.round(params.puffDuration * 120) + 10);
  assert.ok(!b.effects[0].puffs.includes(firstPuff), '가장 먼저 생긴 구름은 자기 지속 시간이 끝나면 사라짐');
  assert.ok(b.effects[0].puffs.length > 0, '나중에 생긴 구름들은 아직 자기 지속 시간이 안 끝나 남아있음');
}
// The whole trail effect is cleaned up once every puff it created has fully faded.
{
  const { b, self, target } = setup();
  types.fart.cast(b.api, self, target, copy(params));
  advance(b, Math.round((params.trailTime + params.puffDuration) * 120) + 20);
  assert.equal(b.effects.length, 0, '모든 구름이 사라지면 흔적 효과 자체도 정리됨');
}
// Repeated casts can leave several trails' worth of puffs overlapping.
{
  const { b, self, target } = setup();
  types.fart.cast(b.api, self, target, copy(params));
  self.x = 250;
  types.fart.cast(b.api, self, target, copy(params));
  assert.equal(b.effects.length, 2, '여러 번 발동하면 흔적이 여러 개 남아 겹칠 수 있음');
}
// Damage never drops the target below zero HP (sanity check against the shared damage() clamp).
{
  const { b, self, target } = setup();
  target.x = self.x + 500; target.y = self.y;
  types.fart.cast(b.api, self, target, copy(params));
  advance(b, 28);
  const puff = b.effects[0].puffs[0];
  self.x = 600; self.y = 600;
  target.x = puff.x; target.y = puff.y; target.hp = 1;
  advance(b, 90);
  assert.ok(target.hp >= 0);
}
const drawCtx = new Proxy({}, { get: () => () => {} });
{ const { b, self, target } = setup(); types.fart.cast(b.api, self, target, copy(params)); advance(b, 30); types.fart.draw(drawCtx, b.effects[0]); }

console.log('방구 능력 검사 통과: 이동 경로를 따라 구름 생성, 흔적 시간 종료 후 생성 중단, 자기 자신은 무피해, 상대는 피해, 반경 밖 무피해, 구름 자리 고정, 개별 구름 소멸, 흔적 정리, 중첩, 그리기 계약');
