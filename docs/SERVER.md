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

### Chromium headless SÍ corre — para PDF/screenshots, sin sudo (2026-09-17)

`npx playwright install` falla por la **lista de distros soportadas**, no por el binario: en
`~/.cache/ms-playwright/chromium_headless_shell-1243/` ya hay un `chrome-headless-shell` (Chromium
153) y lo único que le falta son 8 libs del sistema (`libnspr4`, `libnss3`, `libatk`,
`libatk-bridge`, `libatspi`, `libXdamage`, `libasound2`, `libXRes`). Sin sudo, se bajan y se
extraen en un directorio de usuario:

```bash
mkdir -p ~/chromium-libs/debs && cd ~/chromium-libs/debs
apt-get download libnspr4 libnss3 libatk1.0-0t64 libatk-bridge2.0-0t64 libxdamage1 libasound2t64 libatspi2.0-0t64 libxres1
for d in *.deb; do dpkg -x "$d" ..; done
export LD_LIBRARY_PATH=$HOME/chromium-libs/usr/lib/x86_64-linux-gnu
ldd ~/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell | grep "not found"   # tiene que dar vacío
```

Y en Playwright, `chromium.launch({ executablePath: <ese binario> })` (el `playwright` del repo,
1.60, pide el build 1223 por defecto; con `executablePath` usa el 1243). Lo usa
`tests/render_programa_pdf.mjs` para imprimir el programa oficial a PDF + PNG y **mirarlo**.
Lo que sigue sin haber: `pdftoppm`/poppler (no se puede paginar un PDF a imágenes; por eso el
script saca tiras PNG del DOM en media print). El harness de código real sigue siendo el patrón
para los probes con asserts; el browser es para lo visual.

**Fuentes (17/09, tarde):** el VPS no tiene Arial ni Liberation; `fc-match Arial` daba DejaVu Sans,
~10% más ancha, y eso infla lo que "envuelve". Sin sudo:

```bash
mkdir -p ~/.local/share/fonts && cd /tmp && apt-get download fonts-liberation
dpkg -x fonts-liberation_*.deb /tmp/fl && cp /tmp/fl/usr/share/fonts/truetype/liberation/*.ttf ~/.local/share/fonts/
fc-cache -f && fc-match Arial      # → LiberationSans-Regular.ttf (métricas idénticas a Arial)
```

Hecho el 17/09. `tests/probe_carta_numero_turno.mjs` tiene un canario (C1) que falla si vuelve DejaVu.
Los renders del programa color de la mañana del 17/09 se hicieron con DejaVu: sus conteos de celdas
que envuelven son conservadores (en Arial envuelven menos).

**Ojo con `~/chromium-libs`:** el 17/09 a la mañana las libs quedaron extraídas en el scratchpad de la
sesión (`/tmp/claude-1000/.../scratchpad/libs`), no en `~/chromium-libs` como dice arriba, y ese
directorio se borra. A la tarde se copiaron a `~/chromium-libs/usr/...`; `ldd | grep "not found"` da vacío.

## Credenciales en el server

- `.env` (gitignoreado) con `SUPABASE_SECRET_KEY` (`sb_secret_...`) para tests/harness server-side.
  **Nunca** se hardcodea ni entra a git; se lee de `process.env`.
- Frontend usa la **publishable key** (`sb_publishable_...`), pública, hardcodeada en los HTML.
- Legacy `eyJ...` (anon + service_role) **DESACTIVADAS** desde 2026-06-07 (401). Ver `docs/SECURITY.md`, `SECURITY_AUDIT.md` y `REMEDIACION_RESULTADO.md`.

## Swap saturado por `chroma-mcp` acumulado — RESUELTO 2026-08-22

**Síntoma**: swap 4.0 GiB / 4.0 GiB (472 KiB libres) con memoria en 4.9/7.6 GiB.

**Resultado de la limpieza**: swap **4095 MB → 1338 MB usados, 2757 MB liberados**
(de 472 KiB libres a 2.7 GiB). Memoria de 4.9 a 3.7 GiB usados; disponible de 2.7 a
3.9 GiB. Se bajaron 38 procesos, todos con `TERM` — ninguno necesitó `KILL`.

### Causa raíz

Instancias de `chroma-mcp` del plugin `claude-mem` que no se recolectan al cerrar sesión.
Se acumularon **20 instancias**, la más vieja con 39 días de uptime, sumando ~2.5 GiB de swap.

### El criterio de limpieza es la ORFANDAD, no el uptime

**Filtrar por uptime es incorrecto y peligroso.** El `chroma-mcp` no lo levanta el proceso
`claude` de la sesión: lo levanta un **worker `bun` de claude-mem que es long-lived y se
comparte entre sesiones** — no reinicia cuando abrís una sesión nueva. Consecuencia: una
instancia con 2 días de uptime puede estar **en uso activo** por la sesión actual. En la
limpieza del 22/08 el criterio "matar todo lo que tenga más de 24 h" habría matado
justamente el par vivo (2 d 18 h) y cortado la captura de memoria en caliente.

El discriminante correcto es **`PPID = 1`**: el proceso quedó reparentado a init, o sea que
el cliente que lo levantó está muerto. Un MCP por stdio sin cliente vivo no sirve a nadie.

Verificación adicional recomendada antes de matar: **cruzar los inodos de pipe/socket**
(`/proc/<pid>/fd`) de los huérfanos contra los de los clientes `mcp-server.cjs` vivos. En el
server hay sesiones `claude` de 26, 25 y 12 días todavía activas; el cruce confirmó que
ningún huérfano compartía descriptor con un cliente vivo.

### Se cuentan PARES, no procesos sueltos

Cada instancia son **dos** procesos: el wrapper `uv tool uvx` y su hijo `python`. Lo que a
simple vista parecen 20 procesos son 40. La limpieza fue de **19 pares = 38 PIDs**; sobrevivió
1 par (wrapper 2548730 + python 2548759) más su worker padre `bun` (2548606).

### Esto se vuelve a acumular

Mientras `claude-mem` no recolecte al cerrar sesión, el problema **reaparece**: al ritmo
observado (20 instancias en ~40 días) en unas semanas el swap vuelve a estar igual. Opciones,
sin decidir todavía:

- **Cron de limpieza de huérfanos** — matar `chroma-mcp` con `PPID=1`, con el cruce de inodos
  como guarda. Es el criterio de arriba, automatizado.
- **Revisar la config del plugin** — ver si `claude-mem` permite reusar una sola instancia de
  chroma en vez de levantar una por worker, o si tiene hook de cleanup al cerrar sesión.

## Pendiente — proceso zombie 903123

PID 903123, `node`, estado `Zs`. Padre: PID 902871 = `npm run start:prod`, **23 días de
uptime**, que no hace `wait()` sobre el hijo.

**No pesa** — un zombie ocupa una entrada en la tabla de procesos, no memoria. No se tocó y no
hay apuro. Lo que conviene saber antes de reiniciar ese `start:prod` alguna vez: **qué está
sirviendo ese proceso de producción**. Está corriendo hace 23 días y todavía no se identificó
qué levanta; matarlo a ciegas puede cortar algo en uso. Averiguar eso primero, después decidir.
