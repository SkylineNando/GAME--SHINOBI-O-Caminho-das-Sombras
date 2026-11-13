// ============================================================================
// Interface em DOM: menu principal, seleção de fase, personagem, loja/inventário,
// configurações, créditos, pausa, vitória e derrota.
// ============================================================================
const CONTROLS_HTML = `<table class="ctl">
<tr><th>Ação</th><th>Teclado / Mouse</th><th>Gamepad</th></tr>
<tr><td>Mover (segurar = correr)</td><td>A D / ← →</td><td>Analógico</td></tr>
<tr><td>Escalar / agachar / deslizar</td><td>W / S, ↑ / ↓</td><td>Analógico</td></tr>
<tr><td>Pular (2× = pulo duplo)</td><td>Espaço</td><td>A</td></tr>
<tr><td>Ataque leve (combo de 3)</td><td>J / clique</td><td>X</td></tr>
<tr><td>Ataque pesado</td><td>K / botão direito</td><td>Y</td></tr>
<tr><td>Bloquear (no tempo = contra-ataque)</td><td>L (segurar)</td><td>RB</td></tr>
<tr><td>Esquiva / Dash</td><td>Shift / E</td><td>B / LB</td></tr>
<tr><td>Shuriken / Kunai</td><td>U / I</td><td>D-pad ↑ / ↓</td></tr>
<tr><td>Golpe giratório / Furtividade</td><td>O / Q</td><td>R3 / L3</td></tr>
<tr><td>Elixir / Pausa</td><td>H / Esc</td><td>Select / Start</td></tr>
</table><p class="hint">Agachar + pular desce de plataformas finas. Atacar inimigos desatentos pelas costas = ataque furtivo.</p>`;

const UI = {
  root: document.getElementById("ui"),
  hide() { this.root.innerHTML = ""; this.root.className = ""; },
  showTouch(on) { Touch.on = on; if (!on) Touch.releaseAll(); },
  el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; },
  btn(text, fn, cls = "") { const b = this.el("button", "ink " + cls, text); b.onclick = () => { Audio2.unlock(); Audio2.play("ui_click", 0.05, -4); fn(); }; b.onmouseenter = () => Audio2.play("ui_move", 0.05, -10); return b; },
  panel(title, kanji, wide) {
    this.hide(); this.root.className = "overlay";
    const p = this.el("div", "panel" + (wide ? " wide" : "")); p.appendChild(this.el("div", "ptitle", `<span class="kanji">${kanji}</span>${title}`)); this.root.appendChild(p); return p;
  },
  // ---------------------------------------------------------- menu principal
  mainMenu(panel) {
    if (panel === "equipment") return this.shop(); if (panel === "credits") return this.credits();
    this.hide(); this.root.className = "menu";
    const t = this.el("div", "title", `<div class="seal">影</div><h1>SHINOBI</h1><h2>O CAMINHO DAS SOMBRAS</h2>`); this.root.appendChild(t);
    const box = this.el("div", "menubox"); const started = Save.data.started;
    box.appendChild(this.btn(started ? "Continuar" : "Novo jogo", started ? () => Game.startLevel(Save.data.unlocked_stage) : () => this.newGame()));
    if (started) box.appendChild(this.btn("Novo jogo", () => this.newGame()));
    box.appendChild(this.btn("Selecionar fase", () => this.stages()));
    box.appendChild(this.btn("Personagem", () => this.character()));
    box.appendChild(this.btn("Equipamentos", () => this.shop()));
    box.appendChild(this.btn("Configurações", () => this.settings()));
    box.appendChild(this.btn("Créditos", () => this.credits()));
    this.root.appendChild(box);
    this.root.appendChild(this.el("div", "foot", "Arte provisória gerada proceduralmente · clique ou toque para ativar o som"));
  },
  back(p, fn) { p.appendChild(this.el("hr")); p.appendChild(this.btn("Voltar", fn || (() => this.mainMenu()))); },
  newGame() {
    if (Save.data.started && !this._confirm) {
      const p = this.panel("Novo jogo", "新"); p.appendChild(this.el("p", "", "Iniciar um novo jogo apagará o progresso salvo (nível, moedas, equipamentos e fases)."));
      p.appendChild(this.btn("Sim, começar do zero", () => { this._confirm = true; this.newGame(); })); this.back(p); return;
    }
    this._confirm = false; Prog.newGame(); Game.startLevel(1);
  },
  stages() {
    const p = this.panel("Selecionar fase", "選", true), bosses = ["Capitão da Guarda", "Mestre Caçador", "General do Castelo", "Guardião do Templo", "Mestre do Dragão"];
    for (let n = 1; n <= 5; n++) {
      const d = DATA.levels[n], un = n <= Save.data.unlocked_stage, st = Save.data.stages[n];
      let txt = `<b>${NUMERALS[n - 1]}</b> ${d.name}`; if (un) { txt += ` <small>— chefe: ${bosses[n - 1]}</small>`; if (st && st.done) { const bt = st.best_time; txt += ` <small>(concluída ${String(Math.floor(bt / 60)).padStart(2, "0")}:${String(Math.floor(bt % 60)).padStart(2, "0")})</small>`; } } else txt += " <small>(bloqueada)</small>";
      const b = this.btn(txt, () => { if (!Save.data.started) Prog.newGame(); Game.startLevel(n); }, "left"); b.disabled = !un; p.appendChild(b);
    }
    this.back(p);
  },
  character() {
    const p = this.panel("Kage", "影", true), d = Save.data;
    p.appendChild(this.el("p", "", `Nível <b>${d.level}</b> · XP ${d.xp} / ${Prog.xpNext()}<br>Vida máxima ${Prog.maxHp()} · Energia máxima ${Prog.maxEnergy()}<br>Katana: <b>${Prog.katana().name}</b> (dano ×${Prog.dmgMult().toFixed(2)}) · Moedas: ${d.coins}`));
    p.appendChild(this.el("p", "grey", "Técnicas: " + (d.skills.length ? d.skills.map((s) => Prog.item(s).name).join(", ") : "combo básico, pulo duplo, bloqueio, contra-ataque, furtividade")));
    p.appendChild(this.el("p", "grey", DATA.kage.description));
    p.appendChild(this.el("h3", "", "Trajes"));
    for (const sk of d.outfits) { const eq = d.outfit === sk; const b = this.btn((DATA.skins[sk] || {}).name + (eq ? " (equipado)" : ""), () => { d.outfit = sk; Save.save(); Menu.fig.setSkin(sk); this.character(); }); b.disabled = eq; p.appendChild(b); }
    this.back(p);
  },
  shop(fromGame) {
    const p = this.panel("Equipamentos e Loja", "店", true), d = Save.data;
    p.appendChild(this.el("p", "coins", `Moedas: <b>${d.coins}</b>`));
    p.appendChild(this.el("p", "", `Inventário — Shurikens ${Prog.count("shuriken")}/40 · Kunais ${Prog.count("kunai")}/20 · Elixires ${Prog.count("elixir")}/5<br><span class="grey">Armas: ${d.weapons.map((w) => DATA.weapons.names[w] || w).join(", ")}</span>`));
    const cats = { katana: "Katanas", skill: "Técnicas de combate", stat: "Atributos", outfit: "Roupas", consumable: "Consumíveis" };
    for (const c in cats) {
      p.appendChild(this.el("h3", "", cats[c]));
      for (const it of DATA.shop.items.filter((i) => i.type === c)) {
        const row = this.el("div", "row"); let name = it.name; if (it.type === "stat") name += ` (${Prog.itemLevel(it.id)}/${it.max || 5})`;
        row.appendChild(this.el("div", "info", `<b>${name}</b><br><small>${it.desc}</small>`));
        const err = Prog.canBuy(it.id); const b = this.btn(err === "Já adquirido." ? "Adquirido" : `${Prog.cost(it.id)} 💰`, () => { if (!Prog.buy(it.id)) Audio2.play("coin"); this.shop(fromGame); }, "buy");
        b.disabled = !!err; b.title = err; row.appendChild(b); p.appendChild(row);
      }
    }
    this.back(p);
  },
  settingsBody(p) {
    const s = Save.data.settings;
    const slider = (label, key) => { const r = this.el("div", "row"); r.appendChild(this.el("div", "info", label)); const i = this.el("input"); i.type = "range"; i.min = 0; i.max = 1; i.step = 0.05; i.value = s[key]; i.oninput = () => { s[key] = parseFloat(i.value); Audio2.applyVolumes(); Save.save(); }; i.onchange = () => Audio2.play(key === "sfx" ? "slash" : "ui_click"); r.appendChild(i); p.appendChild(r); };
    slider("Música", "music"); slider("Efeitos sonoros", "sfx");
    const chk = (label, get, set) => { const r = this.el("label", "row chk"); const i = this.el("input"); i.type = "checkbox"; i.checked = get(); i.onchange = () => { set(i.checked); Save.save(); }; r.appendChild(i); r.appendChild(this.el("span", "", label)); p.appendChild(r); };
    chk("Tremor de câmera", () => s.shake, (v) => (s.shake = v));
    const r = this.el("div", "row"); r.appendChild(this.el("div", "info", "Controles de toque")); const sel = this.el("select");
    for (const [k, v] of [["auto", "Automático"], ["on", "Sempre"], ["off", "Nunca"]]) { const o = this.el("option", "", v); o.value = k; if (s.touch === k) o.selected = true; sel.appendChild(o); }
    sel.onchange = () => { s.touch = sel.value; Save.save(); if (Game.state === "level") UI.showTouch(Prog.touchEnabled()); }; r.appendChild(sel); p.appendChild(r);
    const fs = this.el("div", "row"); fs.appendChild(this.btn("Tela cheia", () => { try { if (!document.fullscreenElement) { const r = document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); if (r && r.catch) r.catch(() => {}); } else document.exitFullscreen().catch(() => {}); } catch (e) {} })); p.appendChild(fs);
  },
  settings() {
    const p = this.panel("Configurações", "設", true); this.settingsBody(p);
    p.appendChild(this.el("h3", "", "Controles")); p.appendChild(this.el("div", "", CONTROLS_HTML));
    const wipe = this.btn("Apagar progresso salvo", () => { if (wipe.dataset.sure) { Save.wipe(); Save.save(); this.mainMenu(); } else { wipe.dataset.sure = "1"; wipe.textContent = "Clique de novo para confirmar"; } });
    p.appendChild(wipe);
    this.back(p);
  },
  credits() {
    const p = this.panel("Créditos", "謝", true);
    p.appendChild(this.el("div", "", `<p><b>SHINOBI — O Caminho das Sombras</b> · versão HTML5 (canvas + WebAudio).</p>
<p>Personagens, cenários e efeitos desenhados por código em estilo sumi-e — <b>arte provisória</b>, mesma base do projeto Godot 4 (DATA/ compartilhado).</p>
<p>Áudio 100% sintetizado no navegador: koto (Karplus-Strong), shakuhachi, taiko, gongo, vento e chuva. Nenhum arquivo de terceiros.</p>
<p>Progresso salvo automaticamente no navegador (localStorage).</p><p class="grey">Obrigado por jogar. 影は消えない。</p>`));
    this.back(p);
  },
  // ---------------------------------------------------------- em jogo
  pause() {
    const p = this.panel("Pausa", "一時停止");
    p.appendChild(this.btn("Continuar", () => Game.togglePause()));
    p.appendChild(this.btn("Reiniciar fase", () => Game.startLevel(Game.level.n)));
    p.appendChild(this.btn("Configurações", () => { const q = this.panel("Configurações", "設", true); this.settingsBody(q); this.back(q, () => this.pause()); }));
    p.appendChild(this.btn("Controles", () => { const q = this.panel("Controles", "操", true); q.appendChild(this.el("div", "", CONTROLS_HTML)); this.back(q, () => this.pause()); }));
    p.appendChild(this.btn("Menu principal", () => { Save.save(); Game.toMenu(); }));
  },
  results(st, final, ending) {
    const p = this.panel("Fase Concluída", "勝利");
    p.appendChild(this.el("p", "", `<b>${st.name}</b><br>Tempo: ${String(Math.floor(st.time / 60)).padStart(2, "0")}:${String(Math.floor(st.time % 60)).padStart(2, "0")}<br>Inimigos derrotados: ${st.kills}<br>Moedas obtidas: ${st.coins}<br>Nível de Kage: ${Save.data.level}<br><small class="grey">Progresso salvo automaticamente.</small>`));
    if (final && ending) p.appendChild(this.el("p", "ending", ending));
    if (!final) p.appendChild(this.btn("Próxima fase", () => Game.startLevel(Game.level.n + 1)));
    p.appendChild(this.btn("Loja e equipamentos", () => Game.toMenu("equipment")));
    p.appendChild(this.btn(final ? "Créditos" : "Menu principal", () => Game.toMenu(final ? "credits" : undefined)));
  },
  gameOver() {
    const p = this.panel("Derrota", "敗北");
    p.appendChild(this.el("p", "grey", "A sombra cai, mas não desaparece."));
    p.appendChild(this.btn("Continuar do checkpoint", () => { const L = Game.level; Game.startLevel(L.n, L.checkpoint || null); }));
    p.appendChild(this.btn("Reiniciar fase", () => Game.startLevel(Game.level.n)));
    p.appendChild(this.btn("Menu principal", () => Game.toMenu()));
  },
};

// ---------------------------------------------------------------- inicialização
window.addEventListener("resize", () => Game.resize());
// app em segundo plano (Android/aba oculta): pausa o jogo e silencia o áudio
function onHidden(hidden) {
  try { if (Audio2.ctx) { if (hidden) Audio2.ctx.suspend(); else Audio2.ctx.resume(); } } catch (e) {}
  if (hidden) { Touch.releaseAll(); for (const k in Input.down) Input.set(k, false); if (Game.state === "level" && !Game.paused && Game.level && !Game.level.completed && !Game.level.failed) Game.togglePause(); }
}
document.addEventListener("visibilitychange", () => onHidden(document.hidden));
window.addEventListener("pagehide", () => onHidden(true));
document.addEventListener("pointerdown", () => Audio2.unlock(), { once: false });
Game.resize();
Menu.enter();
requestAnimationFrame(frame);
window.__SHINOBI = { Game, Prog, Save, Input };
