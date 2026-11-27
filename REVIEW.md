*Note: this file was written while the app was developed, before this repository was started afresh with a single first commit. The commit numbers in its tables refer to that earlier history and are not in this repository.*

# Review feedback: implementation notes

Batch 1, 2026-11-26. Each item was implemented in the order given and committed on its own; the screenshots in `review/` were retaken afterwards (`npm run screenshots`). This file lists what was done, where it deviates from the request, what was found on the way, and the open questions to settle before the next batch.

Before the batch, the two fixes of the previous turn (concentration type switching, stale search result) were committed separately as `8b75ab2`, so that each review item has a clean commit.

## Items and commits

| # | Item | Commit |
|---|---|---|
| 1 | Stale plot: dimmed, with a "Settings changed – Make the diagram" badge | `16b4c1b` |
| 2 | Sticky "Make the diagram" bar in the settings column | `97c6c74` |
| 3 | `checkConcs()`: errors disable Make, warnings do not; type changes reset to the type default | `a12681d` |
| 4 | Chemical system tab: one primary button per state; neutral disabled primary | `db55650` |
| 5 | Reactions with tick boxes, no cut-off selects, "pSat", no empty Comment column | `f5abf89` |
| 6 | Plot cropped to the drawn area | `8568bcb` |
| 7 | `diagram.css` → `theme.css` with spacing, text and font tokens | `f4e2fd8` |
| 8 | Unsaved-changes mark = current `.dat` text ≠ last saved text | `ab53560` |
| 9 | `package.json` and a Playwright UI test in Chromium, WebKit and Firefox | `9c67d12` |
| – | Two fixes found while retaking the screenshots | `529bda9` |

Test status after the batch:
- `npm run test:ui`: 14 of 14 steps pass in Chromium, WebKit 18.4 and Firefox 137 (run twice after the last change).
- `npm run test:engine`: 185 of 185 pass.

## Deviations from the request

1. **Stale plot.**
   - The comparison is against a signature of the last run: the data-file text, the diagram form and the program arguments.
   - So the advanced options (temperature, ionic strength, steps and so on) count as changes too.
   - The colour option only redraws the plot, so it does not.
   - The mode is not part of the signature: switching to advanced mode with default options changes nothing.
   - The badge is a button that makes the diagram.
2. **Sticky bar.** It also works on the diagram page outside the app, where the whole page scrolls.
3. **Type defaults.**
   - The value is reset to the type default on *every* type change, not only varied ↔ fixed, because the units differ between types (total concentration, log, pH, pe, Eh).
   - Moving a component into or out of an axis now uses the same defaults.
   - This replaces the carry-over of values from `8b75ab2`.
   - The defaults follow upstream `DefaultPlotAndConcs`:

     | Type | Defaults |
     |---|---|
     | log activity (fixed) | pH 7, pe 8.5, log *P* −3.5, H₂O 0, otherwise −6 |
     | total concentration (fixed) | 1e-5 for cations, 0.01 for other components, 0 for H⁺ and e⁻ |
     | varied, H⁺ and e⁻ | pH 1–12; pe −15 to 15 or Eh −1 to 1 V |
     | varied, other components | log activity −10 to −1; log total −6 to −1; total 0 to 0.01 |

   - Errors and warnings mirror the checks in upstream `SedCalc`/`PredomCalc`.
     - A varied component outside the axes is an error for Predom, but only a warning for SED, as upstream.
     - "Y min must be below Y max" was added as an error.
4. **Fitting the concentration table into its column.** Two changes were needed in addition to the request:
   - Values below 1e-3 or from 1e6 are shown as `1e-6`.
   - The type "log total conc. varied" is now called "log total varied".
5. **Item 4:** the neutral style of disabled primary buttons applies to all pages, not only the Chemical system tab.
6. **Item 5:**
   - Unticked reactions are listed, struck through, at the end of the reactions table, where ticking them switches them on again. This mirrors the species found in a search.
   - While doing this I found that switched-off reactions were *also* listed among the active ones. That is fixed.
7. **Item 6:** the viewBox already followed the drawn lines; its margin was 0.4 cm and is now about 0.08 cm.
   - The visible white space came from the CSS, which forced the plot to the height of the pane and letterboxed it.
   - The plot now keeps its proportions, up to the pane height.
8. **Item 7, text scale:** it has six steps, not four.
   - `--text-xs` 11, `-sm` 12, `-md` 13, `-base` 14, `-lg` 15 and `-xl` 22 px. 14 and 22 px are used too often to fold into neighbours.
   - 16 px values became `-lg` (15 px); the two 17/18 px values stayed in px.
9. **Item 7, spacing:** values between the scale steps were rounded to the nearest step, ties upwards.
   - So some paddings grew by 2 px: 10 → 12 and 14 → 16.
   - Inline `style=""` attributes and the help-page stylesheet (`help-web/1_web.css`, in pt) were not converted.
10. **Item 7, fonts:** "Formula/code fields" are the fields with the class `formula` or `code` (the list is in `f4e2fd8`), plus all textareas.
11. **Item 8:** for a file not saved in this browser (opened from the computer, or an example), "last saved" is the text it was opened with.
12. **Item 9, browsers:** Chromium is Playwright's Chromium if installed, otherwise the installed Google Chrome (`channel: "chrome"`); only WebKit and Firefox are downloaded (`npm run install-browsers`, about 200 MB in `~/Library/Caches/ms-playwright`).
13. **Item 9, test runner:** the test uses `node:assert` and runs as plain Node, not `@playwright/test`, as `playwright-core` was asked for.
14. **Item 9, screenshots:** `review/make-screenshots.js` was merged into the test (`--screenshots=review`) and removed.

## Found and fixed along the way

- **`form is null`:** a field of a diagram tab changed before its data file had been read threw this error. It was found by the UI test in all three browsers, and such changes are now ignored.
- **Stale value on redraw (Chrome):** Chrome fires a pending `change` for a field while the concentration table is being redrawn, which could write the old value into the new row. This is now ignored.
- **Unsaved after a quick Make:** "Make the diagram" read the unsaved-changes mark to decide whether to save, but the mark follows an edit 120 ms later, so a quick Make could leave the file unsaved. It now compares the texts.
- **Cut-off fields (two regressions):** the new paddings, and then the new select widths, cut off concentration values and type names. The table now has fixed column widths. A check that measures the option text confirmed nothing is cut off in eight examples.

## Open questions

1. **Type defaults vs carry-over.** Resetting on every type change is what you asked for. Should switching between types of the same kind keep the value instead, for example pH 7 → "pH varied" 5 to 9?
2. **Text scale.** Is the six-step text scale acceptable, or do you want it reduced to four steps (folding 13 and 14 px together)? That would change the look slightly.
3. **Empty plot area.** After a file is opened but before the first diagram, it still says "Open a data file, or make one with the database search". Should it say "Click Make the diagram"? This is a small change I noticed but did not make.
4. **Where to run the UI test.** There is no CI. Should it go into a GitHub Actions workflow (that needs a remote), or stay a local `npm run test:ui`?
5. ~~Diagram fonts and colours (your question 10).~~ Done in batch 2, below.
6. **Still open from earlier:** whether the bundled eq-diagr release databases may be served publicly (to be confirmed with the upstream author).

## Question 10: fonts, font size and curve colours in the diagrams

**Can the font be changed to something more modern?** Yes.
- Today every label is drawn from the line strokes that SED and Predom write into the plot file. That gives the plotter-style lettering.
- The plot file also keeps each label as text, with its position, size (e.g. 0.35 cm), angle (0° or 90°) and alignment (left, centre, right), in `TextBegin … TextEnd` blocks.
- So the web diagram can draw the labels as real SVG text in any font, and skip their strokes.
- The desktop Spana does the same when "Font" is not "None" (Preferences / Diagram windows: serif, sans-serif or monospaced).
- One step is needed: labels are stored as chemical names (`Fe 2+`, `Fe(OH)2(cr)`) with a few codes (`` `TOT' `` for a subscript, `$` for µ). The formatting into sub- and superscripts has to be done when drawing. Upstream has this logic in Java (`DiagrPaintUtility`, class `ChemFormula`, in LibChemDiagr), so it can be compiled into the engine or ported, rather than rewritten.

**Can the user change the font, the size and the colour scheme?** Yes; the desktop program already allows all three.

| Setting | Proposal |
|---|---|
| Font | sans (a modern default, e.g. the system UI font or a bundled open font such as Inter, so exports look the same everywhere), serif, monospaced, or "plotter" (today's strokes) |
| Text size | a scale (e.g. 80–150 %); advanced mode already has SED's "text height" option, which changes the layout itself |
| Curve colours | presets: the eq-diagr palette (today), a colour-blind-safe palette (Okabe–Ito), black and white; optionally the 11 colours one by one, as on the desktop |
| Line width | optional, as on the desktop |

The settings would live in the diagram tab (or a View menu item), apply to all diagrams, and be remembered in the browser.

**Exports, which is the decision needed:**
- SVG and PNG are made from the screen picture, so they would follow automatically.
- PDF and EPS are made by the upstream PlotPDF/PlotPS. These know only Times, Helvetica and Courier (`-f`), black and white or their own palette, and no user colours.
- There are two ways to make them follow:
  - **(a)** Pass the nearest font (`-f`) and accept that colours and font differ slightly from the screen.
  - **(b)** Make the PDF from the SVG in the browser with a small library (e.g. svg2pdf.js + jsPDF, about 300 kB). The PDF then matches the screen exactly, and EPS stays as it is.

**Estimate:**
- About a day: parsing the text blocks, chemical formatting, the settings and their storage, and tests.
- Plus half a day for option (b).

I recommend the sans default with the presets, and (b) for PDF.

## Batch 2: diagram fonts, text size, colours and PDF (question 10)

Not yet committed; done in this order. Engine tests 188/188 and UI test 15/15 in Chromium, WebKit and Firefox.

**What was done**
- **Labels as text.** `webpoc/web/chemtext.js` is a line-by-line port of the desktop label formatting: `chemF` and `replaceMinusSign`, plus the `~ $ ^` substitutions of `PrintFormula`.
  - For all 178 labels of the 15 example plot files, and some extra cases, it gives exactly the result of the Java `chemF`.
  - The reference output is in `webpoc/tests/chemtext/`, and `test-engine.js` (group Style) checks it.
- **Drawing.** `diagram.js` now has `parsePlt()`, which reads lines and labels (TextBegin/TextEnd) from a plot file, and draws from it.
  - With a font, labels are SVG `<text>` with sub- and superscript runs (0.9 × size, as on the desktop).
  - Labels are aligned on the extent of their own strokes, so they sit where the plotter lettering was.
  - The frame includes the measured label boxes.
  - The "plotter" style draws the strokes as before. sed.html and predom.html keep it.
- **Diagram style.** `Style…` above the diagram, or View > Diagram style…, has four settings:
  - labels: sans-serif (default), serif, monospaced, or plotter lines;
  - text size: 80–150 %;
  - curve colours: eq-diagr, colour-blind safe (Okabe–Ito, then Tol), or black and white;
  - lines: thin, normal or thick.
  - The style is the same for all tabs, remembered in the browser, and followed by open tabs at once.
  - The "colour" check box of the Options is replaced by the black-and-white palette.
- **PDF.** `pltToPdf()` writes a one-page PDF in the page itself, with no library. It contains the lines in the style's colours and widths, and the labels in the matching standard PDF font (Helvetica, Times or Courier), with sub- and superscripts as text rise.
  - Checked by rendering the PDFs with macOS `sips`: they look like the screen.
  - EPS still comes from PlotPS (plotter lines; black and white when the style is black and white).
- **Help pages updated:**
  - the diagram, including a new "The diagram style" section;
  - exporting and printing;
  - normal and advanced mode;
  - making a diagram;
  - the titration tutorial;
  - PDF.
- **Overview:** APP_OVERVIEW.md is updated too.

**Deviations from the proposal**
- **No bundled font.** The sans-serif style uses Helvetica/Arial rather than a bundled font such as Inter, and no PDF library was added.
  - The PDF uses the 14 standard PDF fonts, which need no embedding.
  - The screen uses the metric-compatible system fonts: Helvetica/Arial, Times New Roman and Courier New.
  - This keeps the app free of dependencies, and the PDF identical in layout to the screen.
  - A bundled font would need embedding in the PDF (font file plus subsetting, about 300 kB or a library).
- **No per-colour editing.** The 11 colours cannot be edited one by one; there are three palettes.
- **Text size.** It is a factor on the drawn labels. SED's "Text height" option (advanced) still changes the layout itself.
- **Unencodable characters in the PDF.** The PDF fonts use WinAnsiEncoding, plus Symbol for Δ and a few Greek letters. A character outside these would show as "?". No label of the examples has one.

**Open questions**
1. Should the default stay sans-serif, or be the plotter lines, as the desktop programs draw them by default?
2. Should EPS also be written in the page, like the PDF, so that it follows the style too? Or should EPS go, now that SVG and PDF cover vector output?
3. Do you want the 11 colours editable one by one, as on the desktop, or are the three palettes enough?
4. Labels that overlap curves (e.g. "FeOH⁺") sit where SED put them, as on the desktop. Moving them is a matter for SED, or for editing the SVG.

## Batch 3

Batch 2 was already committed (`40a2fc8`) when batch 3 arrived, so there was nothing to commit first. Batch 3 was done in the order given, one commit each. Requests that came in during the batch were committed separately; they are listed after the items.

| # | Item | Commit |
|---|---|---|
| 1 | "Settings changed" badge in the toolbar row, right, next to Style… | `ac5fa97` |
| 2 | Program messages printed once | `435ec8d` |
| 3 | No label cut off: test for 17 examples × 3 fonts × 150 %, and fix | `1282d9a` |
| 4 | Sticky Make bar: border and shadow only while settings scroll under it | `aae7fd0` |
| 5 | Merge: a button with a chooser | `1a17eac` |
| 6 | Type switching keeps the value for the same quantity | `0ecea09` |
| 7 | Empty plot after opening a file: "Click Make the diagram" | `b81f09f` |
| 8 | Help and overview: non-embedded PDF fonts; EPS keeps the plotter lettering | `146f194` |

**Done on request during the batch**
- **Faster start with the KTH database (`71da933`).**
  - The components of text databases are read in the page, so the periodic table no longer waits for the 3.9 MB engine. They are identical to the engine's result, which is now tested.
  - The KTH files are fetched once instead of three times.
  - Through a server limited to 10 Mbit/s, the periodic table is usable after 0.5 s instead of 3.9 s; at 50 Mbit/s, after 0.5 s instead of 1.3 s.
  - A first search still waits for the engine: 0.53 MB if the host serves it gzipped, 3.9 MB otherwise.
- **Periodic table.**
  - e⁻ is a cell, "e⁻", in the H row and the Ti column (`436a8ab`, `03e5d9b`).
  - There is no water button any more (`911ec80`, `83f5a22`). Water is a component only with the advanced option "include H2O as a component".
  - The advanced "other" button under e⁻ remains only for databases with other components not linked to an element, such as Pm³⁺, Cf³⁺, Cm³⁺ and Bk³⁺ in Medusa-Hydra.
- **Water question and warning (`8bc5ed8`).**
  - Choosing water as a component first explains that it is needed only to model the activity of water in concentrated solutions (gypsum).
  - The diagram tab warns when H2O is a component and no ionic strength is given.
- **Sulfate in the KTH database (`fb5b690`).**
  - Every KTH search with SO₄²⁻ stopped, because KD1280.skv has no log K for H2SO4. The desktop DataBase stops in the same way.
  - The search now leaves out species without a log K, with a note, and continues. A UI test step covers it.

**Deviations and notes**
- **Item 1:** the badge is in the toolbar row (the alternative you named), so it can never cover the plot. On narrow screens the row wraps.
- **Item 2:** the cause was a double capture.
  - The desktop SED and Predom print most messages both to their message window and to the console, and the engine sent both streams to the same log.
  - The fix (`DedupLog`, with a rebuilt `engine.js`) keeps the message-window stream. It drops a console line only when it repeats a line just written there.
  - The log therefore equals the text of the desktop message window: the console output, plus a few lines the desktop shows only in the window, such as "Saving plot file…".
  - It was compared with the desktop jar's output. Console-only debug lines are kept.
- **Item 3:** the check found 25–32 labels outside the drawing.
  - All were subscripts at the bottom (for example "Log [Cl⁻]TOT") or superscripts at the top. More in WebKit, whose text boxes are slightly taller.
  - The frame now uses each run's own size and shift, with the font's full ascent and descent, and 3 % extra width.
  - The check runs in all three browsers.
- **Item 4:** the border is shown when settings are hidden under the bar (detected with an IntersectionObserver on a marker after the bar). It is not shown when the end of the settings is in view.
- **Item 6, quantity pairs:** "log total ↔ log total varied" has no fixed counterpart: the data files have no fixed log total concentration, only "log total varied". Changing to or from it therefore resets to the default.
- **Item 6, the rules:**
  - Varied → fixed gives the middle of the range.
  - Fixed → varied gives a range of the default width centred on the value, moved inside these limits:

    | Quantity | Limits |
    |---|---|
    | pH | 0–14 |
    | pe | −25 to 25 |
    | Eh | −2 to 2 V |
    | log activity | −20 to 1 |
    | log *P* | −20 to 2 |

  - A total concentration becomes 0 to twice the value (for H⁺ and e⁻: value ± its magnitude).
  - Moving a component into or out of an axis follows the same rules.
- **Item 7:** opening a file in a tab also clears an earlier diagram of that tab and disables its export buttons.

**Open questions**
1. **Range limits (item 6).** Are the limits above right for teaching, or should, for example, pH be allowed down to −2 (SED warns below that)?
2. **Engine download.** Should the dev server (`serve.py`) also serve gzip-compressed files, to try the speed of a real host locally?
3. **KTH H2SO4.** Should it be reported upstream (eq-diagr-kth), or given a log K in the bundled copy? The bundled copy is unchanged for now.
4. **Medusa-Hydra.** Its Pm³⁺, Cf³⁺, Cm³⁺ and Bk³⁺ have no element in its element file, so they appear under "other". Is that worth a note to the upstream author?

## Batch 4: axes of the diagrams

Requested as "tick steps, tick style and more such options"; done as agreed: tick style, grid and frame in the shared Style dialog, tick steps per diagram in advanced mode. Committed as `1878c72`. Engine tests 193/193; UI test 17/17 in Chromium, WebKit and Firefox.

**What was done**
- **Axes drawn by the page.** The plot file marks its axis block (`-- AXIS --`: frame, ticks, numbers) and records the axis lengths, the origin and the low and high value of each axis.
  - `diagram.js` (`withAxes`) leaves that block out and draws the axes itself. This applies with a font only; the plotter style keeps the program's axes.
  - By default nothing changes visibly: the same tick values (read from the program's numbers), ticks inside, and the program's frame (SED: two axes; Predom: a box).
  - The axis titles move with the numbers, so they never overlap.
- **Style dialog, new "Axes" group** (all diagrams, both modes):
  - tick marks: inside, outside or crossing;
  - minor ticks: none, 2 or 5 per step;
  - grid lines: none, at the numbers, or at all ticks;
  - frame: as the programs, axes only, or a box with the ticks repeated on top and right;
  - axis lines: thin, normal or thick.
- **Tick step per diagram** (Options, advanced mode): a step in the units of each axis, or empty for the program's ticks. It redraws at once without a new calculation, and does not mark the plot as out of date.
- **Exports:** SVG, PNG and PDF follow. EPS and `.plt` keep the program's axes.
- **Tests:**
  - an engine test of the tick values, grid and box;
  - UI test steps for the grid and a tick step;
  - the label-clipping check also runs once with ticks outside, minor ticks, a grid and a box.
- **Docs:** help ("The diagram": style table and a new section on tick steps; making a diagram; exporting) and APP_OVERVIEW.md are updated.

**Deviations**
- **Axis ranges** are not in the Style dialog. They are part of the calculation (the range of the X-axis component, and Y min/Y max) and stay in the diagram settings. The help says so.
- **Tick steps are kept in the browser for the data file** (IndexedDB `settings`, key `ticks:<file name>`), not in the `.dat`. The data-file format has no field for them, and the files should stay readable by the desktop programs. A downloaded `.dat` therefore does not carry them.
- **Tick steps are ignored in normal mode**, like the other advanced options.
- **A step that would give more than 200 ticks** is ignored (the program's ticks are used).
- **Number format** (decimals, 10ⁿ) is not a separate option. With a given step, the numbers get the decimals of the step (2.5 → −7.5, −5.0, …). Otherwise the program's own numbers are used.
- **Axis-title size** follows the text size of the style; there is no separate setting.

**Open questions**
1. Should tick steps also apply in normal mode once they are set (the diagram then looks the same in both modes), or stay advanced-only?
2. Is a separate number format (fixed decimals, or scientific notation on linear concentration axes) needed?
3. Grid colour and style are fixed (light grey, solid). Is a dashed or darker grid wanted for printing?

## Overnight pass (2026-11-27): review of the app, colour themes, live mode and other additions

Requested as an open brief: go through the app, fix bugs, update the documentation and help, consider new features (a live view with sliders was named), and add colour themes (light, dark, original). All of it is committed locally in six commits and nothing is pushed. Engine tests 193/193; UI test 22/22 in Chromium, WebKit and Firefox.

| Commit | What |
|---|---|
| `43c8017` | Review pass: one-click elements, marked selection, Predom defaults, round range limits, remembered search options |
| `bfe3b19` | Colour themes: as the computer, light, dark, original |
| `07da6a4` | Live mode with sliders; coordinates and cross-hair on the diagram |
| `bc3525c` | Species at the pointer; files dropped on the window; printing the diagram |
| `af7e481` | A link to a diagram that carries the data file |
| `0ad020e` | Live mode on narrow screens: the diagram stays above the settings |

**Review pass: what was found and changed**
- **Selecting components took two clicks for every element**, also for the elements that have a single component in the database (Na, Cl, e⁻). Such an element is now selected by the click on the element. Elements with several components (Fe, Cu, C, S) still list them.
- **The periodic table did not show what was selected.** Elements with a selected component are now filled with the accent colour.
- **Switching to a predominance diagram with e⁻ in the system** left a metal on the Y-axis. e⁻ now goes to the Y-axis (the Pourbaix arrangement), and the main component is the one with most species rather than the first in the list (which was often Na⁺).
- **A fixed value turned into a range** gave limits such as Eh −0.497 to 1.503 V. The limits are now rounded (0.1 V for Eh, half a unit otherwise), and Eh is shown with three decimals.
- **On a phone the diagram was made out of sight**, below the settings. The page now scrolls to it.
- **The search options** (temperature, pressure, solids, redox) were forgotten on reload; they are now kept in the browser.

**New: colour themes** (View > Colours)
- "As the computer" (the default, as before), "Light", "Dark" and "Original".
- Original uses colours read from the Java sources of Spana and DataBase: grey panels, dark blue (`#000099`) titles and accent, purple (`#990099`) for warnings, square buttons with the light gradient of Swing, Tahoma, and the periodic table on the yellow (`#ffff99`) panel of DataBase.
- Text on accent-coloured buttons was white in the dark theme, on a light blue (contrast about 2.6:1). It is now dark there (token `--on-accent`).

**New: live mode** (the "Live" tick beside Make the diagram)
- Every change of a setting makes the diagram again; the stale badge and the dimming are kept for settings in error.
- A slider under each fixed value: pH, pe, Eh, log *P* and log activity between the limits of the quantity; total concentrations on a logarithmic scale from 10⁻⁹ to 10 mol/kg; H⁺ and e⁻ totals linearly around zero.
- One calculation runs at a time, and the wait before the next follows the time of the last (40 ms to 1 s). The examples tried (first diagram, fixed CO₂ pressure, the Cu Pourbaix diagram) take 15 to 60 ms per diagram on the development Mac, so the diagram follows the slider while it is dragged (16 diagrams during a one-second drag in the test).
- The data file is saved two seconds after the last change, not for every diagram.
- On a narrow screen the diagram stays in the upper half of the tab and the settings scroll under it.

**New: reading values off the diagram**
- The pointer (or a touch) shows the coordinates in the units of the axes under the diagram, with a cross-hair on the screen only.
- For SED diagrams of fractions, solubilities, log concentrations and log activities a second line lists up to six species at the pointer's X, interpolated from the table of results.

**New: smaller additions**
- **A link to a diagram** (File > Copy a link to this diagram): the data file travels in the URL fragment, compressed. Opening the link opens the file and makes the diagram. Meant for handing a prepared system to a class.
- **Drag and drop**: `.dat` files and database files dropped anywhere on the window.
- **Printing** (File > Print the diagram, Ctrl/⌘+P): the diagram alone.
- A favicon for the app window.

**Documentation**
- Help: "Making a diagram" has a section on live mode; "The diagram" describes the readout; "Files in the browser" describes the link; "Working with the app" has the colours, dropping files and the print shortcut; "Exporting and printing" describes printing; the first-diagram tutorial ends with the readout and the slider; "Searching the database" and the two redox tutorials follow the one-click selection.
- `APP_OVERVIEW.md`: workflow, menu table, form inputs, state table, tests, known issues and the verbatim appendices (menu array, `theme.css`, `app.html`, the Chemical system form) follow the code.
- `README.md` is new: what the repository holds, how to run and test the app.

**Deviations and decisions made without asking**
- **The diagram stays black on white in the dark theme**, and so do the help pages. The diagram is a document that is exported and printed as shown; its colours belong to the diagram style.
- **Sliders are shown in live mode only.** Without live mode a slider would only raise the stale badge, and the table stays as compact as it was for students.
- **Sliders exist for fixed values only**, not for the two ends of a varied range or for Y min and Y max.
- **Slider ranges are the limits of the quantity**, not a window around the current value. For pH this is 0 to 14 in steps of 0.1; for log activities −20 to 1, which is coarse on a short slider (the arrow keys move one step).
- **Live mode saves the file** (after two idle seconds), in line with Make, which always saved. Dragging a slider therefore changes the stored file.
- **A shared link makes the diagram at once** on opening, although an opened file normally waits for Make.
- **The species readout is interpolated** from the table (51 points by default) and is left out when the table is not in the units of the axes. Predom diagrams show coordinates only.
- **The readout sits under the diagram**, not in a tooltip at the pointer, so that it never covers a curve and works with touch.
- **The single-click selection applies to H⁺-like cases too**: an element with one component that is already selected only shows its component.
- The request named "light, dark, original"; "As the computer" was kept as a fourth choice and remains the default, since it was the behaviour until now.

**Not done (considered, left for a decision)**
- A normal-mode control for the ionic strength (none, fixed, calculated). It changes the chemistry shown to students and deserves a decision on the default.
- The predominant species at the pointer in Predom diagrams. It needs either a point calculation per pointer position or the grid of the calculation, which the plot file does not carry.
- Zoom by dragging a rectangle on the diagram (it would rewrite the axis ranges and recalculate).
- Sliders for temperature and for the ends of the axes.
- A dark variant of the diagram and of the help pages.

**Open questions**
1. Should "Original" imitate the desktop programs more closely (the exact button and panel colours on Windows), or is the present approximation enough? It was built from the colour constants in the Java sources, not from a side-by-side comparison.
2. Should live mode be on by default for new users? It is off, so that the first diagram of the tutorial is still made with a click.
3. Should live mode save the data file at all, or only Make and File > Save?
4. Is the link format acceptable for the course (a long address, data in the fragment), or would a short link through a server be wanted later? The present form needs no server.
5. Should the slider of a total concentration cover a narrower range around the value (finer control) instead of 10⁻⁹ to 10 mol/kg?

## Text editor for the data file (2026-11-27)

Advanced mode has a button `Edit .dat…` beside the export buttons, and the same command under File > "Edit the data file as text…". It opens the text of the data file, with the settings of the form written into it, in a text box.

- **Apply** reads the text with the same two engine calls as File > Open (`datDefaults`, then `datRead`). The data file of the tab is replaced only when both succeed; otherwise the message of the programs is shown under the text and the line they name is selected.
- **The file is rewritten by the engine**, as on opening. Comments after the reactions survive; the comment of the first line is regenerated by the programs.
- **Not saved on Apply.** The tab is marked as changed and the diagram shown is marked out of date (or made again in live mode); the file is saved by Make or File > Save, as after the other changes of the chemical system.
- **Cancel and Escape ask** before discarding a changed text.
- The read-only "Data file (.dat)" section under the diagram is kept as it was.

Tests: one new UI step (read error, discard question, apply, hidden in normal mode); 23 of 23 pass in Chromium, WebKit and Firefox. Screenshot `review/17-edit-data-file.png`.

The button is in both places since the question was put: `Edit .dat…` in the export row and "Edit the data file as text…" beside "Merge with another data file…" in the Chemical system section, both opening the same editor.

## GUI pass: sizes, placement and normal mode (2026-11-27)

Every screen was photographed in normal and advanced mode at 1360, 1024 and 390 px, and all visible buttons, lists and fields were measured (height, width, text that does not fit).

**Found and fixed**
- **Three control heights in one row.** Lists were 36 px, text fields 29 px and number fields in tables 24 px, so "X-axis component" stood taller than "Y min" beside it. Fields and lists are now 32 px, those in tables 28 px.
- **Secondary buttons as heavy as the main one.** "Load your own files…", "Download .dat", "Merge with another data file…", "Download Statistics.txt" and others were 40 px and bold, as "Search" and "Make the diagram". Only the main action of a form keeps that size (38 px); other buttons are 32 px in medium weight.
- **Buttons that were too small.** The ↑ ↓ × buttons of the database list were 25 × 18 px, the move arrows of the components 20 × 23 px and "delete" 23 px high; all are now at least 26 px. On touch screens every control is 4 px higher.
- **Text cut off in lists.** "default (simplified HKF)", "as the programs (SED: axes, Predom: box)" and the HaltaFall debugging levels did not fit; the first two are shorter, the debugging list has the full width.
- **Labels of two lines** ("Tolerance for activity coefficients", "Comment lines start with") pushed their field below its neighbour. The labels are shorter and the fields of a row are aligned at the bottom.
- **Settings below the diagram at 1024 px.** With the file list open, a 1024 px window stacked the two columns as on a phone. They now stay side by side down to a tab width of 701 px, and the settings column narrows from 380 to 300 px.
- **Concentration table.** The header "Value or from" took two lines and a fixed value showed an empty, disabled "to" field. The header is one cell, "Value, or from – to", and the unused field is hidden. The five-line note is one line, with the details in its tooltip and in the help.
- **Buttons shown too early.** "Download .db and .elb" and "Use it instead of the databases above" were visible before any merge, because `.row { display: flex }` overrode the `hidden` attribute. A global rule fixes this for all elements.
- **Empty controls.** Without a binary database the conversion tool showed an empty list; it now says so and is disabled. An empty "Program messages" box is not drawn.
- **Tables of the Chemical system section** were laid out as a grid by the shared class name `grid`; they are tables again, and the log *K* fields have a fixed width.

**Fewer controls in normal mode**
- Chemical system tab: "Load your own files…" (still in the file list and the Database menu), "Download .dat" (still under File) and the pressure are shown in advanced mode only. Normal mode has the database, the periodic table, the temperature, Search and "Make a diagram…".
- Diagram tab: "allow reversed axes" is an option of advanced mode. Normal mode keeps the ionic strength under Options.

**Considered and left**
- The export row keeps one button per format. A single "Export" list would be more compact but costs a click for the most common action.
- The Options box of the Chemical system tab now holds the temperature alone in normal mode; it was kept as a box so that the place of the options is the same in both modes.
- Several blue buttons in the Database tools ("Make the statistics", "Search", "Merge"): each is the main action of its own section.

Tests after the pass: 193 engine tests, 17 examples, 23 UI steps in Chromium, WebKit and Firefox. Screenshots 01 to 17 retaken.

Open questions: (1) should the temperature also move to advanced mode, since the default KTH database has data for 25 °C only? (2) Should "Download .dat" return to normal mode on the Chemical system tab if students hand in data files?

## Features of the desktop programs not in the browser version (2026-11-27)

The menus, dialogs and options of the desktop Spana, DataBase and DataMaintenance were listed from the Java sources (`MainFrame`, `Disp`, `Select_Diagram`, `OptionsGeneral`, `OptionsDiagram`, `OptionsCalcs`, `DiagrExport`, `DiagrConvert`, `ModifyChemSyst`, `LogKchange`, `FrameDBmain`, `ShowDetailsDialog`, `DataMaintenance`) and each item was looked up in the web app. Calculations, diagram types (all nine), the database search with its options, the changes of a chemical system, the database tools and the references are covered and are not repeated here.

**Missing, and possible in a browser**

| Desktop feature | Where in the desktop | State in the web app |
|---|---|---|
| Open and display a plot file (`.plt`) | Spana, File > Plot file > Open; list of plot files in the main window | Added afterwards, see the next section. |
| Copy the diagram to the clipboard | Diagram window, Copy as (image, EMF, WMF/EMF in RTF, MacPict) | A PNG copy was added afterwards, see the next section; EMF and WMF are not possible. |
| Size and format of the bitmap export | Diagram window, Export to bitmap file (formats of Java ImageIO, width and height in pixels) | The size was added afterwards, see the next section; PNG is the only format. |
| Page options of the PDF and PS conversion | Diagram window, convert to (size in %, margins, portrait or landscape, font, header line, PS or EPS) | PDF as on the screen and EPS with the defaults of PlotPS; none of the page options. |
| Pen colours and background | Preferences > Diagram windows (a colour for each pen with reset, colour / black on white / white on black, "print colours", line thickness for printing) | Three fixed palettes and three line widths; no custom colours, no white on black, printing uses the screen style. |
| Free aspect ratio | Preferences > Diagram windows, "Keep diagram's aspect ratio", "Constant size (21x15)" | The diagram always keeps its proportions. |
| Diagram name | Diagram setup, "Diagram name" | The diagram and its files are named after the data file. |
| Save as defaults | Diagram setup, "Save as defaults"; the preferences are kept in an ini file | The diagram style, the mode, the theme and the search options are remembered; the calculation options of a diagram tab (steps, tolerances, activity model, table format) are not. |
| Table of results on or off | Diagram setup, "write a file with table of results" | SED always writes the table (the readout on the diagram needs it). |
| Details of a reaction | DataBase, right-click > show Details (reaction, log *K*° at 25 °C and at *t*, *p*, Δ*H*°, Δ*C*p°, highest temperature for extrapolation, references in full, comment) | Added afterwards (click a species name), see below. |
| Delete reactions for good | Modify chemical system, "Delete reactions" (several at once) | Reactions are switched off with a tick box and stay in the file with a "*"; removing them needs the text editor. |
| The list of database files in normal mode | DataBase, Data > Database files (add, remove, order) | Normal mode replaces the whole set with "Load…"; adding, removing and ordering are in the Database tools of advanced mode. |
| Session files | DataMaintenance, Open session / Save session | The set of databases is remembered in the browser; there is no session file to hand to somebody else. |
| Search and index of the help | JavaHelp window | A search was added afterwards, see below; there is no index of keywords. |
| Two diagrams side by side | One window per diagram | One tab is visible at a time; two browser windows work. |

**Present in another form**
- Ionic strength "fixed / calculated": one field, where −1 means calculated.
- "Edit" a data file in a text editor: the text editor of advanced mode.
- "Add name to list" and "Save as": the file list and File > Save data file in this browser.
- "Show messages and errors", "Verbose output": the "Program messages" section and the debugging options.
- "Search and Exit": "Make a diagram…".

**Not applicable in a browser**
- Run > file Explorer and command Prompt; the paths to SED and Predom, to the program for new data files and to the text editor; file associations for `.dat` and `.plt`; a single running instance; running the jar files in a separate process and keeping their windows open; window sizes; antialiasing; locating the diagram-making program from DataBase.
- Batch mode and the command-line options of SED and Predom. The desktop jar files remain the way to run those.

**Not in the desktop either** (listed earlier as missing by mistake): zooming in the diagram.

Suggested order if these are taken up: opening plot files, the clipboard copy and the PNG size are small and useful in a course; the details of a reaction and a help search come next; the page options of the PDF conversion and custom pen colours are larger.

## Three of the missing features added (2026-11-27)

- **Plot files.** File > "Open data or plot file…", the "Open…" button of the file list and dropping a file accept `.plt`. The file opens in a tab with the drawing alone (no settings column); SVG, PNG, PDF, EPS, `.plt`, Copy, printing, the readout of coordinates and the diagram style work. A text that is not a plot file gives a message and no tab. Plot files are not kept in the browser: the desktop Spana lists them beside the data files, here they are opened from the computer each time.
- **Copy.** A "Copy" button above the diagram and File > "Copy the diagram as an image" put a PNG on the clipboard. Vector formats on the clipboard (EMF, WMF) are not possible in a browser.
- **PNG size.** The diagram style has "PNG image, size (long side)": 800, 1200, 1600 (as before), 2400, 3200 or 4800 pixels, for the PNG file and for the clipboard.

Tests: one new UI step (24 in all). The clipboard is replaced by a recorder in the test, since WebKit and Firefox give a test no clipboard access; in Chrome the real clipboard was read back by hand (1600 × 1402 and 800 × 701 pixels for the Cu Pourbaix example, from the button and from the menu).

Not done: other bitmap formats (JPG, BMP, GIF), since PNG serves the same uses.

## Details of a reaction and a search in the help (2026-11-27)

- **Details of a reaction.** A species name in the result of a search is a link. It opens a window with the reaction, log *K*° at 25 °C, log *K*° at the temperature and pressure of the search when these differ from 25 °C and 1 bar, Δ*H*° and Δ*C*p° (or a note that a six-parameter function or a table of values is used), the temperature and pressure up to which the data are valid, the reference keys with the full references, and the comment. This is the content of "show Details" in the desktop DataBase. The engine was rebuilt for it: `WebSearchResults.details` now also returns `equation`, `logK25`, `deltaH`, `deltaCp`, `analytic`, `lookUp`, `tMax` and `pMax`.
- **Pressure in normal mode.** Since the pressure field is shown in advanced mode only, a search in normal mode now always uses pSat, also when another pressure was chosen earlier in advanced mode.
- **Search in the help.** A field above the contents lists the pages that contain all the words typed, with the pages that have the words in their title first and a line of text around the first match. The index (`web/help/search.json`, 130 pages, 238 kB) is written by `make_help.py` and read at the first search. Whole words are not required ("precip" finds "precipitation"); there is no index of keywords as in JavaHelp.

Tests: one new engine test (194) and two new UI steps (26), passing in Chromium, WebKit and Firefox. Screenshots `19-reaction-details` and `20-help-search`.

Still open from the list above: the page options of the PDF conversion, custom pen colours and white on black, a free aspect ratio, a diagram name, saved defaults for the calculation options, the table of results on or off, deleting reactions for good outside the text editor, the list of database files in normal mode, session files, and two diagrams side by side.

## Kept diagrams, log K sliders and the rest of the desktop features (2026-11-27)

**Kept diagrams (what if)**
- "Keep" above the diagram keeps the diagram shown; the next diagrams of the tab are drawn over it. Up to six are kept. Kept curves have broken lines (one pattern per kept diagram), lighter colours and no labels, and are clipped to the axes.
- A kept diagram is mapped to the present axis ranges, so the pH range or the Y range may change between the diagrams. A diagram with other quantities on the axes is not drawn, and the legend says so.
- The legend under the diagram is generated from what differs: concentrations, log *K*, reactions switched on or off, ionic strength, temperature, steps, activity model. A click on a name under the drawing replaces it with a typed one.
- The kept diagrams and the legend are in the SVG, PNG and PDF files, the clipboard image and the print. EPS and PS files do not have them, since PlotPS draws the plot file alone.
- They belong to the tab and are not saved.

**Sliders for log K**
- In live mode each log *K* of the Chemical system section has a slider: three units to each side of the value the file was opened with, steps of 0.05. The table is not redrawn while a slider moves.
- A changed log *K* is bold, and a ↺ button takes it back to the value the file was opened with. The original values are remembered for the open tab only.
- The changed value is saved with the data file, as a typed value is. This is the main thing to decide: see the open questions.

**Desktop features added**
| Feature | Where |
|---|---|
| Page of PDF and PostScript files: diagram alone, A4 or Letter; portrait or landscape; margins; size in %; header line; EPS or PS | Style… > PDF and PostScript page |
| Own colours for the eleven pens, and white on black | Style… > Curve colours |
| Proportions of the diagram | Style… > Width (75 to 150 %); the lettering keeps its shape |
| Diagram name for the exported files | Diagram section (advanced) |
| Saved defaults for the calculation options | Options > Save as defaults, Program defaults (advanced) |
| Table of results on or off | Options > Table of results (advanced) |
| Deleting reactions for good | Chemical system > Delete the unticked reactions… (advanced) |
| Adding database files in normal mode | Loading files asks: add, or use instead |
| Session files | Database tools > Save session…, Open session… |

**Left out, with the reason**
- Bitmap formats other than PNG: PNG serves the same uses.
- Separate colours and line width for printing: the print is the diagram as shown, with the diagram style.
- Two diagrams in separate windows: the kept diagrams compare them in one drawing, and two browser windows work.
- An index of keywords in the help: the search covers it.
- Removing and ordering database files in normal mode: this stays in the Database tools, to keep normal mode small.

**Decisions made without asking**
- The width changes positions along X only; the desktop option stretches the diagram to the window instead.
- "Save as defaults" does not include the temperature, the title, the diagram name or the tick steps.
- The page options of the PDF live in the diagram style and are reset by "Default style".
- Loading database files now always asks "Add" or "Use instead" when databases are in use (one more click than before).
- A session file holds the database files themselves (base64 in JSON), since a list of paths means nothing in a browser.

Tests: 194 engine tests, 17 examples, 31 UI steps in Chromium, WebKit and Firefox (five new steps). Screenshots `21-kept-diagrams` and `22-white-on-black`.

**Open questions**
1. Should a log *K* changed with a slider be saved with the data file at all? An alternative is to keep slider changes out of the stored file until the user saves explicitly.
2. Are six kept diagrams enough, and should the labels of the kept curves be drawn as well (smaller, in the lighter colour)?
3. Should "Keep" be in the Run menu only, to keep the row of buttons above the diagram short? It is in both places now.

## Designer comments and the saving of log K (2026-11-27)

- **Names.** "Search" is "Search reactions", "Make a diagram…" is "Create a diagram", and "Make the diagram" is "Plot the diagram" (button, Run menu, the badge "Settings changed – Plot the diagram", status texts and help). The diagram types are listed without "(SED)" and "(Predom)".
- **Both axes in the table.** The row of the component in the X-axis was marked "X-axis" while the Y-axis of a SED diagram, which is not a component, was not shown there. The table of concentrations now ends with a "Y-axis" row that says what the axis shows (log concentration, log solubility, pH calculated, …) and holds the two range fields, which were "Y min" and "Y max" in the Diagram section. A fraction diagram has the row without a range. In a predominance diagram both axes are components and are marked as before.
- **A changed log K is a trial.** The saves that the app makes by itself (when a diagram is plotted, and in live mode) leave out the log K values changed in the tab, whether by slider or typed. The status line says so, and the tab stays marked as changed. File > "Save data file in this browser", or "Save" when the tab is closed, writes them; they are then the values of the file. The downloaded `.dat` and a link carry the values as shown. A log K changed in the text editor is part of the file.
- **Tables of kept diagrams.** With kept diagrams, the `.csv` file has the table of the diagram shown followed by the tables of the kept ones, each under a comment line with its legend name. The `.dat` file remains the present data file; the data files of kept diagrams are not exported.
- The buttons above the diagram are a little narrower, so that "Style…" stays in the row at a pane width of about 500 px.

Tests: 32 UI steps in Chromium, WebKit and Firefox. The pointer readout step polls now: in Chromium the first pointer move after a diagram appeared was not delivered in some runs (two of five here), which made that step and the two after it fail.

## Sliders for the ionic strength and the temperature (2026-11-27)

- In live mode the ionic strength (0 to 1 mol/kg, under Options) and, in advanced mode, the temperature of the calculation (0 to 100 °C) have a slider under their field. A note under the table of concentrations says where the other sliders are (log *K* under Chemical system, ionic strength under Options).
- The temperature slider changes the activity coefficients and the Eh scale only. The log *K* values of a data file belong to the temperature of the database search and do not follow it; the field has a tooltip that says so, and the help explains it.

Not done: a temperature slider that recalculates the log *K* values. It needs the database search to run again for every position (with a database that has enthalpy data, which the default KTH database has not), and the result would replace the data file of the tab.

## Button bar at the top, a steady drawing in live mode, and the texts above the diagram (2026-11-27)

- **"Plot the diagram" and "Live" are at the top** of the settings column, above the Chemical system section, and stay there while the settings are scrolled under them (before: at the bottom of the column).
- **The drawing does not jump in live mode.** When an ionic strength is given, the programs write the temperature on a new line above the diagram, so the drawing got taller and the axes moved. In live mode the frame of the drawing now keeps room for that line from the start, and it never shrinks while the axes stay the same (`steadyFrame` in `diagram.js`; the page keeps the frame of the drawings of the file so far). Without live mode the drawing is as tight as before. The texts themselves stay where the programs put them: the temperature still moves up a line when the ionic strength appears, into the room kept for it.
- **Texts above the diagram can be left out.** Style… has three tick boxes: concentrations, temperature, ionic strength (both modes; the question asked for advanced mode at least). They apply to the screen and to the SVG, PNG and PDF files; EPS, PS and `.plt` keep all texts, since they are the plot file of the programs.

Decision made without asking: the heading options are in the diagram style, which is shared by all diagrams of the browser, not a setting of one diagram.

- **The temperature keeps its place** (added after a comment on the above): with an ionic strength, the programs write "I=" where the temperature was and move "t=" to a new line. In the drawing of the app the two change places (`headingOrder` in `diagram.js`): the temperature stays where it is without an ionic strength, and "I=" is on the new line above the concentrations. Checked on six examples (SED and Predom, one to four concentrations), where the programs always follow that rule. EPS, PS and `.plt` files keep the order of the programs.

## Constants as individual steps (2026-11-27)

The data file holds accumulated constants (H₃PO₄ from 3 H⁺ and PO₄³⁻: 21.702), while students know an acid by its steps (pKa 2.15, 7.21, 12.35). Above the reactions table, "Constants shown as" now chooses between "accumulated log K" and "individual steps (pKa)".

- In the individual view each species that is a step of an acid shows the pKa of that step, marked "pKa" with the reaction in its tooltip. For the phosphate system of the KTH database: 2.149, 7.207, 12.346, and pKw 14 for OH⁻. Hydrolysis of a metal ion is shown the same way (Fe²⁺ + H₂O ⇌ FeOH⁺ + H⁺, 9.1 in the first example file).
- The field, the slider of live mode and the ↺ button work on the step. A changed step moves the accumulated log K of its species and of those further out in the chain, so the other steps keep their values.
- Species that are not a step (a metal–ligand complex, a solid, a gas, two species with the same stoichiometry) keep their accumulated log K, marked "log K".
- The data file is unchanged in format: it always holds accumulated values. The choice is remembered in the browser.

Decision made without asking: the steps are always written as acid dissociation (pKa). A view in base constants (pKb) or in stepwise formation constants of metal complexes (log K₁, log K₂ for ligands other than H⁺) was not added.

- **Wording** (after a comment): the choice reads "accumulated log K" and "stepwise pKa". The values are pKa = −log Ka; "log Ka" would have the opposite sign (−7.207 for H₂PO₄⁻), and pKb values are not shown.

- **"Create a diagram" beside "Search reactions"** (after a comment): the two buttons of the Chemical system tab are in one row above the species found, so the second one is in view without scrolling past a long result. Before a search it is there but disabled.

- **pKb as a third choice** (asked for): "stepwise pKb" shows pKw − pKa for each step, the pKb of the base of that step, with pKw from the reaction of OH⁻ in the data file. Phosphate in the KTH database: 11.851, 6.793 and 1.654 in the rows of H₃PO₄, H₂PO₄⁻ and HPO₄²⁻. The row of OH⁻ is marked "pKw" in both stepwise views. Fields, sliders and the reset button work on the pKb.

## Phone pass: Chemical system and diagram tabs (2026-11-27)

Checked at 390 × 844 with touch emulation in Chrome, and in the UI test at that size in Chromium, WebKit and Firefox. Not checked on a real phone.

- **Elements.** At phone width the periodic table had cells of 19 × 23 px with 9 px text. Below 521 px the elements that the database has are now a wrapped grid of buttons of 46 × 42 px, in the order of the table with H and e⁻ first (34 buttons for the KTH database). The periodic table itself is not shown at that width.
- **Explanations on tap.** Texts that carry an explanation as a tooltip (the reaction of a species, the pKa mark, a reference, a table header) show it in a bubble when tapped. Buttons, lists, fields, links and the labels of fields keep their own action and show no bubble, so the explanations of field labels remain out of reach on a touch screen.
- **Full screen.** A "Full screen" button above the diagram (small or touch screens) shows the diagram alone, without the menus, tabs and status bar; turning the phone gives a wider diagram. "Close full screen" and the Escape key leave it.
- **No zoom on focus.** With a touch screen the fields have 16 px text, since iOS Safari zooms the page when a field with smaller text gets the focus.
- The hint under the diagram says "Touch the diagram…" on a touch screen.

**Not done in this pass:** a bottom bar in place of the menus and tabs; sheets in place of the long settings column and the style dialog; the system share sheet for exports; installation to the home screen with offline use; a phone layout of advanced mode.

Open question: is the grid of elements the right start for students on a phone, or should a search field for components ("iron", "sulfate") come first?

## Visit counter for the hosted app (2026-11-27)

The app window can report a page view to GoatCounter when it starts. It is switched off until the site code is written into `COUNTER` in `webpoc/web/app.js`, and it never counts on addresses of the own computer, so local use and the tests are not counted. One view is counted per start of the app, not per tab. The script (`gc.zgo.at/count.js`, read on 2026-11-27) reports the path of the page, the referring page, the page title and the screen width, and not the part of the address after "#", where a link to a diagram carries its data file. When the counter is on, the About box says so; the README, the development document and the help page on files mention it.
