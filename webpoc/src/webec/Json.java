package webec;

/** A minimal JSON object writer for the engine's answers (insertion order kept). */
final class Json {
  private final StringBuilder sb = new StringBuilder();

  private Json key(String k) {
    sb.append(sb.length() == 0 ? '{' : ',').append(quote(k)).append(':');
    return this;
  }
  Json put(String k, String v) {key(k).sb.append(v == null ? "null" : quote(v)); return this;}
  Json put(String k, boolean v) {key(k).sb.append(v); return this;}
  Json put(String k, long v) {key(k).sb.append(v); return this;}
  Json put(String k, double v) {key(k).sb.append(num(v)); return this;}
  Json put(String k, Json v) {key(k).sb.append(v.toString()); return this;}
  Json putRaw(String k, String json) {key(k).sb.append(json); return this;}
  Json putStrings(String k, java.util.List<String> l) {
    key(k).sb.append('[');
    for (int i = 0; i < l.size(); i++) {if (i > 0) {sb.append(',');} sb.append(quote(l.get(i)));}
    sb.append(']');
    return this;
  }

  @Override public String toString() {return sb.length() == 0 ? "{}" : sb.toString() + "}";}

  /** a double as JSON: NaN and infinities become null */
  static String num(double v) {
    if (Double.isNaN(v) || Double.isInfinite(v)) {return "null";}
    if (v == Math.rint(v) && Math.abs(v) < 1e15) {return String.valueOf((long) v);}
    return String.valueOf(v);
  }

  static String quote(String s) {
    if (s == null) {return "null";}
    StringBuilder q = new StringBuilder(s.length() + 2).append('"');
    for (int i = 0; i < s.length(); i++) {
      char c = s.charAt(i);
      switch (c) {
        case '"': q.append("\\\""); break;
        case '\\': q.append("\\\\"); break;
        case '\n': q.append("\\n"); break;
        case '\r': q.append("\\r"); break;
        case '\t': q.append("\\t"); break;
        default:
          if (c < 0x20 || c == 0x2028 || c == 0x2029) {q.append(String.format("\\u%04x", (int) c));}
          else {q.append(c);}
      }
    }
    return q.append('"').toString();
  }
}
