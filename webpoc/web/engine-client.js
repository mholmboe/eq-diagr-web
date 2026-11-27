// Client for the eq-diagr engine running in a Web Worker (engine-worker.js).
// All methods return promises; calls are handled one at a time, in order.
//
//   const engine = new EqDiagrEngine();
//   await engine.writeFiles({ "/work/Fe.dat": datText });
//   const r = await engine.run("sed", ["-d=/work/Fe.dat", "-tbl"], { outputs: ["/work/Fe.plt", "/work/Fe.csv"] });
//   r.ok, r.log, r.info, r.files["/work/Fe.plt"]
//
// stop() ends a long calculation by restarting the worker; files written with
// {persist: true} (databases, for example) are written again to the new worker.
(function (global) {
  function toBase64(data) {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }

  class EqDiagrEngine {
    constructor(workerUrl) {
      this.workerUrl = workerUrl || "engine-worker.js";
      this.persistent = new Map();   // path -> {text} or {base64}
      this.queue = Promise.resolve();
      this._start();
    }

    _start() {
      this.worker = new Worker(this.workerUrl);
      this.pending = new Map();
      this.nextId = 1;
      this.worker.onmessage = e => {
        const p = this.pending.get(e.data.id);
        if (p) { this.pending.delete(e.data.id); p.resolve(e.data.result); }
      };
      this.worker.onerror = e => {
        const msg = e.message || "worker error";
        for (const p of this.pending.values()) p.resolve({ ok: false, error: msg, log: "" });
        this.pending.clear();
      };
    }

    /** One engine operation (see WebEngine.java); resolves to the engine's answer. */
    call(op, args) {
      const id = this.nextId++;
      return new Promise(resolve => {
        this.pending.set(id, { resolve });
        this.worker.postMessage({ id, op, args: args || {} });
      });
    }

    /** Stops whatever the engine is doing: the worker is replaced by a new one,
     * and the persistent files are written to it again. */
    async stop() {
      this.worker.terminate();
      for (const p of this.pending.values()) p.resolve({ ok: false, stopped: true, error: "stopped", log: "" });
      this._start();
      if (this.persistent.size) await this._writeMap(this.persistent);
    }

    /** files: {path: string | ArrayBuffer | Uint8Array}. Strings are written as UTF-8. */
    writeFiles(files, opts) {
      const m = new Map();
      for (const [path, data] of Object.entries(files)) {
        m.set(path, typeof data === "string" ? { text: data } : { base64: toBase64(data) });
      }
      if (opts && opts.persist) for (const [k, v] of m) this.persistent.set(k, v);
      return this._writeMap(m);
    }

    async _writeMap(m) {
      const text = [...m].filter(([, v]) => "text" in v), bin = [...m].filter(([, v]) => "base64" in v);
      let r = { ok: true };
      if (text.length) r = await this.call("write", { paths: text.map(x => x[0]), texts: text.map(x => x[1].text) });
      if (r.ok && bin.length) r = await this.call("write", { paths: bin.map(x => x[0]), base64: bin.map(x => x[1].base64) });
      return r;
    }

    /** Resolves to {path: text (or base64 if binary) or null if missing}. */
    async readFiles(paths, opts) {
      const r = await this.call("read", { paths, binary: !!(opts && opts.binary) });
      return r.files || {};
    }

    list(dir) { return this.call("list", { dir }); }
    remove(paths) { return this.call("remove", { paths }); }

    /** Runs a program (ec, sed, predom, plotpdf, plotps, modchemsyst, modreaction)
     * with its command-line arguments. opts.files: input files to write first;
     * opts.outputs / opts.binaryOutputs: files to read afterwards (and to delete
     * before the run, so that stale results are not returned). */
    async run(program, args, opts) {
      opts = opts || {};
      const outs = (opts.outputs || []).concat(opts.binaryOutputs || []);
      if (opts.files) await this.writeFiles(opts.files);
      if (outs.length) await this.remove(outs);
      const r = await this.call("run", { program, args });
      r.files = {};
      if (opts.outputs && opts.outputs.length) Object.assign(r.files, await this.readFiles(opts.outputs));
      if (opts.binaryOutputs && opts.binaryOutputs.length) Object.assign(r.files, await this.readFiles(opts.binaryOutputs, { binary: true }));
      return r;
    }

    /** Components of the databases: resolves to {ok, elements: [[element, formula, name], ...]}. */
    elements(databases) { return this.call("elements", { databases }); }

    /** Database search; opts: {databases, components, t, p, allSolids, redoxN, redoxS, redoxP, includeH2O}.
     * Resolves to {ok, dat, species, missing, warnings, log}. */
    search(opts) {
      const o = Object.assign({ t: 25, p: 1, allSolids: 0, redoxN: true, redoxS: true, redoxP: true, includeH2O: false }, opts);
      return this.call("search", o);
    }

    /** Converts a binary database (paths of the .db and .elb files in the engine) to the
     * text format; resolves to {ok, reactions, files: {txt, elt}} with the new files' text. */
    async dbToText(db, elb) {
      const txt = db.replace(/\.db$/i, ".txt"), elt = elb.replace(/\.elb$/i, ".elt");
      const r = await this.call("dbToText", { db, elb, txt, elt });
      if (r.ok) r.files = await this.readFiles([txt, elt]);
      return r;
    }

    /** The chemical system and diagram of a data file (path in the engine, or {text}). */
    async datRead(src) {
      const path = typeof src === "string" ? src : "/work/_model.dat";
      if (typeof src !== "string") await this.writeFiles({ [path]: src.text });
      return this.call("datRead", { path });
    }

    /** A default diagram and concentrations for a data file without them (as Spana);
     * resolves to {ok, dat, defaulted, log}. */
    async datDefaults(text) {
      await this.writeFiles({ "/work/_in.dat": text });
      const r = await this.call("datDefaults", { path: "/work/_in.dat", out: "/work/_out.dat" });
      if (r.ok) r.dat = (await this.readFiles(["/work/_out.dat"]))["/work/_out.dat"];
      return r;
    }

    /** Changes a data file with "key=value" assignments; resolves to {ok, dat, log}. */
    async datSet(text, assignments) {
      await this.writeFiles({ "/work/_in.dat": text });
      const r = await this.call("datSet", { path: "/work/_in.dat", out: "/work/_out.dat", set: assignments });
      if (r.ok) r.dat = (await this.readFiles(["/work/_out.dat"]))["/work/_out.dat"];
      return r;
    }

    /** The database maintenance tools (DataMaintenance; see webec.DbMaint):
     * op is dbMerge, dbStats, dbSingleChoices, dbSingle, or one of the add-data
     * operations addCheck, addShow, addSaveReaction,
     * addDeleteReaction, addRemoveComponents, addSaveComponent, addDeleteComponent.
     * params has the database paths in the engine (databases[]) and the
     * operation's own fields. */
    maint(op, params) { return this.call(op, params); }

    /** Moves component number comp (from 0) one place up or down, as Spana's
     * "Modify chemical system"; resolves to {ok, dat, log}. */
    async datMove(text, comp, up) {
      await this.writeFiles({ "/work/_in.dat": text });
      const r = await this.call("datMove", { path: "/work/_in.dat", out: "/work/_out.dat", comp, up: !!up });
      if (r.ok) r.dat = (await this.readFiles(["/work/_out.dat"]))["/work/_out.dat"];
      return r;
    }

    /** Merges the chemical system of text2 into that of text, as Spana's
     * "Modify chemical system"; resolves to {ok, dat, warnings, log}. */
    async datMerge(text, text2) {
      await this.writeFiles({ "/work/_in.dat": text, "/work/_in2.dat": text2 });
      const r = await this.call("datMerge", { path: "/work/_in.dat", path2: "/work/_in2.dat", out: "/work/_out.dat" });
      if (r.ok) r.dat = (await this.readFiles(["/work/_out.dat"]))["/work/_out.dat"];
      return r;
    }
  }

  global.EqDiagrEngine = EqDiagrEngine;
})(typeof window !== "undefined" ? window : globalThis);
