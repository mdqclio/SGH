# Índice de `docs/`

Dos clases de documento. **Vivo** = se mantiene, se puede confiar. **Foto** = era cierto el día que se
escribió y no se actualiza (GOTCHA #98). Si una foto contradice a un vivo, gana el vivo.

## Vivos

| Doc | Para qué |
|---|---|
| `../CLAUDE.md` | Fuente de verdad del estado vigente: stack, guards, gotchas críticos, § Otros módulos |
| `../CHANGELOG.md` | Qué cambió y cuándo. Junto con CLAUDE.md, el estado real del sistema |
| `GOTCHAS.md` | Trampas confirmadas. Leer antes de escribir código |
| `ISSUES.md` | Bugs abiertos y deuda técnica, numerados (ISSUE-0xx) |
| `DECISIONES.md` | ADRs. Ojo: **ADR-007 está superado** — la key legacy `eyJ` está desactivada desde el 2026-06-07 |
| `../SCHEMA.md` / `SCHEMA.md` | Schema de la base (el de `docs/` tiene más detalle) |
| `ARQUITECTURA.md` | Convenciones, colores, flujo de auth, accesos |
| `CONTEXTO.md` | Negocio, usuarios y protocolo de trabajo (ramas, PR, `apply_migration`) |
| `MODULOS.md` | Detalle por módulo + reglas de negocio |
| `MODELO_NUMERACION.md` | Gatera / mandil / chapa — modelo confirmado con Fede |
| `SNIPPETS.md` | SQL y JS reutilizables |
| `SERVER.md` | VPS Hetzner: límites de plataforma, Chromium headless, libs |
| `SECURITY.md` | Postura de seguridad, RLS, RPCs |

## Fotos

**Todo lo demás en `docs/` es foto**, incluidos `ESTADO.md`, `LIQUIDACIONES_GAP_ANALYSIS.md` y todos los
`PLAN_*`, `GATE_*`, `TANDA_*`, `SESION_*`, `FIX_*`, `RESULTADO_*`, `AUDIT*`, `DIAG*`, `COTEJO_*`, `R6_*`,
`R8_*`, `SEC_RLS_*`: historial y evidencia de por qué algo se hizo así, **no** referencia de cómo está el
sistema hoy — los guards y conteos que traen adentro son de su fecha. `docs/diagnosticos/` es histórico
completo (un informe por sesión, fechado, inmutable): no se lista acá ni se mantiene, y vive en la rama
`reports` —que nunca se mergea—, así que en `main` se ven pocos.

## Orden de lectura para alguien que llega

1. `../CLAUDE.md` entero — stack, modelo de datos, glosario, gotchas, workflow, protocolo de informes.
2. `CONTEXTO.md` — quién usa esto y cómo se trabaja.
3. `GOTCHAS.md` + `ISSUES.md` — lo que muerde y lo que está roto.
4. `../SCHEMA.md` y `MODULOS.md` — recién acá, el detalle técnico.
5. `../CHANGELOG.md` de las últimas semanas — qué se movió hace poco.
6. `../tests/README.md` (vivo) — cómo se escribe un probe, antes de escribir el primero.
