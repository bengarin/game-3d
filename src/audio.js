// Fully synthesized sound effects and ambient music (Web Audio) - no audio files needed.
export class AudioFX {
  constructor() { this.ctx = null; this.volume = 0.7; this.musicOn = true; this.musicTimer = null; this.step = 0; }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
  }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

  tone(freq, dur, { type = 'sine', vol = 0.2, slide = 0, delay = 0, attack = 0.005 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }
  noise(dur, { vol = 0.2, freq = 1200, delay = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master); src.start(t);
  }

  click() { this.tone(660, 0.08, { type: 'triangle', vol: 0.12 }); }
  coin() { this.tone(988, 0.09, { type: 'square', vol: 0.07 }); this.tone(1319, 0.22, { type: 'square', vol: 0.07, delay: 0.07 }); }
  crystal() { [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.5, { type: 'triangle', vol: 0.14, delay: i * 0.07 })); }
  heal() { this.tone(440, 0.2, { vol: 0.15 }); this.tone(660, 0.35, { vol: 0.15, delay: 0.12 }); }
  jump() { this.tone(300, 0.18, { type: 'triangle', vol: 0.12, slide: 320 }); }
  land() { this.noise(0.1, { vol: 0.12, freq: 500 }); }
  punch() { this.noise(0.12, { vol: 0.22, freq: 900 }); this.tone(160, 0.12, { type: 'sawtooth', vol: 0.1, slide: -80 }); }
  hit() { this.noise(0.15, { vol: 0.3, freq: 1800 }); this.tone(220, 0.15, { type: 'square', vol: 0.1, slide: -120 }); }
  hurt() { this.tone(200, 0.3, { type: 'sawtooth', vol: 0.2, slide: -130 }); this.noise(0.2, { vol: 0.2, freq: 700 }); }
  enemyDie() { this.tone(500, 0.4, { type: 'sawtooth', vol: 0.14, slide: -420 }); this.noise(0.3, { vol: 0.2, freq: 2400 }); }
  alert() { this.tone(740, 0.1, { type: 'square', vol: 0.06 }); this.tone(880, 0.14, { type: 'square', vol: 0.06, delay: 0.1 }); }
  chest() { [392, 494, 587, 784].forEach((f, i) => this.tone(f, 0.3, { type: 'triangle', vol: 0.14, delay: i * 0.09 })); }
  zap() { this.tone(1200, 0.25, { type: 'sawtooth', vol: 0.12, slide: -1000 }); this.noise(0.2, { vol: 0.15, freq: 4000 }); }
  portal() { [262, 330, 392, 523, 659, 784].forEach((f, i) => this.tone(f, 1.2, { vol: 0.1, delay: i * 0.12 })); }
  win() { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.45, { type: 'triangle', vol: 0.16, delay: i * 0.14 })); }
  lose() { [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.6, { type: 'sawtooth', vol: 0.1, delay: i * 0.22 })); }

  startMusic() {
    this.stopMusic();
    if (!this.musicOn) return;
    const scale = [196, 220, 262, 294, 330, 392, 440, 523];
    const pattern = [0, 2, 4, 2, 5, 4, 2, 3, 1, 3, 5, 3, 6, 5, 3, 2];
    this.musicTimer = setInterval(() => {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const n = pattern[this.step % pattern.length];
      this.tone(scale[n], 1.4, { vol: 0.045, attack: 0.05 });
      if (this.step % 4 === 0) this.tone(scale[n] / 2, 2.6, { vol: 0.06, attack: 0.3 });
      if (this.step % 8 === 6) this.tone(scale[(n + 4) % 8] * 2, 0.9, { type: 'triangle', vol: 0.02, delay: 0.25 });
      this.step++;
    }, 520);
  }
  stopMusic() { if (this.musicTimer) clearInterval(this.musicTimer); this.musicTimer = null; }
}
