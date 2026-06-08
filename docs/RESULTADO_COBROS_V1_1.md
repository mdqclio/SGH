# Pagos (ex-Cobros) v1.1 — liberación manual del doping + búsqueda + filtro por carrera

> Fecha: 2026-06-08 · Rama: `feat/cobros-v1.1` (desde main) · **NO mergeado a main.**
> Toca la RPC del flujo de plata. **PENDIENTE TU OK:** aplicar 2 RPCs a la DB + correr el probe.

## Regla de dominio (Fede)

Liberación del doping = **100% MANUAL**. La retención automática 1°/2° (Fase C) **NO se toca** — se siguen marcando `retenido` solos al generar. Lo que cambia: la línea queda retenida hasta que la secretaría la habilita a mano (cuando llega el resultado del doping). `fecha_liberacion` pasa a ser **solo referencia**, no libera sola.

## Schema de búsqueda encontrado (verificado, no inventado)

| tabla | campos buscables |
|---|---|
| **profesionales** | `nombre`, `apellido`, `documento_nro` (+ `documento_tipo`) |
| **propietarios** | `nombre`, `documento_nro`, `nombre_stud` — **NO tiene `apellido`** (todo en `nombre`) |

`benefSearch` matchea: profesional → nombre+apellido+documento_nro; propietario → nombre+nombre_stud+documento_nro. Caballeriza sigue resolviendo a su propietario titular (`caballeriza_responsables.es_titular`).

## 1. RPC `emitir_recibo` — pagable = SOLO impago (DDL, `migrations/emitir_recibo_v1_1.sql`)

Único cambio vs. la versión en prod: la cláusula de pagable del UPDATE.

```diff
   UPDATE liquidacion_detalle d
      SET estado_linea = 'pagado', recibo_id = v_recibo.id, pagado_at = now()
    WHERE d.id = ANY(p_linea_ids)
      AND d.beneficiario_id = p_beneficiario_id
      AND d.recibo_id IS NULL
-     AND ( d.estado_linea = 'impago'
-        OR (d.estado_linea = 'retenido' AND d.fecha_liberacion IS NOT NULL AND d.fecha_liberacion <= current_date) );
+     AND d.estado_linea = 'impago';
```
Resto idéntico (número correlativo, insert recibos, totales, RAISE si 0 marcadas). Reversible: re-aplicar `migrations/emitir_recibo_fase4.sql`.

## 2. Mini-RPC `liberar_linea(p_linea_id uuid)` (DDL, `migrations/liberar_linea.sql`)

```sql
CREATE OR REPLACE FUNCTION liberar_linea(p_linea_id uuid)
RETURNS liquidacion_detalle LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_row liquidacion_detalle; v_club uuid;
BEGIN
  SELECT fn_club_de_liquidacion(liquidacion_id) INTO v_club FROM liquidacion_detalle WHERE id=p_linea_id;
  IF v_club IS NULL AND NOT EXISTS (SELECT 1 FROM liquidacion_detalle WHERE id=p_linea_id) THEN
    RAISE EXCEPTION 'liberar_linea: línea inexistente'; END IF;
  -- club scoping (mismo criterio que la RLS); backend service_role (sin usuario) pasa
  IF fn_get_user_club_id() IS NOT NULL AND NOT fn_is_super_admin()
     AND v_club IS DISTINCT FROM fn_get_user_club_id() THEN
    RAISE EXCEPTION 'liberar_linea: línea de otro club'; END IF;
  UPDATE liquidacion_detalle SET estado_linea='impago'
   WHERE id=p_linea_id AND estado_linea='retenido' RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'liberar_linea: la línea no existe o no está en retenido'; END IF;
  RETURN v_row;
END $$;
```

- **Club scoping** replica la RLS de `liquidacion_detalle` (`fn_is_super_admin() OR fn_club_de_liquidacion(liquidacion_id)=fn_get_user_club_id()`): se enforce cuando hay usuario autenticado; el backend `service_role` (sin usuario → `fn_get_user_club_id()` NULL) pasa, como god-role. **No se tocan grants/permisos** (sin REVOKE/GRANT), solo la lógica.
- Solo flipea líneas en `retenido`. Reversible: `DROP FUNCTION liberar_linea(uuid)`.

## 3-6. Frontend (`liquidaciones.html`, +101/-39)

- **Buscador/detalle/emisión = SOLO impago.** Sacado el filtro `fecha_liberacion.lte.hoy` de las queries (buscador y detalle). Las `retenido` ya no entran al total ni a la emisión.
- **Sección "🔒 Retenido por doping"** en el detalle: lista las retenidas con su `fecha_liberacion` de referencia + botón **"✅ Habilitar"** → `habilitarLinea` → `sb.rpc('liberar_linea')` → refresca (pasa a pagable).
- **Filtro por carrera**: selects Reunión + Carrera en la barra de Pagos. Carrera se puebla de la reunión (label `numero_carrera_programa ?? numero_turno`, GOTCHA). Al elegir carrera, acota la lista por las inscripciones de esa carrera.
- **Búsqueda por nombre/apellido/DNI** (`benefSearch`): matchea en propietarios y profesionales (campos reales de arriba). Caballeriza → propietario titular (sin cambio).
- **Rename visible** cobrar/cobro/cobros → pagar/pago/pagos: tab "🧾 Pagos", botón "🧾 Pagar", encabezado "Pago — <nombre>", textos. **Nombres internos de funciones se dejan** (`cobrosBuscar`, `switchTab('cobros')`, `panel-cobros`, etc.). Se mantiene `fmt`/`formatMonto` (GOTCHA #46).

**No tocado:** generador, bonos, retención automática 1°/2° (siguen marcándose `retenido` solos — solo cambia la liberación).

## Probe — `tests/probe_cobros_v11.mjs` (PENDIENTE correr — necesita las RPCs aplicadas)

Real-code: RPCs `emitir_recibo` v1.1 + `liberar_linea` + función JS real `benefSearch` (extraída del HTML). Fixtures sobre R5 (líneas en 2 carreras), snapshot→run→assert→restore (+ restaura `club_secuencias`):
- (a) retenida con **fecha pasada** NO es pagable ni emitible (confirma que salió el OR de fecha).
- (b) `liberar_linea` retenido→impago → ahí sí pagable/emitible (recibo, total 5000).
- (c) `liberar_linea` sobre no-retenida → error controlado.
- (d) `benefSearch` matchea por nombre / apellido / DNI.
- (e) filtro por carrera acota (carreraA incluye su línea, excluye la de carreraB).

**Output:** _pendiente — se corre cuando autorices aplicar las 2 RPCs._

## Qué falta para cerrar

1. Tu **OK al DDL** (las 2 RPCs de arriba) → aplico `emitir_recibo_v1_1.sql` + `liberar_linea.sql` por MCP.
2. Corro `tests/probe_cobros_v11.mjs`, pego output acá.
3. Con tu OK + el mío → merge a main + deploy.
