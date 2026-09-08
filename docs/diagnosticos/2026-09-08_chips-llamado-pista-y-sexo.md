# Los chips del llamado — el sexo sale, la pista no puede salir

**Fecha:** 2026-09-08
**Pedido de Fede:** *"yo pondría turno 2, 800 metros, sacaría tierra ambos, cuatro años dejaría,
800 metros la bolsa y a qué hora cierra, y después la condición abajo"*.
**Rama:** `fix/llamado-chips-fede` — **pusheada, SIN mergear.**
**SHA de la rama:** `966b6c823a48427020f1b7b3ecbfc52d302a12d4`
**SHA de `main` (intacto):** `eface80078b99a56c9ae3160053cd8fd0c425d31`
**SHA de este informe:** ver §7.

## Guards verificados

```
$ pwd
/home/clio/dev/SGH

$ SELECT count(*) FROM spcs;      -- por MCP, proyecto unlhcuanfrtpatoipwve
[{"spcs":181}]

ref del proyecto: unlhcuanfrtpatoipwve
```

---

## 0. 🛑 La pista no se puede sacar — el número

Pediste que avisara si sacar un chip perdía el dato, **antes de tocarlo**.

**Sacar la pista lo pierde en 49 de 49 carreras.**

| | |
|---|---|
| Carreras del club (todas las reuniones) | **49** |
| Con `tipo_pista` cargada | **49** |
| Cuyo texto de condición **menciona** la pista | **0** |
| **→ carreras donde el chip es el único lugar donde aparece** | **49** |

**El sexo, en cambio, es seguro:** las 4 carreras que restringen el sexo lo declaran en el texto,
y en las otras 45 el chip decía `ambos`, que no informa nada.

**Hice sólo el sexo. La pista quedó sin tocar, esperando tu decisión.**

---

## 1. Verificación previa — los once turnos de R9

```sql
SELECT c.numero_turno, c.tipo_pista, c.condicion_sexo,
       ((coalesce(c.condicion_handicap,'')||' '||coalesce(c.condicion_adicional,'')) ~* '(c[eé]sped|tierra|arena|sint[eé]tica)') AS texto_dice_pista,
       c.condicion_handicap, c.condicion_adicional
FROM reuniones r JOIN carreras c ON c.reunion_id=r.id
WHERE r.club_id='0649e9c5-9e87-4aad-842f-101458e6b33c' AND r.numero=9
ORDER BY c.numero_turno;
```

| T | `tipo_pista` | `condicion_sexo` | ¿el texto dice la pista? | `condicion_handicap` |
|---|---|---|---|---|
| 1 | tierra | ambos | **no** | Todo caballo 3 años perdedor. |
| 2 | tierra | ambos | **no** | Todo caballo 4 años perdedor. |
| 3 | **cesped** | ambos | **no** | Todo caballo 4 años perdedor. |
| 4 | **cesped** | ambos | **no** | Todo caballo 5 años y + edad perdedor. |
| 5 | tierra | ambos | **no** | Todo caballo 3 y 4 años ganador de 1 o 2 carreras. |
| 6 | tierra | ambos | **no** | Todo caballo de 5 años ganador de 1 o 2 carreras. |
| 7 | **cesped** | ambos | **no** | Todo caballo 6 años y + edad ganadores de 1 o 2 carreras. |
| 8 | tierra | **ambos** | **no** | **Yeguas** de 5 años y + edad ganadoras de 1 o 2 carreras. |
| 9 | tierra | ambos | **no** | Especial Todo caballo 4 años y + edad ganador de 3 o mas carreras. |
| 10 | **cesped** | **ambos** | **no** | **Yeguas** 5 años y + edad perdedoras. |
| 11 | tierra | ambos | **no** | Todo caballo 5 años y + edad perdedor. |

**0 de 11.** Y los once tienen pista cargada, con **cuatro en césped** (T3, T4, T7, T10) — que no
es un detalle: un caballo de arena no corre igual en césped, y es de las primeras cosas que mira un
entrenador para decidir si anota.

### 1.1 El chequeo va más allá de R9 — el cambio es permanente

R9 es una reunión; el chip se saca para siempre. Sobre **las 49 carreras del club**:

```sql
SELECT count(*) AS carreras_total,
       count(*) FILTER (WHERE c.condicion_sexo <> 'ambos') AS sexo_restrictivo,
       count(*) FILTER (WHERE c.tipo_pista IS NOT NULL) AS con_pista_cargada,
       count(*) FILTER (WHERE c.tipo_pista IS NOT NULL
         AND (coalesce(c.condicion_handicap,'')||' '||coalesce(c.condicion_adicional,'')) !~* '(c[eé]sped|tierra|arena|sint[eé]tica)') AS pista_y_texto_NO_la_dice
FROM reuniones r JOIN carreras c ON c.reunion_id=r.id
WHERE r.club_id='0649e9c5-9e87-4aad-842f-101458e6b33c';
-- [{"carreras_total":49,"sexo_restrictivo":4,"con_pista_cargada":49,"pista_y_texto_no_la_dice":49}]
```

Distribución:

| `condicion_sexo` | `tipo_pista` | carreras | reuniones |
|---|---|---|---|
| ambos | cesped | 9 | 3 |
| ambos | tierra | 36 | 4 |
| **machos** | tierra | 1 | 1 |
| **hembras** | tierra | 3 | 2 |

---

## 2. El sexo sí es seguro — y por qué el primer chequeo se equivocó

Las **4** carreras con restricción de sexo, con su texto textual:

```sql
SELECT r.numero, c.numero_turno, c.condicion_sexo, c.condicion_handicap,
       (lower(c.condicion_handicap) LIKE 'yeguas%' OR lower(c.condicion_handicap) LIKE 'caballos%') AS el_texto_declara_el_sexo
FROM reuniones r JOIN carreras c ON c.reunion_id=r.id
WHERE r.club_id='0649e9c5-9e87-4aad-842f-101458e6b33c' AND c.condicion_sexo <> 'ambos'
ORDER BY r.numero, c.numero_turno;
```

| Reunión | T | `condicion_sexo` | `condicion_handicap` | ¿lo declara? |
|---|---|---|---|---|
| R6 | 3 | hembras | **Yeguas** de 3 y 4 años perdedoras. | ✅ |
| R7 | 2 | hembras | **Yeguas** 3 años perdedoras. | ✅ |
| R7 | 3 | **machos** | **Caballos** 4 años perdedores. | ✅ |
| R7 | 4 | hembras | **Yeguas** 4 años perdedoras. | ✅ |

**4 de 4.** Sacar el chip no pierde el dato en ninguna.

**La corrección que me hice a mí mismo:** el primer barrido dio *"1 de 4 casos donde el texto NO lo
dice"*, y era **un artefacto del regex**. Buscaba `macho|castrado` y el texto dice **"Caballos"**.
En el ambiente, **"Caballos 4 años perdedores"** (sin "Todo") significa machos, mientras que
**"Todo caballo…"** es el genérico que incluye a todos. La convención se sostiene en los datos: de
las 45 carreras `ambos`, **33 empiezan con "Todo caballo" y ninguna con "Caballos"**; de las 4
restrictivas, **ninguna empieza con "Todo caballo"**.

Si me hubiera quedado con el primer número habría reportado un falso bloqueo. Lo dejo escrito
porque el regex ingenuo sobre texto de dominio es una trampa que se va a repetir.

---

## 3. El cambio aplicado

**Sólo el sexo.** `portal.html` y `inscripciones.html`, con el comentario que explica por qué la
pista se queda.

Chips del llamado, antes y después:

| | Antes | Ahora |
|---|---|---|
| Portal | `1100m · tierra · ambos · 5 a 10 años · 💰 $1.159.292 · Cupo 14 · ⏳ cierra 1/5 09:00 hs` | `1100m · **tierra** · 5 a 10 años · 💰 $1.159.292 · Cupo 14 · ⏳ cierra 1/5 09:00 hs` |
| Inscripciones | idem + `Concertada` | idem + `Concertada` |

Y la condición sigue abajo, en su bloque `.carrera-cond`, sin tocar.

### Diff

```diff
diff --git a/inscripciones.html b/inscripciones.html
index 36fe8a6..2f20aee 100644
--- a/inscripciones.html
+++ b/inscripciones.html
@@ -554,8 +554,13 @@ function renderCarreraChips() {
   const cat = c.categorias_carrera?.nombre || '';
   const chips = [
     c.distancia_metros ? `${c.distancia_metros}m` : '',
+    // La pista se queda: en las 49 carreras del club el texto de la condición
+    // NO la menciona nunca, así que el chip es el único lugar donde aparece.
     c.tipo_pista || '',
-    c.condicion_sexo || '',
+    // El chip de SEXO se sacó el 08/09/2026 (Fede). No pierde el dato: donde
+    // hay restricción el texto la declara ("Yeguas…" / "Caballos…"), y donde no
+    // la hay el chip decía "ambos". Ver el informe del 08/09.
+
     textoEdad(c),
     cat,
     // Bolsa EFECTIVA, con el piso `ganancia_minima` aplicado — GOTCHA #63.
diff --git a/portal.html b/portal.html
index acecc4a..be12a91 100644
--- a/portal.html
+++ b/portal.html
@@ -619,10 +619,18 @@ async function loadLlamado() {
         <div class="carrera-num">${esc(c.numero_turno)}</div>
         <div class="carrera-info">
           <div class="carrera-name">${esc(c.nombre || 'Turno ' + c.numero_turno)}</div>
+          <!-- Chips: distancia, pista, edad, bolsa, cupo, cierre. El de SEXO se
+               sacó el 08/09/2026 a pedido de Fede ("sacaría tierra ambos"): en
+               las 49 carreras del club el texto de la condición ya declara el
+               sexo cuando hay restricción —"Yeguas…" o "Caballos…"— y cuando no
+               la hay el chip decía "ambos", que no informa nada. Sacarlo no
+               pierde el dato.
+               La PISTA se queda: en 49 de 49 el texto NO la menciona, así que
+               el chip es el único lugar donde aparece. Ver
+               docs/diagnosticos/2026-09-08_chips-llamado-pista-y-sexo.md -->
           <div class="carrera-chips">
             <span class="chip">${esc(c.distancia_metros)}m</span>
             ${c.tipo_pista ? `<span class="chip">${esc(c.tipo_pista)}</span>` : ''}
-            ${c.condicion_sexo ? `<span class="chip">${esc(c.condicion_sexo)}</span>` : ''}
             ${textoEdad(c) ? `<span class="chip">${esc(textoEdad(c))}</span>` : ''}
             ${bolsaChip(c)}
             ${c.cupo_maximo ? `<span class="chip">Cupo ${esc(c.cupo_maximo)}</span>` : ''}
```

---

## 4. El probe

`tests/probe_paridad_llamado_inscripciones.mjs`, ahora **50 asserts** y **17 mutantes**.

Los asserts de sexo **se invirtieron** —de "está" a "no está"— y, siguiendo el GOTCHA #93, **se
comparan contra el valor del fixture, no entre pantallas**:

```javascript
// P4 / Q4 — el assert se invierte, y contra el VALOR esperado
ok('P4) el llamado YA NO muestra el chip de sexo',
   !chipsL.includes('>ambos<') && !/>(?:ambos|machos|hembras|machos_castrados)</.test(chipsL), …);

// D6 — la paridad de lo AUSENTE. D1 sólo mira lo que TIENE que estar: si las dos
// volvieran a mostrar el sexo, D1 no se entera.
ok('D6) NINGUNA de las dos muestra el sexo, y el fixture SÍ lo tiene cargado', …);

// D7 — los cuatro que Fede quiere conservar
ok('D7) las dos SIGUEN mostrando los cuatro que Fede quiere: distancia, edad, bolsa y cierre', …);
```

**`D6` es el que evita el modo de falla del GOTCHA #93.** El fixture tiene `condicion_sexo='ambos'`
cargado, así que el dato existe y la pantalla elige no mostrarlo — no es que falte.

Los cuatro mutantes nuevos:

| Mutante | Qué hace | Mata |
|---|---|---|
| **M14** | devuelve el chip de sexo al llamado | P4, D6 |
| **M15** | devuelve el chip de sexo a inscripciones | Q4, D6 |
| **M16** | **saca también la pista del llamado** — el cambio que NO hay que hacer | P3, D1 |
| **M17** | saca la pista de inscripciones | Q3, D1 |

M16 y M17 fijan la decisión de §0: si alguien saca la pista, el probe se pone rojo.

### Salida cruda

```

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
 ✅ P0) el llamado renderizó el bloque de la reunión del fixture  → container=20042 chars
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
 ✅ F1) mirar el encabezado no cambia la reunión activa por otra cosa que el select  → ids=["20f3d0e0-8fe3-48e7-a8ce-de1650a1cbc0"]
 ✅ F2) ningún toast de error durante el render  → []
 ✅ F3) el gate de edad de la inscripción quedó intacto
 ✅ F4) al deseleccionar el turno el encabezado se limpia
 ✅ T1) teardown: no quedó ninguna reunión 9992 en la base  → quedan=0

50/50 OK
```

```

═══ MUTATION TESTING · 17/17 mutantes ═══
(copias en /tmp/mut-paridad-llamado-upnQ1e — el repo no se toca)

✅ M1 muere — vuelve el bug: fechaHora usa toLocaleTimeString y le pega " hs"  [esperaba matar H1,H2,H5,H7; murieron H1,H2,H5,H7]
✅ M2 muere — la unidad queda duplicada ("09:00 hs hs")  [esperaba matar H1,H3; murieron H1,H3]
✅ M3 muere — inscripciones se desincroniza: fechaHora vuelve a 12 h  [esperaba matar H4,H6,H7; murieron H4,H6,H7]
✅ M4 muere — el llamado vuelve a no mostrar el texto de la condición  [esperaba matar P8,L1,L3,D1; murieron P8,L1,L3,D1]
✅ M5 muere — inscripciones vuelve a no mostrar el texto de la condición  [esperaba matar Q8,L2,L4,D1; murieron Q8,L2,L4,D1]
✅ M6 muere — el select de carreras vuelve a las cinco columnas viejas  [esperaba matar Q3,Q4,Q5,Q6,Q7,D1,D5; murieron Q3,Q5,Q6,Q7,D1,D5]
✅ M7 muere — la condición se mete adentro de la fila de chips y la estira  [esperaba matar L4; murieron L4]
✅ M8 muere — el llamado trunca la condición larga a 70 caracteres  [esperaba matar L1; murieron L1]
✅ M9 muere — inscripciones pierde el chip de cierre  [esperaba matar Q7,D1; murieron Q7,D1]
✅ M10 muere — la condición pierde overflow-wrap: una palabra larga desborda la tarjeta  [esperaba matar L7; murieron L7]
✅ M11 muere — inscripciones pierde el chip de categoría que pidió Yesi  [esperaba matar Y1; murieron Y1]
✅ M12 muere — vuelve el bug: el chip del portal muestra bolsa_total crudo  [esperaba matar P6,D1,D5; murieron P6,D1,D5]
✅ M14 muere — vuelve el chip de sexo al llamado  [esperaba matar P4,D6; murieron P4,D6]
✅ M15 muere — vuelve el chip de sexo a inscripciones  [esperaba matar Q4,D6; murieron Q4,D6]
✅ M16 muere — se va también la PISTA — perdería el dato en 49 de 49 carreras  [esperaba matar P3,D1; murieron P3,D1]
✅ M17 muere — se va también la PISTA en inscripciones  [esperaba matar Q3,D1; murieron Q3,D1]
✅ M13 muere — vuelve el bug: el chip de inscripciones muestra bolsa_total crudo  [esperaba matar Q6,D1,D5; murieron Q6,D1,D5]

✅ TANDA LIMPIA — 17 probados · 17 muertos

```

---

## 5. T8 y T10 — la contradicción, y que sacar el chip la esconde

Como marcaste, **no la resuelvo acá**. Pero conviene dejar dicho el efecto del cambio:

| T | `condicion_sexo` (el chip) | El texto | Antes | Ahora |
|---|---|---|---|---|
| 8 | `ambos` | **"Yeguas** de 5 años y + edad ganadoras…" | chip decía `ambos`, texto decía Yeguas → **contradicción visible** | sólo se ve "Yeguas" |
| 10 | `ambos` | **"Yeguas** 5 años y + edad perdedoras." | ídem | sólo se ve "Yeguas" |

**Sacar el chip mejora lo que ve el entrenador** —ya no lee dos cosas que se contradicen— **pero
esconde el problema de datos**: `condicion_sexo` sigue en `ambos`, y **el gate de inscripción
valida contra la columna, no contra el texto**. O sea que un macho todavía puede anotarse en T8 y
T10, y ahora nada en la pantalla lo delata.

Es un argumento **a favor** de resolver la consulta con Fede antes del cierre del viernes, no en
contra del cambio. Está en el informe del 08/09 sobre las preguntas de Fede, §2.4.

---

## 6. Lo que NO se tocó

| | |
|---|---|
| El chip de **pista** | **intacto**, en las dos pantallas. Esperando tu decisión (§0) |
| `condicion_sexo` en la base | intacta. El cambio es de display |
| La contradicción de T8/T10 | sin tocar, como pediste |
| El bloque de condición | sin tocar: sigue abajo |
| Distancia, edad, bolsa, cierre, cupo, categoría | sin tocar. Assert D7 |
| `main` | intacto en `eface80` |

---

## 7. Verificación en `origin`

```
$ git ls-remote origin fix/llamado-chips-fede
966b6c823a48427020f1b7b3ecbfc52d302a12d4	refs/heads/fix/llamado-chips-fede

$ git ls-remote origin main            # intacto, sin mergear
eface80078b99a56c9ae3160053cd8fd0c425d31	refs/heads/main

$ git diff --stat origin/main..origin/fix/llamado-chips-fede
 inscripciones.html                            |  7 ++-
 portal.html                                   | 10 ++++-
 tests/probe_paridad_llamado_inscripciones.mjs | 62 ++++++++++++++++++++++++---
 3 files changed, 70 insertions(+), 9 deletions(-)
```

**`main` sigue en `eface80`. La rama espera tu OK.**

```bash
git fetch origin
git diff origin/main..origin/fix/llamado-chips-fede
git switch fix/llamado-chips-fede

set -a; . ./.env; set +a
node tests/probe_paridad_llamado_inscripciones.mjs
node tests/probe_paridad_llamado_inscripciones.mjs --mutantes
```

## 8. Preguntas abiertas

1. **La pista: ¿qué hacemos?** (§0). Sacarla pierde el dato en 49 de 49. Tres salidas:
   **(a)** dejarla como está —es lo que hice—; **(b)** sacarla igual y que la secretaría empiece a
   escribir la pista en el texto de la condición, que es trabajo de ella todas las semanas;
   **(c)** sacarla del llamado y ponerla en otro lado de la tarjeta. **Recomiendo (a)** hasta
   escuchar a Fede con el número: es probable que al decir "sacaría tierra" no supiera que es el
   único lugar donde aparece.
2. **¿Fede vio que hay cuatro turnos en césped en R9?** T3, T4, T7 y T10. Si el llamado no lo
   muestra, un entrenador con un caballo de césped no tiene cómo saber a cuáles anotarlo.
3. **T8/T10 (§5).** Sacar el chip esconde la contradicción y el gate sigue validando contra la
   columna. Cierra el viernes.

### 8.1 SHA final

```
$ git ls-remote origin reports
cf116f00574e62cc838a8ad4eadcd289fc04c92d	refs/heads/reports
$ git rev-parse HEAD
cf116f00574e62cc838a8ad4eadcd289fc04c92d
$ git ls-remote origin fix/llamado-chips-fede
966b6c823a48427020f1b7b3ecbfc52d302a12d4	refs/heads/fix/llamado-chips-fede
$ git ls-remote origin main
eface80078b99a56c9ae3160053cd8fd0c425d31	refs/heads/main
```

Los tres refs verificados en `origin`.
