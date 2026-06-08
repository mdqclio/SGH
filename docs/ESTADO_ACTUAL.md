# ESTADO ACTUAL — SGH (snapshot 2026-06-08)

> Snapshot de arranque para una sesión nueva. Verificado contra repo/DB/git el 2026-06-08.
> Lo no confirmado va marcado **(sin confirmar)**. Detalle por tema en los docs enlazados.

## Entorno / infra

- Claude Code corre en **VPS Hetzner** (`ubuntu-8gb-fsn1-1`, fsn1), Ubuntu **26.04 LTS** "resolute",
  4 vCPU, 7.6 GiB RAM, 150 G disco, node v22.22.1. Repo en **`/home/clio/dev/SGH`**.
  Acceso: VS Code Remote-SSH + Terminal nativa desde una MacBook Air. **Ya NO es Codespaces.**
- **Sin browser:** Playwright/chromium no corre en Ubuntu 26.04. Verificación de flujos = harness
  de código real (AsyncFunction + Supabase real + stubs DOM; snapshot→run→assert→restore).
- **Relevo por `.md`:** el copy de terminal no es confiable → CC escribe a `.md` y pushea; el
  asesor lee de `raw.githubusercontent.com`.
- Detalle: **`docs/SERVER.md`**.

## Seguridad (remediación 2026-06-07)

- Keys legacy (`eyJ...` anon + service_role) **DESHABILITADAS** en el dashboard (401
  "Legacy API keys are disabled"). Rotado a:
  - **publishable** (`sb_publishable_...`) — frontend, pública, en los HTML.
  - **secret** (`sb_secret_...`) — server-side, en `.env` del VPS (gitignore) como `SUPABASE_SECRET_KEY`. Nunca en git.
- JWT firmado con **HS256 revocado → ECC P-256**. **(sin confirmar in situ — documentado en la remediación.)**
- **PAT comprometido revocado**; PAT **`claude-code-mcp`** activo (lo usa el Supabase MCP).
- **FASE 3** (policies de catálogos permisivos) **diferida**.
- **leaked-password protection: PENDIENTE** (toggle manual en dashboard Supabase Auth — acción del dueño).
- Docs: `docs/SECURITY.md`, `SECURITY_AUDIT.md`, `REMEDIACION_RESULTADO.md`.

## Liquidaciones

- **Modelo CERRADO:** `docs/LIQUIDACIONES_MODELO.md` (secciones 1-9 confirmadas con Leo).
- **Gap analysis:** `LIQUIDACIONES_GAP_ANALYSIS.md` **en rama `docs/liquidaciones-gap-analysis`,
  NO mergeada a main** (sin confirmar en main).
- **Implementado en main:** §1 reparto por % rol (config), §2 fondo solidario, §3 bonos
  (250k ganador + piso + bono 6-8 100% propietario), §4 incentivos Bloque C, §5 descuentos,
  §6 retención impositiva (nullable, sin lógica) → 6/9. **Con Fase C se suma §8 → 7/9.**
- **Fase C EN MAIN** (merge `7e638c7`, deploy verificado): `generarLiquidaciones` setea
  `estado_linea` por línea de `liquidacion_detalle`:
  - premio **1°/2°** → `retenido` + `fecha_liberacion = reuniones.fecha + dias_antidoping` (default 30).
  - **NOTA-A:** sub-líneas `actuacion` (peón/capataz/sereno) de esos 1°/2° **acompañan** la retención (heredan `retenido` + misma fecha).
  - **NOTA-B:** reunión sin `fecha` → `retenido` + `console.warn` (sin fecha).
  - resto (premio 3-5, bono, fondo, incentivos) → `impago`.
  - guard de regeneración a nivel línea: aborta si hay `estado_linea='pagado'` o `recibo_id` (no pisa deuda cobrada).
  - UI: badge de estado por línea en `verDetalle` (`estadoLineaBadge`).
  - **Verificada real-code:** `tests/probe_fase_c.mjs`, **11/11** sobre reunión `b02ca761` (fecha 2026-06-20 → libera 2026-07-20). Ver `docs/RESULTADO_FASE_C.md`, `docs/PLAN_FASE_C.md`.
- **Faltan (modelo):** §7 recibo por persona on-demand cruzando reuniones (alto riesgo), §9 resumen de reunión.

### Bloqueante de datos (Fase A)

- `inscripciones.propietario_id` = **10/95** (85 NULL); `spc_propietarios` = **0 filas**.
  Sin dueño no se liquida propietario ni bono 6-8 (**GOTCHA #47**). Backfill bloqueado por dato/Fede.
- DB hoy: `liquidacion_detalle` 45 filas, **3 en `retenido`** (remanentes en R5 de la verificación
  vía UPDATE previa a Fase C — **NO** producto de una regeneración real; ver "Pendiente operativo").
- `recibos` = 0 filas (tabla Fase 0 sin usar todavía).

### Fases siguientes (orden sugerido)

A (backfill propietarios, 🟢 bloqueada por datos/Fede) → B (oficializar reunión, 🔴 toca flujo) →
**C ✅ HECHA** → D (recibos por persona, 🔴 alto riesgo) → E (resumen reunión, 🟢) → F (validar R5, 🟢).

### Pendiente de Fede (producto)

- Mapping **SPC→propietario** (desbloquea Fase A).
- Montos de **incentivo jockey/entrenador** (Bloque C; hoy 0 → no se generan).
- **Regla de liberación anti-doping**: ¿automática a 30 días, o gated por el resultado del control? **(sin confirmar)** — hoy implementado como automática a `dias_antidoping`.

## Ratificación

- **E1 caballeriza-obligatoria NEUTRALIZADA** en commit `7af005c` (hard-block removido en 3 sitios
  de `ratificacion.html`). Reactivar tras backfill SPC→caballeriza con `git revert 7af005c`.
  Gate de **jockey** sigue activo.

## Pendiente operativo (decide el dueño)

- Las **liquidaciones ya generadas en prod siguen en `impago`** hasta regenerarlas. **No regenerar por cuenta propia.**
- R5 tiene **3 líneas en `retenido`** dejadas por la verificación UPDATE previa a Fase C. Si querés,
  las vuelvo a `impago` (es un UPDATE puntual, no una regeneración) — **avisá**.

## Git

- `main` = `7e638c7` (Fase C mergeada y desplegada en GitHub Pages).
- Ramas vivas sin mergear: `docs/liquidaciones-gap-analysis`, `feat/liquidaciones-fase-c`,
  `chore/cleanup-backups`, `chore/docs-sync-2026-06-08` (esta), + varias `feat/*` viejas.
