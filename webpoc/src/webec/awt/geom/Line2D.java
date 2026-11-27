package webec.awt.geom;

/** Browser build only: the part of java.awt.geom.Line2D that GraphLib's
 * line clipping uses. */
public abstract class Line2D {
  public abstract double getX1();
  public abstract double getY1();
  public abstract double getX2();
  public abstract double getY2();

  public static class Double extends Line2D {
    public double x1, y1, x2, y2;
    public Double(double x1, double y1, double x2, double y2) {this.x1 = x1; this.y1 = y1; this.x2 = x2; this.y2 = y2;}
    @Override public double getX1() {return x1;}
    @Override public double getY1() {return y1;}
    @Override public double getX2() {return x2;}
    @Override public double getY2() {return y2;}
  }
}
