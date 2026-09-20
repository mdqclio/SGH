-- ============================================================================
-- Saldado de los 5 recibos MANUALES de R9 (20/09/2026) — EJECUTADA 2026-09-21 por MCP
-- ----------------------------------------------------------------------------
-- R9 se suspendió después de la 5ª carrera y Valeria pagó 5 recibos a mano (talonario
-- 0479/0480/0486/0487/0488). Criterio del saldado administrativo de R6/R8 (GOTCHA #74):
-- estado_linea='pagado', recibo_id NULL (no se emite recibo del sistema ni se consume
-- club_secuencias), pagado_at fijo y marca [REGULARIZACION …] en descripcion con el nº de
-- recibo manual y el estado previo.
--
-- Plan y evidencia: docs/diagnosticos/2026-09-20_plan-saldado-recibos-manuales-r9.md (reports).
-- Ejecución:        docs/diagnosticos/2026-09-21_ejecucion-saldado-recibos-manuales-r9.md (reports).
--
-- A) 3 líneas EXISTENTES → pagadas:
--    0479  41eb9f7d  bono 6° C1 SI TIN / SAICA                 $100.000  (confirmó Valeria 21/09: C1, cobró FARIAS)
--    0480  05d72300  bono 7° C2 NISTEL WIN / SILQUITI          $100.000
--    0488  c8b0fe0a  incentivo jockey ACUÑA, MATIAS EZEQUIEL   $ 60.000
-- B) 2 headers + 2 líneas NUEVAS de incentivo_jockey $60.000, ya pagadas:
--    0486  GONZALEZ, EDUARDO CECILIO  421a3eed  (monta C8 EL GRAN HECTOR — no se corrió)
--    0487  CONTRERAS, JUAN CRUZ       9ba2e954  (montas C7 ASTUTO NOTES, C8 INDIO VALIDO — no se corrieron)
--    El motor no las genera (liquidaciones-engine.js:229-251: exige resultado oficial + no_largo=false).
--    CRITERIO DE FEDE (21/09): por la suspensión de R9 tras la 5ª carrera, el incentivo le
--    corresponde a cada jockey ratificado HAYA CORRIDO O NO, y se paga cuando viene a cobrar.
--    Las líneas nuevas tienen la MISMA forma que las del motor (concepto 'Incentivo jockey',
--    inscripcion_id NULL, posicion NULL) para que lineKey() las deduplique si algún día se cargan
--    resultados de C7/C8.
--
-- Pre-condiciones verificadas antes de correr (todas OK el 2026-09-21):
--   · las 3 líneas: impago, recibo_id NULL, pagado_at NULL, netos 100000/100000/60000
--   · 0 headers y 0 líneas de los 2 jockeys en R9
--   · 0 líneas con marca '[REGULARIZACION 2026-09-20'
--   · R9 antes: 145 líneas / 8.367.111,68 / 68 headers; club_secuencias recibo=68
-- ============================================================================

WITH
u AS (
  UPDATE liquidacion_detalle d
     SET estado_linea = 'pagado',
         pagado_at    = '2026-09-20 18:00:00-03:00'::timestamptz,
         descripcion  = coalesce(d.descripcion,'')
                        || ' [REGULARIZACION 2026-09-20: pagado con recibo manual N° ' || m.recibo
                        || ' durante R9 (reunión suspendida tras la 5ª carrera); sin recibo del sistema;'
                        || ' estado previo=impago]'
    FROM (VALUES
            ('41eb9f7d-5e04-4e22-92cb-1838ea4da05b'::uuid, '0479'),   -- bono 6° C1 SI TIN / SAICA (confirmado por Valeria 21/09)
            ('05d72300-35d6-4f89-82cb-18b6c92a4a1c'::uuid, '0480'),   -- bono 7° C2 NISTEL WIN / SILQUITI
            ('c8b0fe0a-e9c0-48bc-b4af-4ef4483e85bc'::uuid, '0488')    -- incentivo jockey ACUÑA MATIAS
         ) AS m(id, recibo)
   WHERE d.id = m.id
     AND d.reunion_id = 'cafa37d6-89f4-45cb-a0d9-835bc27407e9'
     AND d.estado_linea = 'impago'
     AND d.recibo_id IS NULL
     AND d.descripcion NOT LIKE '%[REGULARIZACION%'
  RETURNING d.id
),
h AS (
  INSERT INTO liquidaciones (club_id, reunion_id, profesional_id, estado, total_bruto, total_descuentos, notas)
  SELECT '0649e9c5-9e87-4aad-842f-101458e6b33c', 'cafa37d6-89f4-45cb-a0d9-835bc27407e9', p.id, 'borrador', 60000, 0,
         'Header creado a mano el 2026-09-21: incentivo jockey pagado con recibo manual N° ' || p.recibo
         || ' aunque su monta (' || p.montas || ') no se corrió (R9 suspendida tras la 5ª carrera).'
         || ' Criterio de Fede 21/09: el incentivo corresponde haya corrido o no. El motor no genera esta línea sin resultado oficial.'
    FROM (VALUES
            ('421a3eed-404a-43e7-9491-2a008bcfca8a'::uuid, '0486', 'Carrera 8 — EL GRAN HECTOR'),                        -- GONZALEZ, EDUARDO CECILIO
            ('9ba2e954-fb72-41ac-bc28-b26e5348f28f'::uuid, '0487', 'Carrera 7 — ASTUTO NOTES; Carrera 8 — INDIO VALIDO')  -- CONTRERAS, JUAN CRUZ
         ) AS p(id, recibo, montas)
   WHERE NOT EXISTS (SELECT 1 FROM liquidaciones x
                      WHERE x.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9' AND x.profesional_id=p.id)
  RETURNING id, profesional_id
),
i AS (
  INSERT INTO liquidacion_detalle
         (liquidacion_id, carrera_id, concepto, descripcion, monto_bruto, porcentaje_desc, monto_descuento, orden_display,
          estado_linea, concepto_tipo, posicion, inscripcion_id, fecha_liberacion, pagado_at, recibo_id,
          beneficiario_tipo, beneficiario_id, reunion_id)
  SELECT h.id, NULL, 'Incentivo jockey',
         'Incentivo jockey por actuación en la reunión: $60.000,00'
         || ' [REGULARIZACION 2026-09-20: línea creada a mano — pagado con recibo manual N° '
         || CASE h.profesional_id WHEN '421a3eed-404a-43e7-9491-2a008bcfca8a' THEN '0486' ELSE '0487' END
         || ' durante R9 (reunión suspendida tras la 5ª carrera); su monta no se corrió y el motor no la genera;'
         || ' criterio Fede 21/09: corresponde haya corrido o no; sin recibo del sistema; estado previo=(inexistente)]',
         60000, NULL, 0, 1,
         'pagado', 'incentivo_jockey', NULL, NULL, NULL, '2026-09-20 18:00:00-03:00'::timestamptz, NULL,
         'profesional', h.profesional_id, 'cafa37d6-89f4-45cb-a0d9-835bc27407e9'
    FROM h
  RETURNING id, liquidacion_id, beneficiario_id
)
SELECT (SELECT count(*) FROM u) AS actualizadas,      -- esperado 3
       (SELECT count(*) FROM h) AS headers_creados,   -- esperado 2
       (SELECT count(*) FROM i) AS lineas_creadas;    -- esperado 2

-- ============================================================================
-- ROLLBACK EXACTO (por la marca). No se corrió. Deja las 3 líneas como estaban y borra los 2
-- headers + 2 líneas creados. Esperado: 2 / 2 / 3.
-- ============================================================================
-- WITH
-- del_i AS (
--   DELETE FROM liquidacion_detalle
--    WHERE reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9'
--      AND descripcion LIKE '%[REGULARIZACION 2026-09-20: línea creada a mano%'
--      AND recibo_id IS NULL
--   RETURNING liquidacion_id
-- ),
-- del_h AS (
--   DELETE FROM liquidaciones l
--    WHERE l.id IN (SELECT liquidacion_id FROM del_i)
--      AND NOT EXISTS (SELECT 1 FROM liquidacion_detalle d WHERE d.liquidacion_id=l.id)
--   RETURNING id
-- ),
-- rev AS (
--   UPDATE liquidacion_detalle d
--      SET estado_linea = 'impago',
--          pagado_at    = NULL,
--          descripcion  = regexp_replace(d.descripcion, ' \[REGULARIZACION 2026-09-20: pagado con recibo manual[^\]]*\]$', '')
--    WHERE d.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9'
--      AND d.descripcion LIKE '%[REGULARIZACION 2026-09-20: pagado con recibo manual%'
--      AND d.recibo_id IS NULL
--   RETURNING d.id
-- )
-- SELECT (SELECT count(*) FROM del_i) AS lineas_borradas, (SELECT count(*) FROM del_h) AS headers_borrados, (SELECT count(*) FROM rev) AS revertidas;
