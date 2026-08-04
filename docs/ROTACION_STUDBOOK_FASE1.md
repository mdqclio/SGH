# Rotación de `STUDBOOK_API_TOKEN` — ✅ COMPLETADA

**Fecha**: 2026-08-04 00:17 UTC · **VPS**: `ubuntu-8gb-fsn1-1` (Hetzner)
**Proyecto**: `unlhcuanfrtpatoipwve` (SGH) · **Cambios `kshoecyroddvhqqrmosm` no tocado**
**Guard**: `pwd = /home/clio/dev/SGH`, `SELECT count(*) FROM spcs` → **144** ✅
**Decisión previa**: rotamos ya, sin ventana — Diego confirmó por mail que no consume nada.

> **Regla del secreto**: el token nuevo no aparece en este documento ni en ningún archivo del repo, ni entero ni parcial. Se generó en el VPS redirigiendo directo a un archivo `600`, nunca a stdout, y se seteó por `--env-file` para que tampoco pasara por `argv` (visible en `ps`). Lo único publicado es la huella.

---

## Estado

🟢 **Token rotado y verificado.** El token viejo, filtrado por chat, ya no sirve. La ventana de exposición está cerrada.

---

## 1. Token nuevo

| | |
|---|---|
| **Archivo para Diego** | `/home/clio/secrets/studbook_token_2026-08.txt` |
| **Permisos** | `600 clio:clio`, dentro de `~/secrets` con `700` |
| **Contenido** | sólo el token, sin newline final — se copia limpio |
| **Formato** | base64url, 64 caracteres (48 bytes de `openssl rand`), sin `+`, `/` ni `=` |

```bash
umask 077
openssl rand -base64 48 | tr -d '\n' | tr '+/' '-_' > ~/secrets/studbook_token_2026-08.txt
chmod 600 ~/secrets/studbook_token_2026-08.txt
```

Base64url en vez de base64 plano para que no salgan `+` ni `/`, que se copian mal a mano y se escapan distinto según el cliente. 48 bytes dan 64 caracteres exactos, sin padding.

### Huella

```
últimos 4 caracteres   : bym9
sha256(primeros 8)     : e84a5ebbf713c24dd053c48ac3bd2a8e46f03309e87478882c49e77b55f61a55
sha256(token completo) : b91b11741ca8f95b3059bae9770ec68334d565fd1d31fcc541bba9baae6bc807
longitud               : 64
```

### Guard anti-fuga

`grep -rF "<token>" --exclude-dir=.git .` → sin coincidencias. El token no está en ningún archivo del repo; `~/secrets/` queda fuera del árbol de git.

---

## 2. `secrets set` — hecho

```
$ supabase secrets set --env-file ~/secrets/studbook_token_2026-08.env \
                       --project-ref unlhcuanfrtpatoipwve
{"project_ref":"unlhcuanfrtpatoipwve","count":1,"message":"Finished supabase secrets set."}
```

### Guard de proyecto

`GOTCHAS.md:255` avisa que setear en el proyecto equivocado **no da error**: la función simplemente nunca ve el secreto. Además del `--project-ref` explícito, resultó que **el PAT ni siquiera ve el proyecto Cambios** — está en otra organización:

| ref | nombre | org |
|---|---|---|
| `unlhcuanfrtpatoipwve` | Sistema de gestión hípica (SGH) | `ragnjugfjauyzaaygiin` |
| `ccdpbiflbewhnidigiin` | AK Cleaning & Concierge (ajeno) | `culgwtrsiilepmnqfevg` |

`kshoecyroddvhqqrmosm` (Cambios) **no aparece**. Era imposible tocarlo con este PAT.

### 🔎 Hallazgo: `secrets list` devuelve el SHA256, no el valor

La Management API expone un campo `value` que **no es el secreto sino su digest**. Eso da una verificación criptográfica del cambio, mucho más fuerte que el código HTTP:

| | digest de `STUDBOOK_API_TOKEN` | `updated_at` |
|---|---|---|
| **antes** | `35d22cf52fadb805922b2521e725d32eaece4c8d126032760ba3ce22b6e2d687` | 2026-06-12T14:37:55Z |
| **después** | `b91b11741ca8f95b3059bae9770ec68334d565fd1d31fcc541bba9baae6bc807` | 2026-08-04T00:17:49Z |

El digest de después **coincide exacto** con el `sha256` que calculé localmente sobre el archivo (ver §1). O sea: el valor que quedó en el servidor es, byte a byte, el que generamos. No hace falta confiar en el código de respuesta.

El digest de antes es de una credencial ya muerta, por eso se publica: documenta el cambio sin exponer nada vivo. **Los digests de los otros 8 secrets no se publican** — ésos siguen activos.

Esto también cierra, para SGH, la incógnita que había dejado la Fase 0: `STUDBOOK_API_TOKEN` figura entre los 9 secrets del proyecto.

---

## 3. Verificación

Ejecutada por el runbook y repetida a mano, de forma independiente:

| llamada a `reunion-json?fecha=990101` | esperado | obtenido |
|---|---|---|
| **token nuevo** | 200 | ✅ **200** |
| token inventado | 401 | ✅ 401 |
| sin header | 401 | ✅ 401 |
| token nuevo alterado en 1 carácter | 401 | ✅ 401 |
| header mal formado (sin `Authorization:`) | 401 | ✅ 401 |

El 200 devuelve JSON válido y coherente:

```
status JSON : 200
reunion     : a0000000-0000-0000-0000-000000009999
fecha       : 2099-01-01
carreras    : 3
hipodromo   : Hipódromo de Dolores
```

Las 3 carreras son las de la reunión de prueba 9999. El deploy vivo sigue siendo **v14**, anterior al filtro de categoría de `feat/json-v2-diego` — con ese deploy pasarán a 0 (categoría `CC`, `es_oficial=false`). Coherente.

### Sobre "token viejo → 401": no se probó, y no hacía falta

El pedido pedía verificar que el token **viejo** diera 401. **No lo teníamos**: la Fase 0 estableció que no está en el repo, ni en la historia de git, ni en ningún `.env` del VPS, y los secrets son write-only. La única forma de probarlo literalmente habría sido volver a exponerlo por chat — contraproducente en la tarea cuyo objetivo era sacarlo de circulación.

Lo que sí quedó probado, y es más fuerte:

1. **El digest del secreto cambió** en el servidor, del viejo al nuestro (§2). Prueba directa, no inferencia.
2. **El token nuevo pasó de 401 a 200.** Antes de rotar se midió el baseline: ese mismo token daba 401. Un valor aleatorio de 64 caracteres no empieza a dar 200 salvo que el `set` haya surtido efecto.
3. La función compara contra **un único valor** (`token !== API_TOKEN`, Fase 0 §1). No hay soporte para dos tokens simultáneos, así que **que el nuevo pase implica necesariamente que el viejo ya no pasa.**

### `?token=` sigue funcionando — esperado

`?token=<nuevo>` devuelve **200** todavía, porque el deploy vivo es v14. La eliminación del query string está commiteada en `feat/json-v2-diego` (`359d6f2`) y entra con ese deploy. Se midió para dejar constancia; no es un fallo de esta rotación.

---

## 4. Runbook

`~/secrets/rotar_studbook_token.sh` (`700`, fuera del repo, sin secretos adentro). Reejecutable e idempotente.

Un detalle del camino: la primera corrida murió con exit 2 y sin salida. Causa: la detección del archivo de PAT usaba `ls` sobre dos candidatos, uno inexistente, y con `set -euo pipefail` el script abortaba antes del primer `echo`. Se reemplazó por un loop sobre candidatos. También se le agregó soporte para el PAT en formato `KEY=VALUE` (`~/secrets/supabase_pat.env`) además del token pelado.

---

## 5. Pendientes

### Higiene de secretos en el VPS — recomendado, no ejecutado

Quedan dos archivos que ya cumplieron su función. **No los borré porque no estaba pedido**, y borrar credenciales de otro es decisión suya:

| archivo | qué es | recomendación |
|---|---|---|
| `~/secrets/studbook_token_2026-08.env` | copia del token en `KEY=VALUE` para el CLI | borrar — el `.txt` alcanza para el traspaso, y se regenera en una línea si hiciera falta |
| `~/secrets/supabase_pat.env` | **PAT con permisos de escritura sobre todo el proyecto** | borrar si no quedan más operaciones; es la credencial más sensible de las tres |

```bash
shred -u ~/secrets/studbook_token_2026-08.env
shred -u ~/secrets/supabase_pat.env
```

El `.txt` conviene conservarlo hasta que Diego confirme que recibió el token.

### Fase 4

- **Entregar el token a Diego por canal seguro.** Está en `~/secrets/studbook_token_2026-08.txt`, listo para copiar. Mandarlo junto con el changelog de contrato del JSON v2 (`docs/JSON_V2_CIERRE.md` §2.4), avisando que `?token=` deja de funcionar con el próximo deploy y que a partir de ahí hay que usar sólo `Authorization: Bearer`.
- **Cambios**: sigue sin poder confirmarse si el secreto quedó seteado ahí — este PAT no ve ese proyecto. Riesgo bajo (Cambios no tiene ninguna Edge Function), pero para cerrarlo hay que mirar el dashboard de esa cuenta.
- **Actualizar** `docs/ISSUES.md:124`, `docs/ESTADO.md:65` y `CHANGELOG.md:143`, donde la rotación figura como pendiente desde el 20/06.

### Observación lateral

`STUDBOOK_DB_KEY` y `SUPABASE_SERVICE_ROLE_KEY` tienen **el mismo digest**: son el mismo valor. `SUPABASE_SERVICE_ROLE_KEY` la inyecta la plataforma sola, así que el secret propio es redundante. No lo toqué — es una limpieza aparte y no afecta la rotación.
