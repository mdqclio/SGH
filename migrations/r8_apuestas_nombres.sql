-- ============================================================
-- R8 (16/08/2026) — corrección de nombres de apuestas especiales
-- Rama: fix/r8-nombres-apuestas
--
-- DML, no DDL. Dos correcciones pedidas por secretaría sobre carrera_apuestas:
--   1. Carrera 2 del programa (turno 12) — X3: typo "Triplo Incial" → "Triplo Inicial".
--   2. Carrera 5 del programa (turno 10) — X4: nombre NULL → "Cuaterna Final", que es
--      como se llamaba en el programa de junio (R6 la tiene como "CUATERNA FINAL") y
--      como se anuncia.
--
-- Sin el nombre, el cuerpo del programa imprimía "Cuaterna $200 (Pozo asegurado
-- $75.000)" en vez de "Cuaterna Final", y la tapa mostraba sólo "CUATERNA".
--
-- Los WHERE llevan guard por el valor esperado: idempotente y no pisa nada si alguien
-- ya lo corrigió por pantalla. Ojo que guardar las apuestas de una carrera desde
-- programa.html borra y reinserta las filas, así que los id cambian — por eso el guard
-- va también por carrera y tipo, no sólo por id.
--
-- Reversible:
--   UPDATE carrera_apuestas SET nombre = 'Triplo Incial' WHERE id = '570eacf8-e793-441f-8988-48e1323929d2';
--   UPDATE carrera_apuestas SET nombre = NULL            WHERE id = '7cd029f7-08e3-429f-a1a1-29c8375487eb';
-- ============================================================

-- 1. Typo del Triplo Inicial — carrera 2 del programa (turno 12)
UPDATE carrera_apuestas ca
   SET nombre = 'Triplo Inicial'
  FROM carreras c
 WHERE c.id = ca.carrera_id
   AND c.reunion_id = '7b6e003e-22e2-4629-bf55-f18560b1260f'
   AND c.numero_carrera_programa = 2
   AND ca.tipo = 'X3'
   AND ca.nombre = 'Triplo Incial';

-- 2. Cuaterna Final sin nombre — carrera 5 del programa (turno 10)
UPDATE carrera_apuestas ca
   SET nombre = 'Cuaterna Final'
  FROM carreras c
 WHERE c.id = ca.carrera_id
   AND c.reunion_id = '7b6e003e-22e2-4629-bf55-f18560b1260f'
   AND c.numero_carrera_programa = 5
   AND ca.tipo = 'X4'
   AND ca.nombre IS NULL;
