const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
let played = 0, sampleStarts = 0;
class AudioMock {
  constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; this.sampleRate = 8000; }
  createOscillator() { return { frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {}, start() { played++; }, stop() {} }; }
  createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
  createBuffer(channels, length) { return { getChannelData: () => new Float32Array(length) }; }
  createBufferSource() { return { buffer: null, loop: false, loopStart: 0, loopEnd: 0, onended: null, connect() {}, disconnect() {}, start() { sampleStarts++; }, stop() {} }; }
  createBiquadFilter() { return { frequency: { setValueAtTime() {} }, connect() {}, disconnect() {} }; }
  decodeAudioData() { return Promise.resolve({ duration: 2 }); }
}
const scope = vm.createContext({ AudioContext: AudioMock, atob: str => Buffer.from(str, 'base64').toString('binary') });
for (const name of ['abilities.js', 'characters.js', 'engine.js', 'media.js', 'sound.js']) vm.runInContext(fs.readFileSync(path.join(root, name), 'utf8'), scope);
const { Battle, PAD } = scope.ArenaEngine;
const battle = new Battle(scope.ArenaDefaults, ['blue', 'coral']);
const f = battle.fighters[0];
f.x = f.y = PAD + f.radius; f.vx = f.vy = -185; battle.wall(f);
assert.equal(battle.wallHits.length, 1, '모서리는 한 번만 발음');
battle.wallHits = []; battle.wall(f); assert.equal(battle.wallHits.length, 0, '안쪽으로 이동 중인 경계 접촉은 무음');
battle.wall({ x: PAD, y: 200, vx: -100, vy: 0, radius: 5 }); assert.equal(battle.wallHits.length, 0, '탄환은 무음');
battle.damage(f, 10); assert.equal(battle.wallHits.length, 0, '피격은 무음');
battle.wallHits.push({ slot: 0 }); battle.pause(); battle.step(1 / 120); assert.equal(battle.wallHits.length, 0, '정지 중 이벤트 잔여 없음');

(async () => {
  const sound = new scope.ArenaWallSound();
  sound.hit(0); assert.equal(played, 0, '시작 전 무음');
  sound.unlock();
  await sound.loading;
  assert.ok(sound.samples.missile, '임베드된 미사일 샘플 로드');
  assert.ok(sound.samples.punch, '임베드된 충돌음 샘플 로드');
  assert.ok(sound.samples.sword, '임베드된 코 타격음 샘플 로드');
  assert.ok(sound.samples.tick, '임베드된 카운트다운 틱 샘플 로드');
  sound.hit(0); assert.equal(played, 1);
  sound.hit(0); assert.equal(played, 1, '중복 연속 충돌 제한');
  sound.hit(1); assert.equal(played, 2, '서로 다른 두 캐릭터는 각각 발음');
  sound.context.currentTime = .1; sound.enabled = false; sound.hit(0); assert.equal(played, 2, '음소거');
  sound.enabled = true; sound.context.state = 'suspended'; sound.hit(0); assert.equal(played, 2, '중단된 오디오는 큐에 쌓지 않음');
  sound.context.state = 'running'; sound.hit(0); assert.equal(played, 3);

  sound.play('remoteClick'); assert.equal(played, 4, '리모컨 클릭음은 합성음');
  assert.equal(sampleStarts, 0, '아직 샘플 기반 소리 없음');

  sound.play('missileLaunch'); assert.equal(sampleStarts, 1, '발사·비행음은 임베드 샘플 루프 재생'); assert.ok(sound.flight, '비행 루프 시작');
  sound.play('missileLaunch'); assert.equal(sampleStarts, 1, '비행 중에는 겹쳐서 재생하지 않음');
  sound.play('missileExplosion'); assert.equal(sampleStarts, 2, '폭발음은 샘플 뒷부분 한 번 재생'); assert.equal(sound.voices.size, 1);
  sound.play('missileExplosion'); assert.equal(sampleStarts, 3); assert.equal(sound.voices.size, 2, '동시 폭발은 각각 재생');

  sound.play('bump'); assert.equal(sampleStarts, 4, '캐릭터 충돌음은 샘플 한 번 재생'); assert.equal(sound.voices.size, 3);
  sound.play('noseHit'); assert.equal(sampleStarts, 5, '코 타격음은 샘플 한 번 재생'); assert.equal(sound.voices.size, 4);
  sound.play('countdownTick'); assert.equal(sampleStarts, 6, '카운트다운 틱은 샘플 한 번 재생'); assert.equal(sound.voices.size, 5);

  sound.enabled = false;
  sound.play('missileLaunch'); sound.play('missileExplosion'); sound.play('countdownTick'); sound.play('remoteClick'); sound.play('bump'); sound.play('noseHit');
  assert.equal(played, 4, '음소거 중 합성음 없음'); assert.equal(sampleStarts, 6, '음소거 중 샘플 재생 없음');
  sound.enabled = true;
  sound.play('unknown'); assert.equal(played, 4, '알 수 없는 종류는 무시'); assert.equal(sampleStarts, 6);

  sound.setFlight(false); assert.equal(sound.flight, null);
  sound.setFlight(true); const flight = sound.flight; assert.ok(flight); assert.equal(sampleStarts, 7);
  sound.setFlight(true); assert.equal(sound.flight, flight); assert.equal(sampleStarts, 7, '반복 프레임에서 비행음 중첩 금지');
  sound.setFlight(false); assert.equal(sound.flight, null);
  sound.setFlight(true); assert.ok(sound.flight); sound.enabled = false; sound.setFlight(true); assert.equal(sound.flight, null, '음소거에서 루프 정리');
  sound.enabled = true; sound.context.state = 'suspended'; sound.setFlight(true); assert.equal(sound.flight, null);
  sound.context.state = 'running'; sound.setFlight(true); assert.ok(sound.flight); sound.setFlight(false); assert.equal(sound.flight, null, '종료/정지에서 정리');

  sound.setFlight(true); sound.play('missileExplosion');
  const startsBeforeStop = sampleStarts;
  sound.stopSamples(); assert.equal(sound.flight, null, 'stopSamples는 비행음도 정리'); assert.equal(sound.voices.size, 0, 'stopSamples는 대기 중인 폭발 목소리도 정리');
  assert.equal(sampleStarts, startsBeforeStop, 'stopSamples 자체는 새로 재생하지 않음');

  console.log('소리 검사 통과: 벽 전용 충돌 이벤트, 발사음·비행음·폭발음·충돌음·코타격음·카운트다운 틱 샘플 재생, 합성 클릭음, 음소거, 시작 전 무음과 재개, 정리. 실제 청취 검사는 아님.');
})();
