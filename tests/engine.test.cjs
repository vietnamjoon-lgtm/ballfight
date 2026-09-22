'use strict';
// 설치 없이 실행: node tests/engine.test.cjs
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), scope = vm.createContext({});
for (const file of ['abilities.js', 'characters.js', 'engine.js']) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), scope);
const { Battle, validate, copy, PAD, SIZE } = scope.ArenaEngine, types = scope.ArenaAbilities, defaults = scope.ArenaDefaults;
let seed = 913; const random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);
const make = (a = 'blue', b = 'coral', config = defaults) => new Battle(config, [a, b], types, random);
const tick = (b, seconds) => { for (let i = 0; i < Math.ceil(seconds * 120); i++) b.step(1 / 120); };
const tests = [];
function test(name, run) { run(); tests.push(name); }
test('기본 설정과 JSON 왕복', () => {
  assert.equal(validate(JSON.parse(JSON.stringify(defaults)), types).characters.length, 4);
  for (const mutate of [c => c.characters[0].hp = NaN, c => c.characters[0].speed = 9999, c => c.characters[0].abilities = ['missing'], c => c.abilities[0].type = '__proto__', c => c.abilities[0].params.count = 1.5, c => c.characters[0].image = 'https://example.com/image.png', c => c.characters.push(copy(c.characters[0]))]) {
    const config = copy(defaults); mutate(config); assert.throws(() => validate(config, types));
  }
});
test('벽 반사와 속도 유지', () => {
  const b = make(); b.start(); const f = b.fighters[0]; f.x = PAD + f.radius + .1; f.vx = -f.speed; f.vy = 0; b.step(1 / 120);
  assert.ok(f.vx > 0); assert.ok(f.x >= PAD + f.radius); assert.ok(Math.abs(Math.hypot(f.vx, f.vy) - f.speed) < 1e-8);
});
test('일시정지와 재개', () => { const b = make(); b.start(); tick(b, 1); const t = b.time; b.pause(); tick(b, 1); assert.equal(b.time, t); b.start(); tick(b, 1); assert.ok(b.time > t); });
test('동일 캐릭터의 양쪽 탄환 소유권과 쿨타임', () => {
  const b = make('blue', 'blue'); b.start(); tick(b, 3.19); assert.equal(b.eventId, 0); tick(b, .02);
  assert.equal(b.eventId, 2); assert.ok(b.shots.some(s => s.owner === 0)); assert.ok(b.shots.some(s => s.owner === 1));
  for (const f of b.fighters) { f.x = f.slot ? 550 : 150; f.y = 350; f.hp = f.maxHp; }
  b.shots = [];
  for (const f of b.fighters) { const target = b.fighters[1 - f.slot]; b.projectile(f, 0, { speed: 100, damage: 7, bounces: 0 }); Object.assign(b.shots.at(-1), { x: target.x, y: target.y, vx: 0, vy: 0 }); }
  b.step(1 / 120); assert.equal(b.fighters[0].hp, b.fighters[0].maxHp - 7); assert.equal(b.fighters[1].hp, b.fighters[1].maxHp - 7);
});
test('돌진은 슬롯과 무관하며 한 번만 추가 피해', () => {
  const b = make('coral', 'blue'); b.start(); const [a, other] = b.fighters; a.x = 350; a.y = 350; other.x = 395; other.y = 350;
  b.api.dash(a, other, { damage: 16, duration: .6, speed: 590 }); b.step(1 / 120); assert.equal(other.hp, other.maxHp - 21); assert.equal(a.dash.hit, true);
  b.contactTimer = 0; a.x = 350; a.y = 350; other.x = 395; other.y = 350; b.step(1 / 120); assert.equal(other.hp, other.maxHp - 26);
});
test('보호막 흡수, 만료와 회복 상한', () => {
  const b = make(), a = b.fighters[0]; b.api.shield(a, { amount: 20, duration: .5 }); b.damage(a, 12); assert.equal(a.hp, a.maxHp); assert.equal(a.shield, 8);
  b.damage(a, 18); assert.equal(a.hp, a.maxHp - 10); assert.equal(a.shield, 0); b.api.heal(a, 100); assert.equal(a.hp, a.maxHp);
  b.api.shield(a, { amount: 20, duration: .5 }); b.start(); tick(b, .6); assert.equal(a.shield, 0);
});
test('충격파의 범위와 회전 무기 적중', () => {
  const b = make(), [a, other] = b.fighters; a.x = 300; a.y = 350; other.x = 600; other.y = 350;
  types.pulse.cast(b.api, a, other, { damage: 14, range: 100 }); assert.equal(other.hp, other.maxHp);
  other.x = 400; types.pulse.cast(b.api, a, other, { damage: 14, range: 100 }); assert.equal(other.hp, other.maxHp - 14);
  b.api.orbit(a, { damage: 8, count: 1, range: 100, duration: 3, speed: 4 }); b.start(); b.step(1 / 120); assert.equal(other.hp, other.maxHp - 22);
  const hp = other.hp; b.step(1 / 120); assert.equal(other.hp, hp);
});
test('새 능력 동작과 새 캐릭터는 엔진 변경 없이 작동', () => {
  const customTypes = { ...types, custom: { label: '테스트', description: '새 동작', fields: {}, cast(api, self, target) { api.damage(target, 9, self); } } };
  const c = copy(defaults); c.abilities.push({ id: 'custom_skill', name: '사용자 능력', type: 'custom', cooldown: .5, params: {} });
  c.characters.push({ ...copy(c.characters[0]), id: 'new_hero', name: '새 캐릭터', abilities: ['custom_skill'] });
  const b = new Battle(c, ['new_hero', 'coral'], customTypes, random); b.start(); b.fighters[0].x = 100; b.fighters[1].x = 600; tick(b, .51); assert.equal(b.fighters[1].hp, b.fighters[1].maxHp - 9);
});
test('모든 기본 대진 160경기: 유한한 좌표·체력·벽 경계·경기 종료', () => {
  for (const a of defaults.characters) for (const c of defaults.characters) for (let match = 0; match < 10; match++) {
    const b = make(a.id, c.id); b.start(); let steps = 0;
    while (b.state === 'running' && steps++ < 14402) {
      b.step(1 / 120);
      for (const f of b.fighters) { assert.ok([f.x, f.y, f.vx, f.vy, f.hp].every(Number.isFinite)); assert.ok(f.hp >= 0 && f.hp <= f.maxHp); assert.ok(f.x >= PAD + f.radius - .001 && f.x <= SIZE - PAD - f.radius + .001); assert.ok(f.y >= PAD + f.radius - .001 && f.y <= SIZE - PAD - f.radius + .001); }
    }
    assert.equal(b.state, 'ended');
  }
});
test('공격 없는 회복 캐릭터도 제한 시간에 판정', () => {
  const c = copy(defaults); c.characters = [{ ...c.characters[0], id: 'peace', hp: 1000, contactDamage: 0, abilities: ['recover'] }]; c.abilities.find(a => a.id === 'recover').params.amount = 100; c.abilities.find(a => a.id === 'recover').cooldown = .3;
  const b = make('peace', 'peace', c); b.start(); tick(b, 121); assert.equal(b.state, 'ended'); assert.ok(b.time <= 120.01);
});
console.log(`${tests.length}개 검사 통과\n` + tests.map(name => '✓ ' + name).join('\n'));
