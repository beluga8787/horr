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
    textContent: '', innerHTML: '', onclick: null,
    classList: { add() {}, remove() {}, toggle() {} },
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

const sandbox = {
  console, Math, JSON, Object, Array, String, Number, Boolean, performance,
  setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms || 0, 50)),
  clearTimeout: (...a) => clearTimeout(...a),
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
  __click: id => {
    const el = elements[id];
    if (!el || !el.onclick) throw new Error('no onclick on #' + id);
    el.onclick();
  },
  __fireLoad: () => { for (const fn of (listeners['load'] || [])) fn(); },
  __hasSave: () => !!store['mishutka_save_v1'],
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

for (const f of ['js/audio.js', 'js/data.js', 'js/engine.js', 'js/entities.js', 'js/game.js']) {
  const code = fs.readFileSync(path.join(DIR, f), 'utf8');
  vm.runInContext(code, sandbox, { filename: f });
}
const body = fs.readFileSync(path.join(__dirname, 'smoke-body.js'), 'utf8');
try {
  vm.runInContext(body, sandbox, { filename: 'smoke-body.js' });
} catch (e) {
  failures++;
  console.log('  FAIL: исключение:', e.stack.split('\n').slice(0, 8).join('\n'));
}
console.log(failures === 0 ? '\nALL SMOKE TESTS PASSED' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
