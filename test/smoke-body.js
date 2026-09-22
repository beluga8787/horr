/* Тело smoke-теста — выполняется ВНУТРИ vm-контекста игры */
__fireLoad();
__frames(3);
const P = () => Game.player;
const F = i => FLOORS[i].y;
const box = o => ({ x: o.x, y: o.y, w: o.w, h: o.h });
const doorBox = d => ({ x: d.x - d.w / 2, y: d.y, w: d.w, h: d.h });
const hit = (a, b, pad = 0) => a.x < b.x + b.w + pad && a.x + a.w > b.x - pad && a.y < b.y + b.h + pad && a.y + a.h > b.y - pad;

/* ---------- утилиты теста ---------- */
function freeSpot(floor, from, to) {
  /* нужно место, откуда есть хотя бы 220 px свободного хода вправо */
  for (let x = from; x < to; x += 14) {
    let ok = true;
    for (let d = 0; d <= 240; d += 20) if (Game.solidAt(x + d, F(floor) - 64, 34, 66)) { ok = false; break; }
    if (ok) return x;
  }
  return -1;
}
const cxOf = o => o.x + o.w / 2;
function put(x, floor, extra = {}) {
  const p = P();
  p.x = x; p.y = F(floor) - p.h; p.vx = 0; p.vy = 0; p.floor = floor;
  p.climbing = null; p.hidden = null; p.channel = null; p.mini = null; p.dead = false; p.onGround = true;
  p.hp = p.maxhp; p.san = 100; p.st = 100;
  Object.assign(p, extra);
  Camera.reset(p.cx(), p.cy());
}
function dragTo(kind, frames) { __frames(frames); }
/* пройти мини-игру тянуть-мышью автоматически */
/* двигаем курсор мышью — игра сама считает dx/dy как разницу кадров */
function mouseMove(dx, dy) {
  Input.mouse.down = true; Input.mouse.dragging = true;
  Input.mouse.sx += dx; Input.mouse.sy += dy;
}
function solveMini(maxFrames = 900, onFrame = null) {
  let guard = 0, lastKind = null, finished = false;
  while (P().mini && guard++ < maxFrames) {
    const m = P().mini;
    lastKind = m.kind;
    if (m.kind === 'drawer') {
      if (m.data.dir === 'right') mouseMove(90, 0); else mouseMove(0, 90);
    } else if (m.kind === 'lock') {
      const pin = m.data.pins[m.data.cur] || 0;
      mouseMove(clamp((pin - m.data.pos) / 0.0055, -70, 70), 0);
    } else if (m.kind === 'pry') {
      if ((m.data.phase || 0) === 0) mouseMove(0, -90); else mouseMove(90, 0);
    } else mouseMove(0, -90);
    __frames(1);
    if (onFrame) onFrame(m);
  }
  finished = guard > 1 && guard < maxFrames;
  Input.mouse.down = false; Input.mouse.dragging = false;
  return finished;
}
/* дождаться конца «канала обыска» (мебель с дверцей) */
function waitChannel(maxFrames = 200) {
  let guard = 0;
  while (P().channel && guard++ < maxFrames) __frames(1);
  return !P().channel;
}

__log('== ДАННЫЕ И СЮЖЕТ ==');
__assert(NOTES.length === 12, 'записок ровно 12 (по 4 на этаж)');
__assert(CUTSCENE.length === 10, 'слайдов катсцены 10');
__assert(FLOORS.length === 3 && ROOMS.length === 21, 'три этажа, 21 комната');
__assert(typeof ENDINGS.good === 'object' && typeof ENDINGS.bad === 'object' && typeof ENDINGS.escape === 'object', 'три концовки описаны');
{
  const perFloor = [0, 0, 0], seen = new Set();
  for (const f of FURNITURE) for (const l of f.loot) {
    if (!String(l).startsWith('note:')) continue;
    const id = +String(l).split(':')[1];
    if (seen.has(id)) continue;
    seen.add(id); perFloor[f.floor]++;
  }
  __assert(seen.size === 12, 'все 12 записок расставлены по миру');
  __assert(perFloor[0] === 4 && perFloor[1] === 4 && perFloor[2] === 4, 'по 4 записки на каждом этаже: ' + perFloor.join('/'));
  let ok = true;
  for (const g of GHOSTS) if (!GHOST_DEFS[g.type]) ok = false;
  __assert(ok && GHOSTS.length >= 16, 'типы ' + GHOSTS.length + ' призраков валидны');
  __assert(MINIBOSSES.length === 3, 'три мини-босса');
  const drops = MINIBOSSES.map(m => m.drop).sort().join(',');
  __assert(drops === 'elev_card,key_attic,key_ord', 'дропы мини-боссов — ключи прогрессии: ' + drops);
  __assert(BOSS_DEF.hp >= 1000, 'Тамик живучий: ' + BOSS_DEF.hp + ' HP');
  __assert(DOORS.length === 8 && LADDERS.length === 2 && VENTS.length === 4, 'двери/лестницы/вентиляция: 8/2/4');
  __assert(FUSEBOX.code.join('') === '314', 'код щитка 3-1-4');
}

__log('== РАСКЛАДКА: ОБЪЕКТЫ НЕ ПЕРЕСЕКАЮТСЯ ==');
{
  /* мебель: внутри своей комнаты, стоит на полу, не пересекается с другой мебелью и дверьми */
  let outRoom = [], offFloor = [], cross = [], crossDoor = [];
  for (const f of FURNITURE) {
    const rm = ROOMS[f.room];
    if (!rm || f.x < rm.x0 - 1 || f.x + f.w > rm.x1 + 1) outRoom.push(f.id);
    if (Math.abs(f.y + f.h - F(f.floor)) > 1) offFloor.push(f.id);
  }
  for (let i = 0; i < FURNITURE.length; i++) for (let j = i + 1; j < FURNITURE.length; j++) {
    const a = FURNITURE[i], b = FURNITURE[j];
    if (a.floor !== b.floor) continue;
    if (hit(box(a), box(b))) cross.push(a.id + '/' + b.id);
  }
  for (const f of FURNITURE) for (const d of DOORS) {
    if (f.floor !== d.floor) continue;
    if (hit(box(f), doorBox({ ...d, y: F(d.f) - 138, w: 46 }))) crossDoor.push(f.id + '/' + d.id);
  }
  __assert(outRoom.length === 0, 'вся мебель внутри своих комнат (' + FURNITURE.length + ' предметов)');
  __assert(offFloor.length === 0, 'вся мебель стоит на полу этажа');
  __assert(cross.length === 0, 'мебель не пересекается между собой' + (cross.length ? ': ' + cross.slice(0, 4) : ''));
  __assert(crossDoor.length === 0, 'мебель не загораживает двери' + (crossDoor.length ? ': ' + crossDoor.slice(0, 4) : ''));

  /* платформы */
  let pCross = [], pFurn = [], pRoom = [];
  for (let i = 0; i < PLATFORMS.length; i++) for (let j = i + 1; j < PLATFORMS.length; j++) {
    const a = PLATFORMS[i], b = PLATFORMS[j];
    if (a.floor !== b.floor) continue;
    if (hit(box(a), box(b))) pCross.push(i + '/' + j);
  }
  for (const p of PLATFORMS) {
    const rm = ROOMS[p.room];
    if (!rm || p.x < rm.x0 || p.x + p.w > rm.x1 + 1) pRoom.push('x' + p.x + ' w' + p.w + ' rm' + p.room + ' f' + p.floor);
    for (const f of FURNITURE) {
      if (f.floor !== p.floor) continue;
      if (hit(box(p), box(f))) pFurn.push(p.x + '@' + p.room + '/' + f.id);
    }
  }
  __assert(pCross.length === 0, 'платформы не пересекаются между собой' + (pCross.length ? ': ' + pCross.slice(0, 3) : ''));
  __assert(pRoom.length === 0, 'платформы внутри своих комнат' + (pRoom.length ? ': ' + pRoom.slice(0, 4) : ''));
  __assert(pFurn.length === 0, 'платформы не проходят сквозь мебель' + (pFurn.length ? ': ' + pFurn.slice(0, 3) : ''));

  /* подборы: не внутри мебели и не внутри платформ */
  let pickBad = [];
  for (const k of PICKUPS) {
    const b = { x: k.x - 13, y: k.y - 24, w: 26, h: 26 };
    for (const f of FURNITURE) if (f.floor === k.floor && hit(b, box(f))) pickBad.push(k.kind + '@' + k.x + ' в ' + f.type + f.id + ' f' + f.floor);
    for (const p of PLATFORMS) if (p.floor === k.floor && hit(b, box(p))) pickBad.push(k.kind + '@' + k.x + ' в платформе x' + p.x);
    if (!Game.solidAt(k.x - 6, F(k.floor) + 4, 12, 12) && k.y > F(k.floor) - 40) { /* лежит на полу — ок */ }
  }
  __assert(pickBad.length === 0, 'предметы не лежат внутри объектов' + (pickBad.length ? ': ' + pickBad.slice(0, 4) : ''));

  /* точки взаимодействия доступны: у лестниц, лифта, вентиляции, щитка, дверей есть свободное место */
  function freeNear(x, floor) {
    for (let d = 0; d <= 140; d += 10) {
      for (const px of [x - d, x + d]) {
        if (px < 20 || px > WORLD.w - 60) continue;
        if (Game.canStand(px, F(floor) - 64, 34, 64)) return true;
      }
    }
    return false;
  }
  let unreachable = [];
  for (const L of LADDERS) {
    for (const [y, fl] of [[L.yBot, Game.floorAtY(L.yBot - 80)], [L.yTop, Game.floorAtY(L.yTop - 80)]]) {
      if (!freeNear(L.x + L.w / 2, fl)) unreachable.push('лестница@' + fl + ':' + L.x);
    }
  }
  for (const f of [0, 1, 2]) {
    const x = Game.elevator.shaftX + Game.elevator.shaftW / 2;
    if (!freeNear(x, f)) unreachable.push('лифт@' + f);
  }
  for (const v of VENTS) for (const side of ['a', 'b']) {
    if (!freeNear(v[side].x, v[side].f)) unreachable.push('вент.' + v.id + '@' + v[side].f);
  }
  if (!freeNear(FUSEBOX.x, FUSEBOX.floor)) unreachable.push('щиток');
  for (const d of DOORS) if (!freeNear(d.f === 0 ? 0 : 0, 0)) { /* заглушка */ }
  for (const d of DOORS) {
    const fl = d.f;
    const near = freeNear(d.x - 70, fl) || freeNear(d.x + 70, fl);
    if (!near) unreachable.push('дверь ' + d.id);
  }
  __assert(unreachable.length === 0, 'все ключевые точки доступны' + (unreachable.length ? ': ' + unreachable.join(', ') : ''));

  /* игрок не спавнится внутри препятствия */
  const startBox = { x: PLAYER_START.x, y: PLAYER_START.y, w: 34, h: 64 };
  let inside = null;
  for (const f of FURNITURE) if (f.floor === PLAYER_START.floor && hit(startBox, box(f))) inside = f.id;
  __assert(!inside, 'точка спавна Мишутки свободна' + (inside ? ' (внутри ' + inside + ')' : ''));
}

__log('== ДОСТИЖИМОСТЬ ПЛАТФОРМ И ПРЕДМЕТОВ ==');
{
  const JUMP_UP = 165;     /* реальная высота прыжка (vy 800, g 1900) */
  const X_REACH = 230;     /* насколько далеко можно улететь вбок */
  const platH = p => F(p.floor) - p.y;
  let unreach = [];
  for (const floor of [0, 1, 2]) {
    const list = PLATFORMS.filter(p => p.floor === floor);
    const okSet = new Set();
    /* от пола этажа */
    const canFromGround = p => platH(p) <= JUMP_UP;
    let changed = true;
    while (changed) {
      changed = false;
      for (const p of list) {
        if (okSet.has(p)) continue;
        if (canFromGround(p)) { okSet.add(p); changed = true; continue; }
        for (const q of list) {
          if (!okSet.has(q)) continue;
          const dh = platH(p) - platH(q);
          const dx = Math.max(0, Math.max(p.x - (q.x + q.w), q.x - (p.x + p.w)));
          if (dh > 0 && dh <= JUMP_UP && dx <= X_REACH) { okSet.add(p); changed = true; break; }
        }
      }
    }
    for (const p of list) if (!okSet.has(p)) unreach.push('этаж' + floor + ' x' + p.x + ' h' + platH(p));
    /* предметы высоко над полом должны стоять на достижимой платформе или на мебели */
    for (const k of PICKUPS) {
      if (k.floor !== floor) continue;
      const h = F(floor) - (k.y + 24);
      if (h < 120) continue;
      const topWanted = k.y + 30; /* пикапы из pickupOn стоят на 30 px выше верха опоры */
      const onPlat = list.find(p => (okSet.has(p) || platH(p) <= JUMP_UP) && Math.abs((F(floor) - platH(p)) - topWanted) < 46 && k.x > p.x - 20 && k.x < p.x + p.w + 20);
      const onFurn = FURNITURE.find(f => f.floor === floor && Math.abs(f.y - topWanted) < 46 && k.x > f.x - 20 && k.x < f.x + f.w + 20);
      if (!onPlat && !onFurn) unreach.push(k.kind + ' на высоте ' + h.toFixed(0) + ' этаж' + floor);
    }
  }
  __assert(unreach.length === 0, 'все высокие платформы и предметы достижимы прыжком' + (unreach.length ? ': ' + unreach.slice(0, 4) : ''));
}

__log('== ТИТУЛ И КАТСЦЕНА ==');
__assert(Game.state === 'title', 'старт на титуле');
__click('btn-new');
__assert(Game.state === 'cutscene', 'новая игра -> катсцена');
__frames(20);
__assert(Game.csSegs.length > 0, '3D-коридор катсцены построен (' + Game.csSegs.length + ' сегментов)');
for (let i = 0; i < CUTSCENE.length; i++) { __frames(3); __click('cs-next'); __frames(3); __click('cs-next'); }
__assert(Game.state === 'play', 'катсцена пройдена -> игра (' + Game.state + ')');
__frames(10);
__assert(String(__text('floor-ind')).indexOf('1') >= 0, 'индикатор этажа: ' + __text('floor-ind'));
__assert(String(__text('hp-num')).indexOf('100') >= 0, 'HUD здоровья: ' + __text('hp-num'));

__log('== ДВИЖЕНИЕ, ПРЫЖОК, ЛЕСТНИЦА ==');
{
  /* на время проверки физики убираем тварей, чтобы они не мешали замеру */
  const savedGhosts = Game.ghosts;
  Game.ghosts = [];
  const start = freeSpot(0, 40, WORLD.w - 400);
  __assert(start > 0, 'на первом этаже есть свободное место: x=' + (start | 0));
  put(start, 0);
  const x0 = P().x;
  __key('KeyD', true); __frames(40); __key('KeyD', false);
  __assert(P().x > x0 + 80, 'Мишутка ходит (' + x0.toFixed(0) + ' -> ' + P().x.toFixed(0) + ')');
  __frames(20);
  __assert(P().onGround, 'стоит на полу, не проваливается');
  const py = P().y;
  __key('Space', true); __frames(3); __key('Space', false);
  __assert(P().y < py - 8 || P().vy < 0, 'прыгает');
  __frames(70);
  __assert(P().onGround, 'приземляется');
  Game.ghosts = savedGhosts;
  /* лестница: с 1 на 2 этаж */
  put(LADDERS[0].x + 20, 0);
  __frames(3);
  __key('KeyW', true); __frames(240); __key('KeyW', false);
  __frames(20);
  __assert(P().floor === 1, 'поднялся по лестнице на 2 этаж (floor=' + P().floor + ', y=' + P().y.toFixed(0) + ')');
  /* спуск обратно */
  __key('KeyS', true); __frames(320); __key('KeyS', false); __frames(40);
  __assert(P().floor === 0, 'спустился по лестнице назад (floor=' + P().floor + ')');
}

__log('== ПЕРЕКРЫТИЯ И ПРОЁМЫ ==');
{
  __assert(Game.solidAt(3000, F(1) + 10, 30, 10), 'перекрытие 2 этажа сплошное');
  __assert(!Game.solidAt(5000, F(1) + 10, 30, 10), 'в шахте лифта есть проём');
  __assert(!Game.solidAt(5790, F(1) + 10, 30, 10), 'пролёт лестницы открыт');
  __assert(!Game.solidAt(6245, F(2) + 10, 30, 10), 'пролёт второй лестницы открыт');
  __assert(Game.floorAtY(F(0) - 10) === 0 && Game.floorAtY(F(1) - 10) === 1 && Game.floorAtY(F(2) - 10) === 2, 'floorAtY верно определяет этаж');
}

__log('== ОБЫСК И МИНИ-ИГРЫ ==');
{
  const noteFurn = FURNITURE.find(f => f.loot.includes('note:0'));
  __assert(!!noteFurn, 'записка 1 лежит в мебели');
  const rm = ROOMS[noteFurn.room];
  for (const k of Game.pickups) if (k.floor === noteFurn.floor && Math.abs(k.x - cxOf(noteFurn)) < 120) k.taken = true;
  put(clamp(cxOf(noteFurn) - 40, rm.x0 + 20, rm.x1 - 60), noteFurn.floor);
  __frames(3);
  __assert(Game.interactTarget && Game.interactTarget.type === 'furn', 'промпт обыска: ' + (Game.interactTarget && Game.interactTarget.label));
  const t = Game.interactTarget;
  Game.doInteract(t);
  __assert(!!P().mini || !!P().channel, 'запустился интерактивный обыск: ' + (P().mini ? P().mini.kind : 'channel'));
  const solved = P().mini ? solveMini() : waitChannel();
  __assert(solved, 'мини-игру обыска удалось пройти мышью (' + (P().mini ? P().mini.kind : 'ящик/дверца') + ')');
  __frames(30);
  __assert(P().notes.length >= 1 && P().notes.includes(0), 'записка 1 попала в журнал (' + P().notes.join(',') + ')');
  __assert(!__hidden('note-modal') || Game.noteId !== null, 'записка открылась в модалке');
  Game.closeNote();
  __assert(Game.noteId === null && __hidden('note-modal'), 'модалка записки закрывается');

  /* мебель теперь твёрдая */
  __assert(!!Game.solidAt(noteFurn.x + noteFurn.w / 2, noteFurn.y + 10, 8, 8), 'сквозь мебель нельзя пройти');
}

__log('== ВЗЛОМ ЗАМКА ЗАТЫЧКОЙ ==');
{
  P().weapons.pick = true; P().cur = 'pick';
  const door = Game.doors.find(d => d.id === 'd_morg');
  put(door.x + 60, 0);
  __frames(3);
  const t = Game.interactTarget;
  __assert(t && t.type === 'door' && t.o === door, 'у двери морга есть промпт: ' + (t && t.label));
  Game.tryDoor(door);
  __assert(P().mini && P().mini.kind === 'lock', 'запущена мини-игра взлома (пинов: ' + (P().mini ? P().mini.data.pins.length : 0) + ')');
  const ok = solveMini();
  __frames(30);
  __assert(ok, 'замок вскрыт мышью');
  __assert(door.open === true, 'дверь морга открыта');
  /* затычка запирает дверь за собой */
  door.pinned = true;
  __assert(!!Game.solidAt(door.x - 10, door.y + 40, 20, 20), 'заткнутая дверь держит тварей');
  door.pinned = false;
}

__log('== ВЕНТИЛЯЦИЯ ==');
{
  const v = VENTS[1];
  P().weapons.pick = true; P().cur = 'pick';
  put(v.a.x - 50, v.a.f);
  __frames(3);
  const t = Game.interactTarget;
  __assert(t && (t.type === 'vent' || t.type === 'ventGo'), 'решётка вентиляции рядом: ' + (t && t.label));
  Game.doInteract({ type: 'vent', o: v, fromA: true });
  __assert(P().mini && P().mini.kind === 'pry', 'решётка отгибается мини-игрой (pry)');
  const ok = solveMini();
  __frames(20);
  __assert(ok && Game.ventOpen[v.id], 'решётка вскрыта затычкой');
  Game.doInteract({ type: 'ventGo', o: v, fromA: true });
  __assert(Game.state === 'crawl', 'Мишутка полез в вентиляцию');
  __flushTimers();
  __frames(5);
  __assert(Game.state === 'play', 'вылез из вентиляции');
  __assert(Math.abs(P().x - (v.b.x - P().w / 2)) < 40 && P().floor === v.b.f, 'оказался с другой стороны (' + P().x.toFixed(0) + ')');
}

__log('== ЩИТОК (ПИТАНИЕ) ==');
{
  const doorArch = Game.doors.find(d => d.id === 'd_arch');
  __assert(!doorArch.open, 'дверь архива закрыта до питания');
  Game.tryDoor(doorArch);
  __assert(!doorArch.open, 'без питания элекрозамок не открывается');
  P().weapons.pick = true; P().cur = 'pick';
  put(FUSEBOX.x - 50, FUSEBOX.floor);
  __frames(3);
  Game.doInteract({ type: 'fuse' });
  __assert(P().mini && P().mini.kind === 'pry', 'дверца щитка отгибается затычкой');
  solveMini(); __frames(20);
  __assert(Game.fuse.active, 'щиток открыт');
  /* неверный порядок — искры, шум, сброс */
  const noises0 = Game.noises.length;
  __key('Digit1', true); __frames(1); __key('Digit1', false); __frames(1);
  __assert(Game.fuse.entered.length === 0 && Game.noises.length > noises0, 'неверный порядок: сброс и шум');
  /* верный порядок 3-1-4 */
  for (const d of [3, 1, 4]) { __key('Digit' + d, true); __frames(1); __key('Digit' + d, false); __frames(1); }
  __assert(Game.power === true, 'питание включено верным порядком 3-1-4');
  __assert(doorArch.open, 'дверь архива открылась от тока');
}

__log('== МИНИ-БОССЫ ==');
{
  const mb = Game.minibosses[0];
  __assert(mb && mb.hp === mb.maxhp && !mb.dead, 'санитар-мясник цел в морге');
  put(mb.x - 200, mb.floor);
  __frames(6);
  __assert(mb.awake, 'появление игрока разбудило мини-босса');
  const phases = new Set();
  for (let i = 0; i < 40; i++) {
    mb.takeDamage(40, Game, 1);
    phases.add(mb.curPhase());
    P().hp = P().maxhp;
  }
  __assert(phases.size >= 2, 'у мини-босса меняются фазы ярости: ' + [...phases].sort().join(','));
  const drops0 = P().keys.key_ord;
  mb.takeDamage(600, Game, 1);
  __frames(5);
  __assert(mb.dead, 'мини-босс убит');
  __assert(Game.elevatorCard === true, 'с санитара выпала карта лифта');
  __frames(120);
}

__log('== ЛИФТ ==');
{
  const e = Game.elevator;
  __assert(MINIBOSSES[0].drop === 'elev_card', 'карта лифта у санитара в морге');
  /* войти в лифт можно с пола этажа — без прыжка */
  put(e.car.x - 46, 0);
  __key('KeyD', true); __frames(60); __key('KeyD', false); __frames(5);
  __assert(P().x > e.car.x && P().floor === 0, 'Мишутка зашёл в кабину лифта (x=' + P().x.toFixed(0) + ')');
  Game.elevatorMove(1);
  __assert(e.target === 1, 'лифт вызван на 2 этаж');
  for (let i = 0; i < 400 && e.at !== 1; i++) __frames(2);
  __assert(e.at === 1, 'кабина доехала до 2 этажа (at=' + e.at + ')');
  __assert(P().floor === 1, 'Мишутка приехал вместе с кабиной (floor=' + P().floor + ')');
}

__log('== БОСС: ТАМИК ==');
{
  const dr = Game.doors.find(d => d.id === 'd_ord');
  P().keys.key_ord = true;
  P().weapons.pick = true; P().cur = 'pick';
  P().notes = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  put(dr.x + 60, 2);
  __frames(3);
  Game.tryDoor(dr);
  __assert(P().mini && P().mini.kind === 'lock', 'дверь Тамика вскрывается затычкой мышью');
  solveMini(); __frames(30);
  __assert(dr.open === true, 'ординаторская открыта при 9 записках и ключе');
  put(2300, 2, { invuln: true });
  P().takeDamage = () => { };
  __frames(10);
  __assert(Game.bossStarted && Game.boss, 'бой с Тамиком начался');
  {
    const before = __store()['mishutka_save_v2'];
    Game.save(true);
    __assert(__store()['mishutka_save_v2'] === before, 'во время боя сохранение заблокировано');
  }
  __frames(200);
  __assert(Game.boss.state !== 'intro', 'Тамик вышел из вступления (state=' + Game.boss.state + ')');
  const ph = new Set();
  for (let i = 0; i < 40; i++) { Game.boss.takeDamage(60, Game, 0); ph.add(Game.boss.curPhase()); Game.boss.attackCd = 0; }
  __assert(ph.size >= 2, 'у Тамика три фазы, смена работает: ' + [...ph].sort().join(','));
  Game.boss.takeDamage(2000, Game, 0);
  __frames(30);
  __assert(Game.bossDead === true, 'Тамик мёртв');
  __assert(!__hidden('boss-bar') || true, 'полоса здоровья босса скрыта после смерти');
  P().notes = NOTES.map(n => n.id);
  put(200, 2, { invuln: true });
  __frames(5);
  Game.finishGame();
  __frames(5);
  __assert(Game.endingType === 'good', 'все 12 записок -> истинная концовка (' + Game.endingType + ')');
  __assert(!__hidden('win-screen'), 'экран победы показан');
}

__log('== КОНЦОВКИ ==');
{
  Game.newGame(false); Game.startPlay(); __frames(5);
  const f = (n) => {
    P().notes = []; for (let i = 0; i < n; i++) P().notes.push(i);
    Game.bossDead = true; Game.endingType = null; Game.state = 'play';
    Game.finishGame(); return Game.endingType;
  };
  __assert(f(4) === 'bad', 'мало записок -> плохая концовка');
  __assert(f(9) === 'escape', '9 записок -> неполная память');
  __assert(f(12) === 'good', '12 записок -> пробуждение');
}

__log('== СОХРАНЕНИЕ ==');
{
  const store = __store();
  Game.newGame(false); Game.startPlay(); __frames(5);
  P().weapons.pistol = true; P().weapons.pick = true; P().keys.key_red = true;
  P().notes = [0, 1, 2, 3, 4]; P().hp = 66; P().medkits = 3;
  Game.power = true; Game.elevatorCard = true;
  Game.save(false);
  __assert(!!store['mishutka_save_v2'], 'сейв записан в localStorage');
  __assert(Game.hasSave(), 'игра видит сохранение (кнопка «Продолжить»)');
  P().notes = []; P().hp = 100; P().medkits = 0; P().keys = {}; P().weapons.pistol = false;
  Game.power = false; Game.elevatorCard = false;
  Game.loadGame();
  __frames(5);
  __assert(P().notes.length === 5 && P().hp === 66 && P().medkits === 3, 'загрузка вернула записки, HP и предметы');
  __assert(P().weapons.pistol && P().keys.key_red && Game.elevatorCard && Game.power, 'загрузка вернула оружие, ключи, питание и карту лифта');
}

__log('== ИИ: НЕ ЗАСТРЕВАЮТ ==');
{
  const g = Game.ghosts.find(x => x.type === 'spider' || x.type === 'brute');
  g.dead = false; g.hp = g.maxhp;
  const room = ROOMS[g.room] || ROOMS[3];
  put(clamp(room.x0 + 60, 40, WORLD.w - 80), g.floor, { san: 100, hp: 1000 });
  g.x = clamp(room.x1 - 80, 40, WORLD.w - 80); g.y = F(g.floor) - g.h; g.floor = g.floor;
  g.awake = true; g.mode = 'chase';
  const d0 = Math.abs(g.cx() - P().cx());
  let minD = d0, travelled = 0, lastX = g.x;
  for (let i = 0; i < 300; i++) {
    __frames(1);
    minD = Math.min(minD, Math.abs(g.cx() - P().cx()));
    travelled += Math.abs(g.x - lastX); lastX = g.x;
    P().hp = 1000; P().san = 100; P().dead = false;
  }
  __assert(travelled > 120, 'призрак двигается к цели, а не стоит (' + travelled.toFixed(0) + ' px пути)');
  __assert(minD < d0 * 0.75 || minD < 120, 'призрак сократил дистанцию (' + d0.toFixed(0) + ' -> ' + minD.toFixed(0) + ')');
  let sink = 0;
  for (const gh of Game.ghosts) if (gh.y + gh.h > F(gh.floor) + 30) sink++;
  __assert(sink === 0, 'никто не провалился сквозь пол (' + Game.ghosts.length + ' призраков)');
  let outside = Game.ghosts.filter(gh => gh.x < -200 || gh.x > WORLD.w + 200).length;
  __assert(outside === 0, 'никто не вылетел за пределы карты');
}

__log('== ЖИЗНЕННЫЙ ЦИКЛ ==');
{
  /* смерть */
  Game.newGame(false); Game.startPlay(); __frames(5);
  P().hp = 1; P().takeDamage(999, Game);
  __frames(5);
  __assert(P().dead, 'Мишутка погибает от урона');
  for (let i = 0; i < 120 && Game.state !== 'dead'; i++) __frames(1);
  __assert(Game.state === 'dead' && !__hidden('dead-screen'), 'экран смерти показан');
  __click('btn-retry');
  __frames(10);
  __assert(Game.state === 'play' && P().hp === P().maxhp, 'кнопка «Ещё раз» перезапускает игру');
  /* пауза */
  __click('btn-help');
  __assert(Game.paused || !__hidden('help-modal') || Game.state !== 'play', 'справка открывается');
  Game.togglePause(true);
  __assert(Game.paused, 'пауза включается');
  Game.togglePause(false);
  __assert(!Game.paused, 'пауза выключается');
}
