# Tests — SGH

Scripts de smoke/integración/probe contra producción (GitHub Pages + Supabase).

## Prerequisitos

```bash
cd /home/clio/dev/SGH   # raíz del repo (VPS Hetzner; ver docs/SERVER.md)
npm install             # instala playwright y @supabase/supabase-js
```

Los scripts leen credenciales desde variables de entorno (ver "Variables de entorno"). En el
VPS, la clave server-side está en `.env` (gitignoreado) como `SUPABASE_SECRET_KEY`; sourcearlo:
`set -a; . ./.env; set +a` antes de correr.

## ⚠️ Browser NO disponible — patrón de harness de código real

**Playwright/chromium NO corre en Ubuntu 26.04** (`npx playwright install chromium` →
`"Playwright does not support chromium on ubuntu26.04-x64"`). Los flujos que dependerían del
browser se verifican con un **harness de código real**, NO con una reimplementación ni con un
`UPDATE` que simule el resultado:

1. Leer el HTML del módulo y **extraer el cuerpo** de la función a probar (balance de llaves).
2. Ejecutarlo vía `new AsyncFunction(...deps, body)` inyectando **dependencias reales**:
   cliente Supabase real (`@supabase/supabase-js` con `SUPABASE_SECRET_KEY`) + **stubs de DOM**
   (`document.getElementById`, `toast`, `confirm`, etc.).
3. **snapshot → run → assert → restore**: snapshotear las filas afectadas, correr el código,
   verificar lo que escribió en la DB, y restaurar el estado previo en el `finally`.

Así corre **el código REAL** del módulo (mismo texto que sirve prod), sin browser.
**Ejemplo de referencia: [`probe_fase_c.mjs`](probe_fase_c.mjs)** (estado_linea + retención
anti-doping) y [`probe_fase2_liquidaciones.mjs`](probe_fase2_liquidaciones.mjs) (reparto/bono).

**Limitación** (ver CLAUDE.md): las variables internas (`currentCarreraId`, etc.) son `let` de
módulo, no expuestas en `window.*`. Los asserts se basan en lo que el código persiste en la DB.

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

Scripts focalizados en comportamientos críticos. Seis probes activos:

```bash
node tests/probe_modelo_chapa.mjs        # Modelo mandil 1..N (→ prod)
node tests/probe_dividendos_inline.mjs   # Inputs de dividendos inline + E2E save (→ localhost)
node tests/probe_no_largo.mjs            # Botón "no corrió" + deducción automática (→ localhost)
node tests/probe_vacante_vac.mjs         # Vacante escribiendo "VAC" en el input + F8 no pisa VAC (→ localhost)
node tests/probe_fase2_liquidaciones.mjs # Liquidaciones C+D Fase 2: forma de líneas fondo/bono/incentivo (→ DB directa, sin browser)
node tests/probe_fase_c.mjs              # Fase C: estado_linea + retención anti-doping (real-code, → DB directa)
node tests/probe_incentivos_montas.mjs   # Incentivos Bloque C: jockey 50k/reunión dedup, entrenador 10k/caballo (real-code)
node tests/probe_recibos_emision.mjs     # Fase 4 v1: RPC emitir_recibo + buscador pagable (real-code, fixtures propias)
node tests/probe_cobros_v11.mjs          # Fase 4 v1.1: liberar_linea + búsqueda nombre/apellido/DNI + filtro carrera (real-code)
node tests/smoke_t9_t16.mjs              # Bug 3b + optimistic lock concurrencia (→ prod)
```
Los probes real-code de liquidaciones (`probe_fase_c`, `probe_incentivos_montas`, `probe_recibos_emision`, `probe_cobros_v11`) extraen el cuerpo real de la función / llaman las RPCs reales con `SUPABASE_SECRET_KEY` (de `.env`), snapshot→run→assert→restore. Sin browser (chromium no corre en ubuntu26.04).

Duración: ~20-90 segundos por probe.

| Probe | Checks | Target | Setup requerido |
|---|---|---|---|
| `probe_modelo_chapa` | 28 | prod | ninguno — solo lectura |
| `probe_dividendos_inline` | 22 | localhost | T1 con resultado real (pos1=mandil2, etc.) |
| `probe_no_largo` | 16 | localhost | T1 sin resultado previo (DELETE resultado completo) |
| `probe_vacante_vac` | 6 | localhost | snapshot+restore automático vía `setupT1`/`teardownT1` |
| `probe_fase2_liquidaciones` | 14 | DB directa (R5) | snapshot+restore de resultados/liquidaciones/roles; setup controlado de propietario/entrenador/jockey en ubicados |
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

#### `probe_fase2_liquidaciones.mjs` — 14 checks

NO usa browser (Playwright no instala chromium en ubuntu26.04): extrae el cuerpo real de `generarLiquidaciones()` del working tree y lo ejecuta vía `AsyncFunction` con cliente `service_role` + stubs de DOM. Snapshot+restore obligatorio de `resultados.estado`, liquidaciones/detalle preexistentes y los 6 campos de rol de las inscripciones ubicadas de R5. Solo valida la FORMA de las líneas; no aprueba ni paga.

| Bloque | Qué verifica |
|--------|-------------|
| A1-A3 | una sola liquidación `club`; líneas `fondo_solidario` con `beneficiario_tipo='club'` + `beneficiario_id=CLUB_ID` + descuento 0 |
| B1-B3 | cada ubicado 1-5 tiene línea `premio`(propietario) + `fondo_solidario`; fondo = 2% de premioEfectivo; propietario=70% y suma total=100% (98% roles + 2% fondo) |
| C1 | bono 6-8 → línea `bono` = monto, 100% propietario, neto |
| D1 | incentivos NO generados (monto 0 en `liquidacion_config`) |
| E1-E3 | `concepto_tipo`/`beneficiario_tipo` en ENUM; `reunion_id` seteado |
| R1-R3 | restore verificado: liquidaciones, estados de resultados y roles de inscripciones |

**Patrón de los probes**: auth con magic link → navegación headless → assertions sobre DOM observable. Variables internas de `resultados.html` (`currentCarreraId`, `inscripciones`, etc.) son `let` de script y no están expuestas en `window.*` — todas las verificaciones son DOM-based.

## Variables de entorno / credenciales

Los scripts leen las keys de Supabase desde **variables de entorno** (ya no están hardcodeadas).
Si falta alguna, el test aborta con un error claro (`requireEnv`). Exportalas antes de correr:

```bash
export SUPABASE_SERVICE_ROLE_KEY='...'   # service role (bypasea RLS — NUNCA commitear)
export SUPABASE_ANON_KEY='...'            # anon key (pública, usada por smoke_full / smoke_t9_t16)
node tests/smoke_full.mjs
```

| Variable de entorno | Descripción |
|---------------------|-------------|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (permite `auth.admin.generateLink`; **bypasea toda la RLS**) |
| `SUPABASE_ANON_KEY` | Supabase anon key (pública por diseño) |
| `DOLORES_EMAIL` | Email del usuario de prueba (`dolores@sgh.com`, sigue inline) |

> ⚠️ **No commitear nunca la service_role key.** Si se filtró en el historial, hay que rotarla en
> el dashboard de Supabase y purgar el historial — ver `docs/auditoria/SGH-REMEDIACION.md`.

## Advertencia

**Estos tests pegan directamente a la base de datos de producción.** Cada ejecución:
- Puede modificar `resultados` y `resultado_apuestas` para el turno de prueba.
- `smoke_full.mjs` restaura el dataset original al finalizar (20 filas hardcodeadas en `ORIGINAL_APUESTAS`).
- Genera magic links de autenticación reales.

No ejecutar en CI sin una base de datos de staging separada.
