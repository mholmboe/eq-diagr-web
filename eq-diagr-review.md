# Review of ignasi-p/eq-diagr (Spana / Database / HaltaFall)

Cloned 2026-10-26 into `eq-diagr/` (HEAD `c94b0d8`, "Added ModReaction and EC-tests", 58 commits). GPLv3, Java 8 source level, *ca.* 86 000 lines across 15 NetBeans/Ant modules.

## Architecture

The programs form a file-based pipeline, with Spana as the GUI that orchestrates the steps:

1. **Database** (GUI) searches the thermodynamic databases for the chosen components and writes a `.dat` file. The `.dat` file holds the chemical system (components, reactions, log *K*, stoichiometry) and, optionally, a diagram specification (axes, concentrations of each component).
2. **SED** (log-concentration and fraction diagrams) or **Predom** (predominance-area diagrams) reads the `.dat` file, runs HALTAFALL at each grid point and writes a `.plt` file, which is a private vector-plot format. SED can also write a CSV table (`-tbl`).
3. **PlotPS** / **PlotPDF** convert `.plt` into PostScript/EPS or PDF.
4. **EC** is the newest program (2021-2026): a pure console equilibrium calculator that reads a `.dat` file and writes a text report plus a CSV table, without diagrams.
5. **ModChemSyst** and **ModReaction** edit `.dat` files from the command line (delete a component, exchange a component for a product species, activate/deactivate a reaction, change a log *K*).

The numerical core lives in `LibChemDiagr/src/lib/kemi/`:

| Package | Content | Swing/AWT? |
|---|---|---|
| `haltaFall` | `HaltaFall.java` (3247 lines, mass-balance solver with solid-phase selection), `Factor.java` (activity coefficients: Davies, SIT, simplified HKF) | no |
| `H2O` | IAPWS-95 water properties, dielectric constant | no |
| `chem` | `Chem` data model (ChemSystem, ChemConcs, diagram settings) | no |
| `readDataLib`, `readWriteDataFiles` | `.dat` reader/writer, `ModifyChemSyst` | no |
| `graph_lib` | `.plt` writing and painting | yes |

Hence the solver, the activity-coefficient models and the `.dat` I/O can be called as a library from any JVM code without a display.

## Build

There is no Ant on this machine and the NetBeans `build-impl.xml` files are not meant for standalone use, but plain `javac` works. Using JDK 11 (Corretto) with `--release 8`, `LibChemDiagr` plus EC, ModChemSyst, ModReaction, SED, Predom, PlotPS and PlotPDF all compiled without errors and without third-party jars. Spana itself was not attempted: `Spana/nbproject/project.properties` points `jvectClipboard-1.3.jar` at a hard-coded `D:\OneDrive\...` path, so that jar has to be fetched first. The release zip on GitHub ships prebuilt jars, which is the easier route for the GUI programs.

The upstream build and packaging scripts are Windows `.cmd` files relying on NMake and GnuWin32; they are of no use on macOS.

`build-cli.sh` (in this folder) replaces them for the command-line programs. It compiles `LibChemDiagr` and the seven modules EC, SED, Predom, PlotPDF, PlotPS, ModChemSyst and ModReaction, and writes one self-contained jar per program to `jars/`, each with the library classes bundled so that `java -jar jars/EC.jar` works without a `lib/` folder. A full build takes *ca.* 7 s; class files go to `build/`. `test-cli.sh` runs the three EC regression cases against `jars/EC.jar` and compares the CSV tables numerically (relative tolerance 10⁻⁶, absolute 10⁻¹²). A deliberately wrong run (default tolerance on CO3-Ca-NaCl) makes it fail, so the comparison is not vacuous.

## Command-line readiness

| Program | Headless? | Notes |
|---|---|---|
| EC | yes (tested) | Console program. Opens an `ErrMsgBx` dialog when started without arguments; error paths should be checked for further dialogs. Static fields throughout, so it is not re-entrant within one JVM. |
| ModChemSyst, ModReaction | yes (tested) | Console, with `-nostop` to suppress warning dialogs. Exit code is 0 even when the operation fails. |
| PlotPS, PlotPDF | PlotPDF yes (tested) | Console conversion; import Swing for message boxes only. |
| SED, Predom | no (tested) | Batch mode exists and works with a display (`-d=file.dat -p=out -nostop`, plus `-t`, `-i`, `-m`, `-n`, `-tbl`), but both classes extend `JFrame`, build the window in the constructor and call `setVisible(true)` in several places. They will throw `HeadlessException` with `-Djava.awt.headless=true` and need a display (on macOS a window or Dock icon will flash). |
| Database | no | GUI only. This is the main gap (see below). |

EC has regression tests in `EC/tests/` comparing HaltaFall against PHREEQC 3: one set with the Davies equation (mostly WATEQ4F constants; `Fe.dat`, `CO3-Ca-NaCl.dat`) and one with SIT (ThermoChimie v9b0; `CaSO4-Na-Cl.dat` with `SIT-coefficients.dta`). The reference `.out` and `.csv` files are committed, so a diff-based test harness is easy to set up. For instance, `Fe.dat` (10⁻⁵ mol HCl + 0.01 mol Fe(cr), Davies, 25 °C) is expected to give pH 7.82, pe −8.46 (*E*_h = −500 mV) and 3.33 × 10⁻³ mol magnetite.

## The gap for agent use: database search

Going from "elements X, Y, Z in database D at *T*, *p*" to a `.dat` file can only be done through the Database GUI. The search itself (`DataBase/src/database/DBSearch.java`) is coupled to the main window `FrameDBmain` through *ca.* 13 references (the selected-components list model, the progress bar and one label), and the redox and solid-phase choices are made in the modal dialogs `AskRedox` and `AskSolids`. The lower layer in `LibDataBase` (`LibSearch`, `LibDB`, `Complex`, `ProgramDataDB`, `CSVparser`) has no Swing dependency. A headless "search and write `.dat`" command line program is therefore feasible by lifting `DBSearch` out of the GUI, replacing the three GUI hooks with plain parameters, and turning the two dialogs into options (`-redoxN`, `-redoxS`, `-redoxP`, `-solids=all|none|...`). `WriteChemSyst.writeChemSyst` already exists for the output.

The thermodynamic databases themselves are not in the repository (only a 10 kB `Reactions.db` sample in `DataMaintenance/`); they come with the release zip.

## Options for terminal and agent use

1. **Thin wrappers around the jars.** Shell or Python scripts that write a `.dat` file, call EC, ModChemSyst/ModReaction and PlotPDF, and parse the CSV. This works today for everything except the database search and headless diagrams.
2. **New headless Java entry points** in the same style as EC: a `DBSearch` command line program (above) and a headless batch path for SED/Predom that builds the `Chem` diagram data and writes `.plt`/CSV without instantiating a `JFrame`. Of the two, the SED/Predom refactor is larger, since the calculation loops sit inside the frame classes (`SED.java` 3500 lines, `Predom.java` 3718 lines).
3. **An agent-facing layer** (an MCP server or a Python package) on top of 1 or 2 that exposes typed operations such as `make_system(elements, database, T, p)`, `equilibrate(system, totals)`, `fraction_diagram(...)`, `predominance_diagram(...)`, returning JSON and file paths. Since the core is plain Java, this can either call the jars as subprocesses or run a small JVM service.

Option 1 gives a working loop within a day; option 2 is what removes the GUI from the path entirely, and the database search program is the piece that most limits agent use today.

## Smaller observations

- Argument parsing is duplicated in every program and accepts `-x=v`, `-x:v` and `/x`; SED's help text does not mention `-?` behaviour with `-keep`, and Predom lists `-d=` twice.
- No unit-test framework; testing is by input/output files (`EC/tests`, `LibChemDiagr/other_stuff/Lib_tests`).
- `.dat` component names must match exactly (`"Fe 2+"` is not `"Fe+2"`), which matters when an agent writes or edits files.
- `.gitignore` already covers `build/` and `dist/` in each module, so local builds will not dirty the tree.

## Test runs (2026-10-26, JDK 11, javac `--release 8` build)

**EC regression tests.** All three cases in `EC/tests/` reproduce the committed references when run with the options the references were made with. These options are not documented in the test folder; they have to be read from the header of each `.out` file.

| Case | Command options | Result vs. reference |
|---|---|---|
| `Davies_eqn/Fe.dat` | `-m=0 -t=25 -i=-1` | CSV byte-identical (pH 7.8185, pe −8.4559, *E*_h −500.25 mV, 3.33 × 10⁻³ mol Fe₃O₄) |
| `Davies_eqn/CO3-Ca-NaCl.dat` | `-m=0 -t=25 -i=-1 -tol=1e-9 -tolA=1e-8` | identical except the charge-balance residual in point 5 (7.7740 × 10⁻¹⁴ vs. 7.7744 × 10⁻¹⁴), i.e. round-off |
| `SIT/CaSO4-Na-Cl.dat` | `-m=1 -t=25 -i=-1 -tol=1e-6` | CSV byte-identical |

With the default tolerance (relative 10⁻⁴), CO3-Ca-NaCl differs from the reference in the fourth significant figure (*e.g.* log *a*(CO₃²⁻) −4.1864 vs. −4.1862), so an automated harness must pass the reference tolerances. Each EC run takes *ca.* 0.2 s and runs fine with `-Djava.awt.headless=true`.

**SED batch mode.** Two carbonate input files taken from the help pages (`SP_Diagr_Log.htm`, `SP_Diagr_Fract.htm`) were run as

    java -cp lib:SED simpleEquilibriumDiagrams.SED -d=CO3_fract.dat -p=CO3_fract -tbl -nostop -n=100

Each run took *ca.* 3 s wall clock, of which 0.07 s was the calculation; the rest is Swing start-up, since a window is created. The `.plt` and `.csv` files were written, and the fraction curves cross at pH 6.35 (CO₂/HCO₃⁻) and pH 10.33 (HCO₃⁻/CO₃²⁻), as the input log *K* values require. With `-Djava.awt.headless=true` SED fails with `java.awt.HeadlessException` and exit code 1, which confirms that a display is needed.

**PlotPDF.** `java -Djava.awt.headless=true -cp PlotPDF plotPDF.PlotPDF CO3_fract.plt -pdf=CO3_fract.pdf -clr -nostop` works headless. On the default portrait page the diagram sits in the lower half with a file-name header at the top; `-o=L` and `-noh` change this.

**Predom.** The iron Pourbaix example from `SP_Diagr_Predom.htm` (components H⁺, e⁻, Fe²⁺; 21 aqueous species and 8 solids; [Fe]_TOT = 10⁻⁶ M) was run with `java -jar jars/Predom.jar -d=Fe_Eh-pH.dat -p=Fe_Eh-pH -t=25 -nostop -n=60`. The 61 × 61 grid took 0.065 s, against *ca.* 3 s wall clock including the window. The diagram shows the Fe³⁺, Fe²⁺, Fe₂O₃(cr), Fe₃O₄(cr), Fe(OH)₂(cr), Fe(cr) and FeO₄²⁻ fields and the water stability lines, as in the help page. Like SED, Predom exits with code 1 under `-Djava.awt.headless=true`. Files are in `test-runs/predom-fe/`.

**ModChemSyst** (files in `test-runs/modify/`):

- `-exch=CO3 2-,HCO3-` on the carbonate system transforms the log *K* values correctly (CO₂: 16.68 − 10.327 = 6.353; CO₃²⁻ becomes −10.327 relative to HCO₃⁻). A SED fraction diagram computed from the exchanged file reproduces the original species fractions within 6 × 10⁻⁵, which is inside HaltaFall's default relative tolerance of 10⁻⁴. However, the plot definition `CO3 2-, H+,` was replaced by a default log diagram (`LC,-9, 1, H+,`), since the component it named no longer exists; the concentrations were kept.
- `-del=Cl-` on the EC test file `Fe.dat` removed the five Cl-bearing species (18 → 13) correctly, but because the file is in EC format (a `-1` point list instead of a plot definition) ModChemSyst reported "Error in input plot-data for: Y-axis" and wrote the chemical system without any concentration section, while still exiting with code 0. ModChemSyst therefore only handles SED/Predom-style files fully.

**ModReaction** on the Fe Pourbaix file: `-deact=Fe2O3(cr)` renames the reaction to `*Fe2O3(cr)`, `-act=*Fe2O3(cr)` restores it, `-ch=Fe3O4(cr);-30` sets log *K* to −30 and appends `[old logK=-36.44]` to the comment, and `-rev=Fe3O4(cr)` restores −36.44. All four round-trip exactly. A Predom run on the haematite-free file shows goethite in place of haematite, together with a small FeOH²⁺ field near pH 2, which is what the log *K* values predict (goethite −13.22 per Fe vs. haematite −26.00/2 = −13.00 per Fe). An unknown name (`-deact=Fe2O3`) prints "Reaction name not found", writes no file, and exits with code 0.

The exit-code behaviour matters for agent use: for ModChemSyst and ModReaction a wrapper has to check that the output file exists and scan the log for "Error" or "not found" rather than trust the exit code.

## Browser proof of concept (2026-11-24, TeaVM 0.14.1)

The calculation core runs in the browser after compilation from Java bytecode to JavaScript with TeaVM 0.14.1. Everything is in `webpoc/`: `build-web.sh` builds `web/ec.js`, and `web/index.html` runs the three EC regression cases and compares each CSV with the committed reference using the same tolerances as `test-cli.sh` (relative 10⁻⁶, absolute 10⁻¹²). To view it, serve `webpoc/web` over HTTP (*e.g.* `python3 -m http.server --directory webpoc/web`), since the pages load their scripts by relative path. `sed.html` (below) draws SED diagrams.

| Case | Browser (Chromium 156) | vs. reference | vs. native JVM run |
|---|---|---|---|
| `Davies_eqn/Fe` | 43 ms | PASS | CSV byte-identical; `.out` identical apart from file paths |
| `Davies_eqn/CO3-Ca-NaCl` | 32 ms | PASS | 1 of 378 CSV cells differs: charge-balance residual 7.7775 × 10⁻¹⁴ vs. 7.7740 × 10⁻¹⁴ (reference: 7.7744 × 10⁻¹⁴) |
| `SIT/CaSO4-Na-Cl` | 21 ms | PASS | CSV byte-identical; `.out` identical apart from file paths |

The single difference is a residual of two nearly equal charge sums at *I* = 0.022 M and is therefore round-off, most likely from last-bit differences between the JavaScript and JVM implementations of `exp`/`log`. The JavaScript is 1.9 MB unminified (289 kB gzipped) and covers 470 classes.

No numerical code was changed. The build copies LibChemDiagr and `EC.java` into `webpoc/build/src` and makes the following substitutions there, all of which are mechanical so that an upstream update is picked up on rebuild:

1. `patch_ec.py` removes EC's AWT error box, turns `System.exit(0)` into an exception that the driver catches, compiles out the `-keep` console pause, and adds `webReset()`, since all cases run in one JavaScript session and EC keeps its settings in static fields.
2. `lib/common/MsgExceptn.java` is replaced by a console-only version (`webpoc/src/lib/common/`). HaltaFall reaches it when an activity-coefficient calculation fails, and the original can open a Swing dialog.
3. The charset name `"UTF8"` becomes `"UTF-8"` (TeaVM knows only the canonical name; EC, ReadDataLib and WriteChemSyst use the alias).
4. TeaVM's `java.util.Formatter` implements only `b c d f h o s x`, so `%e`, `%g` and `%n` fail and `%f` goes through `DecimalFormat`. All `String.format(engl, …)` and `printf/format(engl, …)` calls are routed through `webec.Fmt`, which formats `e`, `f` and `g` with `java.util.Formatter`'s rules. On the JVM, `Fmt` and `String.format` gave identical strings in 575,530 comparisons (23 format specifiers, 25,023 values including zeros, ±0, subnormals and rounding boundaries).

TeaVM's in-memory file system supplies `java.io.File` and the stream classes, so EC's own file handling (reading `.dat` and `SIT-coefficients.dta`, writing `.out` and `.csv`) works unchanged.

### SED in the browser

`webpoc/web/sed.html` computes and draws SED diagrams in the browser: the user edits a `.dat` file (or picks one of six examples: the phosphate and carbonate fraction and log-concentration diagrams, the H₃PO₄/NaOH titration, and carbonate with Davies activity coefficients), gives SED's command-line options, and gets the diagram, the `.plt` file, the `.csv` table and SED's messages. A diagram with 101 points takes 30–75 ms in Chromium.

SED itself is a 3,500-line `JFrame`, so it cannot be compiled for the browser as it stands. The browser build generates a headless `SedWeb.java` from it at build time, in the same way as for Predom (next section): fifteen editor folds of `SED.java` are copied verbatim and its 37 Swing widgets become stand-ins with the same limits, including the integer division SED applies to the text-height scroll bar. A first version of `SedWeb.java` was written by hand from SED's command-line path; it gave the same output but duplicated about 950 lines of SED's logic, and it has been replaced by the generated class. Plot and Table are used unchanged apart from taking `SedWeb` where SED passes its frame. GraphLib uses `java.awt.Point`, `Line2D` and `Rectangle2D` as plain geometry, and the build points it at small stand-ins (`src/webec/awt`). The `.plt` file is drawn as SVG the way PlotPS reads it (code 0 move, 1 draw, 5 colour, 8 pen width; text from its stroked outline).

Seven inputs were run through the browser build (in Node) and through the native SED jar with the same options: `CO3_fract` (`-n=100`), `CO3_log` (`-n=100`), `H3PO4_fract` (`-n=100`), `H3PO4_log` (default, 50 steps), `titration_SED` (`-n=200`), `CO3_log` with Davies activity coefficients (`-n=80 -i=-1 -t=25 -m=0`) and `CO3_fract` with the simplified HKF model (`-n=60 -i=0.5 -t=50 -m=2`). In all seven, the `.csv` data rows and the `.plt` files are byte-identical to the native output.

Getting the plot files identical took three steps, all caused by TeaVM keeping Java `float` values as JavaScript doubles and ignoring `(float)` casts, while GraphLib and the two plot classes work in `float`. At first 135–291 lines per plot file were off by one plot unit (0.1 mm). Replacing GraphLib's four `Math.round((float)(v*100))` coordinate conversions with `webec.FloatMath.round`, which rounds through a real 32-bit float (`Float.floatToIntBits`) before applying Java's rounding rule, left 8–41 lines. The rest came from the float arithmetic that sets the paper scale and the text and label positions in `Plot.java` and `Plot_Predom.java` (*e.g.* `float xL = xAxl / (float)(xHigh - xLow);`, `yP = yOr - 3.6f*heightAx;`). `patch_plot_floats.py` rewrites them (31 patterns, 67 places in the two files) with `FloatMath.fround` after every single float operation. Since one float operation evaluated in double and then rounded to float gives the correctly rounded float result, this reproduces the JVM exactly; rounding only the end result of each expression, which I tried first, does not, and made some plots worse. TeaVM's `--strict` option did not change the output.

Two further TeaVM gaps showed up with SED: `String.format` calls without a locale (in Plot and Table) also need `%n`, so the format rewrite now covers all `String.format` calls and the PrintStream `printf`/`format` calls whose first argument is a locale or a string literal; and the date in the `.csv` header is written in UTC rather than local time (21:49 vs. 22:49 CET), since TeaVM's `SimpleDateFormat` does not use the browser's time zone.

### Predom in the browser

`webpoc/web/predom.html` does the same for predominance-area diagrams. Predom is also a single `JFrame` (3,718 lines), and `make_webclass.py` generates `PredomWeb.java` at build time from the upstream `Predom.java`, copying sixteen editor folds verbatim (`start`, `dispatchArg`, `readDataFile`, `checkInput`, `doCalculations`, the `HaltaTask` SwingWorker, `findTopSpecies`, the message methods and the small menu and label helpers). The 35 Swing widgets these methods touch become `webec.swing.Widget` stand-ins that keep the state the calculation reads back (label text, combo-box index, scroll-bar value clamped to the same limits as `JScrollBar`), and `JOptionPane`, `SwingWorker` and `SwingUtilities` become headless classes (`SwingWorker.execute()` runs `doInBackground()` and then `done()` on the calling thread). Besides renaming the class and dropping the GUI-only fields, the generator replaces four lines (the two `-keep` redirections to the text pane and the two AWT message boxes) and the three `javax.swing` class names; each change is checked by count, and any remaining `javax.swing` or `java.awt` reference stops the build. `Plot_Predom` and `PredomData` are used unchanged apart from taking `PredomWeb`.

Because `PredomWeb` is plain Java, it also runs on the JVM, which separates the two questions. On the JVM it gives `.plt` files byte-identical to the native Predom jar for six inputs: the Fe Pourbaix diagram with 60 and 150 steps, the haematite-free variant from the ModReaction test, Davies activity coefficients at *I* = 0.1, aqueous species only with the neutral-pH line at 60 °C (`-aqu -ph -t=60`), and a log[Fe]<sub>tot</sub>–pH diagram at pe 5. Compiled with TeaVM, it gives the same six files byte for byte. Before the float fixes above, the TeaVM build moved two or three area labels by one step of Predom's label-overlap search (0.6 mm): `double incrY = heightAx / 6;` is a float division in Java, and the 18th trial position of the "Fe3O4(cr)" label then fell on the other side of a comparison that the JVM decides by 1 × 10⁻⁸ cm.

In Chromium, a 101 × 101 grid (10,201 equilibrium calculations) takes 45–75 ms and a 401 × 401 grid 0.44 s. The page offers four Fe examples, and Predom's own warnings (for instance concentrations above 200 molal at the edges of an Eh–pH grid with activity coefficients) appear in the message pane as in the desktop program.

`make_webclass.py` handles both programs from one script; SED and Predom differ only in their package and frame names, Predom's extra `findTopSpecies` fold, and the tolerance combo box (Predom's has a blank tenth item). Generated from `SED.java`, `SedWeb` gives the seven SED test cases byte-identical `.plt` and `.csv` files (apart from the "file written" date) both on the JVM and compiled with TeaVM, as the hand-written class did, and SED's messages in the page now come from SED's own code, for instance the wall-clock time in SED's `00:00:00.409` format. With that, the browser build contains no hand-copied calculation logic; everything beyond the upstream sources is the TeaVM support code in `webpoc/src/webec` and the build-time patches.

The more durable fix remains upstream: splitting SED and Predom into calculation classes without Swing plus the existing frames, so that the desktop programs, a display-free command-line mode and the browser share one code path.


### Upstream split of SED and Predom (draft, 2026-11-25)

The local eq-diagr branch `calc-split` (commit `fed23dd`, not pushed; also as `patches/0001-…patch`) moves the calculation path of SED and Predom into `SedCalc` and `PredomCalc`, which use neither Swing nor AWT; the frames keep the widgets, events, dialogs and worker thread and talk to the calculation classes through a four-method `Display` interface. On a machine without a display, or with `-Djava.awt.headless=true`, `SED.main` and `Predom.main` make the diagram without opening a window. Against the jars from `master`, 20 of 20 output files (7 SED cases with `.plt` and `.csv`, 6 Predom cases) are byte-identical with and without a window, the console output is identical, and 24 edge cases and an interactive session in each window give the same results. `webpoc/build-web.sh` compiles `SedCalc` and `PredomCalc` directly when they are present, instead of generating headless copies, with the same byte-identical results in the browser. The proposal for the author, including three behaviours that the split keeps although they look unintended (integer text height, `-tol` rounded to a power of ten, a stale `Factor` after an error), is in `eq-diagr-split-proposal.md`.

### Database search in the browser (phase 1, 2026-11-25)

Commit `25bb8b1` on `calc-split` (patch `0002`) makes `DBSearch` free of Swing and AWT (details in `eq-diagr-split-proposal.md`). Reference data files were made with the original DataBase code by a harness that drives its window like a user; on 20 searches over the five release databases, the new window, the new methods without a display and the browser build give byte-identical `.dat` files (19 written, one stopped for missing 200 °C data in all versions). `webpoc/web/database.html` offers a periodic table, component selection, temperature, pressure, solid and redox options and H₂O, and writes the `.dat` file; a search takes 30–500 ms. Database files come either from the 10 kB sample in the repository (`DataMaintenance/Reactions.db`, copied into `web/data/sample/` by `build-web.sh`) or from the user's computer, read in the page only. `build-web.sh` adds the search (`src-db/webec/WebDB.java`, `db.js`) only when eq-diagr has the window-free `DBSearch`. The `.dat` file has no diagram section yet; setting up a diagram is phase 4 of the plan.

### One engine in a Web Worker (phase 2, 2026-11-25)

All programs now run from one TeaVM bundle, `web/engine.js` (3.6 MB), in a Web Worker (`web/engine-worker.js`), with a promise-based client (`web/engine-client.js`). The Java entry point `webec.WebEngine` has a few operations: writing, reading, listing and removing files in TeaVM's in-memory file system; running EC, SED, Predom, PlotPDF, PlotPS, ModChemSyst or ModReaction with their usual command-line options; the database search; and two operations on data files (`datRead` returns the chemical system and the diagram as JSON, `datSet` changes values such as a log *K*, the plot type or a concentration by name). `datRead` and `datSet` read and write with eq-diagr's own `ReadChemSyst` and `WriteChemSyst`, the way ModReaction does. Larger changes (deleting or exchanging a component, activating a reaction) go through ModChemSyst and ModReaction themselves. Nothing in eq-diagr changed for this phase. The console programs are copied at build time by `patch_console.py`, which:

- removes their AWT message box;
- has `getPathApp` fall back to the current directory, so `-clr2` uses the standard colours unless Spana's ini file is put there;
- rounds PlotPS's text-size estimate for EPS bounding boxes to single precision. Without this, one bounding box differed by a point, the same float effect as in the SED plots.

`node webpoc/tests/test-engine.js` runs the engine through the worker script and client in Node and compares with outputs of the desktop programs: EC 3 of 3, SED 7 of 7, Predom 6 of 6, database search 20 of 20, PDF and PostScript/EPS 9 of 9, ModChemSyst and ModReaction 7 of 7, and 4 model checks, including `datSet` giving the same file as `ModReaction -chws`. That makes 56 of 56 in 11 s. PDF and PostScript files differ only in their creation date and in the author field: the desktop writes the system user name, the browser writes "anonymous". The references were therefore made with `-Duser.name=anonymous`.

The four pages use the worker. The page stays responsive during a calculation (a 1001 × 1001 Predom grid left the page's timers within 1 ms), a Stop button restarts the worker, and the database files are written to the new worker again. The SED and Predom pages also offer PDF and EPS made by PlotPDF and PlotPS. Inside a worker there is no OK/Cancel box, so the database search goes on after its two possible warnings and the page lists them afterwards. When eq-diagr lacks the window-free `DBSearch`, `build-web.sh` builds the engine with a stub, and only the database search is then unavailable.

### The browser app: diagram setup, database tools, files and help (phases 3–7, 2026-11-25)

`webpoc/web/index.html` is now the front page. It leads to the database search (`database.html`) and to the diagram setup (`spana.html`); the SED and Predom pages remain for running those programs directly with their command-line options. Nothing in eq-diagr changed for these phases.

**Diagram setup (`spana.html`).** The data file is the only state. It is read with eq-diagr's reader (`datRead`), changed with its writer (`datSet`), and the chemical system is changed with ModChemSyst and ModReaction themselves. A file without a diagram section, such as a database result, gets Spana's defaults through the new engine operation `datDefaults`. This calls `DefaultPlotAndConcs.setDefaultPlot`, `setDefaultConcs` and `checkConcsInAxesAndMain` as `Select_Diagram` does.

- *Diagram:* all nine diagram types (Predom and the eight SED types), the X- and Y-axis components, the main or reference component, the Y range, Eh or pe, and the title.
- *Concentrations:* the concentration of each component (T, TV, LTV, LA, LAV). A component placed in an axis gets a varied range, and one taken out of the axes goes back to a fixed value.
- *Options:* number of steps, temperature, ionic strength, activity-coefficient model, tolerance, units, notation, text height, fraction threshold, aqueous species only, neutral-pH line, reversed axes.
- *Chemical system:* edit log *K*, switch reactions off and on, delete or exchange a component.
- *Output:* SVG, PNG, PDF and EPS (PlotPDF, PlotPS), `.plt`, `.csv` and `.dat`. Data files can be saved in the browser (IndexedDB, `store.js`).

The rules of `Select_Diagram` were not ported line by line. The page warns about inconsistent concentrations, and SED and Predom report what they cannot use. `node webpoc/tests/test-examples.js` checks the setup on the 17 example files installed with the desktop programs. Each file is set up twice: by writing back what was read, and from scratch (diagram section removed, Spana's defaults set, the example's settings entered). The diagram is then made, and in both cases all 17 plot files are identical to those of the desktop SED and Predom. The first run gave 15 of 17. Two examples with a reversed X axis had curve points one plot unit off. The cause was float arithmetic in `Plot.java` for curve points and for curves leaving the plot at the Y limits, which `patch_plot_floats.py` now also rounds per operation (38 expressions in `Plot.java`).

**Database page.**
- "Make a diagram…" hands the result to the diagram setup.
- The species found are listed with log *K* at the chosen temperature, the reaction and the reference codes. Unticking a species leaves it out of the data file, as clicking it does in the DataBase window; this is `database.WebSearchResults`, in the same package as `DBSearch`.
- The references file (`References.txt`, a Java properties file) is parsed in the page, because LibDataBase's `References` class needs AWT and `java.util.Scanner`, which the browser build lacks.
- Pressure is "pSat" (at least 1 bar, `IAPWSF95.pSat`) or 250 to 5000 bar, as in DataBase's temperature dialog.
- Loaded databases can be remembered in the browser.

**Database tools (part of phase 7).** A loaded binary database can be converted to the text format (`.txt` with `.elt`), with the same steps as DataMaintenance (`webec.DbTools`). The text files can be edited and loaded again. On the 14 test searches with `Reactions.db`, the converted database gives the same data files at 25 °C. At 80 °C one log *K* differs in the third decimal (OH⁻: −12.63 against −12.629), because the text format keeps fewer digits of the enthalpy data.

**Help.** `make_help.py` builds `help.html` from the JavaHelp contents and copies the 130 help pages of `Chem_Diagr_Help`.

**Tests.** `node webpoc/tests/test-engine.js` now passes 59 of 59, including the defaults, leaving species out and the text database. `test-examples.js` passes 17 of 17.

**Not done.**
- Spana's display window (zoom, its own colours from `Spana.ini`, printing) and the plot converters' layout options: margins, size, orientation and font. The pages pass `-noh` and colour or black-and-white.
- The detailed rules and remembered defaults of `Select_Diagram`, and Predom's single-area option.
- In the browser worker, the two search warnings are listed after the search instead of asking Continue/Cancel.

### Spana's advanced-mode options in the browser (2026-11-26)

Spana and DataBase hide some choices unless the user selects the advanced level (`advancedVersion` in `Spana.ini`, `advancedMenu` in `DataBase.ini`). The browser pages have no such switch and show everything. A comparison with the source showed that most advanced items were already on the pages. Three groups were missing; they were added in this step.

- *Calculation options* (Spana's "Calculation options" menu, `OptionsCalcs`): the tolerance for activity coefficients (`-tola`), program messages from SED and Predom (`-dbg`) with the HaltaFall debug level (`-dbg=N`), and the table file of SED: name extension, column separator and comment-line characters (`-tble`, `-tbls`, `-tblcs`, `-tblce`). The page passes them to SED and Predom as `Select_Diagram` does. Before this step the browser passed only `-tbl`, so its table used SED's own default separator (a semicolon), while Spana gives a comma; the page now gives Spana's defaults.
- *Moving a component up or down* and *merging two data files* (buttons that the "Modify chemical system" window shows only in advanced mode). The console program ModChemSyst has neither, so `webec.SysEdit` ports `upDownComponent`, `mergeTwoSystems` and `checkPlotInfo` from `spana.ModifyChemSyst`, without the window. The message boxes become an error (the files are not merged) or warnings listed under "Program messages".

**Tests.** `tests/sysedit/RefModify.java` drives Spana's own "Modify chemical system" window (compiled from master) to write reference files, answering its dialogs; `tests/sysedit/make-ref.sh` runs it. All 66 possible moves in the 17 installed examples and 14 merges give the same file as the window, including three merges that Spana refuses (a name used both as a component and as a reaction product, or the same complex with different stoichiometries) and the 30 log *K* warnings of one merge. Three new SED cases check the table and tolerance options against the desktop SED. `test-engine.js` passes 143 of 143 and `test-examples.js` 17 of 17.

**Observations on the desktop code**, kept as they are in the browser:
- A merge drops all comments of the reaction products (for example "/cuprite"), because `mergeTwoSystems` builds a new `ChemSystem` without copying `namn.comment`.
- Where both files give a concentration for the same component, the merged file takes the second file's, although the code comment says the first file's plot information is kept.
- The temperature or pressure of the two files may differ; Spana keeps the first file's and only prints a note when debugging is on. The browser lists it as a warning.

**Found while testing.** With 80 steps, 7 of the 81 rows of a SED table of logarithmic concentrations differ in the fifth significant digit from the desktop table (−12.862 against −12.863), at values that are exactly halfway between two printed values. The plot is identical. The probable cause is a one-ulp difference between a JavaScript and a Java math function; it was not followed further. With 100 steps (the existing test cases) the tables are identical.

### Database maintenance in the browser (2026-11-26)

A new page, `maintenance.html`, has the tools of DataMaintenance and AddShowReferences. It works on the same set of database files as the Database page:
- statistics and checks;
- the data for a single component;
- binary to text conversion;
- merging all databases into a single binary database (which also converts text to binary);
- adding or editing reactions and components in a text database;
- showing, adding and editing literature references.

**How.** The work is done by eq-diagr's own library code in the engine. CheckDatabases, AddDataElem, LibDB.getElements, LibSearch, Complex and References are compiled as they are, except for a few build-time changes made by `patch_dblib.py`:
- the window parameter that owns their message boxes becomes an `Object`;
- the message boxes print their text;
- the two list dialogs that the browser does not use are left out;
- `References.splitRefs` gets a stand-in for `java.util.Scanner` (`webec.Scanner`), which TeaVM lacks.

`webec.DbMaint` follows the steps of the window methods without the windows: `toBinary`, `startStatistics`, `doSearch` and FrameAddData's `addFile_SaveReaction`, `jListReact_Del`, `removeUnusedComps`, `componentSave` and `jListComps_Del`. The questions that the windows ask are asked by the page before each step.

The references file is read and written in the page (`web/properties.js`), following `java.util.Properties`. The keys are written in alphabetical order, as `lib.huvud.SortedProperties` intends. On Java 9 and later, `Properties.store` takes the entries from `entrySet()` and not from the `keys()` that SortedProperties sorts, so the desktop program writes them in hash order.

**Tests.** `tests/maint/RefMaint.java` drives DataMaintenance's windows (compiled from source) and answers their dialogs; `tests/maint/make-ref.sh` runs it on the cases in `tests/maint/cases.txt`. `tests/maint/PropsRef.java` gives the JDK's reading and writing of a properties file. Every case below matches the desktop output:

| Tool | Cases | Comparison |
|---|---|---|
| Merge into a single binary database | 4 merges of text databases | `.db` and `.elb` byte-identical, including the reactions with errors |
| Statistics | 3 files, among them the release `Reactions.db` with `References.txt` | report identical from "Total nbr reactions" on (the first lines name the files) |
| Single component | 4 searches | files identical |
| Add data | a 14-step FrameAddData session: reactions and components added, edited and deleted, a component that can not be deleted, unused reactants removed, an "@" exclusion | `.txt` and `.elt` identical after every step |
| References | the release `References.txt` and a file with escapes, continuation lines and the different separators | read and written as by `java.util.Properties` |

`test-engine.js` passes 159 of 159 and `test-examples.js` 17 of 17.

**One subtle point.** `Complex.compareTo` sorts the reactants of both reactions in place when the names are equal (ignoring case). The order of the reactants in DataMaintenance's merged database therefore depends on which pairs `java.util.TreeSet` compares. TeaVM's `TreeSet` compares other pairs, so the merge uses `webec.JdkTreeSet`, a red-black tree that makes the same comparisons as the JDK's. The first comparison gave 4 of 4 merges different, in the reactant order only.

**Bugs found in the desktop code:**
- *Merging a binary database adds nothing.* `toBinary` adds the reactions of a binary input database inside the loop over the reactions already read. Nothing is added from the first binary database, and a later one fails with a ConcurrentModificationException. The browser reads binary databases with the same rule as text databases: merging the sample `Reactions.db` gives the same 110 reactions as merging its text version.
- *Saving an excluded species writes a line the program cannot read.* FrameAddData writes the "@" exclusion as `@CaSO4;`, which `Complex.fromString` rejects ("missing data while reading delta-H").
- *Deleting a reaction can delete others.* `addFile_ComplexDelete` stops copying the file at the first line it cannot read and writes the file without the remaining lines. With an `@CaSO4;` line, deleting any reaction in the file also removed the reactions after that line, in the desktop session. The browser keeps such a line as it is (tested).
- `Statistics` writes reactant names longer than 20 characters with `String.format("  %s   %d", t, j+nl)`, which throws an IllegalFormatConversionException on the JVM.
- `FrameSingleComponent` removes the reactions excluded with "@CaSO4" by comparing the start of the text line, so "CaSO4(cr)" and "CaSO4·2H2O(cr)" are removed too. The browser does the same.

**Not done:** DataMaintenance's "sessions" (saved lists of databases). The browser remembers the set of files instead.

### One app window with menus, tabs and a normal/advanced mode (2026-11-26)

`app.html` puts the pages into one window, closer to the desktop programs than the scrolling pages were. It has a menu bar (File, Run, Database, View, Help), a sidebar with the data files kept in the browser and the database set, tabs and a status bar. The Chemical system tab is the database search, with the periodic table on the left and the selected components, options, Search and results on the right; "Make a diagram" opens a Diagram tab, one per data file, with the settings on the left and the plot filling the rest of the window under an export toolbar. Database tools (DataMaintenance and AddShowReferences) and Help are tabs too.

Each tab is one of the existing pages in an iframe with `?embed`. `app-view.js`, loaded by the pages, gives the page the app layout and connects it to the window: the page registers its commands for the menus, reports its status line and title, and hands a changed database set to the other tabs. Each tab keeps its own engine worker, so several diagrams can be open at once (each worker reads the 4 MB `engine.js`). Opened on its own, a page is shown as before, with all options; the regression tests do not depend on the layout (159/159, 17/17 examples).

Normal mode, the default, follows the advanced preference of Spana and DataBase (`pd.advancedVersion` and `advancedMenu`). Advanced mode is chosen with the switch in the menu bar or View > Advanced mode, and is remembered in the browser.

- Hidden in normal mode, as in Spana: the diagram title; the number of steps; the temperature (the file's temperature is used, as `Select_Diagram.enableTemperature` does); the activity coefficient model; the "aqueous species only" and "neutral pH line" options; the log activities and H⁺ affinity spectrum diagram types (unless the file has one); merging data files; moving components up or down; the calculation options (tolerances, table format, debugging).
- Hidden in normal mode, as in DataBase: the solids and redox options of the search, and the maintenance tools (the Database tools tab and its menu items).
- Hidden in normal mode by the browser only: the text of the data file and of the result table, the units, notation and text-height options, EPS and `.plt` export, and the "remember the files" setting.
- In normal mode, the options that are hidden are not used: the diagram is made with the defaults, so a value set earlier in advanced mode does not change a student's diagram unseen. This is a small departure from Spana, which keeps applying its calculation preferences in normal mode.

`webpoc/serve.py` serves `webpoc/web` with `Cache-Control: no-cache`, so a changed page is used at once (Python's `http.server` let the browser keep old copies).

### Bundled databases (2026-11-26)

The web app now comes with its databases (`webpoc/web/data`, see its README), so a student never has to find and load `.db` files:

- **The eq-diagr database** (`data/release`): `Reactions.db`, `Reactions.elb` and `References.txt` of release 0.4.0 (2025-11-10), copied from the installation; the GitHub repository holds only the small sample. 169 components, with enthalpy and heat-capacity data.
- **The KTH course database KD1280** (`data/kth`): `KD1280.skv` with `KD1280.elm`, from https://github.com/ignasi-p/eq-diagr-kth. It is in the ordinary text format (`.skv` is one of DataBase's text extensions), with 58 components and log *K* at 25 °C only. Its systems are kept small for teaching: Ca²⁺/CO₃²⁻/H⁺ gives 5 species, against 12 with the eq-diagr database. This is the default (since 2026-11-26, at the user's request; the eq-diagr database was the default before).
- **The small sample** of the source repository, and, in advanced mode, the release's alternative databases (Wateq4F, MintEQ v4, Medusa-Hydra, Soltherm, in `data/release/other_databases`).

The choice is in the Chemical system tab and in the Database menu. A bundled database is not copied into browser storage; only the choice is remembered, while files the user loads are remembered as before. A link can choose the database: `app.html?db=release` starts with the eq-diagr database (and `?db=kth`, `?db=sample` with the others) in a browser that has no other choice remembered.

The regression tests now read the databases from `data/release` instead of `/Applications/Eq-Diagr`, and three searches on the KTH database were added, with references made by the original DataBase window: 162/162. The installed-examples test (`test-examples.js`) still reads `/Applications/Eq-Diagr/Examples`.

**The haltaFall repository** (https://github.com/ignasi-p/haltaFall) holds the Fortran versions of HaltaFall (the 1984 subroutine and a Fortran 90 version) with the EC program, not Java. The web app does not need its code, since it runs the Java HaltaFall of eq-diagr. Its test cases are of interest, though: `ECf/tests-ECf` has a CO₃–Ca–NaCl and an Fe system with the Davies equation and a CaSO₄–Na–Cl system with SIT, each with PHREEQC input and output (`.pqi`, `.pqo`). They could check the browser's EC against an independent program.

### EC against PHREEQC and the Fortran EC (2026-11-26)

The test cases of the haltaFall repository (`ECf/tests-ECf`) are in `webpoc/tests/haltafall`, with `phreeqc.js` (reads PHREEQC output) and `compare.js`. They are the same three EC inputs as eq-diagr's `EC/tests`, with two further references: the Fortran EC, and PHREEQC 3.8.6. At all 11 points the browser's EC agrees with the Fortran EC to 1 part in 1000 (in practice 1 in 10⁵, apart from the SIT case, run with `-tol=1e-6`), and with PHREEQC to 0.002 log units for the SIT and Fe points. The suite has 22 new tests (184/184).

For the CO₃–Ca–NaCl points the two programs differ by up to 0.02 log units (pH 12.841 against 12.836 at I = 0.11). This is in the PHREEQC run, not in EC: the input comments out the `-gamma` lines to force the Davies equation, but PHREEQC keeps the WATEQ Debye–Hückel parameters of `wateq4f.dat` for CO3-2, Ca+2, OH- and HCO3- (log γ(CO3-2) = −0.233 at I = 0.0206 is the WATEQ value with a = 5.4; Davies gives −0.243). A pure Davies comparison needs those parameters removed from the species definitions that PHREEQC reads, not only commented out in the input. This may be worth telling the author, since the same input is in eq-diagr's `EC/tests`.
