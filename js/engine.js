/* ============================================================
   МИШУТКА — движок: ввод, камера, частицы, свет, хелперы
   ============================================================ */
'use strict';

/* ---------------- хелперы ---------------- */
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => (a + Math.random() * (b - a + 1)) | 0;
const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
const aabb = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const sign = v => v < 0 ? -1 : v > 0 ? 1 : 0;
const inRect = (x, y, r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
const approach = (v, t, s) => v < t ? Math.min(v + s, t) : Math.max(v - s, t);
function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function roundRect(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
}
/* затемнить/осветлить цвет '#rrggbb' — нужно для одежды Мишутки */
function shade(hex, amt) {
  if (typeof hex !== 'string' || hex[0] !== '#') return hex || '#888';
  let h = hex.slice(1);
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  const r = clamp(((n >> 16) & 255) + amt, 0, 255), g = clamp(((n >> 8) & 255) + amt, 0, 255), b = clamp((n & 255) + amt, 0, 255);
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

/* ---------------- canvas ---------------- */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const VW = 1280, VH = 720;

/* ---------------- ввод ---------------- */
const Input = {
  keys: {}, pressed: {}, released: {}, mouse: {
    sx: VW / 2, sy: VH / 2, wx: 0, wy: 0, down: false, clicked: false, rdown: false,
    dragX: 0, dragY: 0, dragging: false, dx: 0, dy: 0, px: VW / 2, py: VH / 2, wheel: 0
  },
  touch: { left: false, right: false, jump: false, atk: false, use: false, down: false },
  init() {
    window.addEventListener('keydown', e => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (!this.keys[e.code]) this.pressed[e.code] = true;
      this.keys[e.code] = true;
    });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; this.released[e.code] = true; });
    const toGame = (cx, cy) => {
      const r = canvas.getBoundingClientRect();
      return { x: (cx - r.left) / r.width * VW, y: (cy - r.top) / r.height * VH };
    };
    canvas.addEventListener('mousemove', e => {
      const p = toGame(e.clientX, e.clientY);
      this.mouse.sx = p.x; this.mouse.sy = p.y;
    });
    canvas.addEventListener('mousedown', e => {
      AudioSys.init();
      const p = toGame(e.clientX, e.clientY);
      this.mouse.sx = p.x; this.mouse.sy = p.y;
      this.mouse.dragX = p.x; this.mouse.dragY = p.y;
      this.mouse.dragging = true;
      if (e.button === 0) { this.mouse.down = true; this.mouse.clicked = true; }
      if (e.button === 2) this.mouse.rdown = true;
    });
    window.addEventListener('mouseup', e => {
      if (e.button === 0) { this.mouse.down = false; this.mouse.dragging = false; }
      if (e.button === 2) this.mouse.rdown = false;
    });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    /* колесо мыши — перебор оружия (и прокрутка списка в инвентаре) */
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      this.mouse.wheel = (e.deltaY > 0 ? 1 : e.deltaY < 0 ? -1 : this.mouse.wheel);
    }, { passive: false });
    canvas.addEventListener('touchmove', e => {
      const t = e.changedTouches[0];
      const p = toGame(t.clientX, t.clientY);
      this.mouse.sx = p.x; this.mouse.sy = p.y;
      if (this.mouse.dragging) { this.mouse.dragX = p.x; this.mouse.dragY = p.y; }
    }, { passive: true });
    canvas.addEventListener('touchstart', e => {
      AudioSys.init();
      const t = e.changedTouches[0];
      const p = toGame(t.clientX, t.clientY);
      this.mouse.sx = p.x; this.mouse.sy = p.y;
      this.mouse.dragX = p.x; this.mouse.dragY = p.y;
      this.mouse.dragging = true; this.mouse.down = true; this.mouse.clicked = true;
    }, { passive: true });
    canvas.addEventListener('touchend', () => { this.mouse.down = false; this.mouse.dragging = false; }, { passive: true });
    window.addEventListener('blur', () => { this.keys = {}; this.mouse.down = false; });
    this.bindTouch();
  },
  bindTouch() {
    if (!('ontouchstart' in window)) return;
    const map = { 'tc-left': 'left', 'tc-right': 'right', 'tc-jump': 'jump', 'tc-atk': 'atk', 'tc-use': 'use', 'tc-down': 'down' };
    for (const id in map) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.addEventListener('touchstart', e => { e.preventDefault(); AudioSys.init(); this.touch[map[id]] = true; }, { passive: false });
      el.addEventListener('touchend', e => { e.preventDefault(); this.touch[map[id]] = false; }, { passive: false });
    }
  },
  axis() {
    let a = 0;
    if (this.keys['KeyA'] || this.keys['ArrowLeft'] || this.touch.left) a -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight'] || this.touch.right) a += 1;
    return a;
  },
  vaxis() {
    let a = 0;
    if (this.keys['KeyW'] || this.keys['ArrowUp'] || this.touch.jump) a -= 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown'] || this.touch.down) a += 1;
    return a;
  },
  jumpHeld() { return !!(this.keys['Space'] || this.keys['KeyW'] || this.keys['ArrowUp'] || this.touch.jump); },
  jumpHit() { return !!(this.pressed['Space'] || this.pressed['KeyW'] || this.pressed['ArrowUp']) || this.consumeTouch('jump'); },
  crouch() { return !!(this.keys['ControlLeft'] || this.keys['ControlRight'] || this.keys['KeyC'] || this.keys['ShiftRight']); },
  atkHeld() { return this.mouse.down || !!this.keys['KeyJ'] || this.touch.atk; },
  atkHit() { return this.mouse.clicked || !!this.pressed['KeyJ'] || this.consumeTouch('atk'); },
  useHit() { return !!this.pressed['KeyE'] || this.consumeTouch('use'); },
  consumeTouch(k) {
    if (this.touch[k] && !this.touch['_p_' + k]) { this.touch['_p_' + k] = true; return true; }
    if (!this.touch[k]) this.touch['_p_' + k] = false;
    return false;
  },
  endFrame() { this.pressed = {}; this.released = {}; this.mouse.clicked = false; this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.wheel = 0; }
};

/* ---------------- камера ---------------- */
const Camera = {
  x: 0, y: 180, trauma: 0, sx: 0, sy: 0, freeze: false, zoom: 1,
  reset(tx, ty) { this.x = clamp(tx - VW / 2, 0, WORLD.w - VW); this.y = clamp((ty || WORLD.h) - VH, 0, WORLD.h - VH); this.trauma = 0; },
  shake(amount) { this.trauma = clamp(this.trauma + amount, 0, 1); },
  update(dt, tx, ty) {
    if (!this.freeze) {
      const px = clamp(tx - VW / 2, 0, WORLD.w - VW);
      const py = clamp(ty - VH * 0.5, 0, WORLD.h - VH);
      this.x = lerp(this.x, px, 1 - Math.pow(0.0012, dt));
      this.y = lerp(this.y, py, 1 - Math.pow(0.003, dt));
    }
    this.trauma = Math.max(0, this.trauma - dt * 1.3);
    const s = this.trauma * this.trauma * 24;
    this.sx = rand(-s, s); this.sy = rand(-s, s);
  },
  apply(c) { c.translate(-Math.round(this.x + this.sx), -Math.round(this.y + this.sy)); },
  toScreen(x, y) { return { x: x - this.x - this.sx, y: y - this.y - this.sy }; },
  viewBounds(pad = 120) {
    return { x0: this.x - pad, x1: this.x + VW + pad, y0: this.y - pad, y1: this.y + VH + pad };
  }
};

/* ---------------- частицы ---------------- */
const Particles = {
  list: [],
  spawn(o) {
    if (this.list.length > 1100) this.list.splice(0, 50);
    this.list.push(Object.assign({
      x: 0, y: 0, vx: 0, vy: 0, g: 0, life: 0.6, t: 0,
      size: 3, color: '#fff', glow: false, drag: 1, shrink: true, shape: 'rect', rot: 0, vr: 0
    }, o));
  },
  blood(x, y, n = 12, color = '#a31621') {
    for (let i = 0; i < n; i++) this.spawn({
      x, y, vx: rand(-280, 280), vy: rand(-340, 60), g: 1500, life: rand(0.3, 0.9),
      size: rand(2, 5), color: Math.random() < 0.3 ? '#5c0a12' : color
    });
  },
  ichor(x, y, n = 14, color = '#1a0b2e') {
    const cols = [color, '#4a1d6b', '#0a0a12', '#7b2fbf'];
    for (let i = 0; i < n; i++) this.spawn({
      x, y, vx: rand(-220, 220), vy: rand(-300, -40), g: 320, life: rand(0.4, 1.2),
      size: rand(2, 7), color: cols[(Math.random() * cols.length) | 0], glow: true, drag: 0.96
    });
  },
  dust(x, y, n = 6) {
    for (let i = 0; i < n; i++) this.spawn({
      x: x + rand(-22, 22), y: y + rand(-8, 8), vx: rand(-45, 45), vy: rand(-80, -10),
      g: -30, life: rand(0.5, 1.4), size: rand(1, 3), color: 'rgba(190,185,170,0.45)', drag: 0.985
    });
  },
  mote(x, y) {
    this.spawn({ x, y, vx: rand(-8, 8), vy: rand(-14, -2), g: -4, life: rand(2, 5), size: rand(0.8, 1.8), color: 'rgba(255,240,210,0.35)', drag: 0.999, shape: 'circle', glow: true });
  },
  spark(x, y, n = 8, color = '#ffd166') {
    for (let i = 0; i < n; i++) this.spawn({
      x, y, vx: rand(-360, 360), vy: rand(-360, 160), g: 950, life: rand(0.12, 0.45),
      size: rand(1, 3.4), color, glow: true, drag: 0.96
    });
  },
  glass(x, y, n = 14) {
    for (let i = 0; i < n; i++) this.spawn({
      x, y, vx: rand(-260, 260), vy: rand(-300, 40), g: 1300, life: rand(0.4, 1.1),
      size: rand(2, 4), color: 'rgba(190,235,240,0.85)', glow: true, rot: rand(0, 6), vr: rand(-9, 9)
    });
  },
  smoke(x, y, n = 8, color = 'rgba(150,160,165,0.35)') {
    for (let i = 0; i < n; i++) this.spawn({
      x: x + rand(-10, 10), y: y + rand(-10, 10), vx: rand(-24, 24), vy: rand(-46, -12),
      g: -16, life: rand(0.8, 2), size: rand(6, 16), color, drag: 0.97, shape: 'circle', shrink: false
    });
  },
  soul(x, y, n = 20) {
    for (let i = 0; i < n; i++) this.spawn({
      x: x + rand(-26, 26), y: y + rand(-44, 10), vx: rand(-30, 30), vy: rand(-170, -50),
      g: -60, life: rand(0.7, 1.7), size: rand(2, 6), color: 'rgba(160,120,255,0.75)', glow: true, drag: 0.985, shape: 'circle'
    });
  },
  drip(x, y, color = 'rgba(150,200,220,0.55)') {
    this.spawn({ x, y, vx: 0, vy: 30, g: 900, life: 1.4, size: 2.4, color, shape: 'circle', shrink: false });
  },
  muzzle(x, y, ang) {
    for (let i = 0; i < 12; i++) this.spawn({
      x, y, vx: Math.cos(ang) * rand(220, 660) + rand(-90, 90), vy: Math.sin(ang) * rand(220, 660) + rand(-90, 90),
      g: 0, life: rand(0.06, 0.18), size: rand(2, 5), color: i % 3 ? '#ffdf8a' : '#ff9a3c', glow: true, drag: 0.88
    });
  },
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.t += dt;
      if (p.t >= p.life) { this.list.splice(i, 1); continue; }
      p.vy += p.g * dt;
      const d = Math.pow(p.drag, dt * 60);
      p.vx *= d; p.vy *= d;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
  },
  draw(c) {
    for (const p of this.list) {
      const k = 1 - p.t / p.life;
      c.globalAlpha = clamp(k * 1.5, 0, 1);
      if (p.glow) { c.shadowBlur = 12; c.shadowColor = p.color; } else c.shadowBlur = 0;
      c.fillStyle = p.color;
      const s = p.shrink ? p.size * k + 0.5 : p.size;
      if (p.shape === 'circle') { c.beginPath(); c.arc(p.x, p.y, Math.max(0.4, s), 0, 7); c.fill(); }
      else if (p.rot) {
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
        c.fillRect(-s / 2, -s / 2, s, s * 0.7); c.restore();
      } else c.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
    c.globalAlpha = 1; c.shadowBlur = 0;
  },
  clear() { this.list.length = 0; }
};

/* ---------------- всплывающий текст ---------------- */
const Floaters = {
  list: [],
  add(x, y, text, color = '#fff', size = 18, life = 1.1) {
    this.list.push({ x, y, text, color, size, life, t: 0 });
    if (this.list.length > 50) this.list.shift();
  },
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i];
      f.t += dt; f.y -= 36 * dt;
      if (f.t >= f.life) this.list.splice(i, 1);
    }
  },
  draw(c) {
    c.textAlign = 'center';
    for (const f of this.list) {
      c.globalAlpha = clamp(1 - f.t / f.life, 0, 1);
      c.font = `700 ${f.size}px Rubik,sans-serif`;
      c.strokeStyle = '#000'; c.lineWidth = 4; c.strokeText(f.text, f.x, f.y);
      c.fillStyle = f.color; c.fillText(f.text, f.x, f.y);
    }
    c.globalAlpha = 1; c.textAlign = 'left';
  },
  clear() { this.list.length = 0; }
};

/* ---------------- свет / тьма ---------------- */
const lightCanvas = document.createElement('canvas');
lightCanvas.width = VW; lightCanvas.height = VH;
const lctx = lightCanvas.getContext('2d');

/* sources: {x,y,r,a,flick,color} | {cone:{x,y,ang,spread,len,color}} */
function renderDarkness(sources, flickerT, sanity01, darkness = 0.94) {
  const c = lctx;
  c.globalCompositeOperation = 'source-over';
  c.clearRect(0, 0, VW, VH);
  const dark = clamp(darkness - sanity01 * 0.05, 0, 1);
  c.fillStyle = `rgba(2,3,8,${dark})`;
  c.fillRect(0, 0, VW, VH);
  c.globalCompositeOperation = 'destination-out';
  for (const s of sources) {
    if (s.cone) {
      const { x, y, ang, spread, len } = s.cone;
      for (let i = 3; i >= 1; i--) {
        const k = i / 3;
        const g = c.createRadialGradient(x, y, 8, x, y, len * k);
        g.addColorStop(0, `rgba(255,255,255,${0.8 / i})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g;
        c.beginPath();
        c.moveTo(x, y);
        c.arc(x, y, len * k, ang - spread * k * 0.62, ang + spread * k * 0.62);
        c.closePath(); c.fill();
      }
      const hg = c.createRadialGradient(x, y, 2, x, y, 74);
      hg.addColorStop(0, 'rgba(255,255,255,0.95)'); hg.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = hg; c.beginPath(); c.arc(x, y, 74, 0, 7); c.fill();
    } else {
      const flickK = s.flick ? (1 - Math.abs(Math.sin(flickerT * 27 + (s.seed || s.x) * 0.13)) * 0.35 * s.flick - (Math.random() < 0.035 * s.flick ? 0.55 : 0)) : 1;
      const r = Math.max(12, s.r * flickK * (s.k || 1));
      const a = (s.a === undefined ? 0.95 : s.a) * (s.pulse ? (0.75 + Math.sin(flickerT * 3) * 0.25) : 1);
      const g = c.createRadialGradient(s.x, s.y, 4, s.x, s.y, r);
      g.addColorStop(0, `rgba(255,255,255,${a})`);
      g.addColorStop(0.5, `rgba(255,255,255,${a * 0.45})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(s.x, s.y, r, 0, 7); c.fill();
    }
  }
  c.globalCompositeOperation = 'source-over';
}

/* тёплый/цветной оттенок поверх тьмы */
function lightTint(c, x, y, r, color, alpha) {
  c.save();
  c.globalCompositeOperation = 'soft-light';
  const g = c.createRadialGradient(x, y, 2, x, y, r);
  g.addColorStop(0, color.replace('ALPHA', alpha));
  g.addColorStop(1, color.replace('ALPHA', '0'));
  c.fillStyle = g;
  c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
  c.restore();
}

function drawCrosshair(c, x, y, weapon, cdOk, spread = 0) {
  c.save();
  c.translate(x, y);
  c.strokeStyle = cdOk ? 'rgba(255,230,170,0.95)' : 'rgba(150,60,60,0.7)';
  c.lineWidth = 2;
  c.shadowColor = '#000'; c.shadowBlur = 4;
  const r = (weapon === 'pistol' ? 12 : 9) + spread;
  c.beginPath();
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    c.moveTo(dx * (r - 4), dy * (r - 4));
    c.lineTo(dx * (r + 4), dy * (r + 4));
  }
  c.stroke();
  c.fillStyle = 'rgba(255,230,170,0.9)';
  c.fillRect(-1, -1, 2, 2);
  c.restore();
}

/* полоса-подсказка прогресса мини-игр */
function drawSlider(c, x, y, w, h, v, color, bg = 'rgba(10,12,14,0.9)') {
  c.fillStyle = bg; c.fillRect(x, y, w, h);
  c.strokeStyle = '#2c3537'; c.lineWidth = 2; c.strokeRect(x, y, w, h);
  c.fillStyle = color; c.fillRect(x + 2, y + 2, (w - 4) * clamp(v, 0, 1), h - 4);
}

/* мягкая тень-подложка под объектом */
function ellipseShadow(c, x, y, rx, ry, a = 0.45) {
  c.fillStyle = `rgba(0,0,0,${a})`;
  c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, 7); c.fill();
}
