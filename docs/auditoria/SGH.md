# Auditoría de Producción — SGH

| | |
|---|---|
| **Repo** | `/home/clio/dev/SGH` (github.com/mdqclio/SGH) |
| **Fecha** | 2026-06-06 |
| **Stack** | Frontend HTML/CSS/JS vanilla (sin build) · Backend Supabase (PostgreSQL + Auth) · Hosting GitHub Pages (rama `main`, deploy automático) |
| **Qué es** | SaaS multi-tenant para la operación de secretarías de carreras de hipódromos argentinos (inscripciones, programa, resultados, liquidaciones). Cliente piloto: Hipódromo de Dolores. |
| **Tipo** | SOLO DIAGNÓSTICO — no se modificó código ni se hicieron commits. |

**Leyenda:** 🟢 ok · 🟡 mejorable · 🔴 bloqueante

---

## 1) Frontend comprimido / sin secretos de cliente — 🟢

El frontend solo expone la `anon` key de Supabase (`role: anon`, JWT público de diseño) y la `SUPABASE_URL` / `CLUB_ID` en `supabase.js` y embebidas en cada HTML. La anon key **no es un secreto** — está pensada para ir en el cliente y está respaldada por RLS. No se encontraron tokens de terceros, API keys de servicios externos ni service accounts en el código que sirve el navegador (`grep service_role` sobre `*.html` = 0 resultados).

**Riesgo:** Bajo. El único matiz es que no hay minificación/compresión de assets (sin build step), pero al ser HTML/JS inline y GitHub Pages servir con gzip, el impacto es estético/performance menor, no de seguridad.

---

## 2) RLS (Row Level Security) — 🟢

RLS implementada y documentada con rigor (`docs/SECURITY.md`): 26 tablas endurecidas con aislamiento por `club_id`, `super_admin` como bypass, helpers `SECURITY DEFINER STABLE SET search_path=public`, trigger anti auto-promoción (`fn_proteger_rol_club_id_usuario`) que protege `rol`/`club_id` usando `OLD` (lo que una policy no puede), y catálogos nacionales (spcs, propietarios, profesionales) con apertura cooperativa deliberada. Sistema de auditoría con triggers `SECURITY DEFINER` en 8 tablas críticas.

**Riesgo:** Medio latente. El propio equipo documenta el talón de Aquiles (GOTCHAS #25): PostgreSQL es PERMISSIVE por default, una sola policy residual `USING(true)` anula toda la RLS sin error. El procedimiento de rollback de emergencia crea exactamente una `allow_all_emergency ... USING(true)` para `anon, authenticated` — si se deja olvidada, abre la tabla por completo. No hay un check automatizado que verifique que no quedan policies `USING(true)` en prod.

---

## 3) Git sin secretos — 🔴

**Bloqueante.** La **service_role key** de Supabase (`role: service_role`, `exp: 2092300497` → año 2036, prácticamente no expira) está **hardcodeada en 12 archivos de `tests/`** del working tree actual (`smoke_full.mjs`, `smoke_t9_t16.mjs`, y todos los `probe_*.mjs`) **y presente en el historial de git**. La service_role key **bypasea TODA la RLS** y da acceso de lectura/escritura total a la base de datos de producción. El propio `tests/README.md` (líneas 113-130) confirma que "los tests pegan directamente a la base de datos de producción" y lista `SERVICE_KEY` como credencial hardcodeada, e ISSUES previas ya pedían rotarla.

**Riesgo:** Crítico. Cualquiera con acceso al repo (o si el repo se hace público / hay un fork / se filtra) obtiene control total de los datos de todos los clubs, anulando por completo el trabajo de RLS del punto 2. Sacarla del working tree NO alcanza: hay que **rotar la key en Supabase** (la del historial seguirá siendo válida hasta rotarla) y purgar el historial.

---

## 4) APIs: auth / permisos / validación — 🟡

No hay backend propio: el "API" es Supabase REST/RPC, por lo que la autorización vive en las policies RLS (punto 2), que es el lugar correcto y robusto. Auth verificada server-side vía JWT. Validación de entradas: existe validación funcional en cliente (formatos, vacante, marcador) pero la validación de integridad de datos depende casi por completo de constraints de DB y de la lógica JS del navegador — un cliente malicioso con la anon key puede intentar escrituras arbitrarias y solo lo detiene la RLS + constraints, no validación de negocio en una capa intermedia.

**Riesgo:** Medio. Mientras la RLS esté intacta el modelo se sostiene, pero no hay defensa en profundidad: toda la seguridad de escritura cuelga de las policies. Sin capa de validación server-side (Edge Functions / triggers de validación), reglas de negocio complejas (ej. liquidaciones) son falsificables vía REST directo dentro del propio club.

---

## 5) Hosting / entornos / env vars — 🟡

Hosting en GitHub Pages, simple y sin servidor que mantener. **No hay separación de entornos:** existe una única base Supabase de producción, sin staging. Los tests corren contra prod (documentado y advertido en `tests/README.md`: "No ejecutar en CI sin una base de datos de staging separada"). No hay manejo de variables de entorno: todo está hardcodeado en el código (URL, anon key, CLUB_ID, y la service_role en tests).

**Riesgo:** Medio. Un test mal corrido o un cambio de schema toca producción directo. La ausencia de env vars es lo que hace que el punto 3 sea posible. GitHub Pages además no permite headers de seguridad personalizados (CSP, HSTS) ni lógica server-side.

---

## 6) Login / sesiones / vulnerabilidades — 🟡

Login por `signInWithPassword` de Supabase Auth (sesiones JWT gestionadas por la librería, refresh tokens, `signOut` correcto). `admin.html` y demás páginas verifican `getSession()` server-side y resuelven `rol`/`club_id` contra la tabla `usuarios`, redirigiendo a `login.html` si no hay sesión. El acceso admin **se valida tanto en cliente como en reglas** (RLS), no solo en cliente — el guard JS es UX, la RLS es la barrera real.

Riesgo de XSS: hay ~200 usos de `innerHTML` (vs ~232 `textContent`), varios con interpolación de strings (`` `...${error.message}...` `` y similares). La mayoría interpola datos controlados o mensajes de error, pero al haber datos de usuario (nombres, observaciones, datos de catálogos compartidos entre clubs) renderizados, existe superficie de stored XSS si algún campo sin escapar llega a `innerHTML`.

**Riesgo:** Medio. Sesiones y authz sólidas. Pendiente: auditar los `innerHTML` que reciben datos de usuario/catálogos compartidos y migrarlos a `textContent` o sanitización; y sin CSP (GitHub Pages) no hay mitigación de XSS en profundidad.

---

## 7) Rate limiting — 🔴

**Bloqueante operativo.** No hay rate limiting propio en login ni en las escrituras. `docs/ISSUES.md` (ISSUE-011) reconoce explícitamente "Sin rate limiting en login". El único límite es el que aplica Supabase Auth por defecto, que es genérico y no protege los endpoints REST de datos. Con la anon key pública, un atacante puede automatizar fuerza bruta de credenciales o abuso de escrituras hasta donde la RLS lo permita dentro de un club comprometido.

**Riesgo:** Alto. Fuerza bruta de login, scraping de catálogos y abuso/DoS de la base. En el plan gratuito de Supabase esto además puede agotar cuotas y tumbar el servicio para todos los clubs.

---

## 8) Caché — 🟡

GitHub Pages aplica caché HTTP estándar a los assets estáticos (con el matiz de que sin hashing de archivos, los cambios pueden tardar en propagarse por caché del CDN/navegador). No hay estrategia de caché de datos en el cliente más allá de `localStorage` para estado de UI (`sgh_active_reunion_id`, `sgh_selected_club_id`). Cada navegación recarga datos desde Supabase.

**Riesgo:** Bajo. No es un bloqueante; es una oportunidad de performance. El volumen actual (un club piloto) no lo hace urgente, pero al escalar a más clubs/usuarios la falta de caché de consultas frecuentes (catálogos, programa) pesará.

---

## 9) Escalabilidad — 🟡

Arquitectura serverless (Supabase + Pages) escala razonablemente sin operar infraestructura. El modelo multi-tenant por `club_id` está pensado para onboardear varios clubs. Riesgos: (a) las funciones helper de RLS (`fn_club_de_*`) hacen joins por fila y se invocan en cada policy — con tablas grandes y muchas filas pueden degradar performance si faltan índices sobre las FKs y `club_id`; (b) no hay evidencia de índices verificados ni de plan de capacity; (c) catálogos nacionales compartidos crecen sin partición por club.

**Riesgo:** Medio. Funciona para el piloto. Antes de escalar a N clubs conviene verificar índices en `club_id` y FKs usadas por los helpers, y medir el costo de las policies `SECURITY DEFINER` bajo carga.

---

## 10) Monitoreo / alertas — 🔴

**Bloqueante.** No hay monitoreo ni alertas de aplicación: sin Sentry/error tracking, sin logging centralizado de errores de cliente, sin alertas de caídas, sin métricas de uso. La única observabilidad es la auditoría de cambios de datos (`auditoria.html`, propósito de negocio/compliance, no operacional) y los dashboards nativos de Supabase. No hay forma de enterarse de un error en producción salvo que un usuario lo reporte.

**Riesgo:** Alto. Errores en producción (especialmente en el motor de liquidaciones, que mueve dinero) pasan desapercibidos. Sin alertas no hay detección de incidentes de seguridad, caídas ni degradación.

---

## Tabla resumen

| # | Punto | Estado |
|---|---|:---:|
| 1 | Frontend comprimido / sin secretos cliente | 🟢 |
| 2 | RLS | 🟢 |
| 3 | Git sin secretos | 🔴 |
| 4 | APIs: auth / permisos / validación | 🟡 |
| 5 | Hosting / entornos / env vars | 🟡 |
| 6 | Login / sesiones / vulnerabilidades | 🟡 |
| 7 | Rate limiting | 🔴 |
| 8 | Caché | 🟡 |
| 9 | Escalabilidad | 🟡 |
| 10 | Monitoreo / alertas | 🔴 |

**Veredicto:** 2 🟢 · 5 🟡 · 3 🔴 — **No apto para producción** hasta resolver los 3 bloqueantes.

---

## Los 3 arreglos más urgentes

1. **Rotar la service_role key y purgarla del repo (punto 3).** Está hardcodeada en 12 archivos de `tests/` y en el historial de git, con expiración en 2036, y bypasea toda la RLS sobre la base de producción. Rotar la key en el dashboard de Supabase (invalida la filtrada), mover credenciales a variables de entorno, purgar el historial (git-filter-repo/BFG) y crear una base de **staging** separada para que los tests no peguen a producción.

2. **Implementar rate limiting (punto 7).** Proteger login contra fuerza bruta y los endpoints REST contra abuso/DoS — vía configuración de Auth de Supabase, un proxy/Edge Function con límite por IP, o protección a nivel CDN. Hoy la anon key pública permite automatizar ataques sin freno.

3. **Agregar monitoreo y alertas de aplicación (punto 10).** Integrar error tracking (ej. Sentry) y alertas de caída/errores, con foco en el motor de liquidaciones (maneja dinero). Sin esto, los incidentes en producción solo se descubren cuando los reporta un usuario.

---

*Auditoría de solo lectura. No se modificó código ni se realizaron commits.*
