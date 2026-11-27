"""Browser build only: lets the browser engine use LibDataBase's own code for
the database maintenance tools (DataMaintenance, AddShowReferences).

Usage: python3 -I patch_dblib.py <folder with the copied lib/database sources>

LibDB.getElements, CheckDatabases.checkDatabases and the AddDataElem methods
take a window (java.awt.Component) only to own their message boxes; References
keeps the screen size for its dialog. TeaVM has no AWT or Swing, so in the
copies made by build-web.sh:
  - the window parameter becomes an Object;
  - "make the window visible" statements are removed;
  - MsgExceptn.showErrMsg (a message box) prints the message instead
    (webec.WebSupport.showErrMsg);
  - javax.swing.JOptionPane is webec.swing.JOptionPane, which prints the
    message and answers OK/Yes (the browser page asks the user first);
  - the list dialog of AddDataElem.elemCompAdd_Update prints the list;
  - the two list dialogs of CheckDatabases, which the browser does not use,
    are left out (stubs);
  - References has no screen size.
Everything else is compiled as it is in eq-diagr.
"""
import os
import re
import sys

d = sys.argv[1]


def patch(name, rules, stubs=()):
    p = os.path.join(d, name)
    s = open(p, encoding="utf-8").read()
    for old, new, count in rules:
        s2, n = re.subn(old, new, s, flags=re.S)
        if n != count:
            sys.exit("patch_dblib.py: %s: %r matched %d times, expected %d" % (name, old[:60], n, count))
        s = s2
    for sig in stubs:
        i = s.find(sig)
        if i < 0:
            sys.exit("patch_dblib.py: %s: method %r not found" % (name, sig))
        b = s.index("{", i)
        depth, j = 0, b
        while True:  # braces in comments, strings and characters do not count
            if s.startswith("//", j):
                j = s.index("\n", j)
                continue
            if s.startswith("/*", j):
                j = s.index("*/", j) + 2
                continue
            if s[j] in "\"'":
                q, j = s[j], j + 1
                while s[j] != q:
                    j += 2 if s[j] == "\\" else 1
            elif s[j] == "{":
                depth += 1
            elif s[j] == "}":
                depth -= 1
                if depth == 0:
                    break
            j += 1
        s = s[:b] + "{throw new UnsupportedOperationException(\"not in the browser build\");}" + s[j + 1:]
    open(p, "w", encoding="utf-8").write(s)
    print("patch_dblib.py: %s patched" % name)


COMMON = [
    (r"java\.awt\.Component parent", "Object parent", None),
    (r"if\(parent != null && !parent\.isVisible\(\)\) \{parent\.setVisible\(true\);\}", "", None),
    (r"if\(parent != null\) \{if\(!parent\.isVisible\(\)\) \{parent\.setVisible\(true\);\}\}", "", None),
    (r"MsgExceptn\.showErrMsg\(", "webec.WebSupport.showErrMsg(", None),
    (r"javax\.swing\.JOptionPane\b", "webec.swing.JOptionPane", None),
]


def counted(name, rules):
    """the counts of the common rules are taken from the file itself"""
    s = open(os.path.join(d, name), encoding="utf-8").read()
    out = []
    for old, new, count in rules:
        out.append((old, new, count if count is not None else len(re.findall(old, s, flags=re.S))))
    return out


patch("LibDB.java", counted("LibDB.java", COMMON))
patch("AddDataElem.java", counted("AddDataElem.java", COMMON) + [
    # the information box listing the reactants added to the element file
    (r"// javax\.swing\.DefaultListModel aModel = new javax\.swing\.DefaultListModel\(\);  // java 1\.6\s*"
     r"javax\.swing\.DefaultListModel<String> aModel = .*?INFORMATION_MESSAGE\);",
     "java.util.Collections.sort(items,String.CASE_INSENSITIVE_ORDER);\n"
     "    System.out.println(\"The following reactant\"+(items.size()>1?\"s\":\"\")+\" will be written to file \\\"\""
     "+afE.getName()+\"\\\": \"+String.join(\", \", items));", 1),
])
patch("CheckDatabases.java", counted("CheckDatabases.java", COMMON),
      stubs=["public static boolean displayDatabaseErrors(", "public static boolean showListDialog("])
# the screen size is only used by References' own display dialog, which the
# browser does not use (the page shows the references)
# splitRefs uses java.util.Scanner, which TeaVM lacks: webec.Scanner has the part it uses
patch("References.java", [
    (r"private final java\.awt\.Dimension screenSize = java\.awt\.Toolkit\.getDefaultToolkit\(\)\.getScreenSize\(\);",
     "private final java.awt.Dimension screenSize = null;", 1),
    (r"java\.util\.Scanner\b", "webec.Scanner", 3),
])
