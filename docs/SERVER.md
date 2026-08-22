# SERVER — entorno donde corre Claude Code

> Capturado 2026-06-08 en el propio server. Reemplaza cualquier referencia vieja a GitHub Codespaces.

## Dónde corre

Claude Code corre en un **VPS Hetzner Cloud** (host `ubuntu-8gb-fsn1-1`, datacenter `fsn1` =
Falkenstein, plan ~8 GB). El repo vive en **`/home/clio/dev/SGH`**.

## Acceso

Desde una **MacBook Air vieja** vía:
- **VS Code Remote-SSH** (editor sobre el VPS), y
- **Terminal nativa** por SSH.

El **copy de la terminal NO es confiable** → flujo de relevo: Claude Code escribe resultados a
archivos `.md` y los **pushea**; el asesor los lee de `raw.githubusercontent.com/mdqclio/SGH/...`.

## Qué corre acá

- **Claude Code** (CLI, modelo Opus 4.x).
- **Supabase MCP** con escritura (DDL/DML): `apply_migration`, `execute_sql`, etc. Autenticado
  con un PAT (`claude-code-mcp`) vía env del MCP. Proyecto `unlhcuanfrtpatoipwve`.
- **No** hay build/bundler: el frontend es HTML+JS vanilla servido por GitHub Pages desde `main`.

## Specs exactas (salida real, 2026-06-08)

```
$ uname -a
Linux ubuntu-8gb-fsn1-1 7.0.0-22-generic #22-Ubuntu SMP PREEMPT_DYNAMIC Mon May 25 15:54:34 UTC 2026 x86_64 GNU/Linux

$ lsb_release -a
Distributor ID:	Ubuntu
Description:	Ubuntu 26.04 LTS
Release:	26.04
Codename:	resolute

$ nproc
4

$ free -h
               total        used        free      shared  buff/cache   available
Mem:           7.6Gi       4.4Gi       388Mi       446Mi       3.6Gi       3.2Gi
Swap:             0B          0B          0B

$ df -h /
Filesystem      Size  Used Avail Use% Mounted on
/dev/sda1       150G   11G  134G   8% /

$ node -v
v22.22.1

$ npm -v
9.2.0
```

## Limitación de plataforma — sin browser

**Playwright/chromium NO corre en Ubuntu 26.04:**

```
$ npx playwright install chromium
Failed to install browsers
Error: ERROR: Playwright does not support chromium on ubuntu26.04-x64
```

Consecuencia: las verificaciones de flujos que dependerían del browser se hacen con un
**harness de código real** (extraer el cuerpo de la función + `AsyncFunction` + cliente Supabase
real + stubs de DOM; snapshot→run→assert→restore). Patrón documentado en `tests/README.md`;
ejemplo de referencia: `tests/probe_fase_c.mjs`.

## Credenciales en el server

- `.env` (gitignoreado) con `SUPABASE_SECRET_KEY` (`sb_secret_...`) para tests/harness server-side.
  **Nunca** se hardcodea ni entra a git; se lee de `process.env`.
- Frontend usa la **publishable key** (`sb_publishable_...`), pública, hardcodeada en los HTML.
- Legacy `eyJ...` (anon + service_role) **DESACTIVADAS** desde 2026-06-07 (401). Ver `docs/SECURITY.md`, `SECURITY_AUDIT.md` y `REMEDIACION_RESULTADO.md`.

## Swap lleno — procesos `chroma-mcp` acumulados (pendiente, 2026-08-22)

**Síntoma**: swap 4.0 GiB / 4.0 GiB (452 KiB libres) con memoria en 4.9/7.6 GiB. No es
crítico — hay 2.7 GiB disponibles — pero un swap saturado hace que el server se arrastre.

**Causa**: instancias de `chroma-mcp` (plugin `claude-mem`) que nunca se recolectan. Cada
sesión levanta una y queda viva; se contaron 12+ procesos python, el más viejo con 39 días
de uptime. Entre todos suman **~2.5 GiB de los 4 GiB de swap**. Las más gordas:

| PID | RSS | Uptime |
|---|---:|---|
| 2548759 | 582 MB | 2 d |
| 2374254 | 519 MB | 4 d |
| 1821244 | 380 MB | 11 d |
| 1610233 | 303 MB | 14 d |

Todas con el mismo `--data-dir /home/clio/.claude-mem/chroma`.

**Aparte**: proceso zombie PID 903123 (`node`, `Zs`), padre PID 902871 = `npm run start:prod`
con 23 días de uptime — el padre no está haciendo `wait()` sobre el hijo. Un solo zombie no
consume memoria; molesta si el patrón se repite.

**Pendiente**: matar las instancias viejas de `chroma-mcp` (dejar la de la sesión activa),
verificar si `claude-mem` tiene forma de reusar una sola instancia, y revisar el padre del
zombie. Revisar antes de tocar: matar el proceso equivocado corta el MCP de la sesión en curso.
