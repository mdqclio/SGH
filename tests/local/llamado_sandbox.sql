-- tests/local/llamado_sandbox.sql — las FK que PostgREST necesita para los embeds del llamado del portal y del encabezado de
-- inscripciones (reuniones → hipodromos, reuniones ← carreras, carreras → categorias_carrera), con los mismos nombres y
-- definiciones que en prod (medido el 2026-10-02). El DDL de clonar_9999.mjs no trae FK.
-- NOT VALID: no revalida las filas ya cargadas (la 9999 apunta a un hipódromo que el sandbox no tiene); las filas nuevas sí se validan.
-- Idempotente. Lo usan tests/probe_bolsa_efectiva.mjs y tests/probe_paridad_llamado_inscripciones.mjs.
--   tests/local/up.sh sql < tests/local/llamado_sandbox.sql
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reuniones_hipodromo_id_fkey') THEN
    ALTER TABLE public.reuniones ADD CONSTRAINT reuniones_hipodromo_id_fkey
      FOREIGN KEY (hipodromo_id) REFERENCES public.hipodromos(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'carreras_reunion_id_fkey') THEN
    ALTER TABLE public.carreras ADD CONSTRAINT carreras_reunion_id_fkey
      FOREIGN KEY (reunion_id) REFERENCES public.reuniones(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'carreras_categoria_id_fkey') THEN
    ALTER TABLE public.carreras ADD CONSTRAINT carreras_categoria_id_fkey
      FOREIGN KEY (categoria_id) REFERENCES public.categorias_carrera(id) NOT VALID;
  END IF;
END $$;
NOTIFY pgrst, 'reload schema';
