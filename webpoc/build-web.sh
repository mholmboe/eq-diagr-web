#!/bin/bash
# Browser version of eq-diagr: compile its calculation core and programs (EC,
# SED, Predom, PlotPDF, PlotPS, ModChemSyst, ModReaction and, with eq-diagr's
# branch calc-split, the database search) to one JavaScript engine with TeaVM.
# The pages run the engine in a Web Worker (web/engine-worker.js, engine-client.js).
#
# Usage:  ./build-web.sh [path-to-eq-diagr]     (default: ../eq-diagr)
# Then serve web/ over HTTP (python3 -m http.server --directory web) and open
# index.html: database search (database.html), diagram setup (spana.html), SED and
# Predom (sed.html, predom.html), help (help.html), EC tests (ec-tests.html).
# Tests: node tests/test-engine.js and node tests/test-examples.js.
#
# Needs the TeaVM jars in teavm-lib/ (fetched from Maven Central, TeaVM 0.14.1).

set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$(cd "${1:-$HERE/../eq-diagr}" && pwd)"
BUILD="$HERE/build"
WEB="$HERE/web"
TEAVM_CP="$HERE/teavm-lib/*"
JSO_JAR="$HERE/teavm-lib/teavm-jso-0.14.1.jar"
# TeaVM's Java class library and JSO runtime, which the compiler reads as input.
RUNTIME_JARS=""
for j in core classlib jso jso-apis jso-impl interop platform metaprogramming-api; do
  RUNTIME_JARS="$RUNTIME_JARS $HERE/teavm-lib/teavm-$j-0.14.1.jar"
done

rm -rf "$BUILD"
mkdir -p "$BUILD/src" "$BUILD/classes"

# Work on copies; the upstream tree is never modified.
echo "Copying LibChemDiagr, EC and SED sources"
cp -R "$SRC/LibChemDiagr/src/." "$BUILD/src/"
mkdir -p "$BUILD/src/ec" "$BUILD/src/simpleEquilibriumDiagrams" "$BUILD/src/predominanceAreaDiagrams"
python3 -I "$HERE/patch_ec.py" "$SRC/EC/src/ec/EC.java" "$BUILD/src/ec/EC.java"
# The browser build replaces the AWT message box with src/lib/common/MsgExceptn.java.
rm "$BUILD/src/lib/common/MsgExceptn.java"
# SED and Predom. If eq-diagr has the Swing-free calculation classes (SedCalc,
# PredomCalc), they are compiled as they are, with Plot, Table, Plot_Predom and
# PredomData, behind the small adapters in adapters/. Otherwise SedWeb.java and
# PredomWeb.java are generated from SED.java and Predom.java (their calculation
# methods, copied verbatim, with headless widget stand-ins), and Plot, Table,
# Plot_Predom and PredomData take them where they take the JFrame.
SED_DIR="$SRC/SED/src/simpleEquilibriumDiagrams"
PRED_DIR="$SRC/Predom/src/predominanceAreaDiagrams"
if [ -f "$SED_DIR/SedCalc.java" ] && [ -f "$PRED_DIR/PredomCalc.java" ]; then
  echo "Using SedCalc and PredomCalc from eq-diagr"
  cp "$SED_DIR/SedCalc.java" "$SED_DIR/Plot.java" "$SED_DIR/Table.java" "$BUILD/src/simpleEquilibriumDiagrams/"
  cp "$PRED_DIR/PredomCalc.java" "$PRED_DIR/Plot_Predom.java" "$PRED_DIR/PredomData.java" "$BUILD/src/predominanceAreaDiagrams/"
  cp "$HERE/adapters/SedWeb.java" "$BUILD/src/simpleEquilibriumDiagrams/"
  cp "$HERE/adapters/PredomWeb.java" "$BUILD/src/predominanceAreaDiagrams/"
else
  python3 -I "$HERE/make_webclass.py" SED "$SED_DIR/SED.java" "$BUILD/src/simpleEquilibriumDiagrams/SedWeb.java"
  for f in Plot Table; do
    perl -pe 's/\bSED (sed0?)\b/SedWeb $1/g' "$SED_DIR/$f.java" > "$BUILD/src/simpleEquilibriumDiagrams/$f.java"
  done
  python3 -I "$HERE/make_webclass.py" Predom "$PRED_DIR/Predom.java" "$BUILD/src/predominanceAreaDiagrams/PredomWeb.java"
  for f in Plot_Predom PredomData; do
    perl -pe 's/\bPredom (pred0?)\b/PredomWeb $1/g' "$PRED_DIR/$f.java" > "$BUILD/src/predominanceAreaDiagrams/$f.java"
  done
fi
# The console programs (PlotPDF, PlotPS, ModChemSyst, ModReaction): their AWT
# message box removed, and PlotPS's text-size estimate rounded as in float.
for f in PlotPDF/src/plotPDF/PlotPDF PlotPS/src/plotPS/PlotPS \
         ModChemSyst/src/modifyChemSyst/ModChemSyst ModReaction/src/modifyReaction/ModReaction; do
  pkg_dir="$BUILD/src/$(basename "$(dirname "$f")")"
  mkdir -p "$pkg_dir"
  python3 -I "$HERE/patch_console.py" "$SRC/$f.java" "$pkg_dir/$(basename "$f").java"
done
# Database search: needs the window-free DBSearch (eq-diagr branch calc-split);
# otherwise the engine is built with a stub that reports it as not available.
if grep -q "interface Display" "$SRC/DataBase/src/database/DBSearch.java" 2>/dev/null; then
  echo "Using the window-free DBSearch from eq-diagr"
  cp -R "$SRC/LibDataBase/src/." "$BUILD/src/"   # TeaVM only translates what the engine reaches
  mkdir -p "$BUILD/src/database"
  cp "$SRC/DataBase/src/database/DBSearch.java" "$BUILD/src/database/"
  # the maintenance tools use LibDataBase's own code; its message boxes print instead
  python3 -I "$HERE/patch_dblib.py" "$BUILD/src/lib/database"
  DB_SRC="$HERE/src-db"
  # the small sample database in the eq-diagr source code, offered on database.html
  mkdir -p "$WEB/data/sample"
  cp "$SRC/DataMaintenance/Reactions.db" "$SRC/DataMaintenance/Reactions.elb" "$WEB/data/sample/"
else
  echo "eq-diagr has no window-free DBSearch: the engine is built without the database search"
  DB_SRC="$HERE/src-nodb"
fi
# Plot and Plot_Predom compute the paper scale in float; round it as the JVM does.
python3 -I "$HERE/patch_plot_floats.py" "$BUILD/src/simpleEquilibriumDiagrams/Plot.java" \
        "$BUILD/src/predominanceAreaDiagrams/Plot_Predom.java"
# GraphLib uses java.awt.Point and java.awt.geom.{Line2D,Rectangle2D} as plain
# geometry; TeaVM has no java.awt, so point it at the stand-ins in src/webec/awt.
perl -pi -e 's/\bjava\.awt\.Point\b/webec.awt.Point/g; s/\bjava\.awt\.geom\./webec.awt.geom./g' \
     "$BUILD/src/lib/kemi/graph_lib/GraphLib.java"
# TeaVM drops (float) casts; the .plt coordinates come from Math.round((float)(v*100)).
perl -pi -e 's/\bMath\.round\(\(float\)\(/webec.FloatMath.round((/g' "$BUILD/src/lib/kemi/graph_lib/GraphLib.java"
# TeaVM knows the charset as "UTF-8" only; "UTF8" is a JVM alias for the same charset.
find "$BUILD/src" -name '*.java' -exec sed -i.bak 's/"UTF8"/"UTF-8"/g' {} +
# TeaVM's Formatter has no %e, %g or %n; route String.format and the PrintStream
# printf/format calls (those whose first argument is a Locale or a string
# literal) through webec.Fmt. SimpleDateFormat.format(date) is left alone.
find "$BUILD/src" -name '*.java' -exec perl -pi -e \
     's/\bString\.format\(/webec.Fmt.format(/g; s/\b(?<!\.)([A-Za-z_]\w*)\.(printf|format)\((?=engl\b|"|java\.util\.Locale\.)/webec.Fmt.printf($1,/g' {} +
find "$BUILD/src" -name '*.bak' -delete

echo "Compiling Java (LibChemDiagr, the programs and the browser engine)"
javac -nowarn -encoding UTF-8 --release 8 -proc:none -cp "$JSO_JAR" -d "$BUILD/classes" \
      $(find "$BUILD/src" "$HERE/src" $DB_SRC -name '*.java')

echo "Compiling webec.WebEngine to JavaScript (engine.js) with TeaVM"
java -cp "$TEAVM_CP" org.teavm.cli.TeaVMRunner \
     -t js \
     --targetdir "$WEB" --targetfile engine.js \
     --classpath "$BUILD/classes" $RUNTIME_JARS \
     --js-module-type none \
     webec.WebEngine

echo "Writing test data and examples"
python3 -I "$HERE/make_testdata.py" "$SRC/EC/tests" "$WEB/tests-data.js"
python3 -I "$HERE/make_examples.py" "$HERE/.." "$WEB"
python3 -I "$HERE/make_help.py" "$SRC" "$WEB"

ls -l "$WEB"
