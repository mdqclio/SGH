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
│   └── SCHEMA.md                Schema extendido (copia con más detalle)
├── tests/                       Probes Playwright contra prod (headless Chromium)
│   ├── README.md                Instrucciones de ejecución
│   ├── smoke_full.mjs           Suite completa T1–T17 (ciclo completo resultados.html)
│   ├── smoke_t9_t16.mjs         Regresión bug 3b + optimistic lock
│   ├── probe_bug2_mf_mandiles.mjs  Regresión Bug 2 (mandiles reales en M.(F)/Sport)
│   ├── probe_bug3_chapa_at.mjs  Regresión Bug 3 + Fix A (marc-invalid) + Fix B (posicionesMap)
│   ├── probe_nav_dirty.mjs      Navegación con cambios sin guardar
│   ├── probe_tiempo_ganador.mjs Carga de tiempo ganador
│   └── probe_estado_pista.mjs   Estado de pista
```

---

## Accesos y credenciales

```javascript
SUPABASE_URL  = 'https://unlhcuanfrtpatoipwve.supabase.co'
SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'  // legacy anon key
CLUB_ID_DOLORES = '0649e9c5-9e87-4aad-842f-101458e6b33c'
```

**CRÍTICO:** Usar siempre la key `eyJ...` (Settings → API → "Legacy anon, service_role API keys"). La key `sb_publishable_...` da error 400 en consultas REST.

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

## Workflow de trabajo

- Ramas con prefijo: `feat/`, `fix/`, `chore/`
- Commits descriptivos en español o inglés (lo que ya se usa en el repo)
- No pedir confirmación intermedia para cambios chicos; mostrar diff antes de aplicar refactors grandes
- Si una decisión es de producto (no técnica), elegir la opción más conservadora y dejarla anotada en el resumen final
- Antes de dar por terminado: verificar con `grep` o `curl` que los cambios llegaron a prod
- Push frecuente — el codespace se puede dormir

### Probes de regresión
Después de fixear un bug en `resultados.html`, agregar o extender un probe en `tests/` que verifique el fix contra prod:
```bash
node tests/probe_bug2_mf_mandiles.mjs   # Bug 2 — mandiles reales en M.(F)/Sport
node tests/probe_bug3_chapa_at.mjs      # Bug 3 — chapaAt + Fix A/B
```
El patrón está en `tests/probe_bug2_*.mjs`: auth con magic link → nav → DOM assertions vía Playwright.

**Limitación crítica**: las variables internas de `resultados.html` (`currentCarreraId`, `inscripciones`, `posicionesMap`, etc.) son `let` de módulo y no están expuestas en `window.*`. Los probes deben basarse en evidencia DOM observable, no en estado interno JS.

### Reunión activa para testing
Reunión 5 — 17/05/2026 — Hipódromo de Dolores (11 turnos, ~81 inscripciones).
Fijarla: `localStorage.setItem('sgh_active_reunion_id', 'UUID_REUNION_5')` o desde `reuniones.html` → botón 📍 Activar.

---

## Deploy

- **URL prod**: `https://mdqclio.github.io/SGH/`
- **Método**: GitHub Pages "Deploy from branch" desde `main`. Sin workflow, sin build.
- **Tiempo**: ~15–60 s después del push. Si no se ven los cambios: `Ctrl+Shift+R` o `?v=N` en la URL.
- **Flujo**:
  ```bash
  git add <archivos>
  git commit -m "tipo: descripción"
  git push origin main   # deploy automático
  ```

---

## Gotchas críticos

1. **GitHub Pages case-sensitive**: `Resultados.html ≠ resultados.html`. Siempre minúsculas.
2. **Supabase anon key**: usar `eyJ...` (legacy). La `sb_publishable_...` da error 400.
3. **`usuarios.nombre_completo`** — NO `nombre`. Afecta todos los archivos con auth.
4. **`inscripciones.estado` es ENUM rígido** — para nuevos valores: `ALTER TYPE estado_inscripcion ADD VALUE`. No migrar a VARCHAR (hay una vista que depende del ENUM).
5. **`carreras.estado` es VARCHAR libre** — sin ENUM. Valores en uso: `NULL/'programada'`, `'confirmada'`, `'anulada'`.
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

Ver `docs/GOTCHAS.md` para la lista completa (40 entradas).

---

## Bugs conocidos / decisiones pendientes

### resultados.html (ISSUE-020 al 025 — pendiente validación Fede)
- **ISSUE-020**: Chapa del ganador puede no coincidir entre marcador y Vista Detallada.
- **ISSUE-021**: Columna TER no aparece en Vista Reducida si `precio = 0` en `carrera_apuestas`.
- **ISSUE-022**: Monto vacío en "Div a GAN" aunque el valor esté guardado (`div_orig` vs campo incorrecto).
- **ISSUE-023**: UI para `div_inc` y `val_apu` no implementada.
- **ISSUE-024**: Sin UI para composición manual override en apuestas directas.
- **ISSUE-025**: Pozo, pozo asegurado y vales sin UI de carga.
- ✅ **Bug 2 (28/05/2026 — RESUELTO)**: `sportCells` / `mfCells` iteraban `m = 1..rowCount` (secuencial) en lugar de los mandiles reales de los inscriptos — starters con `mandil > rowCount` no tenían celda. Fix: iterar `activeInsc` ordenado por `numero_partidor`. Probe: `tests/probe_bug2_mf_mandiles.mjs`.
- ✅ **Bug 3 (28/05/2026 — RESUELTO)**: `renderDivHTML` usaba `chapaAt(slot)` donde `slot` es el índice de fila de pago — GAN/SEG/TER mostraban todos el chip del 1°. Fix: `chapaAt(POS_SLOTS[tipo])`. Además: Fix A — `onMarcInput` marca con `.marc-invalid` mandiles que no corresponden a un ratificado (feedback visual, no bloquea). Fix B — `renderDivView` recibe `undefined` (no `[]`) cuando el override está vacío; `onMarcInput` aplica `tempPos.length ? tempPos : undefined`. Probe: `tests/probe_bug3_chapa_at.mjs`.

### Otros módulos
- **liquidaciones.html**: ver `docs/ISSUES.md` (ISSUE-001) para el estado real. Resumen: Fase 0 (schema C+D) vigente en prod; Fase 1 (config por club) y Fase 2 (fondo solidario, bono 6-8, incentivos) en branch `feat/liquidaciones-cd`, NO en prod. Bloqueante conocido: `inscripciones.propietario_id` null (no se liquida propietario ni bono 6-8 — GOTCHA #47). Pendientes: oficializar reunión, recibos, anti-doping, validación Fede.
- **portal.html / registro-profesional.html**: no construidos.
- **ISSUE-018**: XSS — `innerHTML` con datos de DB sin escapar en varios módulos.
- **ISSUE-007**: Calendario puede mostrar N-1 reuniones (bug de timezone).
- **cantidad_gateras** no se carga en el alta de hipódromo (queda en DEFAULT 12).

### Pendiente confirmar con Fede
- Formato K E S P en programa oficial.
- Campos `div_inc`, `val_apu`, `pozo`, `vales` — ¿los usa Dolores?
- Página 4.4 del programa oficial (combos: Triplo, Cuaterna, Doble).
- Cargar datos de sponsor destacado, secretaría y teléfono en Admin → Mi Hipódromo para Dolores.
