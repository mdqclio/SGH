-- ============================================================================
-- Liquidaciones C+D — Derivación de propietario
-- ============================================================================
-- Branch: feat/liquidaciones-cd  (NO mergear a main hasta validación Fede)
-- Fecha:  2026-06-02
--
-- Contexto: GOTCHA #47 — inscripciones.propietario_id queda NULL, por lo que no
-- se liquida propietario ni el bono 6-8. Esta migración construye el puente
-- caballeriza_responsables (titular) -> propietarios y deriva
-- inscripciones.propietario_id desde la caballeriza.
--
-- Modelo de datos confirmado por diagnósticas D1-D5 (2026-06-02):
--   - caballeriza_responsables NO tenía propietario_id ni flag titular;
--     el titular se identifica por rol='propietario' AND activo=true.
--   - propietarios de Dolores estaba vacío (prop_dolores=0) -> B1 importa.
--   - 5 responsables titulares SIN DNI (excepciones, no se importan).
--   - D3 dups = 0 (precheck A2 OK), D5 cross-club = 0.
--
-- Gates verificados antes de correr: D3=0, D5=0.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A1) Columna puente en caballeriza_responsables -> propietarios
-- ---------------------------------------------------------------------------
ALTER TABLE caballeriza_responsables ADD COLUMN IF NOT EXISTS propietario_id UUID REFERENCES propietarios(id);

-- ---------------------------------------------------------------------------
-- A2) Índice único parcial para dedupe por documento dentro del club
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_propietarios_club_doc
  ON propietarios (club_id, documento_tipo, documento_nro) WHERE documento_nro IS NOT NULL;

-- ---------------------------------------------------------------------------
-- B1) Import: crear propietarios desde responsables titulares con DNI
-- ---------------------------------------------------------------------------
INSERT INTO propietarios (club_id, tipo, nombre, documento_tipo, documento_nro, localidad, activo, estado)
SELECT DISTINCT ON (COALESCE(cr.documento_tipo,'DNI'), cr.documento_nro)
       '0649e9c5-9e87-4aad-842f-101458e6b33c'::uuid,
       CASE WHEN COALESCE(cr.documento_tipo,'DNI')='CUIT' THEN 'sociedad' ELSE 'persona' END,
       NULLIF(trim(concat_ws(', ', cr.apellido, cr.nombre)), ''),
       COALESCE(cr.documento_tipo,'DNI'), cr.documento_nro, cr.localidad, true, 'activo'
FROM caballeriza_responsables cr WHERE cr.documento_nro IS NOT NULL
ORDER BY COALESCE(cr.documento_tipo,'DNI'), cr.documento_nro, cr.created_at
ON CONFLICT (club_id, documento_tipo, documento_nro) WHERE documento_nro IS NOT NULL DO NOTHING;

-- ---------------------------------------------------------------------------
-- B2) Backfill del puente: enlazar responsables -> propietario por documento
-- ---------------------------------------------------------------------------
UPDATE caballeriza_responsables cr SET propietario_id = p.id
FROM propietarios p
WHERE cr.documento_nro IS NOT NULL AND p.club_id='0649e9c5-9e87-4aad-842f-101458e6b33c'
  AND p.documento_tipo=COALESCE(cr.documento_tipo,'DNI') AND p.documento_nro=cr.documento_nro
  AND cr.propietario_id IS DISTINCT FROM p.id;

-- ---------------------------------------------------------------------------
-- C) Trigger: derivar propietario_id en inscripciones desde la caballeriza
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_inscripcion_set_propietario()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.caballeriza_id IS NOT NULL THEN
    SELECT cr.propietario_id INTO NEW.propietario_id FROM caballeriza_responsables cr
    WHERE cr.caballeriza_id=NEW.caballeriza_id AND cr.rol='propietario' AND cr.activo=true LIMIT 1;
  ELSE NEW.propietario_id := NULL; END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_insc_set_propietario ON inscripciones;
CREATE TRIGGER trg_insc_set_propietario BEFORE INSERT OR UPDATE OF caballeriza_id ON inscripciones
  FOR EACH ROW EXECUTE FUNCTION fn_inscripcion_set_propietario();

-- ---------------------------------------------------------------------------
-- C2) Backfill de inscripciones existentes que ya tienen caballeriza
-- ---------------------------------------------------------------------------
UPDATE inscripciones i SET propietario_id = cr.propietario_id
FROM caballeriza_responsables cr
WHERE i.caballeriza_id=cr.caballeriza_id AND cr.rol='propietario' AND cr.activo=true
  AND i.caballeriza_id IS NOT NULL AND i.propietario_id IS DISTINCT FROM cr.propietario_id;

-- ---------------------------------------------------------------------------
-- C3) Trigger gemelo: al alta/edición de responsable titular, resolver/crear
--     el propietario (v_club resuelto desde la caballeriza + guard RAISE).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_caballeriza_resp_set_propietario()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_club uuid; v_tipo text; v_dt text;
BEGIN
  IF NEW.rol='propietario' AND NEW.documento_nro IS NOT NULL THEN
    SELECT c.club_id INTO v_club FROM caballerizas c WHERE c.id=NEW.caballeriza_id;
    IF v_club IS NULL THEN RAISE EXCEPTION 'Caballeriza % sin club_id', NEW.caballeriza_id; END IF;
    v_dt := COALESCE(NEW.documento_tipo,'DNI');
    v_tipo := CASE WHEN v_dt='CUIT' THEN 'sociedad' ELSE 'persona' END;
    SELECT p.id INTO NEW.propietario_id FROM propietarios p
    WHERE p.club_id=v_club AND p.documento_tipo=v_dt AND p.documento_nro=NEW.documento_nro LIMIT 1;
    IF NEW.propietario_id IS NULL THEN
      INSERT INTO propietarios (club_id, tipo, nombre, documento_tipo, documento_nro, localidad, activo, estado)
      VALUES (v_club, v_tipo, NULLIF(trim(concat_ws(', ', NEW.apellido, NEW.nombre)),''), v_dt, NEW.documento_nro, NEW.localidad, true, 'activo')
      RETURNING id INTO NEW.propietario_id;
    END IF;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_cab_resp_set_propietario ON caballeriza_responsables;
CREATE TRIGGER trg_cab_resp_set_propietario
  BEFORE INSERT OR UPDATE OF rol, documento_tipo, documento_nro, caballeriza_id ON caballeriza_responsables
  FOR EACH ROW EXECUTE FUNCTION fn_caballeriza_resp_set_propietario();
