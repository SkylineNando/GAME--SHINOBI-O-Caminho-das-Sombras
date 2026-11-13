// ============================================================================
// Mundo: colisão, fundo (papel + parallax), terreno, cenário, clima, efeitos,
// projéteis, perigos, coletáveis e objetos de fase.
// ============================================================================

// ---------------------------------------------------------------- desenho simples
function brush(ctx, a, b, w1, w2, style) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
  ctx.fillStyle = style; ctx.beginPath();
  if (L < 0.5) { ctx.arc(a[0], a[1], Math.max(w1, w2) / 2, 0, TAU); ctx.fill(); return; }
  const nx = -dy / L * 0.5, ny = dx / L * 0.5;
  ctx.moveTo(a[0] + nx * w1, a[1] + ny * w1); ctx.lineTo(b[0] + nx * w2, b[1] + ny * w2);
  ctx.lineTo(b[0] - nx * w2, b[1] - ny * w2); ctx.lineTo(a[0] - nx * w1, a[1] - ny * w1); ctx.closePath();
  ctx.moveTo(a[0] + w1 / 2, a[1]); ctx.arc(a[0], a[1], w1 / 2, 0, TAU);
  ctx.moveTo(b[0] + w2 / 2, b[1]); ctx.arc(b[0], b[1], w2 / 2, 0, TAU);
  ctx.fill();
}
function polyFill(ctx, pts, style) { ctx.fillStyle = style; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); ctx.fill(); }
function circ(ctx, x, y, r, style) { ctx.fillStyle = style; ctx.beginPath(); ctx.arc(x, y, Math.max(0.1, r), 0, TAU); ctx.fill(); }
function line(ctx, a, b, w, style) { ctx.strokeStyle = style; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
const S_INK = "rgba(23,20,18,1)";

// ---------------------------------------------------------------- colisão
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
function bodyRect(b) { return { x: b.x - b.w / 2, y: b.y - b.h, w: b.w, h: b.h }; }

function moveBody(b, dt, L) {
  const wasFloor = b.onFloor;
  b.onFloor = false; b.onWall = 0; b.floorOneway = false;
  b.x += b.vx * dt;
  let r = bodyRect(b);
  for (const s of L.solids) if (overlap(r, s)) {
    if (b.vx > 0 || (b.vx === 0 && r.x + r.w / 2 < s.x + s.w / 2)) { b.x = s.x - b.w / 2; b.onWall = 1; }
    else { b.x = s.x + s.w + b.w / 2; b.onWall = -1; }
    b.vx = 0; r = bodyRect(b);
  }
  const prevBottom = b.y;
  b.y += b.vy * dt;
  r = bodyRect(b);
  for (const s of L.solids) if (overlap(r, s)) {
    if (b.y - b.h / 2 < s.y + s.h / 2 && b.vy >= 0) { b.y = s.y; b.onFloor = true; }
    else { b.y = s.y + s.h + b.h; }
    b.vy = 0; r = bodyRect(b);
  }
  if (b.vy >= 0 && !(b.dropTimer > 0) && !b.noOneway) {
    for (const p of L.oneways) {
      if (r.x + r.w > p.x && r.x < p.x + p.w && prevBottom <= p.y + 1 && b.y >= p.y) { b.y = p.y; b.vy = 0; b.onFloor = true; b.floorOneway = true; r = bodyRect(b); }
    }
  }
  // "imã" de chão (descer pequenos desníveis sem flutuar)
  if (wasFloor && !b.onFloor && b.vy >= 0 && b.vy < 400) {
    const g = groundBelow(L, b.x, b.y, 10, b.w / 2, !(b.dropTimer > 0));
    if (g !== null) { b.y = g; b.vy = 0; b.onFloor = true; }
  }
}
function groundBelow(L, x, y, range, hw = 2, oneway = true) {
  let best = null;
  const test = (s) => { if (x + hw > s.x && x - hw < s.x + s.w && s.y >= y - 0.5 && s.y <= y + range) { if (best === null || s.y < best) best = s.y; } };
  L.solids.forEach(test); if (oneway) L.oneways.forEach(test);
  return best;
}
function segRect(x1, y1, x2, y2, r) {
  let t0 = 0, t1 = 1; const dx = x2 - x1, dy = y2 - y1;
  const p = [-dx, dx, -dy, dy], q = [x1 - r.x, r.x + r.w - x1, y1 - r.y, r.y + r.h - y1];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; }
    else { const t = q[i] / p[i]; if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; } }
  }
  return true;
}
function lineOfSight(L, x1, y1, x2, y2) { for (const s of L.solids) if (segRect(x1, y1, x2, y2, s)) return false; return true; }
function pointInSolid(L, x, y) { for (const s of L.solids) if (x > s.x && x < s.x + s.w && y > s.y && y < s.y + s.h) return true; return false; }

// ---------------------------------------------------------------- fundo
const THEMES = {
  village: { paper: [237, 227, 204], sky: [242, 224, 194], stain: [204, 184, 148], orb: [194, 43, 28, 0.9], orbPos: [0.74, 0.26], orbR: 90 },
  bamboo_forest: { paper: [224, 227, 212], sky: [209, 219, 204], stain: [178, 184, 158], orb: [235, 230, 209, 0.8], orbPos: [0.3, 0.2], orbR: 70 },
  castle: { paper: [237, 222, 196], sky: [242, 204, 168], stain: [204, 173, 133], orb: [199, 51, 31, 0.9], orbPos: [0.7, 0.32], orbR: 95 },
  shadow_temple: { paper: [204, 196, 194], sky: [158, 148, 163], stain: [140, 128, 140], orb: [237, 235, 224, 0.85], orbPos: [0.75, 0.2], orbR: 55 },
  final_fortress: { paper: [158, 148, 140], sky: [82, 71, 71], stain: [102, 84, 77], orb: [204, 31, 20, 0.95], orbPos: [0.68, 0.22], orbR: 105 },
  menu: { paper: [237, 227, 204], sky: [242, 230, 204], stain: [204, 184, 148], orb: [191, 41, 26, 0.92], orbPos: [0.22, 0.34], orbR: 150 },
};

function makePaper(theme, w, h) {
  const T = THEMES[theme] || THEMES.village;
  const c = document.createElement("canvas"); c.width = Math.ceil(w); c.height = h;
  const x = c.getContext("2d");
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, rgba(T.sky)); g.addColorStop(1, rgba(T.paper));
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  const r = seededRng(7);
  for (let i = 0; i < 70; i++) { const rx = r() * w, ry = r() * h, rr = r.range(40, 200); const gg = x.createRadialGradient(rx, ry, 0, rx, ry, rr); gg.addColorStop(0, rgba(T.stain, 0.18)); gg.addColorStop(1, rgba(T.stain, 0)); x.fillStyle = gg; x.fillRect(rx - rr, ry - rr, rr * 2, rr * 2); }
  x.globalAlpha = 0.05; x.strokeStyle = "#3a2e22";
  for (let i = 0; i < 900; i++) { const fx = r() * w, fy = r() * h, l = r.range(4, 26); x.lineWidth = r.range(0.3, 1); x.beginPath(); x.moveTo(fx, fy); x.lineTo(fx + l * (r() - 0.5), fy + l * 0.2 * (r() - 0.5)); x.stroke(); }
  x.globalAlpha = 1;
  // sol / lua em aguada
  const cx = w * T.orbPos[0], cy = h * T.orbPos[1], R = T.orbR, oc = T.orb;
  circ(x, cx, cy, R * 1.25, rgba(oc, oc[3] * 0.12)); circ(x, cx, cy, R, rgba(oc, oc[3]));
  for (let i = 0; i < 26; i++) { const a = r() * TAU, d = r() * R * 0.85; circ(x, cx + Math.cos(a) * d, cy + Math.sin(a) * d, r.range(R * 0.08, R * 0.25), rgba(i % 2 ? mixc(oc, [0, 0, 0], 0.1) : mixc(oc, [255, 255, 255], 0.15), 0.25)); }
  for (let i = 0; i < 40; i++) { const a = i / 40 * TAU; circ(x, cx + Math.cos(a) * (R + r.range(-3, 3)), cy + Math.sin(a) * (R + r.range(-3, 3)), r.range(2, 5), rgba(oc, oc[3] * 0.5)); }
  // vinheta
  const vg = x.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  vg.addColorStop(0, "rgba(60,45,30,0)"); vg.addColorStop(1, "rgba(60,45,30,0.32)"); x.fillStyle = vg; x.fillRect(0, 0, w, h);
  return c;
}

class BGLayer {
  constructor(factor, horizon) { this.factor = factor; this.horizon = horizon; this.W = 2400; this.OY = 720; this.c = document.createElement("canvas"); this.c.width = this.W; this.c.height = 1000; this.x = this.c.getContext("2d"); this.x.translate(0, this.OY); }
  mountains(baseY, height, col, a, seed, harm = 4, jag = 0) {
    const r = seededRng(seed), ph = [], am = [];
    for (let h = 0; h < harm; h++) { ph.push(r() * TAU); am.push(r.range(0.4, 1) / (h + 1)); }
    const x = this.x, top = [];
    for (let i = 0; i <= this.W / 24; i++) { const X = i * 24; let v = 0; for (let h = 0; h < harm; h++) v += Math.sin(TAU * (h + 1) * X / this.W + ph[h]) * am[h]; v = (v + 1.2) / 2.4 + (jag ? r.range(-jag, jag) : 0); top.push([X, baseY - clamp(v, 0.05, 1.2) * height]); }
    const g = x.createLinearGradient(0, baseY - height, 0, baseY + 60); g.addColorStop(0, rgba(col, a)); g.addColorStop(0.55, rgba(col, a * 0.85)); g.addColorStop(1, rgba(col, 0));
    x.fillStyle = g; x.beginPath(); x.moveTo(0, baseY + 60); top.forEach((p) => x.lineTo(p[0], p[1])); x.lineTo(this.W, baseY + 60); x.closePath(); x.fill();
    for (let i = 0; i < top.length - 1; i++) if (r() < 0.7) line(x, top[i], top[i + 1], r.range(1, 2.6), rgba(col, Math.min(1, a * 1.4)));
  }
  mist(y, h, a) { const x = this.x, g = x.createLinearGradient(0, y - h, 0, y + h); g.addColorStop(0, "rgba(242,237,224,0)"); g.addColorStop(0.5, `rgba(242,237,224,${a})`); g.addColorStop(1, "rgba(242,237,224,0)"); x.fillStyle = g; x.fillRect(0, y - h, this.W, h * 2); }
  roof(cx, y, w, h, st) { polyFill(this.x, [[cx - w / 2 - 12, y + 3], [cx - w * 0.3, y - h], [cx + w * 0.3, y - h], [cx + w / 2 + 12, y + 3], [cx + w * 0.45, y + 8], [cx - w * 0.45, y + 8]], st); }
  pagoda(cx, base, sc, st, tiers = 5) { let y = base, w = 120 * sc; for (let i = 0; i < tiers; i++) { this.x.fillStyle = st; this.x.fillRect(cx - w * 0.33, y - 44 * sc, w * 0.66, 44 * sc); this.roof(cx, y - 44 * sc, w, 18 * sc, st); y -= 60 * sc; w *= 0.84; } line(this.x, [cx, y + 12 * sc], [cx, y - 40 * sc], 2 * sc, st); }
  castle(cx, base, sc, st, light) {
    polyFill(this.x, [[cx - 170 * sc, base], [cx - 130 * sc, base - 70 * sc], [cx + 130 * sc, base - 70 * sc], [cx + 170 * sc, base]], st);
    let y = base - 70 * sc, w = 230 * sc;
    for (let i = 0; i < 4; i++) { this.x.fillStyle = st; this.x.fillRect(cx - w * 0.4, y - 50 * sc, w * 0.8, 50 * sc); this.x.fillStyle = light; for (let j = 0; j < 3; j++) this.x.fillRect(cx - w * 0.25 + j * w * 0.25 - 5 * sc, y - 34 * sc, 10 * sc, 14 * sc); this.roof(cx, y - 50 * sc, w, 22 * sc, st); y -= 72 * sc; w *= 0.78; }
  }
  houses(x0, base, count, st, seed) { const r = seededRng(seed); let x = x0; for (let i = 0; i < count; i++) { const w = r.range(70, 120), h = r.range(40, 60); this.x.fillStyle = st; this.x.fillRect(x, base - h, w, h); this.roof(x + w / 2, base - h, w, 26, st); x += w + r.range(20, 70); } }
  bamboo(count, base, hmin, hmax, col, a, seed) {
    const r = seededRng(seed);
    for (let i = 0; i < count; i++) {
      const x = r() * this.W, h = r.range(hmin, hmax), w = r.range(5, 10), aa = a * r.range(0.6, 1), st = rgba(col, aa);
      line(this.x, [x, base], [x + r.range(-10, 10), base - h], w, st);
      for (let y = base - 40; y > base - h; y -= 40) line(this.x, [x - w * 0.7, y], [x + w * 0.7, y], 1.5, rgba(mixc(col, [0, 0, 0], 0.5), aa));
      for (let j = 0; j < 3; j++) { const ly = base - r.range(h * 0.5, h), d = r() < 0.5 ? 1 : -1; line(this.x, [x, ly], [x + d * 30, ly + 8], 3, st); }
    }
  }
  trees(count, base, sc, col, a, seed, blossom) {
    const r = seededRng(seed);
    for (let i = 0; i < count; i++) {
      const x = r() * this.W, h = r.range(120, 200) * sc;
      line(this.x, [x, base], [x + r.range(-15, 15), base - h], 7 * sc, rgba(col, a));
      for (let j = 0; j < 7; j++) circ(this.x, x + r.range(-50, 50) * sc, base - h + r.range(-30, 30) * sc, r.range(14, 28) * sc, rgba(blossom || col, (blossom ? 0.45 : a) * r.range(0.5, 0.9)));
    }
  }
  towers(count, base, st, seed) { const r = seededRng(seed); for (let i = 0; i < count; i++) { const x = r() * this.W, h = r.range(160, 260); this.x.fillStyle = st; this.x.fillRect(x - 30, base - h, 60, h); this.roof(x, base - h, 90, 28, st); this.x.fillStyle = "rgba(217,77,38,0.35)"; this.x.fillRect(x - 8, base - h + 20, 16, 20); } }
  wall(base, h, st) { this.x.fillStyle = st; this.x.fillRect(0, base - h, this.W, h + 80); for (let x = 0; x < this.W; x += 60) polyFill(this.x, [[x, base - h], [x + 30, base - h - 16], [x + 60, base - h]], st); }
  clouds(count, y, st, seed) { const r = seededRng(seed); for (let i = 0; i < count; i++) { const x = r() * this.W, yy = y + r.range(-40, 40); for (let j = 0; j < 6; j++) circ(this.x, x + j * 34 + r.range(-10, 10), yy + r.range(-12, 12), r.range(26, 50), st); } }
  stairs(cx, base, st) { this.x.fillStyle = st; for (let i = 0; i < 10; i++) this.x.fillRect(cx - 90 + i * 6, base - i * 12, 180 - i * 12, 12); }
  draw(ctx, camX, camY, vw, vh, scroll) {
    let ox = -(((camX + scroll) * this.factor) % this.W); if (ox > 0) ox -= this.W;
    const oy = vh * this.horizon - (camY + 90) * this.factor * 0.5 - this.OY;
    for (let k = 0; ox + k * this.W < vw + 10; k++) ctx.drawImage(this.c, Math.floor(ox + k * this.W), Math.floor(oy));
  }
}

function buildBackground(theme) {
  const L = [], mk = (f, h) => { const l = new BGLayer(f, h); L.push(l); return l; };
  switch (theme) {
    case "village": case "menu": {
      mk(0.03, 0.5).clouds(5, -260, "rgba(247,242,230,0.35)", 3);
      const m1 = mk(0.08, 0.62); m1.mountains(0, 230, [140, 135, 128], 0.55, 11); m1.mist(-10, 70, 0.6);
      const m2 = mk(0.18, 0.66); m2.mountains(0, 150, [92, 87, 82], 0.65, 17); m2.castle(1500, -40, 0.55, "rgba(77,71,69,0.75)", "rgba(230,153,77,0.3)"); m2.mist(0, 50, 0.5);
      const m3 = mk(0.35, 0.74); m3.houses(100, 0, 9, "rgba(61,56,54,0.6)", 5); m3.trees(8, 0, 0.9, [51, 48, 46], 0.7, 21, [219, 133, 143]); m3.mist(10, 40, 0.45);
      break;
    }
    case "bamboo_forest": {
      const b1 = mk(0.06, 0.6); b1.mountains(0, 260, [128, 140, 128], 0.45, 31); b1.mist(0, 90, 0.7);
      const b2 = mk(0.2, 0.8); b2.bamboo(46, 0, 380, 640, [115, 133, 112], 0.45, 33); b2.mist(-60, 120, 0.55);
      const b3 = mk(0.45, 0.86); b3.bamboo(30, 0, 480, 760, [51, 66, 48], 0.7, 37); b3.mist(-20, 60, 0.4);
      break;
    }
    case "castle": {
      mk(0.03, 0.45).clouds(6, -220, "rgba(247,242,230,0.3)", 41);
      const c1 = mk(0.08, 0.62); c1.mountains(0, 220, [128, 122, 117], 0.55, 43); c1.mist(0, 60, 0.6);
      const c2 = mk(0.16, 0.7); c2.castle(1200, 0, 1.1, "rgba(56,51,51,0.85)", "rgba(242,153,77,0.4)"); c2.mist(0, 60, 0.4);
      const c3 = mk(0.32, 0.8); c3.wall(0, 90, "rgba(69,64,61,0.7)"); c3.towers(4, -90, "rgba(56,51,51,0.75)", 47);
      break;
    }
    case "shadow_temple": {
      const t1 = mk(0.06, 0.58); t1.mountains(0, 280, [89, 84, 97], 0.6, 51, 5); t1.mist(0, 100, 0.55);
      const t2 = mk(0.18, 0.7); t2.pagoda(500, 0, 1.2, "rgba(46,41,51,0.8)"); t2.pagoda(1700, 0, 0.8, "rgba(51,46,56,0.7)", 3); t2.stairs(1100, 0, "rgba(56,51,61,0.7)"); t2.mist(0, 70, 0.55);
      const t3 = mk(0.4, 0.8); t3.trees(7, 0, 1.1, [31, 28, 33], 0.75, 57); t3.mist(0, 80, 0.5);
      break;
    }
    case "final_fortress": {
      mk(0.02, 0.35).clouds(10, -200, "rgba(46,43,46,0.45)", 61);
      const f1 = mk(0.07, 0.6); f1.mountains(0, 330, [64, 61, 64], 0.75, 63, 6, 0.08); f1.mist(0, 70, 0.25);
      const f2 = mk(0.16, 0.68); f2.castle(1300, -60, 1.4, "rgba(26,23,26,0.92)", "rgba(230,51,26,0.45)"); f2.towers(5, 0, "rgba(31,28,31,0.85)", 67);
      const f3 = mk(0.33, 0.8); f3.wall(0, 120, "rgba(33,31,31,0.85)"); f3.mist(0, 50, 0.2);
      break;
    }
  }
  return L;
}

// ---------------------------------------------------------------- terreno
function groundColor(theme) { return { bamboo_forest: [33, 38, 28], castle: [36, 33, 31], shadow_temple: [31, 26, 31], final_fortress: [20, 18, 18] }[theme] || [31, 26, 23]; }
function prepTerrain(L) {
  const r = seededRng(1234);
  for (const b of L.blocks) {
    b.edge = []; for (let x = b.x; x <= b.x + b.w; x += 18) b.edge.push([x, b.y + r.range(-1.5, 1.5), r.range(3, 6.5)]);
    b.edge.push([b.x + b.w, b.y, 4]);
    b.grass = [];
    if ((L.theme === "village" || L.theme === "bamboo_forest") && (b.style === "ground" || b.style === "rock"))
      for (let gx = b.x + 6; gx < b.x + b.w - 6; gx += r.range(10, 26)) if (r() < 0.45) b.grass.push([gx, r.range(5, 13)]);
  }
}
function drawTerrain(ctx, L, x0, x1) {
  const top = groundColor(L.theme);
  for (const b of L.blocks) {
    if (b.x > x1 || b.x + b.w < x0) continue;
    const depth = Math.min(b.h, 260), g = ctx.createLinearGradient(0, b.y, 0, b.y + 260);
    g.addColorStop(0, rgba(top)); g.addColorStop(1, rgba(mixc(top, L.theme === "final_fortress" ? [120, 110, 104] : [196, 186, 166], 0.75))); ctx.fillStyle = g; ctx.fillRect(b.x, b.y, b.w, b.h);
    if (b.style === "wall" || b.style === "stone") {
      ctx.strokeStyle = "rgba(217,204,179,0.18)"; ctx.lineWidth = 1; ctx.beginPath();
      let row = 0; for (let y = b.y + 14; y < b.y + depth - 10; y += 14, row++) { ctx.moveTo(b.x, y); ctx.lineTo(b.x + b.w, y); for (let x = b.x + (row % 2 ? 22 : 0); x < b.x + b.w; x += 44) { ctx.moveTo(x, y - 14); ctx.lineTo(x, y); } }
      ctx.stroke();
    } else if (b.style === "wood_wall" || b.style === "house") {
      ctx.strokeStyle = "rgba(217,204,179,0.14)"; ctx.lineWidth = 1.5; ctx.beginPath(); for (let x = b.x + 10; x < b.x + b.w; x += 18) { ctx.moveTo(x, b.y); ctx.lineTo(x, b.y + b.h); } ctx.stroke();
      if (b.h < 400) { ctx.fillStyle = rgba(top, 0.85); ctx.fillRect(b.x, b.y, b.w, b.h); ctx.strokeStyle = "rgba(217,204,179,0.15)"; ctx.beginPath(); for (let x = b.x + 10; x < b.x + b.w; x += 18) { ctx.moveTo(x, b.y); ctx.lineTo(x, b.y + b.h); } ctx.stroke(); brush(ctx, [b.x, b.y + b.h], [b.x + b.w, b.y + b.h], 4, 4, S_INK); }
    }
    if ((b.style === "rock" || b.style === "stone") && b.h < 300) { ctx.fillStyle = rgba(top, 0.8); ctx.fillRect(b.x, b.y, b.w, b.h); }
    for (let i = 0; i < b.edge.length - 1; i++) brush(ctx, b.edge[i], b.edge[i + 1], b.edge[i][2], b.edge[i][2] * 0.7, S_INK);
    ctx.strokeStyle = "rgba(26,28,20,0.8)"; ctx.lineWidth = 1.3; ctx.beginPath();
    for (const g2 of b.grass) { ctx.moveTo(g2[0], b.y); ctx.lineTo(g2[0] - 3, b.y - g2[1]); ctx.moveTo(g2[0] + 2, b.y); ctx.lineTo(g2[0] + 5, b.y - g2[1] * 0.8); }
    ctx.stroke();
  }
  for (const p of L.plats) {
    if (p.x > x1 || p.x + p.w < x0) continue;
    const y = p.y, X = p.x, E = p.x + p.w;
    switch (p.style) {
      case "roof": {
        const lip = 14; polyFill(ctx, [[X - lip, y + 6], [X, y - 2], [E, y - 2], [E + lip, y + 6], [E + lip / 2, y + 16], [X - lip / 2, y + 16]], "rgb(38,36,36)");
        brush(ctx, [X - lip - 4, y + 3], [X, y - 3], 4, 4, S_INK); brush(ctx, [E, y - 3], [E + lip + 4, y + 3], 4, 4, S_INK); brush(ctx, [X, y - 3], [E, y - 3], 4.5, 4.5, S_INK);
        ctx.strokeStyle = "rgba(217,204,179,0.18)"; ctx.lineWidth = 1; ctx.beginPath(); for (let tx = X + 6; tx < E; tx += 9) { ctx.moveTo(tx, y); ctx.lineTo(tx - 3, y + 14); } ctx.stroke();
        break;
      }
      case "bridge": {
        ctx.fillStyle = "rgb(61,48,36)"; ctx.fillRect(X, y, p.w, 9);
        ctx.strokeStyle = "rgba(20,18,15,0.7)"; ctx.lineWidth = 1.5; ctx.beginPath(); for (let px = X; px < E; px += 14) { ctx.moveTo(px, y); ctx.lineTo(px, y + 9); } ctx.stroke();
        brush(ctx, [X, y], [E, y], 2.5, 2.5, S_INK);
        for (let px = X; px <= E; px += 80) brush(ctx, [px, y], [px, y - 30], 3, 3, "rgb(36,28,20)");
        brush(ctx, [X, y - 28], [E, y - 26], 2.5, 2.5, "rgb(36,28,20)");
        for (let bx = X + 40; bx < E; bx += 160) { brush(ctx, [bx, y + 9], [bx - 20, y + 120], 4, 4, "rgba(31,26,20,0.8)"); brush(ctx, [bx, y + 9], [bx + 20, y + 120], 4, 4, "rgba(31,26,20,0.8)"); }
        break;
      }
      case "bamboo": for (let k = 0; k < 3; k++) brush(ctx, [X, y + 3 + k * 4], [E, y + 3 + k * 4], 4, 4, "rgb(51,64,41)"); ctx.strokeStyle = S_INK; ctx.lineWidth = 1.5; ctx.beginPath(); for (let nx = X + 20; nx < E; nx += 40) { ctx.moveTo(nx, y); ctx.lineTo(nx, y + 12); } ctx.stroke(); break;
      case "stone": ctx.fillStyle = "rgb(56,54,51)"; ctx.fillRect(X, y, p.w, 14); brush(ctx, [X, y], [E, y], 3.5, 3.5, S_INK); brush(ctx, [X + 4, y + 14], [E - 4, y + 14], 2, 2, "rgba(23,20,18,0.6)"); break;
      case "branch": brush(ctx, [X, y + 4], [E, y + 2], 7, 7, S_INK); brush(ctx, [E - 20, y + 2], [E + 10, y - 10], 3, 3, S_INK); break;
      default: ctx.fillStyle = "rgb(51,41,31)"; ctx.fillRect(X, y, p.w, 10); brush(ctx, [X, y], [E, y], 3, 3, S_INK); brush(ctx, [X + 12, y + 10], [X + 12, y + 40], 3, 3, "rgba(31,26,20,0.7)"); brush(ctx, [E - 12, y + 10], [E - 12, y + 40], 3, 3, "rgba(31,26,20,0.7)");
    }
  }
}
function drawWater(ctx, w, t) {
  const g = ctx.createLinearGradient(0, w.y, 0, w.y + 300); g.addColorStop(0, "rgba(97,107,112,0.55)"); g.addColorStop(1, "rgba(26,28,31,0.9)");
  ctx.fillStyle = g; ctx.fillRect(w.x, w.y, w.w, 300);
  for (let i = 0; i < 5; i++) { ctx.strokeStyle = `rgba(235,240,242,${0.35 - i * 0.05})`; ctx.lineWidth = 1.5; ctx.beginPath(); for (let x = 0; x <= w.w; x += 12) { const yy = w.y + 6 + i * 12 + Math.sin((w.x + x) * 0.05 + t * (1.5 + i * 0.3) + i) * 2; x ? ctx.lineTo(w.x + x, yy) : ctx.moveTo(w.x + x, yy); } ctx.stroke(); }
}

// ---------------------------------------------------------------- cenário (decor)
const RED_S = "rgb(179,33,23)";
function dRoof(c, cx, y, w, h, st) {
  polyFill(c, [[cx - w / 2 - 14, y + 4], [cx - w * 0.32, y - h], [cx + w * 0.32, y - h], [cx + w / 2 + 14, y + 4], [cx + w / 2, y + 10], [cx - w / 2, y + 10]], st);
  brush(c, [cx - w / 2 - 18, y], [cx - w * 0.32, y - h], 3, 4, S_INK); brush(c, [cx + w * 0.32, y - h], [cx + w / 2 + 18, y], 4, 3, S_INK); brush(c, [cx - w * 0.32, y - h], [cx + w * 0.32, y - h], 4.5, 4.5, S_INK);
}
const DECOR = {
  house(c, t, r, burnt) {
    c.fillStyle = burnt ? "rgba(140,128,112,0.85)" : "rgba(219,209,184,0.9)"; c.fillRect(-90, -110, 180, 110);
    for (const x of [-90, -30, 30, 90]) brush(c, [x, 0], [x, -112], 5, 4, S_INK);
    brush(c, [-90, -60], [90, -60], 3, 3, S_INK);
    for (let i = 0; i < 2; i++) { const ox = -24 + i * 24; c.fillStyle = "rgba(242,235,214,0.95)"; c.fillRect(ox, -52, 22, 44); line(c, [ox + 11, -52], [ox + 11, -8], 1, S_INK); line(c, [ox, -30], [ox + 22, -30], 1, S_INK); }
    dRoof(c, 0, -110, 210, 60, "rgba(41,38,36,0.95)");
    if (burnt) { brush(c, [40, -150], [110, -100], 5, 2, S_INK); brush(c, [-60, -100], [-20, -40], 3, 1, S_INK); for (let i = 0; i < 5; i++) circ(c, r.range(-80, 80), r.range(-100, -20), r.range(8, 22), "rgba(13,13,13,0.35)"); circ(c, 60, -75, 10, "rgba(191,64,20,0.35)"); }
  },
  burnt_house(c, t, r) { DECOR.house(c, t, r, true); },
  torii(c) {
    brush(c, [-60, 0], [-54, -170], 12, 10, RED_S); brush(c, [60, 0], [54, -170], 12, 10, RED_S); brush(c, [-80, -140], [80, -140], 9, 9, RED_S);
    polyFill(c, [[-100, -168], [-90, -184], [90, -184], [100, -168], [80, -172], [-80, -172]], S_INK); brush(c, [-96, -186], [96, -186], 5, 5, S_INK);
    c.fillStyle = S_INK; c.fillRect(-12, -168, 24, 26);
  },
  lantern(c, t, r, s2) {
    const st = "rgb(82,79,74)"; c.fillStyle = st; c.fillRect(-16, -10, 32, 10); brush(c, [0, -10], [0, -50], 10, 8, st); c.fillStyle = st; c.fillRect(-14, -70, 28, 20);
    const gl = 0.75 + 0.25 * Math.sin(t * 7 + s2); circ(c, 0, -60, 26, `rgba(255,179,77,${0.12 * gl})`); c.fillStyle = `rgba(255,199,102,${0.85 * gl})`; c.fillRect(-7, -66, 14, 12);
    polyFill(c, [[-24, -70], [0, -88], [24, -70]], S_INK); circ(c, 0, -90, 4, S_INK);
  },
  hanging_lantern(c, t, r, s2) {
    const sw = Math.sin(t * 1.6 + s2) * 3; line(c, [0, -60], [sw, -28], 1.5, S_INK);
    circ(c, sw, -14, 30, `rgba(255,153,64,${0.1 + 0.04 * Math.sin(t * 6)})`);
    c.save(); c.translate(sw, -14); c.scale(0.8, 1); circ(c, 0, 0, 14, "rgba(199,36,23,0.95)"); circ(c, 0, 0, 9, "rgba(255,191,102,0.55)"); c.restore();
    line(c, [sw - 8, -27], [sw + 8, -27], 3, S_INK); line(c, [sw - 8, -1], [sw + 8, -1], 3, S_INK);
  },
  tree(c, t, r, s2, cherry) {
    const pts = [[0, 0], [-6, -60], [8, -120], [-4, -170]];
    for (let i = 0; i < 3; i++) brush(c, pts[i], pts[i + 1], 16 - i * 4, 13 - i * 4, S_INK);
    const br = [[[-4, -100], [-70, -140]], [[6, -120], [80, -150]], [[-2, -150], [-50, -200]], [[0, -160], [45, -210]]];
    for (const b of br) brush(c, b[0], b[1], 6, 1.5, S_INK);
    const c1 = cherry ? "rgba(224,128,143,0.75)" : "rgba(41,46,36,0.82)", c2 = cherry ? "rgba(242,173,184,0.6)" : "rgba(64,71,56,0.6)";
    for (const b of br) { const e = b[1]; for (let i = 0; i < 7; i++) circ(c, e[0] + r.range(-30, 30), e[1] + r.range(-20, 14), r.range(10, 20), c1); for (let i = 0; i < 4; i++) circ(c, e[0] + r.range(-24, 24), e[1] + r.range(-22, 6), r.range(6, 12), c2); }
    if (cherry) for (let i = 0; i < 12; i++) circ(c, r.range(-90, 90), r.range(-6, 0), 2.5, "rgba(224,128,143,0.7)");
  },
  cherry(c, t, r, s2) { DECOR.tree(c, t, r, s2, true); }, pine(c, t, r, s2) { DECOR.tree(c, t, r, s2, false); },
  dead_tree(c) { brush(c, [0, 0], [6, -90], 14, 8, S_INK); brush(c, [6, -90], [-10, -150], 8, 3, S_INK); brush(c, [4, -70], [50, -110], 5, 1, S_INK); brush(c, [-2, -110], [-50, -130], 4, 1, S_INK); },
  bamboo(c, t, r) {
    for (let k = 0; k < 5; k++) {
      const x = r.range(-50, 50), h = r.range(260, 420), lean = r.range(-12, 12), sh = r.range(0, 0.35);
      const col = `rgba(${(0.14 + sh * 0.5) * 255},${(0.17 + sh * 0.5) * 255},${(0.12 + sh * 0.5) * 255},${0.95 - sh})`, w = r.range(7, 11), segs = Math.floor(h / 46);
      for (let i = 0; i < segs; i++) { const a = [x + lean * i / segs, -i * 46], b = [x + lean * (i + 1) / segs, -(i + 1) * 46 + 4]; brush(c, a, b, w, w * 0.92, col); line(c, [b[0] - w * 0.6, b[1] + 2], [b[0] + w * 0.6, b[1] + 2], 1.6, S_INK); }
      for (let i = 0; i < 4; i++) { const ly = -r.range(h * 0.4, h), lx = x + lean * (-ly / h), d = r() < 0.5 ? 1 : -1; brush(c, [lx, ly], [lx + d * 34, ly + 10], 5, 0.5, col); brush(c, [lx, ly], [lx + d * 26, ly + 22], 4, 0.5, col); }
    }
  },
  waterfall(c, t) {
    c.fillStyle = "rgba(191,199,199,0.35)"; c.fillRect(-40, -380, 80, 380);
    for (let i = 0; i < 9; i++) { const x = -36 + i * 9, off = (t * 260 + i * 47) % 380; line(c, [x, -380 + off], [x, -380 + Math.min(380, off + 60)], 2, "rgba(242,247,250,0.55)"); }
    for (let i = 0; i < 6; i++) circ(c, -50 + i * 20 + Math.sin(t * 2 + i) * 6, -6, 16 + 4 * Math.sin(t * 3 + i), "rgba(242,242,240,0.35)");
    brush(c, [-46, -380], [-42, 0], 8, 10, S_INK); brush(c, [46, -380], [42, 0], 8, 10, S_INK);
  },
  statue(c, t) { const st = "rgb(77,74,71)"; c.fillStyle = st; c.fillRect(-26, -20, 52, 20); brush(c, [0, -20], [0, -80], 34, 28, st); circ(c, 0, -98, 16, st); line(c, [-6, -98], [-1, -98], 1.5, S_INK); line(c, [3, -98], [8, -98], 1.5, S_INK); c.fillStyle = "rgba(158,26,18,0.85)"; c.fillRect(-14, -64, 28, 14); circ(c, 0, -98, 22, `rgba(128,217,230,${0.06 + 0.04 * Math.sin(t)})`); },
  candles(c, t) { for (let i = 0; i < 4; i++) { const x = -24 + i * 16, h = 14 + (i % 2) * 8, fl = 1 + 0.2 * Math.sin(t * 12 + i * 2); c.fillStyle = "rgb(230,219,194)"; c.fillRect(x - 3, -h, 6, h); circ(c, x, -h - 6, 14 * fl, "rgba(255,166,64,0.1)"); polyFill(c, [[x - 3, -h - 3], [x, -h - 12 * fl], [x + 3, -h - 3]], "rgba(255,179,77,0.95)"); } },
  banner(c, t) {
    brush(c, [0, 0], [0, -230], 4, 3, S_INK);
    const pts = []; for (let i = 0; i < 9; i++) pts.push([4 + Math.sin(t * 3 + i * 0.5) * 3 * i / 8, -220 + i * 20]); for (let i = 8; i >= 0; i--) pts.push([40 + Math.sin(t * 3 + i * 0.5) * 5 * i / 8, -220 + i * 20]);
    polyFill(c, pts, "rgba(224,214,189,0.95)"); circ(c, 22 + Math.sin(t * 3 + 2) * 2, -170, 10, RED_S); brush(c, [0, -222], [42, -222], 3, 3, S_INK);
    for (let i = 0; i < 3; i++) line(c, [14, -140 + i * 22], [30, -140 + i * 22], 2, S_INK);
  },
  gate(c) {
    c.fillStyle = "rgb(46,36,28)"; c.fillRect(-120, -260, 240, 260);
    for (let x = -110; x < 120; x += 22) line(c, [x, -260], [x, 0], 2, "rgba(13,10,10,0.6)");
    for (const y of [-220, -130, -40]) { brush(c, [-120, y], [120, y], 6, 6, S_INK); for (let x = -100; x < 110; x += 40) circ(c, x, y, 3.5, "rgb(140,128,102)"); }
    dRoof(c, 0, -260, 300, 70, "rgb(33,31,31)"); brush(c, [-140, 0], [-140, -270], 16, 14, S_INK); brush(c, [140, 0], [140, -270], 16, 14, S_INK);
  },
  tower(c, t) {
    const w = "rgb(41,33,26)"; brush(c, [-50, 0], [-36, -230], 7, 6, w); brush(c, [50, 0], [36, -230], 7, 6, w);
    for (const y of [-60, -130, -200]) { brush(c, [-46, y], [46, y], 4, 4, w); brush(c, [-46, y], [40, y - 60], 2.5, 2.5, "rgba(41,33,26,0.7)"); }
    c.fillStyle = "rgb(51,41,31)"; c.fillRect(-50, -270, 100, 40); c.fillStyle = `rgba(255,184,89,${0.35 + 0.1 * Math.sin(t * 4)})`; c.fillRect(-36, -264, 72, 20); dRoof(c, 0, -272, 120, 40, S_INK);
  },
  smoke(c, t) { for (let i = 0; i < 9; i++) { const k = (t * 0.25 + i / 9) % 1; circ(c, Math.sin(k * 6 + i) * 30 * k + k * 60, -k * 320, 18 + k * 50, `rgba(51,48,46,${0.28 * (1 - k)})`); } },
  rocks(c) { polyFill(c, [[-60, 0], [-48, -30], [-10, -46], [30, -36], [58, -10], [64, 0]], "rgba(51,48,43,0.9)"); brush(c, [-48, -30], [-10, -46], 4, 2, S_INK); brush(c, [-10, -46], [30, -36], 3, 1, S_INK); },
  fence(c) { const w = "rgb(46,38,31)"; for (let x = -80; x < 90; x += 20) brush(c, [x, 0], [x, -48], 4, 3, w); brush(c, [-84, -38], [84, -36], 3, 3, w); brush(c, [-84, -16], [84, -18], 3, 3, w); },
  brazier(c, t) {
    brush(c, [-14, 0], [0, -40], 4, 4, S_INK); brush(c, [14, 0], [0, -40], 4, 4, S_INK); polyFill(c, [[-22, -44], [22, -44], [14, -30], [-14, -30]], S_INK);
    circ(c, 0, -60, 44, `rgba(255,128,51,${0.08 + 0.03 * Math.sin(t * 9)})`);
    for (let i = 0; i < 5; i++) { const fl = Math.sin(t * 11 + i * 1.7), h = 30 + fl * 8, x = -14 + i * 7; polyFill(c, [[x - 6, -44], [x + fl * 3, -44 - h], [x + 6, -44]], `rgba(217,${(0.22 + 0.2 * (i % 2)) * 255},20,0.85)`); }
  },
  fire(c, t) { DECOR.brazier(c, t); },
  bell(c) { brush(c, [-70, 0], [-70, -200], 10, 9, S_INK); brush(c, [70, 0], [70, -200], 10, 9, S_INK); dRoof(c, 0, -200, 180, 50, "rgb(36,33,33)"); line(c, [0, -200], [0, -170], 2, S_INK); polyFill(c, [[-22, -170], [22, -170], [30, -100], [-30, -100]], "rgb(64,77,69)"); },
  pagoda(c) { let y = 0, w = 150; for (let i = 0; i < 4; i++) { c.fillStyle = "rgba(51,46,43,0.9)"; c.fillRect(-w * 0.35, y - 60, w * 0.7, 60); dRoof(c, 0, y - 60, w, 26, S_INK); y -= 86; w *= 0.82; } },
  wall_window(c) { c.fillStyle = "rgba(242,230,199,0.25)"; c.fillRect(-40, -120, 80, 70); for (let i = 0; i < 5; i++) line(c, [-40 + i * 20, -120], [-40 + i * 20, -50], 3, S_INK); brush(c, [-46, -124], [46, -124], 6, 6, S_INK); brush(c, [-46, -48], [46, -48], 6, 6, S_INK); },
  grass(c, t, r) { for (let i = 0; i < 18; i++) { const x = r.range(-60, 60), h = r.range(10, 34); brush(c, [x, 0], [x + r.range(-12, 12), -h], 3, 0.4, "rgba(26,28,20,0.9)"); } },
};
const ANIMATED_DECOR = { smoke: 1, lantern: 1, candles: 1, waterfall: 1, banner: 1, brazier: 1, hanging_lantern: 1, fire: 1, tower: 1, statue: 1 };
function drawDecor(ctx, d, t) {
  const fn = DECOR[d.kind]; if (!fn) return;
  ctx.save(); ctx.translate(d.x, d.y); ctx.scale(d.s, d.s); if (d.front) ctx.globalAlpha = 0.92;
  fn(ctx, t, seededRng(d.seed), d.seed);
  ctx.restore();
}

// ---------------------------------------------------------------- clima (espaço de tela)
class Weather {
  constructor(kind) {
    this.kind = kind; this.parts = []; this.flash = 0; this.next = 6; this.t = 0;
    const n = { petals: 34, leaves: 26, mist: 10, rain: 140, storm: 200, embers: 40, spirit: 24 }[kind] || 0;
    for (let i = 0; i < n; i++) this.parts.push(this.make(true, 1280, 720));
  }
  make(any, w, h) {
    const p = { x: rand(0, w), y: any ? rand(-40, h) : -20, vx: 0, vy: 0, r: 3, s: rand(0, TAU), a: 1 };
    switch (this.kind) {
      case "petals": p.vx = rand(-60, -20); p.vy = rand(30, 70); p.r = rand(2.5, 4.5); break;
      case "leaves": p.vx = rand(-90, -30); p.vy = rand(40, 90); p.r = rand(3, 5.5); break;
      case "mist": p.x = rand(-200, w); p.y = rand(h * 0.3, h); p.vx = rand(8, 22); p.r = rand(120, 260); p.a = rand(0.08, 0.18); break;
      case "rain": case "storm": p.vx = -160; p.vy = rand(900, 1200); p.r = rand(10, 22); break;
      case "embers": p.y = any ? rand(0, h) : h + 10; p.vx = rand(-20, 20); p.vy = rand(-70, -30); p.r = rand(1.2, 2.6); break;
      case "spirit": p.vx = rand(-15, 15); p.vy = rand(-25, -8); p.r = rand(2, 4); if (!any) p.y = h + 10; break;
    }
    return p;
  }
  update(dt, w, h) {
    this.t += dt;
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i];
      if (this.kind === "petals" || this.kind === "leaves") p.vx += Math.sin(this.t * 1.7 + p.s) * 20 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.y > h + 30 || p.x < -300 || p.x > w + 300 || p.y < -60) { this.parts[i] = this.make(false, w, h); if (this.kind === "mist") { this.parts[i].x = -260; } }
    }
    if (this.kind === "storm") { this.next -= dt; if (this.next <= 0) { this.next = rand(5, 11); this.flash = 1; Audio2.play("thunder", 0.1, -4); } this.flash = Math.max(0, this.flash - dt * 2.5); }
  }
  draw(c, w, h) {
    for (const p of this.parts) {
      switch (this.kind) {
        case "petals": c.save(); c.translate(p.x, p.y); c.rotate(this.t * 2 + p.s); c.scale(1, 0.55); circ(c, 0, 0, p.r, "rgba(230,140,153,0.8)"); c.restore(); break;
        case "leaves": c.save(); c.translate(p.x, p.y); c.rotate(this.t * 3 + p.s); c.scale(1, 0.4); circ(c, 0, 0, p.r, "rgba(56,66,46,0.75)"); c.restore(); break;
        case "mist": c.save(); c.translate(p.x, p.y); c.scale(1.6, 0.5); circ(c, 0, 0, p.r, `rgba(245,242,235,${p.a})`); c.restore(); break;
        case "rain": case "storm": { const L = Math.hypot(p.vx, p.vy); line(c, [p.x, p.y], [p.x - p.vx / L * p.r, p.y - p.vy / L * p.r], 1, "rgba(51,56,64,0.35)"); break; }
        case "embers": circ(c, p.x, p.y, p.r, `rgba(242,89,26,${0.6 + 0.3 * Math.sin(this.t * 8 + p.s)})`); break;
        case "spirit": circ(c, p.x, p.y, p.r * 3, "rgba(128,217,230,0.06)"); circ(c, p.x, p.y, p.r, `rgba(179,242,255,${0.35 + 0.2 * Math.sin(this.t * 4 + p.s)})`); break;
      }
    }
    if (this.flash > 0) { c.fillStyle = `rgba(242,242,255,${this.flash * 0.35})`; c.fillRect(0, 0, w, h); }
  }
}

// ---------------------------------------------------------------- efeitos
class Fx {
  constructor(kind, x, y, o = {}) {
    this.kind = kind; this.x = x; this.y = y; this.size = o.size || 1; this.dir = o.dir || 1; this.text = o.text || ""; this.parts = [];
    this.color = o.color || null; const n = o.amount || 10; this.max = 0.6;
    switch (kind) {
      case "splash": this.max = 0.9; this.color = this.color || [158, 20, 15]; for (let i = 0; i < n; i++) { const a = rand(-1.1, 0.5), s = rand(120, 360) * this.size; this.parts.push({ x: 0, y: 0, vx: Math.cos(a) * this.dir * s, vy: Math.sin(a) * s, r: rand(1.5, 4.5) * this.size, g: 900 }); } break;
      case "smoke": this.max = o.life || 0.9; this.color = this.color || [56, 54, 51]; this.alpha = o.alpha || 0.55; for (let i = 0; i < n; i++) this.parts.push({ x: rand(-14, 14) * this.size, y: rand(-30, 0) * this.size, vx: rand(-40, 40) * this.size, vy: rand(-70, -10) * this.size, r: rand(8, 16) * this.size, g: 0 }); break;
      case "dust": this.max = 0.5; for (let i = 0; i < n; i++) this.parts.push({ x: rand(-10, 10), y: -2, vx: rand(-90, 90) * this.size, vy: rand(-40, -5) * this.size, r: rand(3, 7) * this.size, g: 60 }); break;
      case "sparks": this.max = 0.3; for (let i = 0; i < n; i++) { const a = rand(0, TAU), s = rand(150, 420); this.parts.push({ x: 0, y: 0, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 4, g: 300 }); } break;
      case "leaves": case "petals": this.max = 1.6; for (let i = 0; i < n; i++) this.parts.push({ x: rand(-10, 10), y: rand(-20, 0), vx: rand(-120, 120), vy: rand(-220, -60), r: rand(2.5, 4.5), g: 260, s: rand(-8, 8) }); break;
      case "text": this.max = o.life || 0.9; break;
      case "burst": this.max = 0.35; this.color = this.color || INK; break;
      case "slash": this.max = 0.28; this.color = this.color || INK; break;
      case "ring": this.max = 0.45; this.color = this.color || INK; break;
      case "speed": this.max = 0.25; for (let i = 0; i < 6; i++) this.parts.push({ x: rand(-30, 30), y: rand(-60, -5), vx: 0, vy: 0, r: rand(20, 45), g: 0 }); break;
      case "warning": this.max = o.life || 0.9; break;
    }
    this.life = this.max;
  }
  update(dt) {
    this.life -= dt;
    for (const p of this.parts) {
      p.vy += p.g * dt;
      if (this.kind === "smoke") { p.vx *= 1 - 1.5 * dt; p.vy *= 1 - 1.5 * dt; }
      if (this.kind === "leaves" || this.kind === "petals") { p.vx = p.vx * (1 - 1.2 * dt) + Math.sin(this.life * 6 + p.s) * 6; p.vy = Math.min(p.vy, 70); }
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    if (this.kind === "text") this.y -= 40 * dt;
    return this.life > 0;
  }
  draw(c) {
    const t = 1 - this.life / this.max, f = clamp(this.life / this.max, 0, 1);
    c.save(); c.translate(this.x, this.y);
    switch (this.kind) {
      case "splash": for (const p of this.parts) { const st = rgba(this.color, 0.95 * f); circ(c, p.x, p.y, p.r * (0.6 + 0.4 * f), st); const L = Math.hypot(p.vx, p.vy) || 1; brush(c, [p.x - p.vx / L * p.r * 2.2, p.y - p.vy / L * p.r * 2.2], [p.x, p.y], p.r * 0.3, p.r * 0.9, st); } break;
      case "smoke": for (const p of this.parts) circ(c, p.x, p.y, p.r * (1 + t * 1.6), rgba(this.color, this.alpha * f * 0.8)); break;
      case "dust": for (const p of this.parts) circ(c, p.x, p.y, p.r * (1 + t), `rgba(115,105,89,${0.45 * f})`); break;
      case "sparks": for (const p of this.parts) line(c, [p.x, p.y], [p.x - p.vx * 0.03, p.y - p.vy * 0.03], 1.6, `rgba(255,235,179,${f})`); break;
      case "leaves": case "petals": for (const p of this.parts) { c.save(); c.translate(p.x, p.y); c.rotate(this.life * p.s); c.scale(1, 0.45); circ(c, 0, 0, p.r, this.kind === "petals" ? `rgba(219,115,128,${Math.min(1, f * 2) * 0.9})` : `rgba(64,71,51,${Math.min(1, f * 2) * 0.85})`); c.restore(); } break;
      case "burst": { const rr = (14 + 40 * t) * this.size; c.strokeStyle = rgba(this.color, 0.9 * f); c.lineWidth = 6 * f * this.size + 1; c.beginPath(); c.arc(0, 0, rr, 0, TAU); c.stroke(); c.strokeStyle = `rgba(158,20,15,${0.7 * f})`; c.lineWidth = 3 * f + 0.5; c.beginPath(); c.arc(0, 0, rr * 0.6, 0, TAU); c.stroke(); break; }
      case "slash": { const pts = []; for (let i = 0; i < 13; i++) { const a = lerp(-1.2, 1.2, i / 12); pts.push([Math.cos(a) * this.dir * 46 * this.size, Math.sin(a) * 46 * this.size]); } for (let i = 0; i < 12; i++) { const w = Math.sin(Math.PI * (i + 0.5) / 12) * 9 * this.size * (0.5 + 0.5 * f); brush(c, pts[i], pts[i + 1], w, w, rgba(this.color, 0.9 * f)); } break; }
      case "ring": c.strokeStyle = rgba(this.color, 0.9 * f); c.lineWidth = 8 * f + 1; c.beginPath(); c.arc(0, -36, (40 + 30 * t) * this.size, 0, TAU); c.stroke(); break;
      case "speed": for (const p of this.parts) line(c, [p.x, p.y], [p.x - p.r * this.dir, p.y], 2, `rgba(23,20,18,${0.6 * f})`); break;
      case "warning": { const pu = 0.6 + 0.4 * Math.sin(this.life * 18); c.save(); c.scale(1, 0.3); c.strokeStyle = `rgba(191,26,18,${0.8 * pu})`; c.lineWidth = 4; c.beginPath(); c.arc(0, 0, 28 * this.size, 0, TAU); c.stroke(); c.restore(); c.fillStyle = `rgba(191,26,18,${0.2 * pu})`; c.fillRect(-6 * this.size, -600, 12 * this.size, 600); break; }
      case "text": { c.font = `bold ${Math.round(18 * this.size)}px Georgia, serif`; c.textAlign = "center"; c.lineWidth = 4; c.strokeStyle = `rgba(237,227,204,${f})`; c.strokeText(this.text, 0, 0); c.fillStyle = rgba(this.color || INK, f); c.fillText(this.text, 0, 0); break; }
    }
    c.restore();
  }
}
const FX = {
  add(kind, x, y, o) { if (Game.level) Game.level.fx.push(new Fx(kind, x, y, o)); },
  splash(x, y, dir, n = 10, size = 1) { this.add("splash", x, y, { dir, amount: n, size }); },
  impact(x, y, size = 1, color) { this.add("burst", x, y, { size, color }); },
  slash(x, y, dir, size = 1, color) { this.add("slash", x, y, { dir, size, color }); },
  smoke(x, y, n = 10, size = 1, color, alpha) { this.add("smoke", x, y, { amount: n, size, color, alpha }); },
  dust(x, y, n = 6, size = 1) { this.add("dust", x, y, { amount: n, size }); },
  sparks(x, y, n = 10) { this.add("sparks", x, y, { amount: n }); },
  leaves(x, y, n = 8, petals = false) { this.add(petals ? "petals" : "leaves", x, y, { amount: n }); },
  number(x, y, v, color = INK, size = 1) { this.add("text", x + rand(-8, 8), y, { text: String(Math.round(v)), color, size }); },
  text(x, y, s, color = INK, size = 1.2, life = 1.2) { this.add("text", x, y, { text: s, color, size, life }); },
  ring(x, y, size = 1) { this.add("ring", x, y, { size }); },
  speed(x, y, dir) { this.add("speed", x, y, { dir }); },
  warning(x, y, life, size = 1) { this.add("warning", x, y, { life, size }); },
};

// ---------------------------------------------------------------- projéteis
class Projectile {
  constructor(x, y, o) {
    Object.assign(this, { kind: "shuriken", team: "player", vx: 600, vy: 0, grav: 0, damage: 8, pierce: 0, life: 3, homing: null, homingStr: 0, kb: [120, -60], source: null, size: 1, bw: 14, bh: 14, hitsWorld: true }, o);
    this.x = x; this.y = y; this.hit = new Set(); this.spin = 0; this.stuck = false; this.age = 0; this.dead = false;
  }
  rect() { return { x: this.x - this.bw / 2, y: this.y - this.bh / 2, w: this.bw, h: this.bh }; }
  update(dt, L) {
    this.age += dt; this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    if (this.stuck) { if (this.kind === "caltrop") this.checkHits(L); return; }
    if (this.homing && !this.homing.dead && this.homingStr > 0) {
      const tx = this.homing.x - this.x, ty = this.homing.y - 40 - this.y, l = Math.hypot(tx, ty) || 1, sp = Math.hypot(this.vx, this.vy), k = clamp(this.homingStr * dt, 0, 1);
      this.vx = lerp(this.vx, tx / l * sp, k); this.vy = lerp(this.vy, ty / l * sp, k);
    }
    this.vy += this.grav * dt; this.x += this.vx * dt; this.y += this.vy * dt; this.spin += dt * 22;
    this.checkHits(L);
    if (this.hitsWorld && this.kind !== "dragon" && this.kind !== "wave" && this.kind !== "spirit") {
      const r = this.rect();
      let hitW = L.solids.some((s) => overlap(r, s));
      if (!hitW && this.kind === "caltrop" && this.vy > 0) { const g = groundBelow(L, this.x, this.y - 4, 8); if (g !== null) { this.y = g - 3; hitW = true; } }
      if (hitW) this.onWorld();
    }
  }
  checkHits(L) {
    const r = this.rect();
    const targets = this.team === "player" ? L.enemies : [L.player];
    for (const t of targets) {
      if (!t || t.dead || this.hit.has(t) || !overlap(r, t.hurtRect())) continue;
      this.hit.add(t);
      const res = t.takeHit({ damage: this.damage, kind: "projectile", kb: this.kb, source: this.source, dir: this.vx >= 0 ? 1 : -1, x: this.x, y: this.y, guardBreak: this.kind === "dragon" || this.kind === "wave" });
      if (res === "parried" && this.team !== "player") { this.team = "player"; this.vx = -this.vx * 1.2; this.vy = -this.vy; this.damage *= 1.5; this.homing = null; this.hit.clear(); FX.sparks(this.x, this.y, 12); return; }
      if (res === "blocked") { FX.sparks(this.x, this.y, 8); Audio2.play("clang", 0.15, -6); this.dead = true; return; }
      if (res === "hit" || res === "dead" || res === "assassinated") { if (this.pierce <= 0) { FX.impact(this.x, this.y, 0.5 * this.size); this.dead = true; return; } this.pierce--; }
    }
  }
  onWorld() {
    if (this.kind === "caltrop") { this.stuck = true; this.vx = this.vy = 0; this.life = Math.max(this.life, 6); return; }
    if (this.kind === "arrow" || this.kind === "kunai" || this.kind === "rain_arrow") { this.stuck = true; this.life = 0.8; return; }
    FX.impact(this.x, this.y, 0.5 * this.size); this.dead = true;
  }
  draw(c) {
    const fade = this.stuck ? clamp(this.life / 0.4, 0, 1) : 1, ink = `rgba(18,15,15,${fade})`, ang = Math.hypot(this.vx, this.vy) > 1 ? Math.atan2(this.vy, this.vx) : 0;
    c.save(); c.translate(this.x, this.y);
    switch (this.kind) {
      case "shuriken": c.rotate(this.spin); c.scale(this.size, this.size); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; polyFill(c, [[Math.cos(a + 0.7) * 3, Math.sin(a + 0.7) * 3], [Math.cos(a) * 9, Math.sin(a) * 9], [Math.cos(a - 0.7) * 3, Math.sin(a - 0.7) * 3]], ink); } circ(c, 0, 0, 3.2, ink); circ(c, 0, 0, 1.2, "rgba(230,219,199,1)"); break;
      case "kunai": c.rotate(ang); polyFill(c, [[14, 0], [2, -3.5], [-2, 0], [2, 3.5]], ink); line(c, [-2, 0], [-11, 0], 2, ink); c.strokeStyle = ink; c.lineWidth = 1.2; c.beginPath(); c.arc(-13, 0, 2.5, 0, TAU); c.stroke(); line(c, [-11, 0], [-18, 3], 1.5, `rgba(179,31,20,${fade})`); break;
      case "arrow": case "rain_arrow": c.rotate(ang); line(c, [-22, 0], [10, 0], 1.8, `rgba(58,46,34,${fade})`); polyFill(c, [[16, 0], [9, -3], [9, 3]], ink); polyFill(c, [[-22, 0], [-16, -4], [-12, 0]], `rgba(140,31,20,${fade})`); polyFill(c, [[-22, 0], [-16, 4], [-12, 0]], `rgba(140,31,20,${fade})`); break;
      case "spirit": { const pu = 0.8 + 0.2 * Math.sin(this.age * 14), L = Math.hypot(this.vx, this.vy) || 1; for (let i = 0; i < 5; i++) circ(c, -this.vx / L * i * 7, -this.vy / L * i * 7, (9 - i * 1.4) * pu * this.size, `rgba(26,20,31,${0.7 - i * 0.12})`); circ(c, 0, 0, 2.5, "rgba(140,230,242,0.9)"); break; }
      case "wave": { const d = this.vx >= 0 ? 1 : -1; c.translate(0, 22); for (let i = 0; i < 8; i++) { const h = 46 * this.size * Math.sin(Math.PI * (i + 0.5) / 8), x = -i * 6 * d; line(c, [x, 0], [x - 6 * d, -h], 5 - i * 0.4, `rgba(18,15,15,${0.85 - i * 0.08})`); } line(c, [0, 0], [4 * d, -40 * this.size], 2, "rgba(158,20,15,0.8)"); break; }
      case "dragon": {
        const d = this.vx >= 0 ? 1 : -1; let prev = null;
        for (let i = 0; i < 14; i++) { const p = [-i * 13 * d, Math.sin(this.age * 9 + i * 0.6) * 14 * this.size]; if (prev) brush(c, prev, p, (20 - (i - 1) * 1.1) * this.size, (20 - i * 1.1) * this.size, `rgba(15,13,13,${0.9 - i * 0.04})`); prev = p; }
        const hy = Math.sin(this.age * 9) * 14 * this.size; circ(c, 10 * d, hy, 13 * this.size, "rgba(15,13,13,0.95)");
        line(c, [6 * d, hy - 8], [-14 * d, hy - 26], 3, "rgba(191,26,18,0.9)"); line(c, [10 * d, hy - 6], [-6 * d, hy - 30], 3, "rgba(191,26,18,0.9)"); circ(c, 16 * d, hy - 3, 2.5, "rgb(255,64,26)"); break;
      }
      case "caltrop": c.rotate(this.spin * 0.2); for (let i = 0; i < 3; i++) { const a = i * TAU / 3; line(c, [0, 0], [Math.cos(a) * 6, Math.sin(a) * 6], 2, ink); } line(c, [0, 0], [0, -6], 2, ink); break;
    }
    c.restore();
  }
}

// ---------------------------------------------------------------- perigos (estacas, pilares, impacto)
class Hazard {
  constructor(x, y, o) { Object.assign(this, { kind: "spikes", damage: 15, w: 64, h: 20, delay: 0, active: -1, kb: [160, -380] }, o); this.x = x; this.y = y; this.t = 0; this.cd = new Map(); this.dead = false; }
  armed() { return this.t >= this.delay; }
  update(dt, L) {
    this.t += dt;
    if (!this.armed()) return;
    if (!this._fx && this.kind === "pillar") { this._fx = true; Audio2.play("explosion", 0.1, -6); FX.smoke(this.x, this.y, 8, 1, [20, 18, 18], 0.6); }
    if (this.active > 0 && this.t >= this.delay + this.active) { this.dead = true; return; }
    const r = { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h }, p = L.player;
    if (p && !p.dead && overlap(r, p.hurtRect()) && (this.cd.get(p) || 0) <= this.t) {
      this.cd.set(p, this.t + 0.8);
      p.takeHit({ damage: this.damage, kind: "hazard", kb: this.kb, dir: p.x >= this.x ? 1 : -1, x: p.x, y: p.y, guardBreak: true, source: null });
    }
  }
  draw(c) {
    c.save(); c.translate(this.x, this.y);
    if (this.kind === "spikes") {
      const n = Math.max(2, Math.floor(this.w / 10));
      for (let i = 0; i < n; i++) { const x = -this.w / 2 + (i + 0.5) * this.w / n, h = this.h * (0.75 + 0.25 * Math.sin(i * 2.3)); polyFill(c, [[x - 4, 0], [x + 1, -h], [x + 4, 0]], "rgb(51,56,41)"); line(c, [x + 1, -h], [x + 1, -h + 5], 1.5, "rgb(153,26,18)"); }
    } else if (!this.armed()) {
      const pu = 0.5 + 0.5 * Math.sin(this.t * 20); c.save(); c.scale(1, 0.3); c.strokeStyle = `rgba(179,26,18,${0.35 + 0.4 * pu})`; c.lineWidth = 4; c.beginPath(); c.arc(0, 0, this.w * 0.6, 0, TAU); c.stroke(); c.restore();
    } else {
      const life = this.active > 0 ? clamp(1 - (this.t - this.delay) / this.active, 0, 1) : 1, w = this.w * (0.6 + 0.4 * life), top = -this.h * Math.min(1, (this.t - this.delay) * 8);
      for (let i = 0; i < 6; i++) { c.fillStyle = `rgba(18,15,15,${(0.9 - i * 0.12) * life})`; c.fillRect(-w / 2 + Math.sin(this.t * 30 + i) * 3 + i * 2, top, w - i * 4, -top); }
      line(c, [0, top], [0, 0], 3, `rgba(179,26,18,${0.8 * life})`);
    }
    c.restore();
  }
}

// ---------------------------------------------------------------- coletáveis
class Pickup {
  constructor(kind, x, y, value, pop) { this.kind = kind; this.x = x; this.y = y; this.value = value; this.t = 0; this.dead = false; this.vx = pop ? rand(-120, 120) : 0; this.vy = pop ? rand(-320, -200) : 0; this.grounded = !pop; }
  update(dt, L) {
    this.t += dt; const p = L.player;
    if (p && !p.dead && this.t > 0.35) { const tx = p.x - this.x, ty = p.y - 36 - this.y, l = Math.hypot(tx, ty); if (l < 110) { const m = Math.min(l, 520 * dt); this.x += tx / l * m; this.y += ty / l * m; this.grounded = true; } if (l < 24) this.collect(p); }
    if (!this.grounded) { this.vy += 1100 * dt; const g = groundBelow(L, this.x, this.y, this.vy * dt + 10); if (g !== null && this.vy > 0) { this.y = g - 10; this.grounded = true; } else { this.x += this.vx * dt; this.y += this.vy * dt; } if (this.y > L.killY) this.dead = true; }
  }
  collect(p) {
    this.dead = true;
    switch (this.kind) {
      case "coin": Prog.addCoins(this.value); Audio2.play("coin", 0.05, -6); break;
      case "onigiri": p.heal(25); FX.text(this.x, this.y - 20, "+Vida", [38, 115, 51]); break;
      case "shuriken": Prog.addItem("shuriken", this.value); Audio2.play("pickup", 0.05, -4); FX.text(this.x, this.y - 20, `+${this.value} shuriken`); break;
      case "kunai": Prog.addItem("kunai", this.value); Audio2.play("pickup", 0.05, -4); break;
      case "elixir": Prog.addItem("elixir", 1); Audio2.play("heal", 0.05, -4); FX.text(this.x, this.y - 20, "+Elixir", [38, 115, 51]); break;
      case "scroll": Prog.addXp(this.value); Audio2.play("level_up", 0, -4); FX.text(this.x, this.y - 20, `+${this.value} XP`, [153, 115, 26]); break;
    }
  }
  draw(c) {
    const bob = this.grounded ? Math.sin(this.t * 4) * 2 : 0;
    c.save(); c.translate(this.x, this.y + bob);
    switch (this.kind) {
      case "coin": c.translate(0, -6); c.scale(Math.abs(Math.cos(this.t * 3)) * 0.8 + 0.2, 1); circ(c, 0, 0, 7, "rgb(184,143,51)"); circ(c, 0, 0, 5, "rgb(217,173,71)"); c.fillStyle = S_INK; c.fillRect(-2, -2, 4, 4); break;
      case "onigiri": polyFill(c, [[0, -20], [-11, 0], [11, 0]], "rgb(245,242,230)"); c.fillStyle = S_INK; c.fillRect(-7, -7, 14, 7); break;
      case "shuriken": case "kunai": circ(c, 0, -8, 12, "rgba(237,227,204,0.8)"); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + this.t; line(c, [0, -8], [Math.cos(a) * 9, -8 + Math.sin(a) * 9], 3, S_INK); } break;
      case "elixir": circ(c, 0, -8, 8, "rgba(38,115,64,0.9)"); c.fillStyle = "rgb(128,89,51)"; c.fillRect(-3, -22, 6, 8); break;
      case "scroll": c.fillStyle = "rgb(237,227,204)"; c.fillRect(-12, -16, 24, 12); line(c, [-13, -16], [-13, -4], 4, "rgb(153,31,20)"); line(c, [13, -16], [13, -4], 4, "rgb(153,31,20)"); line(c, [-6, -10], [6, -10], 1.5, S_INK); break;
    }
    c.restore();
  }
}

// ---------------------------------------------------------------- objetos (checkpoint, saída, escada, armadilha, sala secreta)
class LevelObject {
  constructor(kind, x, y, o = {}) { Object.assign(this, { kind, x, y, w: 40, h: 80, locked: false, interval: 2, dir: -1, active: false, t: 0, reveal: 0 }, o); if (kind === "arrow_trap") this.t = rand(0, this.interval); }
  rect() { return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h }; }
  update(dt, L) {
    this.t += dt; const p = L.player; if (!p) return;
    const inside = !p.dead && overlap(this.rect(), p.bodyRect());
    switch (this.kind) {
      case "checkpoint": if (!this.active && inside) { this.active = true; Audio2.play("checkpoint"); p.spawn = { x: this.x, y: this.y }; p.lastSafe = { x: this.x, y: this.y }; p.heal(p.maxHp * 0.25); Hud.message("Checkpoint — progresso salvo", [64, 64, 64]); Save.save(); L.checkpoint = { x: this.x, y: this.y }; } break;
      case "exit": if (!this.locked && inside) L.onExit(); break;
      case "arrow_trap": if (this.t >= this.interval) { this.t = 0; if (Math.abs(p.x - this.x) < 900) { L.projectiles.push(new Projectile(this.x + this.dir * 20, this.y - this.h / 2, { kind: "arrow", team: "enemy", vx: this.dir * 620, vy: 0, damage: 10, life: 2.5, bw: 18, bh: 8, kb: [140, -80] })); Audio2.play("arrow", 0.1, -10); } } break;
      case "secret": if (inside && this.reveal < 0.01) { Hud.message("Sala secreta descoberta!", [153, 115, 26]); Audio2.play("checkpoint", 0, -4); } this.reveal = moveToward(this.reveal, inside ? 1 : 0, dt * 3); break;
      case "ladder": { const r = this.rect(), br = p.bodyRect(); p.ladderHere = p.ladderHere || (br.x + br.w > r.x && br.x < r.x + r.w && br.y < r.y + r.h && br.y + br.h > r.y ? this : null); break; }
    }
  }
  draw(c) {
    c.save(); c.translate(this.x, this.y);
    switch (this.kind) {
      case "checkpoint": { const st = "rgb(77,74,69)"; c.fillStyle = st; c.fillRect(-14, -10, 28, 10); c.fillRect(-5, -46, 10, 36); c.fillRect(-13, -64, 26, 18); polyFill(c, [[-20, -64], [0, -80], [20, -64]], S_INK);
        if (this.active) { const g = 0.8 + 0.2 * Math.sin(this.t * 6); circ(c, 0, -55, 30, `rgba(255,179,77,${0.15 * g})`); c.fillStyle = `rgba(255,199,102,${0.9 * g})`; } else c.fillStyle = "rgb(31,28,26)"; c.fillRect(-6, -60, 12, 10); break; }
      case "exit": c.fillStyle = RED_S; c.fillRect(-62, -170, 12, 170); c.fillRect(50, -170, 12, 170); c.fillRect(-78, -146, 156, 9); polyFill(c, [[-96, -168], [-86, -184], [86, -184], [96, -168]], S_INK);
        if (this.locked) { for (let i = 0; i < 6; i++) line(c, [-46 + i * 18, -140], [-46 + i * 18 + Math.sin(this.t * 2 + i) * 4, 0], 3, "rgba(20,18,18,0.55)"); circ(c, 0, -80, 18, "rgba(153,26,18,0.6)"); }
        else { c.fillStyle = `rgba(250,242,217,${0.15 + 0.1 * Math.sin(this.t * 3)})`; c.fillRect(-50, -146, 100, 146); } break;
      case "ladder": { const top = -this.h, w = "rgb(51,41,31)"; line(c, [-12, 0], [-12, top + 30], 4, w); line(c, [12, 0], [12, top + 30], 4, w); for (let y = -12; y > top + 30; y -= 18) line(c, [-12, y], [12, y], 3, w); break; }
      case "arrow_trap": c.fillStyle = "rgb(51,64,41)"; c.fillRect(-12, -this.h, 24, this.h); circ(c, this.dir * 10, -this.h / 2, 5, S_INK); break;
    }
    c.restore();
  }
  drawFront(c) {
    if (this.kind !== "secret") return;
    const a = 1 - this.reveal * 0.85; c.fillStyle = `rgba(33,31,31,${a})`; c.fillRect(this.x - this.w / 2, this.y - this.h, this.w, this.h);
    c.strokeStyle = `rgba(217,204,179,${0.15 * a})`; c.lineWidth = 1; c.beginPath(); for (let y = this.y - this.h + 14; y < this.y; y += 14) { c.moveTo(this.x - this.w / 2, y); c.lineTo(this.x + this.w / 2, y); } c.stroke();
  }
}
