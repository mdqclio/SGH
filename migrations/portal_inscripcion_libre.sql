-- ============================================================
-- Portal — INSCRIPCIÓN LIBRE (cambio de regla, 24/08/2026)
-- ============================================================
-- Regla nueva, confirmada por Fede y Yesi: cualquier entrenador puede
-- inscribir CUALQUIER SPC del padrón. No hay vínculo caballo↔entrenador.
-- El control es DISCIPLINARIO, no técnico: queda registrado quién inscribió
-- (inscripciones.inscripto_por + canal='portal' + trigger de auditoría) y una
-- inscripción falsa va a sanción de la comisión de carreras.
--
-- Motivo operativo: 34 de 181 SPC no tienen entrenador_id cargado, así que hoy
-- son INVISIBLES para todo el portal — nadie los puede anotar. El filtro por
-- tenencia no protegía nada que la comisión no pueda resolver, y bloqueaba
-- el 19% del padrón.
--
-- Ver docs/PORTAL_INSCRIPCION_LIBRE_PROPUESTA.md (inventario + decisiones).
--
-- QUÉ NO CAMBIA
--   · Ventana de inscripción (fail-closed), reglas de carrera, cupo, sanción.
--   · El portal sigue SIN INSERT/UPDATE/DELETE sobre `inscripciones`: toda
--     la escritura entra por rpc_inscribir / rpc_baja_inscripcion.
--   · Sólo entrenadores (entidad 'profesional') pueden anotar. El propietario
--     mira, no anota.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. fn_mis_spc_visibles() — tenencia ∪ lo que yo inscribí
-- ------------------------------------------------------------
-- fn_mis_spc_ids() (tenencia) se DEJA COMO ESTÁ: la usan otras policies y
-- sigue siendo la respuesta correcta a "¿qué caballos figuran a mi nombre?",
-- que es lo que muestra la sección "Mis caballos".
--
-- Lo que hace falta es otra cosa: si un entrenador anota un caballo ajeno,
-- tiene que poder VER esa inscripción y retirarla. Con las policies viejas
-- (spc_id IN fn_mis_spc_ids()) la fila que él mismo creó le quedaba invisible
-- y sin botón de retirar. De ahí la unión con "lo que yo inscribí".
--
-- SECURITY DEFINER ⇒ no re-evalúa las policies de inscripciones/spcs ⇒ sin
-- recursión (GOTCHA #10).
CREATE OR REPLACE FUNCTION public.fn_mis_spc_visibles()
 RETURNS TABLE (spc_id uuid)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT m.spc_id FROM fn_mis_spc_ids() m
  UNION
  SELECT i.spc_id
    FROM inscripciones i
    JOIN usuarios u ON u.id = i.inscripto_por
   WHERE u.auth_user_id = auth.uid() AND u.activo;
$function$;

COMMENT ON FUNCTION public.fn_mis_spc_visibles() IS
  'SPC que la cuenta puede ver: los que figuran a su nombre MÁS los que ella misma inscribió. Reemplaza a fn_mis_spc_ids() en las policies de lectura del portal.';

-- ------------------------------------------------------------
-- 2. Policies de lectura del portal
-- ------------------------------------------------------------
-- spcs: el entrenador ve su tenencia + los que anotó. El padrón COMPLETO no
-- se abre por policy — se lee sólo por rpc_buscar_spc, que devuelve columnas
-- whitelisteadas. Abrir spcs_select a todo el padrón expondría también
-- entrenador_id / caballeriza_id de terceros, que no hacen falta para anotar.
DROP POLICY IF EXISTS spcs_select ON public.spcs;
CREATE POLICY spcs_select ON public.spcs FOR SELECT TO authenticated
  USING (
    (SELECT fn_is_staff())
    OR id IN (SELECT s.spc_id FROM fn_mis_spc_visibles() s)
  );

-- inscripciones: idem. Ojo — esto NO abre las inscripciones ajenas: un
-- entrenador ve las filas de los caballos que tiene a nombre y las que él
-- cargó. Las de otro entrenador sobre un caballo ajeno siguen invisibles,
-- que es lo que pidió Yesi (el listado de inscriptos se publica después,
-- y eso todavía no existe en el sistema).
DROP POLICY IF EXISTS inscripciones_select ON public.inscripciones;
CREATE POLICY inscripciones_select ON public.inscripciones FOR SELECT TO authenticated
  USING (
    (SELECT fn_is_super_admin())
    OR ((NOT (SELECT fn_is_portal_user()))
        AND fn_club_de_carrera(carrera_id) = (SELECT fn_get_user_club_id()))
    OR ((SELECT fn_is_portal_user())
        AND spc_id IN (SELECT m.spc_id FROM fn_mis_spc_visibles() m))
  );

-- ------------------------------------------------------------
-- 3. rpc_buscar_spc — buscador sobre TODO el padrón
-- ------------------------------------------------------------
-- Reemplaza al filtro por tenencia en el modal de anotar. Devuelve columnas
-- whitelisteadas: nada de entrenador_id, caballeriza_id ni propietario.
--
-- `habilitado` es informativo: los SPC con estado != 'activo' SE MUESTRAN
-- (decisión de Fede/Yesi — "no aparece y no sé por qué" es peor que verlo
-- tachado), pero validar_inscripcion los rechaza igual. El front los pinta
-- deshabilitados.
CREATE OR REPLACE FUNCTION public.rpc_buscar_spc(p_q text)
RETURNS TABLE (
  id uuid, nombre text, sexo text, fecha_nacimiento date,
  color text, padrillo_nombre text, madre_nombre text,
  studbook_id text, estado text, habilitado boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_q text;
BEGIN
  IF NOT ((SELECT fn_is_staff()) OR (SELECT fn_is_portal_user())) THEN
    RAISE EXCEPTION 'No autorizado.';
  END IF;

  -- Mínimo 2 caracteres: sin esto la primera tecla trae el padrón entero.
  IF p_q IS NULL OR length(btrim(p_q)) < 2 THEN
    RETURN;
  END IF;

  -- % y _ del usuario se escapan: son comodines de LIKE, no texto.
  v_q := '%' || replace(replace(replace(btrim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  RETURN QUERY
    SELECT s.id, s.nombre::text, s.sexo::text, s.fecha_nacimiento,
           s.color::text, s.padrillo_nombre::text, s.madre_nombre::text,
           s.studbook_id::text, s.estado::text,
           (s.estado = 'activo') AS habilitado
      FROM spcs s
     WHERE s.nombre ILIKE v_q ESCAPE '\'
     ORDER BY (s.estado = 'activo') DESC, s.nombre
     LIMIT 30;
END;
$function$;

COMMENT ON FUNCTION public.rpc_buscar_spc(text) IS
  'Buscador de SPC por nombre sobre todo el padrón, con columnas whitelisteadas. Reemplaza al filtro por tenencia del portal (inscripción libre, 24/08/2026).';

REVOKE ALL     ON FUNCTION public.rpc_buscar_spc(text) FROM PUBLIC;
REVOKE ALL     ON FUNCTION public.rpc_buscar_spc(text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.rpc_buscar_spc(text) TO authenticated;

COMMIT;

-- ============================================================
-- VERIFICACIÓN
--   SELECT proname FROM pg_proc WHERE proname IN
--     ('fn_mis_spc_visibles','rpc_buscar_spc');            -- 2 filas
--   SELECT qual FROM pg_policies
--    WHERE tablename='spcs' AND policyname='spcs_select';  -- fn_mis_spc_visibles
--
-- ROLLBACK
--   Volver spcs_select / inscripciones_select a fn_mis_spc_ids() (definición
--   original en sec_rls_fase2a_catalogos.sql y en la migración de RLS de
--   inscripciones), y:
--   DROP FUNCTION IF EXISTS public.rpc_buscar_spc(text);
--   DROP FUNCTION IF EXISTS public.fn_mis_spc_visibles();
-- ============================================================
