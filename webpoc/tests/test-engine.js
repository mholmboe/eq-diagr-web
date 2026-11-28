// Regression tests of the eq-diagr browser engine, through engine-client.js and
// engine-worker.js, in Node (a vm context stands in for the Web Worker).
//
// Usage: node tests/test-engine.js [folder with the release databases]
//   (default web/data/release, the copy of the eq-diagr 0.4.0 databases: Reactions.db,
//   References.txt and other_databases/, used for the search tests)
//
// The reference files in tests/ were made with the desktop programs:
//   sed/ref, predom/ref   SED.jar and Predom.jar built from eq-diagr master
//   db/ref                the original DataBase window, driven by a test harness
//                         (also on the KTH course database, web/data/kth)
//   plot/ref              PlotPDF.jar and PlotPS.jar, run with -Duser.name=anonymous
//                         (the browser has no user name); CreationDate lines are ignored
//   mod/ref               ModChemSyst.jar and ModReaction.jar
//   maint/ref             DataMaintenance's windows, driven by maint/RefMaint.java
//                         (maint/make-ref.sh)
//   sysedit/ref           Spana's "Modify chemical system" window, driven by
//                         sysedit/RefModify.java (sysedit/make-ref.sh)
// EC is compared with the reference tables in eq-diagr/EC/tests (web/tests-data.js),
// and with PHREEQC and the Fortran EC on the test cases of the haltaFall repository
// (haltafall/, see haltafall/README.md).
const fs = require("fs"), vm = require("vm"), path = require("path");
const T = __dirname, WEB = path.join(T, "..", "web");
const INSTALL = process.argv[2] || path.join(WEB, "data", "release");

// the engine as in node-engine.js (a vm context for the worker; questions of the
// database search answered "Continue")
const engine = require("./node-engine.js")();

const read = f => fs.readFileSync(f, "utf8");
const lines = f => read(f).split("\n").filter(l => l.trim());
const results = {};
function record(group, name, ok, note) {
  (results[group] = results[group] || []).push({ name, ok, note });
  if (!ok) console.log(`FAIL ${group}/${name}${note ? ": " + note : ""}`);
}
const without = (text, re) => text.split(/\r?\n/).filter(l => !re.test(l)).join("\n");

// EC: numerical comparison with the reference tables, as test-cli.sh does
function parseCsv(t) { return t.split(/\r?\n/).filter(l => l).map(l => l.replace(/,\s*$/, "").split(",").map(c => c.trim())); }
function csvProblems(ref, cur) {
  const a = parseCsv(ref), b = parseCsv(cur), p = [];
  if (a.length !== b.length) p.push(`rows ${a.length} vs ${b.length}`);
  for (let i = 0; i < Math.min(a.length, b.length); i++)
    for (let j = 0; j < Math.min(a[i].length, b[i].length); j++) {
      const x = a[i][j], y = b[i][j], fx = Number(x), fy = Number(y);
      if (x === "" || isNaN(fx) || isNaN(fy)) { if (x !== y) p.push(`${i},${j}`); }
      else if (Math.abs(fx - fy) > Math.max(1e-12, 1e-6 * Math.max(Math.abs(fx), Math.abs(fy)))) p.push(`${i},${j}: ${x} vs ${y}`);
    }
  return p;
}

(async () => {
  const t0 = Date.now();
  // ---- EC
  const ctx = { window: {} }; vm.createContext(ctx);
  vm.runInContext(read(path.join(WEB, "tests-data.js")), ctx);
  for (const t of ctx.window.ecTests) {
    const dir = `/ec/${t.dir}`, files = { [`${dir}/${t.name}.dat`]: t.dat };
    if (t.sit) files[`${dir}/SIT-coefficients.dta`] = t.sit;
    const r = await engine.run("ec", [`${dir}/${t.name}.dat`, ...t.options.trim().split(/\s+/).filter(x => x)],
                               { files, outputs: [`${dir}/${t.name}.csv`] });
    const csv = r.files[`${dir}/${t.name}.csv`];
    const p = csv ? csvProblems(t.refCsv, csv) : ["no csv"];
    record("EC", `${t.dir}/${t.name}`, r.ok && p.length === 0, p.slice(0, 3).join("; "));
  }
  // ---- EC against PHREEQC and the Fortran EC (haltaFall/compare.js)
  for (const r of await require(path.join(T, "haltafall", "compare.js")).compare(engine)) {
    const name = `${r.case} point ${r.point}`;
    if (r.error) { record("HaltaFall", name, false, r.error); continue; }
    record("HaltaFall", `${name} vs PHREEQC`, r.bad.length === 0, r.bad.slice(0, 3).map(p => `${p.q} ${p.ec} vs ${p.pq}`).join("; "));
    record("HaltaFall", `${name} vs Fortran EC`, r.fortran.length === 0, r.fortran.slice(0, 3).join("; "));
  }
  // ---- SED
  for (const line of lines(path.join(T, "sed/cases.txt"))) {
    const [name, ...args] = line.trim().split(/\s+/);
    const base = `/sed/${name}`, tbl = (args.find(a => a.startsWith("-tble:")) || "-tble:csv").slice(6);
    const r = await engine.run("sed", [`-d=${base}.dat`, ...args],
      { files: { [`${base}.dat`]: read(path.join(T, "sed/in", name + ".dat")) }, outputs: [`${base}.plt`, `${base}.${tbl}`] });
    const same = ext => r.files[`${base}.${ext}`] != null &&
      without(r.files[`${base}.${ext}`], /file written/) === without(read(path.join(T, "sed/ref", `${name}.${ext}`)), /file written/);
    record("SED", name, r.ok && same("plt") && same(tbl), `points ${r.info && r.info.points}`);
  }
  {
    // debugging output (-dbg, and the HaltaFall level -dbg=N) does not change the diagram
    const dat = { "/sed/dbg.dat": read(path.join(T, "sed/in", "CO3_fract.dat")) };
    const plain = await engine.run("sed", ["-d=/sed/dbg.dat", "-n=10"], { files: dat, outputs: ["/sed/dbg.plt"] });
    const dbg = await engine.run("sed", ["-d=/sed/dbg.dat", "-n=10", "-dbg", "-dbg=3"], { files: dat, outputs: ["/sed/dbg.plt"] });
    record("SED", "debug output", plain.ok && dbg.ok && dbg.files["/sed/dbg.plt"] === plain.files["/sed/dbg.plt"] &&
           /Debug printout level in HaltaFall = 3/.test(dbg.log) && dbg.log.length > 5 * plain.log.length,
           `log ${plain.log.length} -> ${dbg.log.length} characters`);
  }
  // ---- Predom
  for (const line of lines(path.join(T, "predom/cases.txt"))) {
    const [name, ...args] = line.trim().split(/\s+/);
    const base = `/predom/${name}`;
    const r = await engine.run("predom", [`-d=${base}.dat`, ...args],
      { files: { [`${base}.dat`]: read(path.join(T, "predom/in", name + ".dat")) }, outputs: [`${base}.plt`] });
    record("Predom", name, r.ok && r.files[`${base}.plt`] === read(path.join(T, "predom/ref", name + ".plt")));
  }
  // ---- database search (databases written once, persistent)
  const dbFiles = {};
  for (const dir of [INSTALL, path.join(INSTALL, "other_databases"), path.join(WEB, "data", "kth")])
    for (const f of fs.readdirSync(dir).filter(f => /\.(db|elb|elt|skv|elm)$/.test(f) || f === "Soltherm.txt"))
      dbFiles["/db/" + f] = fs.readFileSync(path.join(dir, f));
  await engine.writeFiles(dbFiles, { persist: true });
  for (const line of lines(path.join(T, "db/cases.txt"))) {
    const [name, t, p, sol, rn, rs, rp, h2o, dbs, comps] = line.split("|");
    const r = await engine.search({ databases: dbs.split(",").map(d => "/db/" + d), components: comps.split(";"),
      t, p, allSolids: sol, redoxN: rn, redoxS: rs, redoxP: rp, includeH2O: h2o });
    const refFile = path.join(T, "db/ref", name + ".dat");
    if (fs.existsSync(refFile)) record("Database", name, r.ok && r.dat === read(refFile));
    else record("Database", name, !r.ok && r.missing.length > 0, "expected: missing T-P data, got " + JSON.stringify(r.missing));
  }
  // ---- PlotPDF and PlotPS (CreationDate lines removed)
  for (const line of lines(path.join(T, "plot/cases.txt"))) {
    const [label, prog, base, ext, opts] = line.split("|");
    const inp = `/plot/${label}.plt`, outp = `/plot/${label}.${ext}`;
    const r = await engine.run(prog, [`-p=${inp}`, `${prog === "plotps" ? "-ps" : "-pdf"}=${outp}`, ...opts.split(" ")],
      { files: { [inp]: read(path.join(T, "plot/in", base + ".plt")) }, binaryOutputs: [outp] });
    const got = r.files[outp] != null ? Buffer.from(r.files[outp], "base64").toString("latin1") : null;
    const ref = fs.readFileSync(path.join(T, "plot/ref", `${label}.${ext}`)).toString("latin1");
    record("Plot", label, r.ok && got != null && without(got, /CreationDate/) === without(ref, /CreationDate/));
  }
  // ---- ModChemSyst and ModReaction
  for (const line of lines(path.join(T, "mod/cases.txt"))) {
    const [label, prog, base, arg] = line.split("|");
    const inp = `/mod/${label}_in.dat`, outp = `/mod/${label}.dat`;
    const r = await engine.run(prog, [`-d=${inp}`, `-m=${outp}`, arg],
      { files: { [inp]: read(path.join(T, "mod/in", base + ".dat")) }, outputs: [outp] });
    record("Modify", label, r.ok && r.files[outp] === read(path.join(T, "mod/ref", label + ".dat")));
  }
  // ---- the data-file model: datRead, and datSet compared with "ModReaction -chws"
  const feText = read(path.join(T, "mod/in", "Fe_Eh-pH.dat"));
  const m = await engine.datRead({ text: feText });
  const k = m.ok ? m.model.species.findIndex(s => s.name === "Fe3O4(cr)") : -1;
  record("Model", "datRead", m.ok && k >= 0 && m.model.components.length === m.model.na,
         m.ok ? `${m.model.na} components, ${m.model.species.length} species, plotType ${m.model.diagram.plotType}` : m.error);
  const s = await engine.datSet(feText, [`species[${k}].logK=-30.5`]);
  record("Model", "datSet = ModReaction -chws", s.ok && s.dat === read(path.join(T, "mod/ref", "chws.dat")));
  // ---- database maintenance (DataMaintenance), compared with files written by its
  //      own windows (tests/maint/make-ref.sh, RefMaint.java)
  {
    const M = path.join(T, "maint"), mfiles = {};
    for (const f of fs.readdirSync(path.join(M, "in"))) mfiles["/m/" + f] = fs.readFileSync(path.join(M, "in", f));
    await engine.writeFiles(mfiles);
    const rel = ["Reactions.db", "Reactions.elb", "References.txt"].filter(f => fs.existsSync(path.join(INSTALL, f)));
    const relFiles = {};
    for (const f of rel) relFiles["/rel/" + f] = fs.readFileSync(path.join(INSTALL, f));
    await engine.writeFiles(relFiles);
    const dbPath = n => n.startsWith("/Applications/") ? "/rel/" + path.basename(n) : "/m/" + n;
    const msgCount = (label, re) => { const f = path.join(M, "ref", label + ".msg"); return fs.existsSync(f) ? lines(f).filter(l => re.test(l)).length : 0; };
    for (const line of lines(path.join(M, "cases.txt"))) {
      if (line.startsWith("#")) continue;
      const [op, out, a, b] = line.split("|");
      if (op === "merge") {
        const r = await engine.maint("dbMerge", { databases: a.split(",").map(dbPath), out: "/mo/" + out });
        const got = r.ok ? await engine.readFiles(["/mo/" + out, "/mo/" + out.replace(/\.db$/, ".elb")], { binary: true }) : {};
        const same = ext => got["/mo/" + out.replace(/\.db$/, ext)] === fs.readFileSync(path.join(M, "ref", out.replace(/\.db$/, ext))).toString("base64");
        const nWarn = msgCount(out, /^ANSWER OK: Error in file/);
        record("Maint", `merge ${a}`, r.ok && same(".db") && same(".elb") && r.warnings.length === nWarn, r.ok ? `${r.reactions} reactions, ${r.warnings.length} warnings` : r.error);
      } else if (op === "stats") {
        if (b.startsWith("/Applications/") && !rel.length) continue;
        const r = await engine.maint("dbStats", { databases: b.split(",").map(dbPath), references: a === "-" ? "" : dbPath(a), date: "-" });
        const body = t => t.slice(t.indexOf("\nTotal nbr reactions"));
        record("Maint", `statistics ${b.split("/").pop()}`, r.ok && body(r.text) === body(read(path.join(M, "ref", out))), r.ok ? "" : r.error);
      } else if (op === "single") {
        const r = await engine.maint("dbSingle", { databases: b.split(",").map(dbPath), component: a });
        const text = r.ok ? [r.firstLine].concat(r.lines).join("\n") + "\n" : null;
        record("Maint", `single component ${a} in ${b}`, r.ok && text === read(path.join(M, "ref", out)), r.ok ? `${r.lines.length} reactions` : r.error);
      } else if (op === "add") {
        // the script of FrameAddData actions, done with the engine's add-data operations
        const dbs = b.split(",").map(dbPath);
        let file = null, n = 0, okAll = true, note = "";
        const show = async () => (await engine.maint("addShow", { databases: dbs, file })).content;
        for (const sl of lines(path.join(M, a))) {
          if (sl.startsWith("#")) continue;
          const x = sl.split("|");
          if (x[0] === "open") { file = "/ma/" + x[1]; await show(); }
          else if (x[0] === "reaction") {
            const rc = x[2] ? x[2].split(",").map(t => t.split(":")) : [];
            await engine.maint("addSaveReaction", { databases: dbs, file, original: "", name: x[1], logK: x[3], deltaH: x[4], deltaCp: x[5],
              reactants: rc.map(t => t[0]), coefficients: rc.map(t => t[1]), reference: x[6], comment: x[7] });
          } else if (x[0] === "edit") {
            const c = (await show()).reactions.find(r => r.name === x[1]);
            await engine.maint("addSaveReaction", { databases: dbs, file, original: c.line, name: c.name, logK: x[2],
              deltaH: c.analytic || c.lookUp ? "" : x[3], deltaCp: c.analytic || c.lookUp ? "" : x[4],
              reactants: c.reactants, coefficients: c.coefficients, reference: x[5], comment: x[6] });
          } else if (x[0] === "delreaction") {
            const c = (await show()).reactions.find(r => r.name === x[1]);
            const r = await engine.maint("addDeleteReaction", { databases: dbs, file, line: c.line });
            if (r.unused.length) await engine.maint("addRemoveComponents", { databases: dbs, file, remove: r.unused });
          } else if (x[0] === "component") {
            const el = x[3].split(",").sort((p, q) => p.toLowerCase() < q.toLowerCase() ? -1 : 1);
            await engine.maint("addSaveComponent", { databases: dbs, file, name: x[1], description: x[2], linkedTo: el.join(", ") });
          } else if (x[0] === "delcomponent") {
            await engine.maint("addDeleteComponent", { databases: dbs, file, name: x[1] });
          }
          n++;
          const got = await engine.readFiles([file, file.replace(/\.txt$/, ".elt")]);
          for (const [ext, g] of [[".txt", got[file]], [".elt", got[file.replace(/\.txt$/, ".elt")]]]) {
            const rf = path.join(M, "ref", out, n + ext), want = fs.existsSync(rf) ? read(rf) : null;
            if (g !== want) { okAll = false; if (!note) note = `differs after step ${n} (${sl.split("|").slice(0, 2).join(" ")}), ${ext}`; }
          }
        }
        record("Maint", `add data: ${a} (${n} steps)`, okAll, note);
      }
    }
    // a binary database: DataMaintenance adds none of its reactions (see DbMaint.merge);
    // here it is read as its text version is, so both give the same reactions
    {
      const bin = await engine.maint("dbMerge", { databases: ["/m/R.db"], out: "/mo/B.db" });
      const txt = await engine.maint("dbMerge", { databases: ["/m/R.txt"], out: "/mo/T.db" });
      record("Maint", "merge a binary database = its text version", bin.ok && txt.ok && bin.reactions === txt.reactions, `${bin.reactions} and ${txt.reactions} reactions`);
    }
    // a line that can not be read (FrameAddData writes "@CaSO4;" for an excluded
    // species) is kept when a reaction is deleted; FrameAddData drops it and the rest of the file
    const f = "/ma/bad.txt";
    await engine.writeFiles({ [f]: "COMPLEX;LogK;DH_kJmol;DCp_Jmol;R1;N1;R2;N2;R3;N3;R4;N4;R5;N5;R6;N6;H;Reference / Comment\n" +
      "CaCl+;0.4;;;Ca 2+;1;Cl-;1;;;;;;;;;;R1\n@CaSO4;\nCaF+;0.72;;;Ca 2+;1;F-;1;;;;;;;;;;R2\n" });
    const sh = await engine.maint("addShow", { databases: ["/m/R.db"], file: f });
    const del = await engine.maint("addDeleteReaction", { databases: ["/m/R.db"], file: f, line: "CaCl+;0.4;;;Ca 2+;1;Cl-;1;;;;;;;;;;R1" });
    const after = (await engine.readFiles([f]))[f];
    record("Maint", "unreadable line kept on delete", sh.ok && del.ok && !/^CaCl\+/m.test(after) && /^@CaSO4;$/m.test(after) && /^CaF\+/m.test(after));
  }
  // ---- the references file (web/properties.js) against java.util.Properties
  //      (tests/maint/PropsRef.java: load, and store with the keys sorted)
  {
    vm.runInThisContext(read(path.join(WEB, "properties.js")));
    const esc = t => t.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/\t/g, "\\t").replace(/\r/g, "\\r");
    const cases = [["refs-tricky", path.join(T, "maint", "in", "refs-tricky.txt")], ["References", path.join(INSTALL, "References.txt")]];
    for (const [name, file] of cases) {
      if (!fs.existsSync(file)) continue;
      const m = JavaProperties.load(read(file));
      const loaded = [...m.keys()].sort().map(k => esc(k) + "\u0000" + esc(m.get(k)) + "\n").join("");
      const stored = JavaProperties.store(m).split("\n").slice(1).join("\n");
      const refStore = read(path.join(T, "maint", "ref", `props-${name}-store.txt`)).split("\n").slice(1).join("\n");
      record("Maint", `references file ${name}: read and write`, loaded === read(path.join(T, "maint", "ref", `props-${name}-load.txt`)) && stored === refStore,
             `${m.size} references`);
    }
  }
  // ---- moving components and merging systems (Spana's "Modify chemical system"),
  //      compared with files written by Spana's own window (tests/sysedit/make-ref.sh)
  for (const line of lines(path.join(T, "sysedit/cases.txt"))) {
    const [op, a, b, c] = line.split("|");
    const label = op === "move" ? `move-${a}-${b}-${c}` : `merge-${a}-${b}`;
    const refFile = path.join(T, "sysedit/ref", label + ".dat");
    const inA = read(path.join(T, "sysedit/in", a + ".dat"));
    const r = op === "move" ? await engine.datMove(inA, +b, c === "up")
                            : await engine.datMerge(inA, read(path.join(T, "sysedit/in", b + ".dat")));
    // the log K warnings that Spana shows in message boxes
    const msgFile = refFile.replace(/\.dat$/, ".msg");
    const nWarn = fs.existsSync(msgFile) ? lines(msgFile).filter(l => l.startsWith("MESSAGE: Warning")).length : 0;
    const ok = fs.existsSync(refFile) ? r.ok && r.dat === read(refFile) && (r.warnings || []).filter(w => w.startsWith("log K")).length === nWarn : !r.ok;
    record("SysEdit", label, ok, fs.existsSync(refFile) ? (r.ok ? "differs" : r.error) : "Spana did not write a file");
  }
  const m2 = await engine.datRead({ text: s.dat });
  const changed = m2.ok && m2.model.species[k].logK === -30.5 &&
    JSON.stringify({ ...m2.model, species: null }) === JSON.stringify({ ...m.model, species: null });
  record("Model", "read back", changed);
  const bad = await engine.datSet(feText, ["species[999].logK=1"]);
  record("Model", "bad index rejected", !bad.ok && /out of range/.test(bad.log));

  // ---- diagram setup and database tools
  const plain = read(path.join(T, "db/ref", "fe_s_redox.dat"));
  const dd = await engine.datDefaults(plain);
  const dm = dd.ok ? await engine.datRead({ text: dd.dat }) : { ok: false };
  const dsed = dd.ok ? await engine.run("sed", ["-d=/work/_out.dat"], { outputs: ["/work/_out.plt"] }) : { files: {} };
  record("Setup", "datDefaults gives a SED diagram", dd.ok && dd.defaulted && dm.ok && dm.model.diagram.plotType === 3 &&
         dm.model.concs[dm.model.diagram.compX].hur === 5 && !!dsed.files["/work/_out.plt"]);
  const full = await engine.search({ databases: ["/db/Reactions.db"], components: ["H+", "CO3 2-", "Ca 2+"] });
  const less = await engine.search({ databases: ["/db/Reactions.db"], components: ["H+", "CO3 2-", "Ca 2+"], exclude: ["CaCO3(am)"] });
  record("Setup", "species left out", full.ok && less.ok && less.removed.join() === "CaCO3(am)" && !/^CaCO3\(am\)/m.test(less.dat) &&
         less.dat.split("\n").length === full.dat.split("\n").length - 1 && less.details.length === full.details.length - 1);
  // the data of DataBase's "show Details" window, for a search at 80 C
  const hot = await engine.search({ databases: ["/db/Reactions.db"], components: ["H+", "Fe 2+"], t: "80" });
  const fe = (hot.details || []).find(d => d.name === "Fe(OH)2") || {};
  record("Setup", "details of a reaction: equation, log K at 25 C and at t, enthalpy, heat capacity, highest temperature",
         hot.ok && /^Fe 2\+ \+ 2 H2O =\s+2 H\+ \+ Fe\(OH\)2$/.test(fe.equation || "") && fe.logK25 === -20.6 && Math.abs(fe.deltaH - 67) < 1e-9 &&
         fe.deltaCp === 530 && fe.tMax === 300 && Math.abs(fe.logK + 18.397) < 0.001 && fe.analytic === false && fe.lookUp === false);
  // two components of the same element: the search stops with DataBase's question (engine-worker.js)
  const q = await engine.searchOnce({ databases: ["/db/Reactions.db"], components: ["H+", "Fe 2+", "Fe 3+"] });
  const qa = await engine.searchOnce({ databases: ["/db/Reactions.db"], components: ["H+", "Fe 2+", "Fe 3+"], accepted: q.ask ? [q.ask] : [] });
  record("Setup", "a question stops the search until it is answered", /two components for the same element/.test(q.ask || "") &&
         !qa.ask && qa.ok && qa.species.length > 0);
  const conv = await engine.dbToText("/db/Reactions.db", "/db/Reactions.elb");
  if (conv.ok) await engine.writeFiles({ "/dbt/Reactions.txt": conv.files["/db/Reactions.txt"], "/dbt/Reactions.elt": conv.files["/db/Reactions.elt"] });
  let same = 0, nconv = 0;
  for (const line of lines(path.join(T, "db/cases.txt"))) {
    const [name, t, p, sol, rn, rs, rp, h2o, dbs, comps] = line.split("|");
    if (dbs !== "Reactions.db" || t !== "25" || !fs.existsSync(path.join(T, "db/ref", name + ".dat"))) continue;
    nconv++;
    const r = await engine.search({ databases: ["/dbt/Reactions.txt"], components: comps.split(";"), t, p, allSolids: sol, redoxN: rn, redoxS: rs, redoxP: rp, includeH2O: h2o });
    if (r.ok && r.dat === read(path.join(T, "db/ref", name + ".dat"))) same++;
  }
  record("Setup", "text database = binary at 25 C", conv.ok && same === nconv, `${same} of ${nconv}`);

  // ---- a database in the CHESS format (chess-tdb.js): the text database and element file made
  //      of the small file in tests/chess, and the search in them
  const chess = require(path.join(WEB, "chess-tdb.js"));
  const cz = chess.convert(read(path.join(T, "chess/small.tdb")), "small.tdb");
  record("Chess", "text database and element file as the reference", cz.ok && cz.txt === read(path.join(T, "chess/small-chess.txt")) && cz.elt === read(path.join(T, "chess/small-chess.elt")));
  record("Chess", "what was left out is told", cz.ok && /Left out: 1 surface site, 2 reactions\./.test(cz.summary) &&
         /NoK\(aq\): no log K at 25 C/.test(cz.details) && /Nothing: its reactant Xx\[2\+\] is not defined/.test(cz.details));
  record("Chess", "a file that is no CHESS database is refused", chess.convert("COMPLEX;LogK\nOH-;-14;;;2;H2O;1;H+;-1;x\n", "x.tdb").ok === false);
  if (cz.ok) {
    await engine.writeFiles({ "/chess/small-chess.txt": cz.txt, "/chess/small-chess.elt": cz.elt });
    const comps = ["H+", "e-", "Ca 2+", "CO3 2-", "Fe 2+", "Acetate-"];
    const logK = (r, name) => { const l = (r.dat || "").split(/\r?\n/).find(x => x.split(",")[0].trim() === name); return l ? parseFloat(l.split(",")[1]) : NaN; };
    const c25 = await engine.search({ databases: ["/chess/small-chess.txt"], components: comps, allSolids: 1 });
    record("Chess", "every reaction is found, with the redox couple written with e-", c25.ok && c25.species.length === 10 && !(c25.warnings || []).length &&
           Math.abs(logK(c25, "Fe 3+") + 13.031) < 0.0011 && Math.abs(logK(c25, "FeOH 2+") + 15.221) < 0.0011 && Math.abs(logK(c25, "Calcite(s)") - 8.48) < 0.0011,
           `${c25.species && c25.species.length} species, Fe 3+ ${logK(c25, "Fe 3+")}`);
    // away from 25 C: the values of the tables of the file (OH- -13.03 and calcite 8.82 at 60 C)
    const c60 = await engine.search({ databases: ["/chess/small-chess.txt"], components: ["H+", "Ca 2+", "CO3 2-"], exclude: ["HCO3-"], allSolids: 1, t: "60" });
    record("Chess", "log K at 60 C as in the tables", c60.ok && Math.abs(logK(c60, "OH-") + 13.03) < 0.006 && Math.abs(logK(c60, "Calcite(s)") - 8.82) < 0.006 && Math.abs(logK(c60, "CaCO3(aq)") - 3.50) < 0.006,
           `OH- ${logK(c60, "OH-")}, calcite ${logK(c60, "Calcite(s)")}, ${(c60.missing || []).join(" ")}`);
    // a reactant that is in no element file is named by the search (the fault of DBSearch corrected in build-web.sh)
    await engine.writeFiles({ "/chess/nowater.txt": cz.txt, "/chess/nowater.elt": cz.elt.replace(/^XX,.*\n/m, "") });
    const nw = await engine.searchOnce({ databases: ["/chess/nowater.txt"], components: ["H+", "Ca 2+", "CO3 2-"] });
    record("Chess", "a reactant in no element file is named", /Component "H2O" in complex "[^"]+"\s+not found in the element-files/.test(nw.ask || ""), (nw.ask || nw.log || "").slice(0, 120));
  }

  // ---- manual input of a chemical system (byhand.js): pKa values, stepwise constants and a
  //      solubility product become a data file the engine reads, and a text database it searches
  const hand = require(path.join(WEB, "byhand.js"));
  const spec = { pKw: 14, t: 25, water: true, blocks: [
    { type: "acid", base: "PO4 3-", kind: "pKa", values: "2.15 7.20 12.35" },
    { type: "acid", base: "NH3", kind: "pKb", values: "4,75" },
    { type: "complex", metal: "Cu 2+", ligand: "NH3", kind: "step", values: "4.04, 3.43, 2.80, 1.48" },
    { type: "complex", metal: "Cu 2+", ligand: "OH-", kind: "cum", values: "6.3 11.8" },
    { type: "reaction", product: "Cu(OH)2(s)", reactants: [[1, "Cu 2+"], [2, "OH-"]], kind: "ksp", logK: "-19.3" },
    { type: "reaction", product: "CuHPO4", reactants: [["", "Cu 2+"], [1, "H+"], [1, "PO4-3"], ["", ""]], kind: "form", logK: "16.5" } ] };
  const hz = hand.build(spec), hk = n => { const x = (hz.species || []).find(y => y.name === n); return x ? x.logK : NaN; };
  record("ByHand", "pKa, pKb, stepwise and cumulative constants, log Ksp: the accumulated log K",
         hz.ok && !hz.warnings.length && hz.components.join("|") === "H+|PO4 3-|NH3|Cu 2+" &&
         hk("HPO4 2-") === 12.35 && hk("H2PO4-") === 19.55 && hk("H3PO4") === 21.7 && hk("NH4+") === 9.25 &&
         hk("Cu(NH3)4 2+") === 11.75 && hk("CuOH+") === -7.7 && hk("Cu(OH)2") === -16.2 && hk("Cu(OH)2(s)") === -8.7 && hk("OH-") === -14,
         JSON.stringify(hz.errors));
  record("ByHand", "the data file as the reference", hz.ok && hz.dat === read(path.join(T, "byhand/system.dat")));
  const wrong = [
    [{ blocks: [] }, /Nothing is entered/],
    [{ blocks: [{ type: "acid", base: "CO3 2-", values: "10.33 6.35" }, { type: "acid", base: "HCO3-", values: "6.35" }] }, /H2CO3 is given twice/],
    [{ blocks: [{ type: "reaction", product: "A", reactants: [[1, "B"], [1, "C"]], logK: 1 }, { type: "reaction", product: "B", reactants: [[1, "A"], [1, "D"]], logK: 1 }] }, /B and A are each formed from the other/],
    [{ blocks: [{ type: "reaction", product: "E", reactants: [[1, "E"], [1, "D"]], logK: 1 }] }, /E is among its own reactants/],
    [{ blocks: [{ type: "reaction", product: "Fe 2+", reactants: [[1, "Fe 3+"]], kind: "E0", logK: 0.771 }] }, /with E° the electrons are among the reactants/],
    [{ blocks: [{ type: "reaction", product: "H+", reactants: [[1, "HA"], [-1, "A-"]], logK: -4 }] }, /H\+ is a component here and cannot be a product/],
    [{ blocks: [{ type: "acid", base: "CO3 2-", values: "10.33 x" }] }, /not all numbers/],
    [{ blocks: [{ type: "reaction", product: "CaCO3,s", reactants: [[1, "Ca 2+"]], logK: 8.48 }] }, /cannot contain a comma/],
    [{ blocks: [{ type: "reaction", product: "CaCO3(s)", reactants: [[1, "Ca 2+"], [1, "CO3 2-"]], logK: "" }] }, /give log K as a number/]
  ].map(([s, re]) => { const x = hand.build(s); return !x.ok && x.errors.some(e => re.test(e.text)); });
  const unbalanced = hand.build({ blocks: [{ type: "reaction", product: "CaCO3(s)", reactants: [[1, "Ca 2+"], [1, "CO3-"]], logK: 8.48 }] });
  record("ByHand", "what is wrong is told; charges that do not add up give a warning", wrong.every(Boolean) && unbalanced.ok && /charges do not add up/.test((unbalanced.warnings[0] || {}).text || ""), wrong.join(" "));
  // redox: a standard potential becomes log K = n E° F/(RT ln 10), and a species formed in one
  // entry (Fe 2+, HCO3-) is a reactant in another, where its own reaction is put in its place
  const iron = hand.build({ pKw: 14, t: 25, water: true, blocks: [
    { type: "reaction", product: "Fe 2+", reactants: [[1, "Fe 3+"], [1, "e-"]], kind: "E0", logK: "0,771" },
    { type: "complex", metal: "Fe 3+", ligand: "OH-", kind: "cum", values: "11.81 22.3" },
    { type: "complex", metal: "Fe 2+", ligand: "OH-", kind: "step", values: "4.5" },
    { type: "reaction", product: "Fe(OH)3(s)", reactants: [[1, "Fe 3+"], [3, "OH-"]], kind: "ksp", logK: "-38.8" },
    { type: "reaction", product: "Fe(OH)2(s)", reactants: [[1, "Fe 2+"], [2, "OH-"]], kind: "ksp", logK: "-15.1" } ] });
  const fk = n => { const x = (iron.species || []).find(y => y.name === n); return x ? x.logK + " " + x.coef.join(",") : ""; };
  const carb = hand.build({ blocks: [{ type: "acid", base: "CO3 2-", values: "10.33" }, { type: "acid", base: "HCO3-", values: "6.35" }] });
  const mn = hand.build({ t: 25, blocks: [{ type: "reaction", product: "Mn 2+", reactants: [[1, "MnO4-"], [8, "H+"], [5, "e-"]], kind: "E0", logK: 1.51 }] });
  const ox = hand.build({ t: 25, blocks: [{ type: "reaction", product: "Fe 3+", reactants: [[1, "Fe 2+"], [-1, "e-"]], kind: "E0", logK: 0.771 }] });
  record("ByHand", "E° becomes log K; a product of one entry is a reactant in another",
         iron.ok && !iron.warnings.length && iron.components.join("|") === "H+|e-|Fe 3+" &&
         fk("Fe 2+") === "13.0326 0,1,1" && fk("FeOH 2+") === "-2.19 -1,0,1" && fk("FeOH+") === "3.5326 -1,1,1" &&
         fk("Fe(OH)3(s)") === "-3.2 -3,0,1" && fk("Fe(OH)2(s)") === "0.1326 -2,1,1" &&
         carb.ok && carb.components.join("|") === "H+|CO3 2-" && carb.species.find(x => x.name === "H2CO3").logK === 16.68 &&
         mn.ok && mn.species[0].logK === 127.6214 && ox.ok && ox.species[0].logK === -13.0326 && ox.components.join("|") === "H+|e-|Fe 2+",
         JSON.stringify([iron.errors, iron.species && iron.species.map(x => x.name + " " + x.logK), carb.errors, mn.errors, ox.errors]));
  if (iron.ok) {
    const fd = await engine.datDefaults(iron.dat), fm = fd.ok ? await engine.datRead({ text: fd.dat }) : fd;
    const fdb = hand.database(iron, "Test");
    await engine.writeFiles({ "/hand/Fe.txt": fdb.txt, "/hand/Fe.elt": fdb.elt });
    const fs2 = await engine.search({ databases: ["/hand/Fe.txt"], components: ["H+", "e-", "Fe 3+"], allSolids: 1 });
    const got = n => { const l = (fs2.dat || "").split(/\r?\n/).find(x => x.split(",")[0].trim() === n); return l ? parseFloat(l.split(",")[1]) : NaN; };
    record("ByHand", "the redox system is read by the engine, and found by the search as a text database",
           fd.ok && fm.ok && fm.model.na === 3 && fm.model.species.length === 7 &&
           fs2.ok && fs2.species.length === 7 && !(fs2.warnings || []).length && got("Fe 2+") === 13.033 && got("Fe(OH)2(s)") === 0.133,   // DataBase writes three decimals
           `${(fd.log || fm.log || "").slice(0, 150)} ${fs2.species && fs2.species.length} species; ${(fs2.log || "").slice(0, 200)}`);
  }
  if (hz.ok) {
    const hd = await engine.datDefaults(hz.dat), hm = hd.ok ? await engine.datRead({ text: hd.dat }) : hd;
    record("ByHand", "the engine reads the data file and sets a default diagram",
           hd.ok && hd.defaulted && hm.ok && hm.model.na === 4 && hm.model.species.length === 13 && hm.model.species.filter(x => x.name.trim() === "Cu(OH)2(s)").length === 1,
           (hd.log || hm.log || "").slice(0, 200));
    const hdb = hand.database(hz, "Test");
    await engine.writeFiles({ "/hand/Mine.txt": hdb.txt, "/hand/Mine.elt": hdb.elt });
    const hs = await engine.search({ databases: ["/hand/Mine.txt"], components: ["H+", "PO4 3-", "NH3", "Cu 2+"], allSolids: 1 });
    const found = n => { const l = (hs.dat || "").split(/\r?\n/).find(x => x.split(",")[0].trim() === n); return l ? parseFloat(l.split(",")[1]) : NaN; };
    record("ByHand", "the same reactions as a text database are found by the search",
           hs.ok && hs.species.length === 13 && !(hs.warnings || []).length && found("H3PO4") === 21.7 && found("Cu(OH)2(s)") === -8.7 && found("OH-") === -14,
           `${hs.species && hs.species.length} species; ${(hs.log || "").slice(0, 200)}`);
  }

  // ---- Database: the components of text databases read in the page (builtin-db.js)
  //      must be those the engine reads (LibDB.readElements)
  vm.runInThisContext(read(path.join(WEB, "builtin-db.js")));
  const textSets = [
    ["KTH KD1280", [path.join(WEB, "data/kth/KD1280.skv"), path.join(WEB, "data/kth/KD1280.elm")]],
    ["Soltherm", [path.join(WEB, "data/release/other_databases/Soltherm.txt"), path.join(WEB, "data/release/other_databases/Soltherm.elt")]],
    ["R + Extra (maintenance tests)", [path.join(T, "maint/in/R.txt"), path.join(T, "maint/in/R.elt"), path.join(T, "maint/in/Extra.txt"), path.join(T, "maint/in/Extra.elt")]]
  ];
  for (const [label, paths] of textSets) {
    const files = paths.map(f => ({ name: path.basename(f), buffer: new Uint8Array(fs.readFileSync(f)).buffer }));
    const map = {}; for (const f of files) map["/el/" + f.name] = f.buffer;
    await engine.writeFiles(map);
    const dbs = files.map(f => f.name).filter(n => /\.(txt|skv|csv)$/i.test(n));
    const e = await engine.elements(dbs.map(d => "/el/" + d));
    const js = BuiltinDb.readElementsText(files, dbs);
    record("Database", `components of ${label} read in the page = engine`, e.ok && JSON.stringify(js) === JSON.stringify(e.elements),
           e.ok ? `${js ? js.length : "null"} vs ${e.elements.length}` : e.error);
  }
  record("Database", "binary databases are left to the engine",
         BuiltinDb.readElementsText([{ name: "Reactions.db", buffer: new ArrayBuffer(1) }, { name: "Reactions.elb", buffer: new ArrayBuffer(1) }], ["Reactions.db"]) === null);

  // ---- Style: the labels of plot files as text (chemtext.js against the desktop chemF),
  //      drawing with fonts and palettes, and the PDF writer (diagram.js)
  vm.runInThisContext(read(path.join(WEB, "chemtext.js")));
  vm.runInThisContext(read(path.join(WEB, "diagram.js")) + "\n;globalThis.__plot = { pltToSvg, pltToPdf, parsePlt };");
  const chemRef = lines(path.join(T, "chemtext/chemf-java.tsv")).map(l => l.split("\t"));
  const chemBad = chemRef.filter(([label, t, d]) => {
    const r = ChemText.chemF(label);
    return r.t !== t || r.d.map(x => Math.round(x * 10) + ",").join("") !== d;
  });
  record("Style", "chemF as the desktop programs", chemBad.length === 0, `${chemRef.length - chemBad.length} of ${chemRef.length}` + (chemBad.length ? `; first: ${chemBad[0][0]}` : ""));
  const ex1 = await engine.run("sed", ["-d=/style/ex1.dat"], { files: { "/style/ex1.dat": read(path.join(WEB, "data/examples/01-Make your 1st diagram.dat")) }, outputs: ["/style/ex1.plt"] });
  const plt1 = ex1.files["/style/ex1.plt"] || "";
  const model1 = __plot.parsePlt(plt1);
  const svgSans = __plot.pltToSvg(plt1, { font: "sans", palette: "safe" }), svgPlot = __plot.pltToSvg(plt1, true);
  record("Style", "labels as text with a font, none as text in plotter style",
         model1 && model1.labels.length === (svgSans.match(/<text /g) || []).length && model1.labels.length > 10 && !/<text /.test(svgPlot) &&
         /<tspan[^>]*dy="[^"]+">2\+<\/tspan>/.test(svgSans) && /#0072b2/.test(svgSans) && !/#0072b2/.test(svgPlot));
  // axes drawn by the page: the program's tick values by default, a given step, a grid and a box
  // labels that are one number (one run of text)
  const numbers = svg => (svg.match(/<text [^>]*><tspan[^>]*>[^<]*<\/tspan><\/text>/g) || []).map(t => t.replace(/<[^>]+>/g, "")).filter(t => /^[\u2013-]?\d+(\.\d+)?$/.test(t));
  const svgStep = __plot.pltToSvg(plt1, { font: "sans", xStep: 1, yStep: 2.5, grid: "major", frame: "box", ticks: "out", minor: 2 });
  record("Style", "axes: the program's ticks by default, a given tick step, grid and box",
         numbers(svgSans).join(" ") === "2 4 6 8 10 12 \u20138 \u20136 \u20134 \u20132 0" &&
         numbers(svgStep).join(" ") === "1 2 3 4 5 6 7 8 9 10 11 12 \u20137.5 \u20135.0 \u20132.5 0.0" &&
         /#cfd3d8/.test(svgStep) && !/#cfd3d8/.test(svgSans) && model1.axis && model1.axis.xLow === 1 && model1.axis.xHigh === 12,
         numbers(svgSans).join(" ") + " | " + numbers(svgStep).join(" "));
  const pdf = __plot.pltToPdf(plt1, { font: "serif" }), pdfText = String.fromCharCode(...pdf);
  const xrefAt = +pdfText.match(/startxref\n(\d+)/)[1];
  record("Style", "PDF with the diagram and its labels", pdfText.startsWith("%PDF-1.4") && pdfText.substr(xrefAt, 4) === "xref" &&
         /\/BaseFont \/Times-Roman/.test(pdfText) && (pdfText.match(/ Tj/g) || []).length >= model1.labels.length);

  // ---- summary
  let all = 0, passed = 0;
  for (const [g, rs] of Object.entries(results)) {
    const n = rs.filter(x => x.ok).length; all += rs.length; passed += n;
    console.log(`${g.padEnd(9)} ${n} of ${rs.length}`);
  }
  console.log(`total     ${passed} of ${all} passed (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  process.exit(passed === all ? 0 : 1);
})();
