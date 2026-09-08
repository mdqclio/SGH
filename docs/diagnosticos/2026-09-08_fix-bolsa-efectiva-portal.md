# Fix — la bolsa del llamado es la EFECTIVA, y el probe que dejó pasar el bug

**Fecha:** 2026-09-08
**Rama:** `fix/bolsa-efectiva-portal` — **pusheada, SIN mergear.**
**SHA de la rama:** `72f3b509c5cc4016952b99b6cf4ac6fb75c078c6`
**SHA de `main` (intacto):** `2bb5d0c9ef3e7738df66cf19c649a93d6aba3f5d`
**SHA de este informe:** ver §7.
**Diagnóstico que lo motiva:** `docs/diagnosticos/2026-09-08_bolsas-portal-vs-detalle-r9.md`

## Guards verificados

```
$ pwd
/home/clio/dev/SGH

$ SELECT count(*) FROM spcs;      -- por MCP, proyecto unlhcuanfrtpatoipwve
[{"spcs":181}]

ref del proyecto: unlhcuanfrtpatoipwve
```

## Resumen

| | |
|---|---|
| Pantallas corregidas | 2 — `portal.html` y `inscripciones.html` |
| Docs corregidos | 2 — `ESTADO.md` y `LIQUIDACIONES_MODELO.md` |
| Probe nuevo | `tests/probe_bolsa_efectiva.mjs` — **19/19**, 8 mutantes, 8 muertos |
| Probe arreglado | `probe_paridad_llamado_inscripciones.mjs` — **48/48**, 13 mutantes, 13 muertos |
| Barrido | los dos sitios corregidos eran **los únicos** que mostraban el crudo |
| `main` | intacto |

---

## 1. El fix — `portal.html`

Tres cambios, todos en el camino del chip:

**(a) Carga el helper.** El portal era la **única** pantalla de display que no
incluía `premios-utils.js` — no es que hubiera elegido no usarlo, no lo tenía:

```html
<!-- repartoDisplay(): la bolsa que se muestra es la EFECTIVA, con el piso
     ganancia_minima aplicado (GOTCHA #63, regla de Yesica). El portal era la
     única pantalla que no cargaba este helper y por eso mostraba el nominal. -->
<script src="premios-utils.js"></script>
```

**(b) El select pide `distribucion_premios`**, que antes no traía. Sin ese dato el
helper no puede aplicar el piso.

**(c) `bolsaChip()` nuevo**, y el chip pasa a llamarlo:

```javascript
function bolsaChip(c) {
  if (!c.bolsa_total) return '';
  const { total } = repartoDisplay(c.bolsa_total, c.distribucion_premios);
  return `<span class="chip">💰 ${esc(formatARS(total))}</span>`;
}
```

## 2. El fix — `inscripciones.html` (mi regresión del 08/09)

El chip de bolsa del encabezado de turno lo agregué ayer copiando la forma del
portal. Contradecía al PDF **del mismo archivo**, que sí usa el helper (`:953`).
Ahora usa el helper, y el select pide `distribucion_premios`.

## 3. El barrido — no hay más lugares

```
$ git grep -n "bolsa_total" main -- '*.html' '*.js' | grep -v "select(\|\.select\|bolsa_total:"
main:carta-llamados.html:891    → entrada de repartoDisplay        ✅
main:carta-llamados.html:1037   → entrada de repartoDisplay        ✅
main:carta-llamados.html:1146   → el form que EDITA el nominal     ✅ correcto
main:inscripciones.html:561     → chip crudo                       🔴 corregido
main:inscripciones.html:953     → entrada de repartoDisplay        ✅
main:liquidaciones-engine.js:123 → fórmula de PAGO                 ✅ correcto
main:portal.html:604            → chip crudo                       🔴 corregido
main:programa-oficial-color.html:649 → entrada de repartoDisplay   ✅
main:programa-oficial.html:450  → entrada de repartoDisplay        ✅
main:programa.html:340          → entrada de repartoDisplay        ✅
main:ratificacion.html:355      → entrada de repartoDisplay        ✅
```

**Los dos que corregí eran los dos únicos.** El resto le pasa `bolsa_total` **como
entrada** al helper (correcto: la columna es el nominal y es la base del cálculo),
lo edita como nominal en el formulario de carga (correcto), o lo usa el motor de
pago (correcto, tiene su propia fórmula).

Assert `F2` del probe nuevo lo fija: ningún `formatARS`/`formatMonto` sobre
`c.bolsa_total` en código vivo de las dos pantallas.

## 4. 🔴 El bug de fondo: el probe de paridad

Ésta es la parte que importa más que el fix.

**El probe comparaba el chip del portal contra el chip de inscripciones.** Los dos
mostraban `bolsa_total` crudo, coincidían perfectamente, y el probe pasaba en
verde — con 47/47 y 11 mutantes muertos. **Replicó fielmente el número
equivocado.**

> **Comparar dos pantallas entre sí no verifica un valor: verifica que coincidan.**

Lo que se cambió:

**(a) Un tercer punto de apoyo.** El esperado ya no sale de la otra pantalla: sale
de `premios-utils.js` cargado **aparte**, como oráculo independiente.

```javascript
const oraculo = {};
new Function('window', readFileSync(join(HERE, '..', 'premios-utils.js'), 'utf8'))(oraculo);
const { repartoDisplay } = oraculo;

const BOLSA = 1054166.67;                          // R9 T1: el piso MUERDE
const BOLSA_EFECTIVA = repartoDisplay(BOLSA, DIST).total;   // 1159292
```

El fixture pasó a usar una bolsa donde nominal y efectiva **difieren** ($1.054.167
vs $1.159.292): antes usaba una sin `distribucion_premios`, con lo cual los dos
números coincidían y el assert no podía fallar aunque quisiera.

**(b) `P6` y `Q6` ahora exigen el valor del oráculo y prohíben el nominal:**

```javascript
ok('P6) el chip de bolsa del llamado == repartoDisplay, NO el nominal',
   chipsL.includes(P.formatARS(BOLSA_EFECTIVA)) && !chipsL.includes(P.formatARS(BOLSA)), …);
```

**(c) `D5` nuevo — el assert que faltaba:**

```javascript
// Aunque las dos coincidan, el valor tiene que ser el del oráculo. Si las dos
// volvieran al nominal, D1 y D4 seguirían en verde y sólo este las agarra.
ok('D5) las dos coinciden CON EL ORÁCULO, no sólo entre sí', …);
```

**(d) Dos mutantes que reproducen el bug original**, M12 y M13: cada chip vuelve al
crudo. Con los asserts viejos, **aplicados juntos sobrevivían**. Ahora cada uno
muere por separado, y `D5` los mata aunque coincidan entre sí.

```
✅ M12 muere — vuelve el bug: el chip del portal muestra bolsa_total crudo  [murieron P6,D1,D5]
✅ M13 muere — vuelve el bug: el chip de inscripciones muestra bolsa_total crudo  [murieron Q6,D1,D5]
```

**48/48 asserts, 13 mutantes, 13 muertos.**

## 5. El probe nuevo — `tests/probe_bolsa_efectiva.mjs`

**Doble oráculo, a propósito:**

1. **`repartoDisplay()` cargado aparte** — verifica que el chip use el helper.
2. **Una tabla con los once números de R9 escritos a mano** — verifica que el
   helper siga dando lo que tiene que dar.

Ninguno de los dos alcanza solo, y el mutation testing lo demuestra: **M5** (quitar
el piso del helper) **no mata** los asserts contra el helper —chip y oráculo
comparten el helper mutado y siguen coincidiendo— pero **sí mata** los de la tabla.
Es exactamente el mismo modo de falla del probe viejo, un nivel más arriba.

La tabla, verificada contra la definición del piso:

| T | `bolsa_total` | **Bolsa efectiva** | Δ |
|---|---|---|---|
| 1 | 1.054.166,67 | **1.159.292** | +105.125 |
| 2 | 1.016.666,67 | **1.125.167** | +108.500 |
| 3 | 1.118.333,33 | **1.217.683** | +99.350 |
| 4 | 1.000.000,00 | **1.110.000** | +110.000 |
| 5 | 1.166.666,67 | **1.261.667** | +95.000 |
| 6 | 1.083.333,33 | **1.185.833** | +102.500 |
| 7 | 1.191.666,67 | **1.284.417** | +92.750 |
| 8 | 1.191.666,67 | **1.284.417** | +92.750 |
| 9 | 3.333.333,33 | **3.333.333** | +0 |
| 10 | 1.833.333,33 | **1.878.333** | +45.000 |
| 11 | 1.833.333,33 | **1.878.333** | +45.000 |

Bloques: **H** (el helper contra la tabla), **P** (el chip del portal, turno por
turno, contra el helper Y contra la tabla), **I** (ídem inscripciones), **E** (que
las bolsas reales de R9 no se hayan despegado de la tabla del probe), **F**
(estructural).

### Dos huecos que destapó el propio mutation testing

**M4 sobrevivía**: quitar `distribucion_premios` del select de inscripciones no
mataba nada, porque el probe leía la carrera por su cuenta en vez de correr el
camino real. Se corrigió: ahora corre `onReunionChange` → `onCarreraChange`
completos, así el `select` real queda bajo prueba.

**M7 sobrevivía**: el assert de "Σ puestos ≡ total" no probaba la absorción del
resto de redondeo, porque con las bolsas de R9 **no hay residuo** — el redondeo da
justo. Se agregó `H3b` con una bolsa elegida para que lo haya (1.000.002, residuo
+1).

```
$ node tests/probe_bolsa_efectiva.mjs
```

```

── Probe · la bolsa mostrada es la EFECTIVA, con piso ──
   portal=/home/clio/dev/SGH/portal.html
   insc=/home/clio/dev/SGH/inscripciones.html
   utils=/home/clio/dev/SGH/premios-utils.js
 ✅ H1) el helper da los once valores esperados de R9  → T1=1159292 T2=1125167 T3=1217683 T4=1110000 T5=1261667 T6=1185833 T7=1284417 T8=1284417 T9=3333333 T10=1878333 T11=1878333
 ✅ H2) la efectiva es MAYOR que el nominal donde el piso muerde (10 de 11)  → T1:+105125 T2:+108500 T3:+99350 T4:+110000 T5:+95000 T6:+102500 T7:+92750 T8:+92750 T9:+0 T10:+45000 T11:+45000
 ✅ H3) Σ de los puestos ≡ total en los once turnos de R9
 ✅ H3b) …y también con una bolsa que DEJA residuo: el puesto mayor lo absorbe  → bolsa=1000002 · Σround(puestos)=1110001 · round(Σ)=1110002 · residuo=1 · Σ tras absorber=1110002
 ✅ H4) los bonos NO entran en la bolsa  → con bono_ganador=1159292 · sin=1159292
 ✅ P0) el llamado renderizó los once turnos del fixture  → filas=11
 ✅ P1) el chip del portal == lo que da repartoDisplay, en los once turnos  → 11/11
 ✅ P2) el chip del portal == los once números concretos de R9  → T1=$1.159.292,00 T2=$1.125.167,00 T3=$1.217.683,00 T4=$1.110.000,00 T5=$1.261.667,00 T6=$1.185.833,00 T7=$1.284.417,00 T8=$1.284.417,00 T9=$3.333.333,00 T10=$1.878.333,00 T11=$1.878.333,00
 ✅ P3) T1 dice $1.159.292,00, NO $1.054.166,67  → chip="$1.159.292,00"
 ✅ P4) el bloque no muestra ninguna de las once bolsas NOMINALES  → ninguna
 ✅ I0) onReunionChange trajo los once turnos del fixture  → carreras=11
 ✅ I1) el chip de inscripciones == repartoDisplay, en los once turnos  → 11/11
 ✅ I2) el chip de inscripciones == los once números concretos  → 11/11
 ✅ I3) T1 en inscripciones dice $1.159.292,00  → chip="$1.159.292,00"
 ✅ E1) las bolsas reales de R9 siguen siendo las de la tabla del probe  → 11 turnos, sin drift
 ✅ E2) el piso de R9 sigue siendo 100.000 en los once
 ✅ F1) portal.html carga premios-utils.js
 ✅ F2) ningún formatARS/formatMonto sobre bolsa_total crudo en código vivo  → portal e inscripciones limpios
 ✅ T1) teardown: no quedó ninguna reunión 9990  → quedan=0

19/19 OK
```

```
$ node tests/probe_bolsa_efectiva.mjs --mutantes
```

```

═══ MUTATION TESTING · 8/8 mutantes ═══
(copias en /tmp/mut-bolsa-7hc5KG — el repo no se toca)

✅ M1 muere — vuelve el bug: el chip del portal muestra bolsa_total crudo  [esperaba matar P1,P2,P3; murieron P1,P2,P3]
✅ M2 muere — vuelve el bug: el chip de inscripciones muestra bolsa_total crudo  [esperaba matar I1,I2,I3; murieron I1,I2,I3]
✅ M3 muere — el portal deja de pedir distribucion_premios en el select  [esperaba matar P1,P2,P3; murieron P1,P2,P3]
✅ M4 muere — inscripciones deja de pedir distribucion_premios en el select  [esperaba matar I1,I2,I3; murieron I1,I2,I3]
✅ M5 muere — el helper deja de aplicar el piso ganancia_minima  [esperaba matar H1,H2,P2,P3,I2,I3; murieron H1,H2,P2,P3,I2,I3]
✅ M6 muere — el helper suma los bonos a la bolsa (no debe)  [esperaba matar H1,H2,P2,I2; murieron H1,H2,P2,I2]
✅ M7 muere — el resto de redondeo deja de absorberse: Σ puestos ≠ total  [esperaba matar H3b; murieron H3b]
✅ M8 muere — el chip del portal se cuelga del otro chip en vez del helper  [esperaba matar P1,P2,P3; murieron P1,P2,P3]

✅ TANDA LIMPIA — 8 probados · 8 muertos

```

Y el de paridad, ya corregido:

```

═══ MUTATION TESTING · 13/13 mutantes ═══
(copias en /tmp/mut-paridad-llamado-zTlcnf — el repo no se toca)

✅ M1 muere — vuelve el bug: fechaHora usa toLocaleTimeString y le pega " hs"  [esperaba matar H1,H2,H5,H7; murieron H1,H2,H5,H7]
✅ M2 muere — la unidad queda duplicada ("09:00 hs hs")  [esperaba matar H1,H3; murieron H1,H3]
✅ M3 muere — inscripciones se desincroniza: fechaHora vuelve a 12 h  [esperaba matar H4,H6,H7; murieron H4,H6,H7]
✅ M4 muere — el llamado vuelve a no mostrar el texto de la condición  [esperaba matar P8,L1,L3,D1; murieron P8,L1,L3,D1]
✅ M5 muere — inscripciones vuelve a no mostrar el texto de la condición  [esperaba matar Q8,L2,L4,D1; murieron Q8,L2,L4,D1]
✅ M6 muere — el select de carreras vuelve a las cinco columnas viejas  [esperaba matar Q3,Q4,Q5,Q6,Q7,D1,D5; murieron Q3,Q4,Q5,Q6,Q7,D1,D5]
✅ M7 muere — la condición se mete adentro de la fila de chips y la estira  [esperaba matar L4; murieron L4]
✅ M8 muere — el llamado trunca la condición larga a 70 caracteres  [esperaba matar L1; murieron L1]
✅ M9 muere — inscripciones pierde el chip de cierre  [esperaba matar Q7,D1; murieron Q7,D1]
✅ M10 muere — la condición pierde overflow-wrap: una palabra larga desborda la tarjeta  [esperaba matar L7; murieron L7]
✅ M11 muere — inscripciones pierde el chip de categoría que pidió Yesi  [esperaba matar Y1; murieron Y1]
✅ M12 muere — vuelve el bug: el chip del portal muestra bolsa_total crudo  [esperaba matar P6,D1,D5; murieron P6,D1,D5]
✅ M13 muere — vuelve el bug: el chip de inscripciones muestra bolsa_total crudo  [esperaba matar Q6,D1,D5; murieron Q6,D1,D5]

✅ TANDA LIMPIA — 13 probados · 13 muertos

```

## 6. Los dos docs con el texto v1

Eran el origen probable del error: quien escribió el chip del portal leyendo
`ESTADO.md` hizo lo que ese documento decía.

| Doc | Antes (v1) | Ahora |
|---|---|---|
| `docs/ESTADO.md:34-36` | *"La **BOLSA impresa es el nominal**; ni el piso ni los bonos inflan ese número"* — y en la misma frase decía que los 6 sitios usan `repartoDisplay()`, que es el que aplica el piso | **"BOLSA EFECTIVA (con piso) + bonos aparte"**, con nota de qué decía antes y por qué se corrigió |
| `docs/LIQUIDACIONES_MODELO.md:12` | *"En el display … la BOLSA impresa es el **nominal** … el piso y los bonos **NO inflan** ese número"* | **la EFECTIVA**, con la aclaración de que la versión anterior era v1 y sobrevivió mes y medio contradiciendo al GOTCHA #63 |

Los dos quedan con una nota explícita de la corrección, para que el próximo que
los lea sepa que hubo dos versiones y cuál manda.

## 7. Diff y verificación

```diff
diff --git a/docs/ESTADO.md b/docs/ESTADO.md
index b98a180..a96e67e 100644
--- a/docs/ESTADO.md
+++ b/docs/ESTADO.md
@@ -31,9 +31,15 @@
 
 > En main/prod: tanda de premios (`feat/premios-display-v2`, merge `d626049`). Doc de premios + restore.
 
-### Premios — modelo de display: NOMINAL + bonos aparte (decisión de Fede confirmada)
-- La **BOLSA impresa es el nominal** (`bolsa_total` tal cual se carga); ni el piso `ganancia_minima` ni los bonos inflan ese número. Helper `repartoDisplay()` en `premios-utils.js` (los 6 sitios de display lo usan). El reparto por puesto suma exacto a la bolsa (último puesto absorbe el resto del redondeo).
-- **Bonos**: líneas aparte condicionales. **Ganancia mínima**: línea informativa condicional (comunica el piso sin inflar). **`calcPremiosConPiso` intacto** → el piso aplica solo en **liquidación** (pago).
+### Premios — modelo de display: BOLSA EFECTIVA (con piso) + bonos aparte
+> **Corregido el 2026-09-08.** Este bloque decía "la BOLSA impresa es el nominal" —texto **v1**,
+> anterior a la aclaración de Yesica del 21/07— y quedó contradiciendo al GOTCHA #63 vigente
+> durante mes y medio. Es el origen probable del chip de bolsa del portal, que mostraba el
+> nominal. Ver `docs/diagnosticos/2026-09-08_bolsas-portal-vs-detalle-r9.md`.
+
+- La **BOLSA impresa es la EFECTIVA**: la suma de los puestos con el piso `ganancia_minima` ya aplicado. Un 4°/5° que queda por debajo del piso se muestra **elevado al piso** (ej. 100.000). Helper `repartoDisplay()` en `premios-utils.js` — lo usan los **8** sitios de display (carta de llamados ×2, los tres programas, ratificación, PDF de inscriptos, chip del encabezado de inscripciones y chip del llamado del portal). El reparto por puesto suma exacto a la bolsa: el puesto de **mayor** monto absorbe el resto del redondeo, para no desclavar los pisos de los puestos bajos.
+- **`carreras.bolsa_total` en DB es siempre el NOMINAL** (ADR-037). La efectiva se deriva al render y **nunca se persiste**. El nominal no se le muestra al usuario: es el dato de carga.
+- **Bonos**: líneas aparte condicionales, **NO** se suman a la BOLSA (esto sí es decisión de Fede). **`calcPremiosConPiso`** es el que aplica el piso, y lo aplica tanto en el **display** como en la **liquidación** — con una diferencia: el motor de pago (`liquidaciones-engine.js:120-126`) funde el bono al ganador en el 1° **antes** del piso, el display lo excluye.
 - Warning al guardar si el piso parece un error de tipeo (`pisoSospechoso`, > 20% de la bolsa). Probes `tests/probe_reparto_display.mjs` (7/7) + `tests/probe_piso_warning.mjs` (5/5).
 
 ### Infra — proyecto Supabase pausado y restaurado (sin pérdida de datos)
diff --git a/docs/LIQUIDACIONES_MODELO.md b/docs/LIQUIDACIONES_MODELO.md
index d8efcb5..d32d546 100644
--- a/docs/LIQUIDACIONES_MODELO.md
+++ b/docs/LIQUIDACIONES_MODELO.md
@@ -9,7 +9,9 @@
 > - ⏳ Fase 2bis — botón "Oficializar reunión". ⏳ Fase 3 — estados de línea + retención anti-doping. ⏳ Fase 4 — recibos por persona on-demand. ⏳ Fase 5 — resumen de reunión. ⏳ Fase 6 — validar A+B con datos reales de R5.
 > Detalle de fases y decisiones: `docs/ISSUES.md` (ISSUE-001). ADRs: ADR-042..047.
 
-> **Nota display vs liquidación (2026-07-21):** este modelo (piso `ganancia_minima` + bonos) rige la **liquidación / pago** (`calcPremiosConPiso`). En el **display** (carta de llamado, programa) la BOLSA impresa es el **nominal** (`bolsa_total` tal cual se carga, helper `repartoDisplay`): el piso y los bonos **NO inflan** ese número, se muestran como **líneas informativas aparte**. El modelo de liquidación no cambia; solo se aclara que el piso/bono aplican en el pago, no en lo impreso. Ver GOTCHA #63 / ISSUE-031.
+> **Nota display vs liquidación (2026-07-21, CORREGIDA el 2026-09-08):** este modelo (piso `ganancia_minima` + bonos) rige la **liquidación / pago**. En el **display** (carta de llamado, programa, portal) la BOLSA impresa es la **EFECTIVA**: el piso `ganancia_minima` **SÍ** entra —un puesto por debajo del piso se muestra elevado al piso, y la bolsa es la suma de los puestos efectivos (`repartoDisplay`)—; los **bonos** siguen **aparte**, como líneas informativas, y **no** se suman a la BOLSA. `carreras.bolsa_total` en DB es siempre el nominal y no se muestra al usuario.
+>
+> La versión anterior de esta nota decía que el display mostraba el **nominal**. Era texto **v1**, previo a la aclaración de Yesica que quedó registrada en GOTCHA #63, y sobrevivió mes y medio contradiciendo al GOTCHA. Ver GOTCHA #63 / ISSUE-031 / `docs/diagnosticos/2026-09-08_bolsas-portal-vs-detalle-r9.md`.
 
 -----
 
diff --git a/inscripciones.html b/inscripciones.html
index 8a3f499..36fe8a6 100644
--- a/inscripciones.html
+++ b/inscripciones.html
@@ -463,7 +463,7 @@ async function onReunionChange() {
   // y el nombre de la categoría. Sin esto, currentCarrera salía del array con
   // la mitad de las columnas y los chips quedaban vacíos.
   const { data: cars, error: eCars } = await sb.from('carreras')
-    .select('id,numero_turno,nombre,distancia_metros,tipo_pista,condicion_sexo,edad_minima_anos,edad_maxima_anos,bolsa_total,cupo_maximo,condicion_handicap,condicion_adicional,cierre_inscripcion,estado,categoria_id,categorias_carrera(nombre)')
+    .select('id,numero_turno,nombre,distancia_metros,tipo_pista,condicion_sexo,edad_minima_anos,edad_maxima_anos,bolsa_total,distribucion_premios,cupo_maximo,condicion_handicap,condicion_adicional,cierre_inscripcion,estado,categoria_id,categorias_carrera(nombre)')
     .eq('reunion_id', rid).order('numero_turno');
   if (eCars) { console.error('[carreras onReunionChange]', eCars); toast(eCars.message, 'error'); throw eCars; }
   carreras = cars||[];
@@ -558,7 +558,13 @@ function renderCarreraChips() {
     c.condicion_sexo || '',
     textoEdad(c),
     cat,
-    c.bolsa_total ? `💰 ${formatMonto(c.bolsa_total)}` : '',
+    // Bolsa EFECTIVA, con el piso `ganancia_minima` aplicado — GOTCHA #63.
+    // Es el MISMO helper que usa el PDF de inscriptos de este archivo (:953) y
+    // las otras cinco pantallas de display. Antes acá iba `c.bolsa_total` crudo
+    // y el encabezado contradecía al PDF del mismo archivo: en R9 T1 decía
+    // $1.054.167 donde el PDF decía $1.159.292.
+    // Ver docs/diagnosticos/2026-09-08_bolsas-portal-vs-detalle-r9.md.
+    c.bolsa_total ? `💰 ${formatMonto(repartoDisplay(c.bolsa_total, c.distribucion_premios).total)}` : '',
     c.cupo_maximo ? `Cupo ${c.cupo_maximo}` : '',
     c.cierre_inscripcion ? `⏳ cierra ${fechaHora(c.cierre_inscripcion)}` : '',
   ].filter(Boolean).map(t => `<span class="chip">${esc(t)}</span>`).join('');
diff --git a/portal.html b/portal.html
index 4793fad..5a60f3e 100644
--- a/portal.html
+++ b/portal.html
@@ -283,6 +283,10 @@
 
 <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 <script src="activacion-pendiente.js"></script>
+<!-- repartoDisplay(): la bolsa que se muestra es la EFECTIVA, con el piso
+     ganancia_minima aplicado (GOTCHA #63, regla de Yesica). El portal era la
+     única pantalla que no cargaba este helper y por eso mostraba el nominal. -->
+<script src="premios-utils.js"></script>
 <script>
 let sb, currentUser, miUsuarioId = null, esEntrenador = false, miProfesionalId = null;
 let misCaballos = [], misInscripciones = [];
@@ -526,6 +530,25 @@ function textoCondicion(c) {
     .map(s => (s || '').trim()).filter(Boolean).join(' — ');
 }
 
+// La bolsa que ve el entrenador es la EFECTIVA, no `bolsa_total` crudo.
+// GOTCHA #63 (regla aclarada por Yesica): el piso `ganancia_minima` SÍ entra en
+// el display — un 4°/5° que queda por debajo se muestra elevado al piso, y la
+// bolsa impresa es la suma de los puestos efectivos. Los bonos NO se suman acá
+// (decisión de Fede): van como líneas aparte.
+//
+// Antes esto era `formatARS(c.bolsa_total)` y el portal era la ÚNICA pantalla
+// que mostraba el nominal: en R9 anunciaba $1.054.167 donde la carta y el
+// programa decían $1.159.292. Diez de los once turnos diferían.
+// Ver docs/diagnosticos/2026-09-08_bolsas-portal-vs-detalle-r9.md.
+//
+// repartoDisplay() viene de premios-utils.js, el mismo helper que usan la carta
+// de llamados, los tres programas, la ratificación y el PDF de inscriptos.
+function bolsaChip(c) {
+  if (!c.bolsa_total) return '';
+  const { total } = repartoDisplay(c.bolsa_total, c.distribucion_premios);
+  return `<span class="chip">💰 ${esc(formatARS(total))}</span>`;
+}
+
 function ventanaAbierta(c, reunionEstado) {
   if (reunionEstado !== 'publicada') return false;
   if (c.estado === 'anulada') return false;
@@ -545,7 +568,7 @@ async function loadLlamado() {
   // anotarse. Mejor no mostrarla que ofrecer algo imposible.
   const hoy = new Date().toISOString().slice(0, 10);
   const { data: reuns, error } = await sb.from('reuniones')
-    .select('id,numero,numero_publico,fecha,estado,hipodromos(nombre),carreras(id,numero_turno,nombre,distancia_metros,condicion_sexo,edad_minima_anos,edad_maxima_anos,condicion_handicap,condicion_adicional,bolsa_total,cupo_maximo,tipo_pista,estado,apertura_inscripcion,cierre_inscripcion)')
+    .select('id,numero,numero_publico,fecha,estado,hipodromos(nombre),carreras(id,numero_turno,nombre,distancia_metros,condicion_sexo,edad_minima_anos,edad_maxima_anos,condicion_handicap,condicion_adicional,bolsa_total,distribucion_premios,cupo_maximo,tipo_pista,estado,apertura_inscripcion,cierre_inscripcion)')
     .eq('estado', 'publicada')
     .gte('fecha', hoy)
     .order('fecha', { ascending: true });
@@ -601,7 +624,7 @@ async function loadLlamado() {
             ${c.tipo_pista ? `<span class="chip">${esc(c.tipo_pista)}</span>` : ''}
             ${c.condicion_sexo ? `<span class="chip">${esc(c.condicion_sexo)}</span>` : ''}
             ${textoEdad(c) ? `<span class="chip">${esc(textoEdad(c))}</span>` : ''}
-            ${c.bolsa_total ? `<span class="chip">💰 ${esc(formatARS(c.bolsa_total))}</span>` : ''}
+            ${bolsaChip(c)}
             ${c.cupo_maximo ? `<span class="chip">Cupo ${esc(c.cupo_maximo)}</span>` : ''}
             <span class="chip">⏳ cierra ${esc(fechaHora(c.cierre_inscripcion))}</span>
             ${yaAnotados ? `<span class="chip" style="color:var(--success);border-color:rgba(76,175,130,0.35);">✓ ${yaAnotados} anotado${yaAnotados > 1 ? 's' : ''}</span>` : ''}
```

```
$ git ls-remote origin fix/bolsa-efectiva-portal
72f3b509c5cc4016952b99b6cf4ac6fb75c078c6	refs/heads/fix/bolsa-efectiva-portal

$ git ls-remote origin main            # intacto, sin mergear
2bb5d0c9ef3e7738df66cf19c649a93d6aba3f5d	refs/heads/main

$ git diff --stat origin/main..origin/fix/bolsa-efectiva-portal
 docs/ESTADO.md                                |  12 +-
 docs/LIQUIDACIONES_MODELO.md                  |   4 +-
 inscripciones.html                            |  10 +-
 portal.html                                   |  27 +-
 tests/README.md                               |   1 +
 tests/probe_bolsa_efectiva.mjs                | 479 ++++++++++++++++++++++++++
 tests/probe_paridad_llamado_inscripciones.mjs |  84 ++++-
 7 files changed, 595 insertions(+), 22 deletions(-)
```

**`main` sigue en `2bb5d0c`. La rama espera tu OK.**

```bash
git fetch origin
git diff origin/main..origin/fix/bolsa-efectiva-portal
git switch fix/bolsa-efectiva-portal

set -a; . ./.env; set +a
node tests/probe_bolsa_efectiva.mjs
node tests/probe_bolsa_efectiva.mjs --mutantes
node tests/probe_paridad_llamado_inscripciones.mjs
node tests/probe_paridad_llamado_inscripciones.mjs --mutantes
```

## 8. Preguntas abiertas

1. **¿Confirma Yesi la regla v2?** El fix se apoya en GOTCHA #63, que dice que ella
   lo aclaró el 21/07. Los dos docs que decían lo contrario son de la misma fecha.
   Antes de mergear conviene su OK, y no sólo mi lectura de GOTCHAs.
2. **Los bonos siguen sin verse en el portal.** El 1° de T1 cobra $882.500 con el
   bono al ganador, y el portal ahora anuncia $1.159.292 de bolsa. Es el número que
   más le importa al entrenador y no está en ninguna parte del portal.
3. **¿Falta un GOTCHA sobre el patrón del assert?** "Comparar dos pantallas entre
   sí no verifica un valor" es la lección de fondo y hoy sólo vive en el comentario
   del probe. Se parece al hueco del round-trip en memoria del GOTCHA #92 —los dos
   son *el test usa el mismo supuesto que el código que prueba*—. Lo puedo escribir
   si querés, pero no lo hice sin pedido.
4. **El delta de $791.475 ya se anunció en el papel.** Si la carta de R9 se imprimió,
   dice la efectiva; el portal decía el nominal. Los entrenadores que miraron el
   portal vieron menos plata de la que la reunión reparte.
