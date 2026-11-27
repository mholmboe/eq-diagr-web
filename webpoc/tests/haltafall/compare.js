// Compares the browser EC (HaltaFall) with PHREEQC and with the Fortran EC
// on the test cases of https://github.com/ignasi-p/haltaFall (ECf/tests-ECf).
// Used by tests/test-engine.js; run alone to print every difference:
//   node tests/haltafall/compare.js
"use strict";
const fs = require("fs"), path = require("path");
const { parsePqo, phreeqcName } = require("./phreeqc.js");
const D = __dirname;

// case: the EC input, the options of the reference runs (eq-diagr's test-cli.sh),
// the PHREEQC output, which PHREEQC test is which EC point, and the largest
// difference from PHREEQC accepted (log units; for concentrations, log10 of the ratio).
// The CO3-Ca-NaCl tolerance is wider: the PHREEQC input comments out the "-gamma"
// lines to get the Davies equation, but PHREEQC keeps the WATEQ Debye-Hueckel
// parameters of wateq4f.dat for CO3-2, Ca+2, OH- and HCO3- (log gamma(CO3-2) =
// -0.233 at I = 0.0206, against -0.243 with Davies), so the two programs differ
// by up to 0.02 log units at I = 0.11. At the low ionic strength of the Fe case
// the activity coefficients hardly matter, and the programs agree closely.
const CASES = [
  { name: "CO3-Ca-NaCl", dir: "Davies_eqn", opts: "-m=0 -t=25 -i=-1 -tol=1e-9 -tolA=1e-8",
    pqo: "ECf-HaltaFall_Test_Davies_eqn.pqo", tests: [1, 2, 3, 4, 5], solids: true, tol: 0.03 },
  // the dissolved total of the component Fe 2+ is not the dissolved iron here
  // (Fe(cr) is a component), so the element total is not compared
  { name: "Fe", dir: "Davies_eqn", opts: "-m=0 -t=25 -i=-1",
    pqo: "ECf-HaltaFall_Test_Davies_eqn.pqo", tests: [6], solids: true, tol: 0.005, skipTotals: ["Fe"] },
  // in the SIT tests PHREEQC dissolves an excess of gypsum or halite, while EC
  // is given the totals: only the solution is compared, not the amount of solid
  { name: "CaSO4-Na-Cl", dir: "SIT", opts: "-m=1 -t=25 -i=-1 -tol=1e-6",
    pqo: "ECf-HaltaFall_Test_CaSO4-Na-Cl.pqo", tests: [1, 2, 3, 4, 5], solids: false, tol: 0.005 }
];
const ELEMENT = { "CO3 2-": "C", "SO4 2-": "S", "Ca 2+": "Ca", "Na+": "Na", "Cl-": "Cl", "Fe 2+": "Fe" };
const PHASE = { Calcite: "CaCO3(cr)", Aragonite: "CaCO3(s)", Portlandite: "Ca(OH)2(cr)", Lime: "CaO(cr)",
                Magnetite: "Fe3O4(cr)", Goethite: "FeOOH(cr)", "Fe(OH)2(cr)": "Fe(OH)2(cr)" };

function table(csv) {
  const rows = csv.replace(/\r/g, "").split("\n").filter(l => l.trim()).map(l => l.replace(/,\s*$/, "").split(",").map(c => c.trim()));
  return rows.slice(1).map(r => Object.fromEntries(rows[0].map((h, j) => [h, r[j]])));
}
const ecNames = row => Object.keys(row).filter(h => h.startsWith("C(")).map(h => h.slice(2, -1));

// The quantities compared, each with PHREEQC's value and EC's:
// pH, pe, ionic strength, the dissolved total of each element, the molality of
// each aqueous species found in both, and the moles of each solid (Davies cases).
function pairs(ecRow, pq, c) {
  const out = [], num = k => Number(ecRow[k]);
  out.push({ q: "pH", log: true, pq: pq.pH, ec: num("pH") });
  if ("pe" in ecRow && pq.pe !== undefined) out.push({ q: "pe", log: true, pq: pq.pe, ec: num("pe") });
  out.push({ q: "I", pq: pq.I, ec: num("Ionic.Str.") });
  const el = {};
  for (const [k, v] of Object.entries(pq.elements)) el[k.replace(/\(\d+\)$/, "")] = v;
  for (const [comp, e] of Object.entries(ELEMENT))
    if (`Sol(${comp})` in ecRow && e in el && el[e] > 1e-20 && !(c.skipTotals || []).includes(e)) out.push({ q: `total ${e}`, pq: el[e], ec: num(`Sol(${comp})`) });
  const solids = new Set(Object.values(PHASE));
  for (const n of ecNames(ecRow)) {
    if (solids.has(n) || /\((cr|s|c)\)$/.test(n)) continue;
    const s = pq.species[phreeqcName(n)];
    if (s && s.m > 1e-20) out.push({ q: `[${n}]`, pq: s.m, ec: num(`C(${n})`) });
  }
  if (c.solids) for (const [p, n] of Object.entries(PHASE))
    if (p in pq.phases && `C(${n})` in ecRow) out.push({ q: `${n} (s)`, pq: pq.phases[p], ec: num(`C(${n})`), solid: true });
  return out;
}
// difference: in log units for pH and pe, else relative (log10 of the ratio)
function diff(p) {
  if (p.log) return Math.abs(p.ec - p.pq);
  if (p.pq === 0 && Math.abs(p.ec) < 1e-12) return 0;
  if (p.pq <= 0 || p.ec <= 0) return Infinity;
  return Math.abs(Math.log10(p.ec / p.pq));
}

async function runCase(engine, c) {
  const dir = `/hf/${c.dir}`, files = { [`${dir}/${c.name}_ECf.dat`]: fs.readFileSync(path.join(D, c.dir, c.name + "_ECf.dat"), "latin1") };
  const sit = path.join(D, c.dir, "SIT-coefficients.dta");
  if (fs.existsSync(sit)) files[`${dir}/SIT-coefficients.dta`] = fs.readFileSync(sit, "latin1");
  const r = await engine.run("ec", [`${dir}/${c.name}_ECf.dat`, ...c.opts.split(" ")], { files, outputs: [`${dir}/${c.name}_ECf.csv`] });
  return { ok: r.ok, csv: r.files[`${dir}/${c.name}_ECf.csv`] || "", log: r.log || r.error };
}

/** results: [{case, point, pairs: [{q, pq, ec, d}], fortran: [problems]}] */
async function compare(engine) {
  const out = [];
  for (const c of CASES) {
    const r = await runCase(engine, c);
    const rows = r.ok ? table(r.csv) : [];
    const pq = parsePqo(fs.readFileSync(path.join(D, c.dir, c.pqo), "latin1"));
    const fortran = table(fs.readFileSync(path.join(D, c.dir, c.name + "_ECf.csv"), "latin1"));
    c.tests.forEach((t, i) => {
      const row = rows[i], p = pq.find(s => s.test === t);
      if (!row || !p) { out.push({ case: c.name, point: i + 1, error: !row ? "no EC result: " + (r.log || "").slice(0, 200) : `no PHREEQC test ${t}` }); return; }
      const ps = pairs(row, p, c).map(x => Object.assign(x, { d: diff(x) }));
      // the Fortran EC: same quantities, 1 part in 1000 (its SIT case was run with -tol=1e-6)
      const f = fortran[i], fp = [];
      for (const [k, v] of Object.entries(row)) {
        if (k === "El.Balance" || !(k in f)) continue;
        const a = Number(v), b = Number(f[k]);
        if (isNaN(a) || isNaN(b)) continue;
        const log = /^(pH|pe|Eh|lg|log|phi)/.test(k) || k.startsWith("lgA") || k.startsWith("lgF");
        const bad = log ? Math.abs(a - b) > 2e-3 : Math.abs(a - b) > Math.max(2e-3 * Math.max(Math.abs(a), Math.abs(b)), 1e-15);
        if (bad) fp.push(`${k}: ${v} vs ${f[k]}`);
      }
      out.push({ case: c.name, point: i + 1, pairs: ps, fortran: fp, tol: c.tol, bad: ps.filter(x => !(x.d <= c.tol)) });
    });
  }
  return out;
}

module.exports = { compare, CASES };

if (require.main === module) {
  (async () => {
    const engine = require(path.join(D, "..", "node-engine.js"))();
    for (const r of await compare(engine)) {
      if (r.error) { console.log(r.case, r.point, r.error); continue; }
      const worst = r.pairs.slice().sort((a, b) => b.d - a.d);
      console.log(`${r.bad.length ? "FAIL" : "ok  "} ${r.case} point ${r.point} (${r.pairs.length} quantities, tolerance ${r.tol}): Fortran EC ${r.fortran.length ? r.fortran.join("; ") : "same"}; PHREEQC worst:`,
        worst.slice(0, 4).map(p => `${p.q} ${p.ec} vs ${p.pq} (${p.d.toFixed(4)})`).join(", "));
    }
    process.exit(0);
  })();
}
