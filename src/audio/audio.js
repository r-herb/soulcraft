// Web Audio: synthesized sound effects and two generative music modes
// (calm ambient and "fun" bouncy). Starts only after the first user gesture.

const SCALES = {
  calm: [0, 2, 3, 5, 7, 8, 10], // natural minor
  fun: [0, 2, 4, 7, 9], // major pentatonic
  boss: [0, 1, 3, 5, 6, 8, 10],
};

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.volume = 0.7;
    this.musicOn = true;
    this.fun = false;
    this.mode = 'calm';
    this.nextNote = 0;
    this.step = 0;
    this.started = false;
    this.lastSfx = {};
  }

  unlock() {
    if (this.started) { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicOn ? 0.22 : 0;
      this.musicGain.connect(this.master);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.6;
      this.sfxGain.connect(this.master);
      // simple echo for music
      const delay = this.ctx.createDelay(1);
      delay.delayTime.value = 0.33;
      const fb = this.ctx.createGain(); fb.gain.value = 0.28;
      const wet = this.ctx.createGain(); wet.gain.value = 0.35;
      this.musicBus = this.ctx.createGain();
      this.musicBus.connect(this.musicGain);
      this.musicBus.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(this.musicGain);
      this.noiseBuf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.5, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.started = true;
      this.nextNote = this.ctx.currentTime + 0.2;
      this.timer = setInterval(() => this.schedule(), 100);
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    } catch (e) {
      console.warn('audio unavailable', e);
    }
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }
  setMusic(on) { this.musicOn = on; if (this.musicGain) this.musicGain.gain.setTargetAtTime(on ? 0.22 : 0, this.ctx.currentTime, 0.3); }
  setFun(on) { this.fun = on; }
  setMode(m) { this.mode = m; }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); }

  note(freq, t, dur, type = 'triangle', gain = 0.2, dest = this.musicBus) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  }

  schedule() {
    if (!this.ctx || !this.musicOn || this.ctx.state !== 'running') return;
    const fun = this.fun;
    const boss = this.mode === 'boss';
    const scale = boss ? SCALES.boss : fun ? SCALES.fun : SCALES.calm;
    const root = boss ? 45 : fun ? 60 : this.mode === 'night' ? 50 : 55;
    const beat = boss ? 0.22 : fun ? 0.18 : 0.42;
    while (this.nextNote < this.ctx.currentTime + 0.3) {
      const t = this.nextNote;
      const s = this.step;
      const mf = (n) => 440 * Math.pow(2, (n - 69) / 12);
      // chord progression every 16 steps
      const prog = fun ? [0, 5, 3, 4] : [0, 5, 3, 6];
      const chordRoot = prog[Math.floor(s / 16) % 4];
      if (s % (fun ? 4 : 8) === 0) {
        const deg = scale[chordRoot % scale.length];
        this.note(mf(root - 12 + deg), t, beat * (fun ? 3 : 7), boss ? 'sawtooth' : 'sine', boss ? 0.08 : 0.16);
      }
      const pattern = fun ? [1, 0, 1, 1, 0, 1, 0, 1] : boss ? [1, 1, 0, 1, 1, 0, 1, 0] : [1, 0, 0, 1, 0, 0, 1, 0];
      if (pattern[s % 8] && Math.random() < (fun ? 0.95 : 0.7)) {
        const idx = (chordRoot + [0, 2, 4, 2, 5, 4, 2, 7][(s + Math.floor(Math.random() * 3)) % 8]) % (scale.length * 2);
        const oct = Math.floor(idx / scale.length) * 12;
        this.note(mf(root + scale[idx % scale.length] + oct + (fun ? 12 : 0)), t, beat * (fun ? 1.2 : 2.5), fun ? 'square' : 'triangle', fun ? 0.05 : 0.09);
      }
      if ((fun || boss) && s % 2 === 0) this.drum(t, s % 4 === 0 ? 'kick' : 'hat');
      this.nextNote += beat;
      this.step++;
    }
  }

  drum(t, kind) {
    if (kind === 'kick') {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
      g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      o.connect(g); g.connect(this.musicGain); o.start(t); o.stop(t + 0.2);
    } else {
      const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf;
      const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
      const g = this.ctx.createGain(); g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      src.connect(f); f.connect(g); g.connect(this.musicGain); src.start(t); src.stop(t + 0.06);
    }
  }

  noise(t, dur, freq, gain, type = 'bandpass') {
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = 1.2;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.sfxGain);
    src.start(t); src.stop(t + dur + 0.02);
  }

  tone(t, f0, f1, dur, type, gain) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.sfxGain); o.start(t); o.stop(t + dur + 0.02);
  }

  sfx(name) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (this.lastSfx[name] && now - this.lastSfx[name] < 0.04) return;
    this.lastSfx[name] = now;
    const t = now;
    switch (name) {
      case 'dig': this.noise(t, 0.08, 900 + Math.random() * 400, 0.25); break;
      case 'break': this.noise(t, 0.18, 600, 0.45); this.noise(t + 0.03, 0.12, 1400, 0.2); break;
      case 'place': this.noise(t, 0.07, 400, 0.4, 'lowpass'); this.tone(t, 220, 140, 0.06, 'square', 0.05); break;
      case 'jump': this.tone(t, 300, 520, 0.08, 'square', 0.03); break;
      case 'step': this.noise(t, 0.05, 500 + Math.random() * 200, 0.12, 'lowpass'); break;
      case 'hit': this.noise(t, 0.1, 300, 0.5, 'lowpass'); this.tone(t, 160, 70, 0.12, 'square', 0.1); break;
      case 'hurt': this.tone(t, 420, 180, 0.2, 'sawtooth', 0.12); break;
      case 'pickup': this.tone(t, 700, 1200, 0.08, 'triangle', 0.12); break;
      case 'crystal': this.tone(t, 900, 1800, 0.12, 'sine', 0.15); this.tone(t + 0.08, 1350, 2400, 0.15, 'sine', 0.1); break;
      case 'eat': for (let i = 0; i < 3; i++) this.noise(t + i * 0.09, 0.06, 1100, 0.2); break;
      case 'craft': this.tone(t, 500, 800, 0.1, 'square', 0.06); this.tone(t + 0.08, 700, 1000, 0.1, 'square', 0.06); break;
      case 'click': this.tone(t, 800, 600, 0.04, 'square', 0.05); break;
      case 'beep': this.tone(t, 1760, 1760, 0.09, 'square', 0.07); this.tone(t + 0.12, 2350, 2350, 0.12, 'square', 0.07); break;
      case 'buzz': this.tone(t, 180, 160, 0.35, 'sawtooth', 0.1); break;
      case 'bell': this.tone(t, 1320, 1320, 0.25, 'triangle', 0.12); this.tone(t + 0.02, 1980, 1980, 0.2, 'sine', 0.06); break;
      case 'doors': this.noise(t, 0.35, 700, 0.18, 'lowpass'); this.tone(t, 300, 220, 0.3, 'sine', 0.05); break;
      case 'shoot': this.noise(t, 0.12, 2000, 0.25, 'highpass'); break;
      case 'throw': this.noise(t, 0.2, 800, 0.2); this.tone(t, 300, 900, 0.18, 'sine', 0.05); break;
      case 'wind': this.noise(t, 0.5, 500, 0.35); this.tone(t, 200, 600, 0.4, 'sine', 0.05); break;
      case 'mobdie': this.tone(t, 300, 60, 0.35, 'sawtooth', 0.12); break;
      case 'roar': this.tone(t, 110, 55, 1.0, 'sawtooth', 0.18); this.noise(t, 0.9, 200, 0.3, 'lowpass'); break;
      case 'boom': this.noise(t, 0.6, 120, 0.6, 'lowpass'); this.tone(t, 90, 30, 0.5, 'sine', 0.3); break;
      case 'bosshit': this.tone(t, 220, 90, 0.15, 'square', 0.12); this.noise(t, 0.12, 400, 0.3); break;
      case 'deflect': this.tone(t, 600, 1500, 0.15, 'triangle', 0.2); break;
      case 'warn': this.tone(t, 880, 880, 0.12, 'square', 0.06); this.tone(t + 0.16, 880, 880, 0.12, 'square', 0.06); break;
      case 'trade': this.tone(t, 660, 990, 0.1, 'triangle', 0.12); this.tone(t + 0.1, 990, 1320, 0.12, 'triangle', 0.1); break;
      case 'levelup': [523, 659, 784, 1047].forEach((f, i) => this.tone(t + i * 0.09, f, f, 0.15, 'square', 0.06)); break;
      case 'victory': [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this.tone(t + i * 0.14, f, f, 0.3, 'triangle', 0.1)); break;
      case 'death': [440, 370, 311, 262].forEach((f, i) => this.tone(t + i * 0.18, f, f * 0.95, 0.3, 'triangle', 0.1)); break;
      case 'portal': this.tone(t, 200, 1200, 0.8, 'sine', 0.12); this.noise(t, 0.8, 900, 0.15); break;
      default: break;
    }
  }
}
