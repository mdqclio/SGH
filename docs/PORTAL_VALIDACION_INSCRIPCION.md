# Portal — la validación de inscripción no bloqueaba nada

**Fecha:** 2026-08-23 · **Rama:** `fix/portal-carta-llamados`

| | |
|---|---|
| Fix de front (bug 1) | commiteado en la rama · **no está en `main` · no está en prod** |
| Fix de `loadCarta` (`fbdd988`) | ídem — en la rama, **no en `main`** |
| Migración `SECURITY DEFINER` + motivo genérico (bug 2) | **APLICADA en prod** el 2026-08-23 (opción C) |
| Prod (`main`, GitHub Pages) | `portal.html` byte-idéntico a `main`, con el código viejo |

> **Actualización 2026-08-23 — bug 2 cerrado.** Se aplicó la opción C: la función pasó
> a `SECURITY DEFINER` con motivo genérico para el portal. Verificado end-to-end con la
> sesión real del usuario de portal: los tres casos que deben rechazarse ahora se
> rechazan. El texto del mensaje quedó **definido por Fede el 2026-08-23**: va el genérico
> ("no habilitado" / "suspendido"), **sin el motivo**. El que está vivo ya es ése — no hay nada
> pendiente acá.
> Ver "Lo que se aplicó" más abajo. El resto del documento describe el estado previo.

Un usuario del portal (rol `profesional` / `propietario`) podía inscribir cualquier
ejemplar en cualquier carrera. Ni la edad, ni el sexo, ni el cupo, ni una sanción
vigente por doping lo frenaban. Eran **dos bugs encadenados**: arreglar uno solo no
alcanza, y arreglar solo el primero es peor que no arreglar nada, porque deja la
apariencia de una compuerta que sigue abierta.

---

## Bug 1 — el front leía un campo que no existe *(ARREGLADO en esta rama)*

`validar_inscripcion` devuelve `TABLE(puede_inscribirse boolean, motivo text)`.
Esos son los dos únicos campos. `portal.html:660` leía:

```javascript
if (valResult && valResult.valido === false) {   // ← `valido` no existe
```

`undefined === false` es siempre falso. El servidor calculaba edad, sexo, cupo y
sanción, devolvía el veredicto, y el cliente lo tiraba a la basura. Curiosamente
`motivo` sí estaba bien leído — el mensaje de error existía, nunca se llegaba a mostrar.

Segundo agujero en el mismo bloque: el `error` de la RPC no se capturaba. Si la RPC
fallaba, `valResult` quedaba `null`, el `if` daba falso, y se insertaba igual. Una
compuerta que ante la duda deja pasar no es una compuerta.

**Fix** (`portal.html:658-687`): leer `puede_inscribirse`, capturar `valError`, y
**fail-closed** — sin una respuesta afirmativa de la RPC no se inscribe.

## Bug 2 — la RPC decía que sí a todo bajo RLS *(CERRADO — opción C aplicada)*

`validar_inscripcion` era `SECURITY INVOKER` (`prosecdef = false`). Corría con el RLS
de quien la llamaba. Con el JWT del usuario profesional real
de Dolores (`de88e4f2…`):

| tabla que lee la función | visibles / total |
|---|---|
| `spcs` | **0** / 183 |
| `sanciones` → `v_sanciones_vigentes` | **0** / 1 |
| `inscripciones` (chequeo de cupo) | **0** / 248 |
| `carreras` | 49 / 49 ✅ |

> **Cómo simular el JWT.** `fn_get_user_club_id()` y compañía resuelven por
> `usuarios.auth_user_id`, **no** por `usuarios.id` — son distintos. Con el `sub`
> equivocado toda la simulación da 0 filas por el motivo incorrecto y
> `fn_is_portal_user()` devuelve `false`. Para este usuario:
> `usuarios.id = de88e4f2…` pero `auth_user_id = 194f7e35…`. Chequear siempre que
> `fn_is_portal_user()` dé `true` antes de creerle a la simulación.

Con `spcs` invisible, `SELECT * INTO v_spc FROM spcs WHERE id = p_spc_id` no encuentra
nada y `v_spc` queda NULL. A partir de ahí **todos** los `IF` comparan contra NULL, que
en SQL no es TRUE, así que ninguno dispara y la función cae hasta el
`RETURN QUERY SELECT TRUE, 'SPC habilitado para inscribirse.'` del final.

### Qué se rompe, chequeo por chequeo

No todos fallan igual, y la diferencia importa para dimensionar el riesgo:

| chequeo | estado bajo RLS del portal |
|---|---|
| edad mín/máx, sexo | Funcionan **solo si el SPC es del propio usuario** (`spcs_select` deja ver los suyos vía `fn_mis_spc_ids()`). Con un SPC ajeno, `v_spc` queda NULL y pasan de largo |
| **sanción vigente** | **Siempre salteado.** `v_sanciones_vigentes` da 0 filas para cualquier usuario de portal, así que el `IF FOUND` nunca dispara. Un ejemplar con doping vigente pasa aunque sea del propio usuario |
| cupo máximo | `SELECT COUNT(*) FROM inscripciones` cuenta solo lo visible = **0**. Nunca llega al tope |

O sea: el agujero de sanciones era incondicional, y los de edad/sexo dependían de a
quién pertenece el ejemplar. Ninguno de los tres era confiable.

### Evidencia — la misma matriz, dos contextos

Verificado hoy contra prod. Como `service_role` (sin RLS) vs. como `authenticated` con
el JWT del usuario de portal (`sub = 194f7e35…`, `fn_is_portal_user() = true`).
Los SPC de la matriz **no pertenecen** a ese usuario — es el escenario del SPC ajeno:

| caso | service_role | portal (authenticated) |
|---|---|---|
| A — edad insuficiente (2a, mín 3) | `false` · "Edad insuficiente: 2 años. Mínimo: 3" | **`true`** · "SPC habilitado" |
| B — excede edad máx (4a, máx 3) | `false` · "Excede edad máxima: 4 años. Máximo: 3" | **`true`** · "SPC habilitado" |
| C — sanción vigente | `false` · "SPC con sanción vigente: Doping" | **`true`** · "SPC habilitado" |
| D — caso válido | `true` | `true` |

Los tres casos que deben bloquear pasan como habilitados para el único rol que
efectivamente usa el portal.

Es el gotcha #10 de `CLAUDE.md`: las funciones que evalúan reglas **por encima** de RLS
tienen que ser `SECURITY DEFINER`.

---

## Probe de regresión

`tests/probe_portal_validacion.mjs` corre el `confirmarInscripcion` **real** extraído de
`portal.html` (patrón AsyncFunction de `tests/README.md`) contra la DB de prod, con el
INSERT **interceptado**: registra la intención de insertar, nunca escribe. Cero filas creadas.
Salida después de aplicar la opción C (`service_role` no es staff — `auth.uid()` es NULL —
así que también recibe el motivo genérico):

```
$ set -a; . ./.env; set +a; node tests/probe_portal_validacion.mjs

  ok   A edad insuficiente  → BLOQUEÓ · ❌ Tu ejemplar no está habilitado para inscribirse…
  ok   B excede edad máxima → BLOQUEÓ · ❌ Tu ejemplar no está habilitado para inscribirse…
  ok   C sanción vigente    → BLOQUEÓ · ❌ Tu ejemplar no está habilitado para inscribirse…
  ok   D caso válido        → INSERTÓ
  ok   E la RPC falla       → BLOQUEÓ · ❌ No se pudo validar la inscripción…
✅ TODO OK — 0 filas escritas en prod
```

**Ojo con este 5/5.** El probe se autentica con `SUPABASE_SECRET_KEY`, o sea
`service_role`, que **saltea RLS**. Prueba que el fix del front es correcto y que la
lógica del servidor es correcta. **No** prueba que el portal bloquee: mira desde el
lado equivocado del vidrio. Para eso está el segundo probe.

### `tests/probe_portal_validacion_rls.mjs` — el camino real del navegador

Mismo `confirmarInscripcion` real, pero con la **sesión real** del usuario de portal:
JWT emitido por Supabase Auth (magic link vía admin API — no manda mail y no toca la
contraseña), publishable key, PostgREST de prod, RLS activo. INSERT igualmente
interceptado. Incluye un chequeo de cordura: si `fn_is_portal_user()` no da `true`, el
probe lo grita, porque entonces estaría midiendo otra cosa.

```
$ set -a; . ./.env; set +a; node tests/probe_portal_validacion_rls.mjs

sesión real de hipodromodolores@gmail.com (sub 194f7e35-1647-4997-a7ad-c4b000068672)
fn_is_portal_user() = true

  ok   A edad insuficiente  → BLOQUEÓ · ❌ Tu ejemplar no está habilitado para inscribirse. Consultá en secretaría.
  ok   B excede edad máxima → BLOQUEÓ · ❌ Tu ejemplar no está habilitado para inscribirse. Consultá en secretaría.
  ok   C sanción vigente    → BLOQUEÓ · ❌ Tu ejemplar no está habilitado para inscribirse. Consultá en secretaría.
  ok   D caso válido        → INSERTÓ
✅ TODO OK — 0 filas escritas en prod
```

Esto es la prueba que faltaba: una inscripción que **tiene** que ser rechazada, por el
camino del portal, con RLS puesto, y efectivamente rechazada.

---

## Lo que se aplicó — opción C

`migrations/validar_inscripcion_security_definer.sql`, aplicada por MCP el 2026-08-23
como `validar_inscripcion_security_definer_motivo_generico`. `CREATE OR REPLACE` de la
función con tres cambios y ninguna regla de validación tocada:

1. **`SECURITY DEFINER`.** La función ya no depende de lo que el llamador puede ver.
   Mantiene `SET search_path TO 'public'` (obligatorio en DEFINER: evita el secuestro
   por search_path) y sigue **`VOLATILE`**, igual que antes — PostgREST corre las
   funciones no-volátiles en transacción READ ONLY, y ese cambio de comportamiento no
   hacía falta acá.
2. **Motivo genérico para el portal.** `v_detalle := fn_is_staff()`. El staff sigue
   viendo "Edad insuficiente: 2 años. Mínimo: 3" y "SPC con sanción vigente: Doping" —
   lo necesita para operar `inscripciones.html`. Todo lo demás recibe:
   `Tu ejemplar no está habilitado para inscribirse. Consultá en secretaría.`
   Esto además tapa un agujero que el DEFINER abría solo: `p_spc_id` es un parámetro
   libre, así que un usuario de portal podía sondear ejemplares **ajenos** y leerles la
   sanción. Con el motivo genérico no hay nada que sondear.
3. **Fail-closed si no hay fila.** `v_spc` o `v_carrera` en NULL antes caían hasta el
   `TRUE` final; ahora cortan con `FALSE`. Es la misma clase de bug que el del front.

### Verificación

`prosecdef = true`, `provolatile = 'v'`, `proconfig = {search_path=public}`.

Matriz como `authenticated`, dos usuarios distintos:

| caso | portal (`194f7e35…`) | staff / secretaría (`01c55b92…`) |
|---|---|---|
| A — edad insuficiente | `false` · "Tu ejemplar no está habilitado…" | `false` · "Edad insuficiente: 2 años. Mínimo: 3" |
| B — excede edad máx | `false` · "Tu ejemplar no está habilitado…" | — |
| C — sanción vigente | `false` · "Tu ejemplar no está habilitado…" | `false` · "SPC con sanción vigente: Doping" |
| D — caso válido | `true` | — |

**Rollback:** `git show <sha>~1:migrations/validar_inscripcion_security_definer.sql` tiene
la versión previa; o, para revertir solo el modo,
`ALTER FUNCTION public.validar_inscripcion(uuid, uuid) SECURITY INVOKER;`

---

## Opciones

| | Qué se hace | Qué queda |
|---|---|---|
| **A** | Aplicar la migración por MCP, correr la matriz como `authenticated`, extender el probe con un caso bajo RLS | Validación funcionando end-to-end. El `motivo` expone el tipo de sanción y la edad |
| **B** | Dejar solo el fix de front, migración pendiente | Front prolijo, **validación sigue sin bloquear**. Es el estado actual de la rama |
| **C** | `SECURITY DEFINER` + `motivo` genérico para el caso de sanción ("El ejemplar no está habilitado, consultá con secretaría") | Bloquea igual, no escribe "Doping" en pantalla. Un poco más de trabajo y un mensaje menos útil |

Recomendación: **A**, salvo que la respuesta a la pregunta de abajo sea que no.

## La llamada de producto — sigue abierta, pero ya no bloquea nada

Con `SECURITY DEFINER` el `motivo` **podría** mostrarle al usuario del portal el tipo de
sanción de su ejemplar ("Doping") y su edad exacta. Hoy no lo hace: recibe el texto
genérico. Cambiarlo es una línea — `v_detalle := fn_is_staff()` pasa a incluir al dueño
del ejemplar (`p_spc_id IN (SELECT spc_id FROM fn_mis_spc_ids())`), que es el chequeo
correcto si Fede quiere mostrar el detalle sin exponer ejemplares ajenos.

**Para preguntarle a Fede:** ¿el portal puede decirle al entrenador/propietario, por
escrito y en el momento, que su ejemplar tiene una sanción vigente por doping — o eso
se comunica solo por secretaría y el portal debería limitarse a "no habilitado"?
