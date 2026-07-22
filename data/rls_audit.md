# Auditoría RLS — SGH

**Fecha**: 2026-07-22 · **Alcance**: schema `public` de producción · **Tipo**: diagnóstico read-only
**Estado**: ningún cambio aplicado. El fix se planifica aparte.

> ⚠️ Este documento vive en un repo público. Describe **estado**, no credenciales:
> no contiene keys, secrets, tokens ni pasos reproducibles de explotación.
> Las claves siguen donde corresponde (publishable en el frontend, secret sólo por env).

---

## Veredicto

**No hay exposición a internet anónimo.** La RLS corta en la superficie que da a la red:
un visitante sin sesión no lee ni escribe nada. Verificado contra producción con la key
pública del frontend, no sólo por catálogo.

El hallazgo real es **entre usuarios autenticados de distintos hipódromos**, y ya no es
hipotético: hay **2 clubes activos** en producción.

---

## 1. RLS habilitada por tabla

**33 de 33 tablas de `public` tienen RLS ON.** Ninguna quedó apagada.
`relforcerowsecurity` está en `false` en todas — es lo normal, sólo afectaría al owner.

## 2. Policies

| Situación | Tablas |
|---|---|
| 4 policies (SELECT / INSERT / UPDATE / DELETE) | 28 |
| 1 policy `ALL` | `club_secuencias`, `liquidacion_config`, `recibos` |
| 2 policies (SELECT + DELETE) | `auditoria` — sin INSERT/UPDATE porque la escribe un trigger |
| **0 policies** | **`spc_entrenadores_hist`** |

**Todas las policies, sin excepción, están dirigidas al rol `authenticated`.**
Ninguna nombra a `anon`. Esa es la razón de fondo por la que la puerta anónima está cerrada:
RLS habilitada + ninguna policy para `anon` = denegado por defecto.

El patrón dominante es el correcto:

```
fn_is_super_admin() OR club_id = fn_get_user_club_id()
```

con variantes por FK cuando la tabla no tiene `club_id` propio: `fn_club_de_carrera`,
`fn_club_de_reunion`, `fn_club_de_resultado`, `fn_club_de_liquidacion`,
`fn_club_de_caballeriza`, `fn_club_de_inscripcion`, `fn_club_de_resolucion`.
Todas SECURITY DEFINER, como corresponde para no caer en recursión de RLS (gotcha #10).

## 3. Key del frontend y qué alcanza

El frontend de GitHub Pages usa la **publishable key** (`sb_publishable_…`), que mapea al
rol `anon`. Es pública por diseño; que esté en el repo **no es el hallazgo**. La secret
(`sb_secret_…`) no está en el repo y sigue yendo sólo por env.

Comportamiento medido contra producción, sin sesión iniciada:

| Superficie | Resultado |
|---|---|
| `SELECT` sobre tablas sensibles (usuarios, propietarios, spcs, liquidaciones, recibos, clubs, auditoria, reuniones) | 0 filas — la RLS filtra todo |
| `INSERT` sobre esas mismas tablas | Rechazado: `42501 new row violates row-level security policy` |
| Vistas `v_programa_reunion`, `v_spcs_activos`, `v_inscriptos_carrera`, `v_sanciones_vigentes` | 0 filas — las 4 tienen `security_invoker = true`, respetan la RLS de quien llama |
| RPCs de negocio (`aplicar_resultado`, `emitir_recibo`, `liberar_linea`, `desoficializar_carrera`) | No ejecutables por `anon` |
| Schema `archive` (tablas `backup_*`) | No expuesto al REST — sólo `public` y `graphql_public` lo están |

`anon` tiene GRANT completo sobre las 37 relaciones, pero eso es el default de Supabase:
**el control efectivo es la RLS, y funciona**.

> Nota de método: la verificación de escritura se hizo con un discriminador **no mutante**
> (una petición inválida que no puede persistir en ningún caso). No se escribió ni se
> modificó ninguna fila durante la auditoría.

---

## Hallazgos por severidad

### 🟠 MEDIA — Cross-tenant entre autenticados: 4 tablas con policies permisivas

`spcs`, `propietarios`, `profesionales` y `spc_propietarios` tienen:

```
SELECT  USING (true)
UPDATE  USING (true) WITH CHECK (true)
INSERT  WITH CHECK (true)
```

Cualquier usuario logueado de **cualquier** hipódromo puede leer, modificar e insertar en
las cuatro. Lo confirman tres fuentes independientes: el catálogo `pg_policies`, la propia
función del proyecto `fn_audit_policies_permisivas()` y el linter de Supabase (8 WARN
`rls_policy_always_true`).

Por qué importa ahora y no "más adelante": en `clubs` hay **dos hipódromos activos**
(Dolores y Jockey Club San Francisco) más uno inactivo de demo. El escenario multi-tenant
ya está vivo.

Matices que hay que tener en cuenta antes de tocar nada:

- **`spcs` es global por diseño** (gotcha #13, los SPCs no tienen `club_id` obligatorio).
  Su `SELECT USING (true)` es defendible. El que pesa es el `UPDATE`.
- **`propietarios` y `profesionales` son per-hipódromo** por ese mismo gotcha. Hoy un club
  puede editar los del otro. Acá el `UPDATE USING (true)` no es lectura cruzada: es
  **escritura cruzada**.

### 🟡 BAJA — Helpers de RLS ejecutables sin sesión

Nueve funciones `fn_*` SECURITY DEFINER están expuestas como RPC y las puede invocar `anon`.
Comportamiento real verificado:

- `fn_is_super_admin()` → `false` ✓
- `fn_get_user_club_id()` → `null` ✓
- `fn_club_de_<entidad>(uuid)` → devuelve el `club_id` de esa entidad

No filtra contenido: hay que conocer un UUID de antemano y sólo se obtiene a qué club
pertenece. Es un oráculo de mapeo entidad→club, no una fuga de datos. Los dos que sí
serían graves responden correctamente para un anónimo.

### 🟡 BAJA — `spc_entrenadores_hist`: RLS ON con 0 policies

Inaccesible para todos salvo `service_role`. **No es una fuga: es lo contrario.**
Cero referencias en el frontend, 8 kB. Tabla muerta o pendiente de uso. Si algún día se
conecta a la UI, va a devolver vacío en silencio hasta que tenga policy.

### 🔵 INFO — `archive.backup_inscripciones_20260515`, `archive.backup_spcs_20260515`

RLS ON sin policy, pero el schema `archive` no está expuesto al REST. Sin alcance desde
la red.

### 🔵 INFO — Auth: protección de contraseñas filtradas desactivada

Advisor `auth_leaked_password_protection` en WARN. Es un toggle del dashboard (chequeo
contra HaveIBeenPwned). No toca la app.

---

## La pregunta abierta que define la prioridad

**¿Está habilitado el registro público (sign up) en Auth?**

`registro.html` y `registro-profesional.html` están **vivas en producción** y llaman a
`auth.signUp()` con la key pública. Si el registro está abierto, cualquiera se auto-registra,
pasa a ser `authenticated`, y el hallazgo 🟠 deja de ser "entre hipódromos" para pasar a
ser alcanzable desde internet.

Atenuante que surge de leer el flujo: `registro.html` intenta primero insertar en `clubs`,
cosa que la RLS le rechaza a un anónimo, así que la página falla **antes** de llegar al
`signUp`. Pero eso es un accidente del orden de los pasos, **no un control de seguridad**:
el endpoint de registro sigue siendo alcanzable de forma directa si está habilitado.

No se probó porque crearía un usuario real. **Se verifica en Dashboard → Authentication →
Providers → Email → "Enable sign ups".** Es lo primero a mirar antes de decidir la urgencia.

---

## Housekeeping (no es seguridad)

- **5 filas en `auth.users` contra 3 en `public.usuarios`**: 2 usuarios de auth huérfanos,
  sin fila de aplicación. No pueden operar (su `fn_get_user_club_id()` da `null`), pero
  conviene limpiarlos o entender de dónde salieron.
- **`supabase.js` define un `CLUB_ID` que apunta al club de demo, que está inactivo**,
  mientras CLAUDE.md documenta Dolores. Son 10 páginas las que cargan `supabase.js`
  (login, admin, usuarios, reuniones, hipodromos, categorias, jockeys, carta-llamados,
  reset-password, registro-profesional). Probablemente lo pise un `CLUB_ID` inline en cada
  HTML, pero hay que confirmarlo: si alguna página usa el de `supabase.js`, apunta a un
  club inactivo.

---

## Notas para planificar el fix (NO aplicado)

Ordenado por riesgo operativo para Yesica y Fede:

| Acción | Riesgo de romper la app | Nota |
|---|---|---|
| Activar leaked password protection | Ninguno | Toggle de dashboard |
| Decidir qué hacer con `spc_entrenadores_hist` | Ninguno | Nadie la usa |
| `REVOKE EXECUTE` de los 9 `fn_*` para `anon` | Bajo | Las policies los invocan como definer desde adentro, no vía RPC. Confirmar con un probe antes |
| Acotar `propietarios` y `profesionales` a `club_id = fn_get_user_club_id()` | Medio | Es el patrón que ya usan otras 10 tablas. Antes hay que grepear los `.from('propietarios')` / `.from('profesionales')`: si alguna pantalla asume ver todos (p.ej. el buscador de Pagos), se vacía |
| Tocar `spcs` | **Alto** | Son globales por decisión de diseño y las inscripciones cruzan hipódromos. Un filtro por club rompe el alta de ejemplares. Si se acota, sólo el `UPDATE`, dejando el `SELECT USING (true)` |

**Orden sugerido**: confirmar primero el estado del sign up público. De eso depende si esto
es deuda técnica a ordenar con calma o algo a cerrar esta semana.

Regla que no hay que perder de vista: **activar o endurecer RLS mal deja a la secretaría sin
poder trabajar**. Cada cambio de policy necesita su probe en `tests/` antes de ir a prod.
