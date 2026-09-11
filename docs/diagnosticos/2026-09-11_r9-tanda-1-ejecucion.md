# R9 tanda 1 — EJECUCIÓN: 18 altas de SPCs aplicadas en producción

**Fecha:** 2026-09-11 · **Branch:** `fix/spcs-r9-tanda-1` @ `03aef1d` (pusheada, **sin mergear a `main`** — espera OK) · **SQL:** `migrations/spcs_r9_tanda_1.sql` · **Propuesta:** `2026-09-11_r9-tanda-1-sql-propuesto.md`
**Resultado: `spcs` 181 → 199. Probe 77/77. Conesera sin tocar.**

## 0. Guards (antes de escribir)

| guard | esperado | real |
|---|---|---|
| `pwd` | `/home/clio/dev/SGH` | ✅ |
| branch | `fix/spcs-r9-tanda-1` @ `221fb12`, tree limpio | ✅ |
| `SELECT count(*) FROM spcs` | 181 | ✅ **181** (§1, chk a) |
| ref | `unlhcuanfrtpatoipwve` | ✅ (`db=postgres`, cliente MCP del proyecto) |

---

## 1. Pre-chequeos — gate de parada (corridos inmediatamente antes del apply)

Condición de Leo: parar si alguno de los chequeos de duplicado no da cero. Los cuatro del §0 del SQL, en una consulta:

```sql
select 'a' chk, count(*)::text as r from spcs
union all select 'b', coalesce(string_agg(nombre||' '||studbook_id, '; '),'0 filas') from spcs where studbook_id IN ('442125', '446340', '443096', '434871', '438421', '438805', '440758', '428803', '430420', '441122', '421108', '422969', '438032', '433798', '428590', '416936', '440678', '428019')
union all select 'c', coalesce(string_agg(nombre, '; '),'0 filas') from spcs where upper(regexp_replace(translate(nombre, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'), '[^A-Za-z0-9]', '', 'g')) IN ('ETERNADOCTORA', 'DESERTOFDUBAI', 'HERMANOSDEMIPATRIA', 'ALHENA', 'OLADOCTOR', 'DELCAMPEON', 'TOROMANERO', 'BACON', 'NISTELWIN', 'HALLOTOP', 'ELRISKO', 'ATOMIZADOR', 'THEBEASTPARTY', 'ABARAJALA', 'GOIADORA', 'QUERELLANTE', 'MARIACATULENGA', 'NINOOCEANICO')
union all select 'd', coalesce(string_agg(s.nombre, '; '),'0 filas') from spcs s join (values ('2023-07-29'::date,'Doctor Embrujo','Eterna Diablita'),('2023-10-09','Dubai Thunder (GB)','Grela (USA)'),('2023-09-07','Grand Reward (USA)','Cat The Gold'),('2022-07-16','Puerto Escondido','Almedha'),('2022-10-24','Lead To Win','Sweet Johar (USA)'),('2022-10-17','Golden Cigars','Sixties Spirit'),('2022-10-21','Hit It A Bomb (USA)','Sarawak Top'),('2021-07-17','Winning Prize','Biosfera'),('2021-10-08','Lead To Win','Barbie Nistel'),('2021-10-08','Maipo Top','Halloweeninseattle'),('2020-09-10','Security Risk (USA)','Spanakopitas'),('2020-10-26','Daniel Boone (BRZ)','Atomic Star'),('2022-07-30','In The Dark','Rimout Party'),('2020-10-25','Storm Question','Redondiya'),('2021-09-23','Goias Key','Degolladora'),('2019-10-11','Daniel Boone (BRZ)','Que Felicidad'),('2022-10-15','Fiskardo','Ever Propulsora'),('2021-09-01','Seahenge (USA)','Niña Divina')) v(fn,padre,madre) on s.fecha_nacimiento=v.fn and upper(s.padrillo_nombre)=upper(v.padre) and upper(s.madre_nombre)=upper(v.madre)
union all select 'ref', current_setting('request.jwt.claims', true) is null::text || ' db=' || current_database()
```

```json
[{"chk":"a","r":"181"},{"chk":"b","r":"0 filas"},{"chk":"c","r":"0 filas"},{"chk":"d","r":"0 filas"},{"chk":"ref","r":"true db=postgres"}]
```

181 / 0 / 0 / 0 → **gate abierto**.

---

## 2. Lo que se aplicó

`mcp__supabase__apply_migration`, nombre **`spcs_r9_tanda_1`** (queda trackeada como migración del proyecto). Cuerpo = los 18 `INSERT … WHERE NOT EXISTS (… studbook_id = …)` de `migrations/spcs_r9_tanda_1.sql` **tal cual** (extraídos del archivo con `awk`, no retipeados) + un bloque `DO` al final para que la parada de Leo sea atómica: si el count post no da 199 la transacción entera hace rollback sola, sin depender de un SELECT que "mire" después.

```sql

-- 1. Altas (18)

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


DO $$
DECLARE n int; d int; h int;
BEGIN
  SELECT count(*) INTO n FROM spcs;
  IF n <> 199 THEN RAISE EXCEPTION 'spcs count post-insert = %, esperado 199 -> rollback', n; END IF;
  SELECT count(*) INTO d FROM (SELECT studbook_id FROM spcs WHERE studbook_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1) x;
  IF d <> 0 THEN RAISE EXCEPTION 'studbook_id duplicados: % -> rollback', d; END IF;
  SELECT count(*) INTO h FROM spcs WHERE studbook_id = '433798' AND sexo = 'hembra';
  IF h <> 1 THEN RAISE EXCEPTION 'ABARAJALA no es hembra -> rollback'; END IF;
END $$;
```

Respuesta del MCP:

```json
{"success":true}
```

---

## 3. Verificación post (sólo lectura)

```sql
select (select count(*) from spcs) as total,
(select count(*) from spcs where studbook_id in ('442125','446340','443096','434871','438421','438805','440758','428803','430420','441122','421108','422969','438032','433798','428590','416936','440678','428019')) as nuevas,
(select count(*) from spcs where studbook_id in (…los 18…) and registro_stud_book is null and club_id is null and caballeriza_id is null and entrenador_id is null and jockey_habitual_id is null and notas like 'SB %' and estado='activo') as nuevas_ok,
(select count(*) from (select studbook_id from spcs where studbook_id is not null group by 1 having count(*)>1) x) as sb_dup,
(select string_agg(nombre||'|'||fecha_nacimiento||'|'||sexo||'|'||coalesce(color,'-')||'|'||studbook_id, '; ' order by nombre) from spcs where notas like '%alta R9 tanda 1 11/09/2026%') as filas,
(select sexo::text from spcs where studbook_id='433798') as abarajala_sexo,
(select nombre||' / '||sexo from spcs where id='1f645327-a6da-449b-8a62-fdb577a8658e') as conesera_intacta
```

```json
[{"total":199,"nuevas":18,"nuevas_ok":18,"sb_dup":0,"filas":"ABARAJALA|2020-10-25|hembra|Zaino|433798; ALHENA|2022-07-16|hembra|Zaino|434871; ATOMIZADOR|2020-10-26|macho|Zaino Doradillo|422969; BACON|2021-07-17|macho|Zaino|428803; DEL CAMPEON|2022-10-17|macho|Zaino|438805; DESERT OF DUBAI|2023-10-09|macho|Zaino|446340; EL RISKO|2020-09-10|macho|Zaino|421108; ETERNA DOCTORA|2023-07-29|hembra|Zaino Doradillo|442125; GOIADORA|2021-09-23|hembra|Zaino|428590; HALLOTOP|2021-10-08|macho|Zaino|441122; HERMANOSDEMIPATRIA|2023-09-07|macho|Zaino|443096; MARIA CATULENGA|2022-10-15|hembra|Zaino|440678; NIÑO OCEANICO|2021-09-01|macho|Zaino|428019; NISTEL WIN|2021-10-08|macho|Zaino Colorado|430420; OLA DOCTOR|2022-10-24|macho|Zaino|438421; QUERELLANTE|2019-10-11|macho|Zaino|416936; THE BEAST PARTY|2022-07-30|macho|Alazan|438032; TORO MAÑERO|2022-10-21|macho|Zaino|440758","abarajala_sexo":"hembra","conesera_intacta":"Conesera / macho"}]
```

| check | esperado | real |
|---|---|---|
| `count(spcs)` | 199 | **199** ✅ |
| filas nuevas por `studbook_id` | 18 | **18** ✅ |
| de esas, `registro_stud_book` NULL + FKs NULL + `notas` con `SB ` + activo | 18 | **18** ✅ |
| `studbook_id` repetidos en toda la tabla | 0 | **0** ✅ |
| ABARAJALA | hembra | **hembra** ✅ |
| Conesera `1f645327-…` | intacta (macho, como estaba) | **Conesera / macho** ✅ — no se tocó |

---

## 4. Probe — `tests/probe_spcs_r9_tanda_1.mjs` (nuevo, solo lectura)

Compara las 18 filas contra `data/spcs_r9_tanda_1_scrape.json` (los 15 del scraper) + los 3 resueltos a mano (valores fijados en el probe, iguales al SQL). Asserts A–H: count 199 · 18 filas una vez cada una · nombre/fecha/sexo/color/padre/madre = evidencia · NULLs y estado · `notas` con `SB <id> · <url>` y `Planilla R9: <variante>` en los 2 typos · ABARAJALA hembra · 0 `studbook_id` repetidos · Conesera intacta.

```bash
set -a; . ./.env; set +a
node tests/probe_spcs_r9_tanda_1.mjs
```

```
✅ A count(spcs) = 199  → real 199
✅ B 18 filas por studbook_id  → real 18
✅ B ETERNA DOCTORA sb=442125 una sola fila  → hay 1
✅ C ETERNA DOCTORA datos = evidencia  → ETERNA DOCTORA|2023-07-29|hembra|Zaino Doradillo|Doctor Embrujo|Eterna Diablita
✅ D ETERNA DOCTORA registro NULL, FKs NULL, activo
✅ E ETERNA DOCTORA notas con SB + url  → SB 442125 · https://www.studbook.org.ar/ejemplares/perfil/442125/eterna-doctora · alta R9 tanda 1 11/09/2026
✅ B DESERT OF DUBAI sb=446340 una sola fila  → hay 1
✅ C DESERT OF DUBAI datos = evidencia  → DESERT OF DUBAI|2023-10-09|macho|Zaino|Dubai Thunder (GB)|Grela (USA)
✅ D DESERT OF DUBAI registro NULL, FKs NULL, activo
✅ E DESERT OF DUBAI notas con SB + url  → SB 446340 · https://www.studbook.org.ar/ejemplares/perfil/446340/desert-of-dubai · alta R9 tanda 1 11/09/2026
✅ B HERMANOSDEMIPATRIA sb=443096 una sola fila  → hay 1
✅ C HERMANOSDEMIPATRIA datos = evidencia  → HERMANOSDEMIPATRIA|2023-09-07|macho|Zaino|Grand Reward (USA)|Cat The Gold
✅ D HERMANOSDEMIPATRIA registro NULL, FKs NULL, activo
✅ E HERMANOSDEMIPATRIA notas con SB + url  → SB 443096 · https://www.studbook.org.ar/ejemplares/perfil/443096/hermanosdemipatria · alta R9 tanda 1 11/09/2026
✅ B ALHENA sb=434871 una sola fila  → hay 1
✅ C ALHENA datos = evidencia  → ALHENA|2022-07-16|hembra|Zaino|Puerto Escondido|Almedha
✅ D ALHENA registro NULL, FKs NULL, activo
✅ E ALHENA notas con SB + url  → SB 434871 · https://www.studbook.org.ar/ejemplares/perfil/434871/alhena · alta R9 tanda 1 11/09/2026
✅ B OLA DOCTOR sb=438421 una sola fila  → hay 1
✅ C OLA DOCTOR datos = evidencia  → OLA DOCTOR|2022-10-24|macho|Zaino|Lead To Win|Sweet Johar (USA)
✅ D OLA DOCTOR registro NULL, FKs NULL, activo
✅ E OLA DOCTOR notas con SB + url  → SB 438421 · https://www.studbook.org.ar/ejemplares/perfil/438421/ola-doctor · alta R9 tanda 1 11/09/2026
✅ B DEL CAMPEON sb=438805 una sola fila  → hay 1
✅ C DEL CAMPEON datos = evidencia  → DEL CAMPEON|2022-10-17|macho|Zaino|Golden Cigars|Sixties Spirit
✅ D DEL CAMPEON registro NULL, FKs NULL, activo
✅ E DEL CAMPEON notas con SB + url  → SB 438805 · https://www.studbook.org.ar/ejemplares/perfil/438805/del-campeon · alta R9 tanda 1 11/09/2026
✅ B TORO MAÑERO sb=440758 una sola fila  → hay 1
✅ C TORO MAÑERO datos = evidencia  → TORO MAÑERO|2022-10-21|macho|Zaino|Hit It A Bomb (USA)|Sarawak Top
✅ D TORO MAÑERO registro NULL, FKs NULL, activo
✅ E TORO MAÑERO notas con SB + url  → SB 440758 · https://www.studbook.org.ar/ejemplares/perfil/440758/toro-manero · alta R9 tanda 1 11/09/2026
✅ B BACON sb=428803 una sola fila  → hay 1
✅ C BACON datos = evidencia  → BACON|2021-07-17|macho|Zaino|Winning Prize|Biosfera
✅ D BACON registro NULL, FKs NULL, activo
✅ E BACON notas con SB + url  → SB 428803 · https://www.studbook.org.ar/ejemplares/perfil/428803/bacon · alta R9 tanda 1 11/09/2026
✅ B NISTEL WIN sb=430420 una sola fila  → hay 1
✅ C NISTEL WIN datos = evidencia  → NISTEL WIN|2021-10-08|macho|Zaino Colorado|Lead To Win|Barbie Nistel
✅ D NISTEL WIN registro NULL, FKs NULL, activo
✅ E NISTEL WIN notas con SB + url  → SB 430420 · https://www.studbook.org.ar/ejemplares/perfil/430420/nistel-win · alta R9 tanda 1 11/09/2026
✅ B HALLOTOP sb=441122 una sola fila  → hay 1
✅ C HALLOTOP datos = evidencia  → HALLOTOP|2021-10-08|macho|Zaino|Maipo Top|Halloweeninseattle
✅ D HALLOTOP registro NULL, FKs NULL, activo
✅ E HALLOTOP notas con SB + url  → SB 441122 · https://www.studbook.org.ar/ejemplares/perfil/441122/hallotop · alta R9 tanda 1 11/09/2026
✅ B EL RISKO sb=421108 una sola fila  → hay 1
✅ C EL RISKO datos = evidencia  → EL RISKO|2020-09-10|macho|Zaino|Security Risk (USA)|Spanakopitas
✅ D EL RISKO registro NULL, FKs NULL, activo
✅ E EL RISKO notas con SB + url  → SB 421108 · https://www.studbook.org.ar/ejemplares/perfil/421108/el-risko · alta R9 tanda 1 11/09/2026
✅ B ATOMIZADOR sb=422969 una sola fila  → hay 1
✅ C ATOMIZADOR datos = evidencia  → ATOMIZADOR|2020-10-26|macho|Zaino Doradillo|Daniel Boone (BRZ)|Atomic Star
✅ D ATOMIZADOR registro NULL, FKs NULL, activo
✅ E ATOMIZADOR notas con SB + url  → SB 422969 · https://www.studbook.org.ar/ejemplares/perfil/422969/atomizador · alta R9 tanda 1 11/09/2026
✅ B THE BEAST PARTY sb=438032 una sola fila  → hay 1
✅ C THE BEAST PARTY datos = evidencia  → THE BEAST PARTY|2022-07-30|macho|Alazan|In The Dark|Rimout Party
✅ D THE BEAST PARTY registro NULL, FKs NULL, activo
✅ E THE BEAST PARTY notas con SB + url  → SB 438032 · https://www.studbook.org.ar/ejemplares/perfil/438032/the-beast-party · alta R9 tanda 1 11/09/2026
✅ B ABARAJALA sb=433798 una sola fila  → hay 1
✅ C ABARAJALA datos = evidencia  → ABARAJALA|2020-10-25|hembra|Zaino|Storm Question|Redondiya
✅ D ABARAJALA registro NULL, FKs NULL, activo
✅ E ABARAJALA notas con SB + url  → SB 433798 · https://www.studbook.org.ar/ejemplares/perfil/433798/abarajala · alta R9 tanda 1 11/09/2026
✅ B GOIADORA sb=428590 una sola fila  → hay 1
✅ C GOIADORA datos = evidencia  → GOIADORA|2021-09-23|hembra|Zaino|Goias Key|Degolladora
✅ D GOIADORA registro NULL, FKs NULL, activo
✅ E GOIADORA notas con SB + url  → SB 428590 · https://www.studbook.org.ar/ejemplares/perfil/428590/goiadora · alta R9 tanda 1 11/09/2026
✅ B QUERELLANTE sb=416936 una sola fila  → hay 1
✅ C QUERELLANTE datos = evidencia  → QUERELLANTE|2019-10-11|macho|Zaino|Daniel Boone (BRZ)|Que Felicidad
✅ D QUERELLANTE registro NULL, FKs NULL, activo
✅ E QUERELLANTE notas con SB + url  → SB 416936 · https://www.studbook.org.ar/ejemplares/perfil/416936/querellante · alta R9 tanda 1 11/09/2026 · Homónimo en el Stud Book (sb 49722, 1947) descartado por edad.
✅ B MARIA CATULENGA sb=440678 una sola fila  → hay 1
✅ C MARIA CATULENGA datos = evidencia  → MARIA CATULENGA|2022-10-15|hembra|Zaino|Fiskardo|Ever Propulsora
✅ D MARIA CATULENGA registro NULL, FKs NULL, activo
✅ E MARIA CATULENGA notas con SB + url + variante  → SB 440678 · https://www.studbook.org.ar/ejemplares/perfil/440678/maria-catulenga · alta R9 tanda 1 11/09/2026 · Planilla R9: MARIA CATULANGA.
✅ B NIÑO OCEANICO sb=428019 una sola fila  → hay 1
✅ C NIÑO OCEANICO datos = evidencia  → NIÑO OCEANICO|2021-09-01|macho|Zaino|Seahenge (USA)|Niña Divina
✅ D NIÑO OCEANICO registro NULL, FKs NULL, activo
✅ E NIÑO OCEANICO notas con SB + url + variante  → SB 428019 · https://www.studbook.org.ar/ejemplares/perfil/428019/nino-oceanico · alta R9 tanda 1 11/09/2026 · Planilla R9: NIÑO OSEANICO.
✅ F ABARAJALA hembra
✅ G 0 studbook_id repetidos en spcs  → []
✅ H Conesera intacta (macho, sin studbook_id)  → {"nombre":"Conesera","sexo":"macho","studbook_id":null}

77/77 asserts OK
```

---

## 5. Archivos en la rama `fix/spcs-r9-tanda-1` (`03aef1d`)

| archivo | cambio |
|---|---|
| `migrations/spcs_r9_tanda_1.sql` | encabezado → **EJECUTADA 11/09/2026** |
| `migrations/spcs_conesera_sexo.sql` | sin cambios, sigue **PROPUESTO** |
| `data/spcs_r9_tanda_1_scrape.json`, `data/spcs_r9_tanda_1_nombres.txt` | evidencia |
| `tests/probe_spcs_r9_tanda_1.mjs` | nuevo, 77 asserts |
| `CLAUDE.md` | baseline `spcs` **181 → 199** (2026-09-11) + historial + los 2 SQL en el árbol + el probe en la lista |
| `CHANGELOG.md` | entrada `[2026-09-11] — R9 tanda 1` |

**No mergeado a `main`.** La DB ya está en 199 pero `main` todavía dice 181 en `CLAUDE.md` — hasta el merge, cualquier sesión que arranque en `main` va a ver el guard desfasado. Conviene mergear pronto.

---

## 6. Queda

1. **Merge de `fix/spcs-r9-tanda-1` a `main`** — con tu OK.
2. **Conesera** (`spcs_conesera_sexo.sql`) — cuando Yesi confirme el sexo.
3. **T9 `edad_minima_anos` 5 → 4** — sigue pendiente (THE BEAST PARTY ya está en el padrón pero el gate de T9 lo rechaza hasta que se corrija).
4. Los 4 que vuelven a Yesi: BELLA DOÑA, BIEN COQUETA, EL MAS SABIO, INDIA MARO.
5. Grafías con variante: se queda como está (nota en la ficha), sin matcheo en el autocompletado. Decisión tuya, anotada.

---

## 7. Verificación de push

```
$ git ls-remote origin fix/spcs-r9-tanda-1
03aef1dfdd2ec313af579ac8465b3eb8b10518ee	refs/heads/fix/spcs-r9-tanda-1
$ git push origin reports
$ git ls-remote origin reports
a8d147cc2749bb85bf760c758dddab5b414f9ed1	refs/heads/reports
$ git rev-parse HEAD
a8d147cc2749bb85bf760c758dddab5b414f9ed1
```
