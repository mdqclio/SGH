-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Portal — alta de un SPC traído del Stud Book, para inscribirlo de corrido
--
-- ESTADO EN PRODUCCIÓN: **NO APLICADA.** Probada en el sandbox (tests/local, base
-- sgh_portal_alta) con tests/probe_portal_alta_spc_studbook.mjs. Se aplica con OK explícito.
-- md5(pg_get_functiondef) esperado, medido en el sandbox aplicando ESTE archivo (GOTCHA #99):
--   ver tests/local/portal_alta_spc_md5_esperado.txt
-- Paso obligatorio inmediatamente después del apply_migration:
--   select p.proname, md5(pg_get_functiondef(p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and p.proname in ('rpc_spc_alta_studbook_portal','fn_spcs_alta_revision');
--
-- Pedido: Yesi (audio 01/10 14:10) — un entrenador registrado en el portal no pudo anotar porque
-- el caballo no estaba en el padrón. Relevamiento y plan (Fase 1, sólo lectura):
-- docs/diagnosticos/2026-10-01_portal-alta-spc-studbook.md (reports). Decisiones de Leo (01/10):
-- opción A (la Edge Function re-consulta el Stud Book y es la única que llama la RPC); edad
-- reglamentaria < 2 se rechaza, > 12 se crea igual con el motivo en revision_motivos; cupo 3 altas
-- por usuario por día; entrenador_id NULL (lo define la secretaría); aviso al ratificar fuera de v1.
--
-- Qué hace:
--
--   1. spcs: columnas de alta y revisión.
--      · alta_origen 'secretaria' | 'portal' (los 238 existentes quedan en 'secretaria').
--      · alta_por → usuarios.id de quien dio de alta (NULL en los existentes).
--      · revision_pendiente / revision_motivos / revisado_por / revisado_at.
--      NO se toca estado_spc: el ejemplar del portal nace 'activo' para poder inscribirse en el
--      momento (validar_inscripcion rechaza todo estado <> 'activo').
--
--   2. Trigger trg_spcs_alta_revision (BEFORE INSERT OR UPDATE) — la base impone esas columnas:
--      · INSERT sin la marca de sesión de la RPC (sgh.alta_portal) — o sea, spcs.html o una
--        migración —: alta_origen='secretaria', alta_por = usuario de la sesión (NULL sin sesión),
--        sin revisión pendiente. Nadie puede crear una ficha "del portal" a mano.
--      · INSERT con la marca (sólo la pone rpc_spc_alta_studbook_portal, sólo para su
--        transacción): respeta lo que puso la RPC.
--      · UPDATE: alta_origen, alta_por y revision_motivos no cambian. Si revision_pendiente pasa a
--        false, revisado_por/revisado_at los pone la base (usuario de la sesión, now()); si vuelve a
--        true, se limpian. El cliente no los puede escribir.
--      La política spcs_update (sólo staff) NO cambia: marcar revisado es un UPDATE de staff.
--
--   3. Auditoría de spcs (trg_audit_spcs → fn_auditoria_log, el mismo de las otras 13 tablas). Hasta
--      hoy spcs no estaba auditada. OJO: fn_auditoria_log atribuye por el email del JWT; la alta del
--      portal entra por service_role (sin email) y queda con usuario_id NULL en auditoria — quién fue
--      está en datos_despues.alta_por.
--
--   4. RPC rpc_spc_alta_studbook_portal — SECURITY DEFINER, EXECUTE sólo para service_role (la llama
--      la Edge Function studbook-buscar, acción 'traer', con los datos que ELLA volvió a pedir al
--      Stud Book; el navegador nunca manda la ficha). El usuario viaja explícito (p_auth_user_id,
--      validado por la Edge Function contra Auth) porque con service_role auth.uid() es NULL.
--      Orden (los guards de identidad antes de leer nada):
--        G0  llama service_role (auth.role())                            → 42501
--        G1  p_auth_user_id = usuario activo del portal con entidad        → 42501
--        V1  turno con la inscripción abierta (mismo criterio que rpc_inscribir)
--        V2  nº de Stud Book: sólo dígitos, 1–9
--        V3  raza 4 (SPC)
--        V4  nombre no vacío, ≤ 60
--        V5  fecha de nacimiento presente y no futura
--        V6  sexo macho | hembra | castrado
--        V7  edad reglamentaria (a la fecha de la reunión) ≥ 2; > 12 → se crea con motivo
--        D1  ya hay ficha con ese studbook_id                → la reusa (no crea, no la toca)
--        D2  UNA ficha con misma fecha + padre + madre        → la reusa (no le escribe nada)
--        D3  MÁS DE UNA ficha con misma fecha + padre + madre → rechaza (hoy: Wave Rimout)
--        R1  ≥ 3 altas del portal de ese usuario en 24 h      → rechaza
--        D4  mismo nombre normalizado, otro caballo           → crea, motivo "homónimo de …"
--        W   INSERT … ON CONFLICT (studbook_id) DO NOTHING; si otro llegó primero, reusa la suya.
--      Devuelve (spc_id, ya_existia, revision_motivos).
--      No inscribe: la inscripción sigue por rpc_inscribir, sin cambios.
--
-- No cambia: políticas de spcs, de inscripciones ni de ninguna otra tabla (ISSUE-093 intacto);
-- rpc_inscribir; validar_inscripcion; rpc_padron_spcs.
--
-- Rollback: migrations/rollback_portal_alta_spc_studbook.sql
-- Guards de esta migración (2026-10-01): pwd=/home/clio/dev/SGH · spcs=238 · ref=unlhcuanfrtpatoipwve
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

-- ── 1. Columnas ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.spcs
  ADD COLUMN IF NOT EXISTS alta_origen        text        NOT NULL DEFAULT 'secretaria',
  ADD COLUMN IF NOT EXISTS alta_por           uuid        REFERENCES public.usuarios(id),
  ADD COLUMN IF NOT EXISTS revision_pendiente boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS revision_motivos   text[],
  ADD COLUMN IF NOT EXISTS revisado_por       uuid        REFERENCES public.usuarios(id),
  ADD COLUMN IF NOT EXISTS revisado_at        timestamptz;

ALTER TABLE public.spcs DROP CONSTRAINT IF EXISTS spcs_alta_origen_check;
ALTER TABLE public.spcs ADD CONSTRAINT spcs_alta_origen_check
  CHECK (alta_origen IN ('secretaria', 'portal'));

CREATE INDEX IF NOT EXISTS spcs_revision_pendiente_idx
  ON public.spcs (created_at) WHERE revision_pendiente;

COMMENT ON COLUMN public.spcs.alta_origen IS
  'Lo impone la base (trg_spcs_alta_revision): ''portal'' sólo si lo creó rpc_spc_alta_studbook_portal.';
COMMENT ON COLUMN public.spcs.alta_por IS
  'usuarios.id de quien dio de alta. Lo impone la base. NULL en las fichas anteriores al 2026-10.';
COMMENT ON COLUMN public.spcs.revision_pendiente IS
  'Ficha traída del Stud Book desde el portal, que la secretaría todavía no miró. Informativa: no bloquea la inscripción.';
COMMENT ON COLUMN public.spcs.revision_motivos IS
  'Por qué conviene mirarla además de venir del portal (edad > 12, homónimo, alertas del Stud Book). La escribe sólo la RPC.';

-- ── 2. Trigger que impone alta y revisión ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_spcs_alta_revision()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_usuario uuid := (SELECT u.id FROM usuarios u WHERE u.auth_user_id = auth.uid());
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Sólo rpc_spc_alta_studbook_portal pone la marca, y sólo para su transacción.
    IF coalesce(current_setting('sgh.alta_portal', true), '') = '1' THEN
      RETURN NEW;
    END IF;
    NEW.alta_origen        := 'secretaria';
    NEW.alta_por           := v_usuario;
    NEW.revision_pendiente := false;
    NEW.revision_motivos   := NULL;
    NEW.revisado_por       := NULL;
    NEW.revisado_at        := NULL;
    RETURN NEW;
  END IF;

  -- UPDATE
  NEW.alta_origen      := OLD.alta_origen;
  NEW.alta_por         := OLD.alta_por;
  NEW.revision_motivos := OLD.revision_motivos;
  IF NEW.revision_pendiente IS DISTINCT FROM OLD.revision_pendiente THEN
    IF NEW.revision_pendiente THEN
      NEW.revisado_por := NULL;
      NEW.revisado_at  := NULL;
    ELSE
      NEW.revisado_por := v_usuario;
      NEW.revisado_at  := now();
    END IF;
  ELSE
    NEW.revisado_por := OLD.revisado_por;
    NEW.revisado_at  := OLD.revisado_at;
  END IF;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.fn_spcs_alta_revision() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_spcs_alta_revision ON public.spcs;
CREATE TRIGGER trg_spcs_alta_revision BEFORE INSERT OR UPDATE ON public.spcs
  FOR EACH ROW EXECUTE FUNCTION public.fn_spcs_alta_revision();

-- ── 3. Auditoría ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_audit_spcs ON public.spcs;
CREATE TRIGGER trg_audit_spcs AFTER INSERT OR DELETE OR UPDATE ON public.spcs
  FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_log();

-- ── 4. RPC ───────────────────────────────────────────────────────────────────────────────────
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
BEGIN
  -- ── G0 · QUIÉN LLAMA: sólo la Edge Function, con service_role. Antes de leer nada. ──
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'rpc_spc_alta_studbook_portal: sin permiso' USING ERRCODE = '42501';
  END IF;

  -- ── G1 · PARA QUIÉN: usuario activo del portal, con entidad (= condición de rpc_inscribir). ──
  SELECT u.id, u.nombre_completo INTO v_usuario
    FROM usuarios u
   WHERE u.auth_user_id = p_auth_user_id
     AND p_auth_user_id IS NOT NULL
     AND u.activo
     AND u.rol IN ('profesional', 'propietario')
     AND u.entidad_tipo IN ('profesional', 'propietario')
     AND u.entidad_id IS NOT NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No autorizado: esta operación es para usuarios del portal.' USING ERRCODE = '42501';
  END IF;

  -- ── V1 · el turno tiene la inscripción abierta (mismo criterio y texto que rpc_inscribir) ──
  SELECT c.estado, c.apertura_inscripcion, c.cierre_inscripcion,
         r.estado::text AS reunion_estado, r.fecha AS reunion_fecha
    INTO v_carrera
    FROM carreras c JOIN reuniones r ON r.id = c.reunion_id
   WHERE c.id = p_carrera_id;
  IF NOT FOUND
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

  -- ── R1 · cupo: 3 altas del portal por usuario en 24 h ──
  SELECT count(*) INTO v_altas
    FROM spcs s
   WHERE s.alta_por = v_usuario.id AND s.alta_origen = 'portal'
     AND s.created_at > now() - interval '24 hours';
  IF v_altas >= 3 THEN
    RAISE EXCEPTION 'Ya trajiste 3 caballos nuevos hoy. Si necesitás más, pedíselos a la secretaría.';
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
    format('alta desde el portal por %s %s', coalesce(v_usuario.nombre_completo, 'usuario ' || v_usuario.id),
           to_char(now() AT TIME ZONE 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY')),
    CASE WHEN coalesce(p_abuelo_materno, '') <> '' THEN 'abuelo materno: ' || p_abuelo_materno END,
    nullif(btrim(coalesce(p_leyenda, '')), ''));

  -- ── W · alta ──
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
    'portal', v_usuario.id, true, CASE WHEN cardinality(v_motivos) > 0 THEN v_motivos END
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
