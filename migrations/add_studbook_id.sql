-- add_studbook_id.sql
-- Agrega columna studbook_id a spcs: el "Idcaballo" del Stud Book Argentino
-- (identificador externo para integrar con su API). DISTINTO de registro_stud_book.
-- Tipo text a propósito: es un id externo, no se hace aritmética, y la API lo manda
-- como string. Índice único parcial: dos SPCs no pueden reclamar el mismo id.
-- Aditivo y reversible. No toca plata, ni otras tablas, ni notas, ni registro_stud_book.
--
-- Rollback:
--   DROP INDEX IF EXISTS spcs_studbook_id_uniq;
--   ALTER TABLE spcs DROP COLUMN studbook_id;

ALTER TABLE spcs ADD COLUMN studbook_id text;

CREATE UNIQUE INDEX IF NOT EXISTS spcs_studbook_id_uniq
  ON spcs (studbook_id)
  WHERE studbook_id IS NOT NULL;
