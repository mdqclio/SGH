# Gate 2 — `solicitudes_acceso` + RPCs

**Fecha**: 2026-08-04 · **Rama**: `sec/autoregistro-gate-2` · **Base**: `main` @ `8a91183` (Gate 1 aplicado)
**Guard**: `pwd = /home/clio/dev/SGH`, `SELECT count(*) FROM spcs` → **144** antes y después ✅
**Rollback**: commiteado **antes** → `migrations/sec_autoregistro_gate2_rollback.sql` (`692b7c6`)
**Migración**: `migrations/sec_autoregistro_gate2.sql` (`b034d3e`), aplicada como `sec_autoregistro_gate2_solicitudes`
**Sin UI** — `solicitar-acceso.html` y la bandeja son Gate 3.

Implementación de `AUTOREGISTRO_PLAN.md` §B.2, §A.4 y §A.5. **Nada que contradijera el plan**, así que no hubo re-diseño.

---

## Resultado

🟢 **`probe_rls_portal`: 34 PASS · 0 FAIL · 2 PENDIENTE** — 21 asserts nuevos, todos verdes.
🟢 **Canario 0a: 18/18** · 🟢 **`probe_rls_no_permissive`: 0 permisivas**

---

## Selftest en frío antes de aplicar

Como pediste, la migración no se aplicó hasta pasar un selftest sin escribir nada.

Primero verifiqué que el MCP respeta transacciones (`BEGIN; CREATE TABLE; ROLLBACK;` → la tabla no queda). Después corrí **la migración completa dentro de una transacción terminada en `ROLLBACK`**, con las verificaciones adentro:

```
policies_permisivas 0 · rls_activa true · policies_tabla 1 · funcs_secdef 5
```

Y confirmé que no persistió nada: tabla 0, funciones 0, `spcs` 144. Recién ahí apliqué.

Es más que un chequeo de sintaxis: valida tipos, FKs, casts de enum y los cuerpos plpgsql contra el schema real.

---

## Lo implementado

### Tabla

`solicitudes_acceso` según §B.2, con el estado **`descartada`** acordado:

```sql
estado varchar(20) NOT NULL DEFAULT 'pendiente'
  CHECK (estado IN ('pendiente','aprobada','rechazada','descartada'))
```

`descartada` es para los curiosos de Fede: se barren **sin pasar por "rechazo"**, que implica avisarle a alguien. Por eso `rpc_descartar_solicitud` **no lleva motivo** — no se comunica nada.

Índices:
- `ux_solicitud_pendiente_doc` — único parcial sobre `(club_id, documento_nro) WHERE estado='pendiente'`. Anti-flood. Rechazadas y descartadas **no** bloquean, así que se puede reintentar tras una corrección.
- `idx_solicitudes_estado_club` — para la bandeja del Gate 3.

### RLS: una sola policy, de lectura

```sql
USING (
  auth_user_id = (SELECT auth.uid())
  OR (SELECT fn_is_super_admin())
  OR ((SELECT fn_is_staff()) AND club_id = (SELECT fn_get_user_club_id()))
)
```

**No hay policy de INSERT/UPDATE/DELETE**, y es deliberado: cambiar el estado de una solicitud y crear el vínculo tienen que ser **una transacción**. Dos escrituras sueltas autorizadas por policy no lo garantizan. Todo pasa por RPC.

### Las cuatro RPCs

Todas `SECURITY DEFINER`, una transacción cada una, **fail-closed con excepción** — nunca cero filas en silencio.

| RPC | quién | qué valida |
|---|---|---|
| `rpc_solicitar_acceso` | el propio solicitante | sesión · DNI `^[0-9]{7,8}$` · teléfono · nombre y apellido · `rol_pedido` ∈ {profesional, propietario} · club existe · no tener ya usuario · una solicitud por cuenta · anti-flood por DNI |
| `rpc_aprobar_solicitud` | **sólo staff** | guard · solicitud pendiente y del club del staff · `entidad_tipo` coincide con `rol_pedido` · ficha existe y es del mismo club · ficha no tomada |
| `rpc_rechazar_solicitud` | **sólo staff** | guard · pendiente · **motivo obligatorio** |
| `rpc_descartar_solicitud` | **sólo staff** | guard · pendiente. Sin motivo |

**El email no se toma de un parámetro**: se lee de `auth.users` por `auth.uid()`. Así "el email coincide con el de la cuenta" es cierto **por construcción**, no por validación. Igual se acepta `p_email` opcional y se verifica, para que un cliente que mande otra cosa falle ruidosamente en vez de guardar un email distinto en silencio.

`fn_solicitudes_guard_staff()` es el guard compartido. Corta por: sin sesión (`28000`), sin fila en `usuarios`, sin rol de secretaría (`42501`), solicitud inexistente (`P0002`), o solicitud de otro club (`42501`). Sólo `super_admin` cruza clubes.

**El matcheo por DNI sigue siendo de la secretaría** (§C.8): `p_entidad_id` es un **parámetro explícito**. No existe ningún trigger ni ruta que vincule por coincidencia.

La aprobación inserta en `usuarios` con **`rol` explícito** — no se confía en el default aunque el Gate 1 ya lo haya puesto en `'publico'` — y traduce la violación de `ux_entidad_una_cuenta` en un mensaje que dice qué hacer.

`p_copiar_documento` copia el DNI declarado a la ficha **sólo si está vacío**; nunca pisa un dato cargado. Ataca el bloqueante de la integración Stud Book.

### Permisos

`REVOKE ALL ... FROM PUBLIC` en las cinco funciones, `GRANT EXECUTE ... TO authenticated` en las cuatro RPCs. El guard interno **no lleva grant**: es interno. Los guards ya cortan a un anónimo, pero no hay motivo para dejar la puerta abierta y confiar en la cerradura.

---

## Sobre la Edge Function: **no se agregó**

El plan §A.1 la preveía porque el navegador no puede insertar en `usuarios` por RLS. Con `rpc_solicitar_acceso` siendo `SECURITY DEFINER`, el navegador **sí puede** crear su solicitud. Nada de lo que la Edge Function haría queda sin cubrir por las RPCs, así que —siguiendo tu instrucción— no la agregué.

⚠️ **Queda una cosa que las RPCs no pueden hacer y hay que resolver en el Gate 3**: si `rpc_solicitar_acceso` falla **después** del `signUp`, queda una cuenta huérfana en `auth.users`. Una RPC no puede borrar de `auth.users` (necesita Admin API). Opciones para el Gate 3:

1. Validar el DNI en el cliente **antes** del `signUp` — elimina la causa más probable.
2. Barrido periódico de `auth.users` sin `usuarios` ni `solicitudes_acceso`.
3. Recién si eso no alcanza, la Edge Function con el rollback de `invite-user`.

Recomiendo 1 + 2. Ya hay 2 huérfanas previas (de abril), así que el barrido sirve igual.

---

## Verificación

### Probes

| probe | resultado |
|---|---|
| `probe_rls_portal` | ✅ **34 PASS · 0 FAIL · 2 PENDIENTE** |
| `probe_rls_secretaria` (canario 0a) | ✅ **18 OK · 0 FAIL — VERDE** |
| `probe_rls_no_permissive` | ✅ **PASS · 0 permisivas** |

Los 2 PENDIENTE siguen siendo los asserts 11/12 del RPC de inscripción (Gate 4). No son regresión.

### Los 21 asserts nuevos de "cuenta pendiente"

Una cuenta que existe en `auth.users` y **no tiene fila en `usuarios`**. La autenticación va por magiclink admin, así que corre con el captcha activo.

| # | assert | ✓ |
|---|---|---|
| P0 | el pendiente puede crear su solicitud | ✅ |
| P0b | rechaza un DNI con formato inválido (`12.345.678`) | ✅ |
| P0c | una cuenta no puede enviar dos solicitudes | ✅ |
| P1 | no lee `propietarios` / `profesionales` / `spcs` | ✅ |
| P2 | no lee `reuniones` / `carreras` / `inscripciones` / `caballerizas` / `resultados` | ✅ |
| P3 | no lee `liquidaciones` / `recibos` / `liquidacion_detalle` | ✅ |
| P4 | no lee `usuarios` | ✅ |
| P5 | no lee `performances` / `sanciones` (cerrado en el Gate 1) | ✅ |
| P6 | no puede crearse una fila en `usuarios` | ✅ |
| P7 | no puede modificar una ficha de propietario | ✅ |
| P8 | ve exactamente **1** solicitud: la suya | ✅ |
| P11 | **no** ve la solicitud de otra cuenta pendiente | ✅ |
| P9 | no puede auto-aprobarse editando la fila | ✅ |
| P10 | `rpc_aprobar_solicitud` rechaza a quien no es staff | ✅ |
| P10b | `rpc_rechazar_solicitud` rechaza a quien no es staff | ✅ |
| P12 | el staff **sí** puede aprobar | ✅ |
| P12b | la aprobación deja `estado`, `resuelta_por` y `resuelta_at` | ✅ |
| P12c | la fila de `usuarios` queda con rol explícito, activa y vinculada | ✅ |
| P12d | copia el DNI declarado a la ficha que lo tenía vacío | ✅ |
| P13 | **dos cuentas no pueden quedar vinculadas a la misma ficha** | ✅ |
| P13b | la solicitud que chocó queda `pendiente`, no a medias | ✅ |
| P14 | el staff descarta una solicitud de curioso | ✅ |
| P15 | no se puede resolver dos veces la misma solicitud | ✅ |

Los asserts de escritura respetan la trampa ya documentada en el probe: un UPDATE bloqueado por RLS **devuelve éxito con 0 filas**. Todo se verifica releyendo con el cliente **admin** y comparando **valores**.

P13b importa más de lo que parece: confirma que cuando la aprobación falla por ficha tomada, **la transacción entera se deshace** — la solicitud no queda marcada como aprobada sin usuario detrás.

### Estado de la base

| | |
|---|---|
| `spcs` | **144** antes y después |
| `solicitudes_acceso` | 0 filas (fixtures barridos) |
| `auth.users` / `usuarios` | 5 / 3 — baseline |
| residuo de fixtures (auth, usuarios, propietarios) | **0** |
| policies permisivas | **0** |
| policies totales | 121 (+1: la de `solicitudes_acceso`) |
| funciones del gate | 5 |

---

## Siguiente: Gate 3 (UI)

- `solicitar-acceso.html` — reciclando el formulario de `registro-profesional.html` (recuperable con `git show 3c2abaf:registro-profesional.html`), con DNI y teléfono obligatorios, y **el widget de Turnstile**, porque el `signUp` está gateado igual que el login.
- `portal.html`: detectar "sin fila en `usuarios`" → pantalla de estado. **Sin programa público**, decisión 1.
- `solicitudes.html` — bandeja con los tres casos de matcheo, la acción de descartar, y el contador que distingue *pendientes* de *pendientes sin revisar*.
- Volver a **encender el signup público** en el dashboard, que hoy está apagado.
- Resolver los huérfanos de `auth.users` (arriba).
