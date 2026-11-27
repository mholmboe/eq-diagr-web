/** Reference for web/properties.js: a properties file read with
 * java.util.Properties (as LibDataBase's References.readRefsFile does) and
 * written with Properties.store(Writer), the keys in alphabetical order (as
 * lib.huvud.SortedProperties intends; on Java 9 and later store() takes the
 * entries from entrySet(), so they are sorted here). Usage:
 *   java PropsRef <in.properties> <out-load.txt> <out-store.txt>
 * out-load.txt: one line per entry, key and value escaped with \n, \t, \\ and
 * the separator " = " written as \u0000, sorted by key. */
public class PropsRef {
  public static void main(String[] a) throws Exception {
    java.util.Properties p = new java.util.Properties() {
      @Override public java.util.Set<java.util.Map.Entry<Object, Object>> entrySet() {
        java.util.TreeMap<Object, Object> t = new java.util.TreeMap<Object, Object>();
        for (java.util.Map.Entry<Object, Object> e : super.entrySet()) {t.put(e.getKey(), e.getValue());}
        return java.util.Collections.unmodifiableSet(t.entrySet());
      }
    };
    try (java.io.Reader r = new java.io.InputStreamReader(new java.io.FileInputStream(a[0]), "UTF8")) {p.load(r);}
    StringBuilder sb = new StringBuilder();
    for (String k : new java.util.TreeSet<String>(p.stringPropertyNames())) {sb.append(esc(k)).append('\u0000').append(esc(p.getProperty(k))).append('\n');}
    java.nio.file.Files.write(java.nio.file.Paths.get(a[1]), sb.toString().getBytes("UTF-8"));
    try (java.io.Writer w = new java.io.BufferedWriter(new java.io.OutputStreamWriter(new java.io.FileOutputStream(a[2]), "UTF8"))) {p.store(w, null);}
  }
  static String esc(String s) {return s.replace("\\", "\\\\").replace("\n", "\\n").replace("\t", "\\t").replace("\r", "\\r");}
}
