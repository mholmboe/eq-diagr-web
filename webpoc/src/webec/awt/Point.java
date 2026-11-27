package webec.awt;

/** Browser build only: the fields of java.awt.Point that GraphLib.PltData uses.
 * build-web.sh points GraphLib at this class, since TeaVM has no java.awt. */
public class Point {
  public int x, y;
  public Point() {}
  public Point(int x, int y) {this.x = x; this.y = y;}
}
