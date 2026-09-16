# Alta de caballerizas: el formulario exige titular con DNI — por qué Yesi no puede crear una (SOLO LECTURA)

- **Fecha**: 2026-09-16, 18:40–18:55 UTC (15:40–15:55 AR)
- **SHA de `main` relevado**: `7887a27f2dc2cbf0d1c3a16a1e82b0b4d31d1ace` (lectura con `git show main:` / checkout de `main`; este archivo va en `reports`)
- **Estado**: **diagnóstico, sin cambios.** No se tocó código, base ni datos. Guards: `pwd=/home/clio/dev/SGH`, `spcs=210`, ref `unlhcuanfrtpatoipwve`.

## 0. Respuesta corta

| Pregunta | Respuesta |
|---|---|
| 1. Obligatorios | **Nombre** (HTML `required`, `caballerizas.html:164`) y **Propietario con apellido + nombre + DNI** (JS, `caballerizas.html:447-450`, en `validateResponsables`, llamada desde `saveRecord` en `:589-591`). **Sólo front.** La base no exige nada más que `nombre` y `club_id` NOT NULL. |
| 2. ¿Titular, procedencia o las dos? | **Sólo el titular.** "Hipódromo otorgante" (`f-hipodromo-patente`, `:184-185`) es opcional y viene precargado `DOL` en el alta (`:569`). No hay campo "procedencia" en el formulario. Lo que la frena es el bloque **Propietario \*** (apellido, nombre, DNI). |
| 3. ¿Por qué contradice al 15/08? | Porque la decisión del 15/08 **nunca tocó el formulario**: fue un backfill por SQL (`propietarios_provisorios_r8/r9`) que crea el provisorio *por afuera* de la pantalla. El requisito de titular es del **11/05** (`d5b441a`, cuando el campo texto `responsable` pasó a sub-form relacional) y quedó así. Nadie lo aflojó. |
| 4. Las 43 sin responsable | **Ninguna por pantalla.** 34 son la carga masiva de R6 del 12/06 (`notas='Alta para inscripciones reunión 2026-06-20 (planilla Yesica)'`, por SQL), 3 son el sandbox `PRUEBA 9999`, 6 son altas tempranas (mayo/agosto, sin rastro: `caballerizas` **no tiene trigger de auditoría**). El formulario no puede producir una caballeriza sin titular: por eso las 43 son todas de SQL. |
| Veredicto | Aflojar **una función** (`validateResponsables`, 4 líneas) para que el titular sea opcional en el alta, y **hacer que la edición no borre lo que no se tocó**. No rompe nada en la base: `inscripciones.propietario_id` ya queda NULL para 43 caballerizas hoy, con la misma consecuencia (GOTCHA #47) que el `DO` de provisorios regulariza. **Sí hay un riesgo en el camino de edición** (§5.2) que conviene arreglar en el mismo cambio. |

---

## 1. Qué exige el formulario, dónde, y quién lo valida

### 1.1 HTML — un solo `required`

```
$ grep -n "required" caballerizas.html
164:            <input type="text" id="f-nombre" required placeholder="Nombre del stud o caballeriza">
```

Los inputs del propietario **no** tienen `required` en el HTML; los asteriscos son texto de placeholder/label:

```html
<!-- caballerizas.html:210-221 -->
<div class="resp-row" id="row-propietario">
  <div class="resp-row-header">
    <span class="resp-row-label">Propietario *</span>
    <div id="rp-badge" class="badge-prof" style="display:none">✓ Entrenador con patente</div>
  </div>
  <div class="resp-inputs">
    <input id="rp-apellido" placeholder="Apellido *">
    <input id="rp-nombre"   placeholder="Nombre *">
    <input id="rp-dni"      placeholder="DNI *" inputmode="numeric"
           onblur="this.value = formatDNI(this.value); checkProfesional(this, document.getElementById('rp-badge'))">
    <input id="rp-fnac"     type="date" title="Fecha de nacimiento">
    <input id="rp-localidad" placeholder="Localidad" class="span2">
  </div>
</div>
```

"Hipódromo otorgante" es opcional y arranca en `DOL`:

```html
<!-- caballerizas.html:183-186 -->
<div class="form-group">
  <label>Hipódromo otorgante</label>
  <input type="text" id="f-hipodromo-patente" placeholder="Ej: DOL">
</div>
```
```js
// caballerizas.html:569
document.getElementById('f-hipodromo-patente').value = rec?.hipodromo_patente || (rec ? '' : 'DOL');
// caballerizas.html:627  (se guarda NULL si queda vacío)
hipodromo_patente:       document.getElementById('f-hipodromo-patente').value.trim() || null,
```

### 1.2 JS — la validación que la frena

```js
// caballerizas.html:446-462
function validateResponsables(rows) {
  const prop = rows[0];
  if (!prop.apellido || !prop.nombre || !prop.documento_nro) {
    return 'El propietario requiere apellido, nombre y DNI.';
  }
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.apellido && (!r.nombre || !r.documento_nro)) {
      return `Co-propietario ${i}: si ingresás apellido, completá también nombre y DNI.`;
    }
  }
  const dnis = rows.filter(r => r.documento_nro).map(r => r.documento_nro);
  if (new Set(dnis).size !== dnis.length) {
    return 'Hay DNI duplicados entre los responsables.';
  }
  return null;
}
```

```js
// caballerizas.html:586-591 — se corre SIEMPRE, alta y edición, antes de cualquier escritura
async function saveRecord(e) {
  e.preventDefault();

  const rows = getResponsableData();
  const validErr = validateResponsables(rows);
  if (validErr) { toast(validErr, 'error'); return; }
```

El toast que ve Yesi es exactamente **"El propietario requiere apellido, nombre y DNI."** Es el único corte antes del
`insert`. La "procedencia" no aparece en ninguna validación:

```
$ grep -n -i "procedencia" caballerizas.html
(nada)
```

### 1.3 Base — no exige titular

```sql
-- information_schema.columns, pg_constraint, pg_trigger, pg_policy (16/09 18:45 UTC)
```
```json
[{"k":"cols_caballerizas","v":"id:uuid NOT NULL default uuid_generate_v4() | club_id:uuid NOT NULL | nombre:character varying NOT NULL | responsable:character varying | domicilio:character varying | telefono:character varying | activo:boolean NOT NULL default true | notas:text | estado:character varying default 'activo'::character varying | chaquetilla_descripcion:character varying | chaquetilla_url:character varying | hipodromo_patente:character varying"},
 {"k":"cols_responsables","v":"id:uuid NOT NULL | caballeriza_id:uuid NOT NULL | profesional_id:uuid | apellido:character varying | nombre:character varying | documento_tipo:character varying | documento_nro:character varying | fecha_nacimiento:date | localidad:character varying | rol:character varying | porcentaje:numeric | activo:boolean | created_at:timestamp without time zone | propietario_id:uuid"},
 {"k":"checks_caballerizas","v":"(ninguno)"},
 {"k":"checks_responsables","v":"(ninguno)"},
 {"k":"triggers_caballerizas","v":"(ninguno)"},
 {"k":"triggers_responsables","v":"trg_cab_resp_set_propietario: CREATE TRIGGER trg_cab_resp_set_propietario BEFORE INSERT OR UPDATE OF rol, documento_tipo, documento_nro, caballeriza_id ON public.caballeriza_responsables FOR EACH ROW EXECUTE FUNCTION fn_caballeriza_resp_set_propietario()"},
 {"k":"policy_insert_caballerizas","v":"caballerizas_insert with_check=((NOT ( SELECT fn_is_portal_user() AS fn_is_portal_user)) AND (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (club_id = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))"}]
```

**Lectura.** `caballerizas` sólo exige `club_id` y `nombre`. `hipodromo_patente` nullable. `caballeriza_responsables`
tiene todo nullable salvo `caballeriza_id`. Ningún CHECK, ningún trigger sobre `caballerizas` (ni de auditoría), y la
policy de INSERT es por club. **La base aceptaría hoy mismo una caballeriza sin ninguna fila de responsable** — de
hecho hay 43 así (§4). El único trigger relevante es el de `caballeriza_responsables`, que sólo hace algo si la fila
tiene `rol='propietario' AND documento_nro IS NOT NULL` (busca/crea el `propietarios` por DNI). Con DNI NULL no crea
nada y no falla: así entraron los 47 provisorios de R8/R9 (`fn_caballeriza_resp_set_propietario`, ver
`2026-09-14_plan-modificar-inscripcion-portal.md` §1.2).

**Conclusión 1 y 2: la exigencia es 100 % del front, y es sólo el titular (apellido + nombre + DNI).** El hipódromo
otorgante es opcional; "procedencia" no existe como campo. Si Yesi dice que le pide las dos, lo más probable es que
esté leyendo el bloque "Responsables" completo como una sola cosa, o que confunda el asterisco de `Nombre *` (el de la
caballeriza) con otro obligatorio.

---

## 2. De dónde viene el requisito (git)

```
$ git log --format='%h %ad %s' --date=short -S "El propietario requiere apellido, nombre y DNI" -- caballerizas.html
d5b441a 2026-05-11 Adaptar UI de caballerizas al modelo relacional de responsables
```

```
commit d5b441a62d40466e79894030a031e5983cfa4c25   (2026-05-11)
    Adaptar UI de caballerizas al modelo relacional de responsables
    - Reemplaza el campo texto "responsable" por sub-form de responsables
      con fila fija de propietario y filas dinámicas de co-propietarios

-            <input type="text" id="f-responsable" placeholder="Nombre del responsable">
+                <span class="resp-row-label">Propietario *</span>
+    return 'El propietario requiere apellido, nombre y DNI.';
```

Antes del 11/05 el "responsable" era un texto libre y opcional. Al pasar al modelo relacional
(`docs/DECISIONES.md:41`, "tabla caballeriza_responsables en lugar de campo texto") se hizo obligatorio el titular
con DNI, porque el DNI es la llave con la que el trigger deriva `propietarios` y con la que después se liquida. Es una
decisión de diseño de mayo, anterior a que existiera el concepto de "provisorio".

---

## 3. La decisión del 15/08 y por qué no llegó al formulario

`docs/PLAN_PROPIETARIOS_PROVISORIOS_R8.md:10`:

> Aprobación de producto: Fede aprobó cargar el **nombre de la caballeriza como titular provisorio**, para que la
> liquidación del domingo emita el 70 % del propietario y el bono 6°–8°.

Lo que se decidió fue **cómo regularizar por SQL** las caballerizas que ya estaban sin titular (40 de R8, después 7
de R9): un `propietarios` con `tipo persona`, sin documento, `notas 'provisorio R8 15/08'`, más un
`caballeriza_responsables` `rol propietario` **sin DNI** (por eso el trigger no lo pisa). Ejecutado el 18/08
(`docs/BITACORA_R8_PROVISORIOS_18AGO.md`) y el 11/09 (`migrations/propietarios_provisorios_r9.sql`).

En ningún lado de esa decisión ni de su ejecución hay un cambio a `caballerizas.html`. El `git log` del archivo desde
el 11/05 no toca `validateResponsables`. **Es una contradicción real**: la operación dice "sin titular se crea igual y
el propietario queda provisorio", pero la pantalla que usa Yesi sigue diciendo "sin DNI no se guarda". La única forma
de crear "sin titular" hoy es por SQL — o sea, yo. ISSUE-080 (11/09) ya anotó la mitad del problema (la ficha no guía
a *completar* un provisorio); esta es la otra mitad: la ficha no permite *crear* sin titular.

**Efecto colateral que Yesi todavía no reportó pero va a pisar**: como `saveRecord` valida **siempre**, también en
edición, y `loadRecord` prellena el DNI con `formatDNI(prop.documento_nro)` (`:555`), **cualquier caballeriza cuyo
titular no tenga DNI no se puede editar** — ni para cambiarle el teléfono ni para subirle la chaquetilla:

```json
[{"k":"cab_activas","v":"295"},
 {"k":"sin_titular_activo (alta bloqueada = edición bloqueada: el form pide DNI)","v":"43"},
 {"k":"con_titular_SIN_dni (provisorios: edición también bloqueada)","v":"52"},
 {"k":"con_titular_SIN_apellido_o_nombre","v":"48"},
 {"k":"con_titular_completo (editables sin tocar nada)","v":"200"},
 {"k":"provisorios_ejemplo","v":"2 DE ABRIL MAIPU → resp(∅,2 DE ABRIL MAIPU,dni=∅) | Abuelo Calin → resp(∅,Abuelo Calin,dni=∅) | ABUELO FLORO → resp(∅,ABUELO FLORO,dni=∅) | BETTY SANTI → resp(∅,BETTY SANTI,dni=∅) | CRAZY HORSE → resp(∅,CRAZY HORSE,dni=∅) | DON BENICIO → resp(∅,DON BENICIO,dni=∅) | DON GIOVANNI → resp(∅,DON GIOVANNI,dni=∅) | DON RAUL → resp(∅,DON RAUL,dni=∅)"}]
```

**95 de 295 caballerizas activas (43 sin titular + 52 con titular provisorio sin DNI) no se pueden guardar desde la
pantalla sin inventar un DNI.** Sólo 200 son editables tal como están.

---

## 4. Cómo se crearon las 43 sin responsable

`caballerizas` no tiene trigger de auditoría (§1.3), así que no hay `INSERT` en `auditoria` para ninguna:

```json
[{"k":"total_sin_titular","v":"43"},{"k":"con_auditoria_insert","v":"0"},
 {"k":"sin_auditoria_insert (creadas antes del trigger de auditoría o por SQL sin log)","v":"43"},
 {"k":"por_pantalla (auditoria con usuario)","v":"0 → "},{"k":"por_sql (auditoria sin usuario)","v":"0"},
 {"k":"con_filas_responsable_pero_no_propietario_activo","v":"0"},{"k":"con_texto_responsable","v":"0"}]
```

Se reconstruye el origen por `notas`, nombre, `hipodromo_patente` y primera referencia (query completa y las 43 filas
en el Anexo):

| grupo | n | evidencia | origen |
|---|---|---|---|
| Carga masiva R6 | **34** | `notas = 'Alta para inscripciones reunión 2026-06-20 (planilla Yesica)'`, `hipodromo_patente NULL`, primera inscripción 12/06 (R6), nombres en MAYÚSCULAS con sufijos `(TDL)`, `(LP)`, `(AZ)` de la planilla | **SQL**, sesión del 12/06 (la marca la escribió el script; el formulario no escribe esa nota). Es el mismo lote del que salieron las 40 de R8 que después recibieron provisorio — estas 34 son las que **no** corrieron en R8 y por eso nunca entraron al `DO`. |
| Sandbox de probes | **3** | `PRUEBA 9999 — BORRAR …`, reunión 9999 | SQL (seed 9999, CHANGELOG 12/06) |
| Altas tempranas | **6** | `El Capitan`, `La Narcisa`, `Rey de Corazones` (mayúsculas mixtas, `DOL`, referenciadas en auditoría de inscripciones el 15–16/05 — **antes** del `d5b441a` del 11/05 no, pero en la semana del rediseño), `DON NITO` (R8, 06/08), `5 ESTRELLAS`, `LA CALIFORNIA` (sin inscripciones, con SPCs) | Sin rastro directo. Las tres de mayo son de la época en que `responsable` era texto libre y quedaron con `responsable NULL` (`con_texto_responsable = 0`); `DON NITO`/`5 ESTRELLAS`/`LA CALIFORNIA` tienen `hipodromo_patente='DOL'` que es lo que el formulario precarga… pero el formulario **no puede** guardar sin DNI desde el 11/05, así que o se cargaron por SQL o el `caballeriza_responsables` se borró después (no hay filas inactivas: `con_filas_responsable_pero_no_propietario_activo = 0`). |

**Conclusión 4: las 43 son todas de SQL o anteriores al modelo relacional. Cero por la pantalla actual** — la
pantalla actual es incapaz de producir una caballeriza sin titular, que es justamente lo que Yesi necesita.

---

## 5. Veredicto — qué aflojar y qué rompe

### 5.1 El cambio mínimo

Una función, `validateResponsables` (`caballerizas.html:446-462`): el titular pasa a ser **opcional**, pero **si se
carga algo, se carga completo**:

```js
function validateResponsables(rows) {
  const prop = rows[0];
  const propVacio = !prop.apellido && !prop.nombre && !prop.documento_nro;
  if (!propVacio && (!prop.apellido || !prop.nombre || !prop.documento_nro)) {
    return 'Si cargás el propietario, completá apellido, nombre y DNI. Si todavía no lo sabés, dejá los tres vacíos.';
  }
  // … co-propietarios y DNI duplicados igual que hoy
}
```

Más el rótulo: `Propietario *` → `Propietario (si lo conocés)`, y `Apellido * / Nombre * / DNI *` → sin asterisco.
`resolveAndInsertResponsables` ya saltea las filas vacías (`if (!r.apellido && !r.nombre) continue;`, `:474`), así
que con el titular en blanco **no inserta nada** en `caballeriza_responsables` y la caballeriza nace sin titular —
exactamente como las 43 que ya existen. ~10 líneas.

### 5.2 Qué rompe / qué hay que mirar en el mismo cambio

| | ¿rompe? | detalle |
|---|---|---|
| Base | **No** | Nada exige el titular (§1.3). Hoy ya hay 43 así y todo funciona. |
| Inscripciones que elijan esa caballeriza | **No rompe, pero deja `propietario_id = NULL`** | `trg_insc_set_propietario` no encuentra titular → NULL en silencio (GOTCHA #47). Es la misma situación de las 43 de hoy y de los 15 ratificados de R9 sin propietario. Lo regulariza el `DO` de provisorios — y para eso hace falta que **exista la caballeriza**, que es justamente lo que Yesi no puede hacer. Aflojar el form **destraba** el `DO`, no lo empeora. El portal ya avisa ("caballeriza sin titular") al anotar/modificar. |
| Liquidación | **No rompe** | Sin `propietario_id`, la línea del 70 % queda sin beneficiario hasta que haya provisorio o titular real. Es el estado actual de 15 ratificados de R9. |
| `caballerizas.html` edición — **riesgo preexistente que se vuelve más visible** | **Sí, hay que arreglarlo junto** | `saveRecord` en edición hace `delete().eq('caballeriza_id')` (`:644`) y reinserta lo que hay en el form. Hoy nadie llega ahí sin DNI porque la validación corta antes. Si el titular pasa a ser opcional, **editar una caballeriza con provisorio y dejar el bloque vacío borra el vínculo `rol propietario` del provisorio** → la caballeriza queda sin titular y sus inscripciones futuras sin `propietario_id` (las pasadas conservan el suyo porque `propietario_id` está copiado en `inscripciones`). Y al revés: tipear un DNI real sobre un provisorio **no completa** el provisorio — el trigger crea/encuentra **otro** `propietarios` por DNI y el provisorio queda huérfano con sus liquidaciones (ISSUE-080, caso LOS URONES). Fix mínimo: en edición, **si el bloque de propietario viene vacío, no tocar `caballeriza_responsables`** (no borrar, no insertar); y si viene con DNI y el titular actual es un provisorio, hacer `UPDATE` del responsable existente (mismo `id`) en vez de delete+insert — así el trigger `UPDATE OF documento_nro` completa el mismo `propietario_id`… **ojo**: `fn_caballeriza_resp_set_propietario` en UPDATE **busca por DNI y si no existe INSERTA uno nuevo** — o sea que también crearía otro propietario. Completar un provisorio por pantalla es ISSUE-080 y es un cambio aparte (RPC o UPDATE del `propietarios` provisorio con el DNI). Para **hoy**: alcanza con no borrar lo que no se tocó. |
| `responsable` (texto legado) | No | `buildResponsableText` devuelve `null` con el bloque vacío (`:655`). |
| Probes | No hay probe de `caballerizas.html` | Habría que escribir uno (alta sin titular → 0 filas en responsables; edición sin tocar → responsables intactos; edición con DNI nuevo sobre provisorio → **documentar** que hoy crea otro propietario). |

### 5.3 Recomendación

1. **Hoy, sin código**: si Yesi necesita crear 1–2 caballerizas para R9 (los 13 ratificados sin caballeriza de
   `2026-09-16_ejecucion-modificar-inscripcion-portal.md` §20.2), lo hago yo por SQL con el mismo patrón de la carga
   de R6 (`nombre`, `club_id`, `hipodromo_patente 'DOL'`, `notas 'alta R9 16/09 (Yesi)'`) y después corre el `DO`.
   Con OK explícito.
2. **Rama `fix/caballerizas-titular-opcional`** (~10 líneas + rótulos + no-borrar-en-edición + probe): titular opcional
   en el alta; edición no toca responsables si el bloque viene vacío. GOTCHA nuevo: "el form pedía DNI desde el 11/05
   y bloqueaba también la edición de 95/295 caballerizas".
3. ISSUE-080 sigue aparte (completar un provisorio desde la ficha sin crear otro propietario).

## 6. Preguntas abiertas

1. ¿Yesi ve de verdad dos exigencias (titular + procedencia) o lee el bloque como una? Si alguien le pide
   "procedencia", no es `caballerizas.html` — ¿será `spcs.html` o `profesionales.html`?
2. ¿Va la opción 1 (SQL hoy) para destrabar R9, o esperamos la rama?
3. Con titular opcional, ¿el provisorio lo crea el `DO` (como hasta ahora) o querés que el alta sin titular cree el
   provisorio **en el momento** (mismo patrón: `propietarios` tipo persona sin documento + vínculo sin DNI)? Eso sería
   la regla del 15/08 literal, en pantalla. Media hora más; lo dejaría para después de R9.

---

## Anexo — las 43 sin responsable (query y salida cruda)

```sql
with sin as (
  select c.id, c.nombre, c.hipodromo_patente, c.estado, c.notas, c.telefono, c.chaquetilla_url from caballerizas c
  where c.club_id='0649e9c5-9e87-4aad-842f-101458e6b33c' and c.activo
    and not exists (select 1 from caballeriza_responsables cr where cr.caballeriza_id=c.id and cr.rol='propietario' and cr.activo)
), ref as (
  select s.id, s.nombre,
    (select min(i.created_at) from inscripciones i where i.caballeriza_id=s.id) primera_insc,
    (select count(*) from inscripciones i where i.caballeriza_id=s.id) n_insc,
    (select string_agg(distinct r.numero::text, ',') from inscripciones i join carreras c on c.id=i.carrera_id join reuniones r on r.id=c.reunion_id where i.caballeriza_id=s.id) reuniones,
    (select count(*) from spcs sp where sp.caballeriza_id=s.id) n_spcs,
    (select count(*) from profesionales p where p.caballeriza_id=s.id) n_prof,
    (select min(a.created_at) from auditoria a where a.registro_id=s.id) primera_aud,
    (select min(a.created_at) from auditoria a where a.tabla='inscripciones' and (a.datos_despues->>'caballeriza_id')=s.id::text) primera_aud_insc,
    s.hipodromo_patente, s.telefono is not null tel, s.chaquetilla_url is not null chaq, s.notas
  from sin s)
select nombre, hipodromo_patente hp, n_insc, reuniones, n_spcs, n_prof, to_char(primera_insc,'YYYY-MM-DD') primera_insc, to_char(primera_aud,'YYYY-MM-DD') primera_aud, to_char(primera_aud_insc,'YYYY-MM-DD') primera_aud_insc, tel, chaq, notas
from ref order by primera_insc nulls last, nombre;
```

| nombre | hp | insc | reuniones | spcs | prof | 1ª insc | 1ª aud (insc) | notas |
|---|---|---|---|---|---|---|---|---|
| PRUEBA 9999 — BORRAR Caballeriza Simple | — | 5 | 9999 | 0 | 0 | 2026-06-10 | 2026-06-11 | — |
| PRUEBA 9999 — BORRAR Stud (SL) | — | 6 | 9999 | 0 | 0 | 2026-06-10 | 2026-06-11 | — |
| PRUEBA 9999 — BORRAR Stud Patente | DOL | 6 | 9999 | 0 | 0 | 2026-06-10 | 2026-06-11 | — |
| AMORES MIOS | — | 3 | 6 | 2 | 0 | 2026-06-12 | 2026-06-13 | Alta para inscripciones reunión 2026-06-20 (planilla Yesica) |
| CARLITOS E | — | 1 | 6 | 1 | 0 | 2026-06-12 | 2026-06-13 | idem |
| DON LEON | — | 2 | 6 | 1 | 0 | 2026-06-12 | 2026-06-13 | idem |
| DON VALENTINO | — | 1 | 6 | 1 | 0 | 2026-06-12 | 2026-06-13 | idem |
| El Capitan | DOL | 1 | 6 | 1 | 0 | 2026-06-12 | **2026-05-15** | — |
| EL CEREALERO | — | 1 | 6 | 1 | 0 | 2026-06-12 | 2026-06-13 | idem |
| EL DOMADOR | — | 5 | 6,8 | 3 | 0 | 2026-06-12 | 2026-06-13 | idem |
| EL GALPON LOBOS (DOL) | — | 1 | 6 | 1 | 0 | 2026-06-12 | 2026-06-13 | idem |
| EL GITANO | — | 2 | 6 | 2 | 0 | 2026-06-12 | 2026-06-13 | idem |
| EL GRUÑON | — | 1 | 6 | 1 | 0 | 2026-06-12 | 2026-06-13 | idem |
| EL MOLINERO | — | 1 | 6 | 1 | 0 | 2026-06-12 | 2026-06-13 | idem |
| EL PRIMER REBUSQUE | — | 1 | 6 | 1 | 0 | 2026-06-12 | 2026-06-13 | idem |
| EL VIAJANTE | — | 3 | 6 | 2 | 0 | 2026-06-12 | 2026-06-13 | idem |
| EL YAYA | — | 1 | 6 | 1 | 0 | 2026-06-12 | 2026-06-13 | idem |
| ERICK (TDL) | — | 1 | 6 | 1 | 0 | 2026-06-12 | 2026-06-13 | idem |
| FLOR Y AGUS | — | 2 | 6,8 | 1 | 0 | 2026-06-12 | 2026-06-13 | idem |
| GARIN CITY (LP) | — | 1 | 6 | 1 | 0 | 2026-06-12 | 2026-06-13 | idem |
| JUVENTUD LP | — | 1 | 6 | 1 | 0 | 2026-06-12 | 2026-06-13 | idem |
| LA BETTY (TDL) | — | 1 | 6 | 1 | 0 | 2026-06-12 | 2026-06-13 | idem |
| LA ENSENADA | — | 1 | 6 | 1 | 0 | 2026-06-12 | 2026-06-13 | idem |
| LA ESCUELITA LP | — | 1 | 6 | 1 | 0 | 2026-06-12 | 2026-06-13 | idem |
| LA SUREÑA | — | 2 | 6 | 2 | 0 | 2026-06-12 | 2026-06-13 | idem |
| MANSO EL ZORRO | — | 2 | 6 | 1 | 0 | 2026-06-12 | 2026-06-13 | idem |
| MI BELLA GIULIA | — | 4 | 6,8 | 3 | 0 | 2026-06-12 | 2026-06-13 | idem |
| MI QUERIDO VIEJO | — | 1 | 6 | 1 | 0 | 2026-06-12 | 2026-06-13 | idem |
| MIS VIEJOS | — | 1 | 6 | 1 | 0 | 2026-06-12 | 2026-06-13 | idem |
| N.R.A (AZ) | — | 1 | 6 | 1 | 0 | 2026-06-12 | 2026-06-13 | idem |
| PARAJE LA TABLADA | — | 4 | 6,8,**9** | 1 | 0 | 2026-06-12 | 2026-06-13 | idem |
| PASCUAL | — | 2 | 6 | 2 | 0 | 2026-06-12 | 2026-06-13 | idem |
| R.E.C | — | 1 | 6 | 1 | 0 | 2026-06-12 | 2026-06-13 | idem |
| ROBERTITO B | — | 1 | 6 | 1 | 0 | 2026-06-12 | 2026-06-13 | idem |
| SACRIFICIO | — | 1 | 6 | 1 | 0 | 2026-06-12 | 2026-06-13 | idem |
| SANTA BARBARA | — | 2 | 6,8 | 1 | 0 | 2026-06-12 | 2026-06-13 | idem |
| STUD HS LA GUILLERMINA | — | 1 | 6 | 1 | 0 | 2026-06-12 | 2026-06-13 | idem |
| TRES AMIGOS (AZ) | — | 1 | 6 | 1 | 0 | 2026-06-12 | 2026-06-13 | idem |
| DON NITO | DOL | 1 | 8 | 1 | 0 | 2026-08-06 | 2026-08-08 | — |
| 5 ESTRELLAS | DOL | 0 | — | 3 | 0 | — | — | — |
| LA CALIFORNIA | DOL | 0 | — | 1 | 0 | — | — | — |
| La Narcisa | DOL | 0 | — | 0 | 0 | — | **2026-05-15** | — |
| Rey de Corazones | DOL | 0 | — | 0 | 0 | — | **2026-05-16** | — |

("idem" = `Alta para inscripciones reunión 2026-06-20 (planilla Yesica)`. `primera_aud` — auditoría sobre la propia
caballeriza — es NULL en las 43: no hay trigger. `1ª aud (insc)` es la primera inscripción auditada que la
referencia.) Nota: PARAJE LA TABLADA es la única de las 43 con inscripciones ratificadas en **R9** (TIRSO T1, GRAN RAUL
T6) — las dos que sí arreglaría el `DO` de provisorios.

Las 40 de R8 que aparecen en `docs/PLAN_PROPIETARIOS_PROVISORIOS_R8.md` Anexo **no** están en esta lista: recibieron
provisorio el 18/08 y hoy tienen `rol propietario` activo (sin DNI) — son parte de las 52 "editables sólo inventando
un DNI" de §3.

## 7. Verificación de publicación

(se completa en el commit siguiente)
