# DEPLOY — Carta de llamado: `TURNO N —` en el PDF

- **Fecha:** 2026-09-17
- **Merge a `main`:** `4876106bca5b8ee58610b33b5aa6078d028d6a0f` (`--no-ff` de `fix/carta-llamados-pdf-numero-turno` @ `261b3c7`)
- **Guards:** `pwd` = `/home/clio/dev/SGH` · `spcs` = **210** · proyecto `unlhcuanfrtpatoipwve`
- **GATE:** `docs/diagnosticos/2026-09-17_carta-llamados-pdf-numero-turno_GATE.md`

## 1. Merge + push

```
$ git pull --ff-only origin main
$ git merge --no-ff fix/carta-llamados-pdf-numero-turno -m "merge: carta de llamado — TURNO N delante de la condición en el PDF (numero_turno a secas); probe 16/16 con geometría del chip en Chromium, mutantes 2/2; pedido de Fede 17/09"
$ git push origin main
$ git log --oneline -3
4876106 merge: carta de llamado — TURNO N delante de la condición en el PDF (numero_turno a secas); probe 16/16 con geometría del chip en Chromium, mutantes 2/2; pedido de Fede 17/09
261b3c7 fix(carta-llamados): TURNO N delante de la condición en el PDF (numero_turno a secas) + probe de ancho con Chromium
030089a docs(CLAUDE.md): render_programa_pdf.mjs en la lista de probes; SERVER.md ya no es 'sin chromium'
$ git ls-remote origin main
4876106bca5b8ee58610b33b5aa6078d028d6a0f	refs/heads/main
$ git rev-parse HEAD
4876106bca5b8ee58610b33b5aa6078d028d6a0f
```

## 2. md5 contra `sigh.com.ar` (con `-L`, cache-bust, polling cada 20 s)

```
$ git show 4876106:carta-llamados.html > local.html
$ for i in $(seq 1 20); do curl -sL "https://sigh.com.ar/carta-llamados.html?v=$RANDOM" -o prod.html; [ "$(md5sum < local.html)" = "$(md5sum < prod.html)" ] && { echo "match en intento $i"; break; }; sleep 20; done
match en intento 4
$ md5sum local.html prod.html
39816f417092f6b872ab76b482a4ada0  local.html
39816f417092f6b872ab76b482a4ada0  prod.html
```

## 3. Probe contra el HTML servido

```
$ set -a; . ./.env; set +a
$ CARTA_HTML=https://sigh.com.ar/carta-llamados.html node tests/probe_carta_numero_turno.mjs <out_dir>

PNG del bloque impreso: /tmp/claude-1000/-home-clio-dev-SGH/9be9e852-7aae-40af-92ba-45234dfdbacc/scratchpad/probe_out_prod/carta_r9_print.png

✅ A1) tituloHtml lleva `TURNO ${c.numero_turno} &mdash;` adelante
✅ A2) renderPrint no usa numero_carrera_programa (código, no comentarios)
✅ A3) sin código muerto (turnoLabel / headText / headParts / catLabel)
✅ B0) R9 tiene 11 turnos en la DB  (11)
✅ B1) hay turnos con numero_carrera_programa ≠ numero_turno (caso discriminante)  (T3→C7 T4→C2 T5→C4 T6→C3 T7→C5 T9→C6 T11→C8)
✅ B2) un título por carrera  (11 títulos / 11 carreras)
✅ B3) cada título empieza con "TURNO <numero_turno> — " en orden de DB
✅ B4) R9 T3 (numero_carrera_programa=7) dice TURNO 3, no 7  ("TURNO 3 — Todo caballo 4 años perdedor. | BONO de $250.000,00 al ganador")
✅ B5) después del número viene la condición tal cual  ("Todo caballo 4 años perdedor.")
✅ B6) el caption sigue siendo la categoría, no el número
✅ C0) Chromium headless corrió (libs en CHROMIUM_LIBS / ~/chromium-libs)
✅ C1) métricas de Arial (Liberation Sans instalada): canario 470±8px  (475.3px)
✅ C2) ninguna caja desborda
✅ C3) exactamente 4 títulos de R9 pasan a 2 líneas: T5, T6, T7 y T8; ninguno a 3  (T1:1 T2:1 T3:1 T4:1 T5:2 T6:2 T7:2 T8:2 T9:1 T10:1 T11:1)
✅ C4) el chip de distancia no se empuja en ninguna carrera (ancho natural, 1 línea, dentro de la caja, título termina antes del gap)
✅ C5) en los títulos a 2 líneas el chip conserva el ancho natural  (T5: chip 76.4px | T6: chip 76.4px | T7: chip 75.6px | T8: chip 76.4px)

16/16 OK
exit=0
```

## 4. Verificación de publicación de este informe

(abajo)
