-- ============================================================================
-- fn_edad_reglamentaria — la regla del 1° de julio, una sola vez en la base
-- ============================================================================
-- Reglamento General de Carreras: "la edad de los caballos se contará desde el
-- 1° de julio de cada año". Todos los SPC cumplen años ese día, sin importar su
-- fecha real de nacimiento.
--
--   edad = year(fecha_ref) - year(fecha_nac) - (1 si month(fecha_ref) < 7)
--
-- Antes de esta migración la fórmula vivía en tres lugares, dos de ellos rotos:
--   1. edad-spc.js                     — correcta desde el 14/08 (commit 38989d8)
--   2. validar_inscripcion             — ROTA: DATE_PART('year', AGE(...)) = aniversario real
--   3. v_inscriptos_carrera.spc_edad   — ROTA x2: AGE() de un solo argumento,
--                                        o sea aniversario real Y contra CURRENT_DATE
--
-- Esta migración deja la fórmula SQL en un único lugar (fn_edad_reglamentaria) y
-- hace que 2 y 3 la llamen. `edad-spc.js` sigue siendo la copia del front: son dos
-- runtimes distintos, no se puede compartir código. El probe
-- tests/probe_edad_reglamentaria.mjs verifica que las dos den el mismo número.
--
-- Diagnósticos de origen:
--   docs/diagnosticos/2026-08-27_edad-gate-inscripcion.md   (SHA 7de5461)
--   docs/diagnosticos/2026-08-27_censo-inscripciones-r9.md  (branch reports)
--
-- NO APLICADA. Requiere OK explícito.
-- ============================================================================


-- ── 1. La función ───────────────────────────────────────────────────────────
-- IMMUTABLE: para el mismo par de fechas siempre da lo mismo. No lee tablas ni
-- depende de now(), así que es indexable y cacheable por el planner.
-- Devuelve NULL si cualquiera de los dos argumentos es NULL. Verificado en el schema
-- antes de aplicar: spcs.fecha_nacimiento es NOT NULL y reuniones.fecha es NOT NULL, así
-- que por el camino de validar_inscripcion los dos argumentos siempre vienen cargados y el
-- caso del fail-open es imposible. La rama NULL queda igual porque la vista usa LEFT JOIN
-- y una fila huérfana sí puede traer rn.fecha en NULL.

CREATE OR REPLACE FUNCTION public.fn_edad_reglamentaria(
  p_fecha_ref date,
  p_fecha_nac date
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
           WHEN p_fecha_ref IS NULL OR p_fecha_nac IS NULL THEN NULL
           -- GREATEST(...,0) replica el `edad < 0 ? 0 : edad` de edad-spc.js. Para el gate
           -- da lo mismo (una edad negativa nunca entra en un rango 3..10), pero el objetivo
           -- de esta migración es que no queden dos versiones de la regla: si una clampea y
           -- la otra no, la divergencia aparece dentro de seis meses como un ticket raro.
           ELSE GREATEST(
                  EXTRACT(YEAR  FROM p_fecha_ref)::int
                - EXTRACT(YEAR  FROM p_fecha_nac)::int
                - CASE WHEN EXTRACT(MONTH FROM p_fecha_ref)::int < 7 THEN 1 ELSE 0 END,
                  0)
         END;
$$;

COMMENT ON FUNCTION public.fn_edad_reglamentaria(date, date) IS
  'Edad de un SPC segun el Reglamento General de Carreras (regla del 1 de julio). '
  'p_fecha_ref es la fecha de la REUNION, nunca now(). NULL si falta cualquiera de las dos fechas. '
  'Unica fuente SQL de la formula: validar_inscripcion y v_inscriptos_carrera la llaman.';

REVOKE ALL ON FUNCTION public.fn_edad_reglamentaria(date, date) FROM public;
GRANT EXECUTE ON FUNCTION public.fn_edad_reglamentaria(date, date) TO anon, authenticated, service_role;


-- ── 2. validar_inscripcion ──────────────────────────────────────────────────
-- La firma NO cambia (p_spc_id uuid, p_carrera_id uuid) -> CREATE OR REPLACE
-- alcanza, no hace falta DROP y no se genera overload.
-- Lo unico que cambia es el bloque que calcula v_edad_carrera. Todo el resto
-- (gates de estado, sexo, sancion, cupo y los textos) queda identico.

CREATE OR REPLACE FUNCTION public.validar_inscripcion(p_spc_id uuid, p_carrera_id uuid)
 RETURNS TABLE(puede_inscribirse boolean, motivo text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_spc RECORD; v_carrera RECORD; v_edad_carrera INTEGER; v_sancion RECORD;
    -- Texto provisorio hasta que Fede defina qué se le puede decir al portal.
    v_generico CONSTANT TEXT := 'Tu ejemplar no está habilitado para inscribirse. Consultá en secretaría.';
    -- ¿Quién pregunta tiene derecho al motivo detallado? Staff siempre. Un usuario
    -- de portal, nunca — ni sobre su propio ejemplar — hasta que Fede lo defina.
    v_detalle BOOLEAN := fn_is_staff();
BEGIN
    SELECT * INTO v_spc FROM spcs WHERE id = p_spc_id;
    IF v_spc IS NULL THEN
        RETURN QUERY SELECT FALSE, CASE WHEN v_detalle
            THEN 'No se encontró el ejemplar.' ELSE v_generico END; RETURN;
    END IF;

    SELECT * INTO v_carrera FROM carreras WHERE id = p_carrera_id;
    IF v_carrera IS NULL THEN
        RETURN QUERY SELECT FALSE, CASE WHEN v_detalle
            THEN 'No se encontró la carrera.' ELSE v_generico END; RETURN;
    END IF;

    -- ANTES (roto): DATE_PART('year', AGE(reunion.fecha, v_spc.fecha_nacimiento))
    -- daba el aniversario real, no la edad reglamentaria. La fecha de referencia
    -- (reuniones.fecha) ya estaba bien y se conserva.
    SELECT fn_edad_reglamentaria(r.fecha, v_spc.fecha_nacimiento)
      INTO v_edad_carrera
      FROM reuniones r
     WHERE r.id = v_carrera.reunion_id;

    IF v_spc.estado != 'activo' THEN
        RETURN QUERY SELECT FALSE, CASE WHEN v_detalle
            THEN 'El SPC no está activo: ' || v_spc.estado ELSE v_generico END; RETURN;
    END IF;
    IF v_carrera.edad_minima_anos IS NOT NULL AND v_edad_carrera < v_carrera.edad_minima_anos THEN
        RETURN QUERY SELECT FALSE, CASE WHEN v_detalle
            THEN 'Edad insuficiente: ' || v_edad_carrera || ' años. Mínimo: ' || v_carrera.edad_minima_anos
            ELSE v_generico END; RETURN;
    END IF;
    IF v_carrera.edad_maxima_anos IS NOT NULL AND v_edad_carrera > v_carrera.edad_maxima_anos THEN
        RETURN QUERY SELECT FALSE, CASE WHEN v_detalle
            THEN 'Excede edad máxima: ' || v_edad_carrera || ' años. Máximo: ' || v_carrera.edad_maxima_anos
            ELSE v_generico END; RETURN;
    END IF;
    IF v_carrera.condicion_sexo = 'machos' AND v_spc.sexo NOT IN ('macho', 'castrado') THEN
        RETURN QUERY SELECT FALSE, CASE WHEN v_detalle
            THEN 'Carrera solo para machos.' ELSE v_generico END; RETURN;
    END IF;
    IF v_carrera.condicion_sexo = 'hembras' AND v_spc.sexo != 'hembra' THEN
        RETURN QUERY SELECT FALSE, CASE WHEN v_detalle
            THEN 'Carrera solo para hembras.' ELSE v_generico END; RETURN;
    END IF;
    IF v_carrera.condicion_sexo = 'machos_castrados' AND v_spc.sexo != 'castrado' THEN
        RETURN QUERY SELECT FALSE, CASE WHEN v_detalle
            THEN 'Carrera solo para castrados.' ELSE v_generico END; RETURN;
    END IF;

    SELECT * INTO v_sancion FROM v_sanciones_vigentes
     WHERE entidad_tipo = 'spc' AND entidad_id = p_spc_id LIMIT 1;
    IF FOUND THEN
        RETURN QUERY SELECT FALSE, CASE WHEN v_detalle
            THEN 'SPC con sanción vigente: ' || v_sancion.tipo_sancion ELSE v_generico END; RETURN;
    END IF;

    IF v_carrera.cupo_maximo IS NOT NULL THEN
        IF (SELECT COUNT(*) FROM inscripciones
             WHERE carrera_id = p_carrera_id AND estado != 'forfait') >= v_carrera.cupo_maximo THEN
            RETURN QUERY SELECT FALSE, 'Cupo máximo alcanzado.'; RETURN;
        END IF;
    END IF;

    RETURN QUERY SELECT TRUE, 'SPC habilitado para inscribirse.';
END;
$function$;


-- ── 3. v_inscriptos_carrera ─────────────────────────────────────────────────
-- Verificado read-only antes de escribir esta migración:
--   * dependencias en cascada (otras vistas/matviews sobre ella): 0 filas
--   * usos en el front (grep sobre *.html / *.js / *.mjs): 0 hits
--   * spc_edad hoy es `double precision` (date_part devuelve double)
--
-- CREATE OR REPLACE VIEW exige MISMO nombre, tipo y orden de columnas. Como
-- fn_edad_reglamentaria devuelve integer, sin el cast a double precision el
-- REPLACE falla con "cannot change data type of view column". Con el cast, el
-- REPLACE es viable y NO hace falta DROP (que se llevaria puestos los GRANTs).
--
-- Cambio de semantica: antes age() de UN argumento medía contra CURRENT_DATE.
-- Ahora la referencia es la fecha de la reunión de la carrera. Los LEFT JOIN
-- son deliberados: con INNER se perderían filas si faltara la carrera o la
-- reunión, y el conteo de la vista cambiaría.

CREATE OR REPLACE VIEW public.v_inscriptos_carrera AS
 SELECT i.id AS inscripcion_id,
    i.carrera_id,
    i.numero_partidor,
    i.estado AS estado_inscripcion,
    i.peso_declarado,
    i.peso_final,
    i.info_adicional,
    s.nombre AS spc_nombre,
    s.fecha_nacimiento AS spc_nacimiento,
    fn_edad_reglamentaria(rn.fecha, s.fecha_nacimiento)::double precision AS spc_edad,
    s.sexo AS spc_sexo,
    s.color AS spc_color,
    p.nombre AS propietario_nombre,
    p.colores_desc AS colores_propietario,
    (e.apellido::text || ', '::text) || e.nombre::text AS entrenador,
    (jt.apellido::text || ', '::text) || jt.nombre::text AS jockey_titular,
    (js.apellido::text || ', '::text) || js.nombre::text AS jockey_suplente,
    c.nombre AS caballeriza
   FROM inscripciones i
     JOIN spcs s ON s.id = i.spc_id
     LEFT JOIN carreras cr ON cr.id = i.carrera_id
     LEFT JOIN reuniones rn ON rn.id = cr.reunion_id
     LEFT JOIN propietarios p ON p.id = i.propietario_id
     LEFT JOIN profesionales e ON e.id = i.entrenador_id
     LEFT JOIN profesionales jt ON jt.id = i.jockey_titular_id
     LEFT JOIN profesionales js ON js.id = i.jockey_suplente_id
     LEFT JOIN caballerizas c ON c.id = s.caballeriza_id;


-- ── 4. Verificación post-aplicación (SELECT, no escribe) ────────────────────
-- a) La fórmula, en los casos del informe:
--    SELECT fn_edad_reglamentaria('2026-09-20','2023-10-10');  -- MOSQUITA  -> 3
--    SELECT fn_edad_reglamentaria('2026-09-20','2022-11-10');  -- ABELITO   -> 4
--    SELECT fn_edad_reglamentaria('2026-09-20','2023-07-07');  -- Amiguito  -> 3
--    SELECT fn_edad_reglamentaria('2026-06-20','2022-11-10');  -- antes del 1/7 -> 3
--    SELECT fn_edad_reglamentaria('2026-09-20', NULL);         -- -> NULL
--
-- b) Que no quede ninguna otra implementación de la fórmula en la base:
--    SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--     WHERE n.nspname='public' AND pg_get_functiondef(p.oid) ILIKE '%AGE(%'
--       AND p.proname <> 'fn_edad_reglamentaria';
--
-- c) La vista no perdió filas:
--    SELECT count(*) FROM v_inscriptos_carrera;   -- comparar contra el pre-conteo


-- ============================================================================
-- ROLLBACK — definiciones ANTERIORES, capturadas de producción antes de aplicar
-- ============================================================================
-- CREATE OR REPLACE pisa la definición previa y Postgres no guarda copia. Esto es
-- esa copia: capturado con pg_get_functiondef() y pg_get_viewdef() el 2026-08-27,
-- inmediatamente antes del apply_migration.
--
-- Para revertir: descomentar los dos bloques y ejecutarlos. Vuelven la función y la
-- vista al estado exacto de antes, con el bug de edad incluido. `fn_edad_reglamentaria`
-- queda huérfana pero inofensiva; para borrarla también:
--     DROP FUNCTION IF EXISTS public.fn_edad_reglamentaria(date, date);
-- (hacerlo DESPUÉS de revertir los dos objetos que la llaman, o la FK de dependencia
--  hace fallar el DROP).
--
-- ── ROLLBACK 1 / 2 — validar_inscripcion, versión previa (con AGE(), rota) ──
-- Copia LITERAL de pg_get_functiondef(), acentos incluidos. No se editó nada.
/*
CREATE OR REPLACE FUNCTION public.validar_inscripcion(p_spc_id uuid, p_carrera_id uuid)
 RETURNS TABLE(puede_inscribirse boolean, motivo text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_spc RECORD; v_carrera RECORD; v_edad_carrera INTEGER; v_sancion RECORD;
    -- Texto provisorio hasta que Fede defina qué se le puede decir al portal.
    v_generico CONSTANT TEXT := 'Tu ejemplar no está habilitado para inscribirse. Consultá en secretaría.';
    -- ¿Quién pregunta tiene derecho al motivo detallado? Staff siempre. Un usuario
    -- de portal, nunca — ni sobre su propio ejemplar — hasta que Fede lo defina.
    v_detalle BOOLEAN := fn_is_staff();
BEGIN
    SELECT * INTO v_spc FROM spcs WHERE id = p_spc_id;
    IF v_spc IS NULL THEN
        RETURN QUERY SELECT FALSE, CASE WHEN v_detalle
            THEN 'No se encontró el ejemplar.' ELSE v_generico END; RETURN;
    END IF;

    SELECT * INTO v_carrera FROM carreras WHERE id = p_carrera_id;
    IF v_carrera IS NULL THEN
        RETURN QUERY SELECT FALSE, CASE WHEN v_detalle
            THEN 'No se encontró la carrera.' ELSE v_generico END; RETURN;
    END IF;

    SELECT DATE_PART('year', AGE(
        (SELECT fecha FROM reuniones WHERE id = v_carrera.reunion_id), v_spc.fecha_nacimiento
    ))::INTEGER INTO v_edad_carrera;

    IF v_spc.estado != 'activo' THEN
        RETURN QUERY SELECT FALSE, CASE WHEN v_detalle
            THEN 'El SPC no está activo: ' || v_spc.estado ELSE v_generico END; RETURN;
    END IF;
    IF v_carrera.edad_minima_anos IS NOT NULL AND v_edad_carrera < v_carrera.edad_minima_anos THEN
        RETURN QUERY SELECT FALSE, CASE WHEN v_detalle
            THEN 'Edad insuficiente: ' || v_edad_carrera || ' años. Mínimo: ' || v_carrera.edad_minima_anos
            ELSE v_generico END; RETURN;
    END IF;
    IF v_carrera.edad_maxima_anos IS NOT NULL AND v_edad_carrera > v_carrera.edad_maxima_anos THEN
        RETURN QUERY SELECT FALSE, CASE WHEN v_detalle
            THEN 'Excede edad máxima: ' || v_edad_carrera || ' años. Máximo: ' || v_carrera.edad_maxima_anos
            ELSE v_generico END; RETURN;
    END IF;
    IF v_carrera.condicion_sexo = 'machos' AND v_spc.sexo NOT IN ('macho', 'castrado') THEN
        RETURN QUERY SELECT FALSE, CASE WHEN v_detalle
            THEN 'Carrera solo para machos.' ELSE v_generico END; RETURN;
    END IF;
    IF v_carrera.condicion_sexo = 'hembras' AND v_spc.sexo != 'hembra' THEN
        RETURN QUERY SELECT FALSE, CASE WHEN v_detalle
            THEN 'Carrera solo para hembras.' ELSE v_generico END; RETURN;
    END IF;
    IF v_carrera.condicion_sexo = 'machos_castrados' AND v_spc.sexo != 'castrado' THEN
        RETURN QUERY SELECT FALSE, CASE WHEN v_detalle
            THEN 'Carrera solo para castrados.' ELSE v_generico END; RETURN;
    END IF;

    SELECT * INTO v_sancion FROM v_sanciones_vigentes
     WHERE entidad_tipo = 'spc' AND entidad_id = p_spc_id LIMIT 1;
    IF FOUND THEN
        RETURN QUERY SELECT FALSE, CASE WHEN v_detalle
            THEN 'SPC con sanción vigente: ' || v_sancion.tipo_sancion ELSE v_generico END; RETURN;
    END IF;

    IF v_carrera.cupo_maximo IS NOT NULL THEN
        IF (SELECT COUNT(*) FROM inscripciones
             WHERE carrera_id = p_carrera_id AND estado != 'forfait') >= v_carrera.cupo_maximo THEN
            RETURN QUERY SELECT FALSE, 'Cupo máximo alcanzado.'; RETURN;
        END IF;
    END IF;

    RETURN QUERY SELECT TRUE, 'SPC habilitado para inscribirse.';
END;
$function$;
*/

-- ── ROLLBACK 2 / 2 — v_inscriptos_carrera, version previa (age() de un argumento) ──
/*
CREATE OR REPLACE VIEW public.v_inscriptos_carrera AS
 SELECT i.id AS inscripcion_id,
    i.carrera_id,
    i.numero_partidor,
    i.estado AS estado_inscripcion,
    i.peso_declarado,
    i.peso_final,
    i.info_adicional,
    s.nombre AS spc_nombre,
    s.fecha_nacimiento AS spc_nacimiento,
    date_part('year'::text, age(s.fecha_nacimiento::timestamp with time zone)) AS spc_edad,
    s.sexo AS spc_sexo,
    s.color AS spc_color,
    p.nombre AS propietario_nombre,
    p.colores_desc AS colores_propietario,
    (e.apellido::text || ', '::text) || e.nombre::text AS entrenador,
    (jt.apellido::text || ', '::text) || jt.nombre::text AS jockey_titular,
    (js.apellido::text || ', '::text) || js.nombre::text AS jockey_suplente,
    c.nombre AS caballeriza
   FROM inscripciones i
     JOIN spcs s ON s.id = i.spc_id
     LEFT JOIN propietarios p ON p.id = i.propietario_id
     LEFT JOIN profesionales e ON e.id = i.entrenador_id
     LEFT JOIN profesionales jt ON jt.id = i.jockey_titular_id
     LEFT JOIN profesionales js ON js.id = i.jockey_suplente_id
     LEFT JOIN caballerizas c ON c.id = s.caballeriza_id;
*/
-- Conteo de la vista ANTES de aplicar: 249 filas. Post-aplicacion tiene que dar 249.
