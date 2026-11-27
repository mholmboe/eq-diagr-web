package webec;

import lib.kemi.chem.Chem;
import lib.kemi.readDataLib.ReadDataLib;
import lib.kemi.readWriteDataFiles.ReadChemSyst;
import lib.kemi.readWriteDataFiles.WriteChemSyst;

/** A data file (".dat") as a model for the browser: read into eq-diagr's
 * Chem classes the way ModReaction reads it, shown as JSON, changed with
 * "key=value" assignments, and written with eq-diagr's WriteChemSyst. */
final class DatModel {
  private DatModel() {}

  /** Reads a data file as ModReaction.readDataFile does: plot and
   * concentration data are optional, temperature and pressure come from the
   * comment of the first line (25 C and 1 bar if missing), and the title line
   * is read after the concentrations. */
  static Chem readChem(String path) throws Exception {
    ReadDataLib rd = new ReadDataLib(new java.io.File(path));
    Chem ch = null;
    try {
      ch = ReadChemSyst.readChemSystAndPlotInfo(rd, false, true, System.out);
    } catch (ReadChemSyst.PlotDataException ex) {
    } catch (ReadChemSyst.ConcDataException ex) {}
    if (ch == null) {
      try {rd.close();} catch (Exception ex) {}
      throw new Exception("Error while reading file \"" + path + "\"");
    }
    double w;
    try {w = rd.getTemperature();} catch (ReadDataLib.DataReadException ex) {System.err.println(ex.getMessage()); w = 25;}
    ch.chemSystem.chemConcs.temperature = w;
    try {w = rd.getPressure();} catch (ReadDataLib.DataReadException ex) {System.err.println(ex.getMessage()); w = 1;}
    ch.chemSystem.chemConcs.pressure = w;
    if (ch.diag.plotType >= 0 && ch.diagrConcs.hur[0] >= 1) {
      try {ch.diag.title = rd.readLine();}
      catch (ReadDataLib.DataEofException ex) {ch.diag.title = null;}
      catch (ReadDataLib.DataReadException ex) {ch.diag.title = null;}
    }
    rd.close();
    return ch;
  }

  /** @return the chemical system and the diagram of a data file, as JSON */
  static String read(String path) throws Exception {
    Chem ch = readChem(path);
    Chem.ChemSystem cs = ch.chemSystem;
    Chem.ChemSystem.NamesEtc namn = cs.namn;
    Json m = new Json();
    int nSpecies = cs.nx + cs.mSol - cs.solidC;
    m.put("na", cs.Na).put("nx", cs.nx).put("nSolids", cs.mSol - cs.solidC).put("solidC", cs.solidC)
     .put("temperature", cs.chemConcs.temperature).put("pressure", cs.chemConcs.pressure);
    StringBuilder comps = new StringBuilder("[");
    for (int i = 0; i < cs.Na; i++) {
      if (i > 0) {comps.append(',');}
      comps.append(new Json().put("name", namn.identC[i]).put("comment", namn.comment[i]));
    }
    m.putRaw("components", comps.append(']').toString());
    StringBuilder sp = new StringBuilder("[");
    for (int ix = 0; ix < nSpecies; ix++) {
      if (ix > 0) {sp.append(',');}
      StringBuilder a = new StringBuilder("[");
      for (int j = 0; j < cs.Na; j++) {if (j > 0) {a.append(',');} a.append(Json.num(cs.a[ix][j]));}
      sp.append(new Json().put("name", namn.ident[cs.Na + ix]).put("logK", cs.lBeta[ix])
              .putRaw("a", a.append(']').toString()).put("comment", namn.comment[cs.Na + ix]));
    }
    m.putRaw("species", sp.append(']').toString());
    Chem.Diagr d = ch.diag;
    m.put("diagram", new Json().put("plotType", d.plotType).put("compX", d.compX).put("compY", d.compY)
            .put("compMain", d.compMain).put("yLow", d.yLow).put("yHigh", d.yHigh).put("Eh", d.Eh)
            .put("oneArea", d.oneArea).put("inputYMinMax", d.inputYMinMax)
            .put("title", d.title).put("endLines", d.endLines));
    StringBuilder cc = new StringBuilder("[");
    for (int i = 0; i < cs.Na; i++) {
      if (i > 0) {cc.append(',');}
      cc.append(new Json().put("hur", ch.diagrConcs.hur[i]).put("cLow", ch.diagrConcs.cLow[i])
              .put("cHigh", ch.diagrConcs.cHigh[i]));
    }
    m.putRaw("concs", cc.append(']').toString());
    return m.toString();
  }

  /** Reads a data file, makes the changes and writes it (to <code>out</code>).
   * Assignments are "key=value" with keys: temperature, pressure,
   * components[i].name|comment, species[k].name|logK|comment|a[j],
   * diagram.plotType|compX|compY|compMain|yLow|yHigh|Eh|oneArea|inputYMinMax|title|endLines,
   * concs[i].hur|cLow|cHigh. Indices start at 0; species[k] is the k-th
   * reaction product in the file. An empty value sets a text field to null. */
  static void set(String path, String out, java.util.List<String> assignments) throws Exception {
    Chem ch = readChem(path);
    Chem.ChemSystem cs = ch.chemSystem;
    for (String asg : assignments) {
      int eq = asg.indexOf('=');
      if (eq < 0) {throw new IllegalArgumentException("not \"key=value\": " + asg);}
      String key = asg.substring(0, eq).trim(), v = asg.substring(eq + 1);
      String text = v.isEmpty() ? null : v;
      java.util.regex.Matcher mt = java.util.regex.Pattern
              .compile("(components|species|concs)\\[(\\d+)\\]\\.(\\w+)(?:\\[(\\d+)\\])?").matcher(key);
      if (key.equals("temperature")) {cs.chemConcs.temperature = Double.parseDouble(v);}
      else if (key.equals("pressure")) {cs.chemConcs.pressure = Double.parseDouble(v);}
      else if (key.startsWith("diagram.")) {
        Chem.Diagr d = ch.diag;
        switch (key.substring(8)) {
          case "plotType": d.plotType = Integer.parseInt(v.trim()); break;
          case "compX": d.compX = Integer.parseInt(v.trim()); break;
          case "compY": d.compY = Integer.parseInt(v.trim()); break;
          case "compMain": d.compMain = Integer.parseInt(v.trim()); break;
          case "oneArea": d.oneArea = Integer.parseInt(v.trim()); break;
          case "yLow": d.yLow = Double.parseDouble(v); break;
          case "yHigh": d.yHigh = Double.parseDouble(v); break;
          case "Eh": d.Eh = Boolean.parseBoolean(v.trim()); break;
          case "inputYMinMax": d.inputYMinMax = Boolean.parseBoolean(v.trim()); break;
          case "title": d.title = text; break;
          case "endLines": d.endLines = text; break;
          default: throw new IllegalArgumentException("unknown key: " + key);
        }
      } else if (mt.matches()) {
        int i = Integer.parseInt(mt.group(2));
        String f = mt.group(3);
        switch (mt.group(1)) {
          case "components":
            check(i, cs.Na, key);
            if (f.equals("name")) {cs.namn.identC[i] = v; cs.namn.ident[i] = v;}
            else if (f.equals("comment")) {cs.namn.comment[i] = text;}
            else {throw new IllegalArgumentException("unknown key: " + key);}
            break;
          case "species":
            check(i, cs.nx + cs.mSol - cs.solidC, key);
            if (f.equals("name")) {cs.namn.ident[cs.Na + i] = v;}
            else if (f.equals("logK")) {cs.lBeta[i] = Double.parseDouble(v);}
            else if (f.equals("comment")) {cs.namn.comment[cs.Na + i] = text;}
            else if (f.equals("a") && mt.group(4) != null) {
              int j = Integer.parseInt(mt.group(4));
              check(j, cs.Na, key);
              cs.a[i][j] = Double.parseDouble(v);
            } else {throw new IllegalArgumentException("unknown key: " + key);}
            break;
          default: // concs
            check(i, cs.Na, key);
            if (f.equals("hur")) {ch.diagrConcs.hur[i] = Integer.parseInt(v.trim());}
            else if (f.equals("cLow")) {ch.diagrConcs.cLow[i] = Double.parseDouble(v);}
            else if (f.equals("cHigh")) {ch.diagrConcs.cHigh[i] = Double.parseDouble(v);}
            else {throw new IllegalArgumentException("unknown key: " + key);}
        }
      } else {throw new IllegalArgumentException("unknown key: " + key);}
    }
    WriteChemSyst.writeChemSyst(ch, new java.io.File(out));
  }

  /** As Spana's Select_Diagram when a data file has no plot or concentration
   * data (for example a file made by DataBase): a default diagram (log
   * concentrations against H+, or e-) and default concentrations are set, and
   * the file is written to <code>out</code>.
   * @return true if defaults were set, false if the file already had a diagram */
  static boolean defaults(String path, String out) throws Exception {
    Chem ch = readChem(path);
    Chem.ChemSystem cs = ch.chemSystem;
    boolean missing = ch.diag.plotType < 0 || ch.diagrConcs.hur[0] < 1;
    if (missing) {
      ch.diag.Eh = true;
      lib.kemi.readWriteDataFiles.DefaultPlotAndConcs.setDefaultPlot(cs, ch.diag, ch.diagrConcs);
      lib.kemi.readWriteDataFiles.DefaultPlotAndConcs.setDefaultConcs(cs, ch.diagrConcs, false);
      lib.kemi.readWriteDataFiles.DefaultPlotAndConcs.checkConcsInAxesAndMain(cs.namn, ch.diag, ch.diagrConcs, false, false);
    }
    WriteChemSyst.writeChemSyst(ch, new java.io.File(out));
    return missing;
  }

  private static void check(int i, int n, String key) {
    if (i < 0 || i >= n) {throw new IllegalArgumentException("index out of range (0 to " + (n - 1) + "): " + key);}
  }
}
