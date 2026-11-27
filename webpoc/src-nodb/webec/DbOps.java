package webec;

/** Stub of the database search, used when eq-diagr does not have the
 * window-free DBSearch (see src-db/webec/DbOps.java). */
final class DbOps {
  private DbOps() {}
  private static final String MSG = "The database search needs eq-diagr's window-free DBSearch (branch calc-split).";
  static String elements(java.util.List<String> databases) {throw new UnsupportedOperationException(MSG);}
  static boolean search(Json answer) {throw new UnsupportedOperationException(MSG);}
  static boolean toText(Json answer) {throw new UnsupportedOperationException(MSG);}
  static boolean maint(String op, Json answer) {throw new UnsupportedOperationException(MSG);}
}
