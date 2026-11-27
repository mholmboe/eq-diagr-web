package webec;

import org.teavm.jso.JSBody;

/** The eq-diagr engine for the browser: one entry point for all programs,
 * meant to run in a Web Worker (see web/engine-worker.js).
 * <p>Each call of main() reads <code>globalThis.engineInput</code> (an object
 * with string fields and string arrays) and answers with
 * <code>globalThis.engineReport(json)</code>. Files live in TeaVM's in-memory
 * file system, so the programs read and write them as on the desktop.
 * <p>Operations (<code>op</code>):
 * <ul>
 * <li><b>write</b>: <code>paths[]</code> with <code>texts[]</code> or
 *   <code>base64[]</code>; directories are created as needed.</li>
 * <li><b>read</b>: <code>paths[]</code>, <code>binary</code> ("true" for base64);
 *   answer <code>files</code> {path: content or null}.</li>
 * <li><b>list</b>: <code>dir</code>; answer <code>names</code>.</li>
 * <li><b>remove</b>: <code>paths[]</code>.</li>
 * <li><b>run</b>: <code>program</code> (ec, sed, predom, plotpdf, plotps,
 *   modchemsyst, modreaction) and its command-line <code>args[]</code>; answer
 *   <code>log</code> and <code>info</code>.</li>
 * <li><b>elements</b> and <b>search</b>: the database search (see DbOps); search
 *   also takes <code>exclude[]</code> (species to leave out) and answers
 *   <code>details</code> for each species.</li>
 * <li><b>dbToText</b>: <code>db</code>, <code>elb</code>, <code>txt</code>, <code>elt</code>;
 *   converts a binary database to the text format, as DataMaintenance does.</li>
 * <li><b>datRead</b>: <code>path</code> of a data file; answer <code>model</code>,
 *   the chemical system and diagram as JSON.</li>
 * <li><b>datSet</b>: <code>path</code>, <code>out</code> and <code>set[]</code>
 *   ("key=value" assignments, see {@link DatModel#set}); the data file is read,
 *   changed and written with eq-diagr's own reader and writer.</li>
 * <li><b>datDefaults</b>: <code>path</code>, <code>out</code>; a default diagram and
 *   concentrations for a data file without them, as Spana does.</li>
 * <li><b>dbMerge</b>, <b>dbStats</b>, <b>dbSingleChoices</b>, <b>dbSingle</b> and
 *   <b>add...</b>: the database maintenance tools (see DbOps.maint, DbMaint).</li>
 * <li><b>datMove</b>: <code>path</code>, <code>out</code>, <code>comp</code>,
 *   <code>up</code>; moves a component up or down in the list (Spana's
 *   "Modify chemical system", see {@link SysEdit}).</li>
 * <li><b>datMerge</b>: <code>path</code>, <code>path2</code>, <code>out</code>;
 *   merges two chemical systems (Spana's "Modify chemical system"); answers
 *   <code>warnings[]</code>.</li>
 * </ul>
 * Every answer has <code>ok</code>, <code>log</code> (everything the programs
 * printed) and, on failure, <code>error</code>. */
public class WebEngine {

  @JSBody(params = {"key"}, script = "var v = globalThis.engineInput[key];"
          + " return v == null ? '' : (Array.isArray(v) ? v.join('\\n') : String(v));")
  static native String input(String key);

  @JSBody(params = {"key"}, script = "var v = globalThis.engineInput[key];"
          + " return v == null ? 0 : (Array.isArray(v) ? v.length : 1);")
  static native int count(String key);

  @JSBody(params = {"key", "i"}, script = "var v = globalThis.engineInput[key];"
          + " return String(Array.isArray(v) ? v[i] : v);")
  static native String item(String key, int i);

  @JSBody(params = {"json"}, script = "globalThis.engineReport(json);")
  static native void report(String json);

  @JSBody(params = {"msg"}, script = "return typeof globalThis.confirm === 'function' ? globalThis.confirm(msg) : true;")
  static native boolean confirm(String msg);

  public static void main(String[] args) {
    java.io.ByteArrayOutputStream buf = new java.io.ByteArrayOutputStream();
    java.io.PrintStream log;
    try {log = new java.io.PrintStream(buf, true, "UTF-8");}
    catch (java.io.UnsupportedEncodingException ex) {log = new java.io.PrintStream(buf, true);}
    java.io.PrintStream out0 = System.out, err0 = System.err;
    System.setOut(log); System.setErr(log);   // the programs print to System.out and System.err
    Json answer = new Json();
    boolean ok = false;
    String error = null;
    long t0 = System.currentTimeMillis();
    try {
      ok = dispatch(input("op"), answer, log);
    } catch (Throwable t) {
      error = t.toString();
      log.println("Error: " + t);
    }
    log.flush();
    System.setOut(out0); System.setErr(err0);
    String logText;
    try {logText = buf.toString("UTF-8");} catch (java.io.UnsupportedEncodingException ex) {logText = buf.toString();}
    answer.put("ok", ok).put("ms", System.currentTimeMillis() - t0).put("log", logText);
    if (error != null) {answer.put("error", error);}
    report(answer.toString());
  }

  private static boolean dispatch(String op, Json answer, java.io.PrintStream log) throws Exception {
    switch (op) {
      case "write": {
        int n = count("paths");
        boolean b64 = count("base64") > 0;
        for (int i = 0; i < n; i++) {
          String path = item("paths", i);
          mkdirs(path);
          byte[] bytes = b64 ? java.util.Base64.getDecoder().decode(item("base64", i))
                             : item("texts", i).getBytes("UTF-8");
          try (java.io.OutputStream os = new java.io.FileOutputStream(path)) {os.write(bytes);}
        }
        return true;
      }
      case "read": {
        boolean binary = Boolean.parseBoolean(input("binary"));
        Json files = new Json();
        for (int i = 0; i < count("paths"); i++) {
          String path = item("paths", i);
          java.io.File f = new java.io.File(path);
          if (!f.exists()) {files.put(path, (String) null); continue;}
          byte[] bytes = readBytes(f);
          files.put(path, binary ? java.util.Base64.getEncoder().encodeToString(bytes) : new String(bytes, "UTF-8"));
        }
        answer.put("files", files);
        return true;
      }
      case "list": {
        String[] names = new java.io.File(input("dir")).list();
        java.util.List<String> l = new java.util.ArrayList<String>();
        if (names != null) {java.util.Collections.addAll(l, names); java.util.Collections.sort(l);}
        answer.putStrings("names", l);
        return names != null;
      }
      case "remove": {
        for (int i = 0; i < count("paths"); i++) {new java.io.File(item("paths", i)).delete();}
        return true;
      }
      case "run":
        return run(input("program"), strings("args"), answer, log);
      case "elements":
        answer.putRaw("elements", DbOps.elements(strings("databases")));
        return true;
      case "search":
        return DbOps.search(answer);
      case "dbToText":
        return DbOps.toText(answer);
      case "datRead":
        answer.putRaw("model", DatModel.read(input("path")));
        return true;
      case "datDefaults":
        answer.put("defaulted", DatModel.defaults(input("path"), input("out")));
        return true;
      case "datSet":
        DatModel.set(input("path"), input("out"), strings("set"));
        return true;
      case "datMove":
        SysEdit.move(input("path"), input("out"), Integer.parseInt(input("comp").trim()),
                Boolean.parseBoolean(input("up").trim()));
        return true;
      case "datMerge":
        answer.putStrings("warnings", SysEdit.merge(input("path"), input("path2"), input("out")).warnings);
        return true;
      default:
        if (op.startsWith("db") || op.startsWith("add")) {return DbOps.maint(op, answer);}
        throw new IllegalArgumentException("unknown operation \"" + op + "\"");
    }
  }

  //<editor-fold defaultstate="collapsed" desc="run a program">
  /** Runs one of the eq-diagr programs with its command-line arguments, as
   * on the desktop with "-nostop". */
  private static boolean run(String program, java.util.List<String> argList, Json answer,
          java.io.PrintStream log) throws Exception {
    java.util.List<String> a = new java.util.ArrayList<String>(argList);
    if (!program.equals("ec") && !a.contains("-nostop")) {a.add("-nostop");}
    String[] args = a.toArray(new String[0]);
    Json info = new Json();
    boolean ok;
    switch (program) {
      case "ec":
        ec.EC.webReset();
        try {ec.EC.main(args); ok = true;}
        catch (WebSupport.Quit q) {ok = true;}   // EC ends with System.exit(0)
        break;
      case "sed": {
        // SED prints its messages to its window and to the console: once in the log (DedupLog)
        DedupLog d = new DedupLog(log);
        java.io.PrintStream o = System.out, e = System.err;
        System.setOut(d.consoleOut); System.setErr(d.consoleErr);
        try {
          simpleEquilibriumDiagrams.SedWeb sed = new simpleEquilibriumDiagrams.SedWeb(d.out, d.err);
          ok = sed.run(args);
          info.put("points", sed.pointsCalculated()).put("failed", sed.pointsFailed()).put("calcMillis", sed.calcMillis());
        } finally {d.finish(); System.setOut(o); System.setErr(e);}
        break;
      }
      case "predom": {
        DedupLog d = new DedupLog(log);
        java.io.PrintStream o = System.out, e = System.err;
        System.setOut(d.consoleOut); System.setErr(d.consoleErr);
        try {
          predominanceAreaDiagrams.PredomWeb predom = new predominanceAreaDiagrams.PredomWeb(d.out, d.err);
          ok = predom.run(args);
          int n = predom.gridSteps() + 1;
          info.put("points", n * n).put("calcMillis", predom.calcMillis());
        } finally {d.finish(); System.setOut(o); System.setErr(e);}
        break;
      }
      case "plotpdf":
        new plotPDF.PlotPDF(false, true, args);
        ok = true;
        break;
      case "plotps":
        new plotPS.PlotPS(false, true, args);
        ok = true;
        break;
      case "modchemsyst":
        new modifyChemSyst.ModChemSyst(false, true, args);
        ok = true;
        break;
      case "modreaction":
        new modifyReaction.ModReaction(false, true, args);
        ok = true;
        break;
      default:
        throw new IllegalArgumentException("unknown program \"" + program + "\"");
    }
    answer.put("info", info);
    return ok;
  }
  //</editor-fold>

  //<editor-fold defaultstate="collapsed" desc="helpers">
  static java.util.List<String> strings(String key) {
    java.util.List<String> l = new java.util.ArrayList<String>();
    for (int i = 0; i < count(key); i++) {l.add(item(key, i));}
    return l;
  }

  private static void mkdirs(String path) {
    java.io.File parent = new java.io.File(path).getAbsoluteFile().getParentFile();
    if (parent != null) {parent.mkdirs();}
  }

  static byte[] readBytes(java.io.File f) throws java.io.IOException {
    java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream();
    try (java.io.InputStream is = new java.io.FileInputStream(f)) {
      byte[] b = new byte[8192];
      int k;
      while ((k = is.read(b)) > 0) {bo.write(b, 0, k);}
    }
    return bo.toByteArray();
  }
  //</editor-fold>
}
