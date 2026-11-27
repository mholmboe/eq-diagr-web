package webec;

/** Replacements for the desktop-only parts of EC when it runs in a browser. */
public final class WebSupport {
  private WebSupport() {}

  /** Thrown instead of System.exit(). It is an Error, not an Exception,
   * so that EC's own catch(Exception) blocks do not swallow it. */
  public static final class Quit extends Error {
    public Quit() {super("EC finished", null, false, false);}
  }

  /** Replaces the AWT message box: the message goes to the console. */
  public static void errMsg(String msg, String title) {
    System.err.println("[" + title + "] " + msg);
  }

  /** Replaces lib.common.MsgExceptn.showErrMsg (a message box owned by a
   * window) in the database library: the message goes to the console. */
  public static void showErrMsg(Object parent, String msg, int type) {
    System.err.println(msg);
  }
}
