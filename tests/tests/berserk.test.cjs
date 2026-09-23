const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), assert = require('node:assert/strict');
const ctx = vm.createContext({});
for (const file of ['abilities.js', 'ability-packs.js', 'characters.js', 'engine.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), ctx);
const { Battle, copy } = ctx.ArenaEngine, types = ctx.ArenaAbilities;
const preset = ctx.ArenaBerserkPreset;
function setup(sx = 300, sy = 350, tx = 380, ty = 350) {
  const config = copy(ctx.ArenaDefaults);
  if (!config.abilities.some(a => a.id === preset.id)) config.abilities.push(copy(preset));
  for (const f of config.characters) { f.abilities = []; f.contactDamage = 0; }
  config.characters[0].abilities = [preset.id];
  const b = new Battle(config, ['blue', 'coral'], types, () => .5), self = b.fighters[0], target = b.fighters[1];
  Object.assign(self, { x: sx, y: sy, vx: 0, vy: 0 }); Object.assign(target, { x: tx, y: ty, vx: 0, vy: 0 });
  b.start(); return { b, self, target };
}
function advance(b, n) { for (let i = 0; i < n; i++) b.step(1 / 120); }
// Jumps straight into berserk-mode combat, bypassing the timers, for tests that only care about that phase.
function setupBerserk(sx, sy, tx, ty) {
  const { b, self, target } = setup(sx, sy, tx, ty);
  const e = b.effects[0];
  e.mode = 'berserk'; e.phase = 'charge'; e.phaseTimer = e.cycleTime / 2; e.chargeHit = false;
  e.particles = []; e.awakenAge = 0; e.lastSetVx = undefined; e.lastSetVy = undefined;
  self.rooted = false;
  return { b, self, target, e };
}
const skill = () => ({ id: preset.id, params: preset.params });
const CINE_FRAMES = Math.ceil(4.5 * 120) + 2;

// Survive mode: damage reduction applies, status shows a countdown.
{
  const { b, self } = setup();
  const baseDamage = self.contactDamage;
  advance(b, 60);
  assert.equal(b.effects[0].mode, 'survive');
  assert.equal(self.contactDamage, baseDamage, '평시엔 접촉 피해 그대로');
  assert.equal(self.damageReduction, preset.params.damageReduction / 100);
  const status = types.berserk.status(self, skill());
  assert.ok(status.label.includes('각성까지'));
}

// Very low HP alone does not trigger the transform — only elapsed time does.
{
  const { b, self, target } = setup();
  self.hp = 1; target.hp = 1;
  advance(b, 120);
  assert.equal(b.effects[0].mode, 'survive', '체력이 낮아도 시간이 안 지나면 각성 안 함');
}

// At the configured time it enters the transform cinematic: rooted, bread cleared, eating cleared, sound fired.
{
  const { b, self, target } = setup();
  advance(b, Math.ceil(preset.params.transformTime * 120) - 2);
  b.effects[0].bank.pieces.push({ x: self.x, y: self.y, ready: b.time, expires: b.time + 24 });
  b.effects[0].eating = { bites: 0, timer: .3 };
  const sounds = [];
  for (let i = 0; i < 4 && b.effects[0].mode === 'survive'; i++) { b.step(1 / 120); sounds.push(...b.audioEvents.map(e => e.type)); }
  assert.equal(b.effects[0].mode, 'cine', '설정한 시간이 지나면 변신 시작');
  assert.equal(self.rooted, true, '변신 중엔 고정');
  assert.equal(b.effects[0].bank.pieces.length, 0, '각성 시작하면 빵 다 치움');
  assert.equal(b.effects[0].eating, null, '먹던 것도 취소');
  assert.ok(sounds.includes('awaken'), '각성 소리 재생');
}

// During the cinematic the fighter glides toward the arena center and requests screen shake each frame.
{
  const { b, self, target } = setup(150, 150, 500, 500);
  advance(b, Math.ceil(preset.params.transformTime * 120));
  const startDist = Math.hypot(self.x - 360, self.y - 360);
  advance(b, 40);
  const midDist = Math.hypot(self.x - 360, self.y - 360);
  assert.ok(midDist < startDist, '변신 중 전장 중앙으로 이동');
  assert.ok(b.shakeRequest > 0, '변신 중 화면 흔들림 요청');
}

// The photo hook picks the primary portrait while at rest, and swaps to the secondary one as soon as
// the transform starts, staying swapped through the whole cine + berserk window.
{
  const { b, self, target } = setup();
  assert.equal(types.berserk.photo(self, skill()), 'primary', '평시엔 원래 사진');
  advance(b, Math.ceil(preset.params.transformTime * 120));
  advance(b, 1);
  assert.equal(b.effects[0].mode, 'cine');
  assert.equal(types.berserk.photo(self, skill()), 'secondary', '변신 시작하자마자 각성 사진으로');
  advance(b, CINE_FRAMES);
  assert.equal(types.berserk.photo(self, skill()), 'secondary', '각성 상태 내내 각성 사진 유지');
}

// After the cinematic window, it switches to berserk mode, unroots, and starts charging.
{
  const { b, self, target } = setup();
  advance(b, Math.ceil(preset.params.transformTime * 120));
  advance(b, CINE_FRAMES);
  assert.equal(b.effects[0].mode, 'berserk');
  assert.equal(self.rooted, false);
  assert.equal(b.effects[0].phase, 'charge');
}

// A successful charge deals exactly the configured damage as an explosion-kind hit, with a fragment burst,
// and only once per charge (no double-dipping before the next retreat/charge cycle).
{
  const { b, self, target, e } = setupBerserk(300, 350, 430, 350); // starts just outside contact range
  const hp = target.hp;
  advance(b, 30); // half a cycle: enough for an 850px/s charge to close the remaining gap
  assert.equal(target.hp, hp - preset.params.berserkDamage, '돌진 한 번에 설정한 피해량 그대로');
  assert.equal(b.impacts[b.impacts.length - 1].kind, 'explosion', '강한 화면 흔들림을 위해 explosion으로 처리');
  assert.ok(e.particles.length > 0, '박은 자리에 파편 파티클 생성');
  const hpAfterFirstHit = target.hp;
  advance(b, 15); // still mid-charge
  assert.equal(target.hp, hpAfterFirstHit, '같은 돌진에서 두 번 때리지 않음');
}

// The fighter alternates charging toward the target and retreating away from it.
{
  const { b, self, target, e } = setupBerserk(300, 350, 600, 350);
  const towards = Math.atan2(target.y - self.y, target.x - self.x);
  advance(b, 1);
  const chargeAngle = Math.atan2(self.vy, self.vx);
  assert.ok(Math.cos(towards - chargeAngle) > .99, '돌진 단계에서는 상대 쪽으로 이동');
  advance(b, Math.ceil(preset.params.cycleTime / 2 * 120) + 2);
  assert.equal(e.phase, 'retreat');
  const retreatAngle = Math.atan2(self.vy, self.vx);
  assert.ok(Math.cos(towards - retreatAngle) < -.99, '후퇴 단계에서는 반대쪽으로 이동');
}

// After the full awaken window elapses, it reverts to survive mode: damage reduction back, timer reset.
{
  const { b, self, target, e } = setupBerserk(300, 350, 900, 900);
  self.hp = target.hp = 1e6; // stay alive through the whole window so the match doesn't end early
  advance(b, Math.ceil(preset.params.awakenDuration * 120) + 5);
  assert.equal(e.mode, 'survive', '각성 시간이 다 지나면 평화 상태로 복귀');
  assert.ok(e.elapsed < .1, '각성 타이머 초기화');
  assert.equal(self.damageReduction, preset.params.damageReduction / 100, '피해 감소 다시 적용');
}

// The whole cycle repeats: a second awakening happens after the timer fills again.
{
  const { b, self, target, e } = setupBerserk(300, 350, 900, 900);
  self.hp = target.hp = 1e6;
  advance(b, Math.ceil(preset.params.awakenDuration * 120) + 5);
  assert.equal(e.mode, 'survive');
  advance(b, Math.ceil(preset.params.transformTime * 120) + 2);
  assert.equal(e.mode, 'cine', '타이머가 다시 차면 또 각성');
}

const drawCtx = new Proxy({}, { get: () => () => {} });
{
  const { b, self } = setup();
  types.berserk.draw(drawCtx, b.effects[0], self);
  advance(b, Math.ceil(preset.params.transformTime * 120));
  types.berserk.draw(drawCtx, b.effects[0], self);
  advance(b, CINE_FRAMES);
  types.berserk.draw(drawCtx, b.effects[0], self);
}

console.log('각성 폭주 능력 검사 통과: 평시 피해감소·빵, 시간 기반 변신 시작(빵 초기화 포함), 변신 중 중앙 이동·화면 흔들림, 각성 전환, 돌진 피해·파편·중복 방지, 돌진·후퇴 반복, 각성 종료 후 복귀, 반복 각성, 그리기 계약');
