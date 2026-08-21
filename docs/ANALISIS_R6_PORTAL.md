# Análisis R6 (20/06/2026) — ¿A quién le damos cuenta primero en el portal?

**Fecha del análisis:** 01/08/2026
**Alcance:** SOLO LECTURA. No se modificó ningún dato ni schema.
**Proyecto Supabase:** `unlhcuanfrtpatoipwve`
**Guard verificado:** `pwd = /home/clio/dev/SGH`, `SELECT count(*) FROM spcs` → **144** ✅

**Reunión analizada:** R6 — `b02ca761-6f44-4720-86aa-a3c3099019ea` — 20/06/2026 — Hipódromo de Dolores — estado `publicada` — 11 carreras — **125 inscripciones** — 112 SPCs distintos.

> Es la única reunión de Dolores con inscripciones reales cargadas. R7 (19/07) está `cancelada` con 0 inscripciones y R8 (16/08) `publicada` con 0. La reunión 9999 (PRUEBA RESUMEN, 17 inscripciones) queda **excluida** de todos los conteos.

---

## TL;DR

| | Entrenadores | Propietarios |
|---|---|---|
| Inscripciones de R6 alcanzables | **121 / 125 (96,8 %)** | **30 / 125 (24,0 %)** |
| Entidades distintas | 59 | 20 (22 contando copropietarios) |
| Cuentas para cubrir el 80 % de las 125 | **38** | **imposible** (techo = 30 insc = 24 %) |
| Emails cargados | **0 / 59** | **0 / 20** |

**Recomendación: entrenadores.** Es la única vía con cobertura de datos suficiente para que el portal muestre algo. El portal del propietario hoy le mostraría pantalla vacía al 76 % de las inscripciones de R6.

**Pero hay dos bloqueantes que aplican a cualquiera de las dos opciones:**

1. **Cero emails reales.** Los 18 emails que existen en la base son fixtures de demo (`@hipica.com`, `@mail.com`) y **ninguno** pertenece a un participante de R6. Sin campaña de carga de contacto no se puede invitar a nadie.
2. **`portal.html` usa `.single()` sobre `email` en tablas sin índice único.** No rompe hoy (0 duplicados), pero nada en la DB lo impide. Ver §4.3.

---

## 1. ¿Hay trazabilidad de quién originó la inscripción?

**Sí, el schema lo tiene previsto — pero está 100 % vacío.**

Esquema real de `public.inscripciones` (24 columnas):

| # | Columna | Tipo | Null | Default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `uuid_generate_v4()` |
| 2 | `carrera_id` | uuid | NO | — |
| 3 | `spc_id` | uuid | NO | — |
| 4 | `propietario_id` | uuid | SÍ | — |
| 5 | `entrenador_id` | uuid | SÍ | — |
| 6 | `jockey_titular_id` | uuid | SÍ | — |
| 7 | `jockey_suplente_id` | uuid | SÍ | — |
| 8 | `numero_partidor` | integer | SÍ | — |
| 9 | `peso_declarado` | numeric | SÍ | — |
| 10 | `peso_final` | numeric | SÍ | — |
| 11 | `estado` | `estado_inscripcion` | NO | `'pre_inscripto'` |
| 12 | **`canal`** | **`canal_inscripcion`** | **NO** | **`'manual'`** |
| 13 | `motivo_estado` | varchar | SÍ | — |
| 14 | `info_adicional` | text | SÍ | — |
| 15 | **`inscripto_por`** | **uuid → `usuarios.id`** | **SÍ** | — |
| 16 | **`ratificado_por`** | **uuid → `usuarios.id`** | **SÍ** | — |
| 17 | `created_at` | timestamptz | NO | `now()` |
| 18 | `updated_at` | timestamptz | NO | `now()` |
| 19 | `caballeriza_id` | uuid | SÍ | — |
| 20 | `peon` | varchar | SÍ | — |
| 21 | `capataz` | varchar | SÍ | — |
| 22 | `sereno` | varchar | SÍ | — |
| 23 | `certificado_correr` | boolean | SÍ | `false` |
| 24 | `peso_balanza` | numeric | SÍ | — |

Los tres campos relevantes:

- **`canal`** — ENUM `canal_inscripcion` con valores `manual` (1), `web` (2), `app` (3). Ya está diseñado para distinguir alta por secretaría vs. alta por portal.
- **`inscripto_por`** — FK a `usuarios(id)` (`inscripciones_inscripto_por_fkey`). Identifica al usuario que dio de alta.
- **`ratificado_por`** — FK a `usuarios(id)` (`inscripciones_ratificado_por_fkey`).

**Estado real en R6:**

| Campo | Valor |
|---|---|
| `canal = 'manual'` | **125 / 125 (100 %)** |
| `canal = 'web'` | 0 |
| `canal = 'app'` | 0 |
| `inscripto_por` NOT NULL | **0 / 125** |
| `ratificado_por` NOT NULL | **0 / 125** |
| usuarios distintos en `inscripto_por` | **0** |

### Lectura para el diseño

El modelo de atribución **ya existe y no hay que inventarlo** — `canal` + `inscripto_por` son exactamente lo que el portal necesita para distinguir "esto lo cargó la secretaría" de "esto lo cargó el entrenador desde su cuenta".

Lo que no existe es el **dato**: hoy nadie escribe `inscripto_por`, ni siquiera desde `inscripciones.html` con un secretario logueado. Consecuencias:

- No hay evidencia histórica de quién viene cargando qué. No se puede usar R6 para inferir "estos N ya operan solos".
- Cuando el portal empiece a escribir (`canal='web'` + `inscripto_por=<uuid>`), R6 queda como línea de base 100 % manual — sirve como *before* limpio para medir adopción.
- **Deuda a cerrar antes del portal:** hacer que `inscripciones.html` popule `inscripto_por` en el alta manual. Si no, el día 1 del portal la mitad del set tiene atribución y la otra mitad no, y no se distingue "cargado por secretaría" de "cargado antes de que existiera el campo".

Complemento: `usuarios` tiene `entidad_tipo` (varchar) y `entidad_id` (uuid) — el gancho previsto para vincular una cuenta a un `propietario` o `profesional`. El ENUM `rol_usuario` ya incluye `profesional`, `propietario` y `publico`. **Estado: 3 usuarios en la base (super_admin, secretario_carreras, operador), los 3 con `entidad_tipo` y `entidad_id` en NULL.** El andamiaje está; no hay una sola cuenta de portal creada.

---

## 2. Inscripciones de R6 — conteos base

| Métrica | Valor |
|---|---|
| **Total de inscripciones** | **125** |
| SPCs distintos | 112 |
| **Entrenadores distintos vía `spcs.entrenador_id`** | **0** ⚠️ |
| Entrenadores distintos vía `inscripciones.entrenador_id` | **59** |
| **Propietarios distintos vía `spc_propietarios` activo** | **0** ⚠️ |
| Propietarios distintos vía `inscripciones.propietario_id` | **20** |
| Propietarios distintos vía `caballeriza_responsables` activo | 22 |
| **Caballerizas distintas** | **85** |
| Inscripciones **sin entrenador** identificable (ninguna vía) | **4** |
| Inscripciones **sin propietario** identificable (ninguna vía) | **95** |
| Inscripciones sin caballeriza | 1 |

### Las dos vías que el enunciado propone están muertas

**`spcs.entrenador_id` → 0 filas cargadas.** No es un problema de R6: la columna está en NULL en **144/144 SPCs de toda la base**, y también `spcs.caballeriza_id` (0/144). El entrenador vive exclusivamente en `inscripciones.entrenador_id`, que sí está cargado en **121/125 (96,8 %)**.

**`spc_propietarios` → la tabla tiene 0 filas.** Cero, en toda la base. La única vía de propietario es `inscripciones.propietario_id`, cargado en **30/125 (24 %)** — consistente con GOTCHA #47.

Se probó una tercera vía para propietarios: `caballeriza_responsables` (219 filas, 214 con `propietario_id`, cubre 201 de 276 caballerizas). Pero para R6 **no aporta nada nuevo**: de las 85 caballerizas de R6 sólo 20 tienen responsable cargado, y esas 20 corresponden exactamente a las **mismas 30 inscripciones** que ya tienen `propietario_id` directo (intersección = 30, unión = 30). Sube el conteo de personas de 20 a 22 (copropietarios) pero no gana ni una inscripción de cobertura.

**Conclusión operativa:** el entrenador es identificable en el 96,8 % de R6; el propietario, en el 24 %.

---

## 3. Concentración

### 3.1 Entrenadores — top 10 (vía `inscripciones.entrenador_id`)

Base: 121 inscripciones atribuidas de 125 totales.

| # | Entrenador | Insc. | Acum. | % de 125 |
|---|---|---:|---:|---:|
| 1 | BRIGANTI, MARIA LAURA | 13 | 13 | 10,4 % |
| 2 | PALLET, GUIDO | 5 | 18 | 14,4 % |
| 3 | TOLEDO, MARIA ELENA | 5 | 23 | 18,4 % |
| 4 | TRUPPA, ROBERTO | 5 | 28 | 22,4 % |
| 5 | BOLONTI, ROBERTO | 4 | 32 | 25,6 % |
| 6 | DIESTRA, CLAUDIO MAXIMILIANO | 4 | 36 | 28,8 % |
| 7 | ALDECOA, IVAN | 3 | 39 | 31,2 % |
| 8 | ANRIQUEZ, GERONIMO FERNANDO | 3 | 42 | 33,6 % |
| 9 | CANTO, TOMAS | 3 | 45 | 36,0 % |
| 10 | CONSTANCIO, ALEXIS | 3 | 48 | **38,4 %** |

> Hay empate en 3 inscripciones: CUEVAS (CESAR DANIEL), GIMENEZ (MARCOS EZEQUIEL) y TEDESCHI (ALEJANDRO) también tienen 3 y quedaron fuera del top 10 sólo por desempate alfabético. El corte del top 10 es arbitrario en el borde.

**Distribución completa (59 entrenadores):**

| Insc. por entrenador | Cantidad de entrenadores |
|---:|---:|
| 13 | 1 |
| 5 | 3 |
| 4 | 2 |
| 3 | 7 |
| 2 | 18 |
| **1** | **28** |

- **Cola larga: 28 de 59 entrenadores (47,5 %) tienen 1 sola inscripción.** Sumados con los de 2, son 46 de 59 (78 %) con ≤2 inscripciones.
- **Cuentas para cubrir el 80 %:**
  - de las 121 atribuidas → **35 cuentas**
  - de las 125 totales → **38 cuentas**

### 3.2 Propietarios — top 10 (vía `inscripciones.propietario_id`)

Base: 30 inscripciones atribuidas de 125 totales.

| # | Propietario | Insc. | Acum. | % de 30 | % de 125 |
|---|---|---:|---:|---:|---:|
| 1 | PALLET, GUIDO | 4 | 4 | 13,3 % | 3,2 % |
| 2 | PEREYRA, ROBERTO CARLOS | 3 | 7 | 23,3 % | 5,6 % |
| 3 | CARLI, ORNELA | 2 | 9 | 30,0 % | 7,2 % |
| 4 | CIMA, JUAN CARLOS | 2 | 11 | 36,7 % | 8,8 % |
| 5 | CUEVAS, CESAR DANIEL | 2 | 13 | 43,3 % | 10,4 % |
| 6 | DIESTRA, CAMILA AYLEN | 2 | 15 | 50,0 % | 12,0 % |
| 7 | GAINLE, JOSE MARIA | 2 | 17 | 56,7 % | 13,6 % |
| 8 | AFFOLTER, EMILIANO MATIAS | 1 | 18 | 60,0 % | 14,4 % |
| 9 | ALDECOA, IVAN LUCIANO | 1 | 19 | 63,3 % | 15,2 % |
| 10 | AZURI, SANTIAGO DAMIAN | 1 | 20 | 66,7 % | **16,0 %** |

> Del puesto 8 en adelante todos tienen 1 inscripción — el orden es alfabético, no significativo.

**Distribución completa (20 propietarios):** 1 con 4, 1 con 3, 5 con 2, **13 con 1 sola (65 %)**.

- **Cuentas para cubrir el 80 %:**
  - de las 30 atribuidas → **14 cuentas**
  - de las 125 totales → **imposible.** Aunque se den de alta los 20 propietarios conocidos, el techo es 30 inscripciones = **24 % de la reunión**. No existe un número de cuentas de propietario que alcance el 80 % con los datos actuales.

### 3.3 Caballerizas (referencia — tercera unidad de agrupación posible)

85 caballerizas distintas cubren 124/125 inscripciones. Pero están aún más atomizadas: la más grande tiene **5** inscripciones, **60 de 85 (70,6 %) tienen 1 sola**, y hacen falta **61 cuentas** para el 80 %. Como unidad de onboarding es peor que el entrenador.

### 3.4 Lectura

Ninguna de las tres unidades tiene una cabeza chica y gorda. El mejor caso (entrenador) sigue necesitando **~38 cuentas** para el 80 % de la reunión. No hay atajo de "damos 5 cuentas y cubrimos la reunión".

Lo que sí existe es un **piloto natural**: BRIGANTI (13 insc., 10,4 % sola) + los 5 siguientes = **6 cuentas → 36 inscripciones → 28,8 %**. Es un arranque razonable para validar el flujo con gente que tiene volumen suficiente para que el portal les ahorre trabajo de verdad.

**Solapamiento entrenador↔propietario:** de los 59 entrenadores de R6, sólo 22 tienen `documento_nro` cargado, y de esos **10 existen también como fila en `propietarios` con el mismo DNI** (PALLET, CUEVAS, GAINLE, MARTINEZ, DI FRANCO, DIAZ, DUARTE, AZURI, ALDECOA, entre otros — varios aparecen en ambos top 10). Es un **piso**, no un total: con 37 entrenadores sin DNI el solapamiento real es mayor. Implicancia de diseño: en Dolores el entrenador y el propietario son con frecuencia la misma persona física, así que **una cuenta por persona con múltiples roles** probablemente sea mejor modelo que dos portales separados — y refuerza empezar por el entrenador, porque esa cuenta ya trae el rol de propietario puesto en muchos casos.

---

## 4. Cruce con datos de contacto — BLOQUEANTE

### 4.1 Cobertura de email

| Población | Con email | Total | % |
|---|---:|---:|---:|
| **Entrenadores de R6** | **0** | 59 | **0 %** |
| **Propietarios de R6** (vía `inscripciones.propietario_id`) | **0** | 20 | **0 %** |
| Propietarios de R6 (vía `caballeriza_responsables`) | 0 | 22 | 0 % |
| — | | | |
| `propietarios` (tabla completa) | 7 | 220 | 3,2 % |
| `profesionales` (tabla completa) | 11 | 167 | 6,6 % |
| `profesionales` con `tipo = 'entrenador'` | 5 | 125 | 4,0 % |

**Los 18 emails que existen en la base son fixtures de demo y ninguno participa de R6.** Los 11 de `profesionales` son 5 entrenadores + 6 jockeys con dominio `@hipica.com` (Gaitán, Labanca, Leguizamón, Peralta, Blanco, Cabrera, Méndez, Ramírez, Suárez) más `[EMAIL REDACTADO]`. Los 7 de `propietarios` son `@mail.com` (Bemberg, Haras El Ombu, Bullrich, Anchorena, Sánchez Alzaga, Los Potreros) más `clio@mdq.com.ar`. Se verificó uno por uno: **`en_r6 = false` en los 18**.

**Cobertura efectiva de email para invitar a alguien de R6: 0 %, por ambas vías.** El portal no puede arrancar con invitación por email sin una campaña previa de carga de contacto.

### 4.2 Otros canales de contacto

| Población | Con teléfono | Con documento |
|---|---:|---:|
| `propietarios` (220) | 7 (3,2 %) | **220 (100 %)** |
| `profesionales` (167) | 17 (10,2 %) | 103 (61,7 %) |
| `profesionales` tipo entrenador (125) | 8 (6,4 %) | 87 (69,6 %) |
| Entrenadores de R6 (59) | — | 22 (37,3 %) |

El teléfono está tan vacío como el email. **El único identificador con cobertura seria es `documento_nro` en `propietarios` (100 %)** — que es justo la población con peor cobertura de inscripciones. Los entrenadores de R6 tienen DNI en sólo 22/59 (37,3 %).

Implicancia: si se quiere un alta por auto-registro validado contra un dato que la secretaría ya tenga, el DNI del propietario es el único campo confiable hoy. Para entrenadores hay que cargar DNI o email a mano en ~37 personas antes de poder validar nada.

### 4.3 Emails repetidos y el `.single()` de `portal.html`

**Duplicados hoy: cero.**

| Chequeo | Duplicados |
|---|---:|
| Emails repetidos dentro de `propietarios` | **0** |
| Emails repetidos dentro de `profesionales` | **0** |
| Mismo email en `propietarios` y `profesionales` | **0** |
| Emails repetidos en `usuarios` | **0** |

Es un resultado poco tranquilizador: con 7 y 11 emails cargados, la ausencia de duplicados no prueba nada sobre el comportamiento a escala.

**Lo que sí es estructural — la DB no impide el duplicado.** Índices únicos existentes:

| Tabla | Índice único | Cubre email? |
|---|---|---|
| `propietarios` | `propietarios_pkey (id)` | no |
| `propietarios` | `ux_propietarios_club_doc (club_id, documento_tipo, documento_nro) WHERE documento_nro IS NOT NULL` | no |
| `profesionales` | `profesionales_pkey (id)` | no |
| `usuarios` | `usuarios_pkey (id)` | no |
| `usuarios` | `usuarios_club_id_email_key (club_id, email)` | **parcial** |

**No hay ningún índice único sobre `email` en `propietarios` ni en `profesionales`.** Nada impide cargar dos filas con el mismo mail.

Las tres consultas de `portal.html` que dependen de esto:

```javascript
// portal.html:312
const { data: usr } = await sb.from('usuarios')
  .select('club_id,nombre_completo,rol,estado').eq('email', session.user.email).single();

// portal.html:325
const { data: prop } = await sb.from('propietarios')
  .select('id').eq('email', session.user.email).single();

// portal.html:328
const { data: prof } = await sb.from('profesionales')
  .select('id').eq('email', session.user.email).eq('tipo', 'entrenador').single();
```

Tres riesgos distintos:

1. **`propietarios` (325) y `profesionales` (328)** — sin unique index. Un duplicado cargado por la secretaría rompe el login con `PGRST116` (*JSON object requested, multiple rows returned*). Es cuestión de tiempo: cuando se carguen emails en masa, un stud con dos filas o un entrenador dado de alta dos veces alcanza.
2. **`usuarios` (312)** — el unique es `(club_id, email)`, **no `email` solo**, y la query **no filtra por club**. El mismo mail en dos hipódromos es legal en la DB y rompe esta línea. Hoy hay 3 usuarios en un solo club, así que no se manifiesta — pero SGH es multi-tenant por diseño y un entrenador que corre en Dolores y en otro hipódromo es el caso normal, no el borde.
3. **El caso inverso también falla**: `.single()` tira error cuando hay **0 filas**, no sólo cuando hay 2. Un usuario de Auth sin fila correspondiente en `propietarios`/`profesionales` — o sea, hoy, cualquiera — rompe el portal en vez de ver un mensaje.

**Mitigaciones (no aplicadas — este análisis es solo lectura):**
- Cambiar los tres `.single()` por `.maybeSingle()` y manejar el caso vacío. Resuelve el punto 3 y degrada con gracia el 1, pero con duplicados `maybeSingle()` **también** tira error — no alcanza solo.
- Agregar `.eq('club_id', CLUB_ID)` en la query de `usuarios` (línea 312) para alinearla con el unique index real.
- Índice único parcial sobre email antes de la campaña de carga, p. ej.:
  `CREATE UNIQUE INDEX ux_propietarios_club_email ON propietarios (club_id, lower(btrim(email))) WHERE email IS NOT NULL AND btrim(email) <> '';`
  y equivalente en `profesionales`. Conviene crearlo **antes** de cargar emails: después implica limpiar duplicados ya existentes.
- A futuro, la vía robusta es resolver la identidad por `usuarios.entidad_tipo` + `usuarios.entidad_id` (que ya existen y tienen PK única) en lugar de matchear por email.

---

## 5. `spcs.entrenador_id` — cargados vs NULL

| Población | Con `entrenador_id` | NULL | Total |
|---|---:|---:|---:|
| SPCs de R6 | **0** | **112** | 112 |
| SPCs (toda la base) | **0** | **144** | 144 |

**El 100 % está en NULL.** Lo mismo `spcs.caballeriza_id`: 0/144.

**Respuesta directa a la pregunta:** sí, un portal de entrenador que liste "mis caballos" haciendo `spcs.select().eq('entrenador_id', miId)` devuelve **cero filas para todos los entrenadores, siempre**. Pantalla vacía garantizada.

La relación entrenador↔caballo no es inexistente — está en `inscripciones.entrenador_id` (121/125 en R6) y en `inscripciones.caballeriza_id` (124/125). Es una relación **por inscripción**, no una tenencia estable del ejemplar.

Dos caminos:

- **(a) Derivar del histórico.** "Mis caballos" = SPCs que el entrenador inscribió alguna vez. Funciona hoy sin migración y con 96,8 % de cobertura en R6. Contra: no existe el caballo que todavía no corrió — justo el que el entrenador querría inscribir la primera vez desde el portal.
- **(b) Backfill de `spcs.entrenador_id`** desde la inscripción más reciente de cada SPC. Cubriría los 112 SPCs de R6 (de 144 totales; quedan 32 sin inscripciones de las cuales derivar). Requiere decidir qué pasa cuando un caballo cambia de entrenador — hoy `spcs` no tiene historial, mientras que `spc_propietarios` (vacía) sí tiene `fecha_desde`/`fecha_hasta`/`activo` para el lado del propietario.

Esta decisión es previa a construir el portal del entrenador: define si "mis caballos" es una consulta derivada o un campo persistido.

---

## 6. Síntesis para la decisión

**Empezar por entrenadores.** Razones, en orden:

1. **Cobertura:** 121/125 (96,8 %) vs. 30/125 (24 %). El portal del propietario le mostraría pantalla vacía al 76 % de las inscripciones de R6. No es una diferencia de grado.
2. **Techo:** no hay número de cuentas de propietario que llegue al 80 % de la reunión — el máximo alcanzable es 24 %. Con entrenadores, 38 cuentas lo logran.
3. **Rol combinado:** al menos 10 de los 59 entrenadores de R6 ya son también propietarios (piso medido por DNI, con sólo 22/59 DNIs cargados). Empezar por el entrenador captura parte del caso propietario de arrastre.
4. **Incentivo:** el entrenador inscribe todas las semanas; el propietario chico mira resultados. El primero tiene motivo real para entrar al portal.

**Antes de invitar a nadie hay que cerrar tres cosas:**

| # | Bloqueante | Estado | Alcance |
|---|---|---|---|
| 1 | **Contacto** — 0/59 entrenadores de R6 con email, 0/59 con teléfono útil | Bloqueante duro | Campaña de carga. Si se apunta al 80 % con 38 cuentas, son 38 emails; para el piloto de 6 cuentas (28,8 % de la reunión), 6. |
| 2 | **`portal.html` `.single()`** en 3 líneas (312, 325, 328) sobre columnas sin unique index; además falla con 0 filas | Rompe hoy con cualquier usuario sin fila espejo | §4.3 — `maybeSingle()` + `club_id` en la query de `usuarios` + índices únicos parciales antes de la carga masiva |
| 3 | **"Mis caballos"** — `spcs.entrenador_id` 0/144 | Pantalla vacía garantizada | §5 — decidir entre derivar de `inscripciones` o backfillear `spcs` |

**Deuda adicional a agendar (no bloquea el arranque):**

- `inscripciones.inscripto_por` nunca se escribe. Poblarlo desde `inscripciones.html` **antes** del portal, para que la atribución sea legible desde el día 1.
- `spc_propietarios` está vacía (0 filas) y `inscripciones.propietario_id` cubre 30/125. Es el backfill de propietarios ya identificado en GOTCHA #47 / ISSUE-001; es también la precondición para que el portal del propietario sea viable en algún momento.
- `usuarios.entidad_tipo` / `entidad_id` sin uso (0/3). Es el vínculo cuenta↔entidad correcto y evita el matcheo por email de §4.3.

---

## Apéndice — Consultas usadas

Todas de solo lectura, ejecutadas contra `unlhcuanfrtpatoipwve` vía MCP `execute_sql`.

```sql
-- Guard
SELECT count(*) FROM spcs;                     -- 144

-- Identificación de R6
SELECT r.id, r.numero, r.fecha, r.estado::text, c.nombre,
       (SELECT count(*) FROM carreras ca WHERE ca.reunion_id = r.id) AS carreras,
       (SELECT count(*) FROM inscripciones i
          JOIN carreras ca ON ca.id = i.carrera_id
         WHERE ca.reunion_id = r.id) AS inscripciones
FROM reuniones r JOIN clubs c ON c.id = r.club_id
ORDER BY r.fecha;

-- §1 Esquema y atribución
SELECT ordinal_position, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'inscripciones'
ORDER BY ordinal_position;

SELECT t.typname, e.enumlabel, e.enumsortorder
FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
WHERE t.typname IN ('canal_inscripcion','estado_inscripcion','rol_usuario')
ORDER BY t.typname, e.enumsortorder;

-- §2 Conteos base
WITH r6 AS (
  SELECT i.id, i.spc_id, i.entrenador_id AS ins_ent, i.propietario_id AS ins_prop, i.caballeriza_id
  FROM inscripciones i JOIN carreras c ON c.id = i.carrera_id
  WHERE c.reunion_id = 'b02ca761-6f44-4720-86aa-a3c3099019ea'
), j AS (
  SELECT r6.*, s.entrenador_id AS spc_ent, s.caballeriza_id AS spc_cab,
         (SELECT count(*) FROM spc_propietarios sp
           WHERE sp.spc_id = r6.spc_id AND sp.activo) AS n_prop_act
  FROM r6 JOIN spcs s ON s.id = r6.spc_id
)
SELECT count(*) AS total_insc,
       count(DISTINCT spc_id) AS spcs_distintos,
       count(DISTINCT spc_ent) AS ent_via_spcs,
       count(DISTINCT ins_ent) AS ent_via_insc,
       count(*) FILTER (WHERE spc_ent IS NULL AND ins_ent IS NULL) AS sin_entrenador,
       count(*) FILTER (WHERE n_prop_act = 0 AND ins_prop IS NULL) AS sin_propietario,
       count(DISTINCT COALESCE(caballeriza_id, spc_cab)) AS caballerizas
FROM j;

-- §3 Concentración (patrón; se corrió por separado para entrenadores,
--    propietarios y caballerizas)
WITH r6 AS (
  SELECT i.entrenador_id AS k FROM inscripciones i
  JOIN carreras c ON c.id = i.carrera_id
  WHERE c.reunion_id = 'b02ca761-6f44-4720-86aa-a3c3099019ea'
    AND i.entrenador_id IS NOT NULL
), agg AS (SELECT k, count(*) n FROM r6 GROUP BY k),
cum AS (
  SELECT k, n, row_number() OVER (ORDER BY n DESC, k) rn,
         sum(n) OVER (ORDER BY n DESC, k ROWS UNBOUNDED PRECEDING) acum
  FROM agg
)
SELECT (SELECT count(*) FROM agg) AS entidades,
       (SELECT count(*) FROM agg WHERE n = 1) AS cola_larga,
       (SELECT min(rn) FROM cum WHERE acum >= 0.80 * 125) AS cuentas_80pct;

-- §4 Contacto y duplicados
SELECT 'propietarios', count(*),
       count(*) FILTER (WHERE email IS NOT NULL AND btrim(email) <> ''),
       count(*) FILTER (WHERE telefono IS NOT NULL AND btrim(telefono) <> ''),
       count(*) FILTER (WHERE documento_nro IS NOT NULL AND btrim(documento_nro) <> '')
FROM propietarios;   -- idem profesionales

SELECT 'propietarios', lower(btrim(email)), count(*)
FROM propietarios WHERE email IS NOT NULL AND btrim(email) <> ''
GROUP BY 2 HAVING count(*) > 1;   -- idem profesionales y cruce entre ambas

SELECT t.relname, i.relname, pg_get_indexdef(i.oid)
FROM pg_index x JOIN pg_class t ON t.oid = x.indrelid
                JOIN pg_class i ON i.oid = x.indexrelid
WHERE t.relname IN ('propietarios','profesionales','usuarios') AND x.indisunique;

-- §5 spcs.entrenador_id
SELECT count(*) AS total, count(entrenador_id) AS con_entrenador,
       count(caballeriza_id) AS con_caballeriza
FROM spcs;
```
