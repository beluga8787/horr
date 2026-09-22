/* ============================================================
   МИШУТКА — процедурный звук (WebAudio, без внешних файлов)
   ============================================================ */
'use strict';
const AudioSys = {
  ctx: null, master: null, ambGain: null, bossGain: null,
  muted: false, started: false, intensity: 0, noiseBuf: null,
  heartT: 0, whisperT: 8, bellT: 5, droneNodes: [],

  init() {
    if (this.started) { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(this.ctx.destination);
      // шумовой буфер
      const len = this.ctx.sampleRate * 2;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.started = true;
      this.startDrone();
    } catch (e) { console.warn('audio unavailable', e); }
  },

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.9;
    return this.muted;
  },

  /* ---- примитивы ---- */
  tone(freq, dur, type = 'sine', vol = 0.2, slideTo = null, delay = 0) {
    if (!this.started || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  },
  noise(dur, vol = 0.2, freq = 1000, q = 1, type = 'bandpass', delay = 0, slideTo = null) {
    if (!this.started || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t); s.stop(t + dur + 0.05);
  },

  /* ---- фон: гул больницы ---- */
  startDrone() {
    const c = this.ctx;
    this.ambGain = c.createGain(); this.ambGain.gain.value = 0.5; this.ambGain.connect(this.master);
    const mk = (freq, det, vol, lfoF) => {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq; o.detune.value = det;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220; f.Q.value = 4;
      const g = c.createGain(); g.gain.value = vol;
      const lfo = c.createOscillator(); lfo.frequency.value = lfoF;
      const lg = c.createGain(); lg.gain.value = 120;
      lfo.connect(lg); lg.connect(f.frequency);
      o.connect(f); f.connect(g); g.connect(this.ambGain);
      o.start(); lfo.start();
      this.droneNodes.push(o, lfo);
    };
    mk(49, 0, 0.05, 0.07); mk(49.7, 8, 0.05, 0.11); mk(98.5, -6, 0.022, 0.05);
    // шипение вентиляции
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 0.6;
    const g = c.createGain(); g.gain.value = 0.016;
    s.connect(f); f.connect(g); g.connect(this.ambGain); s.start();
    // пульс босса (тихий, громкость растёт с intensity)
    this.bossGain = c.createGain(); this.bossGain.gain.value = 0; this.bossGain.connect(this.master);
    const bo = c.createOscillator(); bo.type = 'square'; bo.frequency.value = 55;
    const bf = c.createBiquadFilter(); bf.type = 'lowpass'; bf.frequency.value = 160;
    const blfo = c.createOscillator(); blfo.type = 'sine'; blfo.frequency.value = 2.4;
    const blg = c.createGain(); blg.gain.value = 0.06;
    const bg = c.createGain(); bg.gain.value = 0.07;
    bo.connect(bf); bf.connect(bg); bg.connect(this.bossGain);
    blfo.connect(blg); blg.connect(bg.gain);
    bo.start(); blfo.start();
  },
  setIntensity(v) {
    this.intensity = Math.max(0, Math.min(1, v));
    if (this.bossGain) this.bossGain.gain.value = this.intensity * 0.9;
    if (this.ambGain) this.ambGain.gain.value = 0.5 + this.intensity * 0.3;
  },

  /* ---- именованные звуки ---- */
  uiClick() { this.tone(660, 0.07, 'square', 0.06); },
  step(run) { this.noise(0.07, run ? 0.10 : 0.06, 300 + Math.random() * 200, 1.2, 'lowpass'); },
  jump() { this.noise(0.12, 0.06, 500, 1, 'bandpass', 0, 900); },
  land() { this.noise(0.1, 0.12, 180, 1, 'lowpass'); },
  swing() { this.noise(0.14, 0.14, 1800, 2, 'bandpass', 0, 500); },
  hitFlesh() { this.noise(0.12, 0.25, 350, 1, 'lowpass'); this.tone(120, 0.1, 'sine', 0.2, 60); },
  ghostHit() { this.noise(0.16, 0.2, 2500, 3, 'highpass'); this.tone(800, 0.14, 'sawtooth', 0.08, 200); },
  ghostDie() { this.tone(400, 0.7, 'sawtooth', 0.12, 40); this.noise(0.6, 0.16, 3000, 1, 'highpass', 0, 300); },
  shot() {
    this.noise(0.16, 0.5, 3200, 0.7, 'lowpass');
    this.tone(160, 0.18, 'square', 0.3, 45);
    this.noise(0.5, 0.08, 900, 1, 'bandpass', 0.05, 200); // эхо коридора
  },
  dryfire() { this.tone(1400, 0.05, 'square', 0.08); },
  reload() { this.tone(500, 0.06, 'square', 0.1); this.tone(700, 0.06, 'square', 0.1, null, 0.12); this.tone(950, 0.08, 'square', 0.12, null, 0.3); },
  pickup() { this.tone(520, 0.09, 'sine', 0.16); this.tone(780, 0.12, 'sine', 0.16, null, 0.08); },
  note() { this.noise(0.25, 0.1, 4000, 1, 'highpass'); this.tone(330, 0.4, 'triangle', 0.1, 165); this.tone(165, 0.8, 'sine', 0.12, 82, 0.15); },
  door() { this.noise(0.5, 0.2, 220, 2, 'lowpass'); this.tone(90, 0.5, 'sawtooth', 0.06, 55); },
  locked() { this.tone(180, 0.09, 'square', 0.14); this.tone(140, 0.12, 'square', 0.14, null, 0.12); },
  unlock() { this.tone(300, 0.07, 'square', 0.12); this.tone(450, 0.07, 'square', 0.12, null, 0.1); this.tone(680, 0.14, 'square', 0.14, null, 0.2); },
  search() { this.noise(0.35, 0.1, 1200, 1, 'bandpass'); },
  heal() { this.tone(440, 0.2, 'sine', 0.14, 660); this.tone(660, 0.3, 'sine', 0.12, 880, 0.15); },
  pills() { this.noise(0.1, 0.12, 5000, 2, 'highpass'); this.tone(880, 0.25, 'sine', 0.1, 440, 0.1); },
  hurt() { this.tone(200, 0.25, 'sawtooth', 0.2, 70); this.noise(0.2, 0.2, 600, 1, 'lowpass'); },
  scream() { // вопль медсестры
    this.tone(1200, 0.7, 'sawtooth', 0.16, 2400);
    this.tone(1250, 0.7, 'sawtooth', 0.12, 2500, 0.03);
    this.noise(0.7, 0.1, 3500, 2, 'bandpass', 0, 1500);
  },
  whisper() {
    const n = 2 + (Math.random() * 3 | 0);
    for (let i = 0; i < n; i++)
      this.noise(0.25 + Math.random() * 0.3, 0.07, 2500 + Math.random() * 2500, 4, 'bandpass', i * 0.22, 1200);
  },
  sting() { // опасность рядом
    this.tone(110, 0.5, 'sawtooth', 0.2, 55);
    this.tone(116.5, 0.5, 'sawtooth', 0.2, 58, 0.02);
    this.noise(0.4, 0.12, 400, 1, 'lowpass');
  },
  bossRoar() {
    this.tone(70, 1.1, 'sawtooth', 0.3, 35);
    this.tone(105, 1.1, 'square', 0.18, 50, 0.05);
    this.noise(1.0, 0.22, 500, 1, 'lowpass', 0, 120);
    this.tone(1400, 0.4, 'sawtooth', 0.06, 300, 0.1);
  },
  syringe() { this.noise(0.12, 0.1, 5000, 3, 'bandpass', 0, 1500); },
  bossDie() {
    this.tone(90, 2.2, 'sawtooth', 0.3, 25);
    this.noise(2.0, 0.25, 800, 1, 'lowpass', 0, 60);
    this.tone(1500, 1.2, 'sine', 0.08, 100, 0.2);
  },
  heartbeat() { this.tone(55, 0.12, 'sine', 0.4, 35); this.tone(50, 0.14, 'sine', 0.32, 30, 0.18); },
  bell() { // далёкий диссонансный звон
    const f = 620 + Math.random() * 300;
    this.tone(f, 2.5, 'sine', 0.035); this.tone(f * 1.06, 2.5, 'sine', 0.03);
  },
  thunder() { this.noise(1.4, 0.2, 120, 1, 'lowpass', 0, 50); },

  powerOn() {
    this.noise(0.5, 0.22, 120, 1, 'lowpass');
    this.tone(60, 0.9, 'sawtooth', 0.16, 180);
    this.tone(120, 0.6, 'square', 0.1, 240, 0.1);
    for (let i = 0; i < 5; i++) this.tone(300 + i * 160, 0.1, 'square', 0.05, null, i * 0.09);
  },
  elevator() { this.tone(70, 1.6, 'sawtooth', 0.12, 55); this.noise(1.6, 0.08, 300, 1, 'lowpass'); },
  elevatorDing() { this.tone(880, 0.45, 'sine', 0.16); this.tone(1320, 0.5, 'sine', 0.1, null, 0.05); },
  glass() {
    this.noise(0.25, 0.35, 4200, 1.2, 'highpass');
    for (let i = 0; i < 7; i++) this.tone(1600 + Math.random() * 3400, 0.12, 'triangle', 0.06, 900, i * 0.02);
  },
  musicBox() {
    const notes = [659, 784, 880, 784, 659, 587, 523, 587];
    notes.forEach((f, i) => {
      this.tone(f, 1.1, 'sine', 0.09, null, i * 0.42);
      this.tone(f * 2, 0.9, 'triangle', 0.03, null, i * 0.42 + 0.02);
    });
  },
  /* ---- вызывается каждый кадр из игры ---- */
  update(dt, hp, san, danger) {
    if (!this.started || this.muted) return;
    // сердцебиение при низком HP
    if (hp < 35) {
      this.heartT -= dt;
      if (this.heartT <= 0) { this.heartbeat(); this.heartT = 0.55 + (hp / 35) * 0.6; }
    }
    // шёпот при низком рассудке
    if (san < 45) {
      this.whisperT -= dt;
      if (this.whisperT <= 0) { this.whisper(); this.whisperT = 4 + Math.random() * 8 + san * 0.1; }
    }
    // случайный звон
    this.bellT -= dt;
    if (this.bellT <= 0) { this.bell(); this.bellT = 9 + Math.random() * 16; }
    this.setIntensity(danger);
  }
};
