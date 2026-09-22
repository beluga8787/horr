/* ============================================================
   МИШУТКА — сущности: Мишутка, призраки, мини-боссы, босс, мир
   ============================================================ */
'use strict';

/* ================= ИГРОК: МИШУТКА ================= */
class Player {
  constructor(x, y, floor = 0) { this.reset(x, y, floor); }
  reset(x, y, floor = 0) {
    this.x = x; this.y = y; this.w = 34; this.h = 64;
    this.vx = 0; this.vy = 0; this.face = 1; this.onGround = false; this.onSolidGround = false;
    this.floor = floor;
    this.hp = 100; this.maxhp = 100; this.st = 100; this.san = 100;
    this.weapons = { hands: true, knife: false, pistol: false, pick: false };
    this.cur = 'hands'; this.mag = 0; this.reserve = 0; this.magSize = 8;
    this.medkits = 1; this.pills = 1; this.bottles = 1; this.batteries = 2;
    this.keys = {}; this.notes = [];
    this.atkCd = 0; this.atkAnim = 0; this.reloadT = 0; this.iframes = 0;
    this.flashOn = true; this.battery = 100; this.lightDip = 0;
    this.aim = 0; this.handX = x; this.handY = y;
    this.walkT = 0; this.noise = 0; this.exhausted = false;
    this.coyote = 0; this.jumpBuf = 0; this.dropT = 0; this.dead = false;
    this.channel = null; this.mini = null; this.stepT = 0; this.hurtT = 0;
    this.lit = 0; this.lampLit = 0; this.slowT = 0; this.kills = 0;
    this.climbing = null; this.hidden = null; this.crouch = false;
    this.throwCd = 0; this.landT = 0; this.recoil = 0; this.hideCooldown = 0;
    this.vouchSafe = 0; this.climbT = 0; this.breathe = rand(0, 6);
  }
  cx() { return this.x + this.w / 2; }
  cy() { return this.y + this.h / 2; }
  floorY() { return FLOORS[this.floor].y; }

  /* фонарь — всегда в руке, точка привязана к телу */
  updateHand() {
    const sx = this.cx() + this.face * 10, sy = this.y + 34;
    this.handX = sx + Math.cos(this.aim) * 16;
    this.handY = sy + Math.sin(this.aim) * 10;
  }

  update(dt, game) {
    if (this.dead) return;
    this.breathe += dt;
    // камера/лут пауза
    if (this.mini) { this.updateMini(dt, game); return; }
    const ax = Input.axis();
    const run = (Input.keys['ShiftLeft'] || Input.keys['ShiftRight']) && !this.exhausted && this.st > 1;
    this.crouch = Input.crouch() || !!this.climbing;

    // прячусь в шкафу
    if (this.hidden) { this.updateHidden(dt, game); return; }
    if (this.hideCooldown > 0) this.hideCooldown -= dt;

    // канал обыска
    if (this.channel) {
      if (ax !== 0 || Input.jumpHit()) { this.channel = null; game.hideChannel(); }
      else {
        this.channel.t += dt;
        game.showChannel(this.channel.t / this.channel.dur, this.channel.label);
        if (this.channel.noisy) this.noise = Math.max(this.noise, 0.8);
        if ((this.channel.tickT = (this.channel.tickT || 0) + dt) > 0.3) { this.channel.tickT = 0; AudioSys.search(); }
        if (this.channel.t >= this.channel.dur) {
          const cb = this.channel.onDone; this.channel = null; game.hideChannel(); cb();
        }
        this.vx *= 0.8;
      }
    }

    /* ---------- ЛЕСТНИЦА ---------- */
    const lad = game.ladderAt(this.cx(), this.y, this.h);
    if (this.climbing) {
      const L = this.climbing;
      if (!this.keys_down_hold()) { /* continue */ }
      const v = Input.vaxis();
      this.vy = v * 150;
      this.vx = lerp(this.vx, ax * 90, dt * 8);
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.x = clamp(this.x, L.x - 6, L.x + L.w - this.w + 6);
      this.y = clamp(this.y, L.yTop - L.w - this.h, L.yBot - this.h + 4);
      this.onGround = false; this.climbT += dt;
      this.floor = game.floorAtY(this.y + this.h);
      const feet = this.y + this.h;
      if (feet <= L.yTop + 2 && v < 0) this.finishClimb(game);
      if (feet >= L.yBot - 2 && v > 0) this.finishClimb(game);
      if (Input.pressed['Space']) { this.climbing = null; this.vy = -260; }
      this.updateHand();
      this.noise = Math.max(this.noise, 0.2);
      game.refreshFloorHUD();
      return;
    }
    if (lad && Input.vaxis() < 0 && !this.channel && !Input.keys['Space']) {
      this.climbing = lad; this.vy = 0; this.vx = 0;
      this.x = clamp(this.cx() - this.w / 2, lad.x - 6, lad.x + lad.w - this.w + 6);
      return;
    }
    if (lad && Input.vaxis() > 0 && this.onGround && !Input.keys['Space']) { this.climbing = lad; this.vy = 0; this.climbT = 0; }

    /* ---------- ДВИЖЕНИЕ ---------- */
    const slow = this.slowT > 0 ? 0.55 : 1;
    const crowded = this.crouch ? 0.42 : 1;
    const max = (run ? 415 : 262) * slow * crowded;
    const acc = this.onGround ? 3400 : 2200;
    if (!this.channel) {
      if (ax !== 0) { this.vx = clamp(this.vx + ax * acc * dt, -max, max); this.face = ax; }
      else this.vx *= Math.pow(this.onGround ? 0.0002 : 0.02, dt);
      if (run && ax !== 0) {
        this.st -= 16 * dt; this.noise = Math.max(this.noise, 0.5);
        if (this.st <= 0) { this.st = 0; this.exhausted = true; game.toast('Мишутка задыхается…', 'red'); }
      }
      if (this.exhausted && this.st > 25) this.exhausted = false;
      if (ax !== 0 && !run) this.noise = Math.max(this.noise, 0.18);
    }
    /* прыжок */
    if (this.onGround) this.coyote = 0.12; else this.coyote -= dt;
    if (Input.jumpHit()) this.jumpBuf = 0.12; else this.jumpBuf -= dt;
    const wantDrop = Input.vaxis() > 0;
    if (this.jumpBuf > 0 && this.coyote > 0 && !this.channel) {
      if (wantDrop && !this.onSolidGround) { this.dropT = 0.25; this.jumpBuf = 0; }
      else if (this.st > 5) {
        this.vy = -800; this.onGround = false; this.coyote = 0; this.jumpBuf = 0;
        this.st -= 6; AudioSys.jump(); Particles.dust(this.cx(), this.y + this.h, 5);
      }
    }
    if (!Input.jumpHeld() && this.vy < -250) this.vy = -250;
    this.dropT -= dt;
    /* прицел — фонарь в руке, следует за мышью */
    const mwx = Input.mouse.sx + Camera.x, mwy = Input.mouse.sy + Camera.y;
    this.aim = Math.atan2(mwy - (this.y + (this.crouch ? 42 : 32)), mwx - this.cx());
    if (Math.abs(mwx - this.cx()) > 12) this.face = mwx > this.cx() ? 1 : -1;
    this.updateHand();
    /* фонарь */
    if (Input.pressed['KeyF']) this.toggleFlash(game, true);
    if (this.flashOn && this.battery > 0) {
      this.battery = Math.max(0, this.battery - dt * 0.42);
      if (this.battery <= 0) { this.flashOn = false; game.toast('🔋 Фонарь сел! Нужны батарейки [B]', 'red'); this.lightDip = 1; }
      else if (this.battery < 20 && Math.random() < dt * 1.6) this.lightDip = 1;
    }
    if (this.lightDip > 0) this.lightDip -= dt * 2.2;
    if (Input.pressed['KeyB'] && this.batteries > 0) {
      this.batteries--; this.battery = 100; AudioSys.unlock();
      game.toast(`🔋 Батарейка вставлена (осталось: ${this.batteries})`, 'gold');
      game.refreshHUD();
    }
    /* оружие */
    const numMap = { Digit1: 'hands', Digit2: 'knife', Digit3: 'pistol', Digit4: 'pick' };
    for (const k in numMap) if (Input.pressed[k] && this.weapons[numMap[k]]) { this.cur = numMap[k]; this.reloadT = 0; AudioSys.uiClick(); game.refreshHUD(); }
    /* перезарядка */
    if ((Input.pressed['KeyR'] || (this.cur === 'pistol' && this.mag === 0 && Input.atkHit() && this.reserve > 0)) && this.reloadT <= 0) {
      if (this.cur === 'pistol' && this.mag < this.magSize && this.reserve > 0) { this.reloadT = 1.1; AudioSys.reload(); }
    }
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        const take = Math.min(this.magSize - this.mag, this.reserve);
        this.mag += take; this.reserve -= take; game.refreshHUD();
      }
    }
    /* предметы */
    if (Input.pressed['KeyQ']) this.useMedkit(game);
    if (Input.pressed['KeyT']) this.usePills(game);
    if (Input.pressed['KeyG']) this.throwBottle(game);
    /* атака */
    this.atkCd -= dt; this.atkAnim -= dt; this.recoil = Math.max(0, this.recoil - dt * 6);
    if (Input.atkHit() && this.atkCd <= 0 && this.reloadT <= 0 && !this.channel && !game.modalOpen()) this.tryAttack(game);
    /* выносливость */
    if (!run) this.st = clamp(this.st + (ax === 0 ? 26 : 12) * dt, 0, 100);
    /* рассудок */
    const ghostNear = game.ghostPressure(this.cx(), this.cy());
    if (this.lit > 0.55) this.san = clamp(this.san + (this.lampLit > 0.3 ? 5.5 : 1.6) * dt, 0, 100);
    else this.san = clamp(this.san - (0.6 - this.lit) * 7 * dt - ghostNear * 5 * dt, 0, 100);
    if (this.san <= 0) this.takeDamage(2.5 * dt, game, 'mind');
    if (this.slowT > 0) this.slowT -= dt;
    if (this.iframes > 0) this.iframes -= dt;
    if (this.hurtT > 0) this.hurtT -= dt;
    if (this.throwCd > 0) this.throwCd -= dt;
    this.noise = Math.max(0, this.noise - dt * 1.2);
    /* физика */
    const wasAir = !this.onGround;
    this.vy = Math.min(this.vy + 1900 * dt, 1150);
    game.moveAndCollide(this, dt, true);
    this.floor = game.floorAtY(this.y + this.h);
    if (wasAir && this.onGround) {
      this.landT = 0.18; AudioSys.land();
      Particles.dust(this.cx(), this.y + this.h, 6);
      if (this.vyFall > 700) Camera.shake(0.12);
    }
    this.vyFall = this.vy;
    if (this.landT > 0) this.landT -= dt;
    /* шаги */
    if (this.onGround && Math.abs(this.vx) > 40) {
      this.walkT += dt * Math.abs(this.vx) / 58;
      this.stepT -= dt * (run ? 1.7 : 1);
      if (this.stepT <= 0) { this.stepT = 0.34; AudioSys.step(run); if (run) Particles.dust(this.cx(), this.y + this.h, 2); }
      this.noise = Math.max(this.noise, run ? 0.5 : 0.2);
    } else this.walkT += dt * 2;
  }
  keys_down_hold() { return true; }
  finishClimb(game) {
    const L = this.climbing; this.climbing = null;
    this.x = L.x + L.w / 2 - this.w / 2;
    this.floor = game.floorAtY(this.y + this.h);
    game.toast('▚ ' + FLOORS[this.floor].name, '');
    game.refreshFloorHUD();
  }
  updateHidden(dt, game) {
    const f = this.hidden;
    this.x = f.cx() - this.w / 2; this.y = f.y + f.h - this.h - 4;
    this.vx = 0; this.vy = 0;
    this.lit = 0;
    this.san = clamp(this.san - dt * 0.7, 0, 100);
    const mwx = Input.mouse.sx + Camera.x, mwy = Input.mouse.sy + Camera.y;
    this.aim = Math.atan2(mwy - this.cy(), mwx - this.cx());
    if (Input.useHit() || Input.jumpHit() || Input.pressed['KeyF'] && false) { this.hidden = null; this.hideCooldown = 0.4; AudioSys.door(); game.toast('Вылез из шкафа', ''); }
  }
  toggleFlash(game, manual) {
    if (!this.flashOn && this.battery <= 0) { game.toast('🔋 Фонарь мёртв. Найди батарейку [B]', 'red'); return; }
    this.flashOn = !this.flashOn;
    AudioSys.uiClick();
    if (manual) game.toast(this.flashOn ? '🔦 Фонарь включён' : 'Фонарь выключен… темно.', this.flashOn ? '' : 'red');
  }
  useMedkit(game) {
    if (this.medkits <= 0) { game.toast('Нет аптечек!', 'red'); return; }
    if (this.hp >= this.maxhp) { game.toast('Здоровье полное', ''); return; }
    this.medkits--; this.hp = clamp(this.hp + 55, 0, this.maxhp);
    AudioSys.heal(); Particles.spark(this.cx(), this.cy(), 10, '#7dff8a');
    Floaters.add(this.cx(), this.y - 10, '+55 HP', '#7dff8a', 18);
    game.refreshHUD();
  }
  usePills(game) {
    if (this.pills <= 0) { game.toast('Нет пилюль!', 'red'); return; }
    if (this.san >= 100) { game.toast('Рассудок в норме', ''); return; }
    this.pills--; this.san = clamp(this.san + 45, 0, 100);
    AudioSys.pills(); Particles.spark(this.cx(), this.cy(), 10, '#c77dff');
    Floaters.add(this.cx(), this.y - 10, '+45 RASS', '#c77dff', 18);
    game.refreshHUD();
  }
  throwBottle(game) {
    if (this.bottles <= 0) { game.toast('Нет бутылок!', 'red'); return; }
    if (this.throwCd > 0) return;
    this.bottles--; this.throwCd = 0.45;
    AudioSys.swing();
    const a = this.aim - 0.35 * this.face * this.face;
    game.spawnProjectile({
      x: this.handX, y: this.handY, vx: Math.cos(a) * 620, vy: Math.sin(a) * 620 - 120,
      r: 7, dmg: 6, san: 0, kind: 'bottle', life: 5, gravity: 1500,
    });
    game.refreshHUD();
  }
  takeDamage(amount, game, type = 'hit') {
    if (this.dead) return;
    if (type === 'hit' && this.iframes > 0) return;
    if (type === 'hit') this.iframes = 0.7;
    this.hp -= amount; this.hurtT = 0.25;
    if (type === 'hit') {
      AudioSys.hurt(); Camera.shake(0.45); game.damageFlash();
      Particles.blood(this.cx(), this.cy(), 10);
    }
    if (this.hp <= 0 && !this.dead) { this.hp = 0; this.dead = true; game.onDeath(); }
  }

  /* ---------- мини-игры (тянуть мышью) ---------- */
  startMini(kind, opts, game) {
    this.mini = Object.assign({
      kind, t: 0, done: false, prog: 0, held: false, ok: true, data: {},
    }, opts);
    this.vx = 0;
    game.toast(opts.hint || 'Держи ЛКМ и веди в нужную сторону!', '');
  }
  updateMini(dt, game) {
    const m = this.mini;
    m.t += dt;
    m.dx = Input.mouse.dx || 0; m.dy = Input.mouse.dy || 0;
    const drag = Input.mouse.down && Input.mouse.dragging;
    switch (m.kind) {
      case 'drawer': { // тянем ящик на себя -> вбок, потом вниз
        const want = m.data.dir; // 'right'|'down'
        const delta = want === 'right' ? m.dx : m.dy;
        if (drag && delta > 0) m.prog = clamp(m.prog + delta * 0.0042, 0, 1);
        else if (!drag) m.prog = clamp(m.prog - dt * 0.75, 0, 1);
        m.strain = m.prog;
        if (m.prog >= 1) m.done = true;
        break;
      }
      case 'lock': { // взлом: держать и вести вбок, не выходя за зону
        const cur = m.data.cur || 0;
        let pos = m.data.pos || 0;
        if (drag) {
          pos = clamp(pos + m.dx * 0.0055, -1, 1);
          const pin = m.data.pins[cur];
          if (Math.abs(pos - pin) < 0.12) {
            m.data.hold = (m.data.hold || 0) + dt;
            if (m.data.hold > 0.28) { // пин зафиксирован
              m.data.cur++; m.data.hold = 0; pos = 0; m.data.pos = 0;
              AudioSys.tone(600 + m.data.cur * 120, 0.09, 'square', 0.14);
              Particles.spark(0, 0, 0);
              game.miniSpark();
              if (m.data.cur >= m.data.pins.length) { m.done = true; }
            }
          } else { m.data.hold = 0; if (Math.abs(pos) > 0.98) { m.shake = 0.2; AudioSys.noise(0.06, 0.1, 900, 2); m.data.pos = clamp(pos, -1, 1); m.data.warn = 0.3; } }
          if (m.shake > 0) m.shake -= dt;
        } else { pos *= Math.pow(0.001, dt); m.data.hold = 0; }
        m.data.pos = pos;
        if (m.data.warn > 0) m.data.warn -= dt;
        break;
      }
      case 'pry': { // отогнуть крышку: тянем вверх, потом вбок
        const phase = m.data.phase || 0;
        if (drag) {
          if (phase === 0) { m.prog = clamp(m.prog + m.dy * -0.0045, 0, 1); if (m.prog >= 1) { m.data.phase = 1; m.prog = 0; AudioSys.noise(0.2, 0.2, 700, 2); } }
          else { m.data.p2 = clamp((m.data.p2 || 0) + Math.abs(m.dx) * 0.004, 0, 1); if (m.data.p2 >= 1) m.done = true; }
        } else if (phase === 0) m.prog = clamp(m.prog - dt * 0.8, 0, 1);
        break;
      }
      case 'hold': { // просто держать и тянуть вверх (дверь/затычка)
        if (drag) m.prog = clamp(m.prog + m.dy * -0.004, 0, 1); else m.prog = clamp(m.prog - dt * 0.9, 0, 1);
        if (m.prog >= 1) m.done = true;
        break;
      }
    }
    if (m.done && !m.finished) { m.finished = true; if (m.onDone) m.onDone(dt, game); }
    if (m.finished && m.t > (m.holdDone || 0.25)) { const cb = m.onEnd; this.mini = null; game.hideMini(); if (cb) cb(); }
    if (Input.pressed['Escape']) { this.mini = null; game.hideMini(); }
    if (Input.pressed['KeyE'] && m.cancelable !== false && !m.done) { this.mini = null; game.hideMini(); game.toast('Отпустил…', ''); }
    this.updateHand();
  }

  /* ---------- ОТРИСОВКА ---------- */
  draw(c) {
    if (this.hidden) { return; } // рисуется шкафом
    if (this.dead) {
      c.save(); c.globalAlpha = 0.92;
      ellipseShadow(c, this.cx(), this.y + this.h - 2, 30, 7, 0.4);
      c.fillStyle = '#3a4a52'; c.fillRect(this.x - 12, this.y + this.h - 24, 58, 20);
      c.fillStyle = '#d8b89a'; c.beginPath(); c.arc(this.x - 16, this.y + this.h - 12, 11, 0, 7); c.fill();
      c.fillStyle = '#a31621'; c.beginPath(); c.ellipse(this.x - 16, this.y + this.h - 1, 18, 6, 0, 0, 7); c.fill();
      c.restore(); return;
    }
    if (this.iframes > 0 && ((this.iframes * 20) | 0) % 2 === 0) c.globalAlpha = 0.45;
    const cx = this.cx(), feet = this.y + this.h, f = this.face, t = this.breathe;
    const crouchK = this.crouch ? 1 : 0;
    const climbK = this.climbing ? 1 : 0;
    ellipseShadow(c, cx, feet + 3, 20, 6, 0.45);
    const speedK = Math.abs(this.vx) > 40 && this.onGround ? 1 : 0.08;
    const sw = Math.sin(this.walkT * 6) * speedK;
    const airK = this.onGround ? 0 : 1;
    const lean = clamp(this.vx / 420, -1, 1) * (crouchK ? 1.4 : 4);
    const land = this.landT > 0 ? this.landT / 0.18 : 0;
    const squash = 1 - land * 0.14;
    c.save();
    c.translate(cx, this.y + (crouchK ? 18 : 0) + land * 7);
    c.scale(f, squash);
    const H = this.h - (crouchK ? 18 : 0);
    /* ноги */
    const swing = climbK ? Math.sin(t * 7) * 8 : sw * 11;
    for (const s of [-1, 1]) {
      const off = s > 0 ? swing : -swing;
      const legX = -7 + s * 2 + (airK ? s * 5 : 0) + (crouchK ? s * 2 : 0);
      const knee = Math.max(0, off) * 0.5;
      c.fillStyle = s > 0 ? '#4a5a66' : '#3d4c55';
      c.beginPath();
      c.moveTo(legX, 32); c.lineTo(legX + 10, 32);
      c.lineTo(legX + 8 + off * 0.5, 32 + 16 - knee);
      c.lineTo(legX + 10 + off, 32 + 26 - knee * 1.3);
      c.lineTo(legX + off, 32 + 26 - knee * 1.3);
      c.lineTo(legX + 2 + off * 0.5, 32 + 16 - knee);
      c.closePath(); c.fill();
      c.fillStyle = 'rgba(225,225,225,0.22)';
      for (let i = 0; i < 3; i++) c.fillRect(legX + 1, 35 + i * 7, 8, 2);
      c.fillStyle = '#6b5d4f';
      c.fillRect(legX - 2 + off, 56 - knee * 1.3, 15, 7);
    }
    /* торс */
    const bob = Math.abs(sw) * 2 + Math.sin(t * 2.4) * 0.8;
    c.fillStyle = '#7d94a0';
    c.beginPath();
    c.moveTo(-9, 20 + bob * 0.3); c.lineTo(9, 20 + lean * 0.4);
    c.lineTo(11 + lean * 0.3, 42); c.lineTo(-11, 42); c.closePath(); c.fill();
    c.fillStyle = '#6a828e'; c.fillRect(-9, 20 + bob * 0.3, 4, 22);
    c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(-9, 26, 20, 6);
    c.fillStyle = '#5c0a12';
    c.beginPath(); c.ellipse(2, 34 + bob, 4, 6, 0.3, 0, 7); c.fill();
    c.save(); c.translate(-9, 30); c.scale(f, 1); c.fillStyle = '#e8dcc8'; c.font = '700 7px sans-serif'; c.fillText('№12', 0, 0); c.restore();
    /* задняя рука */
    c.strokeStyle = '#d8b89a'; c.lineWidth = 6; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-4, 24); c.lineTo(-12, 34 - sw * 8); c.stroke();
    /* голова */
    const hy = 10 + bob * 0.5 + (crouchK ? 2 : 0);
    c.fillStyle = '#d8b89a';
    c.beginPath(); c.ellipse(1, hy, 10, 12, 0, 0, 7); c.fill();
    c.fillStyle = '#4a3220';
    c.beginPath(); c.ellipse(0, hy - 9, 10, 6, -0.1, 0, 7); c.fill();
    for (let i = 0; i < 6; i++) {
      const a = -2.5 + i * 0.3;
      c.fillRect(1 + Math.cos(a) * 9 - 2, hy - 9 + Math.sin(a) * 6 - 2, 5, 5 + Math.sin(t * 1.5 + i) * 1.5);
    }
    c.fillStyle = '#cfc4ae'; c.fillRect(-9, hy - 8, 20, 5);
    c.fillStyle = '#a31621'; c.beginPath(); c.ellipse(-5, hy - 6, 3, 2.5, 0, 0, 7); c.fill();
    /* лицо */
    const lookY = clamp(Math.sin(this.aim) * 3, -3, 3);
    const insane = this.san < 30;
    const blink = (Math.sin(t * 2.7) > 0.975 && !insane) ? 0.2 : 1;
    c.fillStyle = '#fff'; c.fillRect(2, hy - 1 + lookY * 0.5, 7, (insane ? 6 : 5) * blink);
    c.fillStyle = insane ? '#7b2fbf' : '#1a1a1a';
    c.beginPath(); c.arc(5.5 + (f > 0 ? 1 : -1), hy + 1.5 + lookY * 0.5, insane ? 2.6 : 1.6, 0, 7); c.fill();
    c.fillStyle = 'rgba(60,20,60,0.5)'; c.fillRect(1, hy + 5, 9, 2.5);
    c.fillStyle = 'rgba(40,30,25,0.35)'; c.fillRect(-4, hy + 5, 12, 5);
    c.strokeStyle = '#5a2a2a'; c.lineWidth = 1.6;
    c.beginPath();
    if (this.hp < 30) c.arc(4, hy + 10, 2.6, 0.2, Math.PI - 0.2);
    else if (insane) c.ellipse(4, hy + 10, 2, 3, 0, 0, 7);
    else if (this.exhausted) { c.moveTo(1, hy + 10); c.lineTo(7, hy + 12); }
    else { c.moveTo(1, hy + 9.5); c.lineTo(7, hy + 9); }
    c.stroke();
    c.restore();
    /* передняя рука + фонарь/оружие */
    const shx = cx + f * 6, shy = this.y + (crouchK ? 18 : 0) + 26 - land * 7;
    c.save();
    c.strokeStyle = '#7d94a0'; c.lineWidth = 7; c.lineCap = 'round';
    c.beginPath(); c.moveTo(shx, shy); c.lineTo(lerp(shx, this.handX, 0.45), lerp(shy, this.handY, 0.45)); c.stroke();
    c.strokeStyle = '#d8b89a'; c.lineWidth = 6;
    c.beginPath(); c.moveTo(lerp(shx, this.handX, 0.4), lerp(shy, this.handY, 0.4)); c.lineTo(this.handX, this.handY); c.stroke();
    const rec = -this.recoil * 7;
    c.translate(this.handX + Math.cos(this.aim) * rec, this.handY + Math.sin(this.aim) * rec);
    c.rotate(this.aim); c.scale(1, f);
    c.fillStyle = '#d8b89a'; c.beginPath(); c.arc(0, 0, 4.5, 0, 7); c.fill();
    if (this.cur === 'pistol') {
      c.fillStyle = '#22262b'; c.fillRect(0, -3, 20, 7);
      c.fillStyle = '#3a3f45'; c.fillRect(4, 3, 6, 8);
      c.fillStyle = '#111'; c.fillRect(17, -2, 4, 4);
      c.fillStyle = '#c8a02a'; c.fillRect(0, 5, 13, 6);
      c.fillStyle = '#2a2a2a'; c.fillRect(2, 5, 3, 6); c.fillRect(8, 5, 3, 6);
      c.fillStyle = this.flashOn ? '#fff6d8' : '#555'; c.fillRect(13, 5.5, 3, 5);
    } else {
      c.fillStyle = '#8a8f96'; c.fillRect(-2, -3, 16, 7);
      c.fillStyle = '#3c4046'; c.fillRect(-6, -2.5, 5, 6);
      const on = this.flashOn && this.battery > 0;
      const dim = this.battery < 22 ? (0.45 + Math.sin(t * 22) * 0.35) : 1;
      c.fillStyle = on ? `rgba(255,246,216,${dim})` : '#444';
      c.beginPath(); c.arc(15, 0.5, 4, 0, 7); c.fill();
      if (on) { c.shadowBlur = 20 * dim; c.shadowColor = '#ffe9b0'; c.fillRect(14, -2, 3, 5); c.shadowBlur = 0; }
      if (this.cur === 'knife') {
        c.fillStyle = '#c9d2d8'; c.fillRect(2, -14, 4, 13);
        c.fillStyle = '#4a3220'; c.fillRect(1, -4, 6, 6);
        c.strokeStyle = '#fff'; c.lineWidth = 1; c.beginPath(); c.moveTo(3, -13); c.lineTo(3, -3); c.stroke();
        c.fillStyle = 'rgba(163,22,33,0.7)'; c.fillRect(2, -13, 4, 4);
      } else if (this.cur === 'pick') {
        c.strokeStyle = '#c8c8c8'; c.lineWidth = 2.4;
        c.beginPath(); c.moveTo(2, 0); c.lineTo(16, -8); c.stroke();
        c.beginPath(); c.ellipse(18, -9, 4, 2.6, -0.5, 0, 7); c.stroke();
        if (this.atkAnim > 0) { c.strokeStyle = '#fff8c8'; c.lineWidth = 2; c.beginPath(); c.arc(18, -9, 7, 0, 7); c.stroke(); }
      } else { c.fillStyle = '#c9a184'; c.fillRect(2, -5, 7, 9); }
    }
    c.restore();
    /* взмах */
    if (this.atkAnim > 0 && this.cur !== 'pistol') {
      c.save(); c.globalAlpha = this.atkAnim / 0.18 * 0.7;
      c.strokeStyle = this.cur === 'knife' ? '#e8f4ff' : this.cur === 'pick' ? '#ffe9b0' : '#fff';
      c.lineWidth = this.cur === 'knife' ? 4 : 8; c.lineCap = 'round';
      const w = WEAPONS[this.cur], p2 = 1 - this.atkAnim / 0.18;
      c.beginPath(); c.arc(this.handX, this.handY, w.range * 0.75, this.aim - 1 + p2 * 1.6, this.aim - 0.2 + p2 * 1.6); c.stroke();
      c.restore();
    }
    if (this.hurtT > 0) { c.fillStyle = `rgba(163,22,33,${this.hurtT * 2})`; c.fillRect(this.x - 4, this.y - 4, this.w + 8, this.h + 8); }
    c.globalAlpha = 1;
  }
}

/* ================= БАЗА ДЛЯ ВРАГОВ ================= */
class EnemyBase {
  constructor() {
    this.vx = 0; this.vy = 0; this.hitT = 0; this.dead = false; this.dieT = 0;
    this.animT = rand(0, 10); this.lit = 0; this.alertT = 0; this.face = 1;
    this.onGround = false; this.touchCd = 0; this.stuckT = 0; this.lastX = 0;
    this.stuckCount = 0; this.climbTarget = null; this.ladderCd = 0;
    this.attackCd = 0; this.stunT = 0; this.pinTarget = null;
    this.hp = 1; this.maxhp = 1; this.dmg = 1; this.speed = 100; this.sight = 520;
    this.litSlow = 1;
  }
  cx() { return this.x + this.w / 2; }
  cy() { return this.y + this.h / 2; }
  get f() { return this.floor || 0; }

  /* --- восприятие --- */
  seesPlayer(game) {
    const p = game.player;
    if (p.dead) return false;
    if (this.floor !== p.floor) return false;
    if (p.hidden) { return false; } // в шкафу — не видно
    const dx = p.cx() - this.cx(), dy = p.cy() - this.cy();
    const d = Math.hypot(dx, dy);
    if (d > this.sight) return false;
    // тьма уменьшает обзор (кроме двойника)
    const dark = 1 - Math.max(p.lit, this.lit) * (this.type === 'double' ? 0 : 0.45);
    if (d > this.sight * dark) return false;
    for (const dr of game.doors) {
      if (dr.floor !== this.floor) continue;
      if (dr.solid && ((this.cx() < dr.x) !== (p.cx() < dr.x)) && Math.abs(p.cx() - dr.x) < 120) return false;
    }
    return true;
  }
  hearsPlayer(game, radius) {
    const p = game.player;
    if (p.dead || p.floor !== this.floor) return false;
    if (p.noise <= 0.12) return false;
    const d = dist(this.cx(), this.cy(), p.cx(), p.cy());
    return d < (radius || 700) * p.noise;
  }
  hearsNoise(nx, ny, radius, game) {
    if (Math.abs(ny - this.cy()) > 320) return false;
    return dist(this.cx(), this.cy(), nx, ny) < radius;
  }

  /* --- движение к цели (универсальное, с лазаньем, прыжками и распутыванием) --- */
  moveToward(tx, ty, speed, dt, game, opts = {}) {
    const p = game.player;
    const dx = tx - this.cx(), dy = ty - this.cy();
    const dir = sign(dx) || this.face;
    /* лестница: цель заметно выше/ниже */
    if (opts.allowLadder !== false && Math.abs(dy) > 90 && this.ladderCd <= 0) {
      const lad = game.nearestLadder(this.cx(), this.floor);
      if (lad && Math.abs(lad.x + lad.w / 2 - this.cx()) < 220) {
        this.climbTarget = lad;
      }
    }
    if (this.climbTarget) {
      const L = this.climbTarget;
      const goingUp = this.floor < game.floorAtY(ty);
      const targetY = goingUp ? L.yTop : L.yBot;
      const nextFloor = goingUp ? game.floorAtY(L.yTop - 2) : game.floorAtY(L.yBot + 2);
      const cxL = L.x + L.w / 2;
      if (Math.abs(this.cx() - cxL) > 26 && this.floor === this.floor && Math.abs(this.cy() - L.yBot) < 90 || Math.abs(this.cy() - L.yTop) < 60) {
        this.vx = sign(cxL - this.cx()) * speed * 0.8;
        this.vy = 0;
        if (!this.onAirLadder) { this.x += this.vx * dt; }
      } else {
        this.vx = 0;
        this.vy = goingUp ? -130 : 150;
        this.y += this.vy * dt;
        this.x = lerp(this.x, cxL - this.w / 2, dt * 4);
        if ((goingUp && this.y + this.h <= L.yTop + 2) || (!goingUp && this.y + this.h >= L.yBot - 2)) {
          this.floor = nextFloor; this.climbTarget = null; this.ladderCd = 0.6;
          this.y = clamp(this.y, FLOORS[nextFloor].y - 400, FLOORS[nextFloor].y - this.h);
          game.enterFloor(this);
        }
      }
      return;
    }
    this.vx = lerp(this.vx, dir * speed, 1 - Math.pow(0.02, dt));
    /* препятствие впереди -> прыжок */
    const probeX = this.cx() + dir * (this.w / 2 + 12);
    const blocked = game.solidAt(probeX, this.y + this.h - 8, 6, 6) || game.solidAt(probeX, this.y + this.h - 40, 6, 6);
    const ledgeAhead = this.onGround && !game.solidAt(probeX + dir * 16, this.y + this.h + 6, 6, 12);
    if (this.onGround && (blocked || ledgeAhead) && this.ladderCd <= 0) {
      this.vy = -600;
    }
    if (this.stunT > 0) { this.vx *= 0.6; this.vy += 1900 * dt; game.moveAndCollide(this, dt, false); return; }
    this.vy += 1900 * dt;
    game.moveAndCollide(this, dt, false);
    /* застревание */
    if (Math.abs(this.vx) < 26 && this.onGround) { this.stuckT += dt; } else { this.stuckT = 0; }
    if (this.stuckT > 0.45) {
      this.stuckT = 0; this.stuckCount++;
      this.vy = -620;
      if (this.stuckCount >= 2) {
        this.stuckCount = 0;
        // фазовый рывок: телепорт ближе к цели (только если далеко)
        if (Math.abs(dx) > 240 && !opts.noPhase) {
          const nx = clamp(tx + (Math.random() < 0.5 ? -1 : 1) * rand(140, 260), 30, WORLD.w - 60);
          Particles.soul(this.cx(), this.cy(), 12);
          this.x = nx; this.y = FLOORS[this.floor].y - this.h - 4;
          Particles.soul(this.cx(), this.cy(), 12);
          AudioSys.whisper();
        }
      }
    }
    if (this.ladderCd > 0) this.ladderCd -= dt;
    if (!opts.faceLock && Math.abs(this.vx) > 8) this.face = sign(this.vx);
  }

  /* --- атака двери, за которой спрятался игрок --- */
  tryBreak(game, dt) {
    const p = game.player;
    if (!this.pinTarget) return false;
    const d = this.pinTarget;
    if (!d.pinned || d.open) { this.pinTarget = null; return false; }
    if (Math.abs(this.cx() - d.x) > 70) {
      this.moveToward(d.x, this.y + this.h - 10, this.speed, dt, game, { noPhase: true });
      return true;
    }
    this.vx = 0;
    d.breakProg += dt * (this.breakSpeed || 0.32);
    if (Math.random() < dt * 6) {
      Particles.spark(d.x, d.y + 40, 2, '#ffd166');
      AudioSys.noise(0.12, 0.16, 400, 2);
      Camera.shake(0.06);
    }
    if (d.breakProg >= 1) {
      d.pinned = false; d.breakProg = 0;
      this.pinTarget = null;
      AudioSys.locked(); Camera.shake(0.3);
      game.toast('🚪 Тварь выбила затычку из двери!', 'red');
    }
    return true;
  }
  hitStop(dmg, game, dir) {
    this.hp -= dmg; this.hitT = 0.16; this.stunT = 0.12;
    this.vx += dir * 140;
    Particles.ichor(this.cx(), this.cy(), 8);
  }
}

/* ================= ПРИЗРАКИ ================= */
const GHOST_DEFS = {
  whisper: { w: 46, h: 34,  hp: 34,  speed: 205, dmg: 10, sight: 540, name: 'Шептун' },
  nurse:   { w: 42, h: 96,  hp: 70,  speed: 130, dmg: 8,  sight: 660, name: 'Плакальщица' },
  brute:   { w: 74, h: 112, hp: 190, speed: 92,  dmg: 24, sight: 500, name: 'Смирительный' },
  spider:  { w: 58, h: 50,  hp: 95,  speed: 175, dmg: 15, sight: 600, name: 'Ползун' },
  double:  { w: 34, h: 64,  hp: 120, speed: 240, dmg: 17, sight: 880, name: 'Двойник' },
};

class Ghost extends EnemyBase {
  constructor(type, x, floorIdx, leash) {
    super();
    const d = GHOST_DEFS[type];
    this.type = type; this.w = d.w; this.h = d.h;
    this.kind = 'ghost';
    this.x = x - d.w / 2; this.y = FLOORS[floorIdx].y - d.h;
    this.floor = floorIdx;
    this.hp = d.hp; this.maxhp = d.hp;
    this.speed = d.speed; this.dmg = d.dmg; this.sight = d.sight;
    this.leash = leash; this.face = Math.random() < 0.5 ? -1 : 1;
    this.tState = rand(0, 2); this.attackCd = 0; this.homeX = x;
    this.phase = rand(0, 6);
    this.chaseT = 0; this.mode = 'patrol';
    this.noiseSeek = null;   // точка шума для расследования
    this.searchT = 0;
    this.y = FLOORS[floorIdx].y - d.h;
  }
  takeDamage(dmg, game, dir = 0) {
    if (this.dead) return;
    const bonus = this.lit > 0.3 ? 1.5 : 1;
    const total = Math.max(1, Math.round(dmg * bonus));
    this.hitStop(total, game, dir);
    AudioSys.ghostHit();
    Floaters.add(this.cx(), this.y - 8, total + (bonus > 1 ? '☀' : ''), bonus > 1 ? '#ffe9b0' : '#c77dff', 16);
    this.alertT = Math.max(this.alertT, 5);
    this.mode = 'chase';
    if (this.hp <= 0) {
      this.dead = true; this.dieT = 0.5;
      AudioSys.ghostDie();
      Particles.soul(this.cx(), this.cy(), 22);
      game.onGhostKilled(this);
    }
  }
  update(dt, game) {
    this.animT += dt; this.phase += dt;
    if (this.hitT > 0) this.hitT -= dt;
    if (this.touchCd > 0) this.touchCd -= dt;
    if (this.attackCd > 0) this.attackCd -= dt;
    if (this.stunT > 0) this.stunT -= dt;
    if (this.dead) { this.dieT -= dt; return this.dieT > 0; }
    const p = game.player;
    this.lit = Math.max(game.flashLit(this.cx(), this.cy()), game.lampLit(this.cx(), this.cy()));
    const litSlow = (this.lit > 0.3 && (this.type === 'whisper' || this.type === 'nurse')) ? 0.72 : 1;

    /* --- определение состояния --- */
    const sees = this.seesPlayer(game);
    const hears = this.hearsPlayer(game, 780);
    if (sees || hears) { this.alertT = 3.4; this.mode = 'chase'; this.searchT = 0; this.noiseSeek = null; }
    else if (this.alertT > 0) { this.alertT -= dt; this.mode = 'chase'; }
    else {
      /* расследование шума */
      if (game.noises.length) {
        for (const n of game.noises) {
          if (this.hearsNoise(n.x, n.y, n.r, game) && !n.done) {
            this.noiseSeek = { x: n.x, y: n.y };
            this.mode = 'investigate';
            this.searchT = 5;
          }
        }
      }
      if (this.mode === 'investigate') {
        this.searchT -= dt;
        if (!this.noiseSeek || this.searchT <= 0) { this.mode = 'patrol'; this.noiseSeek = null; }
      }
    }
    /* если игрок на другом этаже — теряем */
    if (p.floor !== this.floor && this.mode === 'chase') { this.alertT -= dt * 2; }
    /* запертая дверь с затычкой — выбиваем */
    if (this.mode === 'chase' && p.hidden === null) {
      const pin = game.pinnedDoorBetween(this, p);
      if (pin) { this.pinTarget = pin; this.breakSpeed = this.type === 'brute' ? 0.5 : 0.28; }
    }
    if (this.pinTarget && this.tryBreak(game, dt)) return true;

    const chaseSpeed = this.speed * litSlow;
    switch (this.type) {
      case 'whisper': this.aiWhisper(dt, game, chaseSpeed, sees); break;
      case 'nurse':   this.aiNurse(dt, game, chaseSpeed, sees); break;
      case 'brute':   this.aiBrute(dt, game, chaseSpeed, sees); break;
      case 'spider':  this.aiSpider(dt, game, chaseSpeed, sees); break;
      case 'double':  this.aiDouble(dt, game, chaseSpeed, sees); break;
    }
    /* удержание в границах этажа */
    this.y = clamp(this.y, 40, FLOORS[this.floor].y - this.h + 6);
    return true;
  }

  target() {
    const p = Game.player;
    if (this.mode === 'investigate' && this.noiseSeek) return this.noiseSeek;
    return { x: p.cx(), y: p.cy() };
  }
  tryTouch(p, game, cd, mul = 1) {
    if (p.dead || this.touchCd > 0 || p.hidden) return;
    if (aabb(this, p)) {
      this.touchCd = cd;
      p.takeDamage(Math.round(this.dmg * mul), game);
      p.vx += sign(p.cx() - this.cx()) * 260;
    }
  }

  aiWhisper(dt, game, sp, sees) {
    const p = game.player;
    if (this.mode === 'chase' || this.mode === 'investigate') {
      const tg = this.target();
      this.moveToward(tg.x, tg.y, sp, dt, game, { allowLadder: true });
      if (this.mode === 'chase' && this.attackCd <= 0 && Math.abs(p.cx() - this.cx()) < 180 && Math.abs(p.cy() - this.cy()) < 110 && this.floor === p.floor) {
        this.vx = sign(p.cx() - this.cx()) * 520; this.vy = -280; this.attackCd = 1.5; AudioSys.syringe();
      }
      if (this.mode === 'chase' && Math.random() < dt * 0.4) AudioSys.whisper();
    } else {
      this.patrol(dt, game, 62);
    }
    this.tryTouch(p, game, 1.1, 1.1);
  }
  aiNurse(dt, game, sp, sees) {
    const p = game.player;
    const tg = this.target();
    const chasing = this.mode === 'chase';
    const dx = tg.x - this.cx(), dy = (tg.y - 40) - this.cy();
    const d = Math.hypot(dx, dy) || 1;
    if (chasing || this.mode === 'investigate') {
      let mx = 0, my = 0;
      if (d > 360) { mx = dx / d; my = dy / d * 0.8; }
      else if (d < 220) { mx = -dx / d; my = -dy / d * 0.5; }
      else { mx = Math.cos(this.phase * 0.7) * 0.5; my = Math.sin(this.phase * 1.1) * 0.5; }
      this.vx = lerp(this.vx, mx * sp, 1 - Math.pow(0.05, dt));
      this.vy = lerp(this.vy, my * sp, 1 - Math.pow(0.05, dt));
      if (this.floor !== p.floor && this.mode === 'chase') { this.vy = lerp(this.vy, Math.sign(p.cy() - this.cy()) * sp * 0.6, dt * 2); }
      if (chasing && this.attackCd <= 0 && d < 560 && this.floor === p.floor) {
        this.attackCd = 2.3; AudioSys.scream();
        game.effects.push({ kind: 'ring', x: this.cx(), y: this.cy(), r: 10, max: 140, t: 0, dur: 0.5, color: '#c77dff' });
        game.spawnProjectile({ x: this.cx(), y: this.cy(), vx: dx / d * 320, vy: dy / d * 320, r: 12, dmg: this.dmg, san: 20, kind: 'wail', life: 2.4 });
        Camera.shake(0.15);
      }
    } else {
      this.vx = lerp(this.vx, Math.sin(this.phase * 0.5) * 34, dt * 2);
      this.vy = lerp(this.vy, Math.cos(this.phase * 0.8) * 26, dt * 2);
    }
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.y = clamp(this.y, FLOORS[this.floor].y - 400, FLOORS[this.floor].y - this.h - 6);
    this.x = lerp(this.x, clamp(this.x, this.leash[0], this.leash[1] - this.w), dt * 3);
    if (this.x <= this.leash[0] + 1 || this.x >= this.leash[1] - this.w - 1) this.face *= -1;
    if (Math.abs(this.vx) > 8) this.face = sign(this.vx);
    this.tryTouch(p, game, 1.2, 1);
  }
  aiBrute(dt, game, sp, sees) {
    const p = game.player;
    if (this.state === 'windup') {
      this.tState -= dt; this.vx *= 0.9; this.vy += 1900 * dt;
      game.moveAndCollide(this, dt, false);
      if (this.tState <= 0) {
        this.state = 'chase'; this.attackCd = 1.8;
        AudioSys.sting(); Camera.shake(0.5);
        const hx = this.cx() + this.face * 64;
        game.effects.push({ kind: 'ring', x: hx, y: this.y + this.h - 10, r: 10, max: 160, t: 0, dur: 0.4, color: '#ff5c6c' });
        Particles.dust(hx, this.y + this.h, 16);
        game.addNoise(hx, this.cy(), 420);
        if (Math.abs(p.cx() - hx) < 120 && Math.abs(p.cy() - this.cy()) < 120 && p.floor === this.floor) {
          p.takeDamage(this.dmg, game); p.vx += this.face * 400; p.vy = -320;
        }
      }
      return;
    }
    if (this.mode === 'chase' || this.mode === 'investigate') {
      const tg = this.target();
      this.moveToward(tg.x, tg.y, sp, dt, game, { allowLadder: true });
      if (this.mode === 'chase' && this.attackCd <= 0 && Math.abs(p.cx() - this.cx()) < 130 && Math.abs(p.cy() - this.cy()) < 130 && p.floor === this.floor) {
        this.state = 'windup'; this.tState = 0.5;
        AudioSys.noise(0.4, 0.2, 200, 1, 'lowpass', 0, 90);
      }
    } else this.patrol(dt, game, 34);
    this.tryTouch(p, game, 1.6, 1, 0.6);
  }
  aiSpider(dt, game, sp, sees) {
    const p = game.player;
    const chasing = this.mode === 'chase';
    if (this.onGround) {
      this.vx *= 0.86;
      this.tState -= dt;
      if (this.tState <= 0) {
        if (chasing) {
          this.tState = rand(0.32, 0.62);
          const tg = this.target();
          const dir = sign(tg.x - this.cx()) || this.face;
          const needUp = tg.y < this.cy() - 60 && this.onGround;
          this.vx = dir * rand(300, 440);
          this.vy = needUp ? -rand(700, 860) : -rand(420, 620);
          AudioSys.syringe();
        } else {
          this.tState = rand(0.9, 1.7);
          this.vx = this.face * rand(110, 210);
          this.vy = -rand(260, 420);
          if (Math.random() < 0.4) this.face *= -1;
        }
      }
    }
    this.vy += 1900 * dt;
    game.moveAndCollide(this, dt, false);
    this.tryTouch(p, game, 1.2, 1);
  }
  aiDouble(dt, game, sp, sees) {
    const p = game.player;
    const chasing = this.mode === 'chase';
    this.tState -= dt;
    if (this.tState <= 0) {
      this.tState = rand(3.5, 6);
      const d = dist(this.cx(), this.cy(), p.cx(), p.cy());
      if (d > 420 && chasing && p.floor === this.floor) {
        Particles.soul(this.cx(), this.cy(), 14);
        this.x = clamp(p.cx() + (Math.random() < 0.5 ? -1 : 1) * rand(180, 300) - this.w / 2, 30, WORLD.w - 60);
        this.y = FLOORS[this.floor].y - this.h;
        Particles.soul(this.cx(), this.cy(), 14);
        AudioSys.whisper();
      }
    }
    if (chasing || this.mode === 'investigate') {
      const tg = this.target();
      this.moveToward(tg.x, tg.y, sp, dt, game, { allowLadder: true });
      if (this.onGround && tg.y < this.cy() - 70) this.vy = -680;
      if (chasing && this.attackCd <= 0 && Math.abs(p.cx() - this.cx()) < 60 && Math.abs(p.cy() - this.cy()) < 80 && p.floor === this.floor) {
        this.attackCd = 0.9; AudioSys.swing();
        p.takeDamage(this.dmg, game); p.san = clamp(p.san - 8, 0, 100);
        game.effects.push({ kind: 'slash', x: p.cx(), y: p.cy(), t: 0, dur: 0.2, face: sign(p.cx() - this.cx()) });
      }
    } else this.patrol(dt, game, 90);
  }
  patrol(dt, game, sp) {
    this.tState -= dt;
    if (this.tState <= 0) {
      this.tState = rand(1.2, 3);
      this.face = this.cx() < this.leash[0] + 30 ? 1 : this.cx() > this.leash[1] - 30 ? -1 : (Math.random() < 0.5 ? -1 : 1);
      if (Math.random() < 0.25) { this.vy = -520; }
    }
    if (this.type === 'nurse' || this.type === 'double') {
      this.vx = lerp(this.vx, this.face * sp, dt * 2);
      this.x += this.vx * dt;
      this.y += Math.sin(this.animT * 2) * 12 * dt;
      this.x = clamp(this.x, this.leash[0], this.leash[1] - this.w);
    } else {
      this.vx = lerp(this.vx, this.face * sp, 1 - Math.pow(0.06, dt));
      this.vy += 1900 * dt;
      game.moveAndCollide(this, dt, false);
    }
  }

  /* ---------- отрисовка ---------- */
  draw(c) {
    if (this.dead) c.globalAlpha = clamp(this.dieT / 0.5, 0, 1);
    const cx = this.cx(), feet = this.y + this.h, t = this.animT;
    if (this.type !== 'nurse') ellipseShadow(c, cx, FLOORS[this.floor].y + 3, this.w * 0.45, 6, 0.45);
    if (this.lit > 0.3 && !this.dead) {
      c.save(); c.globalAlpha = 0.3 + Math.sin(t * 20) * 0.12;
      c.strokeStyle = '#ffe9b0'; c.lineWidth = 2;
      c.strokeRect(this.x - 3, this.y - 3, this.w + 6, this.h + 6);
      c.restore();
      if (Math.random() < 0.35) Particles.spark(cx + rand(-this.w / 2, this.w / 2), this.y + rand(0, this.h), 1, '#ffe9b0');
    }
    c.save();
    if (this.hitT > 0) c.globalAlpha *= 0.55;
    if (this.stunT > 0) { c.translate(rand(-3, 3), 0); }
    switch (this.type) {
      case 'whisper': this.drawWhisper(c, cx, feet, t); break;
      case 'nurse': this.drawNurse(c, cx, this.cy(), t); break;
      case 'brute': this.drawBrute(c, cx, feet, t); break;
      case 'spider': this.drawSpider(c, cx, feet, t); break;
      case 'double': this.drawDouble(c, cx, feet, t); break;
    }
    c.restore();
    if (this.hp < this.maxhp && !this.dead) {
      c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(cx - 22, this.y - 12, 44, 5);
      c.fillStyle = this.mode === 'chase' ? '#ff5c6c' : '#a31621';
      c.fillRect(cx - 22, this.y - 12, 44 * clamp(this.hp / this.maxhp, 0, 1), 5);
    }
    if (this.mode === 'chase' && !this.dead && Math.sin(t * 12) > 0.4) {
      c.fillStyle = '#ff5c6c'; c.font = '700 16px sans-serif'; c.textAlign = 'center';
      c.fillText('!', cx, this.y - 16); c.textAlign = 'left';
    }
    c.globalAlpha = 1;
  }
  drawWhisper(c, cx, feet, t) {
    const jitter = Math.sin(t * 40) * 2, f = this.face;
    c.save(); c.translate(cx, feet); c.scale(f, 1);
    c.strokeStyle = '#0a0a0a'; c.lineWidth = 3; c.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const lx = -16 + i * 11, sw = Math.sin(t * 30 + i * 1.7) * 7;
      c.beginPath(); c.moveTo(lx, -10); c.lineTo(lx + sw, 0); c.stroke();
    }
    c.fillStyle = '#0d0d14';
    c.beginPath(); c.ellipse(0, -14 + jitter * 0.5, 24, 13, 0, 0, 7); c.fill();
    c.fillStyle = '#161624';
    c.beginPath(); c.ellipse(-4, -17, 14, 8, -0.2, 0, 7); c.fill();
    c.fillStyle = '#000';
    for (let i = 0; i < 6; i++) {
      const sx = -18 + i * 8;
      c.beginPath(); c.moveTo(sx, -24); c.lineTo(sx + 4, -35 - Math.sin(t * 24 + i) * 3.5); c.lineTo(sx + 8, -24); c.fill();
    }
    c.fillStyle = '#0d0d14';
    c.beginPath(); c.ellipse(20, -16 + jitter, 11, 10, 0, 0, 7); c.fill();
    const blink = (Math.sin(t * 3.7) > 0.97) ? 0.15 : 1;
    c.fillStyle = '#f2f2e8';
    c.beginPath(); c.ellipse(22, -19 + jitter, 4, 4.5 * blink, 0, 0, 7); c.fill();
    c.beginPath(); c.ellipse(15, -16 + jitter, 2.6, 3 * blink, 0, 0, 7); c.fill();
    c.fillStyle = '#000';
    c.beginPath(); c.arc(23, -19 + jitter, 1.6 * blink, 0, 7); c.fill();
    const jaw = Math.abs(Math.sin(t * 9)) * 4;
    c.fillStyle = '#30060a';
    c.beginPath(); c.ellipse(21, -9 + jitter, 5, 2 + jaw, 0, 0, 7); c.fill();
    c.strokeStyle = '#cfc4ae'; c.lineWidth = 1;
    for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(17 + i * 2.6, -10 + jitter); c.lineTo(17 + i * 2.6, -6 + jaw + jitter); c.stroke(); }
    c.restore();
  }
  drawNurse(c, cx, cy, t) {
    const hover = Math.sin(t * 2.2) * 8, f = this.face;
    const screamOpen = this.attackCd > 1.8 ? (2.3 - this.attackCd) * 14 : 0;
    c.save(); c.translate(cx, cy + hover * 0.3);
    c.fillStyle = `rgba(210,205,195,${0.9 + Math.sin(t * 3) * 0.06})`;
    c.beginPath();
    c.moveTo(-14, -30); c.lineTo(14, -30); c.lineTo(20, 44);
    for (let i = 0; i < 6; i++) c.lineTo(14 - i * 6.5, 36 + ((i * 37 + t * 60) % 14));
    c.lineTo(-20, 44); c.closePath(); c.fill();
    c.fillStyle = 'rgba(120,10,20,0.75)';
    c.beginPath(); c.ellipse(-4, 10, 5, 9, 0.2, 0, 7); c.fill();
    c.beginPath(); c.ellipse(8, 28, 3, 5, -0.3, 0, 7); c.fill();
    c.strokeStyle = '#c9bba6'; c.lineWidth = 5; c.lineCap = 'round';
    const armW = Math.sin(t * 3) * 7;
    const hunting = this.mode === 'chase';
    c.beginPath(); c.moveTo(-10, -18); c.lineTo(-(hunting ? 34 : 26) * f, -30 + armW); c.stroke();
    c.beginPath(); c.moveTo(10, -18); c.lineTo((hunting ? 34 : 26) * f, -30 - armW); c.stroke();
    c.lineWidth = 1.6;
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      c.beginPath(); c.moveTo(s * 26 * f, -30 + (s < 0 ? armW : -armW));
      c.lineTo(s * 26 * f + s * f * 8, -36 + (s < 0 ? armW : -armW) + i * 3); c.stroke();
    }
    c.fillStyle = '#ddd3c2';
    c.beginPath(); c.ellipse(0, -44, 11, 13, 0, 0, 7); c.fill();
    c.fillStyle = '#050505';
    c.beginPath(); c.ellipse(0, -50, 13, 10, 0, Math.PI, 0); c.fill();
    for (let i = 0; i < 3; i++) {
      const sway = Math.sin(t * 2 + i * 2) * 5;
      c.fillRect(-14 + i * 5, -50, 5, 36 + sway);
      c.fillRect(5 + i * 4, -50, 5, 32 - sway);
    }
    c.fillStyle = '#e8e2d4'; c.fillRect(-9, -62, 18, 8);
    c.fillStyle = '#a31621'; c.fillRect(-2, -61, 4, 6); c.fillRect(-4, -59.5, 8, 3);
    c.fillStyle = '#000';
    c.beginPath(); c.ellipse(-4.5, -44, 3.4, 5, 0, 0, 7); c.fill();
    c.beginPath(); c.ellipse(4.5, -44, 3.4, 5, 0, 0, 7); c.fill();
    c.fillStyle = hunting ? '#ff3b3b' : '#5c0a12';
    c.beginPath(); c.arc(-4.5, -44, 1.5, 0, 7); c.fill();
    c.beginPath(); c.arc(4.5, -44, 1.5, 0, 7); c.fill();
    c.fillStyle = 'rgba(20,5,15,0.9)';
    c.fillRect(-6.5, -40, 3.5, 12); c.fillRect(3, -40, 3.5, 15);
    c.fillStyle = '#0a0208';
    c.beginPath(); c.ellipse(0, -32, 4 + screamOpen * 0.2, 3 + screamOpen + Math.abs(Math.sin(t * 7)) * 2, 0, 0, 7); c.fill();
    c.strokeStyle = '#5c0a12'; c.lineWidth = 2.4;
    c.beginPath(); c.moveTo(0, -14); c.lineTo(0, -2); c.moveTo(-5, -9); c.lineTo(5, -9); c.stroke();
    c.restore();
  }
  drawBrute(c, cx, feet, t) {
    const breathe = Math.sin(t * 1.8) * 3, f = this.face;
    const windup = this.state === 'windup';
    c.save(); c.translate(cx, feet); c.scale(f, 1);
    c.fillStyle = '#2b2530'; c.fillRect(-22, -34, 18, 34); c.fillRect(5, -34, 18, 34);
    c.fillStyle = '#1a151e'; c.fillRect(-24, -8, 22, 8); c.fillRect(3, -8, 22, 8);
    const wob = windup ? -9 : breathe;
    const step = Math.abs(this.vx) > 30 ? Math.sin(t * 5) * 3 : 0;
    c.translate(step, 0);
    c.fillStyle = '#8f8578';
    c.beginPath();
    c.moveTo(-30, -36); c.lineTo(30, -36); c.lineTo(36, -92 + wob); c.lineTo(-36, -92 + wob);
    c.closePath(); c.fill();
    c.fillStyle = '#3a3230';
    c.fillRect(-33, -70 + wob * 0.5, 66, 9); c.fillRect(-35, -48, 70, 8);
    c.fillStyle = '#8a8f96'; c.fillRect(8, -70 + wob * 0.5, 10, 9); c.fillRect(-16, -48, 10, 8);
    c.strokeStyle = '#4a2020'; c.lineWidth = 1.6; c.setLineDash([4, 3]);
    c.beginPath(); c.moveTo(-20, -90); c.lineTo(-14, -38); c.stroke();
    c.beginPath(); c.moveTo(20, -90); c.lineTo(14, -38); c.stroke();
    c.setLineDash([]);
    c.fillStyle = '#7a7063';
    c.beginPath(); c.ellipse(-38, -60, 8, 18, 0.3, 0, 7); c.fill();
    const armY = windup ? -128 : -40 + Math.sin(t * 1.8) * 4;
    c.fillStyle = '#9a8f7f';
    c.beginPath(); c.ellipse(30, armY, 13, 16, 0.2, 0, 7); c.fill();
    c.fillStyle = '#d8b89a';
    c.beginPath(); c.ellipse(32, armY + (windup ? -16 : 14), 11, 10, 0, 0, 7); c.fill();
    if (windup) { c.strokeStyle = '#ff5c6c'; c.lineWidth = 3; c.beginPath(); c.arc(32, armY - 16, 20, 0, 7); c.stroke(); }
    c.fillStyle = '#c9a184';
    c.beginPath(); c.ellipse(0, -100 + wob, 12, 11, 0, 0, 7); c.fill();
    c.fillStyle = '#2a2226'; c.fillRect(-10, -102 + wob, 20, 9);
    c.strokeStyle = '#111'; c.lineWidth = 1;
    for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(-10, -100 + i * 2.4 + wob); c.lineTo(10, -100 + i * 2.4 + wob); c.stroke(); }
    const rage = this.mode === 'chase';
    c.fillStyle = rage ? '#ff3b3b' : '#7a2020';
    c.beginPath(); c.arc(-5, -108 + wob, 2.6, 0, 7); c.arc(5, -108 + wob, 2.6, 0, 7); c.fill();
    if (rage) { c.shadowBlur = 12; c.shadowColor = '#f00'; c.fillRect(-7, -110 + wob, 14, 4); c.shadowBlur = 0; }
    c.fillStyle = '#2a2226'; c.font = '800 13px sans-serif';
    c.save(); c.translate(-9, -52 + wob * 0.4); c.scale(f, 1); c.fillText('СМ', 0, 0); c.restore();
    c.restore();
  }
  drawSpider(c, cx, feet, t) {
    const f = this.face, air = !this.onGround;
    c.save(); c.translate(cx, feet);
    c.strokeStyle = '#3a3f45'; c.lineWidth = 4; c.lineCap = 'round';
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      const bx = s * (10 + i * 8), lift = Math.sin(t * (air ? 26 : 11) + i * 2 + s) * (air ? 11 : 5);
      const kneeX = bx + s * 16, kneeY = -26 + lift, footX = bx + s * 26, footY = -2 - lift * 0.5;
      c.beginPath(); c.moveTo(bx * 0.5, -16); c.lineTo(kneeX, kneeY); c.lineTo(footX, footY); c.stroke();
      c.strokeStyle = '#c9d2d8'; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(footX, footY); c.lineTo(footX + s * 5, footY + 5); c.stroke();
      c.strokeStyle = '#3a3f45'; c.lineWidth = 4;
    }
    c.fillStyle = '#5f737e';
    c.beginPath(); c.ellipse(-8, -24, 20, 14, -0.15, 0, 7); c.fill();
    c.fillStyle = 'rgba(120,10,20,0.6)';
    c.beginPath(); c.ellipse(-12, -20, 6, 8, 0.3, 0, 7); c.fill();
    c.fillStyle = '#d8c9b4';
    c.beginPath(); c.ellipse(14 * f, -26, 12, 11, 0, 0, 7); c.fill();
    const eg = [[6, -32], [12, -34], [18, -32], [8, -27], [14, -28], [20, -27]];
    for (const [ex, ey] of eg) {
      c.fillStyle = '#fff'; c.beginPath(); c.arc(ex * f, ey, 3, 0, 7); c.fill();
      c.fillStyle = this.mode === 'chase' ? '#ff3b3b' : '#a31621';
      c.beginPath(); c.arc(ex * f, ey, 1.5, 0, 7); c.fill();
    }
    c.strokeStyle = '#8a8f96'; c.lineWidth = 3;
    const snap = Math.abs(Math.sin(t * 9)) * 5;
    c.beginPath(); c.moveTo(20 * f, -20); c.lineTo(26 * f, -12 - snap); c.stroke();
    c.beginPath(); c.moveTo(12 * f, -19); c.lineTo(16 * f, -10 - snap); c.stroke();
    c.fillStyle = 'rgba(150,220,255,0.7)'; c.fillRect(23 * f - 2, -14 - snap, 4, 5);
    c.strokeStyle = '#666'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(-8, -36); c.lineTo(-8, -52); c.lineTo(2, -52); c.stroke();
    c.fillStyle = 'rgba(200,230,255,0.5)'; c.fillRect(-2, -52, 9, 14);
    c.fillStyle = 'rgba(120,200,255,0.75)'; c.fillRect(-2, -45 + Math.sin(t * 4) * 2, 9, 7);
    c.restore();
  }
  drawDouble(c, cx, feet, t) {
    const f = this.face;
    const glitch = Math.sin(t * 13) > 0.86;
    c.save(); c.translate(cx, feet); c.scale(f, 1);
    if (glitch) c.translate(rand(-8, 8), 0);
    const bob = Math.sin(t * 5) * 2;
    c.fillStyle = '#0a0a0a';
    const sw = Math.sin(t * 8) * (Math.abs(this.vx) > 40 ? 9 : 1);
    for (const s of [-1, 1]) c.fillRect(-7 + s * 2, 30 - Math.abs(sw) * 0.3 + bob, 10, 28);
    c.fillStyle = '#101014';
    c.fillRect(-10, 8 + bob, 20, 26);
    c.save(); c.translate(-7, 20 + bob); c.scale(f, 1);
    c.fillStyle = '#e8e8e8'; c.font = '700 7px sans-serif'; c.fillText('21№', 0, 0); c.restore();
    c.fillStyle = '#e8e2e2';
    c.beginPath(); c.ellipse(1, -2 + bob, 10, 12, 0, 0, 7); c.fill();
    c.fillStyle = '#000';
    c.beginPath(); c.ellipse(0, -11 + bob, 10, 6, 0, 0, 7); c.fill();
    const blink = Math.sin(t * 4.3) > 0.94 ? 0.15 : 1;
    c.fillStyle = '#fff';
    c.fillRect(1, -4 + bob, 8, 6 * blink);
    c.fillStyle = this.mode === 'chase' ? '#000' : '#3a3a3a';
    c.beginPath(); c.arc(5, -1 + bob, 1.8, 0, 7); c.fill();
    c.fillStyle = 'rgba(0,0,0,0.85)'; c.fillRect(2, 2 + bob, 2.5, 9); c.fillRect(6.5, 2 + bob, 2.5, 12);
    c.strokeStyle = '#000'; c.lineWidth = 1.8;
    c.beginPath(); c.arc(3, 6 + bob, 7, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
    c.strokeStyle = '#e8e2e2'; c.lineWidth = 5; c.lineCap = 'round';
    const reach = Math.sin(t * 3) * 6;
    c.beginPath(); c.moveTo(0, 12 + bob); c.lineTo(-4, 44 + reach); c.stroke();
    c.beginPath(); c.moveTo(2, 12 + bob); c.lineTo(10, 46 - reach); c.stroke();
    c.restore();
    if (glitch) {
      c.save(); c.globalAlpha = 0.5; c.globalCompositeOperation = 'lighter';
      c.fillStyle = '#f0f'; c.fillRect(cx - 14, feet - 64 + rand(0, 50), 28, 3);
      c.fillStyle = '#0ff'; c.fillRect(cx - 14, feet - 64 + rand(0, 50), 28, 2);
      c.restore();
    }
  }
}

/* ================= МИНИ-БОССЫ ================= */
const MINIBOSS_DEFS = {
  orderly: { w: 92, h: 140, speed: 130, dmg: 22, sight: 700, name: 'САНИТАР-МЯСНИК', color: '#6d2b2b' },
  matron:  { w: 76, h: 124, speed: 120, dmg: 18, sight: 760, name: 'СЕСТРА МИЛОСЕРДИЯ', color: '#7a5c8c' },
  surgeon: { w: 80, h: 132, speed: 150, dmg: 24, sight: 800, name: 'ХИРУРГ БЕЗ ЛИЦА', color: '#2b5c5c' },
};

class Miniboss extends EnemyBase {
  constructor(def) {
    super();
    const d = MINIBOSS_DEFS[def.type];
    this.def = def; this.kind = 'miniboss';
    this.type = def.type; this.name = def.name;
    this.w = d.w; this.h = d.h;
    this.x = def.x - this.w / 2; this.floor = def.f;
    this.y = FLOORS[def.f].y - this.h;
    this.hp = def.hp; this.maxhp = def.hp;
    this.speed = d.speed; this.dmg = d.dmg; this.sight = d.sight;
    this.leash = def.leash;
    this.awake = false; this.state = 'idle'; this.tState = 0;
    this.phase = 1; this.mode = 'patrol';
    this.animT = rand(0, 5); this.vouching = 0;
    this.hitT = 0;
  }
  curPhase() { const k = this.hp / this.maxhp; return k > 0.6 ? 1 : k > 0.3 ? 2 : 3; }
  takeDamage(dmg, game, dir = 0) {
    if (this.dead) return;
    const bonus = this.lit > 0.35 ? 1.3 : 1;
    const total = Math.max(1, Math.round(dmg * bonus));
    const old = this.phase;
    this.wake(game, true);
    this.hitStop(total, game, dir);
    AudioSys.ghostHit();
    Floaters.add(this.cx(), this.y - 12, total, bonus > 1 ? '#ffe9b0' : '#ff9a9a', 18);
    this.phase = this.curPhase();
    if (this.phase !== old) {
      AudioSys.bossRoar(); Camera.shake(0.6);
      game.toast('☠ ' + this.name + ' впадает в ярость!', 'red');
      game.effects.push({ kind: 'ring', x: this.cx(), y: this.cy(), r: 20, max: 320, t: 0, dur: 0.7, color: '#ff5c6c' });
    }
    if (this.hp <= 0) {
      this.dead = true; this.dieT = 1.8; this.hp = 0;
      AudioSys.bossDie(); Camera.shake(0.9);
      Particles.soul(this.cx(), this.cy(), 40);
      game.onMinibossKilled(this);
    }
  }
  wake(game, alerted) {
    if (this.awake) return;
    this.awake = true;
    this.mode = 'chase'; this.alertT = 6;
    AudioSys.bossRoar(); Camera.shake(0.7);
    game.toast('☠ ' + this.name + '!', 'red');
    game.subtitle(this.def.intro, 4);
    game.bossMusic(this);
  }
  update(dt, game) {
    this.animT += dt;
    if (this.hitT > 0) this.hitT -= dt;
    if (this.stunT > 0) this.stunT -= dt;
    if (this.dead) {
      this.dieT -= dt;
      if (Math.random() < dt * 22) Particles.soul(this.cx() + rand(-40, 40), this.cy() + rand(-60, 40), 3);
      return this.dieT > 0;
    }
    const p = game.player;
    this.lit = Math.max(game.flashLit(this.cx(), this.cy()), game.lampLit(this.cx(), this.cy()));
    if (this.attackCd > 0) this.attackCd -= dt;
    if (!this.awake) {
      if (p.floor === this.floor && Math.abs(p.cx() - this.cx()) < this.def.wakeR && !p.hidden) this.wake(game, false);
      else { this.vx *= 0.9; this.vy += 1900 * dt; game.moveAndCollide(this, dt, false); return true; }
    }
    if (this.mode === 'chase' && this.alertT > 0) this.alertT -= dt;
    if (this.alertT <= 0 && !this.seesPlayer(game)) this.mode = 'search';
    if (this.seesPlayer(game)) { this.mode = 'chase'; this.alertT = 4; }
    const sp = this.speed * (this.phase === 3 ? 1.28 : this.phase === 2 ? 1.14 : 1);
    switch (this.type) {
      case 'orderly': this.aiOrderly(dt, game, sp); break;
      case 'matron': this.aiMatron(dt, game, sp); break;
      case 'surgeon': this.aiSurgeon(dt, game, sp); break;
    }
    this.y = clamp(this.y, 40, FLOORS[this.floor].y - this.h + 6);
    return true;
  }

  /* --- Санитар: разгон с каталкой, удар-волна, швыряет мусор --- */
  aiOrderly(dt, game, sp) {
    const p = game.player;
    const tg = this.mode === 'search' ? { x: (this.leash[0] + this.leash[1]) / 2, y: this.cy() } : { x: p.cx(), y: p.cy() };
    switch (this.state) {
      case 'idle': case 'chase': {
        this.moveToward(tg.x, tg.y, sp, dt, game, { allowLadder: this.mode === 'chase' });
        const d = Math.abs(p.cx() - this.cx());
        if (this.attackCd <= 0 && this.mode === 'chase' && p.floor === this.floor) {
          if (d < 130) { this.state = 'slamWind'; this.tState = 0.5; }
          else if (d > 240 && d < 700) { this.state = 'chargeWind'; this.tState = 0.55; this.chargeDir = sign(p.cx() - this.cx()); AudioSys.sting(); }
          else if (this.phase >= 2 && Math.random() < 0.5) { this.state = 'throwWind'; this.tState = 0.5; }
        }
        break;
      }
      case 'slamWind': {
        this.tState -= dt; this.vx *= 0.85; this.vy += 1900 * dt; game.moveAndCollide(this, dt, false);
        if (this.tState <= 0) {
          this.state = 'chase'; this.attackCd = 1.450;
          const hx = this.cx() + this.face * 70;
          AudioSys.sting(); Camera.shake(0.55);
          game.effects.push({ kind: 'ring', x: hx, y: this.y + this.h - 10, r: 12, max: 200, t: 0, dur: 0.45, color: '#ff5c6c' });
          Particles.dust(hx, this.y + this.h, 20);
          game.addNoise(hx, this.cy(), 480);
          game.shakeLamps(this.floor);
          if (Math.abs(p.cx() - hx) < 140 && Math.abs(p.cy() - this.cy()) < 150 && p.floor === this.floor) {
            p.takeDamage(this.dmg, game); p.vx += this.face * 480; p.vy = -340;
          }
        }
        break;
      }
      case 'chargeWind': {
        this.tState -= dt; this.vx *= 0.8; this.vy += 1900 * dt; game.moveAndCollide(this, dt, false);
        if (this.tState <= 0) { this.state = 'charge'; this.tState = 0.55; this.vx = this.chargeDir * 760; AudioSys.bossRoar(); Camera.shake(0.4); }
        break;
      }
      case 'charge': {
        this.tState -= dt;
        Particles.dust(this.cx(), this.y + this.h, 2);
        this.vy += 1900 * dt;
        game.moveAndCollide(this, dt, false);
        if (aabb(this, p) && p.iframes <= 0 && p.floor === this.floor) { p.takeDamage(this.dmg, game); p.vx += this.chargeDir * 520; p.vy = -360; }
        if (this.tState <= 0) { this.state = 'chase'; this.attackCd = 1.5; this.vx = 0; }
        break;
      }
      case 'throwWind': {
        this.tState -= dt; this.vx *= 0.9; this.vy += 1900 * dt; game.moveAndCollide(this, dt, false);
        if (this.tState <= 0) {
          this.state = 'chase'; this.attackCd = 2.0;
          AudioSys.syringe();
          for (let i = 0; i < 3; i++) {
            game.spawnProjectile({
              x: this.cx(), y: this.y + 40, vx: (sign(p.cx() - this.cx()) || 1) * rand(380, 520), vy: -rand(120, 260) - i * 40,
              r: 12, dmg: 14, san: 6, kind: 'junk', life: 3, gravity: 900,
            });
          }
        }
        break;
      }
    }
  }
  /* --- Сестра: летает, воет, зовёт шептунов, лечит себя светом? --- */
  aiMatron(dt, game, sp) {
    const p = game.player;
    const tg = this.mode === 'search' ? { x: (this.leash[0] + this.leash[1]) / 2, y: this.cy() } : { x: p.cx(), y: p.cy() - 30 };
    const dx = tg.x - this.cx(), dy = tg.y - this.cy();
    const d = Math.hypot(dx, dy) || 1;
    if (this.state === 'wail') {
      this.tState -= dt; this.vx *= 0.9;
      if (this.tState <= 0) {
        this.state = 'chase'; this.attackCd = 2.1;
        AudioSys.scream(); Camera.shake(0.3);
        for (let i = -1; i <= 1; i++) {
          const a = Math.atan2(dy, dx) + i * 0.22;
          game.spawnProjectile({ x: this.cx(), y: this.cy(), vx: Math.cos(a) * 400, vy: Math.sin(a) * 400, r: 14, dmg: 14, san: 18, kind: 'wail', life: 2.6 });
        }
        game.effects.push({ kind: 'ring', x: this.cx(), y: this.cy(), r: 14, max: 200, t: 0, dur: 0.6, color: '#c77dff' });
      }
      this.y += Math.sin(this.animT * 3) * 20 * dt;
      return;
    }
    let mx = 0, my = 0;
    if (d > 340) { mx = dx / d; my = dy / d * 0.85; }
    else if (d < 230) { mx = -dx / d; my = -dy / d * 0.6; }
    else { mx = Math.cos(this.animT * 0.8) * 0.6; my = Math.sin(this.animT * 1.2) * 0.6; }
    this.vx = lerp(this.vx, mx * sp, 1 - Math.pow(0.04, dt));
    this.vy = lerp(this.vy, my * sp, 1 - Math.pow(0.04, dt));
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.y = clamp(this.y, FLOORS[this.floor].y - 420, FLOORS[this.floor].y - this.h - 6);
    this.x = clamp(this.x, this.leash[0], this.leash[1] - this.w);
    if (Math.abs(this.vx) > 8) this.face = sign(this.vx);
    if (this.attackCd <= 0 && this.mode === 'chase' && p.floor === this.floor) {
      this.attackCd = 2.4;
      if (d < 520) { this.state = 'wail'; this.tState = 0.7; }
      else if (this.phase >= 2) { // призыв шептунов
        this.attackCd = 6;
        game.toast('☠ Сестра зовёт своих детей…', 'red');
        for (let i = 0; i < 2; i++) game.spawnGhost('whisper', clamp(this.cx() + rand(-200, 200), 40, WORLD.w - 60), this.floor, this.leash.slice());
      }
    }
    if (aabb(this, p) && this.touchCd <= 0 && p.floor === this.floor) {
      this.touchCd = 1.2; p.takeDamage(this.dmg, game); p.vx += sign(p.cx() - this.cx()) * 300;
      p.san = clamp(p.san - 12, 0, 100); Floaters.add(p.cx(), p.y - 14, '-12 RASS', '#c77dff', 15);
    }
  }
  /* --- Хирург: телепорт, веер скальпелей, невидимость на 1.2с --- */
  aiSurgeon(dt, game, sp) {
    const p = game.player;
    const tg = this.mode === 'search' ? { x: (this.leash[0] + this.leash[1]) / 2, y: this.cy() } : { x: p.cx(), y: p.cy() };
    switch (this.state) {
      case 'idle': case 'chase': {
        this.moveToward(tg.x, tg.y, sp, dt, game, { allowLadder: this.mode === 'chase' });
        if (this.attackCd <= 0 && this.mode === 'chase' && p.floor === this.floor) {
          const d = Math.abs(p.cx() - this.cx());
          const r = Math.random();
          if (r < 0.4) { this.state = 'scalpel'; this.tState = 0.45; }
          else if (r < 0.72) { this.state = 'blink'; this.tState = 0.25; }
          else { this.state = 'vanish'; this.tState = 1.1; }
        }
        break;
      }
      case 'scalpel': {
        this.tState -= dt; this.vx *= 0.9; this.vy += 1900 * dt; game.moveAndCollide(this, dt, false);
        if (this.tState <= 0) {
          this.state = 'chase'; this.attackCd = 1.5;
          AudioSys.syringe();
          const n = this.phase >= 2 ? 5 : 3;
          const base = Math.atan2(p.cy() - (this.y + 60), p.cx() - this.cx());
          for (let i = 0; i < n; i++) {
            const a = base + (i - (n - 1) / 2) * 0.2;
            game.spawnProjectile({ x: this.cx(), y: this.y + 60, vx: Math.cos(a) * 470, vy: Math.sin(a) * 470, r: 8, dmg: 15, san: 4, kind: 'scalpel', life: 3 });
          }
        }
        break;
      }
      case 'blink': {
        this.tState -= dt;
        if (this.tState <= 0) {
          this.state = 'chase'; this.attackCd = 2.2;
          Particles.soul(this.cx(), this.cy(), 16);
          const side = Math.random() < 0.5 ? -1 : 1;
          this.x = clamp(p.cx() + side * rand(70, 120) - this.w / 2, this.leash[0], this.leash[1] - this.w);
          this.y = FLOORS[this.floor].y - this.h;
          Particles.soul(this.cx(), this.cy(), 16);
          AudioSys.whisper();
          game.effects.push({ kind: 'slash', x: this.cx(), y: this.cy(), t: 0, dur: 0.25, face: -side });
          p.takeDamage(10, game);
          p.san = clamp(p.san - 10, 0, 100);
        }
        break;
      }
      case 'vanish': {
        this.tState -= dt;
        this.invisible = true;
        this.moveToward(tg.x, tg.y, sp * 1.2, dt, game, {});
        if (this.tState <= 0) { this.invisible = false; this.state = 'chase'; this.attackCd = 2.4; }
        break;
      }
    }
  }

  draw(c) {
    if (this.dead) c.globalAlpha = clamp(this.dieT / 1.8, 0, 1);
    if (this.invisible && !this.dead) c.globalAlpha *= 0.18;
    const cx = this.cx(), feet = this.y + this.h, t = this.animT, f = this.face;
    ellipseShadow(c, cx, FLOORS[this.floor].y + 3, this.w * 0.5, 8, 0.5);
    if (this.lit > 0.3) {
      c.save(); c.globalAlpha = 0.28; c.strokeStyle = '#ffe9b0'; c.lineWidth = 3;
      c.strokeRect(this.x - 4, this.y - 4, this.w + 8, this.h + 8); c.restore();
    }
    c.save(); c.translate(cx, feet); c.scale(f, 1);
    if (this.hitT > 0) c.globalAlpha *= 0.6;
    const breathe = Math.sin(t * 2) * 3;
    const rage = this.phase >= 2;
    if (this.type === 'orderly') this.drawOrderly(c, t, breathe, rage);
    else if (this.type === 'matron') this.drawMatron(c, t, breathe, rage);
    else this.drawSurgeon(c, t, breathe, rage);
    c.restore();
    if (this.hp < this.maxhp && !this.dead) {
      c.fillStyle = 'rgba(0,0,0,0.65)'; c.fillRect(cx - 46, this.y - 18, 92, 8);
      c.fillStyle = rage ? '#ff3b3b' : '#a31621';
      c.fillRect(cx - 46, this.y - 18, 92 * clamp(this.hp / this.maxhp, 0, 1), 8);
      c.strokeStyle = '#2a2a2a'; c.lineWidth = 1; c.strokeRect(cx - 46, this.y - 18, 92, 8);
    }
    c.globalAlpha = 1;
  }
  drawOrderly(c, t, breathe, rage) {
    const step = Math.abs(this.vx) > 30 ? Math.sin(t * 7) * 5 : 0;
    c.translate(step, 0);
    c.fillStyle = '#1e1a18'; c.fillRect(-30, -46, 26, 46); c.fillRect(6, -46, 26, 46);
    c.fillStyle = '#0f0d0c'; c.fillRect(-34, -10, 30, 10); c.fillRect(4, -10, 30, 10);
    c.fillStyle = rage ? '#7a3a3a' : '#8f8578';
    c.beginPath();
    c.moveTo(-38, -50); c.lineTo(38, -50); c.lineTo(44, -118 + breathe); c.lineTo(-44, -118 + breathe);
    c.closePath(); c.fill();
    c.fillStyle = 'rgba(120,15,22,0.85)';
    c.beginPath();
    c.moveTo(-22, -52); c.lineTo(22, -52); c.lineTo(26, -114 + breathe); c.lineTo(-26, -114 + breathe);
    c.closePath(); c.fill();
    c.fillStyle = '#3a3230';
    c.fillRect(-42, -86 + breathe * 0.5, 84, 10);
    c.fillStyle = '#8a8f96'; c.fillRect(16, -86 + breathe * 0.5, 12, 10);
    c.fillStyle = '#d8b89a';
    c.beginPath(); c.ellipse(46, -74, 13, 14, 0.2, 0, 7); c.fill();
    c.beginPath(); c.ellipse(-46, -74, 13, 14, -0.2, 0, 7); c.fill();
    c.save(); c.translate(52, -84); c.rotate(this.state === 'charge' ? 0.5 : this.state === 'slamWind' ? -1.1 : 0.2);
    c.fillStyle = '#4a4a4a'; c.fillRect(0, -5, 54, 10); c.fillStyle = '#6a6a6a'; c.fillRect(48, -9, 10, 18); c.restore();
    c.fillStyle = rage ? '#b03030' : '#a89a8a';
    c.beginPath(); c.ellipse(0, -134 + breathe, 15, 14, 0, 0, 7); c.fill();
    c.fillStyle = '#2a2226'; c.fillRect(-13, -138 + breathe, 26, 11);
    c.strokeStyle = '#111'; c.lineWidth = 1.4;
    for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(-13, -136 + i * 2.2 + breathe); c.lineTo(13, -136 + i * 2.2 + breathe); c.stroke(); }
    c.fillStyle = rage ? '#ff2b2b' : '#8a2020';
    c.beginPath(); c.arc(-6, -146 + breathe, 3.4, 0, 7); c.arc(6, -146 + breathe, 3.4, 0, 7); c.fill();
    c.shadowBlur = 14; c.shadowColor = '#f00';
    c.fillStyle = rage ? '#f55' : '#c33';
    c.fillRect(-9, -149 + breathe, 18, 5); c.shadowBlur = 0;
    c.fillStyle = '#e8dcc8'; c.font = '800 12px sans-serif';
    c.save(); c.translate(-20, -70); c.fillText('САНИТАР', 0, 0); c.restore();
  }
  drawMatron(c, t, breathe, rage) {
    const hover = Math.sin(t * 2) * 10;
    c.translate(0, hover * 0.4);
    c.fillStyle = `rgba(226,220,236,0.92)`;
    c.beginPath();
    c.moveTo(-18, -40); c.lineTo(18, -40); c.lineTo(26, 52);
    for (let i = 0; i < 7; i++) c.lineTo(18 - i * 6, 44 + ((i * 41 + t * 70) % 16));
    c.lineTo(-26, 52); c.closePath(); c.fill();
    c.fillStyle = 'rgba(90,20,110,0.35)';
    c.beginPath(); c.ellipse(-6, 14, 8, 14, 0.2, 0, 7); c.fill();
    c.fillStyle = 'rgba(120,10,20,0.6)';
    c.beginPath(); c.ellipse(10, 30, 5, 9, -0.3, 0, 7); c.fill();
    const armW = Math.sin(t * 2.4) * 9;
    c.strokeStyle = '#d8cfe0'; c.lineWidth = 7; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-14, -24); c.lineTo(-40, -44 + armW); c.lineTo(-48, -14 + armW); c.stroke();
    c.beginPath(); c.moveTo(14, -24); c.lineTo(40, -44 - armW); c.lineTo(48, -14 - armW); c.stroke();
    c.strokeStyle = '#c9d2d8'; c.lineWidth = 2;
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
      c.beginPath(); c.moveTo(s * 48, -14 + (s < 0 ? armW : -armW));
      c.lineTo(s * 48 + s * 10, -22 + (s < 0 ? armW : -armW) + i * 5); c.stroke();
    }
    c.fillStyle = '#e6dcf0';
    c.beginPath(); c.ellipse(0, -58, 14, 16, 0, 0, 7); c.fill();
    c.fillStyle = '#1a0a20';
    c.beginPath(); c.ellipse(0, -64, 16, 12, 0, Math.PI, 0); c.fill();
    for (let i = 0; i < 4; i++) {
      const sway = Math.sin(t * 1.7 + i * 1.9) * 7;
      c.fillRect(-18 + i * 5, -64, 5, 46 + sway);
      c.fillRect(6 + i * 4, -64, 5, 42 - sway);
    }
    c.fillStyle = '#f4f0ff';
    c.fillRect(-11, -80, 22, 9);
    c.fillStyle = '#a31621'; c.fillRect(-2.5, -79, 5, 7); c.fillRect(-5, -77, 10, 3.5);
    c.fillStyle = '#000';
    c.beginPath(); c.ellipse(-5.5, -60, 4, 6, 0, 0, 7); c.fill();
    c.beginPath(); c.ellipse(5.5, -60, 4, 6, 0, 0, 7); c.fill();
    c.fillStyle = rage ? '#ff3b3b' : '#7b2fbf';
    c.beginPath(); c.arc(-5.5, -60, 2, 0, 7); c.fill(); c.beginPath(); c.arc(5.5, -60, 2, 0, 7); c.fill();
    c.fillStyle = '#0a0208';
    const open = this.state === 'wail' ? 10 : 4 + Math.abs(Math.sin(t * 6)) * 3;
    c.beginPath(); c.ellipse(0, -46, 5, open, 0, 0, 7); c.fill();
    c.strokeStyle = '#5c0a12'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(0, -22); c.lineTo(0, -6); c.moveTo(-7, -16); c.lineTo(7, -16); c.stroke();
    c.fillStyle = '#c77dff'; c.font = '800 12px sans-serif';
    c.save(); c.translate(-26, -34); c.fillText('СЕСТРА', 0, 0); c.restore();
  }
  drawSurgeon(c, t, breathe, rage) {
    const step = Math.abs(this.vx) > 30 ? Math.sin(t * 9) * 4 : 0;
    c.translate(step, 0);
    c.fillStyle = '#16221f'; c.fillRect(-24, -44, 20, 44); c.fillRect(4, -44, 20, 44);
    c.fillStyle = '#0d1512'; c.fillRect(-27, -9, 24, 9); c.fillRect(3, -9, 24, 9);
    c.fillStyle = rage ? '#2f6b63' : '#cfd8d4';
    c.beginPath();
    c.moveTo(-32, -48); c.lineTo(32, -48); c.lineTo(38, -116 + breathe); c.lineTo(-38, -116 + breathe);
    c.closePath(); c.fill();
    c.fillStyle = 'rgba(120,15,22,0.8)';
    c.beginPath();
    c.moveTo(-16, -50); c.lineTo(16, -50); c.lineTo(20, -112 + breathe); c.lineTo(-20, -112 + breathe);
    c.closePath(); c.fill();
    c.strokeStyle = '#7a9090'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(-24, -100 + breathe); c.lineTo(24, -100 + breathe); c.stroke();
    c.strokeStyle = '#c9d2d8'; c.lineWidth = 4; c.lineCap = 'round';
    const armW = this.state === 'scalpel' ? -70 : Math.sin(t * 3) * 8;
    c.beginPath(); c.moveTo(-24, -100 + breathe); c.lineTo(-46, -80); c.lineTo(-52, -50 + armW * 0.4); c.stroke();
    c.beginPath(); c.moveTo(24, -100 + breathe); c.lineTo(46, -80); c.lineTo(54, -56 - armW * 0.5); c.stroke();
    c.fillStyle = '#dfe8ee';
    c.save(); c.translate(56, -58 - armW * 0.5); c.rotate(-0.4 + armW * 0.01);
    c.fillRect(0, -2, 30, 4); c.restore();
    for (let i = 0; i < 3; i++) {
      const ex = -50 + i * 5;
      c.fillStyle = '#b8c4c8'; c.fillRect(ex, -54 + armW * 0.4 + i * 3, 3, 22);
    }
    // голова: маска-зеркало
    c.fillStyle = '#b9c6c6';
    c.beginPath(); c.ellipse(0, -132 + breathe, 15, 16, 0, 0, 7); c.fill();
    c.fillStyle = '#7d8f8f'; c.fillRect(-16, -136 + breathe, 32, 8);
    const mg = c.createLinearGradient(-12, -134, 12, -118);
    mg.addColorStop(0, '#9fb6c4'); mg.addColorStop(0.5, '#e8f4ff'); mg.addColorStop(1, '#6f8898');
    c.fillStyle = mg;
    c.beginPath(); c.ellipse(0, -128 + breathe, 12, 13, 0, 0, 7); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(-9, -134 + breathe); c.lineTo(5, -120 + breathe); c.stroke();
    // отражение в маске — игрок!
    c.fillStyle = 'rgba(20,20,30,0.75)';
    c.beginPath(); c.ellipse(3, -127 + breathe, 3.4, 4.6, 0, 0, 7); c.fill();
    c.fillStyle = rage ? '#ff3b3b' : '#8fd0ff';
    c.beginPath(); c.arc(3, -128 + breathe, 1.4, 0, 7); c.fill();
    c.fillStyle = '#c9d2d8'; c.font = '800 11px sans-serif';
    c.save(); c.translate(-26, -70); c.fillText('ХИРУРГ', 0, 0); c.restore();
  }
}

/* ================= БОСС: ГЛАВВРАЧ ТАМИК ================= */
class Boss extends EnemyBase {
  constructor(x) {
    super();
    this.kind = 'boss'; this.type = 'boss';
    this.w = 96; this.h = 156;
    this.x = x; this.floor = BOSS_DEF.f;
    this.y = FLOORS[this.floor].y - this.h;
    this.hp = BOSS_DEF.hp; this.maxhp = BOSS_DEF.hp;
    this.face = -1; this.state = 'intro'; this.tState = 2.4;
    this.phase = 1; this.leash = BOSS_DEF.leash;
    this.dashDir = 0;
  }
  curPhase() { const k = this.hp / this.maxhp; return k > 0.66 ? 1 : k > 0.33 ? 2 : 3; }
  takeDamage(dmg, game, dir = 0) {
    if (this.dead || this.state === 'intro') return;
    const bonus = this.lit > 0.3 ? 1.35 : 1;
    const total = Math.round(dmg * bonus);
    const old = this.phase;
    this.hitStop(total, game, 0);
    AudioSys.ghostHit();
    Floaters.add(this.cx(), this.y - 10, total, '#ff5c6c', 17);
    this.phase = this.curPhase();
    if (this.phase !== old) {
      AudioSys.bossRoar(); Camera.shake(0.8);
      game.toast(this.phase === 2 ? '☠ Тамик срывает халат! «СЕСТРА! ДЕРЖИ ЕГО!»' : '☠ «ДОЗА ТРИ! ДОЗА ТРИ!!!»', 'red');
      game.effects.push({ kind: 'ring', x: this.cx(), y: this.cy(), r: 20, max: 340, t: 0, dur: 0.7, color: '#ff5c6c' });
      game.shakeLamps(this.floor);
      game.summonMinions(this.cx(), this.phase);
    }
    if (this.hp <= 0) {
      this.hp = 0; this.dead = true; this.dieT = 2.6;
      AudioSys.bossDie(); Camera.shake(1);
      game.onBossDeath();
    }
  }
  update(dt, game) {
    this.animT += dt;
    if (this.hitT > 0) this.hitT -= dt;
    if (this.stunT > 0) this.stunT -= dt;
    if (this.dead) {
      this.dieT -= dt;
      if (Math.random() < dt * 24) Particles.soul(this.cx() + rand(-46, 46), this.cy() + rand(-70, 50), 3);
      return this.dieT > 0;
    }
    const p = game.player;
    this.lit = Math.max(game.flashLit(this.cx(), this.cy()), game.lampLit(this.cx(), this.cy()));
    if (this.attackCd > 0) this.attackCd -= dt;
    if (this.state !== 'intro') { this.face = p.cx() >= this.cx() ? 1 : -1; this.mode = 'chase'; }
    const speed = this.phase === 3 ? 200 : this.phase === 2 ? 158 : 120;
    switch (this.state) {
      case 'intro':
        this.tState -= dt; this.vx *= 0.9;
        if (this.tState <= 0) { this.state = 'chase'; AudioSys.bossRoar(); Camera.shake(0.6); }
        break;
      case 'chase': {
        this.moveToward(p.cx(), p.cy(), speed, dt, game, { allowLadder: false, noPhase: true });
        this.x = clamp(this.x, this.leash[0], this.leash[1] - this.w);
        if (this.attackCd <= 0 && !p.dead && p.floor === this.floor) {
          const d = Math.abs(p.cx() - this.cx()), r = Math.random();
          if (d < 160) { this.state = 'windup'; this.tState = 0.45; }
          else if (this.phase >= 2 && d > 240 && d < 700 && r < 0.4) { this.state = 'dashTel'; this.tState = 0.55; this.dashDir = sign(p.cx() - this.cx()); AudioSys.sting(); }
          else if (r < 0.6) { this.state = 'throw'; this.tState = 0.5; }
          else if (this.phase >= 2 && game.ghosts.length < 5) { this.state = 'summon'; this.tState = 0.9; AudioSys.scream(); }
          else if (this.phase >= 3 && d < 460) { this.state = 'nova'; this.tState = 0.75; AudioSys.bossRoar(); }
          else { this.state = 'throw'; this.tState = 0.5; }
        }
        break;
      }
      case 'windup':
        this.tState -= dt; this.vx *= 0.9; this.vy += 1900 * dt; game.moveAndCollide(this, dt, false);
        if (this.tState <= 0) {
          this.state = 'chase'; this.attackCd = this.phase >= 3 ? 0.7 : 1.2;
          AudioSys.swing(); Camera.shake(0.4);
          game.effects.push({ kind: 'slash', x: this.cx() + this.face * 78, y: this.cy(), t: 0, dur: 0.22, face: this.face, big: true });
          if (Math.abs(p.cx() - (this.cx() + this.face * 78)) < 130 && Math.abs(p.cy() - this.cy()) < 140) {
            p.takeDamage(26, game); p.vx += this.face * 440; p.vy = -300;
          }
        }
        break;
      case 'throw': {
        this.tState -= dt; this.vx *= 0.9; this.vy += 1900 * dt; game.moveAndCollide(this, dt, false);
        if (this.tState <= 0) {
          this.state = 'chase'; this.attackCd = this.phase >= 3 ? 0.95 : 1.5;
          AudioSys.syringe();
          const n = this.phase >= 3 ? 5 : 3;
          const base = Math.atan2(p.cy() - (this.y + 60), p.cx() - this.cx());
          for (let i = 0; i < n; i++) {
            const a = base + (i - (n - 1) / 2) * 0.16;
            game.spawnProjectile({ x: this.cx(), y: this.y + 60, vx: Math.cos(a) * 400, vy: Math.sin(a) * 400, r: 8, dmg: 13, san: 8, kind: 'syringe', life: 3 });
          }
        }
        break;
      }
      case 'dashTel':
        this.tState -= dt; this.vx = 0;
        if (this.tState <= 0) { this.state = 'dash'; this.tState = 0.5; this.vx = this.dashDir * 740; AudioSys.bossRoar(); Camera.shake(0.5); }
        break;
      case 'dash': {
        this.tState -= dt;
        Particles.dust(this.cx(), this.y + this.h, 2);
        this.vy += 1900 * dt;
        game.moveAndCollide(this, dt, false);
        this.x = clamp(this.x, this.leash[0], this.leash[1] - this.w);
        if (aabb(this, p) && p.iframes <= 0) { p.takeDamage(24, game); p.vx += this.dashDir * 520; p.vy = -340; }
        if (this.tState <= 0) { this.state = 'chase'; this.attackCd = 1.1; this.vx = 0; }
        break;
      }
      case 'summon':
        this.tState -= dt; this.vx *= 0.9; this.vy += 1900 * dt; game.moveAndCollide(this, dt, false);
        if (this.tState <= 0) { this.state = 'chase'; this.attackCd = 2.0; game.summonMinions(this.cx(), 2); }
        break;
      case 'nova':
        this.tState -= dt; this.vx *= 0.9; this.vy += 1900 * dt; game.moveAndCollide(this, dt, false);
        if (this.tState <= 0) {
          this.state = 'chase'; this.attackCd = 2.2;
          AudioSys.scream(); Camera.shake(0.7);
          game.effects.push({ kind: 'ring', x: this.cx(), y: this.cy(), r: 20, max: 440, t: 0, dur: 0.8, color: '#c77dff', dmg: 11, san: 30 });
        }
        break;
    }
    return true;
  }
  draw(c) {
    if (this.dead) c.globalAlpha = clamp(this.dieT / 2.6, 0, 1);
    const cx = this.cx(), feet = this.y + this.h, t = this.animT, f = this.face;
    ellipseShadow(c, cx, feet + 3, 55, 9, 0.5);
    if (this.lit > 0.3 && !this.dead) {
      c.save(); c.globalAlpha = 0.3; c.strokeStyle = '#ffe9b0'; c.lineWidth = 3;
      c.strokeRect(this.x - 4, this.y - 4, this.w + 8, this.h + 8); c.restore();
    }
    c.save(); c.translate(cx, feet); c.scale(f, 1);
    if (this.hitT > 0) c.globalAlpha *= 0.65;
    const breathe = Math.sin(t * 2) * 3, rage = this.phase >= 3;
    c.fillStyle = '#1c1c22';
    const step = Math.abs(this.vx) > 30 ? Math.sin(t * 6) * 8 : 0;
    c.fillRect(-24, -40, 20, 40 - Math.abs(step) * 0.3);
    c.fillRect(4, -40, 20, 40 - Math.abs(step) * 0.3);
    c.fillStyle = '#0a0a0a'; c.fillRect(-28, -10, 26, 10); c.fillRect(2, -10, 26, 10);
    const coat = rage ? '#6b5a5a' : '#cfd2d4';
    c.fillStyle = coat;
    c.beginPath();
    c.moveTo(-30, -42); c.lineTo(30, -42); c.lineTo(38, -120 + breathe); c.lineTo(-38, -120 + breathe);
    c.closePath(); c.fill();
    c.fillStyle = rage ? '#5c0a12' : 'rgba(140,15,25,0.85)';
    c.beginPath();
    c.moveTo(-16, -44); c.lineTo(16, -44); c.lineTo(20, -116 + breathe); c.lineTo(-20, -116 + breathe);
    c.closePath(); c.fill();
    c.fillStyle = '#3d0510';
    for (let i = 0; i < 4; i++) { c.beginPath(); c.ellipse(-10 + i * 7, -60 - i * 12, 3, 6, 0, 0, 7); c.fill(); }
    c.strokeStyle = '#222'; c.lineWidth = 3;
    c.beginPath(); c.arc(0, -108 + breathe, 12, 0.3, Math.PI - 0.3); c.stroke();
    c.fillStyle = '#f2f2f2'; c.fillRect(-34, -100 + breathe, 26, 12);
    c.save(); c.translate(-32, -91 + breathe); c.scale(f, 1);
    c.fillStyle = '#a31621'; c.font = '800 8px sans-serif'; c.fillText('ТАМИК', 0, 0); c.restore();
    const wind = this.state === 'windup' ? -50 : Math.sin(t * 2) * 6;
    c.strokeStyle = coat; c.lineWidth = 12; c.lineCap = 'round';
    c.beginPath(); c.moveTo(20, -110 + breathe); c.lineTo(44, -80 + wind); c.stroke();
    c.fillStyle = '#d8b89a'; c.beginPath(); c.arc(44, -78 + wind, 8, 0, 7); c.fill();
    c.fillStyle = '#dfe8ee';
    c.save(); c.translate(44, -78 + wind); c.rotate(wind > -10 ? 0.7 : -0.6);
    c.fillRect(0, -2, 34, 5); c.fillStyle = '#333'; c.fillRect(-10, -2.5, 12, 6); c.restore();
    c.strokeStyle = '#8a8f96'; c.lineWidth = 10;
    c.beginPath(); c.moveTo(-20, -110 + breathe); c.lineTo(-42, -88); c.stroke();
    c.fillStyle = 'rgba(180,230,255,0.55)'; c.fillRect(-52, -96, 12, 26);
    c.fillStyle = 'rgba(120,200,120,0.85)'; c.fillRect(-52, -84, 12, 14);
    c.fillStyle = '#c9d2d8'; c.fillRect(-49, -70, 5, 14);
    c.fillStyle = '#d8b89a';
    c.beginPath(); c.ellipse(0, -136 + breathe, 15, 17, 0, 0, 7); c.fill();
    c.fillStyle = '#2a2a2a'; c.fillRect(-15, -150 + breathe, 30, 6);
    const lampG = c.createRadialGradient(6, -143 + breathe, 1, 6, -143 + breathe, 14);
    lampG.addColorStop(0, '#fff'); lampG.addColorStop(1, 'rgba(255,240,200,0)');
    c.fillStyle = lampG; c.beginPath(); c.arc(6, -143 + breathe, 14, 0, 7); c.fill();
    c.fillStyle = rage ? '#ff3b3b' : '#1a1a1a';
    c.beginPath(); c.arc(-3, -134 + breathe, 2.8, 0, 7); c.fill();
    c.beginPath(); c.arc(9, -134 + breathe, 2.4, 0, 7); c.fill();
    c.fillStyle = '#3a3a3a'; c.fillRect(-9, -127 + breathe, 14, 3);
    c.fillStyle = '#2a0808';
    const grin = rage ? 7 : 4;
    c.beginPath(); c.ellipse(2, -122 + breathe, 7, grin, 0, 0.1, Math.PI - 0.1); c.fill();
    c.fillStyle = '#fff';
    for (let i = 0; i < 4; i++) c.fillRect(-3 + i * 3.4, -123 + breathe, 2.4, 3);
    c.restore();
    c.globalAlpha = 1;
  }
}

/* ================= МЕБЕЛЬ ================= */
class Furniture {
  constructor(def) {
    Object.assign(this, def);
    this.style = {
      locker: 'swing', cabinet: 'swing', nightstand: 'drawer', bed: 'cover',
      shelf: 'pull', gurney: 'pull', fridge: 'swing', crib: 'cover',
      washer: 'swing', table: 'pull', crate: 'pull', desk: 'drawer', machine: 'swing',
    }[this.type] || 'pull';
    this.anim = 0;
    this.seed = this.x * 7 + this.y;
    this.hiddenUsed = false;
  }
  cx() { return this.x + this.w / 2; }
  canHide() { return this.type === 'locker' && !this.opened; }
  label() {
    const n = {
      cabinet: 'шкафчик', nightstand: 'тумбочку', bed: 'койку', locker: 'шкаф', shelf: 'стеллаж',
      gurney: 'каталку', fridge: 'холодильник', crib: 'кроватку', washer: 'стиральную машину',
      table: 'стол', crate: 'ящик', desk: 'стол', machine: 'аппарат',
    }[this.type] || 'мебель';
    return this.opened ? `Пусто… (${n})` : `Обыскать: ${n}`;
  }
  draw(c, t) {
    const x = this.x, y = this.y, w = this.w, h = this.h;
    const open = this.opened, a = this.anim;
    ellipseShadow(c, x + w / 2, FLOORS[this.floor].y + 3, w * 0.55, 5, 0.4);
    switch (this.type) {
      case 'cabinet': {
        c.fillStyle = '#4a3b28'; c.fillRect(x, y, w, h);
        c.fillStyle = '#5a4a34'; c.fillRect(x + 4, y + 4, w - 8, h - 8);
        c.fillStyle = '#2a2118'; c.fillRect(x + w / 2 - 1, y + 4, 2, h - 8);
        if (!open) {
          c.fillStyle = '#241c12'; c.fillRect(x + 8, y + 10, w - 16, h - 20);
          const r = mulberry32(this.seed);
          c.fillStyle = 'rgba(150,200,220,0.5)';
          for (let i = 0; i < 6; i++) c.fillRect(x + 12 + r() * (w - 26), y + 20 + r() * (h - 40), 5, 12);
        }
        c.fillStyle = '#8a8f96'; c.fillRect(x + w / 2 - 8, y + h / 2, 4, 10); c.fillRect(x + w / 2 + 4, y + h / 2, 4, 10);
        this.drawSwingDoor(c, x, y, w, h, a, 1);
        break;
      }
      case 'locker': {
        c.fillStyle = '#37474f'; c.fillRect(x, y, w, h);
        c.fillStyle = '#2b383f'; c.fillRect(x + 4, y + 4, w - 8, h - 8);
        c.fillStyle = '#1a2327';
        for (let i = 0; i < 5; i++) c.fillRect(x + 10, y + 12 + i * 8, w - 20, 3);
        c.fillStyle = '#8a8f96'; c.fillRect(x + w / 2 - 4, y + h / 2, 5, 14);
        c.fillStyle = 'rgba(120,10,20,0.5)'; c.beginPath(); c.ellipse(x + w - 12, y + h - 14, 5, 9, 0.2, 0, 7); c.fill();
        this.drawSwingDoor(c, x, y, w, h, a, -1);
        break;
      }
      case 'nightstand': {
        c.fillStyle = '#3d3226'; c.fillRect(x, y, w, h);
        c.fillStyle = '#2a231a'; c.fillRect(x + 6, y + 8, w - 12, 18);
        c.fillStyle = '#2a231a'; c.fillRect(x + 6, y + 32, w - 12, 20);
        // выехавший ящик
        const dy = a * 16;
        c.fillStyle = '#4a3b28'; c.fillRect(x + 6 - 2, y + 8 + dy, w - 12 + 4, 18);
        c.fillStyle = '#0a0805'; c.fillRect(x + 8, y + 10 + dy, w - 16, 14);
        c.fillStyle = '#8a8f96'; c.beginPath(); c.arc(x + w / 2, y + 17 + dy, 3, 0, 7); c.fill();
        if (open) { c.fillStyle = '#0a0805'; c.fillRect(x + 4, y, w - 8, h); }
        c.beginPath(); c.arc(x + w / 2, y + 42, 3, 0, 7); c.fill();
        c.fillStyle = 'rgba(180,220,230,0.4)'; c.fillRect(x + 10, y - 12, 10, 12);
        break;
      }
      case 'desk': {
        c.fillStyle = '#3a2e22'; c.fillRect(x, y, w, h);
        c.fillStyle = '#4a3b2c'; c.fillRect(x - 4, y - 8, w + 8, 12);
        c.fillStyle = '#2a231a';
        c.fillRect(x + 8, y + 12, w / 2 - 14, 24 + a * 14);
        c.fillRect(x + w / 2 + 6, y + 12, w / 2 - 14, 24);
        c.fillStyle = '#8a8f96';
        c.beginPath(); c.arc(x + w / 4 + 2, y + 24 + a * 7, 3, 0, 7); c.fill();
        c.beginPath(); c.arc(x + w * 0.75, y + 24, 3, 0, 7); c.fill();
        // лампа на столе
        c.strokeStyle = '#2a2a2a'; c.lineWidth = 3;
        c.beginPath(); c.moveTo(x + w - 26, y - 8); c.lineTo(x + w - 26, y - 30); c.lineTo(x + w - 12, y - 34); c.stroke();
        c.fillStyle = '#3d4a2e'; c.beginPath(); c.ellipse(x + w - 12, y - 34, 9, 6, -0.4, 0, 7); c.fill();
        break;
      }
      case 'bed': {
        c.fillStyle = '#3a3f45'; c.fillRect(x, y + 10, w, 8);
        c.fillRect(x + 4, y - 34, 6, 44 + h - 10); c.fillRect(x + w - 10, y - 34, 6, 44 + h - 10);
        c.fillRect(x + 4, y - 34, w - 8, 6);
        c.fillStyle = open ? '#9a9484' : '#b8b2a2'; c.fillRect(x, y + 2 + a * 3, w, 14);
        c.fillStyle = '#7d8894'; c.fillRect(x + w * 0.4, y + 2, w * 0.6, 14 - a * 6);
        c.fillStyle = '#cfc8b8'; c.beginPath(); c.ellipse(x + 22, y + a * 3, 18, 7, 0, 0, 7); c.fill();
        if (!open && this.seed % 3 === 0) {
          c.fillStyle = 'rgba(60,60,66,0.85)';
          c.beginPath(); c.ellipse(x + w * 0.55, y - 2, 34, 10, 0, 0, 7); c.fill();
        }
        c.fillStyle = '#2a2a2a';
        c.fillRect(x + 8, y + 18, 8, FLOORS[this.floor].y - y - 18);
        c.fillRect(x + w - 16, y + 18, 8, FLOORS[this.floor].y - y - 18);
        break;
      }
      case 'crib': {
        c.fillStyle = '#6a5a48'; c.fillRect(x, y + 24, w, 10);
        c.fillStyle = '#7a6a54';
        for (let i = 0; i < 6; i++) c.fillRect(x + 6 + i * (w - 12) / 5, y - 16, 5, 44);
        c.fillRect(x, y - 20, w, 6); c.fillRect(x, y + 16, w, 6);
        c.fillStyle = open ? '#cfc8b8' : '#e8e2d2'; c.fillRect(x + 6, y + 16 + a * 2, w - 12, 10);
        if (!open) {
          // качающаяся кроватка
          c.save(); c.translate(x + w / 2, y + 30); c.rotate(Math.sin(t * 1.6 + this.seed) * 0.03);
          c.fillStyle = 'rgba(200,195,180,0.9)'; c.beginPath(); c.ellipse(0, -8, w / 2 - 12, 9, 0, 0, 7); c.fill();
          c.restore();
        }
        c.strokeStyle = '#8a8f96'; c.lineWidth = 3;
        c.beginPath(); c.arc(x + 8, y + 34, 6, 0, 7); c.arc(x + w - 8, y + 34, 6, 0, 7); c.stroke();
        break;
      }
      case 'shelf': {
        c.fillStyle = '#33302a'; c.fillRect(x, y, w, h);
        for (let s = 0; s < 3; s++) {
          const sy = y + 10 + s * ((h - 20) / 3);
          if (open) { c.fillStyle = '#100e0a'; c.fillRect(x + 6, sy, w - 12, (h - 20) / 3 - 6); }
          else {
            const r = mulberry32(this.seed + s * 99);
            for (let i = 0; i < 7; i++) {
              const bw = 8 + r() * 8, bh = 16 + r() * 14;
              c.fillStyle = ['#5c3a3a', '#3a4a5c', '#4a5c3a', '#5c5c3a', '#4a3a5c'][(r() * 5) | 0];
              c.fillRect(x + 10 + i * 15, sy + (h - 20) / 3 - 8 - bh, bw, bh);
            }
          }
        }
        // выдвинутая полка
        if (a > 0.02) { c.fillStyle = 'rgba(255,255,255,0.06)'; c.fillRect(x - 4 * a, y + h / 3, w, 4); }
        break;
      }
      case 'gurney': {
        c.strokeStyle = '#5a6066'; c.lineWidth = 4;
        c.beginPath(); c.moveTo(x + 10, y + 30); c.lineTo(x + 10, FLOORS[this.floor].y - 8);
        c.moveTo(x + w - 10, y + 30); c.lineTo(x + w - 10, FLOORS[this.floor].y - 8); c.stroke();
        c.fillStyle = '#2a2a2a';
        c.beginPath(); c.arc(x + 10, FLOORS[this.floor].y - 6, 6, 0, 7); c.arc(x + w - 10, FLOORS[this.floor].y - 6, 6, 0, 7); c.fill();
        c.fillStyle = '#6b7680'; c.fillRect(x, y + 22 + a * 4, w, 10);
        c.fillStyle = open ? '#8f8a7c' : '#a8a296'; c.fillRect(x + 2, y + 12 + a * 4, w - 4, 12);
        if (!open) {
          c.fillStyle = 'rgba(200,195,180,0.95)';
          c.beginPath(); c.ellipse(x + w / 2, y + 8 - a * 6, w / 2 - 6, 10, 0, 0, 7); c.fill();
          c.fillStyle = 'rgba(120,10,20,0.55)';
          c.beginPath(); c.ellipse(x + w / 2 + 18, y + 6, 8, 5, 0.3, 0, 7); c.fill();
        }
        break;
      }
      case 'fridge': {
        c.fillStyle = '#6a7076'; c.fillRect(x, y, w, h);
        c.fillStyle = '#595f65'; c.fillRect(x + 4, y + 4, w - 8, h - 8);
        c.fillStyle = '#33383d'; c.fillRect(x + w - 16, y + 30, 6, 30);
        c.fillStyle = '#a31621'; c.font = '800 11px sans-serif'; c.fillText('МОРГ', x + 10, y + 24);
        c.strokeStyle = 'rgba(150,200,220,0.5)'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(x + 6, y + 40); c.lineTo(x + w - 6, y + 40); c.stroke();
        c.fillStyle = '#22262b'; c.fillRect(x + 8, y + 46, w - 16, h - 54);
        if (a > 0.1) { c.fillStyle = `rgba(150,200,230,${0.1 + a * 0.12})`; c.fillRect(x + 8, y + 46, w - 16, 24); }
        this.drawSwingDoor(c, x, y, w, h, a, 1);
        break;
      }
      case 'washer': {
        c.fillStyle = '#4a5055'; c.fillRect(x, y, w, h);
        c.fillStyle = '#5a6166'; c.fillRect(x + 4, y + 4, w - 8, h - 8);
        c.fillStyle = '#1a1e20'; c.beginPath(); c.arc(x + w / 2, y + h * 0.5, w * 0.3, 0, 7); c.fill();
        c.strokeStyle = '#7d858a'; c.lineWidth = 5;
        c.beginPath(); c.arc(x + w / 2, y + h * 0.5, w * 0.3, 0, 7); c.stroke();
        if (open) { c.fillStyle = '#0a0c0d'; c.beginPath(); c.arc(x + w / 2, y + h * 0.5, w * 0.28, 0, 7); c.fill(); }
        else {
          // бельё крутится
          c.save(); c.translate(x + w / 2, y + h * 0.5); c.rotate(t * 1.2 + this.seed);
          c.fillStyle = 'rgba(190,60,60,0.55)'; c.beginPath(); c.arc(w * 0.12, 4, w * 0.14, 0, 7); c.fill();
          c.fillStyle = 'rgba(180,180,190,0.45)'; c.beginPath(); c.arc(-w * 0.12, -6, w * 0.11, 0, 7); c.fill();
          c.restore();
        }
        c.fillStyle = '#2a2f33'; c.fillRect(x + 8, y + 8, w - 16, 16);
        c.fillStyle = '#8adfff'; c.fillRect(x + w - 22, y + 12, 8, 8);
        break;
      }
      case 'table': {
        c.fillStyle = open ? '#4a3a2a' : '#5a4632';
        c.fillRect(x, y, w, 10);
        c.fillStyle = '#3a2e22'; c.fillRect(x + 8, y + 10, 8, FLOORS[this.floor].y - y - 10);
        c.fillRect(x + w - 16, y + 10, 8, FLOORS[this.floor].y - y - 10);
        if (!open) {
          c.fillStyle = '#6d7680'; c.beginPath(); c.ellipse(x + w / 2, y + 2, w / 2 - 14, 6, 0, 0, 7); c.fill();
          c.fillStyle = 'rgba(140,120,80,0.8)'; c.beginPath(); c.ellipse(x + w / 2, y - 2, w / 2 - 26, 5, 0, 0, 7); c.fill();
        }
        break;
      }
      case 'crate': {
        const lift = a * 8;
        c.fillStyle = '#4a3a28'; c.fillRect(x, y - lift, w, h);
        c.fillStyle = '#5c4a34'; c.fillRect(x + 3, y + 3 - lift, w - 6, h - 6);
        c.strokeStyle = '#3a2e20'; c.lineWidth = 3;
        c.beginPath();
        c.moveTo(x + 4, y + 4 - lift); c.lineTo(x + w - 4, y + h - 4 - lift);
        c.moveTo(x + w - 4, y + 4 - lift); c.lineTo(x + 4, y + h - 4 - lift);
        c.stroke();
        if (open) { c.fillStyle = '#0a0906'; c.fillRect(x + 5, y + 5 - lift, w - 10, h - 10); }
        break;
      }
      case 'machine': {
        c.fillStyle = '#2e3438'; c.fillRect(x, y, w, h);
        c.fillStyle = '#3a4145'; c.fillRect(x + 4, y + 4, w - 8, h - 8);
        c.fillStyle = '#0f1214'; c.fillRect(x + 10, y + 14, w - 20, 40);
        c.fillStyle = open ? '#1a2a1a' : '#0d2a12';
        c.fillRect(x + 10, y + 60, w - 20, 30);
        c.fillStyle = open ? '#3a6a3a' : '#4dff6a';
        c.font = '700 10px monospace';
        c.fillText(open ? 'ERR 12' : '●●●●', x + 16, y + 80);
        c.fillStyle = '#8a8f96'; c.beginPath(); c.arc(x + w / 2, y + h - 20, 8, 0, 7); c.fill();
        break;
      }
    }
    /* маркер «можно обыскать» */
    if (!open) {
      const tw = 0.5 + Math.sin(t * 4 + this.x) * 0.5;
      c.save(); c.globalAlpha = 0.3 + tw * 0.45;
      c.fillStyle = '#ffd166'; c.shadowBlur = 12; c.shadowColor = '#ffd166';
      const bx = x + w / 2, by = y - 16 - Math.sin(t * 3) * 4;
      c.beginPath();
      c.moveTo(bx, by - 7); c.lineTo(bx + 2.5, by - 2.5); c.lineTo(bx + 7, by); c.lineTo(bx + 2.5, by + 2.5);
      c.lineTo(bx, by + 7); c.lineTo(bx - 2.5, by + 2.5); c.lineTo(bx - 7, by); c.lineTo(bx - 2.5, by - 2.5);
      c.closePath(); c.fill(); c.restore();
    }
  }
  drawSwingDoor(c, x, y, w, h, a, dir) {
    if (a <= 0.01) return;
    c.save();
    const px = dir > 0 ? x + w : x;
    c.translate(px, y + h / 2);
    c.rotate(a * 1.15 * dir);
    c.fillStyle = 'rgba(28,36,40,0.96)';
    c.fillRect(dir > 0 ? 0 : -w, -h / 2, w, h);
    c.strokeStyle = '#1a2226'; c.lineWidth = 3;
    c.strokeRect(dir > 0 ? 1 : -w + 1, -h / 2 + 1, w - 2, h - 2);
    c.restore();
  }
}

/* ================= ДВЕРИ ================= */
class Door {
  constructor(def) {
    Object.assign(this, def);
    this.floor = this.f;
    this.y = FLOORS[this.f].y - 138;
    this.h = 138; this.w = 46;
    this.open = false; this.anim = 0;
    this.pinned = false; this.breakProg = 0;
    this.jam = 0;
  }
  get solid() { return this.anim < 0.72 || this.pinned; }
  get bottom() { return this.y + this.h; }
  update(dt) {
    const target = this.open ? 1 : 0;
    this.anim = clamp(this.anim + (target ? dt * 1.7 : -dt * 2.3), 0, 1);
    if (this.pinned && this.open) this.pinned = false;
    if (this.jam > 0) this.jam -= dt;
  }
  draw(c) {
    const x = this.x - this.w / 2, y = this.y;
    c.fillStyle = '#0a0c0d'; c.fillRect(x - 9, y - 14, this.w + 18, this.h + 14);
    const metal = this.locked === 'boss';
    c.fillStyle = metal ? '#5c0a12' : '#3a3f45';
    c.fillRect(x - 9, y - 14, this.w + 18, 14);
    c.fillRect(x - 9, y, 9, this.h); c.fillRect(x + this.w, y, 9, this.h);
    c.fillStyle = '#111'; c.fillRect(x - 5, y - 38, this.w + 10, 22);
    c.fillStyle = this.locked === 'boss' ? '#ff5c6c' : '#ffd166';
    c.font = '700 9px sans-serif'; c.textAlign = 'center';
    c.fillText(this.name.toUpperCase().slice(0, 16), this.x, y - 23);
    c.textAlign = 'left';
    const lift = this.anim * (this.h - 8);
    const py = y - lift;
    if (this.locked === 'boss') {
      c.fillStyle = '#4a0d14'; c.fillRect(x, py, this.w, this.h);
      c.fillStyle = '#6b1220'; c.fillRect(x + 4, py + 6, this.w - 8, this.h - 12);
      c.strokeStyle = '#ff5c6c'; c.lineWidth = 1.4;
      c.globalAlpha = 0.6 + Math.sin(performance.now() / 300) * 0.3;
      c.beginPath();
      c.moveTo(x + 8, py + 30); c.lineTo(x + this.w - 8, py + 52);
      c.moveTo(x + this.w - 8, py + 30); c.lineTo(x + 8, py + 52);
      c.moveTo(x + this.w / 2, py + 62); c.lineTo(x + this.w / 2, py + 104);
      c.stroke(); c.globalAlpha = 1;
    } else if (this.locked === 'key_red' || this.locked === 'key_attic') {
      c.fillStyle = '#3a3f45'; c.fillRect(x, py, this.w, this.h);
      c.strokeStyle = '#22262b'; c.lineWidth = 4;
      for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(x, py + 12 + i * 24); c.lineTo(x + this.w, py + 12 + i * 24); c.stroke(); }
      c.fillStyle = this.locked === 'key_red' ? '#a31621' : '#d19a2a';
      c.beginPath(); c.arc(x + this.w / 2, py + 40, 9, 0, 7); c.fill();
      c.fillStyle = '#ffd166'; c.fillRect(x + this.w / 2 - 2, py + 38, 4, 9);
    } else {
      c.fillStyle = this.jam > 0 ? '#6b5a3a' : '#4a4438'; c.fillRect(x, py, this.w, this.h);
      c.fillStyle = '#3a352c'; c.fillRect(x + 6, py + 10, this.w - 12, this.h - 20);
      c.fillStyle = '#8a8f96'; c.fillRect(x + this.w - 13, py + this.h / 2, 6, 13);
      if (this.locked === 'power' && !Game.power) {
        c.fillStyle = '#ff5c6c'; c.fillRect(x + this.w / 2 - 4, py + 60, 8, 8);
        c.fillStyle = '#1a1a1a'; c.fillRect(x + this.w / 2 - 2, py + 68, 4, 10);
      }
    }
    if (this.pinned) {
      c.save();
      c.strokeStyle = '#c8c8c8'; c.lineWidth = 4; c.lineCap = 'round';
      c.beginPath();
      c.moveTo(x - 10, y + this.h - 46); c.lineTo(x + this.w + 10, y + this.h - 40);
      c.stroke();
      c.fillStyle = '#8a8f96'; c.beginPath(); c.ellipse(x + this.w / 2, y + this.h - 43, 12, 6, -0.15, 0, 7); c.fill();
      if (this.breakProg > 0) {
        c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(x - 10, y + this.h - 66, this.w + 20, 6);
        c.fillStyle = '#ff5c6c'; c.fillRect(x - 10, y + this.h - 66, (this.w + 20) * this.breakProg, 6);
      }
      c.restore();
    }
    if (!this.open && this.locked) {
      c.font = '16px sans-serif'; c.textAlign = 'center';
      c.fillText(this.locked === 'boss' ? '☠' : '🔒', this.x, y + this.h / 2);
      c.textAlign = 'left';
    }
  }
}

/* ================= ПОДБОРЫ ================= */
class Pickup {
  constructor(def) { Object.assign(this, def); this.ph = rand(0, 6); }
  label() {
    const k = this.kind;
    if (k === 'knife') return 'Взять: НОЖ 🔪';
    if (k === 'pistol') return 'Взять: ПИСТОЛЕТ 🔫';
    if (k === 'pick') return 'Взять: ЗАТЫЧКУ 🥄';
    if (k === 'key_red') return 'Взять: КРАСНЫЙ КЛЮЧ 🔑';
    if (k === 'key_attic') return 'Взять: КЛЮЧ ОТ ЧЕРДАКА 🗝';
    if (k === 'key_ord') return 'Взять: КЛЮЧ ОРДИНАТОРСКОЙ 🗝';
    if (k === 'elev_card') return 'Взять: КАРТУ ЛИФТА 🎫';
    if (k === 'medkit') return 'Взять: аптечку 🩹';
    if (k === 'pills') return 'Взять: пилюли 💊';
    if (k === 'syringe') return 'Взять: шприц с транквилизатором 💉';
    if (k === 'bottle') return 'Взять: бутылку (бросок — G) 🍾';
    if (k === 'battery') return 'Взять: батарейку 🔋';
    if (k.startsWith('ammo')) return `Взять: патроны ×${k.split(':')[1]}`;
    if (k.startsWith('note')) return 'Читать: ЗАПИСКУ 📄';
    return 'Взять';
  }
  draw(c, t) {
    const bob = Math.sin(t * 3 + this.ph) * 5;
    const y = this.y - 14 + bob;
    c.save();
    c.globalAlpha = 0.5 + Math.sin(t * 4 + this.ph) * 0.2;
    const g = c.createRadialGradient(this.x, y, 2, this.x, y, 46);
    const col = this.kind.startsWith('note') ? '255,209,102' : this.kind.startsWith('ammo') ? '255,150,80' : '150,255,170';
    g.addColorStop(0, `rgba(${col},0.5)`); g.addColorStop(1, `rgba(${col},0)`);
    c.fillStyle = g; c.beginPath(); c.arc(this.x, y, 46, 0, 7); c.fill();
    c.restore();
    c.textAlign = 'center';
    const em = {
      knife: '🔪', pistol: '🔫', pick: '🥄', key_red: '🔑', key_attic: '🗝', key_ord: '🗝',
      medkit: '🩹', pills: '💊', syringe: '💉', bottle: '🍾', battery: '🔋', elev_card: '🎫',
    };
    if (this.kind.startsWith('note')) {
      c.save(); c.translate(this.x, y); c.rotate(-0.15 + Math.sin(t * 2) * 0.06);
      c.fillStyle = '#d9c9a8'; c.fillRect(-13, -17, 26, 34);
      c.fillStyle = '#241a10';
      for (let i = 0; i < 5; i++) c.fillRect(-9, -11 + i * 6, 18, 2);
      c.fillStyle = '#a31621'; c.beginPath(); c.arc(6, 8, 3, 0, 7); c.fill();
      c.restore();
    } else if (this.kind.startsWith('ammo')) {
      c.fillStyle = '#3a3226'; c.fillRect(this.x - 14, y - 8, 28, 16);
      c.fillStyle = '#c8a02a';
      for (let i = 0; i < 4; i++) c.fillRect(this.x - 11 + i * 7, y - 14, 5, 8);
    } else {
      c.font = '30px sans-serif';
      c.fillText(em[this.kind] || '❔', this.x, y + 10);
    }
    c.textAlign = 'left';
  }
}

/* ================= СНАРЯДЫ ================= */
class Projectile {
  constructor(o) {
    this.x = o.x; this.y = o.y; this.vx = o.vx; this.vy = o.vy;
    this.r = o.r; this.dmg = o.dmg; this.san = o.san || 0;
    this.kind = o.kind; this.life = o.life || 3; this.dead = false;
    this.gravity = o.gravity || 0; this.ph = rand(0, 6); this.stuck = false;
  }
  update(dt, game) {
    this.life -= dt; this.ph += dt;
    if (this.life <= 0) { this.dead = true; return; }
    this.vy += this.gravity * dt;
    this.x += this.vx * dt; this.y += this.vy * dt;
    const p = game.player;
    if (this.kind === 'bottle') {
      if (game.solidAt(this.x, this.y, 4, 4) || this.y > FLOORS[game.floorAtY(this.y)].y - 2) {
        this.dead = true;
        AudioSys.glass(); Particles.glass(this.x, this.y, 18);
        game.addNoise(this.x, this.y, 1000);
        game.effects.push({ kind: 'ring', x: this.x, y: this.y, r: 6, max: 120, t: 0, dur: 0.4, color: '#9fe8ff' });
        return;
      }
      return;
    }
    if (!p.dead && !p.hidden && dist(this.x, this.y, p.cx(), p.cy()) < this.r + 22 && p.floor === game.floorAtY(this.y)) {
      this.dead = true;
      p.takeDamage(this.dmg, game);
      if (this.kind === 'wail') p.slowT = 1.2;
      if (this.san) { p.san = clamp(p.san - this.san, 0, 100); Floaters.add(p.cx(), p.y - 14, `-${this.san} RASS`, '#c77dff', 15); }
      Particles.ichor(this.x, this.y, 6, this.kind === 'wail' ? '#4a1d6b' : '#1a3a4a');
      return;
    }
    if (game.solidAt(this.x, this.y, 3, 3) && this.kind !== 'wail') {
      this.dead = true;
      Particles.spark(this.x, this.y, 5);
      AudioSys.noise(0.08, 0.12, 700, 2);
      return;
    }
    if (this.x < 0 || this.x > WORLD.w || this.y > WORLD.h) this.dead = true;
  }
  draw(c) {
    c.save(); c.translate(this.x, this.y);
    switch (this.kind) {
      case 'syringe':
        c.rotate(Math.atan2(this.vy, this.vx));
        c.fillStyle = 'rgba(180,230,255,0.7)'; c.fillRect(-10, -3, 16, 6);
        c.fillStyle = 'rgba(120,220,120,0.9)'; c.fillRect(-4, -3, 10, 6);
        c.fillStyle = '#dfe8ee'; c.fillRect(6, -1, 10, 2);
        break;
      case 'scalpel':
        c.rotate(Math.atan2(this.vy, this.vx));
        c.fillStyle = '#dfe8ee'; c.fillRect(-6, -1.5, 18, 3);
        c.fillStyle = '#333'; c.fillRect(-11, -2.5, 8, 5);
        c.shadowBlur = 8; c.shadowColor = '#cfe8ff'; c.fillRect(8, -1, 6, 2); c.shadowBlur = 0;
        break;
      case 'junk':
        c.rotate(this.ph * 8);
        c.fillStyle = '#6b7680'; c.fillRect(-8, -6, 16, 12);
        c.fillStyle = '#a31621'; c.fillRect(-4, -3, 8, 5);
        break;
      case 'bottle':
        c.rotate(this.ph * 10);
        c.fillStyle = 'rgba(120,200,140,0.85)';
        c.fillRect(-4, -9, 8, 14);
        c.fillRect(-2, -13, 4, 5);
        c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(-3, -7, 2, 9);
        break;
      default: // wail
        c.globalAlpha = 0.85;
        c.strokeStyle = '#c77dff'; c.lineWidth = 3;
        c.shadowBlur = 14; c.shadowColor = '#c77dff';
        c.beginPath(); c.arc(0, 0, this.r + Math.sin(this.ph * 14) * 3, 0, 7); c.stroke();
        c.fillStyle = '#fff'; c.font = '14px sans-serif'; c.textAlign = 'center';
        c.fillText('💀', 0, 5); c.textAlign = 'left';
    }
    c.restore();
  }
}
