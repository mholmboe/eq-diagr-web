import java.lang.reflect.*;
import java.awt.*;
import javax.swing.*;

/** Drives Spana's "Modify chemical system" window (spana.ModifyChemSyst) to make
 * reference files.  Usage:
 *   java RefModify move <in.dat> <out.dat> <comp> up|down
 *   java RefModify merge <in.dat> <in2.dat> <out.dat>
 * The window's own code does the change; then, as its Save button does,
 * checkPlotInfo() and WriteChemSyst.writeChemSyst(ch, file). Dialogs are
 * answered by a watcher thread ("Yes" to the merge warning, the second file in
 * the file chooser, OK to information messages, which are printed). */
public class RefModify {
  static Object get(Object o, String f) throws Exception { Field x = o.getClass().getDeclaredField(f); x.setAccessible(true); return x.get(o); }
  static Object call(Object o, String m, Class<?>[] t, Object... a) throws Exception { Method x = o.getClass().getDeclaredMethod(m, t); x.setAccessible(true); return x.invoke(o, a); }

  public static void main(String[] args) throws Exception {
    // Spana's main window is needed only for MainFrame.getInstance().setCursorDef()
    Field uf = Class.forName("sun.misc.Unsafe").getDeclaredField("theUnsafe"); uf.setAccessible(true);
    sun.misc.Unsafe u = (sun.misc.Unsafe) uf.get(null);
    Object mf = u.allocateInstance(spana.MainFrame.class);
    Field spf = spana.MainFrame.class.getDeclaredField("spf"); spf.setAccessible(true); spf.set(null, mf);
    lib.huvud.ProgramConf pc = new lib.huvud.ProgramConf("Spana");
    pc.pathDef.append(System.getProperty("java.io.tmpdir"));
    spana.ProgramDataSpana pd = new spana.ProgramDataSpana();
    final String file2 = args[0].equals("merge") ? new java.io.File(args[2]).getAbsolutePath() : null;
    Thread watcher = new Thread(() -> {
      while (true) {
        try { Thread.sleep(150); } catch (InterruptedException e) { return; }
        SwingUtilities.invokeLater(() -> {
          for (Window w : Window.getWindows()) {
            if (!(w instanceof JDialog) || !w.isShowing()) continue;
            JDialog d = (JDialog) w;
            JFileChooser fc = find(d.getContentPane(), JFileChooser.class);
            if (fc != null) { fc.setSelectedFile(new java.io.File(file2)); fc.approveSelection(); continue; }
            JOptionPane op = find(d.getContentPane(), JOptionPane.class);
            if (op != null) {
              Object[] opts = op.getOptions();
              if (opts != null && opts.length == 2 && "Yes".equals(opts[1])) { op.setValue(opts[1]); }
              else { System.out.println("MESSAGE: " + String.valueOf(op.getMessage()).replace('\n', ' ')); op.setValue(JOptionPane.OK_OPTION); }
              d.dispose();
            }
          }
        });
      }
    });
    watcher.setDaemon(true); watcher.start();
    final Object[] holder = new Object[1];
    SwingUtilities.invokeAndWait(() -> {
      try {
        spana.ModifyChemSyst m = new spana.ModifyChemSyst(pc, pd);
        m.startDataFile(new java.io.File(args[1]));
        holder[0] = m;
      } catch (Exception e) { throw new RuntimeException(e); }
    });
    Object m = holder[0];
    String out;
    if (args[0].equals("move")) {
      int comp = Integer.parseInt(args[3]); boolean up = args[4].equals("up");
      out = args[2];
      SwingUtilities.invokeAndWait(() -> {
        try {
          Object cs = get(m, "cs");
          int na = cs.getClass().getField("Na").getInt(cs), solidC = cs.getClass().getField("solidC").getInt(cs);
          if (comp < na - solidC) ((JList) get(m, "jListSolubComps")).setSelectedIndex(comp);
          else ((JList) get(m, "jListSolidComps")).setSelectedIndex(comp - (na - solidC));
          call(m, "upDownComponent", new Class<?>[]{boolean.class}, up);
        } catch (Exception e) { throw new RuntimeException(e); }
      });
    } else {
      out = args[3];
      // mergeTwoSystems shows modal dialogs: run it on the event thread and let the watcher answer
      SwingUtilities.invokeAndWait(() -> {
        try { call(m, "mergeTwoSystems", new Class<?>[]{}); } catch (Exception e) { throw new RuntimeException(e); }
      });
      if (!Boolean.TRUE.equals(get(m, "merged"))) { System.out.println("NOT MERGED"); System.exit(2); }
    }
    SwingUtilities.invokeAndWait(() -> {
      try {
        call(m, "checkPlotInfo", new Class<?>[]{});
        lib.kemi.readWriteDataFiles.WriteChemSyst.writeChemSyst((lib.kemi.chem.Chem) get(m, "ch"), new java.io.File(out));
      } catch (Exception e) { throw new RuntimeException(e); }
    });
    System.exit(0);
  }

  static <T> T find(Container c, Class<T> k) {
    for (Component x : c.getComponents()) {
      if (k.isInstance(x)) return k.cast(x);
      if (x instanceof Container) { T r = find((Container) x, k); if (r != null) return r; }
    }
    return null;
  }
}
