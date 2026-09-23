const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), assert = require('node:assert/strict');
const ctx = vm.createContext({});
for (const file of ['abilities.js', 'ability-packs.js', 'characters.js', 'engine.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), ctx);
const { Battle, copy } = ctx.ArenaEngine, types = ctx.ArenaAbilities;
const preset = ctx.ArenaAskFightPreset;
function setup(random) {
  const config = copy(ctx.ArenaDefaults);
  for (const f of config.characters) { f.abilities = []; f.contactDamage = 0; }
  const b = new Battle(config, ['blue', 'coral'], types, random), self = b.fighters[0], target = b.fighters[1];
  Object.assign(self, { x: 150, y: 350, vx: 0, vy: 0 }); Object.assign(target, { x: 450, y: 350, vx: 0, vy: 0 });
  b.start(); return { b, self, target };
}
function advance(b, n) { for (let i = 0; i < n; i++) b.step(1 / 120); }
const params = copy(preset.params); // damage 22, askTime 2, actionTime .9

// Casting immediately roots the caster and shows the "asking" phase; nobody moves or takes damage yet.
{
  const { b, self, target } = setup(() => .1);
  types.askFight.cast(b.api, self, target, copy(params));
  assert.equal(b.effects.length, 1);
  assert.equal(b.effects[0].phase, 'ask');
  assert.equal(self.rooted, true);
  const hp = target.hp, sx = self.x, sy = self.y;
  advance(b, 40); // well under askTime (2s = 240 frames)
  assert.equal(b.effects[0].phase, 'ask', '아직 물어보는 중');
  assert.equal(self.x, sx); assert.equal(self.y, sy);
  assert.equal(target.hp, hp, '결정 전에는 피해 없음');
}

// Fight branch: forced by random()<.5. Caster walks up, target gets grabbed (rooted), exactly one guaranteed hit.
{
  const { b, self, target } = setup(() => .1);
  types.askFight.cast(b.api, self, target, copy(params));
  const hp = target.hp, startX = self.x;
  advance(b, 280); // past ask (240 frames) + partway into the approach (40 more), still mid-grab
  assert.equal(b.effects[0].fight, true);
  assert.equal(target.rooted, true, '붙잡힌 상대는 못 움직임');
  assert.notEqual(self.x, startX, '상대에게 다가감');
  advance(b, 110); // finish the sequence and let the container's own duration (384 frames) run out
  assert.equal(b.effects.length, 0, '시퀀스가 끝나면 효과 정리');
  assert.equal(self.rooted, false); assert.equal(target.rooted, false);
  assert.equal(target.hp, hp - params.damage, '얼굴 때리기는 정확히 한 번, 무조건 명중');
}

// Throw branch: forced by random()>=.5. Caster stays put; the target is never rooted; one guaranteed hit at the end.
{
  const { b, self, target } = setup(() => .9);
  types.askFight.cast(b.api, self, target, copy(params));
  const hp = target.hp, startX = self.x, startY = self.y;
  advance(b, 300);
  assert.equal(b.effects[0]?.fight ?? false, false);
  advance(b, 200);
  assert.equal(self.x, startX); assert.equal(self.y, startY, '노트북 던지기는 캐릭터가 이동하지 않음');
  assert.ok(!target.rooted, '노트북 던지기는 상대를 붙잡지 않음');
  assert.equal(b.effects.length, 0);
  assert.equal(self.rooted, false);
  assert.equal(target.hp, hp - params.damage, '노트북은 정확히 한 번, 무조건 명중');
}

// If the target dies mid-sequence, both fighters are released immediately and the effect ends.
{
  const { b, self, target } = setup(() => .1);
  types.askFight.cast(b.api, self, target, copy(params));
  advance(b, 150);
  target.hp = 0;
  advance(b, 1);
  assert.equal(self.rooted, false);
  assert.equal(target.rooted, false);
  assert.equal(b.effects.length, 0);
}

const drawCtx = new Proxy({}, { get: () => () => {} });
{
  const { b, self, target } = setup(() => .1);
  types.askFight.cast(b.api, self, target, copy(params));
  types.askFight.draw(drawCtx, b.effects[0], self);
  advance(b, 300);
  types.askFight.draw(drawCtx, b.effects[0], self);
}
{
  const { b, self, target } = setup(() => .9);
  types.askFight.cast(b.api, self, target, copy(params));
  advance(b, 300);
  types.askFight.draw(drawCtx, b.effects[0], self);
}

console.log('물어보고 공격 능력 검사 통과: 묻는 동안 대기, 격투(붙잡기+무조건 명중), 노트북 던지기(이동 없음+무조건 명중), 상대 사망 시 즉시 정리, 그리기 계약');
