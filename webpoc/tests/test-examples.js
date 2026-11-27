// End-to-end test of the diagram setup with the example files of the desktop
// programs, bundled with the web app (default web/data/examples).
// For each example the desktop SED or Predom (../jars, built from eq-diagr master)
// makes the reference plot. Then, in the browser engine:
//   rewritten:    the diagram settings are read (datRead) and written back (datSet)
//                 as the diagram page does, and the diagram is made;
//   from scratch: the diagram section is removed, Spana's defaults are set
//                 (datDefaults), the example's settings are entered (datSet), and
//                 the diagram is made.
// Both must give the reference plot file.
// Usage: node tests/test-examples.js [examples folder]
const fs = require("fs"), path = require("path"), os = require("os"), { execFileSync } = require("child_process");
const EX = process.argv[2] || path.join(__dirname, "..", "web", "data", "examples");
const JARS = path.join(__dirname, "..", "..", "jars");
const engine = require("./node-engine.js")();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "eqd-examples-"));

// the assignments the diagram page (spana.js, applyForm) writes for a model
function assignments(m) {
  const d = m.diagram, t = d.plotType, a = [
    `diagram.plotType=${t}`, `diagram.compX=${d.compX}`, `diagram.compY=${d.compY}`,
    `diagram.compMain=${d.compMain}`, `diagram.Eh=${d.Eh}`, `diagram.title=${d.title || ""}`];
  if (d.yLow !== null) a.push(`diagram.yLow=${d.yLow}`);
  if (d.yHigh !== null) a.push(`diagram.yHigh=${d.yHigh}`);
  m.concs.forEach((k, i) => {
    a.push(`concs[${i}].hur=${k.hur}`, `concs[${i}].cLow=${k.cLow}`);
    if (k.cHigh !== null) a.push(`concs[${i}].cHigh=${k.cHigh}`);
  });
  return a;
}

async function plot(dat, program, base) {
  const r = await engine.run(program, [`-d=/ex/${base}.dat`], { files: { [`/ex/${base}.dat`]: dat }, outputs: [`/ex/${base}.plt`] });
  return r.files[`/ex/${base}.plt`];
}

(async () => {
  const files = fs.readdirSync(EX).filter(f => f.endsWith(".dat")).sort();
  let pass = 0, n = 0;
  for (const f of files) {
    const text = fs.readFileSync(path.join(EX, f), "utf8"), base = "e" + (n++);
    const m = await engine.datRead({ text });
    if (!m.ok) { console.log(`FAIL ${f}: not read (${m.error})`); continue; }
    const program = m.model.diagram.plotType === 0 ? "predom" : "sed";
    // reference: the desktop program on the original file
    const nat = path.join(tmp, base + ".dat");
    fs.writeFileSync(nat, text);
    try { execFileSync("java", ["-jar", path.join(JARS, program === "sed" ? "SED.jar" : "Predom.jar"), `-d=${nat}`, "-nostop"], { stdio: "ignore" }); } catch (e) {}
    const ref = fs.existsSync(nat.replace(/\.dat$/, ".plt")) ? fs.readFileSync(nat.replace(/\.dat$/, ".plt"), "utf8") : null;
    // rewritten
    const w = await engine.datSet(text, assignments(m.model));
    const p1 = w.ok ? await plot(w.dat, program, base) : null;
    // from scratch
    const stripped = await engine.datSet(text, ["diagram.plotType=-1", "concs[0].hur=0"]);
    const plain = stripped.ok && !/^(T|TV|LTV|LA|LAV),/m.test(stripped.dat);
    const d = plain ? await engine.datDefaults(stripped.dat) : { ok: false };
    const s = d.ok ? await engine.datSet(d.dat, assignments(m.model)) : { ok: false };
    const p2 = s.ok ? await plot(s.dat, program, base) : null;
    const ok = ref !== null && p1 === ref && p2 === ref;
    if (ok) pass++;
    console.log(`${ok ? "ok  " : "FAIL"} ${f} (${program}, plotType ${m.model.diagram.plotType})` +
      (ok ? "" : `: reference ${ref ? "made" : "missing"}, rewritten ${p1 === ref}, from scratch ${p2 === ref}${plain ? "" : " (diagram section not removed)"}`));
  }
  console.log(`${pass} of ${files.length} examples give the desktop plot`);
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(pass === files.length ? 0 : 1);
})();
