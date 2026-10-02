# Anotados de todos los turnos de corrido — Fase 1 (relevamiento, solo lectura)

- **Fecha**: 2026-10-02
- **Código relevado**: `main` en `d52afe9350ebfbd75bd341bc178e6e2e198c8a96` (todo lo leído, contra `main`; el informe se commitea en `reports`)
- **Pedido**: Fede / Yesi, 29/09 — ver los anotados de todos los turnos de una reunión de corrido (turno 1, turno 2, …) con scroll, sin abrir cada turno por separado. Mantener la vista por turno.
- **Alcance**: solo lectura. No se escribió código, ni base, ni `main`. Sólo consultas `SELECT` por MCP.

## Guards verificados

| Guard | Esperado (CLAUDE.md de `main`) | Medido | |
|---|---|---|---|
| `pwd` | `/home/clio/dev/SGH` | `/home/clio/dev/SGH` | ✅ |
| `SELECT count(*) FROM spcs` | 238 | **239** | ⚠️ ver abajo |
| ref del proyecto | `unlhcuanfrtpatoipwve` | `unlhcuanfrtpatoipwve` (MCP `supabase`, el mismo de `SUPABASE_URL`) | ✅ |

**239 vs 238**: no es proyecto equivocado. La ficha más nueva es de hoy, `alta_origen = portal`
(`b63acf83-f221-4c9e-bbd1-a2de13f4b307`, `2026-10-02 09:35:09 UTC`): es la primera alta real por el camino
del portal que se habilitó el 02/10 (`portal_alta_spc_studbook.sql`). Hay que subir el baseline de CLAUDE.md a 239
— no lo hice porque el pedido es no escribir. Las dos anteriores son de secretaría del 01/10 (ya contadas en el 238).

```sql
select string_agg(id::text||' '||created_at::text||' '||coalesce(alta_origen::text,''),' ; ')
from (select * from spcs order by created_at desc limit 3) s;
```
```
b63acf83-f221-4c9e-bbd1-a2de13f4b307 2026-10-02 09:35:09.56252+00 portal ; 717ef321-99b5-4243-811e-52f7246fa740 2026-10-01 17:08:37.83153+00 secretaria ; db8c2270-6af2-4417-ac7e-6c7272be65fc 2026-10-01 17:08:17.36383+00 secretaria
```

---

## Conclusión corta

1. **La pantalla del pedido es `inscripciones.html`** (staff). Hoy es estrictamente **un turno por vez**: select
   *Reunión* → select *Turno* → una tabla. Para ver el turno 2 hay que volver al select.
2. **`ratificacion.html` YA muestra todos los turnos de corrido**, con scroll y una barra de botones 1..N que salta
   al turno (`goToTurno`). Pero tiene otras columnas (sin entrenador, sin suplente, sin personal, sin "Cargada por",
   sin gatera editable; con chapa, peso y botones de ratificar/forfait), otro orden (por gatera) y es la pantalla de
   ratificación, no la de anotados. **Pregunta abierta 1**: ¿Fede/Yesi conocen esa vista? Puede que el pedido sea
   exactamente "esto, pero en Inscripciones".
3. **Portal**: no tiene "anotados por turno" de terceros, y **no puede tenerlos** sin cambiar permisos: la RLS de
   `inscripciones` le deja ver al usuario de portal sólo las filas de sus caballos visibles (`fn_mis_spc_visibles`).
   Lo que el portal ya muestra es "Mis inscripciones" (todas las reuniones y turnos en una tabla) y, en el llamado,
   un chip "✓ N anotados" que cuenta **sólo los propios**. Fuera de alcance; si se quiere, es una decisión de producto
   aparte (pregunta abierta 2).
4. **Rendimiento y permisos: no cambian.** Traer todos los turnos es la misma consulta que ya hace
   `ratificacion.html` (`inscripciones … in('carrera_id', ids)`), con la misma RLS. Volumen real: máximo **125 filas por
   reunión** (R6), 11–12 turnos. Nada que optimizar.
5. **Ratificar / forfait / mal inscripto / cambiar monta no viven en `inscripciones.html`**: están en `ratificacion.html`
   (que ya es "todos los turnos") y, la monta post-oficial, en `resultados.html` (Montas → `rpc_cambiar_monta`).
   En `inscripciones.html` las acciones por fila son **editar (✏️, modal), borrar (🗑️) y gatera**, más dos por turno
   (**estado de la carrera** y **+ Inscribir SPC**). En modo "todos los turnos" funcionan editar/borrar/gatera **con un
   arreglo obligatorio** (ver § Riesgos — `saveRecord` toma la carrera de la variable global, no de la fila); estado y
   alta se dejan por turno.
6. **Cambio mínimo propuesto**: una opción **"— Todos los turnos —"** en el mismo select *Turno* de
   `inscripciones.html`. Una consulta, secciones por turno con su encabezado y su tabla (las mismas filas de hoy), aviso
   de jockey repetido calculado **por turno**. La vista por turno queda igual y sigue siendo la de arranque.

---

## 1. Qué pantallas muestran hoy los anotados y cómo se navega

### Staff

| Pantalla | Qué muestra | Navegación | Todos los turnos |
|---|---|---|---|
| `inscripciones.html` ("📋 Inscripciones") | Anotados de **un** turno: SPC, gatera (editable), cert., caballeriza, entrenador, jockey, suplente, personal, cargada por (portal/secretaría + nombre), estado, acciones | `sel-reunion` → `sel-carrera`; arranca en la reunión activa y en el **primer turno**; deep link `?carrera_id=` | **No** |
| `inscripciones.html` → 🖨️ Imprimir (`printInscriptos`) | PDF de **toda la reunión** (inscripto + ratificado + mal_inscrito), por turno, alfabético | botón | Sí, pero en papel |
| `ratificacion.html` ("✅ Ratificados y forfait") | **Todas las carreras** de la reunión, una sección colapsable por turno (`csec-<id>`): chapa, SPC, caballeriza, jockey (select), peso, estado, acciones | `sel-reunion` + barra sticky de botones 1..N (`goToTurno`, scroll suave) con nº de carrera y hora editables | **Sí** |
| `programa.html` / `programa-oficial*.html` | Programa (ratificados) | por reunión | sí (es el programa) |
| `resultados.html` | Marcador + Montas, por carrera | por carrera | no (no es "anotados") |

Detalle de navegación de `inscripciones.html` (`main`, líneas citadas):

- `loadAll()` (:407) carga reuniones + caches (`profesionales`, `spcs` activos, `caballerizas`); si hay `?carrera_id`
  va a ese turno, si no resuelve la reunión activa (`ActiveReunion.resolve`) y **elige el primer turno** (:450–455).
- `onReunionChange()` (:460) trae las carreras de la reunión (con todas las columnas del encabezado) y arma el select.
- `onCarreraChange()` (:494) fija `currentCarreraId` / `currentCarrera`, pinta el encabezado (`renderCarreraHeader` →
  `renderCarreraChips`) y llama `loadInscripciones()`.
- `loadInscripciones()` (:598) — **la única consulta de la tabla**, filtrada por un turno:
  ```js
  sb.from('inscripciones')
    .select('*, cargador:usuarios!inscripciones_inscripto_por_fkey(nombre_completo), spcs(nombre,revision_pendiente)')
    .eq('carrera_id', currentCarreraId);
  ```
  y ordena en cliente, alfabético `localeCompare(…, 'es')`.
- `renderInscripciones()` (:651) pinta **una** tabla en `#list-container` y el contador `N inscriptos`.

### Portal (`portal.html`)

| Sección | Qué muestra | Fuente |
|---|---|---|
| Llamado abierto (`loadLlamado`, :622) | Turnos con ventana abierta de reuniones `publicada` con fecha ≥ hoy; chip "✓ N anotados" = **sólo los míos** (`misInscripciones`) | `reuniones` + `carreras` embebidas |
| Mis inscripciones (`loadMisInscripciones`, :1302) | **Todas mis** inscripciones, todas las reuniones y turnos, en una tabla; Retirar / Dar forfait / Modificar | `cargarInscripcionesCrudas()` (:813) |

El portal no tiene una vista de "anotados del turno" (los de los demás). La RLS no lo permitiría (§ 2).

---

## 2. De dónde salen los datos; rendimiento y permisos

### Consultas

| Pantalla | Consulta de anotados | Filtro |
|---|---|---|
| `inscripciones.html` `loadInscripciones` | `inscripciones` + join `usuarios` (cargador) + `spcs(nombre,revision_pendiente)` | `eq('carrera_id', …)` — **un turno** |
| `inscripciones.html` `printInscriptos` | `inscripciones(carrera_id,spc_id,numero_partidor,certificado_correr,estado,spcs(nombre,sexo))` | `in('carrera_id', ids de la reunión)` + `in('estado', …)` |
| `ratificacion.html` `loadReunion` (:569) | `carreras` de la reunión → `inscripciones select('*') in('carrera_id', ids)` | **toda la reunión** |
| `portal.html` `cargarInscripcionesCrudas` | `inscripciones` + `spcs` + `carreras(… reuniones(…))` | lo que deje la RLS (sólo lo propio) |

No hay RPC de lectura de anotados para staff: todo es PostgREST directo. Las RPC del circuito son de escritura:
`rpc_inscribir`, `rpc_baja_inscripcion`, `rpc_modificar_inscripcion` (portal) y `rpc_cambiar_monta` (staff, Montas en
`resultados.html`).

### Permisos (RLS de `inscripciones`, medida hoy)

```sql
select 'spcs' k, count(*)::text v from spcs
union all select 'pol:'||policyname||':'||cmd, coalesce(qual,'')||' | '||coalesce(with_check,'') from pg_policies where tablename='inscripciones'
union all select 'trg:'||tgname, pg_get_triggerdef(t.oid) from pg_trigger t where tgrelid='public.inscripciones'::regclass and not tgisinternal;
```
```
spcs | 239
pol:inscripciones_select:SELECT | (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR ((NOT ( SELECT fn_is_portal_user() AS fn_is_portal_user)) AND (fn_club_de_carrera(carrera_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))) OR (( SELECT fn_is_portal_user() AS fn_is_portal_user) AND (spc_id IN ( SELECT m.spc_id
   FROM fn_mis_spc_visibles() m(spc_id))))) | 
pol:inscripciones_delete:DELETE | ((NOT ( SELECT fn_is_portal_user() AS fn_is_portal_user)) AND (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_carrera(carrera_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))) | 
pol:inscripciones_insert:INSERT |  | ((NOT ( SELECT fn_is_portal_user() AS fn_is_portal_user)) AND (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_carrera(carrera_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))
pol:inscripciones_update:UPDATE | ((NOT ( SELECT fn_is_portal_user() AS fn_is_portal_user)) AND (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_carrera(carrera_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id)))) | ((NOT ( SELECT fn_is_portal_user() AS fn_is_portal_user)) AND (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_carrera(carrera_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))
trg:trg_audit_inscripciones | CREATE TRIGGER trg_audit_inscripciones AFTER INSERT OR DELETE OR UPDATE ON public.inscripciones FOR EACH ROW EXECUTE FUNCTION fn_auditoria_log()
trg:trg_insc_monta_oficial | CREATE TRIGGER trg_insc_monta_oficial BEFORE UPDATE OF jockey_titular_id ON public.inscripciones FOR EACH ROW EXECUTE FUNCTION fn_insc_monta_oficial_guard()
trg:trg_insc_set_propietario | CREATE TRIGGER trg_insc_set_propietario BEFORE INSERT OR UPDATE OF caballeriza_id ON public.inscripciones FOR EACH ROW EXECUTE FUNCTION fn_inscripcion_set_propietario()
trg:trg_inscripciones_updated_at | CREATE TRIGGER trg_inscripciones_updated_at BEFORE UPDATE ON public.inscripciones FOR EACH ROW EXECUTE FUNCTION set_updated_at()
```

Lectura:

- **Staff**: ve las inscripciones de **todas** las carreras de su club (`fn_club_de_carrera(carrera_id) = club del
  usuario`). La política es por fila, no por turno: pedir 11 turnos juntos devuelve exactamente la unión de lo que hoy
  devuelven 11 pedidos de a uno. **Sin cambio de permisos.**
- **super_admin**: ve todo; la pantalla ya filtra por la reunión elegida, que es del club seleccionado.
- **Portal**: sólo filas de sus caballos visibles. Una vista "todos los anotados del turno" para el portal **no sale
  con la RLS actual**: necesitaría una RPC `SECURITY DEFINER` acotada (qué columnas, desde cuándo, qué reuniones) —
  es decisión de producto y de privacidad (nombres de terceros), fuera del cambio mínimo.

### Rendimiento

```sql
select r.numero, r.fecha, r.estado, count(distinct ca.id) carreras, count(i.id) inscripciones, max(x.n) max_por_turno
from reuniones r join clubs c on c.id=r.club_id
left join carreras ca on ca.reunion_id=r.id
left join inscripciones i on i.carrera_id=ca.id
left join lateral (select count(*) n from inscripciones i2 where i2.carrera_id=ca.id) x on true
where c.id='0649e9c5-9e87-4aad-842f-101458e6b33c'
group by r.id order by r.fecha desc limit 8;
```
```
numero | fecha      | estado     | carreras | inscripciones | max_por_turno
9999   | 2099-01-01 | cancelada  | 3        | 17            | 6
12     | 2026-12-27 | programada | 0        | 0             | 0
11     | 2026-11-22 | programada | 0        | 0             | 0
10     | 2026-10-11 | publicada  | 11       | 74            | 14
9      | 2026-09-20 | publicada  | 11       | 102           | 14
8      | 2026-08-16 | finalizada | 12       | 106           | 15
7      | 2026-07-19 | cancelada  | 12       | 0             | 0
6      | 2026-06-20 | borrador   | 11       | 125           | 19
```

- Peor caso real: **125 filas** en una reunión (R6). Hoy la pantalla trae ≤ 19 por pedido; el modo nuevo traería ≤ 125
  en **un** pedido (menos pedidos que recorrer los 11 turnos a mano). La RLS evalúa `fn_club_de_carrera` por fila: 125
  evaluaciones, despreciable. Límite de filas de PostgREST (1000) lejos.
- Los ids de carrera ya están en memoria (`carreras`, cargado en `onReunionChange`): **no hace falta** el viaje extra
  que hace `ratificacion.html` (`select('id')` antes del `in`). 11 uuids en la URL ≈ 420 caracteres, sin problema.
- Render: ≤ 125 `<tr>` en un `innerHTML`. `ratificacion.html` ya pinta lo mismo con selects de jockey por fila
  (más pesado) sin quejas.

---

## 3. Acciones por turno y si siguen funcionando con todos los turnos

### Dónde está cada acción hoy

| Acción | Pantalla | Cómo | Alcance |
|---|---|---|---|
| Ratificar / ↩ Volver / ❌ Forfait / ⚠ Mal inscripto | `ratificacion.html` | `UPDATE inscripciones` por `id` | por fila, **ya en vista de todos los turnos** |
| Peso | `ratificacion.html` | `updatePeso` por `id` | por fila |
| Cambiar monta antes de oficializar | `ratificacion.html` (select jockey, `onJockeyChange`) y `inscripciones.html` (modal ✏️) | `UPDATE` directo por `id` | por fila |
| Cambiar monta con carrera oficial | `resultados.html` Montas (`saveMontas`) | `rpc_cambiar_monta` | por carrera; el trigger `trg_insc_monta_oficial` rechaza el UPDATE directo con `P0084` (sólo si el jockey **cambia**) |
| Estado de la carrera / categoría / nº de programa / hora | `ratificacion.html` (por sección) e `inscripciones.html` (select del encabezado, `onEstadoCarreraChange`) | `UPDATE carreras` por id | por turno |
| Editar inscripción (✏️), borrar (🗑️), gatera | `inscripciones.html` | `saveRecord` / `deleteRecord` / `guardarGatera` | por fila |
| Inscribir SPC | `inscripciones.html` (+ Inscribir SPC) | `INSERT` con `carrera_id = currentCarreraId` | por turno |
| Retirar / Dar forfait / Modificar (portal) | `portal.html` Mis inscripciones | `rpc_baja_inscripcion` / `rpc_modificar_inscripcion` | por fila propia, ya en una tabla de todas las reuniones |

### En un modo "todos los turnos" de `inscripciones.html`

| Acción | ¿Sigue funcionando? | Qué hace falta |
|---|---|---|
| Gatera (`guardarGatera(id, el)`) | **Sí.** Actualiza por `id`; el `23505` es por carrera (único por turno), el mensaje "ya usada en esta carrera" sigue siendo verdad. El `find` sobre `inscripciones` funciona si el arreglo tiene todas las filas. | nada |
| Borrar (`deleteRecord(id)`) | Borra bien (por `id`), pero después llama `loadInscripciones()`, que **sale sin hacer nada** si `currentCarreraId` es nulo → la tabla quedaría con la fila borrada a la vista. | recargar según el modo |
| Editar (✏️ → `openModal(rec)` → `saveRecord`) | **NO, tal cual está.** `saveRecord` arma `payload.carrera_id = currentCarreraId` (:837) **también al editar**. En modo todos, `currentCarreraId` no es el turno de la fila: o corta con "Seleccionar un SPC" (si es nulo, :830) o — peor — si quedó el id del último turno mirado, **mueve la inscripción a otro turno** sin avisar. | el modal guarda el `carrera_id` de la fila (`rec.carrera_id`) y `saveRecord` usa ése al editar |
| Aviso de jockey repetido | **NO, tal cual está.** `renderInscripciones` cuenta `conteoJockeysActivos(inscripciones)` sobre todo el arreglo: con todos los turnos juntos, un jockey que monta en T1 y en T3 (lo normal) saldría marcado "⚠ dup." en los dos. Lo mismo `avisarJockeyRepetido` después de guardar. | contar **por turno** (`conteoJockeysActivos(filasDelTurno)`) |
| Estado de la carrera (select del encabezado) | Es de **un** turno (`currentCarrera`). | ocultarlo en modo todos (se cambia en la vista por turno o en `ratificacion.html`, que lo tiene por sección) |
| + Inscribir SPC | Necesita un turno. | ocultarlo en modo todos (conservador). Opción posterior: un "+ Inscribir" por sección |
| 🖨️ Imprimir | Ya es por reunión. | nada |
| Ratificar / forfait / monta | No están en esta pantalla. | nada; siguen en `ratificacion.html` / `resultados.html` |
| Monta post-oficial desde el modal | Igual que hoy: si el jockey cambia en una carrera oficial, el trigger corta con `P0084` y el toast muestra el mensaje. Editar otro campo con el mismo jockey pasa (`IS NOT DISTINCT FROM`). | nada nuevo |

Definición del guard (para la última fila):

```sql
select pg_get_functiondef('public.fn_insc_monta_oficial_guard'::regproc);
```
```
CREATE OR REPLACE FUNCTION public.fn_insc_monta_oficial_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_nro text;
BEGIN
  -- Sólo si la monta CAMBIA. Un UPDATE con payload entero y el mismo jockey pasa.
  IF NEW.jockey_titular_id IS NOT DISTINCT FROM OLD.jockey_titular_id THEN
    RETURN NEW;
  END IF;
  -- Vía autorizada: la RPC, y sólo dentro de su transacción.
  IF current_setting('sgh.cambiar_monta', true) = '1' THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE(c.numero_carrera_programa, c.numero_turno)::text INTO v_nro
    FROM resultados r
    JOIN carreras c ON c.id = r.carrera_id
   WHERE r.carrera_id = NEW.carrera_id AND r.estado = 'oficial'
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'La carrera % ya está oficializada: la monta se cambia desde Montas (resultados.html), que recalcula la liquidación. ISSUE-084', v_nro
      USING ERRCODE = 'P0084';
  END IF;
  RETURN NEW;
END $function$
```

---

## 4. Propuesta — cambio mínimo, sólo `inscripciones.html`

**Una opción más en el select de turno**, no una pantalla nueva ni un toggle aparte:

```
Turno: [ — Seleccionar turno — | — Todos los turnos — | Turno 1 — … | Turno 2 — … ]
```

1. **`onReunionChange`**: agrega `<option value="__todos__">— Todos los turnos —</option>` arriba de los turnos. El
   arranque no cambia (sigue entrando al primer turno); el modo se elige a mano. Deep link opcional
   `?reunion_id=…&turno=todos` (no recuerda el modo en `localStorage`: conservador, no cambia lo que Yesi ve al entrar).
2. **`onCarreraChange`**: si el valor es `__todos__` → `modoTodos = true`, `currentCarreraId = null`, oculta el
   encabezado de un turno, el select de estado de carrera y el botón "+ Inscribir SPC", y llama `loadInscripciones()`.
3. **`loadInscripciones`**: misma `select(...)` de hoy; el filtro pasa a
   `modoTodos ? .in('carrera_id', carreras.map(c => c.id)) : .eq('carrera_id', currentCarreraId)`. Mismo orden
   alfabético `'es'`. Mantener el nombre y la firma: `probe_orden_inscriptos` la extrae por ancla.
4. **`renderInscripciones`**: se parte en `filasInscripciones(lista)` (el `map` de hoy, intacto, con
   `conteoJockeysActivos(lista)`) y el que arma la tabla:
   - modo turno → una tabla, igual que hoy;
   - modo todos → por cada carrera de `carreras` (ya ordenado por `numero_turno`), una sección con encabezado liviano
     (nº de turno en el círculo, nombre o "Turno N", distancia, condición con `esc()`, badge si está anulada/confirmada,
     contador "N inscriptos") + la misma tabla con `filasInscripciones(filasDeEseTurno)`. Turnos sin anotados: la sección
     con "Sin inscriptos" (que se vea que el turno existe). Un link "Ver sólo este turno" en el encabezado cambia el
     select a ese turno.
   - contador general: "N inscriptos en M turnos".
   - **El jockey repetido se cuenta por turno**, nunca sobre el arreglo entero.
5. **Edición**: `openModal(rec)` guarda `rec.carrera_id` en un hidden (`f-carrera-id`); `saveRecord` usa
   `id ? f-carrera-id : currentCarreraId`. Esto además blinda la vista por turno (hoy, editar ya depende de que el
   select no haya cambiado entre abrir y guardar). `avisarJockeyRepetido` cuenta sobre las filas de **ese** turno.
6. **Recargas** (`saveRecord`, `deleteRecord`): `loadInscripciones()` respeta el modo (en modo todos, no sale por
   `currentCarreraId` nulo).
7. Opcional, misma entrega o siguiente: barra de saltos 1..N sticky como la de `ratificacion.html` (`goToTurno`), sin
   los inputs de nº de carrera y hora.

Fuera del cambio mínimo, a propósito: nada en `ratificacion.html` (ya es todos los turnos), nada en el portal, nada en
la base. Sin migración, sin RPC, sin cambio de RLS.

### Probes a tocar / agregar (Fase 2)

Probes que extraen de `inscripciones.html` (anexo B): `probe_aviso_jockey_repetido` (extrae `renderInscripciones` y
`avisarJockeyRepetido` — si el `map` pasa a `filasInscripciones`, hay que extraer las dos), `probe_orden_inscriptos`
(`loadInscripciones`), `probe_bolsa_efectiva` y `probe_paridad_llamado_inscripciones` (`onReunionChange`,
`onCarreraChange`, encabezado — la opción nueva no tiene que romper la paridad con el llamado), `probe_xss_portal_nombres`
(HTML real en jsdom), `probe_portal_alta_spc_ui`.

Probe nuevo, `tests/probe_inscriptos_todos_turnos.mjs`, jsdom + `sb` stub (sin base, como `probe_portal_alta_spc_ui`):
- modo todos con 3 turnos sintéticos → 3 secciones en orden de `numero_turno`, cada una alfabética `'es'`, turno vacío
  con "Sin inscriptos", contador total;
- un jockey en T1 y T3 (uno por turno) → **ningún** "⚠ dup."; dos en el mismo turno → dup. sólo ahí;
- editar una fila de T3 estando en modo todos → el `UPDATE` lleva `carrera_id` de T3 (mutante: `currentCarreraId`);
- borrar en modo todos → la sección se recarga sin la fila;
- vista por turno idéntica a la de hoy (mismo HTML de tabla para un turno);
- mutantes: conteo global de jockeys, `carrera_id` desde la global, recarga que sale con `currentCarreraId` nulo.

---

## Preguntas abiertas

1. **¿Conocen la vista de `ratificacion.html`?** Ya muestra todos los turnos con scroll y saltos. Si lo que quieren es
   eso mismo pero con las columnas de Inscripciones (entrenador, suplente, cargada por, gatera), la propuesta de § 4
   es la correcta. Si les alcanza con ratificación, no hay que hacer nada.
2. **Portal**: ¿el pedido incluye que propietarios/entrenadores vean los anotados **de todos** en cada turno? Hoy la
   RLS no lo permite y abrirlo expone nombres de caballos/caballerizas de terceros antes del cierre. Lo dejo afuera
   (opción conservadora) salvo que Fede diga lo contrario.
3. ¿El modo "todos" tiene que ser el de arranque, o se elige? Propuesta: se elige (no cambia la entrada de Yesi).
4. ¿"+ Inscribir" por sección en modo todos (entrega siguiente) o alcanza con volver al turno?
5. Repo: la rama **local** `reports` de esta máquina está divergida de `origin/reports` (`ahead 1155, behind 99`)
   y tiene commits que no están en `origin` (p. ej. "report: resoluciones sin contador de borrador",
   "reports: incentivo de jockey R9 — …"). No la toqué: este informe se commiteó desde un worktree sobre `origin/reports`.
   Revisar si esos informes locales se perdieron en el push de otra sesión.
6. Baseline del guard: subir `spcs` a **239** en CLAUDE.md (primera alta por el portal, hoy 09:35 UTC).

---

## Anexo A — consultas corridas (todas `SELECT`, por MCP `supabase`)

Las cuatro están arriba con su salida completa: § Guards (últimas fichas de `spcs`), § 2 Permisos (conteo + políticas +
triggers), § 2 Rendimiento (volumen por reunión), § 3 (`fn_insc_monta_oficial_guard`).

## Anexo B — relevamiento de código contra `main` (salida cruda)

```
$ git rev-parse main
d52afe9350ebfbd75bd341bc178e6e2e198c8a96

$ git grep -n "from('inscripciones')" main -- "*.html" | cut -d: -f2,3
auditoria.html:305
inscripciones.html:607
inscripciones.html:638
inscripciones.html:855
inscripciones.html:856
inscripciones.html:879
inscripciones.html:910
liquidaciones.html:947
liquidaciones.html:1207
liquidaciones.html:1250
liquidaciones.html:1497
liquidaciones.html:1715
liquidaciones.html:2286
liquidaciones.html:2371
portal.html:814
programa-oficial-color.html:354
programa-oficial.html:234
programa.html:263
ratificacion.html:292
ratificacion.html:505
ratificacion.html:540
ratificacion.html:587
ratificacion.html:868
ratificacion.html:911
ratificacion.html:934
ratificacion.html:976
resultados.html:544
resultados.html:1704
resultados.html:1931
resultados_legacy.html:293

$ git grep -nE "async function (loadInscripciones|onReunionChange|onCarreraChange|saveRecord|deleteRecord|guardarGatera|printInscriptos)|function (renderInscripciones|avisarJockeyRepetido|openModal)\\(" main -- inscripciones.html
inscripciones.html:460:async function onReunionChange() {
inscripciones.html:494:async function onCarreraChange() {
inscripciones.html:598:async function loadInscripciones() {
inscripciones.html:627:async function guardarGatera(id, el) {
inscripciones.html:651:function renderInscripciones() {
inscripciones.html:784:function openModal(rec=null) {
inscripciones.html:828:async function saveRecord() {
inscripciones.html:868:function avisarJockeyRepetido(jockeyId) {
inscripciones.html:877:async function deleteRecord(id) {
inscripciones.html:885:async function printInscriptos() {

$ git grep -nE "async function (loadReunion|ratificar|volverInscripto|onJockeyChange|confirmMotivo|updatePeso|updateEstadoCarrera)|function (renderAll|goToTurno|recalcJockeyColisiones)\\(" main -- ratificacion.html
ratificacion.html:498:async function updatePeso(inscId, value) {
ratificacion.html:569:async function loadReunion() {
ratificacion.html:598:function renderAll(carreras, inscripciones) {
ratificacion.html:689:function goToTurno(carreraId, btnEl) {
ratificacion.html:782:async function updateEstadoCarrera(carreraId, nuevoEstado) {
ratificacion.html:828:function recalcJockeyColisiones(carreraId) {
ratificacion.html:865:async function onJockeyChange(sel) {
ratificacion.html:907:async function ratificar(inscId) {
ratificacion.html:932:async function volverInscripto(inscId) {
ratificacion.html:972:async function confirmMotivo() {

$ git grep -nE "async function (loadLlamado|cargarInscripcionesCrudas|loadMisInscripciones|retirar|guardarModificacion)|rpc\\(" main -- portal.html
portal.html:457:  const { data: ents } = await sb.rpc('fn_mis_entidades');
portal.html:514:  const { data: ids, error: eIds } = await sb.rpc('fn_mis_spc_ids');
portal.html:622:async function loadLlamado() {
portal.html:739:  const { data, error } = await sb.rpc('rpc_padron_spcs');
portal.html:813:async function cargarInscripcionesCrudas() {
portal.html:842:    sb.rpc('rpc_padron_profesionales'),
portal.html:1102:  const { error } = await sb.rpc('rpc_inscribir', {
portal.html:1302:async function loadMisInscripciones() {
portal.html:1371:async function retirar(inscId) {
portal.html:1383:  const { error } = await sb.rpc('rpc_baja_inscripcion', { p_inscripcion_id: inscId });
portal.html:1497:async function guardarModificacion() {
portal.html:1537:  const { data, error } = await sb.rpc('rpc_modificar_inscripcion', {

$ git grep -n "rpc_cambiar_monta" main -- resultados.html
resultados.html:2112:// ISSUE-084: la monta va por rpc_cambiar_monta, no por UPDATE directo. En carrera
resultados.html:2132:    const { data, error } = await sb.rpc('rpc_cambiar_monta', { p_inscripcion_id: u.id, p_jockey_id: u.jockey_titular_id });

$ git grep -lE "inscripciones\.html" main -- tests/
tests/probe_aviso_jockey_repetido.mjs
tests/probe_bolsa_efectiva.mjs
tests/probe_edad_display.mjs
tests/probe_mandil_colores.mjs
tests/probe_montas_post_oficial.mjs
tests/probe_orden_inscriptos.mjs
tests/probe_paridad_llamado_inscripciones.mjs
tests/probe_portal_alta_spc_ui.mjs
tests/probe_xss_portal_nombres.mjs

$ git grep -nE "extractFn\(INSC, '[^']+'" main -- tests/
tests/probe_aviso_jockey_repetido.mjs:192:  const src = extractFn(INSC, 'function renderInscripciones() {');
tests/probe_aviso_jockey_repetido.mjs:210:  const av = extractFn(INSC, 'function avisarJockeyRepetido(jockeyId) {');
tests/probe_bolsa_efectiva.mjs:148:    extractFn(INSC, 'function formatMonto(num) {'),
tests/probe_bolsa_efectiva.mjs:149:    extractFn(INSC, 'function esc(s) {'),
tests/probe_bolsa_efectiva.mjs:150:    extractFn(INSC, 'function fechaHora(iso) {'),
tests/probe_bolsa_efectiva.mjs:151:    extractFn(INSC, 'function textoEdad(c) {'),
tests/probe_bolsa_efectiva.mjs:152:    extractFn(INSC, 'function textoCondicion(c) {'),
tests/probe_bolsa_efectiva.mjs:153:    extractFn(INSC, 'async function onReunionChange() {'),
tests/probe_bolsa_efectiva.mjs:154:    extractFn(INSC, 'async function onCarreraChange() {'),
tests/probe_bolsa_efectiva.mjs:155:    extractFn(INSC, 'function renderCarreraHeader() {'),
tests/probe_bolsa_efectiva.mjs:156:    extractFn(INSC, 'function renderCarreraChips() {'),
tests/probe_bolsa_efectiva.mjs:157:    extractFn(INSC, 'function limpiarCarreraHeader() {'),
tests/probe_orden_inscriptos.mjs:93:const LOAD_SRC  = extractFn(INSC, 'async function loadInscripciones() {');
tests/probe_orden_inscriptos.mjs:94:const PRINT_SRC = extractFn(INSC, 'async function printInscriptos() {');
tests/probe_paridad_llamado_inscripciones.mjs:150:    extractFn(INSC, 'function formatMonto(num) {'),
tests/probe_paridad_llamado_inscripciones.mjs:151:    extractFn(INSC, 'function esc(s) {'),
tests/probe_paridad_llamado_inscripciones.mjs:152:    extractFn(INSC, 'function fechaHora(iso) {'),
tests/probe_paridad_llamado_inscripciones.mjs:153:    extractFn(INSC, 'function textoEdad(c) {'),
tests/probe_paridad_llamado_inscripciones.mjs:154:    extractFn(INSC, 'function textoCondicion(c) {'),
tests/probe_paridad_llamado_inscripciones.mjs:155:    extractFn(INSC, 'async function onReunionChange() {'),
tests/probe_paridad_llamado_inscripciones.mjs:156:    extractFn(INSC, 'async function onCarreraChange() {'),
tests/probe_paridad_llamado_inscripciones.mjs:157:    extractFn(INSC, 'function renderCarreraHeader() {'),
tests/probe_paridad_llamado_inscripciones.mjs:158:    extractFn(INSC, 'function renderCarreraChips() {'),
tests/probe_paridad_llamado_inscripciones.mjs:159:    extractFn(INSC, 'function limpiarCarreraHeader() {'),
```
