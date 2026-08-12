-- ============================================================
-- r8_tanda_5_punto5_consolidado.sql
-- ============================================================
-- ✅ APLICADO el 10/08/2026 por MCP apply_migration,
--    migración `r8_tanda_5_punto5_consolidado`.
--    Verificado 6/6: spcs 179 -> 183 · 4 altas SPC · 2 altas caballeriza ·
--    Wave Rimout (5ebc5e48) -> LOS MELOS · BETTY SANTI -> LP ·
--    0 studbook_id duplicados.
--
-- Consolidado de los OK de Leo del 10/08 (puntos 1 y 2 del pedido de Yesi).
-- Reemplaza a spcs_r8_tanda_5_punto5.sql y caballerizas_r8_tanda_5_punto5.sql,
-- que quedaron como la propuesta previa al gate.
--
-- 1. Altas SPC (4). Stud Book, match exacto 4/4, 0 ambiguos.
--    Evidencia: data/spcs_r8_tanda_5_scrape.json
-- 2. Altas caballeriza (2): LA CALIFORNIA y 5 ESTRELLAS.
--    5 ESTRELLAS es el stud de CURIOSA GO ON, GRAND FITO y LA DE ETIQUETA.
--    Se había escapado del cruce porque arranca con número.
-- 3. Wave Rimout, opción A: la fila 5ebc5e48 (la de la inscripción viva de
--    R8, turno 10) toma LOS MELOS. El duplicado sigue vivo a propósito —
--    la opción B (unificar filas) queda post-16 con Yesi.
-- 4. BETTY SANTI: hipodromo_patente DOL -> LP (carga equivocada de Yesi).
--
-- ⚠ caballerizas NO tiene columna updated_at (a diferencia de spcs).
--   El primer intento falló por eso; el UPDATE final no la toca.
-- ============================================================

BEGIN;

INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color, padrillo_nombre, madre_nombre, pais_origen, studbook_id, estado)
SELECT v.n, v.f::date, v.s::sexo_spc, v.c, v.p, v.m, 'Argentina', v.sb, 'activo'::estado_spc
FROM (VALUES
 ('CURIOSA GO ON','2022-07-16','hembra','Alazan','Curioso Johan','Mucura Cat','434886'),
 ('EL JOROBA','2021-08-27','macho','Zaino','In The Dark','Juany','429575'),
 ('GRAND FITO','2021-10-06','macho','Zaino','Telematico','Lady Glamour','431958'),
 ('LA DE ETIQUETA','2021-07-16','hembra','Zaino','Aspire (USA)','Etiquetag','427052')
) AS v(n,f,s,c,p,m,sb)
WHERE NOT EXISTS (SELECT 1 FROM spcs x WHERE x.studbook_id = v.sb);

INSERT INTO caballerizas (club_id, nombre, hipodromo_patente, estado, activo)
SELECT '0649e9c5-9e87-4aad-842f-101458e6b33c'::uuid, v.nombre, v.patente, 'activo', true
FROM (VALUES ('LA CALIFORNIA','DOL'), ('5 ESTRELLAS','DOL')) AS v(nombre, patente)
WHERE NOT EXISTS (
  SELECT 1 FROM caballerizas c
  WHERE regexp_replace(upper(translate(c.nombre,'ÁÉÍÓÚÑÜáéíóúñü','AEIOUNUAEIOUNU')),'[^A-Z0-9]','','g')
      = regexp_replace(upper(translate(v.nombre,'ÁÉÍÓÚÑÜáéíóúñü','AEIOUNUAEIOUNU')),'[^A-Z0-9]','','g')
);

UPDATE spcs SET caballeriza_id = 'a07b8f01-0be1-4e02-a63f-55fecfa346dd'::uuid, updated_at = now()
WHERE id = '5ebc5e48-2caf-4c44-be6a-ad75f2716850'::uuid AND caballeriza_id IS NULL;

UPDATE caballerizas SET hipodromo_patente = 'LP'
WHERE id = '3201de5c-9e29-4053-86d4-fb69a62f019d'::uuid AND hipodromo_patente = 'DOL';

COMMIT;

-- Verificación (corrida y OK): 183 / 4 / 2 / LOS MELOS / LP / 0.
