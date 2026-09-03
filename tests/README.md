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
node tests/probe_cobros_caballeriza.mjs  # Pagos: búsqueda por caballeriza → propietario titular (real-code, read-only)
node tests/probe_recibo_rol.mjs         # Pagos: rótulo del rol en el recibo, propietario vs entrenador/jockey (real-code, read-only)
node tests/probe_pedigree_programa.mjs   # Columna PADRE-MADRE en los 3 programas: vacío sin placeholder, separador no colgado (real-code, 9998 + teardown)
node tests/probe_apuestas_especiales.mjs # Caja de especiales de la tapa derivada de carrera_apuestas (real-code, sólo lectura)
node tests/probe_carta_selector_reunion.mjs # Carta de llamados: selector de reunión + default activa/próxima + ActiveReunion intacta (real-code, sólo lectura, --mutantes)
node tests/probe_cuerpos_oficial.mjs     # Ventaja de llegada en la vista oficial: cotejo de R6 contra la planilla (real-code, sólo lectura)
node tests/probe_reordenar_turnos.mjs    # RPC reordenar_turnos: permutación + 4 validaciones (→ R9, snapshot→restore)
node tests/probe_orden_ui.mjs            # Lógica ▲▼ de carta-llamados: payload a la RPC y confirmación (real-code, sin DB)
node tests/probe_alineado_programa.mjs   # Ancho de columnas del programa vs R6 (cota sin browser, sólo lectura)
node tests/probe_badge_overlap.mjs       # Badge del bono en flujo, no puede tapar texto (estructural, sin DB)
node tests/smoke_t9_t16.mjs              # Bug 3b + optimistic lock concurrencia (→ prod)
```

#### Probes de browser — pendientes de una máquina con chromium

Es el único probe del repo que **no corre en el VPS**: cuenta con layout real cuántas filas
del programa ocupan más de una línea, que es el criterio de aceptación del alineado. Chromium
no está soportado en Ubuntu 26.04 (ver arriba y `docs/SERVER.md`), así que queda escrito para
correrlo desde una máquina con browser. Mientras tanto la cota es `probe_alineado_programa.mjs`,
que compara anchos de celda contra R6 sin renderizar.

```bash
npx playwright install chromium          # una sola vez, donde esté soportado
export SGH_EMAIL=dolores@sgh.com
export SGH_PASSWORD=...                  # nunca commitear la password
node tests/probe_alineado_browser.mjs [reunion_id] [--color|--bn] [--url <base>]
```

Sale 0 si no hay filas envueltas, 1 si hay alguna, 2 si no pudo medir (sin credenciales, sin
playwright, o chromium que no arranca). Necesita sesión: las páginas del programa leen por RLS
y sin login Supabase devuelve 0 carreras — el conteo daría 0 por vacío, no por estar bien.

```bash
node tests/probe_badge_overlap_browser.mjs [reunion_id] [--url <base>] [--pdf]
```

Chequeo geométrico del badge del bono: que su rect no intersecte el rect de ningún nodo de
texto. Mide a 390 / 375 / 768 / 1280 px y en `media: print`, porque el bug aparecía en el
visor de iOS y no en desktop — a un solo ancho no se detecta. Con `--pdf` además emite el
PDF a `/tmp`. Mismos códigos de salida. La contraparte estructural que sí corre en el VPS es
`probe_badge_overlap.mjs`.
### `probe_solicitar_cuenta_existente.mjs` — A DEMANDA, no en la rutina

Cubre el corte de "ese correo ya está registrado" de `solicitar-acceso.html` (ISSUE-069, GOTCHA #89):
32 asserts + 8 mutantes. Extrae del HTML el bloque real que va de los helpers de UI al final del
"camino 2" y lo corre sobre un mini-DOM que **parsea los ids del archivo** — pedir un id que no
existe revienta el probe, así que renombrar `#sec-existe` rompe el test en vez de pasar inadvertido.

Dos cosas que lo hacen distinto del resto:

- **Baja el bundle de supabase-js que carga la página** —la URL la lee del `<script>` del HTML, no
  está escrita en el test— en vez de usar el de `node_modules`. La señal (`user.identities`) depende
  de la versión del SDK: con la 2.106.1 local, el probe daría verde sobre un fix muerto (GOTCHA #89).
- **Se corre a demanda**: cuando se toca auth, el signup o esa página. Cada corrida hace dos altas
  reales, o sea **dos mails que rebotan** en Resend, y los rebotes duros degradan la reputación del
  dominio que tiene que estar sano el día que se publique el link de registro. La tanda de mutantes
  hace **una** captura contra GoTrue y los 8 hijos la reusan (`RESP_CACHE`).

Escribe en `auth.users`: 3 cuentas `probe-<caso>-<run>@sgh-probe.invalid`, borradas en el `finally`.
El teardown se verifica **por estado** (listar y ver que no quedó ninguna + total igual al de antes),
no por la lista de ids: en el caso obfuscado GoTrue devuelve un id que no existe.

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

## Restore: verificar por ESTADO, no contando filas

`tests/lib/estado_lineas.mjs` es el helper compartido para esto. Existe porque el 2026-08-28 un
restore se dio por bueno contando filas —76 líneas en el sandbox, 0 recibos de prueba, 0
huérfanas, todo verde— mientras 9 de esas líneas quedaban en `estado_linea='pagado'` colgadas de un
recibo de otro club. Las filas estaban; el estado no.

```javascript
import { snapshotLineas, diffLineas, restaurarLineas, describir, recibosDesde } from './lib/estado_lineas.mjs';

const T0 = new Date(Date.now() - 1000).toISOString();
const antes = await snapshotLineas(sb, REUNION);
try {
  // … el probe hace lo suyo …
} finally {
  // … borrar las fixtures propias …
  const arregladas = await restaurarLineas(sb, antes, await snapshotLineas(sb, REUNION));
  const verif = diffLineas(antes, await snapshotLineas(sb, REUNION));
  ok('restore por ESTADO', verif.limpio, describir(verif));
  ok('no se pisó nada ajeno', arregladas === 0, `${arregladas} línea(s) restauradas`);
  const sobra = (await recibosDesde(sb, T0)).filter(r => !misRecibos.includes(r.id));
  ok('sin recibos colgados en NINGÚN club', sobra.length === 0);
}
```

Los dos primeros asserts son distintos a propósito: uno dice si quedó bien, el otro si el probe
pisó algo que no era suyo. Haber podido arreglarlo no lo vuelve aceptable.

`recibosDesde()` **no filtra por club** a propósito: el recibo fantasma del 2026-08-28 sobrevivió
porque la foto de recibos del probe hacía `.eq('club_id', CLUB_ID)` y el recibo había salido con el
`club_id` de Mi Club Hípico. Ver GOTCHA #76 / ISSUE-059.

`monto_neto` y `total_neto` no van en el snapshot: son columnas GENERATED (GOTCHA #9).
