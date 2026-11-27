// End-to-end test of the app window (webpoc/web/app.html) with Playwright, in
// Chromium, WebKit and Firefox: the main flow of a student, from the database
// search to a diagram, with the checks, the database tools, the help and the
// examples. Each browser starts with empty browser storage.
//
// Usage: node webpoc/tests/ui-test.js [--browsers=chromium,webkit,firefox]
//                                     [--screenshots=review] [--headed]
// npm run test:ui, npm run screenshots (Chromium only, screenshots to review/).
// Needs playwright-core (npm install) and, for WebKit and Firefox, Playwright's
// browsers (npm run install-browsers). Chromium is the Chrome installed on this
// computer (channel "chrome"), or Playwright's Chromium if that is installed.
// The test starts webpoc/serve.py on a free port.
"use strict";
const { chromium, webkit, firefox } = require("playwright-core");
const assert = require("assert/strict");
const path = require("path"), fs = require("fs"), net = require("net"), { spawn } = require("child_process");

const arg = (name, def) => { const a = process.argv.find(x => x.startsWith(`--${name}`)); return a ? (a.split("=")[1] ?? true) : def; };
const BROWSERS = String(arg("browsers", "chromium,webkit,firefox")).split(",");
const SHOTS = arg("screenshots", null), HEADED = !!arg("headed", false);
const ROOT = path.join(__dirname, "..", "..");
const wait = ms => new Promise(r => setTimeout(r, ms));

async function freePort() {
  return new Promise(res => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
}
async function startServer() {
  const port = await freePort();
  const proc = spawn("python3", [path.join(ROOT, "webpoc", "serve.py"), String(port)], { stdio: "ignore" });
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(url + "/app.html"); if (r.ok) return { url, proc }; } catch (e) {}
    await wait(100);
  }
  proc.kill(); throw new Error("the dev server did not start");
}
async function launch(name) {
  const opts = { headless: !HEADED };
  if (name === "chromium") {
    try { return await chromium.launch(opts); }                  // Playwright's Chromium, if installed
    catch (e) { return chromium.launch({ ...opts, channel: "chrome" }); }   // else the installed Chrome
  }
  return (name === "webkit" ? webkit : firefox).launch(opts);
}

// ---------------------------------------------------------------- the steps
// Each step is [name, async (t) => {...}]; t has the page and helpers.
const STEPS = [
  ["app starts with the KTH database and H+ selected", async t => {
    await t.page.waitForFunction(() => document.querySelectorAll("#menus > div").length === 5);
    const db = await t.frame("database.html");
    await db.waitForFunction(() => /KTH course database/.test(document.getElementById("dbstatus").textContent), null, { timeout: 15000 });
    assert.deepEqual(await db.$$eval("#chosen button", b => b.map(x => x.textContent.replace("×", "").trim())), ["H+"]);
    assert.equal(await t.page.textContent("#tabs .tab.active .t"), "Chemical system");
    await t.shot("01-chemical-system-start");
  }],
  ["File menu opens, with disabled items while no diagram is open", async t => {
    await t.menu("File");
    const items = await t.page.$$eval(".menu:not([hidden]) button", b => b.map(x => [x.textContent.trim(), x.disabled]));
    assert.ok(items.some(([l, d]) => l.startsWith("Open an example") && !d), "Open an example… is enabled");
    assert.ok(items.some(([l, d]) => l.startsWith("SVG image") && d), "SVG image is disabled");
    await t.shot("02-menu-file-open");
    await t.page.keyboard.press("Escape");
    assert.equal(await t.page.$(".menu:not([hidden])"), null, "Escape closes the menu");
  }],
  ["database search finds the Fe(II) species; Make a diagram becomes the primary button", async t => {
    const db = await t.frame("database.html");
    assert.ok(await db.$eval("#search", b => b.classList.contains("primary")), "Search is primary before a result");
    assert.deepEqual(await db.$$eval("#search, #toDiagram", b => b.map(x => x.textContent)), ["Search reactions", "Create a diagram"]);
    await db.click('#ptable button:text-is("Fe")');
    await db.click('#avail button:text-is("Fe 2+")');
    await db.click("#search");
    await db.waitForFunction(() => /species found/.test(document.getElementById("status").textContent));
    assert.match(await db.textContent("#status"), /^6 species found/);
    assert.equal(await db.$$eval("#found tr", r => r.length - 1), 6);
    assert.ok(await db.$eval("#toDiagram", b => b.classList.contains("primary") && !b.disabled));
    assert.ok(!(await db.$eval("#search", b => b.classList.contains("primary"))));
    await t.shot("03-chemical-system-search-result");
  }],
  ["a species name opens the details of its reaction", async t => {
    const db = await t.frame("database.html");
    await db.click('#found a[data-detail="FeOH+"]');
    await db.waitForFunction(() => document.getElementById("detailDlg").open);
    const rows = await db.$$eval("#dtTable tr", r => r.map(x => x.cells[0].textContent + ": " + x.cells[1].textContent));
    assert.match(rows[0], /^Reaction: Fe 2\+ \+ H2O =\s+H\+ \+ FeOH\+$/);
    assert.match(rows[1], /^log K° \(25 °C\): −10\.2$/);
    assert.ok(rows.some(r => /^ΔH°: /.test(r)) && rows.some(r => /^References: 1996BP-Fe/.test(r)) && rows.some(r => /^Valid up to: 25 °C and 1 bar/.test(r)));
    assert.ok(!rows.some(r => /^log K° \(25 °C, pSat\)/.test(r)), "no second log K at 25 °C");
    await t.shot("19-reaction-details");
    await db.click('#detailDlg button[value="close"]');
    assert.ok(!(await db.$eval("#detailDlg", d => d.open)));
  }],
  ["a temperature above the critical point is refused and the old result removed", async t => {
    const db = await t.frame("database.html");
    await db.fill("#t", "400");
    await db.click("#search");
    await db.waitForFunction(() => /critical point/.test(document.getElementById("status").textContent));
    assert.equal(await db.$$eval("#found tr", r => r.length), 0, "no stale result");
    assert.ok(await db.$eval("#toDiagram", b => b.disabled));
    await t.shot("04-validation-error-temperature");
    await db.fill("#t", "25");
  }],
  ["the search result opens in a diagram tab and the diagram is made", async t => {
    const db = await t.frame("database.html");
    await db.click("#search");
    await db.waitForFunction(() => !document.getElementById("toDiagram").disabled);
    await db.click("#toDiagram");
    await t.page.waitForFunction(() => document.querySelector("#tabs .tab.active .t").textContent.includes("H+_Fe2+"));
    const sp = await t.spana();
    assert.equal(await sp.$eval("#ptype", s => s.value), "3", "a logarithmic diagram by default");
    await sp.click("#make");
    await sp.waitForFunction(() => /equilibrium calculations/.test(document.getElementById("status").textContent), null, { timeout: 20000 });
    assert.match(await sp.textContent("#status"), /^SED: 51 equilibrium calculations/);
    assert.ok(await sp.$$eval("#plot svg path, #plot svg text", p => p.length) > 10, "the plot is drawn");
    await t.page.waitForFunction(() => [...document.querySelectorAll("#sideFiles [data-file]")].some(b => b.dataset.file === "H+_Fe2+.dat"));
    assert.equal(await t.page.$("#tabs .tab.active .dirty"), null, "saved, so not marked as changed");
    await t.shot("05-diagram-result");
  }],
  ["a changed setting dims the plot until the diagram is made again", async t => {
    {
      // the names of the button and of the diagram types; both axes have a row in the table
      const sp = await t.spana();
      assert.equal(await sp.textContent("#make"), "Plot the diagram");
      assert.ok(await sp.evaluate(() => document.getElementById("makebar").getBoundingClientRect().bottom <= document.getElementById("sysPanel").getBoundingClientRect().top), "the button is above the Chemical system section");
      assert.ok(await sp.$$eval("#ptype option", o => o.length > 2 && o.every(x => !/\((SED|Predom)\)/.test(x.textContent))));
      assert.match(await sp.$eval("#concTable tr:nth-child(2) td.name", e => e.textContent), /H\+\s*X-axis/);
      assert.deepEqual(await sp.$eval("#concTable tr.yrow", r => [r.cells[0].textContent, r.cells[1].textContent, r.querySelector("#yLow").value, r.querySelector("#yHigh").value]),
                       ["Y-axis", "log concentration", "-9", "1"]);
    }
    const sp = await t.spana();
    await sp.fill("#yLow", "-8"); await sp.dispatchEvent("#yLow", "change");
    await sp.waitForFunction(() => !document.getElementById("staleBadge").hidden);
    await t.page.waitForSelector("#tabs .tab.active .dirty");
    await sp.click("#staleBadge");
    await sp.waitForFunction(() => document.getElementById("staleBadge").hidden && !document.getElementById("plot").classList.contains("stale"));
    await t.page.waitForFunction(() => !document.querySelector("#tabs .tab.active .dirty"));
  }],
  ["an axis component with a fixed value is an error that disables Make", async t => {
    const sp = await t.spana();
    await sp.selectOption('[data-hur="0"]', "4");
    assert.equal(await sp.$eval('[data-low="0"]', i => i.value), "6.5", "the same quantity keeps its value: the middle of pH 1-12");
    assert.match(await sp.textContent("#concWarn"), /must be varied/);
    assert.ok(await sp.$eval("#make", b => b.disabled));
    await t.shot("06-validation-error-concentrations");
    await sp.selectOption('[data-hur="0"]', "5");
    assert.deepEqual(await sp.$$eval('[data-low="0"], [data-high="0"]', i => i.map(x => x.value)), ["1", "12"]);
    assert.ok(!(await sp.$eval("#make", b => b.disabled)));
  }],
  ["advanced mode shows the advanced options and exports", async t => {
    let sp = await t.spana();
    await sp.click("#make");
    await sp.waitForFunction(() => document.getElementById("staleBadge").hidden && !document.getElementById("make").disabled);
    await t.page.waitForFunction(() => !document.querySelector("#tabs .tab.active .dirty"));   // made, so saved
    await t.page.click("#modeAdv");
    sp = await t.spana();
    await sp.waitForFunction(() => getComputedStyle(document.getElementById("dlEps")).display !== "none");
    assert.ok(await sp.$eval("#nsteps", e => e.offsetParent !== null || getComputedStyle(e.closest(".adv-only")).display !== "none"));
    assert.ok(await sp.$eval("#staleBadge", b => b.hidden), "switching to advanced mode does not make the plot stale");
    await sp.evaluate(() => document.querySelectorAll("details").forEach(d => { d.open = true; }));
    await t.shot("07-diagram-advanced-mode");
  }],
  ["the database tools make the statistics of the KTH database", async t => {
    await t.menu("Database", "Statistics and checks");
    await t.page.waitForFunction(() => document.querySelector("#tabs .tab.active .t").textContent === "Database tools");
    const m = await t.frame("maintenance.html");
    await m.waitForFunction(() => /KD1280/.test(document.getElementById("dbList").textContent), null, { timeout: 15000 });
    await m.click("#statsRun");
    await m.waitForFunction(() => /Total nbr reactions/.test(document.querySelector("#tStats pre").textContent), null, { timeout: 20000 });
    await t.shot("08-database-tools");
  }],
  ["a session file holds the database files; a file of the user is added to the databases in use", async t => {
    const fs = require("fs");
    const m = await t.frame("maintenance.html");
    const [dl] = await Promise.all([t.page.waitForEvent("download"), m.click("#sessSave")]);
    assert.equal(dl.suggestedFilename(), "databases.eqsession");
    const sess = JSON.parse(fs.readFileSync(await dl.path(), "utf8"));
    assert.equal(sess.format, "eq-diagr session");
    assert.deepEqual(sess.files.map(f => f.name).sort(), ["KD1280.elm", "KD1280.skv"]);
    await m.setInputFiles("#sessFile", { name: "databases.eqsession", mimeType: "application/json", buffer: fs.readFileSync(await dl.path()) });
    await m.click('dialog[open] .btns button:text-is("Use the session")');
    await m.waitForFunction(() => /Session opened: /.test(document.getElementById("status").textContent));
    assert.match(await m.textContent("#dbList"), /KD1280\.skv/);
    await m.setInputFiles("#sessFile", { name: "x.eqsession", mimeType: "application/json", buffer: Buffer.from("{}") });
    await m.waitForFunction(() => /is not a session file/.test(document.getElementById("status").textContent));
    // the sample database is added to the KTH database (Database > Load database files)
    const sample = f => path.join(ROOT, "webpoc", "web", "data", "sample", f);
    await t.page.setInputFiles("#openDb", [sample("Reactions.db"), sample("Reactions.elb")]);
    const db = await t.frame("database.html");
    await db.waitForSelector("dialog[open] .btns button");
    assert.match(await db.textContent("dialog[open] .msg"), /KD1280\.skv[\s\S]*Add the 2 files to them, or use them instead\?/);
    await db.click('dialog[open] .btns button:text-is("Add")');
    await db.waitForFunction(() => /Your files: KD1280\.skv, Reactions\.db/.test(document.getElementById("dbstatus").textContent), null, { timeout: 15000 });
    // back to the KTH database alone
    await t.menu("Database", "KTH course database KD1280");
    await db.waitForFunction(() => /^The KTH course database/.test(document.getElementById("dbstatus").textContent), null, { timeout: 15000 });
  }],
  ["the help opens on the first-diagram tutorial", async t => {
    await t.menu("Help", "Make your first diagram");
    const h = await t.frame("help.html");
    await t.page.waitForFunction(() => document.querySelector("#tabs .tab.active .t").textContent === "Help");
    const topic = await (await h.$("iframe[name=topic]")).contentFrame();
    await topic.waitForFunction(() => document.title === "Make your first diagram");
    await t.shot("09-help");
  }],
  ["the help is searched: pages with all the words, titles first", async t => {
    const h = await t.frame("help.html");
    await h.fill("#q", "ionic strength");
    await h.waitForFunction(() => !document.getElementById("results").hidden && document.querySelectorAll("#results li").length > 5);
    assert.ok(await h.$eval("#toc", e => e.hidden), "the results take the place of the contents");
    const titles = await h.$$eval("#results li a", a => a.map(x => x.textContent));
    assert.match(titles[0], /ionic strength/i);
    assert.ok(titles.includes("Making a diagram"));
    assert.ok(await h.$eval("#results .snip mark", m => /ionic|strength/i.test(m.textContent)));
    await t.shot("20-help-search");
    await h.click('#results li a:text-is("Making a diagram")');
    const topic = await (await h.$("iframe[name=topic]")).contentFrame();
    await topic.waitForFunction(() => /S_Making_Diagrams\.htm$/.test(location.pathname));
    await h.fill("#q", "zzzqqq");
    await h.waitForFunction(() => /No page has this word/.test(document.getElementById("results").textContent));
    await h.press("#q", "Escape");
    await h.waitForFunction(() => document.getElementById("results").hidden && !document.getElementById("toc").hidden && document.getElementById("q").value === "");
  }],
  ["the examples dialog lists the 17 examples; the About box opens", async t => {
    await t.menu("File", "Open an example");
    assert.equal(await t.page.$$eval("#exList button", b => b.length), 17);
    await t.shot("10-examples-dialog");
    await t.page.keyboard.press("Escape");
    await t.menu("Help", "About Eq-Diagr");
    assert.ok(await t.page.$eval("#about", d => d.open));
    await t.shot("11-about-dialog");
    await t.page.keyboard.press("Escape");
  }],
  ["the Pourbaix example makes a predominance diagram", async t => {
    await t.menu("File", "Open an example");
    await t.page.click('#exList [data-ex="10-Poubaix diag Cu"]');
    await t.page.waitForFunction(() => document.querySelector("#tabs .tab.active .t").textContent === "10-Poubaix diag Cu");
    const sp = await t.spana();
    await sp.waitForFunction(() => !document.getElementById("make").disabled);
    assert.deepEqual(await sp.$$eval('[data-low="1"], [data-high="1"]', i => i.map(x => x.value)), ["-0.3", "0.6"], "Eh in volts");
    await sp.click("#make");
    await sp.waitForFunction(() => /^Predom: 2,601/.test(document.getElementById("status").textContent), null, { timeout: 20000 });
    await t.shot("12-diagram-pourbaix-example");
  }],
  ["the diagram style changes the labels and colours; the PDF is drawn as on the screen", async t => {
    const sp = await t.spana();
    assert.ok(await sp.$$eval("#plot svg text", x => x.length) > 10, "labels as text by default");
    await sp.click("#styleBtn");
    await sp.selectOption("#stFont", "plotter");
    await sp.selectOption("#stPalette", "bw");
    assert.equal(await sp.$$eval("#plot svg text", x => x.length), 0, "plotter lines");
    assert.ok(await sp.$$eval("#plot svg path", p => p.every(x => x.getAttribute("stroke") === "#000000")), "black and white");
    await sp.click("#stDefault");
    assert.ok(await sp.$$eval("#plot svg text", x => x.length) > 10);
    // axes: a grid from the style, and a tick step for this diagram (advanced mode)
    await sp.selectOption("#stGrid", "major");
    assert.ok(await sp.$$eval("#plot svg path", p => p.some(x => x.getAttribute("stroke") === "#cfd3d8")), "grid lines");
    await sp.click("#stDefault");
    await sp.click("#styleDlg button.primary");
    const numbers = () => sp.$$eval("#plot svg text", t => t.map(x => x.textContent).filter(x => /^[\u2013-]?\d+(\.\d+)?$/.test(x)));
    const before = await numbers();
    await sp.evaluate(() => document.querySelectorAll("details").forEach(d => { d.open = true; }));
    await sp.fill("#tickX", "1"); await sp.dispatchEvent("#tickX", "change");
    await sp.waitForFunction(n => [...document.querySelectorAll("#plot svg text")].length > n, (await sp.$$eval("#plot svg text", x => x.length)) - 1);
    const after = await numbers();
    assert.ok(after.length > before.length && ["3", "5", "7"].every(v => after.includes(v)), `tick step 1 on the pH axis: ${after.join(" ")}`);
    assert.ok(await sp.$eval("#staleBadge", b => b.hidden), "a tick step only redraws");
    await sp.fill("#tickX", ""); await sp.dispatchEvent("#tickX", "change");
    const [dl] = await Promise.all([t.page.waitForEvent("download"), sp.click("#dlPdf")]);
    const file = await dl.path();
    assert.equal(fs.readFileSync(file).subarray(0, 8).toString("latin1"), "%PDF-1.4");
    assert.match(dl.suggestedFilename(), /\.pdf$/);
  }],
  ["no label is cut off: 17 examples x 3 fonts at 150 % text size", async t => {
    const sp = await t.spana();
    const bad = await sp.evaluate(async () => {
      const names = ["01-Make your 1st diagram", "02-Fraction diagram", "03-fixed CO2 pressure", "04-Log conc diagr",
        "05-pH calculated", "05-pH calculated (log)", "06-Eh calculated", "06-Eh calculated (log)", "07-Solubility Al",
        "08-Solubility calcite", "09-Predom Cd-NTA", "10-Poubaix diag Cu", "11-logO2-pH 300C", "12-logO2-pH Au 250C",
        "13-Titration acetic acid", "14-Titration Mg-edta", "15-H-affinity (oxalate-carbonate mix)"];
      const engine = new EqDiagrEngine(), out = [], box = document.createElement("div");
      box.style.cssText = "position:absolute;left:0;top:0;width:900px;visibility:hidden";
      document.body.appendChild(box);
      for (const n of names) {
        const dat = await (await fetch("data/examples/" + encodeURIComponent(n + ".dat"))).text();
        const program = /^\s*(\S+\s+){0}/.test(dat) && /predom|Predom/i.test(n) || /^(09|10|11|12)/.test(n) ? "predom" : "sed";
        const r = await engine.run(program, ["-d=/x/e.dat"], { files: { "/x/e.dat": dat }, outputs: ["/x/e.plt"] });
        const plt = r.files["/x/e.plt"];
        if (!plt) { out.push(`${n}: no plot`); continue; }
        // each font at 150 %, and once with ticks outside, minor ticks, a grid and a box
        const styles = ["sans", "serif", "mono"].map(font => ({ font, textScale: 1.5 }))
          .concat([{ font: "sans", textScale: 1.5, ticks: "out", minor: 5, grid: "all", frame: "box" }]);
        for (const st of styles) {
          const font = st.ticks ? "sans, ticks outside" : st.font;
          box.innerHTML = pltToSvg(plt, st);
          const svg = box.querySelector("svg"), vb = svg.viewBox.baseVal, inv = svg.getScreenCTM().inverse();
          for (const el of svg.querySelectorAll("text")) {
            const b = el.getBBox(), m = inv.multiply(el.getScreenCTM());
            const pts = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]]
              .map(([x, y]) => new DOMPoint(x, y).matrixTransform(m));
            const tol = 0.5;
            if (pts.some(p => p.x < vb.x - tol || p.x > vb.x + vb.width + tol || p.y < vb.y - tol || p.y > vb.y + vb.height + tol))
              out.push(`${n} / ${font}: "${el.textContent}"`);
          }
        }
      }
      box.remove();
      return out;
    });
    assert.deepEqual(bad, [], `labels outside the drawing: ${bad.slice(0, 6).join("; ")}${bad.length > 6 ? ` … (${bad.length})` : ""}`);
  }],
  ["pointing at the diagram shows the coordinates and a cross-hair", async t => {
    const sp = await t.spana();
    const box = await sp.$eval("#plot svg", s => { const r = s.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
    const fb = await (await sp.frameElement()).boundingBox();
    assert.match(await sp.textContent("#readout"), /Point at the diagram/);
    await t.page.mouse.move(fb.x + box.x + box.w * 0.55, fb.y + box.y + box.h * 0.5);
    await wait(150);
    const m = (await sp.textContent("#readout")).match(/pH = ([\d.]+)\s+E\s*SHE \/ V = ([−\d.]+)/);
    assert.ok(m, "the readout names the axes: " + await sp.textContent("#readout"));
    assert.ok(+m[1] > 2 && +m[1] < 12, "pH inside the axis");
    assert.equal(await sp.$eval("#plot svg .cross", g => g.getAttribute("visibility")), "visible");
    await t.page.mouse.move(fb.x + box.x + 4, fb.y + box.y + 4);
    await wait(150);
    assert.equal(await sp.$eval("#plot svg .cross", g => g.getAttribute("visibility")), "hidden");
  }],
  ["a kept diagram stays in the drawing with broken lines, named by what differs", async t => {
    const sp = await t.spana();
    const made = () => sp.waitForFunction(() => document.getElementById("staleBadge").hidden && !document.getElementById("make").disabled && !document.getElementById("plot").classList.contains("stale"));
    assert.equal(await sp.$$eval("#plot svg path[stroke-dasharray]", p => p.length), 0);
    await sp.click("#keepBtn");
    await sp.waitForSelector("#kept .k");
    const cu = '#concTable [data-low="2"]', before = await sp.$eval(cu, e => e.value);
    await sp.fill(cu, "1e-3"); await sp.press(cu, "Tab");
    await sp.click("#make"); await made();
    assert.ok(await sp.$$eval("#plot svg path[stroke-dasharray]", p => p.length) > 0, "the kept diagram is drawn with broken lines");
    assert.ok(await sp.$eval("#plot svg clipPath rect", r => +r.getAttribute("width") > 100), "inside the axes");
    const legend = await sp.$$eval("#plot svg .legend text", x => x.map(e => e.textContent));
    assert.deepEqual(legend, ["Cu 2+ total 0.001", "Cu 2+ total " + before]);
    assert.equal(await sp.textContent("#kept .k .nm"), "Cu 2+ total " + before);
    // a second one, and the PDF has them too
    await sp.click("#keepBtn");
    await sp.fill(cu, "1e-9"); await sp.press(cu, "Tab");
    await sp.click("#make"); await made();
    assert.equal(await sp.$$eval("#plot svg .legend text", x => x.length), 3);
    const [dl] = await Promise.all([t.page.waitForEvent("download"), sp.click("#dlPdf")]);
    const pdf = require("fs").readFileSync(await dl.path(), "latin1");
    assert.ok(/\] 0 d/.test(pdf) && /re W n/.test(pdf) && pdf.includes("(Cu 2+ total 0.001) Tj"), "broken lines, clipped, with the legend in the PDF");
    await t.shot("21-kept-diagrams");
    // removed again; the concentration as it was
    await sp.click('#kept button[data-unkeep="all"]');
    assert.equal(await sp.$$eval("#plot svg path[stroke-dasharray]", p => p.length), 0);
    assert.ok(await sp.$eval("#kept", k => k.hidden));
    await sp.fill(cu, before); await sp.press(cu, "Tab");
    await sp.click("#make"); await made();
  }],
  ["live mode: the diagram follows a slider, and the file is saved when the changes stop", async t => {
    const sp = await t.spana();
    await sp.check("#live");
    await sp.waitForSelector("#concTable input[type=range]");
    const before = await sp.$eval("#plot", p => p.innerHTML);
    const value = () => sp.$eval('#concTable tr:has(+ tr.slide) [data-low]', e => e.value);
    const v0 = await value();
    await sp.focus("#concTable input[type=range]");
    for (let i = 0; i < 25; i++) await t.page.keyboard.press("ArrowRight");
    await sp.waitForFunction(b => document.getElementById("plot").innerHTML !== b, before);
    assert.notEqual(await value(), v0, "the slider writes the value");
    assert.ok(await sp.$eval("#staleBadge", b => b.hidden), "no stale badge in live mode");
    assert.ok(!(await sp.$eval("#plot", p => p.classList.contains("stale"))));
    await sp.waitForFunction(() => /saved in this browser/.test(document.getElementById("status").textContent), null, { timeout: 6000 });
    assert.equal(await t.page.$$eval("#tabs .dirty", d => d.length), 0, "saved: the tab is not marked as changed");
    // an error stops the live runs: the diagram is dimmed until it is corrected
    await sp.fill('#concTable [data-high="0"]', ""); await sp.press('#concTable [data-high="0"]', "Tab");
    await wait(400);
    assert.ok(await sp.$eval("#make", b => b.disabled));
    await sp.fill('#concTable [data-high="0"]', "11"); await sp.press('#concTable [data-high="0"]', "Tab");
    await sp.waitForFunction(() => !document.getElementById("plot").classList.contains("stale") && !document.getElementById("make").disabled);
    await t.shot("16-live-mode");
    await sp.uncheck("#live");
    assert.equal(await sp.$$eval("#concTable input[type=range]", s => s.length), 0, "no sliders without live mode");
  }],
  ["advanced mode: the data file is edited as text, with the errors of the programs", async t => {
    const sp = await t.spana();
    await sp.click("#editDat");
    await sp.waitForFunction(() => document.getElementById("editDlg").open);
    const text = await sp.$eval("#editText", e => e.value);
    assert.match(text, /^Cu\(OH\)2 +, -16\.24 /m);
    // a text that is not a data file stays in the box, with the line of the error selected
    await sp.fill("#editText", text.replace("-16.24", "abc"));
    await sp.click("#editApply");
    await sp.waitForFunction(() => !document.getElementById("editErr").hidden);
    assert.match(await sp.textContent("#editErr"), /Could not read a float value[\s\S]*in line: "Cu\(OH\)2 /);
    assert.ok(await sp.$eval("#editDlg", d => d.open));
    assert.match(await sp.$eval("#editText", e => e.value.slice(e.selectionStart, e.selectionEnd)), /^Cu\(OH\)2 +, abc/);
    await t.shot("17-edit-data-file");
    // leaving with changes asks first
    await sp.click("#editCancel");
    await sp.click('dialog[open] .btns button:text-is("Keep editing")');
    assert.ok(await sp.$eval("#editDlg", d => d.open));
    // a changed constant and a removed solid: the system is read again and the diagram is out of date
    await sp.fill("#editText", text.replace("-16.24", "-15.24").replace(/^Cu2O\(cr\).*\n/m, "").replace(" 3, 18, 4, 0,", " 3, 18, 3, 0,"));
    await sp.click("#editApply");
    await sp.waitForFunction(() => !document.getElementById("editDlg").open);
    assert.match(await sp.textContent("#sysSummary"), /3 components, 18 complexes, 3 solids/);
    assert.match(await sp.textContent("#datText"), /^Cu\(OH\)2 +, -15\.24 /m);
    assert.ok(!(await sp.$eval("#staleBadge", b => b.hidden)), "the diagram shown is out of date");
    await t.page.waitForSelector("#tabs .tab.active .dirty");
    await sp.click("#make");
    await sp.waitForFunction(() => document.getElementById("staleBadge").hidden && !document.getElementById("make").disabled);
    // the same editor from the Chemical system section; unchanged text closes without a question
    await sp.evaluate(() => { document.getElementById("sysPanel").open = true; });
    await sp.click("#editDat2");
    await sp.waitForFunction(() => document.getElementById("editDlg").open);
    await sp.click("#editCancel");
    await sp.waitForFunction(() => !document.getElementById("editDlg").open);
    // normal mode has no editor
    await t.page.click("#modeNormal");
    await sp.waitForFunction(() => getComputedStyle(document.getElementById("editDat")).display === "none");
    await t.page.click("#modeAdv");
  }],
  ["the diagram is copied as an image of the chosen size; its plot file opens on its own", async t => {
    const sp = await t.spana();
    // the clipboard of the test: the items written, in the view and in the app window
    const spy = () => { window.copied = []; navigator.clipboard.write = async items => { for (const it of items) { const b = await it.getType("image/png"); const bm = await createImageBitmap(b); window.copied.push([it.types.join(), bm.width, bm.height]); } }; };
    await sp.evaluate(spy); await t.page.evaluate(spy);
    const copied = async () => (await sp.evaluate(() => window.copied)).concat(await t.page.evaluate(() => window.copied));
    await sp.click("#copyImg");
    await t.page.waitForFunction(() => /on the clipboard/.test(document.getElementById("sbStatus").textContent));
    let c = await copied();
    assert.equal(c.length, 1); assert.equal(c[0][0], "image/png"); assert.equal(Math.max(c[0][1], c[0][2]), 1600, "1600 pixels by default");
    // a smaller image, chosen in the diagram style, also for the PNG file
    await sp.click("#styleBtn");
    await sp.selectOption("#stPng", "800");
    await sp.click('#styleDlg button[value="close"]');
    await t.menu("File", "Copy the diagram as an image");
    for (let i = 0; i < 100 && (await copied()).length < 2; i++) await wait(100);
    c = await copied();
    assert.equal(c.length, 2);
    assert.ok(c.some(x => Math.max(x[1], x[2]) === 800), "the image has the size chosen");
    await sp.click("#styleBtn"); await sp.selectOption("#stPng", "1600"); await sp.click('#styleDlg button[value="close"]');
    // the plot file of the diagram, opened as a file from this computer
    const [dl] = await Promise.all([t.page.waitForEvent("download"), sp.click("#dlPlt")]);
    const plt = require("fs").readFileSync(await dl.path());
    await t.page.setInputFiles("#openDat", { name: "copper.plt", mimeType: "text/plain", buffer: plt });
    await t.page.waitForFunction(() => document.querySelector("#tabs .tab.active .t").textContent === "copper");
    const pl = await t.spana();
    await pl.waitForSelector("#plot svg");
    assert.equal(await pl.$eval("#settings", s => getComputedStyle(s).display), "none", "a plot file has no settings");
    assert.ok(!(await pl.$eval("#dlPdf", b => b.disabled)) && !(await pl.$eval("#copyImg", b => b.disabled)));
    assert.match(await t.page.textContent("#sbStatus"), /Plot file copper\.plt/);
    await t.shot("18-plot-file");
    await t.page.click("#tabs .tab.active .x");
    // a file that is not a plot file opens no tab
    const n = await t.page.$$eval("#tabs .tab", x => x.length);
    await t.page.setInputFiles("#openDat", { name: "bad.plt", mimeType: "text/plain", buffer: Buffer.from("hello\n") });
    await t.page.waitForFunction(() => /could not be read as a plot file/.test(document.getElementById("sbStatus").textContent));
    assert.equal(await t.page.$$eval("#tabs .tab", x => x.length), n);
    await t.page.click('#tabs .tab .t:text-is("10-Poubaix diag Cu")');
  }],
  ["live mode: a slider changes a log K; the change is marked and undone", async t => {
    const sp = await t.spana();
    await sp.evaluate(() => { document.getElementById("sysPanel").open = true; });
    await sp.check("#live");
    await sp.waitForSelector('#specTable input[data-kslide="0"]');
    // sliders of the options: the ionic strength, and the temperature of the calculation (advanced)
    assert.ok(await sp.$eval(".live-only", e => getComputedStyle(e).display !== "none"), "a note says where the sliders are");
    await sp.evaluate(() => { document.getElementById("ionic").closest("details").open = true; });
    assert.deepEqual(await sp.$$eval(".optslide", x => x.map(e => [e.dataset.for, getComputedStyle(e).display, e.value])), [["temp", "block", "25"], ["ionic", "block", "0"]]);
    const frame = () => sp.$eval("#plot svg", x => x.getAttribute("viewBox"));
    const frame0 = await frame();
    const headPos = start => sp.$$eval("#plot svg text", (x, st) => { const e = x.find(y => y.textContent.startsWith(st)); const r = e.getBoundingClientRect(); return { x: r.x, y: r.y }; }, start);
    const tPos0 = await headPos("t=");
    await sp.focus('.optslide[data-for="ionic"]');
    for (let i = 0; i < 10; i++) await t.page.keyboard.press("ArrowRight");
    assert.equal(await sp.$eval("#ionic", e => e.value), "0.1");
    await sp.waitForFunction(() => document.getElementById("staleBadge").hidden && !document.getElementById("plot").classList.contains("stale") && /I= ?0\.1/.test(document.querySelector("#plot svg").textContent));
    assert.equal(await frame(), frame0, "the drawing keeps its frame when the heading gets the ionic strength (live mode)");
    // the temperature keeps its place; the ionic strength is on a new line above it
    assert.ok(Math.abs((await headPos("t=")).x - tPos0.x) < 1 && Math.abs((await headPos("t=")).y - tPos0.y) < 1, "the temperature stays where it was");
    assert.ok((await headPos("I=")).y < tPos0.y - 5, "the ionic strength is above");
    await sp.fill("#ionic", "0.5");
    assert.equal(await sp.$eval('.optslide[data-for="ionic"]', e => e.value), "0.5", "the field moves the slider");
    await sp.fill("#ionic", "");
    await sp.waitForFunction(() => document.getElementById("staleBadge").hidden && !/I= ?0\.\d/.test(document.querySelector("#plot svg").textContent));
    await sp.evaluate(() => { document.getElementById("ionic").closest("details").open = false; });
    // (an earlier step changed this log K to -15.24 in the text of the file, which is then its value)
    assert.deepEqual(await sp.$eval('#specTable input[data-kslide="0"]', e => [e.min, e.max, e.value]), ["-18.24", "-12.24", "-15.24"]);
    assert.ok(await sp.$eval('[data-kreset="0"]', b => b.hidden));
    await sp.focus('#specTable input[data-kslide="0"]');
    for (let i = 0; i < 10; i++) await t.page.keyboard.press("ArrowRight");
    await sp.waitForFunction(() => /^Cu\(OH\)2 +, -14\.74 /m.test(document.getElementById("datText").textContent));
    assert.equal(await sp.$eval('#specTable [data-logk="0"]', e => e.value), "-14.74");
    await sp.waitForFunction(() => document.querySelector('#specTable [data-logk="0"]').closest("tr").classList.contains("changed") && !document.querySelector('[data-kreset="0"]').hidden);
    assert.ok(await sp.$('#specTable input[data-kslide="0"]'), "the table is not drawn again while the slider moves");
    // the automatic save of live mode leaves the changed log K out: the stored file keeps its value
    const storedK = () => sp.evaluate(async () => /^Cu\(OH\)2 +, (\S+)/m.exec(await Store.get("files", "10-Poubaix diag Cu.dat"))[1]);
    await t.page.waitForFunction(() => /without the changed log K/.test(document.getElementById("sbStatus").textContent), null, { timeout: 8000 });
    assert.equal(await storedK(), "-15.24");
    assert.equal(await t.page.$$eval("#tabs .tab.active .dirty", d => d.length), 1, "the tab stays marked as changed");
    // the button takes the value of the file back
    await sp.click('[data-kreset="0"]');
    await sp.waitForFunction(() => /^Cu\(OH\)2 +, -15\.24 /m.test(document.getElementById("datText").textContent) && document.querySelector('[data-kreset="0"]').hidden);
    // File > Save keeps a changed log K, which is then the value of the file
    await sp.uncheck("#live");
    await sp.fill('#specTable [data-logk="0"]', "-14"); await sp.press('#specTable [data-logk="0"]', "Tab");
    await sp.waitForFunction(() => /^Cu\(OH\)2 +, -14 /m.test(document.getElementById("datText").textContent) && !document.querySelector('[data-kreset="0"]').hidden);
    await sp.click("#make");
    await sp.waitForFunction(() => document.getElementById("staleBadge").hidden && !document.getElementById("make").disabled);
    await t.page.waitForFunction(() => /without the changed log K/.test(document.getElementById("sbStatus").textContent));
    assert.equal(await storedK(), "-15.24");
    await t.menu("File", "Save data file in this browser");
    await sp.click('dialog[open] .btns button:text-is("Save")');
    await t.page.waitForFunction(() => !document.querySelector("#tabs .tab.active .dirty"));
    assert.equal(await storedK(), "-14");
    assert.ok(await sp.$eval('[data-kreset="0"]', b => b.hidden), "the saved value is the value of the file");
    await sp.check("#live");
    await sp.waitForSelector('#specTable input[data-kslide="0"]');
    await sp.uncheck("#live");
    assert.equal(await sp.$$eval("#specTable input[type=range]", x => x.length), 0);
    await sp.evaluate(() => { document.getElementById("sysPanel").open = false; });
  }],
  ["closing a changed tab asks whether to save", async t => {
    const sp = await t.spana();
    await sp.click("#eh");
    await t.page.waitForSelector("#tabs .tab.active .dirty");
    await t.page.click("#tabs .tab.active .x");
    await t.page.waitForSelector("dialog.eqdlg[open]");
    await t.page.click('dialog.eqdlg[open] button[value="discard"]');
    await t.page.waitForFunction(() => ![...document.querySelectorAll("#tabs .tab .t")].some(b => b.textContent === "10-Poubaix diag Cu"));
  }],
  ["a KTH search with sulfate leaves out H2SO4, which has no log K", async t => {
    await t.page.click("#tabs .tab .t");
    await t.menu("File", "New chemical system");
    const db = await t.frame("database.html");
    await db.click('#ptable button:text-is("S")');
    await db.click('#avail button:text-is("SO4 2-")');
    await db.click("#search");
    await db.waitForFunction(() => /species found/.test(document.getElementById("status").textContent));
    assert.match(await db.textContent("#status"), /Left out, without log K in the database: H2SO4/);
    assert.ok(!(await db.$eval("#toDiagram", b => b.disabled)));
  }],
  ["constants as stepwise pKa or pKb: the values of phosphoric acid; a step changes alone", async t => {
    await t.page.click("#tabs .tab .t");
    await t.menu("File", "New chemical system");
    const db = await t.frame("database.html");
    await db.click('#ptable button:text-is("P")');
    await db.click('#avail button:text-is("PO4 3-")');
    await db.click("#search");
    await db.waitForFunction(() => /species found/.test(document.getElementById("status").textContent));
    await db.click("#toDiagram");
    await t.page.waitForFunction(() => /^H\+_PO43-/.test(document.querySelector("#tabs .tab.active .t").textContent));
    const sp = await t.spana();
    await sp.evaluate(() => { document.getElementById("sysPanel").open = true; });
    const rows = () => sp.$$eval("#specTable tr", r => r.filter(x => x.querySelector("[data-logk]")).map(x => [x.cells[1].textContent, (x.querySelector(".kkind") || {}).textContent || "", x.querySelector("[data-logk]").value]));
    assert.deepEqual(await rows(), [["H2PO4-", "", "19.553"], ["H3PO4", "", "21.702"], ["HPO4 2-", "", "12.346"], ["OH-", "", "-14"]]);
    await sp.selectOption("#kMode", "step");
    assert.deepEqual(await rows(), [["H2PO4-", "pKa", "7.207"], ["H3PO4", "pKa", "2.149"], ["HPO4 2-", "pKa", "12.346"], ["OH-", "pKw", "14"]]);
    assert.equal(await sp.$eval('#specTable tr:has(td.name:text-is("H2PO4-")) .kkind', e => e.title), "H2PO4- ⇌ HPO4 2- + H+");
    // pKa2 one unit higher: the accumulated log K of H2PO4- and H3PO4 move, the other steps stay
    const f = '#specTable tr:has(td.name:text-is("H2PO4-")) [data-logk]';
    await sp.fill(f, "8.207"); await sp.press(f, "Tab");
    await sp.waitForFunction(() => /^H2PO4- +, +20\.553 /m.test(document.getElementById("datText").textContent));
    const dat = await sp.textContent("#datText");
    assert.ok(/^H3PO4 +, +22\.702 /m.test(dat) && /^HPO4 2- +, +12\.346 /m.test(dat));
    assert.deepEqual(await rows(), [["H2PO4-", "pKa", "8.207"], ["H3PO4", "pKa", "2.149"], ["HPO4 2-", "pKa", "12.346"], ["OH-", "pKw", "14"]]);
    assert.equal(await sp.$$eval("#specTable tr.changed", x => x.length), 1, "one step is marked as changed");
    await t.shot("23-individual-steps");
    await sp.click("#specTable tr.changed [data-kreset]");
    await sp.waitForFunction(() => /^H2PO4- +, +19\.553 /m.test(document.getElementById("datText").textContent) && !document.querySelector("#specTable tr.changed"));
    // the same steps as pKb of their bases (pKb = pKw - pKa); a pKb is changed alone too
    await sp.selectOption("#kMode", "stepb");
    assert.deepEqual(await rows(), [["H2PO4-", "pKb", "6.793"], ["H3PO4", "pKb", "11.851"], ["HPO4 2-", "pKb", "1.654"], ["OH-", "pKw", "14"]]);
    assert.equal(await sp.$eval('#specTable tr:has(td.name:text-is("H2PO4-")) .kkind', e => e.title), "HPO4 2- + H2O ⇌ H2PO4- + OH-");
    assert.equal(await sp.textContent("#specTable tr th:nth-child(3)"), "pKb or log K");
    await sp.fill(f, "5.793"); await sp.press(f, "Tab");
    await sp.waitForFunction(() => /^H2PO4- +, +20\.553 /m.test(document.getElementById("datText").textContent));
    assert.deepEqual(await rows(), [["H2PO4-", "pKb", "5.793"], ["H3PO4", "pKb", "11.851"], ["HPO4 2-", "pKb", "1.654"], ["OH-", "pKw", "14"]]);
    await sp.click("#specTable tr.changed [data-kreset]");
    await sp.waitForFunction(() => /^H2PO4- +, +19\.553 /m.test(document.getElementById("datText").textContent) && !document.querySelector("#specTable tr.changed"));
    // back to the accumulated view, which later steps expect
    await sp.selectOption("#kMode", "cum");
    assert.deepEqual((await rows()).map(r => r[2]), ["19.553", "21.702", "12.346", "-14"]);
  }],
  ["a dropped data file opens in a tab; the readout lists the species; the diagram can be printed", async t => {
    const dat = await t.page.evaluate(async () => (await fetch("data/examples/" + encodeURIComponent("01-Make your 1st diagram.dat"))).text());
    const dt = await t.page.evaluateHandle(text => { const d = new DataTransfer(); d.items.add(new File([text], "dropped.dat", { type: "text/plain" })); return d; }, dat);
    await t.page.dispatchEvent("body", "dragover", { dataTransfer: dt });
    assert.ok(await t.page.evaluate(() => document.body.classList.contains("dropping")), "the drop zone is shown");
    await t.page.dispatchEvent("body", "drop", { dataTransfer: dt });
    await t.page.waitForFunction(() => document.querySelector("#tabs .tab.active .t").textContent === "dropped");
    const sp = await t.spana();
    await sp.waitForFunction(() => !document.getElementById("make").disabled);
    await t.menu("File");
    assert.ok(await t.page.$eval('.menu:not([hidden]) button:has-text("Print the diagram")', b => b.disabled), "nothing to print yet");
    await t.page.keyboard.press("Escape");
    await sp.click("#make");
    await sp.waitForSelector("#plot svg");
    const box = await sp.$eval("#plot svg", s => { const r = s.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
    const fb = await (await sp.frameElement()).boundingBox();
    // (the pointer is moved until the readout answers: in Chromium the first move after the
    // diagram appears is sometimes not delivered to the new drawing)
    let text = "";
    for (let i = 0; i < 20 && !/At this pH/.test(text); i++) {
      await t.page.mouse.move(fb.x + box.x + box.w * 0.6 + (i % 2), fb.y + box.y + box.h * 0.5);
      await wait(150);
      text = await sp.$eval("#readout", e => e.textContent);
    }
    assert.match(text, /At this pH:.*Fe2\+ −5\.\d\d.*H\+ −\d/, "species at the pointer: " + text);
    await t.menu("File");
    assert.ok(!(await t.page.$eval('.menu:not([hidden]) button:has-text("Print the diagram")', b => b.disabled)));
    await t.page.keyboard.press("Escape");
    await t.page.emulateMedia({ media: "print" });
    assert.deepEqual(await sp.evaluate(() => ["settings", "exportBar", "plot"].map(id => getComputedStyle(document.getElementById(id)).display)), ["none", "none", "block"]);
    await t.page.emulateMedia({ media: "screen" });
  }],
  ["the .csv file has the tables of the kept diagrams after the one of the diagram shown", async t => {
    const sp = await t.spana();
    assert.equal(await t.page.textContent("#tabs .tab.active .t"), "dropped");
    const made = () => sp.waitForFunction(() => document.getElementById("staleBadge").hidden && !document.getElementById("make").disabled && !document.getElementById("plot").classList.contains("stale"));
    await sp.click("#keepBtn");
    await sp.fill('#concTable [data-low="1"]', "1e-4"); await sp.press('#concTable [data-low="1"]', "Tab");
    await sp.click("#make"); await made();
    const [dl] = await Promise.all([t.page.waitForEvent("download"), sp.click("#dlCsv")]);
    const csv = require("fs").readFileSync(await dl.path(), "utf8");
    assert.ok(csv.startsWith('"===== Diagram shown: Fe 2+ total 1e-4 ====="\n'), csv.slice(0, 80));
    assert.ok(csv.includes('\n"===== Kept diagram 1: Fe 2+ total 1e-5 ====="\n'));
    assert.equal(csv.split("TABLE output from program SED").length - 1, 2, "two tables");
    await sp.click('#kept button[data-unkeep="0"]');
    const [dl2] = await Promise.all([t.page.waitForEvent("download"), sp.click("#dlCsv")]);
    assert.ok(!/=====/.test(require("fs").readFileSync(await dl2.path(), "utf8")), "the table alone without kept diagrams");
  }],
  ["a link to a diagram carries the data file and makes the diagram", async t => {
    await t.menu("File");
    assert.ok(!(await t.page.$eval('.menu:not([hidden]) button:has-text("Copy a link to this diagram")', b => b.disabled)));
    await t.page.keyboard.press("Escape");
    const sp0 = await t.spana();
    const url = await t.page.evaluate(async text => EqApp.shareUrl("linked.dat", text), await sp0.$eval("#datText", e => e.textContent));
    assert.match(url, /app\.html#dat=linked\.dat&[zt]=[A-Za-z0-9_-]+$/);
    assert.ok(url.length < 2500, `a short link for a small system (${url.length} characters)`);
    await t.page.evaluate(u => { location.hash = u.slice(u.indexOf("#")); }, url);
    await t.page.waitForFunction(() => document.querySelector("#tabs .tab.active .t").textContent === "linked");
    const sp = await t.spana();
    await sp.waitForSelector("#plot svg", { timeout: 15000 });
    assert.equal(await t.page.evaluate(() => location.hash), "", "the data leaves the address bar");
    assert.equal(await sp.$eval("#datText", e => e.textContent), await sp0.$eval("#datText", e => e.textContent), "the same data file");
  }],
  ["unticked reactions are deleted for good; diagram name, no table, saved defaults", async t => {
    await t.menu("File", "Open an example");
    await t.page.click('#exList [data-ex="07-Solubility Al"]');
    await t.page.waitForFunction(() => document.querySelector("#tabs .tab.active .t").textContent === "07-Solubility Al");
    const sp = await t.spana();
    await sp.evaluate(() => document.querySelectorAll("details").forEach(d => { d.open = true; }));
    const count = async () => (await sp.textContent("#sysSummary")).match(/(\d+) complexes, (\d+) solids/).slice(1).map(Number);
    const [nx, nf] = await count();
    assert.ok(await sp.$eval("#delOff", b => b.hidden), "nothing to delete");
    const name = await sp.$eval("#specTable input[data-off]", e => e.dataset.off);
    await sp.click("#specTable input[data-off]");
    await sp.waitForFunction(() => !document.getElementById("delOff").hidden);
    assert.ok((await sp.textContent("#datText")).includes("*" + name));
    await sp.click("#delOff");
    assert.ok((await sp.textContent("dialog[open] .msg")).includes(name));
    await sp.click('dialog[open] .btns button:text-is("Delete")');
    await sp.waitForFunction(() => document.getElementById("delOff").hidden && !/\*/.test(document.getElementById("datText").textContent));
    const [nx2, nf2] = await count();
    assert.equal(nx2 + nf2, nx + nf - 1);
    assert.ok(!(await sp.textContent("#datText")).split("\n").some(l => l.split(",")[0].trim() === name));
    // the diagram name names the exported files; without the table there is no .csv
    await sp.fill("#diagName", "aluminium what-if");
    await sp.uncheck("#tblOn");
    await sp.click("#saveDef");
    assert.equal(await sp.evaluate(() => JSON.parse(localStorage.getItem("eqdiagr.calcDefaults")).tblOn), false);
    await sp.click("#make");
    await sp.waitForFunction(() => !!document.querySelector("#plot svg") && document.getElementById("staleBadge").hidden && !document.getElementById("make").disabled);
    assert.ok(await sp.$eval("#dlCsv", b => b.disabled), "no table of results");
    const [dl] = await Promise.all([t.page.waitForEvent("download"), sp.click("#dlSvg")]);
    assert.equal(dl.suggestedFilename(), "aluminium what-if.svg");
    // the saved defaults are those of a new tab; "Program defaults" takes them back
    await t.menu("File", "Open an example");
    await t.page.click('#exList [data-ex="02-Fraction diagram"]');
    await t.page.waitForFunction(() => document.querySelector("#tabs .tab.active .t").textContent === "02-Fraction diagram");
    const sp2 = await t.spana();
    assert.ok(!(await sp2.$eval("#tblOn", e => e.checked)), "the saved default");
    await sp2.evaluate(() => document.querySelectorAll("details").forEach(d => { d.open = true; }));
    await sp2.click("#resetDef");
    assert.ok(await sp2.$eval("#tblOn", e => e.checked));
    assert.equal(await sp2.evaluate(() => localStorage.getItem("eqdiagr.calcDefaults")), null);
  }],
  ["diagram style: own pen colours, white on black, width, and the page of the PDF and PostScript files", async t => {
    const sp = await t.spana();
    await sp.click("#make");
    await sp.waitForFunction(() => !!document.querySelector("#plot svg") && document.getElementById("staleBadge").hidden && !document.getElementById("make").disabled);
    const vb = () => sp.$eval("#plot svg", s => s.getAttribute("viewBox").split(" ").map(Number));
    const w0 = (await vb())[2];
    await sp.click("#styleBtn");
    assert.ok(await sp.$eval("#stColors", e => e.hidden));
    // the texts above the diagram can be left out
    const heading = () => sp.$$eval("#plot svg text", x => x.map(e => e.textContent).filter(e => /=/.test(e)));
    assert.ok((await heading()).some(e => /^t=/.test(e)) && (await heading()).some(e => /TOT/.test(e)));
    await sp.uncheck("#stHeadTemp");
    assert.ok(!(await heading()).some(e => /^t=/.test(e)) && (await heading()).some(e => /TOT/.test(e)), "no temperature");
    await sp.uncheck("#stHeadConc");
    assert.deepEqual(await heading(), []);
    await sp.check("#stHeadTemp"); await sp.check("#stHeadConc");
    await sp.selectOption("#stPalette", "custom");
    assert.ok(!(await sp.$eval("#stColors", e => e.hidden)));
    await sp.$eval('#stPens input[data-pen="1"]', el => { el.value = "#00aa00"; el.dispatchEvent(new Event("change", { bubbles: true })); });
    await sp.waitForFunction(() => document.querySelectorAll('#plot svg path[stroke="#00aa00"]').length > 0);
    await sp.selectOption("#stWidth", "1.5");
    assert.ok((await vb())[2] > 1.3 * w0, "a wider diagram");
    assert.ok(await sp.$eval("#stOrient", e => e.disabled), "no orientation for the diagram alone");
    await sp.selectOption("#stPage", "a4"); await sp.selectOption("#stOrient", "1"); await sp.selectOption("#stScale", "75");
    await sp.check("#stHeader"); await sp.selectOption("#stPs", "ps");
    await sp.click('#styleDlg button[value="close"]');
    const fs = require("fs");
    const [d1] = await Promise.all([t.page.waitForEvent("download"), sp.click("#dlPdf")]);
    const pdf = fs.readFileSync(await d1.path(), "latin1");
    assert.ok(pdf.includes("/MediaBox [0 0 841.89 595.28]"), "A4, landscape");
    assert.ok(/q 0\.7500 0 0 0\.7500 28\.35 28\.35 cm/.test(pdf), "75 %, 1 cm from the left and from the bottom");
    assert.match(pdf, /\(02-Fraction diagram {4}\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\) Tj/);
    assert.equal(await sp.textContent("#dlEps"), "PS");
    const [d2] = await Promise.all([t.page.waitForEvent("download"), sp.click("#dlEps")]);
    assert.equal(d2.suggestedFilename(), "02-Fraction diagram.ps");
    assert.match(fs.readFileSync(await d2.path(), "latin1"), /^%!PS-Adobe/);
    await sp.click("#styleBtn");
    await sp.selectOption("#stPalette", "wb");
    await sp.waitForFunction(() => document.querySelector("#plot svg rect").getAttribute("fill") === "#000000");
    assert.ok(await sp.$$eval("#plot svg path", p => p.every(x => x.getAttribute("stroke") === "#ffffff" || x.getAttribute("stroke") === "#555555")));
    await sp.click('#styleDlg button[value="close"]');
    await t.shot("22-white-on-black");
    await sp.click("#styleBtn");
    await sp.click("#stDefault");
    assert.deepEqual(await sp.evaluate(() => ["stPalette", "stWidth", "stPage", "stScale", "stPs"].map(i => document.getElementById(i).value)), ["eqdiagr", "1", "fit", "100", "eps"]);
    assert.equal(await sp.textContent("#dlEps"), "EPS");
    await sp.click('#styleDlg button[value="close"]');
  }],
  ["the colour themes (View menu) reach the views and are remembered", async t => {
    const pick = async label => { await t.menu("View"); await t.page.click(`.menu:not([hidden]) button span:text-is("${label}")`); await wait(200); };
    const db = await t.frame("database.html");
    const bg = f => f.evaluate(() => getComputedStyle(document.body).backgroundColor);
    // (Firefox has no computed styles in the frame of a tab that is not shown)
    await t.page.click("#tabs .tab .t"); await wait(200);
    await pick("Original (as the desktop programs)");
    assert.equal(await db.evaluate(() => document.documentElement.dataset.theme), "original");
    assert.equal(await bg(db), "rgb(236, 236, 236)");
    assert.equal(await db.$eval("#ptable", e => getComputedStyle(e).backgroundColor), "rgb(255, 255, 153)", "the periodic table is on the yellow panel of DataBase");
    await t.page.click("#tabs .tab .t"); await wait(200);
    await t.shot("14-theme-original");
    await pick("Dark");
    assert.equal(await bg(db), "rgb(28, 28, 30)");
    assert.equal(await t.page.evaluate(() => localStorage.getItem("eqdiagr.theme")), "dark");
    await t.shot("15-theme-dark");
    await pick("Light");
    assert.equal(await bg(db), "rgb(255, 255, 255)");
    await pick("As the computer (light or dark)");
    assert.equal(await db.evaluate(() => document.documentElement.hasAttribute("data-theme")), false);
  }],
  ["at phone width the file list is a drawer", async t => {
    await t.page.setViewportSize({ width: 390, height: 844 });
    await t.page.click("#tabs .tab .t");
    await wait(300);
    assert.ok(await t.page.$eval("#sideToggle", b => getComputedStyle(b).display !== "none"));
    assert.ok(await t.page.$eval("#sidebar", s => getComputedStyle(s).display === "none"));
    await t.shot("13-phone-chemical-system");
  }],
  ["on a phone: the elements as large buttons, explanations on tap, the diagram in full screen", async t => {
    const db = await t.frame("database.html");
    // the elements of the database only, each large enough for a finger, H and e- first
    const cells = await db.$$eval("#ptable button", b => b.filter(x => x.offsetParent).map(x => { const r = x.getBoundingClientRect(); return [x.textContent, r.width, r.height, r.top, r.left]; }));
    assert.ok(cells.length > 25 && cells.length < 60, "only the elements with components: " + cells.length);
    assert.ok(cells.every(c => c[1] >= 44 && c[2] >= 40), "cells of at least 44 x 40 px");
    assert.deepEqual(cells.slice().sort((a, b) => a[3] - b[3] || a[4] - b[4]).slice(0, 2).map(c => c[0]), ["H", "e⁻"]);
    assert.equal(await db.$$eval("#ptable button.none", b => b.filter(x => x.offsetParent).length), 0);
    // a diagram tab: a tap on the mark of a constant shows its reaction (no hover on a touch screen)
    await t.page.click('#tabs .tab .t:text-is("H+_PO43-")');
    const sp = await t.spana();
    await sp.evaluate(() => { document.getElementById("sysPanel").open = true; });
    await sp.selectOption("#kMode", "step");
    await sp.$eval("#specTable .kkind", e => { const r = e.getBoundingClientRect(); e.dispatchEvent(new PointerEvent("pointerup", { pointerType: "touch", bubbles: true, clientX: r.x + 5, clientY: r.y + 5 })); });
    assert.equal(await sp.textContent(".taptip"), "H2PO4- ⇌ HPO4 2- + H+");
    const tip = await sp.$eval(".taptip", e => { const r = e.getBoundingClientRect(); return [r.left, r.right, innerWidth]; });
    assert.ok(tip[0] >= 0 && tip[1] <= tip[2], "the bubble is inside the screen");
    // a tap elsewhere removes it; a tap on a control does not show one
    await sp.$eval("#make", e => e.dispatchEvent(new PointerEvent("pointerup", { pointerType: "touch", bubbles: true, clientX: 30, clientY: 30 })));
    assert.equal(await sp.$$eval(".taptip", x => x.length), 0);
    await sp.selectOption("#kMode", "cum");
    // the diagram alone on the screen, without the menus and tabs of the app
    await sp.click("#make");
    await sp.waitForFunction(() => !!document.querySelector("#plot svg") && !document.getElementById("fullBtn").disabled);
    assert.ok(await sp.$eval("#fullBtn", b => getComputedStyle(b).display !== "none"));
    await sp.click("#fullBtn");
    assert.ok(await t.page.evaluate(() => document.body.classList.contains("viewfull") && getComputedStyle(document.querySelector(".menubar")).display === "none" && getComputedStyle(document.getElementById("tabs")).display === "none"));
    assert.ok(await sp.$eval("#settings", e => getComputedStyle(e).display === "none"));
    await t.page.setViewportSize({ width: 844, height: 390 });       // the phone turned
    await wait(300);
    const svg = await sp.$eval("#plot svg", x => { const r = x.getBoundingClientRect(); return [r.width, r.height, r.bottom, innerHeight]; });
    assert.ok(svg[1] > 250 && svg[2] <= svg[3], "the diagram fills the height and fits in it");
    await t.shot("24-phone-full-screen");
    assert.equal(await sp.textContent("#fullBtn"), "Close full screen");
    await sp.click("#fullBtn");
    assert.ok(await t.page.evaluate(() => !document.body.classList.contains("viewfull")));
    await t.page.setViewportSize({ width: 390, height: 844 });
  }]
];

async function runBrowser(name, url) {
  const result = { name, passed: 0, failed: [], errors: [] };
  let browser;
  try { browser = await launch(name); }
  catch (e) { result.failed.push(["launch", e.message.split("\n")[0]]); return result; }
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 860 }, colorScheme: "light" });
  const page = await ctx.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", e => result.errors.push(String(e)));
  const t = {
    page,
    // the frame of a view; waits until the tab's page has loaded
    async frame(sub) {
      for (let i = 0; i < 100; i++) {
        const f = page.frames().filter(x => x.url().includes(sub)).pop();
        if (f && await f.evaluate(() => document.readyState === "complete").catch(() => false)) return f;
        await wait(100);
      }
      throw new Error(`no ${sub} view`);
    },
    async spana() {       // the diagram frame of the active tab
      for (let i = 0; i < 50; i++) {
        const el = await page.$(`#views iframe:not([hidden])`);
        const f = el && await el.contentFrame();
        // the data file has been read when the file name is shown
        if (f && f.url().includes("spana.html") &&
            await f.evaluate(() => document.getElementById("fileName").textContent !== "none").catch(() => false)) return f;
        await wait(100);
      }
      throw new Error("no diagram tab");
    },
    async menu(top, item) {
      await page.click(`#menus > div > button:text-is("${top}")`);
      if (item) await page.click(`.menu:not([hidden]) button:has-text("${item}")`);
    },
    async shot(file) {
      if (!SHOTS) return;
      fs.mkdirSync(path.resolve(ROOT, SHOTS), { recursive: true });
      await page.screenshot({ path: path.resolve(ROOT, SHOTS, `${file}.png`) });
    }
  };
  await ctx.addInitScript(() => { if (window === window.top && !sessionStorage.getItem("started")) { localStorage.setItem("eqdiagr.advanced", "0"); sessionStorage.setItem("started", "1"); } });
  await page.goto(url + "/app.html");
  for (const [step, fn] of STEPS) {
    try { await fn(t); result.passed++; console.log(`  ok    ${name}: ${step}`); }
    catch (e) {
      result.failed.push([step, e.message.split("\n")[0]]);
      console.log(`  FAIL  ${name}: ${step}\n        ${e.message.split("\n").slice(0, 6).join("\n        ")}`);
      if (/no diagram tab|Target closed|crashed/.test(e.message)) break;   // later steps depend on this one
    }
  }
  await browser.close();
  return result;
}

(async () => {
  const { url, proc } = await startServer();
  const results = [];
  try { for (const b of BROWSERS) { console.log(`${b}:`); results.push(await runBrowser(b, url)); } }
  finally { proc.kill(); }
  console.log("\nsummary");
  let bad = 0;
  for (const r of results) {
    const n = STEPS.length;
    console.log(`  ${r.name.padEnd(9)} ${r.passed} of ${n} steps passed` + (r.errors.length ? `; ${r.errors.length} page error(s): ${r.errors.slice(0, 3).join(" | ")}` : ""));
    if (r.failed.length || r.errors.length) bad++;
  }
  process.exit(bad ? 1 : 0);
})();
