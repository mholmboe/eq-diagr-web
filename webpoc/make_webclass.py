"""Generate a headless SedWeb.java or PredomWeb.java from eq-diagr's SED.java
or Predom.java.

Usage: python3 -I make_webclass.py SED|Predom <upstream .java> <output .java>

SED and Predom are JFrames. Their calculation path (start, dispatchArg,
readDataFile, checkInput, doCalculations, the HaltaTask SwingWorker, the
message methods, and the small menu/label helpers they call) is copied here
verbatim, fold by fold, from the upstream source. The Swing widgets those
methods touch become webec.swing.Widget stand-ins that keep the state the
calculation reads back (labels, combo-box index, scroll-bar value with the
same limits), and JOptionPane / SwingWorker / SwingUtilities become the
headless classes in webec.swing. Only a few lines are replaced, each checked
by count so that an upstream change stops the build instead of being
silently mistranslated.
"""
import re
import sys

COMMON_FOLDS = ["start", "checkInput", "dispatchArg", "showActivityCoefficientControls",
                "disable/restore Menus", "readDataFile_hadError", "set_tol_inComboBox",
                "showTheInputFileName", "millisToShortDHMS", "readDataFile",
                "Temperature & Ionic Strength", "showErrMsgBx", "showMsg", "doCalculations",
                "private class HaltaTask"]
TOL_ITEMS = ["1E-2", "1E-3", "1E-4", "1E-5", "1E-6", "1E-7", "1E-8", "1E-9", "1E-10"]

PROGRAMS = {
    "SED": {
        "package": "simpleEquilibriumDiagrams",
        "web": "SedWeb",
        "frame": "sedFrame",
        "folds": COMMON_FOLDS,
        # jComboBoxTol in SED's initComponents()
        "tol_items": TOL_ITEMS,
        "accessors": '''
    public long calcMillis() {return calculationTime;}
    /** points calculated along the X-axis in the last run */
    public int pointsCalculated() {return tsk == null ? 0 : nStepX + 1;}
    /** points where HaltaFall failed in the last run */
    public int pointsFailed() {return tsk == null ? 0 : tsk.nbrHaltaErrors;}
''',
    },
    "Predom": {
        "package": "predominanceAreaDiagrams",
        "web": "PredomWeb",
        "frame": "predomFrame",
        "folds": COMMON_FOLDS[:9] + ["findTopSpecies()"] + COMMON_FOLDS[9:],
        # jComboBoxTol in Predom's initComponents() has a blank last item
        "tol_items": TOL_ITEMS + [" "],
        "accessors": '''
    public long calcMillis() {return calculationTime;}
    public int gridSteps() {return nSteps;}
''',
    },
}

prog, src_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
cfg = PROGRAMS[prog]
web = cfg["web"]
src = open(src_path, encoding="utf-8").read()


def fail(msg):
    sys.exit("make_webclass.py: " + msg + " (" + src_path + ")")


def fold(desc):
    """Text of the editor fold with this description, markers included."""
    start = src.find('//<editor-fold defaultstate="collapsed" desc="%s">' % desc)
    if start < 0:
        fail("fold %r not found" % desc)
    start = src.rfind("\n", 0, start) + 1
    depth = 0
    pat = re.compile(r"//\s*<(/?)editor-fold")
    for m in pat.finditer(src, start):
        depth += -1 if m.group(1) else 1
        if depth == 0:
            end = src.find("\n", m.end())
            return src[start:end + 1]
    fail("fold %r not closed" % desc)


def replace(text, old, new, count=1):
    n = text.count(old)
    if n != count:
        fail("expected %d x %r, found %d" % (count, old, n))
    return text.replace(old, new)


# ---- fields: from the class declaration up to the constructor
decl = "public class %s extends javax.swing.JFrame {" % prog
i0 = src.index(decl)
i1 = src.index('//<editor-fold defaultstate="collapsed" desc="Constructor">')
fields = replace(src[i0:i1], decl, "public class %s {" % web)
for gui_field in ["    static java.awt.Dimension screenSize;\n",
                  "    private final java.awt.Dimension originalSize;\n",
                  "    private HelpAboutF helpAboutFrame = null;\n",
                  "    private final javax.swing.JFileChooser fc;\n",
                  "    private final javax.swing.filechooser.FileNameExtensionFilter filterDat;\n",
                  "    private final DiagrPaintUtility diagrPaintUtil;\n"]:
    fields = replace(fields, gui_field, "")
fields, n = re.subn(r"    private final java\.io\.PrintStream (err|out)PrintStream\s*=[^;]*;\n", "", fields)
if n != 2:
    fail("expected the two filtered PrintStream fields, found %d" % n)

# ---- methods: copied fold by fold
methods = "\n".join(fold(d) for d in cfg["folds"])

# "-keep" redirects output to the window's text pane; there is none here.
methods = re.sub(r" *out = outPrintStream; // direct messages to tabbed pane\n", "", methods)
methods, n = re.subn(r" *err = errPrintStream; // direct error messages to tabbed pane\n", "", methods)
if n != 1 or "PrintStream;" in methods:
    fail("the -keep redirection to the text pane has changed")
# the AWT message box used when there is no frame
methods = replace(methods, "ErrMsgBox mb = new ErrMsgBox(", "webec.WebSupport.errMsg(", count=2)
for cls in ["JOptionPane", "SwingWorker", "SwingUtilities"]:
    methods = methods.replace("javax.swing." + cls, "webec.swing." + cls)
if "javax.swing" in methods or "java.awt" in methods:
    bad = sorted(set(re.findall(r"(?:javax\.swing|java\.awt)\.[\w.]+", methods)))
    fail("unhandled GUI classes in the copied methods: " + ", ".join(bad))

body = re.sub(r"\b%s\b" % prog, web, fields + methods)

# ---- every widget the copied code names becomes a Widget stand-in
widgets = sorted(set(re.findall(r"\bj[A-Z]\w*\b", body)))
widget_decls = "".join("    private final webec.swing.Widget %s = new webec.swing.Widget();\n" % w
                       for w in widgets)


def jstr(items):
    return ", ".join('"%s"' % s for s in items)


extra = '''
  //<editor-fold defaultstate="collapsed" desc="browser build: constructor, run() and GUI-only helpers">
    // ---- Swing widgets used by the methods above, as headless stand-ins
%(widgets)s
    /** Browser build: the widget state set by %(prog)s's initComponents() and
     * constructor, then %(prog)s.main(): -dbg, -rev and "?" are read first. */
    public %(web)s(java.io.PrintStream out0, java.io.PrintStream err0) {
        out = out0; err = err0;
        pathApp = "";
        doNotStop = true;   // no dialogs in the browser
        doNotExit = false;
        // initComponents()
        jScrollBarNbrPoints.range(NSTP_MIN, NSTP_MAX+1, 1);
        jScrollBarHeight.range(3, 101, 1);
        jScrollBarHeight.setValue(10);
        jComboBoxModel.items("Davies eqn.", "SIT (Specific Ion interaction 'Theory')", "simplified HKF (Helgeson, Kirkham & Flowers)");
        jComboBoxTol.items(%(tol)s);
        // constructor
        setPathDef();
        jScrollBarNbrPoints.setValue(nSteps);
        tHeight = 1;
        jScrollBarHeight.setValue(Math.round((float)(10*tHeight)));
        jLabelTemperature.setText("NaN");
        jLabelPressure.setText("NaN");
        jComboBoxModel.setSelectedIndex(actCoeffsModelDefault);
    }

    /** As %(prog)s.main for a command-line run: returns true if the plot file was written. */
    public boolean run(String[] args) {
        boolean rev0 = false, h = false;
        for (String arg : args) {
            if (arg.startsWith("-dbg") || arg.startsWith("/dbg")) {dbg = true;}
            else if (arg.equalsIgnoreCase("-rev") || arg.equalsIgnoreCase("/rev")) {rev0 = true;}
            else if (arg.equals("-?") || arg.equals("/?") || arg.equals("?")) {h = true;}
        }
        %(frame)s = this;
        if (outputPltFile != null) {outputPltFile.delete();}
        start(rev0, h, args);
        return finishedCalculations && outputPltFile != null && outputPltFile.exists();
    }
%(accessors)s
    // ---- GUI-only helpers of %(prog)s, without the window
    private boolean isVisible() {return false;}
    private void setVisible(boolean b) {}
    private void setCursorWait() {}
    private void setCursorDef() {}
    private void notify_All() {}
    private void end_program() {programEnded = true;}
    /** %(prog)s.setPathDef(File): the directory of the file */
    private void setPathDef(java.io.File f) {
        if(pathDef.length()>0) {pathDef.delete(0, pathDef.length());}
        String parent = f.getAbsoluteFile().getParent();
        pathDef.append(parent == null ? "/" : parent);
    }
    private void setPathDef(String fName) {setPathDef(new java.io.File(fName));}
    private void setPathDef() {
        String t = System.getProperty("user.home");
        if(pathDef.length()>0) {pathDef.delete(0, pathDef.length());}
        pathDef.append(t == null ? "/" : t);
    }
  //</editor-fold>
}
''' % {"widgets": widget_decls, "prog": prog, "web": web, "frame": cfg["frame"],
       "tol": jstr(cfg["tol_items"]), "accessors": cfg["accessors"]}

header = replace(src[:i0], "import lib.kemi.graph_lib.DiagrPaintUtility;\n", "")
pkg = "package %s;\n" % cfg["package"]
note = ("/* GENERATED by webpoc/make_webclass.py from eq-diagr's %s.java for the\n"
        " * browser build; do not edit. The methods are %s's own. */\n" % (prog, prog))
out = replace(header, pkg, pkg + note) + body + extra
open(out_path, "w", encoding="utf-8").write(out)
print("%s.java: %d folds copied, %d widget stand-ins" % (web, len(cfg["folds"]), len(widgets)))
