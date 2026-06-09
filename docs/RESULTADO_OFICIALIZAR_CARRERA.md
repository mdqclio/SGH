# 2bis — Oficializar / Des-oficializar carrera (resultado)

> Fecha: 2026-06-09 · Rama: `feat/oficializar-carrera` (desde `main` ccc83d7, que ya incluye
> incentivos-montas 47362ef) · **NO mergeado a main.** Toca el flujo de plata.
> Confirmado por Fede; pendiente tu revisión del diff antes de merge.

## Resumen

Oficializar es **por carrera** y reversible. Oficializar una carrera = marcarla `oficial` +
**generar su liquidación** (pay-as-you-go). Des-oficializar revierte (con guard de pagos).
La **reunión** es oficial cuando **todas** sus carreras lo están (estado derivado, no se persiste).

**Cambio de enfoque (confirmado Fede):** NO se portó el motor a PL/pgSQL (evita duplicación/drift).
El motor de liquidación sigue siendo JS y se **reusa** como fuente única. La atomicidad es
**orquestación del cliente, no transacción única**: si la generación falla tras marcar oficial,
la carrera queda *oficial sin liquidar* → se arregla con **"Recalcular reunión"** (la red).
Tradeoff aceptado.

## Approach del incentivo jockey (lo manejás el recompute)

El incentivo jockey es **per-reunión** (50k, una sola línea por jockey que corrió ≥1, `carrera_id`
y `inscripcion_id` = null). Lo maneja el **recompute paid-safe**, no la oficialización per-carrera:
cada vez que se oficializa/des-oficializa una carrera se recalcula la reunión completa desde sus
resultados oficiales, y el motor **deduplica** el incentivo jockey (1 línea por jockey con ≥1 monta
oficial). No se genera per-carrera (no se duplica), y el paid-safe **no dropea ni duplica** una línea
de incentivo jockey ya pagada (se preserva por clave de línea).
→ Probado: jockey con montas en 2 carreras oficiales = **1** sola línea (check c1/c2).

## Diseño paid-safe (el corazón)

`generarLiquidaciones` dejó de **bloquear** cuando hay líneas pagadas/aprobadas. Ahora **preserva**
las líneas comprometidas (`estado_linea='pagado'` OR `recibo_id IS NOT NULL`) y sus headers, y
**recalcula sólo lo no pagado** desde los resultados oficiales. Habilita pay-as-you-go.

- Unidad de compromiso = la **línea** (ADR-042). "Pagado" = `estado_linea='pagado'` OR `recibo_id`
  (lo que setea `emitir_recibo`; no toca el estado del header → el header es secundario).
- Idempotente: borra lo no-pagado + regenera; lo pagado se saltea por **clave de línea**
  (`beneficiario_tipo|beneficiario_id|concepto_tipo|inscripcion_id|posicion|concepto`) para no duplicar.
- **Ninguna regla de plata cambió** (premios, bono ganador fundido, piso `ganancia_minima`, empates/
  dead-heat, bono 6-8, fondo solidario, reparto por roles + subs peón/capataz/sereno, descuentos
  `comision_config`, retención anti-doping 1°/2°, incentivos). Sólo cambió la **persistencia**:
  de "borrar+recrear todo" a "preservar pagado + recalcular el resto".
- **Mejora**: el motor ahora **puebla `liquidacion_detalle.carrera_id`** (antes quedaba null; la
  carrera se derivaba por `inscripcion_id`). Es aditivo (nada filtraba por carrera_id null; el
  filtro-carrera de cobros deriva por inscripción). Habilita el scope per-carrera directo.

## Arquitectura / archivos

| Archivo | Cambio |
|---|---|
| **`liquidaciones-engine.js`** (NUEVO) | Motor único `generarLiquidacionesReunion({sb,clubId,reunionId,liqConfig?,comCfg?,fmt?})`, paid-safe, self-contained (IIFE global, patrón `premios-utils.js`). Devuelve `{created,headers,preserved,error}`. |
| `liquidaciones.html` | `generarLiquidaciones()` pasó a wrapper fino → motor. Botón **"🔄 Recalcular reunión"** (era "⚡ Generar liquidaciones"). Incluye el engine. |
| `resultados.html` | `oficializar()` ahora: `aplicar(oficial)` (reusá aplicar_resultado) + performances + **motor**. Nuevo `desoficializar()` (guard + provisional + borra performances + motor). Botón "⚠️ Modificar" → **"↩️ Des-oficializar"**. Badge **reunión oficial/provisional** derivado en `renderLista`. Incluye el engine. Texto "irreversible" corregido. |
| `migrations/desoficializar_carrera.sql` (NUEVO) | RPC opcional de hardening DB (guard + flip, RAISE real). Ver abajo. |
| `tests/probe_oficializar_carrera.mjs` (NUEVO) | Probe real-code (22 checks, 22/22). |

## Guard de des-oficializar (obligatorio)

`desoficializar(resId, carreraId)`: si la carrera tiene **alguna** línea comprometida
(`recibo_id IS NOT NULL` OR `estado_linea='pagado'`; scope por `carrera_id` **o** `inscripcion_id`
de la carrera) → aborta con el mensaje exacto **"carrera con pagos emitidos, anulá los recibos
primero"** y NO revierte. Sin pagos → `provisional` + borra performances + recompute (dropea sus líneas).

**Enforcement:** hoy el guard corre en el **cliente** (no había SQL-write MCP en esta sesión para
aplicar DDL). El motor paid-safe es el **backstop**: nunca dropea una línea pagada aunque el guard
se bypasee. Para enforcement duro en DB (RAISE imposible de bypassear, guard+flip atómico) se deja
`migrations/desoficializar_carrera.sql` (`desoficializar_carrera(p_carrera_id)`, SECURITY DEFINER) —
**aplicar por MCP** y luego, opcionalmente, cambiar el cliente para `sb.rpc('desoficializar_carrera',…)`
en vez del UPDATE directo.

### DDL `desoficializar_carrera` (sin aplicar)

```sql
CREATE OR REPLACE FUNCTION desoficializar_carrera(p_carrera_id uuid)
RETURNS resultados LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_res resultados; v_pagas int;
BEGIN
  SELECT count(*) INTO v_pagas FROM liquidacion_detalle d
   WHERE (d.recibo_id IS NOT NULL OR d.estado_linea = 'pagado')
     AND ( d.carrera_id = p_carrera_id
        OR d.inscripcion_id IN (SELECT i.id FROM inscripciones i WHERE i.carrera_id = p_carrera_id) );
  IF v_pagas > 0 THEN
    RAISE EXCEPTION 'carrera con pagos emitidos, anulá los recibos primero';
  END IF;
  UPDATE resultados SET estado='provisional', oficializado_at=NULL, oficializado_por=NULL
   WHERE carrera_id = p_carrera_id RETURNING * INTO v_res;
  IF NOT FOUND THEN RAISE EXCEPTION 'no hay resultado para esta carrera'; END IF;
  RETURN v_res;
END $$;
```

## "Las 2 RPCs" (ahora orquestaciones de cliente)

- **oficializar_carrera** = `resultados.html::oficializar(carreraId)`: `aplicar(carreraId,'oficial')`
  (reusá `aplicar_resultado`) + performances + `generarLiquidacionesReunion(R)`. Idempotente
  (el motor es idempotente). Si el motor falla → toast "oficial pero no liquidó, usá Recalcular".
- **desoficializar_carrera** = `resultados.html::desoficializar(resId, carreraId)`: guard duro +
  `update resultados set estado='provisional'` + borra performances + `generarLiquidacionesReunion(R)`.

## Reconciliación con el flujo actual (item 4)

El botón viejo "⚡ Generar liquidaciones" (recompute de reunión) pasó a **"🔄 Recalcular reunión"**:
red de seguridad / recompute manual. Ya no bloquea (paid-safe). Oficializar-carrera genera
incrementalmente; Recalcular es para arreglar drift (p.ej. una carrera quedó oficial sin liquidar).

## Probe (real-code, R5) — 22/22

Corre el **motor real** (`liquidaciones-engine.js`) + el **cuerpo real** de `desoficializar()`
(AsyncFunction + stubs DOM + Supabase real). snapshot→mutate→run→assert→restore. Restore íntegro.

```
✅ a1 oficializar CAR_A → genera líneas con carrera_id=CAR_A  (lineas=21)
✅ a2 CAR_A genera al menos un premio
✅ a3 CAR_B (provisional) NO tiene líneas  (lineas=0)
✅ f1 reunión NO oficial con 1 sola carrera oficial
✅ a4 oficializar CAR_B → genera SUS líneas  (lineas=10)
✅ c1 jockey con montas en 2 carreras → 1 sola línea incentivo_jockey  (lineas=1)
✅ c2 la línea de incentivo jockey no tiene carrera_id (per-reunión)
✅ b0 recompute con línea pagada NO devuelve error (no bloquea)  (headers=10 preserved=1)
✅ b1 la línea pagada se preservó (sigue pagada)  (pagadas=1)
✅ b2 no se duplicó la línea pagada (1 sola con esa clave)  (count=1)
✅ b3 CAR_B sigue con sus líneas tras el recompute
✅ e1 guard duro: mensaje exacto  (carrera con pagos emitidos, anulá los recibos primero)
✅ e2 NO revierte: CAR_A sigue oficial  (estado=oficial)
✅ e3 la línea pagada de CAR_A sigue presente
✅ d1 des-oficializar sin pagos → CAR_B provisional  (estado=provisional)
✅ d2 líneas de CAR_B dropeadas
✅ d3 CAR_A intacta (línea pagada preservada)
✅ d4 no rompe: sin mensaje de error de pagos  (↩️ Resultado des-oficializado)
✅ f2 reunión oficial cuando TODAS las carreras lo están
✅ f3 reunión NO oficial si una carrera no lo está
✅ R1 restore liquidaciones (count == original)  (final=8 original=8)
✅ R2 restore roles de inscripciones

✅ TODO OK — 22 checks
```

`node tests/probe_oficializar_carrera.mjs` (source `.env` antes).

## Pendiente / para tu revisión

1. **Aplicar `migrations/desoficializar_carrera.sql`** por MCP (no había SQL-write MCP esta sesión)
   para el guard duro a nivel DB. Hoy: guard cliente + backstop paid-safe.
2. **Semántica del `estado` del header** (`borrador/aprobada/pagada`): el motor **no** lo toca en el
   recompute (preserva el existente; `borrador` sólo en headers nuevos). Con pay-as-you-go un header
   "pagada" puede recibir líneas nuevas impagas — el estado del header queda secundario al estado por
   línea. Si querés que el header refleje "tiene impagos", lo ajusto.
3. **NO mergeado a main.** Decidí merge con tu OK + el de Leonardo.
