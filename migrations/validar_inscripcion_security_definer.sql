-- validar_inscripcion → SECURITY DEFINER, con motivo genérico para el portal
-- Opción C del reporte docs/PORTAL_VALIDACION_INSCRIPCION.md
--
-- PROBLEMA
-- La función era SECURITY INVOKER (prosecdef = false), o sea que corría con el
-- RLS del que la llama. Un usuario de portal (rol profesional/propietario) ve:
--     spcs                    0 de 183 filas
--     v_sanciones_vigentes    0 de 1
--     inscripciones           0 de 248
--     carreras               49 de 49
--
-- Con `spcs` invisible, `SELECT * INTO v_spc FROM spcs WHERE id = p_spc_id` no
-- encuentra nada y v_spc queda NULL. A partir de ahí TODOS los IF comparan contra
-- NULL, que en SQL no es TRUE, así que ninguno dispara y la función cae hasta el
-- `RETURN QUERY SELECT TRUE, 'SPC habilitado para inscribirse.'` del final.
-- El chequeo de cupo falla por otra vía: cuenta 0 inscripciones y nunca llega al tope.
-- El de sanción falla siempre, incluso sobre el ejemplar propio.
--
-- Es el gotcha #10 de CLAUDE.md: las funciones que evalúan reglas por encima de
-- RLS tienen que ser SECURITY DEFINER.
--
-- QUÉ CAMBIA ACÁ (además del SECURITY DEFINER)
--
-- 1. MOTIVO GENÉRICO PARA EL PORTAL. Con SECURITY DEFINER el `motivo` pasaría a
--    exponer datos que RLS le tapa al usuario: el tipo de sanción ("Doping") y la
--    edad del ejemplar. Peor: p_spc_id es un parámetro libre, así que un usuario
--    de portal podría sondear ejemplares AJENOS y leer sus sanciones. Mientras no
--    haya definición de Fede sobre qué texto mostrar, el portal recibe siempre:
--        'Tu ejemplar no está habilitado para inscribirse. Consultá en secretaría.'
--    El staff (fn_is_staff()) sigue viendo el motivo detallado — lo necesita para
--    operar inscripciones.html. Si Fede después quiere mostrar el detalle en el
--    portal, es cambiar el valor de v_detalle: bloquear no depende del texto.
--
-- 2. FAIL-CLOSED SI NO HAY FILA. Antes, v_spc o v_carrera en NULL caían hasta el
--    TRUE final. Ahora cortan con FALSE. Es la misma clase de bug que el del
--    front: ante la duda, no se inscribe.
--
-- No cambia NINGUNA regla de validación: mismos chequeos, mismo orden, mismos
-- veredictos. Lo único que varía es el texto del motivo según quién pregunta.

CREATE OR REPLACE FUNCTION public.validar_inscripcion(p_spc_id uuid, p_carrera_id uuid)
RETURNS TABLE(puede_inscribirse boolean, motivo text)
LANGUAGE plpgsql
-- VOLATILE, igual que la versión original. No lo paso a STABLE aunque la función
-- solo lea: PostgREST corre las funciones no-volátiles en una transacción READ
-- ONLY, y eso es un cambio de comportamiento que no hace falta para este fix.
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
            -- El cupo no es un dato del ejemplar ajeno: se puede decir siempre.
            RETURN QUERY SELECT FALSE, 'Cupo máximo alcanzado.'; RETURN;
        END IF;
    END IF;

    RETURN QUERY SELECT TRUE, 'SPC habilitado para inscribirse.';
END;
$function$;

-- Verificación posterior:
--   SELECT proname, prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--   WHERE n.nspname='public' AND proname='validar_inscripcion';   -- prosecdef debe dar true
--
-- Y la matriz de casos como `authenticated` con el JWT del usuario de portal
-- (sub = usuarios.auth_user_id, NO usuarios.id): edad, sexo y sanción tienen que
-- dar FALSE con el texto genérico.
--
-- Rollback: volver a la versión SECURITY INVOKER previa (git show <sha>~1) o, si
-- solo se quiere revertir el modo:
--   ALTER FUNCTION public.validar_inscripcion(uuid, uuid) SECURITY INVOKER;
