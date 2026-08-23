# Portal — la validación de inscripción no bloquea nada

**Fecha:** 2026-08-23 · **Rama:** `fix/portal-carta-llamados`

| | |
|---|---|
| Fix de front (bug 1) | commiteado en la rama · **no está en `main` · no está en prod** |
| Fix de `loadCarta` (`fbdd988`) | ídem — en la rama, **no en `main`** |
| Migración `SECURITY DEFINER` (bug 2) | escrita, **NO aplicada** |
| Prod (`main`, GitHub Pages) | `portal.html` byte-idéntico a `main`, con el código viejo |

Un usuario del portal (rol `profesional` / `propietario`) puede inscribir hoy cualquier
ejemplar en cualquier carrera. Ni la edad, ni el sexo, ni el cupo, ni una sanción
vigente por doping lo frenan. Son **dos bugs encadenados**: arreglar uno solo no
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

## Bug 2 — la RPC dice que sí a todo bajo RLS *(NO arreglado — requiere decisión)*

`validar_inscripcion` es `SECURITY INVOKER` (`prosecdef = false`, verificado hoy en
prod). Corre con el RLS de quien la llama. Con el JWT del usuario profesional real
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

O sea: el agujero de sanciones es incondicional, y los de edad/sexo dependen de a
quién pertenece el ejemplar. Ninguno de los tres se puede confiar hoy.

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

```
$ set -a; . ./.env; set +a; node tests/probe_portal_validacion.mjs

  ok   A edad insuficiente  → BLOQUEÓ · ❌ Edad insuficiente: 2 años. Mínimo: 3
  ok   B excede edad máxima → BLOQUEÓ · ❌ Excede edad máxima: 4 años. Máximo: 3
  ok   C sanción vigente    → BLOQUEÓ · ❌ SPC con sanción vigente: Doping
  ok   D caso válido        → INSERTÓ
  ok   E la RPC falla       → BLOQUEÓ · ❌ No se pudo validar la inscripción…
✅ TODO OK — 0 filas escritas en prod
```

**Ojo con este 5/5.** El probe se autentica con `SUPABASE_SECRET_KEY`, o sea
`service_role`, que **saltea RLS**. Prueba que el fix del front es correcto y que la
lógica del servidor es correcta. **No** prueba que el portal bloquee: eso depende del
bug 2, y ahí el probe mira desde el lado equivocado del vidrio. Cuando se aplique la
migración habría que agregarle un caso que corra con el JWT del usuario de portal.

---

## Migración propuesta — `migrations/validar_inscripcion_security_definer.sql`

```sql
ALTER FUNCTION public.validar_inscripcion(uuid, uuid) SECURITY DEFINER;
```

**Por qué es defendible:** la función no devuelve datos de las filas que lee — solo un
booleano y un motivo. No filtra ejemplares, sanciones ni carreras de otros. Ya tiene
`SET search_path TO 'public'`, la precaución obligatoria en `SECURITY DEFINER` (evita el
secuestro por search_path).

**Verificación posterior:** `prosecdef` debe dar `true`, y la matriz de 4 casos como
`authenticated` tiene que pasar A/B/C a `false`.

**Rollback:** `ALTER FUNCTION public.validar_inscripcion(uuid, uuid) SECURITY INVOKER;`

---

## Opciones

| | Qué se hace | Qué queda |
|---|---|---|
| **A** | Aplicar la migración por MCP, correr la matriz como `authenticated`, extender el probe con un caso bajo RLS | Validación funcionando end-to-end. El `motivo` expone el tipo de sanción y la edad |
| **B** | Dejar solo el fix de front, migración pendiente | Front prolijo, **validación sigue sin bloquear**. Es el estado actual de la rama |
| **C** | `SECURITY DEFINER` + `motivo` genérico para el caso de sanción ("El ejemplar no está habilitado, consultá con secretaría") | Bloquea igual, no escribe "Doping" en pantalla. Un poco más de trabajo y un mensaje menos útil |

Recomendación: **A**, salvo que la respuesta a la pregunta de abajo sea que no.

## La llamada de producto

Pasar a `SECURITY DEFINER` hace que el `motivo` le muestre al usuario del portal dos
datos que hoy RLS le tapa: **el tipo de sanción de su ejemplar** (el string literal
"Doping") y **su edad exacta**. Es información sobre su propio caballo, así que lo más
probable es que le corresponda — pero que el portal le escriba "Doping" en la pantalla
en vez de derivarlo a secretaría es una decisión de cómo Dolores quiere comunicar una
sanción, no una decisión técnica.

**Para preguntarle a Fede:** ¿el portal puede decirle al entrenador/propietario, por
escrito y en el momento, que su ejemplar tiene una sanción vigente por doping — o eso
se comunica solo por secretaría y el portal debería limitarse a "no habilitado"?
