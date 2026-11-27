# Eq-Diagr in the browser

A browser version of **eq-diagr** (Chemical Equilibrium Diagrams, by Ignasi Puigdomènech, https://github.com/ignasi-p/eq-diagr, GPL-3): the programs DataBase, Spana, SED, Predom and HaltaFall with their database tools, compiled from Java to JavaScript with TeaVM and run in a Web Worker. The calculations are those of the desktop programs; the plot files of the 17 example diagrams are identical to the ones the desktop jars write. Files and databases stay in the browser, and nothing of them is sent to a server. The hosted app can count its visits with GoatCounter (`COUNTER` in `webpoc/web/app.js`; off when empty and on local addresses).

The app is written for teaching. Normal mode shows what a student needs to go from a periodic table to a diagram; advanced mode adds the remaining options of the desktop programs.

## Use it

The app is at https://mholmboe.github.io/eq-diagr-web/ and needs no installation.

## Run it locally

```bash
python3 webpoc/serve.py 8765
```

Then open http://127.0.0.1:8765/app.html. Any static file server works, since `webpoc/web/` has no build step of its own, but the pages need HTTP (not `file://`) for the worker and `fetch`.

## What it does

- **Chemical system tab** (DataBase): choose components in a periodic table, search the database (the KTH course database KD1280 by default; the eq-diagr database and others can be chosen or loaded), leave species out, and make a data file (`.dat`).
- **Diagram tabs** (Spana, SED, Predom): diagram type, axes and concentrations, with pH, pe or Eh entered directly; logarithmic, fraction, solubility, predominance (Pourbaix) and titration diagrams; exchange of components and switching reactions off.
- **Live mode**: with "Live" ticked the diagram follows every change, and each fixed concentration has a slider.
- **Reading the diagram**: the coordinates at the pointer, and for most SED diagrams the species at that X-value.
- **Diagram style**: font, text size, curve colours, line widths, tick marks, grid and frame; tick steps per diagram.
- **Output**: SVG, PNG, PDF, EPS, the plot file, the table of results, printing, and a link that carries the data file in its fragment.
- **Colours** of the program: as the computer, light, dark, or "original" after the desktop programs.
- **What if:** up to six earlier diagrams stay in the drawing with broken lines, named by what differs; in live mode the concentrations and the log *K* values have sliders.
- **pKa or log K:** the constants of the reactions are shown as the accumulated log *K* of the data file or as the stepwise pKa or pKb of each acid, and can be changed in either form.
- **Phones:** the elements as large buttons, explanations on tap, and the diagram in full screen.
- **Plot files and images:** a plot file (`.plt`) opens on its own; the diagram is copied to the clipboard as an image; the PNG size is chosen in the diagram style.
- **Data file as text** (advanced mode): the open data file can be edited in a text box and is read again by the programs, with their error messages.
- **Database tools** (advanced mode): statistics and checks, conversion, merging, adding data, references.
- **Help**: the help system of the desktop programs, with the pages on using the programs rewritten for the browser (`webpoc/help-web/`).

## Layout of the repository

| Path | Content |
|---|---|
| `webpoc/web/` | everything that is served: `index.html` (opens the app), `app.html` (the app window), the tab pages, `engine.js` (TeaVM output, committed), data, examples and help |
| `webpoc/src/`, `webpoc/src-db/`, `webpoc/adapters/` | the Java bridge between the eq-diagr sources and the browser |
| `webpoc/build-web.sh` | rebuilds `engine.js`; needs the eq-diagr sources with the patches in `patches/` and the TeaVM 0.14.1 jars (both git-ignored) |
| `webpoc/help-web/`, `webpoc/make_help.py` | help pages for the web app, and the script that overlays them on the upstream help |
| `webpoc/tests/` | engine tests, example tests and the UI test |
| `patches/` | the changes to upstream eq-diagr that separate the calculations from the Swing windows |
| `APP_OVERVIEW.md` | a detailed description of the app for a reviewer: architecture, menus, state, tests, known issues |
| `REVIEW.md` | review feedback: what was done in each batch, deviations and open questions |
| `eq-diagr-review.md`, `eq-diagr-split-proposal.md` | engineering notes and the proposal for upstream |

## Tests

```bash
node webpoc/tests/test-engine.js
```

194 tests of the engine through the worker code in Node: EC and HaltaFall against reference results, SED and Predom plot files against the desktop jars, the database search, the plot converters, data-file edits and the diagram rendering.

```bash
node webpoc/tests/test-examples.js
```

The 17 bundled examples against the desktop jars (needs Java and the git-ignored `jars/`).

```bash
npm install && npm run install-browsers
```

```bash
npm run test:ui
```

35 steps of the main flow in Chromium, WebKit and Firefox with Playwright (the test starts its own server; Chromium is the installed Chrome). `npm run screenshots` retakes the pictures in `review/`.

## Documentation

- `docs/DEVELOPMENT.md`: how the browser version was made, what is upstream code and what is new, how it is verified, how to rebuild the engine and how to publish the app on GitHub Pages.
- `APP_OVERVIEW.md`: the app in detail (architecture, menus, state, tests, known issues).
- `REVIEW.md`: the review batches with decisions and open questions.
- In the app: Help, with tutorials.

## Licence

GNU General Public License, version 3 (`LICENSE`), as eq-diagr. `webpoc/web/engine.js` contains the TeaVM runtime (Apache licence 2.0).

## Status

The bundled databases and examples come from the desktop release 0.4.0 and from the eq-diagr-kth repository; their place in this repository is to be agreed with the upstream author. The engine patches are a proposal and are not upstream. Known issues are listed in `APP_OVERVIEW.md`, section 9.
