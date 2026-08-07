-- ============================================================
-- caballerizas_r8_tanda_4.sql — R8, tanda 4 (llenado final)
-- ============================================================
-- ✅ APLICADO el 07/08/2026 por MCP apply_migration, migración `caballerizas_r8_tanda_4`
--    6 altas. caballerizas 286 -> 292 (Dolores 282 -> 288).
--    Verificado: las 6 filas con estado activo/activo true, DON BENICIO con
--    hipodromo_patente 'SR', 0 filas con club_id NULL, y el scan de duplicados
--    por nombre normalizado devuelve SÓLO los 2 preexistentes (ver §2).
--
-- Padrón de la tanda: 16 caballerizas de planilla + 1 agregado fuera de
-- planilla (EL DOMADOR, lo pasó Silvio junto con el SPC ACAPULCO).
-- Cruzadas contra las 286 de la base (217 con patente DOL, 69 con patente NULL).
--   6 son alta (§1).
--  10 de planilla ya existen (§2).
--   1 agregado ya existe (§3, EL DOMADOR).
--
-- Convención copiada de caballerizas.html:
--   club_id = Dolores, estado 'activo', activo true.
--   responsable / domicilio / telefono quedan NULL — los carga Yesi.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Altas (6)
--
--    Cinco van con hipodromo_patente NULL (son de Dolores, sin dato de
--    procedencia en la planilla). DON BENICIO va con 'SR' — ver la nota.
-- ------------------------------------------------------------
INSERT INTO caballerizas (club_id, nombre, hipodromo_patente, estado, activo)
SELECT '0649e9c5-9e87-4aad-842f-101458e6b33c'::uuid, v.nombre, v.patente, 'activo', true
FROM (VALUES
  ('LOS URONES',        NULL),
  ('MAR DEL TUYU',      NULL),
  ('EL VETERANO',       NULL),
  ('FEDERICO Y MIGUEL', NULL),
  ('EMI',               NULL),
  ('DON BENICIO',       'SR')
) AS v(nombre, patente)
WHERE NOT EXISTS (
  SELECT 1 FROM caballerizas c
  WHERE regexp_replace(upper(translate(c.nombre,'ÁÉÍÓÚÑÜáéíóúñü','AEIOUNUAEIOUNU')),'[^A-Z0-9]','','g')
      = regexp_replace(upper(translate(v.nombre,'ÁÉÍÓÚÑÜáéíóúñü','AEIOUNUAEIOUNU')),'[^A-Z0-9]','','g')
);

-- ⚠ DON BENICIO (SR) — el '(SR)' de la planilla es procedencia, así que va
--   nombre = 'DON BENICIO' + hipodromo_patente = 'SR', como pidió Leo.
--
--   Divergencia a dejar anotada: hoy caballerizas.hipodromo_patente sólo
--   tiene dos valores, 'DOL' (217) y NULL (69). 'SR' es el primer valor
--   distinto de DOL de la tabla. Las otras procedencias que hay en la base
--   están metidas DENTRO del nombre, no en la columna:
--     ERICK (TDL) · GARIN CITY (LP) · LA BETTY (TDL) · N.R.A (AZ)
--     TRES AMIGOS (AZ) · CAROSUEÑO (DOL) · EL GALPON LOBOS (DOL)
--     SANTA BARBARA (DOL)  — las 8 con hipodromo_patente NULL.
--
--   La forma que se aplica acá es la correcta y la UI ya la soporta:
--     caballerizas.html:324 y inscripciones.html:508 renderizan
--     `${nombre}${patente ? ' ('+patente+')' : ''}`
--   o sea que DON BENICIO + 'SR' se muestra como "DON BENICIO (SR)",
--   exactamente el texto de la planilla. Las 8 con la procedencia pegada
--   al nombre son las que están mal modeladas — quedan como deuda, no se
--   tocan en esta tanda (mover el sufijo a la columna es un cambio de
--   datos con riesgo, y el congelamiento es hoy al mediodía).
--
--   caballerizas.html:569 propone 'DOL' por defecto en un alta nueva, así
--   que un alta manual de Yesi para una caballeriza de afuera requiere
--   pisar ese default a mano. Es la razón probable de las 8 mal modeladas.

-- ------------------------------------------------------------
-- 2. Ya existen — 0 altas, no se tocan (10 de planilla)
--
--   pedida            | id        | patente | responsable
--   ------------------+-----------+---------+---------------------------------
--   PARAJE LA TABLADA | fc3631c3… | NULL    | NULL
--   LOS PERRITOS      | 28656f2e… | DOL     | PEREYRA ROBERTO CARLOS (propietario)
--   LOS AMIGOS        | dba1559e… | DOL     | AZURI SANTIAGO DAMIAN (propietario)
--   LA PICHI          | 3c72a213… | NULL    | NULL
--   MELINA A          | e9907e8b… | NULL    | NULL
--   EL DESTINO        | 93c99b75… | NULL    | NULL
--   EL LINYE Y RAMI   | d8f78de4… | DOL     | CUEVAS CESAR DANIEL (propietario)
--   SANTA BARBARA     | 1bb92f70… | NULL    | NULL
--   EL GALPON         | ed92deda… | DOL     | PALLET GUIDO (propietario)
--   STUD CHICO        | 099bd447… | DOL     | DI FRANCO GUSTAVO FABIAN (propietario)
--
--   ⚠ LOS AMIGOS convive con TRES AMIGOS (AZ). Dos caballerizas distintas.
--
--   ✅ EL GALPON — la duda que Leo planteó ("existe EL GALPON LOBOS de junio,
--      ¿mismo o distinto?") quedó resuelta por evidencia ANTES de la respuesta
--      de Yesi, y Yesi la confirmó después (07/08): son DISTINTAS.
--
--      Evidencia independiente:
--        EL GALPON            ed92deda… · DOL  · resp PALLET GUIDO (propietario)
--                             · aloja BELLO PRESAGIO y NO TIENE CONTRAS
--        EL GALPON LOBOS (DOL) aaa17d36… · NULL · sin responsable
--                             · aloja Es Mistres
--      Caballos disjuntos, y BELLO PRESAGIO es justamente uno de los SPCs
--      de esta misma tanda. Además PALLET GUIDO figura como cuidador en
--      esta planilla: el 'EL GALPON' que pide la planilla es esta fila.
--
--      ⚠ Ojo con la instrucción "descomentá/incluí el alta como caballeriza
--        propia": NO hay alta que descomentar y no se debe insertar. EL GALPON
--        ya es una fila propia, con patente, responsable y 2 caballos. Un
--        INSERT crearía un duplicado y repartiría las inscripciones entre las
--        dos filas. El pedido de Yesi ya está satisfecho por el estado actual.
--        (De todos modos el guard NOT EXISTS de §1 lo habría frenado.)
--
--   ⚠ DUPLICADO DETECTADO — EL LINYE Y RAMI. La base tiene DOS filas:
--        d8f78de4… 'EL LINYE Y RAMI' · DOL · resp CUEVAS CESAR DANIEL
--                  · aloja De Moda y LA DIVERTENTE
--        a692fdea… 'El linye y Rami' · DOL · sin responsable · 0 caballos
--      Mismo nombre, distinta caja de letras. La segunda está vacía.
--      No se toca en esta tanda (limpiar duplicados no es parte del
--      llenado y el congelamiento es hoy). Va a Yesi — ver el reporte.
--
--   ⚠ DUPLICADO DETECTADO — SANTA BARBARA. La base tiene DOS filas:
--        1bb92f70… 'SANTA BARBARA'       · NULL · sin responsable · aloja LUMIN
--        0dc1260f… 'SANTA BARBARA (DOL)' · DOL  · resp PEREZ GUILLERMO HERNESTO
--                                        · 0 caballos
--      Acá las señales apuntan a las dos filas a la vez: LUMIN es un SPC de
--      esta tanda (favorece la primera) y PEREZ GUILLERMO es cuidador de
--      esta planilla (favorece la segunda). Sea cual sea la buena, ninguna
--      requiere alta. Va a Yesi — ver el reporte.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- 3. Agregado fuera de planilla — EL DOMADOR. 0 altas, ya existe.
--
--      0ee13029-fc1c-4af0-a217-0d00e2a45c69 · 'EL DOMADOR'
--      · club Dolores · hipodromo_patente NULL · sin responsable
--      · aloja AFRICUM y CALAVERIANDO
--
--    Respuesta a la pregunta de la grafía: en la base está como
--    **EL DOMADOR**, la grafía de los resultados de junio. El
--    'EL DONMADOR (TDL)' del programa de mayo NO existe en caballerizas
--    (regex acento-insensible DOMADOR|DONMADOR|DOMAD → 2 filas: esta y
--    LOS DOMADORES, que es otra caballeriza, DOL, resp HERRERA ANIBAL
--    JUSTO). O sea: el typo de mayo nunca llegó a la base. No hay nada
--    que deduplicar ni que dar de alta.
-- ------------------------------------------------------------

-- Verificación dentro de la misma transacción:
--   revisar los conteos ANTES de hacer COMMIT.
SELECT count(*) AS total FROM caballerizas;                                     -- esperado 292
SELECT count(*) AS dolores FROM caballerizas
 WHERE club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c';                        -- esperado 288
SELECT nombre, hipodromo_patente, estado, activo, responsable FROM caballerizas
 WHERE nombre IN ('LOS URONES','MAR DEL TUYU','EL VETERANO','FEDERICO Y MIGUEL',
                  'EMI','DON BENICIO')
 ORDER BY nombre;                                                               -- esperado 6 filas
SELECT count(*) AS sin_club FROM caballerizas WHERE club_id IS NULL;            -- esperado 0
SELECT regexp_replace(upper(translate(nombre,'ÁÉÍÓÚÑÜáéíóúñü','AEIOUNUAEIOUNU')),'[^A-Z0-9]','','g') k,
       count(*), string_agg(nombre,' | ') FROM caballerizas GROUP BY 1 HAVING count(*) > 1;
-- resultado real (07/08), 2 filas, las dos PREEXISTENTES y ajenas a esta tanda:
--   ELLINYEYRAMI  2  'El linye y Rami | EL LINYE Y RAMI'
--   LANARCISA     2  'La Narcisa | LA NARCISA'
-- Ninguna de las 6 altas aparece acá. ✅
--
-- ⚠ LA NARCISA es un tercer duplicado por caja de letras que apareció en este
--   scan y que NO estaba en el radar de la tanda: mismo patrón que EL LINYE Y
--   RAMI (una fila mayúsculas, otra mixed case). No es de esta planilla y no
--   se toca. Va a Yesi junto con los otros dos — ver el reporte.
--
-- El par SANTA BARBARA / SANTA BARBARA (DOL) NO sale en este scan porque el
-- sufijo '(DOL)' cambia el nombre normalizado. El scan por nombre normalizado
-- no detecta los duplicados con procedencia pegada al nombre: para esos hay
-- que mirar a mano las 8 filas con paréntesis (ver §1).

COMMIT;
