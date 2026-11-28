// Databases in the format of CHESS (van der Lee, Ecole des Mines de Paris;
// files ending in .tdb) converted to a text database of eq-diagr and its
// element file, so that they can be loaded as any database of the user.
//
// A CHESS file has blocks "name { key = value ... }": the basis species, the
// redox couples, and the aqueous species, gases and minerals, each with a
//   composition = 1 Ca[2+], 1 CO3[2-]
//   logK = 8.3933(0), 8.4749(25), 8.8213(60), 9.4600(100)
// where log K is that of the formation from the reactants (as in eq-diagr) and
// the numbers in parentheses are temperatures in degrees Celsius.
//
// What the conversion does:
//  - the basis species become the components, each under its chemical element;
//  - a reactant that is not a basis species (a species of a redox couple) is
//    replaced by its own reaction, so that only components are left;
//  - redox reactions, written with O2(aq) in CHESS, are written with the
//    electron: O2(aq) + 4 H+ + 4 e- = 2 H2O, with the log K given in the file
//    as "H2O-halfredox";
//  - names: Ca[2+] becomes "Ca 2+"; minerals get the ending "(s)" by which
//    eq-diagr knows a solid;
//  - log K at several temperatures becomes the analytic expression of eq-diagr,
//    log K = a0 + a1 T + a2/T + a3 log10(T) + a4/T^2, through the value at 25 C,
//    with as few terms as reproduce the table, valid up to its last temperature.
// Left out, because eq-diagr has no such species: surface sites, colloids and
// organic matter.
//
//   const r = ChessTdb.convert(text, "minteq.tdb");
//     r.ok, r.txt, r.elt, r.base ("minteq-chess"), r.summary, r.details, r.report
//   const { files, reports } = ChessTdb.convertFiles([{ name, buffer }, ...]);
// Works in the browser and in Node (tests).
(function (global) {
  const ELEMENTS = ("H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe " +
    "Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf").split(" ");
  const R_LN10 = 8.31446 * Math.LN10, T0 = 298.15;
  const TOLERANCE = 0.005;      // log K units: a table is "reproduced" within this

  // ---- reading: blocks "name { ... }", comments from "#", lines continued with "\"
  function parse(text) {
    const lines = String(text).replace(/^﻿/, "").replace(/\r/g, "").replace(/\\[ \t]*\n/g, " ").split("\n").map(l => l.replace(/#.*$/, "").trim()).filter(Boolean);
    const root = { name: "", props: {}, blocks: [] }, stack = [root];
    for (const l of lines) {
      const top = stack[stack.length - 1];
      if (l.endsWith("{")) { const b = { name: l.slice(0, -1).trim(), props: {}, blocks: [] }; top.blocks.push(b); stack.push(b); }
      else if (l === "}") { if (stack.length > 1) stack.pop(); }
      else { const i = l.indexOf("="); if (i > 0) top.props[l.slice(0, i).trim()] = l.slice(i + 1).trim(); }
    }
    return root;
  }
  // "8.4690(25), 7.0181(60)" -> [[25, 8.469], [60, 7.0181]]; a number alone is the value at 25 C
  function tValues(s) {
    const out = []; let m; const re = /(-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)\s*\(\s*(-?\d+\.?\d*)\s*\)/gi;
    while ((m = re.exec(s || ""))) out.push([+m[2], +m[1]]);
    if (!out.length && /^-?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test((s || "").trim())) out.push([25, +s]);
    // 500 stands for "no data" in files that come from EQ3/6
    return out.filter(p => Math.abs(p[1]) < 499).sort((a, b) => a[0] - b[0]);
  }
  function composition(s) {
    const out = [];
    for (const part of (s || "").split(",").map(x => x.trim()).filter(Boolean)) {
      const m = part.match(/^(-?(?:\d+\.?\d*|\.\d+))\s+(.+)$/);
      if (!m) return null;
      out.push([m[2].trim(), +m[1]]);
    }
    return out.length ? out : null;
  }
  // the value at t: as given, or between the two neighbours
  function at(pts, t) {
    for (const p of pts) if (Math.abs(p[0] - t) < 1e-6) return p[1];
    if (!pts.length || t < pts[0][0] || t > pts[pts.length - 1][0]) return NaN;
    for (let i = 1; i < pts.length; i++) if (t < pts[i][0]) { const a = pts[i - 1], b = pts[i]; return a[1] + (b[1] - a[1]) * (t - a[0]) / (b[0] - a[0]); }
    return NaN;
  }

  // ---- names
  const isSolidName = n => /\((s|a|c|l|cr|am|vit|ppt)\)$/i.test(n);
  function eqName(n, kind) {
    let s = n.trim().replace(/\[(\d*\.?\d*)([+-])\]$/, (_, k, sign) => (k && k !== "1" ? " " + k : "") + sign);
    // "NpO2OH(am,aged)" -> "NpO2OH(aged)(am)": the comma separates fields in the text database
    s = s.replace(/\((s|am|c|cr),\s*([^()]+)\)$/i, "($2)($1)").replace(/[,;]/g, "-").replace(/\s{2,}/g, " ");
    if (kind === "solid" && !isSolidName(s)) s += "(s)";
    if (kind === "gas" && !/\(g\)$/i.test(s)) s += "(g)";
    return s;
  }
  // The chemical element of a component: as the file says; otherwise from the
  // formula, the first element that is not H or O. A name that is no formula
  // (Acetate, Benzoat, EDTA) is an organic ligand, kept under carbon as in the
  // element files of eq-diagr.
  function elementOf(name, given) {
    if (given && ELEMENTS.includes(given)) return given;
    const f = name.replace(/\[.*\]$/, "").replace(/\((aq|g)\)$/, "");
    const tokens = f.match(/[A-Z][a-z]?|\d+|[().]/g) || [];
    const formula = tokens.join("") === f && tokens.every(t => !/[A-Z]/.test(t) || ELEMENTS.includes(t));
    if (!formula) return "C";
    const syms = tokens.filter(t => /[A-Z]/.test(t));
    return syms.find(x => x !== "H" && x !== "O") || syms[0] || "C";
  }

  // ---- log K(T) as the analytic expression of eq-diagr
  // least squares by Householder reflections; null when the columns do not span
  function leastSquares(A, y) {
    const m = A.length, n = A[0].length, R = A.map(r => r.slice()), b = y.slice();
    const scale = []; for (let j = 0; j < n; j++) { scale[j] = Math.max(...R.map(r => Math.abs(r[j]))) || 1; for (const r of R) r[j] /= scale[j]; }
    for (let k = 0; k < n; k++) {
      let norm = 0; for (let i = k; i < m; i++) norm += R[i][k] * R[i][k];
      norm = Math.sqrt(norm);
      if (norm < 1e-9) return null;
      const alpha = R[k][k] > 0 ? -norm : norm, v = [];
      for (let i = k; i < m; i++) v.push(R[i][k]);
      v[0] -= alpha;
      const vv = v.reduce((s, x) => s + x * x, 0);
      if (vv < 1e-300) return null;
      const reflect = col => { let d = 0; for (let i = k; i < m; i++) d += v[i - k] * col(i); d = 2 * d / vv; return d; };
      for (let j = k; j < n; j++) { const d = reflect(i => R[i][j]); for (let i = k; i < m; i++) R[i][j] -= d * v[i - k]; }
      const d = reflect(i => b[i]); for (let i = k; i < m; i++) b[i] -= d * v[i - k];
    }
    const x = new Array(n).fill(0);
    for (let k = n - 1; k >= 0; k--) { let s = b[k]; for (let j = k + 1; j < n; j++) s -= R[k][j] * x[j]; if (Math.abs(R[k][k]) < 1e-10) return null; x[k] = s / R[k][k]; }
    return x.map((v, j) => v / scale[j]);
  }
  // the terms after a0, by index of a[]: T, 1/T, log10(T), 1/T^2
  const TERM = { 1: T => T, 2: T => 1 / T, 3: T => Math.log10(T), 4: T => 1 / (T * T) };
  // 1/T alone is a constant enthalpy; with log10(T), a constant heat capacity
  const MODELS = [[2], [2, 3], [1, 2, 3], [1, 2, 3, 4]];
  function analytic(pts) {
    const k25 = at(pts, 25), others = pts.filter(p => Math.abs(p[0] - 25) > 1e-6);
    if (!others.length) return null;
    let best = null;
    for (const terms of MODELS) {
      if (terms.length > others.length) break;
      const A = others.map(([t]) => terms.map(i => TERM[i](t + 273.15) - TERM[i](T0))), y = others.map(p => p[1] - k25);
      const c = leastSquares(A, y);
      if (!c) continue;
      const dev = Math.max(...others.map((p, r) => Math.abs(y[r] - A[r].reduce((s, a, j) => s + a * c[j], 0))));
      const a = [k25 - terms.reduce((s, i, j) => s + c[j] * TERM[i](T0), 0), null, null, null, null, null];
      terms.forEach((i, j) => { a[i] = c[j]; });
      if (!best || dev < best.dev - 1e-9) best = { a, dev };
      if (dev <= TOLERANCE) break;
    }
    // eq-diagr takes an analytic expression up to the critical point of water at most
    return best && { a: best.a, dev: best.dev, tMax: Math.min(370, Math.max(25, pts[pts.length - 1][0])) };
  }

  const num = x => String(+(+x).toFixed(4));
  const coef = x => x === null ? "" : String(+(+x).toPrecision(12));

  function convert(text, source) {
    const root = parse(text);
    const sect = n => (root.blocks.find(b => b.name.replace(/\s+/g, "-").toLowerCase() === n) || { blocks: [] }).blocks;
    const basis = sect("basis-species");
    const kinds = [["redox", "redox-couples"], ["aqueous", "aqueous-species"], ["gas", "gaseous-species"], ["solid", "minerals"]];
    if (!basis.length || !kinds.some(([, n]) => sect(n).length))
      return { ok: false, error: `"${source}" is not a database in the CHESS format: it has no basis species with reactions.` };
    const rep = { source, skipped: [], counts: { components: 0, aqueous: 0, gas: 0, solid: 0 }, ignored: [], withT: 0, maxDev: 0, worst: "", tMax: 25 };
    const basisNames = new Set(basis.map(b => b.name));
    const half = tValues(root.props["H2O-halfredox"]);
    for (const [n, one, many] of [["surface-sites", "surface site", "surface sites"], ["colloids", "colloid", "colloids"], ["organic-matter", "species of organic matter", "species of organic matter"]])
      if (sect(n).length) rep.ignored.push(`${sect(n).length} ${sect(n).length === 1 ? one : many}`);
    // every species that is not a basis species
    const all = new Map();
    for (const [kind, name] of kinds)
      for (const b of sect(name)) {
        const comp = composition(b.props.composition), k = tValues(b.props.logK);
        if (!comp) { rep.skipped.push(`${b.name}: no composition`); continue; }
        if (!isFinite(at(k, 25))) { rep.skipped.push(`${b.name}: no log K at 25 C`); continue; }
        if (all.has(b.name) || basisNames.has(b.name)) { rep.skipped.push(`${b.name}: defined twice (the first one is used)`); continue; }
        all.set(b.name, { name: b.name, kind, comp, k });
      }
    // the reaction with basis species only
    function reduce(sp, seen) {
      if (sp.done !== undefined) return sp.done;
      const comp = new Map(); let k = sp.k, ok = true;
      const add = (n, c) => comp.set(n, (comp.get(n) || 0) + c);
      for (const [n, c] of sp.comp) {
        if (basisNames.has(n) || n === "H2O") { add(n, c); continue; }
        const other = all.get(n);
        const d = other && !seen.has(n) ? reduce(other, new Set([...seen, sp.name])) : null;
        if (!d) { rep.skipped.push(`${sp.name}: its reactant ${n} is not defined in the file`); ok = false; break; }
        for (const [n2, c2] of d.comp) add(n2, c * c2);
        k = k.map(([t, v]) => [t, v + c * at(d.k, t)]).filter(p => isFinite(p[1]));
      }
      return (sp.done = ok && isFinite(at(k, 25)) ? { comp, k } : null);
    }
    const lines = ["COMPLEX;LogK;DH_kJmol;DCp_Jmol;R1;N1;R2;N2;R3;N3;R4;N4;R5;N5;R6;N6;H;Reference / Comment"];
    const written = new Set();
    let redox = false;
    function write(name, kind, comp, k) {
      // oxygen as the electron: O2(aq) = 2 H2O - 4 H+ - 4 e-, log K = -(H2O-halfredox)
      const o = comp.get("O2(aq)") || 0;
      if (o) {
        if (!half.length) { rep.skipped.push(`${name}: a redox reaction, but the file has no "H2O-halfredox"`); return; }
        comp.delete("O2(aq)");
        comp.set("H2O", (comp.get("H2O") || 0) + 2 * o); comp.set("H[+]", (comp.get("H[+]") || 0) - 4 * o); comp.set("e[-]", (comp.get("e[-]") || 0) - 4 * o);
        k = k.map(([t, v]) => [t, v - o * at(half, t)]).filter(p => isFinite(p[1]));
      }
      const re = [...comp].filter(([, c]) => Math.abs(c) > 1e-9);
      if (!re.length || !isFinite(at(k, 25))) { rep.skipped.push(`${name}: nothing is left of its reaction`); return; }
      const out = eqName(name, kind);
      if (written.has(out.toLowerCase())) { rep.skipped.push(`${name}: the name ${out} is already used`); return; }
      written.add(out.toLowerCase());
      if (re.some(([n]) => n === "e[-]")) redox = true;
      const f = analytic(k);
      const tPart = f ? ["analytic", num(f.tMax), ...f.a.map(coef)] : ["", ""];
      if (f) { rep.withT++; rep.tMax = Math.max(rep.tMax, f.tMax); if (f.dev > rep.maxDev) { rep.maxDev = f.dev; rep.worst = out; } }
      lines.push([out, num(at(k, 25)), ...tPart, re.length, ...re.flatMap(([n, c]) => [n === "e[-]" ? "e-" : eqName(n), num(c)]), source].join(";"));
      rep.counts[kind]++;
    }
    for (const sp of all.values()) { const d = reduce(sp, new Set()); if (d) write(sp.name, sp.kind === "redox" ? "aqueous" : sp.kind, new Map(d.comp), d.k); }
    if (basisNames.has("O2(aq)") && half.length) write("O2(aq)", "aqueous", new Map([["O2(aq)", 1]]), half.map(([t]) => [t, 0]));
    // the element file: each component under its chemical element
    const byEl = new Map(), put = (el, comp, descr) => { if (!byEl.has(el)) byEl.set(el, []); byEl.get(el).push([comp, descr]); };
    if (redox) put("e-", "e-", "electron (= redox potential)");
    for (const b of basis) {
      if (b.name === "H2O" || b.name === "O2(aq)") continue;
      put(elementOf(b.name, b.props.element), eqName(b.name), (b.props.name || "").replace(/[,;]/g, " "));
    }
    rep.counts.components = [...byEl.values()].reduce((s, x) => s + x.length, 0);
    // water is a reactant, and the search wants every reactant in the element file (as Soltherm.elt has it)
    put("XX", "H2O", "water");
    const order = el => el === "e-" ? -1 : el === "XX" ? 999 : ELEMENTS.indexOf(el);
    const elt = [...byEl].sort((a, b) => order(a[0]) - order(b[0])).map(([el, list]) => `${el}, ${list.length} ,${list.map(([c, d]) => `${c},${d}`).join(",")},`).join("\n") + "\n";
    if (!rep.counts.aqueous && !rep.counts.gas && !rep.counts.solid) return { ok: false, error: `"${source}": no reaction could be converted.` };

    const c = rep.counts, plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
    const base = source.replace(/\.[^.]+$/, "") + "-chess";
    const summary = `${source} (CHESS format) was converted to ${base}.txt: ${plural(c.components, "component", "components")}, ` +
      `${plural(c.aqueous, "aqueous species", "aqueous species")}, ${plural(c.gas, "gas", "gases")}, ${plural(c.solid, "solid", "solids")}.` +
      (rep.ignored.length || rep.skipped.length ? ` Left out: ${[...rep.ignored, rep.skipped.length ? plural(rep.skipped.length, "reaction", "reactions") : ""].filter(Boolean).join(", ")}.` : "");
    const details = [summary, "",
      "Reactants that are not basis species were replaced by their own reactions, and redox reactions are written with e- in place of O2(aq).",
      "Minerals have the ending (s). Surface sites, colloids and organic matter are not part of eq-diagr.",
      rep.withT ? `Temperature: ${rep.withT} reactions have log K at several temperatures, written as analytic expressions valid up to the last temperature of their tables (${rep.tMax} C at most). ` +
        `The expressions reproduce the tables within ${rep.maxDev < 0.0005 ? "0.001" : rep.maxDev.toFixed(rep.maxDev < 0.1 ? 3 : 2)} in log K` +
        (rep.maxDev > TOLERANCE ? ` (the largest difference is for ${rep.worst}).` : ".") : "Temperature: the file has log K at 25 C only.",
      ...(rep.skipped.length ? ["", "Reactions left out:", ...rep.skipped.map(s => "  " + s)] : [])].join("\n");
    return { ok: true, base, txt: lines.join("\n") + "\n", elt, summary, details, report: rep };
  }

  // A list of files {name, buffer} with every .tdb file replaced by its text
  // database and element file; reports: [{name, ok, summary, details}]
  function convertFiles(files) {
    const out = [], reports = [];
    const enc = new TextEncoder();
    const bytes = s => { const u = enc.encode(s); return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength); };
    for (const f of files) {
      if (!/\.tdb$/i.test(f.name)) { out.push(f); continue; }
      const b = new Uint8Array(f.buffer);
      let text;
      try { text = new TextDecoder("utf-8", { fatal: true }).decode(b); } catch (e) { text = new TextDecoder("windows-1252").decode(b); }
      const r = convert(text, f.name);
      if (!r.ok) { reports.push({ name: f.name, ok: false, summary: r.error, details: r.error }); continue; }
      out.push({ name: r.base + ".txt", buffer: bytes(r.txt) }, { name: r.base + ".elt", buffer: bytes(r.elt) });
      reports.push({ name: f.name, ok: true, summary: r.summary, details: r.details });
    }
    return { files: out, reports };
  }

  const api = { convert, convertFiles, parse };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else global.ChessTdb = api;
})(typeof window !== "undefined" ? window : globalThis);
