"""Round the float arithmetic of SED's Plot.java / Predom's Plot_Predom.java
(axis scale, text and label positions) to float precision, operation by
operation (browser build only).

Usage: python3 -I patch_plot_floats.py <Plot.java or Plot_Predom.java> ...   (edits in place)

TeaVM keeps Java float values as JavaScript doubles and ignores (float) casts.
Both plot classes compute the paper scale of the diagram in float
(xL, xI, yL, yI, heightAx, ...), and every label and line position is derived
from these. In Predom, the label-overlap test then compares positions and can
move a label by a whole step (0.6 mm) when a last-bit difference flips the
comparison. Rounding after each single float operation (+, -, *, / of two
floats evaluated in double, then rounded to float) reproduces the JVM result
exactly, so these lines are rewritten with webec.FloatMath.fround (F below).
"""
import re
import sys

F = "webec.FloatMath.fround"
RULES = [
    # (pattern, replacement, required in every file)
    (r"float heightAx = 0\.035f \* yAxl;", "float heightAx = %s(0.035f * yAxl);" % F, True),
    (r"heightAx = \(float\)(\w+)\.tHeight\*heightAx;", r"heightAx = %s(%s(\1.tHeight)*heightAx);" % (F, F), True),
    (r"xOr = 7\.5f \* heightAx;", "xOr = %s(7.5f * heightAx);" % F, False),
    (r"yOr = 4\.0f \* heightAx;", "yOr = %s(4.0f * heightAx);" % F, False),
    (r"float xMx = xOr \+ xAxl;", "float xMx = %s(xOr + xAxl);" % F, False),
    (r"float yMx = yOr \+ yAxl;", "float yMx = %s(yOr + yAxl);" % F, True),
    (r"float xL = xAxl / \(float\)\(xHigh - xLow\);", "float xL = %s(xAxl / %s(xHigh - xLow));" % (F, F), True),
    (r"float yL = yAxl / \(float\)\(yHigh - yLow\);", "float yL = %s(yAxl / %s(yHigh - yLow));" % (F, F), True),
    (r"float xI = xL \* \(float\)xLow - xOr;", "float xI = %s(%s(xL * %s(xLow)) - xOr);" % (F, F, F), True),
    (r"float yI = yL \* \(float\)yHigh - yMx;", "float yI = %s(%s(yL * %s(yHigh)) - yMx);" % (F, F, F), True),
    (r"xL = xL \* 1000;", "xL = %s(xL * 1000);" % F, True),
    (r"yL = yL \* 1000;", "yL = %s(yL * 1000);" % F, False),   # not in SED
    (r"xL = -xL \* \(float\)(\w+)\.peEh;", r"xL = %s(-xL * %s(\1.peEh));" % (F, F), True),
    (r"yL = -yL \* \(float\)(\w+)\.peEh;", r"yL = %s(-yL * %s(\1.peEh));" % (F, F), False),   # not in SED
    # SED: the points of each curve, and where a curve leaves the plot at yHigh or yLow
    (r"g\.moveToDrawTo\(xax\[curvePoint\],yL\*yax\[curvePoint\]-yI,(\d)\);",
     r"g.moveToDrawTo(xax[curvePoint],%s(%s(yL*yax[curvePoint])-yI),\1);" % (F, F), False),
    (r"(w|xP)\s*=\s*xax\[j\]\+\(xax\[curvePoint\]-xax\[j\]\)\*\(\(float\)(yHigh|yLow)-yax\[j\]\)\s*/\(yax\[curvePoint\]-yax\[j\]\);",
     r"\1 = %s(xax[j]+%s(%s(%s(xax[curvePoint]-xax[j])*%s(%s(\2)-yax[j]))/%s(yax[curvePoint]-yax[j])));" % (F, F, F, F, F, F, F), False),
]


def f(expr):
    return F + "(" + expr + ")"


# Text and label positions: exact one-to-one replacements, each rounding after
# every float operation. Each must be found in at least one of the files.
EXACT = [
    ("yP =((yAxl/2f)+yOr)-((((float)nTextY)/2f)*(1.3f*heightAx));",
     "yP =" + f(f(f("yAxl/2f") + "+yOr") + "-" + f(f("((float)nTextY)/2f") + "*" + f("1.3f*heightAx"))) + ";"),
    ("xP =((xAxl/2f)+xOr)-((((float)nTextX)/2f)*(1.1429f*heightAx));",
     "xP =" + f(f(f("xAxl/2f") + "+xOr") + "-" + f(f("((float)nTextX)/2f") + "*" + f("1.1429f*heightAx"))) + ";"),
    ("xP = xOr - 6.6f*heightAx;", "xP = " + f("xOr - " + f("6.6f*heightAx")) + ";"),
    ("yP = yOr - 3.6f*heightAx;", "yP = " + f("yOr - " + f("3.6f*heightAx")) + ";"),
    # Predom: step used to move overlapping area labels (a float division)
    ("double incrY = heightAx / 6;", "double incrY = " + f("heightAx / 6") + ";"),
    # SED: curve labels
    ("float xP1 = 0.5f*namn.nameLength[i]*heightAx;", "float xP1 = " + f(f("0.5f*namn.nameLength[i]") + "*heightAx") + ";"),
    ("xP = Math.min(xMx-xP1, Math.max(xP,xOr+0.4f*heightAx));",
     "xP = Math.min(" + f("xMx-xP1") + ", Math.max(xP," + f("xOr+" + f("0.4f*heightAx")) + "));"),
    ("yPl[k] = yPl0 + (iSign * inkr * (float)heightAx/6.f);",
     "yPl[k] = " + f("yPl0 + " + f(f("(iSign * inkr) * heightAx") + "/6.f")) + ";"),
    # headings
    ("yP = yMx + heightAx;", "yP = " + f("yMx + heightAx") + ";"),
    ("yP = yMx + 0.5f*heightAx;", "yP = " + f("yMx + " + f("0.5f*heightAx")) + ";"),
    ("yP = yP + 2f*heightAx;", "yP = " + f("yP + " + f("2f*heightAx")) + ";"),
    ("headColumnX = headColumnX + (33f*heightAx);", "headColumnX = " + f("headColumnX + " + f("33f*heightAx")) + ";"),
    ("yP = yMx + 3f*heightAx;", "yP = " + f("yMx + " + f("3f*heightAx")) + ";"),
    ("yP = yMx + 2.5f*heightAx;", "yP = " + f("yMx + " + f("2.5f*heightAx")) + ";"),
    ("if(yP > (yPMx + 0.1f*heightAx))", "if(yP > " + f("yPMx + " + f("0.1f*heightAx")) + ")"),
    ("yPMx+(3.5f*heightAx)", f("yPMx+" + f("3.5f*heightAx"))),
    ("headColumnX = (float)(0.5d*heightAx);", "headColumnX = " + f("0.5d*heightAx") + ";"),
]

found = {old: 0 for old, _ in EXACT}
for path in sys.argv[1:]:
    text = open(path, encoding="utf-8").read()
    total = 0
    for pat, rep, required in RULES:
        text, n = re.subn(pat, rep, text)
        if n == 0 and required:
            sys.exit("patch_plot_floats.py: %r not found in %s" % (pat, path))
        total += n
    for old, new in EXACT:
        n = text.count(old)
        found[old] += n
        total += n
        text = text.replace(old, new)
    open(path, "w", encoding="utf-8").write(text)
    print("%s: %d float expressions rounded" % (path.split("/")[-1], total))
missing = [old for old, n in found.items() if n == 0]
if missing:
    sys.exit("patch_plot_floats.py: not found in any file: " + "; ".join(missing))
