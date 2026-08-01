# SEC_RLS — FASE 3: R2a wrap InitPlan (cierre de la pasada)

**Fecha:** 01/08/2026
**Branch:** `sec/rls-portal-fase-3` (desde `sec/rls-portal-fase-2` @ `65e5c88`)
**Proyecto:** `unlhcuanfrtpatoipwve`
**Guard:** `pwd = /home/clio/dev/SGH`, `SELECT count(*) FROM spcs` → **144** ✅ (antes y después)

**Estado: APLICADA en producción.** Migración `r2a_wrap_policies_initplan`.

---

## Resultado

| Chequeo | Esperado | Real |
|---|---|---|
| Policies con `fn_is_super_admin()` sin envolver | 0 | **0** |
| Policies con `fn_get_user_club_id()` sin envolver | 0 | **0** |
| Policies con `auth.jwt()` sin envolver | 0 | **0** |
| Policies con `fn_is_super_admin()` envuelta | — | 106 |
| Policies con `fn_get_user_club_id()` envuelta | — | 92 |
| **Canario 0a** | 18/18 | **18 OK · 0 FAIL** ✅ |
| **Portal 0b** | 11 PASS | **11 PASS · 0 FAIL · 2 PEND** ✅ |
| `probe_rls_no_permissive` | 0 | **0, allowlist vacía** ✅ |

Estado previo: 120 policies, de las cuales **35 ya venían envueltas** (las creadas en FASE 2a/2b/2c) y **71 tenían `fn_is_super_admin()` sin envolver**. R2a tocó esas 71.

---

## 3a — el rollback que faltaba

`migrations/r2a_wrap_policies_initplan_rollback.sql`, commiteado en `0e1d785` **antes** de aplicar. Misma técnica DO/regex a la inversa.

**Por qué un regex inverso alcanza acá.** El riesgo habitual de revertir con regex es dejar la policy semánticamente distinta. No aplica:

1. La sustitución es de **tres tokens exactos** de llamada a función. No toca operadores, columnas ni estructura booleana.
2. Si el regex produjera texto inválido, `ALTER POLICY` **falla al parsear** y la transacción aborta. Postgres no guarda una expresión rota. El modo de falla es *"no se aplica nada"*, no *"se aplica algo sutilmente distinto"*.

Por eso no se versionó un snapshot literal de las 120 policies: no agregaría garantía.

**Efecto colateral documentado en el archivo:** el rollback desenvuelve **todas** las policies, incluidas las 35 que nacieron envueltas en FASE 2 y que R2a no tocó. No cambia la semántica de ninguna, pero las des-optimiza. Para revertir sólo R2a hay que re-aplicar las tres migraciones de FASE 2 (son idempotentes).

---

## 3c — medición

### Corrección sobre el baseline citado

El gate pedía comparar contra *"319 buffers / 8,54 ms"*. Los **319 son el delta** de la tanda R1/R3 (`−319 (−23,7 %)`), no un absoluto. El baseline real documentado en `PERF_R1_R3_RESULTADO.md` es **1.026 buffers / 8,50 ms**.

### Query (d) — `liquidacion_detalle` por 79 `liquidacion_id` de R6

Metodología idéntica a la del informe: `SET LOCAL ROLE authenticated` + `request.jwt.claims` de `dolores@sgh.com`, RLS activa, mismo IN-list literal. **Un cambio necesario:** los claims ahora incluyen `sub` con el `auth_user_id`, porque desde la FASE 1 la identidad se resuelve por `auth.uid()` y no por email.

| Momento | Buffers | Execution | InitPlan |
|---|---:|---:|:--:|
| Baseline `PERF_R1_R3` (pre-FASE 2) | 1.026 | 8,50 ms | no |
| **Post-FASE 2, pre-R2a** | 1.008 | 4,32 ms | **sí** |
| **Post-R2a** | 1.006 | 5,07 ms | sí |

**R2a no produjo cambio medible en esta query, y hay una razón concreta:** la policy `liquidacion_detalle_select` fue reescrita en FASE 2c y **nació envuelta**. El InitPlan que R2a venía a producir ya estaba. La diferencia entre 4,32 y 5,07 ms es ruido entre corridas.

Dicho de otro modo: la mejora que el informe atribuía a R2a en esta query **ya la había cobrado la FASE 2c** — de 8,50 ms a 4,32 ms, −49 %.

### A/B controlado — donde R2a sí actuó

Como la query (d) no podía mostrar el efecto, se midió una policy que FASE 2 **no** tocó: `inscripciones_select`. El "antes" se obtuvo desenvolviendo la policy dentro de una transacción **revertida**, así que no se persistió ningún cambio.

```sql
BEGIN;
ALTER POLICY inscripciones_select ON public.inscripciones
  USING (fn_is_super_admin() OR (fn_club_de_carrera(carrera_id) = fn_get_user_club_id()));
SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims = '{...}';
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM inscripciones;
ROLLBACK;
```

| | Sin wrap | Con wrap (post-R2a) | Δ |
|---|---:|---:|---:|
| Nodo | `Seq Scan` | `Seq Scan` | — |
| Filter | `fn_is_super_admin() OR (…= fn_get_user_club_id())` | `(InitPlan 1).col1 OR (… = (InitPlan 2).col1)` | InitPlan ✅ |
| **Buffers** | **1.381** | **1.321** | **−60 (−4,3 %)** |
| **Execution** | **8,94 ms** | **4,70 ms** | **−4,24 ms (−47,4 %)** |
| Filas | 142 | 142 | igual ✅ |

Esa es la mejora real que aporta R2a en las 71 policies que FASE 2 no había tocado.

### Por qué los buffers bajan poco y el tiempo mucho

`fn_club_de_carrera(carrera_id)` **sigue evaluándose por fila** — toma una columna, es correlacionada por definición, y el wrap no puede convertirla en InitPlan. Eso es deliberado y está documentado en el encabezado de R2a.

Lo que el wrap sí elimina es la re-evaluación por fila de `fn_is_super_admin()` y `fn_get_user_club_id()`. En el plan post-R2a, `InitPlan 1` sola consume 430 de los 1.321 buffers — pero **una vez por query** en lugar de 142 veces.

---

## Residuo: cero

| Chequeo | Valor |
|---|---|
| `spcs` | **144** |
| `inscripciones` | **142** |
| `usuarios` | **3** |
| Policies en `public` | 120 |
| Fixtures `probe-rls-%` (usuarios / auth) | 0 / 0 |
| Reuniones 9996-9997 · SPCs `PROBE %` · marcas | 0 · 0 · 0 |
| `inscripciones_select` tras el A/B | **envuelta** (el ROLLBACK funcionó) |

---

# Cierre de la pasada SEC_RLS

## Lo que se hizo, en cuatro fases

| Fase | Qué | Resultado |
|---|---|---|
| **0** | Dos probes: canario de secretaría + 12 asserts de portal | Baseline: 18/18 · 9 huecos medidos |
| **1** | Identidad por `auth.uid()` (`usuarios.auth_user_id`) | 3/3 vinculados, login real verificado |
| **2** | Cierre de los 9 huecos, en tres grupos con canario entre cada uno | 0b de 9 FAIL a 0 |
| **3** | R2a wrap InitPlan | 0 policies sin envolver |

**El canario nunca se puso rojo.** Se corrió después de cada grupo, no sólo al final, y no hubo que revertir nada en ninguna fase.

## Los 9 huecos, cerrados

| Hueco | Qué permitía | Cerrado en |
|---|---|---|
| D-H1 | Volcado de PII + **suplantación** reescribiendo el email de otro | 2a |
| D-H3 | Stud Book global escribible por cualquier autenticado | 2a |
| D-H4 | Reclamar la propiedad de un caballo ajeno | 2a |
| D-H5 | Poner en forfait / borrar la inscripción de un rival | 2b |
| D-H6 | Borrar una reunión entera | 2b |
| D-H7 | Alterar resultados oficiales | 2b |
| D-H2 | Leer premios y recibos de todo el club | 2c |
| D-H8 | Enumerar los usuarios del club | 2c |
| D-H10 | `LIMIT 1` cross-club silencioso en `fn_get_user_club_id()` | 1 |

Más uno que **no estaba en el plan** y apareció durante la ejecución: la auto-edición de `usuarios.entidad_id` para reapuntarse a la ficha de otro. Cerrado en 2c con `trg_usuarios_guard_privilegios` y cubierto por el assert 13.

## Desvíos respecto del plan, y por qué

1. **`fn_is_staff()` en vez de `NOT fn_is_portal_user()` (2a y 2c).** La forma negada falla abierta para un autenticado sin fila en `usuarios` — y hoy existen dos cuentas así. En 2b sí se usó la negada, porque ahí la condición de club ya cierra ese caso.
2. **`fn_mis_entidades()` sobre `usuarios.entidad_tipo/entidad_id`**, no sobre `usuario_entidades` (que no existe). Misma firma: cuando llegue la tabla se reescribe el cuerpo y ninguna policy se toca.
3. **Trigger de autocompletado de `auth_user_id` (fase 1).** Sin él, el próximo usuario invitado quedaba sin resolver club y el síntoma no apuntaba a la causa.
4. **Trigger de guarda de privilegios (2c).** Ver arriba.

## Lo que queda pendiente

| # | Qué | Dónde |
|---|---|---|
| 1 | **Asserts 11-12** — dependen de `portal_inscribir()` | FASE 4 del `PORTAL_V2_PLAN` |
| 2 | **La secretaría lee todos los propietarios, profesionales y SPCs sin filtro por club.** Deliberado: `spcs` no tiene `club_id` y acotar los otros dos puede romper consultas con `club_id` NULL | Pasada propia, con su propio canario |
| 3 | **0b sólo prueba `rol='propietario'`.** Falta `profesional` y la persona con ambas fichas — que `entidad_tipo`/`entidad_id` ni siquiera puede representar | Cuando exista `usuario_entidades` |
| 4 | **El canario no ejerce cada query de cada HTML.** Un endurecimiento que rompa una consulta puntual podría pasarlo | Ampliar 0a por módulo |
| 5 | **`usuarios.html:475`** edita usuarios del club, pero `usuarios_update` es `super_admin OR fila propia`. Probablemente ya no funcionaba **antes** de esta pasada; quedó igual | Verificar con Fede |
| 6 | **2 cuentas de Auth huérfanas** (`sanfrancisco@sgh.com`, `clio@mdq.com.ar`), de abril, sin confirmar ni login | Limpiar o completar |
| 7 | **`spc_entrenadores_hist`** tiene RLS activo y 0 policies: inaccesible salvo `service_role` | Cuando se use |

## Rollbacks disponibles

Todos commiteados **antes** de su migración:

| Fase | Rollback | Commit |
|---|---|---|
| 1 | `sec_rls_fase1_auth_uid_rollback.sql` | `d98622a` |
| 2a | `sec_rls_fase2a_rollback.sql` | `f67bf42` |
| 2b | `sec_rls_fase2b_rollback.sql` | `fa4cdfb` |
| 2c | `sec_rls_fase2c_rollback.sql` | `a36c96d` |
| 3 | `r2a_wrap_policies_initplan_rollback.sql` | `0e1d785` |

Para revertir la pasada entera hay que ir **de la fase 3 hacia la 1**: las policies de 2a/2b/2c referencian `fn_is_staff()` y `fn_mis_entidades()`, y esas funciones dependen de `usuarios.auth_user_id`, que dropea el rollback de la fase 1.

## Cómo se verifica de acá en más

```bash
set -a; . ./.env; set +a
node tests/probe_rls_secretaria.mjs    # canario — 18/18 SIEMPRE
node tests/probe_rls_portal.mjs        # 11 PASS / 0 FAIL / 2 PEND
node tests/probe_rls_no_permissive.mjs # 0 permisivas, allowlist vacía
```

**Regla operativa:** ante cualquier cambio de policies, el canario primero. Si se pone rojo, rollback sin discutir; recién después mirar el resto.

---

## GATE 3 — cierre

Pido lo mismo que en los gates anteriores, por última vez: **una pasada por `admin.html`, `liquidaciones.html` e `inscripciones.html`** con tu usuario. Los tres probes están verdes, pero ninguno abre un browser — esa parte no la puedo cubrir yo.

Con eso, la pasada queda cerrada y las cinco ramas `sec/rls-portal-fase-*` listas para mergear a `main` cuando digas.
