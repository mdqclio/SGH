# R9 — resumen del plan de caballerizas, cruce de la planilla (caballerizas) y THE BEAST PARTY (SOLO LECTURA)

- **Fecha**: 2026-09-16, 19:10–19:20 UTC (16:10 AR). Reunión: **domingo 20/09**.
- **`main`**: `7887a27f2dc2cbf0d1c3a16a1e82b0b4d31d1ace`. Este archivo en `reports`. **Nada escrito** en repo ni base.
- Guards: `pwd=/home/clio/dev/SGH`, `spcs=210`, ref `unlhcuanfrtpatoipwve`.

## 0. Lo urgente primero — THE BEAST PARTY (T9)

**Está bien: figura `forfait` desde el lunes 14/09 18:42 UTC, cargado por Yesi. No sale como corredor en el programa.**

```json
{"spc":"THE BEAST PARTY","spc_id":"8b9d9d37-1e84-4775-96be-3d3fbd0518e5","insc_id":"6a100354-1c5b-49ec-bbb7-4294217809fd",
 "turno":9,"carrera_estado":"abierta","estado":"forfait","canal":"manual","numero_partidor":null,"motivo_estado":null,
 "caballeriza":null,"propietario_id":null,"jockey":null,"entrenador":null,
 "created":"2026-09-11T20:32:02.878703+00:00","updated":"2026-09-14T18:42:57.277737+00:00"}
```

Auditoría de la fila (3 eventos, todos `yesica@sgh.com`):

| cuándo (UTC) | acción | cambio |
|---|---|---|
| 2026-09-11 20:32:02 | INSERT | nace `inscripto` |
| 2026-09-11 21:49:06 | UPDATE | `certificado_correr` |
| **2026-09-14 18:42:57** | **UPDATE** | **`estado`: `inscripto` → `forfait`** |

En el sistema "eliminado en la planilla" = `forfait`. Cómo lo tratan las pantallas del domingo (`main`):

- `programa-oficial.html:458` y `programa-oficial-color.html:668`: `.filter(i => i.estado === 'ratificado')` → **no se imprime**.
- `programa.html:67-68`: `.forfait-row { opacity: .4 }` + tachado → aparece **tachado**, como borrado.
- `ratificacion.html`: bloque `pi-forfaits` ("BORRADOS") en el PDF.
- `renumerarChapas` filtra `ratificado` → **no ocupa mandil**.

T9 completo hoy:

```
ARTHURUS [ratificado] cab=∅ | CANDIDATA PIRANERA [ratificado] cab=∅ | CHINITA SALTEÑA [ratificado] cab=MELINA A |
ESPLENDID CRAF [ratificado] cab=MI MARTINCITO | LE BATEAU [forfait] cab=EL DESTINO | QUERELLANTE [ratificado] cab=POR SI LLEGA |
THE BEAST PARTY [forfait] cab=∅ | WISLA KEN [ratificado] cab=EL COLORADO
```

6 ratificados + 2 forfaits (LE BATEAU también). Si en alguna pantalla Yesi lo ve "inscripto", es caché del browser
(`Ctrl+Shift+R`): la base dice `forfait`. Lo único raro de la fila es que **nunca tuvo caballeriza ni jockey** — no
importa para un forfait.

---

## 1. El plan `9fd1498` / `417716e`, resumido

**Problema**: `caballerizas.html` exige apellido + nombre + DNI del propietario para guardar (validación de front,
`validateResponsables` `:446-462`, desde el 11/05). Yesi no puede crear una caballeriza sin titular, y tampoco puede
**editar** 95 de las 295 (43 sin titular + 52 con titular provisorio sin DNI): abrir y guardar sin tocar nada también
choca con la validación. La base no exige nada de eso. Contradice el criterio de Fede del 15/08 ("sin titular, se crea
igual y el dueño queda provisorio"), que se ejecutó por SQL (`DO`) y nunca llegó al formulario.

**A — provisorio automático (recomendada).** Titular opcional en el form. Si queda vacío, al guardar se llama a un
RPC nuevo `rpc_caballeriza_provisorio(caballeriza_id)` (`SECURITY DEFINER`, staff-only, idempotente) que hace **para
una caballeriza exactamente lo que hace el `DO`**: crea el `propietarios` provisorio con el nombre de la caballeriza
(sin DNI, `notas 'provisorio alta DD/MM/YYYY'`), el vínculo `rol propietario` sin DNI, y re-deriva las inscripciones
de esa caballeriza que estén sin `propietario_id`. Si ya hay titular → no hace nada; si hay un provisorio homónimo →
lo reusa; si hay un propietario **real** homónimo → falla y pide cargarlo como titular. Además: badge `sin titular` /
`provisorio` en las cards y botón **Crear provisorio** para las 43 existentes (PARAJE LA TABLADA incluida). ~3 h.

**B — mínima.** Titular opcional en el form y nada más: la caballeriza nace sin ninguna fila de responsable
(huérfana, como las 43). Después corro yo el `DO`, que sólo agarra las que tengan inscripción en R9 sin
`propietario_id`. ~1 h, pero cada alta de Yesi depende de que yo corra algo, y las otras 41 siguen huérfanas.

**Por qué A.** B no cumple el criterio del 15/08 (deja la caballeriza sin dueño) y traslada el trabajo a un `DO`
manual. A es la misma lógica ya ejecutada dos veces en producción (18/08, 11/09), metida en una función de una fila y
llamada desde el form; el riesgo nuevo es un RPC staff-only sin DDL de tablas (rollback = `DROP FUNCTION`), cubierto
por probe + mutantes. **El primer commit de la rama A es exactamente B**: si el domingo aprieta, se mergea eso.

**Lo que ninguna de las dos hace**: *completar* un provisorio con el DNI real desde la ficha (ISSUE-080). Hoy eso crea
otro propietario. El plan sólo impide que la edición rompa lo que hay.

### 1.1 §5.2 del diagnóstico — el riesgo en el camino de edición, tal cual

### 5.2 Qué rompe / qué hay que mirar en el mismo cambio

| | ¿rompe? | detalle |
|---|---|---|
| Base | **No** | Nada exige el titular (§1.3). Hoy ya hay 43 así y todo funciona. |
| Inscripciones que elijan esa caballeriza | **No rompe, pero deja `propietario_id = NULL`** | `trg_insc_set_propietario` no encuentra titular → NULL en silencio (GOTCHA #47). Es la misma situación de las 43 de hoy y de los 15 ratificados de R9 sin propietario. Lo regulariza el `DO` de provisorios — y para eso hace falta que **exista la caballeriza**, que es justamente lo que Yesi no puede hacer. Aflojar el form **destraba** el `DO`, no lo empeora. El portal ya avisa ("caballeriza sin titular") al anotar/modificar. |
| Liquidación | **No rompe** | Sin `propietario_id`, la línea del 70 % queda sin beneficiario hasta que haya provisorio o titular real. Es el estado actual de 15 ratificados de R9. |
| `caballerizas.html` edición — **riesgo preexistente que se vuelve más visible** | **Sí, hay que arreglarlo junto** | `saveRecord` en edición hace `delete().eq('caballeriza_id')` (`:644`) y reinserta lo que hay en el form. Hoy nadie llega ahí sin DNI porque la validación corta antes. Si el titular pasa a ser opcional, **editar una caballeriza con provisorio y dejar el bloque vacío borra el vínculo `rol propietario` del provisorio** → la caballeriza queda sin titular y sus inscripciones futuras sin `propietario_id` (las pasadas conservan el suyo porque `propietario_id` está copiado en `inscripciones`). Y al revés: tipear un DNI real sobre un provisorio **no completa** el provisorio — el trigger crea/encuentra **otro** `propietarios` por DNI y el provisorio queda huérfano con sus liquidaciones (ISSUE-080, caso LOS URONES). Fix mínimo: en edición, **si el bloque de propietario viene vacío, no tocar `caballeriza_responsables`** (no borrar, no insertar); y si viene con DNI y el titular actual es un provisorio, hacer `UPDATE` del responsable existente (mismo `id`) en vez de delete+insert — así el trigger `UPDATE OF documento_nro` completa el mismo `propietario_id`… **ojo**: `fn_caballeriza_resp_set_propietario` en UPDATE **busca por DNI y si no existe INSERTA uno nuevo** — o sea que también crearía otro propietario. Completar un provisorio por pantalla es ISSUE-080 y es un cambio aparte (RPC o UPDATE del `propietarios` provisorio con el DNI). Para **hoy**: alcanza con no borrar lo que no se tocó. |
| `responsable` (texto legado) | No | `buildResponsableText` devuelve `null` con el bloque vacío (`:655`). |
| Probes | No hay probe de `caballerizas.html` | Habría que escribir uno (alta sin titular → 0 filas en responsables; edición sin tocar → responsables intactos; edición con DNI nuevo sobre provisorio → **documentar** que hoy crea otro propietario). |

**Lo que el plan hace con eso**: en edición, `caballerizas.html` sólo escribe en `caballeriza_responsables` si el
usuario **cambió** el bloque de responsables (snapshot al cargar, comparación al guardar). Si quedó como lo prellenó
`loadRecord`, no borra ni inserta. Si lo cambió y quedó vacío → RPC (queda con provisorio). Si lo cambió y quedó
completo → camino actual. Con titular provisorio prellenado se muestra un aviso: "completarlo desde acá todavía crea
un propietario nuevo (ISSUE-080)".

---

## 2. Cruce de la planilla — caballerizas (lo único que vino en la planilla)

**Alcance real**: la planilla que pegaste trae **sólo caballerizas por turno** (70 menciones, 55 nombres distintos).
No trae SPC ni profesionales, así que **no puedo decir qué SPC ni qué jockeys/entrenadores nuevos hay**: para eso
necesito esas columnas. Lo que sigue es el cruce de caballerizas contra las 300 de Dolores (`caballerizas.club_id =
Dolores`, activas e inactivas), comparando sin mayúsculas, sin acentos y sin el sufijo `(DOL)/(LP)/(AZ)/(TDL)/(SL)`.

### 2.1 QUÉ NO EXISTE — 8 caballerizas nuevas (ningún parecido en la base)

| turno | planilla | búsqueda amplia hecha | resultado |
|---|---|---|---|
| T4 | **EL CHUCARO** | `%CHUCAR%` | nada |
| T4 | **EL FORTIN** | `%FORT%` | sólo `LA FORTALEZA (DOL)` y `FORTY FANTASIA (DOL)` — no son |
| T5 | **HS BUEN OJO** | `%BUEN%OJO%` | nada |
| T7 | **NAMANI** | `%NAMAN%` | nada |
| T7 | **SIN FRENO** | `%FRENO%` | nada |
| T9 | **EL GRANJERO** | `%GRANJ%` | nada |
| T10 | **HS LA HORMIGONERA** | `%HORMIG%` | nada |
| T11 | **DON PIPO (AZ)** | `%PIPO%` | nada |

Estas 8 hay que **crearlas** — y con el form actual Yesi no puede (necesita titular con DNI). Es exactamente el caso
del plan §1: hasta que se mergee A o B, las creo yo por SQL con OK tuyo, o Yesi inventa DNI (no).

### 2.2 Probablemente existen con otra grafía — 4, decide Yesi

| turno | planilla | en la base | nota |
|---|---|---|---|
| T2, T3 | **HS EL ORIGEN** | `HARAS EL ORIGEN` (9 inscripciones históricas, provisorio R9 del 11/09) | HS = Haras. Casi seguro la misma. |
| T3, T4 | **DON JORGE** | `EL DON JORGE (LP)` — creada el 11/09 (`caballeriza_el_don_jorge_lp.sql`), 1 inscripción | Como decís: probablemente la misma. En T5 la planilla ya dice "EL DON JORGE". Que Yesi confirme que DON JORGE de T3/T4 = EL DON JORGE (LP) y no un stud distinto. |
| T3 | **SAUCE CORRIENTE** | `SAUCE CORRIENTES (DOL)` (0 inscripciones) | singular/plural. |
| T11 | **DON VENICIO** | `DON BENICIO (SR)` (3 inscripciones, provisorio R8) | B/V. `(SR)` = otro hipódromo otorgante; puede ser la misma. |

### 2.3 Existen, con variante menor de escritura (no hay que hacer nada)

`LOS DE ATRAS` → `LOS DE ATRÁS (DOL)` · `ABUELO CALIN` → `Abuelo Calin (DOL)` · `PYP` → `PyP (DOL)` · `EL GALPON (DOL)`
→ existe **exacta** (`EL GALPON (DOL)`), ojo que también existe `EL GALPON LOBOS (DOL)` — la planilla dice la primera.

### 2.4 Existen exactas — 43 nombres

T1: EL VIEJO NOEL (DOL), EL BATARAZ (DOL), LA SILVITA (DOL), MI MARTINCITO, LOS EDUCADITOS (DOL), LAGUNA VERDE, SAICA (DOL) ·
T2: LA MILINGA, 2 DE ABRIL MAIPU, LOS URONES (DOL), RD NECOCHEA, NUEVO MUNDO (DOL) · T3: EL CACHAFAZ (DOL), LOS PERRITOS (DOL) ·
T4: POR TU CULPA (DOL), EL DERBY, CRAZY HORSE, MONTE DEL TORDILLO, EL NIETO, LOS CATACHOS, STUD CHICO (DOL), LA COLONIA ·
T5: MARTIN Y NICOLAS, EL DON JORGE (LP), FEDERICO Y MIGUEL · T6: LA PICHI, **PARAJE LA TABLADA [sin titular]**, EMI ·
T7: EL HORNERITO CAFE, EL DESTINO, LOS 6 CORAZONES, LOS MELLI, MELINA A · T9: EL COLORADO, LAS QUINTAS (DOL), POR SI LLEGA (DOL) ·
T10: C&C (DOL) · T11: LOS CUERVOS, EL HINDU (DOL).

Única de las existentes **sin titular**: PARAJE LA TABLADA (T6 en la planilla; en la base tiene TIRSO T1 y GRAN RAUL T6
ratificados sin propietario). Todas las demás tienen titular real o provisorio.

### 2.5 Salida cruda del cruce

```sql
-- normalización: upper + sin acentos + sin sufijo (DOL|LP|AZ|TDL|SL); "exacta" = igual normalizado;
-- "parecidos" = contiene / contenido / igual sin espacios ni puntos.
with planilla(turno, nombre) as (values (1,'EL VIEJO NOEL'),(1,'EL BATARAZ'),(1,'LA SILVITA'),(1,'MI MARTINCITO'),(1,'LOS EDUCADITOS'),(1,'LAGUNA VERDE'),(1,'LOS DE ATRAS'),(1,'SAICA'),
 (2,'ABUELO CALIN'),(2,'LA MILINGA'),(2,'2 DE ABRIL MAIPU'),(2,'LOS URONES'),(2,'HS EL ORIGEN'),(2,'RD NECOCHEA'),(2,'MI MARTINCITO'),(2,'NUEVO MUNDO'),
 (3,'SAUCE CORRIENTE'),(3,'DON JORGE'),(3,'EL CACHAFAZ'),(3,'LOS PERRITOS'),
 (4,'POR TU CULPA'),(4,'EL FORTIN'),(4,'EL DERBY'),(4,'CRAZY HORSE'),(4,'MONTE DEL TORDILLO'),(4,'EL NIETO'),(4,'LOS CATACHOS'),(4,'DON JORGE'),(4,'PYP'),(4,'STUD CHICO'),(4,'EL CHUCARO'),(4,'LA COLONIA'),
 (5,'MARTIN Y NICOLAS'),(5,'EL NIETO'),(5,'EL DON JORGE'),(5,'FEDERICO Y MIGUEL'),(5,'LOS PERRITOS'),(5,'HS BUEN OJO'),
 (6,'MI MARTINCITO'),(6,'LA PICHI'),(6,'EL NIETO'),(6,'PARAJE LA TABLADA'),(6,'EL GALPON (DOL)'),(6,'EMI'),
 (7,'SIN FRENO'),(7,'EL HORNERITO CAFE'),(7,'NAMANI'),(7,'EL DESTINO'),(7,'LOS 6 CORAZONES'),(7,'LOS MELLI'),(7,'MELINA A'),
 (9,'EL GRANJERO'),(9,'MELINA A'),(9,'MI MARTINCITO'),(9,'EL DESTINO'),(9,'POR SI LLEGA'),(9,'EL COLORADO'),(9,'LAS QUINTAS'),
 (10,'HS LA HORMIGONERA'),(10,'C&C'),(10,'CRAZY HORSE'),(10,'MONTE DEL TORDILLO'),(10,'EL NIETO'),(10,'LOS CATACHOS'),
 (11,'POR TU CULPA'),(11,'LOS CUERVOS'),(11,'DON PIPO (AZ)'),(11,'LA MILINGA'),(11,'EL HINDU'),(11,'DON VENICIO')),
norm as (select turno, nombre, upper(regexp_replace(translate(nombre,'ÁÉÍÓÚÑáéíóúñ','AEIOUNaeioun'),'\s*\((DOL|LP|AZ|TDL|SL)\)\s*$','')) n from planilla),
cabs as (select c.id, c.nombre, c.hipodromo_patente, c.activo, upper(regexp_replace(translate(c.nombre,'ÁÉÍÓÚÑáéíóúñ','AEIOUNaeioun'),'\s*\((DOL|LP|AZ|TDL|SL)\)\s*$','')) n,
  exists(select 1 from caballeriza_responsables cr where cr.caballeriza_id=c.id and cr.rol='propietario' and cr.activo) titular
  from caballerizas c where c.club_id='0649e9c5-9e87-4aad-842f-101458e6b33c'),
m as (select p.turno, p.nombre planilla,
  (select string_agg(c.nombre||coalesce(' ('||c.hipodromo_patente||')','')||case when not c.activo then ' [INACTIVA]' else '' end||case when not c.titular then ' [sin titular]' else '' end, ' | ') from cabs c where c.n = p.n) exacta,
  (select string_agg(c.nombre||coalesce(' ('||c.hipodromo_patente||')',''), ' | ') from cabs c where c.n <> p.n and (c.n like '%'||p.n||'%' or p.n like '%'||c.n||'%' or replace(c.n,' ','') = replace(p.n,' ','') or replace(replace(c.n,'.',''),' ','') = replace(replace(p.n,'.',''),' ',''))) parecida
  from norm p)
select turno, planilla, coalesce(exacta,'—') existe, coalesce(parecida,'') parecidos from m order by turno, planilla;
```

```json
[{"turno":1,"planilla":"EL BATARAZ","existe":"EL BATARAZ (DOL)","parecidos":""},{"turno":1,"planilla":"EL VIEJO NOEL","existe":"EL VIEJO NOEL (DOL)","parecidos":""},{"turno":1,"planilla":"LA SILVITA","existe":"LA SILVITA (DOL)","parecidos":""},{"turno":1,"planilla":"LAGUNA VERDE","existe":"LAGUNA VERDE","parecidos":""},{"turno":1,"planilla":"LOS DE ATRAS","existe":"LOS DE ATRÁS (DOL)","parecidos":""},{"turno":1,"planilla":"LOS EDUCADITOS","existe":"LOS EDUCADITOS (DOL)","parecidos":""},{"turno":1,"planilla":"MI MARTINCITO","existe":"MI MARTINCITO","parecidos":""},{"turno":1,"planilla":"SAICA","existe":"SAICA (DOL)","parecidos":""},
 {"turno":2,"planilla":"2 DE ABRIL MAIPU","existe":"2 DE ABRIL MAIPU","parecidos":""},{"turno":2,"planilla":"ABUELO CALIN","existe":"Abuelo Calin (DOL)","parecidos":""},{"turno":2,"planilla":"HS EL ORIGEN","existe":"—","parecidos":""},{"turno":2,"planilla":"LA MILINGA","existe":"LA MILINGA","parecidos":"NG (DOL)"},{"turno":2,"planilla":"LOS URONES","existe":"LOS URONES (DOL)","parecidos":""},{"turno":2,"planilla":"MI MARTINCITO","existe":"MI MARTINCITO","parecidos":""},{"turno":2,"planilla":"NUEVO MUNDO","existe":"NUEVO MUNDO (DOL)","parecidos":""},{"turno":2,"planilla":"RD NECOCHEA","existe":"RD NECOCHEA","parecidos":""},
 {"turno":3,"planilla":"DON JORGE","existe":"—","parecidos":"EL DON JORGE (LP) (LP)"},{"turno":3,"planilla":"EL CACHAFAZ","existe":"EL CACHAFAZ (DOL)","parecidos":""},{"turno":3,"planilla":"LOS PERRITOS","existe":"LOS PERRITOS (DOL)","parecidos":""},{"turno":3,"planilla":"SAUCE CORRIENTE","existe":"—","parecidos":"SAUCE CORRIENTES (DOL)"},
 {"turno":4,"planilla":"CRAZY HORSE","existe":"CRAZY HORSE","parecidos":""},{"turno":4,"planilla":"DON JORGE","existe":"—","parecidos":"EL DON JORGE (LP) (LP)"},{"turno":4,"planilla":"EL CHUCARO","existe":"—","parecidos":""},{"turno":4,"planilla":"EL DERBY","existe":"EL DERBY","parecidos":""},{"turno":4,"planilla":"EL FORTIN","existe":"—","parecidos":""},{"turno":4,"planilla":"EL NIETO","existe":"EL NIETO","parecidos":""},{"turno":4,"planilla":"LA COLONIA","existe":"LA COLONIA","parecidos":""},{"turno":4,"planilla":"LOS CATACHOS","existe":"LOS CATACHOS","parecidos":""},{"turno":4,"planilla":"MONTE DEL TORDILLO","existe":"MONTE DEL TORDILLO","parecidos":""},{"turno":4,"planilla":"POR TU CULPA","existe":"POR TU CULPA (DOL)","parecidos":""},{"turno":4,"planilla":"PYP","existe":"PyP (DOL)","parecidos":""},{"turno":4,"planilla":"STUD CHICO","existe":"STUD CHICO (DOL)","parecidos":""},
 {"turno":5,"planilla":"EL DON JORGE","existe":"EL DON JORGE (LP) (LP)","parecidos":""},{"turno":5,"planilla":"EL NIETO","existe":"EL NIETO","parecidos":""},{"turno":5,"planilla":"FEDERICO Y MIGUEL","existe":"FEDERICO Y MIGUEL","parecidos":""},{"turno":5,"planilla":"HS BUEN OJO","existe":"—","parecidos":""},{"turno":5,"planilla":"LOS PERRITOS","existe":"LOS PERRITOS (DOL)","parecidos":""},{"turno":5,"planilla":"MARTIN Y NICOLAS","existe":"MARTIN Y NICOLAS","parecidos":""},
 {"turno":6,"planilla":"EL GALPON (DOL)","existe":"EL GALPON (DOL)","parecidos":"EL GALPON LOBOS (DOL)"},{"turno":6,"planilla":"EL NIETO","existe":"EL NIETO","parecidos":""},{"turno":6,"planilla":"EMI","existe":"EMI","parecidos":""},{"turno":6,"planilla":"LA PICHI","existe":"LA PICHI","parecidos":""},{"turno":6,"planilla":"MI MARTINCITO","existe":"MI MARTINCITO","parecidos":""},{"turno":6,"planilla":"PARAJE LA TABLADA","existe":"PARAJE LA TABLADA [sin titular]","parecidos":""},
 {"turno":7,"planilla":"EL DESTINO","existe":"EL DESTINO","parecidos":""},{"turno":7,"planilla":"EL HORNERITO CAFE","existe":"EL HORNERITO CAFE","parecidos":""},{"turno":7,"planilla":"LOS 6 CORAZONES","existe":"LOS 6 CORAZONES","parecidos":""},{"turno":7,"planilla":"LOS MELLI","existe":"LOS MELLI","parecidos":""},{"turno":7,"planilla":"MELINA A","existe":"MELINA A","parecidos":""},{"turno":7,"planilla":"NAMANI","existe":"—","parecidos":""},{"turno":7,"planilla":"SIN FRENO","existe":"—","parecidos":""},
 {"turno":9,"planilla":"EL COLORADO","existe":"EL COLORADO","parecidos":""},{"turno":9,"planilla":"EL DESTINO","existe":"EL DESTINO","parecidos":""},{"turno":9,"planilla":"EL GRANJERO","existe":"—","parecidos":""},{"turno":9,"planilla":"LAS QUINTAS","existe":"LAS QUINTAS (DOL)","parecidos":""},{"turno":9,"planilla":"MELINA A","existe":"MELINA A","parecidos":""},{"turno":9,"planilla":"MI MARTINCITO","existe":"MI MARTINCITO","parecidos":""},{"turno":9,"planilla":"POR SI LLEGA","existe":"POR SI LLEGA (DOL)","parecidos":""},
 {"turno":10,"planilla":"C&C","existe":"C&C (DOL)","parecidos":""},{"turno":10,"planilla":"CRAZY HORSE","existe":"CRAZY HORSE","parecidos":""},{"turno":10,"planilla":"EL NIETO","existe":"EL NIETO","parecidos":""},{"turno":10,"planilla":"HS LA HORMIGONERA","existe":"—","parecidos":""},{"turno":10,"planilla":"LOS CATACHOS","existe":"LOS CATACHOS","parecidos":""},{"turno":10,"planilla":"MONTE DEL TORDILLO","existe":"MONTE DEL TORDILLO","parecidos":""},
 {"turno":11,"planilla":"DON PIPO (AZ)","existe":"—","parecidos":""},{"turno":11,"planilla":"DON VENICIO","existe":"—","parecidos":""},{"turno":11,"planilla":"EL HINDU","existe":"EL HINDU (DOL)","parecidos":""},{"turno":11,"planilla":"LA MILINGA","existe":"LA MILINGA","parecidos":"NG (DOL)"},{"turno":11,"planilla":"LOS CUERVOS","existe":"LOS CUERVOS","parecidos":""},{"turno":11,"planilla":"POR TU CULPA","existe":"POR TU CULPA (DOL)","parecidos":""}]
```

(`NG (DOL)` aparece como "parecido" de LA MILINGA por la regla de contenido — es ruido, LA MILINGA existe exacta.)

Búsqueda amplia sobre los 12 sin exacta:

```json
[{"planilla":"DON JORGE","candidatos":"EL DON JORGE (LP) (LP) insc=1"},{"planilla":"DON PIPO (AZ)","candidatos":"(nada)"},
 {"planilla":"DON VENICIO","candidatos":"DON BENICIO (SR) insc=3"},{"planilla":"EL CHUCARO","candidatos":"(nada)"},
 {"planilla":"EL FORTIN","candidatos":"LA FORTALEZA (DOL) insc=1 | FORTY FANTASIA (DOL) insc=0"},{"planilla":"EL GRANJERO","candidatos":"(nada)"},
 {"planilla":"HS BUEN OJO","candidatos":"(nada)"},{"planilla":"HS EL ORIGEN","candidatos":"HARAS EL ORIGEN insc=9"},
 {"planilla":"HS LA HORMIGONERA","candidatos":"(nada)"},{"planilla":"NAMANI","candidatos":"(nada)"},
 {"planilla":"SAUCE CORRIENTE","candidatos":"SAUCE CORRIENTES (DOL) insc=0"},{"planilla":"SIN FRENO","candidatos":"(nada)"}]
```

---

## 3. Qué falta para completar el cruce

- **SPC y profesionales**: no vinieron en la planilla. Pasame por turno los caballos (nombre tal cual lo escribió
  Yesi) y jockeys/cuidadores, y hago el mismo cruce (`spcs` tiene 210, con el buscador del Stud Book para los que
  falten; `profesionales` por apellido + DNI).
- **Las 8 caballerizas nuevas** (§2.1): decisión — las creo yo por SQL ahora (con OK, mismo patrón de `caballeriza_el_don_jorge_lp.sql`,
  con provisorio) o esperamos la rama A/B para que las cree Yesi.
- **Las 4 dudosas** (§2.2): confirmación de Yesi (HS EL ORIGEN = HARAS EL ORIGEN; DON JORGE = EL DON JORGE (LP); SAUCE
  CORRIENTE = SAUCE CORRIENTES; DON VENICIO = DON BENICIO).

## 4. Verificación de publicación

```
$ git push origin reports
$ git rev-parse HEAD
38f7ee12c91798ba784863e44bd3662b829a3bf0
$ git ls-remote origin reports
38f7ee12c91798ba784863e44bd3662b829a3bf0	refs/heads/reports
```

Coinciden. Esta sección va en un segundo commit sobre el mismo archivo.
