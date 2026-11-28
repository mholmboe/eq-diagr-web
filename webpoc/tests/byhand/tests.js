// Manual input of a chemical system (web/byhand.js): the rules for names and
// numbers, the options, every message, the element file, and the chemistry of
// the data files, checked by running SED on them: at pH = pKa the acid and its
// base are equal, at Eh = E° the two forms of a redox couple, and a solid
// gives the concentration of its solubility product.
//   await require("./byhand/tests.js")(engine, record)   (from test-engine.js)
const path = require("path");
const hand = require(path.join(__dirname, "..", "..", "web", "byhand.js"));

// the table of a SED run: [{ x, "H+": ..., "HPO4 2-": ... }], log concentrations
async function table(engine, r, diagram) {
  const run = await engine.run("sed", ["-d=/hand/t.dat", "-n=2", "-tbl", "-tble:csv"],
                               { files: { "/hand/t.dat": r.dat + diagram.join("\n") + "\n" }, outputs: ["/hand/t.csv"] });
  const lines = ((run.files || {})["/hand/t.csv"] || "").split(/\r?\n/);
  const at = lines.findIndex(l => /^"Output data/.test(l));
  if (at < 0) return [];
  const head = lines.slice(at).find(l => /^"[^"]*";"/.test(l)).split(";").map(x => x.replace(/"/g, "")).filter(Boolean);
  return lines.slice(at).filter(l => /^\s*-?\d/.test(l)).map(l => {
    const v = l.split(";").map(x => parseFloat(x)), row = { x: v[0] };
    head.slice(1).forEach((n, i) => { row[n] = v[i + 1]; });
    return row;
  });
}
const near = (a, b, tol = 0.0006) => Math.abs(a - b) <= tol;
const rowAt = (rows, x) => rows.find(r => near(r.x, x, 1e-6)) || {};

module.exports = async function (engine, record) {
  const G = "ByHand";
  const k = (r, n) => { const x = (r.species || []).find(y => y.name === n); return x ? x.logK : NaN; };

  // ---- names made by the program
  const acids = [["PO4 3-", 1, "HPO4 2-"], ["PO4 3-", 2, "H2PO4-"], ["PO4 3-", 3, "H3PO4"], ["HS-", 1, "H2S"], ["CH3COO-", 1, "CH3COOH"],
    ["NH3", 1, "NH4+"], ["EDTA 4-", 2, "H2EDTA 2-"], ["C2O4 2-", 1, "HC2O4-"], ["CO3 2-", 2, "H2CO3"], ["HCO3-", 1, "H2CO3"], ["F-", 1, "HF"], ["SO4 2-", 1, "HSO4-"]];
  const complexes = [["Cu 2+", "NH3", 1, "CuNH3 2+"], ["Cu 2+", "NH3", 4, "Cu(NH3)4 2+"], ["Cu 2+", "Cl-", 1, "CuCl+"], ["Cu 2+", "Cl-", 2, "CuCl2"],
    ["UO2 2+", "CO3 2-", 3, "UO2(CO3)3 4-"], ["Fe 3+", "OH-", 2, "Fe(OH)2+"], ["Ag+", "CN-", 2, "Ag(CN)2-"], ["Al 3+", "F-", 6, "AlF6 3-"]];
  const badA = acids.filter(([b, n, want]) => hand.protonated(b, n) !== want).map(([b, n]) => `${b}+${n}H: ${hand.protonated(b, n)}`);
  const badC = complexes.filter(([m, l, n, want]) => hand.complexName(m, l, n) !== want).map(([m, l, n]) => `${m}/${l}/${n}: ${hand.complexName(m, l, n)}`);
  record(G, "the names of the acids and of the complexes", !badA.length && !badC.length, badA.concat(badC).join("; "));

  // ---- names are read as eq-diagr reads them: the charge at the end in four ways, (aq) ignored, no case
  const same = [["Fe 3+", "Fe+3"], ["Fe 3+", "Fe+++"], ["Fe 3+", "fe 3+"], ["Na+", "Na +"], ["CO2", "CO2(aq)"], ["SO4 2-", "SO4-2"], ["SO4 2-", "SO4 2−"], ["SO4 2-", "SO4--"]];
  const z = [["PO4 3-", -3], ["Cu 2+", 2], ["NH4+", 1], ["H2O", 0], ["e-", -1], ["CaCO3(s)", 0], ["CO2(g)", 0], ["Fe(OH)2+", 1], ["Hg2 2+", 2]];
  const badS = same.filter(([a, b]) => hand.key(a) !== hand.key(b)).map(x => x.join(" = "));
  const badZ = z.filter(([n, want]) => hand.parseName(n).z !== want).map(([n]) => `${n}: ${hand.parseName(n).z}`);
  const solids = ["CaCO3(s)", "Fe(OH)3(am)", "SiO2(cr)", "C(c)", "Hg(l)"].every(hand.isSolid) && !["CO2(g)", "Fe(OH)2+", "CO2(aq)", "Cu 2+"].some(hand.isSolid);
  record(G, "names and charges as eq-diagr reads them", !badS.length && !badZ.length && solids && hand.key("Fe 3+") !== hand.key("Fe 2+"), badS.concat(badZ).join("; "));

  // ---- numbers: spaces, commas, semicolons, a decimal comma, an exponent; what is no number
  const nums = [["2.15 7.20 12.35", [2.15, 7.2, 12.35]], ["2.15, 7.20,12.35", [2.15, 7.2, 12.35]], ["2,15; 7,20; 12,35", [2.15, 7.2, 12.35]], ["2,15 7,20", [2.15, 7.2]],
    ["-8.48", [-8.48]], [" +4 ", [4]], [".5 1e-2 2E3", [0.5, 0.01, 2000]], ["", []], ["−19.66", [-19.66]]];
  const badN = nums.filter(([t, want]) => JSON.stringify(hand.numbers(t)) !== JSON.stringify(want)).map(([t]) => `"${t}": ${hand.numbers(t)}`);
  const notN = ["x", "4.0.4", "1e", "--2", "2.15 abc"].filter(t => !hand.numbers(t).some(Number.isNaN));
  record(G, "numbers with spaces, commas, semicolons and a decimal comma", !badN.length && !notN.length, badN.concat(notN).join("; "));

  // ---- the options: without water, another pKw, another temperature, names of one's own
  const noWater = hand.build({ water: false, blocks: [{ type: "complex", metal: "Cu 2+", ligand: "NH3", kind: "step", values: "4.04 3.43" }] });
  const noWaterAcid = hand.build({ water: false, blocks: [{ type: "acid", base: "CH3COO-", values: "4.76" }] });
  const noWaterOH = hand.build({ water: false, blocks: [{ type: "complex", metal: "Cu 2+", ligand: "OH-", kind: "cum", values: "6.3" }] });
  const w13 = hand.build({ pKw: "13,0", blocks: [{ type: "acid", base: "NH3", kind: "pKb", values: "4.75" },
    { type: "reaction", product: "Cu(OH)2(s)", reactants: [[1, "Cu 2+"], [2, "OH-"]], kind: "ksp", logK: "-19.66" }] });
  const t37 = hand.build({ t: "37", blocks: [{ type: "reaction", product: "Fe 2+", reactants: [[1, "Fe 3+"], [1, "e-"]], kind: "E0", logK: 0.771 }] });
  const e37 = 0.771 * 96485.33212 / (8.314462618 * 310.15 * Math.log(10));   // log K = n E° F/(RT ln 10)
  const own = hand.build({ water: false, blocks: [{ type: "complex", metal: "Cu 2+", ligand: "NH3", kind: "step", values: "4.04 3.43", names: ["Cu(NH3) 2+"] }] });
  record(G, "without water, with another pKw and temperature, with names of one's own",
         noWater.ok && noWater.components.join("|") === "Cu 2+|NH3" && noWater.species.map(x => x.name).join("|") === "CuNH3 2+|Cu(NH3)2 2+" &&
         noWaterAcid.ok && noWaterAcid.components.join("|") === "H+|CH3COO-" && noWaterAcid.species.length === 1 &&
         noWaterOH.ok && noWaterOH.components.join("|") === "H+|Cu 2+" && noWaterOH.species.length === 1 && k(noWaterOH, "CuOH+") === -7.7 &&
         w13.ok && k(w13, "OH-") === -13 && k(w13, "NH4+") === 8.25 && k(w13, "Cu(OH)2(s)") === -6.34 &&
         t37.ok && /t= 37$/.test(t37.dat.split("\n")[0]) && near(k(t37, "Fe 2+"), e37, 0.00006) && near(e37, 0.771 / 0.06154, 0.0002)   /* RT ln 10/F = 0.06154 V at 37 °C */ && near(hand.nernst(25), 0.059159, 1e-6) &&
         own.ok && own.species[0].name === "Cu(NH3) 2+" && own.species[0].auto === "CuNH3 2+" && /Cu\(NH3\) 2\+ \+ NH3 ⇌ Cu\(NH3\)2 2\+/.test(own.species[1].step),
         JSON.stringify([noWater.components, noWaterAcid.components, noWaterOH.components, w13.species && w13.species.map(x => x.name + " " + x.logK), k(t37, "Fe 2+"), e37, own.species && own.species.map(x => x.step)]));

  // ---- a species formed in one entry as a reactant in another: two steps, a coefficient, water
  const chain = hand.build({ water: false, blocks: [
    { type: "reaction", product: "E", reactants: [[1, "A"], [1, "B"], [3, "H2O"]], logK: 0.5 },   // entered before what it is formed from
    { type: "reaction", product: "A", reactants: [[2, "B"]], logK: 1 },
    { type: "reaction", product: "B", reactants: [[1, "C"], [1, "D"]], logK: 2 } ] });
  // E = A + B = 3 B = 3 C + 3 D: log K = 0.5 + (1 + 2·2) + 2
  const sp = n => { const x = (chain.species || []).find(y => y.name === n); return x ? `${x.logK} ${x.coef.join(",")}` : ""; };
  const chained = hand.build({ blocks: [
    { type: "reaction", product: "Fe 2+", reactants: [[1, "Fe 3+"], [1, "e-"]], logK: 13.02 },
    { type: "complex", metal: "Fe 2+", ligand: "OH-", kind: "step", values: "4.5 2.9" },
    { type: "reaction", product: "Fe(OH)2(s)", reactants: [[1, "Fe 2+"], [2, "OH-"]], kind: "ksp", logK: -15.1 },
    { type: "reaction", product: "Fe3(OH)8(s)", reactants: [[1, "Fe 2+"], [2, "Fe 3+"], [8, "OH-"]], logK: 100 } ] });
  // the same system written from the components, with the constants added up by hand
  const direct = hand.build({ blocks: [
    { type: "reaction", product: "Fe 2+", reactants: [[1, "Fe 3+"], [1, "e-"]], logK: 13.02 },
    { type: "reaction", product: "FeOH+", reactants: [[1, "Fe 3+"], [1, "e-"], [1, "OH-"]], logK: 17.52 },
    { type: "reaction", product: "Fe(OH)2", reactants: [[1, "Fe 3+"], [1, "e-"], [2, "OH-"]], logK: 20.42 },
    { type: "reaction", product: "Fe(OH)2(s)", reactants: [[1, "Fe 3+"], [1, "e-"], [2, "OH-"]], logK: 28.12 },
    { type: "reaction", product: "Fe3(OH)8(s)", reactants: [[3, "Fe 3+"], [1, "e-"], [8, "OH-"]], logK: 113.02 } ] });
  record(G, "a product as a reactant over two steps, with a coefficient; the same data file as written from the components",
         chain.ok && chain.components.join("|") === "C|D" && sp("B") === "2 1,1" && sp("A") === "5 2,2" && sp("E") === "7.5 3,3" &&
         /^3 C \+ 3 D \+ 3 H2O ⇌ E$/.test(chain.species.find(x => x.name === "E").text) &&
         chained.ok && direct.ok && chained.dat === direct.dat && k(chained, "Fe3(OH)8(s)") === 1.02,
         JSON.stringify([chain.errors, chain.species && chain.species.map(x => x.name + " " + x.logK + " " + x.coef), chained.dat, direct.dat]));

  // ---- every message of an entry that cannot be used
  const R = (product, reactants, logK, kind) => ({ type: "reaction", product, reactants, logK, kind });
  const wrong = [
    [{ blocks: [{ type: "acid", base: "", values: "4.76" }] }, /The base has no name/],
    [{ blocks: [{ type: "acid", base: "CH3COO-", values: "" }] }, /Give the pKa values of CH3COO-/],
    [{ blocks: [{ type: "acid", base: "NH3", kind: "pKb", values: "4,75 x" }] }, /The pKb values of NH3 are not all numbers/],
    [{ blocks: [{ type: "complex", metal: "", ligand: "NH3", values: "4" }] }, /The metal ion has no name/],
    [{ blocks: [{ type: "complex", metal: "Cu 2+", ligand: "", values: "4" }] }, /The ligand has no name/],
    [{ blocks: [{ type: "complex", metal: "Cu 2+", ligand: "Cu+2", values: "4" }] }, /The metal ion and the ligand are both "Cu 2\+"/],
    [{ blocks: [{ type: "complex", metal: "Cu 2+", ligand: "NH3", values: " " }] }, /Give the constants of Cu 2\+ with NH3/],
    [{ blocks: [{ type: "complex", metal: "Cu 2+", ligand: "NH3", values: "4.04 3,43 2.8O" }] }, /The constants of Cu 2\+ with NH3 are not all numbers/],
    [{ blocks: [R("", [[1, "Ca 2+"]], 1)] }, /The product has no name/],
    [{ blocks: [R("CaCO3(s)", [[1, "Ca 2+"], [2, ""]], 8.48)] }, /CaCO3\(s\): a reactant has a coefficient and no name/],
    [{ blocks: [R("CaCO3(s)", [["two", "Ca 2+"]], 8.48)] }, /the coefficient of Ca 2\+ is not a number/],
    [{ blocks: [R("CaCO3(s)", [["", ""], ["", ""]], 8.48)] }, /CaCO3\(s\): give the reactants it is formed from/],
    [{ blocks: [R("CaCO3(s)", [[1, "Ca 2+"], [1, "CO3 2-"]], "8.48 1", "ksp")] }, /give log Ksp as a number/],
    [{ blocks: [R("Fe 2+", [[1, "Fe 3+"], [1, "e-"]], "", "E0")] }, /give E° \(in volts\) as a number/],
    [{ blocks: [R("*CaCO3(s)", [[1, "Ca 2+"]], 8.48)] }, /a name cannot begin with "\*"/],
    [{ blocks: [R("CaCO3(s)", [[1, "Ca 2+ /aq"]], 8.48)] }, /a name cannot contain a space followed by a slash/],
    [{ blocks: [R("H2O", [[1, "H+"], [1, "OH-"]], 14)] }, /H2O cannot be a product/],
    [{ blocks: [R("X", [[1, "H2O"]], 1)] }, /X: nothing is left of the reactants/],
    [{ blocks: [R("e-", [[1, "Fe 2+"], [-1, "Fe 3+"]], -13), R("Cu+", [[1, "Cu 2+"], [1, "e-"]], 2.7)] }, /e- is a component here and cannot be a product/],
    [{ pKw: "fourteen", blocks: [{ type: "acid", base: "NH3", values: "9.25" }] }, /pKw is not a number/],
    [{ t: "warm", blocks: [{ type: "acid", base: "NH3", values: "9.25" }] }, /The temperature is not a number/],
    [{ blocks: [{ type: "sorption", site: ">SOH" }] }, /Unknown kind of entry/],
    // a ring of three
    [{ blocks: [R("A", [[1, "B"]], 1), R("B", [[1, "C"]], 1), R("C", [[1, "A"]], 1)] }, /are each formed from the other/]
  ].map(([s, re], i) => { const x = hand.build(s); return !x.ok && !x.dat && x.errors.some(e => re.test(e.text)) ? null : `${i}: ${JSON.stringify(x.errors.map(e => e.text))}`; }).filter(Boolean);
  // the entry at fault is named by its number, and the entries that are right still give their species
  const mixed = hand.build({ blocks: [{ type: "acid", base: "NH3", values: "9.25" }, { type: "acid", base: "PO4 3-", values: "x" }, { type: "acid", base: "F-", values: "3.17" }] });
  record(G, "every message of an entry that cannot be used; the entry at fault is named", !wrong.length &&
         !mixed.ok && mixed.errors.length === 1 && mixed.errors[0].block === 1 && mixed.species.map(x => x.name).join("|") === "NH4+|HF|OH-" && mixed.species[1].block === 2,
         wrong.join(" | ") + JSON.stringify(mixed.errors));

  // ---- the warning on charges: for the reaction as entered, once, and not for the species that follow from it
  const unb = hand.build({ blocks: [R("Fe 2+", [[1, "Fe 3+"]], 13.02), R("Fe(OH)2(s)", [[1, "Fe 2+"], [2, "OH-"]], -15.1, "ksp"),
    R("O2(g)", [[-4, "H+"], [-4, "e-"]], -83.1), R("CuOH+", [[1, "Cu 2+"], [1, "OH-"]], 6.3)] });
  record(G, "charges that do not add up: one warning, for the entry as it was written",
         unb.ok && unb.warnings.length === 1 && unb.warnings[0].block === 0 && /^Fe 3\+ ⇌ Fe 2\+: the charges do not add up \(\+3 on the left, \+2 on the right\)/.test(unb.warnings[0].text) &&
         unb.species.find(x => x.name === "O2(g)").text === "… ⇌ O2(g) + 4 H+ + 4 e-",
         JSON.stringify(unb.warnings) + JSON.stringify(unb.errors));

  // ---- the text database: the element of each component, the electron first, a semicolon in the reference
  const forDb = hand.build({ blocks: [
    { type: "complex", metal: "UO2 2+", ligand: "CO3 2-", kind: "cum", values: "9.94" },
    { type: "complex", metal: "Ca 2+", ligand: "EDTA 4-", kind: "cum", values: "10.65" },
    { type: "acid", base: "Acetate-", values: "4.76" }, { type: "acid", base: "NH3", values: "9.25" },
    R("U 4+", [[1, "UO2 2+"], [4, "H+"], [2, "e-"]], 9.04) ] });
  const fdb = forDb.ok ? hand.database(forDb, "Table 3; my book") : { txt: "", elt: "" };
  const rows = fdb.txt.trim().split("\n");
  record(G, "the text database and its element file",
         forDb.ok && fdb.elt === "e-, 1 ,e-,electron (= redox potential),\nH, 1 ,H+,,\nC, 3 ,CO3 2-,,EDTA 4-,,Acetate-,,\nN, 1 ,NH3,,\nCa, 1 ,Ca 2+,,\nU, 1 ,UO2 2+,,\n" &&
         rows.length === 7 && rows[0].startsWith("COMPLEX;LogK;") && rows.includes("U 4+;9.04;;;3;H+;4;e-;2;UO2 2+;1;Table 3, my book") && rows.includes("OH-;-14;;;1;H+;-1;Table 3, my book") &&
         hand.database(forDb).txt.includes(";manual input"),
         fdb.elt + fdb.txt);

  // ---- the chemistry, through the engine: SED on the data files (log concentrations at the middle of the range)
  // pKa and pKb: the acid and its base are equal at pH = pKa
  const acid = hand.build({ blocks: [{ type: "acid", base: "PO4 3-", values: "7.20 2.15 12.35" }, { type: "acid", base: "NH3", kind: "pKb", values: "4.75" }] });
  const eq = async (pH, a, b) => { const row = rowAt(await table(engine, acid, ["LC,-9, 1, H+,", `LAV, ${-pH - 1} ${-pH + 1}`, "T, 0.01", "T, 0.01"]), pH); return near(row[a], row[b]) && row[a] > -3 ? null : `pH ${pH}: ${a} ${row[a]}, ${b} ${row[b]}`; };
  const pk = [await eq(2.15, "H3PO4", "H2PO4-"), await eq(7.2, "H2PO4-", "HPO4 2-"), await eq(12.35, "HPO4 2-", "PO4 3-"), await eq(9.25, "NH4+", "NH3")].filter(Boolean);
  record(G, "SED: at pH = pKa the acid and its base have the same concentration (pKa and pKb values)", acid.ok && !pk.length, pk.join("; "));

  // stepwise constants: ML(n-1) and MLn are equal at log [L] = -log Kn
  const cu = hand.build({ water: false, blocks: [{ type: "complex", metal: "Cu 2+", ligand: "NH3", kind: "step", values: "4.04 3.43 2.80 1.48" }] });
  const steps = [];
  for (const [n, logKn, a, b] of [[1, 4.04, "Cu 2+", "CuNH3 2+"], [2, 3.43, "CuNH3 2+", "Cu(NH3)2 2+"], [3, 2.80, "Cu(NH3)2 2+", "Cu(NH3)3 2+"], [4, 1.48, "Cu(NH3)3 2+", "Cu(NH3)4 2+"]]) {
    const row = (await table(engine, cu, ["LC,-9, 1, NH3,", "T, 1.0E-5", `LAV, ${-logKn - 1} ${-logKn + 1}`]))[2] || {};
    if (!near(row[a], row[b]) || !near(row.NH3, -logKn)) steps.push(`K${n}: log[NH3] ${row.NH3}, ${a} ${row[a]}, ${b} ${row[b]}`);
  }
  // the same complexes from cumulative constants give the same file
  const cuCum = hand.build({ water: false, blocks: [{ type: "complex", metal: "Cu 2+", ligand: "NH3", kind: "cum", values: "4.04 7.47 10.27 11.75" }] });
  record(G, "SED: stepwise constants, the complexes n-1 and n are equal at log [L] = -log Kn; cumulative constants give the same file",
         cu.ok && !steps.length && cuCum.ok && cuCum.dat === cu.dat, steps.join("; "));

  // a solubility product written with OH-: [Cu 2+][OH-]^2 = Ksp where the solid is there
  const ksp = hand.build({ blocks: [R("Cu(OH)2(s)", [[1, "Cu 2+"], [2, "OH-"]], -19.66, "ksp")] });
  const k7 = rowAt(await table(engine, ksp, ["LC,-9, 1, H+,", "LAV, -8 -6", "T, 0.001"]), 7), k6 = rowAt(await table(engine, ksp, ["LC,-9, 1, H+,", "LAV, -7 -5", "T, 0.001"]), 6);
  // pH 7: log [Cu 2+] = -19.66 + 2·7 = -5.66; pH 6: -3.66
  record(G, "SED: a solid entered with log Ksp gives the concentration of its solubility product",
         ksp.ok && near(k7["Cu 2+"], -5.66) && near(k7["Cu 2+"] + 2 * k7["OH-"], -19.66) && near(k6["Cu 2+"], -3.66), JSON.stringify([k7, k6]));

  // a standard potential: the two forms of the couple are equal at Eh = E°. The table has pe on its axis:
  // Eh = pe · 0.05916 V at 25 °C, with the constant of the textbooks and not the one of byhand.js
  const fe = hand.build({ water: false, blocks: [R("Fe 2+", [[1, "Fe 3+"], [1, "e-"]], 0.771, "E0")] });
  const pe0 = k(fe, "Fe 2+");
  const feRow = (await table(engine, fe, ["LC,-9, 1, EH, e-,", `LAV, ${-pe0 - 1} ${-pe0 + 1}`, "T, 1.0E-5"]))[2] || {};
  record(G, "SED: with E° the oxidised and the reduced form are equal at Eh = E°",
         fe.ok && near(feRow.x * 0.05916, 0.771, 0.0002) && near(feRow["Fe 2+"], feRow["Fe 3+"]) && near(feRow["Fe 2+"], Math.log10(0.5e-5)), JSON.stringify(feRow));

  // more than one electron, the Nernst equation with the textbook constant 0.05916 V:
  // Cu 2+ + 2 e- ⇌ Cu(s), E° = 0.340 V: where the metal is there, Eh = E° + (0.05916/2) log [Cu 2+], so log [Cu 2+] = -4 at 0.22168 V
  const cuS = hand.build({ water: false, blocks: [R("Cu(s)", [[1, "Cu 2+"], [2, "e-"]], 0.340, "E0")] });
  const peCu = 0.22168 / 0.05916;
  const cuRow = (await table(engine, cuS, ["LC,-9, 1, EH, e-,", `LAV, ${-peCu - 1} ${-peCu + 1}`, "T, 0.001"]))[2] || {};
  // MnO4- + 8 H+ + 5 e- ⇌ Mn 2+ + 4 H2O, E° = 1.51 V: at pH 1 the two are equal at Eh = 1.51 - (8/5)·0.05916 = 1.41534 V
  const mn = hand.build({ blocks: [R("Mn 2+", [[1, "MnO4-"], [8, "H+"], [5, "e-"]], 1.51, "E0")] });
  const peMn = 1.41534 / 0.05916;
  const mnRow = (await table(engine, mn, ["LC,-9, 1, EH, e-,", "LA, -1", `LAV, ${-peMn - 1} ${-peMn + 1}`, "T, 1.0E-5"]))[2] || {};
  record(G, "SED: E° with two and with five electrons follows the Nernst equation (Cu 2+/Cu(s), MnO4-/Mn 2+ at pH 1)",
         cuS.ok && near(k(cuS, "Cu(s)"), 2 * 0.340 / 0.05916, 0.001) && near(cuRow["Cu 2+"], -4, 0.001) &&
         mn.ok && near(k(mn, "Mn 2+"), 5 * 1.51 / 0.05916, 0.002) && // (five electrons multiply the rounding of 0.05916 V: 0.002 in the logarithm of the ratio)
         near(mnRow["Mn 2+"], mnRow["MnO4-"], 0.004) && near(mnRow["Mn 2+"], Math.log10(0.5e-5), 0.002),
         JSON.stringify([k(cuS, "Cu(s)"), cuRow, k(mn, "Mn 2+"), mnRow]));

  // a product as a reactant: Fe(OH)2(s) entered from Fe 2+, which is itself formed from Fe 3+ and e-
  const fe2 = hand.build({ blocks: [R("Fe 2+", [[1, "Fe 3+"], [1, "e-"]], 0.771, "E0"), R("Fe(OH)2(s)", [[1, "Fe 2+"], [2, "OH-"]], -15.1, "ksp")] });
  const f10 = rowAt(await table(engine, fe2, ["LC,-9, 1, EH, H+,", "LAV, -11 -9", "LA, 0", "T, 0.001"]), 10);
  // pH 10, pe 0: log [Fe 2+] = -15.1 + 2·4 = -7.1, and log [Fe 3+] = log [Fe 2+] - 13.0326
  record(G, "SED: a solid entered from the reduced ion keeps its solubility product",
         fe2.ok && near(f10["Fe 2+"], -7.1) && near(f10["Fe 2+"] + 2 * f10["OH-"], -15.1) && near(f10["Fe 3+"] - f10["Fe 2+"], -pe0, 0.001), JSON.stringify(f10));
};
