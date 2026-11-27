package webec.swing;

/** Browser build only: there is a single thread, so invokeLater runs at once. */
public final class SwingUtilities {
  private SwingUtilities() {}
  public static void invokeLater(Runnable r) {r.run();}
}
