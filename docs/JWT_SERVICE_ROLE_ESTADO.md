# Estado del JWT `service_role` encontrado en la historia del repo

**Fecha de la verificación**: 2026-08-20
**Proyecto**: `unlhcuanfrtpatoipwve`
**Rama**: `diag/pii-audit`
**Contexto**: hallazgo 1 de `docs/AUDITORIA_PII_2026-08-20.md` — un JWT con
`role=service_role` quedó en 25 blobs / 16 rutas, en commits alcanzables desde `main`.

> Este documento **no contiene ningún JWT, clave ni fragmento de clave**. Sólo el estado.
> Para las pruebas, el token se extrajo de la historia a una variable de entorno y nunca
> se imprimió ni se persistió.

---

## 1 · ¿El JWT `service_role` autentica HOY contra `unlhcuanfrtpatoipwve`?

# NO.

Verificado empíricamente el 2026-08-20, mandando el token contra tres superficies distintas
de la API pública del proyecto (`curl`, con el token en los headers `apikey` y
`Authorization: Bearer`):

| Superficie | Endpoint | HTTP | Respuesta del backend |
|---|---|---|---|
| PostgREST | `/rest/v1/clubs?select=id&limit=1` | **401** | `Legacy API keys are disabled` |
| GoTrue (Auth Admin) | `/auth/v1/admin/users?page=1` | **401** | `Legacy API keys are disabled` |
| Storage | `/storage/v1/bucket` | **403** | `signature verification failed` |

Las tres rechazan. Ninguna devolvió datos.

Vale la pena mirar que **Storage falla por un motivo distinto** de las otras dos. PostgREST y
Auth cortan antes, por la bandera de legacy keys. Storage llega hasta verificar la firma del
token y ahí falla: `signature verification failed`. Son dos barreras independientes, y para
que el token volviera a servir tendrían que caer las dos.

**Dónde se verificó**: contra la API pública HTTPS del proyecto, no contra el MCP. Ver la
sección 4 sobre por qué.

---

## 2 · ¿Las legacy keys están deshabilitadas? ¿Desde cuándo?

**Sí, deshabilitadas.** La fecha la devuelve el propio backend en el `hint` del 401, sin que
haya que confiar en ningún registro externo:

```
"Your legacy API keys (anon, service_role) were disabled on 2026-06-07T19:09:33.177482+00:00"
```

**Fecha: 2026-06-07 19:09:33 UTC.** Coincide con lo que estaba registrado (07/06) y con el
commit `53516e6` del mismo día (`security: swap a publishable key + hardening RLS/grants/views`).

Aplica a las dos: `anon` **y** `service_role`. Se probaron también los dos JWT `anon` que hay
en la historia y responden igual — uno con `Legacy API keys are disabled` y el otro con
`Invalid API key`, o sea que además es de una generación anterior a la última legacy.

### Matiz importante: deshabilitado no es lo mismo que destruido

El mensaje del backend sigue diciendo:

```
"Re-enable them in the Supabase dashboard, or use the new [publishable/secret keys]"
```

O sea que **la bandera es reversible desde el panel**. Es una protección de configuración, no
una destrucción de la credencial. Lo que hace que igual esté muerto es la sección 3.

---

## 3 · ¿El signing key sigue siendo HS256 o ya se rotó a ECC P-256?

**Rotado a ECC P-256.** El JWKS público del proyecto
(`/auth/v1/.well-known/jwks.json`) devuelve **una sola clave**:

| kid | kty | alg | crv | use |
|---|---|---|---|---|
| `5e708323-23e3-4f78-bd28-9c99c29fd6b5` | `EC` | `ES256` | `P-256` | `sig` |

No hay **ninguna** clave HS256 en el conjunto activo.

El token de la historia declara en su header `{"alg":"HS256","typ":"JWT"}` (leído decodificando
sólo el header, sin tocar la firma). Es decir: **está firmado con un algoritmo para el que el
proyecto ya no publica clave de verificación.** Eso es exactamente lo que se ve en la prueba de
Storage de la sección 1, que responde `signature verification failed` en lugar de un error de
bandera.

### Una corrección al planteo de la pregunta

La pregunta venía formulada como *"si se rotó, los JWT firmados con el key anterior no validan
y eso responde la pregunta 1"*. La conclusión es correcta pero la cadena causal no es única, y
conviene tenerlo claro porque cambia qué hay que sostener en el tiempo:

- Las claves legacy `anon`/`service_role` **no se validan por firma en todas las rutas**. En
  PostgREST y Auth se cortan antes, por la bandera de la sección 2, que es independiente de la
  rotación de firma.
- La rotación de firma es lo que cubre las rutas que **sí** verifican firma, como Storage.

Las dos cosas apuntan al mismo lado, pero son mecanismos separados. La rotación de firma es la
más difícil de revertir por accidente; la bandera de legacy es un toggle de dashboard.

---

## 4 · Qué NO se pudo verificar por MCP, y qué mirar en el Dashboard

**Explícito: nada de esto se verificó por el MCP de Supabase.** El MCP de esta sesión expone
DDL/DML (`execute_sql`, `apply_migration`), advisors, edge functions y las claves
*publishable* — pero **no** expone la configuración de API keys legacy ni la administración de
JWT signing keys. Esa superficie no está en el MCP.

Todo lo de arriba se obtuvo **por HTTPS contra la API pública del proyecto**, que es una prueba
válida y en cierto sentido mejor: mide lo que un atacante mediría, desde afuera y sin
privilegios. Pero tiene un límite claro, y es el siguiente.

### Lo que queda sin confirmar

Sé que el token **no funciona**. No puedo distinguir, desde afuera, entre estos dos estados:

1. La credencial legacy fue **destruida / revocada** en el proyecto.
2. La credencial legacy sigue **existiendo pero deshabilitada**, y el secreto HMAC que la
   firmaba sigue guardado como "clave anterior" en la configuración de JWT.

Probar la diferencia requeriría re-habilitar las legacy keys, que es justamente lo que no hay
que hacer. Por eso queda para el Dashboard.

### Qué mirar, concretamente

En `https://supabase.com/dashboard/project/unlhcuanfrtpatoipwve`:

**a) Settings → API Keys → pestaña "Legacy API keys"**
- Confirmar que `anon` y `service_role` figuran como **disabled**.
- Ver si además ofrece la opción de borrarlas/revocarlas definitivamente y no sólo
  deshabilitarlas. Si existe esa opción, usarla: elimina el toggle de vuelta.
- Anotar si hay alguna advertencia del tipo "re-enabling will restore access".

**b) Settings → JWT Keys** (o "JWT Signing Keys")
- Confirmar que la clave **en uso (Current key)** es la ECC P-256 / ES256.
- Mirar si hay una **"Previously used key" / "Standby key"** con el secreto HS256 anterior
  todavía presente. Si está y ya no la necesita nada, moverla a revocada.
- Si aparece una lista de claves con estado, la HS256 tendría que figurar como
  `revoked`, no como `standby`.

**c) Settings → API → verificar que ninguna app siga configurada con las legacy.**
En este repo ya está hecho: `main` usa la `sb_publishable_…` y los probes leen
`SUPABASE_SECRET_KEY` de `.env` (no trackeado). No debería haber consumidores legacy, pero
conviene mirar si hay algún servicio externo.

---

## Conclusión operativa

**El riesgo del JWT `service_role` es histórico, no activo.** No frena nada.

Sacarlo de la historia del repo sigue correspondiendo, pero es la parte cara del plan
(reescritura sobre 25+ commits alcanzables desde `main`) y **no es lo que corre primero**. Lo
que sí conviene resolver antes es la PII que está en el árbol actual de `main` y se sirve por
HTTPS, porque eso sí es exposición vigente. Ver `docs/AUDITORIA_PII_2026-08-20.md`.

Lo único que quedaría por confirmar del lado de la credencial es el punto 4: que en el
Dashboard las legacy figuren revocadas y no meramente deshabilitadas, y que el secreto HS256
anterior no siga guardado como clave en standby.
