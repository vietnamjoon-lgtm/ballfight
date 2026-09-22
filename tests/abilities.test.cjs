const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), assert = require('node:assert/strict');
const ctx = vm.createContext({});
for (const file of ['abilities.js', 'ability-packs.js', 'characters.js', 'engine.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), ctx);
const { Battle, copy } = ctx.ArenaEngine, types = ctx.ArenaAbilities;
function setup(slot = 0, offAxis = false) {
  const config = copy(ctx.ArenaDefaults);
  for (const f of config.characters) { f.abilities = []; f.contactDamage = 0; }
  const b = new Battle(config, ['blue', 'coral'], types), self = b.fighters[slot], target = b.fighters[1-slot];
  Object.assign(self, { x: 150, y: 350, vx: 0, vy: 0 }); Object.assign(target, { x: 450, y: 350, vx: 0, vy: 0 });
  types.nose.cast(b.api, self, target, copy(ctx.ArenaNosePreset.ability.params));
  if (offAxis) target.y = 520;
  b.start(); return { b, self, target };
}
function advance(b, n) { for (let i = 0; i < n; i++) b.step(1/120); }
for (const slot of [0,1]) {
  const { b, target } = setup(slot), hp = target.hp;
  advance(b, 4); assert.equal(target.hp, hp, '짧은 코는 아직 적중하지 않음');
  advance(b, 32); assert.equal(target.hp, hp-24, '양쪽 슬롯에서 정확히 한 번 적중');
  assert.equal(b.impactId, 1); assert.equal(b.impacts[0].amount, 24); assert.equal(b.wallHits.length, 0);
  const length = b.effects[0].length; b.pause(); advance(b, 10); assert.equal(b.effects[0].length, length);
  b.start(); advance(b, 25); assert.ok(b.effects[0].length < length, '회수 동작');
  advance(b, 40); assert.equal(b.effects.length, 0); assert.equal(target.hp, hp-24);
}
{
  const { b, target } = setup(), hp = target.hp, sounds = [];
  for (let i = 0; i < 36; i++) { b.step(1/120); sounds.push(...b.audioEvents.map(e => e.type)); }
  assert.equal(target.hp, hp - 24);
  assert.equal(sounds.filter(t => t === 'noseHit').length, 1, '코 적중은 소리 이벤트를 정확히 한 번 발생');
}
{ const { b, target } = setup(0,true), hp = target.hp; advance(b,100); assert.equal(target.hp,hp); assert.equal(b.impactId,0,'빗나감은 연출 없음'); }
{ const { b, target } = setup(); b.api.shield(target,{amount:50,duration:2}); advance(b,40); assert.equal(target.hp,target.maxHp); assert.equal(b.impacts[0].amount,0); assert.equal(b.impacts[0].absorbed,24); }
{ const { b, target } = setup(); b.damage(target,0); assert.equal(b.impactId,0); }
// Rendering contract can be exercised without a browser or audio output.
const drawCtx = new Proxy({}, { get: (_, key) => key === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {} });
{ const { b } = setup(); advance(b,20); types.nose.draw(drawCtx,b.effects[0]); }
// A new timed skill supplies its own tick and drawing without engine changes.
types.example = { fields:{}, cast(api,self){ api.effect('example',self,{ticks:0},.05); }, update(e){e.ticks++;}, draw(){} };
{ const { b, self } = setup(); types.example.cast(b.api,self); advance(b,2); assert.equal(b.effects.find(e=>e.type==='example').ticks,2); advance(b,10); assert.ok(!b.effects.some(e=>e.type==='example')); }
console.log('코 능력 검사 통과: 양쪽 슬롯, 실제 접촉, 1회 피해, 빗나감, 회수/만료, 일시정지, 보호막, 타격 이벤트, 독립 능력 확장');
