// ============================================================================
// Fase: construção a partir de DATA.levels, câmera, arena do chefe, vitória/derrota.
// ============================================================================
class Level {
  constructor(n, resume) {
    const d = DATA.levels[n]; this.n = n; this.d = d; this.theme = d.theme; this.width = d.width; this.killY = d.kill_y;
    this.solids = []; this.oneways = []; this.blocks = []; this.plats = []; this.waters = []; this.decor = []; this.front = [];
    this.objects = []; this.enemies = []; this.projectiles = []; this.hazards = []; this.pickups = []; this.fx = []; this.timers = []; this.tokens = [];
    this.vantage = d.vantage || []; this.time = 0; this.kills = 0; this.coinsStart = Prog.d.coins; this.completed = false; this.failed = false; this.t = 0;
    const stone = ["castle", "final_fortress", "shadow_temple"].includes(this.theme);
    for (const g of d.ground) { const r = { x: g[0], y: g[2] || 0, w: g[1] - g[0], h: 600, style: stone ? "stone" : "ground" }; this.solids.push(r); this.blocks.push(r); }
    for (const b of d.blocks || []) { const r = { x: b[0], y: b[1], w: b[2], h: b[3], style: b[4] || "rock" }; this.solids.push(r); this.blocks.push(r); }
    for (const p of d.platforms || []) { const r = { x: p[0], y: p[1], w: p[2], h: 12, style: p[3] || "wood" }; this.plats.push(r); (r.style === "bridge" ? this.solids : this.oneways).push(r); }
    for (const w of d.water || []) this.waters.push({ x: w[0], y: 150, w: w[1] - w[0] });
    this.solids.push({ x: -60, y: -2000, w: 60, h: 2600 }, { x: this.width, y: -2000, w: 60, h: 2600 });
    prepTerrain(this);
    const mkDecor = (list, front) => list.map((e) => ({ kind: e[0], x: e[1], y: e[2] || 0, s: e[3] || 1, front, seed: Math.floor(Math.abs(e[1]) * 7 + Math.abs(e[2] || 0) * 3) }));
    this.decor = mkDecor(d.decor || [], false); this.front = mkDecor(d.front_decor || [], true);
    for (const c of d.checkpoints || []) this.objects.push(new LevelObject("checkpoint", c[0], c[1] || 0, { w: 50, h: 90 }));
    for (const l of d.ladders || []) this.objects.push(new LevelObject("ladder", l[0], l[2], { w: 30, h: l[2] - l[1] + 36, top: l[1], bottom: l[2] }));
    for (const t of d.traps || []) this.objects.push(new LevelObject("arrow_trap", t.x, t.y || 0, { w: 24, h: 100, dir: t.dir || -1, interval: t.interval || 2 }));
    for (const s of d.secrets || []) this.objects.push(new LevelObject("secret", s[0], s[1], { w: s[2], h: s[3] }));
    for (const h of d.hazards || []) this.hazards.push(new Hazard(h.x, h.y || 0, { kind: h.kind, damage: h.damage || 15, w: h.w || 64, h: h.h || 22 }));
    for (const p of d.pickups || []) this.pickups.push(new Pickup(p[0], p[1], p[2], p[3] || 1, false));
    const ex = d.exit || [this.width - 120, 0]; this.exit = new LevelObject("exit", ex[0], ex[1], { w: 100, h: 170, locked: !!d.boss }); this.objects.push(this.exit);
    for (const e of d.enemies) this.spawnEnemy(e.id, e.x, e.y || 0, e);
    if (d.boss) { const b = d.boss; this.arena = b.arena; this.boss = new Boss(this, b.id, b.x, b.y || 0); this.enemies.push(this.boss); }
    let st = d.player_start; if (resume) st = [resume.x, resume.y];
    this.player = new Kage(this, st[0], st[1]); this.checkpoint = null;
    this.layers = buildBackground(this.theme); this.weather = new Weather(d.weather || "");
    this.cam = { x: this.player.x, y: this.player.y - 150, l: 0, r: this.width, top: d.camera_top || -900, bot: d.camera_bottom || 150, look: 0 };
    Audio2.playMusic(d.music); Audio2.playAmbient(d.ambient);
    Hud.reset(this); Hud.banner(d.name, d.story, 4.5, `Fase ${NUMERALS[n - 1]}  ·  ${d.subtitle}`);
  }
  spawnEnemy(id, x, y, spawn = {}) { const data = DATA.enemies[id]; if (!data) return null; const C = ARCHETYPES[data.archetype] || Ashigaru; const e = new C(this, id, x, y, spawn); this.enemies.push(e); return e; }
  spawnPickup(kind, x, y, v, pop = true) { this.pickups.push(new Pickup(kind, x, y, v, pop)); }
  after(t, fn) { this.timers.push({ t, fn }); }
  requestToken(e) { this.tokens = this.tokens.filter((x) => !x.dead); if (this.tokens.includes(e)) return true; if (this.tokens.length < 2) { this.tokens.push(e); return true; } return false; }
  releaseToken(e) { this.tokens = this.tokens.filter((x) => x !== e); }
  attackers() { return this.tokens.filter((x) => !x.dead).length; }
  onNoise(x, y, r) { for (const e of this.enemies) e.onNoise(x, y, r); }
  onAllyAlert(src) { for (const e of this.enemies) e.onAllyAlert(src); }
  onPlayerAttack(x, y, k) { for (const e of this.enemies) e.onPlayerAttack(x, y, k); }
  triggerBoss() {
    if (this.bossTriggered || !this.boss) return; this.bossTriggered = true;
    this.arenaWalls = [{ x: this.arena[0] - 40, y: -1600, w: 40, h: 1700 }, { x: this.arena[1], y: -1600, w: 40, h: 1700 }];
    this.solids.push(...this.arenaWalls); this.front.push({ kind: "smoke", x: this.arena[0] - 20, y: 0, s: 1.4, front: true, seed: 1 });
    this.cam.l = this.arena[0] - 40; this.cam.r = this.arena[1] + 40;
    Audio2.playMusic(this.d.boss_music); if (this.d.boss.intro) Hud.banner(this.boss.data.name, this.d.boss.intro, 4);
    this.boss.startFight(this.arena[0], this.arena[1]);
  }
  onBossDefeated() {
    this.bossDefeated = true; if (this.arenaWalls) this.solids = this.solids.filter((s) => !this.arenaWalls.includes(s));
    this.cam.l = 0; this.cam.r = this.width; this.exit.locked = false; Audio2.playMusic(this.d.music); Hud.bossEnd();
    Hud.banner("Vitória", this.d.boss.defeat || "O caminho está livre.", 5); Hud.message("O portão torii se abriu →", BLOOD); Save.save();
  }
  onExit() {
    if (this.completed || this.failed || (this.boss && !this.bossDefeated)) return;
    this.completed = true; this.player.victory(); Audio2.playMusic("victory"); Audio2.play("victory");
    const st = { time: this.time, kills: this.kills, coins: Prog.d.coins - this.coinsStart, name: this.d.name };
    Prog.completeStage(this.n, st); this.after(1.6, () => UI.results(st, this.n >= 5, this.d.ending || ""));
  }
  onPlayerDied() { if (this.completed || this.failed) return; this.failed = true; Save.save(); Audio2.playMusic(""); UI.gameOver(); }

  update(dt) {
    this.t += dt; if (!this.completed && !this.failed) this.time += dt;
    for (const tm of this.timers) { tm.t -= dt; if (tm.t <= 0 && !tm.done) { tm.done = true; tm.fn(); } }
    this.timers = this.timers.filter((t) => !t.done);
    const p = this.player; p.ladderHere = null;
    for (const o of this.objects) o.update(dt, this);
    p.update(dt);
    for (const e of this.enemies) e.update(dt);
    this.enemies = this.enemies.filter((e) => !e.remove);
    for (const pr of this.projectiles) pr.update(dt, this); this.projectiles = this.projectiles.filter((x) => !x.dead);
    for (const h of this.hazards) h.update(dt, this); this.hazards = this.hazards.filter((x) => !x.dead);
    for (const pk of this.pickups) pk.update(dt, this); this.pickups = this.pickups.filter((x) => !x.dead);
    this.fx = this.fx.filter((f) => f.update(dt));
    if (this.boss && !this.bossTriggered && !this.bossDefeated && p.x > this.arena[0] + 140) this.triggerBoss();
    // câmera
    const c = this.cam, Z = Game.zoom, hw = Game.vw / 2 / Z, hh = 360 / Z;
    c.look = lerp(c.look, p.facing * 70, Math.min(1, dt * 3));
    const tx = clamp(p.x + c.look, c.l + hw, Math.max(c.l + hw, c.r - hw)), ty = clamp(p.y - 150, c.top + hh, Math.max(c.top + hh, c.bot - hh));
    c.x = lerp(c.x, tx, Math.min(1, dt * 6)); c.y = lerp(c.y, ty, Math.min(1, dt * 6));
    this.weather.update(dt, Game.vw, 720);
  }
  draw(ctx) {
    const vw = Game.vw, Z = Game.zoom, c = this.cam;
    let sx = 0, sy = 0; if (Game.shakeT > 0) { sx = rand(-1, 1) * Game.shakeAmt; sy = rand(-1, 1) * Game.shakeAmt; }
    ctx.drawImage(Game.paper(this.theme), 0, 0);
    for (const l of this.layers) l.draw(ctx, c.x, c.y, vw, 720, 0);
    ctx.save();
    ctx.translate(vw / 2 + sx, 360 + sy); ctx.scale(Z, Z); ctx.translate(-c.x, -c.y);
    const x0 = c.x - vw / 2 / Z - 300, x1 = c.x + vw / 2 / Z + 300, vis = (x) => x > x0 && x < x1;
    for (const d of this.decor) if (vis(d.x)) drawDecor(ctx, d, this.t);
    for (const w of this.waters) if (w.x < x1 && w.x + w.w > x0) drawWater(ctx, w, this.t);
    drawTerrain(ctx, this, x0, x1);
    for (const o of this.objects) if (vis(o.x)) o.draw(ctx);
    for (const h of this.hazards) if (vis(h.x)) h.draw(ctx);
    for (const pk of this.pickups) if (vis(pk.x)) pk.draw(ctx);
    for (const e of this.enemies) if (vis(e.x)) e.draw(ctx);
    this.player.draw(ctx);
    for (const pr of this.projectiles) if (vis(pr.x)) pr.draw(ctx);
    for (const f of this.fx) f.draw(ctx);
    for (const d of this.front) if (vis(d.x)) drawDecor(ctx, d, this.t);
    for (const o of this.objects) if (o.kind === "secret" && vis(o.x)) o.drawFront(ctx);
    ctx.restore();
    this.weather.draw(ctx, vw, 720);
  }
}
