-- ============================================================
-- Gate 4.3 — inscripciones_select: el portal ve SÓLO lo suyo
-- ============================================================
-- Ver docs/AUTOREGISTRO_GATE_4.md §1.4 y §C.6.
--
-- EL HUECO (preexistente, no lo introduce el gate 4)
--   La policy actual es:
--       fn_is_super_admin() OR fn_club_de_carrera(carrera_id) = fn_get_user_club_id()
--   Un usuario de portal tiene usuarios.club_id = Dolores, así que hoy
--   PUEDE LEER LAS 186 INSCRIPCIONES DEL CLUB, no sólo las de sus caballos.
--
--   probe_rls_portal no lo detecta: su assert 10 sólo verifica que A SÍ ve
--   la propia, nunca que NO ve la ajena. Se agrega ese assert (14).
--
-- EL ARREGLO
--   La secretaría sigue viendo todo su club, exactamente como hoy.
--   El portal pasa a ver sólo las inscripciones de sus propios caballos,
--   por la misma vía que ya define qué caballos son suyos.
--
-- Se cierra acá porque "Mis inscripciones" (§E.4) pone ese dato en pantalla.
-- ============================================================

DROP POLICY IF EXISTS inscripciones_select ON inscripciones;

CREATE POLICY inscripciones_select ON inscripciones
  FOR SELECT TO authenticated
  USING (
    (SELECT fn_is_super_admin())
    OR (
      NOT (SELECT fn_is_portal_user())
      AND fn_club_de_carrera(carrera_id) = (SELECT fn_get_user_club_id())
    )
    OR (
      (SELECT fn_is_portal_user())
      AND spc_id IN (SELECT m.spc_id FROM fn_mis_spc_ids() m)
    )
  );

-- ============================================================
-- VERIFICACIÓN
--   · secretaría de Dolores sigue viendo las 186 filas
--   · un entrenador del portal ve sólo las de sus caballos
--   · probe_rls_portal assert 10 (positivo) sigue en verde
--   · probe_rls_portal assert 14 (negativo, nuevo) pasa a verde
--
-- ROLLBACK — vuelve a la policy anterior tal cual estaba:
--   DROP POLICY IF EXISTS inscripciones_select ON inscripciones;
--   CREATE POLICY inscripciones_select ON inscripciones
--     FOR SELECT TO authenticated
--     USING (
--       (SELECT fn_is_super_admin())
--       OR fn_club_de_carrera(carrera_id) = (SELECT fn_get_user_club_id())
--     );
-- ============================================================
