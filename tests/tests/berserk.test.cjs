const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), assert = require('node:assert/strict');
const ctx = vm.createContext({});
for (const file of ['abilities.js', 'ability-packs.js', 'characters.js', 'engine.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), ctx);
const { Battle, copy } = ctx.ArenaEngine, types = ctx.ArenaAbilities;
const preset = ctx.ArenaBerserkPreset;
function setup(random = () => .5) {
  const config = copy(ctx.ArenaDefaults);
  if (!config.abilities.some(a => a.id === preset.id)) config.abilities.push(copy(preset));
  for (const f of config.characters) { f.abilities = [preset.id]; f.contactDamage = 5; }
  const b = new Battle(config, ['blue', 'coral'], types, random), self = b.fighters[0], target = b.fighters[1];
  Object.assign(self, { x: 300, y: 350, vx: 0, vy: 0 }); Object.assign(target, { x: 500, y: 550, vx: 0, vy: 0 });
  b.start(); return { b, self, target };
}
function advance(b, n) { for (let i = 0; i < n; i++) b.step(1 / 120); }
const skill = () => ({ id: preset.id, params: preset.params });

// Before the timer runs out, contact damage is untouched, damage is reduced, and status shows a countdown.
{
  const { b, self } = setup();
  const baseDamage = self.contactDamage;
  advance(b, 60);
  assert.equal(b.effects[0].transformed, false, '시간이 남았으면 아직 각성 전');
  assert.equal(self.contactDamage, baseDamage, '각성 전에는 접촉 피해 그대로');
  assert.equal(self.damageReduction, preset.params.damageReduction / 100, '각성 전에는 피해 감소가 걸려있음');
  const status = types.berserk.status(self, skill());
  assert.ok(status.label.includes('각성까지'), '상태 표시가 카운트다운을 보여줌');
  assert.ok(status.progress > 0 && status.progress < 1);
}

// Very low HP alone does not trigger the transform anymore — only elapsed time does.
{
  const { b, self, target } = setup();
  self.hp = 1;
  advance(b, 120);
  assert.equal(b.effects[0].transformed, false, '체력이 낮아도 시간이 안 지나면 각성 안 함');
}

// At the configured time, the fighter awakens exactly once: damage multiplies, reduction drops, flash starts.
{
  const { b, self, target } = setup();
  const baseDamage = self.contactDamage;
  advance(b, Math.ceil(preset.params.transformTime * 120) + 2);
  assert.equal(b.effects[0].transformed, true, '설정한 시간이 지나면 각성');
  assert.equal(self.contactDamage, baseDamage * preset.params.damageMultiplier, '접촉 피해가 배율만큼 증가');
  assert.equal(self.damageReduction, 0, '각성하면 피해 감소가 사라짐');
  assert.ok(b.effects[0].flash > 0, '각성 순간 화면 번쩍임 시작');
  const status = types.berserk.status(self, skill());
  assert.equal(status.label, '각성!');
  const boosted = self.contactDamage;
  advance(b, 60);
  assert.equal(self.contactDamage, boosted, '한 번 오른 접촉 피해는 유지되고 다시 곱해지지 않음');
}

// After awakening, the fighter alternates charging toward the target and retreating from it.
{
  const { b, self, target } = setup();
  advance(b, Math.ceil(preset.params.transformTime * 120) + 2);
  assert.equal(b.effects[0].phase, 'charge', '각성 직후에는 돌진 단계로 시작');
  const towards = Math.atan2(target.y - self.y, target.x - self.x);
  const chargeAngle = Math.atan2(self.vy, self.vx);
  assert.ok(Math.abs(Math.sin(towards - chargeAngle)) < 1e-6 && Math.cos(towards - chargeAngle) > 0, '돌진 단계에서는 상대 쪽으로 이동');
  advance(b, Math.ceil(preset.params.cycleTime / 2 * 120) + 2);
  assert.equal(b.effects[0].phase, 'retreat', '주기가 지나면 후퇴 단계로 전환');
  const retreatAngle = Math.atan2(self.vy, self.vx);
  assert.ok(Math.abs(Math.sin(towards - retreatAngle)) < 1e-6 && Math.cos(towards - retreatAngle) < 0, '후퇴 단계에서는 상대 반대쪽으로 이동');
}

// Bread spawns on the floor up to the configured cap, and walking over a ready piece heals and starts eating.
{
  const { b, self } = setup();
  advance(b, 241); // just past the first 2s drop interval
  const bank = b.effects[0].bank;
  assert.equal(bank.pieces.length, 1, '첫 간격이 지나면 빵 하나 생성');
  const hp = self.hp;
  const bread = bank.pieces[0];
  self.x = bread.x; self.y = bread.y;
  advance(b, 42); // clear the .35s pickup-ready delay
  assert.equal(self.hp, Math.min(self.maxHp, hp + preset.params.breadHeal), '빵을 먹으면 설정한 만큼 회복');
  assert.ok(b.effects[0].eating, '먹는 동안 씹는 연출 상태가 생김');
  assert.equal(bank.pieces.length, 0, '먹은 빵은 바닥에서 사라짐');
  advance(b, 200);
  assert.equal(b.effects[0].eating, null, '씹는 연출이 끝나면 정리됨');
}

// Bread never exceeds the configured max count on the floor at once.
{
  const { b } = setup();
  advance(b, 1000);
  const bank = b.effects[0].bank;
  assert.ok(bank.pieces.length <= preset.params.breadCount, '빵은 최대 개수를 넘지 않음');
}

// Damage reduction actually softens incoming damage through the shared engine damage pipeline.
{
  const { b, self, target } = setup();
  advance(b, 1);
  const hp = self.hp;
  b.api.damage(self, 20, target);
  const expected = Math.round((hp - 20 * (1 - preset.params.damageReduction / 100)) * 1e6) / 1e6;
  assert.equal(Math.round(self.hp * 1e6) / 1e6, expected, '피해 감소 비율만큼 실제 피해가 줄어듦');
}

// If the target dies first, the awakened fighter stops steering itself.
{
  const { b, self, target } = setup();
  advance(b, Math.ceil(preset.params.transformTime * 120) + 2);
  self.vx = 0; self.vy = 0;
  target.hp = 0;
  advance(b, 1);
  assert.equal(self.vx, 0); assert.equal(self.vy, 0);
}

const drawCtx = new Proxy({}, { get: () => () => {} });
{
  const { b, self } = setup();
  types.berserk.draw(drawCtx, b.effects[0], self);
  advance(b, 241);
  types.berserk.draw(drawCtx, b.effects[0], self);
  advance(b, Math.ceil(preset.params.transformTime * 120));
  types.berserk.draw(drawCtx, b.effects[0], self);
}

console.log('각성 폭주 능력 검사 통과: 대기 중 피해 감소·빵 회복(씹기 연출)·빵 최대 개수, 시간 기반 1회 각성, 돌진·후퇴 반복, 상태 표시, 피해 감소 실제 적용, 상대 사망 시 정지, 그리기 계약');
