# Merge de las cinco ramas — 2026-09-12

**Base:** `main` @ `7a0a8ee` → **`92774aa1a532c933654866292a43c18818a7d394`** (pusheado, ver §1)
**Revisión previa:** `docs/diagnosticos/2026-09-11_revision-cinco-ramas-sin-mergear.md`
**Guards:** `pwd` = `/home/clio/dev/SGH` · `spcs` = 203 (los probes de §3 verifican teardown) · ref `unlhcuanfrtpatoipwve`
Todos `--no-ff`, orden de menor a mayor riesgo, sin conflictos (`portal.html` auto-merge limpio en el 5°). Base no tocada.

## 1. SHA

```
79bd6d4b419158a5c7d3a006beaddd862a2e794d  chore/issue-081-pii-residual-vps
f8a7c6a467107e836565fcb06e13df748e5d0acc  fix/condicion-sexo-t8-t10-r9
4d49f638b2c719599c5eb757ae2b9cad58876647  fix/hora-ventanas-r9
19aa6b7163793059941a911e32b1d01306323084  fix/llamado-chips-fede
Auto-merging portal.html
92774aa1a532c933654866292a43c18818a7d394  feat/buscador-spc-autocompletado
$ git push origin main && git ls-remote origin main
92774aa1a532c933654866292a43c18818a7d394	refs/heads/main
```

| # | Merge | Rama | Trae |
|---|---|---|---|
| 1 | `79bd6d4` | `chore/issue-081-pii-residual-vps` | `docs/ISSUES.md` ISSUE-081 |
| 2 | `f8a7c6a` | `fix/condicion-sexo-t8-t10-r9` | `migrations/fix_condicion_sexo_r9_t8_t10.sql` + rollback + `tests/probe_condicion_sexo_r9.mjs` — **cierra drift** (SQL ejecutado 08/09) |
| 3 | `4d49f63` | `fix/hora-ventanas-r9` | `migrations/fix_ventanas_r9_hora_argentina.sql` — **cierra drift** (SQL ejecutado 08/09; el "(NO EJECUTADO)" del commit original es de antes de correrlo, aclarado en el mensaje del merge) |
| 4 | `19aa6b7` | `fix/llamado-chips-fede` | `portal.html` + `inscripciones.html` sin chip de sexo; probe paridad ampliado → **deploy** |
| 5 | `92774aa` | `feat/buscador-spc-autocompletado` | `migrations/rpc_padron_spcs.sql` (**cierra drift**) + `portal.html` buscador en cliente + `tests/probe_buscador_spc.mjs` → **deploy** |

## 2. Prod (`sigh.com.ar`) — md5 contra `92774aa`

```
portal.html MATCH try 3
918d8bf65579e985eb98148dc47bff7f  l_portal.html
918d8bf65579e985eb98148dc47bff7f  p_portal.html
inscripciones.html MATCH try 1
477863122dcffc993734ea4b8981b38f  l_inscripciones.html
477863122dcffc993734ea4b8981b38f  p_inscripciones.html
```

## 3. Probes post-merge (contra prod, ESCRIBEN con teardown verificado)

```
$ node tests/probe_buscador_spc.mjs

── Probe · buscador de SPC del portal ──
   portal=/home/clio/dev/SGH/portal.html
   edad=/home/clio/dev/SGH/edad-spc.js
 ✅ C1) el umbral está en 3 caracteres  → MIN=3
 ✅ C0) un ENTRENADOR trae el padrón COMPLETO — misma cuenta que el oráculo  → buscador=203 · oráculo=203
 ✅ C2) el padrón se cachea: la segunda llamada no lo vuelve a pedir
 ✅ C3) el payload es chico — filtrar en el cliente es viable  → 203 SPC · 51495 bytes
 ✅ C4) sin sesión el RPC rechaza — el padrón no queda público  → No autorizado.
 ✅ U1) con MENOS de 3 caracteres no sugiere nada  → ''=0 'w'=0 'wa'=0
 ✅ U2) con 3 caracteres YA sugiere  → 'wav'=2 · 'rio'=5
 ✅ U3) onBuscarSpc respeta el umbral: abajo de 3 vuelve a la lista propia
 ✅ B1) coincide en el MEDIO: "quita" encuentra "MOSQUITA GARDEN"  → → [MOSQUITA GARDEN]
 ✅ B2) coincide al FINAL: "garden" encuentra "MOSQUITA GARDEN"  → → [MOSQUITA GARDEN]
 ✅ B3) para 11 términos el resultado es EXACTAMENTE el del padrón real filtrado aparte  → quita:1 chinita:1 saltena:1 SALTEÑA:1 wave:2 first:1 foot:2 gauch:4 rio:5 río:5 zzz:0
 ✅ B4) los que EMPIEZAN con el término van primero  → "rio" → [Río Salado,BESO CURIOSO,CURIOSA GO ON,FURIOSO ON,La Criolla]
 ✅ A1) SIN acentos encuentra CON acentos: "saltena" → "CHINITA SALTEÑA"  → → [CHINITA SALTEÑA]
 ✅ A2) insensible a mayúsculas: "CHINITA", "chinita" y "ChInItA" dan lo mismo  → → [CHINITA SALTEÑA]
 ✅ D0) el duplicado real aparece dos veces — el nombre solo NO alcanza  → "wave rimout" → 2: [Wave Rimout/5ebc5e48,Wave Rimout/f277af1c]
 ✅ D1) la sugerencia muestra la EDAD además de la fecha  → ABARAJALA (2020-10-25) → "6 años · 25/10/2020"
 ✅ D2) el render incluye padre × madre y el Stud Book condicional
 ✅ D3) la edad mostrada coincide con fn_edad_reglamentaria de la base  → base=6 · buscador="6 años · 25/10/2020"
 ✅ D4) la regla del 1° de julio coincide con la base a los DOS lados del corte  → 5 pares, incluidos 3 con ref anterior al 1/7
 ✅ E1) un nombre inexistente devuelve lista vacía, sin explotar
 ✅ E2) onBuscarSpc con un nombre inexistente deja resultados vacíos, no null
 ✅ E3) null / undefined / espacios no rompen la normalización
 ✅ S1) elegir una sugerencia carga el SPC correcto (id → misma fila en la base)  → CHINITA SALTEÑA · f3b5ea21-49c9-44ff-a317-3fc5da91bf1c
 ✅ S2) la regla no cambia: se busca sobre TODO el padrón, sin filtro de tenencia  → 203 de 203 visibles para un entrenador cualquiera
 ✅ T1) el teardown deja el namespace del probe vacío  → usuarios=0 · profesionales=0

25/25 OK

$ node tests/probe_paridad_llamado_inscripciones.mjs

── Probe · paridad llamado abierto ↔ encabezado de inscripciones ──
   portal=/home/clio/dev/SGH/portal.html
   insc=/home/clio/dev/SGH/inscripciones.html
   TZ=America/Argentina/Buenos_Aires · condición larga=192 chars
 ✅ H1) el llamado imprime la hora en 24 h, sin duplicar la unidad  → fechaHora → "1/5 09:00 hs"  (esperado "1/5 09:00 hs")
 ✅ H2) sin "a. m." ni "p. m."  → "1/5 09:00 hs"
 ✅ H3) una sola vez "hs"  → "1/5 09:00 hs"
 ✅ H4) inscripciones imprime la MISMA hora que el llamado  → portal="1/5 09:00 hs" · inscripciones="1/5 09:00 hs"
 ✅ H5) el valor guardado sigue siendo 09:00 AR — sólo cambió el formato  → db=2099-05-01T12:00:00+00:00 → "1/5 09:00 hs"
 ✅ H6) medianoche sale 00:00 en las dos pantallas, no 24:00  → portal="2/5 00:00 hs" · inscripciones="2/5 00:00 hs"
 ✅ H7) el helper es idéntico en los dos archivos (ninguno se quedó atrás)
 ✅ P0) el llamado renderizó el bloque de la reunión del fixture  → container=3238 chars
 ✅ P1) el turno de condición larga tiene su fila
 ✅ P2) chip de distancia  → 1100m | tierra | 5 a 10 años | 💰 $1.159.292,00 | Cupo 14 | ⏳ cierra 1/5 09:00 hs
 ✅ P3) el llamado SIGUE mostrando el chip de pista
 ✅ P4) el llamado YA NO muestra el chip de sexo  → 1100m | tierra | 5 a 10 años | 💰 $1.159.292,00 | Cupo 14 | ⏳ cierra 1/5 09:00 hs
 ✅ P5) chip de rango de edad
 ✅ P6) el chip de bolsa del llamado == repartoDisplay, NO el nominal  → chip=1100m | tierra | 5 a 10 años | 💰 $1.159.292,00 | Cupo 14 | ⏳ cierra 1/5 09:00 hs · esperado=$1.159.292,00 · nominal(prohibido)=$1.054.166,67
 ✅ P7) el número de turno está en la fila
 ✅ P8) el texto de la condición está en la fila
 ✅ P9) chip de cierre en 24 h
 ✅ P10) ni un "a. m." en todo el llamado renderizado
 ✅ Q0) onReunionChange trajo los dos turnos del fixture  → carreras=2
 ✅ Q1) el encabezado se muestra
 ✅ Q2) chip de distancia  → 1100m | tierra | 5 a 10 años | Concertada | 💰 $1.159.292,00 | Cupo 14 | ⏳ cierra 1/5 09:00 hs
 ✅ Q3) inscripciones SIGUE mostrando el chip de pista
 ✅ Q4) inscripciones YA NO muestra el chip de sexo  → 1100m | tierra | 5 a 10 años | Concertada | 💰 $1.159.292,00 | Cupo 14 | ⏳ cierra 1/5 09:00 hs
 ✅ Q5) chip de rango de edad
 ✅ Q6) el chip de bolsa de inscripciones == repartoDisplay, NO el nominal  → chip=1100m | tierra | 5 a 10 años | Concertada | 💰 $1.159.292,00 | Cupo 14 | ⏳ cierra 1/5 09:00 hs · esperado=$1.159.292,00
 ✅ Q7) chip de cierre en 24 h
 ✅ Q8) el texto de la condición está en el encabezado
 ✅ Q9) el número de turno está en el encabezado
 ✅ Q10) ni un "a. m." en el encabezado
 ✅ Y1) el chip de categoría que pidió Yesi está en inscripciones  → categoría="Concertada"
 ✅ D1) los 7 campos aparecen en LAS DOS pantallas  → 7/7
 ✅ D2) la condición se arma igual en las dos (mismo separador)
 ✅ D3) el rango de edad se arma igual en las dos
 ✅ D4) la bolsa se formatea igual en las dos  → portal="$1.159.292,00" · inscripciones="$1.159.292,00"
 ✅ D6) NINGUNA de las dos muestra el sexo, y el fixture SÍ lo tiene cargado  → fixture condicion_sexo='ambos' · portal=[1100m | tierra | 5 a 10 años | 💰 $1.159.292,00 | Cupo 14 | ⏳ cierra 1/5 09:00 hs] · insc=[1100m | tierra | 5 a 10 años | Concertada | 💰 $1.159.292,00 | Cupo 14 | ⏳ cierra 1/5 09:00 hs]
 ✅ D7) las dos SIGUEN mostrando los cuatro que Fede quiere: distancia, edad, bolsa y cierre
 ✅ D5) las dos coinciden CON EL ORÁCULO, no sólo entre sí  → oráculo=$1.159.292,00 (nominal $1.054.166,67 no debe aparecer)
 ✅ L1) el llamado muestra la condición larga COMPLETA, sin truncar  → render=192 chars · esperado=192
 ✅ L2) inscripciones muestra la condición larga COMPLETA, sin truncar  → render=192 chars · esperado=192
 ✅ L3) en el llamado la condición va en su propio bloque, no en la fila de chips
 ✅ L4) en inscripciones la condición va en su propio bloque, no en la fila de chips
 ✅ L5) el llamado: mismo número de chips con condición corta y con larga  → larga=6 · corta=6
 ✅ L6) inscripciones: mismo número de chips con condición corta y con larga  → larga=7 · corta=7
 ✅ L7) .carrera-cond declara overflow-wrap: anywhere en las dos hojas  → portal=".carrera-cond { font-size: 12px; line-height: 1.45; color: var(--muted); margin-top: 6px; overflow-wrap: anywhere; }" · inscripciones=".carrera-cond { font-size: 12px; line-height: 1.45; color: var(--muted); margin-top: 6px; overflow-wrap: anywhere; }"
 ✅ L8) el contenedor de texto puede encogerse (min-width), así el bloque crece hacia abajo
 ✅ F1) mirar el encabezado no cambia la reunión activa por otra cosa que el select  → ids=["0cbdf3c8-0a52-4929-944f-b8a70bafc77c"]
 ✅ F2) ningún toast de error durante el render  → []
 ✅ F3) el gate de edad de la inscripción quedó intacto
 ✅ F4) al deseleccionar el turno el encabezado se limpia
 ✅ T1) teardown: no quedó ninguna reunión 9992 en la base  → quedan=0

50/50 OK
```

(`tests/probe_condicion_sexo_r9.mjs` corrió ayer READ-ONLY, 26/26 — informe de la revisión §3.)

## 4. Ramas

Las cinco siguen existiendo (local y `origin`). No se borran sin pedido. Ramas de trabajo sin mergear que quedan: **ninguna** (`feat/studbook-buscar` mergeada ayer).
