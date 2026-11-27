// The colour theme of all pages: "system" (follows the light or dark setting
// of the computer), "light", "dark" or "original" (the colours of the desktop
// programs). Loaded in the <head>, before the page is drawn. The choice is
// kept in the browser (localStorage "eqdiagr.theme") and set on <html> as
// data-theme; theme.css has the colours.
(function () {
  const KEY = "eqdiagr.theme", NAMES = ["system", "light", "dark", "original"];
  const root = document.documentElement;
  function get() {
    try { const t = localStorage.getItem(KEY); return NAMES.includes(t) ? t : "system"; } catch (e) { return "system"; }
  }
  function apply() {
    const t = get();
    if (t === "system") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", t);
  }
  function set(t) {
    try { localStorage.setItem(KEY, NAMES.includes(t) ? t : "system"); } catch (e) {}
    apply();
    // the views in this window (other windows hear the storage event)
    for (const f of document.querySelectorAll("iframe")) {
      try { if (f.contentWindow.EqTheme) f.contentWindow.EqTheme.apply(); } catch (e) {}
    }
  }
  apply();
  window.addEventListener("storage", e => { if (!e.key || e.key === KEY) apply(); });
  window.EqTheme = { get, set, apply, names: NAMES };
})();
