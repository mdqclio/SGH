-- PASO 4 — backfill de pedigree (padre/madre) para SPCs sin dato
-- 22 UPDATE aplicados sobre 26 candidatos.
--   21 aprobados por review (Leonardo, 2026-07-22) — bloque BEGIN/COMMIT de abajo.
--    1 aplicado aparte el 2026-07-28: GREAT ORPEN, tras confirmacion de Fede (ver
--      "BUCKET B" mas abajo). Esa sentencia NO forma parte de la transaccion del 22/07.
--   Los 4 restantes siguen sin aplicar: no tienen match en el Stud Book.
-- Fuente: www.studbook.org.ar via tools/sb_pedigree_26.py
-- Evidencia por caballo: data/pedigree_scrape_26.json + data/pedigree_paso4_scrape.md
-- Alcance: SOLO padrillo_nombre y madre_nombre, con una excepcion documentada
--   (GREAT ORPEN, que ademas corrige fecha_nacimiento y carga studbook_id).
-- Precondicion: las 26 filas tienen padrillo_nombre IS NULL AND madre_nombre IS NULL.
-- El WHERE lo reafirma: la sentencia es idempotente y no pisa dato existente.

BEGIN;

-- ==== BUCKET A (16) — match unico o desambiguado, fecha_nacimiento SB == DB ====
-- Amiguito Peligroso | SB 441819 | 2023-07-07 | match unico
UPDATE spcs SET padrillo_nombre = 'Amiguito Calificado', madre_nombre = 'Amiguita Bohemia'
  WHERE id = '019d9b9f-7b81-490e-b219-aff383fae166' AND padrillo_nombre IS NULL AND madre_nombre IS NULL;
-- Berry Nik | SB 447004 | 2023-10-23 | match unico
UPDATE spcs SET padrillo_nombre = 'Nicodemus (USA)', madre_nombre = 'Bafana'
  WHERE id = '3ce64b58-0d87-47fd-98e6-d9705fa118d4' AND padrillo_nombre IS NULL AND madre_nombre IS NULL;
-- Come on Baby | SB 420587 | 2020-08-21 | match unico
UPDATE spcs SET padrillo_nombre = 'Señor Candy (USA)', madre_nombre = 'Coming Away'
  WHERE id = '9944b791-3bb7-46d7-8590-1e0b8bca6bb4' AND padrillo_nombre IS NULL AND madre_nombre IS NULL;
-- Conesera | SB 444373 | 2023-09-20 | homonimos: desambiguado por fecha_nacimiento DB
UPDATE spcs SET padrillo_nombre = 'Emmanuel', madre_nombre = 'Milonga Burrera'
  WHERE id = '1f645327-a6da-449b-8a62-fdb577a8658e' AND padrillo_nombre IS NULL AND madre_nombre IS NULL;
-- Cursi Nik | SB 447006 | 2023-10-27 | match unico
UPDATE spcs SET padrillo_nombre = 'Nicodemus (USA)', madre_nombre = 'Cursi Gulch'
  WHERE id = '44abb392-8b73-4c68-9160-edfd8d58f27b' AND padrillo_nombre IS NULL AND madre_nombre IS NULL;
-- De Moda | SB 444272 | 2023-09-04 | homonimos: desambiguado por fecha_nacimiento DB
UPDATE spcs SET padrillo_nombre = 'Valid Stripes', madre_nombre = 'Vauquita'
  WHERE id = '70f275b6-0337-4617-99c2-fefb7447cb2e' AND padrillo_nombre IS NULL AND madre_nombre IS NULL;
-- Dourada | SB 441798 | 2023-07-01 | match unico
UPDATE spcs SET padrillo_nombre = 'Il Mercato', madre_nombre = 'Dixie Mask'
  WHERE id = '18a21c29-8b3e-4500-9abe-adaebf717d2c' AND padrillo_nombre IS NULL AND madre_nombre IS NULL;
-- Es Mistres | SB 447999 | 2023-10-05 | match unico
UPDATE spcs SET padrillo_nombre = 'Master Of Hounds (USA)', madre_nombre = 'Ando Mateando'
  WHERE id = '9fc5b39c-0579-4cd9-acbb-f023ab35d168' AND padrillo_nombre IS NULL AND madre_nombre IS NULL;
-- Fiestera Nik | SB 443351 | 2023-08-29 | match unico
UPDATE spcs SET padrillo_nombre = 'Nicodemus (USA)', madre_nombre = 'Fiestera Seattle'
  WHERE id = '2a35ea5b-8756-42f4-8da2-457370826280' AND padrillo_nombre IS NULL AND madre_nombre IS NULL;
-- Icy Tom | SB 408138 | 2018-09-02 | match unico
UPDATE spcs SET padrillo_nombre = 'Icy Glory', madre_nombre = 'Normandina'
  WHERE id = '8a6aea98-d121-4ad6-90d6-c08e8cfd8c75' AND padrillo_nombre IS NULL AND madre_nombre IS NULL;
-- La City Porteña | SB 441496 | 2023-07-01 | match unico
UPDATE spcs SET padrillo_nombre = 'Cityscape (GB)', madre_nombre = 'La Remota'
  WHERE id = 'fcc0bbdb-e3f7-4830-b038-beabe11faf7c' AND padrillo_nombre IS NULL AND madre_nombre IS NULL;
-- La Motocicleta | SB 442428 | 2023-08-22 | match unico
UPDATE spcs SET padrillo_nombre = 'Manipulator (USA)', madre_nombre = 'Ampi Nistel'
  WHERE id = '3539cab0-e2d4-4748-945d-67e36787a96d' AND padrillo_nombre IS NULL AND madre_nombre IS NULL;
-- Malenuchi Jack | SB 448214 | 2023-10-15 | match unico
UPDATE spcs SET padrillo_nombre = 'Emir Jack', madre_nombre = 'Quartermaster'
  WHERE id = '9c9c742c-86a1-4c7b-a060-6ab47900b451' AND padrillo_nombre IS NULL AND madre_nombre IS NULL;
-- Vito lo capo | SB 430797 | 2021-10-22 | match unico
UPDATE spcs SET padrillo_nombre = 'Cosmic Trigger', madre_nombre = 'Campirina'
  WHERE id = '53c1892a-68eb-4ce4-b198-a7985e4048b5' AND padrillo_nombre IS NULL AND madre_nombre IS NULL;
-- Wave Rimout | SB 397805 | 2017-08-08 | match unico
UPDATE spcs SET padrillo_nombre = 'Remote (GB)', madre_nombre = 'Holiday Wave'
  WHERE id = 'f277af1c-a4ac-4a98-87d7-b41871718c8d' AND padrillo_nombre IS NULL AND madre_nombre IS NULL;
-- Wave Rimout | SB 397805 | 2017-08-08 | match unico
UPDATE spcs SET padrillo_nombre = 'Remote (GB)', madre_nombre = 'Holiday Wave'
  WHERE id = '5ebc5e48-2caf-4c44-be6a-ad75f2716850' AND padrillo_nombre IS NULL AND madre_nombre IS NULL;

-- ==== BUCKET B (5) — nombre unico en SB, fecha_nacimiento de la DB discrepa ====
-- Se aplica el pedigree igual: el nombre es unico en el Stud Book, la fecha mal
-- cargada es de la carga manual. NO se corrige fecha_nacimiento aca.
-- Folke Dancer | SB 422244 | SB 2020-07-16 vs DB 2020-07-06
UPDATE spcs SET padrillo_nombre = 'Forge (GB)', madre_nombre = 'Follow'
  WHERE id = '1c89581b-b0ec-4588-9e28-596312ce6a7b' AND padrillo_nombre IS NULL AND madre_nombre IS NULL;
-- GREAT ORPEN | SB 447875 | SB 2023-12-12 vs DB 2023-10-05 | match unico, 1 candidato exacto
-- Excluido por review el 2026-07-22 (68 dias de discrepancia + inscripcion viva).
-- RESUELTO 2026-07-28: Fede confirmo que la fecha correcta es la del Stud Book
-- (2023-12-12). Eso valida el match completo del scrape, asi que ademas del pedigree
-- se corrige fecha_nacimiento y se carga studbook_id.
--
-- OJO: esta sentencia se ejecuto SUELTA el 2026-07-28, fuera del BEGIN/COMMIT de arriba
-- (que ya estaba aplicado desde el 22/07). Se deja aca por trazabilidad, no para
-- re-ejecutar el archivo entero.
--
-- Verificado antes de aplicar:
--   - padrillo_nombre y madre_nombre seguian NULL (el guard del WHERE habria salteado si no)
--   - studbook_id '447875' libre: spcs_studbook_id_uniq es un UNIQUE parcial
--     (WHERE studbook_id IS NOT NULL), 0 colisiones
--   - studbook_id es TEXT, no integer: el literal va entre comillas
-- Verificado despues:
--   - UPDATE 1
--   - inscripcion e7d7e085 (reunion 2026-06-20, edad_min=max=2) sigue valida:
--     edad 2 con ambas fechas, validar_inscripcion() -> true.
--     AGE() es aniversario civil: las dos fechas solo difieren entre el 5/10 y el 12/12.
UPDATE spcs
  SET fecha_nacimiento = DATE '2023-12-12',
      studbook_id      = '447875',
      padrillo_nombre  = 'Orpen Farrero',
      madre_nombre     = 'Great Perfection'
  WHERE id = '6df0d170-4d32-43d3-82cb-b0c540963bc8' AND padrillo_nombre IS NULL AND madre_nombre IS NULL;
-- MONADESEDA | SB 445820 | SB 2023-10-02 vs DB 2023-10-01
UPDATE spcs SET padrillo_nombre = 'Forge (GB)', madre_nombre = 'Shake (USA)'
  WHERE id = 'a91658ed-b79c-4abe-bd08-3a672bd923e4' AND padrillo_nombre IS NULL AND madre_nombre IS NULL;
-- MOSQUITA GARDEN | SB 444643 | SB 2023-09-10 vs DB 2023-10-10
UPDATE spcs SET padrillo_nombre = 'The Garden', madre_nombre = 'Veneciana Storm'
  WHERE id = 'c1af88b9-6fbd-4883-a025-03f44f1fdfab' AND padrillo_nombre IS NULL AND madre_nombre IS NULL;
-- MR. PATO | SB 442770 | SB 2023-08-28 vs DB 2023-08-17
UPDATE spcs SET padrillo_nombre = 'Gouverneur Morris (USA)', madre_nombre = 'Doña Nota'
  WHERE id = 'f8a81c1b-867a-4341-8757-a89fc9347a16' AND padrillo_nombre IS NULL AND madre_nombre IS NULL;
-- PUNAB | SB 446115 | SB 2023-10-13 vs DB 2023-10-04
UPDATE spcs SET padrillo_nombre = 'Peten Itza', madre_nombre = 'Honey Moon'
  WHERE id = 'c4ddc3d2-2687-4dd9-9d24-469c62e64f7c' AND padrillo_nombre IS NULL AND madre_nombre IS NULL;

COMMIT;

-- ==== VERIFICACION ====
-- select count(*) filter (where padrillo_nombre is null) from spcs;  -- esperado: 4
-- (los 4 sin match en SB. GREAT ORPEN salio de esta lista el 2026-07-28.)
-- Verificado 2026-07-28: devuelve 4. count(studbook_id) paso de 26 a 27.

-- ==== ROLLBACK ====
-- Las 22 filas tenian padrillo_nombre y madre_nombre en NULL antes del backfill,
-- asi que revertir es volverlas a NULL. No hay dato previo que restaurar.
-- La lista de abajo son las 21 del 22/07. GREAT ORPEN va aparte porque ademas
-- cambio fecha_nacimiento y studbook_id, y esos si tienen dato previo:
--   UPDATE spcs SET padrillo_nombre = NULL, madre_nombre = NULL, studbook_id = NULL,
--                   fecha_nacimiento = DATE '2023-10-05'
--     WHERE id = '6df0d170-4d32-43d3-82cb-b0c540963bc8';
-- BEGIN;
-- UPDATE spcs SET padrillo_nombre = NULL, madre_nombre = NULL WHERE id IN (
--   '019d9b9f-7b81-490e-b219-aff383fae166',
--   '3ce64b58-0d87-47fd-98e6-d9705fa118d4',
--   '9944b791-3bb7-46d7-8590-1e0b8bca6bb4',
--   '1f645327-a6da-449b-8a62-fdb577a8658e',
--   '44abb392-8b73-4c68-9160-edfd8d58f27b',
--   '70f275b6-0337-4617-99c2-fefb7447cb2e',
--   '18a21c29-8b3e-4500-9abe-adaebf717d2c',
--   '9fc5b39c-0579-4cd9-acbb-f023ab35d168',
--   '2a35ea5b-8756-42f4-8da2-457370826280',
--   '8a6aea98-d121-4ad6-90d6-c08e8cfd8c75',
--   'fcc0bbdb-e3f7-4830-b038-beabe11faf7c',
--   '3539cab0-e2d4-4748-945d-67e36787a96d',
--   '9c9c742c-86a1-4c7b-a060-6ab47900b451',
--   '53c1892a-68eb-4ce4-b198-a7985e4048b5',
--   'f277af1c-a4ac-4a98-87d7-b41871718c8d',
--   '5ebc5e48-2caf-4c44-be6a-ad75f2716850',
--   '1c89581b-b0ec-4588-9e28-596312ce6a7b',
--   'a91658ed-b79c-4abe-bd08-3a672bd923e4',
--   'c1af88b9-6fbd-4883-a025-03f44f1fdfab',
--   'f8a81c1b-867a-4341-8757-a89fc9347a16',
--   'c4ddc3d2-2687-4dd9-9d24-469c62e64f7c'
-- );
-- COMMIT;
