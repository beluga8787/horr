/* ============================================================
   МИШУТКА — игра: мир, цикл, рендер, HUD, катсцена, сохранения
   ============================================================ */
'use strict';

const $ = id => document.getElementById(id);
const SAVE_KEY = 'mishutka_save_v1';

const Game = {
  state: 'title', paused: false, noteId: null,
  player: null, ghosts: [], boss: null, projectiles: [], effects: [],
  furniture: [], doors: [], pickups: [], lamps: [], platforms: [], solids: [],
  fogBlobs: [], roomDecor: [],
  bossStarted: false, bossDead: false, playTime: 0, curRoom: -1,
  muzzleT: 0, whisperT: 6, fakeT: 8, directorT: 18, dmgFlash: 0,
  interactTarget: null, bolt: 0, boltT: 5, csIndex: 0, csChar: 0, csTimer: 0, csSegs: [], csRain: [],
  deathT: 0, winT: 0, titleT: 0,

  modalOpen() { return this.noteId !== null; },

  /* ================= INIT ================= */
  init() {
    Input.init();
    this.buildWorld();
    this.player = new Player(PLAYER_START.x, PLAYER_START.y);
    Camera.reset(this.player.cx());
    this.bindUI();
    // первый клик — звук
    window.addEventListener('pointerdown', () => AudioSys.init(), { once: false });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'play' && !this.paused) this.togglePause(true);
    });
    if ('ontouchstart' in window) $('touch').classList.remove('hidden');
    if (this.hasSave()) $('btn-continue').classList.remove('hidden');
    $('fade').style.opacity = 0;
    requestAnimationFrame(t => this.loop(t));
  },

  buildWorld() {
    this.platforms = PLATFORMS.map(p => ({ ...p }));
    this.furniture = FURNITURE.map(f => new Furniture(f));
    this.doors = DOORS.map(d => new Door(d));
    this.pickups = PICKUPS.map(p => new Pickup(p));
    this.lamps = LAMPS.map(l => ({ ...l, level: l.on ? 1 : 0 }));
    this.solids = this.platforms.filter(p => p.t === 'solid');
    for (const f of this.furniture) if (f.solid) this.solids.push({ x: f.x, y: f.y, w: f.w, h: f.h, t: 'solid', furn: true });
    this.ghosts = GHOSTS.map(g => new Ghost(g.type, g.x, g.leash.slice()));
    this.boss = null; this.projectiles = []; this.effects = [];
    Particles.clear(); Floaters.clear();
    this.bossStarted = false; this.bossDead = false;
    // туман
    const r = mulberry32(1337);
    this.fogBlobs = [];
    for (let i = 0; i < 26; i++) this.fogBlobs.push({ x: r() * WORLD.w, y: 620 + r() * 160, w: 220 + r() * 260, vx: 6 + r() * 14, a: 0.05 + r() * 0.06 });
    // декор комнат
    this.roomDecor = ROOMS.map((rm, i) => {
      const rr = mulberry32(100 + i * 77);
      const items = [];
      const n = Math.floor((rm.x1 - rm.x0) / 220);
      for (let k = 0; k < n; k++) items.push({ x: rm.x0 + 60 + k * 220 + rr() * 80, kind: rr(), seed: rr() * 100 });
      return items;
    });
  },

  /* ================= UI ================= */
  bindUI() {
    $('btn-new').onclick = () => { AudioSys.init(); AudioSys.uiClick(); this.newGame(true); };
    $('btn-continue').onclick = () => { AudioSys.init(); AudioSys.uiClick(); this.loadGame(); };
    $('btn-help').onclick = () => { AudioSys.uiClick(); $('help-modal').classList.remove('hidden'); };
    $('help-close').onclick = () => { AudioSys.uiClick(); $('help-modal').classList.add('hidden'); };
    $('note-close').onclick = () => this.closeNote();
    $('btn-resume').onclick = () => this.togglePause(false);
    $('btn-mute2').onclick = () => { const m = AudioSys.toggleMute(); $('btn-mute2').textContent = m ? '🔇 Звук: выкл' : '🔊 Звук: вкл'; this.syncMuteBtn(); };
    $('btn-restart').onclick = () => { AudioSys.uiClick(); this.togglePause(false); this.newGame(true); };
    $('btn-quit-title').onclick = () => { AudioSys.uiClick(); this.toTitle(); };
    $('btn-retry').onclick = () => { AudioSys.uiClick(); this.retry(); };
    $('btn-dead-title').onclick = () => { AudioSys.uiClick(); this.toTitle(); };
    $('btn-again').onclick = () => { AudioSys.uiClick(); this.newGame(true); };
    $('btn-win-title').onclick = () => { AudioSys.uiClick(); this.toTitle(); };
    $('mute-btn').onclick = () => { AudioSys.init(); AudioSys.toggleMute(); this.syncMuteBtn(); };
    $('cs-next').onclick = () => this.csNext();
    $('cs-skip').onclick = () => this.csSkip();
    // параллакс титула
    $('title-screen').addEventListener('mousemove', e => {
      const dx = (e.clientX / window.innerWidth - 0.5), dy = (e.clientY / window.innerHeight - 0.5);
      $('title-inner').style.transform = `perspective(800px) rotateY(${dx * 6}deg) rotateX(${-dy * 6}deg)`;
    });
  },
  syncMuteBtn() { $('mute-btn').textContent = AudioSys.muted ? '🔇' : '🔊'; },

  newGame(withCutscene) {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
    $('btn-continue').classList.add('hidden');
    this.buildWorld();
    this.player = new Player(PLAYER_START.x, PLAYER_START.y);
    this.playTime = 0; this.curRoom = -1;
    Camera.reset(this.player.cx());
    $('dead-screen').classList.add('hidden');
    $('win-screen').classList.add('hidden');
    $('pause-menu').classList.add('hidden');
    $('title-screen').classList.add('hidden');
    this.refreshHUD();
    if (withCutscene) this.startCutscene();
    else this.startPlay();
  },
  toTitle() {
    this.state = 'title'; this.paused = false; this.noteId = null;
    $('title-screen').classList.remove('hidden');
    $('hud').classList.add('hidden');
    $('pause-menu').classList.add('hidden');
    $('dead-screen').classList.add('hidden');
    $('win-screen').classList.add('hidden');
    $('cutscene').classList.add('hidden');
    $('note-modal').classList.add('hidden');
    if (this.hasSave()) $('btn-continue').classList.remove('hidden');
  },
  startPlay() {
    this.state = 'play'; this.paused = false;
    $('cutscene').classList.add('hidden');
    $('title-screen').classList.add('hidden');
    $('hud').classList.remove('hidden');
    $('fade').style.opacity = 0;
    this.refreshHUD();
    this.toast('🕯 Найди 8 записок. Выживи. Вспомни.', 'gold');
    setTimeout(() => { if (this.state === 'play') this.subtitle('Так… где я?.. Голова пустая. Надо осмотреться. [E — обыскать каталку]'); }, 1200);
  },

  /* ================= КАТСЦЕНА ================= */
  startCutscene() {
    this.state = 'cutscene';
    $('title-screen').classList.add('hidden');
    $('cutscene').classList.remove('hidden');
    // строим 3D-коридор
    const cor = $('cs-corridor'); cor.innerHTML = ''; this.csSegs = [];
    for (let i = 0; i < 16; i++) {
      const d = document.createElement('div');
      d.className = 'cs-seg';
      cor.appendChild(d);
      this.csSegs.push({ el: d, z: -i * 110 });
    }
    this.csRain = [];
    for (let i = 0; i < 130; i++) this.csRain.push({ x: Math.random() * 1280, y: Math.random() * 720, v: 700 + Math.random() * 600 });
    this.csIndex = 0; this.csChar = 0; this.csTimer = 0;
    this.csShow(0);
  },
  csShow(i) {
    const s = CUTSCENE[i];
    $('cs-title').textContent = s.title;
    $('cs-text').textContent = '';
    this.csChar = 0;
    $('cs-progress').textContent = `${i + 1} / ${CUTSCENE.length}`;
    $('cs-next').textContent = i === CUTSCENE.length - 1 ? 'Играть ▶' : 'Далее ▶';
    $('cs-figure').style.opacity = s.fx.figure;
    AudioSys.thunder();
  },
  csNext() {
    AudioSys.uiClick();
    const full = CUTSCENE[this.csIndex].text;
    if (this.csChar < full.length) { this.csChar = full.length; $('cs-text').textContent = full; return; }
    if (this.csIndex < CUTSCENE.length - 1) { this.csIndex++; this.csShow(this.csIndex); }
    else this.startPlay();
  },
  csSkip() { AudioSys.uiClick(); this.startPlay(); },
  updateCutscene(dt) {
    const s = CUTSCENE[this.csIndex];
    // печатная машинка
    if (this.csChar < s.text.length) {
      this.csTimer += dt;
      const n = Math.floor(this.csTimer / 0.018);
      if (n > 0) {
        this.csTimer = 0;
        this.csChar = Math.min(s.text.length, this.csChar + n);
        $('cs-text').textContent = s.text.slice(0, this.csChar);
        if (this.csChar % 3 === 0) AudioSys.tone(900 + Math.random() * 400, 0.02, 'square', 0.02);
      }
    }
    // 3D коридор летит на камеру
    const speed = 130 * (s.fx.speed || 1);
    for (const sg of this.csSegs) {
      sg.z += speed * dt;
      if (sg.z > 120) sg.z -= 16 * 110;
      sg.el.style.transform = `translate(-50%,-50%) translateZ(${sg.z.toFixed(1)}px)`;
      const sc = clamp(1 + sg.z / 900, 0.2, 1.3);
      sg.el.style.width = (430 * sc) + 'px'; sg.el.style.height = (330 * sc) + 'px';
      sg.el.style.opacity = clamp(1.2 + sg.z / 700, 0.05, 1);
    }
    // тряска + сирена
    const sh = s.fx.shake || 0;
    $('cs-scene').style.transform = sh ? `translate(${rand(-sh, sh)}px,${rand(-sh, sh)}px)` : '';
    $('cs-siren').style.opacity = (s.fx.siren || 0) * (0.5 + Math.sin(performance.now() / 280) * 0.5);
    // дождь
    const rc = $('cs-rain').getContext('2d');
    rc.clearRect(0, 0, 1280, 720);
    rc.strokeStyle = 'rgba(150,190,200,0.35)'; rc.lineWidth = 1.5;
    rc.beginPath();
    for (const d of this.csRain) {
      d.y += d.v * dt; d.x -= d.v * 0.15 * dt;
      if (d.y > 720) { d.y = -10; d.x = Math.random() * 1400; }
      rc.moveTo(d.x, d.y); rc.lineTo(d.x + 4, d.y + 16);
    }
    rc.stroke();
    if (Input.pressed['Escape'] || Input.pressed['Space'] && this.csChar >= s.text.length) { /* мягко: только кнопки */ }
  },

  /* ================= СОХРАНЕНИЯ ================= */
  hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } },
  save(silent) {
    if (this.state !== 'play' || this.bossStarted && !this.bossDead) return;
    const p = this.player;
    const data = {
      v: 1, px: p.x, py: p.y, hp: p.hp, st: p.st, san: p.san, cur: p.cur,
      weapons: p.weapons, mag: p.mag, reserve: p.reserve, medkits: p.medkits, pills: p.pills,
      keys: p.keys, notes: p.notes, time: this.playTime, kills: p.kills,
      openedF: this.furniture.filter(f => f.opened).map(f => f.id),
      openDoors: this.doors.filter(d => d.open).map(d => d.id),
      takenP: this.pickups.filter(k => k.taken).map(k => k.id),
      deadG: this.ghosts.map((g, i) => g.dead ? i : -1).filter(i => i >= 0),
    };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
    if (!silent) this.toast('💾 Автосохранение…', '');
  },
  loadGame() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { /* ignore */ }
    if (!d) { this.newGame(true); return; }
    this.buildWorld();
    this.player = new Player(d.px, d.py);
    Object.assign(this.player, {
      hp: d.hp, st: d.st, san: d.san, cur: d.cur, weapons: d.weapons,
      mag: d.mag, reserve: d.reserve, medkits: d.medkits, pills: d.pills,
      keys: d.keys, notes: d.notes, kills: d.kills || 0,
    });
    this.playTime = d.time || 0;
    for (const id of d.openedF || []) { const f = this.furniture.find(f => f.id === id); if (f) f.opened = true; }
    for (const id of d.openDoors || []) { const dr = this.doors.find(d => d.id === id); if (dr) { dr.open = true; dr.anim = 1; } }
    for (const id of d.takenP || []) { const k = this.pickups.find(k => k.id === id); if (k) k.taken = true; }
    for (const i of d.deadG || []) if (this.ghosts[i]) { this.ghosts[i].dead = true; this.ghosts[i].dieT = 0; }
    this.ghosts = this.ghosts.filter(g => !g.dead);
    Camera.reset(this.player.cx());
    this.curRoom = -1;
    this.startPlay();
    this.subtitle('Ты очнулся. Голова гудит… Надо продолжать.');
  },
  retry() {
    $('dead-screen').classList.add('hidden');
    if (this.hasSave()) this.loadGame();
    else this.newGame(false);
  },

  /* ================= ФИЗИКА ================= */
  moveAndCollide(e, dt, isPlayer) {
    // X
    e.x += e.vx * dt;
    e.x = clamp(e.x, 8, WORLD.w - 8 - e.w);
    for (const s of this.solids) {
      if (aabb(e, s)) {
        if (e.vx > 0) e.x = s.x - e.w; else if (e.vx < 0) e.x = s.x + s.w;
        e.vx = 0;
      }
    }
    for (const d of this.doors) {
      if (!d.solid) continue;
      const box = { x: d.x - d.w / 2, y: d.y, w: d.w, h: d.h };
      if (aabb(e, box)) {
        if (e.vx > 0) e.x = box.x - e.w; else if (e.vx < 0) e.x = box.x + box.w;
        if (isPlayer && Math.abs(e.vy) < 1 && e.y + e.h > box.y + 30) { /* упёрся в дверь */ }
        e.vx = 0;
      }
    }
    // Y
    e.y += e.vy * dt;
    e.onGround = false; e.onSolidGround = false;
    if (e.y + e.h >= WORLD.ground) { e.y = WORLD.ground - e.h; e.vy = 0; e.onGround = true; e.onSolidGround = true; }
    for (const s of this.solids) {
      if (aabb(e, s)) {
        if (e.vy > 0 && e.y + e.h - s.y < 40) { e.y = s.y - e.h; e.vy = 0; e.onGround = true; e.onSolidGround = true; }
        else if (e.vy < 0) { e.y = s.y + s.h; e.vy = 0; }
        else if (e.vy > 0) { e.y = s.y - e.h; e.vy = 0; e.onGround = true; e.onSolidGround = true; }
      }
    }
    if (isPlayer) { // one-way платформы
      if (!(e.dropT > 0) && e.vy >= 0) {
        for (const p of this.platforms) {
          if (p.t !== 'one') continue;
          const prevFeet = e.y + e.h - e.vy * dt;
          if (prevFeet <= p.y + 6 && e.y + e.h >= p.y && e.y + e.h <= p.y + 26 && e.x + e.w > p.x + 2 && e.x < p.x + p.w - 2) {
            e.y = p.y - e.h; e.vy = 0; e.onGround = true;
          }
        }
      }
      if (this.bossStarted && !this.bossDead) e.x = Math.max(e.x, 4560); // арена закрыта
    } else if (e.type === 'spider' || e.type === 'double' || e.type === 'whisper') {
      if (e.vy >= 0) for (const p of this.platforms) {
        if (p.t !== 'one') continue;
        const prevFeet = e.y + e.h - e.vy * dt;
        if (prevFeet <= p.y + 6 && e.y + e.h >= p.y && e.y + e.h <= p.y + 26 && e.x + e.w > p.x + 2 && e.x < p.x + p.w - 2) {
          e.y = p.y - e.h; e.vy = 0; e.onGround = true;
        }
      }
    }
  },

  /* ================= БОЙ ================= */
  meleeHit(box, dmg, dirx, player) {
    let hit = false;
    for (const g of this.ghosts) {
      if (g.dead) continue;
      if (aabb(box, g)) { g.takeDamage(dmg, this, dirx); hit = true; }
    }
    if (this.boss && !this.boss.dead && aabb(box, this.boss)) { this.boss.takeDamage(dmg, this, dirx); hit = true; }
    if (hit) { AudioSys.hitFlesh(); Camera.shake(0.18); }
  },
  pistolShot(x, y, ang) {
    const len = 950;
    const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
    let bestT = 1, bestG = null, bestBoss = false;
    const testPt = (px, py, r) => {
      const dx = ex - x, dy = ey - y;
      const t = clamp(((px - x) * dx + (py - y) * dy) / (len * len), 0, 1);
      const qx = x + dx * t, qy = y + dy * t;
      return dist(px, py, qx, qy) < r ? t : -1;
    };
    for (const g of this.ghosts) {
      if (g.dead) continue;
      const t = testPt(g.cx(), g.cy(), Math.max(g.w, g.h) * 0.55);
      if (t >= 0 && t < bestT) { bestT = t; bestG = g; bestBoss = false; }
    }
    if (this.boss && !this.boss.dead) {
      const t = testPt(this.boss.cx(), this.boss.cy(), 60);
      if (t >= 0 && t < bestT) { bestT = t; bestG = this.boss; bestBoss = true; }
    }
    // закрытые двери останавливают пулю
    for (const d of this.doors) {
      if (!d.solid) continue;
      if ((x < d.x) !== (ex < d.x)) {
        const t = (d.x - x) / (ex - x);
        const qy = y + (ey - y) * t;
        if (t >= 0 && t < bestT && qy > d.y && qy < d.y + d.h) { bestT = t; bestG = null; }
      }
    }
    const hx = x + (ex - x) * bestT, hy = y + (ey - y) * bestT;
    this.effects.push({ kind: 'tracer', x1: x, y1: y, x2: hx, y2: hy, t: 0, dur: 0.14 });
    Particles.spark(hx, hy, 6);
    if (bestG) {
      if (bestBoss) bestG.takeDamage(WEAPONS.pistol.dmg, this, Math.sign(Math.cos(ang)));
      else bestG.takeDamage(WEAPONS.pistol.dmg, this, Math.sign(Math.cos(ang)));
      AudioSys.hitFlesh();
    }
    // выстрел будит всех вокруг
    for (const g of this.ghosts) if (dist(g.cx(), g.cy(), x, y) < 800) g.alertT = 4;
  },
  spawnProjectile(o) { this.projectiles.push(new Projectile(o)); },
  spawnGhost(type, x, leash) {
    const g = new Ghost(type, x, leash);
    this.ghosts.push(g);
    Particles.soul(g.cx(), g.cy(), 12);
    return g;
  },
  summonMinions(x, phase) {
    if (this.ghosts.filter(g => !g.dead).length >= 5) return;
    const types = phase >= 3 ? ['whisper', 'double'] : ['whisper', 'whisper'];
    for (const t of types) {
      const gx = clamp(x + rand(-260, 260), 4560, 5160);
      this.spawnGhost(t, gx, [4540, 5180]);
    }
    this.toast('☠ Тамик призвал тварей из твоей головы!', 'red');
  },
  onGhostKilled(g) {
    this.player.kills++;
    this.player.san = clamp(this.player.san + 6, 0, 100);
    Floaters.add(g.cx(), g.cy() - 30, GHOST_NAMES[g.type] + ' повержен', '#ffd166', 15);
    const r = Math.random();
    if (r < 0.22) { this.player.pills = Math.min(5, this.player.pills + 1); this.toast('💊 Из тени выпали пилюли', ''); }
    else if (r < 0.42) { this.player.reserve += 6; this.toast('🔸 +6 патронов', ''); }
    else if (r < 0.5) { this.player.medkits = Math.min(5, this.player.medkits + 1); this.toast('🩹 Тень оставила бинты', ''); }
    this.refreshHUD();
  },
  ghostPressure(x, y) {
    let s = 0;
    for (const g of this.ghosts) {
      if (g.dead) continue;
      const d = dist(x, y, g.cx(), g.cy());
      if (d < 260) s += 1 - d / 260;
    }
    if (this.boss && !this.boss.dead && dist(x, y, this.boss.cx(), this.boss.cy()) < 480) s += 0.8;
    return clamp(s, 0, 1.5);
  },

  /* ================= СВЕТ: запросы ================= */
  flashLit(x, y) {
    const p = this.player;
    if (!p || !p.flashOn || p.dead) return 0;
    const dx = x - p.handX, dy = y - p.handY;
    const d = Math.hypot(dx, dy);
    if (d > 560 || d < 1) return d < 90 ? 0.6 : 0;
    let da = Math.atan2(dy, dx) - p.aim;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    if (Math.abs(da) > 0.34) return 0;
    return clamp(1.1 - d / 560, 0, 1);
  },
  lampLit(x, y) {
    let m = 0;
    for (const l of this.lamps) {
      if (l.level < 0.05) continue;
      const d = dist(x, y, l.x, l.y + 60);
      if (d < l.r) m = Math.max(m, (1 - d / l.r) * l.level);
    }
    return m;
  },

  /* ================= ВЗАИМОДЕЙСТВИЕ ================= */
  findInteract() {
    const p = this.player;
    if (p.dead || p.channel) return null;
    let best = null, bestD = 1e9;
    for (const k of this.pickups) {
      if (k.taken) continue;
      const d = dist(p.cx(), p.cy(), k.x, k.y - 20);
      if (d < 95 && d < bestD) { bestD = d; best = { type: 'pickup', o: k, label: k.label() }; }
    }
    for (const f of this.furniture) {
      if (f.opened) continue;
      const d = dist(p.cx(), p.cy(), f.cx(), f.y + f.h / 2);
      if (d < 110 && d < bestD) { bestD = d; best = { type: 'furn', o: f, label: f.label() }; }
    }
    for (const dr of this.doors) {
      if (dr.open) continue;
      if (dr.id === 'd_boss' && this.bossStarted && !this.bossDead) continue; // арена заперта изнутри
      const d = Math.abs(p.cx() - dr.x);
      if (d < 85 && p.y + p.h > dr.y && d < bestD) {
        bestD = d;
        best = { type: 'door', o: dr, label: this.doorLabel(dr) };
      }
    }
    return best;
  },
  doorLabel(dr) {
    const p = this.player;
    if (!dr.locked) return `Открыть: ${dr.name}`;
    if (dr.locked === 'pick') {
      if (!p.weapons.pick) return '🔒 Заперто. Нужна ЗАТЫЧКА (обыщи шкафчики Процедурной)';
      if (p.cur !== 'pick') return '🔒 Возьми в руки ЗАТЫЧКУ [4], чтобы вскрыть';
      return `🔓 Вскрыть: ${dr.name} (будет шумно!)`;
    }
    if (dr.locked === 'key_red') {
      if (!p.keys.key_red) return '🔒 Архив заперт. Нужен КРАСНЫЙ КЛЮЧ (Изолятор)';
      return '🔑 Открыть красным ключом';
    }
    if (dr.locked === 'boss') {
      if (p.notes.length < 4) return `☠ Дверь не узнаёт тебя. Записок: ${p.notes.length}/4 минимум`;
      if (!p.weapons.pick) return '☠ Нужна ЗАТЫЧКА (Процедурная, шкафчики)';
      if (p.cur !== 'pick') return '☠ Возьми в руки ЗАТЫЧКУ [4]';
      return '☠ ОТКРЫТЬ ДВЕРЬ ТАМИКА. Назад пути не будет.';
    }
    return 'Открыть';
  },
  doInteract(t) {
    const p = this.player;
    if (t.type === 'pickup') this.takePickup(t.o);
    else if (t.type === 'furn') {
      AudioSys.search();
      p.channel = { t: 0, dur: 0.9, label: 'Обыск…', noisy: false, onDone: () => this.openFurniture(t.o) };
    } else if (t.type === 'door') this.tryDoor(t.o);
  },
  tryDoor(dr) {
    const p = this.player;
    if (!dr.locked) { dr.open = true; AudioSys.door(); this.save(true); return; }
    if (dr.locked === 'pick') {
      if (!p.weapons.pick || p.cur !== 'pick') { AudioSys.locked(); Camera.shake(0.1); return; }
      p.channel = {
        t: 0, dur: 2.4, label: 'Вскрытие замка затычкой…', noisy: true,
        onDone: () => { dr.open = true; AudioSys.unlock(); AudioSys.door(); this.toast(`🔓 Открыто: ${dr.name}`, 'gold'); this.save(true); }
      };
    } else if (dr.locked === 'key_red') {
      if (!p.keys.key_red) { AudioSys.locked(); return; }
      dr.open = true; AudioSys.unlock(); AudioSys.door();
      this.toast('🔑 Красный ключ провернулся… Архив открыт', 'gold');
      this.subtitle('Холодом тянет. Фонарь не выключать. Ни за что.');
      this.save(true);
    } else if (dr.locked === 'boss') {
      if (p.notes.length < 4 || !p.weapons.pick || p.cur !== 'pick') { AudioSys.locked(); AudioSys.whisper(); return; }
      p.channel = {
        t: 0, dur: 3.2, label: 'Дверь узнаёт тебя…', noisy: true,
        onDone: () => {
          dr.open = true; AudioSys.unlock(); AudioSys.door(); AudioSys.bossRoar();
          this.toast('☠ Дверь открылась. ОН ждёт.', 'red');
          this.subtitle('«А-а-а… Двенадцатый. Заходи. Я тебя ждал».');
          Camera.shake(0.6);
          this.save(true);
        }
      };
    }
  },
  openFurniture(f) {
    if (f.opened) return;
    f.opened = true;
    AudioSys.pickup();
    let gotNote = false;
    for (const code of f.loot) {
      if (code === 'nothing') continue;
      if (code === 'trap') {
        const p = this.player;
        const rm = ROOMS.find(r => f.x >= r.x0 && f.x < r.x1) || ROOMS[0];
        this.spawnGhost('whisper', f.cx() + 60, [rm.x0 + 20, rm.x1 - 20]);
        AudioSys.sting(); Camera.shake(0.5);
        this.toast('😱 ЗАСАДА! Из мебели вырвался Шептун!', 'red');
        p.san = clamp(p.san - 10, 0, 100);
        continue;
      }
      if (code.startsWith('note:')) { this.openNote(+code.split(':')[1]); gotNote = true; continue; }
      this.applyLoot(code);
    }
    if (!gotNote && f.loot.every(c => c === 'nothing')) this.toast('Пусто. Только пыль и чей-то волос…', '');
    this.refreshHUD();
    this.save(true);
  },
  takePickup(k) {
    if (k.taken) return;
    k.taken = true;
    AudioSys.pickup();
    Particles.spark(k.x, k.y - 20, 10);
    const code = k.kind;
    if (code.startsWith('note:')) this.openNote(+code.split(':')[1]);
    else this.applyLoot(code);
    this.refreshHUD();
    this.save(true);
  },
  applyLoot(code) {
    const p = this.player;
    if (code === 'knife') { p.weapons.knife = true; p.cur = 'knife'; this.toast('🔪 Найден НОЖ! [2] — режь тени', 'gold'); this.subtitle('Скальпель. Острый. Теперь они меня боятся.'); }
    else if (code === 'pistol') { p.weapons.pistol = true; p.cur = 'pistol'; p.mag = 7; this.toast('🔫 Найден ПИСТОЛЕТ! [3] — целься мышью', 'gold'); this.subtitle('Табельный ПМ охранника. Семь патронов. Громкий — тени сбегутся.'); }
    else if (code === 'pick') { p.weapons.pick = true; p.cur = 'pick'; this.toast('🥄 Найдена ЗАТЫЧКА! [4] — открывает замки', 'gold'); this.subtitle('Гнутая ложка. Кто-то уже вскрывал ею замки… и не вернулся.'); }
    else if (code === 'key_red') { p.keys.key_red = true; this.toast('🔑 КРАСНЫЙ КЛЮЧ — путь в Архив открыт', 'gold'); }
    else if (code === 'medkit') { p.medkits = Math.min(5, p.medkits + 1); this.toast('🩹 +1 аптечка [Q]', ''); }
    else if (code === 'pills') { p.pills = Math.min(5, p.pills + 1); this.toast('💊 +1 пилюли [T]', ''); }
    else if (code.startsWith('ammo')) { const n = +code.split(':')[1]; p.reserve += n; this.toast(`🔸 +${n} патронов (всего ${p.reserve})`, ''); }
  },

  /* ================= ЗАПИСКИ ================= */
  openNote(id) {
    if (this.player.notes.includes(id)) return;
    this.player.notes.push(id);
    this.noteId = id;
    AudioSys.note();
    const n = NOTES[id];
    $('note-title').textContent = n.title;
    $('note-body').textContent = n.body;
    $('note-count').textContent = `Записок: ${this.player.notes.length}/8`;
    $('note-modal').classList.remove('hidden');
    this.refreshHUD();
    this.save(true);
  },
  closeNote() {
    if (this.noteId === null) return;
    this.noteId = null;
    AudioSys.uiClick();
    $('note-modal').classList.add('hidden');
    const n = this.player.notes.length;
    if (n === 4) this.subtitle('Четыре записки… Красная дверь теперь узнает меня. Вперёд — в конец коридора В.');
    else if (n === 8) { this.subtitle('Все восемь. Я ВСПОМНИЛ. Прости, Тимка. Теперь — за Тамиком.'); this.toast('📄 ВСЕ ЗАПИСКИ СОБРАНЫ!', 'gold'); }
  },

  /* ================= СМЕРТЬ / ПОБЕДА ================= */
  onDeath() {
    AudioSys.bossDie && AudioSys.sting();
    Camera.shake(0.8);
    this.deathT = 1.4;
  },
  showDeadScreen() {
    this.state = 'dead';
    $('dead-quote').textContent = DEAD_QUOTES[(Math.random() * DEAD_QUOTES.length) | 0];
    $('dead-screen').classList.remove('hidden');
    $('boss-bar').classList.add('hidden');
  },
  onBossDeath() {
    this.bossDead = true;
    $('boss-bar').classList.add('hidden');
    // все миньоны рассыпаются
    for (const g of this.ghosts) if (!g.dead) { g.dead = true; g.dieT = 0.6; Particles.soul(g.cx(), g.cy(), 16); }
    const dr = this.doors.find(d => d.id === 'd_boss');
    if (dr) dr.open = true;
    this.toast('☠ ТАМИК МЁРТВ. Тишина лопается…', 'gold');
    this.player.san = clamp(this.player.san + 40, 0, 100);
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
    $('btn-continue').classList.add('hidden');
    this.winT = 3.0;
  },
  showWinScreen() {
    this.state = 'win';
    const n = this.player.notes.length;
    const e = n >= 8 ? ENDINGS.good : ENDINGS.bad;
    $('win-ending').textContent = e.title;
    $('win-ending').style.color = n >= 8 ? '#ffd166' : '#ff5c6c';
    $('win-text').textContent = e.text;
    const mm = String(Math.floor(this.playTime / 60)).padStart(2, '0'), ss = String(Math.floor(this.playTime % 60)).padStart(2, '0');
    $('win-stats').textContent = `⏱ Время: ${mm}:${ss} • 💀 Тварей убито: ${this.player.kills} • 📄 Записок: ${n}/8` +
      (n < 8 ? '\n(Собери все 8 записок, чтобы увидеть истинную концовку…)' : '\n(Истинная концовка открыта. Ты вспомнил всё.)');
    $('win-screen').classList.remove('hidden');
    $('hud').classList.add('hidden');
  },

  /* ================= HUD ================= */
  toast(text, cls) {
    const w = $('toast-wrap');
    const d = document.createElement('div');
    d.className = 'toast ' + (cls || '');
    d.textContent = text;
    w.appendChild(d);
    while (w.children.length > 4) w.removeChild(w.firstChild);
    setTimeout(() => { d.style.transition = 'opacity .5s'; d.style.opacity = 0; setTimeout(() => d.remove(), 500); }, 3000);
  },
  subtitle(text, dur = 4.5) {
    const s = $('subtitle');
    s.textContent = text;
    s.classList.remove('hidden');
    clearTimeout(this._subT);
    this._subT = setTimeout(() => s.classList.add('hidden'), dur * 1000);
  },
  showChannel(k, label) {
    $('channel-bar').classList.remove('hidden');
    $('channel-fill').style.width = (k * 100) + '%';
    $('channel-label').textContent = label;
  },
  hideChannel() { $('channel-bar').classList.add('hidden'); },
  damageFlash() { this.dmgFlash = 1; $('damage-flash').style.opacity = 0.9; },
  objectiveText() {
    const p = this.player;
    if (this.bossDead) return '…';
    if (this.bossStarted) return '☠ УБЕЙ ТАМИКА! Свети в него и стреляй!';
    if (!p.weapons.knife) return '🎯 Осмотри Приёмную и Палату №1. Найди НОЖ 🔪';
    if (!p.weapons.pistol) return '🎯 Процедурная: заберись на полки — там ПИСТОЛЕТ 🔫';
    if (!p.weapons.pick) return '🎯 Процедурная: обыщи шкафчики — найди ЗАТЫЧКУ 🥄';
    if (!this.doors.find(d => d.id === 'd_red').open) return '🎯 Найди КРАСНЫЙ КЛЮЧ 🔑 и открой Архив';
    if (p.notes.length < 4) return `🎯 Собери записки (${p.notes.length}/4 мин.) — дверь Тамика ждёт`;
    return '🎯 Коридор В → красная дверь [затычка в руках] → ТАМИК ☠';
  },
  refreshHUD() {
    const p = this.player;
    if (!p) return;
    $('notes-num').textContent = `${p.notes.length}/8`;
    $('objective').textContent = this.objectiveText();
    // инвентарь
    const inv = $('inventory');
    inv.innerHTML = '';
    ORDER.forEach((wid, i) => {
      const w = WEAPONS[wid], owned = p.weapons[wid];
      const d = document.createElement('div');
      d.className = 'inv-slot' + (p.cur === wid ? ' active' : '') + (owned ? '' : ' locked');
      d.title = w.name + ' — ' + w.desc;
      d.innerHTML = `<span class="key">${i + 1}</span>${w.icon}<span class="nm">${w.name}</span>`;
      if (owned) d.onclick = () => { p.cur = wid; p.reloadT = 0; AudioSys.uiClick(); this.refreshHUD(); };
      inv.appendChild(d);
    });
    const cons = [
      { icon: '🩹', nm: 'Аптечка', key: 'Q', cnt: p.medkits, fn: () => p.useMedkit(this) },
      { icon: '💊', nm: 'Пилюли', key: 'T', cnt: p.pills, fn: () => p.usePills(this) },
      { icon: '🔸', nm: 'Патроны', key: '', cnt: p.reserve, fn: null },
    ];
    if (p.keys.key_red) cons.push({ icon: '🔑', nm: 'Ключ', key: '', cnt: '', fn: null });
    for (const c of cons) {
      const d = document.createElement('div');
      d.className = 'inv-slot cons';
      d.title = c.nm;
      d.innerHTML = `${c.key ? `<span class="key">${c.key}</span>` : ''}${c.icon}${c.cnt !== '' ? `<span class="cnt">${c.cnt}</span>` : ''}<span class="nm">${c.nm}</span>`;
      if (c.fn) d.onclick = () => { c.fn(); };
      inv.appendChild(d);
    }
    // рука
    const w = WEAPONS[p.cur];
    $('hand-icon').textContent = w.icon;
    $('hand-name').textContent = w.name;
    $('hand-ammo').textContent = p.cur === 'pistol'
      ? (p.reloadT > 0 ? '…перезарядка…' : `▮ ${p.mag} / ${p.reserve} [R]`)
      : (p.cur === 'pick' ? 'E — вскрыть замок' : 'ЛКМ — ударить');
  },
  drawPortrait() {
    const pc = $('portrait').getContext('2d');
    const p = this.player, t = performance.now() / 1000;
    pc.clearRect(0, 0, 96, 96);
    // фон
    const g = pc.createLinearGradient(0, 0, 0, 96);
    g.addColorStop(0, '#141a1c'); g.addColorStop(1, '#07090a');
    pc.fillStyle = g; pc.fillRect(0, 0, 96, 96);
    const dead = p.dead, lowhp = p.hp < 30, insane = p.san < 30, tired = p.exhausted || p.st < 20;
    pc.save(); pc.translate(48, 52);
    if (dead) pc.rotate(0.4);
    // шея+плечи
    pc.fillStyle = dead ? '#8a7a6a' : '#c9a184';
    pc.fillRect(-9, 26, 18, 22);
    pc.fillStyle = '#7d94a0';
    pc.beginPath(); pc.moveTo(-34, 48); pc.lineTo(-12, 32); pc.lineTo(12, 32); pc.lineTo(34, 48); pc.closePath(); pc.fill();
    // голова
    pc.fillStyle = dead ? '#a89a8a' : insane ? '#c4b0a8' : '#d8b89a';
    pc.beginPath(); pc.ellipse(0, 0, 26, 31, 0, 0, 7); pc.fill();
    // волосы
    pc.fillStyle = '#3a2818';
    pc.beginPath(); pc.ellipse(0, -24, 26, 14, 0, Math.PI, 0); pc.fill();
    for (let i = 0; i < 7; i++) pc.fillRect(-24 + i * 7, -34 + (i % 2) * 3, 7, 8);
    // повязка
    pc.fillStyle = '#cfc4ae'; pc.fillRect(-26, -22, 52, 10);
    pc.fillStyle = '#a31621'; pc.beginPath(); pc.ellipse(-13, -17, 6, 4.5, 0, 0, 7); pc.fill();
    // глаза
    const blink = !dead && (Math.sin(t * 2.3) > 0.985);
    const lookX = clamp(Math.cos(p.aim) * 4, -4, 4), lookY = clamp(Math.sin(p.aim) * 3, -3, 3);
    for (const s of [-1, 1]) {
      const ex = s * 11, ey = -2;
      if (dead) { // X X
        pc.strokeStyle = '#3a0a0a'; pc.lineWidth = 3;
        pc.beginPath(); pc.moveTo(ex - 5, ey - 5); pc.lineTo(ex + 5, ey + 5); pc.moveTo(ex + 5, ey - 5); pc.lineTo(ex - 5, ey + 5); pc.stroke();
      } else if (blink) {
        pc.strokeStyle = '#2a1a1a'; pc.lineWidth = 2.4;
        pc.beginPath(); pc.moveTo(ex - 6, ey); pc.lineTo(ex + 6, ey); pc.stroke();
      } else {
        pc.fillStyle = lowhp ? '#e8b0b0' : '#fff';
        pc.beginPath(); pc.ellipse(ex, ey, 6.5, insane ? 8 : 7, 0, 0, 7); pc.fill();
        // сосуды при безумии
        if (insane) { pc.strokeStyle = 'rgba(150,40,150,0.8)'; pc.lineWidth = 1; pc.beginPath(); pc.moveTo(ex - 6, ey - 3); pc.lineTo(ex + 6, ey + 2); pc.stroke(); }
        if (lowhp) { pc.strokeStyle = 'rgba(180,30,30,0.9)'; pc.beginPath(); pc.moveTo(ex - 6, ey + 3); pc.lineTo(ex + 6, ey - 2); pc.stroke(); }
        pc.fillStyle = insane ? '#7b2fbf' : '#181818';
        pc.beginPath(); pc.arc(ex + lookX * 0.6, ey + lookY * 0.6, insane ? 4 : 2.8, 0, 7); pc.fill();
        pc.fillStyle = '#fff'; pc.fillRect(ex + lookX * 0.6 - 1, ey + lookY * 0.6 - 1, 2, 2);
      }
      // синяки
      if (!dead) { pc.fillStyle = 'rgba(60,20,60,0.55)'; pc.fillRect(ex - 7, ey + 8, 14, 4); }
    }
    // щетина
    pc.fillStyle = 'rgba(40,30,25,0.4)'; pc.fillRect(-20, 10, 40, 16);
    // рот
    pc.strokeStyle = '#5a2a2a'; pc.lineWidth = 2.4;
    pc.beginPath();
    if (dead) { pc.moveTo(-8, 20); pc.lineTo(8, 20); }
    else if (lowhp) { pc.arc(0, 24, 6, Math.PI * 1.15, Math.PI * 1.85); }
    else if (insane) { pc.ellipse(3, 20, 4, 6, 0, 0, 7); }
    else if (tired) { pc.moveTo(-6, 20); pc.lineTo(6, 22); }
    else { pc.moveTo(-6, 20); pc.lineTo(6, 19); }
    pc.stroke();
    // пот при усталости
    if (tired && !dead) {
      pc.fillStyle = 'rgba(150,220,255,0.8)';
      const dy = (t * 22) % 26;
      pc.fillRect(18, -8 + dy * 0.4, 3, 5); pc.fillRect(-21, -12 + ((t * 18) % 20) * 0.4, 3, 5);
    }
    // кровь при низком HP
    if (lowhp && !dead) {
      pc.fillStyle = 'rgba(140,15,25,0.85)';
      pc.beginPath(); pc.ellipse(24, 6, 4, 9, 0.2, 0, 7); pc.fill();
      pc.fillRect(-27, -10, 5, 20);
    }
    // безумие — фиолетовые вены
    if (insane && !dead) {
      pc.strokeStyle = 'rgba(150,60,200,0.7)'; pc.lineWidth = 1.6;
      pc.beginPath(); pc.moveTo(-24, 8); pc.quadraticCurveTo(-10, 12, -4, 22); pc.stroke();
      pc.beginPath(); pc.moveTo(24, 2); pc.quadraticCurveTo(12, 8, 8, 20); pc.stroke();
    }
    pc.restore();
    // рамка опасности
    if (lowhp && !dead && Math.sin(t * 6) > 0) { pc.strokeStyle = 'rgba(200,20,30,0.9)'; pc.lineWidth = 4; pc.strokeRect(2, 2, 92, 92); }
  },

  /* ================= ЦИКЛ ================= */
  loop(now) {
    requestAnimationFrame(t => this.loop(t));
    let dt = Math.min(0.033, (now - (this._last || now)) / 1000 || 0.016);
    this._last = now;
    Input.mouse.wx = Input.mouse.sx + Camera.x;
    Input.mouse.wy = Input.mouse.sy + Camera.y;

    if (this.state === 'cutscene') this.updateCutscene(dt);
    else if (this.state === 'play' && !this.paused) this.update(dt);
    else if (this.state === 'title') { this.titleT += dt; }

    if (this.state !== 'title' && this.state !== 'cutscene') this.render();
    // глобальные клавиши
    if (Input.pressed['KeyM']) { AudioSys.toggleMute(); this.syncMuteBtn(); }
    if (this.state === 'play') {
      if (Input.pressed['Escape'] || Input.pressed['KeyP']) {
        if (this.noteId !== null) this.closeNote();
        else this.togglePause();
      }
      if (this.noteId !== null && Input.useHit()) this.closeNote();
    }
    if (this.state === 'dead' && Input.pressed['KeyE']) this.retry();
    Input.endFrame();
  },
  togglePause(force) {
    if (this.state !== 'play') return;
    this.paused = force !== undefined ? force : !this.paused;
    $('pause-menu').classList.toggle('hidden', !this.paused);
    if (this.paused) {
      const p = this.player;
      $('pause-stats').textContent = `📄 Записок: ${p.notes.length}/8 • 💀 Убито: ${p.kills} • ⏱ ${Math.floor(this.playTime / 60)}:${String(Math.floor(this.playTime % 60)).padStart(2, '0')}`;
      AudioSys.uiClick();
    }
  },

  /* ================= UPDATE ================= */
  update(dt) {
    // смерть / победа — задержки
    if (this.player.dead) {
      this.deathT -= dt;
      Particles.update(dt);
      if (this.deathT <= 0 && this.state === 'play') this.showDeadScreen();
      return;
    }
    if (this.bossDead) {
      this.winT -= dt;
      if (this.boss) this.boss.update(dt, this);
      Particles.update(dt); Floaters.update(dt);
      Camera.update(dt, this.player.cx(), this.player.cy());
      if (this.winT <= 0 && this.state === 'play') this.showWinScreen();
      return;
    }
    this.playTime += dt;
    const p = this.player;

    if (this.noteId === null) p.update(dt, this);
    else { p.vx *= 0.9; p.atkCd -= dt; } // в записке стоим

    // лампы мерцают
    for (const l of this.lamps) {
      if (!l.on) { l.level = 0; continue; }
      const target = Math.random() < l.flick * 0.12 ? rand(0.1, 0.5) : 1;
      l.level = lerp(l.level, target, 1 - Math.pow(0.0001, dt));
    }
    // освещённость игрока
    p.lampLit = this.lampLit(p.cx(), p.cy());
    p.lit = Math.max(p.flashOn ? 0.55 : 0, p.lampLit);
    if (this.muzzleT > 0) { this.muzzleT -= dt; p.lit = 1; }

    // двери
    for (const d of this.doors) {
      if (d.id === 'd_boss' && this.bossStarted && !this.bossDead) d.open = false; // арена заперта
      d.update(dt);
    }
    // призраки
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      if (this.noteId === null) { if (!this.ghosts[i].update(dt, this)) this.ghosts.splice(i, 1); }
    }
    // босс-триггер
    if (!this.bossStarted && !this.bossDead && p.cx() > 4600 && this.doors.find(d => d.id === 'd_boss').open) {
      this.bossStarted = true;
      const dr = this.doors.find(d => d.id === 'd_boss');
      dr.open = false;
      this.boss = new Boss(4700);
      AudioSys.bossRoar(); Camera.shake(0.8);
      $('boss-bar').classList.remove('hidden');
      this.subtitle('«ТЫ… ТЫ ВСПОМНИЛ?! НЕВОЗМОЖНО! СЕСТРА! ДЕРЖИ ЕГО! ДЕРЖИ!!!»', 5);
      this.toast('☠ ГЛАВВРАЧ ТАМИК ☠', 'red');
      this.refreshHUD();
    }
    if (this.boss && this.noteId === null) {
      this.boss.update(dt, this);
      $('boss-fill').style.width = (this.boss.hp / this.boss.maxhp * 100) + '%';
    }
    // снаряды
    if (this.noteId === null) {
      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        this.projectiles[i].update(dt, this);
        if (this.projectiles[i].dead) this.projectiles.splice(i, 1);
      }
    }
    // эффекты
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.t += dt;
      if (e.kind === 'ring') {
        e.r = lerp(e.max, 10, 1 - e.t / e.dur);
        if (e.dmg && !e.hitDone) {
          const d = dist(p.cx(), p.cy(), e.x, e.y);
          if (Math.abs(d - e.r) < 46) {
            e.hitDone = true;
            p.takeDamage(e.dmg, this);
            p.san = clamp(p.san - e.san, 0, 100);
            Floaters.add(p.cx(), p.y - 14, `-${e.san} RASS`, '#c77dff', 16);
          }
        }
      }
      if (e.t >= e.dur) this.effects.splice(i, 1);
    }
    Particles.update(dt); Floaters.update(dt);
    // туман
    for (const f of this.fogBlobs) {
      f.x += f.vx * dt;
      if (f.x - f.w / 2 > WORLD.w) f.x = -f.w / 2;
    }
    // камера
    Camera.update(dt, p.cx() + p.face * 60, p.cy());
    // комната
    const ri = ROOMS.findIndex(r => p.cx() >= r.x0 && p.cx() < r.x1);
    if (ri >= 0 && ri !== this.curRoom) {
      this.curRoom = ri;
      this.toast(`▚ ${ROOMS[ri].name}`, '');
      this.subtitle(ROOMS[ri].sub, 4);
      this.save(true);
    }
    // взаимодействие
    this.interactTarget = this.findInteract();
    const pr = $('interact-prompt');
    if (this.interactTarget && this.noteId === null) {
      pr.innerHTML = `<b>E</b>${this.interactTarget.label}`;
      pr.classList.remove('hidden');
      if (Input.useHit()) this.doInteract(this.interactTarget);
    } else pr.classList.add('hidden');
    // шёпот безумия
    if (p.san < 32) {
      this.whisperT -= dt;
      if (this.whisperT <= 0) {
        this.whisperT = rand(5, 11);
        AudioSys.whisper();
        this.subtitle('«' + WHISPERS[(Math.random() * WHISPERS.length) | 0] + '»', 3.5);
      }
    }
    // фейковые силуэты при сильном безумии
    if (p.san < 22) {
      this.fakeT -= dt;
      if (this.fakeT <= 0) {
        this.fakeT = rand(6, 12);
        this.effects.push({ kind: 'fake', x: p.cx() + (Math.random() < 0.5 ? -1 : 1) * rand(200, 420), t: 0, dur: 0.5 });
        AudioSys.sting();
      }
    }
    // режиссёр: тьма рождает тварей
    this.directorT -= dt;
    if (this.directorT <= 0) {
      this.directorT = 22;
      const alive = this.ghosts.filter(g => !g.dead).length;
      if (alive < 5 && (p.san < 45 || this.bossStarted) && !this.bossDead) {
        const side = Math.random() < 0.5 ? -1 : 1;
        const gx = clamp(p.cx() + side * rand(620, 760), 40, WORLD.w - 40);
        const rm = ROOMS.find(r => gx >= r.x0 && gx < r.x1);
        const type = p.san < 25 && Math.random() < 0.35 ? 'double' : 'whisper';
        this.spawnGhost(type, gx, rm ? [rm.x0 + 20, rm.x1 - 20] : [gx - 200, gx + 200]);
        AudioSys.whisper();
        if (p.san < 45) this.toast('👁 Тьма сгустилась… что-то подошло ближе', 'red');
      }
    }
    // молнии за окном
    this.boltT -= dt;
    if (this.boltT <= 0) { this.boltT = rand(7, 16); this.bolt = 0.22; AudioSys.thunder(); }
    if (this.bolt > 0) this.bolt -= dt;
    // звук
    const danger = this.boss && !this.boss.dead ? 0.9 : clamp(this.ghostPressure(p.cx(), p.cy()) * 0.7 + (p.san < 30 ? 0.25 : 0), 0, 1);
    AudioSys.update(dt, p.hp, p.san, danger);
    // HUD-бары
    $('hp-fill').style.width = (p.hp / p.maxhp * 100) + '%';
    $('st-fill').style.width = p.st + '%';
    $('san-fill').style.width = p.san + '%';
    $('hp-num').textContent = Math.ceil(p.hp);
    // рука/перезарядка live
    if (p.cur === 'pistol') $('hand-ammo').textContent = p.reloadT > 0 ? '…перезарядка…' : `▮ ${p.mag} / ${p.reserve} [R]`;
    // sanity overlay
    $('sanity-fx').style.opacity = p.san < 55 ? ((55 - p.san) / 55 * 0.85).toFixed(2) : 0;
    // damage flash затухание + пульс низкого HP
    if (this.dmgFlash > 0) { this.dmgFlash -= dt * 2; $('damage-flash').style.opacity = clamp(this.dmgFlash, 0, 0.9); }
    else if (p.hp < 30) $('damage-flash').style.opacity = 0.2 + Math.sin(performance.now() / 300) * 0.12;
    else $('damage-flash').style.opacity = 0;
    this.drawPortrait();
  },

  /* ================= RENDER ================= */
  render() {
    const c = ctx, t = performance.now() / 1000;
    const p = this.player;
    // небо/фон
    const bg = c.createLinearGradient(0, 0, 0, VH);
    bg.addColorStop(0, '#04070c'); bg.addColorStop(0.6, '#0a1214'); bg.addColorStop(1, '#05080a');
    c.fillStyle = bg; c.fillRect(0, 0, VW, VH);

    // (ночь видна через окна с решётками на стенах палат)
    c.save();
    Camera.apply(c);

    // комнаты: стены + пол
    for (const rm of ROOMS) this.drawRoom(c, rm, t);
    // потолок с трубами
    this.drawCeiling(c, t);
    // платформы
    for (const pl of this.platforms) this.drawPlatform(c, pl);
    // мебель
    for (const f of this.furniture) f.draw(c, t);
    // двери
    for (const d of this.doors) d.draw(c);
    // подборы
    for (const k of this.pickups) if (!k.taken) k.draw(c, t);
    // туман задний
    for (const f of this.fogBlobs) {
      c.fillStyle = `rgba(130,150,155,${f.a})`;
      c.beginPath(); c.ellipse(f.x, f.y, f.w / 2, 34, 0, 0, 7); c.fill();
    }
    // лампы (корпуса)
    for (const l of this.lamps) this.drawLamp(c, l, t);
    // сущности
    for (const g of this.ghosts) g.draw(c);
    if (this.boss) this.boss.draw(c);
    if (p) p.draw(c);
    // снаряды
    for (const pr of this.projectiles) pr.draw(c);
    // эффекты
    this.drawEffects(c);
    Particles.draw(c);

    c.restore();

    /* ---- ТЬМА И СВЕТ ---- */
    const sources = [];
    for (const l of this.lamps) {
      if (l.level < 0.05) continue;
      sources.push({ x: l.x - Camera.x - Camera.sx, y: l.y + 70 - Camera.y - Camera.sy, r: l.r * (0.6 + l.level * 0.4), flick: l.flick, a: 0.9 });
    }
    if (p && !p.dead && p.flashOn) {
      sources.push({
        cone: {
          x: p.handX - Camera.x - Camera.sx, y: p.handY - Camera.y - Camera.sy,
          ang: p.aim, spread: 0.46, len: 560
        }
      });
    }
    if (this.muzzleT > 0 && p) sources.push({ x: p.handX - Camera.x, y: p.handY - Camera.y, r: 320, a: 1 });
    for (const pr of this.projectiles) if (pr.kind === 'wail') sources.push({ x: pr.x - Camera.x, y: pr.y - Camera.y, r: 90, a: 0.6 });
    for (const k of this.pickups) {
      if (k.taken) continue;
      const sx = k.x - Camera.x, sy = k.y - 20 - Camera.y;
      if (sx > -60 && sx < VW + 60) sources.push({ x: sx, y: sy, r: 70, a: 0.5 });
    }
    if (this.boss && !this.boss.dead) sources.push({ x: this.boss.cx() - Camera.x + this.boss.face * 6, y: this.boss.y + 20 - Camera.y, r: 120, a: 0.55 });
    renderDarkness(sources, t, p ? p.san / 100 : 1);
    c.drawImage(lightCanvas, 0, 0);
    // вспышка молнии
    if (this.bolt > 0) { c.fillStyle = `rgba(200,220,255,${(this.bolt * 1.3).toFixed(3)})`; c.fillRect(0, 0, VW, VH); }
    // тёплый оттенок фонаря
    if (p && !p.dead && p.flashOn) {
      c.save(); c.globalCompositeOperation = 'soft-light';
      const hx = p.handX - Camera.x - Camera.sx, hy = p.handY - Camera.y - Camera.sy;
      const g2 = c.createRadialGradient(hx, hy, 10, hx, hy, 420);
      g2.addColorStop(0, 'rgba(255,230,170,0.35)'); g2.addColorStop(1, 'rgba(255,230,170,0)');
      c.fillStyle = g2;
      c.beginPath(); c.moveTo(hx, hy); c.arc(hx, hy, 420, p.aim - 0.26, p.aim + 0.26); c.closePath(); c.fill();
      c.restore();
    }
    // глитч безумия
    if (p && p.san < 25 && this.state === 'play') {
      const n = p.san < 12 ? 6 : 3;
      for (let i = 0; i < n; i++) {
        const sy = Math.random() * VH, sh = 6 + Math.random() * 26, dx = rand(-40, 40);
        c.drawImage(canvas, 0, sy, VW, sh, dx, sy, VW, sh);
      }
      if (Math.random() < 0.02) { c.fillStyle = 'rgba(120,0,160,0.08)'; c.fillRect(0, 0, VW, VH); }
    }
    Floaters.draw(c);
    // прицел
    if (this.state === 'play' && !this.paused && this.noteId === null && p && !p.dead) {
      drawCrosshair(c, Input.mouse.sx, Input.mouse.sy, p.cur, p.atkCd <= 0);
    }
  },

  drawRoom(c, rm, t) {
    const { x0, x1, wall, floor } = rm;
    const W = x1 - x0;
    const idx = ROOMS.indexOf(rm);
    // стена
    c.fillStyle = wall; c.fillRect(x0, 140, W, WORLD.ground - 140);
    // кафельная сетка
    c.strokeStyle = 'rgba(255,255,255,0.045)'; c.lineWidth = 1;
    c.beginPath();
    for (let y = 180; y < WORLD.ground; y += 44) { c.moveTo(x0, y); c.lineTo(x1, y); }
    for (let x = x0; x < x1; x += 62) { c.moveTo(x, 180); c.lineTo(x, WORLD.ground); }
    c.stroke();
    // полоса на стене
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x0, 420, W, 26);
    c.fillStyle = 'rgba(163,22,33,0.28)'; c.fillRect(x0, 420, W, 5);
    // плинтус
    c.fillStyle = '#0c0e0f'; c.fillRect(x0, WORLD.ground - 14, W, 14);
    // пол
    const fg = c.createLinearGradient(0, WORLD.ground, 0, WORLD.h);
    fg.addColorStop(0, floor); fg.addColorStop(1, '#0a0c0d');
    c.fillStyle = fg; c.fillRect(x0, WORLD.ground, W, WORLD.h - WORLD.ground);
    c.fillStyle = 'rgba(255,255,255,0.06)'; c.fillRect(x0, WORLD.ground, W, 3);
    // швы пола
    c.strokeStyle = 'rgba(0,0,0,0.3)';
    c.beginPath();
    for (let x = x0 + 40; x < x1; x += 130) { c.moveTo(x, WORLD.ground); c.lineTo(x - 20, WORLD.h); }
    c.stroke();
    // табличка комнаты
    const mx = (x0 + x1) / 2;
    c.fillStyle = '#0d1113';
    c.fillRect(mx - 130, 176, 260, 34);
    c.strokeStyle = '#2c3537'; c.lineWidth = 2; c.strokeRect(mx - 130, 176, 260, 34);
    c.fillStyle = 'rgba(232,220,200,0.85)';
    c.font = '700 19px Rubik,sans-serif'; c.textAlign = 'center';
    c.fillText(rm.name, mx, 200);
    c.textAlign = 'left';
    // окна с решётками: ночь, дождь, иногда силуэт
    const rw = mulberry32(idx * 331 + 21);
    const nw = W > 500 ? 2 : 1;
    for (let i = 0; i < nw; i++) {
      const wx0 = x0 + (W / (nw + 1)) * (i + 1) - 65 + (rw() - 0.5) * 40;
      this.drawWallWindow(c, wx0, 250, t, idx * 10 + i);
    }
    // декор
    const items = this.roomDecor[idx] || [];
    for (const it of items) this.drawDecorItem(c, it, t, idx);
    // кровь на полу (seeded)
    const r = mulberry32(idx * 991 + 7);
    c.fillStyle = 'rgba(110,10,18,0.5)';
    for (let i = 0; i < 3; i++) {
      const bx = x0 + r() * W;
      c.beginPath(); c.ellipse(bx, WORLD.ground + 22 + r() * 40, 14 + r() * 26, 5 + r() * 6, 0, 0, 7); c.fill();
    }
    // морг: стена холодильников
    if (idx === 6) {
      c.fillStyle = '#2b3138';
      c.fillRect(x1 - 260, 300, 250, 240);
      for (let rr2 = 0; rr2 < 4; rr2++) for (let cc = 0; cc < 4; cc++) {
        const dx = x1 - 250 + cc * 60, dy = 310 + rr2 * 58;
        const isOpen = rr2 === 1 && cc === 2;
        c.fillStyle = isOpen ? '#04060a' : '#3d454e';
        c.fillRect(dx, dy, 52, 48);
        c.fillStyle = '#171c21'; c.fillRect(dx + 18, dy + 20, 16, 6);
        if (isOpen) { // из открытого тянет холодом
          c.fillStyle = `rgba(150,200,220,${0.12 + Math.sin(t * 2) * 0.05})`;
          c.fillRect(dx - 10, dy + 48, 72, 60);
        }
      }
      c.fillStyle = '#a31621'; c.font = '800 15px sans-serif'; c.textAlign = 'center';
      c.fillText('ХОЛОДИЛЬНИК №3 — НЕ ОТКРЫВАТЬ', x1 - 135, 290);
      c.textAlign = 'left';
    }
    // кабинет: грамоты Тамика
    if (idx === 8) {
      for (let i = 0; i < 3; i++) {
        const gx = x0 + 120 + i * 150;
        c.fillStyle = '#3a2f1c'; c.fillRect(gx, 300, 110, 90);
        c.fillStyle = '#d9c9a8'; c.fillRect(gx + 6, 306, 98, 78);
        c.fillStyle = '#333'; c.font = '700 10px sans-serif'; c.textAlign = 'center';
        c.fillText('ЛУЧШИЙ ВРАЧ', gx + 55, 330); c.fillText('ГОДА', gx + 55, 344);
        c.fillStyle = '#a31621'; c.font = '800 13px sans-serif';
        c.fillText('Т А М И К', gx + 55, 366);
        // зачёркнуто кровью
        c.strokeStyle = 'rgba(150,10,20,0.8)'; c.lineWidth = 4;
        c.beginPath(); c.moveTo(gx + 8, 308); c.lineTo(gx + 102, 382); c.stroke();
        c.textAlign = 'left';
      }
    }
    // арка на границе комнат
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(x0 - 6, 140, 12, WORLD.ground - 140);
    c.fillStyle = '#2c3537'; c.fillRect(x0 - 8, 140, 5, WORLD.ground - 140);
  },

  drawWallWindow(c, x, y, t, seed) {
    const w = 130, h = 170;
    c.fillStyle = '#0a0d11'; c.fillRect(x - 6, y - 6, w + 12, h + 12);
    const flash = this.bolt > 0 ? 0.8 : 0;
    const ng = c.createLinearGradient(0, y, 0, y + h);
    ng.addColorStop(0, `rgb(${(10 + flash * 180) | 0},${(14 + flash * 190) | 0},${(26 + flash * 200) | 0})`);
    ng.addColorStop(1, `rgb(${(4 + flash * 120) | 0},${(8 + flash * 130) | 0},${(16 + flash * 150) | 0})`);
    c.fillStyle = ng; c.fillRect(x, y, w, h);
    if (seed % 3 === 0) {
      c.fillStyle = `rgba(213,226,234,${0.75 + flash * 0.25})`;
      c.beginPath(); c.arc(x + 92, y + 38, 13, 0, 7); c.fill();
      c.fillStyle = 'rgba(140,160,175,0.5)';
      c.beginPath(); c.arc(x + 88, y + 35, 3, 0, 7); c.fill();
    }
    c.strokeStyle = 'rgba(140,180,200,0.45)'; c.lineWidth = 1.5;
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const rx = x + ((i * 41 + seed * 17) % w), ry = y + ((i * 67 + t * 380 + seed * 31) % h);
      c.moveTo(rx, ry); c.lineTo(rx - 3, ry + 11);
    }
    c.stroke();
    if (Math.sin(t * 0.4 + seed * 2.3) > 0.93) {
      c.fillStyle = 'rgba(0,0,0,0.9)';
      c.beginPath(); c.ellipse(x + w / 2, y + 70, 15, 22, 0, 0, 7); c.fill();
      c.fillStyle = '#fff'; c.fillRect(x + w / 2 - 9, y + 64, 5, 5); c.fillRect(x + w / 2 + 4, y + 64, 5, 5);
    }
    c.strokeStyle = '#1d2a33'; c.lineWidth = 6; c.strokeRect(x, y, w, h);
    c.strokeStyle = '#0e1418'; c.lineWidth = 5;
    c.beginPath();
    for (let i = 1; i < 4; i++) { c.moveTo(x + (w / 4) * i, y); c.lineTo(x + (w / 4) * i, y + h); }
    c.moveTo(x, y + h / 2); c.lineTo(x + w, y + h / 2);
    c.stroke();
    c.strokeStyle = 'rgba(120,150,160,0.25)'; c.lineWidth = 1.5;
    c.beginPath();
    for (let i = 1; i < 4; i++) { c.moveTo(x + (w / 4) * i - 1, y); c.lineTo(x + (w / 4) * i - 1, y + h); }
    c.stroke();
    c.fillStyle = '#2b3236'; c.fillRect(x - 10, y + h + 6, w + 20, 10);
  },

  drawDecorItem(c, it, t, roomIdx) {
    const x = it.x, gy = WORLD.ground;
    if (it.kind < 0.2) { // постер
      const pw = 74, ph = 100, py = 470;
      c.fillStyle = '#1a1a1a'; c.fillRect(x, py, pw, ph);
      c.fillStyle = ['#b8c4c4', '#c4b8a8', '#a8bcc4'][(it.seed | 0) % 3];
      c.fillRect(x + 3, py + 3, pw - 6, ph - 6);
      c.fillStyle = '#222'; c.font = '800 11px sans-serif'; c.textAlign = 'center';
      const texts = [['ТИШИНА —', 'ЗАЛОГ', 'ЗДОРОВЬЯ'], ['МОЙТЕ', 'РУКИ', '☠'], ['НЕ', 'ВСПОМИНАТЬ', '!'], ['03:33', 'НЕ', 'ПРОСЫПАТЬСЯ']];
      const tx = texts[(it.seed | 0) % texts.length];
      tx.forEach((s, i) => c.fillText(s, x + pw / 2, py + 34 + i * 20));
      c.textAlign = 'left';
      if (it.seed % 2 < 1) { // надорван
        c.fillStyle = ROOMS[roomIdx].wall;
        c.beginPath(); c.moveTo(x, py + ph); c.lineTo(x + 30, py + ph - 34); c.lineTo(x + 44, py + ph); c.fill();
      }
    } else if (it.kind < 0.32) { // инвалидное кресло
      c.strokeStyle = '#4a5055'; c.lineWidth = 4;
      c.beginPath(); c.arc(x, gy - 26, 22, 0, 7); c.stroke();
      c.beginPath(); c.arc(x + 44, gy - 12, 10, 0, 7); c.stroke();
      c.strokeStyle = '#2c3136'; c.lineWidth = 6;
      c.beginPath(); c.moveTo(x, gy - 26); c.lineTo(x + 20, gy - 60); c.lineTo(x + 52, gy - 60); c.stroke();
      c.fillStyle = '#1e2a30'; c.fillRect(x + 12, gy - 66, 44, 10);
      c.fillStyle = '#1e2a30'; c.fillRect(x + 50, gy - 100, 10, 40);
    } else if (it.kind < 0.44) { // капельница
      c.strokeStyle = '#5a6066'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(x, gy); c.lineTo(x, gy - 150); c.moveTo(x - 20, gy - 150); c.lineTo(x + 20, gy - 150); c.stroke();
      c.fillStyle = 'rgba(200,230,255,0.4)'; c.fillRect(x - 28, gy - 148, 14, 26);
      c.fillStyle = 'rgba(140,15,25,0.7)'; c.fillRect(x + 14, gy - 148, 14, 26); // с кровью?..
      c.strokeStyle = 'rgba(200,200,200,0.4)'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(x + 21, gy - 122); c.quadraticCurveTo(x + 30, gy - 80, x + 10, gy - 40 + Math.sin(t * 2 + it.seed) * 6); c.stroke();
    } else if (it.kind < 0.56) { // лужа + осколки
      c.fillStyle = 'rgba(90,140,150,0.25)';
      c.beginPath(); c.ellipse(x, gy + 30, 46, 9, 0, 0, 7); c.fill();
      c.fillStyle = 'rgba(180,220,230,0.5)';
      const r = mulberry32((it.seed * 100) | 0);
      for (let i = 0; i < 5; i++) c.fillRect(x - 36 + r() * 72, gy + 24 + r() * 10, 4, 3);
    } else if (it.kind < 0.68) { // бумаги на полу
      const r = mulberry32((it.seed * 50) | 0);
      for (let i = 0; i < 4; i++) {
        c.save(); c.translate(x - 30 + r() * 60, gy + 16 + r() * 30); c.rotate(r() * 3);
        c.fillStyle = 'rgba(200,190,165,0.7)'; c.fillRect(-9, -12, 18, 24);
        c.fillStyle = 'rgba(30,30,30,0.5)';
        for (let j = 0; j < 3; j++) c.fillRect(-6, -8 + j * 7, 12, 2);
        c.restore();
      }
    } else if (it.kind < 0.8) { // кровавый след ладоней по стене
      c.fillStyle = 'rgba(120,12,20,0.55)';
      for (let i = 0; i < 4; i++) {
        const hy = 560 - i * 26, hx = x + i * 14;
        c.beginPath(); c.ellipse(hx, hy, 9, 11, 0.2, 0, 7); c.fill();
        for (let f2 = 0; f2 < 4; f2++) c.fillRect(hx - 8 + f2 * 5, hy - 20, 3, 10);
      }
    } else if (it.kind < 0.9) { // каталка-декoр с простынёй
      c.fillStyle = '#2a2e33'; c.fillRect(x, gy - 46, 90, 8);
      c.fillStyle = 'rgba(190,185,170,0.9)';
      c.beginPath(); c.ellipse(x + 45, gy - 52, 44, 10, 0, 0, 7); c.fill();
      c.strokeStyle = '#4a5055'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(x + 10, gy - 38); c.lineTo(x + 10, gy); c.moveTo(x + 80, gy - 38); c.lineTo(x + 80, gy); c.stroke();
    } else { // мигающая табличка выхода
      c.fillStyle = Math.sin(t * 5 + it.seed) > -0.2 ? '#0d3a12' : '#04140a';
      c.fillRect(x, 250, 92, 28);
      c.fillStyle = Math.sin(t * 5 + it.seed) > -0.2 ? '#4dff6a' : '#123a1a';
      c.font = '800 17px sans-serif'; c.textAlign = 'center';
      c.fillText('ВЫХОД →', x + 46, 271);
      c.textAlign = 'left';
    }
  },

  drawCeiling(c, t) {
    c.fillStyle = '#05070a'; c.fillRect(Camera.x - 50, -50, VW + 100, 200);
    const y0 = 60;
    // трубы
    for (const [dy, wdt, col] of [[0, 26, '#232a2e'], [34, 18, '#2b3236'], [58, 12, '#1d2326']]) {
      c.fillStyle = col;
      c.fillRect(Camera.x - 50, y0 + dy, VW + 100, wdt);
      c.fillStyle = 'rgba(255,255,255,0.06)';
      c.fillRect(Camera.x - 50, y0 + dy, VW + 100, 3);
      c.fillStyle = '#14191c';
      const startX = Math.floor((Camera.x - 50) / 220) * 220;
      for (let x = startX; x < Camera.x + VW + 50; x += 220) c.fillRect(x, y0 + dy - 2, 10, wdt + 4);
    }
    // капающая вода из трубы
    const dripX = Math.floor((Camera.x + VW / 2) / 700) * 700 + 150;
    const dy = (t * 260) % 320;
    c.fillStyle = 'rgba(140,200,220,0.6)';
    c.fillRect(dripX, 150 + dy, 3, 8);
    // провода
    c.strokeStyle = '#101415'; c.lineWidth = 3;
    c.beginPath();
    for (let x = Camera.x - 50; x < Camera.x + VW + 50; x += 40) {
      c.moveTo(x, 140); c.quadraticCurveTo(x + 20, 140 + Math.sin(x / 90) * 14 + 14, x + 40, 140);
    }
    c.stroke();
  },

  drawPlatform(c, pl) {
    if (pl.t === 'solid') {
      // ящик / морозильник
      const isFridge = pl.x > 3450 && pl.x < 4280;
      c.fillStyle = isFridge ? '#39424b' : '#4a3f2c';
      c.fillRect(pl.x, pl.y, pl.w, pl.h);
      c.fillStyle = isFridge ? '#2c333b' : '#3a3222';
      c.fillRect(pl.x + 4, pl.y + 4, pl.w - 8, pl.h - 8);
      c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = 2;
      c.strokeRect(pl.x + 4, pl.y + 4, pl.w - 8, pl.h - 8);
      if (isFridge) {
        c.fillStyle = '#a31621'; c.font = '800 12px sans-serif'; c.textAlign = 'center';
        c.fillText('МОРГ', pl.x + pl.w / 2, pl.y + 26);
        c.textAlign = 'left';
      } else {
        c.fillStyle = 'rgba(220,200,160,0.5)'; c.font = '700 11px sans-serif'; c.textAlign = 'center';
        c.fillText('МЕДИКАМЕНТЫ', pl.x + pl.w / 2, pl.y + pl.h / 2);
        c.textAlign = 'left';
      }
    } else {
      // полка / труба
      const isPipe = pl.y < 580 && pl.w > 170;
      if (isPipe) {
        c.fillStyle = '#2b3236'; c.fillRect(pl.x, pl.y, pl.w, pl.h);
        c.fillStyle = 'rgba(255,255,255,0.1)'; c.fillRect(pl.x, pl.y, pl.w, 3);
        c.fillStyle = '#14191c';
        for (let x = pl.x + 30; x < pl.x + pl.w; x += 60) c.fillRect(x, pl.y - 2, 8, pl.h + 4);
      } else {
        c.fillStyle = '#4a3b28'; c.fillRect(pl.x, pl.y, pl.w, pl.h);
        c.fillStyle = '#5f4f36'; c.fillRect(pl.x, pl.y, pl.w, 4);
        // кронштейны
        c.fillStyle = '#22262b';
        c.fillRect(pl.x + 8, pl.y + pl.h, 6, 22); c.fillRect(pl.x + pl.w - 14, pl.y + pl.h, 6, 22);
      }
    }
  },

  drawLamp(c, l, t) {
    const x = l.x, y = l.y;
    // крепление
    c.fillStyle = '#14191c'; c.fillRect(x - 3, y - 60, 6, 60);
    c.fillStyle = '#232a2e'; c.fillRect(x - 46, y - 8, 92, 16);
    // лампа
    const on = l.level > 0.1;
    const flick = on ? (0.75 + l.level * 0.25 + (Math.random() < l.flick * 0.1 ? -0.5 : 0)) : 0;
    if (on) {
      c.save(); c.globalAlpha = clamp(flick, 0, 1);
      c.shadowBlur = 30; c.shadowColor = '#ffe9b0';
      c.fillStyle = '#fff3d0'; c.fillRect(x - 38, y - 4, 76, 8);
      c.restore();
    } else {
      c.fillStyle = '#3a3f45'; c.fillRect(x - 38, y - 4, 76, 8);
      if (!l.on) { // разбита
        c.strokeStyle = '#222'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(x - 20, y - 4); c.lineTo(x - 10, y + 4); c.moveTo(x + 14, y - 4); c.lineTo(x + 6, y + 4); c.stroke();
      }
    }
    // мотыльки у рабочей лампы
    if (on && l.level > 0.7) {
      c.fillStyle = 'rgba(220,210,180,0.8)';
      for (let i = 0; i < 3; i++) {
        const mx = x + Math.sin(t * (5 + i * 2) + i * 9) * 34;
        const my = y + 10 + Math.cos(t * (7 + i * 3) + i * 5) * 16;
        c.fillRect(mx, my, 2.5, 2.5);
      }
    }
  },

  drawEffects(c) {
    for (const e of this.effects) {
      const k = e.t / e.dur;
      if (e.kind === 'ring') {
        c.save(); c.globalAlpha = 1 - k;
        c.strokeStyle = e.color; c.lineWidth = 5 * (1 - k) + 1;
        c.shadowBlur = 20; c.shadowColor = e.color;
        c.beginPath(); c.arc(e.x, e.y, e.r, 0, 7); c.stroke();
        c.restore();
      } else if (e.kind === 'slash') {
        c.save(); c.globalAlpha = 1 - k;
        c.strokeStyle = '#ff5c6c'; c.lineWidth = e.big ? 7 : 4; c.lineCap = 'round';
        c.shadowBlur = 12; c.shadowColor = '#f00';
        const r = e.big ? 70 : 40;
        c.beginPath(); c.arc(e.x, e.y, r, e.face > 0 ? -1.2 + k : Math.PI - 1.2 + k, e.face > 0 ? 0.6 + k : Math.PI + 0.6 + k); c.stroke();
        c.restore();
      } else if (e.kind === 'tracer') {
        c.save(); c.globalAlpha = 1 - k;
        c.strokeStyle = '#ffdf8a'; c.lineWidth = 3;
        c.shadowBlur = 14; c.shadowColor = '#ffb13c';
        c.beginPath(); c.moveTo(e.x1, e.y1); c.lineTo(e.x2, e.y2); c.stroke();
        c.strokeStyle = '#fff'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(e.x1, e.y1); c.lineTo(e.x2, e.y2); c.stroke();
        c.restore();
      } else if (e.kind === 'fake') {
        // фейковый силуэт — галлюцинация
        c.save(); c.globalAlpha = Math.sin(k * Math.PI) * 0.85;
        c.fillStyle = '#000';
        const fx = e.x, fy = WORLD.ground;
        c.beginPath(); c.ellipse(fx, fy - 110, 16, 24, 0, 0, 7); c.fill();
        c.beginPath(); c.ellipse(fx, fy - 50, 24, 52, 0, 0, 7); c.fill();
        c.fillStyle = '#fff';
        c.fillRect(fx - 8, fy - 116, 6, 6); c.fillRect(fx + 2, fy - 116, 6, 6);
        c.restore();
      }
    }
  },
};

/* ================= BOOT ================= */
window.addEventListener('load', () => Game.init());
