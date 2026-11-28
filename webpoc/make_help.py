"""Make web/help.html from eq-diagr's help system (Chem_Diagr_Help), and copy its
HTML pages to web/help/.

Usage: python3 -I make_help.py <eq-diagr> <web dir>

The JavaHelp table of contents (javahelp/toc.xml) and topic map (javahelp/map.jhm)
become a contents tree next to a frame that shows the topic. The text of all
pages is written to web/help/search.json for the search field above the
contents (the desktop help has the search of JavaHelp).

The pages that describe how to use the desktop programs (their windows, menus
and preferences) are replaced by pages for the web app, kept in help-web/ with
the same file names, so that the links of the other pages still lead to them.
TOC_TEXT renames their entries in the contents, DROP leaves out entries, and
EXTRA adds entries for pages that only the web app has.
"""
import html
import json
import os
import re
import shutil
import sys
import xml.etree.ElementTree as ET

src, web = sys.argv[1], sys.argv[2]
hs = os.path.join(src, "Chem_Diagr_Help", "src")
dst = os.path.join(web, "help")
if os.path.isdir(dst):
    shutil.rmtree(dst)
shutil.copytree(os.path.join(hs, "html"), dst)
own = os.path.join(os.path.dirname(os.path.abspath(__file__)), "help-web")
replaced = sorted(f for f in os.listdir(own) if f.endswith((".htm", ".css")))
for f in replaced:
    shutil.copy(os.path.join(own, f), os.path.join(dst, f))

TOC_TEXT = {
    "Tut_Make_1st_Diag_htm": "Make your first diagram",
    "DB_0_Main_htm": "Chemical system (DATABASE)",
    "DB_Working_with_htm": "Searching the database",
    "S_0_Main_htm": "Diagrams (SPANA)",
    "S_Working_with_htm": "Working with the app",
    "S_Modify_Chem_System_htm": "Changing the chemical system",
    "S_Making_Diagrams_htm": "Making a diagram",
    "S_Diagram_Window_htm": "The diagram",
    "S_Printing_htm": "Exporting and printing",
    "S_Interacting_w_Windows_htm": "Files in the browser",
    "S_Menu_Prefs_htm": "Normal and advanced mode",
    "Install_Uninstall_htm": "Running in the browser",
}
DROP = {"S_Batch_htm"}
# pages of the web app that the desktop help has no entry for: put in the
# contents after the entry named, {target: [(text, page in help-web/)]}
EXTRA = {"DB_Working_with_htm": [("Constants entered by hand", "DB_By_Hand.htm")]}

urls = {}
for m in ET.parse(os.path.join(hs, "javahelp", "map.jhm")).getroot().iter("mapID"):
    u = m.get("url", "")
    if u.startswith("../html/"):
        urls[m.get("target")] = "help/" + u[len("../html/"):]
# two entries of toc.xml point to targets missing from map.jhm ("License _htm"
# has a stray space, and there is no S_Batch_htm): link them to the pages that exist
urls.setdefault("License _htm", "help/1_License.htm")
urls.setdefault("S_Batch_htm", "help/SP_Batch_Mode.htm")


def items(node, depth):
    out = []
    for t in node.findall("tocitem"):
        if t.get("target") in DROP:
            continue
        url = urls.get(t.get("target"))
        text = html.escape(TOC_TEXT.get(t.get("target"), t.get("text", "")))
        link = '<a href="%s" target="topic">%s</a>' % (html.escape(url), text) if url else text
        kids = items(t, depth + 1)
        if kids:
            out.append('<li><details%s><summary>%s</summary><ul>%s</ul></details></li>'
                       % (" open" if depth == 0 and t.get("expand") == "true" else "", link, "".join(kids)))
        else:
            out.append("<li>%s</li>" % link)
        for text, page in EXTRA.get(t.get("target"), []):
            out.append('<li><a href="help/%s" target="topic">%s</a></li>' % (html.escape(page), html.escape(text)))
    return out


toc_root = ET.parse(os.path.join(hs, "javahelp", "toc.xml")).getroot()
toc = "".join(items(toc_root, 0))

# The search index: title and text of every page, [{"u": url, "t": title, "x": text}].
# A page of the contents has the title of its entry there.
toc_title = {}
for t in toc_root.iter("tocitem"):
    if t.get("target") not in DROP and urls.get(t.get("target")):
        toc_title.setdefault(urls[t.get("target")], TOC_TEXT.get(t.get("target"), t.get("text", "")))
for extra in EXTRA.values():
    for text, page in extra:
        toc_title.setdefault("help/" + page, text)


def page_text(path):
    with open(path, "rb") as fh:
        raw = fh.read()
    m = re.search(rb"charset=[\"']?([-\w]+)", raw[:2000], re.I)
    try:
        text = raw.decode(m.group(1).decode("ascii") if m else "utf-8")
    except (UnicodeDecodeError, LookupError):
        text = raw.decode("latin-1")
    m = re.search(r"(?is)<title>(.*?)</title>", text)
    title = html.unescape(re.sub(r"\s+", " ", m.group(1))).strip() if m else ""
    text = re.sub(r"(?is)<(script|style|head)\b.*?</\1>", " ", text)
    text = html.unescape(re.sub(r"(?s)<[^>]+>", " ", text)).replace("\xa0", " ")
    return title, re.sub(r"\s+", " ", text).strip()


index = []
for f in sorted(os.listdir(dst)):
    if not f.lower().endswith((".htm", ".html")):
        continue
    title, text = page_text(os.path.join(dst, f))
    if text:
        index.append({"u": "help/" + f, "t": toc_title.get("help/" + f) or title or f, "x": text})
with open(os.path.join(dst, "search.json"), "w", encoding="utf-8") as fh:
    json.dump(index, fh, ensure_ascii=False, separators=(",", ":"))
first = urls.get("0_Index_htm", "help/0_Index.htm")
page = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Help</title>
<script src="theme.js"></script>
<link rel="stylesheet" href="theme.css">
<script src="app-view.js"></script>
<style>
  .help { display: grid; grid-template-columns: minmax(0, 300px) minmax(0, 1fr); gap: var(--space-6); }
  @media (max-width: 700px) { .help { grid-template-columns: minmax(0, 1fr); } }
  .side { display: flex; flex-direction: column; gap: var(--space-4); min-width: 0; }
  .side input { flex: none; }
  .results a { font-weight: 600; }
  .results li { margin: 0 0 var(--space-5); }
  .results .snip { font-size: var(--text-sm); color: var(--muted); margin-top: var(--space-1); }
  .results mark { background: color-mix(in srgb, var(--accent) 25%%, transparent); color: inherit; }
  .results p { margin: 0; font-size: var(--text-sm); color: var(--muted); }
  .toc { font-size: var(--text-base); max-height: 80vh; overflow: auto; border: 1px solid var(--line); border-radius: 8px; padding: var(--space-4) var(--space-5); }
  .toc ul { list-style: none; margin: 0; padding-left: var(--space-6); }
  .toc > ul { padding-left: 0; }
  .toc li { margin: var(--space-2) 0; }
  .toc summary { font-weight: 400; font-size: var(--text-base); }
  .toc a { color: var(--accent); }
  iframe { width: 100%%; height: 80vh; border: 1px solid var(--line); border-radius: 8px; background: #fff; }
  html.embedded main { padding: var(--space-5) var(--space-6); }
  @media (min-width: 701px) { html.embedded .side, html.embedded iframe { height: calc(100vh - 20px); max-height: none; } html.embedded .toc { flex: 1; min-height: 0; max-height: none; } }
</style>
</head>
<body>
<main>
  <h1>Help</h1>
  <p class="lede">The help system of the eq-diagr programs (Spana, DataBase, SED, Predom), by I. Puigdom&egrave;nech. The pages on using the programs describe this web version; the pages on chemistry, calculations and file formats are those of the desktop programs.</p>
  <nav><a href="database.html">Database</a><a href="maintenance.html">Maintenance</a><a href="spana.html">Diagram</a><a href="sed.html">SED</a><a href="predom.html">Predom</a><a href="help.html" aria-current="page">Help</a><a href="ec-tests.html">EC tests</a></nav>
  <div class="help">
    <div class="side">
      <input id="q" type="text" inputmode="search" autocomplete="off" spellcheck="false" placeholder="Search the help" aria-label="Search the help" aria-controls="results">
      <div class="toc" id="toc"><ul>%s</ul></div>
      <div class="toc results" id="results" role="region" aria-live="polite" aria-label="Search results" hidden></div>
    </div>
    <iframe name="topic" src="%s" title="Help topic"></iframe>
  </div>
</main>
<script>
if (window.EqView) EqView.openTopic = path => { frames.topic.location.href = path; };
// Search: the pages that contain all the words typed, those with the words in
// the title first. The index (help/search.json, by make_help.py) is read at
// the first search.
(function () {
  const q = document.getElementById("q"), toc = document.getElementById("toc"), results = document.getElementById("results");
  const esc = t => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  let index = null, timer = null;
  async function load() {
    if (!index) { index = await (await fetch("help/search.json")).json(); for (const p of index) { p.tl = p.t.toLowerCase(); p.xl = p.x.toLowerCase(); } }
    return index;
  }
  function snippet(p, words) {
    let at = -1;
    for (const w of words) { const i = p.xl.indexOf(w); if (i >= 0 && (at < 0 || i < at)) at = i; }
    if (at < 0) at = 0;
    const from = Math.max(0, at - 60), to = Math.min(p.x.length, at + 140);
    const text = (from > 0 ? "… " : "") + p.x.slice(from, to) + (to < p.x.length ? " …" : ""), low = text.toLowerCase(), spans = [];
    for (const w of words) { let i = -1; while ((i = low.indexOf(w, i + 1)) >= 0) spans.push([i, i + w.length]); }
    spans.sort((a, b) => a[0] - b[0]);
    let out = "", pos = 0;
    for (const [a, b] of spans) { if (a < pos) continue; out += esc(text.slice(pos, a)) + "<mark>" + esc(text.slice(a, b)) + "</mark>"; pos = b; }
    return out + esc(text.slice(pos));
  }
  async function search() {
    const words = [...new Set(q.value.toLowerCase().split(" ").filter(w => w.length > 1))];
    if (!words.length) { results.hidden = true; toc.hidden = false; return; }
    let ix;
    try { ix = await load(); } catch (e) { results.innerHTML = "<p>The search index could not be read.</p>"; results.hidden = false; toc.hidden = true; return; }
    const hits = [];
    for (const p of ix) {
      let score = 0;
      for (const w of words) {
        const inTitle = p.tl.includes(w);
        let n = 0, i = -1;
        while (n < 20 && (i = p.xl.indexOf(w, i + 1)) >= 0) n++;
        if (!inTitle && !n) { score = -1; break; }
        score += (inTitle ? 100 : 0) + n;
      }
      if (score >= 0) hits.push([score, p]);
    }
    hits.sort((a, b) => b[0] - a[0] || a[1].t.localeCompare(b[1].t));
    results.innerHTML = hits.length
      ? "<p>" + hits.length + (hits.length === 1 ? " page" : " pages") + "</p><ul>" + hits.slice(0, 50).map(([, p]) =>
          '<li><a href="' + esc(p.u) + '" target="topic">' + esc(p.t) + '</a><div class="snip">' + snippet(p, words) + "</div></li>").join("") + "</ul>"
      : "<p>No page has " + (words.length > 1 ? "all these words" : "this word") + ".</p>";
    results.hidden = false; toc.hidden = true; results.scrollTop = 0;
  }
  q.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(search, 150); });
  q.addEventListener("keydown", e => { if (e.key === "Escape" && q.value) { q.value = ""; search(); } });
})();
</script>
</body>
</html>
""" % (toc, html.escape(first))
open(os.path.join(web, "help.html"), "w", encoding="utf-8").write(page)
print("help.html: %d topics, %d files copied, %d pages for the web app" % (len(urls), sum(len(f) for _, _, f in os.walk(dst)), len(replaced)))
