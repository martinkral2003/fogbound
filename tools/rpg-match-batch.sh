#!/bin/sh
# usage: tools/rpg-match-batch.sh "seeds" "difficulties"  -> one SUMMARY line per run (3 in parallel)
cd "$(dirname "$0")/.."
for d in ${2:-normal}; do for s in ${1:-1337 7 21}; do QUIET=1 node tools/rpg-match-test.js $s 30 $d 2>&1 | grep -E "SUMMARY|Error" & done; wait; done
