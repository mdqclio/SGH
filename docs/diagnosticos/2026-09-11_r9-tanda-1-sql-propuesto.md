# R9 tanda 1 — SQL propuesto de las 18 altas + Conesera (NADA ejecutado)

**Fecha:** 2026-09-11 · **Branch de trabajo:** `fix/spcs-r9-tanda-1` @ `221fb12` (desde `main` `842aa43`), **pusheada** · **Informes previos:** `2026-09-11_r9-scrape-studbook-resultado.md`
**Estado:** archivos escritos y pusheados. **DB sin tocar**, `spcs` = 181. Se corrió el bloque §0 de chequeos (sólo `SELECT`) contra prod: 181 / 0 / 0 / 0.

Archivos en la rama:

| archivo | qué es |
|---|---|
| `migrations/spcs_r9_tanda_1.sql` | 18 INSERTs + chequeos + verificación + rollback |
| `migrations/spcs_conesera_sexo.sql` | UPDATE de Conesera, **aparte** |
| `data/spcs_r9_tanda_1_scrape.json` | evidencia cruda del scraper (24 nombres) |
| `data/spcs_r9_tanda_1_nombres.txt` | entrada del scraper |

## 0. Guards

| guard | esperado | real |
|---|---|---|
| `pwd` | `/home/clio/dev/SGH` | ✅ |
| `spcs` | 181 | ✅ 181 (§3, chequeo 0.a) |
| ref | `unlhcuanfrtpatoipwve` | ✅ |

---

## 1. Qué hace el SQL

- **18 INSERTs** en `spcs`, uno por caballo del grupo A. Cada uno `WHERE NOT EXISTS (… studbook_id = …)` → idempotente, misma forma que `spcs_r8_tanda_5_punto5.sql`.
- **Criterio acordado**: `registro_stud_book` **NULL**; `studbook_id` en su columna; `notas` = `SB <id> · <url_perfil> · alta R9 tanda 1 11/09/2026` (+ `Planilla R9: <variante>` donde difiere).
- **`club_id` NULL** (SPC global), `caballeriza_id` / `entrenador_id` / `jockey_habitual_id` NULL (los asigna Yesi al inscribir). `pais_origen = 'Argentina'` (bandera `/10.png` en los 18). `estado = 'activo'`.
- **Grafía**: la del Stud Book. Los 2 typos van con nota:
  - `MARIA CATULENGA` — notas: `… · Planilla R9: MARIA CATULANGA.`
  - `NIÑO OCEANICO` — notas: `… · Planilla R9: NIÑO OSEANICO.`
  El buscador de `spcs.html` / portal busca por `nombre`; si Yesi tipea la variante no la va a encontrar por nombre — la nota está para que la vea al abrir la ficha o al grepear. Si querés que el autocompletado también matchee la variante, es otro cambio (no lo hago sin pedir).
- `QUERELLANTE` — notas: `… · Homónimo en el Stud Book (sb 49722, 1947) descartado por edad.`
- Datos generados **desde el JSON de evidencia con script**, no transcriptos a mano. Los 3 resueltos por sondeo (QUERELLANTE, MARIA CATULENGA, NIÑO OCEANICO) tomaron color/tomo/folio del hit crudo del autocomplete (el candidato ambiguo del scraper no trae `pelo`).
- **Conteo esperado**: 181 → **199**. Verificación dentro de la tx antes del `COMMIT`.

### Los 18

| # | nombre (SB) | sb | nac. | sexo | color | padre × madre | turno |
|---|---|---|---|---|---|---|---|
| 1 | ETERNA DOCTORA | 442125 | 2023-07-29 | hembra | Zaino Doradillo | Doctor Embrujo × Eterna Diablita | T1 |
| 2 | DESERT OF DUBAI | 446340 | 2023-10-09 | macho | Zaino | Dubai Thunder (GB) × Grela (USA) | T1 |
| 3 | HERMANOSDEMIPATRIA | 443096 | 2023-09-07 | macho | Zaino | Grand Reward (USA) × Cat The Gold | T1 |
| 4 | ALHENA | 434871 | 2022-07-16 | hembra | Zaino | Puerto Escondido × Almedha | T2 |
| 5 | OLA DOCTOR | 438421 | 2022-10-24 | macho | Zaino | Lead To Win × Sweet Johar (USA) | T2, T3 |
| 6 | DEL CAMPEON | 438805 | 2022-10-17 | macho | Zaino | Golden Cigars × Sixties Spirit | T2 |
| 7 | TORO MAÑERO | 440758 | 2022-10-21 | macho | Zaino | Hit It A Bomb (USA) × Sarawak Top | T3 |
| 8 | BACON | 428803 | 2021-07-17 | macho | Zaino | Winning Prize × Biosfera | T4 |
| 9 | NISTEL WIN | 430420 | 2021-10-08 | macho | Zaino Colorado | Lead To Win × Barbie Nistel | T4 |
| 10 | HALLOTOP | 441122 | 2021-10-08 | macho | Zaino | Maipo Top × Halloweeninseattle | T6 |
| 11 | EL RISKO | 421108 | 2020-09-10 | macho | Zaino | Security Risk (USA) × Spanakopitas | T7 |
| 12 | ATOMIZADOR | 422969 | 2020-10-26 | macho | Zaino Doradillo | Daniel Boone (BRZ) × Atomic Star | T7 |
| 13 | THE BEAST PARTY | 438032 | 2022-07-30 | macho | Alazan | In The Dark × Rimout Party | T9 |
| 14 | ABARAJALA | 433798 | 2020-10-25 | **hembra** | Zaino | Storm Question × Redondiya | T10 |
| 15 | GOIADORA | 428590 | 2021-09-23 | hembra | Zaino | Goias Key × Degolladora | T11 |
| 16 | QUERELLANTE | 416936 | 2019-10-11 | macho | Zaino | Daniel Boone (BRZ) × Que Felicidad | T9 |
| 17 | MARIA CATULENGA *(planilla: CATULANGA)* | 440678 | 2022-10-15 | hembra | Zaino | Fiskardo × Ever Propulsora | T3 |
| 18 | NIÑO OCEANICO *(planilla: OSEANICO)* | 428019 | 2021-09-01 | macho | Zaino | Seahenge (USA) × Niña Divina | T4 |

**Fuera del SQL** (vuelven a Yesi, sin cambio desde el informe del scrape): BELLA DOÑA, BIEN COQUETA, EL MAS SABIO, INDIA MARO.

---

## 2. CONESERA — ¿es el mismo con el sexo mal cargado? Sí.

| | DB `1f645327-…` | Stud Book sb 444373 |
|---|---|---|
| nombre | `Conesera` (mixed case, carga manual 09/05) | CONESERA |
| fecha nacimiento | **2023-09-20** | **20/09/2023** |
| padre | **Emmanuel** | **Emmanuel** |
| madre | **Milonga Burrera** | **Milonga Burrera** |
| sexo | `macho` | **Hembra** `(2023 H SP)` |
| color | NULL | Alazan |
| studbook_id | NULL | 444373 · tomo 1255 folio 510 · ADN 1, pasaporte 1, revisado 1 |

Razonamiento: una yegua pare **una** cría por temporada. Misma madre + misma fecha de nacimiento exacta + mismo padre = el mismo animal, no hay otra lectura. El otro CONESERA del Stud Book (sb 183273) es de 1993, de otros padres — descartado. El único campo en desacuerdo es el sexo, y la fila de la DB se cargó a mano sin `studbook_id`: **sexo mal tipeado en el alta manual.** El Stud Book tiene ADN y pasaporte verificados; es la fuente.

Sondeo crudo que lo respalda:

```
=== CONESERA — 2 hits
  444373	CONESERA	20/09/2023	Hembra	Alazan	Emmanuel / Milonga Burrera	raza=4	icon=/img/banderas/10.png
  183273	CONESERA	16/11/1993	Hembra	Alazan	El Azar / Che Tentacion	raza=4	icon=/img/banderas/10.png
```

Efecto práctico hoy: está inscripta en **R9 T1** ("Descargo 2 kilos a las hembras") — como macho no le corresponde el descargo. `condicion_sexo` de T1 es `ambos`, el gate no la frena en ningún caso.

**El UPDATE va aparte** (`migrations/spcs_conesera_sexo.sql`): `sexo → hembra`, `nombre → CONESERA`, `studbook_id → 444373`, `color → Alazan` (sólo si NULL), nota con SB + URL + "sexo corregido". `registro_stud_book` sigue NULL. `WHERE` defensivo (`sexo='macho' AND fecha='2023-09-20' AND studbook_id IS NULL`) → 1 fila o nada. No cambia el count. Propongo que Yesi confirme (ella la cargó) antes de correrlo — pero el dato es inequívoco.

---

## 3. Chequeo de duplicados §0 — corrido hoy, sólo lectura

Los cuatro `SELECT` del bloque §0 del SQL, compactados en una sola consulta para el MCP:

```sql
select 'a' chk, count(*)::text as r from spcs
union all select 'b', coalesce(string_agg(nombre||' '||studbook_id, '; '),'0 filas') from spcs where studbook_id IN ('442125', '446340', '443096', '434871', '438421', '438805', '440758', '428803', '430420', '441122', '421108', '422969', '438032', '433798', '428590', '416936', '440678', '428019')
union all select 'c', coalesce(string_agg(nombre, '; '),'0 filas') from spcs where upper(regexp_replace(translate(nombre, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'), '[^A-Za-z0-9]', '', 'g')) IN ('ETERNADOCTORA', 'DESERTOFDUBAI', 'HERMANOSDEMIPATRIA', 'ALHENA', 'OLADOCTOR', 'DELCAMPEON', 'TOROMANERO', 'BACON', 'NISTELWIN', 'HALLOTOP', 'ELRISKO', 'ATOMIZADOR', 'THEBEASTPARTY', 'ABARAJALA', 'GOIADORA', 'QUERELLANTE', 'MARIACATULENGA', 'NINOOCEANICO')
union all select 'd', coalesce(string_agg(s.nombre, '; '),'0 filas') from spcs s join (values ('2023-07-29'::date,'Doctor Embrujo','Eterna Diablita'),('2023-10-09','Dubai Thunder (GB)','Grela (USA)'),('2023-09-07','Grand Reward (USA)','Cat The Gold'),('2022-07-16','Puerto Escondido','Almedha'),('2022-10-24','Lead To Win','Sweet Johar (USA)'),('2022-10-17','Golden Cigars','Sixties Spirit'),('2022-10-21','Hit It A Bomb (USA)','Sarawak Top'),('2021-07-17','Winning Prize','Biosfera'),('2021-10-08','Lead To Win','Barbie Nistel'),('2021-10-08','Maipo Top','Halloweeninseattle'),('2020-09-10','Security Risk (USA)','Spanakopitas'),('2020-10-26','Daniel Boone (BRZ)','Atomic Star'),('2022-07-30','In The Dark','Rimout Party'),('2020-10-25','Storm Question','Redondiya'),('2021-09-23','Goias Key','Degolladora'),('2019-10-11','Daniel Boone (BRZ)','Que Felicidad'),('2022-10-15','Fiskardo','Ever Propulsora'),('2021-09-01','Seahenge (USA)','Niña Divina')) v(fn,padre,madre) on s.fecha_nacimiento=v.fn and upper(s.padrillo_nombre)=upper(v.padre) and upper(s.madre_nombre)=upper(v.madre)
union all select 'translate_sanity', upper(regexp_replace(translate('NIÑO OCEANICO · TORO MAÑERO', 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'), '[^A-Za-z0-9]', '', 'g'))
```

```json
[{"chk":"a","r":"181"},{"chk":"b","r":"0 filas"},{"chk":"c","r":"0 filas"},{"chk":"d","r":"0 filas"},{"chk":"translate_sanity","r":"NINOOCEANICOTOROMANERO"}]
```

| chequeo | qué mira | resultado |
|---|---|---|
| 0.a | baseline | **181** ✅ |
| 0.b | los 18 `studbook_id` ya en `spcs` | **0** ✅ |
| 0.c | nombre normalizado (sin acento/espacio) ya en `spcs` — `translate` manual porque `unaccent()` no está | **0** ✅ (y la normalización funciona: `NIÑO`→`NINO`, `MAÑERO`→`MANERO`) |
| 0.d | fecha + padre + madre ya en `spcs` | **0** ✅ |

Cero duplicados. El bloque queda dentro del `.sql` para repetirlo justo antes del `BEGIN` el día que se ejecute.

---

## 4. `migrations/spcs_r9_tanda_1.sql` — contenido completo

```sql
-- ============================================================
-- spcs_r9_tanda_1.sql — altas de SPCs de la planilla de anotaciones de R9 (20/09/2026)
-- ============================================================
-- ⏳ PROPUESTA — NO EJECUTADA. Espera gate de Leo.
--
-- Pedido de Yesi el 11/09/2026: planilla de anotaciones de R9, 11 turnos,
-- 75 líneas, 66 caballos distintos. 44 ya estaban (42 exactos + Conesera +
-- LOGUACIOUS por variante), 22 faltaban. De esos 22:
--   18 altas  -> este archivo (grupo A del informe del scrape)
--    3 dudosos -> BELLA DOÑA (2017, 9 años en T1), BIEN COQUETA (2021, 5 en T2),
--                EL MAS SABIO (2021, 5 en T5 3-4). NO van. Vuelven a Yesi.
--    1 sin ficha -> INDIA MARO. No existe en el Stud Book. Vuelve a Yesi.
--
-- Origen: www.studbook.org.ar, /ejemplares/autocomplete?tipo=1&muerto=1&term=
-- Match EXACTO por nombre normalizado; homónimos desambiguados por la edad
-- del turno; 2 typos de planilla resueltos con sondeo por prefijo:
--   MARIA CATULANGA -> MARIA CATULENGA (sb 440678)
--   NIÑO OSEANICO   -> NIÑO OCEANICO   (sb 428019)
-- Ambos van con la grafía del Stud Book y la de la planilla en notas.
-- Evidencia: data/spcs_r9_tanda_1_scrape.json (+ sondeos en el informe)
-- Informes: docs/diagnosticos/2026-09-11_r9-cruce-spcs-planilla.md,
--           …_addendum.md, 2026-09-11_r9-scrape-studbook-resultado.md (reports)
-- Script:    tools/studbook_scrape_tanda.mjs
-- Snapshot spcs usado: 181 filas.
--
-- Criterio acordado (Leo, 11/09):
--   registro_stud_book -> NULL (no se estrena la columna).
--   studbook_id        -> columna (índice único parcial spcs_studbook_id_uniq).
--   notas              -> 'SB <id> · <url_perfil> · alta R9 tanda 1 11/09/2026'
--                         + variante de planilla cuando difiere.
--   club_id NULL (SPCs globales, GOTCHA #13). caballeriza_id / entrenador_id /
--   jockey_habitual_id NULL: los asigna Yesi al inscribir.
--
-- Idempotente: cada INSERT se saltea si el studbook_id ya está.
--
-- CONESERA (sexo macho en DB, Hembra en el Stud Book) NO va acá: es UPDATE,
-- archivo aparte (migrations/spcs_conesera_sexo.sql).
-- ============================================================

-- ------------------------------------------------------------
-- 0. Chequeo de duplicados ANTES de insertar (correr solo, fuera de la tx)
--    Los cuatro tienen que dar 0 filas. Si alguno da algo, NO seguir.
-- ------------------------------------------------------------

-- 0.a  Guard de proyecto/baseline: tiene que dar 181.
SELECT count(*) AS spcs_total_antes FROM spcs;

-- 0.b  Por studbook_id (el UNIQUE lo frenaría igual, pero mejor verlo antes): 0 filas.
SELECT nombre, studbook_id FROM spcs
WHERE studbook_id IN ('442125', '446340', '443096', '434871', '438421', '438805', '440758', '428803', '430420', '441122', '421108', '422969', '438032', '433798', '428590', '416936', '440678', '428019');

-- 0.c  Por nombre normalizado (sin acentos, sin espacios, mayúsculas): 0 filas.
--      unaccent() no está instalada -> translate manual.
SELECT nombre, studbook_id, fecha_nacimiento FROM spcs
WHERE upper(regexp_replace(translate(nombre, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'), '[^A-Za-z0-9]', '', 'g'))
   IN ('ETERNADOCTORA', 'DESERTOFDUBAI', 'HERMANOSDEMIPATRIA', 'ALHENA', 'OLADOCTOR', 'DELCAMPEON', 'TOROMANERO', 'BACON', 'NISTELWIN', 'HALLOTOP', 'ELRISKO', 'ATOMIZADOR', 'THEBEASTPARTY', 'ABARAJALA', 'GOIADORA', 'QUERELLANTE', 'MARIACATULENGA', 'NINOOCEANICO');

-- 0.d  Por fecha de nacimiento + padre + madre (atrapa al mismo animal cargado
--      a mano con otro nombre y sin studbook_id): 0 filas.
SELECT s.nombre, s.studbook_id, s.fecha_nacimiento, s.padrillo_nombre, s.madre_nombre
FROM spcs s
JOIN (VALUES
  ('2023-07-29'::date, 'Doctor Embrujo', 'Eterna Diablita'),
  ('2023-10-09'::date, 'Dubai Thunder (GB)', 'Grela (USA)'),
  ('2023-09-07'::date, 'Grand Reward (USA)', 'Cat The Gold'),
  ('2022-07-16'::date, 'Puerto Escondido', 'Almedha'),
  ('2022-10-24'::date, 'Lead To Win', 'Sweet Johar (USA)'),
  ('2022-10-17'::date, 'Golden Cigars', 'Sixties Spirit'),
  ('2022-10-21'::date, 'Hit It A Bomb (USA)', 'Sarawak Top'),
  ('2021-07-17'::date, 'Winning Prize', 'Biosfera'),
  ('2021-10-08'::date, 'Lead To Win', 'Barbie Nistel'),
  ('2021-10-08'::date, 'Maipo Top', 'Halloweeninseattle'),
  ('2020-09-10'::date, 'Security Risk (USA)', 'Spanakopitas'),
  ('2020-10-26'::date, 'Daniel Boone (BRZ)', 'Atomic Star'),
  ('2022-07-30'::date, 'In The Dark', 'Rimout Party'),
  ('2020-10-25'::date, 'Storm Question', 'Redondiya'),
  ('2021-09-23'::date, 'Goias Key', 'Degolladora'),
  ('2019-10-11'::date, 'Daniel Boone (BRZ)', 'Que Felicidad'),
  ('2022-10-15'::date, 'Fiskardo', 'Ever Propulsora'),
  ('2021-09-01'::date, 'Seahenge (USA)', 'Niña Divina')
) v(fn, padre, madre)
  ON s.fecha_nacimiento = v.fn
 AND upper(s.padrillo_nombre) = upper(v.padre)
 AND upper(s.madre_nombre)    = upper(v.madre);

-- (0.b/0.c/0.d ya corrieron el 11/09 contra las 181 filas: 0 / 0 / 0.
--  Ver 2026-09-11_r9-scrape-studbook-resultado.md §5. Repetir igual antes del BEGIN.)

BEGIN;

-- ------------------------------------------------------------
-- 1. Altas (18)
-- ------------------------------------------------------------

-- ETERNA DOCTORA  [T1]
--   https://www.studbook.org.ar/ejemplares/perfil/442125/eterna-doctora
--   (2023 H SP) · tomo 1253 folio 288 · abuelo materno: Alpha Plus (USA)
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen, studbook_id, estado, notas)
SELECT 'ETERNA DOCTORA', '2023-07-29'::date, 'hembra'::sexo_spc, 'Zaino Doradillo',
       'Doctor Embrujo', 'Eterna Diablita', 'Argentina', '442125', 'activo'::estado_spc,
       'SB 442125 · https://www.studbook.org.ar/ejemplares/perfil/442125/eterna-doctora · alta R9 tanda 1 11/09/2026'
WHERE NOT EXISTS (SELECT 1 FROM spcs WHERE studbook_id = '442125');

-- DESERT OF DUBAI  [T1]
--   https://www.studbook.org.ar/ejemplares/perfil/446340/desert-of-dubai
--   (2023 M SP) · tomo 1257 folio 469 · abuelo materno: Bernstein (USA)
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen, studbook_id, estado, notas)
SELECT 'DESERT OF DUBAI', '2023-10-09'::date, 'macho'::sexo_spc, 'Zaino',
       'Dubai Thunder (GB)', 'Grela (USA)', 'Argentina', '446340', 'activo'::estado_spc,
       'SB 446340 · https://www.studbook.org.ar/ejemplares/perfil/446340/desert-of-dubai · alta R9 tanda 1 11/09/2026'
WHERE NOT EXISTS (SELECT 1 FROM spcs WHERE studbook_id = '446340');

-- HERMANOSDEMIPATRIA  [T1]
--   https://www.studbook.org.ar/ejemplares/perfil/443096/hermanosdemipatria
--   (2023 M SP) · tomo 1254 folio 249 · abuelo materno: Gold Gift
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen, studbook_id, estado, notas)
SELECT 'HERMANOSDEMIPATRIA', '2023-09-07'::date, 'macho'::sexo_spc, 'Zaino',
       'Grand Reward (USA)', 'Cat The Gold', 'Argentina', '443096', 'activo'::estado_spc,
       'SB 443096 · https://www.studbook.org.ar/ejemplares/perfil/443096/hermanosdemipatria · alta R9 tanda 1 11/09/2026'
WHERE NOT EXISTS (SELECT 1 FROM spcs WHERE studbook_id = '443096');

-- ALHENA  [T2]
--   https://www.studbook.org.ar/ejemplares/perfil/434871/alhena
--   (2022 H SP) · tomo 1246 folio 139 · abuelo materno: Exchange Rate (USA)
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen, studbook_id, estado, notas)
SELECT 'ALHENA', '2022-07-16'::date, 'hembra'::sexo_spc, 'Zaino',
       'Puerto Escondido', 'Almedha', 'Argentina', '434871', 'activo'::estado_spc,
       'SB 434871 · https://www.studbook.org.ar/ejemplares/perfil/434871/alhena · alta R9 tanda 1 11/09/2026'
WHERE NOT EXISTS (SELECT 1 FROM spcs WHERE studbook_id = '434871');

-- OLA DOCTOR  [T2,T3]
--   https://www.studbook.org.ar/ejemplares/perfil/438421/ola-doctor
--   (2022 M SP) · tomo 1249 folio 650 · abuelo materno: Johar
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen, studbook_id, estado, notas)
SELECT 'OLA DOCTOR', '2022-10-24'::date, 'macho'::sexo_spc, 'Zaino',
       'Lead To Win', 'Sweet Johar (USA)', 'Argentina', '438421', 'activo'::estado_spc,
       'SB 438421 · https://www.studbook.org.ar/ejemplares/perfil/438421/ola-doctor · alta R9 tanda 1 11/09/2026'
WHERE NOT EXISTS (SELECT 1 FROM spcs WHERE studbook_id = '438421');

-- DEL CAMPEON  [T2]
--   https://www.studbook.org.ar/ejemplares/perfil/438805/del-campeon
--   (2022 M SP) · tomo 1250 folio 24 · abuelo materno: Sixties Icon (GB)
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen, studbook_id, estado, notas)
SELECT 'DEL CAMPEON', '2022-10-17'::date, 'macho'::sexo_spc, 'Zaino',
       'Golden Cigars', 'Sixties Spirit', 'Argentina', '438805', 'activo'::estado_spc,
       'SB 438805 · https://www.studbook.org.ar/ejemplares/perfil/438805/del-campeon · alta R9 tanda 1 11/09/2026'
WHERE NOT EXISTS (SELECT 1 FROM spcs WHERE studbook_id = '438805');

-- TORO MAÑERO  [T3]
--   https://www.studbook.org.ar/ejemplares/perfil/440758/toro-manero
--   (2022 M SP) · tomo 1251 folio 969 · abuelo materno: Giant's Causeway (USA)
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen, studbook_id, estado, notas)
SELECT 'TORO MAÑERO', '2022-10-21'::date, 'macho'::sexo_spc, 'Zaino',
       'Hit It A Bomb (USA)', 'Sarawak Top', 'Argentina', '440758', 'activo'::estado_spc,
       'SB 440758 · https://www.studbook.org.ar/ejemplares/perfil/440758/toro-manero · alta R9 tanda 1 11/09/2026'
WHERE NOT EXISTS (SELECT 1 FROM spcs WHERE studbook_id = '440758');

-- BACON  [T4]
--   https://www.studbook.org.ar/ejemplares/perfil/428803/bacon
--   (2021 M SP) · tomo 1240 folio 196 · abuelo materno: Equal Stripes
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen, studbook_id, estado, notas)
SELECT 'BACON', '2021-07-17'::date, 'macho'::sexo_spc, 'Zaino',
       'Winning Prize', 'Biosfera', 'Argentina', '428803', 'activo'::estado_spc,
       'SB 428803 · https://www.studbook.org.ar/ejemplares/perfil/428803/bacon · alta R9 tanda 1 11/09/2026'
WHERE NOT EXISTS (SELECT 1 FROM spcs WHERE studbook_id = '428803');

-- NISTEL WIN  [T4]
--   https://www.studbook.org.ar/ejemplares/perfil/430420/nistel-win
--   (2021 M SP) · tomo 1241 folio 793 · abuelo materno: Van Nistelrooy (USA)
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen, studbook_id, estado, notas)
SELECT 'NISTEL WIN', '2021-10-08'::date, 'macho'::sexo_spc, 'Zaino Colorado',
       'Lead To Win', 'Barbie Nistel', 'Argentina', '430420', 'activo'::estado_spc,
       'SB 430420 · https://www.studbook.org.ar/ejemplares/perfil/430420/nistel-win · alta R9 tanda 1 11/09/2026'
WHERE NOT EXISTS (SELECT 1 FROM spcs WHERE studbook_id = '430420');

-- HALLOTOP  [T6]
--   https://www.studbook.org.ar/ejemplares/perfil/441122/hallotop
--   (2021 M SP) · tomo 1252 folio 330 · abuelo materno: Seattle Fitz
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen, studbook_id, estado, notas)
SELECT 'HALLOTOP', '2021-10-08'::date, 'macho'::sexo_spc, 'Zaino',
       'Maipo Top', 'Halloweeninseattle', 'Argentina', '441122', 'activo'::estado_spc,
       'SB 441122 · https://www.studbook.org.ar/ejemplares/perfil/441122/hallotop · alta R9 tanda 1 11/09/2026'
WHERE NOT EXISTS (SELECT 1 FROM spcs WHERE studbook_id = '441122');

-- EL RISKO  [T7]
--   https://www.studbook.org.ar/ejemplares/perfil/421108/el-risko
--   (2020 M SP) · tomo 1232 folio 603 · abuelo materno: Manipulator (USA)
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen, studbook_id, estado, notas)
SELECT 'EL RISKO', '2020-09-10'::date, 'macho'::sexo_spc, 'Zaino',
       'Security Risk (USA)', 'Spanakopitas', 'Argentina', '421108', 'activo'::estado_spc,
       'SB 421108 · https://www.studbook.org.ar/ejemplares/perfil/421108/el-risko · alta R9 tanda 1 11/09/2026'
WHERE NOT EXISTS (SELECT 1 FROM spcs WHERE studbook_id = '421108');

-- ATOMIZADOR  [T7]
--   https://www.studbook.org.ar/ejemplares/perfil/422969/atomizador
--   (2020 M SP) · tomo 1234 folio 467 · abuelo materno: Lode (USA)
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen, studbook_id, estado, notas)
SELECT 'ATOMIZADOR', '2020-10-26'::date, 'macho'::sexo_spc, 'Zaino Doradillo',
       'Daniel Boone (BRZ)', 'Atomic Star', 'Argentina', '422969', 'activo'::estado_spc,
       'SB 422969 · https://www.studbook.org.ar/ejemplares/perfil/422969/atomizador · alta R9 tanda 1 11/09/2026'
WHERE NOT EXISTS (SELECT 1 FROM spcs WHERE studbook_id = '422969');

-- THE BEAST PARTY  [T9]
--   https://www.studbook.org.ar/ejemplares/perfil/438032/the-beast-party
--   (2022 M SP) · tomo 1249 folio 262 · abuelo materno: Remote (GB)
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen, studbook_id, estado, notas)
SELECT 'THE BEAST PARTY', '2022-07-30'::date, 'macho'::sexo_spc, 'Alazan',
       'In The Dark', 'Rimout Party', 'Argentina', '438032', 'activo'::estado_spc,
       'SB 438032 · https://www.studbook.org.ar/ejemplares/perfil/438032/the-beast-party · alta R9 tanda 1 11/09/2026'
WHERE NOT EXISTS (SELECT 1 FROM spcs WHERE studbook_id = '438032');

-- ABARAJALA  [T10]
--   https://www.studbook.org.ar/ejemplares/perfil/433798/abarajala
--   (2020 H SP) · tomo 1245 folio 90 · abuelo materno: Captif
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen, studbook_id, estado, notas)
SELECT 'ABARAJALA', '2020-10-25'::date, 'hembra'::sexo_spc, 'Zaino',
       'Storm Question', 'Redondiya', 'Argentina', '433798', 'activo'::estado_spc,
       'SB 433798 · https://www.studbook.org.ar/ejemplares/perfil/433798/abarajala · alta R9 tanda 1 11/09/2026'
WHERE NOT EXISTS (SELECT 1 FROM spcs WHERE studbook_id = '433798');

-- GOIADORA  [T11]
--   https://www.studbook.org.ar/ejemplares/perfil/428590/goiadora
--   (2021 H SP) · tomo 1239 folio 986 · abuelo materno: Emperor Richard
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen, studbook_id, estado, notas)
SELECT 'GOIADORA', '2021-09-23'::date, 'hembra'::sexo_spc, 'Zaino',
       'Goias Key', 'Degolladora', 'Argentina', '428590', 'activo'::estado_spc,
       'SB 428590 · https://www.studbook.org.ar/ejemplares/perfil/428590/goiadora · alta R9 tanda 1 11/09/2026'
WHERE NOT EXISTS (SELECT 1 FROM spcs WHERE studbook_id = '428590');

-- QUERELLANTE  [T9]
--   https://www.studbook.org.ar/ejemplares/perfil/416936/querellante
--   (2019 M SP) · tomo 1228 folio 516 · abuelo materno: Bernstein (USA)
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen, studbook_id, estado, notas)
SELECT 'QUERELLANTE', '2019-10-11'::date, 'macho'::sexo_spc, 'Zaino',
       'Daniel Boone (BRZ)', 'Que Felicidad', 'Argentina', '416936', 'activo'::estado_spc,
       'SB 416936 · https://www.studbook.org.ar/ejemplares/perfil/416936/querellante · alta R9 tanda 1 11/09/2026 · Homónimo en el Stud Book (sb 49722, 1947) descartado por edad.'
WHERE NOT EXISTS (SELECT 1 FROM spcs WHERE studbook_id = '416936');

-- MARIA CATULENGA  [T3]  (planilla: MARIA CATULANGA)
--   https://www.studbook.org.ar/ejemplares/perfil/440678/maria-catulenga
--   (2022 H SP) · tomo 1251 folio 889 · abuelo materno: Ever Peace
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen, studbook_id, estado, notas)
SELECT 'MARIA CATULENGA', '2022-10-15'::date, 'hembra'::sexo_spc, 'Zaino',
       'Fiskardo', 'Ever Propulsora', 'Argentina', '440678', 'activo'::estado_spc,
       'SB 440678 · https://www.studbook.org.ar/ejemplares/perfil/440678/maria-catulenga · alta R9 tanda 1 11/09/2026 · Planilla R9: MARIA CATULANGA.'
WHERE NOT EXISTS (SELECT 1 FROM spcs WHERE studbook_id = '440678');

-- NIÑO OCEANICO  [T4]  (planilla: NIÑO OSEANICO)
--   https://www.studbook.org.ar/ejemplares/perfil/428019/nino-oceanico
--   (2021 M SP) · tomo 1239 folio 420 · abuelo materno: Dynamix (USA)
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen, studbook_id, estado, notas)
SELECT 'NIÑO OCEANICO', '2021-09-01'::date, 'macho'::sexo_spc, 'Zaino',
       'Seahenge (USA)', 'Niña Divina', 'Argentina', '428019', 'activo'::estado_spc,
       'SB 428019 · https://www.studbook.org.ar/ejemplares/perfil/428019/nino-oceanico · alta R9 tanda 1 11/09/2026 · Planilla R9: NIÑO OSEANICO.'
WHERE NOT EXISTS (SELECT 1 FROM spcs WHERE studbook_id = '428019');

-- ------------------------------------------------------------
-- 2. Verificación ANTES del COMMIT
-- ------------------------------------------------------------

-- Debe dar 199 (181 + 18).
SELECT count(*) AS spcs_total FROM spcs;

-- Deben dar 18 filas, registro_stud_book y los FK de asignación en NULL,
-- notas con 'SB <id>'.
SELECT nombre, fecha_nacimiento, sexo, color, padrillo_nombre, madre_nombre,
       pais_origen, studbook_id, estado, registro_stud_book,
       club_id, caballeriza_id, entrenador_id, jockey_habitual_id, notas
FROM spcs WHERE studbook_id IN ('442125', '446340', '443096', '434871', '438421', '438805', '440758', '428803', '430420', '441122', '421108', '422969', '438032', '433798', '428590', '416936', '440678', '428019')
ORDER BY nombre;

-- Sexo de las yeguas de T10: ABARAJALA tiene que ser hembra. 1 fila.
SELECT nombre, sexo FROM spcs WHERE studbook_id = '433798' AND sexo = 'hembra';

-- Debe dar 0 filas.
SELECT studbook_id, count(*) FROM spcs WHERE studbook_id IS NOT NULL
GROUP BY 1 HAVING count(*) > 1;

COMMIT;

-- ============================================================
-- ROLLBACK
-- ============================================================
-- DELETE FROM spcs WHERE studbook_id IN ('442125', '446340', '443096', '434871', '438421', '438805', '440758', '428803', '430420', '441122', '421108', '422969', '438032', '433798', '428590', '416936', '440678', '428019');
-- (Seguro sólo mientras no tengan inscripciones — si Yesi ya inscribió,
--  primero resultado_posiciones, luego inscripciones. GOTCHA #12.)
-- Después: SELECT count(*) FROM spcs -> 181.
```

---

## 5. `migrations/spcs_conesera_sexo.sql` — contenido completo

```sql
-- ============================================================
-- spcs_conesera_sexo.sql — corrección de sexo + studbook_id de Conesera
-- ============================================================
-- ⏳ PROPUESTA — NO EJECUTADA. Espera gate de Leo (y confirmación de Yesi).
--
-- Fila: spcs 1f645327-a6da-449b-8a62-fdb577a8658e — 'Conesera', cargada a
-- mano el 09/05/2026 (sin studbook_id, sin color). Corrió R6, inscripta en
-- R9 T1 (3 años perdedores, ambos sexos).
--
-- Stud Book sb 444373, CONESERA, (2023 H SP), nac. 20/09/2023, Alazan,
-- Emmanuel × Milonga Burrera, abuelo materno Manipulator (USA),
-- tomo 1255 folio 510, raza 4, bandera argentina.
--   https://www.studbook.org.ar/ejemplares/perfil/444373/conesera
--
-- Por qué es el mismo animal: fecha de nacimiento EXACTA (20/09/2023) +
-- mismo padre + misma madre. Una yegua pare una cría por año; dos animales
-- distintos con la misma madre y la misma fecha no existen. El homónimo
-- (sb 183273, 1993) no es candidato. Lo único que difiere es el sexo:
-- DB 'macho', Stud Book 'Hembra'. Con ADN, pasaporte y revisión del SB en 1,
-- el dato bueno es el del Stud Book: sexo mal cargado a mano.
--
-- Efecto práctico: T1 tiene "Descargo 2 kilos a las hembras". Hoy el
-- programa/peso la trataría como macho.
--
-- Va SEPARADO de spcs_r9_tanda_1.sql: es UPDATE, no alta. No cambia el
-- count de spcs (181 antes, 181 después; o 199 si corre después de la tanda).
-- ============================================================

-- 0. Antes: tiene que dar exactamente esta fila (sexo=macho, studbook_id NULL).
SELECT id, nombre, fecha_nacimiento, sexo, color, padrillo_nombre, madre_nombre,
       studbook_id, registro_stud_book, notas
FROM spcs WHERE id = '1f645327-a6da-449b-8a62-fdb577a8658e';

-- 0.b sb 444373 libre: 0 filas.
SELECT id, nombre FROM spcs WHERE studbook_id = '444373';

BEGIN;

UPDATE spcs
SET sexo        = 'hembra'::sexo_spc,
    nombre      = 'CONESERA',
    color       = COALESCE(color, 'Alazan'),
    studbook_id = '444373',
    notas       = concat_ws(' · ', NULLIF(notas, ''),
                    'SB 444373 · https://www.studbook.org.ar/ejemplares/perfil/444373/conesera',
                    'sexo corregido macho->hembra segun Stud Book 11/09/2026 (planilla R9: CONESERSA)')
WHERE id = '1f645327-a6da-449b-8a62-fdb577a8658e'
  AND sexo = 'macho'
  AND fecha_nacimiento = '2023-09-20'
  AND studbook_id IS NULL;

-- 1 fila afectada. Si 0, algo cambió desde el relevamiento: ROLLBACK.

-- Verificación antes del COMMIT: sexo=hembra, studbook_id=444373, nombre=CONESERA.
SELECT id, nombre, sexo, color, studbook_id, notas
FROM spcs WHERE id = '1f645327-a6da-449b-8a62-fdb577a8658e';

-- registro_stud_book sigue NULL (criterio acordado). 1 fila.
SELECT id FROM spcs WHERE id = '1f645327-a6da-449b-8a62-fdb577a8658e' AND registro_stud_book IS NULL;

COMMIT;

-- ============================================================
-- ROLLBACK
-- ============================================================
-- UPDATE spcs SET sexo='macho', nombre='Conesera', studbook_id=NULL, color=NULL
-- WHERE id='1f645327-a6da-449b-8a62-fdb577a8658e';
-- (color: antes era NULL — ver el SELECT 0. notas: quitar el sufijo a mano.)
```

---

## 6. Ejecución (cuando des el OK) — orden

1. `git checkout fix/spcs-r9-tanda-1`, guards (pwd / 181 / ref).
2. Correr §0 del SQL (4 SELECTs) → 181 / 0 / 0 / 0. Si no, parar.
3. `apply_migration` con el bloque `BEGIN … COMMIT` de `spcs_r9_tanda_1.sql` (queda trackeada). Verificar 199 y las 18 filas.
4. Si Yesi confirma Conesera: `apply_migration` con `spcs_conesera_sexo.sql`. Count sigue 199.
5. Probe post-insert (`tests/probe_spcs_r9_tanda_1.mjs`, a escribir): 18 filas por `studbook_id`, sexo/fecha iguales al JSON, ABARAJALA hembra, `registro_stud_book` NULL en las 18, count = 199, 0 `studbook_id` repetidos.
6. `CLAUDE.md`: baseline `spcs` 181 → 199. CHANGELOG. Merge a `main` con OK.
