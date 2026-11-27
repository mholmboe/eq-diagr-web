// Shared page logic for sed.html and predom.html. The calculations run in the
// eq-diagr engine in a Web Worker (engine-client.js, engine-worker.js), so the
// page stays responsive and a long calculation can be stopped.

// Standard colours and pen widths of PlotPS (eq-diagr), plot units: 100 = 1 cm.
const PALETTE = ["#000000", "#ff0000", "#954300", "#0000ff", "#008000", "#c88c00",
                 "#ff00ff", "#000080", "#808080", "#00a6ff", "#8000ff"];
const WIDTHS = [2.82, 6.35, 0.07, 1.06];

// Diagram styles: the font of the labels ("plotter" = the line strokes of the
// plot file, as before), a text size factor, the colours of the curves, and a
// line width factor. Colour 1 is black (axes and frame) in every palette.
const PLOT_PALETTES = {
  eqdiagr: PALETTE,
  // colour-blind safe: Okabe & Ito (2008), then Tol's muted scheme
  safe: ["#000000", "#d55e00", "#0072b2", "#009e73", "#e69f00", "#cc79a7",
         "#56b4e9", "#882255", "#117733", "#332288", "#999933"],
  bw: new Array(11).fill("#000000"),
  // white on black (as the diagram windows of the desktop Spana can be set)
  wb: new Array(11).fill("#ffffff")
};
// The colours of the pens: one of the palettes, or the user's own eleven
// colours (palette "custom", style.colors).
function plotPalette(style) {
  if (style.palette === "custom" && Array.isArray(style.colors) && style.colors.length === PALETTE.length &&
      style.colors.every(c => /^#[0-9a-f]{6}$/i.test(c))) return style.colors;
  return PLOT_PALETTES[style.palette] || PALETTE;
}
const plotBackground = style => style.palette === "wb" ? "#000000" : "#ffffff";
// a colour moved towards another (t = 0: the colour, 1: the other)
function mixColor(hex, other, t) {
  const c = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16)), a = c(hex), b = c(other);
  return "#" + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, "0")).join("");
}
const PLOT_FONTS = {
  sans: { css: "Helvetica, Arial, sans-serif", pdf: "Helvetica" },
  serif: { css: '"Times New Roman", Times, serif', pdf: "Times-Roman" },
  mono: { css: '"Courier New", Courier, monospace', pdf: "Courier" },
  plotter: null
};
// axes (with a font only): ticks "in", "out" or "cross"; minor ticks per step (0, 2, 5);
// grid "none", "major" or "all"; frame "program" (as SED or Predom draws it), "axes" or "box"
// pngSize: the long side of the PNG image (file and clipboard), in pixels;
// colors: the eleven pen colours of the palette "custom"; xScale: the width of
// the diagram relative to the one of the programs; pdf...: the page of the PDF
// and PostScript files ("fit": the diagram alone; "a4" or "letter" with the
// margins in cm from the lower left corner), their size in % and a header line
const PLOT_STYLE_DEFAULT = { font: "sans", textScale: 1, palette: "eqdiagr", lineScale: 1,
                             ticks: "in", minor: 0, grid: "none", frame: "program", axisWidth: 1, pngSize: 1600,
                             colors: null, xScale: 1,
                             pdfPage: "fit", pdfLandscape: false, pdfScale: 100, pdfLeft: 1, pdfBottom: 1, pdfHeader: false,
                             psKind: "eps", headConc: true, headTemp: true, headIonic: true };
const PLOT_STYLE_KEY = "eqdiagr.plotStyle";
function plotStyle() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(PLOT_STYLE_KEY) || "{}") || {}; } catch (e) {}
  return Object.assign({}, PLOT_STYLE_DEFAULT, s);
}
function setPlotStyle(s) {
  try { localStorage.setItem(PLOT_STYLE_KEY, JSON.stringify(s)); } catch (e) {}
}

// Read a .plt file as PlotPS and Spana do: column 1 = code, columns 2-5 = x,
// 6-9 = y, the rest a comment. 0 = move, 1 = draw, 5 = colour, 8 = pen width.
// A label is a "TextBegin" comment (formula flag, size, angle, alignment), its
// text on the next line, and its strokes up to "TextEnd" (Spana's Disp).
function parsePlt(plt) {
  let col = 0, pen = 0, cur = null, pendingMove = true, x = 0, y = 0, label = -1;
  // sections (GraphLib.axes): "axis" (frame, ticks, numbers), "ytitle", "xtitle", then "plot"
  let sec = "plot", kind = "sed", axis = null;
  const paths = [], labels = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const grow = (a, b) => { if (a < minX) minX = a; if (a > maxX) maxX = a; if (b < minY) minY = b; if (b > maxY) maxY = b; };
  const lines = plt.split(/\r?\n/);
  for (let k = 0; k < lines.length; k++) {
    const line = lines[k];
    if (!line.length) continue;
    const s0 = line.substring(0, 1).trim(), s1 = line.substring(1, 5).trim(), s2 = line.substring(5, 9).trim();
    const i0 = s0 ? parseInt(s0, 10) : -1, i1 = s1 ? parseInt(s1, 10) : 0, i2 = s2 ? parseInt(s2, 10) : 0;
    let comment = line.length > 9 ? line.substring(9).replace(/\s+$/, "") : "";
    if (comment.startsWith(" ")) comment = comment.substring(1);
    if (/^-- PREDOM DIAGRAM --/.test(comment)) kind = "predom";
    const newSec = comment === "-- AXIS --" ? "axis" : comment === "Y-AXIS TEXT" ? "ytitle" : comment === "X-AXIS TEXT" ? "xtitle"
      : sec !== "plot" && /^-- .* --$/.test(comment) ? "plot" : null;
    if (newSec && newSec !== sec) { sec = newSec; cur = null; pendingMove = true; }
    let m;
    if ((m = /^Size, X\/Y length & origo:\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)/.exec(comment)))
      axis = Object.assign(axis || {}, { size: +m[1], xLen: m[2] * 100, yLen: m[3] * 100, x0: m[4] * 100, y0: m[5] * 100 });
    if ((m = /^X\/Y low and high:\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)/.exec(comment)))
      axis = Object.assign(axis || {}, { xLow: +m[1], xHigh: +m[2], yLow: +m[3], yHigh: +m[4] });
    if (i0 === 5 || i0 === 8) {
      let p = Math.max(1, i1) - 1;
      if (i0 === 5) { p = p % PALETTE.length; if (p !== col) { col = p; cur = null; pendingMove = true; } }
      else { p = p % WIDTHS.length; if (p !== pen) { pen = p; cur = null; pendingMove = true; } }
      continue;
    }
    if (i0 === 0 && comment.length > 41 && comment.startsWith("TextBegin")) {
      let angle = parseFloat(comment.substring(35, 42)) || 0;
      while (angle > 180) angle -= 360;
      while (angle < -180) angle += 360;
      const a = comment.length > 55 ? comment.substring(55, 56).toUpperCase() : "L";
      let text = lines[k + 1] && lines[k + 1].length > 9 ? lines[k + 1].substring(9).replace(/\s+$/, "") : "";
      if (text.startsWith(" ")) text = text.substring(1);
      labels.push({ x: i1, y: i2, formula: comment.substring(9, 10) === "C", size: parseFloat(comment.substring(17, 24)) || 0.35,
                    angle, align: a === "R" ? 1 : a === "C" ? 0 : -1, text, col, sec, uMin: Infinity, uMax: -Infinity });
      label = labels.length - 1; cur = null;
      x = i1; y = i2; pendingMove = true;
      continue;
    }
    if (i0 === 0 && comment === "TextEnd") { label = -1; cur = null; pendingMove = true; continue; }
    if (i0 === 0) { x = i1; y = i2; pendingMove = true; continue; }
    if (i0 !== 1) continue;
    if (!cur) { cur = { col, pen, label, sec, d: [] }; paths.push(cur); }
    if (pendingMove) { cur.d.push([x, y, 1]); grow(x, y); pendingMove = false; }
    cur.d.push([i1, i2, 0]); grow(i1, i2);
    x = i1; y = i2;
  }
  // the extent of each label's strokes along its direction (for the alignment of text)
  for (const p of paths) {
    if (p.label < 0) continue;
    const L = labels[p.label], c = Math.cos(L.angle * Math.PI / 180), s = Math.sin(L.angle * Math.PI / 180);
    for (const [px, py] of p.d) { const u = (px - L.x) * c + (py - L.y) * s; if (u < L.uMin) L.uMin = u; if (u > L.uMax) L.uMax = u; }
  }
  const ok = axis && [axis.xLen, axis.yLen, axis.xLow, axis.xHigh, axis.yLow, axis.yHigh].every(isFinite) &&
             axis.xHigh !== axis.xLow && axis.yHigh !== axis.yLow;
  return paths.length ? { paths, labels, minX, minY, maxX, maxY, kind, axis: ok ? axis : null } : null;
}

// the parts of a label as text: runs of characters with their size, shift
// (plot units) and position along the label, which starts at its alignment
function labelRuns(L, style, measure) {
  const h = L.size * 100 * style.textScale;             // character height
  const fontSize = h * 1.4;                              // cap height of the font about h
  const runs = ChemText.format(L.text, L.formula).filter(r => r.text.length)
    .map(r => ({ text: r.text, size: Math.abs(r.shift) > 0.001 ? fontSize * 0.9 : fontSize, rise: r.shift * h }));
  let start = 0;
  if (L.align !== -1 && measure) {
    const w = runs.reduce((a, r) => a + measure(r.text, r.size), 0);
    const lo = isFinite(L.uMin) ? Math.min(0, L.uMin) : 0, hi = isFinite(L.uMax) ? L.uMax : L.text.length * L.size * 100;
    start = L.align === 0 ? (lo + hi) / 2 - w / 2 : hi - w;
  }
  return { runs, start, fontSize };
}

let measureCtx = null;
function measureText(fontCss) {
  if (typeof document === "undefined") return null;
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
  return (text, size) => { measureCtx.font = `${100}px ${fontCss}`; return measureCtx.measureText(text).width * size / 100; };
}

// ---------------------------------------------------------------- axes
// With a font, the axes are drawn here instead of with the strokes of the plot
// file (section "-- AXIS --" of GraphLib.axes): the same frame, scale and tick
// values by default, with the options of the style (ticks inside, outside or
// crossing; minor ticks; grid; frame) and, per diagram, a tick step per axis
// (style.xStep, style.yStep, in the units of the axis).
const AXIS_GRID = "#cfd3d8";
function numberOf(t) { const v = parseFloat(String(t).replace(/[–−]/g, "-").replace(/\s+/g, "")); return isFinite(v) ? v : null; }
function niceStep(span) {
  const raw = Math.abs(span) / 6, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
}
function ticksFrom(step, a, b) {
  const lo = Math.min(a, b), hi = Math.max(a, b), eps = Math.abs(hi - lo) * 1e-9, out = [];
  if (!(step > 0) || (hi - lo) / step > 200) return out;
  for (let k = Math.ceil((lo - eps) / step); k * step <= hi + eps; k++) out.push(+(k * step).toPrecision(12));
  return out;
}
// the decimals needed to write multiples of a step (2.5 -> 1, 0.25 -> 2, 2 -> 0)
function decimalsOf(step) { return Math.min(6, (String(+step.toPrecision(6)).split(".")[1] || "").length); }
function withAxes(model, style) {
  const A = model.axis, font = PLOT_FONTS[style.font];
  if (!A || !font) return model;
  const X = v => A.x0 + (v - A.xLow) / (A.xHigh - A.xLow) * A.xLen;
  const Y = v => A.y0 + (v - A.yLow) / (A.yHigh - A.yLow) * A.yLen;
  const xMax = A.x0 + A.xLen, yMax = A.y0 + A.yLen;
  // the program's tick values (its numbers), per axis
  const progX = [], progY = [];
  for (const L of model.labels) {
    if (L.sec !== "axis") continue;
    const v = numberOf(L.text);
    if (v === null) continue;
    if (L.y < A.y0 - 1) progX.push({ v, text: L.text, L }); else if (L.x < A.x0 - 1) progY.push({ v, text: L.text, L });
  }
  function axisTicks(prog, step, a, b) {
    if (step > 0) {
      const t = ticksFrom(step, a, b);
      if (t.length >= 2) { const d = decimalsOf(step); return { major: t.map(v => ({ v, text: v.toFixed(d).replace(/^-0(\.0*)?$/, "0$1") })), step }; }
    }
    if (prog.length >= 2) {
      const vs = prog.map(p => p.v).sort((x, y) => x - y);
      return { major: prog.map(p => ({ v: p.v, text: p.text })), step: Math.abs(vs[1] - vs[0]) };
    }
    const st = niceStep(b - a), d = decimalsOf(st);
    return { major: ticksFrom(st, a, b).map(v => ({ v, text: v.toFixed(d) })), step: st };
  }
  const tx = axisTicks(progX, style.xStep, A.xLow, A.xHigh), ty = axisTicks(progY, style.yStep, A.yLow, A.yHigh);
  const minorOf = (t, a, b) => !(style.minor > 1) ? [] :
    ticksFrom(t.step / style.minor, a, b).filter(v => !t.major.some(m => Math.abs(m.v - v) < t.step * 1e-6));
  const mx = minorOf(tx, A.xLow, A.xHigh), my = minorOf(ty, A.yLow, A.yHigh);

  const h = A.size * 100 * style.textScale;                    // height of the numbers
  const major = 0.6 * A.size * 100, minor = major / 2;
  const box = style.frame === "box" || (style.frame !== "axes" && model.kind === "predom");
  const aw = Math.max(WIDTHS[0], 1.5) * (style.axisWidth || 1);
  const paths = [], P = (d, extra) => paths.push(Object.assign({ col: 0, pen: 0, label: -1, sec: "axis", width: aw, d }, extra));
  // grid (under everything)
  if (style.grid === "major" || style.grid === "all") {
    const gx = tx.major.map(t => t.v).concat(style.grid === "all" ? mx : []), gy = ty.major.map(t => t.v).concat(style.grid === "all" ? my : []);
    for (const v of gx) { const x = X(v); if (Math.abs(x - A.x0) > 1 && Math.abs(x - xMax) > 1) P([[x, A.y0, 1], [x, yMax, 0]], { color: AXIS_GRID, width: 1, sec: "grid" }); }
    for (const v of gy) { const y = Y(v); if (Math.abs(y - A.y0) > 1 && Math.abs(y - yMax) > 1) P([[A.x0, y, 1], [xMax, y, 0]], { color: AXIS_GRID, width: 1, sec: "grid" }); }
  }
  // frame
  P(box ? [[A.x0, A.y0, 1], [xMax, A.y0, 0], [xMax, yMax, 0], [A.x0, yMax, 0], [A.x0, A.y0, 0]]
        : [[A.x0, yMax, 1], [A.x0, A.y0, 0], [xMax, A.y0, 0]]);
  // ticks: into the plot (inside), out of it, or both (crossing); mirrored on a box
  const span = len => style.ticks === "out" ? [-len, 0] : style.ticks === "cross" ? [-len, len] : [0, len];
  for (const [vs, len] of [[tx.major.map(t => t.v), major], [mx, minor]]) {
    const [a, b] = span(len);
    for (const v of vs) { const x = X(v); P([[x, A.y0 + a, 1], [x, A.y0 + b, 0]]); if (box) P([[x, yMax - a, 1], [x, yMax - b, 0]]); }
  }
  for (const [vs, len] of [[ty.major.map(t => t.v), major], [my, minor]]) {
    const [a, b] = span(len);
    for (const v of vs) { const y = Y(v); P([[A.x0 + a, y, 1], [A.x0 + b, y, 0]]); if (box) P([[xMax - a, y, 1], [xMax - b, y, 0]]); }
  }
  // numbers: under the X-axis (centred) and left of the Y-axis (right-aligned)
  const out = style.ticks === "in" ? 0 : major, gap = 0.6 * h;
  const num = (text, x, y, align) => ({ x, y, formula: true, size: A.size, angle: 0, align, text: String(text).trim(), col: 0, sec: "axis", uMin: 0, uMax: 0 });
  const xNumY = A.y0 - out - gap - h, yNumX = A.x0 - out - gap;
  const labels = [];
  for (const t of tx.major) labels.push(num(t.text, X(t.v), xNumY, 0));
  for (const t of ty.major) labels.push(num(t.text, yNumX, Y(t.v) - h / 2, 1));
  // the axis titles move with the numbers
  const measure = measureText(font.css);
  const oldXNum = progX.length ? Math.min(...progX.map(p => p.L.y)) : null;
  const oldYLeft = progY.length ? Math.min(...progY.map(p => p.L.x + (isFinite(p.L.uMin) ? p.L.uMin : 0))) : null;
  let newYLeft = null;
  if (measure) {
    const ws = labels.filter(L => L.align === 1).map(L => labelRuns(L, style, measure)).map(r => r.runs.reduce((a, q) => a + measure(q.text, q.size), 0));
    if (ws.length) newYLeft = yNumX - Math.max(...ws);
  }
  // the labels but the program's numbers (their strokes are not drawn with a font)
  const newLabels = model.labels.filter(L => L.sec !== "axis").map(L => {
    if (L.sec === "xtitle" && oldXNum !== null) return Object.assign({}, L, { y: L.y + (xNumY - oldXNum) });
    if (L.sec === "ytitle" && oldYLeft !== null && newYLeft !== null) return Object.assign({}, L, { x: L.x + (newYLeft - oldYLeft) });
    return L;
  }).concat(labels);
  const finalPaths = paths.filter(p => p.sec === "grid")
    .concat(model.paths.filter(p => p.sec !== "axis" && p.label < 0), paths.filter(p => p.sec !== "grid"));
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of finalPaths) for (const [x, y] of p.d) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  return Object.assign({}, model, { paths: finalPaths, labels: newLabels, minX, minY, maxX, maxY });
}

// The axes of a diagram, to read values off it: the origin (x0, y0) and the
// lengths (xLen, yLen) of the axes in plot units, their ranges, and their
// titles as HTML. null for a plot file without axis data.
function plotAxes(plt, style) {
  const m = parsePlt(plt);
  if (!m || !m.axis) return null;
  const k = style && +style.xScale > 0 ? +style.xScale : 1;
  m.axis.x0 *= k; m.axis.xLen *= k;
  // (as HTML, with the sub- and superscripts of the labels)
  const html = t => typeof ChemText === "undefined" ? escXml(t)
    : ChemText.format(t, true).map(r => r.shift < 0 ? `<sub>${escXml(r.text)}</sub>` : r.shift > 0 ? `<sup>${escXml(r.text)}</sup>` : escXml(r.text)).join("");
  const title = sec => m.labels.filter(L => L.sec === sec).map(L => html(L.text)).join(" ").replace(/\s+/g, " ").trim();
  return Object.assign({ kind: m.kind, xTitle: title("xtitle"), yTitle: title("ytitle") }, m.axis);
}

// the frame of the drawing: the drawn area, and the labels when they are
// drawn with a font (their measured boxes), with a margin of half the widest
// line and a few plot units
function plotFrame(model, style) {
  const font = PLOT_FONTS[style.font];
  let { minX, minY, maxX, maxY } = model;
  const measure = font && measureText(font.css);
  if (measure) {
    for (const L of model.labels) {
      const { runs, start } = labelRuns(L, style, measure);
      if (!runs.length) continue;
      // the box of the text: its measured width (and a little more), and from the
      // descent to the ascent of the font (about -0.3 and +1.0 em) of each run,
      // shifted by its sub- or superscript
      const w = runs.reduce((a, r) => a + measure(r.text, r.size), 0) * 1.03;
      const lo = Math.min(...runs.map(r => r.rise - 0.3 * r.size)), hi = Math.max(...runs.map(r => r.rise + 1.0 * r.size));
      const a = L.angle * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
      for (const [u, v] of [[start, lo], [start + w, lo], [start, hi], [start + w, hi]]) {
        const x = L.x + u * c - v * sn, y = L.y + u * sn + v * c;
        if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  const m = Math.ceil(Math.max(...model.paths.map(p => pathWidth(p, style))) / 2) + 6;
  return { x: minX - m, y: minY - m, w: maxX - minX + 2 * m, h: maxY - minY + 2 * m };
}

// the width of a line: its pen in the plot file times the style's factor, or its own (axes, grid)
const pathWidth = (p, style) => p.width !== undefined ? p.width : Math.max(WIDTHS[p.pen], 1.5) * style.lineScale;
const escXml = t => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ---------------------------------------------------------------- overlays
// Diagrams kept for comparison (style.overlays: [{plt, label}]) are drawn
// under the diagram with broken lines, one pattern per kept diagram, in the
// colours of their curves made lighter, and without their labels. A kept
// diagram is drawn in the coordinates of the present one (its axis ranges may
// differ); one with other axes (another kind of diagram or other axis titles)
// is only named in the legend, which is drawn under the diagram.
const OVERLAY_MAX = 6;
const OVERLAY_DASH = [[34, 16], [7, 13], [34, 12, 7, 12], [60, 16], [20, 10, 5, 10, 5, 10], [3, 9]];
const axisTitles = m => ["xtitle", "ytitle"].map(sec => m.labels.filter(L => L.sec === sec).map(L => L.text.trim()).join(" ")).join(" | ");
function withOverlays(model, style) {
  const list = (style.overlays || []).slice(0, OVERLAY_MAX);
  if (!list.length || !model.axis) return model;
  const A = model.axis, extra = [], titles = axisTitles(model);
  const legend = [{ dash: null, text: style.overlayNow || "this diagram" }];
  list.forEach((ov, i) => {
    const m = parsePlt(ov.plt), dash = OVERLAY_DASH[i % OVERLAY_DASH.length];
    const same = !!(m && m.axis && m.kind === model.kind && axisTitles(m) === titles);
    if (same) {
      const O = m.axis;
      const fx = x => A.x0 + ((O.xLow + (x - O.x0) / O.xLen * (O.xHigh - O.xLow)) - A.xLow) / (A.xHigh - A.xLow) * A.xLen;
      const fy = y => A.y0 + ((O.yLow + (y - O.y0) / O.yLen * (O.yHigh - O.yLow)) - A.yLow) / (A.yHigh - A.yLow) * A.yLen;
      for (const q of m.paths)
        if (q.sec === "plot" && q.label < 0) extra.push({ col: q.col, pen: q.pen, label: -1, sec: "overlay", dash, d: q.d.map(([x, y, mv]) => [fx(x), fy(y), mv]) });
    }
    legend.push({ dash, text: String(ov.label || `kept ${i + 1}`).slice(0, 90) + (same ? "" : " (other axes: not drawn)") });
  });
  const grid = model.paths.filter(q => q.sec === "grid"), rest = model.paths.filter(q => q.sec !== "grid");
  return Object.assign({}, model, { paths: grid.concat(extra, rest), legend, clip: { x: A.x0, y: A.y0, w: A.xLen, h: A.yLen } });
}
// The width of the diagram (style.xScale): all positions are moved along X;
// the lettering keeps its shape (the strokes of a label move with the label).
function withWidth(model, style) {
  const k = +style.xScale;
  if (!(k > 0) || Math.abs(k - 1) < 0.001) return model;
  const paths = model.paths.map(q => {
    if (q.label >= 0) { const dx = model.labels[q.label].x * (k - 1); return Object.assign({}, q, { d: q.d.map(([x, y, mv]) => [x + dx, y, mv]) }); }
    return Object.assign({}, q, { d: q.d.map(([x, y, mv]) => [x * k, y, mv]) });
  });
  const labels = model.labels.map(L => Object.assign({}, L, { x: L.x * k }));
  let minX = Infinity, maxX = -Infinity;
  for (const q of paths) for (const [x] of q.d) { if (x < minX) minX = x; if (x > maxX) maxX = x; }
  return Object.assign({}, model, { paths, labels, minX, maxX,
    axis: model.axis && Object.assign({}, model.axis, { x0: model.axis.x0 * k, xLen: model.axis.xLen * k }),
    clip: model.clip && Object.assign({}, model.clip, { x: model.clip.x * k, w: model.clip.w * k }) });
}
// ---------------------------------------------------------------- heading
// The texts that SED and Predom write above the diagram: the fixed
// concentrations ("[Fe2+]TOT = 10.00 uM", "pH = 7"), the temperature ("t= 25")
// and the ionic strength ("I= 0.100 M"). They are the labels above the axes
// with a "=" (a species name written above a curve has none).
const headingKind = L => { const t = L.text.trim(); return /^t\s*=/.test(t) ? "headTemp" : /^I\s*=/.test(t) ? "headIonic" : "headConc"; };
const isHeading = (L, A) => L.sec === "plot" && L.y > A.y0 + A.yLen && L.text.includes("=");
// With an ionic strength, the programs write "I=" where the temperature was
// and move "t=" to a new line above the concentrations. Here the two change
// places, so that the temperature stays where it is without an ionic
// strength and "I=" comes on the new line (the strokes of the two labels,
// drawn in the plotter style, move with them).
function headingOrder(model) {
  const A = model.axis;
  if (!A) return model;
  const it = model.labels.findIndex(L => isHeading(L, A) && headingKind(L) === "headTemp");
  const ii = model.labels.findIndex(L => isHeading(L, A) && headingKind(L) === "headIonic");
  if (it < 0 || ii < 0) return model;
  const T = model.labels[it], I = model.labels[ii], dx = I.x - T.x, dy = I.y - T.y;
  if (!dx && !dy) return model;
  const labels = model.labels.slice();
  labels[it] = Object.assign({}, T, { x: I.x, y: I.y });
  labels[ii] = Object.assign({}, I, { x: T.x, y: T.y });
  const paths = model.paths.map(q => q.label === it ? Object.assign({}, q, { d: q.d.map(([x, y, mv]) => [x + dx, y + dy, mv]) })
    : q.label === ii ? Object.assign({}, q, { d: q.d.map(([x, y, mv]) => [x - dx, y - dy, mv]) }) : q);
  return Object.assign({}, model, { labels, paths });
}
// the heading without the kinds of text that the style leaves out
function withHeading(model, style) {
  if (!model.axis || (style.headConc !== false && style.headTemp !== false && style.headIonic !== false)) return model;
  const map = [], labels = [];
  model.labels.forEach((L, i) => {
    if (isHeading(L, model.axis) && style[headingKind(L)] === false) map[i] = -1; else { map[i] = labels.length; labels.push(L); }
  });
  const paths = model.paths.filter(q => q.label < 0 || map[q.label] >= 0).map(q => q.label < 0 ? q : Object.assign({}, q, { label: map[q.label] }));
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const q of paths) for (const [x, y] of q.d) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  return paths.length ? Object.assign({}, model, { labels, paths, minX, minY, maxX, maxY }) : model;
}
// A steady frame (live mode): the heading grows by a line when an ionic
// strength is given (the programs then write the temperature on a line of
// its own), which would move the whole drawing. Room for that line is kept
// from the start, and the frame never shrinks while the axes stay the same
// (memo: the frame of the drawings so far, kept by the page).
function steadyFrame(model, style, F) {
  const A = model.axis;
  if (!A) return;
  const head = model.labels.filter(L => isHeading(L, A));
  if (head.length && style.headIonic !== false && !head.some(L => headingKind(L) === "headIonic")) F.h += 2 * A.size * 100;
  const memo = style.frameMemo;
  if (!memo) return;
  const sig = JSON.stringify([A.x0, A.y0, A.xLen, A.yLen, model.kind, style.font, style.textScale, style.xScale, style.ticks, style.frame,
                              style.headConc, style.headTemp, style.headIonic]);
  if (memo.sig === sig) {
    const x0 = Math.min(F.x, memo.x), y0 = Math.min(F.y, memo.y), x1 = Math.max(F.x + F.w, memo.x + memo.w), y1 = Math.max(F.y + F.h, memo.y + memo.h);
    F.x = x0; F.y = y0; F.w = x1 - x0; F.h = y1 - y0;
  }
  Object.assign(memo, { sig, x: F.x, y: F.y, w: F.w, h: F.h });
}

// The plot file as it is drawn: with the heading and the axes of the style,
// the kept diagrams and the width; null for a text that is not a plot file.
function plotModel(plt, style) {
  let model = parsePlt(plt);
  if (!model) return null;
  model = withWidth(withOverlays(withAxes(withHeading(headingOrder(model), style), style), style), style);
  const F = plotFrame(model, style);
  if (style.steady) steadyFrame(model, style, F);
  // the labels of the kept diagrams' legend, under the frame
  if (model.legend && model.axis) {
    const font = PLOT_FONTS[style.font] || PLOT_FONTS.sans, measure = measureText(font.css);
    const h = 0.8 * model.axis.size * 100 * style.textScale, size = h * 1.4, rowH = 2.1 * h;
    const x1 = model.axis.x0, x2 = x1 + 170, tx = x2 + 30;
    model.legendRows = model.legend.map((g, i) => ({ dash: g.dash, text: g.text, x1, x2, tx, y: F.y - (i + 0.9) * rowH, size, h }));
    const wide = Math.max(...model.legend.map(g => tx + (measure ? measure(g.text, size) : g.text.length * size * 0.55))) + 10;
    const block = model.legend.length * rowH + 0.5 * rowH;
    F.y -= block; F.h += block;
    if (wide > F.x + F.w) F.w = wide - F.x;
    model.legendFont = font;
  }
  model.frame = F;
  return model;
}

// style: an object (see PLOT_STYLE_DEFAULT), or true/false for the line
// strokes in colour or in black (as sed.html and predom.html use it)
function pltToSvg(plt, style) {
  if (typeof style !== "object" || style === null) style = { font: "plotter", textScale: 1, palette: style === false ? "bw" : "eqdiagr", lineScale: 1 };
  style = Object.assign({}, PLOT_STYLE_DEFAULT, style);
  const model = plotModel(plt, style);
  if (!model) return null;
  const pal = plotPalette(style), bg = plotBackground(style), font = PLOT_FONTS[style.font];
  const F = model.frame, vbY = -(F.y + F.h);
  const n = v => +v.toFixed(1);
  const colour = q => q.color ? (bg === "#000000" ? "#555555" : q.color) : q.dash ? mixColor(pal[q.col], bg, 0.3) : pal[q.col];
  const body = model.paths.filter(q => !font || q.label < 0)
    .map(q => `<path d="${q.d.map(([x, y, mv]) => `${mv ? "M" : "L"}${n(x)} ${n(-y)}`).join("")}" stroke="${colour(q)}" stroke-width="${+pathWidth(q, style).toFixed(2)}"` +
              (q.dash ? ` stroke-dasharray="${q.dash.join(" ")}" stroke-linecap="butt" clip-path="url(#eqclip)"` : "") + `/>`).join("\n");
  let texts = "";
  if (font) {
    const measure = measureText(font.css);
    texts = `<g font-family='${font.css}' stroke="none">` + model.labels.map(L => {
      const { runs, start } = labelRuns(L, style, measure);
      if (!runs.length) return "";
      // without a measure (no canvas), the browser aligns: text-anchor
      const anchor = measure || L.align === -1 ? "start" : L.align === 0 ? "middle" : "end";
      const x = measure || L.align === -1 ? start : L.align === 0 ? ((isFinite(L.uMin) ? Math.min(0, L.uMin) : 0) + L.uMax) / 2 : L.uMax;
      let rise = 0;
      const spans = runs.map(r => { const dy = -(r.rise - rise); rise = r.rise; return `<tspan font-size="${r.size.toFixed(1)}"${dy ? ` dy="${dy.toFixed(1)}"` : ""}>${escXml(r.text)}</tspan>`; }).join("");
      return `<text transform="translate(${n(L.x)} ${-L.y})${L.angle ? ` rotate(${-L.angle})` : ""}" x="${x.toFixed(1)}" y="0" fill="${pal[L.col]}"${anchor !== "start" ? ` text-anchor="${anchor}"` : ""} xml:space="preserve">${spans}</text>`;
    }).join("\n") + `</g>`;
  }
  let legend = "";
  if (model.legendRows) {
    legend = `<g class="legend" font-family='${model.legendFont.css}'>` + model.legendRows.map(r =>
      `<path d="M${n(r.x1)} ${n(-r.y)}L${n(r.x2)} ${n(-r.y)}" fill="none" stroke="${pal[0]}" stroke-width="${+(Math.max(WIDTHS[1], 1.5) * style.lineScale).toFixed(2)}"${r.dash ? ` stroke-dasharray="${r.dash.join(" ")}"` : ""}/>` +
      `<text x="${n(r.tx)}" y="${n(-r.y + 0.36 * r.size)}" font-size="${r.size.toFixed(1)}" fill="${pal[0]}" stroke="none">${escXml(r.text)}</text>`).join("") + `</g>`;
  }
  const clip = model.clip ? `<defs><clipPath id="eqclip"><rect x="${n(model.clip.x)}" y="${n(-(model.clip.y + model.clip.h))}" width="${n(model.clip.w)}" height="${n(model.clip.h)}"/></clipPath></defs>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(F.x)} ${n(vbY)} ${n(F.w)} ${n(F.h)}" width="${(F.w / 100).toFixed(2)}cm" height="${(F.h / 100).toFixed(2)}cm">` + clip +
         `<rect x="${n(F.x)}" y="${n(vbY)}" width="${n(F.w)}" height="${n(F.h)}" fill="${bg}"/>` +
         `<g fill="none" stroke-linecap="round" stroke-linejoin="round">\n${body}\n</g>${texts}${legend}</svg>`;
}

// ---------------------------------------------------------------- PDF
// The diagram as a one-page PDF, drawn as on the screen: the lines with the
// palette and line widths of the style, and the labels in the standard PDF
// font of the style (Helvetica, Times or Courier: not embedded; the screen
// uses Helvetica/Arial, Times New Roman and Courier New, with the same widths),
// or as the line strokes of the plot file ("plotter").
function pltToPdf(plt, style) {
  style = Object.assign({}, PLOT_STYLE_DEFAULT, style || {});
  const model = plotModel(plt, style);
  if (!model) return null;
  const pal = plotPalette(style), bg = plotBackground(style), font = PLOT_FONTS[style.font];
  const F = model.frame, k = 72 / 254;                        // plot unit (0.1 mm) in points
  const X = x => ((x - F.x) * k).toFixed(2), Y = y => ((y - F.y) * k).toFixed(2);
  const rgb = hex => [1, 3, 5].map(i => (parseInt(hex.substr(i, 2), 16) / 255).toFixed(3)).join(" ");
  const colour = q => q.color ? (bg === "#000000" ? "#555555" : q.color) : q.dash ? mixColor(pal[q.col], bg, 0.3) : pal[q.col];
  const dashOf = d => d ? `[${d.map(v => (v * k).toFixed(2)).join(" ")}] 0 d` : "[] 0 d";
  const W = F.w * k, H = F.h * k;
  const ops = ["1 J 1 j"];
  if (bg !== "#ffffff") ops.push(`${rgb(bg)} rg 0 0 ${W.toFixed(2)} ${H.toFixed(2)} re f`);
  const line = q => {
    ops.push(`${rgb(colour(q))} RG ${(pathWidth(q, style) * k).toFixed(3)} w`);
    ops.push(q.d.map(([x, y, mv]) => `${X(x)} ${Y(y)} ${mv ? "m" : "l"}`).join(" ") + " S");
  };
  const shown = model.paths.filter(q => !font || q.label < 0);
  // the kept diagrams: broken lines, inside the axes
  const kept = shown.filter(q => q.dash);
  if (kept.length && model.clip) {
    const c = model.clip;
    ops.push(`q 0 J ${X(c.x)} ${Y(c.y)} ${(c.w * k).toFixed(2)} ${(c.h * k).toFixed(2)} re W n`);
    for (const q of kept) { ops.push(dashOf(q.dash)); line(q); }
    ops.push("Q");
  }
  for (const q of shown) if (!q.dash) line(q);
  const text = (c, s, x0, y0, colourHex, runs) => {
    const parts = [`BT ${rgb(colourHex)} rg ${c.toFixed(4)} ${s.toFixed(4)} ${(-s).toFixed(4)} ${c.toFixed(4)} ${X(x0)} ${Y(y0)} Tm`];
    for (const r of runs) {
      for (const seg of pdfSegments(r.text))
        parts.push(`/${seg.sym ? "F2" : "F1"} ${(r.size * k).toFixed(2)} Tf ${(r.rise * k).toFixed(2)} Ts (${seg.bytes}) Tj`);
    }
    parts.push("ET");
    ops.push(parts.join(" "));
  };
  if (font) {
    const measure = measureText(font.css);
    for (const L of model.labels) {
      const { runs, start } = labelRuns(L, style, measure);
      if (!runs.length) continue;
      const a = L.angle * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
      text(c, s, L.x + start * c, L.y + start * s, pal[L.col], runs);
    }
  }
  if (model.legendRows) {
    for (const r of model.legendRows) {
      ops.push(`q 0 J ${dashOf(r.dash)} ${rgb(pal[0])} RG ${(Math.max(WIDTHS[1], 1.5) * style.lineScale * k).toFixed(3)} w ${X(r.x1)} ${Y(r.y)} m ${X(r.x2)} ${Y(r.y)} l S Q`);
      text(1, 0, r.tx, r.y - 0.36 * r.size, pal[0], [{ text: r.text, size: r.size, rise: 0 }]);
    }
  }
  // The page: the diagram alone ("fit"), or an A4 or Letter page with the
  // diagram at the margins from the lower left corner; the size in %, and a
  // header line with the name and the date (as the conversion of the desktop Spana).
  const sc = Math.min(4, Math.max(0.1, (+style.pdfScale || 100) / 100)), cm = 72 / 2.54;
  const header = style.pdfHeader && style.pdfHeaderText ? String(style.pdfHeaderText) : "";
  let pw = W * sc, ph = H * sc + (header ? 16 : 0), tx = 0, ty = 0;
  if (style.pdfPage === "a4" || style.pdfPage === "letter") {
    [pw, ph] = style.pdfPage === "a4" ? [595.28, 841.89] : [612, 792];
    if (style.pdfLandscape) [pw, ph] = [ph, pw];
    tx = (isFinite(+style.pdfLeft) ? +style.pdfLeft : 1) * cm; ty = (isFinite(+style.pdfBottom) ? +style.pdfBottom : 1) * cm;
  }
  let content = `q ${sc.toFixed(4)} 0 0 ${sc.toFixed(4)} ${tx.toFixed(2)} ${ty.toFixed(2)} cm\n${ops.join("\n")}\nQ`;
  if (header) content += `\nBT 0 0 0 rg /F3 8 Tf ${Math.max(tx, 6).toFixed(2)} ${(ph - 11).toFixed(2)} Td (${pdfSegments(header).map(g => g.sym ? "?" : g.bytes).join("")}) Tj ET`;
  const fontName = (font || model.legendFont || PLOT_FONTS.sans).pdf;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw.toFixed(2)} ${ph.toFixed(2)}] /Resources << /Font << /F1 5 0 R /F2 6 0 R /F3 7 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /${fontName} /Encoding /WinAnsiEncoding >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Symbol >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"
  ];
  let out = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
  const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => String(o).padStart(10, "0") + " 00000 n \n").join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info << /Producer (eq-diagr web) >> >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(out, ch => ch.charCodeAt(0) & 0xff);
}
// a text as PDF string bytes (WinAnsiEncoding), with Greek capitals from the Symbol font
function pdfSegments(text) {
  const WIN = { "–": 0x96, "—": 0x97, "−": 0x96, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "€": 0x80 };
  const SYM = { "Δ": "D", "α": "a", "β": "b", "γ": "g", "δ": "d", "Σ": "S", "Ω": "W" };
  const segs = [];
  for (const ch of text) {
    const sym = ch in SYM;
    let b;
    if (sym) b = SYM[ch];
    else { const c = ch.charCodeAt(0); b = c < 128 || (c >= 0xa0 && c <= 0xff) ? ch : WIN[ch] ? String.fromCharCode(WIN[ch]) : "?"; }
    b = b.replace(/[\\()]/g, m => "\\" + m);
    const last = segs[segs.length - 1];
    if (last && last.sym === sym) last.bytes += b; else segs.push({ sym, bytes: b });
  }
  return segs;
}

function download(data, filename, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const fromBase64 = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

// cfg: {program ("sed" or "predom"), examples, fixedArgs, csv (true for SED), pointsText(result)}
function setupDiagramPage(cfg) {
  const $ = id => document.getElementById(id);
  const engine = new EqDiagrEngine();
  const words = s => s.trim().split(/\s+/).filter(x => x);
  let last = null, busy = false;

  function show() {
    const plot = $("plot");
    if (!last || !last.plt) { plot.innerHTML = `<div class="empty">No diagram was produced; see the messages below.</div>`; return; }
    plot.innerHTML = pltToSvg(last.plt, $("colour").checked) || `<div class="empty">The plot file is empty.</div>`;
  }

  function setBusy(b) {
    busy = b;
    $("draw").disabled = b;
    $("stop").hidden = !b;
  }

  async function draw() {
    if (busy) return;
    const ex = cfg.examples[$("example").selectedIndex] || {};
    const name = (ex.name || "diagram").replace(/[^A-Za-z0-9_.+-]/g, "_");
    const base = `/work/${name}`;
    $("status").className = ""; $("status").textContent = "Calculating…";
    setBusy(true);
    const t0 = performance.now();
    const outputs = [`${base}.plt`].concat(cfg.csv ? [`${base}.csv`] : []);
    const r = await engine.run(cfg.program, [`-d=${base}.dat`, ...words($("args").value), ...words(cfg.fixedArgs)],
                               { files: { [`${base}.dat`]: $("dat").value }, outputs });
    setBusy(false);
    const info = r.info || {};
    last = { ok: r.ok, stopped: r.stopped, name, log: r.log || r.error || "",
             plt: r.files[`${base}.plt`] || "", csv: r.files[`${base}.csv`] || "",
             points: info.points, failed: info.failed, ms: Math.round(performance.now() - t0) };
    $("log").textContent = last.log;
    if ($("csv")) $("csv").textContent = last.csv;
    ["dlSvg", "dlPlt", "dlPdf", "dlEps"].forEach(id => { if ($(id)) $(id).disabled = !last.plt; });
    if ($("dlCsv")) $("dlCsv").disabled = !last.csv;
    if (last.stopped) {
      $("status").className = "fail"; $("status").textContent = "Stopped.";
    } else if (last.ok) {
      $("status").className = "ok"; $("status").textContent = cfg.pointsText(last);
    } else {
      $("status").className = "fail";
      $("status").textContent = "The program stopped with an error; see the messages below.";
      $("logDetails").open = true;
    }
    show();
  }

  // PDF and EPS through eq-diagr's PlotPDF and PlotPS
  async function convert(program, ext, type) {
    if (!last || !last.plt) return;
    const inp = `/work/${last.name}.plt`, out = `/work/${last.name}.${ext}`;
    const args = [`-p=${inp}`, `${program === "plotpdf" ? "-pdf" : "-ps"}=${out}`, "-noh"];
    if ($("colour").checked) args.push("-clr"); else args.push("-bw");
    const r = await engine.run(program, args, { files: { [inp]: last.plt }, binaryOutputs: [out] });
    if (r.files[out]) download(fromBase64(r.files[out]), `${last.name}.${ext}`, type);
    else { $("log").textContent = r.log || r.error || ""; $("logDetails").open = true; }
  }

  function loadExample() {
    const ex = cfg.examples[$("example").selectedIndex];
    if (!ex) return;
    $("dat").value = ex.dat; $("args").value = ex.args;
    draw();
  }

  cfg.examples.forEach(ex => $("example").insertAdjacentHTML("beforeend", `<option value="${ex.name}">${ex.title}</option>`));
  $("example").addEventListener("change", loadExample);
  $("draw").addEventListener("click", draw);
  $("stop").addEventListener("click", () => engine.stop());
  $("colour").addEventListener("change", show);
  $("dlSvg").addEventListener("click", () => download(pltToSvg(last.plt, $("colour").checked), last.name + ".svg", "image/svg+xml"));
  $("dlPlt").addEventListener("click", () => download(last.plt, last.name + ".plt", "text/plain"));
  if ($("dlPdf")) $("dlPdf").addEventListener("click", () => convert("plotpdf", "pdf", "application/pdf"));
  if ($("dlEps")) $("dlEps").addEventListener("click", () => convert("plotps", "eps", "application/postscript"));
  if ($("dlCsv")) $("dlCsv").addEventListener("click", () => download(last.csv, last.name + ".csv", "text/csv"));
  loadExample();
}
