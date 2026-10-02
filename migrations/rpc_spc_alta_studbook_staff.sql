-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- rpc_spc_alta_studbook_portal v2 — alta de SPC del Stud Book también desde la SECRETARÍA
-- (modal "Inscribir SPC" de inscripciones.html), en el mismo paso que la inscripción.
--
-- ESTADO EN PRODUCCIÓN: SIN APLICAR (se completa al aplicar: versión + md5 verificado).
-- md5(pg_get_functiondef) esperado, medido en el sandbox aplicando ESTE archivo (GOTCHA #99):
--   ver tests/local/portal_alta_spc_md5_esperado.txt (fila "v2")
-- Paso obligatorio inmediatamente después del apply_migration:
--   select md5(pg_get_functiondef('public.rpc_spc_alta_studbook_portal'::regproc));
--
-- Pedido de Yesi (02/10): hoy un caballo que no está en el padrón se carga dos veces (primero en
-- SPCs, después en Inscripciones). Fase 1 y decisiones de Leo (02/10, las 4 propuestas):
-- docs/diagnosticos/2026-10-02_inscripciones-alta-spc-studbook-fase1.md (reports).
--
-- MISMA función, MISMA firma (el contrato con la Edge Function studbook-buscar 'traer' no cambia).
-- El modo NO lo manda nadie: lo decide la RPC por usuarios.rol del p_auth_user_id.
--
--   paso   portal (igual que v1)                    staff (nuevo)
--   G0     service_role                             igual
--   G1     usuario activo de portal con entidad     usuario activo super_admin / secretario_carreras / operador
--   V1     ventana de inscripción abierta           SIN ventana; el turno existe, es de SU club (super_admin:
--                                                   cualquiera; otro club → 42501), no anulado, reunión no
--                                                   cancelada ni suspendida
--   V2–V7  igual (edad < 2 rechaza; > 12 motivo)    igual
--   D1–D3  igual (D1/D2 reusan, D3 rechaza)         igual
--   R1     3 altas por día                          sin cupo
--   D4     homónimo → motivo                        igual
--   W      alta_origen 'portal', pendiente          alta_origen 'secretaria', NO pendiente, alta_por = staff,
--                                                   revision_motivos = motivos (informativo)
--   notas  "alta desde el portal por …"             "alta desde Inscripciones por …"
--
-- La marca de sesión sigue siendo sgh.alta_portal (decisión: no renombrarla) — es la que deja a la RPC
-- escribir alta_origen/alta_por; fn_spcs_alta_revision no cambia.
-- Mensaje de G1 nuevo: "…para usuarios del portal o de la secretaría." (antes: "…del portal.").
--
-- No cambia: el trigger, la auditoría, las columnas, políticas ni GRANTs (EXECUTE sigue sólo service_role).
-- Rollback: migrations/rollback_rpc_spc_alta_studbook_staff.sql (vuelve a la v1 exacta).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_spc_alta_studbook_portal(
  p_auth_user_id     uuid,
  p_carrera_id       uuid,
  p_sb_id            text,
  p_nombre           text,
  p_fecha_nacimiento date,
  p_sexo             text,
  p_color            text,
  p_padre            text,
  p_madre            text,
  p_abuelo_materno   text,
  p_pais             text,
  p_url_perfil       text,
  p_leyenda          text,
  p_raza             integer,
  p_alertas          text[]
)
 RETURNS TABLE(spc_id uuid, ya_existia boolean, revision_motivos text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_usuario   RECORD;
  v_carrera   RECORD;
  v_sb        text := btrim(coalesce(p_sb_id, ''));
  v_nombre    text := btrim(coalesce(p_nombre, ''));
  v_nn        text;
  v_edad      integer;
  v_ids       uuid[];
  v_id        uuid;
  v_altas     integer;
  v_motivos   text[] := ARRAY[]::text[];
  v_homonimo  RECORD;
  v_notas     text;
  v_alerta    text;
  v_staff     boolean := false;
BEGIN
  -- ── G0 · QUIÉN LLAMA: sólo la Edge Function, con service_role. Antes de leer nada. ──
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'rpc_spc_alta_studbook_portal: sin permiso' USING ERRCODE = '42501';
  END IF;

  -- ── G1 · PARA QUIÉN: usuario activo del portal, con entidad (= condición de rpc_inscribir), o
  --    usuario activo de la secretaría (staff: alta desde el modal "Inscribir SPC", 02/10). ──
  SELECT u.id, u.nombre_completo, u.club_id, u.rol::text AS rol INTO v_usuario
    FROM usuarios u
   WHERE u.auth_user_id = p_auth_user_id
     AND p_auth_user_id IS NOT NULL
     AND u.activo
     AND (   (    u.rol IN ('profesional', 'propietario')
              AND u.entidad_tipo IN ('profesional', 'propietario')
              AND u.entidad_id IS NOT NULL)
          OR u.rol IN ('super_admin', 'secretario_carreras', 'operador'));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No autorizado: esta operación es para usuarios del portal o de la secretaría.' USING ERRCODE = '42501';
  END IF;
  v_staff := v_usuario.rol IN ('super_admin', 'secretario_carreras', 'operador');

  -- ── V1 · el turno tiene la inscripción abierta (mismo criterio y texto que rpc_inscribir) ──
  SELECT c.estado, c.apertura_inscripcion, c.cierre_inscripcion,
         r.estado::text AS reunion_estado, r.fecha AS reunion_fecha, r.club_id AS reunion_club
    INTO v_carrera
    FROM carreras c JOIN reuniones r ON r.id = c.reunion_id
   WHERE c.id = p_carrera_id;
  IF v_staff THEN
    -- Staff: sin ventana (la secretaría inscribe fuera de ella, como en el modal). Turno de SU club
    -- (super_admin: cualquiera), no anulado, reunión no cancelada ni suspendida.
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Ese turno no existe.';
    END IF;
    IF v_usuario.rol <> 'super_admin' AND v_carrera.reunion_club IS DISTINCT FROM v_usuario.club_id THEN
      RAISE EXCEPTION 'No autorizado: el turno es de otro hipódromo.' USING ERRCODE = '42501';
    END IF;
    IF v_carrera.estado IS NOT DISTINCT FROM 'anulada' OR v_carrera.reunion_estado IN ('cancelada', 'suspendida') THEN
      RAISE EXCEPTION 'Ese turno está anulado o la reunión está cancelada.';
    END IF;
  ELSIF NOT FOUND
     OR v_carrera.reunion_estado IS DISTINCT FROM 'publicada'
     OR v_carrera.estado IS NOT DISTINCT FROM 'anulada'
     OR v_carrera.apertura_inscripcion IS NULL
     OR v_carrera.cierre_inscripcion  IS NULL
     OR now() < v_carrera.apertura_inscripcion
     OR now() > v_carrera.cierre_inscripcion
  THEN
    RAISE EXCEPTION 'La inscripción para ese turno no está abierta.';
  END IF;

  -- ── V2–V6 · forma de los datos del Stud Book ──
  IF v_sb !~ '^[0-9]{1,9}$' THEN
    RAISE EXCEPTION 'El número de Stud Book no es válido.' USING ERRCODE = '22023';
  END IF;
  IF p_raza IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION 'Ese ejemplar no figura como Sangre Pura de Carrera en el Stud Book. Consultá en secretaría.' USING ERRCODE = '22023';
  END IF;
  IF v_nombre = '' OR length(v_nombre) > 60 THEN
    RAISE EXCEPTION 'El Stud Book no devolvió el nombre del caballo. Consultá en secretaría.' USING ERRCODE = '22023';
  END IF;
  IF p_fecha_nacimiento IS NULL OR p_fecha_nacimiento > current_date THEN
    RAISE EXCEPTION 'El Stud Book no tiene la fecha de nacimiento de ese caballo. Pedile a la secretaría que lo cargue.' USING ERRCODE = '22023';
  END IF;
  IF p_sexo IS NULL OR p_sexo NOT IN ('macho', 'hembra', 'castrado') THEN
    RAISE EXCEPTION 'El Stud Book no informa el sexo de ese caballo. Pedile a la secretaría que lo cargue.' USING ERRCODE = '22023';
  END IF;

  -- ── V7 · edad reglamentaria a la fecha de la reunión (regla del 1° de julio) ──
  v_edad := fn_edad_reglamentaria(v_carrera.reunion_fecha, p_fecha_nacimiento);
  IF v_edad < 2 THEN
    RAISE EXCEPTION 'Ese caballo tiene % años según el Stud Book: revisá que hayas elegido el correcto (puede haber otro con el mismo nombre).', v_edad;
  END IF;
  IF v_edad > 12 THEN
    v_motivos := v_motivos || format('edad > 12 (%s años según el Stud Book)', v_edad);
  END IF;

  -- Serializa las altas del mismo nombre (D2/D3/D4 contra fichas sin studbook_id). El studbook_id
  -- lo cubre el índice único spcs_studbook_id_uniq.
  v_nn := upper(regexp_replace(translate(v_nombre, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'), '[^A-Za-z0-9]', '', 'g'));
  PERFORM pg_advisory_xact_lock(hashtext('spc_alta_portal:' || v_nn));

  -- ── D1 · ya está con ese nº de Stud Book → es ese caballo ──
  SELECT s.id INTO v_id FROM spcs s WHERE s.studbook_id = v_sb;
  IF FOUND THEN
    RETURN QUERY SELECT v_id, true, NULL::text[];
    RETURN;
  END IF;

  -- ── D2 / D3 · misma fecha + padre + madre (normalización de rpc_spcs_duplicados) ──
  IF coalesce(p_padre, '') <> '' OR coalesce(p_madre, '') <> '' THEN
    SELECT array_agg(s.id ORDER BY s.created_at) INTO v_ids
      FROM spcs s
     WHERE s.fecha_nacimiento = p_fecha_nacimiento
       AND upper(btrim(coalesce(s.padrillo_nombre, ''))) = upper(btrim(coalesce(p_padre, '')))
       AND upper(btrim(coalesce(s.madre_nombre,    ''))) = upper(btrim(coalesce(p_madre, '')));
    IF coalesce(array_length(v_ids, 1), 0) = 1 THEN
      RETURN QUERY SELECT v_ids[1], true, NULL::text[];
      RETURN;
    ELSIF coalesce(array_length(v_ids, 1), 0) > 1 THEN
      RAISE EXCEPTION 'Ese caballo ya está cargado más de una vez en el padrón. Buscalo por nombre en la lista o avisale a la secretaría.';
    END IF;
  END IF;

  -- ── R1 · cupo: 3 altas del portal por usuario en 24 h (la secretaría no tiene cupo) ──
  IF NOT v_staff THEN
    SELECT count(*) INTO v_altas
      FROM spcs s
     WHERE s.alta_por = v_usuario.id AND s.alta_origen = 'portal'
       AND s.created_at > now() - interval '24 hours';
    IF v_altas >= 3 THEN
      RAISE EXCEPTION 'Ya trajiste 3 caballos nuevos hoy. Si necesitás más, pedíselos a la secretaría.';
    END IF;
  END IF;

  -- ── D4 · homónimo: mismo nombre, otro caballo → se crea igual, con el motivo ──
  FOR v_homonimo IN
    SELECT s.id, s.nombre, s.fecha_nacimiento FROM spcs s
     WHERE upper(regexp_replace(translate(s.nombre, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'), '[^A-Za-z0-9]', '', 'g')) = v_nn
     ORDER BY s.created_at
  LOOP
    v_motivos := v_motivos || format('homónimo de %s (nac. %s, id %s)',
                   v_homonimo.nombre, to_char(v_homonimo.fecha_nacimiento, 'DD/MM/YYYY'), v_homonimo.id);
  END LOOP;

  -- Alertas del Stud Book que no frenaron (raza y sexo ya se validaron arriba).
  FOREACH v_alerta IN ARRAY coalesce(p_alertas, ARRAY[]::text[]) LOOP
    IF v_alerta NOT LIKE 'raza%' AND v_alerta NOT LIKE 'sexo%' THEN
      v_motivos := v_motivos || ('alerta Stud Book: ' || v_alerta);
    END IF;
  END LOOP;

  -- Mismo formato de notas que spcs.html (usarCandidato).
  v_notas := concat_ws(' · ',
    'SB ' || v_sb,
    nullif(btrim(coalesce(p_url_perfil, '')), ''),
    format('alta desde %s por %s %s', CASE WHEN v_staff THEN 'Inscripciones' ELSE 'el portal' END, coalesce(v_usuario.nombre_completo, 'usuario ' || v_usuario.id),
           to_char(now() AT TIME ZONE 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY')),
    CASE WHEN coalesce(p_abuelo_materno, '') <> '' THEN 'abuelo materno: ' || p_abuelo_materno END,
    nullif(btrim(coalesce(p_leyenda, '')), ''));

  -- ── W · alta ── (staff: 'secretaria', sin revisión pendiente; los motivos quedan como información)
  PERFORM set_config('sgh.alta_portal', '1', true);
  INSERT INTO spcs (
    club_id, nombre, studbook_id, registro_stud_book, fecha_nacimiento, sexo, color,
    padrillo_nombre, madre_nombre, pais_origen, estado, notas,
    caballeriza_id, entrenador_id, jockey_habitual_id,
    alta_origen, alta_por, revision_pendiente, revision_motivos
  ) VALUES (
    NULL, v_nombre, v_sb, NULL, p_fecha_nacimiento, p_sexo::sexo_spc, nullif(btrim(coalesce(p_color, '')), ''),
    nullif(btrim(coalesce(p_padre, '')), ''), nullif(btrim(coalesce(p_madre, '')), ''),
    nullif(btrim(coalesce(p_pais, '')), ''), 'activo', v_notas,
    NULL, NULL, NULL,
    CASE WHEN v_staff THEN 'secretaria' ELSE 'portal' END, v_usuario.id, NOT v_staff, CASE WHEN cardinality(v_motivos) > 0 THEN v_motivos END
  )
  ON CONFLICT (studbook_id) WHERE studbook_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_id;
  PERFORM set_config('sgh.alta_portal', '', true);

  IF v_id IS NULL THEN
    -- Otro llegó primero con el mismo nº de Stud Book: es el mismo caballo.
    SELECT s.id INTO v_id FROM spcs s WHERE s.studbook_id = v_sb;
    RETURN QUERY SELECT v_id, true, NULL::text[];
    RETURN;
  END IF;

  RETURN QUERY SELECT v_id, false, CASE WHEN cardinality(v_motivos) > 0 THEN v_motivos END;
END
$function$;

REVOKE ALL ON FUNCTION public.rpc_spc_alta_studbook_portal(uuid, uuid, text, text, date, text, text, text, text, text, text, text, text, integer, text[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_spc_alta_studbook_portal(uuid, uuid, text, text, date, text, text, text, text, text, text, text, text, integer, text[])
  TO service_role;

COMMIT;
