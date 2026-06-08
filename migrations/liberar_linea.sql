-- ============================================================
-- Fase 4 v1.1 — liberar_linea: liberación MANUAL del doping
-- Rama: feat/cobros-v1.1
--
-- Flip estado_linea retenido→impago de UNA línea, cuando la secretaría recibe el
-- resultado del control anti-doping. Solo afecta líneas en 'retenido'.
--
-- Club scoping (mismo criterio que la RLS de liquidacion_detalle:
--   fn_is_super_admin() OR fn_club_de_liquidacion(liquidacion_id)=fn_get_user_club_id()):
-- se enforce cuando hay contexto de usuario (frontend autenticado). El backend
-- service_role (sin usuario → fn_get_user_club_id() NULL) pasa, como god-role. No se
-- tocan grants/permisos (REVOKE/GRANT) — solo la lógica de la función.
--
-- Reversible: DROP FUNCTION liberar_linea(uuid).
-- ============================================================

CREATE OR REPLACE FUNCTION liberar_linea(p_linea_id uuid)
RETURNS liquidacion_detalle
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row  liquidacion_detalle;
  v_club uuid;
BEGIN
  SELECT fn_club_de_liquidacion(liquidacion_id) INTO v_club
    FROM liquidacion_detalle WHERE id = p_linea_id;
  IF v_club IS NULL AND NOT EXISTS (SELECT 1 FROM liquidacion_detalle WHERE id = p_linea_id) THEN
    RAISE EXCEPTION 'liberar_linea: línea inexistente';
  END IF;

  -- club scoping: solo si hay usuario (no super_admin) y la línea es de otro club
  IF fn_get_user_club_id() IS NOT NULL AND NOT fn_is_super_admin()
     AND v_club IS DISTINCT FROM fn_get_user_club_id() THEN
    RAISE EXCEPTION 'liberar_linea: línea de otro club';
  END IF;

  UPDATE liquidacion_detalle
     SET estado_linea = 'impago'
   WHERE id = p_linea_id AND estado_linea = 'retenido'
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'liberar_linea: la línea no existe o no está en retenido';
  END IF;

  RETURN v_row;
END $$;
