# Probe del recibo — resultado, sensibilidad y verificación visual

| | |
|---|---|
| **Fecha** | 2026-08-28 |
| **Branch** | `fix/recibo-pie-cobrador` @ `145c36c` — **NO mergeada** |
| **Probe** | `tests/probe_recibo_pie_cobrador.mjs` |
| **Resultado** | ✅ **53/53** contra el fix · ✅ mutation test M1 y M2 detectados |
| **Pendiente para mergear** | la verificación visual del §4 — que alguien imprima un recibo |

## Guards

```
$ pwd
/home/clio/dev/SGH

SELECT count(*) AS spcs FROM spcs;
[{"spcs":181}]

get_project_url → https://unlhcuanfrtpatoipwve.supabase.co
```

---

## 1. TAREA 1 — por qué escribía sobre R5, y por qué ya no

**No había razón.** Copié la ubicación de fixtures de `tests/probe_cobros_v11.mjs` sin verificar
que R5 siguiera poblada. Peor: **el probe no habría corrido nunca sobre R5.**

```sql
SELECT r.numero,
       (SELECT count(*) FROM carreras c WHERE c.reunion_id=r.id) AS carreras,
       (SELECT count(*) FROM inscripciones i JOIN carreras c ON c.id=i.carrera_id
         WHERE c.reunion_id=r.id) AS inscripciones,
       (SELECT count(*) FROM liquidacion_detalle d WHERE d.reunion_id=r.id) AS lineas_liq
FROM reuniones r WHERE r.club_id='0649e9c5-…' AND r.numero IN (9999, 5) ORDER BY r.numero;
```
```json
[{"numero":5,   "carreras":0,"inscripciones":0, "lineas_liq":0},
 {"numero":9999,"carreras":3,"inscripciones":17,"lineas_liq":76}]
```

**R5 tiene 0 carreras y 0 inscripciones.** El probe necesita `inscripcion_id` para que el recibo
impreso muestre caballo y número de carrera: sobre R5 habría muerto en la fase `fixtures` con
*"R5 sin inscripciones suficientes"*.

Movido a la **9999**, que es la sandbox designada y la que ya usa `probe_recuperacion_monta.mjs`.

> **Efecto colateral a mirar aparte:** `tests/probe_cobros_v11.mjs` sigue apuntando a R5 y
> arranca con `if (carreras.length<2) throw new Error('R5 necesita ≥2 carreras con inscripciones')`.
> Con R5 vacía, **ese probe hoy está roto**. No se tocó — está fuera del alcance de este trabajo,
> pero conviene saberlo.

También se sacó el snapshot/restore de `club_secuencias`, por indicación del usuario: los números
de recibo son ilimitados y quemar algunos en pruebas no es problema. El probe deja el correlativo
adelantado, a propósito.

---

## 2. TAREA 2 — el probe

### 2.1 Resultado

```
$ set -a; . ./.env; set +a
$ node tests/probe_recibo_pie_cobrador.mjs

[presupuesto] fila=5.61mm  fijo=87.6mm  → entran ~31 filas por hoja
[fixtures] liq=4d1c9367-7838-4726-ad54-684062948843  6 líneas caso Fede + 2 para transferencia

──────── RESULTADO ────────
✅ a1 .recibo-copia ya NO declara min-height:100vh
✅ a2 la firma ya NO usa margin-top:auto (no queda anclada al fondo de la caja)
✅ a3 .recibo-pie tiene break-inside: avoid
✅ a4 .recibo-pie tiene page-break-inside: avoid (legacy)
✅ a5 body resetea margin en impresión  (margin="0")
✅ a6 las copias se separan con break-after: page
✅ b1 el recibo de 6 líneas entra en una hoja (121mm de 267mm)
✅ b2 entra con holgura, no al filo (usa <70% de la hoja)  (45%)
✅ b3 el caso extremo de 20 líneas sigue entrando en una hoja  (200mm)
✅ d1 el select trae titular + 2 apoderados + "Otro" (4 opciones)  (n=4)
✅ d2 la 1ª opción es el titular con su nombre
✅ d3 aparecen los 2 apoderados vigentes
✅ d4 existe la opción "Otro"
✅ d5 el modal se abrió
✅ d6 las 6 líneas tildadas quedaron capturadas
✅ d7 elegir titular precarga su nombre
✅ d8 elegir titular precarga su documento  (doc="36384455")
✅ d9 elegir un apoderado precarga nombre y documento del apoderado
✅ e1 "Otro" limpia los campos para tipear de cero
✅ e2 los inputs NUNCA se deshabilitan (el select precarga, no bloquea)
✅ e3 el HTML de los inputs no tiene readonly ni disabled
✅ e4 sin nombre NO se emite (validación previa al RPC)
✅ f1 se emitió el recibo con un cobrador que NO estaba en la lista
✅ f2 cobrador_nombre persistido NO es null  (="SERENO SIN APODERADO")
✅ f3 cobrador_documento persistido NO es null  (="11222333")
✅ f4 forma_pago = efectivo
✅ f5 el modal se cerró tras emitir
✅ f6 las 6 líneas quedaron pagadas contra ese recibo  (n=6)
✅ c1 se generan 2 copias (original + duplicado)
✅ c2 rotuladas ORIGINAL y DUPLICADO
✅ c3 cada copia trae las 6 filas
✅ c4 hay 2 bloques .recibo-pie
✅ c5 el TOTAL está dentro del pie
✅ c6 "Retira" está dentro del pie
✅ c7 la FIRMA está dentro del pie (no suelta al final de la copia)
✅ c8 el pie imprime el nombre del cobrador que no era titular
✅ c9 el pie imprime el documento
✅ c10 el encabezado dice "A nombre de" con el beneficiario
✅ h1 si cobra el titular, el pie dice "el titular"
✅ h2 y NO repite el nombre del titular en el pie
✅ h3 el nombre del titular sigue estando arriba, en "A nombre de"
✅ g1 en transferencia se muestra el campo de comprobante
✅ g2 la nota del modal avisa que no hay firma
✅ g3 se emitió con forma_pago = transferencia
✅ g4 el comprobante quedó persistido
✅ g5 el cobrador también se registra en transferencia
✅ g6 en transferencia el recibo NO imprime el bloque de firma
✅ g7 imprime la nota de transferencia
✅ g8 imprime la referencia del comprobante
✅ g9 y el pie sigue siendo un bloque atómico
✅ g10 en efectivo sí imprimía firma (control de la comparación)
✅ R1 cleanup: fixtures borradas (liquidación, líneas y recibos de prueba)
✅ R2 cleanup: no quedan líneas huérfanas de la liquidación de prueba

✅ TODO OK — 53 checks
```

### 2.2 La primera corrida falló — y encontró 6 bugs, todos del probe

**Ningún fallo fue del código bajo prueba.** Los 18 fallos de la primera corrida se explican por
seis defectos del probe:

| # | bug | efecto |
|---|---|---|
| 1 | Los asserts de CSS leían también los **comentarios** del bloque `@media print`, que citan el bug viejo (`min-height:100vh`, `margin-top:auto`) | falso negativo en a1/a2 |
| 2 | a5 comparaba el **valor** de la propiedad contra un regex que esperaba la declaración entera | falso negativo |
| 3 | **El grave.** El recibo recién emitido se buscaba con `order('numero_recibo' desc).limit(1)`, y la 9999 tiene los recibos **9001/9002**, que ganan cualquier orden por número | invalidaba 12 asserts, y el cleanup intentaba borrar el 9002 |
| 4 | `closeModal` se inyectaba como stub vacío | "el modal nunca se cerraba" |
| 5 | El corte del pie llegaba hasta el final del string e incluía el encabezado de la **2ª copia** | h2 fallaba |
| 6 | h2 podía pasar **en vacío** | ver §3.3 |

El bug 3 tuvo consecuencia real sobre la base y se resolvió en el momento — está en §2.3.

Correcciones de fondo: el recibo nuevo se identifica por **diferencia de ids** (nunca por
`max(numero_recibo)`), `closeModal` se **extrae del archivo** como el resto de las funciones, y el
cleanup **suelta `recibo_id` antes** de borrar los recibos —el FK es `NO ACTION` y el `DELETE`
fallaba en silencio dejando basura—.

### 2.3 Lo que ensució la primera corrida, y cómo quedó

Por el bug 3, la primera corrida:

- intentó borrar el recibo **9002** del sandbox → **el FK lo salvó** (sus 2 líneas seguían
  apuntando), quedó intacto;
- **no** borró los recibos que sí había creado (#5 y #6), que quedaron sueltos con 0 líneas.

Se limpiaron a mano, con un `DELETE` acotado por número, por `cobrador_nombre` de prueba y por
"sin líneas":

```sql
DELETE FROM recibos
WHERE club_id='0649e9c5-…' AND numero_recibo IN (5,6)
  AND cobrador_nombre IN ('SERENO SIN APODERADO','TESORERIA')
  AND NOT EXISTS (SELECT 1 FROM liquidacion_detalle d WHERE d.recibo_id = recibos.id)
RETURNING numero_recibo, id, cobrador_nombre;
-- [{"numero_recibo":6,…,"cobrador_nombre":"TESORERIA"},
--  {"numero_recibo":5,…,"cobrador_nombre":"SERENO SIN APODERADO"}]
```

### 2.4 Confirmación del restore — la base quedó como estaba

Después de las 5 corridas (1 fallida + 2 sobre el fix + 2 mutantes):

```json
[{"lineas_9999":76,"liq_9999":10,"lineas_test":0,"recibos_prueba":0,
  "recibos_vivos":"1, 2, 3, 9001, 9002","huerfanas":0,"total_r8":"15321918.66"}]
```

| verificación | resultado |
|---|---|
| líneas de la 9999 | **76** — las mismas de antes (2+21+6+5+7+4+15+6+4+6) |
| liquidaciones de la 9999 | **10**, todas con `created_at` del **2026-06-10** — sandbox preexistente, ninguna de hoy |
| líneas `TEST %` | **0** |
| recibos de prueba (`SERENO SIN APODERADO` / `TESORERIA`) | **0** |
| recibos vivos | **1, 2, 3, 9001, 9002** — sin residuo |
| líneas huérfanas | **0** |
| total de R8 | **$15.321.918,66** — sin cambios |

**Sin liquidaciones ni líneas huérfanas en la 9999, y sin filas de recibos de prueba.** Lo único
que quedó movido es `club_secuencias.ultimo_numero`, que avanzó por los recibos quemados en las
corridas — a propósito, según lo decidido.

---

## 3. TAREA 3 — sensibilidad

### 3.1 Contra `main`: no prueba nada

```
$ cd <worktree de main> && node tests/probe_recibo_pie_cobrador.mjs
Error: no fn: function docBenef(tipo, id)
❌ EXCEPCIÓN en fase 'sandbox'  (no fn: function docBenef(tipo, id))
❌ 1 fallo(s) — 3 checks
```

**Es exactamente el caso que anticipaste.** El probe ni siquiera llega a correr: muere extrayendo
funciones que en `main` no existen. Es un **check de presencia**, no de comportamiento — dice "el
código nuevo no está", que ya sabíamos. **No sirve como prueba de sensibilidad.** De ahí el
mutation test.

### 3.2 Mutation test — dos mutantes, cada uno neutraliza una mitad del fix

Copia del árbol del fix con **una sola cosa** deshecha por vez, el resto en pie.

**M1 — se neutraliza el CSS del pie**: vuelve `min-height:100vh` + `flex` a `.recibo-copia`, se
quita `break-inside`/`page-break-inside` de `.recibo-pie`, se saca `margin:0` del `body`.

```
❌ a1 .recibo-copia ya NO declara min-height:100vh
❌ a3 .recibo-pie tiene break-inside: avoid
❌ a4 .recibo-pie tiene page-break-inside: avoid (legacy)
❌ a5 body resetea margin en impresión  (margin="null")
❌ 4 fallo(s) — 53 checks
```

**M2 — se neutraliza la estructura del pie**: el `<div class="recibo-pie">` deja de envolver total,
cobrador y firma; el contenido queda suelto en la copia.

```
❌ c4 hay 2 bloques .recibo-pie
❌ c5 el TOTAL está dentro del pie
❌ c6 "Retira" está dentro del pie
❌ c7 la FIRMA está dentro del pie (no suelta al final de la copia)
❌ c8 el pie imprime el nombre del cobrador que no era titular
❌ c9 el pie imprime el documento
❌ h2 y NO repite el nombre del titular en el pie  (pie=0b)
❌ g9 y el pie sigue siendo un bloque atómico
❌ 8 fallo(s) — 53 checks
```

**Caen exactamente los asserts que miden cada mitad, y sólo ésos.** Los 30+ checks del cobrador
(`d`, `e`, `f`, `g1`–`g8`) quedan **verdes en los dos mutantes**: las dos familias de asserts son
independientes y ninguna se apoya en la otra.

### 3.3 Un assert pasaba en vacío — corregido

En la primera pasada de M2, **h2 pasó en verde**: al no existir el pie, `primerPie()` devuelve `''`
y *"el pie no repite el nombre del titular"* es trivialmente cierto. Pasaba justo en el escenario
que tiene que detectar.

Corregido (`145c36c`): h2 exige pie **no vacío**. Re-corrido M2, ahora cae con `pie=0b`, y el probe
sigue en **53/53** sobre el fix.

Es el tipo de defecto que el mutation test existe para encontrar y que una corrida en verde jamás
habría mostrado.

### 3.4 Lo que el probe NO prueba — dicho sin disfraz

**El corte de página real no se puede asertar sin browser.** Chromium no corre en este Ubuntu
(`docs/SERVER.md`), así que **nadie midió una hoja**. Concretamente:

- **b1/b2/b3 no son mediciones.** Son **aritmética** sobre los valores de CSS parseados del
  archivo (`5,61mm` por fila, `87,6mm` de alto fijo, hoja útil A4 de `267mm`). Dan el orden de
  magnitud —el recibo de 6 líneas usa el 45% de la hoja, con muchísimo margen— pero las métricas
  reales de fuente y el `line-height` del motor pueden mover algunos milímetros. **Si el fix
  fallara por 3mm, el probe seguiría en verde.**
- **a1–a6 y c4–c7 prueban que las reglas y la estructura correctas están en el archivo**, no que
  Chrome las respete al imprimir.
- **Nada verifica que el PDF salgan 2 páginas y no 4.** Eso es §4.

El probe cubre el mecanismo; el resultado impreso lo tiene que ver un humano una vez.

---

## 4. TAREA 4 — verificación visual, para Valeria

**Caso a reproducir** (el que reportó Fede): un **entrenador** con **3 incentivos de $10.000** más
un **3°**, un **4°** y un **5° puesto** — **6 líneas**.

En Dolores ese caso es **LORENA SOLEDAD VARELA** en R8: Carrera 1 3° ($12.200), Carrera 2 4°
($10.500), Carrera 7 5° ($10.000) y 3 incentivos de $10.000. Total **$62.700**. Como R8 ya está
saldada, para reproducirlo hay que usar un beneficiario con 6 líneas pagables, o la reunión de
prueba 9999.

### Preparación

1. Abrir `liquidaciones.html` → pestaña **Pagos**.
2. Buscar el beneficiario y tocar **🧾 Pagar**.
3. Dejar tildadas **las 6 líneas**. Tocar **🧾 Emitir recibo**.
4. En el modal: elegir quién cobra, completar nombre y documento, **Efectivo**, y
   **Emitir e imprimir**.
5. En el diálogo de impresión: **Destino "Guardar como PDF"**, **A4**, **márgenes por defecto**,
   **sin "Gráficos de fondo"**.

### Los 6 puntos a mirar

| # | qué mirar | ✅ bien | ❌ mal — avisar |
|---|---|---|---|
| **1** | **Cantidad de hojas** | El PDF tiene **2 páginas** | 4 páginas, o 3 |
| **2** | **El pie con las líneas** | En **cada** hoja, *Firma / Aclaración / DNI* está **debajo de la tabla, en la misma hoja** | La firma aparece sola arriba de la hoja siguiente |
| **3** | **Rótulos** | **ORIGINAL** en la hoja 1, **DUPLICADO** en la hoja 2 | Una hoja en blanco entre medio, o los dos rótulos en la misma hoja |
| **4** | **Datos del pie** | Se lee **"A nombre de: \<entrenador\>"** arriba, y en el pie **"Retira: \<nombre\> — Doc. \<número\>"**. Si cobra el titular dice **"Retira: el titular"** sin repetir el nombre | Falta el "Retira", o el nombre del titular aparece dos veces |
| **5** | **Las 6 líneas** | Las **6** están, con fecha, carrera, caballo, puesto, rol y monto. Total **$62.700** | Falta alguna línea, o el total no cierra |
| **6** | **El logo** | El logo del hipódromo se ve nítido y alineado con el nombre del club | Pixelado, deformado o pisando el texto |

### Dos pruebas extra, si hay tiempo

7. **Recibo de 1 línea**: tiene que dar **2 páginas**, sin hoja en blanco al final.
8. **Transferencia**: elegir *Transferencia* en el modal. El recibo **no** tiene que traer el
   espacio de firma, sino la leyenda *"Forma de pago: TRANSFERENCIA — no requiere firma; se adjunta
   el comprobante."*

### Si algo falla

Guardar el PDF y anotar **cuál de los 6 puntos** falló. Con el número alcanza para ubicar la causa:
1 y 3 son el corte entre copias, 2 es el `break-inside` del pie, 4 es el bloque del cobrador, 5 es
la selección de líneas y 6 es el tamaño del logo.

---

## 5. Estado y gate

| branch | contenido | estado |
|---|---|---|
| `fix/recibo-pie-cobrador` | fix del pie + cobrador (`a23c0cc`, `8a19800`) + probe (`70116e2`, `1f148a1`, `145c36c`) | pusheada · **probe 53/53** · sin mergear |
| `chore/issues-recibos` | ISSUE-056 + ISSUE-057 | pusheada · sin mergear |
| `reports` | este informe + los 3 anteriores | pusheada |

**No se mergeó nada.** El merge queda condicionado a que alguien imprima un recibo y confirme los
6 puntos del §4 — en particular el **1** (2 hojas, no 4) y el **2** (el pie con las líneas), que
son literalmente lo que reportó Fede.

## 6. Preguntas abiertas

1. **`probe_cobros_v11.mjs` está roto** — apunta a R5, que hoy tiene 0 carreras. No se tocó.
   ¿Se lo mueve a la 9999 en el mismo movimiento, o va aparte?
2. **¿Por qué R5 quedó vacía?** Era la reunión de testing designada en `CLAUDE.md` ("11 turnos,
   ~81 inscripciones"). Hoy no tiene ni una carrera. Si se borró a propósito, conviene actualizar
   `CLAUDE.md`; si no, alguien perdió datos de prueba.
3. **El probe quema números de recibo** en cada corrida (van 5 corridas). Está aceptado, pero si
   se corre en CI seguido, el correlativo de Dolores va a escalar rápido.
4. **La verificación visual del §4** sigue pendiente — es el único bloqueante para mergear.
