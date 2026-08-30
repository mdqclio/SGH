# SGH — Sistema de Gestión Hípica

Software SaaS para la operación de hipódromos argentinos. Digitaliza la secretaría de carreras: inscripciones, ratificación, programa, resultados y liquidaciones. Primer cliente piloto: **Hipódromo de Dolores (HDO)**, Buenos Aires.

---

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | HTML + CSS + JS vanilla (sin frameworks, sin build) |
| Backend / DB | Supabase — PostgreSQL + Auth |
| Hosting | GitHub Pages — rama `main`, deploy automático al pushear |
| Auth | Supabase Auth (`signInWithPassword`) + tabla `usuarios` |

Cada módulo es un único archivo HTML autocontenido con CSS y JS inline. No hay transpilación, bundler ni node_modules para runtime.

---

## Estructura del proyecto

```
/
├── index.html                   Dashboard principal
├── login.html                   Auth
├── inscripciones.html           Inscripciones de ejemplares por carrera
├── ratificacion.html            Ratificación / forfait / mal_inscrito
├── programa.html                Programa de carreras (modal apuestas)
├── programa-oficial.html        Impresión estilo manual Dolores (B&N)
├── programa-oficial-color.html  Idem, con color
├── resultados.html              Carga de posiciones y dividendos
├── liquidaciones.html           Motor de premios y recibos
├── carta-llamados.html          Carta de llamados imprimible
├── reuniones.html               CRUD de reuniones (7 estados)
├── caballerizas.html            ABM caballerizas con responsables
├── jockeys.html                 ABM jockeys
├── profesionales.html           ABM entrenadores/profesionales
├── propietarios.html            ABM propietarios
├── spcs.html                    Stud Book (ejemplares SPC)
├── sanciones.html               Sanciones compartidas entre hipódromos
├── resoluciones.html            Resoluciones
├── usuarios.html                Gestión de usuarios por hipódromo
├── admin.html                   Panel super_admin (comisión, sponsors, etc.)
├── hipodromos.html              ABM hipódromos
├── categorias.html              Categorías de carrera
├── calendario.html              Calendario anual de reuniones
├── auditoria.html               Log de auditoría con diff visual
├── portal.html                  Portal propietarios/entrenadores (pendiente)
│
├── active-reunion.js            Helper window.ActiveReunion (resolve/set/clear)
├── club-switcher.js             Dropdown hipódromo para super_admin (16 páginas)
├── chapas.js                    Paleta SVG de chapas SBARG por mandil
├── partidor-colors.js           Colores SBARG para chips de mandil
├── renumerar-chapas.js          renumerarChapas(inscripciones) → {id → 1..N}
├── premios-utils.js             Utilitarios de liquidación de premios
├── supabase.js                  createClient centralizado
│
├── SCHEMA.md                    Schema de DB documentado (fuente de verdad)
├── CHANGELOG.md                 Historial de cambios
├── docs/
│   ├── ARQUITECTURA.md          Convenciones, colores, flujo de auth
│   ├── CONTEXTO.md              Contexto del negocio y usuarios
│   ├── ESTADO.md                Estado de módulos y snapshots de sesión
│   ├── MODULOS.md               Detalle por módulo + reglas de negocio
│   ├── DECISIONES.md            ADRs (decisiones arquitectónicas)
│   ├── GOTCHAS.md               Trampas conocidas y aprendizajes
│   ├── ISSUES.md                Bugs conocidos y deudas técnicas
│   ├── SNIPPETS.md              SQL y JS reutilizables
│   ├── SCHEMA.md                Schema extendido (copia con más detalle)
│   ├── SERVER.md                Specs del VPS Hetzner + límites de plataforma (sin chromium)
│   └── LIQUIDACIONES_GAP_ANALYSIS.md  Modelo cerrado vs implementación (fuente del gap vivo)
├── tests/                       Probes contra prod (sin browser — harness de código real; ver tests/README.md)
│   ├── README.md                Instrucciones + patrón harness (AsyncFunction + Supabase real)
│   ├── smoke_full.mjs           Suite completa T1–T17 (ciclo completo resultados.html)
│   ├── smoke_t9_t16.mjs         Regresión bug 3b + optimistic lock
│   ├── probe_nav_dirty.mjs      Navegación con cambios sin guardar
│   ├── probe_tiempo_ganador.mjs Carga de tiempo ganador
│   ├── probe_estado_pista.mjs   Estado de pista
│   ├── probe_incentivos_montas.mjs  Incentivos Bloque C (jockey 50k/reunión, entrenador 10k/caballo)
│   ├── probe_recibos_emision.mjs    Fase 4 v1 — RPC emitir_recibo + buscador pagable
│   └── probe_cobros_v11.mjs     Fase 4 v1.1 — liberar_linea + búsqueda + filtro carrera
├── migrations/                  SQL versionado (fuente de verdad de DDL; aplicar por MCP)
│   ├── emitir_recibo_fase4.sql  RPC emitir_recibo v1 (cobro atómico)
│   ├── emitir_recibo_v1_1.sql   RPC emitir_recibo v1.1 (pagable = solo impago)
│   └── liberar_linea.sql        RPC liberar_linea (liberación manual del doping)
```

---

## Accesos y credenciales

```javascript
SUPABASE_URL  = 'https://unlhcuanfrtpatoipwve.supabase.co'
SUPABASE_KEY  = 'sb_publishable_...'  // publishable key (pública, frontend)
CLUB_ID_DOLORES = '0649e9c5-9e87-4aad-842f-101458e6b33c'
```

**CRÍTICO (actualizado 2026-06-07):** Usar la **publishable key** `sb_publishable_...` (Settings → API → "API keys"). Las **legacy `eyJ...` (anon + service_role) están DESACTIVADAS** desde 2026-06-07 — devuelven 401 `"Legacy API keys are disabled"`. La secret server-side es `sb_secret_...` (NUNCA en el repo; va por env `SUPABASE_SECRET_KEY`). El antiguo consejo "usar la legacy `eyJ`" quedó obsoleto.

Usuarios de producción:
- `admin@sgh.com` / `super_admin`
- `dolores@sgh.com` / `secretario_carreras`

---

## Modelo de datos

### Flujo principal
```
clubs → reuniones → carreras → inscripciones → resultado_posiciones
                                             ↘ resultado_apuestas
                             ↘ carrera_apuestas (apuestas habilitadas)
```

### Tablas clave

| Tabla | Descripción |
|---|---|
| `clubs` | Hipódromos. `club_id` es el tenant ID. |
| `reuniones` | Reunión hípica. Estados: borrador/publicada/confirmada/anulada. |
| `carreras` | Turno dentro de una reunión. `numero_turno` (orden en reunión), `numero_carrera_programa` (orden post-ratificación, nullable). |
| `inscripciones` | Un ejemplar inscripto en un turno. Estado ENUM: `inscripto → ratificado → forfait / mal_inscrito`. |
| `spcs` | Ejemplares del Stud Book. **Globales** (sin `club_id` obligatorio). |
| `resultados` | Una fila por carrera. Estado: `provisional / oficial / anulado`. |
| `resultado_posiciones` | Orden de llegada. FK → inscripciones. Columnas: `posicion` (NULL si no largó), `dividendo`, `diferencia`, `no_largo BOOLEAN DEFAULT false`. Ratificado que no llega a largar: `{posicion:null, no_largo:true}`, conserva mandil (hueco). |
| `resultado_apuestas` | Dividendos pagados por tipo. FK → resultados. Reemplazado en bloque por RPC `aplicar_resultado`. |
| `carrera_apuestas` | Apuestas habilitadas por carrera (reemplaza `carreras.apuestas_habilitadas JSONB` dropeada). |
| `liquidaciones` | Premios calculados por carrera y puesto. |
| `categorias_carrera` | 4 categorías por club (OC, ONC, NO, CC). |
| `caballeriza_responsables` | Propietario + copropietarios de una caballeriza (relacional). |

### Gatera, Mandil y Chapa — modelo confirmado con Fede (28/05/2026)

Ver detalle completo en [`docs/MODELO_NUMERACION.md`](docs/MODELO_NUMERACION.md).

| Concepto | Campo DB | Descripción |
|---|---|---|
| **Gatera** | `inscripciones.numero_partidor` | Cajón de largada asignado por sorteo. Por-carrera, aleatorio, puede tener huecos. **Nunca se muestra al usuario.** |
| **Mandil = Chapa** | (calculado) | Número visible en el dorsal durante la carrera. Siempre 1..N consecutivo, sin huecos. |

El mandil/chapa se calcula con `renumerarChapas(inscripciones)` en `renumerar-chapas.js`: filtrar `estado === 'ratificado'`, ordenar por `numero_partidor` ASC, asignar 1..N. **No se persiste.** Regla de oro: en la UI siempre mostrar el 1..N derivado, nunca `numero_partidor` directo (excepción: PDF de inscriptos, que muestra el resultado del sorteo de cajones).

El `chapaCell` en el marcador de `resultados.html` es el **margen de llegada** (nariz/pescuezo/cuerpos), no el número del caballo — no confundir.

### Apuestas — 13 tipos válidos

```
Posicionales:  GAN (Ganador), SEG (Segundo), TER (Tercero)
Directas:      EX (Exacta), IM (Imperfecta), TR (Trifecta), CUAT (Cuatrifecta)
Combinadas:    X2 (Doble), X2P (Doble a Place), X3 (Triplo), X4 (Cuaterna), X5 (Quíntuplo), CAD (Cadena)
```

GAN/SEG/TER: máx 1 fila por tipo. SEG tiene 2 slots de pago (`POS_SLOTS={GAN:1,SEG:2,TER:3}`), TER tiene 3. La asociación caballo↔dividendo se deriva por JOIN contra `resultado_posiciones` (no se guarda `spc_id`).

### RPC `aplicar_resultado`

Función atómica que guarda posiciones + apuestas en una transacción, con optimistic locking sobre `resultados.updated_at`. Se llama con F10 en `resultados.html`. Parámetros: `p_resultado_id`, `p_expected_updated_at`, `p_carrera_id`, `p_estado`, `p_estado_pista`, `p_tiempo_ganador`, `p_incidentes`, `p_favorito_mandil`, `p_redistribucion_legs`, `p_posiciones` (JSON array), `p_apuestas` (JSON array).

---

## Glosario del dominio (turf)

| Término | Significado |
|---|---|
| **Gatera** | Cajón de largada (numero_partidor en DB): asignado por sorteo, puede tener huecos |
| **Mandil** | Número visible en el dorsal durante la carrera. Siempre 1..N consecutivo (= Chapa) |
| **Chapa** | Sinónimo de Mandil. Derivado de la gatera con renumerarChapas. No se persiste. |
| **Borrados** | Caballos que no corren: `forfait` (retirado) o `mal_inscrito` (fuera de condición) |
| **Ratificados** | Caballos confirmados para largar (`estado = 'ratificado'`) |
| **Marcador** | Editor del orden de llegada en `resultados.html` — se ingresa el mandil por posición |
| **Dividendos / Div** | Pagos del tote para cada tipo de apuesta. Se cargan en `resultado_apuestas`. |
| **Div a GAN** | Sección M.(F) / Sport de la UI — muestra chips de color SBARG por mandil |
| **Exacta (EX)** | El apostador acierta 1° y 2° en orden exacto |
| **Imperfecta (IM)** | El apostador acierta 1° y 2° en cualquier orden |
| **Trifecta (TR)** | Acertar 1°, 2° y 3° en orden exacto |
| **Cuatrifecta (CUAT)** | Acertar 1°, 2°, 3° y 4° en orden exacto |
| **Doble (X2)** | Acertar el ganador de 2 carreras consecutivas |
| **Cadena (CAD)** | Acertar el ganador en N carreras consecutivas |
| **SPC** | Sangre Pura de Carrera — ejemplar del Stud Book |
| **Sereno** | Cuidador nocturno de la caballeriza |
| **Peón / Capataz** | Personal de la caballeriza |
| **Vista Reducida** | Modo lectura de dividendos: GAN/SEG/TER en 3 columnas estilo papel |
| **Vista Detallada** | Modo lectura completo: posicionales + directas + combinadas |
| **Reunión activa** | UUID persistido en `localStorage.sgh_active_reunion_id`; resuelto por `active-reunion.js` |
| **Carta de llamados** | Documento oficial pre-carrera que lista los turnos con sus condiciones |
| **Estado pista** | Condición de la pista: seca / humeda / fangosa / pesada |
| **Chip** | Círculo con color SBARG que identifica a un caballo por su mandil o chapa |
| **K E S P** | Kilos / Edad / Sexo / Pelaje (en programa oficial, pendiente confirmar con Fede) |

---

## Convenciones de código

### Naming
- Archivos HTML: `minúscula-kebab-case.html` — GitHub Pages es case-sensitive
- Variables JS: `camelCase`
- Tablas Supabase: `snake_case`
- IDs: UUID generados por Supabase

### Patrón de cada archivo HTML
1. `DOCTYPE + meta + title`
2. Google Fonts (Playfair Display + DM Sans)
3. Supabase CDN script
4. `<style>` con CSS inline
5. `<body>` con HTML
6. `<script>` con: `SUPABASE_URL`, `SUPABASE_KEY`, `CLUB_ID`, `createClient`, `initAuth()`, lógica del módulo

### Paleta de colores (variables CSS)
```css
--verde:      #0e2318   /* fondo principal */
--verde-mid:  #163520
--verde-card: #1a3d26   /* fondo de cards */
--verde-borde:#245033   /* bordes */
--oro:        #c9a84c   /* acento dorado */
--oro-suave:  #e8d5a3
--crema:      #f5f0e8
--gris:       #8a9e90
--muted:      (var gris apagado)
--accent:     (var oro)
```

### Auth
```javascript
// En initAuth(), siempre:
.select('club_id, nombre_completo, rol')   // NO 'nombre', NO 'name'
// Roles: super_admin → admin.html | secretario_carreras → index.html
```

### Supabase MCP
El MCP de Supabase en esta sesión tiene **escritura** (DDL/DML): `apply_migration` (DDL), `execute_sql` (DML/consultas). NO es read-only. Verificado el 02/06/2026 (se aplicaron `ENABLE RLS` + la migración `liquidaciones_cd_propietario_derivacion.sql` directo por MCP). Aun así: usar `apply_migration` para DDL (queda como migración trackeada), preferir el archivo `.sql` versionado en `migrations/` como fuente de verdad, y documentar el SQL ejecutado en el doc/CHANGELOG correspondiente. El `get_advisors` puede pedir surfacear hallazgos de seguridad (p.ej. RLS) — hacerlo siempre.

### Dinero
Usar siempre `formatARS()` / `parseARS()` / `bindARSInput()` — NUNCA `.toLocaleString()` ni `.toFixed()` directo. El locale por defecto del browser suele ser en-US y da formato incorrecto (coma de miles vs punto de miles argentino).

### Marcador — validación visual de mandil
Cuando el mandil ingresado en el marcador de `resultados.html` no corresponde a un ratificado, el input recibe la clase `.marc-invalid` (borde rojo, fondo rojo suave). No bloquea la edición — es solo feedback visual. La celda de chapa del panel de dividendos queda `null` para ese slot, lo cual es semánticamente correcto (ese caballo no largó).

### Consultas Supabase
Nunca usar `.catch(()=>{})` silencioso. Siempre:
```javascript
.catch(err => { console.error('[contexto]', err); throw err; })
```

---

## Guard de sesión

Antes de cualquier operación de escritura sobre producción, verificar los tres:

```
pwd                          → /home/clio/dev/SGH
SELECT count(*) FROM spcs    → 181        (baseline al 2026-08-23)
ref del proyecto             → unlhcuanfrtpatoipwve
```

⚠️ El 181 **incluye caballos de prueba**: `spcs` es global sin `club_id` (GOTCHA #13) y los
ejemplares de test de "Mi Club Hípico" (`Pampa Libre`, `Don Facundo`) suman al conteo. Sirve para lo
que se usa —detectar proyecto equivocado— pero **no es el padrón real de Dolores**. GOTCHA #75,
ISSUE-061.

El baseline de `spcs` **cambia cada vez que se dan de alta o de baja ejemplares** — actualizarlo acá
cuando pase. Historial: 179 → 183 (tanda 5) → **181** (2026-08-23, se unificaron los dos pares de
duplicados: se borraron `Fist Queen` y `Malenuchi`, ver `docs/PLAN_DUPLICADOS_SPC.md`).

Los guards que aparecen dentro de los planes y bitácoras de `docs/` son **fotos de su fecha**, no el
baseline vigente: no se reescriben.

---

## Workflow de trabajo

- Ramas con prefijo: `feat/`, `fix/`, `chore/`. Única excepción: `reports`, sin prefijo ni barra (ver Protocolo de informes)
- Commits descriptivos en español o inglés (lo que ya se usa en el repo)
- No pedir confirmación intermedia para cambios chicos; mostrar diff antes de aplicar refactors grandes
- Si una decisión es de producto (no técnica), elegir la opción más conservadora y dejarla anotada en el resumen final
- **Antes de escribir sobre un archivo que ya existe, leerlo — aunque esté untracked.** Untracked significa "sin red", no "sin valor": si se sobrescribe, git no lo puede recuperar. Vale en particular para archivos que aparecen como `??` en `git status` al arrancar la sesión — pueden ser trabajo en curso de otra sesión
- Antes de dar por terminado: verificar con `grep` o `curl` que los cambios llegaron a prod
- Push frecuente — la sesión SSH al VPS Hetzner se puede cortar. Relevo por `.md` (el asesor lee de raw.githubusercontent.com); ver `docs/SERVER.md`

### Probes de regresión
Después de fixear un bug, agregar o extender un probe en `tests/` que verifique el fix contra prod:

```bash
set -a; . ./.env; set +a                  # exporta SUPABASE_SECRET_KEY
node tests/probe_pagos_rol_carrera.mjs    # rol y nº de carrera en el tab Pagos (48 asserts)
node tests/probe_edad_reglamentaria.mjs   # la regla del 1° de julio en el gate de inscripción
node tests/probe_no_largo.mjs             # "No corrió" persiste {posicion:null,no_largo:true}
node tests/probe_reunion_es_prueba.mjs    # ISSUE-055: reuniones.es_prueba fuera del circuito de cobro
```

**El patrón es código real sin browser.** Chromium no corre en este Ubuntu (`"Playwright does not support chromium on ubuntu26.04-x64"` — ver `docs/SERVER.md`), así que el probe **extrae del propio HTML** la función o el bloque a probar —por ancla, con balance de llaves—, lo corre con `new AsyncFunction(...)` inyectando dependencias reales (cliente Supabase con `SUPABASE_SECRET_KEY`, más stubs de DOM si hacen falta) y assertea contra la base. Nunca reimplementar la lógica dentro del test: si el archivo cambia, el probe corre el archivo cambiado. Para lo que escribe: **snapshot → run → assert → restore** en el `finally`.

Los pasos completos y los ejemplos de referencia están en **`tests/README.md`** (sección *Browser NO disponible — patrón de harness de código real*). No duplicar eso acá.

**Restore: verificar por ESTADO, no contando filas.** Un probe que borra sus fixtures y después
chequea "quedan N filas / 0 huérfanas" no verifica nada: las filas pueden estar todas y el
`estado_linea`/`recibo_id` estar todo mal (pasó el 2026-08-28, GOTCHA #77 / ISSUE-058). Usar
`tests/lib/estado_lineas.mjs`: `snapshotLineas` antes, `restaurarLineas` + `diffLineas` en el
`finally`, y **dos** asserts — uno de que quedó limpio, otro de que no hubo que restaurar nada.
Para recibos, `recibosDesde()` **sin filtro de club** (GOTCHA #76).

**Por qué así**: las variables internas de los módulos (`currentCarreraId`, `inscripciones`, `posicionesMap`, etc.) son `let` de módulo y no están expuestas en `window.*` — no hay estado interno que inspeccionar desde afuera. Los asserts van contra lo que el código **persiste en la DB** o contra el **texto del archivo**, no contra variables.

### Reunión activa para testing
Reunión 5 — 17/05/2026 — Hipódromo de Dolores (11 turnos, ~81 inscripciones).
Fijarla: `localStorage.setItem('sgh_active_reunion_id', 'UUID_REUNION_5')` o desde `reuniones.html` → botón 📍 Activar.

---

## Protocolo de informes

**Todo lo que yo tenga que leer va a un archivo, nunca al chat.** No sólo los informes,
diagnósticos y análisis: también las verificaciones sueltas, los resultados de probes, las
salidas de queries, `git status`, `git log`, los diffs, y cualquier cosa pedida como
"pegame la salida cruda".

- **"Pegame X" significa: escribí X en el archivo y pasame la ruta.** No es una excepción
  al protocolo, es el caso que lo motiva. La pantalla trunca siempre: lo que se pega en el
  chat llega cortado o se pierde, así que el chat no sirve como canal para salida cruda.
  Vale aunque el pedido diga literalmente "pegame", "mostrame" o "acá en el chat".
- Branch fija: `reports`. No se mergea ni se borra. Sin barra en el nombre.
- Ruta: `docs/diagnosticos/YYYY-MM-DD_slug.md`
- Encabezado del doc: fecha, SHA del commit, guards verificados.
- El doc es autocontenido: incluye el comando o la query **tal como se corrió**, la salida
  cruda **completa y sin recortar**, la conclusión, los números de resumen y las preguntas
  abiertas. Nada de `[...]` ni "(salida truncada)": si es larga, va larga.
- La respuesta en el chat es UNA línea: la ruta del archivo. Nada más.
  Ni resumen, ni conclusión, ni recomendaciones, ni "¿querés que...?".
- Si algo no está en el archivo, no existe.
- **El archivo no cuenta como entregado hasta que está pusheado a `origin`.** Un commit
  local es invisible: la ruta da 404 y el informe, para mí, no existe. Una ruta que no
  puedo leer es lo mismo que no tener informe.
- **Antes de pasarme la ruta, verificar con `git ls-remote` que ese commit está en
  `origin`** — no alcanza con que `git push` no haya tirado error:

  ```bash
  git push -u origin reports
  git ls-remote origin reports          # el SHA tiene que ser el de HEAD local
  git rev-parse HEAD                    # y coincidir con este
  ```

  La verificación va también en el archivo, como cualquier otra salida cruda.
- Lo mismo vale para las ramas de trabajo (`feat/`, `fix/`, `chore/`): si te paso una rama
  como referencia de algo que tengo que leer, pushearla primero.
- No mergear a `main` sin OK explícito.

---

## Deploy

- **URL prod**: `https://sigh.com.ar/` — dominio propio desde la migración (`CNAME` en la raíz del
  repo). `www.sigh.com.ar` redirige al apex. **Verificar siempre contra `sigh.com.ar`**, no contra
  `mdqclio.github.io/SGH/`: ese origen quedó del período anterior y puede servir contenido viejo.
  Ojo con la ruta: con dominio propio el sitio vive en la **raíz** (`sigh.com.ar/login.html`), no
  en el subdirectorio `/SGH/`. Ver `docs/PLAN_DOMINIO_SIGH_COM_AR.md`.
- **Método**: GitHub Pages "Deploy from branch" desde `main`. Sin workflow, sin build.
- **Tiempo**: ~15–60 s de build, pero el CDN puede tardar varios minutos más en servir la versión
  nueva. Si no se ven los cambios: `Ctrl+Shift+R` o `?v=N` en la URL. Para verificar de verdad,
  comparar el md5 contra el archivo del commit:
  ```bash
  curl -s "https://sigh.com.ar/<archivo>.html?v=$RANDOM" -o /tmp/prod.html
  git show <sha>:<archivo>.html > /tmp/local.html
  md5sum /tmp/local.html /tmp/prod.html   # tienen que coincidir
  ```
- **Flujo**:
  ```bash
  git add <archivos>
  git commit -m "tipo: descripción"
  git push origin main   # deploy automático
  ```

---

## Gotchas críticos

1. **GitHub Pages case-sensitive**: `Resultados.html ≠ resultados.html`. Siempre minúsculas.
2. **Supabase key**: usar la **publishable** `sb_publishable_...`. Las legacy `eyJ...` (anon/service_role) están DESACTIVADAS desde 2026-06-07 (401 "Legacy API keys are disabled"). Secret server-side = `sb_secret_...` por env, nunca en el repo.
3. **`usuarios.nombre_completo`** — NO `nombre`. Afecta todos los archivos con auth.
4. **`inscripciones.estado` es ENUM rígido** — para nuevos valores: `ALTER TYPE estado_inscripcion ADD VALUE`. No migrar a VARCHAR (hay una vista que depende del ENUM).
5. **`carreras.estado` es VARCHAR libre** — sin ENUM ni CHECK. Valores reales, medidos el **2026-08-27** sobre las 49 carreras de la base: `'abierta'` 31, `'anulada'` 7, `'confirmada'` 7, `'programada'` 3, `NULL` 1. Los conteos son una foto: si no dan, el listado quedó viejo — volver a medir con `SELECT estado, count(*) FROM carreras GROUP BY estado`.
   - El valor más común es **`'abierta'`**, que faltaba en la lista anterior de este gotcha. No significa "inscripción abierta": `carta-llamados.html` lo escribe en **toda** carrera que guarda, sin condición (ver `docs/AUTOREGISTRO_GATE_4.md`).
   - **Filtrar siempre NULL-safe.** `.neq()` solo **no** lo es: PostgREST lo traduce a `estado <> 'anulada'`, que para `NULL` da `NULL` y descarta la fila en silencio. Fue ISSUE-038 — se comía el turno 2 de R6 del programa. Patrón vigente en el repo:
     ```javascript
     .or('estado.is.null,estado.neq.anulada')   // programa-oficial.html:229, resultados.html:493
     ```
6. **`carrera_apuestas`** reemplaza `carreras.apuestas_habilitadas JSONB` (dropeada 27/05/2026). No usar `.select('apuestas_habilitadas')`.
7. **`renumerarChapas` usa filtro positivo**: `estado === 'ratificado'`, NO lista de exclusión negativa.
8. **`bindARSInput` requiere guard `_arsBound`** para no acumular listeners.
9. **Columnas GENERATED** (`total_neto` en liquidaciones, `monto_neto` en liquidacion_detalle) no se pueden incluir en INSERT/UPDATE — Postgres las calcula solas.
10. **RLS SECURITY DEFINER**: las funciones helper de RLS deben ser SECURITY DEFINER para evitar recursión infinita.
11. **ENUMs PostgreSQL**: solo `ADD VALUE IF NOT EXISTS` — nunca quitar valores.
12. **FK al borrar inscripciones**: primero borrar `resultado_posiciones`, luego `inscripciones`.
13. **SPCs son globales** (sin `club_id`). **Entrenadores y jockeys son per-hipódromo** (tienen `hipodromo_patente`).
14. **`propietarios.nombre`** — NO `nombre_completo` ni `razon_social`.
15. **`comisariato` está en `clubs`, NO en `reuniones`** (esa columna fue dropeada).

Ver `docs/GOTCHAS.md` para la lista completa (84 entradas).

---

## Bugs conocidos / decisiones pendientes

### resultados.html (ISSUE-020 al 025 — pendiente validación Fede)
- **ISSUE-020**: Chapa del ganador puede no coincidir entre marcador y Vista Detallada.
- **ISSUE-021**: Columna TER no aparece en Vista Reducida si `precio = 0` en `carrera_apuestas`.
- **ISSUE-022**: Monto vacío en "Div a GAN" aunque el valor esté guardado (`div_orig` vs campo incorrecto).
- **ISSUE-023**: UI para `div_inc` y `val_apu` no implementada.
- **ISSUE-024**: Sin UI para composición manual override en apuestas directas.
- **ISSUE-025**: Pozo, pozo asegurado y vales sin UI de carga.
- ✅ **Bug 2 (28/05/2026 — RESUELTO)**: `sportCells` / `mfCells` iteraban `m = 1..rowCount` (secuencial) en lugar de los mandiles reales de los inscriptos — starters con `mandil > rowCount` no tenían celda. Fix: iterar `activeInsc` ordenado por `numero_partidor`.
- ✅ **Bug 3 (28/05/2026 — RESUELTO)**: `renderDivHTML` usaba `chapaAt(slot)` donde `slot` es el índice de fila de pago — GAN/SEG/TER mostraban todos el chip del 1°. Fix: `chapaAt(POS_SLOTS[tipo])`. Además: Fix A — `onMarcInput` marca con `.marc-invalid` mandiles que no corresponden a un ratificado (feedback visual, no bloquea). Fix B — `renderDivView` recibe `undefined` (no `[]`) cuando el override está vacío; `onMarcInput` aplica `tempPos.length ? tempPos : undefined`.

### Otros módulos
- **liquidaciones.html**: estado real en `docs/ISSUES.md` (ISSUE-001) + gap vivo en `docs/LIQUIDACIONES_GAP_ANALYSIS.md`. Resumen: **Fase 0-2 + Fase C VIVAS** (merge `ccef143`, Fase C `7e638c7`); **incentivos montas** (jockey 50k/reunión, entrenador 10k/caballo — `47362ef`); **Fase 4 Pagos/recibos VIVO** — v1 buscador + RPC `emitir_recibo` (`1a50359`), v1.1 liberación **manual** del doping (RPC `liberar_linea`, pagable solo impago) + filtro carrera + búsqueda nombre/apellido/DNI (`4851129`); recibo con logo + firma (`154c83e`). **Fase 5 Resumen VIVO** (`4cc6c27`): buckets por estado + reconciliación + pendientes por beneficiario; **ampliada** (`f5a56c4`) con desglose por `concepto_tipo` + montas perdidas (informativo). **ISSUE-028 Apoderados CERRADO v1+v1.1** (tabla `apoderados` + UI en propietarios/profesionales + display read-only en Pagos). **des-oficializar carrera vía RPC** `desoficializar_carrera` (`61bd81d`). Bloqueante de datos: `inscripciones.propietario_id` 10/95 (GOTCHA #47); `spc_propietarios` 0. Pendientes: backfill propietarios, Fase 6 (validar A+B vs R5), **turno→carrera app-wide** (ISSUE-029; recibo ya hecho), confirmación de Fede sobre desglose/montas. **Reunión de prueba 9999 (PRUEBA RESUMEN) VIVA en Dolores — NO se borra** (decisión revertida el 2026-08-29): es el sandbox de los probes, marcada con `reuniones.es_prueba` y filtrada del buscador de Pagos. `teardown_prueba_resumen_9999.sql` queda sin usar.
- **portal.html / registro-profesional.html**: no construidos.
- **ISSUE-018**: XSS — `innerHTML` con datos de DB sin escapar en varios módulos.
- **ISSUE-007**: Calendario puede mostrar N-1 reuniones (bug de timezone).
- **cantidad_gateras** no se carga en el alta de hipódromo (queda en DEFAULT 12).

### Pendiente confirmar con Fede
- Formato K E S P en programa oficial.
- Campos `div_inc`, `val_apu`, `pozo`, `vales` — ¿los usa Dolores?
- Página 4.4 del programa oficial (combos: Triplo, Cuaterna, Doble).
- Cargar datos de sponsor destacado, secretaría y teléfono en Admin → Mi Hipódromo para Dolores.
