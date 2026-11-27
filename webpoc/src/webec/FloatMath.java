package webec;

/** Browser build only. TeaVM represents Java float as a JavaScript double and
 * drops narrowing casts, so <code>Math.round((float)(x*100))</code>, which
 * GraphLib uses to turn plot coordinates into the integers of the .plt file,
 * can round differently from the JVM when x*100 lies just below a half.
 * build-web.sh replaces that expression in GraphLib with {@link #round(double)}. */
public final class FloatMath {
  private FloatMath() {}

  /** v rounded to the nearest float (IEEE 754 binary32); Float.floatToIntBits
   * is implemented with a real 32-bit float in TeaVM. On the JVM it is the
   * identity on (float)v. */
  public static float fround(double v) {
    return Float.intBitsToFloat(Float.floatToIntBits((float) v));
  }

  /** Same result as <code>Math.round((float) v)</code> on the JVM: round to
   * float, then floor(f + 1/2), saturating at the int range; NaN gives 0. */
  public static int round(double v) {
    double f = fround(v);
    if (f != f) {return 0;}
    double r = Math.floor(f + 0.5d);
    if (r >= Integer.MAX_VALUE) {return Integer.MAX_VALUE;}
    if (r <= Integer.MIN_VALUE) {return Integer.MIN_VALUE;}
    return (int) r;
  }
}
