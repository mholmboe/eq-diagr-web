package webec;

import lib.common.MsgExceptn;
import lib.common.Util;
import lib.database.AddDataElem;
import lib.database.CheckDatabases;
import lib.database.Complex;
import lib.database.CSVparser;
import lib.database.LibDB;
import lib.database.LibSearch;
import lib.database.References;
import lib.huvud.Div;

/** The database maintenance tools for the browser: the work that the windows
 * of DataMaintenance (merge to a single binary database, statistics and
 * checks, data for a single component, add data or edit a text database) do,
 * without the windows. Each method follows the window method named in its
 * comment; the library calls (LibDB, LibSearch, CheckDatabases, AddDataElem,
 * Complex, References) are eq-diagr's own (see patch_dblib.py). Questions
 * that the windows ask are asked by the browser page before the call. */
final class DbMaint {
  private DbMaint() {}
  private static final String nl = System.getProperty("line.separator");

  //<editor-fold defaultstate="collapsed" desc="merge into a single binary database">
  /** As DataMaintenance.toBinary: all databases (text or binary) are read and
   * written as a single binary database <code>out</code> (".db") with its
   * element file (".elb"). A reaction found again replaces the earlier one;
   * a name starting with "@" removes earlier reactions with that name.
   * <p>
   * Reactions with an error (DataMaintenance asks whether to go on, for each
   * one) are listed in <code>warnings</code> and kept, as when the user
   * answers "OK".
   * <p>
   * Binary input databases: DataMaintenance adds their reactions inside the
   * loop over the reactions already read, so nothing is added from the first
   * binary database, and a later one fails with a
   * ConcurrentModificationException. Here the reactions of a binary database
   * are read with the same rule as those of a text database, so that merging a
   * binary database gives the same as merging it converted to text. */
  static int merge(java.util.List<String> dbs, String out, java.util.List<String> warnings) throws Exception {
    if (dbs.isEmpty()) {throw new Exception("There are NO databases to convert to binary!");}
    for (String d : dbs) {
      if (d.equalsIgnoreCase(out)) {
        throw new Exception("? Can not create output file:" + nl + "    \"" + out + "\"" + nl
                + "Because it is given in the input database-list.");
      }
    }
    mkdirs(out);
    java.util.ArrayList<String> dataBasesList = new java.util.ArrayList<String>(dbs);
    java.util.ArrayList<String[]> eComp = new java.util.ArrayList<String[]>();
    if (!LibDB.getElements(null, false, dataBasesList, eComp)) {throw new Exception("Could not read the element files.");}
    String fileElemSaveName = Div.getFileNameWithoutExtension(out) + ".elb";
    // as DataMaintenance's TreeSet (see JdkTreeSet: Complex.compareTo sorts reactants in place)
    JdkTreeSet<Complex> dataList = new JdkTreeSet<Complex>();
    java.util.ArrayList<Complex> toRemove = new java.util.ArrayList<Complex>();
    Complex complex, oldCmplx;
    String msg;
    boolean found;
    int nTot;
    for (String dbName : dataBasesList) {
      java.io.File f = new java.io.File(dbName);
      if (!f.exists() || !f.canRead()) {throw new Exception("Error - file \"" + dbName + "\" can not be read.");}
      System.out.println("Reading file \"" + f.getName() + "\"");
      boolean binary = Div.getFileNameExtension(dbName).equalsIgnoreCase("db");
      if (!binary) {
        java.io.BufferedReader br = new java.io.BufferedReader(
                new java.io.InputStreamReader(new java.io.FileInputStream(f), "UTF-8"));
        try {
          int cmplxNbr = 0;
          while (true) {
            try {complex = LibDB.getTxtComplex(br);}
            catch (LibDB.EndOfFileException ex) {complex = null;}
            catch (LibDB.ReadTxtCmplxException ex) {
              throw new Exception("Error: in \"toBinary\", cmplxNbr = " + cmplxNbr + nl + ex.toString());
            }
            if (complex == null) {break;}
            if (complex.name.startsWith("@")) {
              complex.name = complex.name.substring(1);
              System.out.println("   removing any previous occurrences of species: \"" + complex.name + "\"");
              toRemove.clear();
              for (Complex c : dataList) {if (Util.nameCompare(c.name, complex.name)) {toRemove.add(c);}}
              if (!toRemove.isEmpty()) {
                for (Complex c : toRemove) {
                  System.out.println("   - removing complex \"" + c.toString() + "\"");
                  dataList.remove(c);
                }
                System.out.println("   - finished searching for: \"" + complex.name + "\"");
              } else {
                System.out.println("   - no previous occurrences of \"" + complex.name + "\" were found.");
              }
            } else {
              msg = complex.check();
              nTot = Math.min(complex.reactionComp.size(), complex.reactionCoef.size());
              for (int i = 0; i < nTot; i++) {
                if (complex.reactionComp.get(i) != null && complex.reactionComp.get(i).length() > 0) {
                  found = false;
                  for (int j = 0; j < eComp.size(); j++) {
                    if (complex.reactionComp.get(i).equals(eComp.get(j)[1])) {found = true; break;}
                  }
                  if (!found) {
                    String t = "Component \"" + complex.reactionComp.get(i) + "\" in complex \"" + complex.name + "\"" + nl + "not found in the element-files.";
                    if (msg == null || msg.length() <= 0) {msg = t;} else {msg = msg + nl + t;}
                  }
                }
              }
              if (msg != null) {
                System.out.println("---- Error: " + msg);
                warnings.add("Error in file \"" + f.getName() + "\": " + msg.replace(nl, " "));
              }
              toRemove.clear();
              for (Complex c : dataList) {
                if (Complex.sameNameAndStoichiometry(c, complex)
                    || (Util.nameCompare(c.name, complex.name) && (!c.isRedox() || !complex.isRedox()))) {
                  toRemove.add(c);
                }
              }
              if (!toRemove.isEmpty()) {
                for (Complex c : toRemove) {
                  System.out.println("   - removing complex \"" + c.toString() + "\"");
                  dataList.remove(c);
                }
                System.out.println("   - adding complex \"" + complex.toString() + "\"");
              }
              if (!dataList.add(complex)) {warnings.add("Error: in \"toBinary\", can not add complex: \"" + complex.toString() + "\"");}
            }
            cmplxNbr++;
          }
        } finally {br.close();}
      } else {
        java.io.DataInputStream dis = new java.io.DataInputStream(new java.io.FileInputStream(f));
        try {
          while (true) {
            complex = LibDB.getBinComplex(dis);
            if (complex == null) {break;}
            // the rule used for text databases (DataMaintenance's binary branch replaces by name
            // only, which would also drop reactions of the same species with another reaction)
            toRemove.clear();
            for (Complex c : dataList) {
              if (Complex.sameNameAndStoichiometry(c, complex)
                  || (Util.nameCompare(c.name, complex.name) && (!c.isRedox() || !complex.isRedox()))) {toRemove.add(c);}
            }
            for (Complex c : toRemove) {
              System.out.println("   replacing \"" + c.name + "\" with: \"" + complex.name + "\", logK=" + Util.formatDbl3(complex.constant));
              dataList.remove(c);
            }
            if (!dataList.add(complex)) {warnings.add("Error: in \"toBinary\", can not add complex: \"" + complex.toString() + "\"");}
          }
        } finally {dis.close();}
      }
    }

    // ---- the reactions
    System.out.println("Writing file \"" + new java.io.File(out).getName() + "\"");
    int eCompSize = eComp.size();
    boolean[] eCompUsed = new boolean[eCompSize];
    java.io.DataOutputStream dos = new java.io.DataOutputStream(new java.io.FileOutputStream(out));
    try {
      System.out.println("total nbr of reactions: " + dataList.size());
      for (Complex c : dataList) {
        LibDB.writeBinCmplx(dos, c);
        dos.flush();
        nTot = Math.min(c.reactionComp.size(), c.reactionCoef.size());
        for (int j = 0; j < nTot; j++) {
          if ((Math.abs(c.reactionCoef.get(j)) < 0.0001) || c.reactionComp.get(j) == null || c.reactionComp.get(j).length() <= 0) {continue;}
          boolean fnd = false;
          for (int i = 0; i < eCompSize; i++) {
            if (eComp.get(i)[1].equals(c.reactionComp.get(j))) {eCompUsed[i] = true; fnd = true;}
          }
          if (!fnd) {MsgExceptn.exception("--- Component: " + c.reactionComp.get(j) + " in complex " + c.name + nl + " not found in the element files.");}
        }
      }
    } finally {dos.close();}

    // ---- the elements file
    System.out.println("Writing binary \"elements\"-file:" + nl + "   \"" + fileElemSaveName + "\"");
    dos = new java.io.DataOutputStream(new java.io.FileOutputStream(fileElemSaveName));
    try {
      int n;
      for (int i = 0; i < LibDB.ELEMENTS; i++) {
        String elemSymbol = LibDB.elementSymb[i];
        n = 0;
        for (int j = 0; j < eCompSize; j++) {if (eComp.get(j)[0].equals(elemSymbol) && eCompUsed[j]) {n++;}}
        if (n > 0) {
          dos.writeUTF(elemSymbol);
          dos.writeInt(n);
          for (int j = 0; j < eCompSize; j++) {
            if (eComp.get(j)[0].equals(elemSymbol) && eCompUsed[j]) {dos.writeUTF(eComp.get(j)[1]); dos.writeUTF(eComp.get(j)[2]);}
          }
        }
      }
      n = 0;
      for (int j = 0; j < eCompSize; j++) {
        if (!eCompUsed[j]) {System.out.println("   Component: " + eComp.get(j)[1] + " not used."); continue;}
        if (!isElement(eComp.get(j)[0])) {System.out.println("   Component: " + eComp.get(j)[1] + " not connected to an element."); n++;}
      }
      if (n > 0) {
        dos.writeUTF("XX");
        dos.writeInt(n);
        for (int j = 0; j < eCompSize; j++) {
          if (!eCompUsed[j]) {continue;}
          if (!isElement(eComp.get(j)[0])) {dos.writeUTF(eComp.get(j)[1]); dos.writeUTF(eComp.get(j)[2]);}
        }
      }
    } finally {dos.close();}
    return dataList.size();
  }

  private static void mkdirs(String path) {
    java.io.File p = new java.io.File(path).getAbsoluteFile().getParentFile();
    if (p != null) {p.mkdirs();}
  }

  private static boolean isElement(String symbol) {
    for (int i = 0; i < LibDB.ELEMENTS; i++) {if (LibDB.elementSymb[i].equals(symbol)) {return true;}}
    return false;
  }
  //</editor-fold>

  //<editor-fold defaultstate="collapsed" desc="statistics and checks">
  /** As DataMaintenance's Statistics.startStatistics: the report written to
   * the statistics file. The first lines name the files (the window writes
   * their full paths and dates, which the browser does not have).
   * @param refsFile the references file, or empty */
  static String statistics(java.util.List<String> dbs, String refsFile, String date) throws Exception {
    java.io.StringWriter sw = new java.io.StringWriter();
    java.io.Writer w = sw;
    w.write("DataMaintenance (java) - " + date + nl
            + "Statistics for LogK databases:" + nl + nl + "Database(s) for reactions:" + nl);
    for (String name : dbs) {if (name.trim().length() > 0) {w.write("  " + name.trim() + nl);}}
    w.write(nl + "Element-reactant file(s):" + nl);
    for (String name : dbs) {
      name = name.trim();
      if (name.length() > 0) {
        java.io.File f = new java.io.File(Div.getFileNameWithoutExtension(name) + ".elt");
        if (!f.exists()) {f = new java.io.File(Div.getFileNameWithoutExtension(name) + ".elm");}
        if (!f.exists()) {f = new java.io.File(Div.getFileNameWithoutExtension(name) + ".elb");}
        if (f.exists()) {w.write("  " + f.getPath() + nl);}
      }
    }
    References refs = null;
    if (refsFile != null && refsFile.trim().length() > 0) {
      refs = new References();
      if (!refs.readRefsFile(refsFile, false)) {refs = null;}
    }
    CheckDatabases.CheckDataBasesLists lists = new CheckDatabases.CheckDataBasesLists();
    CheckDatabases.checkDatabases(false, null, new java.util.ArrayList<String>(dbs), refs, lists);

    java.util.ArrayList<String> arrayList;
    java.util.TreeSet<String> treeSet;
    w.write(nl + "Total nbr reactions = " + lists.productsReactionsSet.size() + nl);
    w.write("Total nbr reactants found in reaction databases = " + lists.reactantsSet.size() + nl
            + "      (nbr reactants in element-reactant files = " + lists.nbrCompsInElementFiles + ")" + nl + nl);
    if (lists.reactantsSet.size() > 0) {
      w.write("Reactants found in reaction database(s):" + nl
              + "  Name     &    Nbr of reactions they participate in" + nl);
      treeSet = new java.util.TreeSet<String>(lists.reactantsSet.keySet());
      for (String t : treeSet) {
        int j = lists.reactantsSet.get(t);
        if (t.length() <= 20) {w.write(String.format("  %-20s   %d", t, j) + nl);}
        else {w.write(String.format("  %s   %d", t, j + nl));}
      }
    }
    if (lists.reactantsUnknown.size() > 0) {
      w.write(nl + "Error: reactants (components) in the reactions database(s) NOT found" + nl
              + "   in the element-reactant file(s)." + nl
              + "   Note that any reaction involving these components" + nl
              + "   will NOT be found in a database search!" + nl);
      for (String t : new java.util.TreeSet<String>(lists.reactantsUnknown)) {w.write(" " + t + nl);}
    }
    if (lists.reactantsNotUsed.size() > 0) {
      w.write(nl + "Warning: components in the element-reactant file(s)" + nl
              + "   not used in the reactions database(s):" + nl);
      for (String t : new java.util.TreeSet<String>(lists.reactantsNotUsed)) {w.write(" " + t + nl);}
    }
    if (lists.reactantsCompare.size() > 0) {
      w.write(nl + "Error: names of reactants in the database file(s)" + nl
              + "   that are equivalent but will be treated as different:" + nl);
      java.util.Collections.sort(lists.reactantsCompare, String.CASE_INSENSITIVE_ORDER);
      for (String t : lists.reactantsCompare) {w.write(" " + t + nl);}
    }
    if (lists.elementReactantsCompare.size() > 0) {
      w.write(nl + "Error: names of reactants in the element-reactant file(s)" + nl
              + "   that are equivalent but will be treated as different:" + nl);
      java.util.Collections.sort(lists.elementReactantsCompare, String.CASE_INSENSITIVE_ORDER);
      for (String t : lists.elementReactantsCompare) {w.write(" " + t + nl);}
    }
    if (lists.reactantWithoutCoef.size() > 0) {
      w.write(nl + "Error: reactions having a reactant with name but without its stoich.coeff:" + nl);
      for (String t : new java.util.TreeSet<String>(lists.reactantWithoutCoef)) {w.write(" " + t + nl);}
    }
    if (lists.coefWithoutReactant.size() > 0) {
      w.write(nl + "Error: reactions having a stoich.coeff with no reactant:" + nl);
      for (String t : new java.util.TreeSet<String>(lists.coefWithoutReactant)) {w.write(" " + t + nl);}
    }
    if (lists.chargeImbalance.size() > 0) {
      w.write(nl + "Error: reactions with charge imbalance:" + nl);
      for (String t : new java.util.TreeSet<String>(lists.chargeImbalance)) {w.write(" " + t + nl);}
    }
    if (lists.duplReactionsSameProdctSet.size() > 0) {
      w.write(nl + "Warning: reactions found more than once" + nl + "    (with the same product):" + nl);
      for (String t : lists.duplReactionsSameProdctSet) {w.write(" " + t + nl);}
    }
    if (lists.duplReactionsDifProductSet.size() > 0) {
      w.write(nl + "Warning: reactions found more than once" + nl + "    (with a different product):" + nl);
      for (String t : lists.duplReactionsDifProductSet) {w.write(" " + t + nl);}
    }
    if (lists.duplProductsSet.size() > 0) {
      w.write(nl + "Warning: reaction products found more than once" + nl + "    (with a different reaction):" + nl);
      for (String t : lists.duplProductsSet) {w.write(" " + t + nl);}
    }
    if (lists.duplSolidsSet.size() > 0) {
      w.write(nl + "Note: solids found more than once" + nl + "    (with different phase designator)" + nl);
      for (String t : lists.duplSolidsSet) {w.write(" " + t + nl);}
    }
    if (lists.itemsNames.size() > 0) {
      java.util.Collections.sort(lists.itemsNames, String.CASE_INSENSITIVE_ORDER);
      w.write(nl + "Error? reaction products where the name" + nl
              + "    does not contain one or more reactant(s):" + nl);
      for (String t : lists.itemsNames) {w.write(" " + t + nl);}
    }
    if (refs == null) {
      w.write(nl + "No reference file found." + nl);
    } else {
      if (lists.refsNotFnd != null && !lists.refsNotFnd.isEmpty()) {
        w.write(nl + "Error: citations with no references:" + nl);
        java.util.Collections.sort(lists.refsNotFnd, String.CASE_INSENSITIVE_ORDER);
        for (String t : lists.refsNotFnd) {w.write(" " + t + nl);}
      }
      if (lists.refsFnd != null && !lists.refsFnd.isEmpty()) {
        arrayList = new java.util.ArrayList<String>();
        for (Object k : refs.referenceKeys()) {
          if (k != null) {
            boolean ok = false;
            String t = k.toString().trim();
            for (String t2 : lists.refsFnd) {if (t2 != null && t2.equalsIgnoreCase(t)) {ok = true; break;}}
            if (!ok) {arrayList.add(t);}
          }
        }
        if (arrayList.size() > 0) {
          java.util.Collections.sort(arrayList, String.CASE_INSENSITIVE_ORDER);
          w.write(nl + "Warning: references not used in the database(s):" + nl);
          for (String t : arrayList) {w.write(" " + t + nl);}
        }
      }
    }
    w.flush();
    return sw.toString();
  }
  //</editor-fold>

  //<editor-fold defaultstate="collapsed" desc="data for a single component">
  /** The components offered by FrameSingleComponent (fillComboBox, without
   * the empty first item). */
  static java.util.List<String> singleComponentChoices(java.util.List<String> dbs, boolean includeH2O) throws Exception {
    java.util.ArrayList<String[]> ec = new java.util.ArrayList<String[]>();
    LibDB.getElements(null, false, new java.util.ArrayList<String>(dbs), ec);
    java.util.ArrayList<String> components = new java.util.ArrayList<String>();
    for (String[] e : ec) {components.add(e[1]);}
    java.util.Collections.sort(components, String.CASE_INSENSITIVE_ORDER);
    java.util.List<String> out = new java.util.ArrayList<String>();
    out.add("H+"); out.add("e-");
    if (includeH2O) {out.add("H2O");}
    for (String t : components) {
      if (!t.equals("H+") && !t.equals("e-") && !t.equals("H2O")) {
        if (!out.get(out.size() - 1).equals(t)) {out.add(t);}
      }
    }
    return out;
  }

  /** As FrameSingleComponent.doSearch: the reactions (text database lines)
   * in which <code>comp</code> takes part, sorted as in the window. Saving
   * them gives the window's "Save" file: Complex.FILE_FIRST_LINE and these lines. */
  static java.util.List<String> singleComponent(java.util.List<String> dbs, String comp) throws Exception {
    LibSearch hs = new LibSearch(new java.util.ArrayList<String>(dbs));
    java.util.TreeSet<Object> model = new java.util.TreeSet<Object>();   // as SortedListModel
    boolean first = true;
    while (true) {
      Complex cmplx = hs.getComplex(first);
      first = false;
      if (cmplx == null) {break;}
      if (cmplx.name.startsWith("@")) {
        cmplx.name = cmplx.name.substring(1);
        java.util.Iterator<Object> it = model.iterator();
        while (it.hasNext()) {if (it.next().toString().startsWith(cmplx.name)) {it.remove();}}
      } else {
        int nTot = Math.min(cmplx.reactionComp.size(), cmplx.reactionCoef.size());
        for (int j = 0; j < nTot; j++) {
          if (cmplx.reactionComp.get(j).equals(comp) && Math.abs(cmplx.reactionCoef.get(j)) > 0.0001) {
            model.add(cmplx.toString());
            break;
          }
        }
      }
    }
    hs.libSearchClose();
    java.util.List<String> out = new java.util.ArrayList<String>();
    for (Object o : model) {out.add(o.toString());}
    return out;
  }
  //</editor-fold>

  //<editor-fold defaultstate="collapsed" desc="add data or edit a text database (FrameAddData)">
  /** The element-reactant file of a text database, created if missing (as
   * getAddFileName: AddDataElem.elemFileCheck). */
  static String addFileEle(String addFile, java.util.List<String> dbs) throws Exception {
    mkdirs(addFile);
    String ele = AddDataElem.elemFileCheck(false, null, addFile, elemComp(dbs));
    if (ele == null) {throw new Exception("The element-reactant file of \"" + addFile + "\" could not be prepared.");}
    return ele;
  }

  /** pd.elemComp of DataMaintenance: the reactants of its databases */
  private static java.util.ArrayList<String[]> elemComp(java.util.List<String> dbs) {
    java.util.ArrayList<String[]> ec = new java.util.ArrayList<String[]>();
    if (!dbs.isEmpty()) {LibDB.getElements(null, false, new java.util.ArrayList<String>(dbs), ec);}
    return ec;
  }

  /** The checks that getAddFileName makes when an existing file is opened
   * (CheckDatabases, shown by displayDatabaseErrors): the lists of problems. */
  static Json addCheck(String addFile) throws Exception {
    Json j = new Json();
    if (!new java.io.File(addFile).exists()) {return j;}
    java.util.ArrayList<String> one = new java.util.ArrayList<String>();
    one.add(addFile);
    CheckDatabases.CheckDataBasesLists lists = new CheckDatabases.CheckDataBasesLists();
    CheckDatabases.checkDatabases(false, null, one, null, lists);
    java.util.TreeSet<String> zero = new java.util.TreeSet<String>(lists.reactantWithoutCoef);
    zero.addAll(lists.coefWithoutReactant);
    j.putStrings("unknownReactants", new java.util.ArrayList<String>(new java.util.TreeSet<String>(lists.reactantsUnknown)));
    j.putStrings("zeroCoefficients", new java.util.ArrayList<String>(zero));
    j.putStrings("chargeImbalance", new java.util.ArrayList<String>(new java.util.TreeSet<String>(lists.chargeImbalance)));
    return j;
  }

  /** As "Show file contents" (jMenuAddShow, addFile_Read and modelComps_update):
   * the reactions of the file, the lines of its element-reactant file, and
   * all known reactants (update_componentsAdd). */
  static Json addShow(String addFile, java.util.List<String> dbs) throws Exception {
    String addFileEle = addFileEle(addFile, dbs);
    Json j = new Json();
    // reactions
    StringBuilder rs = new StringBuilder("[");
    java.io.File afF = new java.io.File(addFile);
    if (afF.exists()) {
      java.io.BufferedReader br = new java.io.BufferedReader(new java.io.InputStreamReader(new java.io.FileInputStream(afF), "UTF-8"));
      java.util.ArrayList<String> items = new java.util.ArrayList<String>();
      try {
        while (true) {
          Complex c;
          try {c = LibDB.getTxtComplex(br);}
          catch (LibDB.EndOfFileException ex) {break;}
          catch (LibDB.ReadTxtCmplxException ex) {System.err.println(ex.getMessage() + nl + "Line discarded!"); continue;}
          if (!c.name.startsWith("@")) {
            int k = 0, nTot = Math.min(c.reactionComp.size(), c.reactionCoef.size());
            while (k < nTot) {
              if ((c.reactionComp.get(k) != null && c.reactionComp.get(k).length() > 0 && Math.abs(c.reactionCoef.get(k)) < 0.0001)
                  || (Math.abs(c.reactionCoef.get(k)) >= 0.0001 && (c.reactionComp.get(k) == null || c.reactionComp.get(k).length() <= 0))) {
                c.reactionComp.remove(k); c.reactionCoef.remove(k); nTot--; continue;
              }
              k++;
            }
          }
          items.add(c.toString());
        }
      } finally {br.close();}
      boolean firstR = true;
      for (String line : items) {
        Complex c = Complex.fromString(line);
        if (c == null) {continue;}
        if (!firstR) {rs.append(',');}
        firstR = false;
        rs.append(reactionJson(line, c));
      }
    }
    j.putRaw("reactions", rs.append(']').toString());
    // components of the element-reactant file
    java.util.ArrayList<String[]> elemCompAdd = new java.util.ArrayList<String[]>();
    AddDataElem.elemCompAdd_Update(false, null, addFile, addFileEle, elemComp(dbs), elemCompAdd);
    StringBuilder cs = new StringBuilder("[");
    java.util.LinkedHashMap<String, String[]> comps = new java.util.LinkedHashMap<String, String[]>();
    for (String[] e : elemCompAdd) {
      String[] o = comps.get(e[1]);
      if (o == null) {comps.put(e[1], new String[]{e[1], e[2], e[0].equals("XX") ? "" : e[0]});}
      else if (!e[0].equals("XX")) {o[2] = o[2].isEmpty() ? e[0] : o[2] + ", " + e[0];}
    }
    boolean firstC = true;
    for (String[] o : comps.values()) {
      if (!firstC) {cs.append(',');}
      firstC = false;
      cs.append(new Json().put("name", o[0]).put("description", o[1]).put("linkedTo", o[2]));
    }
    j.putRaw("components", cs.append(']').toString());
    // all reactants known (the main databases and this file)
    java.util.ArrayList<String> local = new java.util.ArrayList<String>(dbs);
    boolean there = false;
    for (String d : local) {if (d.equalsIgnoreCase(addFile)) {there = true; break;}}
    if (!there) {local.add(addFile);}
    java.util.ArrayList<String[]> arrL = new java.util.ArrayList<String[]>();
    LibDB.getElements(null, false, local, arrL);
    java.util.ArrayList<String> componentsAdd = new java.util.ArrayList<String>();
    for (String[] e : arrL) {componentsAdd.add(e[1]);}
    java.util.Collections.sort(componentsAdd, String.CASE_INSENSITIVE_ORDER);
    java.util.ArrayList<String> choices = new java.util.ArrayList<String>();
    choices.add("H+"); choices.add("e-"); choices.add("H2O");
    for (String t : componentsAdd) {if (!t.equals("H+") && !t.equals("e-") && !t.equals("H2O")) {choices.add(t);}}
    j.putStrings("reactants", choices);
    j.put("elementFile", addFileEle);
    return j;
  }

  private static String reactionJson(String line, Complex c) {
    int nTot = Math.min(c.reactionComp.size(), c.reactionCoef.size());
    java.util.List<String> comps = new java.util.ArrayList<String>(), coefs = new java.util.ArrayList<String>();
    for (int k = 0; k < nTot; k++) {
      comps.add(c.reactionComp.get(k) == null ? "" : c.reactionComp.get(k));
      coefs.add(Util.formatNumAsInt(c.reactionCoef.get(k)));
    }
    Json r = new Json().put("line", line).put("name", c.name)
        .put("logK", c.constant == Complex.EMPTY ? "" : Util.formatNumAsInt(c.constant))
        .put("analytic", c.analytic).put("lookUp", c.lookUp)
        .put("reference", c.reference).put("comment", c.comment)
        .put("chargeBalanced", c.isChargeBalanced());
    if (!c.analytic && !c.lookUp) {
      double w = c.getDeltaH();
      r.put("deltaH", w == Complex.EMPTY ? "" : Util.formatNumAsInt(w));
      w = c.getDeltaCp();
      r.put("deltaCp", w == Complex.EMPTY ? "" : Util.formatNumAsInt(w));
    }
    r.put("text", c.name.startsWith("@") ? c.name : c.reactionTextWithLogK(25, 1));
    return r.putStrings("reactants", comps).putStrings("coefficients", coefs).toString();
  }

  /** As the reaction panel (update_newC, with the checks of the number
   * fields when they lose focus) and addFile_SaveReaction: the reaction is
   * checked, and replaces any reaction with the same name in the file, or is
   * appended to it; then the element-reactant file is updated.
   * @param original the line of the reaction being edited, or empty for a new one
   * @return the saved reaction, as JSON; or an error message (Exception) */
  static Json addSaveReaction(String addFile, java.util.List<String> dbs, String original, String name,
          String logK, String deltaH, String deltaCp, java.util.List<String> reactants,
          java.util.List<String> coefficients, String reference, String comment) throws Exception {
    String addFileEle = addFileEle(addFile, dbs);
    Complex newC = original == null || original.trim().isEmpty() ? new Complex() : Complex.fromString(original);
    newC.name = name.trim();
    String t = numberField(logK, 10000, 9999, "logK");
    newC.constant = t.isEmpty() ? Complex.EMPTY : parseOr(t, Complex.EMPTY);
    if (!newC.analytic && !newC.lookUp) {
      String h = numberField(deltaH, 100000, 99999, "Delta-H"), cp = numberField(deltaCp, 100000, 99999, "Delta-Cp");
      double dH = h.isEmpty() ? Complex.EMPTY : parseOr(h, Complex.EMPTY);
      double dCp = cp.isEmpty() ? Complex.EMPTY : parseOr(cp, Complex.EMPTY);
      newC.a = Complex.deltaToA(newC.constant, dH, dCp);
      newC.tMax = 25.;
      newC.pMax = 1.;
      if (dH != Complex.EMPTY) {
        newC.tMax = 100.;
        if (dCp != Complex.EMPTY) {newC.tMax = 300.; newC.pMax = 85.9;}
      }
    }
    newC.reactionComp.clear();
    newC.reactionCoef.clear();
    for (int i = 0; i < reactants.size(); i++) {
      String r = reactants.get(i);
      if (r == null || r.trim().length() <= 0) {continue;}
      String coef = i < coefficients.size() ? coefficient(coefficients.get(i)) : "";
      newC.reactionComp.add(r);
      try {newC.reactionCoef.add(Double.parseDouble(coef));}
      catch (NumberFormatException ex) {newC.reactionComp.remove(newC.reactionComp.size() - 1);}
    }
    newC.reference = reference;
    newC.comment = comment;

    // ---- the checks of addFile_SaveReaction
    if (newC.name.length() <= 0) {throw new Exception("A name is needed for the complex!");}
    if (!newC.name.startsWith("@")) {
      boolean ok = false;
      int nTot = Math.min(newC.reactionComp.size(), newC.reactionCoef.size());
      for (int i = 0; i < nTot; i++) {
        if (newC.reactionComp.get(i) != null && newC.reactionComp.get(i).length() > 0 && Math.abs(newC.reactionCoef.get(i)) >= 0.0001) {ok = true; break;}
      }
      if (!ok) {throw new Exception("At least one reactant is needed in the reaction" + nl + "for the formation of the complex \"" + newC.name + "\"");}
      for (int i = 0; i < nTot; i++) {
        if (newC.reactionComp.get(i) != null && newC.reactionComp.get(i).length() > 0 && Math.abs(newC.reactionCoef.get(i)) < 0.0001) {
          throw new Exception("The stoichiometric coefficient" + nl + "for reactant \"" + newC.reactionComp.get(i) + "\" may not be zero!");
        }
      }
      if (logK.trim().length() <= 0) {throw new Exception("Please: enter a value for the equilibrium constant" + nl + "for the complex \"" + newC.name + "\"");}
      if (!newC.isChargeBalanced()) {
        throw new Exception("The reaction for \"" + newC.name + "\"" + nl + "is NOT charge balanced." + nl + nl
                + "Please correct either the reaction or" + nl + "the electric charge of \"" + newC.name + "\"");
      }
    }
    boolean replace = findName(addFile, newC.name, false) > 0;
    if (replace) {
      initialise(addFile);
      complexDelete(addFile, newC);
    }
    java.io.Writer w = new java.io.BufferedWriter(new java.io.OutputStreamWriter(new java.io.FileOutputStream(addFile, true), "UTF-8"));
    try {w.write(newC.toString() + nl);} finally {w.close();}
    java.util.ArrayList<String[]> elemCompAdd = new java.util.ArrayList<String[]>();
    AddDataElem.elemCompAdd_Update(false, null, addFile, addFileEle, elemComp(dbs), elemCompAdd);
    AddDataElem.addFileEle_Write(false, addFileEle, elemCompAdd);
    Json j = new Json().put("replaced", replace).put("line", newC.toString());
    return j;
  }

  /** as validateLogK, validateDeltH and validateDeltCp when the field loses focus */
  private static String numberField(String t, double clamp, double max, String what) throws Exception {
    t = t == null ? "" : t.trim();
    if (t.length() <= 0) {return "";}
    double w;
    try {w = Double.parseDouble(t); w = Math.min(clamp, Math.max(w, -clamp));}
    catch (NumberFormatException nfe) {return "";}
    if (Math.abs(w) > max) {throw new Exception(what + "  is outside \"reasonable\" range");}
    return Util.formatNumAsInt(w);
  }

  /** as validateReactionCoeff */
  private static String coefficient(String t) throws Exception {
    t = t == null ? "" : t.trim();
    if (t.length() <= 0) {return "";}
    double w;
    try {w = Double.parseDouble(t); w = Math.min(1000, Math.max(w, -1000));}
    catch (NumberFormatException nfe) {return "";}
    if (Math.abs(w) > 999) {throw new Exception("The reaction coefficient is outside \"reasonable\" range");}
    if (Math.abs(w) < 0.001) {w = 0;}
    return Util.formatNumAsInt(w);
  }

  private static double parseOr(String t, double d) {
    try {return Double.parseDouble(t);} catch (NumberFormatException ex) {return d;}
  }

  /** addFile_Initialise: a new file gets the title line */
  private static void initialise(String addFile) throws Exception {
    java.io.File rf = new java.io.File(addFile);
    if (rf.exists()) {return;}
    java.io.Writer w = new java.io.BufferedWriter(new java.io.OutputStreamWriter(new java.io.FileOutputStream(rf), "UTF-8"));
    try {w.write(Complex.FILE_FIRST_LINE + nl);} finally {w.close();}
  }

  /** addFile_ComplexFindName */
  private static int findName(String addFile, String cName, boolean exactMatch) throws Exception {
    if (cName == null || cName.length() <= 0 || cName.contains(",")) {return 0;}
    if (!exactMatch && cName.startsWith("@")) {cName = cName.substring(1);}
    java.io.File afF = new java.io.File(addFile);
    if (!afF.exists()) {return 0;}
    int fnd = 0;
    java.io.BufferedReader br = new java.io.BufferedReader(new java.io.InputStreamReader(new java.io.FileInputStream(afF), "UTF-8"));
    try {
      String line;
      while ((line = br.readLine()) != null) {
        if (line.length() <= 0 || line.toUpperCase().startsWith("COMPLEX")) {continue;}
        String t = CSVparser.splitLine_1(line);
        if (!exactMatch && t.startsWith("@")) {t = t.substring(1);}
        if (Util.nameCompare(cName, t)) {fnd++;}
      }
    } finally {br.close();}
    return fnd;
  }

  /** addFile_ComplexDelete: the file is written again without the lines of
   * reactions with this name (with or without "@") */
  private static void complexDelete(String addFile, Complex cDel) throws Exception {
    String cName = cDel.name;
    boolean startsWithAt = false;
    if (cName.startsWith("@")) {
      if (cName.length() <= 1) {throw new Exception("Error: species name is \"@\" (must contain additional characters)");}
      startsWithAt = true;
      cName = cName.substring(1);
    }
    if (cName.contains(",")) {throw new Exception("Error: species " + cName + " contains a comma (,)");}
    int n = startsWithAt ? findName(addFile, cName, false) : findName(addFile, cName, true);
    if (n == 0) {return;}
    java.io.File rf = new java.io.File(addFile);
    StringBuilder sb = new StringBuilder(Complex.FILE_FIRST_LINE + nl);
    java.io.BufferedReader br = new java.io.BufferedReader(new java.io.InputStreamReader(new java.io.FileInputStream(rf), "UTF-8"));
    try {
      String line;
      while ((line = br.readLine()) != null) {
        if (line.trim().length() <= 0) {continue;}
        if (line.toUpperCase().startsWith("COMPLEX")) {continue;}
        // FrameAddData stops at a line it can not read and writes the file
        // without the remaining lines (for example after "@CaSO4;", the line
        // it writes for an excluded species); such a line is kept here.
        Complex cRead;
        try {cRead = Complex.fromString(line);}
        catch (Complex.ReadComplexException ex) {
          System.err.println("Line kept as it is (it can not be read): \"" + line + "\"");
          sb.append(line).append(nl);
          continue;
        }
        if (cRead == null) {sb.append(line).append(nl); continue;}
        if (cRead.name.startsWith("@")) {cRead.name = cRead.name.substring(1);}
        if (Util.nameCompare(cName, cRead.name)) {continue;}
        sb.append(line).append(nl);
      }
    } finally {br.close();}
    java.io.Writer w = new java.io.BufferedWriter(new java.io.OutputStreamWriter(new java.io.FileOutputStream(rf), "UTF-8"));
    try {w.write(sb.toString());} finally {w.close();}
  }

  /** As jListReact_Del: the reaction is removed from the file.
   * @return the reactants of the element-reactant file that no reaction uses
   * any more (removeUnusedComps asks whether to remove them) */
  static java.util.List<String> addDeleteReaction(String addFile, java.util.List<String> dbs, String line) throws Exception {
    String addFileEle = addFileEle(addFile, dbs);
    Complex c = Complex.fromString(line);
    if (c == null || c.name.length() <= 0) {throw new Exception("Error: empty reaction");}
    complexDelete(addFile, c);
    java.util.ArrayList<String[]> elemCompAdd = new java.util.ArrayList<String[]>();
    AddDataElem.elemCompAdd_Update(false, null, addFile, addFileEle, elemComp(dbs), elemCompAdd);
    return unusedComponents(addFile, elemCompAdd);
  }

  /** the reactants found by removeUnusedComps */
  private static java.util.List<String> unusedComponents(String addFile, java.util.ArrayList<String[]> elemCompAdd) throws Exception {
    boolean[] found = new boolean[elemCompAdd.size()];
    for (int i = 0; i < elemCompAdd.size(); i++) {
      String r = elemCompAdd.get(i)[1];
      found[i] = r.equals("H+") || r.equals("e-") || r.equals("H2O");
    }
    java.io.File afF = new java.io.File(addFile);
    if (!afF.exists()) {return new java.util.ArrayList<String>();}
    java.io.BufferedReader br = new java.io.BufferedReader(new java.io.InputStreamReader(new java.io.FileInputStream(afF), "UTF-8"));
    try {
      while (true) {
        Complex c;
        try {c = LibDB.getTxtComplex(br);}
        catch (LibDB.EndOfFileException ex) {break;}
        catch (LibDB.ReadTxtCmplxException ex) {continue;}
        if (c.name.startsWith("@")) {continue;}
        int nTot = Math.min(c.reactionComp.size(), c.reactionCoef.size());
        int k = 0;
        while (k < nTot) {
          if ((c.reactionComp.get(k) != null && c.reactionComp.get(k).length() <= 0) || Math.abs(c.reactionCoef.get(k)) < 0.0001) {
            c.reactionComp.remove(k); c.reactionCoef.remove(k); nTot--; continue;
          }
          for (int i = 0; i < elemCompAdd.size(); i++) {if (c.reactionComp.get(k).equals(elemCompAdd.get(i)[1])) {found[i] = true;}}
          k++;
        }
      }
    } finally {br.close();}
    java.util.List<String> unused = new java.util.ArrayList<String>();
    for (int i = 0; i < elemCompAdd.size(); i++) {
      if (!found[i] && !unused.contains(elemCompAdd.get(i)[1])) {unused.add(elemCompAdd.get(i)[1]);}
    }
    return unused;
  }

  /** The "Remove" answer of removeUnusedComps: the reactants are removed from
   * the element-reactant file (its loop leaves the first entry, H2O). */
  static void addRemoveComponents(String addFile, java.util.List<String> dbs, java.util.List<String> remove) throws Exception {
    String addFileEle = addFileEle(addFile, dbs);
    java.util.ArrayList<String[]> elemCompAdd = new java.util.ArrayList<String[]>();
    AddDataElem.elemCompAdd_Update(false, null, addFile, addFileEle, elemComp(dbs), elemCompAdd);
    if (remove.isEmpty()) {return;}
    int i = elemCompAdd.size() - 1;
    while (true) {
      for (String r : remove) {if (r.equals(elemCompAdd.get(i)[1])) {elemCompAdd.remove(i); break;}}
      i--;
      if (i <= 0) {break;}
    }
    AddDataElem.addFileEle_Write(false, addFileEle, elemCompAdd);
  }

  /** As componentSave: AddDataElem.addFileEle_ComponentSave
   * @param linkedTo the elements, separated by commas */
  static void addSaveComponent(String addFile, java.util.List<String> dbs, String name, String linkedTo, String descr) throws Exception {
    String addFileEle = addFileEle(addFile, dbs);
    if (name.trim().length() <= 0) {throw new Exception("Please: give the name of the component");}
    if (linkedTo.trim().length() <= 0) {throw new Exception("Please: link component \"" + name.trim() + "\"" + nl + "to some element(s)");}
    java.util.ArrayList<String[]> elemCompAdd = new java.util.ArrayList<String[]>();
    AddDataElem.addFileEle_ComponentSave(false, null, name.trim(), linkedTo.trim(), descr.trim(), addFile, addFileEle, elemComp(dbs), elemCompAdd);
  }

  /** As jListComps_Del: a reactant used by no reaction is removed from the
   * element-reactant file. */
  static void addDeleteComponent(String addFile, java.util.List<String> dbs, String name) throws Exception {
    String addFileEle = addFileEle(addFile, dbs);
    java.io.File afF = new java.io.File(addFile);
    if (afF.exists()) {
      java.io.BufferedReader br = new java.io.BufferedReader(new java.io.InputStreamReader(new java.io.FileInputStream(afF), "UTF-8"));
      try {
        String line;
        while ((line = br.readLine()) != null) {
          if (line.trim().length() <= 0 || line.toUpperCase().startsWith("COMPLEX")) {continue;}
          Complex c;
          try {c = Complex.fromString(line);} catch (Complex.ReadComplexException ex) {continue;}
          if (c == null || c.name.startsWith("@")) {continue;}
          int nTot = Math.min(c.reactionComp.size(), c.reactionCoef.size());
          for (int k = 0; k < nTot; k++) {
            if (c.reactionComp.get(k) == null || c.reactionComp.get(k).length() <= 0 || Math.abs(c.reactionCoef.get(k)) < 0.0001) {continue;}
            if (name.equals(c.reactionComp.get(k))) {
              throw new Exception("It is not possible to delete" + nl + "   " + name + nl + "because it is used in" + nl + "one or more reactions.");
            }
          }
        }
      } finally {br.close();}
    }
    java.util.ArrayList<String[]> elemCompAdd = new java.util.ArrayList<String[]>();
    AddDataElem.elemCompAdd_Update(false, null, addFile, addFileEle, elemComp(dbs), elemCompAdd);
    AddDataElem.addFileEle_ComponentDelete(false, name, addFileEle, elemCompAdd);
  }
  //</editor-fold>
}
