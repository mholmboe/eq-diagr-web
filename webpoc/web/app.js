// The app window: one page with a menu bar, a file sidebar, tabs and a status
// bar. Each tab is one of the pages (database search, diagram setup, database
// maintenance, help) running in an iframe with "?embed"; app-view.js in the
// page connects it to this window (window.EqApp). The pages keep their own
// engine and state, so several diagrams can be open at the same time.
(function () {
  const $ = id => document.getElementById(id);
  const esc = t => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const ADV_KEY = "eqdiagr.advanced", SIDE_KEY = "eqdiagr.sidebar";
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  const MOD = isMac ? "⌘" : "Ctrl+";

  let advanced = store.get(ADV_KEY) === "1";
  let tabs = [], active = null, seq = 0;
  // the database set, as the views last reported it: {builtin: id or null, names}
  // (at the start from BuiltinDb.startupInfo, which fetches nothing)
  let dbInfo = null, dbInfoLoading = null;

  // ---------------------------------------------------------------- tabs
  // kind: chem (database search), diagram, maint (database tools, advanced), help
  const PAGES = { chem: "database.html", diagram: "spana.html", maint: "maintenance.html", help: "help.html" };
  const TITLES = { chem: "Chemical system", diagram: "Diagram", maint: "Database tools", help: "Help" };

  function openTab(kind, opts = {}) {
    const tab = { id: "t" + (++seq), kind, title: opts.title || TITLES[kind], closable: kind !== "chem",
                  status: "", statusCls: "", file: opts.file || null };
    const frame = document.createElement("iframe");
    const q = new URLSearchParams({ embed: "1" });
    if (opts.file) q.set("file", opts.file);
    frame.src = `${PAGES[kind]}?${q}`;
    frame.title = tab.title;
    tab.frame = frame;
    tab.ready = new Promise(res => frame.addEventListener("load", () => res(tab), { once: true }));
    $("views").appendChild(frame);
    tabs.push(tab);
    drawTabs();
    activate(tab);
    return tab;
  }
  const view = tab => { try { return tab && tab.frame.contentWindow && tab.frame.contentWindow.EqView; } catch (e) { return null; } };
  const find = kind => tabs.find(t => t.kind === kind);
  async function ensure(kind) {
    const t = find(kind) || openTab(kind);
    activate(t);
    await t.ready;
    return t;
  }

  function activate(tab) {
    if (!tab) return;
    active = tab;
    for (const t of tabs) t.frame.hidden = t !== tab;
    drawTabs();
    showStatus();
    drawSidebar();
    const v = view(tab);
    if (v && v.onShow) v.onShow();
  }

  async function closeTab(tab) {
    if (!tab || !tab.closable) return;
    // a diagram with changes not saved in this browser
    const v = view(tab);
    if (v && v.isDirty && v.isDirty()) {
      activate(tab);
      const a = await EqDialog.choose(`Save the changes to "${tab.title}" in this browser before closing the tab?`,
        [["save", "Save"], ["discard", "Don't save"], ["cancel", "Cancel"]]);
      if (a === "save") { if (!(await v.saveNow())) return; }
      else if (a !== "discard") return;
    }
    const i = tabs.indexOf(tab);
    tabs.splice(i, 1);
    tab.frame.remove();
    if (active === tab) activate(tabs[Math.min(i, tabs.length - 1)] || find("chem"));
    else drawTabs();
  }

  function drawTabs() {
    $("tabs").innerHTML = tabs.map(t =>
      `<div class="tab${t === active ? " active" : ""}" data-id="${t.id}"${t.kind === "maint" && !advanced ? " hidden" : ""}>` +
      `<button class="t" role="tab" aria-selected="${t === active}" title="${esc(t.title)}${t.dirty ? " (not saved)" : ""}">${t.dirty ? '<span class="dirty" aria-label="not saved">●</span> ' : ""}${esc(t.title)}</button>` +
      (t.closable ? `<button class="x" title="Close" aria-label="Close ${esc(t.title)}">×</button>` : "") + `</div>`).join("");
    const el = $("tabs").querySelector(".tab.active");
    if (el) el.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  $("tabs").addEventListener("click", e => {
    const el = e.target.closest(".tab");
    if (!el) return;
    const tab = tabs.find(t => t.id === el.dataset.id);
    if (e.target.classList.contains("x")) closeTab(tab); else activate(tab);
  });
  $("tabs").addEventListener("auxclick", e => {
    const el = e.target.closest(".tab");
    if (el && e.button === 1) closeTab(tabs.find(t => t.id === el.dataset.id));
  });

  // diagrams: a file in browser storage (opts.file) or a file from this computer (opts.name, opts.text)
  async function openDiagram(opts) {
    if (opts.file) {
      const open = tabs.find(t => t.kind === "diagram" && t.file === opts.file);
      if (open) {
        activate(open);
        // the stored file was replaced (a new search result saved under its name)
        const v = view(open);
        if (opts.reload && v && v.openText) { const text = await Store.get("files", opts.file); if (text) await v.openText(opts.file, text, true); }
        return open;
      }
    }
    const tab = openTab("diagram", { file: opts.file, title: opts.file ? opts.file.replace(/\.dat$/i, "") : opts.name ? opts.name.replace(/\.(dat|plt)$/i, "") : "Diagram" });
    if (opts.text != null) {
      await tab.ready;
      const v = view(tab);
      // a file that is not a plot file leaves no empty tab
      if (v && v.openText && (await v.openText(opts.name, opts.text)) === false) {
        await closeTab(tab);
        $("sbStatus").className = "sb-status fail"; $("sbStatus").textContent = `"${opts.name}" could not be read as a plot file.`;
        return null;
      }
    }
    return tab;
  }

  // A link to a diagram: the address of this page with the data file in the
  // part after "#", compressed (deflate) and base64url-encoded. The file goes
  // from browser to browser in the link; the server never sees that part.
  const b64u = bytes => { let t = ""; for (let i = 0; i < bytes.length; i += 0x8000) t += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(t).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
  const unb64u = t => Uint8Array.from(atob(t.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
  const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
  async function shareUrl(name, text) {
    const raw = new TextEncoder().encode(text);
    let kind = "t", bytes = raw;
    try { bytes = await pipe(raw, new CompressionStream("deflate-raw")); kind = "z"; } catch (e) { bytes = raw; }
    return `${location.origin}${location.pathname}#dat=${encodeURIComponent(name)}&${kind}=${b64u(bytes)}`;
  }
  async function shareDiagram() {
    const v = view(active), d = v && v.shareData ? await v.shareData() : null;
    if (!d) return;
    const url = await shareUrl(d.name, d.text), s = $("sbStatus");
    try {
      await navigator.clipboard.writeText(url);
      active.status = `A link to this diagram is on the clipboard (${url.length.toLocaleString("en")} characters). The link holds the data file itself.`;
      active.statusCls = "ok"; showStatus();
    } catch (e) {
      await EqDialog.prompt("Copy this link to the diagram (it holds the data file itself):", url, { ok: "Close" });
    }
  }
  async function openShared() {
    const m = location.hash.match(/^#dat=([^&]*)&(z|t)=([A-Za-z0-9_-]+)$/);
    if (!m) return;
    history.replaceState(null, "", location.pathname + location.search);
    try {
      let bytes = unb64u(m[3]);
      if (m[2] === "z") bytes = await pipe(bytes, new DecompressionStream("deflate-raw"));
      const name = decodeURIComponent(m[1]).replace(/[\\/:*?"<>|]/g, "_") || "shared.dat";
      const tab = await openDiagram({ name, text: new TextDecoder().decode(bytes) });
      // the diagram of the link is made at once
      const v = view(tab);
      if (v && v.can("make")) v.command("make");
    } catch (e) {
      $("sbStatus").className = "sb-status fail"; $("sbStatus").textContent = "The link to a diagram could not be read: " + e.message;
    }
  }
  window.addEventListener("hashchange", openShared);

  async function help(path) {
    const t = await ensure("help");
    const v = view(t);
    if (path && v && v.openTopic) v.openTopic(path);
  }
  async function chem(cmd, arg) {
    const t = await ensure("chem"), v = view(t);
    if (!cmd || !v) return;
    if (arg !== undefined) { const c = v.commands[cmd]; if (typeof c === "function") c(arg); }
    else v.command(cmd);
  }
  const dbChoice = () => dbInfo ? dbInfo.builtin : null;
  async function maint(cmd) {
    if (!advanced) setAdvanced(true);
    const t = await ensure("maint");
    const v = view(t);
    if (cmd && v) v.command(cmd);
  }

  // ---------------------------------------------------------------- files
  async function openDatFile() { $("openDat").click(); }

  // the example files of the desktop programs (data/examples), as in their Help > Tutorials
  const EXAMPLES = ["01-Make your 1st diagram", "02-Fraction diagram", "03-fixed CO2 pressure", "04-Log conc diagr",
    "05-pH calculated", "05-pH calculated (log)", "06-Eh calculated", "06-Eh calculated (log)", "07-Solubility Al",
    "08-Solubility calcite", "09-Predom Cd-NTA", "10-Poubaix diag Cu", "11-logO2-pH 300C", "12-logO2-pH Au 250C",
    "13-Titration acetic acid", "14-Titration Mg-edta", "15-H-affinity (oxalate-carbonate mix)"];
  function showExamples() {
    $("exList").innerHTML = EXAMPLES.map(n => `<li><button data-ex="${esc(n)}">${esc(n.replace(/^(\d+)-/, "$1 · "))}</button></li>`).join("");
    $("examples").showModal();
  }
  $("exList").addEventListener("click", async e => {
    const b = e.target.closest("[data-ex]");
    if (!b) return;
    $("examples").close();
    try {
      const r = await fetch("data/examples/" + encodeURIComponent(b.dataset.ex + ".dat"));
      if (!r.ok) throw new Error(r.status);
      await openDiagram({ name: b.dataset.ex + ".dat", text: await r.text() });
    } catch (err) { $("sbStatus").textContent = "Could not open the example: " + err.message; }
  });
  $("openDat").addEventListener("change", async e => {
    const f = e.target.files[0]; e.target.value = "";
    if (f) await openDiagram({ name: f.name, text: await f.text() });
  });
  async function loadDbFiles(list) {
    const files = await Promise.all([...list].map(async f => ({ name: f.name, buffer: await f.arrayBuffer() })));
    if (!files.length) return;
    const t = await ensure("chem"), v = view(t);
    if (v && v.loadFiles) await v.loadFiles(files);
  }
  // Files dropped on the window (or on a view, which hands them over): data
  // files (.dat) open in diagram tabs, database files are loaded together.
  const DB_EXT = /\.(db|elb|txt|skv|csv|elt|elm)$/i;
  async function dropFiles(list) {
    dragging(false);
    const files = [...list], dats = files.filter(f => /\.(dat|plt)$/i.test(f.name)), dbs = files.filter(f => DB_EXT.test(f.name));
    if (!dats.length && !dbs.length) {
      if (files.length) { $("sbStatus").className = "sb-status fail"; $("sbStatus").textContent = "Drop data files (.dat), plot files (.plt) or database files (.db, .elb, .txt, .skv, .csv, .elt, .elm)."; }
      return;
    }
    if (dbs.length) await loadDbFiles(dbs);
    for (const f of dats) await openDiagram({ name: f.name, text: await f.text() });
  }
  let dragTimer = null;
  function dragging(on) {
    clearTimeout(dragTimer);
    if (on) { document.body.classList.add("dropping"); dragTimer = setTimeout(() => dragging(false), 1500); }
    else document.body.classList.remove("dropping");
  }
  const hasFiles = e => e.dataTransfer && [...e.dataTransfer.types].includes("Files");
  window.addEventListener("dragover", e => { if (hasFiles(e)) { e.preventDefault(); dragging(true); } });
  window.addEventListener("drop", e => { if (hasFiles(e)) { e.preventDefault(); dropFiles(e.dataTransfer.files); } });
  $("openDb").addEventListener("change", async e => {
    const list = [...e.target.files];
    e.target.value = "";
    if (!list.length) return;
    await loadDbFiles(list);
  });

  async function drawSidebar() {
    let keys = [];
    try { keys = (await Store.keys("files")).filter(k => !/\.plt$/i.test(k)); } catch (e) {}
    const current = active && active.kind === "diagram" ? active.file : null;
    $("sideFiles").innerHTML = keys.length ? keys.map(k =>
      `<li${k === current ? ' class="current"' : ""}><button class="item" data-file="${esc(k)}" title="Open ${esc(k)}">${esc(k)}</button>` +
      `<button class="rm" data-rm="${esc(k)}" title="Remove from this browser" aria-label="Remove ${esc(k)}">×</button></li>`).join("")
      : `<li class="empty-li">None yet. Search a chemical system, or open a .dat file.</li>`;
    if (dbInfo === null) {
      dbInfoLoading = dbInfoLoading || BuiltinDb.startupInfo().catch(() => ({ builtin: null, names: [] }));
      const info = await dbInfoLoading;
      if (dbInfo === null) dbInfo = info;
    }
    // a bundled database by its name, files loaded by the user by their file names
    const names = dbInfo.names, b = dbChoice();
    $("sideDbs").innerHTML = b ? `<li><button class="item side-db" data-db="1" title="${esc(names.join(", "))}">${esc(BuiltinDb.SETS[b].short)}</button></li>`
      : names.length ? names.map(n => `<li><button class="item" data-db="${esc(n)}">${esc(n)}</button></li>`).join("")
      : `<li class="empty-li">No database loaded.</li>`;
  }
  $("sidebar").addEventListener("click", async e => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.file) { await openDiagram({ file: b.dataset.file }); closeDrawer(); }
    else if (b.dataset.db) { await ensure("chem"); closeDrawer(); }
    else if (b.dataset.rm) {
      if (!(await EqDialog.confirm(`Remove ${b.dataset.rm} from this browser? This cannot be undone.`, { ok: "Remove" }))) return;
      try { await Store.remove("files", b.dataset.rm); } catch (err) {}
      drawSidebar();
    }
  });
  $("sideOpen").addEventListener("click", openDatFile);
  $("sideLoadDb").addEventListener("click", () => $("openDb").click());

  function toggleSidebar() {
    if (matchMedia("(max-width: 760px)").matches) { document.body.classList.toggle("sideopen"); return; }
    const hide = !document.body.classList.contains("noside");
    document.body.classList.toggle("noside", hide);
    store.set(SIDE_KEY, hide ? "0" : "1");
  }
  const closeDrawer = () => document.body.classList.remove("sideopen");
  $("sideToggle").addEventListener("click", toggleSidebar);
  if (store.get(SIDE_KEY) === "0") document.body.classList.add("noside");

  // ---------------------------------------------------------------- normal and advanced mode
  function setAdvanced(on) {
    advanced = !!on;
    store.set(ADV_KEY, advanced ? "1" : "0");
    document.documentElement.classList.toggle("adv", advanced);
    $("modeNormal").setAttribute("aria-pressed", String(!advanced));
    $("modeAdv").setAttribute("aria-pressed", String(advanced));
    $("sbMode").textContent = advanced ? "Advanced mode" : "Normal mode";
    for (const t of tabs) { const v = view(t); if (v) v.setAdvanced(advanced); }
    if (!advanced && active && active.kind === "maint") activate(find("chem"));
    drawTabs();
  }
  $("modeNormal").addEventListener("click", () => setAdvanced(false));
  $("modeAdv").addEventListener("click", () => setAdvanced(true));

  // ---------------------------------------------------------------- menus
  // an item: {label, cmd} runs a command of the active view; {label, act} runs
  // a function of this window; adv: advanced mode only; check: a check mark
  const MENUS = [
    { label: "File", items: [
      { label: "Open data or plot file…", act: openDatFile, key: "" },
      { label: "New chemical system", act: () => chem("newSystem") },
      { label: "Open an example…", act: showExamples },
      "-",
      { label: "Save data file in this browser", cmd: "saveMy" },
      { label: "Download data file (.dat)", cmd: "dat" },
      { label: "Edit the data file as text…", cmd: "editDat", adv: true },
      { label: "Copy a link to this diagram", act: shareDiagram, can: () => { const v = view(active); return !!(v && v.shareData && v.hasFile && v.hasFile()); } },
      "-",
      { group: "Export the diagram" },
      { label: "SVG image", cmd: "svg" },
      { label: "PNG image", cmd: "png" },
      { label: "PDF document", cmd: "pdf" },
      { label: "EPS (PostScript)", cmd: "eps", adv: true },
      { label: "Plot file (.plt)", cmd: "plt", adv: true },
      { label: "Table of results", cmd: "table" },
      { label: "Copy the diagram as an image", cmd: "copyImg" },
      { label: "Print the diagram…", cmd: "print", key: MOD + "P" },
      "-",
      { label: "Close tab", act: () => closeTab(active), can: () => active && active.closable }
    ] },
    { label: "Run", items: [
      { label: "Plot the diagram", cmd: "make", key: MOD + "Enter" },
      { label: "Stop the calculation", cmd: "stop" },
      "-",
      { label: "Keep the diagram for comparison", cmd: "keep" },
      { label: "Remove the kept diagrams", cmd: "unkeep" },
      "-",
      { label: "Search the database", act: () => chem("search"), can: () => { const v = view(find("chem")); return v && v.can("search"); } },
      { label: "Create a diagram of the search result", act: () => chem("toDiagram"), can: () => { const v = view(find("chem")); return v && v.can("toDiagram"); } }
    ] },
    { label: "Database", items: [
      { label: "Load database files…", act: () => $("openDb").click() },
      { group: "Databases that come with the program" },
      { label: "KTH course database KD1280", act: () => chem("useDb", "kth"), check: () => dbChoice() === "kth" },
      { label: "eq-diagr database", act: () => chem("useDb", "release"), check: () => dbChoice() === "release" },
      { label: "Small sample database", act: () => chem("useDb", "sample"), check: () => dbChoice() === "sample" },
      { label: "Wateq4F", act: () => chem("useDb", "wateq4f"), check: () => dbChoice() === "wateq4f", adv: true },
      { label: "MintEQ v4", act: () => chem("useDb", "minteq"), check: () => dbChoice() === "minteq", adv: true },
      { label: "Medusa-Hydra", act: () => chem("useDb", "hydra"), check: () => dbChoice() === "hydra", adv: true },
      { label: "Soltherm (high temperatures)", act: () => chem("useDb", "soltherm"), check: () => dbChoice() === "soltherm", adv: true },
      "-",
      { group: "Maintenance", adv: true },
      { label: "Statistics and checks", act: () => maint("stats"), adv: true },
      { label: "Data for a single component", act: () => maint("single"), adv: true },
      { label: "Convert a binary database to text", act: () => maint("toText"), adv: true },
      { label: "Merge the databases", act: () => maint("merge"), adv: true },
      { label: "Add data or edit a text database", act: () => maint("addData"), adv: true },
      { label: "Literature references", act: () => maint("refs"), adv: true }
    ] },
    { label: "View", items: [
      { label: "Advanced mode", check: () => advanced, act: () => setAdvanced(!advanced) },
      { label: "Diagram style…", cmd: "plotStyle" },
      { label: "File list", check: () => !document.body.classList.contains("noside") && (!matchMedia("(max-width: 760px)").matches || document.body.classList.contains("sideopen")), act: toggleSidebar },
      "-",
      { group: "Colours" },
      { label: "As the computer (light or dark)", check: () => EqTheme.get() === "system", act: () => EqTheme.set("system") },
      { label: "Light", check: () => EqTheme.get() === "light", act: () => EqTheme.set("light") },
      { label: "Dark", check: () => EqTheme.get() === "dark", act: () => EqTheme.set("dark") },
      { label: "Original (as the desktop programs)", check: () => EqTheme.get() === "original", act: () => EqTheme.set("original") },
      "-",
      { label: "Program messages", cmd: "messages" }
    ] },
    { label: "Help", items: [
      { label: "Help contents", act: () => help() },
      { label: "Make your first diagram", act: () => help("help/Tut_Make_1st_Diag.htm") },
      { label: "Tutorials", act: () => help("help/Tut_0_Tutorials.htm") },
      { label: "Example diagrams…", act: showExamples },
      { label: "Format of the data files", act: () => help("help/SP_Data_File_Format.htm"), adv: true },
      "-",
      { label: "About Eq-Diagr", act: () => $("about").showModal() },
      { label: "Pages for testing the programs", act: () => window.open("tools.html", "_blank"), adv: true }
    ] }
  ];

  function itemEnabled(it) {
    if (it.can) return !!it.can();
    if (it.cmd) { const v = view(active); return !!v && v.can(it.cmd) === true; }
    return true;
  }
  function buildMenus() {
    $("menus").innerHTML = MENUS.map((m, i) =>
      `<div><button id="mb${i}" aria-haspopup="menu" aria-expanded="false" aria-controls="menu${i}">${m.label}</button>` +
      `<div class="menu" id="menu${i}" role="menu" aria-labelledby="mb${i}" hidden></div></div>`).join("");
  }
  function fillMenu(i) {
    const items = MENUS[i].items.filter(it => it === "-" || !it.adv || advanced);
    // no separator at the start, at the end or twice in a row
    const clean = items.filter((it, k) => it !== "-" || (k > 0 && k < items.length - 1 && items[k - 1] !== "-"));
    $("menu" + i).innerHTML = clean.map((it, k) => {
      if (it === "-") return "<hr>";
      if (it.group) return `<div class="grp">${it.group}</div>`;
      const checked = it.check ? ` role="menuitemcheckbox" aria-checked="${!!it.check()}"` : ` role="menuitem"`;
      return `<button data-m="${i}" data-k="${MENUS[i].items.indexOf(it)}"${checked}${itemEnabled(it) ? "" : " disabled"}>` +
        `<span>${it.label}</span>${it.key ? `<span class="key">${it.key}</span>` : ""}</button>`;
    }).join("");
  }
  let openMenu = -1;
  function showMenu(i, focusFirst) {
    closeMenus();
    if (i < 0) return;
    fillMenu(i);
    const menu = $("menu" + i);
    menu.hidden = false; menu.style.left = "0"; menu.style.right = "";
    const r = menu.getBoundingClientRect();
    if (r.right > window.innerWidth - 4) { menu.style.left = "auto"; menu.style.right = "0"; }
    $("mb" + i).setAttribute("aria-expanded", "true");
    openMenu = i;
    if (focusFirst) { const b = menu.querySelector("button:not(:disabled)"); if (b) b.focus(); }
  }
  function closeMenus() {
    if (openMenu < 0) return;
    $("menu" + openMenu).hidden = true;
    $("mb" + openMenu).setAttribute("aria-expanded", "false");
    openMenu = -1;
  }
  buildMenus();
  $("menus").addEventListener("click", e => {
    const top = e.target.closest("[aria-haspopup]");
    if (top) { const i = +top.id.slice(2); if (openMenu === i) closeMenus(); else showMenu(i, e.detail === 0); return; }
    const b = e.target.closest(".menu button");
    if (!b || b.disabled) return;
    const it = MENUS[+b.dataset.m].items[+b.dataset.k];
    closeMenus();
    runItem(it);
  });
  $("menus").addEventListener("mouseover", e => {
    const top = e.target.closest("[aria-haspopup]");
    if (top && openMenu >= 0 && +top.id.slice(2) !== openMenu) showMenu(+top.id.slice(2));
  });
  $("menus").addEventListener("keydown", e => {
    if (openMenu < 0) return;
    const menu = $("menu" + openMenu), list = [...menu.querySelectorAll("button:not(:disabled)")];
    const k = list.indexOf(document.activeElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = list.length; if (!n) return;
      list[(k + (e.key === "ArrowDown" ? 1 : n - 1) + (k < 0 && e.key === "ArrowUp" ? 1 : 0)) % n].focus();
    } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      showMenu((openMenu + (e.key === "ArrowRight" ? 1 : MENUS.length - 1)) % MENUS.length, true);
    }
  });
  function runItem(it) {
    if (it.act) it.act();
    else if (it.cmd) { const v = view(active); if (v) v.command(it.cmd); }
  }
  document.addEventListener("mousedown", e => {
    if (!e.target.closest(".menus")) closeMenus();
    if (!e.target.closest(".sidebar, .sidetoggle")) closeDrawer();
  });

  // ---------------------------------------------------------------- keyboard
  function key(e) {
    if (e.key === "Escape") {
      if (openMenu >= 0) { const b = $("mb" + openMenu); closeMenus(); b.focus(); }
      closeDrawer();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      const v = view(active);
      if (v && v.can("make")) { e.preventDefault(); v.command("make"); }
    }
    // printing prints the diagram of the active tab (otherwise the browser prints the window)
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "p") {
      const v = view(active);
      if (v && v.can("print")) { e.preventDefault(); v.command("print"); }
    }
  }
  window.addEventListener("keydown", key);

  // ---------------------------------------------------------------- status bar
  function showStatus() {
    const s = $("sbStatus");
    s.textContent = active ? active.status : "";
    s.className = "sb-status " + (active ? active.statusCls : "");
  }

  // ---------------------------------------------------------------- the connection with the views (app-view.js)
  const tabOf = win => tabs.find(t => t.frame.contentWindow === win);
  window.EqApp = {
    // a view alone on the screen (the diagram on a phone): no menus, tabs, file list or status bar
    fullView(on) { document.body.classList.toggle("viewfull", !!on); },
    viewStatus(win, text, cls) {
      const t = tabOf(win);
      if (!t) return;
      t.status = text; t.statusCls = cls || "";
      if (t === active) showStatus();
    },
    viewTitle(win, title) {
      const t = tabOf(win);
      if (!t || !title) return;
      t.title = title; t.frame.title = title;
      drawTabs();
    },
    filesChanged() { drawSidebar(); },
    viewDirty(win, d) {
      const t = tabOf(win);
      if (!t || t.dirty === d) return;
      t.dirty = d; drawTabs();
    },
    viewFile(win, name) {
      const t = tabOf(win);
      if (t) { t.file = name; drawSidebar(); }
    },
    databasesChanged(win, files) {
      dbInfo = { builtin: window.BuiltinDb ? BuiltinDb.which(files) : null, names: files.map(f => f.name) };
      for (const t of tabs) {
        if (t.frame.contentWindow === win) continue;
        const v = view(t);
        if (v && v.useDatabases) v.useDatabases(files);
      }
      drawSidebar();
    },
    openDiagram,
    dropFiles, dragging, shareUrl,
    key,
    closeMenus() { closeMenus(); closeDrawer(); }
  };

  // leaving the page (closing the browser tab, reloading) with diagrams not saved
  window.addEventListener("beforeunload", e => {
    if (tabs.some(t => t.dirty)) { e.preventDefault(); e.returnValue = ""; }
  });

  // ---------------------------------------------------------------- start
  setAdvanced(advanced);
  openTab("chem");
  const want = new URLSearchParams(location.search).get("file");
  if (want) openDiagram({ file: want });
  openShared();
  drawSidebar();
})();
