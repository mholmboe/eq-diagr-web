package lib.common;

/** Browser build only: replaces eq-diagr's lib.common.MsgExceptn, which can
 * open an AWT/Swing message box. Same public methods; output goes to the
 * console only. build-web.sh leaves the upstream file out of the compile. */
public class MsgExceptn {
  private MsgExceptn() {}

  public static void msg(String txt) {
    System.out.println("----\n" + txt + "\n----");
  }

  public static void exception(String txt) {
    System.err.println("----\n" + txt + "\n----");
  }

  /** @param parent ignored (an AWT component upstream; HaltaFall passes null)
   * @param type =1 exception error; =2 warning; =3 information */
  public static void showErrMsg(Object parent, String msg, int type) {
    if (msg == null || msg.trim().length() <= 0) {return;}
    if (type == 1) {exception(msg);} else {msg(msg);}
  }
}
