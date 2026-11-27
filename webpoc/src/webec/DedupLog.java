package webec;

/** The log of SED and Predom. These programs print most messages twice: to
 * their message window (the <code>out</code> and <code>err</code> streams they
 * are given) and to the console (<code>System.out</code>, <code>System.err</code>).
 * On the desktop the two are seen in different places; in the browser both
 * would go to the one log, so every message would appear twice. Here the
 * message streams are written to the log, and a console line is left out when
 * it repeats a line just written to a message stream. Console-only lines (for
 * example debugging output of HaltaFall) are kept. */
final class DedupLog {
  private final java.io.PrintStream log;
  private final java.util.ArrayDeque<String> pending = new java.util.ArrayDeque<String>();
  private final Sink[] sinks = new Sink[4];
  /** for the program's message window */
  final java.io.PrintStream out, err;
  /** for System.out and System.err */
  final java.io.PrintStream consoleOut, consoleErr;

  DedupLog(java.io.PrintStream log) {
    this.log = log;
    out = stream(0, true); err = stream(1, true);
    consoleOut = stream(2, false); consoleErr = stream(3, false);
  }

  private java.io.PrintStream stream(int i, boolean primary) {
    sinks[i] = new Sink(primary);
    try {return new java.io.PrintStream(sinks[i], true, "UTF-8");}
    catch (java.io.UnsupportedEncodingException ex) {return new java.io.PrintStream(sinks[i], true);}
  }

  /** writes what is left of unfinished lines */
  void finish() {
    out.flush(); err.flush(); consoleOut.flush(); consoleErr.flush();
    for (Sink s : sinks) {s.endLine();}
    log.flush();
  }

  private final class Sink extends java.io.OutputStream {
    private final boolean primary;
    private final java.io.ByteArrayOutputStream line = new java.io.ByteArrayOutputStream();
    Sink(boolean primary) {this.primary = primary;}
    @Override public void write(int b) {
      line.write(b);
      if (b == '\n') {endLine();}
    }
    @Override public void write(byte[] b, int off, int len) {
      for (int i = off; i < off + len; i++) {write(b[i]);}
    }
    void endLine() {
      if (line.size() == 0) {return;}
      String s;
      try {s = line.toString("UTF-8");} catch (java.io.UnsupportedEncodingException ex) {s = line.toString();}
      line.reset();
      if (primary) {
        log.print(s);
        pending.addLast(s);
        if (pending.size() > 500) {pending.removeFirst();}
      } else if (pending.contains(s)) {
        // the console copy of a message: drop it, and the lines before it, which were matched or are console-less
        while (!pending.removeFirst().equals(s)) { }
      } else {
        log.print(s);
      }
    }
  }
}
