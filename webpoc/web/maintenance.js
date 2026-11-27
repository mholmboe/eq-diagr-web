// Page logic for maintenance.html: the tools of DataMaintenance and
// AddShowReferences. The work is done by eq-diagr's own code in the engine
// (webec.DbMaint, through engine.maint); the database files are in /db/ there,
// the same set of files as on the Database page (browser storage "databases").
(function () {
  const $ = id => document.getElementById(id);
  const engine = new EqDiagrEngine();
  const ELEMENTS = ("H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr " +
    "Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu " +
    "Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr").split(" ")
    .sort((a, b) => a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0);
  const NREAC = 6;   // reactant boxes in DataMaintenance's "Add data" window
  const esc = t => String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const isRefs = n => /references.*\.txt$/i.test(n);
  const isDb = n => /\.(db|txt|skv|csv)$/i.test(n) && !isRefs(n);

  let files = [];         // [{name, buffer}] as on the Database page
  let statsText = "", singleLines = null, binResult = null;
  let add = null;         // {path, name, content, editing (line or null), editingComp}
  let refs = null;        // {name, map: Map(key -> text)}

  // ---------------------------------------------------------------- the set of files
  const dbs = () => files.filter(f => isDb(f.name)).map(f => "/db/" + f.name);
  const refsPath = () => { const f = files.find(f => isRefs(f.name)); return f ? "/db/" + f.name : ""; };
  const enc = text => new TextEncoder().encode(text).buffer;

  async function setFiles(newFiles, fromStore) {
    const map = {};
    for (const f of newFiles) map["/db/" + f.name] = f.buffer;
    const w = await engine.writeFiles(map, { persist: true });
    if (!w.ok) { status("fail", "Could not load the files; see the messages."); log(w.log || w.error); return; }
    for (const f of newFiles) {
      const i = files.findIndex(x => x.name.toLowerCase() === f.name.toLowerCase());
      if (i >= 0) files[i] = f; else files.push(f);
    }
    if (!fromStore) await remember();
    drawSet();
  }
  // every change of the set comes here: it is remembered in this browser (if
  // chosen) and, in the app window, handed to the other views
  async function remember() {
    if (window.EqView) EqView.publishDatabases(files.slice());
    if (!$("remember").checked) return;
    try { await Store.put("databases", "current", files); } catch (e) {}
  }
  // a file changed by the engine: read it back into the set (and browser storage)
  async function syncFromEngine(names) {
    const r = await engine.readFiles(names.map(n => "/db/" + n));
    for (const n of names) {
      const text = r["/db/" + n];
      if (text == null) continue;
      const i = files.findIndex(x => x.name === n), f = { name: n, buffer: enc(text) };
      if (i >= 0) files[i] = f; else files.push(f);
      engine.persistent.set("/db/" + n, { text });
    }
    await remember();
    drawSet();
  }
  function missingElementFiles() {
    const names = files.map(f => f.name.toLowerCase());
    return files.filter(f => isDb(f.name)).map(f => f.name).filter(d => {
      const base = d.replace(/\.[^.]+$/, "").toLowerCase(), ext = /\.db$/i.test(d) ? [".elb"] : [".elt", ".elm"];
      return !ext.some(e => names.includes(base + e));
    });
  }
  async function drawSet() {
    const list = files.filter(f => isDb(f.name));
    $("dbList").innerHTML = list.map((f, i) => `<li><button data-up="${i}" ${i ? "" : "disabled"} title="move up">↑</button>` +
      `<button data-down="${i}" ${i < list.length - 1 ? "" : "disabled"} title="move down">↓</button>` +
      `<button data-rm="${esc(f.name)}" title="remove from the list">×</button> ${esc(f.name)}</li>`).join("");
    const missing = missingElementFiles(), r = refsPath();
    $("dbstatus").textContent = !list.length ? "No database loaded." :
      `${list.length} database${list.length > 1 ? "s" : ""}` + (r ? `; references: ${r.slice(4)}` : "; no references file") +
      (missing.length ? `. Missing element file for: ${missing.join(", ")}.` : ".");
    const b = BuiltinDb.which(files);
    $("builtin").innerHTML = Object.entries(BuiltinDb.SETS).map(([k, s]) => `<option value="${k}">${s.label}</option>`).join("") +
      (b ? "" : `<option value="">your own files</option>`);
    $("builtin").value = b || "";
    const bins = list.filter(f => /\.db$/i.test(f.name));
    $("toTextDb").innerHTML = bins.map(f => `<option>${esc(f.name)}</option>`).join("") || `<option value="">no binary database (.db) is loaded</option>`;
    $("toTextDb").disabled = $("toTextRun").disabled = !bins.length;
    const texts = list.filter(f => /\.txt$/i.test(f.name)).map(f => f.name);
    const keep = $("addFile").value;
    $("addFile").innerHTML = texts.map(n => `<option>${esc(n)}</option>`).join("") + `<option value="">New text database…</option>`;
    if (keep && texts.includes(keep)) $("addFile").value = keep;
    const refFiles = files.filter(f => isRefs(f.name)).map(f => f.name);
    $("refFile").innerHTML = refFiles.map(n => `<option>${esc(n)}</option>`).join("") + `<option value="">New references file…</option>`;
    // the components for "single component"
    if (list.length && !missing.length) {
      const c = await engine.maint("dbSingleChoices", { databases: dbs(), includeH2O: false });
      const keepC = $("singleComp").value;
      $("singleComp").innerHTML = c.ok ? c.components.map(x => `<option>${esc(x)}</option>`).join("") : "";
      if (keepC) $("singleComp").value = keepC;
    } else $("singleComp").innerHTML = "";
  }
  function ready() {
    if (!dbs().length) { status("fail", "Load a database first."); return false; }
    const m = missingElementFiles();
    if (m.length) { status("fail", "Missing element file for: " + m.join(", ")); return false; }
    return true;
  }
  $("dbList").addEventListener("click", async e => {
    const b = e.target.closest("button");
    if (!b) return;
    const list = files.filter(f => isDb(f.name));
    if (b.dataset.rm) files = files.filter(f => f.name !== b.dataset.rm);
    else {
      const i = +(b.dataset.up !== undefined ? b.dataset.up : b.dataset.down), j = b.dataset.up !== undefined ? i - 1 : i + 1;
      const a = files.indexOf(list[i]), c = files.indexOf(list[j]);
      [files[a], files[c]] = [files[c], files[a]];
    }
    await remember(); drawSet();
  });

  // ---------------------------------------------------------------- statistics
  $("statsRun").addEventListener("click", async () => {
    if (!ready()) return;
    status("", "Reading the databases…");
    const r = await engine.maint("dbStats", { databases: dbs(), references: refsPath(), date: new Date().toLocaleString("en-GB") });
    log(r.log);
    if (!r.ok) { status("fail", "The statistics failed: " + (r.error || "see the messages.")); return; }
    statsText = r.text;
    $("statsOut").textContent = statsText; $("statsOut").hidden = false; $("statsSave").disabled = false;
    const errs = (statsText.match(/^Error/gm) || []).length, warns = (statsText.match(/^Warning/gm) || []).length;
    status(errs ? "fail" : "ok", `Statistics made: ${errs} kind${errs === 1 ? "" : "s"} of error, ${warns} of warning.`);
  });
  $("statsSave").addEventListener("click", () => download(statsText, "Statistics.txt", "text/plain"));

  // ---------------------------------------------------------------- single component
  $("singleRun").addEventListener("click", async () => {
    if (!ready() || !$("singleComp").value) return;
    const comp = $("singleComp").value;
    const r = await engine.maint("dbSingle", { databases: dbs(), component: comp });
    log(r.log);
    if (!r.ok) { status("fail", "The search failed: " + (r.error || "see the messages.")); return; }
    singleLines = [r.firstLine].concat(r.lines);
    $("singleNote").textContent = `${comp}: found in ${r.lines.length} reaction${r.lines.length === 1 ? "" : "s"} of the database${dbs().length > 1 ? "s" : ""}.`;
    $("singleOut").textContent = r.lines.join("\n"); $("singleOut").hidden = !r.lines.length;
    $("singleSave").disabled = !r.lines.length;
    status("ok", "");
  });
  $("singleSave").addEventListener("click", () => download(singleLines.join("\n") + "\n", "single_comp.txt", "text/plain"));

  // ---------------------------------------------------------------- to text, to binary
  $("toTextRun").addEventListener("click", async () => {
    const db = $("toTextDb").value;
    if (!db) { status("fail", "No binary database (.db) is loaded."); return; }
    const elb = db.replace(/\.db$/i, ".elb");
    const r = await engine.dbToText("/db/" + db, "/db/" + elb);
    log(r.log);
    if (!r.ok) { status("fail", "The conversion failed: " + (r.error || "see the messages.")); return; }
    const txt = db.replace(/\.db$/i, ".txt"), elt = elb.replace(/\.elb$/i, ".elt");
    download(r.files["/db/" + txt], txt, "text/plain");
    download(r.files["/db/" + elt], elt, "text/plain");
    if ($("toTextUse").checked) await syncFromEngine([txt, elt]);
    status("ok", `${db}: ${r.reactions} reactions written to ${txt} and ${elt}.`);
  });
  $("binRun").addEventListener("click", async () => {
    if (!ready()) return;
    let name = $("binName").value.trim() || "Reactions.db";
    if (!/\.db$/i.test(name)) name += ".db";
    status("", "Merging…");
    const out = "/out/" + name;
    const r = await engine.maint("dbMerge", { databases: dbs(), out });
    log((r.warnings || []).join("\n") + (r.warnings && r.warnings.length ? "\n\n" : "") + (r.log || ""));
    if (!r.ok) { status("fail", "The merge failed: " + (r.error || "see the messages.")); $("logDetails").open = true; return; }
    const elb = name.replace(/\.db$/i, ".elb");
    const b = await engine.readFiles([out, "/out/" + elb], { binary: true });
    binResult = { name, elb, db: fromB64(b[out]), elbData: fromB64(b["/out/" + elb]) };
    $("binDone").hidden = false;
    status(r.warnings.length ? "fail" : "ok", `${r.reactions} reactions written to ${name} and ${elb}` +
      (r.warnings.length ? `; ${r.warnings.length} reaction${r.warnings.length > 1 ? "s have" : " has"} errors (see the messages).` : "."));
    if (r.warnings.length) $("logDetails").open = true;
  });
  $("binDownload").addEventListener("click", () => {
    download(new Blob([binResult.db]), binResult.name, "application/octet-stream");
    download(new Blob([binResult.elbData]), binResult.elb, "application/octet-stream");
  });
  $("binUse").addEventListener("click", async () => {
    if (!await EqDialog.confirm(`Replace the databases in the list with ${binResult.name}?`)) return;
    files = files.filter(f => !isDb(f.name) && !/\.(elb|elt|elm)$/i.test(f.name));
    await setFiles([{ name: binResult.name, buffer: binResult.db.buffer }, { name: binResult.elb, buffer: binResult.elbData.buffer }]);
    status("ok", `The databases are now ${binResult.name}.`);
  });

  // ---------------------------------------------------------------- add data / edit a text database
  function reacRows() {
    const opts = add && add.content ? [...new Set(add.content.reactants)] : [];
    $("rReac").innerHTML = Array.from({ length: NREAC }, (_, i) =>
      `<input class="num" data-coef="${i}" type="text" placeholder="coef.">` +
      `<select data-reac="${i}"><option value=""></option>${opts.map(o => `<option>${esc(o)}</option>`).join("")}</select>`).join("");
  }
  async function addOpen() {
    let name = $("addFile").value;
    if (!name) {
      name = await EqDialog.prompt("Name of the new text database (a .txt file):", "New-Data.txt");
      if (!name) return;
      if (!/\.txt$/i.test(name)) name += ".txt";
      if (files.some(f => f.name.toLowerCase() === name.toLowerCase())) { status("fail", `${name} is already loaded: choose it in the list.`); return; }
    }
    const path = "/db/" + name;
    if (files.some(f => f.name === name)) {
      const c = await engine.maint("addCheck", { file: path });
      const k = c.ok ? c.check : {}, w = [];
      if (k.unknownReactants && k.unknownReactants.length) w.push("Reactants not found in the element file (add them as components): " + k.unknownReactants.join(", "));
      if (k.zeroCoefficients && k.zeroCoefficients.length) w.push("Reactions with a reactant without coefficient, or a coefficient without reactant: " + k.zeroCoefficients.join(", "));
      if (k.chargeImbalance && k.chargeImbalance.length) w.push("Reactions that are NOT charge balanced: " + k.chargeImbalance.join(", "));
      $("addWarn").textContent = w.join("\n");
    } else $("addWarn").textContent = "";
    add = { path, name, editing: null, editingComp: null };
    await addShow();
    $("addPanel").hidden = false;
    newReaction(); newComponent();
  }
  async function addShow() {
    const others = dbs().filter(d => d !== add.path);
    const r = await engine.maint("addShow", { databases: others, file: add.path });
    log(r.log);
    if (!r.ok) { status("fail", "Could not read the file: " + (r.error || "see the messages.")); return false; }
    add.content = r.content;
    add.ele = r.content.elementFile.slice(4);
    $("addName").textContent = add.name; $("addEleName").textContent = add.ele;
    const rs = r.content.reactions;
    $("addReactions").innerHTML = rs.length ? `<tr><th>Reaction</th><th>Reference</th><th></th></tr>` + rs.map((x, i) =>
      `<tr class="${x.chargeBalanced || x.name.startsWith("@") ? "" : "bad"}"><td class="n" title="${esc(x.line)}">${esc(x.name)}</td>` +
      `<td class="r">${esc(x.text)}${x.chargeBalanced || x.name.startsWith("@") ? "" : " (NOT charge balanced)"}<br><span class="note">${esc(x.reference)}${x.comment ? " / " + esc(x.comment) : ""}</span></td>` +
      `<td style="white-space:nowrap"><button data-edit="${i}">edit</button> <button data-del="${i}">delete</button></td></tr>`).join("")
      : `<tr><td class="note">No reactions yet.</td></tr>`;
    $("addComponents").innerHTML = `<tr><th>Component</th><th>Description</th><th>Linked to</th><th></th></tr>` + r.content.components.map((c, i) =>
      `<tr><td class="n">${esc(c.name)}</td><td>${esc(c.description)}</td><td>${esc(c.linkedTo)}</td>` +
      `<td style="white-space:nowrap">${["H2O", "H+", "e-"].includes(c.name) ? "" : `<button data-cedit="${i}">edit</button> <button data-cdel="${i}">delete</button>`}</td></tr>`).join("");
    const keep = readReactionForm();
    reacRows();
    writeReactionForm(keep);
    return true;
  }
  function readReactionForm() {
    return {
      name: $("rName").value, logK: $("rLogK").value, deltaH: $("rDH").value, deltaCp: $("rDCp").value,
      reference: $("rRef").value, comment: $("rComment").value,
      reactants: [...document.querySelectorAll("#rReac select")].map(s => s.value),
      coefficients: [...document.querySelectorAll("#rReac input")].map(s => s.value)
    };
  }
  function writeReactionForm(f) {
    $("rName").value = f.name || ""; $("rLogK").value = f.logK || ""; $("rDH").value = f.deltaH || ""; $("rDCp").value = f.deltaCp || "";
    $("rRef").value = f.reference || ""; $("rComment").value = f.comment || "";
    const sels = document.querySelectorAll("#rReac select"), coefs = document.querySelectorAll("#rReac input");
    for (let i = 0; i < NREAC; i++) {
      const r = (f.reactants || [])[i] || "";
      if (r && ![...sels[i].options].some(o => o.value === r)) sels[i].insertAdjacentHTML("beforeend", `<option>${esc(r)}</option>`);
      sels[i].value = r; coefs[i].value = (f.coefficients || [])[i] || "";
    }
    reactionText();
  }
  function newReaction() {
    add.editing = null; $("reacLegend").textContent = "New reaction";
    writeReactionForm({});
    $("rDH").disabled = $("rDCp").disabled = false; $("rNote").textContent = "";
  }
  // the reaction as text, with a charge-balance check made in the page (the engine checks again on saving)
  function charge(n) {
    const m = n.replace(/\((cr|c|s|am|g|l|aq|ss)\)$/, "").match(/(?:\s(\d*)([+-])|([+-]+)|([+-])(\d+))$/);
    if (!m) return 0;
    if (m[2]) return (m[2] === "+" ? 1 : -1) * (m[1] ? +m[1] : 1);
    if (m[3]) return (m[3][0] === "+" ? 1 : -1) * m[3].length;
    return (m[4] === "+" ? 1 : -1) * +m[5];
  }
  function reactionText() {
    const f = readReactionForm(), parts = [], prods = [];
    let z = 0;
    f.reactants.forEach((r, i) => {
      if (!r) return;
      const c = parseFloat(f.coefficients[i]);
      if (!isFinite(c) || c === 0) return;
      z += c * (r === "e-" ? -1 : charge(r));
      (c > 0 ? parts : prods).push(`${Math.abs(c) === 1 ? "" : Math.abs(c) + " "}${r}`);
    });
    if (!f.name) { $("rText").textContent = ""; return; }
    const balanced = f.name.startsWith("@") || Math.abs(z - charge(f.name)) < 1e-6;
    $("rText").textContent = f.name.startsWith("@") ? `${f.name}: excludes "${f.name.slice(1)}" from database searches.` :
      `${parts.join(" + ")} = ${prods.concat([f.name]).join(" + ")}${f.logK ? ";  log K = " + f.logK : ""}` + (balanced ? "" : "   (NOT charge balanced?)");
  }
  $("rReac").addEventListener("change", e => {
    const i = e.target.dataset.reac;
    if (i !== undefined) {   // as the window: a chosen reactant gets coefficient 1
      const c = document.querySelector(`#rReac input[data-coef="${i}"]`);
      if (e.target.value && !c.value) c.value = "1";
      if (!e.target.value) c.value = "";
    }
    reactionText();
  });
  ["rName", "rLogK"].forEach(id => $(id).addEventListener("input", reactionText));
  $("rReac").addEventListener("input", reactionText);
  $("rNew").addEventListener("click", newReaction);
  $("rSave").addEventListener("click", async () => {
    const f = readReactionForm();
    if (!f.name.trim()) { status("fail", "A name is needed for the complex!"); return; }
    const exists = add.content.reactions.some(x => x.name.replace(/^@/, "") === f.name.trim().replace(/^@/, ""));
    let q = f.name.startsWith("@") ? `The species name begins with "@".\n\nThis will exclude "${f.name.slice(1)}" when searching the databases.\n\n` : "";
    q += exists ? `Replace the existing reaction for "${f.name.trim()}" with\n${$("rText").textContent}?` : `Add reaction?\n${$("rText").textContent}`;
    if (!await EqDialog.confirm(q)) return;
    const r = await engine.maint("addSaveReaction", Object.assign({ databases: dbs().filter(d => d !== add.path), file: add.path, original: add.editing || "" }, f));
    log(r.log);
    if (!r.ok) { status("fail", errorText(r.error)); return; }
    await afterAddChange();
    newReaction();
    status("ok", `${r.saved.replaced ? "Replaced" : "Added"}: ${r.saved.line}`);
  });
  $("addReactions").addEventListener("click", async e => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.edit !== undefined) {
      const x = add.content.reactions[+b.dataset.edit];
      add.editing = x.line; $("reacLegend").textContent = "Edit reaction";
      writeReactionForm({ name: x.name, logK: x.logK, deltaH: x.deltaH, deltaCp: x.deltaCp, reference: x.reference, comment: x.comment,
                          reactants: x.reactants, coefficients: x.coefficients });
      $("rDH").disabled = $("rDCp").disabled = x.analytic || x.lookUp;
      $("rNote").textContent = x.lookUp ? "log K values at different temperatures are given in a look-up table." :
                               x.analytic ? "The temperature variation of log K uses a power-series expression." : "";
      $("rName").scrollIntoView({ block: "center" });
    } else if (b.dataset.del !== undefined) {
      const x = add.content.reactions[+b.dataset.del];
      if (!await EqDialog.confirm(`Delete  ${x.name.replace(/^@/, "")} ?`)) return;
      const r = await engine.maint("addDeleteReaction", { databases: dbs().filter(d => d !== add.path), file: add.path, line: x.line });
      log(r.log);
      if (!r.ok) { status("fail", errorText(r.error)); return; }
      if (r.unused.length && await EqDialog.confirm(`The following reactant${r.unused.length > 1 ? "s" : ""} in file "${add.ele}" ${r.unused.length > 1 ? "are" : "is"} not used:\n  ${r.unused.join("\n  ")}\n\nRemove ${r.unused.length > 1 ? "them" : "it"}?`)) {
        const r2 = await engine.maint("addRemoveComponents", { databases: dbs().filter(d => d !== add.path), file: add.path, remove: r.unused });
        if (!r2.ok) { status("fail", errorText(r2.error)); return; }
      }
      await afterAddChange();
      status("ok", `Deleted: ${x.name}`);
    }
  });
  // components
  function newComponent() {
    add.editingComp = null; $("compLegend").textContent = "New component";
    $("cName").value = ""; $("cDescr").value = "";
    [...$("cElems").options].forEach(o => o.selected = false);
  }
  $("cElems").innerHTML = ELEMENTS.map(s => `<option>${s}</option>`).join("");
  $("cNew").addEventListener("click", newComponent);
  $("addComponents").addEventListener("click", async e => {
    const b = e.target.closest("button");
    if (!b) return;
    const c = add.content.components[+(b.dataset.cedit !== undefined ? b.dataset.cedit : b.dataset.cdel)];
    if (b.dataset.cedit !== undefined) {
      add.editingComp = c.name; $("compLegend").textContent = "Edit component";
      $("cName").value = c.name; $("cDescr").value = c.description;
      const linked = c.linkedTo.split(",").map(s => s.trim());
      [...$("cElems").options].forEach(o => o.selected = linked.includes(o.value));
      $("cName").scrollIntoView({ block: "center" });
    } else {
      if (!await EqDialog.confirm(`Delete  ${c.name} ?`)) return;
      const r = await engine.maint("addDeleteComponent", { databases: dbs().filter(d => d !== add.path), file: add.path, name: c.name });
      log(r.log);
      if (!r.ok) { status("fail", errorText(r.error)); return; }
      await afterAddChange();
      status("ok", `Deleted component ${c.name}.`);
    }
  });
  $("cSave").addEventListener("click", async () => {
    const name = $("cName").value.trim(), descr = $("cDescr").value.trim();
    const elems = [...$("cElems").selectedOptions].map(o => o.value);   // already in alphabetical order, as the window sorts them
    if (!name) { status("fail", "Please: give the name of the component."); return; }
    if (!elems.length) { status("fail", `Please: link component "${name}" to some element(s).`); return; }
    const linked = elems.join(", "), old = add.content.components.find(c => c.name === name);
    if (!await EqDialog.confirm(old ? `Replace:\n  "${name}" linked to: ${old.linkedTo}\n\nwith:\n   "${name}" linked to: ${linked}` : `Add component "${name}"\nlinked to: ${linked} ?`)) return;
    const r = await engine.maint("addSaveComponent", { databases: dbs().filter(d => d !== add.path), file: add.path, name, linkedTo: linked, description: descr });
    log(r.log);
    if (!r.ok) { status("fail", errorText(r.error)); return; }
    await afterAddChange();
    newComponent();
    status("ok", `Saved component ${name} (linked to ${linked}).`);
  });
  async function afterAddChange() {
    const names = [add.name, add.ele];
    const inSet = files.some(f => f.name === add.name);
    if (inSet || await EqDialog.confirm(`The file "${add.name}" will be added to the list of available databases.`)) await syncFromEngine(names);
    else await syncFromEngine([]);   // keep the set; the files stay in the engine for this page
    await addShow();
    $("addFile").value = add.name;
  }
  $("addOpen").addEventListener("click", () => addOpen().catch(e => status("fail", String(e))));
  $("addDownload").addEventListener("click", async () => {
    const r = await engine.readFiles([add.path, "/db/" + add.ele]);
    if (r[add.path] != null) download(r[add.path], add.name, "text/plain");
    if (r["/db/" + add.ele] != null) download(r["/db/" + add.ele], add.ele, "text/plain");
  });
  const errorText = e => String(e || "see the messages.").replace(/^java\.lang\.Exception: /, "");

  // ---------------------------------------------------------------- references (AddShowReferences)
  function refKeyList(select) {
    const keys = [...refs.map.keys()].sort((a, b) => a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0);
    $("refKeys").innerHTML = `<option value="">${keys.length} references…</option>` + keys.map(k => `<option>${esc(k)}</option>`).join("");
    if (select) $("refKeys").value = select;
  }
  $("refOpen").addEventListener("click", async () => {
    let name = $("refFile").value, text = "";
    if (!name) {
      name = await EqDialog.prompt("Name of the new references file:", "References.txt");
      if (!name) return;
      if (!/\.txt$/i.test(name)) name += ".txt";
      if (!isRefs(name)) { status("fail", "The name of a references file must contain \"references\", as References.txt."); return; }
    } else text = new TextDecoder().decode(files.find(f => f.name === name).buffer);
    refs = { name, map: JavaProperties.load(text) };
    refKeyList(); $("refKey").value = ""; $("refText").value = "";
    $("refPanel").hidden = false;
    status("ok", `${name}: ${refs.map.size} references.`);
  });
  $("refKeys").addEventListener("change", () => {
    const k = $("refKeys").value;
    $("refKey").value = k; $("refText").value = k ? refs.map.get(k) : "";
  });
  $("refNew").addEventListener("click", () => { $("refKeys").value = ""; $("refKey").value = ""; $("refText").value = ""; $("refKey").focus(); });
  async function saveRefs(msg, select) {
    const text = JavaProperties.store(refs.map);
    await setFiles([{ name: refs.name, buffer: enc(text) }]);
    refKeyList(select);
    $("refFile").value = refs.name;
    status("ok", msg);
  }
  // as References.setRef: an empty text deletes the citation
  $("refSave").addEventListener("click", async () => {
    const key = $("refKey").value.trim(), txt = $("refText").value.trim();
    if (!key) { status("fail", "Give the reference key (citation)."); return; }
    if (!txt) { if (refs.map.has(key) && await EqDialog.confirm(`Delete reference "${key}"?`)) { refs.map.delete(key); await saveRefs(`Deleted: ${key}`); } return; }
    if (refs.map.has(key) && refs.map.get(key) !== txt && !await EqDialog.confirm(`Replace the reference "${key}"?`)) return;
    refs.map.set(key, txt);
    await saveRefs(`Saved: ${key}`, key);
  });
  $("refDelete").addEventListener("click", async () => {
    const key = $("refKey").value.trim();
    if (!key || !refs.map.has(key) || !await EqDialog.confirm(`Delete reference "${key}"?`)) return;
    refs.map.delete(key);
    $("refKey").value = ""; $("refText").value = "";
    await saveRefs(`Deleted: ${key}`);
  });
  $("refDownload").addEventListener("click", () => download(JavaProperties.store(refs.map), refs.name, "text/plain"));

  // ---------------------------------------------------------------- loading and helpers
  function status(cls, text) { $("status").className = cls; $("status").textContent = text; }
  function log(text) { $("log").textContent = text || ""; }
  function fromB64(b) { const s = atob(b), a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }
  function download(data, filename, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
    a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  }
  // a bundled database (builtin-db.js) replaces the set
  $("builtin").addEventListener("change", async e => {
    const id = e.target.value;
    if (!id) return;
    try {
      const f = await BuiltinDb.fetch(id);
      await BuiltinDb.choose(id);
      files = [];
      await setFiles(f, true);
      if (window.EqView) EqView.publishDatabases(files.slice());
      status("ok", `The databases are now the ${BuiltinDb.SETS[id].short}.`);
    } catch (err) { status("fail", "Could not load the database: " + err); }
  });
  // A session: the database files of the list, in their order, in one file
  // (JSON with the files in base64), as the session files of the desktop
  // DataMaintenance name a set of databases.
  const toB64 = buf => { const u = new Uint8Array(buf); let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  $("sessSave").addEventListener("click", () => {
    if (!files.length) { status("fail", "There are no database files to save."); return; }
    const text = JSON.stringify({ format: "eq-diagr session", version: 1, saved: new Date().toISOString(),
      files: files.map(f => ({ name: f.name, base64: toB64(f.buffer) })) });
    download(text, "databases.eqsession", "application/json");
    status("ok", `Session saved: ${files.length} files.`);
  });
  $("sessOpen").addEventListener("click", () => $("sessFile").click());
  $("sessFile").addEventListener("change", async ev => {
    const f = ev.target.files[0]; ev.target.value = "";
    if (!f) return;
    let list = null;
    try {
      const s = JSON.parse(await f.text());
      if (s && s.format === "eq-diagr session" && Array.isArray(s.files))
        list = s.files.filter(x => x && typeof x.name === "string" && typeof x.base64 === "string" && !/[\\/]/.test(x.name))
          .map(x => ({ name: x.name, buffer: Uint8Array.from(atob(x.base64), c => c.charCodeAt(0)).buffer }));
    } catch (e) {}
    if (!list || !list.length) { status("fail", `"${f.name}" is not a session file.`); return; }
    if (files.length && !(await EqDialog.confirm(`Use the ${list.length} files of the session instead of the databases in the list?`, { ok: "Use the session" }))) return;
    files = [];
    await setFiles(list);
    status("ok", `Session opened: ${list.map(x => x.name).join(", ")}.`);
  });
  $("pickFiles").addEventListener("click", () => $("files").click());
  $("files").addEventListener("change", async ev => {
    const f = await Promise.all([...ev.target.files].map(async x => ({ name: x.name, buffer: await x.arrayBuffer() })));
    ev.target.value = "";
    if (f.length) await setFiles(f);
  });
  $("remember").addEventListener("change", async () => {
    if ($("remember").checked) await remember();
    else try { await Store.remove("databases", "current"); } catch (e) {}
  });
  // ---------------------------------------------------------------- in the app window (app-view.js)
  if (window.EqView) {
    const open = id => () => { $(id).open = true; $(id).scrollIntoView({ block: "nearest" }); };
    Object.assign(EqView.commands, {
      stats: open("tStats"), single: open("tSingle"), toText: open("tText"), merge: open("tBin"),
      addData: open("tAdd"), refs: open("tRefs"), messages: open("logDetails")
    });
    EqView.useDatabases = async f => { files = []; await setFiles(f, true); };
  }
  (async () => {
    try {
      const s = await BuiltinDb.startup();
      await setFiles(s.files, true);
    } catch (e) {}
    drawSet();
  })();
})();
