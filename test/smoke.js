/* Раннер smoke-теста: стабы браузера + vm-контекст для игры.
   Запуск: node test/smoke.js (из корня репозитория) */
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const DIR = path.join(__dirname, '..');

let failures = 0;
function makeCtx() {
  return new Proxy({}, {
    get(t, k) {
      if (k === 'canvas') return {};
      if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (k === 'createImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (k === 'measureText') return () => ({ width: 40 });
      return (...a) => {
        if (typeof k === 'string' && k.startsWith('create')) return { addColorStop() {} };
        return undefined;
      };
    },
    set() { return true; }
  });
}
const elements = {};
function makeEl(id) {
  return {
    _id: id, style: {}, children: [], width: 300, height: 150,
    textContent: '', innerHTML: '', value: '', onclick: null,
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); }, toggle(c) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); } },
    appendChild(c) { this.children.push(c); return c; },
    get firstChild() { return this.children[0]; },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); },
    remove() {},
    addEventListener() {}, removeEventListener() {},
    getContext: () => makeCtx(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
  };
}
const listeners = {};
const store = {};
let rafCb = null;
let now = 1000;
const timers = [];

function frames(n, dtms = 16.7) {
  for (let i = 0; i < n; i++) {
    const cb = rafCb; rafCb = null;
    if (!cb) throw new Error('rAF цепочка оборвалась!');
    now += dtms;
    cb(now);
  }
}
function key(code, down) {
  for (const fn of (listeners[down ? 'keydown' : 'keyup'] || [])) fn({ code, preventDefault() {} });
}
function flushTimers() {
  let guard = 0;
  while (timers.length && guard++ < 200) {
    const t = timers.shift();
    try { t.fn(); } catch (e) { console.log('  FAIL: таймер бросил исключение:', e.message); failures++; }
  }
}

const sandbox = {
  console, Math, JSON, Object, Array, String, Number, Boolean, performance, Date, Error, Set, Map, isNaN, parseInt, parseFloat, Uint8ClampedArray,
  setTimeout: (fn) => { timers.push({ fn }); return timers.length; },
  clearTimeout: () => {},
  window: {
    addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
    removeEventListener: () => {},
    innerWidth: 1600, innerHeight: 900,
    AudioContext: undefined, webkitAudioContext: undefined,
  },
  document: {
    getElementById: id => elements[id] || (elements[id] = makeEl(id)),
    createElement: tag => makeEl('dyn'),
    addEventListener: () => {},
    hidden: false,
  },
  localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
  },
  requestAnimationFrame: cb => { rafCb = cb; },
  __assert: (cond, msg) => {
    if (cond) console.log('  PASS:', msg);
    else { failures++; console.log('  FAIL:', msg); }
  },
  __log: msg => console.log(msg),
  __frames: (n, dt) => frames(n, dt),
  __key: (code, down) => key(code, down),
  __mouse: st => { Object.assign(Input.mouse, st); },
  __flushTimers: () => flushTimers(),
  __click: id => {
    const el = elements[id];
    if (!el || !el.onclick) throw new Error('no onclick on #' + id);
    el.onclick();
  },
  __has: id => !!elements[id],
  __text: id => (elements[id] ? elements[id].textContent : ''),
  __hidden: id => {
    const el = elements[id];
    return !el || el.classList.contains('hidden');
  },
  __fireLoad: () => { for (const fn of (listeners['load'] || [])) fn(); },
  __store: () => store,
  __hasSave: () => !!store['mishutka_save_v2'],
  __startPlay: () => Game.startPlay(),
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

for (const f of ['js/audio.js', 'js/data.js', 'js/engine.js', 'js/entities.js', 'js/game.js']) {
  const code = fs.readFileSync(path.join(DIR, f), 'utf8');
  vm.runInContext(code, sandbox, { filename: f });
}
const body = fs.readFileSync(process.env.SMOKE_BODY || path.join(__dirname, 'smoke-body.js'), 'utf8');
try {
  vm.runInContext(body, sandbox, { filename: 'smoke-body.js' });
} catch (e) {
  failures++;
  console.log('  FAIL: исключение:', e.stack.split('\n').slice(0, 10).join('\n'));
}
console.log(failures === 0 ? '\nALL SMOKE TESTS PASSED' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
