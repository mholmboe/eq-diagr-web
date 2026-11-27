// A Java properties file (the references file of eq-diagr, References.txt),
// read and written as java.util.Properties does: load() follows
// Properties.load (comments, line continuations, separators and escapes);
// store() follows Properties.store(Writer): a date comment, then one
// "key=value" line per entry with Properties' escapes (no \\u escapes, as for a
// Writer), the keys in alphabetical order as lib.huvud.SortedProperties intends.
//   const map = JavaProperties.load(text); const text2 = JavaProperties.store(map);
(function (global) {
function load(text) {
  const m = new Map(), lines = text.split(/\r\n|\r|\n/);
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].replace(/^[ \t\f]+/, "");
    if (!line || line[0] === "#" || line[0] === "!") continue;
    while (/(^|[^\\])(\\\\)*\\$/.test(line) && i + 1 < lines.length) line = line.slice(0, -1) + lines[++i].replace(/^[ \t\f]+/, "");
    let k = 0, keyLen = line.length, valStart = line.length, sep = false;
    for (; k < line.length; k++) {
      const c = line[k];
      if (c === "\\") { k++; continue; }
      if (c === "=" || c === ":") { keyLen = k; valStart = k + 1; sep = true; break; }
      if (c === " " || c === "\t" || c === "\f") { keyLen = k; valStart = k + 1; break; }
    }
    while (valStart < line.length && " \t\f".includes(line[valStart])) valStart++;
    if (!sep && valStart < line.length && "=:".includes(line[valStart])) valStart++;
    while (valStart < line.length && " \t\f".includes(line[valStart])) valStart++;
    m.set(unescapeProp(line.slice(0, keyLen)), unescapeProp(line.slice(valStart)));
  }
  return m;
}
function unescapeProp(s) {
  return s.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, x) => x.length === 5 ? String.fromCharCode(parseInt(x.slice(1), 16)) :
    ({ t: "\t", n: "\n", r: "\r", f: "\f" })[x] || x);
}
function escapeProp(s, isKey) {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === " ") out += (i === 0 || isKey) ? "\\ " : " ";
    else if (c === "\\") out += "\\\\";
    else if (c === "\t") out += "\\t"; else if (c === "\n") out += "\\n"; else if (c === "\r") out += "\\r"; else if (c === "\f") out += "\\f";
    else if ("=:#!".includes(c)) out += "\\" + c;
    else out += c;
  }
  return out;
}
function store(map) {
  const d = new Date(), days = "Sun Mon Tue Wed Thu Fri Sat".split(" "), mons = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
  const p2 = n => String(n).padStart(2, "0");
  const tz = (Intl.DateTimeFormat("en", { timeZoneName: "short" }).formatToParts(d).find(x => x.type === "timeZoneName") || {}).value || "";
  let out = `#${days[d.getDay()]} ${mons[d.getMonth()]} ${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())} ${tz} ${d.getFullYear()}\n`;
  for (const k of [...map.keys()].sort()) out += escapeProp(k, true) + "=" + escapeProp(map.get(k), false) + "\n";
  return out;
}

  global.JavaProperties = { load, store, escape: escapeProp };
})(typeof window !== "undefined" ? window : globalThis);
