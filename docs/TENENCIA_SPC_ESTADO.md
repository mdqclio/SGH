# Tenencia de los SPC — qué falta para que el portal sirva de verdad

**Fecha:** 2026-08-23 · Relevado sobre producción, sólo lectura.

> El Gate 4 está vivo y verificado (18/18 en `probe_portal_e2e_gate4`). El código funciona. Lo que
> falta es **dato**, y son dos huecos distintos: los caballos sin entrenador vinculado y —el más
> grande— los entrenadores sin cuenta.

---

## 1. Cuántos SPC tienen entrenador

| | Cantidad | % |
|---|---|---|
| SPC en el Stud Book | **183** | 100 % |
| **Con `entrenador_id`** | **114** | **62,3 %** |
| **Sin `entrenador_id`** | **69** | 37,7 % |

Los 69 sin vincular están **todos en estado `activo`**: no son fichas viejas dadas de baja.

Un SPC sin `entrenador_id` **no existe para el portal**. `fn_mis_spc_ids()` resuelve la tenencia
leyendo exactamente ese campo, así que el caballo no aparece en "Mis caballos" y `rpc_inscribir` lo
rechaza con *"Ese caballo no figura a su nombre"*. Se sigue inscribiendo por secretaría, como
siempre — no se pierde nada, simplemente no se puede anotar desde el portal.

### De los 69, cuántos se pueden recuperar solos

Las inscripciones viejas guardan `inscripciones.entrenador_id`, así que en muchos casos el dato ya
está en la base, sólo que en otra tabla:

| | Cantidad |
|---|---|
| **Recuperables volviendo a correr el backfill** | **33** |
| Sólo tienen evidencia en la reunión 9999 (sintética) — se excluye a propósito | 17 |
| Sin ninguna inscripción que diga quién los entrena | 19 |

`migrations/backfill_tenencia_spcs.sql` deriva la tenencia de la inscripción **más reciente** de
cada caballo, excluyendo la reunión 9999 de prueba, y **es idempotente: sólo escribe donde el campo
está en NULL**, así que no pisa ninguna corrección manual que haya hecho Yesi. Cuando se aplicó
había 163 SPC; hoy hay 183. Volver a correrlo tal cual levanta **33 más** y deja la cobertura en
**147 de 183 (80,3 %)**.

Los **36 restantes** (17 + 19) no tienen evidencia utilizable y hay que asignarlos a mano — o
dejarlos, si son caballos que ya no corren.

---

## 2. Cómo se vincula un SPC a un entrenador

**Campo:** `spcs.entrenador_id` → FK a `profesionales(id)`.

**Pantalla:** `spcs.html`, el ABM del Stud Book. En el formulario del ejemplar hay un desplegable
**Entrenador** (`spcs.html:211`, `f-entrenador`) que arranca en *"— Sin asignar —"* y lista los
`profesionales` de tipo `entrenador` o `ambos` que estén activos (`spcs.html:316`). Se guarda con el
resto de la ficha (`spcs.html:490`).

Es **uno por uno**: se abre el caballo, se elige el entrenador, se guarda. No hay asignación masiva
ni importación por planilla.

**No hay ninguna otra pantalla que escriba ese campo.** `inscripciones.html`, `programa.html` y los
programas oficiales mencionan `entrenador_id`, pero es el de `inscripciones` — otra columna, de la
inscripción y no del caballo. La única fuente de verdad de la tenencia es `spcs.entrenador_id`, y el
único lugar donde se toca a mano es `spcs.html`.

---

## 3. ¿Yesi lo puede hacer sola?

**Sí, para vincular caballos. No, para que el portal quede usable.**

### Lo que puede hacer sola

La policy de RLS `spcs_update` exige `fn_is_staff()`, y `fn_is_staff()` devuelve true para
`super_admin`, `secretario_carreras` y `operador`. **Yesi es `secretario_carreras`**, así que entra
en `spcs.html`, abre el caballo, elige el entrenador y guarda. Sin permisos extra, sin pedirle nada
a nadie. El cambio queda en la auditoría como cualquier otra edición.

### Lo que NO puede hacer sola — y es el hueco más grande

| | Cantidad |
|---|---|
| Entrenadores distintos con caballos a su nombre | **64** |
| **Cuentas de portal existentes** (`usuarios.rol = 'profesional'`) | **1** |
| **SPC alcanzables desde el portal hoy** | **0** |

Hay **64 entrenadores con caballos vinculados y una sola cuenta de portal**, que además pertenece a
un profesional (`11d8c346`) que no tiene ningún caballo. El resultado es que **hoy no hay un solo
SPC que se pueda anotar desde el portal**, aunque la tenencia esté cargada al 62 %.

Vincular caballos no alcanza: **hace falta que los entrenadores tengan cuenta**. Eso es el
autoregistro (gates 0–3, con la solicitud y la aprobación por secretaría), o el alta manual de
usuarios. Aunque mañana la tenencia estuviera al 100 %, con una sola cuenta el portal seguiría
sirviendo para una sola persona.

---

## Qué falta, en orden

1. **Volver a correr el backfill** (`migrations/backfill_tenencia_spcs.sql`, idempotente y con
   rollback). Cinco minutos, +33 caballos, cobertura 62 % → 80 %. No pisa nada cargado a mano.
2. **Que Yesi asigne los 36 restantes** desde `spcs.html`, o que se descarten los que ya no corren.
   Uno por uno: si son muchos, vale preguntarse si conviene una asignación masiva.
3. **Cuentas para los entrenadores.** Es el bloqueante real. Sin esto el portal está desplegado y
   funcionando pero no lo puede usar nadie.
4. **Vincularle algún caballo al usuario de prueba** (`hipodromodolores@gmail.com`) si se quiere
   mostrar el portal andando sin crear cuentas nuevas.

## Cómo se relevó

Sólo lectura, contra producción: agregaciones sobre `spcs` e `inscripciones` por MCP,
`pg_policies` + `pg_get_functiondef` para los permisos, y lectura de `spcs.html` y
`migrations/backfill_tenencia_spcs.sql` para el camino de escritura. No se escribió nada.
