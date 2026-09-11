-- ============================================================
-- rpc_spcs_duplicados.sql — los tres chequeos de duplicado de SPC, en la base, reutilizables
-- ============================================================
-- Hasta hoy (tandas R8 y R9) estos chequeos se corrieron por SQL a mano antes de cada INSERT en spcs
-- (ver migrations/spcs_r9_tanda_1.sql §0.b/c/d). Esta RPC los deja disponibles para spcs.html
-- (alta desde pantalla con el Stud Book, plan 2026-09-11_plan-studbook-buscar-edge-function.md §2)
-- y para cualquier probe. SOLO LECTURA: no inserta, no decide — devuelve las filas existentes que
-- chocan, con el motivo, y la pantalla muestra.
--
-- Los tres motivos:
--   'studbook_id'        mismo número de Stud Book (índice único parcial spcs_studbook_id_uniq lo frenaría
--                        igual, pero acá se ve ANTES y con la fila).
--   'nombre'             mismo nombre normalizado (sin acentos, sin espacios ni puntuación, mayúsculas).
--                        unaccent() no está instalada (GOTCHA #71) → translate manual, el mismo de las tandas.
--                        Atrapa Wave Rimout ×2 y Conesera/CONESERSA-tipo (no LOGUACIOUS/LOGUARCIUS: eso lo
--                        agarran los otros dos cuando el candidato trae studbook_id y fecha+padres).
--   'fecha_padre_madre'  misma fecha de nacimiento + mismo padrillo + misma madre: es el mismo animal
--                        con otro nombre (una yegua pare una cría por año).
--
-- Guard adentro (GOTCHA #80: la RLS no protege una SECURITY DEFINER): sólo staff.
-- ✅ APLICADA el 11/09/2026 por MCP apply_migration (nombre: rpc_spcs_duplicados). Probe tests/probe_rpc_spcs_duplicados.mjs 10/10.
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_spcs_duplicados(
  p_studbook_id      text,
  p_nombre           text,
  p_fecha_nacimiento date,
  p_padrillo         text,
  p_madre            text
)
RETURNS TABLE (
  motivo           text,
  id               uuid,
  nombre           varchar,
  fecha_nacimiento date,
  sexo             sexo_spc,
  color            varchar,
  padrillo_nombre  varchar,
  madre_nombre     varchar,
  studbook_id      text,
  estado           estado_spc
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_nn text;
BEGIN
  IF NOT fn_is_staff() THEN
    RAISE EXCEPTION 'rpc_spcs_duplicados: solo staff' USING ERRCODE = '42501';
  END IF;

  v_nn := upper(regexp_replace(translate(coalesce(p_nombre, ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'), '[^A-Za-z0-9]', '', 'g'));

  RETURN QUERY
    SELECT 'studbook_id'::text, s.id, s.nombre, s.fecha_nacimiento, s.sexo, s.color, s.padrillo_nombre, s.madre_nombre, s.studbook_id, s.estado
    FROM spcs s
    WHERE p_studbook_id IS NOT NULL AND btrim(p_studbook_id) <> '' AND s.studbook_id = btrim(p_studbook_id)
  UNION ALL
    SELECT 'nombre'::text, s.id, s.nombre, s.fecha_nacimiento, s.sexo, s.color, s.padrillo_nombre, s.madre_nombre, s.studbook_id, s.estado
    FROM spcs s
    WHERE v_nn <> ''
      AND upper(regexp_replace(translate(s.nombre, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'), '[^A-Za-z0-9]', '', 'g')) = v_nn
  UNION ALL
    SELECT 'fecha_padre_madre'::text, s.id, s.nombre, s.fecha_nacimiento, s.sexo, s.color, s.padrillo_nombre, s.madre_nombre, s.studbook_id, s.estado
    FROM spcs s
    WHERE p_fecha_nacimiento IS NOT NULL
      AND s.fecha_nacimiento = p_fecha_nacimiento
      AND upper(btrim(coalesce(s.padrillo_nombre, ''))) = upper(btrim(coalesce(p_padrillo, '')))
      AND upper(btrim(coalesce(s.madre_nombre,    ''))) = upper(btrim(coalesce(p_madre,    '')))
      AND (coalesce(p_padrillo, '') <> '' OR coalesce(p_madre, '') <> '');
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_spcs_duplicados(text, text, date, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rpc_spcs_duplicados(text, text, date, text, text) TO authenticated;

COMMENT ON FUNCTION public.rpc_spcs_duplicados(text, text, date, text, text) IS
  'Chequeo de duplicados de SPC antes de un alta: por studbook_id, por nombre normalizado y por fecha+padrillo+madre. Solo lectura, solo staff. Usada por spcs.html (alta con Stud Book) — ver migrations/rpc_spcs_duplicados.sql.';

-- Verificación post (con el secret key, que es staff por fn_is_staff? NO: fn_is_staff mira auth.uid();
-- desde el MCP/service role auth.uid() es NULL → RAISE 42501. Probar la RPC con un JWT de staff
-- (tests/probe_rpc_spcs_duplicados.mjs) o, para verificar la LÓGICA sin auth, correr los SELECT del
-- cuerpo a mano. Ver el probe.)
