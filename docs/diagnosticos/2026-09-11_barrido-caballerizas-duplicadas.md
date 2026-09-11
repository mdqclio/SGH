# Barrido de caballerizas duplicadas por nombre normalizado (solo lectura)

**Fecha:** 2026-09-11 (noche) · **`main`:** `1f381c7` (merge `--no-ff` de `chore/issue-080-caballerizas-duplicadas`, pusheado) · **Solo lectura**: 2 `select`. Nada tocado.

## 0. Guards

| guard | esperado | real |
|---|---|---|
| `pwd` | `/home/clio/dev/SGH` | ✅ |
| `spcs` | 201 | ✅ |
| ref | `unlhcuanfrtpatoipwve` | ✅ |
| `caballerizas` | 300 | ✅ (post merge LOS URONES) |

---

## 1. Veredicto

**LOS URONES no era la única.** Sobre las 300 quedan **4 pares** (8 filas), todos en Dolores, ninguno cross-club:

| # | par | tipo de duplicado | mismo patrón que LOS URONES | plata involucrada | urgencia |
|---|---|---|---|---|---|
| 1 | `El linye y Rami` / `EL LINYE Y RAMI` | exacto (sólo mayúsculas) | **sí**: provisorio de R8 + titular real (CUEVAS CESAR DANIEL) | **sí, en los dos lados** | media |
| 2 | `La Narcisa` / `LA NARCISA` | exacto (sólo mayúsculas) | no: una está **vacía** (0 inscr, 0 SPC, 0 responsables) | no | baja — borrar la vacía |
| 3 | `CAROSUEÑO` / `CAROSUEÑO (DOL)` | sufijo `(DOL)` | invertido: la **con sufijo** tiene toda la historia y **sin titular**; la sin sufijo tiene el titular (BRIGANTI) y nada más | no (todavía) | **alta: tiene 3 inscripciones en R9** |
| 4 | `SANTA BARBARA` / `SANTA BARBARA (DOL)` | sufijo `(DOL)` | idem 3: la sin sufijo tiene la historia (LUMIN R6/R8) sin titular; la `(DOL)` tiene el titular (PEREZ) y nada más | no | media |

Los pares 3 y 4 son otro origen: no los creó Yesi hoy, son dos cargas distintas del mismo stud (una con `(DOL)` en el nombre y `hipodromo_patente` NULL, otra sin sufijo y con `hipodromo_patente='DOL'`) que nunca se unieron. El de hoy (LOS URONES) y el par 1 son "provisorio + real". El 2 es basura.

**Nada ejecutado.** Cada par necesita una decisión distinta (§3).

---

## 2. Método y salida cruda

Normalización: `translate` de acentos, `upper`, sólo `[A-Za-z0-9]` → `nn`. Segunda pasada quitando un sufijo final entre paréntesis `(…)` → `nn_sin_sufijo`, y agrupando sólo cuando las grafías difieren (para no re-listar los exactos). Cross-club: `nn` igual en clubs distintos.

```sql
with n as (
  select c.id, c.nombre, c.club_id, c.hipodromo_patente, c.estado, c.activo, c.responsable,
         upper(regexp_replace(translate(c.nombre,'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'),'[^A-Za-z0-9]','','g')) nn,
         upper(regexp_replace(regexp_replace(translate(c.nombre,'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'),'\s*\([^)]*\)\s*$',''),'[^A-Za-z0-9]','','g')) nn_sin_sufijo,
         (select count(*) from inscripciones i where i.caballeriza_id=c.id) n_inscr,
         (select count(*) from spcs s where s.caballeriza_id=c.id) n_spcs,
         (select count(*) from caballeriza_responsables r where r.caballeriza_id=c.id) n_resp,
         (select string_agg(coalesce(r.apellido||' ','')||coalesce(r.nombre,'')||' ['||coalesce(r.documento_nro,'sin DNI')||']'||case when p.notas like 'provisorio R%' then ' PROV' else '' end, ' + ') from caballeriza_responsables r left join propietarios p on p.id=r.propietario_id where r.caballeriza_id=c.id and r.rol='propietario' and r.activo) titulares
  from caballerizas c)
select 'exacto_mismo_club' k, coalesce((select jsonb_agg(jsonb_build_object('nn',nn,'n',n,'filas',filas)) from (select nn, club_id, count(*) n, jsonb_agg(jsonb_build_object('id',id,'nombre',nombre,'hip',hipodromo_patente,'estado',estado,'inscr',n_inscr,'spcs',n_spcs,'resp',n_resp,'titulares',titulares)) filas from n group by nn, club_id having count(*)>1) x), '[]') v
union all select 'exacto_cross_club', coalesce((select jsonb_agg(jsonb_build_object('nn',nn,'n',n,'filas',filas)) from (select nn, count(*) n, count(distinct club_id) nc, jsonb_agg(jsonb_build_object('id',id,'nombre',nombre,'club',club_id,'hip',hipodromo_patente,'inscr',n_inscr)) filas from n group by nn having count(*)>1 and count(distinct club_id)>1) x), '[]')
union all select 'sin_sufijo_mismo_club', coalesce((select jsonb_agg(jsonb_build_object('base',nn_sin_sufijo,'n',n,'filas',filas)) from (select nn_sin_sufijo, club_id, count(*) n, jsonb_agg(jsonb_build_object('id',id,'nombre',nombre,'hip',hipodromo_patente,'estado',estado,'inscr',n_inscr,'spcs',n_spcs,'titulares',titulares)) filas from n group by nn_sin_sufijo, club_id having count(*)>1 and count(distinct nn)>1) x), '[]')
union all select 'total', to_jsonb((select count(*) from n))
```
```json
[{"k":"exacto_mismo_club","v":[
  {"n":2,"nn":"ELLINYEYRAMI","filas":[{"id":"a692fdea-6434-4121-8a34-cc6b26d5c228","hip":"DOL","resp":1,"spcs":0,"inscr":2,"estado":"activo","nombre":"El linye y Rami","titulares":"El linye y Rami [sin DNI] PROV"},{"id":"d8f78de4-e153-4b12-8640-4a8674a58aa7","hip":"DOL","resp":1,"spcs":3,"inscr":4,"estado":"activo","nombre":"EL LINYE Y RAMI","titulares":"CUEVAS CESAR DANIEL [23983195]"}]},
  {"n":2,"nn":"LANARCISA","filas":[{"id":"5b49b278-2163-4246-a1a5-61ea69b83a1a","hip":"DOL","resp":0,"spcs":0,"inscr":0,"estado":"activo","nombre":"La Narcisa","titulares":null},{"id":"f2b6f35b-9b12-4443-a538-9d5ff14f4774","hip":"DOL","resp":2,"spcs":2,"inscr":2,"estado":"activo","nombre":"LA NARCISA","titulares":"CARLI ORNELA [34653709]"}]}]},
 {"k":"exacto_cross_club","v":[]},
 {"k":"sin_sufijo_mismo_club","v":[
  {"n":2,"base":"CAROSUENO","filas":[{"id":"e6830f69-2474-4d98-881a-2fcddc56b1b4","hip":"DOL","spcs":0,"inscr":0,"estado":"activo","nombre":"CAROSUEÑO","titulares":"BRIGANTI MARIA LAURA [27122763]"},{"id":"46cc818b-aac4-4d39-b3c9-0b0c156fc6cc","hip":null,"spcs":2,"inscr":7,"estado":"activo","nombre":"CAROSUEÑO (DOL)","titulares":null}]},
  {"n":2,"base":"SANTABARBARA","filas":[{"id":"1bb92f70-e651-4888-9cb5-7b2d2573ca45","hip":null,"spcs":1,"inscr":2,"estado":"activo","nombre":"SANTA BARBARA","titulares":null},{"id":"0dc1260f-a496-4ba2-b680-d42a85b95518","hip":"DOL","spcs":0,"inscr":0,"estado":"activo","nombre":"SANTA BARBARA (DOL)","titulares":"PEREZ GUILLERMO HERNESTO [27105881]"}]}]},
 {"k":"total","v":300}]
```

Detalle por fila (inscripciones con reunión/turno/SPC/estado/propietario derivado, SPC con la caballeriza en la ficha, responsables con plata):

```sql
select c.nombre, c.id, c.hipodromo_patente hip,
 (select jsonb_agg(jsonb_build_object('r',re.numero,'t',ca.numero_turno,'spc',s.nombre,'est',i.estado,'prop',left(i.propietario_id::text,8)) order by re.numero, ca.numero_turno) from inscripciones i join carreras ca on ca.id=i.carrera_id join reuniones re on re.id=ca.reunion_id join spcs s on s.id=i.spc_id where i.caballeriza_id=c.id) inscr,
 (select jsonb_agg(s.nombre) from spcs s where s.caballeriza_id=c.id) spcs_ficha,
 (select jsonb_agg(jsonb_build_object('rol',r.rol,'act',r.activo,'quien',coalesce(r.apellido||' ','')||coalesce(r.nombre,''),'dni',r.documento_nro,'prop',left(r.propietario_id::text,8),'prop_notas',p.notas,'liq',(select count(*) from liquidaciones l where l.propietario_id=r.propietario_id),'det_pag',(select count(*) from liquidacion_detalle d where d.beneficiario_id=r.propietario_id and d.estado_linea='pagado'))) from caballeriza_responsables r left join propietarios p on p.id=r.propietario_id where r.caballeriza_id=c.id) resp
from caballerizas c where c.id in (…los 8 ids…) order by upper(c.nombre), c.nombre
```
```json
[{"nombre":"CAROSUEÑO","id":"e6830f69-2474-4d98-881a-2fcddc56b1b4","hip":"DOL","inscr":null,"spcs_ficha":null,"resp":[{"act":true,"dni":"27122763","liq":0,"rol":"propietario","prop":"a7b7fe52","quien":"BRIGANTI MARIA LAURA","det_pag":0,"prop_notas":null}]},
 {"nombre":"CAROSUEÑO (DOL)","id":"46cc818b-aac4-4d39-b3c9-0b0c156fc6cc","hip":null,"inscr":[{"r":6,"t":3,"est":"forfait","spc":"LATIN RAIN","prop":null},{"r":6,"t":5,"est":"ratificado","spc":"LATIN RAIN","prop":null},{"r":6,"t":9,"est":"ratificado","spc":"LATIN PRESUMIDA","prop":null},{"r":6,"t":10,"est":"inscripto","spc":"LATIN PRESUMIDA","prop":null},{"r":9,"t":7,"est":"inscripto","spc":"LATIN PRESUMIDA","prop":null},{"r":9,"t":8,"est":"inscripto","spc":"LATIN PRESUMIDA","prop":null},{"r":9,"t":10,"est":"inscripto","spc":"LATIN RAIN","prop":null}],"spcs_ficha":["LATIN RAIN","LATIN PRESUMIDA"],"resp":null},
 {"nombre":"El linye y Rami","id":"a692fdea-6434-4121-8a34-cc6b26d5c228","hip":"DOL","inscr":[{"r":8,"t":11,"est":"forfait","spc":"DE BELLOSO","prop":null},{"r":8,"t":12,"est":"ratificado","spc":"DE BELLOSO","prop":"8021028e"}],"spcs_ficha":null,"resp":[{"act":true,"dni":null,"liq":1,"rol":"propietario","prop":"8021028e","quien":"El linye y Rami","det_pag":1,"prop_notas":"provisorio R8 15/08"}]},
 {"nombre":"EL LINYE Y RAMI","id":"d8f78de4-e153-4b12-8640-4a8674a58aa7","hip":"DOL","inscr":[{"r":6,"t":1,"est":"ratificado","spc":"De Moda","prop":"8f63f7ab"},{"r":6,"t":9,"est":"ratificado","spc":"LA DIVERTENTE","prop":"8f63f7ab"},{"r":8,"t":8,"est":"forfait","spc":"LA DIVERTENTE","prop":"8f63f7ab"},{"r":8,"t":10,"est":"ratificado","spc":"LA DIVERTENTE","prop":"8f63f7ab"}],"spcs_ficha":["De Moda","LA DIVERTENTE","DE BELLOSO"],"resp":[{"act":true,"dni":"23983195","liq":2,"rol":"propietario","prop":"8f63f7ab","quien":"CUEVAS CESAR DANIEL","det_pag":3,"prop_notas":null}]},
 {"nombre":"La Narcisa","id":"5b49b278-2163-4246-a1a5-61ea69b83a1a","hip":"DOL","inscr":null,"spcs_ficha":null,"resp":null},
 {"nombre":"LA NARCISA","id":"f2b6f35b-9b12-4443-a538-9d5ff14f4774","hip":"DOL","inscr":[{"r":6,"t":1,"est":"ratificado","spc":"DOCTORA APASIONADA","prop":"02fecba6"},{"r":6,"t":2,"est":"ratificado","spc":"DOCTOR SKY","prop":"02fecba6"}],"spcs_ficha":["DOCTORA APASIONADA","DOCTOR SKY"],"resp":[{"act":true,"dni":"29785033","liq":0,"rol":"copropietario","prop":"b2586df2","quien":"CARLI FEDERICO","det_pag":0,"prop_notas":null},{"act":true,"dni":"34653709","liq":1,"rol":"propietario","prop":"02fecba6","quien":"CARLI ORNELA","det_pag":2,"prop_notas":null}]},
 {"nombre":"SANTA BARBARA","id":"1bb92f70-e651-4888-9cb5-7b2d2573ca45","hip":null,"inscr":[{"r":6,"t":6,"est":"ratificado","spc":"LUMIN","prop":null},{"r":8,"t":9,"est":"inscripto","spc":"LUMIN","prop":null}],"spcs_ficha":["LUMIN"],"resp":null},
 {"nombre":"SANTA BARBARA (DOL)","id":"0dc1260f-a496-4ba2-b680-d42a85b95518","hip":"DOL","inscr":null,"spcs_ficha":null,"resp":[{"act":true,"dni":"27105881","liq":0,"rol":"propietario","prop":"bad57ffe","quien":"PEREZ GUILLERMO HERNESTO","det_pag":0,"prop_notas":null}]}]
```

---

## 3. Par por par

### 3.1 `El linye y Rami` (`a692fdea`) / `EL LINYE Y RAMI` (`d8f78de4`) — provisorio + real, **plata en los dos**

| | `El linye y Rami` (minúsculas) | `EL LINYE Y RAMI` |
|---|---|---|
| titular | **provisorio R8** `8021028e` (sin DNI) — **1 liquidación, 1 línea pagada** | **CUEVAS CESAR DANIEL** DNI 23983195, `8f63f7ab` — 2 liquidaciones, 3 líneas pagadas |
| inscripciones | DE BELLOSO R8 T11 forfait / **R8 T12 ratificado** (prop = provisorio) | De Moda R6, LA DIVERTENTE R6/R8 (prop = CUEVAS) |
| `spcs.caballeriza_id` | ninguno | De Moda, LA DIVERTENTE **y DE BELLOSO** |

**DE BELLOSO tiene la ficha en la real y la inscripción de R8 en la provisoria**: es el mismo stud, sin duda. Es LOS URONES con una diferencia que importa: **el provisorio ya cobró** (una línea `pagado`, saldado del 28/08), así que "completar el provisorio" no aplica — el titular real ya existe con su propio id y su propia plata. Resolver = **sobrevive la real** (`d8f78de4` / `8f63f7ab`) y hay que **mover la línea pagada** del provisorio `8021028e` al propietario `8f63f7ab` (`liquidaciones.propietario_id` + `liquidacion_detalle.beneficiario_id`), re-apuntar las 2 inscripciones de DE BELLOSO, y borrar provisorio + caballeriza minúscula. **Toca plata saldada** → decisión tuya, y probablemente con Fede: es reasignar un pago hecho a "El linye y Rami" a nombre de CUEVAS. Sin urgencia de R9 (no tiene inscripciones ahí).

### 3.2 `La Narcisa` (`5b49b278`) / `LA NARCISA` (`f2b6f35b`) — la minúscula está vacía

`La Narcisa`: 0 inscripciones, 0 SPC, 0 responsables, `hipodromo_patente` DOL. No tiene nada colgado (FKs: `profesionales`, `spcs`, `inscripciones`, `caballeriza_responsables` — todos 0 para este id; **sin verificar** `profesionales.caballeriza_id`, lo cubro en el DELETE con guarda). `LA NARCISA` es la buena (CARLI ORNELA + copropietario, R6, plata). **`DELETE FROM caballerizas WHERE id='5b49b278-…' AND NOT EXISTS (…)`**, una línea. Sin decisión de negocio.

### 3.3 `CAROSUEÑO` (`e6830f69`) / `CAROSUEÑO (DOL)` (`46cc818b`) — **urgente por R9**

| | `CAROSUEÑO` | `CAROSUEÑO (DOL)` |
|---|---|---|
| `hipodromo_patente` | DOL | NULL |
| titular | **BRIGANTI MARIA LAURA** DNI 27122763 (`a7b7fe52`, sin plata) | **ninguno** |
| inscripciones | ninguna | **7**: LATIN RAIN y LATIN PRESUMIDA en R6 (4) y **R9 T7, T8, T10 (3)** — todas con `propietario_id NULL` |
| `spcs.caballeriza_id` | ninguno | LATIN RAIN, LATIN PRESUMIDA |

Mismo stud partido en dos: la ficha con el dueño no tiene caballos; la ficha con los caballos no tiene dueño. Por eso las 4 inscripciones de R6 quedaron **sin propietario** (bono/premio del propietario no liquidable, GOTCHA #47) y las 3 de R9 van por el mismo camino. Fix: **mover el responsable BRIGANTI a `CAROSUEÑO (DOL)`** (o al revés, mover 7 inscripciones + 2 SPC a `CAROSUEÑO` — más filas, mismo resultado), poner `hipodromo_patente='DOL'`, borrar la vacía, y **re-derivar** `propietario_id` en las 7 inscripciones (B6 del runbook, acotado) — las de R6 ya corridas quedan con dueño para el historial; las de R9 antes del lunes. Decisión: cuál id sobrevive; propongo la `(DOL)` (menos filas que mover, los SPC ya apuntan ahí) renombrada a `CAROSUEÑO`.

### 3.4 `SANTA BARBARA` (`1bb92f70`) / `SANTA BARBARA (DOL)` (`0dc1260f`) — mismo caso que 3.3, sin R9

`SANTA BARBARA`: LUMIN (ficha + R6 T6 ratificado + R8 T9 inscripto), sin titular, `hipodromo_patente` NULL. `SANTA BARBARA (DOL)`: titular PEREZ GUILLERMO HERNESTO DNI 27105881 (`bad57ffe`, sin plata), nada más. Mismo fix que 3.3 con los roles invertidos: mover PEREZ a `SANTA BARBARA`, `hipodromo_patente='DOL'`, borrar la `(DOL)`, re-derivar las 2 inscripciones de LUMIN.

Origen probable de 3.3 y 3.4 (**sin verificar**): dos importaciones — una con los nombres con sufijo `(DOL)` y sin `hipodromo_patente` (la que trajo los SPC e inscripciones de R6), otra con nombres limpios + `hipodromo_patente` + responsables (la de `docs/CABALLERIZAS_JSON_DIEGO.md` / `data/caballerizas_20j_*`). Los otros 3 nombres con `(DOL)` en la base (§4 del informe de EL DON JORGE: 3 filas) conviene mirarlos con el mismo ojo aunque no dupliquen por nombre.

---

## 4. Orden que propongo (todo con OK aparte, uno por par)

1. **3.3 CAROSUEÑO** — antes del lunes 14/09: tiene 3 inscripciones en R9 sin dueño. Sin plata, sin riesgo.
2. **3.2 LA NARCISA** — un DELETE con guardas. Sin riesgo.
3. **3.4 SANTA BARBARA** — sin plata, sin R9. Cuando quieras.
4. **3.1 EL LINYE Y RAMI** — mueve una línea pagada de un propietario a otro. Con Fede.

Para ISSUE-080: el índice único parcial por `(club_id, nombre normalizado)` **no se puede crear hoy** — chocaría con los pares 1 y 2 (exactos). Con 3.1 y 3.2 resueltos ya no choca (3.3 y 3.4 difieren en el sufijo, el índice exacto no los ve — por eso el aviso de parecidos en pantalla tiene que normalizar el sufijo, no sólo mayúsculas).

---

## 5. Verificación de push

```
$ git ls-remote origin main
1f381c799bb6de706ae0fc6b2fbd72a47a0f5c4b	refs/heads/main
$ git push origin reports
$ git ls-remote origin reports
eee83762a67b4407405b5f0b2ff86f4a53ea2484	refs/heads/reports
$ git rev-parse HEAD
eee83762a67b4407405b5f0b2ff86f4a53ea2484
```
