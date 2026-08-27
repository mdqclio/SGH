# Auditoría de datos viejos en `CLAUDE.md`

- **Fecha:** 2026-08-27
- **SHA de `main` al auditar:** `298e627`
- **Alcance:** todo `CLAUDE.md`, cotejado contra el repo (`git`/`ls`) y contra producción (`SELECT`, read-only).
- **Estado:** dos cosas ya corregidas (autorizadas); el resto **listado y sin tocar**.

## Guards verificados

```
$ pwd
/home/clio/dev/SGH

$ SELECT count(*) AS spcs_count FROM spcs;
[{"spcs_count":181}]

ref del proyecto: unlhcuanfrtpatoipwve
```

Read-only: sólo `SELECT` contra producción. Ninguna `apply_migration`, ningún `UPDATE`.

---

## 1. Ya corregido (autorizado en este turno)

### 1.1 `CLAUDE.md` → sección Deploy — merge `298e627`

`- **URL prod**: https://mdqclio.github.io/SGH/` apuntaba al origen viejo de GitHub Pages.
Producción es `https://sigh.com.ar/` desde la migración de dominio (`CNAME` en la raíz del repo,
`www` redirige al apex) y el sitio vive en la **raíz**, no en `/SGH/`.

Verificar contra el origen viejo da falso negativo: sirve contenido anterior. Pasó hoy
verificando el merge `e6de112`.

Se agregó además la receta de verificación por md5 contra el archivo del commit, porque el CDN
puede tardar bastante más que el build de Pages.

**Referencias a `mdqclio.github.io` en `CLAUDE.md`: era una sola (línea 309).** Ahora la única
mención es la advertencia de no usarla.

### 1.2 Informe de Pagos — nota de gate corregida (`ac0163c`, branch `reports`)

`docs/diagnosticos/2026-08-27_aplicacion-pagos-rol-carrera.md` §8 decía que se había mergeado sin
OK. No fue así: el pedido decía *"5. Con el probe verde, mergeá a main con --no-ff"*, el probe dio
48/48 y el merge correspondía. Corregido.

---

## 2. Datos viejos encontrados — **NO tocados**

Ordenados por lo que más cuesta si se los cree.

### A. Puede hacer perder tiempo o llevar a error

| # | Dónde | Dice | Es |
|---|---|---|---|
| A1 | `## Workflow` → *Reunión activa para testing* | "Reunión 5 — 17/05/2026 — Hipódromo de Dolores (**11 turnos, ~81 inscripciones**)" | La reunión 5 de Dolores del 17/05/2026 (`c90b6186…`) tiene hoy **0 turnos y 0 inscripciones**, estado `finalizada`. Además hay una **homónima**: reunión 5 del 17/05/2026 en *Mi Club Hípico* (`1d6ee50e…`), también con 0 turnos. Fijar esa reunión para testear no da nada que testear. |
| A2 | `## Modelo de datos` → tabla `reuniones` | "Estados: borrador/publicada/confirmada/anulada" | En producción hay **`borrador`(2), `publicada`(2), `programada`(3), `finalizada`(5), `cancelada`(2)**. `confirmada` y `anulada` no existen en reuniones. La estructura de archivos, además, dice *"reuniones.html CRUD de reuniones (**7 estados**)"* — con 4 listados. |
| A3 | Gotcha crítico #5 | "`carreras.estado` … Valores en uso: `NULL`/`'programada'`, `'confirmada'`, `'anulada'`" | Falta el más común: **`'abierta'` (31 de 49 filas)**. Reales: `abierta` 31, `anulada` 7, `confirmada` 7, `programada` 3, `NULL` 1. Un filtro escrito con la lista vieja se come la mayoría de las carreras (ya pasó: ISSUE-038). |
| A4 | `### Auth` | "Roles: `super_admin` → admin.html \| `secretario_carreras` → index.html" | Hay **cuatro** roles en `usuarios`: `super_admin`(1), `secretario_carreras`(2), **`operador`(3)**, **`profesional`(1)**. `operador` y `profesional` (portal) no están documentados acá. |
| A5 | `## Bugs conocidos` → liquidaciones | "⚠️ Reunión de prueba 9999 (PRUEBA RESUMEN) VIVA en Dolores — borrar con `teardown_prueba_resumen_9999.sql` **antes del 20/6**" | **Sigue viva** (`a0000000-…-9999`, fecha 2099-01-01, estado `cancelada`, **3 turnos y 17 inscripciones**). La fecha límite pasó hace más de dos meses. Y el script **no está en `migrations/`**: está en la **raíz** del repo (`./teardown_prueba_resumen_9999.sql`). |
| A6 | `### Probes de regresión` | "El patrón está en `tests/probe_bug2_*.mjs`: auth con magic link → nav → **DOM assertions vía Playwright**" | **No existe ningún `tests/probe_bug2_*.mjs`.** Y el patrón vigente es el opuesto: real-code sin browser (`AsyncFunction` + Supabase real), porque chromium no corre en este Ubuntu — lo dice el propio `CLAUDE.md` tres líneas más arriba y `docs/SERVER.md`. Los dos párrafos se contradicen. |

### B. Estructura del proyecto desactualizada

El bloque `## Estructura del proyecto` quedó viejo en los cuatro directorios.

| # | Dice | Es |
|---|---|---|
| B1 | Raíz: 21 HTML + 7 JS | Hay **28 HTML y 9 JS**. Sin listar: `registro.html`, `registro-profesional.html`, `reset-password.html`, `solicitar-acceso.html`, `solicitudes.html`, `resultados_legacy.html`, 4 mockups `mockup-no-corrio-*.html`, y los JS **`liquidaciones-engine.js`** (379 líneas, el motor de premios), `edad-spc.js`, `activacion-pendiente.js`. |
| B2 | `docs/` con 11 archivos | Hay **~110** más 3 subdirectorios (`docs/diagnosticos/`, `docs/auditoria/`, `docs/migrations/`). Falta incluso **`docs/MODELO_NUMERACION.md`**, que el propio `CLAUDE.md` referencia en la sección de Gatera/Mandil. |
| B3 | `tests/` con 9 archivos | Hay **65**. |
| B4 | `migrations/` con 3 archivos | Hay **80**. |
| B5 | No aparece el `CNAME` | Existe en la raíz y contiene `sigh.com.ar`. Es el archivo del que depende el dominio de producción. |

No propongo listar los 110 docs ni las 80 migraciones. Lo que hay que decidir es si el bloque pasa
a ser *"los archivos que importan"* (declarado como tal) o si se genera solo.

### C. Modelo de datos incompleto

| # | Tema | Detalle |
|---|---|---|
| C1 | **La tabla `hipodromos` no está documentada** | `CLAUDE.md` dice que `clubs` **son** los hipódromos, pero existe además una tabla `hipodromos` (7 filas: Dolores, Palermo, Azul, Tandil, Gualeguaychú, San Francisco, "Ciudad de Dolores") con columnas propias `club_id, sigla, localidad, provincia, tipo_pista, cantidad_gateras, activo`. Es a la que apunta el `hipodromo_patente` del gotcha #13. Hoy hay que deducirla. |
| C2 | `cantidad_gateras` | El último bullet de "Bugs conocidos" dice "no se carga en el alta de hipódromo (queda en DEFAULT 12)". La columna está en **`hipodromos`**, no en `clubs` — coherente, pero sólo si antes se sabe que C1 existe. |
| C3 | `caballeriza_responsables` | La tabla figura como "Propietario + copropietarios (relacional)" pero no se dice que discrimina por **`rol`** (`'propietario'` / otros) + `activo`. Es la columna que se usa hoy en la búsqueda por caballeriza de Pagos, y reemplazó a `es_titular`. |
| C4 | `reuniones.numero_publico` | Existe en la base (y hay migración `numero_publico_reuniones.sql`). No está en `CLAUDE.md`. |

### D. Menor

| # | Dice | Es |
|---|---|---|
| D1 | "Ver `docs/GOTCHAS.md` para la lista completa (**40 entradas**)" | **73 entradas.** |
| D2 | "`club-switcher.js` Dropdown hipódromo para super_admin (**16 páginas**)" | **17 páginas** lo cargan. |
| D3 | "`portal.html` Portal propietarios/entrenadores **(pendiente)**" y "**portal.html / registro-profesional.html: no construidos**" | Los dos existen: `portal.html` **969 líneas**, `registro-profesional.html` 65. Hay además Gates 0–4 documentados en `docs/AUTOREGISTRO_*` y probes de portal en `tests/`. Lo que falta es decir en qué estado están, no que no existen. |
| D4 | "13 tipos de apuesta válidos" | Correcto como catálogo. En producción hay **9 en uso** (`GAN, SEG, TER, EX, IM, TR, X2, X3, X4`); sin filas: `CUAT, X2P, X5, CAD`. Informativo, no un error. |
| D5 | `### Supabase MCP` | "Verificado el **02/06/2026**". Sigue siendo cierto hoy, pero la fecha ya tiene casi tres meses. |
| D6 | "Bugs conocidos" llega hasta ISSUE-029 | `docs/ISSUES.md` va hasta **ISSUE-050**. Los posteriores están casi todos resueltos, así que no es un error — pero el corte no está declarado. |

### E. Fuera de `CLAUDE.md` (no lo toqué, no me lo pediste)

`mdqclio.github.io` sigue apareciendo en **`README.md:13`** ("App en vivo") y en ~12 docs de
`docs/`. Los de `docs/` son bitácoras fechadas y probablemente deban quedar como están (son fotos
de su fecha, igual que los guards). El de `README.md` sí es una URL que alguien puede usar.

---

## 3. Verificado y correcto (para que no se re-audite)

- Guard `spcs = 181` ✅ (coincide con el baseline anotado del 2026-08-23).
- `CLUB_ID_DOLORES = 0649e9c5-9e87-4aad-842f-101458e6b33c` ✅.
- Gotcha #6: `carreras.apuestas_habilitadas` **no existe** ✅ (dropeada, como dice).
- Gotcha #15: `comisariato` está en `clubs` (jsonb) y **no** en `reuniones` ✅.
- Gotcha #13: `spcs.club_id` es nullable (SPCs globales) ✅.
- Gotcha #14: `propietarios.nombre` existe y **no hay `apellido`** ✅.
- `resultado_posiciones`: `posicion` nullable, `no_largo boolean NOT NULL`, `dividendo`, `diferencia` ✅.
- `carreras.numero_turno` NOT NULL / `numero_carrera_programa` nullable ✅ (sostiene la regla `?? numero_turno`).
- `inscripciones.estado` con los 4 valores documentados ✅.
- `resultados.estado` `provisional`/`oficial` ✅ (de `anulado` no hay filas hoy).
- `categorias_carrera`: 4 por club, en los 3 clubs ✅.
- RPCs vivas con las firmas citadas: `aplicar_resultado`, `emitir_recibo`, `liberar_linea`, `desoficializar_carrera`, `fn_edad_reglamentaria` ✅.

---

## 4. Números de resumen

| Métrica | Valor |
|---|---|
| Hallazgos sin tocar | **19** (6 de riesgo, 5 de estructura, 4 de modelo, 4 menores) |
| Corregidos en este turno | 2 (URL de producción en `CLAUDE.md`; nota de gate en el informe de Pagos) |
| Claims verificados y correctos | 13 |
| Refs a `mdqclio.github.io` en `CLAUDE.md` | 1 → 0 (queda sólo la advertencia) |
| Refs a `mdqclio.github.io` fuera de `CLAUDE.md` | 1 en `README.md`, ~12 en `docs/` (bitácoras) |

---

## 5. Preguntas abiertas

1. **A1 — reunión de testing.** La reunión 5 de Dolores está vacía. ¿Cuál es hoy la reunión con
   datos para probar? Sin eso, esa instrucción de `CLAUDE.md` no sirve y conviene sacarla o
   reemplazarla.
2. **A5 — reunión 9999.** Sigue viva con 3 turnos y 17 inscripciones, dos meses después del plazo.
   ¿Se borra? El script está en la raíz del repo.
3. **B1–B5 — bloque de estructura.** ¿Pasa a ser "los archivos que importan" (y se declara así) o
   se completa? Listar 110 docs y 80 migraciones no le sirve a nadie.
4. **A6 — el párrafo de Playwright.** Contradice al de real-code que está arriba y apunta a
   archivos que no existen. ¿Lo reescribo apuntando al patrón vigente (`tests/README.md`)?
5. **C1 — `hipodromos` vs `clubs`.** ¿Va al modelo de datos de `CLAUDE.md` o alcanza con `SCHEMA.md`?
6. **E — `README.md`.** ¿Actualizo también su "App en vivo" a `sigh.com.ar`?
