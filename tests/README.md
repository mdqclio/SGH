# Tests — SGH resultados.html

Scripts de smoke/integración contra producción (GitHub Pages + Supabase). Usan Playwright headless + Supabase JS admin client.

## Prerequisitos

```bash
cd /workspaces/SGH   # raíz del repo
npm install          # instala playwright y @supabase/supabase-js
npx playwright install-deps chromium
```

Los scripts leen credenciales hardcodeadas (ver sección Seguridad).

## Scripts

### `smoke_full.mjs` — Suite completa T1–T17

Cubre el ciclo completo del turno 6 (DIA DE LA ESCARAPELA):

| Grupo | Tests | Qué verifica |
|-------|-------|-------------|
| Lectura | T1–T4 | 20 filas, celdas M.(F), campo Borrados, screenshot |
| Escritura | T5–T10 | Agregar fila TE, reload verify, cambiar vales, eliminar fila, borrar todo (bug 3b), restaurar |
| Atajos | T11–T13 | F8 recarga desde DB, F10 keyboard persiste, F9 keyboard descarta |
| Concurrencia | T14–T17 | Dos contextos, Ctx A guarda, Ctx B recibe error de conflicto |

```bash
node tests/smoke_full.mjs
```

Duración: ~3-4 minutos. Deja screenshots en `docs/smoke_screenshots/`.

### `smoke_t9_t16.mjs` — Regresión bug 3b + optimistic lock

Versión focalizada para verificar rápidamente los dos bugs críticos:

- **T9**: borrar todas las filas → F10 → reload → tabla vacía (fix bug 3b)
- **T16**: Ctx A guarda → Ctx B intenta sin recargar → debe recibir toast de conflicto

```bash
node tests/smoke_t9_t16.mjs
```

Duración: ~1 minuto.

### Probes de regresión vigentes

Scripts focalizados en comportamientos críticos. Cinco probes activos:

```bash
node tests/probe_modelo_chapa.mjs      # Modelo mandil 1..N (→ prod)
node tests/probe_dividendos_inline.mjs # Inputs de dividendos inline + E2E save (→ localhost)
node tests/probe_no_largo.mjs          # Botón "no corrió" + deducción automática (→ localhost)
node tests/probe_vacante_vac.mjs       # Vacante escribiendo "VAC" en el input + F8 no pisa VAC (→ localhost)
node tests/smoke_t9_t16.mjs            # Bug 3b + optimistic lock concurrencia (→ prod)
```

Duración: ~20-90 segundos por probe.

| Probe | Checks | Target | Setup requerido |
|---|---|---|---|
| `probe_modelo_chapa` | 28 | prod | ninguno — solo lectura |
| `probe_dividendos_inline` | 22 | localhost | T1 con resultado real (pos1=mandil2, etc.) |
| `probe_no_largo` | 16 | localhost | T1 sin resultado previo (DELETE resultado completo) |
| `probe_vacante_vac` | 6 | localhost | snapshot+restore automático vía `setupT1`/`teardownT1` |
| `smoke_t9_t16` | 3 | prod | ninguno (usa T6, independiente) |

**Orden recomendado para correr todos juntos**: `dividendos_inline → no_largo → vacante_vac → smoke_t9_t16 → modelo_chapa`. Corridos fuera de orden pueden fallar por state pollution, no por bugs reales (ver GOTCHAS #42).

#### `probe_modelo_chapa.mjs` — 28 checks (el más importante)

Verifica que el modelo mandil 1..N funciona correctamente end-to-end:

| Bloque | Qué verifica |
|--------|-------------|
| **T4** (8 starters, 0 borrados) | mf-cells = [1..8] sin huecos; no usa gateras raw [1,3,7,8,9,10,11,13] |
| **T1** (9 starters, 2 forfait) | mf-cells = [1..9]; marc-invalid para valor > rowCount |
| **T2 mapeo** | Ganador (Malenuchi Jack, gatera 5) aparece como mandil 2, no como 5 |
| **Dividendos** | Chip GAN = "2", chips SEG = ["2","1"] |
| **Save/reload** | Guardar con Aplicar → recargar → marcador idéntico, mapeo estable |

#### `probe_vacante_vac.mjs` — 6 checks

Verifica el flujo de vacante por "VAC" inline (feat/vacante-vac-inline). Vacante se marca escribiendo `VAC` en el mismo input del monto; dato solo informativo (no liquida).

| Check | Qué verifica |
|---|---|
| T01 | Panel editable presente |
| T02 | `VAC` en GAN → F10 → DB `vacante=true`, `div_orig=null` |
| T03 | número en GAN → F10 → DB `vacante=false`, `div_orig=número` |
| T04 | `VAC` en combinada X2 → F10 → DB `vacante=true`, `div_orig=null` |
| T05 | F8 con fila preexistente: `VAC` tipeado sin guardar → input sigue `VAC` |
| T06 | F8 con tipo sin fila en DB (SEG, create-path) → input sigue `VAC` |

**Patrón de los probes**: auth con magic link → navegación headless → assertions sobre DOM observable. Variables internas de `resultados.html` (`currentCarreraId`, `inscripciones`, etc.) son `let` de script y no están expuestas en `window.*` — todas las verificaciones son DOM-based.

## Variables de entorno / credenciales

Los scripts usan credenciales hardcodeadas para el entorno de desarrollo del cliente piloto (Hipódromo de Dolores). No subir a repositorios públicos sin reemplazarlas por env vars.

| Variable implícita | Descripción |
|--------------------|-------------|
| `DOLORES_EMAIL` | Email del usuario de prueba (`dolores@sgh.com`) |
| `SERVICE_KEY` | Supabase service role key (permite `auth.admin.generateLink`) |
| `ANON_KEY` | Supabase anon key |

## Advertencia

**Estos tests pegan directamente a la base de datos de producción.** Cada ejecución:
- Puede modificar `resultados` y `resultado_apuestas` para el turno de prueba.
- `smoke_full.mjs` restaura el dataset original al finalizar (20 filas hardcodeadas en `ORIGINAL_APUESTAS`).
- Genera magic links de autenticación reales.

No ejecutar en CI sin una base de datos de staging separada.
