# IPs fijas para el servicio de consulta del Stud Book — qué hace falta de verdad

**Fecha:** 2026-09-10
**Rama del informe:** `reports`
**SHA de `main` sobre el que se relevó:** `842aa43709c9c50850b536ad2a66bc253adbc88c`
**Modo:** SOLO LECTURA. No se modificó nada — ni repo, ni DB, ni Edge Functions, ni el VPS.

## Guards verificados

```
$ pwd
/home/clio/dev/SGH
```

```sql
select count(*) as spcs_count from spcs;
```
```json
[{"spcs_count":181}]
```

```
ref del proyecto → unlhcuanfrtpatoipwve
```

Todo el relevamiento de código se hizo contra `main` (`git show main:…` / `git grep … main`).

---

## Veredicto primero

**Hace falta UNA sola IP: `178.105.154.187`** (el VPS Hetzner). Y sí, **se puede evitar por
completo depender de la conexión del hipódromo** — de hecho hay que evitarlo, porque esa conexión
no da ninguna garantía de IP fija y además rompe el modelo de seguridad del token.

Pedirle a Diego dos IPs "una de desarrollo y una del hipódromo" parte de un supuesto que no se
sostiene: **la del hipódromo no tiene por qué participar.** Si la consulta sale siempre del VPS, la
conexión del hipódromo es irrelevante para el allowlist — cambie de proveedor, de IP o de router.

Si igual se quieren dos slots, la segunda no debería ser la del hipódromo sino **una segunda IP
nuestra** (un VPS chico dedicado, ~€4/mes), para poder separar desarrollo de producción sin
depender de nada de terceros.

> ⚠️ **Hay que darle a Diego las DOS familias de la misma máquina, o forzar IPv4.** El VPS también
> tiene IPv6 (`2a01:4f8:c015:6257::1`) y, si el cliente resuelve AAAA primero, Diego va a ver esa
> y no la v4 allowlisteada. Detalle en §5.3.

---

## 0. Corrección de premisa — el JSON de reunión NO es un push nuestro

Esto cambia el problema, así que va primero.

`reunion-json` es un **endpoint de lectura que Diego consume**. Nosotros somos el **servidor**; él
es el **cliente**. No hay ningún proceso nuestro que empuje nada hacia el Stud Book.

```bash
git show main:supabase/functions/reunion-json/index.ts | head -25
```
```typescript
// ============================================================
// Edge Function: reunion-json
// ============================================================
// Expone el JSON de reunión del Stud Book POR FECHA, scope Dolores.
//
//   GET /reunion-json?fecha=YYMMDD   (ej 990101 → 2099-01-01)
//   Auth: SÓLO header  Authorization: Bearer <STUDBOOK_API_TOKEN>
//
//   El soporte de ?token= por query string se eliminó (2026-08-03): los query
//   params quedan registrados en logs de acceso, proxies intermedios e
//   historial del cliente, o sea que era una vía de fuga del token
//   independiente de cualquier otra. Ver docs/ROTACION_STUDBOOK_FASE0.md §1.
```

Confirmado en el deploy real, no sólo en el repo:

```
mcp__supabase__list_edge_functions →
  reunion-json   ACTIVE   version 21   verify_jwt=false   updated_at 1787495325640
  invite-user    ACTIVE   version  5   verify_jwt=true
```

Y así está documentado el contrato con él:

```
main:docs/ESTADO.md:58: **Auth**: header `Authorization: Bearer <STUDBOOK_API_TOKEN>`.
  **`verify_jwt` OFF** → Diego llama con **solo su token, sin anon/publishable key**.
  Sin token o token incorrecto → 401 (compara de verdad, no fail-open).
main:docs/CABALLERIZAS_JSON_DIEGO.md:151: ⚠️ **`verify_jwt` tiene que ir en `false`.**
  Diego llama sólo con el token, sin anon key.
```

**Consecuencia para las IPs**: en esta dirección **no hace falta ninguna IP nuestra**. Diego abre
la conexión contra `https://unlhcuanfrtpatoipwve.supabase.co/functions/v1/reunion-json`; lo que
necesita es el hostname y el token, no un allowlist. La IP de origen de esa conexión es la **de
él**, no la nuestra.

(Si algún día quisiéramos endurecer *ese* endpoint por IP, el que tendría que pasarnos una IP fija
es Diego, y el filtro habría que escribirlo a mano en el código de la función leyendo
`x-forwarded-for` — Edge Functions no tienen firewall por IP. No lo pidió nadie; queda anotado.)

---

## 1. ¿Desde dónde sale cada cosa, hoy?

Hay **dos direcciones** y se confunden fácil porque las dos dicen "Stud Book".

| dirección | qué es | desde dónde sale | auth | ¿necesita IP fija? |
|---|---|---|---|---|
| **Diego → nosotros** | `reunion-json`: él lee el JSON de la reunión | los servidores de **él** | `Bearer <STUDBOOK_API_TOKEN>` | **No** — es él el cliente |
| **Nosotros → Diego** | consultas al padrón (hoy scraping, mañana su API) | **el VPS Hetzner**, por línea de comandos | ninguna (scraping público) | **Sí — es de esto que se trata** |

### 1.1 La dirección saliente, hoy: scraping desde el VPS

```bash
git grep -ln "studbook.org.ar" main
```
```
main:CHANGELOG.md
main:data/pedigree_paso1_faltantes.md
main:data/pedigree_scrape_26.json
main:data/spcs_r8_tanda_1_reporte.md
main:data/spcs_r8_tanda_1_scrape.json
main:data/spcs_r8_tanda_1b_scrape.json
main:data/spcs_r8_tanda_2_scrape.json
main:data/spcs_r8_tanda_3_scrape.json
main:data/spcs_r8_tanda_4_scrape.json
main:data/spcs_r8_tanda_4b_scrape.json
```

```bash
git grep -n "studbook.org.ar" main -- '*.html' '*.js'
```
```
(ninguna referencia en HTML/JS del front)
```

**Ninguna página del sitio consulta al Stud Book.** Las únicas llamadas salientes están en
`tools/`, que son scripts de Node que se corren a mano en el VPS:

```javascript
// tools/studbook_scrape_tanda.mjs
async function autocomplete(term) {
  const url = 'https://www.studbook.org.ar/ejemplares/autocomplete'
    + `?tipo=1&muerto=1&term=${encodeURIComponent(term)}`;
  const res = await fetch(url, {
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'Referer': 'https://www.studbook.org.ar/ejemplares',
      'User-Agent': 'Mozilla/5.0',
    },
  });
```

O sea: **hoy la consulta ya sale del VPS y ya sale desde `178.105.154.187`.** El servicio oficial
de Diego reemplazaría este scraping. Si se mantiene el mismo lugar de ejecución, con una sola IP
allowlisteada el flujo actual sigue funcionando tal cual.

### 1.2 Y esto es exactamente la pregunta 2 de ISSUE-030

```
main:docs/ISSUES.md · ISSUE-030 — 7 preguntas a Diego antes de implementar:
  1. Endpoints disponibles (ejemplar por id, búsqueda, listados, pedigree).
  2. Auth (token / API key / IP whitelist).
  3. Modelo de sincronización: pull (consultamos) vs push (nos notifican cambios).
```

La pregunta 2 acaba de responderse: **IP whitelist**. La 3 sigue abierta, y conviene contestarla
en el mismo intercambio, porque si el modelo fuera *push* (él nos notifica) el allowlist se
invierte y no haría falta ninguna IP nuestra.

---

## 2. Si la consulta la hiciera el navegador, ¿Diego vería la IP del hipódromo?

**Sí, confirmado** — pero es la peor de las opciones, y no sólo por la IP.

La IP que ve un servidor es la del extremo que abre la conexión TCP. Si el `fetch` corre en el
navegador de la máquina de la secretaría, ese extremo es el router del hipódromo, y Diego ve su
**IP pública de salida (NAT)**.

Cuatro problemas, en orden de gravedad:

### 2.1 El token quedaría expuesto a cualquiera

Si el servicio de Diego se autentica con token o API key, el navegador tiene que llevarlo. Cualquier
persona con acceso a esa PC lo lee de las DevTools (pestaña Network) o del código fuente. No hay
forma de esconder un secreto en el frontend — y este repo **es público**.

Es exactamente el problema que ya se resolvió en la dirección contraria: por eso
`STUDBOOK_API_TOKEN` vive en el env de la Edge Function y nunca en el repo
(`docs/ROTACION_STUDBOOK_FASE1.md`, "Regla del secreto"). Meterlo en el browser sería deshacerlo.

### 2.2 La IP del hipódromo no es fija, y no depende de nosotros

Lo dijo el propio pedido ("puede no ser fija"). En la práctica, para una conexión comercial común:

- puede ser IP dinámica que rota al reiniciar el router o por renovación de lease;
- puede estar detrás de **CGNAT** (el ISP comparte una IP pública entre muchos clientes) — ahí ni
  siquiera es *de ellos*, y allowlistearla le abriría el servicio a todos los clientes de ese
  bloque;
- si hay conexión de respaldo (otro ISP, un 4G de emergencia), la IP cambia al caer la principal;
- si algún día la secretaría entra desde otra PC, otra sede o el celular, no funciona.

Cada uno de esos casos es un ticket a Diego para que actualice el allowlist, y mientras tanto el
servicio está caído sin que nadie sepa por qué.

### 2.3 Nuestra propia CSP lo bloquea

Todas las páginas tienen Content-Security-Policy estricta:

```bash
for f in spcs.html portal.html inscripciones.html index.html; do
  printf "%-20s " "$f"; git show main:$f | grep -o "connect-src [^;]*" | head -1
done
```
```
spcs.html            connect-src 'self' https://*.supabase.co wss://*.supabase.co
portal.html          connect-src 'self' https://*.supabase.co wss://*.supabase.co
inscripciones.html   connect-src 'self' https://*.supabase.co wss://*.supabase.co
index.html           connect-src 'self' https://*.supabase.co wss://*.supabase.co
```

```bash
git grep -l "Content-Security-Policy" main -- '*.html' | wc -l
```
```
31
```

Un `fetch` del navegador al host de Diego **se bloquea**, en las 31 páginas. Habría que agregar su
dominio al `connect-src` de cada una — o sea, ampliar la CSP de todo el sitio para un solo caso.

### 2.4 Y necesitaría CORS del lado de él

El servidor de Diego tendría que devolver `Access-Control-Allow-Origin: https://sigh.com.ar` (y
responder el preflight `OPTIONS`). Es una configuración que depende de él y que no hace falta en
ninguna de las otras opciones, porque servidor-a-servidor no hay CORS.

**Conclusión de §2**: la IP que vería Diego sería la del hipódromo, sí. Pero aun si esa IP fuera
fija, la opción se cae igual por el token expuesto. **No es un camino viable.**

---

## 3. Las opciones de proxy

### 3.1 Edge Function de Supabase — **no sirve para esto**

Supabase lo documenta explícitamente, y no es una limitación de plan sino de arquitectura:

> **Why Supabase Edge Functions cannot provide static egress IPs for allow listing**
> https://supabase.com/docs/guides/troubleshooting/why-supabase-edge-functions-cannot-provide-static-egress-ips-for-whitelisting-3d78b0
>
> *"Due to their serverless and globally distributed nature, Supabase Edge Functions do not
> originate from a single static IP address or a small, stable range of IPs. This prevents the
> assignment of fixed egress IP addresses necessary for traditional network-level allow listing."*
>
> *"Because Supabase Edge Functions lack static or stable egress IP addresses, standard outbound
> calls from an Edge Function to a service that requires IP allow listing (e.g., specifying an
> IPv4 CIDR range like `[IP]/24`) will likely be blocked."*

Y la solución que recomienda el propio Supabase es, textualmente, el VPS:

> **Solution 1: Use an outbound proxy (recommended)** — *"Deploy a small, dedicated instance (for
> example, an AWS EC2 instance or similar cloud VM) with a fixed egress IP. This instance will act
> as your gateway or proxy. […] Allow list the static IP address of your proxy server on the
> external third-party service."*

Respondiendo la pregunta tal como se hizo: **nuestro plan es `pro`**…

```
mcp__claude_ai_Supabase__get_organization(jhddllccepmbmutczwbg) →
{"id":"jhddllccepmbmutczwbg","name":"gabi.andersen@live.com's Org","plan":"pro", …}
```

…y **no cambia nada**: no hay plan de Supabase que dé IP de salida fija en Edge Functions. (El
add-on de *dedicated IPv4* que sí existe es para la **entrada** a la base Postgres, no para la
salida de las funciones. Son cosas distintas.)

### 3.2 VPS Hetzner — **sí sirve, y ya es de donde sale todo hoy**

IP verificada contra tres servicios independientes, y contra la interfaz:

```bash
for u in https://api.ipify.org https://ifconfig.me/ip https://icanhazip.com; do
  printf "%-28s " "$u"; curl -s4 --max-time 10 "$u"; echo
done
curl -s6 --max-time 8 https://api64.ipify.org
```
```
https://api.ipify.org        178.105.154.187
https://ifconfig.me/ip       178.105.154.187
https://icanhazip.com        178.105.154.187

=== IPv6 ===
2a01:4f8:c015:6257::1
```

```bash
ip -4 addr show scope global | grep -E "inet |^[0-9]"
ip route show default
```
```
2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 …
    inet 178.105.154.187/32 metric 100 scope global dynamic eth0
3: br-0838d79beff1: … inet 172.18.0.1/16 …
4: docker0: … inet 172.17.0.1/16 …
default via 172.31.1.1 dev eth0 proto dhcp src 178.105.154.187 metric 100
```

Una sola IPv4 pública, `/32`, y es la que el sistema usa como `src` por defecto. La IP del pedido
**es correcta**.

> Nota sobre la palabra `dynamic`: es la etiqueta que pone el kernel porque la dirección llega por
> DHCP, que es como Hetzner Cloud las entrega. **No** significa que rote: en Hetzner Cloud la
> *Primary IP* queda asociada al servidor y sobrevive reinicios. Sí se pierde si el servidor se
> borra o si la Primary IP se desasocia. **Acción previa a darle la IP a Diego**: en la consola de
> Hetzner, verificar que la Primary IPv4 esté marcada para **no** borrarse al eliminar el servidor.
> Eso no lo puedo comprobar desde acá (no hay token de la API de Hetzner en este entorno).

### 3.3 El estado real del VPS — lo que falta montar no es menor

```bash
for b in nginx caddy apache2 haproxy squid tinyproxy; do
  printf "%-10s " "$b"; command -v $b >/dev/null && echo "SI" || echo "no"
done
```
```
nginx      no
caddy      no
apache2    no
haproxy    no
squid      no
tinyproxy  no
```

```bash
ss -tlnH | awk '{print $4}' | sort -u
```
```
0.0.0.0:22
127.0.0.1:37700
127.0.0.1:43929
127.0.0.1:5432
127.0.0.1:5678
127.0.0.1:8080
127.0.0.1:8081
127.0.0.1:8899
127.0.0.53%lo:53
127.0.0.54:53
[::]:22
```

```bash
docker ps --format '{{.Names}}\t{{.Ports}}'
```
```
n8n	127.0.0.1:5678->5678/tcp
evolution_api	127.0.0.1:8081->8080/tcp
estetica-pg	127.0.0.1:5432->5432/tcp
evolution_postgres	5432/tcp
evolution_redis	6379/tcp
```

Tres cosas que salen de ahí:

1. **Hoy el VPS no es un servidor web.** Lo único público es **SSH (22)**. No hay 80 ni 443
   abiertos, no hay reverse proxy instalado, no hay certificado.
2. **Todo lo que escucha está en `127.0.0.1`**, o sea accesible sólo desde la propia máquina.
3. **El VPS corre otro proyecto.** `n8n`, `evolution_api`, `evolution_postgres`, `evolution_redis`
   y `estetica-pg` son del proyecto *cambios*, no de SGH. Poner el camino de producción de SGH
   sobre esa misma caja **acopla la disponibilidad de los dos proyectos**: un reinicio, un `docker
   compose down` o un disco lleno de uno le voltea el servicio al otro.

---

## 4. Cuadro de las opciones

| # | opción | IP que ve Diego | ¿es fija? | qué implica montarla |
|---|---|---|---|---|
| **A** | Navegador de la secretaría, directo | la pública del hipódromo | **No** (dinámica / CGNAT / respaldo) | Ampliar la CSP en 31 páginas · CORS del lado de Diego · **token expuesto a cualquiera** · un ticket a Diego cada vez que cambie la IP |
| **B** | Edge Function de Supabase sola | una del pool de Deno Deploy, distinta en cada invocación | **No** — Supabase documenta que es imposible | Nada que montar, pero **no resuelve el problema**: las llamadas caerían bloqueadas |
| **C** | VPS Hetzner como proxy | **`178.105.154.187`** (v4) o `2a01:4f8:c015:6257::1` (v6) | **Sí** | Servicio HTTP nuevo + subdominio + DNS + TLS + abrir 80/443 + CORS + tocar la CSP · acopla SGH al VPS del otro proyecto |
| **D** ⭐ | Navegador → Edge Function → VPS proxy → Diego | **`178.105.154.187`** | **Sí** | Es la arquitectura que recomienda Supabase · **no toca la CSP** (`*.supabase.co` ya está permitido) · el token nunca llega al navegador · el VPS sólo necesita escuchar para la Edge Function |
| **E** | VPS chico dedicado, sólo para esto | una IP nueva, fija | **Sí** | ~€4/mes · desacopla de *cambios* · si se quiere una segunda IP para dev/prod, **ésta** es la segunda, no la del hipódromo |

### 4.1 Por qué la D es la mejor, en concreto

La cadena queda así:

```
navegador (hipódromo)  ──HTTPS──▶  Edge Function        ──HTTPS──▶  VPS proxy          ──HTTPS──▶  Stud Book
  sin token             CSP ya      *.supabase.co         token en     178.105.154.187    lo único
                        lo permite  (verify_jwt según)    secrets      (IP fija)          que ve Diego
```

Lo que se gana respecto de la C pelada:

- **La CSP no se toca.** `connect-src` ya incluye `https://*.supabase.co`; las 31 páginas quedan
  como están.
- **El token de Diego nunca sale del servidor.** Vive en los secrets de la Edge Function (mismo
  patrón que `STUDBOOK_API_TOKEN` hoy), o en el VPS.
- **No hace falta CORS de Diego**, porque el navegador nunca le habla.
- **El VPS no necesita ser un sitio público completo**: sólo tiene que aceptar la llamada de la
  Edge Function. Igual necesita TLS y un hostname, pero no expone nada al público general y se
  puede autenticar con un secreto compartido (la "Solution 2" del doc de Supabase, aplicada al
  salto interno).

Lo que cuesta: un hop más de latencia, y sigue habiendo que montar y mantener el servicio en el
VPS (§3.3). Si el volumen de consultas es bajo —que es el caso: hoy son tandas manuales— la
latencia no importa.

---

## 5. Detalles que conviene cerrar con Diego en el mismo mail

### 5.1 Dirección del flujo

Confirmar que el "servicio de consulta" es **pull nuestro** (nosotros le pegamos a su API). Si
fuera push suyo (él nos notifica), el allowlist va al revés y no necesitamos darle ninguna IP —
necesitaríamos la de él. Es la pregunta 3 de ISSUE-030, que sigue abierta.

### 5.2 Si además hay token, mejor

IP allowlist y token no compiten: el allowlist es capa de red, el token capa de aplicación. Con
los dos, una IP filtrada de más no alcanza para consultar. Conviene pedirle las dos cosas.

### 5.3 IPv4 vs IPv6 — el detalle que rompe callado

El VPS tiene las dos familias. Si el cliente HTTP resuelve el dominio de Diego y elige AAAA
—Node y curl prefieren IPv6 cuando existe—, la conexión sale por `2a01:4f8:c015:6257::1` y el
allowlist de la v4 **no aplica**: da 403 sin ninguna pista de por qué.

Dos formas de cerrarlo, y conviene hacer las dos:

1. **Pasarle a Diego las dos direcciones** de la misma máquina:
   `178.105.154.187` y `2a01:4f8:c015:6257::1`.
2. **Forzar IPv4 en el cliente**, para que sea determinístico: `curl -4`, o en Node
   `fetch(url, { dispatcher: new Agent({ connect: { family: 4 } }) })` / `family: 4` en el agente.

Si le pasamos una sola dirección y el proxy sale por la otra, el síntoma es "a veces anda" — que
es el peor modo de falla para depurar a distancia.

### 5.4 Formato del allowlist

Pedirle que lo cargue como **`/32`** (host único), no como bloque `/24`. Un `/24` de Hetzner abre
el servicio a 254 direcciones de otros clientes del mismo datacenter.

---

## Números de resumen

| dato | valor |
|---|---|
| IPs nuestras necesarias, hoy | **1** — `178.105.154.187` |
| IPs necesarias si se quiere separar dev/prod | 2, y la segunda es **nuestra** (VPS dedicado), no la del hipódromo |
| ¿Hace falta la IP del hipódromo? | **No**, en ninguna de las opciones viables |
| IPv4 del VPS | `178.105.154.187/32` — verificada contra 3 servicios y contra `ip addr` |
| IPv6 del VPS | `2a01:4f8:c015:6257::1` — **también hay que declararla o forzar v4** |
| ¿Supabase da IP de salida fija? | **No**, en ningún plan (nuestro plan es `pro`); está documentado como imposible por arquitectura |
| Dirección del flujo `reunion-json` | **entrante**: Diego es el cliente, no necesita IP nuestra |
| Dirección del flujo de consulta | **saliente**: hoy ya sale del VPS, por scraping de `tools/` |
| Puertos públicos del VPS hoy | **1** — sólo SSH (22) |
| Reverse proxies instalados | **0** (ni nginx, ni caddy, ni haproxy, ni squid) |
| Páginas con CSP que habría que tocar en la opción A | **31** |
| Referencias a `studbook.org.ar` en el frontend | **0** |

---

## Qué contestarle a Diego

Un párrafo, para copiar:

> Para el servicio de consulta va **una sola IP**: **`178.105.154.187`** (IPv4, cargala como `/32`).
> Es un VPS nuestro con IP fija y de ahí salen todas las consultas, tanto las de desarrollo como
> las del hipódromo — la conexión del hipódromo no participa, así que no hay una segunda IP que
> declarar ni nada que actualizar si les cambia el proveedor.
> Un detalle: esa máquina también tiene IPv6 (`2a01:4f8:c015:6257::1`). Si tu servicio resuelve
> AAAA, la conexión te va a llegar de esa dirección. Lo más simple es que cargues las dos; nosotros
> igual vamos a forzar IPv4 del lado nuestro.
> Aparte: ¿el servicio lleva token además del allowlist? Preferimos las dos capas.
> Y confirmame el sentido del flujo: damos por hecho que consultamos nosotros contra tu API. Si en
> algún momento pasás a notificarnos vos, el allowlist se invierte y ahí el que necesita pasar IP
> sos vos.

---

## Preguntas abiertas

1. **¿Se monta el proxy en el VPS actual o en uno nuevo?** El actual corre el stack del proyecto
   *cambios* (n8n, evolution, postgres). Acoplar SGH a esa caja es la opción gratis; un VPS chico
   dedicado son ~€4/mes y desacopla. Es decisión de costo, no técnica.
2. **¿La consulta la dispara una persona desde la pantalla, o es un proceso batch?** Si es batch
   (tandas, como hoy), **no hace falta ni Edge Function ni servicio web**: alcanza con correr el
   script en el VPS, y la única IP ya está resuelta sin montar nada. Si tiene que ser interactiva
   desde `spcs.html`, ahí sí hace falta la cadena de la opción D. **Esto define cuánto trabajo es**,
   y no está definido en ningún lado del repo.
3. **Confirmar en la consola de Hetzner** que la Primary IPv4 está marcada para no borrarse con el
   servidor. No se puede verificar desde acá.
4. **ISSUE-030 pregunta 3** (pull vs push) sigue sin respuesta y condiciona todo lo anterior.
5. **¿El servicio de Diego reemplaza el scraping de `tools/`?** Si sí, conviene planificar la
   migración en el mismo movimiento y retirar los scripts de scraping, que hoy dependen de que el
   HTML de `studbook.org.ar` no cambie.

---

## Verificación de push a `origin`

```bash
git push origin reports
git ls-remote origin reports
git rev-parse HEAD
```
```
To github.com:mdqclio/SGH.git
   eb35ea2..a80de42  reports -> reports
a80de42c4ede1c2ba753fc14e4d027df425fa532	refs/heads/reports
a80de42c4ede1c2ba753fc14e4d027df425fa532
```

Coinciden: el contenido de arriba está en `origin/reports` en el commit
`a80de42c4ede1c2ba753fc14e4d027df425fa532`. Este bloque de verificación viaja en un segundo
commit — el primero no puede contener el SHA de sí mismo.
