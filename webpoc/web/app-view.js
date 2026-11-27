// Shared by the pages that also run as views (tabs) inside the app window,
// app.html. Loaded before the page's own script.
//  - In the app (page opened with "?embed" in an iframe of app.html) the page
//    gets the class "embedded" on <html>, and the class "adv" in advanced mode.
//    Elements with the class "adv-only" are shown in advanced mode only, as
//    the desktop programs do with their normal/advanced preference.
//  - Opened on its own, the page is shown as before, with all options.
//  - The page registers its commands (EqView.commands: name -> button id or
//    function) for the app's menus, and may set EqView.openText, onShow, ...
(function () {
  const root = document.documentElement;
  let app = null;
  try { if (window.parent !== window && /[?&]embed\b/.test(location.search)) app = window.parent.EqApp || null; } catch (e) {}
  const embedded = !!app;
  if (embedded) root.classList.add("embedded");

  const KEY = "eqdiagr.advanced";
  function storedAdvanced() { try { return localStorage.getItem(KEY) === "1"; } catch (e) { return false; } }

  const commands = {};
  function element(c) { return typeof c === "string" ? document.getElementById(c) : null; }
  const EqView = {
    embedded, app, commands,
    get advanced() { return root.classList.contains("adv"); },
    setAdvanced(on) {
      root.classList.toggle("adv", !embedded || !!on);
      document.dispatchEvent(new CustomEvent("eqmode", { detail: { advanced: EqView.advanced } }));
    },
    /** null: no such command here; false: not possible now; true: possible */
    can(name) {
      const c = commands[name];
      if (!c) return null;
      if (typeof c === "function") return true;
      if (typeof c === "object") return c.can ? !!c.can() : true;
      const el = element(c);
      // (not offsetParent: a view in a tab that is not shown has none)
      return !!el && !el.disabled && !el.closest("[hidden], .hidden") &&
        !(el.closest(".adv-only") && !EqView.advanced) && !(embedded && el.closest(".standalone-only"));
    },
    command(name) {
      const c = commands[name];
      if (!c || EqView.can(name) === false) return false;
      if (typeof c === "function") c();
      else if (typeof c === "object") c.run();
      else element(c).click();
      return true;
    },
    setTitle(t) { if (app) app.viewTitle(window, t); },
    /** the view has changes not saved in this browser (shown in its tab; asked about on closing) */
    setDirty(d) { if (app && app.viewDirty) app.viewDirty(window, !!d); },
    /** the name of the view's file in browser storage, after it was saved under a new name */
    setFile(name) { if (app && app.viewFile) app.viewFile(window, name); },
    filesChanged() { if (app) app.filesChanged(); },
    publishDatabases(files) { if (app) app.databasesChanged(window, files); }
  };
  window.EqView = EqView;

  // Touch screens have no hover: a tap on a text that has an explanation (a
  // title) shows it in a bubble, until the next tap or scroll. Controls keep
  // their own action (buttons, lists, fields, links, and labels of fields).
  let tip = null, tipTimer = null;
  const hideTip = () => { if (tip) { tip.remove(); tip = null; } clearTimeout(tipTimer); };
  document.addEventListener("pointerup", e => {
    if (e.pointerType === "mouse") return;
    hideTip();
    const el = e.target.closest ? e.target.closest("[title]") : null;
    if (!el || !el.title.trim() || el.closest("button, select, input, textarea, a, summary, label, dialog[open] .btns")) return;
    tip = document.createElement("div");
    tip.className = "taptip"; tip.setAttribute("role", "tooltip"); tip.textContent = el.title;
    document.body.appendChild(tip);
    const r = tip.getBoundingClientRect(), x = Math.max(8, Math.min(e.clientX - r.width / 2, innerWidth - r.width - 8));
    const above = e.clientY - r.height - 14;
    tip.style.left = x + "px"; tip.style.top = (above > 8 ? above : Math.min(e.clientY + 18, innerHeight - r.height - 8)) + "px";
    tipTimer = setTimeout(hideTip, 7000);
  });
  document.addEventListener("scroll", hideTip, true);
  EqView.setAdvanced(storedAdvanced());

  if (!embedded) return;
  document.addEventListener("DOMContentLoaded", () => {
    // the status line of the view is shown in the app's status bar
    const s = document.getElementById("status");
    if (s) {
      const send = () => app.viewStatus(window, s.textContent, s.className);
      new MutationObserver(send).observe(s, { childList: true, characterData: true, subtree: true, attributes: true });
      send();
    }
  });
  // the view alone on the screen, without the menus, tabs and status bar of the app
  EqView.setFull = on => { if (app.fullView) app.fullView(!!on); };
  // keyboard shortcuts of the app also work while the focus is in the view
  window.addEventListener("keydown", e => app.key(e));
  window.addEventListener("mousedown", () => app.closeMenus());
  // files dropped on the view are opened by the app
  const hasFiles = e => e.dataTransfer && [...e.dataTransfer.types].includes("Files");
  window.addEventListener("dragover", e => { if (hasFiles(e) && app.dragging) { e.preventDefault(); app.dragging(true); } });
  window.addEventListener("drop", e => { if (hasFiles(e) && app.dropFiles) { e.preventDefault(); app.dropFiles(e.dataTransfer.files); } });
})();
