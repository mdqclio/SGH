-- ============================================================
-- SGH — Migración: RLS multi-tenant + Sistema de Auditoría
-- Fecha: 2026-05-12
-- Propósito: Hardening completo de seguridad para habilitar
--            múltiples clientes (hipódromos) en una sola instancia
-- Idempotente: sí — usa OR REPLACE, IF NOT EXISTS y DROP IF EXISTS
-- Requisito: ejecutar como service_role en el SQL Editor de Supabase
-- ============================================================


-- ============================================================
-- BLOQUE 1: COLUMNA DE RETENCIÓN DE AUDITORÍA EN CLUBS
-- ============================================================

ALTER TABLE clubs ADD COLUMN IF NOT EXISTS auditoria_retencion_meses INTEGER DEFAULT 12;


-- ============================================================
-- BLOQUE 2: FUNCIONES HELPER DE SEGURIDAD
-- Usadas en las USING/WITH CHECK de cada policy.
-- STABLE SECURITY DEFINER SET search_path = public:
--   - STABLE: el planner puede cachearlas por transacción
--   - SECURITY DEFINER: bypasean la RLS de la tabla usuarios
--     al ser invocadas desde otra policy, evitando recursión infinita
-- ============================================================

CREATE OR REPLACE FUNCTION fn_get_user_club_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT u.club_id
  FROM usuarios u
  WHERE u.email = auth.email()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION fn_is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM usuarios u
    WHERE u.email = auth.email() AND u.rol = 'super_admin'
  );
$$;

CREATE OR REPLACE FUNCTION fn_club_de_reunion(p_reunion_id UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT club_id FROM reuniones WHERE id = p_reunion_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION fn_club_de_carrera(p_carrera_id UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT r.club_id
  FROM carreras c
  JOIN reuniones r ON r.id = c.reunion_id
  WHERE c.id = p_carrera_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION fn_club_de_inscripcion(p_inscripcion_id UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT r.club_id
  FROM inscripciones i
  JOIN carreras c ON c.id = i.carrera_id
  JOIN reuniones r ON r.id = c.reunion_id
  WHERE i.id = p_inscripcion_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION fn_club_de_liquidacion(p_liquidacion_id UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT club_id FROM liquidaciones WHERE id = p_liquidacion_id LIMIT 1;
$$;


-- ============================================================
-- BLOQUE 3: FUNCIÓN DE AUDITORÍA
-- Registra INSERT/UPDATE/DELETE en la tabla auditoria.
-- SECURITY DEFINER: resuelve usuario_id por email del JWT
-- independientemente de la RLS activa sobre usuarios.
-- ============================================================

CREATE OR REPLACE FUNCTION fn_auditoria_log()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_usuario_id    UUID;
  v_club_id       UUID;
  v_datos_antes   JSONB;
  v_datos_despues JSONB;
BEGIN
  SELECT u.id, u.club_id
  INTO v_usuario_id, v_club_id
  FROM usuarios u
  WHERE u.email = auth.email()
  LIMIT 1;

  IF TG_OP = 'DELETE' THEN
    v_datos_antes   := to_jsonb(OLD);
    v_datos_despues := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_datos_antes   := NULL;
    v_datos_despues := to_jsonb(NEW);
  ELSE
    v_datos_antes   := to_jsonb(OLD);
    v_datos_despues := to_jsonb(NEW);
  END IF;

  INSERT INTO auditoria (club_id, usuario_id, tabla, registro_id, accion, datos_antes, datos_despues)
  VALUES (
    v_club_id,
    v_usuario_id,
    TG_TABLE_NAME,
    CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
    TG_OP,
    v_datos_antes,
    v_datos_despues
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;


-- ============================================================
-- BLOQUE 4: TRIGGERS DE AUDITORÍA (8 tablas)
-- AFTER INSERT OR UPDATE OR DELETE — cada operación queda logueada.
-- DROP + CREATE para idempotencia.
-- ============================================================

DROP TRIGGER IF EXISTS trg_audit_reuniones ON reuniones;
CREATE TRIGGER trg_audit_reuniones
  AFTER INSERT OR UPDATE OR DELETE ON reuniones
  FOR EACH ROW EXECUTE FUNCTION fn_auditoria_log();

DROP TRIGGER IF EXISTS trg_audit_carreras ON carreras;
CREATE TRIGGER trg_audit_carreras
  AFTER INSERT OR UPDATE OR DELETE ON carreras
  FOR EACH ROW EXECUTE FUNCTION fn_auditoria_log();

DROP TRIGGER IF EXISTS trg_audit_inscripciones ON inscripciones;
CREATE TRIGGER trg_audit_inscripciones
  AFTER INSERT OR UPDATE OR DELETE ON inscripciones
  FOR EACH ROW EXECUTE FUNCTION fn_auditoria_log();

DROP TRIGGER IF EXISTS trg_audit_resultados ON resultados;
CREATE TRIGGER trg_audit_resultados
  AFTER INSERT OR UPDATE OR DELETE ON resultados
  FOR EACH ROW EXECUTE FUNCTION fn_auditoria_log();

DROP TRIGGER IF EXISTS trg_audit_liquidaciones ON liquidaciones;
CREATE TRIGGER trg_audit_liquidaciones
  AFTER INSERT OR UPDATE OR DELETE ON liquidaciones
  FOR EACH ROW EXECUTE FUNCTION fn_auditoria_log();

DROP TRIGGER IF EXISTS trg_audit_clubs ON clubs;
CREATE TRIGGER trg_audit_clubs
  AFTER INSERT OR UPDATE OR DELETE ON clubs
  FOR EACH ROW EXECUTE FUNCTION fn_auditoria_log();

DROP TRIGGER IF EXISTS trg_audit_usuarios ON usuarios;
CREATE TRIGGER trg_audit_usuarios
  AFTER INSERT OR UPDATE OR DELETE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION fn_auditoria_log();

DROP TRIGGER IF EXISTS trg_audit_categorias_carrera ON categorias_carrera;
CREATE TRIGGER trg_audit_categorias_carrera
  AFTER INSERT OR UPDATE OR DELETE ON categorias_carrera
  FOR EACH ROW EXECUTE FUNCTION fn_auditoria_log();


-- ============================================================
-- BLOQUE 5: FUNCIÓN DE PURGA DE AUDITORÍA
-- Borra registros más antiguos que auditoria_retencion_meses
-- de cada club. Devuelve cantidad de filas eliminadas.
-- ============================================================

CREATE OR REPLACE FUNCTION fn_purgar_auditoria()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER := 0;
BEGIN
  DELETE FROM auditoria a
  USING clubs c
  WHERE a.club_id = c.id
    AND a.created_at < NOW() - (COALESCE(c.auditoria_retencion_meses, 12) || ' months')::INTERVAL;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;


-- ============================================================
-- BLOQUE 6: TRIGGER ANTI AUTO-PROMOCIÓN EN usuarios
-- BEFORE UPDATE con SECURITY INVOKER (necesita acceso a OLD y NEW).
-- No se puede implementar como policy porque PostgreSQL policies
-- no comparan OLD vs NEW — solo el trigger tiene ambas versiones.
-- ============================================================

CREATE OR REPLACE FUNCTION fn_proteger_rol_club_id_usuario()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
BEGIN
  IF NOT fn_is_super_admin() THEN
    IF NEW.rol IS DISTINCT FROM OLD.rol THEN
      RAISE EXCEPTION 'No autorizado: no podés cambiar tu propio rol.';
    END IF;
    IF NEW.club_id IS DISTINCT FROM OLD.club_id THEN
      RAISE EXCEPTION 'No autorizado: no podés cambiar tu propio club_id.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proteger_rol_club_id_usuario ON usuarios;
CREATE TRIGGER trg_proteger_rol_club_id_usuario
  BEFORE UPDATE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION fn_proteger_rol_club_id_usuario();


-- ============================================================
-- BLOQUE 7: RLS — FASE 1 (caballerizas)
-- Primera tabla piloto. Patrón estándar con club_id directo.
-- ============================================================

ALTER TABLE caballerizas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON caballerizas;
DROP POLICY IF EXISTS "dev_allow_all" ON caballerizas;

CREATE POLICY "rls_caballerizas_select" ON caballerizas
  FOR SELECT TO authenticated
  USING (fn_is_super_admin() OR club_id = fn_get_user_club_id());

CREATE POLICY "rls_caballerizas_insert" ON caballerizas
  FOR INSERT TO authenticated
  WITH CHECK (fn_is_super_admin() OR club_id = fn_get_user_club_id());

CREATE POLICY "rls_caballerizas_update" ON caballerizas
  FOR UPDATE TO authenticated
  USING (fn_is_super_admin() OR club_id = fn_get_user_club_id())
  WITH CHECK (fn_is_super_admin() OR club_id = fn_get_user_club_id());

CREATE POLICY "rls_caballerizas_delete" ON caballerizas
  FOR DELETE TO authenticated
  USING (fn_is_super_admin() OR club_id = fn_get_user_club_id());


-- ============================================================
-- BLOQUE 8: RLS — FASE 2A (club_id directo)
-- categorias_carrera, reuniones, liquidaciones, resoluciones, hipodromos
-- ============================================================

-- categorias_carrera
ALTER TABLE categorias_carrera ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON categorias_carrera;
DROP POLICY IF EXISTS "dev_allow_all" ON categorias_carrera;

CREATE POLICY "rls_categorias_select" ON categorias_carrera FOR SELECT TO authenticated
  USING (fn_is_super_admin() OR club_id = fn_get_user_club_id());
CREATE POLICY "rls_categorias_insert" ON categorias_carrera FOR INSERT TO authenticated
  WITH CHECK (fn_is_super_admin() OR club_id = fn_get_user_club_id());
CREATE POLICY "rls_categorias_update" ON categorias_carrera FOR UPDATE TO authenticated
  USING (fn_is_super_admin() OR club_id = fn_get_user_club_id())
  WITH CHECK (fn_is_super_admin() OR club_id = fn_get_user_club_id());
CREATE POLICY "rls_categorias_delete" ON categorias_carrera FOR DELETE TO authenticated
  USING (fn_is_super_admin() OR club_id = fn_get_user_club_id());

-- reuniones
ALTER TABLE reuniones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON reuniones;
DROP POLICY IF EXISTS "dev_allow_all" ON reuniones;

CREATE POLICY "rls_reuniones_select" ON reuniones FOR SELECT TO authenticated
  USING (fn_is_super_admin() OR club_id = fn_get_user_club_id());
CREATE POLICY "rls_reuniones_insert" ON reuniones FOR INSERT TO authenticated
  WITH CHECK (fn_is_super_admin() OR club_id = fn_get_user_club_id());
CREATE POLICY "rls_reuniones_update" ON reuniones FOR UPDATE TO authenticated
  USING (fn_is_super_admin() OR club_id = fn_get_user_club_id())
  WITH CHECK (fn_is_super_admin() OR club_id = fn_get_user_club_id());
CREATE POLICY "rls_reuniones_delete" ON reuniones FOR DELETE TO authenticated
  USING (fn_is_super_admin() OR club_id = fn_get_user_club_id());

-- liquidaciones
ALTER TABLE liquidaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON liquidaciones;
DROP POLICY IF EXISTS "dev_allow_all" ON liquidaciones;

CREATE POLICY "rls_liquidaciones_select" ON liquidaciones FOR SELECT TO authenticated
  USING (fn_is_super_admin() OR club_id = fn_get_user_club_id());
CREATE POLICY "rls_liquidaciones_insert" ON liquidaciones FOR INSERT TO authenticated
  WITH CHECK (fn_is_super_admin() OR club_id = fn_get_user_club_id());
CREATE POLICY "rls_liquidaciones_update" ON liquidaciones FOR UPDATE TO authenticated
  USING (fn_is_super_admin() OR club_id = fn_get_user_club_id())
  WITH CHECK (fn_is_super_admin() OR club_id = fn_get_user_club_id());
CREATE POLICY "rls_liquidaciones_delete" ON liquidaciones FOR DELETE TO authenticated
  USING (fn_is_super_admin() OR club_id = fn_get_user_club_id());

-- resoluciones
ALTER TABLE resoluciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON resoluciones;
DROP POLICY IF EXISTS "dev_allow_all" ON resoluciones;

CREATE POLICY "rls_resoluciones_select" ON resoluciones FOR SELECT TO authenticated
  USING (fn_is_super_admin() OR club_id = fn_get_user_club_id());
CREATE POLICY "rls_resoluciones_insert" ON resoluciones FOR INSERT TO authenticated
  WITH CHECK (fn_is_super_admin() OR club_id = fn_get_user_club_id());
CREATE POLICY "rls_resoluciones_update" ON resoluciones FOR UPDATE TO authenticated
  USING (fn_is_super_admin() OR club_id = fn_get_user_club_id())
  WITH CHECK (fn_is_super_admin() OR club_id = fn_get_user_club_id());
CREATE POLICY "rls_resoluciones_delete" ON resoluciones FOR DELETE TO authenticated
  USING (fn_is_super_admin() OR club_id = fn_get_user_club_id());

-- hipodromos
ALTER TABLE hipodromos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON hipodromos;
DROP POLICY IF EXISTS "dev_allow_all" ON hipodromos;

CREATE POLICY "rls_hipodromos_select" ON hipodromos FOR SELECT TO authenticated
  USING (fn_is_super_admin() OR club_id = fn_get_user_club_id());
CREATE POLICY "rls_hipodromos_insert" ON hipodromos FOR INSERT TO authenticated
  WITH CHECK (fn_is_super_admin() OR club_id = fn_get_user_club_id());
CREATE POLICY "rls_hipodromos_update" ON hipodromos FOR UPDATE TO authenticated
  USING (fn_is_super_admin() OR club_id = fn_get_user_club_id())
  WITH CHECK (fn_is_super_admin() OR club_id = fn_get_user_club_id());
CREATE POLICY "rls_hipodromos_delete" ON hipodromos FOR DELETE TO authenticated
  USING (fn_is_super_admin() OR club_id = fn_get_user_club_id());


-- ============================================================
-- BLOQUE 9: RLS — FASE 2B (FK indirecta)
-- carreras, inscripciones, resultados, resultado_posiciones, liquidacion_detalle
-- No tienen club_id directo — se resuelve vía funciones helper
-- ============================================================

-- carreras (club_id vía reunion_id → reuniones.club_id)
ALTER TABLE carreras ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON carreras;
DROP POLICY IF EXISTS "dev_allow_all" ON carreras;

CREATE POLICY "rls_carreras_select" ON carreras FOR SELECT TO authenticated
  USING (fn_is_super_admin() OR fn_club_de_carrera(id) = fn_get_user_club_id());
CREATE POLICY "rls_carreras_insert" ON carreras FOR INSERT TO authenticated
  WITH CHECK (fn_is_super_admin() OR fn_club_de_reunion(reunion_id) = fn_get_user_club_id());
CREATE POLICY "rls_carreras_update" ON carreras FOR UPDATE TO authenticated
  USING (fn_is_super_admin() OR fn_club_de_carrera(id) = fn_get_user_club_id())
  WITH CHECK (fn_is_super_admin() OR fn_club_de_carrera(id) = fn_get_user_club_id());
CREATE POLICY "rls_carreras_delete" ON carreras FOR DELETE TO authenticated
  USING (fn_is_super_admin() OR fn_club_de_carrera(id) = fn_get_user_club_id());

-- inscripciones (club_id vía carrera_id → carreras → reuniones)
ALTER TABLE inscripciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON inscripciones;
DROP POLICY IF EXISTS "dev_allow_all" ON inscripciones;

CREATE POLICY "rls_inscripciones_select" ON inscripciones FOR SELECT TO authenticated
  USING (fn_is_super_admin() OR fn_club_de_inscripcion(id) = fn_get_user_club_id());
CREATE POLICY "rls_inscripciones_insert" ON inscripciones FOR INSERT TO authenticated
  WITH CHECK (fn_is_super_admin() OR fn_club_de_carrera(carrera_id) = fn_get_user_club_id());
CREATE POLICY "rls_inscripciones_update" ON inscripciones FOR UPDATE TO authenticated
  USING (fn_is_super_admin() OR fn_club_de_inscripcion(id) = fn_get_user_club_id())
  WITH CHECK (fn_is_super_admin() OR fn_club_de_inscripcion(id) = fn_get_user_club_id());
CREATE POLICY "rls_inscripciones_delete" ON inscripciones FOR DELETE TO authenticated
  USING (fn_is_super_admin() OR fn_club_de_inscripcion(id) = fn_get_user_club_id());

-- resultados (club_id vía carrera_id)
ALTER TABLE resultados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON resultados;
DROP POLICY IF EXISTS "dev_allow_all" ON resultados;

CREATE POLICY "rls_resultados_select" ON resultados FOR SELECT TO authenticated
  USING (fn_is_super_admin() OR fn_club_de_carrera(carrera_id) = fn_get_user_club_id());
CREATE POLICY "rls_resultados_insert" ON resultados FOR INSERT TO authenticated
  WITH CHECK (fn_is_super_admin() OR fn_club_de_carrera(carrera_id) = fn_get_user_club_id());
CREATE POLICY "rls_resultados_update" ON resultados FOR UPDATE TO authenticated
  USING (fn_is_super_admin() OR fn_club_de_carrera(carrera_id) = fn_get_user_club_id())
  WITH CHECK (fn_is_super_admin() OR fn_club_de_carrera(carrera_id) = fn_get_user_club_id());
CREATE POLICY "rls_resultados_delete" ON resultados FOR DELETE TO authenticated
  USING (fn_is_super_admin() OR fn_club_de_carrera(carrera_id) = fn_get_user_club_id());

-- resultado_posiciones (club_id vía inscripcion_id)
ALTER TABLE resultado_posiciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON resultado_posiciones;
DROP POLICY IF EXISTS "dev_allow_all" ON resultado_posiciones;

CREATE POLICY "rls_rp_select" ON resultado_posiciones FOR SELECT TO authenticated
  USING (fn_is_super_admin() OR fn_club_de_inscripcion(inscripcion_id) = fn_get_user_club_id());
CREATE POLICY "rls_rp_insert" ON resultado_posiciones FOR INSERT TO authenticated
  WITH CHECK (fn_is_super_admin() OR fn_club_de_inscripcion(inscripcion_id) = fn_get_user_club_id());
CREATE POLICY "rls_rp_update" ON resultado_posiciones FOR UPDATE TO authenticated
  USING (fn_is_super_admin() OR fn_club_de_inscripcion(inscripcion_id) = fn_get_user_club_id())
  WITH CHECK (fn_is_super_admin() OR fn_club_de_inscripcion(inscripcion_id) = fn_get_user_club_id());
CREATE POLICY "rls_rp_delete" ON resultado_posiciones FOR DELETE TO authenticated
  USING (fn_is_super_admin() OR fn_club_de_inscripcion(inscripcion_id) = fn_get_user_club_id());

-- liquidacion_detalle (club_id vía liquidacion_id)
ALTER TABLE liquidacion_detalle ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON liquidacion_detalle;
DROP POLICY IF EXISTS "dev_allow_all" ON liquidacion_detalle;

CREATE POLICY "rls_liqdet_select" ON liquidacion_detalle FOR SELECT TO authenticated
  USING (fn_is_super_admin() OR fn_club_de_liquidacion(liquidacion_id) = fn_get_user_club_id());
CREATE POLICY "rls_liqdet_insert" ON liquidacion_detalle FOR INSERT TO authenticated
  WITH CHECK (fn_is_super_admin() OR fn_club_de_liquidacion(liquidacion_id) = fn_get_user_club_id());
CREATE POLICY "rls_liqdet_update" ON liquidacion_detalle FOR UPDATE TO authenticated
  USING (fn_is_super_admin() OR fn_club_de_liquidacion(liquidacion_id) = fn_get_user_club_id())
  WITH CHECK (fn_is_super_admin() OR fn_club_de_liquidacion(liquidacion_id) = fn_get_user_club_id());
CREATE POLICY "rls_liqdet_delete" ON liquidacion_detalle FOR DELETE TO authenticated
  USING (fn_is_super_admin() OR fn_club_de_liquidacion(liquidacion_id) = fn_get_user_club_id());


-- ============================================================
-- BLOQUE 10: RLS — FASE 3 (catálogos globales)
-- spcs, propietarios, profesionales
-- Modelo cooperativo federativo: SELECT/INSERT/UPDATE abiertos
-- a todos los hipódromos. DELETE solo super_admin.
-- Un caballo o propietario puede operar en múltiples hipódromos.
-- ============================================================

ALTER TABLE spcs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON spcs;
DROP POLICY IF EXISTS "dev_allow_all" ON spcs;

CREATE POLICY "rls_spcs_select" ON spcs FOR SELECT TO authenticated USING (true);
CREATE POLICY "rls_spcs_insert" ON spcs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "rls_spcs_update" ON spcs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "rls_spcs_delete" ON spcs FOR DELETE TO authenticated USING (fn_is_super_admin());

ALTER TABLE propietarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON propietarios;
DROP POLICY IF EXISTS "dev_allow_all" ON propietarios;

CREATE POLICY "rls_propietarios_select" ON propietarios FOR SELECT TO authenticated USING (true);
CREATE POLICY "rls_propietarios_insert" ON propietarios FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "rls_propietarios_update" ON propietarios FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "rls_propietarios_delete" ON propietarios FOR DELETE TO authenticated USING (fn_is_super_admin());

ALTER TABLE profesionales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON profesionales;
DROP POLICY IF EXISTS "dev_allow_all" ON profesionales;

CREATE POLICY "rls_profesionales_select" ON profesionales FOR SELECT TO authenticated USING (true);
CREATE POLICY "rls_profesionales_insert" ON profesionales FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "rls_profesionales_update" ON profesionales FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "rls_profesionales_delete" ON profesionales FOR DELETE TO authenticated USING (fn_is_super_admin());


-- ============================================================
-- BLOQUE 11: RLS — FASE 3 especial (sanciones)
-- SELECT abierto: una sanción puede afectar a profesionales
-- que operan en múltiples hipódromos.
-- INSERT/UPDATE restringido al club emisor o super_admin.
-- ============================================================

ALTER TABLE sanciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON sanciones;
DROP POLICY IF EXISTS "dev_allow_all" ON sanciones;

CREATE POLICY "rls_sanciones_select" ON sanciones FOR SELECT TO authenticated USING (true);
CREATE POLICY "rls_sanciones_insert" ON sanciones FOR INSERT TO authenticated
  WITH CHECK (fn_is_super_admin() OR club_id = fn_get_user_club_id());
CREATE POLICY "rls_sanciones_update" ON sanciones FOR UPDATE TO authenticated
  USING (fn_is_super_admin() OR club_id = fn_get_user_club_id())
  WITH CHECK (fn_is_super_admin() OR club_id = fn_get_user_club_id());
CREATE POLICY "rls_sanciones_delete" ON sanciones FOR DELETE TO authenticated
  USING (fn_is_super_admin());


-- ============================================================
-- BLOQUE 12: RLS — FASE 4 (hardening usuarios)
-- Usa DO/LOOP para eliminar TODAS las policies existentes,
-- incluyendo variantes con sufijo (ej: allow_all_usuarios)
-- que no se borrarían con DROP POLICY IF EXISTS "allow_all".
-- ============================================================

ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
    WHERE tablename = 'usuarios' AND schemaname = 'public' LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON usuarios';
  END LOOP;
END $$;

CREATE POLICY "rls_usuarios_select" ON usuarios FOR SELECT TO authenticated
  USING (
    fn_is_super_admin()
    OR email = auth.email()
    OR club_id = fn_get_user_club_id()
  );

CREATE POLICY "rls_usuarios_insert" ON usuarios FOR INSERT TO authenticated
  WITH CHECK (fn_is_super_admin());

CREATE POLICY "rls_usuarios_update" ON usuarios FOR UPDATE TO authenticated
  USING (fn_is_super_admin() OR email = auth.email())
  WITH CHECK (fn_is_super_admin() OR email = auth.email());

CREATE POLICY "rls_usuarios_delete" ON usuarios FOR DELETE TO authenticated
  USING (fn_is_super_admin());


-- ============================================================
-- BLOQUE 13: RLS — FASE 4 (hardening clubs)
-- Cada club solo ve su propio registro.
-- Solo super_admin puede crear, modificar o eliminar clubs.
-- ============================================================

ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
    WHERE tablename = 'clubs' AND schemaname = 'public' LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON clubs';
  END LOOP;
END $$;

CREATE POLICY "rls_clubs_select" ON clubs FOR SELECT TO authenticated
  USING (fn_is_super_admin() OR id = fn_get_user_club_id());

CREATE POLICY "rls_clubs_insert" ON clubs FOR INSERT TO authenticated
  WITH CHECK (fn_is_super_admin());

CREATE POLICY "rls_clubs_update" ON clubs FOR UPDATE TO authenticated
  USING (fn_is_super_admin())
  WITH CHECK (fn_is_super_admin());

CREATE POLICY "rls_clubs_delete" ON clubs FOR DELETE TO authenticated
  USING (fn_is_super_admin());


-- ============================================================
-- FIN DE MIGRACIÓN
-- Estado post-ejecución:
--   17 tablas con RLS endurecida por club_id
--    6 funciones helper (STABLE SECURITY DEFINER)
--    1 función de auditoría fn_auditoria_log() + 8 triggers AFTER
--    1 función de purga fn_purgar_auditoria()
--    1 trigger anti auto-promoción trg_proteger_rol_club_id_usuario
--    1 columna clubs.auditoria_retencion_meses
-- ============================================================
