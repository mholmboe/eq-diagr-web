package webec.swing;

/** Browser build only: javax.swing.SwingWorker run synchronously on the
 * calling thread. execute() calls doInBackground() and then done(), as the
 * real class does on its worker and event threads; an exception from
 * doInBackground() is kept for get(), and done() still runs. publish() is a
 * no-op (it only feeds the progress label). */
public abstract class SwingWorker<T, V> {
  private boolean cancelled = false;
  private T result = null;
  private Exception failure = null;

  protected abstract T doInBackground() throws Exception;
  protected void done() {}
  protected void process(java.util.List<V> chunks) {}
  @SafeVarargs protected final void publish(V... chunks) {}

  public final void execute() {
    try {result = doInBackground();} catch (Exception ex) {failure = ex;}
    done();
  }
  public final boolean cancel(boolean mayInterrupt) {cancelled = true; return true;}
  public final boolean isCancelled() {return cancelled;}
  public final T get() throws Exception {if (failure != null) {throw failure;} return result;}
}
