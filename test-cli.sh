#!/bin/bash
# Regression test for jars/EC.jar against the reference outputs in eq-diagr/EC/tests.
#
# The references were produced with the tolerances listed below (read from the
# header of each reference .out file); with the default tolerance (1e-4) the
# results differ in the fourth significant figure.
# CSV values are compared with a relative tolerance of 1e-6 and an absolute
# tolerance of 1e-12, so round-off in charge-balance residuals (~1e-14) passes.
#
# Usage:  ./test-cli.sh [path-to-eq-diagr]     (default: ./eq-diagr)

set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$(cd "${1:-$HERE/eq-diagr}" && pwd)"
JAR="$HERE/jars/EC.jar"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# directory  file  EC options
CASES=(
  "Davies_eqn  Fe           -m=0 -t=25 -i=-1"
  "Davies_eqn  CO3-Ca-NaCl  -m=0 -t=25 -i=-1 -tol=1e-9 -tolA=1e-8"
  "SIT         CaSO4-Na-Cl  -m=1 -t=25 -i=-1 -tol=1e-6"
)

cp -R "$SRC/EC/tests/." "$WORK/"
fail=0
for entry in "${CASES[@]}"; do
  read -r dir name opts <<< "$entry"
  cd "$WORK/$dir"
  cp "$name.csv" "$name.ref.csv"
  # shellcheck disable=SC2086
  if ! java -Djava.awt.headless=true -jar "$JAR" "$name.dat" $opts > "$name.log" 2>&1; then
    echo "FAIL  $dir/$name: EC exited with an error (see log below)"; tail -5 "$name.log"
    fail=1; continue
  fi
  if python3 -I - "$name.ref.csv" "$name.csv" <<'EOF'
import sys
def rows(path):
    out = []
    for line in open(path, encoding="utf-8"):
        out.append([c.strip() for c in line.rstrip("\n").rstrip(",").split(",")])
    return out
ref, new = rows(sys.argv[1]), rows(sys.argv[2])
if len(ref) != len(new):
    print("  row count %d vs %d" % (len(ref), len(new))); sys.exit(1)
bad = 0
for i, (a, b) in enumerate(zip(ref, new)):
    for j, (x, y) in enumerate(zip(a, b)):
        try:
            fx, fy = float(x), float(y)
        except ValueError:
            if x != y:
                print("  row %d col %d: %r vs %r" % (i+1, j+1, x, y)); bad += 1
            continue
        if abs(fx - fy) > max(1e-12, 1e-6 * max(abs(fx), abs(fy))):
            print("  row %d col %d: %s vs %s" % (i+1, j+1, x, y)); bad += 1
sys.exit(1 if bad else 0)
EOF
  then echo "PASS  $dir/$name"
  else echo "FAIL  $dir/$name"; fail=1
  fi
done
exit $fail
