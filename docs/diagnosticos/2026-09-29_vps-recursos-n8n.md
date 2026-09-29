# VPS — recursos libres y consumo por contenedor (decisión: 2ª instancia de n8n o reusar)

- Fecha: 2026-09-29, 16:54 UTC
- Host: `ubuntu-8gb-fsn1-1` (Hetzner, 4 vCPU, 7,6 GiB RAM, 150 GB disco)
- SHA de `main` al medir: `7e5fc99`
- Guards: sólo lectura del host (free/df/docker stats/ps). No se tocó Supabase ni ningún contenedor.

## Resumen

| Recurso | Total | Usado | Libre / disponible |
|---|---|---|---|
| RAM | 7,6 GiB | 3,8 GiB | **3,8 GiB `available`** (679 MiB `free` + 3,6 GiB cache recuperable) |
| Swap | 4,0 GiB | **2,7 GiB** | 1,3 GiB |
| Disco `/` | 150 GB | 30 GB (21 %) | **115 GB** |
| CPU | 4 vCPU | load 0,51 / 0,23 / 0,13 | ocioso |

Contenedores: **~768 MiB entre los 7**. n8n es el más pesado con **402 MiB** (5,2 %).
La mayor parte de la RAM usada NO es Docker: son procesos del usuario `clio` en el host
(sesiones `claude` + sus MCP `node`/`npm exec`, un `python` de ~750 MiB RSS, `bun.exe`).

## Lectura para la decisión

- **RAM alcanza para una 2ª n8n**: una instancia como la actual pesa ~400 MiB en uso normal
  (picos más altos al ejecutar workflows con payload grande — la actual tiene límite de 64 MB por payload).
  Con 3,8 GiB disponibles entra holgada.
- **Señal de alerta: swap 2,7 GiB de 4 GiB ocupado.** Lo tienen swapeado sobre todo dos `python`
  (~600 MiB y ~470 MiB de swap) y las sesiones `claude`/`node` viejas. No es presión actual
  (load bajo, 3,8 GiB disponibles) sino procesos ociosos que se fueron a swap. Cerrar sesiones
  viejas de Claude Code / esos python liberaría bastante antes de sumar nada.
- **Disco no es limitante**: 115 GB libres; además `docker system df` marca 4 GB de imágenes
  y 867 MB de volúmenes recuperables.
- CPU irrelevante para esta decisión.

Conclusión técnica: **cualquiera de las dos opciones entra**. La diferencia es de aislamiento/operación
(credenciales, versiones, backup, puerto/red), no de recursos. Si se reusa la existente, el costo
es 0 MiB extra; si va una 2ª, presupuestar ~400–600 MiB.

## Salida cruda

### `date -u; hostname; free -h; df -h; docker stats --no-stream; docker ps; nproc; uptime`

```
Tue Sep 29 04:54:16 PM UTC 2026
ubuntu-8gb-fsn1-1
---
               total        used        free      shared  buff/cache   available
Mem:           7.6Gi       3.8Gi       679Mi       177Mi       3.6Gi       3.8Gi
Swap:          4.0Gi       2.7Gi       1.3Gi
---
Filesystem      Size  Used Avail Use% Mounted on
tmpfs           1.6G  1.6M  1.6G   1% /run
/dev/sda1       150G   30G  115G  21% /
tmpfs           3.8G     0  3.8G   0% /dev/shm
efivarfs        256K   39K  213K  16% /sys/firmware/efi/efivars
tmpfs           3.8G  132M  3.7G   4% /tmp
/dev/sda15      253M  154K  252M   1% /boot/efi
none            1.0M     0  1.0M   0% /run/credentials/serial-getty@ttyS0.service
none            1.0M     0  1.0M   0% /run/credentials/getty@tty1.service
tmpfs           775M   20K  775M   1% /run/user/1000
none            1.0M     0  1.0M   0% /run/credentials/systemd-journald.service
none            1.0M     0  1.0M   0% /run/credentials/systemd-resolved.service
none            1.0M     0  1.0M   0% /run/credentials/systemd-networkd.service
---
CONTAINER ID   NAME                 CPU %     MEM USAGE / LIMIT     MEM %     NET I/O           BLOCK I/O         PIDS
8f0b51611801   sgh-local-pgrst      0.11%     32.6MiB / 7.559GiB    0.42%     39.8MB / 39.2MB   5.85MB / 0B       21
625f55a709d7   sgh-local-pg         0.00%     34.16MiB / 7.559GiB   0.44%     32.2MB / 28.9MB   2.45MB / 156MB    7
98dbd7fe1b01   n8n                  2.19%     402.2MiB / 7.559GiB   5.20%     4.47GB / 1.32GB   4.85GB / 39.4GB   20
413d4faffb9f   evolution_api        0.00%     88.15MiB / 7.559GiB   1.14%     8.29GB / 10.8GB   168MB / 50.8MB    29
0407b05032df   estetica-pg          0.00%     8.488MiB / 7.559GiB   0.11%     130kB / 126B      132MB / 9.54MB    6
c08fc5d9e300   evolution_postgres   0.00%     185.2MiB / 7.559GiB   2.39%     938MB / 913MB     343MB / 6.42GB    17
0b23ee92f09d   evolution_redis      0.77%     17MiB / 7.559GiB      0.22%     1.54GB / 454MB    1.55GB / 14.1GB   7
---
NAMES                IMAGE                          STATUS
sgh-local-pgrst      postgrest/postgrest:v12.2.8    Up 4 days
sgh-local-pg         postgres:16-alpine             Up 4 days
n8n                  n8n-afip:2.23.4                Up 3 weeks
evolution_api        atendai/evolution-api:v2.1.1   Up 2 months
estetica-pg          16bc17c64a57                   Up 2 months
evolution_postgres   16bc17c64a57                   Up 2 months
evolution_redis      redis:7-alpine                 Up 2 months
---
4
 16:54:19 up 78 days, 15:10,  8 users,  load average: 0.51, 0.23, 0.13
```

### Top RSS del host, top swap por proceso, `docker system df`

```
    PID USER       RSS COMMAND
2505316 clio     767396 python
2738704 clio     355420 claude
   1768 clio     337552 MainThread
 758396 clio     260288 claude
2738982 clio     246312 claude
 830632 clio     215832 claude
1799784 clio     209648 claude
2505194 clio     178676 bun.exe
2738914 clio     178480 node
2733193 70       142288 postgres
2734828 70       142012 postgres
2738813 clio     141700 npm exec fireba
2728249 70       140028 postgres
2736743 70       139496 postgres
   2270 70       136084 postgres
2738812 clio     135004 npm exec n8n-mc
2732516 70       124840 postgres
 617495 root     123868 systemd-journal
2738880 clio     108836 node
---
602616 kB 2548759 python
474192 kB 3245718 python
135676 kB 830632 claude
112724 kB 758396 claude
110916 kB 830824 node
109380 kB 758616 node
108868 kB 1799977 node
101316 kB 1799784 claude
85640 kB 1768 MainThread
54036 kB 758624 node
49488 kB 758608 node
49232 kB 830816 node
49128 kB 1799965 node
46612 kB 830656 npm exec fireba
46412 kB 1799935 node
---
TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE
Images          12        6         4.987GB   3.998GB (80%)
Containers      8         7         78.52MB   4.096kB (0%)
Local Volumes   23        6         2.544GB   867.2MB (34%)
Build Cache     0         0         0B        0B
```

Nota: los `postgres` de usuario 70 con ~140 MB RSS son los backends de `evolution_postgres`
(RSS cuenta shared_buffers compartido; `docker stats` da 185 MiB para el contenedor entero).

## Preguntas abiertas

- No se identificó qué son los dos `python` que tienen ~1 GB en swap (PIDs 2548759, 3245718) ni el
  `python` de 750 MiB RSS (2505316): el comando para leer su cmdline no pasó el chequeo de permisos
  en esta sesión. Si son restos de sesiones viejas, matarlos libera ~1,8 GB entre RAM y swap.
- Sesiones `claude` abiertas: al menos 5 (cada una con sus MCP node). Revisar cuáles siguen vivas a propósito.
