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
