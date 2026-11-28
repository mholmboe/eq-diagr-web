// Manual input of a chemical system: equilibrium constants as a textbook or a
// table gives them, written as a data file of Spana (.dat) or as a text
// database of DataBase (.txt with its element file, .elt).
//
// The constants are entered in blocks of three kinds:
//   acid      a base (the form without the protons of the acid, "PO4 3-") and
//             the pKa values of its acids, or the pKb values of the bases
//   complex   a metal ion and a ligand, with the stepwise constants
//             (log K1, log K2, ...) or the cumulative ones (log β1, log β2, ...)
//   reaction  one product formed from any reactants, with log K of the
//             formation, log Ksp of a solid, or the standard potential E° of
//             a reduction that has e- among its reactants
// The data file wants every species as a product formed from the components,
// with the accumulated log K. The conversion: pKa values are sorted and added
// up from the base (HnB: the sum of the n largest), stepwise constants are
// added up, log Ksp changes its sign, E° becomes log K = n E° F/(RT ln 10),
// OH- among the reactants becomes H2O - H+ (log K minus pKw for each OH-),
// and H2O is left out. A species formed in one entry may be a reactant in
// another (Fe 2+ from Fe 3+ + e-, then Fe(OH)2(s) from Fe 2+): its own
// reaction is put in its place, so that the components are the reactants
// that are formed from nothing else.
//
//   const r = ByHand.build({ pKw: 14, t: 25, water: true, blocks: [
//     { type: "acid", base: "PO4 3-", kind: "pKa", values: "2.15 7.20 12.35" },
//     { type: "complex", metal: "Cu 2+", ligand: "NH3", kind: "step", values: "4.04 3.43 2.80 1.48" },
//     { type: "reaction", product: "CaCO3(s)", reactants: [[1, "Ca 2+"], [1, "CO3 2-"]], kind: "ksp", logK: -8.48 } ] });
//   r.ok, r.dat, r.components, r.species [{name, logK, coef, solid, text, block, step}], r.errors, r.warnings
//   ByHand.database(r, "My data") -> { txt, elt }
(function (global) {
  "use strict";
  const ELEMENTS = ("H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe " +
    "Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr").split(" ");

  // ---- names, as eq-diagr reads them (lib/common/Util: chargeOf, nameOf, isSolid, isGas)
  const SOLID = /\((s|a|c|l|cr|am|vit|ppt)\)$/i, GAS = /\(g\)$/i;
  const isSolid = n => SOLID.test(n.trim()), isGas = n => GAS.test(n.trim());
  const clean = n => String(n == null ? "" : n).replace(/[–−]/g, "-").replace(/\s+/g, " ").trim();
  // "PO4 3-", "PO4-3", "Na +", "Al+++" -> { formula, z }; solids and gases have no charge
  function parseName(name) {
    const s = clean(name);
    if (isSolid(s) || isGas(s)) return { formula: s, z: 0 };
    let m, f = s, z = 0;
    if ((m = s.match(/^(.+?) (\d*)([+-])$/))) { f = m[1]; z = (m[2] ? +m[2] : 1) * (m[3] === "+" ? 1 : -1); }
    else if ((m = s.match(/^(.+?)([+-])(\d+)$/))) { f = m[1]; z = +m[3] * (m[2] === "+" ? 1 : -1); }
    else if ((m = s.match(/^(.+?)(\++|-+)$/))) { f = m[1]; z = m[2].length * (m[2][0] === "+" ? 1 : -1); }
    return { formula: f.replace(/\(aq\)$/i, ""), z };
  }
  // two names of the same species ("Fe 3+" and "Fe+3", "CO2" and "CO2(aq)") have the same key
  const key = name => { const p = parseName(name); return p.formula.toLowerCase() + "|" + p.z; };
  const withCharge = (formula, z) => !z ? formula : Math.abs(z) === 1 ? formula + (z > 0 ? "+" : "-") : `${formula} ${Math.abs(z)}${z > 0 ? "+" : "-"}`;
  const isWater = n => /^h2o(\(l\))?$/i.test(clean(n));
  const K_OH = key("OH-"), K_H = key("H+"), K_E = key("e-");

  // the acid with n protons more than the base: "PO4 3-" -> "HPO4 2-", "H2PO4-", "H3PO4";
  // "HS-" -> "H2S"; "CH3COO-" -> "CH3COOH"; "NH3" -> "NH4+"
  function protonated(base, n) {
    const { formula, z } = parseName(base);
    let f, m;
    if (n === 1 && /COO$/.test(formula)) f = formula + "H";
    else if (n === 1 && /NH[23]$/.test(formula)) f = formula.replace(/NH([23])$/, (_, k) => "NH" + (+k + 1));
    else if ((m = formula.match(/^H(\d*)(?![a-z])(.+)$/))) f = "H" + ((m[1] ? +m[1] : 1) + n) + m[2];
    else f = "H" + (n > 1 ? n : "") + formula;
    return withCharge(f, z + n);
  }
  // the complex of a metal with n ligands: "CuNH3 2+", "Cu(NH3)4 2+", "CuCl+", "CuCl2"
  function complexName(metal, ligand, n) {
    const M = parseName(metal), L = parseName(ligand);
    const f = n === 1 ? M.formula + L.formula : /^[A-Z][a-z]?$/.test(L.formula) ? M.formula + L.formula + n : `${M.formula}(${L.formula})${n}`;
    return withCharge(f, M.z + n * L.z);
  }

  // ---- numbers: "2.15 7.20 12.35", "2.15, 7.20", "2,15; 7,20" (a decimal comma)
  function numbers(text) {
    if (Array.isArray(text)) return text.map(Number);
    const out = [];
    for (const tok of clean(text).split(/[;\s]+/).filter(Boolean)) {
      // one comma between digits and no point: a decimal comma; otherwise commas separate
      const parts = /^[+-]?\d+,\d+$/.test(tok) ? [tok.replace(",", ".")] : tok.split(",").filter(Boolean);
      for (const p of parts) out.push(/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(p) ? +p : NaN);
    }
    return out;
  }
  const number = v => { const n = typeof v === "number" ? [v] : numbers(v); return n.length === 1 ? n[0] : NaN; };
  const round = v => +(+v).toFixed(4);
  const coefText = c => Math.abs(c) === 1 ? "" : round(Math.abs(c)) + " ";
  // RT ln(10)/F in volts (0.05916 V at 25 °C): log K = n E°/nernst(t)
  const nernst = t => 8.314462618 * (t + 273.15) * Math.LN10 / 96485.33212;
  function badName(n, what) {
    if (!n) return `${what} has no name.`;
    if (/,/.test(n)) return `"${n}": a name cannot contain a comma.`;
    if (/ \//.test(n)) return `"${n}": a name cannot contain a space followed by a slash.`;
    if (n.startsWith("*")) return `"${n}": a name cannot begin with "*".`;
    return null;
  }

  // ---- the reactions of one block, as entered: [{name, logK, reactants: [[coef, name]], step}]
  function blockReactions(b, pKw, t) {
    const names = b.names || [], own = i => clean(names[i]);
    if (b.type === "acid") {
      const base = clean(b.base);
      const bad = badName(base, "The base");
      if (bad) throw new Error(bad);
      let v = numbers(b.values);
      const what = b.kind === "pKb" ? "pKb" : "pKa";
      if (!v.length) throw new Error(`Give the ${what} values of ${base}.`);
      if (v.some(x => !isFinite(x))) throw new Error(`The ${what} values of ${base} are not all numbers.`);
      if (b.kind === "pKb") v = v.map(x => pKw - x);
      // the proton taken up first is the one held hardest: the largest pKa
      v.sort((x, y) => y - x);
      let sum = 0;
      return v.map((pKa, i) => {
        sum += pKa;
        const name = own(i) || protonated(base, i + 1), prev = i ? own(i - 1) || protonated(base, i) : base;
        return { name, auto: protonated(base, i + 1), logK: sum, reactants: [[i + 1, "H+"], [1, base]],
                 step: b.kind === "pKb" ? `pKb ${round(pKw - pKa)} (pKa ${round(pKa)}): ${prev} + H2O ⇌ ${name} + OH-` : `pKa ${round(pKa)}: ${name} ⇌ ${prev} + H+` };
      });
    }
    if (b.type === "complex") {
      const metal = clean(b.metal), ligand = clean(b.ligand);
      const bad = badName(metal, "The metal ion") || badName(ligand, "The ligand");
      if (bad) throw new Error(bad);
      if (key(metal) === key(ligand)) throw new Error(`The metal ion and the ligand are both "${metal}".`);
      const v = numbers(b.values), cum = b.kind === "cum";
      if (!v.length) throw new Error(`Give the constants of ${metal} with ${ligand}.`);
      if (v.some(x => !isFinite(x))) throw new Error(`The constants of ${metal} with ${ligand} are not all numbers.`);
      let sum = 0;
      return v.map((x, i) => {
        sum = cum ? x : sum + x;
        const name = own(i) || complexName(metal, ligand, i + 1), prev = i ? own(i - 1) || complexName(metal, ligand, i) : metal;
        return { name, auto: complexName(metal, ligand, i + 1), logK: sum, reactants: [[1, metal], [i + 1, ligand]],
                 step: cum ? `log β${i + 1} ${round(x)}: ${metal} + ${coefText(i + 1)}${ligand} ⇌ ${name}` : `log K${i + 1} ${round(x)}: ${prev} + ${ligand} ⇌ ${name}` };
      });
    }
    if (b.type === "reaction") {
      const name = clean(b.product);
      const bad = badName(name, "The product");
      if (bad) throw new Error(bad);
      const reactants = [];
      for (const [c, r] of b.reactants || []) {
        const rn = clean(r), blank = c === "" || c == null;
        if (!rn && blank) continue;
        if (!rn) throw new Error(`${name}: a reactant has a coefficient and no name.`);
        const cv = blank ? 1 : number(c);
        if (!isFinite(cv)) throw new Error(`${name}: the coefficient of ${rn} is not a number.`);
        const br = badName(rn, "A reactant");
        if (br) throw new Error(br);
        reactants.push([cv, rn]);
      }
      if (!reactants.length) throw new Error(`${name}: give the reactants it is formed from.`);
      const v = number(b.logK), ksp = b.kind === "ksp", pot = b.kind === "E0";
      if (!isFinite(v)) throw new Error(`${name}: give ${ksp ? "log Ksp" : pot ? "E° (in volts)" : "log K"} as a number.`);
      const side = reactants.map(([c, r]) => `${c < 0 ? "- " : ""}${coefText(c)}${r}`).join(" + ").replace(/\+ - /g, "- ");
      if (pot) {
        // the standard potential of the reduction: n electrons among the reactants
        const ne = reactants.reduce((sum, [c, r]) => sum + (key(r) === K_E ? c : 0), 0);
        if (!ne) throw new Error(`${name}: with E° the electrons are among the reactants, as in Fe 3+ + e- ⇌ Fe 2+.`);
        const logK = ne * v / nernst(t);
        return [{ name, logK, reactants, step: `E° ${round(v)} V (log K ${round(logK)}): ${side} ⇌ ${name}` }];
      }
      return [{ name, logK: ksp ? -v : v, reactants,
                step: ksp ? `log Ksp ${round(v)}: ${name} ⇌ ${side}` : `log K ${round(v)}: ${side} ⇌ ${name}` }];
    }
    throw new Error("Unknown kind of entry.");
  }

  /** The chemical system of the blocks: the data file, or what is wrong. */
  function build(spec) {
    const errors = [], warnings = [], raw = [];
    const pKw = spec.pKw === undefined || spec.pKw === "" ? 14 : number(spec.pKw);
    const t = spec.t === undefined || spec.t === "" ? 25 : number(spec.t);
    if (!isFinite(pKw)) errors.push({ block: -1, text: "pKw is not a number." });
    if (!isFinite(t)) errors.push({ block: -1, text: "The temperature is not a number." });
    (spec.blocks || []).forEach((b, i) => {
      try { for (const [n, r] of blockReactions(b, isFinite(pKw) ? pKw : 14, isFinite(t) ? t : 25).entries()) raw.push(Object.assign(r, { block: i, n })); }
      catch (e) { errors.push({ block: i, text: e.message }); }
    });

    // a species formed in one entry may be a reactant in another: its own reaction is put in its place
    const products = new Map();
    for (const r of raw) if (!products.has(key(r.name))) products.set(key(r.name), r);
    // the components: the reactants that are formed from nothing else, H+ and e- first; OH- and H2O are none
    const comps = [], compKeys = new Map();
    const comp = name => { const k = key(name); if (!compKeys.has(k)) { compKeys.set(k, comps.length); comps.push(name); } return compKeys.get(k); };
    const water = spec.water !== false;
    const used = raw.flatMap(r => r.reactants.map(x => x[1])).filter(n => !isWater(n));
    if (water || used.some(n => key(n) === K_H || key(n) === K_OH)) comp("H+");
    if (used.some(n => key(n) === K_E)) comp("e-");
    for (const n of used) if (key(n) !== K_OH && !products.has(key(n))) comp(n);

    // the reaction of r written with components only: { coef, logK, w (the water of the reaction), error }
    const resolved = new Map();
    function resolve(r, chain) {
      const k = key(r.name);
      if (resolved.has(k)) return resolved.get(k);
      const out = { coef: comps.map(() => 0), logK: r.logK, w: 0 };
      for (const [c, n] of r.reactants) {
        const kn = key(n);
        if (isWater(n)) out.w += c;
        else if (kn === K_OH) { out.coef[comp("H+")] -= c; out.logK -= c * pKw; out.w += c; }
        else if (compKeys.has(kn)) out.coef[compKeys.get(kn)] += c;
        else if (kn === k) { out.error = `${r.name} is among its own reactants.`; break; }
        else if (chain.includes(kn)) { out.error = `${r.name} and ${products.get(kn).name} are each formed from the other. One of them must be formed from other species only.`; break; }
        else {
          const sub = resolve(products.get(kn), chain.concat(k));
          if (sub.error) { out.error = sub.error; break; }
          sub.coef.forEach((x, i) => { out.coef[i] += c * x; });
          out.logK += c * sub.logK; out.w += c * sub.w;
        }
      }
      resolved.set(k, out);
      return out;
    }

    const species = [], seen = new Map();
    for (const r of raw) {
      const k = key(r.name), bad = badName(r.name, "A product");
      if (bad) { errors.push({ block: r.block, text: bad }); continue; }
      if (isWater(r.name)) { errors.push({ block: r.block, text: "H2O cannot be a product: water is always there." }); continue; }
      if (compKeys.has(k)) { errors.push({ block: r.block, text: `${r.name} is a component here and cannot be a product.` }); continue; }
      if (seen.has(k)) { errors.push({ block: r.block, text: `${r.name} is given twice.` }); continue; }
      seen.set(k, true);
      const x = resolve(r, []);
      if (x.error) { errors.push({ block: r.block, text: x.error }); continue; }
      if (x.coef.every(c => !c)) { errors.push({ block: r.block, text: `${r.name}: nothing is left of the reactants.` }); continue; }
      // the charges of the two sides, of the reaction as it was entered
      const left = r.reactants.reduce((sum, [c, n]) => sum + c * parseName(n).z, 0), right = parseName(r.name).z;
      if (Math.abs(left - right) > 1e-9)
        warnings.push({ block: r.block, text: `${enteredText(r.reactants, r.name)}: the charges do not add up (${signed(left)} on the left, ${signed(right)} on the right). Check the names and the coefficients.` });
      species.push({ name: r.name, auto: r.auto, logK: round(x.logK), coef: x.coef.map(round), solid: isSolid(r.name), text: reactionText(x.coef, comps, r.name, x.w), step: r.step, block: r.block, n: r.n });
    }
    // water: OH- with pKw, unless it was entered
    if (water && comps.length && !seen.has(K_OH) && !compKeys.has(K_OH)) {
      const coef = comps.map(() => 0); coef[comp("H+")] = -1;
      species.push({ name: "OH-", logK: round(-pKw), coef, solid: false, text: reactionText(coef, comps, "OH-", 1), step: `pKw ${round(pKw)}: H2O ⇌ OH- + H+`, block: -1, n: 0 });
    }
    if (!errors.length && !raw.length) errors.push({ block: -1, text: "Nothing is entered yet." });
    species.sort((a, b) => a.solid - b.solid);
    const result = { ok: !errors.length, errors, warnings, components: comps, species, pKw, t };
    if (result.ok) result.dat = datText(result, spec.title);
    return result;
  }
  const signed = z => (z > 0 ? "+" : z < 0 ? "−" : "") + round(Math.abs(z));
  // the reaction as entered: "Cu 2+ + 2 OH- ⇌ Cu(OH)2(s)"; a negative coefficient goes to the right
  function enteredText(reactants, name) {
    const side = sign => reactants.filter(([c]) => c * sign > 0).map(([c, n]) => coefText(c) + n);
    return `${side(1).join(" + ") || "…"} ⇌ ${[name, ...side(-1)].join(" + ")}`;
  }
  // "3 H+ + PO4 3- ⇌ H3PO4"; a negative coefficient goes to the right: "Ca 2+ + H2O ⇌ CaOH+ + H+"
  // (w: the water of the reaction, known where OH- or H2O was written)
  function reactionText(coef, comps, name, w) {
    const side = sign => coef.map((c, i) => c * sign > 0 ? coefText(c) + comps[i] : null).filter(Boolean)
      .concat(w * sign > 0 ? [coefText(w) + "H2O"] : []);
    return `${side(1).join(" + ") || "…"} ⇌ ${[name, ...side(-1)].join(" + ")}`;
  }

  // ---- the data file (the chemical system only: Spana adds a default diagram)
  function datText(r, title) {
    const sol = r.species.filter(x => !x.solid).length, solids = r.species.length - sol;
    const num = v => { const s = String(round(v)); return (v < 0 ? "" : " ") + s; };
    const lines = [` ${r.components.length}, ${sol}, ${solids}, 0,   /manual input, t= ${round(r.t)}`];
    for (const c of r.components) lines.push(c);
    for (const x of r.species)
      lines.push(`${x.name.padEnd(20)}, ${num(x.logK).padEnd(10)}${x.coef.map(c => String(round(c)).padStart(3)).join("")}`);
    return lines.join("\n") + "\n";
  }

  // ---- the same reactions as a text database with its element file
  // The element of a component: the first element of its formula that is not
  // H or O; a name that is no formula (EDTA, acetate) goes under carbon, as
  // the organic ligands of the eq-diagr databases.
  function elementOf(name) {
    if (key(name) === K_E) return "e-";
    if (key(name) === K_H) return "H";
    const f = parseName(name).formula;
    const tokens = f.match(/[A-Z][a-z]?|\d+|[().]/g) || [];
    if (tokens.join("") !== f || !tokens.every(x => !/[A-Z]/.test(x) || ELEMENTS.includes(x))) return "C";
    const syms = tokens.filter(x => /[A-Z]/.test(x));
    return syms.find(x => x !== "H" && x !== "O") || syms[0] || "C";
  }
  /** r: a result of build(); reference: the text in the reference column. Constants at 25 °C. */
  function database(r, reference) {
    const ref = clean(reference || "manual input").replace(/;/g, ",");
    const rows = ["COMPLEX;LogK;DH_kJmol;DCp_Jmol;R1;N1;R2;N2;R3;N3;R4;N4;R5;N5;R6;N6;H;Reference / Comment"];
    for (const x of r.species) {
      const re = x.coef.map((c, i) => c ? `${r.components[i]};${round(c)}` : null).filter(Boolean);
      rows.push(`${x.name};${x.logK};;;${re.length};${re.join(";")};${ref}`);
    }
    const byEl = new Map();
    for (const c of r.components) { const el = elementOf(c); if (!byEl.has(el)) byEl.set(el, []); byEl.get(el).push(c); }
    const order = el => el === "e-" ? -1 : ELEMENTS.indexOf(el);
    const elt = [...byEl].sort((a, b) => order(a[0]) - order(b[0]))
      .map(([el, list]) => `${el}, ${list.length} ,${list.map(c => `${c},${key(c) === K_E ? "electron (= redox potential)" : ""}`).join(",")},`).join("\n") + "\n";
    return { txt: rows.join("\n") + "\n", elt };
  }

  const api = { build, database, numbers, parseName, protonated, complexName, isSolid, key, nernst };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else global.ByHand = api;
})(typeof window !== "undefined" ? window : globalThis);
