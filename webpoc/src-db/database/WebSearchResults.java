package database;

/** Browser build: what the DataBase window does with the results of a search,
 * without the window. It is in package <code>database</code> to reach the
 * search results (DBSearch.dat, nx, nf), as FrameDBmain does. */
public final class WebSearchResults {
  private WebSearchResults() {}

  /** Removes species from the results before the data file is written, as
   * clicking a species in the DataBase window does (FrameDBmain.complexClick).
   * @return the names that were removed */
  public static java.util.List<String> remove(DBSearch srch, java.util.Collection<String> names) {
    java.util.List<String> removed = new java.util.ArrayList<String>();
    for (int i = srch.dat.size() - 1; i >= 0; i--) {
      String n = srch.dat.get(i).name;
      if (!names.contains(n)) {continue;}
      if (lib.common.Util.isSolid(n)) {srch.nf--;} else {srch.nx--;}
      srch.dat.remove(i);
      removed.add(n);
    }
    return removed;
  }

  /** @return for each species found: name, reaction with logK at the
   * temperature and pressure of the search, logK (NaN if it can not be
   * calculated), reference keys and comment, and the data of the "show
   * Details" window (the reaction, logK at 25 C, delta-H and delta-Cp or the
   * kind of temperature function, the highest temperature and pressure);
   * as a JSON array. (The page
   * looks up the reference keys in the references file.) */
  public static String details(DBSearch srch) {
    StringBuilder sb = new StringBuilder("[");
    for (int i = 0; i < srch.nx + srch.nf; i++) {
      lib.database.Complex c = srch.dat.get(i);
      double lgK = c.logKatTandP(srch.temperature_C, srch.pressure_bar);
      if (i > 0) {sb.append(',');}
      sb.append("{\"name\":").append(q(c.name))
        .append(",\"solid\":").append(lib.common.Util.isSolid(c.name))
        .append(",\"reaction\":").append(q(c.reactionTextWithLogK(srch.temperature_C, srch.pressure_bar)))
        .append(",\"logK\":").append(Double.isNaN(lgK) || Double.isInfinite(lgK) ? "null" : String.valueOf(lgK))
        .append(",\"reference\":").append(q(c.reference))
        .append(",\"comment\":").append(q(c.comment))
        // as the "show Details" window of DataBase (lib.database.ShowDetailsDialog)
        .append(",\"equation\":").append(q(c.reactionText()))
        .append(",\"logK25\":").append(num(c.constant))
        .append(",\"analytic\":").append(c.analytic)
        .append(",\"lookUp\":").append(c.lookUp)
        .append(",\"deltaH\":").append(c.analytic || c.lookUp ? "null" : num(c.getDeltaH()))
        .append(",\"deltaCp\":").append(c.analytic || c.lookUp ? "null" : num(c.getDeltaCp()))
        .append(",\"tMax\":").append(atLeast(c.tMax, 25))
        .append(",\"pMax\":").append(atLeast(c.pMax, 1)).append('}');
    }
    return sb.append(']').toString();
  }

  /** a number, or null for missing data (Complex.EMPTY, NaN) */
  private static String num(double v) {
    return Double.isNaN(v) || Double.isInfinite(v) || v == lib.database.Complex.EMPTY ? "null" : String.valueOf(v);
  }
  /** the highest temperature or pressure of the data; without one, that of the constant (25 C, 1 bar) */
  private static String atLeast(double v, double least) {
    return String.valueOf(Double.isNaN(v) || v == lib.database.Complex.EMPTY || v < least ? least : v);
  }

  private static String q(String s) {
    if (s == null) {return "null";}
    StringBuilder b = new StringBuilder("\"");
    for (char ch : s.toCharArray()) {
      if (ch == '"' || ch == '\\') {b.append('\\').append(ch);}
      else if (ch == '\n') {b.append("\\n");}
      else if (ch == '\r') {b.append("\\r");}
      else if (ch == '\t') {b.append("\\t");}
      else if (ch < 0x20) {b.append(String.format("\\u%04x", (int) ch));}
      else {b.append(ch);}
    }
    return b.append('"').toString();
  }
}
