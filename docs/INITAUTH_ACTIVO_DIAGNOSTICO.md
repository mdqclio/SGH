# initAuth y la cuenta desactivada — diagnóstico y plan

**Fecha:** 2026-08-18
**Proyecto Supabase:** `unlhcuanfrtpatoipwve` (prod)
**pwd:** `/home/clio/dev/SGH`
**Alcance:** diagnóstico y plan. **No se tocó una sola línea de código ni un solo dato.**

---

## Resumen

Tu hallazgo se confirma: **24 archivos HTML tienen su propio `initAuth`, y ninguno de los
24 consulta `usuarios.activo`.** Pero al medirlo aparecieron tres cosas más, y una cambia
el diagnóstico:

1. Las 24 copias **no son idénticas**: hay **5 variantes**. 20 son byte-idénticas entre sí;
   `usuarios.html`, `auditoria.html`, `solicitudes.html` y `portal.html` divergen, y algunas
   de esas divergencias son arreglos que las otras 20 no tienen.
2. El campo que bloqueó a Valeria **no es sólo `activo`: son dos campos**, `activo` y
   `estado`, y ninguna de las 24 copias lee **ninguno de los dos** (`portal.html` lee
   `estado`, pero portal no es una pantalla de staff).
3. `supabase.js` **no lo carga ninguna pantalla**. Es código muerto. Ver §2.

---

## 1. Las 24 copias: conteo y variantes

### Conteo

24 de 35 HTML definen `function initAuth`. Los 11 restantes son login, reset-password,
registro, solicitar-acceso, los dos programa-oficial y cuatro mockups — ninguno necesita
sesión de staff.

Archivos con `initAuth`:
`admin`, `auditoria`, `caballerizas`, `calendario`, `carta-llamados`, `categorias`,
`hipodromos`, `index`, `inscripciones`, `jockeys`, `liquidaciones`, `portal`,
`profesionales`, `programa`, `propietarios`, `ratificacion`, `resoluciones`, `resultados`,
`resultados_legacy`, `reuniones`, `sanciones`, `solicitudes`, `spcs`, `usuarios`.

### No son idénticas: 5 variantes

Comparación por hash del cuerpo de la función, normalizando espacios y comentarios:

| Variante | n | Archivos |
|---|---:|---|
| **A** `6535ade86e` | **20** | admin, caballerizas, calendario, carta-llamados, categorias, hipodromos, index, inscripciones, jockeys, liquidaciones, profesionales, programa, propietarios, ratificacion, resoluciones, resultados, resultados_legacy, reuniones, sanciones, spcs |
| **B** `fbb4b1013d` | 1 | usuarios.html |
| **C** `eb8142234f` | 1 | auditoria.html |
| **D** `72f384cef2` | 1 | solicitudes.html |
| **E** `356acda387` | 1 | portal.html |

En qué difieren:

| | A (20) | B usuarios | C auditoria | D solicitudes | E portal |
|---|---|---|---|---|---|
| Credenciales | URL y key **hardcodeadas** en cada archivo | consts `SUPABASE_URL`/`KEY` inline | hardcodeadas | consts inline | consts inline |
| Busca al usuario por | `email` | `email` | `email` | **`auth_user_id`** | `email` |
| `.single()` vs `.maybeSingle()` | `.single()` | `.single()` | `.single()` | `.maybeSingle()` | `.maybeSingle()` |
| Guarda `if (!usr)` | ❌ **NO** | ✅ sí | ✅ sí | ✅ sí | ✅ sí (pantalla de solicitud) |
| Chequea rol permitido | ❌ no | ❌ no | ✅ sí (`super_admin`/`secretario`) | ✅ sí (+`operador`) | ✅ sí (`propietario`/`profesional`) |
| Lee `activo` | ❌ | ❌ | ❌ | ❌ | ❌ |
| Lee `estado` | ❌ | ❌ | ❌ | ❌ | ✅ (bloquea `pendiente`) |
| Recuerda club elegido (`localStorage`) | ✅ | ✅ | ❌ | ✅ | n/a |

**La variante A —  la de 20 archivos — es la peor de las cinco.** Le falta el guard
`if (!usr)` que las otras cuatro sí tienen: si la fila de `usuarios` no aparece,
`usr.rol` revienta con `TypeError` sobre `null`, la excepción queda sin capturar y el
overlay "Verificando…" se queda para siempre. Es un segundo bug latente, distinto del de
`activo`, y afecta a 20 de las 24 pantallas.

La variante A también es la única que hardcodea URL y key en cada archivo — 20 copias del
mismo par de strings.

---

## 2. ¿Dónde podría vivir un `initAuth` compartido?

### `supabase.js` no sirve como está: **no lo carga nadie**

```
$ grep -ln 'src="supabase.js"' *.html
(0 archivos)
```

Ninguna pantalla lo incluye. El grep de "supabase.js" da falsos positivos porque matchea
el CDN `@supabase/supabase-js@2`, que es otra cosa. `supabase.js` es **código muerto**, y
además tiene dos minas si alguien lo enchufa sin mirar:

- `const CLUB_ID = 'a6da7e40-…'` — un club hardcodeado que **no es Dolores**. Y es `const`:
  cada `initAuth` hace `CLUB_ID = usr.club_id`, lo que sobre un `const` tira
  `TypeError: Assignment to constant variable`. Hoy no pasa porque nadie lo carga, y
  `CLUB_ID` termina siendo un global implícito (ningún HTML lo declara con `let`/`var`).
- `const db = createClient(...)` — un segundo cliente de Supabase además del `sb` de cada
  página, sobre el mismo storage de sesión.

### Los archivos que sí se cargan

| Archivo | Páginas que lo incluyen |
|---|---:|
| `club-switcher.js` | **17** |
| `active-reunion.js` | 8 |
| `premios-utils.js` | 6 |
| `supabase.js` | **0** |

`club-switcher.js` es el helper con más alcance, pero se incluye **al final del body**,
después del `<script>` inline que define y llama a `initAuth`. Un helper de auth tiene que
cargar **antes**. No es un obstáculo — es un renglón a mover — pero hay que tenerlo
presente: el include va en el `<head>` o arriba del script inline, no al final.

**Conclusión:** hoy no existe un lugar donde ya viva un `initAuth` compartido. Hay que
crearlo. Lo natural es un `auth.js` nuevo, no reciclar `supabase.js` (que arrastra un
`CLUB_ID` de otro club y un segundo cliente). `supabase.js` merece un borrado aparte.

---

## 3. Los dos caminos

### (a) Parchear las 24 copias

Agregar el chequeo de `activo`/`estado` en cada archivo, sin tocar la estructura.

**A favor**

- Sin cambios de carga de scripts, sin orden de `<script>`, sin riesgo de romper una
  pantalla por un include mal puesto.
- Se puede hacer y verificar de a tandas. Si una pantalla queda mal, es una pantalla.
- No requiere decidir nada sobre `supabase.js` ni sobre las 4 variantes divergentes.

**En contra**

- 24 ediciones a mano de un bloque de una sola línea de ~900 caracteres. Alta chance de
  que una quede distinta.
- **No arregla la causa**: mañana hay 25 copias. El bug de `activo` es la tercera vez que
  el mismo patrón muerde (ya pasó con `es_titular` en Pagos y con el rótulo de rol en el
  recibo): lógica duplicada que se corrige en un lado y no en los otros 23.
- Deja sin arreglar el `if (!usr)` faltante de las 20, salvo que se parchee también — y
  entonces son dos parches × 24.

**Riesgo:** medio. Bajo por edición, alto en agregado por volumen.

### (b) Extraer a un helper compartido

Crear `auth.js` con una sola implementación, e incluirlo en las 24 páginas antes del
script inline.

**A favor**

- Una sola implementación que leer, auditar y arreglar. El próximo campo que haya que
  chequear se agrega en un lugar.
- Es la oportunidad de subir a todas el piso de las mejores variantes: guard `if (!usr)`
  (hoy en 4 de 24), chequeo de rol (hoy en 3), `maybeSingle()` (hoy en 2).
- Mata el hardcodeo de URL y key en 20 archivos.

**En contra**

- Toca las 24 páginas igual (para agregar el `<script src>` y borrar la función local).
- Las 4 variantes divergentes **no se pueden colapsar sin más**: auditoria filtra rol y
  muestra `#btn-purgar`; solicitudes busca por `auth_user_id` y admite `operador`; portal
  es otro mundo (roles de portal, `pantallaSolicitud`, vinculación a propietario/
  profesional). El helper necesita parámetros — como mínimo `rolesPermitidos` y un hook
  post-auth — o esas 4 quedan afuera.
- Si el `<script src>` queda mal ubicado en una página, esa página no arranca. Es un modo
  de falla ruidoso y fácil de detectar, pero real.

**Riesgo:** medio-alto en la migración, **bajo de forma permanente**.

### Recomendación: **(b), en dos etapas**

La razón no es elegancia: es que **(a) no cierra el problema**. Hoy hay dos bugs repartidos
de forma desigual entre 24 copias (`activo`/`estado` en las 24, `if (!usr)` en 20). Parchear
significa 48 ediciones y quedarse igual de expuesto la próxima vez.

Pero (b) de una no. Propuesta:

**Etapa 1 — el arreglo, ya.** `auth.js` nuevo con la implementación única. Migrar primero
las **20 de la variante A**, que son idénticas entre sí: es un reemplazo mecánico
verificable con `grep`, no 20 decisiones. Quedan las 4 divergentes con su `initAuth` local,
al que se le agrega **sólo** el chequeo de `activo`/`estado` — 4 parches puntuales, no 24.
Con eso el agujero queda cerrado en las 24 pantallas.

**Etapa 2 — después, sin apuro.** Parametrizar `auth.js` (`rolesPermitidos`, hook post-auth)
y absorber las 4 restantes. Y borrar `supabase.js`, que hoy no hace nada salvo esperar a
que alguien lo enchufe y se lleve un club equivocado.

Si sólo entra una cosa antes del lunes: la Etapa 1, y dentro de la Etapa 1 primero los
4 parches puntuales (cierran el agujero en 4 pantallas críticas: usuarios, auditoría,
solicitudes, portal) y después las 20.

---

## 4. Qué debería hacer `initAuth` cuando la cuenta no está habilitada

### Primero: son dos campos, no uno

`usuarios` tiene **dos** columnas de habilitación, y significan cosas distintas:

| Campo | Default | Quién lo escribe | Significado |
|---|---|---|---|
| `activo` (bool, NOT NULL) | `true` | alta por invitación lo pone en `false`; `reset-password.html` en `true`; el botón Activar/Desactivar de `usuarios.html` lo togglea | ¿La cuenta está habilitada? |
| `estado` (varchar) | `'activo'` | invitación → `'pendiente'`; `reset-password.html` y `admin.html` → `'activo'` | ¿Terminó de aceptar la invitación? |

**El que corta el acceso a los datos es `activo`**, y lo hace desde RLS, no desde el
frontend:

```sql
-- fn_get_user_club_id()
SELECT club_id FROM usuarios WHERE auth_user_id = auth.uid() AND activo;

-- fn_is_staff()
SELECT EXISTS (SELECT 1 FROM usuarios
               WHERE auth_user_id = auth.uid() AND activo
                 AND rol IN ('super_admin','secretario_carreras','operador'));
```

Con `activo = false`, `fn_get_user_club_id()` devuelve **NULL** y `fn_is_staff()` devuelve
**false**. Las policies de las 34 tablas con RLS comparan `club_id = fn_get_user_club_id()`,
y `club_id = NULL` nunca es verdadero. Resultado: **todas las consultas devuelven `[]` con
HTTP 200**. No hay error, no hay 403, no hay nada que el frontend pueda mostrar. Pantallas
vacías, exactamente lo que vio Valeria.

### Lo que muestra la auditoría (confirma el mecanismo y corrige un detalle)

`auditoria` guarda el antes/después de cada cambio en `usuarios`:

| Fecha (UTC) | Quién | Qué pasó |
|---|---|---|
| 08-16 13:06 | Valeria | INSERT de la invitación: `activo=false`, `estado='pendiente'` |
| 08-16 17:50 | Valeria | `last_sign_in_at` — **entró**. Ningún UPDATE en auditoría: nunca corrió `activarUsuario()` |
| 08-16 21:14 | Martin Juarez | UPDATE `activo false→true` **y** `estado pendiente→activo` en la misma operación — el camino sano, vía `reset-password.html` |
| 08-18 15:03 | Valeria | UPDATE `activo false→true`, **`estado` sigue en `'pendiente'`** — el botón Activar de `usuarios.html`, que escribe sólo `activo` |

Dos consecuencias:

1. **Cuando Valeria entró el 16, tenía `activo = false`.** El mecanismo de arriba explica
   entero lo que vio. Confirmado.
2. **Hoy Valeria tiene `activo = true` y `estado = 'pendiente'`.** Esa combinación no la
   produce ningún camino sano: la genera el botón Activar, que escribe `activo` y deja
   `estado` como estaba. Federico Iguacel está en `activo=false` + `estado='pendiente'`
   (invitado el 07/08, nunca aceptó — `email_confirmed_at` vacío).

Es decir: **si `initAuth` bloqueara por `estado`, Valeria quedaría afuera hoy mismo, con
la cuenta ya activa.** Ese es el argumento fuerte de la propuesta que sigue.

### Propuesta de comportamiento

**Bloquear por `activo`, no por `estado`.** `activo` es el campo que RLS ya usa: si
`initAuth` bloquea con el mismo criterio que la base, el frontend nunca puede contradecir
a la base. `estado` hoy está desincronizado por el botón Activar y bloquear por él dejaría
gente afuera sin motivo.

**Cómo bloquear: pantalla, no `signOut()` + redirect.**

Mandarla al login es exactamente lo que ya pasa cuando no hay sesión, y es indistinguible
de "escribí mal la contraseña". Valeria reintentaría, entraría de nuevo, y volvería a ver
todo vacío. Además pierde la única información útil que tenemos: *por qué* no entra.

Propuesta concreta — **y no implica una pantalla nueva**: reusar el `#auth-overlay` que ya
existe en las 24 páginas. Es lo que ya hacen `auditoria.html` ("Acceso restringido") y
`portal.html` ("Registro pendiente"): se le reemplaza el `innerHTML` al overlay y se
devuelve `false`. Cero HTML nuevo, cero archivos nuevos, patrón ya probado en dos pantallas.

Texto propuesto:

> **Tu cuenta no está habilitada**
> Contactá a la secretaría del hipódromo para que la activen.
> [Cerrar sesión]

El botón de cerrar sesión importa: sin él, alguien que comparte máquina queda con la sesión
colgada y sin salida visible. Es el mismo botón que ya tiene `portal.html`.

**Qué NO hacer:** `signOut()` automático. Si la cuenta se activa mientras la persona mira
la pantalla, un F5 la hace entrar. Con `signOut()` automático tiene que volver a loguearse
sin saber por qué la echaron.

### Arreglo adicional que sale de acá

`toggleActivo()` (`usuarios.html:488-493`) escribe sólo `activo`. Debería escribir también
`estado`, para que los dos campos no se separen nunca:
activar → `{activo:true, estado:'activo'}`, desactivar → `{activo:false, estado:'inactivo'}`
(el valor exacto del "desactivado" hay que decidirlo — hoy no existe ninguno).
Sin esto, `estado` seguirá derivando y cualquier lógica futura que lo lea va a estar mal.

---

## 5. El alta que deja la cuenta en pendiente: ¿se puede mostrar en la lista?

**Sí, y no requiere ningún cambio de base ni de backend.** Los datos ya están y la pantalla
ya los tiene cargados.

### Por qué hoy no se ve

`usuarios.html:232` hace `sb.from('usuarios').select('*')` — **`estado` ya viene en el
resultado**. Pero `renderTable()` lo ignora:

```js
const activo = u.activo !== false;                                  // línea 247
<td><span class="badge badge-${activo ? 'activo':'inactivo'}">      // línea 258
     ${activo ? 'Activo' : 'Inactivo'}</span></td>
```

La columna se titula "Estado" pero muestra `activo`, no `estado`. Por eso Valeria figura
hoy como **"Activo"** en verde, cuando en realidad su cuenta nunca completó la invitación.
Es peor que no mostrar nada: muestra lo contrario.

### Propuesta

Tres estados visibles, derivados de los dos campos que ya llegan:

| `activo` | `estado` | Badge | Color |
|---|---|---|---|
| `true` | `'activo'` | **Activo** | verde (`badge-activo`, ya existe) |
| `true` | `'pendiente'` | **Invitación pendiente** | ámbar (`badge-pendiente`, **nuevo**) |
| `false` | cualquiera | **Inactivo** | rojo (`badge-inactivo`, ya existe) |

Con `activo=false` gana "Inactivo": es el campo que efectivamente corta el acceso, y es lo
que la persona va a experimentar.

Ámbar conviene que sea un color propio y no el verde: la diferencia entre "puede trabajar"
y "todavía no aceptó" es justo la que hoy no se ve.

Opcional, mismo lugar y barato: junto al badge "Invitación pendiente", un botón
**"Reenviar invitación"** que llame a `invitar({...,reinvitar:true})`. El código ya existe
en `saveCreate()` (`usuarios.html:410-425`) — hoy sólo se llega por el `confirm()` de
"ya existe" al intentar dar de alta a alguien repetido. Nadie va a adivinar ese camino.

**Costo:** una regla CSS y ~6 líneas en `renderTable()`. Sin migración, sin Edge Function,
sin tocar el alta.

---

## Resumen de lo propuesto, por orden

| # | Qué | Dónde | Riesgo |
|---|---|---|---|
| 1 | Badge de 3 estados en la lista de usuarios | `usuarios.html` `renderTable()` | muy bajo |
| 2 | Bloqueo por `activo` con pantalla en `#auth-overlay` — parche puntual en las 4 variantes divergentes | usuarios, auditoria, solicitudes, portal | bajo |
| 3 | `auth.js` con la implementación única + migrar las 20 de la variante A | 20 archivos + 1 nuevo | medio |
| 4 | `toggleActivo` escribe `activo` **y** `estado` | `usuarios.html:488` | bajo |
| 5 | Parametrizar `auth.js` y absorber las 4 divergentes | — | medio |
| 6 | Borrar `supabase.js` (código muerto, club equivocado) | — | bajo |

1 y 2 cierran lo que rompió esta semana. 3 y 4 evitan que vuelva. 5 y 6 son limpieza.

---

## Anexo — cómo se midió

- Conteo y variantes: extracción del cuerpo de `initAuth` por balanceo de llaves, normalizando
  comentarios y espacios, y hash MD5 del resultado. 24 archivos, 5 hashes distintos.
- Includes reales: `grep -ln 'src="supabase.js"' *.html` → 0 archivos.
- RLS: `pg_policies` + `pg_get_functiondef` de `fn_get_user_club_id`, `fn_is_staff`,
  `fn_is_super_admin`. 34 tablas con RLS activa.
- Timeline de cuentas: tabla `auditoria` (`datos_antes`/`datos_despues`) cruzada con
  `auth.users` (`last_sign_in_at`, `email_confirmed_at`).
- Todas las consultas fueron **de sólo lectura**. No se ejecutó ningún INSERT, UPDATE,
  DELETE ni DDL.
