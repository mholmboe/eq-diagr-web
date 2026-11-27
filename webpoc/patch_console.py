"""Make browser-compatible copies of eq-diagr's console programs
(PlotPDF, PlotPS, ModChemSyst, ModReaction).

Usage: python3 -I patch_console.py <upstream .java> <output .java>

These programs do their work in the constructor; main() only adds the
System.exit and the "no arguments" message box, and the browser engine
calls the constructor. The changes are mechanical:
  1. the AWT message box (class ErrMsgBx, with its dialog class) is removed,
     and its uses print the message instead (the engine always passes -nostop,
     so they are not reached in normal use);
  2. java.awt.Point, used as plain geometry in PlotPS, becomes webec.awt.Point;
  3. getPathApp() uses the current directory (there is no code source in the browser).
Any other Swing or AWT reference stops the build.
"""
import re
import sys

src_path, out_path = sys.argv[1], sys.argv[2]
src = open(src_path, encoding="utf-8").read()


def fail(msg):
    sys.exit("patch_console.py: " + msg + " (" + src_path + ")")


start = src.find('//<editor-fold defaultstate="collapsed" desc="ErrMsgBx">')
if start < 0:
    fail("ErrMsgBx fold not found")
start = src.rfind("\n", 0, start) + 1
depth = 0
for m in re.finditer(r"//\s*<(/?)editor-fold", src[start:]):
    depth += -1 if m.group(1) else 1
    if depth == 0:
        end = start + src[start:].find("\n", m.end()) + 1
        break
else:
    fail("ErrMsgBx fold not closed")
src = src[:start] + "// ErrMsgBx removed for the browser build\n" + src[end:]

src, n = re.subn(r"ErrMsgBx\s+\w+\s*=\s*new ErrMsgBx\(", "webec.WebSupport.errMsg(", src)
if n == 0:
    fail("no uses of ErrMsgBx found")
src = re.sub(r"\bjava\.awt\.Point\b", "webec.awt.Point", src)
# getPathApp() finds the program's folder (to look for Spana's ini file) from
# the class's code source, which the browser does not have: use the current
# directory instead, as getPathApp() itself does when there is no code source.
src, n_path = re.subn(r"\w+\.getClass\(\)\s*\.\s*getProtectionDomain\(\)\s*\.\s*getCodeSource\(\)"
                      r"\s*\.\s*getLocation\(\)\s*\.\s*toURI\(\)", "null", src)
# PlotPS.getBoundingBox estimates the size of texts in single precision, and
# the (int) casts then truncate; TeaVM computes float expressions in double, so
# round to float after each operation, as the JVM does (see patch_plot_floats.py).
F = "webec.FloatMath.fround"
FLOAT_RULES = [
    (r"\(int\)\(\((height)\) \* \(float\)Math\.(cos|sin)\((a[01])\)\)", r"(int)%s(\1 * %s(Math.\2(\3)))" % (F, F)),
    (r"\(int\)\((w|h) \* \(float\)Math\.(cos|sin)\((a[01])\)\)", r"(int)%s(\1 * %s(Math.\2(\3)))" % (F, F)),
    (r"final float h = height \* 2f;", "final float h = %s(height * 2f);" % F),
    (r"textBoxMinMax\(i1, i2, \(txtSize \* 100f\),\s*\(txtSize\*100f\*comment\.length\(\)\), txtAngle, bb\);",
     "textBoxMinMax(i1, i2, %s(txtSize * 100f),\n                            %s(%s(txtSize*100f)*comment.length()), txtAngle, bb);" % (F, F, F)),
]
if "textBoxMinMax" in src:
    for pat, rep in FLOAT_RULES:
        src, k = re.subn(pat, rep, src)
        if k == 0:
            fail("float rule not found: " + pat)
left = sorted(set(re.findall(r"(?:javax\.swing|java\.awt)\.[\w.]+", src)))
if left or "ErrMsgBx" in src.replace("// ErrMsgBx removed", ""):
    fail("unhandled GUI references: " + ", ".join(left))
open(out_path, "w", encoding="utf-8").write(src)
print("%s: %d message boxes replaced" % (src_path.rsplit("/", 1)[-1], n))
