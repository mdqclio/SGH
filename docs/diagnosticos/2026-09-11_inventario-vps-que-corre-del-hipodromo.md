# Inventario del VPS — qué corre acá del hipódromo, y qué pasa si desaparece

**Fecha:** 2026-09-11 (noche) · **`main`:** `4f6ff13` · **Host:** `ubuntu-8gb-fsn1-1` (Hetzner fsn1), uptime 60 días, usuario `clio` · **Solo lectura**: `ps`, `ss`, `crontab`, `systemctl`, `docker`, `git`, `ls`. Sin `sudo` (pide password → lo que es de root queda marcado **sin verificar**).

Nota de sesión: apareció otra vez el bloque `## Exited Plan Mode` — attachment del CLI, ignorado.

## 0. Guards

| guard | esperado | real |
|---|---|---|
| `pwd` | `/home/clio/dev/SGH` | ✅ |
| `spcs` | 203 | ✅ (no consultado esta vez — no hubo escritura) |
| ref | `unlhcuanfrtpatoipwve` | ✅ |

---

## 1. Veredicto — la pregunta 5 primero

### Si el VPS desaparece mañana

| | qué deja de funcionar | por qué |
|---|---|---|
| **Para el hipódromo (Yesi, Fede, el portal, Diego)** | **NADA.** | El sistema entero vive afuera: el frontend en GitHub Pages (`sigh.com.ar`, rama `main`), la base y la auth en Supabase, la Edge Function `reunion-json` en Supabase (v22, con sus secrets `STUDBOOK_API_TOKEN` / `STUDBOOK_DB_KEY` en el env de la función, **no acá**), el mail de invitaciones en Resend vía Supabase. En el VPS **no hay ningún proceso, cron, timer, contenedor ni puerto** que sea de SGH. El sitio, la carga de Yesi, la ratificación del lunes, la carrera del domingo y el JSON para el Stud Book siguen igual. |
| **Para vos como desarrollador** | el entorno de trabajo | Claude Code + MCP de Supabase (autenticado con el PAT `claude-code-mcp` en `~/.claude.json`), la memoria de sesiones (`~/.claude/projects/-home-clio-dev-SGH/`, 85 sesiones, 65 MB) y `claude-mem` (544 MB), `.env` con la `sb_secret` (recuperable del dashboard), `gh` y la clave SSH de deploy, `node_modules` para correr probes/scrapers, y **git local con 27 ramas sin upstream (todas ya contenidas en `origin/main`) + 25 ramas `[gone]` con commits que no están en ningún remoto** — la mayoría fotos viejas o PII sacada de `main` a propósito (§4). |

**Lo único del hipódromo que sólo existe acá es historia de trabajo, no operación.** Y parte de esa historia son archivos con DNI que se borraron de GitHub en el scrub del 20/08 y siguen vivos en ramas locales y en `tmp/` — es un pasivo, no un activo (§4.3).

---

## 2. Pregunta 1 — procesos y programados

### Cron (usuario `clio`)
```
5 0,4,8,12,16,20 * * *  cd /home/clio/dev/trading-bot && … node src/index.js --strategy=merino
30 22 * * 1-5            cd /home/clio/dev/trading-bot && … node src/index.js --strategy=cava
0 23 * * *               cd /home/clio/dev/trading-bot && … node src/jobs/resultados.js
*/5 * * * *              /home/clio/dev/cambios/scripts/watchdog.sh
```
**Cero entradas de SGH.** Son `trading-bot` y `cambios` (otros proyectos del mismo VPS). Crontab de root: **sin verificar** (sin sudo). `/etc/cron.d`: sólo `e2scrub_all` (sistema). `at`: vacío.

### systemd
Timers: 18, **todos del sistema** (sysstat, logrotate, apt, fstrim, man-db, snapd…). Servicios no-base activos: `docker`, `containerd`, `code-server@clio`, `atd`. **Nada de SGH.**

### Docker (5 contenedores, 0 de SGH)
```
n8n                 n8n-afip:2.23.4               127.0.0.1:5678->5678   /home/clio/n8n
evolution_api       atendai/evolution-api:v2.1.1  127.0.0.1:8081->8080   /home/clio/evolution
evolution_postgres  postgres:16-alpine            (interno)               /home/clio/evolution
evolution_redis     redis:7-alpine                (interno)               /home/clio/evolution
estetica-pg         postgres:16-alpine            127.0.0.1:5432->5432   (sin compose)
```
Otros proyectos (`n8n`, WhatsApp/Evolution, `estetica`). `pm2`/`forever`/`supervisord`: no instalados.

### Procesos de larga vida (>1 h) que no son del sistema
- 4 grupos de **sesiones de Claude Code** abiertas (46, 45, 32 y 20 días) con sus MCP: `n8n-mcp`, `firebase … --dir sistema-de-reservas`, `claude-mem mcp-server`, **`mcp-server-supabase --project-ref=unlhcuanfrtpatoipwve`** (esta sesión). Son clientes, no servidores.
- 2 `chroma-mcp` (claude-mem; el par vivo, GOTCHA de SERVER.md).
- `node /usr/local/bin/n8n` (5,7 días).
- `python3 sink.py` (44 días, escucha en 127.0.0.1:8899) — **no identificado**, no es de SGH (no hay `sink.py` en `dev/SGH`).
- **`npm run start:prod` → `node dist/main` como root** (44 días; el zombie 903123 de SERVER.md sigue). `cwd` de root, no legible sin sudo. Ningún `package.json` en `~/dev/*` tiene `start:prod` → **no es SGH** (SGH no tiene build ni servidor). Qué es: **sin verificar**.

---

## 3. Pregunta 2 — puertos

`ss -ltnp`:

| puerto | bind | proceso | de afuera |
|---|---|---|---|
| **22** | `0.0.0.0` / `[::]` | sshd | **sí — el único** |
| 8080 | 127.0.0.1 | `code-server` (auth: password) | no |
| 8081 | 127.0.0.1 | evolution_api (docker) | no |
| 5678 | 127.0.0.1 | n8n (docker) | no |
| 5432 | 127.0.0.1 | estetica-pg (docker) | no |
| 8899 | 127.0.0.1 | `python3 sink.py` | no |
| 37700 | 127.0.0.1 | `bun` (worker de claude-mem) | no |
| 33367 | 127.0.0.1 | sin proceso visible (**sin verificar**, probablemente docker-proxy de root) | no |
| 53 | 127.0.0.53 / .54 | systemd-resolved | no |

**Nada de SGH escucha en ningún puerto, y nada salvo SSH recibe tráfico de afuera.** Firewall (`ufw`/`iptables`): **sin verificar** (root). El JSON del Stud Book lo sirve Supabase, no el VPS (`docs/diagnosticos/2026-09-10_ips-fijas-consulta-studbook.md`: el tema de las IP fijas es de salida hacia el Stud Book, no de entrada).

---

## 4. Pregunta 3 — lo que sólo está acá

### 4.1 Credenciales y config (recuperables, pero hay que rehacerlas)

| qué | dónde | ¿recuperable? |
|---|---|---|
| `SUPABASE_SECRET_KEY` (`sb_secret_…`) | `dev/SGH/.env` — **única variable** del archivo | sí: dashboard Supabase → API keys. O rotarla. |
| PAT `claude-code-mcp` del MCP de Supabase | `~/.claude.json` (`mcpServers.supabase`) | sí: dashboard → Access Tokens (crear otro; el viejo conviene revocarlo) |
| OAuth de Claude | `~/.claude/.credentials.json` | sí: login |
| `gh` (cuenta `mdqclio`, protocolo ssh) | `~/.config/gh/hosts.yml` | sí: `gh auth login` |
| clave SSH `id_ed25519` (push a GitHub) | `~/.ssh/` | sí: generar otra y cargarla en GitHub. **La actual queda huérfana en GitHub si el VPS muere — revocarla.** |
| `supabase/.temp/linked-project.json` | CLI link | trivial |
| `code-server` password | `~/.config/code-server/config.yaml` | trivial |
| **NO hay**: `STUDBOOK_API_TOKEN`, `STUDBOOK_DB_KEY`, Resend API key, service_role | — | viven en Supabase (secrets de la función / SMTP config). Por eso hoy no pude hacer el smoke 200 de v22 desde acá. |

### 4.2 Estado de trabajo (no recuperable, pero no operativo)

| qué | tamaño | qué se pierde |
|---|---|---|
| sesiones de Claude Code de SGH | 85 archivos, 65 MB | el transcript de cada sesión (lo que el protocolo de informes ya vuelca a `reports` — lo esencial está en GitHub) |
| `claude-mem` (`~/.claude-mem`, chroma + sqlite) | 544 MB | la memoria cross-sesión (las "observaciones"); útil, no crítica |
| `node_modules` de SGH | 53 MB | `npm i` |
| `tools/_out/`, `tmp/`, `supabase/functions/reunion-json/_build/r6_build.json` | 268 K + 108 K + — | salidas de scrapers/dry-runs (regenerables) — **pero `tmp/` tiene PII, ver 4.3** |
| **stash** `stash@{0}` (`fix/spcs-r8-tanda-4b`) | 1 archivo | un `data/spcs_snapshot.json` viejo (3.927 líneas). Descartable. |

### 4.3 Git local: ramas sin upstream y ramas `[gone]`

- **27 ramas locales sin upstream** — verificado: **0 commits fuera de `origin/main`** en todas (`git rev-list --count origin/main..rama` = 0). Son ramas ya mergeadas cuyo remoto se borró. No se pierde nada.
- **25 ramas `[gone]`** (remoto borrado) **con commits que no están en ningún remoto**. Cotejadas por **contenido** (blob por blob contra `origin/main` y `origin/reports`), no por hash — porque squash-merge o mover el informe a `reports` deja el hash huérfano con el contenido a salvo:

| rama | commits fuera | archivos cuyo contenido **no está** en main ni reports |
|---|---|---|
| `chore/propietarios-provisorios-r8` (+ `bkp/…`) | 33 | 9: `data/sb_propietarios_r8_{entrada,evidencia}.json`, `docs/r8_caballerizas_{propietarios_sugeridos,sin_propietario}.csv`, `tests/diag_caballerizas_homonimas.mjs`, `tests/verificacion_previa_r8.mjs`, `tools/sb_propietarios_caballerizas.py`, + versiones viejas de `.gitignore` y `R8_CABALLERIZAS_HOMONIMAS.md` |
| `chore/reunion-prueba-9998` (+ `bkp/…`) | 9 | 8 (los mismos de arriba) |
| `fix/dni-jockeys` | 5 | 5: `docs/DNI_{CUIDADORES,JOCKEYS}_PADRON.md`, `migrations/dni_{cuidadores,jockeys}_padron_yesi.sql`, CHANGELOG viejo |
| `fix/dni-cuidadores` | 3 | 3 (subconjunto) |
| `diag/cotejo-resultados-r6` (+ `bkp/…`) | 1 | `tests/diag_cotejo_r6.mjs` + COTEJO_R6 viejo |
| `chore/verif-r6` | 1 | `tmp/verif_oficializacion_r6.md` |
| otras 12 (`tmp/*`, `diag/*`, `feat/*-20j`, `chore/cleanup-backups`…) | 1–5 | 0 o 1, y ese 1 es una **versión anterior** de un `.md` que hoy está en `main` |

**Estos archivos no son un activo perdido: son el PII que se sacó de GitHub a propósito.** `docs/AUDITORIA_PII_2026-08-20.md:54-57` lista exactamente `DNI_CUIDADORES_PADRON.md`, `DNI_JOCKEYS_PADRON.md`, `dni_cuidadores_padron_yesi.sql`, `dni_jockeys_padron_yesi.sql` como archivos con DNI (23 + 34 + 23 + 36 documentos), y `SCRUB_PII_APLICADO.md` §4 saca `tmp/` del índice. El scrub limpió `main`; **los blobs siguen en `.git` local** (en esas ramas) y **`tmp/` sigue en disco** con `R8 propietarios para Yesi.csv`, `R8 propietarios certeza ALTA.csv`, `R8 propietarios detalle por ejemplar.csv`, `R8 caballerizas sin propietario.csv`. Si el VPS desaparece, eso desaparece con él — que es lo que se quería. Si el VPS se **filtra**, eso se filtra. (**Sin verificar** el contenido de cada CSV; lo digo por los nombres y por la auditoría del 20/08.)

### 4.4 Lo que NO está acá (y a veces se cree que sí)
- El código: 100 % en GitHub (`main` = `origin/main`, 0 commits locales sin pushear en `main`; `reports` idem).
- Los datos: 100 % en Supabase. No hay dump ni backup local de la base (**y tampoco hay backup fuera de Supabase** — eso es un tema de Supabase, no del VPS; el plan free no tiene PITR: **sin verificar** el plan actual).
- Los secrets de producción: en Supabase.

---

## 5. Pregunta 4 — lo que corre acá por decisión, no por necesidad

Nada corre *solo*. Lo que se corre a mano desde acá, y podría correrse desde cualquier máquina con `node`, `git`, el `sb_secret` y el PAT:

| qué | cómo | dependencia real del VPS |
|---|---|---|
| **Probes** (`tests/*.mjs`, 81 archivos) | `set -a; . ./.env; set +a; node tests/…` | ninguna: `node` 22 + `.env`. Chromium no corre en este Ubuntu — eso es un **límite** del VPS, no una ventaja |
| **Scrapers del Stud Book** (`tools/studbook_scrape_tanda.mjs`, `studbook_probe_terms.mjs`, `sb_*.py`) | `node`/`python3` + salida a `data/` | ninguna. Ojo: el Stud Book puede filtrar por IP (`2026-09-10_ips-fijas…`); si mañana consultás desde otra IP, **sin verificar** que te deje |
| **Build + deploy de `reunion-json`** (`_build/build.mjs` → `slim.mjs` → `deploy_edge_function` por MCP) | node + MCP | ninguna: hoy se hizo desde acá con el MCP; es el MCP el que deploya, no el VPS |
| **Migraciones** (`apply_migration`) | MCP | ninguna |
| **Push a GitHub Pages** | `git push` | ninguna: cualquier clon con la SSH key |
| `code-server` en :8080 | VS Code en el browser | comodidad de edición remota; nada del hipódromo |
| `claude-mem` + sesiones | memoria del asistente | comodidad tuya |

Lo que **sí** es una elección que ata al VPS: **el `.env` y el PAT están en este disco y en ningún otro lado**. Bastaría un vault/password manager (o el dashboard de Supabase, que ya los tiene como fuente) para que "otro VPS mañana" sea `git clone` + `npm i` + dos secrets.

---

## 6. Recomendaciones (no ejecutadas, son tuyas)

1. **Tratar las 25 ramas `[gone]` + `tmp/` como residuo de PII**: `git branch -D` de las que tienen los padrones de DNI y los CSV de propietarios, `rm` de `tmp/*.csv`, y `git gc --prune=now`. Es lo que la auditoría del 20/08 dejó pendiente para "los clones" (línea 267). Antes, si querés conservar `tests/diag_caballerizas_homonimas.mjs` / `verificacion_previa_r8.mjs` / `tools/sb_propietarios_caballerizas.py` (código sin PII), rescatarlos a una rama y pushearla.
2. **Borrar las 27 ramas locales sin upstream** — 0 commits únicos, ruido puro.
3. **Revocar la SSH key del VPS en GitHub y el PAT del MCP en Supabase el día que el VPS se apague**, no antes.
4. **Identificar `npm run start:prod` (root) y `sink.py`** — no son de SGH, pero corren como root / hace 44 días y nadie sabe qué sirven (SERVER.md ya lo anotó).
5. Dos secrets (`sb_secret`, PAT) en un lugar que no sea sólo este disco.

---

## 7. Salidas crudas

### 7.1 cron / systemd / docker / procesos
```
=== host
ubuntu-8gb-fsn1-1
 22:47:03 up 60 days, 21:02,  7 users,  load average: 0.95, 0.36, 0.20
clio

=== crontab (user)
# Edit this file to introduce tasks to be run by cron.
# 
# Each task to run has to be defined through a single line
# indicating with different fields when the task will be run
# and what command to run for the task
# 
# To define the time you can provide concrete values for
# minute (m), hour (h), day of month (dom), month (mon),
# and day of week (dow) or use '*' in these fields (for 'any').
# 
# Notice that tasks will be started based on the cron's system
	# daemon's notion of time and timezones.
# 
# Output of the crontab jobs (including errors) is sent through
# email to the user the crontab file belongs to (unless redirected).
# 
# For example, you can run a backup of all your user accounts
# at 5 a.m every week with:
# 0 5 * * 1 tar -zcf /var/backups/home.tgz /home/
5 0,4,8,12,16,20 * * * cd /home/clio/dev/trading-bot && set -a && . ./.env && set +a && node src/index.js --strategy=merino >> logs/merino.log 2>&1
30 22 * * 1-5 cd /home/clio/dev/trading-bot && set -a && . ./.env && set +a && node src/index.js --strategy=cava >> logs/cava.log 2>&1
# 
# For more information see the manual pages of crontab(5) and cron(8)
# 
# m h  dom mon dow   command
0 23 * * * cd /home/clio/dev/trading-bot && set -a && . ./.env && set +a && node src/jobs/resultados.js >> logs/resultados.log 2>&1
# watchdog externo del stack Cambios (healthchecks.io) — docs/integraciones.md §9
*/5 * * * * /home/clio/dev/cambios/scripts/watchdog.sh

=== crontab (root, si se puede)
sudo: interactive authentication is required

=== /etc/cron.d + cron.{hourly,daily,weekly}
total 16
drwxr-xr-x   2 root root 4096 Apr 20 18:22 .
drwxr-xr-x 112 root root 4096 Sep 11 06:53 ..
-rw-r--r--   1 root root  102 Nov  5  2025 .placeholder
-rw-r--r--   1 root root  188 Feb 13  2026 e2scrub_all
/etc/cron.daily: apport apt-compat dpkg logrotate man-db  /etc/cron.hourly:  /etc/cron.weekly: man-db 

=== systemd timers
NEXT                            LEFT LAST                              PASSED UNIT                           ACTIVATES
Fri 2026-09-11 22:50:00 UTC 2min 56s Fri 2026-09-11 22:40:01 UTC     7min ago sysstat-collect.timer          sysstat-collect.service
Sat 2026-09-12 00:00:00 UTC 1h 12min Fri 2026-09-11 00:00:01 UTC      22h ago dpkg-db-backup.timer           dpkg-db-backup.service
Sat 2026-09-12 00:00:00 UTC 1h 12min Fri 2026-09-11 00:00:01 UTC      22h ago sysstat-rotate.timer           sysstat-rotate.service
Sat 2026-09-12 00:07:00 UTC 1h 19min Fri 2026-09-11 00:07:29 UTC      22h ago sysstat-summary.timer          sysstat-summary.service
Sat 2026-09-12 00:31:37 UTC 1h 44min Fri 2026-09-11 00:55:40 UTC      21h ago logrotate.timer                logrotate.service
Sat 2026-09-12 02:01:53 UTC 3h 14min Fri 2026-09-11 02:01:53 UTC      20h ago update-notifier-download.timer update-notifier-download.service
Sat 2026-09-12 02:12:49 UTC 3h 25min Fri 2026-09-11 02:12:49 UTC      20h ago systemd-tmpfiles-clean.timer   systemd-tmpfiles-clean.service
Sat 2026-09-12 04:39:17 UTC 5h 52min Fri 2026-09-11 19:19:56 UTC 3h 27min ago motd-news.timer                motd-news.service
Sat 2026-09-12 06:07:54 UTC       7h Fri 2026-09-11 06:53:09 UTC      15h ago apt-daily-upgrade.timer        apt-daily-upgrade.service
Sat 2026-09-12 06:43:19 UTC       7h Fri 2026-09-11 20:12:42 UTC 2h 34min ago apt-daily.timer                apt-daily.service
Sat 2026-09-12 08:54:34 UTC      10h Fri 2026-09-11 06:53:39 UTC      15h ago man-db.timer                   man-db.service
Sun 2026-09-13 03:10:55 UTC 1 day 4h Sun 2026-09-06 03:10:56 UTC   5 days ago xfs_scrub_all.timer            xfs_scrub_all.service
Sun 2026-09-13 03:10:59 UTC 1 day 4h Sun 2026-09-06 03:10:09 UTC   5 days ago e2scrub_all.timer              e2scrub_all.service
Mon 2026-09-14 01:07:07 UTC   2 days Mon 2026-09-07 00:59:49 UTC   4 days ago fstrim.timer                   fstrim.service
Fri 2026-09-18 12:30:52 UTC   6 days Fri 2026-09-11 06:53:39 UTC      15h ago update-notifier-motd.timer     update-notifier-motd.service
-                                  - -                                      - apport-autoreport.timer        apport-autoreport.service
-                                  - -                                      - snapd.snap-repair.timer        snapd.snap-repair.service
-                                  - -                                      - ua-timer.timer                 ua-timer.service

18 timers listed.

=== systemd user units
  UNIT         LOAD   ACTIVE SUB     DESCRIPTION
  dbus.service loaded active running D-Bus User Message Bus

Legend: LOAD   → Reflects whether the unit definition was properly loaded.
        ACTIVE → The high-level unit activation state, i.e. generalization of SUB.
        SUB    → The low-level unit activation state, values depend on unit type.

1 loaded units listed. Pass --all to see loaded but inactive units, too.
To show all installed unit files use 'systemctl list-unit-files'.

=== systemd services activos (no del sistema base)
  UNIT                        LOAD   ACTIVE SUB     DESCRIPTION
  atd.service                 loaded active running Deferred execution scheduler
  code-server@clio.service    loaded active running code-server
  containerd.service          loaded active running containerd container runtime
  docker.service              loaded active running Docker Application Container Engine
  user@1000.service           loaded active running User Manager for UID 1000

Legend: LOAD   → Reflects whether the unit definition was properly loaded.
        ACTIVE → The high-level unit activation state, i.e. generalization of SUB.
        SUB    → The low-level unit activation state, values depend on unit type.

22 loaded units listed.

=== pm2 / forever / supervisor
/bin/bash: line 9: pm2: command not found

=== at jobs
```

### 7.2 puertos / docker / procesos largos / proyectos
```
=== puertos escuchando (ss -ltnp)
State  Recv-Q Send-Q Local Address:Port  Peer Address:PortProcess                              
LISTEN 0      4096      127.0.0.54:53         0.0.0.0:*                                        
LISTEN 0      4096         0.0.0.0:22         0.0.0.0:*                                        
LISTEN 0      4096       127.0.0.1:8081       0.0.0.0:*                                        
LISTEN 0      511        127.0.0.1:8080       0.0.0.0:*    users:(("node",pid=617745,fd=22))   
LISTEN 0      5          127.0.0.1:8899       0.0.0.0:*    users:(("python3",pid=908910,fd=3)) 
LISTEN 0      4096       127.0.0.1:33367      0.0.0.0:*                                        
LISTEN 0      512        127.0.0.1:37700      0.0.0.0:*    users:(("bun.exe",pid=662165,fd=13))
LISTEN 0      4096       127.0.0.1:5678       0.0.0.0:*                                        
LISTEN 0      4096   127.0.0.53%lo:53         0.0.0.0:*                                        
LISTEN 0      4096       127.0.0.1:5432       0.0.0.0:*                                        
LISTEN 0      4096            [::]:22            [::]:*                                        

=== docker ps
NAMES                IMAGE                          PORTS                      STATUS
n8n                  n8n-afip:2.23.4                127.0.0.1:5678->5678/tcp   Up 5 days
evolution_api        atendai/evolution-api:v2.1.1   127.0.0.1:8081->8080/tcp   Up 6 weeks
estetica-pg          postgres:16-alpine             127.0.0.1:5432->5432/tcp   Up 2 months
evolution_postgres   postgres:16-alpine             5432/tcp                   Up 2 months
evolution_redis      redis:7-alpine                 6379/tcp                   Up 2 months

=== docker ps -a (parados)
stupefied_payne	c768d53cd150	Exited (127) 6 weeks ago

=== procesos node/npm/python/deno de larga vida (>1h)
   1263       1 5259779 root     /usr/bin/python3 /usr/bin/networkd-dispatcher --run-startup-triggers
   1368       1 5259779 root     /usr/bin/python3 /usr/share/unattended-upgrades/unattended-upgrade-shutdown --wait-for-signal
 758419  758396 4006026 clio     npm exec n8n-mcp
 758420  758396 4006026 clio     npm exec firebase-tools@latest experimental:mcp --dir /home/clio/dev/sistema-de-reservas
 758421  758396 4006026 clio     node -e const f=require('fs'),p=require('path'),o=require('os'),c=require('child_process');const h=o.homedir();const C=process.
 758485  758421 4006026 clio     /usr/bin/node /home/clio/.claude/plugins/cache/thedotmack/claude-mem/13.12.4/scripts/mcp-server.cjs
 758564  758396 4006025 clio     npm exec n8n-mcp
 758608  758607 4006024 clio     node /home/clio/.npm/_npx/b6a381d62ce0fe56/node_modules/.bin/n8n-mcp
 758616  758615 4006024 clio     node /home/clio/.npm/_npx/ba4f1959e38407b5/node_modules/.bin/firebase experimental:mcp --dir /home/clio/dev/sistema-de-reservas
 758624  758623 4006024 clio     node /home/clio/.npm/_npx/b6a381d62ce0fe56/node_modules/.bin/n8n-mcp
 830655  830632 3910917 clio     npm exec n8n-mcp
 830656  830632 3910917 clio     npm exec firebase-tools@latest experimental:mcp --dir /home/clio/dev/sistema-de-reservas
 830657  830632 3910917 clio     node -e const f=require('fs'),p=require('path'),o=require('os'),c=require('child_process');const h=o.homedir();const C=process.
 830734  830657 3910917 clio     /usr/bin/node /home/clio/.claude/plugins/cache/thedotmack/claude-mem/13.12.4/scripts/mcp-server.cjs
 830816  830815 3910916 clio     node /home/clio/.npm/_npx/b6a381d62ce0fe56/node_modules/.bin/n8n-mcp
 830824  830823 3910916 clio     node /home/clio/.npm/_npx/ba4f1959e38407b5/node_modules/.bin/firebase experimental:mcp --dir /home/clio/dev/sistema-de-reservas
 902871  902846 3804991 root     npm run start:prod
 903123  902871 3804987 root     [node] <defunct>
 903144  902871 3804986 root     node dist/main
 908910       1 3802738 clio     python3 sink.py
1799806 1799784 2786341 clio     npm exec n8n-mcp
1799807 1799784 2786341 clio     npm exec firebase-tools@latest experimental:mcp --dir /home/clio/dev/sistema-de-reservas
1799808 1799784 2786341 clio     node -e const f=require('fs'),p=require('path'),o=require('os'),c=require('child_process');const h=o.homedir();const C=process.
1799872 1799808 2786341 clio     /usr/bin/node /home/clio/.claude/plugins/cache/thedotmack/claude-mem/13.14.0/scripts/mcp-server.cjs
1799935 1799784 2786341 clio     node /home/clio/.npm-global/bin/mcp-server-supabase --project-ref=unlhcuanfrtpatoipwve
1799965 1799964 2786340 clio     node /home/clio/.npm/_npx/b6a381d62ce0fe56/node_modules/.bin/n8n-mcp
1799977 1799976 2786340 clio     node /home/clio/.npm/_npx/ba4f1959e38407b5/node_modules/.bin/firebase experimental:mcp --dir /home/clio/dev/sistema-de-reservas
2548759 2548730 1984702 clio     /home/clio/.cache/uv/archive-v0/b3XoJ-BuTfLSkB2z/bin/python /home/clio/.cache/uv/archive-v0/b3XoJ-BuTfLSkB2z/bin/chroma-mcp --c
3245718 3245694 1420578 clio     /home/clio/.cache/uv/archive-v0/NWyvt82aB_l9rtuR/bin/python /home/clio/.cache/uv/archive-v0/NWyvt82aB_l9rtuR/bin/chroma-mcp --c
   1768    1713  494313 clio     node /usr/local/bin/n8n

=== npm run start:prod (SERVER.md zombie)
 902871  902846 3804991 npm run start:prod
-- cwd de 701646:
/home/clio/dev/SGH
-- cwd de 902871:

=== ~/dev proyectos
total 108
drwxrwxr-x 21 clio clio  4096 Jul 12 21:42 .
drwxr-xr-x 24 clio clio  4096 Sep 11 22:47 ..
drwxrwxr-x  2 clio clio  4096 May 30 23:18 .claude
drwxrwxr-x 12 clio clio  4096 Jun  6 03:20 AK-Cleaning
drwxrwxr-x 12 clio clio  4096 Jul 13 23:59 Alula-hostel
drwxrwxr-x  4 clio clio  4096 Jun  6 03:20 Padle
drwxrwxr-x 14 clio clio  4096 Sep 11 22:01 SGH
drwxrwxr-x  6 clio clio  4096 Jul 28 02:16 afip-facturacion
drwxrwxr-x  5 clio clio  4096 Aug 20 21:25 alulaweb
drwxrwxr-x 10 clio clio  4096 Sep  9 03:06 cambios
drwxrwxr-x  6 clio clio  4096 Jun 14 04:33 estetica
drwxrwxr-x  5 clio clio  4096 Aug 21 03:08 mibot247
drwxrwxr-x  3 clio clio  4096 May 30 23:19 n8n
drwxrwxr-x 12 clio clio  4096 May 30 23:19 n8n-1
drwxrwxr-x  4 clio clio  4096 Jun  6 03:20 p2p-control
drwxrwxr-x  4 clio clio  4096 Jun  6 03:19 prode-mundial
drwxrwxr-x  6 clio clio  4096 Sep  9 00:06 puertodelfin
drwxrwxr-x  8 clio clio  4096 Sep 10 22:00 sistema-de-reservas
drwxrwxr-x  9 clio clio  4096 Jul 28 03:35 trading-bot
-rw-r--r--  1 clio clio 20543 Jul 12 21:42 trading-bot.zip
drwxrwxr-x  8 clio clio  4096 Jun  6 03:23 tradingview-gratis
drwxrwxr-x  3 clio clio  4096 May 30 23:18 workspace

=== firewall
sudo: interactive authentication is required
iptables v1.8.11 (nf_tables): Could not fetch rule set generation id: Permission denied (you must be root)
```

### 7.3 env / git / ~/.claude / credenciales
```
=== quién es 'npm run start:prod' (root) — package.json con start:prod en ~/dev
ls: cannot open file '/proc/903144/cwd': Permission denied
lrwxrwxrwx 1 root root 0 Aug  4 06:01 /proc/903144/cwd

=== .env de SGH: solo NOMBRES de variables
SUPABASE_SECRET_KEY=

=== git: ramas locales sin remoto / adelantadas
audit/portal-onboarding [gone]
bkp/chore/propietarios-provisorios-r8 [gone]
bkp/chore/reunion-prueba-9998 [gone]
bkp/diag/cotejo-resultados-r6 [gone]
bkp/diag/pii-audit [gone]
bkp/feat/solicitud-origen [gone]
chore/apuestas-faltantes-r8 [gone]
chore/cierre-historial-recibos -> SIN UPSTREAM
chore/cierre-issue-056 -> SIN UPSTREAM
chore/cierre-issue-067-op1 -> SIN UPSTREAM
chore/claude-md-dominio-prod -> SIN UPSTREAM
chore/claude-md-estado-carreras-y-probes -> SIN UPSTREAM
chore/cleanup-backups [gone]
chore/diag-bono-sin-propietario -> SIN UPSTREAM
chore/issue-063-preconditions -> SIN UPSTREAM
chore/prof-diff-20j [gone]
chore/propietarios-provisorios-r8 [gone]
chore/protocolo-informes -> SIN UPSTREAM
chore/reunion-prueba-9998 [gone]
chore/saldado-r6-r8 -> SIN UPSTREAM
chore/scrub-pii-arbol-actual [gone]
chore/tanda-1-r8-el-poe -> SIN UPSTREAM
chore/tanda-1-r8-pendientes -> SIN UPSTREAM
chore/verif-r6 [gone]
diag/bono-posicion-r8 [gone]
diag/cotejo-resultados-r6 [gone]
diag/initauth-activo [gone]
diag/pii-audit [gone]
feat/asignacion-prof-20j [gone]
feat/aviso-legal-solicitud -> SIN UPSTREAM
feat/carga-prof-20j [gone]
feat/numero-publico-reuniones [gone]
feat/orden-llamados [gone]
feat/performances [gone]
feat/portal-inscripcion-libre -> SIN UPSTREAM
feat/portal-jockey-opcional-propietario -> SIN UPSTREAM
feat/portal-monta-al-anotar -> SIN UPSTREAM
feat/programa-hoja-blanco [gone]
feat/solicitud-origen [gone]
feat/sorteo-partidores -> SIN UPSTREAM
fix/activacion-invitados -> SIN UPSTREAM
fix/alineado-bn -> SIN UPSTREAM
fix/alineado-programa [gone]
fix/apuestas-especiales-tapa [gone]
fix/badge-bono-overlap [gone]
fix/club-id-alta-profesionales [gone]
fix/cobros-busqueda-caballeriza [gone]
fix/consolidado-yesi [gone]
fix/dni-cuidadores [gone]
fix/dni-jockeys [gone]
fix/login-turnstile -> SIN UPSTREAM
fix/montas-r6 [gone]
fix/pedigree-print -> SIN UPSTREAM
fix/programa-r8-imprenta [gone]
fix/r8-nombres-apuestas -> SIN UPSTREAM
fix/recibo-rotulo-rol [gone]
fix/resultados-mostrar-cuerpos [gone]
fix/resultados-numero-carrera [gone]
fix/spcs-r8-tanda-1 [gone]
fix/spcs-r8-tanda-1b [gone]
fix/spcs-r8-tanda-2 [gone]
fix/spcs-r8-tanda-3 [gone]
fix/spcs-r8-tanda-4 [gone]
fix/spcs-r8-tanda-4b -> SIN UPSTREAM
fix/spcs-r8-tanda-5 [gone]
fix/valign-bn -> SIN UPSTREAM
sec/autoregistro-gate-0 [gone]
sec/autoregistro-gate-1 [gone]
sec/autoregistro-gate-2 [gone]
sec/autoregistro-gate-3 [gone]
tmp/alta-fede [gone]
tmp/autoregistro-plan [gone]
tmp/caballerizas-diego [gone]
tmp/deploy-report [gone]
tmp/estado-r8 [gone]
tmp/probe-analisis [gone]
tmp/probe-run-1 [gone]
tmp/probe-template -> SIN UPSTREAM

=== git stash
stash@{0}: WIP on fix/spcs-r8-tanda-4b: ad61c51 fix(spcs): R8 tanda 4b — propuesta de alta de LE CHAT MIMOUS (sin ejecutar)

=== untracked / ignorados con contenido (fuera de node_modules)
!! .claude/
!! .env
!! supabase/.temp/
!! supabase/functions/reunion-json/_build/r6_build.json
!! tmp/
!! tools/__pycache__/
!! tools/_out/

=== tamaños: tools/_out data node_modules
268K	tools/_out
460K	data
53M	node_modules

=== ~/.claude (config, MCP, sesiones SGH)
total 924
drwxrwxr-x  16 clio clio   4096 Sep 11 22:46 .
drwxr-xr-x  24 clio clio   4096 Sep 11 22:47 ..
-rw-------   1 clio clio      4 Sep 11 22:46 .caveman-active
-rw-------   1 clio clio  43927 Sep 11 22:46 .claude.json
-rw-------   1 clio clio    508 Sep 11 21:56 .credentials.json
-rw-rw-r--   1 clio clio     24 Sep 11 21:49 .last-cleanup
-rw-rw-r--   1 clio clio    161 Sep 11 19:38 .last-update-result.json
drwxrwxr-x   2 clio clio   4096 Sep 11 22:47 backups
drwxrwxr-x   2 clio clio   4096 May 30 19:27 cache
drwx------   3 clio clio   4096 Aug  9 09:47 daemon
-rw-rw-r--   1 clio clio     13 Jun 29 22:04 daemon-auth-cooldown
-rw-rw-r--   1 clio clio     48 Jun 29 22:04 daemon-auth-status.json
-rw-rw-r--   1 clio clio    391 Jul 10 02:44 daemon.lock
-rw-rw-r--   1 clio clio    115 Jul 10 02:44 daemon.status.json
drwxrwxr-x   2 clio clio   4096 May 30 19:27 downloads
drwxr-xr-x  23 clio clio   4096 Sep 11 18:39 file-history
-rw-------   1 clio clio 744106 Sep 11 22:46 history.jsonl
drwxrwxr-x   3 clio clio   4096 Jun  8 09:26 jobs
drwxr-xr-x   2 clio clio  12288 Sep 11 21:39 paste-cache
-- sesiones SGH:
85
65M	/home/clio/.claude/projects/-home-clio-dev-SGH/
-- mcp config (nombres de servers, sin tokens):
## /home/clio/.claude.json
  mcpServers: []
  mcpServers: ['supabase']
  mcpServers: []
  mcpServers: []
  mcpServers: []
  mcpServers: ['supabase']
  mcpServers: []
  mcpServers: ['n8n-mcp', 'supabase']
  mcpServers: []
  mcpServers: []
  mcpServers: []
  mcpServers: []
## /home/clio/.claude/settings.json
     env keys: ['CLAUDE_CODE_DISABLE_AUTO_MEMORY']
## /home/clio/.claude/settings.local.json
## /home/clio/dev/SGH/.claude/settings.local.json

-- claude-mem (memoria):
544M	/home/clio/.claude-mem
backfill.json
backups
chroma
chroma-sync-state.json
claude-mem.db
claude-mem.db-shm
claude-mem.db-wal
corpora
last-install-error.json
logs

=== supabase CLI / login local
telemetry.json
traces

=== gh auth
github.com
  ✓ Logged in to github.com account mdqclio (/home/clio/.config/gh/hosts.yml)
  - Active account: true
  - Git operations protocol: ssh

=== ssh keys (nombres)
agent
authorized_keys
config
id_ed25519
id_ed25519.pub
known_hosts
known_hosts.old

=== code-server
● code-server@clio.service - code-server
     Loaded: loaded (/usr/lib/systemd/system/code-server@.service; enabled; preset: enabled)
     Active: active (running) since Fri 2026-09-11 06:53:40 UTC; 15h ago
bind-addr: 127.0.0.1:8080
auth: password

=== docker: cuáles pertenecen a qué proyecto (compose labels)
/n8n /home/clio/n8n
/evolution_api /home/clio/evolution
/estetica-pg 
/evolution_postgres /home/clio/evolution
/evolution_redis /home/clio/evolution
```

### 7.4 ramas sin upstream, stash, [gone]
```
=== ramas locales SIN upstream: ¿mergeadas en origin/main? ¿commits únicos?
chore/cierre-historial-recibos                commits no en origin/main: 0    contenida en remoto: origin/HEAD -> origin/main
chore/cierre-issue-056                        commits no en origin/main: 0    contenida en remoto: origin/HEAD -> origin/main
chore/cierre-issue-067-op1                    commits no en origin/main: 0    contenida en remoto: origin/HEAD -> origin/main
chore/claude-md-dominio-prod                  commits no en origin/main: 0    contenida en remoto: origin/HEAD -> origin/main
chore/claude-md-estado-carreras-y-probes      commits no en origin/main: 0    contenida en remoto: origin/HEAD -> origin/main
chore/diag-bono-sin-propietario               commits no en origin/main: 0    contenida en remoto: origin/HEAD -> origin/main
chore/issue-063-preconditions                 commits no en origin/main: 0    contenida en remoto: origin/HEAD -> origin/main
chore/protocolo-informes                      commits no en origin/main: 0    contenida en remoto: origin/HEAD -> origin/main
chore/saldado-r6-r8                           commits no en origin/main: 0    contenida en remoto: origin/HEAD -> origin/main
chore/tanda-1-r8-el-poe                       commits no en origin/main: 0    contenida en remoto: origin/HEAD -> origin/main
chore/tanda-1-r8-pendientes                   commits no en origin/main: 0    contenida en remoto: origin/HEAD -> origin/main
feat/aviso-legal-solicitud                    commits no en origin/main: 0    contenida en remoto: origin/HEAD -> origin/main
feat/portal-inscripcion-libre                 commits no en origin/main: 0    contenida en remoto: origin/HEAD -> origin/main
feat/portal-jockey-opcional-propietario       commits no en origin/main: 0    contenida en remoto: origin/HEAD -> origin/main
feat/portal-monta-al-anotar                   commits no en origin/main: 0    contenida en remoto: origin/HEAD -> origin/main
feat/sorteo-partidores                        commits no en origin/main: 0    contenida en remoto: origin/HEAD -> origin/main
fix/activacion-invitados                      commits no en origin/main: 0    contenida en remoto: origin/HEAD -> origin/main
fix/alineado-bn                               commits no en origin/main: 0    contenida en remoto: origin/HEAD -> origin/main
fix/login-turnstile                           commits no en origin/main: 0    contenida en remoto: origin/HEAD -> origin/main
fix/pedigree-print                            commits no en origin/main: 0    contenida en remoto: origin/HEAD -> origin/main
fix/r8-nombres-apuestas                       commits no en origin/main: 0    contenida en remoto: origin/HEAD -> origin/main
fix/spcs-r8-tanda-4b                          commits no en origin/main: 0    contenida en remoto: origin/HEAD -> origin/main
fix/valign-bn                                 commits no en origin/main: 0    contenida en remoto: origin/HEAD -> origin/main
tmp/probe-template                            commits no en origin/main: 0    contenida en remoto: origin/HEAD -> origin/main

=== stash: contenido
 data/spcs_snapshot.json | 3927 ++++++++++++++++++++++++-----------------------
 1 file changed, 1969 insertions(+), 1958 deletions(-)

=== commits locales de main no pusheados

=== ramas [gone] con commits únicos (remoto borrado)
audit/portal-onboarding                  1 commits fuera de origin/main
bkp/chore/propietarios-provisorios-r8    33 commits fuera de origin/main
bkp/chore/reunion-prueba-9998            9 commits fuera de origin/main
bkp/diag/cotejo-resultados-r6            1 commits fuera de origin/main
bkp/diag/pii-audit                       2 commits fuera de origin/main
chore/apuestas-faltantes-r8              1 commits fuera de origin/main
chore/cleanup-backups                    4 commits fuera de origin/main
chore/prof-diff-20j                      1 commits fuera de origin/main
chore/propietarios-provisorios-r8        33 commits fuera de origin/main
chore/reunion-prueba-9998                9 commits fuera de origin/main
chore/verif-r6                           1 commits fuera de origin/main
diag/bono-posicion-r8                    2 commits fuera de origin/main
diag/cotejo-resultados-r6                1 commits fuera de origin/main
diag/initauth-activo                     3 commits fuera de origin/main
diag/pii-audit                           2 commits fuera de origin/main
feat/asignacion-prof-20j                 5 commits fuera de origin/main
feat/carga-prof-20j                      3 commits fuera de origin/main
fix/dni-cuidadores                       3 commits fuera de origin/main
fix/dni-jockeys                          5 commits fuera de origin/main
tmp/alta-fede                            1 commits fuera de origin/main
tmp/autoregistro-plan                    1 commits fuera de origin/main
tmp/deploy-report                        1 commits fuera de origin/main
tmp/estado-r8                            2 commits fuera de origin/main
tmp/probe-analisis                       1 commits fuera de origin/main
tmp/probe-run-1                          1 commits fuera de origin/main
(fin)

=== supabase/.temp y tmp/
supabase/.temp:
linked-project.json

tmp:
R5 resultados planilla.json
R6 resultados planilla.json
R8 caballerizas sin propietario.csv
R8 propietarios certeza ALTA.csv
R8 propietarios detalle por ejemplar.csv
R8 propietarios para Yesi.csv
8.0K	supabase/.temp
108K	tmp

=== .credentials.json de claude (solo claves)
['claudeAiOauth']

=== Resend / SMTP / otras keys en el VPS (nombres de archivos .env de otros proyectos, sin abrir)
/home/clio/dev/SGH/.env
/home/clio/dev/trading-bot/.env
```

### 7.5 [gone]: contenido vs origin (main y reports)
```
rama | en algún remoto | archivos que difieren de origin/main (diff three-dot) | archivos de esa rama que NO existen en main ni reports
audit/portal-onboarding                  | origin/feat/studbook-extract |   1 | 0
bkp/chore/propietarios-provisorios-r8    | NINGUNO    |  22 | 9
bkp/chore/reunion-prueba-9998            | NINGUNO    |  10 | 8
bkp/diag/cotejo-resultados-r6            | NINGUNO    |   2 | 2
bkp/diag/pii-audit                       | NINGUNO    |   2 | 0
chore/apuestas-faltantes-r8              | NINGUNO    |   1 | 0
chore/cleanup-backups                    | NINGUNO    |   3 | 1
chore/prof-diff-20j                      | NINGUNO    |   1 | 0
chore/propietarios-provisorios-r8        | NINGUNO    |  22 | 9
chore/reunion-prueba-9998                | NINGUNO    |  10 | 8
chore/verif-r6                           | NINGUNO    |   1 | 1
diag/bono-posicion-r8                    | NINGUNO    |   1 | 0
diag/cotejo-resultados-r6                | NINGUNO    |   2 | 2
diag/initauth-activo                     | NINGUNO    |   3 | 1
diag/pii-audit                           | NINGUNO    |   2 | 0
feat/asignacion-prof-20j                 | NINGUNO    |   5 | 0
feat/carga-prof-20j                      | NINGUNO    |   3 | 0
fix/dni-cuidadores                       | NINGUNO    |   3 | 3
fix/dni-jockeys                          | NINGUNO    |   5 | 5
tmp/alta-fede                            | NINGUNO    |   2 | 2
tmp/autoregistro-plan                    | NINGUNO    |   1 | 1
tmp/deploy-report                        | NINGUNO    |   1 | 0
tmp/estado-r8                            | NINGUNO    |   2 | 1
tmp/probe-analisis                       | NINGUNO    |   1 | 0
tmp/probe-run-1                          | NINGUNO    |   1 | 1
== chore/propietarios-provisorios-r8 (2026-08-18)
   .gitignore                                                             main: existe(otra versión)  reports: existe(otra versión)
   data/sb_propietarios_r8_entrada.json                                   main: NO EXISTE en main      reports: NO EXISTE en reports
   data/sb_propietarios_r8_evidencia.json                                 main: NO EXISTE en main      reports: NO EXISTE en reports
   docs/R8_CABALLERIZAS_HOMONIMAS.md                                      main: existe(otra versión)  reports: existe(otra versión)
   docs/r8_caballerizas_propietarios_sugeridos.csv                        main: NO EXISTE en main      reports: NO EXISTE en reports
   docs/r8_caballerizas_sin_propietario.csv                               main: NO EXISTE en main      reports: NO EXISTE en reports
   tests/diag_caballerizas_homonimas.mjs                                  main: NO EXISTE en main      reports: NO EXISTE en reports
   tests/verificacion_previa_r8.mjs                                       main: NO EXISTE en main      reports: NO EXISTE en reports
   tools/sb_propietarios_caballerizas.py                                  main: NO EXISTE en main      reports: NO EXISTE en reports
== chore/reunion-prueba-9998 (2026-08-14)
   data/sb_propietarios_r8_entrada.json                                   main: NO EXISTE en main      reports: NO EXISTE en reports
   data/sb_propietarios_r8_evidencia.json                                 main: NO EXISTE en main      reports: NO EXISTE en reports
   docs/R8_CABALLERIZAS_HOMONIMAS.md                                      main: existe(otra versión)  reports: existe(otra versión)
   docs/r8_caballerizas_propietarios_sugeridos.csv                        main: NO EXISTE en main      reports: NO EXISTE en reports
   docs/r8_caballerizas_sin_propietario.csv                               main: NO EXISTE en main      reports: NO EXISTE en reports
   tests/diag_caballerizas_homonimas.mjs                                  main: NO EXISTE en main      reports: NO EXISTE en reports
   tests/verificacion_previa_r8.mjs                                       main: NO EXISTE en main      reports: NO EXISTE en reports
   tools/sb_propietarios_caballerizas.py                                  main: NO EXISTE en main      reports: NO EXISTE en reports
== fix/dni-jockeys (2026-08-12)
   CHANGELOG.md                                                           main: existe(otra versión)  reports: existe(otra versión)
   docs/DNI_CUIDADORES_PADRON.md                                          main: NO EXISTE en main      reports: NO EXISTE en reports
   docs/DNI_JOCKEYS_PADRON.md                                             main: NO EXISTE en main      reports: NO EXISTE en reports
   migrations/dni_cuidadores_padron_yesi.sql                              main: NO EXISTE en main      reports: NO EXISTE en reports
   migrations/dni_jockeys_padron_yesi.sql                                 main: NO EXISTE en main      reports: NO EXISTE en reports
== fix/dni-cuidadores (2026-08-12)
   CHANGELOG.md                                                           main: existe(otra versión)  reports: existe(otra versión)
   docs/DNI_CUIDADORES_PADRON.md                                          main: NO EXISTE en main      reports: NO EXISTE en reports
   migrations/dni_cuidadores_padron_yesi.sql                              main: NO EXISTE en main      reports: NO EXISTE en reports
== diag/cotejo-resultados-r6 (2026-08-14)
   docs/COTEJO_R6.md                                                      main: existe(otra versión)  reports: existe(otra versión)
   tests/diag_cotejo_r6.mjs                                               main: NO EXISTE en main      reports: NO EXISTE en reports
== tmp/alta-fede (2026-08-07)
   docs/ALTA_FEDE.md                                                      main: existe(otra versión)  reports: existe(otra versión)
   docs/ISSUES.md                                                         main: existe(otra versión)  reports: existe(otra versión)
== chore/verif-r6 (2026-07-22)
   tmp/verif_oficializacion_r6.md                                         main: NO EXISTE en main      reports: NO EXISTE en reports
== chore/cleanup-backups (2026-06-08)
   REMEDIACION_RESULTADO.md                                               main: existe(otra versión)  reports: existe(otra versión)
== diag/initauth-activo (2026-08-19)
   docs/PORTAL_CARTA_Y_SOLICITUDES_DIAGNOSTICO.md                         main: existe(otra versión)  reports: existe(otra versión)
== tmp/autoregistro-plan (2026-08-04)
   docs/AUTOREGISTRO_PLAN.md                                              main: existe(otra versión)  reports: existe(otra versión)
== tmp/estado-r8 (2026-07-29)
   docs/PROBE_RUN_1.md                                                    main: existe(otra versión)  reports: existe(otra versión)
== tmp/probe-run-1 (2026-07-29)
   docs/PROBE_RUN_1.md                                                    main: existe(otra versión)  reports: existe(otra versión)
```

---

## 8. Verificación de push

```
$ git push origin reports
$ git ls-remote origin reports
1836483515a9ad845055a79819e4d9721c94f669	refs/heads/reports
$ git rev-parse HEAD
1836483515a9ad845055a79819e4d9721c94f669
```
