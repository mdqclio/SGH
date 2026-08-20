-- ============================================================
-- Campos de origen en la solicitud de acceso
-- ============================================================
-- No existe padrón nacional de profesionales ni de caballerizas: cada hipódromo
-- registra los suyos (confirmado por Diego). La validación de una solicitud la
-- hace la secretaría a mano, llamando al hipódromo de origen. Para eso hay que
-- capturar de dónde viene la persona.
--
-- Entrenador  → hipódromo que le otorgó la patente (obligatorio) + nro de patente (opcional)
-- Propietario → caballeriza (obligatorio) + hipódromo donde está registrada (obligatorio)
--
-- Las columnas son TEXTO LIBRE, no FK. Motivos:
--   1. No hay catálogo nacional que referenciar.
--   2. `hipodromos` es per-tenant (tiene club_id) y load-bearing: la referencian
--      reuniones.hipodromo_id y comision_config.hipodromo_id. No se recicla.
--   3. El solicitante todavía no tiene fila en `usuarios`, así que las policies
--      de clubs/hipodromos (club_id = fn_get_user_club_id()) le devuelven vacío.
--      Un desplegable poblado desde la DB se vería vacío para él.
-- El formulario sugiere valores con un <datalist> en el HTML — sin tabla, sin FK
-- y sin abrir lectura anon.
--
-- Todas NULL-ables a propósito: las solicitudes ya cargadas no tienen estos
-- datos y un NOT NULL las rompería. La obligatoriedad por rol la valida el
-- frontend y la RPC de acá abajo.
-- ============================================================
BEGIN;

ALTER TABLE public.solicitudes_acceso
  ADD COLUMN IF NOT EXISTS origen_hipodromo   varchar(120),
  ADD COLUMN IF NOT EXISTS origen_patente_nro varchar(40),
  ADD COLUMN IF NOT EXISTS origen_caballeriza varchar(120);

COMMENT ON COLUMN public.solicitudes_acceso.origen_hipodromo IS
  'Declarado por el solicitante. Entrenador: hipódromo que le otorgó la patente. '
  'Propietario: hipódromo donde está registrada la caballeriza. Texto libre.';
COMMENT ON COLUMN public.solicitudes_acceso.origen_patente_nro IS
  'Declarado por el solicitante (entrenador). Opcional: puede no acordarse.';
COMMENT ON COLUMN public.solicitudes_acceso.origen_caballeriza IS
  'Declarado por el solicitante (propietario). Nombre de la caballeriza / stud.';

-- ------------------------------------------------------------
-- rpc_solicitar_acceso — se le agregan 3 parámetros
-- ------------------------------------------------------------
-- OJO: acá NO sirve CREATE OR REPLACE. Cambiar la lista de argumentos no
-- reemplaza la función: crea una SOBRECARGA. Con dos candidatas, PostgREST
-- devuelve PGRST203 ("Could not choose the best candidate function") y la
-- solicitud se rompe en prod. Por eso va DROP + CREATE, dentro de la misma
-- transacción para que no quede ventana sin función.
DROP FUNCTION IF EXISTS public.rpc_solicitar_acceso(text,text,text,text,text,uuid,text,text);

CREATE FUNCTION public.rpc_solicitar_acceso(
  p_nombre text, p_apellido text, p_documento_nro text, p_telefono text,
  p_rol_pedido text, p_club_id uuid, p_documento_tipo text DEFAULT 'DNI', p_email text DEFAULT NULL,
  p_origen_hipodromo text DEFAULT NULL, p_origen_patente_nro text DEFAULT NULL,
  p_origen_caballeriza text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); v_email text; v_doc text := btrim(coalesce(p_documento_nro,'')); v_id uuid;
        v_hip text := nullif(btrim(coalesce(p_origen_hipodromo,'')),'');
        v_pat text := nullif(btrim(coalesce(p_origen_patente_nro,'')),'');
        v_cab text := nullif(btrim(coalesce(p_origen_caballeriza,'')),'');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'No autenticado' USING ERRCODE='28000'; END IF;
  SELECT lower(btrim(a.email)) INTO v_email FROM auth.users a WHERE a.id = v_uid;
  IF v_email IS NULL OR v_email='' THEN RAISE EXCEPTION 'La cuenta no tiene email' USING ERRCODE='22023'; END IF;
  IF p_email IS NOT NULL AND lower(btrim(p_email)) <> v_email THEN
    RAISE EXCEPTION 'El email no coincide con el de la cuenta' USING ERRCODE='22023'; END IF;
  IF EXISTS (SELECT 1 FROM usuarios WHERE auth_user_id = v_uid) THEN
    RAISE EXCEPTION 'La cuenta ya tiene acceso al sistema' USING ERRCODE='23505'; END IF;
  IF btrim(coalesce(p_nombre,''))='' OR btrim(coalesce(p_apellido,''))='' THEN
    RAISE EXCEPTION 'Nombre y apellido son obligatorios' USING ERRCODE='22023'; END IF;
  IF v_doc !~ '^[0-9]{7,8}$' THEN
    RAISE EXCEPTION 'El DNI debe tener 7 u 8 dígitos, sin puntos ni espacios' USING ERRCODE='22023'; END IF;
  -- Teléfono RECOMENDADO, no obligatorio (adenda del Gate 3). Se guarda NULL si
  -- viene vacío, para que la bandeja sepa que no hay a dónde avisar.
  IF p_rol_pedido NOT IN ('profesional','propietario') THEN
    RAISE EXCEPTION 'rol_pedido inválido: se espera profesional o propietario' USING ERRCODE='22023'; END IF;
  -- Origen: obligatorio en los dos roles, con un campo extra para el propietario.
  -- Es el dato con el que la secretaría llama al hipódromo a validar; sin eso la
  -- solicitud no se puede resolver.
  IF v_hip IS NULL THEN
    RAISE EXCEPTION 'El hipódromo de origen es obligatorio' USING ERRCODE='22023'; END IF;
  IF p_rol_pedido = 'propietario' AND v_cab IS NULL THEN
    RAISE EXCEPTION 'La caballeriza es obligatoria para propietarios' USING ERRCODE='22023'; END IF;
  -- El nro de patente sólo aplica al entrenador. Si viene cargado en una
  -- solicitud de propietario se descarta, para que la bandeja no muestre un dato
  -- que no corresponde al rol.
  IF p_rol_pedido <> 'profesional' THEN v_pat := NULL; END IF;
  IF p_rol_pedido <> 'propietario' THEN v_cab := NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM clubs WHERE id = p_club_id) THEN
    RAISE EXCEPTION 'Hipódromo inexistente' USING ERRCODE='P0002'; END IF;
  BEGIN
    INSERT INTO solicitudes_acceso (auth_user_id,email,nombre,apellido,documento_tipo,documento_nro,telefono,
                                    rol_pedido,club_id,origen_hipodromo,origen_patente_nro,origen_caballeriza)
    VALUES (v_uid,v_email,btrim(p_nombre),btrim(p_apellido),
            coalesce(nullif(btrim(p_documento_tipo),''),'DNI'),v_doc,nullif(btrim(coalesce(p_telefono,'')),''),
            p_rol_pedido,p_club_id,v_hip,v_pat,v_cab)
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    IF sqlerrm ILIKE '%ux_solicitud_pendiente_doc%' THEN
      RAISE EXCEPTION 'Ya hay una solicitud pendiente con ese documento' USING ERRCODE='23505'; END IF;
    RAISE EXCEPTION 'Esta cuenta ya envió una solicitud' USING ERRCODE='23505';
  END;
  RETURN v_id;
END; $$;

-- ------------------------------------------------------------
-- Permisos — OBLIGATORIO despues de un DROP
-- ------------------------------------------------------------
-- DROP FUNCTION se lleva el ACL puesto, y una funcion recien creada vuelve a
-- ser ejecutable por PUBLIC. Sin esto, el DROP+CREATE deshace en silencio el
-- hardening del Gate 2 (migrations/sec_autoregistro_gate2.sql, seccion 8).
-- Los guards internos igual cortan a un anonimo, pero no hay motivo para dejar
-- la puerta abierta y confiar en la cerradura.
REVOKE ALL ON FUNCTION public.rpc_solicitar_acceso(text,text,text,text,text,uuid,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_solicitar_acceso(text,text,text,text,text,uuid,text,text,text,text,text) TO authenticated;

COMMIT;
