-- ============================================================
-- Unificar los dos pares de SPC duplicados — NO APLICADA
-- ============================================================
-- Ver docs/PLAN_DUPLICADOS_SPC.md. Confirmado por Yesi el 2026-08-23.
--
--   QUEDA  First Queen     214e5a7a-f773-4c44-95e9-41f0b25ef55a
--   SE VA  Fist Queen      0dc2f58f-0e2f-4915-be79-a7515fdd6ee4
--   QUEDA  Malenuchi Jack  9c9c742c-86a1-4c7b-a060-6ab47900b451
--   SE VA  Malenuchi       da839b11-00a3-4eb8-b09f-03790d425ed9
--
-- RELEVAMIENTO (2026-08-23): los CUATRO están limpios. Cero filas en
-- inscripciones, resultado_posiciones, liquidacion_detalle, performances,
-- spc_propietarios, spc_entrenadores_hist, novedades_reunion, sanciones,
-- resolucion_entidades, usuarios, auditoria, _gate41_backfill_tenencia y
-- bak_r8_propietario. Ninguno figura como padrillo o madre de otro SPC.
-- O sea: no hay historial que unificar y no hay resultado oficializado ni
-- liquidación pagada que pueda verse afectada.
--
-- Igual el script REPUNTA ANTES DE BORRAR y aborta si aparece algo que el
-- relevamiento no vio. Entre relevar y ejecutar puede pasar cualquier cosa.
--
-- ROLLBACK: migrations/rollback_merge_duplicados_spc.sql
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 0. Guardas. Si alguna falla, la transacción entera se cae.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_queda  uuid[] := ARRAY['214e5a7a-f773-4c44-95e9-41f0b25ef55a',
                           '9c9c742c-86a1-4c7b-a060-6ab47900b451']::uuid[];
  v_borrar uuid[] := ARRAY['0dc2f58f-0e2f-4915-be79-a7515fdd6ee4',
                           'da839b11-00a3-4eb8-b09f-03790d425ed9']::uuid[];
  v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM spcs WHERE id = ANY(v_queda || v_borrar);
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'Se esperaban los 4 SPC y hay %. Abortado.', v_n;
  END IF;

  -- Los que se borran no pueden estar en la misma carrera que su sobreviviente:
  -- el unique (carrera_id, spc_id) haría fallar el repunte. Hoy no hay ninguna
  -- inscripción, pero si mañana la hubiera esto lo detecta antes de romper nada.
  SELECT count(*) INTO v_n
    FROM inscripciones a JOIN inscripciones b ON a.carrera_id = b.carrera_id
   WHERE (a.spc_id, b.spc_id) IN (
     ('0dc2f58f-0e2f-4915-be79-a7515fdd6ee4'::uuid, '214e5a7a-f773-4c44-95e9-41f0b25ef55a'::uuid),
     ('da839b11-00a3-4eb8-b09f-03790d425ed9'::uuid, '9c9c742c-86a1-4c7b-a060-6ab47900b451'::uuid));
  IF v_n > 0 THEN
    RAISE EXCEPTION 'Colisión: % carrera(s) donde el duplicado y el sobreviviente están los dos. Resolver a mano.', v_n;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 1. Snapshot COMPLETO de las filas que se van — base del rollback.
--    Guarda el UUID original: reinsertar con el mismo id es lo que hace
--    que el rollback sea total.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS _bak_merge_duplicados_spc (
  fila         spcs      NOT NULL,
  sobreviviente uuid     NOT NULL,
  borrado_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE _bak_merge_duplicados_spc IS
  'Fichas de SPC borradas al unificar duplicados. Base del rollback. No la lee ninguna función de la app.';

INSERT INTO _bak_merge_duplicados_spc (fila, sobreviviente)
SELECT s, m.queda
  FROM spcs s
  JOIN (VALUES
    ('0dc2f58f-0e2f-4915-be79-a7515fdd6ee4'::uuid, '214e5a7a-f773-4c44-95e9-41f0b25ef55a'::uuid),
    ('da839b11-00a3-4eb8-b09f-03790d425ed9'::uuid, '9c9c742c-86a1-4c7b-a060-6ab47900b451'::uuid)
  ) AS m(se_va, queda) ON m.se_va = s.id;

-- ------------------------------------------------------------
-- 2. Repunte. Hoy afecta 0 filas en todas las tablas; queda por si
--    entre el relevamiento y la ejecución alguien cargó algo.
--    Las tres con ON DELETE CASCADE (performances, spc_entrenadores_hist,
--    spc_propietarios) también se repuntan a propósito: sin esto el DELETE
--    se las llevaría en silencio en vez de conservarlas en el sobreviviente.
-- ------------------------------------------------------------
CREATE TEMP TABLE _map(se_va uuid PRIMARY KEY, queda uuid) ON COMMIT DROP;
INSERT INTO _map VALUES
  ('0dc2f58f-0e2f-4915-be79-a7515fdd6ee4', '214e5a7a-f773-4c44-95e9-41f0b25ef55a'),
  ('da839b11-00a3-4eb8-b09f-03790d425ed9', '9c9c742c-86a1-4c7b-a060-6ab47900b451');

UPDATE inscripciones         x SET spc_id = m.queda FROM _map m WHERE x.spc_id = m.se_va;
UPDATE performances          x SET spc_id = m.queda FROM _map m WHERE x.spc_id = m.se_va;
UPDATE novedades_reunion     x SET spc_id = m.queda FROM _map m WHERE x.spc_id = m.se_va;
UPDATE spc_entrenadores_hist x SET spc_id = m.queda FROM _map m WHERE x.spc_id = m.se_va;
UPDATE spc_propietarios      x SET spc_id = m.queda FROM _map m WHERE x.spc_id = m.se_va;
UPDATE sanciones             x SET entidad_id = m.queda FROM _map m
  WHERE x.entidad_tipo = 'spc' AND x.entidad_id = m.se_va;
UPDATE resolucion_entidades  x SET entidad_id = m.queda FROM _map m
  WHERE x.entidad_tipo = 'spc' AND x.entidad_id = m.se_va;
-- _gate41_backfill_tenencia NO se repunta: es la bitácora de qué tocó el
-- backfill, no un dato del caballo. Se borra su fila si la hubiera.
DELETE FROM _gate41_backfill_tenencia x USING _map m WHERE x.spc_id = m.se_va;

-- ------------------------------------------------------------
-- 3. El DELETE.
-- ------------------------------------------------------------
DELETE FROM spcs WHERE id IN (
  '0dc2f58f-0e2f-4915-be79-a7515fdd6ee4',
  'da839b11-00a3-4eb8-b09f-03790d425ed9');

COMMIT;

-- ============================================================
-- VERIFICACIÓN — ver docs/PLAN_DUPLICADOS_SPC.md §5
-- ============================================================
--   SELECT count(*) FROM spcs;   -- espera 181
--   SELECT count(*) FROM spcs WHERE id IN ('0dc2f58f-…','da839b11-…');  -- espera 0
--   SELECT nombre, padrillo_nombre, madre_nombre FROM spcs
--    WHERE id IN ('214e5a7a-…','9c9c742c-…');
--   -- espera First Queen (NULL, NULL) y Malenuchi Jack (Emir Jack, Quartermaster)
