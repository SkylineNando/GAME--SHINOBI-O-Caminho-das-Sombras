// ============================================================================
// SHINOBI — O Caminho das Sombras (versão navegador / HTML5)
// Núcleo: utilidades, cores, entrada, áudio sintetizado, progressão e salvamento.
// ============================================================================
"use strict";
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const moveToward = (a, b, d) => (Math.abs(b - a) <= d ? b : a + Math.sign(b - a) * d);
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);

function seededRng(seed) {
  let s = (seed >>> 0) || 1;
  const r = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  r.range = (a, b) => a + r() * (b - a);
  r.int = (a, b) => Math.floor(a + r() * (b - a + 1));
  return r;
}

// ---------------------------------------------------------------- cores
const _colCache = {};
function hex(h) {
  if (_colCache[h]) return _colCache[h];
  let s = h.replace("#", "");
  if (s.length === 3) s = s.split("").map((c) => c + c).join("");
  const c = [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  _colCache[h] = c;
  return c;
}
const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const INK = [23, 20, 18], PAPER = [237, 227, 204], RED = [179, 34, 23], BLOOD = [158, 20, 15];

// ---------------------------------------------------------------- entrada
const Input = {
  down: {}, pressed: {}, released: {}, axis: { x: 0, y: 0 }, touchAxis: null,
  keymap: {
    KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right", KeyW: "up", ArrowUp: "up",
    KeyS: "down", ArrowDown: "down", Space: "jump", KeyJ: "light", KeyK: "heavy", KeyL: "block",
    ShiftLeft: "dodge", ShiftRight: "dodge", KeyE: "dash", KeyU: "shuriken", KeyI: "kunai", KeyO: "special",
    KeyQ: "stealth", KeyH: "elixir", Escape: "pause", KeyP: "pause", Enter: "confirm",
  },
  padPrev: {},
  set(action, on) {
    if (on && !this.down[action]) this.pressed[action] = true;
    if (!on && this.down[action]) this.released[action] = true;
    this.down[action] = on;
  },
  isDown(a) { return !!this.down[a]; },
  justPressed(a) { return !!this.pressed[a]; },
  justReleased(a) { return !!this.released[a]; },
  endFrame() { this.pressed = {}; this.released = {}; },
  pollGamepad() {
    if (this.padOff || !navigator.getGamepads) return;
    let pads;
    try { pads = navigator.getGamepads(); } catch (e) { this.padOff = true; return; } // bloqueado (ex.: iframe sem permissão)
    const p = pads && pads[0];
    if (!p) return;
    const map = { 0: "jump", 2: "light", 3: "heavy", 1: "dodge", 5: "block", 4: "dash", 12: "shuriken", 13: "kunai",
      11: "special", 10: "stealth", 8: "elixir", 9: "pause", 14: "left", 15: "right" };
    for (const k in map) {
      const on = !!(p.buttons[k] && p.buttons[k].pressed);
      if (on !== !!this.padPrev[k]) this.set(map[k], on);
      this.padPrev[k] = on;
    }
    const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
    this.padAxis = { x: Math.abs(ax) > 0.25 ? ax : 0, y: Math.abs(ay) > 0.3 ? ay : 0 };
  },
  getX() {
    let x = (this.down.right ? 1 : 0) - (this.down.left ? 1 : 0);
    if (this.touchAxis && Math.abs(this.touchAxis.x) > 0.22) x = this.touchAxis.x;
    if (this.padAxis && this.padAxis.x) x = this.padAxis.x;
    return clamp(x, -1, 1);
  },
  getY() {
    let y = (this.down.down ? 1 : 0) - (this.down.up ? 1 : 0);
    if (this.touchAxis && Math.abs(this.touchAxis.y) > 0.55) y = this.touchAxis.y;
    if (this.padAxis && this.padAxis.y) y = this.padAxis.y;
    return clamp(y, -1, 1);
  },
};
window.addEventListener("keydown", (e) => {
  const a = Input.keymap[e.code];
  if (a) { if (!e.repeat) Input.set(a, true); if (Game && Game.state === "level") e.preventDefault(); }
  Audio2.unlock();
});
window.addEventListener("keyup", (e) => { const a = Input.keymap[e.code]; if (a) Input.set(a, false); });
window.addEventListener("blur", () => { for (const k in Input.down) Input.set(k, false); });

// ---------------------------------------------------------------- áudio (100% sintetizado)
const SR = 22050;
const Synth = {
  buf(sec) { return new Float32Array(Math.floor(sec * SR)); },
  norm(b, peak = 0.85) { let m = 1e-4; for (let i = 0; i < b.length; i++) m = Math.max(m, Math.abs(b[i])); const k = peak / m; for (let i = 0; i < b.length; i++) b[i] *= k; return b; },
  whoosh(dur, c0, c1, rising, seed) {
    const r = seededRng(seed), b = this.buf(dur), n = b.length; let y = 0, y2 = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n, a = lerp(c0, c1, t);
      y += a * (r() * 2 - 1 - y); y2 += a * (y - y2);
      const env = rising ? Math.pow(t, 1.5) * (1 - smoothstep(0.92, 1, t)) : Math.min(1, t / 0.06) * (1 - t) * (1 - t);
      b[i] = y2 * env * 2.2;
    }
    return b;
  },
  tone(fa, fb, dur, decay, amp) {
    const b = this.buf(dur); let ph = 0;
    for (let i = 0; i < b.length; i++) { const t = i / SR; ph += TAU * lerp(fa, fb, Math.min(1, t / dur)) / SR; b[i] = Math.sin(ph) * Math.exp(-t * decay) * amp * Math.min(1, t * 400); }
    return b;
  },
  bell(freqs, dur, decay, amp) {
    const b = this.buf(dur);
    for (let i = 0; i < b.length; i++) { const t = i / SR; let s = 0, k = 1; for (const f of freqs) { s += Math.sin(TAU * f * t) * Math.exp(-t * decay * k) / k; k += 0.6; } b[i] = s * amp * Math.min(1, t * 800); }
    return b;
  },
  pluck(freq, dur, amp, damp, seed) {
    const r = seededRng(seed), period = Math.max(2, Math.floor(SR / freq)), ring = new Float32Array(period);
    for (let i = 0; i < period; i++) ring[i] = r() * 2 - 1;
    const b = this.buf(dur); let idx = 0;
    for (let i = 0; i < b.length; i++) { const v = ring[idx], nx = ring[(idx + 1) % period]; ring[idx] = (v + nx) * 0.5 * damp; b[i] = v * amp; idx = (idx + 1) % period; }
    return b;
  },
  mix(dst, src, off, gain, wrap) { const n = dst.length; for (let i = 0; i < src.length; i++) { let j = off + i; if (j >= n) { if (!wrap) return; j %= n; } dst[j] += src[i] * gain; } },
  cat(parts) { let n = 0; parts.forEach((p) => (n += p.length)); const o = new Float32Array(n); let k = 0; parts.forEach((p) => { o.set(p, k); k += p.length; }); return o; },
  sfx(id) {
    const S = this; let b;
    switch (id) {
      case "slash": b = S.whoosh(0.22, 0.55, 0.04, false, 11); break;
      case "slash_heavy": b = S.whoosh(0.38, 0.35, 0.02, false, 12); S.mix(b, S.tone(140, 60, 0.3, 9, 0.35), 0, 1); break;
      case "hit": b = S.tone(110, 48, 0.22, 16, 0.9); S.mix(b, S.whoosh(0.07, 0.8, 0.2, false, 13), 0, 0.6); break;
      case "hit_heavy": b = S.tone(90, 38, 0.35, 10, 1); S.mix(b, S.whoosh(0.12, 0.7, 0.1, false, 14), 0, 0.8); break;
      case "clang": b = S.bell([1250, 1870, 2630, 3400], 0.45, 9, 0.5); S.mix(b, S.whoosh(0.03, 0.95, 0.6, false, 15), 0, 0.5); break;
      case "parry": b = S.bell([1500, 2250, 3150, 4100], 0.7, 6, 0.55); S.mix(b, S.tone(2400, 2400, 0.5, 6, 0.25), 0, 1); break;
      case "shuriken": b = S.whoosh(0.16, 0.7, 0.2, false, 16); S.mix(b, S.tone(3200, 3000, 0.15, 25, 0.25), 0, 1); break;
      case "kunai": b = S.whoosh(0.15, 0.6, 0.15, false, 17); break;
      case "arrow": b = S.tone(1900, 1150, 0.32, 6, 0.25); S.mix(b, S.whoosh(0.3, 0.4, 0.15, false, 18), 0, 0.7); break;
      case "bow": b = S.whoosh(0.35, 0.05, 0.12, true, 19); break;
      case "jump": b = S.whoosh(0.16, 0.25, 0.06, false, 20); break;
      case "land": b = S.tone(80, 45, 0.14, 25, 0.7); S.mix(b, S.whoosh(0.08, 0.3, 0.05, false, 21), 0, 0.5); break;
      case "step": b = S.whoosh(0.05, 0.25, 0.08, false, 22); break;
      case "dodge": case "dash": b = S.whoosh(0.24, 0.4, 0.05, false, 23); break;
      case "coin": b = S.cat([S.pluck(1318.5, 0.09, 0.6, 0.996, 24), S.pluck(1760, 0.35, 0.6, 0.996, 25)]); break;
      case "pickup": b = S.pluck(880, 0.5, 0.7, 0.997, 26); break;
      case "heal": b = S.cat([S.pluck(659.3, 0.12, 0.6, 0.997, 27), S.pluck(880, 0.12, 0.6, 0.997, 28), S.pluck(1174.7, 0.5, 0.6, 0.997, 29)]); break;
      case "hurt": b = S.tone(120, 55, 0.3, 9, 0.9); S.mix(b, S.whoosh(0.2, 0.5, 0.05, false, 30), 0, 0.6); break;
      case "enemy_die": b = S.whoosh(0.5, 0.3, 0.02, false, 31); S.mix(b, S.tone(100, 40, 0.45, 6, 0.7), 0, 1); break;
      case "player_die": case "gong": b = S.bell([98, 151, 214, 290, 401], 2.6, 1.4, 0.5); break;
      case "ui_click": b = S.bell([900, 1800], 0.08, 45, 0.6); break;
      case "ui_move": b = S.bell([700, 1400], 0.06, 60, 0.35); break;
      case "teleport": b = S.whoosh(0.45, 0.02, 0.6, true, 32); break;
      case "level_up": case "victory": { const notes = [587.3, 659.3, 880, 987.8, 1174.7]; b = S.cat(notes.map((f, i) => S.pluck(f, i < 4 ? 0.13 : 0.9, 0.6, 0.997, 40 + i))); break; }
      case "boss_roar": b = S.whoosh(1.0, 0.08, 0.03, false, 34); for (let i = 0; i < b.length; i++) b[i] *= 0.6 + 0.4 * Math.sin(TAU * 28 * i / SR); S.mix(b, S.tone(65, 50, 1, 1.5, 0.6), 0, 1); break;
      case "explosion": b = S.whoosh(0.7, 0.4, 0.01, false, 35); S.mix(b, S.tone(60, 30, 0.6, 4, 0.9), 0, 1); break;
      case "alert": b = S.cat([S.pluck(1046.5, 0.07, 0.6, 0.994, 36), S.pluck(1396.9, 0.2, 0.6, 0.994, 37)]); break;
      case "checkpoint": b = S.bell([2093, 2637, 3136], 1.2, 3, 0.35); break;
      case "stealth": b = S.whoosh(0.4, 0.03, 0.2, true, 38); break;
      case "chain": b = S.bell([2800, 3700], 0.2, 20, 0.3); S.mix(b, S.whoosh(0.25, 0.5, 0.2, false, 39), 0, 0.5); break;
      case "thunder": b = S.whoosh(1.8, 0.05, 0.01, false, 50); S.mix(b, S.tone(45, 30, 1.5, 2, 0.6), 0, 1); break;
      default: b = S.whoosh(0.1, 0.4, 0.1, false, 1);
    }
    return S.norm(b, 0.9);
  },
  ambient(id) {
    const r = seededRng(77), b = this.buf(6); const n = b.length; let y = 0, y2 = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n, x = r() * 2 - 1;
      if (id === "wind") { const a = 0.02 + 0.015 * Math.sin(TAU * t * 3) + 0.01 * Math.sin(TAU * t * 7); y += a * (x - y); y2 += a * (y - y2); b[i] = y2 * (0.6 + 0.4 * Math.sin(TAU * t * 2)); }
      else if (id === "rain") { y += 0.35 * (x - y); b[i] = (x - y) * 0.5 + (r() < 0.002 ? rand(0.3, 0.8) : 0); }
      else { y += 0.12 * (x - y); y2 += 0.3 * (y - y2); b[i] = y2 * (0.8 + 0.2 * Math.sin(TAU * t * 11)); }
    }
    const fade = Math.floor(0.2 * SR);
    for (let i = 0; i < fade; i++) { const k = i / fade; b[i] = b[i] * k + b[n - fade + i] * (1 - k); }
    return this.norm(b.subarray(0, n - fade), 0.6);
  },
  music(id) {
    const IN = [0, 1, 5, 7, 8], YO = [0, 2, 5, 7, 9];
    const cfg = {
      menu: [62, 146.83, IN, 24, 0.55, 0.8, 0, 0.5, 3], village: [76, 146.83, YO, 32, 0.65, 0.5, 0.15, 0.35, 5],
      bamboo: [70, 164.81, IN, 28, 0.45, 0.9, 0, 0.45, 8], castle: [88, 130.81, IN, 32, 0.7, 0.35, 0.45, 0.35, 13],
      temple: [56, 123.47, IN, 24, 0.35, 0.7, 0.1, 0.8, 21], fortress: [96, 110, IN, 32, 0.7, 0.3, 0.7, 0.5, 34],
      boss: [116, 116.54, IN, 32, 0.9, 0.2, 1, 0.4, 55], final_boss: [126, 110, IN, 32, 1, 0.4, 1, 0.6, 89],
      victory: [80, 174.61, YO, 16, 0.8, 0.6, 0.3, 0.3, 144],
    }[id] || [62, 146.83, IN, 24, 0.55, 0.8, 0, 0.5, 3];
    const [bpm, root, scale, beats, koto, flute, taiko, drone, seed] = cfg;
    const beat = 60 / bpm, total = beat * beats, b = this.buf(total), n = b.length, r = seededRng(seed);
    if (drone > 0) for (let i = 0; i < n; i++) { const t = i / SR; const lfo = 0.6 + 0.4 * Math.sin(TAU * t / total * 2); b[i] += (Math.sin(TAU * root * 0.5 * t) + 0.5 * Math.sin(TAU * root * 0.75 * t)) * 0.06 * drone * lfo; }
    if (koto > 0) {
      let deg = 5;
      for (let s = 0; s < beats * 2; s++) {
        if (r() > koto * (s % 2 === 0 ? 0.75 : 0.35)) continue;
        deg = clamp(deg + r.int(-2, 2), 0, 11);
        const f = root * Math.pow(2, (scale[deg % 5] + 12 * Math.floor(deg / 5)) / 12) * 2;
        this.mix(b, this.pluck(f, 1.3, 0.35, 0.9975, seed * 100 + s), Math.floor(s * beat * 0.5 * SR), 1, true);
        if (r() < 0.2) this.mix(b, this.pluck(f, 0.5, 0.18, 0.996, s + 7), Math.floor((s * beat * 0.5 + beat * 0.12) * SR), 1, true);
      }
    }
    if (flute > 0) {
      for (let bar = 0; bar < Math.floor(beats / 4); bar++) {
        if (r() > flute) continue;
        const f2 = root * Math.pow(2, (scale[r.int(0, 4)] + 12) / 12) * 2;
        const start = Math.floor(bar * 4 * beat * SR + r() * beat * SR), len = Math.floor(beat * r.range(2.5, 3.8) * SR);
        let ph = 0;
        for (let i = 0; i < len; i++) {
          const t = i / SR, tl = i / len, env = smoothstep(0, 0.25, tl) * (1 - smoothstep(0.7, 1, tl));
          ph += TAU * f2 * (1 - 0.06 * Math.exp(-t * 6)) * (1 + 0.008 * Math.sin(TAU * 5.2 * t) * smoothstep(0.2, 0.6, tl)) / SR;
          b[(start + i) % n] += (Math.sin(ph) + 0.25 * Math.sin(ph * 2) + (r() * 2 - 1) * 0.12) * env * 0.16 * flute;
        }
      }
    }
    if (taiko > 0) {
      const hit = this.tone(70, 42, 0.6, 6, 0.55), small = this.tone(140, 90, 0.2, 18, 0.25), pat = [1, 0, 0.5, 0, 0.8, 0.5, 0, 0.5];
      for (let k = 0; k < beats * 2; k++) { const p = pat[k % 8]; if (p <= 0 || r() > taiko + 0.2) continue; this.mix(b, p >= 0.8 ? hit : small, Math.floor(k * beat * 0.5 * SR), p * taiko, true); }
    }
    return this.norm(b, 0.8);
  },
};

const Audio2 = {
  ctx: null, music: null, sfx: null, cache: {}, current: "", curSrc: null, curGain: null, amb: null, last: {},
  unlock() {
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.music = this.ctx.createGain(); this.music.connect(this.ctx.destination);
        this.sfx = this.ctx.createGain(); this.sfx.connect(this.ctx.destination);
        this.applyVolumes();
        if (this.wanted) { const w = this.wanted; this.current = ""; this.playMusic(w); }
        if (this.wantedAmb) this.playAmbient(this.wantedAmb);
      } catch (e) { return; }
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  },
  applyVolumes() {
    if (!this.ctx) return;
    this.music.gain.value = Save.data.settings.music * 0.8;
    this.sfx.gain.value = Save.data.settings.sfx;
  },
  buffer(key, gen) {
    if (this.cache[key]) return this.cache[key];
    const data = gen(); const b = this.ctx.createBuffer(1, data.length, SR); b.getChannelData(0).set(data);
    this.cache[key] = b; return b;
  },
  play(id, pv = 0.08, db = 0) {
    if (!this.ctx) return;
    const now = performance.now();
    if (now - (this.last[id] || 0) < 35) return;
    this.last[id] = now;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer("s_" + id, () => Synth.sfx(id));
    src.playbackRate.value = 1 + rand(-pv, pv);
    const g = this.ctx.createGain(); g.gain.value = Math.pow(10, db / 20);
    src.connect(g); g.connect(this.sfx); src.start();
  },
  playMusic(id) {
    this.wanted = id;
    if (!this.ctx || id === this.current) return;
    this.current = id;
    const t = this.ctx.currentTime;
    if (this.curGain) { const og = this.curGain, os = this.curSrc; og.gain.setTargetAtTime(0, t, 0.3); setTimeout(() => { try { os.stop(); } catch (e) {} }, 1500); }
    this.curSrc = null; this.curGain = null;
    if (!id) return;
    setTimeout(() => {
      if (this.current !== id) return;
      const src = this.ctx.createBufferSource(); src.buffer = this.buffer("m_" + id, () => Synth.music(id)); src.loop = true;
      const g = this.ctx.createGain(); g.gain.value = 0; g.gain.setTargetAtTime(0.7, this.ctx.currentTime, 0.4);
      src.connect(g); g.connect(this.music); src.start();
      this.curSrc = src; this.curGain = g;
    }, 30);
  },
  playAmbient(id) {
    this.wantedAmb = id;
    if (!this.ctx) return;
    if (this.amb) { try { this.amb.stop(); } catch (e) {} this.amb = null; }
    if (!id || id === "none") return;
    const src = this.ctx.createBufferSource(); src.buffer = this.buffer("a_" + id, () => Synth.ambient(id)); src.loop = true;
    const g = this.ctx.createGain(); g.gain.value = 0.2; src.connect(g); g.connect(this.sfx); src.start(); this.amb = src;
  },
};

// ---------------------------------------------------------------- progressão e salvamento
const Save = {
  KEY: "shinobi_save_v1",
  data: null,
  defaults() {
    return { level: 1, xp: 0, coins: 0, unlocked_stage: 1, stages: {}, katana_tier: 0, outfit: "kage", outfits: ["kage"],
      skills: [], upgrades: { hp_up: 0, energy_up: 0 }, inventory: { shuriken: 15, kunai: 0, elixir: 1 },
      weapons: ["katana", "tanto", "shuriken"], settings: { music: 0.7, sfx: 0.85, shake: true, touch: "auto" },
      game_completed: false, started: false };
  },
  load() {
    this.data = this.defaults();
    try {
      const raw = localStorage.getItem(this.KEY);
      if (raw) { const d = JSON.parse(raw); const merge = (a, b) => { for (const k in b) { if (a[k] && typeof a[k] === "object" && !Array.isArray(a[k]) && typeof b[k] === "object") merge(a[k], b[k]); else a[k] = b[k]; } }; merge(this.data, d); }
    } catch (e) {}
  },
  save() { try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e) {} },
  wipe() { try { localStorage.removeItem(this.KEY); } catch (e) {} this.data = this.defaults(); },
};
Save.load();

const LIMITS = { shuriken: 40, kunai: 20, elixir: 5 };
const Prog = {
  get d() { return Save.data; },
  xpNext(l) { return Math.floor(100 * Math.pow(l || this.d.level, 1.35)); },
  addXp(n) {
    this.d.xp += n; let up = false;
    while (this.d.xp >= this.xpNext()) { this.d.xp -= this.xpNext(); this.d.level++; up = true; }
    if (up) { Hud.message(`Nível ${this.d.level}! Vida e energia aumentaram.`, RED); Audio2.play("level_up"); }
  },
  addCoins(n) { this.d.coins = Math.max(0, this.d.coins + n); },
  maxHp() { return DATA.kage.stats.max_hp + (this.d.level - 1) * 5 + this.d.upgrades.hp_up * 20 + (this.d.outfit === "kage_tinta" ? 15 : 0); },
  maxEnergy() { return DATA.kage.stats.max_energy + (this.d.level - 1) * 3 + this.d.upgrades.energy_up * 20; },
  katana() { const t = DATA.weapons.katana_tiers; return t[clamp(this.d.katana_tier, 0, t.length - 1)]; },
  dmgMult() { let m = this.katana().mult * (1 + (this.d.level - 1) * 0.02); if (this.d.outfit === "kage_carmesim") m *= 1.08; return m; },
  stealthBonus() { let b = 1; if (this.d.outfit === "kage_nevoa") b *= 0.7; if (this.has("stealth_master")) b *= 0.75; return b; },
  has(s) { return this.d.skills.includes(s); },
  count(id) { return this.d.inventory[id] || 0; },
  addItem(id, n) { this.d.inventory[id] = clamp(this.count(id) + n, 0, LIMITS[id] || 99); },
  consume(id) { if (this.count(id) <= 0) return false; this.d.inventory[id]--; return true; },
  hasWeapon(w) { return this.d.weapons.includes(w); },
  item(id) { return DATA.shop.items.find((i) => i.id === id) || null; },
  itemLevel(id) {
    const it = this.item(id); if (!it) return 0;
    switch (it.type) {
      case "katana": return this.d.katana_tier >= it.value ? 1 : 0;
      case "stat": return this.d.upgrades[id] || 0;
      case "skill": return this.has(id) ? 1 : 0;
      case "outfit": return this.d.outfits.includes(it.skin) ? 1 : 0;
    }
    return 0;
  },
  cost(id) { const it = this.item(id); let c = it.cost; if (it.type === "stat") c = Math.floor(c * (1 + 0.6 * this.itemLevel(id))); return c; },
  canBuy(id) {
    const it = this.item(id); if (!it) return "Item inexistente.";
    if (it.requires && this.itemLevel(it.requires) <= 0) return "Requer: " + this.item(it.requires).name;
    if (it.type !== "consumable" && it.type !== "stat" && this.itemLevel(id) > 0) return "Já adquirido.";
    if (it.type === "stat" && this.itemLevel(id) >= (it.max || 5)) return "Máximo atingido.";
    if (it.type === "consumable" && this.count(it.value) >= (LIMITS[it.value] || 99)) return "Inventário cheio.";
    if (this.d.coins < this.cost(id)) return "Moedas insuficientes.";
    return "";
  },
  buy(id) {
    const err = this.canBuy(id); if (err) return err;
    const it = this.item(id); this.addCoins(-this.cost(id));
    switch (it.type) {
      case "katana": this.d.katana_tier = Math.max(this.d.katana_tier, it.value); break;
      case "stat": this.d.upgrades[id] = (this.d.upgrades[id] || 0) + 1; break;
      case "skill": this.d.skills.push(id); if (id === "kunai_art") { if (!this.hasWeapon("kunai")) this.d.weapons.push("kunai"); this.addItem("kunai", 8); } break;
      case "outfit": this.d.outfits.push(it.skin); this.d.outfit = it.skin; break;
      case "consumable": this.addItem(it.value, it.amount || 1); break;
    }
    Save.save(); return "";
  },
  completeStage(n, st) {
    const prev = this.d.stages[n] || {};
    this.d.stages[n] = { done: true, best_time: Math.min(prev.best_time || 99999, st.time), kills: Math.max(prev.kills || 0, st.kills) };
    if (n >= 5) this.d.game_completed = true;
    this.d.unlocked_stage = Math.max(this.d.unlocked_stage, Math.min(n + 1, 5));
    Save.save();
  },
  newGame() { const s = this.d.settings; Save.data = Save.defaults(); Save.data.settings = s; Save.data.started = true; Save.save(); },
  touchEnabled() {
    const m = this.d.settings.touch;
    if (m === "on") return true; if (m === "off") return false;
    return ("ontouchstart" in window) || navigator.maxTouchPoints > 0;
  },
};
