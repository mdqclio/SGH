# Cierre del día — merge provisorios R9 · tanda 3 lista (NO ejecutada) · nota del lunes

**Fecha:** 2026-09-11 (noche) · **`main`:** `194e02f` (merge `--no-ff` de `feat/provisorios-r9` + nota del lunes en `CLAUDE.md`) · **Tanda 3:** `fix/spcs-r9-tanda-3` @ `3e670a0` (pusheada, **sin ejecutar, sin mergear**)

## 0. Guards

| guard | esperado | real |
|---|---|---|
| `pwd` | `/home/clio/dev/SGH` | ✅ |
| `spcs` | 201 | ✅ 201 (tanda 3 no corrió) |
| ref | `unlhcuanfrtpatoipwve` | ✅ |

---

## 1. Merge — hecho

`feat/provisorios-r9` → `main` con `--no-ff` = **`194e02f`** (`git ls-remote origin main` = `HEAD`). Trae `migrations/propietarios_provisorios_r9.sql` marcado EJECUTADA con el bloque `DO` re-ejecutable, la entrada `[2026-09-11 noche, 3]` del CHANGELOG, y la nota del punto 3.

---

## 2. Tanda 3 — BIEN COQUETA y EL MAS SABIO: todo verificado, un OK de distancia

Con los turnos que definió Yesi, los dos cierran:

| SPC | Stud Book | nac. | edad 20/09 | sexo | color | padre × madre | turno de Yesi | columnas del turno | ✓ |
|---|---|---|---|---|---|---|---|---|---|
| BIEN COQUETA | sb 429819 (homónima 1998 descartada) | 2021-10-15 | 5 | hembra | Zaino Colorado | Bien Terminado × Gritty | **T11** — "5 años y + perdedor" | 5–∞, ambos | ✅ |
| EL MAS SABIO | sb 431662 (único) | 2021-10-26 | 5 | macho | Alazan | Il Campione (CHI) × Indigirka | **T6** — "de 5 años ganador de 1 o 2" | 5–5, ambos | ✅ |

Sondeo crudo:
```

=== BIEN COQUETA — 2 hits
  429819	BIEN COQUETA	15/10/2021	Hembra	Zaino Colorado	Bien Terminado / Gritty	raza=4	icon=/img/banderas/10.png
  216248	BIEN COQUETA	29/07/1998	Hembra	Alazan	Yale Twentyniner (USA) / Coquetisima	raza=4	icon=/img/banderas/10.png

=== EL MAS SABIO — 1 hits
  431662	EL MAS SABIO	26/10/2021	Macho	Alazan	Il Campione (CHI) / Indigirka	raza=4	icon=/img/banderas/10.png
```

Duplicados contra las 201 (`studbook_id` / nombre normalizado / fecha+padre+madre): **0 / 0 / 0**.

```json
[{"chk":"a","r":"201"},{"chk":"b","r":"0 filas"},{"chk":"c","r":"0 filas"},{"chk":"d","r":"0 filas"},{"chk":"turnos","r":"T6 5-5 ambos | Todo caballo de 5 años ganador de 1 o 2 carreras. ;; T11 5-∞ ambos | Todo caballo 5 años y + edad perdedor."}]
```

`migrations/spcs_r9_tanda_3.sql` en `fix/spcs-r9-tanda-3`: 2 INSERT idempotentes, mismo criterio que tandas 1 y 2 (`registro_stud_book` NULL, `notas` con SB + url + tanda + el cambio de turno que hizo Yesi). **Esperado: 201 → 203.** Al ejecutar va con el `DO` de aborto (count ≠ 203 / sb repetido) como las anteriores; después, `CLAUDE.md` 201 → 203 y merge.

No lo ejecuté: todo lo de hoy salió con tu OK explícito por tanda, y esta no lo tenía. Con "ejecutá" sale en un paso.

Contenido completo:

```sql
-- ============================================================
-- spcs_r9_tanda_3.sql — BIEN COQUETA (T11) y EL MAS SABIO (T6): los dos que quedaban de la planilla de R9
-- ============================================================
-- ⏳ PROPUESTA — NO EJECUTADA. Espera gate de Leo.
--
-- Eran los 2 "edad no cierra" del informe del scrape (11/09): la planilla los tenía en T2 (4 años) y T5
-- (3-4 años) y los dos son de 2021 (5 años). Yesi definió los turnos correctos:
--   BIEN COQUETA  -> T11 (Todo caballo 5 años y + edad perdedor; columnas 5-∞, ambos)   5 años ✔
--   EL MAS SABIO  -> T6  (Todo caballo de 5 años ganador de 1 o 2; columnas 5-5, ambos)  5 años ✔
-- Stud Book (sondeo 11/09, data/spcs_r9_tanda_3_probe.json):
--   BIEN COQUETA  sb 429819, 15/10/2021, Hembra, Zaino Colorado, Bien Terminado × Gritty, ab.mat. Luhuk (USA), tomo 1241 folio 202.
--                 Homónima sb 216248 (1998) descartada por edad.
--   EL MAS SABIO  sb 431662, 26/10/2021, Macho, Alazan, Il Campione (CHI) × Indigirka, ab.mat. Interprete, tomo 1242 folio 998. Único.
-- Duplicados contra las 201: por studbook_id 0, por nombre normalizado 0, por fecha+padre+madre 0.
-- Mismo criterio que tandas 1 y 2: registro_stud_book NULL, studbook_id en columna, notas con SB + url + tanda.
-- Idempotente por studbook_id. Esperado: spcs 201 -> 203.
-- ============================================================

-- 0. Pre-chequeos: 201 / 0 / 0 / 0
SELECT count(*) AS spcs_total_antes FROM spcs;
SELECT nombre, studbook_id FROM spcs WHERE studbook_id IN ('429819', '431662');
SELECT nombre FROM spcs WHERE upper(regexp_replace(translate(nombre,'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'),'[^A-Za-z0-9]','','g')) IN ('BIENCOQUETA','ELMASSABIO');
SELECT s.nombre FROM spcs s JOIN (VALUES ('2021-10-15'::date,'Bien Terminado','Gritty'),('2021-10-26'::date,'Il Campione (CHI)','Indigirka')) v(fn,padre,madre)
  ON s.fecha_nacimiento = v.fn AND upper(s.padrillo_nombre) = upper(v.padre) AND upper(s.madre_nombre) = upper(v.madre);

BEGIN;

-- BIEN COQUETA  [T11]
--   https://www.studbook.org.ar/ejemplares/perfil/429819/bien-coqueta
--   (2021 H SP) · tomo 1241 folio 202 · abuelo materno: Luhuk (USA)
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen, studbook_id, estado, notas)
SELECT 'BIEN COQUETA', '2021-10-15'::date, 'hembra'::sexo_spc, 'Zaino Colorado',
       'Bien Terminado', 'Gritty', 'Argentina', '429819', 'activo'::estado_spc,
       'SB 429819 · https://www.studbook.org.ar/ejemplares/perfil/429819/bien-coqueta · alta R9 tanda 3 11/09/2026 · Homónima sb 216248 (1998) descartada por edad. Planilla R9 la tenía en T2; Yesi la pasó a T11.'
WHERE NOT EXISTS (SELECT 1 FROM spcs WHERE studbook_id = '429819');

-- EL MAS SABIO  [T6]
--   https://www.studbook.org.ar/ejemplares/perfil/431662/el-mas-sabio
--   (2021 M SP) · tomo 1242 folio 998 · abuelo materno: Interprete
INSERT INTO spcs (nombre, fecha_nacimiento, sexo, color,
                  padrillo_nombre, madre_nombre, pais_origen, studbook_id, estado, notas)
SELECT 'EL MAS SABIO', '2021-10-26'::date, 'macho'::sexo_spc, 'Alazan',
       'Il Campione (CHI)', 'Indigirka', 'Argentina', '431662', 'activo'::estado_spc,
       'SB 431662 · https://www.studbook.org.ar/ejemplares/perfil/431662/el-mas-sabio · alta R9 tanda 3 11/09/2026 · Planilla R9 lo tenía en T5; Yesi lo pasó a T6.'
WHERE NOT EXISTS (SELECT 1 FROM spcs WHERE studbook_id = '431662');

-- Verificación antes del COMMIT: 203; 2 filas; 0 studbook_id repetidos.
SELECT count(*) AS spcs_total FROM spcs;
SELECT nombre, fecha_nacimiento, sexo, color, padrillo_nombre, madre_nombre, studbook_id, registro_stud_book, notas
FROM spcs WHERE studbook_id IN ('429819', '431662') ORDER BY nombre;
SELECT studbook_id, count(*) FROM spcs WHERE studbook_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1;

COMMIT;

-- ROLLBACK: DELETE FROM spcs WHERE studbook_id IN ('429819','431662');  (sólo sin inscripciones — GOTCHA #12) → 201
```

Después del alta, Yesi los anota en T11 y T6 desde Inscripciones y les asigna stud; si el stud no tiene titular → punto 3.

---

## 3. Los 8 sin caballeriza — anotado en `CLAUDE.md` (ya en `main`)

Sección nueva **"R9 (20/09/2026) — pendiente operativo del lunes 14/09"** en `CLAUDE.md` (antes de "Pendiente confirmar con Fede"), commit `194e02f`:

> Después de la ratificación, volver a correr el `DO` de `migrations/propietarios_provisorios_r9.sql` (cambiando `marca` a la fecha del día). Es data-driven: agarra cualquier caballeriza de Dolores que tenga inscripción en R9 sin `propietario_id` y sin titular activo → crea el provisorio + vínculo + re-deriva. Motivo: al 11/09 quedaban **8 inscripciones sin caballeriza** (los SPC dados de alta ese día); cuando Yesi les asigne el stud, si ese stud no tiene titular caen en el mismo pozo (GOTCHA #47). Control: `select count(*) … where … estado='ratificado' and propietario_id is null` → **0**.

Los 8: MARIA CATULENGA T3, NIÑO OCEANICO T4, EL RISKO T7, ATOMIZADOR T7, THE BEAST PARTY T9, INDIANA MARO T10, ABARAJALA T10, GOIADORA T11. Dos van a EL DON JORGE (LP), que ya tiene provisorio. Los otros seis: stud desconocido hasta que Yesi lo cargue. Más los 2 de la tanda 3 cuando entren.

El `DO` aborta con "nada que hacer" si el lunes no hay ninguna — no deja rastro. Un corrido, una query de control, listo.

---

## 4. Estado al cierre del 11/09

| | |
|---|---|
| `spcs` | 201 (+2 pendientes de OK) |
| R9 | 76 inscripciones · 68 con propietario · 0 con caballeriza sin propietario · 8 sin caballeriza |
| llamado R9 | 11/11 turnos consistentes con su texto; ventanas intactas |
| provisorios | 47 (`provisorio R%`) — el primero completado hoy (TRUPPA / LOS URONES) |
| caballerizas | 299; duplicados resueltos hoy: LOS URONES, CAROSUEÑO; quedan LA NARCISA (vacía), SANTA BARBARA, EL LINYE Y RAMI (con plata, con Fede) |
| ISSUEs nuevos | ISSUE-080 (caballerizas: sin aviso de parecidos, sin guía para completar el provisorio) |
| ramas sin mergear | `fix/spcs-r9-tanda-3` (esta), `feat/buscador-spc-autocompletado`, `fix/condicion-sexo-t8-t10-r9`, `fix/hora-ventanas-r9`, `fix/llamado-chips-fede` (las 4 últimas del 08/09) |
| docs | Fase 1 del relevamiento entregada (`2026-09-11_relevamiento-docs-fase-1.md`); fase 2 espera tu agrupación |
