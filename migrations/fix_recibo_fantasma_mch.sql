-- Recibo fantasma de Mi Club Hípico sobre líneas del sandbox 9999 de Dolores.
--
-- Qué pasó (medido el 2026-08-29):
--   recibos.id = 2d89fb7d-3cc5-43da-ad26-28a15203f4f9
--   club_id    = a6da7e40-1515-45dc-8933-4eef33ce937a  ← Mi Club Hípico (club INACTIVO)
--   numero_recibo = 1 · profesional 6361df8c (ACHINGO, entrenador de DOLORES) · $92.000
--   emitido_at = 2026-08-28 21:20:30 UTC · emitido_por = NULL (ISSUE-057)
--   9 líneas de liquidacion_detalle de la reunión 9999 de DOLORES quedaron colgadas de él,
--   en estado_linea='pagado', con pagado_at = ese timestamp.
--
-- Por qué se pudo: `emitir_recibo` NO valida que las líneas pertenezcan a p_club_id (sólo chequea
-- beneficiario_id + impago + sin recibo), y `cobrosBuscar` NO filtra por club_id. Con el
-- club-switcher en Mi Club Hípico, el tab Pagos seguía mostrando las líneas de Dolores.
-- Ver ISSUE-059 y ISSUE-060 en docs/ISSUES.md. Esta migración arregla LOS DATOS, no la causa.
--
-- Las 9 líneas son fixtures ORIGINALES del sandbox (liquidacion_id b0000000-...-0004, del seed del
-- 2026-06-10), no residuo de un probe: vuelven a 'impago', que es como nacieron. Los recibos 9001
-- y 9002 y sus 4 líneas en 'pagado' NO se tocan: son el bucket 'pagado' que el tab Resumen
-- necesita para poder probarse.
--
-- Guards al escribir: pwd=/home/clio/dev/SGH · spcs=181 · ref=unlhcuanfrtpatoipwve

BEGIN;

-- 1) Soltar las líneas. El FK liquidacion_detalle.recibo_id es NO ACTION: primero se sueltan,
--    después se borra el recibo.
UPDATE liquidacion_detalle
   SET recibo_id = NULL, estado_linea = 'impago', pagado_at = NULL
 WHERE recibo_id = '2d89fb7d-3cc5-43da-ad26-28a15203f4f9';

-- 2) Guard: tienen que haber sido exactamente 9, todas de la 9999 y todas del mismo entrenador.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM liquidacion_detalle
   WHERE reunion_id='a0000000-0000-0000-0000-000000009999'
     AND beneficiario_id='6361df8c-179c-4e1b-9846-b589a46a0a2d'
     AND estado_linea='impago' AND recibo_id IS NULL;
  IF n <> 9 THEN RAISE EXCEPTION 'esperaba 9 líneas devueltas a impago, hay %', n; END IF;
END $$;

-- 3) Borrar el recibo fantasma. Ya no lo referencia ninguna línea.
DELETE FROM recibos WHERE id = '2d89fb7d-3cc5-43da-ad26-28a15203f4f9';

-- 4) Guard final: la 9999 vuelve a 36 líneas pagables por $488.000 — el número de ISSUE-055.
DO $$
DECLARE n int; t numeric;
BEGIN
  SELECT count(*), coalesce(sum(monto_neto),0) INTO n, t FROM liquidacion_detalle
   WHERE reunion_id='a0000000-0000-0000-0000-000000009999'
     AND beneficiario_tipo <> 'club' AND estado_linea='impago' AND recibo_id IS NULL;
  IF n <> 36 OR t <> 488000.00 THEN
    RAISE EXCEPTION 'esperaba 36 líneas por 488000.00, hay % por %', n, t;
  END IF;
END $$;

COMMIT;

-- ── ROLLBACK (reconstruye el recibo fantasma tal cual estaba; sólo si hiciera falta) ──────────
-- BEGIN;
-- INSERT INTO recibos (id, club_id, numero_recibo, beneficiario_tipo, profesional_id,
--                      propietario_id, forma_pago, total_premios, total_descuentos, retencion_dgi,
--                      cobrador_nombre, cobrador_documento, comprobante_url, estado, emitido_por,
--                      emitido_at, created_at)
-- VALUES ('2d89fb7d-3cc5-43da-ad26-28a15203f4f9','a6da7e40-1515-45dc-8933-4eef33ce937a',1,
--         'profesional','6361df8c-179c-4e1b-9846-b589a46a0a2d',NULL,'efectivo',92000.00,0.00,0.00,
--         NULL,NULL,NULL,'emitido',NULL,'2026-08-28 21:20:30.223228+00','2026-08-28 21:20:30.223228+00');
-- UPDATE liquidacion_detalle
--    SET recibo_id='2d89fb7d-3cc5-43da-ad26-28a15203f4f9', estado_linea='pagado',
--        pagado_at='2026-08-28 21:20:30.223228+00'
--  WHERE id IN ('88c71919-8033-4051-9715-9a11e9d2be70','e59bad0f-55c1-4dc0-8a38-f098a07ca3e3',
--               '6c6a992d-e403-425a-bfdf-76ac55bed32b','e9a33272-41e8-47ad-a6e3-704a7f3c6acb',
--               '7eb5a8ba-f8b8-4f8d-a1ec-7155c4125a9f','dfb24b16-82d5-4d89-a52e-ad734eda25b6',
--               'f09147fd-e4bc-46ee-ab34-e2c2ef409a97','c78b42a5-0df1-45e5-a54f-f28e4712674f',
--               '9f5ca0ce-8ab7-4269-9e18-a1d1a3601438');
-- COMMIT;
