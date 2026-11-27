// Labels of eq-diagr plot files as text: the chemical-formula formatting of
// the desktop Spana (LibChemDiagr, graph_lib/DiagrPaintUtility: chemF,
// PrintFormula, and spana/Disp: replaceMinusSign), ported line by line.
//
//   ChemText.format("CO3-2", true)  ->  { text: "CO3 2–" ..., d: [0,0,-0.4,...] }
//   d[i] is the vertical displacement of character i in character heights:
//   -0.4 subscript, +0.4 superscript (charges), ±0.5 for `...' math sequences.
(function (global) {
  "use strict";
  const M1 = 0x2013, M2 = 0x2212;   // en dash, minus sign

  // Disp.replaceMinusSign: hyphens become en dashes, except between two letters
  function replaceMinusSign(t) {
    if (t.length <= 1 || t.indexOf("-") < 0) return t;
    const sb = [...t];
    const letter = c => (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
    if (sb[0] === "-") sb[0] = "–";
    for (let i = 1; i < sb.length; i++) {
      if (sb[i] !== "-") continue;
      const l = sb[i - 1].charCodeAt(0), n = i <= sb.length - 2 ? sb[i + 1].charCodeAt(0) : 32;
      if (letter(l) && letter(n)) continue;
      sb[i] = "–";
    }
    return sb.join("");
  }

  // DiagrPaintUtility.chemF: returns {t, d}
  function chemF(text) {
    const REMOVE_CHAR = 0, DOWN = 1, NONE = 2, UP = 3, CONT = 4, END = 6;
    let t = [...text];
    if (t.join("").trim().length <= 1) return { t: text, d: new Array(t.length).fill(0) };
    // remove trailing space
    let nchr = t.join("").replace(/\s+$/, "").length;
    t = t.slice(0, nchr);
    const d = new Array(nchr).fill(0);
    const code = i => t[i].charCodeAt(0);
    let L = 32, nL = 32, nnL = 32;
    let now = code(0);
    let n = nchr >= 2 ? code(1) : 32;
    let n2 = nchr >= 3 ? code(2) : 32;
    let n3;
    let dm = 0, df = 0;
    let i = 0, act;
    do {
      n3 = 32;
      if (nchr >= i + 4) n3 = code(i + 3);
      if (df > 0.001) {
        if (now < 43 || now > 57 || now === 44 || now === 46 || now === 47) df = 0;
      }
      act = (() => {
        // @
        if (now === 64 && L !== 64) return REMOVE_CHAR;
        if (L === 64) return now === 32 ? CONT : NONE;
        // backspace
        if (now === 2) { now = n; n = n2; n2 = n3; return END; }
        // ' or `
        if (now === 39 || now === 96) {
          if (now === 39 && dm === 0 &&
              ((n === 32 && L === 115) ||
               (n === 115 && (n2 === 32 || n2 === 46 || n2 === 44 || n2 === 58 || n2 === 59 || n2 === 63 ||
                              n2 === 33 || n2 === 41 || n2 === 93)))) return CONT;
          if (now === 39) dm += 0.5;
          if (now === 96) dm -= 0.5;
          return REMOVE_CHAR;
        }
        // space
        if (now === 32) {
          if ((n < 49 && (n !== 43 && n !== 45 && n !== M1 && n !== M2)) || n > 57) return NONE;
          if ((n === 43 || n === 45 || n === M1 || n === M2) && (L === 43 || L === 45 || L === M1 || L === M2)) return NONE;
          if ((n2 >= 65 && n2 <= 90) || (n2 >= 97 && n2 <= 122)) return NONE;
          if (n >= 49 && n <= 57) {
            if (n2 >= 48 && n2 <= 57) {
              if (n3 !== 43 && n3 !== 45 && n3 !== M1 && n3 !== M2) return NONE;
            } else if (n2 !== 43 && n2 !== 45 && n2 !== M1 && n2 !== M2) return NONE;
          }
          if (L === 32) return NONE;
          if ((L < 48 || L > 122 || (L >= 58 && L <= 64) || (L >= 91 && L <= 96)) &&
              (L !== 41 && L !== 93 && L !== 125 && L !== 62 && L !== 34 && L !== 39)) return NONE;
          return REMOVE_CHAR;
        }
        // digits
        if (now >= 48 && now <= 57) {
          if (L !== 40 && L !== 91 && L !== 123 && L !== 45 && L !== M1 && L !== M2 && L !== 43) {
            if ((L === 106 || L === 74) || (L === 113 || L === 81)) return NONE;
            if ((L === 120 || L === 88) || (L === 122 || L === 90)) return NONE;
            if ((L >= 65 && L <= 90) || (L >= 97 && L <= 122)) return DOWN;
            if (L === 41 || L === 93 || L === 125) return DOWN;
            if (df > 0.01 && ((L >= 48 && L <= 57) || L === 46)) return CONT;
            if (df < -0.01 && (L === 46 || (L >= 48 && L <= 57))) return CONT;
          }
          df = 0;
          if (L === 32 && (n >= 48 && n <= 57) && (n2 === 43 || n2 === 45 || n2 === M1 || n2 === M2) && now !== 48) {
            if (n3 !== 32 && n3 !== 41 && n3 !== 93 && n3 !== 125) return CONT;
            return UP;
          }
          if (L !== 32 || (n !== 43 && n !== 45 && n !== M1 && n !== M2)) return CONT;
          if ((n2 >= 48 && n2 <= 57) || (n2 >= 65 && n2 <= 90) || (n2 >= 97 && n2 <= 122)) return CONT;
          return UP;
        }
        // + or -
        if (now === 43 || now === 45 || now === M1 || now === M2) {
          if (L >= 50 && L <= 57 && df > 0.01) return UP;
          if ((L >= 48 && L <= 57) && (nL >= 49 && nL <= 57) && df > 0.01) return UP;
          if (n >= 49 && n <= 57) {
            if (((nL >= 48 && nL <= 57) || nL === 46) && (L === 69 || L === 101)) return NONE;
            if (L === 32) return NONE;
            if ((L === 106 || L === 74) || (L === 113 || L === 81)) return NONE;
            if ((L === 120 || L === 88) || (L === 122 || L === 90)) return NONE;
            if (dm > 0.01 && (L === 39 && nL === 48 && nnL === 49) && (n >= 49 && n <= 57) &&
                (n2 === 46 || n2 === 96 || (n2 >= 48 && n2 <= 57))) return NONE;
            if ((L < 48 && L !== 41 && L !== 34 && L !== 39) || (L > 122 && L !== 125) ||
                (L >= 58 && L <= 64 && L !== 62) || (L >= 91 && L <= 96 && L !== 93)) return NONE;
            if ((L === 41 || L === 93 || L === 125 || L === 34 || L === 39) &&
                (nL === 32 || nL < 48 || nL > 122 || (nL >= 58 && nL <= 64) || (nL >= 91 && nL <= 96))) return NONE;
            if ((n2 < 48 && n2 !== 41 && n2 !== 32 && n2 !== 39) ||
                (n2 > 57 && n2 !== 93 && n2 !== 96 && n2 !== 125)) return NONE;
            if ((n >= 49 && n <= 57) && (n2 >= 48 && n2 <= 57)) {
              if (n3 !== 32 && n3 !== 2 && n3 !== 41 && n3 !== 93 && n3 !== 125 &&
                  n3 !== 96 && n3 !== 39 && n3 !== 64 && n3 !== 61) return NONE;
              // "W12O41-10" -> "W12O41 10-"
              const t1 = t[i + 1], t2 = t[i + 2];
              t[i + 2] = t[i]; t[i + 1] = t2; t[i] = t1;
              const j1 = n, j2 = n2;
              n2 = now; n = j2; now = j1;
              return UP;
            }
            if (n >= 50 && n <= 57) {
              // "Fe+3" -> "Fe3+"
              const t1 = t[i + 1];
              t[i + 1] = t[i]; t[i] = t1;
              const j = n; n = now; now = j;
              return UP;
            }
          }
          if (L === 106 || L === 74 || L === 113 || L === 81) return NONE;
          if (L === 120 || L === 88 || L === 122 || L === 90) return NONE;
          if (L === 32 || L === 41 || L === 93 || L === 125) {
            if (nL === 32 || (nL < 48 && nL !== 41) || nL > 122 || (nL >= 58 && nL <= 64) ||
                (nL >= 91 && nL <= 96 && nL !== 93)) return NONE;
            return UP;
          }
          if ((L < 48 && L !== 41 && L !== 34 && L !== 39) || (L > 122 && L !== 125) ||
              (L >= 58 && L <= 64) || (L >= 91 && L <= 96 && L !== 93)) return NONE;
          if (n !== 32 && n !== 41 && n !== 93 && n !== 125 && n !== 61 && n !== 39 && n !== 96) return NONE;
          return UP;
        }
        // period
        if (now === 46) {
          if ((L >= 48 && L <= 57) && (n >= 48 && n <= 57)) return CONT;
          return NONE;
        }
        return NONE;
      })();

      if (act === REMOVE_CHAR) {
        if (i < nchr) t.splice(i, 1);
        nchr -= 1;
        nnL = nL; nL = L; L = now; now = n; n = n2; n2 = n3;
        continue;
      }
      if (act === DOWN) df = -0.4;
      else if (act === NONE) df = 0;
      else if (act === UP) df = 0.4;
      if (act !== END) { nnL = nL; nL = L; L = now; now = n; n = n2; n2 = n3; }
      d[i] = dm + df;
      i += 1;
    } while (i < nchr);
    return { t: t.slice(0, nchr).join(""), d: d.slice(0, nchr) };
  }

  // PrintFormula's preparation of a label: special characters, then (for
  // chemical formulas) super- and subscripts. Returns runs of equal shift:
  // [{text, shift}], shift in character heights (0 = base line).
  function format(text, isFormula) {
    let s = text;
    if (isFormula) s = replaceMinusSign(s);
    const n0 = s.length;
    if (!n0 || !s.trim()) return [];
    if (isFormula) {
      if (s.includes("~")) s = s.replace(/~/g, "°");
      if (s.includes("$")) s = s.replace(/\$/g, "µ");
      if (s.includes("^")) s = s.replace(/\^/g, "Δ");
    }
    let formula = isFormula;
    if (isFormula) {
      let onlyDigits = true, notDigits = true;
      for (const ch of s) {
        const j = ch.charCodeAt(0);
        if ((j > 57 || j < 48) && j !== 46 && j !== 43 && j !== 45 && j !== M1 && j !== M2) onlyDigits = false;
        if (j >= 48 && j <= 57) notDigits = false;
        if (j === 39 || j === 96) notDigits = false;
        if (j === 36 || j === 94 || j === 126) notDigits = false;
        if (j === 43 || j === 45 || j === M1 || j === M2) notDigits = false;
      }
      if (onlyDigits || notDigits) formula = false;
    }
    if (!formula) return [{ text: s.replace(/\s+$/, ""), shift: 0 }];
    const { t, d } = chemF(s);
    const runs = [];
    for (let i = 0; i < t.length; i++) {
      const last = runs[runs.length - 1];
      if (last && Math.abs(last.shift - d[i]) < 0.001) last.text += t[i];
      else runs.push({ text: t[i], shift: d[i] });
    }
    return runs;
  }

  global.ChemText = { format, chemF, replaceMinusSign };
})(typeof window !== "undefined" ? window : globalThis);
