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
function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------- canvas ---------------- */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const VW = 1280, VH = 720;

/* ---------------- ввод ---------------- */
const Input = {
  keys: {}, pressed: {}, mouse: { sx: VW / 2, sy: VH / 2, wx: 0, wy: 0, down: false, clicked: false, rdown: false },
  touch: { left: false, right: false, jump: false, atk: false, use: false },
  init() {
    window.addEventListener('keydown', e => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!this.keys[e.code]) this.pressed[e.code] = true;
      this.keys[e.code] = true;
    });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });
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
      if (e.button === 0) { this.mouse.down = true; this.mouse.clicked = true; }
      if (e.button === 2) this.mouse.rdown = true;
    });
    window.addEventListener('mouseup', e => {
      if (e.button === 0) this.mouse.down = false;
      if (e.button === 2) this.mouse.rdown = false;
    });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('touchmove', e => {
      const t = e.changedTouches[0];
      const p = toGame(t.clientX, t.clientY);
      this.mouse.sx = p.x; this.mouse.sy = p.y;
    }, { passive: true });
    window.addEventListener('blur', () => { this.keys = {}; this.mouse.down = false; });
    this.bindTouch();
  },
  bindTouch() {
    if (!('ontouchstart' in window)) return;
    const map = { 'tc-left': 'left', 'tc-right': 'right', 'tc-jump': 'jump', 'tc-atk': 'atk', 'tc-use': 'use' };
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
  jumpHit() {
    return !!(this.pressed['Space'] || this.pressed['KeyW'] || this.pressed['ArrowUp']) || this.consumeTouch('jump');
  },
  atkHeld() { return this.mouse.down || !!this.keys['KeyJ'] || this.touch.atk; },
  atkHit() { return this.mouse.clicked || !!this.pressed['KeyJ'] || this.consumeTouch('atk'); },
  useHit() { return !!this.pressed['KeyE'] || this.consumeTouch('use'); },
  consumeTouch(k) {
    if (this.touch[k] && !this.touch['_p_' + k]) { this.touch['_p_' + k] = true; return true; }
    if (!this.touch[k]) this.touch['_p_' + k] = false;
    return false;
  },
  endFrame() { this.pressed = {}; this.mouse.clicked = false; }
};

/* ---------------- камера ---------------- */
const Camera = {
  x: 0, y: 180, trauma: 0, sx: 0, sy: 0, freeze: false,
  reset(tx) { this.x = clamp(tx - VW / 2, 0, WORLD.w - VW); this.y = WORLD.h - VH; this.trauma = 0; },
  shake(amount) { this.trauma = clamp(this.trauma + amount, 0, 1); },
  update(dt, tx, ty) {
    if (!this.freeze) {
      const px = clamp(tx - VW / 2, 0, WORLD.w - VW);
      const py = clamp(ty - VH * 0.58, 0, WORLD.h - VH);
      this.x = lerp(this.x, px, 1 - Math.pow(0.0015, dt));
      this.y = lerp(this.y, py, 1 - Math.pow(0.004, dt));
    }
    this.trauma = Math.max(0, this.trauma - dt * 1.4);
    const s = this.trauma * this.trauma * 22;
    this.sx = rand(-s, s); this.sy = rand(-s, s);
  },
  apply(c) { c.translate(-Math.round(this.x + this.sx), -Math.round(this.y + this.sy)); }
};

/* ---------------- частицы ---------------- */
const Particles = {
  list: [],
  spawn(o) {
    if (this.list.length > 900) this.list.splice(0, 40);
    this.list.push(Object.assign({
      x: 0, y: 0, vx: 0, vy: 0, g: 0, life: 0.6, t: 0,
      size: 3, color: '#fff', glow: false, drag: 1, shrink: true, shape: 'rect'
    }, o));
  },
  blood(x, y, n = 12, color = '#a31621') {
    for (let i = 0; i < n; i++) this.spawn({
      x, y, vx: rand(-260, 260), vy: rand(-320, 60), g: 1400, life: rand(0.3, 0.8),
      size: rand(2, 5), color: Math.random() < 0.3 ? '#5c0a12' : color
    });
  },
  ichor(x, y, n = 14, color = '#1a0b2e') { // ихор призраков
    const cols = [color, '#4a1d6b', '#0a0a12', '#7b2fbf'];
    for (let i = 0; i < n; i++) this.spawn({
      x, y, vx: rand(-200, 200), vy: rand(-280, -40), g: 300, life: rand(0.4, 1.1),
      size: rand(2, 7), color: cols[(Math.random() * cols.length) | 0], glow: true, drag: 0.96
    });
  },
  dust(x, y, n = 6) {
    for (let i = 0; i < n; i++) this.spawn({
      x: x + rand(-20, 20), y: y + rand(-6, 6), vx: rand(-40, 40), vy: rand(-70, -10),
      g: -30, life: rand(0.5, 1.2), size: rand(1, 3), color: 'rgba(180,180,170,0.5)', drag: 0.98
    });
  },
  spark(x, y, n = 8, color = '#ffd166') {
    for (let i = 0; i < n; i++) this.spawn({
      x, y, vx: rand(-320, 320), vy: rand(-320, 160), g: 900, life: rand(0.15, 0.4),
      size: rand(1, 3), color, glow: true, drag: 0.97
    });
  },
  soul(x, y, n = 20) { // душа умирающего призрака — вверх
    for (let i = 0; i < n; i++) this.spawn({
      x: x + rand(-24, 24), y: y + rand(-40, 10), vx: rand(-30, 30), vy: rand(-160, -50),
      g: -60, life: rand(0.7, 1.5), size: rand(2, 6), color: 'rgba(160,120,255,0.7)', glow: true, drag: 0.98, shape: 'circle'
    });
  },
  muzzle(x, y, ang) {
    for (let i = 0; i < 10; i++) this.spawn({
      x, y, vx: Math.cos(ang) * rand(200, 600) + rand(-80, 80), vy: Math.sin(ang) * rand(200, 600) + rand(-80, 80),
      g: 0, life: rand(0.06, 0.16), size: rand(2, 5), color: i % 3 ? '#ffdf8a' : '#ff9a3c', glow: true, drag: 0.9
    });
  },
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.t += dt;
      if (p.t >= p.life) { this.list.splice(i, 1); continue; }
      p.vy += p.g * dt;
      p.vx *= Math.pow(p.drag, dt * 60); p.vy *= Math.pow(p.drag, dt * 60);
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
  },
  draw(c) {
    for (const p of this.list) {
      const k = 1 - p.t / p.life;
      c.globalAlpha = clamp(k * 1.4, 0, 1);
      if (p.glow) { c.shadowBlur = 12; c.shadowColor = p.color; } else c.shadowBlur = 0;
      c.fillStyle = p.color;
      const s = p.shrink ? p.size * k + 0.5 : p.size;
      if (p.shape === 'circle') { c.beginPath(); c.arc(p.x, p.y, s, 0, 7); c.fill(); }
      else c.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
    c.globalAlpha = 1; c.shadowBlur = 0;
  },
  clear() { this.list.length = 0; }
};

/* ---------------- всплывающий текст в мире ---------------- */
const Floaters = {
  list: [],
  add(x, y, text, color = '#fff', size = 18, life = 1.1) {
    this.list.push({ x, y, text, color, size, life, t: 0 });
    if (this.list.length > 40) this.list.shift();
  },
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i];
      f.t += dt; f.y -= 34 * dt;
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
    c.globalAlpha = 1;
  },
  clear() { this.list.length = 0; }
};

/* ---------------- свет / тьма ---------------- */
const lightCanvas = document.createElement('canvas');
lightCanvas.width = VW; lightCanvas.height = VH;
const lctx = lightCanvas.getContext('2d');

function renderDarkness(sources, flickerT, sanity01) {
  // sources: [{x,y(screen), r}...] + {cone:{x,y,ang,spread,len}}
  const c = lctx;
  c.globalCompositeOperation = 'source-over';
  c.clearRect(0, 0, VW, VH);
  const dark = 0.93 - sanity01 * 0.04;
  c.fillStyle = `rgba(2,3,8,${dark})`;
  c.fillRect(0, 0, VW, VH);
  c.globalCompositeOperation = 'destination-out';
  for (const s of sources) {
    if (s.cone) {
      const { x, y, ang, spread, len } = s.cone;
      // мягкий конус: несколько слоёв
      for (let i = 3; i >= 1; i--) {
        const k = i / 3;
        const g = c.createRadialGradient(x, y, 8, x, y, len * k);
        g.addColorStop(0, `rgba(255,255,255,${0.75 / i})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g;
        c.beginPath();
        c.moveTo(x, y);
        c.arc(x, y, len * k, ang - spread * k * 0.62, ang + spread * k * 0.62);
        c.closePath(); c.fill();
      }
      // горячая точка у руки
      const hg = c.createRadialGradient(x, y, 2, x, y, 70);
      hg.addColorStop(0, 'rgba(255,255,255,0.9)'); hg.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = hg; c.beginPath(); c.arc(x, y, 70, 0, 7); c.fill();
    } else {
      const r = s.r * (s.flick ? (1 - Math.sin(flickerT * 31 + s.x) * 0.5 * s.flick - (Math.random() < 0.04 * s.flick ? 0.5 : 0)) : 1);
      const g = c.createRadialGradient(s.x, s.y, 4, s.x, s.y, Math.max(10, r));
      g.addColorStop(0, `rgba(255,255,255,${s.a || 0.95})`);
      g.addColorStop(0.55, `rgba(255,255,255,${(s.a || 0.95) * 0.5})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(s.x, s.y, Math.max(10, r), 0, 7); c.fill();
    }
  }
  // тёплый оттенок света ламп — поверх
  c.globalCompositeOperation = 'source-over';
}

function drawCrosshair(c, x, y, weapon, cdOk) {
  c.save();
  c.translate(x, y);
  c.strokeStyle = cdOk ? 'rgba(255,230,170,0.95)' : 'rgba(150,60,60,0.7)';
  c.lineWidth = 2;
  c.shadowColor = '#000'; c.shadowBlur = 4;
  const r = weapon === 'pistol' ? 11 : 8;
  c.beginPath();
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    c.moveTo(dx * (r - 4), dy * (r - 4));
    c.lineTo(dx * (r + 3), dy * (r + 3));
  }
  c.stroke();
  c.fillStyle = 'rgba(255,230,170,0.9)';
  c.fillRect(-1, -1, 2, 2);
  c.restore();
}
