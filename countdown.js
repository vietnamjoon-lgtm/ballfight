(function (global) {
  'use strict';
  class ArenaCountdown {
    constructor(fighters) {
      this.fighters = fighters; this.elapsed = 0; this.paused = false; this.done = false;
      // End on the actual initial velocity, including the selected character's speed.
      this.directions = fighters.map((f, i) => ({ target: Math.atan2(f.vy, f.vx), turns: (i ? -1 : 1) * Math.PI * 2 * 4 }));
    }
    get number() { return Math.max(1, 3 - Math.floor(this.elapsed)); }
    angle(slot) {
      const d = this.directions[slot], progress = Math.min(1, this.elapsed / 2.7);
      return d.target - d.turns * Math.pow(1 - progress, 3);
    }
    update(dt) {
      if (this.paused || this.done) return;
      this.elapsed = Math.min(3, this.elapsed + dt);
      if (this.elapsed >= 3) {
        this.done = true;
        this.fighters.forEach((f, i) => { f.vx = Math.cos(this.directions[i].target) * f.speed; f.vy = Math.sin(this.directions[i].target) * f.speed; });
      }
    }
  }
  global.ArenaCountdown = ArenaCountdown;
})(globalThis);
