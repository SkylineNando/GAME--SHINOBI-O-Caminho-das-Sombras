// ============================================================================
// Jogo: laço principal, escala de tela, HUD, controles de toque, menus (DOM).
// ============================================================================
const NUMERALS = ["壱", "弐", "参", "肆", "伍"];
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const Game = {
  state: "menu", level: null, vw: 1280, S: 1, zoom: 1.15, timeScale: 1, hitT: 0, shakeAmt: 0, shakeT: 0, paused: false, _paper: {},
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2), w = window.innerWidth, h = window.innerHeight;
    canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(h * dpr); canvas.style.width = w + "px"; canvas.style.height = h + "px";
    this.S = canvas.height / 720; this.vw = canvas.width / this.S; this._paper = {};
  },
  paper(theme) { const k = theme + Math.round(this.vw); if (!this._paper[k]) this._paper[k] = makePaper(theme, this.vw, 720); return this._paper[k]; },
  hitStop(t, scale = 0.05) { this.hitT = Math.max(this.hitT, t); this.timeScale = scale; },
  shake(a, t) { if (!Save.data.settings.shake) return; this.shakeAmt = Math.max(this.shakeAmt * (this.shakeT > 0 ? 1 : 0), a); this.shakeT = Math.max(this.shakeT, t); },
  startLevel(n, resume) { UI.hide(); this.fade(() => { this.level = new Level(n, resume); this.state = "level"; this.paused = false; UI.showTouch(Prog.touchEnabled()); }); },
  toMenu(panel) { this.fade(() => { this.level = null; this.state = "menu"; this.paused = false; UI.showTouch(false); Menu.enter(panel); }); },
  fade(fn) { const f = document.getElementById("fade"); f.style.opacity = 1; setTimeout(() => { fn(); setTimeout(() => (f.style.opacity = 0), 60); }, 380); },
  togglePause() { if (this.state !== "level" || !this.level || this.level.completed || this.level.failed) return; this.paused = !this.paused; if (this.paused) UI.pause(); else UI.hide(); Audio2.play("ui_click"); },
};

// ---------------------------------------------------------------- HUD (canvas)
const Hud = {
  msg: "", msgCol: INK, msgT: 0, ban: null, boss: null, hpShown: 100, t: 0,
  reset() { this.msg = ""; this.ban = null; this.boss = null; },
  message(s, col = INK) { this.msg = s; this.msgCol = col; this.msgT = 2.8; },
  banner(title, text, dur, sub = "") { this.ban = { title, text, sub, t: 0, dur }; },
  bossStart(n, hp, max) { this.boss = { n, hp, max, shown: hp }; }, bossHp(hp, max) { if (this.boss) { this.boss.hp = hp; this.boss.max = max; } }, bossEnd() { this.boss = null; },
  bar(c, x, y, w, h, f, col, back) {
    polyFill(c, [[x, y + h * 0.15], [x + w, y], [x + w - 6, y + h], [x + 4, y + h * 0.9]], back);
    f = clamp(f, 0, 1); if (f <= 0) return; const fw = w * f, j = Math.sin(this.t * 6) * 1.5;
    polyFill(c, [[x + 2, y + h * 0.2], [x + fw, y + 1 + j], [x + fw - 5, y + h - 1], [x + 5, y + h * 0.85]], col);
  },
  text(c, s, x, y, size, col, align = "left", font = "Georgia, serif") { c.font = `${size}px ${font}`; c.textAlign = align; c.lineWidth = 5; c.strokeStyle = "rgba(237,227,204,0.85)"; c.strokeText(s, x, y); c.fillStyle = col; c.fillText(s, x, y); },
  draw(c, dt) {
    this.t += dt; const L = Game.level, p = L.player, vw = Game.vw;
    this.hpShown = lerp(this.hpShown, p.hp, Math.min(1, dt * 6));
    // retrato
    const cx = 70, cy = 70; circ(c, cx, cy, 50, "rgba(237,227,204,0.92)"); c.strokeStyle = S_INK; c.lineWidth = 5; c.beginPath(); c.arc(cx, cy, 50, 0, TAU); c.stroke();
    circ(c, cx, cy + 10, 30, S_INK); circ(c, cx + 2, cy + 2, 24, S_INK); line(c, [cx - 8, cy], [cx + 20, cy], 5, "rgb(237,227,204)");
    line(c, [cx - 22, cy - 10], [cx - 44, cy - 2 + Math.sin(this.t * 5) * 4], 4, S_INK); c.fillStyle = RED_S; c.fillRect(cx + 30, cy + 28, 16, 16);
    const bw = 260 * clamp(p.maxHp / 100, 1, 1.6), ew = 200 * clamp(p.maxEnergy / 100, 1, 1.6);
    this.bar(c, 128, 34, bw, 20, this.hpShown / p.maxHp, RED_S, "rgba(23,20,18,0.25)"); this.text(c, String(Math.ceil(p.hp)), 140 + bw, 50, 16, S_INK);
    this.bar(c, 128, 60, ew, 12, p.energy / p.maxEnergy, "rgba(38,41,51,0.9)", "rgba(23,20,18,0.18)");
    c.fillStyle = "rgba(23,20,18,0.15)"; c.fillRect(128, 80, 200, 4); c.fillStyle = "rgba(158,115,26,0.9)"; c.fillRect(128, 80, 200 * clamp(Prog.d.xp / Prog.xpNext(), 0, 1), 4);
    this.text(c, "Lv. " + Prog.d.level, 128, 110, 22, S_INK);
    // itens
    let x = vw - 110; const y = 46;
    const item = (kind, n) => {
      c.font = "22px Georgia, serif"; const tw = c.measureText(String(n)).width; const tx = x - tw; this.text(c, String(n), tx, y + 8, 22, S_INK); const ix = tx - 20;
      if (kind === "coin") { circ(c, ix, y, 12, "rgb(184,143,51)"); circ(c, ix, y, 9, "rgb(217,173,71)"); c.fillStyle = S_INK; c.fillRect(ix - 3, y - 3, 6, 6); }
      else if (kind === "shuriken") { for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; polyFill(c, [[ix + Math.cos(a + 0.6) * 4, y + Math.sin(a + 0.6) * 4], [ix + Math.cos(a) * 14, y + Math.sin(a) * 14], [ix + Math.cos(a - 0.6) * 4, y + Math.sin(a - 0.6) * 4]], S_INK); } circ(c, ix, y, 3, "rgb(237,227,204)"); }
      else if (kind === "kunai") { polyFill(c, [[ix + 12, y - 12], [ix - 1, y - 4], [ix + 4, y + 1]], S_INK); line(c, [ix + 1, y - 1], [ix - 10, y + 10], 3, S_INK); }
      else { circ(c, ix, y + 3, 10, "rgb(38,115,64)"); c.fillStyle = "rgb(128,89,51)"; c.fillRect(ix - 3, y - 14, 6, 8); }
      x = tx - 56;
    };
    item("coin", Prog.d.coins); item("elixir", Prog.count("elixir")); if (Prog.hasWeapon("kunai")) item("kunai", Prog.count("kunai")); item("shuriken", Prog.count("shuriken"));
    // pausa
    const pc = [vw - 52, 46]; circ(c, pc[0], pc[1], 28, "rgba(237,227,204,0.85)"); c.strokeStyle = S_INK; c.lineWidth = 3.5; c.beginPath(); c.arc(pc[0], pc[1], 28, 0, TAU); c.stroke(); c.fillStyle = S_INK; c.fillRect(pc[0] - 9, pc[1] - 11, 6, 22); c.fillRect(pc[0] + 3, pc[1] - 11, 6, 22);
    // fase
    const st = `${NUMERALS[L.n - 1]}  ${L.d.name}`; this.text(c, st, vw / 2, 30, 18, S_INK, "center"); c.font = "18px Georgia"; const sw = c.measureText(st).width; line(c, [vw / 2 - sw / 2, 38], [vw / 2 + sw / 2, 36], 2, "rgba(179,33,23,0.8)");
    // chefe
    if (this.boss) { const b = this.boss; b.shown = lerp(b.shown, b.hp, Math.min(1, dt * 6)); const w = Math.min(560, vw * 0.5); this.text(c, b.n, vw / 2, 68, 22, RED_S, "center"); this.bar(c, vw / 2 - w / 2, 74, w, 16, b.shown / b.max, "rgba(31,26,26,0.95)", "rgba(23,20,18,0.2)"); }
    // mensagem
    if (this.msgT > 0) { this.msgT -= dt; const a = clamp(this.msgT / 0.6, 0, 1); c.globalAlpha = a; this.text(c, this.msg, vw / 2, 170, 22, rgba(this.msgCol)); c.globalAlpha = 1; }
    // faixa de história
    if (this.ban) {
      const b = this.ban; b.t += dt; const a = b.t < 0.6 ? b.t / 0.6 : b.t > b.dur + 0.6 ? Math.max(0, 1 - (b.t - b.dur - 0.6)) : 1;
      if (a <= 0 && b.t > 1) this.ban = null; else {
        c.globalAlpha = a; const cy2 = 360 - 40;
        polyFill(c, [[vw * 0.12, cy2 - 70], [vw * 0.88, cy2 - 82], [vw * 0.9, cy2 + 92], [vw * 0.1, cy2 + 102]], "rgba(237,227,204,0.78)");
        line(c, [vw * 0.2, cy2 + 8], [vw * 0.8, cy2 + 2], 3, "rgba(179,33,23,0.6)");
        if (b.sub) this.text(c, b.sub, vw / 2, cy2 - 40, 22, RED_S, "center");
        this.text(c, b.title, vw / 2, cy2 - 2, 54, S_INK, "center", "'Palatino Linotype', Georgia, serif");
        wrapText(c, b.text, vw / 2, cy2 + 38, Math.min(860, vw * 0.7), 24, 19);
        c.globalAlpha = 1;
      }
    }
  },
};
function wrapText(c, s, x, y, maxW, lh, size) {
  c.font = `${size}px Georgia, serif`; c.textAlign = "center"; const words = s.split(" "); let lineS = "", yy = y;
  for (const w of words) { const t = lineS ? lineS + " " + w : w; if (c.measureText(t).width > maxW && lineS) { Hud.text(c, lineS, x, yy, size, S_INK, "center"); lineS = w; yy += lh; } else lineS = t; }
  if (lineS) Hud.text(c, lineS, x, yy, size, S_INK, "center");
}

// ---------------------------------------------------------------- controles de toque
const Touch = {
  on: false, stick: null, btnTouch: {}, pressed: {},
  BTN: [
    { a: "light", i: "katana", p: [-0.13, -0.2], r: 0.105 }, { a: "jump", i: "jump", p: [-0.32, -0.12], r: 0.085 },
    { a: "block", i: "block", p: [-0.06, -0.47], r: 0.075 }, { a: "dodge", i: "dodge", p: [-0.31, -0.37], r: 0.075 },
    { a: "shuriken", i: "shuriken", p: [-0.2, -0.5], r: 0.07 }, { a: "heavy", i: "heavy", p: [-0.46, -0.2], r: 0.06 },
    { a: "dash", i: "dash", p: [-0.45, -0.42], r: 0.055 }, { a: "kunai", i: "kunai", p: [-0.33, -0.6], r: 0.05 },
    { a: "special", i: "spin", p: [-0.07, -0.72], r: 0.05 }, { a: "stealth", i: "stealth", p: [-0.2, -0.75], r: 0.045 },
    { a: "elixir", i: "elixir", p: [-0.45, -0.62], r: 0.045 },
  ],
  pos(b) { return [Game.vw + b.p[0] * 720, 720 + b.p[1] * 720]; },
  toLogical(e) { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * Game.vw, (e.clientY - r.top) / r.height * 720]; },
  down(e) {
    const [x, y] = this.toLogical(e);
    if (Game.state === "level" && dist(x, y, Game.vw - 52, 46) < 34) { Game.togglePause(); return; }
    if (!this.on || Game.paused) return;
    for (let i = 0; i < this.BTN.length; i++) { const b = this.BTN[i], p = this.pos(b); if (dist(x, y, p[0], p[1]) <= b.r * 720 * 1.25) { this.btnTouch[e.pointerId] = i; this.pressed[i] = 1; Input.set(b.a, true); return; } }
    if (x < Game.vw * 0.45 && y > 216 && !this.stick) { this.stick = { id: e.pointerId, cx: x, cy: y, vx: 0, vy: 0 }; this.move(e); }
  },
  move(e) {
    if (!this.stick || e.pointerId !== this.stick.id) return; const [x, y] = this.toLogical(e), R = 720 * 0.13;
    let vx = (x - this.stick.cx) / R, vy = (y - this.stick.cy) / R; const l = Math.hypot(vx, vy); if (l > 1) { vx /= l; vy /= l; }
    this.stick.vx = vx; this.stick.vy = vy; Input.touchAxis = { x: Math.abs(vx) > 0.22 ? clamp(vx * 1.2, -1, 1) : 0, y: Math.abs(vy) > 0.55 ? vy : 0 };
  },
  up(e) {
    if (this.stick && e.pointerId === this.stick.id) { this.stick = null; Input.touchAxis = null; }
    const i = this.btnTouch[e.pointerId]; if (i !== undefined) { delete this.btnTouch[e.pointerId]; delete this.pressed[i]; Input.set(this.BTN[i].a, false); }
  },
  releaseAll() { for (const k in this.btnTouch) Input.set(this.BTN[this.btnTouch[k]].a, false); this.btnTouch = {}; this.pressed = {}; this.stick = null; Input.touchAxis = null; },
  draw(c) {
    if (!this.on) return;
    const R = 720 * 0.13, base = this.stick ? [this.stick.cx, this.stick.cy] : [720 * 0.24, 720 - 720 * 0.24];
    circ(c, base[0], base[1], R, "rgba(237,227,204,0.45)"); c.strokeStyle = "rgba(23,20,18,0.75)"; c.lineWidth = 3; c.beginPath(); c.arc(base[0], base[1], R, 0, TAU); c.stroke();
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2, tip = [base[0] + Math.cos(a) * R * 0.8, base[1] + Math.sin(a) * R * 0.8], bk = [base[0] + Math.cos(a) * R * 0.62, base[1] + Math.sin(a) * R * 0.62], s = [-Math.sin(a) * R * 0.1, Math.cos(a) * R * 0.1]; polyFill(c, [tip, [bk[0] + s[0], bk[1] + s[1]], [bk[0] - s[0], bk[1] - s[1]]], "rgba(23,20,18,0.4)"); }
    const sv = this.stick ? [this.stick.vx, this.stick.vy] : [0, 0]; circ(c, base[0] + sv[0] * R * 0.6, base[1] + sv[1] * R * 0.6, R * 0.38, "rgba(23,20,18,0.55)");
    for (let i = 0; i < this.BTN.length; i++) {
      const b = this.BTN[i], p = this.pos(b), r = b.r * 720; circ(c, p[0], p[1], r, this.pressed[i] ? "rgba(179,33,23,0.55)" : "rgba(237,227,204,0.45)");
      c.strokeStyle = "rgba(23,20,18,0.75)"; c.lineWidth = 3; c.beginPath(); c.arc(p[0], p[1], r, 0, TAU); c.stroke(); touchIcon(c, b.i, p[0], p[1], r * 0.55);
    }
  },
};
function touchIcon(c, k, x, y, s) {
  const col = "rgba(23,20,18,0.75)";
  switch (k) {
    case "katana": line(c, [x - s, y + s], [x + s * 0.9, y - s * 0.9], s * 0.16, col); line(c, [x - s * 0.75, y + s * 0.35], [x - s * 0.35, y + s * 0.75], s * 0.2, col); break;
    case "heavy": line(c, [x - s, y + s], [x + s, y - s], s * 0.28, col); break;
    case "jump": polyFill(c, [[x, y - s], [x + s * 0.8, y], [x - s * 0.8, y]], col); line(c, [x, y], [x, y + s], s * 0.3, col); break;
    case "block": c.strokeStyle = col; c.lineWidth = s * 0.22; c.beginPath(); c.arc(x, y, s * 0.8, -Math.PI * 0.9, -Math.PI * 0.1); c.stroke(); line(c, [x, y - s * 0.8], [x, y + s * 0.8], s * 0.15, col); break;
    case "dodge": c.strokeStyle = col; c.lineWidth = s * 0.2; c.beginPath(); c.arc(x, y, s * 0.7, Math.PI * 0.2, Math.PI * 1.6); c.stroke(); break;
    case "shuriken": case "spin": for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.3; polyFill(c, [[x + Math.cos(a + 0.6) * s * 0.3, y + Math.sin(a + 0.6) * s * 0.3], [x + Math.cos(a) * s, y + Math.sin(a) * s], [x + Math.cos(a - 0.6) * s * 0.3, y + Math.sin(a - 0.6) * s * 0.3]], col); } if (k === "spin") { c.lineWidth = 2; c.beginPath(); c.arc(x, y, s * 1.1, 0, Math.PI * 1.5); c.stroke(); } break;
    case "dash": for (let k2 = 0; k2 < 3; k2++) line(c, [x - s, y - s * 0.5 + k2 * s * 0.5], [x + s * 0.4, y - s * 0.5 + k2 * s * 0.5], s * 0.14, col); polyFill(c, [[x + s, y], [x + s * 0.4, y - s * 0.5], [x + s * 0.4, y + s * 0.5]], col); break;
    case "kunai": polyFill(c, [[x + s, y - s], [x - s * 0.1, y - s * 0.3], [x + s * 0.3, y + s * 0.1]], col); line(c, [x, y], [x - s * 0.8, y + s * 0.8], s * 0.2, col); break;
    case "stealth": circ(c, x, y, s * 0.6, col); line(c, [x - s * 0.4, y], [x + s * 0.5, y], s * 0.2, "rgb(237,227,204)"); break;
    case "elixir": circ(c, x, y + s * 0.2, s * 0.6, "rgba(38,115,64,0.9)"); c.fillStyle = col; c.fillRect(x - s * 0.18, y - s, s * 0.36, s * 0.6); break;
  }
}
canvas.addEventListener("pointerdown", (e) => { Audio2.unlock(); if (e.pointerType !== "mouse" || Game.state === "level") { Touch.down(e); } });
canvas.addEventListener("pointermove", (e) => Touch.move(e));
canvas.addEventListener("pointerup", (e) => Touch.up(e));
canvas.addEventListener("pointercancel", (e) => Touch.up(e));
canvas.addEventListener("mousedown", (e) => { if (Game.state === "level" && !Touch.on && !Game.paused) { Input.set(e.button === 2 ? "heavy" : "light", true); } });
canvas.addEventListener("mouseup", (e) => { Input.set(e.button === 2 ? "heavy" : "light", false); });
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

// ---------------------------------------------------------------- menu (cena de fundo)
const Menu = {
  layers: null, fig: null, weather: null, t: 0, show: 0, i: 0,
  SHOW: ["idle", "attack_light", "attack_light2", "attack_combo", "idle", "block", "counter_attack", "idle", "shuriken_throw", "attack_heavy", "idle", "victory"],
  enter(panel) {
    if (!this.layers) this.layers = buildBackground("menu");
    this.fig = new Figure(Prog.d.outfit); this.fig.onFinish = () => { if (this.fig.cur !== "victory") this.fig.play("idle", true); this.show = 0; };
    this.weather = new Weather("petals"); Audio2.playMusic("menu"); Audio2.playAmbient("wind"); UI.mainMenu(panel);
  },
  update(dt) {
    this.t += dt; this.show += dt; this.weather.update(dt, Game.vw, 720);
    if (this.fig.cur === "idle" && this.show > 2.6) { this.show = 0; this.i = (this.i + 1) % this.SHOW.length; const a = this.SHOW[this.i]; this.fig.play(a, true); if (a.startsWith("attack") || a === "counter_attack") Audio2.play("slash", 0.1, -14); }
    this.fig.update(dt);
  },
  draw(c) {
    const vw = Game.vw; c.drawImage(Game.paper("menu"), 0, 0);
    for (const l of this.layers) l.draw(c, 0, -90, vw, 720, this.t * 40);
    c.save(); c.translate(vw * 0.24, 720 * 0.93); c.scale(3.2, 3.2); this.fig.draw(c, 0, 0); c.restore();
    this.weather.draw(c, vw, 720);
    c.font = "96px 'Noto Serif JP', 'Yu Mincho', serif"; c.fillStyle = "rgba(23,20,18,0.85)"; c.textAlign = "left"; c.fillText("忍", 36, 120); c.fillText("者", 36, 220);
  },
};

// ---------------------------------------------------------------- laço principal
let last = performance.now(), acc = 0;
function frame(now) {
  let real = clamp((now - last) / 1000, 0, 0.1); last = now; // o rAF pode chegar com carimbo anterior ao último
  Input.pollGamepad();
  if (Input.justPressed("pause")) { delete Input.pressed.pause; if (Game.state === "level") Game.togglePause(); }
  if (Game.hitT > 0) { Game.hitT -= real; if (Game.hitT <= 0) Game.timeScale = 1; }
  if (Game.shakeT > 0) Game.shakeT -= real;
  ctx.setTransform(Game.S, 0, 0, Game.S, 0, 0);
  if (Game.state === "level" && Game.level) {
    const L = Game.level;
    if (!Game.paused) { acc += real * Game.timeScale; let steps = 0; while (acc >= 1 / 60 && steps < 4) { L.update(1 / 60); Input.endFrame(); acc -= 1 / 60; steps++; } if (steps === 0) {} }
    else Input.endFrame();
    L.draw(ctx); Hud.draw(ctx, real); Touch.draw(ctx);
  } else { Menu.update(real); Menu.draw(ctx); Input.endFrame(); }
  requestAnimationFrame(frame);
}
