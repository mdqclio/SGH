# CAROSUEÑO — merge EJECUTADO · las 3 de R9 derivan · hallazgo: otras 8 de R9 sin titular

**Fecha:** 2026-09-11 (noche) · **`main`:** `1f381c7` · **Branch:** `fix/merge-carosueno` (SQL marcado EJECUTADA, pusheada, **sin mergear** — con tu OK) · **Plan:** `2026-09-11_plan-merge-carosueno.md`
**Escritura:** una — `apply_migration merge_carosueno_duplicada`.

## 0. Guards

| guard | esperado | real |
|---|---|---|
| `pwd` | `/home/clio/dev/SGH` | ✅ |
| `spcs` | 201 | ✅ |
| ref | `unlhcuanfrtpatoipwve` | ✅ |
| caballerizas / liquidaciones / líneas antes | 300 / 189 / 493 | ✅ |

---

## 1. Ejecución — condiciones de parada (las tuyas + las del plan), todas dentro del `DO`

| guarda | resultado |
|---|---|
| paso 1 mueve 1 responsable y el trigger **no** cambia `propietario_id` | ✅ 1 fila, sigue `a7b7fe52` |
| paso 2 renombra 1 | ✅ |
| paso 3 borra 1 (con `NOT EXISTS` ×4) | ✅ |
| **paso 4 = exactamente 7 filas** | ✅ **7** |
| **0 inscripciones de la caballeriza con `propietario_id` distinto de `a7b7fe52`** | ✅ 0 |
| 7 inscripciones en total sobre la caballeriza | ✅ |
| 1 sola CAROSUEÑO (nombre normalizado) | ✅ |
| `caballerizas` = 299 | ✅ |
| `liquidaciones` / `liquidacion_detalle` sin cambio de conteo | ✅ 189 / 493 → 189 / 493 |

`{"success":true}`. Pre-chequeo justo antes: `CAROSUEÑO` e6830f69 (DOL, BRIGANTI, 0/0/0/0/1 resp) · `CAROSUEÑO (DOL)` 46cc818b (NULL, NULL, 7 inscr / 7 sin prop / 2 spcs / 0 prof / 0 resp) · 0 líneas del stud.

---

## 2. Lo que importa para el domingo — las 3 de R9

```json
[{"t":7, "spc":"LATIN PRESUMIDA","estado":"inscripto","cab":"CAROSUEÑO","propietario_id":"a7b7fe52-bb01-4576-9fc4-0b815ad94aaf","propietario":"BRIGANTI, MARIA LAURA","dni":"27122763"},
 {"t":8, "spc":"LATIN PRESUMIDA","estado":"inscripto","cab":"CAROSUEÑO","propietario_id":"a7b7fe52-bb01-4576-9fc4-0b815ad94aaf","propietario":"BRIGANTI, MARIA LAURA","dni":"27122763"},
 {"t":10,"spc":"LATIN RAIN",     "estado":"inscripto","cab":"CAROSUEÑO","propietario_id":"a7b7fe52-bb01-4576-9fc4-0b815ad94aaf","propietario":"BRIGANTI, MARIA LAURA","dni":"27122763"}]
```

**Las tres derivan a BRIGANTI, MARIA LAURA (DNI 27122763).** Cualquier UPDATE posterior de Yesi (jockey, ratificación) vuelve a pasar por el trigger y encuentra el mismo responsable → se mantiene.

Las 4 de R6 también quedaron con `a7b7fe52` (T3 forfait, T5, T9, T10). Sin líneas de liquidación tocadas (no había).

La ficha:
```json
{"id":"46cc818b-…","nombre":"CAROSUEÑO","hip":"DOL","dom":"LOBOS","resp_txt":"BRIGANTI MARIA LAURA (propietario)","cr":"BRIGANTI MARIA LAURA [27122763] -> a7b7fe52-…","notas":"Alta para inscripciones reunión 2026-06-20 (planilla Yesica) · Unificada 11/09/2026 con la ficha CAROSUEÑO (e6830f69) que tenía el titular; ver migrations/merge_carosueno_duplicada.sql"}
```
`e6830f69` ya no existe. Conteos: caballerizas 299, propietarios 264, responsables 263.

---

## 3. Hallazgo — R9 tiene **otras 8 inscripciones con caballeriza y sin propietario**. Es el patrón de R8, en vivo.

Yesi cargó la planilla esta noche: R9 pasó de 5 a **72 inscripciones** (`count` de hoy 21:xx UTC). De esas:

```json
{"inscr":72,"con_cab":64,"sin_cab":8,"con_prop":56,"con_cab_sin_prop":8}
```

- 56 derivan bien.
- 8 todavía **sin caballeriza** (NIÑO OCEANICO, THE BEAST PARTY, INDIANA MARO, ABARAJALA, EL RISKO, GOIADORA, ATOMIZADOR, MARIA CATULENGA — los del alta de hoy; cuando Yesi les ponga caballeriza se deriva solo, si esa caballeriza tiene titular).
- **8 con caballeriza y `propietario_id NULL`** porque la caballeriza **no tiene ningún responsable** (ni real ni provisorio):

| caballeriza | `hipodromo_patente` | responsables | inscripciones R9 sin dueño | ya pasó en R8 (inscr sin prop) |
|---|---|---|---|---|
| MONTE DEL TORDILLO | NULL | **0** | 2 (KRISTALINA T4 y T10) | 0 |
| 2 DE ABRIL MAIPU | NULL | **0** | 1 (DEL CAMPEON T2) | 0 |
| Abuelo Calin | DOL | **0** | 1 (ALHENA T2) | 0 |
| HARAS EL ORIGEN | NULL | **0** | 1 (DOCTORA MIA T2) | **4** |
| LA COLONIA | NULL | **0** | 1 (TOY BOY T4) | 0 |
| LOS 6 CORAZONES | NULL | **0** | 1 (SEMBRADOR CHUCK T7) | 0 |
| SAICA | DOL | **0** | 1 (SI TIN T1) | **1** |

Siete caballerizas, **cero responsables**. El trigger no tiene de dónde derivar. Si alguno de esos 8 caballos se ubica el domingo, su premio de propietario y su bono 6-8 **no se generan** — GOTCHA #47, el mismo mecanismo que en R8 dejó plata sin asignar (tu cifra de $6,58 M; no la verifiqué). HARAS EL ORIGEN y SAICA ya lo hicieron en R8 y siguen sin titular.

Esto **no es duplicado**, es el caso "caballeriza sin dueño" a secas, y la respuesta ya está decidida por Fede el 15/08: **propietario provisorio** (nombre = caballeriza, sin documento, marca en `notas`), el vínculo activo, y re-derivación de las inscripciones. Es el runbook de R8 (`docs/RUNBOOK_R8_PROVISORIOS.md` §B4-B6) aplicado a R9, para 7 caballerizas / 8 inscripciones — o para las que queden cuando Yesi termine de asignar caballerizas a los 8 de la tanda de hoy. Conviene correrlo **el lunes después de la ratificación** (así entran sólo los ratificados y las caballerizas definitivas), no ahora.

**No lo hice.** Es un plan aparte, con tu OK: "provisorios R9", marca `'provisorio R9 14/09'` o la fecha que sea.

---

## 4. Queda

1. Merge de `fix/merge-carosueno` a `main` (SQL marcado EJECUTADA) — con tu OK.
2. **Plan "provisorios R9"** (§3): 7 caballerizas sin responsable con 8 inscripciones en R9; correr después de la ratificación del lunes.
3. Los otros tres pares del barrido: LA NARCISA (una fila vacía), SANTA BARBARA (mismo caso que CAROSUEÑO, sin R9), EL LINYE Y RAMI (mueve una línea pagada — con Fede).
4. ISSUE-080 sigue abierto; con LOS URONES y CAROSUEÑO resueltos, el índice único exacto todavía choca con LA NARCISA y EL LINYE Y RAMI.

---

## 5. Queries de respaldo

```sql
-- post-merge
select 'r9' k, (select jsonb_agg(jsonb_build_object('t',ca.numero_turno,'spc',s.nombre,'estado',i.estado,'cab',c.nombre,'propietario_id',i.propietario_id,'propietario',p.nombre,'dni',p.documento_nro) order by ca.numero_turno) from inscripciones i join carreras ca on ca.id=i.carrera_id join spcs s on s.id=i.spc_id join caballerizas c on c.id=i.caballeriza_id left join propietarios p on p.id=i.propietario_id where ca.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9' and i.caballeriza_id='46cc818b-aac4-4d39-b3c9-0b0c156fc6cc') v
union all select 'r6', (select jsonb_agg(jsonb_build_object('t',ca.numero_turno,'spc',s.nombre,'estado',i.estado,'propietario_id',i.propietario_id) order by ca.numero_turno) from inscripciones i join carreras ca on ca.id=i.carrera_id join reuniones re on re.id=ca.reunion_id join spcs s on s.id=i.spc_id where re.numero=6 and i.caballeriza_id='46cc818b-aac4-4d39-b3c9-0b0c156fc6cc')
union all select 'r9_null_global', (select jsonb_agg(jsonb_build_object('t',ca.numero_turno,'spc',s.nombre,'cab',c.nombre,'cab_id',i.caballeriza_id)) from inscripciones i join carreras ca on ca.id=i.carrera_id join spcs s on s.id=i.spc_id left join caballerizas c on c.id=i.caballeriza_id where ca.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9' and i.propietario_id is null)
union all select 'counts', (select jsonb_build_object('caballerizas',(select count(*) from caballerizas),'propietarios',(select count(*) from propietarios),'responsables',(select count(*) from caballeriza_responsables),'liq',(select count(*) from liquidaciones),'det',(select count(*) from liquidacion_detalle),'e6830f69',(select count(*) from caballerizas where id='e6830f69-2474-4d98-881a-2fcddc56b1b4')))
```
```json
r6:  [{"t":3,"spc":"LATIN RAIN","estado":"forfait","propietario_id":"a7b7fe52-…"},{"t":5,"spc":"LATIN RAIN","estado":"ratificado","propietario_id":"a7b7fe52-…"},{"t":9,"spc":"LATIN PRESUMIDA","estado":"ratificado","propietario_id":"a7b7fe52-…"},{"t":10,"spc":"LATIN PRESUMIDA","estado":"inscripto","propietario_id":"a7b7fe52-…"}]
r9_null_global: [{"t":2,"cab":"HARAS EL ORIGEN","spc":"DOCTORA MIA"},{"t":4,"cab":null,"spc":"NIÑO OCEANICO"},{"t":9,"cab":null,"spc":"THE BEAST PARTY"},{"t":10,"cab":"MONTE DEL TORDILLO","spc":"KRISTALINA"},{"t":10,"cab":null,"spc":"INDIANA MARO"},{"t":10,"cab":null,"spc":"ABARAJALA"},{"t":7,"cab":null,"spc":"EL RISKO"},{"t":11,"cab":null,"spc":"GOIADORA"},{"t":1,"cab":"SAICA","spc":"SI TIN"},{"t":2,"cab":"Abuelo Calin","spc":"ALHENA"},{"t":7,"cab":null,"spc":"ATOMIZADOR"},{"t":7,"cab":"LOS 6 CORAZONES","spc":"SEMBRADOR CHUCK"},{"t":3,"cab":null,"spc":"MARIA CATULENGA"},{"t":2,"cab":"2 DE ABRIL MAIPU","spc":"DEL CAMPEON"},{"t":4,"cab":"MONTE DEL TORDILLO","spc":"KRISTALINA"},{"t":4,"cab":"LA COLONIA","spc":"TOY BOY"}]
counts: {"det":493,"liq":189,"e6830f69":0,"caballerizas":299,"propietarios":264,"responsables":263}
```
```sql
select 'r9_totales' k, (select jsonb_build_object('inscr',count(*),'con_cab',count(*) filter (where caballeriza_id is not null),'sin_cab',count(*) filter (where caballeriza_id is null),'con_cab_sin_prop',count(*) filter (where caballeriza_id is not null and propietario_id is null),'con_prop',count(*) filter (where propietario_id is not null)) from inscripciones i join carreras ca on ca.id=i.carrera_id where ca.reunion_id='cafa37d6-89f4-45cb-a0d9-835bc27407e9') v
union all select 'cabs_sin_titular_en_r9', (select jsonb_agg(jsonb_build_object('cab',c.nombre,'cab_id',c.id,'hip',c.hipodromo_patente,'n_inscr_r9',n,'spcs',spcs,'responsables',(select jsonb_agg(…) from caballeriza_responsables r where r.caballeriza_id=c.id),'r8_inscr_sin_prop',(select count(*) from inscripciones i2 join carreras c2 on c2.id=i2.carrera_id where c2.reunion_id='7b6e003e-22e2-4629-bf55-f18560b1260f' and i2.caballeriza_id=c.id and i2.propietario_id is null)) order by n desc, c.nombre) from (select i.caballeriza_id, count(*) n, jsonb_agg(s.nombre) spcs from inscripciones i join carreras ca on ca.id=i.carrera_id join spcs s on s.id=i.spc_id where ca.reunion_id='cafa37d6-…' and i.caballeriza_id is not null and i.propietario_id is null group by 1) x join caballerizas c on c.id=x.caballeriza_id)
```
```json
[{"k":"r9_totales","v":{"inscr":72,"con_cab":64,"sin_cab":8,"con_prop":56,"con_cab_sin_prop":8}},
 {"k":"cabs_sin_titular_en_r9","v":[{"cab":"MONTE DEL TORDILLO","hip":null,"spcs":["KRISTALINA","KRISTALINA"],"cab_id":"01cbb031-50cd-43ed-9665-5c5bc4e7f99f","n_inscr_r9":2,"responsables":null,"r8_inscr_sin_prop":0},{"cab":"2 DE ABRIL MAIPU","hip":null,"spcs":["DEL CAMPEON"],"cab_id":"b562b75e-f1f8-4e6a-8d68-cbfcb2c61d5e","n_inscr_r9":1,"responsables":null,"r8_inscr_sin_prop":0},{"cab":"Abuelo Calin","hip":"DOL","spcs":["ALHENA"],"cab_id":"7f7cee40-beed-42fb-807a-70c900259be5","n_inscr_r9":1,"responsables":null,"r8_inscr_sin_prop":0},{"cab":"HARAS EL ORIGEN","hip":null,"spcs":["DOCTORA MIA"],"cab_id":"e664ce7c-78dd-4d1d-904b-c25cf0f92b96","n_inscr_r9":1,"responsables":null,"r8_inscr_sin_prop":4},{"cab":"LA COLONIA","hip":null,"spcs":["TOY BOY"],"cab_id":"559b97a6-ac5a-4d73-a160-99f8b8872756","n_inscr_r9":1,"responsables":null,"r8_inscr_sin_prop":0},{"cab":"LOS 6 CORAZONES","hip":null,"spcs":["SEMBRADOR CHUCK"],"cab_id":"a9da0600-320f-4aa9-baac-1eba3e981d7e","n_inscr_r9":1,"responsables":null,"r8_inscr_sin_prop":0},{"cab":"SAICA","hip":"DOL","spcs":["SI TIN"],"cab_id":"58b52430-ebb8-4d79-966e-60403c5a9100","n_inscr_r9":1,"responsables":null,"r8_inscr_sin_prop":1}]}]
```
