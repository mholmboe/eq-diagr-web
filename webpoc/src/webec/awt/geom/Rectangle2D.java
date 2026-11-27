package webec.awt.geom;

/** Browser build only: the part of java.awt.geom.Rectangle2D that GraphLib's
 * line clipping uses. */
public abstract class Rectangle2D {
  public abstract double getMinX();
  public abstract double getMinY();
  public abstract double getMaxX();
  public abstract double getMaxY();

  public static class Double extends Rectangle2D {
    public double x, y, width, height;
    public Double(double x, double y, double w, double h) {this.x = x; this.y = y; width = w; height = h;}
    @Override public double getMinX() {return x;}
    @Override public double getMinY() {return y;}
    @Override public double getMaxX() {return x + width;}
    @Override public double getMaxY() {return y + height;}
  }
}
