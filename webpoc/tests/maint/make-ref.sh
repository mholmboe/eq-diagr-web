#!/bin/bash
# Makes the reference files in ref/ with DataMaintenance's own windows
# (RefMaint.java drives them). Needs LibChemDiagr, LibDataBase and
# DataMaintenance compiled from eq-diagr:
#   make-ref.sh <classes folder>     (AbsoluteLayout.jar from /Applications/Eq-Diagr/lib)
cd "$(dirname "$0")"
B=$(mktemp -d)
javac -nowarn -d "$B" -cp "$1" RefMaint.java 2>/dev/null
CP="$B:$1:/Applications/Eq-Diagr/lib/AbsoluteLayout.jar"
HERE=$(pwd)
while IFS='|' read -r op out a b; do
  case "$op" in ''|\#*) continue;; esac
  W=$(mktemp -d); cp in/* "$W/"; cp add*.txt "$W/" 2>/dev/null
  if [ "$op" = merge ]; then dbs=(${a//,/ }); args=(merge "$out" "${dbs[@]}")
  elif [ "$op" = stats ]; then IFS=',' read -ra dbs <<< "$b"; args=(stats "$out" "$a" "${dbs[@]}")
  elif [ "$op" = single ]; then IFS=',' read -ra dbs <<< "$b"; args=(single "$a" "$out" "${dbs[@]}")
  else rm -rf "ref/$out"; mkdir -p "ref/$out"; IFS=',' read -ra dbs <<< "$b"; args=(add "$a" "$HERE/ref/$out" "${dbs[@]}"); fi
  (cd "$W" && perl -e 'alarm 240; exec @ARGV' java -cp "$CP" RefMaint "${args[@]}" > out.log 2>&1)
  grep -E "^(ANSWER|MESSAGE)" "$W/out.log" > "ref/$out.msg"; [ -s "ref/$out.msg" ] || rm -f "ref/$out.msg"
  if [ "$op" = merge ]; then cp "$W/$out" "$W/${out%.db}.elb" ref/ 2>/dev/null; fi
  if [ "$op" = stats ] || [ "$op" = single ]; then cp "$W/$out" ref/ 2>/dev/null; fi
  echo "$op $out: $(ls ref/$out* 2>/dev/null | wc -l | tr -d ' ') file(s)"
  rm -rf "$W"
done < cases.txt
