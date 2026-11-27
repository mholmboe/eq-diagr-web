// The databases bundled with the web app (data/README.md), and which set of
// database files a page starts with.
//  - Files the user loaded, remembered in browser storage ("databases"/"current"),
//    come first.
//  - Otherwise a bundled database: the one chosen earlier ("databases"/"builtin"),
//    else the one in the link (app.html?db=release), else the KTH course database.
// The bundled files are not copied into browser storage; only the choice is.
(function (global) {
  const SETS = {
    kth: { label: "KTH course KD1280 (58 components, 25 °C)", short: "KTH course database KD1280",
           files: ["data/kth/KD1280.skv", "data/kth/KD1280.elm"] },
    release: { label: "eq-diagr database (169 components)", short: "eq-diagr database",
               files: ["data/release/Reactions.db", "data/release/Reactions.elb", "data/release/References.txt"] },
    sample: { label: "small sample (9 elements)", short: "small sample database",
              files: ["data/sample/Reactions.db", "data/sample/Reactions.elb"] },
    // the alternative databases of the release (other_databases), in advanced mode
    wateq4f: { label: "Wateq4F", short: "Wateq4F database", adv: true,
               files: ["data/release/other_databases/Wateq4F.db", "data/release/other_databases/Wateq4F.elb", "data/release/other_databases/Wateq4F_References.txt"] },
    minteq: { label: "MintEQ v4", short: "MintEQ v4 database", adv: true,
              files: ["data/release/other_databases/MintEQ-v4.db", "data/release/other_databases/MintEQ-v4.elb", "data/release/other_databases/MintEQ-v4_References.txt"] },
    hydra: { label: "Medusa-Hydra", short: "Medusa-Hydra database", adv: true,
             files: ["data/release/other_databases/Medusa-Hydra.db", "data/release/other_databases/Medusa-Hydra.elb", "data/release/other_databases/Medusa-Hydra_References.txt"] },
    soltherm: { label: "Soltherm (high temperatures)", short: "Soltherm database", adv: true,
                files: ["data/release/other_databases/Soltherm.txt", "data/release/other_databases/Soltherm.elt", "data/release/other_databases/Soltherm_References.txt"] }
  };
  const DEFAULT = "kth";

  function linkChoice() {
    let q = "";
    try { q = global.top.location.search; } catch (e) { q = global.location.search; }
    const id = new URLSearchParams(q).get("db");
    return id && SETS[id] ? id : null;
  }
  async function fetchSet(id) {
    return Promise.all(SETS[id].files.map(async u => {
      const r = await fetch(u);
      if (!r.ok) throw new Error(`${u}: ${r.status}`);
      return { name: u.split("/").pop(), buffer: await r.arrayBuffer() };
    }));
  }
  // ---- element files
  // The components of text databases (.txt, .skv, .csv with an .elt or .elm
  // file) are read here, as LibDB.readElements, readElemFileText and
  // CSVparser.splitLine do, so that the periodic table is shown without
  // waiting for the engine (a 3.9 MB download); binary databases (.db with
  // .elb) are read by the engine. test-engine.js compares the two.
  const ELEM_SYMBOLS = ("e- H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr " +
    "Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu " +
    "Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn").split(" ");
  const isWs = c => c !== undefined && /\s/.test(c);
  function splitCsv(line) {   // CSVparser.splitLine
    const out = [];
    let pos = 0;
    while (pos < line.length) {
      let p = pos, c = line[p], tok = "";
      while (isWs(c)) { p++; if (p >= line.length) { c = null; break; } c = line[p]; }
      if (c === null) { out.push(""); pos = p + 1; continue; }
      if (c === "," || c === ";") { out.push(""); pos = p + 1; continue; }
      if (c !== '"' && c !== "'") {
        let i = line.length;
        const j = line.indexOf(",", p), k = line.indexOf(";", p);
        if (j > -1 && j < i) i = j;
        if (k > -1 && k < i) i = k;
        out.push(line.substring(p, i).trim()); pos = i + 1; continue;
      }
      const quote = c; p++;
      for (;;) {
        if (p >= line.length) throw new Error("missing closing quote: " + line);
        c = line[p++];
        if (c !== quote) { tok += c; continue; }
        if (p === line.length) break;
        c = line[p++];
        if (c === quote) { tok += quote; continue; }
        let end = false;
        while (isWs(c)) { if (p >= line.length) { end = true; break; } c = line[p++]; }
        if (end) break;
        if (c === "," || c === ";") { p--; break; }
        throw new Error("unexpected text after a quote: " + line);
      }
      out.push(tok); pos = p + 1;
    }
    if (line.length && (line.endsWith(",") || line.endsWith(";"))) out.push("");
    return out;
  }
  // [[element, formula, name], ...] for text databases; null when a database is binary
  function readElementsText(files, dbs) {
    const out = [["H", "H+", "hydrogen ion"]];
    const byName = new Map(files.map(f => [f.name.toLowerCase(), f]));
    for (const db of dbs) {
      if (/\.db$/i.test(db)) return null;
      const base = db.replace(/\.[^.]+$/, "").toLowerCase();
      const ef = byName.get(base + ".elt") || byName.get(base + ".elm");
      if (!ef) return null;
      const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(ef.buffer);
      for (const line of text.split(/\r\n|\n|\r/)) {
        if (line.length <= 0 || line.trim().startsWith("/")) continue;
        const a = splitCsv(line);
        let element = a[0];
        if (!element) throw new Error("empty element: " + line);
        if (!/^[+-]?\d+$/.test(a[1] || "")) throw new Error("no number: " + line);
        const n = parseInt(a[1], 10);
        if (n <= 0 || a.length < 3 || n * 2 > a.length - 1) throw new Error("too little data: " + line);
        if (!ELEM_SYMBOLS.includes(element)) element = "XX";
        for (let i = 0; i < n; i++) {
          let t1 = a[i * 2 + 2];
          if (!t1) throw new Error("empty reactant: " + line);
          const t2 = i * 2 + 3 < a.length ? a[i * 2 + 3] : "";
          if (t1.startsWith("@") && out.length > 0) {   // removes an existing component
            t1 = t1.substring(1);
            for (let j = out.length - 1; j >= 0; j--) if (out[j][1] === t1) { out.splice(j, 1); break; }
          } else {
            const found = out.find(x => x[0] === element && x[1] === t1);
            if (found) { if (t2.length) found[2] = t2; }
            else out.push([element, t1, t2]);
          }
        }
      }
    }
    return out;
  }

  global.BuiltinDb = {
    SETS, DEFAULT, readElementsText,
    fetch: fetchSet,
    /** the set to start with: {files, builtin: id or null} */
    async startup() {
      try {
        const own = await Store.get("databases", "current");
        if (own && own.length) return { files: own, builtin: null };
      } catch (e) {}
      let id = linkChoice();
      if (!id) { try { id = await Store.get("databases", "builtin"); } catch (e) {} }
      if (!SETS[id]) id = DEFAULT;
      return { files: await fetchSet(id), builtin: id };
    },
    /** the set to start with, without fetching it (for the file list of the app):
     *  {builtin: id or null, names: file names} */
    async startupInfo() {
      try {
        const own = await Store.get("databases", "current");
        if (own && own.length) return { builtin: this.which(own), names: own.map(f => f.name) };
      } catch (e) {}
      let id = linkChoice();
      if (!id) { try { id = await Store.get("databases", "builtin"); } catch (e) {} }
      if (!SETS[id]) id = DEFAULT;
      return { builtin: id, names: SETS[id].files.map(u => u.split("/").pop()) };
    },
    /** remember a bundled database as the choice (and forget loaded files) */
    async choose(id) {
      try { await Store.remove("databases", "current"); await Store.put("databases", "builtin", id); } catch (e) {}
    },
    /** which bundled set these files are, or null */
    which(files) {
      const names = files.map(f => f.name).sort().join(",");
      for (const [id, s] of Object.entries(SETS)) {
        if (s.files.map(u => u.split("/").pop()).sort().join(",") !== names) continue;
        // the sample and the full database have the same file names: compare the size
        if (id !== "release" && id !== "sample") return id;
        const db = files.find(f => /\.db$/i.test(f.name));
        if (db && (id === "sample") === (db.buffer.byteLength < 100000)) return id;
      }
      return null;
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
