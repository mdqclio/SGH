# Rotación de `STUDBOOK_API_TOKEN` — Fase 0 (relevamiento)

**Fecha**: 2026-08-03 · **Tipo**: solo lectura, sin gate. **Cero cambios.**
**Proyecto SGH**: `unlhcuanfrtpatoipwve` · **Proyecto Cambios**: `kshoecyroddvhqqrmosm` (no tocado)
**Guard**: `pwd = /home/clio/dev/SGH`, `SELECT count(*) FROM spcs` → **144** ✅

> **Manejo del secreto**: este documento no contiene el token viejo ni el nuevo, ni entero ni parcial.
> Todo comando de este relevamiento se corrió con redacción forzada sobre la salida.
> El token nuevo todavía **no se generó** — eso es Fase 2.

---

## 1. Quién lee `STUDBOOK_API_TOKEN` y cómo lo valida

**Una sola Edge Function: `reunion-json`.** `invite-user` no lo toca (usa otros secrets).

| función | versión | `verify_jwt` | último deploy | lee el token |
|---|---|---|---|---|
| `reunion-json` | **14** | **`false`** | 2026-06-12 03:55 UTC | ✅ |
| `invite-user` | 2 | `true` | 2026-07-29 01:40 UTC | ❌ |

Validación (leída del deploy real, no del repo):

```js
function extractToken(req, url) {
  const auth = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (auth && /^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, '').trim();
  const q = url.searchParams.get('token');          // ← también por query string
  return q ? q.trim() : null;
}
...
if (!API_TOKEN) return json({ status: 500, error: 'server misconfigured: ...' }, 500);
const token = extractToken(req, url);
if (!token || token !== API_TOKEN) return json({ status: 401, error: 'unauthorized' }, 401);
```

Lo que importa para la rotación:

- **Comparación simple `!==`** contra el valor de `Deno.env.get('STUDBOOK_API_TOKEN')`. Un solo token válido a la vez → **no hay soporte para dos tokens simultáneos**. Consecuencia directa: la rotación es un **corte duro**, no un solapamiento. Si Diego está integrado, se le rompe en el instante del `secrets set`.
- **Fail-closed**: si el secret no está seteado, corta con 500 **antes** de comparar. No hay fail-open.
- La comparación **no es de tiempo constante**. Sobre HTTP con jitter de red el riesgo práctico es bajo; lo anoto pero no justifica bloquear la rotación.
- ⚠️ **`verify_jwt = false`**: el endpoint es **públicamente alcanzable** sin anon key. El token es la **única** protección de un endpoint que hoy devuelve datos reales (nombres de ejemplares, jockeys y cuidadores con DNI, resultados). Esto sube el costo de tener un token filtrado.
- ⚠️ **Acepta el token por query string (`?token=`)**. Los query params quedan en logs de acceso, proxies intermedios e historial de cliente. Es una vía de fuga adicional, independiente del chat. **Recomiendo eliminar el soporte de `?token=` en la misma pasada de la rotación** — pero es cambio de código y va con su propio gate.

---

## 2. ¿Está seteado el secret? ¿Quedó en Cambios?

### Limitación primero

**Ninguno de los dos MCP de Supabase expone una API de secrets.** No hay `list_secrets` ni equivalente. Además, los secrets de Edge Functions son **write-only por diseño**: no se leen de vuelta ni por dashboard (ya está documentado en `docs/GOTCHAS.md:255`). Así que **no puedo listar los nombres de secrets de ninguno de los dos proyectos.**

Lo que sí pude determinar, de forma indirecta y sin conocer el valor:

### SGH `unlhcuanfrtpatoipwve` — el secret **está seteado**

Sondeo read-only contra el endpoint público. La función distingue "secret ausente" (500) de "token incorrecto" (401), así que el código de respuesta revela la presencia sin revelar el valor:

| sondeo | esperado si NO estuviera seteado | obtenido |
|---|---|---|
| `GET /functions/v1/reunion-json?fecha=990101` sin header | `500 server misconfigured` | **`401 unauthorized`** |
| ídem con `Authorization: Bearer <valor inventado>` | `500 server misconfigured` | **`401 unauthorized`** |

→ **`STUDBOOK_API_TOKEN` está seteado en SGH** y la comparación funciona (token inventado → 401, no fail-open).

### Cambios `kshoecyroddvhqqrmosm` — no hay nada que lo lea

| chequeo | resultado |
|---|---|
| `list_edge_functions(kshoecyroddvhqqrmosm)` | **`[]`** — cero Edge Functions |
| `GET https://kshoecyroddvhqqrmosm.supabase.co/functions/v1/reunion-json` | **404** |

→ En Cambios **no existe ninguna función que lea el secret**, así que aunque el valor estuviera seteado ahí no lo usa nadie ni lo expone ningún endpoint.

⚠️ **Lo que NO puedo afirmar**: si el *valor* quedó cargado en los secrets de Cambios. Sin API de listado y siendo write-only, la única vía es mirar el dashboard de ese proyecto (Settings → Edge Functions → Secrets) y ver si el **nombre** `STUDBOOK_API_TOKEN` figura en la lista. **Eso queda como tarea manual de la Fase 1.** El riesgo real es bajo (nadie lo lee), pero conviene borrarlo si está, por higiene.

Nota: `docs/GOTCHAS.md:255` ya documenta exactamente esta trampa — setear el secret en el proyecto equivocado **no da error**, la función simplemente nunca lo ve. Verificar el `ref` antes de cada `secrets set`.

---

## 3. Logs — ¿hubo llamadas externas?

### 🔴 No puedo responder esta pregunta con el MCP. Lo digo explícito porque es la que define la decisión.

`get_logs` está documentado como "últimos 24 horas", y en la práctica devolvió bastante menos:

| servicio | resultado |
|---|---|
| `edge-function` | **vacío** (`[]`), consultado dos veces |
| `api` | **100 registros** (tope), ventana **18:58–19:08 UTC del 03/08** = 10 minutos. Todos `/rest/v1/*`. **Cero `/functions/v1/*`** |

**El vacío de `edge-function` NO es evidencia de que no hubo tráfico.** Durante este mismo relevamiento hice **3 llamadas** a `reunion-json` (los sondeos de la sección 2, ~22:40 UTC) y devolvieron 401 con cuerpo JSON — o sea, la función ejecutó. Esas 3 invocaciones **no aparecen** en el log al consultarlo 7 minutos después. Conclusión: el stream de `edge-function` no está llegando por esta vía. Tratar el `[]` como "no hubo llamadas" sería un falso negativo, y justo en la variable que decide si romper o coordinar.

**30 días es inalcanzable por MCP** en cualquier caso. Para obtener el dato hay que ir a:
- Dashboard → Edge Functions → `reunion-json` → Invocations / Logs, **o**
- Logs Explorer con SQL sobre `function_edge_logs`, **o**
- Management API.

Con un caveat: **la retención de logs depende del plan** (Free ≈ 1 día). Si el proyecto está en Free, los 30 días no existen en ningún lado y la pregunta es irrespondible por datos — habría que decidir por otra vía (preguntarle a Diego directamente).

### Evidencia circunstancial de que Diego **todavía no está integrado**

No es prueba, pero apunta consistentemente en la misma dirección:

1. **`reunion-json` no se redeploya desde el 2026-06-12 03:55 UTC** (sigue en v14). El 2026-06-12 Diego pidió dos cambios concretos (aplanar `premios`/`competidores` y filtrar sólo carreras oficiales). Están codeados en la rama `feat/json-v2-diego` (`fea359e`) y **nunca se mergearon ni deployaron**. Si Diego estuviera consumiendo el endcoint en producción, ese pedido no habría quedado 7 semanas sin aplicar.
2. La auditoría de julio (`75c82ae`) dejó registrado que **ni siquiera nosotros** habíamos hecho una llamada autenticada con token válido.
3. El relevamiento del 03/08 (`docs/INTEGRACION_STUDBOOK_ESTADO.md`) encontró el contrato con puntos abiertos sin cerrar (qué eje de "oficial", cómo viajan los cuerpos, gatera vs mandil) y bloqueantes de datos duros: 72/125 cuidadores y 64/125 jockeys de R6 saldrían con `dni: null`. Un consumidor real habría reclamado eso.

---

## 4. ¿El token viejo está hardcodeado en algún lado?

**No.** Ni en el working tree, ni en la historia de git, ni en el `.env` local.

| dónde busqué | resultado |
|---|---|
| Working tree (`grep -rn STUDBOOK_API_TOKEN`) | 5 archivos, **sólo el nombre de la variable y placeholders** `<STUDBOOK_API_TOKEN>` |
| Historia completa, todas las ramas (`git log --all -S`) | 5 commits: `76c16cc`, `d85e0c7`, `26c0965`, `75c82ae`, `f3a1162` — **todos placeholders**, ningún literal |
| Barrido de `?token=` en historia y tree | sólo documentación del formato, sin valores |
| `.env` local | define **una sola** variable, `SUPABASE_SECRET_KEY`. **No** contiene `STUDBOOK*`. Está en `.gitignore:10` |
| `.env*` bajo `/home/clio` (4 niveles) | ya escaneado en la auditoría de julio (`75c82ae`): **ninguno define `STUDBOOK*`** |
| Tests (`tests/`) | ninguno usa el token |

Archivos que mencionan el nombre de la variable (sin valor): `supabase/functions/reunion-json/index.ts`, `CHANGELOG.md`, `docs/ESTADO.md`, `docs/ISSUES.md`, `docs/INTEGRACION_STUDBOOK_ESTADO.md`.

**Consecuencia operativa**: la fuga fue **por el chat, no por el repo**. La rotación **no requiere reescribir historia** (nada de BFG / `filter-repo`), ni invalidar clones, ni rotar nada más. Es sólo: generar valor nuevo → `secrets set` → avisar a Diego.

---

## 5. Estado del pendiente

La rotación ya estaba anotada como vencida:

- `docs/ISSUES.md:124` — *"Rotar `STUDBOOK_API_TOKEN` antes del 20/6 — se expuso durante el setup"*
- `docs/ESTADO.md:65` y `CHANGELOG.md:143` — ídem

**Objetivo original: 20/06. Hoy es 03/08 → ~6 semanas vencido.** Y el contexto empeoró: cuando se anotó, el endpoint sólo cubría la reunión de prueba 9999 fake. **Hoy sirve datos reales** (R6 oficializada: ejemplares, jockeys y cuidadores con DNI, resultados, premios).

---

## 6. Lo que decide Leo

**A favor de rotar ya, sin coordinar:**
- Token filtrado por chat, sobre un endpoint con `verify_jwt=false` (público) que hoy devuelve datos personales reales.
- Vencido hace 6 semanas.
- Evidencia circunstancial fuerte de que Diego no está consumiendo el endpoint (v14 sin tocar desde el 12/06, con dos cambios suyos pendientes de deploy).
- Costo de romperlo, si nadie lo usa: cero.

**A favor de coordinar con Diego primero:**
- **No tengo el dato de tráfico.** El `[]` de `edge-function` está desmentido por mis propias 3 llamadas que no aparecieron. No puedo afirmar que no hubo llamadas.
- El código soporta **un solo token** → la rotación es corte duro, sin ventana de solapamiento. Si está integrado, se rompe sin aviso.

**Mi recomendación**: mirar los logs en el dashboard (5 minutos, cierra la incógnita del punto 3). Si no hay invocaciones externas → rotar ya. Si las hay → avisar a Diego y rotar en ventana coordinada. Si el plan es Free y no hay retención → rotar ya y avisarle igual, porque el costo de romper una integración inexistente es menor que el de dejar vivo un token filtrado sobre datos personales.

---

## 7. Fases propuestas (nada ejecutado)

| fase | qué | gate |
|---|---|---|
| **0** | Este relevamiento | — (hecha) |
| **1** | Cerrar las dos incógnitas, manual en dashboard: (a) invocaciones de `reunion-json` últimos 30 días; (b) si `STUDBOOK_API_TOKEN` figura en los secrets de **Cambios** | 🚦 decisión de Leo: rotar ya / coordinar |
| **2** | Generar el token nuevo **en el VPS** (`openssl rand -base64 32` o `head -c 32 /dev/urandom \| base64`), setearlo desde ahí con `supabase secrets set` contra el ref **`unlhcuanfrtpatoipwve`**. El valor **no se imprime** en terminal ni en ningún archivo del repo. Se reporta **sólo la huella**: últimos 4 caracteres + `sha256` de los primeros 8 | 🚦 OK antes de setear |
| **3** | Verificar: token viejo → 401, token nuevo → 200. La verificación se hace **en el VPS**, leyendo el valor de una variable de entorno, nunca pegándolo en un comando visible | 🚦 |
| **4** | Si aplica: borrar el secret de Cambios. Entregar el token nuevo a Diego **por canal seguro, no por chat**. Actualizar `docs/ISSUES.md:124`, `docs/ESTADO.md:65`, `CHANGELOG.md:143` | 🚦 |
| **5** | Opcional, con gate propio: sacar el soporte de `?token=` de `extractToken()` para que el token no viaje más en query string | 🚦 |

### Restricciones operativas para la Fase 2 (ya documentadas en GOTCHAS)

- **`GOTCHAS.md:258`** — `npx supabase login` es interactivo y **falla en el shell non-TTY** de Claude Code (`Access token not provided`). Para correr `secrets set` desde acá hay que pasar un **PAT inline por variable de entorno**, o hacerlo por dashboard / Management API. El archivo en `supabase/.temp/` sólo guarda el link, no la auth.
- **`GOTCHAS.md:255`** — los secrets son **por-proyecto y write-only**. Setearlos en el proyecto equivocado **no da error**; la función simplemente nunca los ve y falla en runtime sin pista clara. **Verificar el `ref` antes de ejecutar.**
- No hay ventana de solapamiento posible sin tocar el código: `!==` contra un único valor. Si se quisiera rotación sin corte, habría que aceptar dos tokens (`STUDBOOK_API_TOKEN` + `STUDBOOK_API_TOKEN_PREV`) — cambio de código, fase aparte.

---

**Fase 0 cerrada. Nada modificado. Esperando decisión.**
