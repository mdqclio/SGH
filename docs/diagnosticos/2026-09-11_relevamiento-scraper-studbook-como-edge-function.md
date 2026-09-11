# Scraper del Stud Book como Edge Function — relevamiento (solo lectura)

**Fecha:** 2026-09-11 (noche) · **`main`:** `4f6ff13` · **Solo lectura**: lectura de `tools/studbook_scrape_tanda.mjs`, `spcs.html`, `supabase/functions/invite-user/index.ts`, el diagnóstico de IPs del 10/09 (`reports`), y 8 `curl` al autocomplete del Stud Book desde el VPS.

## 0. Guards

| guard | esperado | real |
|---|---|---|
| `pwd` | `/home/clio/dev/SGH` | ✅ |
| `spcs` | 203 | ✅ (sin escritura) |
| ref | `unlhcuanfrtpatoipwve` | ✅ |

---

## 1. Veredicto

**Viable, y chico.** Medio día de trabajo, una función nueva de ~120 líneas (la mitad es copiar el scraper tal cual) + ~80 líneas en `spcs.html` + un probe. Sin cambios de schema, sin cambios de CSP, sin depender de Diego.

Una corrección de premisa antes: **el scraper de hoy no depende de ninguna whitelist de IP.** El endpoint que consulta (`www.studbook.org.ar/ejemplares/autocomplete`) es **público**: sin token, sin cookie, sin allowlist — sólo exige el header `X-Requested-With: XMLHttpRequest` (sin él responde 404 con el HTML del sitio). La whitelist de IPs del diagnóstico del 10/09 es para la **API futura de Diego**, no para esto. Consecuencia doble:

- **A favor**: una Edge Function de Supabase puede llamar al autocomplete hoy mismo, desde cualquier IP de salida, sin pedirle nada a nadie. La limitación "Edge Functions no tienen IP fija" (§3.1 del 10/09) no aplica acá porque el Stud Book no filtra por IP.
- **En contra**: es scraping de un endpoint interno del sitio del Stud Book, no un contrato. Puede cambiar o cerrarse sin aviso, igual que hoy desde el VPS — moverlo a una función no lo hace más frágil ni más sólido, sólo más accesible para Yesi. Y si algún día Diego pone su API con allowlist, esa sí no va a poder salir de una Edge Function (§3.1 del 10/09 sigue valiendo para ese caso).

El día que exista la API de Diego, la función se reescribe por adentro y `spcs.html` no se entera.

---

## 2. Pregunta 1 — qué hace `tools/studbook_scrape_tanda.mjs` y cuánto corre en Deno

125 líneas. Lee una lista de nombres (archivo, un nombre por línea), y por cada uno:

1. `autocomplete(term)`: `fetch` GET a `https://www.studbook.org.ar/ejemplares/autocomplete?tipo=1&muerto=1&term=<nombre>` con 4 headers (`X-Requested-With: XMLHttpRequest`, `Accept: application/json…`, `Referer: …/ejemplares`, `User-Agent: Mozilla/5.0`). Devuelve un array JSON de hits.
2. Normaliza `norm(s)` = NFD sin diacríticos, mayúsculas, sólo `[A-Z0-9]`, y filtra los hits cuyo `text` normalizado sea **igual** al pedido.
3. Clasifica: 0 exactos → `SIN_MATCH_EXACTO` (con los candidatos parciales); >1 → `MATCH_AMBIGUO` (con id, text, leyenda, nacimiento, padre, madre de cada uno); 1 → alta propuesta.
4. Para el match único arma el registro: `sb_id`, `url_perfil`, `fecha_nacimiento` (dd/mm/yyyy → ISO), `sexo` (`Macho/Hembra/Castrado` → `macho/hembra/castrado`), `color` (= `pelo`), `padrillo_nombre`, `madre_nombre`, `abuelo_materno`, `tomo`, `folio`, `pais_origen` (bandera `/10.png` = Argentina), `raza`, y 3 alertas (sexo desconocido, `raza != 4`, bandera no argentina).
5. Escribe un JSON de evidencia y loguea `OK`/`FALTA` por nombre. **No toca la DB.**

Dependencias y compatibilidad con Deno:

| qué usa | Node | Deno (Edge Functions) | en la función |
|---|---|---|---|
| `fetch` global | ✅ (Node 22) | ✅ nativo | igual |
| `String.prototype.normalize('NFD')` + regex `[̀-ͯ]` | ✅ | ✅ (ICU completo en Deno) | igual |
| `import { readFileSync, writeFileSync } from 'node:fs'` | ✅ | ✅ (Deno soporta `node:fs`) — pero **no hace falta**: en la función la entrada es el request y la salida es la response | se borra |
| `process.argv` | ✅ | ⚠️ `Deno.args` / no aplica | se borra |
| `res.json()`, `encodeURIComponent`, `Array.filter/map` | ✅ | ✅ | igual |
| paquetes npm | **ninguno** | — | — |

**Todo lo que importa (`autocomplete`, `norm`, `SEXO`, `toISO`, la clasificación y el armado del registro: ~60 líneas) corre en Deno sin cambiar una letra.** Lo único de Node que hay es I/O de archivos y `argv`, que en una función no existen por definición. No hay nada de Node que no exista en Deno y haga falta.

---

## 3. Pregunta 2 — el endpoint: público, sin token, sin rate limit visible

Probado hoy desde el VPS (`178.105.154.187`), 8 requests:

```
=== A) con los headers del scraper
http 200 · 662B · 0.996378s
Server: Apache/2.4.38 (Debian)
Content-Type: application/json; charset=utf-8

=== B) sin headers (curl pelado)
http 404 · 20206B
<!DOCTYPE html>

<html lang="es" class=" no-mobile default">
    <head>
        <meta charset="utf-8">
        <meta name="keywords" content="stud book argentino,ejemplares,estadisticas,tramites,

=== C) sin X-Requested-With, con UA de navegador
http 404 · 20207B
<!DOCTYPE html>

<html lang="es" class=" no-mobile default">
    <head>
        <meta charset="utf-8">
        <met

=== D) preflight CORS desde sigh.com.ar
HTTP/1.1 404 Not Found

=== E) GET con Origin
HTTP/1.1 200 OK

=== F) ráfaga de 10 seguidos (rate limit?)
200 200 200 200 200 200 200 200 200 200 

=== G) CSP de spcs.html (main)
Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://*.supabase.co https://raw.githubusercontent.com; connect-src 'self' https://*.supabase.co wss://*.supabase.co; object-src 'none'; base-uri 'self'

=== H) IP pública del VPS
178.105.154.187
```

| | resultado |
|---|---|
| auth | **ninguna**: sin token, sin cookie, sin API key. El único "secreto" es el header `X-Requested-With: XMLHttpRequest` — sin él, 404 con el HTML de la home (B, C). Es el patrón clásico de "endpoint del propio front" |
| IP | no filtra: responde igual al VPS que a cualquiera (**sin verificar** desde otra IP; pero no hay allowlist documentada en ningún lado y el sitio es público) |
| rate limit | **no hay headers** (`X-RateLimit-*`, `Retry-After`: ninguno). 10 requests seguidos → 10 × 200 (F). Tandas de 24-26 seguidos hoy y en julio, sin un solo 429/403. Desconocido si hay un tope más arriba: **sin verificar** más allá de ~30 seguidos |
| latencia | ~1 s por consulta (A: 0,99 s). Para una pantalla es aceptable; para un autocompletado por tecla, **no** — va con botón "Buscar" o debounce largo |
| respuesta | JSON, ~660 B por hit set; `Server: Apache/2.4.38 (Debian)`; sin `Cache-Control` |
| `muerto=1` | incluye ejemplares muertos (el scraper lo usa así para no perder homónimos viejos) |

---

## 4. Pregunta 3 — desde el navegador, no; desde una Edge Function, sí

**CORS del Stud Book**: no manda ningún `Access-Control-Allow-*` (E), y el preflight `OPTIONS` devuelve **404** (D). Un `fetch` desde `sigh.com.ar` **muere en el preflight** (el header `X-Requested-With` lo dispara siempre). Sin CORS del lado de ellos no hay forma, y no se lo vamos a pedir a un endpoint interno.

**CSP nuestra** (`spcs.html` en `main`): `connect-src 'self' https://*.supabase.co wss://*.supabase.co`. `www.studbook.org.ar` **no está** → bloqueado también de nuestro lado, en las 31 páginas con CSP. Habría que agregarlo a todas — y no serviría igual por el CORS.

**Edge Function**: la llamada Stud Book ← función es servidor-a-servidor (sin CORS, sin CSP), y la llamada navegador → función va a `https://unlhcuanfrtpatoipwve.supabase.co/functions/v1/…`, que **ya está permitido** por `connect-src https://*.supabase.co`. `sb.functions.invoke()` ya se usa en `admin.html:611` (`invite-user`). **Cero cambios de CSP.**

---

## 5. Pregunta 4 — qué hace falta

**Función nueva**, no extender: `reunion-json` es pública con token propio y `verify_jwt:false` para Diego; `invite-user` es de admin. Mezclar una consulta de Yesi ahí es mezclar modelos de auth.

### `supabase/functions/studbook-buscar/index.ts` (~120 líneas)

| parte | qué | de dónde sale |
|---|---|---|
| CORS + `OPTIONS` | mismos headers que `invite-user:139` | copiar |
| auth | `verify_jwt: true` + `getUser(jwt)` como `invite-user:271-306`, y chequear que el usuario sea staff (`usuarios.rol in ('super_admin','secretario_carreras','operador')` o directamente `fn_is_staff()` vía RPC con el JWT del caller) | copiar + 1 RPC |
| input | `POST { term }` (o `GET ?term=`); validar 3–60 chars | nuevo, 5 líneas |
| scrape | `autocomplete(term)` + `norm` + clasificación + armado del registro | **copiar del scraper** (~60 líneas) |
| output | `{ exactos: [...], parciales: [...], consultado: true }` — **todos** los hits, cada uno ya con la forma `spcs` (`nombre`, `fecha_nacimiento`, `sexo`, `color`, `padrillo_nombre`, `madre_nombre`, `studbook_id`, `url_perfil`, `pais_origen`, `alertas`) | nuevo |
| secretos | **ninguno** (el endpoint es público). No hay `STUDBOOK_*` que exponer | — |
| deploy | archivo único sin `_shared` → no hace falta el `build.mjs`; entra directo por `deploy_edge_function` | — |

Cuidado de diseño: **no escribir en `spcs` desde la función**. Devuelve datos; el INSERT lo hace `spcs.html` con el cliente de Yesi, así el RLS y la auditoría son los de siempre y los chequeos de duplicado (ISSUE-080/079 en espíritu) quedan en la pantalla.

### `spcs.html` (~80 líneas)

El modal "+ Nuevo SPC" ya tiene los campos: `f-nombre, f-nacimiento, f-sexo-form, f-color, f-padrillo, f-madre, f-abuela, f-pais, f-registro, f-notas`. Falta:

1. Un input "Buscar en el Stud Book" + botón, arriba del formulario, sólo en alta (no en edición).
2. `sb.functions.invoke('studbook-buscar', { body: { term } })` → lista de candidatos (nombre · año · sexo · pelaje · padre × madre · muerto/vivo).
3. Click en un candidato → **prellena** los campos del modal (y `notas` con `SB <id> · <url>`, como las tandas) — Yesi revisa y guarda con el botón de siempre.
4. **`studbook_id` no está en el formulario hoy** (`grep` en `spcs.html`: sólo en `registro_stud_book`, que es otra cosa y que dejamos NULL por criterio). Hay que agregarlo al payload de `saveRecord()` (`:477-496`), como campo oculto o como campo visible read-only. Sin eso, el alta desde pantalla nace sin `studbook_id` y pierde el índice único que hoy frena duplicados.
5. Antes de guardar: chequeo de duplicado **contra `spcs`** por `studbook_id` y por nombre normalizado (lo mismo que hacemos por SQL en cada tanda), con aviso — no bloquea, mismo criterio que `profesionales-duplicados.js`.

### Probe
`tests/probe_studbook_buscar.mjs`: extrae `autocomplete` + clasificación **del archivo de la función** (el patrón de `verify_build.mjs`), corre contra el Stud Book real con 3 nombres conocidos (uno único, uno ambiguo — `BIEN COQUETA` —, uno inexistente) y assertea la forma. Sin escribir en la DB.

---

## 6. Pregunta 5 — homónimos sin turno de referencia

Hoy el scraper **no desambigua solo**: marca `MATCH_AMBIGUO` y lista los candidatos; el que elige por edad del turno soy yo, a mano, leyendo el informe. Desde una pantalla es lo mismo, pero con la persona que sabe:

- La función devuelve **todos** los exactos (y los parciales aparte). Nunca elige.
- `spcs.html` muestra la lista con lo que hace falta para decidir a ojo: **año de nacimiento, sexo, pelaje, padre × madre, y "†" si `muerto`**. Es exactamente lo que hoy pongo en las tablas de los informes; Yesi lo resuelve en un segundo porque sabe qué caballo está anotando (ej. `BIEN COQUETA` 2021 vs 1998 — la de 1998 tiene 28 años).
- Si el nombre tipeado no tiene match exacto pero sí parciales (`MARIA CATU` → `MARIA CATULENGA`), se muestran igual, rotulados "parecidos" — cubre los typos de planilla de hoy sin volver a sondear a mano.
- **Sin elección no hay prellenado.** Un solo exacto → se puede prellenar directo con un rótulo "1 coincidencia"; igual pasa por la vista de la lista para que lo confirme.

Opcional, para bajar ruido: si el modal se abre **desde Inscripciones** con un turno elegido, se puede pasar `edad_esperada` y marcar en verde el candidato que cierra — es un `fn_edad_reglamentaria` en el cliente (`edad-spc.js` ya está). No es necesario para la v1.

---

## 7. Tamaño y riesgos

| pieza | líneas | riesgo |
|---|---|---|
| función `studbook-buscar` | ~120 (60 copiadas) | bajo: sin secretos, sin DB, sólo lectura de un sitio público. Auth por JWT + staff |
| `spcs.html` | ~80 + `studbook_id` en el payload | bajo. Lo delicado es el punto 4 de §5 |
| probe | ~80 | — |
| deploy | 1 `deploy_edge_function` (archivo único, sin build) | — |
| **total** | **medio día**, un OK para la función y otro para `spcs.html` | |

Riesgos que no dependen de nosotros: el Stud Book cambia/cierra el autocomplete (hoy también nos pegaría), o empieza a bloquear IPs de datacenter (**sin verificar**; hoy responde al VPS que es Hetzner, y Deno Deploy también es datacenter). Mitigación barata: si la función recibe un 404 con HTML en vez de JSON, devolver `{ error: 'studbook_no_disponible' }` y que la pantalla diga "cargalo a mano" — que es lo que Yesi hace hoy.

Lo que **no** resuelve: caballeriza, entrenador y propietario del caballo — eso no está en el Stud Book y sigue viniendo de la planilla.

---

## 8. Verificación de push

```
$ git push origin reports
$ git ls-remote origin reports
cc6e4e19d0ccd2aee720d37e5c0bb53c0cc88948	refs/heads/reports
$ git rev-parse HEAD
cc6e4e19d0ccd2aee720d37e5c0bb53c0cc88948
```
