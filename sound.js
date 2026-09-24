// Synthetic wall tap, missile launch/explosion, character bump, nose-hit, orb-hit, countdown-tick, 6/7 throw, bread-eating, berserk awaken/slam and nose-grinder sounds. No background music.
(function (global) {
  'use strict';
  class ArenaWallSound {
    constructor() { this.enabled = true; this.context = null; this.last = [-Infinity, -Infinity]; this.flight = null; this.grinder = null; this.samples = { missile: null, punch: null, sword: null, tick: null, six: null, seven: null, breadEat: null, awaken: null, berserkSlam: null, grinder: null }; this.loading = null; this.voices = new Set(); this.rate = 1; }
    loadMedia() {
      if (this.loading || !global.ArenaMedia || !this.context) return;
      const decode = key => {
        const media = global.ArenaMedia[key];
        if (!media) return Promise.resolve(null);
        const bytes = Uint8Array.from(atob(media.split(',')[1]), c => c.charCodeAt(0));
        return this.context.decodeAudioData(bytes.buffer).catch(() => null);
      };
      this.loading = Promise.all([decode('sound'), decode('punch'), decode('sword'), decode('tick'), decode('six'), decode('seven'), decode('breadEat'), decode('awaken'), decode('berserkSlam'), decode('grinder')]).then(([missile, punch, sword, tick, six, seven, breadEat, awaken, berserkSlam, grinder]) => {
        this.samples.missile = missile; this.samples.punch = punch; this.samples.sword = sword; this.samples.tick = tick; this.samples.six = six; this.samples.seven = seven; this.samples.breadEat = breadEat; this.samples.awaken = awaken; this.samples.berserkSlam = berserkSlam; this.samples.grinder = grinder;
      });
    }
    setRate(rate) {
      this.rate = rate;
      if (this.flight?.source.playbackRate) this.flight.source.playbackRate.value = rate;
      if (this.grinder?.source.playbackRate) this.grinder.source.playbackRate.value = rate;
      for (const voice of this.voices) if (voice.source.playbackRate) voice.source.playbackRate.value = rate;
    }
    stopSamples() {
      this.setFlight(false); this.setGrinder(false);
      for (const voice of this.voices) { voice.source.stop(); voice.source.disconnect(); voice.gain.disconnect(); }
      this.voices.clear();
    }
    setFlight(active) {
      const c = this.context;
      if (!active || !this.enabled || !c || c.state !== 'running') {
        if (this.flight) { const { source, gain } = this.flight; this.flight = null; source.stop(); source.disconnect(); gain.disconnect(); }
        return;
      }
      if (this.flight || !this.samples.missile) return;
      const source = c.createBufferSource(), gain = c.createGain(); source.buffer = this.samples.missile;
      source.loop = true; source.loopStart = .25; source.loopEnd = global.ArenaMedia?.impactOffset || 1.35;
      if (source.playbackRate) source.playbackRate.value = this.rate;
      gain.gain.setValueAtTime(.7, c.currentTime);
      source.connect(gain); gain.connect(c.destination); this.flight = { source, gain }; source.start(0, 0);
    }
    // Belt-grinder loop that runs for as long as a nose-grinder ultimate is spinning, then fades out.
    setGrinder(active) {
      const c = this.context;
      if (!active || !this.enabled || !c || c.state !== 'running') {
        if (this.grinder) {
          const { source, gain } = this.grinder; this.grinder = null;
          if (!c || c.state !== 'running') { source.stop(); source.disconnect(); gain.disconnect(); return; }
          gain.gain.setValueAtTime(gain.gain.value, c.currentTime); gain.gain.linearRampToValueAtTime(0, c.currentTime + .2);
          source.onended = () => { source.disconnect(); gain.disconnect(); }; source.stop(c.currentTime + .22);
        }
        return;
      }
      if (this.grinder || !this.samples.grinder) return;
      const source = c.createBufferSource(), gain = c.createGain(); source.buffer = this.samples.grinder;
      source.loop = true; source.loopStart = 1; source.loopEnd = this.samples.grinder.duration;
      if (source.playbackRate) source.playbackRate.value = this.rate;
      gain.gain.setValueAtTime(.75, c.currentTime);
      source.connect(gain); gain.connect(c.destination); this.grinder = { source, gain }; source.start(0, 0);
    }
    sampleExplosion() {
      if (!this.samples.missile) return;
      const c = this.context, offset = global.ArenaMedia?.impactOffset || 1.35;
      const source = c.createBufferSource(), gain = c.createGain(); source.buffer = this.samples.missile;
      if (source.playbackRate) source.playbackRate.value = this.rate;
      gain.gain.setValueAtTime(.85, c.currentTime); source.connect(gain); gain.connect(c.destination);
      const voice = { source, gain }; this.voices.add(voice);
      source.onended = () => { source.disconnect(); gain.disconnect(); this.voices.delete(voice); };
      source.start(0, offset, Math.max(.01, this.samples.missile.duration - offset));
    }
    playOneShot(name, volume = .85) {
      const sample = this.samples[name];
      if (!sample) return;
      const c = this.context;
      const source = c.createBufferSource(), gain = c.createGain(); source.buffer = sample;
      if (source.playbackRate) source.playbackRate.value = this.rate;
      gain.gain.setValueAtTime(volume, c.currentTime); source.connect(gain); gain.connect(c.destination);
      const voice = { source, gain }; this.voices.add(voice);
      source.onended = () => { source.disconnect(); gain.disconnect(); this.voices.delete(voice); };
      source.start(0);
    }
    playClip(name, volume, offset, duration) {
      const sample = this.samples[name];
      if (!sample) return;
      const c = this.context;
      const source = c.createBufferSource(), gain = c.createGain(); source.buffer = sample;
      if (source.playbackRate) source.playbackRate.value = this.rate;
      gain.gain.setValueAtTime(volume, c.currentTime); source.connect(gain); gain.connect(c.destination);
      const voice = { source, gain }; this.voices.add(voice);
      source.onended = () => { source.disconnect(); gain.disconnect(); this.voices.delete(voice); };
      source.start(0, offset, Math.min(duration, Math.max(.01, sample.duration - offset)));
    }
    unlock() {
      if (!this.enabled) return;
      try {
        const Audio = global.AudioContext || global.webkitAudioContext;
        if (!Audio) return;
        if (!this.context) this.context = new Audio();
        this.loadMedia();
        if (this.context.state === 'suspended') this.context.resume().catch(() => {});
      } catch { /* Audio unavailable: the match remains playable. */ }
    }
    hit(slot) {
      const ctx = this.context;
      if (!this.enabled || !ctx || ctx.state !== 'running') return;
      const now = ctx.currentTime;
      if (now - this.last[slot] < .045) return;
      this.last[slot] = now;
      const oscillator = ctx.createOscillator(), gain = ctx.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(slot === 0 ? 330 : 290, now);
      oscillator.frequency.exponentialRampToValueAtTime(100, now + .045);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(.3, now + .002);
      gain.gain.exponentialRampToValueAtTime(.001, now + .075);
      oscillator.connect(gain); gain.connect(ctx.destination);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(now); oscillator.stop(now + .08);
    }
    play(type) {
      const ctx = this.context;
      if (!this.enabled || !ctx || ctx.state !== 'running') return;
      if (type === 'remoteClick') {
        this.tone(700, 220, .045, .09, 'triangle');
      } else if (type === 'countdownTick') {
        this.playOneShot('tick', .7);
      } else if (type === 'missileLaunch') {
        this.setFlight(true);
      } else if (type === 'missileExplosion') {
        this.sampleExplosion();
      } else if (type === 'bump') {
        this.playOneShot('punch', .68);
      } else if (type === 'noseHit') {
        this.playOneShot('sword', .8);
      } else if (type === 'orbHit') {
        this.playOneShot('punch', .65);
      } else if (type === 'sixThrow') {
        this.playOneShot('six', .4);
      } else if (type === 'sevenThrow') {
        this.playOneShot('seven', .4);
      } else if (type === 'breadEat') {
        this.playOneShot('breadEat', .8);
      } else if (type === 'awaken') {
        this.playClip('awaken', .8, 0, 4.4);
      } else if (type === 'berserkSlam') {
        this.playClip('berserkSlam', .9, .58, .45);
      }
    }
    tone(from, to, duration, volume, type) {
      const c = this.context, now = c.currentTime, oscillator = c.createOscillator(), gain = c.createGain();
      oscillator.type = type; oscillator.frequency.setValueAtTime(from, now); oscillator.frequency.exponentialRampToValueAtTime(to, now + duration);
      gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(volume, now + .008); gain.gain.exponentialRampToValueAtTime(.001, now + duration);
      oscillator.connect(gain); gain.connect(c.destination); oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(now); oscillator.stop(now + duration);
    }
    noise(duration, volume, type, frequency) {
      const c = this.context, now = c.currentTime, buffer = c.createBuffer(1, Math.ceil(c.sampleRate * duration), c.sampleRate);
      const samples = buffer.getChannelData(0); for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      const source = c.createBufferSource(), filter = c.createBiquadFilter(), gain = c.createGain(); source.buffer = buffer;
      filter.type = type; filter.frequency.setValueAtTime(frequency, now);
      gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(volume, now + .005); gain.gain.exponentialRampToValueAtTime(.001, now + duration);
      source.connect(filter); filter.connect(gain); gain.connect(c.destination);
      source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
      source.start(now); source.stop(now + duration);
    }
  }
  global.ArenaWallSound = ArenaWallSound;
})(globalThis);
