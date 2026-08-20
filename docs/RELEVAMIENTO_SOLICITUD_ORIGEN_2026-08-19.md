# Relevamiento — campos de origen en la solicitud de acceso

**Fecha**: 2026-08-19
**Rama**: `feat/solicitud-origen` (creada desde `origin/main` @ `4f6437c`)
**Proyecto Supabase**: `unlhcuanfrtpatoipwve`
**Alcance**: PASO 1 — read-only. Nada ejecutado en la DB, nada modificado en el código.

---

## Contexto

Diego confirmó que **no existe padrón nacional** de profesionales ni de caballerizas: cada
hipódromo registra los suyos. La validación de una solicitud la hace Yesi a mano,
llamando al hipódromo de origen. Para que pueda hacerlo, el sistema tiene que capturar
de dónde viene la persona.

Campos pedidos en `solicitar-acceso.html`:

| Rol elegido | Campo | Obligatorio |
|---|---|---|
| Entrenador (`profesional`) | Hipódromo que le otorgó la patente | Sí |
| Entrenador (`profesional`) | Número de patente / matrícula | No |
| Propietario | Caballeriza | Sí |
| Propietario | Hipódromo donde está registrada la caballeriza | Sí |

---

## 1. ¿`solicitudes_acceso` tiene dónde guardar esto?

**No. Hay que agregar columnas.**

Estructura actual (15 columnas):

```
id                uuid          NOT NULL  default gen_random_uuid()
auth_user_id      uuid          NOT NULL
email             varchar       NOT NULL
nombre            varchar       NOT NULL
apellido          varchar       NOT NULL
documento_tipo    varchar       NOT NULL  default 'DNI'
documento_nro     varchar       NOT NULL
telefono          varchar       NULL
rol_pedido        varchar       NOT NULL  check IN ('profesional','propietario')
club_id           uuid          NOT NULL  FK → clubs(id)
estado            varchar       NOT NULL  default 'pendiente'
                                          check IN ('pendiente','aprobada','rechazada','descartada')
motivo_rechazo    text          NULL
resuelta_por      uuid          NULL      FK → usuarios(id)
resuelta_at       timestamptz   NULL
created_at        timestamptz   NOT NULL  default now()
```

No hay ninguna columna de origen, patente, caballeriza ni texto libre reutilizable.
`club_id` es el hipódromo **destino** (a cuál se pide acceso, hoy siempre Dolores),
no el de origen — no se puede reciclar.

Constraints e índices relevantes (a tener en cuenta si se toca el esquema):

- `solicitudes_acceso_auth_user_id_key` UNIQUE (auth_user_id) → una solicitud por cuenta
- `ux_solicitud_pendiente_doc` UNIQUE (club_id, documento_nro) WHERE estado='pendiente'
- `idx_solicitudes_estado_club` (club_id, estado, created_at DESC)
- FK `club_id → clubs(id)`, FK `auth_user_id → auth.users(id) ON DELETE CASCADE`

### ALTER propuesto (NO EJECUTADO)

Todas las columnas nacen NULL-ables: la obligatoriedad se valida en el frontend y en la
RPC, no con `NOT NULL`, porque las filas históricas (solicitudes ya cargadas) no tienen
estos datos y un `NOT NULL` las rompería. Texto libre en el hipódromo de origen — ver
punto 3 para el porqué.

```sql
-- migrations/solicitud_origen.sql  (PROPUESTA — no aplicada)
BEGIN;

ALTER TABLE public.solicitudes_acceso
  ADD COLUMN IF NOT EXISTS origen_hipodromo   varchar(120),
  ADD COLUMN IF NOT EXISTS origen_patente_nro varchar(40),
  ADD COLUMN IF NOT EXISTS origen_caballeriza varchar(120);

COMMENT ON COLUMN public.solicitudes_acceso.origen_hipodromo IS
  'Declarado por el solicitante. Entrenador: hipódromo que le otorgó la patente. '
  'Propietario: hipódromo donde está registrada la caballeriza. Texto libre: no hay '
  'padrón nacional y el solicitante no puede leer clubs/hipodromos por RLS.';
COMMENT ON COLUMN public.solicitudes_acceso.origen_patente_nro IS
  'Declarado por el solicitante (entrenador). Opcional: puede no acordarse.';
COMMENT ON COLUMN public.solicitudes_acceso.origen_caballeriza IS
  'Declarado por el solicitante (propietario). Nombre de la caballeriza / stud.';

COMMIT;
```

Rollback:

```sql
BEGIN;
ALTER TABLE public.solicitudes_acceso
  DROP COLUMN IF EXISTS origen_hipodromo,
  DROP COLUMN IF EXISTS origen_patente_nro,
  DROP COLUMN IF EXISTS origen_caballeriza;
COMMIT;
```

**Nota de alcance**: son 3 columnas y no 4 porque `origen_hipodromo` sirve a los dos
roles (patente del entrenador / registro de la caballeriza). Si se prefiere una columna
por rol para que el significado sea explícito en la DB, son 4 columnas y el mismo trabajo.
Decisión de producto, no técnica.

---

## 2. ¿La RPC acepta parámetros nuevos?

**No. Hay que modificar `rpc_solicitar_acceso`.**

Firma actual:

```sql
rpc_solicitar_acceso(
  p_nombre text, p_apellido text, p_documento_nro text, p_telefono text,
  p_rol_pedido text, p_club_id uuid,
  p_documento_tipo text DEFAULT 'DNI', p_email text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
```

El `INSERT` interno enumera columnas explícitamente
(`auth_user_id,email,nombre,apellido,documento_tipo,documento_nro,telefono,rol_pedido,club_id`),
así que agregar columnas a la tabla **no** las llena solas: hay que tocar la función.

La función es `SECURITY DEFINER` y es el **único** camino de escritura: `solicitudes_acceso`
tiene RLS activo y **sólo** una policy de `SELECT` — no hay policy de `INSERT`, o sea que
el frontend no puede insertar directo aunque quisiera. Toda la validación server-side vive
adentro de la RPC.

### ⚠️ Gotcha: no alcanza `CREATE OR REPLACE`

Agregar parámetros **cambia la firma**. `CREATE OR REPLACE FUNCTION` con una lista de
argumentos distinta no reemplaza: crea una **sobrecarga**. Con dos sobrecargas, PostgREST
no puede elegir y devuelve `PGRST203 — Could not choose the best candidate function`,
rompiendo la solicitud en prod.

La migración tiene que ser:

```sql
BEGIN;
DROP FUNCTION IF EXISTS public.rpc_solicitar_acceso(text,text,text,text,text,uuid,text,text);
CREATE FUNCTION public.rpc_solicitar_acceso(
  p_nombre text, p_apellido text, p_documento_nro text, p_telefono text,
  p_rol_pedido text, p_club_id uuid,
  p_documento_tipo text DEFAULT 'DNI', p_email text DEFAULT NULL,
  p_origen_hipodromo text DEFAULT NULL,
  p_origen_patente_nro text DEFAULT NULL,
  p_origen_caballeriza text DEFAULT NULL
) RETURNS uuid ... ;
COMMIT;
```

Validaciones nuevas a agregar dentro del cuerpo (espejo de lo que valida el frontend):

- `rol_pedido='profesional'` → `origen_hipodromo` obligatorio; `origen_patente_nro` libre.
- `rol_pedido='propietario'` → `origen_hipodromo` **y** `origen_caballeriza` obligatorios.
- Guardar `nullif(btrim(...),'')` en los tres, igual que ya se hace con `telefono`.

Con `DROP` + `CREATE` hay una ventana de milisegundos sin función; en una transacción y
con el tráfico actual de esta página (bajísimo) no es un problema real, pero conviene
aplicarlo fuera de un horario de inscripciones.

`rpc_aprobar_solicitud` **no** necesita cambios: no lee las columnas nuevas. Los datos de
origen son informativos para Yesi, no se copian a la ficha (`profesionales` /
`propietarios`) al aprobar. Si en algún momento se quisiera copiarlos, es un cambio aparte.

---

## 3. ¿Hay tabla de hipódromos para poblar el desplegable?

**Existen dos tablas, pero ninguna sirve como desplegable — va texto libre.**

### 3.1 `clubs` — los tenants del SaaS

3 filas:

| nombre | sigla | localidad | activo |
|---|---|---|---|
| Hipódromo de Dolores | DOL | Dolores, Buenos Aires | true |
| Jockey Club San Francisco - Hipodromo Oscar C. Boero | HSF | San Francisco, Córdoba | true |
| Mi Club Hípico | MCH | Buenos Aires | **false** |

Es la lista de **clientes del sistema**, no de hipódromos del país. No tiene Azul, Tandil,
La Plata, San Isidro ni Palermo.

### 3.2 `hipodromos` — catálogo por club

7 filas, y con un detalle importante: la columna `club_id` las hace **propiedad de un club**.
5 de las 7 pertenecen a `Mi Club Hípico` (el club de demo, `activo=false`):

| nombre | sigla | localidad | club dueño |
|---|---|---|---|
| Hipódromo de Dolores | DOL | Dolores, BA | Hipódromo de Dolores |
| Hipodromo Ciudad de Dolores | DOL | Dolores, BA | Mi Club Hípico (duplicado) |
| Hipodromo Jockey Club de Azul | AZL | Azul, BA | Mi Club Hípico |
| Hipodromo Jockey club de Tandil | TDL | Tandil, BA | Mi Club Hípico |
| Hipodromo de Palermo | HIPA | CABA | Mi Club Hípico |
| Hipodromo de Gualeguaychu | GUA | Gualeguay, ER | Mi Club Hípico |
| Hipodromo de San Francisco | SFC | San Francisco, Cba | Mi Club Hípico |

De los de la zona que pediste: **están Azul, Tandil y Palermo. Faltan La Plata y San Isidro.**
Y hay un duplicado de Dolores.

### 3.3 El bloqueante real: RLS

Las dos tablas tienen RLS activo y la misma policy de lectura:

```sql
-- clubs_select y hipodromos_select, ambas idénticas:
USING ( fn_is_super_admin() OR club_id = fn_get_user_club_id() )
```

El solicitante, en el momento de llenar el formulario, es un `auth.users` **sin fila en
`usuarios`** — eso es justamente lo que viene a pedir. Entonces `fn_get_user_club_id()`
devuelve NULL y `fn_is_super_admin()` es false: **el `SELECT` devuelve 0 filas, sin error**.
Es el mismo patrón ya documentado en el diagnóstico de `initAuth/activo` (`3958dcb`):
RLS devuelve vacío en silencio, no un 403.

O sea: un desplegable poblado desde `clubs` o `hipodromos` se vería **vacío** para
exactamente el usuario que lo tiene que usar.

Para poblarlo habría que abrir lectura pública/anon a un catálogo de hipódromos — es un
cambio de superficie de seguridad, con su propia discusión, y va más allá de "agregar
campos al formulario".

### 3.4 Y lo mismo con la caballeriza

`caballerizas` tiene `caballerizas_select` con la misma condición (`club_id = fn_get_user_club_id()`),
más que el catálogo es per-club: las caballerizas de Dolores son las de Dolores. Un
propietario que viene de Azul no encontraría la suya ni con RLS abierto. **Texto libre.**

Dato lateral que confirma el punto de Diego: `caballerizas` ya tiene una columna
`hipodromo_patente varchar` y `profesionales` también — o sea, el modelo ya asume que
la patente es de un hipódromo. Hoy `profesionales.hipodromo_patente` tiene 84 filas en
`'DOL'` y 101 en NULL: se usa como **sigla de texto libre**, sin FK a ninguna tabla.
El campo nuevo del formulario es coherente con eso.

---

## Recomendación de alcance

1. **3 columnas nuevas** en `solicitudes_acceso`, todas NULL-ables (ALTER de arriba).
2. **`DROP` + `CREATE` de `rpc_solicitar_acceso`** con 3 parámetros nuevos con DEFAULT NULL
   y las validaciones por rol adentro. Nunca `CREATE OR REPLACE` solo.
3. **Texto libre** para el hipódromo de origen, con `datalist` de sugerencias hardcodeadas
   en el HTML (Azul, Tandil, La Plata, San Isidro, Palermo, Gualeguaychú, San Francisco,
   Dolores…). El `datalist` sugiere pero no obliga: el que viene de un hipódromo que no
   está en la lista igual puede escribirlo. Cero dependencia de RLS, cero riesgo de
   desplegable vacío.
4. **Texto libre** para la caballeriza, por el mismo motivo.
5. Mostrar los 3 campos en la tarjeta de `solicitudes.html` (la bandeja de Yesi). La query
   ahí es `.select('*')`, así que las columnas nuevas llegan solas — sólo hay que
   renderizarlas en `tarjetaHTML()` (línea ~266), escapando con el `esc()` que ya existe.
6. El borrador en `localStorage` (`sgh_solicitud_borrador`) se arma desde `leerDatos()`:
   los campos nuevos entran ahí solos si se agregan a esa función, y se restauran en el
   bloque de "volvió de confirmar el email" (final del script).

**Fuera de alcance sugerido** (mencionar, no hacer): abrir lectura anon de un catálogo de
hipódromos, limpiar el duplicado de Dolores en `hipodromos`, y cargar La Plata / San Isidro.
Son tareas de datos y de seguridad, no de este formulario.

---

## Archivos que se tocarían

| Archivo | Cambio |
|---|---|
| `solicitar-acceso.html` | Bloque condicional por rol + `datalist` + `leerDatos()` + `validar()` + `enviarSolicitud()` + restauración del borrador |
| `solicitudes.html` | Render de los 3 campos en `tarjetaHTML()` |
| `migrations/solicitud_origen.sql` | ALTER + DROP/CREATE de la RPC (nuevo) |
| `migrations/solicitud_origen_rollback.sql` | Rollback (nuevo) |
| `SCHEMA.md` / `docs/SCHEMA.md` | Documentar las columnas nuevas |
| `CHANGELOG.md` | Entrada |

---

## Estado

**PASO 1 terminado. Nada ejecutado, nada modificado.** Esperando decisión de alcance.

---

## Adenda — Modelo A vs Modelo B (recomendación)

Los dos modelos posibles para el campo "hipódromo de origen":

- **Modelo A** — texto libre con `datalist` de sugerencias hardcodeadas en el HTML.
- **Modelo B** — desplegable poblado desde un catálogo real de hipódromos en la DB.

**Recomendación: Modelo A.** No como atajo, sino porque B no resuelve el problema y
además termina necesitando A adentro.

### Costo real del Modelo B

**1. La tabla `hipodromos` no se puede reciclar.** Tiene `club_id` y es per-tenant:
5 de sus 7 filas pertenecen al club demo. Y es load-bearing — dos FK apuntan a ella:

```
reuniones.hipodromo_id       → hipodromos(id)
comision_config.hipodromo_id → hipodromos(id)
```

Sacarle el `club_id` o convertirla en catálogo nacional toca reuniones y comisiones.
No se hace. B implica **una tabla nueva** (`hipodromos_catalogo` o similar), global,
sin `club_id`, más su RLS, más su ABM para mantenerla.

**2. Sería la primera tabla de lectura pública del proyecto.** Consulta sobre
`pg_policies`: **cero policies otorgan el rol `anon` hoy**. Todas son `{authenticated}`.
El solicitante llena el formulario antes de tener fila en `usuarios`, así que B necesita
o bien una policy `anon`, o bien una `authenticated` sin condición de club. Cualquiera de
las dos abre una superficie que hoy no existe. El contenido es inocuo — nombres de
hipódromos — pero es una decisión de seguridad con su propia discusión, y no es la que
pediste cuando pediste "agregar campos al formulario".

**3. No hay de dónde sacar los datos.** Es el punto de Diego: no existe padrón nacional.
El catálogo habría que **curarlo a mano**, y después mantenerlo. Alguien tiene que
decidir si "Hipodromo Jockey club de Tandil" y "Hipódromo de Tandil" son la misma fila.

**4. Y aun así el catálogo va a estar incompleto.** Hoy ya faltan La Plata y San Isidro
sobre una lista de cinco que se nombró de memoria. Un desplegable cerrado le bloquea la
solicitud al que viene de un hipódromo que no está cargado — el peor resultado posible:
el sistema rechaza justo al usuario que más necesita validación manual. Entonces B
necesita una opción "Otro → escribilo", que es **el Modelo A metido adentro de B**.
Terminás manteniendo los dos caminos, el de catálogo y el de texto libre, más la
ambigüedad de tener el mismo hipódromo escrito de dos formas según por dónde entró.

### Lo que B compraría, y por qué acá no vale

B compra **datos normalizados**: agrupar solicitudes por hipódromo de origen, estadísticas,
FK. Eso vale cuando el campo alimenta un proceso automático.

Acá no alimenta nada automático. El campo tiene **un solo consumidor: Yesi leyendo la
tarjeta en `solicitudes.html` para saber a qué hipódromo llamar.** Para eso,
`"Jockey Club de Azul"` escrito a mano sirve exactamente igual que un UUID con FK.
El dato no se copia a la ficha al aprobar (`rpc_aprobar_solicitud` no lo toca), no se
consulta después, y el volumen es de unas pocas solicitudes por mes.

Normalizar un campo que sólo lee un humano, una vez, es pagar la estructura sin cobrar
el beneficio.

### Coherencia con lo que ya hay

El modelo ya trata la patente como texto libre: `profesionales.hipodromo_patente` y
`caballerizas.hipodromo_patente` son `varchar` **sin FK a ninguna tabla**
(84 filas en `'DOL'`, 101 en NULL). El Modelo A es consistente con eso. El Modelo B
introduciría un criterio nuevo que las tablas vecinas no siguen.

### Si en algún momento se quiere B

A no cierra la puerta. Con las solicitudes ya cargadas en texto libre se ve **qué
hipódromos aparecen de verdad** — que es justamente el dato que hoy no tenemos para
curar el catálogo. Migrar después es un `UPDATE` de mapeo sobre unas pocas decenas de
filas. Empezar por B es adivinar la lista; empezar por A es medirla.

### Costo comparado

| | Modelo A | Modelo B |
|---|---|---|
| Tabla nueva | no | sí, + ABM para mantenerla |
| Cambio de RLS | no | sí — primera lectura pública del proyecto |
| Curaduría de datos | no | sí, a mano y continua |
| Camino de texto libre | uno | también, como fallback "Otro" |
| Riesgo de bloquear al solicitante | no | sí, si falta su hipódromo |
| Reversible | sí | sí, pero ya pagaste la tabla y la policy |

### La otra decisión abierta (3 vs 4 columnas)

Independiente de A/B y de costo casi nulo en cualquier dirección. Recomiendo **3**
(`origen_hipodromo` compartida entre roles): el rol ya está en `rol_pedido`, así que el
significado se deriva sin ambigüedad y la bandeja lo rotula al mostrarlo. 4 columnas sólo
agregan dos NULL permanentes por fila. Si preferís que la DB sea autoexplicativa sin
mirar `rol_pedido`, 4 es igual de defendible — es cosmética de schema, no arquitectura.

---

## Adenda 2 — Estado del DNI como clave de persona (condición para migrar a B)

**Corrección a la adenda anterior**: ahí dije que el DNI ya funciona "como clave compartida
de hecho". Eso estaba afirmado sin medirlo. Medido ahora. El resultado es bueno, pero la
afirmación necesita condiciones — y el trabajo de limpieza que falta es parte del costo de B.

Todas las consultas normalizan el documento a dígitos
(`regexp_replace(documento_nro,'[^0-9]','','g')`) antes de comparar, así que un mismo número
escrito con y sin puntos cuenta como duplicado.

### Panorama

| Tabla | Filas | Con documento | Sin documento | Documentos distintos |
|---|---|---|---|---|
| `profesionales` | 185 | 145 | **40** (21,6 %) | 145 |
| `propietarios` | 260 | 220 | **40** (15,4 %) | 220 |

### 1. Duplicados en `profesionales`: **cero**

145 filas con documento, 145 documentos distintos. Ningún número aparece dos veces.

### 2. Duplicados en `propietarios`: **cero**

220 filas con documento, 220 documentos distintos. Ídem.

### 3. Cruzado profesional ↔ propietario: **43 documentos en las dos tablas**

Los 43 son **del mismo club**. Es el caso legítimo que anticipaste: entrenador que además
es dueño de sus caballos. No son un error de datos y no hay que "limpiarlos" — pero **sí**
son trabajo para B: un modelo de persona compartida tiene que fusionar esas 43 duplas en
una sola persona con dos roles, y decidir qué nombre queda como canónico.

En 37 de los 43 el nombre coincide exacto. En **6 no**, y ahí la fusión no es automática:

| Documento | En `profesionales` | En `propietarios` | Lectura |
|---|---|---|---|
| 24074423 | DE LA TORRE, GABRIEL | DE LA TORRE, ORGLANDO GAIEL | **Revisar**: no es una variante menor |
| 29849239 | ODIOSOLA, MARINA | ODRIOSOLA, MARINA | Typo en un apellido — hay que decidir cuál vale |
| 43001366 | MORAGA, ADRIAN LEONARDO | MORAGA MILLAN, ADRIAN LEONARDO | Apellido compuesto en una sola |
| 18151946 | DI FRANCO, GUSTAVO | DI FRANCO, GUSTAVO FABIAN | Segundo nombre en una sola |
| 39491188 | ALDECOA, IVAN | ALDECOA, IVAN LUCIANO | Ídem |
| 32555190 | CASTRO, CRISTIAN FABIO | CASTRO, CRISTIAN | Ídem |

### 4. Constraints sobre documento

Asimétrico, y es el hallazgo importante:

| Tabla | Constraint |
|---|---|
| `propietarios` | `ux_propietarios_club_doc` UNIQUE (club_id, documento_tipo, documento_nro) WHERE documento_nro IS NOT NULL |
| `profesionales` | **ninguno** |

O sea:

- En `propietarios` el cero duplicados está **garantizado por la DB** — pero sólo
  **dentro de un club**. El unique incluye `club_id`, así que el mismo DNI en dos clubs
  distintos pasa sin problema. Correcto para el modelo actual, insuficiente para B.
- En `profesionales` el cero duplicados es **suerte y disciplina de carga, no garantía**.
  Nada impide que mañana entren dos filas con el mismo DNI. El ABM tampoco lo valida —
  vale la pena agregar el unique análogo con independencia de A o B.

### Qué significa para el costo de B

El DNI está **más limpio de lo que esperaba**, y eso baja el costo de B respecto de lo que
uno temería. Pero "limpio" no es "listo":

1. **80 filas sin documento** (40 + 40). No se pueden mapear a una persona por DNI: hay que
   identificarlas a mano una por una, o dejarlas fuera del modelo compartido. Es el grueso
   del trabajo y no lo resuelve ningún script.
2. **43 fusiones profesional↔propietario**, de las cuales **6 necesitan decisión humana**
   sobre el nombre canónico y una (24074423) necesita confirmación de que es la misma persona.
3. **Falta el unique en `profesionales`**, y el de `propietarios` es per-club. B necesita
   unicidad **global** por documento, y ponerla es lo que va a hacer aflorar los conflictos
   que hoy no se ven porque nadie los mira.
4. **Hay documentos fuera del formato típico** — p. ej. `92364561` (rango 90–99M, residentes
   extranjeros) y varios de 7 dígitos. Pasan la validación de la RPC (`^[0-9]{7,8}$`), pero
   cualquier limpieza que asuma "8 dígitos, nativo" los rompe.

**Conclusión sobre la recomendación**: no cambia — sigue siendo A. Pero el argumento se
corrige: no es "el DNI ya es la clave", es "el DNI **puede** llegar a serlo con una limpieza
acotada y medible" — 80 identificaciones manuales, 43 fusiones, 6 decisiones de nombre y dos
índices nuevos. Eso es lo que hay que contar cuando se evalúe B, y no estaba contado antes.

**Acción recomendada con independencia de A/B**: agregar
`ux_profesionales_club_doc` análogo al de propietarios. Es barato, hoy no rompe nada
(cero duplicados) y evita que el problema crezca. No lo incluí en
`migrations/solicitud_origen.sql` porque es un cambio de otra naturaleza — que quede como
migración aparte y decidida aparte.

---

## Adenda 3 — Condición que abarata la migración a B

**Decisión tomada: modelo A.** El entrenador de Tandil validado por la secretaría queda como
`profesionales` de Dolores, fila local, con el origen guardado como dato declarado.

A no cierra la puerta a B, pero **la mantiene abierta sólo mientras se cumpla una condición**,
y conviene dejarla escrita porque es fácil de perder de vista mientras haya un solo hipódromo:

> **Condición**: `documento_nro` tiene que estar **cargado** y ser **confiable** en
> `profesionales` y `propietarios`. Es la clave por la que se van a deduplicar las personas
> el día que exista un modelo compartido. Cada fila que se cree sin documento es una
> deduplicación que después hay que hacer a mano.

No es una condición abstracta: sin documento no hay forma automática de saber que el
"MARTINEZ, JUAN" de Dolores y el de Tandil son la misma persona. El nombre no alcanza —
ya vimos 6 casos donde el mismo DNI tiene el nombre escrito distinto **dentro del mismo club**.

### El pasivo actual — Dolores

| Tabla | Filas en Dolores | Sin documento | % |
|---|---|---|---|
| `profesionales` | 174 | **40** | 23,0 % |
| `propietarios` | 253 | **40** | 15,8 % |

Los 80 sin documento del relevamiento global están **todos en Dolores** — los otros clubs no
tienen carga real.

Desglose de los profesionales sin documento:

| Tipo | Total | Sin documento |
|---|---|---|
| entrenador | 128 | 30 |
| jockey | 45 | 10 |
| ambos | 1 | 0 |

### Y no son filas muertas

Es lo que hace que duelan de verdad. Los 80 están **en uso**:

- Los **40 propietarios** sin documento son responsables de una caballeriza — los 40, uno cada uno.
- Esos mismos **40 propietarios** aparecen referenciados en `inscripciones`
  (sobre 66 propietarios distintos con inscripciones: 40 no tienen documento).
- **30 de los profesionales** sin documento aparecen como entrenador en `inscripciones`
  (sobre 80 entrenadores distintos).

No es data histórica que se pueda archivar: es gente que corre. Cuando entre el segundo
hipódromo, cada una de esas 80 filas es una identificación manual — hay que llamar, pedir el
DNI y cargarlo — antes de poder fusionar nada.

### Cómo no empeorarlo

1. **El formulario nuevo ya ayuda**: toda solicitud de acceso exige DNI (`^[0-9]{7,8}$`,
   validado en el cliente y en la RPC), y `rpc_aprobar_solicitud` puede copiarlo a la ficha
   con `p_copiar_documento` cuando la ficha no lo tiene. Es decir, cada persona que entre por
   el autoregistro **nace con documento** y encima le tapa el agujero a una ficha vieja.
2. **Falta cerrar el ABM**: las altas hechas a mano desde `profesionales.html` y
   `propietarios.html` siguen pudiendo guardar sin documento. Mientras eso siga así, el
   pasivo crece por el otro lado.
3. **Falta el unique en `profesionales`** (ver Adenda 2): `propietarios` ya tiene
   `ux_propietarios_club_doc`, `profesionales` no tiene nada.

Ninguna de las tres es parte de este cambio. Van anotadas para que la decisión de A no se lea
como "el tema está cerrado": A es la opción correcta hoy **y** deja una condición que hay que
sostener activamente para que siga siendo barata mañana.
