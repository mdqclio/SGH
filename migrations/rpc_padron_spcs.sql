-- ============================================================================
-- rpc_padron_spcs.sql
--
-- Padrón completo de SPC para el buscador del modal de anotar (portal.html).
--
-- POR QUÉ UN RPC Y NO UN SELECT
-- La policy `spcs_select` deja a un usuario de portal ver SÓLO sus ejemplares
-- visibles (`fn_mis_spc_visibles()`); el padrón entero es staff-only. Por eso
-- `rpc_buscar_spc` ya era SECURITY DEFINER, y por eso esto también lo es.
--
-- POR QUÉ TRAER TODO EN VEZ DE CONSULTAR POR TECLA
-- El padrón son 181 ejemplares: 42,5 kB de JSON con las diez columnas que
-- devuelve esta función, ~11 kB por el cable con el gzip que ya aplica PostgREST.
-- Medido el 08/09/2026 (assert C3 del probe). Traerlo una vez al abrir el modal
-- y filtrar en el cliente da:
--   · respuesta instantánea desde la primera letra, sin debounce ni viaje;
--   · búsqueda insensible a acentos gratis, con normalize('NFD') en JS —
--     `unaccent` NO está instalada en la base (GOTCHA #71) y `ILIKE` no es
--     acento-insensible: hoy "saltena" no encuentra "CHINITA SALTEÑA";
--   · una consulta por sesión en vez de una por tecla.
-- Consultar por tecla sólo se justificaría con miles de ejemplares.
--
-- ES ADITIVO: función nueva. No cambia `rpc_buscar_spc`, que sigue existiendo
-- y sigue siendo la que usa la UI desplegada hasta que se mergee la rama.
--
-- Informe: docs/diagnosticos/2026-09-08_buscador-spc-autocompletado.md
-- Probe:   tests/probe_buscador_spc.mjs
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_padron_spcs()
 RETURNS TABLE(id uuid, nombre text, sexo text, fecha_nacimiento date,
               color text, studbook_id text, padrillo_nombre text,
               madre_nombre text, estado text, habilitado boolean)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Misma autorización que rpc_buscar_spc: staff o usuario de portal.
  IF NOT ((SELECT fn_is_staff()) OR (SELECT fn_is_portal_user())) THEN
    RAISE EXCEPTION 'No autorizado.';
  END IF;

  RETURN QUERY
    SELECT s.id, s.nombre::text, s.sexo::text, s.fecha_nacimiento,
           s.color::text, s.studbook_id::text,
           s.padrillo_nombre::text, s.madre_nombre::text,
           s.estado::text,
           (s.estado = 'activo') AS habilitado
      FROM spcs s
     ORDER BY s.nombre;
END;
$function$;
