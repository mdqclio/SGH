# Scrub de PII sobre el árbol actual de `main` — aplicado

**Fecha**: 2026-08-21
**Rama**: `chore/scrub-pii-arbol-actual`
**Base**: `main` @ `f246e87`
**Propuesta aprobada**: [`docs/SCRUB_PII_PROPUESTA.md`](SCRUB_PII_PROPUESTA.md) (commit `a7433d8`)
**Commit del scrub**: `276b300`

> **Este documento no contiene ningún dato personal.** Sólo rutas y cantidades.

**No se mergeó nada.** La rama está pusheada para revisión del diff.

Se aplicaron las secciones **A, B, C, D, F y G**. La **E** no correspondía (el CUIT era
falso positivo del scan) y la **H** quedó como estaba.

---

## Qué se hizo

| Sección | Acción | Archivos | Ocurrencias |
|---|---|---|---|
| A | Borrado | 3 | 74 campos `dni` no nulos + 1 fragmento de JWT |
| B | DNI → `[REDACTADO]` | 14 | 46 |
| C | DNI a variable de entorno + redacción | 1 | 1 constante + 1 comentario |
| D | Email de persona física → `[EMAIL REDACTADO]` | 2 | 7 |
| F | JWT `anon` → `sb_publishable_...` | 4 | 4 tokens + 1 fragmento |
| G | `git rm --cached` + `.gitignore` | 6 + 1 | 4 reglas nuevas |
| | **Total de archivos tocados** | **31** | |

**36 valores de DNI distintos** salieron del árbol actual.

### B — desglose de las 46 redacciones de DNI

| Archivo | Redacciones |
|---|---|
| `migrations/personas_r8_tanda_4.sql` | 9 |
| `docs/RELEVAMIENTO_SOLICITUD_ORIGEN_2026-08-19.md` | 8 |
| `docs/TANDA_4_R8.md` | 6 |
| `migrations/personas_r8_tanda_5.sql` | 5 |
| `docs/TANDA_5_R8.md` | 5 |
| `migrations/personas_r8_tanda_3.sql` · `docs/TANDA_2_R8.md` · `docs/TANDA_3_R8.md` · `docs/MONTAS_R6_CORRECCION.md` | 2 c/u |
| `migrations/personas_r8_tanda_2.sql` · `migrations/caballerizas_r8_tanda_5.sql` · `docs/CABALLERIZAS_JSON_DIEGO.md` · `docs/RESULTADO_COBROS_V1_1.md` · `docs/FIX_COBROS_BUSQUEDA_CABALLERIZA.md` | 1 c/u |

### C — `tests/probe_propietario_derivacion.mjs`

`DNI_ANCLA` pasó de constante literal a `process.env.SGH_DNI_ANCLA`. Sin la variable:

- el check **A2** (documento igual al DNI ancla) se saltea con un estado nuevo `⏭` y un
  motivo explícito, en vez de fallar;
- se agrega **A2b**, que verifica que el propietario del puente sea de Dolores — la parte de
  A2 que no depende del documento;
- el resumen final cuenta los salteados aparte de los fallos, así un skip no ensucia el
  `exit code`.

Las 2 constantes sintéticas (`DNI_FAKE_1`, `DNI_FAKE_2`) quedaron como estaban: son valores
inventados que el propio probe crea y borra.

---

## Verificación

### 1 · Los 14 archivos con DNI que daban 200

| Chequeo | Resultado |
|---|---|
| Números de 7-8 dígitos restantes en los 14 archivos | **0** |
| DNI adyacente a `dni`/`documento` en todo el árbol trackeado | **0** en esos archivos |
| Celdas de tabla con número suelto de 7-8 dígitos, árbol completo | **0** |
| JWT (`eyJ…`) en el árbol trackeado | **0** |
| Direcciones `gmail.com` en el árbol | **0** |

Lo que sigue matcheando el patrón en el árbol es lo que la sección H dejó a propósito:
`tools/samples/9999_sample.json` y `supabase/functions/reunion-json/_build/baseline_v15_990101.json`
(34 c/u, datos sintéticos de la reunión de prueba 9999, nombres `PRUEBA 9999 — BORRAR`),
`tests/probe_recibos_emision.mjs` (dummy de la serie `1234…`), `docs/AUTOREGISTRO_PLAN.md`
(mockup ASCII con datos inventados) y `CLAUDE.md` (falso positivo: un SHA de git de 7 dígitos
todos numéricos, en una línea que menciona la palabra DNI).

### 2 · Que no se rompa el sitio

| Chequeo | Resultado |
|---|---|
| `.html` o `.js` de la app modificados por el scrub | **0** (el único `.html` tocado es `tmp/preview_programa_color_r6.html`, que se borró) |
| `index.html`, `programa-oficial.html`, `resultados.html`, `liquidaciones.html` vs `main` | **sha256 idéntico** en los 4 |
| Los 4 servidos desde la rama por HTTP local | **200**, con `<title>` correcto, `createClient` presente y la publishable key en su lugar |
| Los 4 en producción (`mdqclio.github.io/SGH/`) | **200** |
| SQL ejecutable de las 5 migraciones (archivo sin comentarios, sha256) | **byte-idéntico** antes y después |
| Líneas no-comentario cambiadas en las 5 migraciones | **0** |

**Limitación honesta**: no pude abrir las páginas en un navegador real. En esta máquina no hay
Chromium, Chrome ni Firefox, y `agent-browser` no está instalado — es la limitación de
plataforma que ya está anotada en `docs/SERVER.md`. Lo que sí está verificado es que los 4
archivos son **byte a byte los mismos que en `main`**, así que su comportamiento no puede haber
cambiado con este commit, y que se sirven con 200 y el HTML íntegro. Si querés la confirmación
visual, abrilos vos desde la rama o esperá al merge y mirá prod.

### 3 · Probes

| Chequeo | Resultado |
|---|---|
| `node --check` sobre `tests/*.mjs` | **51 archivos, 0 errores** |
| `tests/probe_propietario_derivacion.mjs` sin variables de entorno | corta en el guard preexistente de `SUPABASE_SERVICE_ROLE_KEY`, con el mismo mensaje de siempre |

**Limitación honesta**: no pude correr `probe_propietario_derivacion.mjs` de punta a punta
contra prod. Necesita `service_role`, y las claves legacy están desactivadas desde el
2026-06-07 (ver `docs/JWT_SERVICE_ROLE_ESTADO.md`). **Ese probe ya era inejecutable antes de
este cambio**, no lo rompí yo: 16 de los 51 probes están en la misma situación. Para correrlo
hace falta exportar una `sb_secret_...` válida:

```bash
SUPABASE_SERVICE_ROLE_KEY=sb_secret_... SGH_DNI_ANCLA=... node tests/probe_propietario_derivacion.mjs
```

Sin `SGH_DNI_ANCLA` el probe corre igual y saltea A2. Si querés, pasame la secret por entorno y
lo corro para cerrar el chequeo.

### 4 · `tmp/` fuera del índice

| Chequeo | Resultado |
|---|---|
| Archivos de `tmp/` trackeados | **0** (eran 7: 6 destrackeados + 1 borrado) |
| Los 6 destrackeados siguen en disco | **sí**, los 6 |
| `git check-ignore` sobre `tmp/*.csv`, `tmp/*.md`, `tmp/*.mjs` | ignorados por la regla `tmp/` |
| `.csv`, `.xls` o `.xlsx` trackeados en el repo | **0** — la regla nueva no destrackea nada por sorpresa |
| `git status` | limpio salvo 2 archivos sin trackear ajenos al scrub |

Los 2 que quedan sin trackear son `docs/RELEVAMIENTO_EMAIL_2026-08-19.md` y
`tests/diag_certeza_propietarios_r8.mjs`, trabajo en curso previo a esta sesión. **No los toqué.**

---

## Lo que este commit **no** resuelve

1. **La historia de git queda intacta.** Los 36 DNI, los emails y los JWT `anon` siguen siendo
   legibles con `git log -p` y desde la interfaz de GitHub. Esto corta la exposición por
   GitHub Pages y por la vista del árbol actual, nada más.
2. **El JWT `service_role`** sigue en 25 commits alcanzables desde `main`. Verificado como no
   funcional (`docs/JWT_SERVICE_ROLE_ESTADO.md`), pero sale recién con la reescritura.
3. **`fix/dni-cuidadores` y `fix/dni-jockeys`** siguen vivos en el remoto, con 42 DNI, 41
   teléfonos y 25 fechas de nacimiento. Se borran aparte — es un `push --delete`, cinco minutos.
4. **`docs/RELEVAMIENTO_EMAIL_2026-08-19.md`**, sin trackear, no queda cubierto por el
   `.gitignore` nuevo. Sigue siendo commiteable a mano: revisarlo antes de agregarlo.
5. **Observación al pasar, fuera del alcance aprobado**: el check A1 de
   `probe_propietario_derivacion.mjs` imprime el documento y el apellido del titular en la
   salida por consola. No es contenido del repo y no lo toqué, pero es la vía por la que un
   DNI termina pegado en un `.md` de evidencia. Vale enmascararlo cuando se retome el probe.

---

## Próximo paso sugerido

Revisar el diff de `276b300` y mergear. Después, en orden de costo creciente: borrar los dos
branches `fix/dni-*`, borrar los branches de trabajo `tmp/` y `diag/` no mergeados, y recién
ahí planificar la reescritura de historia, que es la parte cara.
