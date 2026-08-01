# SEC_RLS — FASE 2: cierre de los huecos de RLS

**Fecha:** 01/08/2026
**Branch:** `sec/rls-portal-fase-2` (desde `sec/rls-portal-fase-1` @ `3ec3f91`)
**Proyecto:** `unlhcuanfrtpatoipwve`
**Guard:** `pwd = /home/clio/dev/SGH`, `SELECT count(*) FROM spcs` → **144** ✅ (antes y después)

**Estado: APLICADA en producción**, en tres grupos con canario entre cada uno.

---

## Resultado

| Probe | Antes de FASE 2 | Después |
|---|---|---|
| **0a** canario de secretaría | 18 OK · 0 FAIL | **18 OK · 0 FAIL** ✅ |
| **0b** portal | 1 PASS · 9 FAIL | **11 PASS · 0 FAIL · 2 PEND** ✅ |
| `probe_rls_no_permissive` | 8 gateadas | **0 · allowlist vacía** ✅ |

El canario se corrió **después de cada uno de los tres grupos**, no sólo al final. Nunca se puso rojo, así que no hubo que revertir nada.

### Progresión de los 9 huecos

| # | Assert | Baseline | Post 2a | Post 2b | Post 2c |
|---|---|:--:|:--:|:--:|:--:|
| 1 | lee `liquidacion_detalle` ajeno | ❌ | ❌ | ❌ | ✅ |
| 2 | lee `recibos` ajenos | ❌ | ❌ | ❌ | ✅ |
| 3 | escribe `propietarios.email` ajeno | ❌ | ✅ | ✅ | ✅ |
| 4 | escribe `spcs` ajeno | ❌ | ✅ | ✅ | ✅ |
| 5 | reclama propiedad vía `spc_propietarios` | ❌ | ✅ | ✅ | ✅ |
| 6 | forfait de inscripción ajena | ❌ | ❌ | ✅ | ✅ |
| 7 | borra una reunión | ❌ | ❌ | ✅ | ✅ |
| 8 | altera `resultados` | ❌ | ❌ | ✅ | ✅ |
| 9 | enumera `usuarios` del club | ❌ | ❌ | ❌ | ✅ |
| 10 | ve lo suyo (positivo) | ✅ | ✅ | ✅ | ✅ |
| 13 | reapunta su `entidad_id` | — | — | — | ✅ |

11 y 12 siguen **pendientes**: dependen de `portal_inscribir()`, que es FASE 4 del PORTAL_V2_PLAN.

### Verificación estructural

| Chequeo | Valor |
|---|---|
| Policies con `USING/WITH CHECK = true` en los 4 catálogos | **0** |
| Policies de escritura con guarda de portal | **30** |
| Policies de `usuarios` que usan `auth.jwt()` | **0** |
| Policies en `recibos` | **4** (era 1 `FOR ALL`) |
| Policies totales en `public` | 120 (era 117; +3 por el split de `recibos`) |

---

## Grupo 2a — los cuatro `USING (true)`

Cierra **D-H1** (volcado de PII + suplantación), **D-H3** (Stud Book escribible) y **D-H4** (reclamar propiedad).

`spcs`, `propietarios`, `profesionales`, `spc_propietarios`: lectura acotada a lo propio para el portal, escritura sólo secretaría, DELETE sigue siendo super_admin.

### Desvío 1: `fn_is_staff()` en vez de `NOT fn_is_portal_user()`

El plan pedía la forma negada. **Falla abierta**: para un usuario autenticado sin fila en `usuarios`, `fn_is_portal_user()` devuelve false y el `NOT` lo convierte en acceso total de secretaría.

No es hipotético — hoy `auth.users` tiene 5 filas y `public.usuarios` 3. Las dos huérfanas (`sanfrancisco@sgh.com`, `clio@mdq.com.ar`, detectadas en FASE 1) caen justo en ese caso.

`fn_is_staff()` es la forma afirmativa: exige fila en `usuarios`, activa, con rol de secretaría. **Mismo resultado para la secretaría real** —requisito explícito del gate, verificado por el canario— y cerrado para todo lo demás.

En **2b** sí se usó la forma negada que pedía el plan, porque ahí la condición de club ya cierra el caso: sin fila en `usuarios`, `fn_get_user_club_id()` devuelve NULL, `X = NULL` es NULL y la policy no concede. El `NOT` no puede fallar abierto en ese contexto.

### Desvío 2: `fn_mis_entidades()` sobre `usuarios.entidad_tipo/entidad_id`

El plan la define sobre `usuario_entidades`, que no existe (es FASE 2 del PORTAL_V2_PLAN, otra pasada). Se implementó sobre las columnas que **ya existen**.

Hoy devuelve 0..1 filas por cuenta; con `usuario_entidades` devolverá 0..N. **La firma no cambia**, así que cuando llegue la tabla sólo hay que reescribir el cuerpo de la función — ninguna policy de esta migración se toca.

### Funciones nuevas

`fn_is_staff()`, `fn_is_portal_user()`, `fn_mis_entidades()`, `fn_mis_spc_ids()`. Todas `STABLE SECURITY DEFINER` con `search_path` fijo (GOTCHA #10) y **nacidas envueltas** en `(SELECT fn())` para InitPlan.

---

## Grupo 2b — escritura de portal bloqueada

Cierra **D-H5**, **D-H6** y **D-H7**. 27 policies sobre 9 tablas: `inscripciones`, `reuniones`, `carreras`, `resultados`, `resultado_posiciones`, `liquidaciones`, `liquidacion_detalle`, `caballerizas`, `apoderados`.

```
antes:   (fn_is_super_admin() OR (X = fn_get_user_club_id()))
después: (NOT (SELECT fn_is_portal_user())
          AND ((SELECT fn_is_super_admin()) OR (X = (SELECT fn_get_user_club_id()))))
```

**Requisito del gate cumplido:** el `AND` es neutro para la secretaría (la función devuelve false). Lo verifica el canario, cuyo S3 hace un UPDATE real sobre `inscripciones` y comprueba en la DB que persistió.

`recibos` quedó fuera de este grupo a propósito: tenía una sola policy `FOR ALL` que mezcla lectura y escritura.

---

## Grupo 2c — lectura de plata + `usuarios`

Cierra **D-H2** y **D-H8**.

Forma de las policies de plata:

```
super_admin                                   → todo
secretaría (fn_is_staff) con club coincidente → todo lo del club
portal                                        → SÓLO donde es beneficiario
```

`recibos` pasó de 1 policy `FOR ALL` a 4 por comando: SELECT deja ver al beneficiario, las de escritura son sólo secretaría.

Las policies de `usuarios` perdieron la rama `email = auth.jwt()->>'email'` y pasaron a `auth_user_id = auth.uid()`. **Es el residual que la FASE 1 dejó anotado**: aquella fase cambió las funciones, no estas dos policies.

### El agujero que 2c habría abierto — y la guarda

Al resolver la identidad del portal por `usuarios.entidad_id` (introducido en 2a), apareció un vector nuevo que el plan no contemplaba:

`usuarios_update` permite editar **la fila propia**, y RLS no tiene granularidad de columna. Una cuenta de portal podría reapuntar su propio `entidad_id` a la ficha de otro propietario y quedar suplantándolo — **peor que el D-H1 original, porque no necesitaría tocar la fila de la víctima**.

No se puede cerrar restringiendo la policy a super_admin: `reset-password.html:295` actualiza `activo`/`estado` de la fila propia y dejaría de funcionar.

Se cerró con `trg_usuarios_guard_privilegios`, un trigger `BEFORE UPDATE` que rechaza cambios en `rol`, `club_id`, `entidad_tipo`, `entidad_id` y `auth_user_id` salvo super_admin. El resto de la fila sigue siendo editable por su dueño.

Deja pasar a `service_role` (`auth.uid() IS NULL`): esa key ya bypasea RLS por completo, así que bloquearla no agregaría seguridad y rompería los scripts de administración y los probes.

**Verificado** con el assert 13, agregado a `probe_rls_portal.mjs` como regresión permanente: la cuenta A intenta reapuntar su `entidad_id` a la ficha de B y el valor no cambia.

---

## Rollback

Un archivo por grupo, **commiteado antes del ALTER correspondiente** (regla 2d). Todos son dump textual de `pg_policies` tomado inmediatamente antes.

| Grupo | Rollback | Commit previo |
|---|---|---|
| 2a | `migrations/sec_rls_fase2a_rollback.sql` | `f67bf42` |
| 2b | `migrations/sec_rls_fase2b_rollback.sql` | `fa4cdfb` |
| 2c | `migrations/sec_rls_fase2c_rollback.sql` | `a36c96d` |

Son independientes y se pueden aplicar en cualquier orden salvo uno: el bloque que dropea las funciones nuevas (comentado al final de 2a) exige tener 2b y 2c ya revertidos, o sus policies quedan referenciando funciones inexistentes.

---

## Efecto colateral: `probe_rls_no_permissive` quedó estricto

Ese probe traía una `ALLOWLIST` de 8 entradas —justamente las de escritura de los 4 catálogos— con el comentario *"QUITAR CADA ENTRADA AL APLICAR FASE 3"*. Esa FASE 3 es la que acabamos de hacer.

La allowlist quedó **vacía** y el probe pasó a ser estricto total: cualquier policy de escritura con `USING(true)` o `WITH CHECK(true)` que aparezca de acá en más lo pone rojo.

---

## Residuo: cero

| Chequeo | Valor |
|---|---|
| `spcs` | **144** |
| `inscripciones` | **142** (125 de R6 + 17 de la reunión 9999) |
| `usuarios` | **3** |
| Fixtures `probe-rls-%` (usuarios / auth) | 0 / 0 |
| Reuniones 9996-9997 · SPCs `PROBE %` · propietarios `PROBE-%` | 0 · 0 · 0 |
| Marcas `probe-rls-%` en `inscripciones` | 0 |

---

## Lo que NO cubre esta fase

- **Asserts 11-12 pendientes.** Dependen de `portal_inscribir()` (FASE 4 del PORTAL_V2_PLAN).
- **La secretaría sigue leyendo todos los propietarios, profesionales y SPCs, sin filtro por club.** Deliberado: `spcs` no tiene `club_id` (son globales por diseño) y acotar propietarios/profesionales por club puede romper consultas con `club_id` NULL. El modelo de amenaza de esta pasada es la cuenta de portal, no el personal de secretaría. Acotar por club merece su propia pasada con su propio canario.
- **0b prueba con `rol='propietario'`.** Falta la variante `profesional` y la persona con ambas fichas — que hoy `entidad_tipo`/`entidad_id` ni siquiera puede representar. Se cubre cuando exista `usuario_entidades`.
- **El canario no ejerce cada query de cada HTML.** Cubre las tablas que la secretaría toca a diario. Un endurecimiento que rompa una consulta puntual de, por ejemplo, `programa-oficial.html` podría pasarlo igual.
- **`usuarios.html` probablemente ya no funcionaba para secretaría antes de esta fase**: su UPDATE (línea 475) edita usuarios del club, pero `usuarios_update` era `super_admin OR fila propia`. No es una regresión introducida acá — quedó igual que estaba.

---

## GATE 2 — qué se pide

1. **OK a los tres grupos** (canario verde después de cada uno, 0b de 9 FAIL a 0).
2. **Una segunda prueba de login tuya**, por lo mismo que en la FASE 1: el canario usa un fixture. Vale especialmente mirar que `admin.html` (aprobar/rechazar usuarios) y `liquidaciones.html` sigan andando, que son los que más policies tocan.

Con el OK sigue la **FASE 3** (R2a wrap InitPlan), que ya tiene la mitad del trabajo hecho: las policies creadas en 2a/2b/2c nacieron envueltas.
