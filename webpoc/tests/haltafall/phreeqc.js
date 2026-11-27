// Reads a PHREEQC output file (.pqo) into one result per test: the last
// solution printed in the simulation whose TITLE says "Test N" (after the
// batch reaction, if there is one).
//   { test: N, pH, pe, I, elements: {C: molality, ...},
//     species: {name: {m: molality, logGamma}}, phases: {name: final moles} }
// PHREEQC prints four significant digits (three decimals for pH and logs).
"use strict";

function parsePqo(text) {
  const lines = text.replace(/\r/g, "").split("\n");
  const sims = [];
  let sim = null, section = "";
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^Reading input data for simulation \d+/.test(line)) { sim = { test: null, sol: null }; sims.push(sim); section = ""; continue; }
    if (!sim) continue;
    const t = line.match(/^\s*(?:TITLE\s+)?\s*Test (\d+)[.:]/);
    if (t && sim.test === null) sim.test = +t[1];
    const h = line.match(/^-+([A-Za-z ]+?)-+$/);
    if (h) {
      section = h[1].trim();
      if (section === "Phase assemblage") sim.phases = {};
      if (section === "Solution composition") sim.sol = { elements: {}, species: {} };
      if (section === "Description of solution" && !sim.sol) sim.sol = { elements: {}, species: {} };
      continue;
    }
    if (/^(Beginning of|End of simulation|Reaction step|Using )/.test(line.trim())) { section = ""; continue; }
    let m;
    if (section === "Phase assemblage" && (m = line.match(/^(\S+)\s+-?[\d.]+\s+-?[\d.]+\s+-?[\d.]+\s+([-\d.e+]+)\s+([-\d.e+]+)\s+([-\d.e+]+)\s*$/)))
      sim.phases[m[1]] = +m[3];
    else if (section === "Solution composition" && (m = line.match(/^\t?\s*([A-Z][a-z]?(?:\(\d\))?)\s+([-\d.e+]+)\s+([-\d.e+]+)\s*$/)))
      sim.sol.elements[m[1]] = +m[2];
    else if (section === "Description of solution") {
      if ((m = line.match(/^\s*pH\s+=\s+([-\d.]+)/))) sim.sol.pH = +m[1];
      else if ((m = line.match(/^\s*pe\s+=\s+([-\d.]+)/))) sim.sol.pe = +m[1];
      else if ((m = line.match(/Ionic strength \(mol\/kgw\)\s+=\s+([-\d.e+]+)/))) sim.sol.I = +m[1];
    } else if (section === "Distribution of species" && (m = line.match(/^ {3}(\S+)\s+([-\d.e+]+)\s+([-\d.e+]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)/))) {
      if (!(m[1] in sim.sol.species)) sim.sol.species[m[1]] = { m: +m[2], logGamma: +m[6] };
    }
  }
  return sims.filter(s => s.test !== null && s.sol && s.sol.pH !== undefined)
    .map(s => Object.assign({ test: s.test, phases: s.phases || {} }, s.sol));
}

// an EC name in PHREEQC's notation: "CO3 2-" -> "CO3-2", "Ca 2+" -> "Ca+2"
const phreeqcName = n => n.trim().replace(/^(.*\S) (\d+)([+-])$/, "$1$3$2");

module.exports = { parsePqo, phreeqcName };
