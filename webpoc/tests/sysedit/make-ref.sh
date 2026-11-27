#!/bin/bash
# Makes the reference files in ref/ with Spana's own "Modify chemical system"
# window (RefModify.java drives it). Needs Spana compiled from eq-diagr master:
#   make-ref.sh <Spana classes folder>    (lib jars from /Applications/Eq-Diagr/lib)
cd "$(dirname "$0")"
B=$(mktemp -d)
javac -nowarn -d "$B" -cp "$1:/Applications/Eq-Diagr/lib/*" RefModify.java 2>/dev/null
CP="$B:$1:/Applications/Eq-Diagr/lib/*"
while IFS='|' read -r op a b c; do
  if [ "$op" = move ]; then out="ref/move-$a-$b-$c.dat"; args=(move "in/$a.dat" "$out" "$b" "$c")
  else out="ref/merge-$a-$b.dat"; args=(merge "in/$a.dat" "in/$b.dat" "$out"); fi
  rm -f "$out" "${out%.dat}.msg"
  perl -e 'alarm 60; exec @ARGV' java -cp "$CP" RefModify "${args[@]}" 2>/dev/null | grep -E "^(MESSAGE|NOT MERGED)" > "${out%.dat}.msg"
  [ -s "${out%.dat}.msg" ] || rm -f "${out%.dat}.msg"
  echo "$op $a $b $c: $([ -f "$out" ] && echo written || echo 'not written')"
done < cases.txt
