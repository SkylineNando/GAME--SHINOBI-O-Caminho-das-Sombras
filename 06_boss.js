// ============================================================================
// Chefes: fases por % de vida e golpes especiais como corrotinas (geradores).
// yield <segundos> espera; yield 0 espera um quadro.
// ============================================================================
class Boss extends Enemy {
  constructor(L, id, x, y) {
    super(L, id, x, y, { facing: -1 }, DATA.bosses[id]);
    this.bossId = id; this.isBoss = true; this.phase = 0; this.fighting = false; this.co = null; this.coWait = 0; this.think = 1.5;
    this.arena = [0, 1e5]; this.floorY = y; this.minions = []; this.moveT = 0;
  }
  get busy() { return !!this.co; }
  startFight(l, r) {
    if (this.fighting || this.dead) return;
    this.arena = [l, r]; this.fighting = true; this.alerted = true; this.awareness = 1; this.face();
    this.run(this.coIntro());
    Hud.bossStart(this.data.name, this.hp, this.maxHp);
  }
  *coIntro() { this.change("special"); this.fig.play("roar", true); Audio2.play("boss_roar"); Game.shake(6, 0.6); yield 1.6; this.think = 0.6; }
  run(gen) { this.co = gen; this.coWait = 0; }
  cancel() { this.co = null; this.coWait = 0; }
  perceive() { }
  requestToken() { return true; }
  onPlayerAttack() {} onNoise() {} onAllyAlert() {}
  ph() { const p = this.data.phases; return p[clamp(this.phase, 0, p.length - 1)]; }
  runState(dt) {
    if (this.dead) return this.st_death(dt);
    if (!this.fighting) { this.stop(dt); this.fig.play("idle"); return; }
    if (this.co) {
      if (this.state === "attack") this.st_attack(dt); else if (this.state === "defend") this.stop(dt);
      if (this.coWait > 0) { this.coWait -= dt; return; }
      const r = this.co.next();
      if (r.done) { this.co = null; if (this.state !== "stun" && !this.dead) this.change("chase"); }
      else this.coWait = r.value || 0;
      return;
    }
    if (this.state === "stun") return this.st_stun(dt);
    if (this.state === "attack") return this.st_attack(dt);
    this.thinkStep(dt);
  }
  thinkStep(dt) {
    if (!this.tValid()) { this.stop(dt); this.fig.play("idle"); return; }
    this.face(); const ph = this.ph(), desired = ph.range || 120, spd = this.p("speed", 90) * (ph.speed_mult || 1), d = this.dist();
    let m = false;
    if (d > desired + 40) m = this.moveC(this.target.x, spd * (d > desired * 2.5 ? 1.6 : 1), dt);
    else if (d < desired - 50) { m = this.moveC(this.x - this.facing * 80, spd, dt); this.face(); }
    else this.stop(dt);
    this.fig.play(m ? "walk" : "idle");
    this.think -= dt;
    if (this.think <= 0) {
      const moves = ph.moves; let tot = 0; for (const k in moves) tot += moves[k]; let r = Math.random() * tot, mv = Object.keys(moves)[0];
      for (const k in moves) { r -= moves[k]; if (r <= 0) { mv = k; break; } }
      this.think = (ph.cooldown || 1.2) * rand(0.8, 1.2); this.dmgMult = ph.dmg_mult || 1;
      const fn = this["mv_" + mv] || this.mv_combo; this.run(fn.call(this));
    }
  }
  moveC(x, s, dt) { return this.moveToX(clamp(x, this.arena[0] + 40, this.arena[1] - 40), s, dt, 10); }
  named(n) { return (this.data.attacks || []).find((a) => a.name === n); }
  endAttack() { this.box.active = false; this.change("chase"); }
  *anim(n) { const a = this.named(n); if (!a) return; this.startAttack(a); let t = 0; while (this.state === "attack" && t < 3) { yield 0; t += 1 / 60; } }
  *approach(reach, timeout) { let t = 0; const s = this.p("run_speed", 200) * (this.ph().speed_mult || 1); while (this.tValid() && this.dist() > reach && t < timeout) { this.moveC(this.target.x, s, 1 / 60); this.fig.play("run"); yield 0; t += 1 / 60; } this.vx = 0; }
  hazard(o, x, y) { this.L.hazards.push(new Hazard(x, y, o)); }
  wave(x, d, speed) { this.L.projectiles.push(new Projectile(x + d * 40, this.floorY - 24, { kind: "wave", team: "enemy", vx: d * speed, vy: 0, damage: 14 * this.dmgMult, life: 1.6, source: this, bw: 26, bh: 48, hitsWorld: false, kb: [220, -260] })); }
  slam(size) {
    Game.shake(10, 0.35); Audio2.play("explosion", 0.1); FX.dust(this.x, this.y, 14, 1.6); FX.impact(this.x, this.y - 10, 2 * size);
    this.hazard({ kind: "shock", damage: 18 * this.dmgMult, w: 220 * size, h: 46 * size, active: 0.18, kb: [260, -320] }, this.x, this.y);
    if (this.phase >= 1) { this.wave(this.x, -1, 480); this.wave(this.x, 1, 480); }
  }
  // ---------------------------------------------------------- golpes
  *mv_combo() { yield* this.approach(110 * this.sc, 1.6); for (const n of this.data.combo || ["slash1"]) { this.face(); yield* this.anim(n); } }
  *mv_thrust() { this.face(); const h = this.fig.headPos(this.x, this.y); FX.sparks(h[0], h[1], 6); yield 0.35; yield* this.anim("thrust"); }
  *mv_leap_slam() {
    if (!this.tValid()) return; this.face(); const tx = clamp(this.target.x, this.arena[0] + 60, this.arena[1] - 60);
    this.vx = clamp((tx - this.x) * 1.25, -620, 620); this.vy = -760; this.change("special"); this.fig.play(this.data.acrobat ? "double_jump" : "jump", true); Audio2.play("jump", 0.05, -2);
    yield 0.25; this.fig.play("air_attack", true); let t = 0; while (!this.onFloor && t < 2) { yield 0; t += 1 / 60; }
    this.vx = 0; this.slam(1); yield 0.5;
  }
  *mv_summon() {
    this.change("special"); this.fig.play("roar", true); Audio2.play("boss_roar", 0.05, -4); yield 0.6;
    this.minions = this.minions.filter((m) => !m.dead); const ids = this.data.minions || []; if (!ids.length || this.minions.length >= 3) return;
    for (let i = 0; i < 2; i++) { const x = i === 0 ? this.arena[0] + 60 : this.arena[1] - 60; const e = this.L.spawnEnemy(ids[randi(0, ids.length - 1)], x, this.floorY, { facing: i === 0 ? 1 : -1, alerted: true }); if (e) { this.minions.push(e); FX.smoke(x, this.floorY - 30, 10, 1); } }
    yield 0.6;
  }
  *mv_volley() { this.face(); yield* this.anim("volley"); }
  *mv_arrow_rain() {
    this.change("special"); this.fig.play("cast", true); Audio2.play("bow", 0.05); yield 0.5; if (!this.tValid()) return;
    const n = 5 + this.phase * 2, xs = [];
    for (let i = 0; i < n; i++) { const x = clamp(this.target.x + (i - Math.floor(n / 2)) * 85 + rand(-20, 20), this.arena[0] + 20, this.arena[1] - 20); xs.push(x); FX.warning(x, this.floorY, 1, 0.8); }
    yield 0.9;
    for (const x of xs) { this.L.projectiles.push(new Projectile(x, this.floorY - 620, { kind: "rain_arrow", team: "enemy", vx: 0, vy: 950, damage: 11 * this.dmgMult, life: 1.2, source: this, bw: 10, bh: 26, kb: [60, -100] })); Audio2.play("arrow", 0.2, -10); yield 0.06; }
    yield 0.4;
  }
  *mv_traps() {
    this.change("special"); this.fig.play("shuriken_throw", true); yield 0.3; if (!this.tValid()) return;
    const o = this.fig.hand(this.x, this.y, false);
    for (let i = 0; i < 4 + this.phase; i++) this.L.projectiles.push(new Projectile(o[0], o[1], { kind: "caltrop", team: "enemy", vx: (this.target.x - o[0] + rand(-140, 140)) / 0.75, vy: -360, grav: 900, damage: 8, life: 8, source: this, bw: 14, bh: 10, kb: [90, -220] }));
    Audio2.play("shuriken"); yield 0.5;
  }
  *mv_shockwave() { this.face(); yield* this.anim("heavy"); this.wave(this.x, this.facing, 520 + this.phase * 80); if (this.phase >= 2) { yield 0.35; this.wave(this.x, this.facing, 620); } yield 0.3; }
  *mv_dash_slash() {
    this.face(); this.change("special"); this.fig.play("block", true); const h = this.fig.headPos(this.x, this.y); FX.sparks(h[0], h[1], 10);
    FX.warning(this.x + this.facing * 200, this.floorY, 0.6, 1.4); Audio2.play("clang", 0.05, -8); yield 0.55;
    this.fig.play("dash", true); this.box.start({ damage: 20 * this.dmgMult, kind: "heavy", kb: [320, -200], source: this, guardBreak: this.phase >= 2 }, [-50, -90, 120, 90], 0.5, this.facing);
    Audio2.play("slash_heavy"); this.invuln = 0.4; let t = 0;
    while (t < 0.42) { this.vx = this.facing * 900; if (this.x < this.arena[0] + 40 || this.x > this.arena[1] - 40) break; if (Math.random() < 0.3) FX.smoke(this.x, this.y - 40, 2, 0.6, [26, 23, 23], 0.5); yield 0; t += 1 / 60; }
    this.vx = 0; this.box.active = false; this.fig.play("attack_combo", true); yield 0.45;
  }
  *mv_guard() {
    this.face(); this.startDefend(); this.defendT = 1.3; const before = this.guardHits; let t = 0;
    while (this.state === "defend" && t < 1.3) { yield 0; t += 1 / 60; if (this.guardHits > before) { this.guardHits = 0; FX.text(this.x, this.y - 150, "Revide!", BLOOD); yield* this.anim(this.data.riposte || "slash1"); return; } }
    this.guardHits = 0;
  }
  *mv_spirit_orbs() {
    this.change("special"); this.fig.play("cast", true); Audio2.play("teleport", 0.05); yield 0.5;
    for (let i = 0; i < 3 + this.phase; i++) { const a = -Math.PI / 2 + (i - 1) * 0.6; this.L.projectiles.push(new Projectile(this.x, this.y - 110, { kind: "spirit", team: "enemy", vx: Math.cos(a) * 240, vy: Math.sin(a) * 240, damage: 10 * this.dmgMult, life: 4.5, homing: this.target, homingStr: 1.6 + this.phase * 0.6, source: this, bw: 18, bh: 18, hitsWorld: false, kb: [120, -120] })); yield 0.18; }
    yield 0.6;
  }
  *mv_teleport_strike() {
    this.change("special"); this.fig.play("teleport", true); Audio2.play("teleport"); FX.smoke(this.x, this.y - 40, 14, 1.3, [20, 18, 20], 0.7); yield 0.3;
    this.baseAlpha = 0; this.hidden = true; yield 0.35;
    if (this.tValid()) { this.x = clamp(this.target.x - (this.target.facing || 1) * 90, this.arena[0] + 50, this.arena[1] - 50); this.y = this.floorY; this.vx = this.vy = 0; }
    this.face(); this.baseAlpha = 1; this.hidden = false; this.fig.play("appear", true); FX.smoke(this.x, this.y - 40, 14, 1.3, [20, 18, 20], 0.7); yield 0.25;
    this.face(); yield* this.anim(this.data.backstab || "finisher");
  }
  *mv_staff_spin() { this.face(); yield* this.approach(180, 1); const a = this.named("spin"); if (!a) return; this.startAttack(a); let t = 0; while (this.state === "attack" && t < 2) { this.vx = this.facing * (240 + this.phase * 60); yield 0; t += 1 / 60; } this.vx = 0; }
  *mv_dragon_wave() {
    this.change("special"); this.fig.play("cast", true); Audio2.play("boss_roar", 0.1, -2); const high = Math.random() < 0.5;
    FX.text(this.x, this.y - 170, high ? "Abaixe-se!" : "Pule!", BLOOD, 1.4, 1); yield 0.7;
    const d = this.facing, sx = d > 0 ? this.arena[0] + 10 : this.arena[1] - 10;
    this.L.projectiles.push(new Projectile(sx, this.floorY - (high ? 70 : 22), { kind: "dragon", team: "enemy", vx: d * 560, vy: 0, damage: 22 * this.dmgMult, life: 3.6, source: this, bw: 120, bh: high ? 34 : 30, hitsWorld: false, kb: [300, -260], size: 1.4 }));
    Game.shake(4, 1); yield 1;
  }
  *mv_ink_pillars() {
    this.change("special"); this.fig.play("cast", true); Audio2.play("gong", 0.05, -6); yield 0.4; if (!this.tValid()) return;
    const d = this.target.x > this.x ? 1 : -1;
    for (let i = 0; i < 6 + this.phase; i++) { const x = this.x + d * (90 + i * 95); if (x < this.arena[0] || x > this.arena[1]) break; this.hazard({ kind: "pillar", damage: 16 * this.dmgMult, w: 56, h: 230, delay: 0.55 + i * 0.13, active: 0.45, kb: [120, -420] }, x, this.floorY); }
    yield 0.9;
  }
  *mv_dragon_dive() {
    if (!this.tValid()) return; this.change("special"); this.vy = -1250; this.fig.play("double_jump", true); Audio2.play("dash"); yield 0.45;
    this.baseAlpha = 0; this.hidden = true; this.noGravity = true; this.vy = 0; const mx = clamp(this.target.x, this.arena[0] + 50, this.arena[1] - 50); FX.warning(mx, this.floorY, 0.8, 1.6); yield 0.75;
    this.x = mx; this.y = this.floorY - 560; this.vy = 1500; this.noGravity = false; this.baseAlpha = 1; this.hidden = false; this.fig.play("air_attack", true);
    let t = 0; while (!this.onFloor && t < 1.5) { this.vy = 1500; yield 0; t += 1 / 60; }
    this.slam(1.3);
    if (this.phase >= 2) for (const dd2 of [-1, 1]) for (let i = 0; i < 3; i++) this.hazard({ kind: "pillar", damage: 14 * this.dmgMult, w: 50, h: 200, delay: 0.35 + i * 0.15, active: 0.4 }, this.x + dd2 * (120 + i * 100), this.floorY);
    yield 0.7;
  }
  gravScale() { return this.noGravity ? 0 : 1; }
  hurtRect() { return this.hidden ? { x: -9999, y: -9999, w: 0, h: 0 } : super.hurtRect(); }
  // ---------------------------------------------------------- dano e fases
  takeHit(info) { if (!this.fighting && !this.dead) this.L.triggerBoss(); return super.takeHit(info); }
  applyDamage(dmg, info) {
    this.hp -= dmg; this.fig.flash = 1; FX.splash(this.x, this.y - 60, info.dir || -this.facing, 8, 1); FX.number(this.x, this.y - 150, dmg, BLOOD, 1.2);
    Hud.bossHp(Math.max(this.hp, 0), this.maxHp);
    if (this.hp <= 0) { this.die(true); return; }
    const ps = this.data.phases, nx = this.phase + 1;
    if (nx < ps.length && this.hp / this.maxHp <= ps[nx].hp) this.enterPhase(nx);
  }
  enterPhase(n) {
    this.phase = n; this.box.active = false; this.invuln = 1.6; this.baseAlpha = 1; this.hidden = false; this.noGravity = false;
    Game.shake(8, 0.8); FX.impact(this.x, this.y - 60, 3, BLOOD); Hud.message(this.ph().message || "O inimigo enfurece!", BLOOD);
    const self = this; this.run((function* () { self.change("special"); self.fig.play("roar", true); Audio2.play("boss_roar"); yield 1.4; self.think = 0.4; })());
  }
  stagger(t) { if (this.dead || (this.busy && this.state === "special")) return; this.cancel(); super.stagger(t * 0.6); }
  die(drop) {
    if (this.dead) return; this.cancel(); this.fighting = false; this.hidden = false; this.baseAlpha = 1;
    for (const m of this.minions) if (!m.dead) m.die(false);
    Game.hitStop(0.6); Game.shake(12, 0.8); FX.impact(this.x, this.y - 60, 4, BLOOD); FX.splash(this.x, this.y - 60, -this.facing, 30, 1.6);
    super.die(drop); this.L.onBossDefeated();
  }
  st_death(dt) { this.stop(dt); if (this.stateTime > 3) { this.baseAlpha = Math.max(0, this.baseAlpha - dt * 0.8); if (this.baseAlpha <= 0) this.remove = true; } }
  dropLoot() { const c = this.data.coins; let n = randi(c[0], c[1]); while (n > 0) { const v = Math.min(n, 5); this.L.spawnPickup("coin", this.x + rand(-60, 60), this.y - 60, v); n -= v; } this.L.spawnPickup("scroll", this.x, this.y - 60, Math.floor(this.data.xp / 2)); }
}
