/* ============================================================
   МИШУТКА — игра: мир, цикл, рендер, HUD, мини-игры, сохранения
   ============================================================ */
'use strict';

const $ = id => document.getElementById(id);
const SAVE_KEY = 'mishutka_save_v2';

const Game = {
  state: 'title', paused: false, noteId: null,
  player: null, ghosts: [], minibosses: [], boss: null, projectiles: [], effects: [],
  furniture: [], doors: [], pickups: [], lamps: [], platforms: [], solids: [], gates: [],
  decor: [], fog: [], noises: [],
  power: false, powerFlash: 0, blackout: 0, blackoutT: 70,
  elevator: null, fuse: null, ventOpen: {}, elevatorUnlocked: false, elevatorCard: false,
  bossStarted: false, bossDead: false, playTime: 0, curRoom: -1,
  muzzleT: 0, whisperT: 6, fakeT: 8, directorT: 20, dmgFlash: 0, bolt: 0, boltT: 4,
  interactTarget: null, prompts: [],
  csIndex: 0, csChar: 0, csTimer: 0, csSegs: [], csRain: [],
  deathT: 0, winT: 0, titleT: 0, crawlT: 0, endingType: null,
  seenRooms: {}, jumpScareT: 0, jumpScareKind: null, musicBoss: null, heartT: 0,

  modalOpen() { return this.noteId !== null; },
  /* защита от падения кадра: пишем в консоль и продолжаем */
  reportError(where, e) {
    this.errCount = (this.errCount || 0) + 1;
    if (this.errCount <= 5) console.error('[МИШУТКА] сбой в ' + where + ':', e && e.message ? e.message : e);
    else if (this.errCount === 6) console.error('[МИШУТКА] дальнейшие сбои скрыты');
  },

  /* ================= INIT ================= */
  init() {
    Input.init();
    this.buildWorld();
    this.player = new Player(PLAYER_START.x, PLAYER_START.y, 0);
    Camera.reset(this.player.cx(), this.player.cy());
    this.bindUI();
    window.addEventListener('pointerdown', () => AudioSys.init());
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
    this.furniture = FURNITURE.map(f => new Furniture({ ...f, opened: false }));
    this.doors = DOORS.map(d => new Door({ ...d }));
    this.pickups = PICKUPS.map(p => new Pickup({ ...p, taken: false }));
    this.lamps = LAMPS.map(l => ({ ...l, level: l.on ? 1 : 0 }));
    this.decor = DECOR.map(d => ({ ...d }));
    this.minibosses = MINIBOSSES.map(m => new Miniboss({ ...m }));
    this.ghosts = GHOSTS.map(g => new Ghost(g.type, g.x, g.floor, g.leash.slice()));
    this.boss = null; this.projectiles = []; this.effects = []; this.gates = []; this.noises = [];
    this.elevator = JSON.parse(JSON.stringify(ELEVATOR));
    this.fuse = { active: false, order: FUSEBOX.code.slice(), entered: [], solved: false, switches: [false, false, false, false, false], flash: 0 };
    this.ventOpen = {}; this.ventAnim = {};
    this.power = false; this.elevatorCard = false;
    this.bossStarted = false; this.bossDead = false;
    this.seenRooms = {}; this.endingType = null;
    this.rebuildSolids();
    Particles.clear(); Floaters.clear();
    const r = mulberry32(4242);
    this.fog = [];
    for (let i = 0; i < 40; i++) this.fog.push({ x: r() * WORLD.w, y: 0, w: 240 + r() * 300, vx: 5 + r() * 12, a: 0.04 + r() * 0.05, f: (r() * 3) | 0 });
  },
  rebuildSolids() {
    this.solids = [];
    for (const s of SLABS) this.solids.push(s);
    for (const p of this.platforms) if (p.t === 'solid' && p.h > 24) this.solids.push(p);
    /* вся мебель — препятствие: сквозь шкафы и тумбы не пройти */
    for (const f of this.furniture)
      this.solids.push({ x: f.x, y: f.y, w: f.w, h: f.h, t: 'solid', furniture: f.id, floor: f.floor });
    for (const g of this.gates) this.solids.push(g);
  },
  /* --- запросы по миру --- */
  floorAtY(y) {
    for (let i = 0; i < FLOORS.length - 1; i++) {
      const gap = FLOORS[i].y - FLOORS[i + 1].y;
      if (y > FLOORS[i + 1].y + gap * 0.45) return i;
    }
    return 2;
  },
  solidAt(x, y, w = 4, h = 4) {
    const b = { x, y, w, h };
    for (const s of this.solids) if (aabb(b, s)) return s;
    for (const d of this.doors) {
      if (!d.solid) continue;
      if (aabb(b, { x: d.x - d.w / 2, y: d.y, w: d.w, h: d.h })) return d;
    }
    return null;
  },
  canStand(x, y, w, h) {
    const b = { x, y, w, h };
    for (const s of this.solids) if (aabb(b, s)) return false;
    for (const d of this.doors) {
      if (!d.solid) continue;
      if (aabb(b, { x: d.x - d.w / 2, y: d.y, w: d.w, h: d.h })) return false;
    }
    return true;
  },
  ladderAt(x, y, h) {
    for (const L of LADDERS) {
      if (x > L.x - 14 && x < L.x + L.w + 14 && y + h > L.yTop - 20 && y < L.yBot + 10) return L;
    }
    return null;
  },
  nearestLadder(x, floorIdx) {
    let best = null, bd = 1e9;
    for (const L of LADDERS) {
      const lf = L.yTop === FLOORS[floorIdx].y ? floorIdx : L.yBot === FLOORS[floorIdx].y ? floorIdx : -1;
      const d = Math.abs(L.x + L.w / 2 - x);
      if (d < 320 && d < bd) { bd = d; best = L; }
    }
    return best;
  },
  roomAt(x, floorIdx) { return ROOMS.find(r => r.f === floorIdx && x >= r.x0 && x < r.x1) || null; },
  /* дверь с затычкой, разделяющая тварь и игрока (тварь будет её грызть) */
  pinnedDoorBetween(e, p) {
    let best = null, bd = 1e9;
    for (const d of this.doors) {
      if (!d.pinned || d.floor !== e.floor || p.floor !== e.floor) continue;
      if ((e.cx() < d.x) === (p.cx() < d.x)) continue;
      const dE = Math.abs(e.cx() - d.x);
      if (dE > 700 || dE > bd) continue;
      bd = dE; best = d;
    }
    return best;
  },
  addNoise(x, y, r) {
    this.noises.push({ x, y, r, t: 0 });
    if (this.noises.length > 24) this.noises.shift();
  },
  shakeLamps(floorIdx) {
    for (const l of this.lamps) {
      if (l.floor !== floorIdx || !l.on) continue;
      l.level = rand(0.15, 0.5);
      if (Math.random() < 0.25) Particles.spark(l.x, l.y + 60, 3, '#ffe9b0');
    }
  },
  flashLit(x, y) {
    const p = this.player;
    if (!p || !p.flashOn || p.dead || p.battery <= 0 || p.hidden) return 0;
    if (this.floorAtY(y) !== p.floor) return 0;
    const dx = x - p.handX, dy = y - p.handY;
    const d = Math.hypot(dx, dy);
    if (d > 600 || d < 1) return d < 100 ? 0.6 : 0;
    let da = Math.atan2(dy, dx) - p.aim;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    if (Math.abs(da) > 0.36) return 0;
    const dim = p.battery < 22 ? 0.6 + Math.sin(performance.now() / 90) * 0.35 : 1;
    return clamp(1.15 - d / 600, 0, 1) * dim;
  },
  lampLit(x, y) {
    const myFloor = this.floorAtY(y);
    let m = 0;
    for (const l of this.lamps) {
      if (l.level < 0.05) continue;
      if (this.floorAtY(l.y + 60) !== myFloor) continue;
      const d = dist(x, y, l.x, l.y + 60);
      if (d < l.r) m = Math.max(m, (1 - d / l.r) * l.level);
    }
    return m;
  },
  ghostPressure(x, y) {
    let s = 0;
    for (const g of this.ghosts) {
      if (g.dead) continue;
      const d = dist(x, y, g.cx(), g.cy());
      if (d < 280) s += 1 - d / 280;
    }
    for (const m of this.minibosses) {
      if (m.dead) continue;
      const d = dist(x, y, m.cx(), m.cy());
      if (d < 460) s += (1 - d / 460) * 0.9;
    }
    if (this.boss && !this.boss.dead) s += 0.9;
    return clamp(s, 0, 1.6);
  },

  /* ================= КАТСЦЕНА ================= */
  updateCutscene(dt) {
    const s = CUTSCENE[this.csIndex];
    if (this.csChar < s.text.length) {
      this.csTimer += dt;
      const n = Math.floor(this.csTimer / 0.014);
      if (n > 0) {
        this.csTimer = 0;
        this.csChar = Math.min(s.text.length, this.csChar + n);
        $('cs-text').textContent = s.text.slice(0, this.csChar);
        if (this.csChar % 3 === 0) AudioSys.tone(900 + Math.random() * 400, 0.02, 'square', 0.02);
      }
    }
    const speed = 130 * (s.fx.speed || 1);
    for (const sg of this.csSegs) {
      sg.z += speed * dt;
      if (sg.z > 120) sg.z -= 16 * 110;
      sg.el.style.transform = `translate(-50%,-50%) translateZ(${sg.z.toFixed(1)}px)`;
      const sc = clamp(1 + sg.z / 900, 0.2, 1.3);
      sg.el.style.width = (430 * sc) + 'px'; sg.el.style.height = (330 * sc) + 'px';
      sg.el.style.opacity = clamp(1.2 + sg.z / 700, 0.05, 1);
    }
    const sh = s.fx.shake || 0;
    $('cs-scene').style.transform = sh ? `translate(${rand(-sh, sh)}px,${rand(-sh, sh)}px)` : '';
    $('cs-siren').style.opacity = (s.fx.siren || 0) * (0.5 + Math.sin(performance.now() / 280) * 0.5);
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
  },
  startCutscene() {
    this.state = 'cutscene';
    $('title-screen').classList.add('hidden');
    $('cutscene').classList.remove('hidden');
    const cor = $('cs-corridor'); cor.innerHTML = ''; this.csSegs = [];
    for (let i = 0; i < 16; i++) {
      const d = document.createElement('div');
      d.className = 'cs-seg';
      cor.appendChild(d);
      this.csSegs.push({ el: d, z: -i * 110 });
    }
    this.csRain = [];
    for (let i = 0; i < 150; i++) this.csRain.push({ x: Math.random() * 1280, y: Math.random() * 720, v: 700 + Math.random() * 600 });
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
  },
  csNext() {
    AudioSys.uiClick();
    const full = CUTSCENE[this.csIndex].text;
    if (this.csChar < full.length) { this.csChar = full.length; $('cs-text').textContent = full; return; }
    if (this.csIndex < CUTSCENE.length - 1) { this.csIndex++; this.csShow(this.csIndex); AudioSys.thunder(); }
    else this.startPlay();
  },
  csSkip() { AudioSys.uiClick(); this.startPlay(); },

  /* ================= UI / СОСТОЯНИЯ ================= */
  bindUI() {
    $('btn-new').onclick = () => { AudioSys.init(); AudioSys.uiClick(); this.newGame(true); };
    $('btn-continue').onclick = () => { AudioSys.init(); AudioSys.uiClick(); this.loadGame(); };
    $('btn-help').onclick = () => { AudioSys.uiClick(); $('help-modal').classList.remove('hidden'); };
    $('help-close').onclick = () => { AudioSys.uiClick(); $('help-modal').classList.add('hidden'); };
    $('note-close').onclick = () => this.closeNote();
    $('btn-resume').onclick = () => this.togglePause(false);
    $('btn-mute2').onclick = () => { AudioSys.toggleMute(); this.syncMuteBtn(); };
    $('btn-restart').onclick = () => { AudioSys.uiClick(); this.togglePause(false); this.newGame(false); };
    $('btn-quit-title').onclick = () => { AudioSys.uiClick(); this.toTitle(); };
    $('btn-retry').onclick = () => { AudioSys.uiClick(); this.retry(); };
    $('btn-dead-title').onclick = () => { AudioSys.uiClick(); this.toTitle(); };
    $('btn-again').onclick = () => { AudioSys.uiClick(); this.newGame(false); };
    $('btn-win-title').onclick = () => { AudioSys.uiClick(); this.toTitle(); };
    $('mute-btn').onclick = () => { AudioSys.init(); AudioSys.toggleMute(); this.syncMuteBtn(); };
    $('cs-next').onclick = () => this.csNext();
    $('cs-skip').onclick = () => this.csSkip();
    $('title-screen').addEventListener('mousemove', e => {
      const dx = (e.clientX / window.innerWidth - 0.5), dy = (e.clientY / window.innerHeight - 0.5);
      $('title-inner').style.transform = `perspective(800px) rotateY(${dx * 6}deg) rotateX(${-dy * 6}deg)`;
    });
  },
  syncMuteBtn() { $('mute-btn').textContent = AudioSys.muted ? '🔇' : '🔊'; $('btn-mute2').textContent = AudioSys.muted ? '🔇 Звук: выкл' : '🔊 Звук: вкл'; },

  newGame(withCutscene) {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
    $('btn-continue').classList.add('hidden');
    this.buildWorld();
    this.player = new Player(PLAYER_START.x, PLAYER_START.y, 0);
    this.playTime = 0; this.curRoom = -1;
    Camera.reset(this.player.cx(), this.player.cy());
    for (const id of ['dead-screen', 'win-screen', 'pause-menu', 'title-screen', 'boss-bar']) $(id).classList.add('hidden');
    this.refreshHUD();
    if (withCutscene) this.startCutscene(); else this.startPlay();
  },
  toTitle() {
    this.state = 'title'; this.paused = false; this.noteId = null;
    $('title-screen').classList.remove('hidden');
    for (const id of ['hud', 'pause-menu', 'dead-screen', 'win-screen', 'cutscene', 'note-modal', 'boss-bar']) $(id).classList.add('hidden');
    if (this.hasSave()) $('btn-continue').classList.remove('hidden');
  },
  startPlay() {
    this.state = 'play'; this.paused = false;
    $('cutscene').classList.add('hidden');
    $('title-screen').classList.add('hidden');
    $('hud').classList.remove('hidden');
    $('fade').style.opacity = 0;
    this.refreshHUD(); this.refreshFloorHUD();
    this.toast('🕯 3 этажа. 12 записок. Один Тамик.', 'gold');
    setTimeout(() => { if (this.state === 'play') this.subtitle('Так… где я?.. Голова пустая. Надо осмотреться. [E — обыскать, F — спрятаться в шкаф]'); }, 1200);
  },

  /* ================= СОХРАНЕНИЯ ================= */
  hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } },
  save(silent) {
    if (this.state !== 'play') return;
    if (this.bossStarted && !this.bossDead) return;
    const p = this.player;
    const data = {
      v: 2, px: p.x, py: p.y, floor: p.floor, hp: p.hp, st: p.st, san: p.san, cur: p.cur,
      weapons: p.weapons, mag: p.mag, reserve: p.reserve, medkits: p.medkits, pills: p.pills,
      bottles: p.bottles, batteries: p.batteries, battery: p.battery, flashOn: p.flashOn,
      keys: p.keys, notes: p.notes, time: this.playTime, kills: p.kills,
      openedF: this.furniture.filter(f => f.opened).map(f => f.id),
      openDoors: this.doors.filter(d => d.open).map(d => d.id),
      pinnedDoors: this.doors.filter(d => d.pinned).map(d => d.id),
      takenP: this.pickups.filter(k => k.taken).map(k => k.id),
      deadG: this.ghosts.map((g, i) => g.dead ? i : -1).filter(i => i >= 0),
      deadMB: this.minibosses.map((m, i) => m.dead ? i : -1).filter(i => i >= 0),
      power: this.power, vents: Object.keys(this.ventOpen), card: this.elevatorCard,
      seen: Object.keys(this.seenRooms), elev: this.elevator.at, fuseSolved: this.fuse.solved,
      sbot: this.bossDead,
    };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
    if (!silent) this.toast('💾 Автосохранение…', '');
  },
  loadGame() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { /* ignore */ }
    if (!d || d.v !== 2) { this.newGame(true); return; }
    this.buildWorld();
    this.player = new Player(d.px, d.py, d.floor || 0);
    Object.assign(this.player, {
      hp: d.hp, st: d.st, san: d.san, cur: d.cur, weapons: d.weapons,
      mag: d.mag, reserve: d.reserve, medkits: d.medkits, pills: d.pills,
      bottles: d.bottles, batteries: d.batteries, battery: d.battery, flashOn: d.flashOn,
      keys: d.keys, notes: d.notes, kills: d.kills || 0,
    });
    this.playTime = d.time || 0;
    for (const id of d.openedF || []) { const f = this.furniture.find(f => f.id === id); if (f) f.opened = true; }
    for (const id of d.openDoors || []) { const dr = this.doors.find(x => x.id === id); if (dr) { dr.open = true; dr.anim = 1; } }
    for (const id of d.pinnedDoors || []) { const dr = this.doors.find(x => x.id === id); if (dr) dr.pinned = true; }
    for (const id of d.takenP || []) { const k = this.pickups.find(x => x.id === id); if (k) k.taken = true; }
    for (const i of d.deadG || []) if (this.ghosts[i]) this.ghosts[i].dead = true;
    this.ghosts = this.ghosts.filter(g => !g.dead);
    for (const i of d.deadMB || []) if (this.minibosses[i]) this.minibosses[i].dead = true;
    this.minibosses = this.minibosses.filter(m => !m.dead);
    this.power = !!d.power;
    for (const v of d.vents || []) this.ventOpen[v] = true;
    this.elevatorCard = !!d.card;
    for (const r of d.seen || []) this.seenRooms[r] = true;
    this.elevator.at = d.elev || 0; this.elevator.target = this.elevator.at;
    this.elevator.car.y = this.elevator.stations[this.elevator.at].y;
    if (d.fuseSolved) { this.fuse.solved = true; this.fuse.switches = [true, true, true, true, true]; }
    this.bossDead = !!d.sbot;
    this.rebuildSolids();
    Camera.reset(this.player.cx(), this.player.cy());
    this.curRoom = -1;
    this.startPlay();
    this.subtitle('Ты очнулся. Голова гудит… Продолжай.');
  },
  retry() {
    $('dead-screen').classList.add('hidden');
    if (this.hasSave()) this.loadGame(); else this.newGame(false);
  },

  /* ================= ФИЗИКА ================= */
  moveAndCollide(e, dt, isPlayer) {
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
      if (e.kind === 'ghost' || e.kind === 'miniboss' || e.kind === 'boss') continue; // враги открывают двери
      if (aabb(e, box)) {
        if (e.vx > 0) e.x = box.x - e.w; else if (e.vx < 0) e.x = box.x + box.w;
        e.vx = 0;
      }
    }
    /* смена этажа по вертикали + посадка на перекрытие/пол */
    e.y += e.vy * dt;
    const prevOn = e.onGround;
    e.onGround = false; e.onSolidGround = false;
    const fy = FLOORS[Math.min(2, Math.max(0, e.floor))].y;
    if (e.y + e.h >= fy) { // не провалиться ниже своего этажа
      for (const L of LADDERS) { /* на лестнице не действует */ }
      e.y = fy - e.h; e.vy = 0; e.onGround = true; e.onSolidGround = true;
    }
    for (const s of this.solids) {
      if (s.kind === 'slab' && s.y !== fy) continue;
      if (aabb(e, s)) {
        if (e.vy > 0 && e.y + e.h - s.y < 46) { e.y = s.y - e.h; e.vy = 0; e.onGround = true; e.onSolidGround = true; }
        else if (e.vy < 0) {
          if (isPlayer) { e.y = s.y + s.h; e.vy = 40; }
          else { e.vy = 0; e.y = s.y + s.h; }
        } else { e.y = s.y - e.h; e.vy = 0; e.onGround = true; e.onSolidGround = true; }
      }
    }
    /* пол кабины лифта */
    if (this.carBox && aabb(e, this.carBox)) {
      if (e.vy > 0 && e.y + e.h - this.carBox.y < 46) {
        e.y = this.carBox.y - e.h; e.vy = 0; e.onGround = true; e.onSolidGround = true;
      } else if (e.vy < 0) { e.y = this.carBox.y + this.carBox.h; e.vy = 0; }
      else { e.y = this.carBox.y - e.h; e.vy = 0; e.onGround = true; e.onSolidGround = true; }
    }
    if (e.vy >= 0 && !(isPlayer && e.dropT > 0)) {
      for (const p of this.platforms) {
        if (p.t !== 'one') continue;
        if (p.floor !== e.floor) continue;
        const prevFeet = e.y + e.h - e.vy * dt;
        if (prevFeet <= p.y + 6 && e.y + e.h >= p.y && e.y + e.h <= p.y + 26 && e.x + e.w > p.x + 2 && e.x < p.x + p.w - 2) {
          e.y = p.y - e.h; e.vy = 0; e.onGround = true;
        }
      }
    }
    if (isPlayer && this.bossStarted && !this.bossDead) {
      /* арена закрыта: держим внутри */
      const b = BOSS_DEF.leash;
      e.x = clamp(e.x, b[0] + 20, b[1] - 20 - e.w);
    }
  },
  /* перекрытие как платформа для врагов/игрока при переходе этажей */
  enterFloor(e) { e.floor = this.floorAtY(e.y + e.h); },

  /* ================= БОЙ ================= */
  meleeHit(box, dmg, dirx) {
    let hit = false;
    const done = new Set();
    for (const g of this.ghosts) if (!g.dead && aabb(box, g) && !done.has(g)) { g.takeDamage(dmg, this, dirx); done.add(g); hit = true; }
    for (const m of this.minibosses) if (!m.dead && aabb(box, m)) { m.takeDamage(dmg, this, dirx); hit = true; }
    if (this.boss && !this.boss.dead && aabb(box, this.boss)) { this.boss.takeDamage(dmg, this, dirx); hit = true; }
    if (hit) { AudioSys.hitFlesh(); Camera.shake(0.18); }
    return hit;
  },
  pistolShot(x, y, ang) {
    const len = 980;
    const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
    let bestT = 1, bestG = null;
    const testPt = (px, py, r) => {
      const dx = ex - x, dy = ey - y;
      const t = clamp(((px - x) * dx + (py - y) * dy) / (len * len), 0, 1);
      return dist(px, py, x + dx * t, y + dy * t) < r ? t : -1;
    };
    for (const g of this.ghosts) {
      if (g.dead || g.floor !== this.player.floor) continue;
      const t = testPt(g.cx(), g.cy(), Math.max(g.w, g.h) * 0.55);
      if (t >= 0 && t < bestT) { bestT = t; bestG = g; }
    }
    for (const m of this.minibosses) {
      if (m.dead || m.floor !== this.player.floor) continue;
      const t = testPt(m.cx(), m.cy(), Math.max(m.w, m.h) * 0.5);
      if (t >= 0 && t < bestT) { bestT = t; bestG = m; }
    }
    if (this.boss && !this.boss.dead) {
      const t = testPt(this.boss.cx(), this.boss.cy(), 62);
      if (t >= 0 && t < bestT) { bestT = t; bestG = this.boss; }
    }
    for (const d of this.doors) {
      if (!d.solid || d.floor !== this.player.floor) continue;
      if ((x < d.x) !== (ex < d.x)) {
        const t = (d.x - x) / (ex - x);
        const qy = y + (ey - y) * t;
        if (t >= 0 && t < bestT && qy > d.y && qy < d.y + d.h) { bestT = t; bestG = null; }
      }
    }
    const hx = x + (ex - x) * bestT, hy = y + (ey - y) * bestT;
    this.effects.push({ kind: 'tracer', x1: x, y1: y, x2: hx, y2: hy, t: 0, dur: 0.14 });
    Particles.spark(hx, hy, 6);
    if (bestG) { bestG.takeDamage(WEAPONS.pistol.dmg, this, sign(Math.cos(ang))); AudioSys.hitFlesh(); }
    this.addNoise(x, y, 1100);
    for (const g of this.ghosts) if (dist(g.cx(), g.cy(), x, y) < 1000) g.alertT = 4;
  },
  spawnProjectile(o) { this.projectiles.push(new Projectile(o)); },
  spawnGhost(type, x, floorIdx, leash) {
    const g = new Ghost(type, x, floorIdx, leash);
    this.ghosts.push(g);
    Particles.soul(g.cx(), g.cy(), 12);
    return g;
  },
  summonMinions(x, phase) {
    if (this.ghosts.filter(g => !g.dead).length >= 7) return;
    const types = phase >= 3 ? ['whisper', 'double'] : ['whisper', 'whisper'];
    for (const t of types) {
      const gx = clamp(x + rand(-280, 280), BOSS_DEF.leash[0], BOSS_DEF.leash[1] - 60);
      this.spawnGhost(t, gx, BOSS_DEF.f, BOSS_DEF.leash.slice());
    }
    this.toast('☠ Тамик призвал тварей из твоей головы!', 'red');
  },
  onGhostKilled(g) {
    this.player.kills++;
    this.player.san = clamp(this.player.san + 7, 0, 100);
    Floaters.add(g.cx(), g.cy() - 30, GHOST_NAMES[g.type] + ' повержен', '#ffd166', 15);
    const r = Math.random();
    if (r < 0.2) { this.player.pills = Math.min(6, this.player.pills + 1); this.toast('💊 Из тени выпали пилюли', ''); }
    else if (r < 0.36) { this.player.reserve += 6; this.toast('🔸 +6 патронов', ''); }
    else if (r < 0.44) { this.player.medkits = Math.min(6, this.player.medkits + 1); this.toast('🩹 Тень оставила бинты', ''); }
    else if (r < 0.52) { this.player.bottles++; this.toast('🍾 Бутылка из ниоткуда', ''); }
    else if (r < 0.58) { this.player.batteries++; this.toast('🔋 Батарейка', ''); }
    this.refreshHUD();
  },
  onMinibossKilled(mb) {
    this.player.kills++;
    this.toast('☠ ' + mb.name + ' ПОВЕРЖЕН!', 'gold');
    this.subtitle(mb.def.outro, 5);
    const drop = mb.def.drop;
    if (drop === 'elev_card') { this.elevatorCard = true; this.toast('🎫 КАРТА ЛИФТА у тебя. Лифт в холле, 1 этаж.', 'gold'); }
    else if (drop === 'key_attic') { this.player.keys.key_attic = true; this.toast('🗝 КЛЮЧ ОТ ЧЕРДАКА получен', 'gold'); }
    else if (drop === 'key_ord') { this.player.keys.key_ord = true; this.toast('🗝 КЛЮЧ ОРДИНАТОРСКОЙ получен', 'gold'); }
    Particles.soul(mb.cx(), mb.cy(), 40);
    AudioSys.bossDie();
    this.effects.push({ kind: 'ring', x: mb.cx(), y: mb.cy(), r: 20, max: 460, t: 0, dur: 1.0, color: '#ffd166' });
    this.refreshHUD();
    this.save(true);
  },
  bossMusic(who) { this.musicBoss = who; AudioSys.setIntensity(0.9); },

  /* ================= СВЕТ/ПИТАНИЕ ================= */
  applyPower(on) {
    this.power = on;
    for (const l of this.lamps) {
      if (l.floor === 0 && l.y > FLOORS[0].y - 200) continue;
    }
    AudioSys.powerOn();
    Camera.shake(0.2);
    if (on) {
      this.toast('⚡ ПИТАНИЕ ВКЛЮЧЕНО. Свет вернулся.', 'gold');
      this.subtitle('Лампы загудели. Где-то далеко открылась дверь архива. И лифт поехал наверх.');
      const d = this.doors.find(x => x.id === 'd_arch');
      if (d) d.open = true;
    }
  },

  /* ================= МИНИ-ИГРЫ ================= */
  hideMini() { this.miniHint = null; $('interact-prompt').classList.add('hidden'); },
  miniSpark() { Particles.spark(Input.mouse.sx + Camera.x, Input.mouse.sy + Camera.y, 4, '#ffd166'); },

  startDrawer(room, furn, onDone) {
    const p = this.player;
    p.startMini('drawer', {
      hint: 'Держи ЛКМ и ТЯНИ ящик вниз (или вбок — как тянется).',
      data: { dir: Math.random() < 0.5 ? 'down' : 'right', furn },
      onDone: () => {
        AudioSys.door(); Particles.dust(furn.cx(), furn.y + furn.h, 10);
        this.addNoise(furn.cx(), furn.y, 260);
        onDone();
      },
      onEnd: () => { },
    }, this);
  },
  startLock(door, pins, onDone) {
    const p = this.player;
    const arr = [];
    for (let i = 0; i < pins; i++) arr.push(rand(-0.72, 0.72));
    p.startMini('lock', {
      hint: 'Взлом: веди мышью, поймай ПИН в зелёной зоне и держи, пока он не встанет.',
      data: { pins: arr, cur: 0, pos: 0, hold: 0 },
      onDone: () => {
        AudioSys.unlock(); AudioSys.door();
        Particles.spark(door.x, door.y + 60, 12, '#ffd166');
        onDone();
      },
    }, this);
  },
  startPry(target, title, onDone) {
    const p = this.player;
    p.startMini('pry', {
      hint: title || 'Отогни крышку: тяни мышь ВВЕРХ, потом резко ВБОК.',
      data: { phase: 0, p2: 0 },
      onDone: () => { AudioSys.noise(0.3, 0.25, 600, 2); onDone(); },
    }, this);
  },
  startHold(target, title, onDone) {
    this.player.startMini('hold', {
      hint: title || 'Тяни мышь ВВЕРХ, чтобы вытащить.',
      onDone: () => onDone(),
    }, this);
  },
  updateFuse(dt) {
    if (!this.fuse.active || this.fuse.solved) return;
    for (let i = 1; i <= 5; i++) {
      if (Input.pressed['Digit' + i]) {
        const idx = i - 1;
        if (this.fuse.switches[idx]) return;
        const want = this.fuse.order[this.fuse.entered.length];
        if (want === i) {
          this.fuse.switches[idx] = true;
          this.fuse.entered.push(i);
          AudioSys.tone(400 + i * 90, 0.12, 'square', 0.16);
          Particles.spark(FUSEBOX.x, FLOORS[0].y - 120, 4, '#8adfff');
          if (this.fuse.entered.length === this.fuse.order.length) {
            this.fuse.solved = true; this.fuse.active = false;
            this.applyPower(true);
            this.save(true);
          }
        } else {
          AudioSys.noise(0.5, 0.4, 900, 1, 'lowpass');
          Camera.shake(0.5);
          Particles.spark(FUSEBOX.x, FLOORS[0].y - 120, 22, '#ffe066');
          this.toast('⚡ Неверный порядок! Щиток искрит — шум слышно издалека', 'red');
          this.addNoise(FUSEBOX.x, FLOORS[0].y - 120, 1200);
          this.fuse.entered = []; this.fuse.switches = [false, false, false, false, false];
          this.fuse.flash = 0.4;
        }
      }
    }
    if (this.fuse.flash > 0) this.fuse.flash -= dt;
  },

  /* ================= ВЕНТИЛЯЦИЯ / ЛИФТ ================= */
  openVent(v, fromA) {
    const p = this.player;
    this.startPry(v, 'Отогни решётку вентиляции затычкой: тяни ВВЕРХ, потом ВБОК.', () => {
      this.ventOpen[v.id] = true;
      this.ventAnim[v.id] = 1;
      this.toast('🕳 Решётка снята. [E] — ползти по вентиляции', 'gold');
      this.addNoise(v.a.x, FLOORS[v.a.f].y - 200, 500);
    });
  },
  crawlVent(v, fromA) {
    const p = this.player;
    const to = fromA ? v.b : v.a;
    this.state = 'crawl'; this.crawlT = 1.1;
    AudioSys.noise(0.9, 0.2, 400, 1, 'lowpass');
    p.hidden = null;
    const fx = p.cx();
    for (let i = 0; i < 24; i++) Particles.dust(fx + rand(-20, 20), p.y + rand(0, 40), 2);
    this.effects.push({ kind: 'vent', x: p.cx(), y: p.cy(), t: 0, dur: 1.0, to });
    setTimeout(() => {
      p.x = to.x - p.w / 2; p.y = FLOORS[to.f].y - p.h; p.floor = to.f; p.vx = 0; p.vy = 0;
      this.state = 'play'; this.rebuildSolids();
      this.toast('🕳 Ты вылез с другой стороны', '');
      this.addNoise(p.cx(), p.cy(), 300);
      this.refreshFloorHUD();
    }, 1000);
  },
  elevatorMove(f) {
    const e = this.elevator;
    if (!this.elevatorCard) { this.toast('🎫 Нужна карта лифта (у санитара в морге)', 'red'); AudioSys.locked(); return; }
    if (f > 0 && !this.power) { this.toast('⚡ На этаже нет тока. Нужен щиток в прачечной.', 'red'); AudioSys.locked(); return; }
    if (e.target === f) return;
    e.target = f;
    AudioSys.elevator();
    this.toast(`🛗 Лифт едет на ${f + 1} этаж…`, '');
  },
  updateElevator(dt) {
    const e = this.elevator;
    const car = e.car;
    const targetY = e.stations[e.target].y;
    if (Math.abs(car.y - targetY) > 0.5) {
      const dir = sign(targetY - car.y);
      const step = Math.min(Math.abs(targetY - car.y), e.speed * dt);
      car.y += dir * step;
      const p = this.player;
      // игрок едет вместе с кабиной
      if (!p.hidden && p.floor === e.at && Math.abs(p.y + p.h - car.y) < 12 && p.x + p.w > car.x && p.x < car.x + car.w) {
        p.y = car.y - p.h;
      }
      for (const g of this.ghosts) {
        if (Math.abs(g.y + g.h - car.y) < 12 && g.x + g.w > car.x && g.x < car.x + car.w) g.y = car.y - g.h;
      }
      if (Math.random() < dt * 8) Particles.dust(car.x + rand(0, car.w), car.y, 2);
    } else if (e.at !== e.target) {
      e.at = e.target;
      const p = this.player;
      this.toast(`🛗 ${FLOORS[e.at].name}`, 'gold');
      AudioSys.elevatorDing();
      if (!p.hidden) { p.floor = e.at; this.refreshFloorHUD(); }
    }
    return { x: car.x, y: car.y, w: car.w, h: car.h };
  },

  /* ================= СКРИПТОВАННЫЕ СЦЕНЫ ================= */
  runScare(s) {
    s.used = true;
    AudioSys.sting(); Camera.shake(0.45);
    const rm = ROOMS.find(r => r.i === s.room);
    switch (s.type) {
      case 'lockerSlam': {
        const f = this.furniture.filter(f => f.room === s.room && f.type === 'locker')[0];
        if (f) { f.opened = true; f.anim = 1; Particles.glass(f.cx(), f.y + 40, 16); AudioSys.glass(); }
        this.addNoise(rm.x0 + 400, FLOORS[0].y - 100, 900);
        this.player.san = clamp(this.player.san - 8, 0, 100);
        break;
      }
      case 'gurneyRoll': {
        const g = { x: rm.x0 + 200, y: FLOORS[0].y - 52, w: 132, h: 52, vx: 340 };
        this.effects.push({ kind: 'rollingGurney', g, t: 0, dur: 2.2 });
        AudioSys.noise(2.0, 0.22, 300, 1, 'lowpass');
        this.addNoise(rm.x1 - 200, FLOORS[0].y - 40, 900);
        this.player.san = clamp(this.player.san - 10, 0, 100);
        break;
      }
      case 'lightsDie': {
        this.blackout = 6.5;
        this.player.san = clamp(this.player.san - 6, 0, 100);
        break;
      }
      case 'handprint': {
        this.effects.push({ kind: 'handprint', x: rm.x0 + 500, y: FLOORS[1].y - 300, t: 0, dur: 6 });
        this.player.san = clamp(this.player.san - 9, 0, 100);
        break;
      }
      case 'wallBulge': {
        this.effects.push({ kind: 'bulge', x: rm.x0 + 300, y: FLOORS[1].y - 300, t: 0, dur: 4 });
        this.spawnGhost('whisper', rm.x0 + 340, 1, [rm.x0 + 20, rm.x1 - 20]);
        this.player.san = clamp(this.player.san - 12, 0, 100);
        break;
      }
      case 'musicBox': {
        AudioSys.musicBox();
        this.effects.push({ kind: 'musicBox', x: rm.x0 + 600, y: FLOORS[1].y - 120, t: 0, dur: 6 });
        this.player.san = clamp(this.player.san - 14, 0, 100);
        break;
      }
      case 'xrayGhost': {
        this.effects.push({ kind: 'xray', x: rm.x0 + 900, y: FLOORS[2].y - 260, t: 0, dur: 6 });
        this.spawnGhost('double', rm.x0 + 950, 2, [rm.x0 + 20, rm.x1 - 20]);
        this.player.san = clamp(this.player.san - 16, 0, 100);
        break;
      }
      case 'mirror': {
        this.effects.push({ kind: 'mirror', x: rm.x0 + 700, y: FLOORS[2].y - 260, t: 0, dur: 5 });
        this.spawnGhost('double', rm.x0 + 760, 2, [rm.x0 + 20, rm.x1 - 20]);
        this.player.san = clamp(this.player.san - 18, 0, 100);
        break;
      }
    }
    this.subtitle(s.sub, 4.5);
    this.toast('👁 ' + s.sub, 'red');
  },

  /* ================= ВЗАИМОДЕЙСТВИЕ ================= */
  findInteract() {
    const p = this.player;
    if (p.dead) return null;
    const list = [];
    if (p.hidden) {
      return { type: 'exitHide', o: p.hidden, label: 'Вылезти из шкафа' };
    }
    if (p.channel || p.mini) return null;
    /* подборы */
    for (const k of this.pickups) {
      if (k.taken || k.floor !== p.floor) continue;
      const d = dist(p.cx(), p.cy(), k.x, k.y - 20);
      if (d < 100) list.push({ type: 'pickup', o: k, label: k.label(), d, prio: 1 });
    }
    /* мебель */
    for (const f of this.furniture) {
      if (f.floor !== p.floor) continue;
      const d = dist(p.cx(), p.cy(), f.cx(), f.y + f.h / 2);
      if (d < 120) {
        if (!f.opened) list.push({ type: 'furn', o: f, label: f.label(), d, prio: 2 });
        if (f.canHide() && d < 80) list.push({ type: 'hide', o: f, label: 'Спрятаться в шкаф (F)', d: d + 6, prio: 3 });
      }
    }
    /* двери */
    for (const dr of this.doors) {
      if (dr.floor !== p.floor) continue;
      if (dr.id === 'd_ord' && this.bossStarted && !this.bossDead) continue;
      const d = Math.abs(p.cx() - dr.x);
      if (d < 95 && p.y + p.h > dr.y - 10 && p.y < dr.y + dr.h) {
        list.push({ type: 'door', o: dr, label: this.doorLabel(dr), d, prio: 1 });
        if (p.weapons.pick && p.cur === 'pick' && dr.pinned && dr.anim > 0.7) list.push({ type: 'unpin', o: dr, label: 'Вытащить затычку из двери', d: d + 4, prio: 1 });
        else if (p.weapons.pick && p.cur === 'pick' && !dr.pinned && dr.open && !dr.locked) list.push({ type: 'pin', o: dr, label: '🚪 ЗАТКНУТЬ дверь затычкой (задержит тварей)', d: d + 5, prio: 1 });
      }
    }
    /* лифт */
    const e = this.elevator, car = e.car;
    const fy = FLOORS[p.floor].y;
    if (Math.abs(car.y - fy) < 30 && Math.abs(p.x + p.w / 2 - (car.x + car.w / 2)) < car.w / 2 + 70) {
      if (p.x > car.x - 20 && p.x < car.x + car.w + 20) {
        for (let i = 0; i < 3; i++) list.push({ type: 'elev', floor: i, label: `🛗 Лифт: ${i + 1} этаж${i > 0 && !this.power ? ' (нет тока)' : ''}`, d: 20, prio: 0 });
      } else if (Math.abs(car.y - fy) < 30) {
        list.push({ type: 'elevCall', label: '🛗 Вызвать лифт сюда', d: 40, prio: 1 });
      }
    }
    /* щиток */
    if (FUSEBOX.floor === p.floor && Math.abs(p.cx() - FUSEBOX.x) < 90 && !this.fuse.solved) {
      list.push({
        type: 'fuse', label: this.fuse.active ? '⚡ Щиток: включи рубильники (1-5) в порядке 3-1-4' :
          (p.weapons.pick ? '⚡ Вскрыть щиток затычкой' : '⚡ Щиток заперт. Нужна затычка'), d: 30, prio: 0
      });
    }
    /* вентиляция */
    for (const v of VENTS) {
      for (const side of ['a', 'b']) {
        const pt = v[side];
        if (pt.f !== p.floor) continue;
        const d = Math.abs(p.cx() - pt.x);
        if (d < 90) {
          if (!this.ventOpen[v.id]) list.push({ type: 'vent', o: v, fromA: side === 'a', label: '🕳 Вскрыть вентиляцию (нужна затычка)', d, prio: p.weapons.pick ? 2 : 4 });
          else list.push({ type: 'ventGo', o: v, fromA: side === 'a', label: '🕳 Ползти в вентиляцию', d, prio: 1 });
        }
      }
    }
    /* лестницы — подсказка */
    const lad = this.ladderAt(p.cx(), p.y, p.h);
    if (lad && !p.climbing) list.push({ type: 'ladderHint', o: lad, label: '🪜 Лестница — зажми W (вверх) / S (вниз)', d: 100, prio: 5 });
    /* выход */
    if (this.bossDead && p.floor === 2 && p.cx() > EXIT_ZONE.x0 && p.cx() < EXIT_ZONE.x1) {
      list.push({ type: 'exit', label: '🚪 ВЫЙТИ ИЗ БОЛЬНИЦЫ', d: 5, prio: 0 });
    }
    list.sort((a, b) => (a.prio - b.prio) || (a.d - b.d));
    return list[0] || null;
  },
  doorLabel(dr) {
    const p = this.player;
    if (dr.pinned) return '🚪 Дверь ЗАТКНУТА затычкой (тварь ломает)';
    if (!dr.locked) return dr.open ? `Закрыть: ${dr.name}` : `Открыть: ${dr.name}`;
    if (dr.locked === 'power') return this.power ? `Открыть: ${dr.name} (замок под током)` : '⚡ Электрозамок мёртв. Нужно питание (щиток в прачечной)';
    if (dr.locked === 'pick') {
      if (!p.weapons.pick) return '🔒 Заперто. Нужна ЗАТЫЧКА-отмычка';
      if (p.cur !== 'pick') return '🔒 Возьми ЗАТЫЧКУ в руки [4] и вскрой замок';
      return `🔓 Вскрыть замок: ${dr.name} (${dr.pins} пина)`;
    }
    if (dr.locked === 'key_red') return p.keys.key_red ? '🔑 Открыть красным ключом' : '🔒 Нужен КРАСНЫЙ КЛЮЧ (морг, холодильник №3)';
    if (dr.locked === 'key_attic') return p.keys.key_attic ? '🗝 Открыть ключом от чердака' : '🔒 Нужен КЛЮЧ ОТ ЧЕРДАКА (сестра милосердия)';
    if (dr.locked === 'boss') {
      const n = p.notes.length;
      if (!p.keys.key_ord) return '☠ Нужен КЛЮЧ ОРДИНАТОРСКОЙ (хирург без лица)';
      if (!p.weapons.pick) return '☠ Нужна ЗАТЫЧКА';
      if (p.cur !== 'pick') return '☠ Возьми затычку [4]';
      if (n < 9) return `☠ Дверь не узнаёт тебя. Записок: ${n}/9 нужно`;
      return '☠ ВСКРЫТЬ ДВЕРЬ ТАМИКА. Назад пути не будет.';
    }
    return 'Открыть';
  },
  doInteract(t) {
    const p = this.player;
    switch (t.type) {
      case 'hide': {
        p.hidden = t.o; p.vx = 0; p.vy = 0;
        AudioSys.door();
        this.toast('🚪 Ты в шкафу. E — вылезти. Твари могут заглянуть…', '');
        break;
      }
      case 'exitHide': p.hidden = null; p.hideCooldown = 0.4; AudioSys.door(); break;
      case 'pickup': this.takePickup(t.o); break;
      case 'furn': {
        const f = t.o;
        if (f.style === 'drawer' || f.style === 'pull') {
          this.startDrawer(f.room, f, () => this.openFurniture(f));
        } else {
          AudioSys.search();
          p.channel = { t: 0, dur: 0.8, label: f.style === 'swing' ? 'Открываю дверцу…' : 'Откидываю ткань…', noisy: false, onDone: () => this.openFurniture(f) };
        }
        break;
      }
      case 'door': this.tryDoor(t.o); break;
      case 'pin': t.o.pinned = true; t.o.breakProg = 0; AudioSys.noise(0.2, 0.2, 500, 2); this.toast('🚪 Затычка вставлена. Дверь держит.', ''); break;
      case 'unpin': t.o.pinned = false; AudioSys.noise(0.2, 0.18, 600, 2); this.toast('Затычка вынута.', ''); break;
      case 'elev': this.elevatorMove(t.floor); break;
      case 'elevCall': {
        const p2 = p;
        this.elevator.target = p2.floor; this.elevator.at = -1;
        AudioSys.elevator(); this.toast('🛗 Лифт вызван…', '');
        break;
      }
      case 'fuse': {
        if (this.fuse.active) { this.toast('⚡ Рубильники: 1-5. Порядок — 3-1-4 (написано в записке)', ''); break; }
        if (this.fuse.solved) { this.toast('⚡ Питание в норме.', ''); break; }
        if (!p.weapons.pick) { AudioSys.locked(); break; }
        if (p.cur !== 'pick') { this.toast('Возьми затычку [4]', 'red'); break; }
        this.startPry(FUSEBOX, 'Отогни дверцу щитка затычкой: тяни ВВЕРХ, потом ВБОК.', () => {
          this.fuse.active = true;
          this.toast('⚡ Щиток открыт! Жми рубильники клавишами 1–5 в порядке 3-1-4', 'gold');
          this.subtitle('Порядок — как номера палат «особых»: третий, первый, четвёртый.');
        });
        break;
      }
      case 'vent': {
        if (!p.weapons.pick) { this.toast('Нужна затычка, чтобы отогнуть решётку', 'red'); AudioSys.locked(); break; }
        if (p.cur !== 'pick') { this.toast('Возьми затычку [4]', 'red'); break; }
        this.openVent(t.o, t.fromA);
        break;
      }
      case 'ventGo': this.crawlVent(t.o, t.fromA); break;
      case 'ladderHint': this.subtitle('Зажми W — лезть вверх, S — вниз. Наверху другой этаж.', 3); break;
      case 'exit': this.finishGame(); break;
    }
  },
  tryDoor(dr) {
    const p = this.player;
    if (dr.pinned) { AudioSys.locked(); return; }
    if (dr.open) { dr.open = false; AudioSys.door(); return; }
    if (!dr.locked) { dr.open = true; AudioSys.door(); this.addNoise(dr.x, dr.y, 200); return; }
    if (dr.locked === 'power') {
      if (this.power) { dr.open = true; AudioSys.unlock(); AudioSys.door(); this.toast('⚡ Замок загудел и щёлкнул.', 'gold'); }
      else { AudioSys.locked(); }
      return;
    }
    if (dr.locked === 'pick') {
      if (!p.weapons.pick || p.cur !== 'pick') { AudioSys.locked(); Camera.shake(0.1); return; }
      this.startLock(dr, dr.pins, () => {
        dr.open = true;
        this.toast(`🔓 Замок вскрыт: ${dr.name}`, 'gold');
        this.addNoise(dr.x, dr.y, 600);
        this.subtitle('Щёлкнуло. Затычка цела. Тихо — но кто-то всё равно услышал.');
        this.save(true);
      });
      return;
    }
    if (dr.locked === 'key_red') {
      if (!p.keys.key_red) { AudioSys.locked(); return; }
      dr.open = true; AudioSys.unlock(); AudioSys.door();
      this.toast('🔑 Красный ключ провернулся. Изолятор открыт.', 'gold');
      this.addNoise(dr.x, dr.y, 300);
      this.save(true);
      return;
    }
    if (dr.locked === 'key_attic') {
      if (!p.keys.key_attic) { AudioSys.locked(); return; }
      dr.open = true; AudioSys.unlock();
      this.toast('🗝 Гермодверь на чердак открыта.', 'gold');
      this.subtitle('Выше — только чердак и он. Дыши глубже.');
      this.save(true);
      return;
    }
    if (dr.locked === 'boss') {
      if (!p.keys.key_ord || !p.weapons.pick || p.cur !== 'pick' || p.notes.length < 9) { AudioSys.locked(); AudioSys.whisper(); return; }
      this.startLock(dr, dr.pins, () => {
        dr.open = true; dr.locked = null;
        AudioSys.unlock(); AudioSys.bossRoar();
        this.toast('☠ Дверь открыта. ОН ждёт.', 'red');
        this.subtitle('«А-а-а… Двенадцатый. Заходи. Я тебя ждал».');
        Camera.shake(0.6);
        this.addNoise(dr.x, dr.y, 1400);
        this.save(true);
      });
    }
  },
  openFurniture(f) {
    if (f.opened) return;
    f.opened = true;
    AudioSys.pickup();
    let gotNote = false, empty = true;
    for (const code of f.loot) {
      if (code === 'nothing') continue;
      empty = false;
      if (code === 'trap') {
        const rm = ROOMS.find(r => r.i === f.room);
        this.spawnGhost('whisper', clamp(f.cx() + 60, rm.x0 + 20, rm.x1 - 20), f.floor, [rm.x0 + 20, rm.x1 - 20]);
        AudioSys.sting(); Camera.shake(0.5);
        this.toast('😱 ЗАСАДА! Из мебели вырвался Шептун!', 'red');
        this.player.san = clamp(this.player.san - 10, 0, 100);
        continue;
      }
      if (code.startsWith('note:')) { this.openNote(+code.split(':')[1]); gotNote = true; continue; }
      this.applyLoot(code);
    }
    if (empty) this.toast('Пусто. Только пыль и чей-то волос…', '');
    this.refreshHUD();
    this.save(true);
  },
  takePickup(k) {
    if (k.taken) return;
    k.taken = true;
    AudioSys.pickup();
    Particles.spark(k.x, k.y - 20, 10);
    if (k.kind.startsWith('note:')) this.openNote(+k.kind.split(':')[1]);
    else this.applyLoot(k.kind);
    this.refreshHUD();
    this.save(true);
  },
  applyLoot(code) {
    const p = this.player;
    if (code === 'knife') { p.weapons.knife = true; p.cur = 'knife'; this.toast('🔪 Найден НОЖ! [2]', 'gold'); this.subtitle('Скальпель. Острый. Теперь они меня боятся.'); }
    else if (code === 'pistol') { p.weapons.pistol = true; p.cur = 'pistol'; p.mag = 8; this.toast('🔫 Найден ПИСТОЛЕТ! [3] — целься мышью', 'gold'); this.subtitle('Табельный ПМ. Восемь патронов. Громкий — тени сбегутся.'); }
    else if (code === 'pick') { p.weapons.pick = true; p.cur = 'pick'; this.toast('🥄 Найдена ЗАТЫЧКА! [4] — замки, вентиляция, щиток', 'gold'); this.subtitle('Гнутая ложка. Ею вскрывают двери. Ею же затыкают их — чтобы твари грызли железо, а не тебя.'); }
    else if (code === 'key_red') { p.keys.key_red = true; this.toast('🔑 КРАСНЫЙ КЛЮЧ — путь в изолятор открыт', 'gold'); }
    else if (code === 'key_attic') { p.keys.key_attic = true; this.toast('🗝 КЛЮЧ ОТ ЧЕРДАКА', 'gold'); }
    else if (code === 'key_ord') { p.keys.key_ord = true; this.toast('🗝 КЛЮЧ ОРДИНАТОРСКОЙ', 'gold'); }
    else if (code === 'elev_card') { this.elevatorCard = true; this.toast('🎫 КАРТА ЛИФТА', 'gold'); }
    else if (code === 'medkit') { p.medkits = Math.min(6, p.medkits + 1); this.toast('🩹 +1 аптечка [Q]', ''); }
    else if (code === 'pills') { p.pills = Math.min(6, p.pills + 1); this.toast('💊 +1 пилюли [T]', ''); }
    else if (code === 'bottle') { p.bottles = Math.min(9, p.bottles + 1); this.toast('🍾 +1 бутылка [G] — бросок отвлекает тварей', ''); }
    else if (code === 'battery') { p.batteries = Math.min(9, p.batteries + 1); this.toast('🔋 +1 батарейка [B] — вставить в фонарь', ''); }
    else if (code === 'syringe') { p.hp = clamp(p.hp + 25, 0, p.maxhp); p.san = clamp(p.san + 10, 0, 100); this.toast('💉 Транквилизатор: +25 HP, +10 рассудка', ''); AudioSys.heal(); }
    else if (code.startsWith('ammo')) { const n = +code.split(':')[1]; p.reserve += n; this.toast(`🔸 +${n} патронов (всего ${p.reserve})`, ''); }
  },

  /* ================= ЗАПИСКИ ================= */
  openNote(id) {
    /* записка перекрывает экран — закрываем мини-игру/канал */
    if (this.player.mini) { this.player.mini = null; this.hideMini(); }
    if (this.player.channel) this.player.channel = null;
    if (this.player.notes.includes(id)) return;
    this.player.notes.push(id);
    this.noteId = id;
    AudioSys.note();
    const n = NOTES[id];
    $('note-title').textContent = n.title;
    $('note-body').textContent = n.body;
    $('note-count').textContent = `Записок: ${this.player.notes.length}/12`;
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
    if (n === 4) this.subtitle('Четыре записки… Первый этаж пройден. Лифт — в холле, но нужна карта.');
    else if (n === 8) this.subtitle('Восемь. Я помню уже почти всё. Осталось четыре — и он.');
    else if (n === 12) { this.subtitle('Все двенадцать. Я ВСПОМНИЛ. Прости, Тимка. Теперь — за Тамиком.'); this.toast('📄 ВСЕ ЗАПИСКИ СОБРАНЫ!', 'gold'); }
  },

  /* ================= ФИНАЛ ================= */
  onDeath() { AudioSys.sting(); Camera.shake(0.8); this.deathT = 1.4; },
  showDeadScreen() {
    this.state = 'dead';
    $('dead-quote').textContent = DEAD_QUOTES[(Math.random() * DEAD_QUOTES.length) | 0];
    $('dead-screen').classList.remove('hidden');
    $('boss-bar').classList.add('hidden');
    AudioSys.setIntensity(0.2);
  },
  onBossDeath() {
    this.bossDead = true;
    $('boss-bar').classList.add('hidden');
    for (const g of this.ghosts) if (!g.dead) { g.dead = true; g.dieT = 0.6; Particles.soul(g.cx(), g.cy(), 16); }
    for (const m of this.minibosses) if (!m.dead) { m.dead = true; m.dieT = 1; Particles.soul(m.cx(), m.cy(), 20); }
    this.gates = []; this.rebuildSolids();
    this.toast('☠ ТАМИК МЁРТВ. Тишина лопается…', 'gold');
    this.subtitle('Двери распахнулись сами. Иди в Зал «Тишина» — там выход.', 6);
    this.player.san = clamp(this.player.san + 40, 0, 100);
    AudioSys.setIntensity(0.25);
    this.winT = 2.0;
    this.save(true);
  },
  finishGame() {
    if (this.state === 'win') return;
    const n = this.player.notes.length;
    this.endingType = n >= 12 ? 'good' : n >= 9 ? 'escape' : 'bad';
    this.state = 'win';
    const e = ENDINGS[this.endingType];
    $('win-ending').textContent = e.title;
    $('win-ending').style.color = this.endingType === 'good' ? '#ffd166' : this.endingType === 'escape' ? '#8fd0ff' : '#ff5c6c';
    $('win-text').textContent = e.text;
    const mm = String(Math.floor(this.playTime / 60)).padStart(2, '0'), ss = String(Math.floor(this.playTime % 60)).padStart(2, '0');
    $('win-stats').textContent = `⏱ Время: ${mm}:${ss} • 💀 Убито: ${this.player.kills} • 📄 Записок: ${n}/12` +
      (n < 12 ? '\n(Собери все 12 записок, чтобы увидеть истинную концовку…)' : '\n(Истинная концовка открыта. Ты вспомнил всё.)');
    $('win-screen').classList.remove('hidden');
    $('hud').classList.add('hidden');
    try { localStorage.removeItem(SAVE_KEY); } catch (err) { /* ignore */ }
    $('btn-continue').classList.add('hidden');
  },

  /* ================= HUD ================= */
  toast(text, cls) {
    const w = $('toast-wrap');
    const d = document.createElement('div');
    d.className = 'toast ' + (cls || '');
    d.textContent = text;
    w.appendChild(d);
    while (w.children.length > 4) w.removeChild(w.firstChild);
    setTimeout(() => { d.style.transition = 'opacity .5s'; d.style.opacity = 0; setTimeout(() => d.remove(), 500); }, 3400);
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
  damageFlash() { this.dmgFlash = 1; },
  refreshFloorHUD() {
    const f = FLOORS[this.player.floor];
    $('floor-ind').textContent = '▚ ' + f.name;
    $('floor-ind').style.borderColor = ['#ffd166', '#8fd0ff', '#ff5c6c'][this.player.floor];
  },
  objectiveText() {
    const p = this.player;
    if (this.bossDead) return '🎯 Зал «Тишина» (3 этаж, налево) → выход';
    if (this.bossStarted) return '☠ УБЕЙ ТАМИКА! Свети в него и стреляй!';
    if (!p.weapons.pick) return '🎯 Гардероб (1 этаж): найди ЗАТЫЧКУ 🥄 в шкафах';
    if (!p.weapons.knife) return '🎯 Гардероб: нож в шкафчике';
    if (!this.elevatorCard) return '🎯 Морг (1 этаж): открой замок и убей САНИТАРА — забери карту лифта 🎫';
    if (!this.power) return '🎯 Прачечная (1 этаж): вскрой щиток и включи питание ⚡ (3-1-4)';
    if (p.notes.length < 9) return `🎯 Собери записки: ${p.notes.length}/9 (нужно для двери Тамика)`;
    if (!p.keys.key_ord) return '🎯 Операционная (2 этаж): ХИРУРГ БЕЗ ЛИЦА — ключ ординаторской 🗝';
    return '🎯 3 этаж → красная дверь слева от лифта → ТАМИК ☠';
  },
  refreshHUD() {
    const p = this.player;
    if (!p) return;
    $('notes-num').textContent = `${p.notes.length}/12`;
    $('objective').textContent = this.objectiveText();
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
      { icon: '🍾', nm: 'Бутылка', key: 'G', cnt: p.bottles, fn: () => p.throwBottle(this) },
      { icon: '🔋', nm: 'Батарейки', key: 'B', cnt: p.batteries, fn: null },
      { icon: '🔸', nm: 'Патроны', key: '', cnt: p.reserve, fn: null },
    ];
    if (p.keys.key_red) cons.push({ icon: '🔑', nm: 'Ключ', key: '', cnt: '', fn: null });
    if (p.keys.key_attic) cons.push({ icon: '🗝', nm: 'Чердак', key: '', cnt: '', fn: null });
    if (p.keys.key_ord) cons.push({ icon: '🗝', nm: 'Ординаторская', key: '', cnt: '', fn: null });
    if (this.elevatorCard) cons.push({ icon: '🎫', nm: 'Карта лифта', key: '', cnt: '', fn: null });
    for (const c of cons) {
      const d = document.createElement('div');
      d.className = 'inv-slot cons' + (c.cnt === 0 ? ' locked' : '');
      d.title = c.nm;
      d.innerHTML = `${c.key ? `<span class="key">${c.key}</span>` : ''}${c.icon}${c.cnt !== '' ? `<span class="cnt">${c.cnt}</span>` : ''}<span class="nm">${c.nm}</span>`;
      if (c.fn) d.onclick = () => c.fn();
      inv.appendChild(d);
    }
    const w = WEAPONS[p.cur];
    $('hand-icon').textContent = w.icon;
    $('hand-name').textContent = w.name;
    $('hand-ammo').textContent = p.cur === 'pistol'
      ? (p.reloadT > 0 ? '…перезарядка…' : `▮ ${p.mag} / ${p.reserve} [R]`)
      : (p.cur === 'pick' ? 'E — вскрыть / заткнуть' : 'ЛКМ — ударить');
    $('bat-fill').style.width = p.battery + '%';
  },
  drawPortrait() {
    const pc = $('portrait').getContext('2d');
    const p = this.player, t = performance.now() / 1000;
    pc.clearRect(0, 0, 96, 96);
    const g = pc.createLinearGradient(0, 0, 0, 96);
    g.addColorStop(0, '#141a1c'); g.addColorStop(1, '#07090a');
    pc.fillStyle = g; pc.fillRect(0, 0, 96, 96);
    const dead = p.dead, lowhp = p.hp < 30, insane = p.san < 30, tired = p.exhausted || p.st < 20;
    pc.save(); pc.translate(48, 52);
    if (dead) pc.rotate(0.4);
    if (p.hidden) pc.globalAlpha = 0.55;
    pc.fillStyle = dead ? '#8a7a6a' : '#c9a184';
    pc.fillRect(-9, 26, 18, 22);
    pc.fillStyle = '#7d94a0';
    pc.beginPath(); pc.moveTo(-34, 48); pc.lineTo(-12, 32); pc.lineTo(12, 32); pc.lineTo(34, 48); pc.closePath(); pc.fill();
    pc.fillStyle = dead ? '#a89a8a' : insane ? '#c4b0a8' : '#d8b89a';
    pc.beginPath(); pc.ellipse(0, 0, 26, 31, 0, 0, 7); pc.fill();
    pc.fillStyle = '#3a2818';
    pc.beginPath(); pc.ellipse(0, -24, 26, 14, 0, Math.PI, 0); pc.fill();
    for (let i = 0; i < 7; i++) pc.fillRect(-24 + i * 7, -34 + (i % 2) * 3, 7, 8);
    pc.fillStyle = '#cfc4ae'; pc.fillRect(-26, -22, 52, 10);
    pc.fillStyle = '#a31621'; pc.beginPath(); pc.ellipse(-13, -17, 6, 4.5, 0, 0, 7); pc.fill();
    const blink = !dead && (Math.sin(t * 2.3) > 0.985);
    const lookX = clamp(Math.cos(p.aim) * 4, -4, 4), lookY = clamp(Math.sin(p.aim) * 3, -3, 3);
    for (const s of [-1, 1]) {
      const ex = s * 11, ey = -2;
      if (dead) {
        pc.strokeStyle = '#3a0a0a'; pc.lineWidth = 3;
        pc.beginPath(); pc.moveTo(ex - 5, ey - 5); pc.lineTo(ex + 5, ey + 5); pc.moveTo(ex + 5, ey - 5); pc.lineTo(ex - 5, ey + 5); pc.stroke();
      } else if (blink) {
        pc.strokeStyle = '#2a1a1a'; pc.lineWidth = 2.4;
        pc.beginPath(); pc.moveTo(ex - 6, ey); pc.lineTo(ex + 6, ey); pc.stroke();
      } else {
        pc.fillStyle = lowhp ? '#e8b0b0' : '#fff';
        pc.beginPath(); pc.ellipse(ex, ey, 6.5, insane ? 8 : 7, 0, 0, 7); pc.fill();
        if (insane) { pc.strokeStyle = 'rgba(150,40,150,0.8)'; pc.lineWidth = 1; pc.beginPath(); pc.moveTo(ex - 6, ey - 3); pc.lineTo(ex + 6, ey + 2); pc.stroke(); }
        if (lowhp) { pc.strokeStyle = 'rgba(180,30,30,0.9)'; pc.beginPath(); pc.moveTo(ex - 6, ey + 3); pc.lineTo(ex + 6, ey - 2); pc.stroke(); }
        pc.fillStyle = insane ? '#7b2fbf' : '#181818';
        pc.beginPath(); pc.arc(ex + lookX * 0.6, ey + lookY * 0.6, insane ? 4 : 2.8, 0, 7); pc.fill();
        pc.fillStyle = '#fff'; pc.fillRect(ex + lookX * 0.6 - 1, ey + lookY * 0.6 - 1, 2, 2);
      }
      if (!dead) { pc.fillStyle = 'rgba(60,20,60,0.55)'; pc.fillRect(ex - 7, ey + 8, 14, 4); }
    }
    pc.fillStyle = 'rgba(40,30,25,0.4)'; pc.fillRect(-20, 10, 40, 16);
    pc.strokeStyle = '#5a2a2a'; pc.lineWidth = 2.4;
    pc.beginPath();
    if (dead) { pc.moveTo(-8, 20); pc.lineTo(8, 20); }
    else if (lowhp) pc.arc(0, 24, 6, Math.PI * 1.15, Math.PI * 1.85);
    else if (insane) pc.ellipse(3, 20, 4, 6, 0, 0, 7);
    else if (tired) { pc.moveTo(-6, 20); pc.lineTo(6, 22); }
    else { pc.moveTo(-6, 20); pc.lineTo(6, 19); }
    pc.stroke();
    if (tired && !dead) {
      pc.fillStyle = 'rgba(150,220,255,0.8)';
      pc.fillRect(18, -8 + ((t * 22) % 26) * 0.4, 3, 5);
      pc.fillRect(-21, -12 + ((t * 18) % 20) * 0.4, 3, 5);
    }
    if (lowhp && !dead) {
      pc.fillStyle = 'rgba(140,15,25,0.85)';
      pc.beginPath(); pc.ellipse(24, 6, 4, 9, 0.2, 0, 7); pc.fill();
      pc.fillRect(-27, -10, 5, 20);
    }
    if (insane && !dead) {
      pc.strokeStyle = 'rgba(150,60,200,0.7)'; pc.lineWidth = 1.6;
      pc.beginPath(); pc.moveTo(-24, 8); pc.quadraticCurveTo(-10, 12, -4, 22); pc.stroke();
      pc.beginPath(); pc.moveTo(24, 2); pc.quadraticCurveTo(12, 8, 8, 20); pc.stroke();
    }
    pc.restore();
    if (lowhp && !dead && Math.sin(t * 6) > 0) { pc.strokeStyle = 'rgba(200,20,30,0.9)'; pc.lineWidth = 4; pc.strokeRect(2, 2, 92, 92); }
  },

  /* ================= ЦИКЛ ================= */
  loop(now) {
    requestAnimationFrame(t => this.loop(t));
    let dt = Math.min(0.033, (now - (this._last || now)) / 1000 || 0.016);
    this._last = now;
    Input.mouse.dx = Input.mouse.sx - Input.mouse.px;
    Input.mouse.dy = Input.mouse.sy - Input.mouse.py;
    Input.mouse.px = Input.mouse.sx; Input.mouse.py = Input.mouse.sy;
    Input.mouse.wx = Input.mouse.sx + Camera.x;
    Input.mouse.wy = Input.mouse.sy + Camera.y;

    /* один сбойный кадр не должен ронять всю игру */
    try {
      if (this.state === 'cutscene') this.updateCutscene(dt);
      else if (this.state === 'play' && !this.paused) this.update(dt);
      else if (this.state === 'crawl') this.updateCrawl(dt);
      else if (this.state === 'title') this.titleT += dt;
    } catch (e) { this.reportError('update', e); }

    if (this.state !== 'title' && this.state !== 'cutscene') {
      try { this.render(); } catch (e) { this.reportError('render', e); }
    }
    if (Input.pressed['KeyM']) { AudioSys.toggleMute(); this.syncMuteBtn(); }
    if (this.state === 'play') {
      if (Input.pressed['Escape'] || Input.pressed['KeyP']) {
        if (this.noteId !== null) this.closeNote();
        else if (this.player.mini) { this.player.mini = null; this.hideMini(); }
        else this.togglePause();
      }
      if (this.noteId !== null && Input.useHit()) this.closeNote();
    }
    if (this.state === 'dead' && Input.pressed['KeyE']) this.retry();
    Input.endFrame();
  },
  updateCrawl(dt) {
    this.crawlT -= dt;
    const p = this.player;
    if (p) { p.x += Math.sin(this.crawlT * 30) * 0.6; }
    Particles.update(dt);
  },
  togglePause(force) {
    if (this.state !== 'play') return;
    this.paused = force !== undefined ? force : !this.paused;
    $('pause-menu').classList.toggle('hidden', !this.paused);
    if (this.paused) {
      const p = this.player;
      $('pause-stats').textContent = `📄 Записок: ${p.notes.length}/12 • 💀 Убито: ${p.kills} • ⏱ ${Math.floor(this.playTime / 60)}:${String(Math.floor(this.playTime % 60)).padStart(2, '0')}`;
      AudioSys.uiClick();
    }
  },

  /* ================= UPDATE ================= */
  update(dt) {
    const p = this.player;
    if (this.noteId !== null) { this.drawPortrait(); Particles.update(dt); return; }
    if (p.dead) {
      this.deathT -= dt;
      Particles.update(dt); Floaters.update(dt);
      Camera.update(dt, p.cx(), p.cy());
      if (this.deathT <= 0 && this.state === 'play') this.showDeadScreen();
      return;
    }
    if (this.bossDead && this.state === 'play') {
      this.winT -= dt;
      if (this.boss) this.boss.update(dt, this);
    }
    this.playTime += dt;
    p.update(dt, this);
    this.updateFuse(dt);
    /* шум-метки гаснут */
    for (let i = this.noises.length - 1; i >= 0; i--) {
      this.noises[i].t += dt;
      if (this.noises[i].t > 0.6) this.noises.splice(i, 1);
    }
    /* лампы */
    for (const l of this.lamps) {
      if (!l.on) { l.level = 0; continue; }
      let target = Math.random() < l.flick * 0.12 ? rand(0.1, 0.5) : 1;
      if (this.blackout > 0) target = 0.04;
      if (!this.power && (l.floor === 2 || l.r > 250)) target *= 0.55;
      l.level = lerp(l.level, target, 1 - Math.pow(0.0001, dt));
    }
    if (this.blackout > 0) { this.blackout -= dt; if (this.blackout <= 0) { AudioSys.powerOn(); this.toast('⚡ Свет вернулся… на время', ''); } }
    p.lampLit = this.lampLit(p.cx(), p.cy());
    p.lit = Math.max(p.flashOn && p.battery > 0 ? 0.55 : 0, p.lampLit);
    if (this.muzzleT > 0) { this.muzzleT -= dt; p.lit = 1; }
    /* двери и кабина */
    for (const d of this.doors) {
      if (d.id === 'd_ord' && this.bossStarted && !this.bossDead) d.open = false;
      d.update(dt);
    }
    const car = this.updateElevator(dt);
    this.carBox = { x: car.x, y: car.y, w: car.w, h: car.h, t: 'solid', elevator: true };
    /* враги */
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i];
      if (p.floor !== g.floor && Math.abs(g.cy() - p.cy()) > 700) continue;
      if (!g.update(dt, this)) this.ghosts.splice(i, 1);
    }
    for (let i = this.minibosses.length - 1; i >= 0; i--) {
      const m = this.minibosses[i];
      if (m.floor !== p.floor && !m.awake) { m.vx = 0; continue; }
      if (!m.update(dt, this)) this.minibosses.splice(i, 1);
    }
    /* босс-триггер */
    if (!this.bossStarted && !this.bossDead && p.floor === 2 && p.cx() > 1720 && p.cx() < 2900 && this.doors.find(d => d.id === 'd_ord').anim > 0.3) {
      this.bossStarted = true;
      const dr = this.doors.find(d => d.id === 'd_ord');
      dr.open = false;
      this.boss = new Boss(BOSS_DEF.x);
      this.gates = [
        { x: 1666, y: FLOORS[2].y - 620, w: 26, h: 620, t: 'solid', floor: 2, gate: true },
        { x: 2934, y: FLOORS[2].y - 620, w: 26, h: 620, t: 'solid', floor: 2, gate: true },
      ];
      this.rebuildSolids();
      AudioSys.bossRoar(); Camera.shake(0.9);
      $('boss-bar').classList.remove('hidden');
      $('boss-name').textContent = '☠ ' + BOSS_DEF.name + ' ☠';
      this.subtitle(BOSS_DEF.intro, 6);
      this.toast('☠ ГЛАВВРАЧ ТАМИК ☠', 'red');
      AudioSys.setIntensity(1);
      this.refreshHUD();
    }
    if (this.boss && !this.boss.dead) {
      this.boss.update(dt, this);
      $('boss-fill').style.width = (this.boss.hp / this.boss.maxhp * 100) + '%';
    }
    /* снаряды */
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      this.projectiles[i].update(dt, this);
      if (this.projectiles[i].dead) this.projectiles.splice(i, 1);
    }
    /* эффекты */
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.t += dt;
      if (e.kind === 'ring') {
        e.r = lerp(e.max, 10, 1 - e.t / e.dur);
        if (e.dmg && !e.hitDone) {
          const d = dist(p.cx(), p.cy(), e.x, e.y);
          if (Math.abs(d - e.r) < 48) {
            e.hitDone = true;
            p.takeDamage(e.dmg, this);
            if (e.san) { p.san = clamp(p.san - e.san, 0, 100); Floaters.add(p.cx(), p.y - 14, `-${e.san} RASS`, '#c77dff', 16); }
          }
        }
      }
      if (e.kind === 'rollingGurney') {
        e.g.x += e.g.vx * dt;
        e.g.vx -= 120 * dt;
        Particles.dust(e.g.x + 20, e.g.y + 50, 1);
      }
      if (e.t >= e.dur) this.effects.splice(i, 1);
    }
    Particles.update(dt); Floaters.update(dt);
    /* туман */
    for (const f of this.fog) {
      f.x += f.vx * dt;
      if (f.x - f.w / 2 > WORLD.w) f.x = -f.w / 2;
    }
    /* камера */
    const lookY = this.player.y - 40 * (1 - Math.abs(Input.mouse.sy / VH - 0.5) * 2) + clamp((Input.mouse.sy - VH / 2) * 0.25, -110, 110);
    Camera.update(dt, p.cx() + p.face * 55, lookY + p.h / 2);
    /* комната/этаж */
    const rm = this.roomAt(p.cx(), p.floor);
    if (rm && rm.i !== this.curRoom) {
      this.curRoom = rm.i;
      const first = !this.seenRooms[rm.i];
      this.seenRooms[rm.i] = true;
      if (first) {
        this.toast(`▚ ${rm.name}`, '');
        this.subtitle(rm.sub, 4);
        this.save(true);
        // навести жути: подходим к твари — она просыпается
        for (const g of this.ghosts) {
          if (g.floor === p.floor && Math.abs(g.cx() - p.cx()) < 500 && g.mode === 'patrol' && Math.random() < 0.4) g.alertT = 1.6;
        }
      }
    }
    /* скриптованные сцены */
    for (const s of SCARES) {
      if (s.used) continue;
      const srm = ROOMS.find(r => r.i === s.room);
      if (p.floor === srm.f && p.cx() > srm.x0 + 200 && p.cx() < srm.x1 - 100) this.runScare(s);
    }
    /* взаимодействие */
    this.interactTarget = this.findInteract();
    const pr = $('interact-prompt');
    if (this.interactTarget && !p.mini && !p.channel) {
      pr.innerHTML = `<b>${this.interactTarget.type === 'hide' ? 'F' : 'E'}</b>${this.interactTarget.label}`;
      pr.classList.remove('hidden');
      const wantHide = this.interactTarget.type === 'hide';
      if ((wantHide && Input.pressed['KeyF']) || (!wantHide && Input.useHit())) this.doInteract(this.interactTarget);
      if (wantHide && Input.useHit() && this.interactTarget.o.opened) { /* обыск важнее */ }
    } else pr.classList.add('hidden');
    /* шёпот безумия */
    if (p.san < 34 && !p.hidden) {
      this.whisperT -= dt;
      if (this.whisperT <= 0) {
        this.whisperT = rand(5, 11);
        AudioSys.whisper();
        this.subtitle('«' + WHISPERS[(Math.random() * WHISPERS.length) | 0] + '»', 3.5);
      }
    }
    /* галлюцинации */
    if (p.san < 22) {
      this.fakeT -= dt;
      if (this.fakeT <= 0) {
        this.fakeT = rand(6, 12);
        this.effects.push({ kind: 'fake', x: p.cx() + (Math.random() < 0.5 ? -1 : 1) * rand(200, 420), y: FLOORS[p.floor].y, t: 0, dur: 0.5 });
        AudioSys.sting();
      }
    }
    /* режиссёр */
    this.directorT -= dt;
    if (this.directorT <= 0) {
      this.directorT = rand(20, 34);
      const alive = this.ghosts.filter(g => !g.dead).length;
      const pressure = p.san < 55 || this.bossStarted || this.minibosses.some(m => m.awake && !m.dead);
      if (alive < 5 && pressure && !this.bossDead) {
        const side = Math.random() < 0.5 ? -1 : 1;
        const gx = clamp(p.cx() + side * rand(600, 780), 40, WORLD.w - 40);
        const rm2 = this.roomAt(gx, p.floor);
        const type = p.san < 25 && Math.random() < 0.35 ? 'double' : 'whisper';
        this.spawnGhost(type, gx, p.floor, rm2 ? [rm2.x0 + 20, rm2.x1 - 20] : [gx - 200, gx + 200]);
        AudioSys.whisper();
        if (p.san < 55) this.toast('👁 Тьма сгустилась… что-то подошло ближе', 'red');
      }
      /* авария света */
      if (Math.random() < 0.22 && this.blackout <= 0 && p.lampLit > 0.2) {
        this.blackout = rand(4, 8);
        AudioSys.sting();
        this.toast('⚡ Свет мигнул… и умер', 'red');
        this.player.san = clamp(this.player.san - 4, 0, 100);
      }
    }
    /* звук */
    const danger = this.boss && !this.boss.dead ? 1 : clamp(this.ghostPressure(p.cx(), p.cy()) * 0.7 + (p.san < 30 ? 0.25 : 0), 0, 1);
    AudioSys.update(dt, p.hp, p.san, danger);
    /* HUD */
    $('hp-fill').style.width = (p.hp / p.maxhp * 100) + '%';
    $('st-fill').style.width = p.st + '%';
    $('san-fill').style.width = p.san + '%';
    $('hp-num').textContent = Math.ceil(p.hp);
    if (p.cur === 'pistol') $('hand-ammo').textContent = p.reloadT > 0 ? '…перезарядка…' : `▮ ${p.mag} / ${p.reserve} [R]`;
    $('bat-fill').style.width = p.battery + '%';
    $('sanity-fx').style.opacity = p.san < 55 ? ((55 - p.san) / 55 * 0.85).toFixed(2) : 0;
    if (this.dmgFlash > 0) { this.dmgFlash -= dt * 2; $('damage-flash').style.opacity = clamp(this.dmgFlash, 0, 0.9); }
    else if (p.hp < 30) $('damage-flash').style.opacity = 0.2 + Math.sin(performance.now() / 300) * 0.12;
    else $('damage-flash').style.opacity = 0;
    this.drawPortrait();
  },

  /* ================= РЕНДЕР ================= */
  render() {
    const c = ctx, t = performance.now() / 1000, p = this.player;
    const bg = c.createLinearGradient(0, 0, 0, VH);
    bg.addColorStop(0, '#03060a'); bg.addColorStop(0.55, '#080f12'); bg.addColorStop(1, '#04070a');
    c.fillStyle = bg; c.fillRect(0, 0, VW, VH);

    c.save();
    Camera.apply(c);
    const vb = Camera.viewBounds(200);
    /* перекрытия этажей */
    for (const fi of [1, 2]) {
      const y = FLOORS[fi].y;
      if (y > vb.y1 || y + SLAB_H < vb.y0) continue;
      this.drawFloorSlab(c, fi, t);
    }
    /* комнаты видимых этажей */
    for (const rm of ROOMS) {
      const fy = FLOORS[rm.f].y;
      if (fy - 700 > vb.y1 || fy + 120 < vb.y0) continue;
      if (rm.x1 < vb.x0 || rm.x0 > vb.x1) continue;
      this.drawRoom(c, rm, t);
    }
    /* платформы */
    for (const pl of this.platforms) {
      if (pl.y > vb.y1 || pl.y < vb.y0 || pl.x + pl.w < vb.x0 || pl.x > vb.x1) continue;
      this.drawPlatform(c, pl);
    }
    /* мебель */
    for (const f of this.furniture) {
      if (f.y > vb.y1 || f.y + f.h < vb.y0 - 100 || f.x + f.w < vb.x0 || f.x > vb.x1) continue;
      f.anim = f.opened ? Math.min(1, f.anim + 0.06) : f.anim;
      f.draw(c, t);
    }
    for (const d of this.decor) {
      const fy = FLOORS[d.floor].y;
      if (fy > vb.y1 || fy + 120 < vb.y0 || d.x < vb.x0 || d.x > vb.x1) continue;
      this.drawDecor(c, d, t);
    }
    /* лифт, лестницы, вентиляция, щиток, двери */
    this.drawLadders(c, t);
    this.drawVents(c, t);
    this.drawFuseBox(c, t);
    for (const dr of this.doors) if (dr.f * 0 === 0) dr.draw(c);
    this.drawElevator(c, t);
    for (const g of this.gates) this.drawGate(c, g, t);
    /* подборы */
    for (const k of this.pickups) {
      if (k.taken || k.y > vb.y1 || k.y < vb.y0) continue;
      k.draw(c, t);
    }
    /* туман */
    for (const f of this.fog) {
      const fy = FLOORS[f.f].y;
      if (fy > vb.y1 || fy + 120 < vb.y0 || f.x + f.w < vb.x0 || f.x > vb.x1) continue;
      c.fillStyle = `rgba(130,150,155,${f.a})`;
      c.beginPath(); c.ellipse(f.x, fy - 40, f.w / 2, 36, 0, 0, 7); c.fill();
    }
    /* лампы */
    for (const l of this.lamps) {
      if (l.y > vb.y1 || l.y < vb.y0) continue;
      this.drawLamp(c, l, t);
    }
    /* сущности */
    for (const g of this.ghosts) {
      if (g.y > vb.y1 || g.y + g.h < vb.y0) continue;
      g.draw(c);
    }
    for (const m of this.minibosses) {
      if (m.y > vb.y1 || m.y + m.h < vb.y0) continue;
      m.draw(c);
    }
    if (this.boss) this.boss.draw(c);
    if (p && !p.hidden) p.draw(c);
    if (p && p.hidden) this.drawHiddenPlayer(c, t);
    for (const pr of this.projectiles) pr.draw(c);
    this.drawEffects(c);
    Particles.draw(c);
    /* подсказки шума */
    if (this.player && this.player.san < 60) {
      for (const n of this.noises) {
        c.save(); c.globalAlpha = (1 - n.t / 0.6) * 0.4;
        c.strokeStyle = '#8fd0ff'; c.lineWidth = 2;
        c.beginPath(); c.arc(n.x, n.y, 20 + n.t * 300, 0, 7); c.stroke();
        c.restore();
      }
    }
    c.restore();

    /* ---- СВЕТ/ТЬМА ---- */
    this.renderLighting(c, t);
    /* глитч */
    if (p && p.san < 25 && this.state === 'play') {
      const n = p.san < 12 ? 7 : 3;
      for (let i = 0; i < n; i++) {
        const sy = Math.random() * VH, sh = 6 + Math.random() * 26, dx = rand(-40, 40);
        try { c.drawImage(canvas, 0, sy, VW, sh, dx, sy, VW, sh); } catch (e) { /* ignore */ }
      }
      if (Math.random() < 0.02) { c.fillStyle = 'rgba(120,0,160,0.08)'; c.fillRect(0, 0, VW, VH); }
    }
    Floaters.draw(c);
    this.drawMiniGame(c);
    this.drawMinimap(c);
    if (this.interactTarget && this.interactTarget.type === 'ladderHint' && this.player && !this.player.mini) {
      c.save(); c.globalAlpha = 0.5 + Math.sin(t * 4) * 0.2;
      c.fillStyle = '#ffd166'; c.font = '700 15px Rubik,sans-serif'; c.textAlign = 'center';
      c.fillText('W / S — лезть', VW / 2, 92); c.restore();
    }
    if (this.state === 'play' && !this.paused && this.noteId === null && p && !p.dead && !p.mini) {
      drawCrosshair(c, Input.mouse.sx, Input.mouse.sy, p.cur, p.atkCd <= 0, p.channel ? 4 : 0);
    }
  },

  renderLighting(c, t) {
    const p = this.player;
    const sources = [];
    const sx = -Camera.x - Camera.sx, sy = -Camera.y - Camera.sy;
    for (const l of this.lamps) {
      if (l.level < 0.05) continue;
      if (l.y - Camera.y > VH + 100 || l.y - Camera.y < -300) continue;
      sources.push({ x: l.x + sx, y: l.y + 70 + sy, r: l.r * (0.6 + l.level * 0.4), flick: l.flick, a: 0.92, seed: l.seed });
    }
    for (const e of this.effects) {
      if (e.kind === 'ring') sources.push({ x: e.x + sx, y: e.y + sy, r: e.r + 60, a: 0.5 * (1 - e.t / e.dur), color: e.color });
      if (e.kind === 'musicBox') sources.push({ x: e.x + sx, y: e.y + sy, r: 200, a: 0.4, pulse: true });
      if (e.kind === 'mirror') sources.push({ x: e.x + sx, y: e.y + sy, r: 240, a: 0.45, pulse: true });
    }
    if (p && !p.dead && p.flashOn && p.battery > 0 && !p.hidden) {
      sources.push({
        cone: {
          x: p.handX + sx, y: p.handY + sy,
          ang: p.aim, spread: 0.46, len: 600 * (p.battery < 22 ? 0.7 + Math.sin(t * 18) * 0.12 : 1),
        }
      });
    }
    if (this.muzzleT > 0 && p) sources.push({ x: p.handX + sx, y: p.handY + sy, r: 340, a: 1 });
    if (this.fuse && this.fuse.flash > 0) sources.push({ x: FUSEBOX.x + sx, y: FLOORS[0].y - 120 + sy, r: 260, a: this.fuse.flash * 2 });
    for (const pr of this.projectiles) {
      if (pr.kind === 'wail') sources.push({ x: pr.x + sx, y: pr.y + sy, r: 96, a: 0.6 });
      if (pr.kind === 'scalpel') sources.push({ x: pr.x + sx, y: pr.y + sy, r: 60, a: 0.5 });
      if (pr.kind === 'bottle') sources.push({ x: pr.x + sx, y: pr.y + sy, r: 40, a: 0.3 });
    }
    for (const k of this.pickups) {
      if (k.taken) continue;
      const kx = k.x + sx, ky = k.y - 20 + sy;
      if (kx > -80 && kx < VW + 80) sources.push({ x: kx, y: ky, r: 74, a: 0.5 });
    }
    for (const m of this.minibosses) {
      if (m.dead) continue;
      sources.push({ x: m.cx() + sx, y: m.y + 30 + sy, r: 130, a: 0.5 });
    }
    if (this.boss && !this.boss.dead) sources.push({ x: this.boss.cx() + sx, y: this.boss.y + 20 + sy, r: 150, a: 0.55 });
    sources.push({ x: (p ? p.cx() : 0) + sx, y: (p ? p.cy() : 0) + sy, r: 66, a: 0.34 });
    const dark = this.blackout > 0 ? 0.985 : this.power ? 0.925 : 0.95;
    renderDarkness(sources, t, p ? p.san / 100 : 1, dark);
    c.drawImage(lightCanvas, 0, 0);
    /* тёплый оттенок фонаря */
    if (p && !p.dead && p.flashOn && p.battery > 0 && !p.hidden) {
      const hx = p.handX + sx, hy = p.handY + sy;
      c.save(); c.globalCompositeOperation = 'soft-light';
      const g2 = c.createRadialGradient(hx, hy, 10, hx, hy, 460);
      g2.addColorStop(0, 'rgba(255,230,170,0.4)'); g2.addColorStop(1, 'rgba(255,230,170,0)');
      c.fillStyle = g2;
      c.beginPath(); c.moveTo(hx, hy); c.arc(hx, hy, 460, p.aim - 0.26, p.aim + 0.26); c.closePath(); c.fill();
      c.restore();
    }
    /* вспышка молнии */
    this.boltT -= 0.016;
    if (this.boltT <= 0) { this.boltT = rand(8, 18); this.bolt = 0.2; if (Math.random() < 0.5) AudioSys.thunder(); }
    if (this.bolt > 0) { this.bolt -= 0.016; c.fillStyle = `rgba(200,220,255,${(this.bolt * 1.4).toFixed(3)})`; c.fillRect(0, 0, VW, VH); }
  },

  /* ---------- рисование мира ---------- */
  drawFloorSlab(c, fi, t) {
    const y = FLOORS[fi].y, h = SLAB_H;
    const vb = Camera.viewBounds(200);
    c.fillStyle = '#0d1113';
    c.fillRect(vb.x0 - 10, y + 8, vb.x1 - vb.x0 + 20, h - 8);
    c.fillStyle = 'rgba(255,255,255,0.05)';
    c.fillRect(vb.x0 - 10, y + 8, vb.x1 - vb.x0 + 20, 3);
    /* рёбра балок */
    c.fillStyle = '#161c1f';
    const startX = Math.floor((vb.x0 - 10) / 120) * 120;
    for (let x = startX; x < vb.x1 + 10; x += 120) c.fillRect(x, y + 12, 10, h - 12);
    /* капает вода из перекрытия */
    for (let i = 0; i < 6; i++) {
      const dx = startX + i * 420 + ((t * 30) % 200);
      if (dx < vb.x0 || dx > vb.x1) continue;
      const dy = ((t * 220 + i * 90) % 160);
      c.fillStyle = 'rgba(150,200,220,0.5)';
      c.fillRect(dx, y + h + dy, 2.5, 7);
    }
  },
  drawRoom(c, rm, t) {
    const { x0, x1, wall, floor } = rm;
    const W = x1 - x0, fy = FLOORS[rm.f].y;
    const top = fy - 620;
    c.fillStyle = wall; c.fillRect(x0, top, W, fy - top);
    /* кафель */
    c.strokeStyle = 'rgba(255,255,255,0.045)'; c.lineWidth = 1;
    c.beginPath();
    for (let y = top + 40; y < fy; y += 44) { c.moveTo(x0, y); c.lineTo(x1, y); }
    for (let x = x0; x < x1; x += 62) { c.moveTo(x, top + 40); c.lineTo(x, fy); }
    c.stroke();
    /* полоса */
    const bandY = fy - 340;
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x0, bandY, W, 26);
    c.fillStyle = 'rgba(163,22,33,0.3)'; c.fillRect(x0, bandY, W, 5);
    /* пол */
    c.fillStyle = floor; c.fillRect(x0, fy, W, 16);
    c.fillStyle = 'rgba(255,255,255,0.06)'; c.fillRect(x0, fy, W, 3);
    /* табличка комнаты */
    const mx = (x0 + x1) / 2;
    const signY = fy - 590;
    c.fillStyle = '#0d1113'; c.fillRect(mx - 140, signY, 280, 34);
    c.strokeStyle = '#2c3537'; c.lineWidth = 2; c.strokeRect(mx - 140, signY, 280, 34);
    c.fillStyle = 'rgba(232,220,200,0.85)';
    c.font = '700 18px Rubik,sans-serif'; c.textAlign = 'center';
    c.fillText(rm.name, mx, signY + 23);
    c.textAlign = 'left';
    /* окна с решётками */
    const rw = mulberry32(rm.i * 331 + 21);
    const nw = W > 700 ? 2 : 1;
    for (let i = 0; i < nw; i++) {
      const wx0 = x0 + (W / (nw + 1)) * (i + 1) - 62 + (rw() - 0.5) * 40;
      this.drawWallWindow(c, wx0, fy - 560, t, rm.i * 10 + i);
    }
    /* полосы на полу (мокрые следы) */
    const r2 = mulberry32(rm.i * 991 + 7);
    c.fillStyle = 'rgba(110,10,18,0.45)';
    for (let i = 0; i < 3; i++) c.beginPath(), c.ellipse(x0 + r2() * W, fy + 4, 14 + r2() * 26, 3 + r2() * 3, 0, 0, 7), c.fill();
    if (rm.style === 'morgue') this.drawMorgueWall(c, rm, t);
    if (rm.style === 'children') this.drawKidsWall(c, rm, t);
    if (rm.style === 'office') this.drawOfficeWall(c, rm, t);
    if (rm.style === 'hall_silence') this.drawMirrorHall(c, rm, t);
    if (rm.style === 'xray') this.drawXrayWall(c, rm, t);
    if (rm.style === 'attic') this.drawAtticWall(c, rm, t);
    if (rm.style === 'laundry') this.drawLaundryPipes(c, rm, t);
    if (rm.style === 'seclusion') this.drawPaddedWall(c, rm, t);
    /* арка */
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(x0 - 6, top, 12, fy - top);
    c.fillStyle = '#2c3537'; c.fillRect(x0 - 8, top, 5, fy - top);
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
    c.fillStyle = '#2b3236'; c.fillRect(x - 10, y + h + 6, w + 20, 10);
  },
  drawMorgueWall(c, rm, t) {
    const x1 = rm.x1, fy = FLOORS[rm.f].y;
    c.fillStyle = '#2b3138';
    c.fillRect(x1 - 300, fy - 500, 290, 240);
    for (let rr = 0; rr < 4; rr++) for (let cc = 0; cc < 4; cc++) {
      const dx = x1 - 290 + cc * 70, dy = fy - 490 + rr * 58;
      const isOpen = rr === 1 && cc === 2;
      c.fillStyle = isOpen ? '#04060a' : '#3d454e';
      c.fillRect(dx, dy, 62, 48);
      c.fillStyle = '#171c21'; c.fillRect(dx + 22, dy + 20, 18, 6);
      if (isOpen) {
        c.fillStyle = `rgba(150,200,220,${0.1 + Math.sin(t * 2) * 0.05})`;
        c.fillRect(dx - 12, dy + 48, 86, 70);
      }
    }
    c.fillStyle = '#a31621'; c.font = '800 15px sans-serif'; c.textAlign = 'center';
    c.fillText('ХОЛОДИЛЬНИК №3 — НЕ ОТКРЫВАТЬ', x1 - 155, fy - 510);
    c.textAlign = 'left';
  },
  drawKidsWall(c, rm, t) {
    const fy = FLOORS[rm.f].y, r = mulberry32(rm.i * 17);
    for (let i = 0; i < 5; i++) {
      const x = rm.x0 + 80 + i * 130 + r() * 20, y = fy - 440 + r() * 40;
      c.fillStyle = 'rgba(240,240,230,0.85)'; c.fillRect(x, y, 96, 74);
      c.strokeStyle = '#c9c9c0'; c.lineWidth = 2; c.strokeRect(x, y, 96, 74);
      // детский рисунок: человечек в белом
      c.strokeStyle = ['#3a5a8c', '#8c3a3a', '#3a8c5a'][(r() * 3) | 0]; c.lineWidth = 2;
      c.beginPath();
      c.moveTo(x + 48, y + 20); c.lineTo(x + 48, y + 48);
      c.moveTo(x + 38, y + 30); c.lineTo(x + 58, y + 30);
      c.moveTo(x + 48, y + 48); c.lineTo(x + 40, y + 64);
      c.moveTo(x + 48, y + 48); c.lineTo(x + 56, y + 64);
      c.stroke();
      c.beginPath(); c.arc(x + 48, y + 14, 8, 0, 7); c.stroke();
      c.fillStyle = 'rgba(60,60,60,0.85)'; c.font = '700 9px sans-serif';
      c.fillText(['ДЯДЯ ТИШИНА', 'МАМА', 'ТИШИНА', 'ДОКТОР', 'ДОМ'][(r() * 5) | 0], x + 8, y + 70);
      if (Math.sin(t * 0.7 + i) > 0.95) {
        c.fillStyle = 'rgba(0,0,0,0.85)';
        c.beginPath(); c.arc(x + 48, y + 14, 8, 0, 7); c.fill();
      }
    }
    // шкатулка на полу
    c.fillStyle = '#6a4a2a'; c.fillRect(rm.x0 + 620, FLOORS[rm.f].y - 26, 46, 26);
    c.fillStyle = '#8a6a3a'; c.fillRect(rm.x0 + 620, FLOORS[rm.f].y - 34, 46, 10);
    c.fillStyle = '#d1a24a'; c.beginPath(); c.arc(rm.x0 + 643, FLOORS[rm.f].y - 12, 4, 0, 7); c.fill();
  },
  drawOfficeWall(c, rm, t) {
    const fy = FLOORS[rm.f].y;
    for (let i = 0; i < 3; i++) {
      const gx = rm.x0 + 120 + i * 150;
      c.fillStyle = '#3a2f1c'; c.fillRect(gx, fy - 480, 110, 90);
      c.fillStyle = '#d9c9a8'; c.fillRect(gx + 6, fy - 474, 98, 78);
      c.fillStyle = '#333'; c.font = '700 10px sans-serif'; c.textAlign = 'center';
      c.fillText('ЛУЧШИЙ ВРАЧ', gx + 55, fy - 450); c.fillText('ГОДА', gx + 55, fy - 436);
      c.fillStyle = '#a31621'; c.font = '800 13px sans-serif';
      c.fillText('Т А М И К', gx + 55, fy - 414);
      c.strokeStyle = 'rgba(150,10,20,0.8)'; c.lineWidth = 4;
      c.beginPath(); c.moveTo(gx + 8, fy - 472); c.lineTo(gx + 102, fy - 398); c.stroke();
      c.textAlign = 'left';
    }
    // дипломы в рамках на стене
    for (let i = 0; i < 2; i++) {
      const x = rm.x0 + 700 + i * 200;
      c.fillStyle = '#2a2118'; c.fillRect(x, fy - 470, 130, 100);
      c.fillStyle = '#cfc4a8'; c.fillRect(x + 6, fy - 464, 118, 88);
      c.fillStyle = '#4a3a2a'; c.font = 'italic 9px serif';
      c.fillText('«Тишина — высшая форма', x + 14, fy - 430);
      c.fillText('заботы о пациенте»', x + 14, fy - 418);
      c.fillStyle = '#a31621'; c.font = '700 11px serif';
      c.fillText('ТАМИК Т.Т.', x + 14, fy - 392);
    }
  },
  drawMirrorHall(c, rm, t) {
    const fy = FLOORS[rm.f].y;
    for (let i = 0; i < 4; i++) {
      const x = rm.x0 + 160 + i * 340;
      c.fillStyle = '#1a1418'; c.fillRect(x, fy - 520, 130, 300);
      const mg = c.createLinearGradient(x, fy - 520, x + 130, fy - 220);
      mg.addColorStop(0, '#2a3038'); mg.addColorStop(0.5, '#3a4450'); mg.addColorStop(1, '#20262c');
      c.fillStyle = mg; c.fillRect(x + 5, fy - 515, 120, 290);
      c.strokeStyle = 'rgba(255,255,255,0.12)'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(x + 20, fy - 500); c.lineTo(x + 110, fy - 260); c.stroke();
      // отражение — силуэт, который не повторяет игрока
      const p = this.player;
      if (p && p.floor === rm.f) {
        const distToMirror = Math.abs(p.cx() - (x + 65));
        if (distToMirror < 420) {
          const k = 1 - distToMirror / 420;
          c.save(); c.globalAlpha = 0.35 * k;
          c.fillStyle = '#000';
          c.beginPath(); c.ellipse(x + 65, fy - 330, 15, 22, 0, 0, 7); c.fill();
          c.beginPath(); c.ellipse(x + 65, fy - 272, 22, 46, 0, 0, 7); c.fill();
          c.fillStyle = '#fff';
          const blink = Math.sin(t * 1.7) > 0.9 ? 0 : 5;
          c.fillRect(x + 58, fy - 336, 5, 5 - blink * 0.5); c.fillRect(x + 68, fy - 336, 5, 5 - blink * 0.5);
          c.restore();
        }
      }
      c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(x + 5, fy - 515, 120, 5);
    }
    // стулья по кругу
    for (let i = 0; i < 8; i++) {
      const x = rm.x0 + 120 + i * 180;
      c.fillStyle = '#3a3a42'; c.fillRect(x, fy - 40, 34, 8);
      c.fillRect(x + 4, fy - 32, 6, 32); c.fillRect(x + 24, fy - 32, 6, 32);
      c.fillRect(x, fy - 78, 6, 40);
    }
  },
  drawXrayWall(c, rm, t) {
    const fy = FLOORS[rm.f].y;
    for (let i = 0; i < 4; i++) {
      const x = rm.x0 + 120 + i * 320, y = fy - 470;
      c.fillStyle = '#0a0d10'; c.fillRect(x, y, 120, 170);
      c.fillStyle = 'rgba(120,160,180,0.35)'; c.fillRect(x + 6, y + 6, 108, 158);
      // скелет
      c.strokeStyle = 'rgba(230,240,245,0.8)'; c.lineWidth = 3;
      c.beginPath();
      c.moveTo(x + 60, y + 30); c.lineTo(x + 60, y + 110);
      c.moveTo(x + 30, y + 60); c.lineTo(x + 90, y + 60);
      c.moveTo(x + 60, y + 110); c.lineTo(x + 44, y + 158);
      c.moveTo(x + 60, y + 110); c.lineTo(x + 76, y + 158);
      c.stroke();
      c.beginPath(); c.arc(x + 60, y + 22, 14, 0, 7); c.stroke();
      // второй силуэт внутри при низком рассудке
      const p = this.player;
      if (p && p.san < 60) {
        c.save(); c.globalAlpha = (60 - p.san) / 60 * 0.75 * (0.7 + Math.sin(t * 3 + i) * 0.3);
        c.fillStyle = '#000';
        c.beginPath(); c.ellipse(x + 60, y + 22, 13, 15, 0, 0, 7); c.fill();
        c.fillRect(x + 48, y + 40, 24, 60);
        c.fillStyle = '#fff';
        c.fillRect(x + 54, y + 18, 5, 4); c.fillRect(x + 63, y + 18, 5, 4);
        c.restore();
      }
    }
  },
  drawAtticWall(c, rm, t) {
    const fy = FLOORS[rm.f].y;
    // балки
    c.fillStyle = '#2a2118';
    c.fillRect(rm.x0, fy - 560, rm.x1 - rm.x0, 22);
    for (let i = 0; i < 6; i++) {
      const x = rm.x0 + 40 + i * 70;
      c.save(); c.translate(x, fy - 560); c.rotate(0.18);
      c.fillRect(0, 0, 20, 200); c.restore();
    }
    // коробки и куклы
    const r = mulberry32(rm.i * 44);
    for (let i = 0; i < 7; i++) {
      const x = rm.x0 + 60 + i * 55, h = 30 + r() * 40;
      c.fillStyle = '#4a3a28'; c.fillRect(x, fy - h, 44, h);
      c.fillStyle = 'rgba(220,200,160,0.25)'; c.fillRect(x, fy - h, 44, 4);
    }
    // висящие куклы
    for (let i = 0; i < 3; i++) {
      const x = rm.x0 + 200 + i * 90, sw = Math.sin(t * 1.2 + i) * 6;
      c.strokeStyle = 'rgba(200,200,200,0.4)'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(x, fy - 540); c.lineTo(x + sw, fy - 470); c.stroke();
      c.fillStyle = '#8a7a6a';
      c.beginPath(); c.arc(x + sw, fy - 462, 8, 0, 7); c.fill();
      c.fillRect(x + sw - 6, fy - 454, 12, 22);
      c.fillStyle = '#000';
      c.beginPath(); c.arc(x + sw - 3, fy - 464, 1.6, 0, 7); c.arc(x + sw + 3, fy - 464, 1.6, 0, 7); c.fill();
    }
  },
  drawLaundryPipes(c, rm, t) {
    const fy = FLOORS[rm.f].y;
    c.strokeStyle = '#2b3236'; c.lineWidth = 12;
    c.beginPath(); c.moveTo(rm.x0, fy - 540); c.lineTo(rm.x1, fy - 540); c.stroke();
    c.strokeStyle = '#1f2528'; c.lineWidth = 8;
    c.beginPath(); c.moveTo(rm.x0, fy - 500); c.lineTo(rm.x1, fy - 500); c.stroke();
    for (let i = 0; i < 5; i++) {
      const x = rm.x0 + 80 + i * 90;
      c.fillStyle = '#3a3f45'; c.fillRect(x, fy - 556, 14, 62);
      if (Math.random() < 0.02) Particles.drip(x, fy - 490);
    }
    // пар
    c.fillStyle = `rgba(200,210,215,${0.05 + Math.sin(t) * 0.02})`;
    c.beginPath(); c.ellipse(rm.x0 + 300, fy - 120, 200, 70, 0, 0, 7); c.fill();
  },
  drawPaddedWall(c, rm, t) {
    const fy = FLOORS[rm.f].y;
    for (let i = 0; i < 10; i++) for (let j = 0; j < 4; j++) {
      const x = rm.x0 + 60 + i * 84, y = fy - 540 + j * 110;
      if (x > rm.x1 - 60) continue;
      c.fillStyle = j % 2 ? '#2a2326' : '#241f22';
      roundRect(c, x, y, 78, 104, 16); c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 3; c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.03)'; roundRect(c, x + 8, y + 8, 62, 40, 12); c.fill();
    }
    // вспученная стена
    for (const e of this.effects) {
      if (e.kind !== 'bulge') continue;
      const k = Math.sin(e.t / e.dur * Math.PI);
      c.fillStyle = 'rgba(60,50,55,0.9)';
      c.beginPath(); c.ellipse(e.x, e.y, 40 + k * 40, 60 + k * 50, 0, 0, 7); c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 4; c.stroke();
    }
    for (const e of this.effects) {
      if (e.kind !== 'handprint') continue;
      const k = clamp(e.t / 1.5, 0, 1);
      c.save(); c.globalAlpha = k * 0.85;
      c.fillStyle = '#8a1018';
      c.beginPath(); c.ellipse(e.x, e.y, 22, 26, 0.2, 0, 7); c.fill();
      for (let f = 0; f < 4; f++) {
        c.save(); c.translate(e.x - 16 + f * 11, e.y - 26);
        c.rotate(-0.3 + f * 0.16); c.fillRect(0, -22, 8, 24); c.restore();
      }
      c.restore();
    }
  },
  drawDecor(c, d, t) {
    const fy = FLOORS[d.floor].y, x = d.x;
    switch (d.kind) {
      case 0: { // постер
        const pw = 74, ph = 100, py = fy - 420;
        c.fillStyle = '#1a1a1a'; c.fillRect(x, py, pw, ph);
        c.fillStyle = ['#b8c4c4', '#c4b8a8', '#a8bcc4'][(d.seed | 0) % 3];
        c.fillRect(x + 3, py + 3, pw - 6, ph - 6);
        c.fillStyle = '#222'; c.font = '800 11px sans-serif'; c.textAlign = 'center';
        const texts = [['ТИШИНА —', 'ЗАЛОГ', 'ЗДОРОВЬЯ'], ['МОЙТЕ', 'РУКИ', '☠'], ['НЕ', 'ВСПОМИНАТЬ', '!'], ['03:33', 'НЕ', 'ПРОСЫПАТЬСЯ']];
        const tx = texts[(d.seed | 0) % texts.length];
        tx.forEach((s, i) => c.fillText(s, x + pw / 2, py + 34 + i * 20));
        c.textAlign = 'left';
        break;
      }
      case 1: { // инвалидное кресло
        c.strokeStyle = '#4a5055'; c.lineWidth = 4;
        c.beginPath(); c.arc(x, fy - 26, 22, 0, 7); c.stroke();
        c.beginPath(); c.arc(x + 44, fy - 12, 10, 0, 7); c.stroke();
        c.strokeStyle = '#2c3136'; c.lineWidth = 6;
        c.beginPath(); c.moveTo(x, fy - 26); c.lineTo(x + 20, fy - 60); c.lineTo(x + 52, fy - 60); c.stroke();
        c.fillStyle = '#1e2a30'; c.fillRect(x + 12, fy - 66, 44, 10);
        c.fillRect(x + 50, fy - 100, 10, 40);
        break;
      }
      case 2: { // капельница
        c.strokeStyle = '#5a6066'; c.lineWidth = 3;
        c.beginPath(); c.moveTo(x, fy); c.lineTo(x, fy - 150); c.moveTo(x - 20, fy - 150); c.lineTo(x + 20, fy - 150); c.stroke();
        c.fillStyle = 'rgba(200,230,255,0.4)'; c.fillRect(x - 28, fy - 148, 14, 26);
        c.fillStyle = 'rgba(140,15,25,0.7)'; c.fillRect(x + 14, fy - 148, 14, 26);
        c.strokeStyle = 'rgba(200,200,200,0.4)'; c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(x + 21, fy - 122); c.quadraticCurveTo(x + 30, fy - 80, x + 10, fy - 40 + Math.sin(t * 2 + d.seed) * 6); c.stroke();
        if (Math.random() < 0.01) Particles.drip(x + 21, fy - 120, 'rgba(150,30,40,0.6)');
        break;
      }
      case 3: { // лужа + осколки
        c.fillStyle = 'rgba(90,140,150,0.25)';
        c.beginPath(); c.ellipse(x, fy + 10, 46, 7, 0, 0, 7); c.fill();
        c.fillStyle = 'rgba(180,220,230,0.5)';
        const r = mulberry32((d.seed * 100) | 0);
        for (let i = 0; i < 5; i++) c.fillRect(x - 36 + r() * 72, fy + 6 + r() * 8, 4, 3);
        break;
      }
      case 4: { // бумаги
        const r = mulberry32((d.seed * 50) | 0);
        for (let i = 0; i < 4; i++) {
          c.save(); c.translate(x - 30 + r() * 60, fy + 4 + r() * 10); c.rotate(r() * 3);
          c.fillStyle = 'rgba(200,190,165,0.7)'; c.fillRect(-9, -12, 18, 24);
          c.fillStyle = 'rgba(30,30,30,0.5)';
          for (let j = 0; j < 3; j++) c.fillRect(-6, -8 + j * 7, 12, 2);
          c.restore();
        }
        break;
      }
      case 5: { // кровавые ладони
        c.fillStyle = 'rgba(120,12,20,0.5)';
        for (let i = 0; i < 4; i++) {
          const hy = fy - 260 - i * 26, hx = x + i * 14;
          c.beginPath(); c.ellipse(hx, hy, 9, 11, 0.2, 0, 7); c.fill();
          for (let f = 0; f < 4; f++) c.fillRect(hx - 8 + f * 5, hy - 20, 3, 10);
        }
        break;
      }
      case 6: { // декор-каталка
        c.fillStyle = '#2a2e33'; c.fillRect(x, fy - 46, 90, 8);
        c.fillStyle = 'rgba(190,185,170,0.9)';
        c.beginPath(); c.ellipse(x + 45, fy - 52, 44, 10, 0, 0, 7); c.fill();
        c.strokeStyle = '#4a5055'; c.lineWidth = 3;
        c.beginPath(); c.moveTo(x + 10, fy - 38); c.lineTo(x + 10, fy); c.moveTo(x + 80, fy - 38); c.lineTo(x + 80, fy); c.stroke();
        break;
      }
      default: { // табличка ВЫХОД
        c.fillStyle = Math.sin(t * 5 + d.seed) > -0.2 ? '#0d3a12' : '#04140a';
        c.fillRect(x, fy - 500, 92, 28);
        c.fillStyle = Math.sin(t * 5 + d.seed) > -0.2 ? '#4dff6a' : '#123a1a';
        c.font = '800 17px sans-serif'; c.textAlign = 'center';
        c.fillText('ВЫХОД →', x + 46, fy - 479);
        c.textAlign = 'left';
      }
    }
  },
  drawPlatform(c, pl) {
    if (pl.t === 'solid') {
      const isFridge = pl.floor === 0 && pl.x > 2900 && pl.x < 4100;
      c.fillStyle = isFridge ? '#39424b' : '#4a3f2c';
      c.fillRect(pl.x, pl.y, pl.w, pl.h);
      c.fillStyle = isFridge ? '#2c333b' : '#3a3222';
      c.fillRect(pl.x + 4, pl.y + 4, pl.w - 8, pl.h - 8);
      c.fillStyle = 'rgba(255,255,255,0.06)'; c.fillRect(pl.x + 4, pl.y + 4, pl.w - 8, 3);
      if (isFridge) {
        c.fillStyle = '#a31621'; c.font = '800 11px sans-serif'; c.textAlign = 'center';
        c.fillText('МОРГ', pl.x + pl.w / 2, pl.y + 24); c.textAlign = 'left';
      }
    } else {
      const isPipe = pl.w > 170;
      if (isPipe) {
        c.fillStyle = '#2b3236'; c.fillRect(pl.x, pl.y, pl.w, pl.h);
        c.fillStyle = 'rgba(255,255,255,0.1)'; c.fillRect(pl.x, pl.y, pl.w, 3);
        c.fillStyle = '#14191c';
        for (let x = pl.x + 30; x < pl.x + pl.w; x += 60) c.fillRect(x, pl.y - 2, 8, pl.h + 4);
      } else {
        c.fillStyle = '#4a3b28'; c.fillRect(pl.x, pl.y, pl.w, pl.h);
        c.fillStyle = '#5f4f36'; c.fillRect(pl.x, pl.y, pl.w, 4);
        c.fillStyle = '#22262b';
        c.fillRect(pl.x + 8, pl.y + pl.h, 6, 22); c.fillRect(pl.x + pl.w - 14, pl.y + pl.h, 6, 22);
      }
    }
  },
  drawLamp(c, l, t) {
    const x = l.x, y = l.y;
    c.fillStyle = '#14191c'; c.fillRect(x - 3, y - 60, 6, 60);
    c.fillStyle = '#232a2e'; c.fillRect(x - 46, y - 8, 92, 16);
    const on = l.level > 0.1;
    if (on) {
      c.save(); c.globalAlpha = clamp(0.75 + l.level * 0.25, 0, 1);
      c.shadowBlur = 30; c.shadowColor = '#ffe9b0';
      c.fillStyle = '#fff3d0'; c.fillRect(x - 38, y - 4, 76, 8);
      c.restore();
      if (l.flick > 0.3 && Math.random() < 0.03) Particles.spark(x + rand(-30, 30), y, 1, '#ffe9b0');
    } else {
      c.fillStyle = '#3a3f45'; c.fillRect(x - 38, y - 4, 76, 8);
      c.strokeStyle = '#222'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(x - 20, y - 4); c.lineTo(x - 10, y + 4); c.moveTo(x + 14, y - 4); c.lineTo(x + 6, y + 4); c.stroke();
    }
    if (on && l.level > 0.7) {
      c.fillStyle = 'rgba(220,210,180,0.8)';
      for (let i = 0; i < 3; i++) {
        const mx = x + Math.sin(t * (5 + i * 2) + i * 9) * 34;
        const my = y + 10 + Math.cos(t * (7 + i * 3) + i * 5) * 16;
        c.fillRect(mx, my, 2.5, 2.5);
      }
    }
  },
  drawLadders(c, t) {
    for (const L of LADDERS) {
      const x = L.x, w = L.w, y0 = L.yTop, y1 = L.yBot;
      c.fillStyle = '#1a2226'; c.fillRect(x - 4, y0, w + 8, y1 - y0);
      c.fillStyle = '#0a0e10'; c.fillRect(x, y0, w, y1 - y0);
      c.strokeStyle = '#6a7378'; c.lineWidth = 5;
      c.beginPath(); c.moveTo(x + 8, y0); c.lineTo(x + 8, y1); c.moveTo(x + w - 8, y0); c.lineTo(x + w - 8, y1); c.stroke();
      c.lineWidth = 4;
      for (let y = y0 + 28; y < y1; y += 34) { c.beginPath(); c.moveTo(x + 6, y); c.lineTo(x + w - 6, y); c.stroke(); }
      c.fillStyle = 'rgba(255,255,255,0.06)'; c.fillRect(x + 4, y0, 6, y1 - y0);
      c.fillStyle = '#232a2e'; c.fillRect(x - 8, y0 - 8, w + 16, 12);
    }
  },
  drawVents(c, t) {
    for (const v of VENTS) {
      for (const side of ['a', 'b']) {
        const pt = v[side], fy = FLOORS[pt.f].y;
        const open = this.ventOpen[v.id];
        const y = fy - 300;
        c.fillStyle = '#0a0d0f'; c.fillRect(pt.x - 40, y, 80, 54);
        if (!open) {
          c.fillStyle = '#4a5257'; c.fillRect(pt.x - 38, y + 2, 76, 50);
          c.strokeStyle = '#2a3236'; c.lineWidth = 3;
          for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(pt.x - 34, y + 8 + i * 8); c.lineTo(pt.x + 34, y + 8 + i * 8); c.stroke(); }
          c.fillStyle = '#8a8f96'; c.beginPath(); c.arc(pt.x, y + 27, 4, 0, 7); c.fill();
        } else {
          // решётка снята и лежит рядом
          c.save(); c.translate(pt.x + 52, y + 52); c.rotate(1.35);
          c.fillStyle = '#3a4247'; c.fillRect(-38, -25, 76, 50);
          c.strokeStyle = '#232a2e'; c.lineWidth = 3;
          for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(-34, -20 + i * 8); c.lineTo(34, -20 + i * 8); c.stroke(); }
          c.restore();
          c.fillStyle = '#05080a'; c.fillRect(pt.x - 38, y + 2, 76, 50);
          c.fillStyle = `rgba(120,160,180,${0.06 + Math.sin(t * 1.6 + pt.x) * 0.03})`;
          c.fillRect(pt.x - 34, y + 10, 68, 42);
        }
      }
    }
  },
  drawFuseBox(c, t) {
    const fy = FLOORS[FUSEBOX.floor].y, x = FUSEBOX.x, y = fy - 170;
    c.fillStyle = '#2a3236'; c.fillRect(x - 60, y, 120, 120);
    c.strokeStyle = '#1a2124'; c.lineWidth = 4; c.strokeRect(x - 60, y, 120, 120);
    if (!this.fuse.active && !this.fuse.solved) {
      c.fillStyle = '#3a4247'; c.fillRect(x - 54, y + 6, 108, 108);
      c.fillStyle = '#ffd166'; c.font = '18px sans-serif'; c.textAlign = 'center';
      c.fillText('⚡', x, y + 66); c.textAlign = 'left';
      c.fillStyle = '#8a8f96'; c.fillRect(x - 6, y + 50, 12, 26);
    } else {
      c.fillStyle = '#0d1114'; c.fillRect(x - 54, y + 6, 108, 108);
      for (let i = 0; i < 5; i++) {
        const sx = x - 44 + (i % 3) * 34, sy = y + 20 + ((i / 3) | 0) * 44;
        const on = this.fuse.switches[i];
        c.fillStyle = '#1a2124'; c.fillRect(sx - 10, sy - 14, 26, 36);
        c.fillStyle = on ? '#4dff6a' : '#5c2020';
        c.fillRect(sx - 6, sy - 10, 18, 12);
        c.fillStyle = '#8a8f96'; c.fillRect(sx - 2, sy + 2, 10, 16);
        c.fillStyle = on ? '#adffb0' : '#ff9a9a'; c.font = '700 11px monospace';
        c.fillText(String(i + 1), sx - 4, sy - 18);
        if (on) { c.save(); c.globalAlpha = 0.4 + Math.sin(t * 4 + i) * 0.2; c.fillStyle = '#4dff6a'; c.fillRect(sx - 6, sy - 10, 18, 12); c.restore(); }
      }
      c.fillStyle = '#ffd166'; c.font = '700 11px Rubik,sans-serif';
      c.fillText(this.fuse.solved ? 'ПИТАНИЕ: OK' : 'ПОРЯДОК: 3-1-4', x - 46, y + 112);
    }
    if (this.fuse.flash > 0) { c.fillStyle = `rgba(255,230,100,${this.fuse.flash})`; c.fillRect(x - 70, y - 10, 140, 140); }
  },
  drawElevator(c, t) {
    const e = this.elevator, car = e.car;
    /* шахта */
    c.fillStyle = '#070a0c';
    c.fillRect(e.shaftX, FLOORS[2].y - 620, e.shaftW, FLOORS[0].y - (FLOORS[2].y - 620));
    c.strokeStyle = '#1d2428'; c.lineWidth = 3;
    for (let y = FLOORS[2].y - 600; y < FLOORS[0].y; y += 40) {
      c.beginPath(); c.moveTo(e.shaftX + 6, y); c.lineTo(e.shaftX + 6, y + 20); c.stroke();
      c.beginPath(); c.moveTo(e.shaftX + e.shaftW - 6, y); c.lineTo(e.shaftX + e.shaftW - 6, y + 20); c.stroke();
    }
    /* двери на каждом этаже */
    for (const st of e.stations) {
      const y = st.y;
      c.fillStyle = '#232a2e';
      c.fillRect(e.shaftX - 10, y - 150, e.shaftW + 20, 150);
      c.fillStyle = '#3a4247';
      c.fillRect(e.shaftX, y - 138, e.shaftW / 2 - 4, 138);
      c.fillRect(e.shaftX + e.shaftW / 2 + 4, y - 138, e.shaftW / 2 - 4, 138);
      c.fillStyle = '#0d1114'; c.fillRect(e.shaftX + e.shaftW / 2 - 2, y - 138, 4, 138);
      // панель
      c.fillStyle = '#1a2124'; c.fillRect(e.shaftX + e.shaftW + 12, y - 110, 26, 60);
      for (let i = 0; i < 3; i++) {
        const on = e.at === i && Math.abs(car.y - e.stations[i].y) < 4;
        c.fillStyle = on ? '#ffd166' : '#4a5257';
        c.beginPath(); c.arc(e.shaftX + e.shaftW + 25, y - 98 + i * 20, 6, 0, 7); c.fill();
      }
      c.fillStyle = this.power ? '#4dff6a' : '#5c2020';
      c.fillRect(e.shaftX + e.shaftW + 16, y - 146, 18, 5);
    }
    /* кабина */
    c.fillStyle = '#39424b'; c.fillRect(car.x, car.y, car.w, car.h);
    c.fillStyle = '#5a646b'; c.fillRect(car.x + 3, car.y - 2, car.w - 6, 6);
    c.fillStyle = '#20262b'; c.fillRect(car.x, car.y + car.h - 6, car.w, 6);
    /* тросы */
    c.strokeStyle = '#4a5257'; c.lineWidth = 3;
    c.beginPath();
    c.moveTo(car.x + 20, FLOORS[2].y - 620); c.lineTo(car.x + 20, car.y);
    c.moveTo(car.x + car.w - 20, FLOORS[2].y - 620); c.lineTo(car.x + car.w - 20, car.y);
    c.stroke();
    /* лампа кабины */
    const flick = this.power ? 0.8 + Math.sin(t * 20) * 0.2 : 0.25;
    c.save(); c.globalAlpha = flick;
    c.fillStyle = '#fff3d0'; c.fillRect(car.x + car.w / 2 - 20, car.y + 2, 40, 4);
    c.restore();
  },
  drawGate(c, g, t) {
    c.fillStyle = '#2a1416';
    c.fillRect(g.x, g.y, g.w, g.h);
    c.strokeStyle = '#ff5c6c'; c.lineWidth = 3;
    c.globalAlpha = 0.5 + Math.sin(t * 3) * 0.3;
    for (let y = g.y; y < g.y + g.h; y += 60) {
      c.beginPath(); c.moveTo(g.x, y); c.lineTo(g.x + g.w, y + 30); c.stroke();
      c.beginPath(); c.moveTo(g.x + g.w, y); c.lineTo(g.x, y + 30); c.stroke();
    }
    c.globalAlpha = 1;
  },
  drawHiddenPlayer(c, t) {
    const p = this.player, f = p.hidden;
    if (!f) return;
    c.save();
    /* приоткрытая дверца шкафа + глаз в щели */
    c.fillStyle = '#1a2226';
    c.fillRect(f.x - 4, f.y, f.w + 8, f.h);
    c.fillStyle = '#050708';
    c.fillRect(f.x + 4, f.y + 8, f.w - 8, f.h - 16);
    const slit = 14 + Math.sin(t * 2) * 2;
    c.fillStyle = '#0f1416';
    c.fillRect(f.x + f.w / 2 - slit / 2, f.y + 20, slit, f.h - 40);
    c.fillStyle = '#d8b89a';
    c.fillRect(f.x + f.w / 2 - 8, f.y + f.h * 0.34, 16, 26);
    c.fillStyle = '#fff'; c.fillRect(f.x + f.w / 2 - 5, f.y + f.h * 0.34 + 10, 4, 3);
    c.fillStyle = '#181818'; c.beginPath(); c.arc(f.x + f.w / 2 - 3 + p.face, f.y + f.h * 0.34 + 11, 1.4, 0, 7); c.fill();
    c.fillStyle = '#37474f';
    c.fillRect(f.x - 6, f.y, 8, f.h);
    c.restore();
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
        c.save(); c.globalAlpha = Math.sin(k * Math.PI) * 0.85;
        c.fillStyle = '#000';
        c.beginPath(); c.ellipse(e.x, e.y - 110, 16, 24, 0, 0, 7); c.fill();
        c.beginPath(); c.ellipse(e.x, e.y - 50, 24, 52, 0, 0, 7); c.fill();
        c.fillStyle = '#fff';
        c.fillRect(e.x - 8, e.y - 116, 6, 6); c.fillRect(e.x + 2, e.y - 116, 6, 6);
        c.restore();
      } else if (e.kind === 'rollingGurney') {
        const g = e.g;
        c.save();
        c.strokeStyle = '#5a6066'; c.lineWidth = 4;
        c.beginPath(); c.moveTo(g.x + 10, g.y + 30); c.lineTo(g.x + 10, g.y + g.h);
        c.moveTo(g.x + g.w - 10, g.y + 30); c.lineTo(g.x + g.w - 10, g.y + g.h); c.stroke();
        c.fillStyle = '#6b7680'; c.fillRect(g.x, g.y + 22, g.w, 10);
        c.fillStyle = '#a8a296'; c.fillRect(g.x + 2, g.y + 12, g.w - 4, 12);
        c.fillStyle = 'rgba(200,195,180,0.95)';
        c.beginPath(); c.ellipse(g.x + g.w / 2, g.y + 8, g.w / 2 - 6, 10, 0, 0, 7); c.fill();
        c.restore();
      } else if (e.kind === 'musicBox') {
        c.save();
        c.fillStyle = '#6a4a2a'; c.fillRect(e.x - 23, e.y, 46, 26);
        c.save(); c.translate(e.x, e.y); c.rotate(-1.2);
        c.fillStyle = '#8a6a3a'; c.fillRect(0, -6, 46, 8); c.restore();
        // ноты
        c.fillStyle = 'rgba(255,240,200,0.85)'; c.font = '16px serif';
        for (let i = 0; i < 3; i++) {
          const nx = e.x + Math.sin(k * 6 + i * 2) * 40, ny = e.y - 40 - k * 60 - i * 30;
          c.fillText('♪', nx, ny);
        }
        c.restore();
      } else if (e.kind === 'vent') {
        c.save(); c.globalAlpha = 1 - k;
        c.strokeStyle = '#8fd0ff'; c.lineWidth = 3;
        c.beginPath(); c.arc(e.x, e.y, 30 + k * 100, 0, 7); c.stroke();
        c.restore();
      }
    }
  },

  /* ---------- мини-игра на экране ---------- */
  drawMiniGame(c) {
    const p = this.player;
    if (!p || !p.mini) return;
    const m = p.mini;
    const w = 460, h = 200, x = VW / 2 - w / 2, y = VH - 300;
    c.save();
    c.fillStyle = 'rgba(4,6,8,0.92)';
    roundRect(c, x, y, w, h, 10); c.fill();
    c.strokeStyle = '#3a4344'; c.lineWidth = 2; roundRect(c, x, y, w, h, 10); c.stroke();
    c.fillStyle = '#ffd166'; c.font = '700 16px Rubik,sans-serif'; c.textAlign = 'center';
    const titles = { drawer: 'ВЫДВИНУТЬ ЯЩИК', lock: 'ВЗЛОМ ЗАМКА ЗАТЫЧКОЙ', pry: 'ОТОГНУТЬ КРЫШКУ', hold: 'ПОТЯНУТЬ' };
    c.fillText(titles[m.kind] || 'МЕХАНИЗМ', x + w / 2, y + 30);
    c.font = '400 13px Rubik,sans-serif'; c.fillStyle = '#cfc6b2';
    c.fillText(m.hint || '', x + w / 2, y + 54);
    const cx = x + w / 2, cy = y + 120;
    if (m.kind === 'drawer') {
      c.strokeStyle = '#8a6a3a'; c.lineWidth = 3;
      c.strokeRect(cx - 90, cy - 40, 180, 90);
      const off = m.prog * 60;
      c.fillStyle = '#4a3b28'; c.fillRect(cx - 80, cy - 30 + off, 160, 70);
      c.fillStyle = '#2a2118'; c.fillRect(cx - 70, cy - 20 + off, 140, 50);
      c.fillStyle = '#8a8f96'; c.fillRect(cx - 10, cy - 6 + off, 20, 10);
      c.strokeStyle = '#ffd166'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(cx + 90 * 0 + Input.mouse.sx - (x), y - 10 + m.prog * 4); c.stroke();
      drawSlider(c, cx - 90, y + h - 26, 180, 12, m.prog, '#ffd166');
    } else if (m.kind === 'lock') {
      const pos = m.data.pos || 0;
      for (let i = 0; i < m.data.pins.length; i++) {
        const px = cx - 120 + i * 60, pin = m.data.pins[i];
        const done = i < m.data.cur;
        c.strokeStyle = '#4a5257'; c.lineWidth = 2;
        c.strokeRect(px - 46, cy - 40, 92, 80);
        c.fillStyle = done ? 'rgba(77,255,106,0.25)' : 'rgba(255,209,102,0.16)';
        c.fillRect(px - 46 + (pin + 1) * 46 - 12, cy - 40, 24, 80);
        c.fillStyle = done ? '#4dff6a' : '#8a8f96';
        c.fillRect(px - 6, cy - 34 + (pin + 1) * 20, 12, 68);
        if (done) { c.fillStyle = '#4dff6a'; c.font = '700 18px sans-serif'; c.fillText('✓', px, cy + 6); }
      }
      // маркер положения мыши
      const cxi = cx - 120 + m.data.cur * 60 + pos * 46;
      c.fillStyle = '#fff'; c.beginPath(); c.arc(cxi, cy + 52, 6, 0, 7); c.fill();
      c.strokeStyle = '#fff'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(cxi, cy - 44); c.lineTo(cxi, cy + 44); c.stroke();
      if (m.data.hold > 0) {
        c.fillStyle = 'rgba(77,255,106,0.8)';
        c.fillRect(cxi - 14, cy - 52, 28 * (m.data.hold / 0.28), 6);
      }
      if (m.data.warn > 0) { c.fillStyle = `rgba(255,80,80,${m.data.warn * 2})`; c.fillRect(x, y, w, h); }
      c.fillStyle = '#cfc6b2'; c.font = '400 12px Rubik,sans-serif';
      c.fillText(`Пин ${Math.min(m.data.cur + 1, m.data.pins.length)} из ${m.data.pins.length}`, cx, y + h - 14);
    } else if (m.kind === 'pry') {
      const ph = m.data.phase || 0;
      c.strokeStyle = '#6a7378'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(cx - 100, cy + 30); c.lineTo(cx + 100, cy + 30); c.stroke();
      c.save(); c.translate(cx - 100, cy + 30); c.rotate(-ph * 1.2 - (ph ? m.data.p2 * 0.9 : m.prog * 1.2));
      c.fillStyle = '#4a5257'; c.fillRect(0, -14, 200, 14);
      c.strokeStyle = '#2a3236'; c.lineWidth = 2;
      for (let i = 0; i < 8; i++) { c.beginPath(); c.moveTo(i * 25, -12); c.lineTo(i * 25, -2); c.stroke(); }
      c.restore();
      drawSlider(c, cx - 100, y + h - 26, 200, 12, ph ? m.data.p2 : m.prog, ph ? '#8fd0ff' : '#ffd166');
      c.fillStyle = '#cfc6b2'; c.font = '400 12px Rubik,sans-serif';
      c.fillText(ph ? 'Тяни РЕЗКО ВБОК ↔' : 'Тяни ВВЕРХ ↑', cx, y + h - 34);
    } else if (m.kind === 'hold') {
      drawSlider(c, cx - 120, y + h - 40, 240, 16, m.prog, '#ffd166');
    }
    c.fillStyle = 'rgba(255,255,255,0.55)'; c.font = '400 12px Rubik,sans-serif';
    c.fillText('ЛКМ — держать и вести мышью • Esc — отпустить', x + w / 2, y - 14);
    c.textAlign = 'left';
    c.restore();
  },

  /* ---------- миникарта ---------- */
  drawMinimap(c) {
    const p = this.player;
    if (!p) return;
    const W = 210, H = 118, x = VW - W - 18, y = VH - H - 96;
    c.save();
    c.fillStyle = 'rgba(6,9,11,0.82)';
    roundRect(c, x, y, W, H, 8); c.fill();
    c.strokeStyle = '#2c3537'; c.lineWidth = 1.5; roundRect(c, x, y, W, H, 8); c.stroke();
    const fi = p.floor;
    const fy = FLOORS[fi].y;
    const sc = (W - 16) / WORLD.w;
    const rowH = 30, rowY = y + 10 + fi * rowH;
    for (let f = 0; f < 3; f++) {
      const ry = y + 10 + f * rowH;
      c.fillStyle = f === fi ? 'rgba(255,209,102,0.10)' : 'rgba(255,255,255,0.03)';
      c.fillRect(x + 8, ry, W - 16, rowH - 8);
      for (const rm of ROOMS) {
        if (rm.f !== f) continue;
        const seen = this.seenRooms[rm.i];
        const rx = x + 8 + rm.x0 * sc, rw2 = Math.max(2, (rm.x1 - rm.x0) * sc);
        c.fillStyle = seen ? (f === fi ? 'rgba(160,200,210,0.5)' : 'rgba(120,150,160,0.22)') : 'rgba(70,80,85,0.18)';
        c.fillRect(rx, ry + 2, rw2 - 1, rowH - 12);
        if (seen && rm.style === 'office') { c.fillStyle = 'rgba(163,22,33,0.5)'; c.fillRect(rx, ry + 2, rw2 - 1, 3); }
      }
      /* метки */
      for (const d of this.doors) {
        if (d.f !== f) continue;
        c.fillStyle = d.locked ? '#ff5c6c' : d.open ? '#4dff6a' : '#ffd166';
        c.fillRect(x + 8 + d.x * sc - 1, ry + rowH - 14, 2, 6);
      }
      for (const v of VENTS) {
        for (const side of ['a', 'b']) {
          const pt = v[side];
          if (pt.f !== f) continue;
          const seen = this.seenRooms[v.a.room] && this.seenRooms[v.b.room];
          if (!seen) continue;
          c.fillStyle = this.ventOpen[v.id] ? '#8fd0ff' : 'rgba(120,140,150,0.6)';
          c.fillRect(x + 8 + pt.x * sc - 1.5, ry + 4, 3, 4);
        }
      }
      for (const L of LADDERS) {
        /* лестницы рисуем на обоих этажах */
        const onFloor = (L.yTop === FLOORS[f].y) || (L.yBot === FLOORS[f].y);
        if (!onFloor) continue;
        c.fillStyle = 'rgba(200,200,200,0.55)';
        c.fillRect(x + 8 + (L.x + L.w / 2) * sc - 1.5, ry + rowH - 16, 3, 8);
      }
      /* лифт */
      const ex = x + 8 + (this.elevator.shaftX + this.elevator.shaftW / 2) * sc;
      c.fillStyle = this.elevatorCard ? '#4dff6a' : '#5c2020';
      c.fillRect(ex - 2, ry + 4, 4, rowH - 14);
      if (f === fi) {
        /* кабина лифта на текущем этаже */
        const carHere = Math.abs(this.elevator.car.y - FLOORS[f].y) < 30;
        if (carHere) { c.fillStyle = '#cfe9ff'; c.fillRect(ex - 3, ry + rowH - 14, 6, 8); }
      }
      /* игрок */
      if (f === fi) {
        const px = x + 8 + p.cx() * sc;
        c.fillStyle = '#fff';
        c.beginPath(); c.arc(px, ry + rowH / 2 - 4, 3.4, 0, 7); c.fill();
        c.fillStyle = '#ff5c6c'; c.beginPath(); c.arc(px, ry + rowH / 2 - 4, 1.6, 0, 7); c.fill();
      }
      /* найденные записки на этаже */
      const notesHere = NOTES.filter(n => {
        const f1 = FURNITURE.find(fu => fu.loot.some(l => l === 'note:' + n.id));
        const p1 = PICKUPS.find(pi => pi.kind === 'note:' + n.id);
        return (f1 && f1.floor === f) || (p1 && p1.floor === f);
      });
      for (const n of notesHere) {
        if (p.notes.includes(n.id)) continue;
        const f1 = FURNITURE.find(fu => fu.loot.some(l => l === 'note:' + n.id));
        const p1 = PICKUPS.find(pi => pi.kind === 'note:' + n.id);
        const nx = f1 ? f1.x + f1.w / 2 : p1.x;
        if (p1 && p1.taken) continue;
        c.fillStyle = 'rgba(255,209,102,0.8)';
        c.fillRect(x + 8 + nx * sc - 1, ry + 6, 2, 6);
      }
    }
    c.fillStyle = 'rgba(232,220,200,0.75)'; c.font = '700 10px Rubik,sans-serif';
    c.fillText('1F', x + W - 24, y + 22);
    c.fillText('2F', x + W - 24, y + 52);
    c.fillText('3F', x + W - 24, y + 82);
    c.restore();
  },

  /* ================= BOOT ================= */
};
window.addEventListener('load', () => Game.init());
