// Questions asked in the page instead of with the browser's confirm() and
// prompt(), which some browsers and embedded views block, answering "cancel"
// without showing anything.
//   if (!(await EqDialog.confirm("Delete X?", { ok: "Delete" }))) return;
//   const name = await EqDialog.prompt("Name of the file:", "New.txt");   // null: cancelled
//   const a = await EqDialog.choose("Save?", [["save", "Save"], ["discard", "Don't save"], ["cancel", "Cancel"]]);
(function (global) {
  let dlg = null;
  function build() {
    dlg = document.createElement("dialog");
    dlg.className = "eqdlg";
    dlg.innerHTML = `<form method="dialog"><p class="msg"></p><input class="txt" type="text" spellcheck="false">` +
      `<div class="btns"></div></form>`;
    document.body.appendChild(dlg);
  }
  // buttons: [[value, label], ...], the first one the default (OK); Escape answers null
  function ask(message, buttons, input) {
    if (!dlg) build();
    const msg = dlg.querySelector(".msg"), field = dlg.querySelector("input"), box = dlg.querySelector(".btns");
    msg.textContent = message;
    field.hidden = input === null;
    field.value = input === null ? "" : input;
    // the first button comes first, so that Enter in the text field answers it; CSS puts it on the right
    box.innerHTML = "";
    buttons.forEach(([value, label], k) => {
      const b = document.createElement("button");
      b.value = value; b.textContent = label;
      if (k === 0) b.className = "primary"; else b.formNoValidate = true;
      box.appendChild(b);
    });
    dlg.returnValue = "";
    return new Promise(resolve => {
      dlg.addEventListener("close", () => {
        const v = dlg.returnValue;
        resolve(buttons.some(([value]) => value === v) ? v : null);
      }, { once: true });
      dlg.showModal();
      if (input === null) box.firstChild.focus(); else { field.focus(); field.select(); }
    });
  }
  global.EqDialog = {
    confirm: async (message, opts = {}) =>
      (await ask(message, [["ok", opts.ok || "OK"], ["cancel", opts.cancel || "Cancel"]], null)) === "ok",
    prompt: async (message, value = "", opts = {}) => {
      const field = String(value);
      const a = await ask(message, [["ok", opts.ok || "OK"], ["cancel", opts.cancel || "Cancel"]], field);
      return a === "ok" ? dlg.querySelector("input").value : null;
    },
    /** one of several answers: buttons [[value, label], ...]; resolves to a value, or null (Escape) */
    choose: (message, buttons) => ask(message, buttons, null)
  };
})(window);
