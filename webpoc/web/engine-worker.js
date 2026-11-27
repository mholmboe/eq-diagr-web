// Web Worker that runs the eq-diagr engine (engine.js: EC, SED, Predom,
// PlotPDF, PlotPS, ModChemSyst, ModReaction and the database search, compiled
// from Java with TeaVM). Messages in: {id, op, args}; messages out: {id, result}.
// See webec/WebEngine.java for the operations and engine-client.js for the API.
importScripts("engine.js");

// Questions of the engine (WebEngine.confirm, for example the warning of the
// database search about two components of the same element) cannot wait for
// the user in a worker. The first question not yet answered stops the
// operation with the answer "no" and is returned as result.ask; the page asks
// the user and, on "yes", runs the operation again with the question in
// args.accepted.
self.onmessage = e => {
  const { id, op, args } = e.data;
  let result = null, ask = null;
  const accepted = (args && args.accepted) || [];
  self.confirm = msg => {
    if (accepted.includes(msg)) return true;
    if (ask === null) ask = msg;
    return false;
  };
  self.engineInput = Object.assign({ op }, args || {});
  self.engineReport = json => { result = JSON.parse(json); };
  try { main([]); }
  catch (err) { result = { ok: false, error: String(err), log: "" }; }
  if (!result) result = { ok: false, error: "no answer from the engine", log: "" };
  if (ask !== null) result.ask = ask;
  self.postMessage({ id, result });
};
