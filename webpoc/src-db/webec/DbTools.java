package webec;

/** Database tools for the browser (a part of DataMaintenance): converting a
 * binary database (".db" with its ".elb" element file) into the text format
 * (".txt" with ".elt"), which can be edited and loaded again. The steps are
 * those of DataMaintenance's "convert to text" (DataMaintenance.java), which
 * are inside its window class. */
final class DbTools {
  private DbTools() {}
  private static final String nl = System.getProperty("line.separator");

  /** @return the number of reactions written */
  static int binaryToText(String db, String elb, String txt, String elt) throws java.io.IOException {
    // element file: as DataMaintenance, one line per element
    try (java.io.DataInputStream dis = new java.io.DataInputStream(new java.io.FileInputStream(elb));
         java.io.Writer w = new java.io.BufferedWriter(new java.io.OutputStreamWriter(new java.io.FileOutputStream(elt), "UTF-8"))) {
      try {
        while (true) {
          String elemSymbol = dis.readUTF();
          int n = dis.readInt();
          w.write(Fmt.format("%-2s,%2d ,", elemSymbol, n));
          for (int j = 0; j < n; j++) {w.write(dis.readUTF() + "," + dis.readUTF() + ",");}
          w.write(nl);
        }
      } catch (java.io.EOFException ex) {/* end of the element file */}
    }
    // reactions
    int n = 0;
    try (java.io.DataInputStream dis = new java.io.DataInputStream(new java.io.FileInputStream(db));
         java.io.Writer w = new java.io.BufferedWriter(new java.io.OutputStreamWriter(new java.io.FileOutputStream(txt), "UTF-8"))) {
      w.write(lib.database.Complex.FILE_FIRST_LINE + nl);
      while (true) {
        lib.database.Complex c;
        try {c = lib.database.LibDB.getBinComplex(dis);}
        catch (lib.database.LibDB.ReadBinCmplxException ex) {throw new java.io.IOException(ex.getMessage());}
        if (c == null) {break;}
        try {lib.database.LibDB.writeTxtComplex(w, c);}
        catch (Exception ex) {throw new java.io.IOException(ex.getMessage());}
        n++;
      }
    }
    return n;
  }
}
