package webec.swing;

/** Browser build only: a headless stand-in for the Swing widgets that
 * Predom's calculation methods touch (labels, text fields, check boxes,
 * combo boxes, scroll bars, menus, the tabbed pane). It keeps the state the
 * calculation reads back (text, selection, scroll-bar value) with the same
 * limits as Swing, and ignores everything that only changes the display. */
public class Widget {
  private String text = "";
  private boolean enabled = true, selected = false;
  // JScrollBar defaults: minimum 0, maximum 100, visible amount 10
  private int value = 0, min = 0, max = 100, extent = 10;
  private Object[] items = new Object[0];
  private int selectedIndex = -1;

  /** as JScrollBar.setMinimum/setMaximum/setVisibleAmount */
  public Widget range(int minimum, int maximum, int visibleAmount) {
    min = minimum; max = maximum; extent = visibleAmount; setValue(value); return this;
  }
  /** as JComboBox with a DefaultComboBoxModel: the first item is selected */
  public Widget items(Object... it) {items = it.clone(); selectedIndex = it.length > 0 ? 0 : -1; return this;}

  public void setText(String t) {text = t == null ? "" : t;}
  public String getText() {return text;}
  public void setEnabled(boolean b) {enabled = b;}
  public boolean isEnabled() {return enabled;}
  public void setSelected(boolean b) {selected = b;}
  public boolean isSelected() {return selected;}
  /** JScrollBar: the value is kept within [minimum, maximum - visibleAmount] */
  public void setValue(int v) {value = Math.max(min, Math.min(max - extent, v));}
  public int getValue() {return value;}
  public int getItemCount() {return items.length;}
  public Object getItemAt(int i) {return (i >= 0 && i < items.length) ? items[i] : null;}
  public int getSelectedIndex() {return selectedIndex;}
  /** JComboBox.setSelectedIndex: an index outside the list is an error */
  public void setSelectedIndex(int i) {
    if (i < -1 || i >= items.length) {throw new IllegalArgumentException("setSelectedIndex: " + i + " out of bounds");}
    selectedIndex = i;
  }
  public boolean requestFocusInWindow() {return false;}
  public void setEnabledAt(int i, boolean b) {}
  public void setTitleAt(int i, String t) {}
  public void setSelectedComponent(Object c) {}
  public void append(String s) {}
  public void setCaretPosition(int p) {}
  public void doClick() {}
}
