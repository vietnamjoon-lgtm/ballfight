/* 기본 동작 모음. 추가 동작과 지속 효과는 ability-packs.js에 등록합니다. */
(function (global) {
  'use strict';
  const field = (label, min, max, step, value) => ({ label, min, max, step, default: value });
  global.ArenaAbilities = {
    projectile: {
      label: '탄환 발사', description: '상대를 향해 부채꼴로 탄환을 발사합니다.',
      fields: {
        damage: field('발당 피해', 1, 100, 1, 7), count: field('탄환 수', 1, 12, 1, 3),
        speed: field('탄환 속도', 100, 900, 10, 440), spread: field('탄환 간격 (도)', 0, 45, 1, 9),
        bounces: field('벽 반사 횟수', 0, 5, 1, 0)
      },
      cast(api, self, target, p) {
        const angle = Math.atan2(target.y - self.y, target.x - self.x);
        for (let i = 0; i < p.count; i++) {
          api.projectile(self, angle + (i - (p.count - 1) / 2) * p.spread * Math.PI / 180, p);
        }
      }
    },
    dash: {
      label: '돌진', description: '상대를 향해 빠르게 이동합니다. 한 번의 돌진에 추가 피해는 한 번만 적용됩니다.',
      fields: { damage: field('추가 피해', 1, 100, 1, 16), speed: field('돌진 속도', 250, 1000, 10, 590), duration: field('지속 시간 (초)', .1, 3, .1, .6) },
      cast(api, self, target, p) { api.dash(self, target, p); }
    },
    pulse: {
      label: '충격파', description: '발동 순간 범위 안의 상대에게 피해를 주고 밀어냅니다.',
      fields: { damage: field('피해', 1, 100, 1, 14), range: field('범위', 50, 450, 10, 180) },
      cast(api, self, target, p) {
        api.ring(self, p.range);
        if (Math.hypot(target.x - self.x, target.y - self.y) <= p.range + target.radius) {
          api.damage(target, p.damage, self); api.pushAway(target, self);
        }
      }
    },
    heal: {
      label: '회복', description: '최대 체력을 넘지 않는 범위에서 체력을 회복합니다.',
      fields: { amount: field('회복량', 1, 100, 1, 12) },
      cast(api, self, target, p) { api.heal(self, p.amount); }
    },
    shield: {
      label: '보호막', description: '일정 시간 피해를 흡수합니다. 재발동하면 보호막이 새로 교체됩니다.',
      fields: { amount: field('흡수량', 1, 150, 1, 20), duration: field('지속 시간 (초)', .5, 15, .5, 3) },
      cast(api, self, target, p) { api.shield(self, p); }
    },
    orbit: {
      label: '회전 무기', description: '주변을 도는 무기를 소환합니다. 같은 무기의 연속 적중 간격은 0.35초입니다.',
      fields: { damage: field('적중 피해', 1, 100, 1, 8), count: field('무기 수', 1, 6, 1, 2), range: field('회전 반경', 35, 140, 5, 65), duration: field('지속 시간 (초)', .5, 10, .5, 3), speed: field('회전 속도', 1, 10, .5, 4) },
      cast(api, self, target, p) { api.orbit(self, p); }
    }
  };
})(globalThis);
