# Development of the browser version of eq-diagr

*How the browser version of Spana, DataBase and the other eq-diagr programs was made, what it consists of, how it is checked against the desktop programs, and what a maintainer needs to know to rebuild or change it. Written in November 2026.*

## Origin and purpose

eq-diagr (Chemical Equilibrium Diagrams, https://github.com/ignasi-p/eq-diagr) is the Java software by Ignasi Puigdomènech that descends from the Medusa and Hydra programs of the Royal Institute of Technology (KTH) in Stockholm. Its programs are DataBase (search of the thermodynamic databases), Spana (diagram setup and display), SED and Predom (the calculations, built on the HaltaFall algorithm), PlotPS and PlotPDF (conversion of plot files), ModChemSyst and ModReaction (changes of a chemical system), DataMaintenance and AddShowReferences (database tools), and EC (single equilibrium calculations). The software is released under GPL-3.

The desktop programs need a Java installation, which has become an obstacle in teaching, where students bring their own laptops, tablets and Chromebooks. The purpose of this work was therefore a version that runs in a web browser without installation and without a server, for use in a course, in which the calculations are those of the desktop programs and not a new implementation. The author of eq-diagr approved that the code is modified for this.

The work started on 2026-10-26 with a review of the upstream sources (`eq-diagr-review.md`) and a command-line build of the programs (`build-cli.sh`, `test-cli.sh`), went on with a proposal to separate the calculations of SED, Predom and DataBase from their windows (`eq-diagr-split-proposal.md`, `patches/`), and reached a working engine in the browser on 2026-11-26. The app, its tests and its help were then developed in review batches, which are recorded in `REVIEW.md`.

## The approach: compile, do not rewrite

The calculation code of eq-diagr is compiled from Java to JavaScript with TeaVM 0.14.1 and runs unchanged in the browser. This choice decides most of the design. HaltaFall, the activity-coefficient models, the reading and writing of data files, the database search with its temperature extrapolation, the plot generation of SED and Predom and the two plot converters are the upstream classes. What is written anew is the interface: the pages, the drawing of plot files on the screen, and a small Java bridge between the upstream classes and JavaScript.

The alternative, a rewrite of the calculations in JavaScript, was not pursued, since it would have produced a second program whose results had to be validated species by species, and which would have to be kept in step with eq-diagr by hand. With the compiled engine, an update of upstream is a rebuild, and agreement with the desktop programs can be tested file against file (see "Verification").

## What is upstream code and what is new

| Part | Origin | Where |
|---|---|---|
| HaltaFall, activity coefficients, water properties, data-file reader and writer, plot library | upstream, unchanged | `LibChemDiagr` (compiled into `webpoc/web/engine.js`) |
| SED and Predom calculations | upstream, moved out of the window classes (branch `calc-split`) | `SedCalc`, `PredomCalc`; `patches/0001` |
| Database search | upstream, moved out of the DataBase window | `DBSearch`; `patches/0002` |
| PlotPS, PlotPDF, ModChemSyst, ModReaction, EC, database library | upstream, with the message boxes replaced by text output at build time | `webpoc/patch_*.py` |
| Bridge between the engine and JavaScript | new, Java, about 2,500 lines | `webpoc/src/`, `webpoc/src-db/`, `webpoc/adapters/` |
| App window, pages, drawing, storage | new, JavaScript without a framework, about 4,400 lines | `webpoc/web/*.js`, `*.html`, `*.css` |
| Help pages on the chemistry, the calculations and the file formats | upstream, unchanged (about 150 pages) | `webpoc/web/help/` |
| Help pages on using the programs | rewritten for the browser (37 pages) | `webpoc/help-web/` |
| Databases and example files | upstream releases, copied | `webpoc/web/data/` (sources in its `README.md`) |

The division matters for trust in the results: every number in a diagram comes from upstream code. The page code draws the plot file, fills in forms, and edits data files only through the upstream reader and writer, with two exceptions that are both checked by reading the result back with the upstream reader: the text editor of the data file, and the deletion of switched-off reactions.

## Separating the calculations from the windows

SED and Predom are each one Swing window class of about 3,500 lines, in which the command line, the HaltaFall loop and the plot output are interleaved with widget updates, and the database search of DataBase lives in its main window. Code of this shape cannot run without a display, and TeaVM has no Swing. The branch `calc-split` of eq-diagr therefore moves the calculation path of each program into a class without Swing or AWT (`SedCalc`, `PredomCalc`, and a `DBSearch` that reports through a small `Display` interface), while the window classes keep the window. The two commits are in `patches/` and described in `eq-diagr-split-proposal.md`. The desktop programs built from the branch write the same output files as those built from `master`: the plot files and tables of seven SED and six Predom inputs are identical byte for byte, and the data files of the database search agree; the proposal lists the comparisons.

These patches are a proposal to upstream and have not been merged. Until they are, the engine is built from a local clone of eq-diagr with the patches applied. `build-web.sh` also has a fallback (`make_webclass.py`) that generates window-free classes from the unpatched `SED.java` and `Predom.java`; the database search has no such fallback, and the engine is then built without it.

## The engine build

`webpoc/build-web.sh` copies the upstream sources into `webpoc/build/` (the clone is never modified), applies the browser-specific changes, compiles with `javac --release 8`, and runs TeaVM on the entry class `webec.WebEngine`. The result is one file, `webpoc/web/engine.js` (3.9 MB), which is committed, so that the app can be served and tested without Java.

The browser-specific changes exist because TeaVM's Java library is not the JVM's. Each was found through a test that compares output files with the desktop programs:

| Difference between TeaVM and the JVM | Consequence | Remedy at build time |
|---|---|---|
| `float` values are JavaScript doubles, and `(float)` casts are dropped | plot coordinates, which are computed in `float` and rounded to integers, differed in the last unit; in Predom a label could move by a whole step | `webec.FloatMath.round`, and `patch_plot_floats.py`, which rounds after each `float` operation in `Plot` and `Plot_Predom` |
| `Formatter` has no `%e`, `%g` and `%n` | numbers in tables and messages were not written | `String.format` and `printf` are routed through `webec.Fmt` |
| no `java.awt` | `GraphLib` uses `Point`, `Line2D` and `Rectangle2D` as plain geometry | stand-in classes in `webec.awt` |
| no Swing | message boxes, `SwingWorker` | text output and stand-ins (`webec.swing`, `patch_console.py`, `patch_dblib.py`) |
| the charset is known as "UTF-8" only | "UTF8" was not found | replaced in the copied sources |
| no file system of the computer | the programs read and write files | TeaVM's in-memory file system behind `java.io`, which the bridge fills and reads for the page |

One change at build time corrects a fault of the upstream code and is not specific to the browser: in `DBSearch`, a reactant of a text database that is in no element file should be reported by name, but the test of the message reads a variable that is null when the reaction is otherwise in order, so the search ended with a null pointer. `build-web.sh` adds the null test. It should be reported upstream.

A rebuild needs the eq-diagr sources (with the patches) in `eq-diagr/` and the TeaVM 0.14.1 jars in `webpoc/teavm-lib/`; both are git-ignored. The build also regenerates the test data, the example list and the help.

## Architecture of the app

The engine runs in a Web Worker (`engine-worker.js`), so that the page stays responsive and a long calculation can be stopped by ending the worker. The page talks to it through `EqDiagrEngine` (`engine-client.js`): it writes files into the engine's file system, runs an operation (`run sed`, `search`, `datRead`, `datSet`, …) and reads files back. A question that a desktop program would ask in a dialog stops the operation and comes back to the page, which asks the user and runs the operation again with the answer.

The app window (`app.html`, `app.js`) has a menu bar, a list of files, tabs and a status line. Each tab is a page of its own in an `<iframe>` (Chemical system, a diagram, the database tools, the help), with its own worker, and `app-view.js` connects a page to the menus of the window. The pages also work on their own, without the window, which is how they were developed first.

Data files and the user's database files are kept in IndexedDB in the browser (`store.js`), and preferences in `localStorage`. Nothing of them is sent to a server, and the app is a set of static files. The app window can report a page view to GoatCounter when it starts (`COUNTER` in `app.js`, the site code; empty means no counter, and addresses on the own computer are never counted). The script reports the address of the page, the referring page, the title and the screen width, without cookies; the About box says so when the counter is on.

A diagram is drawn by the page from the plot file that SED or Predom writes (`diagram.js`). With the default style the labels are text in a font, formatted as chemical formulas by `chemtext.js`, which reproduces the rules of the desktop `chemF` routine and is tested against it on 178 labels; the axes are redrawn from the axis data of the plot file, which allows other tick marks, a grid and a frame. With the "plotter" style the strokes of the plot file are drawn as the desktop programs draw them. The PDF is written by the page from the same model as the screen; EPS and PS files come from the upstream PlotPS.

`APP_OVERVIEW.md` describes all of this in detail: the menus with their handlers, the form fields, the state and where it is stored, and the known issues.

## Verification

The claim that the browser version calculates as the desktop programs do rests on tests that compare files, not on inspection.

| Test | What it compares | Result (2026-11-27) |
|---|---|---|
| `node webpoc/tests/test-engine.js` | EC against the reference outputs of upstream, and HaltaFall against PHREEQC and the Fortran EC (test cases of the upstream haltaFall repository); SED and Predom plot files, database searches, plot conversions and data-file changes against files written by the desktop jars; the drawing of labels against the desktop formula routine | 207 of 207 |
| `node webpoc/tests/test-examples.js` | the plot files of the 17 example files of the release against those of the desktop jars, byte for byte | 17 of 17 |
| `npm run test:ui` | 32 steps through the app in Chromium, WebKit and Firefox with Playwright, each with an empty profile | 32 of 32 in each |

The engine tests run the worker code in Node (`tests/node-engine.js`), so they need neither a browser nor Java. The example test needs Java and the desktop jars (`build-cli.sh`). Both are fast enough (about 30 s) to run after every change of the engine or of `diagram.js`.

Two limits of this verification should be stated. The comparison is with eq-diagr itself, so an error in eq-diagr would be reproduced faithfully. And the features that exist only in the browser version (see below) have no desktop counterpart to compare with; they are covered by the UI test and by checks of their own, for example that a kept diagram is redrawn from its unchanged plot file.

## Differences from the desktop programs

The app merges DataBase, Spana and the database tools into one window with tabs, and has a normal mode with the options that most diagrams need and an advanced mode with the rest, following the "advanced" preference of the desktop programs. The default database is that of the KTH course KD1280; the database of the eq-diagr release and four others are bundled.

Functions that the desktop programs do not have were added for teaching: a live mode in which the diagram follows the settings, with sliders for concentrations, log *K* values, the ionic strength and the temperature of the calculation; diagrams kept in the drawing with broken lines for comparison; coordinates and species read off the diagram at the pointer; a diagram style with fonts, colours, axes and page options; a link that carries a data file; colour themes; and a search in the help.

Databases in the format of CHESS (`.tdb`) can be loaded: `chess-tdb.js` converts them in the page to a text database and element file of eq-diagr (help page "Databases"). The CHESS files themselves are not part of the repository.

Constants that are in no database can be entered manually (File > New chemical system (manual input), help page "Manual input of constants"): `byhand.js` converts pKa or pKb values, stepwise or cumulative stability constants, solubility products and standard potentials (log K = n E° F/(RT ln 10), with e- among the reactants) to the accumulated formation constants of a data file, or of a text database with its element file. A species formed in one entry may be a reactant in another, as Fe(OH)2(s) from Fe 2+ when Fe 2+ is itself formed from Fe 3+ and e-: its reaction is put in its place, so that the components are the reactants formed in no entry. The desktop programs have the forms of DataMaintenance for single reactions, with accumulated constants only.

A few behaviours differ on purpose and are described in the help: a species without log *K* in a database is left out of a search with a note (the desktop DataBase stops); a log *K* changed in a diagram tab is not written by the automatic saves; and in the drawing the ionic strength is written above the concentrations so that the temperature keeps its place.

What the desktop has and the browser version has not is listed in `REVIEW.md` (section "Features of the desktop programs not in the browser version" and the sections after it). The main items are the batch mode and command line of SED and Predom, bitmap formats other than PNG, and vector formats on the clipboard.

## Rebuilding and updating

To run the app, serve `webpoc/web/` with any static file server (`python3 webpoc/serve.py 8765`, then `http://127.0.0.1:8765/app.html`). The pages need HTTP, since a worker and `fetch` do not work from `file://`.

To rebuild the engine after a change of the bridge or of upstream:

1. Clone eq-diagr into `eq-diagr/` and apply `patches/0001` and `patches/0002` (or check out a branch that has them).
2. Put the TeaVM 0.14.1 jars (`teavm-cli` with its dependencies, and the `classlib`, `jso`, `jso-apis`, `jso-impl`, `interop`, `platform`, `core` and `metaprogramming-api` jars) from Maven Central into `webpoc/teavm-lib/`.
3. Run `webpoc/build-web.sh`. It needs a JDK (11 was used) and Python 3.
4. Run the engine tests and the example test. A difference in a plot file after an upstream update is either a change of upstream, in which case the reference files in `webpoc/tests/` are regenerated with the desktop jars, or a new difference between TeaVM and the JVM, which needs a remedy of the kind listed above.

To change a help page for the web app, edit it in `webpoc/help-web/` and run `python3 -I webpoc/make_help.py eq-diagr webpoc/web`, which overlays these pages on the upstream help and writes the search index.

To publish the app, the content of `webpoc/web/` is all that a web host needs; `index.html` there opens the app. Browsers keep files for as long as the host allows, so after an update a user may run an old `engine.js` or see old help pages until that time has passed (ten minutes on GitHub Pages) or the page is reloaded.

## Publishing on GitHub Pages

The workflow `.github/workflows/pages.yml` runs the engine tests on every push to `main`. It publishes `webpoc/web/` as a GitHub Pages site after the tests only when publishing has been switched on, so a push to a repository that is not meant to be public yet publishes nothing. Nothing else is needed on the server side, since the app is a set of static files.

1. In the repository, open Settings > Pages and set "Source" to "GitHub Actions".
2. Under Settings > Secrets and variables > Actions > Variables, add the repository variable `PUBLISH_PAGES` with the value `true`.
3. Push to `main`, or start the workflow by hand (Actions > "Test and publish the app" > Run workflow). Its "publish" job shows the address, `https://<account>.github.io/<repository>/`. A link made with File > "Copy a link to this diagram" starts with that address.

A site on GitHub Pages is public, also when the repository is private (and private repositories need a paid plan for Pages).

## Open points

The repository and the app were made public on 2026-11-27 (https://mholmboe.github.io/eq-diagr-web/). These points are open at that date and concern the upstream author as much as this repository.

1. The bundled databases (`webpoc/web/data/release`, `kth`) and the 17 example files were copied from the desktop release 0.4.0 and from the eq-diagr-kth repository. Hosting them publicly should be agreed with Ignasi Puigdomènech.
2. The name. The app calls itself "Eq-Diagr", the name of the upstream project, and its tabs carry the names of the upstream programs in the help. See the note on the name below.
3. The patches in `patches/` are not upstream. If they are merged, `build-web.sh` works from a plain clone and the fallback generator can be removed.
4. The licence. The engine and the help are derived from GPL-3 code, so the repository is distributed under GPL-3 (`LICENSE`). `engine.js` also contains the TeaVM runtime, which is under the Apache licence 2.0.
5. The repository starts with a single commit of the state on 2026-11-27. The step-by-step history of the development is summarised in `REVIEW.md`; its commit numbers refer to the working repository before that date.

### A note on the name

The browser version is a derived program with an interface and functions of its own, and GPL-3 asks that a modified version is marked as such. A name that shows the lineage but cannot be mistaken for the original serves both, for example "Eq-Diagr Web" for the app and `eq-diagr-web` for the repository, with a line under the title that says "based on eq-diagr (Spana, DataBase, SED, Predom) by Ignasi Puigdomènech". The names Spana, DataBase, SED, Predom and HaltaFall then remain what they are: the names of the upstream programs, used in the help and in the messages where their code is at work. The final choice is the upstream author's to comment on.

## Credits and licence

eq-diagr and its help system are by Ignasi Puigdomènech, on the foundation of the Medusa and Hydra programs and the HALTAFALL algorithm of Ingri, Kakolowicz, Sillén and Warnqvist (1967). The KTH course database KD1280 comes from the eq-diagr-kth repository. TeaVM is by Alexey Andreev and contributors. The browser version, its bridge code, pages, tests and help pages were made by Michael Holmboe in 2026.

This repository is distributed under the GNU General Public License, version 3, as eq-diagr is.
