import java.awt.*;
import java.lang.reflect.*;
import javax.swing.*;

/** Drives the windows of DataMaintenance (eq-diagr, compiled from source) to
 * make the reference files for tests/maint. Usage:
 *   java RefMaint merge <out.db> <db>...            DataMaintenance.toBinary
 *   java RefMaint stats <out.txt> <refs|-> <db>...  Statistics (startStatistics)
 *   java RefMaint single <comp> <out.txt> <db>...   FrameSingleComponent.doSearch, then "Save"
 *   java RefMaint add <script> <outdir> <db>...     FrameAddData, following a script (see cases.txt)
 * Dialogs are answered by a watcher thread: a file chooser gets the file
 * name it asks for, an option dialog the first option ("Yes", "OK",
 * "Proceed anyway", "Remove"); message boxes are printed and closed. */
public class RefMaint {
  static volatile String nextFile;
  static Object get(Object o, String f) throws Exception {Field x = find(o.getClass(), f); x.setAccessible(true); return x.get(o);}
  static void set(Object o, String f, Object v) throws Exception {Field x = find(o.getClass(), f); x.setAccessible(true); x.set(o, v);}
  static Field find(Class<?> c, String f) throws Exception {
    for (Class<?> k = c; k != null; k = k.getSuperclass()) {try {return k.getDeclaredField(f);} catch (NoSuchFieldException e) {}}
    throw new NoSuchFieldException(f);
  }
  static Object call(Object o, String m, Class<?>[] t, Object... a) throws Exception {
    Method x = o.getClass().getDeclaredMethod(m, t); x.setAccessible(true); return x.invoke(o, a);
  }
  static void edt(ThrowingRunnable r) throws Exception {
    final Exception[] ex = new Exception[1];
    SwingUtilities.invokeAndWait(() -> {try {r.run();} catch (Exception e) {ex[0] = e;}});
    if (ex[0] != null) {throw ex[0];}
  }
  interface ThrowingRunnable {void run() throws Exception;}
  static void pause(long ms) {try {Thread.sleep(ms);} catch (InterruptedException e) {}}

  public static void main(String[] args) {
    try {run(args);} catch (Throwable t) {t.printStackTrace(); System.exit(1);}
  }

  static void run(String[] args) throws Exception {
    java.io.PrintStream out0 = System.out, err0 = System.err;
    lib.huvud.ProgramConf pc = new lib.huvud.ProgramConf("DataMaintenance");
    pc.pathDef.append(new java.io.File(".").getAbsolutePath());
    lib.database.ProgramDataDB pd = new lib.database.ProgramDataDB();
    pd.msgFrame = lib.huvud.RedirectedFrame.getInstance();
    System.setOut(out0); System.setErr(err0);
    startWatcher();
    String mode = args[0];
    int first = mode.equals("merge") ? 2 : mode.equals("stats") || mode.equals("single") || mode.equals("add") ? 3 : 1;
    for (int i = first; i < args.length; i++) {pd.dataBasesList.add(new java.io.File(args[i]).getAbsolutePath());}
    lib.database.LibDB.getElements(null, false, pd.dataBasesList, pd.elemComp);
    JFrame parent = new JFrame();
    parent.setIconImage(new java.awt.image.BufferedImage(16, 16, java.awt.image.BufferedImage.TYPE_INT_ARGB));
    switch (mode) {
      case "merge": {
        nextFile = new java.io.File(args[1]).getAbsolutePath();
        final dataMaintenance.DataMaintenance[] dm = new dataMaintenance.DataMaintenance[1];
        edt(() -> {
          dm[0] = new dataMaintenance.DataMaintenance(pc);
          lib.database.ProgramDataDB p = (lib.database.ProgramDataDB) get(dm[0], "pd");
          p.dataBasesList.addAll(pd.dataBasesList);
          p.elemComp.addAll(pd.elemComp);
          p.msgFrame = pd.msgFrame;
          call(dm[0], "toBinary", new Class<?>[]{java.util.ArrayList.class}, p.elemComp);
        });
        waitUntil(() -> finished, 60000);
        break;
      }
      case "stats": {
        nextFile = new java.io.File(args[1]).getAbsolutePath();
        if (!args[2].equals("-")) {pd.references = new lib.database.References(); pd.references.readRefsFile(args[2], false);}
        edt(() -> new dataMaintenance.Statistics(pc, pd, parent).start());
        waitUntil(() -> finished, 60000);
        break;
      }
      case "single": {
        final lib.database.FrameSingleComponent[] f = new lib.database.FrameSingleComponent[1];
        edt(() -> {f[0] = new lib.database.FrameSingleComponent(parent, pc, pd); f[0].start();
                   ((JComboBox<?>) get(f[0], "jComboBox")).setSelectedItem(args[1]);
                   call(f[0], "doSearch", new Class<?>[]{});});
        waitUntil(() -> {try {return ((JButton) get(f[0], "jButtonSearch")).isEnabled();} catch (Exception e) {return false;}}, 60000);
        pause(500);
        nextFile = new java.io.File(args[2]).getAbsolutePath();
        edt(() -> ((JButton) get(f[0], "jButtonSave")).doClick());
        break;
      }
      case "add":
        addData(pc, pd, parent, args[1], args[2]);
        break;
      default: throw new IllegalArgumentException(mode);
    }
    pause(500);
    System.exit(0);
  }

  static volatile boolean finished = false;
  interface Cond {boolean ok();}
  static void waitUntil(Cond c, long ms) {
    long t0 = System.currentTimeMillis();
    while (!c.ok() && System.currentTimeMillis() - t0 < ms) {pause(100);}
  }

  static void startWatcher() {
    Thread w = new Thread(() -> {
      while (true) {
        pause(100);
        try {SwingUtilities.invokeAndWait(() -> {
          for (Window win : Window.getWindows()) {
            if (!(win instanceof JDialog) || !win.isShowing()) {continue;}
            JDialog d = (JDialog) win;
            JFileChooser fc = findC(d.getContentPane(), JFileChooser.class);
            if (fc != null && nextFile != null) {fc.setSelectedFile(new java.io.File(nextFile)); nextFile = null; fc.approveSelection(); continue;}
            JOptionPane op = findC(d.getContentPane(), JOptionPane.class);
            if (op == null) {continue;}
            Object[] opts = op.getOptions();
            String msg = text(op.getMessage());
            if (opts != null && opts.length > 0) {op.setValue(opts[0]); System.out.println("ANSWER " + opts[0] + ": " + msg);}
            else {op.setValue(JOptionPane.OK_OPTION); System.out.println("MESSAGE: " + msg);}
            if (msg.contains("Finished") || msg.contains("Written file")) {finished = true;}
            d.dispose();
          }
        });} catch (Exception e) {}
      }
    });
    w.setDaemon(true);
    w.start();
  }
  static String text(Object m) {
    if (m instanceof Object[]) {StringBuilder sb = new StringBuilder(); for (Object o : (Object[]) m) {sb.append(text(o)).append(' ');} return sb.toString();}
    if (m instanceof JLabel) {return ((JLabel) m).getText();}
    if (m instanceof JScrollPane) {
      Component v = ((JScrollPane) m).getViewport().getView();
      if (v instanceof JList) {ListModel<?> lm = ((JList<?>) v).getModel(); StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < lm.getSize(); i++) {sb.append(i > 0 ? ", " : "").append(lm.getElementAt(i));} return sb.append(']').toString();}
    }
    return String.valueOf(m).replace('\n', ' ');
  }
  static <T> T findC(Container c, Class<T> k) {
    for (Component x : c.getComponents()) {
      if (k.isInstance(x)) {return k.cast(x);}
      if (x instanceof Container) {T r = findC((Container) x, k); if (r != null) {return r;}}
    }
    return null;
  }

  //<editor-fold defaultstate="collapsed" desc="add data">
  /** Script lines (one action per line, fields separated by "|"):
   *   open|<file.txt>
   *   reaction|<name>|<reactant:coef,...>|<logK>|<dH>|<dCp>|<reference>|<comment>
   *   edit|<name>|<logK>|<dH>|<dCp>|<reference>|<comment>      (edit an existing reaction)
   *   delreaction|<name>
   *   component|<name>|<description>|<element,element...>
   *   delcomponent|<name>
   * After each action the two files are copied to <outdir>/<n>.txt and <n>.elt */
  static void addData(lib.huvud.ProgramConf pc, lib.database.ProgramDataDB pd, JFrame parent, String script, String outDir) throws Exception {
    java.util.List<String> lines = java.nio.file.Files.readAllLines(java.nio.file.Paths.get(script));
    final lib.database.FrameAddData[] fa = new lib.database.FrameAddData[1];
    String addFile = null;
    int n = 0;
    for (String line : lines) {
      if (line.trim().isEmpty() || line.startsWith("#")) {continue;}
      String[] a = line.split("\\|", -1);
      System.out.println("---- " + line);
      switch (a[0]) {
        case "open":
          addFile = new java.io.File(a[1]).getAbsolutePath();
          nextFile = addFile;
          edt(() -> {fa[0] = new lib.database.FrameAddData(pc, pd, parent);});
          final lib.database.FrameAddData f0 = fa[0];
          new Thread(() -> {try {edt(() -> f0.start());} catch (Exception e) {e.printStackTrace();}}).start();
          pause(2500);
          break;
        case "reaction": case "edit": {
          lib.database.FrameAddData f = fa[0];
          if (a[0].equals("edit")) {
            selectReaction(f, a[1]);
            edt(() -> call(f, "jListReact_click", new Class<?>[]{}));
          } else {
            edt(() -> ((JMenuItem) get(f, "jMenuAddReact")).doClick());
          }
          pause(800);
          edt(() -> {
            if (a[0].equals("reaction")) {
              ((JTextField) get(f, "jTextFieldComplex")).setText(a[1]);
              @SuppressWarnings("unchecked") java.util.ArrayList<JComboBox<String>> boxes = (java.util.ArrayList<JComboBox<String>>) get(f, "boxes");
              JTextField[] texts = (JTextField[]) get(f, "texts");
              String[] rs = a[2].isEmpty() ? new String[0] : a[2].split(",");
              for (int i = 0; i < rs.length; i++) {
                String[] rc = rs[i].split(":");
                boxes.get(i).setSelectedItem(rc[0]);
                texts[i].setText(rc[1]);
                call(f, "validateReactionCoeff", new Class<?>[]{int.class}, i);
              }
            }
            int k = a[0].equals("reaction") ? 3 : 2;
            ((JTextField) get(f, "jTextFieldLogK")).setText(a[k]); call(f, "validateLogK", new Class<?>[]{});
            JTextField dh = (JTextField) get(f, "jTextFieldDeltH"), dcp = (JTextField) get(f, "jTextFieldDeltCp");
            if (dh.isEnabled()) {dh.setText(a[k + 1]); call(f, "validateDeltH", new Class<?>[]{});}
            if (dcp.isEnabled()) {dcp.setText(a[k + 2]); call(f, "validateDeltCp", new Class<?>[]{});}
            ((JTextField) get(f, "jTextFieldRef")).setText(a[k + 3]);
            ((JTextField) get(f, "jTextFieldComment")).setText(a[k + 4]);
            call(f, "update_newC", new Class<?>[]{});
            call(f, "addFile_SaveReaction", new Class<?>[]{});
          });
          break;
        }
        case "delreaction": {
          lib.database.FrameAddData f = fa[0];
          edt(() -> ((JMenuItem) get(f, "jMenuAddShow")).setEnabled(true));
          edt(() -> ((JMenuItem) get(f, "jMenuAddShow")).doClick());
          pause(1500);
          selectReaction(f, a[1]);
          edt(() -> call(f, "jListReact_Del", new Class<?>[]{}));
          break;
        }
        case "component": {
          lib.database.FrameAddData f = fa[0];
          edt(() -> ((JMenuItem) get(f, "jMenuAddComp")).doClick());
          pause(800);
          edt(() -> {
            ((JTextField) get(f, "jTextFieldCompName")).setText(a[1]);
            ((JTextField) get(f, "jTextFieldCompDescr")).setText(a[2]);
            java.util.List<String> el = new java.util.ArrayList<String>(java.util.Arrays.asList(a[3].split(",")));
            java.util.Collections.sort(el, String.CASE_INSENSITIVE_ORDER);
            ((JLabel) get(f, "jLabelLinked")).setText("Linked to: " + String.join(", ", el));
            call(f, "componentSave", new Class<?>[]{});
          });
          break;
        }
        case "delcomponent": {
          lib.database.FrameAddData f = fa[0];
          edt(() -> ((JMenuItem) get(f, "jMenuAddShow")).setEnabled(true));
          edt(() -> ((JMenuItem) get(f, "jMenuAddShow")).doClick());
          pause(1500);
          edt(() -> {
            JList<?> l = (JList<?>) get(f, "jListComps");
            ListModel<?> m = l.getModel();
            for (int i = 0; i < m.getSize(); i++) {if (m.getElementAt(i).toString().startsWith(lib.database.Complex.encloseInQuotes(a[1]) + ";")) {l.setSelectedIndex(i); break;}}
            call(f, "jListComps_Del", new Class<?>[]{});
          });
          break;
        }
        default: throw new IllegalArgumentException(a[0]);
      }
      pause(1500);
      n++;
      copy(addFile, outDir + "/" + n + ".txt");
      copy(lib.huvud.Div.getFileNameWithoutExtension(addFile) + ".elt", outDir + "/" + n + ".elt");
    }
  }
  static void selectReaction(lib.database.FrameAddData f, String name) throws Exception {
    edt(() -> ((JMenuItem) get(f, "jMenuAddShow")).setEnabled(true));
    edt(() -> ((JMenuItem) get(f, "jMenuAddShow")).doClick());
    pause(1500);
    edt(() -> {
      JList<?> l = (JList<?>) get(f, "jListReact");
      ListModel<?> m = l.getModel();
      for (int i = 0; i < m.getSize(); i++) {if (m.getElementAt(i).toString().startsWith(name + ";")) {l.setSelectedIndex(i); return;}}
      throw new IllegalStateException("reaction not found: " + name);
    });
  }
  static void copy(String from, String to) throws Exception {
    java.nio.file.Path p = java.nio.file.Paths.get(from);
    if (java.nio.file.Files.exists(p)) {java.nio.file.Files.copy(p, java.nio.file.Paths.get(to), java.nio.file.StandardCopyOption.REPLACE_EXISTING);}
    else {java.nio.file.Files.deleteIfExists(java.nio.file.Paths.get(to));}
  }
  //</editor-fold>
}
