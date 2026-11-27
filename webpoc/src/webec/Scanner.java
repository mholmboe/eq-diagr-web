package webec;

/** Browser build only: the part of java.util.Scanner that LibDataBase's
 * References.splitRefs uses (TeaVM has no Scanner): the tokens of a string
 * between the matches of a delimiter pattern. Like Scanner, a delimiter at the
 * start is skipped; empty tokens between two delimiters can be returned
 * (splitRefs skips them). */
public final class Scanner {
  private final String text;
  private String[] tokens;
  private int next;

  public Scanner(String text) {this.text = text; useDelimiter("\\p{javaWhitespace}+");}

  public Scanner useDelimiter(String pattern) {
    String[] t = java.util.regex.Pattern.compile(pattern).split(text, -1);
    java.util.List<String> l = new java.util.ArrayList<String>(java.util.Arrays.asList(t));
    if (!l.isEmpty() && l.get(0).isEmpty()) {l.remove(0);}                  // leading delimiter
    if (!l.isEmpty() && l.get(l.size() - 1).isEmpty()) {l.remove(l.size() - 1);} // trailing delimiter
    tokens = l.toArray(new String[0]);
    next = 0;
    return this;
  }
  public Scanner useLocale(java.util.Locale locale) {return this;}
  public boolean hasNext() {return next < tokens.length;}
  public String next() {
    if (next >= tokens.length) {throw new java.util.NoSuchElementException();}
    return tokens[next++];
  }
  public void close() {}
}
