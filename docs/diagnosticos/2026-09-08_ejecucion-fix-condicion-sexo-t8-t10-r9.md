# EJECUCIÓN — `condicion_sexo` de T8 y T10 de R9: `ambos` → `hembras`

**Fecha:** 2026-09-08, 15:53 AR (18:53 UTC)
**Estado:** **APLICADO EN PRODUCCIÓN.** 2 filas. Verificado. Sin rollback.
**Plan que se ejecutó:** `docs/diagnosticos/2026-09-08_plan-fix-condicion-sexo-t8-t10-r9.md`
(`6d391f5` en `reports`)
**Rama de trabajo:** `fix/condicion-sexo-t8-t10-r9` — commit **`0b726736cac872e5b75403dfec552522e5c7ff0a`**,
pusheada a `origin`. **No mergeada a `main`.**
**SHA de `main` del que sale la rama:** `eface80078b99a56c9ae3160053cd8fd0c425d31`

## Guards

```
$ pwd
/home/clio/dev/SGH

SELECT count(*) FROM spcs;   →  181     ✔
ref del proyecto             →  unlhcuanfrtpatoipwve   ✔
```
```sql
SELECT (SELECT count(*) FROM spcs) AS spcs_count, current_database() AS db;
```
```json
[{"spcs_count":181,"db":"postgres"}]
```

---

## Resumen

| | |
|---|---|
| Filas tocadas | **2** — T8 y T10 de R9 de Dolores |
| Filas esperadas | 2 ✔ (no hubo que parar) |
| Momento | `2026-09-08 18:53:34.421133+00` |
| Entradas de auditoría | 2 (`UPDATE`, `ambos` → `hembras`) |
| Otros turnos de R9 | 9, sin tocar |
| Otras reuniones / clubes | 0 afectados |
| Gate verificado | macho y castrado **rechazados** en T8 y T10; hembra **aceptada** |
| Probe | `tests/probe_condicion_sexo_r9.mjs` — **26 pass, 0 fail** |
| Rollback | no hizo falta; el `.sql` simétrico queda en `migrations/` |

---

## 1 · Pre-chequeo: la base seguía como en el plan

Antes de tocar nada se volvió a correr el snapshot, para confirmar que nadie se había anotado en
el ínterin.

```sql
SELECT c.numero_turno, c.id, c.condicion_sexo::text AS condicion_sexo,
       c.edad_minima_anos, c.edad_maxima_anos, c.condicion_handicap, c.estado,
       (SELECT count(*) FROM inscripciones i WHERE i.carrera_id = c.id) AS inscriptos
FROM carreras c
WHERE c.reunion_id = 'cafa37d6-89f4-45cb-a0d9-835bc27407e9'
ORDER BY c.numero_turno;
```
```json
[{"numero_turno":1,"id":"c037b139-b8b5-46d7-900e-cbc7a01bd643","condicion_sexo":"ambos","edad_minima_anos":3,"edad_maxima_anos":3,"condicion_handicap":"Todo caballo 3 años perdedor.","estado":"abierta","inscriptos":2},
 {"numero_turno":2,"id":"2d4016ad-460a-44c9-9b2d-d710a510edee","condicion_sexo":"ambos","edad_minima_anos":4,"edad_maxima_anos":4,"condicion_handicap":"Todo caballo 4 años perdedor.","estado":"abierta","inscriptos":0},
 {"numero_turno":3,"id":"7250cda2-4b1b-40f5-80ed-54121745241b","condicion_sexo":"ambos","edad_minima_anos":4,"edad_maxima_anos":4,"condicion_handicap":"Todo caballo 4 años perdedor.","estado":"abierta","inscriptos":0},
 {"numero_turno":4,"id":"fbf0de67-875f-4dbd-834c-60503d2d6f2f","condicion_sexo":"ambos","edad_minima_anos":5,"edad_maxima_anos":10,"condicion_handicap":"Todo caballo 5 años y + edad perdedor.","estado":"abierta","inscriptos":0},
 {"numero_turno":5,"id":"9733113c-8c80-40eb-80b4-6f741abf125c","condicion_sexo":"ambos","edad_minima_anos":5,"edad_maxima_anos":10,"condicion_handicap":"Todo caballo 3 y 4 años ganador de 1 o 2 carreras.","estado":"abierta","inscriptos":0},
 {"numero_turno":6,"id":"7da3fa1c-a32a-42dc-ad2f-6b10e86cba22","condicion_sexo":"ambos","edad_minima_anos":5,"edad_maxima_anos":10,"condicion_handicap":"Todo caballo de 5 años ganador de 1 o 2 carreras.","estado":"abierta","inscriptos":0},
 {"numero_turno":7,"id":"3b553ea4-1052-4411-933b-156e6676dfc0","condicion_sexo":"ambos","edad_minima_anos":6,"edad_maxima_anos":10,"condicion_handicap":"Todo caballo 6 años y + edad ganadores de 1 o 2 carreras.","estado":"abierta","inscriptos":0},
 {"numero_turno":8,"id":"bae8008f-87fc-479e-a416-27502c7489b3","condicion_sexo":"ambos","edad_minima_anos":5,"edad_maxima_anos":null,"condicion_handicap":"Yeguas de 5 años y + edad ganadoras de 1 o 2 carreras.","estado":"abierta","inscriptos":0},
 {"numero_turno":9,"id":"5cd5d00e-c844-467d-925f-83b378863af5","condicion_sexo":"ambos","edad_minima_anos":5,"edad_maxima_anos":10,"condicion_handicap":"Especial Todo caballo 4 años y + edad ganador de 3 o mas carreras.","estado":"abierta","inscriptos":0},
 {"numero_turno":10,"id":"099b050d-b7e5-412c-b789-55dae7d5cd13","condicion_sexo":"ambos","edad_minima_anos":5,"edad_maxima_anos":10,"condicion_handicap":"Yeguas 5 años y + edad perdedoras.","estado":"abierta","inscriptos":0},
 {"numero_turno":11,"id":"0bf74c72-9300-4406-8949-d81705da0c23","condicion_sexo":"ambos","edad_minima_anos":5,"edad_maxima_anos":5,"condicion_handicap":"Todo caballo 5 años y + edad perdedor.","estado":"abierta","inscriptos":1}]
```

```sql
SELECT condicion_sexo::text AS valor, count(*) AS n FROM carreras GROUP BY 1 ORDER BY 2 DESC;
```
```json
[{"valor":"ambos","n":45},{"valor":"hembras","n":3},{"valor":"machos","n":1}]
```

Idéntico al plan. **T8 y T10 seguían en cero inscriptos.** Adelante.

---

## 2 · El UPDATE

Se corrió el contenido de `migrations/fix_condicion_sexo_r9_t8_t10.sql` tal cual, en un solo
envío: `BEGIN` · CTE con `RETURNING` · bloque `DO $guard$` · `COMMIT`.

```sql
BEGIN;

WITH objetivo AS (
  SELECT c.id, c.numero_turno, c.condicion_sexo AS antes
    FROM carreras c
    JOIN reuniones r ON r.id = c.reunion_id
   WHERE r.club_id      = '0649e9c5-9e87-4aad-842f-101458e6b33c'
     AND r.numero       = 9
     AND c.numero_turno IN (8, 10)
     AND c.condicion_sexo = 'ambos'
),
upd AS (
  UPDATE carreras c
     SET condicion_sexo = 'hembras'
    FROM objetivo o
   WHERE c.id = o.id
  RETURNING c.id,
            c.numero_turno,
            o.antes::text            AS antes,
            c.condicion_sexo::text   AS despues,
            c.condicion_handicap
)
SELECT * FROM upd ORDER BY numero_turno;

DO $guard$
DECLARE
  v_hembras INT; v_ambos INT; v_fuera INT;
BEGIN
  SELECT count(*) FILTER (WHERE c.condicion_sexo = 'hembras'),
         count(*) FILTER (WHERE c.condicion_sexo = 'ambos')
    INTO v_hembras, v_ambos
    FROM carreras c JOIN reuniones r ON r.id = c.reunion_id
   WHERE r.club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c' AND r.numero = 9;

  IF v_hembras <> 2 OR v_ambos <> 9 THEN
    RAISE EXCEPTION 'R9 quedó en % hembras / % ambos; esperaba 2 / 9. Abortado.', v_hembras, v_ambos;
  END IF;

  SELECT count(*) INTO v_fuera
    FROM carreras c JOIN reuniones r ON r.id = c.reunion_id
   WHERE r.club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c' AND r.numero = 9
     AND c.condicion_sexo = 'hembras' AND c.numero_turno NOT IN (8, 10);
  IF v_fuera <> 0 THEN
    RAISE EXCEPTION 'Hay % turnos de R9 en hembras fuera de T8/T10. Abortado.', v_fuera;
  END IF;

  SELECT count(*) INTO v_fuera
    FROM carreras c JOIN reuniones r ON r.id = c.reunion_id
   WHERE NOT (r.club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c' AND r.numero = 9)
     AND c.condicion_sexo <> 'ambos';
  IF v_fuera <> 4 THEN
    RAISE EXCEPTION 'Fuera de R9 hay % carreras con sexo restringido; esperaba 4. Abortado.', v_fuera;
  END IF;
END
$guard$;

COMMIT;
```

**Salida cruda del `RETURNING`:**

```json
[{"id":"bae8008f-87fc-479e-a416-27502c7489b3","numero_turno":8,"antes":"ambos","despues":"hembras","condicion_handicap":"Yeguas de 5 años y + edad ganadoras de 1 o 2 carreras."},
 {"id":"099b050d-b7e5-412c-b789-55dae7d5cd13","numero_turno":10,"antes":"ambos","despues":"hembras","condicion_handicap":"Yeguas 5 años y + edad perdedoras."}]
```

**Exactamente 2 filas, las dos esperadas.** El bloque `DO $guard$` no levantó excepción, así que
el `COMMIT` pasó. No hubo que parar.

---

## 3 · Verificación

### 3.1 — Exactamente 2 filas ✔

Las dos del `RETURNING` de arriba: T8 (`bae8008f…`) y T10 (`099b050d…`), las dos de `ambos` a
`hembras`, las dos con el texto "Yeguas…".

### 3.2 — Los otros nueve turnos sin tocar ✔

```sql
SELECT c.numero_turno, c.id, c.condicion_sexo::text AS condicion_sexo,
       c.edad_minima_anos, c.edad_maxima_anos, c.condicion_handicap, c.condicion_adicional, c.estado,
       (SELECT count(*) FROM inscripciones i WHERE i.carrera_id = c.id) AS inscriptos
FROM carreras c
WHERE c.reunion_id = 'cafa37d6-89f4-45cb-a0d9-835bc27407e9'
ORDER BY c.numero_turno;
```
```json
[{"numero_turno":1,"id":"c037b139-b8b5-46d7-900e-cbc7a01bd643","condicion_sexo":"ambos","edad_minima_anos":3,"edad_maxima_anos":3,"condicion_handicap":"Todo caballo 3 años perdedor.","condicion_adicional":"Peso 57 kilos. Descargo 2 kilos a las hembras. Jockey aprendices sin descargo.","estado":"abierta","inscriptos":2},
 {"numero_turno":2,"id":"2d4016ad-460a-44c9-9b2d-d710a510edee","condicion_sexo":"ambos","edad_minima_anos":4,"edad_maxima_anos":4,"condicion_handicap":"Todo caballo 4 años perdedor.","condicion_adicional":"Peso 57 kilos. Descargo 2 kilos a las hembras. Jockey aprendices sin descargo.","estado":"abierta","inscriptos":0},
 {"numero_turno":3,"id":"7250cda2-4b1b-40f5-80ed-54121745241b","condicion_sexo":"ambos","edad_minima_anos":4,"edad_maxima_anos":4,"condicion_handicap":"Todo caballo 4 años perdedor.","condicion_adicional":"Peso 57 kilos. Descargo 2 kilos a las hembras. Jockey aprendices sin descargo.","estado":"abierta","inscriptos":0},
 {"numero_turno":4,"id":"fbf0de67-875f-4dbd-834c-60503d2d6f2f","condicion_sexo":"ambos","edad_minima_anos":5,"edad_maxima_anos":10,"condicion_handicap":"Todo caballo 5 años y + edad perdedor.","condicion_adicional":"Peso 57 kilos. Descargo 2 kilos a las hembras. Jockey aprendices sin descargo.","estado":"abierta","inscriptos":0},
 {"numero_turno":5,"id":"9733113c-8c80-40eb-80b4-6f741abf125c","condicion_sexo":"ambos","edad_minima_anos":5,"edad_maxima_anos":10,"condicion_handicap":"Todo caballo 3 y 4 años ganador de 1 o 2 carreras.","condicion_adicional":"Peso 57 kilos. Recargo de 2 kilos al ganador de 2 carreras. Descargo 2 kilos a las hembras. Jockey aprendices sin descargo.","estado":"abierta","inscriptos":0},
 {"numero_turno":6,"id":"7da3fa1c-a32a-42dc-ad2f-6b10e86cba22","condicion_sexo":"ambos","edad_minima_anos":5,"edad_maxima_anos":10,"condicion_handicap":"Todo caballo de 5 años ganador de 1 o 2 carreras.","condicion_adicional":"Peso 57 kilos. Recargo de 2 kilos al ganador de 2 carreras. Descargo 2 kilos a las hembras. Jockey aprendices sin descargo.","estado":"abierta","inscriptos":0},
 {"numero_turno":7,"id":"3b553ea4-1052-4411-933b-156e6676dfc0","condicion_sexo":"ambos","edad_minima_anos":6,"edad_maxima_anos":10,"condicion_handicap":"Todo caballo 6 años y + edad ganadores de 1 o 2 carreras.","condicion_adicional":"Peso 57 kilos. Recargo de 2 kilos al ganador de 2 carreras. Descargo 2 kilos a las hembras. Jockey aprendices sin descargo.","estado":"abierta","inscriptos":0},
 {"numero_turno":8,"id":"bae8008f-87fc-479e-a416-27502c7489b3","condicion_sexo":"hembras","edad_minima_anos":5,"edad_maxima_anos":null,"condicion_handicap":"Yeguas de 5 años y + edad ganadoras de 1 o 2 carreras.","condicion_adicional":"Peso 55 kilos. Recargo de 2 kilos a las ganadora de 2 carreras. Jockey aprendices sin descargo.","estado":"abierta","inscriptos":0},
 {"numero_turno":9,"id":"5cd5d00e-c844-467d-925f-83b378863af5","condicion_sexo":"ambos","edad_minima_anos":5,"edad_maxima_anos":10,"condicion_handicap":"Especial Todo caballo 4 años y + edad ganador de 3 o mas carreras.","condicion_adicional":"Peso 52 kilos al ganador de 2 carreras. Recargo de 2 kilos por carrera subsiguiente ganada. Jockey aprendices sin descargo.","estado":"abierta","inscriptos":0},
 {"numero_turno":10,"id":"099b050d-b7e5-412c-b789-55dae7d5cd13","condicion_sexo":"hembras","edad_minima_anos":5,"edad_maxima_anos":10,"condicion_handicap":"Yeguas 5 años y + edad perdedoras.","condicion_adicional":"Peso 55 kilos. Jockey aprendices con descargo.","estado":"abierta","inscriptos":0},
 {"numero_turno":11,"id":"0bf74c72-9300-4406-8949-d81705da0c23","condicion_sexo":"ambos","edad_minima_anos":5,"edad_maxima_anos":5,"condicion_handicap":"Todo caballo 5 años y + edad perdedor.","condicion_adicional":"Peso 57 kilos. Descargo 2 kilos a las hembras. Jockey aprendices con descargo.","estado":"abierta","inscriptos":1}]
```

Comparado con el snapshot de §1: **la única diferencia en las once filas es `condicion_sexo` en T8
y T10.** Edades, textos, `condicion_adicional`, estados e inscriptos, todo igual. T1 sigue con 2
inscriptos, T11 con 1.

### 3.3 — Ninguna otra reunión ni club afectado ✔

```sql
SELECT
 (SELECT count(*) FROM carreras) AS total_carreras,
 (SELECT count(*) FROM carreras WHERE reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9' AND condicion_sexo='ambos') AS r9_ambos,
 (SELECT count(*) FROM carreras WHERE reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9' AND condicion_sexo='hembras') AS r9_hembras,
 (SELECT count(*) FROM carreras c JOIN reuniones r ON r.id=c.reunion_id
   WHERE NOT (r.club_id='0649e9c5-9e87-4aad-842f-101458e6b33c' AND r.numero=9) AND c.condicion_sexo <> 'ambos') AS fuera_r9_restringidas;
```
```json
[{"total_carreras":49,"r9_ambos":9,"r9_hembras":2,"fuera_r9_restringidas":4}]
```

Esperado: 49 / 9 / 2 / 4. **Los cuatro números dan.**

```sql
SELECT condicion_sexo::text AS valor, count(*) AS n FROM carreras GROUP BY 1 ORDER BY 2 DESC;
```
```json
[{"valor":"ambos","n":43},{"valor":"hembras","n":5},{"valor":"machos","n":1}]
```

Antes: `ambos=45, hembras=3, machos=1`. Después: `ambos=43, hembras=5, machos=1`. **Dos filas
pasaron de una columna a la otra; el total sigue en 49.**

Las seis carreras con sexo restringido de toda la base:

```sql
SELECT r.numero AS reunion, r.club_id, c.numero_turno, c.condicion_sexo::text, c.condicion_handicap
FROM carreras c JOIN reuniones r ON r.id=c.reunion_id
WHERE c.condicion_sexo <> 'ambos'
ORDER BY r.numero, c.numero_turno;
```
```json
[{"reunion":6,"club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","numero_turno":3,"condicion_sexo":"hembras","condicion_handicap":"Yeguas de 3 y 4 años perdedoras."},
 {"reunion":7,"club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","numero_turno":2,"condicion_sexo":"hembras","condicion_handicap":"Yeguas 3 años perdedoras."},
 {"reunion":7,"club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","numero_turno":3,"condicion_sexo":"machos","condicion_handicap":"Caballos 4 años perdedores."},
 {"reunion":7,"club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","numero_turno":4,"condicion_sexo":"hembras","condicion_handicap":"Yeguas 4 años perdedoras."},
 {"reunion":9,"club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","numero_turno":8,"condicion_sexo":"hembras","condicion_handicap":"Yeguas de 5 años y + edad ganadoras de 1 o 2 carreras."},
 {"reunion":9,"club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","numero_turno":10,"condicion_sexo":"hembras","condicion_handicap":"Yeguas 5 años y + edad perdedoras."}]
```

Las cuatro históricas intactas, más las dos nuevas. **Todas de Dolores, ninguna de otro club.** Y
la regla del club queda visible de un vistazo: cinco dicen "Yeguas" → `hembras`; una dice
"Caballos" → `machos`.

### 3.4 — Las 2 entradas en auditoría ✔

```sql
SELECT id, tabla, registro_id, accion, club_id, usuario_id, created_at,
       datos_antes->>'condicion_sexo'   AS sexo_antes,
       datos_despues->>'condicion_sexo' AS sexo_despues,
       datos_antes->>'numero_turno'     AS turno
FROM auditoria
WHERE tabla='carreras'
  AND registro_id IN ('bae8008f-87fc-479e-a416-27502c7489b3','099b050d-b7e5-412c-b789-55dae7d5cd13')
  AND created_at > '2026-09-08'
ORDER BY created_at DESC;
```
```json
[{"id":"01016d51-fda6-4fec-8d3a-8fd5264b0af2","tabla":"carreras","registro_id":"099b050d-b7e5-412c-b789-55dae7d5cd13","accion":"UPDATE","club_id":null,"usuario_id":null,"created_at":"2026-09-08 18:53:34.421133+00","sexo_antes":"ambos","sexo_despues":"hembras","turno":"10"},
 {"id":"e5ef330d-85e1-4e14-b162-e9acfd922008","tabla":"carreras","registro_id":"bae8008f-87fc-479e-a416-27502c7489b3","accion":"UPDATE","club_id":null,"usuario_id":null,"created_at":"2026-09-08 18:53:34.421133+00","sexo_antes":"ambos","sexo_despues":"hembras","turno":"8"},
 {"id":"ec59feb2-1a5c-4cdc-af18-1aeae462a177","tabla":"carreras","registro_id":"099b050d-b7e5-412c-b789-55dae7d5cd13","accion":"UPDATE","club_id":null,"usuario_id":null,"created_at":"2026-09-08 02:09:18.214571+00","sexo_antes":"ambos","sexo_despues":"ambos","turno":"10"},
 {"id":"45e55e53-0d7a-4808-bb30-1d4040c4a11b","tabla":"carreras","registro_id":"bae8008f-87fc-479e-a416-27502c7489b3","accion":"UPDATE","club_id":null,"usuario_id":null,"created_at":"2026-09-08 02:09:18.214571+00","sexo_antes":"ambos","sexo_despues":"ambos","turno":"8"}]
```

Las **dos primeras son las de este fix** (`18:53:34`, `ambos` → `hembras`, turnos 8 y 10). Las dos
de `02:09:18` son de otra edición de hoy sobre esos mismos turnos que **no** tocó el sexo
(`ambos` → `ambos`): quedan en el listado porque el filtro es por `registro_id`, no por columna.

Conteos, contra el baseline del plan:

```sql
SELECT (SELECT count(*) FROM auditoria WHERE tabla='carreras') AS aud_carreras_total,
       (SELECT count(*) FROM auditoria WHERE tabla='carreras'
         AND registro_id IN ('bae8008f-87fc-479e-a416-27502c7489b3','099b050d-b7e5-412c-b789-55dae7d5cd13')) AS aud_t8_t10,
       (SELECT max(created_at) FROM auditoria) AS aud_ultimo;
```
```json
[{"aud_carreras_total":2442,"aud_t8_t10":48,"aud_ultimo":"2026-09-08 18:53:34.421133+00"}]
```

| métrica | antes | esperado | real |
|---|---|---|---|
| `auditoria` de `carreras` | 2440 | 2442 | **2442** ✔ |
| `auditoria` de T8+T10 | 46 | 48 | **48** ✔ |

**Exactamente 2 entradas nuevas, ni una más.**

`club_id` y `usuario_id` quedaron en `NULL`, **como estaba previsto en el plan §4.4**: `carreras`
no tiene columna `club_id` y la escritura salió por MCP sin JWT de usuario, así que
`fn_auditoria_log()` no tenía de dónde sacarlos. Consecuencia práctica ya documentada: la
secretaría de Dolores **no ve estas dos entradas** en `auditoria.html` (filtra por `club_id` para
todo rol que no sea `super_admin`, `auditoria.html:352`); `admin@sgh.com` sí las ve. La
trazabilidad la dan este informe, el `.sql` versionado y el commit `0b72673`.

---

## 4 · Verificación del lado del usuario — el gate

`validar_inscripcion(p_spc_id, p_carrera_id)` es de solo lectura (`RETURNS TABLE`), así que se la
puede llamar cuantas veces haga falta. **No se creó ni se borró ninguna inscripción.**

Fixtures — SPCs reales del padrón, activos, sin sanción, con edad reglamentaria (regla del 1° de
julio) dentro del rango:

| etiqueta | `spc_id` | sexo | edad regl. al 20/09/2026 |
|---|---|---|---|
| AFRICUM | `acd956c5-4464-4e49-8c58-9b42bab741e9` | macho | 6 |
| AMOROUS | `cb050a3e-22d8-4d53-9ac6-821fb57fbbf2` | hembra | 5 |
| Gaucho Bravo | `72896c7d-6265-4dcd-82ca-bd37f7146b2b` | castrado | 7 |
| CARRIGAN FITZ | `3b58d125-5cf1-4372-ba6d-5965aed44593` | hembra | 3 (control de edad) |

### 4.1 — DESPUÉS del fix

```sql
WITH fx(etiqueta, spc_id, sexo) AS (VALUES
  ('macho AFRICUM','acd956c5-4464-4e49-8c58-9b42bab741e9'::uuid,'macho'),
  ('hembra AMOROUS','cb050a3e-22d8-4d53-9ac6-821fb57fbbf2'::uuid,'hembra'),
  ('castrado Gaucho Bravo','72896c7d-6265-4dcd-82ca-bd37f7146b2b'::uuid,'castrado')),
ca(turno, carrera_id) AS (VALUES
  (8,'bae8008f-87fc-479e-a416-27502c7489b3'::uuid),
  (10,'099b050d-b7e5-412c-b789-55dae7d5cd13'::uuid))
SELECT ca.turno, fx.etiqueta, v.puede_inscribirse, v.motivo
FROM fx CROSS JOIN ca, LATERAL validar_inscripcion(fx.spc_id, ca.carrera_id) v
ORDER BY ca.turno, fx.etiqueta;
```
```json
[{"turno":8,"etiqueta":"castrado Gaucho Bravo","puede_inscribirse":false,"motivo":"Tu ejemplar no está habilitado para inscribirse. Consultá en secretaría."},
 {"turno":8,"etiqueta":"hembra AMOROUS","puede_inscribirse":true,"motivo":"SPC habilitado para inscribirse."},
 {"turno":8,"etiqueta":"macho AFRICUM","puede_inscribirse":false,"motivo":"Tu ejemplar no está habilitado para inscribirse. Consultá en secretaría."},
 {"turno":10,"etiqueta":"castrado Gaucho Bravo","puede_inscribirse":false,"motivo":"Tu ejemplar no está habilitado para inscribirse. Consultá en secretaría."},
 {"turno":10,"etiqueta":"hembra AMOROUS","puede_inscribirse":true,"motivo":"SPC habilitado para inscribirse."},
 {"turno":10,"etiqueta":"macho AFRICUM","puede_inscribirse":false,"motivo":"Tu ejemplar no está habilitado para inscribirse. Consultá en secretaría."}]
```

### 4.2 — ANTES vs DESPUÉS, la misma query

| turno | fixture | ANTES (medido en el plan) | DESPUÉS |
|---|---|---|---|
| 8 | macho AFRICUM | `true` | **`false`** ✔ |
| 8 | castrado Gaucho Bravo | `true` | **`false`** ✔ |
| 8 | hembra AMOROUS | `true` | **`true`** ✔ |
| 10 | macho AFRICUM | `true` | **`false`** ✔ |
| 10 | castrado Gaucho Bravo | `true` | **`false`** ✔ |
| 10 | hembra AMOROUS | `true` | **`true`** ✔ |

Antes eran **seis de seis en `true`** — el agujero. Ahora sólo pasa la yegua. **El gate rechaza al
macho en T8 y en T10, y sigue aceptando a la hembra que cumple la edad.**

### 4.3 — Corrección al plan: el `motivo` viene genérico, no detallado

El plan §6 anticipaba que el motivo del rechazo iba a decir *"Carrera solo para hembras."*. **No
es lo que pasa por esta vía.** `validar_inscripcion` devuelve el motivo detallado sólo si
`fn_is_staff()` da `true`, y por MCP no hay JWT de usuario, así que `auth.uid()` es `NULL`:

```sql
SELECT pg_get_functiondef(p.oid) AS def, fn_is_staff() AS soy_staff_ahora
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='fn_is_staff';
```
```json
[{"def":"CREATE OR REPLACE FUNCTION public.fn_is_staff()\n RETURNS boolean\n LANGUAGE sql\n STABLE SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\n  SELECT EXISTS (\n    SELECT 1 FROM usuarios\n    WHERE auth_user_id = auth.uid()\n      AND activo\n      AND rol IN ('super_admin', 'secretario_carreras', 'operador')\n  );\n$function$\n","soy_staff_ahora":false}]
```

Es el mismo texto genérico que ve un entrenador desde el portal, o sea que **la medición refleja
exactamente lo que va a ver el usuario final**. Pero tiene un costo probatorio: el texto genérico
no dice *cuál* regla rechazó. Por eso se agregó el control de abajo.

### 4.4 — Control de aislamiento: el rechazo es por SEXO, no por otra cosa

Los **mismos tres ejemplares**, contra **T4** — que sigue en `condicion_sexo='ambos'` y arranca en
la misma edad mínima (5 años) que T8 y T10:

```sql
WITH fx(etiqueta, spc_id) AS (VALUES
  ('macho AFRICUM','acd956c5-4464-4e49-8c58-9b42bab741e9'::uuid),
  ('hembra AMOROUS','cb050a3e-22d8-4d53-9ac6-821fb57fbbf2'::uuid),
  ('castrado Gaucho Bravo','72896c7d-6265-4dcd-82ca-bd37f7146b2b'::uuid)),
ca(turno, carrera_id, sexo_col) AS (VALUES
  (4,'fbf0de67-875f-4dbd-834c-60503d2d6f2f'::uuid,'ambos'),
  (8,'bae8008f-87fc-479e-a416-27502c7489b3'::uuid,'hembras'),
  (10,'099b050d-b7e5-412c-b789-55dae7d5cd13'::uuid,'hembras'))
SELECT ca.turno, ca.sexo_col AS condicion_sexo_del_turno, fx.etiqueta, v.puede_inscribirse
FROM fx CROSS JOIN ca, LATERAL validar_inscripcion(fx.spc_id, ca.carrera_id) v
ORDER BY ca.turno, fx.etiqueta;
```
```json
[{"turno":4,"condicion_sexo_del_turno":"ambos","etiqueta":"castrado Gaucho Bravo","puede_inscribirse":true},
 {"turno":4,"condicion_sexo_del_turno":"ambos","etiqueta":"hembra AMOROUS","puede_inscribirse":true},
 {"turno":4,"condicion_sexo_del_turno":"ambos","etiqueta":"macho AFRICUM","puede_inscribirse":true},
 {"turno":8,"condicion_sexo_del_turno":"hembras","etiqueta":"castrado Gaucho Bravo","puede_inscribirse":false},
 {"turno":8,"condicion_sexo_del_turno":"hembras","etiqueta":"hembra AMOROUS","puede_inscribirse":true},
 {"turno":8,"condicion_sexo_del_turno":"hembras","etiqueta":"macho AFRICUM","puede_inscribirse":false},
 {"turno":10,"condicion_sexo_del_turno":"hembras","etiqueta":"castrado Gaucho Bravo","puede_inscribirse":false},
 {"turno":10,"condicion_sexo_del_turno":"hembras","etiqueta":"hembra AMOROUS","puede_inscribirse":true},
 {"turno":10,"condicion_sexo_del_turno":"hembras","etiqueta":"macho AFRICUM","puede_inscribirse":false}]
```

Los tres pasan en T4 y dos de tres caen en T8/T10. Como lo único que cambia entre T4 y T8/T10 es
la columna de sexo, **el rechazo no puede venir de la edad, ni de una sanción, ni del cupo.**

### 4.5 — Control negativo: la edad sigue mandando

```sql
SELECT 'control negativo edad — CARRIGAN FITZ (hembra, 3 años) en T8' AS caso, v.*
FROM validar_inscripcion('3b58d125-5cf1-4372-ba6d-5965aed44593'::uuid,
                         'bae8008f-87fc-479e-a416-27502c7489b3'::uuid) v;
```
```json
[{"caso":"control negativo edad — CARRIGAN FITZ (hembra, 3 años) en T8","puede_inscribirse":false,"motivo":"Tu ejemplar no está habilitado para inscribirse. Consultá en secretaría."}]
```

Una yegua de 3 años sigue rechazada en T8 (mínimo 5). **El fix no aflojó la regla de edad ni
convirtió "hembra" en salvoconducto.**

---

## 5 · Probe de regresión

Archivo nuevo: **`tests/probe_condicion_sexo_r9.mjs`**. Read-only: sólo `SELECT` y llamadas a
`validar_inscripcion`. No escribe inscripciones, así que no hay snapshot/restore que hacer.

Corre el gate **real de producción** (el RPC), no una reimplementación, y asserta contra
`puede_inscribirse` —nunca contra el texto del motivo, por lo de §4.3—. Incluye el control de
aislamiento contra T4 y el control negativo de edad, y además chequea que el texto de T8/T10 siga
diciendo "Yeguas": si alguien edita el texto, la columna deja de estar justificada y el probe avisa.

```
$ set -a; . ./.env; set +a
$ node tests/probe_condicion_sexo_r9.mjs

── 1 · La columna en los once turnos de R9 ──
  ✔ R9 tiene 11 turnos (11)
  ✔ T1: condicion_sexo = 'ambos' (esperado 'ambos')
  ✔ T2: condicion_sexo = 'ambos' (esperado 'ambos')
  ✔ T3: condicion_sexo = 'ambos' (esperado 'ambos')
  ✔ T4: condicion_sexo = 'ambos' (esperado 'ambos')
  ✔ T5: condicion_sexo = 'ambos' (esperado 'ambos')
  ✔ T6: condicion_sexo = 'ambos' (esperado 'ambos')
  ✔ T7: condicion_sexo = 'ambos' (esperado 'ambos')
  ✔ T8: condicion_sexo = 'hembras' (esperado 'hembras')
  ✔ T9: condicion_sexo = 'ambos' (esperado 'ambos')
  ✔ T10: condicion_sexo = 'hembras' (esperado 'hembras')
  ✔ T11: condicion_sexo = 'ambos' (esperado 'ambos')
  ✔ T8: el texto sigue diciendo "Yeguas" — "Yeguas de 5 años y + edad ganadoras de 1 o 2 carreras."
  ✔ T10: el texto sigue diciendo "Yeguas" — "Yeguas 5 años y + edad perdedoras."

── 2 · El gate en T8 y T10 (condicion_sexo = hembras) ──
  ✔ T8: RECHAZA AFRICUM (macho, 6a)
  ✔ T8: RECHAZA Gaucho Bravo (castrado, 7a)
  ✔ T8: ACEPTA  AMOROUS (hembra, 5a)
  ✔ T10: RECHAZA AFRICUM (macho, 6a)
  ✔ T10: RECHAZA Gaucho Bravo (castrado, 7a)
  ✔ T10: ACEPTA  AMOROUS (hembra, 5a)

── 3 · Control de aislamiento: T4 sigue en "ambos", mismo rango de edad ──
  ✔ T4 sigue en 'ambos' (ambos)
  ✔ T4 arranca en 5 años como T8/T10 (5)
  ✔ T4: ACEPTA AFRICUM (macho, 6a) — el rechazo en T8/T10 es por SEXO
  ✔ T4: ACEPTA Gaucho Bravo (castrado, 7a) — idem
  ✔ T4: ACEPTA AMOROUS (hembra, 5a)

── 4 · Control negativo: la edad sigue mandando ──
  ✔ T8: RECHAZA CARRIGAN FITZ (hembra, 3a) — por edad, no por sexo

OK — 26 pass, 0 fail
```

**26 pass, 0 fail.**

En la primera corrida el probe se cayó con `TypeError: sb.rpc(...).catch is not a function` — el
builder que devuelve `.rpc()` en esta versión de supabase-js es *thenable* pero no expone
`.catch`. Se corrigió a `await` + chequeo de `error`, que es el patrón que ya usan los otros probes
del repo, y volvió a correr limpio. Queda anotado para el próximo que escriba un probe con `.rpc()`.

---

## 6 · Qué quedó dónde

**Rama `fix/condicion-sexo-t8-t10-r9`**, commit `0b726736cac872e5b75403dfec552522e5c7ff0a`,
en `origin`. Tres archivos nuevos:

```
migrations/fix_condicion_sexo_r9_t8_t10.sql        el UPDATE con guards (el que se aplicó)
migrations/rollback_condicion_sexo_r9_t8_t10.sql   el rollback simétrico (sin usar)
tests/probe_condicion_sexo_r9.mjs                  26 asserts, read-only
```

```
$ git push -u origin fix/condicion-sexo-t8-t10-r9
To github.com:mdqclio/SGH.git
 * [new branch]      fix/condicion-sexo-t8-t10-r9 -> fix/condicion-sexo-t8-t10-r9
branch 'fix/condicion-sexo-t8-t10-r9' set up to track 'origin/fix/condicion-sexo-t8-t10-r9'.

$ git ls-remote origin fix/condicion-sexo-t8-t10-r9
0b726736cac872e5b75403dfec552522e5c7ff0a	refs/heads/fix/condicion-sexo-t8-t10-r9

$ git rev-parse HEAD
0b726736cac872e5b75403dfec552522e5c7ff0a
```

Coinciden. ✔

**No se mergeó a `main`.** Esperando OK.

---

## 7 · Desvíos respecto del plan

Tres, ninguno de fondo:

1. **El `.sql` se aplicó con `execute_sql`, no con `apply_migration`.** Es DML (un `UPDATE`), no
   DDL, y ése es el criterio del `CLAUDE.md`. **Consecuencia**: la migración **no** figura en la
   lista de migraciones trackeadas de Supabase. La traza son el archivo versionado en
   `migrations/`, el commit `0b72673` y este informe.
2. **El `motivo` del rechazo viene genérico**, no *"Carrera solo para hembras."* como anticipaba el
   plan §6 — ver §4.3. Se compensó con el control de aislamiento contra T4 (§4.4), que prueba la
   causalidad mejor que el texto.
3. **El probe necesitó un arreglo** antes de correr limpio (`.rpc().catch` no existe) — §5.

---

## 8 · Lo que sigue abierto

1. **El chip del llamado.** Con `fix/llamado-chips-fede` sin mergear, el chip sigue vivo en prod y
   **desde ahora T8 y T10 muestran `hembras`** en el portal (`portal.html:625`) y en el encabezado
   de `inscripciones.html:558`, en vez del `ambos` que contradecía el título. La contradicción que
   trababa ese merge para estos dos turnos **ya no existe**: la tarjeta es coherente con chip o sin
   chip. Ver el §9 del informe del plan.
2. **T5, T9 y T11** siguen con el desacuerdo edad texto-vs-columna. **No se tocaron**, esperan a
   Fede.
3. **`edad_maxima_anos` de T8 es `NULL` y la de T10 es `10`**, con textos casi idénticos ("5 años y
   + edad"). T8 acepta yeguas de 11+ y T10 no. Es del carril de EDAD, no se tocó — pero conviene
   preguntarlo junto con lo anterior.
4. **El castrado.** `hembras` también rechaza a `castrado`, verificado en §4.1. Hay uno solo en el
   padrón (Gaucho Bravo, 7 años) y no está anotado en ningún turno de R9. Correcto
   reglamentariamente, pero dicho en voz alta.
5. **Auditoría con `club_id` NULL** (§3.4): la secretaría no ve estas dos entradas en su pantalla.
   Limitación de `fn_auditoria_log()` con escrituras server-side, no de este fix. Candidato a ISSUE.
6. **Cierre de inscripción: viernes 11/09 12:00 AR.** El fix entró con ~3 días de margen: los dos
   turnos quedaron protegidos antes del cierre, no después.

---

## Verificación de push

```
$ git push origin reports
To github.com:mdqclio/SGH.git
   eeb3f15..262c4a4  reports -> reports

$ git ls-remote origin reports
262c4a480c4347e216f490782f12d816bc10c97d	refs/heads/reports

$ git rev-parse HEAD
262c4a480c4347e216f490782f12d816bc10c97d
```

Coinciden. ✔ (`262c4a4` es el commit que trae el informe; este bloque lo agrega el commit
siguiente, cuyo SHA no puede estar escrito adentro de sí mismo — se verifica con los mismos dos
comandos inmediatamente después del push y ambos devuelven el mismo valor.)
