-- ═══════════════════════════════════════════════════════════════════════════════
-- ISSUE-065 — Revocar el DELETE de `recibos` para los roles de aplicación
--
-- ⚠️ NO APLICADA. Este archivo está pusheado para revisión. Toca permisos.
--
-- EL AGUJERO
--   Hoy un usuario autenticado puede borrar un recibo por PostgREST:
--
--     DELETE /rest/v1/recibos?id=eq.<uuid>
--
--   sin pasar por `anular_recibo`. Y las dos operaciones NO son equivalentes:
--
--     anular_recibo  → estado='anulado', anulado_at, anulado_por, motivo_anulacion,
--                      lineas_anuladas (la FOTO de las filas, v2), el número NO se
--                      reutiliza, y las líneas vuelven al estado que corresponde.
--     DELETE         → la fila desaparece. Queda la auditoría (ver abajo), pero el
--                      recibo deja de existir para todo el resto del sistema.
--
--   Mientras esto esté abierto, todo el circuito de anulación es OPCIONAL: hay un
--   camino más corto que no deja el rastro que el circuito existe para dejar.
--
-- LO QUE SÍ QUEDA HOY (matiz importante, medido — no es "no deja nada")
--   `recibos` TIENE trigger de auditoría (`trg_audit_recibos` → `fn_auditoria_log`),
--   así que un DELETE escribe una fila en `auditoria` con `datos_antes` = la fila
--   entera. El recibo es reconstruible desde ahí.
--   Lo que NO queda es qué líneas tenía: `liquidacion_detalle` no tiene trigger, y
--   `lineas_anuladas` sólo lo llena `anular_recibo`. Borrar un recibo deja el importe
--   pero no su composición.
--
-- LA MECÁNICA DEL BORRADO, EN DOS PASOS (por qué la FK no protege)
--   `liquidacion_detalle_recibo_id_fkey` es ON DELETE NO ACTION, así que un recibo
--   CON líneas apuntándolo no se puede borrar de una. Hay que:
--     1. UPDATE liquidacion_detalle SET recibo_id=NULL WHERE recibo_id=X   (permitido)
--     2. DELETE FROM recibos WHERE id=X                                    (permitido)
--   Es exactamente el revert manual del recibo #4 del 28/08. La FK es un badén, no un
--   guard.
--   Y OJO: un recibo ANULADO ya no tiene líneas apuntándolo (anular las suelta), así
--   que **se borra en UN solo paso**. El registro que creamos para preservar el rastro
--   es el más fácil de borrar de todos.
--
-- QUÉ HACE ESTA MIGRACIÓN — dos capas, ambas acotadas a `recibos`
--   1. DROP de la policy `recibos_delete`. Sin policy permisiva de DELETE, la RLS
--      rechaza. PERO el rechazo es SILENCIOSO: PostgREST devuelve 204 y 0 filas
--      afectadas, porque la RLS filtra las filas y el DELETE no matchea ninguna.
--   2. REVOKE del privilegio DELETE. Esto convierte el rechazo en un ERROR duro
--      (42501, "permission denied"), que es lo que corresponde a una operación
--      prohibida: fallar ruidoso, no en silencio.
--   Las dos capas se testean POR SEPARADO (lección de GOTCHA #86: si una capa no
--   tiene un observable propio, no hay forma de saber cuándo dejó de actuar).
--
-- POR QUÉ NI SIQUIERA SUPER_ADMIN
--   Porque para eso está `anular_recibo`, que YA tiene la excepción de super_admin:
--   pasados los 5 días, sólo un super_admin puede anular. Lo único que agrega el
--   DELETE por encima de eso es la capacidad de destruir el rastro — que es
--   precisamente lo que no se quiere. Se revisó caso por caso y ninguno queda sin
--   salida:
--     · recibo mal emitido, mismo día         → anular_recibo
--     · recibo mal emitido, +5 días           → anular_recibo como super_admin
--     · recibo anulado por error              → no se des-anula, y borrarlo tampoco
--                                               lo arreglaría: se emite uno nuevo
--     · purgar recibos de prueba de prod      → service_role por consola, que es lo
--                                               que se usó las 387 veces que pasó
--
-- QUÉ NO SE ROMPE
--   · El front NO borra recibos. La única referencia a `from('recibos')` en
--     `liquidaciones.html` es un `.select()`. El botón rojo del panel dice "Anular
--     recibo" y llama al RPC.
--   · Los 8 probes que borran recibos en su cleanup usan el cliente de
--     SUPABASE_SECRET_KEY → rol `service_role`, que tiene `rolbypassrls = true` y
--     conserva su GRANT. Ninguno borra recibos con un cliente autenticado (verificado
--     por grep: no existe un solo `cli.from('recibos')`).
--
-- FUERA DE ALCANCE, a propósito
--   `liquidaciones` y `liquidacion_detalle` tienen policies de DELETE equivalentes, y
--   ahí el agujero es PEOR porque tiene camino desde la UI (`eliminarLiq`) y la FK
--   `liquidacion_detalle_liquidacion_id_fkey` es ON DELETE CASCADE. Va como ISSUE
--   aparte — ver ISSUE-067. Esta migración no toca esas tablas.
--
-- Guards (2026-08-30): pwd=/home/clio/dev/SGH · spcs=181 · ref=unlhcuanfrtpatoipwve ·
-- recibos=5 · una sola policy de DELETE sobre recibos (`recibos_delete`, {authenticated}).
--
-- Verificación previa a aplicar:
--   SELECT polname FROM pg_policy WHERE polrelid='recibos'::regclass AND polcmd='d';
--   -- tiene que devolver exactamente: recibos_delete
--
-- Rollback: migrations/rollback_revocar_recibos_delete.sql
-- Probe:    tests/probe_recibos_delete_revocado.mjs
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── capa 1: la policy ─────────────────────────────────────────────────────────
-- Sin policy permisiva de DELETE, la RLS no deja borrar a ningún rol que no la
-- saltee. No se reemplaza por una versión restringida a super_admin: ver arriba.
DROP POLICY IF EXISTS recibos_delete ON public.recibos;

-- ── capa 2: el privilegio ─────────────────────────────────────────────────────
-- El GRANT es lo que hace la diferencia entre "0 filas en silencio" y "permission
-- denied". Una operación prohibida tiene que fallar ruidoso.
-- `anon` lo tiene por los GRANT por defecto de Supabase aunque hoy no tenga ninguna
-- policy sobre esta tabla: se revoca igual, para que el día que alguien agregue una
-- policy de anon no se abra sin querer.
REVOKE DELETE ON public.recibos FROM authenticated;
REVOKE DELETE ON public.recibos FROM anon;

-- `service_role` conserva su DELETE a propósito: es lo que usan los probes para
-- limpiar sus fixtures, y es la única vía de recuperación que queda si alguna vez
-- hace falta purgar algo por consola.

COMMENT ON TABLE public.recibos IS
  'Recibos de pago. NO se borran: se anulan con anular_recibo(), que deja estado, '
  'motivo, autor, fecha y la foto de las líneas. El DELETE está revocado para '
  'authenticated y anon (ISSUE-065, 2026-08-30) — sólo service_role puede borrar, '
  'por consola. Si necesitás revertir un recibo, es anular_recibo, no DELETE.';

-- ── verificación posterior (correr después de aplicar) ────────────────────────
-- 1) no queda ninguna policy de DELETE:
--    SELECT count(*) FROM pg_policy WHERE polrelid='recibos'::regclass AND polcmd='d';
--    -- esperado: 0
--
-- 2) authenticated y anon perdieron el privilegio, service_role lo conserva:
--    SELECT grantee, privilege_type FROM information_schema.role_table_grants
--     WHERE table_name='recibos' AND privilege_type='DELETE' ORDER BY grantee;
--    -- esperado: postgres, service_role (NO authenticated, NO anon)
--
-- 3) el probe, que verifica las dos capas por separado y que anular_recibo sigue vivo:
--    set -a; . ./.env; set +a
--    node tests/probe_recibos_delete_revocado.mjs
