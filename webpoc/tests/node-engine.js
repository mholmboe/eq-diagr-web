// The eq-diagr engine in Node, for tests and scripts: a vm context stands in
// for the Web Worker. Usage: const engine = require("./node-engine.js")();
const fs = require("fs"), vm = require("vm"), path = require("path");
const WEB = path.join(__dirname, "..", "web");
class NodeWorker {
  constructor(url) {
    const ctx = { console, performance, setTimeout };
    vm.createContext(ctx);
    ctx.self = vm.runInContext("globalThis", ctx);   // as in a worker, self is the global object
    ctx.importScripts = (...urls) => urls.forEach(u => vm.runInContext(fs.readFileSync(path.join(WEB, u), "utf8"), ctx));
    ctx.postMessage = data => setImmediate(() => this.onmessage && this.onmessage({ data }));
    vm.runInContext(fs.readFileSync(path.join(WEB, url), "utf8"), ctx);
    this.ctx = ctx;
  }
  postMessage(data) { setImmediate(() => this.ctx.onmessage({ data: JSON.parse(JSON.stringify(data)) })); }
  terminate() {}
}
module.exports = () => {
  globalThis.Worker = NodeWorker;
  if (!globalThis.EqDiagrEngine) vm.runInThisContext(fs.readFileSync(path.join(WEB, "engine-client.js"), "utf8"));
  const engine = new globalThis.EqDiagrEngine();
  // the database search asks questions as the page does (engine-worker.js: result.ask);
  // here every question is answered "Continue", as DataBase's reference runs did.
  // engine.searchOnce gives the first answer, with its question.
  engine.searchOnce = engine.search.bind(engine);
  engine.search = async opts => {
    const accepted = [];
    for (;;) {
      const r = await engine.searchOnce(Object.assign({}, opts, { accepted }));
      if (!r.ask || accepted.includes(r.ask)) return r;
      accepted.push(r.ask);
    }
  };
  return engine;
};
