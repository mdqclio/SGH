# Deploy de la Edge Function `invite-user` — 28/07/2026

**Fecha**: 28/07/2026 22:40 ART = **2026-07-29 01:40:02 UTC**.
(El nombre del archivo usa la fecha local argentina; los timestamps de la
plataforma que se citan más abajo son UTC.)

**Proyecto destino**: `unlhcuanfrtpatoipwve` (SGH producción).
**NO** es `kshoecyroddvhqqrmosm` (Cambios). Verificado con
`get_project_url` → `https://unlhcuanfrtpatoipwve.supabase.co`.

**Autorización**: OK explícito de Leo para el deploy.

---

## Guards previos (todos verdes)

| Guard | Resultado |
|---|---|
| `pwd` | `/home/clio/dev/SGH` |
| `SELECT count(*) FROM spcs` | **144** (esperado ~144) |
| Project ref | `unlhcuanfrtpatoipwve` ✅ |
| Branch git | `main` |
| SHA | `2c2305ef6bc07af40a15b75063c4f19385468ece` (= `2c2305e`) |
| Working tree | limpio |
| Fuente deployada | `supabase/functions/invite-user/index.ts` de **main**, no de un branch |

---

## 1. ¿El deploy se ejecutó?

**SÍ.** Ejecutado el 2026-07-29 01:40:02 UTC vía MCP `deploy_edge_function`,
con el contenido de `main` (581 líneas). `verify_jwt` se mantuvo en `true`.

---

## 2. Baseline previo — confirmación POR CONTENIDO de que era 7842ec6

Antes de deployar se trajo el fuente vivo con `get_edge_function('invite-user')`
y se inspeccionó el texto (no la fecha, no el "status: ACTIVE"):

- `esKidNilAdminApi` → **0 ocurrencias**
- `esTransitorioPreMail` → **0 ocurrencias**
- `error_transitorio` → **0 ocurrencias**
- Únicos predicados de error presentes: `esRateLimit` y `esYaRegistrado`.

Eso es exactamente la forma del blob de **7842ec6**:

```
$ git show 7842ec6:supabase/functions/invite-user/index.ts | \
    grep -c 'esKidNilAdminApi\|esTransitorioPreMail\|error_transitorio'
0
$ git show 7842ec6:supabase/functions/invite-user/index.ts | wc -l
530
$ git show 7842ec6:supabase/functions/invite-user/index.ts | sha256sum
f747301c88b7496ae4b8c80ffb1465446c086a342297a8a52e2bf2a14e54bd43
```

Y el delta contra `main` es exclusivamente el manejo de error reintentable:

```
$ git diff --stat 7842ec6 main -- supabase/functions/invite-user/index.ts
 supabase/functions/invite-user/index.ts | 53 ++++++++++++++++++++++++++++++++-
 1 file changed, 52 insertions(+), 1 deletion(-)

$ git diff 7842ec6 main -- supabase/functions/invite-user/index.ts | grep '^+' | \
    grep -o 'esKidNilAdminApi\|esTransitorioPreMail\|error_transitorio\|503' | sort | uniq -c
      5 503
      2 error_transitorio
      3 esKidNilAdminApi
      2 esTransitorioPreMail
```

Corroboración secundaria (no es la prueba, es contexto): la función estaba en
`version 1`, `created_at == updated_at == 2026-07-23 22:22:31 UTC`, y el commit
`7842ec6` (*"feat(auth): etapa (a) — deploy de invite-user + probe verde contra
prod"*) es de `2026-07-23T22:34:04Z` — 11 minutos DESPUÉS del deploy, que es el
orden esperado (se deployó y después se commiteó).

**Baseline de rollback confirmado: 7842ec6.**

---

## 3. Comando de rollback — escrito ANTES de deployar

Dejado por escrito antes de ejecutar el deploy, no después:

```bash
git -C /home/clio/dev/SGH show 7842ec6:supabase/functions/invite-user/index.ts \
  > /home/clio/dev/SGH/supabase/functions/invite-user/index.ts
```

…y redeploy de ese contenido por MCP:

```
deploy_edge_function(
  name            = "invite-user",
  entrypoint_path = "index.ts",
  verify_jwt      = true,
  files           = [{ name: "index.ts", content: <el archivo de arriba> }]
)
```

**No hay CLI `supabase` instalado en el VPS** (`which supabase` → nada), así que
el redeploy va sí o sí por MCP; no existe la variante `supabase functions deploy`.

El blob de 7842ec6 quedó pre-staged en el scratchpad de la sesión
(`rollback_7842ec6_index.ts`, sha256 `f747301c88b7…`, 530 líneas) para que el
rollback sea una sola llamada.

---

## 4. Verificación POST-deploy — por contenido

Re-fetch de `get_edge_function('invite-user')` después del deploy. En el texto
del fuente vivo en prod:

- `function esKidNilAdminApi(err: { code?: string; message?: string } | null): boolean` → **presente**
- `function esTransitorioPreMail(` → **presente**
- `fail(503, 'error_transitorio', …)` → **dos ocurrencias**:
  1. en el `catch` de `findAuthUserByEmail` (camino pre-mail: nada enviado, nada escrito),
  2. en el branch de error de `inviteUserByEmail` (rechazo de firma `kid <nil>`).

No se verificó por fecha ni por "deploy OK": se leyó el código que hoy sirve prod.

---

## 5. version / updated_at — antes y después

| | ANTES | DESPUÉS |
|---|---|---|
| `version` | 1 | **2** |
| `updated_at` (epoch ms) | 1784845351342 | 1785289202711 |
| `updated_at` (UTC) | 2026-07-23 22:22:31 | **2026-07-29 01:40:02** |
| `ezbr_sha256` | `a3afccc1cfb702bb0fd7883587f6a46972955a5e406b79d95e7e662394cff0dd` | `5b6406c0c8851fa940802b77f3e4de56361b851a525e30dbe40a2a308e4e9f64` |
| `verify_jwt` | true | true |
| `status` | ACTIVE | ACTIVE |
| `created_at` | 1784845351342 | 1784845351342 (sin cambios — es la misma función, nueva versión) |

---

## Lo que NO se hizo

- **No** se corrió `tests/probe_invite_user.mjs` (pedido explícito).
- **No** se tocó el remitente SMTP.
- **No** se cambió `verify_jwt` ni ninguna env/secret de la función.

---

## Anexo — config de mail (consulta posterior al deploy)

- **SMTP**: la config de Auth (SMTP y rate limits) **no es legible por MCP ni por
  SQL** — vive en la config de GoTrue, no en la base; la Management API requiere
  un PAT no disponible en la sesión. Los logs de Auth de las últimas 24 h vinieron
  **vacíos**, así que tampoco hay evidencia viva por ahí.
  Lo documentado y verificado en su momento (etapa 0 del plan, 24/07/2026):
  **SMTP propio Resend activo**, dominio `hipodromodolores.com` con SPF/DKIM
  verificados, sender `sistema@` (provisorio), entrega real confirmada contra una
  casilla Gmail externa. **No se pudo reconfirmar contra la config viva de hoy** —
  para eso hace falta Dashboard → Authentication → Emails → SMTP Settings.
- **Rate limit de emails**: el valor efectivo del proyecto **no es legible desde
  acá**. Con SMTP custom el default de GoTrue es **30/hora**, ajustable en
  Dashboard → Authentication → Rate Limits. El techo de **2/hora** era el del
  mailer built-in y ya no aplica.
- **Corrección derivada**: commit `8940766` — el bloque de `INVITE_REINVITACIONES`
  en `tests/probe_invite_user.mjs` (líneas ~50-57) decía que la cuota era la del
  built-in (2/hora). Corregido a SMTP propio. **Sólo comentarios**, `node --check`
  OK, lógica del probe sin cambios.
