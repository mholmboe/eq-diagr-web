package webec;

/** A sorted set that calls compareTo on the same pairs, in the same order, as
 * java.util.TreeSet on the JVM (a red-black tree, as in "Introduction to
 * Algorithms" by Cormen et al.; the first element is also compared with itself).
 * <p>
 * Why: lib.database.Complex.compareTo sorts the reactants of both reactions
 * in place when the names are equal (ignoring case). Which reactions end up
 * with sorted reactants, and so the reactions written by DataMaintenance's
 * "merge to binary", depends on which pairs the set compares. TeaVM's TreeSet
 * is built differently and compares other pairs.
 * Only what DbMaint uses is here: add, remove, size and iteration (in order;
 * the set must not be changed while iterating). */
final class JdkTreeSet<E extends Comparable<? super E>> implements Iterable<E> {
  private static final boolean RED = false, BLACK = true;
  private static final class Entry<E> {
    E key; Entry<E> left, right, parent; boolean color = BLACK;
    Entry(E key, Entry<E> parent) {this.key = key; this.parent = parent;}
  }
  private Entry<E> root;
  private int size;

  int size() {return size;}

  /** as TreeMap.put: false if an equal element is there (it is not replaced) */
  boolean add(E key) {
    Entry<E> t = root;
    if (t == null) {
      key.compareTo(key);   // TreeMap.put checks the type (and null) this way
      root = new Entry<E>(key, null);
      size = 1;
      return true;
    }
    int cmp;
    Entry<E> parent;
    do {
      parent = t;
      cmp = key.compareTo(t.key);
      if (cmp < 0) {t = t.left;} else if (cmp > 0) {t = t.right;} else {return false;}
    } while (t != null);
    Entry<E> e = new Entry<E>(key, parent);
    if (cmp < 0) {parent.left = e;} else {parent.right = e;}
    fixAfterInsertion(e);
    size++;
    return true;
  }

  /** as TreeMap.remove (getEntry, then deleteEntry) */
  boolean remove(E key) {
    Entry<E> p = root;
    while (p != null) {
      int cmp = key.compareTo(p.key);
      if (cmp < 0) {p = p.left;} else if (cmp > 0) {p = p.right;} else {break;}
    }
    if (p == null) {return false;}
    deleteEntry(p);
    return true;
  }

  @Override public java.util.Iterator<E> iterator() {
    return new java.util.Iterator<E>() {
      Entry<E> next = first();
      @Override public boolean hasNext() {return next != null;}
      @Override public E next() {
        if (next == null) {throw new java.util.NoSuchElementException();}
        E k = next.key;
        next = successor(next);
        return k;
      }
    };
  }

  private Entry<E> first() {
    Entry<E> p = root;
    if (p != null) {while (p.left != null) {p = p.left;}}
    return p;
  }
  private static <E> Entry<E> successor(Entry<E> t) {
    if (t == null) {return null;}
    if (t.right != null) {
      Entry<E> p = t.right;
      while (p.left != null) {p = p.left;}
      return p;
    }
    Entry<E> p = t.parent, ch = t;
    while (p != null && ch == p.right) {ch = p; p = p.parent;}
    return p;
  }

  private void deleteEntry(Entry<E> p) {
    size--;
    if (p.left != null && p.right != null) {
      Entry<E> s = successor(p);
      p.key = s.key;
      p = s;
    }
    Entry<E> replacement = (p.left != null ? p.left : p.right);
    if (replacement != null) {
      replacement.parent = p.parent;
      if (p.parent == null) {root = replacement;}
      else if (p == p.parent.left) {p.parent.left = replacement;}
      else {p.parent.right = replacement;}
      p.left = p.right = p.parent = null;
      if (p.color == BLACK) {fixAfterDeletion(replacement);}
    } else if (p.parent == null) {
      root = null;
    } else {
      if (p.color == BLACK) {fixAfterDeletion(p);}
      if (p.parent != null) {
        if (p == p.parent.left) {p.parent.left = null;}
        else if (p == p.parent.right) {p.parent.right = null;}
        p.parent = null;
      }
    }
  }

  private static <E> boolean colorOf(Entry<E> p) {return p == null ? BLACK : p.color;}
  private static <E> Entry<E> parentOf(Entry<E> p) {return p == null ? null : p.parent;}
  private static <E> void setColor(Entry<E> p, boolean c) {if (p != null) {p.color = c;}}
  private static <E> Entry<E> leftOf(Entry<E> p) {return p == null ? null : p.left;}
  private static <E> Entry<E> rightOf(Entry<E> p) {return p == null ? null : p.right;}

  private void rotateLeft(Entry<E> p) {
    if (p == null) {return;}
    Entry<E> r = p.right;
    p.right = r.left;
    if (r.left != null) {r.left.parent = p;}
    r.parent = p.parent;
    if (p.parent == null) {root = r;}
    else if (p.parent.left == p) {p.parent.left = r;}
    else {p.parent.right = r;}
    r.left = p;
    p.parent = r;
  }
  private void rotateRight(Entry<E> p) {
    if (p == null) {return;}
    Entry<E> l = p.left;
    p.left = l.right;
    if (l.right != null) {l.right.parent = p;}
    l.parent = p.parent;
    if (p.parent == null) {root = l;}
    else if (p.parent.right == p) {p.parent.right = l;}
    else {p.parent.left = l;}
    l.right = p;
    p.parent = l;
  }

  private void fixAfterInsertion(Entry<E> x) {
    x.color = RED;
    while (x != null && x != root && x.parent.color == RED) {
      if (parentOf(x) == leftOf(parentOf(parentOf(x)))) {
        Entry<E> y = rightOf(parentOf(parentOf(x)));
        if (colorOf(y) == RED) {
          setColor(parentOf(x), BLACK); setColor(y, BLACK); setColor(parentOf(parentOf(x)), RED);
          x = parentOf(parentOf(x));
        } else {
          if (x == rightOf(parentOf(x))) {x = parentOf(x); rotateLeft(x);}
          setColor(parentOf(x), BLACK); setColor(parentOf(parentOf(x)), RED);
          rotateRight(parentOf(parentOf(x)));
        }
      } else {
        Entry<E> y = leftOf(parentOf(parentOf(x)));
        if (colorOf(y) == RED) {
          setColor(parentOf(x), BLACK); setColor(y, BLACK); setColor(parentOf(parentOf(x)), RED);
          x = parentOf(parentOf(x));
        } else {
          if (x == leftOf(parentOf(x))) {x = parentOf(x); rotateRight(x);}
          setColor(parentOf(x), BLACK); setColor(parentOf(parentOf(x)), RED);
          rotateLeft(parentOf(parentOf(x)));
        }
      }
    }
    root.color = BLACK;
  }

  private void fixAfterDeletion(Entry<E> x) {
    while (x != root && colorOf(x) == BLACK) {
      if (x == leftOf(parentOf(x))) {
        Entry<E> sib = rightOf(parentOf(x));
        if (colorOf(sib) == RED) {
          setColor(sib, BLACK); setColor(parentOf(x), RED); rotateLeft(parentOf(x));
          sib = rightOf(parentOf(x));
        }
        if (colorOf(leftOf(sib)) == BLACK && colorOf(rightOf(sib)) == BLACK) {
          setColor(sib, RED);
          x = parentOf(x);
        } else {
          if (colorOf(rightOf(sib)) == BLACK) {
            setColor(leftOf(sib), BLACK); setColor(sib, RED); rotateRight(sib);
            sib = rightOf(parentOf(x));
          }
          setColor(sib, colorOf(parentOf(x))); setColor(parentOf(x), BLACK); setColor(rightOf(sib), BLACK);
          rotateLeft(parentOf(x));
          x = root;
        }
      } else {
        Entry<E> sib = leftOf(parentOf(x));
        if (colorOf(sib) == RED) {
          setColor(sib, BLACK); setColor(parentOf(x), RED); rotateRight(parentOf(x));
          sib = leftOf(parentOf(x));
        }
        if (colorOf(rightOf(sib)) == BLACK && colorOf(leftOf(sib)) == BLACK) {
          setColor(sib, RED);
          x = parentOf(x);
        } else {
          if (colorOf(leftOf(sib)) == BLACK) {
            setColor(rightOf(sib), BLACK); setColor(sib, RED); rotateLeft(sib);
            sib = leftOf(parentOf(x));
          }
          setColor(sib, colorOf(parentOf(x))); setColor(parentOf(x), BLACK); setColor(leftOf(sib), BLACK);
          rotateRight(parentOf(x));
          x = root;
        }
      }
    }
    setColor(x, BLACK);
  }
}
