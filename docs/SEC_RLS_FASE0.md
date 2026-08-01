# SEC_RLS — FASE 0: baseline de probes

**Fecha:** 01/08/2026
**Branch:** `sec/rls-portal-fase-0` (desde `main` @ `2c2305e`)
**Proyecto:** `unlhcuanfrtpatoipwve`
**Guard:** `pwd = /home/clio/dev/SGH`, `SELECT count(*) FROM spcs` → **144** ✅

**Cambios de schema/policies en esta fase: NINGUNO.** Fase 0 sólo escribe probes y mide el estado previo.

---

## Resultado

| Probe | Resultado | Significado |
|---|---|---|
| **0a** `probe_rls_secretaria.mjs` | **18 OK · 0 FAIL** ✅ | Canario verde. Baseline de lo que la secretaría puede hacer hoy. |
| **0b** `probe_rls_portal.mjs` | **1 PASS · 9 FAIL · 2 PEND** | 9 huecos confirmados empíricamente, no por lectura de policies. |

Los 9 FAIL de 0b son **el resultado esperado**: documentan el estado previo a la FASE 2. Después de cerrar los huecos deben quedar todos en verde.

---

## Decisión de diseño que condiciona todo lo demás

**Los probes NO usan `service_role`.** Esa key bypasea RLS: un probe de RLS que corra con ella pasa siempre, con las policies abiertas o cerradas, y no prueba nada.

Cada probe crea un usuario **fixture**, se loguea con la publishable key (rol `authenticated`, el mismo camino que el browser) y corre las assertions con ese cliente. La key secreta se usa sólo para tres cosas: crear/borrar fixtures, snapshotear, y **verificar en la DB** lo que el cliente autenticado escribió o no escribió.

### La trampa del UPDATE

Un `UPDATE`/`DELETE` bloqueado por RLS **no devuelve error**: devuelve éxito con 0 filas afectadas. Cada assert de escritura hace:

1. snapshot del valor con el cliente **admin**
2. intento de escritura con el cliente **portal**
3. re-lectura del valor con el cliente **admin**
4. assert sobre el **valor**, nunca sobre el status

Sin esto, los asserts 3, 4, 6, 7 y 8 habrían dado verde con los huecos abiertos.

### Los asserts destructivos sólo tocan fixtures

Los asserts 6, 7 y 8 intentan escribir y borrar. Apuntan **exclusivamente** a filas fixture creadas por el propio probe. Cuando el hueco está abierto —y hoy lo está— el probe destruye su propia basura, nunca datos de Dolores. El assert 7 efectivamente **borró** la reunión fixture 9996. Esto es deliberado y no debe cambiarse.

---

## 0a — canario de secretaría: 18/18

Fixture: `probe-rls-secre-<run>@sgh-probe.invalid`, `rol='secretario_carreras'`, club Dolores.

| Bloque | Asserts | Verifica |
|---|---|---|
| S1 lectura del programa | 3 | reuniones (13 visibles), carreras, inscripciones (50) |
| S2 aislamiento entre clubes | 1 | **no** ve reuniones de "Mi Club Hípico" |
| S3 escritura | 2 | UPDATE de `inscripciones.info_adicional` persiste de verdad, con restore |
| S4 catálogos | 5 | spcs, propietarios, profesionales, caballerizas, categorias_carrera |
| S5 liquidaciones | 4 | lee liquidaciones y detalle; INSERT de liquidación + línea (generar) |
| S6 usuarios | 1 | lee los usuarios de su club |
| S7 resultados | 2 | resultados, resultado_posiciones |

**S2 es el assert que valida al resto.** Si la secretaría viera reuniones de otro club, RLS no estaría filtrando y ningún otro assert significaría nada.

### Compatibilidad con la FASE 1

En FASE 1, `fn_get_user_club_id()` pasa a resolver por `usuarios.auth_user_id` en lugar del email. El fixture **detecta si la columna existe y la puebla**. Sin eso, después de la fase 1 el canario daría rojo por un defecto del propio probe y no por una regresión real — el peor resultado posible en un canario. Hoy imprime:

```
usuarios.auth_user_id NO existe todavía (pre-FASE 1) → identidad por email
```

---

## 0b — 12 asserts de PORTAL_V2_PLAN §D.4

Fixtures: 2 propietarios, 2 SPCs, 2 reuniones (9996 desechable / 9997 con hijos), 1 carrera, 2 inscripciones, 1 resultado, 2 liquidaciones + detalle, 1 recibo, 2 usuarios de portal con auth.

| # | Assert | Estado | Evidencia |
|---|---|---|---|
| 1 | A no lee `liquidacion_detalle` de B | ❌ | `filas=1` |
| 2 | A no lee `recibos` de B | ❌ | `filas=1` |
| 3 | A no escribe `propietarios.email` de B | ❌ | `antes=probe-rls-propb-… después=secuestrado-…` |
| 4 | A no escribe `spcs` de B | ❌ | `antes=activo después=retirado` |
| 5 | A no reclama propiedad vía `spc_propietarios` | ❌ | `filas=1` |
| 6 | A no pone en forfait la inscripción de B | ❌ | `antes=inscripto después=forfait` |
| 7 | A no borra una reunión | ❌ | la reunión fixture **fue borrada** |
| 8 | A no altera `resultados` | ❌ | `antes=provisional después=oficial` |
| 9 | A sólo ve su propia fila de `usuarios` | ❌ | `filas=4` |
| 10 | A sí ve su caballo, inscripción y línea | ✅ | — |
| 11 | `portal_inscribir` rechaza SPC ajeno | ⏳ | RPC no existe (FASE 4 del PORTAL_V2_PLAN) |
| 12 | `portal_inscribir` rechaza fuera de ventana | ⏳ | ídem |

### Mapeo a los huecos del plan

| Assert | Hueco | Policy responsable |
|---|---|---|
| 3 | D-H1 | `propietarios_update USING (true)` |
| 4 | D-H3 | `spcs_update USING (true)` |
| 5 | D-H4 | `spc_propietarios_insert WITH CHECK (true)` |
| 1, 2 | D-H2 | `liquidacion_detalle_select`, `recibos_rls` a nivel club |
| 6 | D-H5 | `inscripciones_update` a nivel club |
| 7 | D-H6 | `reuniones_delete` a nivel club |
| 8 | D-H7 | `resultados_update` a nivel club |
| 9 | D-H8 | `usuarios_select` con rama `club_id = fn_get_user_club_id()` |

### El assert 3 es el que más importa

Una cuenta de portal **reescribió el email de otra persona**. Confirma la cadena de suplantación completa de §D-H1: el portal deriva identidad del email, y el email es escribible por cualquier autenticado. No es teoría — está medido.

---

## Dos defectos del propio probe, encontrados y corregidos

Ambos aparecieron corriendo contra prod, no leyendo el schema:

1. **FK de auditoría bloqueaba el teardown.** `trg_audit_inscripciones` deja filas en `auditoria` apuntando al fixture, y `auditoria_usuario_id_fkey` impedía borrarlo. Corregido anulando `auditoria.usuario_id` (columna nullable) antes del DELETE: se despega el usuario sin destruir la entrada de auditoría, que documenta un cambio sobre una fila **real**. Aplicado en los dos probes y en el teardown SQL.
2. **`recibos.neto_a_cobrar` es GENERATED ALWAYS** (gotcha #9). El INSERT del fixture lo incluía y fallaba, dejando el assert 2 sin dato. Corregido; el assert 2 ahora corre y confirma el hueco.

El residuo de la primera corrida se limpió a mano por SQL, preservando las 2 filas de auditoría.

---

## Residuo: cero

Verificado después de la última corrida de cada probe:

| Tabla | Fixtures restantes |
|---|---|
| `usuarios` / `auth.users` (`probe-rls-%`) | 0 / 0 |
| `reuniones` 9996, 9997 | 0 |
| `spcs` `PROBE %` / `propietarios` `PROBE-%` | 0 / 0 |
| `recibos` `probe-rls-%` | 0 |
| `inscripciones.info_adicional` `probe-rls-%` | 0 |

Totales de control: **`spcs` = 144** (igual que el guard), **`inscripciones` = 142** (125 de R6 + 17 de la reunión 9999).

Residuo manual, si un probe muere antes del `finally`: `tests/teardown_probe_rls.sql` (inspección primero, borrado después, patrones angostos a `.invalid` / `PROBE` / 9996-9997).

---

## Cómo se corren

```bash
set -a; . ./.env; set +a
node tests/probe_rls_secretaria.mjs   # canario — debe dar 18/18 SIEMPRE
node tests/probe_rls_portal.mjs       # huecos — hoy 9 FAIL, post-FASE 2 debe dar 0
```

**Regla operativa:** después de cada fase, 0a primero. Si el canario se pone rojo, rollback inmediato sin discutir; recién después mirar 0b.

---

## Lo que NO cubre este baseline

Honestidad sobre los límites:

- **Asserts 11-12 pendientes.** Dependen de `portal_inscribir()`, que es FASE 4 del PORTAL_V2_PLAN. No hay forma de anticiparlos.
- **0a usa un fixture, no `dolores@sgh.com`.** Las policies resuelven por `fn_get_user_club_id()` y no distinguen qué usuario de secretaría es, así que los caminos son los mismos. Pero **no sustituye la prueba de login real** que pide el gate de la FASE 1.
- **0a no ejerce cada módulo del sistema.** Cubre las tablas que la secretaría toca a diario, no cada query de cada HTML. Un endurecimiento que rompa una consulta específica de, por ejemplo, `programa-oficial.html` podría pasar el canario.
- **0b prueba con `rol='propietario'`.** Falta la variante `profesional` y la persona con ambas fichas. Conviene agregarla cuando exista `usuario_entidades` (FASE 2 del PORTAL_V2_PLAN).

---

## GATE 0 — qué se pide

1. **OK al baseline** (0a 18/18 verde, 0b con 9 huecos documentados).
2. **Confirmación de dos cosas antes de la FASE 1:**
   - Que se pueda hacer el backfill de `auth_user_id` de las 3 filas de `usuarios`. Si alguna no matchea contra `auth.users`, la fase frena (así está pedido).
   - Que estés disponible para **probar tu propio login** después de 1b — el gate de la fase 1 lo exige y no hay forma de automatizarlo.

Con el OK, la FASE 1 arranca escribiendo el rollback antes de tocar nada.
