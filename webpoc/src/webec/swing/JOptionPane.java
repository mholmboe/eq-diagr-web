package webec.swing;

/** Browser build only: javax.swing.JOptionPane without dialogs. The browser
 * build always runs with "-nostop", so these are not reached in practice;
 * if they are, the message is printed and "OK"/"Yes" is returned. */
public final class JOptionPane {
  private JOptionPane() {}
  public static final int ERROR_MESSAGE = 0, INFORMATION_MESSAGE = 1, WARNING_MESSAGE = 2,
      QUESTION_MESSAGE = 3, PLAIN_MESSAGE = -1;
  public static final int YES_OPTION = 0, NO_OPTION = 1, CANCEL_OPTION = 2, OK_OPTION = 0, CLOSED_OPTION = -1;
  public static final int DEFAULT_OPTION = -1, YES_NO_OPTION = 0, YES_NO_CANCEL_OPTION = 1, OK_CANCEL_OPTION = 2;

  public static void showMessageDialog(Object parent, Object msg, String title, int type) {
    System.err.println("[" + title + "] " + msg);
  }
  public static int showOptionDialog(Object parent, Object msg, String title, int optionType,
                                     int messageType, Object icon, Object[] options, Object initial) {
    System.err.println("[" + title + "] " + msg);
    return OK_OPTION;
  }
}
