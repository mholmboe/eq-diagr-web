package webec;

import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Browser build only. TeaVM's java.util.Formatter (0.14.1) has no %e, %g or
 * %n conversion, and its %f goes through DecimalFormat; HaltaFall and EC use
 * all four in their reports and tables. build-web.sh rewrites
 * <code>String.format(engl, ...)</code> and <code>x.printf/format(engl, ...)</code>
 * in the copied sources to call this class, which formats every %e, %f and %g
 * argument with java.util.Formatter's rules (HALF_UP rounding of the shortest
 * decimal representation), writes %n as a newline, and leaves the remaining
 * conversions (%d, %s, ...) to TeaVM's formatter. */
public final class Fmt {
  private Fmt() {}

  // %[index$][flags][width][.precision]conversion
  private static final Pattern SPEC =
      Pattern.compile("%(\\d+\\$)?([-#+ 0,(<]*)(\\d+)?(\\.\\d+)?([a-zA-Z%])");

  public static String format(Locale l, String fmt, Object... args) {
    StringBuilder sb = new StringBuilder();
    Object[] a = args.clone();
    Matcher m = SPEC.matcher(fmt);
    int last = 0, argIdx = 0;
    while (m.find()) {
      sb.append(fmt, last, m.start());
      last = m.end();
      char conv = m.group(5).charAt(0);
      if (conv == 'n') {sb.append('\n'); continue;}
      if (conv == '%') {sb.append("%%"); continue;}
      if (m.group(1) != null || m.group(2).contains("<")) {
        throw new IllegalArgumentException("Fmt: indexed arguments not supported: " + fmt);
      }
      int i = argIdx++;
      char lc = Character.toLowerCase(conv);
      if (lc != 'e' && lc != 'f' && lc != 'g') {sb.append(m.group()); continue;}
      String flags = m.group(2);
      if (!flags.replace("-", "").isEmpty()) {
        throw new IllegalArgumentException("Fmt: flags '" + flags + "' with %" + conv + " not supported");
      }
      int prec = m.group(4) == null ? 6 : Integer.parseInt(m.group(4).substring(1));
      double x = ((Number) a[i]).doubleValue();
      String s = lc == 'e' ? e(x, prec) : lc == 'f' ? f(x, prec) : g(x, prec);
      if (Character.isUpperCase(conv)) {s = s.toUpperCase(Locale.ROOT);}
      a[i] = s;
      sb.append('%').append(flags).append(m.group(3) == null ? "" : m.group(3)).append('s');
    }
    sb.append(fmt.substring(last));
    return String.format(l, sb.toString(), a);
  }

  /** Calls without a Locale: java.util.Formatter would use the default locale;
   * here English is used, as in the browser there is no user locale to follow. */
  public static String format(String fmt, Object... args) {
    return format(Locale.ENGLISH, fmt, args);
  }

  public static java.io.PrintStream printf(java.io.PrintStream ps, Locale l, String fmt, Object... args) {
    ps.print(format(l, fmt, args));
    return ps;
  }

  public static java.io.PrintStream printf(java.io.PrintStream ps, String fmt, Object... args) {
    ps.print(format(Locale.ENGLISH, fmt, args));
    return ps;
  }

  private static String special(double x) {
    if (Double.isNaN(x)) {return "NaN";}
    if (Double.isInfinite(x)) {return x > 0 ? "Infinity" : "-Infinity";}
    return null;
  }

  private static boolean negative(double x) {return x < 0 || (x == 0 && 1 / x < 0);}

  /** java.util.Formatter's %f. */
  static String f(double x, int prec) {
    String sp = special(x);
    if (sp != null) {return sp;}
    String s = new BigDecimal(Double.toString(Math.abs(x))).setScale(prec, RoundingMode.HALF_UP).toPlainString();
    return (negative(x) ? "-" : "") + s;
  }

  /** java.util.Formatter's %e. */
  static String e(double x, int prec) {
    String sp = special(x);
    if (sp != null) {return sp;}
    return (negative(x) ? "-" : "") + sci(new BigDecimal(Double.toString(Math.abs(x))), prec + 1);
  }

  /** ax (&ge; 0) in scientific notation with <code>digits</code> significant digits. */
  private static String sci(BigDecimal ax, int digits) {
    int exp = 0;
    BigDecimal mant;
    if (ax.signum() == 0) {
      mant = BigDecimal.ZERO.setScale(digits - 1);
    } else {
      BigDecimal v = ax.round(new MathContext(digits, RoundingMode.HALF_UP));
      exp = v.precision() - v.scale() - 1;
      mant = v.movePointLeft(exp).setScale(digits - 1, RoundingMode.HALF_UP);
    }
    int ae = Math.abs(exp);
    return mant.toPlainString() + "e" + (exp < 0 ? "-" : "+") + (ae < 10 ? "0" : "") + ae;
  }

  /** java.util.Formatter's %g: round to <code>prec</code> significant digits
   * (HALF_UP); if 1e-4 &le; |rounded| &lt; 10^prec use fixed notation,
   * otherwise scientific notation with an exponent of at least two digits. */
  static String g(double x, int prec) {
    String sp = special(x);
    if (sp != null) {return sp;}
    if (prec == 0) {prec = 1;}
    boolean neg = negative(x);
    if (x == 0) {
      return (neg ? "-" : "") + new BigDecimal(0).setScale(prec - 1).toPlainString();
    }
    BigDecimal v = new BigDecimal(Double.toString(Math.abs(x)))
        .round(new MathContext(prec, RoundingMode.HALF_UP));
    int exp = v.precision() - v.scale() - 1; // decimal exponent of the leading digit
    String s;
    if (v.compareTo(new BigDecimal("0.0001")) >= 0 && exp < prec) {
      s = v.setScale(Math.max(prec - exp - 1, 0), RoundingMode.HALF_UP).toPlainString();
    } else {
      s = sci(v, prec);
    }
    return (neg ? "-" : "") + s;
  }
}
