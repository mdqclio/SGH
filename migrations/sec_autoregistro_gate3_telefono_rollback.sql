-- ============================================================
-- ROLLBACK — teléfono vuelve a ser obligatorio en rpc_solicitar_acceso
-- ============================================================
-- Restaura el estado del Gate 2 (main @ f5e4051): la RPC rechaza una solicitud
-- sin teléfono. Ver migrations/sec_autoregistro_gate3_telefono.sql.
-- Sólo cambia esa validación; el resto del cuerpo queda igual.
-- ============================================================
BEGIN;
CREATE OR REPLACE FUNCTION public.rpc_solicitar_acceso(
  p_nombre text, p_apellido text, p_documento_nro text, p_telefono text,
  p_rol_pedido text, p_club_id uuid, p_documento_tipo text DEFAULT 'DNI', p_email text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); v_email text; v_doc text := btrim(coalesce(p_documento_nro,'')); v_id uuid;
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
  IF btrim(coalesce(p_telefono,''))='' THEN
    RAISE EXCEPTION 'El teléfono es obligatorio' USING ERRCODE='22023'; END IF;
  IF p_rol_pedido NOT IN ('profesional','propietario') THEN
    RAISE EXCEPTION 'rol_pedido inválido: se espera profesional o propietario' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM clubs WHERE id = p_club_id) THEN
    RAISE EXCEPTION 'Hipódromo inexistente' USING ERRCODE='P0002'; END IF;
  BEGIN
    INSERT INTO solicitudes_acceso (auth_user_id,email,nombre,apellido,documento_tipo,documento_nro,telefono,rol_pedido,club_id)
    VALUES (v_uid,v_email,btrim(p_nombre),btrim(p_apellido),
            coalesce(nullif(btrim(p_documento_tipo),''),'DNI'),v_doc,btrim(p_telefono),p_rol_pedido,p_club_id)
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    IF sqlerrm ILIKE '%ux_solicitud_pendiente_doc%' THEN
      RAISE EXCEPTION 'Ya hay una solicitud pendiente con ese documento' USING ERRCODE='23505'; END IF;
    RAISE EXCEPTION 'Esta cuenta ya envió una solicitud' USING ERRCODE='23505';
  END;
  RETURN v_id;
END; $$;
COMMIT;
