// ============================================================================
// Inimigos: IA com máquina de estados (Idle, Patrol, Detect, Chase, Attack,
// Defend, Dodge, Search, Hurt, Death + Retreat, Stun, Special) e 5 arquétipos.
// ============================================================================
class Enemy {
  constructor(L, id, x, y, spawn = {}, data = null) {
    this.L = L; this.id = id; this.data = data || DATA.enemies[id]; this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    const sk = DATA.skins[this.data.skin] || {}; this.sc = sk.scale || 1; this.w = 24 * this.sc; this.h = 62 * this.sc;
    this.state = "idle"; this.stateTime = 0; this.facing = spawn.facing || -1; this.hp = this.maxHp = this.data.hp; this.dead = false;
    this.alerted = false; this.awareness = 0; this.lastKnown = { x, y }; this.lose = 0; this.home = { x, y };
    const pr = spawn.patrol; const span = this.p("patrol_span", 140);
    this.pl = pr ? pr[0] : x - span; this.pr = pr ? pr[1] : x + span; this.pdir = 1;
    this.idleT = rand(0.5, 2); this.atkCd = 0.6; this.atk = null; this.token = false; this.invuln = 0; this.stunT = 0; this.hurtT = 0.35; this.defendT = 0.8;
    this.guardHits = 0; this.searchT = 0; this.lookT = 0; this.mark = ""; this.markT = 0; this.camo = !!this.data.camo; this.baseAlpha = this.camo ? 0.22 : 1; this.dmgMult = 1;
    this.fig = new Figure(this.data.skin); this.fig.onEvent = (e) => this.onAnimEvent(e); this.fig.onFinish = (n) => this.onAnimFinished(n);
    this.box = new MeleeBox(); this.isBoss = false;
    if (spawn.alerted) { this.alerted = true; this.awareness = 1; this.state = "chase"; }
    this.onSpawn();
  }
  p(k, d = 0) { return this.data[k] !== undefined ? this.data[k] : d; }
  onSpawn() {}
  bodyRect() { return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h }; }
  hurtRect() { return { x: this.x - 12 * this.sc, y: this.y - 60 * this.sc, w: 24 * this.sc, h: 58 * this.sc }; }
  get target() { return this.L.player; }
  tValid() { const t = this.target; return t && !t.dead; }
  dist() { return this.tValid() ? dist(this.x, this.y, this.target.x, this.target.y) : 99999; }
  change(s) { if (this.state === "attack" && s !== "attack") { this.box.active = false; this.releaseToken(); } this.state = s; this.stateTime = 0; this.fig.speed = 1; }
  showMark(m, t) { this.mark = m; this.markT = t; }

  update(dt) {
    this.stateTime += dt; this.atkCd = Math.max(0, this.atkCd - dt); this.invuln = Math.max(0, this.invuln - dt); this.markT = Math.max(0, this.markT - dt); if (this.markT <= 0) this.mark = "";
    if (!this.dead && !this.alerted && !this.isBoss && this.tValid() && Math.abs(this.target.x - this.x) > 1500) { this.asleep = true; return; }
    this.asleep = false;
    this.preUpdate(dt);
    if (!this.dead) this.perceive(dt);
    this.runState(dt);
    this.vy = Math.min(this.vy + 1500 * this.gravScale() * dt, 1000);
    moveBody(this, dt, this.L);
    this.box.update(dt, this, [this.L.player], (t, r) => this.onHitLanded(r));
    if (this.y > this.L.killY + 200 && !this.dead) this.die(false);
    this.fig.facing = this.facing; this.fig.moveSpeed = Math.abs(this.vx) / Math.max(1, this.p("run_speed", 150)); this.fig.alpha = this.baseAlpha; this.fig.shadow = this.onFloor;
    this.fig.update(dt);
  }
  preUpdate() {}
  gravScale() { return 1; }
  runState(dt) {
    const fn = this["st_" + this.state]; if (fn) fn.call(this, dt);
  }
  // ---------------------------------------------------------- percepção
  canSee() {
    if (!this.tValid()) return false;
    const t = this.target, dx = t.x - this.x, dy = t.y - this.y; let sight = this.p("sight", 360);
    if (t.stealthed) sight *= 0.45 * Prog.stealthBonus(); if (this.alerted) sight *= 1.35;
    if (Math.abs(dy) > this.p("sight_vertical", 170)) return false;
    const d = Math.hypot(dx, dy); if (d > sight) return false;
    const front = sign(dx) === this.facing || Math.abs(dx) < 20;
    if (!front) { let back = t.stealthed ? 30 : 70; if (this.alerted) back = 160; if (d > back) return false; }
    return lineOfSight(this.L, this.x, this.y - 55 * this.sc, t.x, t.y - 40);
  }
  perceive(dt) {
    if (this.state === "death") return;
    const sees = this.canSee();
    if (sees) { this.lastKnown = { x: this.target.x, y: this.target.y }; this.lose = 0; }
    if (!this.alerted) {
      if (sees) {
        this.awareness += dt / Math.max(0.1, this.p("react", 0.5)) * clamp(1.6 - this.dist() / this.p("sight", 360), 0.4, 1.6);
        if (this.awareness > 0.3 && !this.mark) this.showMark("?", 0.6);
        if (this.awareness >= 1 && !["detect", "hurt", "stun"].includes(this.state)) this.change("detect");
      } else this.awareness = Math.max(0, this.awareness - dt * 0.25);
    } else {
      if (!sees) { this.lose += dt; if (this.lose > this.p("memory", 3.5) && (this.state === "chase" || this.state === "retreat")) this.startSearch(this.lastKnown); }
      else if (this.state === "search") this.change("chase");
    }
  }
  alert(pos) {
    const was = this.alerted; this.alerted = true; this.awareness = 1; this.lastKnown = pos; this.lose = 0;
    if (this.camo) { this.camo = false; this.baseAlpha = 1; }
    if (!was) this.L.onAllyAlert(this);
  }
  onNoise(x, y, r) { if (this.dead || this.alerted || this.asleep) return; if (dist(this.x, this.y, x, y) > r * this.p("hearing", 1)) return; if (["idle", "patrol", "search"].includes(this.state)) this.startSearch({ x, y }); }
  onAllyAlert(src) {
    if (this.dead || src === this || this.alerted || this.asleep) return;
    if (dist(this.x, this.y, src.x, src.y) > this.p("ally_radius", 480)) return;
    if (["idle", "patrol", "search"].includes(this.state)) { this.alerted = true; this.awareness = 1; this.lastKnown = this.tValid() ? { x: this.target.x, y: this.target.y } : { x: src.x, y: src.y }; this.showMark("!", 0.8); if (this.camo) { this.camo = false; this.baseAlpha = 1; } this.change("chase"); }
  }
  onPlayerAttack(x, y, kind) {
    if (this.dead || !this.alerted || !["chase", "idle", "retreat"].includes(this.state)) return;
    if (dist(this.x, this.y, x, y) > this.p("react_radius", 120) || sign(x - this.x) !== this.facing) return;
    const r = Math.random();
    if (r < this.p("dodge", 0)) this.startDodge();
    else if (r < this.p("dodge", 0) + this.p("defense", 0) && kind !== "special") this.startDefend();
  }
  // ---------------------------------------------------------- movimento
  edgeAhead(d) { if (!this.onFloor) return false; return groundBelow(this.L, this.x + d * 22, this.y - 8, 54) === null; }
  wallAhead(d) { return pointInSolid(this.L, this.x + d * (this.w / 2 + 4), this.y - 30); }
  moveToX(x, speed, dt, stop = 6) {
    const dx = x - this.x; if (Math.abs(dx) <= stop) { this.vx = moveToward(this.vx, 0, 1600 * dt); return false; }
    const d = dx > 0 ? 1 : -1; this.facing = d;
    if (this.edgeAhead(d) || this.wallAhead(d)) { this.vx = moveToward(this.vx, 0, 2400 * dt); return false; }
    this.vx = moveToward(this.vx, d * speed, 1400 * dt); return true;
  }
  stop(dt) { this.vx = moveToward(this.vx, 0, 1600 * dt); }
  face() { if (this.tValid()) { const dx = this.target.x - this.x; if (Math.abs(dx) > 4) this.facing = dx > 0 ? 1 : -1; } }
  // ---------------------------------------------------------- estados
  st_idle(dt) { this.stop(dt); this.fig.play("idle"); this.idleT -= dt; if (this.idleT <= 0) { if (Math.abs(this.pr - this.pl) < 10) { this.facing = -this.facing; this.idleT = rand(2, 4); } else this.change("patrol"); } }
  st_patrol(dt) { const goal = this.pdir > 0 ? this.pr : this.pl; const m = this.moveToX(goal, this.p("speed", 70), dt); this.fig.play(m ? "walk" : "idle"); if (!m) { this.pdir = -this.pdir; this.idleT = rand(1, 2.5); this.change("idle"); } }
  st_detect(dt) {
    this.stop(dt); this.face(); this.fig.play("idle");
    if (this.stateTime < 0.02 + dt) { this.showMark("!", 1); Audio2.play("alert", 0.05, -6); }
    if (this.stateTime >= this.p("react", 0.5) * 0.8) { this.alert(this.tValid() ? { x: this.target.x, y: this.target.y } : { x: this.x, y: this.y }); this.onDetected(); }
  }
  onDetected() { this.change("chase"); }
  st_chase(dt) { if (!this.tValid()) { this.startSearch(this.lastKnown); return; } this.chase(dt); }
  chase(dt) {
    const t = this.target, dx = t.x - this.x, dy = t.y - this.y, d = Math.abs(dx), ra = this.p("attack_range", 70);
    this.face();
    if (this.atkCd <= 0 && d <= ra + 8 && Math.abs(dy) < 80) {
      if (this.requestToken()) { const a = this.chooseAttack(d); if (a) { this.startAttack(a); return; } this.releaseToken(); }
    }
    const crowded = !this.token && this.L.attackers() >= 2;
    let gx = t.x; if (crowded) { const side = dx > 0 ? -1 : 1; gx = t.x + side * (ra + 70); }
    let m = false;
    if (crowded) m = this.moveToX(gx, this.p("speed", 70), dt, 20);
    else if (d > ra * 0.75) m = this.moveToX(gx, this.p("run_speed", 150), dt, ra * 0.6);
    else if (d < ra * 0.35) { this.vx = moveToward(this.vx, -this.facing * this.p("speed", 70), 900 * dt); m = true; }
    else this.stop(dt);
    this.face();
    this.fig.play(m ? (Math.abs(this.vx) > this.p("speed", 70) + 10 ? "run" : "walk") : "idle");
  }
  requestToken() { if (this.p("ranged", false)) return true; this.token = this.L.requestToken(this); return this.token; }
  releaseToken() { if (this.token) { this.L.releaseToken(this); this.token = false; } }
  chooseAttack(d) {
    const opts = (this.data.attacks || []).filter((a) => d <= (a.range || 70) + 10); if (!opts.length) return null;
    let tot = opts.reduce((s, a) => s + (a.weight || 1), 0), r = Math.random() * tot;
    for (const a of opts) { r -= a.weight || 1; if (r <= 0) return a; } return opts[0];
  }
  startAttack(a) {
    this.atk = a; this.change("attack"); this.face(); this.fig.play(a.anim || "attack_light", true); this.fig.speed = a.speed || 1; this.vx = this.facing * (a.lunge || 0);
    if (a.telegraph) { const h = this.fig.headPos(this.x, this.y); FX.sparks(h[0] + this.facing * 8, h[1], 6); }
    this.onAttackStarted(a);
  }
  onAttackStarted() {}
  st_attack(dt) {
    this.vx = moveToward(this.vx, 0, 900 * dt);
    if (this.atk && this.atk.aim === "target" && this.tValid()) { const dx = Math.abs(this.target.x - this.x), dy = (this.target.y - 40) - (this.y - 50); this.fig.aim = clamp(Math.atan2(-dy, dx) / DEG, -50, 70); }
    if (this.stateTime > 3) this.endAttack();
  }
  endAttack() { this.box.active = false; this.releaseToken(); this.atkCd = this.p("cooldown", 1.2) * rand(0.8, 1.25) * (1.4 - this.p("aggression", 0.5) * 0.8); this.change(this.alerted ? "chase" : "idle"); }
  startDefend() { this.change("defend"); this.defendT = rand(0.5, 1); this.fig.play("block", true); this.face(); }
  st_defend(dt) { this.stop(dt); this.face(); if (this.stateTime >= this.defendT) { this.guardHits = 0; this.change("chase"); } }
  startDodge() { this.change("dodge"); this.face(); this.vx = -this.facing * this.p("dodge_speed", 300); this.vy = -260; this.invuln = 0.35; this.fig.play("dodge", true); Audio2.play("dodge", 0.1, -8); }
  st_dodge() { if ((this.stateTime > 0.15 && this.onFloor) || this.stateTime > 1) { this.vx = 0; this.change("chase"); } }
  startSearch(pos) { this.lastKnown = pos; this.searchT = this.p("search_time", 4); this.lookT = 0.8; this.showMark("?", 1.2); this.change("search"); }
  st_search(dt) {
    this.searchT -= dt; const m = this.moveToX(this.lastKnown.x, this.p("speed", 70) * 1.2, dt, 14);
    if (m) this.fig.play("walk"); else { this.fig.play("idle"); this.lookT -= dt; if (this.lookT <= 0) { this.facing = -this.facing; this.lookT = 0.9; } }
    if (this.searchT <= 0) { this.alerted = false; this.awareness = 0; this.showMark("?", 0.8); this.pdir = this.home.x > this.x ? 1 : -1; this.change("patrol"); }
  }
  st_hurt(dt) { this.vx = moveToward(this.vx, 0, 700 * dt); if (this.stateTime >= this.hurtT && this.onFloor) this.change("chase"); }
  st_stun(dt) { this.vx = moveToward(this.vx, 0, 700 * dt); if (this.stateTime > 0.4) { this.fig.play("idle"); this.fig.speed = 0.3; } if (this.stateTime >= this.stunT) this.change("chase"); }
  st_retreat(dt) {
    if (!this.tValid()) { this.change("search"); return; }
    const away = this.target.x > this.x ? -1 : 1; const m = this.moveToX(this.x + away * 100, this.p("run_speed", 140), dt, 4); this.face();
    this.fig.play(m ? "walk" : "idle"); if (!m || this.dist() > this.p("preferred_range", 300) || this.stateTime > 1.6) this.change("chase");
  }
  st_special() {}
  st_death(dt) { this.stop(dt); if (this.stateTime > 1.6) { this.baseAlpha = Math.max(0, this.baseAlpha - dt * 1.2); if (this.baseAlpha <= 0) this.remove = true; } }
  // ---------------------------------------------------------- eventos de animação
  onAnimEvent(ev) {
    if (this.dead) return;
    if (ev === "hit" && (this.state === "attack" || this.state === "special")) this.doHit(this.atk);
    else if ((ev === "shoot" || ev === "throw") && (this.state === "attack" || this.state === "special")) this.fire(this.atk);
  }
  doHit(a) { if (!a || !a.rect) return; this.box.start({ damage: (a.damage || 10) * this.dmgMult, kind: a.kind || "light", kb: a.kb || [180, -80], source: this, guardBreak: !!a.guard_break }, a.rect.map((v) => v * (this.isBoss ? 1 : 1)), a.active || 0.1, this.facing); Audio2.play(a.sfx || "slash", 0.12, -5); }
  fire(a) {
    const pj = a && a.projectile; if (!pj || !this.tValid()) return;
    const kind = pj.kind || "arrow", speed = pj.speed || 650, grav = pj.gravity || 0, o = this.fig.hand(this.x, this.y, true);
    const ox = o[0] + (kind === "arrow" ? this.facing * 12 : 0), oy = o[1];
    let ax = this.target.x, ay = this.target.y - 38; const t = dist(ox, oy, ax, ay) / speed;
    ax += this.target.vx * t * (pj.lead || 0.5); ay += (this.target.vy || 0) * t * 0.2 - 0.5 * grav * t * t;
    const base = Math.atan2(ay - oy, ax - ox), n = pj.count || 1, sp = pj.spread || 0;
    for (let i = 0; i < n; i++) { const ang = base + (n > 1 ? lerp(-sp, sp, i / (n - 1)) : 0); this.L.projectiles.push(new Projectile(ox, oy, { kind, team: "enemy", vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, grav, damage: (pj.damage || 10) * this.dmgMult, life: pj.lifetime || 2.5, source: this, bw: kind === "arrow" ? 18 : 14, bh: kind === "arrow" ? 8 : 14, kb: [140, -60] })); }
    Audio2.play(pj.sfx || "arrow", 0.1, -4);
  }
  onAnimFinished(n) {
    if (this.dead || this.state !== "attack" || !this.atk || n !== this.atk.anim) return;
    if (this.atk.then && this.fig.cur !== this.atk.then) { this.atk = Object.assign({}, this.atk, { anim: this.atk.then, then: "" }); this.fig.play(this.atk.anim, true); return; }
    this.endAttack();
  }
  onHitLanded(r) { if (r === "blocked") this.vx = -this.facing * 120; else if (r === "hit" || r === "dead") Game.hitStop(0.04); }
  // ---------------------------------------------------------- dano
  takeHit(info) {
    if (this.dead) return "none"; if (this.invuln > 0) return "dodged";
    const src = info.source, sx = src && src.x !== undefined ? src.x : info.x, front = (sx - this.x) * this.facing > 0;
    let dmg = info.damage; const kind = info.kind || "light", gb = !!info.guardBreak, unaware = !this.alerted && this.state !== "detect";
    if (unaware && kind !== "projectile" && (info.stealth || !front)) {
      if (this.isBoss) dmg *= 1.6;
      else { FX.slash(this.x, this.y - 45, -this.facing, 1.4, BLOOD); this.applyDamage(this.hp + 1, info); return "assassinated"; }
    }
    if (this.state === "defend" && front && !gb) {
      this.guardHits++; FX.sparks(this.x + this.facing * 18, this.y - 55, 10); Audio2.play("clang", 0.12, -3);
      if (this.guardHits >= this.p("guard_limit", 3)) { this.guardHits = 0; this.stagger(0.9); FX.text(this.x, this.y - 100, "Guarda quebrada!", BLOOD); }
      return "blocked";
    }
    if (front && !gb && kind !== "projectile" && this.alerted && (this.state === "chase" || this.state === "idle") && Math.random() < this.p("defense", 0) * 0.6) { this.startDefend(); FX.sparks(this.x + this.facing * 18, this.y - 55, 8); Audio2.play("clang", 0.12, -3); return "blocked"; }
    if (kind === "projectile" && this.alerted && front && Math.random() < this.p("deflect", 0)) { FX.sparks(this.x + this.facing * 18, this.y - 55, 6); Audio2.play("clang", 0.15, -6); return "blocked"; }
    dmg *= 1 - this.p("armor", 0); if (this.state === "stun") dmg *= 1.5; if (unaware) dmg *= 1.5;
    this.applyDamage(dmg, info);
    return this.dead ? "dead" : "hit";
  }
  applyDamage(dmg, info) {
    this.hp -= dmg; this.fig.flash = 1; const dir = info.dir || -this.facing;
    FX.splash(this.x, this.y - 45, dir, dmg < 25 ? 7 : 12, 0.9); FX.number(this.x, this.y - 95 * this.sc, dmg);
    this.alert(this.tValid() ? { x: this.target.x, y: this.target.y } : { x: this.x, y: this.y });
    if (this.hp <= 0) { this.die(true); return; }
    this.onDamaged(dmg, info);
    const kind = info.kind || "light";
    if ((dmg >= this.p("poise", 0) || kind === "heavy" || kind === "special") && this.state !== "stun") {
      this.releaseToken(); this.box.active = false; this.change("hurt"); this.hurtT = kind === "light" ? 0.32 : 0.5; this.fig.play("hurt", true);
      const kb = info.kb || [150, -80], res = 1 - clamp(this.p("knock_resist", 0), 0, 0.95); this.vx = kb[0] * dir * res; this.vy = kb[1] * res;
    }
  }
  onDamaged() {}
  stagger(t) { if (this.dead) return; this.releaseToken(); this.box.active = false; this.stunT = t; this.change("stun"); this.fig.play("hurt", true); this.vx = -this.facing * 140; this.showMark("*", t); }
  die(drop) {
    if (this.dead) return; this.dead = true; this.releaseToken(); this.box.active = false; this.change("death"); this.fig.play("death", true);
    Audio2.play("enemy_die", 0.1, -2); FX.splash(this.x, this.y - 40, -this.facing, 14, 1.1);
    if (drop) { Prog.addXp(this.p("xp", 10)); this.L.kills++; this.dropLoot(); }
  }
  dropLoot() {
    const c = this.p("coins", [2, 5]); let n = randi(c[0], c[1]);
    while (n > 0) { const v = Math.min(n, n >= 10 ? 5 : 1); this.L.spawnPickup("coin", this.x + rand(-20, 20), this.y - 40, v); n -= v; }
    const r = Math.random();
    if (r < this.p("drop_food", 0.12)) this.L.spawnPickup("onigiri", this.x, this.y - 40, 1);
    else if (r < this.p("drop_food", 0.12) + this.p("drop_shuriken", 0.18)) this.L.spawnPickup("shuriken", this.x, this.y - 40, 3);
  }
  draw(c) {
    if (this.asleep) return;
    this.fig.draw(c, this.x, this.y);
    if (this.dead) return;
    const top = this.y - 100 * this.sc;
    if (this.mark) { c.font = "bold 30px Georgia, serif"; c.textAlign = "center"; c.lineWidth = 5; c.strokeStyle = "rgba(237,227,204,1)"; c.strokeText(this.mark, this.x, top - 8); c.fillStyle = this.mark === "!" ? "rgb(179,20,13)" : "rgb(51,51,51)"; c.fillText(this.mark, this.x, top - 8); }
    if (this.hp < this.maxHp && !this.isBoss) { c.fillStyle = "rgba(26,26,26,0.35)"; c.fillRect(this.x - 20, top + 6, 40, 4); c.fillStyle = "rgba(158,20,15,0.9)"; c.fillRect(this.x - 20, top + 6, 40 * clamp(this.hp / this.maxHp, 0, 1), 4); }
  }
}

// ---------------------------------------------------------------- 1. Ashigaru
class Ashigaru extends Enemy {
  onSpawn() { this.trapCd = rand(1, 3); }
  preUpdate(dt) { this.trapCd -= dt; }
  chase(dt) {
    if (this.p("trapper") && this.trapCd <= 0 && this.tValid()) { const d = this.dist(); if (d > 110 && d < 340) { this.trapCd = rand(3, 5); this.startAttack({ anim: "shuriken_throw", speed: 0.9, projectile: { kind: "caltrop" } }); return; } }
    super.chase(dt);
  }
  fire(a) {
    if (!a.projectile || a.projectile.kind !== "caltrop" || !this.tValid()) return super.fire(a);
    const o = this.fig.hand(this.x, this.y, false), dx = this.target.x - o[0];
    for (let i = 0; i < 3; i++) this.L.projectiles.push(new Projectile(o[0], o[1], { kind: "caltrop", team: "enemy", vx: dx * rand(0.7, 1.15) / 0.75, vy: -340, grav: 900, damage: 8, life: 7, source: this, bw: 14, bh: 10, kb: [90, -220] }));
    Audio2.play("shuriken", 0.15, -6);
  }
}
// ---------------------------------------------------------------- 2. Arqueiro
class Archer extends Enemy {
  onSpawn() { this.data = Object.assign({}, this.data, { ranged: true }); this.repos = 0; }
  preUpdate(dt) { this.repos -= dt; }
  named(n) { return (this.data.attacks || []).find((a) => a.name === n); }
  chase(dt) {
    if (!this.tValid()) return; this.face(); const d = this.dist();
    if (d < 70 && this.atkCd <= 0 && (this.edgeAhead(-this.facing) || this.wallAhead(-this.facing))) { const m = this.named("bash"); if (m) { this.startAttack(m); return; } }
    if (d < this.p("flee_range", 170) && !this.edgeAhead(-this.facing) && !this.wallAhead(-this.facing)) { this.change("retreat"); return; }
    if (this.repos <= 0) { this.repos = 2.5; const v = this.bestVantage(); if (v) this.lastKnown = v; }
    const mr = this.p("max_range", 520);
    if (d > mr || !this.canSee()) { const m = this.moveToX(this.target.x, this.p("speed", 70), dt, mr * 0.8); this.fig.play(m ? "walk" : "idle"); return; }
    this.stop(dt);
    if (this.atkCd <= 0) { const s = this.named("shot"); if (s) { this.startAttack(s); return; } }
    this.fig.play("idle");
  }
  bestVantage() { let best = null, bs = -1; for (const v of this.L.vantage) { if (Math.abs(v[1] - this.y) > 30 || Math.abs(v[0] - this.x) > 320) continue; const s = Math.abs(v[0] - this.target.x); if (s > bs && s < this.p("max_range", 520)) { bs = s; best = { x: v[0], y: v[1] }; } } return best; }
  st_retreat(dt) { super.st_retreat(dt); if (this.state === "retreat" && this.atkCd <= 0 && this.dist() > 120 && this.stateTime > 0.5) { const s = this.named("shot"); if (s) this.startAttack(s); } }
}
// ---------------------------------------------------------------- 3. Ninja Rival
const NINJA_AIR = { anim: "air_attack", rect: [-10, -70, 80, 90], damage: 13, kind: "light", kb: [180, -120], active: 0.12, sfx: "slash" };
class RivalNinja extends Enemy {
  onSpawn() { this.jumpCd = 1; this.throwCd = rand(1.5, 3); this.ambush = !!this.data.ambush; if (this.ambush) this.baseAlpha = 0.12; }
  preUpdate(dt) {
    this.jumpCd -= dt; this.throwCd -= dt;
    if (this.ambush && !this.dead && this.tValid() && this.dist() < 170) { this.ambush = false; this.baseAlpha = 1; this.alert({ x: this.target.x, y: this.target.y }); FX.smoke(this.x, this.y - 30, 10, 1); Audio2.play("teleport", 0.1, -4); this.leap(); }
  }
  chase(dt) {
    if (!this.tValid()) return; const dx = this.target.x - this.x, dy = this.target.y - this.y, d = Math.abs(dx); this.face();
    if (this.onFloor && this.jumpCd <= 0 && ((dy < -70 && d < 280) || (d > 120 && d < 260 && Math.random() < 0.015))) { this.leap(); return; }
    if (this.throwCd <= 0 && d > 170 && d < 440 && this.canSee()) { this.throwCd = rand(2.5, 4.5); this.startAttack({ anim: "shuriken_throw", projectile: { kind: "shuriken", speed: 640, damage: 7, lead: 0.3, count: Math.random() < 0.4 ? 2 : 1, spread: 0.08, lifetime: 1.4, sfx: "shuriken" } }); return; }
    super.chase(dt);
  }
  leap() { if (!this.tValid()) return; const dx = this.target.x - this.x; this.facing = dx > 0 ? 1 : -1; this.vx = this.facing * clamp(Math.abs(dx) * 1.5, 180, 460); this.vy = -600; this.jumpCd = rand(2, 3.2); this.airAtk = false; this.change("special"); this.fig.play("double_jump", true); Audio2.play("jump", 0.1, -6); }
  st_special() {
    if (!this.airAtk && this.stateTime > 0.2 && this.vy > -150) { this.airAtk = true; this.atk = NINJA_AIR; this.fig.play("air_attack", true); }
    if (this.onFloor && this.stateTime > 0.12) { this.box.active = false; this.atkCd = 0.5; FX.dust(this.x, this.y, 5, 0.8); this.change("chase"); }
  }
}
// ---------------------------------------------------------------- 4. Samurai de Elite
class EliteSamurai extends Enemy {
  onSpawn() { this.row = 0; this.ripT = 0; this.guardCd = 0; }
  preUpdate(dt) { this.ripT -= dt; this.guardCd -= dt; if (this.ripT <= 0) this.row = 0; }
  chase(dt) { if (!this.tValid()) return; if (this.atkCd > 0.4 && this.dist() < 150 && this.guardCd <= 0 && Math.random() < 0.02) { this.guardCd = 2.5; this.startDefend(); return; } super.chase(dt); }
  onAttackStarted(a) { if (a.kind === "heavy") { const h = this.fig.headPos(this.x, this.y); FX.sparks(h[0] + this.facing * 10, h[1] - 4, 8); Audio2.play("clang", 0.05, -14); } }
  onDamaged() { this.row++; this.ripT = 1.2; if (this.row >= 3 && this.state !== "attack") { this.row = 0; const h = (this.data.attacks || []).filter((a) => a.kind === "heavy").pop(); if (h) { FX.text(this.x, this.y - 120, "Revide!", BLOOD); this.startAttack(h); this.ripost = true; } } }
  applyDamage(dmg, info) { this.ripost = false; super.applyDamage(dmg, info); if (this.ripost && this.state === "hurt") { const h = (this.data.attacks || []).filter((a) => a.kind === "heavy").pop(); this.startAttack(h); } }
}
// ---------------------------------------------------------------- 5. Assassino das Sombras
const SA_BACKSTAB = { anim: "attack_combo", rect: [0, -80, 84, 66], damage: 16, kind: "heavy", kb: [300, -160], active: 0.12, sfx: "slash_heavy", lunge: 140 };
const SA_CHAIN = { anim: "chain_swing", rect: [10, -86, 170, 40], damage: 12, kind: "light", kb: [220, -60], active: 0.16, sfx: "chain", speed: 1.15 };
class ShadowAssassin extends Enemy {
  onSpawn() { this.tpCd = rand(1.5, 3); this.chainCd = 1.5; this.tp = 0; }
  preUpdate(dt) { this.tpCd -= dt; this.chainCd -= dt; }
  chase(dt) {
    if (!this.tValid()) return; const d = this.dist();
    if (this.tpCd <= 0 && d > 80 && d < 520) { this.beginTp(); return; }
    if (this.chainCd <= 0 && d > 80 && d < 190 && this.requestToken()) { this.chainCd = rand(2.5, 4); this.startAttack(SA_CHAIN); return; }
    super.chase(dt);
  }
  startDodge() { if (this.tpCd <= 1) this.beginTp(); else super.startDodge(); }
  beginTp() { this.tpCd = rand(3.5, 5.5); this.releaseToken(); this.change("special"); this.tp = 1; this.vx = this.vy = 0; this.fig.play("teleport", true); Audio2.play("teleport", 0.1, -3); FX.smoke(this.x, this.y - 30, 12, 1.1, [20, 18, 20], 0.7); }
  st_special(dt) {
    this.stop(dt);
    if (this.tp === 1 && this.stateTime > 0.25) { this.tp = 2; this.stateTime = 0; this.baseAlpha = 0; this.invuln = 1; this.hidden = true; }
    else if (this.tp === 2) {
      if (this.stateTime > 0.35 && this.tValid()) {
        const tf = this.target.facing || 1; let spot = this.findSpot(this.target.x - tf * 70); if (!spot) spot = this.findSpot(this.target.x + tf * 70);
        if (spot) { this.x = spot[0]; this.y = spot[1]; }
        this.face(); this.tp = 3; this.stateTime = 0; this.baseAlpha = 1; this.invuln = 0; this.hidden = false; this.fig.play("appear", true);
        FX.smoke(this.x, this.y - 30, 12, 1.1, [20, 18, 20], 0.7); Audio2.play("teleport", 0.1, -6);
      } else if (this.stateTime > 1.5) { this.baseAlpha = 1; this.hidden = false; this.tp = 0; this.change("chase"); }
    } else if (this.tp === 3 && this.stateTime > 0.22) { this.tp = 0; this.face(); if (this.requestToken()) this.startAttack(SA_BACKSTAB); else this.change("chase"); }
  }
  hurtRect() { return this.hidden ? { x: -9999, y: -9999, w: 0, h: 0 } : super.hurtRect(); }
  findSpot(x) {
    if (x < 40 || x > this.L.width - 40 || !this.tValid()) return null;
    const g = groundBelow(this.L, x, this.target.y - 70, 160); if (g === null) return null;
    if (!lineOfSight(this.L, this.target.x, this.target.y - 40, x, this.target.y - 40)) return null;
    return [x, g];
  }
}
const ARCHETYPES = { ashigaru: Ashigaru, archer: Archer, rival_ninja: RivalNinja, elite_samurai: EliteSamurai, shadow_assassin: ShadowAssassin };
