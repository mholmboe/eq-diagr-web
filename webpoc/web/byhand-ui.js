// The form of byhand.html: constants entered in blocks (an acid or base, a
// metal ion with a ligand, a solid, a redox couple or another reaction), converted by
// byhand.js while they are typed and shown as the reactions of the data file.
// "Create a diagram" has the engine read the file, saves it in this browser
// and opens it in a diagram tab, as a search result of the database page.
(function () {
  const $ = id => document.getElementById(id);
  const esc = t => String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const inApp = !!(window.EqView && EqView.app);
  // the engine is started when a file is to be checked
  let engine = null;
  const eng = () => engine || (engine = new EqDiagrEngine());

  // ---------------------------------------------------------------- what is entered
  // kept in this browser, so that a reload or a closed tab loses nothing
  const KEY = "eqdiagr.byhand";
  const newBlock = type =>
    type === "acid" ? { type, base: "", kind: "pKa", values: "", names: [] }
    : type === "complex" ? { type, metal: "", ligand: "", kind: "step", values: "", names: [] }
    : { type: "reaction", product: "", reactants: [["", ""], ["", ""]], kind: "form", logK: "" };
  const fresh = () => ({ name: "", pKw: "14.00", t: "25", water: true, blocks: [newBlock("acid")] });
  const EXAMPLE = () => ({ name: "", pKw: "14.00", t: "25", water: true, blocks: [
    { type: "acid", base: "NH3", kind: "pKa", values: "9.25", names: [] },
    { type: "complex", metal: "Cu 2+", ligand: "NH3", kind: "step", values: "4.04 3.43 2.80 1.48", names: [] },
    { type: "reaction", product: "Cu(OH)2(s)", reactants: [["1", "Cu 2+"], ["2", "OH-"]], kind: "ksp", logK: "-19.66" } ] });
  // redox: a couple from its standard potential, and the reduced ion as a reactant of the next entries
  const EXAMPLE_REDOX = () => ({ name: "", pKw: "14.00", t: "25", water: true, blocks: [
    { type: "reaction", product: "Fe 2+", reactants: [["1", "Fe 3+"], ["1", "e-"]], kind: "E0", logK: "0.771" },
    { type: "complex", metal: "Fe 3+", ligand: "OH-", kind: "cum", values: "11.81 22.3", names: [] },
    { type: "reaction", product: "Fe(OH)3(s)", reactants: [["1", "Fe 3+"], ["3", "OH-"]], kind: "ksp", logK: "-38.8" },
    { type: "reaction", product: "Fe(OH)2(s)", reactants: [["1", "Fe 2+"], ["2", "OH-"]], kind: "ksp", logK: "-15.1" } ] });
  // the value that is asked for, by the kind of constant of a reaction
  const VALUE_PH = { form: "8.48", ksp: "-8.48", E0: "0.771" };
  const REACTION_NOTE = {
    form: "A solid ends with (s), (c), (cr) or (am), a gas with (g). H2O is left out. A species formed in another entry may be a reactant.",
    ksp: "With log Ksp the reaction is read backwards: the solid, which ends with (s), dissolving into the reactants. H2O is left out.",
    E0: "With E° the electrons are among the reactants (Fe 3+ and e- give Fe 2+), and log K = n E°/0.0592 V at 25 °C. H2O is left out." };
  let state = fresh(), result = null, idx = [];
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null");
    if (s && Array.isArray(s.blocks) && s.blocks.every(b => b && ["acid", "complex", "reaction"].includes(b.type))) {
      state = Object.assign(fresh(), s);
      for (const b of state.blocks) Object.assign(b, Object.assign(newBlock(b.type), b));
    }
  } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} };
  const blank = b => b.type === "acid" ? !b.base.trim() && !b.values.trim()
    : b.type === "complex" ? !b.metal.trim() && !b.ligand.trim() && !b.values.trim()
    : !b.product.trim() && !String(b.logK).trim() && b.reactants.every(r => !String(r[0]).trim() && !r[1].trim());
  const nothing = () => state.blocks.every(blank);

  function status(cls, text) { $("status").className = cls; $("status").textContent = text; }
  function log(text) { $("log").textContent = text || ""; $("logDetails").hidden = !text; }

  // ---------------------------------------------------------------- the blocks
  const opt = (v, label, cur) => `<option value="${v}"${v === cur ? " selected" : ""}>${label}</option>`;
  const field = (i, f, b, ph, cls = "formula") =>
    `<input id="b${i}${f}" data-f="${f}" type="text" class="${cls}" spellcheck="false" autocapitalize="off" autocomplete="off" placeholder="${ph}" value="${esc(b[f])}">`;
  function blockHtml(b, i) {
    const rm = `<button class="rm" data-rm="${i}" title="Remove this entry" aria-label="Remove this entry">×</button>`;
    if (b.type === "acid") return `<fieldset class="block" data-i="${i}"><legend>Acid or base</legend>${rm}<div class="f">` +
      `<label for="b${i}base" title="The form that has given off all the protons of the acid: PO4 3- for phosphoric acid, NH3 for the ammonium ion">Base</label>${field(i, "base", b, "PO4 3-")}` +
      `<select data-f="kind" aria-label="The kind of values">${opt("pKa", "pKa values", b.kind)}${opt("pKb", "pKb values", b.kind)}</select>${field(i, "values", b, "2.15 7.20 12.35", "code")}</div>` +
      `<p class="note">The base is the form without the protons of the acid. One value for each proton, in any order.</p><p class="err" role="alert"></p></fieldset>`;
    if (b.type === "complex") return `<fieldset class="block" data-i="${i}"><legend>Metal ion with a ligand</legend>${rm}<div class="f">` +
      `<label for="b${i}metal">Metal ion</label>${field(i, "metal", b, "Cu 2+")}` +
      `<label for="b${i}ligand">Ligand</label>${field(i, "ligand", b, "NH3")}` +
      `<select data-f="kind" aria-label="The kind of constants">${opt("step", "Stepwise log K", b.kind)}${opt("cum", "Cumulative log β", b.kind)}</select>${field(i, "values", b, "4.04 3.43 2.80 1.48", "code")}</div>` +
      `<p class="note">One value for each complex, in the order of one, two, three ligands.</p><p class="err" role="alert"></p></fieldset>`;
    const re = b.reactants.map((r, k) => `<span class="re">` +
      `<input data-r="${k}" data-c="0" type="text" class="coef code" spellcheck="false" autocomplete="off" placeholder="1" value="${esc(r[0])}" aria-label="Coefficient of reactant ${k + 1}">` +
      `<input data-r="${k}" data-c="1" type="text" class="formula" spellcheck="false" autocapitalize="off" autocomplete="off" list="comps" placeholder="${k === 0 ? "Ca 2+" : k === 1 ? "CO3 2-" : ""}" value="${esc(r[1])}" aria-label="Reactant ${k + 1}"></span>`).join("");
    return `<fieldset class="block" data-i="${i}"><legend>Solid, redox or other reaction</legend>${rm}<div class="f">` +
      `<label for="b${i}product">Product</label>${field(i, "product", b, "CaCO3(s)")}` +
      `<label>Formed from</label><div class="reactants">${re}<button data-addre="${i}" title="One more reactant">+ reactant</button></div>` +
      `<select data-f="kind" aria-label="The kind of constant">${opt("form", "log K of formation", b.kind)}${opt("ksp", "log Ksp (dissolving)", b.kind)}${opt("E0", "E° (V), reduction", b.kind)}</select>${field(i, "logK", b, VALUE_PH[b.kind] || VALUE_PH.form, "code")}</div>` +
      `<p class="note">${REACTION_NOTE[b.kind] || REACTION_NOTE.form}</p><p class="err" role="alert"></p></fieldset>`;
  }
  function drawBlocks() {
    $("blocks").innerHTML = state.blocks.map(blockHtml).join("");
    for (const id of ["water", "pKw", "t", "name"]) { const el = $(id); if (el.type === "checkbox") el.checked = !!state[id]; else el.value = state[id]; }
    update();
  }
  $("blocks").addEventListener("input", e => {
    const fs = e.target.closest("fieldset.block");
    if (!fs) return;
    const b = state.blocks[+fs.dataset.i], d = e.target.dataset;
    if (d.f) {
      b[d.f] = e.target.value;
      // names changed in the table belong to the species of the old entry
      if (["base", "metal", "ligand"].includes(d.f)) b.names = [];
      if (d.f === "kind" && b.type === "reaction") {
        fs.querySelector('[data-f="logK"]').placeholder = VALUE_PH[b.kind] || VALUE_PH.form;
        fs.querySelector(".note").textContent = REACTION_NOTE[b.kind] || REACTION_NOTE.form;
      }
    } else if (d.r) b.reactants[+d.r][+d.c] = e.target.value;
    save(); update();
  });
  $("blocks").addEventListener("click", e => {
    const rm = e.target.closest("[data-rm]"), add = e.target.closest("[data-addre]");
    if (rm) { state.blocks.splice(+rm.dataset.rm, 1); save(); drawBlocks(); }
    else if (add) {
      const i = +add.dataset.addre;
      state.blocks[i].reactants.push(["", ""]); save(); drawBlocks();
      const el = $("blocks").querySelector(`fieldset[data-i="${i}"] [data-r="${state.blocks[i].reactants.length - 1}"][data-c="1"]`);
      if (el) el.focus();
    }
  });
  function addBlock(type) {
    // an entry not used yet is not kept beside the new one
    if (state.blocks.length === 1 && blank(state.blocks[0])) state.blocks = [];
    state.blocks.push(newBlock(type)); save(); drawBlocks();
    const el = $("blocks").querySelector(`fieldset[data-i="${state.blocks.length - 1}"] input`);
    if (el) { el.focus(); el.scrollIntoView({ block: "nearest" }); }
  }
  $("addAcid").addEventListener("click", () => addBlock("acid"));
  $("addComplex").addEventListener("click", () => addBlock("complex"));
  $("addReaction").addEventListener("click", () => addBlock("reaction"));
  for (const id of ["water", "pKw", "t", "name"])
    $(id).addEventListener("input", e => { state[id] = e.target.type === "checkbox" ? e.target.checked : e.target.value; save(); update(); });

  // ---------------------------------------------------------------- the chemical system
  // the name of the file: as entered, else from the components ("NH3-Cu")
  function autoName() {
    const c = result ? result.components.filter(n => !/^(H ?\+|e ?-)$/.test(n)).map(n => ByHand.parseName(n).formula) : [];
    return c.join("-").replace(/[^A-Za-z0-9_+()-]+/g, "").slice(0, 40) || "system";
  }
  const fileName = () => (state.name.trim().replace(/\.(dat|txt)$/i, "").replace(/[\\/:*?"<>|]+/g, "") || autoName());

  // a line is not broken inside a name ("Cu 2+") or after a coefficient ("2 NH3")
  const nb = t => t.replace(/ (?=\d+[+-](?: |$))/g, "\u00a0").replace(/(^| )(\d+(?:\.\d+)?) (?=[A-Za-z(])/g, "$1$2\u00a0");
  function update() {
    idx = [];
    const blocks = [];
    state.blocks.forEach((b, i) => { if (!blank(b)) { idx.push(i); blocks.push(b); } });
    result = ByHand.build({ pKw: state.pKw, t: state.t, water: state.water, blocks });
    // what is wrong with an entry is told in the entry
    const sets = [...$("blocks").querySelectorAll("fieldset.block")];
    for (const fs of sets) { fs.classList.remove("bad"); fs.querySelector(".err").textContent = ""; }
    let inBlocks = 0;
    const general = [];
    for (const e of result.errors) {
      const fs = e.block >= 0 ? sets[idx[e.block]] : null;
      if (fs) { fs.classList.add("bad"); const p = fs.querySelector(".err"); p.textContent = (p.textContent ? p.textContent + " " : "") + e.text; inBlocks++; }
      else if (blocks.length) general.push(e.text);
    }
    if (inBlocks) general.unshift(inBlocks === 1 ? "One entry needs correcting (marked in red)." : `${inBlocks} entries need correcting (marked in red).`);
    $("problems").innerHTML = general.map(t => `<li class="e">${esc(t)}</li>`).join("") + result.warnings.map(w => `<li class="w">${esc(w.text)}</li>`).join("");

    const none = !blocks.length;
    $("empty").hidden = !none;
    $("preview").hidden = none || !result.species.length;
    $("preview").tBodies[0].innerHTML = none ? "" : result.species.map(x => {
      const b = x.block >= 0 ? state.blocks[idx[x.block]] : null, own = b && b.type !== "reaction";
      const name = own
        ? `<input type="text" class="formula" spellcheck="false" autocapitalize="off" autocomplete="off" data-b="${idx[x.block]}" data-n="${x.n}" data-auto="${esc(x.auto)}" value="${esc(x.name)}" aria-label="Name of ${esc(x.name)}" title="The name in the data file. Empty the field to get the name made by the program (${esc(x.auto)}).">`
        : esc(x.name);
      return `<tr class="${x.solid ? "solid" : ""}"><td class="n">${name}</td><td class="r">${esc(nb(x.text))}</td><td class="k">${String(x.logK).replace("-", "−")}</td><td class="s">${esc(nb(x.step))}</td></tr>`;
    }).join("");
    $("dat").textContent = result.ok ? result.dat : "";
    $("datDetails").hidden = !result.ok;
    $("name").placeholder = autoName();
    $("create").disabled = $("download").disabled = !result.ok;
    const at25 = Math.abs(result.t - 25) < 1e-9;
    $("toDb").disabled = !result.ok || !at25;
    $("toDb").title = at25 ? "The same reactions as a text database with its element file, so that a search finds them together with the other databases"
      : "A text database holds the constants at 25 °C: not possible for another temperature";
    // what can be a reactant: the components, the species formed in the entries, OH- and e-
    const known = [...new Set([...result.components, ...result.species.map(x => x.name), "OH-", "e-"])];
    $("comps").innerHTML = known.map(c => `<option value="${esc(c)}">`).join("");
  }
  // a name changed in the table: kept with its entry; an empty field gives the program's name again
  $("preview").addEventListener("change", e => {
    const d = e.target.dataset;
    if (!d.b) return;
    const b = state.blocks[+d.b], v = e.target.value.replace(/\s+/g, " ").trim();
    if (!v || v === d.auto) delete b.names[+d.n]; else b.names[+d.n] = v;
    b.names = Array.from(b.names, x => x || "");
    save(); update();
  });

  // ---------------------------------------------------------------- the files
  function download(text, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }
  $("download").addEventListener("click", () => { if (result && result.ok) download(result.dat, fileName() + ".dat"); });
  $("create").addEventListener("click", async () => {
    if (!result || !result.ok) return;
    const dat = result.dat;
    status("", "Reading the data file…"); log("");
    const d = await eng().datDefaults(dat);
    if (!d.ok) {
      status("fail", "The program cannot read this data file; see the messages."); log(d.log || d.error); $("logDetails").open = true;
      return;
    }
    let name = fileName() + ".dat";
    // a file of the same name in this browser is not replaced without asking
    let keys = [], replaced = false;
    try { keys = await Store.keys("files"); } catch (e) {}
    if (keys.includes(name)) {
      let free = name, n = 2;
      while (keys.includes(free)) free = name.replace(/\.dat$/i, ` (${n++}).dat`);
      const answer = await EqDialog.prompt(`There is already a data file "${name}" in this browser. ` +
        `Save the chemical system as (keep the name "${name}" to replace the old file):`, free, { ok: "Save" });
      if (!answer || !answer.trim()) { status("", ""); return; }
      name = /\.dat$/i.test(answer.trim()) ? answer.trim() : answer.trim() + ".dat";
      replaced = keys.includes(name);
    }
    try {
      await Store.put("files", name, dat);
      status("ok", `Saved in this browser as ${name} and opened as a diagram.`);
      if (inApp) { EqView.filesChanged(); EqView.app.openDiagram({ file: name, reload: replaced }); }
      else location.href = "spana.html?file=" + encodeURIComponent(name);
    } catch (e) { status("fail", "Could not save the file in this browser: " + e.message); }
  });
  $("toDb").addEventListener("click", async () => {
    if (!result || !result.ok) return;
    const base = fileName(), db = ByHand.database(result, "manual input");
    if (inApp && EqView.app.dropFiles) {
      status("ok", `${base}.txt and ${base}.elt go to the databases of the Chemical system tab.`);
      await EqView.app.dropFiles([new File([db.txt], base + ".txt", { type: "text/plain" }), new File([db.elt], base + ".elt", { type: "text/plain" })]);
    } else {
      download(db.txt, base + ".txt"); download(db.elt, base + ".elt");
      status("ok", `${base}.txt and ${base}.elt were downloaded: load both on the database page.`);
    }
  });
  $("clear").addEventListener("click", async () => {
    if (!nothing() && !(await EqDialog.confirm("Remove everything that is entered here?", { ok: "Remove" }))) return;
    state = fresh(); save(); status("", ""); log(""); drawBlocks();
  });
  async function example(e, make, text) {
    e.preventDefault();
    if (!nothing() && !(await EqDialog.confirm("Replace what is entered here with the example?", { ok: "Replace" }))) return;
    state = make(); save(); drawBlocks();
    status("", text + " Check the values against your own source.");
  }
  $("example").addEventListener("click", e => example(e, EXAMPLE, "An example: ammonia, the complexes of copper(II) with ammonia, and solid copper hydroxide."));
  $("exampleRedox").addEventListener("click", e => example(e, EXAMPLE_REDOX,
    "An example with redox: Fe 2+ from the standard potential of Fe 3+/Fe 2+, the hydroxide complexes of iron(III), and the two solid hydroxides, the second one entered from Fe 2+."));

  $("helpLink").addEventListener("click", e => {
    if (inApp && EqView.app.openHelp) { e.preventDefault(); EqView.app.openHelp("help/DB_By_Hand.htm"); }
  });

  // ---------------------------------------------------------------- in the app window (app-view.js)
  if (window.EqView) Object.assign(EqView.commands, { dat: "download" });
  drawBlocks();
})();
