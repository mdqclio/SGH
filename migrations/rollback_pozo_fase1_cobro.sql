-- Rollback de pozo_fase1_cobro.sql (pieza 1, schema). Deja la base como antes.
-- ⚠️ Borra pozo_cobros y sus filas. Sólo si nunca se cobró nada (o con backup).
-- fn_siguiente_recibo vuelve a su cuerpo original (INSERT ... 'recibo' inline).
DROP VIEW IF EXISTS public.v_pozo_carrera;
DROP TRIGGER IF EXISTS trg_audit_pozo_cobros ON public.pozo_cobros;
DROP POLICY IF EXISTS pozo_cobros_select ON public.pozo_cobros;
DROP TABLE IF EXISTS public.pozo_cobros;
DROP TYPE IF EXISTS public.estado_pozo_cobro;
ALTER TABLE public.carreras  DROP CONSTRAINT IF EXISTS chk_carreras_pozo_monto;
ALTER TABLE public.carreras  DROP COLUMN IF EXISTS pozo_monto_caballo;
ALTER TABLE public.reuniones DROP CONSTRAINT IF EXISTS chk_reuniones_pozo_retencion_pct;
ALTER TABLE public.reuniones DROP COLUMN IF EXISTS pozo_retencion_pct;

CREATE OR REPLACE FUNCTION public.fn_siguiente_recibo(p_club_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_num INTEGER;
BEGIN
  INSERT INTO club_secuencias (club_id, tipo, ultimo_numero)
  VALUES (p_club_id, 'recibo', 1)
  ON CONFLICT (club_id, tipo)
  DO UPDATE SET ultimo_numero = club_secuencias.ultimo_numero + 1
  RETURNING ultimo_numero INTO v_num;
  RETURN v_num;
END $function$;
DROP FUNCTION IF EXISTS public.fn_siguiente_numero(uuid, text);
-- La fila club_secuencias (club,'recibo_cobro') se deja: es inofensiva y conserva el
-- historial de números consumidos. DELETE FROM club_secuencias WHERE tipo='recibo_cobro'; si se quiere limpiar.
