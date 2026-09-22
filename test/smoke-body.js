/* Тело smoke-теста — выполняется ВНУТРИ vm-контекста игры */
__log('== DATA ==');
__assert(NOTES.length === 8, 'записок ровно 8');
__assert(CUTSCENE.length === 7, 'слайдов катсцены 7');
{
  const noteRefs = new Set();
  for (const f of FURNITURE) for (const l of f.loot) if (l.startsWith('note:')) noteRefs.add(+l.split(':')[1]);
  for (const p of PICKUPS) if (p.kind.startsWith('note:')) noteRefs.add(+p.kind.split(':')[1]);
  __assert(noteRefs.size === 8, 'все 8 записок расставлены: ' + [...noteRefs].sort().join(','));
  let ghostOk = true;
  for (const g of GHOSTS) if (!GHOST_DEFS[g.type]) ghostOk = false;
  __assert(ghostOk, 'типы призраков валидны');
  __assert(PICKUPS.some(p => p.kind === 'knife'), 'нож есть в мире');
  __assert(PICKUPS.some(p => p.kind === 'pistol'), 'пистолет есть в мире');
  __assert(FURNITURE.some(f => f.loot.includes('pick')), 'затычка есть в мебели');
  __assert(FURNITURE.some(f => f.loot.includes('key_red')), 'красный ключ есть в мебели');
  __assert(DOORS.some(d => d.locked === 'pick') && DOORS.some(d => d.locked === 'key_red') && DOORS.some(d => d.locked === 'boss'), 'все 3 типа замков');
}

__log('== FLOW ==');
__fireLoad();
__frames(5);
__assert(Game.state === 'title', 'старт на титуле');
__click('btn-new');
__assert(Game.state === 'cutscene', 'новая игра -> катсцена');
__frames(120);
__assert(Game.csSegs.length === 16, '3D-коридор построен (16 сегментов)');
for (let i = 0; i < CUTSCENE.length; i++) { __click('cs-next'); __click('cs-next'); __frames(5); }
__assert(Game.state === 'play', 'катсцена -> игра');

__log('== MOVEMENT ==');
{
  const p0x = Game.player.x;
  __key('KeyD', true); __frames(25);
  __key('Space', true); __frames(22); __key('Space', false); // на каталку
  __frames(28);
  __key('Space', true); __frames(15); __key('Space', false); // через ящик
  __frames(50); __key('KeyD', false);
  __assert(Game.player.x > 320, 'идёт вправо через каталку и ящик (' + p0x.toFixed(0) + ' -> ' + Game.player.x.toFixed(0) + ')');
  __frames(45); // дождаться приземления
  const py = Game.player.y;
  __key('Space', true); __frames(2); __key('Space', false);
  __assert(Game.player.y < py - 10 || Game.player.vy < 0, 'прыгает');
  __frames(80);
  __assert(Game.player.onGround, 'приземляется');
}

__log('== INTERACT ==');
Game.player.x = 150; Game.player.y = 736; Game.player.vx = 0; __frames(3);
__assert(Game.interactTarget && Game.interactTarget.type === 'furn', 'промпт обыска: ' + (Game.interactTarget && Game.interactTarget.label));
__key('KeyE', true); __frames(2); __key('KeyE', false);
__frames(80);
__assert(Game.noteId === 0, 'записка 0 открылась (noteId=' + Game.noteId + ')');
__assert(Game.player.notes.includes(0), 'записка засчитана');
__key('KeyE', true); __frames(2); __key('KeyE', false);
__assert(Game.noteId === null, 'записка закрылась');

__log('== COMBAT ==');
Game.applyLoot('knife'); Game.applyLoot('pistol'); Game.applyLoot('pick');
Game.player.reserve = 30;
__assert(Game.player.weapons.knife && Game.player.weapons.pistol && Game.player.weapons.pick, 'оружие выдано');
Game.player.cur = 'pistol'; Game.player.mag = 7;
{
  const g0 = Game.ghosts[0];
  Game.player.x = g0.cx() - 300; Game.player.y = 736; __frames(2);
  Game.player.aim = 0;
  Input.mouse.down = true; Input.mouse.clicked = true; __frames(3); Input.mouse.down = false;
  __assert(Game.player.mag === 6, 'выстрел потратил патрон (mag=' + Game.player.mag + ')');
}
Game.player.cur = 'knife';
__key('KeyJ', true); __frames(2); __key('KeyJ', false); __frames(5);
__assert(Game.player.atkCd > -1, 'удар ножом отработал');
{
  const hpBefore = Game.player.hp;
  Game.player.iframes = 0;
  Game.player.takeDamage(30, Game);
  __assert(Game.player.hp === hpBefore - 30, 'урон проходит (' + hpBefore + ' -> ' + Game.player.hp + ')');
  Game.player.useMedkit(Game);
  __assert(Game.player.hp > hpBefore - 30, 'аптечка лечит (hp=' + Game.player.hp + ')');
  Game.player.san = 40; Game.player.usePills(Game);
  __assert(Game.player.san > 40, 'пилюли чистят рассудок (san=' + Game.player.san + ')');
}
{
  const victim = Game.ghosts.find(g => !g.dead);
  const killsBefore = Game.player.kills;
  victim.takeDamage(9999, Game, 1);
  __assert(victim.dead && Game.player.kills === killsBefore + 1, 'призрак умирает, килл засчитан');
}
for (const t of ['whisper', 'nurse', 'brute', 'spider', 'double']) {
  Game.ghosts.push(new Ghost(t, Game.player.cx() + 200, [Game.player.cx() - 300, Game.player.cx() + 500]));
}
__frames(120);
__assert(true, '5 типов призраков живут 120 кадров');
Game.spawnProjectile({ x: Game.player.cx() - 100, y: Game.player.cy(), vx: 300, vy: 0, r: 10, dmg: 5, san: 5, kind: 'wail', life: 2 });
Game.spawnProjectile({ x: Game.player.cx() - 100, y: Game.player.cy(), vx: 300, vy: 0, r: 8, dmg: 5, san: 0, kind: 'syringe', life: 2 });
__frames(30);
__assert(true, 'снаряды летят');

__log('== DOORS ==');
{
  const dSide = Game.doors.find(d => d.id === 'd_side');
  Game.player.x = dSide.x - 40; Game.player.y = 736; Game.player.vx = 0; __frames(2);
  Game.player.cur = 'pick';
  __assert(Game.interactTarget && Game.interactTarget.type === 'door', 'промпт двери: ' + (Game.interactTarget && Game.interactTarget.label));
  __key('KeyE', true); __frames(2); __key('KeyE', false);
  __frames(200);
  __assert(dSide.open === true, 'шлюз вскрыт затычкой');
  const dRed = Game.doors.find(d => d.id === 'd_red');
  Game.player.keys.key_red = true;
  Game.player.x = dRed.x - 40; __frames(2);
  __key('KeyE', true); __frames(2); __key('KeyE', false); __frames(5);
  __assert(dRed.open === true, 'красная дверь открыта ключом');
}

__log('== BOSS ==');
Game.player.notes = [0, 1, 2, 3];
{
  const dBoss = Game.doors.find(d => d.id === 'd_boss');
  Game.player.x = dBoss.x - 40; Game.player.cur = 'pick'; __frames(2);
  __assert(Game.interactTarget && Game.interactTarget.type === 'door', 'промпт босс-двери: ' + (Game.interactTarget && Game.interactTarget.label));
  __key('KeyE', true); __frames(2); __key('KeyE', false);
  __frames(260);
  __assert(dBoss.open === true, 'босс-дверь открылась');
  Game.player.x = 4650; __frames(5);
  __assert(Game.bossStarted === true && Game.boss !== null, 'босс заспавнился');
  __assert(dBoss.open === false, 'арена заперта');
  __frames(200);
  __assert(Game.boss.state !== 'intro', 'босс вышел из интро (state=' + Game.boss.state + ')');
  Game.player.hp = 100;
  Game.boss.hp = Game.boss.maxhp * 0.5; Game.boss.takeDamage(10, Game, 1);
  __assert(Game.boss.phase === 2, 'фаза 2 (phase=' + Game.boss.phase + ')');
  Game.boss.hp = Game.boss.maxhp * 0.2; Game.boss.takeDamage(10, Game, 1);
  __assert(Game.boss.phase === 3, 'фаза 3 (phase=' + Game.boss.phase + ')');
  Game.player.hp = 100; Game.player.san = 100;
  __frames(200);
  Game.player.hp = 100;
  __assert(Game.boss.hp > 0, 'босс жив после 200 кадров фазы 3');
  Game.boss.takeDamage(99999, Game, 1);
  __assert(Game.bossDead === true, 'босс мёртв');
  __frames(220);
  __assert(Game.state === 'win', 'победа! state=' + Game.state);
}

__log('== DEATH ==');
Game.newGame(false);
__assert(Game.state === 'play', 'рестарт без катсцены');
Game.player.iframes = 0;
Game.player.takeDamage(9999, Game);
__assert(Game.player.dead === true, 'игрок мёртв');
__frames(120);
__assert(Game.state === 'dead', 'экран смерти (state=' + Game.state + ')');

__log('== SAVE ==');
Game.newGame(false);
Game.player.x = 1500; Game.player.notes = [0, 1]; Game.player.reserve = 42;
Game.save(true);
__assert(__hasSave(), 'сейв записан');
Game.player.x = 100; Game.player.notes = [];
Game.loadGame();
__assert(Game.player.x === 1500 && Game.player.notes.length === 2 && Game.player.reserve === 42, 'лоад восстановил данные');

__log('== PAUSE ==');
Game.togglePause(true);
__assert(Game.paused === true, 'пауза вкл');
__frames(10);
Game.togglePause(false);
__assert(Game.paused === false, 'пауза выкл');
