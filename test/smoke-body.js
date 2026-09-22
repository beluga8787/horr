/* ============================================================
   МИШУТКА — smoke-тест v3 (запуск: node test/smoke.js)
   Проверяем: раскладку мира, атаку, физику этажей, инвентарь,
   оружие, одежду, взаимодействия, мини-игры, лифт, вентиляцию,
   щиток, мини-боссов, босса, концовки, сохранения и отсутствие
   сбоев в кадре.
   ============================================================ */
'use strict';

__fireLoad();
__frames(1);

/* ввод: объекты игры живут в лексическом окружении теста */
function mouseSet(st) { Object.assign(Input.mouse, st); }
function drag(dx, dy) {
  Input.mouse.sx += dx || 0; Input.mouse.sy += dy || 0;
  Input.mouse.down = true; Input.mouse.dragging = true;
}
function mouseUp() { Input.mouse.down = false; Input.mouse.dragging = false; Input.mouse.clicked = false; }
/* прицел: поставить курсор так, чтобы Мишутка смотрел в мировую точку */
function aimAt(wx, wy) {
  mouseSet({ sx: clamp(wx - Camera.x, 4, 1276), sy: clamp(wy - Camera.y, 4, 716) });
}
/* закрыть всё, что могло поставить мир на паузу (записка, инвентарь, мини-игра) */
function clearModals() {
  const q = P();
  if (q) { if (q.mini) { q.mini = null; Game.hideMini(); } if (q.channel) q.channel = null; }
  if (Game.noteId !== null) Game.closeNote();
  if (Game.invOpen) Game.closeInventory();
}

const P = () => Game.player;
const F = i => FLOORS[i];
function put(x, floor) {
  clearModals();
  const p = P();
  /* если точка занята мебелью — встаём в ближайшее свободное место */
  x = Game.freeSpot(x, floor, p.w, p.h, 20, WORLD.w - 20);
  p.x = x; p.y = FLOORS[floor].y - p.h; p.floor = floor;
  p.vx = 0; p.vy = 0; p.hidden = null; p.mini = null; p.channel = null; p.climbing = null;
  p.onGround = true;
  return p;
}
function solveMini() {
  const p = P();
  if (!p.mini) return p.channel ? 'channel' : 'none';
  const kind = p.mini.kind;
  for (let i = 0; i < 400 && p.mini && p.mini.kind === kind; i++) {
    const m = p.mini;
    if (kind === 'lock') {
      const pin = (m.data.pins[m.data.cur] !== undefined) ? m.data.pins[m.data.cur] : 0;
      const err = pin - (m.data.pos || 0);
      drag(clamp(err * 6, -18, 18), 0);
    } else if (kind === 'drawer' || kind === 'pry' || kind === 'hold') {
      const dir = (m.data && m.data.dir) || 'down';
      if (m.data && m.data.phase === 1) drag(95, 0);
      else if (dir === 'right') drag(95, 0);
      else drag(0, 95);
    }
    __frames(1);
  }
  mouseUp();
  return kind;
}
function aabbOv(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }

/* ==================== 0. МИР И ДАННЫЕ ==================== */
__assert(FLOORS.length === 3, '3 этажа');
__assert(ROOMS.length === 21, `комнат: ${ROOMS.length}`);
__assert(NOTES.length === 12, '12 записок в NOTES');
__assert(CUTSCENE.length >= 8, `слайдов катсцены: ${CUTSCENE.length}`);
__assert(Object.keys(WEAPONS).length >= 18, `арсенал: ${Object.keys(WEAPONS).length} видов оружия`);
__assert(Object.keys(CLOTHES).length >= 16, `одежда: ${Object.keys(CLOTHES).length} видов`);
__assert(Object.keys(CLOTH_SLOTS).length === 4, '4 слота одежды (тело/голова/обувь/руки)');
__assert(ORDER.length >= 16, `в быстром доступе ${ORDER.length} позиций`);
const badW = ORDER.filter(id => !WEAPONS[id]);
__assert(badW.length === 0, 'ORDER ссылается только на существующее оружие' + (badW.length ? ' (' + badW + ')' : ''));
const badC = Object.keys(CLOTHES).filter(id => !CLOTH_SLOTS.some(s => s.id === CLOTHES[id].slot));
__assert(badC.length === 0, 'у всей одежды корректный слот' + (badC.length ? ' (' + badC + ')' : ''));
__assert(WEAPONS.hands && WEAPONS.pick, 'кулаки и затычка на месте');
/* никто не спавнится внутри мебели/стен */
let spawnBad = 0;
for (const gh of Game.ghosts) if (Game.solidAt(gh.x, gh.y + 4, gh.w, gh.h - 8)) spawnBad++;
for (const mb0 of Game.minibosses) if (Game.solidAt(mb0.x, mb0.y + 4, mb0.w, mb0.h - 8)) spawnBad++;
__assert(spawnBad === 0, `ни одна тварь не спавнится внутри мебели (проблем: ${spawnBad})`);
const guns = Object.keys(WEAPONS).filter(id => WEAPONS[id].kind === 'gun');
__assert(guns.length >= 6, `огнестрела: ${guns.length} (${guns.join(', ')})`);

/* по 4 записки на каждом этаже */
for (let fi = 0; fi < 3; fi++) {
  const ids = new Set();
  for (const f of Game.furniture) if (f.floor === fi) for (const c of f.loot) if (c.startsWith('note:')) ids.add(+c.slice(5));
  for (const k of Game.pickups) if (k.floor === fi && k.kind.startsWith('note:')) ids.add(+k.kind.split(':')[1]);
  __assert(ids.size === 4, `этаж ${fi + 1}: ${ids.size}/4 записок`);
}

/* ==================== 1. РАСКЛАДКА (без пересечений) ==================== */
let overlaps = 0;
for (let i = 0; i < Game.furniture.length; i++) {
  for (let j = i + 1; j < Game.furniture.length; j++) {
    const a = Game.furniture[i], b = Game.furniture[j];
    if (a.floor !== b.floor) continue;
    if (aabbOv({ x: a.x, y: a.y, w: a.w, h: a.h }, { x: b.x, y: b.y, w: b.w, h: b.h })) overlaps++;
  }
}
__assert(overlaps === 0, 'мебель не пересекается сама с собой в пределах этажа');

let outOfRoom = 0, notOnFloor = 0, inDoor = 0;
for (const f of Game.furniture) {
  const rm = ROOMS[f.room];
  if (!rm) continue;
  if (f.x < rm.x0 - 1 || f.x + f.w > rm.x1 + 1) outOfRoom++;
  if (Math.abs(f.y + f.h - FLOORS[f.floor].y) > 2) notOnFloor++;
  for (const d of Game.doors) {
    if (d.floor !== f.floor) continue;
    if (aabbOv({ x: f.x, y: f.y, w: f.w, h: f.h }, { x: d.x - d.w / 2 - 4, y: d.y, w: d.w + 8, h: d.h })) inDoor++;
  }
}
__assert(outOfRoom === 0, `вся мебель внутри своих комнат${outOfRoom ? ' (нарушителей: ' + outOfRoom + ')' : ''}`);
__assert(notOnFloor === 0, 'мебель стоит на полу этажа');
__assert(inDoor === 0, 'мебель не загораживает двери' + (inDoor ? ' (' + inDoor + ')' : ''));

let platBad = 0, platFurn = 0, platHigh = 0;
for (let i = 0; i < Game.platforms.length; i++) {
  const a = Game.platforms[i];
  if (a.y < FLOORS[a.floor].y - 344 || a.y > FLOORS[a.floor].y - 40) platHigh++;
  for (let j = i + 1; j < Game.platforms.length; j++) {
    const b = Game.platforms[j];
    if (a.floor === b.floor && aabbOv({ x: a.x, y: a.y, w: a.w, h: a.h }, { x: b.x, y: b.y, w: b.w, h: b.h })) platBad++;
  }
  for (const f of Game.furniture) {
    if (f.floor !== a.floor) continue;
    if (aabbOv({ x: a.x, y: a.y, w: a.w, h: a.h }, { x: f.x, y: f.y, w: f.w, h: f.h })) platFurn++;
  }
}
__assert(platBad === 0, 'платформы не пересекаются');
__assert(platFurn === 0, 'платформы не воткнуты в мебель' + (platFurn ? ' (' + platFurn + ')' : ''));
__assert(platHigh === 0, 'высота платформ в пределах прыжка' + (platHigh ? ' (' + platHigh + ')' : ''));

/* мебель реально приносит оружие и одежду */
const allLoot = Game.furniture.flatMap(f => f.loot);
const lootWeapons = new Set(allLoot.filter(c => WEAPONS[c] && c !== 'hands'));
const lootWear = new Set(allLoot.filter(c => c.startsWith('wear:')).map(c => c.slice(5)));
__assert(lootWeapons.size >= 14, `в мире лежит ${lootWeapons.size} разных оружий`);
__assert(lootWear.size >= 12, `в мире лежит ${lootWear.size} разных одежд`);
const bigGun = ['shotgun', 'rifle', 'smg', 'revolver'];
__assert(bigGun.every(id => lootWeapons.has(id)), 'дробовик, карабин, ПП и револьвер есть в луте');

/* у всего оружия и одежды заполнены характеристики */
const badW2 = Object.keys(WEAPONS).filter(id => { const w = WEAPONS[id]; return !w.name || !w.icon || !w.desc || !w.dmg || !w.cd; });
__assert(badW2.length === 0, 'у всего оружия есть имя, иконка, описание, урон и скорость' + (badW2.length ? ' (' + badW2 + ')' : ''));
const badC2 = Object.keys(CLOTHES).filter(id => { const c = CLOTHES[id]; return !c.name || !c.icon || !c.desc || !c.slot; });
__assert(badC2.length === 0, 'у всей одежды есть имя, иконка, описание и слот' + (badC2.length ? ' (' + badC2 + ')' : ''));
const gunNoMag = Object.keys(WEAPONS).filter(id => WEAPONS[id].kind === 'gun' && !WEAPONS[id].mag);
__assert(gunNoMag.length === 0, 'у всего огнестрела есть магазин');

/* ==================== 2. СТАРТ ИГРЫ ==================== */
Game.newGame(false);
__flushTimers();
__frames(2);
__assert(Game.state === 'play', 'новая игра запускается без катсцены (state=play)');
let p = P();
__assert(!!p && p.hp === 100, 'игрок жив и здоров');
__assert(!Game.solidAt(p.x, p.y, p.w, p.h), 'игрок не заспавнен внутри объекта');
__assert(p.weapons.hands === true && p.cur === 'hands', 'в руках кулаки');
__assert(p.clothes.body === 'robe' && p.clothes.boots === 'slippers', 'стартовая одежда: роба и тапочки');
__assert(p.clothItem('body').name === 'Больничная роба', 'стартовая вещь существует в CLOTHES');

/* катсцена */
Game.newGame(true);
p = P();
__assert(Game.state === 'cutscene', 'катсцена включается');
for (let i = 0; i < CUTSCENE.length * 3; i++) { Game.csNext(); __flushTimers(); }
p = P();
__assert(Game.state === 'play', 'после катсцены — игра');

/* ==================== 3. АТАКА (главный баг-фикс) ==================== */
put(1200, 0);
const ghost = Game.spawnGhost('whisper', 1260, 0, [960, 1860]);
/* ставим тварь там, куда смотрит Мишутка */
function placeAtReach(g, side) {
  g.x = side > 0 ? P().cx() + 34 : P().cx() - 34 - g.w;
  g.y = FLOORS[P().floor].y - g.h; g.floor = P().floor;
  g.dead = false; g.hp = 200; g.stunT = 3; g.vx = 0; g.mode = 'patrol'; g.alertT = 0;
}
aimAt(p.cx() + 200, p.cy());
__frames(1);
const side = p.face;
placeAtReach(ghost, side);
const hpBefore = ghost.hp;
p.switchTo('hands'); p.atkCd = 0; p.st = 100;
__key('KeyJ', true); __frames(1); __key('KeyJ', false);
__frames(1);
__assert(ghost.hp < hpBefore, `удар [J] попадает по твари (hp ${hpBefore} → ${ghost.hp})`);
__assert(p.atkCd > 0 && p.atkAnim > -0.1, 'после удара срабатывает перезарядка удара и анимация');

/* ЛКМ тоже бьёт */
aimAt(p.cx() + 200, p.cy()); __frames(1);
placeAtReach(ghost, p.face);
ghost.hp = 120; p.atkCd = 0; p.st = 100;
mouseSet({ down: true, clicked: true });
__frames(1);
mouseSet({ down: false, clicked: false });
__assert(ghost.hp < 120, 'удар ЛКМ попадает по твари');

/* нож бьёт сильнее кулаков; пистолет стреляет и тратит патрон */
p.weapons.knife = true; p.switchTo('knife'); p.atkCd = 0;
aimAt(p.cx() + 200, p.cy()); __frames(1);
placeAtReach(ghost, p.face);
ghost.hp = 200;
mouseSet({ down: true, clicked: true }); __frames(1); mouseSet({ down: false, clicked: false });
__assert(ghost.hp <= 200 - 30, `нож бьёт больно (hp ${ghost.hp})`);

p.weapons.pistol = true; p.switchTo('pistol'); p.setMag('pistol', 8); p.atkCd = 0; p.reloadT = 0;
aimAt(p.cx() + 200, p.cy()); __frames(1);
placeAtReach(ghost, p.face);
ghost.x = p.face > 0 ? p.cx() + 60 : p.cx() - 60 - ghost.w;
ghost.hp = 300; ghost.stunT = 3;
const magBefore = p.magOf('pistol');
mouseSet({ down: true, clicked: true }); __frames(1); mouseSet({ down: false, clicked: false });
__assert(p.magOf('pistol') === magBefore - 1, 'выстрел тратит патрон из магазина');
__assert(ghost.hp < 300, `пуля попала в цель (hp ${ghost.hp})`);

/* удар добивает тварь */
aimAt(p.cx() + 200, p.cy()); __frames(1);
p.switchTo('hands'); p.atkCd = 0; p.st = 100;
placeAtReach(ghost, p.face);
ghost.hp = 6;
__key('KeyJ', true); __frames(1); __key('KeyJ', false);
__frames(2);
__assert(ghost.hp <= 0 || ghost.dead, 'удар добивает тварь');

/* ==================== 4. ЭТАЖ НЕ ПРЫГАЕТ ПРИ ПРЫЖКЕ (баг-фикс) ==================== */
const highPlat = Game.platforms.filter(x => x.floor === 0).sort((a, b) => a.y - b.y)[0];
__assert(!!highPlat, 'на 1 этаже есть высокая платформа');
put(highPlat.x + highPlat.w / 2, 0);
p.y = highPlat.y - p.h; p.onGround = true;
__key('Space', true); __frames(3); __key('Space', false);
let maxFloor = 0, minY = p.y;
for (let i = 0; i < 90; i++) { __frames(1); maxFloor = Math.max(maxFloor, p.floor); minY = Math.min(minY, p.y); }
__assert(maxFloor === 0, 'прыжок на высокой платформе НЕ уводит на этаж выше');
__assert(p.floor === 0, 'игрок остался на своём этаже');
/* и наоборот: падение с платформы тоже не меняет этаж */
__assert(minY < FLOORS[0].y - 200, 'игрок реально прыгнул вверх (высота менялась)');
__key('KeyD', true);
for (let i = 0; i < 160 && Math.abs(p.y + p.h - FLOORS[0].y) > 3; i++) __frames(1);
__key('KeyD', false);
for (let i = 0; i < 30; i++) __frames(1);
__assert(p.floor === 0 && Math.abs(p.y + p.h - FLOORS[0].y) < 3, `игрок приземлился на пол 1 этажа (y=${Math.round(p.y + p.h)} vs ${FLOORS[0].y})`);

/* ==================== 5. ЛАЗАНЬЕ И ЛИФТ ==================== */
const lad = LADDERS[0];
put(lad.x + lad.w / 2, 0);
__key('KeyW', true);
let climbed = false;
for (let i = 0; i < 300; i++) { __frames(1); if (p.floor === 1) { climbed = true; break; } }
__key('KeyW', false);
__assert(climbed, 'по лестнице можно подняться на 2 этаж');
__assert(p.floor === 1, 'после лестницы этаж = 2');
__frames(3);

const lad2 = LADDERS[1];
put(lad2.x + lad2.w / 2, 1);
__key('KeyW', true);
let climbed2 = false;
for (let i = 0; i < 300; i++) { __frames(1); if (p.floor === 2) { climbed2 = true; break; } }
__key('KeyW', false);
__assert(climbed2, 'вторая лестница ведёт на 3 этаж');

/* лифт: без карты не едет, с картой и током — едет */
put(4990, 0);
Game.elevatorCard = false;
Game.elevatorMove(1);
__assert(Game.elevator.target === 0, 'без карты лифт не трогается');
Game.elevatorCard = true; Game.power = false;
Game.elevatorMove(2);
__assert(Game.elevator.target === 0, 'без тока лифт не едет');
Game.power = true;
Game.elevatorMove(2);
__assert(Game.elevator.target === 2, 'с картой и током лифт вызван на 3 этаж');
for (let i = 0; i < 900 && Game.elevator.at !== 2; i++) __frames(1);
__assert(Game.elevator.at === 2, 'лифт доехал до 3 этажа');
__assert(p.floor === 2, 'игрок приехал вместе с кабиной');
Game.power = true;

/* ==================== 6. ОДЕЖДА ==================== */
Game.applyLoot('wear:kevlar');
__assert(p.clothesOwned.kevlar, 'кевлаp попал в гардероб');
__assert(p.clothes.body === 'kevlar', 'кевлаp надет');
__assert(Math.abs(p.defMul() - 0.66) < 0.01, `кевлаp снижает урон (множитель ${p.defMul().toFixed(2)})`);
Game.applyLoot('wear:mask');
__assert(p.clothes.head === 'mask' && p.sanMul() < 1, 'маска замедляет потерю рассудка');
p.unequip('head');
__assert(p.clothes.head === null, 'одежду можно снять');
p.equip('robe');
__assert(p.clothes.body === 'robe' && p.defMul() === 1, 'переодевание возвращает базовые статы');
p.equip('kevlar');
/* бонусы суммируются по слотам */
Game.applyLoot('wear:grip');
Game.applyLoot('wear:sneakers');
const spd = p.spdMul(), atk = p.atkMul();
__assert(spd > 1.0, `кроссовки ускоряют (${spd.toFixed(2)})`);
p.unequip('boots'); const spdNo = p.spdMul(); p.equip('sneakers');
__assert(spd > spdNo, `в кроссовках быстрее, чем без них (${spdNo.toFixed(2)} → ${spd.toFixed(2)})`);
__assert(atk < 1, `перчатки ускоряют удары (${atk.toFixed(2)})`);
/* защита от урона работает */
p.hp = 100; p.iframes = 0;
const beforeDmg = p.hp;
p.takeDamage(50, Game, 'hit');
__assert(p.hp - beforeDmg > -50, `кевлаp реально гасит урон (получено ${(beforeDmg - p.hp).toFixed(1)} вместо 50)`);
p.hp = 100;

/* ==================== 7. ИНВЕНТАРЬ ==================== */
Game.openInventory();
__assert(Game.invOpen === true, 'инвентарь открывается по кнопке/клавише');
__assert(!__hidden('inv-modal'), 'модальное окно инвентаря показано');
__assert(__text('inv-sum').length > 0, 'в инвентаре видны суммарные бонусы одежды');
__assert(Game.modalOpen(), 'инвентарь считается модальным окном (мир на паузе)');
Game.closeInventory();
__assert(!Game.invOpen && __hidden('inv-modal'), 'инвентарь закрывается');
/* горячая клавиша I */
Game.state = 'play';
__key('KeyI', true); __frames(1); __key('KeyI', false); __frames(1);
__assert(Game.invOpen === true, 'клавиша I открывает инвентарь');
__key('KeyI', true); __frames(1); __key('KeyI', false); __frames(1);
__assert(Game.invOpen === false, 'клавиша I закрывает инвентарь');
/* переключение оружия цифрами и колесом */
p.weapons.axe = true; p.weapons.revolver = true;
const owned = ORDER.filter(id => p.weapons[id]);
p.switchTo(owned[1]);
__key('Digit2', true); __frames(1); __key('Digit2', false);
__assert(p.cur === owned[1], `цифра 2 выбирает ${owned[1]}`);
mouseSet({ wheel: 1 }); __frames(1);
__assert(p.cur !== owned[1], 'колесо мыши переключает оружие');
/* магазины у разного оружия свои */
p.setMag('pistol', 3); p.setMag('revolver', 5);
p.switchTo('pistol');
__assert(p.magOf('pistol') === 3 && p.magOf('revolver') === 5, 'у каждого ствола свой магазин');
Game.applyLoot('ammo:20');
p.reserve = 20; p.reloadT = 0;
p.startReload(Game);
__frames(80);
__assert(p.magOf('pistol') > 3, 'перезарядка досылает патроны');

/* ==================== 8. ОБЫСК, МИНИ-ИГРЫ, ЗАТЫЧКА, ВЕНТИЛЯЦИЯ, ЩИТОК ==================== */
Game.applyLoot('pick');
__assert(p.weapons.pick, 'затычка получена');
const anyF = Game.furniture.find(f => !f.opened);
put(anyF.cx(), anyF.floor);
Game.openFurniture(anyF);
__assert(anyF.opened, 'мебель обыскивается');
/* ящик — мини-игра с протяжкой мышью */
const drawerF = Game.furniture.find(f => (f.style === 'drawer' || f.style === 'pull') && !f.opened);
if (drawerF) {
  put(drawerF.cx(), drawerF.floor);
  Game.doInteract({ type: 'furn', o: drawerF });
  __assert(!!p.mini, 'ящик открывает мини-игру (тянуть мышью)');
  const res = solveMini();
  __assert(res === 'drawer', `мини-игра ящика решается перетаскиванием (${res})`);
  __assert(drawerF.opened, 'после протяжки ящик обыскан');
} else __assert(false, 'на карте есть ящик для мини-игры');
/* замок */
const lockedDoor = Game.doors.find(d => d.locked === 'pick');
__assert(!!lockedDoor, 'на карте есть дверь с замком под отмычку');
if (lockedDoor) {
  put(lockedDoor.x - 60, lockedDoor.floor);
  p.cur = 'pick';
  Game.tryDoor(lockedDoor);
  __assert(!!p.mini && p.mini.kind === 'lock', 'замок открывает мини-игру взлома');
  const res = solveMini();
  __assert(lockedDoor.open === true || lockedDoor.locked !== 'pick', `замок вскрыт (${res})`);
}
/* вентиляция */
const vent = VENTS[0];
Game.ventOpen[vent.id] = true;
put(vent.a.x, vent.a.f);
Game.crawlVent(vent, true);
__flushTimers();
__assert(Math.abs(P().x + P().w / 2 - vent.b.x) < 40 && P().floor === vent.b.f, 'вентиляция переносит с другой стороны');
/* щиток */
Game.fuse.active = true; Game.fuse.solved = false;
Game.fuse.entered = []; Game.fuse.switches = [false, false, false, false, false];
Game.player.cur = 'pick';
__key('Digit3', true); __frames(1); __key('Digit3', false);
__key('Digit1', true); __frames(1); __key('Digit1', false);
__key('Digit4', true); __frames(1); __key('Digit4', false);
__assert(Game.fuse.solved === true && Game.power === true, 'щиток 3-1-4 включает питание');
/* затычка в двери */
const door = Game.doors[0];
put(door.x - 60, door.floor);
p.cur = 'pick';
Game.doInteract({ type: 'pin', o: door });
__assert(door.pinned === true, 'дверь затыкается затычкой');
Game.doInteract({ type: 'unpin', o: door });
__assert(door.pinned === false, 'затычку можно вынуть');

/* ==================== 9. ВРАГИ НЕ ЗАСТРЕВАЮТ ==================== */
put(1500, 0);
const hunter = Game.spawnGhost('whisper', 2300, 0, [960, 2860]);
hunter.x = 2300; hunter.y = FLOORS[0].y - hunter.h;
hunter.alertT = 8; hunter.mode = 'chase'; hunter.stunT = 0;
const d0 = Math.abs(hunter.cx() - p.cx());
for (let i = 0; i < 240; i++) __frames(1);
const d1 = Math.abs(hunter.cx() - p.cx());
__assert(d1 < d0 - 60, `тварь догоняет игрока (${Math.round(d0)} → ${Math.round(d1)} px)`);
__assert(hunter.y + hunter.h <= FLOORS[0].y + 2, 'тварь не проваливается сквозь пол');
__assert(!Game.solidAt(hunter.x, hunter.y + 4, hunter.w, hunter.h - 8), 'тварь не сидит внутри стены');
let stuckSpawn = 0;
for (const gh of Game.ghosts) if (Game.solidAt(gh.x, gh.y + 4, gh.w, gh.h - 8)) stuckSpawn++;
for (const mb2 of Game.minibosses) if (Game.solidAt(mb2.x, mb2.y + 4, mb2.w, mb2.h - 8)) stuckSpawn++;
__assert(stuckSpawn <= 3, `после боя в геометрии застряли единицы (${stuckSpawn})`);

/* ==================== 10. МИНИ-БОССЫ, БОСС И ДВЕРИ ==================== */
const mb = Game.minibosses[0];
__assert(!!mb && !mb.dead, 'мини-босс санитар на месте');
put(mb.x - 40, mb.floor);
for (let i = 0; i < 30; i++) __frames(1);
__assert(mb.awake === true, 'мини-босс просыпается рядом с игроком');
mb.hp = 10; mb.dead = false;
Game.meleeHit({ x: mb.x, y: mb.y, w: mb.w, h: mb.h }, 999, 1, WEAPONS.hands);
__assert(mb.dead === true, 'мини-босс убивается');
__assert(Game.elevatorCard === true, 'с санитара падает карта лифта');

/* дверь Тамика не пускает без 9 записок и затычки */
const bossDoor = Game.doors.find(d => d.id === 'd_ord');
p.notes.length = 0; p.keys.key_ord = true; p.weapons.pick = true; p.cur = 'pick';
__assert(Game.doorLabel(bossDoor).includes('Записок') || Game.doorLabel(bossDoor).includes('не узнаёт'), 'дверь босса требует записки');
while (p.notes.length < 9) p.notes.push(p.notes.length);
put(bossDoor.x - 60, 2);
Game.tryDoor(bossDoor);
__assert(!!p.mini && p.mini.kind === 'lock', 'дверь босса открывается взломом');
solveMini();
__assert(bossDoor.open === true && bossDoor.locked === null, 'дверь Тамика открыта');
/* вход в арену запускает бой */
put(2000, 2);
for (let i = 0; i < 120 && !Game.bossStarted; i++) __frames(1);
__assert(Game.bossStarted === true && !!Game.boss, 'вход в ординаторскую запускает бой с Тамиком');
__assert(Game.gates.length === 2, 'арена босса закрывается');
const boss = Game.boss;
for (let i = 0; i < 300 && boss.state === 'intro'; i++) __frames(1);
__assert(boss.state !== 'intro', 'после интро Тамик начинает бой');
const bhp = boss.hp;
/* встаём так, чтобы Тамик был по направлению прицела */
p.x = clamp(boss.cx() - 300, BOSS_DEF.leash[0] + 60, BOSS_DEF.leash[1] - 60 - p.w);
p.y = FLOORS[2].y - p.h; p.vx = 0; p.vy = 0;
p.switchTo('pistol'); p.setMag('pistol', 8); p.atkCd = 0; p.reloadT = 0;
aimAt(boss.cx(), boss.cy());
__frames(1);
aimAt(boss.cx(), boss.cy());
mouseSet({ down: true, clicked: true }); __frames(1); mouseSet({ down: false, clicked: false });
__assert(boss.hp < bhp, `Тамика можно ранить (${bhp} → ${boss.hp})`);
/* сохранение во время боя запрещено */
const snap = JSON.stringify(__store()[SAVE_KEY]);
Game.save(true);
__assert(JSON.stringify(__store()[SAVE_KEY]) === snap, 'во время боя игра не перезаписывает сейв');
boss.hp = 1;
Game.meleeHit({ x: boss.x, y: boss.y, w: boss.w, h: boss.h }, 999, 1, WEAPONS.hands);
if (!Game.bossDead) { for (let i = 0; i < 30 && !Game.bossDead; i++) { Game.meleeHit({ x: boss.x, y: boss.y, w: boss.w, h: boss.h }, 999, 1, WEAPONS.hands); __frames(1); } }
__assert(Game.bossDead === true, 'Тамик умирает');
__frames(3);

/* ==================== 11. КОНЦОВКИ ==================== */
const tryFinish = n => {
  Game.state = 'play'; Game.bossDead = true;
  p.notes.length = 0; for (let i = 0; i < n; i++) p.notes.push(i);
  Game.finishGame();
  return Game.endingType;
};
__assert(tryFinish(3) === 'bad', 'мало записок → плохая концовка');
__assert(tryFinish(9) === 'escape', '9 записок → концовка побега');
__assert(tryFinish(12) === 'good', 'все 12 записок → истинная концовка');
__assert(Game.state === 'win' && __text('win-text').length > 10, 'экран финала заполнен');
/* выход из больницы доступен после победы над боссом */
Game.state = 'play'; Game.bossDead = true;
put(200, 2);
__frames(2);
const exitT = Game.findInteract();
__assert(exitT && exitT.type === 'exit', 'в зале «Тишина» появляется выход после победы');

/* вход в кабину лифта — пешком, без прыжка */
Game.elevator.at = 0; Game.elevator.target = 0;
Game.elevator.car.y = FLOORS[0].y;
Game.power = true; Game.elevatorCard = true;
p.x = Game.elevator.car.x - 70; p.y = FLOORS[0].y - p.h; p.floor = 0; p.vx = 0; p.vy = 0;
__key('KeyD', true);
for (let i = 0; i < 90; i++) __frames(1);
__key('KeyD', false);
__frames(5);
__assert(p.x + p.w > Game.elevator.car.x + 20, `в кабину лифта можно войти пешком (x=${Math.round(p.x)})`);
__assert(!Game.solidAt(p.x, p.y + 2, p.w, p.h - 4), 'игрок в кабине ни во что не воткнут');

/* отрисовка инвентаря/портрета не падает */
Game.invOpen = true;
Game.drawCharLarge(); Game.renderInventory(); Game.drawPortrait();
Game.invOpen = false;
__assert(true, 'портрет, большой персонаж и инвентарь рисуются без сбоев');

/* ==================== 12. СОХРАНЕНИЕ / ЗАГРУЗКА ==================== */
Game.state = 'play';
Game.bossStarted = false;
p.notes.length = 0; for (let i = 0; i < 5; i++) p.notes.push(i);
p.keys.key_red = true; p.weapons.axe = true; p.clothesOwned.hood = true; p.clothes.head = 'hood';
p.hp = 61; p.reserve = 42;
put(1200, 0);
Game.save(true);
__assert(__hasSave(), 'игра сохраняется в localStorage');
p.hp = 5; p.notes.length = 0; p.clothes.head = null;
Game.loadGame();
__flushTimers();
p = P();
__assert(p.hp === 61, `здоровье восстановлено (${p.hp})`);
__assert(p.notes.length === 5, 'записки восстановлены');
__assert(p.weapons.axe === true && p.weapons.hands === true, 'оружие восстановлено');
__assert(p.clothes.head === 'hood' && p.clothesOwned.hood === true, 'одежда и гардероб восстановлены');
__assert(p.reserve === 42, 'патроны восстановлены');
__assert(p.mags && typeof p.magOf('pistol') === 'number', 'магазины восстановлены');

/* ==================== 13. НИ ОДНОГО СБОЯ КАДРА ==================== */
Game.newGame(false);
__flushTimers();
let errs = 0;
for (const fi of [0, 1, 2]) {
  put(400 + fi * 300, fi);
  __key('KeyD', true);
  for (let i = 0; i < 120; i++) __frames(1);
  __key('KeyD', false);
  Game.openInventory();
  for (let i = 0; i < 5; i++) __frames(1);
  Game.closeInventory();
  for (let i = 0; i < 30; i++) __frames(1);
}
errs = Game.errCount || 0;
__assert(errs === 0, `за 500+ кадров и 3 открытия инвентаря нет сбоев (ошибок: ${errs})`);
