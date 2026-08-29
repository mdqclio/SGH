# ISSUE-059 / ISSUE-060 / ISSUE-057 — aislamiento entre clubes en el circuito de cobro

**Fecha**: 2026-08-29
**Rama del trabajo**: `fix/aislamiento-club-cobros` — commit `09ddb5b`, empujada a origin
**Base**: `main` @ `25ee690` (merge ISSUE-063)
**Estado**: **PLAN — NADA APLICADO.** La migración no se corrió sobre `emitir_recibo`. La rama no
está mergeada. Ver *Verificación pre-merge sin tocar producción* para cómo se validó igual.

## Guards verificados

```
$ pwd
/home/clio/dev/SGH

$ git rev-parse --abbrev-ref HEAD ; git log --oneline -1
main
25ee690 merge: ISSUE-063 (probe_pagos_rol_carrera sin datos para 2 asserts)

$ git status --porcelain
(vacío)
```

```sql
SELECT count(*) AS spcs_count FROM spcs;
```
```json
[{"spcs_count":181}]
```

```sql
SELECT current_database() AS db, inet_server_addr()::text AS host;
```
```json
[{"db":"postgres","host":"2600:1f1e:dbb:f601:2df:7db3:b77:7ff0/128"}]
```
Proyecto: `unlhcuanfrtpatoipwve` (el MCP de la sesión apunta ahí; `get_project_url` de la config).

Los tres dan. Se sigue.

---

## 1. Qué se encontró antes de escribir una línea

### 1.1 `emitir_recibo` v1.1 — el texto vivo en prod

```sql
SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='emitir_recibo';
```

```sql
CREATE OR REPLACE FUNCTION public.emitir_recibo(p_club_id uuid, p_beneficiario_tipo beneficiario_tipo,
  p_beneficiario_id uuid, p_linea_ids uuid[], p_forma_pago forma_pago_recibo, p_cobrador_nombre text,
  p_cobrador_documento text, p_comprobante_url text DEFAULT NULL::text)
 RETURNS recibos LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_num int; v_recibo recibos; v_marcadas int; v_bruto numeric; v_desc numeric;
BEGIN
  IF p_linea_ids IS NULL OR array_length(p_linea_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'emitir_recibo: sin líneas';
  END IF;

  v_num := fn_siguiente_recibo(p_club_id);

  INSERT INTO recibos (club_id, numero_recibo, beneficiario_tipo, profesional_id, propietario_id,
    forma_pago, cobrador_nombre, cobrador_documento, comprobante_url, estado)
  VALUES (p_club_id, v_num, p_beneficiario_tipo,
    CASE WHEN p_beneficiario_tipo = 'profesional' THEN p_beneficiario_id END,
    CASE WHEN p_beneficiario_tipo = 'propietario' THEN p_beneficiario_id END,
    p_forma_pago, p_cobrador_nombre, p_cobrador_documento, p_comprobante_url, 'emitido')
  RETURNING * INTO v_recibo;

  UPDATE liquidacion_detalle d
     SET estado_linea = 'pagado', recibo_id = v_recibo.id, pagado_at = now()
   WHERE d.id = ANY(p_linea_ids)
     AND d.beneficiario_id = p_beneficiario_id
     AND d.recibo_id IS NULL
     AND d.estado_linea = 'impago';
  GET DIAGNOSTICS v_marcadas = ROW_COUNT;
  ...
```

**La palabra `club` aparece exactamente dos veces en toda la función: `p_club_id` como parámetro de
entrada y `club_id` como columna del INSERT.** No hay una sola comparación. Confirma la lectura del
28/08: el recibo fantasma no fue un caso raro, fue el comportamiento normal del código.

### 1.2 Caminos de escritura de `emitir_recibo` (lo que se pidió verificar)

Son cuatro, en este orden:

| # | Escritura | ¿Necesita el candado? |
|---|---|---|
| 1 | `fn_siguiente_recibo(p_club_id)` → INSERT/UPDATE en `club_secuencias` | **Sí, indirectamente**: no escribe líneas, pero **consume numeración del club antes de validar nada**. En v1.1 el número se gastaba y recién después se podía fallar. Con `RAISE EXCEPTION` la transacción revierte y el contador vuelve, así que no dejaba hueco — pero validar primero es lo correcto y es lo que se hace en v1.2. |
| 2 | `INSERT INTO recibos` | Hereda `p_club_id` sin verificar contra nada. Es el que fabricó el recibo fantasma. |
| 3 | `UPDATE liquidacion_detalle` | **Es el que hay que cerrar.** Filtra por `id`, `beneficiario_id`, `recibo_id IS NULL`, `estado_linea` — nada de club. |
| 4 | `UPDATE recibos SET total_premios/...` | Deriva de `WHERE recibo_id = v_recibo.id`, o sea del resultado de (3). Seguro por construcción una vez cerrado (3). |

No hay otros caminos: la función no llama a nada más que escriba.

### 1.3 Control cruzado en TODA la base

```sql
SELECT r.id AS recibo_id, r.numero_recibo, r.club_id AS recibo_club, r.estado, r.emitido_at,
       l.club_id AS liq_club, count(*) AS lineas
FROM recibos r
JOIN liquidacion_detalle d ON d.recibo_id = r.id
JOIN liquidaciones l ON l.id = d.liquidacion_id
GROUP BY r.id, r.numero_recibo, r.club_id, r.estado, r.emitido_at, l.club_id
ORDER BY r.emitido_at;
```
```json
[{"recibo_id":"e9000000-…-9002","numero_recibo":9002,"recibo_club":"0649e9c5…","liq_club":"0649e9c5…","lineas":2},
 {"recibo_id":"e9000000-…-9001","numero_recibo":9001,"recibo_club":"0649e9c5…","liq_club":"0649e9c5…","lineas":2},
 {"recibo_id":"77774e4d-…","numero_recibo":1,"recibo_club":"0649e9c5…","liq_club":"0649e9c5…","lineas":1},
 {"recibo_id":"b2966769-…","numero_recibo":2,"recibo_club":"0649e9c5…","liq_club":"0649e9c5…","lineas":1},
 {"recibo_id":"003b04c6-…","numero_recibo":3,"recibo_club":"0649e9c5…","liq_club":"0649e9c5…","lineas":2}]
```

Cada recibo agrupa contra **un solo** `liq_club`, y en los cinco casos coincide con `recibo_club`.

Tres controles más, por si el cruce se escondía en otra dimensión:

```sql
SELECT (SELECT count(*) FROM recibos r JOIN liquidacion_detalle d ON d.recibo_id=r.id
        WHERE d.beneficiario_tipo::text IS DISTINCT FROM r.beneficiario_tipo::text) AS tipo_mismatch,
       (SELECT count(*) FROM recibos r JOIN liquidacion_detalle d ON d.recibo_id=r.id
        WHERE d.beneficiario_id IS DISTINCT FROM COALESCE(r.profesional_id, r.propietario_id)) AS benef_mismatch,
       (SELECT count(*) FROM liquidacion_detalle d JOIN liquidaciones l ON l.id=d.liquidacion_id
        LEFT JOIN reuniones re ON re.id=d.reunion_id
        WHERE re.id IS NOT NULL AND re.club_id <> l.club_id) AS reunion_club_mismatch,
       (SELECT count(*) FROM recibos r WHERE NOT EXISTS
        (SELECT 1 FROM liquidacion_detalle d WHERE d.recibo_id=r.id)) AS recibos_huerfanos;
```
```json
[{"tipo_mismatch":0,"benef_mismatch":0,"reunion_club_mismatch":0,"recibos_huerfanos":0}]
```

**Respuesta a la pregunta**: **no queda ningún recibo con `recibos.club_id <> liquidaciones.club_id`
además del que se revirtió.** Tampoco hay recibos sin líneas, ni reuniones cuyo club no coincida con
el de su liquidación, ni recibos cuyo beneficiario difiera del de sus líneas. El daño histórico fue
uno solo y ya está revertido.

### 1.4 El terreno

```sql
SELECT c.id, c.nombre,
  (SELECT count(*) FROM liquidaciones l WHERE l.club_id=c.id) AS liqs,
  (SELECT count(*) FROM liquidacion_detalle d JOIN liquidaciones l ON l.id=d.liquidacion_id
   WHERE l.club_id=c.id) AS lineas,
  (SELECT count(*) FROM reuniones r WHERE r.club_id=c.id) AS reuniones,
  (SELECT count(*) FROM recibos r WHERE r.club_id=c.id) AS recibos
FROM clubs c ORDER BY c.nombre;
```
```json
[{"nombre":"Hipódromo de Dolores","id":"0649e9c5-9e87-4aad-842f-101458e6b33c","liqs":189,"lineas":493,"reuniones":13,"recibos":5},
 {"nombre":"Jockey Club San Francisco - Hipodromo Oscar C. Boero","id":"710d43c1-…","liqs":0,"lineas":0,"reuniones":0,"recibos":0},
 {"nombre":"Mi Club Hípico","id":"a6da7e40-1515-45dc-8933-4eef33ce937a","liqs":0,"lineas":0,"reuniones":1,"recibos":0}]
```

Confirma el punto de la consigna: hoy sólo Dolores tiene plata, y por eso el agujero no se nota.
Mi Club Hípico tiene 1 reunión, 11 profesionales activos y 7 propietarios — alcanza para plantar
fixtures de un segundo club real y probar multi-tenancy de verdad.

Otros datos que condicionan el diseño:

```sql
SELECT 'liq_det_reunion_null' t, count(*) n FROM liquidacion_detalle WHERE reunion_id IS NULL
UNION ALL SELECT 'recibos', count(*) FROM recibos
UNION ALL SELECT 'recibos_emitido_por_null', count(*) FROM recibos WHERE emitido_por IS NULL;
```
```json
[{"t":"liq_det_reunion_null","n":0},{"t":"recibos","n":5},{"t":"recibos_emitido_por_null","n":5}]
```

**5 de 5 recibos con `emitido_por` NULL** — ISSUE-057 nunca funcionó, ni una vez.

Y el dato que decide cómo se escribe ISSUE-057:

```sql
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid='public.recibos'::regclass AND contype='f';
```
```
recibos_emitido_por_fkey   FOREIGN KEY (emitido_por) REFERENCES usuarios(id)
```

**La FK es a `usuarios(id)`, NO a `auth.users`.** `emitido_por = auth.uid()` habría violado la FK en
el primer intento. Hay que resolver `usuarios.id` desde `auth_user_id`.

---

## 2. ISSUE-059 — el candado en el RPC

Archivo: **`migrations/emitir_recibo_v1_2_aislamiento_club.sql`** (rollback:
`migrations/rollback_emitir_recibo_v1_2.sql`, que es la v1.1 copiada literal de
`pg_get_functiondef`, no reescrita de memoria).

### 2.1 Dos guards, no uno

```sql
  -- guard 1: el club del que llama
  IF fn_get_user_club_id() IS NOT NULL AND NOT fn_is_super_admin()
     AND p_club_id IS DISTINCT FROM fn_get_user_club_id() THEN
    RAISE EXCEPTION 'emitir_recibo: no se puede emitir un recibo de otro club'
      USING ERRCODE = '42501';
  END IF;

  -- guard 2: las líneas son del MISMO club que el recibo
  SELECT count(*) INTO v_ajenas
    FROM liquidacion_detalle d
    JOIN liquidaciones l ON l.id = d.liquidacion_id
   WHERE d.id = ANY(p_linea_ids)
     AND l.club_id IS DISTINCT FROM p_club_id;

  IF v_ajenas > 0 THEN
    RAISE EXCEPTION 'emitir_recibo: % de % línea(s) pertenecen a otro club — el recibo no se emite',
      v_ajenas, array_length(p_linea_ids, 1) USING ERRCODE = '42501';
  END IF;
```

**Por qué el guard 2 no usa `fn_get_user_club_id()`**: el super_admin opera legítimamente cualquier
club vía club-switcher (`CLUB_ID` sale de `localStorage.sgh_selected_club_id`, ver
`liquidaciones.html:438`). Atar la validación a la sesión rompería el switcher. La invariante que
importa no es *quién sos* sino **que el recibo y sus líneas sean del mismo club**, y eso se puede
comprobar sin mirar la sesión. Por eso el guard 2 corre **siempre**, también bajo `service_role`.

**Por qué además hay un guard 1**: sin él, un secretario de un club puede emitir un recibo perfecto y
coherente… del otro hipódromo. El patrón (`IS NOT NULL` + `NOT fn_is_super_admin()`) es literalmente
el de `liberar_linea`, ya vivo en prod:

```sql
  IF fn_get_user_club_id() IS NOT NULL AND NOT fn_is_super_admin()
     AND v_club IS DISTINCT FROM fn_get_user_club_id() THEN
    RAISE EXCEPTION 'liberar_linea: línea de otro club';
```

### 2.2 Desviación respecto de lo pedido: no es sólo un `AND EXISTS`

La consigna decía "el `AND EXISTS` que ya identificaste". Se implementó **el `AND EXISTS` más un
pre-chequeo que aborta**. La razón:

> `AND EXISTS` solo, dentro del `UPDATE`, **descarta las líneas ajenas en silencio**. Si el array
> trae 3 líneas propias y 1 ajena, `v_marcadas = 3 > 0` → **el recibo se emite igual, con una línea
> menos**, sin error, y el operador imprime un recibo por menos plata de la que tildó.

El pre-chequeo hace la operación **todo o nada** y dice cuántas líneas y por qué. El `AND EXISTS`
queda como red ante una condición de carrera (que la liquidación cambie de club entre el chequeo y
el UPDATE). El assert 2 del probe mide exactamente este caso (mezcla propia+ajena).

### 2.3 Extra: `beneficiario_tipo` en el UPDATE

v1.1 comparaba sólo `beneficiario_id`. Un mismo UUID podría existir como `profesionales.id` y como
`propietarios.id` (son tablas distintas, no hay nada que lo impida). Se agregó
`AND d.beneficiario_tipo = p_beneficiario_tipo`. Verificado que no rompe nada existente:
`tipo_mismatch = 0` sobre las 493 líneas (query en §1.3).

### 2.4 Orden: validar antes de consumir numeración

En v1.2 los dos guards van **antes** de `fn_siguiente_recibo(p_club_id)`.

---

## 3. ISSUE-060 — el filtro en `cobrosBuscar`

### 3.1 Camino elegido: EMBED + filtro en JS

`liquidacion_detalle` no tiene `club_id`; cuelga de `liquidaciones.club_id`. Tres caminos posibles:

| Camino | Round-trips | NULL-safe | Descartado por |
|---|---|---|---|
| `liquidaciones!inner(club_id)` + `.eq('liquidaciones.club_id', X)` | 1 | **No** | `!inner` es INNER JOIN: las filas se caen **en silencio, del lado del servidor**. Es la misma razón por la que se descartó en ISSUE-055, agravada: acá el front no puede ni contar lo que se cayó. |
| Dos pasos: `SELECT id FROM liquidaciones WHERE club_id=X` → `.in('liquidacion_id', ids)` | 2 | Sí | Hoy son **189 UUIDs** en la query string, en cada tecla del buscador (que está debounceado a 300 ms pero igual dispara). Y crece con la vida del club. |
| **EMBED sin `!inner` + filtro en JS** ✅ | 1 | Sí | — |

```javascript
function cobDelClub(l){ return l?.liquidaciones?.club_id === CLUB_ID; }
```

El embed sin `!inner` es un **LEFT JOIN**: si el padre no vuelve (RLS de otro club, o dato roto), el
campo queda `undefined` y la línea **no se muestra**. **Falla cerrada**, que es lo que corresponde
cuando el riesgo es mostrar plata ajena — al revés que `cobVisible`, donde fallar cerrado escondería
plata legítima.

Beneficio lateral: el embed también es defensa en profundidad. La RLS de `liquidaciones` ya oculta
las de otro club a un usuario de club (`liquidaciones_select`: `fn_is_super_admin() OR (fn_is_staff()
AND club_id = fn_get_user_club_id()) OR …`), así que para un secretario el padre directamente no
vuelve. Para el super_admin sí vuelve, y ahí el filtro de JS es el que trabaja — que es exactamente
el caso del recibo fantasma.

Se agregó además un contador visible en consola:

```javascript
const ajenas = (data||[]).filter(l => !cobDelClub(l)).length;
if (ajenas) console.warn(`[cobrosBuscar] ${ajenas} línea(s) de otro club descartadas (ISSUE-060)`);
```

En la corrida del probe se ve funcionando: `[cobrosBuscar] 38 línea(s) de otro club descartadas`
parado en Mi Club Hípico. Esas 38 son la plata de Dolores que hoy se lista.

### 3.2 `cobrosDetalle` tenía el mismo agujero — y es peor

Sí, lo tiene, y es más grave que el del listado. `cobrosDetalle` busca **sólo por
`beneficiario_tipo` + `beneficiario_id`**, sin acotar por club ni por reunión (lo segundo es
deliberado: se paga todo lo adeudado). Un beneficiario que entra a la lista por plata propia abre el
detalle con las líneas del otro club **mezcladas y ya tildadas**, listas para el botón Pagar.

Es la lección de ISSUE-055 repetida: filtrar sólo el listado mueve el problema un click en vez de
cerrarlo. El fix va en las **dos** consultas de `cobrosDetalle` (pagables y retenidas):

```javascript
  cobLineas = (pag||[]).filter(l => cobDelClub(l) && cobVisible(l, ridSel));
  const retLineas = (ret||[]).filter(l => cobDelClub(l) && cobVisible(l, ridSel));
```

El mutante **m6** del §6 aísla exactamente esto: neutraliza el filtro sólo en el detalle, y caen
los asserts 9/10/13 mientras 5/8 (listado) siguen verdes.

### 3.3 Lo que NO se tocó y por qué

`imprimirReciboCobro()` relee las líneas con `.eq('recibo_id', recibo.id)`. Con el guard del RPC
puesto, todo lo que cuelga de un `recibo_id` ya es del club del recibo. No necesita filtro: sería
redundante. Se deja anotado por si alguna vez se revierte el RPC.

---

## 4. ISSUE-057 — `emitido_por`

```sql
  SELECT u.id INTO v_usuario_id
    FROM usuarios u
   WHERE u.auth_user_id = auth.uid() AND u.activo
   LIMIT 1;
```

**`usuarios.id`, no `auth.uid()`** — la FK es a `usuarios(id)` (§1.4). Es la misma resolución que ya
hacen `rpc_inscribir` y `rpc_baja_inscripcion`, con el mismo `AND activo` de `fn_get_user_club_id()`.

### ¿La RLS lo permite?

Sí, y por dos motivos independientes:

1. `emitir_recibo` es `SECURITY DEFINER` y ninguna de las tablas tiene `FORCE ROW LEVEL SECURITY`:
   ```sql
   SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
   WHERE relname IN ('recibos','liquidacion_detalle','liquidaciones','club_secuencias');
   ```
   ```json
   [{"relname":"liquidaciones","relrowsecurity":true,"relforcerowsecurity":false},
    {"relname":"recibos","relrowsecurity":true,"relforcerowsecurity":false},
    {"relname":"liquidacion_detalle","relrowsecurity":true,"relforcerowsecurity":false},
    {"relname":"club_secuencias","relrowsecurity":true,"relforcerowsecurity":false}]
   ```
   El dueño de la función salta RLS. **Corolario importante: la RLS nunca iba a tapar ISSUE-059.**
   El candado tiene que ser código explícito; no alcanza con "ya hay RLS".
2. El `SELECT` sobre `usuarios` corre dentro del DEFINER, así que tampoco depende de
   `usuarios_select`.

### ¿Y si queda NULL?

`recibos.emitido_por` es **nullable** (`is_nullable: YES` en `information_schema.columns`) y así
queda. Bajo `service_role` (probes, MCP, jobs) `auth.uid()` es NULL, el `SELECT` no encuentra fila,
`v_usuario_id` queda NULL y el recibo se emite igual. **Es lo correcto**: un recibo emitido por un
proceso no tiene autor humano, y poner cualquier cosa ahí sería inventar un dato de auditoría.

Los asserts 19 y 20 del probe miden justamente esto. **Ningún probe existente se rompe** — ver §7.

---

## 5. El probe

**`tests/probe_aislamiento_club_cobros.mjs`** — 27 asserts. Patrón de `tests/README.md`: sin browser,
extrae del propio `liquidaciones.html` (por firma, con balance de llaves) `cobrosBuscar`,
`cobrosDetalle`, `cobDelClub`, `cobVisible`, `cobCargarReunPrueba`, `rolDeLinea`, `nombreBenef`,
`benefSearch`, `etiquetaRoles`, `etiquetaCarreras`, y los corre con `AsyncFunction` inyectando el
cliente Supabase real y un DOM stub. Si el archivo cambia, el probe corre el archivo cambiado.

### Fixtures — plata real en los DOS clubes

| Fixture | Club | Beneficiario | Monto | Para qué |
|---|---|---|---|---|
| `A-propia` | Dolores | `BENEF_A` (prof. de Dolores) | 331111 | plata que sólo existe en A |
| `A-cruzada` | Dolores | **`BENEF_B`** (prof. de Mi Club Hípico) | 332222 | **el cebo**: un beneficiario con plata en los dos clubes |
| `B-1` | Mi Club Hípico | `BENEF_B` | 333333 | plata propia de B |
| `B-2` | Mi Club Hípico | `BENEF_B` | 334444 | ídem, para la emisión bajo service_role |

El fixture `A-cruzada` es el que hace visible el agujero de `cobrosDetalle`: sin filtro de club,
parado en B, el detalle de `BENEF_B` trae las tres líneas.

Usuario de sesión: `secretario_carreras` de Mi Club Hípico creado con `auth.admin.createUser` +
`generateLink({type:'magiclink'})` + `verifyOtp` — **no** `signInWithPassword`, que desde el
04/08/2026 está gateado por Turnstile (mismo camino que `probe_rls_secretaria.mjs`).

### Cobertura

| # | Assert | Cubre |
|---|---|---|
| 1, 1b | el RPC rechaza una línea de A en un recibo de B, y el mensaje nombra al club | ISSUE-059 |
| 2 | rechaza la mezcla propia+ajena entera | ISSUE-059 (todo o nada) |
| 3 | tras los rechazos ninguna línea quedó tocada | sin escritura parcial |
| 3b | los rechazos no dejaron recibo colgado **en ningún club** | GOTCHA #76 |
| 4a, 4b | estructural: `cobDelClub` aplicado en listado y detalle; embed sin `!inner` | ISSUE-060 |
| 5, 6 | parado en B, el buscador no lista plata de A | ISSUE-060 |
| **7, 8** | **parado en B, el beneficiario propio SÍ aparece, con el total exacto (667777)** | **caso inverso** |
| 9, 10 | `cobrosDetalle` parado en B trae sólo las 2 líneas de B | ISSUE-060 detalle |
| **11** | **parado en A, lo propio SÍ aparece** | **caso inverso** |
| 12, 13 | parado en A no entra plata de B; el detalle del compartido trae sólo la de A | simetría |
| 14, 15 | desde una sesión de club B: el cruce se rechaza, y no puede emitir a nombre de A | ISSUE-059 guards 1 y 2 |
| **16** | **el club B SÍ puede cobrar su propia línea** | **caso inverso** |
| 17, 18 | `emitido_por` = `usuarios.id` de la sesión; club correcto | ISSUE-057 |
| 19, 20 | bajo service_role sigue emitiendo y `emitido_por` queda NULL | ISSUE-057 / no romper probes |
| R1, R2 | restore por **estado** limpio, y **nada** que restaurar a mano | GOTCHA #77 / ISSUE-058 |
| R3, R4 | 0 recibos del probe en **ningún** club; 0 líneas `TEST ISSUE-059/060` | GOTCHA #76 |

R1/R2 son los dos asserts que pidió la consigna: uno de que quedó limpio, otro de que no hubo que
arreglar nada (si `restaurarLineas` devuelve > 0, el probe ensució algo que no era suyo aunque
después haya quedado prolijo).

El probe restaura además **`club_secuencias` de los dos clubes**: la numeración que gasta un probe no
es un recibo de nadie. Ningún probe existente hace esto (ver §8, observación abierta).

---

## 6. Verificación pre-merge SIN tocar producción

El gate pedía no aplicar. Para no entregar SQL sin correr, se usó una **función sombra**:

1. Se creó `public.emitir_recibo__probe_shadow(...)` con el cuerpo **exacto** de la migración (el
   archivo pasado por `sed` sólo para cambiarle el nombre). **`emitir_recibo` no se tocó.**
2. Se corrió el probe con `RPC_EMITIR=emitir_recibo__probe_shadow`.
3. Al terminar, `DROP FUNCTION` de la sombra y de los tres mutantes.

Estado final de la base, verificado:

```sql
SELECT (SELECT string_agg(p.proname,', ') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname LIKE 'emitir_recibo%') AS nombres,
       (SELECT count(*) FROM recibos) AS recibos,
       (SELECT count(*) FROM recibos WHERE emitido_por IS NOT NULL) AS con_emitido_por,
       (SELECT count(*) FROM liquidacion_detalle) AS lineas,
       (SELECT count(*) FROM liquidaciones) AS liqs,
       (SELECT count(*) FROM liquidacion_detalle d JOIN liquidaciones l ON l.id=d.liquidacion_id
        JOIN recibos r ON r.id=d.recibo_id WHERE r.club_id <> l.club_id) AS cross_club,
       (SELECT count(*) FROM usuarios WHERE email LIKE 'probe.aisl.%') AS usuarios_probe,
       (SELECT count(*) FROM spcs) AS spcs;
```
```json
[{"nombres":"emitir_recibo","recibos":5,"con_emitido_por":0,"lineas":493,"liqs":189,
  "cross_club":0,"usuarios_probe":0,"spcs":181}]
```

Queda **una sola** función `emitir_recibo`, la v1.1 original. 5 recibos (los mismos de antes), 493
líneas, 189 liquidaciones, 0 cruces, 0 usuarios de prueba, 181 spcs.

### Corrida limpia — 27/27

```
── Probe ISSUE-059/060/057 · aislamiento entre clubes en el circuito de cobro ──
   html=/home/clio/dev/SGH/liquidaciones.html  rpc=emitir_recibo__probe_shadow
 ✅ 1) el RPC rechaza una línea del club A en un recibo del club B  → emitir_recibo: 1 de 1 línea(s) pertenecen a otro club — el recibo no se emite
 ✅ 1b) el mensaje del rechazo nombra al club (no es un error genérico)
 ✅ 2) rechaza la mezcla propia+ajena ENTERA (nada de recibo parcial)  → emitir_recibo: 1 de 2 línea(s) pertenecen a otro club — el recibo no se emite
 ✅ 3) tras los rechazos ninguna línea quedó tocada (sin escritura parcial)
 ✅ 3b) los rechazos no dejaron recibo colgado en NINGÚN club (foto sin filtro de club_id)  → []
 ✅ 4a) el archivo trae cobDelClub y lo aplica en el listado y en el detalle
 ✅ 4b) el club llega por EMBED, sin !inner (regla NULL-safe de ISSUE-055)
 ✅ 5) parado en B, el buscador NO lista al beneficiario que sólo tiene plata en A
 ✅ 6) parado en B, tampoco entra el monto de la línea cruzada del club A
 ✅ 7) [caso inverso] parado en B, el beneficiario propio SÍ aparece
 ✅ 8) [caso inverso] y su total es exactamente la plata de B, sin sumar la de A  → esperado 667777
 ✅ 9) cobrosDetalle parado en B trae SÓLO las líneas de B  → [{"m":333333,"c":"a6da7e40"},{"m":334444,"c":"a6da7e40"}]
 ✅ 10) y la línea cruzada del club A no está entre las tildadas
 ✅ 11) [caso inverso] parado en A, el beneficiario propio y su monto SÍ aparecen
 ✅ 12) parado en A, no entra la plata del club B
 ✅ 13) cobrosDetalle parado en A trae sólo la línea de A del beneficiario compartido
 ✅ 14) desde una sesión de club B, el cruce a líneas de A también se rechaza
 ✅ 15) un usuario de B no puede emitir un recibo del club A  → emitir_recibo: no se puede emitir un recibo de otro club
 ✅ 16) [caso inverso] el club B SÍ puede cobrar su propia línea  → recibo 2
 ✅ 17) ISSUE-057 — emitido_por = el usuario de la sesión (no NULL, no auth.uid())
        → emitido_por=7ccca79a-… usuarios.id=7ccca79a-… auth.uid=b41181a4-…
 ✅ 18) el recibo salió con el club_id correcto  → a6da7e40-…
 ✅ 19) bajo service_role el RPC sigue emitiendo (los probes existentes no se rompen)  → recibo 3
 ✅ 20) y emitido_por queda NULL cuando no hay usuario detrás (no inventa autor)  → null
 ✅ R1) restore por estado: las líneas de los dos clubes quedaron como estaban  → A: sin diferencias | B: sin diferencias
 ✅ R2) y no hubo que restaurar nada a mano  → 0 línea(s) restauradas
 ✅ R3) no quedó ningún recibo del probe, en ningún club  → []
 ✅ R4) no quedaron líneas TEST ISSUE-059/060 en la base  → []

27/27 OK
```

Nótese `17)`: `emitido_por` = `7ccca79a…` = `usuarios.id`, **distinto** de `auth.uid` = `b41181a4…`.
Es la evidencia directa de por qué `auth.uid()` a secas habría fallado.

---

## 7. Mutation test — 6 mutantes, uno por fix

Cada mutante neutraliza **un solo** fix y se corre el probe completo contra él.

| Mutante | Qué se neutralizó | Asserts que caen | Resultado |
|---|---|---|---|
| **mut1** (SQL) | guard 2 completo: pre-chequeo **y** `AND EXISTS` | 1, 1b, 2, 3, 3b + cascada 8, 9, 13, 16, 17, 18 | **16/27** |
| **mut2** (SQL) | guard 1 (club del llamador) | **15** — y sólo 15 | **26/27** |
| **mut3** (SQL) | `emitido_por` fuera del INSERT | **17** — y sólo 17 | **26/27** |
| **m4** (HTML) | `cobDelClub(l){ return true }` (listado + detalle) | 5, 8, 9, 10, 13 | **22/27** |
| **m5** (HTML) | filtro quitado **sólo** en `cobrosBuscar` | 4a, 5, 8 | **24/27** |
| **m6** (HTML) | filtro quitado **sólo** en `cobrosDetalle` | 4a, 9, 10, 13 | **23/27** |

Tres lecturas que salen de esta tabla:

**a) mut1 reproduce el recibo fantasma, literal.** La salida cruda del assert 1:

```
❌ 1) el RPC rechaza una línea del club A en un recibo del club B  → ¡EMITIÓ! recibo=
   {"id":"060ec89a-…","club_id":"a6da7e40-1515-45dc-8933-4eef33ce937a","numero_recibo":2,
    "beneficiario_tipo":"profesional","profesional_id":"e7053041-…","total_premios":332222,
    "estado":"emitido","emitido_por":null, …}
```
Recibo del club **Mi Club Hípico** pagando una línea de **Dolores**. Es el `b2966769` del 28/08 otra
vez, en un fixture. La cascada a 8/9/13/16/17/18 es honesta: el mutante **consumió** las líneas de
prueba, así que los asserts posteriores ya no tenían qué medir. El restore igual quedó limpio
(R1–R4 en verde dentro de esos 16/27).

**b) m5 vs m6 separan limpiamente el listado del detalle.** m5 (listado neutralizado) deja 9/10/13
en verde; m6 (detalle neutralizado) deja 5/8 en verde. Es la demostración experimental de que
`cobrosDetalle` necesitaba su propio filtro y de que el probe lo mide por separado — la lección de
ISSUE-055 verificada, no asumida.

**c) m4 muestra que el assert estructural no alcanza.** m4 vació el cuerpo de `cobDelClub` pero
dejó las llamadas en su lugar: **4a pasó igual**. Los que lo mataron fueron los asserts de
comportamiento (5/8/9/10/13). El assert estructural sirve para detectar que alguien borre el filtro,
no para garantizar que funcione.

**Nota sobre el assert 6** (`parado en B no entra el monto 332222`): no cayó en m4 porque sin filtro
la tarjeta muestra el total sumado `999999`, y `332222` no aparece como literal. Es un guard
redundante; los que miden de verdad ese caso son el 5 y el 8. Se deja porque cuesta cero y cubre
otra forma de la falla (que la línea cruzada se liste sola).

### Un bug del propio probe que encontró el mutation test

En la primera corrida de **mut2**, `R3` quedó en rojo:

```
❌ R3) no quedó ningún recibo del probe, en ningún club → [{"id":"1f5fd977-…",
   "club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","numero_recibo":21,"neto_a_cobrar":332222}]
```

El assert 15 descartaba el `data` del RPC y sólo miraba el `error`; con el guard 1 neutralizado el
RPC **sí** emitió, y ese recibo quedó fuera del teardown. Se corrigió: los tres intentos que deberían
fallar (14, 15 y el 1) ahora capturan `data` y registran el id para que el `finally` lo limpie, y el
snapshot de `club_secuencias` pasó a cubrir los dos clubes. Re-corrido, mut2 mata **sólo** el 15 y
deja la base limpia.

El recibo huérfano de esa primera corrida se borró a mano y el contador de Dolores se devolvió de 21
a 20 (era un artefacto de un mutante creado en esta sesión, no de un probe normal):

```sql
DELETE FROM recibos WHERE id = '1f5fd977-4f39-4a8c-80af-e810c4bff2f8';
UPDATE club_secuencias SET ultimo_numero = 20
 WHERE club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c' AND tipo = 'recibo';
```
```json
[{"recibos_total":5,"recibos_ultima_hora":0,
  "secuencias":[{"club":"0649e9c5…","n":20},{"club":"a6da7e40…","n":1}]}]
```

Que un mutante encuentre un bug en el probe es la señal de que el mutation test sirvió para algo más
que confirmar lo que ya se sabía.

---

## 8. Regresión de los probes que ya existen

Probes que llaman al RPC: `probe_recibos_emision.mjs`, `probe_cobros_v11.mjs`.
(`probe_recibo_pie_cobrador.mjs` nombra `emitir_recibo` sólo en comentarios: extrae código del front,
no llama al RPC.)

Se corrieron dos veces: contra la v1.1 viva, y contra copias temporales apuntadas a la sombra v1.2.

| Probe | v1.1 (baseline) | v1.2 (sombra) | ¿Regresión? |
|---|---|---|---|
| `probe_recibos_emision` | ❌ 3 fallos — 14 checks | ❌ 3 fallos — 14 checks | **No** |
| `probe_cobros_v11` | ❌ 1 fallo — 2 checks | ❌ 1 fallo — 2 checks | **No** |
| `probe_recibo_pie_cobrador` | ✅ 56/56 | ✅ 56/56 (no toca el RPC) | **No** |

Los fallos de `probe_recibos_emision` (3) y `probe_cobros_v11` (1) son **previos y ajenos a este
trabajo** — mismo número antes y después. Quedan fuera de alcance por consigna (ISSUE-063 y
`probe_cobros_v11` explícitamente excluidos). Lo que este informe afirma es lo acotado: **v1.2 no
cambia el resultado de ninguno de los tres**.

Las copias temporales se borraron (`rm tests/_tmp_v12_*.mjs`).

---

## 9. Orden de aplicación

**Migración PRIMERO, merge del HTML DESPUÉS.** Mismo criterio que ISSUE-055, por dos razones:

1. **Compatibilidad hacia atrás en ambos sentidos.** El HTML nuevo no depende de la migración (el
   filtro de club es 100% client-side, no toca la firma del RPC), y la migración no depende del HTML
   nuevo (v1.2 acepta exactamente los mismos parámetros que v1.1). Las dos combinaciones intermedias
   funcionan. No hay ventana rota.
2. **El CDN de GitHub Pages tarda minutos en servir el HTML nuevo** (ver *Deploy* en CLAUDE.md). Si
   se mergea primero el HTML, durante esos minutos el candado del servidor sigue sin estar y el
   único que protege es un front que todavía no se sirve. Con la migración primero, **desde el
   segundo cero el agujero está cerrado en el servidor**, que es donde importa: el front filtra por
   prolijidad, el RPC es el que impide el daño.

Secuencia propuesta:

```
1. mcp apply_migration ← migrations/emitir_recibo_v1_2_aislamiento_club.sql
2. node tests/probe_aislamiento_club_cobros.mjs          # 27/27 contra emitir_recibo real
3. node tests/probe_recibos_emision.mjs                  # 3 fallos previos, ni uno más
   node tests/probe_cobros_v11.mjs                       # 1 fallo previo, ni uno más
   node tests/probe_recibo_pie_cobrador.mjs              # 56/56
   node tests/probe_reunion_es_prueba.mjs                # 16/16 (ISSUE-055 sigue vivo)
4. git checkout main && git merge fix/aislamiento-club-cobros && git push
5. verificar md5 de liquidaciones.html contra sigh.com.ar
6. re-correr el probe (ahora también contra el HTML servido)
```

Si el paso 2 falla: `migrations/rollback_emitir_recibo_v1_2.sql` devuelve la v1.1 exacta y nada más
cambió (el HTML todavía no se mergeó).

---

## 10. Números de resumen

| | |
|---|---|
| Recibos con `club_id` ≠ club de sus líneas, en toda la base | **0** (además del ya revertido) |
| Recibos huérfanos / con beneficiario o tipo cruzado | **0 / 0** |
| Recibos con `emitido_por` NULL, antes del fix | **5 de 5** |
| Clubes en la base / con liquidaciones | **3 / 1** |
| Líneas de Dolores que hoy se listan parado en otro club | **38** (medido por el `console.warn` nuevo) |
| Asserts del probe nuevo | **27**, 27/27 verdes contra v1.2 |
| Mutantes corridos | **6** (3 SQL + 3 HTML), cada uno mata sus asserts |
| Probes existentes con regresión | **0 de 3** |
| Archivos tocados | `liquidaciones.html` (+27/−6), 2 migraciones nuevas, 1 probe nuevo |
| Escrituras dejadas en prod por este trabajo | **ninguna** — sombra y mutantes dropeados, verificado |

---

## 11. Preguntas abiertas

1. **`anular_recibo` no existe.** Se buscó en `pg_proc` junto con las otras dos y no está:
   ```sql
   SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND proname IN ('emitir_recibo','liberar_linea','anular_recibo');
   → emitir_recibo, liberar_linea
   ```
   ISSUE-056 está fuera de alcance por consigna, pero conviene saber que la función todavía no
   existe: el issue no es "arreglar `anular_recibo`", es "escribirlo".
2. **Los probes que emiten recibos no restauran `club_secuencias`.** El contador de Dolores está en
   24 (subió de 20 durante las corridas de regresión de esta sesión, 4 números por 4 corridas de
   `probe_recibos_emision` y `probe_cobros_v11`). No se tocó: bajarlo es más riesgoso que dejar un
   hueco, y el drift es comportamiento preexistente de esos probes, no de este trabajo. El probe
   nuevo sí restaura la secuencia. ¿Se homogeneiza, o se acepta que la numeración de Dolores tenga
   huecos por testing? **Es decisión de producto** — la numeración de recibos la mira Fede.
3. **El guard 1 deja pasar al super_admin a cualquier club, a propósito** (es lo que hace posible el
   club-switcher). O sea: el escenario exacto del recibo fantasma —super_admin parado en el club
   equivocado— sigue siendo *posible como acción*, lo que se cierra es que las líneas sean de otro
   club. Si además se quisiera que el super_admin tenga que confirmar el cambio de club antes de
   pagar, eso es UI y no está en este trabajo.
4. **RLS no protege nada de esto** y conviene que quede escrito: `emitir_recibo` es SECURITY DEFINER
   sobre tablas sin `FORCE ROW LEVEL SECURITY`. Cualquier futuro RPC de plata necesita su candado
   explícito; "ya tiene RLS" no es un argumento.
5. **Al mergear falta actualizar** `docs/ISSUES.md` (cerrar 057/059/060), `docs/GOTCHAS.md` (dos
   entradas candidatas: la FK de `emitido_por` a `usuarios` y no a `auth.users`; y que RLS no cubre
   SECURITY DEFINER), `CHANGELOG.md`, y el bloque de *Probes de regresión* de `CLAUDE.md`. No se
   tocaron para dejar el diff de revisión acotado a código + SQL + probe.
