# PLAN — corregir `condicion_sexo` en T8 y T10 de R9 (`ambos` → `hembras`)

**Fecha:** 2026-09-08, 15:33 AR (18:33 UTC)
**Estado:** **PLAN. NADA EJECUTADO.** Todo lo corrido contra prod fue **solo lectura** (`SELECT` y
llamadas a `validar_inscripcion`, que es `RETURNS TABLE` y no escribe). Ningún `UPDATE`, ningún
`INSERT`, ningún `apply_migration`. Los archivos `.sql` de §3 y §5 **todavía no existen en el repo** y
la rama `fix/` **todavía no se creó**: el texto completo está acá, listo para copiar, esperando OK.

**SHA de `main` al momento del relevamiento:** `eface80078b99a56c9ae3160053cd8fd0c425d31`
**SHA de `origin/reports` al empezar:** `0d2f2b647c875612b907ea71a4bb04aa9832914d`
**Informe previo que aporta la evidencia:** `docs/diagnosticos/2026-09-08_machos-en-t8-t10-r9.md`
(commit `0d2f2b6` en `reports`)

## Guards

```
$ pwd
/home/clio/dev/SGH

SELECT count(*) FROM spcs;   →  181     ✔ coincide con el baseline
ref del proyecto             →  unlhcuanfrtpatoipwve   ✔
```

Salida cruda del guard de base:

```sql
SELECT (SELECT count(*) FROM spcs) AS spcs_count, current_database() AS db, inet_server_addr()::text AS host;
```
```json
[{"spcs_count":181,"db":"postgres","host":"2600:1f1e:dbb:f601:2df:7db3:b77:7ff0/128"}]
```

Guard del ref (grep contra el árbol de trabajo):

```
$ grep -rn "unlhcuanfrtpatoipwve" --include=*.js --include=*.html -m1 . | head -3
categorias.html:173:...createClient('https://unlhcuanfrtpatoipwve.supabase.co','sb_publishable_gypetSX16kGMXHhG_xqLWA_7wrzWgAK')...
carta-llamados.html:446:...createClient('https://unlhcuanfrtpatoipwve.supabase.co','sb_publishable_gypetSX16kGMXHhG_xqLWA_7wrzWgAK')...
reset-password.html:151:  'https://unlhcuanfrtpatoipwve.supabase.co',
```

**Nota de método (protocolo de informes):** todo el relevamiento de código se hizo contra `main`
(`git show main:archivo`, `git grep <patrón> main`), no contra el árbol de `reports`, que está 62
commits atrás. El informe se escribe y se commitea en `reports`.

---

## 1. Qué valor exacto — `hembras`

`carreras.condicion_sexo` **es un ENUM**, no texto libre. No hay CHECK adicional (se buscaron
constraints con `sexo` en `carreras` y `spcs`: cero resultados).

```sql
SELECT c.table_name, c.column_name, c.data_type, c.udt_name, c.is_nullable, c.column_default
FROM information_schema.columns c
WHERE c.column_name ILIKE '%condicion_sexo%' OR c.column_name ILIKE '%sexo%'
ORDER BY c.table_name, c.column_name;
```
```json
[{"table_name":"backup_spcs_20260515","column_name":"sexo","data_type":"USER-DEFINED","udt_name":"sexo_spc","is_nullable":"YES","column_default":null},
 {"table_name":"carreras","column_name":"condicion_sexo","data_type":"USER-DEFINED","udt_name":"condicion_sexo","is_nullable":"NO","column_default":"'ambos'::condicion_sexo"},
 {"table_name":"spcs","column_name":"sexo","data_type":"USER-DEFINED","udt_name":"sexo_spc","is_nullable":"NO","column_default":null},
 {"table_name":"v_inscriptos_carrera","column_name":"spc_sexo","data_type":"USER-DEFINED","udt_name":"sexo_spc","is_nullable":"YES","column_default":null},
 {"table_name":"v_programa_reunion","column_name":"condicion_sexo","data_type":"USER-DEFINED","udt_name":"condicion_sexo","is_nullable":"YES","column_default":null},
 {"table_name":"v_spcs_activos","column_name":"sexo","data_type":"USER-DEFINED","udt_name":"sexo_spc","is_nullable":"YES","column_default":null}]
```

Definición de los dos ENUMs:

```sql
SELECT t.typname, e.enumsortorder, e.enumlabel
FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
WHERE t.typname IN ('condicion_sexo','sexo_spc')
ORDER BY t.typname, e.enumsortorder;
```
```json
[{"typname":"condicion_sexo","enumsortorder":1,"enumlabel":"ambos"},
 {"typname":"condicion_sexo","enumsortorder":2,"enumlabel":"machos"},
 {"typname":"condicion_sexo","enumsortorder":3,"enumlabel":"hembras"},
 {"typname":"condicion_sexo","enumsortorder":4,"enumlabel":"machos_castrados"},
 {"typname":"sexo_spc","enumsortorder":1,"enumlabel":"macho"},
 {"typname":"sexo_spc","enumsortorder":2,"enumlabel":"hembra"},
 {"typname":"sexo_spc","enumsortorder":3,"enumlabel":"castrado"}]
```

**`condicion_sexo` admite exactamente cuatro valores: `ambos`, `machos`, `hembras`,
`machos_castrados`. El que corresponde es `hembras`** — en plural, sin acento, minúscula. Ojo con la
asimetría: la carrera se restringe con `hembras` (plural) y el ejemplar se describe con `hembra`
(singular, ENUM `sexo_spc`). Son dos tipos distintos y no intercambiables.

Distintos que existen hoy **en toda la base**, con conteos:

```sql
SELECT condicion_sexo::text AS valor, count(*) AS n FROM carreras GROUP BY 1 ORDER BY 2 DESC;
```
```json
[{"valor":"ambos","n":45},{"valor":"hembras","n":3},{"valor":"machos","n":1}]
```

49 carreras en total. `machos_castrados` no se usó nunca.

```sql
SELECT sexo::text AS valor, count(*) AS n FROM spcs GROUP BY 1 ORDER BY 2 DESC;
```
```json
[{"valor":"macho","n":110},{"valor":"hembra","n":70},{"valor":"castrado","n":1}]
```

### Precedente: dónde ya se usó `hembras`

Las cuatro carreras con sexo restringido de la base, con su texto:

```sql
SELECT r.numero AS reunion, r.fecha, c.numero_turno, c.condicion_sexo::text, c.condicion_handicap
FROM carreras c JOIN reuniones r ON r.id = c.reunion_id
WHERE c.condicion_sexo <> 'ambos'
ORDER BY r.numero, c.numero_turno;
```
```json
[{"reunion":6,"fecha":"2026-06-20","numero_turno":3,"condicion_sexo":"hembras","condicion_handicap":"Yeguas de 3 y 4 años perdedoras."},
 {"reunion":7,"fecha":"2026-07-19","numero_turno":2,"condicion_sexo":"hembras","condicion_handicap":"Yeguas 3 años perdedoras."},
 {"reunion":7,"fecha":"2026-07-19","numero_turno":3,"condicion_sexo":"machos","condicion_handicap":"Caballos 4 años perdedores."},
 {"reunion":7,"fecha":"2026-07-19","numero_turno":4,"condicion_sexo":"hembras","condicion_handicap":"Yeguas 4 años perdedoras."}]
```

**Las tres carreras que dicen "Yeguas…" en el texto tienen `hembras` en la columna.** La convención
del club ya está fijada y es exactamente la que este fix aplica: texto "Yeguas" ⇒ `hembras`. T8 y
T10 de R9 son las dos únicas que dicen "Yeguas" y quedaron en `ambos`.

---

## 2. Snapshot — los once turnos de R9

Reunión identificada primero (una sola R9 en toda la base):

```sql
SELECT r.id AS reunion_id, r.numero, r.fecha, r.estado, r.club_id, r.es_prueba,
       (SELECT count(*) FROM carreras c WHERE c.reunion_id = r.id) AS turnos
FROM reuniones r
WHERE r.club_id = '0649e9c5-9e87-4aad-842f-101458e6b33c'
ORDER BY r.numero;
```
```json
[{"reunion_id":"cf460086-f458-4f87-b443-3c548efe7481","numero":1,"fecha":"2026-01-18","estado":"finalizada","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","es_prueba":false,"turnos":0},
 {"reunion_id":"decb58b7-2b70-4176-bb67-4e8191a78130","numero":2,"fecha":"2026-02-08","estado":"finalizada","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","es_prueba":false,"turnos":0},
 {"reunion_id":"daac4e2a-a66a-4189-bc88-67a23db54906","numero":3,"fecha":"2026-03-22","estado":"finalizada","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","es_prueba":false,"turnos":0},
 {"reunion_id":"0e1d82c6-90ec-485c-8153-f8c8d2408711","numero":4,"fecha":"2026-04-19","estado":"finalizada","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","es_prueba":false,"turnos":0},
 {"reunion_id":"c90b6186-268d-4089-8cc6-71626b627cf8","numero":5,"fecha":"2026-05-17","estado":"finalizada","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","es_prueba":false,"turnos":0},
 {"reunion_id":"b02ca761-6f44-4720-86aa-a3c3099019ea","numero":6,"fecha":"2026-06-20","estado":"borrador","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","es_prueba":false,"turnos":11},
 {"reunion_id":"7b83f624-374d-471d-a716-5310b7dbef6e","numero":7,"fecha":"2026-07-19","estado":"cancelada","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","es_prueba":false,"turnos":12},
 {"reunion_id":"7b6e003e-22e2-4629-bf55-f18560b1260f","numero":8,"fecha":"2026-08-16","estado":"finalizada","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","es_prueba":false,"turnos":12},
 {"reunion_id":"cafa37d6-89f4-45cb-a0d9-835bc27407e9","numero":9,"fecha":"2026-09-20","estado":"publicada","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","es_prueba":false,"turnos":11},
 {"reunion_id":"4d53f231-3819-4080-a214-cd623d7d4d87","numero":10,"fecha":"2026-10-11","estado":"programada","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","es_prueba":false,"turnos":0},
 {"reunion_id":"7678b605-6cd0-4457-9e23-ea8b7d832b3c","numero":11,"fecha":"2026-11-22","estado":"programada","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","es_prueba":false,"turnos":0},
 {"reunion_id":"a982b59e-808a-4799-bc95-d50511c9b58e","numero":12,"fecha":"2026-12-27","estado":"programada","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","es_prueba":false,"turnos":0},
 {"reunion_id":"a0000000-0000-0000-0000-000000009999","numero":9999,"fecha":"2099-01-01","estado":"cancelada","club_id":"0649e9c5-9e87-4aad-842f-101458e6b33c","es_prueba":true,"turnos":3}]
```

**R9 = `cafa37d6-89f4-45cb-a0d9-835bc27407e9`, fecha 2026-09-20, estado `publicada`, 11 turnos.**

### El snapshot pedido

```sql
SELECT c.numero_turno, c.id, c.nombre, c.condicion_sexo::text AS condicion_sexo,
       c.edad_minima_anos, c.edad_maxima_anos,
       c.condicion_handicap, c.condicion_adicional, c.estado,
       (SELECT count(*) FROM inscripciones i WHERE i.carrera_id = c.id) AS inscriptos
FROM carreras c
WHERE c.reunion_id = 'cafa37d6-89f4-45cb-a0d9-835bc27407e9'
ORDER BY c.numero_turno;
```

Salida cruda, completa, sin recortar:

```json
[{"numero_turno":1,"id":"c037b139-b8b5-46d7-900e-cbc7a01bd643","nombre":null,"condicion_sexo":"ambos","edad_minima_anos":3,"edad_maxima_anos":3,"condicion_handicap":"Todo caballo 3 años perdedor.","condicion_adicional":"Peso 57 kilos. Descargo 2 kilos a las hembras. Jockey aprendices sin descargo.","estado":"abierta","inscriptos":2},
 {"numero_turno":2,"id":"2d4016ad-460a-44c9-9b2d-d710a510edee","nombre":null,"condicion_sexo":"ambos","edad_minima_anos":4,"edad_maxima_anos":4,"condicion_handicap":"Todo caballo 4 años perdedor.","condicion_adicional":"Peso 57 kilos. Descargo 2 kilos a las hembras. Jockey aprendices sin descargo.","estado":"abierta","inscriptos":0},
 {"numero_turno":3,"id":"7250cda2-4b1b-40f5-80ed-54121745241b","nombre":null,"condicion_sexo":"ambos","edad_minima_anos":4,"edad_maxima_anos":4,"condicion_handicap":"Todo caballo 4 años perdedor.","condicion_adicional":"Peso 57 kilos. Descargo 2 kilos a las hembras. Jockey aprendices sin descargo.","estado":"abierta","inscriptos":0},
 {"numero_turno":4,"id":"fbf0de67-875f-4dbd-834c-60503d2d6f2f","nombre":null,"condicion_sexo":"ambos","edad_minima_anos":5,"edad_maxima_anos":10,"condicion_handicap":"Todo caballo 5 años y + edad perdedor.","condicion_adicional":"Peso 57 kilos. Descargo 2 kilos a las hembras. Jockey aprendices sin descargo.","estado":"abierta","inscriptos":0},
 {"numero_turno":5,"id":"9733113c-8c80-40eb-80b4-6f741abf125c","nombre":null,"condicion_sexo":"ambos","edad_minima_anos":5,"edad_maxima_anos":10,"condicion_handicap":"Todo caballo 3 y 4 años ganador de 1 o 2 carreras.","condicion_adicional":"Peso 57 kilos. Recargo de 2 kilos al ganador de 2 carreras. Descargo 2 kilos a las hembras. Jockey aprendices sin descargo.","estado":"abierta","inscriptos":0},
 {"numero_turno":6,"id":"7da3fa1c-a32a-42dc-ad2f-6b10e86cba22","nombre":null,"condicion_sexo":"ambos","edad_minima_anos":5,"edad_maxima_anos":10,"condicion_handicap":"Todo caballo de 5 años ganador de 1 o 2 carreras.","condicion_adicional":"Peso 57 kilos. Recargo de 2 kilos al ganador de 2 carreras. Descargo 2 kilos a las hembras. Jockey aprendices sin descargo.","estado":"abierta","inscriptos":0},
 {"numero_turno":7,"id":"3b553ea4-1052-4411-933b-156e6676dfc0","nombre":null,"condicion_sexo":"ambos","edad_minima_anos":6,"edad_maxima_anos":10,"condicion_handicap":"Todo caballo 6 años y + edad ganadores de 1 o 2 carreras.","condicion_adicional":"Peso 57 kilos. Recargo de 2 kilos al ganador de 2 carreras. Descargo 2 kilos a las hembras. Jockey aprendices sin descargo.","estado":"abierta","inscriptos":0},
 {"numero_turno":8,"id":"bae8008f-87fc-479e-a416-27502c7489b3","nombre":null,"condicion_sexo":"ambos","edad_minima_anos":5,"edad_maxima_anos":null,"condicion_handicap":"Yeguas de 5 años y + edad ganadoras de 1 o 2 carreras.","condicion_adicional":"Peso 55 kilos. Recargo de 2 kilos a las ganadora de 2 carreras. Jockey aprendices sin descargo.","estado":"abierta","inscriptos":0},
 {"numero_turno":9,"id":"5cd5d00e-c844-467d-925f-83b378863af5","nombre":null,"condicion_sexo":"ambos","edad_minima_anos":5,"edad_maxima_anos":10,"condicion_handicap":"Especial Todo caballo 4 años y + edad ganador de 3 o mas carreras.","condicion_adicional":"Peso 52 kilos al ganador de 2 carreras. Recargo de 2 kilos por carrera subsiguiente ganada. Jockey aprendices sin descargo.","estado":"abierta","inscriptos":0},
 {"numero_turno":10,"id":"099b050d-b7e5-412c-b789-55dae7d5cd13","nombre":null,"condicion_sexo":"ambos","edad_minima_anos":5,"edad_maxima_anos":10,"condicion_handicap":"Yeguas 5 años y + edad perdedoras.","condicion_adicional":"Peso 55 kilos. Jockey aprendices con descargo.","estado":"abierta","inscriptos":0},
 {"numero_turno":11,"id":"0bf74c72-9300-4406-8949-d81705da0c23","nombre":null,"condicion_sexo":"ambos","edad_minima_anos":5,"edad_maxima_anos":5,"condicion_handicap":"Todo caballo 5 años y + edad perdedor.","condicion_adicional":"Peso 57 kilos. Descargo 2 kilos a las hembras. Jockey aprendices con descargo.","estado":"abierta","inscriptos":1}]
```

Mismo dato en tabla:

| T | sexo | edad min | edad max | `condicion_handicap` | inscriptos |
|---|---|---|---|---|---|
| 1 | ambos | 3 | 3 | Todo caballo 3 años perdedor. | 2 |
| 2 | ambos | 4 | 4 | Todo caballo 4 años perdedor. | 0 |
| 3 | ambos | 4 | 4 | Todo caballo 4 años perdedor. | 0 |
| 4 | ambos | 5 | 10 | Todo caballo 5 años y + edad perdedor. | 0 |
| 5 | ambos | 5 | 10 | Todo caballo **3 y 4 años** ganador de 1 o 2 carreras. | 0 |
| 6 | ambos | 5 | 10 | Todo caballo de 5 años ganador de 1 o 2 carreras. | 0 |
| 7 | ambos | 6 | 10 | Todo caballo 6 años y + edad ganadores de 1 o 2 carreras. | 0 |
| **8** | **ambos → hembras** | 5 | **null** | **Yeguas** de 5 años y + edad **ganadoras** de 1 o 2 carreras. | **0** |
| 9 | ambos | 5 | 10 | Especial Todo caballo **4 años y + edad** ganador de 3 o mas carreras. | 0 |
| **10** | **ambos → hembras** | 5 | 10 | **Yeguas** 5 años y + edad **perdedoras**. | **0** |
| 11 | ambos | 5 | **5** | Todo caballo **5 años y + edad** perdedor. | 1 |

Los tres turnos en negrita-cursiva de la columna edad (T5, T9, T11) son los del desacuerdo
edad-texto que **no se tocan**: esperan respuesta de Fede.

**Cero inscriptos en T8 y T10** — el fix no afecta a nadie ya anotado. Confirmado también en el
informe previo (`0d2f2b6`).

Ventana de inscripción de los dos turnos:

```sql
SELECT c.numero_turno, c.apertura_inscripcion, c.cierre_inscripcion,
       (c.cierre_inscripcion AT TIME ZONE 'America/Argentina/Buenos_Aires') AS cierre_local
FROM carreras c WHERE c.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9' AND c.numero_turno IN (8,10)
ORDER BY c.numero_turno;
```
```json
[{"numero_turno":8,"apertura_inscripcion":"2026-08-28 00:00:00+00","cierre_inscripcion":"2026-09-11 15:00:00+00","cierre_local":"2026-09-11 12:00:00"},
 {"numero_turno":10,"apertura_inscripcion":"2026-08-28 00:00:00+00","cierre_inscripcion":"2026-09-11 15:00:00+00","cierre_local":"2026-09-11 12:00:00"}]
```

Cierran el **viernes 11/09 a las 12:00 AR**, como decía el pedido. Quedan ~3 días con el agujero
abierto.

### 2b. Las tres señales, medidas

```sql
SELECT c.numero_turno,
       (c.condicion_handicap ILIKE '%yegua%')                           AS senal1_texto_yeguas,
       (c.condicion_adicional ILIKE '%Peso 55%')                        AS senal2_peso_55,
       (c.condicion_adicional ILIKE '%Descargo 2 kilos a las hembras%') AS senal3_tiene_descargo_hembras,
       substring(c.condicion_adicional from 'Peso [0-9]+ kilos')        AS peso_detectado
FROM carreras c
WHERE c.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9'
ORDER BY c.numero_turno;
```
```json
[{"numero_turno":1,"senal1_texto_yeguas":false,"senal2_peso_55":false,"senal3_tiene_descargo_hembras":true,"peso_detectado":"Peso 57 kilos"},
 {"numero_turno":2,"senal1_texto_yeguas":false,"senal2_peso_55":false,"senal3_tiene_descargo_hembras":true,"peso_detectado":"Peso 57 kilos"},
 {"numero_turno":3,"senal1_texto_yeguas":false,"senal2_peso_55":false,"senal3_tiene_descargo_hembras":true,"peso_detectado":"Peso 57 kilos"},
 {"numero_turno":4,"senal1_texto_yeguas":false,"senal2_peso_55":false,"senal3_tiene_descargo_hembras":true,"peso_detectado":"Peso 57 kilos"},
 {"numero_turno":5,"senal1_texto_yeguas":false,"senal2_peso_55":false,"senal3_tiene_descargo_hembras":true,"peso_detectado":"Peso 57 kilos"},
 {"numero_turno":6,"senal1_texto_yeguas":false,"senal2_peso_55":false,"senal3_tiene_descargo_hembras":true,"peso_detectado":"Peso 57 kilos"},
 {"numero_turno":7,"senal1_texto_yeguas":false,"senal2_peso_55":false,"senal3_tiene_descargo_hembras":true,"peso_detectado":"Peso 57 kilos"},
 {"numero_turno":8,"senal1_texto_yeguas":true,"senal2_peso_55":true,"senal3_tiene_descargo_hembras":false,"peso_detectado":"Peso 55 kilos"},
 {"numero_turno":9,"senal1_texto_yeguas":false,"senal2_peso_55":false,"senal3_tiene_descargo_hembras":false,"peso_detectado":"Peso 52 kilos"},
 {"numero_turno":10,"senal1_texto_yeguas":true,"senal2_peso_55":true,"senal3_tiene_descargo_hembras":false,"peso_detectado":"Peso 55 kilos"},
 {"numero_turno":11,"senal1_texto_yeguas":false,"senal2_peso_55":false,"senal3_tiene_descargo_hembras":true,"peso_detectado":"Peso 57 kilos"}]
```

- **Señal 1 — texto "Yeguas":** exactamente T8 y T10. ✔ como decía el pedido.
- **Señal 2 — peso 55 en vez de 57:** exactamente T8 y T10. ✔ como decía el pedido.
- **Señal 3 — falta "Descargo 2 kilos a las hembras":** **T8, T10 y también T9.** ✘ acá el pedido
  decía "los únicos dos" y son **tres**. T9 no lo tiene tampoco, pero por otro motivo: es la
  **Especial**, con handicap por victorias (`Peso 52 kilos al ganador de 2 carreras. Recargo de 2
  kilos por carrera subsiguiente ganada.`), y en ese esquema no hay peso base del que descargar. Su
  texto dice "Todo caballo", en masculino genérico, y su peso no es 55.

  **Esto no debilita la reconstrucción**: las señales 1 y 2 apuntan a T8 y T10 y a nadie más, y el
  argumento de la señal 3 —"no tendría sentido descontarle 2 kilos a las hembras si son todas
  hembras"— sigue valiendo para esos dos. Simplemente hay una tercera carrera que carece del
  descargo por una razón distinta y verificable. Lo anoto porque el informe no puede decir "los
  únicos dos" cuando la query dice tres.

Sumado: T8 dice "**ganadoras**" y T10 "**perdedoras**", ambas en femenino. Cuatro señales
convergentes en las mismas dos filas, más el precedente de §1 (tres carreras "Yeguas…" = `hembras`).

---

## 3. El UPDATE

Archivo propuesto: **`migrations/fix_condicion_sexo_r9_t8_t10.sql`** (todavía no creado).

```sql
-- fix_condicion_sexo_r9_t8_t10.sql
--
-- R9 de Dolores (2026-09-20): T8 y T10 son carreras de YEGUAS y quedaron con
-- condicion_sexo = 'ambos'. El gate de inscripción (validar_inscripcion) sólo mira
-- la columna, no el texto, así que hoy aceptan machos. Cero inscriptos en los dos
-- turnos al 2026-09-08, cierre 11/09 12:00 AR.
--
-- Evidencia (docs/diagnosticos/2026-09-08_machos-en-t8-t10-r9.md y
-- docs/diagnosticos/2026-09-08_plan-fix-condicion-sexo-t8-t10-r9.md):
--   1. condicion_handicap dice "Yeguas" — sólo en T8 y T10 de los once turnos.
--   2. Peso 55 en vez de 57 — sólo en T8 y T10.
--   3. Sin "Descargo 2 kilos a las hembras" — en T8, T10 y T9 (T9 es la Especial,
--      con handicap por victorias y peso 52: no tiene peso base del que descargar).
--   4. T8 dice "ganadoras", T10 "perdedoras": femenino.
--   Precedente: las tres carreras de la base que dicen "Yeguas…" (R6 T3, R7 T2, R7 T4)
--   tienen condicion_sexo = 'hembras'.
--
-- NO toca T5, T9 ni T11: ahí el desacuerdo es de EDAD, texto vs columna son dos
-- criterios posibles y se espera definición de Fede.
--
-- Idempotente: el predicado condicion_sexo = 'ambos' hace que una segunda corrida
-- toque 0 filas, y los guards chequean el estado final (no el ROW_COUNT), así que
-- pasan igual.

BEGIN;

WITH objetivo AS (
  SELECT c.id, c.numero_turno, c.condicion_sexo AS antes
    FROM carreras c
    JOIN reuniones r ON r.id = c.reunion_id
   WHERE r.club_id      = '0649e9c5-9e87-4aad-842f-101458e6b33c'   -- Dolores
     AND r.numero       = 9
     AND c.numero_turno IN (8, 10)
     AND c.condicion_sexo = 'ambos'                                -- idempotencia
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

-- Guard: si el estado final no es el esperado, RAISE aborta la transacción entera.
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

  -- Nada fuera de R9 de Dolores cambió: 3 'hembras' + 1 'machos' históricos = 4.
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

**Salida esperada del `RETURNING`** (dos filas exactas):

| id | numero_turno | antes | despues | condicion_handicap |
|---|---|---|---|---|
| `bae8008f-87fc-479e-a416-27502c7489b3` | 8 | ambos | hembras | Yeguas de 5 años y + edad ganadoras de 1 o 2 carreras. |
| `099b050d-b7e5-412c-b789-55dae7d5cd13` | 10 | ambos | hembras | Yeguas 5 años y + edad perdedoras. |

Notas de acotamiento:

- El filtro va por `reuniones.club_id` porque **`carreras` no tiene `club_id`** (ver el listado de
  columnas en §8). El tenant se alcanza por el JOIN, no directo.
- `r.numero = 9` sin filtro de club tocaría hoy las mismas 2 filas —hay una sola R9 en la base—,
  pero el filtro de club se deja igual: es la garantía de que el día que otro hipódromo cargue su
  R9 esta migración no lo alcance.

  ```sql
  SELECT (SELECT count(*) FROM reuniones WHERE numero=9) AS reuniones_num9_todas,
         (SELECT count(*) FROM carreras c JOIN reuniones r ON r.id=c.reunion_id
           WHERE r.numero=9 AND c.numero_turno IN (8,10)) AS filas_sin_filtro_club;
  ```
  ```json
  [{"reuniones_num9_todas":1,"filas_sin_filtro_club":2}]
  ```
- `condicion_sexo = 'ambos'` como predicado hace la migración **idempotente** y además la vuelve
  un no-op si alguien ya lo arregló a mano desde `carta-llamados.html` mientras tanto.

---

## 4. Verificación

Las cuatro comprobaciones pedidas. **Si la primera no da 2, PARAR** — con el `.sql` de §3 esto se
resuelve solo: el guard hace `RAISE EXCEPTION` y la transacción entera vuelve atrás, no queda un
estado a medias.

### 4.1 — Exactamente 2 filas tocadas

El `RETURNING` de §3 tiene que devolver **exactamente las dos filas** de la tabla de arriba. Además,
post-commit:

```sql
SELECT c.numero_turno, c.condicion_sexo::text
FROM carreras c JOIN reuniones r ON r.id = c.reunion_id
WHERE r.club_id='0649e9c5-9e87-4aad-842f-101458e6b33c' AND r.numero=9
  AND c.condicion_sexo = 'hembras'
ORDER BY c.numero_turno;
-- ESPERADO: exactamente 2 filas → (8, hembras), (10, hembras)
```

### 4.2 — Los otros nueve turnos sin tocar

Comparación campo por campo contra el snapshot de §2:

```sql
SELECT c.numero_turno, c.condicion_sexo::text, c.edad_minima_anos, c.edad_maxima_anos,
       c.condicion_handicap, c.condicion_adicional, c.estado,
       (SELECT count(*) FROM inscripciones i WHERE i.carrera_id=c.id) AS inscriptos
FROM carreras c
WHERE c.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9'
ORDER BY c.numero_turno;
-- ESPERADO: idéntico al bloque JSON de §2 salvo condicion_sexo en T8 y T10.
--           T1 sigue con 2 inscriptos, T11 con 1. Nada más cambia.
```

Chequeo agregado:

```sql
SELECT count(*) FILTER (WHERE condicion_sexo='ambos')   AS ambos,
       count(*) FILTER (WHERE condicion_sexo='hembras') AS hembras,
       count(*)                                          AS total
FROM carreras WHERE reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9';
-- ANTES:    ambos=11, hembras=0, total=11
-- ESPERADO: ambos=9,  hembras=2, total=11
```

### 4.3 — Ninguna otra reunión ni club afectado

```sql
SELECT condicion_sexo::text AS valor, count(*) AS n FROM carreras GROUP BY 1 ORDER BY 2 DESC;
-- ANTES:    ambos=45, hembras=3, machos=1   (total 49)
-- ESPERADO: ambos=43, hembras=5, machos=1   (total 49)
```

```sql
SELECT r.numero AS reunion, r.club_id, c.numero_turno, c.condicion_sexo::text, c.condicion_handicap
FROM carreras c JOIN reuniones r ON r.id=c.reunion_id
WHERE c.condicion_sexo <> 'ambos'
ORDER BY r.numero, c.numero_turno;
-- ESPERADO: las 4 filas históricas de §1 (R6 T3, R7 T2, R7 T3, R7 T4) intactas
--           + las 2 nuevas (R9 T8, R9 T10). Seis filas, ninguna otra.
```

```sql
SELECT count(*) AS total_carreras FROM carreras;   -- ESPERADO: 49 (sin altas ni bajas)
```

### 4.4 — Las 2 entradas en `auditoria`

Hay trigger, confirmado:

```sql
SELECT t.tgname, c.relname, pg_get_triggerdef(t.oid) AS def
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND NOT t.tgisinternal AND c.relname='carreras';
```
```json
[{"tgname":"trg_audit_carreras","relname":"carreras","def":"CREATE TRIGGER trg_audit_carreras AFTER INSERT OR DELETE OR UPDATE ON public.carreras FOR EACH ROW EXECUTE FUNCTION fn_auditoria_log()"}]
```

Query de verificación:

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
-- ESPERADO: 2 filas, accion='UPDATE', sexo_antes='ambos', sexo_despues='hembras', turnos 8 y 10.
```

Baseline previo (para poder restar):

```sql
SELECT (SELECT count(*) FROM auditoria WHERE tabla='carreras') AS aud_carreras_total,
       (SELECT count(*) FROM auditoria WHERE tabla='carreras'
         AND registro_id IN ('bae8008f-87fc-479e-a416-27502c7489b3','099b050d-b7e5-412c-b789-55dae7d5cd13')) AS aud_t8_t10,
       (SELECT max(created_at) FROM auditoria) AS aud_ultimo,
       (SELECT count(*) FROM carreras) AS carreras_total;
```
```json
[{"aud_carreras_total":2440,"aud_t8_t10":46,"aud_ultimo":"2026-09-08 17:48:56.225471+00","carreras_total":49}]
```

Después del fix: `aud_carreras_total` = **2442**, `aud_t8_t10` = **48**.

#### ⚠ Las 2 filas van a quedar con `club_id` y `usuario_id` en NULL

`fn_auditoria_log()` deriva el usuario de `auth.jwt() ->> 'email'` y el club de
`NEW.club_id` — y **`carreras` no tiene columna `club_id`**, así que el club sale del usuario. Un
`UPDATE` aplicado por MCP (rol de servicio, sin JWT de usuario) deja los dos en NULL:

```sql
SELECT club_id IS NULL AS club_nulo, usuario_id IS NULL AS usuario_nulo, accion, count(*)
FROM auditoria WHERE tabla='carreras' GROUP BY 1,2,3 ORDER BY 4 DESC;
```
```json
[{"club_nulo":true,"usuario_nulo":true,"accion":"DELETE","count":871},
 {"club_nulo":true,"usuario_nulo":true,"accion":"INSERT","count":855},
 {"club_nulo":false,"usuario_nulo":false,"accion":"UPDATE","count":420},
 {"club_nulo":true,"usuario_nulo":true,"accion":"UPDATE","count":244},
 {"club_nulo":false,"usuario_nulo":false,"accion":"INSERT","count":48},
 {"club_nulo":false,"usuario_nulo":false,"accion":"DELETE","count":2}]
```

Consecuencia concreta: `auditoria.html:352` filtra `.eq('club_id', CLUB_ID)` para todo rol que no
sea `super_admin`. **La secretaría de Dolores no va a ver estas dos entradas en su pantalla de
auditoría; sólo `admin@sgh.com` las ve** (super_admin no aplica el filtro). El registro existe y es
recuperable por query, pero no es visible desde el módulo para el usuario del club.

Dos caminos, y elijo el conservador:

- **(A) — recomendado.** Aplicar el `.sql`. Se acepta el `club_id` NULL y queda documentado acá y en
  el `.sql`. La trazabilidad la da el archivo versionado en `migrations/` + este informe + el commit.
- (B) Que la secretaría lo cambie a mano en `carta-llamados.html` (el `<select id="f-cond-sexo">`
  existe, `carta-llamados.html:355` y `:1205`). Ventaja: la fila de auditoría queda atribuida al
  usuario y visible en su pantalla. Desventaja: ese formulario **guarda el registro entero**, así
  que reescribe todos los campos del turno con lo que tenga cargado el form — más superficie de
  riesgo que un `UPDATE` de una columna, y sin idempotencia ni guard. Por eso no la propongo.

---

## 5. Rollback simétrico

Archivo propuesto: **`migrations/rollback_condicion_sexo_r9_t8_t10.sql`** (todavía no creado).

```sql
-- rollback_condicion_sexo_r9_t8_t10.sql
--
-- Deshace fix_condicion_sexo_r9_t8_t10.sql: R9 de Dolores, T8 y T10 vuelven a 'ambos'.
-- Simétrico: mismo acotamiento (club + numero de reunión + turnos), predicado invertido
-- ('hembras' en vez de 'ambos') como idempotencia, mismo RETURNING, mismos guards al revés.
--
-- OJO: volver a 'ambos' REABRE el gate — T8 y T10 vuelven a aceptar machos y castrados.
-- Antes de correr esto, verificar que no haya inscriptos que dejarían de ser válidos:
--   SELECT c.numero_turno, s.nombre, s.sexo FROM inscripciones i
--     JOIN carreras c ON c.id = i.carrera_id JOIN spcs s ON s.id = i.spc_id
--    WHERE c.id IN ('bae8008f-87fc-479e-a416-27502c7489b3','099b050d-b7e5-412c-b789-55dae7d5cd13');

BEGIN;

WITH objetivo AS (
  SELECT c.id, c.numero_turno, c.condicion_sexo AS antes
    FROM carreras c
    JOIN reuniones r ON r.id = c.reunion_id
   WHERE r.club_id      = '0649e9c5-9e87-4aad-842f-101458e6b33c'
     AND r.numero       = 9
     AND c.numero_turno IN (8, 10)
     AND c.condicion_sexo = 'hembras'                              -- idempotencia
),
upd AS (
  UPDATE carreras c
     SET condicion_sexo = 'ambos'
    FROM objetivo o
   WHERE c.id = o.id
  RETURNING c.id,
            c.numero_turno,
            o.antes::text          AS antes,
            c.condicion_sexo::text AS despues,
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

  IF v_hembras <> 0 OR v_ambos <> 11 THEN
    RAISE EXCEPTION 'R9 quedó en % hembras / % ambos; esperaba 0 / 11. Abortado.', v_hembras, v_ambos;
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

Verificación post-rollback: el bloque JSON de §2 vuelve a reproducirse **idéntico**, y
`SELECT condicion_sexo, count(*) FROM carreras GROUP BY 1` vuelve a `ambos=45, hembras=3, machos=1`.
En `auditoria` quedan 2 filas más (`UPDATE`, `hembras` → `ambos`): el rollback no borra el rastro
del fix, lo agrega.

---

## 6. Verificación del lado del usuario — el gate

### Dónde está el gate

No está en el HTML. Es una función de base, **`validar_inscripcion(p_spc_id, p_carrera_id)`**,
`SECURITY DEFINER`, que devuelve `(puede_inscribirse boolean, motivo text)`. El portal la usa a
través de `rpc_inscribir` (`portal.html:876`, comentario en `portal.html:836`: *"puede anotar:
`validar_inscripcion` lo rechaza de todos modos"*). Toda la escritura pasa por el RPC; el portal no
tiene `INSERT` sobre `inscripciones`.

El bloque relevante, tal cual está en prod:

```sql
    IF v_carrera.condicion_sexo = 'machos' AND v_spc.sexo NOT IN ('macho', 'castrado') THEN
        RETURN QUERY SELECT FALSE, CASE WHEN v_detalle
            THEN 'Carrera solo para machos.' ELSE v_generico END; RETURN;
    END IF;
    IF v_carrera.condicion_sexo = 'hembras' AND v_spc.sexo != 'hembra' THEN
        RETURN QUERY SELECT FALSE, CASE WHEN v_detalle
            THEN 'Carrera solo para hembras.' ELSE v_generico END; RETURN;
    END IF;
    IF v_carrera.condicion_sexo = 'machos_castrados' AND v_spc.sexo != 'castrado' THEN
        RETURN QUERY SELECT FALSE, CASE WHEN v_detalle
            THEN 'Carrera solo para castrados.' ELSE v_generico END; RETURN;
    END IF;
```

Confirmado: **la función mira `condicion_sexo`, nunca el texto.** Por eso hoy el texto dice "Yeguas"
y entra cualquiera. Con `hembras`, `v_spc.sexo != 'hembra'` rechaza machos **y castrados**.

Detalle del motivo: `v_detalle := fn_is_staff()`. Un usuario de portal recibe el texto genérico
(*"Tu ejemplar no está habilitado para inscribirse. Consultá en secretaría."*), no "Carrera solo
para hembras". Es la decisión ya tomada (anti-enumeración, pendiente de definición de Fede), no algo
que introduzca este fix. La prueba de abajo corre como staff, así que ve el motivo detallado.

### Fixtures — SPCs reales del padrón, sin escribir inscripciones

`validar_inscripcion` es de solo lectura: se puede llamar tantas veces como haga falta sin tocar
`inscripciones`. Tres ejemplares reales, activos, sin sanción vigente, con edad reglamentaria
(regla del 1° de julio, vía `fn_edad_reglamentaria`) dentro del rango de los dos turnos:

| etiqueta | `spc_id` | sexo | nacimiento | edad regl. al 20/09/2026 |
|---|---|---|---|---|
| macho AFRICUM | `acd956c5-4464-4e49-8c58-9b42bab741e9` | macho | 2020-09-27 | 6 |
| hembra AMOROUS | `cb050a3e-22d8-4d53-9ac6-821fb57fbbf2` | hembra | 2021-09-13 | 5 |
| castrado Gaucho Bravo | `72896c7d-6265-4dcd-82ca-bd37f7146b2b` | castrado | 2019-06-20 | 7 |

(El castrado es el único de la base — 1 de 181. Se incluye porque `hembras` también lo rechaza, y eso
es una consecuencia del fix que conviene ver explícita.)

Turnos: **T8** = `bae8008f-87fc-479e-a416-27502c7489b3` (edad 5..NULL), **T10** =
`099b050d-b7e5-412c-b789-55dae7d5cd13` (edad 5..10).

### La query de prueba (misma antes y después)

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

### ANTES — medido hoy contra prod (solo lectura, salida cruda)

```json
[{"turno":8,"etiqueta":"castrado Gaucho Bravo","puede_inscribirse":true,"motivo":"SPC habilitado para inscribirse."},
 {"turno":8,"etiqueta":"hembra AMOROUS","puede_inscribirse":true,"motivo":"SPC habilitado para inscribirse."},
 {"turno":8,"etiqueta":"macho AFRICUM","puede_inscribirse":true,"motivo":"SPC habilitado para inscribirse."},
 {"turno":10,"etiqueta":"castrado Gaucho Bravo","puede_inscribirse":true,"motivo":"SPC habilitado para inscribirse."},
 {"turno":10,"etiqueta":"hembra AMOROUS","puede_inscribirse":true,"motivo":"SPC habilitado para inscribirse."},
 {"turno":10,"etiqueta":"macho AFRICUM","puede_inscribirse":true,"motivo":"SPC habilitado para inscribirse."}]
```

**Seis de seis en `true`.** El agujero está confirmado en vivo: un macho puede anotarse hoy mismo en
las dos carreras de yeguas.

### DESPUÉS — lo que tiene que dar

| turno | fixture | `puede_inscribirse` | `motivo` (como staff) |
|---|---|---|---|
| 8 | macho AFRICUM | **false** | Carrera solo para hembras. |
| 8 | castrado Gaucho Bravo | **false** | Carrera solo para hembras. |
| 8 | hembra AMOROUS | **true** | SPC habilitado para inscribirse. |
| 10 | macho AFRICUM | **false** | Carrera solo para hembras. |
| 10 | castrado Gaucho Bravo | **false** | Carrera solo para hembras. |
| 10 | hembra AMOROUS | **true** | SPC habilitado para inscribirse. |

Si alguna hembra diera `false`, el fix rompió algo y va el rollback de §5.

### Control negativo — que la edad siga mandando

Para que la prueba no confunda "rechaza machos" con "rechaza todo", una hembra **de 3 años**
(fuera del rango 5+) tiene que seguir rechazada después del fix, y por edad, no por sexo:

```sql
SELECT v.* FROM validar_inscripcion(
  '3b58d125-5cf1-4372-ba6d-5965aed44593'::uuid,   -- CARRIGAN FITZ, hembra, 2023-07-19, 3 años
  'bae8008f-87fc-479e-a416-27502c7489b3'::uuid) v; -- T8
-- ESPERADO (antes y después, sin cambio): false, 'Edad insuficiente: 3 años. Mínimo: 5'
```

### Padrón disponible — el fix no deja la carrera vacía

Hembras activas, sin sanción, con edad reglamentaria 5..10 a la fecha de R9: **40 ejemplares**.

```sql
WITH r AS (SELECT fecha FROM reuniones WHERE id='cafa37d6-89f4-45cb-a0d9-835bc27407e9')
SELECT count(*) FROM spcs s
WHERE s.sexo='hembra' AND s.estado='activo'
  AND fn_edad_reglamentaria((SELECT fecha FROM r), s.fecha_nacimiento) BETWEEN 5 AND 10;
-- → 40
```

Las primeras de la lista, para tener nombres a mano si hay que probar con otro:
AMOROUS (5), BABY PARADISE (7), CHINITA SALTEÑA (5), CONI ROSE (5), DE BELLOSO (5), ESCUCHAR TU VOZ
(7), Estrella Federal (5), Flor de Ceibo (5), FLORENTINA IN YOU (6), FURIA ENCANTADA (6), GLAM METAL
(6), GRAND VUELTERA (6), GRILLADA RYE (7), IDALIA MARO (5), IX GOAL TUN (8), KRISTALINA (5),
LA ALFARERA (5), La Bonaerense (5), LA DE ETIQUETA (5), LA DIVERTENTE (6), LA GRAN TEMPESTAD (5),
LA NOUBITA (5), La Porteña (5), LA RODESIA (6), LATIN PRESUMIDA (6), LATIN RAIN (5),
LE CHAT MIMOUS (6), LIVIA DRUSA (6), LOGUACIOUS (5), MARUKA PLUS (5), MI ILUSION (6),
QUINIELA TREND (8), RECUERDAME IN YOU (6), REINA ATREVIDA (7), REINA EDITION (5), SANTA LISA (5),
TALENTOSA CATCH (5), WISLA KEN (5), YOOKY (6), YUKINA (5).

*(T8 no tiene `edad_maxima_anos` —es NULL—, así que su padrón elegible es ese 40 más cualquier yegua
de 11+; T10 corta en 10.)*

### Probe de regresión

Corresponde uno, según el protocolo de `tests/`. Propuesta: **`tests/probe_condicion_sexo_r9.mjs`**,
read-only, sin escribir inscripciones — llama a `validar_inscripcion` con los tres fixtures × los dos
turnos y assertea la matriz del "DESPUÉS", más el control negativo de edad. No necesita
`snapshot → restore` porque no escribe nada. Se escribe junto con el fix, en la misma rama.

---

## 7. Dónde va — archivos y rama

**Nada de esto se ejecutó todavía.** Comandos exactos para cuando haya OK:

```bash
git checkout main
git pull
git checkout -b fix/condicion-sexo-t8-t10-r9

# los dos .sql de §3 y §5, más el probe de §6
#   migrations/fix_condicion_sexo_r9_t8_t10.sql
#   migrations/rollback_condicion_sexo_r9_t8_t10.sql
#   tests/probe_condicion_sexo_r9.mjs

git add migrations/fix_condicion_sexo_r9_t8_t10.sql \
        migrations/rollback_condicion_sexo_r9_t8_t10.sql \
        tests/probe_condicion_sexo_r9.mjs
git commit -m "fix: T8 y T10 de R9 son carreras de yeguas — condicion_sexo 'ambos' → 'hembras'"
git push -u origin fix/condicion-sexo-t8-t10-r9
git ls-remote origin fix/condicion-sexo-t8-t10-r9   # verificar SHA contra git rev-parse HEAD
```

**No va a `main` sin OK explícito.** El `.sql` se aplica por MCP con `apply_migration` (queda
trackeado como migración), y el archivo versionado en `migrations/` es la fuente de verdad.

Orden sugerido de ejecución:

1. Re-correr los guards (pwd / `spcs` = 181 / ref).
2. Re-correr el snapshot de §2 y confirmar que sigue igual (que nadie se anotó en el ínterin).
3. Aplicar `fix_condicion_sexo_r9_t8_t10.sql`. Capturar el `RETURNING`.
4. §4.1 a §4.4.
5. §6 "DESPUÉS" + control negativo.
6. Commit + push de la rama, `git ls-remote`.
7. Informe de ejecución en `reports` con toda la salida cruda.

---

## 8. Qué más cambia en la UI (revisado, sin sorpresas)

`carreras` no tiene `club_id` — el listado completo de columnas, que además es lo que va a quedar en
`auditoria.datos_antes` / `datos_despues`:

```
id, reunion_id, numero_turno, nombre, categoria_id, tipo_pista, distancia_metros,
edad_minima_anos, edad_maxima_anos, condicion_sexo, condicion_handicap, condicion_adicional,
bolsa_total, distribucion_premios, cupo_maximo, hora_estimada, apertura_inscripcion,
cierre_inscripcion, apertura_ratificacion, cierre_ratificacion, estado, bolsa_bonos,
numero_carrera_programa, apuestas, apuestas_notas
```

Los cinco archivos de `main` que leen `condicion_sexo` (`git grep -ln "condicion_sexo" main`):
`carta-llamados.html`, `inscripciones.html`, `portal.html`, `programa.html`, `ratificacion.html`.
Uno por uno:

- **`programa.html:400`** — `<div>Sexo <span>${car.condicion_sexo}</span></div>`. Hoy imprime
  "ambos" en T8/T10; después va a imprimir "hembras". **Corrige un dato hoy incorrecto.**
- **`inscripciones.html:890-899` y `ratificacion.html:319`** (`buildCond` / `SEXO_TXT`) — derivan un
  prefijo `Yeg` para `hembras`, pero sólo lo anteponen si el texto libre no abre ya nombrando el
  sexo:
  ```javascript
  const SEXO_TXT = { machos: 'Cab', hembras: 'Yeg', machos_castrados: 'Cas', ambos: 'Todo caballo' };
  const SEXO_EN_TEXTO_RE = /^(todos?\s+(los\s+)?caballos?|caballos?|yeguas?|castrados?|machos?|hembras?|potr[oa]s?|productos?)\b/i;
  ...
  if (sexoTxt && !(hc && SEXO_EN_TEXTO_RE.test(hc))) parts.push(sexoTxt);
  ```
  T8 y T10 abren con "Yeguas…", que matchea la regex ⇒ **el prefijo no se agrega y el texto impreso
  no cambia**. Sin duplicación "Yeg Yeguas…".
- **`inscripciones.html:958,980`** — `const esMixta = car.condicion_sexo === 'ambos'` decide el
  sufijo `(H)` que marca a las hembras en el PDF de inscriptos:
  ```javascript
  const esH = esMixta && (i.spcs?.sexo || '').toLowerCase() === 'hembra';
  ```
  Después del fix, en T8/T10 `esMixta = false` ⇒ deja de marcarse `(H)`. **Es lo correcto**: en una
  carrera de yeguas marcar "(H)" a las once es ruido. Hoy no se nota porque no hay inscriptos.
- **`ratificacion.html:702` (`buildCondAbr`)** — es el único lugar que arma el prefijo **sin** el
  guard de la regex, así que con `hembras` produciría `Yeg.5 y más a.Yeguas de 5 años y…`. **No se
  llega**: `buildCondCompleta` (`:735`) devuelve el texto de `condicion_handicap` cuando existe, y
  sólo cae a `buildCondAbr` si está vacío. T8 y T10 lo tienen cargado. Sin impacto, pero queda
  anotado como deuda menor (`buildCondAbr` merece el mismo guard que `buildCond`).
- **`carta-llamados.html:355,1143,1205`** — el `<select id="f-cond-sexo">` con las cuatro opciones.
  Después del fix, abrir T8 en el editor va a mostrar "Solo hembras" seleccionado, y volver a
  guardar el turno lo persiste. Sin conflicto.
- **`portal.html:625`** — el chip. Ver §9.

Nada de esto toca liquidaciones, premios, resultados ni apuestas: `condicion_sexo` no participa de
ningún cálculo de plata.

---

## 9. La pregunta del chip — sí, pero la rama hace lo contrario de lo que decía el pedido

**Primero, el nombre.** No existe ninguna rama `feat/chips-llamado`. La rama del chip es
**`fix/llamado-chips-fede`**, local y en `origin`, SHA `966b6c823a48427020f1b7b3ecbfc52d302a12d4`,
un commit por delante de `main` (`eface80`):

```
$ git log origin/fix/llamado-chips-fede --oneline -3
966b6c8 fix: sale el chip de sexo del llamado y del encabezado de inscripciones
eface80 docs: ISSUE-075 reescrito (son dos plazos, no dos cálculos) e ISSUE-077 nuevo
972c077 merge: forfait desde el portal en la ventana de ratificación

$ git diff --stat main origin/fix/llamado-chips-fede
 inscripciones.html                            |  7 ++-
 portal.html                                   | 10 ++++-
 tests/probe_paridad_llamado_inscripciones.mjs | 62 ++++++++++++++++++++++++---
 3 files changed, 70 insertions(+), 9 deletions(-)
```

**Segundo, el sentido.** La rama **saca** el chip de sexo, no lo agrega. Diff completo de las dos
páginas:

```diff
--- a/inscripciones.html
+++ b/inscripciones.html
@@ -554,8 +554,13 @@ function renderCarreraChips() {
   const chips = [
     c.distancia_metros ? `${c.distancia_metros}m` : '',
+    // La pista se queda: en las 49 carreras del club el texto de la condición
+    // NO la menciona nunca, así que el chip es el único lugar donde aparece.
     c.tipo_pista || '',
-    c.condicion_sexo || '',
+    // El chip de SEXO se sacó el 08/09/2026 (Fede). No pierde el dato: donde
+    // hay restricción el texto la declara ("Yeguas…" / "Caballos…"), y donde no
+    // la hay el chip decía "ambos". Ver el informe del 08/09.
+
     textoEdad(c),
--- a/portal.html
+++ b/portal.html
@@ -619,10 +619,18 @@ async function loadLlamado() {
           <div class="carrera-chips">
             <span class="chip">${esc(c.distancia_metros)}m</span>
             ${c.tipo_pista ? `<span class="chip">${esc(c.tipo_pista)}</span>` : ''}
-            ${c.condicion_sexo ? `<span class="chip">${esc(c.condicion_sexo)}</span>` : ''}
             ${textoEdad(c) ? `<span class="chip">${esc(textoEdad(c))}</span>` : ''}
```

Entonces la respuesta, en los dos escenarios:

**(a) Si `fix/llamado-chips-fede` NO se mergea** (el chip sigue en prod, que es el estado de hoy):
**sí, confirmado.** `portal.html:625` renderiza `esc(c.condicion_sexo)` crudo, sin transformar. Hoy
T8 y T10 muestran el chip **`ambos`**, que contradice el título de la propia carrera. Después del
fix van a mostrar **`hembras`**, que es correcto y concuerda con el texto "Yeguas…". Mismo efecto en
el encabezado de `inscripciones.html:558`. No hace falta tocar una línea de HTML: el chip lee la
columna.

**(b) Si `fix/llamado-chips-fede` SÍ se mergea:** el chip de sexo desaparece de las dos pantallas,
para los once turnos. En T8/T10 el dato no se pierde, porque el argumento de la rama —"donde hay
restricción el texto la declara"— es **literalmente verdadero para estos dos**: `condicion_handicap`
abre con "Yeguas". El chip que se saca era justo el que estaba mintiendo.

**Lo que esto destraba.** El fix de §3 y el merge de la rama son independientes: ninguno necesita al
otro, y no se pisan (la rama toca HTML, el fix toca una columna). Lo que sí desaparece es la
**contradicción**: hoy, con el chip vivo y la columna en `ambos`, T8 y T10 muestran "ambos" arriba y
"Yeguas" abajo, en la misma tarjeta. Después del fix la tarjeta es coherente **se mergee o no la
rama** — con chip dice "hembras", sin chip lo dice el texto. Para esos dos turnos, el merge deja de
tener riesgo de "estás tapando un dato que no coincide".

Orden recomendado: **primero el fix de la columna, después el merge del chip.** Al revés funciona
igual, pero deja unas horas de ventana en las que el chip ya no está y la columna todavía miente —
y la columna es la que manda en el gate.

---

## 10. Riesgos y preguntas abiertas

1. **El castrado.** `hembras` rechaza a `castrado`, no sólo a `macho`. Hay un solo castrado en el
   padrón (Gaucho Bravo, 7 años, elegible por edad para los dos turnos) y no está anotado en ningún
   turno de R9. Correcto reglamentariamente —un castrado no es una yegua— pero es una consecuencia
   del fix que conviene decir en voz alta, no descubrir el viernes.
2. **`club_id` NULL en auditoría** (§4.4): la secretaría no ve las dos entradas en su pantalla. Es
   una limitación de `fn_auditoria_log()` con escrituras server-side, no de este fix. Podría ser un
   ISSUE aparte.
3. **`edad_maxima_anos` de T8 es NULL y la de T10 es 10**, con textos casi idénticos ("5 años y +
   edad"). Es una asimetría entre las dos carreras que este fix **no toca** — es del carril de EDAD,
   que espera a Fede. Pero deja a T8 abierto a yeguas de 11+ y a T10 no. Vale mencionarlo cuando se
   le pregunte por T5/T9/T11.
4. **Señal 3 son tres turnos, no dos** (§2b). Corregido acá; no cambia la conclusión.
5. **La ventana se cierra el viernes 11/09 a las 12:00 AR.** Si el fix entra después del cierre, ya
   no protege nada: sirve sólo para que el programa y la ratificación digan la verdad.
6. **Nadie anotado hoy en T8/T10**, verificado en el snapshot (§2) y en el informe previo. Si entre
   este informe y la ejecución se anota alguien, el paso 2 del orden de §7 lo detecta antes de tocar
   nada.
7. **Pendiente de Fede**, sin bloquear esto: T5, T9 y T11 (desacuerdo edad texto-columna).

---

## Verificación de push

Commit del informe (`47d8b79`), salida cruda:

```
$ git push -u origin reports
To github.com:mdqclio/SGH.git
   0d2f2b6..47d8b79  reports -> reports
branch 'reports' set up to track 'origin/reports'.

$ git ls-remote origin reports
47d8b79591baa11ad334aef168b1343cc21a081a	refs/heads/reports

$ git rev-parse HEAD
47d8b79591baa11ad334aef168b1343cc21a081a
```

Coinciden. ✔

Este commit (el que agrega justamente este bloque) se verifica igual:

```
$ git push origin reports
SALIDA_PUSH_2

$ git ls-remote origin reports
SALIDA_LSREMOTE_2

$ git rev-parse HEAD
SALIDA_REVPARSE_2
```
