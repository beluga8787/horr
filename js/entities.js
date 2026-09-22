/* ============================================================
   МИШУТКА — сущности: игрок, призраки, босс, мебель, двери
   ============================================================ */
'use strict';

/* ================= ИГРОК: МИШУТКА ================= */
class Player {
  constructor(x, y) { this.reset(x, y); }
  reset(x, y) {
    this.x = x; this.y = y; this.w = 34; this.h = 64;
    this.vx = 0; this.vy = 0; this.face = 1; this.onGround = false;
    this.hp = 100; this.maxhp = 100; this.st = 100; this.san = 100;
    this.weapons = { hands: true, knife: false, pistol: false, pick: false };
    this.cur = 'hands'; this.mag = 0; this.reserve = 0; this.magSize = 7;
    this.medkits = 1; this.pills = 1; this.keys = {}; this.notes = [];
    this.atkCd = 0; this.atkAnim = 0; this.reloadT = 0; this.iframes = 0;
    this.flashOn = true; this.aim = 0; this.handX = x; this.handY = y;
    this.walkT = 0; this.noise = 0; this.exhausted = false;
    this.coyote = 0; this.jumpBuf = 0; this.dropT = 0; this.dead = false;
    this.channel = null; this.stepT = 0; this.hurtT = 0; this.lit = 0; this.lampLit = 0;
    this.slowT = 0; this.kills = 0;
  }
  cx() { return this.x + this.w / 2; }
  cy() { return this.y + this.h / 2; }

  /* рука с фонарём — ТОЧКА ПРИВЯЗАНА К ТЕЛУ (не отделяется!) */
  updateHand() {
    const sx = this.cx() + this.face * 10, sy = this.y + 34;
    this.handX = sx + Math.cos(this.aim) * 16;
    this.handY = sy + Math.sin(this.aim) * 10;
  }

  update(dt, game) {
    if (this.dead) return;
    const ax = Input.axis();
    const wantRun = !!(Input.keys['ShiftLeft'] || Input.keys['ShiftRight']);
    const running = wantRun && ax !== 0 && !this.exhausted && this.st > 1;
    // канал (обыск/взлом): движение отменяет
    if (this.channel) {
      if (ax !== 0 || Input.jumpHit()) { this.channel = null; game.hideChannel(); }
      else {
        this.channel.t += dt;
        game.showChannel(this.channel.t / this.channel.dur, this.channel.label);
        this.noise = Math.max(this.noise, this.channel.noisy ? 0.7 : 0.25);
        if ((this.channel.tickT = (this.channel.tickT || 0) + dt) > 0.3) { this.channel.tickT = 0; AudioSys.search(); }
        if (this.channel.t >= this.channel.dur) {
          const cb = this.channel.onDone; this.channel = null; game.hideChannel(); cb();
        }
        this.vx *= 0.8;
      }
    }
    // движение
    const slow = this.slowT > 0 ? 0.55 : 1;
    const max = (running ? 400 : 258) * slow;
    const acc = this.onGround ? 3200 : 2100;
    if (!this.channel) {
      if (ax !== 0) { this.vx = clamp(this.vx + ax * acc * dt, -max, max); this.face = ax; }
      else this.vx *= Math.pow(this.onGround ? 0.0001 : 0.02, dt);
      if (running) { this.st -= 15 * dt; this.noise = Math.max(this.noise, 0.45); if (this.st <= 0) { this.st = 0; this.exhausted = true; game.toast('Мишутка задыхается…', 'red'); } }
      if (this.exhausted && this.st > 25) this.exhausted = false;
    }
    // прыжок
    if (this.onGround) this.coyote = 0.12; else this.coyote -= dt;
    if (Input.jumpHit()) this.jumpBuf = 0.12; else this.jumpBuf -= dt;
    const wantDrop = !!(Input.keys['KeyS'] || Input.keys['ArrowDown']);
    if (this.jumpBuf > 0 && this.coyote > 0 && !this.channel) {
      if (wantDrop && !this.onSolidGround) { this.dropT = 0.25; this.jumpBuf = 0; }
      else if (this.st > 5) { this.vy = -700; this.onGround = false; this.coyote = 0; this.jumpBuf = 0; this.st -= 7; AudioSys.jump(); Particles.dust(this.cx(), this.y + this.h, 5); }
    }
    if (!Input.keys['Space'] && !Input.keys['KeyW'] && !Input.keys['ArrowUp'] && this.vy < -240) this.vy = -240;
    this.dropT -= dt;
    // прицел: фонарь следует за мышью, НО origin — рука игрока
    const mwx = Input.mouse.sx + Camera.x, mwy = Input.mouse.sy + Camera.y;
    this.aim = Math.atan2(mwy - (this.y + 32), mwx - this.cx());
    if (Math.abs(mwx - this.cx()) > 12) this.face = mwx > this.cx() ? 1 : -1;
    this.updateHand();
    // фонарь
    if (Input.pressed['KeyF']) { this.flashOn = !this.flashOn; AudioSys.uiClick(); game.toast(this.flashOn ? '🔦 Фонарь включён' : 'Фонарь выключен… темно.', this.flashOn ? '' : 'red'); }
    // оружие
    const numMap = { Digit1: 'hands', Digit2: 'knife', Digit3: 'pistol', Digit4: 'pick' };
    for (const k in numMap) if (Input.pressed[k] && this.weapons[numMap[k]]) { this.cur = numMap[k]; this.reloadT = 0; AudioSys.uiClick(); game.refreshHUD(); }
    // перезарядка
    if ((Input.pressed['KeyR'] || (this.cur === 'pistol' && this.mag === 0 && this.atkCd <= 0 && Input.atkHit() && this.reserve > 0)) && this.reloadT <= 0) {
      if (this.cur === 'pistol' && this.mag < this.magSize && this.reserve > 0) { this.reloadT = 1.1; AudioSys.reload(); }
    }
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        const need = this.magSize - this.mag, take = Math.min(need, this.reserve);
        this.mag += take; this.reserve -= take; game.refreshHUD();
      }
    }
    // лечение
    if (Input.pressed['KeyQ']) this.useMedkit(game);
    if (Input.pressed['KeyT']) this.usePills(game);
    // атака
    this.atkCd -= dt; this.atkAnim -= dt;
    if (Input.atkHit() && this.atkCd <= 0 && this.reloadT <= 0 && !this.channel && !game.modalOpen()) this.tryAttack(game);
    // выносливость реген
    if (!running) this.st = clamp(this.st + (ax === 0 ? 24 : 11) * dt, 0, 100);
    // рассудок
    const ghostNear = game.ghostPressure(this.cx(), this.cy());
    if (this.lit > 0.55) this.san = clamp(this.san + (this.lampLit > 0.3 ? 5 : 1.5) * dt, 0, 100);
    else this.san = clamp(this.san - (0.55 - this.lit) * 6 * dt - ghostNear * 4.5 * dt, 0, 100);
    if (this.san <= 0) this.takeDamage(2.5 * dt, game, 'mind');
    if (this.slowT > 0) this.slowT -= dt;
    // таймеры
    if (this.iframes > 0) this.iframes -= dt;
    if (this.hurtT > 0) this.hurtT -= dt;
    this.noise = Math.max(0, this.noise - dt * 1.2);
    // физика
    this.vy = Math.min(this.vy + 1900 * dt, 1100);
    game.moveAndCollide(this, dt, true);
    // шаги
    if (this.onGround && Math.abs(this.vx) > 40) {
      this.walkT += dt * Math.abs(this.vx) / 60;
      this.stepT -= dt * (running ? 1.7 : 1);
      if (this.stepT <= 0) { this.stepT = 0.34; AudioSys.step(running); if (running) Particles.dust(this.cx(), this.y + this.h, 2); }
    } else this.walkT += dt * 2;
  }

  tryAttack(game) {
    const w = WEAPONS[this.cur];
    if (this.st < w.stam) { game.toast('Нет сил…', 'red'); return; }
    this.st -= w.stam; this.atkCd = w.cd; this.atkAnim = 0.18;
    if (this.cur === 'pistol') {
      if (this.mag <= 0) {
        AudioSys.dryfire();
        if (this.reserve > 0) { this.reloadT = 1.1; AudioSys.reload(); }
        else game.toast('Нет патронов! Ищи обоймы в шкафчиках.', 'red');
        return;
      }
      this.mag--;
      AudioSys.shot();
      Camera.shake(0.35);
      this.noise = 1;
      game.muzzleT = 0.09;
      Particles.muzzle(this.handX, this.handY, this.aim);
      game.pistolShot(this.handX, this.handY, this.aim);
      game.refreshHUD();
      if (this.mag === 0 && this.reserve > 0) { this.reloadT = 1.1; setTimeout(() => {}, 0); }
      return;
    }
    // ближний бой
    AudioSys.swing();
    const dirx = Math.cos(this.aim), diry = Math.sin(this.aim);
    const hx = this.handX + dirx * w.range * 0.5, hy = this.handY + diry * w.range * 0.5;
    const box = { x: hx - w.range * 0.6, y: hy - w.range * 0.5, w: w.range * 1.2, h: w.range };
    game.meleeHit(box, w.dmg, dirx, this);
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

  takeDamage(amount, game, type = 'hit') {
    if (this.dead || this.iframes > 0 && type === 'hit') return;
    if (type === 'hit') this.iframes = 0.7;
    this.hp -= amount; this.hurtT = 0.25;
    if (type === 'hit') { AudioSys.hurt(); Camera.shake(0.45); game.damageFlash(); Particles.blood(this.cx(), this.cy(), 10); }
    if (this.hp <= 0 && !this.dead) { this.hp = 0; this.dead = true; game.onDeath(); }
  }

  /* ---------- отрисовка Мишутки ---------- */
  draw(c) {
    if (this.dead) { // тело
      c.save(); c.globalAlpha = 0.9;
      c.fillStyle = 'rgba(0,0,0,0.4)';
      c.beginPath(); c.ellipse(this.cx(), this.y + this.h - 2, 30, 7, 0, 0, 7); c.fill();
      c.fillStyle = '#3a4a52'; c.fillRect(this.x - 12, this.y + this.h - 22, 58, 20);
      c.fillStyle = '#d8b89a'; c.beginPath(); c.arc(this.x - 16, this.y + this.h - 12, 11, 0, 7); c.fill();
      c.fillStyle = '#a31621'; c.beginPath(); c.ellipse(this.x - 16, this.y + this.h - 1, 16, 5, 0, 0, 7); c.fill();
      c.restore(); return;
    }
    if (this.iframes > 0 && ((this.iframes * 20) | 0) % 2 === 0) c.globalAlpha = 0.45;
    const cx = this.cx(), feet = this.y + this.h, f = this.face;
    // тень
    c.fillStyle = 'rgba(0,0,0,0.45)';
    c.beginPath(); c.ellipse(cx, feet + 3, 20, 6, 0, 0, 7); c.fill();
    const sw = Math.sin(this.walkT * 6) * (Math.abs(this.vx) > 40 && this.onGround ? 1 : 0.08);
    const airK = this.onGround ? 0 : 1;
    const lean = clamp(this.vx / 400, -1, 1) * 4;
    c.save();
    c.translate(cx, this.y); c.scale(f, 1);
    // ноги (пижама в полоску)
    const legSwing = sw * 10;
    for (const s of [-1, 1]) {
      const off = s > 0 ? legSwing : -legSwing;
      c.fillStyle = s > 0 ? '#4a5a66' : '#3d4c55';
      c.fillRect(-7 + s * 2 + (airK ? s * 5 : 0), 34, 10, 26 - Math.abs(off) * 0.4);
      c.fillStyle = 'rgba(220,220,220,0.25)';
      for (let i = 0; i < 3; i++) c.fillRect(-7 + s * 2 + (airK ? s * 5 : 0), 38 + i * 7, 10, 2);
      // тапок
      c.fillStyle = '#6b5d4f';
      c.fillRect(-9 + s * 2 + off * 0.6 + (airK ? s * 6 : 0), 56 - Math.abs(off) * 0.4, 15, 7);
    }
    // торс — больничная роба
    const bob = Math.abs(sw) * 2;
    c.fillStyle = '#7d94a0';
    c.beginPath();
    c.moveTo(-9, 20); c.lineTo(9, 20 + lean * 0.4); c.lineTo(11, 42); c.lineTo(-11, 42); c.closePath(); c.fill();
    c.fillStyle = '#6a828e'; c.fillRect(-9, 20, 4, 22); // запах робы
    c.fillStyle = '#5c0a12'; // пятно крови
    c.beginPath(); c.ellipse(2, 34 + bob, 4, 6, 0.3, 0, 7); c.fill();
    c.save(); c.translate(-9, 30); c.scale(f, 1); c.fillStyle = '#e8dcc8'; c.font = '700 7px sans-serif'; c.fillText('№12', 0, 0); c.restore(); // номер пациента
    // задняя рука
    c.strokeStyle = '#d8b89a'; c.lineWidth = 6; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-4, 24); c.lineTo(-12, 34 - sw * 8); c.stroke();
    // голова
    const hy = 10 + bob * 0.5;
    c.fillStyle = '#d8b89a';
    c.beginPath(); c.ellipse(1, hy, 10, 12, 0, 0, 7); c.fill();
    // волосы взъерошенные
    c.fillStyle = '#4a3220';
    c.beginPath(); c.ellipse(0, hy - 9, 10, 6, -0.1, 0, 7); c.fill();
    for (let i = 0; i < 5; i++) { const a = -2.4 + i * 0.35; c.fillRect(1 + Math.cos(a) * 9 - 2, hy - 9 + Math.sin(a) * 6 - 2, 5, 5); }
    // повязка на голове с кровью
    c.fillStyle = '#cfc4ae'; c.fillRect(-9, hy - 8, 20, 5);
    c.fillStyle = '#a31621'; c.beginPath(); c.ellipse(-5, hy - 6, 3, 2.5, 0, 0, 7); c.fill();
    // лицо: глаза следят за прицелом, рот — по состоянию
    const lookY = clamp(Math.sin(this.aim) * 3, -3, 3);
    const insane = this.san < 30;
    c.fillStyle = '#fff'; c.fillRect(2, hy - 1 + lookY * 0.5, 7, insane ? 6 : 5);
    c.fillStyle = insane ? '#7b2fbf' : '#1a1a1a';
    const pr = insane ? 2.6 : 1.6;
    c.beginPath(); c.arc(5.5 + (f > 0 ? 1 : -1), hy + 1.5 + lookY * 0.5, pr, 0, 7); c.fill();
    // синяки под глазами
    c.fillStyle = 'rgba(60,20,60,0.5)'; c.fillRect(1, hy + 5, 9, 2.5);
    // щетина
    c.fillStyle = 'rgba(40,30,25,0.35)'; c.fillRect(-4, hy + 5, 12, 5);
    // рот
    c.strokeStyle = '#5a2a2a'; c.lineWidth = 1.6;
    c.beginPath();
    if (this.hp < 30) { c.arc(4, hy + 10, 2.6, 0.2, Math.PI - 0.2); } // оскал
    else if (insane) { c.ellipse(4, hy + 10, 2, 3, 0, 0, 7); } // открытый в ужасе
    else { c.moveTo(1, hy + 9.5); c.lineTo(7, hy + 9); }
    c.stroke();
    c.restore();
    // ПЕРЕДНЯЯ РУКА + ФОНАРЬ/ОРУЖИЕ — строго в руке, смотрит в прицел
    const shx = cx + f * 6, shy = this.y + 26;
    c.save();
    c.strokeStyle = '#d8b89a'; c.lineWidth = 6; c.lineCap = 'round';
    c.beginPath(); c.moveTo(shx, shy); c.lineTo(this.handX, this.handY); c.stroke();
    // рукав
    c.strokeStyle = '#7d94a0'; c.lineWidth = 7;
    c.beginPath(); c.moveTo(shx, shy); c.lineTo(lerp(shx, this.handX, 0.4), lerp(shy, this.handY, 0.4)); c.stroke();
    c.translate(this.handX, this.handY); c.rotate(this.aim);
    c.scale(1, f); // чтобы оружие не переворачивалось
    // кисть
    c.fillStyle = '#d8b89a'; c.beginPath(); c.arc(0, 0, 4.5, 0, 7); c.fill();
    if (this.cur === 'pistol') {
      c.fillStyle = '#22262b'; c.fillRect(0, -3, 20, 7); // ствол
      c.fillStyle = '#3a3f45'; c.fillRect(4, 3, 6, 8);   // рукоять
      c.fillStyle = '#111'; c.fillRect(17, -2, 4, 4);    // дуло
      // фонарь под стволом (примотан изолентой!)
      c.fillStyle = '#c8a02a'; c.fillRect(0, 5, 13, 6);
      c.fillStyle = '#2a2a2a'; c.fillRect(2, 5, 3, 6); c.fillRect(8, 5, 3, 6);
      c.fillStyle = this.flashOn ? '#fff6d8' : '#555'; c.fillRect(13, 5.5, 3, 5);
    } else {
      // фонарь в руке
      c.rotate(-f * 0); // уже повёрнут на aim
      c.fillStyle = '#8a8f96'; c.fillRect(-2, -3, 16, 7);
      c.fillStyle = '#3c4046'; c.fillRect(-6, -2.5, 5, 6);
      c.fillStyle = this.flashOn ? '#fff6d8' : '#444';
      c.beginPath(); c.arc(15, 0.5, 4, 0, 7); c.fill();
      if (this.flashOn) { c.shadowBlur = 18; c.shadowColor = '#ffe9b0'; c.fillRect(14, -2, 3, 5); c.shadowBlur = 0; }
      // второе оружие поверх
      if (this.cur === 'knife') {
        c.fillStyle = '#c9d2d8'; c.fillRect(2, -14, 4, 13); // лезвие
        c.fillStyle = '#4a3220'; c.fillRect(1, -4, 6, 6);   // рукоять
        c.strokeStyle = '#fff'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(3, -13); c.lineTo(3, -3); c.stroke();
      } else if (this.cur === 'pick') {
        c.strokeStyle = '#c8c8c8'; c.lineWidth = 2.4;
        c.beginPath(); c.moveTo(2, 0); c.lineTo(16, -8); c.stroke();
        c.beginPath(); c.ellipse(18, -9, 4, 2.6, -0.5, 0, 7); c.stroke(); // ложка-затычка
      } else { // кулак
        c.fillStyle = '#c9a184'; c.fillRect(2, -5, 7, 9);
      }
    }
    c.restore();
    // взмах атаки
    if (this.atkAnim > 0 && this.cur !== 'pistol') {
      c.save(); c.globalAlpha = this.atkAnim / 0.18 * 0.7;
      c.strokeStyle = this.cur === 'knife' ? '#e8f4ff' : '#fff';
      c.lineWidth = this.cur === 'knife' ? 4 : 8; c.lineCap = 'round';
      const w = WEAPONS[this.cur], pr2 = 1 - this.atkAnim / 0.18;
      c.beginPath(); c.arc(this.handX, this.handY, w.range * 0.75, this.aim - 1 + pr2 * 1.6, this.aim - 0.2 + pr2 * 1.6); c.stroke();
      c.restore();
    }
    if (this.hurtT > 0) { c.fillStyle = `rgba(163,22,33,${this.hurtT * 2})`; c.fillRect(this.x - 4, this.y - 4, this.w + 8, this.h + 8); }
    c.globalAlpha = 1;
  }
}

/* ================= ПРИЗРАКИ ================= */
const GHOST_DEFS = {
  whisper: { w: 46, h: 34, hp: 30,  speed: 200, dmg: 10, sight: 560, name: 'Шептун' },
  nurse:   { w: 42, h: 96, hp: 65,  speed: 125, dmg: 8,  sight: 640, name: 'Плакальщица' },
  brute:   { w: 74, h: 112,hp: 175, speed: 88,  dmg: 24, sight: 480, name: 'Смирительный' },
  spider:  { w: 58, h: 50, hp: 90,  speed: 170, dmg: 15, sight: 600, name: 'Ползун' },
  double:  { w: 34, h: 64, hp: 115, speed: 235, dmg: 17, sight: 900, name: 'Двойник' },
};

class Ghost {
  constructor(type, x, leash) {
    const d = GHOST_DEFS[type];
    this.type = type; this.w = d.w; this.h = d.h;
    this.x = x - d.w / 2; this.y = WORLD.ground - d.h;
    this.vx = 0; this.vy = 0; this.hp = d.hp; this.maxhp = d.hp;
    this.speed = d.speed; this.dmg = d.dmg; this.sight = d.sight;
    this.leash = leash; this.face = Math.random() < 0.5 ? -1 : 1;
    this.state = 'idle'; this.tState = rand(0, 2); this.onGround = true;
    this.atkCd = 0; this.hitT = 0; this.dead = false; this.dieT = 0;
    this.animT = rand(0, 10); this.lit = 0; this.alertT = 0; this.homeX = x;
    this.phase = rand(0, 6); this.touchCd = 0;
    if (type === 'nurse') this.y = WORLD.ground - d.h - rand(30, 120);
  }
  cx() { return this.x + this.w / 2; }
  cy() { return this.y + this.h / 2; }

  seesPlayer(game) {
    const p = game.player;
    if (p.dead) return false;
    const d = dist(this.cx(), this.cy(), p.cx(), p.cy());
    if (d > this.sight) return false;
    // за закрытой дверью не видно
    for (const dr of game.doors) {
      if (!dr.open && ((this.cx() < dr.x) !== (p.cx() < dr.x)) && Math.abs(p.cx() - this.cx()) < 900) return false;
    }
    return true;
  }

  takeDamage(dmg, game, dir = 0, litMul = 1) {
    if (this.dead) return;
    const bonus = this.lit > 0.3 ? 1.5 : 1; // свет жжёт тварей
    const total = Math.round(dmg * bonus * litMul);
    this.hp -= total; this.hitT = 0.15;
    AudioSys.ghostHit();
    Particles.ichor(this.cx(), this.cy(), 8);
    Floaters.add(this.cx(), this.y - 8, total + (bonus > 1 ? '☀' : ''), bonus > 1 ? '#ffe9b0' : '#c77dff', 16);
    this.vx += dir * 160;
    this.alertT = 4;
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
    if (this.dead) { this.dieT -= dt; return this.dieT > 0; }
    const p = game.player;
    // освещён ли фонарём/лампой
    this.lit = Math.max(game.flashLit(this.cx(), this.cy()), game.lampLit(this.cx(), this.cy()));
    const litSlow = this.lit > 0.3 && (this.type === 'whisper' || this.type === 'nurse') ? 0.72 : 1;
    // обнаружение
    const seen = this.seesPlayer(game);
    const heard = p.noise > 0.3 && dist(this.cx(), this.cy(), p.cx(), p.cy()) < p.noise * 700;
    if ((seen || heard) && !p.dead) this.alertT = 3; else this.alertT -= dt;
    const chasing = this.alertT > 0 && !p.dead;
    this.face = p.cx() >= this.cx() ? 1 : -1;
    if (this.atkCd > 0) this.atkCd -= dt;

    switch (this.type) {
      case 'whisper': {
        if (chasing) {
          const dir = Math.sign(p.cx() - this.cx()) || 1;
          this.vx = lerp(this.vx, dir * this.speed * litSlow, 1 - Math.pow(0.01, dt));
          // рывок
          if (this.atkCd <= 0 && Math.abs(p.cx() - this.cx()) < 170 && Math.abs(p.cy() - this.cy()) < 90) {
            this.vx = dir * 520; this.vy = -260; this.atkCd = 1.4; AudioSys.syringe();
          }
        } else {
          // патруль скоком
          this.tState -= dt;
          if (this.tState <= 0) { this.tState = rand(1, 2.5); this.face = this.cx() < this.leash[0] ? 1 : this.cx() > this.leash[1] ? -1 : (Math.random() < 0.5 ? -1 : 1); }
          this.vx = lerp(this.vx, this.face * 60, 1 - Math.pow(0.05, dt));
        }
        this.vy += 1900 * dt;
        game.moveAndCollide(this, dt, false);
        this.tryTouch(p, game, dt, 1.1);
        // шепоток
        if (chasing && Math.random() < dt * 0.5) AudioSys.whisper();
        break;
      }
      case 'nurse': {
        const dx = p.cx() - this.cx(), dy = (p.cy() - 40) - this.cy();
        const d = Math.hypot(dx, dy) || 1;
        if (chasing) {
          let mx = 0, my = 0;
          if (d > 380) { mx = dx / d; my = dy / d * 0.7; }
          else if (d < 240) { mx = -dx / d; my = -dy / d * 0.5; }
          else { mx = Math.cos(this.phase * 0.7) * 0.4; my = Math.sin(this.phase * 1.1) * 0.4; }
          this.vx = lerp(this.vx, mx * this.speed * litSlow, 1 - Math.pow(0.05, dt));
          this.vy = lerp(this.vy, my * this.speed * litSlow, 1 - Math.pow(0.05, dt));
          if (this.atkCd <= 0 && d < 560) { // вопль
            this.atkCd = 2.3; AudioSys.scream();
            game.effects.push({ kind: 'ring', x: this.cx(), y: this.cy(), r: 10, max: 130, t: 0, dur: 0.5, color: '#c77dff' });
            game.spawnProjectile({ x: this.cx(), y: this.cy(), vx: dx / d * 300, vy: dy / d * 300, r: 12, dmg: this.dmg, san: 20, kind: 'wail', life: 2.2 });
            Camera.shake(0.15);
          }
        } else {
          this.vx = lerp(this.vx, Math.sin(this.phase * 0.5) * 30, dt * 2);
          this.vy = lerp(this.vy, Math.cos(this.phase * 0.8) * 24, dt * 2);
        }
        this.x += this.vx * dt; this.y += this.vy * dt;
        this.y = clamp(this.y, WORLD.ground - 320, WORLD.ground - this.h - 10);
        this.x = clamp(this.x, this.leash[0], this.leash[1]);
        break;
      }
      case 'brute': {
        if (this.state === 'windup') {
          this.tState -= dt; this.vx *= 0.9;
          if (this.tState <= 0) { // УДАР
            this.state = 'chase'; this.atkCd = 1.8;
            AudioSys.sting(); Camera.shake(0.5);
            game.effects.push({ kind: 'ring', x: this.cx() + this.face * 60, y: WORLD.ground - 10, r: 10, max: 150, t: 0, dur: 0.4, color: '#ff5c6c' });
            Particles.dust(this.cx() + this.face * 60, WORLD.ground, 14);
            if (Math.abs(p.cx() - (this.cx() + this.face * 60)) < 110 && Math.abs(p.cy() - WORLD.ground) < 170) {
              p.takeDamage(this.dmg, game); p.vx += this.face * 380; p.vy = -300;
            }
          }
        } else if (chasing) {
          const dir = Math.sign(p.cx() - this.cx()) || 1;
          this.vx = lerp(this.vx, dir * this.speed, 1 - Math.pow(0.02, dt));
          if (this.atkCd <= 0 && Math.abs(p.cx() - this.cx()) < 120 && Math.abs(p.cy() - this.cy()) < 120) {
            this.state = 'windup'; this.tState = 0.55; AudioSys.bossRoar && AudioSys.noise(0.4, 0.2, 200, 1, 'lowpass', 0, 90);
          }
        } else {
          this.tState -= dt;
          if (this.tState <= 0) { this.tState = rand(1.5, 3); this.face *= -1; if (this.cx() < this.leash[0]) this.face = 1; if (this.cx() > this.leash[1]) this.face = -1; }
          this.vx = lerp(this.vx, this.face * 30, dt * 2);
        }
        this.vy += 1900 * dt;
        game.moveAndCollide(this, dt, false);
        this.tryTouch(p, game, dt, 1.6, 0.6);
        break;
      }
      case 'spider': {
        if (chasing) {
          if (this.onGround) {
            this.vx *= 0.85; this.tState -= dt;
            if (this.tState <= 0) {
              this.tState = rand(0.35, 0.7);
              const dir = Math.sign(p.cx() - this.cx()) || 1;
              this.vx = dir * rand(280, 420); this.vy = -rand(550, 780);
              AudioSys.syringe();
            }
          }
        } else {
          if (this.onGround) { this.vx *= 0.9; this.tState -= dt; if (this.tState <= 0) { this.tState = rand(0.8, 1.6); this.vx = this.face * rand(100, 200); this.vy = -rand(200, 350); if (Math.random() < 0.4) this.face *= -1; } }
        }
        this.vy += 1900 * dt;
        game.moveAndCollide(this, dt, false);
        this.tryTouch(p, game, dt, 1.2);
        break;
      }
      case 'double': {
        // телепортация, если далеко
        this.tState -= dt;
        if (this.tState <= 0) {
          this.tState = rand(3.5, 6);
          const d = dist(this.cx(), this.cy(), p.cx(), p.cy());
          if (d > 420 && chasing) {
            Particles.soul(this.cx(), this.cy(), 14);
            this.x = clamp(p.cx() + (Math.random() < 0.5 ? -1 : 1) * rand(180, 300) - this.w / 2, this.leash[0], this.leash[1]);
            this.y = WORLD.ground - this.h;
            Particles.soul(this.cx(), this.cy(), 14);
            AudioSys.whisper();
          }
        }
        if (chasing) {
          const dir = Math.sign(p.cx() - this.cx()) || 1;
          this.vx = lerp(this.vx, dir * this.speed, 1 - Math.pow(0.008, dt));
          // прыгает за игроком
          if (this.onGround && ((p.y < this.y - 60 && Math.abs(p.cx() - this.cx()) < 200) || (Math.abs(p.cx() - this.cx()) < 60 && Math.random() < dt * 3))) this.vy = -640;
          if (this.atkCd <= 0 && Math.abs(p.cx() - this.cx()) < 60 && Math.abs(p.cy() - this.cy()) < 80) {
            this.atkCd = 0.9; AudioSys.swing();
            p.takeDamage(this.dmg, game); p.san = clamp(p.san - 8, 0, 100);
            game.effects.push({ kind: 'slash', x: p.cx(), y: p.cy(), t: 0, dur: 0.2, face: dir });
          }
        } else {
          // стоит в углу и смотрит. жуть.
          this.vx *= 0.9;
        }
        this.vy += 1900 * dt;
        game.moveAndCollide(this, dt, false);
        break;
      }
    }
    return true;
  }

  tryTouch(p, game, dt, cd, mul = 1) {
    if (p.dead || this.touchCd > 0) return;
    if (aabb(this, p)) {
      this.touchCd = cd;
      p.takeDamage(Math.round(this.dmg * mul), game);
      p.vx += Math.sign(p.cx() - this.cx()) * 260;
    }
  }

  /* ---------- отрисовка призраков ---------- */
  draw(c) {
    if (this.dead) { c.globalAlpha = clamp(this.dieT / 0.5, 0, 1); }
    const cx = this.cx(), feet = this.y + this.h, t = this.animT;
    // тень
    if (this.type !== 'nurse') {
      c.fillStyle = 'rgba(0,0,0,0.45)';
      c.beginPath(); c.ellipse(cx, WORLD.ground + 3, this.w * 0.45, 6, 0, 0, 7); c.fill();
    }
    // аура освещённости (горит на свету)
    if (this.lit > 0.3 && !this.dead) {
      c.save(); c.globalAlpha = 0.35 + Math.sin(t * 20) * 0.1;
      c.strokeStyle = '#ffe9b0'; c.lineWidth = 2;
      c.strokeRect(this.x - 3, this.y - 3, this.w + 6, this.h + 6);
      c.restore();
      if (Math.random() < 0.3) Particles.spark(cx + rand(-this.w / 2, this.w / 2), this.y + rand(0, this.h), 1, '#ffe9b0');
    }
    c.save();
    if (this.hitT > 0) { c.globalAlpha *= 0.6; }
    switch (this.type) {
      case 'whisper': this.drawWhisper(c, cx, feet, t); break;
      case 'nurse': this.drawNurse(c, cx, this.cy(), t); break;
      case 'brute': this.drawBrute(c, cx, feet, t); break;
      case 'spider': this.drawSpider(c, cx, feet, t); break;
      case 'double': this.drawDouble(c, cx, feet, t); break;
    }
    c.restore();
    // полоска HP над ранеными
    if (this.hp < this.maxhp && !this.dead) {
      c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(cx - 22, this.y - 12, 44, 5);
      c.fillStyle = '#a31621'; c.fillRect(cx - 22, this.y - 12, 44 * clamp(this.hp / this.maxhp, 0, 1), 5);
    }
    c.globalAlpha = 1;
  }

  drawWhisper(c, cx, feet, t) {
    const jitter = Math.sin(t * 40) * 2, f = this.face;
    c.save(); c.translate(cx, feet); c.scale(f, 1);
    // лапы-сколопендры
    c.strokeStyle = '#0a0a0a'; c.lineWidth = 3; c.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const lx = -16 + i * 11, sw = Math.sin(t * 30 + i * 1.7) * 6;
      c.beginPath(); c.moveTo(lx, -10); c.lineTo(lx + sw, 0); c.stroke();
    }
    // тело — вытянутая тень
    c.fillStyle = '#0d0d14';
    c.beginPath(); c.ellipse(0, -14 + jitter * 0.5, 24, 13, 0, 0, 7); c.fill();
    c.fillStyle = '#161624';
    c.beginPath(); c.ellipse(-4, -17, 14, 8, -0.2, 0, 7); c.fill();
    // шипы на спине
    c.fillStyle = '#000';
    for (let i = 0; i < 5; i++) {
      const sx = -18 + i * 9;
      c.beginPath(); c.moveTo(sx, -24); c.lineTo(sx + 4, -34 - Math.sin(t * 24 + i) * 3); c.lineTo(sx + 8, -24); c.fill();
    }
    // голова с глазами
    c.fillStyle = '#0d0d14';
    c.beginPath(); c.ellipse(20, -16 + jitter, 11, 10, 0, 0, 7); c.fill();
    // большие белые глаза
    const blink = (Math.sin(t * 3.7) > 0.97) ? 0.15 : 1;
    c.fillStyle = '#f2f2e8';
    c.beginPath(); c.ellipse(22, -19 + jitter, 4, 4.5 * blink, 0, 0, 7); c.fill();
    c.beginPath(); c.ellipse(15, -16 + jitter, 2.6, 3 * blink, 0, 0, 7); c.fill();
    c.fillStyle = '#000';
    c.beginPath(); c.arc(23, -19 + jitter, 1.6 * blink, 0, 7); c.fill();
    // пасть с зубами-иголками
    const jaw = Math.abs(Math.sin(t * 9)) * 4;
    c.fillStyle = '#30060a';
    c.beginPath(); c.ellipse(21, -9 + jitter, 5, 2 + jaw, 0, 0, 7); c.fill();
    c.strokeStyle = '#cfc4ae'; c.lineWidth = 1;
    for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(17 + i * 2.6, -10 + jitter); c.lineTo(17 + i * 2.6, -6 + jaw + jitter); c.stroke(); }
    c.restore();
  }

  drawNurse(c, cx, cy, t) {
    const hover = Math.sin(t * 2.2) * 8, f = this.face;
    const screamOpen = this.atkCd > 1.8 ? (2.3 - this.atkCd) * 14 : 0;
    c.save(); c.translate(cx, cy + hover * 0.3);
    // подол-рваный саван
    c.fillStyle = 'rgba(210,205,195,0.92)';
    c.beginPath();
    c.moveTo(-14, -30); c.lineTo(14, -30); c.lineTo(20, 44);
    for (let i = 0; i < 6; i++) c.lineTo(14 - i * 6.5, 36 + ((i * 37 + t * 60) % 14));
    c.lineTo(-20, 44); c.closePath(); c.fill();
    // пятна крови
    c.fillStyle = 'rgba(120,10,20,0.75)';
    c.beginPath(); c.ellipse(-4, 10, 5, 9, 0.2, 0, 7); c.fill();
    c.beginPath(); c.ellipse(8, 28, 3, 5, -0.3, 0, 7); c.fill();
    // руки-ветки
    c.strokeStyle = '#c9bba6'; c.lineWidth = 5; c.lineCap = 'round';
    const armW = Math.sin(t * 3) * 6;
    c.beginPath(); c.moveTo(-10, -18); c.lineTo(-26 * f, -30 + armW); c.stroke();
    c.beginPath(); c.moveTo(10, -18); c.lineTo(26 * f, -30 - armW); c.stroke();
    // пальцы-иглы
    c.lineWidth = 1.6;
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      c.beginPath(); c.moveTo(s * 26 * f, -30 + (s < 0 ? armW : -armW));
      c.lineTo(s * 26 * f + s * f * 7, -36 + (s < 0 ? armW : -armW) + i * 3); c.stroke();
    }
    // голова
    c.fillStyle = '#ddd3c2';
    c.beginPath(); c.ellipse(0, -44, 11, 13, 0, 0, 7); c.fill();
    // волосы — чёрный водопад
    c.fillStyle = '#050505';
    c.beginPath(); c.ellipse(0, -50, 13, 10, 0, Math.PI, 0); c.fill();
    c.fillRect(-13, -50, 6, 34 + Math.sin(t * 4) * 4); c.fillRect(7, -50, 6, 30 + Math.cos(t * 3.4) * 4);
    // шапочка медсестры с красным крестом
    c.fillStyle = '#e8e2d4'; c.fillRect(-9, -62, 18, 8);
    c.fillStyle = '#a31621'; c.fillRect(-2, -61, 4, 6); c.fillRect(-4, -59.5, 8, 3);
    // глаза-провалы с потёками
    c.fillStyle = '#000';
    c.beginPath(); c.ellipse(-4.5 * 1, -44, 3.4, 5, 0, 0, 7); c.fill();
    c.beginPath(); c.ellipse(4.5, -44, 3.4, 5, 0, 0, 7); c.fill();
    c.fillStyle = 'rgba(20,5,15,0.9)';
    c.fillRect(-6.5, -40, 3.5, 12); c.fillRect(3, -40, 3.5, 15);
    // рот — вопль
    c.fillStyle = '#0a0208';
    c.beginPath(); c.ellipse(0, -32, 4 + screamOpen * 0.2, 3 + screamOpen + Math.abs(Math.sin(t * 7)) * 2, 0, 0, 7); c.fill();
    // крест на груди перевёрнутый
    c.strokeStyle = '#5c0a12'; c.lineWidth = 2.4;
    c.beginPath(); c.moveTo(0, -14); c.lineTo(0, -2); c.moveTo(-5, -9); c.lineTo(5, -9); c.stroke();
    c.restore();
  }

  drawBrute(c, cx, feet, t) {
    const breathe = Math.sin(t * 1.8) * 3, f = this.face;
    const windup = this.state === 'windup';
    c.save(); c.translate(cx, feet); c.scale(f, 1);
    // ноги-тумбы
    c.fillStyle = '#2b2530';
    c.fillRect(-22, -34, 18, 34); c.fillRect(5, -34, 18, 34);
    c.fillStyle = '#1a151e'; c.fillRect(-24, -8, 22, 8); c.fillRect(3, -8, 22, 8);
    // торс — смирительная рубаха из плоти
    const wob = windup ? -8 : breathe;
    c.fillStyle = '#8f8578';
    c.beginPath();
    c.moveTo(-30, -36); c.lineTo(30, -36); c.lineTo(36, -92 + wob); c.lineTo(-36, -92 + wob);
    c.closePath(); c.fill();
    // ремни
    c.fillStyle = '#3a3230';
    c.fillRect(-33, -70 + wob * 0.5, 66, 9); c.fillRect(-35, -48, 70, 8);
    c.fillStyle = '#8a8f96'; c.fillRect(8, -70 + wob * 0.5, 10, 9); c.fillRect(-16, -48, 10, 8);
    // швы
    c.strokeStyle = '#4a2020'; c.lineWidth = 1.6; c.setLineDash([4, 3]);
    c.beginPath(); c.moveTo(-20, -90); c.lineTo(-14, -38); c.stroke();
    c.beginPath(); c.moveTo(20, -90); c.lineTo(14, -38); c.stroke();
    c.setLineDash([]);
    // руки связаны за спиной — рукава узлом
    c.fillStyle = '#7a7063';
    c.beginPath(); c.ellipse(-38, -60, 8, 18, 0.3, 0, 7); c.fill();
    // кулаки-кувалды спереди (вырвались!)
    const armY = windup ? -120 : -40 + Math.sin(t * 1.8) * 4;
    c.fillStyle = '#9a8f7f';
    c.beginPath(); c.ellipse(30, armY, 13, 16, 0.2, 0, 7); c.fill();
    c.fillStyle = '#d8b89a';
    c.beginPath(); c.ellipse(32, armY + (windup ? -16 : 14), 11, 10, 0, 0, 7); c.fill();
    // голова маленькая, вросшая
    c.fillStyle = '#c9a184';
    c.beginPath(); c.ellipse(0, -100 + wob, 12, 11, 0, 0, 7); c.fill();
    // намордник
    c.fillStyle = '#2a2226'; c.fillRect(-10, -102 + wob, 20, 9);
    c.strokeStyle = '#111'; c.lineWidth = 1;
    for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(-10, -100 + i * 2.4 + wob); c.lineTo(10, -100 + i * 2.4 + wob); c.stroke(); }
    // глаза — налитые кровью
    const rage = this.alertT > 0;
    c.fillStyle = rage ? '#ff3b3b' : '#7a2020';
    c.beginPath(); c.arc(-5, -108 + wob, 2.6, 0, 7); c.arc(5, -108 + wob, 2.6, 0, 7); c.fill();
    if (rage) { c.shadowBlur = 10; c.shadowColor = '#f00'; c.fillRect(-7, -110 + wob, 14, 4); c.shadowBlur = 0; }
    // номер на груди
    c.fillStyle = '#2a2226'; c.font = '800 13px sans-serif'; c.fillText('00', -9, -56 + wob * 0.4);
    c.restore();
  }

  drawSpider(c, cx, feet, t) {
    const f = this.face, air = !this.onGround;
    c.save(); c.translate(cx, feet);
    // 6 суставчатых ног-капельниц
    c.strokeStyle = '#3a3f45'; c.lineWidth = 4; c.lineCap = 'round';
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      const bx = s * (10 + i * 8), lift = Math.sin(t * (air ? 26 : 10) + i * 2 + s) * (air ? 10 : 4);
      const kneeX = bx + s * 16, kneeY = -26 + lift, footX = bx + s * 26, footY = -2 - lift * 0.5;
      c.beginPath(); c.moveTo(bx * 0.5, -16); c.lineTo(kneeX, kneeY); c.lineTo(footX, footY); c.stroke();
      // игла на кончике
      c.strokeStyle = '#c9d2d8'; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(footX, footY); c.lineTo(footX + s * 5, footY + 5); c.stroke();
      c.strokeStyle = '#3a3f45'; c.lineWidth = 4;
    }
    // брюшко — больничная роба натянута
    c.fillStyle = '#5f737e';
    c.beginPath(); c.ellipse(-8, -24, 20, 14, -0.15, 0, 7); c.fill();
    c.fillStyle = 'rgba(120,10,20,0.6)';
    c.beginPath(); c.ellipse(-12, -20, 6, 8, 0.3, 0, 7); c.fill();
    // головогрудь с глазами
    c.fillStyle = '#d8c9b4';
    c.beginPath(); c.ellipse(14 * f, -26, 12, 11, 0, 0, 7); c.fill();
    // 6 глаз
    const eg = [[6, -32], [12, -34], [18, -32], [8, -27], [14, -28], [20, -27]];
    for (const [ex, ey] of eg) {
      c.fillStyle = '#fff'; c.beginPath(); c.arc(ex * f, ey, 3, 0, 7); c.fill();
      c.fillStyle = '#a31621'; c.beginPath(); c.arc(ex * f, ey, 1.5, 0, 7); c.fill();
    }
    // хелицеры-шприцы
    c.strokeStyle = '#8a8f96'; c.lineWidth = 3;
    const snap = Math.abs(Math.sin(t * 8)) * 5;
    c.beginPath(); c.moveTo(20 * f, -20); c.lineTo(26 * f, -12 - snap); c.stroke();
    c.beginPath(); c.moveTo(12 * f, -19); c.lineTo(16 * f, -10 - snap); c.stroke();
    c.fillStyle = 'rgba(150,220,255,0.7)'; c.fillRect(23 * f - 2, -14 - snap, 4, 5);
    // капельница на спине
    c.strokeStyle = '#666'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(-8, -36); c.lineTo(-8, -52); c.lineTo(2, -52); c.stroke();
    c.fillStyle = 'rgba(200,230,255,0.5)'; c.fillRect(-2, -52, 9, 14);
    c.fillStyle = 'rgba(120,200,255,0.7)'; c.fillRect(-2, -45, 9, 7);
    c.restore();
  }

  drawDouble(c, cx, feet, t) {
    const f = this.face;
    // глитч-срезы
    const glitch = Math.sin(t * 13) > 0.86;
    c.save(); c.translate(cx, feet); c.scale(f, 1);
    if (glitch) c.translate(rand(-8, 8), 0);
    const bob = Math.sin(t * 5) * 2;
    // ноги — чёрные
    c.fillStyle = '#0a0a0a';
    const sw = Math.sin(t * 8) * (Math.abs(this.vx) > 40 ? 9 : 1);
    for (const s of [-1, 1]) c.fillRect(-7 + s * 2, 30 - Math.abs(sw) * 0.3 + bob, 10, 28);
    // торс — негатив робы
    c.fillStyle = '#101014';
    c.fillRect(-10, 8 + bob, 20, 26);
    c.save(); c.translate(-7, 20 + bob); c.scale(f, 1); c.fillStyle = '#e8e8e8'; c.font = '700 7px sans-serif'; c.fillText('21№', 0, 0); c.restore(); // перевёрнутый номер
    // голова — бледная маска
    c.fillStyle = '#e8e2e2';
    c.beginPath(); c.ellipse(1, -2 + bob, 10, 12, 0, 0, 7); c.fill();
    c.fillStyle = '#000';
    c.beginPath(); c.ellipse(0, -11 + bob, 10, 6, 0, 0, 7); c.fill(); // волосы-тьма
    // глаза — БЕЛЫЕ провалы с чёрными слезами
    c.fillStyle = '#fff';
    c.fillRect(1, -4 + bob, 8, 6);
    c.fillStyle = '#000';
    c.beginPath(); c.arc(5, -1 + bob, 1.8, 0, 7); c.fill();
    c.fillStyle = 'rgba(0,0,0,0.85)'; c.fillRect(2, 2 + bob, 2.5, 9); c.fillRect(6.5, 2 + bob, 2.5, 12);
    // улыбка — слишком широкая
    c.strokeStyle = '#000'; c.lineWidth = 1.8;
    c.beginPath(); c.arc(3, 6 + bob, 7, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
    // руки — слишком длинные
    c.strokeStyle = '#e8e2e2'; c.lineWidth = 5; c.lineCap = 'round';
    const reach = Math.sin(t * 3) * 6;
    c.beginPath(); c.moveTo(0, 12 + bob); c.lineTo(-4, 44 + reach); c.stroke();
    c.beginPath(); c.moveTo(2, 12 + bob); c.lineTo(10, 46 - reach); c.stroke();
    c.restore();
    if (glitch) { // RGB-развод
      c.save(); c.globalAlpha = 0.5; c.globalCompositeOperation = 'lighter';
      c.fillStyle = '#f0f'; c.fillRect(cx - 14, feet - 64 + rand(0, 50), 28, 3);
      c.fillStyle = '#0ff'; c.fillRect(cx - 14, feet - 64 + rand(0, 50), 28, 2);
      c.restore();
    }
  }
}

/* ================= БОСС: ГЛАВВРАЧ ТАМИК ================= */
class Boss {
  constructor(x) {
    this.type = 'boss'; this.w = 96; this.h = 156;
    this.x = x; this.y = WORLD.ground - this.h;
    this.vx = 0; this.vy = 0; this.hp = 950; this.maxhp = 950;
    this.face = -1; this.onGround = true; this.state = 'intro';
    this.tState = 2.2; this.atkCd = 0; this.hitT = 0; this.dead = false; this.dieT = 0;
    this.animT = 0; this.lit = 0; this.leash = [4540, 5180];
    this.dashDir = 0; this.phase = 1;
  }
  cx() { return this.x + this.w / 2; }
  cy() { return this.y + this.h / 2; }
  curPhase() { const k = this.hp / this.maxhp; return k > 0.66 ? 1 : k > 0.33 ? 2 : 3; }

  takeDamage(dmg, game, dir = 0) {
    if (this.dead || this.state === 'intro') return;
    const bonus = this.lit > 0.3 ? 1.35 : 1;
    const total = Math.round(dmg * bonus);
    const oldPhase = this.phase;
    this.hp -= total; this.hitT = 0.12;
    AudioSys.ghostHit();
    Particles.ichor(this.cx(), this.cy(), 6);
    Floaters.add(this.cx(), this.y - 10, total, '#ff5c6c', 17);
    this.phase = this.curPhase();
    if (this.phase !== oldPhase) {
      AudioSys.bossRoar(); Camera.shake(0.8);
      game.toast(this.phase === 2 ? '☠ Тамик срывает халат! «СЕСТРА! ДЕРЖИ ЕГО!»' : '☠ «ДОЗА ТРИ! ДОЗА ТРИ!!!»', 'red');
      game.effects.push({ kind: 'ring', x: this.cx(), y: this.cy(), r: 20, max: 320, t: 0, dur: 0.7, color: '#ff5c6c' });
      // призыв при смене фазы
      game.summonMinions(this.cx(), this.phase);
    }
    if (this.hp <= 0) {
      this.hp = 0; this.dead = true; this.dieT = 2.4;
      AudioSys.bossDie(); Camera.shake(1);
      game.onBossDeath();
    }
  }

  update(dt, game) {
    this.animT += dt;
    if (this.hitT > 0) this.hitT -= dt;
    if (this.dead) {
      this.dieT -= dt;
      if (Math.random() < dt * 20) Particles.soul(this.cx() + rand(-40, 40), this.cy() + rand(-60, 40), 3);
      return this.dieT > 0;
    }
    const p = game.player;
    this.lit = Math.max(game.flashLit(this.cx(), this.cy()), game.lampLit(this.cx(), this.cy()));
    this.face = p.cx() >= this.cx() ? 1 : -1;
    if (this.atkCd > 0) this.atkCd -= dt;
    const speed = this.phase === 3 ? 190 : this.phase === 2 ? 150 : 115;

    switch (this.state) {
      case 'intro':
        this.tState -= dt; this.vx *= 0.9;
        if (this.tState <= 0) { this.state = 'chase'; AudioSys.bossRoar(); Camera.shake(0.6); }
        break;
      case 'chase': {
        const dir = Math.sign(p.cx() - this.cx()) || 1;
        const d = Math.abs(p.cx() - this.cx());
        this.vx = lerp(this.vx, dir * speed, 1 - Math.pow(0.02, dt));
        if (this.atkCd <= 0 && !p.dead) {
          const roll = Math.random();
          if (d < 150) { this.state = 'windup'; this.tState = 0.5; }
          else if (this.phase >= 2 && d > 260 && d < 620 && roll < 0.4) { this.state = 'dashTel'; this.tState = 0.6; this.dashDir = dir; AudioSys.sting(); }
          else if (roll < 0.62) { this.state = 'throw'; this.tState = 0.55; }
          else if (this.phase >= 2 && game.ghosts.length < 4) { this.state = 'summon'; this.tState = 0.9; AudioSys.scream(); }
          else if (this.phase >= 3 && d < 420) { this.state = 'nova'; this.tState = 0.8; AudioSys.bossRoar(); }
          else { this.state = 'throw'; this.tState = 0.55; }
        }
        break;
      }
      case 'windup': // взмах скальпелем
        this.tState -= dt; this.vx *= 0.9;
        if (this.tState <= 0) {
          this.state = 'chase'; this.atkCd = this.phase >= 3 ? 0.7 : 1.2;
          AudioSys.swing(); Camera.shake(0.4);
          game.effects.push({ kind: 'slash', x: this.cx() + this.face * 70, y: this.cy(), t: 0, dur: 0.22, face: this.face, big: true });
          if (Math.abs(p.cx() - (this.cx() + this.face * 70)) < 120 && Math.abs(p.cy() - this.cy()) < 130) {
            p.takeDamage(26, game); p.vx += this.face * 420; p.vy = -280;
          }
        }
        break;
      case 'throw': { // веер шприцов
        this.tState -= dt; this.vx *= 0.9;
        if (this.tState <= 0) {
          this.state = 'chase'; this.atkCd = this.phase >= 3 ? 1.0 : 1.6;
          AudioSys.syringe();
          const n = this.phase >= 3 ? 5 : 3;
          const base = Math.atan2(p.cy() - (this.y + 60), p.cx() - this.cx());
          for (let i = 0; i < n; i++) {
            const a = base + (i - (n - 1) / 2) * 0.16;
            game.spawnProjectile({ x: this.cx(), y: this.y + 60, vx: Math.cos(a) * 380, vy: Math.sin(a) * 380, r: 8, dmg: 12, san: 8, kind: 'syringe', life: 3 });
          }
        }
        break;
      }
      case 'dashTel':
        this.tState -= dt; this.vx = 0;
        if (this.tState <= 0) { this.state = 'dash'; this.tState = 0.5; this.vx = this.dashDir * 720; AudioSys.bossRoar(); Camera.shake(0.5); }
        break;
      case 'dash':
        this.tState -= dt;
        Particles.dust(this.cx(), WORLD.ground, 2);
        if (aabb(this, p) && p.iframes <= 0) { p.takeDamage(24, game); p.vx += this.dashDir * 500; p.vy = -320; }
        if (this.tState <= 0) { this.state = 'chase'; this.atkCd = 1.1; this.vx = 0; }
        break;
      case 'summon':
        this.tState -= dt; this.vx *= 0.9;
        if (this.tState <= 0) { this.state = 'chase'; this.atkCd = 2.0; game.summonMinions(this.cx(), 2); }
        break;
      case 'nova': // кольцо ужаса
        this.tState -= dt; this.vx *= 0.9;
        if (this.tState <= 0) {
          this.state = 'chase'; this.atkCd = 2.2;
          AudioSys.scream(); Camera.shake(0.7);
          game.effects.push({ kind: 'ring', x: this.cx(), y: this.cy(), r: 20, max: 420, t: 0, dur: 0.8, color: '#c77dff', dmg: 10, san: 30 });
        }
        break;
    }
    this.vy += 1900 * dt;
    game.moveAndCollide(this, dt, false);
    this.x = clamp(this.x, this.leash[0], this.leash[1] - this.w);
    return true;
  }

  draw(c) {
    if (this.dead) c.globalAlpha = clamp(this.dieT / 2.4, 0, 1);
    const cx = this.cx(), feet = this.y + this.h, t = this.animT, f = this.face;
    c.fillStyle = 'rgba(0,0,0,0.5)';
    c.beginPath(); c.ellipse(cx, feet + 3, 55, 9, 0, 0, 7); c.fill();
    if (this.lit > 0.3 && !this.dead) {
      c.save(); c.globalAlpha = 0.3; c.strokeStyle = '#ffe9b0'; c.lineWidth = 3;
      c.strokeRect(this.x - 4, this.y - 4, this.w + 8, this.h + 8); c.restore();
    }
    c.save(); c.translate(cx, feet); c.scale(f, 1);
    if (this.hitT > 0) c.globalAlpha *= 0.65;
    const breathe = Math.sin(t * 2) * 3;
    const rage = this.phase >= 3;
    // ноги
    c.fillStyle = '#1c1c22';
    const step = Math.sin(t * 6) * (Math.abs(this.vx) > 30 ? 8 : 0);
    c.fillRect(-24, -40, 20, 40 - Math.abs(step) * 0.3);
    c.fillRect(4, -40, 20, 40 - Math.abs(step) * 0.3);
    c.fillStyle = '#0a0a0a'; c.fillRect(-28, -10, 26, 10); c.fillRect(2, -10, 26, 10);
    // халат
    const coat = rage ? '#6b5a5a' : '#cfd2d4';
    c.fillStyle = coat;
    c.beginPath();
    c.moveTo(-30, -42); c.lineTo(30, -42); c.lineTo(38, -120 + breathe); c.lineTo(-38, -120 + breathe);
    c.closePath(); c.fill();
    // кровавый передник
    c.fillStyle = rage ? '#5c0a12' : 'rgba(140,15,25,0.85)';
    c.beginPath();
    c.moveTo(-16, -44); c.lineTo(16, -44); c.lineTo(20, -116 + breathe); c.lineTo(-20, -116 + breathe);
    c.closePath(); c.fill();
    c.fillStyle = '#3d0510';
    for (let i = 0; i < 4; i++) { c.beginPath(); c.ellipse(-10 + i * 7, -60 - i * 12, 3, 6, 0, 0, 7); c.fill(); }
    // стетоскоп
    c.strokeStyle = '#222'; c.lineWidth = 3;
    c.beginPath(); c.arc(0, -108 + breathe, 12, 0.3, Math.PI - 0.3); c.stroke();
    // бейдж «ТАМИК»
    c.fillStyle = '#f2f2f2'; c.fillRect(-34, -100 + breathe, 26, 12);
    c.save(); c.translate(-32, -91 + breathe); c.scale(f, 1); c.fillStyle = '#a31621'; c.font = '800 8px sans-serif'; c.fillText('ТАМИК', 0, 0); c.restore();
    // левая рука — скальпель
    const wind = this.state === 'windup' ? -50 : Math.sin(t * 2) * 6;
    c.strokeStyle = coat; c.lineWidth = 12; c.lineCap = 'round';
    c.beginPath(); c.moveTo(20, -110 + breathe); c.lineTo(44, -80 + wind); c.stroke();
    c.fillStyle = '#d8b89a'; c.beginPath(); c.arc(44, -78 + wind, 8, 0, 7); c.fill();
    c.fillStyle = '#dfe8ee'; // скальпель
    c.save(); c.translate(44, -78 + wind); c.rotate(wind > -10 ? 0.7 : -0.6);
    c.fillRect(0, -2, 34, 5); c.fillStyle = '#333'; c.fillRect(-10, -2.5, 12, 6); c.restore();
    // правая рука — шприц-рука (протез!)
    c.strokeStyle = '#8a8f96'; c.lineWidth = 10;
    c.beginPath(); c.moveTo(-20, -110 + breathe); c.lineTo(-42, -88); c.stroke();
    c.fillStyle = 'rgba(180,230,255,0.55)'; c.fillRect(-52, -96, 12, 26); // колба
    c.fillStyle = 'rgba(120,200,120,0.8)'; c.fillRect(-52, -84, 12, 14);  // «Тишина»
    c.fillStyle = '#c9d2d8'; c.fillRect(-49, -70, 5, 14); // игла
    // голова
    c.fillStyle = '#d8b89a';
    c.beginPath(); c.ellipse(0, -136 + breathe, 15, 17, 0, 0, 7); c.fill();
    // зеркало-лобник (светится!)
    c.fillStyle = '#2a2a2a'; c.fillRect(-15, -150 + breathe, 30, 6);
    const lampG = c.createRadialGradient(6, -143 + breathe, 1, 6, -143 + breathe, 12);
    lampG.addColorStop(0, '#fff'); lampG.addColorStop(1, 'rgba(255,240,200,0)');
    c.fillStyle = lampG; c.beginPath(); c.arc(6, -143 + breathe, 12, 0, 7); c.fill();
    c.fillStyle = rage ? '#ff3b3b' : '#1a1a1a';
    c.beginPath(); c.arc(-3, -134 + breathe, 2.6, 0, 7); c.fill();
    // усы + оскал
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
const FURN_SIZES = {
  cabinet: [70, 112], nightstand: [58, 62], bed: [150, 56], locker: [82, 132],
  shelf: [120, 150], gurney: [132, 52], fridge: [92, 122],
};
class Furniture {
  constructor(def) {
    this.id = def.id; this.type = def.type;
    const [w, h] = FURN_SIZES[def.type];
    this.w = w; this.h = h; this.x = def.x; this.y = WORLD.ground - h;
    this.loot = def.loot.slice(); this.opened = false;
    this.solid = (def.type === 'bed' || def.type === 'gurney');
    this.seed = def.x * 7 + def.y;
  }
  cx() { return this.x + this.w / 2; }
  label() {
    const n = { cabinet: 'шкафчик', nightstand: 'тумбочку', bed: 'койку', locker: 'шкаф', shelf: 'стеллаж', gurney: 'каталку', fridge: 'холодильник' }[this.type];
    return this.opened ? 'Пусто… уже обыскано' : `Обыскать: ${n}`;
  }
  draw(c, t) {
    const x = this.x, y = this.y, w = this.w, h = this.h;
    c.fillStyle = 'rgba(0,0,0,0.4)';
    c.beginPath(); c.ellipse(x + w / 2, WORLD.ground + 3, w * 0.55, 5, 0, 0, 7); c.fill();
    const open = this.opened;
    switch (this.type) {
      case 'cabinet': {
        c.fillStyle = '#4a3b28'; c.fillRect(x, y, w, h);
        c.fillStyle = '#5a4a34'; c.fillRect(x + 4, y + 4, w - 8, h - 8);
        c.fillStyle = '#2a2118'; c.fillRect(x + w / 2 - 1, y + 4, 2, h - 8);
        c.fillStyle = open ? '#14100a' : '#241c12'; c.fillRect(x + 8, y + 10, w - 16, h - 20);
        if (!open) { // пузырьки внутри
          c.fillStyle = 'rgba(150,200,220,0.5)';
          const r = mulberry32(this.seed);
          for (let i = 0; i < 6; i++) c.fillRect(x + 12 + r() * (w - 26), y + 20 + r() * (h - 40), 5, 12);
        }
        c.fillStyle = '#8a8f96'; c.fillRect(x + w / 2 - 8, y + h / 2, 4, 10); c.fillRect(x + w / 2 + 4, y + h / 2, 4, 10);
        break;
      }
      case 'nightstand': {
        c.fillStyle = '#3d3226'; c.fillRect(x, y, w, h);
        c.fillStyle = '#2a231a';
        c.fillRect(x + 6, y + 8, w - 12, open ? 6 : 18);
        if (open) { c.fillStyle = '#0a0805'; c.fillRect(x + 6, y + 14, w - 12, 14); }
        c.fillRect(x + 6, y + 34, w - 12, 18);
        c.fillStyle = '#8a8f96'; c.beginPath(); c.arc(x + w / 2, y + (open ? 11 : 17), 3, 0, 7); c.fill();
        c.beginPath(); c.arc(x + w / 2, y + 43, 3, 0, 7); c.fill();
        // стакан воды сверху
        c.fillStyle = 'rgba(180,220,230,0.4)'; c.fillRect(x + 10, y - 12, 10, 12);
        break;
      }
      case 'bed': {
        // каркас
        c.fillStyle = '#3a3f45'; c.fillRect(x, y + 10, w, 8);
        c.fillRect(x + 4, y - 34, 6, 44 + h - 10); c.fillRect(x + w - 10, y - 34, 6, 44 + h - 10);
        c.fillRect(x + 4, y - 34, w - 8, 6);
        // матрас + простыня
        c.fillStyle = open ? '#9a9484' : '#b8b2a2'; c.fillRect(x, y + 2, w, 14);
        c.fillStyle = '#7d8894'; c.fillRect(x + w * 0.4, y + 2, w * 0.6, 14); // одеяло
        // подушка
        c.fillStyle = '#cfc8b8'; c.beginPath(); c.ellipse(x + 22, y, 18, 7, 0, 0, 7); c.fill();
        if (!open && this.seed % 3 === 0) { // силуэт под одеялом?!
          c.fillStyle = 'rgba(60,60,66,0.85)';
          c.beginPath(); c.ellipse(x + w * 0.55, y - 2, 34, 10, 0, 0, 7); c.fill();
        }
        c.fillStyle = '#2a2a2a';
        c.fillRect(x + 8, y + 18, 8, WORLD.ground - y - 18); c.fillRect(x + w - 16, y + 18, 8, WORLD.ground - y - 18);
        break;
      }
      case 'locker': {
        c.fillStyle = '#37474f'; c.fillRect(x, y, w, h);
        c.fillStyle = '#2b383f'; c.fillRect(x + 4, y + 4, w / 2 - 8, h - 8); c.fillRect(x + w / 2 + 4, y + 4, w / 2 - 8, h - 8);
        // вентиляция
        c.fillStyle = '#1a2327';
        for (let i = 0; i < 4; i++) { c.fillRect(x + 10, y + 12 + i * 8, w / 2 - 20, 3); c.fillRect(x + w / 2 + 10, y + 12 + i * 8, w / 2 - 20, 3); }
        c.fillStyle = '#8a8f96'; c.fillRect(x + w / 2 - 6, y + h / 2, 4, 12); c.fillRect(x + w / 2 + 2, y + h / 2, 4, 12);
        if (open) { c.fillStyle = '#0a0d0e'; c.fillRect(x + 6, y + 40, w - 12, h - 48); }
        c.fillStyle = 'rgba(120,10,20,0.5)'; c.beginPath(); c.ellipse(x + w - 12, y + h - 14, 5, 9, 0.2, 0, 7); c.fill();
        break;
      }
      case 'shelf': {
        c.fillStyle = '#33302a'; c.fillRect(x, y, w, h);
        for (let s = 0; s < 3; s++) {
          const sy = y + 10 + s * ((h - 20) / 3);
          c.fillStyle = '#1c1a16'; c.fillRect(x + 6, sy, w - 12, (h - 20) / 3 - 6);
          // книги/коробки
          const r = mulberry32(this.seed + s * 99);
          for (let i = 0; i < 7; i++) {
            const bw = 8 + r() * 8, bh = 16 + r() * 14;
            c.fillStyle = ['#5c3a3a', '#3a4a5c', '#4a5c3a', '#5c5c3a', '#4a3a5c'][(r() * 5) | 0];
            if (!open || r() < 0.5) c.fillRect(x + 10 + i * 15, sy + (h - 20) / 3 - 8 - bh, bw, bh);
          }
        }
        break;
      }
      case 'gurney': {
        c.strokeStyle = '#5a6066'; c.lineWidth = 4;
        c.beginPath(); c.moveTo(x + 10, y + 30); c.lineTo(x + 10, WORLD.ground - 8); c.moveTo(x + w - 10, y + 30); c.lineTo(x + w - 10, WORLD.ground - 8); c.stroke();
        c.fillStyle = '#2a2a2a';
        c.beginPath(); c.arc(x + 10, WORLD.ground - 6, 6, 0, 7); c.arc(x + w - 10, WORLD.ground - 6, 6, 0, 7); c.fill();
        c.fillStyle = '#6b7680'; c.fillRect(x, y + 22, w, 10);
        c.fillStyle = open ? '#8f8a7c' : '#a8a296'; c.fillRect(x + 2, y + 12, w - 4, 12);
        if (!open) { // накрытое тело?..
          c.fillStyle = 'rgba(200,195,180,0.95)';
          c.beginPath(); c.ellipse(x + w / 2, y + 8, w / 2 - 6, 10, 0, 0, 7); c.fill();
          c.fillStyle = 'rgba(120,10,20,0.55)';
          c.beginPath(); c.ellipse(x + w / 2 + 18, y + 6, 8, 5, 0.3, 0, 7); c.fill();
        }
        break;
      }
      case 'fridge': {
        c.fillStyle = '#6a7076'; c.fillRect(x, y, w, h);
        c.fillStyle = '#595f65'; c.fillRect(x + 4, y + 4, w - 8, h - 8);
        c.fillStyle = '#33383d'; c.fillRect(x + w - 16, y + 30, 6, 30); // ручка
        c.fillStyle = '#a31621'; c.font = '800 11px sans-serif'; c.fillText('МОРГ', x + 10, y + 24);
        c.strokeStyle = 'rgba(150,200,220,0.5)'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(x + 6, y + 40); c.lineTo(x + w - 6, y + 40); c.stroke();
        if (open) { // приоткрыт: холод и тьма
          c.fillStyle = '#05070a'; c.fillRect(x + 8, y + 46, w - 16, h - 54);
          c.fillStyle = 'rgba(150,200,230,0.25)'; c.fillRect(x + 8, y + 46, w - 16, 20);
        } else { c.fillStyle = '#22262b'; c.fillRect(x + 8, y + 46, w - 16, h - 54); }
        break;
      }
    }
    // блик «можно обыскать»
    if (!open) {
      const tw = 0.5 + Math.sin(t * 4 + this.x) * 0.5;
      c.save(); c.globalAlpha = 0.35 + tw * 0.4;
      c.fillStyle = '#ffd166'; c.shadowBlur = 12; c.shadowColor = '#ffd166';
      const bx = x + w / 2, by = y - 16 - Math.sin(t * 3) * 4;
      c.beginPath();
      c.moveTo(bx, by - 7); c.lineTo(bx + 2.5, by - 2.5); c.lineTo(bx + 7, by); c.lineTo(bx + 2.5, by + 2.5);
      c.lineTo(bx, by + 7); c.lineTo(bx - 2.5, by + 2.5); c.lineTo(bx - 7, by); c.lineTo(bx - 2.5, by - 2.5);
      c.closePath(); c.fill(); c.restore();
    }
  }
}

/* ================= ДВЕРИ ================= */
class Door {
  constructor(def) {
    this.id = def.id; this.x = def.x; this.w = 44; this.h = 132;
    this.y = WORLD.ground - this.h;
    this.locked = def.locked; this.name = def.name;
    this.open = false; this.anim = 0; // 0 закрыта, 1 открыта
  }
  get solid() { return this.anim < 0.7; }
  update(dt) {
    const target = this.open ? 1 : 0;
    this.anim = clamp(this.anim + (target ? dt * 1.6 : -dt * 2.2), 0, 1);
  }
  draw(c) {
    const x = this.x - this.w / 2, y = this.y;
    // проём и рама
    c.fillStyle = '#0a0c0d'; c.fillRect(x - 8, y - 12, this.w + 16, this.h + 12);
    c.fillStyle = this.locked === 'boss' ? '#5c0a12' : '#3a3f45';
    c.fillRect(x - 8, y - 12, this.w + 16, 12);
    c.fillRect(x - 8, y, 8, this.h); c.fillRect(x + this.w, y, 8, this.h);
    // табличка
    c.fillStyle = '#111';
    c.fillRect(x - 4, y - 34, this.w + 8, 20);
    c.fillStyle = this.locked === 'boss' ? '#ff5c6c' : '#ffd166';
    c.font = '700 9px sans-serif'; c.textAlign = 'center';
    c.fillText(this.name.toUpperCase().slice(0, 14), this.x, y - 20);
    c.textAlign = 'left';
    // полотно (уезжает вверх)
    const lift = this.anim * (this.h - 6);
    const py = y - lift;
    if (this.locked === 'boss') {
      c.fillStyle = '#4a0d14'; c.fillRect(x, py, this.w, this.h);
      c.fillStyle = '#6b1220'; c.fillRect(x + 4, py + 6, this.w - 8, this.h - 12);
      // руны-царапины
      c.strokeStyle = '#ff5c6c'; c.lineWidth = 1.4; c.globalAlpha = 0.6 + Math.sin(performance.now() / 300) * 0.3;
      c.beginPath(); c.moveTo(x + 8, py + 30); c.lineTo(x + this.w - 8, py + 50); c.moveTo(x + this.w - 8, py + 30); c.lineTo(x + 8, py + 50);
      c.moveTo(x + this.w / 2, py + 60); c.lineTo(x + this.w / 2, py + 100); c.stroke();
      c.globalAlpha = 1;
    } else if (this.locked === 'key_red') {
      c.fillStyle = '#3a3f45'; c.fillRect(x, py, this.w, this.h);
      c.strokeStyle = '#22262b'; c.lineWidth = 4;
      for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(x, py + 12 + i * 24); c.lineTo(x + this.w, py + 12 + i * 24); c.stroke(); }
      c.fillStyle = '#a31621'; c.beginPath(); c.arc(x + this.w / 2, py + 40, 8, 0, 7); c.fill(); // красный замок
      c.fillStyle = '#ffd166'; c.fillRect(x + this.w / 2 - 2, py + 38, 4, 8);
    } else {
      c.fillStyle = '#4a4438'; c.fillRect(x, py, this.w, this.h);
      c.fillStyle = '#3a352c'; c.fillRect(x + 6, py + 10, this.w - 12, this.h - 20);
      c.fillStyle = '#8a8f96'; c.fillRect(x + this.w - 12, py + this.h / 2, 6, 12);
    }
    // значок замка
    if (!this.open && this.locked) {
      c.font = '16px sans-serif'; c.textAlign = 'center';
      c.fillText(this.locked === 'boss' ? '☠' : '🔒', this.x, y + this.h / 2);
      c.textAlign = 'left';
    }
  }
}

/* ================= ПОДБОРЫ ================= */
class Pickup {
  constructor(def) {
    this.id = def.id; this.kind = def.kind; this.x = def.x; this.y = def.y;
    this.taken = false; this.ph = rand(0, 6);
  }
  label() {
    const k = this.kind;
    if (k === 'knife') return 'Взять: НОЖ 🔪';
    if (k === 'pistol') return 'Взять: ПИСТОЛЕТ 🔫';
    if (k === 'pick') return 'Взять: ЗАТЫЧКУ 🥄';
    if (k === 'key_red') return 'Взять: КРАСНЫЙ КЛЮЧ 🔑';
    if (k === 'medkit') return 'Взять: аптечку 🩹';
    if (k === 'pills') return 'Взять: пилюли 💊';
    if (k.startsWith('ammo')) return `Взять: патроны ×${k.split(':')[1]}`;
    if (k.startsWith('note')) return 'Читать: ЗАПИСКУ 📄';
    return 'Взять';
  }
  draw(c, t) {
    const bob = Math.sin(t * 3 + this.ph) * 5;
    const gy = WORLD.ground - this.y + bob; // this.y — высота над полом? нет: y — коорд. верха платформы
    const y = this.y - 14 + bob;
    // свечение
    c.save();
    c.globalAlpha = 0.5 + Math.sin(t * 4 + this.ph) * 0.2;
    const g = c.createRadialGradient(this.x, y, 2, this.x, y, 44);
    const col = this.kind.startsWith('note') ? '255,209,102' : this.kind.startsWith('ammo') ? '255,150,80' : '150,255,170';
    g.addColorStop(0, `rgba(${col},0.5)`); g.addColorStop(1, `rgba(${col},0)`);
    c.fillStyle = g; c.beginPath(); c.arc(this.x, y, 44, 0, 7); c.fill();
    c.restore();
    c.font = '30px sans-serif'; c.textAlign = 'center';
    const em = { knife: '🔪', pistol: '🔫', pick: '🥄', key_red: '🔑', medkit: '🩹', pills: '💊' };
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
    this.kind = o.kind; this.life = o.life || 3; this.dead = false; this.ph = rand(0, 6);
  }
  update(dt, game) {
    this.life -= dt; this.ph += dt;
    if (this.life <= 0) { this.dead = true; return; }
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (this.kind === 'syringe') this.vy += 500 * dt;
    const p = game.player;
    if (!p.dead && dist(this.x, this.y, p.cx(), p.cy()) < this.r + 22) {
      this.dead = true;
      p.takeDamage(this.dmg, game);
      if (this.kind === 'wail') { p.slowT = 1.2; }
      if (this.san) { p.san = clamp(p.san - this.san, 0, 100); Floaters.add(p.cx(), p.y - 14, `-${this.san} RASS`, '#c77dff', 15); }
      Particles.ichor(this.x, this.y, 6, this.kind === 'wail' ? '#4a1d6b' : '#1a3a4a');
      return;
    }
    if (this.y > WORLD.ground || this.x < 0 || this.x > WORLD.w) this.dead = true;
  }
  draw(c) {
    c.save(); c.translate(this.x, this.y);
    if (this.kind === 'syringe') {
      c.rotate(Math.atan2(this.vy, this.vx));
      c.fillStyle = 'rgba(180,230,255,0.7)'; c.fillRect(-10, -3, 16, 6);
      c.fillStyle = 'rgba(120,220,120,0.9)'; c.fillRect(-4, -3, 10, 6);
      c.fillStyle = '#dfe8ee'; c.fillRect(6, -1, 10, 2);
    } else { // вопль — кольцо с черепом
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
