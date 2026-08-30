# Historial de recibos — implementado, con anular_recibo v2

**Fecha:** 2026-08-30
**Rama:** `feat/historial-recibos` — HEAD `616ab9d62f6d48e418d1f204aaa2c47e80bb82a7`, pusheada, **sin mergear**
**Base:** `main` `2821c7c223a00d6f9bb53c8ea389a145f0efb424`
**Rama de este informe:** `reports`
**Plan aprobado:** `docs/diagnosticos/2026-08-30_plan-historial-recibos.md`

---

## Guards verificados

```
$ pwd
/home/clio/dev/SGH
```

```sql
SELECT count(*) AS spcs_count FROM spcs;
```
```json
[{"spcs_count":181}]
```

```
ref del proyecto: unlhcuanfrtpatoipwve
```

---

# 0. TL;DR

| | |
|---|---|
| Probe nuevo | `tests/probe_historial_recibos.mjs` — **39/39** |
| Mutantes | **17/17 · 15 mueren + 2 equivalentes declarados · 0 sobrevivientes · 0 errores de arnés** |
| RPC | `anular_recibo` **v2 aplicada**: `lineas_anuladas` pasa de ids a FOTO de las filas |
| Ventana | Se aprovechó: había **0 recibos anulados**, así que no hubo una sola fila que migrar |
| Seeds 9001/9002 | Corregidos — `total_premios` 0 → 170.000 y 700.000 |
| Bug latente cerrado | `imprimirReciboCobro` ignoraba `lineaIds`: reimprimir un anulado salía **con el cuerpo vacío** |
| Regresión encontrada y arreglada | **4 probes** rotos desde el merge del filtro (`2821c7c`), no detectada entonces |
| Fallas preexistentes, NO mías | 3 probes (`recibos_emision`, `cobros_v11`, `pagos_rol_carrera`) — mismas fallas contra el HTML de `main` |
| ISSUE-066 | Anotado: `switchTab` mapea por posición; refactor a `data-tab` pendiente |
| Mergeado | **No.** Espera tu OK |

---

# 1. EL CAMBIO DE ALCANCE: `anular_recibo` v2

## La ventana, verificada antes de tocar

```sql
SELECT count(*) AS recibos_total,
       count(*) FILTER (WHERE estado='anulado') AS anulados,
       count(*) FILTER (WHERE lineas_anuladas IS NOT NULL) AS con_lineas_anuladas
FROM recibos;
```
```json
[{"recibos_total":5,"anulados":0,"con_lineas_anuladas":0}]
```

Cero filas con el formato viejo. **Ni una sola fila que migrar ni que quede a medias.** Tenías
razón en que era ahora: en cuanto se anule el primer recibo con `jsonb_agg(d.id)`, esa fila
queda con sólo ids para siempre — el monto del momento no se recupera de ningún lado, porque
`liquidacion_detalle` no tiene trigger de auditoría.

## Qué cambió: una línea

```sql
-- ANTES (v1)
SELECT COALESCE(jsonb_agg(d.id ORDER BY d.id), '[]'::jsonb) INTO v_lineas
  FROM liquidacion_detalle d WHERE d.recibo_id = p_recibo_id;

-- AHORA (v2)
SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.id), '[]'::jsonb) INTO v_lineas
  FROM liquidacion_detalle d WHERE d.recibo_id = p_recibo_id;
```

`to_jsonb(d)` captura la fila **entera**, incluida la columna GENERATED `monto_neto` (GOTCHA #9:
no se puede escribir, sí leer) y cualquier columna que se agregue después. Es literalmente "las
filas completas" sin mantener una lista de campos que se desactualice.

**Todo lo demás quedó igual**: mismo orden (fotografiar ANTES de soltar), mismos guards de club
y de 5 días, misma idempotencia, mismo `CASE` de retenido, mismo "el número no vuelve", misma
firma y mismo `RETURNS recibos`.

Migración versionada: `migrations/anular_recibo_v2_snapshot.sql`. Aplicada por MCP
`apply_migration` con nombre `anular_recibo_v2_snapshot`.

## Verificación de que quedó aplicada

```sql
SELECT position('to_jsonb(d)' in pg_get_functiondef(p.oid)) > 0 AS tiene_snapshot,
       position('jsonb_agg(d.id' in pg_get_functiondef(p.oid)) > 0 AS tiene_formato_viejo
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='anular_recibo';
```
```json
[{"tiene_snapshot":true,"tiene_formato_viejo":false}]
```

## Y que la foto es de verdad una foto — assert del probe, contra un anulado real

```
 ✅ A4) anular_recibo v2 guardó la FOTO de las filas (objetos con monto_neto), no sólo los ids  → tipo=object campos=20
 ✅ A4b) y las líneas quedaron con recibo_id NULL (por eso el detalle no puede usar recibo_id)  → [null,null,null]
 ✅ A4c) idsLineasAnuladas entiende el formato v2 y devuelve los 3 ids de la foto  → ["037b4641-9618-462c-addd-07980879a7d3","2897c462-1602-4836-8058-1b79375fc03f","e2e0f5cc-6c1b-42b6-bde3-f9bfccf58dce"]
 ✅ A4d) y sigue entendiendo el formato v1 (array de ids sueltos), que es el fallback  → ["037b4641-9618-462c-addd-07980879a7d3","2897c462-1602-4836-8058-1b79375fc03f","e2e0f5cc-6c1b-42b6-bde3-f9bfccf58dce"]
```

El campo `campos=20` es la fila completa de `liquidacion_detalle`. La foto guarda además el
`recibo_id` y el `estado_linea` que la línea tenía **al momento de anularse** (`pagado`), que es
justamente lo que se pierde al soltarla.

## Compatibilidad con el formato viejo — implementada aunque hoy no haga falta

```javascript
// Normaliza `recibos.lineas_anuladas` a una lista de ids, entienda el formato que entienda.
//   · v1 (hasta 2026-08-30): array de strings  → ["uuid", "uuid"]
//   · v2 (desde 2026-08-30): array de objetos  → [{id, concepto, monto_neto, …}, …]
// El fallback a v1 se mantiene aunque hoy NO exista una sola fila con el formato viejo: el código
// de lectura no puede depender de un conteo que cambia, y un backup anterior a la migración tiene
// que seguir leyéndose.
function idsLineasAnuladas(rec){
  return (rec?.lineas_anuladas || []).map(l => (typeof l === 'string' ? l : l?.id)).filter(Boolean);
}
```

El detalle elige el camino sin mirar ningún flag de versión — el dato se describe solo:

```javascript
async function recLineasDeRecibo(rec){
  if (rec.estado === 'anulado' && esFotoAnulado(rec)) return { lineas: rec.lineas_anuladas, foto: true };
  // … v1: .in("id", idsLineasAnuladas(rec))   ·   emitido: .eq("recibo_id", rec.id)
}
```

Y cuando cae en la rama v1, **el detalle lo dice en pantalla**:

> ⚠ Este recibo se anuló antes de que el sistema guardara la foto de las líneas: los importes se
> reconstruyen desde la liquidación y pueden no coincidir con el papel si la reunión se recalculó
> después.

---

# 2. LA VISTA

## Dónde vive: solapa propia

```
💰 Liquidaciones   🧾 Pagos   📄 Recibos   📊 Resumen   ⚙️ Config. Comisiones
```

El argumento decisivo, ya en el plan: los paneles son `display:none`, así que **cambiar de
solapa no desmonta el DOM**. Valeria puede estar pagándole a alguien —con el detalle abierto, el
filtro por concepto puesto y líneas destildadas a mano—, tocar *Recibos* para responder "¿este ya
cobró?", y volver a *Pagos* encontrando **todo exactamente como lo dejó**. Dentro de Pagos habría
que sostener a mano que `cobBenef`, `cobLineas`, `cobFiltro` y `cobUltimoRecibo` no se pisen
entre dos flujos que el operador alterna con gente esperando.

## La búsqueda — y una corrección sobre el plan

El plan decía: numérico → buscar el número **y** el DNI, siempre. Al correr el probe la primera
vez, `N1` falló:

```
 ❌ N1) buscar un número exacto trae ese recibo y sólo ese  → 2 resultado(s): [3,2]
```

Buscar `3` traía el recibo #3 **más todos los recibos de cualquiera cuyo DNI contuviera un 3**.
Es el diseño del plan funcionando y siendo malo: lo contrario de lo que pidió Fede.

El arreglo va en el código, no en el assert:

```javascript
// PERO no cuando es corto: un DNI tiene 7 u 8 dígitos y un N° de recibo arranca en 1, así que
// un numérico de menos de 6 dígitos es inequívocamente un número de recibo. Buscar además por
// documento traería todos los recibos de cualquiera cuyo DNI CONTENGA ese dígito — tipear "3"
// devolvía el recibo #3 más media lista, que es justo lo contrario de lo que pidió Fede.
const esNumero = /^\\d+$/.test(q);
const soloNumero = esNumero && q.length < 6;
```

Con eso: `3` → el recibo 3 y nada más. `30123456` → el recibo 30123456 (si existe) **y** el
titular de ese DNI. Assert nuevo `N1c` para que no vuelva.

## Cobrador: fue fácil, como dije

Dos columnas de texto de la propia tabla → dos términos más en el mismo `.or()`. Cero joins,
cero consultas extra:

```javascript
if (!soloNumero) {
  terminos.push(`cobrador_nombre.ilike.*${q}*`);
  terminos.push(`cobrador_documento.ilike.*${q}*`);
}
```

Y la sanitización, que sí era necesaria: el `.or()` de PostgREST usa coma y paréntesis como
sintaxis, así que un apellido tipeado como "Pérez, Juan (h)" partía la expresión.

```javascript
function recSanitizar(q){ return String(q ?? '').replace(/[,()*\\]/g, ' ').trim(); }
```

## El aviso en pantalla sobre la búsqueda por cobrador

Dijiste que le avisás a Fede. Además quedó escrito en la propia solapa, para que no dependa de
que alguien se acuerde:

> La búsqueda por quien retiró sólo encuentra recibos emitidos desde el 28/08 — antes de esa
> fecha no se registraba.

## Los anulados

En la lista van **en orden cronológico, atenuados pero no escondidos** — un anulado que hay que
ir a buscar a otra pestaña es un anulado que no se encuentra cuando hace falta. En el detalle,
el bloque con motivo, quién y cuándo, resolviendo `anulado_por` contra `usuarios.nombre_completo`
(GOTCHA #79: FK a `usuarios`, no a `auth.users`; GOTCHA #3: `nombre_completo`, no `nombre`).

---

# 3. EL BUG DE LA REIMPRESIÓN, CERRADO

`imprimirReciboCobro` recibía `lineaIds` en la firma desde el principio y **no lo usaba**:
releía siempre por `.eq('recibo_id', recibo.id)`, que para un anulado es `NULL`. Reimprimir un
anulado salía con encabezado, total y firma correctos, y **la tabla de líneas vacía**.

```javascript
  const base = sb.from(\x27liquidacion_detalle\x27).select(\x27…\x27);
  let lns = opts?.lineas || null, eLns = null;
  if (!lns) ({ data: lns, error: eLns } = lineaIds?.length
    ? await base.in(\x27id\x27, lineaIds)
    : await base.eq(\x27recibo_id\x27, recibo.id));
```

`opts.lineas` corta antes todavía: el historial ya resolvió las filas —para un anulado salen de
la **foto**, que no está en la tabla— y no hay por qué volver a buscarlas.

**No cambia el comportamiento de las dos llamadas existentes**: para un recibo recién emitido,
`.in('id', cobEmitirIds)` y `.eq('recibo_id', id)` devuelven el mismo conjunto. Y deja el `.eq`
como respaldo.

## El assert tuvo que cambiar de nivel — y ahí apareció un agujero real

La primera versión del probe **stubbeaba** `imprimirReciboCobro` para espiar qué se le mandaba
(`I2`). El mutante que reintroduce el bug **sobrevivió**:

```
❌ M13 SOBREVIVE — EL OTRO GRANDE: imprimirReciboCobro vuelve a ignorar lineaIds y opts.lineas  [esperaba matar I2]
```

Obvio en retrospectiva: **el bug vive adentro de la función, y el probe nunca la corría.** `I2`
prueba que el llamador manda bien los ids, que es otra cosa.

Se agregó `I4`, que corre la función **real** extraída del HTML —con `window.print` y
`precargarLogo` stubbeados— y cuenta las filas del impreso:

```
 ✅ I1) reimprimir un EMITIDO manda sus líneas correctas  → ["6f3b6152-8714-4bf0-857e-05a5e4f3c3f3","faaf24ec-3cba-413f-8b87-23f0680fc1b6"]
 ✅ I2) reimprimir un ANULADO manda SUS líneas, no un array vacío  → 3 id(s), opts.lineas=3
 ✅ I3) antes de imprimir se repone cobBenef con el beneficiario del recibo  → {"tipo":"profesional","id":"21dc62f8-5da6-4319-95c6-0146e3ae7245","nombre":"Gaitán, Alfredo"}
 ✅ I4) la impresión REAL de un anulado sale con sus 3 líneas, no con el cuerpo vacío  → 8 <tr> en el impreso (2 copias × 3 líneas = 6 mínimo)
```

8 `<tr>` = 2 copias (ORIGINAL + DUPLICADO) × (1 encabezado + 3 líneas). Con el bug serían 2.

---

# 4. AISLAMIENTO POR CLUB — y el mutante que destapó cuál capa trabajaba

Dos capas, como pedía ISSUE-060: `.eq('club_id', CLUB_ID)` en toda consulta a `recibos` (la RLS
empieza con `fn_is_super_admin() OR …`, o sea que **no acota al rol que usa el club-switcher**), y
`cobDelClub` sobre las líneas del detalle.

En la primera tanda de mutantes, **M1 y M2 sobrevivieron los dos**:

```
❌ M1 SOBREVIVE — la búsqueda no acota por club (se saca el .eq(club_id))  [esperaba matar C1,C1b]
❌ M2 SOBREVIVE — el cinturón de club del post-filtro se afloja  [esperaba matar C1c]
```

Cada capa tapaba a la otra: sacar el `.eq` lo compensaba el post-filtro, y sacar el post-filtro
no se notaba porque el `.eq` ya no dejaba pasar nada. Los asserts miraban **el estado final**, y
el estado final es correcto con cualquiera de las dos. **La protección estaba bien; el test no
distinguía quién la sostenía.**

Se resolvió exponiendo un contador y asserteando la capa del servidor por separado:

```javascript
  // El contador NO es cosmético: con el .eq puesto tiene que dar SIEMPRE 0, porque el servidor no
  // devuelve nada ajeno. Que deje de dar 0 significa que el aislamiento se está sosteniendo del
  // lado del cliente — sigue sin filtrarse plata, pero la primera línea de defensa se rompió y hay
  // que enterarse. Es lo único que distingue "el servidor filtra" de "el cliente tapa".
  recAjenosDescartados = ajenos;
```

Con `C1d`, M1 muere. Y **M2 quedó declarado equivalente**: con el `.eq` puesto, el post-filtro es
la identidad y ningún test puede distinguirlo. Se deja igual — es la red que atrapa un camino de
consulta futuro que olvide el `.eq`.

```
 ✅ C1) ningún recibo de otro club aparece en el listado  → 3 listados · 5 de Dolores, ninguno presente
 ✅ C1b) buscar por número un recibo que existe en el OTRO club no lo trae  → buscando #3 → 1 resultado(s), ninguno de Dolores
 ✅ C1d) el filtro de club actúa en el SERVIDOR: el cliente no tuvo que descartar ninguna fila  → 0 fila(s) ajenas llegaron al cliente
 ✅ C1c) y todo lo que quedó en recResultados es del club propio  → ["a6da7e40"]
 ✅ C2) una línea de OTRO club no entra en el detalle (cobDelClub)  → linea ajena aadf38e6 — 2 en el detalle
```

---

# 5. LOS SEEDS 9001 / 9002

Estado antes:

```json
[{"numero_recibo":9001,"neto_actual":"0.00","total_premios":"0.00","suma_lineas":"170000.00","n_lineas":2},
 {"numero_recibo":9002,"neto_actual":"0.00","total_premios":"0.00","suma_lineas":"700000.00","n_lineas":2}]
```

**`neto_a_cobrar` no se puede escribir: es GENERATED (GOTCHA #9).** El primer intento devolvió:

```
ERROR: 428C9: column "neto_a_cobrar" can only be updated to DEFAULT
DETAIL: Column "neto_a_cobrar" is a generated column.
```

Su expresión es `((total_premios - total_descuentos) - COALESCE(retencion_dgi, 0))`, así que
corrigiendo los dos totales queda bien **por definición** — mejor que escribirla a mano, porque
además garantiza que el recibo cierre internamente.

Se corrigieron los dos totales, no sólo el neto: el impreso muestra "Total premios / Descuentos /
NETO A COBRAR", y arreglar sólo el neto dejaría un papel que dice "Total premios: $0" arriba de
"NETO A COBRAR: $170.000" — parecería un error de cálculo en vez de un dato viejo.

Los valores se **derivan de las propias líneas**, así que el UPDATE es idempotente y no puede
meter un número inventado. Resultado:

```json
[{"numero_recibo":9001,"total_premios":"170000.00","total_descuentos":"0.00","neto_a_cobrar":"170000.00"},
 {"numero_recibo":9002,"total_premios":"700000.00","total_descuentos":"0.00","neto_a_cobrar":"700000.00"}]
```

**No se borraron**, como pediste: son el bucket pagado del que depende el Resumen.
Migración versionada: `migrations/fix_seeds_recibos_9001_9002.sql`.

---

# 6. EL PROBE — salida cruda completa

```
$ set -a; . ./.env; set +a
$ node tests/probe_historial_recibos.mjs

── Probe · historial de recibos ──
   html=/home/clio/dev/SGH/liquidaciones.html
 ✅ A4) anular_recibo v2 guardó la FOTO de las filas (objetos con monto_neto), no sólo los ids  → tipo=object campos=20
 ✅ A4b) y las líneas quedaron con recibo_id NULL (por eso el detalle no puede usar recibo_id)  → [null,null,null]
 ✅ A4c) idsLineasAnuladas entiende el formato v2 y devuelve los 3 ids de la foto  → ["037b4641-9618-462c-addd-07980879a7d3","2897c462-1602-4836-8058-1b79375fc03f","e2e0f5cc-6c1b-42b6-bde3-f9bfccf58dce"]
 ✅ A4d) y sigue entendiendo el formato v1 (array de ids sueltos), que es el fallback  → ["037b4641-9618-462c-addd-07980879a7d3","2897c462-1602-4836-8058-1b79375fc03f","e2e0f5cc-6c1b-42b6-bde3-f9bfccf58dce"]
 ✅ N1) buscar un número exacto trae ese recibo y SÓLO ese  → 1 resultado(s): [2]
 ✅ N1c) y un número corto no arrastra a nadie por tener ese dígito en el documento  → [2]
 ✅ N1b) un número inexistente no trae nada y no rompe  → 0 resultado(s)
 ✅ N2) un término numérico también busca por documento del cobrador  → 3 resultado(s) para doc=94982637
 ✅ P1) búsqueda por apellido del beneficiario trae sus recibos  → "Labanca" → 1 resultado(s)
 ✅ P1b) y el beneficiario de cada resultado matchea el término buscado  → ["Labanca"]
 ✅ P1c) búsqueda por nombre de un PROPIETARIO trae su recibo (la otra columna de beneficiario)  → "Leonardo" → 1 resultado(s)
 ✅ P2) búsqueda por NOMBRE de quien retiró trae el recibo  → 3 resultado(s)
 ✅ P2b) búsqueda por DOCUMENTO de quien retiró trae el recibo  → doc=94982637
 ✅ P3) un término con coma y paréntesis no rompe el .or() (sanitización)  → 0 resultado(s), sin error
 ✅ P4) un término que no matchea a nadie no arma un in.() vacío ni tira error  → []
 ✅ D1) el detalle de un emitido trae exactamente sus líneas  → ["6f3b6152-8714-4bf0-857e-05a5e4f3c3f3","faaf24ec-3cba-413f-8b87-23f0680fc1b6"]
 ✅ D1b) y cada línea trae las 7 celdas, con el rol resuelto  → <td>Profesional</td>
 ✅ D2) el total de las líneas coincide con el neto del recibo  → lineas=33000 neto=33000
 ✅ A1) un recibo anulado aparece en la lista, marcado como tal  → [["80624503","anulado"]]
 ✅ A1b) el filtro "Anulados" lo trae y el filtro "Emitidos" NO  → anulados=1 emitidos=2
 ✅ A2) el detalle del anulado muestra motivo, quién anuló y cuándo  → ⛔ ANULADO el 30/8/2026 06:53 p. m.
 ✅ A3) sus líneas se reconstruyen: mismo conjunto de ids que tenía antes de anular  → 3 línea(s)
 ✅ A3b) el detalle sale de la FOTO: pisar el monto en la tabla NO cambia lo que muestra  → original=33000 pisado=1234.56
 ✅ C1) ningún recibo de otro club aparece en el listado  → 3 listados · 5 de Dolores, ninguno presente
 ✅ C1b) buscar por número un recibo que existe en el OTRO club no lo trae  → buscando #3 → 1 resultado(s), ninguno de Dolores
 ✅ C1d) el filtro de club actúa en el SERVIDOR: el cliente no tuvo que descartar ninguna fila  → 0 fila(s) ajenas llegaron al cliente
 ✅ C1c) y todo lo que quedó en recResultados es del club propio  → ["a6da7e40"]
 ✅ C2) una línea de OTRO club no entra en el detalle (cobDelClub)  → linea ajena aadf38e6 — 2 en el detalle
 ✅ I1) reimprimir un EMITIDO manda sus líneas correctas  → ["6f3b6152-8714-4bf0-857e-05a5e4f3c3f3","faaf24ec-3cba-413f-8b87-23f0680fc1b6"]
 ✅ I2) reimprimir un ANULADO manda SUS líneas, no un array vacío  → 3 id(s), opts.lineas=3
 ✅ I3) antes de imprimir se repone cobBenef con el beneficiario del recibo  → {"tipo":"profesional","id":"21dc62f8-5da6-4319-95c6-0146e3ae7245","nombre":"Gaitán, Alfredo"}
 ✅ I4) la impresión REAL de un anulado sale con sus 3 líneas, no con el cuerpo vacío  → 8 <tr> en el impreso (2 copias × 3 líneas = 6 mínimo)
 ✅ G1) el mini-DOM TIRA ante un selector desconocido (si devolviera [] daría falso verde)  → selDesconocido=.rec-row[data-x="1"]
 ✅ R1) restore por ESTADO: las líneas quedaron como estaban  → sin diferencias
 ✅ R2) y no hubo que restaurar nada a mano  → 0 línea(s)
 ✅ R3) no quedó ningún recibo del probe, en NINGÚN club  → []
 ✅ R4) no quedaron líneas del probe en la base  → []
 ✅ R6) no quedó la reunión fixture en el club ajeno  → 0 reunión(es) en San Francisco
 ✅ R5) club_secuencias de los dos clubes devuelto a donde estaba  → 0649e9c5: 32→32 · a6da7e40: 1→1

39/39 OK
```

## Dos decisiones de diseño del probe que vale la pena señalar

**1. El anulado se fabrica con los RPC reales.** No se inserta una fila con `estado='anulado'` y
un jsonb armado a mano. Si el probe fabricara el jsonb, probaría la vista contra **su propia
suposición** sobre la forma de ese campo — y la forma de ese campo es de lo que depende todo.
Con `emitir_recibo` + `anular_recibo` de verdad, si mañana el formato cambia, el probe se entera.

**2. El "otro club" del listado son los recibos reales de Dolores.** El probe corre con
`CLUB_ID = CLUB_B`, así que los 5 de Dolores ya son de otro club: el assert de aislamiento corre
contra datos de verdad **sin escribir una sola fila en el club del cliente**. Para `C2` (que sí
necesita plantar una línea ajena) se usa **San Francisco**, que está vacío — el club más seguro
donde escribir. La reunión fixture se marca `es_prueba` y se borra en el `finally`, con `R6`
verificándolo.

---

# 7. MUTANTES — 4 tandas, salida cruda

## Tanda 1 (M1–M5) — segunda corrida, después de arreglar C1d y P1c

```

═══ MUTATION TESTING · 5/17 mutantes (tanda: M1,M2,M3,M4,M5) ═══
(copias en /tmp/mut-historial-recibos-5ozcNB — el repo no se toca)

✅ M1 muere — la búsqueda no acota por club (se saca el .eq(club_id))  [esperaba matar C1d; murieron C1d]
✅ M2 EQUIVALENTE (sobrevive por diseño) — el cinturón de club del post-filtro se afloja
     ↳ con el .eq(club_id) del servidor puesto, `filas` nunca trae una fila ajena y el post-filtro es la identidad — ningún test puede distinguir las dos versiones
✅ M3 muere — el detalle no filtra las líneas con cobDelClub  [esperaba matar C2; murieron C2]
✅ M4 muere — el modo número usa ilike en vez de igualdad exacta  [esperaba matar N1; murieron N1]
✅ M5 muere — la búsqueda por persona ignora propietario_id  [esperaba matar P1c; murieron P1c]

✅ TANDA LIMPIA — 5 probados · 5 muertos o equivalentes · 1 equivalente(s)

```

## Tanda 2 (M6–M10) — segunda corrida

```

═══ MUTATION TESTING · 5/17 mutantes (tanda: M6,M7,M8,M9,M10) ═══
(copias en /tmp/mut-historial-recibos-NzOcZb — el repo no se toca)

✅ M6 muere — se saca el término de cobrador del .or()  [esperaba matar P2,P2b; murieron P2,P2b]
✅ M7 muere — no se sanitiza q antes de interpolarlo en el .or()  [esperaba matar P3; murieron P3]
✅ M8 EQUIVALENTE (sobrevive por diseño) — se arma in.() aunque la lista de ids esté vacía
     ↳ PostgREST tolera in.() vacío (0 filas, sin error) y NO anula los demás términos del .or() — medido; el guard es defensivo y ningún test puede distinguirlo
✅ M9 muere — EL GRANDE: el detalle del anulado ignora la foto y vuelve a la tabla  [esperaba matar A3b; murieron A3b]
✅ M10 muere — los anulados se excluyen del listado  [esperaba matar A1; murieron A1]

✅ TANDA LIMPIA — 5 probados · 5 muertos o equivalentes · 1 equivalente(s)

```

## Tanda 3 (M11–M15) — segunda corrida, después de agregar I4 y A4c

```

═══ MUTATION TESTING · 5/17 mutantes (tanda: M11,M12,M13,M14,M15) ═══
(copias en /tmp/mut-historial-recibos-Dbaoa2 — el repo no se toca)

✅ M11 muere — el filtro de estado no se aplica  [esperaba matar A1b; murieron A1b]
✅ M12 muere — el bloque de anulación pierde el motivo  [esperaba matar A2; murieron A2]
✅ M13 muere — EL OTRO GRANDE: imprimirReciboCobro vuelve a ignorar lineaIds y opts.lineas  [esperaba matar I4; murieron I4]
✅ M14 muere — reimprimir no repone cobBenef  [esperaba matar I3; murieron I3]
✅ M15 muere — idsLineasAnuladas no entiende el formato v2 (foto)  [esperaba matar A4c; murieron A4c]

✅ TANDA LIMPIA — 5 probados · 5 muertos o equivalentes

```

## Tanda 4 (M16–M17)

```

═══ MUTATION TESTING · 2/17 mutantes (tanda: M16,M17) ═══
(copias en /tmp/mut-historial-recibos-W0VFcb — el repo no se toca)

✅ M16 muere — el detalle pierde la columna Rol  [esperaba matar D1b; murieron D1b]
✅ M17 muere — el mini-DOM devuelve [] ante selector desconocido en vez de tirar  [esperaba matar G1; murieron G1]

✅ TANDA LIMPIA — 2 probados · 2 muertos o equivalentes

```

## Los cuatro sobrevivientes del camino, y qué se hizo con cada uno

| Mutante | Por qué sobrevivía | Resolución |
|---|---|---|
| **M1** | el post-filtro del cliente tapaba la falta del `.eq` | assert nuevo `C1d` sobre el contador `recAjenosDescartados` → **muere** |
| **M2** | con el `.eq` puesto, el post-filtro es la identidad | **equivalente declarado** — se deja la red |
| **M5** | no había ninguna fixture con beneficiario **propietario** | fixture nueva + assert `P1c` → **muere** |
| **M8** | `in.()` vacío **no rompe** PostgREST (ver abajo) | **equivalente declarado** |
| **M13** | el probe **stubbeaba** la función que contiene el bug | assert nuevo `I4` que corre la función real → **muere** |
| **M15** | `A4` miraba la DB directo, no pasaba por la función | asserts `A4c`/`A4d` usando la función **extraída** → **muere** |

## Corrección a una afirmación del plan

El plan decía: *"PostgREST rompe con un `in.()` vacío"*. **Es falso.** Lo afirmé sin medirlo.
Medido contra la base:

```
sólo el número (control)           → [1]
in.() vacío ANTES del número       → [1]
in.() vacío DESPUÉS del número     → [1]
dos in.() vacíos + número          → [1]
```

`in.()` devuelve 0 filas sin error **y no anula los demás términos del `.or()`**. El guard
`if (profIds.length)` es defensivo, no load-bearing. Se deja igual —la tolerancia de PostgREST a
`in.()` no es contractual y el guard documenta la intención— y M8 queda declarado equivalente
con la medición como prueba, para que el runner avise si esa tolerancia cambia.

## Otro ajuste de honestidad: `mata` de M9

M9 (el detalle del anulado ignora la foto) mataba `A3b` pero no `A3`. Correcto: **`A3` compara el
conjunto de ids, y los ids son los mismos vengan de la foto o de la tabla** (las filas siguen
existiendo). El único assert que distingue foto de reconstrucción es `A3b`, que pisa el monto en
la tabla y exige que el detalle no se entere. Se corrigió `mata` a `['A3b']`.

---

# 8. REGRESIÓN ENCONTRADA — 4 probes rotos desde el merge del filtro

**Esto no lo rompí yo hoy: lo rompió el merge `2821c7c` de ayer y no se detectó.** Lo encontré
al correr la regresión de esta entrega.

El merge del filtro cambió la firma `cobrosDetalle(tipo, id)` → `cobrosDetalle(tipo, id, opts = {})`.
Cuatro probes anclaban en la firma vieja:

```
$ grep -n "async function cobrosDetalle" tests/*.mjs
tests/probe_aislamiento_club_cobros.mjs:213:      extractFn(HTML, 'async function cobrosDetalle(tipo, id)'),
tests/probe_anular_recibo_ui.mjs:196:      extractFn(HTML, 'async function cobrosDetalle(tipo, id)'),
tests/probe_anular_recibo.mjs:361:      extractFn(HTML, 'async function cobrosDetalle(tipo, id)'),
tests/probe_reunion_es_prueba.mjs:158:      extractFn(HTML, 'async function cobrosDetalle(tipo, id)'),
```

Fallaban con `EXCEPCIÓN … no encontré: async function cobrosDetalle(tipo, id)`. Y encima, al
arreglar el ancla, aparecían tres capas más de lo mismo:

1. **El `extractFn` naïve** arrancaba el balance de llaves en el primer `{` después del ancla —
   que con `opts = {}` es el de la lista de parámetros. Devolvía la firma truncada.
2. **Faltaba extraer los helpers nuevos** que `cobrosDetalle` llama: `cobrosGruposPresentes`,
   `grupoDeTipo`, `rotuloGrupo`, `cobChecked`, `cobrosFiltrar`, `cobrosRenderChips`,
   `cobrosTildarVisibles`, `cobrosRenderAvisoOculto`, `cobrosRecalc`.
3. **Faltaba el estado**: `cobFiltro`, `GRUPO_DE_TIPO_COB`, `ORDEN_GRUPOS_COB`, y `escapeHtml` en
   `probe_reunion_es_prueba` (el render del concepto ahora escapa).

Los cuatro quedaron arreglados y verdes:

| Probe | Antes | Ahora |
|---|---|---|
| `probe_anular_recibo` | ❌ 24/28 | ✅ **31/31** |
| `probe_anular_recibo_ui` | ❌ excepción | ✅ **26/26** |
| `probe_aislamiento_club_cobros` | ❌ excepción | ✅ **27/27** |
| `probe_reunion_es_prueba` | ❌ excepción | ✅ **17/17** |

`probe_anular_recibo` además ganó dos asserts nuevos sobre la foto (`P4d2`, `P4g`) y sus
`P4d`/`P4e`/`P4f` se actualizaron al formato v2.

**Lección de método**: el merge de ayer se dio por bueno con `probe_filtro_concepto_pagos` en
32/32 y `probe_anular_recibo_ui` en 26/26 — pero ese 26/26 se midió **antes** del merge. Cambiar
la firma de una función que otros probes extraen por ancla los rompe a todos, y el síntoma
(`no encontré`) aparece como excepción del probe, no como assert en rojo. Candidato a GOTCHA;
no lo escribí para no ampliar el alcance sin avisar.

---

# 9. LO QUE FALLA Y **NO** ES MÍO

Tres probes de la familia Pagos fallan. Verifiqué que fallan **igual** contra el
`liquidaciones.html` de `main` sin mis cambios:

```
$ cp liquidaciones.html $SP/mio_liq.html
$ git checkout 2821c7c -- liquidaciones.html      # working tree = main
probe_recibos_emision (HTML de main) → exit=1 · fallas=4
probe_cobros_v11 (HTML de main) → exit=1 · fallas=2
probe_pagos_rol_carrera (HTML de main) → exit=1 · fallas=3
$ cp $SP/mio_liq.html liquidaciones.html          # restaurado
fa8cf1cdd8bc6e0af92ff3f64eed400d  liquidaciones.html
fa8cf1cdd8bc6e0af92ff3f64eed400d  …/mio_liq.html
```

Con mis cambios: 4, 2 y 3 fallas. **Idénticas.** Son preexistentes:

| Probe | Falla | Naturaleza |
|---|---|---|
| `probe_recibos_emision` | `b2 L1/L2 → pagado` obtuvo `["pagado","retenido"]` | dato: una línea tiene `fecha_liberacion` futura |
| `probe_cobros_v11` | `R5 necesita ≥2 carreras con inscripciones` | precondición de datos |
| `probe_pagos_rol_carrera` | 3 asserts | **ISSUE-063**, ya documentado |

No los arreglé: son datos de fixture, no código, y arreglarlos es otra tanda con su propio
criterio. Quedan señalados.

## Lo que sí corrí y quedó verde

```
probe_historial_recibos      → 39/39 OK
probe_filtro_concepto_pagos  → 32/32 OK
probe_anular_recibo          → 31/31 OK
probe_anular_recibo_ui       → 26/26 OK
probe_aislamiento_club_cobros→ 27/27 OK
probe_reunion_es_prueba      → 17/17 OK
probe_recibo_rol             → exit 0
probe_recibo_pie_cobrador    → exit 0
probe_cobros_caballeriza     → exit 0
```

---

# 10. TUS RESPUESTAS, APLICADAS

| # | Decisión | Qué se hizo |
|---|---|---|
| 1 | No se agrega columna de impreso | No se agregó. La solapa responde "¿ya cobró?" con el badge EMITIDO/ANULADO, la fecha y hora, y quién retiró. Nada finge saber si salió el papel |
| 3 | Le avisás a Fede lo del cobrador | Además quedó escrito en la propia solapa, para que no dependa de que alguien se acuerde |
| 4 | Corregir los seeds, no borrarlos | Corregidos vía `total_premios`/`total_descuentos` (el neto es GENERATED). No se borraron |
| 5 | 50 y 100 | `.limit(50)` en el listado por defecto, `.limit(100)` en búsqueda |
| 6 | Mínimo + anotar el refactor | Se agregó `'recibos'` al array y **ISSUE-066** con el arreglo escrito y el motivo de no hacerlo ahora |
| — | El snapshot, adelantado | `anular_recibo` v2 aplicada. Ventana verificada en 0 filas antes de tocar |

---

# 11. ARCHIVOS

| Archivo | Qué |
|---|---|
| `liquidaciones.html` | solapa + panel + 12 funciones nuevas + fix de `imprimirReciboCobro` + `idsLineasAnuladas` en `cobrosAnularConfirmar` + CSS |
| `migrations/anular_recibo_v2_snapshot.sql` | RPC v2, **aplicada** |
| `migrations/fix_seeds_recibos_9001_9002.sql` | seeds, **aplicada** |
| `tests/probe_historial_recibos.mjs` | probe nuevo, 39 asserts, 17 mutantes |
| `tests/probe_anular_recibo.mjs` | formato v2 + 2 asserts nuevos + arreglo de la regresión |
| `tests/probe_anular_recibo_ui.mjs` | arreglo de la regresión |
| `tests/probe_aislamiento_club_cobros.mjs` | arreglo de la regresión |
| `tests/probe_reunion_es_prueba.mjs` | arreglo de la regresión |
| `docs/ISSUES.md` | ISSUE-066 |

**No se tocó**: `emitir_recibo`, la lógica de anulación (sólo el formato del jsonb),
exportación, sello ANULADO en la reimpresión, prefijos A1/A2.

---

# 12. PREGUNTAS ABIERTAS

1. **El sello ANULADO en la reimpresión sigue sin estar** (queda como posterior, tal cual
   pediste). Ahora que reimprimir un anulado **funciona de verdad**, el riesgo es concreto: sale
   un papel idéntico al original de un recibo que ya no vale. ¿Lo subimos de prioridad?
2. **La regresión de los 4 probes** sugiere un GOTCHA sobre cambiar firmas que otros probes
   anclan. No lo escribí para no ampliar alcance sin avisar. ¿Va?
3. **Los 3 probes preexistentes en rojo** (`recibos_emision`, `cobros_v11`, `pagos_rol_carrera`)
   son fixtures de datos, no código. ¿Los ordenamos en una tanda propia antes del 20/09?
4. **Verificación en browser**: no se vio renderizado. Chromium no corre acá (`docs/SERVER.md`).
   Los chips, el bloque de anulación y la tabla están verificados por estructura y comportamiento,
   no por layout.

---

# 13. GATE

`feat/historial-recibos` está pusheada y **sin mergear**, esperando tu OK.

Las dos migraciones **sí están aplicadas en producción** — un RPC y dos filas de seeds no pueden
esperar al merge sin dejar el código de la rama probando contra un schema que no existe. Las dos
son compatibles hacia atrás con el `main` actual: `anular_recibo` v2 mantiene firma y semántica,
y el `liquidaciones.html` de `main` lee `lineas_anuladas` sólo en `cobrosAnularConfirmar` para
contar retenidas.

⚠️ **Con una salvedad que conviene tener presente**: si el merge se demora y alguien anula un
recibo desde el `main` actual, ese `.in('id', ids)` va a recibir objetos en vez de strings y **el
aviso de cuántas líneas volvieron a retenidas va a fallar**. No pierde plata —la anulación ya
ocurrió del lado del RPC y las líneas vuelven bien— pero el toast sale mal. Es un argumento para
mergear pronto, o para que yo suba sólo ese fix a `main` si preferís esperar.

---

# 14. VERIFICACIÓN DE PUBLICACIÓN

Se completa abajo con la salida real.
