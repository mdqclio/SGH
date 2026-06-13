-- Fix data — edad condición de carrera, reunión Dolores 2026-06-20
-- (Pedido Fede 2026-06-12 / aplicado 2026-06-13)
--
-- Contexto: las carreras de tope de edad abierto se habían cargado con
-- edad_maxima_anos = 10 (sentinel artificial) en lugar de NULL. El frontend ya
-- tiene la convención emax = NULL → tope abierto ("X y más a"); el 10 la rompía
-- y renderizaba "X - 10 a". Además T4/T5 estaban invertidos (emin=4, emax=3);
-- la planilla de Fede dice "3 y 4 años" en ambas hojas.
--
-- DML (no DDL). Supabase es prod compartido — esto ya corrió por MCP execute_sql.
-- Se versiona como fuente de verdad del cambio de datos.

WITH r AS (
  SELECT id FROM reuniones
  WHERE club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c' AND fecha = '2026-06-20'
)
UPDATE carreras c SET
  edad_maxima_anos = CASE WHEN c.numero_turno IN (8,9,10,11) THEN NULL
                          WHEN c.numero_turno IN (4,5)      THEN 4
                          ELSE c.edad_maxima_anos END,
  edad_minima_anos = CASE WHEN c.numero_turno IN (4,5)      THEN 3
                          ELSE c.edad_minima_anos END
FROM r
WHERE c.reunion_id = r.id AND c.numero_turno IN (4,5,8,9,10,11);

-- Resultado esperado:
--   T4, T5            → edad_minima=3, edad_maxima=4   ("3 - 4 a")
--   T8, T9, T10, T11  → edad_maxima=NULL               ("5 y más a" / "4 y más a")
