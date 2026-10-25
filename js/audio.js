'use strict';
// Tiny synthesized sound effects (no audio files needed).
const Sfx = {
  ctx: null, on: true, last: {},
  P: {
    shoot: [520, 180, .05, 'square', .025],
    hit:   [220, 90, .05, 'sawtooth', .03],
    kill:  [300, 60, .15, 'triangle', .07],
    pick:  [900, 1500, .06, 'sine', .05],
    hurt:  [160, 60, .2, 'sawtooth', .09],
    level: [400, 1300, .45, 'triangle', .1],
    boom:  [120, 30, .35, 'sawtooth', .12],
    buy:   [600, 1000, .12, 'sine', .07],
  },
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; }
  },
  play(type) {
    if (!this.on || !this.ctx) return;
    const now = this.ctx.currentTime;
    if (this.last[type] && now - this.last[type] < .06) return;
    this.last[type] = now;
    const [f0, f1, dur, wave, vol] = this.P[type];
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = wave;
    o.frequency.setValueAtTime(f0, now);
    o.frequency.exponentialRampToValueAtTime(f1, now + dur);
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(.0001, now + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(now); o.stop(now + dur + .02);
  },
};
