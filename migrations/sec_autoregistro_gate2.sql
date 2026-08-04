-- ============================================================
-- Gate 2 de auto-registro — solicitudes_acceso + RPCs
-- ============================================================
-- Fecha: 2026-08-04 · Base: main @ 8a91183 (Gate 1 aplicado)
-- Diseño: docs/AUTOREGISTRO_PLAN.md §B.2, §A.4, §A.5 — implementación, no rediseño.
-- Rollback: migrations/sec_autoregistro_gate2_rollback.sql (commiteado antes)
--
-- Principio del diseño (§B.1): el pendiente NO tiene fila en `usuarios`. Sin
-- ella, fn_is_staff(), fn_get_user_club_id(), fn_mis_entidades() y
-- fn_mis_spc_ids() devuelven falso/NULL/vacío, así que TODAS las policies
-- vigentes ya lo deniegan sin tocar ninguna. Este gate no modifica nada
-- preexistente: sólo agrega tabla y RPCs.
--
-- Nadie escribe la tabla directo: no hay policy de INSERT/UPDATE/DELETE. Todo
-- pasa por RPCs SECURITY DEFINER que validan y son fail-closed — sin sesión o
-- sin permiso levantan excepción, nunca devuelven cero filas en silencio.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------------------
-- 1 · Tabla
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.solicitudes_acceso (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id   uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email          varchar(150) NOT NULL,
  nombre         varchar(200) NOT NULL,
  apellido       varchar(200) NOT NULL,
  documento_tipo varchar(20)  NOT NULL DEFAULT 'DNI',
  documento_nro  varchar(30)  NOT NULL,
  telefono       varchar(50),
  rol_pedido     varchar(20)  NOT NULL
                 CHECK (rol_pedido IN ('profesional','propietario')),
  club_id        uuid NOT NULL REFERENCES clubs(id),
  -- 'descartada' es el estado de los curiosos: gente sin caballos que se
  -- registra y nunca se aprueba. Se barre sin pasar por "rechazo", que implica
  -- avisarle a alguien. Que la bandeja banque solicitudes que nunca se van a
  -- aprobar sin parecer trabajo atrasado.
  estado         varchar(20)  NOT NULL DEFAULT 'pendiente'
                 CHECK (estado IN ('pendiente','aprobada','rechazada','descartada')),
  motivo_rechazo text,
  resuelta_por   uuid REFERENCES usuarios(id),
  resuelta_at    timestamptz,
  created_at     timestamptz  NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.solicitudes_acceso IS
  'Auto-registro con aprobación. El pendiente vive acá y NO en usuarios: sin '
  'fila en usuarios todas las policies ya lo deniegan. Se escribe sólo por RPC.';
COMMENT ON COLUMN public.solicitudes_acceso.documento_nro IS
  'Llave de matcheo contra profesionales/propietarios. La DECLARA el solicitante; '
  'el sistema NUNCA vincula por coincidencia — el vínculo lo elige la secretaría.';

-- Anti-flood: un mismo DNI no puede tener dos solicitudes PENDIENTES en el
-- mismo club. Rechazadas y descartadas no bloquean, así que se puede volver a
-- intentar tras una corrección.
CREATE UNIQUE INDEX IF NOT EXISTS ux_solicitud_pendiente_doc
  ON public.solicitudes_acceso (club_id, documento_nro)
  WHERE estado = 'pendiente';

CREATE INDEX IF NOT EXISTS idx_solicitudes_estado_club
  ON public.solicitudes_acceso (club_id, estado, created_at DESC);

-- ------------------------------------------------------------------------
-- 2 · RLS — sólo lectura, y acotada
-- ------------------------------------------------------------------------
ALTER TABLE public.solicitudes_acceso ENABLE ROW LEVEL SECURITY;

-- El solicitante ve SÓLO la suya. El staff, las de su club. Super_admin, todas.
-- Envuelto en (SELECT ...) por la optimización InitPlan de R2a.
DROP POLICY IF EXISTS solicitudes_acceso_select ON public.solicitudes_acceso;
CREATE POLICY solicitudes_acceso_select ON public.solicitudes_acceso
  FOR SELECT TO authenticated
  USING (
    auth_user_id = (SELECT auth.uid())
    OR (SELECT fn_is_super_admin())
    OR ((SELECT fn_is_staff()) AND club_id = (SELECT fn_get_user_club_id()))
  );

-- Sin policy de INSERT/UPDATE/DELETE: para `authenticated` quedan denegadas.
-- Cambiar el estado de una solicitud y crear el vínculo tienen que ser UNA
-- transacción; dos escrituras sueltas por policy no lo garantizan.

-- ------------------------------------------------------------------------
-- 3 · Guard de staff, compartido por las tres RPCs de resolución
-- ------------------------------------------------------------------------
-- Devuelve el usuarios.id del staff llamante, o levanta excepción. Fail-closed
-- en los tres frentes: sin sesión, sin fila en usuarios, o sin rol de staff.
CREATE OR REPLACE FUNCTION public.fn_solicitudes_guard_staff(p_solicitud_id uuid)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_usuario   usuarios%ROWTYPE;
  v_club_sol  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_usuario FROM usuarios WHERE auth_user_id = v_uid AND activo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No autorizado: la cuenta no tiene usuario activo'
      USING ERRCODE = '42501';
  END IF;

  IF v_usuario.rol NOT IN ('super_admin','secretario_carreras','operador') THEN
    RAISE EXCEPTION 'No autorizado: se requiere rol de secretaría'
      USING ERRCODE = '42501';
  END IF;

  SELECT club_id INTO v_club_sol FROM solicitudes_acceso WHERE id = p_solicitud_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitud inexistente' USING ERRCODE = 'P0002';
  END IF;

  -- El staff sólo resuelve solicitudes de SU club. super_admin, cualquiera.
  IF v_usuario.rol <> 'super_admin' AND v_usuario.club_id IS DISTINCT FROM v_club_sol THEN
    RAISE EXCEPTION 'No autorizado: la solicitud es de otro club'
      USING ERRCODE = '42501';
  END IF;

  RETURN v_usuario.id;
END;
$$;

-- ------------------------------------------------------------------------
-- 4 · rpc_solicitar_acceso — la crea el propio solicitante
-- ------------------------------------------------------------------------
-- El email NO se toma de un parámetro: se lee de auth.users por auth.uid(). Así
-- "el email coincide con el de la cuenta" es cierto por construcción y no por
-- validación. Igual se acepta p_email opcional y se verifica, para que un
-- cliente que mande otro cosa falle ruidosamente en vez de en silencio.
CREATE OR REPLACE FUNCTION public.rpc_solicitar_acceso(
  p_nombre         text,
  p_apellido       text,
  p_documento_nro  text,
  p_telefono       text,
  p_rol_pedido     text,
  p_club_id        uuid,
  p_documento_tipo text DEFAULT 'DNI',
  p_email          text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_email text;
  v_doc   text := btrim(coalesce(p_documento_nro, ''));
  v_id    uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '28000';
  END IF;

  SELECT lower(btrim(a.email)) INTO v_email FROM auth.users a WHERE a.id = v_uid;
  IF v_email IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'La cuenta no tiene email' USING ERRCODE = '22023';
  END IF;

  IF p_email IS NOT NULL AND lower(btrim(p_email)) <> v_email THEN
    RAISE EXCEPTION 'El email no coincide con el de la cuenta' USING ERRCODE = '22023';
  END IF;

  -- Quien ya tiene usuario no necesita solicitar acceso.
  IF EXISTS (SELECT 1 FROM usuarios WHERE auth_user_id = v_uid) THEN
    RAISE EXCEPTION 'La cuenta ya tiene acceso al sistema' USING ERRCODE = '23505';
  END IF;

  IF btrim(coalesce(p_nombre,'')) = '' OR btrim(coalesce(p_apellido,'')) = '' THEN
    RAISE EXCEPTION 'Nombre y apellido son obligatorios' USING ERRCODE = '22023';
  END IF;

  -- DNI obligatorio y con formato. Es la llave de matcheo Y el dato que le
  -- falta a la integración Stud Book, así que no se acepta basura.
  IF v_doc !~ '^[0-9]{7,8}$' THEN
    RAISE EXCEPTION 'El DNI debe tener 7 u 8 dígitos, sin puntos ni espacios'
      USING ERRCODE = '22023';
  END IF;

  -- Teléfono obligatorio (§A.1): la secretaría verifica por teléfono antes de
  -- aprobar. Sin esto, no puede.
  IF btrim(coalesce(p_telefono,'')) = '' THEN
    RAISE EXCEPTION 'El teléfono es obligatorio' USING ERRCODE = '22023';
  END IF;

  IF p_rol_pedido NOT IN ('profesional','propietario') THEN
    RAISE EXCEPTION 'rol_pedido inválido: se espera profesional o propietario'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM clubs WHERE id = p_club_id) THEN
    RAISE EXCEPTION 'Hipódromo inexistente' USING ERRCODE = 'P0002';
  END IF;

  BEGIN
    INSERT INTO solicitudes_acceso (
      auth_user_id, email, nombre, apellido,
      documento_tipo, documento_nro, telefono, rol_pedido, club_id
    ) VALUES (
      v_uid, v_email, btrim(p_nombre), btrim(p_apellido),
      coalesce(nullif(btrim(p_documento_tipo),''),'DNI'), v_doc,
      btrim(p_telefono), p_rol_pedido, p_club_id
    )
    RETURNING id INTO v_id;
  EXCEPTION
    WHEN unique_violation THEN
      IF sqlerrm ILIKE '%ux_solicitud_pendiente_doc%' THEN
        RAISE EXCEPTION 'Ya hay una solicitud pendiente con ese documento'
          USING ERRCODE = '23505';
      END IF;
      RAISE EXCEPTION 'Esta cuenta ya envió una solicitud' USING ERRCODE = '23505';
  END;

  RETURN v_id;
END;
$$;

-- ------------------------------------------------------------------------
-- 5 · rpc_aprobar_solicitud — SOLO staff. Vínculo + alta, en una transacción
-- ------------------------------------------------------------------------
-- El entidad_id lo ELIGE la secretaría y llega como parámetro explícito. No hay
-- ninguna ruta que vincule por coincidencia de DNI (§C.8 del plan).
CREATE OR REPLACE FUNCTION public.rpc_aprobar_solicitud(
  p_solicitud_id     uuid,
  p_entidad_tipo     text,
  p_entidad_id       uuid,
  p_copiar_documento boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_staff_id  uuid := fn_solicitudes_guard_staff(p_solicitud_id);
  v_sol       solicitudes_acceso%ROWTYPE;
  v_usuario_id uuid;
  v_ent_club  uuid;
  v_ent_doc   text;
BEGIN
  SELECT * INTO v_sol FROM solicitudes_acceso WHERE id = p_solicitud_id FOR UPDATE;

  IF v_sol.estado <> 'pendiente' THEN
    RAISE EXCEPTION 'La solicitud ya fue resuelta (estado: %)', v_sol.estado
      USING ERRCODE = '22023';
  END IF;

  IF p_entidad_tipo NOT IN ('profesional','propietario') THEN
    RAISE EXCEPTION 'entidad_tipo inválido' USING ERRCODE = '22023';
  END IF;

  -- El tipo de ficha tiene que coincidir con lo que la persona pidió ser.
  IF p_entidad_tipo <> v_sol.rol_pedido THEN
    RAISE EXCEPTION 'La ficha es de tipo % y la solicitud pide %',
      p_entidad_tipo, v_sol.rol_pedido USING ERRCODE = '22023';
  END IF;

  IF p_entidad_tipo = 'profesional' THEN
    SELECT club_id, documento_nro INTO v_ent_club, v_ent_doc
    FROM profesionales WHERE id = p_entidad_id;
  ELSE
    SELECT club_id, documento_nro INTO v_ent_club, v_ent_doc
    FROM propietarios WHERE id = p_entidad_id;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La ficha % no existe', p_entidad_id USING ERRCODE = 'P0002';
  END IF;

  IF v_ent_club IS DISTINCT FROM v_sol.club_id THEN
    RAISE EXCEPTION 'La ficha pertenece a otro hipódromo' USING ERRCODE = '42501';
  END IF;

  -- Alta en usuarios. `rol` va EXPLÍCITO: el default de la columna es 'publico'
  -- desde el Gate 1, pero omitirlo sería confiar en un default para un permiso.
  -- password_hash es NOT NULL y vestigio pre-Supabase-Auth: la contraseña real
  -- vive en GoTrue.
  BEGIN
    INSERT INTO usuarios (
      email, nombre_completo, telefono, club_id, rol,
      activo, estado, auth_user_id, entidad_tipo, entidad_id, password_hash
    ) VALUES (
      v_sol.email,
      btrim(v_sol.nombre || ' ' || v_sol.apellido),
      v_sol.telefono,
      v_sol.club_id,
      v_sol.rol_pedido::rol_usuario,
      true,
      'activo',
      v_sol.auth_user_id,
      p_entidad_tipo,
      p_entidad_id,
      ''
    )
    RETURNING id INTO v_usuario_id;
  EXCEPTION
    WHEN unique_violation THEN
      IF sqlerrm ILIKE '%ux_entidad_una_cuenta%' THEN
        RAISE EXCEPTION
          'Esa ficha ya está vinculada a otra cuenta. Desvinculá la anterior antes de aprobar.'
          USING ERRCODE = '23505';
      END IF;
      IF sqlerrm ILIKE '%ux_usuarios_auth_user_id%' THEN
        RAISE EXCEPTION 'La cuenta ya tiene usuario en el sistema' USING ERRCODE = '23505';
      END IF;
      RAISE;
  END;

  -- Oportunidad de completar el DNI de la ficha: sólo si está vacío. NUNCA pisa
  -- un dato cargado. Ataca el bloqueante de la integración Stud Book.
  IF p_copiar_documento AND (v_ent_doc IS NULL OR btrim(v_ent_doc) = '') THEN
    IF p_entidad_tipo = 'profesional' THEN
      UPDATE profesionales
         SET documento_nro = v_sol.documento_nro, documento_tipo = v_sol.documento_tipo
       WHERE id = p_entidad_id;
    ELSE
      UPDATE propietarios
         SET documento_nro = v_sol.documento_nro, documento_tipo = v_sol.documento_tipo
       WHERE id = p_entidad_id;
    END IF;
  END IF;

  UPDATE solicitudes_acceso
     SET estado = 'aprobada', resuelta_por = v_staff_id, resuelta_at = now()
   WHERE id = p_solicitud_id;

  RETURN v_usuario_id;
END;
$$;

-- ------------------------------------------------------------------------
-- 6 · rpc_rechazar_solicitud — SOLO staff. Con motivo, se le comunica.
-- ------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_rechazar_solicitud(
  p_solicitud_id uuid,
  p_motivo       text
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_staff_id uuid := fn_solicitudes_guard_staff(p_solicitud_id);
  v_estado   text;
BEGIN
  SELECT estado INTO v_estado FROM solicitudes_acceso WHERE id = p_solicitud_id FOR UPDATE;
  IF v_estado <> 'pendiente' THEN
    RAISE EXCEPTION 'La solicitud ya fue resuelta (estado: %)', v_estado
      USING ERRCODE = '22023';
  END IF;

  IF btrim(coalesce(p_motivo,'')) = '' THEN
    RAISE EXCEPTION 'El motivo del rechazo es obligatorio' USING ERRCODE = '22023';
  END IF;

  UPDATE solicitudes_acceso
     SET estado = 'rechazada', motivo_rechazo = btrim(p_motivo),
         resuelta_por = v_staff_id, resuelta_at = now()
   WHERE id = p_solicitud_id;
END;
$$;

-- ------------------------------------------------------------------------
-- 7 · rpc_descartar_solicitud — SOLO staff. Los curiosos, sin avisar a nadie.
-- ------------------------------------------------------------------------
-- Distinto de rechazar: no lleva motivo porque no se le comunica nada al
-- solicitante. Es "no corresponde, sacala de la vista".
CREATE OR REPLACE FUNCTION public.rpc_descartar_solicitud(p_solicitud_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_staff_id uuid := fn_solicitudes_guard_staff(p_solicitud_id);
  v_estado   text;
BEGIN
  SELECT estado INTO v_estado FROM solicitudes_acceso WHERE id = p_solicitud_id FOR UPDATE;
  IF v_estado <> 'pendiente' THEN
    RAISE EXCEPTION 'La solicitud ya fue resuelta (estado: %)', v_estado
      USING ERRCODE = '22023';
  END IF;

  UPDATE solicitudes_acceso
     SET estado = 'descartada', resuelta_por = v_staff_id, resuelta_at = now()
   WHERE id = p_solicitud_id;
END;
$$;

-- ------------------------------------------------------------------------
-- 8 · Permisos de ejecución
-- ------------------------------------------------------------------------
-- Por defecto una función es ejecutable por PUBLIC, que incluye `anon`. Los
-- guards internos ya cortan a un anónimo, pero no hay motivo para dejar la
-- puerta y confiar en la cerradura.
REVOKE ALL ON FUNCTION public.fn_solicitudes_guard_staff(uuid)                   FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_solicitar_acceso(text,text,text,text,text,uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_aprobar_solicitud(uuid,text,uuid,boolean)      FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_rechazar_solicitud(uuid,text)                  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_descartar_solicitud(uuid)                      FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.rpc_solicitar_acceso(text,text,text,text,text,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_aprobar_solicitud(uuid,text,uuid,boolean)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_rechazar_solicitud(uuid,text)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_descartar_solicitud(uuid)                   TO authenticated;
-- fn_solicitudes_guard_staff queda SIN grant: es interna de las tres RPCs.

-- ------------------------------------------------------------------------
-- Verificación dentro de la transacción — revisar ANTES del COMMIT
-- ------------------------------------------------------------------------
SELECT count(*) AS policies_permisivas FROM fn_audit_policies_permisivas();

SELECT policyname, cmd FROM pg_policies
WHERE schemaname='public' AND tablename='solicitudes_acceso';

SELECT relrowsecurity AS rls_activa FROM pg_class
WHERE relname='solicitudes_acceso' AND relnamespace='public'::regnamespace;

SELECT p.proname, p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND (p.proname LIKE 'rpc_%solicit%' OR p.proname='fn_solicitudes_guard_staff')
ORDER BY p.proname;

COMMIT;
