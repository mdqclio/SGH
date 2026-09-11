# R9 — cuadro de las 72 inscripciones + PLAN "provisorios R9" (NO ejecutado)

**Fecha:** 2026-09-11 (noche) · **`main`:** `c64fdc3` (merge `--no-ff` de `fix/merge-carosueno`, pusheado) · **Branch del plan:** `feat/provisorios-r9` @ `5f30fa3` (pusheada) · **SQL:** `migrations/propietarios_provisorios_r9.sql`
**Solo lectura** en este informe. Foto tomada a las ~21:40 UTC; Yesi sigue cargando, los números pueden moverse.

## 0. Guards

| guard | esperado | real |
|---|---|---|
| `pwd` | `/home/clio/dev/SGH` | ✅ |
| `spcs` | 201 | ✅ |
| ref | `unlhcuanfrtpatoipwve` | ✅ |
| `main` con CAROSUEÑO | `c64fdc3` | ✅ `git ls-remote origin main` = `c64fdc3` |

---

## 1. El cuadro — 72 inscripciones, todas `inscripto`

```json
{"total":72,"estados":{"inscripto":72},"con_prop":56,"con_prop_provisorio":38,"cab_sin_titular":8,"cab_con_titular_pero_prop_null":0,"sin_cab":8,"sin_jockey":20,"sin_entrenador":6,"cab_multi_titular":0}
```

| grupo | n | qué significa | ¿problema para el domingo? |
|---|---|---|---|
| **con `propietario_id` derivado** | **56** | la caballeriza tiene titular activo y el trigger lo copió | no. De las 56, **38 derivan a un provisorio** de R8 (o EL DON JORGE hoy) y 18 a un titular real — los provisorios liquidan igual, se completan al cobrar |
| **con caballeriza pero SIN responsable** | **8** | 7 caballerizas con **0** filas en `caballeriza_responsables` → nada de dónde derivar | **sí: es el caso de R8.** Plan §3 |
| **sin caballeriza asignada** | **8** | los 8 SPC dados de alta hoy; Yesi todavía no les puso stud | depende: al asignarla, si esa caballeriza tiene titular deriva sola; si no, cae en el grupo de arriba. El SQL del plan es data-driven y los agarra el lunes |
| con caballeriza con titular **y aun así NULL** | 0 | sería un trigger que no corrió | no |
| caballerizas con **más de un** titular activo | 0 | el `LIMIT 1` del trigger elegiría al azar | no |
| fuera del gate de edad / sexo | **0** | `fn_edad_reglamentaria(fecha R9, nac)` vs `edad_minima/maxima` y `condicion_sexo` de los 11 turnos | no — los 72 cierran con su turno (incluye T6 = sólo 5 y T9 = 4+) |
| sin jockey | 20 | pre-ratificación es normal; la ratificación **exige** `jockey_titular_id` (`ratificacion.html`, ESTADO.md:224) y el gate de montas frena la oficialización | no para hoy; Yesi lo carga hasta el lunes |
| sin entrenador | 6 | DESERT OF DUBAI T1, NIÑO OCEANICO T4, EL RISKO T7, THE BEAST PARTY T9, INDIANA MARO T10, GOIADORA T11 — todos altas de hoy, sin stud aún | no bloquea la liquidación del propietario; sí deja sin incentivo al entrenador (10k/caballo) si corre sin entrenador cargado. Yesi los completa con la caballeriza |
| en doble categoría | 10 (BABY PARADISE, GRILLADA RYE, IDALIA MARO, KRISTALINA, LATIN PRESUMIDA, LE BATEAU, LOCA DUBAI, LOGUACIOUS, OLA DOCTOR, YOOKY) | anotan en 2 turnos, se resuelve el lunes (GOTCHA #69) | no |

56 + 8 + 8 = 72. **No hay "otro problema"** fuera de esas tres columnas: sexo, edad, doble titular, trigger — todo limpio.

### Los 8 sin caballeriza
```json
[{"t":3,"spc":"MARIA CATULENGA","entrenador":"TAVAGNUTTI"},{"t":4,"spc":"NIÑO OCEANICO","entrenador":null},{"t":7,"spc":"EL RISKO","entrenador":null},{"t":7,"spc":"ATOMIZADOR","entrenador":"MARTIN"},{"t":9,"spc":"THE BEAST PARTY","entrenador":null},{"t":10,"spc":"INDIANA MARO","entrenador":null},{"t":10,"spc":"ABARAJALA","entrenador":"MONGAY"},{"t":11,"spc":"GOIADORA","entrenador":null}]
```
MARIA CATULENGA y NIÑO OCEANICO van a EL DON JORGE (LP), que ya tiene su provisorio → derivan solas al asignar.

### Los 8 con caballeriza sin titular (7 caballerizas)
```json
[{"t":2,"cab":"2 DE ABRIL MAIPU","spc":"DEL CAMPEON","cab_id":"b562b75e-…","n_resp_any":0},{"t":2,"cab":"Abuelo Calin","spc":"ALHENA","cab_id":"7f7cee40-…","n_resp_any":0},{"t":2,"cab":"HARAS EL ORIGEN","spc":"DOCTORA MIA","cab_id":"e664ce7c-…","n_resp_any":0},{"t":4,"cab":"LA COLONIA","spc":"TOY BOY","cab_id":"559b97a6-…","n_resp_any":0},{"t":7,"cab":"LOS 6 CORAZONES","spc":"SEMBRADOR CHUCK","cab_id":"a9da0600-…","n_resp_any":0},{"t":4,"cab":"MONTE DEL TORDILLO","spc":"KRISTALINA","cab_id":"01cbb031-…","n_resp_any":0},{"t":10,"cab":"MONTE DEL TORDILLO","spc":"KRISTALINA","cab_id":"01cbb031-…","n_resp_any":0},{"t":1,"cab":"SAICA","spc":"SI TIN","cab_id":"58b52430-…","n_resp_any":0}]
```

Y su historia (todas ya corrieron sin dueño):

| caballeriza | `hipodromo_patente` | `notas` | SPC en ficha | inscripciones sin propietario, por reunión | propietario homónimo |
|---|---|---|---|---|---|
| 2 DE ABRIL MAIPU | NULL | Alta para inscripciones reunión 2026-06-20 (planilla Yesica) | 1 | R6 1 · **R9 1** | ninguno |
| Abuelo Calin | DOL | — | 1 | R6 1 · **R9 1** | ninguno |
| HARAS EL ORIGEN | NULL | Alta … 2026-06-20 | 3 | R6 3 · **R8 4** · **R9 1** | ninguno |
| LA COLONIA | NULL | Alta … 2026-06-20 | 1 | R6 1 · **R9 1** | ninguno |
| LOS 6 CORAZONES | NULL | Alta … 2026-06-20 | 1 | R6 1 · **R9 1** | ninguno |
| MONTE DEL TORDILLO | NULL | Alta … 2026-06-20 | 1 | R6 1 · **R9 2** | ninguno |
| SAICA | DOL | — | 1 | **R8 1** · **R9 1** | ninguno |

Cinco son altas de la planilla de R6 (20/06) que nunca recibieron titular; HARAS EL ORIGEN y SAICA ya pasaron por R8 sin dueño y **no entraron en la tanda de los 40** (**sin verificar** por qué: el `falta` del runbook filtraba `i.estado='ratificado'`; probablemente sus inscripciones de R8 no estaban ratificadas en ese momento, o eran forfait).

---

## 2. Por qué esto es "lo de R8"

`liquidaciones-engine.js` / `generarLiquidaciones` arma las líneas del propietario a partir de `inscripciones.propietario_id`. NULL → no hay actor → **no se genera** la línea de premio del propietario (70 % del premio del puesto) ni el bono 6-8 (100 % propietario). GOTCHA #47. En R8 eso dejó plata sin asignar que se regularizó a mano (tu cifra: $6,58 M; no la verifiqué). Con 8 caballos en esa situación —entre ellos KRISTALINA en dos turnos y SI TIN en T1— si alguno se ubica el domingo, su dueño no aparece en la liquidación.

La solución ya está decidida (Fede, 15/08) y ya la aplicamos hoy para EL DON JORGE: **propietario provisorio con el nombre de la caballeriza**, sin documento, marca en `notas`, vínculo `rol propietario` activo. Se completa cuando alguien viene a cobrar (como pasó hoy con LOS URONES).

---

## 3. El plan — un solo SQL para todas, data-driven

`migrations/propietarios_provisorios_r9.sql`. Es el `WITH falta … nuevos … INSERT responsables` del runbook de R8 (§B4) + la re-derivación (§B6) **acotada a R9**, con la lista calculada al ejecutar en vez de por ids:

```
falta = caballerizas de Dolores con ≥1 inscripción en R9 con propietario_id NULL
        y SIN responsable rol='propietario' activo
```

| paso | qué | esperado hoy | idempotencia |
|---|---|---|---|
| 0.a–0.d | pre-chequeos: la lista, 0 inscripciones con titular y NULL, 0 homónimos, conteos | 7 cab / 8 inscr · 0 · 0 · 264 / 40 / 263 / 16 | — |
| 1 | `INSERT propietarios` (persona, nombre = caballeriza, sin doc, `notas 'provisorio R9 14/09'`) | 7 | no inserta si ya hay un provisorio con ese nombre en el club |
| 2 | `INSERT caballeriza_responsables` (rol propietario, activo, nombre = caballeriza, `documento_tipo 'DNI'`) | 7 | sólo para las de `falta` (que por definición no tienen titular) |
| 3 | `UPDATE inscripciones SET propietario_id` desde el titular activo, **sólo R9**, sólo `propietario_id IS NULL` | 8 | |
| verif. | 0 inscripciones de R9 con caballeriza y sin propietario · 0 caballerizas con >1 titular activo · lista de nuevos con sus caballos · conteos 271 / 47 / 270 · `liquidaciones`/`liquidacion_detalle` sin cambio | | |

Formato de los provisorios: **idéntico a los 40 de R8 y a EL DON JORGE** (medido, no supuesto): `tipo 'persona'`, `documento_tipo`/`documento_nro` NULL, `activo`, `estado 'activo'`, `club_id` Dolores; responsable con `nombre` = caballeriza, `apellido` NULL, `documento_tipo 'DNI'`, sin `profesional_id`. Marca `'provisorio R9 DD/MM'` con la fecha real de ejecución (aparece 6 veces en el archivo; es un literal porque `apply_migration` no soporta `\set`).

**Por qué data-driven y por qué el lunes**: hoy son 7. Cuando Yesi asigne caballeriza a los 8 SPC nuevos, alguna puede tampoco tener titular (ABARAJALA con MONGAY, ATOMIZADOR con MARTIN — **sin verificar** qué stud tienen). Corrido **el lunes 14/09 después de la ratificación**, el SQL agarra exactamente las caballerizas con inscripciones definitivas, sin listas a mano. Si preferís correrlo hoy para no depender del lunes, funciona igual — y se puede volver a correr el lunes (idempotente) para las que se sumen.

**Lo que NO hace**: no re-deriva las inscripciones de R6 (9) ni de R8 (5) de estas mismas caballerizas. R8 ya está saldada, R6 liquidada sin líneas de propietario; tocar eso no genera plata pero cambia historial de reuniones cerradas. Queda como bloque §4 comentado, decisión aparte (el mismo criterio que aplicaste en CAROSUEÑO con R6 diría que sí; lo dejo a tu OK explícito).

**Rollback** al pie: `UPDATE inscripciones … = NULL` para R9 por marca → `DELETE responsables` por marca → `DELETE propietarios` por marca con guardas de liquidaciones/recibos. Seguro sólo antes de liquidar R9.

---

## 4. Después del SQL, para el domingo

- `r9_con_cab_sin_prop` = 0 y `r9_sin_prop` = sólo las que sigan sin caballeriza.
- Los 6 sin entrenador y 20 sin jockey los completa Yesi antes de ratificar (el gate de jockey está en la ratificación; el de montas en la oficialización).
- Provisorios totales: 40 + 1 (EL DON JORGE) + 7 = **48**, menos el completado hoy (TRUPPA) = 47 con marca `provisorio R%`.

---

## 5. `migrations/propietarios_provisorios_r9.sql` — contenido completo

```sql
-- ============================================================
-- propietarios_provisorios_r9.sql — propietario PROVISORIO para toda caballeriza con inscripción en R9 y sin titular
-- ============================================================
-- ⏳ PROPUESTA — NO EJECUTADA. Espera gate de Leo.
--
-- Medido el 11/09/2026 (docs/diagnosticos/2026-09-11_r9-cuadro-72-y-plan-provisorios.md):
--   R9 = 72 inscripciones · 56 con propietario_id · 8 con caballeriza SIN ningún responsable → propietario_id NULL
--   · 8 sin caballeriza todavía (los 8 SPC dados de alta hoy; Yesi las asigna).
--   Las 7 caballerizas sin responsable: 2 DE ABRIL MAIPU, Abuelo Calin, HARAS EL ORIGEN, LA COLONIA,
--   LOS 6 CORAZONES, MONTE DEL TORDILLO (×2), SAICA. Ninguna tiene un propietario homónimo en el club.
--
-- Es el caso de R8 (docs/RUNBOOK_R8_PROVISORIOS.md §B4-B6) en R9: sin dueño no se liquida el premio del
-- propietario ni el bono 6-8 (GOTCHA #47). Criterio de Fede (15/08): propietario provisorio con el nombre
-- de la caballeriza, sin documento, marca en notas; se completa cuando alguien viene a cobrar.
-- Mismo formato que los 40 de R8 y que EL DON JORGE (LP) (11/09):
--   propietarios:             club_id, tipo 'persona', nombre = caballeriza, activo, 'activo', notas 'provisorio R9 <fecha>'
--   caballeriza_responsables: rol 'propietario', activo, nombre = caballeriza, documento_tipo 'DNI', sin nro, sin profesional
--
-- DATA-DRIVEN, no por ids: la lista se calcula al ejecutar. Así, si Yesi asigna hoy las 8 caballerizas que
-- faltan y alguna tampoco tiene titular, entra sola. Por eso conviene correrlo el LUNES 14/09 después de la
-- ratificación: entran sólo caballerizas con inscripciones definitivas.
-- Idempotente: no crea un segundo provisorio si ya hay uno con ese nombre y marca; no crea responsable si la
-- caballeriza ya tiene titular activo.
-- Re-derivación (§3): sólo inscripciones de R9. Las de R6/R8 de estas mismas caballerizas también están en
-- NULL (R6: 9, R8: 5 — ver informe) y NO se tocan acá: R8 ya está saldada y R6 liquidada sin líneas de
-- propietario. Es decisión aparte (bloque §4, comentado).
-- ============================================================

-- MARCA: 'provisorio R9 14/09' — ajustar a la fecha real de ejecución (formato 'provisorio R<n> DD/MM', como 'provisorio R8 15/08').
-- Aparece 5 veces abajo; reemplazar las 5 si cambia.

-- ------------------------------------------------------------
-- 0. Pre-chequeos (fuera de la tx)
-- ------------------------------------------------------------

-- 0.a  La lista que va a entrar. Anotar N (el 11/09: 7 caballerizas / 8 inscripciones).
SELECT c.id AS cab_id, c.nombre, c.hipodromo_patente,
       count(i.id) AS inscr_r9_sin_prop,
       string_agg(s.nombre || ' T' || ca.numero_turno, ', ' ORDER BY ca.numero_turno) AS caballos
FROM caballerizas c
JOIN inscripciones i ON i.caballeriza_id = c.id AND i.propietario_id IS NULL
JOIN carreras ca ON ca.id = i.carrera_id AND ca.reunion_id = 'cafa37d6-89f4-45cb-a0d9-835bc27407e9'
JOIN spcs s ON s.id = i.spc_id
WHERE c.club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c'
  AND NOT EXISTS (SELECT 1 FROM caballeriza_responsables r WHERE r.caballeriza_id = c.id AND r.rol = 'propietario' AND r.activo)
GROUP BY c.id, c.nombre, c.hipodromo_patente
ORDER BY c.nombre;

-- 0.b  Inscripciones de R9 con caballeriza que SÍ tiene titular y aun así propietario_id NULL: tiene que dar 0.
--      (si da algo, el trigger no corrió — resolver antes, no es este caso)
SELECT count(*) FROM inscripciones i JOIN carreras ca ON ca.id = i.carrera_id
WHERE ca.reunion_id = 'cafa37d6-89f4-45cb-a0d9-835bc27407e9' AND i.caballeriza_id IS NOT NULL AND i.propietario_id IS NULL
  AND EXISTS (SELECT 1 FROM caballeriza_responsables r WHERE r.caballeriza_id = i.caballeriza_id AND r.rol = 'propietario' AND r.activo);

-- 0.c  Homónimos: propietarios del club con el nombre de alguna de esas caballerizas. Tiene que dar 0
--      (el 11/09 dio 0). Si da algo, es un titular real ya cargado → vincularlo, no crear provisorio.
SELECT p.id, p.nombre, p.documento_nro, p.notas FROM propietarios p
WHERE p.club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c'
  AND upper(btrim(p.nombre)) IN (
    SELECT upper(btrim(c.nombre)) FROM caballerizas c
    JOIN inscripciones i ON i.caballeriza_id = c.id AND i.propietario_id IS NULL
    JOIN carreras ca ON ca.id = i.carrera_id AND ca.reunion_id = 'cafa37d6-89f4-45cb-a0d9-835bc27407e9'
    WHERE NOT EXISTS (SELECT 1 FROM caballeriza_responsables r WHERE r.caballeriza_id = c.id AND r.rol = 'propietario' AND r.activo));

-- 0.d  Conteos: anotar.
SELECT (SELECT count(*) FROM propietarios) AS propietarios,
       (SELECT count(*) FROM propietarios WHERE notas LIKE 'provisorio R%') AS provisorios,
       (SELECT count(*) FROM caballeriza_responsables) AS responsables,
       (SELECT count(*) FROM inscripciones i JOIN carreras ca ON ca.id = i.carrera_id WHERE ca.reunion_id = 'cafa37d6-89f4-45cb-a0d9-835bc27407e9' AND i.propietario_id IS NULL) AS r9_sin_prop;

BEGIN;

-- ------------------------------------------------------------
-- 1 + 2. Provisorios + vínculos (una sola sentencia, forma del runbook de R8 §B4)
-- ------------------------------------------------------------
WITH falta AS (
  SELECT DISTINCT c.id AS cab_id, c.club_id, c.nombre
  FROM caballerizas c
  JOIN inscripciones i ON i.caballeriza_id = c.id AND i.propietario_id IS NULL
  JOIN carreras ca ON ca.id = i.carrera_id AND ca.reunion_id = 'cafa37d6-89f4-45cb-a0d9-835bc27407e9'
  WHERE c.club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c'
    AND NOT EXISTS (SELECT 1 FROM caballeriza_responsables r WHERE r.caballeriza_id = c.id AND r.rol = 'propietario' AND r.activo)
),
nuevos AS (
  INSERT INTO propietarios (club_id, tipo, nombre, activo, estado, notas)
  SELECT f.club_id, 'persona', f.nombre, true, 'activo', 'provisorio R9 14/09'
  FROM falta f
  WHERE NOT EXISTS (
    SELECT 1 FROM propietarios p
    WHERE p.club_id = f.club_id AND upper(btrim(p.nombre)) = upper(btrim(f.nombre)) AND p.notas LIKE 'provisorio R%'
  )
  RETURNING id, club_id, nombre
)
INSERT INTO caballeriza_responsables (caballeriza_id, propietario_id, rol, activo, nombre, documento_tipo)
SELECT f.cab_id, COALESCE(n.id, pe.id), 'propietario', true, f.nombre, 'DNI'
FROM falta f
LEFT JOIN nuevos n ON n.club_id = f.club_id AND upper(btrim(n.nombre)) = upper(btrim(f.nombre))
LEFT JOIN LATERAL (
  SELECT p.id FROM propietarios p
  WHERE p.club_id = f.club_id AND upper(btrim(p.nombre)) = upper(btrim(f.nombre)) AND p.notas LIKE 'provisorio R%'
  ORDER BY p.created_at, p.id LIMIT 1
) pe ON true
WHERE COALESCE(n.id, pe.id) IS NOT NULL;
-- Esperado: N filas (una por caballeriza de 0.a).

-- ------------------------------------------------------------
-- 3. Re-derivación en R9 (runbook §B6, acotado a R9)
-- ------------------------------------------------------------
UPDATE inscripciones i
SET propietario_id = sub.propietario_id
FROM (
  SELECT DISTINCT ON (cr.caballeriza_id) cr.caballeriza_id, cr.propietario_id
  FROM caballeriza_responsables cr
  WHERE cr.rol = 'propietario' AND cr.activo = true AND cr.propietario_id IS NOT NULL
  ORDER BY cr.caballeriza_id, cr.created_at NULLS LAST, cr.id
) sub
WHERE sub.caballeriza_id = i.caballeriza_id
  AND i.propietario_id IS NULL
  AND i.carrera_id IN (SELECT id FROM carreras WHERE reunion_id = 'cafa37d6-89f4-45cb-a0d9-835bc27407e9');
-- Esperado: = inscr_r9_sin_prop de 0.a (el 11/09: 8).

-- ------------------------------------------------------------
-- Verificación ANTES del COMMIT
-- ------------------------------------------------------------
-- 0: ninguna inscripción de R9 con caballeriza y sin propietario.
SELECT count(*) AS r9_con_cab_sin_prop FROM inscripciones i JOIN carreras ca ON ca.id = i.carrera_id
WHERE ca.reunion_id = 'cafa37d6-89f4-45cb-a0d9-835bc27407e9' AND i.caballeriza_id IS NOT NULL AND i.propietario_id IS NULL;

-- 0: ninguna caballeriza con más de un titular activo (el LIMIT 1 del trigger elegiría al azar).
SELECT cr.caballeriza_id, count(*) FROM caballeriza_responsables cr
WHERE cr.rol = 'propietario' AND cr.activo GROUP BY 1 HAVING count(*) > 1;

-- Los nuevos, con sus caballos de R9.
SELECT p.nombre, p.notas, c.nombre AS cab, string_agg(s.nombre || ' T' || ca.numero_turno, ', ') AS caballos_r9
FROM propietarios p
JOIN caballeriza_responsables cr ON cr.propietario_id = p.id
JOIN caballerizas c ON c.id = cr.caballeriza_id
JOIN inscripciones i ON i.caballeriza_id = c.id AND i.propietario_id = p.id
JOIN carreras ca ON ca.id = i.carrera_id AND ca.reunion_id = 'cafa37d6-89f4-45cb-a0d9-835bc27407e9'
JOIN spcs s ON s.id = i.spc_id
WHERE p.notas = 'provisorio R9 14/09'
GROUP BY p.nombre, p.notas, c.nombre ORDER BY p.nombre;

-- Conteos: propietarios +N, provisorios +N, responsables +N, r9_sin_prop = sólo las sin caballeriza.
SELECT (SELECT count(*) FROM propietarios) AS propietarios,
       (SELECT count(*) FROM propietarios WHERE notas LIKE 'provisorio R%') AS provisorios,
       (SELECT count(*) FROM caballeriza_responsables) AS responsables,
       (SELECT count(*) FROM inscripciones i JOIN carreras ca ON ca.id = i.carrera_id WHERE ca.reunion_id = 'cafa37d6-89f4-45cb-a0d9-835bc27407e9' AND i.propietario_id IS NULL) AS r9_sin_prop,
       (SELECT count(*) FROM liquidaciones) AS liq, (SELECT count(*) FROM liquidacion_detalle) AS det;   -- liq/det sin cambio

COMMIT;

-- ------------------------------------------------------------
-- 4. (OPCIONAL, decisión aparte — NO incluido en la tx) Re-derivar R6 y R8 de las mismas caballerizas
-- ------------------------------------------------------------
-- Mismo UPDATE de §3 cambiando el reunion_id por el de R6 ('…') y R8 ('7b6e003e-22e2-4629-bf55-f18560b1260f').
-- No genera líneas de liquidación (no re-liquida nada); sólo deja el historial con dueño. Si alguna vez se
-- re-liquida R6/R8, esos provisorios cobrarían lo suyo. El 11/09: R6 9 inscripciones, R8 5.

-- ============================================================
-- ROLLBACK
-- ============================================================
-- BEGIN;
-- UPDATE inscripciones i SET propietario_id = NULL
--   WHERE i.propietario_id IN (SELECT id FROM propietarios WHERE notas = 'provisorio R9 14/09')
--     AND i.carrera_id IN (SELECT id FROM carreras WHERE reunion_id = 'cafa37d6-89f4-45cb-a0d9-835bc27407e9');
-- DELETE FROM caballeriza_responsables WHERE propietario_id IN (SELECT id FROM propietarios WHERE notas = 'provisorio R9 14/09');
-- DELETE FROM propietarios WHERE notas = 'provisorio R9 14/09'
--   AND NOT EXISTS (SELECT 1 FROM liquidaciones l WHERE l.propietario_id = propietarios.id)
--   AND NOT EXISTS (SELECT 1 FROM recibos r WHERE r.propietario_id = propietarios.id);
-- COMMIT;
-- (Seguro sólo antes de liquidar R9. Después, los provisorios tienen plata y se completan, no se borran.)
```

---

## 6. Queries de respaldo (hoy, solo lectura)

```sql
with r9 as (
 select i.id, ca.numero_turno t, s.nombre spc, s.sexo, s.fecha_nacimiento, i.estado, i.caballeriza_id, cb.nombre cab, i.propietario_id, p.nombre prop, p.notas prop_notas, i.entrenador_id, i.jockey_titular_id,
  (select count(*) from caballeriza_responsables r where r.caballeriza_id=i.caballeriza_id and r.rol='propietario' and r.activo) n_tit,
  (select count(*) from caballeriza_responsables r where r.caballeriza_id=i.caballeriza_id) n_resp_any,
  ca.edad_minima_anos emin, ca.edad_maxima_anos emax, ca.condicion_sexo csexo,
  fn_edad_reglamentaria(ca.reunion_id_fecha, s.fecha_nacimiento) edad
 from inscripciones i join (select c.*, r.fecha reunion_id_fecha from carreras c join reuniones r on r.id=c.reunion_id) ca on ca.id=i.carrera_id join spcs s on s.id=i.spc_id left join caballerizas cb on cb.id=i.caballeriza_id left join propietarios p on p.id=i.propietario_id
 where ca.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9')
select 'resumen' k, (select jsonb_build_object('total',count(*),'con_prop',count(*) filter (where propietario_id is not null),'con_prop_provisorio',count(*) filter (where prop_notas like '%provisorio%'),'cab_sin_titular',count(*) filter (where caballeriza_id is not null and n_tit=0),'cab_con_titular_pero_prop_null',count(*) filter (where caballeriza_id is not null and n_tit>0 and propietario_id is null),'sin_cab',count(*) filter (where caballeriza_id is null),'sin_entrenador',count(*) filter (where entrenador_id is null),'sin_jockey',count(*) filter (where jockey_titular_id is null),'cab_multi_titular',count(*) filter (where n_tit>1),'estados',(select jsonb_object_agg(estado,n) from (select estado, count(*) n from r9 group by 1) e)) from r9) v
union all select 'gate_edad_sexo', coalesce((select jsonb_agg(jsonb_build_object('t',t,'spc',spc,'edad',edad,'emin',emin,'emax',emax,'sexo',sexo,'csexo',csexo) order by t) from r9 where edad < emin or (emax is not null and edad > emax) or (csexo='hembras' and sexo<>'hembra')), '[]')
union all select 'sin_cab', (select jsonb_agg(jsonb_build_object('t',t,'spc',spc,'entrenador',(select apellido from profesionales where id=r9.entrenador_id)) order by t) from r9 where caballeriza_id is null)
union all select 'cab_sin_titular', (select jsonb_agg(jsonb_build_object('t',t,'spc',spc,'cab',cab,'cab_id',caballeriza_id,'n_resp_any',n_resp_any) order by cab, t) from r9 where caballeriza_id is not null and n_tit=0)
union all select 'sin_jockey', coalesce((select jsonb_agg(jsonb_build_object('t',t,'spc',spc) order by t) from r9 where jockey_titular_id is null), '[]')
union all select 'sin_entrenador', coalesce((select jsonb_agg(jsonb_build_object('t',t,'spc',spc) order by t) from r9 where entrenador_id is null), '[]')
union all select 'multi_titular', coalesce((select jsonb_agg(distinct cab) from r9 where n_tit>1), '[]')
union all select 'dobles', (select jsonb_agg(jsonb_build_object('spc',spc,'turnos',ts)) from (select spc, string_agg(t::text, ',' order by t) ts from r9 group by spc having count(*)>1) d)
```
```json
[{"k":"resumen","v":{"total":72,"estados":{"inscripto":72},"sin_cab":8,"con_prop":56,"sin_jockey":20,"sin_entrenador":6,"cab_sin_titular":8,"cab_multi_titular":0,"con_prop_provisorio":38,"cab_con_titular_pero_prop_null":0}},
 {"k":"gate_edad_sexo","v":[]},
 {"k":"sin_cab","v":[…§1…]},
 {"k":"cab_sin_titular","v":[…§1…]},
 {"k":"sin_jockey","v":[{"t":1,"spc":"HERMANOSDEMIPATRIA"},{"t":1,"spc":"DESERT OF DUBAI"},{"t":1,"spc":"ETERNA DOCTORA"},{"t":2,"spc":"LOCA DUBAI"},{"t":3,"spc":"BAHIA ROMANA"},{"t":3,"spc":"LOCA DUBAI"},{"t":4,"spc":"KRISTALINA"},{"t":4,"spc":"NISTEL WIN"},{"t":4,"spc":"REY DE PILA"},{"t":4,"spc":"GRILLADA RYE"},{"t":6,"spc":"HALLOTOP"},{"t":7,"spc":"EL RISKO"},{"t":7,"spc":"SEMBRADOR CHUCK"},{"t":7,"spc":"SEÑOR MONCHI"},{"t":9,"spc":"QUERELLANTE"},{"t":9,"spc":"THE BEAST PARTY"},{"t":10,"spc":"GRILLADA RYE"},{"t":10,"spc":"KRISTALINA"},{"t":11,"spc":"INDIO VALIDO"},{"t":11,"spc":"GOIADORA"}]},
 {"k":"sin_entrenador","v":[{"t":1,"spc":"DESERT OF DUBAI"},{"t":4,"spc":"NIÑO OCEANICO"},{"t":7,"spc":"EL RISKO"},{"t":9,"spc":"THE BEAST PARTY"},{"t":10,"spc":"INDIANA MARO"},{"t":11,"spc":"GOIADORA"}]},
 {"k":"multi_titular","v":[]},
 {"k":"dobles","v":[{"spc":"BABY PARADISE","turnos":"10,11"},{"spc":"GRILLADA RYE","turnos":"4,10"},{"spc":"IDALIA MARO","turnos":"6,8"},{"spc":"KRISTALINA","turnos":"4,10"},{"spc":"LATIN PRESUMIDA","turnos":"7,8"},{"spc":"LE BATEAU","turnos":"7,9"},{"spc":"LOCA DUBAI","turnos":"2,3"},{"spc":"LOGUACIOUS","turnos":"4,10"},{"spc":"OLA DOCTOR","turnos":"2,3"},{"spc":"YOOKY","turnos":"7,8"}]}]
```
```sql
select c.nombre cab, c.id, c.hipodromo_patente hip, c.estado, c.notas,
 (select jsonb_agg(jsonb_build_object('id',p.id,'nombre',p.nombre,'doc',p.documento_nro,'notas',p.notas)) from propietarios p where p.club_id=c.club_id and upper(btrim(p.nombre))=upper(btrim(c.nombre))) prop_homonimo,
 (select count(*) from spcs s where s.caballeriza_id=c.id) n_spcs,
 (select jsonb_agg(jsonb_build_object('r',re.numero,'n',n)) from (select re2.numero, count(*) n from inscripciones i join carreras ca on ca.id=i.carrera_id join reuniones re2 on re2.id=ca.reunion_id where i.caballeriza_id=c.id and i.propietario_id is null group by 1) x(numero,n) join reuniones re on re.numero=x.numero and re.club_id=c.club_id) inscr_sin_prop_por_reunion
from caballerizas c where c.id in (…las 7…) order by c.nombre
```
```json
[{"cab":"2 DE ABRIL MAIPU","id":"b562b75e-f1f8-4e6a-8d68-cbfcb2c61d5e","hip":null,"estado":"activo","notas":"Alta para inscripciones reunión 2026-06-20 (planilla Yesica)","prop_homonimo":null,"n_spcs":1,"inscr_sin_prop_por_reunion":[{"n":1,"r":6},{"n":1,"r":9}]},
 {"cab":"Abuelo Calin","id":"7f7cee40-beed-42fb-807a-70c900259be5","hip":"DOL","estado":"activo","notas":null,"prop_homonimo":null,"n_spcs":1,"inscr_sin_prop_por_reunion":[{"n":1,"r":6},{"n":1,"r":9}]},
 {"cab":"HARAS EL ORIGEN","id":"e664ce7c-78dd-4d1d-904b-c25cf0f92b96","hip":null,"estado":"activo","notas":"Alta para inscripciones reunión 2026-06-20 (planilla Yesica)","prop_homonimo":null,"n_spcs":3,"inscr_sin_prop_por_reunion":[{"n":3,"r":6},{"n":4,"r":8},{"n":1,"r":9}]},
 {"cab":"LA COLONIA","id":"559b97a6-ac5a-4d73-a160-99f8b8872756","hip":null,"estado":"activo","notas":"Alta para inscripciones reunión 2026-06-20 (planilla Yesica)","prop_homonimo":null,"n_spcs":1,"inscr_sin_prop_por_reunion":[{"n":1,"r":6},{"n":1,"r":9}]},
 {"cab":"LOS 6 CORAZONES","id":"a9da0600-320f-4aa9-baac-1eba3e981d7e","hip":null,"estado":"activo","notas":"Alta para inscripciones reunión 2026-06-20 (planilla Yesica)","prop_homonimo":null,"n_spcs":1,"inscr_sin_prop_por_reunion":[{"n":1,"r":6},{"n":1,"r":9}]},
 {"cab":"MONTE DEL TORDILLO","id":"01cbb031-50cd-43ed-9665-5c5bc4e7f99f","hip":null,"estado":"activo","notas":"Alta para inscripciones reunión 2026-06-20 (planilla Yesica)","prop_homonimo":null,"n_spcs":1,"inscr_sin_prop_por_reunion":[{"n":1,"r":6},{"n":2,"r":9}]},
 {"cab":"SAICA","id":"58b52430-ebb8-4d79-966e-60403c5a9100","hip":"DOL","estado":"activo","notas":null,"prop_homonimo":null,"n_spcs":1,"inscr_sin_prop_por_reunion":[{"n":1,"r":8},{"n":1,"r":9}]}]
```
