// Diagram setup (Spana) in the browser. The data file is the single source of
// truth: it is read with eq-diagr's reader (datRead), changed with its writer
// (datSet, datDefaults) or with ModChemSyst and ModReaction, and the diagram is
// made by SED or Predom, all in the engine's Web Worker.
(function () {
  const $ = id => document.getElementById(id);
  const engine = new EqDiagrEngine();
  const HUR = ["", "T", "TV", "LTV", "LA", "LAV"];
  const esc = t => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const isProton = n => n.trim() === "H+";
  const isElectron = n => n.trim() === "e-";
  const isGas = n => /\(g\)$/i.test(n.trim());
  const varied = h => h === 2 || h === 3 || h === 5;
  // default Y ranges for the SED diagram types that have one
  const Y_DEFAULT = { 2: [-9, 1], 3: [-9, 1], 4: [-6, 6], 5: [-15, 15], 6: [0, 14], 7: [-9, 1] };
  const HAS_Y = t => t in Y_DEFAULT, HAS_COMPY = t => t === 0 || t === 1 || t === 4;
  // diagram types; log activities and the H+ affinity spectrum are offered in
  // advanced mode only (or when the data file has them), as in Spana
  const PTYPES = [[0, "Predominance area diagram"], [1, "Fractions"], [3, "Logarithmic concentrations"],
    [2, "Logarithmic solubilities"], [7, "Logarithmic activities", true], [4, "Relative activities"],
    [6, "Calculated pH"], [5, "Calculated pe"], [8, "H⁺ affinity spectrum", true]];
  const adv = () => window.EqView ? EqView.advanced : true;

  let dat = null, model = null, fileName = "diagram", form = null, last = null, busy = false;
  // stored: the file's name in browser storage (null: not stored there, for
  // example a file from this computer); dirty: changes not saved there
  let stored = null, dirty = false;
  // the diagrams kept for comparison (see "kept diagrams" below): {plt, snap, name}
  let overlays = [];
  // live mode: the frame of the drawings of this file so far (diagram.js plotModel)
  let frameMemo = {};
  // log K of each reaction when the file was opened (to mark and undo changes)
  let origLogK = {};
  // live mode (see "live mode" below): the diagram follows the settings
  const LIVE_KEY = "eqdiagr.live";
  const live = () => $("live").checked;
  let lastMs = 0, liveTimer = null, liveSaveTimer = null, stopTimer = null;
  // dirty is computed, not tracked: the data file as the form would write it,
  // compared with the text last saved in this browser (or, for a file not
  // saved here, the text it was opened with)
  let savedDat = null, dirtyTimer = null;
  function checkDirty() {
    clearTimeout(dirtyTimer);
    dirtyTimer = setTimeout(async () => {
      if (!model) return;
      const ok = await applyForm(true);
      setDirty(!ok || dat !== savedDat);
      updateStale();
    }, 120);
  }
  function setDirty(d) {
    if (dirty === d) return;
    dirty = d;
    if (window.EqView) EqView.setDirty(d);
  }

  // ---------------------------------------------------------------- loading
  async function loadText(name, text, fromStore = false) {
    status("", "Reading the data file…");
    const d = await engine.datDefaults(text);
    if (!d.ok) { status("fail", "Could not read the data file; see the messages."); showLog(d.log || d.error); return; }
    document.documentElement.classList.remove("plotonly");
    overlays = []; frameMemo = {};
    fileName = name.replace(/\.dat$/i, "") || "diagram";
    $("fileName").textContent = fileName + ".dat";
    if (window.EqView) EqView.setTitle(fileName);
    $("fileNote").textContent = d.defaulted ? "(no diagram in the file: a default diagram was set, as Spana does)" : "";
    dat = d.dat;
    stored = fromStore ? name : null;
    origLogK = {};
    $("diagName").value = ""; $("diagName").placeholder = fileName;
    await reload();
    await applyForm(true);
    savedDat = dat; setDirty(false);
    await loadTicks();
    // no diagram yet for this file
    last = null; lastRun = null; $("readout").hidden = true; drawKept();
    ["dlSvg", "dlPng", "dlPdf", "dlEps", "dlPlt", "dlCsv", "copyImg"].forEach(id => $(id).disabled = true);
    $("plot").innerHTML = `<div class="empty">Click <b>Plot the diagram</b> to draw the diagram of this file.</div>`;
    updateStale();
    status("", "Choose the diagram and the concentrations, then click \"Plot the diagram\".");
    ["saveMy", "dlDat", "editDat"].forEach(id => $(id).disabled = false);
    checkConcs();
  }

  // A plot file (.plt) from this computer, as File > Plot file > Open of the
  // desktop Spana: the drawing alone, with the exports, without a data file.
  async function loadPlot(name, text) {
    if (!parsePlt(text) || !/^\s*[01]\s*-?\d/m.test(text)) {
      status("fail", `"${name}" could not be read as a plot file.`);
      return false;
    }
    model = null; dat = null; form = null; stored = null; savedDat = null; setDirty(false);
    fileName = name.replace(/\.plt$/i, "") || "diagram";
    $("fileName").textContent = name; $("fileNote").textContent = "";
    if (window.EqView) EqView.setTitle(fileName);
    document.documentElement.classList.add("plotonly");
    overlays = [];
    last = { name: fileName, plt: text, csv: "", ext: "csv" }; lastRun = null;
    $("csv").textContent = ""; showLog("");
    ["dlSvg", "dlPng", "dlPdf", "dlEps", "dlPlt", "copyImg"].forEach(id => $(id).disabled = false);
    ["dlCsv", "dlDat", "editDat", "saveMy"].forEach(id => $(id).disabled = true);
    showPlot(); updateStale(); updateMake();
    status("ok", `Plot file ${name}: the drawing only, without its data file.`);
    return true;
  }
  // a file from this computer, by its extension
  const openAny = (name, text, fromStore) => /\.plt$/i.test(name) ? loadPlot(name, text) : loadText(name, text, fromStore);

  async function reload() {
    const r = await engine.datRead({ text: dat });
    if (!r.ok) { status("fail", "Could not read the data file; see the messages."); showLog(r.log || r.error); return false; }
    model = r.model;
    for (const x of model.species) { const n = x.name.trim().replace(/^\*/, ""); if (!(n in origLogK)) origLogK[n] = x.logK; }
    form = {
      plotType: model.diagram.plotType, compX: model.diagram.compX, compY: model.diagram.compY,
      compMain: model.diagram.compMain, yLow: model.diagram.yLow, yHigh: model.diagram.yHigh,
      Eh: model.diagram.Eh, title: model.diagram.title || "",
      concs: model.concs.map(c => ({ hur: c.hur, cLow: c.cLow, cHigh: c.cHigh }))
    };
    if (!$("temp").value) $("temp").placeholder = `${model.temperature} (file)`;
    syncOptSlides();
    drawSystem(); drawDiagramForm(); drawConcs();
    $("datText").textContent = dat;
    updateStale();
    return true;
  }

  // ---------------------------------------------------------------- chemical system
  function inactiveReactions() {
    // reactions switched off by ModReaction keep their line, with "*" before the name
    const lines = dat.split(/\r?\n/), head = lines[0].split(",").map(x => parseInt(x, 10));
    const na = head[0], nr = (head[1] || 0) + (head[2] || 0);
    return lines.slice(1 + na, 1 + na + nr + 50).map(l => l.split(","))
      .filter(f => f[0].trim().startsWith("*"))
      .map(f => ({ name: f[0].trim(), logK: parseFloat(f[1]) }));
  }

  function drawSystem() {
    const comps = model.components, sp = model.species;
    $("sysSummary").textContent = `${model.na} components, ${model.nx} complexes, ${model.nSolids} solids; ` +
      `t = ${model.temperature} °C, p = ${model.pressure} bar (from the file)`;
    // components move up or down within the soluble ones, or within the solid ones (as Spana)
    const nSolub = model.na - model.solidC;
    const canUp = i => i !== 0 && i !== nSolub, canDown = i => i !== nSolub - 1 && i !== model.na - 1;
    // the Comment columns only when there is a comment to show
    const compNotes = comps.some(c => c.comment), spNotes = sp.some(x => x.comment);
    $("compTable").innerHTML = `<tr><th class="adv-only"></th><th>Component</th>${compNotes ? "<th>Comment</th>" : ""}<th></th><th></th></tr>` + comps.map((c, i) =>
      `<tr><td class="adv-only" style="white-space:nowrap"><button class="mv" data-up="${i}" title="move up"${canUp(i) ? "" : " disabled"}>↑</button>` +
      `<button class="mv" data-down="${i}" title="move down"${canDown(i) ? "" : " disabled"}>↓</button></td>` +
      `<td class="name">${esc(c.name)}${i >= nSolub ? ' <span class="note">(solid)</span>' : ""}</td>` +
      (compNotes ? `<td class="note">${esc(c.comment || "")}</td>` : "") +
      `<td class="exch"><select data-exch="${i}" title="Exchange ${esc(c.name)} for one of its reaction products"><option value="">exchange for…</option>${sp.map((s, k) =>
        s.a[i] !== 0 ? `<option value="${esc(s.name)}">${esc(s.name)}</option>` : "").join("")}</select></td>` +
      `<td><button data-del="${i}" title="delete this component and its reactions">delete</button></td></tr>`).join("");
    // reactions: ticked = used in the calculations, as the species found in the
    // database search; unticked reactions keep their line with a "*" (ModReaction)
    // (the model lists switched-off reactions too, with the "*"; the file is the reference)
    const off = inactiveReactions(), isOff = x => x.name.trim().startsWith("*");
    $("delOff").hidden = !adv() || !off.length;
    $("specTable").innerHTML = `<tr><th></th><th>Reaction product</th><th>${kMode === "step" ? "pKa or log K" : kMode === "stepb" ? "pKb or log K" : "log K"}</th>${spNotes ? "<th>Comment</th>" : ""}</tr>` + sp.map((x, k) => isOff(x) ? "" :
      `<tr${kShown(k).changed ? ' class="changed"' : ""}><td><input type="checkbox" checked data-off="${esc(x.name)}" title="untick to leave ${esc(x.name)} out of the calculations"></td>` +
      `<td class="name" title="${esc(reactionText(x))}">${esc(x.name)}</td>` +
      `<td><div class="kcell">${kKind(k)}<input type="number" step="any" data-logk="${k}" value="${kShown(k).value}">` +
      `<button class="mv" data-kreset="${k}" title="back to ${kShown(k).orig}, the value when the file was opened"${kShown(k).changed ? "" : " hidden"}>↺</button></div></td>` +
      (spNotes ? `<td class="note">${esc(x.comment || "")}</td>` : "") + `</tr>` + (live() ? kSliderRow(x, k, spNotes ? 3 : 2) : "")).join("") +
      off.map(x => `<tr class="off"><td><input type="checkbox" data-on="${esc(x.name)}" title="tick to use ${esc(x.name.slice(1))} again"></td>` +
        `<td class="name">${esc(x.name.slice(1))}</td><td class="note">${isFinite(x.logK) ? x.logK : ""}</td>${spNotes ? "<td></td>" : ""}</tr>`).join("");
  }

  const kChanged = x => { const o = origLogK[x.name.trim()]; return o !== undefined && o !== x.logK; };

  // ---- accumulated and stepwise constants
  // The data file has the log K of the formation of each species from the
  // components (accumulated: H3PO4 from 3 H+ and PO4 3-). An acid is usually
  // described by the constants of its steps instead (pKa 2.15, 7.21, 12.35),
  // which are differences of two accumulated values. With "stepwise pKa"
  // the table shows, edits and slides the step of each species that belongs
  // to such a chain: soluble species that differ only in their number of H+,
  // down to the species without H+ (a component, or water for OH-).
  //   H+ added (n > 0):   pKa = log K(n) - log K(n-1), the acid is the species
  //   H+ removed (n < 0): pKa = log K(n+1) - log K(n), the acid is its neighbour
  // Changing a step moves the accumulated log K of the species and of all
  // those further out in its chain, so that the other steps stay as they are.
  const K_MODE = "eqdiagr.kMode";
  let kMode = "cum";
  // "cum" (accumulated), "step" (pKa of each step) or "stepb" (pKb of the base of each step)
  try { const m = localStorage.getItem(K_MODE); if (m === "step" || m === "stepb") kMode = m; } catch (e) {}
  function chains() {
    const iH = model.components.findIndex(c => isProton(c.name)), nSol = model.na - model.solidC;
    if (iH < 0 || iH >= nSol) return null;
    const key = a => a.map((v, i) => i === iH ? "" : v).join(","), groups = new Map();
    const member = (kk, n, m) => { if (!groups.has(kk)) groups.set(kk, new Map()); const g = groups.get(kk); if (!g.has(n)) g.set(n, []); g.get(n).push(m); };
    const zero = model.components.map(() => 0);
    member(key(zero), 0, { base: "H2O" });
    for (let i = 0; i < nSol; i++) if (i !== iH) { const a = zero.slice(); a[i] = 1; member(key(a), 0, { base: model.components[i].name.trim() }); }
    model.species.forEach((x, k) => {
      if (k >= model.nx || x.name.trim().startsWith("*") || isGas(x.name) || !isFinite(x.logK)) return;
      member(key(x.a), x.a[iH], { k });
    });
    return { iH, key, groups };
  }
  // the step of species k: {value, orig, acid, base, shift: [[k, sign]…]}, or null when it has none
  function stepOf(k, C) {
    C = C || chains();
    const x = model.species[k];
    if (!C || !x || k >= model.nx) return null;
    const g = C.groups.get(C.key(x.a)), n = x.a[C.iH];
    if (!g || !n || !g.has(n) || g.get(n).length !== 1 || g.get(n)[0].k !== k) return null;
    const pb = g.get(n > 0 ? n - 1 : n + 1);
    if (!pb || pb.length !== 1) return null;
    const p = pb[0], pName = p.base || model.species[p.k].name.trim(), name = x.name.trim();
    const K = m => m.base ? 0 : model.species[m.k].logK, K0 = m => m.base ? 0 : origLogK[model.species[m.k].name.trim()];
    const self = { k }, sign = n > 0 ? 1 : -1;
    const shift = [];
    for (const [m, list] of g) if (n > 0 ? m >= n : m <= n) for (const q of list) if (q.k !== undefined) shift.push(q.k);
    const o = sign * (K0(self) - K0(p));
    return { value: +(sign * (K(self) - K(p))).toFixed(4), orig: isFinite(o) ? +o.toFixed(4) : NaN, sign, shift, water: p.base === "H2O",
             text: n > 0 ? `${name} ⇌ ${pName} + H+` : p.base === "H2O" ? `H2O ⇌ ${name} + H+ (pKw)` : `${pName} + H2O ⇌ ${name} + H+`,
             // the same step written for its base (pKb = pKw - pKa)
             textB: n > 0 ? `${pName} + H2O ⇌ ${name} + OH-` : `${name} ⇌ ${pName} + OH-` };
  }
  // pKw of the data file: from the reaction of OH- (H2O ⇌ OH- + H+), or 14 without one
  function pKw(C) {
    C = C || chains();
    const g = C && C.groups.get(C.key(model.components.map(() => 0))), m = g && g.get(-1);
    if (!m || m.length !== 1 || m[0].k === undefined) return { now: 14, orig: 14 };
    const x = model.species[m[0].k], o = origLogK[x.name.trim()];
    return { now: -x.logK, orig: isFinite(o) ? -o : -x.logK };
  }
  // what the field of species k shows: the step in the stepwise view, where the species has one
  function kShown(k) {
    const x = model.species[k], C = kMode !== "cum" ? chains() : null, st = C ? stepOf(k, C) : null;
    if (!st) return { step: null, kind: "log K", value: x.logK, orig: origLogK[x.name.trim()], changed: kChanged(x) };
    let value = st.value, orig = st.orig, kind = st.water ? "pKw" : "pKa", text = st.text;
    if (kMode === "stepb" && !st.water) {
      const w = pKw(C);
      value = +(w.now - st.value).toFixed(4); orig = isFinite(st.orig) ? +(w.orig - st.orig).toFixed(4) : NaN; kind = "pKb"; text = st.textB;
    }
    return { step: st, kind, text, value, orig, changed: isFinite(orig) && Math.abs(orig - value) > 5e-5 };
  }
  const kKind = k => {
    if (kMode === "cum") return "";
    const sh = kShown(k);
    return sh.step ? `<span class="kkind pka" title="${esc(sh.text)}">${sh.kind}</span>` : `<span class="kkind" title="This species is not a step of an acid: the accumulated log K">log K</span>`;
  };
  // the changes of the data file that give species k the value v in its field
  function kAssign(k, v) {
    const sh = kShown(k), st = sh.step;
    if (!st) return [[k, +v]];
    const d = st.sign * ((sh.kind === "pKb" ? pKw().now - (+v) : +v) - st.value);
    return st.shift.map(q => [q, +(model.species[q].logK + d).toFixed(6)]);
  }
  // Live mode: a slider under each constant, three units to each side of the
  // value the file was opened with (wider if the value is outside).
  function kSliderRow(x, k, span) {
    const sh = kShown(k), c = isFinite(sh.orig) ? sh.orig : sh.value;
    if (!isFinite(c) || !isFinite(sh.value)) return "";
    return `<tr class="slide"><td></td><td colspan="${span}"><input type="range" data-kslide="${k}" min="${round(Math.min(c - 3, sh.value), 2)}" max="${round(Math.max(c + 3, sh.value), 2)}" ` +
      `step="0.05" value="${sh.value}" aria-label="${sh.kind} of ${esc(x.name.trim())}"></td></tr>`;
  }
  // a slider moves: the constant is written to the data file without drawing
  // the table again (the drag would be lost); the last position wins
  let kPending = null, kBusy = false;
  async function slideLogK(el) {
    const k = +el.dataset.kslide, v = +(+el.value).toFixed(2), row = el.closest("tr").previousElementSibling;
    row.querySelector("[data-logk]").value = v;
    kPending = { k, v };
    if (kBusy) return;
    kBusy = true;
    while (kPending) {
      const p = kPending; kPending = null;
      await applyForm(true);
      const list = kAssign(p.k, p.v);
      const r = await engine.datSet(dat, list.map(([q, val]) => `species[${q}].logK=${val}`));
      if (r.ok) { dat = r.dat; for (const [q, val] of list) model.species[q].logK = val; $("datText").textContent = dat; }
    }
    kBusy = false;
    if (model.species[k]) { const sh = kShown(k); row.classList.toggle("changed", sh.changed); row.querySelector("[data-kreset]").hidden = !sh.changed; }
    checkDirty();
  }
  // the reactions that are switched off are removed from the data file: their
  // lines, and their number in the first line (complexes first, then solids)
  async function deleteInactive() {
    const off = inactiveReactions();
    if (!off.length || busy) return;
    const names = off.map(x => x.name.slice(1)).join(", ");
    if (!(await EqDialog.confirm(`Delete ${off.length === 1 ? "the unticked reaction" : "the " + off.length + " unticked reactions"} from the data file for good?\n\n${names}\n\nThe database is not changed: a new search finds them again.`, { ok: "Delete" }))) return;
    await applyForm();
    const lines = dat.split(/\r?\n/), head = lines[0].split(",").map(x => parseInt(x, 10));
    const na = head[0], nx = head[1] || 0, nf = head[2] || 0;
    let dx = 0, df = 0;
    const keep = lines.filter((l, i) => {
      const r = i - 1 - na;
      if (r < 0 || r >= nx + nf || !l.split(",")[0].trim().startsWith("*")) return true;
      if (r < nx) dx++; else df++;
      return false;
    });
    keep[0] = keep[0].replace(/^(\s*\d+\s*,\s*)(\d+)(\s*,\s*)(\d+)/, (m, a, x, c, f) => a + (x - dx) + c + (f - df));
    const d = await engine.datDefaults(keep.join("\n"));
    if (!d.ok) { status("fail", "The reactions could not be deleted; see the messages."); showLog(d.log || d.error); $("logDetails").open = true; return; }
    const before = dat;
    dat = d.dat;
    if (!(await reload())) { dat = before; await reload(); return; }
    await applyForm(true);
    checkDirty(); checkConcs();
    status("ok", `Deleted from the data file: ${names}.`);
  }

  function reactionText(s) {
    const parts = model.components.map((c, i) => s.a[i] === 0 ? null : `${s.a[i] === 1 ? "" : s.a[i] + " "}${c.name}`).filter(x => x);
    return `${parts.join(" + ")} = ${s.name};  log K = ${s.logK}`;
  }

  async function changeSystem(program, arg) {
    if (busy) return;
    await applyForm();
    setBusy(true, "Changing the chemical system…");
    const r = await engine.run(program, ["-d=/work/_sys.dat", "-m=/work/_sys2.dat", arg],
                               { files: { "/work/_sys.dat": dat }, outputs: ["/work/_sys2.dat"] });
    setBusy(false);
    const out = r.files["/work/_sys2.dat"];
    showLog(r.log || r.error);
    if (!r.ok || !out) { status("fail", "The change could not be made; see the messages."); $("logDetails").open = true; return; }
    const d = await engine.datDefaults(out);
    dat = d.ok ? d.dat : out;
    checkDirty();
    await reload();
    status("ok", "Changed: " + arg.replace(/^-/, "").replace("=", " "));
  }

  async function moveComponent(i, up) {
    if (busy) return;
    const name = model.components[i].name;
    await applyForm();
    const r = await engine.datMove(dat, i, up);
    showLog(r.log || r.error);
    if (!r.ok) { status("fail", "The component was not moved; see the messages."); $("logDetails").open = true; return; }
    dat = r.dat; checkDirty();
    await reload();
    status("ok", `Moved ${name} ${up ? "up" : "down"}.`);
  }

  const MERGE_NOTE = "Note: a merged chemical system is probably incomplete. For example, after merging the two systems\n" +
    "   H+, Ca+2, Cl-\n   H+, Fe+3, CO3-2\nyou will NOT have chloride complexes of Fe(III) and you will NOT have calcium carbonate!\n\n" +
    "Are you sure that you still want to do this?";
  async function mergeWith(name2, text2) {
    if (busy || !model) return;
    await applyForm();
    setBusy(true, "Merging the chemical systems…");
    const r = await engine.datMerge(dat, text2);
    setBusy(false);
    showLog((r.warnings && r.warnings.length ? r.warnings.join("\n") + "\n\n" : "") + (r.log || r.error || ""));
    if (!r.ok) { status("fail", "The files were not merged: " + (r.error || "see the messages.")); $("logDetails").open = true; return; }
    dat = r.dat; stored = null; checkDirty();
    fileName = fileName + "+" + name2.replace(/\.dat$/i, "");
    $("fileName").textContent = fileName + ".dat"; $("fileNote").textContent = "(merged; not saved)";
    await reload();
    status("ok", `Merged with ${name2}: ${model.na} components, ${model.nx} complexes, ${model.nSolids} solids.` +
      (r.warnings && r.warnings.length ? ` ${r.warnings.length} warning(s) under "Program messages".` : ""));
    if (r.warnings && r.warnings.length) $("logDetails").open = true;
  }

  async function setLogK(k, value) {
    await applyForm();
    // (in the stepwise view the value is a step: see kAssign)
    const r = await engine.datSet(dat, kAssign(k, value).map(([q, val]) => `species[${q}].logK=${val}`));
    if (!r.ok) { status("fail", "log K not changed; see the messages."); showLog(r.log || r.error); return; }
    dat = r.dat; checkDirty(); await reload();
    status("ok", `${kShown(k).kind} of ${model.species[k].name.trim()} set to ${value}.`);
  }

  // ---------------------------------------------------------------- editing the text (advanced mode)
  // The data file as the form would write it, in a text box. "Apply" reads the
  // text as a file is opened (a default diagram if it has none); the file is
  // then changed but not saved, as after any other change of the system.
  let editBase = "";
  async function openEdit() {
    if (!model || busy || !(await applyForm())) return;
    editBase = dat;
    $("editName").textContent = fileName + ".dat";
    $("editText").value = dat;
    $("editErr").hidden = true;
    $("editDlg").showModal();
    $("editText").focus(); $("editText").setSelectionRange(0, 0); $("editText").scrollTop = 0;
  }
  // the message of the programs without the Java class and the internal file name
  const readError = r => String(r.error || r.log || "unknown error")
    .replace(/^(Error: )?[\w.$]+Exception: (Error:\s*)?/, "").replace(/^NumberFormatException reading/, "Could not read").replace(/\s*in file: "[^"]*"\.?\s*$/, "").trim();
  async function applyEdit() {
    const text = $("editText").value.replace(/\r\n?/g, "\n");
    if (text === editBase) { $("editDlg").close(); return; }
    if (busy) return;
    const fail = msg => {
      $("editErr").textContent = "The text could not be read as a data file:\n" + msg; $("editErr").hidden = false;
      // the line the programs stopped at is selected in the text
      const m = /in line: "([^"\n]+)"/.exec(msg), at = m ? $("editText").value.indexOf(m[1]) : -1;
      if (at >= 0) { $("editText").focus(); $("editText").setSelectionRange(at, at + m[1].length); }
    };
    const d = await engine.datDefaults(text.endsWith("\n") ? text : text + "\n");
    if (!d.ok) { fail(readError(d)); return; }
    const before = dat, kBefore = origLogK;
    dat = d.dat; origLogK = {};          // the text is the file now: its log K are the values to go back to
    if (!(await reload())) { dat = before; origLogK = kBefore; await reload(); fail($("log").textContent.trim() || "see the program messages"); return; }
    $("editDlg").close();
    $("fileNote").textContent = d.defaulted ? "(no diagram in the text: a default diagram was set, as Spana does)" : "";
    await applyForm(true);
    checkDirty(); checkConcs();
    status("ok", `The data file was changed: ${model.na} components, ${model.nx} complexes, ${model.nSolids} solids.` +
      (last && last.plt && !live() ? " Plot the diagram again to see the result." : ""));
  }
  // leaving with changes in the text asks first (Cancel and the Escape key)
  async function cancelEdit() {
    if ($("editText").value.replace(/\r\n?/g, "\n") !== editBase &&
        !(await EqDialog.confirm("Discard the changes to the text of the data file?", { ok: "Discard", cancel: "Keep editing" }))) {
      $("editText").focus(); return;
    }
    $("editDlg").close();
  }

  // ---------------------------------------------------------------- diagram and concentrations
  function compOptions(sel, value, allowNone) {
    sel.innerHTML = (allowNone ? `<option value="-1">(none)</option>` : "") +
      model.components.map((c, i) => `<option value="${i}">${esc(c.name)}</option>`).join("");
    sel.value = String(value);
  }

  // the diagram types this chemical system can have, as Spana's Select_Diagram:
  // a predominance diagram needs a component other than H+ and e-, log solubilities
  // a solid or a gas, calculated pe (Eh) e-, calculated pH H+, the H+ affinity
  // spectrum H+ among the soluble components
  function possibleTypes() {
    const comps = model.components.map(c => c.name.trim()), all = comps.concat(model.species.map(x => x.name.trim()));
    const ok = new Set([1, 3, 4, 7]);
    if (comps.some(n => !isProton(n) && !isElectron(n) && !/^H2O/i.test(n))) ok.add(0);
    if (model.nSolids > 0 || model.solidC > 0 || all.some(isGas)) ok.add(2);
    if (all.some(isElectron)) ok.add(5);
    if (all.some(isProton)) ok.add(6);
    if (comps.slice(0, model.na - model.solidC).some(isProton)) ok.add(8);
    return ok;
  }
  function drawDiagramForm() {
    const t = form.plotType, ok = possibleTypes();
    $("ptype").innerHTML = PTYPES.filter(([v, , a]) => v === t || (ok.has(v) && (!a || adv())))
      .map(([v, text]) => `<option value="${v}">${v === 5 && form.Eh ? "Calculated Eh" : text}</option>`).join("");
    $("ptype").value = String(t);
    compOptions($("compX"), form.compX);
    compOptions($("compY"), form.compY, t !== 0);
    compOptions($("compMain"), form.compMain);
    $("compYLabel").textContent = t === 0 ? "Y-axis component" : t === 1 ? "Fractions of component" : "Reference component";
    $("compYBox").classList.toggle("hidden", !HAS_COMPY(t));
    $("compMainBox").classList.toggle("hidden", t !== 0);
    $("yLow").value = isFinite(form.yLow) && form.yLow !== null ? form.yLow : "";
    $("yHigh").value = isFinite(form.yHigh) && form.yHigh !== null ? form.yHigh : "";
    const hasE = model.components.some(c => isElectron(c.name));
    $("ehBox").classList.toggle("hidden", !hasE);
    $("eh").checked = !!form.Eh;
    $("title").value = form.title;
    document.querySelectorAll(".sedOnly").forEach(e => e.classList.toggle("hidden", t === 0));
    document.querySelectorAll(".predOnly").forEach(e => e.classList.toggle("hidden", t !== 0));
    if (!$("nsteps").value) $("nsteps").placeholder = "50";
    $("nsteps").max = t === 0 ? 1000 : 300;
  }

  function axes() {
    const a = new Map();
    a.set(form.compX, "X");
    if (form.plotType === 0) { if (form.compY >= 0) a.set(form.compY, (a.get(form.compY) ? a.get(form.compY) + "," : "") + "Y"); }
    return a;
  }

  // As in Spana, the activity of H+ is given as pH, that of e- as pe (or Eh in
  // volts), that of a gas as log P; the data file keeps log activities (LA, LAV).
  const scale = i => {
    const n = model.components[i].name;
    return isProton(n) ? "pH" : isElectron(n) ? (form.Eh ? "Eh" : "pe") : isGas(n) ? "logP" : "";
  };
  const fEh = () => {    // Eh = pe · fEh (volts)
    const t = parseFloat($("temp").value), T = isFinite(t) ? t : isFinite(model.temperature) ? model.temperature : 25;
    return Math.LN10 * 8.31446 * (T + 273.15) / 96484.56;
  };
  const round = (x, d) => Number(x.toFixed(d));
  function shown(i, h, v) {           // data file -> form
    if (v === null || v === undefined || !isFinite(v) || h < 4) return v;
    const s = scale(i);
    return s === "pH" || s === "pe" ? 0 - v : s === "Eh" ? round(-v * fEh(), 3) : v;
  }
  function toFile(i, h, v) {         // form -> data file
    if (!isFinite(v) || h < 4) return v;
    const s = scale(i);
    return s === "pH" || s === "pe" ? 0 - v : s === "Eh" ? -v / fEh() : v;
  }
  function typeName(i, h) {
    const s = scale(i), a = s === "pH" ? "pH" : s === "pe" ? "pe" : s === "Eh" ? "Eh (V)" : s === "logP" ? "log P" : "log activity";
    return ["", "total conc.", "total conc. varied", "log total varied", a, a + " varied"][h];
  }
  let redrawing = false;
  // reversed axes are an option of advanced mode
  const reversed = () => adv() && $("rev").checked;
  // what the Y-axis of a SED diagram shows (in a predominance diagram it is a component)
  const Y_TEXT = t => {
    const c = form.compY >= 0 && model.components[form.compY] ? esc(model.components[form.compY].name.trim()) : "";
    return t === 1 ? `fraction of ${c || "the component"}, 0 to 1` : t === 2 ? "log solubility" : t === 3 ? "log concentration"
      : t === 4 ? `log activity relative to ${c || "the reference"}` : t === 5 ? (form.Eh ? "Eh (V), calculated" : "pe, calculated")
      : t === 6 ? "pH, calculated" : t === 7 ? "log activity" : t === 8 ? "d(H−h)/d(−pH)" : "";
  };
  function drawConcs() {
    const ax = axes(), rev = reversed();
    redrawing = true;
    // the range of the Y-axis is a row of the table, as that of the X-axis: its
    // two fields are kept out of the table while it is drawn again
    $("yHolder").append($("yLow"), $("yHigh"));
    const pt = form.plotType, yAxis = pt === 0 ? "" : HAS_Y(pt)
      ? `<tr class="yrow"><td class="name"><span class="ax">Y-axis</span></td><td class="ytype">${Y_TEXT(pt)}</td><td id="yLowCell"></td><td id="yHighCell"></td></tr>`
      : `<tr class="yrow"><td class="name"><span class="ax">Y-axis</span></td><td class="ytype" colspan="3">${Y_TEXT(pt)}</td></tr>`;
    $("concTable").innerHTML = `<colgroup><col><col><col><col></colgroup>` +
      `<tr><th>Component</th><th>Type</th><th colspan="2">Value, or from – to</th></tr>` +
      model.components.map((c, i) => {
        const k = form.concs[i], v = varied(k.hur);
        let lo = shown(i, k.hur, k.cLow), hi = v ? shown(i, k.hur, k.cHigh) : null;
        // the lower value first, unless reversed axes are allowed (as Spana)
        if (v && !rev && isFinite(lo) && isFinite(hi) && hi < lo) [lo, hi] = [hi, lo];
        return `<tr><td class="name">${esc(c.name)} ${ax.has(i) ? `<span class="ax">${ax.get(i)}-axis</span>` : ""}</td>` +
          `<td><select data-hur="${i}" title="${HUR[k.hur]}">${[1, 2, 3, 4, 5].map(h => `<option value="${h}"${h === k.hur ? " selected" : ""}>${typeName(i, h)}</option>`).join("")}</select></td>` +
          `<td><input type="number" step="any" data-low="${i}" value="${num(lo)}"></td>` +
          `<td><input type="number" step="any" data-high="${i}" value="${v ? num(hi) : ""}"${v ? "" : " disabled"}></td></tr>` +
          (live() && !v ? sliderRow(i) : "");
      }).join("") + yAxis;
    if (HAS_Y(pt)) { $("yLowCell").append($("yLow")); $("yHighCell").append($("yHigh")); }
    redrawing = false;
    checkConcs();
  }
  // Live mode: a slider under each fixed value. pH, pe, Eh, log P and log
  // activity move between the limits of the quantity; a total concentration
  // moves on a logarithmic scale (1e-9 to 10 mol/kg), or, where it may be
  // negative or zero (H+, e-), linearly around zero.
  function sliderSpec(i) {
    const k = form.concs[i], n = model.components[i].name, v = k.cLow;
    if (k.hur === 4) {
      const [, lo, hi] = rangeLimits(i), step = scale(i) === "Eh" ? 0.01 : 0.1;
      return { min: lo, max: hi, step, pos: shown(i, 4, v), value: p => round(p, 3) };
    }
    if (isProton(n) || isElectron(n) || !(v > 0)) {
      const m = Math.max(0.1, Number((2 * Math.abs(v || 0)).toPrecision(1)));
      return { min: -m, max: m, step: m / 100, pos: v || 0, value: p => Number(p.toPrecision(2)) };
    }
    return { min: -9, max: 1, step: 0.02, pos: Math.log10(v), value: p => Number((10 ** p).toPrecision(2)) };
  }
  function sliderRow(i) {
    const sp = sliderSpec(i), pos = Math.min(sp.max, Math.max(sp.min, sp.pos));
    return `<tr class="slide"><td></td><td colspan="3"><input type="range" data-slide="${i}" min="${sp.min}" max="${sp.max}" step="${sp.step}" ` +
      `value="${pos}" aria-label="${esc(model.components[i].name.trim())}: ${typeName(i, form.concs[i].hur)}"></td></tr>`;
  }
  // a value typed in the table moves its slider
  function syncSlider(i) {
    const el = $("concTable").querySelector(`[data-slide="${i}"]`);
    if (!el) return;
    const sp = sliderSpec(i);
    if (+el.min !== sp.min || +el.max !== sp.max) { el.min = sp.min; el.max = sp.max; el.step = sp.step; }
    el.value = Math.min(sp.max, Math.max(sp.min, sp.pos));
  }
  $("concTable").addEventListener("input", e => {
    const el = e.target;
    if (el.dataset.slide === undefined || redrawing) return;
    const i = +el.dataset.slide, k = form.concs[i], v = sliderSpec(i).value(+el.value);
    el.closest("tr").previousElementSibling.querySelector("[data-low]").value = num(v);
    k.cLow = toFile(i, k.hur, v);
    checkConcs(); checkDirty();
  });

  // very small and very large values in exponent form (1e-6), which fits the field
  const num = v => (v === null || v === undefined || !isFinite(v)) ? ""
    : v !== 0 && (Math.abs(v) < 1e-3 || Math.abs(v) >= 1e6) ? Number(v).toExponential().replace(/\.?0+e/, "e").replace("e+", "e") : v;

  // a component placed in an axis must be varied; give it a default range
  function makeVaried(i) {
    const k = form.concs[i], n = model.components[i].name;
    if (!varied(k.hur)) changeType(i, isProton(n) || isElectron(n) || k.hur === 4 ? 5 : 3);
  }

  // The default value of each type of concentration, as Spana's defaults
  // (DefaultPlotAndConcs): a new type, chosen in the table or given by moving
  // a component into or out of an axis, starts from its default value.
  function typeDefault(i, h) {
    const n = model.components[i].name.trim();
    const kind = isProton(n) ? "H" : isElectron(n) ? "e" : isGas(n) ? "gas" : /^H2O/i.test(n) ? "water" : /\+$/.test(n) ? "cation" : "other";
    switch (h) {
      case 1: return [kind === "H" || kind === "e" ? 0 : kind === "cation" ? 1e-5 : 0.01, null];
      case 2: return [0, 0.01];
      case 3: return [-6, -1];
      case 4: return [{ H: -7, e: -8.5, gas: -3.5, water: 0 }[kind] ?? -6, null];
      default: return kind === "H" ? [-1, -12]                                     // pH 1 to 12
        : kind === "e" ? (form.Eh ? [1 / fEh(), -1 / fEh()] : [15, -15])       // pe -15 to 15, Eh -1 to 1 V
        : [-10, -1];
    }
  }
  // The same quantity, fixed or varied (total conc. and total conc. varied;
  // pH, pe, Eh, log P or log activity and their varied forms) keeps its value:
  // a range becomes its middle, and a value becomes the centre of a range of
  // the default width, moved inside the limits of the quantity. Another
  // quantity (other units) starts from its default.
  const quantity = h => h <= 2 ? "total" : h === 3 ? "logtotal" : "activity";
  function rangeLimits(i) {     // [default width, lowest, highest] in the units shown
    const s = scale(i);
    return s === "pH" ? [11, 0, 14] : s === "pe" ? [30, -25, 25] : s === "Eh" ? [2, -2, 2]
      : s === "logP" ? [9, -20, 2] : [9, -20, 1];
  }
  function changeType(i, h) {
    const k = form.concs[i], from = k.hur;
    if (h === from) return;
    const ok = v => v !== null && v !== undefined && isFinite(v);
    if (quantity(from) !== quantity(h) || !ok(k.cLow) || (varied(from) && !ok(k.cHigh))) {
      k.hur = h; [k.cLow, k.cHigh] = typeDefault(i, h); return;
    }
    if (varied(from)) {                 // varied -> fixed: the middle of the range
      const mid = (k.cLow + k.cHigh) / 2;
      k.hur = h; k.cLow = h === 1 ? Number(mid.toPrecision(3)) : round(mid, 3); k.cHigh = null;
      return;
    }
    // fixed -> varied: a range around the value
    const n = model.components[i].name;
    k.hur = h;
    if (h === 2) {                      // total concentration: from 0 to twice the value
      const v = k.cLow;
      if (isProton(n) || isElectron(n)) { const w = Math.max(Math.abs(v), 0.005); [k.cLow, k.cHigh] = [v - w, v + w]; }
      else if (v > 0) [k.cLow, k.cHigh] = [0, Number((2 * v).toPrecision(3))];
      else [k.cLow, k.cHigh] = typeDefault(i, h);
      return;
    }
    const [w, lo, hi] = rangeLimits(i);
    const v = shown(i, from, k.cLow);
    let a = v - w / 2, b = v + w / 2;
    if (a < lo) { b += lo - a; a = lo; }
    if (b > hi) { a -= b - hi; b = hi; }
    a = Math.max(a, lo);
    // limits at round numbers (0.1 V for Eh, half a unit otherwise)
    const step = scale(i) === "Eh" ? 0.1 : 0.5;
    a = Math.max(lo, Math.round(a / step) * step); b = Math.min(hi, Math.round(b / step) * step);
    k.cLow = toFile(i, h, round(a, 3)); k.cHigh = toFile(i, h, round(b, 3));
  }

  // a component taken out of the axes goes back to a fixed concentration
  function makeFixed(i) {
    const k = form.concs[i], n = model.components[i].name;
    if (varied(k.hur)) changeType(i, isProton(n) || isElectron(n) || isGas(n) || k.hur === 5 ? 4 : 1);
  }


  // The checks of SED and Predom before a calculation (SedCalc, PredomCalc):
  // errors stop the program, so they disable "Plot the diagram"; warnings are
  // only shown (SED asks whether to go on, and goes on in the browser).
  let concErrors = [];
  function checkConcs() {
    const e = [], w = [], t = form.plotType, name = i => model.components[i].name;
    const axes = [form.compX].concat(t === 0 ? [form.compY] : []);
    form.concs.forEach((k, i) => {
      const n = name(i), v = varied(k.hur);
      if (k.cLow === null || !isFinite(k.cLow)) { e.push(`${n}: give a value.`); return; }
      if (v && (k.cHigh === null || !isFinite(k.cHigh))) { e.push(`${n}: give the upper value.`); return; }
      if (axes.includes(i) && !v) e.push(`${n} is in an axis, so its concentration must be varied.`);
      if (!axes.includes(i) && v) (t === 0 ? e : w).push(`${n} is varied but is not in an axis.`);
      if (v && k.cLow === k.cHigh) e.push(`${n}: the two values are equal.`);
      if (/^H2O/i.test(n.trim()) && k.hur <= 3) e.push(`${n}: give the log activity of water, not a total concentration.`);
      if (k.hur === 1 && Math.abs(k.cLow) > 100) e.push(`${n}: a total concentration above 100 mol/kg is not reasonable.`);
      if (k.hur === 2 && Math.max(Math.abs(k.cLow), Math.abs(k.cHigh)) > 100) e.push(`${n}: total concentrations above 100 mol/kg are not reasonable.`);
      if (k.hur === 3 && Math.max(k.cLow, k.cHigh) > 2) e.push(`${n}: log total concentration above 2 is not reasonable.`);
      if (isProton(n) && (k.hur === 4 || k.hur === 5) &&
          [k.cLow].concat(v ? [k.cHigh] : []).some(x => x < -14 || x > 2)) w.push(`H+: a pH below -2 or above 14 may be an input error.`);
      if (isProton(n) && k.hur === 3 && Math.min(k.cLow, k.cHigh) < -7) w.push(`H+: log total concentration below -7; did you mean the pH?`);
    });
    // water as a component changes nothing unless its activity is calculated
    const ionic = parseFloat($("ionic").value);
    if (model.components.some(c => /^H2O(\(l\))?$/i.test(c.name.trim())) && !(ionic > 0 || ionic === -1))
      w.push("H2O is a component, but no ionic strength is given: the activity of water stays 1 and the component changes nothing. Give an ionic strength in the Options (-1: calculated), or delete H2O.");
    if (t === 0 && form.compX === form.compY) e.push("The X- and Y-axis components must differ.");
    if (t === 0 && form.compMain < 0) e.push("Choose the main component.");
    if (t === 1 && form.compY < 0) e.push("Choose the component whose fractions are shown.");
    if (t === 4 && form.compY < 0) e.push("Choose the reference component.");
    if (HAS_Y(t) && !(isFinite(form.yLow) && isFinite(form.yHigh) && form.yLow !== null && form.yHigh !== null && form.yLow < form.yHigh))
      e.push("Y min must be a number below Y max.");
    concErrors = e;
    $("concWarn").innerHTML = e.map(x => `<span class="err">${esc(x)}</span>`).concat(w.map(x => `<span class="wrn">${esc(x)}</span>`)).join("");
    updateMake();
    return e;
  }
  // (in live mode the button is not greyed during the short calculations)
  function updateMake() { $("make").disabled = (busy && (!live() || !$("stop").hidden)) || !model || concErrors.length > 0; }


  // quiet: no message when the form cannot be written (while it is being edited)
  async function applyForm(quiet = false) {
    if (!model) return true;
    const base = dat;
    const t = form.plotType, a = [
      `diagram.plotType=${t}`, `diagram.compX=${form.compX}`, `diagram.compY=${HAS_COMPY(t) ? form.compY : -1}`,
      `diagram.compMain=${t === 0 ? form.compMain : -1}`, `diagram.Eh=${!!form.Eh}`, `diagram.title=${form.title}`];
    if (HAS_Y(t)) a.push(`diagram.yLow=${form.yLow}`, `diagram.yHigh=${form.yHigh}`);
    form.concs.forEach((k, i) => {
      a.push(`concs[${i}].hur=${k.hur}`, `concs[${i}].cLow=${k.cLow}`);
      if (varied(k.hur)) a.push(`concs[${i}].cHigh=${k.cHigh}`);
    });
    const r = await engine.datSet(base, a);
    if (dat !== base) return true;   // the file was changed meanwhile (for example a reaction switched off)
    if (!r.ok) { if (!quiet) { status("fail", "The diagram settings could not be written; see the messages."); showLog(r.log || r.error); } return false; }
    dat = r.dat; $("datText").textContent = dat;
    return true;
  }

  // ---------------------------------------------------------------- making the diagram
  function args() {
    // in normal mode the options shown in advanced mode only are not used:
    // the diagram is made with the defaults (and the temperature of the file)
    const t = form.plotType, a = [], A = adv(), v = id => A || !$(id).closest(".adv-only") ? $(id).value.trim() : "";
    if (v("nsteps")) a.push(`-n=${v("nsteps")}`);
    if (v("temp")) a.push(`-t=${v("temp")}`);
    if (v("ionic")) a.push(`-i=${v("ionic")}`);
    if (v("model")) a.push(`-m=${v("model")}`);
    if (v("tol")) a.push(`-tol=${v("tol")}`);
    if (v("tolA")) a.push(`-tola=${v("tolA")}`);
    if (v("units")) a.push(`-units=${v("units")}`);
    if (v("notation")) a.push(v("notation"));
    if (v("height")) a.push(`-h=${v("height")}`);
    if (reversed()) a.push("-rev");
    if (t === 0) { if (A && $("aqu").checked) a.push("-aqu"); if (A && $("ph").checked) a.push("-ph"); }
    else {
      // the table options as Spana gives them to SED
      const sep = A ? $("tblSep").value : ",", cs = A ? $("tblCs").value : '"', ce = A ? $("tblCe").value : '"';
      // (the table is always written in normal mode: the readout of the diagram uses it)
      if (!A || $("tblOn").checked)
        a.push("-tbl", `-tble:${tableExt()}`, sep === " " ? "-tbls: " : `-tbls:${sep}`,
               `-tblcs:${cs || " "}`, `-tblce:${ce || " "}`);
      if (v("thr")) a.push(`-thr=${v("thr")}`);
    }
    if (A && $("dbg").checked) a.push("-dbg");
    if (A && $("dbgH").value !== "1") a.push(`-dbg=${$("dbgH").value}`);
    return a;
  }
  const tableExt = () => adv() ? $("tblExt").value : "csv";
  // the name of the exported files: the diagram name (advanced), or that of the data file
  const outName = () => (adv() && $("diagName").value.trim().replace(/[\\/:*?"<>|]+/g, "_")) || fileName;

  // quiet: a run of the live mode, which makes the diagram again without
  // saving the file (it is saved when the changes stop), without "Calculating…"
  // and without moving the page
  async function make(quiet) {
    quiet = quiet === true;
    if (busy || !model) return;
    if (checkConcs().length) { if (!quiet) status("fail", "Correct the settings first: " + concErrors[0]); return; }
    if (!(await applyForm(quiet))) return;
    if (quiet && busy) return;
    if (quiet && lastRun !== null && runSignature() === lastRun) return;
    // saved when the file differs from the saved text (not from the dirty mark,
    // which follows an edit after a short delay)
    if (!quiet) clearTimeout(dirtyTimer);
    const saved = !quiet && (dat !== savedDat || !stored) ? await autoSave() : null;
    const base = `/work/${fileName.replace(/[^A-Za-z0-9_.+-]/g, "_")}`, t = form.plotType;
    const program = t === 0 ? "predom" : "sed";
    setBusy(true, quiet ? "" : "Calculating…", quiet);
    const t0 = performance.now();
    const ext = tableExt(), outputs = [`${base}.plt`].concat(t === 0 ? [] : [`${base}.${ext}`]);
    lastRun = runSignature();
    const snap = snapshot();
    const r = await engine.run(program, [`-d=${base}.dat`, ...args()], { files: { [`${base}.dat`]: dat }, outputs });
    setBusy(false);
    const ms = Math.round(performance.now() - t0), info = r.info || {};
    lastMs = ms;
    last = { name: outName(), plt: r.files[`${base}.plt`] || "", csv: r.files[`${base}.${ext}`] || "", ext, snap };
    $("dlCsv").textContent = "." + ext;
    showLog(r.log || r.error);
    $("csv").textContent = last.csv;
    ["dlSvg", "dlPng", "dlPdf", "dlEps", "dlPlt", "copyImg"].forEach(id => $(id).disabled = !last.plt);
    $("dlCsv").disabled = !last.csv;
    if (r.stopped) status("fail", "Stopped.");
    else if (r.ok && last.plt) status("ok", `${program === "sed" ? "SED" : "Predom"}: ${(info.points || 0).toLocaleString("en")} equilibrium calculations in ${ms} ms` +
                                     (info.failed ? `; ${info.failed} failed (see the messages)` : "") +
                                     (saved ? `; the data file is saved in this browser as ${saved}${K_NOTE()}` : ""));
    else { status("fail", "The diagram was not made; see the messages below."); if (!quiet) $("logDetails").open = true; }
    showPlot(); updateStale();
    // on a narrow screen the diagram is below the settings: bring it into view
    if (!quiet && r.ok && last.plt && matchMedia("(max-width: 700px)").matches) $("plotPane").scrollIntoView({ behavior: "smooth", block: "start" });
    if (quiet) saveWhenIdle();
  }

  // ---------------------------------------------------------------- live mode
  // With "Live" ticked the diagram follows the settings: a change makes the
  // diagram again, one calculation at a time, and the latest settings win.
  // The wait before a run follows the time of the last one, so that a slow
  // system is not calculated for every step of a slider.
  function scheduleLive() {
    if (!live() || !model || liveTimer) return;
    liveTimer = setTimeout(async () => {
      liveTimer = null;
      if (!live() || !model) return;
      if (busy) { scheduleLive(); return; }
      await make(true);
    }, Math.min(1000, Math.max(40, Math.round(lastMs / 2))));
  }
  // the data file is saved in the browser when the changes have stopped
  function saveWhenIdle() {
    clearTimeout(liveSaveTimer);
    liveSaveTimer = setTimeout(async () => {
      if (!model || busy || !(dat !== savedDat || !stored)) return;
      const name = await autoSave();
      if (name) status("ok", `The data file is saved in this browser as ${name}${K_NOTE()}.`);
    }, 2000);
  }
  function setLive(on, store = true) {
    $("live").checked = !!on;
    document.documentElement.classList.toggle("live", !!on);   // (the narrow layout, spana.html)
    if (store) { try { localStorage.setItem(LIVE_KEY, on ? "1" : "0"); } catch (e) {} }
    frameMemo = {};
    if (model) { drawSystem(); drawConcs(); updateStale(); }
    if (typeof syncOptSlides === "function") syncOptSlides();
    if (last && last.plt) showPlot();          // with or without the steady frame of live mode
  }
  $("live").addEventListener("change", e => { e.stopPropagation(); setLive(e.target.checked); });
  try { setLive(localStorage.getItem(LIVE_KEY) === "1", false); } catch (e) {}
  window.addEventListener("storage", e => { if (e.key === LIVE_KEY) setLive(e.newValue === "1", false); });

  // The diagram shown belongs to the settings it was made with (lastRun): when
  // the data file, the diagram settings or the program arguments differ, the
  // plot is dimmed and a badge offers to make the diagram again.
  let lastRun = null;
  // (the mode is not part of it: args() already leaves out the advanced options
  // in normal mode, so switching modes with default options changes nothing)
  const runSignature = () => model ? JSON.stringify([dat, form, args()]) : null;
  function updateStale() {
    const sig = runSignature();
    const stale = !!(last && last.plt && lastRun !== null && sig !== lastRun);
    // in live mode the diagram is made again instead (also the first one of a file)
    const again = live() && !!model && !concErrors.length && sig !== lastRun;
    $("plot").classList.toggle("stale", stale && !again);
    $("staleBadge").hidden = !stale || again;
    if (again) scheduleLive();
  }

  // ---------------------------------------------------------------- kept diagrams
  // "Keep" puts the diagram shown under the following ones, with broken
  // lines, to see what a change does (what if the concentration is ten times
  // higher, a solid is left out, a log K is changed). Up to six are kept, for
  // this tab only. Each is named by what differs from the diagram shown.
  const KEEP_MAX = typeof OVERLAY_MAX === "number" ? OVERLAY_MAX : 6;
  // the settings a diagram was made with
  function snapshot() {
    if (!model || !form) return null;
    const opts = {};
    for (const a of args()) { const m = /^-([a-z]+)[=:]?(.*)$/i.exec(a); if (m && !/^tbl/.test(m[1])) opts[m[1]] = m[2]; }
    return {
      type: form.plotType,
      concs: model.components.map((c, i) => {
        const k = form.concs[i], v = varied(k.hur), name = c.name.trim();
        let lo = shown(i, k.hur, k.cLow), hi = v ? shown(i, k.hur, k.cHigh) : null;
        if (v && !reversed() && isFinite(lo) && isFinite(hi) && hi < lo) [lo, hi] = [hi, lo];     // as the form shows them
        // "pH 4 to 12", "Fe 2+ total 1e-5", "CO2(g) log P -3.5"
        const kind = typeName(i, k.hur).replace(/ varied$/, "").replace(/^total conc\.$/, "total").replace(/^log total$/, "log total");
        return { name, text: `${/^(pH|pe|Eh)/.test(kind) ? "" : name + " "}${kind} ${num(lo)}${v ? " to " + num(hi) : ""}` };
      }),
      logK: Object.fromEntries(model.species.map(x => [x.name.trim(), x.logK])),
      opts
    };
  }
  // what a has that b has not: the differing settings, as a's values
  const OPT_TEXT = { i: v => `I = ${v === "-1" ? "calculated" : v || 0}`, t: v => v ? `t = ${v} °C` : "t of the file", n: v => `${v || 50} steps`,
                     m: v => `activity model ${["Davies", "SIT", "HKF"][+v] || "default"}`, aqu: () => "aqueous species only" };
  function differs(a, b) {
    if (!a || !b) return [];
    const out = [];
    if (a.type !== b.type) out.push((PTYPES.find(p => p[0] === a.type) || [0, "another diagram type"])[1].replace(/ \((SED|Predom)\)$/, ""));
    for (const c of a.concs) { const d = b.concs.find(x => x.name === c.name); if (d && d.text !== c.text) out.push(c.text); }
    for (const [name, v] of Object.entries(a.logK)) {
      const on = !name.startsWith("*"), bare = on ? name : name.slice(1);
      if (on && ("*" + bare) in b.logK) out.push(`with ${bare}`);
      else if (!on && bare in b.logK) out.push(`without ${bare}`);
      else if (on && bare in b.logK && b.logK[bare] !== v) out.push(`log K ${bare} = ${v}`);
      else if (on && !(bare in b.logK)) out.push(`with ${bare}`);
    }
    for (const name of Object.keys(b.logK)) if (!name.startsWith("*") && !(name in a.logK) && !(("*" + name) in a.logK)) out.push(`without ${name}`);
    for (const key of new Set(Object.keys(a.opts).concat(Object.keys(b.opts))))
      if (a.opts[key] !== b.opts[key] && OPT_TEXT[key]) out.push(OPT_TEXT[key](a.opts[key]));
    return out;
  }
  const short = list => list.length > 4 ? list.slice(0, 4).join("; ") + "; …" : list.join("; ");
  const keptLabel = (o, k) => o.name || (last && last.snap && o.snap ? short(differs(o.snap, last.snap)) || "the same settings" : `kept ${k + 1}`);
  // the diagram shown, by what differs from the kept ones
  function nowLabel() {
    if (!last || !last.snap) return "this diagram";
    const all = [];
    for (const o of overlays) for (const d of differs(last.snap, o.snap)) if (!all.includes(d)) all.push(d);
    return all.length ? short(all) : "this diagram";
  }
  function drawKept() {
    const box = $("kept");
    $("keepBtn").disabled = !(last && last.plt) || overlays.length >= KEEP_MAX;
    box.hidden = !overlays.length;
    if (!overlays.length) { box.innerHTML = ""; return; }
    const sample = k => `<svg width="34" height="8" viewBox="0 0 170 40" aria-hidden="true"><path d="M0 20H170" stroke="currentColor" stroke-width="7" fill="none" stroke-dasharray="${OVERLAY_DASH[k % OVERLAY_DASH.length].join(" ")}"/></svg>`;
    box.innerHTML = `<span>Kept for comparison:</span>` + overlays.map((o, k) =>
      `<span class="k">${sample(k)}<button type="button" class="nm" data-rename="${k}" title="Click to give this diagram a name of your own">${esc(keptLabel(o, k))}</button>` +
      `<button type="button" class="rm" data-unkeep="${k}" title="Remove this diagram from the drawing" aria-label="Remove">×</button></span>`).join("") +
      (overlays.length > 1 ? `<button type="button" data-unkeep="all">Remove all</button>` : "");
  }
  function keep() {
    if (!last || !last.plt) return;
    if (overlays.length >= KEEP_MAX) { status("fail", `At most ${KEEP_MAX} diagrams are kept; remove one first.`); return; }
    if (overlays.some(o => o.plt === last.plt)) { status("", "This diagram is kept already; change a setting and plot the diagram again."); return; }
    overlays.push({ plt: last.plt, snap: last.snap || null, name: "", csv: last.csv || "" });
    showPlot();
    status("ok", `The diagram is kept (${overlays.length} of ${KEEP_MAX}). Change a setting and plot the diagram again to compare; the kept one is drawn with broken lines.`);
  }
  // The table of results to download: that of the diagram shown and, when
  // diagrams are kept, their tables after it, each under a comment line with
  // the name of the legend (in the comment characters of the table).
  function tableText() {
    const kept = overlays.map((o, k) => [`Kept diagram ${k + 1}: ${keptLabel(o, k)}`, o.csv]).filter(x => x[1]);
    if (!kept.length) return last.csv;
    const cs = adv() ? $("tblCs").value : '"', ce = adv() ? $("tblCe").value : '"';
    const block = ([label, csv]) => `${cs}===== ${label.replace(/"/g, "'")} =====${ce}\n${csv.replace(/\s+$/, "")}\n`;
    return [["Diagram shown: " + nowLabel(), last.csv]].concat(kept).map(block).join("\n");
  }
  function unkeep(k) {
    if (k === "all") overlays = []; else overlays.splice(+k, 1);
    showPlot();
  }

  function showPlot() {
    drawKept();
    const plot = $("plot");
    if (!last || !last.plt) { plot.innerHTML = `<div class="empty">No diagram was made; see the messages below.</div>`; $("readout").hidden = true; return; }
    plot.innerHTML = pltToSvg(last.plt, currentStyle()) || `<div class="empty">The plot file is empty.</div>`;
    setupReadout();
  }

  // Reading values off the diagram: the pointer (or a touch) inside the axes
  // shows its coordinates, in the units of the axes, under the diagram, with
  // a cross-hair in the drawing on the screen (not in the exported files).
  // The table of results of SED (csv, as made in normal mode): the X values
  // and a column per species, for the diagrams whose Y-axis shows the values
  // of the table (fractions, solubilities, log concentrations and activities).
  function parseTable(text) {
    const lines = (text || "").split(/\r?\n/);
    const k = lines.findIndex(l => /first column contains the X-axis values/.test(l));
    if (k < 1 || !/Y-axis data are (fractions|solubilities|log10\(concs\.\)|log10\(ai\/ar\)|log10\(activities\))\./.test(lines[k - 2])) return null;
    const names = [...lines[k + 1].matchAll(/"([^"]*)"/g)].map(m => m[1]).slice(1);
    const rows = lines.slice(k + 2).map(l => l.split(",").map(x => x.trim()).filter(x => x !== "").map(Number))
      .filter(r => r.length === names.length + 1 && r.every(isFinite));
    if (!names.length || rows.length < 2) return null;
    return { names, x: rows.map(r => r[0]), rows, fractions: /fractions/.test(lines[k - 2]) };
  }
  const nameHtml = n => ChemText.format(n.trim(), true).map(r => r.shift < 0 ? `<sub>${esc(r.text)}</sub>` : r.shift > 0 ? `<sup>${esc(r.text)}</sup>` : esc(r.text)).join("");

  function setupReadout() {
    const out = $("readout"), svg = $("plot").querySelector("svg");
    const A = svg && last && last.plt ? plotAxes(last.plt, currentStyle()) : null;
    out.textContent = ""; out.hidden = !A;
    if (!A) return;
    // the species at the pointer's X, when the table has the range of the X-axis
    let T = A.kind === "sed" && last.ext === "csv" ? parseTable(last.csv) : null;
    if (T) {
      const tol = Math.abs(A.xHigh - A.xLow) * 0.01, x0 = T.x[0], x1 = T.x[T.x.length - 1];
      if (Math.min(Math.abs(x0 - A.xLow) + Math.abs(x1 - A.xHigh), Math.abs(x0 - A.xHigh) + Math.abs(x1 - A.xLow)) > tol) T = null;
    }
    const yMin = Math.min(A.yLow, A.yHigh), yMax = Math.max(A.yLow, A.yHigh);
    function speciesAt(x, d) {
      // the two rows around x (the X values rise or fall along the table)
      const up = T.x[T.x.length - 1] > T.x[0];
      let j = T.x.findIndex(v => up ? v >= x : v <= x);
      if (j < 0) j = T.x.length - 1;
      if (j === 0) j = 1;
      const a = T.rows[j - 1], b = T.rows[j], f = b[0] === a[0] ? 0 : (x - a[0]) / (b[0] - a[0]);
      const low = T.fractions ? Math.max(yMin, 0.005) : yMin;
      // twice the same name (a component in the X-axis is also a species): the first one
      return T.names.map((n, i) => [n, a[i + 1] + f * (b[i + 1] - a[i + 1])])
        .filter(([n, v], i) => v >= low && v <= yMax && T.names.indexOf(n) === i)
        .sort((p, q) => q[1] - p[1]).slice(0, 6)
        .map(([n, v]) => `<span class="sp">${nameHtml(n)} ${fmt(v, d)}</span>`).join("");
    }
    const idle = "Point at the diagram to read values off it." + (T ? `<span class="at">&nbsp;</span>` : "");
    out.innerHTML = idle;
    const NS = "http://www.w3.org/2000/svg";
    const g = document.createElementNS(NS, "g");
    g.setAttribute("class", "cross"); g.setAttribute("visibility", "hidden");
    const line = () => { const l = document.createElementNS(NS, "line"); l.setAttribute("vector-effect", "non-scaling-stroke"); g.appendChild(l); return l; };
    const lx = line(), ly = line();
    svg.appendChild(g);
    // decimals that resolve about 1/400 of the axis
    const dec = span => Math.max(0, Math.min(6, Math.ceil(-Math.log10(Math.abs(span) / 400))));
    const dx = dec(A.xHigh - A.xLow), dy = dec(A.yHigh - A.yLow);
    const fmt = (v, d) => v.toFixed(d).replace(/^-0(\.0*)?$/, "0$1").replace("-", "−");
    const hide = () => { g.setAttribute("visibility", "hidden"); out.innerHTML = idle; };
    const at = e => {
      const m = svg.getScreenCTM();
      if (!m) return;
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
      const fx = (p.x - A.x0) / A.xLen, fy = (-p.y - A.y0) / A.yLen;
      if (fx < 0 || fx > 1 || fy < 0 || fy > 1) { hide(); return; }
      const x = A.xLow + fx * (A.xHigh - A.xLow), y = A.yLow + fy * (A.yHigh - A.yLow);
      out.innerHTML = `${A.xTitle || "x"} = ${fmt(x, dx)} &emsp; ${A.yTitle || "y"} = ${fmt(y, dy)}` +
        (T ? `<span class="at">At this ${A.xTitle || "x"}: ${speciesAt(x, dy) || "no species in the range of the Y-axis"}</span>` : "");
      const set = (l, x1, y1, x2, y2) => { l.setAttribute("x1", x1); l.setAttribute("y1", y1); l.setAttribute("x2", x2); l.setAttribute("y2", y2); };
      set(lx, p.x, -A.y0, p.x, -(A.y0 + A.yLen)); set(ly, A.x0, p.y, A.x0 + A.xLen, p.y);
      g.setAttribute("visibility", "visible");
    };
    svg.addEventListener("pointermove", at);
    svg.addEventListener("pointerdown", at);
    svg.addEventListener("pointerleave", e => { if (e.pointerType === "mouse") hide(); });
  }

  async function convert(program, ext, type) {
    if (!last || !last.plt) return;
    // PlotPS draws the line strokes of the plot file, in colour or black and
    // white, with the page options of the diagram style: EPS (the diagram
    // alone) or a PS page with orientation and margins, the size, the header
    const st = plotStyle(), ps = program === "plotps";
    if (ps) ext = st.psKind === "ps" ? "ps" : "eps";
    const safe = last.name.replace(/[^A-Za-z0-9_.+-]/g, "_");
    const inp = `/work/${safe}.plt`, out = `/work/${safe}.${ext}`;
    const a = [`-p=${inp}`, `${ps ? "-ps" : "-pdf"}=${out}`, st.palette === "bw" || st.palette === "wb" ? "-bw" : "-clr"];
    if (!(ps && st.pdfHeader)) a.push("-noh");
    if (ps && +st.pdfScale > 0 && +st.pdfScale !== 100) a.push(`-s=${Math.round(st.pdfScale)}`);
    if (ps && ext === "ps" && st.pdfPage !== "fit") a.push(`-o=${st.pdfLandscape ? "L" : "P"}`, `-l=${+st.pdfLeft || 0}`, `-b=${+st.pdfBottom || 0}`);
    const r = await engine.run(program, a, { files: { [inp]: last.plt }, binaryOutputs: [out] });
    if (r.files[out]) download(fromBase64(r.files[out]), `${last.name}.${ext}`, type);
    else { showLog(r.log || r.error); $("logDetails").open = true; }
  }

  // The diagram as a PNG image (a promise of a Blob), as drawn on the screen;
  // its long side has the number of pixels chosen in the diagram style.
  function pngBlob() {
    const svg = pltToSvg(last.plt, currentStyle());
    const m = svg.match(/viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/), w = +m[3], h = +m[4];
    const long = Math.min(8000, Math.max(200, +plotStyle().pngSize || 1600)), scale = long / Math.max(w, h);
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas"); c.width = Math.round(w * scale); c.height = Math.round(h * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(b => b ? resolve(b) : reject(new Error("the image could not be made")), "image/png");
      };
      img.onerror = () => reject(new Error("the image could not be made"));
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg.replace(/width="[^"]+" height="[^"]+"/, `width="${w}" height="${h}"`));
    });
  }
  async function png() {
    try { download(await pngBlob(), last.name + ".png", "image/png"); }
    catch (e) { status("fail", "PNG: " + e.message); }
  }
  // The diagram on the clipboard, as an image to paste in a document. The
  // clipboard belongs to the window with the keyboard focus: this view after
  // a click on its button, the app window after File > Copy the diagram.
  async function copyImage() {
    if (!last || !last.plt) return;
    let w = window;
    try { if (!document.hasFocus() && window.parent !== window && window.parent.document.hasFocus()) w = window.parent; } catch (e) {}
    if (!w.navigator.clipboard || !w.navigator.clipboard.write || !w.ClipboardItem) {
      status("fail", "This browser cannot copy images to the clipboard; use the PNG export instead."); return;
    }
    const blob = pngBlob();
    try {
      // the item is made at once, with the image as a promise (Safari wants it within the click)
      try { await w.navigator.clipboard.write([new w.ClipboardItem({ "image/png": blob })]); }
      catch (e) {
        if (!(e instanceof TypeError)) throw e;
        await w.navigator.clipboard.write([new w.ClipboardItem({ "image/png": await blob })]);
      }
      const b = await blob;
      status("ok", `The diagram is on the clipboard as an image (${Math.round(b.size / 1024)} kB); paste it in a document.`);
    } catch (e) { status("fail", "The diagram could not be copied (" + (e.message || e.name) + "); use the PNG export instead."); }
  }

  // ---------------------------------------------------------------- my files (browser storage)
  async function refreshMyFiles() {
    let keys = [];
    try { keys = await Store.keys("files"); } catch (e) {}
    $("myFiles").innerHTML = `<option value="">My files (${keys.length})…</option>` + keys.map(k => `<option>${esc(k)}</option>`).join("");
  }
  // auto: a save that the user did not ask for (when a diagram is made, and in
  // live mode). It leaves out the log K values changed in this tab: the stored
  // file keeps the values it was opened with until the file is saved with
  // File > Save (or with "Save" when the tab is closed).
  const kChanges = () => !model ? [] : model.species.map((x, k) => kChanged(x) ? `species[${k}].logK=${origLogK[x.name.trim()]}` : null).filter(Boolean);
  async function putStored(name, auto) {
    let text = dat;
    const back = auto ? kChanges() : [];
    if (back.length) {
      const r = await engine.datSet(dat, back);
      if (!r.ok) throw new Error("the data file could not be written");
      text = r.dat;
    }
    await Store.put("files", name, text);
    if (name !== stored && window.EqView) EqView.setFile(name);
    stored = name; savedDat = text; setDirty(dat !== text);
    if (!auto && model) {          // saved as shown: these are the values of the file now
      let any = false;
      for (const x of model.species) { const n = x.name.trim().replace(/^\*/, ""); if (origLogK[n] !== x.logK) { origLogK[n] = x.logK; any = true; } }
      if (any) drawSystem();
    }
    // the tick steps of the diagram go with the file's (new) name
    const tx = parseFloat($("tickX").value) || 0, ty = parseFloat($("tickY").value) || 0;
    if (tx || ty) { try { await Store.put("settings", tickKey(), { x: tx, y: ty }); } catch (e) {} }
    if (window.EqView) EqView.filesChanged();
    refreshMyFiles();
  }
  const K_NOTE = () => kChanges().length ? ", without the changed log K (File > Save data file keeps them)" : "";
  async function saveMy() {
    if (!dat || !(await applyForm())) return false;
    const name = await EqDialog.prompt("Save the data file in this browser as:", stored || fileName + ".dat", { ok: "Save" });
    if (!name || !name.trim()) return false;
    const n = /\.dat$/i.test(name.trim()) ? name.trim() : name.trim() + ".dat";
    try { await putStored(n); status("ok", `Saved as "${n}" in this browser.`); return true; }
    catch (e) { status("fail", "Could not save in this browser: " + e.message); return false; }
  }
  // the file is saved under its name in browser storage; a file from elsewhere
  // only if no stored file has its name. Returns the name, or null.
  async function autoSave() {
    try {
      let name = stored;
      if (!name) {
        name = fileName + ".dat";
        if ((await Store.keys("files")).includes(name)) return null;
      }
      await putStored(name, true);
      return name;
    } catch (e) { return null; }
  }
  // closing the tab with changes: saved under the stored name, or asked for a name
  async function saveNow() {
    if (!dat || !(await applyForm())) return false;
    if (stored) { try { await putStored(stored); return true; } catch (e) { return false; } }
    return saveMy();
  }

  // ---------------------------------------------------------------- helpers and events
  function status(cls, text) { $("status").className = cls; $("status").textContent = text; }
  function showLog(text) { $("log").textContent = text || ""; }
  // quiet (live mode): the Stop button and "Calculating…" appear only when
  // the calculation takes a while
  function setBusy(b, text, quiet) {
    busy = b; updateMake();
    clearTimeout(stopTimer);
    if (b && quiet) stopTimer = setTimeout(() => { $("stop").hidden = false; updateMake(); status("", "Calculating…"); }, 400);
    else $("stop").hidden = !b;
    if (b && text) status("", text);
  }

  $("open").addEventListener("click", () => $("openFile").click());
  $("openFile").addEventListener("change", async e => {
    const f = e.target.files[0]; e.target.value = "";
    if (f) await openAny(f.name, await f.text());
  });
  $("myFiles").addEventListener("change", async e => {
    const name = e.target.value; e.target.value = "";
    if (!name) return;
    const text = await Store.get("files", name);
    if (text) await loadText(name, text, true);
  });
  $("saveMy").addEventListener("click", saveMy);
  $("make").addEventListener("click", make);
  $("staleBadge").addEventListener("click", make);
  // the sticky bar of "Plot the diagram" shows a border and a shadow while
  // settings are scrolled under it (the marker before it has left the view)
  if (window.IntersectionObserver)
    new IntersectionObserver(([e]) => $("makebar").classList.toggle("stuck", !e.isIntersecting && e.boundingClientRect.top < 60))
      .observe($("makebarTop"));
  // any change of a setting may make the diagram shown out of date (after the
  // page's own handlers have updated the form)
  for (const ev of ["input", "change"])
    $("settings").addEventListener(ev, () => setTimeout(updateStale, 0));
  $("stop").addEventListener("click", () => engine.stop());
  $("dlSvg").addEventListener("click", () => download(pltToSvg(last.plt, currentStyle()), last.name + ".svg", "image/svg+xml"));
  // ---------------------------------------------------------------- diagram style (diagram.js)
  // The style is the same for all diagrams and remembered in this browser; a
  // change in one tab is seen in the others (storage event).
  const STYLE_FIELDS = { stFont: "font", stSize: "textScale", stPalette: "palette", stLines: "lineScale",
                         stTicks: "ticks", stMinor: "minor", stGrid: "grid", stFrame: "frame", stAxis: "axisWidth", stPng: "pngSize",
                         stWidth: "xScale", stPage: "pdfPage", stOrient: "pdfLandscape", stScale: "pdfScale",
                         stLeft: "pdfLeft", stBottom: "pdfBottom", stPs: "psKind", stHeader: "pdfHeader",
                         stHeadConc: "headConc", stHeadTemp: "headTemp", stHeadIonic: "headIonic" };
  const STYLE_NUMBERS = ["textScale", "lineScale", "minor", "axisWidth", "pngSize", "xScale", "pdfScale", "pdfLeft", "pdfBottom"];
  const STYLE_FLAGS = ["pdfLandscape", "pdfHeader"];      // true or false; in a list as "1" or "0"
  $("stPens").innerHTML = PALETTE.map((c, i) => `<input type="color" data-pen="${i}" value="${c}" title="pen ${i + 1}" aria-label="colour of pen ${i + 1}">`).join("");
  function drawStyleForm() {
    const st = plotStyle();
    for (const [id, k] of Object.entries(STYLE_FIELDS)) {
      const el = $(id);
      if (el.type === "checkbox") el.checked = !!st[k];
      else el.value = STYLE_FLAGS.includes(k) ? (st[k] ? "1" : "0") : String(st[k]);
    }
    // the axis options need a font
    for (const el of $("stAxes").querySelectorAll("select")) el.disabled = st.font === "plotter";
    // the user's own colours, and the page options that an A4 or Letter page has
    $("stColors").hidden = st.palette !== "custom";
    const pens = plotPalette(Object.assign({}, st, { palette: "custom" }));
    $("stPens").querySelectorAll("input").forEach((el, i) => { el.value = (st.colors && pens[i]) || PALETTE[i]; });
    for (const id of ["stOrient", "stLeft", "stBottom"]) $(id).disabled = st.pdfPage === "fit";
    $("dlEps").textContent = st.psKind === "ps" ? "PS" : "EPS";
  }
  function styleChanged() {
    const st = {};
    for (const [id, k] of Object.entries(STYLE_FIELDS)) {
      const el = $(id);
      st[k] = el.type === "checkbox" ? el.checked : STYLE_FLAGS.includes(k) ? el.value === "1" : STYLE_NUMBERS.includes(k) ? +el.value : el.value;
    }
    st.colors = [...$("stPens").querySelectorAll("input")].map(el => el.value);
    setPlotStyle(st);
    drawStyleForm();
    if (last && last.plt) showPlot();
  }
  // The style of this diagram: the shared style and, in advanced mode, the tick
  // steps of this diagram (kept in this browser for the file, not in the data file)
  function currentStyle() {
    const st = plotStyle();
    // live mode: the frame of the drawing is kept steady from one diagram to the next
    if (live()) { st.steady = true; st.frameMemo = frameMemo; }
    st.pdfHeaderText = last ? `${last.name}    ${new Date().toLocaleString("sv-SE")}` : "";
    if (overlays.length) {
      st.overlays = overlays.map((o, k) => ({ plt: o.plt, label: keptLabel(o, k) }));
      st.overlayNow = nowLabel();
    }
    if (adv()) { st.xStep = parseFloat($("tickX").value) || 0; st.yStep = parseFloat($("tickY").value) || 0; }
    return st;
  }
  const tickKey = () => "ticks:" + (stored || fileName + ".dat");
  async function loadTicks() {
    let t = null;
    try { t = await Store.get("settings", tickKey()); } catch (e) {}
    $("tickX").value = t && t.x ? t.x : ""; $("tickY").value = t && t.y ? t.y : "";
  }
  for (const id of ["tickX", "tickY"]) $(id).addEventListener("change", async () => {
    const x = parseFloat($("tickX").value) || 0, y = parseFloat($("tickY").value) || 0;
    try { if (x || y) await Store.put("settings", tickKey(), { x, y }); else await Store.remove("settings", tickKey()); } catch (e) {}
    if (last && last.plt) showPlot();
  });
  function openStyle() { drawStyleForm(); $("styleDlg").showModal(); }
  drawStyleForm();
  $("styleBtn").addEventListener("click", openStyle);
  for (const id of Object.keys(STYLE_FIELDS)) $(id).addEventListener("change", styleChanged);
  $("stPens").addEventListener("change", styleChanged);
  $("stColorsReset").addEventListener("click", () => { $("stPens").querySelectorAll("input").forEach((el, i) => { el.value = PALETTE[i]; }); styleChanged(); });
  $("stDefault").addEventListener("click", () => { setPlotStyle({}); drawStyleForm(); if (last && last.plt) showPlot(); });
  window.addEventListener("storage", e => { if (e.key === PLOT_STYLE_KEY && last && last.plt) { showPlot(); drawStyleForm(); } });
  $("dlPng").addEventListener("click", png);
  $("copyImg").addEventListener("click", copyImage);
  $("keepBtn").addEventListener("click", keep);
  $("kept").addEventListener("click", async e => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.unkeep !== undefined) { unkeep(b.dataset.unkeep); return; }
    if (b.dataset.rename !== undefined) {
      const o = overlays[+b.dataset.rename];
      const name = await EqDialog.prompt("Name of this kept diagram in the legend (empty: what differs from the diagram shown):", o.name || keptLabel(o, +b.dataset.rename));
      if (name !== null) { o.name = name.trim().slice(0, 80); showPlot(); }
    }
  });
  // the PDF is drawn as on the screen (diagram.js); EPS still comes from PlotPS
  $("dlPdf").addEventListener("click", () => { if (last && last.plt) download(pltToPdf(last.plt, currentStyle()), last.name + ".pdf", "application/pdf"); });
  $("dlEps").addEventListener("click", () => convert("plotps", "eps", "application/postscript"));
  $("dlPlt").addEventListener("click", () => download(last.plt, last.name + ".plt", "text/plain"));
  $("dlCsv").addEventListener("click", () => download(tableText(), `${last.name}.${last.ext}`, last.ext === "csv" ? "text/csv" : "text/plain"));
  $("dlDat").addEventListener("click", async () => { if (await applyForm()) download(dat, fileName + ".dat", "text/plain"); });
  $("editDat").addEventListener("click", openEdit);
  $("editDat2").addEventListener("click", openEdit);   // the same, in the Chemical system section
  $("editApply").addEventListener("click", applyEdit);
  $("editCancel").addEventListener("click", cancelEdit);
  $("editDlg").addEventListener("cancel", e => { e.preventDefault(); cancelEdit(); });
  // Ctrl/⌘+Enter applies; Tab stays a way out of the text box
  $("editText").addEventListener("keydown", e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopPropagation(); applyEdit(); } });

  // until a data file is read there is no form: a change of a field is ignored
  // (the fields are drawn again when the file has been read)
  for (const ev of ["input", "change"])
    $("settings").addEventListener(ev, e => { if (!form && e.target.id !== "live") e.stopPropagation(); }, true);
  $("ptype").addEventListener("change", e => {
    const old = form.plotType, t = +e.target.value;
    form.plotType = t;
    if (HAS_Y(t) && (!HAS_Y(old) || old !== t)) [form.yLow, form.yHigh] = t === 5 && form.Eh ? [-1, 1] : Y_DEFAULT[t];
    if (t === 0) {               // Predom: two varied axes and a main component
      // with e- in the system, the usual diagram has e- (Eh or pe) on the Y-axis
      const iE = model.components.findIndex(c => isElectron(c.name));
      if (old !== 0 && iE >= 0 && iE !== form.compX) form.compY = iE;
      if (old !== 0 && (form.compMain === form.compX || form.compMain === form.compY)) form.compMain = -1;
      if (form.compY < 0 || form.compY === form.compX) form.compY = model.components.findIndex((c, i) => i !== form.compX && !isElectron(c.name) && !isProton(c.name));
      if (form.compY < 0) form.compY = form.compX === 0 ? 1 : 0;
      // the main component: the one, not in an axis, with most species
      if (form.compMain < 0) {
        let best = 0;
        model.components.forEach((c, i) => {
          if (i === form.compX || i === form.compY || isProton(c.name) || isElectron(c.name)) return;
          const n = model.species.filter(sp => sp.a[i] !== 0).length;
          if (form.compMain < 0 || n > best) { form.compMain = i; best = n; }
        });
      }
      if (form.compMain < 0) form.compMain = form.compY;
      makeVaried(form.compY);
    } else if (old === 0 && form.compY >= 0 && form.compY !== form.compX) {
      makeFixed(form.compY);
    }
    if (HAS_COMPY(t) && t !== 0 && form.compY < 0) form.compY = model.components.findIndex(c => !isProton(c.name) && !isElectron(c.name));
    drawDiagramForm(); drawConcs(); checkDirty();
  });
  $("compX").addEventListener("change", e => {
    const old = form.compX, i = +e.target.value;
    form.compX = i;
    if (old !== i && !(form.plotType === 0 && old === form.compY)) makeFixed(old);
    makeVaried(i); drawConcs(); checkDirty();
  });
  $("compY").addEventListener("change", e => {
    const old = form.compY, i = +e.target.value;
    form.compY = i;
    if (form.plotType === 0) { if (old >= 0 && old !== form.compX) makeFixed(old); makeVaried(i); }
    drawConcs(); checkDirty();
  });
  $("compMain").addEventListener("change", e => { form.compMain = +e.target.value; checkConcs(); checkDirty(); });
  $("yLow").addEventListener("change", e => { form.yLow = parseFloat(e.target.value); checkConcs(); checkDirty(); });
  $("yHigh").addEventListener("change", e => { form.yHigh = parseFloat(e.target.value); checkConcs(); checkDirty(); });
  $("eh").addEventListener("change", e => {
    form.Eh = e.target.checked;
    if (form.plotType === 5) {
      const f = fEh(), c = v => v === null || !isFinite(v) ? v : form.Eh ? round(v * f, 3) : round(v / f, 1);
      form.yLow = c(form.yLow); form.yHigh = c(form.yHigh);
    }
    drawDiagramForm(); drawConcs(); checkDirty();
  });
  $("title").addEventListener("change", e => { form.title = e.target.value; checkDirty(); });
  $("rev").addEventListener("change", () => { if (model) drawConcs(); });
  $("ionic").addEventListener("change", () => { if (model) checkConcs(); });
  $("temp").addEventListener("change", () => { if (model && form.Eh) drawConcs(); });
  $("concTable").addEventListener("change", e => {
    const el = e.target, i = +(el.dataset.hur || el.dataset.low || el.dataset.high);
    if (redrawing || el.dataset.slide !== undefined) return;   // a field being replaced fires its pending "change" (Chrome)
    if (el.id === "yLow" || el.id === "yHigh") return;         // the Y-axis row has its own listeners
    if (el.dataset.hur !== undefined) {
      changeType(i, +el.value); drawConcs();
    } else {
      // both values of the row, converted from pH, pe or Eh (the row may show them swapped)
      const k = form.concs[i], row = el.closest("tr");
      k.cLow = toFile(i, k.hur, parseFloat(row.querySelector("[data-low]").value));
      if (varied(k.hur)) k.cHigh = toFile(i, k.hur, parseFloat(row.querySelector("[data-high]").value));
      else if (isFinite(k.cLow)) syncSlider(i);
      checkConcs();
    }
    checkDirty();
  });
  $("specTable").addEventListener("change", e => {
    if (e.target.dataset.logk !== undefined && e.target.value !== "") setLogK(+e.target.dataset.logk, e.target.value);
  });
  $("specTable").addEventListener("input", e => { if (e.target.dataset.kslide !== undefined) slideLogK(e.target); });
  $("specTable").addEventListener("click", e => {
    const k = e.target.dataset.kreset;
    if (k !== undefined && model.species[+k]) setLogK(+k, kShown(+k).orig);
  });
  $("kMode").value = kMode;
  $("kMode").addEventListener("change", e => {
    e.stopPropagation();
    kMode = ["step", "stepb"].includes(e.target.value) ? e.target.value : "cum";
    try { localStorage.setItem(K_MODE, kMode); } catch (err) {}
    if (model) drawSystem();
  });
  $("delOff").addEventListener("click", deleteInactive);
  $("specTable").addEventListener("change", e => {
    const d = e.target.dataset;
    if (d.off) changeSystem("modreaction", `-deact=${d.off}`);
    else if (d.on) changeSystem("modreaction", `-act=${d.on}`);
  });
  $("compTable").addEventListener("click", async e => {
    if (e.target.dataset.up !== undefined) { moveComponent(+e.target.dataset.up, true); return; }
    if (e.target.dataset.down !== undefined) { moveComponent(+e.target.dataset.down, false); return; }
    const i = e.target.dataset.del;
    if (i !== undefined && await EqDialog.confirm(`Delete the component ${model.components[+i].name} and all reactions with it?`))
      changeSystem("modchemsyst", `-del=${model.components[+i].name}`);
  });
  $("compTable").addEventListener("change", e => {
    const i = e.target.dataset.exch;
    if (i !== undefined && e.target.value) changeSystem("modchemsyst", `-exch=${model.components[+i].name},${e.target.value}`);
  });

  // merging: a chooser with the files saved in this browser (but this one) and
  // a file from the computer, under the note on incomplete merged systems
  async function openMerge() {
    if (!model || busy) return;
    let keys = [];
    try { keys = (await Store.keys("files")).filter(k => k !== stored && !/\.plt$/i.test(k)); } catch (e) {}
    $("mergeNote").textContent = MERGE_NOTE.replace(/\n\nAre you sure that you still want to do this\?$/, "");
    $("mergeList").innerHTML = keys.length ? keys.map(k => `<li><button type="button" data-merge="${esc(k)}">${esc(k)}</button></li>`).join("")
      : `<li class="empty">No other data files in this browser.</li>`;
    $("mergeDlg").showModal();
  }
  $("mergeBtn").addEventListener("click", openMerge);
  $("mergeList").addEventListener("click", async e => {
    const b = e.target.closest("[data-merge]");
    if (!b) return;
    $("mergeDlg").close();
    const text = await Store.get("files", b.dataset.merge);
    if (text) await mergeWith(b.dataset.merge, text);
  });
  $("mergeDisk").addEventListener("click", () => { $("mergeDlg").close(); $("mergeFile").click(); });
  $("mergeFile").addEventListener("change", async e => {
    const f = e.target.files[0]; e.target.value = "";
    if (f) await mergeWith(f.name, await f.text());
  });

  // ---------------------------------------------------------------- sliders of the options (live mode)
  // The ionic strength (0 to 1 mol/kg) and, in advanced mode, the temperature
  // of the calculation (0 to 100 °C) have a slider under their field. The
  // slider writes the field; its "input" reaches the settings, so the diagram
  // is plotted again, and at the end of a drag the field reports a change.
  function syncOptSlides() {
    for (const sl of document.querySelectorAll(".optslide")) {
      const v = parseFloat($(sl.dataset.for).value);
      const none = sl.dataset.for === "temp" ? (model && isFinite(model.temperature) ? model.temperature : 25) : 0;
      sl.value = isFinite(v) ? Math.min(+sl.max, Math.max(+sl.min, v)) : none;
    }
  }
  document.querySelectorAll(".optslide").forEach(sl => {
    const field = $(sl.dataset.for);
    sl.addEventListener("input", () => { field.value = sl.value; });
    sl.addEventListener("change", e => { e.stopPropagation(); field.dispatchEvent(new Event("change", { bubbles: true })); });
    for (const ev of ["input", "change"]) field.addEventListener(ev, e => { if (e.target === field) syncOptSlides(); });
  });

  // ---------------------------------------------------------------- saved defaults
  // "Save as defaults" (advanced mode) keeps the calculation options in this
  // browser for the diagram tabs opened later, as the button of the desktop
  // Spana; "Program defaults" goes back to the options of the programs.
  const DEF_KEY = "eqdiagr.calcDefaults";
  const DEF_IDS = ["nsteps", "ionic", "model", "tol", "tolA", "units", "notation", "height", "thr", "aqu", "ph", "rev",
                   "tblOn", "tblExt", "tblSep", "tblCs", "tblCe", "dbg", "dbgH"];
  const fieldValue = el => el.type === "checkbox" ? el.checked : el.value;
  const setFields = d => { for (const id of DEF_IDS) if (id in d) { const el = $(id); if (el.type === "checkbox") el.checked = !!d[id]; else el.value = d[id]; } };
  const PROGRAM_DEFAULTS = Object.fromEntries(DEF_IDS.map(id => [id, fieldValue($(id))]));
  try { setFields(JSON.parse(localStorage.getItem(DEF_KEY) || "{}") || {}); } catch (e) {}
  $("saveDef").addEventListener("click", () => {
    try {
      localStorage.setItem(DEF_KEY, JSON.stringify(Object.fromEntries(DEF_IDS.map(id => [id, fieldValue($(id))]))));
      status("ok", "These options are used for the diagram tabs opened from now on in this browser.");
    } catch (e) { status("fail", "The options could not be saved in this browser."); }
  });
  $("resetDef").addEventListener("click", () => {
    try { localStorage.removeItem(DEF_KEY); } catch (e) {}
    setFields(PROGRAM_DEFAULTS);
    if (model) { drawConcs(); updateStale(); }
    status("ok", "The options are those of the programs again.");
  });

  // ---------------------------------------------------------------- in the app window (app-view.js)
  if (window.EqView) {
    Object.assign(EqView.commands, {
      make: "make", stop: { can: () => busy, run: () => engine.stop() }, dat: "dlDat", editDat: "editDat",
      // the "Save in browser" button is not shown in the app (File menu instead)
      saveMy: { can: () => !!dat && !busy, run: saveMy },
      svg: "dlSvg", png: "dlPng", pdf: "dlPdf", eps: "dlEps", plt: "dlPlt", table: "dlCsv", plotStyle: openStyle, copyImg: "copyImg", keep: "keepBtn",
      unkeep: { can: () => overlays.length > 0, run: () => unkeep("all") },
      print: { can: () => !!(last && last.plt), run: () => window.print() },
      messages: () => { $("logDetails").open = true; $("logDetails").scrollIntoView({ block: "nearest" }); }
    });
    EqView.openText = openAny;
    EqView.hasFile = () => !!model;
    EqView.isDirty = () => dirty;
    EqView.saveNow = saveNow;
    // the data file with the settings of the form, for a link to the diagram
    EqView.shareData = async () => (dat && await applyForm()) ? { name: fileName + ".dat", text: dat } : null;
    document.addEventListener("eqmode", () => { if (model) { drawSystem(); drawDiagramForm(); drawConcs(); updateStale(); if (last && last.plt) showPlot(); } });
  }

  // on its own (not in the app window), the browser asks before leaving with changes
  window.addEventListener("beforeunload", e => {
    if (dirty && !(window.EqView && EqView.embedded)) { e.preventDefault(); e.returnValue = ""; }
  });

  // start: a file handed over by the database search (?file=name in browser storage)
  (async () => {
    await refreshMyFiles();
    const want = new URLSearchParams(location.search).get("file");
    if (want) {
      try { const text = await Store.get("files", want); if (text) await loadText(want, text, true); }
      catch (e) { status("fail", "Could not read the file from browser storage: " + e.message); }
    }
  })();
})();
