// Page logic for database.html. The search runs in the eq-diagr engine in a
// Web Worker (engine-client.js); database files are written to /db/ there.
(function () {
  const $ = id => document.getElementById(id);
  const engine = new EqDiagrEngine();

  // Periodic table positions (row, column) for Z = 1..103; La-Lu and Ac-Lr in rows 9 and 10.
  const SYMBOLS = ("H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr " +
    "Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu " +
    "Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr").split(" ");
  function position(z) {
    if (z === 1) return [1, 1];
    if (z === 2) return [1, 18];
    const starts = [[3, 2], [11, 3], [19, 4], [37, 5], [55, 6], [87, 7]];
    let row = 0, z0 = 0;
    for (const [s, r] of starts) if (z >= s) { row = r; z0 = s; }
    const i = z - z0;
    if (row <= 3) return [row, i < 2 ? i + 1 : i + 11];
    if (row <= 5) return [row, i + 1];
    if (i < 2) return [row, i + 1];                       // Cs Ba, Fr Ra
    if (i <= 16) return [row + 3, i + 1];                 // La..Lu, Ac..Lr below the table
    return [row, i - 13];                                 // Hf.., (Rf..)
  }

  let elements = [];        // [element, formula, name] from the element files
  let databases = [];       // database file names loaded into the in-memory file system
  let chosen = [];          // components, in the order the user chose them
  let current = null;       // selected element symbol
  let last = null;          // last search result
  let refs = null;          // references file: key -> text
  let excluded = new Set(); // species the user unticked
  let noLogK = new Set();    // species left out because the database has no log K for them

  // files: [{name, buffer}]; how: "user" (loaded now: remembered in this browser
  // if chosen), "browser" (remembered earlier), a bundled database's id
  // (BuiltinDb), or "app" (the set of another view of the app window).
  // A set loaded or chosen here is handed to the other views of the app window.
  let loaded = [], startedH = false;
  async function load(files, how = "user", publish = how !== "browser" && how !== "app") {
    const map = {};
    for (const f of files) map["/db/" + f.name] = f.buffer;
    // the files go to the engine while the page goes on
    const writing = engine.writeFiles(map, { persist: true });
    const writeFailed = w => { $("dbstatus").textContent = "Could not load the files; see the messages."; log(w.log || w.error); };
    const names = files.map(f => f.name);
    const refFile = files.find(f => /references.*\.txt$/i.test(f.name));
    // a set without a references file has no references (not those of the set before)
    refs = refFile ? parseRefs(new TextDecoder().decode(refFile.buffer)) : null;
    databases = names.filter(n => /\.(db|txt|skv|csv)$/i.test(n) && !/references.*\.txt$/i.test(n));
    $("convertDb").innerHTML = names.filter(n => /\.db$/i.test(n)).map(n => `<option>${n}</option>`).join("");
    const missing = databases.filter(d => {
      const base = d.replace(/\.[^.]+$/, ""), ext = /\.db$/i.test(d) ? [".elb"] : [".elt", ".elm"];
      return !ext.some(e => names.some(n => n.toLowerCase() === (base + e).toLowerCase()));
    });
    if (!databases.length || missing.length) {
      $("dbstatus").textContent = !databases.length ? "No database file (.db, .txt or .skv) among the files."
        : "Missing element file for: " + missing.join(", ") + " (load the .elb or .elt file too).";
      databases = []; elements = []; drawTable(); return;
    }
    let els = null;
    // text databases are read here, binary ones by the engine (builtin-db.js)
    try { els = BuiltinDb.readElementsText(files, databases); } catch (err) { els = null; }   // the engine reports the error
    if (els) writing.then(w => { if (!w.ok) writeFailed(w); });
    else {
      const w = await writing;
      if (!w.ok) { writeFailed(w); return; }
      const e = await engine.elements(databases.map(d => "/db/" + d));
      if (!e.ok) { $("dbstatus").textContent = "Could not read the element files; see the messages."; log(e.log || e.error); return; }
      els = e.elements;
    }
    elements = els;
    loaded = files;
    // as DataBase: the water option only if the database has H2O as a component
    // (Util.isWater), and H+ selected when the program starts
    const hasWater = elements.some(x => x[1] === "H2O" || x[1].toUpperCase() === "H2O(L)");
    $("h2oRow").hidden = !hasWater;
    if (!hasWater) $("h2o").checked = false;
    if (!startedH && elements.some(x => x[1] === "H+")) { startedH = true; if (!chosen.length) chosen = ["H+"]; }
    const builtin = BuiltinDb.SETS[how] ? how : BuiltinDb.which(files);
    const nComps = new Set(elements.map(x => x[1])).size;
    $("dbstatus").textContent = builtin ? `The ${BuiltinDb.SETS[builtin].short}: ${databases.join(", ")} (${nComps} components).`
      : `${how === "browser" ? "Your files, remembered in this browser" : "Your files"}: ${databases.join(", ")} (${nComps} components).`;
    drawBuiltin(builtin);
    if (how === "user" && $("remember").checked) {
      try { await Store.put("databases", "current", files); } catch (err) {}
    }
    if (publish && window.EqView) EqView.publishDatabases(files);
    chosen = chosen.filter(c => elements.some(x => x[1] === c));
    if (last) clearResult();
    current = null; drawTable(); drawChosen(); showAvailable();
  }

  // A click on an element shows its components; if it has only one (Na+, Cl-,
  // e-), that component is selected at once.
  function pickElement(sym) {
    current = sym;
    const comps = elements.filter(e => e[0] === sym && !isWater(e[1])).map(e => e[1]);
    if (comps.length === 1 && !chosen.includes(comps[0])) { chosen.push(comps[0]); clearResult(); drawChosen(); }
    drawTable(); showAvailable();
  }
  function drawTable() {
    const has = new Set(elements.map(e => e[0]));
    // elements with a selected component are marked
    const picked = new Set(elements.filter(e => chosen.includes(e[1])).map(e => e[0]));
    const t = $("ptable"); t.innerHTML = "";
    const cells = [];
    SYMBOLS.forEach((sym, k) => { const [r, c] = position(k + 1); cells.push({ sym, r, c }); });
    for (const { sym, r, c } of cells) {
      const b = document.createElement("button");
      b.textContent = sym; b.title = sym;
      b.style.gridRow = String(r >= 9 ? r + 1 : r); b.style.gridColumn = String(c);
      b.className = has.has(sym) ? "has" : "none";
      if (picked.has(sym)) b.classList.add("picked");
      if (sym === current) b.classList.add("sel");
      if (has.has(sym)) b.addEventListener("click", () => pickElement(sym));
      else b.disabled = true;
      t.appendChild(b);
    }
    const gap = document.createElement("div"); gap.className = "gap"; gap.style.gridRow = "9"; t.appendChild(gap);
    // "elements" that are not chemical elements: e- as a cell in the row of H and
    // the column of Ti; in advanced mode the other components not linked to an
    // element (e.g. Pm 3+ in Medusa-Hydra) under it. Water is left out here: it
    // is added with the option "include H2O as a component" (advanced)
    const ex = document.createElement("div"); ex.className = "extra adv-only";
    for (const sym of [...has].filter(s => !SYMBOLS.includes(s))) {
      const b = document.createElement("button");
      if (sym === "e-") {
        b.textContent = "e⁻"; b.title = "electron: for redox reactions and diagrams with Eh or pe";
        b.className = "has elec"; b.style.gridRow = "1"; b.style.gridColumn = "4";
      } else {
        const comps = elements.filter(e => e[0] === sym && !isWater(e[1])).map(e => e[1]);
        if (!comps.length) continue;
        b.textContent = "other: " + comps.join(", ");
        b.title = "components not linked to a chemical element";
      }
      if (sym === current) b.classList.add("sel");
      if (picked.has(sym)) b.classList.add("picked");
      b.addEventListener("click", () => pickElement(sym));
      (sym === "e-" ? t : ex).appendChild(b);
    }
    if (ex.children.length) t.appendChild(ex);
    $("search").disabled = !chosen.length || !databases.length;
  }

  function showAvailable() {
    const a = $("avail"); a.innerHTML = "";
    $("availLabel").textContent = current ? "Available for " + current : "Available components";
    if (!current) return;
    for (const [el, formula, name] of elements.filter(e => e[0] === current && !isWater(e[1]))) {
      if (chosen.includes(formula)) continue;
      const b = document.createElement("button");
      b.className = "chip avail"; b.textContent = formula; b.title = name;
      b.addEventListener("click", () => { chosen.push(formula); clearResult(); drawChosen(); drawTable(); showAvailable(); });
      a.appendChild(b);
    }
  }

  // Water as a component makes sense only when its activity is calculated
  // (concentrated solutions, with activity coefficients); otherwise it is 1
  // and the component changes nothing. Asked before water is added.
  const isWater = f => /^H2O(\(l\))?$/i.test(f.trim());
  const WATER_NOTE = "Water is normally not a component: its activity is taken as 1, which is right for dilute solutions.\n\n" +
    "Add H2O as a component only to model the activity of water in concentrated solutions, with an ionic strength and an " +
    "activity-coefficient model in the diagram, for example the solubility of gypsum, CaSO4·2H2O.";
  const askWater = () => EqDialog.confirm(WATER_NOTE, { ok: "Add H2O", cancel: "Cancel" });

  function drawChosen() {
    const c = $("chosen"); c.innerHTML = "";
    for (const formula of chosen) {
      const b = document.createElement("button");
      b.className = "chip chosen"; b.textContent = formula;
      const e = elements.find(x => x[1] === formula); if (e) b.title = e[2];
      b.addEventListener("click", () => { chosen = chosen.filter(x => x !== formula); clearResult(); drawChosen(); drawTable(); showAvailable(); });
      c.appendChild(b);
    }
    $("search").disabled = !chosen.length || !databases.length;
  }

  function status(cls, text) { $("status").className = cls; $("status").textContent = text; }
  function log(text) { $("log").textContent = text || ""; }

  // a Java properties file, as LibDataBase's References reads it
  function parseRefs(text) {
    const m = new Map();
    for (const raw of text.split(/\r?\n/)) {
      if (!raw.trim() || /^[#!]/.test(raw.trim())) continue;
      const i = raw.search(/(?<!\\)[=:]/);
      if (i < 0) continue;
      const key = raw.slice(0, i).trim().replace(/\\(.)/g, "$1");
      const val = raw.slice(i + 1).trim().replace(/\\n/g, "\n").replace(/\\(.)/g, "$1");
      m.set(key, val);
    }
    return m;
  }
  // reference keys are separated by "+", "," or ";" (outside parentheses), as in References.splitRefs
  function refText(keys) {
    if (!refs || !keys) return "";
    const out = []; let depth = 0, cur = "";
    for (const ch of keys) {
      if ("([{".includes(ch)) depth++;
      if (")]}".includes(ch)) depth--;
      if (depth === 0 && "+,;".includes(ch)) { if (cur.trim()) out.push(cur.trim()); cur = ""; } else cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out.map(k => refs.has(k) ? `${k}: ${refs.get(k)}` : k).join("\n\n");
  }

  // the saturation pressure of water is defined from 0 °C to the critical point
  // (373.946 °C); DataBase's SetTempPressDialog asks for a pressure above it
  const T_CRIT = 373.946;
  // the pressure is an option of advanced mode; normal mode uses pSat
  const isAdv = () => window.EqView ? EqView.advanced : true;
  const pressure = () => (isAdv() && $("p").value) || "pSat";
  function checkTP() {
    const t = $("t").value.trim() === "" ? 25 : Number($("t").value);
    if (!isFinite(t)) return "The temperature is not a number.";
    if (pressure() === "pSat" && t < 0) return "The temperature must be at least 0 °C.";
    if (pressure() === "pSat" && t >= T_CRIT)
      return `Above ${T_CRIT} °C (the critical point of water) the saturation pressure is not defined: choose a pressure${isAdv() ? "" : " (advanced mode)"}.`;
    return null;
  }

  // The search result belongs to the components, database and options it was
  // made with: when any of them changes, or a search fails or is cancelled,
  // the old result is removed, so that it cannot be taken for the new one.
  function clearResult(message = "") {
    last = null; excluded = new Set(); noLogK = new Set();
    $("found").innerHTML = ""; $("dat").value = "";
    $("download").disabled = true; $("toDiagram").disabled = true;
    status(message ? "fail" : "", message);
    setPrimary();
  }
  // one primary button for each state: Search until there is a result, then
  // "Create a diagram"
  function setPrimary() {
    const done = !!(last && last.ok);
    $("search").classList.toggle("primary", !done);
    $("toDiagram").classList.toggle("primary", done);
  }

  async function search(keepExcluded) {
    // in normal mode the advanced options are not used (as on the diagram page)
    const adv = window.EqView ? EqView.advanced : true;
    if (!keepExcluded) { excluded = new Set(); noLogK = new Set(); }
    const bad = checkTP();
    if (bad) { clearResult(bad); return; }
    status("", "Searching…");
    $("search").disabled = true;
    const t0 = performance.now(), accepted = [];
    let r;
    // the pressure is an option of advanced mode
    const sent = { t: $("t").value || "25", p: pressure() };
    for (;;) {
      r = await engine.search({
        databases: databases.map(d => "/db/" + d), components: chosen,
        t: sent.t, p: sent.p, allSolids: adv ? $("solids").value : "0",
        redoxN: !adv || $("redoxN").checked, redoxS: !adv || $("redoxS").checked, redoxP: !adv || $("redoxP").checked,
        includeH2O: adv && $("h2o").checked, exclude: [...excluded], accepted
      });
      // a species without log K in the database (e.g. H2SO4 in the KTH database)
      // stops the desktop DataBase when it writes the data file; here it is left
      // out, with a note, and the search is made again
      const nan = !r.ok && /species "(.+?)"\s+has logK = Not-a-Number/.exec(r.error || r.log || "");
      if (nan && !excluded.has(nan[1])) { excluded.add(nan[1]); noLogK.add(nan[1]); continue; }
      if (!r.ask) break;
      // a question of the search (engine-worker.js): ask, and search again if the answer is yes
      const m = r.ask.match(/^([\s\S]*?)\s*\(OK = (.*)\)\s*$/);
      if (!(await EqDialog.confirm(m ? m[1] : r.ask, { ok: m ? m[2] : "Continue" }))) {
        $("search").disabled = false; log(r.log || r.error);
        clearResult("The search was cancelled."); return;
      }
      accepted.push(r.ask);
    }
    $("search").disabled = false;
    const ms = Math.round(performance.now() - t0);
    last = r; log(r.log || r.error);
    last.t = sent.t; last.p = sent.p;        // the temperature and pressure of this search, for the details
    const species = r.species || [], esc = t => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const all = (r.details || []).concat([...excluded].map(n => ({ name: n, off: true,
      comment: noLogK.has(n) ? "left out: no log K in the database" : "" })));
    $("found").innerHTML = (all.length
        ? `<label>Species found (${species.length}${excluded.size ? `, ${excluded.size} left out` : ""}) <span class="note">untick a species to leave it out of the data file</span></label>` +
          `<div class="spwrap"><table class="sp"><tr><th></th><th>Species</th><th>log K</th><th>Reference</th></tr>` +
          all.map(d => `<tr class="${d.off ? "off" : ""}"><td><input type="checkbox" data-sp="${esc(d.name)}"${d.off ? "" : " checked"}></td>` +
            `<td class="n" title="${esc(d.reaction || "")}">${d.equation ? `<a href="#" role="button" data-detail="${esc(d.name)}">${esc(d.name)}</a>` : esc(d.name)}</td><td>${d.logK === null || d.logK === undefined ? "" : d.logK.toFixed(3)}</td>` +
            `<td title="${esc(refText(d.reference))}">${esc(d.reference || "")}${d.comment ? ` <span class="note">${esc(d.comment)}</span>` : ""}</td></tr>`).join("") +
          `</table></div>` : "")
      + ((r.warnings || []).length ? `<label>Warnings</label><pre>${esc(r.warnings.join("\n\n"))}</pre>` : "");
    $("dat").value = r.ok ? r.dat : "";
    $("download").disabled = !r.ok;
    $("toDiagram").disabled = !r.ok;
    setPrimary();
    if (r.ok) status("ok", `${species.length} species found in ${ms} ms.` +
      (noLogK.size ? ` Left out, without log K in the database: ${[...noLogK].join(", ")}.` : "") +
      ((r.warnings || []).length ? " See the warnings." : ""));
    else if (r.missing && r.missing.length) {
      status("fail", "Temperature-pressure data are missing for: " + r.missing.join(", ") + ". Change the temperature.");
      $("logDetails").open = true;
    } else { status("fail", "The search stopped; see the messages below."); $("logDetails").open = true; }
  }

  // the bundled databases (builtin-db.js)
  function drawBuiltin(id) {
    const adv = window.EqView ? EqView.advanced : true;
    $("builtin").innerHTML = Object.entries(BuiltinDb.SETS).filter(([k, s]) => !s.adv || adv || k === id)
      .map(([k, s]) => `<option value="${k}">${s.label}</option>`).join("") +
      (id ? "" : `<option value="">your own files</option>`);
    $("builtin").value = id || "";
  }
  async function useBuiltin(id) {
    $("dbstatus").textContent = "Loading the " + BuiltinDb.SETS[id].short + "…";
    try {
      const files = await BuiltinDb.fetch(id);
      await BuiltinDb.choose(id);
      await load(files, id);
    } catch (e) { $("dbstatus").textContent = "Could not load the database: " + e; }
  }
  document.addEventListener("eqmode", () => drawBuiltin(BuiltinDb.which(loaded)));
  $("builtin").addEventListener("change", e => { if (e.target.value) useBuiltin(e.target.value); });
  $("pickFiles").addEventListener("click", () => $("files").click());
  // Files of the user (the Load button, the Database menu, files dropped on
  // the window): added to the databases in use, or used instead of them, as
  // the list of database files of the desktop DataBase allows. A file with the
  // name of one in use replaces it; later databases replace reactions of earlier ones.
  async function loadUser(files) {
    if (!files.length) return;
    // a database in the CHESS format (.tdb) becomes a text database and its element file (chess-tdb.js)
    const conv = ChessTdb.convertFiles(files), told = () => {
      if (!conv.reports.length) return;
      const bad = conv.reports.filter(r => !r.ok);
      status(bad.length ? "fail" : "ok", conv.reports.map(r => r.summary).join(" ") + (bad.length < conv.reports.length ? " The details are under \"Search messages\"." : ""));
      log(conv.reports.map(r => r.details).join("\n\n"));
    };
    files = conv.files;
    if (!files.length) { told(); return; }
    if (loaded.length && databases.length) {
      const a = await EqDialog.choose(`The databases in use are: ${databases.join(", ")}.\n\nAdd ${files.length === 1 ? files[0].name : "the " + files.length + " files"} to them, or use ${files.length === 1 ? "it" : "them"} instead?`,
        [["add", "Add"], ["replace", "Use instead"], ["cancel", "Cancel"]]);
      if (a !== "add" && a !== "replace") return;
      if (a === "add") {
        const names = new Set(files.map(f => f.name.toLowerCase()));
        files = loaded.filter(f => !names.has(f.name.toLowerCase())).concat(files);
      }
    }
    await load(files);
    told();
  }
  $("files").addEventListener("change", async ev => {
    const files = await Promise.all([...ev.target.files].map(async f => ({ name: f.name, buffer: await f.arrayBuffer() })));
    ev.target.value = "";
    await loadUser(files);
  });
  $("search").addEventListener("click", () => search(false));
  // a new chemical system: no components (but H+) and no search result
  function newSystem() {
    chosen = elements.some(x => x[1] === "H+") ? ["H+"] : [];
    current = null; clearResult(); log("");
    drawTable(); drawChosen(); showAvailable();
  }
  // unticking "remember" forgets the files remembered earlier; ticking it remembers the files now loaded
  $("remember").addEventListener("change", async () => {
    try {
      if (!$("remember").checked) await Store.remove("databases", "current");
      else if (loaded.length && !BuiltinDb.which(loaded)) await Store.put("databases", "current", loaded);
    } catch (e) {}
  });
  $("h2o").addEventListener("change", async e => { if (e.target.checked && !(await askWater())) e.target.checked = false; });
  // the options of the search are remembered in this browser (as DataBase's ini file)
  const OPT_KEY = "eqdiagr.searchOptions", OPT_IDS = ["t", "p", "solids", "redoxN", "redoxS", "redoxP"];
  const optValue = el => el.type === "checkbox" ? el.checked : el.value;
  try {
    const o = JSON.parse(localStorage.getItem(OPT_KEY) || "{}");
    for (const id of OPT_IDS) if (id in o) { if ($(id).type === "checkbox") $(id).checked = !!o[id]; else $(id).value = o[id]; }
  } catch (e) {}
  for (const id of ["t", "p", "solids", "redoxN", "redoxS", "redoxP", "h2o"])
    $(id).addEventListener("change", () => {
      if (last) clearResult();
      try { localStorage.setItem(OPT_KEY, JSON.stringify(Object.fromEntries(OPT_IDS.map(i => [i, optValue($(i))])))); } catch (e) {}
    });
  // The details of a reaction, as "show Details" of the desktop DataBase:
  // click a species name in the result of the search.
  function showDetails(name) {
    const d = last && (last.details || []).find(x => x.name === name);
    if (!d) return;
    const esc = t => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const f3 = v => v === null || v === undefined ? "(no value)" : String(+v.toFixed(3)).replace("-", "−");
    const t = parseFloat(last.t), p = last.p, rows = [];
    rows.push(["Reaction", `<td class="eq">${esc(d.equation)}</td>`]);
    rows.push(["log <i>K</i>° (25 °C)", `<td>${f3(d.logK25)}</td>`]);
    if (isFinite(t) && (Math.abs(t - 25) > 0.1 || (p !== "pSat" && parseFloat(p) > 1.1)))
      rows.push([`log <i>K</i>° (${esc(last.t)} °C, ${p === "pSat" ? "pSat" : esc(p) + " bar"})`, `<td>${d.logK === null || d.logK === undefined ? "cannot be calculated" : f3(d.logK)}</td>`]);
    if (d.analytic) rows.push(["Temperature", `<td>a function with six parameters gives log <i>K</i>(<i>t</i>, <i>p</i>)</td>`]);
    else if (d.lookUp) rows.push(["Temperature", `<td>log <i>K</i>(<i>t</i>, <i>p</i>) is interpolated in a table of values</td>`]);
    else {
      rows.push(["Δ<i>H</i>°", `<td>${d.deltaH === null ? "(no value)" : f3(d.deltaH) + " kJ/mol"}</td>`]);
      rows.push(["Δ<i>C<sub>p</sub></i>°", `<td>${d.deltaCp === null ? "(no value)" : f3(d.deltaCp) + " J/(K mol)"}</td>`]);
    }
    rows.push(["Valid up to", `<td>${Math.round(d.tMax)} °C and ${Math.round(d.pMax)} bar${d.tMax <= 25 ? " (no data for other temperatures)" : ""}</td>`]);
    const keys = (d.reference || "").trim(), text = keys ? refText(keys) : "";
    rows.push(["References", `<td>${keys ? esc(keys) : "(none)"}` +
      (text ? `<div class="reftext">${esc(text)}</div>` : keys && !refs ? `<div class="reftext">No references file is loaded with this database.</div>` : "") + `</td>`]);
    rows.push(["Comment", `<td>${d.comment && d.comment.trim() ? esc(d.comment) : "(none)"}</td>`]);
    $("dtName").textContent = d.name;
    $("dtTable").innerHTML = rows.map(([h, c]) => `<tr><th>${h}</th>${c}</tr>`).join("");
    $("detailDlg").showModal();
  }
  $("found").addEventListener("click", e => {
    const a = e.target.closest("[data-detail]");
    if (a) { e.preventDefault(); showDetails(a.dataset.detail); }
  });
  $("found").addEventListener("change", e => {
    const n = e.target.dataset.sp;
    if (n === undefined) return;
    if (e.target.checked) excluded.delete(n); else excluded.add(n);
    search(true);
  });
  $("convert").addEventListener("click", async () => {
    const db = $("convertDb").value;
    if (!db) return;
    const elb = db.replace(/\.db$/i, ".elb");
    status("", "Converting " + db + "…");
    const r = await engine.dbToText("/db/" + db, "/db/" + elb);
    if (!r.ok) { status("fail", "The conversion failed; see the messages."); log(r.log || r.error); $("logDetails").open = true; return; }
    for (const [path, text] of Object.entries(r.files)) {
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
      a.download = path.split("/").pop(); document.body.appendChild(a); a.click(); a.remove();
    }
    status("ok", `${db}: ${r.reactions} reactions converted to ${db.replace(/\.db$/i, ".txt")} and ${elb.replace(/\.elb$/i, ".elt")}.`);
  });
  $("download").addEventListener("click", () => {
    if (!last || !last.ok) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([last.dat], { type: "text/plain" }));
    a.download = (chosen.join("_").replace(/[^A-Za-z0-9_+-]+/g, "") || "system") + ".dat";
    document.body.appendChild(a); a.click(); a.remove();
  });
  $("toDiagram").addEventListener("click", async () => {
    if (!last || !last.ok) return;
    let name = (chosen.join("_").replace(/[^A-Za-z0-9_+-]+/g, "") || "system") + ".dat";
    // a file of the same name in this browser is not replaced without asking
    let keys = [], replaced = false;
    try { keys = await Store.keys("files"); } catch (e) {}
    if (keys.includes(name)) {
      let free = name, n = 2;
      while (keys.includes(free)) free = name.replace(/\.dat$/i, ` (${n++}).dat`);
      const answer = await EqDialog.prompt(`There is already a data file "${name}" in this browser. ` +
        `Save the new chemical system as (keep the name "${name}" to replace the old file):`, free, { ok: "Save" });
      if (!answer || !answer.trim()) return;
      name = /\.dat$/i.test(answer.trim()) ? answer.trim() : answer.trim() + ".dat";
      replaced = keys.includes(name);
    }
    try {
      await Store.put("files", name, last.dat);
      if (window.EqView && EqView.app) { EqView.filesChanged(); EqView.app.openDiagram({ file: name, reload: replaced }); }
      else location.href = "spana.html?file=" + encodeURIComponent(name);
    }
    catch (e) { status("fail", "Could not save the file in this browser: " + e.message); }
  });
  // constants of the user's own: the form of byhand.html, a tab in the app window
  $("byHand").addEventListener("click", e => {
    if (window.EqView && EqView.app && EqView.app.openByHand) { e.preventDefault(); EqView.app.openByHand(); }
  });
  // ---------------------------------------------------------------- in the app window (app-view.js)
  if (window.EqView) {
    Object.assign(EqView.commands, {
      useDb: id => useBuiltin(id), search: "search", newSystem, dat: "download", toDiagram: "toDiagram",
      messages: () => { $("logDetails").open = true; $("logDetails").scrollIntoView({ block: "nearest" }); }
    });
    EqView.loadFiles = files => loadUser(files);
    EqView.useDatabases = files => { if (files !== loaded) return load(files, "app"); };
  }
  drawTable();
  // the files remembered from an earlier visit, else a bundled database
  (async () => {
    try {
      const s = await BuiltinDb.startup();
      await load(s.files, s.builtin || "browser", false);
    } catch (err) { $("dbstatus").textContent = "Could not load the database: " + err; }
  })();
})();
