-- ============================================================================
-- rpc_caballeriza_provisorio — propietario PROVISORIO para UNA caballeriza sin titular
--
-- Criterio de Fede (15/08/2026): sin titular conocido, la caballeriza se crea igual y
-- el dueño es un propietario provisorio con el nombre de la caballeriza, sin documento,
-- marcado en notas; se completa cuando aparece el real. Es el bloque DO de
-- migrations/propietarios_provisorios_r9.sql acotado a una caballeriza, para que lo
-- llame caballerizas.html (alta/edición con titular vacío; botón "Crear provisorio").
--
-- Plan: docs/diagnosticos/2026-09-16_plan-caballeriza-titular-opcional-provisorio.md
-- (reports). Diagnóstico: 2026-09-16_alta-caballeriza-exige-titular.md.
--
-- Idempotente: si ya hay titular activo, no hace nada y lo dice. Reusa un provisorio
-- previo con el mismo nombre (= DO). Si hay un propietario REAL homónimo, no adivina:
-- falla y pide cargarlo como titular. Re-deriva TODAS las inscripciones sin
-- propietario de la caballeriza (decisión de Leo 11/09: no re-liquida, deja el
-- historial con dueño). El vínculo va SIN DNI: trg_cab_resp_set_propietario sólo
-- actúa con documento_nro NOT NULL, así que respeta el propietario_id que se le da.
--
-- Aplicar por MCP apply_migration (nombre: rpc_caballeriza_provisorio). Es DDL que
-- queda; las gemelas de mutantes van por execute_sql (GOTCHAS "gemela que revive").
-- Rollback: DROP FUNCTION public.rpc_caballeriza_provisorio(uuid);
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_caballeriza_provisorio(p_caballeriza_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cab      RECORD;
  v_prop     uuid;
  v_resp     uuid;
  v_creado   boolean := false;
  v_rederiv  int;
  v_marca    text;
BEGIN
  -- (1) sólo secretaría / operador / super_admin
  IF NOT fn_is_staff() THEN
    RAISE EXCEPTION 'No autorizado: esta operación es de la secretaría.';
  END IF;

  -- (2) la caballeriza existe y es de mi club (super_admin ve todas). FOR UPDATE:
  --     dos clicks no crean dos vínculos.
  SELECT * INTO v_cab FROM caballerizas WHERE id = p_caballeriza_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La caballeriza no existe.';
  END IF;
  IF NOT fn_is_super_admin() AND v_cab.club_id IS DISTINCT FROM fn_get_user_club_id() THEN
    RAISE EXCEPTION 'Esa caballeriza es de otro hipódromo.';
  END IF;

  -- (3) ya tiene titular activo → no-op (idempotencia)
  SELECT cr.propietario_id INTO v_prop
    FROM caballeriza_responsables cr
   WHERE cr.caballeriza_id = p_caballeriza_id AND cr.rol = 'propietario' AND cr.activo
   ORDER BY cr.created_at NULLS LAST, cr.id LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'creado', false, 'motivo', 'ya tiene titular',
                              'propietario_id', v_prop, 'inscripciones_rederivadas', 0);
  END IF;

  -- (4) homónimo REAL (no provisorio) en el club → no se adivina
  IF EXISTS (
    SELECT 1 FROM propietarios p
     WHERE p.club_id = v_cab.club_id
       AND upper(btrim(p.nombre)) = upper(btrim(v_cab.nombre))
       AND (p.notas IS NULL OR p.notas NOT ILIKE 'provisorio%')
  ) THEN
    RAISE EXCEPTION 'Ya existe un propietario "%" en este hipódromo. Cargalo como titular (apellido, nombre y DNI) en vez de crear un provisorio.', v_cab.nombre;
  END IF;

  -- (5) provisorio previo con el mismo nombre → reusar (= DO); si no, crear
  v_marca := 'provisorio alta ' || to_char(now() AT TIME ZONE 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY');
  SELECT p.id INTO v_prop
    FROM propietarios p
   WHERE p.club_id = v_cab.club_id
     AND upper(btrim(p.nombre)) = upper(btrim(v_cab.nombre))
     AND p.notas ILIKE 'provisorio%' AND p.activo
   ORDER BY p.created_at, p.id LIMIT 1;
  IF v_prop IS NULL THEN
    INSERT INTO propietarios (club_id, tipo, nombre, activo, estado, notas)
    VALUES (v_cab.club_id, 'persona', v_cab.nombre, true, 'activo', v_marca)
    RETURNING id INTO v_prop;
    v_creado := true;
  END IF;

  -- (6) el vínculo, misma forma que los 47 existentes: sin DNI → el trigger respeta propietario_id
  INSERT INTO caballeriza_responsables (caballeriza_id, propietario_id, rol, activo, nombre, documento_tipo)
  VALUES (p_caballeriza_id, v_prop, 'propietario', true, v_cab.nombre, 'DNI')
  RETURNING id INTO v_resp;

  -- (7) re-derivar las inscripciones de ESTA caballeriza que quedaron sin propietario
  UPDATE inscripciones SET propietario_id = v_prop
   WHERE caballeriza_id = p_caballeriza_id AND propietario_id IS NULL;
  GET DIAGNOSTICS v_rederiv = ROW_COUNT;

  -- (8) el texto legado, como lo escribe el form
  UPDATE caballerizas SET responsable = v_cab.nombre || ' (propietario provisorio)' WHERE id = p_caballeriza_id;

  RETURN jsonb_build_object('ok', true, 'creado', v_creado, 'propietario_id', v_prop,
                            'responsable_id', v_resp, 'marca', v_marca,
                            'inscripciones_rederivadas', v_rederiv);
END;
$$;

COMMENT ON FUNCTION public.rpc_caballeriza_provisorio(uuid) IS
  'Secretaría: crea el propietario provisorio (nombre de la caballeriza, sin DNI, notas "provisorio alta DD/MM/YYYY") + vínculo rol propietario para una caballeriza sin titular, y re-deriva sus inscripciones sin propietario. Idempotente. Criterio Fede 15/08/2026.';

REVOKE ALL     ON FUNCTION public.rpc_caballeriza_provisorio(uuid) FROM PUBLIC;
REVOKE ALL     ON FUNCTION public.rpc_caballeriza_provisorio(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.rpc_caballeriza_provisorio(uuid) TO authenticated;
