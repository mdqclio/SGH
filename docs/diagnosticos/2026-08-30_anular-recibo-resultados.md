# ISSUE-056 — `anular_recibo`: resultados de los pasos 1-4 (SIN MERGEAR)

- **Fecha**: 2026-08-30
- **Rama**: `feat/anular-recibo` (desde `main` = `cbeeee8`)
- **Estado**: migración **aplicada en producción**; probe y mutation test **corridos**;
  **UI no construida todavía**; **merge NO hecho** — espera OK.
- **Plan**: `docs/diagnosticos/2026-08-30_anular-recibo-plan.md`

## Guards

```
$ pwd
/home/clio/dev/SGH

$ git rev-parse --abbrev-ref HEAD ; git rev-parse HEAD
main
cbeeee82478ff41b4228a6f817f1f8f179ff862d

$ git status --porcelain
(vacío)
```

```sql
SELECT count(*) AS spcs_count FROM spcs;
```
```json
[{"spcs_count":181}]
```

---

## Paso 1 — migración aplicada

`migrations/anular_recibo_v1.sql`, aplicada como **`anular_recibo_v1`**. Incluye el agregado que
pediste: **`lineas_anuladas jsonb`**.

```sql
ALTER TABLE recibos
  ADD COLUMN IF NOT EXISTS anulado_por      uuid REFERENCES usuarios(id),
  ADD COLUMN IF NOT EXISTS motivo_anulacion text,
  ADD COLUMN IF NOT EXISTS lineas_anuladas  jsonb;
```

El jsonb se escribe **antes** de soltar el `recibo_id`, como pediste:

```sql
  -- 1: fotografiar las líneas ANTES de soltarlas
  SELECT COALESCE(jsonb_agg(d.id ORDER BY d.id), '[]'::jsonb) INTO v_lineas
    FROM liquidacion_detalle d WHERE d.recibo_id = p_recibo_id;

  IF jsonb_array_length(v_lineas) = 0 THEN
    RAISE EXCEPTION 'anular_recibo: el recibo % no tiene líneas asociadas — no se anula un recibo vacío', …
  END IF;
```

Y se agregó un guard que no estaba en el plan: **la foto y lo efectivamente soltado tienen que
coincidir**. Si difieren, aborta. Un jsonb que miente sobre qué contenía el recibo es peor que no
tenerlo.

```sql
  IF v_liberadas <> jsonb_array_length(v_lineas) THEN
    RAISE EXCEPTION 'anular_recibo: se soltaron % línea(s) pero el recibo % tenía % — se aborta', …
  END IF;
```

La regla del punto 2 quedó con **tu** argumento en el comentario del SQL, no con el mío:

```sql
--      NO siempre es 'impago': si `fecha_liberacion` es futura, la línea vuelve a
--      'retenido'. La retención por anti-doping es una restricción reglamentaria, no
--      una comodidad del flujo — devolver a 'impago' una línea con liberación futura
--      haría que el sistema declare pagable plata que el reglamento retiene.
```

---

## Paso 2 — probe contra `anular_recibo` real: **29/29**

`tests/probe_anular_recibo.mjs`, sin overrides (`rpc=anular_recibo`).

```
── Probe ISSUE-056 · anular_recibo ──
   html=/home/clio/dev/SGH/liquidaciones.html  rpc=anular_recibo
 ✅ P1) anulación exitosa: el RPC no falla  → recibo 2
 ✅ P1b) la línea volvió a impago, sin recibo y sin pagado_at  → {"estado_linea":"impago","recibo_id":null,"pagado_at":null,"fecha_liberacion":null}
 ✅ P2) línea con fecha_liberacion FUTURA vuelve a retenido, no a impago  → {"estado_linea":"retenido","recibo_id":null,"fecha_liberacion":"2026-09-09"}
 ✅ P2b) [caso inverso] fecha_liberacion PASADA vuelve a impago (el CASE no retiene todo)  → {"estado_linea":"impago","fecha_liberacion":"2026-08-20"}
 ✅ P3) el correlativo NO se devuelve: club_secuencias quedó donde estaba  → antes=2 después=4
 ✅ P3b) el recibo siguiente saca un número MAYOR al anulado (no lo recicla)  → anulado=2 siguiente=5
 ✅ P4) el recibo quedó con estado anulado, anulado_at y motivo  → {"estado":"anulado","at":"2026-08-30T02:58:51Z","m":"probe 056 — caso simple"}
 ✅ P4b) y NO se borró: la fila existe y conserva su numero_recibo  → numero=2
 ✅ P4c) el conteo total de recibos no bajó (anular no es borrar)  → antes=6 después=9
 ✅ P4d) lineas_anuladas guardó los ids EXACTOS que tenía el recibo  → ["7ac27405-5a2c-4dcf-88c7-1ecbbab14d62"]
 ✅ P4e) con 2 líneas guarda las DOS, no sólo la primera  → ["65c849c7-…","d6300ba4-…"]
 ✅ P4f) el jsonb permite reconstruir el recibo: las líneas existen y ya no lo apuntan  → 2 línea(s) reconstruidas
 ✅ P5) anular dos veces falla con mensaje claro  → anular_recibo: el recibo 2 ya fue anulado el 2026-08-30 — no se anula dos veces
 ✅ P5b) y la segunda llamada no pisó el anulado_at ni el motivo de la primera
 ✅ P6) un usuario del club B NO puede anular un recibo del club A  → anular_recibo: el recibo 31 es de otro club
 ✅ P6b) y nada cambió: el recibo sigue emitido y su línea sigue pagada  → {"rec":"emitido","lin":"pagado"}
 ✅ P7) pasados los 5 días, el rol que emite NO puede anular  → anular_recibo: el recibo 7 se emitió el 2026-08-24 (hace más de 5 días) — sólo un super_admin puede anularlo
 ✅ P7b) [caso inverso] pasados los 5 días, un super_admin SÍ puede  → anulado por super_admin
 ✅ P7c) [caso inverso] dentro de los 5 días el rol que emite SÍ pudo (P1)
 ✅ P8) motivo NULL, vacío y sólo-espacios: los tres rechazados  → [true,true,true]
 ✅ P8b) y el recibo sigue emitido tras los tres intentos
 ✅ P9) anulado_por = usuarios.id de la sesión (no NULL, no auth.uid())  → anulado_por=deafe6d4-… usuarios.id=deafe6d4-… auth.uid=747b2819-…
 ✅ P10) bajo service_role anulado_por queda NULL (no inventa autor)  → estado=anulado anulado_por=null
 ✅ P11) tras anular, la línea vuelve a estar entre lo cobrable y suma al total (efecto de negocio)  → total=1028888 incluye_simple=true
 ✅ P11b) y el detalle la trae tildada de nuevo  → 3 línea(s) en el detalle
 ✅ R1) restore por estado: las líneas de los dos clubes quedaron como estaban  → A: sin diferencias | B: sin diferencias
 ✅ R2) y no hubo que restaurar nada a mano (el probe no ensució fuera de sus fixtures)  → 0 línea(s) restauradas
 ✅ R3) no quedó ningún recibo del probe, en NINGÚN club (foto sin filtro de club_id)  → []
 ✅ R4) no quedaron líneas TEST ISSUE-056 en la base  → []

29/29 OK
```

### El P11 arrancó en rojo — y el error era del assert, no del producto

Primera corrida: **28/29**, con P11 en rojo y P11b en verde. El assert original comparaba
`htmlB.includes(String(M_SIMPLE))`, o sea daba por hecho que la tarjeta del buscador muestra el monto
de **cada línea**. No: muestra el **total pagable del beneficiario**, y BENEF_B tenía varias líneas.

Corregido para que mida lo que dice medir: calcula el total esperado desde la base y verifica **las
dos cosas** — que la línea recién desanulada esté entre las pagables **y** que el total renderizado
sea el que la incluye.

```javascript
const delClubB = (pagables || []).filter(l => l.liquidaciones?.club_id === CLUB_B);
const totalEsperado = delClubB.reduce((a, l) => a + Number(l.monto_neto), 0);
ok('P11) …', delClubB.some(l => l.id === detSimple.id) && htmlB.includes(String(totalEsperado)), …);
```

Se anota porque es el tipo de rojo que tienta a aflojar: P11b ya estaba en verde y decía casi lo
mismo. Aflojarlo habría dejado el assert de efecto de negocio sin medir el total.

---

## Paso 3 — mutation test: **7 mutantes, 7 matan sus asserts**

Con el patrón de función sombra de ISSUE-059, pero generadas **server-side desde
`pg_get_functiondef`** de la función ya aplicada — así el mutante no puede divergir del original por
una diferencia de tipeo. Con un guard previo: si alguna ancla no matchea, aborta antes de crear
sombras idénticas al original (una sombra idéntica daría verde y se leería como "el assert no sirve").

```
SELECT proname, (pg_get_functiondef(oid) = replace(original, …)) AS identica_al_original
 → las 7 en false
```

| Mutante | Qué se neutraliza | Asserts que mueren | Esperado |
|---|---|---|---|
| `mut1` | Guard de club | **P6, P6b** | P6 ✅ |
| `mut2` | Ventana de 5 días | **P7, P7b** | P7 ✅ (ver nota) |
| `mut3` | Idempotencia | **P5** | P5 ✅ (ver nota) |
| `mut4` | Motivo obligatorio | **P8, P8b** | P8 ✅ |
| `mut5` | `CASE` → siempre `'impago'` | **P2**, y **NO** P1 ni P2b | ✅ exacto |
| `mut6` | `anulado_por = auth.uid()` | **11 asserts + excepción** | ✅ (ver nota) |
| `mut7` | No guarda el jsonb | **P4d, P4e** | ✅ exacto |

**`mut5` es el más limpio**: mata P2 y **deja P1 y P2b en verde**. Es la prueba de que el `CASE`
discrimina de verdad, en vez de retener todo o no retener nada.

### Tres notas donde el resultado no fue el literal esperado

**`mut2` mata también P7b**, y no es señal extra: al neutralizar la ventana, P7 **sí anula** el
recibo, así que cuando P7b lo intenta como super_admin ya está anulado y falla por idempotencia. Es
una cascada del test, no un segundo hallazgo. El guard que se está midiendo es el de P7.

**`mut3` mata P5 pero deja P5b en verde**, y la razón es interesante: aun sin el guard de
idempotencia, la segunda anulación **igual falla** — porque después de la primera **ninguna línea
apunta ya al recibo**, así que `jsonb_array_length(v_lineas) = 0` y salta el guard de "recibo vacío".
O sea: **hay dos barreras independientes contra la doble anulación**. P5 muere porque el mensaje deja
de ser el correcto (`ya fue anulado`), no porque se anule dos veces. El guard de idempotencia es el
que da el mensaje claro; el de recibo vacío es defensa en profundidad. Vale escribirlo así y no
como "mut3 permitió anular dos veces", que sería falso.

**`mut6` no mata un assert: rompe la función entera** — 11 asserts en rojo y excepción en P7, con
sólo 21 de 29 llegando a correr. Es exactamente el punto de GOTCHA #79: `anulado_por = auth.uid()`
**viola la FK** a `usuarios(id)`, así que no hay anulación posible. Si el probe hubiera asserteado
`anulado_por IS NOT NULL` en vez de comparar contra `usuarios.id`, este mutante habría pasado
inadvertido en cualquier base donde los dos ids coincidieran.

**Sombras dropeadas y verificado que no queda ninguna** (el 29/08 quedó una huérfana de `mut2`):

```sql
SELECT proname FROM pg_proc WHERE proname LIKE '%mut%' OR proname LIKE '%shadow%';
 → []
```

---

## Paso 4 — regresión: cero regresiones nuevas

```
probe_aislamiento_club_cobros      27/27 OK
probe_recibos_emision              ❌ 3 fallo(s) — 14 checks     (3 previos)
probe_cobros_v11                   ❌ 1 fallo(s) — 2 checks      (1 previo)
probe_recibo_pie_cobrador          ✅ TODO OK — 56 checks
probe_reunion_es_prueba            17/17 OK
```

Todos en su línea base. Ni uno más.

---

## Tu punto 4 — qué probe corre el correlativo de Dolores

Relevado. **Los 5 probes que emiten recibos:**

| Probe | Club contra el que emite | ¿Restaura `club_secuencias`? |
|---|---|---|
| `probe_aislamiento_club_cobros` | **B (Mi Club Hípico)** | ✅ sí |
| `probe_anular_recibo` (nuevo) | **B (Mi Club Hípico)** | ✅ sí |
| `probe_recibos_emision` | A (Dolores) | ✅ sí |
| `probe_cobros_v11` | A (Dolores) | ✅ sí |
| **`probe_recibo_pie_cobrador`** | **A (Dolores)** | ❌ **NO — a propósito** |

**El drift viene de uno solo**, y está documentado en su propio código:

```javascript
// tests/probe_recibo_pie_cobrador.mjs:175-177
// club_secuencias NO se snapshotea ni se restaura: los números de recibo son ilimitados y
// quemar algunos en pruebas no es problema (decisión del usuario, 2026-08-28). El probe deja
// el correlativo adelantado en 2, a propósito.
```

**+2 por corrida.** Es la explicación completa de los 30 con 3 recibos vivos. Los otros dos que
emiten contra Dolores sí restauran en el `finally`.

El probe nuevo emite contra **Mi Club Hípico** y además restaura, o sea que no agrega drift.

**Arreglo sugerido, para la entrega aparte que dijiste**: mover `probe_recibo_pie_cobrador` al club B
como ya hacen los dos de aislamiento. No alcanza con agregarle el restore: emitir contra Dolores
también deja recibos reales en el club del cliente durante la corrida, y en el club B eso es
inocuo. Anotado como ISSUE-066.

---

## Estado de la base al cierre

| | |
|---|---|
| `recibos` | 5 (sin cambios) |
| `liquidacion_detalle` | 493 (sin cambios) |
| Líneas con club distinto al de su recibo | 0 |
| Fixtures de probe colgadas | 0 |
| Funciones sombra | 0 |
| Recibos en estado `anulado` | 0 (los del probe se limpiaron) |

---

## Lo que falta y por qué está frenado

- **Paso 5 — UI opción A + merge**: no hecho. La secuencia dice UI y después merge, pero pediste ver
  el paso 2 y el mutation test antes de mergear, así que se frena acá. La UI es el botón "Anular
  recibo" en el bloque post-emisión de `liquidaciones.html`, con motivo obligatorio y confirmación
  que nombre número e importe.
- **Paso 6 — md5 + re-corrida contra el HTML servido**: depende del merge.

**El RPC ya está vivo en producción.** Si mañana hace falta anular un recibo, se puede hacer por MCP
con una llamada, sin SQL a mano. La UI es para que lo haga Valeria sola.

---

## Preguntas abiertas

1. **ISSUE-065 (`recibos_delete`)** queda anotado como issue con el razonamiento que pediste, para
   migración aparte. Mientras la policy exista, `anular_recibo` es opcional.
2. **ISSUE-066** (nuevo): `probe_recibo_pie_cobrador` emite contra Dolores sin restaurar. Entrega
   aparte, como dijiste.
3. **La UI no puede encontrar un recibo que no esté en pantalla.** La opción A cubre el caso real (el
   #4 se detectó al instante), pero un recibo de ayer sólo se puede anular por MCP hasta que exista
   la vista de historial. Es la consecuencia conocida de dejarla fuera de alcance — se anota para que
   no sorprenda.
