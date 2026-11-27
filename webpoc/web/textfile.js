// Text files from the user's computer. The desktop programs read and write
// data files as UTF-8, but older files, and files saved from a Windows text
// editor as "ANSI", are in the Windows encoding (windows-1252), where the
// middle dot of "FeSO4·7H2O(cr)" is one byte; read as UTF-8 it becomes the
// replacement character (two of the examples of eq-diagr are such files).
// The file is therefore read as UTF-8 when its bytes are valid UTF-8, and as
// windows-1252 otherwise (UTF-16 by its mark).
//   const text = await EqText.read(file);        // a File or a Response
//   const text = EqText.decode(arrayBuffer);
//   EqText.isDataFile(text)                      // the first line of an input file for SED and Predom
(function (global) {
  function decode(buffer) {
    const b = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    if (b[0] === 0xFF && b[1] === 0xFE) return new TextDecoder("utf-16le").decode(b);
    if (b[0] === 0xFE && b[1] === 0xFF) return new TextDecoder("utf-16be").decode(b);
    try { return new TextDecoder("utf-8", { fatal: true }).decode(b); }
    catch (e) { return new TextDecoder("windows-1252").decode(b); }
  }
  // the numbers of components, complexes, solids and solid components
  const isDataFile = text => /^\s*\d+\s*[, ]\s*\d+\s*[, ]\s*\d+\s*[, ]\s*\d+\s*(,|\/|$)/.test(String(text).split(/\r?\n/).find(l => l.trim()) || "");
  global.EqText = { decode, isDataFile, read: async file => decode(await file.arrayBuffer()) };
})(window);
