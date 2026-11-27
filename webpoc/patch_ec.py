"""Make a browser-compatible copy of eq-diagr's EC.java.

Usage: python3 -I patch_ec.py <upstream EC.java> <output EC.java>

Changes, all mechanical, so that upstream updates are picked up on rebuild:
  1. the AWT message box (class ErrMsgBx) is removed; its one use prints to stderr;
  2. System.exit(0) throws webec.WebSupport.Quit, which the browser driver catches;
  3. the "-keep" pause (Scanner on System.in) is compiled out;
  4. webReset() is added, restoring every static field to its initial value,
     since all test cases run in one JavaScript session instead of one process each.
"""
import sys

src_path, out_path = sys.argv[1], sys.argv[2]
src = open(src_path, encoding="utf-8").read()


def replace_once(text, old, new):
    if text.count(old) != 1:
        sys.exit("patch_ec.py: expected exactly one %r in %s, found %d"
                 % (old, src_path, text.count(old)))
    return text.replace(old, new)


start = src.index('//<editor-fold defaultstate="collapsed" desc="ErrMsgBx">')
end_marker = '}  // static class ErrMsgBx'
end = src.index(end_marker) + len(end_marker)
src = src[:start] + "// ErrMsgBx removed for the browser build" + src[end:]

src = replace_once(src, "ErrMsgBx mb = new ErrMsgBx(", "webec.WebSupport.errMsg(")
if src.count("System.exit(0);") != 2:
    sys.exit("patch_ec.py: expected two System.exit(0) calls")
src = src.replace("System.exit(0);", "throw new webec.WebSupport.Quit();")
src = replace_once(src, "    if(keep) {", "    if(false) { // browser: no console to pause")

reset = """
  /** Browser build only: restore all static fields to their initial values. */
  public static void webReset() {
    debug = false; dbg0 = 0; keep = false;
    calculationStart = 0; calculationTime = 0;
    points = false; activityCoeffsModel = -1;
    ionicStr0 = 0.; temperature0 = -1000.;
    tolHalta0 = Chem.TOL_HALTA_DEF; tolLogF0 = Chem.TOL_HALTA_DEF_LOGF;
    acPath = "";
    datFile_name = null; datFile = null; datFile_path = null;
    outFile_name = null; outFile = null; resFile_name = null; resFile = null;
    ps = null; pt = null;
    npkt = 0; np = 0; how = null; bt = null;
    tableFirstTime = true;
    chem = null; cs = null; concs = null;
    activityCoeffs = false; Hplus = 0; eMinus = 0;
    sep = ",";
  }
"""
last = src.rindex("}")
src = src[:last] + reset + src[last:]

open(out_path, "w", encoding="utf-8").write(src)
