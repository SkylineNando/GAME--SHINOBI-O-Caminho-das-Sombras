// ============================================================================
// KAGE — protagonista (máquina de estados de movimento e combate)
// ============================================================================
const KATK = {
  light1: { anim: "attack_light", dmg: "dmg_light", kind: "light", rect: [6, -74, 66, 60], active: 0.1, kb: [150, -60], lunge: 120, next: "light2", sfx: "slash" },
  light2: { anim: "attack_light2", dmg: "dmg_light", kind: "light", rect: [4, -84, 66, 74], active: 0.1, kb: [150, -120], lunge: 120, next: "light3", sfx: "slash" },
  light3: { anim: "attack_combo", dmg: "dmg_combo", kind: "heavy", rect: [0, -80, 84, 66], active: 0.12, kb: [360, -180], lunge: 220, next: "", sfx: "slash_heavy" },
  heavy: { anim: "attack_heavy", dmg: "dmg_heavy", kind: "heavy", rect: [4, -90, 78, 90], active: 0.12, kb: [420, -220], lunge: 160, next: "", sfx: "slash_heavy", gb: true },
  spin: { anim: "attack_spin", dmg: "dmg_spin", kind: "special", rect: [-80, -82, 160, 74], active: 0.08, kb: [260, -140], lunge: 0, next: "", sfx: "slash", energy: "spin_cost", gb: true },
  air: { anim: "air_attack", dmg: "dmg_air", kind: "light", rect: [-6, -70, 76, 92], active: 0.12, kb: [160, 120], lunge: 0, next: "", sfx: "slash" },
  counter: { anim: "counter_attack", dmg: "dmg_counter", kind: "heavy", rect: [0, -78, 92, 64], active: 0.12, kb: [480, -200], lunge: 320, next: "", sfx: "slash_heavy", gb: true },
};

class MeleeBox {
  constructor() { this.active = false; this.hit = new Set(); }
  start(info, rect, dur, facing) { this.info = info; this.rect = rect; this.timer = dur; this.facing = facing; this.active = true; this.hit.clear(); }
  world(x, y) { const r = this.rect; const x0 = this.facing > 0 ? x + r[0] : x - r[0] - r[2]; return { x: x0, y: y + r[1], w: r[2], h: r[3] }; }
  update(dt, owner, targets, cb) {
    if (!this.active) return;
    this.timer -= dt; const wr = this.world(owner.x, owner.y);
    for (const t of targets) {
      if (!t || t.dead || this.hit.has(t) || !overlap(wr, t.hurtRect())) continue;
      this.hit.add(t);
      const info = Object.assign({}, this.info, { dir: this.facing, x: wr.x + wr.w / 2, y: wr.y + wr.h / 2 });
      const res = t.takeHit(info); if (cb) cb(t, res, info);
    }
    if (this.timer <= 0) this.active = false;
  }
}

class Kage {
  constructor(L, x, y) {
    this.L = L; this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.w = 22; this.h = 62; this.onFloor = false;
    this.st = DATA.kage.stats; this.state = "idle"; this.stateTime = 0; this.facing = 1;
    this.maxHp = Prog.maxHp(); this.hp = this.maxHp; this.maxEnergy = Prog.maxEnergy(); this.energy = this.maxEnergy;
    this.dead = false; this.stealthed = false; this.locked = false; this.crouched = false;
    this.fig = new Figure(Prog.d.outfit); this.fig.trailCol = hex(Prog.katana().trail || "#111111");
    this.fig.onEvent = (e) => this.onAnimEvent(e); this.fig.onFinish = (n) => this.onAnimFinished(n);
    this.box = new MeleeBox();
    Object.assign(this, { invuln: 0, coyote: 0, jumpBuf: 0, atkBuf: "", atkBufT: 0, airJumps: 1, airDash: false, airAtks: 0, flip: 0, runTime: 0,
      atkId: "", atk: null, hitAt: -1, blockTime: 0, regenDelay: 0, dropTimer: 0, noiseT: 0, stepT: 0, safeT: 0, fallStart: y, kills: 0,
      shake: 0, shakeT: 0, ladderHere: null, ladder: null });
    this.spawn = { x, y }; this.lastSafe = { x, y };
  }
  s(k) { return this.st[k] || 0; }
  bodyRect() { return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h }; }
  hurtRect() { const h = this.crouched ? 32 : 58; return { x: this.x - 10, y: this.y - h - 2, w: 20, h }; }
  change(s) { if (this.state === "attack" && s !== "attack") this.box.active = false; if (this.state === "climb" && s !== "climb") this.noOneway = false; this.state = s; this.stateTime = 0; this.fig.speed = 1; }
  ix() { return this.dead || this.locked ? 0 : Input.getX(); }
  iy() { return this.dead || this.locked ? 0 : Input.getY(); }
  pressed(a) { return !this.dead && !this.locked && Input.justPressed(a); }
  setCrouch(on) { if (on === this.crouched) return; this.crouched = on; this.h = on ? 36 : 62; }
  canStand() { const r = { x: this.x - 9, y: this.y - 61, w: 18, h: 60 }; return !this.L.solids.some((s) => overlap(r, s)); }

  update(dt) {
    this.stateTime += dt;
    for (const k of ["invuln", "coyote", "jumpBuf", "atkBufT", "flip", "regenDelay", "noiseT"]) this[k] = Math.max(0, this[k] - dt);
    if (this.atkBufT <= 0) this.atkBuf = "";
    if (this.dropTimer > 0) this.dropTimer -= dt;
    if (!this.dead && !this.locked) {
      if (Input.justPressed("jump")) this.jumpBuf = this.s("jump_buffer");
      if (Input.justPressed("light")) this.buffer("light");
      if (Input.justPressed("heavy")) this.buffer("heavy");
      if (Input.justPressed("special")) this.buffer("spin");
      if (Input.justPressed("stealth")) this.setStealth(!this.stealthed);
      if (Input.justPressed("elixir")) this.useElixir();
    }
    switch (this.state) {
      case "idle": case "move": this.stGround(dt); break;
      case "air": this.stAir(dt); break;
      case "land": this.gravity(dt); this.vx = moveToward(this.vx, 0, this.s("friction") * 1.5 * dt); if (this.common()) break; if (this.stateTime > 0.14 || Math.abs(this.ix()) > 0.1) this.change("idle"); break;
      case "crouch": this.stCrouch(dt); break;
      case "climb": this.stClimb(dt); break;
      case "slide": this.stSlide(dt); break;
      case "dash": this.vy = 0; this.vx = this.facing * this.s("dash_speed"); if (this.stateTime >= this.s("dash_time")) { this.vx = this.facing * this.s("run_speed"); this.fallStart = this.y; this.change(this.onFloor ? "idle" : "air"); } break;
      case "dodge": this.gravity(dt, 0.8); this.vx = -this.facing * this.s("dodge_speed") * Math.max(0.2, 1 - this.stateTime / this.s("dodge_time")); if (this.stateTime >= this.s("dodge_time")) this.change(this.onFloor ? "idle" : "air"); break;
      case "attack": this.stAttack(dt); break;
      case "block": this.stBlock(dt); break;
      case "throw": if (this.onFloor) { this.gravity(dt); this.vx = moveToward(this.vx, 0, this.s("friction") * dt); } else this.gravity(dt, 0.6); if (this.stateTime > 0.42) this.change(this.onFloor ? "idle" : "air"); break;
      case "hurt": this.gravity(dt); this.vx = moveToward(this.vx, 0, 900 * dt); if (this.stateTime > 0.32) this.change(this.onFloor ? "idle" : "air"); break;
      default: this.gravity(dt); this.vx = moveToward(this.vx, 0, this.s("friction") * dt);
    }
    this.dropTimer = Math.max(0, this.dropTimer);
    moveBody(this, dt, this.L);
    this.box.update(dt, this, this.L.enemies, (t, r, i) => this.onHitLanded(t, r, i));
    this.post(dt);
    this.visuals(dt);
  }
  buffer(k) { this.atkBuf = k; this.atkBufT = 0.25; }
  gravity(dt, m = 1) { this.vy = Math.min(this.vy + this.s("gravity") * m * dt, this.s("max_fall")); }
  horizontal(dt, speed, accel) { const ix = this.ix(); if (Math.abs(ix) > 0.1) { this.vx = moveToward(this.vx, ix * speed, accel * dt); this.facing = ix > 0 ? 1 : -1; } else this.vx = moveToward(this.vx, 0, this.s("friction") * dt); }
  common() {
    if (this.jumpBuf > 0) { if (this.iy() > 0.5 && this.floorOneway) { this.drop(); this.jumpBuf = 0; return true; } this.jump(); return true; }
    if (this.atkBuf) return this.attackFromBuffer();
    if (this.pressed("dash")) return this.startDash();
    if (this.pressed("dodge")) return this.startDodge();
    if (!this.locked && Input.isDown("block")) { this.change("block"); this.blockTime = 0; this.fig.play("block", true); return true; }
    if (this.pressed("shuriken")) return this.startThrow("shuriken");
    if (this.pressed("kunai")) return this.startThrow("kunai");
    const lad = this.ladderHere;
    if (lad) { const iy = this.iy(); if ((iy < -0.5 && this.y > lad.top + 4) || (iy > 0.5 && this.y < lad.bottom - 8)) { this.startClimb(lad); return true; } }
    return false;
  }
  stGround(dt) {
    if (!this.onFloor) { this.coyote = this.s("coyote_time"); this.fallStart = this.y; this.change("air"); return; }
    this.airJumps = 1; this.airDash = false; this.airAtks = 0;
    if (this.common()) return;
    const ix = this.ix();
    if (this.iy() > 0.5) { if (this.runTime > 0.3 && Math.abs(this.vx) > this.s("walk_speed")) this.startSlide(); else { this.setCrouch(true); this.change("crouch"); } return; }
    this.runTime = Math.abs(ix) > 0.1 ? this.runTime + dt : 0;
    let speed = this.runTime < 0.35 ? this.s("walk_speed") : this.s("run_speed"); if (this.stealthed) speed = this.s("walk_speed") * 0.85;
    this.gravity(dt);
    this.horizontal(dt, speed, this.s("accel"));
    const moving = Math.abs(this.vx) > 12;
    if (moving && this.state !== "move") this.change("move"); else if (!moving && this.state !== "idle") this.change("idle");
    if (moving) { this.stepT -= dt * (this.runTime >= 0.35 ? 1.6 : 1); if (this.stepT <= 0) { this.stepT = 0.3; if (!this.stealthed) { Audio2.play("step", 0.2, -14); if (this.runTime >= 0.35) { this.noise(200); FX.dust(this.x - this.facing * 8, this.y, 2, 0.6); } } } }
  }
  stAir(dt) {
    this.gravity(dt);
    this.horizontal(dt, Math.max(this.s("run_speed"), Math.abs(this.vx) * 0.98), this.s("air_accel"));
    if (Input.justReleased("jump") && this.vy < -200 && this.flip <= 0) this.vy *= 0.55;
    if (this.jumpBuf > 0) { if (this.coyote > 0) return this.jump(); if (this.airJumps > 0) return this.doubleJump(); }
    if (this.atkBuf) {
      if (this.atkBuf === "light" && this.airAtks < 2) { this.atkBuf = ""; this.airAtks++; return this.startAttack("air"); }
      if (this.atkBuf === "spin") { this.attackFromBuffer(); return; }
      this.atkBuf = "";
    }
    if (this.pressed("dash") && !this.airDash) { this.startDash(); return; }
    if (this.pressed("shuriken")) { this.startThrow("shuriken"); return; }
    if (this.pressed("kunai")) { this.startThrow("kunai"); return; }
    if (this.ladderHere && this.iy() < -0.5) { this.startClimb(this.ladderHere); return; }
    if (this.onFloor && this.vy >= 0) this.land();
  }
  land() {
    const fh = this.y - this.fallStart; Audio2.play("land", 0.1, -6);
    if (fh > 140) { FX.dust(this.x, this.y, 8, 1); if (!this.stealthed) this.noise(260); this.change("land"); }
    else { FX.dust(this.x, this.y, 3, 0.6); this.change(Math.abs(this.ix()) < 0.1 ? "idle" : "move"); }
  }
  stCrouch(dt) {
    this.gravity(dt);
    if (!this.onFloor) { this.setCrouch(false); this.change("air"); return; }
    if (this.jumpBuf > 0 && this.floorOneway) { this.setCrouch(false); this.drop(); this.jumpBuf = 0; return; }
    if (this.pressed("dodge")) { if (this.canStand()) { this.setCrouch(false); this.startDodge(); } return; }
    if (this.atkBuf && this.canStand()) { this.setCrouch(false); this.attackFromBuffer(); return; }
    this.horizontal(dt, this.s("crawl_speed"), this.s("accel"));
    if (this.iy() < 0.5 && this.canStand()) { this.setCrouch(false); this.change("idle"); }
  }
  startClimb(lad) { this.setCrouch(false); this.ladder = lad; this.noOneway = true; this.change("climb"); this.vx = this.vy = 0; this.fig.play("climb", true); }
  stClimb(dt) {
    const iy = this.iy(), lad = this.ladder;
    this.x = lerp(this.x, lad.x, Math.min(1, dt * 14)); this.vx = 0; this.vy = iy * this.s("climb_speed");
    this.fig.speed = Math.abs(iy) > 0.1 ? 1 : 0;
    if (!this.ladderHere) { this.change("air"); this.fallStart = this.y; return; }
    if (iy < -0.1 && this.y <= lad.top + 2) { this.y = lad.top - 1; this.vy = 0; this.change("idle"); return; }
    if (iy > 0.1 && this.y >= lad.bottom - 1) { this.change("idle"); return; }
    if (this.jumpBuf > 0) { this.jumpBuf = 0; const ix = this.ix(); if (Math.abs(ix) > 0.1) this.facing = ix > 0 ? 1 : -1; this.vx = this.facing * 220; this.vy = this.s("jump_velocity") * 0.8; this.change("air"); this.fallStart = this.y; }
  }
  stSlide(dt) {
    this.gravity(dt); this.vx = moveToward(this.vx, 0, this.s("slide_speed") * 1.3 * dt);
    if (this.stateTime > 0.08 && this.stateTime < 0.4 && Math.random() < 0.3 && !this.stealthed) FX.dust(this.x + this.facing * 10, this.y, 1, 0.7);
    if (this.jumpBuf > 0 && this.canStand()) { this.setCrouch(false); this.jump(); return; }
    if (this.stateTime >= this.s("slide_time") || Math.abs(this.vx) < 40 || !this.onFloor) { if (this.canStand()) { this.setCrouch(false); this.change(this.onFloor ? "idle" : "air"); } else this.change("crouch"); }
  }
  stAttack(dt) {
    if (this.atkId === "air") { this.gravity(dt, 0.55); this.horizontal(dt, this.s("run_speed") * 0.8, this.s("air_accel") * 0.5); if (this.onFloor && this.stateTime > 0.1) { this.endAttack(); return; } }
    else { this.gravity(dt); this.vx = moveToward(this.vx, 0, this.s("friction") * 1.2 * dt); }
    if (this.atkBuf && this.hitAt >= 0 && this.stateTime - this.hitAt > 0.07) {
      if (this.atkBuf === "light" && this.atk.next) { this.atkBuf = ""; return this.startAttack(this.atk.next); }
      if (this.atkBuf === "heavy" && this.atkId.startsWith("light")) { this.atkBuf = ""; return this.startAttack("heavy"); }
    }
    if (this.pressed("dodge") && this.hitAt >= 0) { this.startDodge(); return; }
    if (this.stateTime > 1.5) this.endAttack();
  }
  stBlock(dt) {
    this.gravity(dt); this.vx = moveToward(this.vx, 0, this.s("friction") * dt); this.blockTime += dt;
    const ix = this.ix(); if (Math.abs(ix) > 0.5 && this.blockTime < 0.05) this.facing = ix > 0 ? 1 : -1;
    if (!Input.isDown("block") || !this.onFloor) { this.change(this.onFloor ? "idle" : "air"); return; }
    if (this.jumpBuf > 0) { this.jump(); return; }
    if (this.pressed("dodge")) this.startDodge();
  }
  jump() { this.jumpBuf = 0; this.coyote = 0; this.vy = this.s("jump_velocity"); this.fallStart = this.y; this.change("air"); this.fig.play("jump", true); Audio2.play("jump", 0.1, -6); FX.dust(this.x, this.y, 4, 0.7); }
  doubleJump() { this.jumpBuf = 0; this.airJumps--; this.vy = this.s("double_jump_velocity"); this.flip = 0.38; this.fallStart = this.y; this.fig.play("double_jump", true); Audio2.play("dodge", 0.1, -6); FX.smoke(this.x, this.y - 10, 5, 0.6); }
  startDash() {
    const cost = Prog.has("shadow_step") ? 0 : this.s("dash_cost"); if (this.energy < cost) { this.noEnergy(); return false; }
    this.useEnergy(cost); if (!this.onFloor) this.airDash = true;
    const ix = this.ix(); if (Math.abs(ix) > 0.1) this.facing = ix > 0 ? 1 : -1;
    this.change("dash"); this.fig.play("dash", true); if (Prog.has("shadow_step")) this.invuln = Math.max(this.invuln, 0.2);
    Audio2.play("dash", 0.1, -4); FX.speed(this.x, this.y, this.facing); FX.smoke(this.x, this.y - 30, 4, 0.5); return true;
  }
  startDodge() { if (this.energy < this.s("dodge_cost")) { this.noEnergy(); return false; } this.useEnergy(this.s("dodge_cost")); this.change("dodge"); this.fig.play("dodge", true); this.invuln = Math.max(this.invuln, 0.32); Audio2.play("dodge", 0.1, -4); FX.dust(this.x, this.y, 5, 0.8); return true; }
  startSlide() { this.setCrouch(true); this.change("slide"); this.vx = this.facing * this.s("slide_speed"); this.fig.play("slide", true); Audio2.play("dash", 0.1, -8); }
  attackFromBuffer() {
    const b = this.atkBuf; this.atkBuf = "";
    if (b === "light") this.startAttack("light1");
    else if (b === "heavy") this.startAttack("heavy");
    else if (b === "spin") { if (!Prog.has("spin_attack")) { Hud.message("Golpe Giratório: compre na loja (Equipamentos).", [77, 77, 77]); return false; } if (this.energy < this.s("spin_cost")) { this.noEnergy(); return false; } this.startAttack("spin"); }
    return true;
  }
  startAttack(id) {
    this.atkId = id; this.atk = KATK[id]; if (this.atk.energy) this.useEnergy(this.s(this.atk.energy));
    this.change("attack"); this.hitAt = -1;
    const ix = this.ix(); if (Math.abs(ix) > 0.3 && id !== "air") this.facing = ix > 0 ? 1 : -1;
    this.fig.play(this.atk.anim, true);
    if (this.onFloor) this.vx = this.facing * this.atk.lunge; else if (id === "air") this.vy = Math.min(this.vy, -40);
    this.L.onPlayerAttack(this.x, this.y, this.atk.kind);
    if (!this.stealthed) this.noise(260);
    if (id === "spin") FX.ring(this.x, this.y);
    if (id === "counter") this.invuln = Math.max(this.invuln, 0.45);
  }
  endAttack() { this.box.active = false; if (this.stealthed && this.hitAt >= 0) this.setStealth(false); this.atkId = ""; this.change(this.onFloor ? "idle" : "air"); }
  startThrow(kind) {
    if (kind === "kunai") { if (!Prog.hasWeapon("kunai")) { Hud.message("Kunai bloqueada: aprenda a Arte da Kunai na loja.", [77, 77, 77]); return false; } if (Prog.count("kunai") <= 0) { Hud.message("Sem kunais!", [153, 26, 26]); return false; } }
    else if (Prog.count("shuriken") <= 0) { Hud.message("Sem shurikens!", [153, 26, 26]); return false; }
    this.change("throw"); this.atkId = kind; this.fig.play(kind === "shuriken" ? "shuriken_throw" : "kunai_throw", true);
    const ix = this.ix(); if (Math.abs(ix) > 0.3) this.facing = ix > 0 ? 1 : -1; return true;
  }
  throwProjectile() {
    const kind = this.atkId; if ((kind !== "shuriken" && kind !== "kunai") || !Prog.consume(kind)) return;
    const ox = this.x + this.facing * 18, oy = this.y - 52; let dmg = this.s("dmg_" + kind) * Prog.dmgMult(); if (this.stealthed) dmg *= 1.5;
    if (kind === "shuriken") {
      const angs = Prog.has("triple_shuriken") ? [-0.14, 0, 0.14] : [0];
      for (const a of angs) this.L.projectiles.push(new Projectile(ox, oy, { kind: "shuriken", team: "player", vx: Math.cos(a) * 720 * this.facing, vy: Math.sin(a) * 720, damage: dmg, life: 1.2, source: this, kb: [80, -40] }));
      Audio2.play("shuriken");
    } else { this.L.projectiles.push(new Projectile(ox, oy, { kind: "kunai", team: "player", vx: this.facing * 900, vy: 0, damage: dmg, pierce: 1, life: 1.2, source: this, bw: 22, bh: 8, kb: [200, -80] })); Audio2.play("kunai"); }
    if (this.stealthed) this.setStealth(false);
  }
  useElixir() { if (this.dead || this.hp >= this.maxHp) return; if (!Prog.consume("elixir")) { Hud.message("Sem elixires.", [102, 102, 102]); return; } this.heal(this.maxHp * 0.45); FX.text(this.x, this.y - 100, "Elixir", [38, 115, 51]); }
  heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); Audio2.play("heal"); FX.leaves(this.x, this.y - 40, 8, true); }
  addEnergy(n) { this.energy = Math.min(this.maxEnergy, this.energy + n); }
  useEnergy(n) { this.energy = Math.max(0, this.energy - n); this.regenDelay = 0.7; }
  noEnergy() { Hud.message("Energia insuficiente", [77, 77, 115]); }
  setStealth(on) { if (on && this.energy < 10) { this.noEnergy(); return; } if (on === this.stealthed) return; this.stealthed = on; Audio2.play("stealth", 0.05, -4); FX.smoke(this.x, this.y - 30, 6, 0.7); }
  drop() { this.dropTimer = 0.28; this.vy = 120; this.y += 2; this.fallStart = this.y; this.change("air"); }
  noise(r) { if (this.noiseT > 0) return; this.noiseT = 0.35; this.L.onNoise(this.x, this.y, r); }

  post(dt) {
    if (this.onFloor) { this.safeT += dt; if (this.safeT > 0.4 && this.state !== "hurt" && this.state !== "dodge" && !this.floorOneway) this.lastSafe = { x: this.x, y: this.y }; } else this.safeT = 0;
    if (this.stealthed) { this.energy -= this.s("stealth_drain") * Prog.stealthBonus() * dt; if (this.energy <= 0) { this.energy = 0; this.setStealth(false); } }
    else if (this.regenDelay <= 0 && this.state !== "block") this.energy = Math.min(this.maxEnergy, this.energy + this.s("energy_regen") * dt);
    if (!this.dead && this.y > this.L.killY) {
      Audio2.play("hurt"); this.hp -= this.maxHp * 0.2;
      if (this.hp <= 0) { this.hp = 0; this.die(); return; }
      this.x = this.lastSafe.x; this.y = this.lastSafe.y - 4; this.vx = this.vy = 0; this.invuln = 1.5; this.change("idle"); FX.smoke(this.x, this.y - 30, 10, 1);
    }
  }
  visuals(dt) {
    const f = this.fig; f.facing = this.facing; f.moveSpeed = Math.abs(this.vx) / this.s("run_speed");
    let a = this.stealthed ? 0.42 : 1; if (this.invuln > 0 && !["dodge", "dash", "attack"].includes(this.state)) a *= 0.55 + 0.45 * Math.sin(performance.now() * 0.03);
    f.alpha = a; f.shadow = this.onFloor;
    switch (this.state) {
      case "idle": if (this.stealthed) { f.play("stealth"); f.speed = 0; } else f.play("idle"); break;
      case "move": if (this.stealthed) { f.play("stealth"); f.speed = 1; } else f.play(this.runTime < 0.35 ? "walk" : "run"); break;
      case "air": f.play(this.flip > 0 ? "double_jump" : this.vy < -60 ? "jump" : "fall"); break;
      case "land": f.play("landing"); break;
      case "crouch": f.play(Math.abs(this.vx) > 10 ? "crawl" : "crouch"); break;
      case "climb": f.play("climb"); break;
      case "block": f.play("block"); break;
      case "hurt": f.play("hurt"); break;
      case "dead": f.play("death"); break;
      case "victory": f.play("victory"); break;
    }
    f.update(dt);
    if (this.shakeT > 0) this.shakeT -= dt;
  }
  onAnimEvent(ev) {
    if (ev === "hit" && this.state === "attack" && this.atk) {
      this.hitAt = this.stateTime; const a = this.atk; let dmg = this.s(a.dmg) * Prog.dmgMult();
      if (this.atkId === "counter" && Prog.has("counter_master")) dmg *= 1.4;
      this.box.start({ damage: dmg, kind: a.kind, kb: a.kb, source: this, guardBreak: !!a.gb, stealth: this.stealthed, stealthMult: this.s("stealth_mult") }, a.rect, a.active, this.facing);
      Audio2.play(a.sfx, 0.1, -2);
    } else if (ev === "throw" && this.state === "throw") this.throwProjectile();
    else if (ev === "spark") FX.sparks(this.x + this.facing * 24, this.y - 60, 10);
  }
  onAnimFinished(n) {
    if (this.state === "attack" && this.atk && n === this.atk.anim) { if (this.atkBuf === "light" && this.atk.next) { this.atkBuf = ""; this.startAttack(this.atk.next); return; } this.endAttack(); }
    else if (this.state === "throw" && n.endsWith("_throw")) this.change(this.onFloor ? "idle" : "air");
  }
  onHitLanded(t, res, info) {
    if (res === "hit" || res === "dead") { this.addEnergy(3); const heavy = info.kind !== "light"; Audio2.play(heavy ? "hit_heavy" : "hit", 0.12); Game.hitStop(heavy ? 0.07 : 0.04); Game.shake(heavy ? 5 : 2.5, 0.15); }
    else if (res === "blocked") { Audio2.play("clang", 0.12); FX.sparks(info.x, info.y, 10); this.vx = -this.facing * 160; }
    else if (res === "assassinated") { Audio2.play("hit_heavy"); Game.hitStop(0.18); Game.shake(8, 0.25); FX.text(this.x, this.y - 110, "Ataque Furtivo!", BLOOD, 1.3); }
  }
  takeHit(info) {
    if (this.dead || this.state === "victory") return "none";
    if (this.invuln > 0) return "dodged";
    const src = info.source; const sx = src && !src.dead && src.x !== undefined ? src.x : info.x;
    const front = (sx - this.x) * this.facing >= -6; const dmg = info.damage;
    if (this.stealthed) this.setStealth(false);
    if (this.state === "block" && front) {
      const pw = this.s("parry_window") * (Prog.has("counter_master") ? 1.6 : 1);
      if (this.blockTime <= pw && info.kind !== "hazard") {
        Audio2.play("parry"); FX.sparks(this.x + this.facing * 20, this.y - 60, 16); FX.text(this.x, this.y - 110, "Contra-ataque!", BLOOD, 1.1); Game.hitStop(0.12);
        if (src && src.stagger) src.stagger(1.2);
        this.startAttack("counter"); return "parried";
      }
      if (!info.guardBreak) {
        this.hp -= dmg * this.s("block_chip"); this.useEnergy(dmg * 0.7); Audio2.play("clang", 0.1); FX.sparks(this.x + this.facing * 20, this.y - 60, 8); this.vx = -this.facing * 140;
        if (this.hp <= 0) { this.die(); return "dead"; }
        if (this.energy <= 0) { Hud.message("Guarda quebrada!", BLOOD); this.hurt(info); }
        return "blocked";
      }
      Hud.message("Guarda quebrada!", BLOOD);
    }
    this.hp -= dmg; FX.splash(this.x, this.y - 50, info.dir || -this.facing, 8, 0.8); FX.number(this.x, this.y - 90, dmg, BLOOD); Audio2.play("hurt", 0.1); Game.shake(6, 0.2);
    if (this.hp <= 0) { this.hp = 0; this.die(); return "dead"; }
    this.hurt(info); return "hit";
  }
  hurt(info) { if (this.crouched && this.canStand()) this.setCrouch(false); this.change("hurt"); this.fig.play("hurt", true); this.fig.flash = 1; this.invuln = this.s("hurt_iframes"); const kb = info.kb || [160, -120], d = info.dir || -this.facing; this.vx = kb[0] * d; this.vy = Math.min(kb[1], -80); }
  stagger() {}
  die() {
    if (this.dead) return; this.dead = true; this.box.active = false; this.setCrouch(false); this.change("dead"); this.fig.play("death", true);
    Audio2.play("player_die"); FX.splash(this.x, this.y - 40, -this.facing, 16, 1.2); Game.hitStop(0.25);
    this.L.after(1.8, () => this.L.onPlayerDied());
  }
  victory() { this.locked = true; this.stealthed = false; this.vx = 0; this.change("victory"); this.fig.play("victory", true); }
  draw(c) { this.fig.draw(c, this.x, this.y); }
}
