# Las dos bolsas de R9 — de dónde sale cada número

**Fecha:** 2026-09-08
**Reporta:** Fede — el llamado del portal dice `$1.054.166,67` en el turno 1 de R9 y el detalle
dice `Bolsa: $1.159.292,00`.
**Modo:** **SOLO LECTURA.** Ni un `INSERT`, `UPDATE`, `DELETE` ni DDL. Sólo `SELECT`, `grep`,
`sed` y un cálculo local que corre el `premios-utils.js` real sobre datos traídos por `SELECT`.
**Greps:** contra `main` (`git grep … main`, `git show main:…`).
**SHA de `main`:** `2bb5d0c9ef3e7738df66cf19c649a93d6aba3f5d`
**SHA de este informe:** ver §8.

## Guards verificados

```
$ pwd
/home/clio/dev/SGH

$ SELECT count(*) FROM spcs;      -- por MCP, proyecto unlhcuanfrtpatoipwve
[{"spcs":181}]

ref del proyecto: unlhcuanfrtpatoipwve
```

---

## 0. Veredicto primero

**Los dos números están bien calculados. Miden cosas distintas.** No hay bug de cálculo.

**Pero uno de los dos está en el lugar equivocado: el del portal.** La regla documentada —
GOTCHA #63 corregido, aclarada por Yesica — dice que **la bolsa que se muestra es la EFECTIVA,
con el piso aplicado**. Seis pantallas la respetan. El chip del portal es la excepción: muestra
`bolsa_total` crudo.

Y hay que sumar algo: **el chip de bolsa que agregué ayer a `inscripciones.html` tiene el mismo
defecto.** Lo copié del portal en vez de usar el helper, y quedó contradiciendo al PDF del mismo
archivo, que sí usa el helper. Es una regresión mía de ayer. Detalle en §6.3.

Diferencia en **10 de los 11 turnos**. En T1 son **$105.125** — un 10% de la bolsa.

---

## 1. De dónde sale cada número

### 1.1 El del llamado abierto: `$1.054.166,67` — `bolsa_total` CRUDO

**`portal.html:604`** (numeración de `main`):

```javascript
${c.bolsa_total ? `<span class="chip">💰 ${esc(formatARS(c.bolsa_total))}</span>` : ''}
```

`c.bolsa_total` viene del `select` de `loadLlamado()` (`portal.html:548`). **Sin ninguna
transformación**: el valor de la columna, formateado y nada más. No aplica piso, no suma bonos,
no redondea (`formatARS` muestra los centavos: `$1.054.166,67`).

El chip existe desde `51d3d4e` (gate 4.4, el portal operativo).

### 1.2 El del detalle: `$1.159.292,00` — bolsa EFECTIVA, con piso

**`carta-llamados.html:900`**:

```javascript
const { puestos: puestosEfectivos, total: bolsaNominal } = repartoDisplay(bolsa, dist);
const montoTotal  = bolsaNominal; // BOLSA = efectiva (con piso); los bonos van aparte, NO se suman
```

y se imprime en `carta-llamados.html:924`:

```javascript
const bolsaInline = bolsa > 0
  ? `Bolsa: ${formatMonto(bolsaNominal)}${desglosePuestos.length ? ' — ' + desglosePuestos.join(' — ') : ''}`
```

`repartoDisplay` está en **`premios-utils.js:33`** y envuelve a `calcPremiosConPiso`
(`premios-utils.js:9`):

```javascript
function calcPremiosConPiso(bolsaNominal, dist) {
  const bolsa  = parseFloat(bolsaNominal) || 0;
  const minimo = parseFloat(dist?.ganancia_minima) || 0;
  …
  Object.entries(dist || {}).forEach(([k, v]) => {
    if (EXCLUIR.includes(k)) return;          // ← los bonos quedan afuera
    const pct  = parseFloat(v) || 0;
    if (pct <= 0) return;
    const calc = bolsa * pct / 100;
    const efectivo = (minimo > 0 && calc < minimo) ? minimo : calc;   // ← el piso
    puestos[k] = efectivo;
    bolsaEfectiva += efectivo;
  });
  …
}
```

Con `EXCLUIR = ['bonos','bono_ganador','bono_posicion_desde','bono_posicion_hasta','bono_posicion_monto','ganancia_minima']`.

### 1.3 Sí: uno es el crudo y el otro el efectivo con piso

**Exactamente eso.** La respuesta a la pregunta 1 es sí:

| | Llamado del portal | Detalle |
|---|---|---|
| Valor | `carreras.bolsa_total` tal cual | `round(Σ puestos con piso aplicado)` |
| Piso `ganancia_minima` | ❌ no lo aplica | ✅ lo aplica |
| Bonos | ❌ no los suma | ❌ no los suma (van como líneas aparte) |
| Redondeo | ninguno (muestra centavos) | `Math.round`, y el puesto mayor absorbe el resto |
| Se persiste | sí, es la columna | **no**, se deriva al render |

---

## 2. Los datos crudos de R9

```sql
SELECT c.numero_turno, c.bolsa_total, c.bolsa_bonos, c.distribucion_premios
FROM reuniones r JOIN carreras c ON c.reunion_id=r.id
WHERE r.club_id='0649e9c5-9e87-4aad-842f-101458e6b33c' AND r.numero=9
ORDER BY c.numero_turno;
```

| T | `bolsa_total` | `bolsa_bonos` | `distribucion_premios` |
|---|---|---|---|
| 1 | `1054166.67` | `0.00` | `{"1":60,"2":19,"3":12,"4":6,"5":3,"bono_ganador":250000,"ganancia_minima":100000,"bono_posicion_desde":6,"bono_posicion_hasta":8,"bono_posicion_monto":100000}` |
| 2 | `1016666.67` | `0.00` | idem T1 |
| 3 | `1118333.33` | `0.00` | idem T1 |
| 4 | `1000000.00` | `0.00` | idem T1 |
| 5 | `1166666.67` | `0.00` | idem T1 |
| 6 | `1083333.33` | `0.00` | idem T1 |
| 7 | `1191666.67` | `0.00` | idem T1 |
| 8 | `1191666.67` | `0.00` | idem T1 |
| 9 | `3333333.33` | `0.00` | `{"1":60,"2":19,"3":12,"4":6,"5":3,"ganancia_minima":100000,"bono_posicion_desde":6,"bono_posicion_hasta":8,"bono_posicion_monto":100000}` — **sin `bono_ganador`** |
| 10 | `1833333.33` | `0.00` | idem T9 (sin `bono_ganador`) |
| 11 | `1833333.33` | `0.00` | idem T9 (sin `bono_ganador`) |

Notas:

- **`bolsa_bonos` está en `0.00` en los once** y no la usa nadie para este display: los bonos
  salen de `distribucion_premios`, no de esa columna.
- **T9, T10 y T11 no tienen `bono_ganador`.** Los otros ocho sí, de $250.000.
- El piso `ganancia_minima` es $100.000 en los once.
- El bono de posición 6ª-8ª es $100.000 por puesto en los once → $300.000 si se cubren los tres.

---

## 3. La cuenta del turno 1, paso a paso

Corriendo el `repartoDisplay` **real** extraído de `main:premios-utils.js` sobre
`bolsa_total = 1054166.67` y su `distribucion_premios`:

```
1º: 1054166.67 * 60% = 632500.0020  ≥ piso → queda 632500.0020
2º: 1054166.67 * 19% = 200291.6673  ≥ piso → queda 200291.6673
3º: 1054166.67 * 12% = 126500.0004  ≥ piso → queda 126500.0004
4º: 1054166.67 *  6% =  63250.0002  < piso 100000 → PISO 100000  ⬅ SE ELEVA
5º: 1054166.67 *  3% =  31625.0001  < piso 100000 → PISO 100000  ⬅ SE ELEVA
Σ efectivos = 1159291.6697  → round = 1159292
bolsa_total = 1054166.67    → delta   = +105124.9997
```

**Reproduce exactamente lo que reportó Fede**, incluido el desglose:

| Puesto | Mostrado | Coincide con el reporte |
|---|---|---|
| Bolsa | **$1.159.292,00** | ✅ |
| 1° | **$632.500,00** | ✅ |
| 2° | **$200.292,00** | ✅ |
| 3° | **$126.500,00** | ✅ ("$126.xxx") |
| 4° | $100.000,00 | (piso) |
| 5° | $100.000,00 | (piso) |

### Qué suma cada número — la respuesta a la pregunta 3

| | Llamado del portal | Detalle |
|---|---|---|
| **Qué suma** | nada: es la columna | 1° + 2° + 3° + 4° + 5°, **cada uno ya elevado al piso** |
| **¿Incluye bonos?** | **NO** | **NO** — `EXCLUIR` los saca |
| **¿Aplica piso?** | **NO** | **SÍ** — es toda la diferencia |
| **¿Redondea?** | no, muestra `,67` | sí, `Math.round`; el puesto de mayor monto absorbe el resto para que Σ ≡ total |

**La brecha es exactamente el "relleno" del piso sobre 4° y 5°:**

```
(100000 − 63250.0002) + (100000 − 31625.0001) = 36749.9998 + 68374.9999 = 105124.9997
1054166.67 + 105124.9997 = 1159291.6697 → 1159292   ✅
```

### Y ojo: ninguno de los dos es lo que se desembolsa

`liquidaciones-engine.js:120-134` calcula el pago con otra fórmula — **funde el bono al ganador
en el 1° y recién después aplica el piso**:

```javascript
let p = parseFloat(car.bolsa_total) * pct / 100;
if (posicion === 1 && dist.bono_ganador) p += parseFloat(dist.bono_ganador);
const minimo = parseFloat(dist.ganancia_minima) || 0;
return minimo > 0 && p < minimo ? minimo : p;
```

Para T1, con los ocho primeros puestos cubiertos:

```
1º pagado: 632500.0020 + 250000 = 882500.0020
2º pagado: 200291.6673
3º pagado: 126500.0004
4º pagado: 100000.0000   (piso)
5º pagado: 100000.0000   (piso)
6º/7º/8º:  100000 c/u    (bono de posición)
TOTAL desembolsado = 1709291.6697 → $1.709.292,00
```

**Hay tres números distintos, no dos**: $1.054.167 (nominal), $1.159.292 (efectiva mostrada) y
$1.709.292 (lo que efectivamente sale de caja si se cubren los ocho puestos).

---

## 4. ¿Cuál tiene que ver el entrenador? — **la efectiva**, según el modelo

No es opinión. Está decidido y documentado, y hubo una corrección explícita:

**`docs/GOTCHAS.md` § 63 — "Display de premios = BOLSA EFECTIVA (con piso), bonos aparte
(2026-07-21, corregido)":**

> ⚠️ **Corrección** (regla real aclarada por Yesica): la primera versión mostraba la BOLSA
> **nominal** en el display — **era un misread**. El piso `ganancia_minima` **SÍ** entra en el
> display.
> - Los montos **por puesto** del display = los **EFECTIVOS con piso**: un 4°/5° por debajo del
>   piso se muestra **en el piso** (ej. 100.000).
> - La **BOLSA impresa** = `round(bolsaEfectiva)` = **Σ de los puestos efectivos**.

**`docs/ISSUES.md` ISSUE-031 v2:** *"BOLSA impresa = **EFECTIVA con piso** … Los **bonos** siguen
**aparte**, NO sumados a la BOLSA (esto sí es decisión de Fede)."*

**`docs/DECISIONES.md` ADR-037:** `premios-utils.js` es la fuente de verdad del display, y el
invariante: *"`carreras.bolsa_total` en DB es siempre la bolsa nominal. La bolsa efectiva es
derivada al render y nunca se persiste."*

Y el propio comentario de `premios-utils.js:26`:

> *"Reparto EFECTIVO (con piso) **para DISPLAY** (carta de llamado, programa, inscriptos)."*

**Respuesta: el entrenador tiene que ver `$1.159.292` — el efectivo.** Es lo que se le va a
pagar. Mostrarle el nominal le anuncia $105.125 menos de lo que la carrera reparte.

### ⚠️ Dos documentos quedaron con la versión vieja y dicen lo contrario

Al buscar la regla aparecen **contradiciéndose entre sí**. Los dos son texto **v1**, previo a la
corrección de Yesica, y no se actualizaron:

| Doc | Línea | Qué dice | Estado |
|---|---|---|---|
| `docs/GOTCHAS.md` | 281 | display = **efectiva** con piso | ✅ **vigente (v2)** |
| `docs/ISSUES.md` | 232 | display = **efectiva** con piso | ✅ **vigente (v2)** |
| `docs/ESTADO.md` | **35** | *"La **BOLSA impresa es el nominal**; ni el piso ni los bonos inflan ese número"* | 🔴 **v1, desactualizado** |
| `docs/LIQUIDACIONES_MODELO.md` | **12** | *"En el display … la BOLSA impresa es el **nominal** … el piso y los bonos **NO inflan** ese número"* | 🔴 **v1, desactualizado** |

Lo llamativo es que `ESTADO.md:35` afirma el nominal **y en la misma frase** dice que los 6 sitios
de display usan `repartoDisplay()` — que es justamente el que aplica el piso. El texto se corrigió
a medias.

**Esto explica cómo se llegó acá:** quien haya escrito el chip del portal leyendo `ESTADO.md` o
`LIQUIDACIONES_MODELO.md` hizo lo que esos documentos decían.

---

## 5. ¿Pasa en los once turnos?

**Sí, en diez de los once de forma visible.** Corrido con el `premios-utils.js` real:

| T | Chip del portal (`bolsa_total`) | Detalle (efectiva) | **Delta** | 1° | 2° | 3° | 4° | 5° |
|---|---|---|---|---|---|---|---|---|
| 1 | $1.054.167 | **$1.159.292** | **+$105.125** | $632.500 | $200.292 | $126.500 | $100.000 | $100.000 |
| 2 | $1.016.667 | **$1.125.167** | **+$108.500** | $610.000 | $193.167 | $122.000 | $100.000 | $100.000 |
| 3 | $1.118.333 | **$1.217.683** | **+$99.350** | $671.000 | $212.483 | $134.200 | $100.000 | $100.000 |
| 4 | $1.000.000 | **$1.110.000** | **+$110.000** | $600.000 | $190.000 | $120.000 | $100.000 | $100.000 |
| 5 | $1.166.667 | **$1.261.667** | **+$95.000** | $700.000 | $221.667 | $140.000 | $100.000 | $100.000 |
| 6 | $1.083.333 | **$1.185.833** | **+$102.500** | $650.000 | $205.833 | $130.000 | $100.000 | $100.000 |
| 7 | $1.191.667 | **$1.284.417** | **+$92.750** | $715.000 | $226.417 | $143.000 | $100.000 | $100.000 |
| 8 | $1.191.667 | **$1.284.417** | **+$92.750** | $715.000 | $226.417 | $143.000 | $100.000 | $100.000 |
| **9** | $3.333.333 | **$3.333.333** | **+$0** | $2.000.000 | $633.333 | $400.000 | $200.000 | $100.000 |
| 10 | $1.833.333 | **$1.878.333** | **+$45.000** | $1.100.000 | $348.333 | $220.000 | $110.000 | $100.000 |
| 11 | $1.833.333 | **$1.878.333** | **+$45.000** | $1.100.000 | $348.333 | $220.000 | $110.000 | $100.000 |

**T9 es la única que coincide**, y por poco: su 5° da `3333333.33 × 3% = 99999,9999`, o sea que
también toca el piso — pero por **una diezmilésima de peso**, que al redondear desaparece. No es
que T9 esté exenta: es que su bolsa es tan grande que el piso casi no muerde.

**El patrón**: la brecha aparece siempre que un puesto cae por debajo de los $100.000, y con el
reparto 60/19/12/6/3 eso pasa en el **4°** cuando la bolsa es menor a $1.666.667 y en el **5°**
cuando es menor a $3.333.333. Con las bolsas de R9, los once turnos elevan el 5° y nueve elevan
también el 4°.

Delta total de la reunión: **$791.475** entre lo que anuncia el portal y lo que anuncian las
otras seis pantallas.

---

## 6. Quién muestra qué — el mapa completo

```
$ git grep -n "repartoDisplay\|calcPremiosConPiso" main -- '*.html' '*.js'
```

| Pantalla | Línea | Qué muestra | ¿Correcto según GOTCHA #63? |
|---|---|---|---|
| `carta-llamados.html` | 900, 1056 | `repartoDisplay` → **efectiva** | ✅ |
| `programa.html` | 341 | `repartoDisplay` → **efectiva** | ✅ |
| `programa-oficial.html` | 451 | `repartoDisplay` → **efectiva** | ✅ |
| `programa-oficial-color.html` | 650 | `repartoDisplay` → **efectiva** | ✅ |
| `ratificacion.html` | 355 | `repartoDisplay` → **efectiva** | ✅ |
| `inscripciones.html` (PDF de inscriptos) | 953 | `repartoDisplay` → **efectiva** | ✅ |
| **`portal.html` (chip del llamado)** | **604** | **`bolsa_total` crudo** | 🔴 **NO** |
| **`inscripciones.html` (chip del encabezado)** | **561** | **`bolsa_total` crudo** | 🔴 **NO** |

### 6.1 El portal no carga `premios-utils.js`

```
$ git show main:portal.html | grep -n "premios-utils"
(sin resultados)
```

`portal.html` **no incluye el script**. No es que eligiera no usar el helper: no lo tiene
disponible. Los otros seis lo cargan.

### 6.2 El portal no tiene vista de detalle

El chip del llamado es **el único lugar del portal donde aparece un monto**. El desglose que vio
Fede (bolsa + puestos + bonos) es el de `carta-llamados.html`, que es pantalla de secretaría —
o su versión impresa. O sea que el entrenador que entra al portal **sólo ve el número nominal**,
sin nada al lado que lo contextualice.

### 6.3 El chip de `inscripciones.html:561` es una regresión mía, de ayer

Verificado:

```
$ git show b10adc9:inscripciones.html | grep -c "💰"     # antes del 08/09
0
$ git show main:inscripciones.html | grep -c "💰"        # ahora
1
```

El chip de bolsa del encabezado de turno **no existía** antes del trabajo de paridad de ayer
(merge `1676bf7`). Al armarlo copié la forma del chip del portal —`formatMonto(c.bolsa_total)`—
en vez de usar `repartoDisplay`, **que el mismo archivo ya usaba 390 líneas más abajo** para el
PDF de inscriptos (`:953`).

Resultado: dentro de `inscripciones.html`, el encabezado dice $1.054.167 y el PDF dice
$1.159.292. **Eso lo introduje yo ayer y no lo vi.** El probe de paridad que escribí comparaba el
chip contra el chip del portal —que era el criterio pedido, "que las dos pantallas muestren lo
mismo"— y por eso pasó: replicó fielmente el número equivocado.

---

## 7. Veredicto y cómo nombrarlos

### 7.1 No es un bug de cálculo — es un número bien calculado en el lugar equivocado

Las dos cuentas son correctas y reproducibles. **Lo que está mal es que el portal muestre la
nominal**, contra la regla de GOTCHA #63 v2 / ISSUE-031 v2 y contra lo que hacen las otras seis
pantallas.

**El que está mal es el del portal** (y su clon en el encabezado de inscripciones). El del
detalle es el correcto.

### 7.2 Pero además hay que nombrarlos, porque siguen siendo tres cosas distintas

Aunque el portal se corrija, quedan tres magnitudes que hoy se llaman todas "bolsa":

| Magnitud | T1 | Qué es | Cómo nombrarla |
|---|---|---|---|
| `bolsa_total` | $1.054.166,67 | lo que la secretaría carga; base del reparto porcentual | **"Bolsa base"** — dato interno de carga. **No mostrar al entrenador** |
| `round(bolsaEfectiva)` | **$1.159.292** | Σ de los cinco puestos ya elevados al piso | **"Bolsa"** a secas — es la que se anuncia |
| efectiva + bonos | $1.709.292 | lo que sale de caja si se cubren los 8 puestos | **"Total en premios"** o **"con bonos"** — nunca dentro de "Bolsa" |

Recomendación concreta, sin cambiar ninguna regla de negocio:

1. **El chip del portal pasa a `repartoDisplay`** (hay que agregarle el `<script>` de
   `premios-utils.js`, que hoy no carga). Queda igual a las otras seis.
2. **El chip de `inscripciones.html:561` idem** — es corregir mi regresión de ayer, y el helper
   ya está cargado en ese archivo.
3. **La palabra "Bolsa" queda reservada a la efectiva.** Es la que ya usan las seis pantallas y
   el papel.
4. **Los bonos se siguen mostrando aparte y rotulados**, como decidió Fede. Si alguna vez se
   muestra el agregado, que diga "con bonos", no "Bolsa".
5. **`ESTADO.md:35` y `LIQUIDACIONES_MODELO.md:12` hay que corregirlos.** Mientras digan lo
   contrario del GOTCHA vigente, el próximo que escriba una pantalla va a repetir el error — que
   es probablemente lo que pasó con el chip del portal.

Nada de esto toca `carreras.bolsa_total` ni el motor de liquidación: el invariante de ADR-037
—la efectiva se deriva al render y nunca se persiste— se mantiene.

---

## 8. Preguntas abiertas

1. **¿Confirmamos con Yesi que la regla v2 sigue vigente?** GOTCHA #63 dice que la aclaró ella el
   21/07. Los dos docs desactualizados son de la misma fecha, así que conviene que el cambio
   salga con su OK y no sólo con el mío leyendo GOTCHAs.
2. **¿Al entrenador se le muestran los bonos en el portal?** Hoy no ve ninguno. Con el bono al
   ganador de $250.000, el 1° de T1 cobra $882.500 y el portal anuncia una bolsa de $1.054.167.
   Es el número que más le importa y no está en ningún lado del portal.
3. **`bolsa_bonos` está en `0.00` en los once turnos y no la usa ninguna pantalla.** ¿Es columna
   muerta —como las de ratificación de ISSUE-074— o se piensa usar?
4. **¿Y en el papel?** Si la carta impresa de R9 ya salió, dice la efectiva ($1.159.292) porque
   la imprime `carta-llamados`. El portal dice otra cosa. No puedo verificar el papel desde acá.
5. **El probe de paridad de ayer.** Habría que extenderlo para que compare el chip contra
   `repartoDisplay` y no sólo contra el otro chip: hoy tiene un assert que verifica que las dos
   pantallas dicen lo mismo, y las dos dicen lo mismo equivocado.

---

## 9. Verificación en `origin`

```
$ git ls-remote origin main
2bb5d0c9ef3e7738df66cf19c649a93d6aba3f5d	refs/heads/main
```

**Solo lectura confirmada:** este trabajo no ejecutó ningún `INSERT`, `UPDATE`, `DELETE` ni DDL.
El cálculo del §3 y §5 corrió `premios-utils.js` extraído de `main` sobre datos traídos por
`SELECT`, en un archivo temporal fuera del repo. `main` queda en `2bb5d0c` y el único cambio es
este informe.
