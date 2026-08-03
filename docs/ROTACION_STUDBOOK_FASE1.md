# Rotación de `STUDBOOK_API_TOKEN` — Fase 1 (generación) · Fase 2 BLOQUEADA

**Fecha**: 2026-08-03 · **VPS**: `ubuntu-8gb-fsn1-1` (Hetzner)
**Proyecto destino**: `unlhcuanfrtpatoipwve` (SGH) · **NO** `kshoecyroddvhqqrmosm` (Cambios)
**Guard**: `pwd = /home/clio/dev/SGH`, `SELECT count(*) FROM spcs` → **144** ✅
**Decisión previa**: rotamos ya, sin ventana — Diego confirmó por mail que no consume nada.

> **Regla del secreto**: el token nuevo no aparece en este documento ni en ningún archivo del repo, ni entero ni parcial. Se generó en el VPS redirigiendo directo a un archivo `600`, nunca a stdout. Lo único publicado es la huella.

---

## Estado en una línea

🟡 **Token nuevo generado y guardado. NO seteado todavía** — falta un PAT de Supabase, que es la única credencial que no tengo. El endpoint sigue funcionando con el token viejo.

---

## 1. ✅ Token nuevo generado

| | |
|---|---|
| **Archivo (para copiar a Diego)** | `/home/clio/secrets/studbook_token_2026-08.txt` |
| **Permisos** | `600 clio:clio`, dentro de `~/secrets` con `700` |
| **Contenido** | sólo el token, sin newline final — se copia limpio al WhatsApp |
| **Formato** | base64url, 64 caracteres (48 bytes de `openssl rand`), sin `+`, `/` ni `=` |

Generado con:
```bash
umask 077
openssl rand -base64 48 | tr -d '\n' | tr '+/' '-_' > ~/secrets/studbook_token_2026-08.txt
chmod 600 ~/secrets/studbook_token_2026-08.txt
```

Se eligió **base64url** en vez de base64 plano para que no aparezcan `+` ni `/`, que se copian mal a mano y se escapan distinto según el cliente. 48 bytes dan 64 caracteres exactos, sin padding `=`.

**No se sobrescribe nada**: el script aborta si el archivo ya existe.

### Huella

```
últimos 4 caracteres   : bym9
sha256(primeros 8)     : e84a5ebbf713c24dd053c48ac3bd2a8e46f03309e87478882c49e77b55f61a55
sha256(token completo) : b91b11741ca8f95b3059bae9770ec68334d565fd1d31fcc541bba9baae6bc807
longitud               : 64
```

El sha256 completo va como ancla de integridad: permite confirmar más adelante que el archivo no cambió, sin volver a mirar el valor.

### Guard anti-fuga

```
grep -rF "<token>" --exclude-dir=.git .   → sin coincidencias
git status --porcelain                     → limpio
```

El token **no aparece en ningún archivo del repo**. `~/secrets/` está fuera del árbol de git.

### Archivo auxiliar para el CLI

`~/secrets/studbook_token_2026-08.env` (`600`), una línea `STUDBOOK_API_TOKEN=<token>`. Existe para pasar el secreto por `--env-file` y **no por argv**: un `NAME=VALUE` en la línea de comandos queda visible en `ps` mientras el proceso corre.

---

## 2. 🔴 `secrets set` — BLOQUEADO por falta de PAT

No es un problema del plan: es exactamente el gotcha ya documentado en **`docs/GOTCHAS.md:258`**.

```
$ npx supabase@2.106.0 secrets list --project-ref unlhcuanfrtpatoipwve
{"code":"LegacyPlatformAuthRequiredError",
 "message":"Access token not provided. Supply an access token by running
            `supabase login` or setting the SUPABASE_ACCESS_TOKEN environment variable."}
```

Estado de credenciales en el VPS:

| | |
|---|---|
| CLI `supabase` | disponible vía `npx`, v2.106.0 ✅ |
| `SUPABASE_ACCESS_TOKEN` / `SUPABASE_PAT` / `SUPABASE_TOKEN` | las tres **vacías** |
| `~/.supabase/` | sólo `telemetry.json` y `traces/` — **sin access token** |
| `supabase login` | interactivo, falla en el shell non-TTY de Claude Code |
| MCP de Supabase | **no expone API de secrets** (ni listar ni setear) |

`~/.env` del repo tiene una sola variable, `SUPABASE_SECRET_KEY`, que es la key de base de datos — **no** sirve para la Management API.

**No pedí el PAT por chat a propósito**: pegarlo acá lo filtraría igual que se filtró el token que estamos rotando.

---

## 3. 🔴 Verificación — pendiente del punto 2

No se puede verificar hasta que el secreto esté seteado. Sí quedó capturado el **baseline previo**, que es lo que le va a dar sentido a la verificación posterior:

| llamada a `reunion-json?fecha=990101` | HTTP | lectura |
|---|---|---|
| sin header | **401** | el secreto viejo sigue vivo |
| token inventado | **401** | compara de verdad, no hay fail-open |
| **token nuevo** | **401** | ✅ **todavía no está seteado** — es lo esperado |

### ⚠️ Sobre "token viejo → 401": no se puede probar, y no hace falta

El pedido pide verificar que el token **viejo** dé 401. **No tengo el token viejo**: la Fase 0 estableció que no está en el repo, ni en la historia de git, ni en ningún `.env` del VPS, y los secrets de Supabase son **write-only** — no se leen de vuelta ni por dashboard.

La única forma de probarlo literalmente sería que vos me pases el token filtrado, lo cual lo volvería a exponer por chat. **Contraproducente en una tarea cuyo objetivo es justamente sacarlo de circulación.**

La prueba equivalente, y más fuerte, ya está en el diseño:

- **token nuevo → 200** sólo puede pasar si el secreto fue efectivamente reemplazado. Hoy ese mismo token da 401 (fila 3 de la tabla). Un valor aleatorio de 64 caracteres no puede empezar a dar 200 salvo que el `secrets set` haya surtido efecto.
- Como la función compara contra **un único valor** (`token !== API_TOKEN`, ver Fase 0 §1), que el nuevo pase implica necesariamente que el viejo ya no pasa. No hay soporte para dos tokens simultáneos.
- **token inventado → 401** cubre el fail-open.

El script de la Fase 2/3 verifica esas tres cosas.

---

## 4. Runbook listo para ejecutar

`~/secrets/rotar_studbook_token.sh` (`700`, fuera del repo). No contiene ningún secreto, sólo rutas. No imprime el token.

Hace, en orden:

1. **Guard de proyecto** — `unlhcuanfrtpatoipwve` explícito por `--project-ref`, con el ref de Cambios declarado como prohibido. `GOTCHAS.md:255`: setear en el proyecto equivocado **no da error**, la función simplemente nunca ve el secreto.
2. `secrets list` **antes** (nombres; los valores son write-only). De paso cierra la incógnita que dejó abierta la Fase 0: si `STUDBOOK_API_TOKEN` figura o no en los secrets de **Cambios**.
3. `secrets set --env-file` — nunca por argv.
4. `secrets list` **después**.
5. Espera de propagación (hasta 60 s, sondeando).
6. **Verificación**: token nuevo → 200 · token inválido → 401 · sin header → 401.
7. Reimprime la huella y sale 0 sólo si los tres dan lo esperado.

También mide `?token=` por query string, que **hoy sigue dando 200** porque el deploy vivo es la v14. Eso se elimina con el deploy de `feat/json-v2-diego` (`359d6f2`). Se registra para dejar constancia, no es un fallo de esta rotación.

### Para completarlo

```bash
# 1) dejar el PAT en un archivo 600 (sbp_... desde el dashboard de Supabase,
#    Account → Access Tokens). NO pegarlo en el chat.
umask 077
printf '%s' 'sbp_...' > ~/secrets/supabase_pat.txt
chmod 600 ~/secrets/supabase_pat.txt

# 2) correr el runbook
bash ~/secrets/rotar_studbook_token.sh
```

Alternativa sin PAT: setear `STUDBOOK_API_TOKEN` a mano en el **dashboard** de `unlhcuanfrtpatoipwve` (Edge Functions → Secrets), copiando el valor de `~/secrets/studbook_token_2026-08.txt`. Después corre igual la parte de verificación.

---

## 5. Riesgo abierto mientras tanto

El **token viejo, filtrado, sigue activo**. El endpoint tiene `verify_jwt = false`, o sea que es públicamente alcanzable y ese token es su única protección, sobre datos reales de R6 (nombres, DNIs de jockeys y cuidadores, resultados). La ventana de exposición no se cierra hasta que corra el paso 2.

## 6. Qué queda para la Fase 4

- Entregar el token nuevo a Diego **por canal seguro** — el archivo está listo para copiar. Junto con el changelog de contrato del JSON v2 (`docs/JSON_V2_CIERRE.md` §2.4), incluido que `?token=` deja de funcionar con el próximo deploy.
- Si `secrets list` muestra `STUDBOOK_API_TOKEN` en **Cambios**, borrarlo de ahí.
- Actualizar `docs/ISSUES.md:124`, `docs/ESTADO.md:65` y `CHANGELOG.md:143`, donde la rotación figura como pendiente desde el 20/06.
- Borrar `~/secrets/studbook_token_2026-08.env` una vez seteado el secreto: el `.txt` alcanza para el traspaso a Diego y el `.env` es una copia más del secreto en disco.
