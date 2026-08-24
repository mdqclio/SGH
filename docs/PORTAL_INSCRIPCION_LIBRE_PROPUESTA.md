# Portal — inscripción libre: relevamiento + propuesta

**Fecha:** 2026-08-24 · **Estado:** propuesta, NO implementada · **Pedido por:** Leo (regla confirmada por Fede y Yesi)

## Cambio de regla

> Cualquier entrenador puede inscribir CUALQUIER SPC. No hay vínculo caballo-entrenador.
> El control es disciplinario, no técnico: queda registrado quién inscribió, y una
> inscripción falsa va a sanción de la comisión de carreras.

Esto invalida el filtro por tenencia del portal. Este documento releva **dónde está ese filtro
hoy** (sección 1), separa el bug que reportó Yesi (sección 2) y propone el cambio (sección 3).

### Guard de sesión

```
pwd                 → /home/clio/dev/SGH            ✅
SELECT count(*) spcs → 181                          ✅ (baseline CLAUDE.md al 2026-08-23)
ref del proyecto     → unlhcuanfrtpatoipwve         ✅
```

Nada se escribió: sólo `SELECT` sobre prod y lectura de archivos.

---

## 1. Dónde filtra hoy por tenencia — inventario completo

La tenencia tiene **una sola definición** y todo cuelga de ella:

```sql
-- migrations/sec_rls_fase2a_catalogos.sql:99-111
fn_mis_spc_ids()  =  spcs.entrenador_id ∈ mis entidades 'profesional'
                  ∪  spc_propietarios.activo con propietario_id ∈ mis entidades 'propietario'
```

`spc_propietarios` está vacía (0 filas), así que **en la práctica hoy tenencia = `spcs.entrenador_id`**.

### 1.a — Base de datos (el filtro real; el front sólo lo acompaña)

| # | Punto | Ubicación | Qué hace | Efecto de la regla nueva |
|---|---|---|---|---|
| DB-1 | `fn_mis_spc_ids()` | `migrations/sec_rls_fase2a_catalogos.sql:99` | Fuente única de tenencia | **Se conserva** — deja de ser autorización, pasa a ser "mis caballos" informativo |
| DB-2 | policy `spcs_select` | idem `:117-121` · viva en prod | Un usuario de portal **sólo ve sus SPC**: `fn_is_staff() OR id IN fn_mis_spc_ids()` | **Bloqueante del buscador global.** Hay que abrir una lectura del padrón |
| DB-3 | policy `inscripciones_select` | viva en prod (verificada en `pg_policies`) | Portal ve sólo filas con `spc_id IN fn_mis_spc_ids()` | **Bloqueante nuevo:** si inscribe un caballo ajeno, **no va a ver su propia inscripción** |
| DB-4 | policy `spc_propietarios_select` | `sec_rls_fase2a_catalogos.sql:176` | Idem por `spc_id` | Sin impacto hoy (tabla vacía) |
| DB-5 | `rpc_inscribir` paso 1 | `migrations/rpc_inscribir.sql:39-43` | Exige entidad `profesional` (el propietario queda afuera a propósito) | **Se conserva** — es el "quién" del registro |
| DB-6 | `rpc_inscribir` paso 2 | `migrations/rpc_inscribir.sql:58-62` | `IF NOT EXISTS (SELECT 1 FROM fn_mis_spc_ids() WHERE spc_id = p_spc_id) → RAISE 'Ese caballo no figura a su nombre…'` | **ESTE ES EL BLOQUEO DURO. Se elimina.** |
| DB-7 | `rpc_inscribir` paso 6 | `migrations/rpc_inscribir.sql:138-149` | Escribe `entrenador_id = v_spc.entrenador_id` y `caballeriza_id = v_spc.caballeriza_id` | **Cambia**: el entrenador de la inscripción pasa a ser el que inscribe (ver §3.3) |
| DB-8 | `rpc_baja_inscripcion` paso 1 | `migrations/rpc_baja_inscripcion.sql:45-49` | Exige entidad `profesional` | Se conserva |
| DB-9 | `rpc_baja_inscripcion` paso 4 | `migrations/rpc_baja_inscripcion.sql:77-81` | Revalida tenencia: `'Ese caballo ya no figura a su nombre.'` | **Se elimina.** El dueño de la baja ya está definido por `canal='portal' AND inscripto_por = yo` (pasos 2 y 3), que es más fuerte |
| DB-10 | `validar_inscripcion` | `migrations/validar_inscripcion_security_definer.sql` | **NO valida tenencia** — sólo estado del SPC, edad, sexo, sanción vigente y cupo | Sin cambios |
| DB-11 | backfill de tenencia | `migrations/backfill_tenencia_spcs.sql`, `…_v1_1.sql` | Poblaron `spcs.entrenador_id` (147/183 en su momento) | Ya no es prerequisito para inscribir. Sigue sirviendo para "Mis caballos" |

### 1.b — Front (`portal.html`)

| # | Línea | Qué hace |
|---|---|---|
| FE-1 | `portal.html:338-339` | `fn_mis_entidades()` → `esEntrenador`; sin eso no se dibuja el botón **Anotar** (`:537`). Es filtro de **rol**, no de tenencia — se conserva |
| FE-2 | `portal.html:386-396` | `loadCaballos()` → `fn_mis_spc_ids()` → `.in('id', lista)`. Es la lista "Mis caballos" |
| FE-3 | `portal.html:398-432` | Estado vacío "Todavía no hay caballos asociados a tu ficha… pedile a la secretaría que los vincule" |
| FE-4 | `portal.html:598-639` | **El modal de anotar itera `misCaballos`.** Es el filtro visible: sólo se puede elegir entre los caballos con tenencia |
| FE-5 | `portal.html:601-605` | Estado vacío del modal: "No tenés caballos asociados a tu ficha, así que no hay nada para anotar" |
| FE-6 | `portal.html:566-574` | `cargarInscripcionesCrudas()` no filtra en el cliente: se apoya en DB-3 |
| FE-7 | `portal.html:702-710` | Los nombres de "Mis inscripciones" salen de `misCaballos` (`nombrePorSpc`). Un caballo fuera de la tenencia se renderiza `—` |

### 1.c — Impacto medido en prod

```
spcs                          181
sin entrenador_id              34   ← invisibles para todo el portal hoy
sin caballeriza_id             29   ← relevante para el propietario_id (§3.3)
usuarios rol=profesional        1   (activo, con entidad vinculada)
spc_propietarios                0
```

**34 de 181 ejemplares no se pueden inscribir hoy desde el portal por nadie.** `Amiguito Peligroso`
(`019d9b9f…`) es uno de ellos: `entrenador_id = NULL`.

---

## 2. El buscador colgado — **es otro bug, no el filtro**

### Diagnóstico

El buscador que reporta Yesi es el de **`inscripciones.html` (secretaría)**, no el del portal: es
el único buscador de SPC por nombre del repo (`inscripciones.html:565 searchSpc()`; `portal.html`
tiene el CSS `.spc-search-wrap` huérfano de una versión vieja, sin input).

Causa raíz, confirmada contra prod:

```
inscripciones.html:562   return edadSPCTexto(fecha);      ← función de edad-spc.js
inscripciones.html:189   <script src="premios-utils.js">
inscripciones.html:190   <script src="active-reunion.js">
                         ← NO carga edad-spc.js
```

`edadSPCTexto` no existe en la página ⇒ `calcSpcEdad()` tira `ReferenceError` dentro del
`data.map(...)` de `searchSpc()` (`:588`) ⇒ el callback `async` del `setTimeout` rechaza sin
handler ⇒ el dropdown se queda **para siempre** en `Buscando…`. Eso es el "carga infinito".

Detalle que confirma el mecanismo: el camino "sin resultados" (`:583`) **retorna antes del map**,
así que un nombre inexistente muestra "Sin resultados" y un nombre real cuelga. Coincide exacto
con lo que ve Yesi.

### Alcance: son tres archivos, no uno

La regresión entró en `38989d8` (13/08, unificación de la edad reglamentaria): reemplazó los
cálculos inline por `edadSPCTexto` y **no agregó el `<script src="edad-spc.js">`** en tres páginas.
Verificado en prod (`curl https://sigh.com.ar/...`):

| Archivo | Llama | Carga `edad-spc.js` |
|---|---|---|
| `inscripciones.html:562` | `edadSPCTexto(fecha)` | ❌ **NO** |
| `spcs.html:298` | `edadSPCTexto(fecha, null, true)` | ❌ **NO** |
| `programa.html:297` | `edadSPCTexto(fecha, currentReunion?.fecha)` | ❌ **NO** |
| `programa-oficial.html:157` | — | ✅ sí |
| `programa-oficial-color.html:268` | — | ✅ sí |

Fix: una línea `<script src="edad-spc.js"></script>` en cada una de las tres. Es independiente de
todo lo demás de este documento y **debería salir primero, solo, con su propio commit**.

### Bug menor encontrado al lado

`inscripciones.html:591` pinta el ✅/❌ de certificado con `s.certificado_correr`, pero el `select`
de `:578` no trae esa columna ⇒ siempre `undefined` ⇒ **siempre ❌**. Agregar `certificado_correr`
al select.

---

## 3. Propuesta

### 3.1 — Buscador sobre TODO el padrón

**No** abrir `spcs` entera por RLS: la tabla tiene `notas`, `doc_url`, `foto_url`, `entrenador_id`
y `caballeriza_id`, que son datos de terceros. En su lugar, un RPC con whitelist de columnas:

```sql
CREATE FUNCTION rpc_buscar_spc(p_q text)
RETURNS TABLE (id uuid, nombre text, sexo text, fecha_nacimiento date,
               color text, padrillo_nombre text, madre_nombre text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT s.id, s.nombre, s.sexo::text, s.fecha_nacimiento,
         s.color, s.padrillo_nombre, s.madre_nombre
    FROM spcs s
   WHERE length(btrim(p_q)) >= 2          -- fail-closed: query corta ⇒ 0 filas
     AND s.estado = 'activo'
     AND s.nombre ILIKE '%' || btrim(p_q) || '%'
     AND EXISTS (SELECT 1 FROM fn_mis_entidades() e WHERE e.entidad_tipo = 'profesional')
   ORDER BY s.nombre
   LIMIT 20;
$$;
```

Ventajas sobre tocar la policy: no expone columnas de terceros, no cambia `spcs_select` (que
protege otras pantallas), y el día que haya que auditar búsquedas hay un solo lugar donde meterlo.

En `portal.html`: el modal de anotar deja de listar sólo `misCaballos` y pasa a tener el input de
búsqueda (el CSS `.spc-search-wrap` / `.spc-dropdown` ya está en el archivo, `:133-137`, sin usar).
"Mis caballos" **queda como está**, informativo, y su estado vacío deja de decir "no hay nada para
anotar".

### 3.2 — Quitar la validación de tenencia

- `rpc_inscribir`: borrar el paso 2 (DB-6). Todo lo demás queda: entidad profesional, ventana
  fail-closed, `validar_inscripcion` (edad/sexo/sanción/cupo) y el anti-duplicado por turno.
- `rpc_baja_inscripcion`: borrar el paso 4 (DB-9).
- `fn_mis_spc_ids()` **no se toca**: sigue alimentando "Mis caballos".

### 3.3 — Dos efectos colaterales que hay que resolver sí o sí

**(a) RLS de lectura — si no se toca, el portal queda ciego a lo que él mismo inscribió.**
`inscripciones_select` (DB-3) sólo deja ver filas con `spc_id IN fn_mis_spc_ids()`. Un entrenador
que anote un caballo ajeno **no vería su propia inscripción**, ni podría retirarla desde la UI.
Lo mismo con `spcs_select` (DB-2): el nombre saldría `—`. Propuesta:

```sql
CREATE FUNCTION fn_mis_spc_visibles() RETURNS TABLE (spc_id uuid) ... AS $$
  SELECT spc_id FROM fn_mis_spc_ids()
  UNION
  SELECT i.spc_id FROM inscripciones i
    JOIN usuarios u ON u.id = i.inscripto_por
   WHERE u.auth_user_id = auth.uid();
$$;
```

y usar `fn_mis_spc_visibles()` en `spcs_select` e `inscripciones_select` (tenencia ∪ lo que
inscribí yo). `fn_mis_spc_ids()` queda intacta para "Mis caballos".

**(b) `entrenador_id` y `caballeriza_id` de la inscripción.** Hoy salen del SPC (DB-7).

- `entrenador_id`: **pasa a ser el que inscribe** (`fn_mis_entidades()` tipo `profesional`). Es el
  que se hace cargo del caballo en esa carrera y es el dato que usan los incentivos de montas.
- `caballeriza_id`: **decisión de producto.** Conservador y propuesto: seguir tomando
  `spcs.caballeriza_id`, aceptando `NULL` en los 29 casos sin caballeriza. NO heredar la
  caballeriza del entrenador: el trigger `fn_inscripcion_set_propietario` deriva el
  `propietario_id` de `caballeriza_responsables`, así que heredarla le adjudicaría el premio al
  propietario equivocado. Con `NULL`, la inscripción nace sin propietario (GOTCHA #47) y la
  secretaría lo completa en ratificación — que es lo que ya pasa hoy con 85/95 inscripciones.

### 3.4 — El registro que reemplaza al filtro: **ya existe, y por partida doble**

| Dónde | Qué guarda | Estado |
|---|---|---|
| `inscripciones.inscripto_por` | `usuarios.id` del que anotó (FK a `usuarios`, no a `auth.users`) | ✅ lo escribe `rpc_inscribir:145` |
| `inscripciones.canal = 'portal'` | Distingue portal de secretaría | ✅ `rpc_inscribir:144` |
| `inscripciones.created_at` | Cuándo | ✅ default |
| `auditoria` (trigger `trg_audit_inscripciones` → `fn_auditoria_log`) | Fila entera del INSERT + `usuario_id` resuelto por el email del JWT + timestamp | ✅ vivo en prod, verificado |

O sea: el control disciplinario que pide Fede **ya está soportado sin agregar ni una columna.**
Lo que falta es **mostrarlo**:

1. `inscripciones.html` — columna "Cargada por" en la grilla de la secretaría (hoy el dato existe
   pero no se muestra; el portal sí lo muestra, `portal.html:715`). Es lo que la comisión mira
   cuando alguien reclama.
2. `rpc_inscribir` — mantener el `RAISE` con el nombre del entrenador en el mensaje de duplicado,
   para que el segundo que intente anotar el mismo caballo en el mismo turno sepa que ya está.
   (Hoy dice sólo "Ese caballo ya está anotado en ese turno." — con la regla nueva el que anotó
   puede ser otra persona, y conviene decirlo.)
3. Opcional, si Fede lo pide: badge "anotado por otro entrenador" en el modal del portal.

### 3.5 — Riesgo nuevo que introduce la regla (para avisar, no para bloquear)

Dos entrenadores distintos pueden anotar el mismo caballo en **turnos distintos de la misma
reunión** — hoy eso ya es válido y esperado (GOTCHAS #69), pero era siempre la misma persona.
Ahora es entre personas, y la secretaría lo resuelve el lunes previo. El anti-duplicado por turno
(`rpc_inscribir` paso 5) sigue impidiendo el choque directo. No se propone bloquear nada más: es
exactamente el caso que la regla nueva manda al terreno disciplinario.

### 3.6 — Orden de trabajo propuesto

| # | Cambio | Archivos | Independiente |
|---|---|---|---|
| 0 | Fix `edad-spc.js` faltante (§2) + `certificado_correr` en el select | `inscripciones.html`, `spcs.html`, `programa.html` | ✅ sale solo, ya |
| 1 | `fn_mis_spc_visibles()` + repolicy `spcs_select` / `inscripciones_select` | migración nueva | Prerequisito de 2 y 3 |
| 2 | `rpc_buscar_spc` | migración nueva | — |
| 3 | `rpc_inscribir` sin paso 2, `entrenador_id` = el que inscribe; `rpc_baja_inscripcion` sin paso 4 | `migrations/rpc_inscribir.sql`, `rpc_baja_inscripcion.sql` | — |
| 4 | Modal del portal con buscador; textos de estado vacío | `portal.html` | — |
| 5 | Columna "Cargada por" en la grilla de secretaría | `inscripciones.html` | ✅ independiente |

Probes a actualizar (hoy afirman lo contrario de la regla nueva):
`tests/probe_portal_validacion.mjs:57` (caso C "caballo ajeno"), `tests/probe_gate4_inscribir.mjs:222`,
`tests/probe_gate4_portal_ui.mjs:231-249`, `tests/probe_portal_e2e_gate4.mjs:178`.

### 3.7 — Lo que queda para que decida Fede

1. `caballeriza_id` cuando el SPC no tiene ninguna: ¿`NULL` (propuesto) o pedirla en el momento de anotar?
2. ¿El portal muestra **quién** anotó un caballo ajeno, o sólo la secretaría?
3. `spcs.estado = 'activo'` como filtro del buscador: ¿se puede anotar un ejemplar no activo?
   (`validar_inscripcion` lo rechaza igual, así que el filtro sólo evita que aparezca en la lista.)

---

## Apéndice — verificaciones hechas

```
SELECT tablename, policyname, cmd, qual FROM pg_policies
 WHERE tablename IN ('spcs','inscripciones');          → DB-2, DB-3 confirmadas vivas
SELECT * FROM spcs WHERE nombre ILIKE '%amiguito%';    → Amiguito Peligroso, entrenador_id NULL
SELECT count(*) FILTER (WHERE entrenador_id IS NULL)   → 34 de 181
pg_trigger sobre inscripciones                          → trg_audit_inscripciones vivo
curl https://sigh.com.ar/{inscripciones,spcs,programa}.html | grep '<script src'
                                                        → ninguna carga edad-spc.js
```

---

# §4. DECISIONES DE FEDE/YESI Y ESTADO DE IMPLEMENTACIÓN

_Agregado el 24/08/2026, después de las respuestas de Yesi (mensajes 75586, 75588, 75589)._

## §4.1 Las tres decisiones

**1. Caballeriza faltante (29 de 181 SPC).**
Yesi contestó desde otro supuesto: creía que el entrenador tendría que elegir una
caballeriza, y que si esa caballeriza no está en el sistema el caballo "no le va a
salir". No es así: el buscador busca **por nombre de caballo** sobre `spcs`, y la
caballeriza no participa de la búsqueda. Un caballo aparece aunque su caballeriza
esté vacía.

→ **Decisión: `caballeriza_id` queda NULL y no se le pide nada al entrenador.**
La secretaría la completa en ratificación. Es exactamente lo que ya pasa hoy cuando
la inscripción la carga Yesi a mano sobre un SPC sin caballeriza. Consecuencia
conocida y aceptada: con caballeriza NULL el trigger deja `propietario_id` en NULL
y la inscripción no liquida hasta completarla (GOTCHAS #47).

**2. Quién anotó cada caballo — sólo la secretaría.**
Textual: _"el entrenador de quién anotó un caballo, no, eso lo deberíamos ver
solamente nosotros. Después, cuando nosotros largamos los inscriptos, ahí recién
ellos pueden ver cuáles son los caballos que se anotaron. Antes no."_

→ **Decisión: el portal NO muestra inscripciones ajenas.** Implementado tal cual:
`fn_mis_spc_visibles()` deja ver sólo la tenencia propia más lo que uno mismo
cargó. La lista pública de inscriptos ("largar los inscriptos") **no existe todavía
en el sistema** y queda fuera de esta pasada — no hay que construir nada, sólo no
construir de más.

Residual conocido, sin solución posible: si dos entrenadores anotan el mismo
caballo en el mismo turno, el segundo recibe _"Ese caballo ya está anotado en ese
turno."_ Eso revela que el caballo está tomado, pero **nunca por quién**. Es
enumerable de a un intento por vez y es el mínimo inevitable — sin ese mensaje el
duplicado no se puede rechazar.

**3. SPC no activos en el buscador.**
Yesi volvió a hablar de caballos que no están en el padrón. Esos no los puede
inscribir nadie, ni ella ni el portal: es importación de Stud Book, problema aparte
y de carga de datos, no de código.

→ **Decisión sobre lo que sí se preguntaba: se muestran, marcados "no habilitado"
y con el botón deshabilitado.** Ver que existe pero está frenado es mejor que "no
aparece y no sé por qué", que es justo la queja. Al 24/08/2026 hay **0 SPC con
estado ≠ 'activo'**, así que hoy no cambia nada en pantalla; el código lo contempla
para cuando los haya. `validar_inscripcion` los rechaza igual, así que la marca es
informativa, no es el control.

## §4.2 Qué se implementó

| # | Cambio | Dónde |
|---|---|---|
| 1 | `fn_mis_spc_visibles()` = tenencia ∪ lo que yo inscribí | `migrations/portal_inscripcion_libre.sql` |
| 2 | `spcs_select` e `inscripciones_select` pasan a usar la función nueva | idem |
| 3 | `rpc_buscar_spc(p_q)` — busca en todo el padrón, columnas whitelisteadas, mín. 2 caracteres, LIMIT 30, comodines de LIKE escapados | idem |
| 4 | `rpc_inscribir` sin validación de tenencia; `entrenador_id` = **el que inscribe**, no `spcs.entrenador_id`; `caballeriza_id` del SPC, puede ser NULL | `migrations/rpc_inscribir.sql` |
| 5 | `rpc_baja_inscripcion` sin revalidación de tenencia (la fila ya está protegida por `canal='portal' AND inscripto_por = el que llama`) | `migrations/rpc_baja_inscripcion.sql` |
| 6 | Modal de anotar con buscador sobre el padrón; sin búsqueda activa sigue mostrando la lista corta de caballos propios | `portal.html` |
| 7 | El nombre del caballo en "Mis inscripciones" sale de un JOIN, no de `misCaballos` — si no, un caballo ajeno anotado mostraba "—" | `portal.html` |
| 8 | Columna **"Cargada por"** (Portal + nombre, o Secretaría) | `inscripciones.html` |

Por qué `entrenador_id` = el que inscribe y no el del padrón: con la regla nueva,
anotar un caballo **es** declararse su entrenador para esa carrera, y es el dato
que la comisión necesita para sancionar. Copiar `spcs.entrenador_id` sería peor —
en 34 casos es NULL y en el resto puede estar desactualizado.

Por qué **no** se hereda la caballeriza del que inscribe: le atribuiría el
propietario equivocado a un caballo ajeno, vía `fn_inscripcion_set_propietario`.

## §4.3 El control disciplinario, confirmado

No hubo que agregar nada. Ya existía por duplicado:

1. `inscripciones.inscripto_por` (FK a `usuarios`) + `canal='portal'` + `created_at`.
2. El trigger `trg_audit_inscripciones` → `fn_auditoria_log`, que escribe la fila
   completa y el `usuario_id` resuelto por el email del JWT.

Lo único que faltaba era **mostrarlo**: eso es la columna "Cargada por" del punto 8.

## §4.4 Verificación

`node tests/probe_gate4_inscribir.mjs` → **21 PASS / 0 FAIL** (era 15; los asserts
nuevos son G6 invertido y G6b–G6g).

Los canarios de RLS, que son los que podía romper el cambio de policies:

```
node tests/probe_rls_secretaria.mjs    → 18 OK · 0 FAIL
node tests/probe_rls_portal.mjs        → 39 PASS · 0 FAIL
node tests/probe_gate4_portal_ui.mjs   → 14 PASS · 0 FAIL
node tests/probe_portal_e2e_gate4.mjs  → 18 PASS · 0 FAIL   teardown limpio
node tests/probe_portal_validacion.mjs → TODO OK
```

Asserts nuevos que valen la pena nombrar:

- **G6e** — B **no** puede retirar la inscripción que cargó A, aunque el caballo sea
  de B. Retirar es de quien cargó la fila, no de quien tiene el caballo.
- **G6c** — A ve la inscripción ajena que él mismo cargó. Sin `fn_mis_spc_visibles()`
  le quedaba invisible y sin botón de retirar: la habría creado y no la habría podido
  sacar.

## §4.5 Lo que sigue pendiente

- **Padrón**: la importación desde Stud Book. Es el faltante real que marcó Yesi, y
  es carga de datos.
- **Lista pública de inscriptos** ("largar los inscriptos"): no existe. Cuando se
  haga, ahí es donde se abre la visibilidad que Yesi describió, y no antes.
- **Backfill de `propietario_id`** (GOTCHAS #47): sigue igual, este cambio no lo
  empeora ni lo mejora.
