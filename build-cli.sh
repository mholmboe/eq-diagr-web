#!/bin/bash
# Build self-contained jars for the eq-diagr command-line programs.
#
# Each jar bundles the LibChemDiagr classes, so it runs with "java -jar X.jar"
# without a lib/ folder next to it. Spana, Database and the help system are
# GUI programs and are not built here.
#
# Usage:  ./build-cli.sh [path-to-eq-diagr]     (default: ./eq-diagr)
# Output: jars/EC.jar, jars/SED.jar, ... (class files in build/, which can be deleted)

set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$(cd "${1:-$HERE/eq-diagr}" && pwd)"
BUILD="$HERE/build"
JARS="$HERE/jars"
JAVAC_OPTS=(-nowarn -encoding UTF-8 --release 8)

# module  main-class
MODULES=(
  "EC           ec.EC"
  "SED          simpleEquilibriumDiagrams.Main"
  "Predom       predominanceAreaDiagrams.Main"
  "PlotPDF      plotPDF.PlotPDF"
  "PlotPS       plotPS.PlotPS"
  "ModChemSyst  modifyChemSyst.ModChemSyst"
  "ModReaction  modifyReaction.ModReaction"
)

# copy non-source files (images, properties, html) from a src tree into a class dir
copy_resources() {
  (cd "$1" && find . -type f ! -name '*.java' ! -name '*.form' -print0 \
     | while IFS= read -r -d '' f; do
         mkdir -p "$2/$(dirname "$f")"; cp "$f" "$2/$f"
       done)
}

rm -rf "$BUILD"
mkdir -p "$BUILD/LibChemDiagr" "$JARS"

echo "Compiling LibChemDiagr"
javac "${JAVAC_OPTS[@]}" -d "$BUILD/LibChemDiagr" \
      $(find "$SRC/LibChemDiagr/src" -name '*.java')
copy_resources "$SRC/LibChemDiagr/src" "$BUILD/LibChemDiagr"

for entry in "${MODULES[@]}"; do
  read -r mod main <<< "$entry"
  out="$BUILD/$mod"
  mkdir -p "$out"
  echo "Compiling $mod"
  javac "${JAVAC_OPTS[@]}" -cp "$BUILD/LibChemDiagr" -d "$out" \
        $(find "$SRC/$mod/src" -name '*.java')
  copy_resources "$SRC/$mod/src" "$out"
  # merge the library classes into the module so the jar is self-contained
  cp -R "$BUILD/LibChemDiagr/." "$out/"
  jar --create --file "$JARS/$mod.jar" --main-class "$main" -C "$out" .
done

echo "Done. Jars in $JARS:"
ls -l "$JARS"
