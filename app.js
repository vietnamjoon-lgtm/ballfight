(function () {
  'use strict';
  const $ = id => document.getElementById(id), { Battle, validate, copy, SIZE, PAD } = ArenaEngine;
  const KEY = 'bounce.roster.v1', types = ArenaAbilities, canvas = $('canvas'), ctx = canvas.getContext('2d');
  let data = validate(ArenaDefaults, types), battle, accumulator = 0, last = 0, lastEvent = -1;
  let editingCharacter = '', editingAbility = '', draftImage = '', draftImage2 = '', imageVersion = 0, pendingImport = null;
  let countdown = null, lastCount = 0;
  let feedback = [], lastImpact = 0, shake = 0, tint = 0, effectsEnabled = !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const images = new Map(), images2 = new Map(), wallSound = new ArenaWallSound();
  function message(text, error = false) { $('save-status').textContent = text; $('save-status').style.color = error ? '#b02020' : '#246c31'; }
  let loadedStored = false;
  try { const stored = localStorage.getItem(KEY); if (stored) { data = validate(JSON.parse(stored), types); loadedStored = true; } }
  catch { message('저장된 설정을 읽지 못해 기본 캐릭터를 불러왔습니다. 기존 저장 내용은 아직 덮어쓰지 않았습니다.', true); }
  // Update unchanged old defaults once, preserving user-created/edited stats.
  try {
    const migrationKey = 'bounce.base-stats-200.v1';
    if (!localStorage.getItem(migrationKey)) {
      const previous = { blue: [100,185], coral: [110,185], mint: [100,160], violet: [100,175], pack_nose_demo_v1: [250,185] };
      for (const c of data.characters) {
        const old = Object.prototype.hasOwnProperty.call(previous, c.id) ? previous[c.id] : null;
        if (!old) continue;
        if (c.hp === old[0]) c.hp = 200;
        if (c.speed === old[1]) c.speed = 200;
      }
      if (loadedStored) localStorage.setItem(KEY, JSON.stringify(data));
      localStorage.setItem(migrationKey, '1');
    }
  } catch { /* The updated defaults still apply to this session if storage is unavailable. */ }
  function installNose(config) {
    const preset = ArenaNosePreset;
    if (!config.abilities.some(a => a.id === preset.ability.id) && config.abilities.length < 200) config.abilities.push(copy(preset.ability));
    if (!config.characters.some(c => c.id === preset.character.id) && config.characters.length < 100 && config.abilities.some(a => a.id === preset.ability.id)) config.characters.push(copy(preset.character));
    return validate(config, types);
  }
  data = installNose(data);
  if (!data.abilities.some(a => a.id === ArenaMissilePreset.id) && data.abilities.length < 200) data.abilities.push(copy(ArenaMissilePreset));
  if (!data.abilities.some(a => a.id === ArenaFartPreset.id) && data.abilities.length < 200) data.abilities.push(copy(ArenaFartPreset));
  if (!data.abilities.some(a => a.id === ArenaOrbPreset.id) && data.abilities.length < 200) data.abilities.push(copy(ArenaOrbPreset));
  if (!data.abilities.some(a => a.id === ArenaAskFightPreset.id) && data.abilities.length < 200) data.abilities.push(copy(ArenaAskFightPreset));
  if (!data.abilities.some(a => a.id === ArenaBerserkPreset.id) && data.abilities.length < 200) data.abilities.push(copy(ArenaBerserkPreset));
  if (!data.abilities.some(a => a.id === ArenaSpikeGuardPreset.id) && data.abilities.length < 200) data.abilities.push(copy(ArenaSpikeGuardPreset));
  data = validate(data, types);
  // Upgrade only the previous missile default; retain custom damage values.
  try {
    const key = 'bounce.missile-power-55.v1';
    if (!localStorage.getItem(key)) {
      for (const ability of data.abilities) if (ability.type === 'moneyMissile' && ability.params.damage === 35) ability.params.damage = 55;
      if (loadedStored) localStorage.setItem(KEY, JSON.stringify(data));
      localStorage.setItem(key, '1');
    }
  } catch { /* Session still uses the stronger default when persistence is unavailable. */ }
  try {
    const key = 'bounce.speed-300-sample-missile.v1';
    if (!localStorage.getItem(key)) {
      const builtin = new Set([...ArenaDefaults.characters.map(c => c.id), ArenaNosePreset.character.id]);
      for (const c of data.characters) if (builtin.has(c.id) && c.speed === 200) c.speed = 300;
      for (const a of data.abilities) if (a.type === 'moneyMissile') {
        if (a.params.speed === 360) a.params.speed = 800;
        if (a.params.turnRate === 5) a.params.turnRate = 9;
      }
      if (loadedStored) localStorage.setItem(KEY, JSON.stringify(data));
      localStorage.setItem(key, '1');
    }
  } catch { /* Apply session defaults even if storage is unavailable. */ }
  function option(value, text) { const el = document.createElement('option'); el.value = value; el.textContent = text; return el; }
  function fillSelect(el, records, value, placeholder = '') {
    el.replaceChildren(); if (placeholder) el.append(option('', placeholder));
    for (const item of records) el.append(option(item.id, item.name));
    el.value = records.some(c => c.id === value) ? value : placeholder ? '' : records[0]?.id || '';
  }
  function refreshLists(preferredCharacter) {
    const old = [$('pick0').value, $('pick1').value];
    fillSelect($('pick0'), data.characters, preferredCharacter || old[0] || data.characters[0].id);
    fillSelect($('pick1'), data.characters, old[1] || data.characters[1]?.id || data.characters[0].id);
    fillSelect($('character-list'), data.characters, editingCharacter, '새 캐릭터');
    fillSelect($('ability-list'), data.abilities, editingAbility, '새 능력');
    const checked = [...$('character-abilities').querySelectorAll('input:checked')].map(el => el.value);
    renderAbilityChecks(checked);
    images.clear(); for (const c of data.characters) if (c.image) { const img = new Image(); img.src = c.image; images.set(c.id, img); }
    images2.clear(); for (const c of data.characters) if (c.image2) { const img = new Image(); img.src = c.image2; images2.set(c.id, img); }
  }
  function persist(next, preferredCharacter) {
    const clean = validate(next, types); data = clean;
    let stored = true; try { localStorage.setItem(KEY, JSON.stringify(clean)); } catch { stored = false; }
    refreshLists(preferredCharacter); reset();
    message(stored ? '저장 완료. 새 경기에서 바로 사용할 수 있어요.' : '게임에는 적용됐지만 브라우저에 저장하지 못했습니다. 설정 파일을 내보내서 보관하세요.', !stored);
  }
  function reset() {
    wallSound.stopSamples();
    countdown = null; lastCount = 0; $('countdown').hidden = true;
    battle = new Battle(data, [$('pick0').value, $('pick1').value]); accumulator = 0; lastEvent = -1; feedback = []; lastImpact = 0; shake = tint = 0;
    $('overlay').hidden = false; $('headline').textContent = '준비됐어?';
    $('subtitle').textContent = battle.fighters.map(f => f.name).join(' vs ');
    $('start').textContent = '대전 시작 ↗'; $('pause').disabled = true; $('pause').textContent = '일시정지';
    $('event').textContent = '대기 중 · 대전 시작을 누르세요.'; $('battle-log').replaceChildren();
    for (const f of battle.fighters) {
      $('card' + f.slot).style.setProperty('--c', f.color); const host = $('skills' + f.slot); host.replaceChildren();
      if (!f.skills.length) { const text = document.createElement('p'); text.className = 'empty-skill'; text.textContent = '장착 능력 없음 · 접촉으로 공격'; host.append(text); }
      f.skills.forEach((skill, i) => {
        const label = document.createElement('div'); label.className = 'skill-label';
        const name = document.createElement('span'); name.textContent = skill.name;
        const remaining = document.createElement('span'); remaining.id = `cd-${f.slot}-${i}`; label.append(name, remaining);
        const bar = document.createElement('div'); bar.className = 'bar cooldown';
        const fill = document.createElement('div'); fill.className = 'fill'; fill.id = `skill-${f.slot}-${i}`; bar.append(fill); host.append(label, bar);
      });
    }
    updateUI(); draw();
  }
  function updateUI() {
    $('clock').textContent = `${String(Math.floor(battle.time / 60)).padStart(2, '0')}:${String(Math.floor(battle.time % 60)).padStart(2, '0')}`;
    $('battle-state').textContent = countdown ? (countdown.paused ? 'PAUSED' : 'GET READY') : battle.state === 'paused' ? 'PAUSED' : battle.state === 'ready' ? 'READY' : battle.state === 'ended' ? 'FINISHED' : battle.time > 60 ? 'SUDDEN DEATH' : 'LIVE ARENA';
    for (const f of battle.fighters) {
      $('hp' + f.slot).textContent = `${Math.ceil(f.hp)} / ${f.maxHp}`;
      $('health' + f.slot).style.width = (f.hp / f.maxHp * 100) + '%';
      $('shield' + f.slot).textContent = f.shield > 0 ? ` · 보호막 ${Math.ceil(f.shield)}` : '';
      f.skills.forEach((skill, i) => {
        const status = types[skill.type].status?.(f, skill);
        $(`cd-${f.slot}-${i}`).textContent = status ? status.label : Math.max(0, skill.remaining).toFixed(1) + 's';
        $(`skill-${f.slot}-${i}`).style.width = Math.max(0, Math.min(100, (status ? status.progress : 1 - skill.remaining / skill.cooldown) * 100)) + '%';
      });
    }
    if (lastEvent !== battle.eventId) {
      lastEvent = battle.eventId; $('battle-log').replaceChildren();
      for (const event of battle.events) { const li = document.createElement('li'); li.textContent = `${event.time.toFixed(1)}s · ${event.text}`; $('battle-log').append(li); }
      if (battle.events[0]) $('event').textContent = battle.events[0].text;
    }
    if (battle.state === 'ended') {
      $('overlay').hidden = false; $('headline').textContent = battle.winner === null ? '무승부!' : `${battle.fighters[battle.winner].name} 승리!`;
      $('subtitle').textContent = `${battle.time.toFixed(1)}초의 결투${battle.time >= 120 ? ' · 체력 비율 판정' : ''}`;
      $('start').textContent = '다시 대전 ↗'; $('pause').disabled = true;
    }
  }
  function circle(x, y, r, color) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); }
  function draw() {
    ctx.clearRect(0, 0, SIZE, SIZE); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, SIZE, SIZE); ctx.textAlign = 'center';
    ctx.save();
    if (effectsEnabled && shake > 0) { const strength = shake * 34; ctx.translate(Math.sin(last * .09) * strength, Math.cos(last * .11) * strength); }
    ctx.lineWidth = 5; ctx.strokeStyle = '#111'; ctx.strokeRect(PAD - 2, PAD - 2, SIZE - PAD * 2 + 4, SIZE - PAD * 2 + 4);
    for (const ring of battle.rings) { ctx.globalAlpha = ring.life / .45; ctx.strokeStyle = ring.color; ctx.beginPath(); ctx.arc(ring.x, ring.y, ring.from + (ring.range - ring.from) * (1 - ring.life / .45), 0, Math.PI * 2); ctx.stroke(); }
    ctx.globalAlpha = 1;
        globalThis.ArenaDrawGas?.(ctx, battle);
    for (const f of battle.fighters) {
      if (f.dash) { f.trail.forEach((p, i) => { ctx.globalAlpha = i / f.trail.length * .2; circle(p.x, p.y, f.radius * i / f.trail.length, f.color); }); } ctx.globalAlpha = 1;
      ctx.save();
ctx.translate(0, globalThis.Arena67BodyOffset?.(f, battle) || 0);
      const fx = ArenaPortraitFx(f, types);
      if (effectsEnabled) ctx.translate(fx.dx, fx.dy);
      circle(f.x, f.y, f.radius, f.flash > 0 && effectsEnabled ? '#ff7777' : f.color);
      if (ArenaDrawPortrait(ctx, f, fx, images.get(f.id), images2.get(f.id), f.radius - 2, effectsEnabled)) {
        if (f.flash > 0 && effectsEnabled) { ctx.globalAlpha = .6 * f.flash / .22; circle(f.x, f.y, f.radius, '#ff2222'); ctx.globalAlpha = 1; }
      } else {
        const other = battle.fighters[1 - f.slot], angle = (countdown ? countdown.angle(f.slot) : Math.atan2(other.y - f.y, other.x - f.x)) + f.facing;
        for (const offset of [-f.radius * .2, f.radius * .2]) circle(f.x + Math.cos(angle) * f.radius * .35 - Math.sin(angle) * offset, f.y + Math.sin(angle) * f.radius * .35 + Math.cos(angle) * offset, Math.max(2, f.radius / 8), '#122031');
      }
      ctx.strokeStyle = f.shield > 0 ? '#3fa9f5' : '#222'; ctx.lineWidth = f.shield > 0 ? 3 : 2; ctx.beginPath(); ctx.arc(f.x, f.y, f.radius + (f.shield > 0 ? 7 : 1), 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    if (countdown) {
      for (const f of battle.fighters) {
        ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(countdown.angle(f.slot));
        ctx.strokeStyle = '#222'; ctx.fillStyle = f.color; ctx.lineWidth = 3; ctx.lineJoin = 'round';
        const base = f.radius + 10, tip = base + 46;
        ctx.beginPath(); ctx.moveTo(base, -5); ctx.lineTo(tip - 17, -5); ctx.lineTo(tip - 17, -14); ctx.lineTo(tip, 0); ctx.lineTo(tip - 17, 14); ctx.lineTo(tip - 17, 5); ctx.lineTo(base, 5); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
      }
    }
    // Per-ability drawing lives alongside that ability's logic.
    ctx.save(); ctx.beginPath(); ctx.rect(PAD, PAD, SIZE - PAD * 2, SIZE - PAD * 2); ctx.clip();
    for (const effect of battle.effects) {
      const drawEffect = types[effect.type].draw;
      if (drawEffect) { ctx.save(); drawEffect(ctx, effect, battle.fighters[effect.owner], battle.fighters[1 - effect.owner]); ctx.restore(); }
    }
    ctx.restore();
    for (const o of battle.orbits) { const owner = battle.fighters[o.owner]; ctx.strokeStyle = owner.color + '55'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(owner.x, owner.y, o.range, 0, Math.PI * 2); ctx.stroke(); ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.angle + Math.PI / 4); ctx.fillStyle = owner.color; ctx.fillRect(-8, -8, 16, 16); ctx.restore(); }
    for (const s of battle.shots) { ctx.shadowColor = s.color; ctx.shadowBlur = 12; circle(s.x, s.y, s.radius, s.color); } ctx.shadowBlur = 0;
    for (const p of battle.particles) { ctx.globalAlpha = p.life / .4; circle(p.x, p.y, 2.5, p.color); } ctx.globalAlpha = 1;
    if (effectsEnabled) drawFeedback();
    ctx.restore();
    if (effectsEnabled && tint > 0) { ctx.fillStyle = `rgba(230, 20, 20, ${tint * .6})`; ctx.fillRect(PAD, PAD, SIZE - PAD * 2, SIZE - PAD * 2); }
  }
  function drawFeedback() {
    for (const hit of feedback) {
      const t = 1 - hit.life / .55, r = 12 + t * 35;
      if (hit.kind === 'explosion') {
        ctx.save(); ctx.globalAlpha = Math.max(0, 1 - t);
        const radius = 20 + t * 95;
        ctx.fillStyle = t < .3 ? '#fff2aa' : '#ff962b'; circle(hit.x, hit.y, radius * .6, ctx.fillStyle);
        ctx.strokeStyle = '#ed5f22'; ctx.lineWidth = 9 * (1 - t) + 1; ctx.beginPath(); ctx.arc(hit.x, hit.y, radius, 0, Math.PI * 2); ctx.stroke();
        for (let i = 0; i < 9; i++) { const angle = i * Math.PI * 2 / 9; circle(hit.x + Math.cos(angle) * radius, hit.y + Math.sin(angle) * radius, 4 + t * 9, i % 2 ? '#ffb039' : '#7b736c'); }
        ctx.restore();
      }
      ctx.globalAlpha = Math.max(0, 1 - t); ctx.strokeStyle = hit.amount > 0 ? '#e9362c' : '#b99d30'; ctx.lineWidth = 3;
      for (let i = 0; i < 8; i++) { const angle = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(hit.x + Math.cos(angle) * r, hit.y + Math.sin(angle) * r); ctx.lineTo(hit.x + Math.cos(angle) * (r + 12), hit.y + Math.sin(angle) * (r + 12)); ctx.stroke(); }
      ctx.font = '900 23px Arial'; ctx.fillStyle = hit.amount > 0 ? '#d82020' : '#887020';
      ctx.fillText(hit.amount > 0 ? '-' + Math.ceil(hit.amount) : '방어', hit.x, hit.y - 35 - t * 38);
    }
    ctx.globalAlpha = 1;
  }
  function frame(now) {
    wallSound.setRate(Number($('speed').value));
    const dt = last ? Math.min((now - last) / 1000, .05) : 0; last = now;
    if (countdown) {
      countdown.update(dt);
      if (lastCount !== countdown.number) {
        lastCount = countdown.number; $('countdown-number').textContent = String(lastCount);
        $('event').textContent = `${lastCount} · 출발 방향을 정합니다.`;
      }
      if (countdown.done) {
        countdown = null; $('countdown').hidden = true; accumulator = 0;
        battle.start(); $('event').textContent = '시작!';
      }
      updateUI();
    } else if (battle.state === 'running') { accumulator += dt * Number($('speed').value); while (accumulator >= 1 / 120 && battle.state === 'running') { battle.step(1 / 120); for (const hit of battle.wallHits) wallSound.hit(hit.slot); for (const event of battle.audioEvents) { wallSound.play(event.type); if (effectsEnabled && event.type === 'missileLaunch') shake = Math.max(shake, .2); } if (effectsEnabled) shake = Math.max(shake, battle.shakeRequest); accumulator -= 1 / 120; } updateUI(); }
    shake = Math.max(0, shake - dt); tint = Math.max(0, tint - dt);
    feedback.forEach(hit => hit.life -= dt); feedback = feedback.filter(hit => hit.life > 0);
    if (battle.impactId > lastImpact) {
      for (const hit of battle.impacts.filter(hit => hit.id > lastImpact)) {
        if (effectsEnabled) { feedback.push({ ...hit, life: .55 }); shake = Math.max(shake, hit.kind === 'explosion' ? 1.3 : .06 + hit.power * .1); if (hit.amount > 0) tint = Math.max(tint, hit.kind === 'explosion' ? .17 : .12); }
      }
      lastImpact = battle.impactId;
    }
    wallSound.setFlight(battle.state === 'running' && battle.effects.some(e => e.type === 'moneyMissile' && e.missiles.length > 0));
    draw(); requestAnimationFrame(frame);
  }
  function pause() { if (countdown) { countdown.paused = !countdown.paused; $('pause').textContent = countdown.paused ? '계속하기' : '일시정지'; updateUI(); return; } if (battle.state === 'running') { battle.pause(); wallSound.stopSamples(); $('pause').textContent = '계속하기'; } else if (battle.state === 'paused') { wallSound.unlock(); battle.start(); $('pause').textContent = '일시정지'; } updateUI(); }
  function editor(open) {
    $('editor').hidden = !open; $('toggle-editor').setAttribute('aria-expanded', String(open));
    if (open) { if (battle.state === 'running' || (countdown && !countdown.paused)) pause(); $('editor').scrollIntoView({ behavior: 'smooth', block: 'start' }); } else $('toggle-editor').focus();
  }
  function renderAbilityChecks(selected = []) {
    const host = $('character-abilities'); host.replaceChildren();
    if (!data.abilities.length) host.textContent = '먼저 능력을 만들어 주세요.';
    for (const a of data.abilities) { const label = document.createElement('label'), input = document.createElement('input'); input.type = 'checkbox'; input.value = a.id; input.checked = selected.includes(a.id); label.append(input, document.createTextNode(`${a.name} · ${types[a.type].trigger === 'pickup' ? '돈 ' + a.params.required + '개' : a.cooldown + '초'}`)); host.append(label); }
  }
  function abilityFields(values = {}) {
    const type = types[$('ability-type').value]; $('type-description').textContent = type.description;
    $('cooldown-field').hidden = type.trigger === 'pickup'; $('ability-cooldown').disabled = type.trigger === 'pickup';
    $('ability-params').replaceChildren();
    for (const [key, field] of Object.entries(type.fields)) {
      const label = document.createElement('label'); label.textContent = field.label;
      const input = document.createElement('input'); Object.assign(input, { type: 'number', id: 'param-' + key, min: field.min, max: field.max, step: field.step, value: values[key] ?? field.default, required: true });
      label.append(input); $('ability-params').append(label);
    }
  }
  function loadAbility(id) {
    editingAbility = id; $('ability-list').value = id;
    const a = data.abilities.find(a => a.id === id); $('ability-name').value = a?.name || ''; $('ability-type').value = a?.type || 'projectile'; $('ability-cooldown').value = a?.cooldown || 3; abilityFields(a?.params);
  }
  function portrait() { $('portrait').style.background = $('character-color').value; $('portrait').replaceChildren(); if (draftImage) { const img = new Image(); img.src = draftImage; img.alt = ''; $('portrait').append(img); } }
  function portrait2() { $('portrait2').style.background = $('character-color').value; $('portrait2').replaceChildren(); if (draftImage2) { const img = new Image(); img.src = draftImage2; img.alt = ''; $('portrait2').append(img); } }
  function loadCharacter(id) {
    imageVersion++; editingCharacter = id; $('character-list').value = id;
    const c = data.characters.find(c => c.id === id);
    for (const [field, value] of Object.entries({ name: c?.name || '', color: c?.color || '#ffc56e', hp: c?.hp ?? 200, speed: c?.speed ?? 300, radius: c?.radius ?? 42, contact: c?.contactDamage ?? 5 })) $('character-' + field).value = value;
    draftImage = c?.image || ''; $('character-image').value = ''; draftImage2 = c?.image2 || ''; $('character-image2').value = ''; renderAbilityChecks(c?.abilities || []); portrait(); portrait2();
  }
  function uid(prefix) { return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9); }
  $('ability-form').onsubmit = event => {
    event.preventDefault();
    try {
      const next = copy(data), type = $('ability-type').value, params = {};
      for (const key of Object.keys(types[type].fields)) params[key] = Number($('param-' + key).value);
      const a = { id: editingAbility || uid('ability'), name: $('ability-name').value.trim(), type, cooldown: Number($('ability-cooldown').value), params };
      const index = next.abilities.findIndex(item => item.id === a.id); if (index < 0) next.abilities.push(a); else next.abilities[index] = a;
      validate(next, types); editingAbility = a.id; persist(next); loadAbility(a.id);
    } catch (error) { message(error.message, true); }
  };
  $('character-form').onsubmit = event => {
    event.preventDefault();
    try {
      const next = copy(data), c = { id: editingCharacter || uid('character'), name: $('character-name').value.trim(), color: $('character-color').value, image: draftImage, image2: draftImage2,
        hp: Number($('character-hp').value), speed: Number($('character-speed').value), radius: Number($('character-radius').value), contactDamage: Number($('character-contact').value), abilities: [...$('character-abilities').querySelectorAll('input:checked')].map(el => el.value) };
      const index = next.characters.findIndex(item => item.id === c.id); if (index < 0) next.characters.push(c); else next.characters[index] = c;
      validate(next, types); editingCharacter = c.id; persist(next, c.id); loadCharacter(c.id);
    } catch (error) { message(error.message, true); }
  };
  $('character-image').onchange = async event => {
    const file = event.target.files[0]; if (!file) return;
    const version = ++imageVersion;
    try {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 1024 * 1024) throw Error('1MB 이하의 PNG·JPG·WebP 파일을 선택하세요.');
      const url = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(Error('사진을 읽지 못했습니다.')); reader.readAsDataURL(file); });
      const img = new Image(); img.src = url; await img.decode(); if (version !== imageVersion) return;
      // 저장 용량을 줄이기 위해 원형 초상화에 필요한 크기로 축소합니다.
      const thumb = document.createElement('canvas'); thumb.width = thumb.height = 160; const side = Math.min(img.naturalWidth, img.naturalHeight);
      thumb.getContext('2d').drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 160, 160);
      draftImage = thumb.toDataURL('image/png'); portrait(); message('사진을 적용했습니다. 캐릭터 저장을 눌러 주세요.');
    } catch (error) { if (version === imageVersion) message(error.message, true); }
  };
  $('clear-image').onclick = () => { imageVersion++; draftImage = ''; $('character-image').value = ''; portrait(); };
  $('character-image2').onchange = async event => {
    const file = event.target.files[0]; if (!file) return;
    const version = ++imageVersion;
    try {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 1024 * 1024) throw Error('1MB 이하의 PNG·JPG·WebP 파일을 선택하세요.');
      const url = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(Error('사진을 읽지 못했습니다.')); reader.readAsDataURL(file); });
      const img = new Image(); img.src = url; await img.decode(); if (version !== imageVersion) return;
      const thumb = document.createElement('canvas'); thumb.width = thumb.height = 160; const side = Math.min(img.naturalWidth, img.naturalHeight);
      thumb.getContext('2d').drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 160, 160);
      draftImage2 = thumb.toDataURL('image/png'); portrait2(); message('각성 사진을 적용했습니다. 캐릭터 저장을 눌러 주세요.');
    } catch (error) { if (version === imageVersion) message(error.message, true); }
  };
  $('clear-image2').onclick = () => { imageVersion++; draftImage2 = ''; $('character-image2').value = ''; portrait2(); };
  $('character-color').oninput = () => { portrait(); portrait2(); };
  function download(text, name, type) { const url = URL.createObjectURL(new Blob([text], { type })), a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  $('export').onclick = () => { download(JSON.stringify(data, null, 2), 'bounce-roster.json', 'application/json'); message('저장된 설정을 내보냈습니다. 편집 중인 내용은 먼저 저장해 주세요.'); };
  $('export-defaults').onclick = () => { download('/* 게임의 기본 캐릭터 설정 */\nglobalThis.ArenaDefaults = ' + JSON.stringify(data, null, 2) + ';\n', 'characters.js', 'text/javascript'); message('공유용 characters.js를 내보냈습니다. 게임 폴더의 같은 이름 파일을 교체하면 새 방문자에게 이 캐릭터가 표시됩니다.'); };
  $('import').onchange = async event => {
    const file = event.target.files[0]; if (!file) return;
    pendingImport = null; $('import-preview').hidden = true;
    try {
      if (file.size > 8 * 1024 * 1024) throw Error('설정 파일은 8MB 이하여야 합니다.');
      pendingImport = validate(JSON.parse(await file.text()), types);
      $('import-summary').textContent = `캐릭터 ${pendingImport.characters.length}개, 능력 ${pendingImport.abilities.length}개를 읽었습니다. 적용하면 현재 보관함이 이 설정으로 교체됩니다. 필요하면 먼저 현재 설정을 내보내세요.`;
      $('import-preview').hidden = false; message('파일 검증 완료. 아래 교체 버튼을 누르면 적용됩니다.');
    } catch (error) { message('불러오기 실패: ' + error.message, true); } finally { $('import').value = ''; }
  };
  $('apply-import').onclick = () => { if (!pendingImport) return; const next = pendingImport; pendingImport = null; editingCharacter = editingAbility = ''; persist(next); loadCharacter(data.characters[0].id); loadAbility(data.abilities[0]?.id || ''); $('import-preview').hidden = true; };
  $('cancel-import').onclick = () => { pendingImport = null; $('import-preview').hidden = true; message('불러오기를 취소했습니다.'); };
  function effectsLabel() { $('effects').setAttribute('aria-pressed', String(effectsEnabled)); $('effects').textContent = effectsEnabled ? '타격 연출 켜짐' : '타격 연출 꺼짐'; }
  effectsLabel();
  $('effects').onclick = () => { effectsEnabled = !effectsEnabled; feedback = []; shake = tint = 0; effectsLabel(); };
  $('sound').onclick = () => { wallSound.enabled = !wallSound.enabled; $('sound').setAttribute('aria-pressed', String(wallSound.enabled)); $('sound').textContent = wallSound.enabled ? '소리 켜짐' : '소리 꺼짐'; if (wallSound.enabled) wallSound.unlock(); else wallSound.stopSamples(); };
  $('start').onclick = () => {
    if (countdown || battle.state === 'running') return;
    wallSound.unlock(); if (battle.state === 'ended') reset();
    countdown = new ArenaCountdown(battle.fighters); lastCount = 3; accumulator = 0;
    $('countdown-number').textContent = '3'; $('countdown').hidden = false; $('overlay').hidden = true;
    $('pause').disabled = false; $('pause').textContent = '일시정지'; $('event').textContent = '3 · 출발 방향을 정합니다.'; updateUI();
  };
  $('pause').onclick = pause; $('reset').onclick = reset;
  $('pick0').onchange = $('pick1').onchange = reset;
  $('toggle-editor').onclick = () => editor($('editor').hidden); $('close-editor').onclick = () => editor(false);
  $('new-ability').onclick = () => { loadAbility(''); $('ability-name').focus(); };
  $('new-character').onclick = () => { loadCharacter(''); $('character-name').focus(); };
  $('ability-list').onchange = event => loadAbility(event.target.value); $('character-list').onchange = event => loadCharacter(event.target.value);
  $('ability-type').onchange = () => abilityFields();
  document.addEventListener('visibilitychange', () => { if (document.hidden && (battle.state === 'running' || (countdown && !countdown.paused))) pause(); });
  for (const [key, type] of Object.entries(types)) $('ability-type').append(option(key, type.label));
  refreshLists(); loadAbility(data.abilities[0]?.id || ''); loadCharacter(data.characters[0].id); reset(); requestAnimationFrame(frame);
(() => {
  function mergePacks(base, packs) {
    const next = copy(base);
    const same = (a, b) => {
      const { id: ignoredA, ...left } = a;
      const { id: ignoredB, ...right } = b;
      return JSON.stringify(left) === JSON.stringify(right);
    };
    const fresh = (list, prefix) => {
      let n = 1;
      while (list.some(v => v.id === prefix + n)) n++;
      return prefix + n;
    };
    for (const raw of packs) {
      const pack = validate(raw, types);
      const ids = new Map();
      for (const a of pack.abilities) {
        const equal = next.abilities.find(v => same(v, a));
        if (equal) {
          ids.set(a.id, equal.id);
          continue;
        }
        const id = next.abilities.some(v => v.id === a.id)
          ? fresh(next.abilities, 'import_ability_') : a.id;
        next.abilities.push({ ...a, id });
        ids.set(a.id, id);
      }
      for (const c of pack.characters) {
        const incoming = {
          ...c,
          abilities: c.abilities.map(id => ids.get(id))
        };
        if (next.characters.some(v => same(v, incoming))) continue;
        if (next.characters.some(v => v.id === incoming.id)) {
          incoming.id = fresh(next.characters, 'import_character_');
        }
        next.characters.push(incoming);
      }
    }
    return validate(next, types);
  }

  const single = document.createElement('button');
  single.type = 'button';
  single.textContent = '선택한 캐릭터 내보내기 ↓';
  $('export').after(single);
  $('export').textContent = '전체 보관함 내보내기 ↓';

  single.onclick = () => {
    const c = data.characters.find(c => c.id === editingCharacter);
    if (!c) {
      message('캐릭터를 선택하고 먼저 저장해 주세요.', true);
      return;
    }
    const pack = {
      version: 1,
      characters: [copy(c)],
      abilities: data.abilities
        .filter(a => c.abilities.includes(a.id))
        .map(copy)
    };
    const name = c.name.replace(/[\\/:*?"<>|]/g, '_');
    download(
      JSON.stringify(pack, null, 2),
      name + '.json',
      'application/json'
    );
    message(c.name + '의 저장된 사진·능력·수치를 내보냈습니다.');
  };

  let packs = null, readId = 0;
  const input = $('import');
  input.multiple = true;
  const label = input.parentElement;
  for (const node of label.childNodes) {
    if (node.nodeType === 3 && node.textContent.trim()) {
      node.textContent = '캐릭터·설정 추가하기 ↑';
    }
  }
  $('apply-import').textContent = '기존 보관함에 추가';

  input.onchange = async event => {
    const files = [...event.target.files];
    const token = ++readId;
    packs = null;
    $('import-preview').hidden = true;
    input.value = '';
    if (!files.length) return;
    try {
      if (files.reduce((n, f) => n + f.size, 0) > 8 * 1024 * 1024) {
        throw Error('선택한 파일의 합계는 8MB 이하여야 합니다.');
      }
      const loaded = [];
      for (const file of files) {
        const raw = JSON.parse(await file.text());
        if (token !== readId) return;
        loaded.push(validate(raw, types));
      }
      const preview = mergePacks(data, loaded);
      packs = loaded;
      $('import-summary').textContent =
        '캐릭터 ' + (preview.characters.length - data.characters.length) +
        '개, 능력 ' + (preview.abilities.length - data.abilities.length) +
        '개를 추가합니다. 기존 내용은 유지하고 완전히 같은 항목은 건너뜁니다.';
      $('import-preview').hidden = false;
      message('파일 확인 완료. 추가 버튼을 누르세요.');
    } catch (error) {
      if (token === readId) {
        message('불러오기 실패: ' + error.message, true);
      }
    }
  };

  $('apply-import').onclick = () => {
    if (!packs) return;
    try {
      const next = mergePacks(data, packs);
      const chosen = next.characters.find(c =>
        !data.characters.some(old => old.id === c.id)
      )?.id || editingCharacter || next.characters[0].id;
      persist(next, chosen);
      loadCharacter(chosen);
      loadAbility(
        data.abilities.some(a => a.id === editingAbility)
          ? editingAbility : data.abilities[0]?.id || ''
      );
      packs = null;
      $('import-preview').hidden = true;
    } catch (error) {
      message('추가 실패: ' + error.message, true);
    }
  };

  $('cancel-import').onclick = () => {
    readId++;
    packs = null;
    $('import-preview').hidden = true;
    message('추가를 취소했습니다.');
  };
})();
})();
