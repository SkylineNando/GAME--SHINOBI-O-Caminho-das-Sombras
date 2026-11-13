// ============================================================================
// Rig de tinta (sumi-e): poses-chave interpoladas + desenho com pinceladas.
// Mesmo algoritmo de SCRIPTS/combat/ink_figure.gd e tools/ink_rig.py.
// ============================================================================
const RIG_DEF = { hx: 0, hy: -34, t: 6, h: 0, a1: 30, a2: 70, b1: -12, b2: 35, l1: 16, l2: -16, k1: -14, k2: 6, w: 50, w2: 0, rot: 0, bd: 0, ch: 0, cha: 0, al: 1 };
const RIG_DISC = ["air", "tr", "ws", "flip", "aim"];
const dd = (deg) => [Math.sin(deg * DEG), Math.cos(deg * DEG)];
const du = (deg) => [Math.sin(deg * DEG), -Math.cos(deg * DEG)];
const vadd = (a, b) => [a[0] + b[0], a[1] + b[1]];
const vsub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const vmul = (a, s) => [a[0] * s, a[1] * s];
const vlerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const vlen = (a) => Math.hypot(a[0], a[1]);
const vnorm = (a) => { const l = vlen(a); return l > 1e-6 ? [a[0] / l, a[1] / l] : [0, 0]; };
const vperp = (a) => [-a[1], a[0]];
const vrot = (a, deg) => { const r = deg * DEG, c = Math.cos(r), s = Math.sin(r); return [a[0] * c - a[1] * s, a[0] * s + a[1] * c]; };

function rigSample(anim, time, out) {
  const fr = anim.frames, n = fr.length, fps = anim.fps;
  let f = Math.max(0, time * fps) || 0, i, j;
  if (anim.loop) { f = f % n; i = Math.floor(f) % n; j = (i + 1) % n; }
  else { f = Math.min(f, n - 1); i = Math.floor(f); j = Math.min(i + 1, n - 1); }
  let u = f - i; u = u * u * (3 - 2 * u);
  const base = anim.base || {}, fa = fr[i], fb = fr[j];
  for (const k in RIG_DEF) {
    const va = k in fa ? fa[k] : k in base ? base[k] : RIG_DEF[k];
    const vb = k in fb ? fb[k] : k in base ? base[k] : RIG_DEF[k];
    out[k] = va + (vb - va) * u;
  }
  for (const k of RIG_DISC) out[k] = k in fa ? fa[k] : base[k] || 0;
  out._i = i;
  out._ev = fa.ev || "";
  return out;
}

function rigCompute(p, aim) {
  const g = {};
  const t = p.t; let a1 = p.a1, b1 = p.b1;
  if (p.aim) { a1 += aim; b1 += aim; }
  const hip = [p.hx, p.hy], up = du(t), fwd = du(t + 90);
  g.hip = hip; g.neck = vadd(hip, vmul(up, 22)); g.shoulder = vadd(hip, vmul(up, 18));
  g.head = vadd(g.neck, vmul(du(t + p.h), 7.5)); g.head_up = du(t + p.h); g.head_fwd = du(t + p.h + 90);
  g.up = up; g.fwd = fwd;
  g.sh_f = vadd(g.shoulder, vmul(fwd, 1.5)); g.sh_b = vadd(g.shoulder, vmul(fwd, -2.5));
  g.elbow_f = vadd(g.sh_f, vmul(dd(a1), 12)); g.hand_f = vadd(g.elbow_f, vmul(dd(a1 + p.a2), 12));
  g.elbow_b = vadd(g.sh_b, vmul(dd(b1), 12)); g.hand_b = vadd(g.elbow_b, vmul(dd(b1 + p.b2), 12));
  g.dir_f = dd(a1 + p.a2 + p.w); g.dir_b = dd(b1 + p.b2 + p.w2); g.farm_f = dd(a1 + p.a2); g.farm_b = dd(b1 + p.b2);
  g.hip_f = vadd(hip, vmul(fwd, 2)); g.hip_b = vadd(hip, vmul(fwd, -2));
  g.knee_f = vadd(g.hip_f, vmul(dd(p.l1), 17)); g.foot_f = vadd(g.knee_f, vmul(dd(p.l1 + p.l2), 17));
  g.knee_b = vadd(g.hip_b, vmul(dd(p.k1), 17)); g.foot_b = vadd(g.knee_b, vmul(dd(p.k1 + p.k2), 17));
  g.toe_f = dd(p.l1 + p.l2 + 90); g.toe_b = dd(p.k1 + p.k2 + 90); g.chain_dir = dd(p.cha);
  const pts = ["hip", "neck", "shoulder", "head", "sh_f", "sh_b", "elbow_f", "hand_f", "elbow_b", "hand_b", "hip_f", "hip_b", "knee_f", "foot_f", "knee_b", "foot_b"];
  if (Math.abs(p.rot) > 0.01) {
    for (const k of pts) g[k] = vadd(vrot(vsub(g[k], hip), p.rot), hip);
    for (const k of ["head_up", "head_fwd", "up", "fwd", "dir_f", "dir_b", "farm_f", "farm_b", "toe_f", "toe_b", "chain_dir"]) g[k] = vrot(g[k], p.rot);
  }
  if (!p.air) {
    const low = Math.max(g.foot_f[1], g.foot_b[1], g.knee_f[1], g.knee_b[1], g.hand_f[1], g.hand_b[1], g.hip[1] + 5, g.head[1] + 7);
    const dy = -low - 2;
    for (const k of pts) g[k] = [g[k][0], g[k][1] + dy];
  }
  return g;
}

const STEEL = [46, 46, 46], STEEL_HI = [189, 184, 171], WOOD = [58, 46, 34];

class InkPen {
  constructor(ctx) { this.c = ctx; this.al = 1; this.flash = 0; this.flashCol = [217, 31, 20]; }
  col(c, a = 1) { const cc = this.flash > 0 ? mixc(c, this.flashCol, this.flash * 0.85) : c; return rgba(cc, a * this.al); }
  circle(p, r, c, a = 1) { const x = this.c; x.fillStyle = this.col(c, a); x.beginPath(); x.arc(p[0], p[1], r, 0, TAU); x.fill(); }
  poly(pts, c, a = 1) { const x = this.c; x.fillStyle = this.col(c, a); x.beginPath(); x.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) x.lineTo(pts[i][0], pts[i][1]); x.closePath(); x.fill(); }
  _q(a, b, w1, w2, style) {
    const x = this.c, d = vsub(b, a), L = vlen(d);
    x.fillStyle = style; x.beginPath();
    if (L < 0.3) { x.arc(a[0], a[1], Math.max(w1, w2) * 0.5, 0, TAU); x.fill(); return; }
    const n = vmul(vperp([d[0] / L, d[1] / L]), 0.5);
    x.moveTo(a[0] + n[0] * w1, a[1] + n[1] * w1); x.lineTo(b[0] + n[0] * w2, b[1] + n[1] * w2);
    x.lineTo(b[0] - n[0] * w2, b[1] - n[1] * w2); x.lineTo(a[0] - n[0] * w1, a[1] - n[1] * w1); x.closePath();
    x.moveTo(a[0] + w1 * 0.5, a[1]); x.arc(a[0], a[1], w1 * 0.5, 0, TAU);
    x.moveTo(b[0] + w2 * 0.5, b[1]); x.arc(b[0], b[1], w2 * 0.5, 0, TAU);
    x.fill("nonzero");
  }
  stroke(a, b, w1, w2, c, bleed = true, alpha = 1) {
    if (bleed) this._q(a, b, w1 + 2, w2 + 2, this.col(c, 0.28 * alpha));
    this._q(a, b, w1, w2, this.col(c, alpha));
  }
  path(pts, w1, w2, c, bleed = false, alpha = 1) {
    const n = pts.length;
    for (let i = 0; i < n - 1; i++) this.stroke(pts[i], pts[i + 1], lerp(w1, w2, i / Math.max(1, n - 1)), lerp(w1, w2, (i + 1) / Math.max(1, n - 1)), c, bleed, alpha);
  }
}

function weaponLength(w) { return { odachi: 58, dragon_blade: 54, yari: 62, naginata: 62, staff: 34, kusarigama: 18, kama: 18, bow: 20 }[w] || 45; }

function drawRig(pen, p, g, sk, clock, speed) {
  const fwd = g.fwd, up = g.up, down = vmul(up, -1);
  const body = sk._body, back = sk._back, acc = sk._acc, trim = sk._trim, hip = g.hip, spd = clamp(speed, 0, 1);
  const wave = Math.sin(clock * 9);
  if (sk.cape) { const sh = g.shoulder, fl = vmul(fwd, -4 - 6 * spd + wave * 2); pen.poly([vadd(sh, vmul(fwd, 2)), vadd(sh, vmul(fwd, -5)), vadd(vadd(vadd(hip, vmul(fwd, -14)), vmul(down, 22)), fl), vadd(vadd(hip, vmul(fwd, -3)), vmul(down, 24))], hex(sk.cape)); }
  if (sk.scarf) {
    const pts = [vadd(g.neck, vmul(fwd, -2))], droop = (65 - 50 * spd) * DEG;
    for (let i = 1; i < 7; i++) { const pr = pts[i - 1]; const wv = Math.sin(clock * 10 - i * 0.9) * (0.6 + 1.6 * spd) * i * 0.35; pts.push([pr[0] - Math.cos(droop) * 6.5, pr[1] + Math.sin(droop) * 6.5 + wv]); }
    pen.path(pts, 5, 1.6, hex(sk.scarf), true);
  }
  if (sk.sheath) {
    const s0 = vadd(vadd(hip, vmul(fwd, -9)), vmul(up, -2)), s1 = vadd(vadd(g.shoulder, vmul(fwd, -3)), vmul(up, 9));
    pen.stroke(s0, s1, 3.6, 3.2, trim);
    if (p.ws) { pen.stroke(s1, vadd(s1, vmul(vnorm(vsub(s1, s0)), 9)), 3, 3, [26, 26, 26]); pen.circle(s1, 2.4, acc); }
  }
  pen.stroke(g.sh_b, g.elbow_b, 7, 6, back); pen.stroke(g.elbow_b, g.hand_b, 6, 4.5, back); pen.circle(g.hand_b, 3, back);
  drawBackWeapon(pen, g, p, sk);
  pen.stroke(g.hip_b, g.knee_b, 10, 8, back); pen.stroke(g.knee_b, g.foot_b, 7, 5.5, back); pen.stroke(g.foot_b, vadd(g.foot_b, vmul(g.toe_b, 6)), 4, 3, back);
  const armor = sk.armor || "none";
  pen.stroke(hip, g.neck, 13, 10.5, body);
  if (armor === "heavy") {
    pen.stroke(vadd(hip, vmul(up, 3)), g.shoulder, 16, 14, trim, false);
    for (const k of [6, 10, 14]) pen.stroke(vadd(vadd(hip, vmul(up, k)), vmul(fwd, -7)), vadd(vadd(hip, vmul(up, k)), vmul(fwd, 7)), 1.3, 1.3, acc, false);
    pen.stroke(g.sh_b, vadd(vadd(g.sh_b, vmul(down, 9)), vmul(fwd, -4)), 8, 9, trim, false);
  } else if (armor === "light") {
    pen.stroke(vadd(hip, vmul(up, 4)), g.shoulder, 14, 12, [85, 82, 77], false);
    for (const k of [8, 12]) pen.stroke(vadd(vadd(hip, vmul(up, k)), vmul(fwd, -6)), vadd(vadd(hip, vmul(up, k)), vmul(fwd, 6)), 1.2, 1.2, trim, false);
  }
  pen.stroke(vadd(hip, vmul(fwd, -7)), vadd(hip, vmul(fwd, 7)), 5, 5, acc, false);
  const t0 = vadd(hip, vmul(fwd, -6)), tw = Math.sin(clock * 8) * (1 + 3 * spd);
  pen.path([t0, vadd(vadd(t0, vmul(fwd, -6 - 5 * spd)), vmul(down, 5 + tw)), vadd(vadd(t0, vmul(fwd, -11 - 9 * spd)), vmul(down, 9 - 2 * spd + tw))], 3.2, 1.2, acc);
  if (sk.tanto) pen.stroke(vadd(vadd(hip, vmul(fwd, 3)), vmul(up, -1)), vadd(vadd(hip, vmul(fwd, 11)), vmul(up, 3)), 2.4, 2, trim, false);
  pen.stroke(g.hip_f, g.knee_f, 10, 8, body); pen.stroke(g.knee_f, g.foot_f, 7, 5.5, body); pen.stroke(g.foot_f, vadd(g.foot_f, vmul(g.toe_f, 6)), 4, 3, body);
  if (sk.pouch) { const pp = vlerp(g.hip_f, g.knee_f, 0.35); pen.stroke(vadd(pp, vmul(fwd, 3)), vadd(pp, vmul(fwd, 6)), 5, 5, trim, false); }
  if (armor === "heavy") for (const k of [-6, 0, 6]) { const a = vadd(hip, vmul(fwd, k)), e = vadd(vadd(a, vmul(down, 12)), vmul(fwd, k * 0.4)); pen.stroke(a, e, 6, 5, trim, false); pen.stroke(vadd(a, vmul(down, 7)), vadd(e, vmul(down, -1)), 1, 1, acc, false); }
  if (armor === "robe") {
    const kn = vlerp(g.knee_f, g.knee_b, 0.5);
    pen.poly([vadd(hip, vmul(fwd, -8)), vadd(hip, vmul(fwd, 8)), vadd(vadd(kn, vmul(fwd, 12)), vmul(down, 6)), vadd(vadd(kn, vmul(fwd, -13)), vmul(down, 6))], trim);
    pen.stroke(vadd(hip, vmul(fwd, -7)), vadd(hip, vmul(fwd, 7)), 5, 5, acc, false);
  }
  drawHead(pen, g, sk, clock, spd);
  pen.stroke(g.sh_f, g.elbow_f, 7, 6, body); pen.stroke(g.elbow_f, g.hand_f, 6, 4.5, body);
  if (armor === "heavy") { pen.stroke(g.sh_f, vadd(vadd(g.sh_f, vmul(down, 9)), vmul(fwd, 3)), 8, 9, trim, false); }
  drawFrontWeapon(pen, g, p, sk);
  pen.circle(g.hand_f, 3.2, body);
}

function rigBlade(pen, base, d, len, edge) {
  const tip = vadd(base, vmul(d, len)), n = vperp(d), mid = vadd(vlerp(base, tip, 0.5), vmul(n, -1.6));
  pen.path([base, mid, tip], 2.6, 1, STEEL, true);
  pen.path([vadd(base, vmul(n, 0.6)), vadd(mid, vmul(n, 0.6)), tip], 0.8, 0.4, edge || STEEL_HI);
}
function rigKatana(pen, h, d, len, edge) {
  pen.stroke(vsub(h, vmul(d, 7)), vadd(h, vmul(d, 3)), 3.2, 3, [29, 29, 29], false);
  pen.circle(vadd(h, vmul(d, 3)), 2.4, [90, 74, 42]);
  rigBlade(pen, vadd(h, vmul(d, 3)), d, len, edge);
}
function drawFrontWeapon(pen, g, p, sk) {
  const w = sk.weapon || "katana", h = g.hand_f, d = g.dir_f;
  if (p.ws && w === "katana") return;
  switch (w) {
    case "katana": case "dual": rigKatana(pen, h, d, 42); break;
    case "odachi": rigKatana(pen, h, d, 58); break;
    case "dragon_blade": rigKatana(pen, h, d, 54, [210, 35, 26]); pen.stroke(vadd(h, vmul(d, 6)), vsub(vadd(h, vmul(d, 50)), vperp(d)), 1.4, 0.6, [210, 35, 26], false); break;
    case "yari": pen.stroke(vsub(h, vmul(d, 30)), vadd(h, vmul(d, 48)), 2.6, 2.4, WOOD, false); pen.stroke(vadd(h, vmul(d, 48)), vadd(h, vmul(d, 62)), 4, 0.6, STEEL, false); break;
    case "naginata": { pen.stroke(vsub(h, vmul(d, 26)), vadd(h, vmul(d, 40)), 2.8, 2.6, WOOD, false); const n = vperp(d); pen.path([vadd(h, vmul(d, 40)), vsub(vadd(h, vmul(d, 52)), vmul(n, 2)), vsub(vadd(h, vmul(d, 62)), vmul(n, 6))], 4.4, 1, STEEL, true); break; }
    case "staff": pen.stroke(vsub(h, vmul(d, 34)), vadd(h, vmul(d, 34)), 3, 3, [74, 58, 40], false); pen.circle(vsub(h, vmul(d, 34)), 2.2, [138, 122, 80]); pen.circle(vadd(h, vmul(d, 34)), 2.2, [138, 122, 80]); break;
    case "kusarigama": case "kama": { pen.stroke(vsub(h, vmul(d, 4)), vadd(h, vmul(d, 12)), 2.8, 2.6, WOOD, false); const n = vperp(d), tip = vadd(h, vmul(d, 12)); pen.path([tip, vadd(vadd(tip, vmul(n, 6)), vmul(d, 1)), vadd(vadd(tip, vmul(n, 12)), vmul(d, -3))], 3.4, 0.8, STEEL, true); break; }
    case "bow": {
      const fd = g.farm_f, n = vperp(fd), pts = [];
      for (let i = 0; i < 9; i++) { const s = -1 + i * 0.25; pts.push(vadd(vadd(h, vmul(n, s * 24)), vmul(fd, -s * s * 8))); }
      pen.path(pts, 2.4, 2.4, [42, 32, 24], false);
      const nock = vlerp(vadd(h, vmul(fd, -8)), g.hand_b, clamp(p.bd, 0, 1));
      pen.stroke(pts[0], nock, 0.8, 0.8, [107, 98, 85], false); pen.stroke(nock, pts[8], 0.8, 0.8, [107, 98, 85], false);
      if (p.bd > 0.25) { pen.stroke(nock, vadd(nock, vmul(fd, 36)), 1.4, 1.2, WOOD, false); pen.stroke(vadd(nock, vmul(fd, 34)), vadd(nock, vmul(fd, 40)), 2.4, 0.4, STEEL, false); }
      break;
    }
    case "shield": { const fd = g.farm_f, n = vperp(fd), c = vadd(h, vmul(fd, 2)); pen.poly([vadd(vadd(c, vmul(n, 15)), vmul(fd, 5)), vadd(vadd(c, vmul(n, 15)), vmul(fd, -5)), vadd(vadd(c, vmul(n, -15)), vmul(fd, -5)), vadd(vadd(c, vmul(n, -15)), vmul(fd, 5))], [61, 48, 36]); pen.circle(c, 4, sk._acc); break; }
  }
}
function drawBackWeapon(pen, g, p, sk) {
  const w = sk.weapon || "katana", h = g.hand_b, d = g.dir_b;
  if (w === "dual") rigKatana(pen, h, d, 30);
  else if (w === "shield") rigKatana(pen, h, d, 40);
  else if (w === "kama") { pen.stroke(vsub(h, vmul(d, 4)), vadd(h, vmul(d, 12)), 2.6, 2.4, WOOD, false); const tip = vadd(h, vmul(d, 12)), n = vperp(d); pen.path([tip, vadd(tip, vmul(n, 6)), vadd(vadd(tip, vmul(n, 11)), vmul(d, -3))], 3, 0.8, STEEL, true); }
  else if (w === "kusarigama") {
    if (p.ch > 1) { const e = vadd(h, vmul(g.chain_dir, p.ch)), steps = Math.max(3, Math.floor(p.ch / 6)); for (let i = 0; i <= steps; i++) pen.circle(vlerp(h, e, i / steps), 1.2, [74, 74, 74]); pen.circle(e, 3.6, [26, 26, 26]); }
    else { const pts = [h, vadd(h, [2, 8]), vadd(h, [-2, 15]), vadd(h, [-6, 12])]; pen.path(pts, 1.4, 1.4, [74, 74, 74]); pen.circle(pts[3], 3, [26, 26, 26]); }
  }
}
function drawHead(pen, g, sk, clock, spd) {
  const c = g.head, u = g.head_up, f = g.head_fwd, body = sk._body, eye = hex(sk.eye || "#e9e2cf"), acc = sk._acc, trim = sk._trim;
  const P = (a, b) => vadd(vadd(c, vmul(f, a)), vmul(u, b));
  if (sk.outline) pen.circle(c, 8.2, hex(sk.outline));
  switch (sk.head || "ninja") {
    case "ninja": {
      pen.circle(c, 7.2, body); pen.stroke(P(1.5, 0.8), P(6.6, 0.8), 2.2, 1.6, eye, false);
      const wv = Math.sin(clock * 11) * (1 + 2.5 * spd), k0 = P(-6, 2);
      pen.path([k0, vadd(vadd(k0, vmul(f, -6)), vmul(u, 1 + wv * 0.5)), vadd(vadd(k0, vmul(f, -12 - 4 * spd)), vmul(u, -1 + wv))], 2.4, 0.8, hex(sk.scarf || sk.body));
      break;
    }
    case "hood": pen.circle(c, 7.4, body); pen.stroke(c, P(-6, -4), 9, 6, body, false); pen.stroke(P(2, 0.8), P(6.6, 0.8), 2, 1.4, eye, false); break;
    case "jingasa": pen.circle(c, 6.6, body); pen.circle(P(4, 0), 1.1, eye); pen.poly([P(0, 10), P(13, 2), P(-13, 2)], [42, 40, 38]); pen.stroke(P(-12, 2.4), P(12, 2.4), 1.2, 1.2, acc, false); break;
    case "kabuto": case "dragon":
      pen.circle(c, 7, body); pen.circle(P(0, 1.6), 7.4, trim); pen.poly([P(-4, 4), P(-12, -4), P(-9, -7), P(-2, -1)], trim);
      pen.stroke(P(4, -2.5), P(7, -2.5), 4, 3, [42, 13, 10], false); pen.circle(P(4.5, 0.6), 1.3, eye);
      if (sk.head === "kabuto") { const b = P(0, 7); pen.stroke(b, vadd(vadd(b, vmul(u, 9)), vmul(f, 6)), 2, 0.8, acc, false); pen.stroke(b, vadd(vadd(b, vmul(u, 9)), vmul(f, -4)), 2, 0.8, acc, false); }
      else { for (const s of [1, -1]) { const b0 = P(2 * s, 6); pen.path([b0, vadd(vadd(b0, vmul(u, 7)), vmul(f, -3)), vadd(vadd(b0, vmul(u, 12)), vmul(f, -11)), vadd(vadd(b0, vmul(u, 11)), vmul(f, -17))], 3.4, 0.8, acc, true); } pen.circle(P(4.5, 0.6), 2.4, eye, 0.45 + 0.25 * Math.sin(clock * 6)); }
      break;
    case "sandogasa":
      pen.circle(c, 7, body); pen.circle(P(4, -1), 1.2, eye); pen.poly([P(0, 9), P(17, 1), P(-17, 1)], [91, 83, 69]);
      for (const k of [-9, -3, 3, 9]) pen.stroke(P(0, 8), P(k * 1.7, 1.5), 0.7, 0.7, [58, 52, 42], false);
      break;
    case "bald":
      pen.circle(c, 7.8, [26, 26, 26]); pen.circle(c, 6.8, hex(sk.skin || "#d9ccb2")); pen.stroke(P(3, 0.5), P(6, 0.5), 1.2, 1, [26, 26, 26], false);
      if (sk.eye === "#8ff") pen.circle(P(4.5, 0.5), 1.6, eye);
      for (let i = 0; i < 6; i++) pen.circle(vsub(vadd(g.neck, vmul(f, -4 + i * 1.8)), vmul(u, 1 + Math.abs(i - 2.5) * 0.5)), 1.4, acc);
      break;
  }
}

// ---------------------------------------------------------------- Figura animada
class Figure {
  constructor(skinId) { this.pose = {}; this.g = null; this.time = 0; this.speed = 1; this.clock = 0; this.trail = []; this.facing = 1;
    this.moveSpeed = 0; this.aim = 0; this.flash = 0; this.alpha = 1; this.shadow = true; this.onEvent = null; this.onFinish = null; this.setSkin(skinId); this.play("idle", true); }
  setSkin(id) {
    this.skinId = id; const sk = Object.assign({}, DATA.skins[id] || DATA.skins.kage); this.skin = sk;
    sk._body = hex(sk.body || "#141414"); sk._back = hex(sk.back || "#3a3836"); sk._acc = hex(sk.accent || "#b3221b"); sk._trim = hex(sk.trim || "#222222");
    this.trailCol = hex(sk.trail || "#111111"); this.scale = (sk.scale || 1) * 1.15;
  }
  play(name, restart = false) {
    if (name === this.cur && !restart) return;
    const a = DATA.animations[name]; if (!a) return;
    this.anim = a; this.cur = name; this.time = 0; this.finished = false; this.lastIdx = -1;
  }
  update(dt) {
    if (!(dt > 0)) dt = 0;
    this.clock += dt; this.time += dt * this.speed; this.flash = Math.max(0, this.flash - dt * 4);
    const a = this.anim, n = a.frames.length;
    if (!a.loop && this.time * a.fps >= n - 1 + 0.6 && !this.finished) { this.finished = true; if (this.onFinish) this.onFinish(this.cur); }
    rigSample(a, this.time, this.pose);
    if (this.pose._i !== this.lastIdx) { this.lastIdx = this.pose._i; if (this.pose._ev && this.onEvent) this.onEvent(this.pose._ev); }
    this.g = rigCompute(this.pose, this.aim);
    for (const t of this.trail) t.life -= dt * 5;
    this.trail = this.trail.filter((t) => t.life > 0);
    if (this.pose.tr) { const tip = this.weaponTip(); if (this.pose.flip) tip[0] = -tip[0]; this.trail.push({ p: tip, life: 1 }); if (this.trail.length > 9) this.trail.shift(); }
  }
  weaponTip() { return this.g ? vadd(this.g.hand_f, vmul(this.g.dir_f, weaponLength(this.skin.weapon))) : [30, -40]; }
  toWorld(lp, x, y) { return [x + lp[0] * this.scale * this.facing, y + lp[1] * this.scale]; }
  hand(x, y, front = true) { return this.g ? this.toWorld(front ? this.g.hand_f : this.g.hand_b, x, y) : [x + 20 * this.facing, y - 50]; }
  headPos(x, y) { return this.g ? this.toWorld(this.g.head, x, y) : [x, y - 70]; }
  draw(ctx, x, y, shadowY) {
    if (!this.g) return;
    const al = clamp(this.pose.al, 0, 1) * this.alpha; if (al <= 0.01) return;
    ctx.save(); ctx.translate(x, y);
    if (this.shadow) { ctx.save(); ctx.scale(1, 0.22); ctx.fillStyle = `rgba(13,10,8,${0.16 * al})`; ctx.beginPath(); ctx.arc(0, (shadowY || 0) / 0.22, 20 * this.scale, 0, TAU); ctx.fill(); ctx.restore(); }
    ctx.scale(this.scale * this.facing, this.scale);
    const pen = new InkPen(ctx); pen.al = al; pen.flash = this.flash;
    if (this.trail.length > 1) for (let i = 0; i < this.trail.length - 1; i++) { const w = 2 + 7 * (i + 1) / this.trail.length; pen._q(this.trail[i].p, this.trail[i + 1].p, w * 0.6, w, rgba(this.trailCol, 0.55 * this.trail[i + 1].life * al)); }
    if (this.pose.flip) ctx.scale(-1, 1);
    drawRig(pen, this.pose, this.g, this.skin, this.clock, this.moveSpeed);
    ctx.restore();
  }
}
