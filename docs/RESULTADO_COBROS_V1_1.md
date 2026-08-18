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

`benefSearch` matchea: profesional → nombre+apellido+documento_nro; propietario → nombre+nombre_stud+documento_nro. Caballeriza sigue resolviendo a su propietario titular (`caballeriza_responsables`, `rol='propietario'` + `activo=true`).

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

**Output (RPCs aplicadas 2026-06-08 — 11/11 ✅):**
```
✅ a1 retenida (fecha pasada) NO está en pagable (impago)
✅ a2 emitir SOLO la retenida → RPC rechaza (no es pagable pese a fecha pasada)
✅ b1 liberar_linea retenido→impago
✅ b2 tras liberar, la línea ya es emitible (recibo creado, total 5000)
✅ c1 liberar_linea sobre no-retenida → error controlado
✅ d1 benefSearch incluye el nombre   ✅ d2 apellido   ✅ d3 documento (DNI=36384455)
✅ e1 filtro carreraA incluye LI (carreraA)   ✅ e2 EXCLUYE LB (carreraB)
✅ R1 cleanup: fixtures borradas
✅ TODO OK — 11 checks
```
Ambas RPCs vivas en la DB (`emitir_recibo` v1.1 + `liberar_linea`). Fixtures del probe limpiadas.

> **Nota — dato real en prod:** al verificar el estado quedó **1 recibo real** (N°1, cobrador
> "Federico heredia", $100.000, su línea pagada apuntándolo) + `club_secuencias` en 1. **NO es del
> probe** (el del probe era cobrador "T"/$5000, ya borrado) — alguien usó el tab Pagos en producción.
> Se deja intacto (es un cobro real). El probe limpió solo lo suyo.

## Estado

Las 2 RPCs aplicadas y verificadas. Frontend en la rama. Falta: tu OK final → merge a main + deploy.
