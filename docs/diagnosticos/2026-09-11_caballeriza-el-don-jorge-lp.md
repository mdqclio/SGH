# Caballeriza "EL DON JORGE (LP)" — chequeo previo al alta (solo lectura)

**Fecha:** 2026-09-11 (noche) · **`main`:** `95b7369` · **Solo lectura**: 6 `select`, 2 `grep`. Nada creado.

## 0. Guards

| guard | esperado | real |
|---|---|---|
| `pwd` | `/home/clio/dev/SGH` | ✅ |
| `spcs` | 201 | ✅ (no se tocó) |
| ref | `unlhcuanfrtpatoipwve` | ✅ |
| `caballerizas` | — | **300** (296 Dolores, 4 de otros clubs, 0 con `club_id` NULL). A las 17:2x UTC eran 299 — ver §5 |

---

## 1. Veredicto

**No existe. Hay que crearla.** Ninguna caballeriza con JORGE / DON JORGE / EL DON JORGE en ningún club, con ni sin acento, con ni sin `(LP)`. El único vecino es `DON JOACO` (Dolores, KUKO JUAN PABLO) — otro nombre. Ni los dos caballos ni el cuidador TAVAGNUTTI están colgados de ninguna caballeriza que pueda ser ésta con otra grafía.

Dos cosas antes de que Yesi la cree:

- **La convención del sufijo no existe** — hay tres formas distintas en la base (§3). Propuesta abajo.
- **`caballerizas.html` sí manda `club_id`** (§4), no tiene el defecto de propietarios/profesionales. Pero **hoy mismo Yesi creó una caballeriza duplicada** (`LOS URONES`, §5): la tabla no tiene índice único por nombre y la pantalla no avisa. Para EL DON JORGE no hay riesgo (no existe), pero es la trampa que sigue.

---

## 2. Parecidos — nada

```sql
with n as (select c.*, upper(regexp_replace(translate(nombre,'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'),'[^A-Za-z0-9]','','g')) nn from caballerizas c)
select jsonb_agg(jsonb_build_object('id',id,'nombre',nombre,'club',club_id,'hip',hipodromo_patente,'estado',estado,'activo',activo,'responsable',responsable) order by nombre) from n where nn like '%JORGE%' or nn like '%DONJ%'
```
```json
[{"id":"8a71a402-063a-4aab-b753-86560718366f","hip":"DOL","club":"0649e9c5-9e87-4aad-842f-101458e6b33c","activo":true,"estado":"activo","nombre":"DON JOACO","responsable":"KUKO JUAN PABLO (propietario)"}]
```

Normalización: sin acentos, sin espacios ni paréntesis, mayúsculas → `ELDONJORGELP`, `DONJORGE`, `JORGE` caen todos en `%JORGE%`; `%DONJ%` atrapa además cualquier "DON J…". Sólo `DON JOACO`. Sin filtro de club (las 300).

---

## 3. Los caballos y el cuidador — no hay caballeriza previa

Nota: la planilla que me pasaste tenía MARIA CATULANGA en **T3** (no T11) y NIÑO OSEANICO en T4. En la base MARIA CATULENGA está inscripta en **T3**. Lo tomo como T3.

```sql
-- caballos (por studbook_id de las altas de hoy) + sus inscripciones
select jsonb_agg(jsonb_build_object('spc',s.nombre,'sb',s.studbook_id,'cab_spc',cb.nombre,'ent_spc',p.apellido||' '||coalesce(p.nombre,''),'inscr',(select jsonb_agg(jsonb_build_object('reunion',r.numero,'turno',c.numero_turno,'cab',cb2.nombre,'ent',p2.apellido||' '||coalesce(p2.nombre,''),'estado',i.estado)) from inscripciones i join carreras c on c.id=i.carrera_id join reuniones r on r.id=c.reunion_id left join caballerizas cb2 on cb2.id=i.caballeriza_id left join profesionales p2 on p2.id=i.entrenador_id where i.spc_id=s.id))) from spcs s left join caballerizas cb on cb.id=s.caballeriza_id left join profesionales p on p.id=s.entrenador_id where s.studbook_id in ('428019','440678')
```
```json
[{"sb":"440678","spc":"MARIA CATULENGA","inscr":[{"cab":null,"ent":"TAVAGNUTTI RICARDO H","turno":3,"estado":"inscripto","reunion":9}],"cab_spc":null,"ent_spc":null},
 {"sb":"428019","spc":"NIÑO OCEANICO","inscr":null,"cab_spc":null,"ent_spc":null}]
```

- **MARIA CATULENGA**: Yesi **ya la inscribió en R9 T3** con entrenador TAVAGNUTTI RICARDO H y **`caballeriza_id` NULL** — o sea, está esperando justamente esta caballeriza. `spcs.caballeriza_id` y `spcs.entrenador_id` también NULL (son altas de hoy).
- **NIÑO OCEANICO**: sin inscripción todavía, sin caballeriza ni entrenador en la ficha.

```sql
-- el cuidador, en las 4 tablas donde podría estar colgado de una caballeriza
select ... from profesionales p where apellido ilike '%TAVAG%' or apellido ilike '%TABAG%'   -- ficha
select ... from caballeriza_responsables cr ... where cr.profesional_id in (…TAVAG…) or cr.propietario_id in (…)  -- responsable
select ... from propietarios where nombre ilike '%TAVAG%'                                     -- propietario
select ... from inscripciones i ... where i.entrenador_id in (…TAVAG…)                       -- inscripciones históricas
```
```json
{"tavagnutti":[{"id":"6b159718-dd90-4512-bd06-72de2c20ab33","cab":null,"doc":"10083602","club":"0649e9c5-9e87-4aad-842f-101458e6b33c","tipo":"entrenador","cab_id":null,"estado":"activo","nombre":"RICARDO H","apellido":"TAVAGNUTTI"}],
 "tavagnutti_resp":[],
 "tavagnutti_prop":[],
 "tavagnutti_inscr":[{"cab":"MARTIN Y NICOLAS","spc":"AMIGUITO JESUS","turno":6,"reunion":6},{"cab":null,"spc":"MARIA CATULENGA","turno":3,"reunion":9}]}
```

TAVAGNUTTI RICARDO H existe (entrenador Dolores, DNI 10083602), **sin `caballeriza_id`**, no es responsable de ninguna, no es propietario. Su única inscripción previa (R6 T6, AMIGUITO JESUS) fue con caballeriza **MARTIN Y NICOLAS** — otro stud, no es un alias de DON JORGE. Nada lo vincula a una caballeriza que ya exista con este nombre.

---

## 4. Sufijo (LP) — tres convenciones a la vez

```sql
select nombre, club_id, hipodromo_patente from caballerizas where nombre ~* '\(\s*LP\s*\)|\mLP\M'
```
```json
[{"hip":null,"club":"0649e9c5-…","nombre":"GARIN CITY (LP)"},{"hip":null,"club":"0649e9c5-…","nombre":"JUVENTUD LP"},{"hip":null,"club":"0649e9c5-…","nombre":"LA ESCUELITA LP"}]
```
```sql
select substring(nombre from '\(([^)]*)\)\s*$') suf, count(*) from caballerizas where nombre ~ '\([^)]*\)\s*$' group by 1
```
```json
[{"n":3,"suf":"DOL"},{"n":2,"suf":"AZ"},{"n":2,"suf":"TDL"},{"n":1,"suf":"LP"},{"n":1,"suf":"SL"}]
```
```sql
select hipodromo_patente, count(*) from caballerizas group by 1
```
```json
[{"n":220,"hip":"DOL"},{"n":74,"hip":null},{"n":2,"hip":"LP"},{"n":1,"hip":"AZ"},{"n":1,"hip":"TANDIL"},{"n":1,"hip":"PALERMO"},{"n":1,"hip":"SR"}]
```
Las 2 con `hipodromo_patente='LP'`: `TIAN Y ROMA`, `BETTY SANTI` — **sin** sufijo en el nombre.

| forma | ejemplos | cuántas |
|---|---|---|
| sufijo entre paréntesis en el nombre, `hipodromo_patente` NULL | `GARIN CITY (LP)` (y `(DOL)` ×3, `(AZ)` ×2, `(TDL)` ×2, `(SL)` ×1) | 1 LP / 9 en total |
| sufijo suelto en el nombre, sin paréntesis, `hipodromo_patente` NULL | `JUVENTUD LP`, `LA ESCUELITA LP` | 2 |
| nombre limpio, `hipodromo_patente='LP'` | `TIAN Y ROMA`, `BETTY SANTI` | 2 |

No hay convención: 5 caballerizas de La Plata, 3 maneras. La columna `hipodromo_patente` es la que existe para esto (220 filas con `DOL`), y el sufijo en el nombre es lo que se ve en el programa.

**Propuesta (decisión tuya, no la tomo):** `nombre = 'EL DON JORGE (LP)'` **y** `hipodromo_patente = 'LP'`. Cubre las dos: el nombre sigue el único precedente con paréntesis (`GARIN CITY (LP)`), que es además como lo escribió Yesi, y la columna queda como en `TIAN Y ROMA` / `BETTY SANTI` para poder filtrar. Las otras 3 de LP quedan como están (ordenarlas es otro pedido).

---

## 5. `caballerizas.html` — el alta SÍ manda `club_id`. Pero deja duplicar.

`caballerizas.html:620-629` (`grep -n "club_id\|\.insert(" caballerizas.html`):

```javascript
  const cabPayload = {
    club_id:   CLUB_ID,
    nombre:    document.getElementById('f-nombre').value.trim(),
    telefono:  document.getElementById('f-telefono').value.trim() || null,
    estado:    nuevoEstado,
    activo:    nuevoEstado === 'activo',
    notas:     document.getElementById('f-notas').value.trim() || null,
    hipodromo_patente:       document.getElementById('f-hipodromo-patente').value.trim() || null,
    chaquetilla_descripcion: document.getElementById('f-chaq-desc').value.trim() || null,
    chaquetilla_url:         chaquetillaUrl,
  };
  …
    const { data, error } = await sb.from('caballerizas').insert(cabPayload).select('id').single();
```

- `club_id: CLUB_ID` ✅ — `CLUB_ID` = `usr.club_id` para Yesi (`initAuth`, línea 243). El listado filtra `.eq('club_id', CLUB_ID)` (línea 279). **No tiene el defecto de ISSUE-072.** Confirmado por los datos: 0 caballerizas con `club_id` NULL.
- RLS `caballerizas_insert`: `NOT fn_is_portal_user() AND (fn_is_super_admin() OR club_id = fn_get_user_club_id())` → Yesi inserta en su club ✅. Sin gate de rol en el botón (`grep super_admin caballerizas.html` → sólo `initAuth`).
- **Prueba viva de que funciona**: hoy a las **16:57 AR** Yesi creó `LOS URONES` con responsable HUGO FABIAN TRUPPA y `hipodromo_patente='DOL'` (299 → 300). Con `club_id` Dolores. Aparece en su listado.

**El problema es el opuesto**: esa alta es un **duplicado**. Ya existía `LOS URONES` del 18/08 (sin responsable, `hipodromo_patente` NULL):

```sql
select c.nombre, c.club_id, c.hipodromo_patente, c.estado, c.responsable, cr.created_at, now() from caballerizas c left join caballeriza_responsables cr on cr.caballeriza_id=c.id where c.nombre ilike 'LOS URONES'
```
```json
[{"nombre":"LOS URONES","club_id":"0649e9c5-…","hipodromo_patente":null,"estado":"activo","responsable":null,"created_at":"2026-08-18 16:16:40.270291","ahora":"2026-09-11 20:11:53.320463+00"},
 {"nombre":"LOS URONES","club_id":"0649e9c5-…","hipodromo_patente":"DOL","estado":"activo","responsable":"HUGO FABIAN TRUPPA (propietario)","created_at":"2026-09-11 19:57:14.385209","ahora":"2026-09-11 20:11:53.320463+00"}]
```
(`caballeriza_responsables.created_at` es `timestamp` **sin zona** — el valor es UTC naive; 19:57 UTC = 16:57 AR. **Sin verificar** que el trigger/default lo escriba en UTC y no en hora local del servidor; la diferencia con `now()` es de 15 min, consistente con UTC.)

Por qué pudo pasar: `pg_indexes` sobre `caballerizas` → sólo `caballerizas_pkey`. **No hay unique por (club_id, nombre)** y la pantalla no busca parecidos antes de insertar (a diferencia de profesionales, que desde hoy tiene `profesionales-duplicados.js`). Es el mismo hueco que cerró ISSUE-079 para el DNI de profesionales, pero por nombre de caballeriza. `caballerizas` no tiene trigger de auditoría, así que tampoco queda rastro de quién/cuándo salvo por `caballeriza_responsables.created_at`.

Menor, mismo patrón que ISSUE-073: el UPDATE (`:635`) va `.eq('id', id)` sin `.eq('club_id', CLUB_ID)` — no afecta este alta.

---

## 6. Qué haría

1. **EL DON JORGE**: que Yesi la cree desde Caballerizas con `EL DON JORGE (LP)` + hipódromo `LP` (si aprobás la propuesta de §4). Después, en Inscripciones, asignarla a MARIA CATULENGA (T3, ya inscripta con caballeriza NULL) y a NIÑO OCEANICO cuando lo anote.
2. **LOS URONES duplicada** — decidir: (a) borrar la del 18/08 (sin responsable, sin `hipodromo_patente`) si no tiene inscripciones ni SPC colgados — **sin verificar** todavía, no lo consulté; o (b) fusionar. Lo miro si querés, es otro pedido.
3. **Deuda nueva**: aviso de parecidos (o unique `(club_id, nombre normalizado)`) en `caballerizas.html`. Candidato a ISSUE-080.

---

## 7. Verificación de push

```
$ git push origin reports
$ git ls-remote origin reports
7d080e2d78ec1228f31a7336011801fb546e571d	refs/heads/reports
$ git rev-parse HEAD
7d080e2d78ec1228f31a7336011801fb546e571d
```
