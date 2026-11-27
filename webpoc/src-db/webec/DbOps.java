package webec;

/** The database search for WebEngine. This version needs eq-diagr's
 * window-free DBSearch (branch calc-split); src-nodb has a stub. */
final class DbOps {
  private DbOps() {}

  /** @return the components of the databases, as a JSON array of
   * [element, formula, name] */
  static String elements(java.util.List<String> databases) throws Exception {
    java.util.ArrayList<String[]> ec = new java.util.ArrayList<String[]>();
    lib.database.LibDB.readElements(false, new java.util.ArrayList<String>(databases), ec);
    StringBuilder sb = new StringBuilder("[");
    for (int i = 0; i < ec.size(); i++) {
      if (i > 0) {sb.append(',');}
      String[] e = ec.get(i);
      sb.append('[').append(Json.quote(e[0])).append(',').append(Json.quote(e[1])).append(',').append(Json.quote(e[2])).append(']');
    }
    return sb.append(']').toString();
  }

  //<editor-fold defaultstate="collapsed" desc="database search">
  static boolean search(Json answer) throws Exception {
    java.util.ArrayList<String> dbs = new java.util.ArrayList<String>(WebEngine.strings("databases"));
    java.util.ArrayList<String[]> ec = new java.util.ArrayList<String[]>();
    lib.database.LibDB.readElements(false, dbs, ec);
    double t = Double.parseDouble(WebEngine.input("t"));
    String pIn = WebEngine.input("p").trim();
    // "pSat": the vapour-liquid saturation pressure, at least 1 bar, as in DataBase's SetTempPressDialog
    double p = pIn.equalsIgnoreCase("pSat") ? Math.max(1., lib.kemi.H2O.IAPWSF95.pSat(t)) : Double.parseDouble(pIn);
    database.DBSearch srch = new database.DBSearch(dbs, ec, t, p);
    srch.allSolids = Integer.parseInt(WebEngine.input("allSolids"));
    srch.redoxN = Boolean.parseBoolean(WebEngine.input("redoxN"));
    srch.redoxS = Boolean.parseBoolean(WebEngine.input("redoxS"));
    srch.redoxP = Boolean.parseBoolean(WebEngine.input("redoxP"));
    // the components in the order of the DataBase window: H+ first, e- next, solids last
    java.util.List<String> selected = new java.util.ArrayList<String>();
    int nSolids = 0;
    for (String c : WebEngine.strings("components")) {
      selected.add(database.DBSearch.componentPosition(selected, nSolids, c), c);
      if (!c.equals("H+") && !c.equals("e-") && lib.common.Util.isSolid(c)) {nSolids++;}
    }
    final java.util.List<String> warnings = new java.util.ArrayList<String>();
    srch.searchComplexes(selected, new database.DBSearch.Display() {
      @Override public void progressLabel(String text, int nLoop) {}
      @Override public void progress(int percent) {}
      @Override public void solidsExcluded(String text) {System.out.println(text);}
      @Override public boolean askContinue(String msg, String okText) {
        System.out.println(msg);
        warnings.add(msg);
        return WebEngine.confirm(msg + "\n\n(OK = " + okText + ")");
      }
    });
    // species unticked by the user are removed, as in the DataBase window
    java.util.List<String> removed = database.WebSearchResults.remove(srch, WebEngine.strings("exclude"));
    answer.putStrings("species", srch.speciesNames());
    answer.putStrings("removed", removed);
    answer.putRaw("details", database.WebSearchResults.details(srch));
    answer.putStrings("warnings", warnings);
    database.DBSearch.TemperatureCheck chk = srch.checkTemperature();
    answer.putStrings("missing", chk.species);
    if (!chk.ok) {return false;}
    if (Boolean.parseBoolean(WebEngine.input("includeH2O"))) {srch.includeWater(selected);}
    java.io.StringWriter w = new java.io.StringWriter();
    srch.writeDataFile(w, selected);
    answer.put("dat", w.toString());
    return true;
  }
  //</editor-fold>


  /** Converts a binary database to the text format (see DbTools). */
  static boolean toText(Json answer) throws Exception {
    int n = DbTools.binaryToText(WebEngine.input("db"), WebEngine.input("elb"), WebEngine.input("txt"), WebEngine.input("elt"));
    answer.put("reactions", n);
    return true;
  }

  //<editor-fold defaultstate="collapsed" desc="database maintenance (see DbMaint)">
  /** The maintenance operations: dbMerge, dbStats, dbSingleChoices, dbSingle,
   * addCheck, addShow, addSaveReaction, addDeleteReaction,
   * addRemoveComponents, addSaveComponent, addDeleteComponent. */
  static boolean maint(String op, Json answer) throws Exception {
    java.util.List<String> dbs = WebEngine.strings("databases");
    switch (op) {
      case "dbMerge": {
        java.util.List<String> warnings = new java.util.ArrayList<String>();
        answer.put("reactions", DbMaint.merge(dbs, WebEngine.input("out"), warnings));
        answer.putStrings("warnings", warnings);
        return true;
      }
      case "dbStats":
        answer.put("text", DbMaint.statistics(dbs, WebEngine.input("references"), WebEngine.input("date")));
        return true;
      case "dbSingleChoices":
        answer.putStrings("components", DbMaint.singleComponentChoices(dbs, Boolean.parseBoolean(WebEngine.input("includeH2O"))));
        return true;
      case "dbSingle":
        answer.putStrings("lines", DbMaint.singleComponent(dbs, WebEngine.input("component")));
        answer.put("firstLine", lib.database.Complex.FILE_FIRST_LINE);
        return true;
      case "addCheck":
        answer.put("check", DbMaint.addCheck(WebEngine.input("file")));
        return true;
      case "addShow":
        answer.put("content", DbMaint.addShow(WebEngine.input("file"), dbs));
        return true;
      case "addSaveReaction":
        answer.put("saved", DbMaint.addSaveReaction(WebEngine.input("file"), dbs, WebEngine.input("original"),
            WebEngine.input("name"), WebEngine.input("logK"), WebEngine.input("deltaH"), WebEngine.input("deltaCp"),
            WebEngine.strings("reactants"), WebEngine.strings("coefficients"),
            WebEngine.input("reference"), WebEngine.input("comment")));
        return true;
      case "addDeleteReaction":
        answer.putStrings("unused", DbMaint.addDeleteReaction(WebEngine.input("file"), dbs, WebEngine.input("line")));
        return true;
      case "addRemoveComponents":
        DbMaint.addRemoveComponents(WebEngine.input("file"), dbs, WebEngine.strings("remove"));
        return true;
      case "addSaveComponent":
        DbMaint.addSaveComponent(WebEngine.input("file"), dbs, WebEngine.input("name"), WebEngine.input("linkedTo"), WebEngine.input("description"));
        return true;
      case "addDeleteComponent":
        DbMaint.addDeleteComponent(WebEngine.input("file"), dbs, WebEngine.input("name"));
        return true;
      default:
        throw new IllegalArgumentException("unknown operation \"" + op + "\"");
    }
  }
  //</editor-fold>
}
