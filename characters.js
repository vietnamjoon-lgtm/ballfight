/* 기본 캐릭터와 능력. 웹 편집기로 만든 설정도 내보내서 보관할 수 있습니다. */
globalThis.ArenaDefaults = {
  version: 1,
  abilities: [
    { id: 'triple', name: '트리플 샷', type: 'projectile', cooldown: 3.2, params: { damage: 7, count: 3, speed: 440, spread: 9, bounces: 0 } },
    { id: 'charge', name: '추적 돌진', type: 'dash', cooldown: 4, params: { damage: 16, speed: 590, duration: .6 } },
    { id: 'wave', name: '충격파', type: 'pulse', cooldown: 4.5, params: { damage: 14, range: 180 } },
    { id: 'recover', name: '자가 회복', type: 'heal', cooldown: 7, params: { amount: 12 } },
    { id: 'guard', name: '에너지 보호막', type: 'shield', cooldown: 6, params: { amount: 20, duration: 3 } },
    { id: 'blades', name: '회전 칼날', type: 'orbit', cooldown: 5, params: { damage: 8, count: 2, range: 65, duration: 3, speed: 4 } }
  ],
  characters: [
    { id: 'blue', name: '블루', color: '#71c7ff', hp: 200, speed: 300, radius: 42, contactDamage: 5, image: '', abilities: ['triple'] },
    { id: 'coral', name: '코랄', color: '#ff8c82', hp: 200, speed: 300, radius: 42, contactDamage: 5, image: '', abilities: ['charge'] },
    { id: 'mint', name: '민트', color: '#91edb3', hp: 200, speed: 300, radius: 42, contactDamage: 4, image: '', abilities: ['wave', 'recover'] },
    { id: 'violet', name: '바이올렛', color: '#b9a0ff', hp: 200, speed: 300, radius: 42, contactDamage: 4, image: '', abilities: ['blades', 'guard'] }
  ]
};
