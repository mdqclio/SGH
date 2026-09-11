-- ============================================================
-- carreras_ganadas_desde_hasta.sql — condición "ganadas" en columnas (pedido Stud Book, campos 4 y 5 de 5)
-- ============================================================
-- ✅ EJECUTADA el 11/09/2026 en dos migraciones por MCP: carreras_ganadas_desde_hasta_ddl (columnas + CHECK)
--    y carreras_ganadas_backfill (46 filas; vista previa 2.a revisada por Leo fila por fila; DO que aborta si
--    no son 46 o la distribución no es 25/3/13/1/3/1 + 3 NULL). Formatter + reunion-json v22 deployados el mismo día.
--
-- Hoy la cantidad de carreras ganadas que exige el turno ("perdedores", "ganadores de 1 o 2", "de 2 o +")
-- vive sólo en el texto libre condicion_handicap. El JSON del Stud Book manda ganadadesde/ganadahasta
-- hardcodeados en null (studbook_format.mjs:322-323). Esto agrega las dos columnas, las pre-carga desde el
-- texto para las 46 carreras que lo tienen (regex probado el 11/09: 46/46 parsean, 0 ambiguas) y deja las
-- 3 de la reunión 9999 (sandbox, sin texto) en NULL.
--
-- CONVENCIÓN (propuesta): ganadas_hasta = NULL significa "o más" (sin tope).
--   · Es la misma semántica que ya usa edad_maxima_anos (NULL = "y + edad") en 5 turnos de R9 y en T8/T10/T11
--     tras el acomodo de Yesi del 11/09. Una sola regla para las dos parejas de columnas.
--   · Es la más fácil de cambiar después: si Diego usa un tope (99, 999, -1), es un UPDATE de una línea
--     `SET ganadas_hasta = 99 WHERE ganadas_desde IS NOT NULL AND ganadas_hasta IS NULL` — o, mejor, se
--     traduce en el formatter sin tocar la base. Al revés (tope → NULL) también es una línea, pero un tope
--     inventado en la base contamina el dato; NULL no.
--   · Ambigüedad conocida: (desde NULL, hasta NULL) = "no cargado"; (desde N, hasta NULL) = "N o más".
--     Con desde NOT NULL no hay ambigüedad; el CHECK de abajo obliga a que hasta sin desde no exista.
--
-- Mapeo del texto (los 6 patrones que hay en la base, 39 textos distintos):
--   perdedor(es/as)                 → 0 – 0
--   ganador(a/es/as) de 1 carrera   → 1 – 1
--   … de 1 o 2                      → 1 – 2
--   … de 2 o 3                      → 2 – 3
--   … de 2 o +                      → 2 – NULL
--   … de 3 o mas                    → 3 – NULL
-- ============================================================

-- 1. DDL
ALTER TABLE carreras
  ADD COLUMN IF NOT EXISTS ganadas_desde integer,
  ADD COLUMN IF NOT EXISTS ganadas_hasta integer;

ALTER TABLE carreras
  ADD CONSTRAINT carreras_ganadas_rango CHECK (
    (ganadas_desde IS NULL AND ganadas_hasta IS NULL)                        -- no cargado
    OR (ganadas_desde >= 0 AND (ganadas_hasta IS NULL OR ganadas_hasta >= ganadas_desde))  -- N o más / N a M
  );

COMMENT ON COLUMN carreras.ganadas_desde IS 'Condición: mínimo de carreras ganadas exigido (0 = perdedores). NULL con hasta NULL = no cargado.';
COMMENT ON COLUMN carreras.ganadas_hasta IS 'Condición: máximo de carreras ganadas. NULL con desde NOT NULL = "o más" (sin tope), misma convención que edad_maxima_anos.';

-- 2. Pre-carga desde el texto (sólo filas con texto y columnas todavía NULL; idempotente)
-- 2.a Vista previa — lo que Yesi valida ANTES del UPDATE. 46 filas, ninguna 'NO_PARSEA'.
SELECT r.numero AS reunion, c.numero_turno AS t, c.condicion_handicap,
  CASE
    WHEN lower(c.condicion_handicap) ~ 'perdedor' THEN 0
    WHEN lower(c.condicion_handicap) ~ 'ganador(a|es|as)? de 1 carrera' THEN 1
    WHEN lower(c.condicion_handicap) ~ 'ganador(a|es|as)? de 1 o 2' THEN 1
    WHEN lower(c.condicion_handicap) ~ 'ganador(a|es|as)? de 2 o 3' THEN 2
    WHEN lower(c.condicion_handicap) ~ 'ganador(a|es|as)? de 2 o \+' THEN 2
    WHEN lower(c.condicion_handicap) ~ 'ganador(a|es|as)? de 3 o m' THEN 3
  END AS desde,
  CASE
    WHEN lower(c.condicion_handicap) ~ 'perdedor' THEN 0
    WHEN lower(c.condicion_handicap) ~ 'ganador(a|es|as)? de 1 carrera' THEN 1
    WHEN lower(c.condicion_handicap) ~ 'ganador(a|es|as)? de 1 o 2' THEN 2
    WHEN lower(c.condicion_handicap) ~ 'ganador(a|es|as)? de 2 o 3' THEN 3
    WHEN lower(c.condicion_handicap) ~ 'ganador(a|es|as)? de 2 o \+' THEN NULL
    WHEN lower(c.condicion_handicap) ~ 'ganador(a|es|as)? de 3 o m' THEN NULL
  END AS hasta,
  CASE WHEN lower(c.condicion_handicap) !~ 'perdedor|ganador(a|es|as)? de (1 carrera|1 o 2|2 o 3|2 o \+|3 o m)' THEN 'NO_PARSEA' END AS alerta
FROM carreras c JOIN reuniones r ON r.id = c.reunion_id
WHERE c.condicion_handicap IS NOT NULL
ORDER BY r.numero, c.numero_turno;

BEGIN;

-- 2.b El UPDATE (misma regla que la vista previa)
UPDATE carreras c SET
  ganadas_desde = CASE
    WHEN lower(c.condicion_handicap) ~ 'perdedor' THEN 0
    WHEN lower(c.condicion_handicap) ~ 'ganador(a|es|as)? de 1 carrera' THEN 1
    WHEN lower(c.condicion_handicap) ~ 'ganador(a|es|as)? de 1 o 2' THEN 1
    WHEN lower(c.condicion_handicap) ~ 'ganador(a|es|as)? de 2 o 3' THEN 2
    WHEN lower(c.condicion_handicap) ~ 'ganador(a|es|as)? de 2 o \+' THEN 2
    WHEN lower(c.condicion_handicap) ~ 'ganador(a|es|as)? de 3 o m' THEN 3
  END,
  ganadas_hasta = CASE
    WHEN lower(c.condicion_handicap) ~ 'perdedor' THEN 0
    WHEN lower(c.condicion_handicap) ~ 'ganador(a|es|as)? de 1 carrera' THEN 1
    WHEN lower(c.condicion_handicap) ~ 'ganador(a|es|as)? de 1 o 2' THEN 2
    WHEN lower(c.condicion_handicap) ~ 'ganador(a|es|as)? de 2 o 3' THEN 3
    ELSE NULL
  END
WHERE c.condicion_handicap IS NOT NULL
  AND c.ganadas_desde IS NULL AND c.ganadas_hasta IS NULL
  AND lower(c.condicion_handicap) ~ 'perdedor|ganador(a|es|as)? de (1 carrera|1 o 2|2 o 3|2 o \+|3 o m)';
-- 46 filas

-- Verificación
SELECT ganadas_desde, ganadas_hasta, count(*) FROM carreras GROUP BY 1,2 ORDER BY 1,2;
-- 0-0: 25 · 1-1: 3 · 1-2: 13 · 2-3: 1 · 2-NULL: 3 · 3-NULL: 1 · NULL-NULL: 3 (las de la 9999)
SELECT count(*) FROM carreras WHERE ganadas_desde IS NULL AND condicion_handicap IS NOT NULL;
-- 0

COMMIT;

-- ROLLBACK
-- ALTER TABLE carreras DROP CONSTRAINT carreras_ganadas_rango;
-- ALTER TABLE carreras DROP COLUMN ganadas_desde, DROP COLUMN ganadas_hasta;
-- (studbook_format.mjs vuelve a null hardcodeado; carta-llamados.html pierde los dos inputs)
