#!/usr/bin/env bash
# Control de "pendientes" sin cerrar en los docs de estado (GOTCHA #98, extensión del 27/09).
#
#   tests/control_pendientes_docs.sh [ref]      # default: origin/main
#
# Lista SÓLO las menciones de "sin merge", "sin mergear", "no corrido", "pendiente de merge",
# "PR #NN abierto" y "sin aplicar" en CHANGELOG.md, docs/ISSUES.md y CLAUDE.md que NO tienen una línea
# "Cierre (" en las 6 líneas siguientes. Salida vacía (exit 0) = todo al día. Si devuelve algo
# (exit 1), cada línea es un pendiente que hay que cerrar donde se escribió o corregir si ya no es cierto.
# Lee los archivos de la ref indicada con `git show`, no del working tree.
set -euo pipefail
REF="${1:-origin/main}"
PATRON='sin merge|sin mergear|no corrido|pendiente de merge|PR #[0-9]+ abierto|sin aplicar'
encontrado=0
for f in CHANGELOG.md docs/ISSUES.md CLAUDE.md; do
  out=$(git show "$REF:$f" | awk -v f="$f" -v pat="$PATRON" '
    { linea[NR] = $0 }
    END {
      for (i = 1; i <= NR; i++) {
        if (tolower(linea[i]) ~ pat) {
          cerrado = 0
          for (j = i; j <= i + 6 && j <= NR; j++) if (linea[j] ~ /Cierre \(/) cerrado = 1
          if (!cerrado) printf "%s:%d: %s\n", f, i, substr(linea[i], 1, 200)
        }
      }
    }')
  if [ -n "$out" ]; then echo "$out"; encontrado=1; fi
done
exit $encontrado
