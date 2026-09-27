-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- SÓLO SANDBOX (tests/local) — NUNCA APLICAR EN PROD.
-- Réplica de la auditoría de prod al 2026-09-27: auth.jwt(), tabla auditoria (con sus FKs) y fn_auditoria_log()
-- copiada de pg_get_functiondef de prod (md5 2121e10d09babc9900fe9d22ef0b12b4). La usa
-- tests/probe_resoluciones_sanciones_autor.mjs.   tests/local/up.sh sql < tests/local/auditoria_sandbox.sql
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION auth.jwt()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  select 
    coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$function$;

CREATE TABLE IF NOT EXISTS public.auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid REFERENCES public.clubs(id),
  usuario_id uuid REFERENCES public.usuarios(id),
  tabla varchar NOT NULL,
  registro_id uuid,
  accion varchar NOT NULL,
  datos_antes jsonb,
  datos_despues jsonb,
  ip varchar,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.auditoria TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_auditoria_log()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_usuario_id UUID;
  v_club_id UUID;
  v_email TEXT;
  v_datos_antes JSONB;
  v_datos_despues JSONB;
  v_registro_id UUID;
BEGIN
  BEGIN
    v_email := auth.jwt() ->> 'email';
  EXCEPTION WHEN OTHERS THEN
    v_email := NULL;
  END;

  IF v_email IS NOT NULL THEN
    SELECT id, club_id INTO v_usuario_id, v_club_id
    FROM usuarios WHERE email = v_email LIMIT 1;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_registro_id := OLD.id;
    v_datos_antes := to_jsonb(OLD);
    v_datos_despues := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_registro_id := NEW.id;
    v_datos_antes := NULL;
    v_datos_despues := to_jsonb(NEW);
  ELSE
    v_registro_id := NEW.id;
    v_datos_antes := to_jsonb(OLD);
    v_datos_despues := to_jsonb(NEW);
    IF (v_datos_antes - 'updated_at') = (v_datos_despues - 'updated_at') THEN
      RETURN NEW;
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'usuarios' THEN
    IF v_datos_antes IS NOT NULL THEN
      v_datos_antes := v_datos_antes - 'password_hash';
    END IF;
    IF v_datos_despues IS NOT NULL THEN
      v_datos_despues := v_datos_despues - 'password_hash';
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'clubs' THEN
    IF TG_OP = 'DELETE' THEN v_club_id := OLD.id; ELSE v_club_id := NEW.id; END IF;
  ELSE
    IF TG_OP = 'DELETE' THEN
      v_club_id := COALESCE((to_jsonb(OLD) ->> 'club_id')::UUID, v_club_id);
    ELSE
      v_club_id := COALESCE((to_jsonb(NEW) ->> 'club_id')::UUID, v_club_id);
    END IF;
  END IF;

  INSERT INTO auditoria (
    club_id, usuario_id, tabla, registro_id, accion,
    datos_antes, datos_despues, created_at
  ) VALUES (
    v_club_id, v_usuario_id, TG_TABLE_NAME, v_registro_id, TG_OP,
    v_datos_antes, v_datos_despues, NOW()
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$function$;

-- FKs de prod que la réplica de ISSUE-093 (tests/local/politicas_escritura_sandbox.sql) no trae y que este probe
-- necesita: la cascada de resolucion_entidades (el borrado de una resolución se lleva sus entidades, y eso tiene
-- que quedar auditado) y creado_por → usuarios en resoluciones.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.resolucion_entidades'::regclass AND contype='f') THEN
    ALTER TABLE public.resolucion_entidades ADD FOREIGN KEY (resolucion_id) REFERENCES public.resoluciones(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey)
                 WHERE c.conrelid='public.resoluciones'::regclass AND c.contype='f' AND a.attname='creado_por') THEN
    ALTER TABLE public.resoluciones ADD FOREIGN KEY (creado_por) REFERENCES public.usuarios(id);
  END IF;
END $$;
